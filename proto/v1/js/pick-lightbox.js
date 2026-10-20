(function (CE) {
  'use strict';
  // 午餐轉盤燈箱：款式分頁、候選與排除說明、開始鈕、抽到後的按鈕。
  // 用法：CE.openPicker({ stores, cards, days, today, source: 'map' | 'lunch', onPick(store, action) })
  //   stores：StoreView[]；cards：午餐卡（算最近吃過）；days：排除天數；today：'YYYY-MM-DD'
  //   action：source 為 map 時 'open' | 'propose' | 'map'，為 maplive（正式版，沒有開團單）時 'map'，為 lunch 時 'use'
  // 款式介面（pick-wheel.js、pick-plinko.js、pick-race.js）：
  //   CE.pickers[mode] = { label, startText, limit(small), ready?(), mount(box, stores, { onWin, small, reduced }) → { start(), destroy(), unavailable? } }
//   ready()：外部資源（matter.js 是 async 載入）好了沒；mount 回傳 unavailable 時，燈箱等 ready() 變 true 再重畫
  // 依賴 pick.js（CE.pick）。

  const P = CE.pick;
  const ORDER = ['wheel', 'plinko', 'race'];
  const DEFAULT_MODE = 'race';
  const MODE_KEY = 'critieat.picker.mode';
  const ACTIONS = {
    map: [['用這家開單', 'open', true], ['用這家提議', 'propose'], ['在地圖上看這家', 'map']],
    maplive: [['在地圖上看這家', 'map', true]],
    lunch: [['就這家', 'use', true]],
  };

  let dlg = null, opts = null, mode = DEFAULT_MODE, includeRecent = false, runner = null;

  // 所有資料一律用 textContent 寫入，不用 innerHTML
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function button(cls, text, onClick) {
    const b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  const modes = () => ORDER.filter(m => CE.pickers && CE.pickers[m]);
  const small = () => window.matchMedia('(max-width: 900px)').matches;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function loadMode() {
    let m = DEFAULT_MODE;
    try { m = localStorage.getItem(MODE_KEY) || DEFAULT_MODE; } catch (e) { /* 讀不到用預設 */ }
    const ok = modes();
    return ok.includes(m) ? m : (ok.includes(DEFAULT_MODE) ? DEFAULT_MODE : ok[0]);
  }

  function saveMode(m) {
    try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* 記不住就只在這次有效 */ }
  }

  function stop() {
    if (runner) runner.destroy();
    runner = null;
  }

  function getDialog() {
    if (dlg) return dlg;
    dlg = el('dialog', 'dlg mdlg pdlg');
    dlg.id = 'pick-dlg';
    dlg.setAttribute('aria-label', '午餐轉盤');
    // 只有點在燈箱外面（背景）才關；燈箱裡的空白處也是 dialog 本身，不能算
    dlg.addEventListener('click', e => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
    });
    dlg.addEventListener('close', stop);
    document.body.append(dlg);
    return dlg;
  }

  // 重畫整個燈箱；autoStart（再來一次）畫完直接開始
  function render(autoStart) {
    stop();
    const d = getDialog();
    d.replaceChildren();
    const picker = CE.pickers[mode];

    const close = button('detail__close', '×', () => d.close());
    close.setAttribute('aria-label', '關閉');
    const tabs = el('div', 'tabs pdlg__tabs');
    modes().forEach(m => tabs.append(button('tab' + (m === mode ? ' is-active' : ''), CE.pickers[m].label, () => {
      if (m === mode) return;
      mode = m;
      saveMode(m);
      render(false);
    })));
    d.append(close, el('h3', 'dlg__title', '🎲 今天吃什麼'), tabs);

    const { list, excluded } = P.candidates(opts.stores, opts.cards, { today: opts.today, days: opts.days, includeRecent });
    const info = el('div', 'pdlg__info');
    if (excluded.length) {
      const names = excluded.map(x => `${x.store.name}（${P.agoLabel(x.ago)}）`).join('、');
      info.append(el('span', null, (includeRecent ? '最近吃過（已加回來）：' : '已排除：') + names));
      const lab = el('label', 'pdlg__check');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = !includeRecent;
      cb.addEventListener('change', () => { includeRecent = !cb.checked; render(false); });
      lab.append(cb, ' 排除最近吃過');
      info.append(lab);
    }
    const max = picker.limit(small());
    if (list.length > max) info.append(el('span', null, `共 ${list.length} 家候選，這輪隨機挑 ${max} 家`));
    if (info.childNodes.length) d.append(info);

    const stage = el('div', 'pdlg__stage');
    const res = el('div', 'pdlg__res');
    const go = button('btn btn--primary pdlg__go', picker.startText, () => {
      go.disabled = true;
      res.replaceChildren(el('p', 'hint', '結果揭曉中…'));
      runner.start();
    });
    d.append(stage, go, res);
    if (!d.open) d.showModal(); // 先顯示，stage 才量得到寬度

    if (list.length < P.MIN) {
      stage.append(el('p', 'pick__warn', '候選不到 2 家，放寬篩選或把最近吃過的加回來'));
      go.disabled = true;
      return;
    }
    const round = P.sample(list, max, Math.random);
    runner = picker.mount(stage, round, { small: small(), reduced: reduced(), onWin: store => showResult(res, go, store) });
    if (runner.unavailable) {
      go.disabled = true;
      if (picker.ready) {
        const wait = setInterval(() => {
          if (!d.open || CE.pickers[mode] !== picker) { clearInterval(wait); return; }
          if (picker.ready()) { clearInterval(wait); render(false); }
        }, 500);
      }
      return;
    }
    if (autoStart) go.click();
  }

  function showResult(res, go, store) {
    go.hidden = true;
    res.replaceChildren(el('div', 'pdlg__label', '抽到了'), el('div', 'pdlg__win', store.name));
    const btns = el('div', 'btns pdlg__acts');
    ACTIONS[opts.source].forEach(([text, action, primary]) => btns.append(button(primary ? 'btn btn--primary' : 'btn', text, () => {
      dlg.close();
      opts.onPick(store, action);
    })));
    btns.append(button('btn', '再來一次', () => render(true)));
    res.append(btns);
    res.scrollIntoView({ block: 'nearest' }); // 矮螢幕上結果可能在下面
  }

  CE.openPicker = function openPicker(o) {
    opts = o;
    mode = loadMode();
    includeRecent = false;
    render(false);
  };
})(globalThis.CE = globalThis.CE || {});
