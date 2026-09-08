/* 访客行为埋点：记录会话、页面路径、停留时长、点击的作品集，发送到 Cloudflare Worker。
   不收集任何账号/隐私信息，仅记录 IP（由 Worker 从请求头获取）、地区、停留与浏览路径。 */
(function () {
  var CFG = window.ANALYTICS || {};
  var ENDPOINT = CFG.endpoint;
  // 未配置后端 或 本地预览时直接跳过，不影响页面
  if (!ENDPOINT || location.protocol === 'file:') return;

  var start = Date.now();
  var sid = (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : ('s-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  var path = location.pathname;
  var clicked = [];

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (a && a.href) {
      try {
        var u = new URL(a.href);
        if (u.origin === location.origin) clicked.push(u.pathname);
      } catch (_) {}
    }
  });

  function payload(type) {
    return JSON.stringify({
      sid: sid,
      path: path,
      type: type,
      ts: Date.now(),
      dur: Date.now() - start,
      ua: navigator.userAgent,
      ref: document.referrer || '',
      screen: window.screen.width + 'x' + window.screen.height,
      clicked: clicked.slice()
    });
  }

  function send(type) {
    var body = payload(type);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT + '/log', body);
    } else {
      fetch(ENDPOINT + '/log', {
        method: 'POST', body: body,
        headers: { 'Content-Type': 'application/json' }, keepalive: true
      });
    }
  }

  send('view');

  var done = false;
  function end() { if (done) return; done = true; send('end'); }
  window.addEventListener('pagehide', end);
  window.addEventListener('beforeunload', end);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') end();
  });
  // 心跳：长会话也能实时更新"当前在线"与最终停留
  setInterval(function () { send('ping'); }, 20000);
})();
