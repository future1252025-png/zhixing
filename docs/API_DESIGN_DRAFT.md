# 智行 CampusMind 接口设计草案

## 1. 通用约定

基础路径建议：

```text
/api
```

请求和响应格式均为 JSON。登录后请求携带：

```text
Authorization: Bearer <token>
```

通用响应结构建议保持简洁：

| 字段 | 说明 |
|---|---|
| `code` | 0 表示成功，非 0 表示失败 |
| `message` | 成功或错误说明 |
| `data` | 实际数据 |

## 2. 认证接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| GET | `/api/auth/me` | 获取当前用户 |

## 3. 建筑接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/buildings` | 获取建筑列表 |
| GET | `/api/buildings/{building_id}` | 获取建筑详情 |

第一版不开放后台建筑管理接口，建筑数据通过种子数据维护。

## 4. 留言接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/buildings/{building_id}/messages` | 获取建筑留言 |
| POST | `/api/buildings/{building_id}/messages` | 发布建筑留言 |

第一版留言使用 HTTP 模式，不做 WebSocket。发布留言时要求用户已登录。

## 5. 课程接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/courses` | 获取当前用户课程 |
| POST | `/api/courses` | 新增课程 |
| PUT | `/api/courses/{course_id}` | 修改课程 |
| DELETE | `/api/courses/{course_id}` | 删除课程 |

课程接口只操作当前登录用户自己的课程。

## 6. 日程与建议接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/schedule/next` | 获取下一节课 |
| POST | `/api/schedule/suggestion` | 根据当前位置生成出发建议 |

出发建议请求可以支持两种当前位置输入：

| 输入 | 说明 |
|---|---|
| `latitude` + `longitude` | 浏览器定位获取的坐标 |
| `current_building_id` | 手动选择当前位置建筑 |

## 7. 位置预设接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/location-presets` | 获取演示用当前位置预设 |

该接口可选。如果开发时间紧张，预设位置可以由前端静态配置。

## 8. 第一版不提供的接口

| 接口 | 原因 |
|---|---|
| `/ws/chat/*` | 不做 WebSocket 实时聊天 |
| `/api/admin/*` | 不做完整管理员后台 |
| `/api/reports` | 不做举报审核 |
| `/api/ai/*` | 不接真实 AI API |

