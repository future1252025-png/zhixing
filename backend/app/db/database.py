from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def create_sqlite_engine(database_url: str = settings.database_url) -> Engine:
    sqlite_engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
    )
    if database_url.startswith("sqlite"):
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
    """Initialize schema.

    - With an explicit bind (tests): create tables from models (fast, isolated).
    - Default engine (app runtime): Alembic migrations to head.
    """
    from app import models  # noqa: F401

    if bind is not None:
        Base.metadata.create_all(bind=bind)
        return

    from app.db.migrate import ensure_schema

    ensure_schema(engine)


def get_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
