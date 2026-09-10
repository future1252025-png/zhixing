from types import SimpleNamespace
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.core.security import get_current_user
from app.db.database import Base, create_sqlite_engine, get_session
from app.db.seed import load_map_points_seed, _seed_buildings
from app.main import app
from app.models import Building, BuildingMapPoi


@pytest.fixture
def database(tmp_path):
    engine = create_sqlite_engine(f"sqlite:///{(tmp_path / 'mapping.db').as_posix()}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as session:
        for name in ("教4", "教3"):
            session.add(Building(name=name, type="教学楼", description=name,
                                 latitude=30.58, longitude=114.32, map_x=40, map_y=40))
        session.commit()
    def sessions():
        with factory() as session:
            yield session
    app.dependency_overrides[get_session] = sessions
    try:
        yield factory, TestClient(app)
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_only_admin_can_bind_and_read_is_non_mutating(database):
    factory, client = database
    payload = {"poi_id": "B_TEST_4", "name": "四号教学楼"}
    assert client.put('/api/buildings/1/map-pois', json=payload).status_code == 401
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role="student")
    assert client.put('/api/buildings/1/map-pois', json=payload).status_code == 403
    assert client.get('/api/buildings/1').json()['map_pois'] == []
    with factory() as session:
        assert session.scalar(select(BuildingMapPoi)) is None


def test_binding_is_unique_idempotent_and_does_not_rekey_buildings(database):
    factory, client = database
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role="admin")
    before = client.get('/api/buildings').json()
    payload = {"poi_id": "B_TEST_4", "name": "四号教学楼"}
    response = client.put('/api/buildings/1/map-pois', json=payload)
    assert response.status_code == 200
    assert client.put('/api/buildings/1/map-pois', json=payload).json() == response.json()
    assert client.put('/api/buildings/2/map-pois', json=payload).status_code == 409
    after = client.get('/api/buildings').json()
    assert [(item['id'], item['name']) for item in after] == [(item['id'], item['name']) for item in before]
    assert client.get('/api/buildings/1').json()['map_pois'] == [response.json()]
    assert client.get('/api/buildings/2').json()['map_pois'] == []
    with factory() as session:
        assert len(session.scalars(select(BuildingMapPoi)).all()) == 1


@pytest.mark.parametrize('payload', [
    {"poi_id": "<script>", "name": "x"}, {"poi_id": "B_TEST", "name": " "},
    {"provider": "unknown", "poi_id": "B_TEST", "name": "x"},
    {"poi_id": "B_TEST", "name": "x", "building_id": 2},
])
def test_rejects_invalid_binding_payload(database, payload):
    _, client = database
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role="admin")
    assert client.put('/api/buildings/1/map-pois', json=payload).status_code == 422


def test_missing_building_cannot_be_bound(database):
    _, client = database
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role="admin")
    assert client.put('/api/buildings/999/map-pois', json={"poi_id": "B_TEST", "name": "x"}).status_code == 404


def test_seed_keeps_optional_poi_ids_and_preserves_admin_bindings(database, tmp_path, monkeypatch):
    factory, client = database
    point = client.get('/api/buildings/1').json()
    point.pop('id')
    point['map_pois'] = [{"provider": "amap", "poi_id": "B_TEST_4", "name": "四号教学楼"}]
    seed_path = tmp_path / 'points.json'
    seed_path.write_text(json.dumps([point]), encoding='utf-8')
    points = load_map_points_seed(seed_path)
    assert points[0]['map_pois'] == point['map_pois']
    monkeypatch.setattr('app.db.seed.DEMO_BUILDINGS', points)
    with factory() as session:
        assert _seed_buildings(session)['教4'].id == 1
        session.commit()
        points[0].pop('map_pois')
        _seed_buildings(session)
        session.commit()
        assert session.scalar(select(BuildingMapPoi)).poi_id == 'B_TEST_4'
        points[0]['name'] = '教3'
        points[0]['map_pois'] = point['map_pois']
        with pytest.raises(ValueError, match='already belongs'):
            _seed_buildings(session)
        session.rollback()
