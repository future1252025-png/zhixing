from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.db.database import Base, create_sqlite_engine, get_session, init_db
from app.db.seed import seed_demo_data
from app.main import app
from app.models import Building, Course, User


def make_test_database_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


@pytest.fixture
def client_and_session(
    tmp_path: Path,
) -> Generator[tuple[TestClient, sessionmaker], None, None]:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "courses.db"))
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


def auth_headers(client: TestClient, username: str = "alice") -> dict[str, str]:
    client.post(
        "/api/auth/register",
        json={
            "username": username,
            "password": "secret123",
            "nickname": username.title(),
            "student_id": f"{username}-2024",
        },
    )
    login = client.post(
        "/api/auth/login",
        json={"username": username, "password": "secret123"},
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def get_first_building_id(client: TestClient) -> int:
    response = client.get("/api/buildings")
    assert response.status_code == 200
    return response.json()[0]["id"]


def course_payload(building_id: int, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "course_name": "Mobile App Design",
        "weekday": 1,
        "start_time": "08:00",
        "end_time": "09:40",
        "building_id": building_id,
        "room_name": "A101",
        "teacher": "Teacher Li",
        "weeks": "1-16",
    }
    payload.update(overrides)
    return payload


def test_list_courses_without_token_returns_401(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session

    response = client.get("/api/courses")

    assert response.status_code == 401


def test_list_courses_returns_only_current_user_courses(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client, "alice")
    auth_headers(client, "bob")

    with SessionLocal() as session:
        building = session.query(Building).first()
        alice = session.query(User).filter(User.username == "alice").one()
        bob = session.query(User).filter(User.username == "bob").one()
        assert building is not None
        session.add_all(
            [
                Course(
                    user_id=alice.id,
                    course_name="Alice Course",
                    weekday=2,
                    start_time="10:00",
                    end_time="11:40",
                    building_id=building.id,
                    room_name="B201",
                ),
                Course(
                    user_id=bob.id,
                    course_name="Bob Course",
                    weekday=2,
                    start_time="10:00",
                    end_time="11:40",
                    building_id=building.id,
                    room_name="B202",
                ),
            ]
        )
        session.commit()

    response = client.get("/api/courses", headers=headers)

    assert response.status_code == 200
    courses = response.json()
    assert [course["course_name"] for course in courses] == ["Alice Course"]
    assert courses[0]["building"]["id"] == get_first_building_id(client)
    assert courses[0]["building"]["name"]
    assert "user" not in courses[0]


def test_create_course_success(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client)
    building_id = get_first_building_id(client)

    response = client.post(
        "/api/courses",
        json=course_payload(building_id),
        headers=headers,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["course_name"] == "Mobile App Design"
    assert data["weekday"] == 1
    assert data["room_name"] == "A101"
    assert data["building"]["id"] == building_id
    assert "password_hash" not in data


def test_create_course_with_missing_building_returns_404(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client)

    response = client.post(
        "/api/courses",
        json=course_payload(999999),
        headers=headers,
    )

    assert response.status_code == 404


def test_create_course_with_invalid_weekday_fails(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client)
    building_id = get_first_building_id(client)

    response = client.post(
        "/api/courses",
        json=course_payload(building_id, weekday=8),
        headers=headers,
    )

    assert response.status_code == 422


def test_create_course_with_end_time_before_start_time_fails(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client)
    building_id = get_first_building_id(client)

    response = client.post(
        "/api/courses",
        json=course_payload(building_id, start_time="09:40", end_time="08:00"),
        headers=headers,
    )

    assert response.status_code == 422


def test_update_own_course_success(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client)
    building_id = get_first_building_id(client)
    created = client.post(
        "/api/courses",
        json=course_payload(building_id),
        headers=headers,
    )
    assert created.status_code == 201

    response = client.put(
        f"/api/courses/{created.json()['id']}",
        json={"course_name": "Updated Course", "room_name": "C301"},
        headers=headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["course_name"] == "Updated Course"
    assert data["room_name"] == "C301"


def test_update_missing_course_returns_404(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client)

    response = client.put(
        "/api/courses/999999",
        json={"course_name": "Updated Course"},
        headers=headers,
    )

    assert response.status_code == 404


def test_delete_own_course_success(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client)
    building_id = get_first_building_id(client)
    created = client.post(
        "/api/courses",
        json=course_payload(building_id),
        headers=headers,
    )
    assert created.status_code == 201
    course_id = created.json()["id"]

    response = client.delete(f"/api/courses/{course_id}", headers=headers)

    assert response.status_code == 204
    courses = client.get("/api/courses", headers=headers).json()
    assert all(course["id"] != course_id for course in courses)


def test_delete_missing_course_returns_404(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client)

    response = client.delete("/api/courses/999999", headers=headers)

    assert response.status_code == 404


def test_user_cannot_access_another_users_course(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    alice_headers = auth_headers(client, "alice")
    bob_headers = auth_headers(client, "bob")
    building_id = get_first_building_id(client)
    created = client.post(
        "/api/courses",
        json=course_payload(building_id, course_name="Bob Course"),
        headers=bob_headers,
    )
    assert created.status_code == 201
    bob_course_id = created.json()["id"]

    alice_courses = client.get("/api/courses", headers=alice_headers)
    update_response = client.put(
        f"/api/courses/{bob_course_id}",
        json={"course_name": "Hijacked"},
        headers=alice_headers,
    )
    delete_response = client.delete(
        f"/api/courses/{bob_course_id}",
        headers=alice_headers,
    )

    assert alice_courses.status_code == 200
    assert all(course["id"] != bob_course_id for course in alice_courses.json())
    assert update_response.status_code == 404
    assert delete_response.status_code == 404
