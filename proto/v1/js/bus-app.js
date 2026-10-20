(function (CE) {
  'use strict';

  const state = {
    index: null,
    stores: [],
    tripNames: { from: [], to: [] },
    tab: 'stations',   // 左欄分頁：stations / routes / trip（起迄查詢）
    tripFrom: '',      // 起迄查詢的起站、迄站站名
    tripTo: '',
    query: '',
    originId: null,    // 上車站位
    destId: null,      // 下車站位（必為 origin 可直達的站）
    pattern: null,     // 正在看的路線走法；有值時右欄與地圖顯示路線
    focusId: null,     // 路線停靠站清單上點到的站
    showStores: true,
  };
  let reachCache = { id: null, map: new Map() };
  let detailKey = '';

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

  const station = id => (id ? state.index.stations.get(id) || null : null);
  const heading = s => (s.next ? `往 ${s.next}` : '終點站');

  function reachable() {
    if (reachCache.id !== state.originId) {
      reachCache = { id: state.originId, map: state.originId ? CE.busReachable(state.index, state.originId) : new Map() };
    }
    return reachCache.map;
  }

  function routeCount(s) {
    return new Set(s.visits.map(v => v.pattern.route.id)).size;
  }

  // ---------- 左欄 ----------

  function matches() {
    const q = state.query.trim().toLowerCase();
    const hit = name => !q || name.toLowerCase().includes(q);
    return {
      stations: state.index.entryStations.filter(s => hit(s.name)),
      routes: state.index.routes.filter(r => hit(r.name)),
    };
  }

  function renderList() {
    const m = matches();
    [['stations', '站牌', m.stations.length], ['routes', '路線', m.routes.length]].forEach(([key, label, n]) => {
      const tab = document.getElementById('tab-' + key);
      tab.textContent = `${label} ${n}`;
      tab.classList.toggle('is-active', state.tab === key);
      tab.setAttribute('aria-selected', String(state.tab === key));
    });

    const tripTab = document.getElementById('tab-trip');
    tripTab.classList.toggle('is-active', state.tab === 'trip');
    tripTab.setAttribute('aria-selected', String(state.tab === 'trip'));
    document.getElementById('trip-form').hidden = state.tab !== 'trip';
    document.getElementById('bus-search').hidden = state.tab === 'trip';

    const box = document.getElementById('bus-list');
    box.replaceChildren();

    if (state.tab === 'trip') { renderTripList(box); return; }
    if (state.tab === 'stations') {
      if (!m.stations.length) { box.append(el('p', 'empty', '找不到符合的站牌')); return; }
      m.stations.forEach(s => {
        const item = button('item item--compact', null, () => pickOrigin(s.id, true));
        item.dataset.id = s.id;
        if (s.id === state.originId) item.classList.add('is-selected');
        const name = el('span', 'item__name', s.name);
        if (s.featured) name.prepend(el('span', 'favdot'));
        item.append(
          name,
          el('span', 'item__meta', `${heading(s)} · ${routeCount(s)} 條路線`)
        );
        box.append(item);
      });
    } else {
      if (!m.routes.length) { box.append(el('p', 'empty', '找不到符合的路線')); return; }
      m.routes.forEach(r => {
        const first = r.patterns[0];
        const item = button('item item--compact', null, () => pickRoute(first, false));
        item.dataset.id = r.id;
        if (state.pattern && state.pattern.route === r) item.classList.add('is-selected');
        const twoWay = r.patterns.some(p => p.dir !== first.dir);
        item.append(
          el('span', 'item__name', r.name),
          el('span', 'item__meta', `${first.stops[0].name} ${twoWay ? '⇄' : '→'} ${first.headsign}`)
        );
        box.append(item);
      });
    }
  }

  // 起迄查詢的結果：依上車站位（馬路哪一側）分組
  function tripGroups() {
    return CE.busTrips(state.index, state.tripFrom, state.tripTo);
  }

  function renderTripList(box) {
    const names = state.tripNames;
    const from = state.tripFrom, to = state.tripTo;
    if (!from || !to) { box.append(el('p', 'empty', '選好起站與迄站，就會列出不用轉車可搭的公車')); return; }
    if (!names.from.includes(from)) {
      box.append(el('p', 'empty', names.to.includes(from) ? `「${from}」不在南港這一帶，起站請選範圍內的站牌` : `找不到站牌「${from}」`));
      return;
    }
    if (!names.to.includes(to)) { box.append(el('p', 'empty', `找不到站牌「${to}」`)); return; }
    if (from === to) { box.append(el('p', 'empty', '起站和迄站是同一站')); return; }

    const groups = tripGroups();
    if (!groups.length) { box.append(el('p', 'empty', `「${from}」沒有直達「${to}」的公車`)); return; }
    groups.forEach(g => {
      box.append(el('div', 'sect', `在「${g.from.name}」${heading(g.from)} 方向的站牌上車`));
      g.rides.forEach(r => {
        const row = button('busrow', null, () => {
          state.originId = r.from.id;
          state.destId = r.to.id;
          state.pattern = r.pattern;
          state.focusId = null;
          render();
          CE.fitBusMapTo([r.from, r.to]); // 上車站與下車站都看得到
        });
        if (state.pattern === r.pattern && state.originId === r.from.id && state.destId === r.to.id) row.classList.add('is-selected');
        row.append(el('span', 'chip', r.route.name), el('span', 'busrow__to', `往 ${r.headsign}`), el('span', 'busrow__note mono', `${r.stops} 站`));
        box.append(row);
      });
    });
  }

  // 起站或迄站改了：清掉目前選的站與路線，地圖移到兩站都看得到
  function onTripChange() {
    state.tripFrom = document.getElementById('trip-from').value.trim();
    state.tripTo = document.getElementById('trip-to').value.trim();
    state.originId = null;
    state.destId = null;
    state.pattern = null;
    state.focusId = null;
    render();
    const pts = tripEnds().map(x => x.station);
    if (pts.length > 1) CE.fitBusMapTo(pts);
  }

  // 起迄查詢時要在地圖上標出的站位：有直達車的上車站位與對應的下車站位
  function tripEnds() {
    const ends = new Map();
    tripGroups().forEach(g => g.rides.forEach(r => {
      ends.set(r.to.id, { station: r.to, kind: 'dest' });
      ends.set(r.from.id, { station: r.from, kind: 'origin' });
    }));
    return [...ends.values()];
  }

  // ---------- 右欄 ----------

  function closeButton() {
    const close = button('detail__close', '×', () => clearAll());
    close.setAttribute('aria-label', '關閉');
    return close;
  }

  // 一列公車：路線號碼 + 往哪裡 + 右側附註；點了進入路線檢視
  function busRow(group, note) {
    const row = button('busrow', null, () => pickRoute(group.pattern, true));
    row.append(el('span', 'chip', group.route.name), el('span', 'busrow__to', `往 ${group.headsign}`));
    if (note) row.append(el('span', 'busrow__note mono', note));
    return row;
  }

  function renderStationDetail(box) {
    const s = station(state.originId);
    const groups = CE.busStationRoutes(state.index, s.id);
    const boarding = groups.filter(g => !g.terminal);
    const ending = groups.filter(g => g.terminal);

    box.append(closeButton(), el('span', 'detail__kicker', 'STOP · 站牌'), el('h3', 'detail__name', s.name), el('span', 'detail__sub', `${heading(s)} 方向`));

    const sib = CE.busSiblings(state.index, s.id);
    if (sib.length) {
      const wrap = el('div', 'sibs');
      wrap.append(el('span', 'sibs__label', '同名站牌'));
      sib.forEach(o => wrap.append(button('btn', `${heading(o)}（${routeCount(o)}）`, () => pickOrigin(o.id, true))));
      box.append(wrap);
    }

    if (boarding.length) {
      box.append(el('p', 'detail__note', `地圖上亮起的 ${reachable().size} 個站，是從這裡上車不用轉車就能到的。點其中一站，看要搭哪台。`));
      box.append(el('div', 'sect mono', `停這站的公車 / ${boarding.length}`));
      const list = el('div', 'busrows');
      boarding.forEach(g => list.append(busRow(g, '')));
      box.append(list);
    }
    if (ending.length) {
      box.append(el('div', 'sect mono', `終點在這站（只下車）/ ${ending.length}`));
      const list = el('div', 'busrows');
      ending.forEach(g => list.append(busRow(g, '')));
      box.append(list);
    }
  }

  function renderTripDetail(box) {
    const a = station(state.originId);
    const b = station(state.destId);
    const groups = CE.busBetween(state.index, a.id, b.id);

    box.append(closeButton(), el('span', 'detail__kicker', 'DIRECT · 直達'));
    const title = el('h3', 'detail__name');
    title.append(el('span', null, a.name), el('span', 'detail__arrow', ' → '), el('span', 'detail__dest', b.name));
    box.append(title, el('span', 'detail__sub', `在「${a.name}」（${heading(a)} 方向）上車`));

    box.append(el('div', 'sect mono', `可以搭 / ${groups.length}`));
    const list = el('div', 'busrows');
    groups.forEach(g => list.append(busRow(g, `${g.stops} 站`)));
    box.append(list);

    const btns = el('div', 'btns');
    btns.append(button('btn', '← 換一個目的地', () => { state.destId = null; render(); }));
    if (b.entry) btns.append(button('btn', `改從「${b.name}」出發`, () => pickOrigin(b.id, true)));
    box.append(btns);
  }

  function renderRouteDetail(box) {
    const p = state.pattern;
    const route = p.route;
    const a = station(state.originId);

    box.append(closeButton(), el('span', 'detail__kicker', 'ROUTE · 路線'), el('h3', 'detail__name', route.name));

    const dirs = el('div', 'dirs');
    route.patterns.forEach(q => {
      const label = `往 ${q.headsign}` + (q.variant ? `（${q.variant}）` : '');
      const b = button('btn' + (q === p ? ' btn--primary' : ''), label, () => { state.pattern = q; state.focusId = null; render(); });
      dirs.append(b);
    });
    box.append(dirs);

    const tools = el('div', 'btns btns--top');
    if (a) tools.append(button('btn', `← 回到「${a.name}」`, () => { state.pattern = null; state.focusId = null; render(); }));
    tools.append(button('btn', '看整條路線', () => CE.fitBusMapTo(patternPath(p))));
    box.append(tools);

    // 上車站到下車站之間的區段（兩站都在這個走法上、順序正確時才標）
    const from = a ? p.stops.findIndex(s => s.id === a.id) : -1;
    const to = state.destId && from > -1 ? p.stops.findIndex((s, i) => i > from && s.id === state.destId) : -1;

    box.append(el('div', 'sect mono', `停靠站 / ${p.stops.length}`));
    const ol = el('ol', 'stops');
    p.stops.forEach((s, i) => {
      const li = el('li', 'stop');
      if (!s.entry) li.classList.add('is-far');
      if (to > -1 && i >= from && i <= to) li.classList.add('is-ride');
      const b = button('stop__btn', null, () => { state.focusId = s.id; render(); CE.panBusMapTo(s, 16); });
      if (s.id === state.focusId) b.classList.add('is-focus');
      const name = el('span', 'stop__name', s.name);
      if (s.featured) name.prepend(el('span', 'favdot'));
      b.append(el('span', 'stop__seq mono', String(i + 1).padStart(2, '0')), name);
      if (i === from) b.append(el('span', 'tag tag--on', '上車'));
      if (i === to) b.append(el('span', 'tag tag--off', '下車'));
      li.append(b);
      ol.append(li);
    });
    box.append(ol);
  }

  function renderDetail() {
    const box = document.getElementById('detail');
    const prevStops = box.querySelector('.stops');
    const keepScroll = prevStops ? prevStops.scrollTop : 0;
    box.replaceChildren();
    if (!state.pattern && !state.originId) { box.hidden = true; detailKey = ''; return; }
    box.hidden = false;
    if (state.pattern) renderRouteDetail(box);
    else if (state.destId) renderTripDetail(box);
    else renderStationDetail(box);

    // 路線的停靠站清單自己捲動（路線名稱與方向按鈕固定在上方）。
    // 換了檢視內容才重設捲動位置：路線檢視直接捲到上車站，沒有的話捲到第一個範圍內的站
    const stops = box.querySelector('.stops');
    const key = [state.pattern && state.pattern.id, state.originId, state.destId].join('|');
    if (key === detailKey) { if (stops) stops.scrollTop = keepScroll; return; }
    detailKey = key;
    box.scrollTop = 0;
    if (!stops) return;
    const tag = stops.querySelector('.tag--on');
    const target = tag ? tag.closest('.stop') : stops.querySelector('.stop:not(.is-far)');
    if (target) stops.scrollTop = Math.max(0, target.offsetTop - 70);
  }

  // ---------- 地圖 ----------

  // 沒有路徑資料的走法，用停靠站直線相連代替
  function patternPath(p) {
    return p.shape ? CE.decodePolyline(p.shape) : p.stops.map(s => ({ lat: s.lat, lng: s.lng }));
  }

  function renderMap() {
    const items = [];
    let path = null;
    if (state.pattern) {
      state.pattern.stops.forEach(s => items.push({ station: s, kind: s.featured ? 'fav' : 'stop' }));
      path = patternPath(state.pattern);
      if (state.focusId) items.push({ station: station(state.focusId), kind: 'focus' });
    } else if (state.originId) {
      const reach = reachable();
      state.index.entryStations.forEach(s => items.push({ station: s, kind: s.featured ? 'favDim' : 'dim' }));
      reach.forEach((list, id) => items.push({ station: station(id), kind: station(id).featured ? 'fav' : 'reach' }));
    } else {
      state.index.entryStations.forEach(s => items.push({ station: s, kind: s.featured ? 'fav' : 'base' }));
      if (state.tab === 'trip') tripEnds().forEach(x => items.push(x));
    }
    if (state.destId) items.push({ station: station(state.destId), kind: 'dest' });
    if (state.originId) items.push({ station: station(state.originId), kind: 'origin' });
    CE.renderBusMap(items, path);
  }

  // ---------- 動作 ----------

  function render() {
    renderList();
    renderDetail();
    renderMap();
  }

  function scrollListTo(id) {
    const item = document.querySelector(`#bus-list .item[data-id="${CSS.escape(id)}"]`);
    if (item) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function pickOrigin(id, pan) {
    state.originId = id;
    state.destId = null;
    state.pattern = null;
    state.focusId = null;
    render();
    if (pan) CE.panBusMapTo(station(id), 15);
  }

  // keepTrip：從站牌詳情點進來時保留上車／下車站，方便在路線上對照
  function pickRoute(pattern, keepTrip) {
    if (!keepTrip) { state.originId = null; state.destId = null; }
    state.pattern = pattern;
    state.focusId = null;
    render();
  }

  function clearAll() {
    state.originId = null;
    state.destId = null;
    state.pattern = null;
    state.focusId = null;
    render();
  }

  // 點地圖上的站牌
  function onMapStation(id) {
    const s = station(id);
    if (!s) return;
    if (state.pattern) {
      // 路線檢視：範圍內的站可以直接當上車站，範圍外的只標示站名
      if (s.entry) { pickOrigin(id, false); scrollListTo(id); }
      else { state.focusId = id; render(); }
      return;
    }
    if (id === state.originId) return;
    if (state.originId && reachable().has(id)) { state.destId = id; render(); return; }
    if (s.entry) { pickOrigin(id, false); scrollListTo(id); }
  }

  async function init() {
    if (!CE.BUS_DATA) {
      document.getElementById('bus-list').append(el('p', 'empty', '公車資料載入失敗，請重新整理'));
      return;
    }
    state.index = CE.buildBusIndex(CE.BUS_DATA, CE.CONFIG.busFeaturedStops);
    const storesReady = CE.storeRepo.ready(); // 正式版從 Supabase 載入，跟地圖並行
    state.stores = [];
    document.getElementById('data-label').textContent = `資料 TDX · ${state.index.fetchedAt}`;

    document.getElementById('bus-search').addEventListener('input', e => {
      state.query = e.target.value;
      // 目前分頁沒結果、另一個分頁有，就自動切過去
      const m = matches();
      if (state.tab === 'stations' && !m.stations.length && m.routes.length) state.tab = 'routes';
      else if (state.tab === 'routes' && !m.routes.length && m.stations.length) state.tab = 'stations';
      renderList();
    });
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { state.tab = t.dataset.tab; renderList(); renderMap(); }));

    state.tripNames = CE.busStationNames(state.index);
    const fromInput = document.getElementById('trip-from');
    const toInput = document.getElementById('trip-to');
    CE.busCombo(fromInput, state.tripNames.from, CE.CONFIG.busFeaturedStops);
    CE.busCombo(toInput, state.tripNames.to, CE.CONFIG.busFeaturedStops);
    fromInput.addEventListener('input', onTripChange);
    toInput.addEventListener('input', onTripChange);
    document.getElementById('trip-swap').addEventListener('click', () => {
      [fromInput.value, toInput.value] = [toInput.value, fromInput.value];
      onTripChange();
    });
    const storeToggle = document.getElementById('show-stores');
    state.showStores = storeToggle.checked;
    storeToggle.addEventListener('change', e => {
      state.showStores = e.target.checked;
      CE.renderBusStores(state.stores, state.showStores);
    });

    renderList();
    renderDetail();

    await CE.loadBusMap(CE.CONFIG.googleMapsKey, document.getElementById('map'), onMapStation);
    CE.fitBusMapOnce(state.index.entryStations);
    renderMap();
    await storesReady;
    state.stores = CE.storeRepo.visible();
    CE.renderBusStores(state.stores, state.showStores);
  }

  document.addEventListener('DOMContentLoaded', init);
})(globalThis.CE = globalThis.CE || {});
