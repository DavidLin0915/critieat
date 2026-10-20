(function (CE) {
  'use strict';

  // 兩點直線距離（公尺，haversine）；任一點缺座標回傳 null
  CE.distanceMeters = function distanceMeters(a, b) {
    if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
    const R = 6371000;
    const rad = x => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  // 350m / 1.2km；null 回傳空字串
  CE.formatDistance = function formatDistance(m) {
    if (m == null) return '';
    return m < 1000 ? Math.round(m / 10) * 10 + 'm' : (m / 1000).toFixed(1) + 'km';
  };
})(globalThis.CE = globalThis.CE || {});
