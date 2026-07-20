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


def insert_legacy_course(database_url: str, *, drop_version: bool = True) -> None:
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
            if drop_version:
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
        assert any(
            "source_kind IN ('manual', 'import')" in constraint["sqltext"]
            for constraint in inspector.get_check_constraints("courses")
        )
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


def _replace_users_table(
    database_url: str,
    *,
    username_definition: str = "username VARCHAR(64) NOT NULL",
    primary_key_definition: str = "PRIMARY KEY (id)",
    extra_constraints: str = "",
) -> None:
    primary_key_sql = f", {primary_key_definition}" if primary_key_definition else ""
    extra_constraints_sql = f", {extra_constraints}" if extra_constraints else ""
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("PRAGMA foreign_keys=OFF"))
            connection.execute(text("PRAGMA legacy_alter_table=ON"))
            connection.execute(text("ALTER TABLE users RENAME TO users_legacy"))
            connection.execute(
                text(
                    "CREATE TABLE users ("
                    "id INTEGER NOT NULL, "
                    "student_id VARCHAR(32), "
                    f"{username_definition}, "
                    "password_hash VARCHAR(255) NOT NULL, "
                    "nickname VARCHAR(64) NOT NULL, "
                    "avatar_text VARCHAR(4), "
                    "avatar_color VARCHAR(16), "
                    "role VARCHAR(32) NOT NULL, "
                    f"created_at DATETIME NOT NULL{extra_constraints_sql}{primary_key_sql}"
                    ")"
                )
            )
            connection.execute(text("DROP TABLE users_legacy"))
            connection.execute(text("CREATE INDEX ix_users_id ON users (id)"))
            connection.execute(
                text("CREATE UNIQUE INDEX ix_users_student_id ON users (student_id)")
            )
            connection.execute(
                text("CREATE UNIQUE INDEX ix_users_username ON users (username)")
            )
    finally:
        engine.dispose()


def _replace_courses_table(
    database_url: str,
    *,
    user_foreign_key: str = "",
) -> None:
    user_foreign_key_sql = f", {user_foreign_key}" if user_foreign_key else ""
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("PRAGMA foreign_keys=OFF"))
            connection.execute(text("PRAGMA legacy_alter_table=ON"))
            connection.execute(text("ALTER TABLE courses RENAME TO courses_legacy"))
            connection.execute(
                text(
                    "CREATE TABLE courses ("
                    "id INTEGER NOT NULL, user_id INTEGER NOT NULL, "
                    "course_name VARCHAR(100) NOT NULL, weekday INTEGER NOT NULL, "
                    "start_time VARCHAR(5) NOT NULL, end_time VARCHAR(5) NOT NULL, "
                    "building_id INTEGER NOT NULL, room_name VARCHAR(64) NOT NULL, "
                    "teacher VARCHAR(64), weeks VARCHAR(64), created_at DATETIME NOT NULL, "
                    "FOREIGN KEY(building_id) REFERENCES buildings (id)"
                    f"{user_foreign_key_sql}, PRIMARY KEY (id)"
                    ")"
                )
            )
            connection.execute(text("DROP TABLE courses_legacy"))
            for index_name, column_name in (
                ("ix_courses_building_id", "building_id"),
                ("ix_courses_course_name", "course_name"),
                ("ix_courses_id", "id"),
                ("ix_courses_user_id", "user_id"),
                ("ix_courses_weekday", "weekday"),
            ):
                connection.execute(
                    text(f"CREATE INDEX {index_name} ON courses ({column_name})")
                )
    finally:
        engine.dispose()


def _assert_unversioned_schema_is_rejected(database_url: str, match: str) -> None:
    with pytest.raises(RuntimeError, match=match):
        upgrade_database(database_url)

    engine = create_engine(database_url)
    try:
        assert "alembic_version" not in inspect(engine).get_table_names()
    finally:
        engine.dispose()


def test_upgrade_rejects_unversioned_legacy_schema_without_username_unique_index(
    tmp_path: Path,
) -> None:
    database_url = make_database_url(tmp_path / "missing-unique-index.db")
    upgrade_to_baseline(database_url)
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP TABLE alembic_version"))
            connection.execute(text("DROP INDEX ix_users_username"))
    finally:
        engine.dispose()

    _assert_unversioned_schema_is_rejected(database_url, "unique indexes")


@pytest.mark.parametrize(
    ("filename", "username_definition", "primary_key_definition", "match"),
    [
        ("wrong-type.db", "username INTEGER NOT NULL", "PRIMARY KEY (id)", "type affinity"),
        ("wrong-nullability.db", "username VARCHAR(64)", "PRIMARY KEY (id)", "nullability"),
        ("wrong-primary-key.db", "username VARCHAR(64) NOT NULL", "", "primary key"),
    ],
)
def test_upgrade_rejects_unversioned_legacy_schema_with_column_signature_mismatch(
    tmp_path: Path,
    filename: str,
    username_definition: str,
    primary_key_definition: str,
    match: str,
) -> None:
    database_url = make_database_url(tmp_path / filename)
    upgrade_to_baseline(database_url)
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP TABLE alembic_version"))
    finally:
        engine.dispose()
    _replace_users_table(
        database_url,
        username_definition=username_definition,
        primary_key_definition=primary_key_definition,
    )

    _assert_unversioned_schema_is_rejected(database_url, match)


def test_upgrade_rejects_unversioned_legacy_schema_without_expected_foreign_key(
    tmp_path: Path,
) -> None:
    database_url = make_database_url(tmp_path / "missing-foreign-key.db")
    upgrade_to_baseline(database_url)
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP TABLE alembic_version"))
    finally:
        engine.dispose()
    _replace_courses_table(database_url)

    _assert_unversioned_schema_is_rejected(database_url, "foreign keys")


def test_upgrade_rejects_unversioned_legacy_schema_with_partial_unique_index(
    tmp_path: Path,
) -> None:
    database_url = make_database_url(tmp_path / "partial-index.db")
    upgrade_to_baseline(database_url)
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP TABLE alembic_version"))
            connection.execute(text("DROP INDEX ix_users_username"))
            connection.execute(
                text(
                    "CREATE UNIQUE INDEX ix_users_username ON users (username) "
                    "WHERE username LIKE 'a%'"
                )
            )
    finally:
        engine.dispose()

    _assert_unversioned_schema_is_rejected(database_url, "index predicates")


def test_upgrade_rejects_unversioned_legacy_schema_with_server_default(
    tmp_path: Path,
) -> None:
    database_url = make_database_url(tmp_path / "server-default.db")
    upgrade_to_baseline(database_url)
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP TABLE alembic_version"))
    finally:
        engine.dispose()
    _replace_users_table(
        database_url,
        username_definition="username VARCHAR(64) NOT NULL DEFAULT 'legacy'",
    )

    _assert_unversioned_schema_is_rejected(database_url, "server defaults")


def test_upgrade_rejects_unversioned_legacy_schema_with_extra_check_constraint(
    tmp_path: Path,
) -> None:
    database_url = make_database_url(tmp_path / "check-constraint.db")
    upgrade_to_baseline(database_url)
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP TABLE alembic_version"))
    finally:
        engine.dispose()
    _replace_users_table(database_url, extra_constraints="CHECK (username <> '')")

    _assert_unversioned_schema_is_rejected(database_url, "check constraints")


def test_upgrade_rejects_unversioned_legacy_schema_with_foreign_key_options(
    tmp_path: Path,
) -> None:
    database_url = make_database_url(tmp_path / "foreign-key-options.db")
    upgrade_to_baseline(database_url)
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP TABLE alembic_version"))
    finally:
        engine.dispose()
    _replace_courses_table(
        database_url,
        user_foreign_key="FOREIGN KEY(user_id) REFERENCES users (id) ON UPDATE CASCADE",
    )

    _assert_unversioned_schema_is_rejected(database_url, "foreign keys")


def test_migration_round_trip_preserves_legacy_course_and_recreates_current_schema(
    tmp_path: Path,
) -> None:
    database_url = make_database_url(tmp_path / "round-trip.db")
    config = migration_config(database_url)
    upgrade_to_baseline(database_url)
    insert_legacy_course(database_url, drop_version=False)

    command.upgrade(config, "head")
    command.downgrade(config, "20260720_00")

    engine = create_engine(database_url)
    try:
        inspector = inspect(engine)
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "20260720_00"
            assert connection.scalar(text("SELECT COUNT(*) FROM courses")) == 1
        legacy_course_columns = {
            column["name"]: column for column in inspector.get_columns("courses")
        }
        assert legacy_course_columns["weeks"]["nullable"]
        assert "source_kind" not in legacy_course_columns
        assert "semester_settings" not in inspector.get_table_names()
        assert "course_import_sources" not in inspector.get_table_names()
    finally:
        engine.dispose()

    command.upgrade(config, "head")

    engine = create_engine(database_url)
    try:
        inspector = inspect(engine)
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "20260720_02"
            assert connection.scalar(text("SELECT COUNT(*) FROM courses")) == 1
        assert "source_kind" in {
            column["name"] for column in inspector.get_columns("courses")
        }
        assert {"semester_settings", "course_import_sources"} <= set(
            inspector.get_table_names()
        )
        assert any(
            index["unique"] and index["column_names"] == ["user_id"]
            for index in inspector.get_indexes("semester_settings")
        )
        source_foreign_keys = inspector.get_foreign_keys("course_import_sources")
        assert source_foreign_keys == [
            {
                "name": None,
                "constrained_columns": ["course_id"],
                "referred_schema": None,
                "referred_table": "courses",
                "referred_columns": ["id"],
                "options": {"ondelete": "CASCADE"},
            }
        ]
    finally:
        engine.dispose()


def test_upgrade_database_supports_percent_in_sqlite_path(tmp_path: Path) -> None:
    database_url = make_database_url(tmp_path / "100%complete.db")

    upgrade_database(database_url)

    engine = create_engine(database_url)
    try:
        assert "alembic_version" in inspect(engine).get_table_names()
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
            assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "20260720_02"
    finally:
        engine.dispose()
