import sqlite3
from collections.abc import Callable
from typing import Annotated, TypeVar

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status
from pydantic import ValidationError
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.errors import BusinessError
from app.core.security import get_current_user
from app.db.database import get_session
from app.models import User
from app.schemas.course import CourseCreate, CourseRead, CourseUpdate
from app.schemas.course_import import (
    CourseImportPreviewResponse,
    ImportCommitManifest,
    ImportCommitResponse,
)
from app.schemas.error import BusinessErrorResponse
from app.services.course_import_service import build_course_import_preview, commit_course_import
from app.services.course_service import add_course, delete_course, list_courses, update_course
from app.schemas.course_makeup import MakeupCreate, MakeupTiming
from app.services.course_makeup_service import add_makeups, remove_batch, update_makeup


router = APIRouter(prefix="/api/courses", tags=["courses"])
SQLITE_BUSY_RETRY_ATTEMPTS = 3
MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
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
        413: {"model": BusinessErrorResponse},
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
    content = await _read_import_upload(file)
    return build_course_import_preview(session, file.filename or "", content)


@router.post(
    "/import",
    response_model=ImportCommitResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        413: {"model": BusinessErrorResponse},
        409: {"model": BusinessErrorResponse},
        415: {"model": BusinessErrorResponse},
        422: {"model": BusinessErrorResponse},
    },
)
async def commit_current_user_course_import(
    file: Annotated[UploadFile, File()],
    manifest: Annotated[str, Form()],
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ImportCommitResponse:
    parsed_manifest = _parse_import_manifest(manifest)
    content = await _read_import_upload(file)
    courses = _write_with_retry(
        session,
        lambda: commit_course_import(
            session,
            user_id=current_user.id,
            filename=file.filename or "",
            content=content,
            manifest=parsed_manifest,
        ),
    )
    return ImportCommitResponse(
        created_count=len(courses),
        course_ids=[course.id for course in courses],
    )


@router.post("/makeups", response_model=list[CourseRead], status_code=201, responses=_BUSINESS_ERROR_RESPONSES)
def create_makeup_batch(payload: MakeupCreate, session: Session = Depends(get_session),
                        current_user: User = Depends(get_current_user)):
    return _write_with_retry(session, lambda: add_makeups(session, current_user.id, payload))


@router.put("/makeups/{course_id}", response_model=CourseRead, responses=_BUSINESS_ERROR_RESPONSES)
def edit_makeup(course_id: int, payload: MakeupTiming, session: Session = Depends(get_session),
                current_user: User = Depends(get_current_user)):
    return _write_with_retry(session, lambda: update_makeup(session, current_user.id, course_id, payload))


@router.delete("/makeups/batches/{batch_id}", status_code=204, responses=_BUSINESS_ERROR_RESPONSES)
def delete_makeup_batch(batch_id: str, session: Session = Depends(get_session),
                        current_user: User = Depends(get_current_user)):
    _write_with_retry(session, lambda: remove_batch(session, current_user.id, batch_id))
    return Response(status_code=204)


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


def _parse_import_manifest(raw_manifest: str) -> ImportCommitManifest:
    try:
        return ImportCommitManifest.model_validate_json(raw_manifest)
    except ValidationError as exc:
        raise BusinessError(
            422,
            "invalid_import_manifest",
            "导入确认数据格式无效",
            fields=["manifest"],
            details={"errors": exc.errors(include_context=False)},
        ) from exc


async def _read_import_upload(file: UploadFile) -> bytes:
    content = await file.read(MAX_IMPORT_FILE_BYTES + 1)
    if len(content) > MAX_IMPORT_FILE_BYTES:
        raise BusinessError(
            413,
            "import_file_too_large",
            "课表文件不能超过 10 MB",
            fields=["file"],
            details={"max_bytes": MAX_IMPORT_FILE_BYTES},
        )
    return content


def _is_retryable_sqlite_lock(error: OperationalError) -> bool:
    original = error.orig
    code = getattr(original, "sqlite_errorcode", None)
    if isinstance(code, int):
        return (code & 0xFF) in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED)
    name = getattr(original, "sqlite_errorname", None)
    return isinstance(name, str) and name.startswith(("SQLITE_BUSY", "SQLITE_LOCKED"))
