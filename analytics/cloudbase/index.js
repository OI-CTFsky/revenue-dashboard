// 腾讯云 CloudBase 云函数：访客事件收集 + 聚合统计（零依赖版）
// 架构：SCF 函数 URL（公网入口）→ CloudBase 环境级网关 PostgREST → PostgreSQL
//   写入: POST https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/analytics_events
//   读取: GET  同上（service_role，可读可写）
// 鉴权: CloudBase API Key（Bearer），经函数环境变量 CLOUDBASE_APIKEY 注入，
//   部署时可内嵌兜底值（见 index.deploy.js）。无需任何 npm 依赖（Node 18 内置 fetch）。
const ENV_ID = 'qkxdsw-d0ghqo6occbcc3cd0';
const ACCESS_KEY = process.env.CLOUDBASE_APIKEY || '';
const GW = `https://${ENV_ID}.api.tcloudbasegateway.com`;
const REST = `${GW}/v1/rdb/rest/analytics_events`;

async function gw(method, path, body) {
  const res = await fetch(`${GW}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ACCESS_KEY}`,
      'Content-Type': 'application/json',
      ...(body ? { Prefer: 'return=minimal' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`gateway ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

function cors(body, status = 200) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}

exports.main = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors('');
  const urlPath = (event.path || '').split('?')[0];

  try {
    if (urlPath.endsWith('/health')) {
      return cors({ ok: true, ts: Date.now() });
    }

    // 接收事件：一行一条写入 PG
    if (urlPath.endsWith('/log') && event.httpMethod === 'POST') {
      let data;
      try { data = JSON.parse(event.body || '{}'); } catch (e) {
        return cors({ error: 'bad json' }, 400);
      }
      const headers = event.headers || {};
      const fwd = headers['x-forwarded-for'] || headers['X-Forwarded-For'] || '';
      const row = {
        sid: String(data.sid || 's-' + Date.now()).slice(0, 64),
        type: String(data.type || 'view').slice(0, 16),
        path: String(data.path || urlPath).slice(0, 300),
        ref: String(data.ref || '').slice(0, 300),
        ua: String(data.ua || '').slice(0, 300),
        screen: String(data.screen || '').slice(0, 32),
        clicked: JSON.stringify(Array.isArray(data.clicked) ? data.clicked.slice(0, 50) : []),
        dur: Number(data.dur) || 0,
        ts: Number(data.ts) || Date.now(),
        ip: (fwd.split(',')[0] || '').trim().slice(0, 64)
      };
      await gw('POST', '/v1/rdb/rest/analytics_events', row);
      return cors({ ok: true });
    }

    // 聚合统计：拉最近 2000 条事件，JS 内聚合（个人站流量量级足够）
    if (urlPath.endsWith('/stats') && event.httpMethod === 'GET') {
      const rows = await gw(
        'GET',
        '/v1/rdb/rest/analytics_events?select=sid,type,path,dur,ts,ip,clicked&order=ts.desc&limit=2000'
      );

      const sessions = {};
      let views = 0;
      for (const e of rows || []) {
        if (!e.sid) continue;
        let clicked = [];
        try { clicked = JSON.parse(e.clicked || '[]'); } catch (x) { clicked = []; }
        if (!sessions[e.sid]) {
          sessions[e.sid] = {
            sid: e.sid, ip: e.ip,
            entry: e.ts, last: e.ts, dur: 0,
            paths: new Set(), clicked: new Set()
          };
        }
        const s = sessions[e.sid];
        if (e.type === 'view') views++;
        if (e.ts < s.entry) s.entry = e.ts;
        if (e.ts > s.last) s.last = e.ts;
        if ((e.type === 'end' || e.type === 'ping') && e.dur > s.dur) s.dur = e.dur;
        if (e.path) s.paths.add(e.path);
        clicked.forEach(p => s.clicked.add(p));
      }

      const list = Object.values(sessions);
      const nowMs = Date.now();
      const activeNow = list.filter(s => nowMs - s.last < 30000).length;
      const totalVisits = list.length;
      const uniqueIP = new Set(list.map(s => s.ip).filter(Boolean)).size;
      const withDur = list.filter(s => s.dur > 0);
      const avgDur = withDur.length
        ? Math.round(withDur.reduce((a, s) => a + s.dur, 0) / withDur.length / 1000)
        : 0;

      const portfolio = ['dashboard.html', 'e02-analysis.html', 'sql-cheatsheet.html', 'green-station.html', 'resume.pdf'];
      const pageCounts = {};
      const portCounts = {};
      portfolio.forEach(p => portCounts[p] = 0);
      for (const s of list) {
        for (const p of s.paths) {
          const n = p.split('/').pop() || p;
          pageCounts[n] = (pageCounts[n] || 0) + 1;
          if (portfolio.includes(n)) portCounts[n]++;
        }
        for (const c of s.clicked) {
          const n = c.split('/').pop() || c;
          if (portfolio.includes(n)) portCounts[n]++;
        }
      }

      const recent = list.slice().sort((a, b) => b.entry - a.entry).slice(0, 40).map(s => ({
        ip: s.ip, entry: s.entry,
        dur: Math.round(s.dur / 1000),
        pages: [...s.paths].map(p => p.split('/').pop() || p),
        clicked: [...s.clicked].map(p => p.split('/').pop() || p)
      }));

      return cors({ totalVisits, uniqueIP, avgDur, views, activeNow, pageCounts, portCounts, recent });
    }

    return cors({ error: 'not found' }, 404);
  } catch (err) {
    return cors({ error: err.message || 'function error' }, 500);
  }
};
