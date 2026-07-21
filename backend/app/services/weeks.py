"""Teaching-week helpers aligned with frontend `utils/course.ts`."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta


WEEK_RANGE_RE = re.compile(r"^(\d{1,2})-(\d{1,2})$")
SECTION_TAG_RE = re.compile(r"\[[^\]]+节\]")
PAREN_WEEK_RE = re.compile(r"\(周\)")
BARE_WEEK_RE = re.compile(r"周")
ODD_EVEN_RE = re.compile(r"\((单|双)\)")


def normalize_weeks_expression(weeks: str | None) -> str:
    text = weeks or ""
    text = SECTION_TAG_RE.sub("", text)
    text = PAREN_WEEK_RE.sub("", text)
    text = BARE_WEEK_RE.sub("", text)
    return text.strip()


def parse_week_numbers(weeks: str) -> set[int]:
    values: set[int] = set()
    for part in weeks.split(","):
        text = part.strip()
        if not text:
            continue
        range_match = WEEK_RANGE_RE.match(text)
        if range_match:
            start = int(range_match.group(1))
            end = int(range_match.group(2))
            if start > end:
                start, end = end, start
            values.update(range(start, end + 1))
            continue
        if text.isdigit():
            values.add(int(text))
    return values


def is_course_active_in_week(weeks: str | None, teaching_week: int | None) -> bool:
    """Return whether a course runs in the given teaching week.

    - Empty / missing weeks → always active (same as frontend).
    - teaching_week is None → cannot filter, treat as active.
    """
    if teaching_week is None:
        return True
    if teaching_week <= 0:
        return False

    normalized = normalize_weeks_expression(weeks)
    if not normalized:
        return True

    odd_only = "(单)" in normalized
    even_only = "(双)" in normalized
    week_text = ODD_EVEN_RE.sub("", normalized)
    week_numbers = parse_week_numbers(week_text)
    if not week_numbers:
        return True
    if teaching_week not in week_numbers:
        return False
    if odd_only and teaching_week % 2 == 0:
        return False
    if even_only and teaching_week % 2 != 0:
        return False
    return True


def monday_of(day: date) -> date:
    return day - timedelta(days=day.isoweekday() - 1)


def teaching_week_from_semester_start(
    target_date: date,
    semester_start: date,
) -> int | None:
    """Week 1 is the calendar week that contains semester_start (Monday-based)."""
    start_monday = monday_of(semester_start)
    target_monday = monday_of(target_date)
    delta_days = (target_monday - start_monday).days
    if delta_days < 0:
        return None
    return delta_days // 7 + 1


def teaching_week_from_override(
    target_date: date,
    today: date,
    current_week: int,
) -> int:
    """Project an explicit current teaching week onto a target date."""
    today_monday = monday_of(today)
    target_monday = monday_of(target_date)
    week_diff = (target_monday - today_monday).days // 7
    return current_week + week_diff


def resolve_teaching_week(
    *,
    target_date: date,
    now: datetime,
    current_week: int | None = None,
    semester_start: date | None = None,
) -> int | None:
    if current_week is not None:
        return teaching_week_from_override(target_date, now.date(), current_week)
    if semester_start is not None:
        return teaching_week_from_semester_start(target_date, semester_start)
    return None


def parse_semester_start(value: str | None) -> date | None:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None
