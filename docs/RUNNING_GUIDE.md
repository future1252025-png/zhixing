# 运行指南

## 环境

- Python 3.11+
- Node.js 22+、npm 10+
- Android 构建：JDK 21 和 Android SDK
- Windows、macOS 或 Linux；下文命令以 Windows PowerShell 为例，macOS/Linux 对应使用 `.venv/bin/python` 和 `./gradlew`

## 后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --require-hashes -r requirements.lock
.\.venv\Scripts\python.exe -m alembic upgrade head
```

开发模式会在 `backend/data/.jwt-secret` 生成持久化密钥，后续启动沿用该值。`JWT_SECRET_KEY` 环境变量可覆盖默认行为：

```powershell
$env:JWT_SECRET_KEY="<32-byte-or-longer-random-secret>"
```

默认登录策略为访问令牌 30 分钟、刷新令牌空闲有效期 30 天、会话绝对上限 90 天。对应环境变量如下：

```powershell
$env:ACCESS_TOKEN_EXPIRE_MINUTES="30"
$env:REFRESH_TOKEN_EXPIRE_DAYS="30"
$env:REFRESH_SESSION_ABSOLUTE_DAYS="90"
```

生产配置使用固定且不少于 32 字节的 `JWT_SECRET_KEY`。网页前端与 API 采用同站点 HTTPS 部署，网页 Origin 通过 `CORS_ALLOW_ORIGINS` 配置；刷新会话由 `HttpOnly + SameSite=Strict` Cookie 承载。

只供本机网页访问：

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

供同一局域网内 Android 手机访问：

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

用电脑的局域网 IPv4 验证：`http://<电脑IPv4>:8000/health`。如果电脑可访问而手机超时，检查 Windows 防火墙入站规则、路由器客户端隔离和代理分流。

## 网页端

```powershell
cd frontend
Copy-Item .env.example .env.local
npm ci
npm run dev
```

`.env.local`：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_AMAP_KEY=
VITE_AMAP_SECURITY_CODE=
VITE_AMAP_SERVICE_HOST=
```

开发地址：`http://127.0.0.1:5173`

生产环境对应 HTTPS API 和 [前端部署](../frontend/DEPLOYMENT.md) 中的高德服务代理配置。

## Android

```powershell
cd frontend
Copy-Item .env.android.example .env.android.local
```

局域网调试使用 `http://<电脑IPv4>:8000`、开发同步脚本和 Debug APK：

```powershell
npm ci
npm run android:sync:dev
cd android
.\gradlew.bat test assembleDebug
```

发布配置由公网 HTTPS API、高德 Web Key 和自有域名的 `/_AMapService` 代理组成；安全密钥由代理持有，因此 `VITE_AMAP_SECURITY_CODE` 为空。同步脚本同时校验这些配置：

```powershell
npm run android:sync
```

发布产物使用显式版本号和发布密钥签名。GitHub Actions 的 **Android Release** 工作流生成已签名 AAB；本地发布使用 `ANDROID_VERSION_CODE`、`ANDROID_VERSION_NAME`、`ANDROID_RELEASE_KEYSTORE`、`ANDROID_RELEASE_STORE_PASSWORD`、`ANDROID_RELEASE_KEY_ALIAS`、`ANDROID_RELEASE_KEY_PASSWORD` 和 `npm run android:release`。

CI Android 任务使用隔离配置运行环境校验、JUnit、Release Lint 和 APK/AAB 编译。

安装到已授权 USB 调试的手机：

```powershell
adb devices
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Wi-Fi 连通性与 ADB 连接相互独立。APK 安装通过已授权的 USB 调试或已配对的无线调试完成。

## 验证

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest

cd ..\frontend
npm test
npm run build
npm run test:e2e
```

Android：

```powershell
cd frontend\android
.\gradlew.bat test assembleDebug
```

## 常见问题

- **`JWT_SECRET_KEY 未设置`**：开发后端正在使用 `backend/data/.jwt-secret` 的本地持久密钥；生产部署读取显式环境变量。
- **手机访问 `127.0.0.1` 失败**：手机中的 `127.0.0.1` 指向手机，不是电脑。
- **`adb devices` 显示 offline**：解锁手机，重新确认“允许 USB 调试”，必要时拔插数据线。
- **地图不显示**：检查高德 Key、服务代理、域名白名单和网络。
- **登录显示操作失败**：先在手机浏览器打开 API `/health`，再检查 APK 构建时写入的 API 地址。
