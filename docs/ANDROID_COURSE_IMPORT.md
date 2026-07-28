# 湖北大学教务系统导入（Android）

## 用户流程

1. 在“课表导入”选择“进入教务系统并导入”。
2. App 内打开湖北大学官方教务系统：`https://jwxt.hubu.edu.cn/jsxsd/`。
3. 学生在学校页面完成登录，进入“学期理论课表”并选择学年学期。
4. 点击右下角“导入课表”。App 只提取当前课表表格的可见文字。
5. 回到智行逐行预览，确认课程、周次和完整地点后再提交。

## 隐私与安全边界

- 学号、密码和登录 Cookie 不发送给智行前端或后端。
- 原生浏览器只允许访问 `hubu.edu.cn` 及其子域的 HTTPS 页面，阻止明文 HTTP、非官方域名、混合内容和 SSL 证书异常。
- 页面脚本不会获得原生接口；采集只在学生点击“导入课表”后执行。
- 采集结果会转换成仅含表格文字、行列与合并单元格信息的 HTML，不保留脚本、表单、链接或事件属性。
- 来源地址移除查询参数和片段，避免携带可能存在的登录票据。
- 采集文件限制为 5 MB，写入 App 私有缓存，读取后立即删除。
- 导入继续沿用现有预览与整批提交接口，不会绕过地点确认和后端校验。

## Android 构建配置

Capacitor App 内的网页运行在本地容器中，不能依赖网页部署时的同源反向代理。复制 Android 环境变量模板并填写可由手机访问的 HTTPS 后端：

```powershell
cd frontend
Copy-Item .env.android.example .env.android.local
```

至少需要配置：

```env
VITE_API_BASE_URL=https://你的后端域名
```

不要使用 `127.0.0.1` 或 `localhost`：在实体手机上它们指向手机本身。调试 Android 模拟器时可按本机网络配置使用专用宿主地址，但发布包必须使用 HTTPS 后端。

构建并同步：

```powershell
npm run android:sync
npm run android:test
```

Android 工程位于 `frontend/android`，应用 ID 为 `com.campusmind.zhixing`，最低 Android API 为 24。
