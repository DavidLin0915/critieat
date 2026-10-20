(function () {
  'use strict';
  // 手機版漢堡選單：切換 .hdr.is-nav-open；桌機寬度按鈕隱藏，不影響導覽列
  const hdr = document.querySelector('.hdr');
  const btn = document.getElementById('nav-btn');
  const nav = document.getElementById('site-nav');
  if (!hdr || !btn || !nav) return;

  // 正式版還沒有開團單：拿掉連結。示範模式：站內連結帶 demo=1，頁首加「示範模式」
  const CE = globalThis.CE || {};
  if (CE.isDemo && !CE.isDemo()) {
    nav.querySelectorAll('a[href^="lunch.html"]').forEach(a => a.remove());
  } else if (CE.isDemo) {
    nav.querySelectorAll('a[href$=".html"]').forEach(a => a.setAttribute('href', CE.demoHref(a.getAttribute('href'))));
    const badge = document.createElement('span');
    badge.className = 'pill demo-badge';
    badge.textContent = '示範模式';
    nav.after(badge);
  }

  function setOpen(open) {
    hdr.classList.toggle('is-nav-open', open);
    document.documentElement.classList.toggle('nav-lock', open); // 選單開著時底下的頁面不捲動
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
  }

  btn.addEventListener('click', () => setOpen(!hdr.classList.contains('is-nav-open')));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('click', e => { if (!hdr.contains(e.target)) setOpen(false); });
  // 全螢幕選單：點連結以外的空白處關閉
  nav.addEventListener('click', e => { if (e.target === nav) setOpen(false); });
})();
