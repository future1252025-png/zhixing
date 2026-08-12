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

开发环境首次启动会在 `backend/data/.jwt-secret` 中生成本地持久密钥，后端重启不会再让登录立即失效；该本地文件位于 `.gitignore` 排除范围内。生产环境仍必须显式设置 `JWT_SECRET_KEY`。

### 网页前端

```powershell
cd frontend
Copy-Item .env.example .env.local
npm ci
npm run dev
```

默认地址：`http://127.0.0.1:5173`

### Android

实体手机访问电脑后端时需要使用手机可达的地址；手机内的 `127.0.0.1` 指向手机自身：

```powershell
cd frontend
Copy-Item .env.android.example .env.android.local
npm ci
```

同一 Wi-Fi 下连接电脑后端只用于开发调试。此时可把 API 配成
`http://<电脑IPv4>:8000`，然后构建 Debug APK：

```powershell
npm run android:sync:dev
cd android
.\gradlew.bat test assembleDebug
```

`android:sync` 是严格的正式资源同步：它要求真实公网 HTTPS API、高德 Web Key 和自有域名的 `/_AMapService` 代理，并会反向检查生成产物。正式 App 通过 Capacitor 原生 HTTP 通道访问 API，不需要后端放行 WebView 的 `https://localhost` 来规避 CORS。

可发布包不再使用 `assembleDebug`。推荐在 GitHub Actions 手动运行 **Android Release**，配好仓库 Variables/Secrets 后生成已签名 AAB。本地也可设置 `ANDROID_VERSION_CODE`、`ANDROID_VERSION_NAME` 及四个 `ANDROID_RELEASE_*` 签名变量后执行 `npm run android:release`。

调试 APK：`frontend/android/app/build/outputs/apk/debug/app-debug.apk`
正式 AAB：`frontend/android/app/build/outputs/bundle/release/app-release.aab`

完整说明见 [Android 教务导入](docs/ANDROID_COURSE_IMPORT.md) 和 [运行指南](docs/RUNNING_GUIDE.md)。

## 当前验证基线

自动化验证覆盖后端、前端、桌面与手机视口核心旅程，以及 Android Release 构建。当前提交对应的精确结果和验证链接统一记录在 [测试报告](docs/TEST_REPORT.md) 中。

## 文档入口

- [文档索引](docs/README_DESIGN_DOCS.md)
- [架构概览](docs/ARCHITECTURE_OVERVIEW.md)
- [运行指南](docs/RUNNING_GUIDE.md)
- [测试报告](docs/TEST_REPORT.md)
- [演示脚本](docs/DEMO_SCRIPT.md)
- [技术亮点](docs/TECHNICAL_HIGHLIGHTS.md)

## 配置安全

- `.env.local`、`.env.android.local`、数据库、日志、APK 和构建目录均位于版本控制排除范围内。
- Android 发布配置使用 HTTPS 后端。
- 访问令牌默认 30 分钟且只驻留内存；刷新会话空闲 30 天、最长 90 天。网页刷新令牌使用 `HttpOnly + SameSite=Strict` Cookie，Android 使用 Keystore 加密存储，并在每次续期后轮换。
- 高德生产环境通过 `VITE_AMAP_SERVICE_HOST` 使用服务端代理，安全密钥仅保存在服务端。

## License

[MIT](LICENSE)
