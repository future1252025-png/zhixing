from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_session
from app.models import User
from app.schemas.message import ChatRoomRead, MessageCreate, MessageRead
from app.services.message_service import (
    MessageLocationTooFarError,
    create_building_message,
    get_building,
    list_building_chatrooms,
    list_building_messages,
)

router = APIRouter(
    prefix="/api/buildings/{building_id}",
    tags=["messages"],
)


def require_building(session: Session, building_id: int) -> None:
    if get_building(session, building_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Building not found",
        )


@router.get("/chatrooms", response_model=list[ChatRoomRead])
def read_building_chatrooms(
    building_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ChatRoomRead]:
    require_building(session, building_id)
    return list_building_chatrooms(session, building_id)


@router.get("/messages", response_model=list[MessageRead])
def read_building_messages(
    building_id: int,
    room_name: str | None = Query(default=None, max_length=64),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[MessageRead]:
    require_building(session, building_id)
    return list_building_messages(
        session,
        building_id,
        room_name,
        limit=limit,
        offset=offset,
    )


@router.post("/messages", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
def create_message(
    building_id: int,
    payload: MessageCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> MessageRead:
    require_building(session, building_id)
    try:
        return create_building_message(session, building_id, current_user, payload)
    except MessageLocationTooFarError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
