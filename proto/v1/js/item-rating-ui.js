(function (CE) {
  'use strict';

  // 品項評分：菜單燈箱與開團單共用。表單本體在 rating-form.js；品項清單在 menu-data.js。
  // 儲存或刪除後在 document 發出 'ce:item-rating-change'，其他畫面（例如燈箱背後的開團單）藉此更新。
  const R = CE.itemRating;
  const form = CE.ratingForm({ kit: R, store: CE.itemRatingStore, field: 'itemId' });
  const TOP_MIN = 4;
  const TOP_N = 3;

  // 所有使用者資料一律用 textContent 寫入，不用 innerHTML
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function badge(itemId) {
    const s = form.summary(itemId);
    return s ? `★ ${R.formatStars(s.avg)} (${s.count})` : '—';
  }

  function mineLabel(itemId) {
    const r = form.mine(itemId);
    return r ? `我 ★${R.formatStars(r.stars)}` : '';
  }

  function top(storeId) {
    return R.top(form.ratings(), CE.menuData.items(storeId), TOP_MIN, TOP_N);
  }

  // item: { id, storeId, name, note }；opts.showAvg：面板上方多一行「大家：★ 4.7 · 3 人」
  function panel(item, onChange, opts) {
    const o = opts || {};
    const box = el('div', 'rate rate--item');
    if (o.showAvg) {
      const s = form.summary(item.id);
      box.append(el('p', 'rate__avgline', s ? `大家：★ ${R.formatStars(s.avg)} · ${s.count} 人` : '大家：還沒有人評分'));
    }
    const changed = () => {
      onChange();
      document.dispatchEvent(new CustomEvent('ce:item-rating-change', { detail: { itemId: item.id } }));
    };
    box.append(form.panel({ id: item.id, extra: { storeId: item.storeId, itemName: item.name, itemNote: item.note || '' } }, changed, o));
    return box;
  }

  CE.itemRatingUi = { summary: form.summary, badge, mineLabel, top, panel };
})(globalThis.CE = globalThis.CE || {});
