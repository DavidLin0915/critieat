(function (CE) {
  'use strict';
  // 午餐轉盤純邏輯：候選店家、排除最近吃過、隨機挑一批、抽一家。不碰 DOM、不碰 localStorage。
  // StoreView 至少要有 { id, name, status }；午餐卡至少要有 { storeId, date, status }。

  const MIN = 2;

  // 兩個 'YYYY-MM-DD' 相差幾天（a − b）
  function dayDiff(a, b) {
    return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
  }

  // opts: { today: 'YYYY-MM-DD', days: 排除天數（0 = 不排除）, includeRecent: 是否把最近吃過的加回來 }
  // 回傳 { list, excluded }：excluded 是「今天有開、最近 days 天內真的開過單」的店，依幾天前由近到遠
  function candidates(stores, cards, opts) {
    const open = stores.filter(s => s.status !== 'closed');
    const recent = new Map(); // storeId → 最近一次開單的日期
    if (opts.days > 0) {
      (cards || []).forEach(c => {
        if (c.status !== 'ordering' && c.status !== 'closed') return;
        const ago = dayDiff(opts.today, c.date);
        if (ago < 1 || ago > opts.days) return;
        if (!recent.has(c.storeId) || c.date > recent.get(c.storeId)) recent.set(c.storeId, c.date);
      });
    }
    const excluded = open
      .filter(s => recent.has(s.id))
      .map(s => ({ store: s, date: recent.get(s.id), ago: dayDiff(opts.today, recent.get(s.id)) }))
      .sort((a, b) => a.ago - b.ago);
    const list = opts.includeRecent ? open.slice() : open.filter(s => !recent.has(s.id));
    return { list, excluded };
  }

  const agoLabel = ago => (ago === 1 ? '昨天' : `${ago} 天前`);

  function pickIndex(n, rnd) {
    return Math.min(n - 1, Math.floor(rnd() * n));
  }

  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = pickIndex(i + 1, rnd);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 超過上限就隨機挑 max 家；沒超過就原順序複製一份
  function sample(list, max, rnd) {
    return list.length <= max ? list.slice() : shuffle(list, rnd).slice(0, max);
  }

  CE.pick = { MIN, dayDiff, candidates, agoLabel, pickIndex, shuffle, sample };
})(globalThis.CE = globalThis.CE || {});
