from __future__ import annotations

import asyncio
import json

import pytest

from app.core.errors import BusinessError
from app.main import business_error_handler
from app.schemas.error import BusinessErrorResponse
from app.services.course_policy import (
    CourseValue,
    detect_conflicts,
    location_requires_review,
    time_ranges_overlap,
)
from app.services.week_rule import WeekExpressionError


def course(course_id: int, **changes: object) -> CourseValue:
    values: dict[str, object] = {
        "id": course_id,
        "course_name": f"Course {course_id}",
        "weekday": 1,
        "start_time": "08:00",
        "end_time": "09:40",
        "weeks": "1-16",
    }
    values.update(changes)
    return CourseValue(**values)


def test_time_ranges_touching_at_an_endpoint_do_not_overlap() -> None:
    assert time_ranges_overlap("08:00", "09:40", "09:40", "11:20") is False


def test_detect_conflicts_returns_sorted_intersection_weeks() -> None:
    conflicts = detect_conflicts(
        course(1, weeks="1-8"),
        [course(2, weeks="2-10")],
        max_week=20,
    )

    assert [conflict.course_id for conflict in conflicts] == [2]
    assert conflicts[0].overlap_weeks == [2, 3, 4, 5, 6, 7, 8]


def test_detect_conflicts_ignores_disjoint_parity_weeks() -> None:
    assert detect_conflicts(
        course(1, weeks="1-16(单)"),
        [course(2, weeks="1-16(双)")],
        max_week=20,
    ) == []


def test_detect_conflicts_ignores_different_weekdays_and_candidate_itself() -> None:
    assert detect_conflicts(
        course(1),
        [course(1), course(2, weekday=2)],
        max_week=20,
    ) == []


def test_detect_conflicts_are_deterministic() -> None:
    conflicts = detect_conflicts(
        course(10),
        [course(3, course_name="Zeta"), course(2, course_name="Alpha")],
        max_week=20,
    )

    assert [(item.course_id, item.course_name) for item in conflicts] == [
        (2, "Alpha"),
        (3, "Zeta"),
    ]


def test_detect_conflicts_propagates_invalid_week_expression() -> None:
    with pytest.raises(WeekExpressionError):
        detect_conflicts(course(1, weeks="21"), [course(2)], max_week=20)


@pytest.mark.parametrize("room_name", ["待确认教室", " 待确认 ", "未知", "暂无", "待确认教室 "])
def test_location_requires_review_recognizes_legacy_placeholder_variations(room_name: str) -> None:
    assert location_requires_review(room_name) is True


def test_business_error_handler_uses_the_top_level_contract() -> None:
    error = BusinessError(
        409,
        "course_conflict",
        "Course conflicts with an existing course",
        fields=["weekday", "start_time", "end_time", "weeks"],
        details={"conflicts": [{"course_id": 7, "course_name": "Physics", "overlap_weeks": [2]}]},
    )

    response = asyncio.run(business_error_handler(None, error))

    assert response.status_code == 409
    assert json.loads(response.body) == BusinessErrorResponse(
        code="course_conflict",
        message="Course conflicts with an existing course",
        fields=["weekday", "start_time", "end_time", "weeks"],
        details={"conflicts": [{"course_id": 7, "course_name": "Physics", "overlap_weeks": [2]}]},
    ).model_dump()
