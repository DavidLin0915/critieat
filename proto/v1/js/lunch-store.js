(function (CE) {
  'use strict';
  // 開團單資料存在瀏覽器 localStorage。讀不到（私密視窗、被封鎖）或格式壞掉時改用示範資料。
  const KEY = 'critieat.lunch.v2';
  const ME_KEY = 'critieat.me.v2';
  const BROKEN = '本機資料無法讀取，已載入示範資料';

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

  // 只讀不寫：給美食地圖的轉盤看最近的午餐卡。讀不到或格式不對回傳 []，不會寫入示範資料
  function peekCards() {
    const raw = read(KEY);
    if (!raw) return [];
    try {
      const db = JSON.parse(raw);
      return CE.lunch.isValidDb(db) ? db.cards : [];
    } catch (e) { return []; }
  }

  // 只讀不寫：給美食地圖的評分選身分。讀不到或格式不對時回傳示範成員，不會寫入示範資料
  function peekMembers() {
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

  function getMe() {
    return read(ME_KEY) || '';
  }

  function setMe(name) {
    try { localStorage.setItem(ME_KEY, name); } catch (e) { /* 存不了就只在這次有效 */ }
  }

  CE.lunchStore = { load, save, reset, getMe, setMe, peekCards, peekMembers };
})(globalThis.CE = globalThis.CE || {});
