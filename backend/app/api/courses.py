import sqlite3
from collections.abc import Callable
from typing import TypeVar

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_session
from app.models import User
from app.schemas.course import CourseCreate, CourseRead, CourseUpdate
from app.schemas.course_import import CourseImportPreviewResponse
from app.schemas.error import BusinessErrorResponse
from app.services.course_import_service import build_course_import_preview
from app.services.course_service import add_course, delete_course, list_courses, update_course


router = APIRouter(prefix="/api/courses", tags=["courses"])
SQLITE_BUSY_RETRY_ATTEMPTS = 3
_BUSINESS_ERROR_RESPONSES = {
    404: {"model": BusinessErrorResponse},
    409: {"model": BusinessErrorResponse},
    422: {"model": BusinessErrorResponse},
}
T = TypeVar("T")


@router.get("", response_model=list[CourseRead])
def read_courses(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[CourseRead]:
    return list_courses(session, current_user.id)


@router.post("", response_model=CourseRead, status_code=status.HTTP_201_CREATED, responses=_BUSINESS_ERROR_RESPONSES)
def create_current_user_course(
    payload: CourseCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> CourseRead:
    course = _write_with_retry(
        session,
        lambda: add_course(session, user_id=current_user.id, payload=payload),
    )
    session.refresh(course)
    return course


@router.post(
    "/import/preview",
    response_model=CourseImportPreviewResponse,
    responses={
        415: {"model": BusinessErrorResponse},
        422: {"model": BusinessErrorResponse},
    },
)
async def preview_course_import(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> CourseImportPreviewResponse:
    _ = current_user
    content = await file.read()
    return build_course_import_preview(session, file.filename or "", content)


@router.put("/{course_id}", response_model=CourseRead, responses=_BUSINESS_ERROR_RESPONSES)
def update_current_user_course(
    course_id: int,
    payload: CourseUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> CourseRead:
    course = _write_with_retry(
        session,
        lambda: update_course(session, user_id=current_user.id, course_id=course_id, payload=payload),
    )
    session.refresh(course)
    return course


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_BUSINESS_ERROR_RESPONSES)
def delete_current_user_course(
    course_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Response:
    _write_with_retry(
        session,
        lambda: delete_course(session, user_id=current_user.id, course_id=course_id),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _write_with_retry(session: Session, operation: Callable[[], T]) -> T:
    for attempt in range(SQLITE_BUSY_RETRY_ATTEMPTS):
        try:
            result = operation()
            session.commit()
            return result
        except OperationalError as error:
            session.rollback()
            if not _is_retryable_sqlite_lock(error) or attempt == SQLITE_BUSY_RETRY_ATTEMPTS - 1:
                raise
        except Exception:
            session.rollback()
            raise
    raise RuntimeError("unreachable sqlite retry state")


def _is_retryable_sqlite_lock(error: OperationalError) -> bool:
    original = error.orig
    code = getattr(original, "sqlite_errorcode", None)
    if isinstance(code, int):
        return (code & 0xFF) in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED)
    name = getattr(original, "sqlite_errorname", None)
    return isinstance(name, str) and name.startswith(("SQLITE_BUSY", "SQLITE_LOCKED"))
