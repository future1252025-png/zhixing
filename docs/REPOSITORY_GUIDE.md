# 仓库阅读指南

本文档用于帮助老师、面试官或维护者快速理解这个仓库。

## 推荐阅读顺序

1. [README.md](../README.md)：项目总览、技术栈、运行和测试命令。
2. [docs/RESUME_PROJECT.md](RESUME_PROJECT.md)：适合简历和面试讲解的项目描述。
3. [docs/TECHNICAL_HIGHLIGHTS.md](TECHNICAL_HIGHLIGHTS.md)：核心技术亮点、模块设计和关键规则。
4. [docs/RUNNING_GUIDE.md](RUNNING_GUIDE.md)：本地启动后端、前端和高德地图配置。
5. [docs/DEMO_SCRIPT.md](DEMO_SCRIPT.md)：演示流程。
6. [docs/TEST_REPORT.md](TEST_REPORT.md)：测试结果和验证范围。

## 当前版本代码入口

### 后端

| 文件 | 作用 |
| --- | --- |
| `backend/app/main.py` | FastAPI 应用入口和路由挂载 |
| `backend/app/api/auth.py` | 用户注册、登录、当前用户和资料编辑 |
| `backend/app/api/buildings.py` | 建筑列表、详情和位置数据接口 |
| `backend/app/api/messages.py` | 建筑/教室聊天室和匿名留言接口 |
| `backend/app/api/courses.py` | 课程 CRUD 和课表导入预览 |
| `backend/app/api/schedule.py` | 出发建议接口 |
| `backend/app/db/seed.py` | 初始化数据库和演示数据 |
| `backend/app/db/map_points_seed.json` | 校园地图点位数据 |
| `backend/app/services/` | 认证、建筑、留言、课程、导入、定位和建议服务 |
| `backend/tests/` | 后端测试 |

### 前端

| 文件 | 作用 |
| --- | --- |
| `frontend/src/router/index.ts` | 页面路由和登录守卫 |
| `frontend/src/api/` | 前端 API 封装 |
| `frontend/src/pages/HomePage.vue` | 首页校园地图和地点搜索 |
| `frontend/src/components/RealCampusMap.vue` | 高德地图、点位和路线预览 |
| `frontend/src/pages/BuildingChatroomsPage.vue` | 建筑聊天室选择页 |
| `frontend/src/pages/BuildingMessagesPage.vue` | 建筑/教室留言页 |
| `frontend/src/pages/CoursesPage.vue` | 周课表主页面 |
| `frontend/src/pages/CourseImportPage.vue` | HTML/Excel 课表导入 |
| `frontend/src/pages/SchedulePage.vue` | 出发建议和路线预览 |
| `frontend/src/pages/ProfilePage.vue` | 个人中心和资料编辑 |
| `frontend/src/utils/` | 地图、定位、课程、周次和建议工具函数 |

## 本地验证路径

后端：

```powershell
cd backend
python -m pip install -r requirements.txt
python -m pytest
python -m app.db.seed
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

前端：

```powershell
cd frontend
npm install
npm test
npm run build
npm run dev
```

地图功能需要 `frontend/.env.local` 中配置：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_AMAP_KEY=你的高德Web端JS API Key
VITE_AMAP_SECURITY_CODE=你的高德安全密钥
```

## 面试演示主流程

1. 注册并登录。
2. 在首页查看湖北大学校园地图。
3. 搜索或点击建筑，进入建筑详情。
4. 进入聊天室选择页，选择建筑总频道或具体教室频道。
5. 查看匿名留言，定位通过后发布留言。
6. 进入课程表，导入 HTML/Excel 课表或手动新增课程。
7. 切换周次，查看当周课表。
8. 进入出发建议，选择起点和终点，查看地图路线和建议时间。
9. 进入我的页面，编辑昵称或头像。

## 文档说明

`docs/archive/` 和部分早期 `docs/*_DRAFT.md`、`docs/*_PLAN.md` 记录了项目从课程设计 MVP 到当前版本的演进过程，其中可能包含早期范围设计，不代表当前实现状态。当前对外展示请以 `README.md`、`RESUME_PROJECT.md`、`TECHNICAL_HIGHLIGHTS.md`、`RUNNING_GUIDE.md` 和 `TEST_REPORT.md` 为准。

## 当前限制

- 未接入湖北大学真实统一身份认证。
- 留言不是 WebSocket 实时广播。
- 高德路线依赖有效 Key、网络和浏览器环境。
- 当前数据库为 SQLite，更适合课程设计和本地演示。
