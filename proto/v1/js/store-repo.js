(function (CE) {
  'use strict';
  // 店家清單。存檔後在 document 發出 'ce:store-change'（detail: { id }，重置時 id 為 null）。
  // 正式版（live）：Supabase stores 表。頁面啟動時 ready() 一次載入記憶體，之後讀取都是同步的；寫入成功才更新記憶體。
  // 示範模式（demo）：data.js 的基本清單＋瀏覽器裡新增／修改過的店（覆蓋層，每筆是整家店）。
  //   每次呼叫都重新讀 localStorage，其他分頁改過、重新整理後就看得到。
  // save 回傳 Promise<{ ok: true, id } | { ok: false, dup }>；remove 回傳 Promise<boolean>。
  const KEY = 'critieat.stores.v1';
  const BROKEN = '本機店家資料無法讀取，已改用預設清單';
  const LOAD_FAIL = '店家資料讀取失敗，請檢查網路後重新整理';
  const E = CE.storeEdit;
  const live = () => !CE.isDemo();
  let warned = false;
  let cache = [];        // live：目前的店家（含已移除）
  let loadFailed = false;

  function base() {
    return CE.rowsToStores(CE.parseCsv(CE.DEMO_STORES_CSV));
  }

  // 回傳 { stores: Store[], ok: boolean }；ok 為 false 表示讀不到或格式壞掉
  function readOverlay() {
    let raw;
    try { raw = localStorage.getItem(KEY); } catch (e) { return { stores: [], ok: false }; }
    if (raw == null) return { stores: [], ok: true };
    try {
      const db = JSON.parse(raw);
      if (E.isValidOverlay(db)) return { stores: db.stores, ok: true };
    } catch (e) { /* 往下 */ }
    if (!warned) console.warn('[CRITIEAT] ' + BROKEN);
    warned = true;
    return { stores: [], ok: false };
  }

  function changed(id) {
    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('ce:store-change', { detail: { id } }));
  }

  async function ready() {
    if (!live()) return true;
    try {
      cache = (await CE.supa.select('stores', 'select=*&order=id')).map(E.fromRow);
      loadFailed = false;
      return true;
    } catch (e) {
      console.warn('[CRITIEAT] ' + LOAD_FAIL, e);
      loadFailed = true;
      return false;
    }
  }

  const all = () => (live() ? cache.slice() : E.merge(base(), readOverlay().stores));
  const visible = () => all().filter(s => s.visible !== false);
  const get = id => all().find(s => s.id === id) || null;
  const findByPlaceId = placeId => (placeId ? all().find(s => s.placeId === placeId) || null : null);
  const nextId = () => (live() ? '' : E.nextId(all())); // 正式版新店由資料庫給號
  function warning() {
    if (live()) return loadFailed ? LOAD_FAIL : null;
    return readOverlay().ok ? null : BROKEN;
  }

  function remember(store) {
    cache = cache.some(s => s.id === store.id) ? cache.map(s => (s.id === store.id ? store : s)) : cache.concat([store]);
    changed(store.id);
  }

  async function saveLive(store, member) {
    const row = Object.assign(E.toRow(store), { updated_by: member });
    try {
      let saved;
      if (store.id) {
        const rows = await CE.supa.update('stores', { col: 'id', val: store.id }, row);
        if (!rows || !rows.length) return { ok: false, dup: false };
        saved = rows[0];
      } else {
        saved = await CE.supa.insert('stores', row);
      }
      const s = E.fromRow(saved);
      remember(s);
      return { ok: true, id: s.id };
    } catch (e) {
      return { ok: false, dup: !!e && e.code === '23505' };
    }
  }

  function saveLocal(store, member, now) {
    const rec = Object.assign({}, store, { updatedBy: member, updatedAt: now.toISOString() });
    const list = readOverlay().stores.filter(s => s.id !== rec.id);
    list.push(rec);
    try { localStorage.setItem(KEY, JSON.stringify({ stores: list })); } catch (e) { return { ok: false, dup: false }; }
    changed(rec.id);
    return { ok: true, id: rec.id };
  }

  async function save(store, member, now) {
    return live() ? saveLive(store, member) : saveLocal(store, member, now);
  }

  async function remove(id, member, now) {
    const s = get(id);
    return s ? (await save(Object.assign({}, s, { visible: false }), member, now)).ok : false;
  }

  function reset() {
    if (live()) return; // 正式版沒有示範資料可重置
    try { localStorage.removeItem(KEY); } catch (e) { /* 讀不到就沒什麼可清 */ }
    changed(null);
  }

  CE.storeRepo = { ready, all, visible, get, findByPlaceId, nextId, warning, save, remove, reset };
})(globalThis.CE = globalThis.CE || {});
