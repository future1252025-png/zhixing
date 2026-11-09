# 网页接入平板与域名部署方案

更新日期：2026-10-10。区分已完成的本机接入与尚未执行的公网部署。

2026-10-15 已补充 [域名网页版上线方案 v1](web-domain-release-plan-v1.md)，包含当前状态核查、首版范围、具体实施任务、验收及发布回滚流程。后续上线按该方案推进；本文保留 10 月 10 日的接入说明与验证记录。

## 已完成：本机网页连接平板

```powershell
cd E:\智行\campusmind\frontend
npm run dev
```

浏览器打开 `http://127.0.0.1:5173`。电脑无需运行 Python 后端，平板后端与 Cloudflare Tunnel 需要在线。账号和数据与手机使用的域名后端一致，旧电脑开发数据库的账号不会自动迁移。网页保存或删除操作直接作用于平板真实数据。

连接链路：本机浏览器 → 仅监听 loopback 的 Vite → HTTPS `api.campusmindapp.com` → 平板后端。

- `dev` 显式设置 API 为同源 `/`，覆盖已有 `.env.local` 中的 localhost API 地址，但不改动用户的地图配置。
- `/api/`、`/health`、`/openapi.json` 才进入固定目标转发；不提供任意 URL 转发或 WebSocket 转发。
- 转发前校验本机来源、Host、Origin 与 Fetch Metadata；非读取请求必须有同源 Origin，再转换为后端已允许的 Origin。
- 不增加生产 CORS 白名单、不关闭 HTTPS 证书验证、不改动生产 Cookie 安全标志。已验证 Edge 在 loopback 上接受并发送 Secure + HttpOnly + SameSite=Strict 测试 Cookie。
- `npm run dev:local` 保留原有隔离本地后端开发方式，读取 `.env.local`。E2E 和 Android 配置不受影响。
- Vite 开发服务器不能当公网生产服务器使用，也不能直接把本机端口通过 Tunnel 公开。

本次验证：前端 71 个测试文件、544 项测试通过；类型检查与构建通过；Edge 加载登录页无脚本错误或失败请求；经本机入口实测平板 `/health` 为 200、OpenAPI 含 `time_rules`、未登录接口为 401；恶意 Origin 与无 Origin 的 POST 被本机拒绝为 403。电脑端 8000 端口未启动监听。未使用真实用户凭据登录或修改线上数据，真实账号的登录及业务保存仍需用户验收。

## 推荐方案：Cloudflare Pages 网页 + 平板 API

| 地址 | 用途 | 实际运行位置 |
| --- | --- | --- |
| `https://campusmindapp.com` | 正式网页版 | Cloudflare Pages 静态托管 |
| `https://www.campusmindapp.com` | 可选入口，重定向到主域名 | Cloudflare 域名/重定向配置 |
| `https://api.campusmindapp.com` | 登录、课程、聊天室等 API | 现有 Tunnel → 平板 FastAPI |

这是根据现有 Vue 静态前端和已运行的 Tunnel 提出的方案。Pages 支持 Vue 的 `npm run build` / `dist` 发布及 Git 自动构建，绑定自定义域名须在 Pages 项目中完成关联，而不是仅添加 DNS 记录。[Vue 部署文档](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vue-site/)、[自定义域名文档](https://developers.cloudflare.com/pages/configuration/custom-domains/)。

部署完成后，电脑关机也能访问网页，不用手动开启本地前后端，访问者也无需 Tailscale。平板仍承担数据库和 API，必须保持后端与隧道在线；平板离线时静态网页可加载，但登录、读写课表和聊天不可用。若还要脱离平板，再单独迁移 API 和数据库至云服务器，这不是仅配置域名就能完成的。

### 发布步骤（待执行）

1. 整理并提交需要上线的前端改动，push 后选择确认过的生产分支。本机未提交文件不会被 Pages 的 Git 构建读取；不能直接假设远端 `main` 已含最新功能。
2. 在 Cloudflare 的 Workers & Pages 中创建 Pages 项目，连接已有 GitHub 仓库 `future1252025-png/zhixing`。
3. 项目根目录填 `frontend`（仓库根目录已是本机的 `campusmind`），构建命令 `npm run build`，产物目录 `dist`，Node 选择兼容项目的 22+ 版本。
4. 设置以下正式构建变量，并准备高德服务端代理；不能直接上传本地默认构建的 `dist`。

   | 构建变量 | 正式值 |
   | --- | --- |
   | `VITE_API_BASE_URL` | `https://api.campusmindapp.com` |
   | `VITE_AMAP_KEY` | 已配置域名白名单的高德 Web Key |
   | `VITE_AMAP_SERVICE_HOST` | 已部署的 `https://campusmindapp.com/_AMapService` |
   | `VITE_AMAP_SECURITY_CODE` | 留空，安全密钥只能由服务端代理持有 |

5. 高德代理需单独实现，可选 Pages Functions/Worker 或已有服务器反代；纯静态 Pages 不会自动提供该接口。沿用 [前端部署](../frontend/DEPLOYMENT.md) 的目标路径映射，只允许固定高德上游，不做任意地址代理；密钥使用服务端 Secret，并设置必要的用量限制。不要把安全密钥作为 `VITE_*` 打进网页。
6. 在 Pages 项目的自定义域名中绑定 `campusmindapp.com`，确认 DNS 和 HTTPS 生效；保留现有 `api` Tunnel 记录不动。需要 `www` 时再加别名及跳转。
7. 用正式域名做下面的验收，最后关闭电脑确认访问仍可用。

### 登录、路由与验收注意事项

- 当前 API CORS 已列入 `https://campusmindapp.com` 与 `https://www.campusmindapp.com`；发布前再次确认精确匹配，不能改成通配符。
- 正式网页和 API 同为 HTTPS 且同属 `campusmindapp.com`，可继续采用当前 Strict 刷新 Cookie。前端的跨源请求已启用 `withCredentials`。
- `*.pages.dev` 与 API 不是同站点，且不在当前 CORS 白名单，不能把它当成正式登录测试地址；不要为预览放宽 Cookie 或来源校验。
- Vue 使用 history 路由。Pages 默认在没有顶层 `404.html` 时按 SPA 返回入口页，发布后仍需验证直接打开及刷新 `/courses`、`/profile` 不会 404。[Pages 路由行为](https://developers.cloudflare.com/pages/configuration/serving-pages/)。
- 保留已有 `public/_headers` 的防嵌入等安全头；API 响应不可配置为公开缓存。
- 分别验收登录、刷新保持登录、登出、课表加载、日期生效时间规则、网页版各导入入口、地图定位与地点选择、聊天室，以及页面失联时的提示。真实保存测试需使用明确的测试账号，避免污染用户数据。
- 分别使用电脑宽带、手机 Wi-Fi/蜂窝网络检查网页和 API 的可用性与延迟。不能仅凭 DNS 生效就宣称所有校园网络均可访问。

备选是把静态网页也放平板上由 Nginx/Caddy 提供，再给同一 Tunnel 增加网页域名。它同样无需电脑，但网页和数据都依赖平板，故现阶段优先采用 Pages 分离托管。

本次仅完成本机接入并给出部署方案，未创建 Pages 项目、发布公开网页、修改 DNS，也未重新安装手机 App。
