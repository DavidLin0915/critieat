(function (CE) {
  'use strict';
  // 店家新增／編輯燈箱（美食地圖）。Google 帶入走 places.js，存檔走 store-repo.js，驗證在 store-edit.js。
  // 用法：CE.openStoreForm(storeId | null, { center: {lat,lng}, onDone(id | null) })
  //   null = 新增；儲存後 onDone(店家 ID)，移除後 onDone(null)，「去看這家」onDone(那家 ID)；取消不呼叫。

  const E = CE.storeEdit;
  const DAY_LABEL = { mon: '週一', tue: '週二', wed: '週三', thu: '週四', fri: '週五', sat: '週六', sun: '週日' };
  const LINKS = [['googleMaps', 'Google Maps 連結'], ['foodpanda', 'foodpanda'], ['ubereats', 'Uber Eats'], ['nidin', '你訂']];
  const MAP_STYLES = [
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  ];
  const TXT = {
    tag: '已從 Google 帶入',
    googleFail: 'Google 搜尋暫時無法使用，請手動填寫',
    dup: '這家已經有了',
    revived: '這家之前被移除過，儲存後會重新出現在地圖上',
    saveFail: '無法儲存到這台電腦的瀏覽器',
    mapFail: '地圖暫時無法使用，位置可之後再補',
  };

  let st = null; // 這次開啟的狀態

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

  function stamp(iso) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
    return `${p.month}/${p.day} ${p.hour}:${p.minute}`;
  }

  function blank() {
    return {
      id: '', name: '', category: '', area: '', address: '', phone: '', lat: null, lng: null,
      hours: Object.fromEntries(E.DAYS.map(d => [d, ''])),
      links: { googleMaps: '', foodpanda: '', ubereats: '', nidin: '' },
      note: '', placeId: '', updatedBy: '', updatedAt: '', visible: true,
    };
  }

  const field = k => st.dlg.querySelector(`[data-f="${k}"]`);

  // 目前表單內容 → 與 Store 同形（未 trim）
  function collect() {
    const v = Object.assign({}, st.base, {
      name: field('name').value, address: field('address').value, phone: field('phone').value, note: field('note').value,
      category: st.category, lat: st.lat, lng: st.lng, placeId: st.placeId,
      hours: Object.fromEntries(E.DAYS.map(d => [d, field('hours.' + d).value])),
      links: Object.fromEntries(LINKS.map(([k]) => [k, field('link.' + k).value])),
    });
    return v;
  }

  const dirty = () => JSON.stringify(collect()) !== st.orig;

  function getDialog() {
    let dlg = document.getElementById('store-dlg');
    if (dlg) return dlg;
    dlg = el('dialog', 'dlg mdlg sdlg');
    dlg.id = 'store-dlg';
    dlg.setAttribute('aria-label', '店家資料');
    dlg.addEventListener('click', e => { if (e.target === dlg) requestClose(); });
    // Esc：有改過先問；瀏覽器若硬關（連按 Esc），重新打開並問
    dlg.addEventListener('cancel', e => { e.preventDefault(); requestClose(); });
    dlg.addEventListener('close', () => {
      if (st && !st.closing && dirty()) { dlg.showModal(); showConfirm('discard'); }
    });
    document.body.append(dlg);
    return dlg;
  }

  function finish(id) {
    st.closing = true;
    st.dlg.close();
    const done = st.onDone;
    st = null;
    if (id !== undefined) done(id);
  }

  function requestClose() {
    if (!st) return;
    if (st.confirm) { hideConfirm(); return; }
    if (dirty()) showConfirm('discard');
    else finish();
  }

  // ── 訊息、標記、錯誤 ──
  function setMsg(text, kind, gotoId) {
    const box = st.dlg.querySelector('.sdlg__msg');
    box.replaceChildren();
    box.hidden = !text;
    box.className = 'sdlg__msg' + (kind ? ' is-' + kind : '');
    if (!text) return;
    box.append(el('span', null, text));
    if (gotoId) box.append(button('linkbtn sdlg__goto', '去看這家', () => finish(gotoId)));
  }

  function tag(key, on) {
    const lab = st.dlg.querySelector(`[data-tag="${key}"]`);
    if (!lab) return;
    const old = lab.querySelector('.sdlg__tag');
    if (old) old.remove();
    if (on) lab.append(el('span', 'sdlg__tag', '· ' + TXT.tag));
  }

  const tagged = key => !!st.dlg.querySelector(`[data-tag="${key}"] .sdlg__tag`);

  function showIssues(errors, warnings) {
    st.dlg.querySelectorAll('.sdlg__err').forEach(e => e.remove());
    Object.entries(errors).forEach(([k, msg]) => {
      const host = st.dlg.querySelector(`[data-slot="${k}"]`);
      if (host) host.append(el('p', 'sdlg__err', msg));
    });
    showWarnings(warnings);
  }

  function showWarnings(warnings) {
    st.dlg.querySelectorAll('.sdlg__warn').forEach(e => e.remove());
    Object.entries(warnings).forEach(([d, msg]) => {
      const host = st.dlg.querySelector(`[data-slot="hours.${d}"]`);
      if (host) host.append(el('p', 'sdlg__warn', msg));
    });
  }

  // ── 表單欄位 ──
  function input(key, value, placeholder, tagKey) {
    const i = el('input', 'search sdlg__in');
    i.type = 'text';
    i.value = value;
    i.dataset.f = key;
    if (placeholder) i.placeholder = placeholder;
    i.addEventListener('input', () => {
      if (tagKey) tag(tagKey, false);
      if (key.startsWith('hours.')) showWarnings(E.validate(collect()).warnings);
    });
    return i;
  }

  function fieldBox(label, key, control, tagKey) {
    const box = el('div', 'sdlg__field');
    box.dataset.slot = key;
    const lab = el('label', 'sdlg__label', label);
    if (tagKey) lab.dataset.tag = tagKey;
    box.append(lab, control);
    return box;
  }

  function categories() {
    const box = el('div', 'sdlg__cats');
    E.CATEGORIES.forEach(c => {
      const b = button('sdlg__cat', c, () => {
        st.category = c;
        box.querySelectorAll('.sdlg__cat').forEach(x => x.setAttribute('aria-pressed', String(x.textContent === st.category)));
      });
      b.setAttribute('aria-pressed', String(c === st.category));
      box.append(b);
    });
    return box;
  }

  // ── 小地圖 ──
  function posText() {
    st.dlg.querySelector('.sdlg__pos').textContent =
      st.lat == null ? '尚未設定位置，點地圖放圖釘' : `位置 ${st.lat.toFixed(5)}, ${st.lng.toFixed(5)}`;
  }

  function setPos(lat, lng, pan) {
    st.lat = lat;
    st.lng = lng;
    posText();
    if (!st.map) return;
    const p = { lat, lng };
    if (!st.marker) {
      st.marker = new google.maps.Marker({ position: p, map: st.map, draggable: true });
      st.marker.addListener('dragend', e => setPos(e.latLng.lat(), e.latLng.lng(), false));
    } else st.marker.setPosition(p);
    if (pan) st.map.panTo(p);
  }

  function miniMap() {
    const wrap = el('div', 'sdlg__field');
    wrap.append(el('label', 'sdlg__label', '位置'));
    const box = el('div', 'sdlg__map');
    wrap.append(box, el('p', 'sdlg__pos'));
    if (!CE.mapReady) {
      box.classList.add('is-failed');
      box.append(el('p', 'sdlg__mapmsg', TXT.mapFail));
      return wrap;
    }
    st.map = new google.maps.Map(box, {
      center: st.lat == null ? st.center : { lat: st.lat, lng: st.lng }, zoom: 17, styles: MAP_STYLES,
      clickableIcons: false, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
    });
    st.map.addListener('click', e => setPos(e.latLng.lat(), e.latLng.lng(), false));
    return wrap;
  }

  // ── Google 帶入 ──
  function searchBox() {
    const box = el('div', 'sdlg__g');
    box.append(el('label', 'sdlg__label', '從 Google 帶入'));
    const q = el('input', 'search sdlg__search');
    q.type = 'search';
    q.placeholder = '打店名搜尋，例如：虎記魯肉飯';
    q.setAttribute('autocomplete', 'off');
    const drop = el('ul', 'sdlg__drop');
    drop.hidden = true;
    drop.setAttribute('role', 'listbox');
    box.append(q, drop);

    let timer = 0;
    let seq = 0;
    let items = [];
    let active = -1;

    const close = () => { drop.hidden = true; items = []; active = -1; };
    const paint = () => drop.querySelectorAll('li').forEach((li, i) => li.classList.toggle('is-active', i === active));

    function show(list) {
      items = list;
      active = -1;
      drop.replaceChildren();
      list.forEach((s, i) => {
        const li = el('li', 'sdlg__opt');
        li.setAttribute('role', 'option');
        li.append(el('b', null, s.main), el('span', null, s.secondary));
        li.addEventListener('mousedown', e => { e.preventDefault(); pick(i); });
        drop.append(li);
      });
      drop.hidden = !list.length;
    }

    async function pick(i) {
      const s = items[i];
      close();
      if (!s) return;
      q.value = s.main;
      try {
        apply(await CE.places.details(s));
      } catch (e) {
        console.warn('[CRITIEAT] Google 店家資料讀取失敗', e);
        setMsg(TXT.googleFail, 'warn');
      }
    }

    q.addEventListener('input', () => {
      clearTimeout(timer);
      const text = q.value.trim();
      if (text.length < 2) { seq++; close(); return; }
      timer = setTimeout(async () => {
        const my = ++seq;
        try {
          if (!CE.places.available()) throw new Error('Google Places 未載入');
          const list = await CE.places.suggest(text, st.center);
          if (my === seq && st) show(list);
        } catch (e) {
          if (my !== seq || !st) return;
          console.warn('[CRITIEAT] Google 搜尋失敗', e);
          close();
          setMsg(TXT.googleFail, 'warn');
        }
      }, 300);
    });
    q.addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229) return; // 注音選字中
      if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); active = (active + 1) % items.length; paint(); }
      else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); active = (active - 1 + items.length) % items.length; paint(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) pick(active); }
      else if (e.key === 'Escape' && !drop.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
    });
    q.addEventListener('blur', () => setTimeout(close, 150));
    return box;
  }

  function fill(key, value, tagKey) {
    field(key).value = value;
    tag(tagKey || key, true);
  }

  // 把 Google 店家資料填進表單。新增：全部填；編輯：店名、分類、外送連結、備註保留
  function apply(info) {
    const other = CE.storeRepo.findByPlaceId(info.placeId);
    st.reviveId = '';
    if (other && other.id !== st.id) {
      if (st.isNew && other.visible === false) {
        st.reviveId = other.id;
        setMsg(TXT.revived, 'info');
      } else {
        setMsg(TXT.dup, 'warn', other.visible !== false ? other.id : '');
        return;
      }
    } else setMsg('');
    // Google 這次沒給的欄位：上一次帶入（還有標記）的值要清掉，自己填的保留
    const take = (key, value) => {
      if (value) fill(key, value);
      else if (tagged(key)) { field(key).value = ''; tag(key, false); }
    };
    if (st.isNew) take('name', info.name);
    take('address', info.address);
    take('phone', info.phone);
    take('link.googleMaps', info.googleMapsUrl);
    if (info.hours || tagged('hours')) {
      E.DAYS.forEach(d => { field('hours.' + d).value = info.hours ? info.hours[d] : ''; });
      tag('hours', !!info.hours);
      showWarnings(E.validate(collect()).warnings);
    }
    st.placeId = info.placeId;
    if (info.lat != null) setPos(info.lat, info.lng, true);
  }

  // ── 底部：身分、最後修改、按鈕／確認 ──
  function who() {
    const members = CE.lunchStore.peekMembers();
    const me = CE.lunchStore.getMe();
    return members.includes(me) ? me : '';
  }

  function renderFoot() {
    const foot = st.dlg.querySelector('.sdlg__foot');
    foot.replaceChildren();
    if (st.confirm) {
      const box = el('div', 'sdlg__confirm');
      if (st.confirm === 'remove') {
        box.append(
          el('span', null, `確定把 ${st.base.name} 從地圖移除？過去的開團單和評分會保留。`),
          button('btn', '取消', hideConfirm),
          button('btn sdlg__danger', '確定移除', doRemove)
        );
      } else {
        box.append(el('span', null, '放棄修改？'), button('btn', '繼續編輯', hideConfirm), button('btn btn--primary', '放棄', () => finish()));
      }
      foot.append(box);
      return;
    }
    const left = el('div', 'sdlg__left');
    if (!st.isNew) left.append(button('btn sdlg__remove', '從地圖移除', () => showConfirm('remove')));
    if (st.base.updatedBy && st.base.updatedAt) left.append(el('span', 'sdlg__stamp', `最後修改：${st.base.updatedBy}・${stamp(st.base.updatedAt)}`));
    const right = el('div', 'sdlg__right');
    const me = who();
    if (me) right.append(el('span', 'sdlg__me', `以 ${me} 身分儲存`));
    else {
      const w = el('label', 'sdlg__who');
      w.append(el('span', null, '你是誰？'));
      const sel = el('select', 'search');
      sel.append(new Option('選名字', ''));
      CE.lunchStore.peekMembers().forEach(m => sel.append(new Option(m, m)));
      sel.addEventListener('change', () => {
        if (!sel.value) return;
        CE.lunchStore.setMe(sel.value); // 和開團單、評分同步
        document.dispatchEvent(new CustomEvent('ce:me-change', { detail: { name: sel.value } }));
        renderFoot();
      });
      w.append(sel);
      right.append(w);
    }
    const save = button('btn btn--primary sdlg__save', '儲存', doSave);
    save.disabled = !me;
    right.append(button('btn sdlg__cancel', '取消', requestClose), save);
    foot.append(left, right);
  }

  function showConfirm(kind) { st.confirm = kind; renderFoot(); }
  function hideConfirm() { st.confirm = null; renderFoot(); }

  function doSave() {
    const me = who();
    if (!me) return;
    const v = E.validate(collect());
    showIssues(v.errors, v.warnings);
    if (!v.store) {
      // 焦點移到畫面上第一個錯誤的欄位
      const slot = st.dlg.querySelector('.sdlg__err').closest('[data-slot]');
      const target = slot && slot.querySelector('input, textarea, button');
      if (target) target.focus();
      return;
    }
    const store = Object.assign({}, v.store, { id: st.reviveId || st.id || CE.storeRepo.nextId(), visible: true });
    if (!CE.storeRepo.save(store, me, new Date())) { setMsg(TXT.saveFail, 'warn'); return; }
    finish(store.id);
  }

  function doRemove() {
    if (!CE.storeRepo.remove(st.id, who() || CE.lunchStore.getMe(), new Date())) {
      hideConfirm();
      setMsg(TXT.saveFail, 'warn');
      return;
    }
    finish(null);
  }

  CE.openStoreForm = function openStoreForm(storeId, opts) {
    const found = storeId ? CE.storeRepo.get(storeId) : null;
    const base = found || blank();
    const dlg = getDialog();
    st = {
      dlg, base, isNew: !found, id: found ? found.id : '', center: opts.center, onDone: opts.onDone,
      category: base.category, lat: base.lat, lng: base.lng, placeId: base.placeId,
      reviveId: '', confirm: null, closing: false, map: null, marker: null,
    };
    dlg.replaceChildren();
    const close = button('detail__close', '×', requestClose);
    close.setAttribute('aria-label', '關閉');
    const msg = el('div', 'sdlg__msg');
    msg.hidden = true;

    const left = el('div', 'sdlg__col');
    left.append(
      fieldBox('店名', 'name', input('name', base.name, '', 'name'), 'name'),
      fieldBox('分類', 'category', categories()),
      fieldBox('地址', 'address', input('address', base.address, '', 'address'), 'address'),
      fieldBox('電話', 'phone', input('phone', base.phone, '', 'phone'), 'phone')
    );
    LINKS.forEach(([k, label]) => {
      const key = 'link.' + k;
      const tagKey = k === 'googleMaps' ? key : '';
      left.append(fieldBox(label, key, input(key, base.links[k], 'https://…', tagKey), tagKey));
    });
    const note = el('textarea', 'search sdlg__in sdlg__note');
    note.dataset.f = 'note';
    note.rows = 2;
    note.value = base.note;
    left.append(fieldBox('備註', 'note', note));

    const right = el('div', 'sdlg__col');
    const hours = el('div', 'sdlg__hours');
    E.DAYS.forEach(d => {
      const row = el('div', 'sdlg__hrow');
      row.dataset.slot = 'hours.' + d;
      row.append(el('span', 'sdlg__day', DAY_LABEL[d]), input('hours.' + d, base.hours[d], '11:00-14:00 或 公休', 'hours'));
      hours.append(row);
    });
    const hLabel = el('label', 'sdlg__label', '營業時間');
    hLabel.dataset.tag = 'hours';
    right.append(hLabel, el('p', 'sdlg__hint', '格式：11:00-14:00；多段用逗號；整天休息寫「公休」；不知道就留空'), hours);

    const body = el('div', 'sdlg__body');
    body.append(left, right);
    dlg.append(
      close,
      el('h3', 'dlg__title', st.isNew ? '新增店家' : `編輯店家　${base.name}`),
      searchBox(),
      msg,
      body,
      el('div', 'sdlg__foot')
    );
    dlg.showModal();
    left.append(miniMap()); // 地圖要在燈箱顯示後才建，尺寸才對
    if (st.lat != null) setPos(st.lat, st.lng, false);
    else posText();
    st.orig = JSON.stringify(collect());
    renderFoot();
    dlg.querySelector('.sdlg__search').focus();
  };
})(globalThis.CE = globalThis.CE || {});
