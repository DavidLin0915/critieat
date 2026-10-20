(function (CE) {
  'use strict';

  // 試算表中文表頭 → 英文欄位名（與未來 DB 欄位一致）
  const HEADER_MAP = {
    'ID': 'id', '店名': 'name', '分類': 'category', '區域': 'area', '地址': 'address',
    '緯度': 'lat', '經度': 'lng', '電話': 'phone',
    '週一': 'hours_mon', '週二': 'hours_tue', '週三': 'hours_wed', '週四': 'hours_thu',
    '週五': 'hours_fri', '週六': 'hours_sat', '週日': 'hours_sun',
    'Google Maps 連結': 'google_maps_url', 'foodpanda': 'foodpanda_url',
    'Uber Eats': 'ubereats_url', '你訂': 'nidin_url', '備註': 'note', '顯示': 'visible',
    'Google Place ID': 'place_id', '最後修改者': 'updated_by', '最後修改時間': 'updated_at',
  };

  // 完整中文表頭（Sheet 範本與 CSV 輸出用的順序）
  CE.STORE_HEADERS = Object.keys(HEADER_MAP);

  const SETTING_MAP = {
    '公司名稱': 'companyName', '公司緯度': 'companyLat', '公司經度': 'companyLng',
    '訂餐時段': 'orderWindow', '取餐時間': 'pickupTime', '轉盤排除天數': 'pickerDays',
  };

  const DEFAULTS = { companyName: '公司', orderWindow: '13:00-13:30', pickupTime: '14:00', pickerDays: 3 };

  const STATUS_RANK = { open: 0, early: 1, unknown: 2, closed: 3 };

  function toNum(v) {
    const s = String(v == null ? '' : v).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // 只接受 http(s) 連結，其他（例如 javascript:）一律視為空
  function safeUrl(v) {
    const s = String(v == null ? '' : v).trim();
    return /^https?:\/\//i.test(s) ? s : '';
  }

  // CSV 列（第一列為表頭）→ Store[]
  // Store: { id, name, category, area, address, phone, lat, lng, hours: { mon…sun }, links: { googleMaps, foodpanda, ubereats, nidin }, note,
  //         placeId, updatedBy, updatedAt, visible }
  // 略過：缺 ID 或店名的列、重複 ID（保留第一筆）。顯示 = 否 的店保留，visible 為 false（已移除，給歷史紀錄查店名）
  CE.rowsToStores = function rowsToStores(rows) {
    if (!rows.length) return [];
    const header = rows[0].map(h => HEADER_MAP[String(h).trim()] || null);
    const seen = new Set();
    const stores = [];

    rows.slice(1).forEach((cells, i) => {
      const r = {};
      header.forEach((key, c) => { if (key) r[key] = String(cells[c] == null ? '' : cells[c]).trim(); });
      const line = i + 2;
      if (!r.id || !r.name) {
        console.warn(`[CRITIEAT] 第 ${line} 列缺少 ID 或店名，已略過`);
        return;
      }
      if (seen.has(r.id)) {
        console.warn(`[CRITIEAT] 第 ${line} 列 ID「${r.id}」重複，已略過`);
        return;
      }
      seen.add(r.id);

      const lat = toNum(r.lat);
      const lng = toNum(r.lng);
      const hasCoords = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

      stores.push({
        id: r.id,
        name: r.name,
        category: r.category || '其他',
        area: r.area || '',
        address: r.address || '',
        phone: r.phone || '',
        lat: hasCoords ? lat : null,
        lng: hasCoords ? lng : null,
        hours: Object.fromEntries(CE.DAY_KEYS.map(d => [d, r['hours_' + d] || ''])),
        links: {
          googleMaps: safeUrl(r.google_maps_url),
          foodpanda: safeUrl(r.foodpanda_url),
          ubereats: safeUrl(r.ubereats_url),
          nidin: safeUrl(r.nidin_url),
        },
        note: r.note || '',
        placeId: r.place_id || '',
        updatedBy: r.updated_by || '',
        updatedAt: r.updated_at || '',
        visible: r.visible !== '否',
      });
    });
    return stores;
  };

  // 設定工作表（A 欄名稱、B 欄值）→ Settings
  // Settings: { companyName, company: { lat, lng } | null, orderStart, orderEnd, pickup }（時間為分鐘）
  CE.rowsToSettings = function rowsToSettings(rows) {
    const raw = {};
    rows.forEach(([k, v]) => {
      const key = SETTING_MAP[String(k == null ? '' : k).trim()];
      if (key) raw[key] = String(v == null ? '' : v).trim();
    });

    let win = CE.parseRange(raw.orderWindow);
    if (!win) {
      if (raw.orderWindow) console.warn('[CRITIEAT] 訂餐時段格式錯誤，改用預設值 ' + DEFAULTS.orderWindow);
      win = CE.parseRange(DEFAULTS.orderWindow);
    }
    let pickup = CE.parseTime(raw.pickupTime);
    if (pickup === null) {
      if (raw.pickupTime) console.warn('[CRITIEAT] 取餐時間格式錯誤，改用預設值 ' + DEFAULTS.pickupTime);
      pickup = CE.parseTime(DEFAULTS.pickupTime);
    }
    let pickerDays = DEFAULTS.pickerDays;
    if (raw.pickerDays) {
      if (/^\d+$/.test(raw.pickerDays)) pickerDays = Number(raw.pickerDays);
      else console.warn('[CRITIEAT] 轉盤排除天數格式錯誤，改用預設值 ' + DEFAULTS.pickerDays);
    }
    const lat = toNum(raw.companyLat);
    const lng = toNum(raw.companyLng);

    return {
      companyName: raw.companyName || DEFAULTS.companyName,
      company: lat !== null && lng !== null ? { lat, lng } : null,
      orderStart: win.start,
      orderEnd: win.end,
      pickup,
      pickerDays,
    };
  };

  // Store[] → StoreView[]（加上 status, closesAt, todayHours, distance），並排序：
  // 狀態（有開 → 提早打烊 → 不確定 → 沒開）→ 距離（近到遠，無距離排後）→ 店名
  CE.buildViewModel = function buildViewModel(stores, settings, dayKey) {
    return stores
      .map(s => {
        const st = CE.lunchStatus(s.hours[dayKey], settings);
        return Object.assign({}, s, {
          status: st.status,
          closesAt: st.closesAt,
          todayHours: s.hours[dayKey],
          distance: CE.distanceMeters(settings.company, s),
        });
      })
      .sort((a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        (a.distance ?? Infinity) - (b.distance ?? Infinity) ||
        a.name.localeCompare(b.name, 'zh-Hant')
      );
  };
})(globalThis.CE = globalThis.CE || {});
