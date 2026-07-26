# 智行 CampusMind

智行 CampusMind 是一个面向湖北大学学生的手机端 H5/PWA 智慧校园系统。项目把真实校园地图、建筑/教室会话、课程表管理、课表导入、出发建议和定位约束留言串成一个可运行、可演示、可写进简历的完整 MVP。

GitHub 仓库：[future1252025-png/zhixing](https://github.com/future1252025-png/zhixing.git)

## 项目亮点

- **真实校园地图体验**：接入高德地图 JS API，围绕湖北大学武昌校区展示校园点位、搜索、缩放分层和路线预览。
- **建筑会话是核心特色**：从地图选择建筑后进入聊天室选择页，可进入地点频道或教室频道，留言统一匿名展示。
- **定位约束发言**：留言页支持浏览器/高德定位，用户距离目标建筑过远时直接禁用输入，避免发出后才被拦截。
- **课程表完整闭环**：支持课程 CRUD、周次筛选、HTML/Excel 课表导入预览和自动建筑匹配。
- **出发建议与路线预览**：根据当前用户课程、起点/终点和校园地图生成出发建议，展示状态、时间和地图路线。
- **前后端测试覆盖**：后端 pytest 61 个用例通过，前端 Vitest 81 个用例通过，前端生产构建通过。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Vue 3, Vite, TypeScript, Vant UI, Pinia, Vue Router, Axios |
| 地图 | 高德地图 JS API, Walking 路线规划, 浏览器 Geolocation 兜底 |
| 后端 | FastAPI, SQLAlchemy, Pydantic, JWT |
| 数据库 | SQLite |
| 测试 | pytest, Vitest, vue-tsc |

## 已实现功能

- 用户注册、登录、JWT 鉴权、当前用户读取和个人资料编辑。
- 首页真实地图、校园地点搜索、地图点位分层、地图采点辅助页。
- 建筑详情、地点频道、教室频道、匿名留言列表和留言发布。
- 留言定位检查：未定位或距离建筑过远时禁用输入，并给出中文提示。
- 课程表增删改查、周次筛选、整周课表视图、HTML/Excel 课表导入预览。
- 课程建筑自动匹配，减少用户手动选择建筑的成本。
- 出发建议页面，支持手动搜索起终点、浏览器定位、下一节课终点兜底。
- 高德地图路线预览，路线失败时保留可理解的兜底提示。
- 移动端整体 UI 美化与统一的纯 CSS 动效（方向感知路由转场、首页欢迎卡）。

## 项目结构

```text
campusmind/
├── backend/                 FastAPI 后端
│   ├── app/
│   │   ├── api/             auth/buildings/messages/courses/schedule 路由
│   │   ├── core/            配置与安全工具
│   │   ├── db/              SQLite 连接、种子数据、校园点位数据
│   │   ├── models/          SQLAlchemy 数据模型
│   │   ├── schemas/         Pydantic 请求/响应模型
│   │   └── services/        业务服务与规则算法
│   └── tests/               后端测试
├── frontend/                Vue 3 手机端 H5/PWA
│   ├── src/api/             HTTP 请求封装
│   ├── src/components/      地图、启动动画、底部导航等组件
│   ├── src/pages/           登录、首页、课程、留言、出发建议、我的
│   ├── src/stores/          认证与定位状态
│   ├── src/types/           前端类型
│   └── src/utils/           地图、课程、周次、定位和建议工具函数
├── docs/                    设计、运行、演示、测试和简历材料
├── deliverables/            交付材料存放区
└── tools/                   辅助脚本
```

## 快速启动

### 后端

```powershell
cd backend
python -m pip install -r requirements.txt
python -m app.db.seed
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

健康检查：

```text
http://127.0.0.1:8000/health
```

### 前端

复制环境变量模板并填写高德 Key：

```powershell
cd frontend
Copy-Item .env.example .env.local
```

`.env.local` 示例：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_AMAP_KEY=你的高德Web端JS API Key
VITE_AMAP_SECURITY_CODE=你的高德安全密钥
```

启动前端：

```powershell
npm install
npm run dev
```

默认访问：

```text
http://127.0.0.1:5173
```

更完整的运行说明见 [docs/RUNNING_GUIDE.md](docs/RUNNING_GUIDE.md)。

## 测试

后端：

```powershell
cd backend
python -m pytest
```

前端：

```powershell
cd frontend
npm test
npm run build
```

最近一次整理验证结果：

```text
后端：365 passed
前端：276 passed
前端构建：通过
```

## 简历阅读入口

- [docs/RESUME_PROJECT.md](docs/RESUME_PROJECT.md)：简历项目描述、亮点话术和面试讲解版本。
- [docs/TECHNICAL_HIGHLIGHTS.md](docs/TECHNICAL_HIGHLIGHTS.md)：架构、接口、算法、地图、导入和测试亮点。
- [docs/REPOSITORY_GUIDE.md](docs/REPOSITORY_GUIDE.md)：面试官快速阅读路径和代码入口。
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)：演示流程。
- [docs/TEST_REPORT.md](docs/TEST_REPORT.md)：测试记录。

## MVP 边界

当前版本已经接入高德地图 JS API 和路线预览，但仍保持课程设计 MVP 的边界：

- 统一身份认证仍为后续扩展，当前使用项目内账号 + JWT。
- 留言为 HTTP 模式，不是 WebSocket 实时聊天。
- 不做完整管理员后台、推送通知、室内定位和真实 AI 自动决策。
- 高德地图能力依赖有效 Web 端 JS API Key、安全密钥和浏览器网络环境。

## License

[MIT](LICENSE)
