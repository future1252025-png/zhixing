from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.clock import get_current_time
from app.core.security import get_current_user
from app.db.database import get_session
from app.models import User
from app.schemas.error import BusinessErrorResponse
from app.schemas.schedule import ScheduleSuggestionRequest, ScheduleSuggestionResponse
from app.services.schedule_service import build_schedule_suggestion

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


@router.post(
    "/suggestion",
    response_model=ScheduleSuggestionResponse,
    responses={
        404: {"model": BusinessErrorResponse},
        409: {"model": BusinessErrorResponse},
        422: {"model": BusinessErrorResponse},
    },
)
def create_schedule_suggestion(
    payload: ScheduleSuggestionRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    now: datetime = Depends(get_current_time),
) -> ScheduleSuggestionResponse:
    return build_schedule_suggestion(session, current_user.id, payload, now=now)
