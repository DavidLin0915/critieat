(function (CE) {
  'use strict';
  // 菜單燈箱：結構化表格 + 原始照片對照，以及「上傳 → AI 辨識 → 確認草稿 → 儲存」流程（原型：辨識是假的）。
  // 正式版沒有 AI 辨識：「上傳照片 → 對照照片手動輸入品項 → 儲存」，照片上傳到 Supabase Storage。
  // 資料：讀寫交給 menu-data.js（CE.menuData）。
  // 用法：CE.hasMenu(storeId)、CE.openMenu({ id, name, category })
  // 儲存或還原後在 document 發出 'ce:menu-change'，頁面可藉此更新按鈕文字。
  // 依賴 menu-draft.js（CE.menuDraft）、menu-data.js（CE.menuData）。

  const D = CE.menuDraft;
  const MD = CE.menuData;
  const STALE_DAYS = 60;
  const MAX_BYTES = 10 * 1024 * 1024;
  const FAKE_DELAY = 1500;

  // 所有使用者資料一律用 textContent 寫入，不用 innerHTML
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

  function price(n) {
    if (n == null) return '—';
    return '$' + (Number.isInteger(n) ? n : n.toFixed(1));
  }

  function daysSince(ymd) {
    const d = new Date(ymd + 'T00:00:00');
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  // 台灣時間的今天 'YYYY-MM-DD'
  function today() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }

  function me() {
    let v = '';
    try { v = localStorage.getItem('critieat.me.v2') || ''; } catch (e) { /* 讀不到當作沒選 */ }
    // 正式版只認同事名單上的名字：沒選過、或是示範模式選的名字，都要先選
    return CE.isDemo() || CE.memberRepo.list().includes(v) ? v : '';
  }

  function changed(storeId) {
    document.dispatchEvent(new CustomEvent('ce:menu-change', { detail: { storeId } }));
  }

  // 上傳的照片縮到長邊 1200px 的 JPEG：示範模式要 data URL（放進 localStorage），正式版要 Blob（上傳）；讀不了回傳 null
  function shrink(src, asBlob) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        if (asBlob) c.toBlob(b => resolve(b), 'image/jpeg', 0.8);
        else resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function getDialog() {
    let dlg = document.getElementById('menu-dlg');
    if (dlg) return dlg;
    dlg = el('dialog', 'dlg mdlg');
    dlg.id = 'menu-dlg';
    dlg.setAttribute('aria-label', '菜單');
    // 點背景（dialog 本身，不是內容）關閉
    // 點背景關閉：按下與放開都要在背景上（在欄位裡拖曳選字、放開在燈箱外，不算點背景）
    let downOnBackdrop = false;
    dlg.addEventListener('mousedown', e => { downOnBackdrop = e.target === dlg; });
    dlg.addEventListener('click', e => { if (e.target === dlg && downOnBackdrop) dlg.close(); downOnBackdrop = false; });
    document.body.append(dlg);
    return dlg;
  }

  // ── 菜單檢視：表格／照片 ──
  function renderJump(menu, body) {
    const jump = el('div', 'mjump');
    menu.sections.forEach((sec, i) => {
      jump.append(button('mjump__btn', sec.name, () => {
        const target = body.querySelector(`[data-sec="${i}"]`);
        if (target) body.scrollTo({ top: target.offsetTop - 8, behavior: 'smooth' });
      }));
    });
    return jump;
  }

  // 每列：品名（＋備註、我評過的「我 ★n」）、平均、價格；點列在下面展開品項評分，同時只展開一列
  // rate: { openId, toggle(id), changed() }
  function renderRows(menu, storeId, rate) {
    const IR = CE.itemRatingUi;
    const wrap = el('div', 'mtable');
    menu.sections.forEach((sec, i) => {
      const h = el('h4', 'msec', sec.name);
      h.dataset.sec = String(i);
      const table = el('table', 'mitems');
      sec.items.forEach(it => {
        const open = rate.openId === it.id;
        const tr = el('tr', 'mitems__row' + (open ? ' is-open' : ''));
        tr.dataset.item = it.id;
        const name = el('td', 'mitems__name', it.name);
        if (it.note) name.append(el('span', 'mitems__note', it.note));
        // 品項評分第二階段才上正式版：只有品名與價格，列不能點開
        if (!CE.isDemo()) {
          tr.append(name, el('td', 'mitems__price mono', price(it.price)));
          table.append(tr);
          return;
        }
        tr.tabIndex = 0;
        tr.setAttribute('aria-expanded', String(open));
        const mine = IR.mineLabel(it.id);
        if (mine) name.append(el('span', 'mitems__mine', mine));
        const rt = el('td', 'mitems__rate' + (IR.summary(it.id) ? '' : ' is-none'), IR.badge(it.id));
        tr.append(name, rt, el('td', 'mitems__price mono', price(it.price)));
        tr.addEventListener('click', () => rate.toggle(it.id));
        tr.addEventListener('keydown', e => {
          if (e.target === tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); rate.toggle(it.id); }
        });
        table.append(tr);
        if (open) {
          const ptr = el('tr', 'mitems__panel');
          const td = el('td');
          td.colSpan = 3;
          td.append(IR.panel({ id: it.id, storeId, name: it.name, note: it.note || '' }, rate.changed));
          ptr.append(td);
          table.append(ptr);
        }
      });
      wrap.append(h, table);
    });
    return wrap;
  }

  function renderPhoto(menu) {
    const box = el('div', 'mphoto');
    if (menu.photos && menu.photos.length) {
      menu.photos.forEach((src, i) => {
        const img = el('img', 'mphoto__img');
        img.src = src;
        img.alt = `菜單照片 ${i + 1}`;
        box.append(img);
      });
      return box;
    }
    if (!CE.isDemo()) {
      box.append(el('p', 'empty', '這份菜單沒有照片，可以按「📷 重新上傳」補上'));
      return box;
    }
    // 示意用的「原始照片」：故意歪斜、偏色的紙張，對照表格的整齊
    const paper = el('div', 'mphoto__paper');
    menu.sections.forEach(sec => {
      paper.append(el('div', 'mphoto__h', sec.name));
      sec.items.forEach(it => {
        const line = el('div', 'mphoto__line');
        line.append(el('span', null, it.name + (it.note ? `（${it.note}）` : '')), el('span', null, it.price == null ? '' : String(it.price)));
        paper.append(line);
      });
    });
    box.append(paper, el('p', 'mphoto__cap', '示意圖：實際上是使用者上傳的照片原檔'));
    return box;
  }

  CE.hasMenu = function (storeId) {
    return MD.hasMenu(storeId);
  };

  CE.openMenu = function (store) {
    const dlg = getDialog();
    let token = 0;          // 換畫面或關閉時加一，讓還沒跑完的假辨識作廢
    let photos = [];        // 上傳畫面選的照片 [{ src, kind: 'file' | 'url' }]
    let rows = [];          // 草稿列
    let rowErrors = [];
    let flash = '';         // 菜單畫面上方的一次性訊息

    dlg.onclose = () => { token += 1; };

    function frame(sub) {
      token += 1;
      dlg.replaceChildren();
      const head = el('div', 'mdlg__head');
      head.append(el('span', 'detail__kicker', store.category || '菜單'), el('h3', 'dlg__title', sub ? `${store.name} · ${sub}` : store.name));
      dlg.append(button('detail__close', '×', () => dlg.close()), head);
      dlg.querySelector('.detail__close').setAttribute('aria-label', '關閉');
      return head;
    }

    function startUpload() {
      photos = [];
      showUpload('');
    }

    // ── 1. 菜單 ──
    function showMenu() {
      const head = frame();
      const menu = MD.getMenu(store.id);
      if (!menu) {
        const empty = el('div', 'menu__ph menu__ph--cta');
        empty.append(el('span', null, '尚未建立菜單'), button('btn btn--primary', '📷 上傳菜單', startUpload));
        dlg.append(empty);
        return;
      }

      const age = daysSince(menu.updatedAt);
      const stale = age > STALE_DAYS;
      const metaRow = el('div', 'mdlg__metarow');
      metaRow.append(el('span', 'mdlg__meta' + (stale ? ' is-stale' : ''),
        `最後更新 ${menu.updatedAt} · 由 ${menu.updatedBy || '—'} 整理` + (stale ? ` · 已 ${age} 天沒更新，價格可能有變` : '')));
      const actions = el('span', 'mdlg__actions');
      actions.append(button('btn mdlg__act', '📷 重新上傳', startUpload));
      // 正式版不能刪菜單（資料庫不開放刪除），也沒有示範菜單可還原
      if (!CE.isDemo()) {
        // 只有「重新上傳」
      } else if (MD.isSaved(store.id) && CE.DEMO_MENUS && CE.DEMO_MENUS[store.id]) {
        actions.append(button('linkbtn', '還原示範菜單', () => {
          MD.removeSaved(store.id);
          flash = '已還原成示範菜單';
          changed(store.id);
          showMenu();
        }));
      } else if (MD.isSaved(store.id)) {
        actions.append(button('linkbtn', '刪除這份菜單', () => {
          MD.removeSaved(store.id);
          changed(store.id);
          showMenu();
        }));
      }
      metaRow.append(actions);
      head.append(metaRow);
      if (flash) { dlg.append(el('p', 'mdlg__flash', flash)); flash = ''; }

      const tabs = el('div', 'tabs mdlg__tabs');
      const tTable = button('tab is-active', '菜單表格', () => show('table'));
      const tPhoto = button('tab', '原始照片', () => show('photo'));
      tabs.append(tTable, tPhoto);

      const body = el('div', 'mdlg__body');
      const jump = renderJump(menu, body);
      const photo = renderPhoto(menu);
      const top = el('div', 'mtop');
      let openId = null;
      let wrap = null;
      let tab = 'table';

      // 同名品項才在膠囊上加備註區分（魯肉飯（大））
      const sameName = name => menu.sections.reduce((n, s) => n + s.items.filter(x => x.name === name).length, 0) > 1;

      function paintTop() {
        if (!CE.isDemo()) { top.hidden = true; return; }
        const list = CE.itemRatingUi.top(store.id);
        top.replaceChildren();
        top.hidden = tab !== 'table' || list.length === 0;
        if (!list.length) return;
        top.append(el('b', 'mtop__label', '大家推'));
        list.forEach(x => {
          const chip = button('mtop__chip', x.item.name + (x.item.note && sameName(x.item.name) ? `（${x.item.note}）` : ''), () => {
            openId = x.item.id;
            paint(x.item.id);
          });
          chip.append(el('b', null, '★ ' + CE.itemRating.formatStars(x.avg)));
          top.append(chip);
        });
      }

      // 重畫表格：保留捲動位置；scrollTo 有給就捲到那一列
      function paint(scrollTo) {
        const keep = body.scrollTop;
        const a = document.activeElement;
        const focused = a && a.classList.contains('mitems__row') ? a.dataset.item : null; // 用鍵盤開關時，重畫後焦點留在同一列
        const next = renderRows(menu, store.id, {
          openId,
          toggle: id => { openId = openId === id ? null : id; paint(); },
          changed: () => paint(),
        });
        if (wrap && wrap.isConnected) wrap.replaceWith(next);
        wrap = next;
        paintTop();
        body.scrollTop = keep;
        if (focused) {
          const tr = wrap.querySelector(`[data-item="${CSS.escape(focused)}"]`);
          if (tr) tr.focus({ preventScroll: true });
        }
        if (scrollTo) {
          const tr = wrap.querySelector(`[data-item="${CSS.escape(scrollTo)}"]`);
          if (tr) body.scrollTo({ top: tr.offsetTop - 8, behavior: 'smooth' });
        }
      }

      function show(which) {
        tab = which;
        tTable.classList.toggle('is-active', which === 'table');
        tPhoto.classList.toggle('is-active', which === 'photo');
        jump.hidden = which !== 'table';
        paintTop();
        body.replaceChildren(which === 'table' ? wrap : photo);
        body.scrollTop = 0;
      }

      paint();
      dlg.append(tabs, top, jump, body);
      show('table');
    }

    // ── 2. 上傳 ──
    function addFiles(files) {
      const errs = [];
      Array.from(files).forEach(f => {
        if (!f.type.startsWith('image/')) errs.push(`「${f.name}」不是圖片`);
        else if (f.size > MAX_BYTES) errs.push(`「${f.name}」超過 10MB`);
        else photos.push({ src: URL.createObjectURL(f), kind: 'file' });
      });
      showUpload(errs.join('；'));
    }

    function addUrl(raw) {
      const v = raw.trim();
      if (!v) return;
      if (!/^https?:\/\//i.test(v)) { showUpload('請貼 http:// 或 https:// 開頭的網址'); return; }
      if (/maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps/i.test(v)) {
        showUpload('這是 Google Maps 的分享連結，不是圖片本身。請在 Maps 上把菜單照片截圖後上傳。');
        return;
      }
      photos.push({ src: v, kind: 'url' });
      showUpload('');
    }

    function showUpload(error) {
      frame('上傳菜單');
      const body = el('div', 'mdlg__body mup');
      body.append(el('p', 'hint', '可以一次選多張（多頁菜單）。照片會跟整理好的表格一起保存，之後可以切換對照。'));

      const drop = el('label', 'mup__drop');
      const file = el('input');
      file.type = 'file';
      file.accept = 'image/*';
      file.multiple = true;
      file.hidden = true;
      file.addEventListener('change', () => addFiles(file.files));
      drop.append(file, el('span', 'mup__icon', '📷'), el('span', null, '點這裡選照片，或把照片拖進來'));
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
      drop.addEventListener('drop', e => { e.preventDefault(); addFiles(e.dataTransfer.files); });

      const urlRow = el('div', 'dlg__row');
      const url = el('input', 'search');
      url.placeholder = '或貼上圖片網址';
      url.setAttribute('aria-label', '圖片網址');
      url.addEventListener('keydown', e => { if (e.key === 'Enter') addUrl(url.value); });
      urlRow.append(url, button('btn', '加入', () => addUrl(url.value)));

      body.append(drop, urlRow);
      if (error) body.append(el('p', 'editor__err', error));

      if (photos.length) {
        const grid = el('div', 'mup__thumbs');
        photos.forEach((p, i) => {
          const t = el('div', 'mup__thumb');
          const img = el('img');
          img.src = p.src;
          img.alt = `照片 ${i + 1}`;
          img.addEventListener('error', () => {
            photos = photos.filter(x => x !== p);
            showUpload('有一張網址抓不到圖片，已移除。請確認網址是直接指向圖片檔。');
          });
          const del = button('mup__del', '×', () => { photos.splice(i, 1); showUpload(''); });
          del.setAttribute('aria-label', '移除這張');
          t.append(img, del);
          grid.append(t);
        });
        body.append(grid);
      }

      const btns = el('div', 'btns mdlg__foot');
      const n = photos.length ? `（${photos.length} 張）` : '';
      // 正式版沒有照片也能直接輸入品項；重新上傳沒選新照片時保留原本的照片
      const go = CE.isDemo() ? button('btn btn--primary', `開始辨識${n}`, showLoading) : button('btn btn--primary', `下一步：輸入品項${n}`, startDraft);
      go.disabled = CE.isDemo() && photos.length === 0;
      btns.append(button('btn', '取消', showMenu), go);
      dlg.append(body, btns);
    }

    // ── 3. 辨識中（假的） ──
    function showLoading() {
      frame('辨識中');
      const box = el('div', 'mdlg__body mload');
      box.append(el('div', 'mload__spin'), el('p', 'mload__text', 'AI 正在讀菜單…'),
        el('p', 'hint', `原型示意：照片不會真的送出，${FAKE_DELAY / 1000} 秒後產生一份假的草稿。`));
      dlg.append(box);
      const my = token;
      setTimeout(() => {
        if (my !== token || !dlg.open) return;
        rows = D.fakeRecognize(MD.getMenu(store.id));
        rowErrors = [];
        showDraft('');
      }, FAKE_DELAY);
    }

    // 正式版：有舊菜單就從它開始改，沒有就一列空白
    function startDraft() {
      const old = MD.getMenu(store.id);
      rows = old ? D.fromSections(old.sections) : [{ category: '', name: '', price: '', note: '', uncertain: false }];
      rowErrors = [];
      showDraft('');
    }

    // ── 4. 確認草稿 ──
    function showDraft(error) {
      if (CE.isDemo()) {
        frame('確認辨識結果');
        dlg.append(el('p', 'mdraft__tip', '請對照照片檢查。AI 沒把握的列標成黃色，價格讀不出來的留空；改過的列黃色就會消失。'));
      } else {
        frame('輸入菜單');
        dlg.append(el('p', 'mdraft__tip', '對照照片輸入品項，價格看不清楚可以留空'));
      }

      if (photos.length) {
        const strip = el('div', 'mdraft__strip');
        photos.forEach((p, i) => {
          const a = el('a');
          a.href = p.src;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.title = '在新分頁看大圖';
          const img = el('img');
          img.src = p.src;
          img.alt = `照片 ${i + 1}`;
          a.append(img);
          strip.append(a);
        });
        dlg.append(strip);
      }

      const body = el('div', 'mdlg__body');
      const head = el('div', 'mdraft__row mdraft__row--head');
      ['分類', '品名', '價格', '備註', ''].forEach(t => head.append(el('span', null, t)));
      body.append(head);
      rows.forEach((r, i) => {
        const row = el('div', 'mdraft__row' + (r.uncertain ? ' is-uncertain' : '') + (rowErrors[i] ? ' is-error' : ''));
        const field = (key, ph, cls) => {
          const inp = el('input', cls);
          inp.value = r[key];
          inp.placeholder = ph;
          inp.setAttribute('aria-label', ph);
          inp.addEventListener('input', () => {
            r[key] = inp.value;
            if (r.uncertain) { r.uncertain = false; row.classList.remove('is-uncertain'); }
          });
          return inp;
        };
        const p = field('price', '價格', 'mdraft__price mono');
        p.inputMode = 'decimal';
        const del = button('editor__del', '×', () => { rows.splice(i, 1); rowErrors = []; showDraft(''); });
        del.setAttribute('aria-label', '刪除這一列');
        row.append(field('category', '分類', 'mdraft__cat'), field('name', '品名', 'mdraft__name'), p, field('note', '備註', 'mdraft__note'), del);
        body.append(row);
        if (rowErrors[i]) body.append(el('div', 'editor__err', rowErrors[i]));
      });
      body.append(button('btn mdraft__add', '＋ 加一列', () => {
        const last = rows[rows.length - 1];
        rows.push({ category: last ? last.category : '', name: '', price: '', note: '', uncertain: false });
        showDraft('');
      }));
      dlg.append(body);

      if (error) dlg.append(el('p', 'editor__err', error));
      const btns = el('div', 'btns mdlg__foot');
      const ok = button('btn btn--primary', '確認儲存', save);
      if (!CE.isDemo() && !me()) {
        const who = el('label', 'mdlg__who');
        const sel = el('select', 'search');
        sel.append(new Option('選名字', ''));
        CE.memberRepo.list().forEach(m => sel.append(new Option(m, m)));
        sel.addEventListener('change', () => {
          if (!sel.value) return;
          CE.lunchStore.setMe(sel.value); // 和店家燈箱共用
          document.dispatchEvent(new CustomEvent('ce:me-change', { detail: { name: sel.value } }));
          showDraft('');
        });
        who.append(el('span', null, '你是誰？'), sel);
        btns.append(who);
        ok.disabled = true;
      }
      btns.append(button('btn', '取消（不儲存）', showMenu), ok);
      dlg.append(btns);
    }

    async function save() {
      rowErrors = D.validate(rows);
      if (rowErrors.some(Boolean)) { showDraft('有欄位需要修正'); return; }
      if (D.toSections(rows).length === 0) { showDraft('至少要有一個品項'); return; }
      if (!CE.isDemo() && !me()) return;

      const my = token;
      dlg.querySelectorAll('.mdlg__foot button').forEach(b => { b.disabled = true; }); // 上傳／存檔中不能重按
      const old = MD.getMenu(store.id);
      const sections = MD.assignIds(old, D.toSections(rows), store.id, new Date());
      const menu = { updatedAt: today(), updatedBy: me() || '（未選身分）', sections, photos: [] };

      if (CE.isDemo()) {
        const srcs = await Promise.all(photos.map(p => (p.kind === 'file' ? shrink(p.src) : Promise.resolve(p.src))));
        if (my !== token || !dlg.open) return;
        menu.photos = srcs.filter(Boolean);
        if (await MD.saveMenu(store.id, menu)) {
          flash = '已儲存';
        } else {
          menu.photos = [];
          flash = (await MD.saveMenu(store.id, menu)) ? '照片太大存不進瀏覽器，只存了表格' : '無法存到瀏覽器（可能是私密視窗），這次沒有儲存';
        }
      } else {
        // 照片全部上傳成功才存菜單；有一張失敗就整份不存，草稿留著可以再試
        const urls = [];
        for (const p of photos) {
          let url = p.src;
          if (p.kind === 'file') {
            const blob = await shrink(p.src, true);
            url = blob && await MD.uploadPhoto(store.id, blob);
          }
          if (my !== token || !dlg.open) return;
          if (!url) { showDraft('照片上傳失敗，這次沒有儲存'); return; }
          urls.push(url);
        }
        menu.photos = photos.length ? urls : ((old && old.photos) || []);
        const ok = await MD.saveMenu(store.id, menu);
        if (my !== token || !dlg.open) return;
        if (!ok) { showDraft('儲存失敗，請檢查網路後再試一次'); return; }
        flash = '已儲存';
      }
      photos.forEach(p => { if (p.kind === 'file') URL.revokeObjectURL(p.src); });
      photos = [];
      changed(store.id);
      showMenu();
    }

    showMenu();
    if (!dlg.open) dlg.showModal();
  };
})(globalThis.CE = globalThis.CE || {});
