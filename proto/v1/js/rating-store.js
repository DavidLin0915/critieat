(function (CE) {
  'use strict';
  // 評分存在瀏覽器 localStorage，處理方式照 lunch-store.js。店家評分與品項評分各一個 store，只差 key、提示、驗證與示範資料。

  // 回傳 { load(now) → { db, warning }, save(db) → boolean }
  function makeStore({ key, broken, isValidDb, demo }) {
    // 回傳字串、null（沒有資料），或 undefined（localStorage 無法使用）
    function read() {
      try { return localStorage.getItem(key); } catch (e) { return undefined; }
    }

    function save(db) {
      try { localStorage.setItem(key, JSON.stringify(db)); return true; } catch (e) { return false; }
    }

    // localStorage 無法使用時只顯示示範資料，按儲存時才會報錯
    function load(now) {
      const raw = read();
      if (raw === undefined) return { db: demo(now), warning: null };
      if (raw !== null) {
        try {
          const db = JSON.parse(raw);
          if (isValidDb(db)) return { db, warning: null };
        } catch (e) { /* 格式壞掉，往下改用示範資料 */ }
      }
      const db = demo(now);
      save(db);
      return { db, warning: raw === null ? null : broken };
    }

    return { load, save };
  }

  CE.ratingStore = makeStore({
    key: 'critieat.ratings.v2',
    broken: '本機評分資料無法讀取，已載入示範資料',
    isValidDb: db => CE.rating.isValidDb(db),
    demo: now => CE.ratingDemo(now),
  });

  CE.itemRatingStore = makeStore({
    key: 'critieat.itemRatings.v2',
    broken: '本機品項評分資料無法讀取，已載入示範資料',
    isValidDb: db => CE.itemRating.isValidDb(db),
    demo: now => CE.itemRatingDemo(now),
  });
})(globalThis.CE = globalThis.CE || {});
