# 智行 CampusMind 执行阶段 Prompts

## 1. 使用说明

后续进入 executing-plans 阶段时，可按阶段复制下面的 prompt 给 Codex。每个 prompt 都要求使用 `superpowers:verification-before-completion`，在没有新鲜验证证据前不能声称完成。

## 2. Phase 0 Prompt：仓库与范围检查

```text
使用 @superpowers，并使用 superpowers:executing-plans 执行 docs/IMPLEMENTATION_PLAN.md 的 Phase 0。

要求：
1. 不写业务代码。
2. 检查当前仓库状态、backend/frontend 目录、Design Spec 和 Non-goals。
3. 不覆盖用户已有修改。
4. 输出本阶段可执行结论。
5. 完成前必须使用 superpowers:verification-before-completion：
   - 运行 git status --short --branch
   - 运行 Get-ChildItem -Force backend
   - 运行 Get-ChildItem -Force frontend
   - 明确说明输出是否支持进入 Phase 1
```

## 3. Phase 1 Prompt：后端骨架

```text
使用 @superpowers，并使用 superpowers:executing-plans 执行 docs/IMPLEMENTATION_PLAN.md 的 Phase 1。

目标：创建最小 FastAPI 后端骨架，包含 /api/health、CORS、测试基础。

范围：
1. 只做 backend 项目骨架。
2. 不实现 auth、数据库模型、课程、留言或日程功能。
3. 不引入 WebSocket、真实 AI、真实地图 SDK、管理员后台。

完成前必须使用 superpowers:verification-before-completion：
1. 运行 backend 测试命令：pytest 或 .\.venv\Scripts\pytest。
2. 启动 uvicorn app.main:app --reload，确认 /api/health 可访问。
3. 报告命令、退出码、关键输出和未验证项。
```

## 4. Phase 2 Prompt：数据库与种子数据

```text
使用 @superpowers，并使用 superpowers:executing-plans 执行 docs/IMPLEMENTATION_PLAN.md 的 Phase 2 和 docs/DATABASE_PLAN.md。

目标：实现 SQLite、SQLAlchemy 模型和 seed 数据。

范围：
1. 只实现 users、buildings、courses、messages、location_presets。
2. 不创建 room_channels、reports、reminders、admin_logs。
3. 种子数据必须服务 docs/DEMO_PLAN.md。

完成前必须使用 superpowers:verification-before-completion：
1. 运行 pytest app/tests/test_seed.py -v。
2. 运行 pytest -v。
3. 明确报告 seed 数据数量和失败项。
```

## 5. Phase 3 Prompt：认证接口

```text
使用 @superpowers，并使用 superpowers:executing-plans 执行 docs/IMPLEMENTATION_PLAN.md 的 Phase 3。

目标：实现注册、登录、JWT、当前用户接口。

范围：
1. 只做 auth 相关模型、schema、service、router、测试。
2. 密码必须哈希保存。
3. 不做复杂权限系统，只保留 student 角色和必要鉴权。

完成前必须使用 superpowers:verification-before-completion：
1. 运行 pytest app/tests/test_auth.py -v。
2. 运行 pytest -v。
3. 在 Swagger 或接口测试中确认 register/login/me 行为。
```

## 6. Phase 4 Prompt：后端 P0 API

```text
使用 @superpowers，并使用 superpowers:executing-plans 执行 docs/IMPLEMENTATION_PLAN.md 的 Phase 4。

目标：实现建筑、留言、课程、位置预设、下一节课和出发建议 API。

范围：
1. 留言只做 HTTP，不做 WebSocket。
2. 建筑数据只通过 seed 维护，不做 admin API。
3. 出发建议只做规则算法，不接真实 AI。
4. 地图只使用建筑坐标，不接地图 SDK。

完成前必须使用 superpowers:verification-before-completion：
1. 运行 pytest app/tests/test_messages.py -v。
2. 运行 pytest app/tests/test_courses.py -v。
3. 运行 pytest app/tests/test_schedule.py -v。
4. 运行 pytest -v。
5. 人工检查 Swagger 中 P0 API 是否齐全。
```

## 7. Phase 5 Prompt：前端骨架

```text
使用 @superpowers，并使用 superpowers:executing-plans 执行 docs/IMPLEMENTATION_PLAN.md 的 Phase 5。

目标：创建 Vue 3 + Vite + Vant UI 手机端前端骨架。

范围：
1. 只做前端基础、路由、请求封装、布局和占位页面。
2. 不实现完整页面业务联调。
3. 不加入真实地图 SDK、WebSocket 或真实 AI。

完成前必须使用 superpowers:verification-before-completion：
1. 运行 npm install。
2. 运行 npm run build。
3. 运行 npm run dev 并确认页面可打开。
4. 报告命令结果和人工检查结果。
```

## 8. Phase 6 Prompt：前端功能页面

```text
使用 @superpowers，并使用 superpowers:executing-plans 执行 docs/IMPLEMENTATION_PLAN.md 的 Phase 6 和 docs/FRONTEND_TASKS.md。

目标：实现手机端 P0 页面并连接后端 HTTP API。

范围：
1. 实现登录、注册、首页、建筑详情、建筑留言、课程表、课程编辑、出发建议。
2. 定位失败时必须提供手动选择当前位置。
3. 留言只使用 HTTP 刷新，不使用 WebSocket。
4. AI 只做入口占位，不调用真实 API。

完成前必须使用 superpowers:verification-before-completion：
1. 运行 npm run build。
2. 启动前端 npm run dev。
3. 配合后端手动跑通 docs/USER_FLOW.md。
4. 报告自动验证和人工验收结果。
```

## 9. Phase 7 Prompt：集成与验收

```text
使用 @superpowers，并使用 superpowers:executing-plans 执行 docs/IMPLEMENTATION_PLAN.md 的 Phase 7。

目标：完成前后端集成、演示流程、README 和最终验收。

范围：
1. 只修复阻塞主流程的问题。
2. 不新增 P2 功能。
3. 按 docs/DEMO_PLAN.md 和 docs/ACCEPTANCE_CHECKLIST.md 验收。

完成前必须使用 superpowers:verification-before-completion：
1. 运行后端 pytest -v。
2. 运行前端 npm run build。
3. 启动后端 uvicorn app.main:app --reload。
4. 启动前端 npm run dev。
5. 人工执行完整演示流程。
6. 报告每一项验收结果。
```

