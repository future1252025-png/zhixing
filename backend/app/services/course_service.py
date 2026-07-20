from __future__ import annotations

from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import BusinessError
from app.models import Building, Course
from app.schemas.course import CourseCreate, CourseUpdate, parse_course_time
from app.services.course_policy import (
    CourseValue,
    detect_conflicts,
    location_requires_review,
    validate_time_range,
)
from app.services.semester_service import get_setting
from app.services.week_rule import WeekExpressionError, normalize_weeks


CourseSourceKind = Literal["manual", "import"]


def building_exists(session: Session, building_id: int) -> bool:
    return session.get(Building, building_id) is not None


def list_courses(session: Session, user_id: int) -> list[Course]:
    return list(session.scalars(select(Course).where(Course.user_id == user_id).order_by(Course.weekday.asc(), Course.start_time.asc(), Course.id.asc())).all())


def get_course_for_user(session: Session, course_id: int, user_id: int) -> Course | None:
    return session.scalar(select(Course).where(Course.id == course_id, Course.user_id == user_id))


def add_course(session: Session, *, user_id: int, payload: CourseCreate, source_kind: CourseSourceKind = "manual") -> Course:
    if source_kind not in {"manual", "import"}:
        raise ValueError("source_kind must be manual or import")
    values = payload.model_dump()
    values["weeks"] = _validate_course_values(session, user_id, values, course_id=None)
    course = Course(user_id=user_id, source_kind=source_kind, **values)
    session.add(course)
    session.flush()
    return course


def create_course(session: Session, user_id: int, payload: CourseCreate) -> Course:
    """Backward-compatible service name; callers own the transaction."""
    return add_course(session, user_id=user_id, payload=payload)


def update_course(session: Session, course: Course, payload: CourseUpdate) -> Course:
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
    values["weeks"] = _validate_course_values(session, course.user_id, values, course_id=course.id)
    for field, value in values.items():
        setattr(course, field, value)
    session.add(course)
    session.flush()
    return course


def delete_course(session: Session, course: Course) -> None:
    session.delete(course)
    session.flush()


def _validate_course_values(session: Session, user_id: int, values: dict[str, object], *, course_id: int | None) -> str:
    setting = get_setting(session, user_id)
    if setting is None:
        raise BusinessError(409, "semester_unconfigured", "Semester is not configured")
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
        normalized_weeks = normalize_weeks(_required_str(values, "weeks"), max_week=setting.total_weeks)
        candidate = CourseValue(
            id=course_id,
            course_name=_required_str(values, "course_name"),
            weekday=_required_int(values, "weekday"),
            start_time=start_time,
            end_time=end_time,
            weeks=normalized_weeks,
        )
        conflicts = detect_conflicts(candidate, [_course_value(item) for item in list_courses(session, user_id)], max_week=setting.total_weeks)
    except WeekExpressionError as exc:
        raise BusinessError(422, "invalid_course_weeks", str(exc), fields=["weeks"], details={"max_week": setting.total_weeks}) from exc
    if conflicts:
        raise BusinessError(
            409,
            "course_conflict",
            "该时间与已有课程冲突",
            fields=["weekday", "start_time", "end_time", "weeks"],
            details={"conflicts": [{"course_id": conflict.course_id, "course_name": conflict.course_name, "overlap_weeks": conflict.overlap_weeks} for conflict in conflicts]},
        )
    return normalized_weeks


def _course_value(course: Course) -> CourseValue:
    return CourseValue(
        id=course.id,
        course_name=course.course_name,
        weekday=course.weekday,
        start_time=parse_course_time(course.start_time),
        end_time=parse_course_time(course.end_time),
        weeks=course.weeks,
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
