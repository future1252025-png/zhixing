from collections.abc import Generator
from contextlib import contextmanager, nullcontext
from dataclasses import dataclass
import errno
import hashlib
import os
from pathlib import Path
import stat
import time
from types import MappingProxyType
from urllib.parse import unquote, urlsplit

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.engine.url import make_url
from sqlalchemy import inspect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


MIGRATION_LOCK_TIMEOUT_SECONDS = 30.0
MIGRATION_LOCK_POLL_SECONDS = 0.05
_RETRYABLE_LOCK_ERRNOS = frozenset(
    {
        errno.EACCES,
        errno.EAGAIN,
        errno.EDEADLK,
        getattr(errno, "EWOULDBLOCK", errno.EAGAIN),
    }
)
_RETRYABLE_WINDOWS_LOCK_ERRORS = frozenset({32, 33, 36})


class Base(DeclarativeBase):
    pass


def _resolve_directory_aliases(directory: Path) -> Path:
    if directory.exists():
        return directory.resolve(strict=True)
    if directory.parent == directory:
        return directory
    return _resolve_directory_aliases(directory.parent) / directory.name


def _canonicalize_sqlite_path(raw_path: str) -> Path:
    decoded_path = unquote(raw_path)
    if (
        os.name == "nt"
        and len(decoded_path) >= 3
        and decoded_path[0] == "/"
        and decoded_path[2] == ":"
    ):
        decoded_path = decoded_path[1:]
    path = Path(decoded_path).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    path = Path(os.path.abspath(path))
    canonical_path = _resolve_directory_aliases(path.parent) / path.name
    try:
        final_component = os.lstat(canonical_path)
    except FileNotFoundError:
        return canonical_path
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    if stat.S_ISLNK(final_component.st_mode) or bool(
        getattr(final_component, "st_file_attributes", 0) & reparse_flag
    ):
        return canonical_path.resolve(strict=False)
    # Resolving a newly-created regular file on Windows can change its rendered
    # path and therefore its hash. Resolve parents, but keep the final name stable.
    return canonical_path


def _sqlite_file_path(database_url: str) -> Path | None:
    """Return the canonical path for every file-backed SQLite URL."""
    url = make_url(database_url)
    if not url.drivername.startswith("sqlite"):
        return None
    database = url.database
    uri_enabled = str(url.query.get("uri", "")).lower() in {"1", "true", "yes"}
    if not database or database == ":memory:":
        return None
    if not uri_enabled:
        return _canonicalize_sqlite_path(database)

    mode = str(url.query.get("mode", "")).casefold()
    if mode == "memory" or database.casefold() == "file::memory:":
        return None
    if not database.casefold().startswith("file:"):
        return _canonicalize_sqlite_path(database)

    parsed_uri = urlsplit(database)
    raw_path = parsed_uri.path
    if parsed_uri.netloc and parsed_uri.netloc.casefold() != "localhost":
        raw_path = f"//{parsed_uri.netloc}{raw_path}"
    return _canonicalize_sqlite_path(raw_path)


def _ensure_sqlite_parent(database_url: str) -> Path | None:
    database_path = _sqlite_file_path(database_url)
    if database_path is not None:
        database_path.parent.mkdir(parents=True, exist_ok=True)
    return database_path


def _migration_lock_path(database_path: Path) -> Path:
    canonical_path = _canonicalize_sqlite_path(str(database_path))
    identity = os.path.normcase(str(canonical_path))
    digest = hashlib.sha256(os.fsencode(identity)).hexdigest()
    return canonical_path.parent / f".campusmind-migration-{digest}.lock"


def _is_reparse_point(file_stat: os.stat_result) -> bool:
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    return bool(getattr(file_stat, "st_file_attributes", 0) & reparse_flag)


def _securely_open_migration_lock(lock_path: Path):
    """Open a regular, owned sidecar without ever following a pre-set link."""
    try:
        before_open = os.lstat(lock_path)
    except FileNotFoundError:
        before_open = None
    if before_open is not None and (
        stat.S_ISLNK(before_open.st_mode) or _is_reparse_point(before_open)
    ):
        raise OSError(errno.ELOOP, "Migration lock path may not be a link", lock_path)

    flags = os.O_CREAT | os.O_RDWR | getattr(os, "O_BINARY", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    file_descriptor = os.open(lock_path, flags, 0o600)
    try:
        opened = os.fstat(file_descriptor)
        if not stat.S_ISREG(opened.st_mode):
            raise OSError(
                errno.EINVAL,
                "Migration lock path is not a regular file",
                lock_path,
            )
        if os.name != "nt" and hasattr(os, "geteuid") and opened.st_uid != os.geteuid():
            raise PermissionError(
                errno.EACCES,
                "Migration lock file is not owned by the current user",
                lock_path,
            )

        after_open = os.lstat(lock_path)
        if stat.S_ISLNK(after_open.st_mode) or _is_reparse_point(after_open):
            raise OSError(errno.ELOOP, "Migration lock path became a link", lock_path)
        if (after_open.st_dev, after_open.st_ino) != (opened.st_dev, opened.st_ino):
            raise OSError(
                errno.EAGAIN,
                "Migration lock path changed while it was being opened",
                lock_path,
            )
        return os.fdopen(file_descriptor, "r+b", buffering=0)
    except BaseException:
        os.close(file_descriptor)
        raise


def _is_retryable_lock_error(error: OSError) -> bool:
    return error.errno in _RETRYABLE_LOCK_ERRNOS or getattr(
        error,
        "winerror",
        None,
    ) in _RETRYABLE_WINDOWS_LOCK_ERRORS


@contextmanager
def _migration_file_lock(
    database_path: Path,
    timeout_seconds: float = MIGRATION_LOCK_TIMEOUT_SECONDS,
):
    """Serialize Alembic for one SQLite file across both processes and threads."""
    lock_path = _migration_lock_path(database_path)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + timeout_seconds

    with _securely_open_migration_lock(lock_path) as handle:
        handle.seek(0, os.SEEK_END)
        if handle.tell() == 0:
            handle.write(b"\0")
            handle.flush()

        if os.name == "nt":
            import msvcrt

            def try_lock() -> bool:
                handle.seek(0)
                try:
                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                except OSError as error:
                    if not _is_retryable_lock_error(error):
                        raise
                    return False
                return True

            def unlock() -> None:
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            def try_lock() -> bool:
                try:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                except OSError as error:
                    if not _is_retryable_lock_error(error):
                        raise
                    return False
                return True

            def unlock() -> None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

        while not try_lock():
            if time.monotonic() >= deadline:
                raise TimeoutError(
                    f"Timed out after {timeout_seconds:g}s waiting for migration lock: "
                    f"{lock_path}"
                )
            time.sleep(MIGRATION_LOCK_POLL_SECONDS)

        try:
            yield
        finally:
            unlock()


def create_sqlite_engine(database_url: str = settings.database_url) -> Engine:
    _ensure_sqlite_parent(database_url)
    sqlite_engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
    )
    if make_url(database_url).drivername.startswith("sqlite"):
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

    upgrade_database(settings.database_url)


@dataclass(frozen=True)
class _ColumnSignature:
    name: str
    affinity: str
    nullable: bool
    primary_key: bool
    server_default: str | None


@dataclass(frozen=True)
class _ForeignKeySignature:
    constrained_columns: tuple[str, ...]
    referred_table: str
    referred_columns: tuple[str, ...]
    options: tuple[tuple[str, str], ...]


@dataclass(frozen=True)
class _IndexSignature:
    name: str
    columns: tuple[str, ...]
    dialect_options: tuple[tuple[str, str], ...]


@dataclass(frozen=True)
class _CheckConstraintSignature:
    name: str | None
    sqltext: str


@dataclass(frozen=True)
class _TableSignature:
    columns: frozenset[_ColumnSignature]
    foreign_keys: frozenset[_ForeignKeySignature]
    unique_indexes: frozenset[_IndexSignature]
    nonunique_indexes: frozenset[_IndexSignature]
    unique_constraints: frozenset[tuple[str, ...]]
    check_constraints: frozenset[_CheckConstraintSignature]


def _column(
    name: str,
    affinity: str,
    nullable: bool,
    primary_key: bool = False,
    server_default: str | None = None,
) -> _ColumnSignature:
    return _ColumnSignature(name, affinity, nullable, primary_key, server_default)


def _foreign_key(
    constrained_columns: tuple[str, ...],
    referred_table: str,
    referred_columns: tuple[str, ...],
    options: tuple[tuple[str, str], ...] = (),
) -> _ForeignKeySignature:
    return _ForeignKeySignature(
        constrained_columns,
        referred_table,
        referred_columns,
        options,
    )


def _index(name: str, *columns: str) -> _IndexSignature:
    return _IndexSignature(name, columns, ())


def _table_signature(
    columns: tuple[_ColumnSignature, ...],
    *,
    foreign_keys: tuple[_ForeignKeySignature, ...] = (),
    unique_indexes: tuple[_IndexSignature, ...] = (),
    nonunique_indexes: tuple[_IndexSignature, ...] = (),
    unique_constraints: tuple[tuple[str, ...], ...] = (),
    check_constraints: tuple[_CheckConstraintSignature, ...] = (),
) -> _TableSignature:
    return _TableSignature(
        columns=frozenset(columns),
        foreign_keys=frozenset(foreign_keys),
        unique_indexes=frozenset(unique_indexes),
        nonunique_indexes=frozenset(nonunique_indexes),
        unique_constraints=frozenset(unique_constraints),
        check_constraints=frozenset(check_constraints),
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


def _normalize_sqlite_sql(value: object) -> str:
    return " ".join(str(value).strip().split())


def _normalize_reflected_options(options: dict[str, object]) -> tuple[tuple[str, str], ...]:
    return tuple(
        (str(key), _normalize_sqlite_sql(value))
        for key, value in sorted(options.items())
    )


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
            server_default=(
                _normalize_sqlite_sql(column["default"])
                if column.get("default") is not None
                else None
            ),
        )
        for column in inspector.get_columns(table_name)
    )
    foreign_keys = frozenset(
        _ForeignKeySignature(
            constrained_columns=tuple(foreign_key["constrained_columns"]),
            referred_table=foreign_key["referred_table"],
            referred_columns=tuple(foreign_key["referred_columns"]),
            options=_normalize_reflected_options(foreign_key.get("options", {})),
        )
        for foreign_key in inspector.get_foreign_keys(table_name)
    )
    indexes = inspector.get_indexes(table_name)
    unique_indexes = frozenset(
        _IndexSignature(
            index["name"],
            tuple(index["column_names"]),
            _normalize_reflected_options(index.get("dialect_options", {})),
        )
        for index in indexes
        if bool(index["unique"])
    )
    nonunique_indexes = frozenset(
        _IndexSignature(
            index["name"],
            tuple(index["column_names"]),
            _normalize_reflected_options(index.get("dialect_options", {})),
        )
        for index in indexes
        if not bool(index["unique"])
    )
    unique_constraints = frozenset(
        tuple(constraint["column_names"])
        for constraint in inspector.get_unique_constraints(table_name)
        if constraint.get("column_names")
    )
    check_constraints = frozenset(
        _CheckConstraintSignature(
            name=constraint.get("name"),
            sqltext=_normalize_sqlite_sql(constraint["sqltext"]),
        )
        for constraint in inspector.get_check_constraints(table_name)
    )
    return _TableSignature(
        columns=columns,
        foreign_keys=foreign_keys,
        unique_indexes=unique_indexes,
        nonunique_indexes=nonunique_indexes,
        unique_constraints=unique_constraints,
        check_constraints=check_constraints,
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
        if any(
            expected_columns[name].server_default != actual_columns[name].server_default
            for name in common_columns
        ):
            details.append("服务端默认值（server defaults）")
        if expected.foreign_keys != actual.foreign_keys:
            details.append("外键及选项（foreign keys/options）")
        if expected.unique_constraints != actual.unique_constraints:
            details.append("唯一约束（unique constraints）")
        if expected.check_constraints != actual.check_constraints:
            details.append("检查约束（check constraints）")
        if expected.unique_indexes != actual.unique_indexes:
            expected_keys = {
                (index.name, index.columns) for index in expected.unique_indexes
            }
            actual_keys = {
                (index.name, index.columns) for index in actual.unique_indexes
            }
            if expected_keys == actual_keys:
                details.append("索引谓词或方言选项（index predicates/dialect options）")
            else:
                details.append("唯一索引（unique indexes）")
        if expected.nonunique_indexes != actual.nonunique_indexes:
            expected_keys = {
                (index.name, index.columns) for index in expected.nonunique_indexes
            }
            actual_keys = {
                (index.name, index.columns) for index in actual.nonunique_indexes
            }
            if expected_keys == actual_keys:
                details.append("索引谓词或方言选项（index predicates/dialect options）")
            else:
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

    database_path = _ensure_sqlite_parent(database_url)
    lock = _migration_file_lock(database_path) if database_path is not None else nullcontext()
    with lock:
        # Inspection happens under the same cross-process lock as the migration.
        # Every waiter therefore re-reads the state left by the previous upgrader.
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
