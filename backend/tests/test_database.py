from datetime import date
from pathlib import Path
from threading import Event, Thread

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
    DEMO_PASSWORD,
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
from app.core.security import hash_password, verify_password


def make_test_database_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


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


def test_sqlite_file_path_skips_memory_and_uri_databases() -> None:
    assert _sqlite_file_path("sqlite:///:memory:") is None
    assert (
        _sqlite_file_path(
            "sqlite:///file:shared-memory?mode=memory&cache=shared&uri=true"
        )
        is None
    )


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


def test_map_points_seed_file_loads_common_campus_points() -> None:
    points = load_map_points_seed()

    assert MAP_POINTS_SEED_FILE.exists()
    assert len(points) >= 60
    assert len({point["name"] for point in points}) == len(points)
    assert len(DEMO_BUILDINGS) == len(points)
    assert "湖北大学武昌校区图书馆" in {point["name"] for point in points}
    assert "湖北大学武昌校区计算机学院" in {point["name"] for point in points}


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


def test_seed_demo_data_preserves_real_demo_account_password_hash(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "real-demo.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    real_hash = hash_password("owner-chosen-password")

    with SessionLocal() as session:
        session.add(
            User(
                student_id="existing-demo",
                username=DEMO_USERNAME,
                password_hash=real_hash,
                nickname="Real demo owner",
            )
        )
        session.commit()
        seed_demo_data(session)
        session.expire_all()
        user = session.scalar(select(User).where(User.username == DEMO_USERNAME))

        assert user is not None
        assert user.password_hash == real_hash
        assert verify_password("owner-chosen-password", user.password_hash)
        assert not verify_password(DEMO_PASSWORD, user.password_hash)


def test_seed_demo_data_repairs_only_known_legacy_placeholder(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "legacy-demo.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with SessionLocal() as session:
        session.add(
            User(
                student_id="legacy-demo",
                username=DEMO_USERNAME,
                password_hash="demo-password-hash-placeholder",
                nickname="Legacy demo",
            )
        )
        session.commit()
        seed_demo_data(session)
        session.expire_all()
        user = session.scalar(select(User).where(User.username == DEMO_USERNAME))

        assert user is not None
        assert verify_password(DEMO_PASSWORD, user.password_hash)


def test_seed_demo_data_preserves_unknown_invalid_demo_hash(tmp_path: Path) -> None:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "unknown-demo.db"))
    init_db(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    unknown_value = "unknown-invalid-password-value"

    with SessionLocal() as session:
        session.add(
            User(
                student_id="unknown-demo",
                username=DEMO_USERNAME,
                password_hash=unknown_value,
                nickname="Unknown demo",
            )
        )
        session.commit()
        seed_demo_data(session)
        session.expire_all()
        user = session.scalar(select(User).where(User.username == DEMO_USERNAME))

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

        seed_demo_data(session)
        session.expire_all()
        user = session.scalar(select(User).where(User.username == DEMO_USERNAME))
        assert user is not None
        assert user.password_hash == first_hash


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
            username="core-relations",
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
            username="semester-cascade",
            password_hash="hash",
            nickname="Semester cascade",
        )
        course_user = User(
            student_id="20240004",
            username="course-cascade",
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
