from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Building, Message, User
from app.schemas.message import ANONYMOUS_DISPLAY_NAME, MessageCreate, MessageRead


def get_building(session: Session, building_id: int) -> Building | None:
    return session.get(Building, building_id)


def to_message_read(message: Message) -> MessageRead:
    return MessageRead(
        id=message.id,
        building_id=message.building_id,
        content=message.content,
        display_name=ANONYMOUS_DISPLAY_NAME,
        created_at=message.created_at,
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
    message = Message(
        building_id=building_id,
        user_id=user.id,
        content=payload.content,
        display_name=ANONYMOUS_DISPLAY_NAME,
        status="normal",
    )
    session.add(message)
    session.commit()
    session.refresh(message)
    return to_message_read(message)
