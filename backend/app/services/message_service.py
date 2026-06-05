from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Building, Message, User
from app.schemas.message import ANONYMOUS_DISPLAY_NAME, MessageCreate, MessageRead
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
        created_at=message.created_at,
        latitude=message.latitude,
        longitude=message.longitude,
        location_source=message.location_source,
        distance_to_building_meters=message.distance_to_building_meters,
    )


def list_building_messages(session: Session, building_id: int) -> list[MessageRead]:
    messages = session.scalars(
        select(Message)
        .where(Message.building_id == building_id, Message.status == "normal")
        .order_by(Message.created_at.asc(), Message.id.asc())
    ).all()
    return [to_message_read(message) for message in messages]


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
