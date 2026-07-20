# 核心用户链路加固 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让“登录 → 设置学期 → 查看/导入课程 → 看清完整地点 → 首页摘要 → 出发建议”成为一致、无损、可恢复且有自动化保障的核心链路。

**Architecture:** 后端是教学周、周次解析、课程冲突、地点完整性和导入事务的唯一裁决者；前端只负责输入、浏览周切换、清晰展示和恢复路径。学期设置、课程导入来源进入正式数据模型和 Alembic 迁移；所有批量导入在单一 SQLAlchemy 事务中完成。

**Tech Stack:** FastAPI、SQLAlchemy、Alembic、pytest、openpyxl、xlrd；Vue 3、TypeScript、Pinia、Axios、Vant、Vitest、Vue Test Utils、Playwright、axe-core。

---

## 执行约束

- 每个任务都按“先失败测试 → 最小实现 → 通过测试 → 小提交”执行，不能把多个红灯测试攒到最后。
- 不得提交 `backend/data/`、两份现存的大数据测试报告或任何本地数据库。
- 后端返回的 `code` 是前端分支判断的唯一依据；不得继续匹配英文错误文本。
- 导入原始字段只读，执行映射单独保存；不得用“待确认教室”等占位内容绕过必填规则。
- 浏览周只影响课表页，首页与出发建议始终读取后端计算的真实教学周。
- 所有新增文字/背景组合正常字号对比度至少 `4.5:1`；高亮、动画层、加载层不能盖住文字。
- 每个任务结束时先运行该任务的聚焦测试；最后任务再运行全量回归。

## 目标文件图

```text
backend/
├─ alembic.ini
├─ migrations/
│  ├─ env.py
│  ├─ script.py.mako
│  └─ versions/
│     ├─ 20260720_00_baseline.py
│     └─ 20260720_01_core_journey.py
├─ app/
│  ├─ api/semester.py
│  ├─ core/clock.py
│  ├─ core/errors.py
│  ├─ models/{semester_setting,course_import_source}.py
│  ├─ schemas/{error,semester}.py
│  └─ services/{semester_service,week_rule,course_policy}.py
└─ tests/
   ├─ test_migrations.py
   ├─ test_semester.py
   ├─ test_week_rule.py
   └─ test_course_policy.py

frontend/
├─ e2e/
│  ├─ core-journey.spec.ts
│  └─ fixtures/import-schedule.html
├─ src/
│  ├─ api/{errors,semester}.ts
│  ├─ components/course/{CourseCard,SemesterSettingsCard}.vue
│  ├─ components/import/{ImportCandidateCard,ImportSummary}.vue
│  ├─ stores/semester.ts
│  ├─ types/{api,semester}.ts
│  └─ utils/{scopedStorage,contrast}.ts
└─ playwright.config.ts
```

## Task 1: 建立版本化迁移与核心数据模型

**Files:**

- Modify: `backend/requirements.txt`
- Modify: `backend/app/models/course.py`
- Modify: `backend/app/models/user.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/db/database.py`
- Modify: `backend/app/db/seed.py`
- Create: `backend/app/models/semester_setting.py`
- Create: `backend/app/models/course_import_source.py`
- Create: `backend/alembic.ini`
- Create: `backend/migrations/env.py`
- Create: `backend/migrations/script.py.mako`
- Create: `backend/migrations/versions/20260720_00_baseline.py`
- Create: `backend/migrations/versions/20260720_01_core_journey.py`
- Modify: `backend/tests/test_database.py`
- Create: `backend/tests/test_migrations.py`

- [ ] **Step 1: 写出新表和字段的失败测试**

在 `backend/tests/test_database.py` 增加以下断言：

```python
def test_init_db_creates_core_journey_tables(temp_database):
    inspector = inspect(temp_database)
    assert "semester_settings" in inspector.get_table_names()
    assert "course_import_sources" in inspector.get_table_names()

    course_columns = {item["name"] for item in inspector.get_columns("courses")}
    assert "source_kind" in course_columns

    semester_indexes = inspector.get_indexes("semester_settings")
    assert any(
        item["unique"] and item["column_names"] == ["user_id"]
        for item in semester_indexes
    )
```

在 `backend/tests/test_migrations.py` 创建真实迁移测试：

```python
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.db.database import upgrade_database


def make_config(database_url: str) -> Config:
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


@pytest.fixture
def legacy_database_url(tmp_path: Path) -> str:
    database_path = tmp_path / "legacy.db"
    database_url = f"sqlite:///{database_path.as_posix()}"
    command.upgrade(make_config(database_url), "20260720_00")
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users "
                "(id, username, password_hash, nickname, role, created_at) "
                "VALUES (1, 'legacy', 'hash', '旧用户', 'student', "
                "'2026-07-20 00:00:00')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO buildings "
                "(id, name, type, description, latitude, longitude, map_x, map_y, "
                "created_at) VALUES "
                "(1, '教3', '教学楼', '旧建筑', 30.0, 120.0, 0.5, 0.5, "
                "'2026-07-20 00:00:00')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO courses "
                "(id, user_id, course_name, weekday, start_time, end_time, "
                "building_id, room_name, teacher, weeks, created_at) VALUES "
                "(1, 1, '旧课程', 1, '08:00', '09:40', 1, '205', "
                "'教师', NULL, '2026-07-20 00:00:00')"
            )
        )
        connection.execute(text("DROP TABLE alembic_version"))
    engine.dispose()
    return database_url


def count_rows(database_url: str, table_name: str) -> int:
    assert table_name == "courses"
    engine = create_engine(database_url)
    with engine.connect() as connection:
        count = connection.scalar(text("SELECT COUNT(*) FROM courses"))
    engine.dispose()
    return int(count or 0)


def test_alembic_upgrade_builds_core_journey_schema(tmp_path: Path):
    database_path = tmp_path / "migration.db"
    database_url = f"sqlite:///{database_path.as_posix()}"
    config = make_config(database_url)

    command.upgrade(config, "head")

    inspector = inspect(create_engine(database_url))
    assert {
        "users",
        "buildings",
        "courses",
        "semester_settings",
        "course_import_sources",
    }.issubset(set(inspector.get_table_names()))
    assert "source_kind" in {
        item["name"] for item in inspector.get_columns("courses")
    }


def test_upgrade_adopts_a_legacy_database_without_losing_rows(
    legacy_database_url: str,
):
    before = count_rows(legacy_database_url, "courses")
    upgrade_database(legacy_database_url)
    after = count_rows(legacy_database_url, "courses")

    assert after == before
    inspector = inspect(create_engine(legacy_database_url))
    assert "semester_settings" in inspector.get_table_names()
    assert "course_import_sources" in inspector.get_table_names()
```

- [ ] **Step 2: 运行测试并确认因模型/迁移缺失而失败**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_database.py tests/test_migrations.py -q
```

Expected: `semester_settings` 或 Alembic 配置不存在导致失败，不得出现测试收集错误以外的无关异常。

- [ ] **Step 3: 添加依赖和 SQLAlchemy 模型**

在 `backend/requirements.txt` 增加：

```text
alembic
xlrd
```

创建 `backend/app/models/semester_setting.py`：

```python
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class SemesterSetting(Base):
    __tablename__ = "semester_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_weeks: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    user = relationship("User", back_populates="semester_setting")
```

创建 `backend/app/models/course_import_source.py`：

```python
from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class CourseImportSource(Base):
    __tablename__ = "course_import_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_row: Mapped[str] = mapped_column(String(80), nullable=False)
    raw_course_name: Mapped[str] = mapped_column(Text, nullable=False)
    raw_weekday: Mapped[str] = mapped_column(Text, nullable=False)
    raw_time_or_section: Mapped[str] = mapped_column(Text, nullable=False)
    raw_teacher: Mapped[str] = mapped_column(Text, nullable=False)
    raw_weeks: Mapped[str] = mapped_column(Text, nullable=False)
    raw_location: Mapped[str] = mapped_column(Text, nullable=False)

    course = relationship("Course", back_populates="import_source")
```

在 `Course` 增加：

```python
weeks: Mapped[str] = mapped_column(
    String(64),
    nullable=False,
    default="1-20",
    server_default="1-20",
)
source_kind: Mapped[str] = mapped_column(
    String(16), nullable=False, default="manual", server_default="manual"
)
import_source = relationship(
    "CourseImportSource",
    back_populates="course",
    uselist=False,
    cascade="all, delete-orphan",
    passive_deletes=True,
)
```

在 `User` 增加：

```python
semester_setting = relationship(
    "SemesterSetting",
    back_populates="user",
    uselist=False,
    cascade="all, delete-orphan",
    passive_deletes=True,
)
```

在 `backend/app/models/__init__.py` 显式导入两个新模型，确保 `Base.metadata` 能发现它们。

- [ ] **Step 4: 配置 Alembic 并写首个可重复迁移**

`backend/migrations/env.py` 必须：

- 从 `config.get_main_option("sqlalchemy.url")` 读取测试覆盖 URL；
- 未覆盖时使用现有 `settings.database_url`；
- 导入 `app.models` 后将 `Base.metadata` 设为 `target_metadata`；
- SQLite 开启 `render_as_batch=True`。

`20260720_00_baseline.py` 用显式 `op.create_table` / `op.create_index` 建立当前已有的 `users`、`buildings`、`courses`、`messages`、`location_presets`，空数据库从它开始升级。

`20260720_01_core_journey.py` 必须在 `upgrade()` 中：

1. 将旧课程的空 `weeks` 更新为 `1-20`；
2. 将 `weeks` 改为非空并保留 `1-20` 服务端默认；
3. 为 `courses` 增加 `source_kind`，默认 `manual`；
4. 创建 `semester_settings`；
5. 创建 `course_import_sources`；
6. 创建唯一索引与外键。

`downgrade()` 按相反顺序删除来源表、学期表和新增字段，并把 `weeks` 恢复为 nullable。迁移文件本身不使用 inspector 跳过操作，确保 Alembic 历史是确定的。

在 `backend/app/db/database.py` 中保留 `Base.metadata.create_all()` 仅供隔离测试使用；删除 `ensure_sqlite_schema_compatibility()` 及其调用，生产/seed 路径不得再用启动期手写 `ALTER TABLE`。迁移入口改为：

```python
def upgrade_database(database_url: str = settings.database_url) -> None:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    target_engine = create_engine(database_url)
    inspector = inspect(target_engine)
    tables = set(inspector.get_table_names())
    if "alembic_version" not in tables and {
        "users",
        "buildings",
        "courses",
        "messages",
        "location_presets",
    }.issubset(tables):
        verify_legacy_schema_matches_baseline(inspector)
        command.stamp(config, "20260720_00")
    target_engine.dispose()
    command.upgrade(config, "head")
```

`verify_legacy_schema_matches_baseline` 要逐表检查基线字段；不完整时抛出带备份说明的 `RuntimeError`，不能误 stamp 后掩盖旧 schema。`test_migrations.py` 再加一个缺列 legacy fixture，断言不会写入 `alembic_version`。

在 `backend/app/db/seed.py` 的 `initialize_database(database_url)` 中先调用 `upgrade_database(database_url)`，再创建 session 和 seed；不得再由 seed 路径用 `create_all()` 绕过迁移。

- [ ] **Step 5: 运行模型和迁移测试**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pytest tests/test_database.py tests/test_migrations.py -q
```

Expected: 全部通过；第二次执行 `command.upgrade(config, "head")` 仍不报错。

- [ ] **Step 6: 提交数据模型基础**

```powershell
git add backend/requirements.txt backend/alembic.ini backend/migrations backend/app/models backend/app/db/database.py backend/app/db/seed.py backend/tests/test_database.py backend/tests/test_migrations.py
git commit -m "feat(backend): 建立核心链路数据迁移"
```

## Task 2: 实现周次解析器

**Files:**

- Create: `backend/app/services/week_rule.py`
- Create: `backend/tests/test_week_rule.py`
- Modify: `backend/app/schemas/course.py`

- [ ] **Step 1: 用参数化测试定义合法周次**

创建 `backend/tests/test_week_rule.py`：

```python
import pytest

from app.services.week_rule import WeekExpressionError, normalize_weeks, parse_weeks


@pytest.mark.parametrize(
    ("raw", "expected_set", "expected_normalized"),
    [
        ("1-16", set(range(1, 17)), "1-16"),
        ("1,3,5", {1, 3, 5}, "1,3,5"),
        ("1-16(单)", set(range(1, 17, 2)), "1-15(单)"),
        ("1-16（双）", set(range(2, 17, 2)), "2-16(双)"),
        (" 1， 3、5 ", {1, 3, 5}, "1,3,5"),
        ("第1-4周", {1, 2, 3, 4}, "1-4"),
    ],
)
def test_parse_and_normalize_weeks(raw, expected_set, expected_normalized):
    assert parse_weeks(raw, max_week=20) == expected_set
    assert normalize_weeks(raw, max_week=20) == expected_normalized


@pytest.mark.parametrize("raw", ["", "0-3", "2-1", "1-21", "abc", "1,,3"])
def test_invalid_week_expression_is_rejected(raw):
    with pytest.raises(WeekExpressionError):
        parse_weeks(raw, max_week=20)
```

- [ ] **Step 2: 运行并确认模块缺失**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_week_rule.py -q
```

Expected: 因 `app.services.week_rule` 不存在而失败。

- [ ] **Step 3: 实现单一周次语法入口**

创建 `backend/app/services/week_rule.py`，对全角标点、`第`、`周` 和括号做标准化；逗号分段后只允许：

```python
TOKEN_PATTERN = re.compile(
    r"^(?P<start>\d{1,2})(?:-(?P<end>\d{1,2}))?(?:\((?P<parity>单|双)\))?$"
)
```

公开以下稳定接口：

```python
class WeekExpressionError(ValueError):
    pass


def parse_weeks(value: str, *, max_week: int) -> set[int]:
    """解析周次表达式；任何未完整消费的字符都必须报错。"""


def normalize_weeks(value: str, *, max_week: int) -> str:
    """解析后输出稳定表达式，不能改变实际周集合。"""


def weeks_overlap(left: str, right: str, *, max_week: int) -> set[int]:
    return parse_weeks(left, max_week=max_week) & parse_weeks(
        right, max_week=max_week
    )
```

规范化规则：

- 连续三周及以上写为 `start-end`；
- 同奇偶且至少三项写为 `start-end(单|双)`；
- 其余升序逗号连接；
- `parse_weeks(normalize_weeks(x)) == parse_weeks(x)` 必须成立。

在 `backend/app/schemas/course.py` 里让创建/更新请求的 `weeks` 成为非空字符串，并通过字段验证器调用 `normalize_weeks(value, max_week=30)`；领域服务会按用户学期总周数再校验一次。

`CourseRead.weeks` 同步改为非空字符串，并新增 `source_kind: Literal["manual", "import"]` 和 `needs_location_review: bool`；前端不再需要为已保存课程猜测缺失周次、来源或 legacy 地点状态。

- [ ] **Step 4: 运行周次测试**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_week_rule.py -q
```

Expected: 全部通过。

- [ ] **Step 5: 提交周次规则**

```powershell
git add backend/app/services/week_rule.py backend/app/schemas/course.py backend/tests/test_week_rule.py
git commit -m "feat(backend): 统一课程周次解析规则"
```

## Task 3: 实现学期设置和真实教学周 API

**Files:**

- Create: `backend/app/schemas/semester.py`
- Create: `backend/app/core/clock.py`
- Create: `backend/app/services/semester_service.py`
- Create: `backend/app/api/semester.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_semester.py`

- [ ] **Step 1: 写领域边界和 API 失败测试**

`backend/tests/test_semester.py` 至少覆盖：

```python
@pytest.mark.parametrize(
    ("today", "status", "week"),
    [
        (date(2026, 8, 30), "before_term", None),
        (date(2026, 8, 31), "active", 1),
        (date(2026, 9, 7), "active", 2),
        (date(2027, 1, 17), "active", 20),
        (date(2027, 1, 18), "after_term", None),
    ],
)
def test_resolve_semester_state(today, status, week):
    result = resolve_semester_state(
        start_date=date(2026, 8, 31),
        total_weeks=20,
        today=today,
    )
    assert result.status == status
    assert result.current_week == week


def test_get_semester_returns_unconfigured(client, auth_headers):
    response = client.get("/api/semester", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {
        "status": "unconfigured",
        "start_date": None,
        "total_weeks": None,
        "current_week": None,
    }


def test_put_semester_rejects_non_monday(client, auth_headers):
    response = client.put(
        "/api/semester",
        headers=auth_headers,
        json={"start_date": "2026-09-01", "total_weeks": 20},
    )
    assert response.status_code == 422
```

再覆盖同一用户 PUT 为更新、不同用户互不读取、`total_weeks` 范围 `1..30`、Asia/Shanghai 当日边界。

API fixture 通过：

```python
app.dependency_overrides[get_current_time] = lambda: datetime(
    2026,
    9,
    21,
    7,
    0,
    tzinfo=SHANGHAI_TZ,
)
```

固定服务器时刻，并在 fixture teardown 中移除该 override，避免测试依赖运行当天。

- [ ] **Step 2: 运行并确认 404/模块缺失**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_semester.py -q
```

Expected: 服务模块不存在或 `/api/semester` 返回 404。

- [ ] **Step 3: 实现学期领域服务**

`backend/app/services/semester_service.py` 公开：

```python
@dataclass(frozen=True)
class SemesterState:
    status: Literal["unconfigured", "before_term", "active", "after_term"]
    current_week: int | None


def shanghai_today(now: datetime) -> date:
    instant = now
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=ZoneInfo("Asia/Shanghai"))
    return instant.astimezone(ZoneInfo("Asia/Shanghai")).date()


def resolve_semester_state(
    *, start_date: date, total_weeks: int, today: date
) -> SemesterState:
    day_offset = (today - start_date).days
    if day_offset < 0:
        return SemesterState("before_term", None)
    week = day_offset // 7 + 1
    if week > total_weeks:
        return SemesterState("after_term", None)
    return SemesterState("active", week)
```

另外实现：

- `get_setting(session, user_id)`;
- `get_semester_response(session, user_id, now=None)`;
- `upsert_setting(session, user_id, start_date, total_weeks)`；
- PUT 成功后只在 API 层提交一次事务。

创建只读时间依赖 `backend/app/core/clock.py`：

```python
SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")


def get_current_time() -> datetime:
    return datetime.now(tz=SHANGHAI_TZ)
```

生产请求只能使用这个依赖得到实时时间；测试可用 `app.dependency_overrides[get_current_time]` 注入固定时刻，前端请求不得携带或覆盖“当前周”。

- [ ] **Step 4: 实现 schema 和路由**

`SemesterUpdate` 对开始日期增加“必须为周一”校验；`SemesterResponse` 固定返回四个字段：

```python
class SemesterResponse(BaseModel):
    status: Literal["unconfigured", "before_term", "active", "after_term"]
    start_date: date | None
    total_weeks: int | None
    current_week: int | None
```

`backend/app/api/semester.py` 提供：

```python
@router.get("", response_model=SemesterResponse)
def read_semester(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    now: datetime = Depends(get_current_time),
) -> SemesterResponse:
    return semester_service.get_semester_response(
        session,
        current_user.id,
        now=now,
    )


@router.put("", response_model=SemesterResponse)
def write_semester(
    payload: SemesterUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    now: datetime = Depends(get_current_time),
) -> SemesterResponse:
    semester_service.upsert_setting(
        session,
        current_user.id,
        payload.start_date,
        payload.total_weeks,
    )
    session.commit()
    return semester_service.get_semester_response(
        session,
        current_user.id,
        now=now,
    )
```

在 `backend/app/main.py` 注册前缀 `/api/semester`。

- [ ] **Step 5: 运行学期测试和现有鉴权测试**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_semester.py tests/test_auth.py -q
```

Expected: 全部通过。

- [ ] **Step 6: 提交学期 API**

```powershell
git add backend/app/api/semester.py backend/app/core/clock.py backend/app/main.py backend/app/schemas/semester.py backend/app/services/semester_service.py backend/tests/test_semester.py
git commit -m "feat(semester): 支持自动教学周设置"
```

## Task 4: 把课程完整性和冲突裁决移到后端

**Files:**

- Create: `backend/app/core/errors.py`
- Create: `backend/app/schemas/error.py`
- Create: `backend/app/services/course_policy.py`
- Modify: `backend/app/services/course_service.py`
- Modify: `backend/app/api/courses.py`
- Modify: `backend/app/schemas/course.py`
- Create: `backend/tests/test_course_policy.py`
- Modify: `backend/tests/test_courses.py`

- [ ] **Step 1: 写半开区间、周次交集和地点必填测试**

`backend/tests/test_course_policy.py`：

```python
def test_touching_time_ranges_do_not_conflict():
    assert not time_ranges_overlap(time(8, 0), time(9, 0), time(9, 0), time(10, 0))


def test_same_day_time_and_overlapping_weeks_conflict():
    conflicts = detect_conflicts(
        candidate=course_value("1-8", start="08:00", end="09:40"),
        existing=[course_value("2-10", start="09:00", end="10:00", course_id=3)],
        max_week=20,
    )
    assert conflicts[0].course_id == 3
    assert conflicts[0].overlap_weeks == [2, 3, 4, 5, 6, 7, 8]


def test_overlapping_time_with_disjoint_weeks_is_allowed():
    conflicts = detect_conflicts(
        candidate=course_value("1-8(单)", start="08:00", end="09:40"),
        existing=[course_value("2-8(双)", start="08:20", end="09:00")],
        max_week=20,
    )
    assert conflicts == []
```

在 `backend/tests/test_courses.py` 增加：

- 创建时 `building_id=None` 返回 422；
- `room_name="   "` 返回 422；
- `room_name="待确认教室"` 返回 422 和 `invalid_room_name`；
- 创建冲突返回 409，body 的 `code == "course_conflict"`；
- 更新时排除自身；
- 更新为与另一课程冲突返回 409 且原记录不变；
- 不同用户课程不参与冲突。
- 不存在的建筑返回 404 `building_not_found`；
- 不属于当前用户的课程返回 404 `course_not_found`，不泄露其是否属于别人。

期望 409：

```python
assert response.json() == {
    "code": "course_conflict",
    "message": "该时间与已有课程冲突",
    "fields": ["weekday", "start_time", "end_time", "weeks"],
    "details": {
        "conflicts": [
            {
                "course_id": existing_course_id,
                "course_name": "高等数学",
                "overlap_weeks": [3, 4],
            }
        ]
    },
}
```

- [ ] **Step 2: 运行并确认冲突课程仍可保存**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_course_policy.py tests/test_courses.py -q
```

Expected: 新测试失败，现有 CRUD 测试继续通过。

- [ ] **Step 3: 实现统一业务错误和课程策略**

`backend/app/core/errors.py`：

```python
class BusinessError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        fields: list[str] | None = None,
        details: dict[str, object] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = fields or []
        self.details = details or {}

    def as_response(self) -> dict[str, object]:
        return {
            "code": self.code,
            "message": self.message,
            "fields": self.fields,
            "details": self.details,
        }
```

在 `backend/app/main.py` 注册异常处理器，直接返回 `JSONResponse(status_code=error.status_code, content=error.as_response())`。业务错误体严格为顶层 `code/message/fields/details`，不得套 FastAPI 的 `detail` 外壳。

`backend/app/services/course_policy.py` 定义不可变的 `CourseValue`、`CourseConflict`，并实现：

```python
def time_ranges_overlap(
    left_start: time,
    left_end: time,
    right_start: time,
    right_end: time,
) -> bool:
    return left_start < right_end and right_start < left_end


def detect_conflicts(
    *,
    candidate: CourseValue,
    existing: Sequence[CourseValue],
    max_week: int,
) -> list[CourseConflict]:
    candidate_weeks = parse_weeks(candidate.weeks, max_week=max_week)
    conflicts: list[CourseConflict] = []
    for item in existing:
        if candidate.course_id is not None and item.course_id == candidate.course_id:
            continue
        if item.weekday != candidate.weekday:
            continue
        if not time_ranges_overlap(
            candidate.start_time,
            candidate.end_time,
            item.start_time,
            item.end_time,
        ):
            continue
        overlap = sorted(
            candidate_weeks & parse_weeks(item.weeks, max_week=max_week)
        )
        if overlap:
            conflicts.append(
                CourseConflict(
                    course_id=item.course_id,
                    course_name=item.course_name,
                    overlap_weeks=overlap,
                )
            )
    return conflicts
```

课程策略还必须校验：

- 建筑存在；
- 教室 `strip()` 后非空；
- 教室不是 `待确认教室`、`待确认`、`未知`、`暂无` 等 legacy 占位词；
- `start_time < end_time`；
- 周次不超过学期 `total_weeks`；
- 尚未配置学期时返回 `semester_unconfigured`，引导用户先去课表页设置。

公开 `location_requires_review(room_name: str) -> bool`。`CourseRead` 增加计算字段 `needs_location_review`，让旧数据中的占位教室仍可见且能被前端引导修正；新建、编辑和导入都不得产生这种数据。

- [ ] **Step 4: 重构课程写入为“flush 不 commit”**

在 `backend/app/services/course_service.py` 提供：

```python
def add_course(
    session: Session,
    *,
    user_id: int,
    payload: CourseCreate,
    source_kind: str = "manual",
) -> Course:
    validate_course(session, user_id=user_id, payload=payload)
    course = Course(
        user_id=user_id,
        source_kind=source_kind,
        **payload.model_dump(),
    )
    session.add(course)
    session.flush()
    return course
```

`update_course` 同样只修改并 `flush()`；API 的 POST/PUT 成功路径各自 `session.commit()`，异常路径由依赖关闭会话前显式 `session.rollback()`。这样后续导入可复用同一规则而不产生部分提交。

把 `require_building`、`require_course_for_user` 的英文 `HTTPException.detail` 改为上述 `BusinessError` code，保证前端所有恢复动作都不依赖文案。

- [ ] **Step 5: 运行课程策略和 CRUD 回归**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_course_policy.py tests/test_courses.py -q
```

Expected: 全部通过，冲突返回 409，原有用户隔离测试保持通过。

- [ ] **Step 6: 提交后端课程裁决**

```powershell
git add backend/app/core/errors.py backend/app/schemas/error.py backend/app/services/course_policy.py backend/app/services/course_service.py backend/app/api/courses.py backend/app/schemas/course.py backend/app/main.py backend/tests/test_course_policy.py backend/tests/test_courses.py
git commit -m "feat(courses): 阻止不完整和冲突课程"
```

## Task 5: 让课表与出发建议只使用真实教学周

**Files:**

- Modify: `backend/app/services/schedule_service.py`
- Modify: `backend/app/api/schedule.py`
- Modify: `backend/app/schemas/schedule.py`
- Modify: `backend/tests/test_schedule.py`

- [ ] **Step 1: 写不跨周、单双周和学期状态失败测试**

在 `backend/tests/test_schedule.py` 增加：

```python
def test_next_course_skips_course_not_active_this_week(
    session, user, semester_setting, building
):
    add_course_fixture(
        session,
        user_id=user.id,
        building_id=building.id,
        weekday=1,
        start_time="09:00",
        end_time="10:00",
        weeks="3-20",
        room_name="A101",
    )
    result = find_next_course(
        session,
        user_id=user.id,
        now=datetime(2026, 9, 7, 8, 0, tzinfo=SHANGHAI_TZ),
    )
    assert result is None


def test_next_course_can_find_a_later_day_in_current_week(
    session, user, semester_setting, building
):
    add_course_fixture(
        session,
        user_id=user.id,
        building_id=building.id,
        weekday=3,
        start_time="09:00",
        end_time="10:00",
        weeks="2",
        room_name="A101",
    )
    result = find_next_course(
        session,
        user_id=user.id,
        now=datetime(2026, 9, 7, 8, 0, tzinfo=SHANGHAI_TZ),
    )
    assert result.start_at.date() == date(2026, 9, 9)
    assert result.teaching_week == 2


def test_next_course_does_not_cross_into_browsing_or_future_week(
    session, user, semester_setting, building
):
    add_course_fixture(
        session,
        user_id=user.id,
        building_id=building.id,
        weekday=1,
        start_time="09:00",
        end_time="10:00",
        weeks="3",
        room_name="A101",
    )
    result = find_next_course(
        session,
        user_id=user.id,
        now=datetime(2026, 9, 13, 20, 0, tzinfo=SHANGHAI_TZ),
    )
    assert result is None


def test_departure_requires_semester_configuration(client, auth_headers):
    response = client.post(
        "/api/schedule/suggestion",
        headers=auth_headers,
        json={"current_building_id": 1},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "semester_unconfigured"
```

还要覆盖：

- 学期前返回 `semester_not_active`；
- 学期后返回 `semester_not_active`；
- 本周后续无课但下周有课时仍返回明确的 `no_upcoming_course`；
- 响应中的 `target_building.name` 与 `next_course.room_name` 都非空；
- 旧课程若 `needs_location_review=True`，出发建议跳过并返回可恢复的 `course_location_incomplete`；
- 同一时间存在脏数据时返回 `schedule_conflict`，不得任意选一门。

- [ ] **Step 2: 运行并确认旧实现错误选择非当前周课程**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_schedule.py -q
```

Expected: 至少单双周过滤、不跨周、未配置学期三个测试失败。

- [ ] **Step 3: 重写下一课程选择**

在 `backend/app/services/schedule_service.py` 中：

1. 查询用户学期设置，没有时抛 `semester_unconfigured`；
2. 用 `now` 的上海本地日期解析真实当前周，学期前后抛 `semester_not_active`；
3. 一次性加载用户课程和建筑关系；
4. 只保留周集合包含真实当前周的课程；
5. 将 `location_requires_review(course.room_name)` 的旧课程单独记录并排除；
6. 只在当前教学周的周一至周日内生成候选日期，不跨入下周；
7. 当天只保留尚未开始的课程；
8. 最早候选仅因地点不完整被排除时抛 `course_location_incomplete` 并返回 `course_id`；
9. 同一最早开始时间若超过一门，抛 `schedule_conflict`；
10. 返回课程、目标建筑、完整教室、教学周和开始时间。

核心过滤函数写成可单测的纯函数：

```python
def course_occurs_on(
    course: Course,
    *,
    target_date: date,
    start_date: date,
    total_weeks: int,
) -> bool:
    state = resolve_semester_state(
        start_date=start_date,
        total_weeks=total_weeks,
        today=target_date,
    )
    if state.status != "active" or state.current_week is None:
        return False
    return (
        course.weekday == target_date.isoweekday()
        and state.current_week
        in parse_weeks(course.weeks, max_week=total_weeks)
    )
```

所有 datetime 响应都带 `+08:00`，不得使用服务器本地时区猜测。

- [ ] **Step 4: 更新响应 schema 和错误 code**

在 `backend/app/schemas/schedule.py` 的下一课程信息中加入：

```python
teaching_week: int
start_at: datetime
```

保留现有 `ScheduleSuggestionResponse.target_building` 和 `next_course.room_name`，不另造重复的扁平地点字段。在 `backend/app/api/schedule.py` 注入 `now: datetime = Depends(get_current_time)` 并传给 `build_schedule_suggestion`；删除对错误文本的包装，让 `BusinessError` 直接由全局处理器输出。

- [ ] **Step 5: 运行课表与出发建议测试**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_schedule.py tests/test_semester.py tests/test_courses.py -q
```

Expected: 全部通过。

- [ ] **Step 6: 提交真实教学周调度**

```powershell
git add backend/app/services/schedule_service.py backend/app/api/schedule.py backend/app/schemas/schedule.py backend/tests/test_schedule.py
git commit -m "fix(schedule): 按真实教学周生成出发建议"
```

## Task 6: 重做无损导入预览并支持 HTM/HTML/XLS/XLSX

**Files:**

- Modify: `backend/app/services/course_import_service.py`
- Modify: `backend/app/schemas/course_import.py`
- Modify: `backend/app/api/courses.py`
- Modify: `backend/tests/test_course_import.py`
- Create: `backend/tests/fixtures/import_schedule.html`
- Create: `backend/tests/fixtures/import_schedule.xlsx`
- Create: `backend/tests/fixtures/import_schedule.xls`

- [ ] **Step 1: 用固定样例定义“不得静默丢行”**

在 fixture 中准备三门有效课、一门地点缺教室课、一门无法识别时间课。原始地点包含：

```text
教3-205
实训大楼423-425数据中国实验室1
风雨操场东区
```

新增测试：

```python
@pytest.mark.parametrize(
    "filename",
    [
        "import_schedule.html",
        "import_schedule.xlsx",
        "import_schedule.xls",
    ],
)
def test_preview_preserves_every_candidate_row(client, auth_headers, filename):
    response = upload_preview(client, auth_headers, fixture_path(filename))
    assert response.status_code == 200
    body = response.json()
    assert body["file"]["filename"] == filename
    assert len(body["candidates"]) == 5
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


def test_preview_reports_unrecognized_and_incomplete_rows(client, auth_headers):
    response = upload_preview(
        client,
        auth_headers,
        fixture_path("import_schedule.html"),
    )
    candidates = response.json()["candidates"]
    assert candidates[3]["errors"][0]["code"] == "room_missing"
    assert candidates[4]["errors"][0]["code"] == "time_unrecognized"
    assert response.json()["can_commit"] is False
```

再断言每个候选均保存这六个原始字段：

```python
assert set(candidate["source"]) == {
    "raw_course_name",
    "raw_weekday",
    "raw_time_or_section",
    "raw_teacher",
    "raw_weeks",
    "raw_location",
}
```

- [ ] **Step 2: 运行并确认 XLS 不支持且异常行被跳过**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_course_import.py -q
```

Expected: `.xls` 解析失败，候选数量少于 5，或缺少逐行错误。

- [ ] **Step 3: 建立统一的导入中间模型**

在 `backend/app/services/course_import_service.py` 定义：

```python
@dataclass(frozen=True)
class RawCourseRow:
    row_ref: str
    raw_course_name: str
    raw_weekday: str
    raw_time_or_section: str
    raw_teacher: str
    raw_weeks: str
    raw_location: str


@dataclass(frozen=True)
class ImportIssue:
    code: str
    field: str
    message: str


@dataclass(frozen=True)
class ImportCandidate:
    source: RawCourseRow
    course_name: str | None
    weekday: int | None
    start_time: time | None
    end_time: time | None
    teacher: str | None
    weeks: str | None
    suggested_building_id: int | None
    suggested_room_name: str | None
    errors: tuple[ImportIssue, ...]
```

四类读取器都只负责产生 `RawCourseRow`：

- HTML/HTM：按 DOM 表格中课程候选单元格顺序编号；
- XLSX：用 openpyxl，坐标如 `sheet1!B4` 再稳定映射为 `row-1`；
- XLS：用 xlrd，保持同样遍历顺序；
- 不认识扩展名返回 415 和 `unsupported_import_format`。

解析器必须对每个非空候选块生成一项；识别失败写入 `errors`，不得 `continue` 后消失。

- [ ] **Step 4: 拆分地点但保留原文**

地点建议规则：

1. 从后端建筑列表中按“最长名称/别名优先”匹配；
2. 匹配到的建筑文本从原始地点头部去除；
3. 仅去除连接符、空格、中文括号；
4. 剩余完整文本作为建议教室，不再截断；
5. 建筑或教室任一为空都生成错误；
6. 原始 `raw_location` 永远不改写。

公开纯函数：

```python
def suggest_location(
    raw_location: str,
    buildings: Sequence[Building],
) -> tuple[int | None, str | None, tuple[ImportIssue, ...]]:
    normalized = normalize_location_spacing(raw_location)
    match = find_longest_building_match(normalized, buildings)
    if match is None:
        return None, None, (
            ImportIssue(
                code="building_unrecognized",
                field="building_id",
                message="无法从原始地点识别建筑",
            ),
        )
    room_name = remove_matched_building(normalized, match).strip(" -—·()（）")
    if not room_name:
        return match.id, None, (
            ImportIssue(
                code="room_missing",
                field="room_name",
                message="原始地点缺少教室信息",
            ),
        )
    return match.id, room_name, ()
```

- [ ] **Step 5: 更新 preview schema**

预览响应固定为：

```python
class ImportPreviewResponse(BaseModel):
    file: ImportFileInfo
    candidates: list[ImportCandidateResponse]
    can_commit: bool
```

`ImportFileInfo` 返回 `filename`、`sha256`、`candidate_count`；候选同时返回只读 `source`、建议映射和逐字段错误。只要任一候选有错误，`can_commit=False`。

- [ ] **Step 6: 运行四格式预览回归**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_course_import.py -q
```

Expected: HTML、HTM、XLS、XLSX 行数和原始字段一致；错误行存在且不可提交。

- [ ] **Step 7: 提交无损预览**

```powershell
git add backend/requirements.txt backend/app/services/course_import_service.py backend/app/schemas/course_import.py backend/app/api/courses.py backend/tests/test_course_import.py backend/tests/fixtures
git commit -m "feat(import): 提供四格式无损课程预览"
```

## Task 7: 实现后端整批校验和单事务导入

**Files:**

- Modify: `backend/app/services/course_import_service.py`
- Modify: `backend/app/services/course_service.py`
- Modify: `backend/app/api/courses.py`
- Modify: `backend/app/schemas/course_import.py`
- Modify: `backend/tests/test_course_import.py`

- [ ] **Step 1: 写防篡改、批内冲突和回滚测试**

新增测试：

```python
def test_import_reparses_uploaded_file_and_rejects_wrong_sha(
    client, auth_headers, valid_import_file
):
    response = commit_import(
        client,
        auth_headers,
        valid_import_file,
        sha256="0" * 64,
        resolutions=valid_resolutions(),
    )
    assert response.status_code == 409
    assert response.json()["code"] == "import_file_changed"


def test_import_internal_conflict_rolls_back_every_course(
    client, auth_headers, conflicting_import_file, db_session
):
    response = commit_import(
        client,
        auth_headers,
        conflicting_import_file,
        resolutions=conflicting_resolutions(),
    )
    assert response.status_code == 409
    assert response.json()["code"] == "course_conflict"
    assert db_session.query(Course).count() == 0
    assert db_session.query(CourseImportSource).count() == 0


def test_import_database_error_rolls_back_every_course(
    client, auth_headers, valid_import_file, monkeypatch, db_session
):
    monkeypatch.setattr(
        CourseImportSource,
        "__init__",
        raising_source_constructor,
    )
    response = commit_import(
        client,
        auth_headers,
        valid_import_file,
        resolutions=valid_resolutions(),
    )
    assert response.status_code == 500
    assert db_session.query(Course).count() == 0
```

还要覆盖：

- 任一 `row_ref` 缺失、重复或多余都返回 `import_resolution_mismatch`；
- 最终建筑/教室未解决返回 `import_unresolved`;
- 与数据库已有课程冲突时整批为 0；
- 成功导入 N 门就产生 N 条 `source_kind="import"` 课程和 N 条来源记录；
- 来源记录中的 filename、SHA256、row_ref、六个 raw 字段逐字等于原文件；
- 相同文件重复提交返回 `import_already_committed`，不能重复建课。

- [ ] **Step 2: 运行并确认旧逐门接口无法保证事务**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_course_import.py -q
```

Expected: `/api/courses/import` 不存在或回滚断言失败。

- [ ] **Step 3: 定义 multipart 提交协议**

在 `backend/app/schemas/course_import.py` 增加：

```python
class ImportResolution(BaseModel):
    row_ref: str
    building_id: int
    room_name: str = Field(min_length=1, max_length=120)

    @field_validator("room_name")
    @classmethod
    def trim_room_name(cls, value: str) -> str:
        result = value.strip()
        if not result:
            raise ValueError("room_name must not be blank")
        return result


class ImportCommitManifest(BaseModel):
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    resolutions: list[ImportResolution]


class ImportCommitResponse(BaseModel):
    created_count: int
    course_ids: list[int]
```

POST `/api/courses/import` 接收：

```python
file: Annotated[UploadFile, File()]
manifest: Annotated[str, Form()]
```

其中 `manifest` 内容是 `ImportCommitManifest` JSON。

- [ ] **Step 4: 实现重新解析、全量校验、一次提交**

服务顺序固定：

```python
def commit_import(
    session: Session,
    *,
    user_id: int,
    filename: str,
    content: bytes,
    manifest: ImportCommitManifest,
) -> list[Course]:
    actual_sha = hashlib.sha256(content).hexdigest()
    if actual_sha != manifest.sha256:
        raise import_file_changed()

    candidates = preview_import(
        session,
        user_id=user_id,
        filename=filename,
        content=content,
    )
    resolutions = match_resolutions(candidates, manifest.resolutions)
    resolved = resolve_all_candidates(candidates, resolutions)
    validate_no_existing_or_internal_conflicts(
        session,
        user_id=user_id,
        resolved=resolved,
    )
    ensure_file_not_committed(
        session,
        user_id=user_id,
        file_sha256=actual_sha,
    )

    created: list[Course] = []
    try:
        for item in resolved:
            course = add_course(
                session,
                user_id=user_id,
                payload=item.course,
                source_kind="import",
            )
            session.add(
                CourseImportSource(
                    course_id=course.id,
                    filename=filename,
                    file_sha256=actual_sha,
                    source_row=item.source.row_ref,
                    raw_course_name=item.source.raw_course_name,
                    raw_weekday=item.source.raw_weekday,
                    raw_time_or_section=item.source.raw_time_or_section,
                    raw_teacher=item.source.raw_teacher,
                    raw_weeks=item.source.raw_weeks,
                    raw_location=item.source.raw_location,
                )
            )
            created.append(course)
        session.commit()
    except Exception:
        session.rollback()
        raise
    return created
```

`validate_no_existing_or_internal_conflicts` 必须同时比较：

- 候选 vs 数据库已有课程；
- 候选 i vs 同批次 i+1..n；
- 冲突详情中附带两个 `row_ref`，让前端能定位。

- [ ] **Step 5: 运行导入事务和课程回归**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_course_import.py tests/test_courses.py -q
```

Expected: 全部通过，任何失败后的课程和来源记录数量都保持不变。

- [ ] **Step 6: 提交原子导入**

```powershell
git add backend/app/services/course_import_service.py backend/app/services/course_service.py backend/app/api/courses.py backend/app/schemas/course_import.py backend/tests/test_course_import.py
git commit -m "feat(import): 原子提交完整课程来源"
```

## Task 8: 统一前端业务错误、401 恢复和用户级缓存

**Files:**

- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/types/api.ts`
- Create: `frontend/src/api/errors.ts`
- Modify: `frontend/src/api/request.ts`
- Modify: `frontend/src/main.ts`
- Modify: `frontend/src/stores/auth.ts`
- Modify: `frontend/src/router/index.ts`
- Create: `frontend/src/utils/scopedStorage.ts`
- Create: `frontend/src/api/errors.test.ts`
- Create: `frontend/src/utils/scopedStorage.test.ts`
- Modify: `frontend/src/stores/auth.test.ts`
- Modify: `frontend/src/router/authGuard.test.ts`

- [ ] **Step 1: 安装组件测试依赖并写会话失败测试**

Run:

```powershell
cd frontend
npm install -D @vue/test-utils
```

创建 `frontend/vitest.config.ts`：

```typescript
import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'

import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      clearMocks: true,
    },
  }),
)
```

`frontend/src/test/setup.ts` 提供组件实际需要的浏览器接口：

```typescript
import { vi } from 'vitest'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  value: ResizeObserverMock,
  configurable: true,
})
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
  configurable: true,
})
Object.defineProperty(window, 'scrollTo', {
  value: vi.fn(),
  configurable: true,
})
```

把 `package.json` 的测试脚本改为 `"test": "vitest run"`，环境配置只保留一处。

`frontend/src/api/errors.test.ts`：

```typescript
import { describe, expect, it, vi } from 'vitest'

import {
  extractBusinessError,
  notifyUnauthorizedOnce,
  resetUnauthorizedState,
  setUnauthorizedHandler,
} from './errors'

describe('API errors', () => {
  it('extracts the backend business error contract', () => {
    expect(
      extractBusinessError({
        response: {
          status: 409,
          data: {
            code: 'course_conflict',
            message: '该时间与已有课程冲突',
            fields: ['weeks'],
            details: { overlap_weeks: [2] },
          },
        },
      }),
    ).toEqual({
      status: 409,
      code: 'course_conflict',
      message: '该时间与已有课程冲突',
      fields: ['weeks'],
      details: { overlap_weeks: [2] },
    })
  })

  it('runs one unauthorized recovery for concurrent 401 responses', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    setUnauthorizedHandler(handler)
    await Promise.all([
      notifyUnauthorizedOnce(),
      notifyUnauthorizedOnce(),
      notifyUnauthorizedOnce(),
    ])
    expect(handler).toHaveBeenCalledTimes(1)
    resetUnauthorizedState()
  })
})
```

`frontend/src/utils/scopedStorage.test.ts`：

```typescript
it('isolates the same key between users', () => {
  const first = createScopedStorage(10)
  const second = createScopedStorage(11)
  first.set('selected-week', '3')
  second.set('selected-week', '8')
  expect(first.get('selected-week')).toBe('3')
  expect(second.get('selected-week')).toBe('8')
  expect(localStorage.getItem('campusmind:10:selected-week')).toBe('3')
})
```

- [ ] **Step 2: 运行并确认模块缺失**

Run:

```powershell
cd frontend
npm test -- src/api/errors.test.ts src/utils/scopedStorage.test.ts
```

Expected: 新模块不存在导致失败。

- [ ] **Step 3: 建立稳定的错误类型和单次 401 协调器**

`frontend/src/types/api.ts`：

```typescript
export interface BusinessError {
  status: number
  code: string
  message: string
  fields: string[]
  details: Record<string, unknown>
}
```

`frontend/src/api/errors.ts` 公开：

```typescript
let unauthorizedHandler: (() => Promise<void>) | null = null
let unauthorizedPromise: Promise<void> | null = null
let unauthorizedHandled = false

export function setUnauthorizedHandler(handler: () => Promise<void>) {
  unauthorizedHandler = handler
}

export function notifyUnauthorizedOnce(): Promise<void> {
  if (!unauthorizedHandler) return Promise.resolve()
  if (unauthorizedHandled) {
    return unauthorizedPromise ?? Promise.resolve()
  }
  unauthorizedHandled = true
  unauthorizedPromise = unauthorizedHandler().finally(() => {
    unauthorizedPromise = null
  })
  return unauthorizedPromise
}

export function resetUnauthorizedState() {
  unauthorizedPromise = null
  unauthorizedHandled = false
}
```

`extractBusinessError` 只接受响应顶层结构正确的 `code/message/fields/details`；不正确时返回：

```typescript
{
  status,
  code: 'unexpected_error',
  message: '操作失败，请稍后重试',
  fields: [],
  details: {},
}
```

- [ ] **Step 4: 在请求层接入 401，在应用入口接入导航**

在 `frontend/src/api/request.ts` 添加 response interceptor：

```typescript
request.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      await notifyUnauthorizedOnce()
    }
    return Promise.reject(error)
  },
)
```

在 `frontend/src/main.ts` 的 Pinia 和 router 创建后注册：

```typescript
setUnauthorizedHandler(async () => {
  const auth = useAuthStore(pinia)
  const redirect = router.currentRoute.value.fullPath
  auth.clearSession()
  if (router.currentRoute.value.name !== 'login') {
    await router.replace({
      name: 'login',
      query: { redirect, reason: 'expired' },
    })
  }
})
```

登录成功后读取经过白名单校验的 `route.query.redirect`，只允许以 `/` 开头且不以 `//` 开头的站内路径；否则回首页。并发 401 只显示一次“登录已过期，请重新登录”。

登录成功后调用 `resetUnauthorizedState()`，让下一次真实会话过期可以再次触发恢复；handler 在应用生命周期内保持注册，不在 reset 时清空。

- [ ] **Step 5: 实现用户级存储并停止新增全局周次依赖**

`frontend/src/utils/scopedStorage.ts`：

```typescript
export function scopedStorageKey(userId: number, key: string): string {
  return `campusmind:${userId}:${key}`
}

export function createScopedStorage(userId: number) {
  return {
    get(key: string): string | null {
      return localStorage.getItem(scopedStorageKey(userId, key))
    },
    set(key: string, value: string): void {
      localStorage.setItem(scopedStorageKey(userId, key), value)
    },
    remove(key: string): void {
      localStorage.removeItem(scopedStorageKey(userId, key))
    },
  }
}
```

本任务只提供用户级存储基础并禁止新增 `campusmind-selected-week` 读取。现有 Courses/Home/login intro 的旧读取在 Task 9 和 Task 12 逐一迁移，最后再删除旧键；不得把旧值复制给任一当前用户。

- [ ] **Step 6: 运行错误、鉴权和路由测试**

Run:

```powershell
cd frontend
npm test -- src/api/errors.test.ts src/utils/scopedStorage.test.ts src/stores/auth.test.ts src/router/authGuard.test.ts
```

Expected: 全部通过，401 恢复只执行一次，站外 redirect 被拒绝。

- [ ] **Step 7: 提交前端会话边界**

```powershell
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/test/setup.ts frontend/src/types/api.ts frontend/src/api/errors.ts frontend/src/api/request.ts frontend/src/main.ts frontend/src/stores/auth.ts frontend/src/router/index.ts frontend/src/utils/scopedStorage.ts frontend/src/api/errors.test.ts frontend/src/utils/scopedStorage.test.ts frontend/src/stores/auth.test.ts frontend/src/router/authGuard.test.ts
git commit -m "fix(frontend): 统一登录过期和用户缓存边界"
```

## Task 9: 在课表页设置学期并分离真实周与浏览周

**Files:**

- Create: `frontend/src/types/semester.ts`
- Create: `frontend/src/api/semester.ts`
- Create: `frontend/src/api/semester.test.ts`
- Create: `frontend/src/stores/semester.ts`
- Create: `frontend/src/stores/semester.test.ts`
- Create: `frontend/src/components/course/SemesterSettingsCard.vue`
- Create: `frontend/src/components/course/SemesterSettingsCard.test.ts`
- Modify: `frontend/src/pages/CoursesPage.vue`
- Modify: `frontend/src/types/course.ts`
- Modify: `frontend/src/api/courses.ts`
- Modify: `frontend/src/utils/course.ts`
- Modify: `frontend/src/utils/course.test.ts`

- [ ] **Step 1: 写学期 store 和浏览周失败测试**

`frontend/src/stores/semester.test.ts`：

```typescript
it('uses current week only as the initial browsing week', async () => {
  vi.mocked(fetchSemester).mockResolvedValue({
    status: 'active',
    start_date: '2026-08-31',
    total_weeks: 20,
    current_week: 4,
  })
  const store = useSemesterStore()
  await store.load(12)
  expect(store.currentWeek).toBe(4)
  expect(store.browsingWeek).toBe(4)
  store.setBrowsingWeek(7)
  expect(store.currentWeek).toBe(4)
  expect(store.browsingWeek).toBe(7)
})


it('restores browsing week only for the same user', async () => {
  localStorage.setItem('campusmind:12:browsing-week', '9')
  localStorage.setItem('campusmind:13:browsing-week', '2')
  const store = useSemesterStore()
  await store.load(12)
  expect(store.browsingWeek).toBe(9)
})
```

组件测试必须验证：

- 未配置状态显示日期与总周数表单；
- 非周一日期前端立即提示；
- 保存期间按钮仍显示“正在保存”，文字不被 spinner 覆盖；
- active 状态明确显示“真实当前周：第 N 周”；
- before/after 状态不伪造当前周；
- 点击编辑能恢复原值。

- [ ] **Step 2: 运行并确认 store/component 不存在**

Run:

```powershell
cd frontend
npm test -- src/api/semester.test.ts src/stores/semester.test.ts src/components/course/SemesterSettingsCard.test.ts
```

Expected: 新模块不存在导致失败。

- [ ] **Step 3: 建立 typed API 和 Pinia store**

`frontend/src/types/semester.ts`：

```typescript
export type SemesterStatus =
  | 'unconfigured'
  | 'before_term'
  | 'active'
  | 'after_term'

export interface SemesterState {
  status: SemesterStatus
  start_date: string | null
  total_weeks: number | null
  current_week: number | null
}

export interface SemesterUpdate {
  start_date: string
  total_weeks: number
}
```

`frontend/src/api/semester.ts` 只公开：

```typescript
export async function fetchSemester(): Promise<SemesterState>
export async function saveSemester(
  payload: SemesterUpdate,
): Promise<SemesterState>
```

`useSemesterStore` state：

```typescript
state: () => ({
  semester: null as SemesterState | null,
  browsingWeek: 1,
  loading: false,
  saving: false,
  loadedForUserId: null as number | null,
})
```

规则：

- `currentWeek` getter 只来自 `semester.current_week`；
- `browsingWeek` 可独立修改；
- 加载新用户时重新读取用户级缓存；
- 缓存越界时回退到 `currentWeek ?? 1`；
- 保存学期后重新夹取浏览周到 `1..total_weeks`；
- logout 时 reset，不删除该用户自己的浏览偏好。

- [ ] **Step 4: 实现课表页学期设置卡**

`SemesterSettingsCard.vue` 发出：

```typescript
const emit = defineEmits<{
  save: [payload: SemesterUpdate]
}>()
```

可见状态必须包含：

- 未配置：`尚未设置学期，首页与出发建议暂不可用`；
- active：`真实当前周：第 {current_week} 周`；
- before_term：`学期尚未开始`；
- after_term：`本学期已结束`。

保存按钮结构保持文字与动画分层：

```vue
<button class="semester-save" :disabled="saving" type="submit">
  <span class="semester-save__label">
    {{ saving ? '正在保存' : '保存学期设置' }}
  </span>
  <span v-if="saving" class="semester-save__spinner" aria-hidden="true" />
</button>
```

spinner 只能占据右侧预留区域，不得绝对定位覆盖 `.semester-save__label`。

- [ ] **Step 5: 改造 CoursesPage 的周切换**

`CoursesPage.vue`：

1. 登录用户加载后调用 `semesterStore.load(user.id)`；
2. 顶部先展示 `SemesterSettingsCard`；
3. 未配置时仍允许设置，但不显示虚假的“当前周”；
4. 周切换读取/写入 `semesterStore.browsingWeek`；
5. 文案使用“浏览第 N 周”，真实周单独标注；
6. 切换周后 `window.scrollTo({ top: 0, behavior: 'smooth' })`；
7. 不把浏览周传给首页或 schedule API。

保留现有课程进入动画，但将持续时间控制在 `420–620ms`，并在 `prefers-reduced-motion: reduce` 时关闭位移。

- [ ] **Step 6: 运行学期前端和课程工具测试**

Run:

```powershell
cd frontend
npm test -- src/api/semester.test.ts src/stores/semester.test.ts src/components/course/SemesterSettingsCard.test.ts src/utils/course.test.ts
```

Expected: 全部通过。

- [ ] **Step 7: 提交课表学期体验**

```powershell
git add frontend/src/types/semester.ts frontend/src/api/semester.ts frontend/src/api/semester.test.ts frontend/src/stores/semester.ts frontend/src/stores/semester.test.ts frontend/src/components/course/SemesterSettingsCard.vue frontend/src/components/course/SemesterSettingsCard.test.ts frontend/src/pages/CoursesPage.vue frontend/src/types/course.ts frontend/src/api/courses.ts frontend/src/utils/course.ts frontend/src/utils/course.test.ts
git commit -m "feat(frontend): 在课表页管理真实教学周"
```

## Task 10: 强化手动课程表单和完整地点卡片

**Files:**

- Create: `frontend/src/components/course/CourseCard.vue`
- Create: `frontend/src/components/course/CourseCard.test.ts`
- Modify: `frontend/src/pages/CourseFormPage.vue`
- Create: `frontend/src/pages/CourseFormPage.test.ts`
- Modify: `frontend/src/pages/CoursesPage.vue`
- Modify: `frontend/src/pages/HomePage.vue`
- Modify: `frontend/src/api/courses.ts`
- Modify: `frontend/src/api/courses.test.ts`
- Modify: `frontend/src/types/course.ts`

- [ ] **Step 1: 写地点可见性和服务器冲突失败测试**

`frontend/src/components/course/CourseCard.test.ts`：

```typescript
it('renders building and full room as primary course information', () => {
  const wrapper = mount(CourseCard, {
    props: {
      course: {
        id: 7,
        course_name: '数据分析',
        weekday: 2,
        start_time: '08:00',
        end_time: '09:40',
        teacher: '陈老师',
        weeks: '1-16',
        building_id: 3,
        building: {
          id: 3,
          name: '实训大楼',
          type: '实训楼',
        },
        room_name: '423-425数据中国实验室1',
        source_kind: 'import',
        needs_location_review: false,
      },
    },
  })
  expect(wrapper.get('[data-testid="course-location"]').text()).toBe(
    '实训大楼 · 423-425数据中国实验室1',
  )
  expect(wrapper.get('[data-testid="course-location"]').attributes('title')).toBe(
    '实训大楼 · 423-425数据中国实验室1',
  )
})
```

`frontend/src/pages/CourseFormPage.test.ts` 通过 mock API 覆盖：

```typescript
it('does not submit without building and room', async () => {
  await wrapper.get('form').trigger('submit')
  expect(createCourse).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('请选择上课建筑')
  expect(wrapper.text()).toContain('请输入完整教室')
})


it('shows the structured conflict and keeps user input', async () => {
  vi.mocked(createCourse).mockRejectedValue(
    axiosBusinessError('course_conflict', '该时间与已有课程冲突', {
      conflicts: [
        {
          course_id: 3,
          course_name: '高等数学',
          overlap_weeks: [3, 4],
        },
      ],
    }),
  )
  await fillValidCourse(wrapper)
  await wrapper.get('form').trigger('submit')
  expect(wrapper.text()).toContain('与“高等数学”在第 3、4 周冲突')
  expect(
    (wrapper.get('[name="course_name"]').element as HTMLInputElement).value,
  ).toBe('数据分析')
})
```

- [ ] **Step 2: 运行并确认旧表单只警告仍提交**

Run:

```powershell
cd frontend
npm test -- src/components/course/CourseCard.test.ts src/pages/CourseFormPage.test.ts src/api/courses.test.ts
```

Expected: 组件不存在或表单仍走客户端 `findCourseTimeOverlap` 警告路径。

- [ ] **Step 3: 使用结构化 API 错误，不再客户端放行冲突**

在 `CourseFormPage.vue`：

- 删除 `findCourseTimeOverlap` 及“继续保存”分支；
- 建筑与教室均为必填；
- 周次输入保留用户原值，提交后使用后端返回的规范值；
- 捕获错误时调用 `extractBusinessError`；
- `course_conflict` 展开冲突课程和交集周；
- `semester_unconfigured` 展示“先设置学期”并链接到 `/courses#semester-settings`；
- 其他业务错误显示 `message`，不匹配英文字符串；
- 请求失败后表单内容不清空。

在 `frontend/src/types/course.ts` 同步后端契约：

```typescript
export type CourseSourceKind = 'manual' | 'import'

export type Course = {
  id: number
  course_name: string
  weekday: number
  start_time: string
  end_time: string
  building_id: number
  building: CourseBuilding
  room_name: string
  teacher: string | null
  weeks: string
  source_kind: CourseSourceKind
  needs_location_review: boolean
  created_at: string
}
```

`CoursePayload.weeks` 同样改为必填 `string`，不得再发送 `null`。

提交按钮必须保持可读：

```vue
<button class="course-submit" type="submit" :disabled="submitting">
  <span>{{ submitting ? '正在保存课程' : '保存课程' }}</span>
  <span v-if="submitting" class="course-submit__dot" aria-hidden="true" />
</button>
```

- [ ] **Step 4: 提取并复用 CourseCard**

`CourseCard.vue` props：

```typescript
defineProps<{
  course: Course
  compact?: boolean
}>()
```

地点固定作为课程名之后的第二层主信息，不得藏在 tooltip、折叠区或仅显示建筑。窄屏允许换行，不使用单行省略号；`overflow-wrap: anywhere` 防止长实验室名挤出卡片。

若 `needs_location_review=true`，卡片仍显示数据库原值，同时显示高对比度“地点需修正”和编辑入口；不得用空白、默认教室或隐藏卡片掩盖旧数据。

在 `CoursesPage.vue` 和 `HomePage.vue` 替换重复卡片模板。浏览课表时保留完整周次、教师、时间和 `source_kind` 标签。

- [ ] **Step 5: 运行表单、卡片和课程 API 测试**

Run:

```powershell
cd frontend
npm test -- src/components/course/CourseCard.test.ts src/pages/CourseFormPage.test.ts src/api/courses.test.ts
```

Expected: 全部通过。

- [ ] **Step 6: 提交课程输入与地点展示**

```powershell
git add frontend/src/components/course/CourseCard.vue frontend/src/components/course/CourseCard.test.ts frontend/src/pages/CourseFormPage.vue frontend/src/pages/CourseFormPage.test.ts frontend/src/pages/CoursesPage.vue frontend/src/pages/HomePage.vue frontend/src/api/courses.ts frontend/src/api/courses.test.ts frontend/src/types/course.ts
git commit -m "fix(frontend): 强制完整课程地点和冲突反馈"
```

## Task 11: 重做前端导入为只读原文、显式映射和一次提交

**Files:**

- Create: `frontend/src/types/courseImport.ts`
- Modify: `frontend/src/api/courses.ts`
- Modify: `frontend/src/api/courses.test.ts`
- Create: `frontend/src/components/import/ImportCandidateCard.vue`
- Create: `frontend/src/components/import/ImportCandidateCard.test.ts`
- Create: `frontend/src/components/import/ImportSummary.vue`
- Create: `frontend/src/components/import/ImportSummary.test.ts`
- Modify: `frontend/src/pages/CourseImportPage.vue`
- Create: `frontend/src/pages/CourseImportPage.test.ts`

- [ ] **Step 1: 写“原文不可改、未解决不可提交”的失败测试**

`ImportCandidateCard.test.ts`：

```typescript
it('renders source fields as read-only text and mapping as controls', () => {
  const wrapper = mountCandidate({
    source: {
      raw_course_name: '数据分析',
      raw_weekday: '星期二',
      raw_time_or_section: '第1-2节',
      raw_teacher: '陈老师',
      raw_weeks: '1-16周',
      raw_location: '实训大楼423-425数据中国实验室1',
    },
  })
  expect(wrapper.get('[data-testid="raw-location"]').text()).toBe(
    '实训大楼423-425数据中国实验室1',
  )
  expect(wrapper.find('[data-testid="raw-location"] input').exists()).toBe(false)
  expect(wrapper.get('[name="building_id"]').exists()).toBe(true)
  expect(wrapper.get('[name="room_name"]').exists()).toBe(true)
})
```

`CourseImportPage.test.ts`：

```typescript
it('keeps commit disabled while any row is unresolved', async () => {
  vi.mocked(previewCourseImport).mockResolvedValue(previewWithOneRoomError)
  await chooseFixtureFile(wrapper)
  const button = wrapper.get('[data-testid="commit-import"]')
  expect(button.attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('还有 1 门课程需要处理')
})


it('submits the original file once with all resolutions', async () => {
  vi.mocked(commitCourseImport).mockResolvedValue({
    created_count: 2,
    course_ids: [31, 32],
  })
  await resolveEveryCandidate(wrapper)
  await wrapper.get('[data-testid="commit-import"]').trigger('click')
  expect(commitCourseImport).toHaveBeenCalledTimes(1)
  expect(createCourse).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 运行并确认页面仍逐门调用 createCourse**

Run:

```powershell
cd frontend
npm test -- src/components/import/ImportCandidateCard.test.ts src/components/import/ImportSummary.test.ts src/pages/CourseImportPage.test.ts src/api/courses.test.ts
```

Expected: 新组件不存在或 `createCourse` 被调用多次。

- [ ] **Step 3: 定义导入类型和 multipart API**

`frontend/src/types/courseImport.ts` 包含：

```typescript
export interface ImportSourceFields {
  raw_course_name: string
  raw_weekday: string
  raw_time_or_section: string
  raw_teacher: string
  raw_weeks: string
  raw_location: string
}

export interface ImportIssue {
  code: string
  field: string
  message: string
}

export interface ImportCandidate {
  row_ref: string
  source: ImportSourceFields
  course_name: string | null
  weekday: number | null
  start_time: string | null
  end_time: string | null
  teacher: string | null
  weeks: string | null
  suggested_building_id: number | null
  suggested_room_name: string | null
  errors: ImportIssue[]
}

export interface ImportResolution {
  row_ref: string
  building_id: number
  room_name: string
}
```

API：

```typescript
export async function previewCourseImport(
  file: File,
): Promise<ImportPreviewResponse>

export async function commitCourseImport(
  file: File,
  sha256: string,
  resolutions: ImportResolution[],
): Promise<ImportCommitResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('manifest', JSON.stringify({ sha256, resolutions }))
  const response = await request.post<ImportCommitResponse>(
    '/api/courses/import',
    form,
  )
  return response.data
}
```

- [ ] **Step 4: 拆出候选卡和汇总组件**

`ImportCandidateCard`：

- 六个原始字段使用 `<dl>` 展示并标记“文件原文”；
- 建筑选择和教室输入放在“执行映射”分组；
- 教室初值完整复制 `suggested_room_name`；
- 每个 error 贴近对应映射字段；
- 不把后端 error 仅用颜色表达，必须带文字和图标；
- 长地点自然换行。

`ImportSummary` 显示：

- 文件名；
- 识别总数；
- 已解决数；
- 待处理数；
- 冲突数；
- “全部校验通过”或明确阻断原因。

- [ ] **Step 5: 重写 CourseImportPage 状态机**

页面状态仅允许：

```typescript
type ImportPageState =
  | 'idle'
  | 'previewing'
  | 'needs_resolution'
  | 'ready'
  | 'committing'
  | 'success'
  | 'failed'
```

规则：

1. 保存原始 `File` 对象，不生成新文件；
2. 预览响应生成独立 resolution map；
3. 原始 source 对象不被表单双向绑定；
4. 只有每行建筑、教室和解析字段都有效且无冲突才进入 ready；
5. 提交只调用一次 `commitCourseImport`；
6. 409 时按 `details.row_ref` 定位并滚动到对应卡片；
7. 成功后展示导入数量，用户确认后再导航到 `/courses`；
8. 支持格式文案严格写 `HTM / HTML / XLS / XLSX`。

- [ ] **Step 6: 运行导入 UI 和 API 测试**

Run:

```powershell
cd frontend
npm test -- src/components/import/ImportCandidateCard.test.ts src/components/import/ImportSummary.test.ts src/pages/CourseImportPage.test.ts src/api/courses.test.ts
```

Expected: 全部通过；测试中 `createCourse` 调用次数必须为 0。

- [ ] **Step 7: 提交原子导入界面**

```powershell
git add frontend/src/types/courseImport.ts frontend/src/api/courses.ts frontend/src/api/courses.test.ts frontend/src/components/import frontend/src/pages/CourseImportPage.vue frontend/src/pages/CourseImportPage.test.ts
git commit -m "feat(frontend): 重做无损课表导入流程"
```

## Task 12: 统一首页、课表和出发建议的真实周状态

**Files:**

- Create: `frontend/src/components/course/SemesterGate.vue`
- Create: `frontend/src/components/course/SemesterGate.test.ts`
- Modify: `frontend/src/pages/HomePage.vue`
- Create: `frontend/src/pages/HomePage.test.ts`
- Modify: `frontend/src/pages/LoginPage.vue`
- Modify: `frontend/src/pages/SchedulePage.vue`
- Create: `frontend/src/pages/SchedulePage.test.ts`
- Modify: `frontend/src/api/schedule.ts`
- Modify: `frontend/src/api/schedule.test.ts`
- Modify: `frontend/src/types/schedule.ts`
- Modify: `frontend/src/utils/schedule.ts`
- Modify: `frontend/src/utils/schedule.test.ts`
- Modify: `frontend/src/utils/loginIntro.ts`
- Modify: `frontend/src/utils/loginIntro.test.ts`
- Modify: `frontend/src/utils/course.ts`
- Modify: `frontend/src/utils/course.test.ts`

- [ ] **Step 1: 写未配置、真实周和完整终点失败测试**

`SemesterGate.test.ts`：

```typescript
it('links unconfigured users to timetable settings', () => {
  const wrapper = mount(SemesterGate, {
    props: { status: 'unconfigured' },
    global: { plugins: [router] },
  })
  expect(wrapper.text()).toContain('请先设置学期')
  expect(wrapper.get('a').attributes('href')).toContain(
    '/courses#semester-settings',
  )
})
```

`HomePage.test.ts`：

```typescript
it('uses semester current week and ignores browsing week', async () => {
  semesterStore.semester = activeSemester(4)
  semesterStore.browsingWeek = 9
  vi.mocked(fetchCourses).mockResolvedValue([
    course({ id: 4, weeks: '4' }),
    course({ id: 9, weeks: '9' }),
  ])
  const wrapper = await mountHome()
  expect(wrapper.text()).toContain('第 4 周')
  expect(wrapper.text()).toContain('课程 4')
  expect(wrapper.text()).not.toContain('课程 9')
})
```

`SchedulePage.test.ts` 覆盖：

- 未配置时不请求 departure API；
- `semester_not_active` 显示学期前/后状态；
- `no_upcoming_course` 显示“本周暂无后续课程”；
- `course_location_incomplete` 显示具体课程并提供编辑地点入口；
- 正常建议显示 `建筑 · 完整教室`；
- 不再预加载全部课程来猜是否有课；
- 错误分支只判断 `code`。

`loginIntro.test.ts` 增加：

```typescript
it('builds the login snapshot from the real current week', async () => {
  const introStorage = createStorage()
  await prepareLoginIntro(
    async () => [
      createCourse({ course_name: '真实周课程', weeks: '4' }),
      createCourse({ course_name: '浏览周课程', weeks: '9' }),
    ],
    async () => ({
      status: 'active',
      start_date: '2026-08-31',
      total_weeks: 20,
      current_week: 4,
    }),
    {
      introStorage,
      now: new Date('2026-09-21T07:00:00+08:00'),
    },
  )
  expect(consumeLoginIntroSnapshot(introStorage)?.courseName).toBe(
    '真实周课程',
  )
})
```

- [ ] **Step 2: 运行并确认首页仍读取浏览周、课表仍匹配英文错误文本**

Run:

```powershell
cd frontend
npm test -- src/components/course/SemesterGate.test.ts src/pages/HomePage.test.ts src/pages/SchedulePage.test.ts src/api/schedule.test.ts src/utils/schedule.test.ts src/utils/loginIntro.test.ts src/utils/course.test.ts
```

Expected: 首页真实周断言或结构化错误断言失败。

- [ ] **Step 3: 实现可复用学期状态门**

`SemesterGate.vue` 接受：

```typescript
defineProps<{
  status: SemesterStatus
  currentWeek?: number | null
}>()
```

slots：

- `default`：active 时渲染业务内容；
- `before-term`；
- `after-term`。

未配置状态内置清晰的设置入口。组件不能替 active 状态推测周数。

- [ ] **Step 4: 改造首页为真实周摘要**

`HomePage.vue`：

1. 登录用户确定后加载 semester；
2. active 时只使用 `semester.current_week` 过滤课程；
3. 不读取 scoped `browsing-week`；
4. 课程卡显示建筑和完整教室；
5. 周次切换仅在课表页存在；
6. 进入动画按卡片顺序错峰 `60–90ms`，单卡持续 `480–620ms`；
7. 动画只改变 `transform/opacity`，不改变文字颜色或叠加高亮遮罩。

同时把 `prepareLoginIntro` 改为接收 `loadCourses` 和 `loadSemester` 两个函数；只在 `semester.status === "active"` 时用 `current_week` 生成课程快照，否则播放不含猜测课程的通用登录动画。`LoginPage.vue` 登录成功后调用这个新签名，不能读取浏览周。

- [ ] **Step 5: 改造出发建议页为后端裁决**

`SchedulePage.vue`：

- 加载 semester 只用于页面 gate 和提示；
- active 时直接调用 departure API；
- 删除“先拉全部课程、再判断空列表”；
- 对 `semester_unconfigured`、`semester_not_active`、`no_upcoming_course`、`course_location_incomplete`、`schedule_conflict` 分别渲染恢复路径；
- 成功卡片以 `target_building.name · next_course.room_name` 作为主终点；
- 倒计时不改写课程开始时间；
- 页面切换和底部 tab 切换后回顶部。

`frontend/src/types/schedule.ts` 与后端字段逐一同名：

```typescript
export interface NextCourseInfo {
  id: number
  course_name: string
  weekday: number
  start_time: string
  end_time: string
  teacher: string | null
  weeks: string
  teaching_week: number
  room_name: string
  start_at: string
}
```

保留现有 `ScheduleSuggestion.target_building` 类型；建筑名和坐标继续从该对象读取，避免同一响应内出现两份可能不一致的建筑字段。

完成 Home 和 login intro 迁移后，从 `frontend/src/utils/course.ts` 删除 `SELECTED_WEEK_STORAGE_KEY`、`readSelectedWeek`、`writeSelectedWeek`，同步删除旧测试，并执行 `localStorage.removeItem("campusmind-selected-week")` 一次性清理旧键。

- [ ] **Step 6: 运行核心页面测试**

Run:

```powershell
cd frontend
npm test -- src/components/course/SemesterGate.test.ts src/pages/HomePage.test.ts src/pages/SchedulePage.test.ts src/api/schedule.test.ts src/utils/schedule.test.ts src/utils/loginIntro.test.ts src/utils/course.test.ts
```

Expected: 全部通过。

- [ ] **Step 7: 提交真实周页面闭环**

```powershell
git add frontend/src/components/course/SemesterGate.vue frontend/src/components/course/SemesterGate.test.ts frontend/src/pages/HomePage.vue frontend/src/pages/HomePage.test.ts frontend/src/pages/LoginPage.vue frontend/src/pages/SchedulePage.vue frontend/src/pages/SchedulePage.test.ts frontend/src/api/schedule.ts frontend/src/api/schedule.test.ts frontend/src/types/schedule.ts frontend/src/utils/schedule.ts frontend/src/utils/schedule.test.ts frontend/src/utils/loginIntro.ts frontend/src/utils/loginIntro.test.ts frontend/src/utils/course.ts frontend/src/utils/course.test.ts
git commit -m "fix(frontend): 统一首页和出发建议教学周"
```

## Task 13: 建立文字可读性、动画和移动端端到端发布门槛

**Files:**

- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/src/styles/fresh.css`
- Modify: `frontend/src/styles/base.css`
- Create: `frontend/src/utils/contrast.ts`
- Create: `frontend/src/utils/contrast.test.ts`
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/core-journey.spec.ts`
- Create: `frontend/e2e/fixtures/import-schedule.html`
- Create: `backend/tools/run_e2e_server.py`

- [ ] **Step 1: 安装浏览器测试依赖并写颜色 token 失败测试**

Run:

```powershell
cd frontend
npm install -D @playwright/test @axe-core/playwright cross-env
npx playwright install chromium
```

`frontend/src/utils/contrast.test.ts`：

```typescript
import { contrastRatio } from './contrast'

it.each([
  ['#26362a', '#ffffff'],
  ['#26362a', '#f3f7f0'],
  ['#26362a', '#fff1d3'],
  ['#536657', '#ffffff'],
])('keeps %s readable on %s', (foreground, background) => {
  expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5)
})
```

再扫描 `fresh.css` 中声明的 `--text-*` 与 `--surface-*` 配对，防止未来新增卡片颜色绕过测试。

- [ ] **Step 2: 运行并确认 contrast 工具缺失**

Run:

```powershell
cd frontend
npm test -- src/utils/contrast.test.ts
```

Expected: `contrast.ts` 不存在导致失败。

- [ ] **Step 3: 固定可读颜色和动画约束**

`contrast.ts` 实现 WCAG 相对亮度和：

```typescript
export function contrastRatio(
  foreground: string,
  background: string,
): number {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (light + 0.05) / (dark + 0.05)
}
```

`fresh.css` 统一：

```css
:root {
  --text-primary: #26362a;
  --text-secondary: #536657;
  --surface-page: #f7f5ef;
  --surface-card: #ffffff;
  --surface-mint: #f3f7f0;
  --surface-sun: #fff1d3;
  --motion-enter-duration: 560ms;
  --motion-stagger: 72ms;
}
```

禁止以下模式：

- light surface 继承 `color: #fff`；
- `::before`/`::after` 高亮层 `z-index` 高于文字；
- loading overlay 覆盖按钮 label；
- opacity 动画作用于包含文字的父级并停在 `< 1`；
- disabled 文字对比度低于 4.5:1。

所有装饰层使用 `pointer-events: none`，文字容器显式 `position: relative; z-index: 1`。`prefers-reduced-motion` 下持续时间降为 `1ms`、位移归零。

- [ ] **Step 4: 创建隔离的 E2E 后端启动器**

`backend/tools/run_e2e_server.py`：

```python
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


BACKEND_ROOT = Path(__file__).resolve().parents[1]
DATABASE_PATH = BACKEND_ROOT / ".pytest_cache" / "campusmind-e2e.db"
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
if DATABASE_PATH.exists():
    DATABASE_PATH.unlink()

os.environ["DATABASE_URL"] = f"sqlite:///{DATABASE_PATH.as_posix()}"
os.environ["CORS_ALLOW_ORIGINS"] = "http://127.0.0.1:5179"
os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "60"

import uvicorn

from app.core.clock import get_current_time
from app.db.seed import initialize_database
from app.main import app


if __name__ == "__main__":
    initialize_database(os.environ["DATABASE_URL"])
    fixed_now = datetime(
        2026,
        9,
        21,
        7,
        0,
        tzinfo=ZoneInfo("Asia/Shanghai"),
    )
    app.dependency_overrides[get_current_time] = lambda: fixed_now
    uvicorn.run(app, host="127.0.0.1", port=8010)
```

E2E 只使用 `.pytest_cache/campusmind-e2e.db`，不能接触 `backend/data/`。

在 `frontend/package.json` 增加：

```json
{
  "scripts": {
    "dev:e2e": "cross-env VITE_API_BASE_URL=http://127.0.0.1:8010 vite --host 127.0.0.1 --port 5179",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 5: 配置 390×844 Playwright 和双服务**

`frontend/playwright.config.ts`：

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5179',
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: '.\\.venv\\Scripts\\python.exe tools\\run_e2e_server.py',
      cwd: '../backend',
      url: 'http://127.0.0.1:8010/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:e2e',
      cwd: '.',
      url: 'http://127.0.0.1:5179',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
})
```

- [ ] **Step 6: 写完整用户链路和可访问性测试**

`frontend/e2e/core-journey.spec.ts` 必须顺序完成：

1. 注册唯一账号并自动登录；
2. 课表页设置 `2026-08-31` 为开学日期，确认服务器固定时刻对应第 4 周；
3. 新建一门周一 09:00、周次含第 4 周且含完整建筑/教室的课程；
4. 新建时间与周次冲突课程，确认 409 且列表数量不变；
5. 上传 fixture，修正映射，一次导入；
6. 课表卡片看到完整地点；
7. 手动浏览另一周后转到首页，首页仍显示真实周；
8. 出发建议看到完整终点建筑和教室；
9. 模拟无效 token，并发触发两个请求，只出现一次过期提示；
10. 登录后返回原页面；
11. 每个关键状态运行 axe：

```typescript
const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa'])
  .analyze()
expect(results.violations).toEqual([])
```

12. 截图：
    - `login.png`
    - `semester-unconfigured.png`
    - `course-list.png`
    - `import-needs-resolution.png`
    - `home-current-week.png`
    - `departure-advice.png`
    - `session-expired.png`

测试额外检查所有可见按钮文字未被遮挡：

```typescript
for (const button of await page.getByRole('button').all()) {
  if (!(await button.isVisible())) continue
  const label = (await button.innerText()).trim()
  expect(label.length).toBeGreaterThan(0)
  const box = await button.boundingBox()
  expect(box?.width).toBeGreaterThan(44)
  expect(box?.height).toBeGreaterThanOrEqual(40)
}
```

- [ ] **Step 7: 运行视觉 token、构建和 E2E**

Run:

```powershell
cd frontend
npm test -- src/utils/contrast.test.ts
npm run build
npm run test:e2e
```

Expected: 单测、TypeScript 构建、移动端完整链路、axe 检查全部通过；截图中文字清晰且地点未截断。

- [ ] **Step 8: 提交发布门槛**

```powershell
git add backend/tools/run_e2e_server.py frontend/package.json frontend/package-lock.json frontend/src/styles/fresh.css frontend/src/styles/base.css frontend/src/utils/contrast.ts frontend/src/utils/contrast.test.ts frontend/playwright.config.ts frontend/e2e
git commit -m "test(e2e): 覆盖核心用户链路和文字可读性"
```

## Task 14: 全量回归、迁移演练和交付检查

**Files:**

- Modify only if tests reveal a scoped defect
- Inspect: `backend/data/` without staging it
- Inspect: `git status --short`

- [ ] **Step 1: 从旧 schema 副本演练升级**

复制本地数据库到 `.pytest_cache/migration-rehearsal.db`，只对副本运行：

```powershell
cd backend
$env:DATABASE_URL='sqlite:///./.pytest_cache/migration-rehearsal.db'
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\alembic.exe current
Remove-Item Env:DATABASE_URL
```

Expected: current 为 `20260720_01 (head)`；原数据库不变。随后用 SQLAlchemy inspector 检查新表、索引、`source_kind` 和旧数据行数。

- [ ] **Step 2: 运行后端全量回归**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

Expected: 全部通过；若仍只有已知 Starlette/httpx 第三方弃用警告，在交付说明中注明，不把它误报为本次回归失败。

- [ ] **Step 3: 运行前端全量单测和构建**

Run:

```powershell
cd frontend
npm test
npm run build
```

Expected: 全部 Vitest 通过，Vite production build 成功，无 TypeScript 错误。

- [ ] **Step 4: 运行移动端 E2E**

Run:

```powershell
cd frontend
npm run test:e2e
```

Expected: 完整核心链路、401 恢复、axe 和截图全部通过。

- [ ] **Step 5: 人工核对七个高风险状态**

在 390×844 和 430×932 两个 viewport 检查：

1. 登录按钮 loading 动画不盖文字；
2. 学期未配置/学期前/学期后均有明确入口；
3. 长课程名和长教室名换行后仍完整；
4. 选中周、按钮 pressed、disabled、error、loading 状态文字都可读；
5. 下方 tab 切换后页面回到顶部；
6. 导入原文与执行映射能明显区分；
7. 滚动进入动画有痕迹但不拖慢操作，reduced-motion 正常。

- [ ] **Step 6: 检查提交范围**

Run:

```powershell
git status --short
git diff --check
git log --oneline --max-count=16
```

Expected:

- `git diff --check` 无输出；
- `backend/data/` 和现存两份大数据报告仍为未跟踪且未暂存；
- 只包含本计划列出的代码、测试、迁移和文档；
- 没有 `.env`、数据库、Playwright trace 或截图临时产物。

- [ ] **Step 7: 最终修复提交（仅在全量验证产生必要改动时）**

先用 `git diff --name-only` 取得本轮验证实际修改的文件，然后逐个用完整路径执行 `git add`；复查暂存区不含 `backend/data/` 和两份大数据报告后执行：

```powershell
git commit -m "fix(core): 修正核心链路回归问题"
```

若工作树没有新的已跟踪改动，跳过此提交，不创建空 commit。

## 完成定义

- 后端是学期状态、真实教学周、课程周次、冲突和地点完整性的唯一裁决者。
- 手动创建、更新、导入和出发建议使用同一套课程策略。
- 导入支持 HTM/HTML/XLS/XLSX，候选不静默消失，原文字段可追溯，整批失败时数据库零变化。
- 浏览周不会污染首页或出发建议。
- token 过期只触发一次恢复流程，重新登录后返回原页面。
- 所有课程主视图均展示“建筑 · 完整教室”。
- 正常、选中、禁用、加载、错误状态文字对比度满足 WCAG AA，动画层不遮字。
- 后端 pytest、前端 Vitest、生产构建、390×844 Playwright + axe 全部通过。
