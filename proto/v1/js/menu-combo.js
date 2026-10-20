(function (CE) {
  'use strict';
  // 開團單「餐點名稱」的菜單品項下拉（自動完成）。
  // 整頁共用一個選單元素（#menu-combo），掛在 body、fixed 定位；編輯區每次重畫都會重新掛到新的輸入框上，
  // 舊輸入框被移除時會失焦，選單跟著關掉。選了品項由呼叫端（opts.onPick）決定怎麼帶入。

  const MAX = 8;
  let menu = null;
  let current = null; // { input, storeId, opts, items, active }

  // 所有資料一律用 textContent 寫入，不用 innerHTML
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function price(n) {
    if (n == null) return '—';
    return '$' + (Number.isInteger(n) ? n : n.toFixed(1));
  }

  function place() {
    if (!current || !current.input.isConnected) { close(); return; }
    const r = current.input.getBoundingClientRect();
    const w = Math.min(Math.max(r.width, 280), window.innerWidth - 16);
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    menu.style.top = (r.bottom + 6) + 'px';
    menu.style.width = w + 'px';
    menu.style.maxHeight = Math.max(120, Math.min(320, window.innerHeight - r.bottom - 18)) + 'px';
  }

  function getMenuEl() {
    if (menu) return menu;
    menu = el('ul', 'combo-menu mcombo');
    menu.id = 'menu-combo';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    menu.addEventListener('mousedown', e => e.preventDefault()); // 點選單時不要讓輸入框失焦
    document.body.append(menu);
    window.addEventListener('resize', () => { if (!menu.hidden) place(); });
    window.addEventListener('scroll', e => { if (!menu.hidden && e.target !== menu) place(); }, true);
    return menu;
  }

  function close() {
    if (!menu) return;
    menu.hidden = true;
    if (current) {
      current.active = -1;
      current.input.setAttribute('aria-expanded', 'false');
    }
  }

  function setActive(i) {
    current.active = i;
    [...menu.children].forEach((li, k) => {
      li.classList.toggle('is-active', k === i);
      li.setAttribute('aria-selected', String(k === i));
      if (k === i) li.scrollIntoView({ block: 'nearest' });
    });
  }

  function pick(item) {
    const c = current;
    close();
    c.opts.onPick(item);
  }

  function open(c) {
    current = c;
    const m = getMenuEl();
    const q = c.input.value.trim();
    c.items = CE.menuData.search(c.storeId, q, MAX);
    c.active = -1;
    m.replaceChildren();
    if (!c.items.length) { close(); return; }
    c.items.forEach((it, i) => {
      const li = el('li', 'mcombo__item');
      li.setAttribute('role', 'option');
      const name = el('span', 'mcombo__name');
      // 符合輸入的那一段加粗
      const at = it.name.toLowerCase().indexOf(q.toLowerCase());
      if (at < 0) name.append(it.name);
      else name.append(it.name.slice(0, at), el('b', null, it.name.slice(at, at + q.length)), it.name.slice(at + q.length));
      if (it.note) name.append(el('span', 'mcombo__note', it.note));
      if (c.opts.isLast && c.opts.isLast(it)) name.append(el('span', 'mcombo__last', '上次點'));
      li.append(name);
      if (CE.itemRatingUi) { // 有載入品項評分時顯示平均
        const s = CE.itemRatingUi.summary(it.id);
        li.append(el('span', 'mcombo__rate' + (s ? '' : ' is-none'), CE.itemRatingUi.badge(it.id)));
      }
      li.append(el('span', 'mcombo__price mono', price(it.price)));
      li.addEventListener('mousemove', () => { if (c.active !== i) setActive(i); });
      li.addEventListener('click', () => pick(it));
      m.append(li);
    });
    m.hidden = false;
    m.scrollTop = 0;
    c.input.setAttribute('aria-expanded', 'true');
    place();
  }

  CE.menuCombo = function menuCombo(input, storeId, opts) {
    if (!CE.menuData.hasMenu(storeId)) return; // 沒有菜單的店：跟原本一樣，只是一般輸入框
    const c = { input, storeId, opts, items: [], active: -1 };
    getMenuEl();
    input.autocomplete = 'off';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', 'menu-combo');
    input.setAttribute('aria-expanded', 'false');

    input.addEventListener('input', () => { if (input.value.trim()) open(c); else if (current === c) close(); });
    input.addEventListener('blur', () => { if (current === c) close(); });
    input.addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229) return; // 注音選字中（Safari 選字確認的 Enter 是 keyCode 229）
      const shown = current === c && !menu.hidden;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!shown) { if (input.value.trim()) open(c); return; }
        e.preventDefault();
        const n = c.items.length;
        setActive(e.key === 'ArrowDown' ? (c.active + 1) % n : (c.active - 1 + n) % n);
      } else if (e.key === 'Enter') {
        if (!shown) return;
        e.preventDefault();
        if (c.active > -1) pick(c.items[c.active]);
        else close(); // 沒選任何一筆：照打的字
      } else if (e.key === 'Escape') {
        if (shown) { e.preventDefault(); close(); }
      }
    });
  };
})(globalThis.CE = globalThis.CE || {});
