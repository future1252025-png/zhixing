from collections.abc import Generator
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy.orm import Session, sessionmaker

from app.db.database import Base, create_sqlite_engine, get_session, init_db
from app.db.seed import seed_demo_data
from app.main import app
from app.services.course_import_service import parse_course_cell


def make_test_database_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def auth_headers(client: TestClient) -> dict[str, str]:
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
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.fixture
def client_and_session(
    tmp_path: Path,
) -> Generator[tuple[TestClient, sessionmaker], None, None]:
    engine = create_sqlite_engine(make_test_database_url(tmp_path / "test_import.db"))
    init_db(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with TestingSessionLocal() as session:
        seed_demo_data(session)

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
    assert data["total"] == 2
    assert data["items"][0]["course_name"] == "机器学习"
    assert data["items"][0]["weekday"] == 1
    assert data["items"][0]["weeks"] == "9-16"
    assert data["items"][1]["weekday"] == 6
    assert data["items"][1]["raw_location"] == "教3-205"


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
    assert data["total"] == 1
    item = data["items"][0]
    assert item["course_name"] == "马克思主义基本原理"
    assert item["weekday"] == 2
    assert item["start_time"] == "09:55"
    assert item["end_time"] == "11:35"
    assert item["room_name"] == "教4-103"


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
    item = response.json()["items"][0]
    assert item["building_name"] in {"3号教学楼", "教3"}
    assert item["needs_building"] is False


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
    items = response.json()["items"]
    assert items[0]["building_name"] == "湖北大学(武昌主校区)-教4"
    assert items[0]["needs_building"] is False
    assert items[1]["building_name"] == "湖北大学武昌校区综合实训大楼"
    assert items[1]["needs_building"] is False
