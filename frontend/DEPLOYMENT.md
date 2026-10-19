# 前端部署

域名网页版使用 Cloudflare Pages 项目 `campusmind-web`，正式入口为 `https://campusmindapp.com`，API 为 `https://api.campusmindapp.com`。实施范围见 [上线方案](../docs/web-domain-release-plan-v1.md)，构建、域名和更新操作见 [网页发布操作说明](../docs/web-release-operations.md)。首次上线的实际验证结果记录在交付记录中。

## HTTP 响应头

Vite 的开发服务器和 `vite preview` 已返回防嵌入、禁止 MIME 嗅探及严格来源策略。`strict-origin-when-cross-origin` 在跨站请求中只发送来源，不泄露完整页面路径，同时保留地图服务常用的来源校验。构建时，`public/_headers` 会复制到 `dist/_headers`，可供支持该约定的静态托管平台读取。

`_headers` 适用于支持该约定的托管平台。Nginx、CDN 或对象存储使用等价的 HTML 响应头；部署结果可通过浏览器网络面板或 `curl -I` 检查：

```text
Content-Security-Policy: frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

当前 CSP 只限制 `frame-ancestors`，不会拦截高德地图脚本、地图资源或浏览器定位。浏览器只在 HTTP 响应头中执行 `frame-ancestors`，`<meta>` 声明不会生效。

## 高德服务代理

高德 JSAPI 2.0 配合安全密钥使用。开发配置可通过 `VITE_AMAP_SECURITY_CODE` 注入 `window._AMapSecurityConfig.securityJsCode`；该值会进入前端构建产物。生产配置使用高德代理模式：`VITE_AMAP_SERVICE_HOST` 指向自有域名下的 `_AMapService` 路径，Nginx 转发时附加 `jscode`，安全密钥位于服务器配置中。

```text
VITE_AMAP_SERVICE_HOST=https://your-domain.com/_AMapService
```

Nginx 配置示例中的 `<AMAP_SECURITY_CODE>` 对应高德控制台生成的安全密钥：

```nginx
# 自定义地图、海外地图服务
location /_AMapService/v4/map/styles {
    set $args "$args&jscode=<AMAP_SECURITY_CODE>";
    proxy_pass https://webapi.amap.com/v4/map/styles;
}
location /_AMapService/v3/vectormap {
    set $args "$args&jscode=<AMAP_SECURITY_CODE>";
    proxy_pass https://fmap01.amap.com/v3/vectormap;
}

# Web 服务 API（搜索、路径规划等）
location /_AMapService/ {
    set $args "$args&jscode=<AMAP_SECURITY_CODE>";
    proxy_pass https://restapi.amap.com/;
}
```

地图接口在代理模式下使用 `/_AMapService/` 前缀。未配置 `VITE_AMAP_SERVICE_HOST` 时，前端回退到构建时安全密钥模式，并在生产构建的控制台输出警告。
