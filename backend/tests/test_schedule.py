from collections.abc import Generator
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.db.database import Base, create_sqlite_engine, get_session, init_db
from app.db.seed import seed_demo_data
from app.main import app
from app.models import Building, Course, User
from app.schemas.schedule import ScheduleSuggestionRequest
from app.services.location_service import (
    estimate_walk_minutes,
    haversine_distance_meters,
)
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


def auth_headers(client: TestClient, username: str = "schedule_user") -> dict[str, str]:
    client.post(
        "/api/auth/register",
        json={
            "username": username,
            "password": "secret123",
            "nickname": username.title(),
            "student_id": f"{username}-2026",
        },
    )
    login = client.post(
        "/api/auth/login",
        json={"username": username, "password": "secret123"},
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def first_two_building_ids(client: TestClient) -> tuple[int, int]:
    response = client.get("/api/buildings")
    assert response.status_code == 200
    buildings = response.json()
    return buildings[0]["id"], buildings[1]["id"]


def create_course_payload(building_id: int, **overrides: object) -> dict[str, object]:
    tomorrow_weekday = (datetime.now() + timedelta(days=1)).isoweekday()
    payload: dict[str, object] = {
        "course_name": "Schedule Design",
        "weekday": tomorrow_weekday,
        "start_time": "10:00",
        "end_time": "11:40",
        "building_id": building_id,
        "room_name": "A101",
        "teacher": "Teacher Wang",
        "weeks": "1-16",
    }
    payload.update(overrides)
    return payload


def add_course(
    session: Session,
    user: User,
    building: Building,
    *,
    course_name: str,
    weekday: int,
    start_time: str,
    end_time: str = "11:40",
) -> Course:
    course = Course(
        user_id=user.id,
        course_name=course_name,
        weekday=weekday,
        start_time=start_time,
        end_time=end_time,
        building_id=building.id,
        room_name="A101",
    )
    session.add(course)
    session.commit()
    session.refresh(course)
    return course


def create_service_user(session: Session, username: str) -> User:
    user = User(
        username=username,
        password_hash="test-hash",
        nickname=username.title(),
        student_id=f"{username}-2026",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_schedule_suggestion_without_token_returns_401(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session

    response = client.post(
        "/api/schedule/suggestion",
        json={"current_building_id": 1},
    )

    assert response.status_code == 401


def test_schedule_suggestion_with_current_building_returns_success(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    from_building_id, target_building_id = first_two_building_ids(client)
    headers = auth_headers(client)
    created = client.post(
        "/api/courses",
        json=create_course_payload(target_building_id),
        headers=headers,
    )
    assert created.status_code == 201

    response = client.post(
        "/api/schedule/suggestion",
        json={"current_building_id": from_building_id},
        headers=headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["next_course"]["course_name"] == "Schedule Design"
    assert data["from_location"]["building_id"] == from_building_id
    assert data["target_building"]["id"] == target_building_id
    assert data["distance_meters"] >= 0
    assert data["walk_minutes"] >= 0
    assert data["buffer_minutes"] == 10
    assert data["suggest_departure_time"]
    assert data["status"] in {"normal", "tight", "likely_late"}
    assert "预计步行" in data["text"]


def test_schedule_suggestion_with_coordinates_returns_success(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    _, target_building_id = first_two_building_ids(client)
    headers = auth_headers(client)
    created = client.post(
        "/api/courses",
        json=create_course_payload(target_building_id),
        headers=headers,
    )
    assert created.status_code == 201

    response = client.post(
        "/api/schedule/suggestion",
        json={"latitude": 30.58, "longitude": 114.32},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["from_location"]["name"] == "当前位置"


def test_schedule_suggestion_without_courses_returns_404(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    from_building_id, _ = first_two_building_ids(client)
    headers = auth_headers(client)

    response = client.post(
        "/api/schedule/suggestion",
        json={"current_building_id": from_building_id},
        headers=headers,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "No upcoming course found"


def test_schedule_suggestion_with_missing_current_building_returns_404(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client)

    response = client.post(
        "/api/schedule/suggestion",
        json={"current_building_id": 999999},
        headers=headers,
    )

    assert response.status_code == 404


def test_find_next_course_selects_nearest_course_after_current_time(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    _, SessionLocal = client_and_session
    now = datetime(2026, 5, 29, 9, 0)

    with SessionLocal() as session:
        user = create_service_user(session, "next_course_user")
        building = session.query(Building).first()
        assert building is not None
        add_course(
            session,
            user,
            building,
            course_name="Later Course",
            weekday=now.isoweekday(),
            start_time="14:00",
        )
        add_course(
            session,
            user,
            building,
            course_name="Soon Course",
            weekday=now.isoweekday(),
            start_time="10:00",
        )

        result = find_next_course(session, user.id, now=now)

    assert result is not None
    assert result.course.course_name == "Soon Course"
    assert result.starts_at == datetime(2026, 5, 29, 10, 0)


def test_find_next_course_falls_back_to_future_days(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    _, SessionLocal = client_and_session
    now = datetime(2026, 5, 29, 12, 0)

    with SessionLocal() as session:
        user = create_service_user(session, "future_course_user")
        building = session.query(Building).first()
        assert building is not None
        add_course(
            session,
            user,
            building,
            course_name="Past Today",
            weekday=now.isoweekday(),
            start_time="08:00",
        )
        add_course(
            session,
            user,
            building,
            course_name="Tomorrow Course",
            weekday=(now + timedelta(days=1)).isoweekday(),
            start_time="09:00",
        )

        result = find_next_course(session, user.id, now=now)

    assert result is not None
    assert result.course.course_name == "Tomorrow Course"
    assert result.starts_at == datetime(2026, 5, 30, 9, 0)


def test_same_time_courses_choose_smallest_id_and_return_warning(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    _, SessionLocal = client_and_session
    now = datetime(2026, 5, 29, 8, 0)

    with SessionLocal() as session:
        user = create_service_user(session, "same_time_user")
        buildings = session.query(Building).order_by(Building.id).limit(2).all()
        assert len(buildings) == 2
        first = add_course(
            session,
            user,
            buildings[1],
            course_name="First Same Time",
            weekday=now.isoweekday(),
            start_time="10:00",
        )
        add_course(
            session,
            user,
            buildings[1],
            course_name="Second Same Time",
            weekday=now.isoweekday(),
            start_time="10:00",
        )

        suggestion = build_schedule_suggestion(
            session,
            user.id,
            ScheduleSuggestionRequest(current_building_id=buildings[0].id),
            now=now,
        )

    assert suggestion.next_course.id == first.id
    assert suggestion.warning == "该时间段有多门课程，已选择最先创建的一门。"


def test_distance_and_walk_estimation_are_reasonable() -> None:
    assert haversine_distance_meters(30.0, 114.0, 30.0, 114.0) == 0
    distance = haversine_distance_meters(30.0, 114.0, 30.001, 114.0)

    assert 100 <= distance <= 120
    assert estimate_walk_minutes(0) == 0
    assert estimate_walk_minutes(161) == 3


def test_departure_status_levels() -> None:
    now = datetime(2026, 5, 29, 8, 0)

    assert get_departure_status(now, datetime(2026, 5, 29, 8, 6)) == "normal"
    assert get_departure_status(now, datetime(2026, 5, 29, 8, 4)) == "tight"
    assert get_departure_status(now, datetime(2026, 5, 29, 7, 59)) == "likely_late"
