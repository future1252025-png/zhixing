# 智行 CampusMind

智行 CampusMind 是一款面向湖北大学校园场景的 Android/H5 智慧校园应用。项目的核心特色是**地点聊天室**：它把真实校园建筑和教室变成可以查看、交流的地点/教室频道，再将校园地图、教务课表、定位校验和出发建议串成一条完整的移动端使用链路。

## 核心特色：地点聊天室

智行不是只展示课表和地图，而是让校园里的真实空间成为交流入口：

`校园地图或课表地点 → 地点/教室聊天室 → 定位校验 → 匿名留言`

- **一地一聊**：每个校园建筑都有公共地点聊天室；从可信教务课表识别出的教室还可形成更具体的教室聊天室。
- **多入口直达**：用户可以从地图点位、地点搜索和课程地点进入对应聊天室，在真实校园空间与线上交流之间建立联系。
- **到场才能发言**：登录用户可以查看留言；发布留言时，后端会校验最近一次定位的时间、精度及与目标建筑的距离，避免与地点无关的内容混入。
- **匿名且克制地使用定位**：聊天室统一以匿名身份展示。精确经纬度只用于发布前的距离核验，不写入留言记录；系统仅保留核验后的距离结果。

地点聊天室是课程表、地图和定位三项能力的连接点，也是智行区别于普通课表或校园地图应用的主要设计。

## 当前能力

- **Android 与网页双端**：Vue 3 前端通过 Capacitor 打包为 Android App，同时保留浏览器运行方式。
- **地点聊天室与校园地图**：接入高德地图，支持湖北大学武昌校区地点搜索、点位分层和路线预览，并让建筑地点聊天室与课表识别出的教室聊天室成为地图和课程的共同入口。
- **原生定位**：Android 使用系统融合定位能力，网页端使用浏览器定位；界面统一只展示“定位”。
- **课程表闭环**：支持课程增删改查、教学周切换、单双周规则、教师与地点信息展示。
- **教务系统导入**：Android 内置湖北大学教务系统导入流程；整批导入覆盖旧课表，个别无法识别的条目不会阻断其余课程。
- **出发建议**：结合当前位置、课程地点和时间生成出发状态与步行路线参考。
- **自动化验证**：覆盖后端、前端、端到端核心流程和 Android 构建。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Vue 3、Vite、TypeScript、Vant、Pinia、Vue Router、Axios |
| Android | Capacitor 8、Android Gradle Plugin、原生 Geolocation、教务导入插件 |
| 地图 | 高德地图 JS API、Walking 路线规划 |
| 后端 | FastAPI、SQLAlchemy、Alembic、Pydantic、JWT、轮换刷新会话 |
| 数据库 | SQLite |
| 测试 | pytest、Vitest、Playwright、JUnit、vue-tsc |

## 项目结构

```text
campusmind/
├── backend/                 FastAPI API、迁移与测试
├── frontend/
│   ├── src/                 Vue 应用
│   ├── e2e/                 Playwright 核心流程
│   └── android/             Capacitor Android 工程
└── docs/                    当前运行、架构、测试与演示文档
```

## 快速启动

### 后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --require-hashes -r requirements.lock
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

健康检查：`http://127.0.0.1:8000/health`

### 网页前端

```powershell
cd frontend
Copy-Item .env.example .env.local
npm ci
npm run dev
```

默认地址：`http://127.0.0.1:5173`

### Android

Android 调试配置独立保存在 `.env.android.local`。实体设备使用手机可达的 API 地址；设备内的 `127.0.0.1` 指向设备自身。

```powershell
cd frontend
Copy-Item .env.android.example .env.android.local
npm ci
```

局域网开发配置可使用 `http://<电脑IPv4>:8000`，对应的 Debug APK 构建命令为：

```powershell
npm run android:sync:dev
cd android
.\gradlew.bat test assembleDebug
```

调试 APK：`frontend/android/app/build/outputs/apk/debug/app-debug.apk`

发布构建、签名和地图服务配置见 [Android 教务导入](docs/ANDROID_COURSE_IMPORT.md)、[运行指南](docs/RUNNING_GUIDE.md) 和 [前端部署](frontend/DEPLOYMENT.md)。

## 当前验证基线

自动化验证覆盖后端、前端、桌面与手机视口核心旅程，以及 Android Release 构建。当前提交对应的精确结果和验证链接统一记录在 [测试报告](docs/TEST_REPORT.md) 中。

## 文档入口

- [文档索引](docs/README.md)
- [功能总览（含地点聊天室）](docs/FEATURE_SUMMARY.md)
- [架构概览](docs/ARCHITECTURE_OVERVIEW.md)
- [运行指南](docs/RUNNING_GUIDE.md)
- [测试报告](docs/TEST_REPORT.md)
- [演示脚本](docs/DEMO_SCRIPT.md)
- [技术亮点](docs/TECHNICAL_HIGHLIGHTS.md)

## License

[MIT](LICENSE)
