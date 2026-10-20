(function (CE) {
  'use strict';
  // 填入團隊的 Google Maps JavaScript API Key。留空時地圖區會顯示「地圖暫時無法使用」，清單照常運作。
  // Key 若有設定 HTTP 參照網址限制，需加入 http://localhost:8000/* 才能在本機預覽。
  CE.CONFIG = {
    googleMapsKey: 'AIzaSyDi6gHEOewvQBqVZBHiyPu2TDtfytmJ0bk',
    // 公車地圖上要用不同顏色標出的常用站牌（站名要與清單上完全相同，同名的每個站位都會標）
    // Supabase：Project URL 與 publishable key（sb_publishable_… 或舊版 anon）。這兩個本來就公開，放這裡沒關係。
    // secret / service_role key 絕對不能放進任何檔案。留空時網站以示範模式運作。
    supabaseUrl: 'https://lmzfjslivlmmouqagfhd.supabase.co',
    supabaseKey: 'sb_publishable_8HT3s-YeaFJY9bw56I7tOQ_KDoBtT-O',
    busFeaturedStops: ['南港行政中心(南港車站)', '南港', '玉成國小', '捷運昆陽站'],
  };
})(globalThis.CE = globalThis.CE || {});
