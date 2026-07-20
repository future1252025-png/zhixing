from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.errors import BusinessError
from app.core.security import get_current_user
from app.db.database import get_session
from app.models import User
from app.schemas.course import CourseCreate, CourseRead, CourseUpdate
from app.schemas.course_import import CourseImportPreviewResponse
from app.schemas.error import BusinessErrorResponse
from app.services.course_import_service import build_course_import_preview
from app.services.course_service import (
    add_course,
    delete_course,
    get_course_for_user,
    list_courses,
    update_course,
)


router = APIRouter(prefix="/api/courses", tags=["courses"])
_BUSINESS_ERROR_RESPONSES = {
    404: {"model": BusinessErrorResponse},
    409: {"model": BusinessErrorResponse},
    422: {"model": BusinessErrorResponse},
}


@router.get("", response_model=list[CourseRead])
def read_courses(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[CourseRead]:
    return list_courses(session, current_user.id)


@router.post(
    "",
    response_model=CourseRead,
    status_code=status.HTTP_201_CREATED,
    responses=_BUSINESS_ERROR_RESPONSES,
)
def create_current_user_course(
    payload: CourseCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> CourseRead:
    try:
        course = add_course(session, user_id=current_user.id, payload=payload)
        session.commit()
        session.refresh(course)
        return course
    except BaseException:
        session.rollback()
        raise


@router.post("/import/preview", response_model=CourseImportPreviewResponse)
async def preview_course_import(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> CourseImportPreviewResponse:
    _ = current_user
    content = await file.read()
    try:
        return build_course_import_preview(session, file.filename or "", content)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.put("/{course_id}", response_model=CourseRead, responses=_BUSINESS_ERROR_RESPONSES)
def update_current_user_course(
    course_id: int,
    payload: CourseUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> CourseRead:
    try:
        course = get_course_for_user(session, course_id, current_user.id)
        if course is None:
            raise BusinessError(404, "course_not_found", "Course not found")
        course = update_course(session, course, payload)
        session.commit()
        session.refresh(course)
        return course
    except BaseException:
        session.rollback()
        raise


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_BUSINESS_ERROR_RESPONSES)
def delete_current_user_course(
    course_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Response:
    try:
        course = get_course_for_user(session, course_id, current_user.id)
        if course is None:
            raise BusinessError(404, "course_not_found", "Course not found")
        delete_course(session, course)
        session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except BaseException:
        session.rollback()
        raise
