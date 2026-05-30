# 智行 CampusMind

智行 CampusMind 是一个面向湖北大学学生的手机端智慧校园日程规划 H5/PWA MVP。项目围绕“校园建筑信息、建筑匿名留言、课程表、出发建议”形成一个可运行、可演示、可写入课程设计文档的闭环。

GitHub 仓库：

```text
https://github.com/future1252025-png/zhixing.git
```

## 项目特色

- 校园建筑入口：展示校园建筑列表、建筑详情和演示位置预设。
- 建筑匿名留言：按建筑查看和发布 HTTP 留言，统一显示为“匿名同学”。
- 课程表管理：当前登录用户可新增、编辑、删除自己的课程。
- 出发建议：根据下一节课、当前位置和规则算法给出建议出发时间。
- 路径可视化：手机端用静态点线展示“当前位置 -> 目标教学楼”。

## 技术栈

```text
前端：Vue 3 + Vite + TypeScript + Vant UI + Pinia + Vue Router + Axios
后端：FastAPI + SQLAlchemy
数据库：SQLite
认证：JWT
测试：pytest + Vitest
```

## 已实现功能

- 用户注册、登录、获取当前用户、退出登录。
- 建筑列表、建筑详情、位置预设读取。
- 建筑留言列表和匿名留言发布。
- 课程表 CRUD，课程只归属当前登录用户。
- 出发建议 API，支持手动建筑位置和浏览器经纬度。
- 出发建议前端页面，展示下一节课、距离、步行时间、缓冲时间、建议出发时间、状态颜色和静态路径连线。

## 第一版不做的功能

- 不接真实湖北大学统一身份认证，第一版使用模拟校园账号 + JWT。
- 不接真实地图 SDK，不做真实路线规划。
- 不接真实 AI 大模型 API。
- 不做 WebSocket 实时聊天，第一版使用 HTTP 留言区。
- 不做完整管理员后台。
- 不做推送通知、室内定位、留言关键词动态缓冲和发消息坐标强校验。

## 项目目录结构

```text
campusmind/
├── backend/      FastAPI 后端服务
├── frontend/     Vue 3 手机端 H5/PWA
├── docs/         项目规格、计划、运行、演示和测试文档
├── LICENSE       MIT License
└── README.md     项目总览
```

## 后端运行方式

```powershell
cd backend
python -m pip install -r requirements.txt
python -m app.db.seed
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

如果 8000 端口被占用，可以改用：

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8018
```

## 前端运行方式

```powershell
cd frontend
npm install
npm run dev
```

前端默认访问地址通常为：

```text
http://127.0.0.1:5173
```

如需指定后端地址，可设置：

```powershell
$env:VITE_API_BASE_URL="http://127.0.0.1:8000"
npm run dev
```

## 测试方式

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

最近一次 MVP 验证结果：

```text
后端：47 passed
前端：9 passed / 33 tests
前端构建：通过
```

## 演示数据说明

运行 `python -m app.db.seed` 后会初始化校园建筑、位置预设、示例课程和匿名留言数据。演示登录建议现场注册一个测试账号，因为注册流程也是 MVP 主流程的一部分。

推荐演示流程见：

```text
docs/DEMO_SCRIPT.md
```
