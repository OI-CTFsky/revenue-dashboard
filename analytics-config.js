// 分析后端地址配置。
// Cloudflare workers.dev 在大陆网络不通，已改用腾讯云云开发（CloudBase）作为后端。
// 部署好腾讯云函数后，把第 4 步拿到的 HTTP 触发地址填到 endpoint（结尾不要带斜杠）。
// 例如：endpoint: "https://abc.ap-shanghai.service.tcloudbase.com/resume-analytics"
// 详细步骤见 analytics/cloudbase/README.md
window.ANALYTICS = {
  endpoint: ""
};
