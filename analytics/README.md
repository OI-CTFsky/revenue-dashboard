# 访客数据分析后端部署说明（Cloudflare Workers + KV）

本目录包含：
- `track.js`：注入到各页面的埋点脚本（已自动加进 5 个页面）。
- `worker.js`：Cloudflare Worker，接收访客事件写入 KV，并提供 `/stats` 聚合接口。
- `wrangler.toml`：Worker 部署配置（需替换 KV id）。
- `../analytics-config.js`：前端读取的后端地址（填好 Worker 地址即可生效）。
- `../analytics.html`：数据看板页面（你的平台根目录 /analytics.html）。

## 为什么用 Cloudflare
GitHub Pages 是纯静态托管，没有服务器端，拿不到访客 IP、也没法存数据。Cloudflare Workers + KV 免费、无需信用卡，能拿到真实访客 IP / 地区（由 Cloudflare 请求头提供），并实时聚合。Worker 代码已提交在 GitHub 仓库中。

## 一、部署 Worker（只需做一次）
```bash
# 1. 安装并登录（免费账号即可，无需信用卡）
npm install -g wrangler
wrangler login

# 2. 创建 KV 命名空间，复制输出的 id
wrangler kv namespace create ANALYTICS_KV

# 3. 把上一步的 id 填进 wrangler.toml 的 REPLACE_WITH_YOUR_KV_ID
#    [[kv_namespaces]]
#    binding = "ANALYTICS_KV"
#    id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# 4. 部署
wrangler deploy
# 部署成功会返回地址，形如 https://resume-analytics.<subdomain>.workers.dev
```

## 二、填地址
打开仓库根目录的 `analytics-config.js`，把 endpoint 改成你的 Worker 地址：
```js
window.ANALYTICS = {
  endpoint: "https://resume-analytics.your-subdomain.workers.dev"
};
```
提交后，看板（/analytics.html）和埋点即生效，无需重新部署 Pages。

## 三、数据字段说明
每条访客事件记录：会话 ID、页面路径、事件类型(view/end/ping)、时间戳、停留毫秒、User-Agent、来源页、屏幕分辨率、点击过的作品集链接、真实 IP、国家/城市（由 Cloudflare 提供）。
看板展示：总访问（会话数）、独立访客（IP）、当前在线、平均停留、总浏览量、各页面访问次数、作品集各项目查看次数、最近访问明细（IP / 地区 / 进入时间 / 停留 / 浏览页面）。

## 四、隐私提示
看板会显示访客 IP 与地区，属于你的私有数据。建议不要把它放进网站公开导航；直接访问 `你的域名/analytics.html` 即可。如需限制访问，可给 Worker 加一个简单的访问口令校验。
