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
    start_time: str
    end_time: str
    weeks: str


@dataclass(frozen=True)
class CourseConflict:
    course_id: int
    course_name: str
    overlap_weeks: list[int]


def location_requires_review(room_name: str) -> bool:
    return room_name.strip().casefold() in _LOCATION_REVIEW_NAMES


def time_ranges_overlap(
    a_start: str,
    a_end: str,
    b_start: str,
    b_end: str,
) -> bool:
    return (
        _parse_time(a_start) < _parse_time(b_end)
        and _parse_time(b_start) < _parse_time(a_end)
    )


def validate_time_range(start_time: str, end_time: str) -> None:
    if _parse_time(start_time) >= _parse_time(end_time):
        raise ValueError("end_time must be later than start_time")


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
        overlap_weeks = sorted(candidate_weeks & parse_weeks(course.weeks, max_week=max_week))
        if overlap_weeks:
            conflicts.append(
                CourseConflict(
                    course_id=_required_course_id(course),
                    course_name=course.course_name,
                    overlap_weeks=overlap_weeks,
                )
            )

    return sorted(conflicts, key=lambda conflict: (conflict.course_id, conflict.course_name))


def _parse_time(value: str) -> time:
    try:
        hour_text, minute_text = value.split(":")
        hour = int(hour_text)
        minute = int(minute_text)
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError("Time must use HH:MM format") from exc
    if len(value) != 5 or not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise ValueError("Time must use HH:MM format")
    return time(hour=hour, minute=minute)


def _required_course_id(course: CourseValue) -> int:
    if course.id is None:
        raise ValueError("existing courses must have an id")
    return course.id
