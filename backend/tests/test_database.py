from pathlib import Path

from sqlalchemy import inspect, select
from sqlalchemy.orm import sessionmaker

from app.db.database import Base, create_sqlite_engine, init_db
from app.db.seed import initialize_database, seed_demo_data
from app.models import Building, Course, LocationPreset, Message, User


def make_test_database_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def test_database_tables_can_be_created(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "schema.db"))

    init_db(engine)

    table_names = set(inspect(engine).get_table_names())
    assert {
        "users",
        "buildings",
        "courses",
        "messages",
        "location_presets",
    }.issubset(table_names)


def test_seed_demo_data_writes_core_records(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "seed.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with SessionLocal() as session:
        counts = seed_demo_data(session)

        assert counts["users"] >= 1
        assert counts["buildings"] >= 8
        assert counts["courses"] >= 3
        assert counts["messages"] >= 4
        assert counts["location_presets"] >= 4
        assert session.scalar(select(Building).where(Building.name == "图书馆")) is not None


def test_seed_demo_data_is_idempotent(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "idempotent.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with SessionLocal() as session:
        first_counts = seed_demo_data(session)
        second_counts = seed_demo_data(session)

        assert second_counts == first_counts


def test_initialize_database_creates_sqlite_file(tmp_path: Path) -> None:
    database_path = tmp_path / "campusmind.db"

    counts = initialize_database(make_test_database_url(database_path))

    assert database_path.exists()
    assert counts["buildings"] >= 8
    assert counts["location_presets"] >= 4


def test_model_relationships_are_available(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "relations.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with SessionLocal() as session:
        seed_demo_data(session)
        message = session.scalars(select(Message)).first()
        course = session.scalars(select(Course)).first()
        preset = session.scalars(select(LocationPreset)).first()
        user = session.scalars(select(User)).first()

        assert message is not None
        assert message.building is not None
        assert message.user is not None
        assert course is not None
        assert course.building is not None
        assert preset is not None
        assert preset.building is not None
        assert user is not None
        assert len(user.courses) >= 1
