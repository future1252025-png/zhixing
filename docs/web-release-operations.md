# 域名网页版发布操作说明

日期：2026-10-19。项目：Cloudflare Pages `campusmind-web`；源码：GitHub `future1252025-png/zhixing`。

2026-10-27 维护状态：网页已切换为 503 维护页，API Tunnel 已停止并移出开机启动，Pages 生产自动发布已关闭；平板 cloudflared 已从 2026.9.3 升级至 2026.10.4，升级后仍保持暂停。维护完成前不要重新启用 Tunnel 或自动发布。部署标识、验证与恢复步骤见 [公网服务维护暂停记录](maintenance-20261027.md)。

## 构建与本地验证

正式构建使用 `frontend` 的 `build:web`，API 固定为 `https://api.campusmindapp.com`，地图使用主域名的 `/_AMapService` 代理。

```powershell
cd E:\智行\campusmind\frontend
npm ci
# 首次配置时才复制，已有文件请保留。
if (-not (Test-Path .env.web.local)) { Copy-Item .env.web.example .env.web.local }
# 在 .env.web.local 配置 VITE_AMAP_KEY；不要填写 VITE_AMAP_SECURITY_CODE。
npm run test:coverage
npm run test:web
npm run build:web
```

网页构建只允许指定的公开变量进入浏览器，即使本机存在其他 VITE_* 变量也不会默认全部打包。后置检查验证正式配置、静态资源路由以及已知安全密钥未进入客户端。`dist/web-release.json` 包含 API、地图代理和发布提交号，不包含安全密钥。

`npm run build`、`build:e2e`、`build:android` 仍服务各自原有流程，不能把它们生成的 `dist` 当作已验证的域名网页包发布。E2E 会重新生成 `dist`，手动发布前须最后再运行 `build:web`。

`npm run preview:web` 在 `127.0.0.1:8788` 启动 Pages 本地运行环境；地图需要通过被 Git 忽略的 `.dev.vars` 提供 `AMAP_KEY` 和 `AMAP_SECURITY_CODE`。登录 Cookie/来源策略以正式域名为验收环境，本地业务开发继续使用 `npm run dev`，隔离测试使用 `dev:e2e` 和已有测试后端。

## Cloudflare 项目配置

| 项目配置 | 值 |
| --- | --- |
| 生产分支 | `release/web` |
| 根目录 | `frontend` |
| 构建命令 | `npm run build:web` |
| 构建产物 | `dist` |
| 非生产分支自动部署 | 关闭 |
| Node | 22 |

生产构建/运行变量：

- `VITE_API_BASE_URL=https://api.campusmindapp.com`
- `VITE_AMAP_KEY`：高德 Web JS API Key。
- `AMAP_KEY`：与上面的 Key 一致，供函数验证请求。
- `VITE_AMAP_SERVICE_HOST=https://campusmindapp.com/_AMapService`
- `VITE_AMAP_SECURITY_CODE`：留空。
- `AMAP_SECURITY_CODE`：仅作为 Functions 的加密 Secret。

不要把 Windows 上的 `.env.local`、`.env.android.local` 上传到仓库。修改运行环境或 Secret 后需重新部署。API 的 JWT 密钥、数据库及 Tunnel 令牌不属于网页项目配置。

## 域名与跳转

Pages 自定义域名包含 `campusmindapp.com` 和 `www.campusmindapp.com`。DNS 使用：

| 类型 | 名称 | 目标 | 代理 |
| --- | --- | --- | --- |
| CNAME | `@` | `campusmind-web.pages.dev` | 开启 |
| CNAME | `www` | `campusmind-web.pages.dev` | 开启 |

已有同名记录需先确认用途；现有 `api` 隧道记录应保留。DNS 配置后等待 Pages 域名状态为 active，再验证 HTTPS。

Pages 的 `_redirects` 不支持域名级跳转，因此项目使用 Functions 中间件，将 `www`、本项目的 `pages.dev` 与部署别名跳转到主域名，保留路径和查询参数。该实现会让 HTML 导航请求消耗一次函数调用；`/assets/*`、`/icons/*`、manifest 和发布信息由静态托管直接返回。这是相对初版方案“仅地图进入函数”的必要调整。地图请求仍由专用函数处理，不会被 SPA 回退为 HTML。

## 地图代理

只访问固定高德上游，验证 Key、路径、方法、回调名称，设置连接超时和响应大小限制；不转发用户登录 Cookie 或 Authorization，不记录含安全密钥的上游 URL。

真实联调发现高德 JSONP 有时携带 JSON 或 octet-stream MIME 类型，在 nosniff 下会被浏览器拒绝。函数验证回调名与 JSON 内容后，重建为正确 JavaScript MIME 的 JSONP；不移除 nosniff，也不直接执行任意上游脚本。相关回归测试包含错误回调、非 JSON 内容和响应注入。

## 更新与回滚

1. 修改代码并运行相关检查；网页发布至少通过前端覆盖率、代理测试、正式构建及相关浏览器流程。
2. 将通过验证的提交送入 `release/web`，Pages 自动构建；不推送未经验证的开发快照。
3. 查看 Pages 部署阶段，核对 `web-release.json` 的提交与 API 地址，并抽查登录、课表和地图。
4. 发现回归可选择上一条成功生产部署回滚；若问题来自环境变量/Secret，须同时恢复相应配置。不要用数据库回滚处理单纯网页问题。

现有 CI 已扩展到 `release/web`，覆盖地图代理和正式网页构建。`E2E_WEBKIT=true` 可启用移动 WebKit 测试；WebKit 自动化不能代替 iPhone 真机。Cloudflare Git 自动部署与 GitHub CI 是独立触发，发布分支需要受控更新，不能仅凭 push 就宣称测试已通过。

## 首版用户体验与限制

- 网页支持文件导入，保留打开学校网站的链接；Android 原生采集入口只在 App 中展示。
- 支持账号下的提醒计划管理与同步；关闭网页后可能无法提醒。
- “我的”提供添加到主屏幕说明，图标与 manifest 已补齐；首版没有离线 Service Worker。
- 新版本导致旧页面分包加载失败时，会提示联网刷新，并说明未保存内容可能丢失；不自动刷新正在编辑的表单。
- 业务仍依赖平板在线。地图或 API 失联应使用现有错误提示、重试与替代入口。
