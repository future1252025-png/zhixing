# 智行域名网页版上线方案 v1

日期：2026-10-15。本文为执行方案，任务表中的改动与发布操作均待实施。

2026-10-19 更新：本方案已进入实施并完成首次网页部署。实际交付、与原方案的差异及剩余验收项，以 [首发记录](web-release-20261019.md) 和 [操作说明](web-release-operations.md) 为准；下文保留规划时的基线。

## 1. 目标与架构

访问 `https://campusmindapp.com` 即可使用智行，支持电脑浏览器、Android 浏览器与 iPhone Safari；电脑关机后仍能访问。网页与 Android App 共用账号、课表、补课、提醒计划和地点频道数据。

采用现有 Vue 3 + Vite 前端、Cloudflare Pages 静态托管、Pages Functions 地图代理，以及已经运行的平板 FastAPI 后端。不新建一套业务后端。

| 入口 | 责任 | 部署位置 |
| --- | --- | --- |
| `campusmindapp.com` | 正式网页、登录入口、静态资源 | Cloudflare Pages |
| `www.campusmindapp.com` | 跳转到主域名，保留原路径和查询参数 | Cloudflare 域名与跳转规则 |
| `campusmindapp.com/_AMapService/*` | 高德请求代理，服务端添加安全密钥 | 同一 Pages 项目的 Functions |
| `api.campusmindapp.com` | 登录、课程、补课、提醒计划、地点与聊天 API | 现有 Tunnel → 平板 Termux |

Cloudflare 官方支持 Vue 的静态构建与 Git 集成，域名需要在 Pages 项目内关联。[Vue 部署](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vue-site/)、[绑定域名](https://developers.cloudflare.com/pages/configuration/custom-domains/)。

边界：平板仍需保持后端和隧道在线。平板离线时，Cloudflare 托管的页面仍能加载，但需要服务器的业务不可用。已有账号缓存可按现状展示并提示未同步，不把断网后的写入显示成保存成功。后续若需要摆脱平板依赖，再迁移 API 和数据库至云服务器。

## 2. 当前状态与依据

2026-10-15 已进行代码检查与无登录公开接口检查：

- 前端位于 `frontend`，已支持网页运行及静态构建；当前分支为 `feature/platform-hardening`，存在尚未提交的功能改动。
- 本机 `npm run dev` 已经通过开发代理连接平板；该代理仅用于本机，不参与正式托管。
- `https://api.campusmindapp.com/health` 返回 HTTP 200；单次检查约 2.5 秒，仅代表本次连通结果，不是性能基准。
- 主域名与 `www` 的跨域预检均返回 HTTP 200，并返回对应的精确 Origin 和 `allow-credentials: true`。
- 主域名、`www` 的 HTTP 探测未成功；原生 DNS 查询也超时，但 API 的 HTTP 请求成功。因此不能仅据此断言域名未解析，实施时须核查 Cloudflare 控制台、绑定状态与不同网络结果。
- 已有基础 `manifest.webmanifest`，但未配置完整图标，也没有找到 Service Worker 或 Web Push 实现。
- 地图前端已支持 `VITE_AMAP_SERVICE_HOST`，仓库当前未提供可发布的 Pages Functions 地图代理。
- 网页文件导入已存在；原生教务网站采集明确只支持 Android。
- 网页通知使用浏览器能力，当前没有关闭页面后持续可靠提醒的实现。

2026-10-10 的 544 项前端测试、构建及手机交付记录是历史基线。本次方案编制没有重新运行测试，实施时按实际改动重新验证。

## 3. 首版功能范围

| 功能 | 首版交付要求 |
| --- | --- |
| 注册、登录、个人资料、退出与删除账号 | 使用现有正式账号体系，刷新网页可恢复会话，过期时提示重新登录 |
| 首页和课表 | 支持真实教学周、日期作息规则、补课、跳转本周课表和已有滚动恢复 |
| 导入课表 | 网页以 HTML/HTM/XLS/XLSX 文件导入为主，核对课程、学期和时间后保存 |
| 地图和地点频道 | 高德地图、定位、地点选择、进入频道、已有消息交互正常；地图失败时保留已有替代入口 |
| 提醒 | 可管理并同步课程提醒设置和自定义事项；当前页面内提示正常，系统通知按浏览器能力显示 |
| 手机浏览器体验 | 适配安全区、键盘、底部导航、窄屏课表和返回行为；补齐主屏幕图标与使用引导 |

网页版导入页面要突出可用的文件上传和“打开学校教务系统”链接，弱化当前不可用的 Android 原生采集卡片。普通网页无法直接读取另一个网站的已登录页面内容，不能将原生采集按钮原样视为网页的一键导入方案。[浏览器同源限制](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)。

网页版提醒保留一句简明提示：“关闭网页后可能无法提醒。” 对不支持通知的浏览器显示对应状态。首版不承诺后台准点、离线写入或完全替代原生 App；完整 PWA 离线与 Web Push 作为后续功能。iPhone 的主屏幕 Web Push 还需要 Service Worker、推送订阅与服务器发送链路，并非添加图标即可获得。[WebKit 官方说明](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)。

## 4. 实施任务与产物

以下路径为拟修改或新增的位置，不代表现在已经实现。

| 阶段 | 主要工作 | 产物与通过条件 |
| --- | --- | --- |
| A. 正式构建 | 增加 `build:web`、环境模板与配置校验；明确网页和 Android 的构建配置 | `frontend/package.json`、`tools/validateWebProductionEnv.mjs`、`tools/verifyWebProductionBundle.mjs`、`.env.web.example`；有效 API 为正式 HTTPS 地址、地图密钥不进入客户端 |
| B. 地图代理 | 实现固定高德上游转发、Secret 读取、超时和错误处理，限制 Functions 触发范围 | `frontend/functions/_AMapService/[[path]].ts`、`frontend/public/_routes.json`；地图、地点搜索和选择通过实际联网验证 |
| C. 网页体验 | 整理导入页和浏览器通知提示；补图标、页面描述与主屏幕体验；核查 Safari | 导入入口可理解且可操作，课表和弹窗不被键盘或底栏遮挡；修正页面描述仍提到旧出行路线的问题 |
| D. 发布配置 | 整理经过验证的提交，连接 Git、选择网页生产分支、配置环境、域名、跳转和缓存 | Pages 有明确提交版本；正式域名 HTTPS 可用，刷新深层路由不出现 404 |
| E. 验收与交付 | 浏览器回归、真机和不同网络检查、跨端数据验证、更新与回滚演练 | 正式链接、部署记录、测试结果、回滚位置和简明维护说明 |

阶段 A 的构建校验应检查实际生效配置，而不是因代码中存在开发地址的回退字符串就误报；构建环境中的真实密钥必须在产物中不可检出。模板只存占位值，并在 `.gitignore` 中为可提交的 `.env.web.example` 增加例外。

### Pages 配置

| 配置项 | 计划值 |
| --- | --- |
| 项目名称 | `campusmind-web`（若可用） |
| Git 仓库 | `future1252025-png/zhixing` |
| 网页生产分支 | 建议 `release/web`，实施时从明确通过验证的提交创建 |
| 根目录 | `frontend` |
| 构建命令 | `npm run build:web`，须先完成阶段 A 新脚本 |
| 输出目录 | `dist` |
| Node | 22 系列，与当前 CI 一致 |
| `VITE_API_BASE_URL` | `https://api.campusmindapp.com` |
| `VITE_AMAP_KEY` | 配置正式域名白名单的 Web JS API Key |
| `VITE_AMAP_SERVICE_HOST` | `https://campusmindapp.com/_AMapService` |
| `VITE_AMAP_SECURITY_CODE` | 空值，生产校验应拒绝非空值 |
| Functions Secret `AMAP_SECURITY_CODE` | 对应高德安全密钥，仅服务端读取 |

浏览器可见的 Web Key 与安全密钥是两种配置。前者按高德要求使用域名限制，后者由代理保管。高德官方建议生产使用代理方式。[高德安全密钥说明](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)。

地图代理优先采用本项目需要的固定路径映射：普通 Web 服务转发到 `restapi.amap.com`，自定义样式转发到 `webapi.amap.com` 对应路径；其他地图服务仅在实际 SDK 请求需要时按官方映射加入。校验 Key 和允许的请求方法，拒绝任意目标地址、异常路径和非预期重定向；不向高德转发本应用的 Cookie 或 Authorization，不在日志记录带安全密钥的上游完整 URL。

`_routes.json` 只让 `/_AMapService/*` 进入 Functions，HTML、JS、CSS、字体等静态资源直接托管，避免每次打开页面都消耗函数请求额度。[Functions 路由规则](https://developers.cloudflare.com/pages/functions/routing/)。

### 登录、路由与更新

- 正式浏览器直接请求 `api.campusmindapp.com`；不复制本机开发代理的 Origin 改写逻辑。
- 网页与 API 同为 HTTPS 且属于同一主域名，保留现有 `HttpOnly + Secure + SameSite=Strict` 刷新 Cookie、精确 CORS 和 `withCredentials`。必须实测 Safari 的刷新登录与退出。
- 默认 `pages.dev` 不作为业务使用入口；绑定完成后将其跳转到主域名。首版关闭非生产分支自动部署，避免预览页面直接访问真实数据；隔离的本地测试继续使用现有测试后端。
- Vue history 路由需要 SPA 回退，并验收直接打开 `/courses`、`/profile/semester` 后刷新。地图代理错误不能被回退成 HTML 页面。
- HTML 采用可及时更新的缓存策略，带内容哈希的静态资源可长缓存；API 和登录响应不得作为公开缓存。保留已有安全响应头。
- 检查旧页面更新后加载动态分包的失败提示，避免用户长时间停留后白屏。首版不增加会长期缓存旧代码的 Service Worker。
- 开发用地图采集页在生产继续禁用，公共页面描述与隐私说明按实际功能呈现。

## 5. 发布与后续更新流程

1. 审核当前未提交改动，形成明确的待发布提交；运行相关测试与正式网页构建。
2. 配置 CI 检查和网页发布分支策略。当前 CI 的 push 触发只列出 `main`，需要补齐所选发布流程。
3. 连接 Pages Git 集成并配置阶段 A/B 所需环境与 Secret，先完成构建和静态检查。
4. 在 Pages 项目中绑定主域名，核对 DNS、证书和 `www` 跳转。保留现有 API Tunnel 路由。
5. 使用明确的测试账号在正式域名做小范围业务验收，不使用用户的真实课表做批量覆盖测试。
6. 正式启用入口，记录部署 ID、Git 提交和配置版本；确认电脑关机后外部设备仍可使用。

后续按“修改 → CI 检查 → 经检查的提交进入网页发布分支 → Pages 构建发布 → 正式域名抽查”更新。Pages 的 Git 自动构建并不等于自动等待 GitHub CI 成功，必须通过生产分支的合并规则或受控发布流程保证检查先完成。

前端出现回归时，在 Pages 选择上一条已成功的生产部署回滚，并核查环境/Secret 配置是否也发生变化。代码回滚不等于配置或数据库回滚；这次网页首版原则上无需迁移数据库。[Pages 回滚说明](https://developers.cloudflare.com/pages/configuration/rollbacks/)。

## 6. 完成标准

| 验收范围 | 完成标准 |
| --- | --- |
| 访问入口 | 主域名 HTTPS 正常，`www` 跳转保留路径；无需电脑前后端或访问者 Tailscale |
| 会话 | 登录、刷新恢复、退出、会话失效提示正确；跨账号不串用缓存 |
| 课程业务 | 测试账号能导入、编辑、添加补课、配置日期作息；Android 同账号重新同步后数据一致 |
| 地图 | 小地图和大地图可加载，定位授权与拒绝均有可理解结果，选地点可进入对应频道 |
| 提醒 | 计划可保存同步，浏览器能力和实际提示一致；网页关闭后不作原生提醒承诺 |
| 浏览器 | 桌面 Chrome/Edge、Android Chrome、iPhone Safari 真机验证；自动化 WebKit 不能替代 iPhone 验收 |
| 更新 | 深层路由刷新正常，发布新版本后资源可更新，旧页面遇到分包失效有恢复方式 |
| 网络 | 校园 Wi-Fi 与手机蜂窝网络各检查；记录加载和 API 耗时，不凭单次健康检查推断普遍速度 |
| 异常 | API/地图不可达时有重试或替代入口，失败的写操作不显示成功 |
| 交付 | 发布提交、部署配置位置、测试记录与回滚步骤明确；密钥不出现在 Git 或网页产物 |

本次方案阶段不执行线上断网、批量导入、修改数据库或 DNS 等操作。上述“异常”测试优先用隔离环境模拟，正式环境只做已明确范围的验收。

## 7. 成本、工期与资源

首版先使用 Pages 免费档。当前官方列出的免费额度包括每月 500 次构建；Pages Functions 与同账号 Workers 免费请求共享每天 100,000 次额度。静态资源与函数应按上面的路由拆分，地图调用还受高德独立额度约束，不能把这些额度换算成固定可承载人数。[Pages 限额](https://developers.cloudflare.com/pages/platform/limits/)、[Functions 费用](https://developers.cloudflare.com/pages/functions/pricing/)。

现有域名续费继续承担；首版无需新增云服务器。是否升级套餐，依据实际 Functions 用量、地图额度及访问表现再决定。

按当前代码量粗估 2–4 个工作日：构建与部署准备约半天，地图代理与网页体验约 1–2 天，域名联调与多端验收约 1 天。该估算不含账号授权等待、DNS/证书生效等待及缺少 iPhone 真机时的等待，也不包含后续 Web Push 或 iOS 原生开发。

实施需要：可用的 Cloudflare 项目/域名管理权限、GitHub 仓库连接、高德应用配置入口、明确的测试账号，以及一台用于 Safari 验收的 iPhone。凭据通过平台授权或 Secret 配置，不放在文档或公开聊天中。

首版交付后，再分别评估离线课表与后台 Web Push；若平板在线率或访问延迟不能满足校内使用需求，再安排后端托管迁移。
