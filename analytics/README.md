# 访客数据分析后端部署说明（Cloudflare Workers + KV）

本目录包含：
- `track.js`：注入到各页面的埋点脚本（已自动加进 5 个页面）。
- `worker.js`：Cloudflare Worker，接收访客事件写入 KV，并提供 `/stats` 聚合接口。
- `wrangler.toml`：Worker 部署配置（KV id 已填好）。
- `../analytics-config.js`：前端读取的后端地址（填好 Worker 地址即可生效）。
- `../analytics.html`：数据看板页面（你的平台根目录 /analytics.html）。
- `../.github/workflows/deploy-worker.yml`：GitHub Actions 自动部署工作流。

## 为什么用 Cloudflare

GitHub Pages 是纯静态托管，没有服务器端，拿不到访客 IP、也没法存数据。Cloudflare Workers + KV 免费、无需信用卡，能拿到真实访客 IP / 地区（由 Cloudflare 请求头提供），并实时聚合。Worker 代码已提交在 GitHub 仓库中。

---

## 推荐方案：GitHub Actions 自动部署（无需本地 wrangler）

如果你本地 `wrangler deploy` 遇到 Windows 权限错误，直接用 GitHub Actions 部署更方便。

### 1. 创建 Cloudflare API Token

1. 打开 https://dash.cloudflare.com/profile/api-tokens
2. 点击 **Create Token**
3. 选择模板 **Edit Cloudflare Workers**
4. 在权限里确认包含：
   - `Cloudflare Workers:Edit`
   - `Account:Read`
   - `Zone:Read`（可选）
   - `Workers KV Storage:Edit`
5. 选择你的 Cloudflare 账户，点击 **Continue to summary → Create Token**
6. 复制生成的 Token（只显示一次）

### 2. 在 GitHub 仓库设置 Secrets

1. 打开仓库 `OI-CTFsky/revenue-dashboard` 的 **Settings → Secrets and variables → Actions**
2. 点击 **New repository secret**
3. 添加两个 secret：
   - `CLOUDFLARE_API_TOKEN`：上一步复制的 Token
   - `CLOUDFLARE_ACCOUNT_ID`：你的 Cloudflare 账户 ID，在这里找 https://dash.cloudflare.com/（右侧边栏会显示）

### 3. 触发自动部署

Secret 设置好后，推送任意 `analytics/` 目录下的改动到 main 分支即可触发：

```bash
git add analytics/
git commit -m "deploy analytics worker via actions"
git push origin main
```

如果不需要改文件，也可以到仓库的 **Actions → Deploy Cloudflare Worker → Run workflow** 手动触发。

部署成功后，在 Actions 日志里会显示 Worker 地址：

```
https://resume-analytics.<subdomain>.workers.dev
```

---

## 备选方案：本地 wrangler 部署

如果更喜欢本地操作，可以关掉杀毒软件/Windows Defender 后重试，或以管理员身份运行 PowerShell：

```bash
npm install -g wrangler
wrangler login
wrangler deploy          # 在 analytics 目录下执行
```

---

## 填地址

部署成功后，把 Worker 地址填进仓库根目录的 `analytics-config.js`：

```js
window.ANALYTICS = {
  endpoint: "https://resume-analytics.your-subdomain.workers.dev"
};
```

提交后，看板（/analytics.html）和埋点即生效，无需重新部署 Pages。

---

## 数据字段说明

每条访客事件记录：会话 ID、页面路径、事件类型（view/end/ping）、时间戳、停留毫秒、User-Agent、来源页、屏幕分辨率、点击过的作品集链接、真实 IP、国家/城市（由 Cloudflare 提供）。

看板展示：总访问（会话数）、独立访客（IP）、当前在线、平均停留、总浏览量、各页面访问次数、作品集各项目查看次数、最近访问明细（IP / 地区 / 进入时间 / 停留 / 浏览页面）。

---

## 隐私提示

看板会显示访客 IP 与地区，属于你的私有数据。建议不要把它放进网站公开导航；直接访问 `你的域名/analytics.html` 即可。如需限制访问，可给 Worker 加一个简单的访问口令校验。
