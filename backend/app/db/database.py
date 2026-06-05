from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy import inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def create_sqlite_engine(database_url: str = settings.database_url) -> Engine:
    return create_engine(
        database_url,
        connect_args={"check_same_thread": False},
    )


engine = create_sqlite_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db(bind: Engine | None = None) -> None:
    from app import models  # noqa: F401

    target_engine = bind or engine
    Base.metadata.create_all(bind=target_engine)
    ensure_sqlite_schema_compatibility(target_engine)


def ensure_sqlite_schema_compatibility(bind: Engine) -> None:
    if bind.dialect.name != "sqlite":
        return

    inspector = inspect(bind)
    if "messages" not in inspector.get_table_names():
        return

    existing_columns = {
        column["name"]
        for column in inspector.get_columns("messages")
    }
    message_columns = {
        "latitude": "FLOAT",
        "longitude": "FLOAT",
        "location_source": "VARCHAR(32)",
        "distance_to_building_meters": "FLOAT",
    }

    with bind.begin() as connection:
        for column_name, column_type in message_columns.items():
            if column_name not in existing_columns:
                connection.execute(
                    text(f"ALTER TABLE messages ADD COLUMN {column_name} {column_type}")
                )


def get_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
