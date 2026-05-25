# 智行 CampusMind 最终验收清单

## 1. 自动验证

### 1.1 后端

```powershell
cd backend
.\.venv\Scripts\pytest -v
```

通过标准：

- health 测试通过。
- auth 测试通过。
- buildings 测试通过。
- messages 测试通过。
- courses 测试通过。
- schedule 测试通过。

### 1.2 前端

```powershell
cd frontend
npm run build
```

通过标准：

- build 命令退出码为 0。
- 无阻塞性编译错误。

## 2. 演示前检查

| 检查项 | 通过标准 |
|---|---|
| 后端启动 | `uvicorn app.main:app --reload` 可启动 |
| 前端启动 | `npm run dev` 可启动 |
| Swagger | `/docs` 可打开 |
| 演示账号 | 可以登录 |
| 建筑数据 | 至少 8 个建筑 |
| 课程数据 | 至少 1 节当前时间之后的课程 |
| 留言数据 | 至少 1 个建筑有留言 |
| 位置兜底 | 可以手动选择当前位置 |

## 3. 主流程验收

| 流程 | 通过标准 |
|---|---|
| 注册 | 新用户可以注册 |
| 登录 | 用户可以登录并进入首页 |
| 建筑 | 首页能展示建筑并进入详情 |
| 留言 | 建筑留言可读取、可发布 |
| 课程 | 课程可新增、编辑、删除 |
| 下一节课 | 能识别当前时间之后最近课程 |
| 出发建议 | 能显示距离、步行时间、缓冲时间、建议出发时间 |
| 定位兜底 | 浏览器定位失败时可以手动选择当前位置 |

## 4. 非目标检查

第一版不得引入以下内容：

- WebSocket 实时聊天
- 真实地图 SDK
- 真实 AI 大模型 API
- 完整管理员后台
- 举报审核工作流
- 学校统一身份认证
- 推送通知
- 原生 Android/iOS

## 5. 项目交付检查

| 交付项 | 通过标准 |
|---|---|
| README | 包含本地运行说明 |
| Design Spec | `docs/PROJECT_SPEC.md` 等文档存在 |
| Planning 文档 | `docs/IMPLEMENTATION_PLAN.md` 等文档存在 |
| Demo Plan | 演示数据和演示流程清晰 |
| 测试记录 | 能说明执行过哪些验证命令 |
| 课程文档 | Word 交付物和 Markdown 文档可用 |

## 6. 完成声明规则

任何“完成”“通过”“可交付”声明前，必须使用 `superpowers:verification-before-completion` 并提供：

1. 实际运行的命令。
2. 退出码或关键输出。
3. 失败项或未验证项。
4. 人工验收结果。

