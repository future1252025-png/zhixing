# 运行指南

## 环境

- Python 3.11+
- Node.js 22+、npm 10+
- Android 构建：JDK 21 和 Android SDK
- Windows、macOS 或 Linux

## 后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
```

开发时设置稳定 JWT 密钥，避免重启后现有登录失效：

```powershell
$env:JWT_SECRET_KEY="请替换为足够长的随机值"
```

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

将 `VITE_API_BASE_URL` 改为手机可访问的 HTTPS API；局域网调试时可临时使用 `http://<电脑IPv4>:8000`。

```powershell
npm ci
npm run android:sync
cd android
.\gradlew.bat test assembleDebug
```

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

## 常见问题

- **`JWT_SECRET_KEY 未设置`**：开发后端生成了临时密钥；设置固定环境变量后重启。
- **手机访问 `127.0.0.1` 失败**：手机中的 `127.0.0.1` 指向手机，不是电脑。
- **`adb devices` 显示 offline**：解锁手机，重新确认“允许 USB 调试”，必要时拔插数据线。
- **地图不显示**：检查高德 Key、服务代理、域名白名单和网络。
- **登录显示操作失败**：先在手机浏览器打开 API `/health`，再检查 APK 构建时写入的 API 地址。
