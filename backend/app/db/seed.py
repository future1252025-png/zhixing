import json
from collections import Counter
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import DEFAULT_DATABASE_PATH, settings
from app.db.database import create_sqlite_engine, init_db
from app.models import Building, Course, LocationPreset, Message, User


DEMO_USER = {
    "student_id": "20240001",
    "username": "demo",
    "password_hash": "demo-password-hash-placeholder",
    "nickname": "演示同学",
    "role": "student",
}


MAP_POINTS_SEED_FILE = Path(__file__).with_name("map_points_seed.json")
MAP_POINT_REQUIRED_FIELDS = {
    "name",
    "type",
    "description",
    "latitude",
    "longitude",
    "map_x",
    "map_y",
    "walk_hint",
}


def load_map_points_seed(
    path: Path = MAP_POINTS_SEED_FILE,
) -> list[dict[str, str | float | None]]:
    raw_points = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(raw_points, list):
        raise ValueError("Map points seed file must contain a JSON array")

    name_totals = Counter(
        str(item.get("name", "")).strip()
        for item in raw_points
        if isinstance(item, dict)
    )
    name_seen: Counter[str] = Counter()
    points: list[dict[str, str | float | None]] = []

    for index, item in enumerate(raw_points, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Map point #{index} must be a JSON object")

        missing_fields = MAP_POINT_REQUIRED_FIELDS - item.keys()
        if missing_fields:
            fields = ", ".join(sorted(missing_fields))
            raise ValueError(f"Map point #{index} missing fields: {fields}")

        name = str(item["name"]).strip()
        if not name:
            raise ValueError(f"Map point #{index} has empty name")
        name_seen[name] += 1
        if name_totals[name] > 1:
            name = f"{name}（{name_seen[name]}）"

        points.append(
            {
                "name": name,
                "type": str(item["type"]).strip() or "校园地点",
                "description": str(item["description"]).strip(),
                "latitude": float(item["latitude"]),
                "longitude": float(item["longitude"]),
                "map_x": float(item["map_x"]),
                "map_y": float(item["map_y"]),
                "walk_hint": str(item["walk_hint"]).strip() or None,
            }
        )

    return points


DEMO_BUILDINGS = load_map_points_seed()

DEMO_LOCATION_PRESETS = [
    {
        "name": "一期学生公寓",
        "building": "湖北大学武昌校区一期学生公寓",
        "description": "演示从学生公寓去上课",
    },
    {
        "name": "图书馆",
        "building": "湖北大学武昌校区图书馆",
        "description": "演示从图书馆去教学楼",
    },
    {
        "name": "求索广场",
        "building": "求索广场",
        "description": "演示从校园广场去下一节课",
    },
    {
        "name": "风华园食堂",
        "building": "风华园食堂",
        "description": "演示从食堂出发",
    },
]

DEMO_COURSES = [
    {
        "course_name": "数据库原理",
        "weekday": 1,
        "start_time": "10:10",
        "end_time": "11:50",
        "building": "湖北大学武昌校区国际教育学院",
        "room_name": "302",
        "teacher": "张老师",
        "weeks": "1-16",
    },
    {
        "course_name": "软件工程",
        "weekday": 1,
        "start_time": "14:00",
        "end_time": "15:40",
        "building": "湖北大学武昌校区计算机学院",
        "room_name": "204",
        "teacher": "李老师",
        "weeks": "1-16",
    },
    {
        "course_name": "Python 程序设计",
        "weekday": 3,
        "start_time": "08:00",
        "end_time": "09:40",
        "building": "湖北大学武昌校区1号体育馆",
        "room_name": "机房 A",
        "teacher": "王老师",
        "weeks": "1-16",
    },
]

DEMO_MESSAGES = [
    {"building": "湖北大学武昌校区图书馆", "content": "三楼靠窗还有空位"},
    {"building": "湖北大学武昌校区图书馆", "content": "今天二楼比较安静"},
    {"building": "湖北大学快递服务中心快递柜服务区-东区", "content": "下午取件人比较多"},
    {"building": "求索广场", "content": "晚上附近比较安静，适合自习"},
]

def _get_or_create_demo_user(session: Session) -> User:
    user = session.scalar(select(User).where(User.username == DEMO_USER["username"]))
    if user is not None:
        return user

    user = User(**DEMO_USER)
    session.add(user)
    session.flush()
    return user


def _seed_buildings(session: Session) -> dict[str, Building]:
    existing = {
        building.name: building
        for building in session.scalars(select(Building)).all()
    }
    for index, item in enumerate(DEMO_BUILDINGS, start=1):
        building = session.get(Building, index) or existing.get(item["name"])
        if building is None:
            building = Building(**item)
            session.add(building)
            session.flush()
        else:
            old_name = building.name
            for field, value in item.items():
                setattr(building, field, value)
            if old_name != building.name:
                existing.pop(old_name, None)
            session.flush()
        existing[building.name] = building
    return existing


def seed_demo_data(session: Session) -> dict[str, int]:
    user = _get_or_create_demo_user(session)
    buildings = _seed_buildings(session)

    for index, item in enumerate(DEMO_LOCATION_PRESETS, start=1):
        building = buildings[item["building"]]
        preset = session.get(LocationPreset, index) or session.scalar(
            select(LocationPreset).where(LocationPreset.name == item["name"])
        )
        if preset is None:
            session.add(
                LocationPreset(
                    name=item["name"],
                    building_id=building.id,
                    latitude=building.latitude,
                    longitude=building.longitude,
                    description=item["description"],
                )
            )
        else:
            preset.name = item["name"]
            preset.building_id = building.id
            preset.latitude = building.latitude
            preset.longitude = building.longitude
            preset.description = item["description"]

    for item in DEMO_COURSES:
        building = buildings[item["building"]]
        exists = session.scalar(
            select(Course).where(
                Course.user_id == user.id,
                Course.course_name == item["course_name"],
                Course.weekday == item["weekday"],
                Course.start_time == item["start_time"],
            )
        )
        if exists is None:
            session.add(
                Course(
                    user_id=user.id,
                    building_id=building.id,
                    course_name=item["course_name"],
                    weekday=item["weekday"],
                    start_time=item["start_time"],
                    end_time=item["end_time"],
                    room_name=item["room_name"],
                    teacher=item["teacher"],
                    weeks=item["weeks"],
                )
            )
        else:
            exists.building_id = building.id
            exists.end_time = item["end_time"]
            exists.room_name = item["room_name"]
            exists.teacher = item["teacher"]
            exists.weeks = item["weeks"]

    for item in DEMO_MESSAGES:
        building = buildings[item["building"]]
        exists = session.scalar(
            select(Message).where(
                Message.building_id == building.id,
                Message.content == item["content"],
            )
        )
        if exists is None:
            session.add(
                Message(
                    building_id=building.id,
                    user_id=user.id,
                    content=item["content"],
                    display_name="匿名同学",
                )
            )

    session.commit()
    return {
        "users": len(session.scalars(select(User)).all()),
        "buildings": len(session.scalars(select(Building)).all()),
        "courses": len(session.scalars(select(Course)).all()),
        "messages": len(session.scalars(select(Message)).all()),
        "location_presets": len(session.scalars(select(LocationPreset)).all()),
    }


def initialize_database(database_url: str = settings.database_url) -> dict[str, int]:
    DEFAULT_DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    engine = create_sqlite_engine(database_url)
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    try:
        with SessionLocal() as session:
            return seed_demo_data(session)
    finally:
        engine.dispose()


if __name__ == "__main__":
    counts = initialize_database()
    db_path = Path(settings.database_url.removeprefix("sqlite:///"))
    print(f"Initialized database at {db_path}")
    print(counts)
