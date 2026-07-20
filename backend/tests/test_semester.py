from collections.abc import Generator
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.clock import SHANGHAI_TZ, get_current_time, shanghai_today
from app.db.database import Base, create_sqlite_engine, get_session, init_db
from app.main import app
from app.models import SemesterSetting, User
from app.schemas.semester import SemesterUpdate
from app.services.semester_service import (
    get_semester_response,
    resolve_semester_state,
    upsert_setting,
)


def make_test_database_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


@pytest.fixture
def client_and_session(
    tmp_path: Path,
) -> Generator[tuple[TestClient, sessionmaker], None, None]:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "semester.db"))
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
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_current_time, None)
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def auth_headers(client: TestClient, username: str = "alice") -> dict[str, str]:
    registered = client.post(
        "/api/auth/register",
        json={
            "username": username,
            "password": "secret123",
            "nickname": username.title(),
            "student_id": f"{username}-2026",
        },
    )
    assert registered.status_code == 201
    login = client.post(
        "/api/auth/login",
        json={"username": username, "password": "secret123"},
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def fixed_now() -> datetime:
    return datetime(2026, 9, 21, 7, 0, tzinfo=SHANGHAI_TZ)


def test_resolve_semester_state_at_term_boundaries() -> None:
    start_date = date(2026, 8, 31)

    assert resolve_semester_state(start_date, 20, date(2026, 8, 30)).status == "before_term"
    assert resolve_semester_state(start_date, 20, date(2026, 8, 30)).current_week is None
    assert resolve_semester_state(start_date, 20, date(2026, 8, 31)).current_week == 1
    assert resolve_semester_state(start_date, 20, date(2026, 9, 7)).current_week == 2
    assert resolve_semester_state(start_date, 20, date(2027, 1, 17)).current_week == 20
    assert resolve_semester_state(start_date, 20, date(2027, 1, 18)).status == "after_term"
    assert resolve_semester_state(start_date, 20, date(2027, 1, 18)).current_week is None


def test_shanghai_today_uses_shanghai_for_aware_and_naive_timestamps() -> None:
    assert shanghai_today(datetime(2026, 8, 30, 15, 59, tzinfo=timezone.utc)) == date(2026, 8, 30)
    assert shanghai_today(datetime(2026, 8, 30, 16, 0, tzinfo=timezone.utc)) == date(2026, 8, 31)
    assert shanghai_today(datetime(2026, 8, 31, 0, 30)) == date(2026, 8, 31)


def test_semester_update_requires_monday_and_rejects_server_managed_fields() -> None:
    assert SemesterUpdate.model_validate(
        {"start_date": "2026-08-31", "total_weeks": 20}
    ).total_weeks == 20

    for payload in (
        {"start_date": "2026-09-01", "total_weeks": 20},
        {"start_date": "2026-08-31", "total_weeks": 0},
        {"start_date": "2026-08-31", "total_weeks": 31},
        {"start_date": "2026-08-31", "total_weeks": 20, "current_week": 3},
        {"start_date": "2026-08-31", "total_weeks": 20, "status": "active"},
    ):
        with pytest.raises(ValueError):
            SemesterUpdate.model_validate(payload)


def test_get_unconfigured_semester_returns_exact_json(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)

    response = client.get("/api/semester", headers=headers)

    assert response.status_code == 200
    assert response.json() == {
        "status": "unconfigured",
        "start_date": None,
        "total_weeks": None,
        "current_week": None,
    }
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(SemesterSetting)) == 0


def test_semester_api_rejects_invalid_payloads(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client)

    for payload in (
        {"start_date": "2026-09-01", "total_weeks": 20},
        {"start_date": "2026-08-31", "total_weeks": 0},
        {"start_date": "2026-08-31", "total_weeks": 31},
        {"start_date": "2026-08-31", "total_weeks": 20, "current_week": 3},
        {"start_date": "2026-08-31", "total_weeks": 20, "status": "active"},
    ):
        assert client.put("/api/semester", json=payload, headers=headers).status_code == 422


def test_put_semester_returns_current_week_persists_and_upserts_one_row(
    client_and_session: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    app.dependency_overrides[get_current_time] = fixed_now

    original_commit = Session.commit
    commit_calls = 0

    def counted_commit(session: Session) -> None:
        nonlocal commit_calls
        commit_calls += 1
        original_commit(session)

    monkeypatch.setattr(Session, "commit", counted_commit)

    first = client.put(
        "/api/semester",
        json={"start_date": "2026-08-31", "total_weeks": 20},
        headers=headers,
    )

    assert first.status_code == 200
    assert first.json() == {
        "status": "active",
        "start_date": "2026-08-31",
        "total_weeks": 20,
        "current_week": 4,
    }
    assert commit_calls == 1

    second = client.put(
        "/api/semester",
        json={"start_date": "2026-09-07", "total_weeks": 18},
        headers=headers,
    )

    assert second.status_code == 200
    assert commit_calls == 2
    with SessionLocal() as session:
        settings = list(session.scalars(select(SemesterSetting)))
        assert len(settings) == 1
        assert settings[0].start_date == date(2026, 9, 7)
        assert settings[0].total_weeks == 18


def test_semester_settings_are_isolated_between_authenticated_users(
    client_and_session: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _ = client_and_session
    alice_headers = auth_headers(client, "alice")
    bob_headers = auth_headers(client, "bob")
    monkeypatch.setitem(app.dependency_overrides, get_current_time, fixed_now)

    assert client.put(
        "/api/semester",
        json={"start_date": "2026-08-31", "total_weeks": 20},
        headers=alice_headers,
    ).status_code == 200

    bob_get = client.get("/api/semester", headers=bob_headers)
    bob_put = client.put(
        "/api/semester",
        json={"start_date": "2026-09-07", "total_weeks": 18},
        headers=bob_headers,
    )
    alice_get = client.get("/api/semester", headers=alice_headers)

    assert bob_get.json()["status"] == "unconfigured"
    assert bob_put.json()["start_date"] == "2026-09-07"
    assert alice_get.json()["start_date"] == "2026-08-31"


def test_semester_api_requires_authentication(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session

    assert client.get("/api/semester").status_code == 401
    assert client.put(
        "/api/semester",
        json={"start_date": "2026-08-31", "total_weeks": 20},
    ).status_code == 401


def test_semester_service_flushes_without_committing(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        user = User(
            username="service-user",
            student_id="service-user-2026",
            nickname="Service User",
            password_hash="not-used",
            role="student",
        )
        session.add(user)
        session.flush()
        session.commit = Mock(wraps=session.commit)  # type: ignore[method-assign]

        setting = upsert_setting(
            session,
            user_id=user.id,
            start_date=date(2026, 8, 31),
            total_weeks=20,
        )

        assert setting.id is not None
        session.commit.assert_not_called()
        response = get_semester_response(session, user.id, fixed_now())
        assert response.current_week == 4
        session.rollback()
