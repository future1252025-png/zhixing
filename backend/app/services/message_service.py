from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Building, Course, Message, User
from app.schemas.message import (
    ANONYMOUS_DISPLAY_NAME,
    ChatRoomRead,
    MessageCreate,
    MessageRead,
)
from app.services.location_service import haversine_distance_meters


MAX_MESSAGE_DISTANCE_METERS = 500


class MessageLocationTooFarError(ValueError):
    pass


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
) -> list[MessageRead]:
    statement = (
        select(Message)
        .where(Message.building_id == building_id, Message.status == "normal")
        .order_by(Message.created_at.asc(), Message.id.asc())
    )
    if room_name is not None:
        statement = statement.where(Message.room_name == room_name)

    messages = session.scalars(statement).all()
    return [to_message_read(message) for message in messages]


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
    general_count = sum(int(count) for _, count in message_count_rows)
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
        raise ValueError("Building not found")

    distance = haversine_distance_meters(
        payload.latitude,
        payload.longitude,
        building.latitude,
        building.longitude,
    )
    if distance > MAX_MESSAGE_DISTANCE_METERS:
        raise MessageLocationTooFarError(
            f"Location is too far from this building: {distance} meters"
        )

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
