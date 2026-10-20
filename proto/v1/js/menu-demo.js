(function (CE) {
  'use strict';
  // 菜單燈箱 mockup 的假資料：品項與價格為示意，不是店家實際價目。
  // 結構對應未來 DB：menus（store_id, updated_at, updated_by, source_photo）+ menu_items（id 固定，重新上傳時依品名＋備註沿用）。
  CE.DEMO_MENUS = {
    R002: {
      updatedAt: '2026-10-12',
      updatedBy: '小安',
      sections: [
        { name: '飯類', items: [
          { id: 'R002-01', name: '魯肉飯', price: 35, note: '小' },
          { id: 'R002-02', name: '魯肉飯', price: 50, note: '大' },
          { id: 'R002-03', name: '雞肉飯', price: 45 },
          { id: 'R002-04', name: '控肉飯', price: 85, note: '附半顆滷蛋' },
          { id: 'R002-05', name: '排骨飯', price: 110 },
        ] },
        { name: '湯品', items: [
          { id: 'R002-06', name: '貢丸湯', price: 35 },
          { id: 'R002-07', name: '味噌湯', price: 30 },
          { id: 'R002-08', name: '蛤蜊湯', price: 60, note: '限量' },
        ] },
        { name: '小菜', items: [
          { id: 'R002-09', name: '燙青菜', price: 40, note: '當日時蔬' },
          { id: 'R002-10', name: '滷蛋', price: 15 },
          { id: 'R002-11', name: '油豆腐', price: 20 },
          { id: 'R002-12', name: '滷白菜', price: 40 },
        ] },
      ],
    },
    R005: {
      updatedAt: '2026-10-03',
      updatedBy: '阿哲',
      sections: [
        { name: '釜揚・湯烏龍', items: [
          { id: 'R005-01', name: '釜揚烏龍麵', price: 89, note: '中碗 / 大碗 +30' },
          { id: 'R005-02', name: '清湯烏龍麵', price: 89, note: '中碗 / 大碗 +30' },
          { id: 'R005-03', name: '明太子奶油烏龍麵', price: 159 },
          { id: 'R005-04', name: '牛肉烏龍麵', price: 169 },
          { id: 'R005-05', name: '咖哩烏龍麵', price: 149 },
        ] },
        { name: '炸物', items: [
          { id: 'R005-06', name: '炸蝦天婦羅', price: 45 },
          { id: 'R005-07', name: '雞肉天婦羅', price: 40 },
          { id: 'R005-08', name: '地瓜天婦羅', price: 30 },
          { id: 'R005-09', name: '竹輪天婦羅', price: 30 },
          { id: 'R005-10', name: '半熟蛋天婦羅', price: 30 },
        ] },
        { name: '飯糰', items: [
          { id: 'R005-11', name: '鮭魚飯糰', price: 40 },
          { id: 'R005-12', name: '梅子飯糰', price: 35 },
        ] },
      ],
    },
    R006: {
      updatedAt: '2026-07-20',
      updatedBy: '小安',
      sections: [
        { name: '鍋貼', items: [
          { id: 'R006-01', name: '招牌鍋貼', price: 6, note: '每顆，10 顆起' },
          { id: 'R006-02', name: '韓式辣味鍋貼', price: 6.5, note: '每顆' },
          { id: 'R006-03', name: '咖哩鍋貼', price: 6.5, note: '每顆' },
        ] },
        { name: '水餃', items: [
          { id: 'R006-04', name: '韭菜水餃', price: 6, note: '每顆' },
          { id: 'R006-05', name: '高麗菜水餃', price: 6, note: '每顆' },
          { id: 'R006-06', name: '玉米水餃', price: 6, note: '每顆' },
        ] },
        { name: '湯・麵', items: [
          { id: 'R006-07', name: '酸辣湯', price: 40 },
          { id: 'R006-08', name: '玉米濃湯', price: 40 },
          { id: 'R006-09', name: '招牌乾麵', price: 50 },
          { id: 'R006-10', name: '餛飩湯麵', price: 75 },
        ] },
        { name: '飲料', items: [
          { id: 'R006-11', name: '豆漿', price: 25, note: '冰 / 熱' },
          { id: 'R006-12', name: '紅茶', price: 25 },
        ] },
      ],
    },
  };
})(globalThis.CE = globalThis.CE || {});
