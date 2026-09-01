# 仓库阅读指南

## 推荐顺序

1. [README.md](../README.md)：产品定位、地点聊天室特色、技术栈和快速启动。
2. [FEATURE_SUMMARY.md](FEATURE_SUMMARY.md)：地点/教室聊天室及其他当前功能边界。
3. [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md)：网页、Android 与后端关系。
4. [TEST_REPORT.md](TEST_REPORT.md)：最新验证基线。
5. [RUNNING_GUIDE.md](RUNNING_GUIDE.md)：本地和真机运行。
6. [TECHNICAL_HIGHLIGHTS.md](TECHNICAL_HIGHLIGHTS.md)：工程亮点。

## 代码入口

### 后端

| 路径 | 作用 |
| --- | --- |
| `backend/app/main.py` | FastAPI 应用入口 |
| `backend/app/api/messages.py` | 地点/教室聊天室列表、浏览与发布接口 |
| `backend/app/services/message_service.py` | 匿名留言、频道隔离、位置准入、分页与频率限制 |
| `backend/app/api/` | 认证、地点、课程、学期和出发建议等其他接口 |
| `backend/app/services/` | 导入、周次、定位距离和其他业务规则 |
| `backend/migrations/` | Alembic 数据库迁移 |
| `backend/tests/` | 后端回归测试 |

### 前端与 Android

| 路径 | 作用 |
| --- | --- |
| `frontend/src/pages/` | 主要页面 |
| `frontend/src/pages/BuildingChatroomsPage.vue` | 地点与教室聊天室选择页 |
| `frontend/src/pages/BuildingMessagesPage.vue` | 匿名留言流、定位校验与发布页 |
| `frontend/src/components/RealCampusMap.vue` | 地图、点位与路线 |
| `frontend/src/utils/deviceGeolocation.ts` | Android/网页定位统一入口 |
| `frontend/src/native/` | 教务系统导入桥接 |
| `frontend/e2e/` | Playwright 核心用户旅程 |
| `frontend/android/` | Capacitor Android 工程 |

## 仓库约定

- `.env.local`、`.env.android.local`、数据库、日志、构建产物和 APK 均位于版本控制排除范围内。
- 带日期的测试报告仅代表当时版本；当前基线以 [TEST_REPORT.md](TEST_REPORT.md) 为准。
- 功能说明以当前代码和可复现验证结果为准。
- 功能变更至少运行对应测试；涉及共享前端时同时验证网页和 Android 构建。
