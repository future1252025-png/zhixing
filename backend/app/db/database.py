from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy import event
from sqlalchemy import inspect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def create_sqlite_engine(database_url: str = settings.database_url) -> Engine:
    sqlite_engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
    )
    if database_url.startswith("sqlite:///"):
        configure_sqlite_pragmas(sqlite_engine)
    return sqlite_engine


def configure_sqlite_pragmas(sqlite_engine: Engine) -> None:
    @event.listens_for(sqlite_engine, "connect")
    def set_sqlite_pragmas(dbapi_connection, connection_record) -> None:
        _ = connection_record
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


engine = create_sqlite_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db(bind: Engine | None = None) -> None:
    from app import models  # noqa: F401

    target_engine = bind or engine
    Base.metadata.create_all(bind=target_engine)


_BASELINE_COLUMNS = {
    "users": {
        "id", "student_id", "username", "password_hash", "nickname", "avatar_text",
        "avatar_color", "role", "created_at",
    },
    "buildings": {
        "id", "name", "type", "description", "latitude", "longitude", "map_x",
        "map_y", "walk_hint", "created_at",
    },
    "courses": {
        "id", "user_id", "course_name", "weekday", "start_time", "end_time",
        "building_id", "room_name", "teacher", "weeks", "created_at",
    },
    "messages": {
        "id", "building_id", "user_id", "content", "display_name", "room_name",
        "latitude", "longitude", "location_source", "distance_to_building_meters",
        "status", "created_at",
    },
    "location_presets": {
        "id", "name", "building_id", "latitude", "longitude", "description",
    },
}


def _validate_unversioned_baseline(bind: Engine) -> bool:
    inspector = inspect(bind)
    table_names = set(inspector.get_table_names())
    baseline_tables = set(_BASELINE_COLUMNS)

    if "alembic_version" in table_names:
        return False
    if not table_names:
        return False
    if table_names != baseline_tables:
        raise RuntimeError(
            "检测到未版本化且无法识别的数据库结构。请先备份数据库，再修复为完整旧版结构后重试。"
        )

    incomplete_tables = [
        table_name
        for table_name, required_columns in _BASELINE_COLUMNS.items()
        if not required_columns
        <= {column["name"] for column in inspector.get_columns(table_name)}
    ]
    if incomplete_tables:
        tables = ", ".join(incomplete_tables)
        raise RuntimeError(
            f"检测到不完整的旧版数据库表（{tables}）。请先备份数据库，再修复表结构后重试。"
        )
    return True


def upgrade_database(database_url: str = settings.database_url) -> None:
    """Upgrade a versioned database, or safely adopt a complete legacy baseline."""
    from alembic import command
    from alembic.config import Config

    inspection_engine = create_sqlite_engine(database_url)
    try:
        is_unversioned_baseline = _validate_unversioned_baseline(inspection_engine)
    finally:
        inspection_engine.dispose()

    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "migrations"))
    config.set_main_option("sqlalchemy.url", database_url)
    if is_unversioned_baseline:
        command.stamp(config, "20260720_00")
    command.upgrade(config, "head")


def get_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
