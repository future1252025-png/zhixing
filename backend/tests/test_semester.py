from collections.abc import Generator
from datetime import date, datetime, timezone
from queue import Queue
from pathlib import Path
from threading import Barrier, Thread
from time import sleep
from unittest.mock import Mock
import sqlite3

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

import app.api.semester as semester_api
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


@pytest.mark.parametrize("value", ["20", 20.0, True, False, None])
def test_semester_update_requires_a_json_integer_for_total_weeks(value: object) -> None:
    with pytest.raises(ValueError):
        SemesterUpdate.model_validate({"start_date": "2026-08-31", "total_weeks": value})


@pytest.mark.parametrize(
    "value",
    [
        "2026-08-31T00:00:00",
        "2026-8-31",
        1788134400,
        datetime(2026, 8, 31),
        None,
    ],
)
def test_semester_update_requires_a_date_not_a_datetime(value: object) -> None:
    with pytest.raises(ValueError):
        SemesterUpdate.model_validate({"start_date": value, "total_weeks": 20})


def test_semester_update_accepts_only_a_date_or_exact_iso_date_string() -> None:
    assert SemesterUpdate.model_validate(
        {"start_date": date(2026, 8, 31), "total_weeks": 20}
    ).start_date == date(2026, 8, 31)
    assert SemesterUpdate.model_validate(
        {"start_date": "2026-08-31", "total_weeks": 20}
    ).start_date == date(2026, 8, 31)


@pytest.mark.parametrize(
    "start_date,total_weeks",
    [
        (date(2026, 9, 1), 20),
        (date(2026, 8, 31), 0),
        (date(2026, 8, 31), 31),
    ],
)
def test_upsert_setting_rejects_invalid_domain_values_before_writing(
    client_and_session: tuple[TestClient, sessionmaker],
    start_date: date,
    total_weeks: int,
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        user = User(
            username=f"invalid-{total_weeks}-{start_date.isoformat()}",
            student_id=f"invalid-{total_weeks}-{start_date.isoformat()}",
            nickname="Invalid",
            password_hash="not-used",
            role="student",
        )
        session.add(user)
        session.flush()

        with pytest.raises(ValueError, match="start_date|total_weeks"):
            upsert_setting(session, user.id, start_date, total_weeks)

        assert session.scalar(select(func.count()).select_from(SemesterSetting)) == 0
        session.rollback()


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


@pytest.mark.parametrize(
    "payload",
    [
        {"start_date": "2026-08-31", "total_weeks": "20"},
        {"start_date": "2026-08-31", "total_weeks": 20.0},
        {"start_date": "2026-08-31", "total_weeks": True},
        {"start_date": "2026-08-31", "total_weeks": False},
        {"start_date": "2026-08-31", "total_weeks": None},
        {"start_date": "2026-08-31T00:00:00", "total_weeks": 20},
        {"start_date": "2026-8-31", "total_weeks": 20},
        {"start_date": 1788134400, "total_weeks": 20},
        {"total_weeks": 20},
    ],
)
def test_semester_api_rejects_coerced_request_types(
    client_and_session: tuple[TestClient, sessionmaker],
    payload: dict[str, object],
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client)

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


def test_repeated_semester_put_is_api_idempotent(
    client_and_session: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    monkeypatch.setitem(app.dependency_overrides, get_current_time, fixed_now)
    payload = {"start_date": "2026-08-31", "total_weeks": 20}

    first = client.put("/api/semester", json=payload, headers=headers)
    second = client.put("/api/semester", json=payload, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json() == first.json()
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(SemesterSetting)) == 1


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
        session.rollback = Mock(wraps=session.rollback)  # type: ignore[method-assign]

        setting = upsert_setting(
            session,
            user_id=user.id,
            start_date=date(2026, 8, 31),
            total_weeks=20,
        )

        assert setting.id is not None
        session.commit.assert_not_called()
        session.rollback.assert_not_called()
        response = get_semester_response(session, user.id, fixed_now())
        assert response.current_week == 4


class CodedSqliteError(sqlite3.OperationalError):
    def __init__(self, errorcode: int, errorname: str) -> None:
        super().__init__("database is locked")
        self.sqlite_errorcode = errorcode
        self.sqlite_errorname = errorname


def make_operational_error(errorcode: int, errorname: str) -> OperationalError:
    return OperationalError(
        "INSERT INTO semester_settings ...",
        {},
        CodedSqliteError(errorcode, errorname),
    )


def test_upsert_operational_error_preserves_caller_transaction(
    client_and_session: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, SessionLocal = client_and_session
    error = make_operational_error(sqlite3.SQLITE_BUSY, "SQLITE_BUSY")
    with SessionLocal() as session:
        pending_user = User(
            username="pending-user",
            student_id="pending-user-2026",
            nickname="Pending User",
            password_hash="not-used",
            role="student",
        )
        session.add(pending_user)
        commit = Mock(wraps=session.commit)
        rollback = Mock(wraps=session.rollback)
        execute = Mock(side_effect=error)
        monkeypatch.setattr(session, "commit", commit)
        monkeypatch.setattr(session, "rollback", rollback)
        monkeypatch.setattr(session, "execute", execute)

        with pytest.raises(OperationalError) as raised:
            upsert_setting(session, 1, date(2026, 8, 31), 20)

        assert raised.value is error
        assert execute.call_count == 1
        commit.assert_not_called()
        rollback.assert_not_called()
        assert pending_user in session.new


def test_api_retry_busy_once_then_commits_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = Mock()
    busy = make_operational_error(sqlite3.SQLITE_BUSY, "SQLITE_BUSY")
    attempts = 0

    def fail_once(*args: object, **kwargs: object) -> object:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise busy
        return Mock()

    monkeypatch.setattr(semester_api, "upsert_setting", fail_once)

    semester_api.persist_semester_setting_with_retry(
        session,
        user_id=17,
        start_date=date(2026, 8, 31),
        total_weeks=20,
    )

    assert attempts == 2
    assert session.rollback.call_count == 1
    assert session.commit.call_count == 1


def test_api_retry_stops_after_bounded_busy_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = Mock()
    busy = make_operational_error(sqlite3.SQLITE_LOCKED, "SQLITE_LOCKED")
    attempts = 0

    def always_busy(*args: object, **kwargs: object) -> None:
        nonlocal attempts
        attempts += 1
        raise busy

    monkeypatch.setattr(semester_api, "upsert_setting", always_busy)

    with pytest.raises(OperationalError) as raised:
        semester_api.persist_semester_setting_with_retry(
            session,
            user_id=17,
            start_date=date(2026, 8, 31),
            total_weeks=20,
        )

    assert raised.value is busy
    assert attempts == semester_api.SQLITE_BUSY_RETRY_ATTEMPTS
    assert session.rollback.call_count == semester_api.SQLITE_BUSY_RETRY_ATTEMPTS
    session.commit.assert_not_called()


def test_api_does_not_retry_non_busy_operational_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = Mock()
    non_busy = make_operational_error(sqlite3.SQLITE_CONSTRAINT, "SQLITE_CONSTRAINT")
    upsert = Mock(side_effect=non_busy)
    monkeypatch.setattr(semester_api, "upsert_setting", upsert)

    with pytest.raises(OperationalError) as raised:
        semester_api.persist_semester_setting_with_retry(
            session,
            user_id=17,
            start_date=date(2026, 8, 31),
            total_weeks=20,
        )

    assert raised.value is non_busy
    assert upsert.call_count == 1
    assert session.rollback.call_count == 1
    session.commit.assert_not_called()


def test_upsert_update_preserves_created_at_and_advances_updated_at(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        user = User(
            username="timestamp-user",
            student_id="timestamp-user-2026",
            nickname="Timestamp User",
            password_hash="not-used",
            role="student",
        )
        session.add(user)
        session.commit()
        first = upsert_setting(session, user.id, date(2026, 8, 31), 20)
        session.commit()
        created_at = first.created_at
        updated_at = first.updated_at

        sleep(0.01)
        second = upsert_setting(session, user.id, date(2026, 9, 7), 18)
        session.commit()

        assert second.created_at == created_at
        assert second.updated_at > updated_at


def test_concurrent_first_upserts_are_atomic_and_keep_a_complete_submission(
    tmp_path: Path,
) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "semester-race.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    submissions = (
        (date(2026, 8, 31), 20),
        (date(2026, 9, 7), 18),
    )
    try:
        with engine.connect() as connection:
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
            assert connection.exec_driver_sql("PRAGMA busy_timeout").scalar() == 5000

        with SessionLocal() as session:
            user = User(
                username="race-user",
                student_id="race-user-2026",
                nickname="Race User",
                password_hash="not-used",
                role="student",
            )
            session.add(user)
            session.commit()
            user_id = user.id

        start = Barrier(2)
        errors: Queue[BaseException] = Queue()

        def submit(start_date: date, total_weeks: int) -> None:
            try:
                with SessionLocal() as session:
                    start.wait(timeout=10)
                    upsert_setting(session, user_id, start_date, total_weeks)
                    session.commit()
            except BaseException as error:
                errors.put(error)

        workers = [Thread(target=submit, args=submission) for submission in submissions]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=15)

        assert all(not worker.is_alive() for worker in workers)
        assert errors.empty(), list(errors.queue)
        with SessionLocal() as session:
            settings = list(session.scalars(select(SemesterSetting)))
            assert len(settings) == 1
            assert (settings[0].start_date, settings[0].total_weeks) in submissions
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
