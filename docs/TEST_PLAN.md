# 智行 CampusMind 测试计划

## 1. 测试目标

保证第一版 MVP 主流程可运行、关键后端逻辑可靠、前端可以完成手机端演示。测试优先覆盖登录、课程 CRUD、下一节课识别、出发建议和留言发布。

## 2. 后端自动化测试

### 2.1 Health

| 测试 | 期望 |
|---|---|
| `GET /api/health` | 返回成功 |

命令：

```powershell
cd backend
.\.venv\Scripts\pytest app/tests/test_health.py -v
```

### 2.2 Auth

| 测试 | 期望 |
|---|---|
| 注册新用户 | 成功返回用户信息 |
| 重复用户名 | 返回失败 |
| 正确密码登录 | 返回 token |
| 错误密码登录 | 返回失败 |
| 无 token 访问 `/me` | 返回鉴权失败 |
| 有 token 访问 `/me` | 返回当前用户 |

命令：

```powershell
cd backend
.\.venv\Scripts\pytest app/tests/test_auth.py -v
```

### 2.3 Courses

| 测试 | 期望 |
|---|---|
| 新增课程 | 成功创建 |
| 查询课程 | 只返回当前用户课程 |
| 修改课程 | 成功更新 |
| 删除课程 | 成功删除 |
| 操作他人课程 | 返回失败 |

命令：

```powershell
cd backend
.\.venv\Scripts\pytest app/tests/test_courses.py -v
```

### 2.4 Schedule

| 测试 | 期望 |
|---|---|
| 当前时间后有课程 | 返回最近一节课 |
| 今日无后续课程 | 返回明确空状态 |
| 经纬度生成建议 | 返回距离、步行时间、出发时间 |
| 当前建筑生成建议 | 返回距离、步行时间、出发时间 |

命令：

```powershell
cd backend
.\.venv\Scripts\pytest app/tests/test_schedule.py -v
```

### 2.5 Messages

| 测试 | 期望 |
|---|---|
| 获取建筑留言 | 返回列表 |
| 登录用户发布留言 | 成功保存 |
| 未登录发布留言 | 鉴权失败 |
| 空留言 | 请求失败 |

命令：

```powershell
cd backend
.\.venv\Scripts\pytest app/tests/test_messages.py -v
```

## 3. 前端基础验证

自动化测试不是第一版重点，优先保证 build 和人工流程。

命令：

```powershell
cd frontend
npm run build
npm run dev
```

人工验证：

1. 手机尺寸打开页面。
2. 登录成功后进入首页。
3. 建筑列表可点击。
4. 留言可读取和发布。
5. 课程可新增、编辑、删除。
6. 出发建议可使用手动当前位置生成。

## 4. 集成测试

启动后端：

```powershell
cd backend
.\.venv\Scripts\uvicorn app.main:app --reload
```

启动前端：

```powershell
cd frontend
npm run dev
```

验收流程：

1. 注册或登录演示账号。
2. 浏览建筑。
3. 进入建筑留言区并发布留言。
4. 添加课程。
5. 在建议页选择当前位置。
6. 生成出发建议。

## 5. 验证完成规则

每次声称某阶段完成前，必须使用 `superpowers:verification-before-completion`：

1. 说明用什么命令验证。
2. 运行完整命令。
3. 阅读输出和退出码。
4. 如实报告通过、失败或未验证项。

