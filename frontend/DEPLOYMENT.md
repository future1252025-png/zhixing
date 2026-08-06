# 前端部署安全头

Vite 的开发服务器和 `vite preview` 已返回防嵌入、禁止 MIME 嗅探及严格来源策略。`strict-origin-when-cross-origin` 在跨站请求中只发送来源，不泄露完整页面路径，同时保留地图服务常用的来源校验。构建时，`public/_headers` 会复制到 `dist/_headers`，可供支持该约定的静态托管平台读取。

`_headers` 只是部署配置文件，不会让任意 Web 服务器自动生效。使用 Nginx、CDN 或对象存储托管时，必须在实际 HTML 响应上配置等价的响应头，并在部署后通过浏览器网络面板或 `curl -I` 验证：

```text
Content-Security-Policy: frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

当前 CSP 只限制 `frame-ancestors`，不会拦截高德地图脚本、地图资源或浏览器定位。不要用 `<meta>` 声明 `frame-ancestors`；浏览器只在 HTTP 响应头中执行该指令。

## 高德安全密钥代理模式（生产推荐）

高德 JSAPI 2.0 需要配合安全密钥使用。开发环境可直接配置 `VITE_AMAP_SECURITY_CODE`（明文注入 `window._AMapSecurityConfig.securityJsCode`），但该密钥会随构建产物暴露给所有访问者。生产环境推荐改用高德官方的代理方案：配置 `VITE_AMAP_SERVICE_HOST` 指向自有域名下的 `_AMapService` 路径，由 Nginx 在转发时附加 `jscode`，安全密钥只保存在服务器上。

```text
VITE_AMAP_SERVICE_HOST=https://your-domain.com/_AMapService
```

Nginx 配置示例（将 `你的安全密钥` 替换为高德控制台生成的安全密钥）：

```nginx
# 自定义地图、海外地图服务
location /_AMapService/v4/map/styles {
    set $args "$args&jscode=你的安全密钥";
    proxy_pass https://webapi.amap.com/v4/map/styles;
}
location /_AMapService/v3/vectormap {
    set $args "$args&jscode=你的安全密钥";
    proxy_pass https://fmap01.amap.com/v3/vectormap;
}

# Web 服务 API（搜索、路径规划等）
location /_AMapService/ {
    set $args "$args&jscode=你的安全密钥";
    proxy_pass https://restapi.amap.com/;
}
```

部署后可在浏览器网络面板确认地图接口请求走 `/_AMapService/` 前缀且响应正常；若未配置 `VITE_AMAP_SERVICE_HOST`，前端会回退到明文安全密钥模式，并在生产构建的控制台输出警告。
