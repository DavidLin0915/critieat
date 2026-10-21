(function (CE) {
  'use strict';
  // 示範模式：開團單資料存在瀏覽器 localStorage。讀不到（私密視窗、被封鎖）或格式壞掉時改用示範資料。
  // 正式版（live）：Supabase 的 lunch_cards／lunch_votes／lunch_items。ready()／refresh() 抓全部卡片放記憶體，
  //   cards() 同步讀；寫入用 apply(ops)（ops 由 CE.lunchSync.diff 算出），逐筆送出。名單用 CE.memberRepo。
  const KEY = 'critieat.lunch.v2';
  const ME_KEY = 'critieat.me.v2';
  const BROKEN = '本機資料無法讀取，已載入示範資料';
  const live = () => !CE.isDemo();
  let cache = [];        // live：全部卡片
  let failed = false;
  let loaded = false;    // live：全部卡片抓過一次了
  let seq = 0;           // 每次 refresh 的序號；比較晚發出的已經套用了，較早的回應就丟掉
  let applied = 0;
  const RECENT_DAYS = 2; // 之後只重抓最近幾天（過去的卡片唯讀，不會再變）；含昨天，跨午夜也不漏

  // 回傳字串、null（沒有資料），或 undefined（localStorage 無法使用）
  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return undefined; }
  }

  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch (e) { return false; }
  }

  // 回傳 { db, warning }；db: { members: string[], cards: Card[] }
  function load(now) {
    const raw = read(KEY);
    if (raw === undefined) return { db: CE.lunchDemo(now), warning: BROKEN };
    if (raw !== null) {
      try {
        const db = JSON.parse(raw);
        if (CE.lunch.isValidDb(db)) return { db, warning: null };
      } catch (e) { /* 格式壞掉，往下改用示範資料 */ }
    }
    const db = CE.lunchDemo(now);
    save(db);
    return { db, warning: raw === null ? null : BROKEN };
  }

  async function refresh() {
    if (!live()) return true;
    const my = ++seq;
    try {
      const since = loaded ? CE.lunch.todayStr(new Date(Date.now() - RECENT_DAYS * 86400000)) : '';
      const rows = since
        ? await CE.supa.select('lunch_cards', CE.lunchSync.SELECT + '&date=gte.' + since)
        : await CE.supa.selectAll('lunch_cards', CE.lunchSync.SELECT);
      if (my < applied) return true;
      applied = my;
      const fresh = CE.lunchSync.fromRows(rows);
      cache = since ? cache.filter(c => c.date < since).concat(fresh) : fresh;
      loaded = true;
      failed = false;
      return true;
    } catch (e) {
      console.warn('[CRITIEAT] 開團單讀取失敗', e);
      failed = true;
      return false;
    }
  }

  const ready = refresh;
  const cards = () => cache.slice();

  // 依序送出；任一筆失敗就 throw，後面的不送
  async function apply(ops) {
    for (const op of ops) {
      if (op.kind === 'insert') await CE.supa.insert(op.table, op.row);
      else if (op.kind === 'update') await CE.supa.update(op.table, { col: 'id', val: op.match.id }, op.patch);
      else if (op.kind === 'delete') await CE.supa.del(op.table, op.match);
    }
  }

  // 只讀不寫：給美食地圖的轉盤看最近的午餐卡。讀不到或格式不對回傳 []，不會寫入示範資料
  function peekCards() {
    if (live()) return cards();
    const raw = read(KEY);
    if (!raw) return [];
    try {
      const db = JSON.parse(raw);
      return CE.lunch.isValidDb(db) ? db.cards : [];
    } catch (e) { return []; }
  }

  // 只讀不寫：給美食地圖的評分選身分。讀不到或格式不對時回傳示範成員，不會寫入示範資料
  function peekMembers() {
    if (live()) return CE.memberRepo.list();
    const raw = read(KEY);
    if (raw) {
      try {
        const db = JSON.parse(raw);
        if (CE.lunch.isValidDb(db)) return db.members.slice();
      } catch (e) { /* 往下用示範成員 */ }
    }
    return CE.lunchDemo(new Date()).members;
  }

  function reset(now) {
    const db = CE.lunchDemo(now);
    save(db);
    return db;
  }

  // 正式版只認同事名單上的名字
  function getMe() {
    const me = read(ME_KEY) || '';
    return !live() || CE.memberRepo.list().includes(me) ? me : '';
  }

  function setMe(name) {
    try { localStorage.setItem(ME_KEY, name); } catch (e) { /* 存不了就只在這次有效 */ }
  }

  CE.lunchStore = { load, save, reset, getMe, setMe, peekCards, peekMembers, ready, refresh, cards, apply, loadFailed: () => failed };
})(globalThis.CE = globalThis.CE || {});
