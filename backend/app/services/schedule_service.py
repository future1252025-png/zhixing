from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Building, Course
from app.schemas.course import parse_course_time
from app.schemas.schedule import (
    BuildingInfo,
    LocationInfo,
    NextCourseInfo,
    ScheduleSuggestionRequest,
    ScheduleSuggestionResponse,
    SuggestionStatus,
)
from app.services.location_service import (
    DEFAULT_WALK_SPEED_M_PER_MIN,
    estimate_walk_minutes,
    haversine_distance_meters,
)


DEFAULT_BUFFER_MINUTES = 10
SAME_TIME_WARNING = "该时间段有多门课程，已选择最先创建的一门。"


class CurrentBuildingNotFound(LookupError):
    pass


class NoUpcomingCourseFound(LookupError):
    pass


class TargetBuildingNotFound(LookupError):
    pass


@dataclass(frozen=True)
class NextCourseCandidate:
    course: Course
    starts_at: datetime
    same_time_course_count: int


def _normalize_now(now: datetime | None = None) -> datetime:
    current = now or datetime.now()
    if current.tzinfo is not None:
        return current.replace(tzinfo=None)
    return current


def _course_start_datetime(base_date, start_time: str) -> datetime:
    return datetime.combine(base_date, parse_course_time(start_time))


def find_next_course(
    session: Session,
    user_id: int,
    now: datetime | None = None,
) -> NextCourseCandidate | None:
    current = _normalize_now(now)

    for day_offset in range(0, 8):
        course_date = current.date() + timedelta(days=day_offset)
        weekday = course_date.isoweekday()
        courses = list(
            session.scalars(
                select(Course)
                .where(Course.user_id == user_id, Course.weekday == weekday)
                .order_by(Course.start_time.asc(), Course.id.asc())
            ).all()
        )
        future_courses = [
            course
            for course in courses
            if _course_start_datetime(course_date, course.start_time) > current
        ]
        if not future_courses:
            continue

        next_course = future_courses[0]
        starts_at = _course_start_datetime(course_date, next_course.start_time)
        same_time_count = sum(
            1 for course in future_courses if course.start_time == next_course.start_time
        )
        return NextCourseCandidate(
            course=next_course,
            starts_at=starts_at,
            same_time_course_count=same_time_count,
        )

    return None


def resolve_current_location(
    session: Session,
    current_building_id: int | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
) -> LocationInfo:
    if current_building_id is not None:
        building = session.get(Building, current_building_id)
        if building is None:
            raise CurrentBuildingNotFound
        return LocationInfo(
            building_id=building.id,
            name=building.name,
            latitude=building.latitude,
            longitude=building.longitude,
        )

    if latitude is None or longitude is None:
        raise ValueError("current_building_id or latitude and longitude are required")

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


def _build_text(
    *,
    now: datetime,
    starts_at: datetime,
    departure_at: datetime,
    from_name: str,
    walk_minutes: int,
    buffer_minutes: int,
) -> str:
    minutes_until_course = max(0, int((starts_at - now).total_seconds() // 60))
    return (
        f"距离上课还有 {minutes_until_course} 分钟，建议 "
        f"{departure_at.strftime('%H:%M')} 从{from_name}出发，预计步行 "
        f"{walk_minutes} 分钟，预留 {buffer_minutes} 分钟缓冲。"
    )


def build_schedule_suggestion(
    session: Session,
    user_id: int,
    request: ScheduleSuggestionRequest,
    now: datetime | None = None,
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
        raise NoUpcomingCourseFound

    course = next_candidate.course
    target_building = course.building or session.get(Building, course.building_id)
    if target_building is None:
        raise TargetBuildingNotFound

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
    warning = (
        SAME_TIME_WARNING if next_candidate.same_time_course_count > 1 else None
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
        suggest_departure_time=departure_at.strftime("%H:%M"),
        status=get_departure_status(current, departure_at),
        text=_build_text(
            now=current,
            starts_at=next_candidate.starts_at,
            departure_at=departure_at,
            from_name=from_location.name,
            walk_minutes=walk_minutes,
            buffer_minutes=DEFAULT_BUFFER_MINUTES,
        ),
        warning=warning,
    )
