# 运行说明

本文档用于帮助老师、评审或同学在本地快速运行智行 CampusMind MVP。

## 环境要求

- 操作系统：Windows、macOS 或 Linux 均可。
- Python：建议 Python 3.13，至少使用支持 FastAPI 与 SQLAlchemy 的 Python 3.10+。
- Node.js：建议 Node.js 20+。
- npm：建议 npm 10+。

如果本机存在多个 Python，请确认当前命令使用的是已安装后端依赖的解释器：

```powershell
python --version
python -m pip --version
```

## 后端安装依赖

```powershell
cd backend
python -m pip install -r requirements.txt
```

## 初始化数据库

```powershell
python -m app.db.seed
```

默认 SQLite 数据库位于：

```text
backend/data/campusmind.db
```

该目录为本地运行数据，不需要提交到 Git。

## 启动后端

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

端口被占用时可改用：

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8018
```

健康检查：

```text
GET http://127.0.0.1:8000/health
```

## 前端安装依赖

```powershell
cd frontend
npm install
```

## 启动前端

```powershell
npm run dev
```

如后端不是 8000 端口，启动前端前设置：

```powershell
$env:VITE_API_BASE_URL="http://127.0.0.1:8018"
npm run dev
```

## 测试命令

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

## 常见问题

### 端口被占用

后端可把 8000 改为 8018 或其他空闲端口。前端 Vite 默认会自动换端口，也可以手动指定：

```powershell
npm run dev -- --host 127.0.0.1 --port 5179
```

### Python 环境不一致

如果 `python -m pytest` 提示缺少 `sqlalchemy`、`fastapi` 等依赖，说明当前 Python 不是安装依赖的环境。可以使用完整 Python 路径运行，例如：

```powershell
C:\Users\xwl20\AppData\Local\Programs\Python\Python313\python.exe -m pytest
```

### GitHub push 网络失败

如果出现 `Recv failure: Connection was reset`，通常是网络问题。本地 commit 不会丢失，可稍后重新执行：

```powershell
git push origin main
```

### 前端无法连接后端

检查后端是否已启动，并确认前端环境变量 `VITE_API_BASE_URL` 指向正确后端地址。
