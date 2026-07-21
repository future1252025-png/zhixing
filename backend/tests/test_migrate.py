from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.orm import sessionmaker

from app.db.database import Base, create_sqlite_engine, init_db
from app.db.migrate import HEAD_REVISION, current_revision, ensure_schema
from app.db.seed import seed_demo_data


def make_test_database_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def test_ensure_schema_on_empty_db_runs_migrations(tmp_path: Path) -> None:
    db_path = tmp_path / "migrated.db"
    url = make_test_database_url(db_path)
    engine = create_sqlite_engine(url)

    ensure_schema(engine)

    tables = set(inspect(engine).get_table_names())
    assert {
        "users",
        "buildings",
        "courses",
        "messages",
        "location_presets",
        "alembic_version",
    }.issubset(tables)
    assert current_revision(engine) == HEAD_REVISION
    engine.dispose()


def test_ensure_schema_stamps_legacy_db_without_alembic_version(tmp_path: Path) -> None:
    db_path = tmp_path / "legacy.db"
    url = make_test_database_url(db_path)
    engine = create_sqlite_engine(url)

    # Simulate pre-Alembic create_all schema with a missing optional column.
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY,
                    student_id VARCHAR(32),
                    username VARCHAR(64) NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    nickname VARCHAR(64) NOT NULL,
                    role VARCHAR(32) NOT NULL,
                    created_at DATETIME NOT NULL
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE buildings (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    type VARCHAR(50) NOT NULL,
                    description TEXT NOT NULL,
                    latitude FLOAT NOT NULL,
                    longitude FLOAT NOT NULL,
                    map_x FLOAT NOT NULL,
                    map_y FLOAT NOT NULL,
                    walk_hint VARCHAR(255),
                    created_at DATETIME NOT NULL
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE messages (
                    id INTEGER PRIMARY KEY,
                    building_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    display_name VARCHAR(64) NOT NULL,
                    status VARCHAR(32) NOT NULL,
                    created_at DATETIME NOT NULL
                )
                """
            )
        )

    ensure_schema(engine)

    user_columns = {column["name"] for column in inspect(engine).get_columns("users")}
    message_columns = {
        column["name"] for column in inspect(engine).get_columns("messages")
    }
    assert "avatar_text" in user_columns
    assert "avatar_color" in user_columns
    assert "room_name" in message_columns
    assert current_revision(engine) == HEAD_REVISION
    engine.dispose()


def test_init_db_default_engine_uses_migrations(tmp_path: Path, monkeypatch) -> None:
    db_path = tmp_path / "runtime.db"
    url = make_test_database_url(db_path)
    engine = create_sqlite_engine(url)

    monkeypatch.setattr("app.db.database.engine", engine)

    init_db()

    assert current_revision(engine) == HEAD_REVISION
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with SessionLocal() as session:
        counts = seed_demo_data(session)
        assert counts["buildings"] >= 1
    engine.dispose()


def test_init_db_with_bind_still_uses_create_all(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "tests.db"))
    init_db(engine)

    tables = set(inspect(engine).get_table_names())
    assert "users" in tables
    assert "alembic_version" not in tables
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
