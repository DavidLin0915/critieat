(function (CE) {
  'use strict';
  // 菜單資料：讀寫、品項 ID、比對、搜尋。不碰 DOM。
  // 正式版（live）：Supabase menus 表，ready() 時一次載入記憶體；照片上傳到 Storage 的 menu-photos。
  // 示範模式：使用者存的菜單放 localStorage（critieat.menus.v1，{ [storeId]: Menu }），沒有就用 CE.DEMO_MENUS。
  // Menu: { updatedAt, updatedBy, sections: [{ name, items: [{ id, name, price, note }] }], photos? }
  // 品項 ID 同一家店內唯一；重新上傳時「品名＋備註」相同的品項沿用舊 ID（品項評分、點餐連結才不會斷）。

  const KEY = 'critieat.menus.v1';
  const BUCKET = 'menu-photos';
  const live = () => !CE.isDemo();
  let liveMenus = {};   // live：{ [storeId]: Menu }
  let menusFailed = false; // live：載入失敗時不准存，免得把讀不到的真菜單蓋掉
  let photoSeq = 0;

  // ── 比對用的正規化：全形英數符號與全形空白轉半形、去前後空白、英文轉小寫 ──
  function norm(v) {
    return String(v == null ? '' : v)
      .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/　/g, ' ')
      .trim()
      .toLowerCase();
  }

  function itemKey(name, note) {
    return norm(name) + '\n' + norm(note);
  }

  // ── 儲存 ──
  // 讀到的整份菜單（含照片 data URL，可能很大）快取在記憶體：同一頁重複查品項不再重新解析。
  // 本頁寫入成功才更新快取；其他分頁改了菜單時，瀏覽器的 storage 事件讓快取失效。
  let cache = null;

  function loadSaved() {
    if (live()) return liveMenus;
    if (cache) return cache;
    let map = {};
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (v && typeof v === 'object') map = v;
    } catch (e) { /* 讀不到或壞掉：當作沒有存的菜單 */ }
    cache = map;
    return cache;
  }

  function writeSaved(map) {
    try {
      localStorage.setItem(KEY, JSON.stringify(map));
      cache = map;
      return true;
    } catch (e) { return false; }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) cache = null; });
  }

  function isValidMenu(m) {
    return !!m && typeof m.updatedAt === 'string' && Array.isArray(m.sections) &&
      m.sections.every(s => s && typeof s.name === 'string' && Array.isArray(s.items));
  }

  const flat = menu => menu.sections.flatMap(s => s.items);

  // 沒有 ID 的品項補固定 ID（<店家ID>-s<序號>，依攤平後順序），每次讀到的結果一樣
  function ensureIds(menu, storeId) {
    const used = new Set(flat(menu).map(it => it.id).filter(id => typeof id === 'string' && id));
    let n = 0;
    let changed = false;
    const sections = menu.sections.map(sec => Object.assign({}, sec, {
      items: sec.items.map(it => {
        n += 1;
        if (typeof it.id === 'string' && it.id) return it;
        let id = `${storeId}-s${String(n).padStart(2, '0')}`;
        while (used.has(id)) id += 'x';
        used.add(id);
        changed = true;
        return Object.assign({}, it, { id });
      }),
    }));
    return { menu: changed ? Object.assign({}, menu, { sections }) : menu, changed };
  }

  function savedMenu(storeId) {
    const map = loadSaved();
    const m = map[storeId];
    if (!isValidMenu(m)) return null;
    const r = ensureIds(m, storeId);
    if (r.changed && !live()) writeSaved(Object.assign({}, map, { [storeId]: r.menu }));
    return r.menu;
  }

  function isSaved(storeId) {
    return !!savedMenu(storeId);
  }

  // 示範菜單只在示範模式出現
  const demoMenu = storeId => (!live() && CE.DEMO_MENUS && CE.DEMO_MENUS[storeId]) || null;

  // 回傳複製品：外面改了不會汙染快取
  function getMenu(storeId) {
    const m = savedMenu(storeId) || demoMenu(storeId);
    return m && JSON.parse(JSON.stringify(m));
  }

  function hasMenu(storeId) {
    return !!(savedMenu(storeId) || demoMenu(storeId));
  }

  const fromRow = r => ({ updatedAt: String(r.updated_at || ''), updatedBy: r.updated_by || '', sections: r.sections || [], photos: r.photos || [] });

  async function ready() {
    if (!live()) return true;
    try {
      const rows = await CE.supa.select('menus', 'select=*');
      liveMenus = Object.fromEntries(rows.map(r => [r.store_id, fromRow(r)]));
      menusFailed = false;
      return true;
    } catch (e) {
      menusFailed = true;
      return false;
    }
  }

  // 回傳 Promise<boolean>；正式版寫入成功才更新記憶體
  async function saveMenu(storeId, menu) {
    if (!live()) return writeSaved(Object.assign({}, loadSaved(), { [storeId]: menu }));
    if (menusFailed) return false;
    const row = { store_id: storeId, sections: menu.sections, photos: menu.photos || [], updated_by: menu.updatedBy, updated_at: menu.updatedAt };
    try {
      await CE.supa.upsert('menus', row, 'store_id');
    } catch (e) {
      return false;
    }
    liveMenus = Object.assign({}, liveMenus, { [storeId]: JSON.parse(JSON.stringify(menu)) });
    return true;
  }

  // 正式版：上傳一張已縮好的 JPEG，回傳公開網址；失敗回傳 null
  async function uploadPhoto(storeId, blob) {
    photoSeq += 1;
    try {
      return await CE.supa.upload(BUCKET, `${storeId}/${Date.now()}-${photoSeq}.jpg`, blob, 'image/jpeg');
    } catch (e) {
      return null;
    }
  }

  // 正式版：照片 [{ data, mime } | { url }] 交給 Edge Function 辨識；回傳 { rows, failed }，失敗 throw CE.SupaError
  async function recognize(images) {
    if (!live()) throw new Error('示範模式不呼叫 AI 辨識');
    const out = await CE.supa.invoke('menu-recognize', { images });
    return { rows: (out && out.rows) || [], failed: (out && out.failed) || [] };
  }

  function removeSaved(storeId) {
    const map = Object.assign({}, loadSaved());
    delete map[storeId];
    return writeSaved(map);
  }

  // 新菜單的品項配 ID：比對鍵相同、還沒用掉的舊品項沿用；其餘給新 ID。沒被用到的舊品項就是下架。
  function assignIds(oldMenu, sections, storeId, now) {
    const oldItems = oldMenu ? flat(oldMenu).filter(it => it.id) : [];
    const pool = new Map();
    oldItems.forEach(it => {
      const k = itemKey(it.name, it.note);
      if (!pool.has(k)) pool.set(k, []);
      pool.get(k).push(it.id);
    });
    const used = new Set(oldItems.map(it => it.id));
    const stamp = now.getTime().toString(36);
    let seq = 0;
    return sections.map(sec => Object.assign({}, sec, {
      items: sec.items.map(it => {
        const ids = pool.get(itemKey(it.name, it.note));
        let id = ids && ids.length ? ids.shift() : '';
        if (!id) {
          do { seq += 1; id = `${storeId}-${stamp}${seq.toString(36)}`; } while (used.has(id));
          used.add(id);
        }
        return Object.assign({}, it, { id });
      }),
    }));
  }

  // ── 查詢 ──
  function items(storeId) {
    const menu = savedMenu(storeId) || demoMenu(storeId);
    if (!menu) return [];
    return menu.sections.flatMap(sec => sec.items.map(it => ({
      id: it.id, name: it.name, price: it.price == null ? null : it.price, note: it.note || '', category: sec.name,
    })));
  }

  function findItem(storeId, itemId) {
    return items(storeId).find(it => it.id === itemId) || null;
  }

  // 舊點餐紀錄對品項：先比品名＋備註；對不上時，菜單上只有一道同名品項也算
  function matchItem(storeId, name, note) {
    const list = items(storeId);
    const key = itemKey(name, note);
    const exact = list.find(it => itemKey(it.name, it.note) === key);
    if (exact) return exact;
    const n = norm(name);
    const same = list.filter(it => norm(it.name) === n);
    return same.length === 1 ? same[0] : null;
  }

  // 品名包含 q 的品項：開頭符合的在前，其餘照菜單順序
  function search(storeId, q, max) {
    const qn = norm(q);
    if (!qn) return [];
    const hit = items(storeId).filter(it => norm(it.name).includes(qn));
    const head = hit.filter(it => norm(it.name).startsWith(qn));
    const rest = hit.filter(it => !norm(it.name).startsWith(qn));
    return head.concat(rest).slice(0, max || 8);
  }

  CE.menuData = {
    KEY, norm, itemKey, isSaved, getMenu, hasMenu, ready, loadFailed: () => menusFailed, saveMenu, uploadPhoto, recognize, removeSaved,
    assignIds, ensureIds, items, findItem, matchItem, search,
  };
})(globalThis.CE = globalThis.CE || {});
