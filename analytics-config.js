// 分析后端地址配置。
// Cloudflare workers.dev 在大陆网络不通，已改用腾讯云云开发（CloudBase）作为后端。
// 当前指向腾讯云函数 URL（ap-shanghai，大陆可直接访问）。
// 详细步骤见 analytics/cloudbase/README.md
window.ANALYTICS = {
  endpoint: "https://1258609864-hng7six3ne.ap-shanghai.tencentscf.com"
};
