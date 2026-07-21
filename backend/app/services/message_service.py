from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Building, Course, Message, User
from app.schemas.message import (
    ANONYMOUS_DISPLAY_NAME,
    ChatRoomRead,
    MessageCreate,
    MessageRead,
)
from app.core import errors
from app.core.errors import MESSAGE_LOCATION_TOO_FAR
from app.services.location_service import haversine_distance_meters


MAX_MESSAGE_DISTANCE_METERS = 500


class MessageLocationTooFarError(ValueError):
    def __init__(self, distance_meters: int | None = None) -> None:
        self.distance_meters = distance_meters
        super().__init__(MESSAGE_LOCATION_TOO_FAR)


def normalize_utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_building(session: Session, building_id: int) -> Building | None:
    return session.get(Building, building_id)


def to_message_read(message: Message) -> MessageRead:
    return MessageRead(
        id=message.id,
        building_id=message.building_id,
        content=message.content,
        display_name=ANONYMOUS_DISPLAY_NAME,
        room_name=message.room_name,
        created_at=normalize_utc_datetime(message.created_at),
        latitude=message.latitude,
        longitude=message.longitude,
        location_source=message.location_source,
        distance_to_building_meters=message.distance_to_building_meters,
    )


def list_building_messages(
    session: Session,
    building_id: int,
    room_name: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[MessageRead]:
    """List messages for one channel.

    - room_name is None → 建筑总聊 (only messages with room_name IS NULL)
    - room_name is set  → that classroom channel only
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

    statement = statement.limit(limit).offset(offset)
    messages = session.scalars(statement).all()
    return [to_message_read(message) for message in reversed(messages)]


def list_building_chatrooms(session: Session, building_id: int) -> list[ChatRoomRead]:
    course_rooms = {
        room_name.strip()
        for room_name in session.scalars(
            select(Course.room_name).where(Course.building_id == building_id)
        ).all()
        if room_name and room_name.strip()
    }
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
    # 建筑总聊 only counts messages that belong to the general channel.
    general_count = sum(
        int(count) for room_name, count in message_count_rows if room_name is None
    )
    room_names = sorted(course_rooms | set(message_counts.keys()))

    return [
        ChatRoomRead(
            name="建筑总聊",
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


def create_building_message(
    session: Session,
    building_id: int,
    user: User,
    payload: MessageCreate,
) -> MessageRead:
    building = get_building(session, building_id)
    if building is None:
        raise ValueError(errors.BUILDING_NOT_FOUND)

    distance = haversine_distance_meters(
        payload.latitude,
        payload.longitude,
        building.latitude,
        building.longitude,
    )
    if distance > MAX_MESSAGE_DISTANCE_METERS:
        raise MessageLocationTooFarError(distance)

    message = Message(
        building_id=building_id,
        user_id=user.id,
        content=payload.content,
        display_name=ANONYMOUS_DISPLAY_NAME,
        room_name=payload.room_name,
        latitude=payload.latitude,
        longitude=payload.longitude,
        location_source=payload.location_source,
        distance_to_building_meters=distance,
        status="normal",
    )
    session.add(message)
    session.commit()
    session.refresh(message)
    return to_message_read(message)
