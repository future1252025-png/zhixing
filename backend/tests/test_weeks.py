from datetime import date, datetime

from app.services.weeks import (
    is_course_active_in_week,
    parse_semester_start,
    resolve_teaching_week,
    teaching_week_from_semester_start,
)


def test_is_course_active_matches_frontend_expressions() -> None:
    assert is_course_active_in_week("1-16", 9) is True
    assert is_course_active_in_week("1-16(周)[01-02节]", 17) is False
    assert is_course_active_in_week("2,4,6,8,10,12,14,16", 10) is True
    assert is_course_active_in_week("2,4,6,8,10,12,14,16", 11) is False
    assert is_course_active_in_week("1-16(单)", 5) is True
    assert is_course_active_in_week("1-16(单)", 6) is False
    assert is_course_active_in_week("1-16(双)", 6) is True
    assert is_course_active_in_week("", 20) is True
    assert is_course_active_in_week(None, 3) is True
    assert is_course_active_in_week("9-16", None) is True


def test_teaching_week_from_semester_start_is_monday_based() -> None:
    # 2026-09-07 is Monday → week 1
    assert teaching_week_from_semester_start(date(2026, 9, 7), date(2026, 9, 7)) == 1
    assert teaching_week_from_semester_start(date(2026, 9, 13), date(2026, 9, 7)) == 1
    assert teaching_week_from_semester_start(date(2026, 9, 14), date(2026, 9, 7)) == 2
    assert teaching_week_from_semester_start(date(2026, 9, 1), date(2026, 9, 7)) is None


def test_resolve_teaching_week_override_projects_across_weeks() -> None:
    now = datetime(2026, 5, 29, 9, 0)  # Friday
    assert (
        resolve_teaching_week(
            target_date=date(2026, 5, 29),
            now=now,
            current_week=8,
        )
        == 8
    )
    assert (
        resolve_teaching_week(
            target_date=date(2026, 6, 1),  # next Monday
            now=now,
            current_week=8,
        )
        == 9
    )


def test_parse_semester_start() -> None:
    assert parse_semester_start("2026-09-07") == date(2026, 9, 7)
    assert parse_semester_start("bad") is None
    assert parse_semester_start(None) is None
