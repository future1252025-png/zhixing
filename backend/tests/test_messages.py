from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.db.database import Base, create_sqlite_engine, get_session, init_db
from app.db.seed import seed_demo_data
from app.main import app
from app.models import Building, Message, User


def make_test_database_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


@pytest.fixture
def client_and_session(
    tmp_path: Path,
) -> Generator[tuple[TestClient, sessionmaker], None, None]:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "messages.db"))
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


def get_first_building_id(client: TestClient) -> int:
    buildings = client.get("/api/buildings").json()
    return buildings[0]["id"]


def auth_headers(client: TestClient, username: str = "alice") -> dict[str, str]:
    client.post(
        "/api/auth/register",
        json={
            "username": username,
            "password": "secret123",
            "nickname": "Alice",
            "student_id": f"{username}-2024",
        },
    )
    login = client.post(
        "/api/auth/login",
        json={"username": username, "password": "secret123"},
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_get_messages_without_token_returns_401(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    building_id = get_first_building_id(client)

    response = client.get(f"/api/buildings/{building_id}/messages")

    assert response.status_code == 401


def test_get_messages_with_token_returns_seed_messages(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    building_id = get_first_building_id(client)

    response = client.get(
        f"/api/buildings/{building_id}/messages",
        headers=auth_headers(client),
    )

    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert len(response.json()) >= 1


def test_messages_are_returned_in_created_at_ascending_order(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)

    with SessionLocal() as session:
        building = session.query(Building).first()
        user = session.query(User).filter(User.username == "alice").one()
        assert building is not None
        session.query(Message).filter(Message.building_id == building.id).delete()
        base_time = datetime(2026, 5, 29, 8, 0, tzinfo=timezone.utc)
        session.add_all(
            [
                Message(
                    building_id=building.id,
                    user_id=user.id,
                    content="second",
                    display_name="Other",
                    status="normal",
                    created_at=base_time + timedelta(minutes=2),
                ),
                Message(
                    building_id=building.id,
                    user_id=user.id,
                    content="hidden",
                    display_name="Other",
                    status="hidden",
                    created_at=base_time + timedelta(minutes=1),
                ),
                Message(
                    building_id=building.id,
                    user_id=user.id,
                    content="first",
                    display_name="Other",
                    status="normal",
                    created_at=base_time,
                ),
            ]
        )
        session.commit()
        building_id = building.id

    response = client.get(f"/api/buildings/{building_id}/messages", headers=headers)

    assert response.status_code == 200
    assert [message["content"] for message in response.json()] == ["first", "second"]


def test_get_messages_for_missing_building_returns_404(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session

    response = client.get(
        "/api/buildings/999999/messages",
        headers=auth_headers(client),
    )

    assert response.status_code == 404


def test_create_message_without_token_returns_401(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    building_id = get_first_building_id(client)

    response = client.post(
        f"/api/buildings/{building_id}/messages",
        json={"content": "hello"},
    )

    assert response.status_code == 401


def test_create_message_with_token_returns_anonymous_message(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    building_id = get_first_building_id(client)

    response = client.post(
        f"/api/buildings/{building_id}/messages",
        json={"content": "  今天这里很安静  "},
        headers=auth_headers(client),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["building_id"] == building_id
    assert data["content"] == "今天这里很安静"
    assert data["display_name"] == "匿名同学"
    assert "password_hash" not in data
    assert "user" not in data


def test_create_empty_message_fails(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    building_id = get_first_building_id(client)

    response = client.post(
        f"/api/buildings/{building_id}/messages",
        json={"content": "   "},
        headers=auth_headers(client),
    )

    assert response.status_code == 422


def test_create_message_over_200_chars_fails(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    building_id = get_first_building_id(client)

    response = client.post(
        f"/api/buildings/{building_id}/messages",
        json={"content": "a" * 201},
        headers=auth_headers(client),
    )

    assert response.status_code == 422


def test_create_message_for_missing_building_returns_404(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session

    response = client.post(
        "/api/buildings/999999/messages",
        json={"content": "hello"},
        headers=auth_headers(client),
    )

    assert response.status_code == 404
