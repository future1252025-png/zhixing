# 智行 CampusMind 前端任务清单

## 1. 前端目标

使用 Vue 3 + Vite + Vant UI 构建手机端 H5/PWA。第一版只实现 P0 页面和主流程，不接 WebSocket、不接真实地图 SDK、不接真实 AI。

## 2. 推荐目录

```text
frontend/src/
  api/
  components/
  router/
  stores/
  utils/
  views/
```

## 3. 基础设施任务

| 任务 | 文件 | 验收 |
|---|---|---|
| 初始化 Vite | `frontend/package.json` | `npm run dev` 可启动 |
| 接入 Vant UI | `frontend/src/main.ts` | 页面可使用 Vant 组件 |
| 配置路由 | `frontend/src/router/index.ts` | 登录、首页、课程、建议等路由可访问 |
| 请求封装 | `frontend/src/api/request.ts` | 自动附带 token，统一错误提示 |
| 鉴权状态 | `frontend/src/stores/auth.ts` | 登录后保存 token，退出后清除 |
| 底部导航 | `frontend/src/components/AppTabbar.vue` | 首页、课程、建议三项可切换 |

验证命令：

```powershell
cd frontend
npm install
npm run dev
npm run build
```

## 4. 页面任务

### 4.1 LoginView

**文件：** `frontend/src/views/LoginView.vue`

**组件：**

- 项目标题
- 用户名输入框
- 密码输入框
- 登录按钮
- 注册入口

**接口调用：**

- `POST /api/auth/login`

**状态处理：**

- 加载中：按钮显示 loading。
- 登录失败：显示 Toast。
- 登录成功：保存 token，跳转 `/home`。

**验收标准：**

- 正确账号可登录。
- 错误账号显示错误提示。
- 登录后刷新页面仍能保持登录状态。

### 4.2 RegisterView

**文件：** `frontend/src/views/RegisterView.vue`

**组件：**

- 学号输入框
- 用户名输入框
- 昵称输入框
- 密码输入框
- 注册按钮
- 返回登录入口

**接口调用：**

- `POST /api/auth/register`

**状态处理：**

- 注册成功后跳转登录页。
- 用户名重复时显示后端错误信息。

**验收标准：**

- 能创建新用户。
- 必填字段为空时前端阻止提交或显示提示。

### 4.3 HomeView

**文件：** `frontend/src/views/HomeView.vue`

**组件：**

- 顶部标题
- 建筑点位区域或建筑卡片列表
- 底部导航

**接口调用：**

- `GET /api/buildings`

**状态处理：**

- 加载中显示骨架屏或 Loading。
- 建筑为空显示空状态。
- 点击建筑进入详情页。

**验收标准：**

- 至少显示 8 个演示建筑。
- 点击建筑能进入 `/buildings/:id`。

### 4.4 BuildingDetailView

**文件：** `frontend/src/views/BuildingDetailView.vue`

**组件：**

- 建筑名称
- 建筑类型
- 建筑简介
- 位置说明
- 进入留言区按钮

**接口调用：**

- `GET /api/buildings/{building_id}`

**状态处理：**

- 建筑不存在时显示错误状态。
- 返回按钮回到首页。

**验收标准：**

- 能展示建筑详情。
- 能进入对应留言页。

### 4.5 BuildingMessagesView

**文件：** `frontend/src/views/BuildingMessagesView.vue`

**组件：**

- 建筑标题
- 留言列表
- 留言输入框
- 发布按钮

**接口调用：**

- `GET /api/buildings/{building_id}/messages`
- `POST /api/buildings/{building_id}/messages`

**状态处理：**

- 无留言时显示空状态。
- 发布成功后刷新列表。
- 空内容不能提交。

**验收标准：**

- 能读取演示留言。
- 登录用户能发布留言。
- 页面不使用 WebSocket。

### 4.6 CoursesView

**文件：** `frontend/src/views/CoursesView.vue`

**组件：**

- 课程列表
- 添加课程按钮
- 编辑入口
- 删除按钮

**接口调用：**

- `GET /api/courses`
- `DELETE /api/courses/{course_id}`

**状态处理：**

- 无课程时提示添加课程。
- 删除前确认。
- 删除成功后刷新列表。

**验收标准：**

- 能展示当前用户课程。
- 能进入新增和编辑页面。
- 能删除课程。

### 4.7 CourseEditView

**文件：** `frontend/src/views/CourseEditView.vue`

**组件：**

- 课程名输入框
- 星期选择
- 开始时间选择
- 结束时间选择
- 建筑选择
- 教室输入框
- 教师输入框
- 保存按钮

**接口调用：**

- `GET /api/buildings`
- `POST /api/courses`
- `PUT /api/courses/{course_id}`

**状态处理：**

- 保存时显示 loading。
- 建筑列表加载失败时提示重试。
- 保存成功后返回课程表。

**验收标准：**

- 能新增课程。
- 能编辑已有课程。
- 上课建筑必须从建筑列表选择。

### 4.8 ScheduleView

**文件：** `frontend/src/views/ScheduleView.vue`

**组件：**

- 下一节课卡片
- 获取定位按钮
- 手动选择当前位置
- 出发建议卡片
- AI 建议入口占位说明

**接口调用：**

- `GET /api/schedule/next`
- `POST /api/schedule/suggestion`
- `GET /api/location-presets`

**状态处理：**

- 没有课程时提示先添加课程。
- 定位失败时展示手动选择。
- 生成建议失败时显示错误提示。

**验收标准：**

- 能显示下一节课。
- 能通过手动位置生成建议。
- AI 入口仅作为占位，不调用真实 API。

## 5. 前端整体验证

```powershell
cd frontend
npm run build
npm run dev
```

人工验收：

1. 手机视口打开首页。
2. 登录。
3. 浏览建筑。
4. 发布留言。
5. 新增课程。
6. 生成出发建议。

