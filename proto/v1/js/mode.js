(function (CE) {
  'use strict';
  // 正式版（live）或示範模式（demo）。網址有 demo=1，或 config.js 沒填 Supabase 網址，就是示範模式：
  // 資料全用瀏覽器 localStorage 與示範檔，不碰 Supabase。正式版不顯示開團單、評分與示範資料。
  const cfg = CE.CONFIG || {};
  const demo = new URLSearchParams(location.search).get('demo') === '1' || !cfg.supabaseUrl;

  CE.MODE = demo ? 'demo' : 'live';
  CE.isDemo = () => CE.MODE === 'demo';

  // 示範模式下站內連結都帶 demo=1，換頁後仍是示範模式；正式版原樣回傳
  CE.demoHref = function (href) {
    if (!CE.isDemo() || /[?&]demo=1(&|#|$)/.test(href)) return href;
    const i = href.indexOf('#');
    const path = i > -1 ? href.slice(0, i) : href;
    const hash = i > -1 ? href.slice(i) : '';
    return path + (path.includes('?') ? '&' : '?') + 'demo=1' + hash;
  };
})(globalThis.CE = globalThis.CE || {});
