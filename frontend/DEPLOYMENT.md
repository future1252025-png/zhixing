# 前端部署安全头

Vite 的开发服务器和 `vite preview` 已返回防嵌入、禁止 MIME 嗅探及无来源信息策略。构建时，`public/_headers` 会复制到 `dist/_headers`，可供支持该约定的静态托管平台读取。

`_headers` 只是部署配置文件，不会让任意 Web 服务器自动生效。使用 Nginx、CDN 或对象存储托管时，必须在实际 HTML 响应上配置等价的响应头，并在部署后通过浏览器网络面板或 `curl -I` 验证：

```text
Content-Security-Policy: frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

当前 CSP 只限制 `frame-ancestors`，不会拦截高德地图脚本、地图资源或浏览器定位。不要用 `<meta>` 声明 `frame-ancestors`；浏览器只在 HTTP 响应头中执行该指令。
