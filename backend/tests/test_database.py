from datetime import date
import errno
import json
import os
from pathlib import Path
from threading import Event, Thread
from urllib.parse import quote

import pytest
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.db.database import (
    _migration_file_lock,
    _sqlite_file_path,
    create_sqlite_engine,
    init_db,
)
from app.db.seed import (
    DEMO_BUILDINGS,
    DEMO_COURSES,
    DEMO_MESSAGES,
    DEMO_PASSWORD,
    DEMO_STUDENT_ID,
    DEMO_USERNAME,
    MAP_POINTS_SEED_FILE,
    initialize_database,
    load_map_points_seed,
    seed_demo_data,
)
from app.models import (
    Building,
    Course,
    CourseImportSource,
    LocationPreset,
    Message,
    SemesterSetting,
    User,
)
from app.core.config import Settings
from app.core.security import hash_password, verify_password
import app.db.database as database_module


def make_test_database_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def make_test_database_uri_url(path: Path) -> str:
    encoded_path = quote(path.as_posix(), safe="/:")
    uri_path = f"/{encoded_path}" if path.drive else encoded_path
    return f"sqlite:///file:{uri_path}?mode=rwc&uri=true"


def test_database_tables_can_be_created(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "schema.db"))

    init_db(engine)

    table_names = set(inspect(engine).get_table_names())
    assert {
        "users",
        "buildings",
        "courses",
        "messages",
        "location_presets",
        "semester_settings",
        "course_import_sources",
    }.issubset(table_names)

    course_columns = {
        column["name"] for column in inspect(engine).get_columns("courses")
    }
    semester_indexes = inspect(engine).get_indexes("semester_settings")
    assert "source_kind" in course_columns
    assert any(
        index["unique"] and index["column_names"] == ["user_id"]
        for index in semester_indexes
    )
    required_source_fields = {"filename", "file_sha256", "source_row"}
    assert all(
        not CourseImportSource.__table__.columns[field].nullable
        for field in required_source_fields
    )
    source_columns = {
        column["name"]: column
        for column in inspect(engine).get_columns("course_import_sources")
    }
    assert all(not source_columns[field]["nullable"] for field in required_source_fields)
    assert SemesterSetting.__table__.columns["total_weeks"].server_default is not None
    assert (
        str(SemesterSetting.__table__.columns["total_weeks"].server_default.arg)
        == "20"
    )


def test_sqlite_file_engine_uses_wal_and_busy_timeout(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "wal.db"))

    with engine.connect() as connection:
        journal_mode = connection.exec_driver_sql("PRAGMA journal_mode").scalar()
        busy_timeout = connection.exec_driver_sql("PRAGMA busy_timeout").scalar()

    assert str(journal_mode).lower() == "wal"
    assert int(busy_timeout) >= 5000


def test_sqlite_file_path_skips_only_memory_databases(tmp_path: Path) -> None:
    assert _sqlite_file_path("sqlite:///:memory:") is None
    assert (
        _sqlite_file_path(
            "sqlite:///file:shared-memory?mode=memory&cache=shared&uri=true"
        )
        is None
    )
    assert _sqlite_file_path("sqlite:///file::memory:?cache=shared&uri=true") is None
    database_path = tmp_path / "uri" / "nested" / "database.db"
    assert _sqlite_file_path(make_test_database_uri_url(database_path)) == (
        database_path.resolve()
    )


def test_sqlite_file_path_canonicalizes_aliases_and_symlinks(
    tmp_path: Path,
    monkeypatch,
) -> None:
    real_directory = tmp_path / "real"
    real_directory.mkdir()
    real_path = real_directory / "database.db"
    alias_path = real_directory / "child" / ".." / "database.db"

    assert _sqlite_file_path(make_test_database_uri_url(alias_path)) == real_path.resolve()
    assert _sqlite_file_path(make_test_database_url(real_path)) == real_path.resolve()

    monkeypatch.chdir(tmp_path)
    assert _sqlite_file_path("sqlite:///real/database.db") == real_path.resolve()

    symlink = tmp_path / "linked"
    try:
        symlink.symlink_to(real_directory, target_is_directory=True)
    except OSError:
        pytest.skip("directory symlinks are unavailable on this platform")
    assert _sqlite_file_path(make_test_database_uri_url(symlink / "database.db")) == (
        real_path.resolve()
    )


def test_plain_sqlite_percent_path_is_literal_while_file_uri_decodes_once(
    tmp_path: Path,
) -> None:
    literal_path = tmp_path / "parent%20literal" / "100%file%20.db"
    decoded_path = tmp_path / "parent literal" / "100%file .db"
    plain_url = make_test_database_url(literal_path)
    encoded_file_uri = make_test_database_uri_url(literal_path)
    decoded_file_uri = make_test_database_uri_url(decoded_path)

    plain_canonical = _sqlite_file_path(plain_url)
    literal_uri_canonical = _sqlite_file_path(encoded_file_uri)
    decoded_uri_canonical = _sqlite_file_path(decoded_file_uri)

    assert plain_canonical == literal_path.resolve()
    assert literal_uri_canonical == literal_path.resolve()
    assert decoded_uri_canonical == decoded_path.resolve()
    assert database_module._migration_lock_path(plain_canonical) == (
        database_module._migration_lock_path(literal_uri_canonical)
    )
    assert database_module._migration_lock_path(plain_canonical) != (
        database_module._migration_lock_path(decoded_uri_canonical)
    )

    initialize_database(plain_url)
    initialize_database(encoded_file_uri)

    assert literal_path.exists()
    assert not decoded_path.exists()
    assert literal_path.parent.exists()
    assert not decoded_path.parent.exists()


def test_migration_file_lock_is_released_when_upgrade_raises(tmp_path: Path) -> None:
    database_path = tmp_path / "exception" / "database.db"

    with pytest.raises(RuntimeError, match="simulated migration failure"):
        with _migration_file_lock(database_path, timeout_seconds=0.2):
            raise RuntimeError("simulated migration failure")

    with _migration_file_lock(database_path, timeout_seconds=0.2):
        pass


def test_migration_file_lock_has_an_explicit_timeout(tmp_path: Path) -> None:
    database_path = tmp_path / "timeout" / "database.db"
    acquired = Event()
    release = Event()

    def hold_lock() -> None:
        with _migration_file_lock(database_path, timeout_seconds=1):
            acquired.set()
            assert release.wait(timeout=2)

    holder = Thread(target=hold_lock)
    holder.start()
    assert acquired.wait(timeout=1)
    try:
        with pytest.raises(TimeoutError, match="migration lock"):
            with _migration_file_lock(database_path, timeout_seconds=0.05):
                pass
    finally:
        release.set()
        holder.join(timeout=2)
    assert not holder.is_alive()


def test_migration_lock_uses_dedicated_noncolliding_sidecar(tmp_path: Path) -> None:
    database_path = tmp_path / "database.db"
    legacy_collision = tmp_path / "database.db.migration.lock"
    legacy_collision.write_bytes(b"legitimate application data")
    lock_path = database_module._migration_lock_path(database_path)

    with _migration_file_lock(database_path, timeout_seconds=0.2):
        assert lock_path.exists()

    assert legacy_collision.read_bytes() == b"legitimate application data"
    assert lock_path != legacy_collision
    assert lock_path.name.startswith(".campusmind-migration-")


def test_migration_lock_rejects_precreated_directory_without_waiting(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "database.db"
    lock_path = database_module._migration_lock_path(database_path)
    lock_path.mkdir()

    with pytest.raises(OSError) as caught:
        with _migration_file_lock(database_path, timeout_seconds=30):
            pass

    assert not isinstance(caught.value, TimeoutError)


def test_migration_lock_rejects_symlink_without_modifying_target(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "database.db"
    lock_path = database_module._migration_lock_path(database_path)
    protected_target = tmp_path / "protected.txt"
    protected_target.write_bytes(b"protected-content")
    try:
        lock_path.symlink_to(protected_target)
    except OSError:
        pytest.skip("file symlinks are unavailable on this platform")

    with pytest.raises(OSError):
        with _migration_file_lock(database_path, timeout_seconds=0.2):
            pass

    assert protected_target.read_bytes() == b"protected-content"


@pytest.mark.skipif(os.name != "nt", reason="Windows reparse-point guard")
def test_migration_lock_rejects_windows_reparse_point_before_open(
    tmp_path: Path,
    monkeypatch,
) -> None:
    database_path = tmp_path / "database.db"
    lock_path = database_module._migration_lock_path(database_path)
    original_lstat = os.lstat
    lock_opened = False

    class ReparsePoint:
        st_mode = 0o100600
        st_file_attributes = 0x400

    def fake_lstat(path):
        if Path(path) == lock_path:
            return ReparsePoint()
        return original_lstat(path)

    def fail_if_opened(*_args, **_kwargs):
        nonlocal lock_opened
        lock_opened = True
        raise AssertionError("reparse-point sidecar must not be opened")

    monkeypatch.setattr(database_module.os, "lstat", fake_lstat)
    monkeypatch.setattr(database_module.os, "open", fail_if_opened)

    with pytest.raises(OSError) as caught:
        with _migration_file_lock(database_path, timeout_seconds=0.2):
            pass

    assert caught.value.errno == errno.ELOOP
    assert lock_opened is False


def test_migration_lock_does_not_turn_permanent_os_error_into_timeout(
    tmp_path: Path,
    monkeypatch,
) -> None:
    database_path = tmp_path / "database.db"

    def fail_permanently(*_args) -> None:
        raise OSError(errno.EBADF, "simulated permanent lock failure")

    if os.name == "nt":
        import msvcrt

        monkeypatch.setattr(msvcrt, "locking", fail_permanently)
    else:
        import fcntl

        monkeypatch.setattr(fcntl, "flock", fail_permanently)

    with pytest.raises(OSError) as caught:
        with _migration_file_lock(database_path, timeout_seconds=0.05):
            pass

    assert caught.value.errno == errno.EBADF


def test_map_points_seed_file_loads_common_campus_points() -> None:
    points = load_map_points_seed()
    raw_points = json.loads(MAP_POINTS_SEED_FILE.read_text(encoding="utf-8"))

    assert MAP_POINTS_SEED_FILE.exists()
    assert len(points) >= 60
    assert len({point["name"] for point in points}) == len(points)
    assert len(DEMO_BUILDINGS) == len(points)
    assert "湖北大学武昌校区图书馆" in {point["name"] for point in points}
    assert "湖北大学武昌校区计算机学院" in {point["name"] for point in points}
    assert all(point["description"] == point["name"] for point in raw_points)
    assert all(point["walk_hint"] is None for point in raw_points)
    assert all(point["walk_hint"] is None for point in points)


def test_seed_demo_data_writes_core_records(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "seed.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with SessionLocal() as session:
        counts = seed_demo_data(session)

        assert counts["users"] >= 1
        assert counts["buildings"] >= len(DEMO_BUILDINGS)
        assert counts["courses"] >= 3
        assert counts["messages"] >= 4
        assert counts["location_presets"] >= 4
        assert (
            session.scalar(
                select(Building).where(Building.name == "湖北大学武昌校区图书馆")
            )
            is not None
        )


def test_seed_demo_data_is_idempotent(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "idempotent.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with SessionLocal() as session:
        first_counts = seed_demo_data(session)
        second_counts = seed_demo_data(session)

        assert second_counts == first_counts


def test_current_schema_rejects_a_second_account_identity(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "identity-check.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with SessionLocal() as session:
        session.add(
            User(
                student_id="20240001",
                username="different-login",
                password_hash="hash",
                nickname="Invalid identity",
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        assert session.scalar(select(User.id)) is None

    engine.dispose()


def test_seed_demo_data_preserves_real_demo_account_password_hash(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "real-demo.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    real_hash = hash_password("owner-chosen-password")

    with SessionLocal() as session:
        user = User(
            student_id=DEMO_STUDENT_ID,
            username=DEMO_USERNAME,
            password_hash=real_hash,
            nickname="Real demo owner",
        )
        building = Building(
            name="Real demo private building",
            type="private",
            description="must remain untouched",
            latitude=1,
            longitude=2,
            map_x=3,
            map_y=4,
        )
        session.add_all([user, building])
        session.flush()
        private_course = Course(
            user_id=user.id,
            building_id=building.id,
            course_name="数据库原理",
            weekday=1,
            start_time="10:10",
            end_time="12:34",
            room_name="private-room",
            teacher="private-teacher",
            weeks="2-3",
        )
        private_message = Message(
            building_id=building.id,
            user_id=user.id,
            content="private message",
            display_name="private owner",
        )
        session.add_all([private_course, private_message])
        session.commit()
        private_course_id = private_course.id
        private_message_id = private_message.id
        seed_demo_data(session)
        session.expire_all()
        user = session.scalar(select(User).where(User.student_id == DEMO_STUDENT_ID))

        assert user is not None
        assert user.password_hash == real_hash
        assert verify_password("owner-chosen-password", user.password_hash)
        assert not verify_password(DEMO_PASSWORD, user.password_hash)
        user_courses = session.scalars(
            select(Course).where(Course.user_id == user.id)
        ).all()
        user_messages = session.scalars(
            select(Message).where(Message.user_id == user.id)
        ).all()
        assert [course.id for course in user_courses] == [private_course_id]
        assert [message.id for message in user_messages] == [private_message_id]
        assert user_courses[0].end_time == "12:34"
        assert user_courses[0].room_name == "private-room"
        assert user_courses[0].teacher == "private-teacher"
        assert user_courses[0].weeks == "2-3"


def test_seed_demo_data_repairs_only_known_legacy_placeholder(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "legacy-demo.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with SessionLocal() as session:
        session.add(
            User(
                student_id=DEMO_STUDENT_ID,
                username=DEMO_USERNAME,
                password_hash="demo-password-hash-placeholder",
                nickname="Legacy demo",
            )
        )
        session.commit()
        seed_demo_data(session)
        session.expire_all()
        user = session.scalar(select(User).where(User.student_id == DEMO_STUDENT_ID))

        assert user is not None
        assert verify_password(DEMO_PASSWORD, user.password_hash)
        assert len(
            session.scalars(select(Course).where(Course.user_id == user.id)).all()
        ) == len(DEMO_COURSES)
        assert len(
            session.scalars(select(Message).where(Message.user_id == user.id)).all()
        ) == len(DEMO_MESSAGES)


def test_seed_demo_data_reuses_mirrored_demo_identity_without_duplicate(
    tmp_path: Path,
) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "old-demo.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with SessionLocal() as session:
        session.add(
            User(
                student_id=DEMO_STUDENT_ID,
                username=DEMO_STUDENT_ID,
                password_hash="demo-password-hash-placeholder",
                nickname="Legacy demo",
            )
        )
        session.commit()

        seed_demo_data(session)
        session.expire_all()
        users = session.scalars(select(User)).all()

        assert len(users) == 1
        assert users[0].student_id == DEMO_STUDENT_ID
        assert users[0].username == DEMO_USERNAME == DEMO_STUDENT_ID
        assert verify_password(DEMO_PASSWORD, users[0].password_hash)


def test_seed_demo_data_preserves_real_user_with_demo_student_id(
    tmp_path: Path,
) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "real-student.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    real_hash = hash_password("owner-chosen-password")

    with SessionLocal() as session:
        session.add(
            User(
                student_id=DEMO_STUDENT_ID,
                username=DEMO_STUDENT_ID,
                password_hash=real_hash,
                nickname="Real student",
            )
        )
        session.commit()

        seed_demo_data(session)
        session.expire_all()
        user = session.scalar(
            select(User).where(User.student_id == DEMO_STUDENT_ID)
        )

        assert user is not None
        assert user.username == DEMO_STUDENT_ID
        assert user.password_hash == real_hash
        assert verify_password("owner-chosen-password", user.password_hash)
        assert not verify_password(DEMO_PASSWORD, user.password_hash)
        assert session.scalars(
            select(Course).where(Course.user_id == user.id)
        ).all() == []
        assert session.scalars(
            select(Message).where(Message.user_id == user.id)
        ).all() == []


def test_seed_demo_data_preserves_unknown_invalid_demo_hash(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "unknown-demo.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    unknown_value = "unknown-invalid-password-value"

    with SessionLocal() as session:
        session.add(
            User(
                student_id=DEMO_STUDENT_ID,
                username=DEMO_USERNAME,
                password_hash=unknown_value,
                nickname="Unknown demo",
            )
        )
        session.commit()
        seed_demo_data(session)
        session.expire_all()
        user = session.scalar(select(User).where(User.student_id == DEMO_STUDENT_ID))

        assert user is not None
        assert user.password_hash == unknown_value


def test_new_demo_user_password_and_repeated_seed_are_stable(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "new-demo.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with SessionLocal() as session:
        seed_demo_data(session)
        user = session.scalar(select(User).where(User.username == DEMO_USERNAME))
        assert user is not None
        first_hash = user.password_hash
        assert verify_password(DEMO_PASSWORD, first_hash)
        assert len(
            session.scalars(select(Course).where(Course.user_id == user.id)).all()
        ) == len(DEMO_COURSES)
        assert len(
            session.scalars(select(Message).where(Message.user_id == user.id)).all()
        ) == len(DEMO_MESSAGES)

        seed_demo_data(session)
        session.expire_all()
        user = session.scalar(select(User).where(User.username == DEMO_USERNAME))
        assert user is not None
        assert user.password_hash == first_hash


def test_seed_demo_data_refuses_to_run_in_production(
    tmp_path: Path,
    monkeypatch,
) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "prod-guard.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.delenv("SEED_ALLOW_DEMO", raising=False)
    monkeypatch.setattr("app.db.seed.settings", Settings(app_env="production"))

    with SessionLocal() as session:
        with pytest.raises(RuntimeError, match="SEED_ALLOW_DEMO"):
            seed_demo_data(session)
        assert (
            session.scalar(select(User).where(User.username == DEMO_USERNAME))
            is None
        )


def test_seed_demo_data_runs_in_production_with_explicit_override(
    tmp_path: Path,
    monkeypatch,
) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "prod-override.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setenv("SEED_ALLOW_DEMO", "1")
    monkeypatch.setattr("app.db.seed.settings", Settings(app_env="production"))

    with SessionLocal() as session:
        counts = seed_demo_data(session)

        assert counts["users"] >= 1
        assert (
            session.scalar(select(User).where(User.username == DEMO_USERNAME))
            is not None
        )


def test_initialize_database_creates_sqlite_file(tmp_path: Path) -> None:
    database_path = tmp_path / "campusmind.db"

    counts = initialize_database(make_test_database_url(database_path))

    assert database_path.exists()
    assert counts["buildings"] >= len(DEMO_BUILDINGS)
    assert counts["location_presets"] >= 4


def test_initialize_database_creates_custom_sqlite_parent_directories(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "custom" / "nested" / "campusmind.db"

    initialize_database(make_test_database_url(database_path))

    assert database_path.exists()


def test_initialize_database_creates_file_backed_sqlite_uri_parent_directories(
    tmp_path: Path,
) -> None:
    database_path = (
        tmp_path
        / "custom-uri%20literal"
        / "nested%parent"
        / "100%campusmind.db"
    )

    initialize_database(make_test_database_uri_url(database_path))

    assert database_path.exists()
    assert not (tmp_path / "custom-uri literal").exists()


def test_initialize_custom_database_never_touches_default_database_parent(
    tmp_path: Path,
    monkeypatch,
) -> None:
    blocking_file = tmp_path / "default-parent-is-a-file"
    blocking_file.write_text("do not touch", encoding="utf-8")
    monkeypatch.setattr(
        "app.db.seed.DEFAULT_DATABASE_PATH",
        blocking_file / "nested" / "default.db",
        raising=False,
    )
    custom_path = tmp_path / "custom-only" / "database.db"

    initialize_database(make_test_database_url(custom_path))

    assert custom_path.exists()
    assert blocking_file.is_file()


def test_model_relationships_are_available(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "relations.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with SessionLocal() as session:
        seed_demo_data(session)
        message = session.scalars(select(Message)).first()
        course = session.scalars(select(Course)).first()
        preset = session.scalars(select(LocationPreset)).first()
        user = session.scalars(select(User)).first()

        assert message is not None
        assert message.building is not None
        assert message.user is not None
        assert course is not None
        assert course.building is not None
        assert preset is not None
        assert preset.building is not None
        assert user is not None
        assert len(user.courses) >= 1


def test_core_journey_one_to_one_relationships_persist_and_delete_orphans(
    tmp_path: Path,
) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "core-relations.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with SessionLocal() as session:
        user = User(
            student_id="20240002",
            username="20240002",
            password_hash="hash",
            nickname="Core relations",
        )
        building = Building(
            name="Core relation building",
            type="teaching",
            description="test",
            latitude=0,
            longitude=0,
            map_x=0,
            map_y=0,
        )
        session.add_all([user, building])
        session.flush()
        course = Course(
            user_id=user.id,
            building_id=building.id,
            course_name="Core relation course",
            weekday=1,
            start_time="08:00",
            end_time="09:40",
            room_name="101",
        )
        semester_setting = SemesterSetting(user=user, start_date=date(2026, 9, 1))
        import_source = CourseImportSource(
            course=course,
            filename="courses.xlsx",
            file_sha256="a" * 64,
            source_row="2",
            raw_course_name="Core relation course",
            raw_weekday="Monday",
            raw_time_or_section="08:00-09:40",
            raw_teacher="Teacher",
            raw_weeks="1-20",
            raw_location="101",
        )
        session.add_all([course, semester_setting, import_source])
        session.commit()
        user_id = user.id
        course_id = course.id
        session.expunge_all()

        persisted_user = session.get(User, user_id)
        persisted_course = session.get(Course, course_id)
        assert persisted_user is not None
        assert persisted_course is not None
        assert persisted_user.semester_setting is not None
        assert persisted_user.semester_setting.user is persisted_user
        assert persisted_course.import_source is not None
        assert persisted_course.import_source.course is persisted_course

        session.add(SemesterSetting(user_id=user_id, start_date=date(2027, 2, 1)))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        session.add(
            CourseImportSource(
                course_id=course_id,
                filename="duplicate.xlsx",
                file_sha256="b" * 64,
                source_row="3",
                raw_course_name="Duplicate",
                raw_weekday="Tuesday",
                raw_time_or_section="10:00-11:40",
                raw_teacher="Teacher",
                raw_weeks="1-20",
                raw_location="102",
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        persisted_user.semester_setting = None
        persisted_course.import_source = None
        session.flush()
        assert session.scalar(
            select(SemesterSetting).where(SemesterSetting.user_id == user_id)
        ) is None
        assert session.scalar(
            select(CourseImportSource).where(CourseImportSource.course_id == course_id)
        ) is None


def test_database_cascades_delete_unloaded_core_journey_children(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "database-cascade.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with SessionLocal() as session:
        semester_user = User(
            student_id="20240003",
            username="20240003",
            password_hash="hash",
            nickname="Semester cascade",
        )
        course_user = User(
            student_id="20240004",
            username="20240004",
            password_hash="hash",
            nickname="Course cascade",
        )
        building = Building(
            name="Cascade building",
            type="teaching",
            description="test",
            latitude=0,
            longitude=0,
            map_x=0,
            map_y=0,
        )
        session.add_all([semester_user, course_user, building])
        session.flush()
        semester_setting = SemesterSetting(
            user=semester_user,
            start_date=date(2026, 9, 1),
        )
        course = Course(
            user_id=course_user.id,
            building_id=building.id,
            course_name="Cascade course",
            weekday=1,
            start_time="08:00",
            end_time="09:40",
            room_name="101",
        )
        import_source = CourseImportSource(
            course=course,
            filename="cascade.xlsx",
            file_sha256="c" * 64,
            source_row="2",
            raw_course_name="Cascade course",
            raw_weekday="Monday",
            raw_time_or_section="08:00-09:40",
            raw_teacher="Teacher",
            raw_weeks="1-20",
            raw_location="101",
        )
        session.add_all([semester_setting, course, import_source])
        session.commit()
        semester_user_id = semester_user.id
        semester_setting_id = semester_setting.id
        course_id = course.id
        import_source_id = import_source.id
        session.expunge_all()

    with SessionLocal() as session:
        assert session.connection().exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
        semester_user = session.get(User, semester_user_id)
        course = session.get(Course, course_id)
        assert semester_user is not None
        assert course is not None
        assert "semester_setting" in inspect(semester_user).unloaded
        assert "import_source" in inspect(course).unloaded
        session.delete(semester_user)
        session.delete(course)
        session.commit()

    with SessionLocal() as session:
        assert session.get(SemesterSetting, semester_setting_id) is None
        assert session.get(CourseImportSource, import_source_id) is None
