from collections.abc import Generator
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType

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


@dataclass(frozen=True)
class _ColumnSignature:
    name: str
    affinity: str
    nullable: bool
    primary_key: bool


@dataclass(frozen=True)
class _ForeignKeySignature:
    constrained_columns: tuple[str, ...]
    referred_table: str
    referred_columns: tuple[str, ...]
    ondelete: str | None


@dataclass(frozen=True)
class _IndexSignature:
    name: str
    columns: tuple[str, ...]


@dataclass(frozen=True)
class _TableSignature:
    columns: frozenset[_ColumnSignature]
    foreign_keys: frozenset[_ForeignKeySignature]
    unique_indexes: frozenset[_IndexSignature]
    nonunique_indexes: frozenset[_IndexSignature]
    unique_constraints: frozenset[tuple[str, ...]]


def _column(name: str, affinity: str, nullable: bool, primary_key: bool = False) -> _ColumnSignature:
    return _ColumnSignature(name, affinity, nullable, primary_key)


def _foreign_key(
    constrained_columns: tuple[str, ...],
    referred_table: str,
    referred_columns: tuple[str, ...],
    ondelete: str | None = None,
) -> _ForeignKeySignature:
    return _ForeignKeySignature(
        constrained_columns,
        referred_table,
        referred_columns,
        ondelete,
    )


def _index(name: str, *columns: str) -> _IndexSignature:
    return _IndexSignature(name, columns)


def _table_signature(
    columns: tuple[_ColumnSignature, ...],
    *,
    foreign_keys: tuple[_ForeignKeySignature, ...] = (),
    unique_indexes: tuple[_IndexSignature, ...] = (),
    nonunique_indexes: tuple[_IndexSignature, ...] = (),
    unique_constraints: tuple[tuple[str, ...], ...] = (),
) -> _TableSignature:
    return _TableSignature(
        columns=frozenset(columns),
        foreign_keys=frozenset(foreign_keys),
        unique_indexes=frozenset(unique_indexes),
        nonunique_indexes=frozenset(nonunique_indexes),
        unique_constraints=frozenset(unique_constraints),
    )


# This signature is deliberately frozen to revision 20260720_00. Do not derive it
# from current ORM metadata: only this exact legacy schema may be stamped.
_BASELINE_SCHEMA = MappingProxyType({
    "users": _table_signature(
        (
            _column("id", "INTEGER", False, True),
            _column("student_id", "TEXT", True),
            _column("username", "TEXT", False),
            _column("password_hash", "TEXT", False),
            _column("nickname", "TEXT", False),
            _column("avatar_text", "TEXT", True),
            _column("avatar_color", "TEXT", True),
            _column("role", "TEXT", False),
            _column("created_at", "NUMERIC", False),
        ),
        unique_indexes=(
            _index("ix_users_student_id", "student_id"),
            _index("ix_users_username", "username"),
        ),
        nonunique_indexes=(_index("ix_users_id", "id"),),
    ),
    "buildings": _table_signature(
        (
            _column("id", "INTEGER", False, True),
            _column("name", "TEXT", False),
            _column("type", "TEXT", False),
            _column("description", "TEXT", False),
            _column("latitude", "REAL", False),
            _column("longitude", "REAL", False),
            _column("map_x", "REAL", False),
            _column("map_y", "REAL", False),
            _column("walk_hint", "TEXT", True),
            _column("created_at", "NUMERIC", False),
        ),
        unique_indexes=(_index("ix_buildings_name", "name"),),
        nonunique_indexes=(
            _index("ix_buildings_id", "id"),
            _index("ix_buildings_type", "type"),
        ),
    ),
    "courses": _table_signature(
        (
            _column("id", "INTEGER", False, True),
            _column("user_id", "INTEGER", False),
            _column("course_name", "TEXT", False),
            _column("weekday", "INTEGER", False),
            _column("start_time", "TEXT", False),
            _column("end_time", "TEXT", False),
            _column("building_id", "INTEGER", False),
            _column("room_name", "TEXT", False),
            _column("teacher", "TEXT", True),
            _column("weeks", "TEXT", True),
            _column("created_at", "NUMERIC", False),
        ),
        foreign_keys=(
            _foreign_key(("building_id",), "buildings", ("id",)),
            _foreign_key(("user_id",), "users", ("id",)),
        ),
        nonunique_indexes=(
            _index("ix_courses_building_id", "building_id"),
            _index("ix_courses_course_name", "course_name"),
            _index("ix_courses_id", "id"),
            _index("ix_courses_user_id", "user_id"),
            _index("ix_courses_weekday", "weekday"),
        ),
    ),
    "messages": _table_signature(
        (
            _column("id", "INTEGER", False, True),
            _column("building_id", "INTEGER", False),
            _column("user_id", "INTEGER", False),
            _column("content", "TEXT", False),
            _column("display_name", "TEXT", False),
            _column("room_name", "TEXT", True),
            _column("latitude", "REAL", True),
            _column("longitude", "REAL", True),
            _column("location_source", "TEXT", True),
            _column("distance_to_building_meters", "REAL", True),
            _column("status", "TEXT", False),
            _column("created_at", "NUMERIC", False),
        ),
        foreign_keys=(
            _foreign_key(("building_id",), "buildings", ("id",)),
            _foreign_key(("user_id",), "users", ("id",)),
        ),
        nonunique_indexes=(
            _index("ix_messages_building_id", "building_id"),
            _index("ix_messages_id", "id"),
            _index("ix_messages_room_name", "room_name"),
            _index("ix_messages_status", "status"),
            _index("ix_messages_user_id", "user_id"),
        ),
    ),
    "location_presets": _table_signature(
        (
            _column("id", "INTEGER", False, True),
            _column("name", "TEXT", False),
            _column("building_id", "INTEGER", True),
            _column("latitude", "REAL", False),
            _column("longitude", "REAL", False),
            _column("description", "TEXT", True),
        ),
        foreign_keys=(_foreign_key(("building_id",), "buildings", ("id",)),),
        unique_indexes=(_index("ix_location_presets_name", "name"),),
        nonunique_indexes=(
            _index("ix_location_presets_building_id", "building_id"),
            _index("ix_location_presets_id", "id"),
        ),
    ),
})


def _sqlite_affinity(type_name: str) -> str:
    normalized = type_name.upper()
    if "INT" in normalized:
        return "INTEGER"
    if any(token in normalized for token in ("CHAR", "CLOB", "TEXT")):
        return "TEXT"
    if "BLOB" in normalized or not normalized:
        return "BLOB"
    if any(token in normalized for token in ("REAL", "FLOA", "DOUB")):
        return "REAL"
    return "NUMERIC"


def _actual_table_signature(inspector, table_name: str) -> _TableSignature:
    primary_key_columns = frozenset(
        inspector.get_pk_constraint(table_name).get("constrained_columns") or ()
    )
    columns = frozenset(
        _ColumnSignature(
            name=column["name"],
            affinity=_sqlite_affinity(str(column["type"])),
            nullable=bool(column["nullable"]),
            primary_key=column["name"] in primary_key_columns,
        )
        for column in inspector.get_columns(table_name)
    )
    foreign_keys = frozenset(
        _ForeignKeySignature(
            constrained_columns=tuple(foreign_key["constrained_columns"]),
            referred_table=foreign_key["referred_table"],
            referred_columns=tuple(foreign_key["referred_columns"]),
            ondelete=(foreign_key.get("options", {}).get("ondelete") or None),
        )
        for foreign_key in inspector.get_foreign_keys(table_name)
    )
    indexes = inspector.get_indexes(table_name)
    unique_indexes = frozenset(
        _IndexSignature(index["name"], tuple(index["column_names"]))
        for index in indexes
        if bool(index["unique"])
    )
    nonunique_indexes = frozenset(
        _IndexSignature(index["name"], tuple(index["column_names"]))
        for index in indexes
        if not bool(index["unique"])
    )
    unique_constraints = frozenset(
        tuple(constraint["column_names"])
        for constraint in inspector.get_unique_constraints(table_name)
        if constraint.get("column_names")
    )
    return _TableSignature(
        columns=columns,
        foreign_keys=foreign_keys,
        unique_indexes=unique_indexes,
        nonunique_indexes=nonunique_indexes,
        unique_constraints=unique_constraints,
    )


def _validate_unversioned_baseline(bind: Engine) -> bool:
    inspector = inspect(bind)
    table_names = set(inspector.get_table_names())
    baseline_tables = set(_BASELINE_SCHEMA)

    if "alembic_version" in table_names:
        return False
    if not table_names:
        return False
    if table_names != baseline_tables:
        raise RuntimeError(
            "检测到未版本化且无法识别的数据库结构。请先备份数据库，再修复为完整旧版结构后重试。"
        )

    table_mismatches = []
    for table_name, expected in _BASELINE_SCHEMA.items():
        actual = _actual_table_signature(inspector, table_name)
        expected_columns = {column.name: column for column in expected.columns}
        actual_columns = {column.name: column for column in actual.columns}
        details = []
        missing_columns = sorted(expected_columns.keys() - actual_columns.keys())
        extra_columns = sorted(actual_columns.keys() - expected_columns.keys())
        if missing_columns:
            details.append(f"缺少列（missing columns）：{', '.join(missing_columns)}")
        if extra_columns:
            details.append(f"额外列（extra columns）：{', '.join(extra_columns)}")
        common_columns = expected_columns.keys() & actual_columns.keys()
        if any(
            expected_columns[name].affinity != actual_columns[name].affinity
            for name in common_columns
        ):
            details.append("类型亲和性（type affinity）")
        if any(
            expected_columns[name].nullable != actual_columns[name].nullable
            for name in common_columns
        ):
            details.append("可空性（nullability）")
        if any(
            expected_columns[name].primary_key != actual_columns[name].primary_key
            for name in common_columns
        ):
            details.append("主键（primary key）")
        if expected.foreign_keys != actual.foreign_keys:
            details.append("外键（foreign keys）")
        if expected.unique_constraints != actual.unique_constraints:
            details.append("唯一约束（unique constraints）")
        if expected.unique_indexes != actual.unique_indexes:
            details.append("唯一索引（unique indexes）")
        if expected.nonunique_indexes != actual.nonunique_indexes:
            details.append("普通索引（nonunique indexes）")
        if details:
            table_mismatches.append(f"{table_name}（{'；'.join(details)}）")

    if table_mismatches:
        tables = ", ".join(table_mismatches)
        raise RuntimeError(
            f"检测到不匹配的旧版数据库表结构（{tables}）。请先备份数据库，再修复表结构后重试。"
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
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    if is_unversioned_baseline:
        command.stamp(config, "20260720_00")
    command.upgrade(config, "head")


def get_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
