from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core import errors
from app.core.security import get_current_user
from app.db.database import get_session
from app.models import User
from app.schemas.schedule import ScheduleSuggestionRequest, ScheduleSuggestionResponse
from app.services.schedule_service import (
    CurrentBuildingNotFound,
    NoUpcomingCourseFound,
    TargetBuildingNotFound,
    build_schedule_suggestion,
)

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


@router.post("/suggestion", response_model=ScheduleSuggestionResponse)
def create_schedule_suggestion(
    payload: ScheduleSuggestionRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ScheduleSuggestionResponse:
    try:
        return build_schedule_suggestion(session, current_user.id, payload)
    except CurrentBuildingNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=errors.CURRENT_BUILDING_NOT_FOUND,
        ) from exc
    except NoUpcomingCourseFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=errors.NO_UPCOMING_COURSE,
        ) from exc
    except TargetBuildingNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=errors.TARGET_BUILDING_NOT_FOUND,
        ) from exc
