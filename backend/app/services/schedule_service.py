"""Departure suggestions constrained to the user's real current teaching week."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.clock import SHANGHAI_TZ, shanghai_today
from app.core.errors import BusinessError
from app.models import Building, Course, SemesterSetting
from app.schemas.course import parse_course_time
from app.schemas.schedule import (
    BuildingInfo,
    LocationInfo,
    NextCourseInfo,
    ScheduleSuggestionRequest,
    ScheduleSuggestionResponse,
    SuggestionStatus,
)
from app.services.course_policy import location_requires_review
from app.services.location_service import (
    DEFAULT_WALK_SPEED_M_PER_MIN,
    estimate_walk_minutes,
    haversine_distance_meters,
)
from app.services.semester_service import resolve_semester_state
from app.services.week_rule import WeekExpressionError, parse_weeks


DEFAULT_BUFFER_MINUTES = 10


@dataclass(frozen=True)
class NextCourseCandidate:
    course: Course
    starts_at: datetime
    teaching_week: int
    start_time: time


def _normalize_now(now: datetime) -> datetime:
    """Return an aware Shanghai instant without consulting the server timezone."""
    if now.tzinfo is None:
        return now.replace(tzinfo=SHANGHAI_TZ)
    return now.astimezone(SHANGHAI_TZ)


def _course_start_datetime(base_date: date, start_time: time) -> datetime:
    return datetime.combine(base_date, start_time, tzinfo=SHANGHAI_TZ)


def course_occurs_on(
    course: Course,
    *,
    target_date: date,
    start_date: date,
    total_weeks: int,
) -> bool:
    """Whether a valid course occurs on a date within the configured semester."""
    state = resolve_semester_state(
        start_date=start_date,
        total_weeks=total_weeks,
        today=target_date,
    )
    if state.status != "active" or state.current_week is None:
        return False
    return (
        course.weekday == target_date.isoweekday()
        and state.current_week in parse_weeks(course.weeks, max_week=total_weeks)
    )


def _get_active_semester(
    session: Session,
    user_id: int,
    now: datetime,
) -> tuple[SemesterSetting, int]:
    setting = session.scalar(
        select(SemesterSetting).where(SemesterSetting.user_id == user_id)
    )
    if setting is None:
        raise BusinessError(
            409,
            "semester_unconfigured",
            "请先设置学期开始日期和教学周数",
        )

    state = resolve_semester_state(
        start_date=setting.start_date,
        total_weeks=setting.total_weeks,
        today=shanghai_today(now),
    )
    if state.status != "active" or state.current_week is None:
        raise BusinessError(
            409,
            "semester_not_active",
            "当前日期不在已设置的教学周内",
            details={"semester_status": state.status},
        )
    return setting, state.current_week


def _course_data_error(course: Course, issues: list[str]) -> BusinessError:
    return BusinessError(
        409,
        "course_data_invalid",
        "课表中有无法识别的周次或时间，请先修复课程",
        details={"course_id": course.id, "issues": issues},
    )


def _parse_course_start_time(course: Course) -> time:
    try:
        return parse_course_time(course.start_time)
    except ValueError as error:
        raise _course_data_error(course, ["start_time"]) from error


def _validate_course_end_time(course: Course, start_time: time) -> None:
    try:
        end_time = parse_course_time(course.end_time)
    except ValueError as error:
        raise _course_data_error(course, ["end_time"]) from error
    if end_time <= start_time:
        raise _course_data_error(course, ["start_time", "end_time"])


def _missing_location_fields(course: Course) -> list[str]:
    missing: list[str] = []
    building = course.building
    if building is None or not building.name.strip():
        missing.append("building_id")
    if not course.room_name.strip() or location_requires_review(course.room_name):
        missing.append("room_name")
    return missing


def _location_is_incomplete(course: Course) -> bool:
    return bool(_missing_location_fields(course))


def _location_error(courses: list[Course]) -> BusinessError:
    ordered_courses = sorted(courses, key=lambda course: course.id)
    primary_course = ordered_courses[0]
    course_ids = [course.id for course in ordered_courses]
    course_details = [
        {
            "course_id": course.id,
            "course_name": course.course_name,
            "source_location": course.source_location,
            "missing_fields": _missing_location_fields(course),
        }
        for course in ordered_courses
    ]
    missing_fields = list(
        dict.fromkeys(
            field
            for course in ordered_courses
            for field in _missing_location_fields(course)
        )
    )
    return BusinessError(
        409,
        "course_location_incomplete",
        "下一节课的地点信息不完整，请先补全教学楼和教室",
        fields=missing_fields,
        details={
            "course_id": primary_course.id,
            "course_name": primary_course.course_name,
            "course_ids": course_ids,
            "source_location": primary_course.source_location,
            "missing_fields": course_details[0]["missing_fields"],
            "courses": course_details,
        },
    )


def find_next_course(
    session: Session,
    user_id: int,
    now: datetime,
) -> NextCourseCandidate | None:
    current = _normalize_now(now)
    # Course times have minute precision. Treat the whole displayed start
    # minute as current instead of skipping it because the clock has seconds.
    current_minute = current.replace(second=0, microsecond=0)
    setting, teaching_week = _get_active_semester(session, user_id, current)
    week_start = setting.start_date + timedelta(weeks=teaching_week - 1)
    week_end = week_start + timedelta(days=6)

    courses = list(
        session.scalars(
            select(Course)
            .options(selectinload(Course.building), selectinload(Course.import_source))
            .where(Course.user_id == user_id)
            .order_by(Course.start_time.asc(), Course.id.asc())
        ).all()
    )
    candidates: list[NextCourseCandidate] = []
    for course in courses:
        # An imported course may intentionally wait for its schedule time.
        # It remains visible in the timetable's pending section but cannot
        # participate in departure calculations yet.
        if course.start_time is None or course.end_time is None:
            continue
        target_date = week_start + timedelta(days=course.weekday - 1)
        if target_date < current.date() or target_date > week_end:
            continue
        try:
            occurs = course_occurs_on(
                course,
                target_date=target_date,
                start_date=setting.start_date,
                total_weeks=setting.total_weeks,
            )
        except WeekExpressionError as error:
            raise _course_data_error(course, ["weeks"]) from error
        if not occurs:
            continue
        start_time = _parse_course_start_time(course)
        starts_at = _course_start_datetime(target_date, start_time)
        if starts_at < current_minute:
            continue
        candidates.append(
            NextCourseCandidate(
                course=course,
                starts_at=starts_at,
                teaching_week=teaching_week,
                start_time=start_time,
            )
        )

    if not candidates:
        return None

    candidates.sort(key=lambda candidate: (candidate.starts_at, candidate.course.id))
    earliest_start = candidates[0].starts_at
    earliest = [
        candidate for candidate in candidates if candidate.starts_at == earliest_start
    ]
    for candidate in earliest:
        _validate_course_end_time(candidate.course, candidate.start_time)
    complete = [
        candidate for candidate in earliest if not _location_is_incomplete(candidate.course)
    ]
    if len(complete) > 1:
        raise BusinessError(
            409,
            "schedule_conflict",
            "同一时间存在多门课程，请先修复课表冲突",
            details={"course_ids": [candidate.course.id for candidate in complete]},
        )
    if complete:
        return complete[0]
    raise _location_error([candidate.course for candidate in earliest])


def resolve_current_location(
    session: Session,
    current_building_id: int | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
) -> LocationInfo:
    if current_building_id is not None:
        building = session.get(Building, current_building_id)
        if building is None:
            raise BusinessError(404, "current_building_not_found", "当前位置建筑不存在")
        return LocationInfo(
            building_id=building.id,
            name=building.name,
            latitude=building.latitude,
            longitude=building.longitude,
        )

    if latitude is None or longitude is None:
        raise BusinessError(
            422,
            "location_required",
            "请选择当前位置或提供完整坐标",
            fields=["current_building_id", "latitude", "longitude"],
        )

    return LocationInfo(
        name="当前位置",
        latitude=latitude,
        longitude=longitude,
    )


def get_departure_status(now: datetime, departure_at: datetime) -> SuggestionStatus:
    if now > departure_at:
        return "likely_late"
    if departure_at - now > timedelta(minutes=5):
        return "normal"
    return "tight"


_WEEKDAY_NAMES = ("周一", "周二", "周三", "周四", "周五", "周六", "周日")


def _weekday_name(target_date: date) -> str:
    return _WEEKDAY_NAMES[target_date.isoweekday() - 1]


def _format_departure_time(now: datetime, departure_at: datetime) -> str:
    """出发时间文本；出发日不是今天时带上"明天/周几"前缀。"""
    time_text = departure_at.strftime("%H:%M")
    delta_days = (departure_at.date() - now.date()).days
    if delta_days <= 0:
        return time_text
    if delta_days == 1:
        return f"明天 {time_text}"
    return f"{_weekday_name(departure_at.date())} {time_text}"


def _next_course_day_phrase(now: datetime, starts_at: datetime) -> str:
    """跨天场景下"下节课在……"的可读描述。"""
    time_text = starts_at.strftime("%H:%M")
    delta_days = (starts_at.date() - now.date()).days
    if delta_days == 1:
        return f"下节课在明天 {time_text}"
    return f"下节课在 {delta_days} 天后（{_weekday_name(starts_at.date())}）{time_text}"


def _build_text(
    *,
    now: datetime,
    starts_at: datetime,
    departure_at: datetime,
    from_name: str,
    walk_minutes: int,
    buffer_minutes: int,
) -> str:
    if starts_at.date() == now.date():
        minutes_until_course = max(0, int((starts_at - now).total_seconds() // 60))
        return (
            f"距离上课还有 {minutes_until_course} 分钟，建议 "
            f"{departure_at.strftime('%H:%M')} 从{from_name}出发，预计步行 "
            f"{walk_minutes} 分钟，预留 {buffer_minutes} 分钟缓冲。"
        )
    if departure_at.date() == starts_at.date():
        departure_text = departure_at.strftime("%H:%M")
    else:
        departure_text = _format_departure_time(now, departure_at)
    return (
        f"{_next_course_day_phrase(now, starts_at)}，建议 "
        f"{departure_text} 从{from_name}出发，预计步行 "
        f"{walk_minutes} 分钟，预留 {buffer_minutes} 分钟缓冲。"
    )


def build_schedule_suggestion(
    session: Session,
    user_id: int,
    request: ScheduleSuggestionRequest,
    now: datetime,
) -> ScheduleSuggestionResponse:
    current = _normalize_now(now)
    from_location = resolve_current_location(
        session,
        current_building_id=request.current_building_id,
        latitude=request.latitude,
        longitude=request.longitude,
    )
    next_candidate = find_next_course(session, user_id, now=current)
    if next_candidate is None:
        raise BusinessError(404, "no_upcoming_course", "本教学周暂无后续课程")

    course = next_candidate.course
    target_building = course.building
    if target_building is None or not target_building.name.strip():
        raise _location_error([course])

    distance_meters = haversine_distance_meters(
        from_location.latitude,
        from_location.longitude,
        target_building.latitude,
        target_building.longitude,
    )
    walk_minutes = estimate_walk_minutes(
        distance_meters,
        speed_m_per_min=DEFAULT_WALK_SPEED_M_PER_MIN,
    )
    departure_at = next_candidate.starts_at - timedelta(
        minutes=walk_minutes + DEFAULT_BUFFER_MINUTES
    )

    return ScheduleSuggestionResponse(
        next_course=NextCourseInfo(
            id=course.id,
            course_name=course.course_name,
            weekday=course.weekday,
            start_time=course.start_time,
            end_time=course.end_time,
            room_name=course.room_name,
            teacher=course.teacher,
            weeks=course.weeks,
            teaching_week=next_candidate.teaching_week,
            start_at=next_candidate.starts_at,
        ),
        from_location=from_location,
        target_building=BuildingInfo(
            id=target_building.id,
            name=target_building.name,
            latitude=target_building.latitude,
            longitude=target_building.longitude,
        ),
        distance_meters=distance_meters,
        walk_minutes=walk_minutes,
        buffer_minutes=DEFAULT_BUFFER_MINUTES,
        suggest_departure_time=_format_departure_time(current, departure_at),
        status=get_departure_status(current, departure_at),
        text=_build_text(
            now=current,
            starts_at=next_candidate.starts_at,
            departure_at=departure_at,
            from_name=from_location.name,
            walk_minutes=walk_minutes,
            buffer_minutes=DEFAULT_BUFFER_MINUTES,
        ),
        warning=None,
    )
