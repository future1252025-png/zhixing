from collections.abc import Generator
from io import BytesIO
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.db.database import Base, create_sqlite_engine, get_session, init_db
from app.db.seed import seed_demo_data
from app.main import app
from app.models import Building, Course, CourseImportSource, User
from app.api.courses import MAX_IMPORT_FILE_BYTES
from app.services.course_import_service import parse_course_cell


FIXTURES = Path(__file__).with_name("fixtures")


def make_test_database_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def auth_headers(
    client: TestClient,
    *,
    configure_semester: bool = True,
) -> dict[str, str]:
    client.post(
        "/api/auth/register",
        json={
            "username": "importer",
            "password": "secret123",
            "nickname": "Importer",
            "student_id": "importer-2024",
        },
    )
    login = client.post(
        "/api/auth/login",
        json={"username": "importer", "password": "secret123"},
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    if not configure_semester:
        return headers
    semester = client.put(
        "/api/semester",
        json={"start_date": "2026-02-23", "total_weeks": 20},
        headers=headers,
    )
    assert semester.status_code == 200
    return headers


@pytest.fixture
def client_and_session(
    tmp_path: Path,
) -> Generator[tuple[TestClient, sessionmaker], None, None]:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "test_import.db"))
    init_db(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with TestingSessionLocal() as session:
        seed_demo_data(session)
        fixture_buildings = [
            ("3号教学楼", "教学楼", "别名：教3"),
            ("风雨操场", "体育场地", "风雨操场东区和西区"),
        ]
        for offset, (name, kind, description) in enumerate(fixture_buildings):
            if session.query(Building).filter(Building.name == name).first() is None:
                session.add(
                    Building(
                        name=name,
                        type=kind,
                        description=description,
                        latitude=30.58,
                        longitude=114.32,
                        map_x=50 + offset,
                        map_y=50 + offset,
                        walk_hint=None,
                    )
                )
        session.commit()

    def override_get_session() -> Generator[Session, None, None]:
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_session] = override_get_session
    try:
        yield TestClient(app), TestingSessionLocal
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        Path("test_import.db").unlink(missing_ok=True)


def test_parse_course_cell_extracts_multiple_week_patterns() -> None:
    blocks = parse_course_cell(
        """
        机器学习
        吴笛
        9-16(周)[01-02节]
        实训大楼423-425数据中国实验室1
        --------------------
        数据库系统原理
        曾呈
        2,4,6,8,10,12,14,16(周)[05-06节]
        实训大楼413-418数据中国实验室2-3
        """,
        weekday=5,
        fallback_start_time="08:00",
        fallback_end_time="09:40",
    )

    assert len(blocks) == 2
    assert blocks[0].course_name == "机器学习"
    assert blocks[0].teacher == "吴笛"
    assert blocks[0].weeks == "9-16"
    assert blocks[0].weekday == 5
    assert blocks[0].start_time == "08:00"
    assert blocks[0].raw_location == "实训大楼423-425数据中国实验室1"
    assert blocks[1].weeks == "2,4,6,8,10,12,14,16"


@pytest.mark.parametrize("week_text", ["1-16(单周)", "1-16（单周）", "1-16单周"])
def test_parse_course_cell_preserves_single_week_parity(week_text: str) -> None:
    blocks = parse_course_cell(
        f"""
        算法设计与分析
        舒华
        {week_text}[01-02节]
        教4-202
        """,
        weekday=3,
        fallback_start_time="08:00",
        fallback_end_time="09:40",
    )

    assert len(blocks) == 1
    assert blocks[0].weeks == "1-16(单)"


def test_import_does_not_conflict_single_and_even_week_courses(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    content = """
    <table>
      <tr><th>节次</th><th>星期三</th></tr>
      <tr>
        <td>第一二节<br>08:00-09:40</td>
        <td>
          算法设计与分析<br>舒华<br>1-16(单周)[01-02节]<br>教4-202<br>
          --------------------<br>
          算法设计与分析<br>舒华<br>2,4,6,8,10,12,14,16(周)[01-02节]<br>双创大楼801
        </td>
      </tr>
    </table>
    """.encode("utf-8")
    digest, _, preview = preview_and_resolutions(client, headers, content)

    assert [candidate["weeks"] for candidate in preview["candidates"]] == [
        "1-16(单)",
        "2,4,6,8,10,12,14,16",
    ]
    response = commit_import_request(client, headers, content, digest=digest)

    assert response.status_code == 201
    assert response.json()["created_count"] == 2
    assert importer_counts(SessionLocal) == (2, 2)


@pytest.fixture
def client(client_and_session: tuple[TestClient, sessionmaker]) -> TestClient:
    return client_and_session[0]


def test_preview_html_course_import_requires_login(client: TestClient) -> None:
    response = client.post(
        "/api/courses/import/preview",
        files={"file": ("schedule.html", "<table></table>", "text/html")},
    )

    assert response.status_code == 401


def test_preview_html_course_import_returns_parsed_items(client: TestClient) -> None:
    html = """
    <table>
      <tr><th></th><th>星期一</th><th>星期二</th><th>星期六</th><th>星期日</th></tr>
      <tr>
        <td>第一二节<br>08:00-09:40</td>
        <td>机器学习<br>吴笛<br>9-16(周)[01-02节]<br>实训大楼423-425数据中国实验室1</td>
        <td></td>
        <td>周末实践<br>老师<br>1-2(周)[01-02节]<br>教3-205</td>
        <td></td>
      </tr>
    </table>
    """
    response = client.post(
        "/api/courses/import/preview",
        files={"file": ("schedule.html", html.encode("utf-8"), "text/html")},
        headers=auth_headers(client),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["file"]["candidate_count"] == 2
    assert data["candidates"][0]["course_name"] == "机器学习"
    assert data["candidates"][0]["weekday"] == 1
    assert data["candidates"][0]["weeks"] == "9-16"
    assert data["candidates"][1]["weekday"] == 6
    assert data["candidates"][1]["source"]["raw_location"] == "教3-205"


def test_preview_native_capture_preserves_full_hubu_location(client: TestClient) -> None:
    html = """
    <!doctype html>
    <html>
      <body>
        <table>
          <tr>
            <th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th>
            <th>星期四</th><th>星期五</th>
          </tr>
          <tr>
            <td>第一二节<br>08:00-09:40</td>
            <td></td><td></td>
            <td>
              计算机组成原理<br>陈老师<br>1-16(周)[01-02节]<br>
              湖北大学(武昌主校区)-教4<br>教4-211
            </td>
            <td></td><td></td>
          </tr>
        </table>
      </body>
    </html>
    """

    response = client.post(
        "/api/courses/import/preview",
        files={
            "file": (
                "湖北大学教务系统课表.html",
                html.encode("utf-8"),
                "text/html",
            )
        },
        headers=auth_headers(client),
    )

    assert response.status_code == 200
    item = response.json()["candidates"][0]
    assert item["course_name"] == "计算机组成原理"
    assert item["weekday"] == 3
    assert item["source"]["raw_location"] == (
        "湖北大学(武昌主校区)-教4\n教4-211"
    )
    assert item["suggested_building_name"] == "湖北大学(武昌主校区)-教4"
    assert item["suggested_room_name"] == "教4-211"


def test_preview_xlsx_course_import_returns_parsed_items(client: TestClient) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"])
    sheet.append(
        [
            "第三四节\n09:55-11:35",
            "",
            "马克思主义基本原理\n张楠\n1-16(周)[03-04节]\n教4-103",
            "",
            "",
            "",
            "",
            "",
        ]
    )
    output = BytesIO()
    workbook.save(output)
    output.seek(0)

    response = client.post(
        "/api/courses/import/preview",
        files={
            "file": (
                "schedule.xlsx",
                output.getvalue(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        headers=auth_headers(client),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["file"]["candidate_count"] == 1
    item = data["candidates"][0]
    assert item["course_name"] == "马克思主义基本原理"
    assert item["weekday"] == 2
    assert item["start_time"] == "09:55"
    assert item["end_time"] == "11:35"
    assert item["source"]["raw_location"] == "教4-103"
    assert item["suggested_room_name"] == "103"


def test_preview_import_matches_short_teaching_building_names(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    with SessionLocal() as session:
        from app.models import Building

        if session.query(Building).filter(Building.name == "3号教学楼").first() is None:
            session.add(
                Building(
                    name="3号教学楼",
                    type="教学楼",
                    description="手动标点",
                    latitude=30.58,
                    longitude=114.32,
                    map_x=50,
                    map_y=50,
                    walk_hint="手动标点",
                )
            )
            session.commit()

    html = """
    <table>
      <tr><th></th><th>星期一</th></tr>
      <tr>
        <td>第一二节<br>08:00-09:40</td>
        <td>大学英语4<br>潘云昊<br>1-12(周)[01-02节]<br>教3-205</td>
      </tr>
    </table>
    """
    response = client.post(
        "/api/courses/import/preview",
        files={"file": ("schedule.html", html.encode("utf-8"), "text/html")},
        headers=auth_headers(client),
    )

    assert response.status_code == 200
    item = response.json()["candidates"][0]
    assert item["suggested_building_name"] in {"3号教学楼", "教3"}
    assert item["suggested_building_id"] is not None


def test_preview_import_matches_real_seed_building_aliases(client: TestClient) -> None:
    html = """
    <table>
      <tr><th></th><th>星期二</th><th>星期五</th></tr>
      <tr>
        <td>第三四节<br>09:55-11:35</td>
        <td>马克思主义基本原理<br>张楠<br>1-16(周)[03-04节]<br>教4-103</td>
        <td>数据库系统原理<br>曾星<br>2,4,6,8,10,12,14,16(周)[05-06节]<br>实训大楼413-418数据中国实验室2-3</td>
      </tr>
    </table>
    """
    response = client.post(
        "/api/courses/import/preview",
        files={"file": ("schedule.html", html.encode("utf-8"), "text/html")},
        headers=auth_headers(client),
    )

    assert response.status_code == 200
    items = response.json()["candidates"]
    assert items[0]["suggested_building_name"] == "湖北大学(武昌主校区)-教4"
    assert items[0]["suggested_building_id"] is not None
    assert items[1]["suggested_building_name"] == "湖北大学武昌校区综合实训大楼"
    assert items[1]["suggested_building_id"] is not None


def upload_preview(client: TestClient, filename: str, content: bytes):
    return client.post(
        "/api/courses/import/preview",
        files={"file": (filename, content, "application/octet-stream")},
        headers=auth_headers(client),
    )


@pytest.mark.parametrize(
    "filename",
    [
        "import_schedule.html",
        "import_schedule.htm",
        "import_schedule.xlsx",
        "import_schedule.xls",
    ],
)
def test_preview_preserves_every_candidate_row(
    client: TestClient,
    filename: str,
) -> None:
    fixture_filename = "import_schedule.html" if filename.endswith(".htm") else filename
    content = (FIXTURES / fixture_filename).read_bytes()

    response = upload_preview(client, filename, content)

    assert response.status_code == 200
    body = response.json()
    assert body["file"]["filename"] == filename
    assert body["file"]["candidate_count"] == 5
    assert len(body["file"]["sha256"]) == 64
    assert [item["row_ref"] for item in body["candidates"]] == [
        "row-1",
        "row-2",
        "row-3",
        "row-4",
        "row-5",
    ]
    assert body["candidates"][1]["source"]["raw_location"] == (
        "实训大楼423-425数据中国实验室1"
    )
    assert body["candidates"][1]["suggested_room_name"] == (
        "423-425数据中国实验室1"
    )
    assert body["candidates"][2]["source"]["raw_location"] == "风雨操场东区"
    assert body["candidates"][2]["suggested_room_name"] == "东区"

    expected_source_fields = {
        "raw_course_name",
        "raw_weekday",
        "raw_time_or_section",
        "raw_teacher",
        "raw_weeks",
        "raw_location",
    }
    assert all(
        set(candidate["source"]) == expected_source_fields
        for candidate in body["candidates"]
    )


def test_preview_reports_incomplete_and_unrecognized_rows(client: TestClient) -> None:
    response = upload_preview(
        client,
        "import_schedule.html",
        (FIXTURES / "import_schedule.html").read_bytes(),
    )

    assert response.status_code == 200
    body = response.json()
    assert [error["code"] for error in body["candidates"][3]["errors"]] == [
        "room_missing"
    ]
    assert [error["code"] for error in body["candidates"][4]["errors"]] == [
        "time_unrecognized"
    ]
    assert body["can_commit"] is True


def test_preview_rejects_unknown_extension_with_business_error(client: TestClient) -> None:
    response = upload_preview(client, "schedule.csv", b"course,weekday")

    assert response.status_code == 415
    assert response.json() == {
        "code": "unsupported_import_format",
        "message": "仅支持 HTM、HTML、XLS、XLSX 课表文件",
        "fields": ["file"],
        "details": {"filename": "schedule.csv"},
    }


def valid_import_content() -> bytes:
    return """
    <table>
      <tr><th>节次</th><th>星期一</th><th>星期二</th></tr>
      <tr>
        <td>第一二节<br>08:00-09:40</td>
        <td>大学英语<br>李老师<br>1-16(周)[01-02节]<br>教3-205</td>
        <td>机器学习<br>吴笛<br>9-16(周)[03-04节]<br>实训大楼423-425数据中国实验室1</td>
      </tr>
    </table>
    """.encode("utf-8")


def conflicting_import_content() -> bytes:
    return """
    <table>
      <tr><th>节次</th><th>星期一</th></tr>
      <tr>
        <td>第一二节<br>08:00-09:40</td>
        <td>
          课程甲<br>甲老师<br>1-16(周)[01-02节]<br>教3-205<br>
          --------------------<br>
          课程乙<br>乙老师<br>1-16(周)[01-02节]<br>教3-206
        </td>
      </tr>
    </table>
    """.encode("utf-8")


def preview_and_resolutions(
    client: TestClient,
    headers: dict[str, str],
    content: bytes,
    *,
    filename: str = "valid.html",
) -> tuple[str, list[dict[str, object]], dict[str, object]]:
    preview = client.post(
        "/api/courses/import/preview",
        files={"file": (filename, content, "text/html")},
        headers=headers,
    )
    assert preview.status_code == 200
    body = preview.json()
    resolutions = [
        {
            "row_ref": candidate["row_ref"],
            "building_id": candidate["suggested_building_id"],
            "room_name": candidate["suggested_room_name"],
        }
        for candidate in body["candidates"]
    ]
    return body["file"]["sha256"], resolutions, body


def commit_import_request(
    client: TestClient,
    headers: dict[str, str],
    content: bytes,
    *,
    digest: str,
    resolutions: list[dict[str, object]] | None = None,
    excluded_row_refs: list[str] | None = None,
    filename: str = "valid.html",
):
    manifest_data: dict[str, object] = {"sha256": digest}
    if resolutions is not None:
        manifest_data["resolutions"] = resolutions
    if excluded_row_refs is not None:
        manifest_data["excluded_row_refs"] = excluded_row_refs
    manifest = json.dumps(manifest_data, ensure_ascii=False)
    return client.post(
        "/api/courses/import",
        data={"manifest": manifest},
        files={"file": (filename, content, "text/html")},
        headers=headers,
    )


def importer_counts(SessionLocal: sessionmaker) -> tuple[int, int]:
    with SessionLocal() as session:
        user_id = session.scalar(select(User.id).where(User.username == "importer"))
        assert user_id is not None
        course_count = session.scalar(
            select(func.count()).select_from(Course).where(Course.user_id == user_id)
        )
        source_count = session.scalar(
            select(func.count())
            .select_from(CourseImportSource)
            .join(Course, Course.id == CourseImportSource.course_id)
            .where(Course.user_id == user_id)
        )
        return int(course_count or 0), int(source_count or 0)


def test_import_reparses_uploaded_file_and_rejects_wrong_sha(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    content = valid_import_content()
    _, resolutions, _ = preview_and_resolutions(client, headers, content)

    response = commit_import_request(
        client,
        headers,
        content,
        digest="0" * 64,
        resolutions=resolutions,
    )

    assert response.status_code == 409
    assert response.json()["code"] == "import_file_changed"
    assert importer_counts(SessionLocal) == (0, 0)


def test_import_does_not_require_location_resolutions(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    content = valid_import_content()
    digest, _, _ = preview_and_resolutions(client, headers, content)

    response = commit_import_request(
        client,
        headers,
        content,
        digest=digest,
    )

    assert response.status_code == 201
    assert response.json()["created_count"] == 2
    assert importer_counts(SessionLocal) == (2, 2)


def test_import_can_exclude_one_unrecognized_course_and_keep_the_rest(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client, configure_semester=False)
    content = """
    <table>
      <tr><th>节次</th><th>星期一</th><th>星期二</th></tr>
      <tr>
        <td>第一二节<br>08:00-09:40</td>
        <td>可导入课程<br>李老师<br>1-16(周)[01-02节]<br>教4-205</td>
        <td>待定课程<br>陈老师<br>教4-203</td>
      </tr>
    </table>
    """.encode("utf-8")
    digest, _, preview = preview_and_resolutions(client, headers, content)
    assert preview["can_commit"] is False
    assert any(
        issue["code"] == "weeks_unrecognized"
        for issue in preview["candidates"][1]["errors"]
    )

    response = commit_import_request(
        client,
        headers,
        content,
        digest=digest,
        excluded_row_refs=[preview["candidates"][1]["row_ref"]],
    )

    assert response.status_code == 201
    assert response.json()["created_count"] == 1
    assert importer_counts(SessionLocal) == (1, 1)
    semester = client.get("/api/semester", headers=headers)
    assert semester.status_code == 200
    assert semester.json()["status"] == "unconfigured"
    with SessionLocal() as session:
        courses = list(
            session.scalars(
                select(Course)
                .join(User, User.id == Course.user_id)
                .where(User.username == "importer")
            )
        )
        assert [course.course_name for course in courses] == ["可导入课程"]


def test_import_automatically_skips_course_without_time_and_location(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client, configure_semester=False)
    content = """
    <table>
      <tr><th>节次</th><th>星期一</th></tr>
      <tr>
        <td>第一二节<br>08:00-09:40</td>
        <td>可导入课程<br>李老师<br>1-16(周)[01-02节]<br>教4-205</td>
      </tr>
      <tr>
        <td>时间待定</td>
        <td>无排课课程<br>曾老师<br>1-16(周)</td>
      </tr>
    </table>
    """.encode("utf-8")
    digest, _, preview = preview_and_resolutions(client, headers, content)
    assert len(preview["candidates"]) == 2
    skipped = preview["candidates"][1]
    assert skipped["start_time"] is None
    assert skipped["source"]["raw_location"] == ""

    response = commit_import_request(
        client,
        headers,
        content,
        digest=digest,
    )

    assert response.status_code == 201
    assert response.json()["created_count"] == 1
    assert importer_counts(SessionLocal) == (1, 1)
    listed = client.get("/api/courses", headers=headers)
    assert [course["course_name"] for course in listed.json()] == ["可导入课程"]


def test_import_rejects_unknown_or_empty_exclusion_selection(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    content = valid_import_content()
    digest, _, preview = preview_and_resolutions(client, headers, content)

    unknown = commit_import_request(
        client,
        headers,
        content,
        digest=digest,
        excluded_row_refs=["row-999"],
    )
    assert unknown.status_code == 409
    assert unknown.json()["code"] == "import_exclusion_mismatch"

    exclude_all = commit_import_request(
        client,
        headers,
        content,
        digest=digest,
        excluded_row_refs=[
            candidate["row_ref"] for candidate in preview["candidates"]
        ],
    )
    assert exclude_all.status_code == 422
    assert exclude_all.json()["code"] == "import_empty_selection"
    assert importer_counts(SessionLocal) == (0, 0)


@pytest.mark.parametrize("mismatch", ["missing", "duplicate", "extra"])
def test_import_validates_nonempty_legacy_resolution_sets(
    client_and_session: tuple[TestClient, sessionmaker],
    mismatch: str,
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    content = valid_import_content()
    digest, resolutions, _ = preview_and_resolutions(client, headers, content)
    if mismatch == "missing":
        resolutions = resolutions[:-1]
    elif mismatch == "duplicate":
        resolutions = [*resolutions, dict(resolutions[0])]
    else:
        resolutions = [
            *resolutions,
            {"row_ref": "row-999", "building_id": 1, "room_name": "101"},
        ]

    response = commit_import_request(
        client,
        headers,
        content,
        digest=digest,
        resolutions=resolutions,
    )

    assert response.status_code == 409
    assert response.json()["code"] == "import_resolution_mismatch"
    assert importer_counts(SessionLocal) == (0, 0)


def test_import_keeps_unrecognized_location_without_blocking_timetable(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    raw_location = "校外创新基地 C 座 501"
    content = f"""
    <table>
      <tr><th>节次</th><th>星期一</th></tr>
      <tr>
        <td>第一二节<br>08:00-09:40</td>
        <td>创新实践<br>陈老师<br>1-12(周)[01-02节]<br>{raw_location}</td>
      </tr>
    </table>
    """.encode("utf-8")
    digest, _, preview = preview_and_resolutions(client, headers, content)
    assert preview["can_commit"] is True
    assert preview["candidates"][0]["errors"][0]["code"] == "building_unrecognized"

    response = commit_import_request(
        client,
        headers,
        content,
        digest=digest,
    )

    assert response.status_code == 201
    assert importer_counts(SessionLocal) == (1, 1)
    listed = client.get("/api/courses", headers=headers)
    assert listed.status_code == 200
    course = listed.json()[0]
    assert course["building_id"] is None
    assert course["building"] is None
    assert course["source_location"] == raw_location
    assert course["needs_location_review"] is True


def test_import_internal_conflict_rolls_back_every_course(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    content = conflicting_import_content()
    digest, resolutions, _ = preview_and_resolutions(client, headers, content)
    existing = client.post(
        "/api/courses",
        json={
            "course_name": "原课表课程",
            "weekday": 3,
            "start_time": "14:00",
            "end_time": "15:40",
            "building_id": resolutions[0]["building_id"],
            "room_name": "301",
            "teacher": "老师",
            "weeks": "1-16",
        },
        headers=headers,
    )
    assert existing.status_code == 201

    response = commit_import_request(
        client,
        headers,
        content,
        digest=digest,
        resolutions=resolutions,
        filename="conflict.html",
    )

    assert response.status_code == 409
    assert response.json()["code"] == "course_conflict"
    assert response.json()["details"]["conflicts"][0]["row_ref"] == "row-2"
    assert response.json()["details"]["conflicts"][0]["conflicting_row_ref"] == "row-1"
    assert importer_counts(SessionLocal) == (1, 0)
    listed = client.get("/api/courses", headers=headers)
    assert [course["course_name"] for course in listed.json()] == ["原课表课程"]


def test_import_replaces_existing_timetable_instead_of_conflicting_with_it(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    content = valid_import_content()
    digest, resolutions, _ = preview_and_resolutions(client, headers, content)
    existing = client.post(
        "/api/courses",
        json={
            "course_name": "已有课程",
            "weekday": 1,
            "start_time": "08:00",
            "end_time": "09:40",
            "building_id": resolutions[0]["building_id"],
            "room_name": "201",
            "teacher": "老师",
            "weeks": "1-16",
        },
        headers=headers,
    )
    assert existing.status_code == 201

    response = commit_import_request(
        client,
        headers,
        content,
        digest=digest,
        resolutions=resolutions,
    )

    assert response.status_code == 201
    assert response.json()["created_count"] == 2
    assert importer_counts(SessionLocal) == (2, 2)
    listed = client.get("/api/courses", headers=headers)
    assert {course["course_name"] for course in listed.json()} == {
        "大学英语",
        "机器学习",
    }


def test_import_success_persists_sources_and_same_file_can_replace_again(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    content = valid_import_content()
    digest, resolutions, preview = preview_and_resolutions(client, headers, content)

    response = commit_import_request(
        client,
        headers,
        content,
        digest=digest,
        resolutions=resolutions,
    )

    assert response.status_code == 201
    assert response.json()["created_count"] == 2
    assert len(response.json()["course_ids"]) == 2
    assert importer_counts(SessionLocal) == (2, 2)
    with SessionLocal() as session:
        sources = list(
            session.scalars(
                select(CourseImportSource).order_by(CourseImportSource.source_row)
            ).all()
        )
        courses = list(
            session.scalars(
                select(Course)
                .join(User, User.id == Course.user_id)
                .where(User.username == "importer")
                .order_by(Course.id)
            ).all()
        )
        assert [course.source_kind for course in courses] == ["import", "import"]
        for source, candidate in zip(sources, preview["candidates"], strict=True):
            assert source.filename == "valid.html"
            assert source.file_sha256 == digest
            assert source.source_row == candidate["row_ref"]
            assert {
                "raw_course_name": source.raw_course_name,
                "raw_weekday": source.raw_weekday,
                "raw_time_or_section": source.raw_time_or_section,
                "raw_teacher": source.raw_teacher,
                "raw_weeks": source.raw_weeks,
                "raw_location": source.raw_location,
            } == candidate["source"]

    repeated = commit_import_request(
        client,
        headers,
        content,
        digest=digest,
        resolutions=resolutions,
    )
    assert repeated.status_code == 201
    assert repeated.json()["created_count"] == 2
    assert importer_counts(SessionLocal) == (2, 2)


def test_import_database_error_rolls_back_every_course(
    client_and_session: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    content = valid_import_content()
    digest, resolutions, _ = preview_and_resolutions(client, headers, content)
    original_init = CourseImportSource.__init__

    def fail_on_second_source(self, **kwargs):
        if kwargs.get("source_row") == "row-2":
            raise RuntimeError("simulated source persistence failure")
        original_init(self, **kwargs)

    monkeypatch.setattr(CourseImportSource, "__init__", fail_on_second_source)
    no_raise_client = TestClient(app, raise_server_exceptions=False)

    response = commit_import_request(
        no_raise_client,
        headers,
        content,
        digest=digest,
        resolutions=resolutions,
    )

    assert response.status_code == 500
    assert importer_counts(SessionLocal) == (0, 0)


def test_import_defers_missing_room_review_until_route_time(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    content = """
    <table>
      <tr><th>节次</th><th>星期四</th></tr>
      <tr><td>第一二节</td><td>形势与政策<br>周老师<br>1-4(周)[01-02节]<br>教4</td></tr>
    </table>
    """.encode("utf-8")
    digest, _, preview = preview_and_resolutions(client, headers, content)
    assert preview["candidates"][0]["errors"][0]["code"] == "room_missing"
    assert preview["can_commit"] is True

    response = commit_import_request(
        client,
        headers,
        content,
        digest=digest,
    )

    assert response.status_code == 201
    assert importer_counts(SessionLocal) == (1, 1)
    with SessionLocal() as session:
        course = session.scalar(
            select(Course)
            .join(User, User.id == Course.user_id)
            .where(User.username == "importer")
        )
        assert course is not None
        assert course.building_id is not None
        assert course.room_name == "待确认教室"


def test_import_honors_legacy_map_resolution_without_changing_source_text(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    content = valid_import_content()
    digest, resolutions, preview = preview_and_resolutions(client, headers, content)
    resolutions[0]["room_name"] = "旧版确认教室 205"

    response = commit_import_request(
        client,
        headers,
        content,
        digest=digest,
        resolutions=resolutions,
    )

    assert response.status_code == 201
    with SessionLocal() as session:
        course = session.scalar(
            select(Course)
            .join(User, User.id == Course.user_id)
            .where(User.username == "importer", Course.course_name == "大学英语")
        )
        assert course is not None
        assert course.room_name == "旧版确认教室 205"
        assert course.import_source is not None
        assert course.import_source.raw_location == (
            preview["candidates"][0]["source"]["raw_location"]
        )


def test_import_keeps_course_when_time_cannot_be_parsed(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    content = """
    <table>
      <tr><th>节次</th><th>星期五</th></tr>
      <tr><td>晚间</td><td>创新实践<br>陈老师<br>1-12(周)[晚自习]<br>教4-203</td></tr>
    </table>
    """.encode("utf-8")
    digest, resolutions, _ = preview_and_resolutions(client, headers, content)

    response = commit_import_request(
        client,
        headers,
        content,
        digest=digest,
        resolutions=resolutions,
    )

    assert response.status_code == 201
    assert response.json()["created_count"] == 1
    assert importer_counts(SessionLocal) == (1, 1)
    with SessionLocal() as session:
        course = session.scalar(
            select(Course)
            .join(User, User.id == Course.user_id)
            .where(User.username == "importer", Course.course_name == "创新实践")
        )
        assert course is not None
        assert course.start_time is None
        assert course.end_time is None
        assert course.source_kind == "import"
        assert course.import_source is not None


def test_import_endpoint_requires_login(client: TestClient) -> None:
    response = client.post(
        "/api/courses/import",
        data={"manifest": json.dumps({"sha256": "0" * 64, "resolutions": []})},
        files={"file": ("schedule.html", b"<table></table>", "text/html")},
    )

    assert response.status_code == 401


def test_import_rejects_invalid_manifest(client: TestClient) -> None:
    response = client.post(
        "/api/courses/import",
        data={"manifest": "not-json"},
        files={"file": ("schedule.html", b"<table></table>", "text/html")},
        headers=auth_headers(client),
    )

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_import_manifest"


def test_preview_rejects_oversized_upload_before_parsing(client: TestClient) -> None:
    response = client.post(
        "/api/courses/import/preview",
        files={
            "file": (
                "schedule.html",
                b"x" * (MAX_IMPORT_FILE_BYTES + 1),
                "text/html",
            )
        },
        headers=auth_headers(client),
    )

    assert response.status_code == 413
    assert response.json()["code"] == "import_file_too_large"


def test_preview_rejects_xlsx_with_excessive_expanded_size(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.course_import_service.MAX_XLSX_EXPANDED_BYTES",
        1024,
    )
    content = BytesIO()
    with ZipFile(content, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("xl/worksheets/sheet1.xml", b"x" * 2048)

    response = client.post(
        "/api/courses/import/preview",
        files={"file": ("schedule.xlsx", content.getvalue(), "application/octet-stream")},
        headers=auth_headers(client),
    )

    assert response.status_code == 413
    assert response.json()["code"] == "import_file_too_large"


def test_preview_accepts_html_export_with_xls_suffix(client: TestClient) -> None:
    response = upload_preview(
        client,
        "legacy-export.xls",
        (FIXTURES / "import_schedule.html").read_bytes(),
    )

    assert response.status_code == 200
    assert response.json()["file"]["candidate_count"] == 5


def test_import_keeps_room_name_longer_than_legacy_limit(
    client_and_session: tuple[TestClient, sessionmaker],
) -> None:
    client, SessionLocal = client_and_session
    headers = auth_headers(client)
    long_room = "423-425数据中国实验室" + "东区联合创新空间" * 7
    assert 64 < len(long_room) <= 120
    content = f"""
    <table>
      <tr><th>节次</th><th>星期二</th></tr>
      <tr>
        <td>第三四节</td>
        <td>机器学习<br>吴笛<br>1-16(周)[03-04节]<br>实训大楼{long_room}</td>
      </tr>
    </table>
    """.encode("utf-8")
    digest, resolutions, preview = preview_and_resolutions(client, headers, content)
    assert preview["candidates"][0]["suggested_room_name"] == long_room

    response = commit_import_request(
        client,
        headers,
        content,
        digest=digest,
        resolutions=resolutions,
    )

    assert response.status_code == 201
    with SessionLocal() as session:
        course = session.scalar(
            select(Course)
            .join(User, User.id == Course.user_id)
            .where(User.username == "importer")
        )
        assert course is not None
        assert course.room_name == long_room
        assert course.import_source is not None
        assert course.import_source.raw_location == f"实训大楼{long_room}"
