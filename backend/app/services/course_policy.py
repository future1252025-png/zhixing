"""Pure validation and conflict policy for course values."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import time

from app.services.week_rule import parse_weeks


_LOCATION_REVIEW_NAMES = frozenset(
    name.casefold() for name in {"待确认教室", "待确认", "未知", "暂无"}
)


@dataclass(frozen=True)
class CourseValue:
    id: int | None
    course_name: str
    weekday: int
    start_time: time
    end_time: time
    weeks: str

    def __post_init__(self) -> None:
        _require_time(self.start_time)
        _require_time(self.end_time)


@dataclass(frozen=True)
class CourseConflict:
    course_id: int
    course_name: str
    overlap_weeks: tuple[int, ...]


def location_requires_review(room_name: str) -> bool:
    return room_name.strip().casefold() in _LOCATION_REVIEW_NAMES


def time_ranges_overlap(
    a_start: time,
    a_end: time,
    b_start: time,
    b_end: time,
) -> bool:
    return (
        _require_time(a_start) < _require_time(b_end)
        and _require_time(b_start) < _require_time(a_end)
    )


def validate_time_range(start_time: time, end_time: time) -> None:
    if _require_time(start_time) >= _require_time(end_time):
        raise ValueError("下课时间必须晚于上课时间")


def detect_conflicts(
    candidate: CourseValue,
    courses: list[CourseValue],
    *,
    max_week: int,
) -> list[CourseConflict]:
    validate_time_range(candidate.start_time, candidate.end_time)
    candidate_weeks = parse_weeks(candidate.weeks, max_week=max_week)
    conflicts: list[CourseConflict] = []

    for course in courses:
        if candidate.id is not None and course.id == candidate.id:
            continue
        if course.weekday != candidate.weekday:
            continue
        validate_time_range(course.start_time, course.end_time)
        if not time_ranges_overlap(
            candidate.start_time,
            candidate.end_time,
            course.start_time,
            course.end_time,
        ):
            continue
        overlap_weeks = tuple(sorted(candidate_weeks & parse_weeks(course.weeks, max_week=max_week)))
        if overlap_weeks:
            conflicts.append(
                CourseConflict(
                    course_id=_required_course_id(course),
                    course_name=course.course_name,
                    overlap_weeks=overlap_weeks,
                )
            )

    return sorted(conflicts, key=lambda conflict: (conflict.course_id, conflict.course_name))


def _require_time(value: time) -> time:
    if not isinstance(value, time):
        raise TypeError("course policy time values must be datetime.time")
    return value


def _required_course_id(course: CourseValue) -> int:
    if course.id is None:
        raise ValueError("existing courses must have an id")
    return course.id
