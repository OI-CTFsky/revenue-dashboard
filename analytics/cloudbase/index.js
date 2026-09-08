// 腾讯云云开发（CloudBase）云函数：访客事件收集 + 聚合统计
// 部署：云函数入口选本文件（index.js），HTTP 触发开启。
// 数据库：在云开发控制台创建集合 analytics_events（权限设为“所有用户可读写”或“仅管理端”，本函数用管理端 SDK 写入）。
const cloud = require('@cloudbase/node-sdk');
// HTTP 触发（函数 URL）环境不会注入默认凭证，必须显式鉴权：
// 优先读函数环境变量 CLOUDBASE_APIKEY（CloudBase API Key），
// 部署时可将其直接内嵌到下方 ACCESS_KEY 兜底值中。
const ENV_ID = 'qkxdsw-d0ghqo6occbcc3cd0';
const ACCESS_KEY = process.env.CLOUDBASE_APIKEY || '';
const app = cloud.init(ACCESS_KEY ? { env: ENV_ID, accessKey: ACCESS_KEY } : { env: ENV_ID });
const db = app.database();
const _ = db.command;

// 集合自愈：首次写入时若集合不存在则自动创建（CloudBase 不允许向不存在的集合写入）
let _collReady = false;
async function ensureCollection() {
  if (_collReady) return;
  try { await db.createCollection('analytics_events'); } catch (e) { /* 已存在或无权限时忽略 */ }
  _collReady = true;
}
async function saveEvent(rec) {
  await ensureCollection();
  const day = new Date(rec.ts).toISOString().slice(0, 10);
  const docId = 'events:' + day;
  try {
    // node-sdk 的 update 直接传数据对象（不是 { data: ... }，那是小程序 SDK 的写法）
    const res = await db.collection('analytics_events').doc(docId).update({ list: _.push(rec) });
    if (!res.updated || res.updated === 0) {
      await db.collection('analytics_events').doc(docId).set({ list: [rec] });
    }
  } catch (e) {
    if (/collection/i.test(e.message || '')) {
      _collReady = false;
      await ensureCollection();
      const res = await db.collection('analytics_events').doc(docId).update({ list: _.push(rec) });
      if (!res.updated || res.updated === 0) {
        await db.collection('analytics_events').doc(docId).set({ list: [rec] });
      }
    } else throw e;
  }
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

exports.main = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return cors('');
  const urlPath = (event.path || '').split('?')[0];

  try {
    // 健康检查
    if (urlPath.endsWith('/health')) {
      return cors({ ok: true });
    }

    // 接收事件
    if (urlPath.endsWith('/log') && event.httpMethod === 'POST') {
      let data;
      try { data = JSON.parse(event.body || '{}'); } catch (e) {
        return cors({ error: 'bad json' }, 400);
      }
      const headers = event.headers || {};
      const fwd = headers['x-forwarded-for'] || headers['X-Forwarded-For'] || '';
      const rec = {
        sid: data.sid || ('s-' + Date.now()),
        path: data.path || urlPath,
        type: data.type || 'view',
        ts: data.ts || Date.now(),
        dur: data.dur || 0,
        ua: (data.ua || '').slice(0, 300),
        ref: (data.ref || '').slice(0, 300),
        screen: data.screen || '',
        clicked: Array.isArray(data.clicked) ? data.clicked.slice(0, 50) : [],
        ip: (fwd.split(',')[0] || '').trim()
      };
      await saveEvent(rec);
      return cors({ ok: true });
    }

    // 返回聚合统计
    if (urlPath.endsWith('/stats') && event.httpMethod === 'GET') {
      const res = await db.collection('analytics_events').limit(100).get();
      const events = [];
      (res.data || []).forEach(d => { if (Array.isArray(d.list)) events.push(...d.list); });

      const sessions = {};
      let views = 0;
      for (const e of events) {
        if (!e.sid) continue;
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
        if (Array.isArray(e.clicked)) e.clicked.forEach(p => s.clicked.add(p));
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
