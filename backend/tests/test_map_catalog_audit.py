import json

import pytest

from tools.audit_map_catalog import DEFAULT_CATALOG, audit_catalog, read_candidates


def point(name="测试楼", **changes):
    return {"name": name, "type": "教学楼", "latitude": 30.58, "longitude": 114.33, **changes}


def poi(poi_id="TEST_FIXTURE"):
    return {"provider": "amap", "poi_id": poi_id, "name": "测试原生地点"}


def test_existing_seed_can_be_audited_without_mutation():
    before = DEFAULT_CATALOG.read_bytes()
    catalog = json.loads(before)
    result = audit_catalog(catalog)
    assert not result["errors"]
    assert result["catalog_places"] == len(catalog)
    assert any("停车场" in warning for warning in result["warnings"])
    assert DEFAULT_CATALOG.read_bytes() == before


def test_rejects_duplicate_names_and_pois_without_merging_channels():
    result = audit_catalog([point(map_pois=[poi()])], [point(" 测试楼 ", map_pois=[poi()])])
    assert any("重名" in error for error in result["errors"])
    assert any("不可抢占" in error for error in result["errors"])
    assert result["read_only"] is True


@pytest.mark.parametrize("changes", [
    {"latitude": 114.33, "longitude": 30.58}, {"latitude": float("nan")},
    {"longitude": float("inf")}, {"latitude": True}, {"name": ""},
    {"type": ""}, {"map_pois": {}}, {"map_pois": [{"provider": "amap", "poi_id": "bad id"}]},
])
def test_rejects_malformed_candidates(changes):
    assert audit_catalog([], [point(**changes)])["errors"]


def test_nearby_is_only_a_warning_and_never_an_automatic_identity():
    result = audit_catalog([point()], [point("另一栋楼", longitude=114.33001)])
    assert not result["errors"]
    assert any("25 米" in warning for warning in result["warnings"])
    assert result["candidate_places"] == 1


def test_requires_explicit_coordinate_system_for_candidates(tmp_path):
    path = tmp_path / "batch.json"
    path.write_text(json.dumps([point()]), encoding="utf-8")
    with pytest.raises(ValueError, match="WGS84"):
        read_candidates(path)
    assert read_candidates(path, "WGS84") == [point()]
    path.write_text(json.dumps({"coordinate_system": "GCJ02", "places": [point()]}), encoding="utf-8")
    with pytest.raises(ValueError, match="WGS84"):
        read_candidates(path, "WGS84")
    path.write_text(json.dumps({"coordinate_system": "WGS84", "places": [point()]}), encoding="utf-8")
    assert read_candidates(path) == [point()]
