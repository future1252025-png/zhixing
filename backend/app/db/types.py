"""Shared SQLAlchemy column types."""

from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator


class TZDateTime(TypeDecorator):
    """UTC datetime column that survives SQLite's tzinfo-less storage.

    SQLite drops tzinfo when storing DATETIME values, so aware UTC values are
    written unchanged but read back naive. This decorator normalizes inbound
    values to UTC before writing and re-attaches ``timezone.utc`` when reading,
    so the ORM always sees aware UTC datetimes. The underlying storage format
    is unchanged, therefore no data migration is required.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(
        self,
        value: datetime | None,
        dialect: Dialect,
    ) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def process_result_value(
        self,
        value: datetime | None,
        dialect: Dialect,
    ) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
