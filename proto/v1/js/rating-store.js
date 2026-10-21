(function (CE) {
  'use strict';
  // 評分資料。店家評分與品項評分各一個 store，只差 key／資料表、提示、驗證、欄位與示範資料。
  // 示範模式：存在瀏覽器 localStorage，處理方式照 lunch-store.js。
  // 正式版（live）：Supabase 的 store_ratings／item_ratings。ready() 抓整表放記憶體，load() 同步讀；
  //   save(db, change) 只寫這次的變動（change: { type: 'upsert', rating } | { type: 'remove', id, member }），成功才更新記憶體。
  // save 一律回傳 Promise<boolean>。
  const LOAD_FAIL = '評分讀取失敗，請檢查網路後重新整理';

  // 回傳 { ready, load(now) → { db, warning }, save(db, change) → Promise<boolean> }
  function makeStore({ key, broken, isValidDb, demo, table, field, conflict, fromRow, toRow }) {
    const live = () => !CE.isDemo();
    let cache = [];       // live：全部評分
    let failed = false;

    // 回傳字串、null（沒有資料），或 undefined（localStorage 無法使用）
    function read() {
      try { return localStorage.getItem(key); } catch (e) { return undefined; }
    }

    function saveLocal(db) {
      try { localStorage.setItem(key, JSON.stringify(db)); return true; } catch (e) { return false; }
    }

    async function ready() {
      if (!live()) return true;
      try {
        cache = (await CE.supa.select(table, 'select=*')).map(fromRow);
        failed = false;
        return true;
      } catch (e) {
        console.warn('[CRITIEAT] ' + LOAD_FAIL, e);
        failed = true;
        return false;
      }
    }

    // localStorage 無法使用時只顯示示範資料，按儲存時才會報錯
    function load(now) {
      if (live()) return { db: { ratings: cache.slice() }, warning: failed ? LOAD_FAIL : null };
      const raw = read();
      if (raw === undefined) return { db: demo(now), warning: null };
      if (raw !== null) {
        try {
          const db = JSON.parse(raw);
          if (isValidDb(db)) return { db, warning: null };
        } catch (e) { /* 格式壞掉，往下改用示範資料 */ }
      }
      const db = demo(now);
      saveLocal(db);
      return { db, warning: raw === null ? null : broken };
    }

    async function saveLive(change) {
      try {
        if (change.type === 'upsert') {
          await CE.supa.upsert(table, toRow(change.rating), conflict);
          const r = change.rating;
          cache = cache.filter(x => !(x[field] === r[field] && x.member === r.member)).concat([Object.assign({}, r)]);
        } else {
          await CE.supa.del(table, { [conflict.split(',')[0]]: change.id, member: change.member });
          cache = cache.filter(x => !(x[field] === change.id && x.member === change.member));
        }
        return true;
      } catch (e) {
        console.warn('[CRITIEAT] 評分儲存失敗', e);
        return false;
      }
    }

    async function save(db, change) {
      return live() ? saveLive(change) : saveLocal(db);
    }

    return { ready, load, save };
  }

  const iso = v => new Date(v).toISOString();

  CE.ratingStore = makeStore({
    key: 'critieat.ratings.v2',
    broken: '本機評分資料無法讀取，已載入示範資料',
    isValidDb: db => CE.rating.isValidDb(db),
    demo: now => CE.ratingDemo(now),
    table: 'store_ratings',
    field: 'storeId',
    conflict: 'store_id,member',
    fromRow: r => ({ storeId: r.store_id, member: r.member, stars: Number(r.stars), comment: r.comment, updatedAt: iso(r.updated_at) }),
    toRow: r => ({ store_id: r.storeId, member: r.member, stars: r.stars, comment: r.comment, updated_at: r.updatedAt }),
  });

  CE.itemRatingStore = makeStore({
    key: 'critieat.itemRatings.v2',
    broken: '本機品項評分資料無法讀取，已載入示範資料',
    isValidDb: db => CE.itemRating.isValidDb(db),
    demo: now => CE.itemRatingDemo(now),
    table: 'item_ratings',
    field: 'itemId',
    conflict: 'item_id,member',
    fromRow: r => ({ itemId: r.item_id, member: r.member, storeId: r.store_id, itemName: r.item_name, itemNote: r.item_note, stars: Number(r.stars), comment: r.comment, updatedAt: iso(r.updated_at) }),
    toRow: r => ({ item_id: r.itemId, member: r.member, store_id: r.storeId, item_name: r.itemName, item_note: r.itemNote, stars: r.stars, comment: r.comment, updated_at: r.updatedAt }),
  });
})(globalThis.CE = globalThis.CE || {});
