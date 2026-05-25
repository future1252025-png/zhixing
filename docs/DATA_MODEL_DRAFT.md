# 智行 CampusMind 数据库表设计草案

## 1. 数据库选择

第一版使用 SQLite。原因是部署简单、适合个人开发和课程演示。后续正式化时可迁移到 MySQL。

## 2. 核心表

第一版建议只做 4 张必需表，外加 1 张可选演示表。

| 表 | P0 | 说明 |
|---|---|---|
| `users` | 是 | 用户账号 |
| `buildings` | 是 | 校园建筑数据 |
| `courses` | 是 | 用户课程表 |
| `messages` | 是 | 建筑留言 |
| `location_presets` | 可选 | 演示用当前位置预设 |

## 3. users

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | Integer | 主键 |
| `student_id` | String | 学号，可唯一 |
| `username` | String | 用户名，唯一 |
| `password_hash` | String | 密码哈希 |
| `nickname` | String | 昵称 |
| `role` | String | 第一版默认 student |
| `created_at` | DateTime | 创建时间 |

## 4. buildings

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | Integer | 主键 |
| `name` | String | 建筑名称 |
| `type` | String | 类型，如教学楼、食堂、图书馆 |
| `description` | Text | 简介 |
| `latitude` | Float | 纬度，用于估算距离 |
| `longitude` | Float | 经度，用于估算距离 |
| `map_x` | Float | 静态地图 x 百分比 |
| `map_y` | Float | 静态地图 y 百分比 |
| `walk_hint` | String | 可选，建筑步行提示 |
| `created_at` | DateTime | 创建时间 |

## 5. courses

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | Integer | 主键 |
| `user_id` | Integer | 所属用户 |
| `course_name` | String | 课程名称 |
| `weekday` | Integer | 星期，1-7 |
| `start_time` | String | 开始时间，如 08:00 |
| `end_time` | String | 结束时间，如 09:40 |
| `building_id` | Integer | 上课建筑 |
| `room_name` | String | 教室 |
| `teacher` | String | 教师 |
| `weeks` | String | 周次说明，可选 |
| `created_at` | DateTime | 创建时间 |

## 6. messages

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | Integer | 主键 |
| `building_id` | Integer | 所属建筑 |
| `user_id` | Integer | 发送者 |
| `content` | Text | 留言内容 |
| `display_name` | String | 前端显示名，可默认匿名同学 |
| `status` | String | normal/hidden，第一版默认 normal |
| `created_at` | DateTime | 创建时间 |

## 7. location_presets 可选表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | Integer | 主键 |
| `name` | String | 预设位置名称 |
| `building_id` | Integer | 可关联建筑 |
| `latitude` | Float | 纬度 |
| `longitude` | Float | 经度 |
| `description` | String | 演示说明 |

如果实现时间紧张，`location_presets` 也可以不入库，直接由前端或后端常量提供。

## 8. 第一版不建的表

| 表 | 原因 |
|---|---|
| `room_channels` | 不做多频道聊天室 |
| `reports` | 不做举报审核流程 |
| `reminders` | 不做真实提醒任务 |
| `admin_logs` | 不做完整后台 |

