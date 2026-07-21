"""Alembic helpers used by app startup and CLI."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
HEAD_REVISION = "0001_initial"


def make_alembic_config(database_url: str | None = None) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url or settings.database_url)
    return config


def current_revision(engine: Engine) -> str | None:
    with engine.connect() as connection:
        context = MigrationContext.configure(connection)
        return context.get_current_revision()


def database_has_app_tables(engine: Engine) -> bool:
    tables = set(inspect(engine).get_table_names())
    return "users" in tables and "buildings" in tables


def _run_with_connection(engine: Engine, callback) -> None:
    config = make_alembic_config(str(engine.url))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        callback(config)


def stamp_head(engine: Engine) -> None:
    _run_with_connection(engine, lambda config: command.stamp(config, HEAD_REVISION))


def upgrade_head(engine: Engine) -> None:
    _run_with_connection(engine, lambda config: command.upgrade(config, "head"))


def ensure_schema(engine: Engine, database_url: str | None = None) -> None:
    """Bring a real database up to the latest migration.

    - Empty DB → run migrations from base.
    - Legacy DB with tables but no alembic_version → column bridge + stamp head.
    - Already migrated → upgrade to head (no-op when current).
    """
    _ = database_url  # kept for call-site compatibility; engine URL is authoritative
    revision = current_revision(engine)

    if revision is None and database_has_app_tables(engine):
        _apply_legacy_column_bridge(engine)
        stamp_head(engine)
        return

    upgrade_head(engine)


def _apply_legacy_column_bridge(engine: Engine) -> None:
    """One-time ALTER bridge for DBs created before Alembic existed."""
    if engine.dialect.name != "sqlite":
        return

    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    if "users" in table_names:
        existing = {column["name"] for column in inspector.get_columns("users")}
        with engine.begin() as connection:
            if "avatar_text" not in existing:
                connection.execute(text("ALTER TABLE users ADD COLUMN avatar_text VARCHAR(4)"))
            if "avatar_color" not in existing:
                connection.execute(text("ALTER TABLE users ADD COLUMN avatar_color VARCHAR(16)"))

    if "messages" in table_names:
        existing = {column["name"] for column in inspector.get_columns("messages")}
        message_columns = {
            "room_name": "VARCHAR(64)",
            "latitude": "FLOAT",
            "longitude": "FLOAT",
            "location_source": "VARCHAR(32)",
            "distance_to_building_meters": "FLOAT",
        }
        with engine.begin() as connection:
            for column_name, column_type in message_columns.items():
                if column_name not in existing:
                    connection.execute(
                        text(f"ALTER TABLE messages ADD COLUMN {column_name} {column_type}")
                    )
