from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.db.database import Base, create_sqlite_engine, get_session, init_db
from app.db.seed import DEMO_BUILDINGS, seed_demo_data
from app.main import app


def make_test_database_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


@pytest.fixture
def seeded_client(tmp_path: Path) -> Generator[TestClient, None, None]:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "buildings.db"))
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
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def test_get_buildings_returns_seeded_buildings(seeded_client: TestClient) -> None:
    response = seeded_client.get("/api/buildings")

    assert response.status_code == 200
    data = response.json()
    assert len(data) >= len(DEMO_BUILDINGS)
    assert DEMO_BUILDINGS[0]["name"] in {building["name"] for building in data}
    assert {
        "id",
        "name",
        "type",
        "description",
        "latitude",
        "longitude",
        "map_x",
        "map_y",
        "walk_hint",
    }.issubset(data[0])


def test_get_building_detail_returns_matching_building(
    seeded_client: TestClient,
) -> None:
    buildings = seeded_client.get("/api/buildings").json()
    target = buildings[0]

    response = seeded_client.get(f"/api/buildings/{target['id']}")

    assert response.status_code == 200
    assert response.json()["id"] == target["id"]
    assert response.json()["name"] == target["name"]


def test_get_missing_building_returns_404(seeded_client: TestClient) -> None:
    response = seeded_client.get("/api/buildings/999999")

    assert response.status_code == 404
    assert response.json() == {
        "code": "building_not_found",
        "message": "Building not found",
        "fields": [],
        "details": {},
    }


def test_get_location_presets_returns_seeded_presets(
    seeded_client: TestClient,
) -> None:
    response = seeded_client.get("/api/location-presets")

    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 3
    assert {
        "id",
        "name",
        "building_id",
        "building_name",
        "latitude",
        "longitude",
        "description",
    }.issubset(data[0])
