from collections.abc import Generator
from datetime import date
from pathlib import Path
from queue import Queue
from threading import Barrier, BrokenBarrierError, Lock, Thread, get_ident
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.api.courses import (
    create_current_user_course,
    delete_current_user_course,
    read_courses,
    update_current_user_course,
)
from app.core.errors import BusinessError
from app.db.database import Base, create_sqlite_engine, get_session, init_db
from app.db.seed import seed_demo_data
from app.main import app
from app.models import Building, Course, SemesterSetting, User
from app.schemas.course import CourseCreate, CourseRead, CourseUpdate
from app.services.course_service import add_course, list_courses, update_course


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


def auth_headers(
    client: TestClient,
    username: str = "alice",
    *,
    configure_semester: bool = True,
    total_weeks: int = 20,
) -> dict[str, str]:
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
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    if configure_semester:
        semester = client.put(
            "/api/semester",
            json={"start_date": "2026-08-31", "total_weeks": total_weeks},
            headers=headers,
        )
        assert semester.status_code == 200
    return headers


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


def test_course_schema_requires_and_normalizes_weeks() -> None:
    payload = course_payload(1, weeks=" 第1-16（双）周 ")

    course = CourseCreate.model_validate(payload)

    assert course.weeks == "2-16(双)"
    with pytest.raises(ValueError):
        CourseCreate.model_validate(course_payload(1, weeks="   "))
    with pytest.raises(ValueError):
        CourseCreate.model_validate({key: value for key, value in payload.items() if key != "weeks"})


def test_course_update_rejects_explicit_null_or_blank_weeks_and_normalizes_provided_value() -> None:
    assert CourseUpdate.model_validate({}).weeks is None
    assert CourseUpdate.model_validate({"weeks": "第1-4周"}).weeks == "1-4"
    with pytest.raises(ValueError):
        CourseUpdate.model_validate({"weeks": None})
    with pytest.raises(ValueError):
        CourseUpdate.model_validate({"weeks": "  "})


def test_course_read_exposes_source_and_location_review_status() -> None:
    course = CourseRead.model_validate(
        {
            "id": 1,
            "course_name": "Databases",
            "weekday": 1,
            "start_time": "08:00",
            "end_time": "09:40",
            "building_id": 1,
            "room_name": " 待确认教室 ",
            "weeks": "1-16",
            "source_kind": "import",
            "created_at": "2026-01-01T00:00:00Z",
            "building": {"id": 1, "name": "Library", "type": "study"},
        }
    )

    assert course.source_kind == "import"
    assert course.needs_location_review is True
    serialized = course.model_dump()
    assert serialized["source_kind"] == "import"
    assert serialized["needs_location_review"] is True


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
    assert update_response.json()["code"] == "course_not_found"
    assert delete_response.json()["code"] == "course_not_found"


@pytest.mark.parametrize(
    "overrides",
    [
        {"building_id": None},
        {"room_name": "   "},
    ],
)
def test_create_course_rejects_missing_building_or_blank_room_with_pydantic_422(
    client_and_session: tuple[TestClient, sessionmaker],
    overrides: dict[str, object],
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client)
    building_id = get_first_building_id(client)

    payload = course_payload(building_id)
    payload.update(overrides)
    response = client.post("/api/courses", json=payload, headers=headers)

    assert response.status_code == 422


def test_course_writes_require_a_configured_semester(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client, configure_semester=False)

    response = client.post(
        "/api/courses", json=course_payload(get_first_building_id(client)), headers=headers
    )

    assert response.status_code == 409
    assert response.json() == {
        "code": "semester_unconfigured",
        "message": "Semester is not configured",
        "fields": [],
        "details": {},
    }


def test_course_writes_return_structured_business_errors(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client, total_weeks=16)
    building_id = get_first_building_id(client)

    placeholder = client.post(
        "/api/courses",
        json=course_payload(building_id, room_name=" 待确认教室 "),
        headers=headers,
    )
    missing_building = client.post(
        "/api/courses", json=course_payload(999999), headers=headers
    )
    invalid_weeks = client.post(
        "/api/courses", json=course_payload(building_id, weeks="20"), headers=headers
    )

    assert placeholder.status_code == 422
    assert placeholder.json() == {
        "code": "invalid_room_name",
        "message": "Room name must be a confirmed location",
        "fields": ["room_name"],
        "details": {},
    }
    assert missing_building.status_code == 404
    assert missing_building.json()["code"] == "building_not_found"
    assert invalid_weeks.status_code == 422
    assert invalid_weeks.json()["code"] == "invalid_course_weeks"
    assert invalid_weeks.json()["fields"] == ["weeks"]
    assert invalid_weeks.json()["details"] == {"max_week": 16}


def test_week_31_is_a_standard_schema_validation_error(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client)

    response = client.post(
        "/api/courses",
        json=course_payload(get_first_building_id(client), weeks="31"),
        headers=headers,
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert response.json()["fields"] == ["weeks"]
    assert response.json()["message"] == "请求参数校验失败"
    assert response.json()["details"]["errors"] == [
        {
            "loc": ["body", "weeks"],
            "msg": "Value error, Week must be between 1 and 30",
            "type": "value_error",
        }
    ]


def test_create_course_conflict_has_exact_contract_and_touching_times_are_allowed(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client)
    building_id = get_first_building_id(client)
    first = client.post(
        "/api/courses", json=course_payload(building_id, course_name="Physics", weeks="1-8"), headers=headers
    )
    assert first.status_code == 201

    conflict = client.post(
        "/api/courses", json=course_payload(building_id, course_name="Math", weeks="2-10"), headers=headers
    )
    touching = client.post(
        "/api/courses",
        json=course_payload(building_id, start_time="09:40", end_time="11:20", weeks="1-8"),
        headers=headers,
    )

    assert conflict.status_code == 409
    assert conflict.json() == {
        "code": "course_conflict",
        "message": "该时间与已有课程冲突",
        "fields": ["weekday", "start_time", "end_time", "weeks"],
        "details": {
            "conflicts": [
                {"course_id": first.json()["id"], "course_name": "Physics", "overlap_weeks": [2, 3, 4, 5, 6, 7, 8]}
            ]
        },
    }
    assert touching.status_code == 201


def test_disjoint_weeks_and_another_users_course_do_not_conflict(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    alice_headers = auth_headers(client, "alice")
    bob_headers = auth_headers(client, "bob")
    building_id = get_first_building_id(client)
    assert client.post(
        "/api/courses", json=course_payload(building_id, weeks="1-16(单)"), headers=bob_headers
    ).status_code == 201
    own = client.post(
        "/api/courses", json=course_payload(building_id, weeks="1-16(双)"), headers=alice_headers
    )

    assert own.status_code == 201


def test_conflicting_update_rolls_back_without_mutating_the_course(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    building_id = get_first_building_id(client)
    first = client.post(
        "/api/courses", json=course_payload(building_id, course_name="First", weekday=1), headers=headers
    )
    second = client.post(
        "/api/courses", json=course_payload(building_id, course_name="Second", weekday=2), headers=headers
    )
    assert first.status_code == second.status_code == 201

    response = client.put(f"/api/courses/{second.json()['id']}", json={"weekday": 1}, headers=headers)

    assert response.status_code == 409
    with SessionLocal() as session:
        persisted = session.get(Course, second.json()["id"])
        assert persisted is not None
        assert persisted.weekday == 2


def test_legacy_placeholder_rows_serialize_for_review_but_cannot_be_updated(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    building_id = get_first_building_id(client)
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.username == "alice"))
        assert user is not None
        legacy = Course(
            user_id=user.id,
            course_name="Legacy",
            weekday=1,
            start_time="08:00",
            end_time="09:40",
            building_id=building_id,
            room_name="未知",
            weeks="1-16",
        )
        session.add(legacy)
        session.commit()
        legacy_id = legacy.id
        course_id = legacy.id

    listed = client.get("/api/courses", headers=headers)
    updated = client.put(f"/api/courses/{course_id}", json={"course_name": "Still legacy"}, headers=headers)

    assert next(item for item in listed.json() if item["id"] == course_id)["needs_location_review"] is True
    assert updated.status_code == 422
    assert updated.json()["code"] == "invalid_room_name"


def test_malformed_stored_course_returns_course_data_invalid_not_a_candidate_error(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    building_id = get_first_building_id(client)
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.username == "alice"))
        assert user is not None
        legacy = Course(
            user_id=user.id,
            course_name="Broken time",
            weekday=1,
            start_time="bad",
            end_time="09:40",
            building_id=building_id,
            room_name="A101",
            weeks="1-16",
        )
        session.add(legacy)
        session.commit()
        legacy_id = legacy.id

    response = client.post("/api/courses", json=course_payload(building_id), headers=headers)

    assert response.status_code == 409
    assert response.json()["code"] == "course_data_invalid"
    assert response.json()["details"] == {
        "course_id": legacy_id,
        "course_name": "Broken time",
        "issues": [{"field": "time", "code": "invalid_time_range"}],
    }


def test_legacy_weeks_outside_semester_block_others_but_can_be_repaired(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client, total_weeks=16)
    building_id = get_first_building_id(client)
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.username == "alice"))
        assert user is not None
        legacy = Course(
            user_id=user.id,
            course_name="Long legacy",
            weekday=1,
            start_time="08:00",
            end_time="09:40",
            building_id=building_id,
            room_name="A101",
            weeks="1-20",
        )
        session.add(legacy)
        session.commit()
        legacy_id = legacy.id

    blocked = client.post("/api/courses", json=course_payload(building_id, weekday=2), headers=headers)
    repaired = client.put(f"/api/courses/{legacy_id}", json={"weeks": "1-16"}, headers=headers)

    assert blocked.status_code == 409
    assert blocked.json()["code"] == "course_data_invalid"
    assert blocked.json()["details"]["course_id"] == legacy_id
    assert repaired.status_code == 200
    assert repaired.json()["weeks"] == "1-16"


def test_course_service_flushes_but_never_commits(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        building = session.query(Building).first()
        assert building is not None
        user = User(username="service", student_id="service-2026", nickname="Service", password_hash="unused", role="student")
        session.add(user)
        session.flush()
        session.add(SemesterSetting(user_id=user.id, start_date=date(2026, 8, 31), total_weeks=20))
        session.flush()
        session.commit = Mock(wraps=session.commit)  # type: ignore[method-assign]
        session.rollback = Mock(wraps=session.rollback)  # type: ignore[method-assign]

        created = add_course(session, user_id=user.id, payload=CourseCreate.model_validate(course_payload(building.id)))
        updated = update_course(
            session,
            user_id=user.id,
            course_id=created.id,
            payload=CourseUpdate(course_name="Updated"),
        )
        from app.services.course_service import delete_course

        delete_course(session, user_id=user.id, course_id=updated.id)

        assert created.id is not None
        assert updated.course_name == "Updated"
        assert session.get(Course, created.id) is None
        session.commit.assert_not_called()
        session.rollback.assert_not_called()


def test_course_write_api_commits_once_rolls_back_failures_and_remains_usable(
    client_and_session: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _ = client_and_session
    headers = auth_headers(client)
    building_id = get_first_building_id(client)
    original_commit = Session.commit
    original_rollback = Session.rollback
    commit_calls = 0
    rollback_calls = 0

    def counted_commit(session: Session) -> None:
        nonlocal commit_calls
        commit_calls += 1
        original_commit(session)

    def counted_rollback(session: Session) -> None:
        nonlocal rollback_calls
        rollback_calls += 1
        original_rollback(session)

    monkeypatch.setattr(Session, "commit", counted_commit)
    monkeypatch.setattr(Session, "rollback", counted_rollback)

    created = client.post(
        "/api/courses", json=course_payload(building_id, course_name="Committed"), headers=headers
    )
    rejected = client.post(
        "/api/courses", json=course_payload(building_id, room_name="待确认"), headers=headers
    )
    usable = client.post(
        "/api/courses", json=course_payload(building_id, weekday=2, course_name="Usable"), headers=headers
    )

    assert created.status_code == 201
    assert rejected.status_code == 422
    assert usable.status_code == 201
    assert commit_calls == 2
    assert rollback_calls == 1


def test_course_routes_own_each_real_session_transaction_boundary(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        building = session.query(Building).first()
        assert building is not None
        user = User(
            username="route-service",
            student_id="route-service-2026",
            nickname="Route Service",
            password_hash="unused",
            role="student",
        )
        session.add(user)
        session.flush()
        session.add(SemesterSetting(user_id=user.id, start_date=date(2026, 8, 31), total_weeks=20))
        session.commit()
        session.commit = Mock(wraps=session.commit)  # type: ignore[method-assign]
        session.rollback = Mock(wraps=session.rollback)  # type: ignore[method-assign]

        created = create_current_user_course(
            CourseCreate.model_validate(course_payload(building.id, course_name="First")), session, user
        )
        assert session.commit.call_count == 1
        session.commit.reset_mock()

        read_courses(session, user)
        session.commit.assert_not_called()
        session.rollback.assert_not_called()

        updated = update_current_user_course(
            created.id,
            CourseUpdate(course_name="Renamed"),
            session,
            user,
        )
        assert updated.course_name == "Renamed"
        assert session.commit.call_count == 1
        session.commit.reset_mock()

        deleted = delete_current_user_course(created.id, session, user)
        assert deleted.status_code == 204
        assert session.commit.call_count == 1
        assert session.get(Course, created.id) is None
        session.commit.reset_mock()

        for operation in (
            lambda: create_current_user_course(
                CourseCreate.model_validate(course_payload(building.id, room_name="待确认")), session, user
            ),
            lambda: update_current_user_course(999999, CourseUpdate(course_name="Missing"), session, user),
            lambda: delete_current_user_course(999999, session, user),
        ):
            with pytest.raises(BusinessError):
                operation()
            assert session.rollback.call_count == 1
            session.rollback.reset_mock()
            session.commit.assert_not_called()


def test_failed_route_update_rolls_back_and_keeps_the_same_session_usable(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        building = session.query(Building).first()
        assert building is not None
        user = User(
            username="rollback-service",
            student_id="rollback-service-2026",
            nickname="Rollback Service",
            password_hash="unused",
            role="student",
        )
        session.add(user)
        session.flush()
        session.add(SemesterSetting(user_id=user.id, start_date=date(2026, 8, 31), total_weeks=20))
        session.commit()
        first = create_current_user_course(
            CourseCreate.model_validate(course_payload(building.id, course_name="First", weekday=1)), session, user
        )
        second = create_current_user_course(
            CourseCreate.model_validate(course_payload(building.id, course_name="Second", weekday=2)), session, user
        )
        session.rollback = Mock(wraps=session.rollback)  # type: ignore[method-assign]

        with pytest.raises(BusinessError) as raised:
            update_current_user_course(second.id, CourseUpdate(weekday=1), session, user)

        assert raised.value.code == "course_conflict"
        assert session.rollback.call_count == 1
        assert session.get(Course, second.id).weekday == 2  # type: ignore[union-attr]
        usable = create_current_user_course(
            CourseCreate.model_validate(course_payload(building.id, course_name="Usable", weekday=3)), session, user
        )
        assert usable.id is not None


def test_concurrent_conflicting_creates_have_one_winner_and_one_business_conflict(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    auth_headers(client)
    building_id = get_first_building_id(client)
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.username == "alice"))
        assert user is not None
        user_id = user.id

    start = Barrier(2)
    read_barrier = Barrier(2)
    seen_threads: set[int] = set()
    seen_lock = Lock()
    engine = SessionLocal.kw["bind"]
    results: Queue[str] = Queue()

    def synchronize_first_course_read(*args: object) -> None:
        statement = str(args[2])
        if "FROM courses" not in statement:
            return
        thread_id = get_ident()
        with seen_lock:
            if thread_id in seen_threads:
                return
            seen_threads.add(thread_id)
        try:
            read_barrier.wait(timeout=1)
        except BrokenBarrierError:
            pass

    event.listen(engine, "after_cursor_execute", synchronize_first_course_read)

    def create_in_own_session(name: str) -> None:
        with SessionLocal() as session:
            try:
                start.wait(timeout=10)
                create_current_user_course(
                    CourseCreate.model_validate(course_payload(building_id, course_name=name)),
                    session,
                    SimpleNamespace(id=user_id),
                )
                results.put("created")
            except BusinessError as error:
                results.put(error.code)

    try:
        workers = [Thread(target=create_in_own_session, args=(name,)) for name in ("A", "B")]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=15)

        assert all(not worker.is_alive() for worker in workers)
        assert sorted(list(results.queue)) == ["course_conflict", "created"]
        with SessionLocal() as session:
            assert len(list_courses(session, user_id)) == 1
    finally:
        event.remove(engine, "after_cursor_execute", synchronize_first_course_read)


def test_concurrent_conflicting_updates_have_one_winner_and_one_business_conflict(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    building_id = get_first_building_id(client)
    first = client.post("/api/courses", json=course_payload(building_id, weekday=1, course_name="First"), headers=headers)
    second = client.post("/api/courses", json=course_payload(building_id, weekday=2, course_name="Second"), headers=headers)
    assert first.status_code == second.status_code == 201
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.username == "alice"))
        assert user is not None
        user_id = user.id

    start = Barrier(2)
    read_barrier = Barrier(2)
    seen_threads: set[int] = set()
    seen_lock = Lock()
    engine = SessionLocal.kw["bind"]
    results: Queue[str] = Queue()

    def synchronize_first_course_read(*args: object) -> None:
        statement = str(args[2])
        if "FROM courses" not in statement:
            return
        thread_id = get_ident()
        with seen_lock:
            if thread_id in seen_threads:
                return
            seen_threads.add(thread_id)
        try:
            read_barrier.wait(timeout=1)
        except BrokenBarrierError:
            pass

    event.listen(engine, "after_cursor_execute", synchronize_first_course_read)

    def update_in_own_session(course_id: int) -> None:
        with SessionLocal() as session:
            try:
                start.wait(timeout=10)
                update_current_user_course(
                    course_id,
                    CourseUpdate(weekday=3),
                    session,
                    SimpleNamespace(id=user_id),
                )
                results.put("updated")
            except BusinessError as error:
                results.put(error.code)

    try:
        workers = [
            Thread(target=update_in_own_session, args=(first.json()["id"],)),
            Thread(target=update_in_own_session, args=(second.json()["id"],)),
        ]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=15)

        assert all(not worker.is_alive() for worker in workers)
        assert sorted(list(results.queue)) == ["course_conflict", "updated"]
        with SessionLocal() as session:
            assert [course.weekday for course in list_courses(session, user_id)].count(3) == 1
    finally:
        event.remove(engine, "after_cursor_execute", synchronize_first_course_read)


@pytest.mark.parametrize("operation", ["create", "update", "delete"])
def test_real_flush_failure_rolls_back_once_and_session_recovers(
    client_and_session: tuple[TestClient, sessionmaker],
    operation: str,
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        building = session.query(Building).first()
        assert building is not None
        user = User(username=f"flush-{operation}", student_id=f"flush-{operation}", nickname="Flush", password_hash="unused", role="student")
        session.add(user)
        session.flush()
        session.add(SemesterSetting(user_id=user.id, start_date=date(2026, 8, 31), total_weeks=20))
        session.commit()
        existing = create_current_user_course(CourseCreate.model_validate(course_payload(building.id)), session, user)
        original_flush = session.flush
        session.rollback = Mock(wraps=session.rollback)  # type: ignore[method-assign]
        session.flush = Mock(side_effect=SQLAlchemyError("flush failed"))  # type: ignore[method-assign]

        with pytest.raises(SQLAlchemyError):
            if operation == "create":
                create_current_user_course(CourseCreate.model_validate(course_payload(building.id, weekday=2)), session, user)
            elif operation == "update":
                update_current_user_course(existing.id, CourseUpdate(course_name="Changed"), session, user)
            else:
                delete_current_user_course(existing.id, session, user)

        assert session.rollback.call_count == 1
        session.flush = original_flush  # type: ignore[method-assign]
        recovered = create_current_user_course(CourseCreate.model_validate(course_payload(building.id, weekday=3)), session, user)
        assert recovered.id is not None


@pytest.mark.parametrize("operation", ["create", "update", "delete"])
def test_real_commit_failure_rolls_back_once_and_session_recovers(
    client_and_session: tuple[TestClient, sessionmaker],
    operation: str,
) -> None:
    _, SessionLocal = client_and_session
    with SessionLocal() as session:
        building = session.query(Building).first()
        assert building is not None
        user = User(username=f"commit-{operation}", student_id=f"commit-{operation}", nickname="Commit", password_hash="unused", role="student")
        session.add(user)
        session.flush()
        session.add(SemesterSetting(user_id=user.id, start_date=date(2026, 8, 31), total_weeks=20))
        session.commit()
        existing = create_current_user_course(CourseCreate.model_validate(course_payload(building.id)), session, user)
        original_commit = session.commit
        session.rollback = Mock(wraps=session.rollback)  # type: ignore[method-assign]
        session.commit = Mock(side_effect=SQLAlchemyError("commit failed"))  # type: ignore[method-assign]

        with pytest.raises(SQLAlchemyError):
            if operation == "create":
                create_current_user_course(CourseCreate.model_validate(course_payload(building.id, weekday=2)), session, user)
            elif operation == "update":
                update_current_user_course(existing.id, CourseUpdate(course_name="Changed"), session, user)
            else:
                delete_current_user_course(existing.id, session, user)

        assert session.rollback.call_count == 1
        session.commit = original_commit  # type: ignore[method-assign]
        recovered = create_current_user_course(CourseCreate.model_validate(course_payload(building.id, weekday=3)), session, user)
        assert recovered.id is not None
