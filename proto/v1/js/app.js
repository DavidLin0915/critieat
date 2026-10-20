(function (CE) {
  'use strict';

  const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_LABEL = { mon: '一', tue: '二', wed: '三', thu: '四', fri: '五', sat: '六', sun: '日' };
  const LINKS = [
    ['googleMaps', 'Google Maps 導航', true],
    ['foodpanda', 'foodpanda', false],
    ['ubereats', 'Uber Eats', false],
    ['nidin', '你訂', false],
  ];

  const state = {
    all: [],
    settings: null,
    dayKey: '',
    dayOverridden: false,
    hideClosed: false,
    selectedId: null,
    loading: false,
  };

  // 所有使用者資料一律用 textContent 寫入，不用 innerHTML
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function visible() {
    return state.hideClosed ? state.all.filter(v => v.status !== 'closed') : state.all;
  }

  function findView(id) {
    return state.all.find(v => v.id === id) || null;
  }

  function statusLabel(v) {
    switch (v.status) {
      case 'open': return '● 午餐有開';
      case 'early': return `${v.closesAt} 打烊，要早點訂`;
      case 'unknown': return '? 不確定';
      default: return CE.parseHours(v.todayHours).type === 'closed' ? '今日公休' : '午餐沒開';
    }
  }

  function renderHeader() {
    const sim = state.dayOverridden ? '（模擬）' : '';
    document.getElementById('today-label').textContent = `週${DAY_LABEL[state.dayKey]}${sim}`;
  }

  function renderList() {
    const box = document.getElementById('store-list');
    box.replaceChildren();
    const list = visible();

    const head = el('div', 'list__head mono');
    head.append(el('span', null, `STORES / ${list.length}`), el('span', null, state.settings.company ? '依距離' : '依店名'));
    const add = el('button', 'btn list__add', '＋ 新增店家');
    add.type = 'button';
    add.addEventListener('click', () => openForm(null));
    // 正式版沒有示範資料可重置：給一個空的片段，下面 append 照常
    if (state.loading) { box.append(head, el('p', 'empty', '讀取店家中…')); return; }
    const reset = CE.isDemo() ? el('button', 'list__reset store__reset', '重置示範資料') : document.createDocumentFragment();
    if (CE.isDemo()) {
      reset.type = 'button';
      reset.addEventListener('click', () => CE.storeRepo.reset());
    }
    box.append(head, add);

    if (state.all.length === 0) { box.append(el('p', 'empty', '還沒有店家資料'), reset); return; }
    if (list.length === 0) { box.append(el('p', 'empty', '今天午餐時段沒有營業的店'), reset); return; }

    list.forEach((v, i) => {
      const item = el('button', 'item');
      item.type = 'button';
      item.dataset.id = v.id;
      if (v.status === 'closed') item.classList.add('is-closed');
      if (v.id === state.selectedId) item.classList.add('is-selected');
      const rating = CE.isDemo() && CE.ratingUi.summary(v.id); // 評分第二階段才上正式版
      const meta = [
        v.category, CE.formatDistance(v.distance), v.todayHours || '營業時間未填',
        rating && `★ ${CE.rating.formatStars(rating.avg)} (${rating.count})`,
      ].filter(Boolean).join(' · ');
      item.append(
        el('span', 'item__num', String(i + 1).padStart(2, '0')),
        el('span', 'item__name', v.name),
        el('span', 'item__meta', meta),
        el('span', `badge badge--${v.status}`, statusLabel(v))
      );
      if (v.lat == null) item.append(el('span', 'item__warn', '地圖位置未設定'));
      item.addEventListener('click', () => select(v.id, 'list'));
      box.append(item);
    });
    box.append(reset);
  }

  function addRow(dl, label, value) {
    const row = el('div', 'detail__row');
    const dd = el('dd');
    if (typeof value === 'string') dd.textContent = value;
    else dd.append(value);
    row.append(el('dt', null, label), dd);
    dl.append(row);
  }

  function renderDetail() {
    const box = document.getElementById('detail');
    const v = findView(state.selectedId);
    box.replaceChildren();
    if (!v) { box.hidden = true; return; }
    box.hidden = false;

    const close = el('button', 'detail__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '關閉');
    close.addEventListener('click', () => select(null));

    const rows = el('dl', 'detail__rows');
    addRow(rows, '地址', v.address || '—');
    if (v.phone) {
      const a = el('a', null, v.phone);
      a.href = 'tel:' + v.phone.replace(/[^\d+]/g, '');
      addRow(rows, '電話', a);
    }
    if (v.area) addRow(rows, '區域', v.area);

    const week = el('table', 'week');
    WEEK.forEach(d => {
      const tr = el('tr', d === state.dayKey ? 'is-today' : null);
      tr.append(el('td', null, DAY_LABEL[d]), el('td', null, v.hours[d] || '—'));
      week.append(tr);
    });

    box.append(
      close,
      el('span', 'detail__kicker', v.category),
      el('h3', 'detail__name', v.name),
      el('span', `badge badge--${v.status}`, `${statusLabel(v)} · 今天 ${v.todayHours || '營業時間未填'}`),
      rows,
      week
    );
    if (v.note) box.append(el('p', 'detail__note', v.note));
    if (CE.isDemo()) box.append(CE.ratingUi.section(v, onRatingChange));

    const btns = el('div', 'btns');
    const editBtn = el('button', 'btn detail__edit', '✏️ 編輯');
    editBtn.type = 'button';
    editBtn.addEventListener('click', () => openForm(v.id));
    btns.append(editBtn);
    const menuBtn = el('button', 'btn', CE.hasMenu(v.id) ? '📋 看菜單' : '📋 菜單（尚未建立）');
    menuBtn.type = 'button';
    menuBtn.addEventListener('click', () => CE.openMenu(v));
    btns.append(menuBtn);
    LINKS.forEach(([key, label, primary]) => {
      if (!v.links[key]) return;
      const a = el('a', primary ? 'btn btn--primary' : 'btn', label);
      a.href = v.links[key];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      btns.append(a);
    });
    box.append(btns);
  }

  // 評分存好或刪掉後，列表平均與詳情一起更新；詳情維持原本捲動位置（手機抽屜裡評分區在下面）
  function onRatingChange() {
    const box = document.getElementById('detail');
    const top = box.scrollTop;
    renderList();
    renderDetail();
    box.scrollTop = top;
  }

  // 新增／編輯燈箱的地圖中心：公司，沒有就用店家座標的平均，再沒有用台北車站
  function formCenter() {
    if (state.settings.company) return state.settings.company;
    const pts = state.all.filter(v => v.lat != null);
    if (!pts.length) return { lat: 25.0478, lng: 121.517 };
    return { lat: pts.reduce((a, v) => a + v.lat, 0) / pts.length, lng: pts.reduce((a, v) => a + v.lng, 0) / pts.length };
  }

  function openForm(id) {
    CE.openStoreForm(id, { center: formCenter(), onDone: doneId => { if (doneId) select(doneId, 'map'); } });
  }

  function renderStoreNotice() {
    const box = document.getElementById('store-notice');
    const w = CE.storeRepo.warning();
    box.textContent = w || '';
    box.hidden = !w;
  }

  // 店家新增、修改、移除或重置後：重建清單、標記；選中的店不見了就關詳情
  document.addEventListener('ce:store-change', () => {
    if (!state.settings) return;
    state.all = CE.buildViewModel(CE.storeRepo.visible(), state.settings, state.dayKey);
    if (!findView(state.selectedId)) state.selectedId = null;
    renderStoreNotice();
    renderList();
    renderDetail();
    CE.renderMarkers(visible(), state.settings);
    CE.selectMarker(findView(state.selectedId));
  });

  // 菜單儲存或還原後，更新詳情裡「看菜單」按鈕的文字
  document.addEventListener('ce:menu-change', renderDetail);

  function select(id, source) {
    state.selectedId = id;
    renderList();
    renderDetail();
    CE.selectMarker(findView(id));
    if (id && source === 'map') {
      const item = document.querySelector(`.item[data-id="${CSS.escape(id)}"]`);
      if (item) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // 午餐轉盤：候選＝目前清單（勾了「隱藏沒開的店」就只有有開的）；最近吃過讀開團單的資料
  function openPicker() {
    CE.openPicker({
      stores: visible(),
      cards: CE.isDemo() ? CE.lunchStore.peekCards() : [], // 正式版沒有共用的開團紀錄，不排除最近吃過
      days: state.settings.pickerDays,
      today: CE.lunch.todayStr(new Date()),
      source: CE.isDemo() ? 'map' : 'maplive',
      onPick(store, action) {
        if (action === 'map') { select(store.id, 'map'); return; }
        location.href = CE.demoHref(`lunch.html?new=${encodeURIComponent(store.id)}&as=${action}`);
      },
    });
  }

  function onToggleHideClosed(e) {
    state.hideClosed = e.target.checked;
    const sel = findView(state.selectedId);
    if (sel && state.hideClosed && sel.status === 'closed') state.selectedId = null;
    renderList();
    renderDetail();
    CE.renderMarkers(visible(), state.settings);
    CE.selectMarker(findView(state.selectedId));
  }

  async function init() {
    const params = new URLSearchParams(location.search);
    const override = params.get('day');
    state.dayKey = CE.todayKey(new Date(), override);
    state.dayOverridden = state.dayKey === override;
    state.settings = CE.rowsToSettings(CE.parseCsv(CE.DEMO_SETTINGS_CSV));
    if (CE.isDemo()) CE.ratingUi.init(new Date());

    document.getElementById('hide-closed').addEventListener('change', onToggleHideClosed);
    document.getElementById('pick-btn').addEventListener('click', openPicker);
    renderHeader();

    // 正式版先從 Supabase 載入店家、同事名單與菜單；地圖同時開始載入
    state.loading = true;
    renderList();
    const mapReady = CE.loadMap(CE.CONFIG.googleMapsKey, document.getElementById('map'), id => select(id, 'map'));
    await Promise.all([CE.storeRepo.ready(), CE.memberRepo.ready(), CE.menuData.ready()]);
    state.loading = false;
    state.all = CE.buildViewModel(CE.storeRepo.visible(), state.settings, state.dayKey);

    // 從開團單「在美食地圖上看這家」連過來時（?store=R006），直接選中那家店
    const startId = params.get('store');
    if (startId && findView(startId)) state.selectedId = startId;

    renderStoreNotice();
    renderList();
    renderDetail();
    if (state.selectedId) {
      const item = document.querySelector(`.item[data-id="${CSS.escape(state.selectedId)}"]`);
      if (item) item.scrollIntoView({ block: 'nearest' });
    }

    await mapReady;
    CE.renderMarkers(visible(), state.settings);
    CE.selectMarker(findView(state.selectedId));
  }

  document.addEventListener('DOMContentLoaded', init);
})(globalThis.CE = globalThis.CE || {});
