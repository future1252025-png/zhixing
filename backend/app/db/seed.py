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
        "name": "图书馆",
        "type": "图书馆",
        "description": "学校主要自习与借阅空间，适合展示留言和当前位置。",
        "latitude": 30.5812,
        "longitude": 114.3221,
        "map_x": 52.0,
        "map_y": 36.0,
        "walk_hint": "靠近教学区，适合作为常用出发点。",
    },
    {
        "name": "一号教学楼",
        "type": "教学楼",
        "description": "常用教学楼之一，适合作为课程目标建筑。",
        "latitude": 30.5821,
        "longitude": 114.3240,
        "map_x": 60.0,
        "map_y": 42.0,
        "walk_hint": "从图书馆步行约 6 到 8 分钟。",
    },
    {
        "name": "二号教学楼",
        "type": "教学楼",
        "description": "主要教学楼之一，承载公共课和专业课。",
        "latitude": 30.5830,
        "longitude": 114.3250,
        "map_x": 65.0,
        "map_y": 45.0,
        "walk_hint": "靠近一号教学楼。",
    },
    {
        "name": "三号教学楼",
        "type": "教学楼",
        "description": "演示课程数据库原理的目标建筑。",
        "latitude": 30.5840,
        "longitude": 114.3260,
        "map_x": 69.0,
        "map_y": 49.0,
        "walk_hint": "从宿舍区出发需预留更多时间。",
    },
    {
        "name": "逸夫楼",
        "type": "教学楼",
        "description": "综合教学与办公建筑。",
        "latitude": 30.5803,
        "longitude": 114.3265,
        "map_x": 70.0,
        "map_y": 35.0,
        "walk_hint": "靠近教学核心区。",
    },
    {
        "name": "实验楼",
        "type": "实验楼",
        "description": "实验和上机课程常用建筑。",
        "latitude": 30.5850,
        "longitude": 114.3272,
        "map_x": 74.0,
        "map_y": 54.0,
        "walk_hint": "课程开始前建议提前到达。",
    },
    {
        "name": "一食堂",
        "type": "食堂",
        "description": "学生常用就餐区域，可展示排队信息留言。",
        "latitude": 30.5790,
        "longitude": 114.3210,
        "map_x": 47.0,
        "map_y": 58.0,
        "walk_hint": "饭点人流较多。",
    },
    {
        "name": "二食堂",
        "type": "食堂",
        "description": "另一处主要就餐区域。",
        "latitude": 30.5862,
        "longitude": 114.3228,
        "map_x": 55.0,
        "map_y": 65.0,
        "walk_hint": "靠近生活区。",
    },
    {
        "name": "体育馆",
        "type": "体育设施",
        "description": "体育活动和课程场地。",
        "latitude": 30.5870,
        "longitude": 114.3195,
        "map_x": 38.0,
        "map_y": 62.0,
        "walk_hint": "距离教学区相对较远。",
    },
    {
        "name": "学生宿舍区",
        "type": "生活区",
        "description": "学生住宿区域，适合演示手动当前位置。",
        "latitude": 30.5880,
        "longitude": 114.3230,
        "map_x": 56.0,
        "map_y": 72.0,
        "walk_hint": "去教学楼通常需要提前出发。",
    },
]

DEMO_LOCATION_PRESETS = [
    {"name": "学生宿舍区", "building": "学生宿舍区", "description": "演示从宿舍去上课"},
    {"name": "图书馆", "building": "图书馆", "description": "演示从图书馆去教学楼"},
    {"name": "一食堂", "building": "一食堂", "description": "演示从食堂去下一节课"},
    {"name": "体育馆", "building": "体育馆", "description": "演示较远距离估算"},
]

DEMO_COURSES = [
    {
        "course_name": "数据库原理",
        "weekday": 1,
        "start_time": "10:10",
        "end_time": "11:50",
        "building": "三号教学楼",
        "room_name": "302",
        "teacher": "张老师",
        "weeks": "1-16",
    },
    {
        "course_name": "软件工程",
        "weekday": 1,
        "start_time": "14:00",
        "end_time": "15:40",
        "building": "一号教学楼",
        "room_name": "204",
        "teacher": "李老师",
        "weeks": "1-16",
    },
    {
        "course_name": "Python 程序设计",
        "weekday": 3,
        "start_time": "08:00",
        "end_time": "09:40",
        "building": "实验楼",
        "room_name": "机房 A",
        "teacher": "王老师",
        "weeks": "1-16",
    },
]

DEMO_MESSAGES = [
    {"building": "图书馆", "content": "三楼靠窗还有空位"},
    {"building": "图书馆", "content": "今天二楼比较安静"},
    {"building": "一食堂", "content": "中午窗口排队较长"},
    {"building": "三号教学楼", "content": "302 教室投影正常"},
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
    for item in DEMO_BUILDINGS:
        if item["name"] not in existing:
            building = Building(**item)
            session.add(building)
            session.flush()
            existing[building.name] = building
    return existing


def seed_demo_data(session: Session) -> dict[str, int]:
    user = _get_or_create_demo_user(session)
    buildings = _seed_buildings(session)

    for item in DEMO_LOCATION_PRESETS:
        exists = session.scalar(
            select(LocationPreset).where(LocationPreset.name == item["name"])
        )
        if exists is None:
            building = buildings[item["building"]]
            session.add(
                LocationPreset(
                    name=item["name"],
                    building_id=building.id,
                    latitude=building.latitude,
                    longitude=building.longitude,
                    description=item["description"],
                )
            )

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
