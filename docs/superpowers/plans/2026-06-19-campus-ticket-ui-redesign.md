# Campus Ticket UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将智行 CampusMind 的主要手机端页面统一重构为校园出行票据风，同时保持现有业务功能完整。

**Architecture:** 使用 `base.css` 集中维护设计令牌、全局页面结构和 Vant 覆盖；页面组件只保留自身布局。登录动画继续由 Anime.js 驱动，通过现有 sessionStorage 标志和 App 级 handoff 状态与首页联动。地图、课程、留言和出发建议 API 均保持不变。

**Tech Stack:** Vue 3、TypeScript、Vite、Vant UI、Pinia、Anime.js、Vitest。

---

### Task 1: 全局设计系统与导航

**Files:**
- Modify: `frontend/src/styles/base.css`
- Modify: `frontend/src/App.vue`
- Modify: `frontend/src/components/AppTabbar.vue`
- Modify: `frontend/src/main.ts`

- [ ] 将颜色、圆角、间距、字体和语义状态整理为设计令牌。
- [ ] 删除背景光球、过量渐变和通用玻璃卡片样式。
- [ ] 建立固定顶部栏、平整底部导航和 560px 手机内容容器。
- [ ] 运行 `npm test`，确认全局改动未影响测试。

### Task 2: 登录动画与首页联动

**Files:**
- Modify: `frontend/src/pages/LoginPage.vue`
- Modify: `frontend/src/pages/RegisterPage.vue`
- Modify: `frontend/src/components/LoginWelcomeIntro.vue`
- Modify: `frontend/src/pages/HomePage.vue`
- Test: `frontend/src/utils/loginIntro.test.ts`

- [ ] 保留登录成功一次性动画标志测试。
- [ ] 重做登录票据、注册表单和 Anime.js 路线动画。
- [ ] 首页增加下一节课票据所需的数据读取，课程为空时显示明确引导。
- [ ] 动画末段触发首页票据、快捷操作和地图进入。
- [ ] 运行 `npm test -- src/utils/loginIntro.test.ts` 与 `npm run build`。

### Task 3: 地图、建筑详情与留言

**Files:**
- Modify: `frontend/src/components/RealCampusMap.vue`
- Modify: `frontend/src/pages/BuildingDetailPage.vue`
- Modify: `frontend/src/pages/BuildingMessagesPage.vue`

- [ ] 让地图成为无额外装饰框的主内容区，保留地点搜索和隐藏点击区域。
- [ ] 建筑详情删除面向开发者的静态坐标展示，只保留用户需要的信息。
- [ ] 留言页重做定位状态、聊天气泡和固定输入区。
- [ ] 人工检查返回按钮在长页面滚动后仍可见。

### Task 4: 课表、课程表单与导入

**Files:**
- Modify: `frontend/src/pages/CoursesPage.vue`
- Modify: `frontend/src/pages/CourseFormPage.vue`
- Modify: `frontend/src/pages/CourseImportPage.vue`
- Test: `frontend/src/utils/course.test.ts`

- [ ] 重做周次切换和整周课表视觉，保留周六、周日和空白格点击。
- [ ] 课程操作继续使用底部菜单，删除前继续二次确认。
- [ ] 表单改为分组行；建筑由系统匹配或已有建筑选择逻辑保持不变。
- [ ] 导入页建立文件选择、解析摘要、待确认课程三个层级。
- [ ] 运行课程工具测试和完整前端测试。

### Task 5: 出发建议与个人中心

**Files:**
- Modify: `frontend/src/pages/SchedulePage.vue`
- Modify: `frontend/src/pages/ProfilePage.vue`
- Test: `frontend/src/utils/schedule.test.ts`
- Test: `frontend/src/stores/location.test.ts`

- [ ] 起点、终点搜索改为紧凑选择器。
- [ ] 建议结果使用路线票据展示时间、距离、步行和缓冲信息。
- [ ] 地图只在路线准备完成时渲染，避免重复刷新。
- [ ] 个人中心改为账号摘要和设置列表。
- [ ] 运行 schedule、location 和完整前端测试。

### Task 6: 验证与视觉检查

**Files:**
- Verify only; no planned production edits.

- [ ] 运行 `cd frontend && npm test`，预期全部测试通过。
- [ ] 运行 `cd frontend && npm run build`，预期 TypeScript 和 Vite 构建通过。
- [ ] 运行 `cd backend && .\.venv\Scripts\python.exe -m pytest`，预期后端测试通过。
- [ ] 临时启动前后端，检查登录、首页、建筑、留言、课表、导入、建议和个人中心。
- [ ] 检查 `git status --short --ignored`，确认数据库、依赖和构建目录仍被忽略。
- [ ] 关闭临时前后端服务，不自动提交或推送。
