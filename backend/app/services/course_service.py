from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Building, Course
from app.schemas.course import CourseCreate, CourseUpdate, ensure_end_after_start


def building_exists(session: Session, building_id: int) -> bool:
    return session.get(Building, building_id) is not None


def list_courses(session: Session, user_id: int) -> list[Course]:
    return list(
        session.scalars(
            select(Course)
            .where(Course.user_id == user_id)
            .order_by(Course.weekday.asc(), Course.start_time.asc(), Course.id.asc())
        ).all()
    )


def get_course_for_user(
    session: Session,
    course_id: int,
    user_id: int,
) -> Course | None:
    return session.scalar(
        select(Course).where(Course.id == course_id, Course.user_id == user_id)
    )


def create_course(session: Session, user_id: int, payload: CourseCreate) -> Course:
    course = Course(user_id=user_id, **payload.model_dump())
    session.add(course)
    session.commit()
    session.refresh(course)
    return course


def update_course(
    session: Session,
    course: Course,
    payload: CourseUpdate,
) -> Course:
    changes = payload.model_dump(exclude_unset=True)
    start_time = changes.get("start_time", course.start_time)
    end_time = changes.get("end_time", course.end_time)
    ensure_end_after_start(start_time, end_time)

    for field, value in changes.items():
        setattr(course, field, value)

    session.add(course)
    session.commit()
    session.refresh(course)
    return course


def delete_course(session: Session, course: Course) -> None:
    session.delete(course)
    session.commit()
