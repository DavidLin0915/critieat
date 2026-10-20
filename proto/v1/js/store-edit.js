(function (CE) {
  'use strict';
  // 店家新增／編輯的純邏輯：覆蓋層合併、新 ID、表單驗證、Google 營業時間轉換、CSV 輸出。不碰 DOM、不碰 localStorage。

  const CATEGORIES = ['飯', '麵', '便當', '小吃', '異國', '輕食', '其他'];
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const GOOGLE_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // Google 的 day：0 = 週日
  const LINK_KEYS = ['googleMaps', 'foodpanda', 'ubereats', 'nidin'];
  const BAD_LINK = '連結要以 http:// 或 https:// 開頭';
  const BAD_HOURS = '看不懂這個格式，會當成「不確定」';

  const isStr = v => typeof v === 'string';
  const str = v => String(v == null ? '' : v).trim();

  // 基本清單＋覆蓋層：同 ID 整筆取代（保持基本清單順序），新 ID 依覆蓋層順序接在後面
  function merge(base, overlay) {
    const byId = new Map(overlay.map(s => [s.id, s]));
    const out = base.map(s => byId.get(s.id) || s);
    const ids = new Set(base.map(s => s.id));
    overlay.forEach(s => { if (!ids.has(s.id)) out.push(s); });
    return out;
  }

  function nextId(stores) {
    let max = 0;
    stores.forEach(s => {
      const m = /^R(\d+)$/.exec(s.id);
      if (m) max = Math.max(max, Number(m[1]));
    });
    return 'R' + String(max + 1).padStart(3, '0');
  }

  function isValidStore(s) {
    if (!s || typeof s !== 'object') return false;
    if (!isStr(s.id) || !s.id || !isStr(s.name) || !s.name) return false;
    if (!CATEGORIES.includes(s.category)) return false;
    if (!s.hours || !DAYS.every(d => isStr(s.hours[d]))) return false;
    if (!s.links || !LINK_KEYS.every(k => isStr(s.links[k]))) return false;
    const num = v => typeof v === 'number' && Number.isFinite(v);
    if (!((num(s.lat) && num(s.lng)) || (s.lat === null && s.lng === null))) return false;
    if (typeof s.visible !== 'boolean') return false;
    return ['area', 'address', 'phone', 'note', 'placeId', 'updatedBy', 'updatedAt'].every(k => isStr(s[k]));
  }

  function isValidOverlay(db) {
    if (!db || typeof db !== 'object' || !Array.isArray(db.stores)) return false;
    const ids = new Set();
    return db.stores.every(s => {
      if (!isValidStore(s) || ids.has(s.id)) return false;
      ids.add(s.id);
      return true;
    });
  }

  // input 與 Store 同形（字串未 trim）。回傳 { store, errors, warnings }；有 errors 時 store 為 null
  function validate(input) {
    const errors = {};
    const warnings = {};
    const links = {};
    LINK_KEYS.forEach(k => {
      links[k] = str(input.links && input.links[k]);
      if (links[k] && !/^https?:\/\//i.test(links[k])) errors['link.' + k] = BAD_LINK;
    });
    const hours = {};
    DAYS.forEach(d => {
      hours[d] = str(input.hours && input.hours[d]);
      if (hours[d] && CE.parseHours(hours[d]).type === 'unknown') warnings[d] = BAD_HOURS;
    });
    const name = str(input.name);
    if (!name) errors.name = '請填店名';
    if (!CATEGORIES.includes(input.category)) errors.category = '請選分類';
    const hasCoords = typeof input.lat === 'number' && typeof input.lng === 'number';
    const store = {
      id: str(input.id),
      name,
      category: input.category,
      area: str(input.area),
      address: str(input.address),
      phone: str(input.phone),
      lat: hasCoords ? input.lat : null,
      lng: hasCoords ? input.lng : null,
      hours,
      links,
      note: str(input.note),
      placeId: str(input.placeId),
      updatedBy: str(input.updatedBy),
      updatedAt: str(input.updatedAt),
      visible: input.visible !== false,
    };
    return { store: Object.keys(errors).length ? null : store, errors, warnings };
  }

  const hhmm = (h, m) => String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');

  // Google regularOpeningHours → { mon…sun }；沒有資料回傳 null
  function periodsToHours(oh) {
    if (!oh || !Array.isArray(oh.periods)) return null;
    const segs = Object.fromEntries(DAYS.map(d => [d, []]));
    for (const p of oh.periods) {
      if (!p || !p.open) continue;
      if (!p.close) return Object.fromEntries(DAYS.map(d => [d, '00:00-24:00'])); // 24 小時營業
      const o = p.open;
      const c = p.close;
      // 收在隔天 00:00 寫成 24:00；其他跨午夜照實寫（parseHours 會當成跨日）
      const end = c.day !== o.day && c.hour === 0 && c.minute === 0 ? '24:00' : hhmm(c.hour, c.minute);
      segs[GOOGLE_DAY[o.day]].push({ start: o.hour * 60 + o.minute, text: hhmm(o.hour, o.minute) + '-' + end });
    }
    return Object.fromEntries(DAYS.map(d => [d, segs[d].length
      ? segs[d].sort((a, b) => a.start - b.start).map(s => s.text).join(', ')
      : '公休']));
  }

  // 去掉 Google 地址開頭的郵遞區號與「台灣／臺灣」
  function cleanAddress(s) {
    return str(s).replace(/^\d{3,6}\s*/, '').replace(/^[台臺]灣\s*/, '');
  }

  // Google 回傳的地圖連結帶一串追蹤參數，只留 cid；其他網址原樣
  function cleanMapsUrl(s) {
    const v = str(s);
    const m = /^https:\/\/maps\.google\.com\/\?(?:.*&)?cid=(\d+)/.exec(v);
    return m ? 'https://maps.google.com/?cid=' + m[1] : v;
  }

  function cleanPhone(s) {
    return str(s).replace(/\s+/g, '-');
  }

  // Store → CSV 一列的值（依 CE.STORE_HEADERS 的順序）
  const COLUMN = {
    'ID': s => s.id, '店名': s => s.name, '分類': s => s.category, '區域': s => s.area, '地址': s => s.address,
    '緯度': s => (s.lat == null ? '' : String(s.lat)), '經度': s => (s.lng == null ? '' : String(s.lng)), '電話': s => s.phone,
    '週一': s => s.hours.mon, '週二': s => s.hours.tue, '週三': s => s.hours.wed, '週四': s => s.hours.thu,
    '週五': s => s.hours.fri, '週六': s => s.hours.sat, '週日': s => s.hours.sun,
    'Google Maps 連結': s => s.links.googleMaps, 'foodpanda': s => s.links.foodpanda,
    'Uber Eats': s => s.links.ubereats, '你訂': s => s.links.nidin, '備註': s => s.note,
    '顯示': s => (s.visible === false ? '否' : '是'),
    'Google Place ID': s => s.placeId, '最後修改者': s => s.updatedBy, '最後修改時間': s => s.updatedAt,
  };

  function cell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(stores) {
    const lines = [CE.STORE_HEADERS.map(cell).join(',')];
    stores.forEach(s => lines.push(CE.STORE_HEADERS.map(h => cell(COLUMN[h](s))).join(',')));
    return lines.join('\n') + '\n';
  }

  // ── Supabase stores 表 ↔ Store ──
  // 寫入時不送 id（新店由資料庫給號）與 updated_at（資料庫填現在時間）
  function toRow(s) {
    return {
      name: s.name, category: s.category, area: s.area, address: s.address, phone: s.phone,
      lat: s.lat, lng: s.lng, hours: s.hours, links: s.links, note: s.note,
      place_id: s.placeId || null, visible: s.visible !== false, updated_by: s.updatedBy,
    };
  }

  function fromRow(r) {
    const o = r.hours || {};
    const l = r.links || {};
    return {
      id: r.id, name: r.name, category: r.category, area: str(r.area), address: str(r.address), phone: str(r.phone),
      lat: typeof r.lat === 'number' ? r.lat : null, lng: typeof r.lng === 'number' ? r.lng : null,
      hours: Object.fromEntries(DAYS.map(d => [d, str(o[d])])),
      links: Object.fromEntries(LINK_KEYS.map(k => [k, str(l[k])])),
      note: str(r.note), placeId: str(r.place_id), visible: r.visible !== false,
      updatedBy: str(r.updated_by), updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : '',
    };
  }

  CE.storeEdit = { CATEGORIES, DAYS, merge, nextId, isValidStore, isValidOverlay, validate, periodsToHours, cleanAddress, cleanMapsUrl, cleanPhone, toCsv, toRow, fromRow };
})(globalThis.CE = globalThis.CE || {});
