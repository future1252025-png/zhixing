from collections.abc import Generator
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.db.database import Base, create_sqlite_engine, get_session, init_db
from app.main import app
from app.models import User
from app.schemas.auth import RegisterRequest
from app.services.auth_service import DuplicateUserError, create_user


def make_test_database_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


@pytest.fixture
def client_and_session(
    tmp_path: Path,
) -> Generator[tuple[TestClient, sessionmaker], None, None]:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "auth.db"))
    init_db(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

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


def register_payload(username: str = "alice") -> dict[str, str]:
    return {
        "username": username,
        "password": "secret123",
        "nickname": "Alice",
        "student_id": f"{username}-2024",
    }


def test_register_success_hashes_password_and_hides_hash(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    response = client.post("/api/auth/register", json=register_payload())

    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "alice"
    assert data["nickname"] == "Alice"
    assert "password_hash" not in data

    with SessionLocal() as session:
        user = session.query(User).filter(User.username == "alice").one()
        assert user.password_hash != "secret123"
        assert user.password_hash.startswith("$2")


def test_register_duplicate_username_fails(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    payload = register_payload()

    first = client.post("/api/auth/register", json=payload)
    second = client.post("/api/auth/register", json=payload | {"student_id": "other"})

    assert first.status_code == 201
    assert second.status_code == 400
    assert second.json()["detail"] == "用户名已存在"


def test_login_success_returns_bearer_token(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    client.post("/api/auth/register", json=register_payload())

    response = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "secret123"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["access_token"]
    assert data["token_type"] == "bearer"
    assert data["user"]["username"] == "alice"
    assert "password_hash" not in data["user"]


def test_login_wrong_password_fails(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    client.post("/api/auth/register", json=register_payload())

    response = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "用户名或密码错误"


def test_me_with_valid_token_returns_current_user(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    client.post("/api/auth/register", json=register_payload())
    login = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "secret123"},
    )
    token = login.json()["access_token"]

    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["username"] == "alice"


def test_me_without_token_returns_401(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session

    response = client.get("/api/auth/me")

    assert response.status_code == 401


def test_me_with_invalid_token_returns_401(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session

    response = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer not-a-valid-token"},
    )

    assert response.status_code == 401


def test_update_profile_changes_nickname_and_avatar(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    client.post("/api/auth/register", json=register_payload())
    login = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "secret123"},
    )
    token = login.json()["access_token"]

    response = client.patch(
        "/api/auth/me",
        json={
            "nickname": "小智同学",
            "avatar_text": "智",
            "avatar_color": "#0b766f",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["nickname"] == "小智同学"
    assert data["avatar_text"] == "智"
    assert data["avatar_color"] == "#0b766f"
    assert "password_hash" not in data

    with SessionLocal() as session:
        user = session.query(User).filter(User.username == "alice").one()
        assert user.nickname == "小智同学"
        assert user.avatar_text == "智"
        assert user.avatar_color == "#0b766f"


def test_update_profile_requires_login(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session

    response = client.patch(
        "/api/auth/me",
        json={"nickname": "访客", "avatar_text": "访", "avatar_color": "#2b6fbe"},
    )

    assert response.status_code == 401


def test_verify_password_rejects_invalid_hash_without_raising() -> None:
    from app.core.security import verify_password

    assert verify_password("demo123", "demo-password-hash-placeholder") is False
    assert verify_password("demo123", "") is False


def test_demo_seed_user_can_login(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    from app.db.seed import DEMO_PASSWORD, DEMO_USERNAME, seed_demo_data

    client, SessionLocal = client_and_session
    with SessionLocal() as session:
        seed_demo_data(session)

    response = client.post(
        "/api/auth/login",
        json={"username": DEMO_USERNAME, "password": DEMO_PASSWORD},
    )

    assert response.status_code == 200
    assert response.json()["user"]["username"] == DEMO_USERNAME


@pytest.mark.parametrize(
    "database_message",
    [
        "UNIQUE constraint failed: users.username",
        "UNIQUE constraint failed: users.student_id",
    ],
)
def test_create_user_maps_confirmed_identity_unique_collision(
    database_message: str,
) -> None:
    session = MagicMock(spec=Session)
    error = IntegrityError("INSERT INTO users", {}, Exception(database_message))
    session.commit.side_effect = error
    payload = RegisterRequest(**register_payload("race-user"))

    with pytest.raises(DuplicateUserError) as caught:
        create_user(session, payload)

    assert caught.value.__cause__ is error
    session.rollback.assert_called_once_with()


@pytest.mark.parametrize(
    "database_message",
    [
        "UNIQUE constraint failed: buildings.name",
        "FOREIGN KEY constraint failed",
        "database disk image is malformed",
    ],
)
def test_create_user_reraises_unrelated_integrity_error_after_rollback(
    database_message: str,
) -> None:
    session = MagicMock(spec=Session)
    error = IntegrityError("INSERT INTO users", {}, Exception(database_message))
    session.commit.side_effect = error
    payload = RegisterRequest(**register_payload("integrity-user"))

    with pytest.raises(IntegrityError) as caught:
        create_user(session, payload)

    assert caught.value is error
    session.rollback.assert_called_once_with()
