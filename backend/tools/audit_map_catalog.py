"""Read-only catalog/batch preflight. Never imports app settings or opens a DB."""
import argparse
from collections import Counter
import json
import math
from pathlib import Path
import re
import sys
import unicodedata

DEFAULT_CATALOG = Path(__file__).resolve().parents[1] / "app/db/map_points_seed.json"


def name_key(name):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", name)).casefold()


def finite_number(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)


def distance(a, b):
    lat1, lat2 = math.radians(a["latitude"]), math.radians(b["latitude"])
    dlat = lat2 - lat1
    dlon = math.radians(b["longitude"] - a["longitude"])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(h)))


def audit_catalog(catalog, candidates=None):
    errors, warnings = [], []
    names, pois, valid_points = {}, {}, []
    categories = Counter()
    bound_count = 0
    candidate_count = 0

    for source, points in [("catalog", catalog), ("candidates", candidates or [])]:
        if not isinstance(points, list):
            errors.append(f"{source}: 必须是地点数组")
            continue
        for index, point in enumerate(points, 1):
            label = f"{source}[{index}]"
            if not isinstance(point, dict):
                errors.append(f"{label}: 必须是地点对象")
                continue
            name = point.get("name")
            kind = point.get("type")
            if not isinstance(name, str) or not name.strip() or len(name.strip()) > 100:
                errors.append(f"{label}: 名称须为 1–100 字符")
                continue
            if not isinstance(kind, str) or not kind.strip() or len(kind.strip()) > 50:
                errors.append(f"{label}: 分类须为 1–50 字符")
            label += f" {name}"
            key = name_key(name)
            if key in names:
                # Existing seed has historical duplicate parking names. Report
                # them, never repeat its order-dependent renaming for new places.
                target = warnings if source == "catalog" else errors
                target.append(f"{label}: 与 {names[key]} 重名，须核对已有建筑 ID，不可自动新建或重编号")
            else:
                names[key] = label
            lat, lon = point.get("latitude"), point.get("longitude")
            valid_coordinate = finite_number(lat) and finite_number(lon) and abs(lat) <= 90 and abs(lon) <= 180
            if not valid_coordinate:
                errors.append(f"{label}: 经纬度无效（纬度 ±90，经度 ±180；须为有限数值）")
            if source == "catalog":
                categories[str(kind)] += 1
            else:
                candidate_count += 1
                if valid_coordinate:
                    near = [entry["name"] for entry in valid_points if distance(point, entry) <= 25]
                    if near:
                        warnings.append(f"{label}: 距已有/本批地点不足 25 米：{'、'.join(near[:5])}；需人工确认是否同一建筑")
            bindings = point.get("map_pois", [])
            if not isinstance(bindings, list):
                errors.append(f"{label}: map_pois 必须是数组")
                bindings = []
            if source == "catalog" and bindings:
                bound_count += 1
            for binding in bindings:
                if (not isinstance(binding, dict) or binding.get("provider") != "amap"
                        or not isinstance(binding.get("poi_id"), str)
                        or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", binding["poi_id"])
                        or not isinstance(binding.get("name"), str) or not 1 <= len(binding["name"].strip()) <= 150):
                    errors.append(f"{label}: 原生地点关联字段无效")
                    continue
                poi_id = binding["poi_id"]
                if poi_id in pois:
                    errors.append(f"{label}: POI {poi_id} 已用于 {pois[poi_id]}，不可抢占或重复关联")
                else:
                    pois[poi_id] = label
            if valid_coordinate:
                valid_points.append(point)

    return {"read_only": True, "catalog_places": len(catalog) if isinstance(catalog, list) else 0,
        "catalog_bound_places": bound_count, "catalog_categories": dict(sorted(categories.items())),
        "candidate_places": candidate_count, "errors": errors, "warnings": warnings,
        "note": "仅检查数据，不代表地图地点已经核实；不写数据库、不新增频道、不更改现有 ID。"}


def read_candidates(path, declared_crs=None):
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    crs = data.get("coordinate_system") if isinstance(data, dict) else declared_crs
    if crs != "WGS84":
        raise ValueError("候选数据须明确声明 coordinate_system=WGS84；原生 GCJ-02 数据请先核对转换，不可直接混入")
    points = data.get("places") if isinstance(data, dict) else data
    if not isinstance(points, list):
        raise ValueError("候选数据须为数组，或包含 places 数组的对象")
    return points


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG, help="种子 JSON 或现有建筑接口导出的数组")
    parser.add_argument("--candidates", type=Path, help="待扩充批次，只检查，不导入")
    parser.add_argument("--candidate-crs", choices=["WGS84"], help="采集器旧数组格式须显式声明坐标系")
    args = parser.parse_args()
    try:
        catalog = json.loads(args.catalog.read_text(encoding="utf-8-sig"))
        candidates = read_candidates(args.candidates, args.candidate_crs) if args.candidates else None
        result = audit_catalog(catalog, candidates)
    except (OSError, ValueError) as error:
        parser.exit(2, f"数据检查失败：{error}\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
