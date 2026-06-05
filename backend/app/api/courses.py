from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_session
from app.models import User
from app.schemas.course import CourseCreate, CourseRead, CourseUpdate
from app.schemas.course_import import CourseImportPreviewResponse
from app.services.course_service import (
    building_exists,
    create_course,
    delete_course,
    get_course_for_user,
    list_courses,
    update_course,
)
from app.services.course_import_service import build_course_import_preview

router = APIRouter(prefix="/api/courses", tags=["courses"])


def require_building(session: Session, building_id: int) -> None:
    if not building_exists(session, building_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Building not found",
        )


def require_course_for_user(session: Session, course_id: int, user_id: int):
    course = get_course_for_user(session, course_id, user_id)
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        )
    return course


@router.get("", response_model=list[CourseRead])
def read_courses(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[CourseRead]:
    return list_courses(session, current_user.id)


@router.post("", response_model=CourseRead, status_code=status.HTTP_201_CREATED)
def create_current_user_course(
    payload: CourseCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> CourseRead:
    require_building(session, payload.building_id)
    return create_course(session, current_user.id, payload)


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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.put("/{course_id}", response_model=CourseRead)
def update_current_user_course(
    course_id: int,
    payload: CourseUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> CourseRead:
    course = require_course_for_user(session, course_id, current_user.id)
    if payload.building_id is not None:
        require_building(session, payload.building_id)
    return update_course(session, course, payload)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_current_user_course(
    course_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Response:
    course = require_course_for_user(session, course_id, current_user.id)
    delete_course(session, course)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
