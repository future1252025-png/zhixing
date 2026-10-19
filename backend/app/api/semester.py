from datetime import date, datetime
import sqlite3

from fastapi import APIRouter, Depends
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.clock import get_current_time
from app.core.security import get_current_user
from app.db.database import get_session
from app.models import User
from app.schemas.semester import SemesterResponse, SemesterUpdate
from app.services.semester_service import get_semester_response, upsert_setting


router = APIRouter(prefix="/api/semester", tags=["semester"])
SQLITE_BUSY_RETRY_ATTEMPTS = 3


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
    user_id = current_user.id
    start_date = payload.start_date
    total_weeks = payload.total_weeks
    rules = [rule.model_dump(mode="json") for rule in payload.time_rules] if payload.time_rules is not None else None
    persist_semester_setting_with_retry(session, user_id, start_date, total_weeks, rules)
    return get_semester_response(session, user_id, now)


def persist_semester_setting_with_retry(
    session: Session,
    user_id: int,
    start_date: date,
    total_weeks: int,
    time_rules: list[dict] | None = None,
) -> None:
    for attempt in range(SQLITE_BUSY_RETRY_ATTEMPTS):
        try:
            upsert_setting(session, user_id, start_date, total_weeks, time_rules)
            session.commit()
            return
        except OperationalError as error:
            session.rollback()
            if not _is_retryable_sqlite_lock(error) or attempt == SQLITE_BUSY_RETRY_ATTEMPTS - 1:
                raise
        except Exception:
            session.rollback()
            raise


def _is_retryable_sqlite_lock(error: OperationalError) -> bool:
    original_error = error.orig
    error_code = getattr(original_error, "sqlite_errorcode", None)
    if isinstance(error_code, int):
        return (error_code & 0xFF) in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED)

    error_name = getattr(original_error, "sqlite_errorname", None)
    if isinstance(error_name, str):
        return error_name.startswith(("SQLITE_BUSY", "SQLITE_LOCKED"))
    return False
