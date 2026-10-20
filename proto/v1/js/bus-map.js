(function (CE) {
  'use strict';

  // 與美食地圖相同：隱藏 Google 地圖上其他商家與大眾運輸圖標
  const MAP_STYLES = [
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  ];
  const LABEL_ZOOM = 16; // 放大到這個層級以上才顯示每個站牌的小字站名
  const FALLBACK_CENTER = { lat: 25.0527, lng: 121.6068 }; // 南港車站

  // 站牌圓點的樣式：fav 常用站牌、favDim 選了站之後到不了的常用站牌、base 平常、dim 選了站之後到不了的、reach 可直達、stop 路線上的站、focus 清單上點到的站、origin 上車站、dest 下車站
  const KIND = {
    fav:    { scale: 7.5, fill: '#ffb020', stroke: '#111827', weight: 2.5, opacity: 1,  z: 35 },
    favDim: { scale: 6,  fill: '#ffb020', stroke: '#9ca3af', weight: 1.5, opacity: .45, z: 15 },
    base:   { scale: 5,  fill: '#ffffff', stroke: '#111827', weight: 2,   opacity: 1,   z: 20 },
    dim:    { scale: 4,  fill: '#ffffff', stroke: '#9ca3af', weight: 1.5, opacity: .7,  z: 10 },
    reach:  { scale: 6,  fill: '#00f0ff', stroke: '#0e7490', weight: 2,   opacity: 1,   z: 30 },
    stop:   { scale: 4.5, fill: '#ffffff', stroke: '#0891b2', weight: 2,  opacity: 1,   z: 30 },
    focus:  { scale: 8,  fill: '#00f0ff', stroke: '#111827', weight: 2.5, opacity: 1,  z: 40 },
    origin: { scale: 10, fill: '#111827', stroke: '#ffffff', weight: 3,   opacity: 1,   z: 60 },
    dest:   { scale: 10, fill: '#bc13fe', stroke: '#ffffff', weight: 3,   opacity: 1,   z: 50 },
  };

  let map = null;
  let onStation = () => {};
  let fitted = false;
  const stationMarkers = new Map(); // 站位ID → Marker（用到才建立）
  const storeMarkers = [];
  let shown = new Map();            // 目前顯示中的 站位ID → 外觀（kind，有小字時加 +label）
  let lines = [];
  let lastItems = [];
  let lastPath = null;

  CE.busMapReady = false;

  function showFallback(el) {
    CE.busMapReady = false;
    el.classList.add('map--failed');
    el.innerHTML = '<div class="map-fallback">地圖暫時無法使用<br><small>站牌與路線清單仍可正常使用</small></div>';
  }

  // 載入 Google Maps；失敗時顯示替代訊息。回傳 Promise<boolean>
  CE.loadBusMap = function loadBusMap(key, el, onPickStation) {
    onStation = onPickStation;
    return new Promise(resolve => {
      if (!key) { showFallback(el); resolve(false); return; }
      window.gm_authFailure = () => showFallback(el);
      window.__ceBusMapInit = () => {
        try {
          map = new google.maps.Map(el, {
            center: FALLBACK_CENTER,
            zoom: 15,
            styles: MAP_STYLES,
            clickableIcons: false,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          });
          CE.busMapReady = true;
          // 縮放跨過 LABEL_ZOOM 時重畫，讓小字站名出現或消失
          let labelsOn = map.getZoom() >= LABEL_ZOOM;
          map.addListener('zoom_changed', () => {
            const on = map.getZoom() >= LABEL_ZOOM;
            if (on !== labelsOn) { labelsOn = on; CE.renderBusMap(lastItems, lastPath); }
          });
          resolve(true);
        } catch (e) {
          console.error('[CRITIEAT] 地圖初始化失敗', e);
          showFallback(el);
          resolve(false);
        }
      };
      const s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) +
        '&callback=__ceBusMapInit&language=zh-TW&region=TW';
      s.async = true;
      s.onerror = () => { showFallback(el); resolve(false); };
      document.head.appendChild(s);
    });
  };

  function dotIcon(kind) {
    const k = KIND[kind];
    return {
      path: google.maps.SymbolPath.CIRCLE, scale: k.scale,
      fillColor: k.fill, fillOpacity: k.opacity, strokeColor: k.stroke, strokeOpacity: k.opacity, strokeWeight: k.weight,
      labelOrigin: new google.maps.Point(0, 2.6), // 站名在圓點正下方
    };
  }

  // 圓點下方的站名：上車／下車／點到的站一律顯示大字；常用站牌一律顯示橘字；其他站在地圖放大到 LABEL_ZOOM 以上才顯示小字
  function dotLabel(station, kind, small) {
    if (kind === 'origin' || kind === 'dest' || kind === 'focus') {
      return { text: station.name, className: 'map-pin-label', fontSize: '13px', fontWeight: '800', color: kind === 'dest' ? '#9d0fd6' : '#111827' };
    }
    if (kind === 'fav' || kind === 'favDim') {
      if (!small) return null; // 同名的另一個站位已經標過了
      return { text: station.name, className: 'map-pin-label', fontSize: '12px', fontWeight: '800', color: kind === 'favDim' ? '#9ca3af' : '#b45309' };
    }
    if (!small) return null;
    return { text: station.name, className: 'map-pin-label', fontSize: '11px', fontWeight: '600', color: kind === 'dim' ? '#9ca3af' : '#111827' };
  }

  // 回傳要標小字（或常用站牌橘字）的站位ID。馬路兩側的同名站牌只標一次，避免同樣的字疊在一起；已經有大字的站名也不再標小字
  function smallLabelIds(items) {
    const ids = new Set();
    const named = new Set();
    items.forEach(it => { if (['origin', 'dest', 'focus'].includes(it.kind)) named.add(it.station.name); });
    // 常用站牌不管縮放層級都標站名
    items.forEach(it => {
      if (it.kind !== 'fav' && it.kind !== 'favDim') return;
      if (named.has(it.station.name)) return;
      named.add(it.station.name);
      ids.add(it.station.id);
    });
    if (!map || map.getZoom() < LABEL_ZOOM) return ids;
    items.forEach(it => {
      if (named.has(it.station.name)) return;
      named.add(it.station.name);
      ids.add(it.station.id);
    });
    return ids;
  }

  // 重畫站牌與路徑。
  // items: [{ station, kind }]（同一站位重複時以後面的為準）；path: [{lat,lng}] 或 null
  CE.renderBusMap = function renderBusMap(items, path) {
    if (!CE.busMapReady) return;
    lastItems = items;
    lastPath = path;
    const next = new Map();
    items.forEach(it => next.set(it.station.id, it));
    const labeled = smallLabelIds([...next.values()]);

    shown.forEach((look, id) => { if (!next.has(id)) stationMarkers.get(id).setMap(null); });
    next.forEach((it, id) => {
      let m = stationMarkers.get(id);
      if (!m) {
        m = new google.maps.Marker({ position: { lat: it.station.lat, lng: it.station.lng }, title: it.station.name, optimized: false });
        m.addListener('click', () => onStation(id));
        stationMarkers.set(id, m);
      }
      it.look = it.kind + (labeled.has(id) ? '+label' : '');
      if (shown.get(id) !== it.look) {
        m.setIcon(dotIcon(it.kind));
        m.setLabel(dotLabel(it.station, it.kind, labeled.has(id)));
        m.setZIndex(KIND[it.kind].z);
      }
      if (!m.getMap()) m.setMap(map);
    });
    shown = new Map([...next].map(([id, it]) => [id, it.look]));

    lines.forEach(l => l.setMap(null));
    lines = [];
    if (path && path.length > 1) {
      const arrow = { path: google.maps.SymbolPath.FORWARD_OPEN_ARROW, scale: 2, strokeColor: '#111827', strokeOpacity: 1, strokeWeight: 2 };
      lines = [
        new google.maps.Polyline({ map, path, strokeColor: '#111827', strokeOpacity: .9, strokeWeight: 7, zIndex: 1, clickable: false }),
        new google.maps.Polyline({
          map, path, strokeColor: '#00f0ff', strokeOpacity: 1, strokeWeight: 4, zIndex: 2, clickable: false,
          icons: [{ icon: arrow, offset: '40px', repeat: '140px' }],
        }),
      ];
    }
  };

  // 第一次顯示時，把畫面縮放到剛好看到所有入口站牌
  CE.fitBusMapOnce = function fitBusMapOnce(stations) {
    if (!CE.busMapReady || fitted || !stations.length) return;
    const b = new google.maps.LatLngBounds();
    stations.forEach(s => b.extend({ lat: s.lat, lng: s.lng }));
    map.fitBounds(b, 24);
    fitted = true;
  };

  CE.fitBusMapTo = function fitBusMapTo(points) {
    if (!CE.busMapReady || !points.length) return;
    const b = new google.maps.LatLngBounds();
    points.forEach(p => b.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(b, 48);
  };

  CE.panBusMapTo = function panBusMapTo(station, minZoom) {
    if (!CE.busMapReady || !station) return;
    map.panTo({ lat: station.lat, lng: station.lng });
    if (minZoom && map.getZoom() < minZoom) map.setZoom(minZoom);
  };

  // 美食地圖的店家（紫色小方塊＋店名），只顯示位置，不能點
  CE.renderBusStores = function renderBusStores(stores, visible) {
    if (!CE.busMapReady) return;
    if (!storeMarkers.length) {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' +
        '<rect x="3" y="3" width="10" height="10" rx="3" fill="#bc13fe" stroke="#fff" stroke-width="2"/></svg>';
      const icon = {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
        scaledSize: new google.maps.Size(16, 16),
        anchor: new google.maps.Point(8, 8),
        labelOrigin: new google.maps.Point(8, 23),
      };
      stores.forEach(s => {
        if (s.lat == null || s.lng == null) return;
        storeMarkers.push(new google.maps.Marker({
          position: { lat: s.lat, lng: s.lng }, icon, title: s.name, optimized: false, clickable: false, zIndex: 5,
          label: { text: s.name, className: 'map-pin-label', fontSize: '11px', fontWeight: '600', color: '#9d0fd6' },
        }));
      });
    }
    storeMarkers.forEach(m => m.setMap(visible ? map : null));
  };
})(globalThis.CE = globalThis.CE || {});
