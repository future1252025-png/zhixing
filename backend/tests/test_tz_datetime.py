from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy.orm import sessionmaker

from app.db.database import Base, create_sqlite_engine, init_db
from app.models import Building, Course, User


UTC_MOMENT = datetime(2026, 5, 29, 8, 0, tzinfo=timezone.utc)


@pytest.fixture
def session_factory(tmp_path: Path) -> Generator[sessionmaker, None, None]:
    engine = create_sqlite_engine(f"sqlite:///{(tmp_path / 'tz.db').as_posix()}")
    init_db(engine)
    try:
        yield sessionmaker(bind=engine, autoflush=False, autocommit=False)
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def make_user(**overrides) -> User:
    values = {
        "username": "tz_user",
        "password_hash": "hash",
        "nickname": "TZ",
        "role": "student",
    }
    values.update(overrides)
    return User(**values)


def make_building() -> Building:
    return Building(
        name="时区测试楼",
        type="teaching",
        description="用于时区读写测试",
        latitude=30.0,
        longitude=114.0,
        map_x=0.0,
        map_y=0.0,
    )


def test_aware_utc_datetime_reads_back_aware_from_fresh_session(
    session_factory: sessionmaker,
) -> None:
    with session_factory() as session:
        session.add(make_user(created_at=UTC_MOMENT))
        session.commit()

    with session_factory() as session:
        user = session.query(User).filter(User.username == "tz_user").one()
        assert user.created_at == UTC_MOMENT
        assert user.created_at.tzinfo == timezone.utc


def test_naive_datetime_is_treated_as_utc(session_factory: sessionmaker) -> None:
    with session_factory() as session:
        session.add(make_user(created_at=UTC_MOMENT.replace(tzinfo=None)))
        session.commit()

    with session_factory() as session:
        user = session.query(User).filter(User.username == "tz_user").one()
        assert user.created_at == UTC_MOMENT


def test_non_utc_aware_datetime_is_normalized_to_utc(
    session_factory: sessionmaker,
) -> None:
    beijing = timezone(timedelta(hours=8))
    with session_factory() as session:
        session.add(make_user(created_at=UTC_MOMENT.astimezone(beijing)))
        session.commit()

    with session_factory() as session:
        user = session.query(User).filter(User.username == "tz_user").one()
        assert user.created_at == UTC_MOMENT
        assert user.created_at.tzinfo == timezone.utc


def test_default_created_at_is_timezone_aware_across_models(
    session_factory: sessionmaker,
) -> None:
    with session_factory() as session:
        user = make_user()
        building = make_building()
        session.add_all([user, building])
        session.flush()
        session.add(
            Course(
                user_id=user.id,
                course_name="时区课程",
                weekday=1,
                start_time="08:00",
                end_time="09:40",
                building_id=building.id,
                room_name="101",
            )
        )
        session.commit()

    with session_factory() as session:
        user = session.query(User).filter(User.username == "tz_user").one()
        building = session.query(Building).filter(Building.name == "时区测试楼").one()
        course = session.query(Course).filter(Course.course_name == "时区课程").one()
        for created_at in (user.created_at, building.created_at, course.created_at):
            assert created_at.tzinfo == timezone.utc
            assert created_at.isoformat().endswith("+00:00")
