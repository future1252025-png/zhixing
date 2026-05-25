# 智行 CampusMind SQLite 数据库计划

## 1. 目标

第一版数据库只支撑 MVP 主流程。表结构保持简单，避免为未实现功能提前建复杂表。

## 2. 实现顺序

### 2.1 users

**目的：** 支撑注册、登录和课程归属。

**关键字段：**

- `id`
- `student_id`
- `username`
- `password_hash`
- `nickname`
- `role`
- `created_at`

**验收：**

- 用户名唯一。
- 密码不明文保存。
- seed 可创建演示用户。

### 2.2 buildings

**目的：** 支撑首页建筑、详情、课程地点和距离计算。

**关键字段：**

- `id`
- `name`
- `type`
- `description`
- `latitude`
- `longitude`
- `map_x`
- `map_y`
- `walk_hint`
- `created_at`

**验收：**

- seed 至少包含 8 个建筑。
- 每个建筑有坐标和类型。

### 2.3 courses

**目的：** 支撑用户课程表和下一节课识别。

**关键字段：**

- `id`
- `user_id`
- `course_name`
- `weekday`
- `start_time`
- `end_time`
- `building_id`
- `room_name`
- `teacher`
- `weeks`
- `created_at`

**验收：**

- 课程必须属于用户。
- 课程必须关联有效建筑。
- 星期为 1-7。
- 时间格式为 `HH:MM`。

### 2.4 messages

**目的：** 支撑建筑 HTTP 留言区。

**关键字段：**

- `id`
- `building_id`
- `user_id`
- `content`
- `display_name`
- `status`
- `created_at`

**验收：**

- 留言必须属于建筑。
- 留言必须属于用户。
- 默认状态为 `normal`。

### 2.5 location_presets

**目的：** 支撑定位失败时的演示兜底。

**关键字段：**

- `id`
- `name`
- `building_id`
- `latitude`
- `longitude`
- `description`

**验收：**

- 至少包含宿舍区、图书馆、食堂、体育馆等位置。
- 前端可用于手动选择当前位置。

## 3. 种子数据初始化方案

建议提供 `backend/app/db/seed.py`：

1. 创建演示用户。
2. 创建建筑数据。
3. 创建位置预设。
4. 创建演示课程。
5. 创建演示留言。
6. 重复执行时不重复插入同名建筑和演示用户。

## 4. 验证命令

```powershell
cd backend
.\.venv\Scripts\pytest app/tests/test_seed.py -v
.\.venv\Scripts\pytest app/tests/test_buildings.py -v
```

## 5. 不建表清单

第一版不建：

- `room_channels`
- `reports`
- `reminders`
- `admin_logs`

这些表对应的功能已在 `docs/NON_GOALS.md` 中后置。

