from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.db.database import upgrade_database


BACKEND_DIR = Path(__file__).resolve().parents[1]
BASELINE_TABLES = {
    "users",
    "buildings",
    "courses",
    "messages",
    "location_presets",
}


def make_database_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def migration_config(database_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def upgrade_to_baseline(database_url: str) -> None:
    command.upgrade(migration_config(database_url), "20260720_00")


def insert_legacy_course(database_url: str) -> None:
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO users "
                    "(id, student_id, username, password_hash, nickname, role, created_at) "
                    "VALUES (1, '20240001', 'legacy', 'hash', 'Legacy', 'student', CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO buildings "
                    "(id, name, type, description, latitude, longitude, map_x, map_y, created_at) "
                    "VALUES (1, 'Legacy building', 'teaching', 'legacy', 0, 0, 0, 0, CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO courses "
                    "(id, user_id, course_name, weekday, start_time, end_time, building_id, room_name, teacher, weeks, created_at) "
                    "VALUES (1, 1, 'Legacy course', 1, '08:00', '09:40', 1, '101', NULL, NULL, CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(text("DROP TABLE alembic_version"))
    finally:
        engine.dispose()


def test_upgrade_on_empty_sqlite_creates_current_schema(tmp_path: Path) -> None:
    database_url = make_database_url(tmp_path / "empty.db")

    command.upgrade(migration_config(database_url), "head")

    engine = create_engine(database_url)
    try:
        inspector = inspect(engine)
        assert BASELINE_TABLES | {"semester_settings", "course_import_sources"} <= set(
            inspector.get_table_names()
        )
        assert "source_kind" in {
            column["name"] for column in inspector.get_columns("courses")
        }
        source_columns = {
            column["name"]: column
            for column in inspector.get_columns("course_import_sources")
        }
        assert not source_columns["filename"]["nullable"]
        assert not source_columns["file_sha256"]["nullable"]
        assert not source_columns["source_row"]["nullable"]
    finally:
        engine.dispose()


def test_upgrade_adopts_complete_unversioned_legacy_database(tmp_path: Path) -> None:
    database_url = make_database_url(tmp_path / "legacy.db")
    upgrade_to_baseline(database_url)
    insert_legacy_course(database_url)

    upgrade_database(database_url)

    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT COUNT(*) FROM courses")) == 1
            assert connection.scalar(text("SELECT weeks FROM courses WHERE id = 1")) == "1-20"
        assert {"semester_settings", "course_import_sources"} <= set(
            inspect(engine).get_table_names()
        )
    finally:
        engine.dispose()


def test_upgrade_rejects_incomplete_unversioned_legacy_schema(tmp_path: Path) -> None:
    database_url = make_database_url(tmp_path / "incomplete.db")
    upgrade_to_baseline(database_url)
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP TABLE alembic_version"))
            connection.execute(text("DROP INDEX ix_courses_weekday"))
            connection.execute(text("ALTER TABLE courses DROP COLUMN weekday"))
    finally:
        engine.dispose()

    with pytest.raises(RuntimeError, match="备份|backup"):
        upgrade_database(database_url)

    engine = create_engine(database_url)
    try:
        assert "alembic_version" not in inspect(engine).get_table_names()
    finally:
        engine.dispose()


def test_upgrade_rejects_unversioned_legacy_schema_with_extra_columns(
    tmp_path: Path,
) -> None:
    database_url = make_database_url(tmp_path / "extra-column.db")
    upgrade_to_baseline(database_url)
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP TABLE alembic_version"))
            connection.execute(text("ALTER TABLE users ADD COLUMN unsupported TEXT"))
    finally:
        engine.dispose()

    with pytest.raises(RuntimeError, match="额外列|extra"):
        upgrade_database(database_url)

    engine = create_engine(database_url)
    try:
        assert "alembic_version" not in inspect(engine).get_table_names()
    finally:
        engine.dispose()


def test_alembic_upgrade_is_idempotent(tmp_path: Path) -> None:
    database_url = make_database_url(tmp_path / "repeat.db")
    config = migration_config(database_url)

    command.upgrade(config, "head")
    command.upgrade(config, "head")

    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "20260720_01"
    finally:
        engine.dispose()
