(function (CE) {
  'use strict';
  // 公車地圖的純邏輯（不碰 DOM、不碰地圖），可用 node 直接驗證。

  const collator = new Intl.Collator('zh-Hant', { numeric: true });

  // CE.BUS_DATA → 查詢用索引
  // Station: { id, name, lat, lng, entry, featured, next, visits: [{ pattern, idx }] }
  //   featured = 站名在 featuredNames 裡（常用站牌，地圖上用不同顏色標出）
  // Route:   { id, name, patterns: Pattern[] }
  // Pattern: { id, route, name, dir, stops: Station[], shape, headsign, variant }
  //   headsign 是終點站名（顯示成「往 ○○」）；variant 只在同方向有多種走法時才有值
  CE.buildBusIndex = function buildBusIndex(data, featuredNames) {
    const entry = new Set(data.entry);
    const featured = new Set(featuredNames || []);
    const stations = new Map();
    Object.keys(data.stations).forEach(id => {
      const [name, lat, lng] = data.stations[id];
      stations.set(id, { id, name, lat, lng, entry: entry.has(id), featured: featured.has(name), next: '', visits: [] });
    });

    const routes = data.routes.map(r => {
      const route = { id: r.id, name: r.name, patterns: [] };
      r.patterns.forEach((p, i) => {
        const stops = p.stops.map(id => stations.get(id)).filter(Boolean);
        if (stops.length < 2) return;
        const pattern = {
          id: r.id + '#' + i, route, name: p.name, dir: p.dir, stops,
          shape: p.shape >= 0 ? data.shapes[p.shape] : '',
          headsign: stops[stops.length - 1].name, variant: '',
        };
        stops.forEach((s, idx) => s.visits.push({ pattern, idx }));
        route.patterns.push(pattern);
      });
      route.patterns.forEach(p => {
        if (route.patterns.filter(q => q.dir === p.dir).length > 1 && p.name !== route.name) p.variant = p.name;
      });
      return route;
    }).filter(r => r.patterns.length);

    // 同名站牌在馬路兩側是不同站位，用「最多路線的下一站」來分辨方向
    stations.forEach(s => {
      const count = new Map();
      s.visits.forEach(v => {
        const nx = v.pattern.stops[v.idx + 1];
        if (nx && nx.name !== s.name) count.set(nx.name, (count.get(nx.name) || 0) + 1);
      });
      let best = 0;
      count.forEach((n, name) => { if (n > best) { best = n; s.next = name; } });
    });

    const entryStations = [...stations.values()].filter(s => s.entry && s.visits.length)
      .sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.next, b.next));

    return { stations, routes, entryStations, fetchedAt: data.fetchedAt, source: data.source };
  };

  // 把同路線、同終點的多種走法併成一列
  function groupByHeadsign(items) {
    const groups = new Map();
    items.forEach(it => {
      const key = it.pattern.route.id + '|' + it.pattern.headsign;
      const g = groups.get(key);
      if (!g) groups.set(key, { route: it.pattern.route, headsign: it.pattern.headsign, pattern: it.pattern, stops: it.stops, terminal: it.terminal });
      else {
        if (it.stops < g.stops) { g.stops = it.stops; g.pattern = it.pattern; }
        g.terminal = g.terminal && it.terminal;
      }
    });
    return [...groups.values()];
  }

  // 停靠這個站位的公車：[{ route, headsign, pattern, terminal }]，terminal = 這站是終點（只下不上）
  CE.busStationRoutes = function busStationRoutes(index, stationId) {
    const s = index.stations.get(stationId);
    if (!s) return [];
    const items = s.visits.map(v => ({ pattern: v.pattern, stops: 0, terminal: v.idx === v.pattern.stops.length - 1 }));
    return groupByHeadsign(items)
      .sort((a, b) => Number(a.terminal) - Number(b.terminal) || collator.compare(a.route.name, b.route.name) || collator.compare(a.headsign, b.headsign));
  };

  // 從這個站位上車、不用轉車可到的站：Map<站位ID, [{ pattern, stops 坐幾站 }]>
  CE.busReachable = function busReachable(index, stationId) {
    const out = new Map();
    const s = index.stations.get(stationId);
    if (!s) return out;
    s.visits.forEach(({ pattern, idx }) => {
      for (let j = idx + 1; j < pattern.stops.length; j++) {
        const t = pattern.stops[j];
        if (t.id === stationId) continue;
        const list = out.get(t.id) || [];
        const prev = list.find(x => x.pattern === pattern);
        if (!prev) list.push({ pattern, stops: j - idx });
        else if (j - idx < prev.stops) prev.stops = j - idx;
        out.set(t.id, list);
      }
    });
    return out;
  };

  // 從 a 站位直達 b 站位可搭的公車：[{ route, headsign, pattern, stops }]，站數少的排前面
  CE.busBetween = function busBetween(index, fromId, toId) {
    const list = CE.busReachable(index, fromId).get(toId) || [];
    return groupByHeadsign(list.map(x => ({ pattern: x.pattern, stops: x.stops, terminal: false })))
      .sort((a, b) => a.stops - b.stops || collator.compare(a.route.name, b.route.name));
  };

  // 以站名查「起 → 迄」的直達車（不用管是馬路哪一側）。起站只能是入口站牌。
  // 回傳依上車站位分組：[{ from: Station, rides: [{ route, headsign, pattern, stops, from, to }] }]，站數少的排前面
  CE.busTrips = function busTrips(index, fromName, toName) {
    const out = [];
    if (!fromName || !toName || fromName === toName) return out;
    index.entryStations.filter(s => s.name === fromName).forEach(from => {
      const best = new Map();
      CE.busReachable(index, from.id).forEach((list, id) => {
        const to = index.stations.get(id);
        if (to.name !== toName) return;
        list.forEach(x => {
          const key = x.pattern.route.id + '|' + x.pattern.headsign;
          const g = best.get(key);
          if (!g || x.stops < g.stops) best.set(key, { route: x.pattern.route, headsign: x.pattern.headsign, pattern: x.pattern, stops: x.stops, from, to });
        });
      });
      const rides = [...best.values()].sort((a, b) => a.stops - b.stops || collator.compare(a.route.name, b.route.name));
      if (rides.length) out.push({ from, rides });
    });
    return out.sort((a, b) => a.rides[0].stops - b.rides[0].stops);
  };

  // 起迄查詢可選的站名：from 入口站牌、to 資料裡所有的站
  CE.busStationNames = function busStationNames(index) {
    const to = new Set();
    index.stations.forEach(s => { if (s.visits.length) to.add(s.name); });
    return {
      from: [...new Set(index.entryStations.map(s => s.name))],
      to: [...to].sort(collator.compare),
    };
  };

  // 同名的其他站位（馬路對面、不同月台）
  CE.busSiblings = function busSiblings(index, stationId) {
    const s = index.stations.get(stationId);
    if (!s) return [];
    return index.entryStations.filter(o => o.name === s.name && o.id !== s.id);
  };

  // Google encoded polyline → [{ lat, lng }]
  CE.decodePolyline = function decodePolyline(str) {
    const path = [];
    let i = 0, lat = 0, lng = 0;
    const next = () => {
      let result = 0, shift = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i < str.length);
      return (result & 1) ? ~(result >> 1) : (result >> 1);
    };
    while (i < str.length) {
      lat += next();
      lng += next();
      path.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return path;
  };

  CE.busCompare = (a, b) => collator.compare(a, b);
})(globalThis.CE = globalThis.CE || {});
