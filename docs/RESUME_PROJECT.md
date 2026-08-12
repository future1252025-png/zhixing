# 简历项目说明

## 一句话介绍

面向湖北大学校园场景的 Android/H5 智慧校园应用，整合真实地图、地点频道、课表导入、原生定位与出发建议。

## 简历描述

- 使用 Vue 3、TypeScript、Vant、Pinia 和 Capacitor 8 构建网页与 Android 共用的移动端界面，并针对状态栏、刘海屏、软键盘和底部手势区完成适配。
- 使用 FastAPI、SQLAlchemy、Alembic 和 SQLite 实现 JWT 认证、课程、学期、地点频道、定位距离校验和出发建议 API。
- 接入高德地图 JS API，实现校园地点搜索、点位分层、拖动缩放和步行路线预览，并设计网络与地图失败兜底。
- 实现湖北大学教务系统 Android 导入插件及 HTML/Excel 解析，正确处理教师、节次、单双周、地点原文、覆盖导入和异常课程跳过。
- 通过 Capacitor 原生定位获取系统融合定位结果，网页端保留标准定位兜底，定位来源对用户统一抽象。
- 建立 pytest、Vitest、Playwright 和 Android Gradle 多层验证体系，覆盖后端规则、前端状态、桌面/手机核心旅程和 Android Release 构建；当前结果见 [测试报告](TEST_REPORT.md)。

## 工程亮点

- 业务规则集中在后端服务和可测试的前端工具中，页面不直接堆叠解析逻辑。
- 课程导入采取整批覆盖语义，无法识别的单条记录不阻断其余课表。
- 地点原文与地图实体解耦，课表查看不依赖地图匹配，路线阶段再提示补全。
- 定位发布同时经过前端可用性判断和后端距离校验。
- 数据库通过 Alembic 迁移演进，运行数据、密钥和构建产物与源码仓库隔离。

## 30 秒介绍

智行是一款面向校园日常的 Android/H5 应用。用户可以导入教务课表、查看单双周课程和教师地点信息，在校园地图中进入地点频道，并根据当前位置和下一节课生成出发建议。前端使用 Vue 3 与 Capacitor，后端使用 FastAPI 与 SQLite；项目包含原生定位、Android 教务导入、数据库迁移和多层自动化验证。

## 技术关键词

Vue 3、TypeScript、Vite、Vant、Pinia、Capacitor、Android、FastAPI、SQLAlchemy、Alembic、SQLite、JWT、高德地图、原生定位、教务课表解析、pytest、Vitest、Playwright、JUnit。
