(function (CE) {
  'use strict';
  // 一次性工具：用 Google 補齊 data.js 現有店家的地址、電話、營業時間、Place ID，輸出整份 CSV 讓人貼回 data.js。
  // 不寫檔、不自動查詢（重新整理不會呼叫 Google）。
  const FAR = 150;
  const DAY_LABEL = { mon: '一', tue: '二', wed: '三', thu: '四', fri: '五', sat: '六', sun: '日' };
  const $ = id => document.getElementById(id);
  const stores = CE.rowsToStores(CE.parseCsv(CE.DEMO_STORES_CSV));
  const found = new Map(); // id → PlaceInfo | null

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  const squash = s => String(s || '').replace(/\s+/g, '');
  const nameMatch = (a, b) => { a = squash(a); b = squash(b); return !!a && !!b && (a.includes(b) || b.includes(a)); };

  function row(s, info) {
    const tr = el('tr');
    tr.dataset.id = s.id;
    const dist = info ? CE.distanceMeters(s, info) : null;
    const issues = [];
    if (!info) issues.push('查不到');
    else {
      if (dist != null && dist > FAR) issues.push(`差 ${Math.round(dist)} 公尺`);
      if (!nameMatch(s.name, info.name)) issues.push('店名對不上');
      if (!info.hours) issues.push('Google 沒有營業時間');
    }
    const flag = !info || issues.some(t => t !== 'Google 沒有營業時間');
    if (flag) tr.classList.add('is-flag');
    const pick = el('input');
    pick.type = 'checkbox';
    pick.checked = !flag;
    pick.disabled = !info;
    const td = el('td');
    td.append(pick);
    tr.append(
      td,
      el('td', null, s.name),
      el('td', null, info ? info.name : '—'),
      el('td', null, info ? info.address : '—'),
      el('td', 'bf__dist', dist == null ? '—' : String(Math.round(dist))),
      el('td', null, info ? info.phone || '—' : '—'),
      el('td', 'bf__hours', info && info.hours ? CE.storeEdit.DAYS.map(d => `${DAY_LABEL[d]} ${info.hours[d]}`).join('\n') : '—'),
      el('td', null, issues.join('、') || 'OK')
    );
    return tr;
  }

  async function start() {
    $('bf-start').disabled = true;
    $('bf-msg').textContent = '載入 Google…';
    const FAIL = 'Google 無法載入，請確認是在 http://localhost:8000 開啟';
    const ok = await CE.places.load(CE.CONFIG.googleMapsKey);
    if (!ok) {
      $('bf-msg').textContent = FAIL;
      $('bf-start').disabled = false;
      return;
    }
    let errors = 0;
    $('bf-rows').replaceChildren();
    for (const [i, s] of stores.entries()) {
      $('bf-msg').textContent = `查詢中 ${i + 1} / ${stores.length}：${s.name}`;
      let info = null;
      try {
        info = s.lat == null ? null : await CE.places.searchText(s.name, { lat: s.lat, lng: s.lng }, 200);
      } catch (e) {
        console.warn('[CRITIEAT] 查詢失敗 ' + s.name, e);
        errors++;
      }
      found.set(s.id, info);
      $('bf-rows').append(row(s, info));
    }
    // 網址不對時程式庫照樣載得進來，但每一筆都會被拒絕
    if (errors === stores.length) {
      $('bf-msg').textContent = FAIL;
      $('bf-start').disabled = false;
      return;
    }
    $('bf-msg').textContent = errors ? `查完了，有 ${errors} 家查詢失敗。確認黃色列後按「產生 CSV」。` : '查完了。確認黃色列後按「產生 CSV」。';
    $('bf-gen').disabled = false;
  }

  // 勾選的列換上 Google 的地址、電話、Place ID；營業時間只在 Google 有資料時換。其他欄位不動
  function generate() {
    const out = stores.map(s => {
      const tr = document.querySelector(`#bf-rows tr[data-id="${CSS.escape(s.id)}"]`);
      const info = found.get(s.id);
      if (!info || !tr || !tr.querySelector('input').checked) return s;
      return Object.assign({}, s, {
        address: info.address || s.address,
        phone: info.phone || s.phone,
        placeId: info.placeId,
        hours: info.hours || s.hours,
      });
    });
    $('bf-out').value = CE.storeEdit.toCsv(out);
    $('bf-copy').disabled = false;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText($('bf-out').value);
      $('bf-msg').textContent = '已複製，貼回給 Claude 就好。';
    } catch (e) {
      $('bf-out').select();
      $('bf-msg').textContent = '無法自動複製，請手動全選後複製。';
    }
  }

  $('bf-start').addEventListener('click', start);
  $('bf-gen').addEventListener('click', generate);
  $('bf-copy').addEventListener('click', copy);
})(globalThis.CE = globalThis.CE || {});
