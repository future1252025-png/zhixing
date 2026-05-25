# 智行 CampusMind

智行 CampusMind 是一个面向湖北大学学生的校园地图与智能日程规划系统。

项目目标是先完成一个可运行的开源 MVP，用于验证以下核心流程：

```text
登录 -> 校园地图 -> 建筑详情 -> 建筑聊天室 -> 定位发言 -> 课程表 -> 出发建议
```

## 当前阶段

项目处于启动初期，当前仓库先建立文档基线和项目骨架。

```text
campusmind/
├── backend/     后端项目，后续使用 FastAPI
├── frontend/    前端项目，后续使用 Vue 3 + Vite
├── docs/        项目文档
├── LICENSE      开源协议
└── README.md    项目说明
```

## 推荐技术栈

```text
前端：Vue 3 + Vite
后端：FastAPI
数据库：SQLite
实时聊天：WebSocket
认证：JWT
定位：浏览器 Geolocation API
```

## 第一版范围

第一阶段优先完成最小可运行闭环：

```text
用户注册登录
建筑列表与详情
地图点位展示
HTTP 聊天消息
发送消息时定位校验
课程表增删改查
下一节课出发建议
```

WebSocket、完整管理员后台、举报工作流和系统提醒会放在后续阶段增强。

## 文档

项目文档位于 `docs/` 目录。建议先阅读：

```text
docs/00_文档目录与使用说明.md
docs/01_AI执行总说明.md
docs/17_项目启动反思与优化建议.md
```

## 开源协议

本项目使用 MIT License 开源。
