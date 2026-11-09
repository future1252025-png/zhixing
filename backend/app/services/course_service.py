from __future__ import annotations

from collections.abc import Sequence
from datetime import timedelta
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core import errors
from app.core.errors import BusinessError
from app.models import Building, Course
from app.schemas.course import (
    CourseCreate,
    CourseImportCreate,
    CourseUpdate,
    parse_course_time,
)
from app.services.course_policy import (
    CourseConflict,
    CourseValue,
    detect_conflicts,
    location_requires_review,
    validate_time_range,
)
from app.services.semester_service import get_setting
from app.services.user_mutation_guard import (
    UserMutationGuard,
    acquire_user_mutation_guard,
    require_user_mutation_guard,
)
from app.services.week_rule import WeekExpressionError, normalize_weeks
from app.services.course_calendar import effective_weeks


CourseSourceKind = Literal["manual", "import"]
CourseWritePayload = CourseCreate | CourseImportCreate
UNCONFIGURED_IMPORT_MAX_WEEKS = 30


def building_exists(session: Session, building_id: int) -> bool:
    return session.get(Building, building_id) is not None


def list_courses(session: Session, user_id: int) -> list[Course]:
    statement = (
        select(Course)
        .options(selectinload(Course.building), selectinload(Course.import_source))
        .where(Course.user_id == user_id)
        .order_by(Course.weekday.asc(), Course.start_time.asc(), Course.id.asc())
    )
    return list(session.scalars(statement).all())


def get_course_for_user(session: Session, course_id: int, user_id: int) -> Course | None:
    return session.scalar(
        select(Course)
        .options(selectinload(Course.building), selectinload(Course.import_source))
        .where(Course.id == course_id, Course.user_id == user_id)
    )


def add_course(
    session: Session,
    *,
    user_id: int,
    payload: CourseWritePayload,
    source_kind: CourseSourceKind = "manual",
    guard: UserMutationGuard | None = None,
) -> Course:
    if source_kind not in {"manual", "import"}:
        raise ValueError("source_kind must be manual or import")
    if guard is None:
        guard = acquire_user_mutation_guard(session, user_id)
    else:
        require_user_mutation_guard(session, user_id, guard)
    setting = get_setting(session, user_id)
    if setting is None and source_kind == "manual":
        raise BusinessError(409, "semester_unconfigured", errors.SEMESTER_UNCONFIGURED)
    max_week = (
        setting.total_weeks
        if setting is not None
        else UNCONFIGURED_IMPORT_MAX_WEEKS
    )
    values = payload.model_dump()
    values["weeks"] = _validate_course_values(
        session,
        user_id,
        values,
        max_week,
        require_location=source_kind == "manual",
        allow_incomplete_schedule=source_kind == "import",
    )
    course = Course(user_id=user_id, source_kind=source_kind, **values)
    session.add(course)
    session.flush()
    return course


def create_course(session: Session, user_id: int, payload: CourseCreate) -> Course:
    return add_course(session, user_id=user_id, payload=payload)


def validate_course_batch(
    session: Session,
    *,
    user_id: int,
    entries: Sequence[tuple[str, CourseWritePayload]],
    guard: UserMutationGuard,
    require_location: bool = True,
    replace_existing: bool = False,
) -> list[tuple[str, CourseWritePayload]]:
    """Validate a complete batch before its first course row is inserted."""

    require_user_mutation_guard(session, user_id, guard)
    setting = get_setting(session, user_id)
    max_week = (
        setting.total_weeks
        if setting is not None
        else UNCONFIGURED_IMPORT_MAX_WEEKS
    )

    existing_values = _existing_course_values(
        session,
        user_id,
        max_week,
        excluded_course_id=None,
        allow_other_invalid=False,
        makeups_only=replace_existing,
    )
    comparison_values = list(existing_values)
    batch_row_refs: dict[int, str] = {}
    validated: list[tuple[str, CourseWritePayload]] = []

    for index, (row_ref, payload) in enumerate(entries, start=1):
        synthetic_id = -index
        values = payload.model_dump()
        normalized_weeks, candidate = _validated_course_value(
            session,
            values,
            max_week,
            candidate_id=synthetic_id,
            require_location=require_location,
            allow_incomplete_schedule=isinstance(payload, CourseImportCreate),
        )
        conflicts = (
            detect_conflicts(
                candidate,
                comparison_values,
                max_week=max_week,
            )
            if candidate is not None and not getattr(setting, "time_rules", None)
            else []
        )
        if conflicts:
            details: list[dict[str, object]] = []
            for conflict in conflicts:
                item: dict[str, object] = {
                    "row_ref": row_ref,
                    "course_name": payload.course_name,
                    "overlap_weeks": list(conflict.overlap_weeks),
                }
                conflicting_row_ref = batch_row_refs.get(conflict.course_id)
                if conflicting_row_ref is None:
                    item["course_id"] = conflict.course_id
                    item["conflicting_course_name"] = conflict.course_name
                else:
                    item["conflicting_row_ref"] = conflicting_row_ref
                    item["conflicting_course_name"] = conflict.course_name
                details.append(item)
            raise BusinessError(
                409,
                "course_conflict",
                "导入课程存在时间冲突",
                fields=["weekday", "start_time", "end_time", "weeks"],
                details={"conflicts": details},
            )

        normalized_payload = payload.model_copy(update={"weeks": normalized_weeks})
        validated.append((row_ref, normalized_payload))
        if candidate is not None:
            batch_row_refs[synthetic_id] = row_ref
            comparison_values.append(candidate)

    if getattr(setting, "time_rules", None):
        rows = [row for row in list_courses(session, user_id) if not replace_existing or row.makeup]
        rows.extend(Course(id=-index, user_id=user_id, **payload.model_dump())
                    for index, (_, payload) in enumerate(validated, 1))
        _validate_dated_times(rows, setting)
    return validated


def update_course(
    session: Session,
    *,
    user_id: int,
    course_id: int,
    payload: CourseUpdate,
    guard: UserMutationGuard | None = None,
) -> Course:
    if guard is None:
        guard = acquire_user_mutation_guard(session, user_id)
    else:
        require_user_mutation_guard(session, user_id, guard)
    setting = get_setting(session, user_id)
    if setting is None:
        raise BusinessError(409, "semester_unconfigured", errors.SEMESTER_UNCONFIGURED)
    course = get_course_for_user(session, course_id, user_id)
    if course is None:
        raise BusinessError(404, "course_not_found", errors.COURSE_NOT_FOUND)
    if course.makeup:
        raise BusinessError(422, "makeup_editor_required", "请使用补课编辑入口，仅修改这次安排")
    repairing_legacy_course = _course_has_integrity_issues(course, setting.total_weeks)
    changes = payload.model_dump(exclude_unset=True)
    values = {
        "course_name": changes.get("course_name", course.course_name),
        "weekday": changes.get("weekday", course.weekday),
        "start_time": changes.get("start_time", course.start_time),
        "end_time": changes.get("end_time", course.end_time),
        "building_id": changes.get("building_id", course.building_id),
        "room_name": changes.get("room_name", course.room_name),
        "teacher": changes.get("teacher", course.teacher),
        "weeks": changes.get("weeks", course.weeks),
    }
    values["weeks"] = _validate_course_values(
        session,
        user_id,
        values,
        setting.total_weeks,
        excluded_course_id=course.id,
        allow_other_invalid=repairing_legacy_course,
        allow_incomplete_schedule=course.source_kind == "import",
    )
    for field, value in values.items():
        setattr(course, field, value)
    session.add(course)
    session.flush()
    return course


def delete_course(
    session: Session,
    *,
    user_id: int,
    course_id: int,
    guard: UserMutationGuard | None = None,
) -> None:
    if guard is None:
        acquire_user_mutation_guard(session, user_id)
    else:
        require_user_mutation_guard(session, user_id, guard)
    course = get_course_for_user(session, course_id, user_id)
    if course is None:
        raise BusinessError(404, "course_not_found", errors.COURSE_NOT_FOUND)
    if course.makeup:
        from app.services.course_makeup_service import validate_makeup_removal
        validate_makeup_removal(session, user_id, [course])
    session.delete(course)
    session.flush()


def _validate_course_values(
    session: Session,
    user_id: int,
    values: dict[str, object],
    max_week: int,
    *,
    excluded_course_id: int | None = None,
    allow_other_invalid: bool = False,
    require_location: bool = True,
    allow_incomplete_schedule: bool = False,
) -> str:
    normalized_weeks, candidate = _validated_course_value(
        session,
        values,
        max_week,
        candidate_id=excluded_course_id,
        require_location=require_location,
        allow_incomplete_schedule=allow_incomplete_schedule,
    )
    setting = get_setting(session, user_id)
    if getattr(setting, "time_rules", None):
        rows = [row for row in list_courses(session, user_id) if row.id != excluded_course_id]
        rows.append(Course(id=excluded_course_id or -1, user_id=user_id, **{**values, "weeks": normalized_weeks}))
        _validate_dated_times(rows, setting)
        return normalized_weeks
    if candidate is not None and excluded_course_id is not None:
        from dataclasses import replace
        source = Course(id=excluded_course_id, weekday=candidate.weekday, weeks=normalized_weeks)
        weeks = effective_weeks(source, get_setting(session, user_id), list_courses(session, user_id), max_week)
        candidate = replace(candidate, weeks=",".join(map(str, sorted(weeks)))) if weeks else None
    conflicts = (
        detect_conflicts(
            candidate,
            _existing_course_values(
                session,
                user_id,
                max_week,
                excluded_course_id,
                allow_other_invalid,
            ),
            max_week=max_week,
        )
        if candidate is not None
        else []
    )
    if conflicts:
        raise _conflict_error(conflicts)
    return normalized_weeks


def _validate_dated_times(courses, setting):
    from app.services.course_makeup_service import validate_dates
    dates = {setting.start_date + timedelta(days=day) for day in range(setting.total_weeks * 7)}
    validate_dates(courses, setting, dates)


def _validated_course_value(
    session: Session,
    values: dict[str, object],
    max_week: int,
    *,
    candidate_id: int | None,
    require_location: bool = True,
    allow_incomplete_schedule: bool = False,
) -> tuple[str, CourseValue | None]:
    if require_location:
        if not building_exists(session, _required_int(values, "building_id")):
            raise BusinessError(
                404,
                "building_not_found",
                errors.BUILDING_NOT_FOUND,
                fields=["building_id"],
            )
        room_name = _required_str(values, "room_name")
        if location_requires_review(room_name):
            raise BusinessError(
                422,
                "invalid_room_name",
                errors.ROOM_NAME_REQUIRES_CONFIRMATION,
                fields=["room_name"],
            )
    try:
        normalized_weeks = normalize_weeks(_required_str(values, "weeks"), max_week=max_week)
    except WeekExpressionError as exc:
        raise BusinessError(422, "invalid_course_weeks", str(exc), fields=["weeks"], details={"max_week": max_week}) from exc

    raw_start_time = values.get("start_time")
    raw_end_time = values.get("end_time")
    if allow_incomplete_schedule and raw_start_time is None and raw_end_time is None:
        return normalized_weeks, None
    try:
        start_time = parse_course_time(_required_str(values, "start_time"))
        end_time = parse_course_time(_required_str(values, "end_time"))
        validate_time_range(start_time, end_time)
    except ValueError as exc:
        raise BusinessError(422, "invalid_course_time", str(exc), fields=["start_time", "end_time"]) from exc
    candidate = CourseValue(
        id=candidate_id,
        course_name=_required_str(values, "course_name"),
        weekday=_required_int(values, "weekday"),
        start_time=start_time,
        end_time=end_time,
        weeks=normalized_weeks,
    )
    return normalized_weeks, candidate


def _existing_course_values(
    session: Session,
    user_id: int,
    max_week: int,
    excluded_course_id: int | None,
    allow_other_invalid: bool,
    makeups_only: bool = False,
) -> list[CourseValue]:
    values: list[CourseValue] = []
    courses = session.scalars(
        select(Course)
        .where(Course.user_id == user_id)
        .order_by(Course.weekday.asc(), Course.start_time.asc(), Course.id.asc())
    ).all()
    setting = get_setting(session, user_id)
    for course in courses:
        if makeups_only and not course.makeup:
            continue
        if course.id == excluded_course_id:
            continue
        if course.start_time is None and course.end_time is None:
            continue
        issues: list[dict[str, str]] = []
        if course.start_time is None or course.end_time is None:
            issues.append({"field": "time", "code": "invalid_time_range"})
            start_time = None
            end_time = None
        else:
            try:
                start_time = parse_course_time(course.start_time)
                end_time = parse_course_time(course.end_time)
                validate_time_range(start_time, end_time)
            except ValueError:
                issues.append({"field": "time", "code": "invalid_time_range"})
        try:
            weeks = normalize_weeks(course.weeks, max_week=max_week)
        except WeekExpressionError:
            issues.append({"field": "weeks", "code": "invalid_weeks"})
        if issues:
            if allow_other_invalid:
                continue
            raise BusinessError(
                409,
                "course_data_invalid",
                errors.COURSE_DATA_REQUIRES_REPAIR,
                details={"course_id": course.id, "course_name": course.course_name, "issues": issues},
            )
        active_weeks = effective_weeks(course, setting, list(courses), max_week)
        if not active_weeks:
            continue
        weeks = ",".join(map(str, sorted(active_weeks)))
        values.append(
            CourseValue(
                id=course.id,
                course_name=course.course_name,
                weekday=course.weekday,
                start_time=start_time,
                end_time=end_time,
                weeks=weeks,
            )
        )
    return values


def _course_has_integrity_issues(course: Course, max_week: int) -> bool:
    if course.start_time is None and course.end_time is None:
        try:
            normalize_weeks(course.weeks, max_week=max_week)
        except WeekExpressionError:
            return True
        return False
    if course.start_time is None or course.end_time is None:
        return True
    try:
        validate_time_range(parse_course_time(course.start_time), parse_course_time(course.end_time))
        normalize_weeks(course.weeks, max_week=max_week)
    except (ValueError, WeekExpressionError):
        return True
    return False


def _conflict_error(conflicts: list[CourseConflict]) -> BusinessError:
    return BusinessError(
        409,
        "course_conflict",
        "该时间与已有课程冲突",
        fields=["weekday", "start_time", "end_time", "weeks"],
        details={
            "conflicts": [
                {
                    "course_id": conflict.course_id,
                    "course_name": conflict.course_name,
                    "overlap_weeks": list(conflict.overlap_weeks),
                }
                for conflict in conflicts
            ]
        },
    )


def _required_str(values: dict[str, object], field: str) -> str:
    value = values[field]
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    return value


def _required_int(values: dict[str, object], field: str) -> int:
    value = values[field]
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field} must be an integer")
    return value
