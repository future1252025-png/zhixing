from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.db.database import Base, create_sqlite_engine, get_session, init_db
from app.db.seed import seed_demo_data
from app.main import app
from app.models import Building, Course, Message, User


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


def get_building_id_by_name(client: TestClient, name: str) -> int:
    buildings = client.get("/api/buildings").json()
    return next(building["id"] for building in buildings if building["name"] == name)


def get_first_building(client: TestClient) -> dict:
    buildings = client.get("/api/buildings").json()
    return buildings[0]


def message_location_payload(building: dict) -> dict:
    return {
        "latitude": building["latitude"],
        "longitude": building["longitude"],
        "location_source": "manual",
    }


def create_course_room(
    SessionLocal: sessionmaker,
    building_id: int,
    room_name: str,
) -> None:
    """Register a classroom channel by giving the building a course in it."""
    with SessionLocal() as session:
        user = session.query(User).first()
        assert user is not None
        session.add(
            Course(
                user_id=user.id,
                course_name="教室频道课程",
                weekday=1,
                start_time="08:00",
                end_time="09:40",
                building_id=building_id,
                room_name=room_name,
            )
        )
        session.commit()


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
    building_id = get_building_id_by_name(client, "湖北大学武昌校区图书馆")

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


def test_get_messages_defaults_to_latest_50_in_ascending_display_order(
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
                    content=f"message-{index:02d}",
                    display_name="Other",
                    status="normal",
                    created_at=base_time + timedelta(minutes=index),
                )
                for index in range(60)
            ]
        )
        session.commit()
        building_id = building.id

    response = client.get(f"/api/buildings/{building_id}/messages", headers=headers)

    assert response.status_code == 200
    contents = [message["content"] for message in response.json()]
    assert len(contents) == 50
    assert contents[0] == "message-10"
    assert contents[-1] == "message-59"


def test_get_messages_limit_and_offset_page_latest_messages(
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
                    content=f"message-{index:02d}",
                    display_name="Other",
                    status="normal",
                    created_at=base_time + timedelta(minutes=index),
                )
                for index in range(20)
            ]
        )
        session.commit()
        building_id = building.id

    response = client.get(
        f"/api/buildings/{building_id}/messages",
        params={"limit": 5, "offset": 10},
        headers=headers,
    )

    assert response.status_code == 200
    assert [message["content"] for message in response.json()] == [
        "message-05",
        "message-06",
        "message-07",
        "message-08",
        "message-09",
    ]


def test_get_messages_rejects_limit_above_100(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    building_id = get_first_building_id(client)

    response = client.get(
        f"/api/buildings/{building_id}/messages",
        params={"limit": 101},
        headers=auth_headers(client),
    )

    assert response.status_code == 422


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
    building = get_first_building(client)

    response = client.post(
        f"/api/buildings/{building['id']}/messages",
        json={
            "content": "  今天这里很安静  ",
            **message_location_payload(building),
        },
        headers=auth_headers(client),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["building_id"] == building["id"]
    assert data["content"] == "今天这里很安静"
    assert data["display_name"] == "匿名同学"
    assert data["latitude"] == building["latitude"]
    assert data["longitude"] == building["longitude"]
    assert data["location_source"] == "manual"
    assert data["distance_to_building_meters"] == 0
    assert datetime.fromisoformat(data["created_at"]).utcoffset() == timedelta(0)
    assert "password_hash" not in data
    assert "user" not in data


def test_create_message_requires_location(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    building_id = get_first_building_id(client)

    response = client.post(
        f"/api/buildings/{building_id}/messages",
        json={"content": "hello"},
        headers=auth_headers(client),
    )

    assert response.status_code == 422


def test_create_message_too_far_from_building_fails(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    building = get_first_building(client)

    response = client.post(
        f"/api/buildings/{building['id']}/messages",
        json={
            "content": "hello",
            "latitude": building["latitude"] + 0.02,
            "longitude": building["longitude"] + 0.02,
            "location_source": "browser",
        },
        headers=auth_headers(client),
    )

    assert response.status_code == 400
    assert "过远" in response.json()["detail"]


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
    building = get_first_building(client)

    response = client.post(
        "/api/buildings/999999/messages",
        json={
            "content": "hello",
            **message_location_payload(building),
        },
        headers=auth_headers(client),
    )

    assert response.status_code == 404


def test_get_building_chatrooms_includes_general_and_course_rooms(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    building_id = get_building_id_by_name(client, "湖北大学武昌校区国际教育学院")

    response = client.get(
        f"/api/buildings/{building_id}/chatrooms",
        headers=auth_headers(client),
    )

    assert response.status_code == 200
    data = response.json()
    assert data[0]["name"] == "地点频道"
    assert data[0]["room_name"] is None
    assert any(room["room_name"] for room in data)


def test_room_messages_are_filtered_by_room_name(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    building = get_first_building(client)
    headers = auth_headers(client)
    location = message_location_payload(building)
    create_course_room(SessionLocal, building["id"], "教4-203")
    create_course_room(SessionLocal, building["id"], "教4-204")

    first = client.post(
        f"/api/buildings/{building['id']}/messages",
        json={"content": "203 教室有人吗", "room_name": "教4-203", **location},
        headers=headers,
    )
    second = client.post(
        f"/api/buildings/{building['id']}/messages",
        json={"content": "204 教室有人吗", "room_name": "教4-204", **location},
        headers=headers,
    )

    assert first.status_code == 201
    assert second.status_code == 201
    response = client.get(
        f"/api/buildings/{building['id']}/messages",
        params={"room_name": "教4-203"},
        headers=headers,
    )

    assert response.status_code == 200
    assert [message["content"] for message in response.json()] == ["203 教室有人吗"]
    assert response.json()[0]["room_name"] == "教4-203"


def test_room_message_channel_accepts_full_room_name_up_to_course_limit(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    building = get_first_building(client)
    headers = auth_headers(client, "long_room_channel")
    room_name = "东区三层联合创新实验教室-" + "A" * 88
    assert 64 < len(room_name) <= 120
    create_course_room(SessionLocal, building["id"], room_name)

    created = client.post(
        f"/api/buildings/{building['id']}/messages",
        json={
            "content": "完整地点频道留言",
            "room_name": room_name,
            **message_location_payload(building),
        },
        headers=headers,
    )
    response = client.get(
        f"/api/buildings/{building['id']}/messages",
        params={"room_name": room_name},
        headers=headers,
    )

    assert created.status_code == 201
    assert response.status_code == 200
    assert [message["content"] for message in response.json()] == ["完整地点频道留言"]
    assert response.json()[0]["room_name"] == room_name


def test_general_channel_excludes_classroom_messages_and_counts_only_general(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    building = get_first_building(client)
    headers = auth_headers(client, "channel_user")
    location = message_location_payload(building)
    create_course_room(SessionLocal, building["id"], "教4-101")

    general = client.post(
        f"/api/buildings/{building['id']}/messages",
        json={"content": "总频道留言", **location},
        headers=headers,
    )
    room = client.post(
        f"/api/buildings/{building['id']}/messages",
        json={"content": "教室留言", "room_name": "教4-101", **location},
        headers=headers,
    )
    assert general.status_code == 201
    assert room.status_code == 201

    with SessionLocal() as session:
        session.query(Message).filter(
            Message.building_id == building["id"],
            Message.content.notin_(["总频道留言", "教室留言"]),
        ).delete(synchronize_session=False)
        session.commit()

    general_list = client.get(
        f"/api/buildings/{building['id']}/messages",
        headers=headers,
    )
    assert general_list.status_code == 200
    assert [message["content"] for message in general_list.json()] == ["总频道留言"]
    assert all(message["room_name"] is None for message in general_list.json())

    rooms = client.get(
        f"/api/buildings/{building['id']}/chatrooms",
        headers=headers,
    )
    assert rooms.status_code == 200
    data = rooms.json()
    assert data[0]["is_general"] is True
    assert data[0]["message_count"] == 1
    classroom = next(room for room in data if room["room_name"] == "教4-101")
    assert classroom["message_count"] == 1


def test_listed_messages_created_at_is_timezone_aware_utc(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)

    with SessionLocal() as session:
        building = session.query(Building).first()
        user = session.query(User).filter(User.username == "alice").one()
        assert building is not None
        session.query(Message).filter(Message.building_id == building.id).delete()
        session.add(
            Message(
                building_id=building.id,
                user_id=user.id,
                content="时区检查",
                display_name="Other",
                status="normal",
                created_at=datetime(2026, 5, 29, 8, 0, tzinfo=timezone.utc),
            )
        )
        session.commit()
        building_id = building.id

    response = client.get(f"/api/buildings/{building_id}/messages", headers=headers)

    assert response.status_code == 200
    (message,) = response.json()
    assert message["created_at"].endswith(("+00:00", "Z"))
    assert datetime.fromisoformat(message["created_at"]) == datetime(
        2026, 5, 29, 8, 0, tzinfo=timezone.utc
    )


def seed_paged_messages(SessionLocal: sessionmaker, count: int) -> int:
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
                    content=f"message-{index:02d}",
                    display_name="Other",
                    status="normal",
                    created_at=base_time + timedelta(minutes=index),
                )
                for index in range(count)
            ]
        )
        session.commit()
        return building.id


def test_get_messages_before_id_pages_earlier_messages(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    building_id = seed_paged_messages(SessionLocal, 20)

    latest = client.get(
        f"/api/buildings/{building_id}/messages",
        params={"limit": 5},
        headers=headers,
    )
    assert latest.status_code == 200
    assert [message["content"] for message in latest.json()] == [
        f"message-{index:02d}" for index in range(15, 20)
    ]

    earlier = client.get(
        f"/api/buildings/{building_id}/messages",
        params={"limit": 5, "before_id": latest.json()[0]["id"]},
        headers=headers,
    )

    assert earlier.status_code == 200
    assert [message["content"] for message in earlier.json()] == [
        f"message-{index:02d}" for index in range(10, 15)
    ]


def test_get_messages_before_id_takes_precedence_over_offset(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    building_id = seed_paged_messages(SessionLocal, 20)

    latest = client.get(
        f"/api/buildings/{building_id}/messages",
        params={"limit": 5},
        headers=headers,
    )
    assert latest.status_code == 200
    before_id = latest.json()[0]["id"]

    response = client.get(
        f"/api/buildings/{building_id}/messages",
        params={"limit": 5, "offset": 100, "before_id": before_id},
        headers=headers,
    )

    assert response.status_code == 200
    assert [message["content"] for message in response.json()] == [
        f"message-{index:02d}" for index in range(10, 15)
    ]


def test_create_message_with_unknown_room_name_returns_422(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_and_session
    building = get_first_building(client)

    response = client.post(
        f"/api/buildings/{building['id']}/messages",
        json={
            "content": "hello",
            "room_name": "不存在的教室-999",
            **message_location_payload(building),
        },
        headers=auth_headers(client),
    )

    assert response.status_code == 422
    data = response.json()
    assert data["code"] == "room_not_found"
    assert "教室" in data["message"]
    assert data["fields"] == ["room_name"]


def test_create_message_accepts_room_name_from_existing_messages(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    building = get_first_building(client)
    headers = auth_headers(client)

    with SessionLocal() as session:
        user = session.query(User).filter(User.username == "alice").one()
        session.add(
            Message(
                building_id=building["id"],
                user_id=user.id,
                content="历史房间留言",
                display_name="Other",
                room_name="历史教室-101",
                status="normal",
            )
        )
        session.commit()

    response = client.post(
        f"/api/buildings/{building['id']}/messages",
        json={
            "content": "跟帖留言",
            "room_name": "历史教室-101",
            **message_location_payload(building),
        },
        headers=headers,
    )

    assert response.status_code == 201
    assert response.json()["room_name"] == "历史教室-101"
