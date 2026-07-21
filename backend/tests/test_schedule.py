from collections.abc import Generator
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.clock import SHANGHAI_TZ, get_current_time
from app.core.errors import BusinessError
from app.db.database import Base, create_sqlite_engine, get_session, init_db
from app.db.seed import seed_demo_data
from app.main import app
from app.models import Building, Course, SemesterSetting, User
from app.schemas.schedule import ScheduleSuggestionRequest
from app.services.location_service import (
    estimate_walk_minutes,
    haversine_distance_meters,
)
from app.services import schedule_service
from app.services.schedule_service import (
    build_schedule_suggestion,
    find_next_course,
    get_departure_status,
)


def make_test_database_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


@pytest.fixture
def client_and_session(
    tmp_path: Path,
) -> Generator[tuple[TestClient, sessionmaker], None, None]:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "schedule.db"))
    init_db(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with TestingSessionLocal() as session:
        seed_demo_data(session)

    def override_get_session() -> Generator[Session, None, None]:
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_session] = override_get_session
    try:
        yield TestClient(app), TestingSessionLocal
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def auth_headers(client: TestClient, username: str, *, configure: bool = True) -> dict[str, str]:
    register = client.post(
        "/api/auth/register",
        json={
            "username": username,
            "password": "secret123",
            "nickname": username.title(),
            "student_id": f"{username}-2026",
        },
    )
    assert register.status_code == 201
    login = client.post(
        "/api/auth/login",
        json={"username": username, "password": "secret123"},
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    if configure:
        response = client.put(
            "/api/semester",
            json={"start_date": "2026-08-31", "total_weeks": 20},
            headers=headers,
        )
        assert response.status_code == 200
    return headers


def first_two_buildings(session: Session) -> tuple[Building, Building]:
    buildings = list(session.scalars(select(Building).order_by(Building.id).limit(2)))
    assert len(buildings) == 2
    return buildings[0], buildings[1]


def create_service_user(
    session: Session,
    username: str,
    *,
    start_date: date | None = date(2026, 8, 31),
    total_weeks: int = 20,
) -> User:
    user = User(
        username=username,
        password_hash="test-hash",
        nickname=username.title(),
        student_id=f"{username}-2026",
    )
    session.add(user)
    session.flush()
    if start_date is not None:
        session.add(
            SemesterSetting(
                user_id=user.id,
                start_date=start_date,
                total_weeks=total_weeks,
            )
        )
    session.commit()
    session.refresh(user)
    return user


def add_course(
    session: Session,
    user: User,
    building: Building,
    *,
    course_name: str = "数据库原理",
    weekday: int = 1,
    start_time: str = "10:00",
    end_time: str = "11:40",
    weeks: str = "1-20",
    room_name: str = "A101",
) -> Course:
    course = Course(
        user_id=user.id,
        course_name=course_name,
        weekday=weekday,
        start_time=start_time,
        end_time=end_time,
        building_id=building.id,
        room_name=room_name,
        weeks=weeks,
    )
    session.add(course)
    session.commit()
    session.refresh(course)
    return course


def add_api_course(
    SessionLocal: sessionmaker,
    *,
    username: str,
    building_id: int,
    weekday: int,
    start_time: str,
    weeks: str = "1-20",
    room_name: str = "A101",
) -> int:
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.username == username))
        assert user is not None
        building = session.get(Building, building_id)
        assert building is not None
        return add_course(
            session,
            user,
            building,
            weekday=weekday,
            start_time=start_time,
            weeks=weeks,
            room_name=room_name,
        ).id


def assert_business_error(error: pytest.ExceptionInfo[BusinessError], code: str) -> None:
    assert error.value.code == code


@pytest.mark.parametrize(
    ("weeks", "teaching_week", "expected"),
    [
        ("2", 2, True),
        ("1-4", 2, True),
        ("1,2,4", 2, True),
        ("1-19(单)", 2, False),
        ("2-20(双)", 2, True),
    ],
)
def test_course_occurs_on_uses_strict_week_rule(
    weeks: str,
    teaching_week: int,
    expected: bool,
) -> None:
    course = SimpleNamespace(weekday=1, weeks=weeks)
    target_date = date(2026, 8, 31) + timedelta(weeks=teaching_week - 1)

    assert schedule_service.course_occurs_on(
        course,
        target_date=target_date,
        start_date=date(2026, 8, 31),
        total_weeks=20,
    ) is expected


def test_find_next_course_requires_semester_configuration(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        user = create_service_user(session, "unconfigured_service", start_date=None)
        with pytest.raises(BusinessError) as raised:
            find_next_course(
                session,
                user.id,
                now=datetime(2026, 9, 7, 8, 0, tzinfo=SHANGHAI_TZ),
            )

    assert_business_error(raised, "semester_unconfigured")


@pytest.mark.parametrize(
    "now",
    [
        datetime(2026, 8, 30, 8, 0, tzinfo=SHANGHAI_TZ),
        datetime(2027, 1, 18, 8, 0, tzinfo=SHANGHAI_TZ),
    ],
)
def test_find_next_course_rejects_dates_outside_semester(
    client_and_session: tuple[TestClient, sessionmaker],
    now: datetime,
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        user = create_service_user(session, f"inactive_{now:%m%d}")
        with pytest.raises(BusinessError) as raised:
            find_next_course(session, user.id, now=now)

    assert_business_error(raised, "semester_not_active")


def test_find_next_course_can_find_later_day_in_current_teaching_week(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    _, SessionLocal = client_and_session
    now = datetime(2026, 9, 7, 8, 0, tzinfo=SHANGHAI_TZ)  # week 2, Monday
    with SessionLocal() as session:
        user = create_service_user(session, "later_day")
        _, building = first_two_buildings(session)
        course = add_course(
            session,
            user,
            building,
            weekday=3,
            start_time="09:00",
            weeks="2",
        )

        result = find_next_course(session, user.id, now=now)

    assert result is not None
    assert result.course.id == course.id
    assert result.starts_at == datetime(2026, 9, 9, 9, 0, tzinfo=SHANGHAI_TZ)
    assert result.teaching_week == 2


def test_find_next_course_filters_out_courses_not_active_this_week(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        user = create_service_user(session, "week_filter")
        _, building = first_two_buildings(session)
        add_course(session, user, building, weekday=1, start_time="09:00", weeks="3-20")

        result = find_next_course(
            session,
            user.id,
            now=datetime(2026, 9, 7, 8, 0, tzinfo=SHANGHAI_TZ),
        )

    assert result is None


def test_find_next_course_does_not_cross_from_sunday_into_next_week(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        user = create_service_user(session, "sunday_boundary")
        _, building = first_two_buildings(session)
        add_course(session, user, building, weekday=1, start_time="09:00", weeks="3")

        result = find_next_course(
            session,
            user.id,
            now=datetime(2026, 9, 13, 20, 0, tzinfo=SHANGHAI_TZ),
        )

    assert result is None


def test_find_next_course_does_not_look_at_next_week_when_this_week_is_empty(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        user = create_service_user(session, "no_cross_week")
        _, building = first_two_buildings(session)
        add_course(session, user, building, weekday=3, start_time="09:00", weeks="3")

        result = find_next_course(
            session,
            user.id,
            now=datetime(2026, 9, 7, 8, 0, tzinfo=SHANGHAI_TZ),
        )

    assert result is None


def test_same_earliest_start_time_is_reported_as_schedule_conflict(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        user = create_service_user(session, "dirty_conflict")
        _, building = first_two_buildings(session)
        first = add_course(session, user, building, course_name="课程 A", weeks="2")
        second = add_course(session, user, building, course_name="课程 B", weeks="2")

        with pytest.raises(BusinessError) as raised:
            find_next_course(
                session,
                user.id,
                now=datetime(2026, 9, 7, 8, 0, tzinfo=SHANGHAI_TZ),
            )

    assert_business_error(raised, "schedule_conflict")
    assert raised.value.details["course_ids"] == [first.id, second.id]


@pytest.mark.parametrize("room_name", ["待确认教室", " 未知 ", "暂无"])
def test_earliest_course_with_incomplete_room_is_not_skipped(
    client_and_session: tuple[TestClient, sessionmaker],
    room_name: str,
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        user = create_service_user(session, f"bad_room_{len(room_name)}_{ord(room_name[0])}")
        _, building = first_two_buildings(session)
        incomplete = add_course(
            session,
            user,
            building,
            course_name="待修复地点课程",
            weekday=1,
            start_time="09:00",
            weeks="2",
            room_name=room_name,
        )
        add_course(
            session,
            user,
            building,
            course_name="稍后完整课程",
            weekday=1,
            start_time="10:00",
            weeks="2",
        )

        with pytest.raises(BusinessError) as raised:
            find_next_course(
                session,
                user.id,
                now=datetime(2026, 9, 7, 8, 0, tzinfo=SHANGHAI_TZ),
            )

    assert_business_error(raised, "course_location_incomplete")
    assert raised.value.details["course_id"] == incomplete.id


def test_earliest_course_requires_a_nonempty_building_name(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        user = create_service_user(session, "bad_building_name")
        _, building = first_two_buildings(session)
        course = add_course(session, user, building, weeks="2")
        building.name = "   "
        session.commit()

        with pytest.raises(BusinessError) as raised:
            find_next_course(
                session,
                user.id,
                now=datetime(2026, 9, 7, 8, 0, tzinfo=SHANGHAI_TZ),
            )

    assert_business_error(raised, "course_location_incomplete")
    assert raised.value.details["course_id"] == course.id


def test_complete_suggestion_exposes_real_week_location_and_aware_start(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        user = create_service_user(session, "complete_suggestion")
        from_building, target_building = first_two_buildings(session)
        course = add_course(
            session,
            user,
            target_building,
            weekday=3,
            start_time="09:00",
            weeks="2",
            room_name="A101",
        )

        suggestion = build_schedule_suggestion(
            session,
            user.id,
            ScheduleSuggestionRequest(current_building_id=from_building.id),
            now=datetime(2026, 9, 7, 8, 0, tzinfo=timezone.utc),
        )

    assert suggestion.next_course.id == course.id
    assert suggestion.next_course.room_name == "A101"
    assert suggestion.next_course.teaching_week == 2
    assert suggestion.next_course.start_at.isoformat() == "2026-09-09T09:00:00+08:00"
    assert suggestion.target_building.name.strip()
    assert suggestion.warning is None


def test_schedule_api_uses_injected_current_time_and_business_error_contract(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    username = "schedule_api"
    headers = auth_headers(client, username)
    with SessionLocal() as session:
        from_building, target_building = first_two_buildings(session)
    course_id = add_api_course(
        SessionLocal,
        username=username,
        building_id=target_building.id,
        weekday=3,
        start_time="09:00",
        weeks="2",
    )
    app.dependency_overrides[get_current_time] = lambda: datetime(
        2026, 9, 7, 8, 0, tzinfo=SHANGHAI_TZ
    )

    response = client.post(
        "/api/schedule/suggestion",
        json={"current_building_id": from_building.id},
        headers=headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["next_course"]["id"] == course_id
    assert data["next_course"]["teaching_week"] == 2
    assert data["next_course"]["start_at"] == "2026-09-09T09:00:00+08:00"
    assert "current_week" not in data


def test_schedule_api_rejects_browser_selected_week(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client, "browser_week")
    with SessionLocal() as session:
        from_building, _ = first_two_buildings(session)

    response = client.post(
        "/api/schedule/suggestion",
        json={"current_building_id": from_building.id, "current_week": 9},
        headers=headers,
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert "current_week" in response.json()["fields"]


def test_schedule_api_requires_semester_configuration(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client, "unconfigured_api", configure=False)
    with SessionLocal() as session:
        from_building, _ = first_two_buildings(session)
    app.dependency_overrides[get_current_time] = lambda: datetime(
        2026, 9, 7, 8, 0, tzinfo=SHANGHAI_TZ
    )

    response = client.post(
        "/api/schedule/suggestion",
        json={"current_building_id": from_building.id},
        headers=headers,
    )

    assert response.status_code == 409
    assert response.json()["code"] == "semester_unconfigured"


@pytest.mark.parametrize(
    ("now", "semester_status"),
    [
        (datetime(2026, 8, 30, 8, 0, tzinfo=SHANGHAI_TZ), "before_term"),
        (datetime(2027, 1, 18, 8, 0, tzinfo=SHANGHAI_TZ), "after_term"),
    ],
)
def test_schedule_api_rejects_dates_outside_semester(
    client_and_session: tuple[TestClient, sessionmaker],
    now: datetime,
    semester_status: str,
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client, f"inactive_api_{semester_status}")
    with SessionLocal() as session:
        from_building, _ = first_two_buildings(session)
    app.dependency_overrides[get_current_time] = lambda: now

    response = client.post(
        "/api/schedule/suggestion",
        json={"current_building_id": from_building.id},
        headers=headers,
    )

    assert response.status_code == 409
    assert response.json()["code"] == "semester_not_active"
    assert response.json()["details"]["semester_status"] == semester_status


def test_schedule_api_returns_no_upcoming_without_looking_at_next_week(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    username = "no_upcoming_api"
    headers = auth_headers(client, username)
    with SessionLocal() as session:
        from_building, target_building = first_two_buildings(session)
    add_api_course(
        SessionLocal,
        username=username,
        building_id=target_building.id,
        weekday=1,
        start_time="09:00",
        weeks="3",
    )
    app.dependency_overrides[get_current_time] = lambda: datetime(
        2026, 9, 13, 20, 0, tzinfo=SHANGHAI_TZ
    )

    response = client.post(
        "/api/schedule/suggestion",
        json={"current_building_id": from_building.id},
        headers=headers,
    )

    assert response.status_code == 404
    assert response.json()["code"] == "no_upcoming_course"


def test_schedule_endpoint_documents_business_errors(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    responses = client.get("/openapi.json").json()["paths"][
        "/api/schedule/suggestion"
    ]["post"]["responses"]
    expected = {"$ref": "#/components/schemas/BusinessErrorResponse"}

    assert responses["409"]["content"]["application/json"]["schema"] == expected
    assert responses["404"]["content"]["application/json"]["schema"] == expected
    assert responses["422"]["content"]["application/json"]["schema"] == expected


def test_schedule_suggestion_without_token_returns_401(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session

    response = client.post(
        "/api/schedule/suggestion",
        json={"current_building_id": 1},
    )

    assert response.status_code == 401


def test_distance_walk_and_departure_helpers_are_stable() -> None:
    assert haversine_distance_meters(30.0, 114.0, 30.0, 114.0) == 0
    distance = haversine_distance_meters(30.0, 114.0, 30.001, 114.0)
    assert 100 <= distance <= 120
    assert estimate_walk_minutes(0) == 0
    assert estimate_walk_minutes(161) == 3

    now = datetime(2026, 9, 7, 8, 0, tzinfo=SHANGHAI_TZ)
    assert get_departure_status(now, now + timedelta(minutes=6)) == "normal"
    assert get_departure_status(now, now + timedelta(minutes=4)) == "tight"
    assert get_departure_status(now, now - timedelta(minutes=1)) == "likely_late"
