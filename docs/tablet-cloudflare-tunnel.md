# 平板固定域名部署

更新：2026-10-08。

## 地址和配置范围

- 域名：`campusmindapp.com`，DNS 已由 Cloudflare 管理。
- 固定 API 地址：`https://api.campusmindapp.com`，已于 2026-10-08 验证公网访问。
- 后端位于 Termux：`/data/data/com.termux/files/home/server/apps/campusmind-backend`，端口 `8000`。
- Cloudflare 远程管理隧道：`zhixing-tablet`。
- 隧道 ID：`145bad95-e711-440e-9bb1-973b70c4f5a8`（这是标识符，不是连接令牌）。

购买域名不会自动发布后端。用户已在 Cloudflare 后台添加以下已发布应用路由：

| 配置 | 值 |
| --- | --- |
| 子域名 | `api` |
| 域名 | `campusmindapp.com` |
| 路径 | 留空 |
| 服务类型 | `HTTP` |
| 服务地址 | `127.0.0.1:8000` |

此地址是平板本机地址，不是电脑的 localhost。手机使用公网 HTTPS 地址，不使用这个 HTTP 地址。

## 平板端运行方式

使用已安装的 Termux `cloudflared 2026.9.3`，不执行 Windows 安装命令或 `sudo systemctl`。

- 连接令牌：`/data/data/com.termux/files/home/.cloudflared/zhixing-tablet.token`，权限 `0600`，父目录 `0700`。
- 管理脚本：`/data/data/com.termux/files/home/server/bin/manage-campusmind-tunnel.py`。
- 开机入口：`/data/data/com.termux/files/home/.termux/boot/start-campusmind-tunnel`。
- 日志目录：`/data/data/com.termux/files/home/server/logs/cloudflared`。
- 就绪探针：`http://127.0.0.1:20241/ready`，只监听平板回环地址，不发布到公网。

在平板 Termux 或 SSH 终端运行：

```sh
python "$HOME/server/bin/manage-campusmind-tunnel.py" status
python "$HOME/server/bin/manage-campusmind-tunnel.py" start
python "$HOME/server/bin/manage-campusmind-tunnel.py" stop
```

管理脚本使用文件锁防止重复运行。连接器异常退出会重启，重试间隔逐步增加，最高 60 秒；正常网络断线也由 cloudflared 自身重连。日志按大小轮换。

开机脚本已添加，但本次未重启平板验证。它依赖 Termux:Boot 和系统允许后台运行；Android 强行停止 Termux 或杀死全部相关进程仍可能使服务停止。不要把进程重启机制当成设备永不掉线的保证。

## 后端生产配置

启动脚本已备份后调整，保留数据库和原有签名密钥，不重新生成密钥：

- `APP_ENV=production`。
- `JWT_SECRET_KEY` 在启动时从原有私密文件加载，满足生产环境显式配置校验。
- 浏览器 CORS 白名单：`https://campusmindapp.com`、`https://www.campusmindapp.com`、`https://api.campusmindapp.com`。
- 浏览器刷新凭据的 Cookie 启用 Secure；Android 原生 HTTP 刷新流程不依赖开发用 localhost CORS。
- 原启动脚本备份：`/data/data/com.termux/files/home/server/backups/domain-campusmindapp-20261008-180539/start-campusmind-backend`。

此次未修改应用代码、数据库模式或课程数据。开发网页的 HTTP localhost 来源不在生产 CORS 白名单中，应连接本地开发后端；正式网页使用上面的 HTTPS 来源。

## 当前验证状态

- 平板后端健康接口：成功。
- 运行中后端确认为 production，签名密钥与原文件一致。
- 未登录读取课表：`401`，没有因域名部署绕过鉴权。
- 正式网页来源的 CORS 预检：`200`。
- 隧道连接器已连接 Cloudflare，平板就绪探针成功。
- 重复执行 `start` 不产生第二个 supervisor。
- 手动终止已核实身份的连接器后，supervisor 在约 3 秒后启动新连接器，就绪探针恢复成功；后端未受影响。
- 2026-10-08 18:31–18:33（北京时间）公网复核：Google DNS-over-HTTPS 查询 `api.campusmindapp.com` 成功，解析到 Cloudflare 公网地址。
- 公网 `/health` 返回 `200`，TLS 证书校验成功；后续三次健康检查均成功，耗时约 2.65–3.85 秒。
- 公网 `/api/courses` 无凭据返回 `401`。正式网页来源预检返回 `200`，允许的来源精确为 `https://campusmindapp.com`；不在白名单的来源返回 `400`。
- 一次跨域预检请求出现 TLS 握手失败，重试成功；不能据此保证所有网络长期稳定。本机 Mihomo TUN 正在运行，本轮不属于手机无代理直连测试。

## 手机端更新与直连验证

2026-10-08 22:52（北京时间）已将新版覆盖安装到连接的 Xiaomi 14（Android 16），应用包名 `com.campusmind.zhixing`。未卸载应用、清空数据或更改课程、提醒与账号数据，原登录状态保留。

- Android 本地构建配置 `.env.android.local` 的 `VITE_API_BASE_URL` 已改为 `https://api.campusmindapp.com`。该文件不提交到 Git；其他构建机器需要单独配置。
- 检查构建后的 JS：包含固定域名，不再包含旧 Tailscale API 地址；原生 HTTP 已启用，WebView 混合内容已关闭。
- 前端 68 个测试文件、530 个测试通过，Android 前端构建及 Capacitor 同步成功。
- `assembleDebug testDebugUnitTest` 成功，原生单测报告为 3 个测试、0 失败、0 错误（原生测试任务命中缓存）。
- 沿用原安装包的调试签名，通过 `adb install -r` 覆盖安装。已核实手机实际安装包与本地 APK 的 SHA-256 一致：`31A389464A67EEDD0D78C1A3DC30DA0695BEE98C5A79C8A0D9BE3E597F715F23`。
- 验证时手机使用移动数据：无活动 Wi-Fi、无活动 VPN 网络，Tailscale 和 Clash 均未运行，系统 HTTP 代理为空。未为测试更改手机网络配置。
- 手机直接请求固定域名 `/health` 返回 `200`，TLS 校验成功，单次耗时约 1.82 秒。
- App 自身原生 HTTP 请求 `/health` 返回 `200`（单次约 0.95 秒）；不带凭据请求 `/api/courses` 返回 `401`，鉴权保持有效。
- 使用 App 原有登录凭据强制重新读取服务器数据：21 条课程读取成功，学期信息加载成功；提醒页面同步成功且非离线状态。只记录加载状态和数量，不记录凭据或课程详情。
- 已检查首页、课表、提醒和我的页面，并在强制关闭、重新启动 App 后复核：登录恢复成功，课程、学期和提醒仍可从服务器读取。测试结束停留在首页。

以上验证覆盖固定域名下的手机无 VPN 直连、已有账号会话恢复与数据读取；没有新增或修改测试课程、发送聊天消息，也不代表已完成所有写入流程、所有网络及长时间在线稳定性测试。平板仍需联网并持续运行后端和隧道；Tailscale 可以继续用于 SSH 运维，但手机访问 App 不再依赖它。

本次为与旧安装包同签名的调试版更新，不是应用商店正式发布包。高德地图现有开发配置未更改；正式发布前仍需配置高德 HTTPS 服务代理，并通过 `android:sync` 的正式发布校验。本次没有放宽该校验。API 使用 HTTPS、WebView 混合内容关闭，不等同于调试版在系统层面禁止全部明文请求。

## 令牌与权限

连接令牌只用于运行该隧道，不具备修改域名 DNS 或后台路由的管理权限。通过 Cloudflare 后台维护路由。

不要把令牌、包含令牌的安装命令、JWT 密钥、账号密码提交到 Git，或粘贴到聊天和公开日志。令牌泄露时应在 Cloudflare 后台轮换并替换平板上的私密文件。
