(function (CE) {
  'use strict';
  // 轉盤：先公平抽一家，再算好角度讓那一格停在正上方的指針下。介面見 pick-lightbox.js。
  const COLORS = ['#e0fdff', '#f6e3ff'];
  const ODD_LAST = '#fff7d6'; // 家數為奇數時最後一格換色，避免跟第一格同色相鄰
  const SPIN_MS = 3600;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function mount(box, stores, o) {
    const n = stores.length, seg = 360 / n;
    const size = Math.min(300, box.clientWidth || 300);
    const wrap = el('div', 'pwheel');
    wrap.style.width = wrap.style.height = size + 'px';
    const disc = el('div', 'pwheel__disc');
    disc.style.background = 'conic-gradient(' + stores.map((s, i) => {
      const c = n % 2 && i === n - 1 ? ODD_LAST : COLORS[i % 2];
      return `${c} ${i * seg}deg ${(i + 1) * seg}deg`;
    }).join(',') + ')';
    const labels = stores.map((s, i) => {
      const t = el('span', 'pwheel__label' + (n > 8 ? ' is-small' : ''), s.name.length > 7 ? s.name.slice(0, 6) + '…' : s.name);
      t.style.width = (size / 2 - 22) + 'px';
      t.style.transform = `rotate(${i * seg + seg / 2 - 90}deg)`;
      disc.append(t);
      return t;
    });
    wrap.append(el('div', 'pwheel__pin'), disc, el('div', 'pwheel__hub'));
    box.append(wrap);

    let rot = 0, timer = 0;
    return {
      start() {
        labels.forEach(l => l.classList.remove('is-win'));
        const i = CE.pick.pickIndex(n, Math.random);
        // 第 i 格中心在順時針 i*seg + seg/2 度；轉到 360 − 中心角，那一格就到正上方
        rot = rot - (rot % 360) + 360 * 5 + (360 - (i * seg + seg / 2));
        disc.style.transition = o.reduced ? 'none' : '';
        void disc.offsetWidth; // 剛掛上去就開始（再來一次）時，先讓瀏覽器算好起始角度，動畫才會播
        disc.style.transform = `rotate(${rot}deg)`;
        timer = setTimeout(() => {
          labels[i].classList.add('is-win');
          o.onWin(stores[i]);
        }, o.reduced ? 0 : SPIN_MS + 100);
      },
      destroy() { clearTimeout(timer); },
    };
  }

  CE.pickers = CE.pickers || {};
  CE.pickers.wheel = { label: '轉盤', startText: '轉！', limit: () => 12, mount };
})(globalThis.CE = globalThis.CE || {});
