(function (CE) {
  'use strict';

  // 隱藏 Google 地圖上所有其他商家與大眾運輸圖標，只留我們的店
  const MAP_STYLES = [
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  ];
  const PIN_COLOR = { open: '#00f0ff', early: '#bc13fe', unknown: '#facc15', closed: '#d1d5db' };
  const FALLBACK_CENTER = { lat: 25.0478, lng: 121.517 };

  let map = null;
  let hqMarker = null;
  let fitted = false;
  let selectedId = null;
  let onSelect = () => {};
  const markers = new Map();

  CE.mapReady = false;

  function svgIcon(svg, size) {
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(size, size),
      anchor: new google.maps.Point(size / 2, size / 2),
      labelOrigin: new google.maps.Point(size / 2, size + 8), // 店名在圓點正下方
    };
  }

  // 圓點下方的小店名；選中時加粗放大，沒開的店用灰字
  function pinLabel(view, selected) {
    const cls = ['map-pin-label'];
    if (view.status === 'closed') cls.push('is-closed');
    if (selected) cls.push('is-selected');
    return { text: view.name, className: cls.join(' '), fontSize: selected ? '13px' : '11px', fontWeight: selected ? '800' : '600', color: view.status === 'closed' ? '#9ca3af' : '#111827' };
  }

  function pinIcon(status, selected) {
    const size = selected ? 30 : 22;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">` +
      `<circle cx="11" cy="11" r="8" fill="${PIN_COLOR[status]}" stroke="#fff" stroke-width="3"/></svg>`;
    return svgIcon(svg, size);
  }

  function hqIcon() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">` +
      `<rect x="3" y="3" width="16" height="16" rx="4" fill="#111827" stroke="#fff" stroke-width="3"/></svg>`;
    return svgIcon(svg, 24);
  }

  function showFallback(el) {
    CE.mapReady = false;
    el.classList.add('map--failed');
    el.innerHTML = '<div class="map-fallback">地圖暫時無法使用<br><small>清單與店家資訊仍可正常使用</small></div>';
  }

  // 載入 Google Maps；失敗（沒 Key、Key 錯、網路錯）時顯示替代訊息。回傳 Promise<boolean>
  CE.loadMap = function loadMap(key, el, onPick) {
    onSelect = onPick;
    return new Promise(resolve => {
      if (!key) { showFallback(el); resolve(false); return; }
      window.gm_authFailure = () => showFallback(el);
      window.__ceMapInit = () => {
        try {
          map = new google.maps.Map(el, {
            center: FALLBACK_CENTER,
            zoom: 16,
            styles: MAP_STYLES,
            clickableIcons: false,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          });
          CE.mapReady = true;
          resolve(true);
        } catch (e) {
          console.error('[CRITIEAT] 地圖初始化失敗', e);
          showFallback(el);
          resolve(false);
        }
      };
      const s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) +
        '&callback=__ceMapInit&libraries=places&language=zh-TW&region=TW';
      s.async = true;
      s.onerror = () => { showFallback(el); resolve(false); };
      document.head.appendChild(s);
    });
  };

  // 依目前要顯示的店家重畫標記。第一次畫的時候自動縮放到能看到公司與所有店。
  CE.renderMarkers = function renderMarkers(views, settings) {
    if (!CE.mapReady) return;
    markers.forEach(m => m.setMap(null));
    markers.clear();
    selectedId = null;

    const bounds = new google.maps.LatLngBounds();
    let count = 0;
    if (settings.company) {
      if (!hqMarker) {
        hqMarker = new google.maps.Marker({
          position: settings.company, map, icon: hqIcon(), title: settings.companyName, zIndex: 1,
        });
      }
      bounds.extend(settings.company);
      count++;
    }
    views.forEach(v => {
      if (v.lat == null) return;
      const m = new google.maps.Marker({
        position: { lat: v.lat, lng: v.lng },
        map,
        icon: pinIcon(v.status, false),
        label: pinLabel(v, false),
        optimized: false, // 讓店名標籤套用 CSS class
        title: v.name,
        zIndex: v.status === 'closed' ? 2 : 3,
      });
      m.__view = v;
      m.addListener('click', () => onSelect(v.id));
      markers.set(v.id, m);
      bounds.extend(m.getPosition());
      count++;
    });

    if (!fitted && count > 0) {
      if (count === 1) { map.setCenter(bounds.getCenter()); map.setZoom(17); }
      else map.fitBounds(bounds, 48);
      fitted = true;
    }
  };

  // 標示選中的店：放大標記與店名、移到最上層、移動地圖。view 為 null 時取消選取。
  CE.selectMarker = function selectMarker(view) {
    if (!CE.mapReady) return;
    if (selectedId && markers.has(selectedId)) {
      const prev = markers.get(selectedId);
      prev.setIcon(pinIcon(prev.__view.status, false));
      prev.setLabel(pinLabel(prev.__view, false));
      prev.setZIndex(prev.__view.status === 'closed' ? 2 : 3);
    }
    selectedId = view ? view.id : null;
    if (!view || !markers.has(view.id)) return;
    const m = markers.get(view.id);
    m.setIcon(pinIcon(view.status, true));
    m.setLabel(pinLabel(view, true));
    m.setZIndex(10);
    map.panTo(m.getPosition());
  };
})(globalThis.CE = globalThis.CE || {});
