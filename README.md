# 智行 CampusMind

智行 CampusMind 是一款面向湖北大学校园场景的 Android/H5 智慧校园应用。它把校园地图、地点频道、课程表、教务系统导入、定位校验和出发建议整合成一条完整的移动端使用链路。

GitHub 仓库：[future1252025-png/zhixing](https://github.com/future1252025-png/zhixing)

## 当前能力

- **Android 与网页双端**：Vue 3 前端通过 Capacitor 打包为 Android App，同时保留浏览器运行方式。
- **校园地图与地点频道**：接入高德地图，支持湖北大学武昌校区地点搜索、点位分层、路线预览和地点/教室频道。
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
| 后端 | FastAPI、SQLAlchemy、Alembic、Pydantic、JWT |
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
├── docs/                    当前运行、架构、测试与演示文档
├── deliverables/            课程设计交付材料
└── tools/                   交付材料辅助脚本
```

## 快速启动

### 后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

健康检查：`http://127.0.0.1:8000/health`

开发环境建议设置稳定的 `JWT_SECRET_KEY`，否则后端重启后旧登录状态会失效。

### 网页前端

```powershell
cd frontend
Copy-Item .env.example .env.local
npm ci
npm run dev
```

默认地址：`http://127.0.0.1:5173`

### Android

实体手机必须使用手机能够访问的后端地址，不能把 `127.0.0.1` 当作电脑：

```powershell
cd frontend
Copy-Item .env.android.example .env.android.local
# 编辑 .env.android.local 中的 VITE_API_BASE_URL
npm ci
npm run android:sync
cd android
.\gradlew.bat test assembleDebug
```

调试 APK：`frontend/android/app/build/outputs/apk/debug/app-debug.apk`

完整说明见 [Android 教务导入](docs/ANDROID_COURSE_IMPORT.md) 和 [运行指南](docs/RUNNING_GUIDE.md)。

## 当前验证基线

截至 2026-08-06：

- 后端：`379 passed, 2 skipped`
- 前端：`46` 个测试文件、`312 passed`
- Playwright：桌面与手机视口核心用户流程通过
- Android：JUnit、Debug/Release 单元测试任务和 Debug APK 构建通过

## 文档入口

- [文档索引](docs/README_DESIGN_DOCS.md)
- [架构概览](docs/ARCHITECTURE_OVERVIEW.md)
- [运行指南](docs/RUNNING_GUIDE.md)
- [测试报告](docs/TEST_REPORT.md)
- [演示脚本](docs/DEMO_SCRIPT.md)
- [技术亮点](docs/TECHNICAL_HIGHLIGHTS.md)

## 配置安全

- 不提交 `.env.local`、`.env.android.local`、数据库、日志、APK 和构建目录。
- Android 发布包应连接 HTTPS 后端。
- 高德生产环境推荐使用 `VITE_AMAP_SERVICE_HOST` 代理安全密钥，不把安全密钥写入客户端。

## License

[MIT](LICENSE)
