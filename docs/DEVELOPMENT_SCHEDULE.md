# 智行 CampusMind 4 周开发排期

## 1. 总体节奏

开发周期：4 周。开发者：1 人。目标：完成可运行、可演示、可写入课程设计文档的手机端 MVP。

## 2. 第 1 周：项目基础和后端骨架

**目标：** 跑通后端基础、数据库模型、种子数据和认证接口。

**任务：**

- 搭建 FastAPI 项目结构。
- 配置 SQLite 和 SQLAlchemy。
- 实现 users、buildings、courses、messages、location_presets 模型。
- 编写种子数据。
- 实现注册、登录、当前用户接口。
- 编写基础后端测试。

**验收标准：**

- 后端能启动。
- Swagger 可访问。
- seed 数据可初始化。
- 注册和登录测试通过。

**验证命令：**

```powershell
cd backend
.\.venv\Scripts\pytest -v
.\.venv\Scripts\uvicorn app.main:app --reload
```

**风险与兜底：**

- 如果 JWT 鉴权卡住，先保证注册登录接口和密码哈希，再补 `/me`。
- 如果 seed 复杂，先用最少 4 个建筑跑通，再扩展到 8 个以上。

## 3. 第 2 周：后端 P0 API 和规则算法

**目标：** 完成建筑、留言、课程、日程建议相关 API。

**任务：**

- 实现建筑列表和详情接口。
- 实现 HTTP 留言读取和发布。
- 实现课程 CRUD。
- 实现下一节课识别。
- 实现距离估算和出发建议。
- 实现位置预设接口。
- 完成后端测试。

**验收标准：**

- P0 后端接口都能在 Swagger 中测试。
- 课程 CRUD 测试通过。
- 下一节课和出发建议测试通过。
- 留言发布测试通过。

**验证命令：**

```powershell
cd backend
.\.venv\Scripts\pytest app/tests/test_courses.py -v
.\.venv\Scripts\pytest app/tests/test_schedule.py -v
.\.venv\Scripts\pytest app/tests/test_messages.py -v
.\.venv\Scripts\pytest -v
```

**风险与兜底：**

- 如果定位坐标不稳定，优先实现 `current_building_id` 手动位置建议。
- 如果课程时间逻辑复杂，第一版只处理当前星期和 `HH:MM` 时间。

## 4. 第 3 周：前端基础和页面联调

**目标：** 完成手机端页面和后端接口联调。

**任务：**

- 初始化 Vue 3 + Vite + Vant UI。
- 配置路由、请求封装和 token 保存。
- 实现登录和注册页。
- 实现首页建筑列表/点位。
- 实现建筑详情和留言页。
- 实现课程表、添加课程、编辑课程页。
- 实现出发建议页和手动位置选择。

**验收标准：**

- `npm run build` 通过。
- 手机端主流程可人工走通。
- 页面有加载、错误和空状态。

**验证命令：**

```powershell
cd frontend
npm install
npm run build
npm run dev
```

人工验收：

- 按 `docs/USER_FLOW.md` 走完整流程。

**风险与兜底：**

- 如果静态地图耗时，先用建筑卡片列表展示，保留地图点位为增强。
- 如果个人中心耗时，只保留退出登录入口。

## 5. 第 4 周：集成、测试、演示和文档

**目标：** 稳定系统，完成演示材料和最终验收。

**任务：**

- 联调前后端。
- 修复主流程问题。
- 补齐演示数据。
- 完成 README 运行说明。
- 按 `docs/DEMO_PLAN.md` 准备演示。
- 按 `docs/ACCEPTANCE_CHECKLIST.md` 验收。

**验收标准：**

- 后端测试通过。
- 前端 build 通过。
- 演示流程从登录到出发建议完整可跑。
- 文档说明能指导本地运行和课程展示。

**验证命令：**

```powershell
cd backend
.\.venv\Scripts\pytest -v
```

```powershell
cd frontend
npm run build
```

人工验收：

- 执行 `docs/DEMO_PLAN.md` 的完整演示流程。
- 检查 `docs/ACCEPTANCE_CHECKLIST.md`。

**风险与兜底：**

- 如果前后端联调时间不足，优先保留登录、建筑、课程、建议四个主模块。
- 如果浏览器定位不可用，演示全程使用手动当前位置。
- 如果 PWA 配置不稳定，第一版只交付手机端 H5。

