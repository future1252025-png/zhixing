# 2026-10-27 公网服务维护暂停记录

用户要求暂停网页与 API，维护期间禁止公网业务访问；随后确认风险通知来自 Cloudflare。2026-10-27 07:27（北京时间）暂停访问验证通过，随后已完成平板 `cloudflared` 从 2026.9.3 到 2026.10.4 的升级；升级后公网入口继续关闭。

## 当前状态

| 入口或配置 | 维护状态 |
| --- | --- |
| `https://campusmindapp.com` | 所有路径返回 503 维护页，不加载业务前端 |
| `https://www.campusmindapp.com` | 所有路径返回 503 维护页 |
| `https://campusmind-web.pages.dev` | 当前生产入口返回 503 维护页 |
| `/_AMapService/*` | 返回维护页，不转发地图请求 |
| `https://api.campusmindapp.com` | 专用 Tunnel 已停止；外部返回 530 / Cloudflare 1033 |
| Pages Git 自动发布 | `production_deployments_enabled=false`，`preview_deployment_setting=none` |
| 平板 Tunnel 开机自启 | 原启动文件已移出 `.termux/boot`，备份位置见下文 |
| 平板本机后端 | 仍运行；回环地址 `/health` 为 200，便于维护检查 |

App 的联网登录、同步和聊天等依赖 API 的功能暂不可用。账号、课程、数据库、签名密钥及域名 DNS 未改动。本次只升级 Cloudflare 隧道客户端，没有更新业务后端依赖或用户其他设备。

## Cloudflare 客户端升级

根据用户补充的 Cloudflare 信息，核对到官方 2026-10-20 发布的[eMudhra 证书安全公告](https://blog.cloudflare.com/emudhra-certificate-compromise/)，要求 `cloudflared` 至少升级到 2026.10.2。本次安装的 2026.10.4 是执行时的[最新官方稳定发行](https://github.com/cloudflare/cloudflared/releases/tag/2026.10.4)。没有直接读取用户账户内的通知正文，因此不将本次检查扩大为其他账户告警已清除的结论。

- 原版：`cloudflared 2026.9.3`，Termux 包版本 `2026.9.3-1`。
- 新版：`cloudflared 2026.10.4`，构建时间 `2026.10.26-13:51 UTC`；程序内 Go 版本为 `go1.27.3`。
- 来源：经 apt 验签的 `https://packages.termux.dev/apt/termux-main` 官方仓库，aarch64 包。原南科大镜像当时只有 2026.10.3，故本次使用单独源列表访问官方源，未改写用户长期 apt 源配置。
- 仅升级 `cloudflared` 一个包；没有安装、删除其他包。
- 原包已安装文件备份：`/data/data/com.termux/files/home/server/backups/maintenance-20261027/cloudflared-2026.9.3-1-installed-files.tar.gz`；同目录保存旧包状态、程序哈希及升级结果。
- 已确认原 supervisor 使用的 `--token-file`、`--metrics`、`--no-autoupdate` 参数仍受支持。
- 通过新 `cloudflared access curl` 的实际 TLS 路径访问官方公告链接的测试站点：普通与 AAA 交叉签名链、含 CT 与无 CT 的四个测试域名均以明确 x509 证书错误拒绝。正向对照 `www.cloudflare.com` 已通过 HTTPS 并进入 Access 应用识别阶段；该站无 Access 应用，识别阶段退出 1 属于预期，不是 TLS 失败。这项检查仅覆盖所测 TLS 路径，不代表设备上其他应用的证书验证都已更新。
- 升级期间及升级后均未启动公网 Tunnel。实际重新连接 Cloudflare、App 登录和同步须在允许恢复服务时验收。

## 网页部署与备份

- 项目：Cloudflare Pages `campusmind-web`。
- 维护部署：`b4df121c-e70e-4461-8145-6516ec5a122a`，通过现有项目直接上传；没有向 Git 推送应用代码。
- 维护前生产部署：`e4358cbd-ef51-4ee0-bc72-5db21b602f6f`。
- 维护前生产提交：`4e0b317acc8621c3ab0d53da6619cab2625fa39b`，生产分支 `release/web`。
- 本机维护包、配置快照及检查结果：`E:\智行\Temp\maintenance-20261027`。`before.json` 仅保存非机密配置，不包含运行环境 Secret。
- 维护包的 `_worker.js` 接管所有路径、所有方法；不调用业务 API、静态业务资源或高德代理。维护响应使用 `no-store`，并要求搜索引擎不索引。
- 历史部署保留用于回退；旧部署的唯一地址没有逐一删除，API 停止后均无法访问其业务后端。

## API 暂停方式

专用隧道：`zhixing-tablet`，ID `145bad95-e711-440e-9bb1-973b70c4f5a8`。

已在核验 SSH 主机指纹后完成：

1. 将 `/data/data/com.termux/files/home/.termux/boot/start-campusmind-tunnel` 移至 `/data/data/com.termux/files/home/server/backups/maintenance-20261027/start-campusmind-tunnel`，避免设备重启后重新开放 API。
2. 运行已有 `manage-campusmind-tunnel.py stop`，检查 supervisor PID 为空、connected 为 false。
3. 验证后端本机健康检查仍为 200，没有停止 SSH 或改动数据库。

后续不要在维护完成前手动执行 Tunnel 的 `start`。

## 验证记录

- 本机 20 个维护响应检查通过，覆盖 GET、POST、HEAD、OPTIONS 与首页、课表、旧资源、地图、认证路径。
- 线上 8 个入口检查通过：主域、www、Pages 生产域、深层路由、资源、地图均为 503；API `/health` 与 `/api/courses` 均为 530 / 1033。
- Cloudflare 项目回读确认维护部署为当前成功生产部署、生产自动发布关闭。
- 平板回读确认隧道已停止、开机启动文件已备份移出、本机后端健康。
- 升级完成后重复公网检查，维护状态保持不变；新客户端的 CLI 参数与上述 TLS 检查通过。
- 证据文件位于 `E:\智行\Temp\maintenance-20261027`：`verification.json`、`tablet-paused.json`、`before.json`、`upgrade-cloudflared-result.json`、`verify-cloudflared-tls-result.json`。

## 恢复步骤（维护完成后再执行）

1. Cloudflare 客户端升级已完成；恢复前确认其他维护事项是否结束，并确认本机后端健康。业务后端历史依赖告警并未包含在本次单包升级中。
2. 在平板执行 `python "$HOME/server/bin/manage-campusmind-tunnel.py" start`，核对公网 API、鉴权与会话行为。
3. 确认允许恢复开机启动后，将上述备份的 `start-campusmind-tunnel` 移回原 `.termux/boot` 路径；如原路径已有文件，先比较，不能直接覆盖。
4. 在 Pages 部署历史中回滚到维护前生产部署，或者发布经过升级验收的新版本。Cloudflare 支持[回滚到指定生产部署](https://developers.cloudflare.com/pages/configuration/rollbacks/)。
5. 实测网页登录、同步和地图；最后再按 `before.json` 恢复生产自动发布（原值为 true），预览自动发布继续保持 none。自动发布配置与网页部署回滚是两项独立操作。

以上恢复动作本次均未执行。
