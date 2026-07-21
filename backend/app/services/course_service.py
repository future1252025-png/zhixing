from __future__ import annotations

from collections.abc import Sequence
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import BusinessError
from app.models import Building, Course
from app.schemas.course import CourseCreate, CourseUpdate, parse_course_time
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


CourseSourceKind = Literal["manual", "import"]


def building_exists(session: Session, building_id: int) -> bool:
    return session.get(Building, building_id) is not None


def list_courses(session: Session, user_id: int) -> list[Course]:
    statement = (
        select(Course)
        .options(selectinload(Course.building))
        .where(Course.user_id == user_id)
        .order_by(Course.weekday.asc(), Course.start_time.asc(), Course.id.asc())
    )
    return list(session.scalars(statement).all())


def get_course_for_user(session: Session, course_id: int, user_id: int) -> Course | None:
    return session.scalar(
        select(Course)
        .options(selectinload(Course.building))
        .where(Course.id == course_id, Course.user_id == user_id)
    )


def add_course(
    session: Session,
    *,
    user_id: int,
    payload: CourseCreate,
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
    if setting is None:
        raise BusinessError(409, "semester_unconfigured", "Semester is not configured")
    values = payload.model_dump()
    values["weeks"] = _validate_course_values(session, user_id, values, setting.total_weeks)
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
    entries: Sequence[tuple[str, CourseCreate]],
    guard: UserMutationGuard,
) -> list[tuple[str, CourseCreate]]:
    """Validate a complete batch before its first course row is inserted."""

    require_user_mutation_guard(session, user_id, guard)
    setting = get_setting(session, user_id)
    if setting is None:
        raise BusinessError(409, "semester_unconfigured", "Semester is not configured")

    existing_values = _existing_course_values(
        session,
        user_id,
        setting.total_weeks,
        excluded_course_id=None,
        allow_other_invalid=False,
    )
    comparison_values = list(existing_values)
    batch_row_refs: dict[int, str] = {}
    validated: list[tuple[str, CourseCreate]] = []

    for index, (row_ref, payload) in enumerate(entries, start=1):
        synthetic_id = -index
        values = payload.model_dump()
        normalized_weeks, candidate = _validated_course_value(
            session,
            values,
            setting.total_weeks,
            candidate_id=synthetic_id,
        )
        conflicts = detect_conflicts(
            candidate,
            comparison_values,
            max_week=setting.total_weeks,
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
        batch_row_refs[synthetic_id] = row_ref
        comparison_values.append(candidate)

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
        raise BusinessError(409, "semester_unconfigured", "Semester is not configured")
    course = get_course_for_user(session, course_id, user_id)
    if course is None:
        raise BusinessError(404, "course_not_found", "Course not found")
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
        raise BusinessError(404, "course_not_found", "Course not found")
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
) -> str:
    normalized_weeks, candidate = _validated_course_value(
        session,
        values,
        max_week,
        candidate_id=excluded_course_id,
    )
    conflicts = detect_conflicts(
        candidate,
        _existing_course_values(session, user_id, max_week, excluded_course_id, allow_other_invalid),
        max_week=max_week,
    )
    if conflicts:
        raise _conflict_error(conflicts)
    return normalized_weeks


def _validated_course_value(
    session: Session,
    values: dict[str, object],
    max_week: int,
    *,
    candidate_id: int | None,
) -> tuple[str, CourseValue]:
    if not building_exists(session, _required_int(values, "building_id")):
        raise BusinessError(404, "building_not_found", "Building not found", fields=["building_id"])
    room_name = _required_str(values, "room_name")
    if location_requires_review(room_name):
        raise BusinessError(422, "invalid_room_name", "Room name must be a confirmed location", fields=["room_name"])
    try:
        start_time = parse_course_time(_required_str(values, "start_time"))
        end_time = parse_course_time(_required_str(values, "end_time"))
        validate_time_range(start_time, end_time)
    except ValueError as exc:
        raise BusinessError(422, "invalid_course_time", str(exc), fields=["start_time", "end_time"]) from exc
    try:
        normalized_weeks = normalize_weeks(_required_str(values, "weeks"), max_week=max_week)
    except WeekExpressionError as exc:
        raise BusinessError(422, "invalid_course_weeks", str(exc), fields=["weeks"], details={"max_week": max_week}) from exc
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
) -> list[CourseValue]:
    values: list[CourseValue] = []
    courses = session.scalars(
        select(Course)
        .where(Course.user_id == user_id)
        .order_by(Course.weekday.asc(), Course.start_time.asc(), Course.id.asc())
    ).all()
    for course in courses:
        if course.id == excluded_course_id:
            continue
        issues: list[dict[str, str]] = []
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
                "Existing course data must be repaired before changing the schedule",
                details={"course_id": course.id, "course_name": course.course_name, "issues": issues},
            )
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
