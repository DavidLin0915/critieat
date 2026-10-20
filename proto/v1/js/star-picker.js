(function (CE) {
  'use strict';

  // 所有資料一律用 textContent 寫入，不用 innerHTML
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // 半星選擇器：點星星左半邊是 n − 0.5、右半邊是 n；滑鼠移上去預覽；← → 每次調 0.5
  function starPicker(initial, onPick) {
    let current = initial;
    const wrap = el('div', 'stars');
    const row = el('div', 'stars__row');
    row.tabIndex = 0;
    row.setAttribute('role', 'slider');
    row.setAttribute('aria-label', '星等');
    row.setAttribute('aria-valuemin', '0.5');
    row.setAttribute('aria-valuemax', '5');
    const stars = [1, 2, 3, 4, 5].map(n => {
      const s = el('span', 'star', '★');
      s.dataset.n = String(n);
      s.setAttribute('aria-hidden', 'true');
      row.append(s);
      return s;
    });
    const label = el('span', 'stars__value mono');
    wrap.append(row, label);

    function paint(v) {
      stars.forEach((s, i) => {
        s.classList.toggle('is-full', v != null && v >= i + 1);
        s.classList.toggle('is-half', v === i + 0.5);
      });
      label.textContent = v == null ? '點星星評分' : CE.rating.formatStars(v);
    }
    function setAria(v) {
      if (v == null) return;
      row.setAttribute('aria-valuenow', String(v));
      row.setAttribute('aria-valuetext', CE.rating.formatStars(v) + ' 星');
    }
    function commit(v) {
      current = v;
      setAria(v);
      paint(v);
      onPick(v);
    }
    function valueAt(e) {
      const s = e.target.closest('.star');
      if (!s) return null;
      const rect = s.getBoundingClientRect();
      const n = Number(s.dataset.n);
      return e.clientX - rect.left < rect.width / 2 ? n - 0.5 : n;
    }

    row.addEventListener('click', e => { const v = valueAt(e); if (v != null) commit(v); });
    row.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return; // 手機不依賴 hover
      const v = valueAt(e);
      if (v != null) paint(v);
    });
    row.addEventListener('pointerleave', () => paint(current));
    row.addEventListener('keydown', e => {
      const step = { ArrowLeft: -0.5, ArrowDown: -0.5, ArrowRight: 0.5, ArrowUp: 0.5 }[e.key];
      if (!step) return;
      e.preventDefault();
      const next = current == null ? 0.5 : current + step;
      commit(Math.min(5, Math.max(0.5, next)));
    });

    setAria(current);
    paint(current);
    return wrap;
  }

  CE.starPicker = starPicker;
})(globalThis.CE = globalThis.CE || {});
