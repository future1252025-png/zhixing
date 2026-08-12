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

开发环境首次启动会自动生成 `backend/data/.jwt-secret`，后续重启继续使用同一密钥；该本地文件位于 `.gitignore` 排除范围内。也可以显式覆盖：

```powershell
$env:JWT_SECRET_KEY="请替换为足够长的随机值"
```

默认登录策略：访问令牌 30 分钟、刷新令牌空闲有效期 30 天、会话绝对上限 90 天。需要调整时在启动后端前设置：

```powershell
$env:ACCESS_TOKEN_EXPIRE_MINUTES="30"
$env:REFRESH_TOKEN_EXPIRE_DAYS="30"
$env:REFRESH_SESSION_ABSOLUTE_DAYS="90"
```

生产环境必须设置固定且不少于 32 字节的 `JWT_SECRET_KEY`。网页前端与 API 应部署在同一站点的 HTTPS 域名下，并把网页 Origin 精确加入 `CORS_ALLOW_ORIGINS`，以便安全发送 `HttpOnly + SameSite=Strict` 刷新 Cookie。

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

生产环境应使用 HTTPS API，并按 [DEPLOYMENT.md](../frontend/DEPLOYMENT.md) 配置高德服务代理。

## Android

```powershell
cd frontend
Copy-Item .env.android.example .env.android.local
```

局域网调试时可临时使用 `http://<电脑IPv4>:8000`，但必须使用开发同步命令并只生成 Debug APK：

```powershell
npm ci
npm run android:sync:dev
cd android
.\gradlew.bat test assembleDebug
```

正式配置必须同时填写公网 HTTPS API、高德 Web Key 和自有域名的 `/_AMapService` 代理，且 `VITE_AMAP_SECURITY_CODE` 必须为空。可先严格同步与校验：

```powershell
npm run android:sync
```

可发布产物必须使用显式版本号和发布密钥签名。推荐在 GitHub Actions 手动运行 **Android Release** 并下载已签名 AAB；本地可在配置 `ANDROID_VERSION_CODE`、`ANDROID_VERSION_NAME`、`ANDROID_RELEASE_KEYSTORE`、`ANDROID_RELEASE_STORE_PASSWORD`、`ANDROID_RELEASE_KEY_ALIAS` 和 `ANDROID_RELEASE_KEY_PASSWORD` 后执行 `npm run android:release`。

CI Android 任务使用临时非发布配置运行正式校验、JUnit、Release Lint、APK/AAB 编译，但不会上传该临时产物。

安装到已授权 USB 调试的手机：

```powershell
adb devices
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

手机 Wi-Fi 连通只解决 API 网络访问，不等于 ADB 已连接；安装仍需要 USB 调试授权或已配对的无线调试。

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

当前 CodeQL 工作流在 Actions 内完成分析并保留 SARIF artifact，因此私有仓库未开启 Code Scanning 时不会因上传被拒绝而报红。仓库日后启用 GitHub Code Scanning/GitHub Code Security 后，可将 `.github/workflows/codeql.yml` 中的 `upload: never` 改为 `upload: always`，并在工作流权限中加入 `security-events: write`，恢复 Security 面板上传。

## 常见问题

- **`JWT_SECRET_KEY 未设置`**：开发后端正在使用 `backend/data/.jwt-secret` 的本地持久密钥；这是正常提示。生产环境必须显式设置环境变量。
- **手机访问 `127.0.0.1` 失败**：手机中的 `127.0.0.1` 指向手机，不是电脑。
- **`adb devices` 显示 offline**：解锁手机，重新确认“允许 USB 调试”，必要时拔插数据线。
- **地图不显示**：检查高德 Key、服务代理、域名白名单和网络。
- **登录显示操作失败**：先在手机浏览器打开 API `/health`，再检查 APK 构建时写入的 API 地址。
