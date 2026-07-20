from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.clock import get_current_time
from app.core.security import get_current_user
from app.db.database import get_session
from app.models import User
from app.schemas.semester import SemesterResponse, SemesterUpdate
from app.services.semester_service import get_semester_response, upsert_setting


router = APIRouter(prefix="/api/semester", tags=["semester"])


@router.get("", response_model=SemesterResponse)
def read_semester(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    now: datetime = Depends(get_current_time),
) -> SemesterResponse:
    return get_semester_response(session, current_user.id, now)


@router.put("", response_model=SemesterResponse)
def update_semester(
    payload: SemesterUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    now: datetime = Depends(get_current_time),
) -> SemesterResponse:
    upsert_setting(session, current_user.id, payload.start_date, payload.total_weeks)
    session.commit()
    return get_semester_response(session, current_user.id, now)
