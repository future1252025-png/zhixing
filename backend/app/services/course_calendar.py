"""Resolve recurring courses and dated exceptions before conflict checks."""
from datetime import date

from app.models import Course, SemesterSetting
from app.services.week_rule import parse_weeks


def course_times_on(course, day: date, setting) -> tuple[str | None, str | None]:
    if not course.makeup:
        for rule in getattr(setting, "time_rules", None) or []:
            if (rule["start_date"] <= day.isoformat()
                    and (not rule.get("end_date") or day.isoformat() <= rule["end_date"])
                    and course.start_time == rule["from_start"] and course.end_time == rule["from_end"]):
                return rule["start_time"], rule["end_time"]
    return course.start_time, course.end_time


def effective_weeks(course: Course, setting: SemesterSetting | None, courses: list[Course], max_week: int) -> set[int]:
    if course.makeup:
        if setting is None:
            return set()
        day = date.fromisoformat(course.makeup["date"])
        week = (day - setting.start_date).days // 7 + 1
        return {week} if 1 <= week <= max_week else set()
    weeks = set(parse_weeks(course.weeks, max_week=max_week))
    if setting is not None:
        for other in courses:
            info = other.makeup
            if info and info.get("cancel_source") and info["source_course_id"] == course.id and info.get("source_date"):
                day = date.fromisoformat(info["source_date"])
                if day.isoweekday() == course.weekday:
                    weeks.discard((day - setting.start_date).days // 7 + 1)
    return weeks


def occurs_on(course: Course, day: date, setting: SemesterSetting | None, courses: list[Course]) -> bool:
    if course.makeup:
        return course.makeup["date"] == day.isoformat()
    if setting is None or day.isoweekday() != course.weekday:
        return False
    week = (day - setting.start_date).days // 7 + 1
    return week in effective_weeks(course, setting, courses, setting.total_weeks)
