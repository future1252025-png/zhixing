from collections.abc import Generator
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.core import rate_limit
from app.core.rate_limit import SlidingWindowRateLimiter
from app.db.database import Base, create_sqlite_engine, get_session, init_db
from app.main import app
from app.models import (
    Building,
    Course,
    CourseImportSource,
    Message,
    RefreshSession,
    SemesterSetting,
    User,
)
from app.schemas.auth import RegisterRequest
from app.services.auth_service import DuplicateUserError, authenticate_user, create_user


def make_test_database_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


@pytest.fixture(autouse=True)
def reset_rate_limiters() -> Generator[None, None, None]:
    rate_limit.reset_all()
    yield
    rate_limit.reset_all()


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


def register_payload(student_id: str = "alice") -> dict[str, str]:
    return {
        "student_id": student_id,
        "password": "secret123",
        "nickname": "Alice",
    }


def test_register_success_hashes_password_and_hides_hash(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    response = client.post("/api/auth/register", json=register_payload())

    assert response.status_code == 201
    data = response.json()
    assert data["student_id"] == "alice"
    assert data["nickname"] == "Alice"
    assert "password_hash" not in data

    with SessionLocal() as session:
        user = session.query(User).filter(User.student_id == "alice").one()
        assert user.password_hash != "secret123"
        assert user.password_hash.startswith("$2")


def test_register_duplicate_student_id_fails(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    payload = register_payload()

    first = client.post("/api/auth/register", json=payload)
    second = client.post("/api/auth/register", json=payload)

    assert first.status_code == 201
    assert second.status_code == 400
    assert second.json()["detail"] == "学号已存在"


def test_register_legacy_username_only_mirrors_student_id(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    response = client.post(
        "/api/auth/register",
        json={"username": "legacy-id", "password": "secret123", "nickname": "Legacy"},
    )

    assert response.status_code == 201
    assert response.json()["student_id"] == "legacy-id"
    assert "username" not in response.json()


def test_register_rejects_disagreeing_legacy_username(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session

    response = client.post(
        "/api/auth/register",
        json=register_payload() | {"username": "different-id"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_login_success_returns_bearer_token(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    client.post("/api/auth/register", json=register_payload())

    response = client.post(
        "/api/auth/login",
        json={"student_id": "alice", "password": "secret123"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["access_token"]
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 30 * 60
    assert "refresh_token" not in data
    assert response.cookies.get("campusmind_refresh")
    assert data["user"]["student_id"] == "alice"
    assert "password_hash" not in data["user"]


def test_login_wrong_password_fails(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    client.post("/api/auth/register", json=register_payload())

    response = client.post(
        "/api/auth/login",
        json={"student_id": "alice", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "学号或密码错误"


def test_login_unknown_student_id_fails_with_same_detail(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session

    response = client.post(
        "/api/auth/login",
        json={"student_id": "no-such-user", "password": "whatever-pass"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "学号或密码错误"


def test_authenticate_user_verifies_dummy_hash_when_user_missing(
    client_and_session: tuple[TestClient, sessionmaker],
    monkeypatch,
) -> None:
    import app.services.auth_service as auth_service_module

    _, SessionLocal = client_and_session
    calls: list[str] = []
    original_verify = auth_service_module.verify_password

    def recording_verify(password: str, password_hash: str) -> bool:
        calls.append(password_hash)
        return original_verify(password, password_hash)

    monkeypatch.setattr(auth_service_module, "verify_password", recording_verify)

    with SessionLocal() as session:
        result = authenticate_user(session, "ghost-user", "irrelevant-pw")

    # The unknown-student-ID path must still burn one bcrypt verification so
    # response timing does not reveal whether the account exists.
    assert result is None
    assert calls == [auth_service_module._TIMING_EQUALIZATION_HASH]


def test_me_with_valid_token_returns_current_user(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    client.post("/api/auth/register", json=register_payload())
    login = client.post(
        "/api/auth/login",
        json={"student_id": "alice", "password": "secret123"},
    )
    token = login.json()["access_token"]

    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["student_id"] == "alice"


def test_access_token_uses_stable_random_account_subject(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    from app.core.config import settings

    client, SessionLocal = client_and_session
    client.post("/api/auth/register", json=register_payload())
    response = client.post(
        "/api/auth/login",
        json={"student_id": "alice", "password": "secret123"},
    )
    with SessionLocal() as session:
        token_subject = session.scalar(
            select(User.token_subject).where(User.student_id == "alice")
        )

    claims = jwt.decode(
        response.json()["access_token"],
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
        audience="campusmind-client",
        issuer="campusmind-api",
    )

    assert claims["sub"] == f"account:{token_subject}"
    assert claims["sub_kind"] == "account"


def test_me_accepts_unexpired_legacy_username_subject_token(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    from app.core.config import settings

    client, _ = client_and_session
    client.post("/api/auth/register", json=register_payload())
    now = datetime.now(timezone.utc)
    legacy_token = jwt.encode(
        {
            "sub": "alice",
            "typ": "access",
            "iss": "campusmind-api",
            "aud": "campusmind-client",
            "jti": "legacy-token-test",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )

    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {legacy_token}"},
    )

    assert response.status_code == 200
    assert response.json()["student_id"] == "alice"


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
        json={"student_id": "alice", "password": "secret123"},
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
        user = session.query(User).filter(User.student_id == "alice").one()
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


def test_update_profile_rejects_blank_nickname(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    client.post("/api/auth/register", json=register_payload())
    login = client.post(
        "/api/auth/login",
        json={"student_id": "alice", "password": "secret123"},
    )

    response = client.patch(
        "/api/auth/me",
        json={"nickname": "   ", "avatar_text": None, "avatar_color": None},
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_verify_password_rejects_invalid_hash_without_raising() -> None:
    from app.core.security import verify_password

    assert verify_password("demo123", "demo-password-hash-placeholder") is False
    assert verify_password("demo123", "") is False


def test_demo_seed_user_can_login(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    from app.db.seed import (
        DEMO_PASSWORD,
        DEMO_STUDENT_ID,
        DEMO_USERNAME,
        seed_demo_data,
    )

    client, SessionLocal = client_and_session
    with SessionLocal() as session:
        seed_demo_data(session)

    response = client.post(
        "/api/auth/login",
        json={"student_id": DEMO_USERNAME, "password": DEMO_PASSWORD},
    )

    assert response.status_code == 200
    assert response.json()["user"]["student_id"] == DEMO_STUDENT_ID


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


def test_cors_preflight_allows_refresh_cookie_credentials_for_known_origin(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session

    response = client.options(
        "/api/auth/login",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    # Access tokens stay in the Authorization header; only the rotating web
    # refresh token uses an HttpOnly cookie.
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_native_login_returns_refresh_token_but_never_stores_it_raw(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    client.post("/api/auth/register", json=register_payload())

    response = client.post(
        "/api/auth/login",
        json={
            "student_id": "alice",
            "password": "secret123",
            "client_kind": "native",
        },
    )

    assert response.status_code == 200
    refresh_token = response.json()["refresh_token"]
    assert len(refresh_token) >= 64
    assert response.cookies.get("campusmind_refresh") is None
    with SessionLocal() as session:
        stored = session.query(RefreshSession).one()
        assert stored.token_hash != refresh_token
        assert len(stored.token_hash) == 64


def test_new_login_removes_refresh_families_past_absolute_expiry(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    client.post("/api/auth/register", json=register_payload())
    payload = {
            "student_id": "alice",
        "password": "secret123",
        "client_kind": "native",
    }
    assert client.post("/api/auth/login", json=payload).status_code == 200

    with SessionLocal() as session:
        expired = session.query(RefreshSession).one()
        expired.absolute_expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        session.add(expired)
        session.commit()

    assert client.post("/api/auth/login", json=payload).status_code == 200
    with SessionLocal() as session:
        assert session.query(RefreshSession).count() == 1


def test_new_logins_cap_active_refresh_families_per_user(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    client.post("/api/auth/register", json=register_payload())
    payload = {
            "student_id": "alice",
        "password": "secret123",
        "client_kind": "native",
    }

    for _ in range(12):
        assert client.post("/api/auth/login", json=payload).status_code == 200

    with SessionLocal() as session:
        user_id = session.scalar(select(User.id).where(User.student_id == "alice"))
        active_families = session.scalar(
            select(func.count(func.distinct(RefreshSession.family_id))).where(
                RefreshSession.user_id == user_id,
                RefreshSession.revoked_at.is_(None),
            )
        )
        revoked_families = session.scalar(
            select(func.count(func.distinct(RefreshSession.family_id))).where(
                RefreshSession.user_id == user_id,
                RefreshSession.revoked_at.is_not(None),
            )
        )

    assert active_families == 10
    assert revoked_families == 2


def test_native_refresh_rotates_token_and_rejects_replay(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    client.post("/api/auth/register", json=register_payload())
    login = client.post(
        "/api/auth/login",
        json={
            "student_id": "alice",
            "password": "secret123",
            "client_kind": "native",
        },
    )
    first_refresh_token = login.json()["refresh_token"]

    rotated = client.post(
        "/api/auth/refresh",
        json={"client_kind": "native", "refresh_token": first_refresh_token},
    )

    assert rotated.status_code == 200
    second_refresh_token = rotated.json()["refresh_token"]
    assert second_refresh_token != first_refresh_token
    assert rotated.json()["user"]["student_id"] == "alice"
    assert "password_hash" not in rotated.json()["user"]
    access_token = rotated.json()["access_token"]
    assert client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    ).status_code == 200

    replay = client.post(
        "/api/auth/refresh",
        json={"client_kind": "native", "refresh_token": first_refresh_token},
    )
    assert replay.status_code == 401

    # Reusing a consumed token revokes its entire family, including the latest
    # generation that an attacker may already have copied.
    latest_after_replay = client.post(
        "/api/auth/refresh",
        json={"client_kind": "native", "refresh_token": second_refresh_token},
    )
    assert latest_after_replay.status_code == 401


def test_delete_account_requires_authentication(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session

    response = client.request(
        "DELETE",
        "/api/auth/me",
        json={"password": "secret123"},
    )

    assert response.status_code == 401


def test_delete_account_rejects_wrong_password_without_removing_data(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    client.post("/api/auth/register", json=register_payload())
    login = client.post(
        "/api/auth/login",
        json={
            "student_id": "alice",
            "password": "secret123",
            "client_kind": "native",
        },
    )
    access_token = login.json()["access_token"]

    response = client.request(
        "DELETE",
        "/api/auth/me",
        json={"password": "wrong-password"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 401
    with SessionLocal() as session:
        assert session.scalar(select(User).where(User.student_id == "alice")) is not None
        assert session.scalar(select(func.count(RefreshSession.id))) == 1


def test_delete_account_removes_owned_data_and_revokes_sessions(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    client.post("/api/auth/register", json=register_payload())
    login = client.post(
        "/api/auth/login",
        json={
            "student_id": "alice",
            "password": "secret123",
            "client_kind": "native",
        },
    )
    access_token = login.json()["access_token"]
    refresh_token = login.json()["refresh_token"]

    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.student_id == "alice"))
        assert user is not None
        building = Building(
            name="账号删除测试楼",
            type="教学楼",
            description="测试",
            latitude=30.0,
            longitude=114.0,
            map_x=50.0,
            map_y=50.0,
        )
        course = Course(
            user_id=user.id,
            course_name="待删除课程",
            weekday=1,
            start_time="08:00",
            end_time="09:40",
            room_name="101",
            teacher="教师",
            weeks="1-16",
            source_kind="import",
            building=building,
        )
        session.add_all(
            [
                course,
                SemesterSetting(
                    user_id=user.id,
                    start_date=date(2026, 9, 1),
                    total_weeks=20,
                ),
            ]
        )
        session.flush()
        session.add_all(
            [
                CourseImportSource(
                    course_id=course.id,
                    filename="课表.xlsx",
                    file_sha256="a" * 64,
                    source_row="2",
                    raw_course_name="待删除课程",
                    raw_weekday="星期一",
                    raw_time_or_section="1-2节",
                    raw_teacher="教师",
                    raw_weeks="1-16周",
                    raw_location="账号删除测试楼101",
                ),
                Message(
                    building_id=building.id,
                    user_id=user.id,
                    content="待删除留言",
                    display_name="匿名同学",
                    room_name="101",
                    distance_to_building_meters=10.0,
                ),
            ]
        )
        session.commit()

    response = client.request(
        "DELETE",
        "/api/auth/me",
        json={"password": "secret123"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 204
    assert client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    ).status_code == 401
    assert client.post(
        "/api/auth/refresh",
        json={"client_kind": "native", "refresh_token": refresh_token},
    ).status_code == 401

    with SessionLocal() as session:
        assert session.scalar(select(func.count(User.id))) == 0
        assert session.scalar(select(func.count(Course.id))) == 0
        assert session.scalar(select(func.count(CourseImportSource.id))) == 0
        assert session.scalar(select(func.count(Message.id))) == 0
        assert session.scalar(select(func.count(SemesterSetting.id))) == 0
        assert session.scalar(select(func.count(RefreshSession.id))) == 0
        # Shared campus reference data is not user-owned and must remain.
        assert session.scalar(select(func.count(Building.id))) == 1

    recreated = client.post(
        "/api/auth/register",
        json={
            "student_id": "alice",
            "password": "new-secret123",
            "nickname": "New Alice",
        },
    )
    assert recreated.status_code == 201
    # SQLite may reuse an integer primary key after deletion. The per-account
    # random subject prevents the old access token from authenticating as the
    # newly created account even when that happens.
    assert client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    ).status_code == 401
    replacement_login = client.post(
        "/api/auth/login",
        json={"student_id": "alice", "password": "new-secret123"},
    )
    assert replacement_login.status_code == 200
    assert replacement_login.json()["access_token"] != access_token


def test_openapi_exposes_only_student_id_as_login_identity(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    schemas = client.get("/openapi.json").json()["components"]["schemas"]

    for schema_name in ("RegisterRequest", "LoginRequest"):
        properties = schemas[schema_name]["properties"]
        assert "student_id" in properties
        assert "username" not in properties


def test_web_refresh_uses_httponly_cookie_and_logout_revokes_session(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    client.post("/api/auth/register", json=register_payload())
    login = client.post(
        "/api/auth/login",
        json={"student_id": "alice", "password": "secret123"},
    )
    first_cookie = login.cookies.get("campusmind_refresh")
    assert first_cookie
    assert "HttpOnly" in login.headers["set-cookie"]

    web_headers = {"Origin": "http://127.0.0.1:5173"}
    refreshed = client.post("/api/auth/refresh", json={}, headers=web_headers)
    assert refreshed.status_code == 200
    assert "refresh_token" not in refreshed.json()
    assert refreshed.json()["user"]["student_id"] == "alice"
    assert refreshed.cookies.get("campusmind_refresh") != first_cookie

    logout = client.post("/api/auth/logout", json={}, headers=web_headers)
    assert logout.status_code == 204
    assert "Max-Age=0" in logout.headers["set-cookie"]
    assert client.post(
        "/api/auth/refresh", json={}, headers=web_headers
    ).status_code == 401


def test_web_refresh_rejects_untrusted_origin_without_rotating_cookie(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    client.post("/api/auth/register", json=register_payload())
    client.post(
        "/api/auth/login",
        json={"student_id": "alice", "password": "secret123"},
    )

    rejected = client.post(
        "/api/auth/refresh",
        json={},
        headers={"Origin": "https://attacker.example"},
    )
    assert rejected.status_code == 403

    accepted = client.post(
        "/api/auth/refresh",
        json={},
        headers={"Origin": "http://127.0.0.1:5173"},
    )
    assert accepted.status_code == 200


def test_sliding_window_limiter_expires_old_failures_and_isolates_keys() -> None:
    now = [0.0]
    limiter = SlidingWindowRateLimiter(
        max_attempts=2,
        window_seconds=60,
        time_func=lambda: now[0],
    )

    limiter.record_failure("key-a")
    limiter.record_failure("key-a")

    assert limiter.is_limited("key-a") is True
    assert limiter.is_limited("key-b") is False

    now[0] = 61.0
    assert limiter.is_limited("key-a") is False

    limiter.record_failure("key-a")
    limiter.record_failure("key-a")
    limiter.clear("key-a")
    assert limiter.is_limited("key-a") is False

    limiter.record_failure("key-a")
    limiter.record_failure("key-a")
    limiter.reset()
    assert limiter.is_limited("key-a") is False


def test_login_rate_limited_after_repeated_failures(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    client.post("/api/auth/register", json=register_payload())

    for _ in range(5):
        response = client.post(
            "/api/auth/login",
            json={"student_id": "alice", "password": "wrong-password"},
        )
        assert response.status_code == 401

    throttled = client.post(
        "/api/auth/login",
        json={"student_id": "alice", "password": "wrong-password"},
    )
    assert throttled.status_code == 429
    assert throttled.json()["detail"] == "登录尝试过于频繁，请稍后再试"

    # Even the correct password is refused while the window is saturated.
    correct = client.post(
        "/api/auth/login",
        json={"student_id": "alice", "password": "secret123"},
    )
    assert correct.status_code == 429


def test_login_rate_limit_covers_other_student_ids_from_same_ip(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session

    for index in range(5):
        response = client.post(
            "/api/auth/login",
            json={"student_id": f"spray-{index}", "password": "wrong-password"},
        )
        assert response.status_code == 401

    throttled = client.post(
        "/api/auth/login",
        json={"student_id": "fresh-student-id", "password": "wrong-password"},
    )
    assert throttled.status_code == 429
    assert throttled.json()["detail"] == "登录尝试过于频繁，请稍后再试"


def test_successful_login_clears_student_id_failure_count(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    client.post("/api/auth/register", json=register_payload())

    for _ in range(4):
        response = client.post(
            "/api/auth/login",
            json={"student_id": "alice", "password": "wrong-password"},
        )
        assert response.status_code == 401

    success = client.post(
        "/api/auth/login",
        json={"student_id": "alice", "password": "secret123"},
    )
    assert success.status_code == 200

    # Isolate the student-ID dimension: the shared test-client IP keeps its
    # failure history, so drop it before probing the identity counter.
    rate_limit.login_ip_limiter.reset()

    # Had the student-ID counter survived the successful login, the second
    # failure below would already be the fifth in the window and return 429.
    for _ in range(2):
        response = client.post(
            "/api/auth/login",
            json={"student_id": "alice", "password": "wrong-password"},
        )
        assert response.status_code == 401


def test_register_rate_limited_after_repeated_duplicate_failures(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    payload = register_payload()
    assert client.post("/api/auth/register", json=payload).status_code == 201

    for _ in range(10):
        response = client.post("/api/auth/register", json=payload)
        assert response.status_code == 400

    throttled = client.post("/api/auth/register", json=payload)
    assert throttled.status_code == 429
    assert throttled.json()["detail"] == "注册操作过于频繁，请稍后再试"


def test_successful_registrations_are_not_rate_limited(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session

    for index in range(12):
        response = client.post(
            "/api/auth/register",
            json=register_payload(f"user-{index}"),
        )
        assert response.status_code == 201
