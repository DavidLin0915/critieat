(function (CE) {
  'use strict';
  // 店家清單：data.js 的基本清單＋瀏覽器裡同事新增／修改過的店（覆蓋層，每筆是整家店）。
  // 每次呼叫都重新讀 localStorage，其他分頁改過、重新整理後就看得到。
  // 存檔後在 document 發出 'ce:store-change'（detail: { id }，重置時 id 為 null）。
  const KEY = 'critieat.stores.v1';
  const BROKEN = '本機店家資料無法讀取，已改用預設清單';
  const E = CE.storeEdit;
  let warned = false;

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

  const all = () => E.merge(base(), readOverlay().stores);
  const visible = () => all().filter(s => s.visible !== false);
  const get = id => all().find(s => s.id === id) || null;
  const findByPlaceId = placeId => (placeId ? all().find(s => s.placeId === placeId) || null : null);
  const nextId = () => E.nextId(all());
  const warning = () => (readOverlay().ok ? null : BROKEN);

  function save(store, member, now) {
    const rec = Object.assign({}, store, { updatedBy: member, updatedAt: now.toISOString() });
    const list = readOverlay().stores.filter(s => s.id !== rec.id);
    list.push(rec);
    try { localStorage.setItem(KEY, JSON.stringify({ stores: list })); } catch (e) { return false; }
    changed(rec.id);
    return true;
  }

  function remove(id, member, now) {
    const s = get(id);
    return s ? save(Object.assign({}, s, { visible: false }), member, now) : false;
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* 讀不到就沒什麼可清 */ }
    changed(null);
  }

  CE.storeRepo = { all, visible, get, findByPlaceId, nextId, warning, save, remove, reset };
})(globalThis.CE = globalThis.CE || {});
