/* Cloudflare Worker：接收访客事件写入 KV，并聚合返回统计。
   真实访客 IP / 地区由 Cloudflare 在请求头 (CF-Connecting-IP / request.cf) 提供，
   客户端无需也不能伪造。 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: cors });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: cors });
      }

      // 健康检查：用来确认 Worker 活着、KV 绑定正确
      if (url.pathname === '/health' && request.method === 'GET') {
        let kvOk = false;
        try {
          await env.ANALYTICS_KV.get('health-check');
          kvOk = true;
        } catch (_) {}
        return json({ ok: true, kvBound: kvOk, kvId: env.ANALYTICS_KV ? 'bound' : 'missing' });
      }

      // 接收事件
      if (url.pathname === '/log' && request.method === 'POST') {
        let data;
        try { data = await request.json(); } catch (e) {
          return json({ error: 'bad json' }, 400);
        }
        if (!env.ANALYTICS_KV) {
          return json({ error: 'KV not bound' }, 500);
        }
        const rec = {
          sid: data.sid || ('s-' + Date.now()),
          path: data.path || url.pathname,
          type: data.type || 'view',
          ts: data.ts || Date.now(),
          dur: data.dur || 0,
          ua: (data.ua || '').slice(0, 300),
          ref: (data.ref || '').slice(0, 300),
          screen: data.screen || '',
          clicked: Array.isArray(data.clicked) ? data.clicked.slice(0, 50) : [],
          ip: request.headers.get('CF-Connecting-IP') || '',
          country: (request.cf && request.cf.country) || '',
          city: (request.cf && request.cf.city) || ''
        };
        const day = new Date(rec.ts).toISOString().slice(0, 10);
        const key = 'events:' + day;
        let arr = await env.ANALYTICS_KV.get(key, { type: 'json' });
        if (!Array.isArray(arr)) arr = [];
        arr.push(rec);
        await env.ANALYTICS_KV.put(key, JSON.stringify(arr));
        return json({ ok: true });
      }

      // 返回聚合统计
      if (url.pathname === '/stats' && request.method === 'GET') {
        if (!env.ANALYTICS_KV) {
          return json({ error: 'KV not bound' }, 500);
        }
        const days = [];
        const now = new Date();
        for (let i = 0; i < 30; i++) {
          const d = new Date(now.getTime() - i * 86400000);
          days.push(d.toISOString().slice(0, 10));
        }
        let events = [];
        for (const day of days) {
          try {
            const v = await env.ANALYTICS_KV.get('events:' + day, { type: 'json' });
            if (Array.isArray(v)) events = events.concat(v);
          } catch (e) {
            console.error('kv read error', day, e);
          }
        }

        const sessions = {};
        let views = 0;
        for (const e of events) {
          if (!e.sid) continue;
          if (!sessions[e.sid]) {
            sessions[e.sid] = {
              sid: e.sid, ip: e.ip, country: e.country, city: e.city,
              entry: e.ts, last: e.ts, dur: 0,
              paths: new Set(), clicked: new Set(), ua: e.ua, ref: e.ref
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
          ip: s.ip, country: s.country, city: s.city, entry: s.entry,
          dur: Math.round(s.dur / 1000),
          pages: [...s.paths].map(p => p.split('/').pop() || p),
          clicked: [...s.clicked].map(p => p.split('/').pop() || p)
        }));

        return json({ totalVisits, uniqueIP, avgDur, views, activeNow, pageCounts, portCounts, recent });
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: err.message || 'worker error', stack: err.stack || '' }, 500);
    }
  }
};
