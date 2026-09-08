# 腾讯云云开发（CloudBase）后端部署指南

> 适用场景：Cloudflare `*.workers.dev` 在大陆网络不通时，改用腾讯云云开发作为分析后端。
> 前端代码（`analytics.html` / `track.js`）无需改动，只需把 `analytics-config.js` 的 `endpoint` 换成腾讯云函数地址。

## 一、开通云开发（约 5 分钟，需实名）

1. 打开 https://console.cloud.tencent.com/tcb 用微信/QQ 登录，**完成实名认证**（国内服务必需）。
2. 新建一个**环境**（免费版或基础版均可，个人低流量基本在免费额度内）。
3. 记住环境 ID（形如 `resume-xxxxxx`）。

## 二、创建数据库集合

1. 进入云开发控制台 → **数据库** → **新建集合**，名称填 `analytics_events`。
2. 权限设置：选“**所有用户可读写**”即可（函数用管理端 SDK 写入，前端不直接连数据库）。

## 三、部署云函数

1. 云开发控制台 → **云函数** → **新建云函数**：
   - 函数名称：`resume-analytics`
   - 运行环境：Nodejs 16/18
   - 创建后进入函数 → **函数代码**。
2. 把本目录 `index.js` 的内容**全部粘贴**覆盖到 `index.js`（入口文件）。
3. `package.json` 同目录放一份（已在本目录提供），依赖为 `@cloudbase/node-sdk`。
4. 在控制台点击 **云端安装依赖**（或本地 `npm install` 后打包上传）。
5. 保存。

## 四、开启 HTTP 触发

1. 云函数 → `resume-analytics` → **触发管理** → **创建触发** → 类型选 **HTTP 触发**。
2. 触发路径可留默认，创建后会得到一个访问路径，形如：
   `https://<环境ID>.api.tcloudbasegateway.com/<path>`
   或 `https://<环境ID>.ap-shanghai.service.tcloudbase.com/<path>`
3. 复制**完整地址**（到最后一个斜杠之前作为 endpoint 根，例如
   `https://abc.ap-shanghai.service.tcloudbase.com/resume-analytics`）。

## 五、填回前端配置

打开仓库根目录 `analytics-config.js`：

```js
window.ANALYTICS = {
  endpoint: "https://<上面复制的地址>/resume-analytics"   // 结尾不要带斜杠
};
```

提交后，看板与埋点立即生效。

## 六、验证

1. 浏览器打开 `<endpoint>/health`，应返回 `{"ok":true}`。
2. 打开 `https://oi-ctfsky.github.io/revenue-dashboard/analytics.html`，
   多浏览几个作品集页面，看板每 15 秒刷新即可看到访问记录。

## 七、说明

- 腾讯云函数从请求头 `x-forwarded-for` 取真实访客 IP（客户端无法伪造）。
- 城市/地区字段在腾讯云版暂不解析（保持空白），如需可后续接入 IP 库。
- 数据存储在云开发数据库 `analytics_events` 集合中，按天分文档，可随时在控制台导出。
