(function (CE) {
  'use strict';
  // 站名輸入框的下拉建議（取代瀏覽器內建的 datalist，樣式才能跟著網站走）。
  // 選單掛在 body 上、用 fixed 定位，才不會被左欄的 overflow 裁掉。

  const MAX_ITEMS = 60;

  // input: 輸入框；names: 可選的站名；featured: 常用站名（排最前面、加橘點）
  // 選了站名會把值寫回輸入框並觸發 input 事件，呼叫端照常監聽 input 即可
  CE.busCombo = function busCombo(input, names, featured) {
    const fav = new Set(featured || []);
    const menu = document.createElement('ul');
    menu.className = 'combo-menu';
    menu.id = input.id + '-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    document.body.append(menu);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', menu.id);
    input.setAttribute('aria-expanded', 'false');

    let items = [];
    let active = -1;

    // 常用站牌 → 開頭符合 → 中間符合
    function search(q) {
      const hit = names.filter(n => n.toLowerCase().includes(q));
      const rank = n => (fav.has(n) ? 0 : 1) + (n.toLowerCase().startsWith(q) ? 0 : 2);
      return hit.map((n, i) => ({ n, i })).sort((a, b) => rank(a.n) - rank(b.n) || a.i - b.i).map(x => x.n);
    }

    function place() {
      const r = input.getBoundingClientRect();
      menu.style.left = r.left + 'px';
      menu.style.top = (r.bottom + 6) + 'px';
      menu.style.width = r.width + 'px';
      menu.style.maxHeight = Math.max(120, Math.min(300, window.innerHeight - r.bottom - 18)) + 'px';
    }

    function setActive(i) {
      active = i;
      [...menu.querySelectorAll('.combo-menu__item')].forEach((li, k) => {
        li.classList.toggle('is-active', k === i);
        li.setAttribute('aria-selected', String(k === i));
        if (k === i) li.scrollIntoView({ block: 'nearest' });
      });
    }

    function close() {
      menu.hidden = true;
      active = -1;
      input.setAttribute('aria-expanded', 'false');
    }

    function pick(name) {
      input.value = name;
      close();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function open() {
      const q = input.value.trim().toLowerCase();
      const all = search(q);
      items = all.slice(0, MAX_ITEMS);
      menu.replaceChildren();
      items.forEach((name, i) => {
        const li = document.createElement('li');
        li.className = 'combo-menu__item';
        li.setAttribute('role', 'option');
        if (fav.has(name)) { const dot = document.createElement('span'); dot.className = 'favdot'; li.append(dot); }
        // 符合輸入的那一段加粗
        const at = q ? name.toLowerCase().indexOf(q) : -1;
        if (at < 0) li.append(name);
        else {
          const b = document.createElement('b');
          b.textContent = name.slice(at, at + q.length);
          li.append(name.slice(0, at), b, name.slice(at + q.length));
        }
        li.addEventListener('mousemove', () => { if (active !== i) setActive(i); });
        li.addEventListener('click', () => pick(name));
        menu.append(li);
      });
      if (!items.length) {
        const li = document.createElement('li');
        li.className = 'combo-menu__hint';
        li.textContent = '找不到符合的站名';
        menu.append(li);
      } else if (all.length > items.length) {
        const li = document.createElement('li');
        li.className = 'combo-menu__hint';
        li.textContent = `還有 ${all.length - items.length} 站，繼續輸入可縮小範圍`;
        menu.append(li);
      }
      active = -1;
      menu.hidden = false;
      menu.scrollTop = 0;
      input.setAttribute('aria-expanded', 'true');
      place();
    }

    menu.addEventListener('mousedown', e => e.preventDefault()); // 點選單時不要讓輸入框失焦
    input.addEventListener('focus', () => { input.select(); open(); });
    input.addEventListener('click', () => { if (menu.hidden) open(); });
    input.addEventListener('input', e => { if (e.isTrusted) open(); });
    input.addEventListener('blur', close);
    input.addEventListener('keydown', e => {
      if (e.isComposing) return; // 注音選字中的 Enter 不算
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (menu.hidden) { open(); return; }
        if (!items.length) return;
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((active + step + items.length) % items.length);
      } else if (e.key === 'Enter') {
        if (menu.hidden || !items.length) return;
        e.preventDefault();
        pick(items[active > -1 ? active : 0]);
      } else if (e.key === 'Escape') {
        close();
      }
    });
    window.addEventListener('resize', () => { if (!menu.hidden) place(); });
    // 頁面或左欄捲動時跟著輸入框走（選單自己的捲動不算）
    window.addEventListener('scroll', e => { if (!menu.hidden && e.target !== menu) place(); }, true);
  };
})(globalThis.CE = globalThis.CE || {});
