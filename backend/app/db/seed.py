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

DEMO_BUILDINGS = [
    {
        "name": "湖北大学图书馆",
        "type": "图书馆",
        "description": "武昌主校区图书馆，位于友谊大道校区核心区域，是自习、借阅和校园定位演示的主要点位。",
        "latitude": 30.58122,
        "longitude": 114.32917,
        "map_x": 54.0,
        "map_y": 42.0,
        "walk_hint": "靠近校史馆、求索广场和学生宿舍区，适合作为常用出发点。",
    },
    {
        "name": "思睿厅",
        "type": "教学与活动空间",
        "description": "图书馆与求索广场附近的校园建筑，地图上可直接识别，适合演示建筑详情和留言。",
        "latitude": 30.58069,
        "longitude": 114.32911,
        "map_x": 53.0,
        "map_y": 49.0,
        "walk_hint": "距离图书馆很近，步行约 1 到 2 分钟。",
    },
    {
        "name": "湖北大学国际教育学院",
        "type": "学院楼",
        "description": "武昌主校区西南侧学院建筑，靠近月亮广场和马克思主义学院。",
        "latitude": 30.58019,
        "longitude": 114.32701,
        "map_x": 31.0,
        "map_y": 55.0,
        "walk_hint": "从图书馆步行约 4 到 6 分钟。",
    },
    {
        "name": "求索广场",
        "type": "广场",
        "description": "图书馆西南侧的校园广场，是武昌主校区地图上的重要识别点。",
        "latitude": 30.58051,
        "longitude": 114.32831,
        "map_x": 43.0,
        "map_y": 51.0,
        "walk_hint": "靠近图书馆和思睿厅，适合作为集合点。",
    },
    {
        "name": "太阳广场",
        "type": "广场",
        "description": "图书馆西侧广场点位，适合展示校园公共空间和位置预设。",
        "latitude": 30.58122,
        "longitude": 114.32739,
        "map_x": 34.0,
        "map_y": 42.0,
        "walk_hint": "从图书馆向西步行约 2 到 3 分钟。",
    },
    {
        "name": "二号场",
        "type": "体育设施",
        "description": "武昌主校区东侧体育场地，靠近二号体育馆和保龄球馆。",
        "latitude": 30.58265,
        "longitude": 114.33104,
        "map_x": 74.0,
        "map_y": 24.0,
        "walk_hint": "距离图书馆较近，运动课程建议提前到达。",
    },
    {
        "name": "二号体育馆",
        "type": "体育设施",
        "description": "二号场附近的体育馆点位，适合展示较近距离的出发建议。",
        "latitude": 30.58265,
        "longitude": 114.32968,
        "map_x": 59.0,
        "map_y": 24.0,
        "walk_hint": "位于图书馆东北侧，步行约 2 到 4 分钟。",
    },
    {
        "name": "一期菜鸟驿站",
        "type": "生活服务",
        "description": "图书馆和宿舍区附近的快递服务点，适合展示校园生活留言。",
        "latitude": 30.58135,
        "longitude": 114.32973,
        "map_x": 60.0,
        "map_y": 40.0,
        "walk_hint": "取件高峰期人流较多。",
    },
    {
        "name": "普通宿舍10栋",
        "type": "宿舍",
        "description": "图书馆西北侧普通宿舍楼，用于演示从生活区到教学区的出发建议。",
        "latitude": 30.58139,
        "longitude": 114.32830,
        "map_x": 43.0,
        "map_y": 39.0,
        "walk_hint": "从宿舍出发去图书馆和学院楼较近。",
    },
    {
        "name": "普通宿舍7栋",
        "type": "宿舍",
        "description": "思睿厅东侧普通宿舍楼，适合作为手动当前位置预设。",
        "latitude": 30.58069,
        "longitude": 114.33026,
        "map_x": 66.0,
        "map_y": 49.0,
        "walk_hint": "去图书馆和二号体育馆都比较方便。",
    },
]

DEMO_LOCATION_PRESETS = [
    {"name": "普通宿舍10栋", "building": "普通宿舍10栋", "description": "演示从宿舍去上课"},
    {"name": "湖北大学图书馆", "building": "湖北大学图书馆", "description": "演示从图书馆去教学楼"},
    {"name": "求索广场", "building": "求索广场", "description": "演示从校园广场去下一节课"},
    {"name": "二号场", "building": "二号场", "description": "演示从体育区域出发"},
]

DEMO_COURSES = [
    {
        "course_name": "数据库原理",
        "weekday": 1,
        "start_time": "10:10",
        "end_time": "11:50",
        "building": "湖北大学国际教育学院",
        "room_name": "302",
        "teacher": "张老师",
        "weeks": "1-16",
    },
    {
        "course_name": "软件工程",
        "weekday": 1,
        "start_time": "14:00",
        "end_time": "15:40",
        "building": "思睿厅",
        "room_name": "204",
        "teacher": "李老师",
        "weeks": "1-16",
    },
    {
        "course_name": "Python 程序设计",
        "weekday": 3,
        "start_time": "08:00",
        "end_time": "09:40",
        "building": "二号体育馆",
        "room_name": "机房 A",
        "teacher": "王老师",
        "weeks": "1-16",
    },
]

DEMO_MESSAGES = [
    {"building": "湖北大学图书馆", "content": "三楼靠窗还有空位"},
    {"building": "湖北大学图书馆", "content": "今天二楼比较安静"},
    {"building": "一期菜鸟驿站", "content": "下午取件人比较多"},
    {"building": "思睿厅", "content": "晚上附近比较安静，适合自习"},
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
