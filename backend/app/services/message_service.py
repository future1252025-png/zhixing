from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Building, Course, Message, User
from app.schemas.message import (
    ANONYMOUS_DISPLAY_NAME,
    ChatRoomRead,
    MessageCreate,
    MessageRead,
)
from app.core.errors import BusinessError, MESSAGE_LOCATION_TOO_FAR
from app.services.location_service import haversine_distance_meters


MAX_MESSAGE_DISTANCE_METERS = 500
MESSAGE_ROOM_NOT_FOUND = "该建筑下不存在此教室频道，无法留言"


class MessageLocationTooFarError(ValueError):
    def __init__(self, distance_meters: int | None = None) -> None:
        self.distance_meters = distance_meters
        super().__init__(MESSAGE_LOCATION_TOO_FAR)


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
    return {
        room_name.strip()
        for room_name in session.scalars(
            select(Course.room_name).where(Course.building_id == building_id)
        ).all()
        if room_name and room_name.strip()
    }


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
) -> MessageRead:
    if payload.room_name is not None and not _room_exists(
        session, building.id, payload.room_name
    ):
        raise BusinessError(
            422,
            "room_not_found",
            MESSAGE_ROOM_NOT_FOUND,
            fields=["room_name"],
        )

    distance = haversine_distance_meters(
        payload.latitude,
        payload.longitude,
        building.latitude,
        building.longitude,
    )
    if distance > MAX_MESSAGE_DISTANCE_METERS:
        raise MessageLocationTooFarError(distance)

    message = Message(
        building_id=building.id,
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
