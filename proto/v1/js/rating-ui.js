(function (CE) {
  'use strict';

  // 店家詳情的評分區塊（美食地圖）。表單本體在 rating-form.js，資料在 rating-store.js、邏輯在 rating.js。
  const form = CE.ratingForm({ kit: CE.rating, store: CE.ratingStore, field: 'storeId' });

  // 所有使用者資料一律用 textContent 寫入，不用 innerHTML
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function section(store, onChange) {
    const box = el('section', 'rate');
    box.setAttribute('aria-label', '評分');
    const s = form.summary(store.id);
    const head = el('div', 'rate__head');
    head.append(
      el('h4', 'rate__title', '評分'),
      el('span', 'rate__avg', s ? `★ ${CE.rating.formatStars(s.avg)} · ${s.count} 人` : '還沒有人評分')
    );
    box.append(head, form.panel({ id: store.id, extra: {} }, onChange));
    return box;
  }

  CE.ratingUi = { init: form.init, summary: form.summary, section };
})(globalThis.CE = globalThis.CE || {});
