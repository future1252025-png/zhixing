# 智行 CampusMind FastAPI 后端任务清单

## 1. 后端目标

使用 FastAPI + SQLAlchemy + SQLite 实现 P0 HTTP API。后端负责认证、建筑、留言、课程、下一节课识别和出发建议规则计算。

## 2. 推荐目录

```text
backend/app/
  core/
  db/
  models/
  schemas/
  routers/
  services/
  tests/
  main.py
```

## 3. 基础任务

| 模块 | 文件 | 验收 |
|---|---|---|
| App 入口 | `backend/app/main.py` | `/api/health` 可访问 |
| 配置 | `backend/app/core/config.py` | 数据库路径、JWT 配置集中管理 |
| 数据库 | `backend/app/db/session.py` | 可连接 SQLite |
| Base | `backend/app/db/base.py` | 模型能统一建表 |
| 通用响应 | `backend/app/schemas/common.py` | 响应格式一致 |

验证命令：

```powershell
cd backend
.\.venv\Scripts\pytest app/tests/test_health.py -v
.\.venv\Scripts\uvicorn app.main:app --reload
```

## 4. Auth 模块

**接口：**

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

**文件：**

- `backend/app/models/user.py`
- `backend/app/schemas/auth.py`
- `backend/app/core/security.py`
- `backend/app/services/auth_service.py`
- `backend/app/routers/auth.py`
- `backend/app/tests/test_auth.py`

**服务要求：**

- 密码必须哈希保存。
- 登录成功返回 JWT 和用户信息。
- `/me` 需要 token。
- 用户名重复时返回清晰错误。

**测试要求：**

- 注册成功。
- 重复用户名失败。
- 登录成功。
- 错误密码失败。
- 无 token 访问 `/me` 失败。
- 有 token 访问 `/me` 成功。

## 5. Buildings 模块

**接口：**

- `GET /api/buildings`
- `GET /api/buildings/{building_id}`

**文件：**

- `backend/app/models/building.py`
- `backend/app/schemas/building.py`
- `backend/app/routers/buildings.py`
- `backend/app/db/seed.py`
- `backend/app/tests/test_buildings.py`

**服务要求：**

- 返回建筑列表。
- 返回建筑详情。
- 建筑不存在时返回 404。
- 第一版建筑数据由 seed 维护。

**测试要求：**

- 列表至少包含 8 个 seed 建筑。
- 详情返回名称、类型、简介、坐标。
- 不存在 ID 返回错误。

## 6. Messages 模块

**接口：**

- `GET /api/buildings/{building_id}/messages`
- `POST /api/buildings/{building_id}/messages`

**文件：**

- `backend/app/models/message.py`
- `backend/app/schemas/message.py`
- `backend/app/routers/messages.py`
- `backend/app/tests/test_messages.py`

**服务要求：**

- 读取某建筑留言。
- 登录用户可发布留言。
- 空内容或超长内容应失败。
- 返回显示名默认可用“匿名同学”或用户昵称。
- 不使用 WebSocket。

**测试要求：**

- 读取 seed 留言。
- 登录用户发布成功。
- 未登录发布失败。
- 空内容发布失败。

## 7. Courses 模块

**接口：**

- `GET /api/courses`
- `POST /api/courses`
- `PUT /api/courses/{course_id}`
- `DELETE /api/courses/{course_id}`

**文件：**

- `backend/app/models/course.py`
- `backend/app/schemas/course.py`
- `backend/app/routers/courses.py`
- `backend/app/tests/test_courses.py`

**服务要求：**

- 课程归属当前用户。
- 新增课程必须选择有效建筑。
- 只能修改和删除自己的课程。
- 时间使用 `HH:MM` 字符串，星期使用 1-7。

**测试要求：**

- 新增课程成功。
- 获取当前用户课程成功。
- 修改课程成功。
- 删除课程成功。
- 无权操作他人课程失败。

## 8. Schedule 模块

**接口：**

- `GET /api/schedule/next`
- `POST /api/schedule/suggestion`

**文件：**

- `backend/app/schemas/schedule.py`
- `backend/app/services/schedule_service.py`
- `backend/app/services/location_service.py`
- `backend/app/routers/schedule.py`
- `backend/app/tests/test_schedule.py`

**服务要求：**

- 根据当前星期和时间识别下一节课。
- 当前日无后续课程时返回明确状态。
- 支持经纬度输入。
- 支持 `current_building_id` 手动位置输入。
- 使用固定步行速度和缓冲时间计算建议。

**测试要求：**

- 当前时间前后的课程排序正确。
- 无后续课程返回空建议或明确消息。
- 坐标输入能生成距离和建议出发时间。
- 建筑 ID 输入能生成距离和建议出发时间。

## 9. Location Presets 模块

**接口：**

- `GET /api/location-presets`

**文件：**

- `backend/app/models/location_preset.py`
- `backend/app/routers/location_presets.py`
- `backend/app/tests/test_location_presets.py`

**服务要求：**

- 返回演示当前位置预设。
- 可用于前端定位失败兜底。

## 10. 后端整体验证

```powershell
cd backend
.\.venv\Scripts\pytest -v
.\.venv\Scripts\uvicorn app.main:app --reload
```

人工验收：

- 打开 Swagger。
- 注册、登录。
- 获取建筑。
- 发布留言。
- 新增课程。
- 生成出发建议。

