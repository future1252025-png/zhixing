from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Building, Course, Message, User
from app.schemas.message import (
    ANONYMOUS_DISPLAY_NAME,
    ChatRoomRead,
    MessageCreate,
    MessageRead,
)
from app.core.errors import BusinessError, MESSAGE_LOCATION_TOO_FAR
from app.services.location_service import haversine_distance_meters
from app.services.course_import_service import suggest_location


MAX_MESSAGE_DISTANCE_METERS = 500
MAX_LOCATION_ACCURACY_METERS = 100
MAX_LOCATION_AGE_SECONDS = 120
MAX_LOCATION_FUTURE_SKEW_SECONDS = 30
MESSAGE_RATE_LIMIT_COUNT = 10
MESSAGE_RATE_LIMIT_WINDOW_SECONDS = 60
MESSAGE_DUPLICATE_COOLDOWN_SECONDS = 30
MESSAGE_ROOM_NOT_FOUND = "该建筑下不存在此教室频道，无法留言"


def get_building(session: Session, building_id: int) -> Building | None:
    return session.get(Building, building_id)


def to_message_read(message: Message) -> MessageRead:
    return MessageRead(
        id=message.id,
        building_id=message.building_id,
        content=message.content,
        display_name=ANONYMOUS_DISPLAY_NAME,
        room_name=message.room_name,
        created_at=message.created_at,
        distance_to_building_meters=message.distance_to_building_meters,
    )


def list_building_messages(
    session: Session,
    building_id: int,
    room_name: str | None = None,
    limit: int = 50,
    offset: int = 0,
    before_id: int | None = None,
) -> list[MessageRead]:
    """List messages for one channel.

    - room_name is None → 地点频道 (only messages with room_name IS NULL)
    - room_name is set  → that classroom channel only
    - before_id is set  → cursor pagination: only messages with id < before_id.
      Message ids are monotonically increasing and inserted in created_at order,
      so the id cursor matches the created_at DESC, id DESC ordering. When
      before_id is provided it takes precedence and offset is ignored.
    """
    statement = (
        select(Message)
        .where(Message.building_id == building_id, Message.status == "normal")
        .order_by(Message.created_at.desc(), Message.id.desc())
    )
    if room_name is None:
        statement = statement.where(Message.room_name.is_(None))
    else:
        statement = statement.where(Message.room_name == room_name)

    if before_id is not None:
        statement = statement.where(Message.id < before_id).limit(limit)
    else:
        statement = statement.limit(limit).offset(offset)
    messages = session.scalars(statement).all()
    return [to_message_read(message) for message in reversed(messages)]


def list_building_chatrooms(session: Session, building_id: int) -> list[ChatRoomRead]:
    course_rooms = _course_room_names(session, building_id)
    message_count_rows = session.execute(
        select(Message.room_name, func.count(Message.id))
        .where(Message.building_id == building_id, Message.status == "normal")
        .group_by(Message.room_name)
    ).all()
    message_counts = {
        room_name: int(count)
        for room_name, count in message_count_rows
        if room_name is not None
    }
    # 地点频道 only counts messages that belong to the general channel.
    general_count = sum(
        int(count) for room_name, count in message_count_rows if room_name is None
    )
    room_names = sorted(course_rooms | set(message_counts.keys()))

    return [
        ChatRoomRead(
            name="地点频道",
            room_name=None,
            message_count=general_count,
            is_general=True,
        ),
        *[
            ChatRoomRead(
                name=room_name,
                room_name=room_name,
                message_count=message_counts.get(room_name, 0),
                is_general=False,
            )
            for room_name in room_names
        ],
    ]


def _course_room_names(session: Session, building_id: int) -> set[str]:
    building = session.get(Building, building_id)
    if building is None:
        return set()
    courses = session.scalars(
        select(Course)
        .options(selectinload(Course.import_source))
        .where(
            Course.building_id == building_id,
            Course.source_kind == "import",
        )
    ).all()
    trusted_rooms: set[str] = set()
    for course in courses:
        source = course.import_source
        room_name = course.room_name.strip()
        if source is None or not room_name:
            continue
        matched_building_id, matched_room, issues = suggest_location(
            source.raw_location,
            [building],
        )
        if (
            not issues
            and matched_building_id == building_id
            and matched_room is not None
            and _normalize_room(matched_room) == _normalize_room(room_name)
        ):
            trusted_rooms.add(room_name)
    return trusted_rooms


def _normalize_room(value: str) -> str:
    return "".join(value.split()).casefold()


def _room_exists(session: Session, building_id: int, room_name: str) -> bool:
    if room_name in _course_room_names(session, building_id):
        return True
    return (
        session.scalars(
            select(Message.id)
            .where(
                Message.building_id == building_id,
                Message.room_name == room_name,
                Message.status == "normal",
            )
            .limit(1)
        ).first()
        is not None
    )


def create_building_message(
    session: Session,
    building: Building,
    user: User,
    payload: MessageCreate,
    *,
    now: datetime | None = None,
) -> MessageRead:
    current = _normalize_now(now)
    if payload.room_name is not None and not _room_exists(
        session, building.id, payload.room_name
    ):
        raise BusinessError(
            422,
            "room_not_found",
            MESSAGE_ROOM_NOT_FOUND,
            fields=["room_name"],
        )

    _validate_message_frequency(session, user.id, building.id, payload, current)
    _validate_location_evidence(payload, current)

    distance = haversine_distance_meters(
        payload.latitude,
        payload.longitude,
        building.latitude,
        building.longitude,
    )
    if distance + payload.location_accuracy_meters > MAX_MESSAGE_DISTANCE_METERS:
        raise BusinessError(
            400,
            "message_location_too_far",
            MESSAGE_LOCATION_TOO_FAR,
            fields=["latitude", "longitude", "location_accuracy_meters"],
            details={
                "distance_meters": distance,
                "accuracy_meters": payload.location_accuracy_meters,
                "max_distance_meters": MAX_MESSAGE_DISTANCE_METERS,
            },
        )

    message = Message(
        building_id=building.id,
        user_id=user.id,
        content=payload.content,
        display_name=ANONYMOUS_DISPLAY_NAME,
        room_name=payload.room_name,
        # Exact user coordinates are verification evidence, not channel data.
        # Do not retain them after deriving the coarse distance result.
        latitude=None,
        longitude=None,
        location_source=None,
        distance_to_building_meters=distance,
        status="normal",
        created_at=current,
    )
    session.add(message)
    session.commit()
    session.refresh(message)
    return to_message_read(message)


def _normalize_now(now: datetime | None) -> datetime:
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None or current.utcoffset() is None:
        return current.replace(tzinfo=timezone.utc)
    return current.astimezone(timezone.utc)


def _validate_location_evidence(payload: MessageCreate, now: datetime) -> None:
    if payload.location_accuracy_meters > MAX_LOCATION_ACCURACY_METERS:
        raise BusinessError(
            422,
            "location_accuracy_insufficient",
            "定位精度不足，请移到开阔处后重试",
            fields=["location_accuracy_meters"],
            details={"max_accuracy_meters": MAX_LOCATION_ACCURACY_METERS},
        )

    located_at = payload.located_at.astimezone(timezone.utc)
    age_seconds = (now - located_at).total_seconds()
    if (
        age_seconds > MAX_LOCATION_AGE_SECONDS
        or age_seconds < -MAX_LOCATION_FUTURE_SKEW_SECONDS
    ):
        raise BusinessError(
            422,
            "location_evidence_stale",
            "定位信息已过期，请重新定位后再留言",
            fields=["located_at"],
            details={
                "max_age_seconds": MAX_LOCATION_AGE_SECONDS,
                "max_future_skew_seconds": MAX_LOCATION_FUTURE_SKEW_SECONDS,
            },
        )


def _validate_message_frequency(
    session: Session,
    user_id: int,
    building_id: int,
    payload: MessageCreate,
    now: datetime,
) -> None:
    window_start = now - timedelta(seconds=MESSAGE_RATE_LIMIT_WINDOW_SECONDS)
    recent_count = session.scalar(
        select(func.count(Message.id)).where(
            Message.user_id == user_id,
            Message.created_at >= window_start,
            Message.status == "normal",
        )
    )
    if int(recent_count or 0) >= MESSAGE_RATE_LIMIT_COUNT:
        raise BusinessError(
            429,
            "message_rate_limited",
            "留言过于频繁，请稍后再试",
            details={
                "max_messages": MESSAGE_RATE_LIMIT_COUNT,
                "window_seconds": MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
            },
        )

    duplicate_since = now - timedelta(seconds=MESSAGE_DUPLICATE_COOLDOWN_SECONDS)
    duplicate_conditions = [
        Message.user_id == user_id,
        Message.building_id == building_id,
        Message.content == payload.content,
        Message.status == "normal",
        Message.created_at >= duplicate_since,
    ]
    if payload.room_name is None:
        duplicate_conditions.append(Message.room_name.is_(None))
    else:
        duplicate_conditions.append(Message.room_name == payload.room_name)
    duplicate = session.scalar(select(Message.id).where(*duplicate_conditions).limit(1))
    if duplicate is not None:
        raise BusinessError(
            409,
            "duplicate_message",
            "相同留言已发送，请勿重复提交",
            fields=["content"],
            details={"cooldown_seconds": MESSAGE_DUPLICATE_COOLDOWN_SECONDS},
        )
