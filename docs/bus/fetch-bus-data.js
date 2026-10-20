#!/usr/bin/env node
// 從 TDX 抓南港一帶的公車路線與站牌，產出 proto/v1/js/bus-data.js（靜態資料，頁面不直接呼叫 TDX）。
// 用法：node docs/bus/fetch-bus-data.js [--cache <資料夾>]
//   --cache：把 TDX 的原始回應存在該資料夾，下次直接讀檔不重抓（免金鑰每日次數有限，除錯時請加）。
// 有 TDX 會員金鑰時可設環境變數 TDX_CLIENT_ID / TDX_CLIENT_SECRET，沒有則以免金鑰方式呼叫（共 4 次）。
'use strict';

const fs = require('fs');
const path = require('path');

// 向 TDX 查詢用的外框（比實際範圍大一點）
const AREA = { south: 25.044, north: 25.063, west: 121.588, east: 121.620 };
// 「入口站牌」：離 昆陽站 — 南港車站 — 南港軟體園區 這條折線 CORRIDOR_M 公尺以內的站位
const ANCHORS = [[25.0503, 121.5932], [25.0527, 121.6068], [25.0597, 121.6155]];
const CORRIDOR_M = 650;
const CITIES = ['Taipei', 'NewTaipei'];
const API = 'https://tdx.transportdata.tw/api/basic/v2/Bus';
const OUT = path.join(__dirname, '..', '..', 'proto', 'v1', 'js', 'bus-data.js');

const cacheIdx = process.argv.indexOf('--cache');
const cacheDir = cacheIdx > -1 ? process.argv[cacheIdx + 1] : null;
if (cacheIdx > -1 && !cacheDir) { console.error('--cache 後面要接資料夾路徑'); process.exit(1); }

let tokenPromise = null;
function getToken() {
  const id = process.env.TDX_CLIENT_ID;
  const secret = process.env.TDX_CLIENT_SECRET;
  if (!id || !secret) return Promise.resolve(null);
  if (!tokenPromise) {
    tokenPromise = fetch('https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
    }).then(async res => {
      if (!res.ok) throw new Error(`TDX 金鑰驗證失敗（HTTP ${res.status}）`);
      return (await res.json()).access_token;
    });
  }
  return tokenPromise;
}

async function getJson(cacheName, resource, filter) {
  const file = cacheDir && path.join(cacheDir, cacheName);
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));

  const url = `${API}/${resource}?` + new URLSearchParams({ $filter: filter, $format: 'JSON' });
  const headers = { 'user-agent': 'Mozilla/5.0 (critieat bus-data)' };
  const token = await getToken();
  if (token) headers.authorization = 'Bearer ' + token;
  const res = await fetch(url, { headers });
  if (res.status === 429) throw new Error('TDX 今日呼叫次數已用完，請明天再試，或設定 TDX_CLIENT_ID / TDX_CLIENT_SECRET');
  if (!res.ok) throw new Error(`TDX ${resource} 回應 HTTP ${res.status}`);
  const text = await res.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error(`TDX ${resource} 回應格式不對：${text.slice(0, 200)}`);
  if (file) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(file, text); }
  return data;
}

// 經緯度 → 以公尺為單位的平面座標（範圍很小，直接用等距近似）
const toXY = (lat, lng) => [(lng - 121.6) * 111320 * Math.cos(25.05 * Math.PI / 180), (lat - 25.05) * 110574];
function segmentDistance(p, a, b) {
  const [px, py] = toXY(...p), [ax, ay] = toXY(...a), [bx, by] = toXY(...b);
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function inCorridor(lat, lng) {
  for (let i = 1; i < ANCHORS.length; i++) {
    if (segmentDistance([lat, lng], ANCHORS[i - 1], ANCHORS[i]) <= CORRIDOR_M) return true;
  }
  return false;
}
const round = n => Math.round(n * 1e5) / 1e5;
const zh = o => String((o && o.Zh_tw) || '').trim();

async function main() {
  const areaFilter = 'Stops/any(s: ' +
    `s/StopPosition/PositionLat ge ${AREA.south} and s/StopPosition/PositionLat le ${AREA.north} and ` +
    `s/StopPosition/PositionLon ge ${AREA.west} and s/StopPosition/PositionLon le ${AREA.east})`;

  const stationAcc = new Map(); // StationID → { name, lat, lng, n }（同一站位在各路線的座標取平均）
  const routes = new Map();     // RouteUID → { id, name, patterns, seen }
  const shapes = [];            // 去重後的路徑（Google encoded polyline）
  const shapeIndex = new Map();
  let noShape = 0;

  for (const city of CITIES) {
    const slug = city.toLowerCase();
    const sor = await getJson(`sor-${slug}.json`, `StopOfRoute/City/${city}`, areaFilter);
    const uids = [...new Set(sor.map(r => r.RouteUID))];
    if (!uids.length) continue;
    const shapeRows = await getJson(`shape-${slug}.json`, `Shape/City/${city}`,
      uids.map(u => `RouteUID eq '${u}'`).join(' or '));

    for (const entry of sor) {
      // 只收有停靠入口站牌的走法（TDX 的外框比走廊大）
      if (!entry.Stops.some(s => inCorridor(s.StopPosition.PositionLat, s.StopPosition.PositionLon))) continue;

      const stops = [];
      [...entry.Stops].sort((a, b) => a.StopSequence - b.StopSequence).forEach(s => {
        const id = String(s.StationID || s.StopUID);
        const acc = stationAcc.get(id) || { name: zh(s.StopName), lat: 0, lng: 0, n: 0 };
        acc.lat += s.StopPosition.PositionLat;
        acc.lng += s.StopPosition.PositionLon;
        acc.n++;
        stationAcc.set(id, acc);
        if (stops[stops.length - 1] !== id) stops.push(id);
      });
      if (stops.length < 2) continue;

      const route = routes.get(entry.RouteUID) ||
        { id: entry.RouteUID, name: zh(entry.RouteName), patterns: [], seen: new Set() };
      routes.set(entry.RouteUID, route);

      // 停靠站完全相同的子路線（狗狗公車、不同業者、去程半…）只留一筆
      const sig = entry.Direction + '|' + stops.join(',');
      if (route.seen.has(sig)) continue;
      route.seen.add(sig);

      const sub = zh(entry.SubRouteName);
      const sameDir = shapeRows.filter(x => x.RouteUID === entry.RouteUID && x.Direction === entry.Direction);
      const shape = sameDir.find(x => zh(x.SubRouteName) === sub) || sameDir[0];
      let shapeId = -1;
      if (shape && shape.EncodedPolyline) {
        if (!shapeIndex.has(shape.EncodedPolyline)) {
          shapeIndex.set(shape.EncodedPolyline, shapes.length);
          shapes.push(shape.EncodedPolyline);
        }
        shapeId = shapeIndex.get(shape.EncodedPolyline);
      } else noShape++;

      route.patterns.push({ name: sub || route.name, dir: entry.Direction, stops, shape: shapeId });
    }
  }

  const stations = {};
  const entry = [];
  stationAcc.forEach((a, id) => {
    stations[id] = [a.name, round(a.lat / a.n), round(a.lng / a.n)];
    if (inCorridor(stations[id][1], stations[id][2])) entry.push(id);
  });

  const collator = new Intl.Collator('zh-Hant', { numeric: true });
  const routeList = [...routes.values()]
    .map(r => ({ id: r.id, name: r.name, patterns: r.patterns.sort((a, b) => a.dir - b.dir || collator.compare(a.name, b.name)) }))
    .sort((a, b) => collator.compare(a.name, b.name));

  const data = {
    fetchedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }),
    source: 'TDX 運輸資料流通服務',
    stations,
    entry,
    routes: routeList,
    shapes,
  };

  const js = '(function (CE) {\n' +
    "  'use strict';\n" +
    '  // 由 docs/bus/fetch-bus-data.js 產生，請勿手動修改。\n' +
    '  // stations: { 站位ID: [站名, 緯度, 經度] }；entry: 入口站牌的站位ID[]；routes[].patterns[]: { name 子路線名, dir 0去程/1返程, stops 站位ID[], shape shapes 的索引（-1 表示沒有路徑） }\n' +
    '  CE.BUS_DATA = ' + JSON.stringify(data) + ';\n' +
    '})(globalThis.CE = globalThis.CE || {});\n';
  fs.writeFileSync(OUT, js);

  console.log(`已寫入 ${path.relative(process.cwd(), OUT)}（${(js.length / 1024).toFixed(0)} KB）`);
  console.log(`路線 ${routeList.length} 條、走法 ${routeList.reduce((n, r) => n + r.patterns.length, 0)} 種、` +
    `站位 ${Object.keys(stations).length} 個（入口站牌 ${entry.length} 個）、路徑 ${shapes.length} 條、沒有路徑的走法 ${noShape} 種`);
}

main().catch(e => { console.error('[bus-data] ' + e.message); process.exit(1); });
