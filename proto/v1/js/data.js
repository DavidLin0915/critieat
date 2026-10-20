(function (CE) {
  'use strict';
  // 原型資料：格式與 Google Sheet 發布的 CSV 完全相同（中文表頭）。
  // 10 家真實店家，店名與座標取自使用者提供的 Google Maps 連結；地址、電話、營業時間待補。
  CE.DEMO_STORES_CSV = `ID,店名,分類,區域,地址,緯度,經度,電話,週一,週二,週三,週四,週五,週六,週日,Google Maps 連結,foodpanda,Uber Eats,你訂,備註,顯示,Google Place ID,最後修改者,最後修改時間
R001,Phở Wild 越式生牛肉河粉,異國,,,25.0549509,121.614137,,,,,,,,,https://maps.app.goo.gl/AvohFiKyirYx6gh49,,,,,是,,,
R002,虎記魯肉飯,飯,,,25.0554832,121.6136178,,,,,,,,,https://maps.app.goo.gl/7qZC4L4f4b4vuQTC6,,,,,是,,,
R003,蜥蜴咖哩,異國,,,25.0558235,121.6132319,,,,,,,,,https://maps.app.goo.gl/FLiLnQqpZCsfHhuY9,,,,,是,,,
R004,涮嘴 南港店,其他,,,25.0552031,121.6108791,,,,,,,,,https://maps.app.goo.gl/vx1MEa8iFc4WCZtE8,,,,,是,,,
R005,丸亀製麵 環球南港店,麵,,,25.0528955,121.6072597,,,,,,,,,https://maps.app.goo.gl/FK7FW5F28vuEX1zx8,,,,,是,,,
R006,八方雲集 南港興華店,小吃,,,25.057011,121.605492,,,,,,,,,https://maps.app.goo.gl/eN6WhhBWkJiaS4zFA,,,,,是,,,
R007,三華土魠魚羹,小吃,,,25.0503012,121.5943879,,,,,,,,,https://maps.app.goo.gl/TqoEJcUkRYppZXoY7,,,,,是,,,
R008,昆陽街 奇味番茄牛肉麵,麵,,,25.0496838,121.5939226,,,,,,,,,https://maps.app.goo.gl/oKXGBECfirfV91DN6,,,,,是,,,
R009,滷樂町 南港店,飯,,,25.0545114,121.5929919,,,,,,,,,https://maps.app.goo.gl/t846LdXcL4pyYyeo7,,,,,是,,,
R010,阿花鹹水雞,小吃,,,25.054232,121.59102,,,,,,,,,https://maps.app.goo.gl/8QbyfLymsAmSvVnt8,,,,,是,,,
`;

  CE.DEMO_SETTINGS_CSV = `名稱,值
公司名稱,CRITICAL
公司緯度,
公司經度,
訂餐時段,13:00-13:30
取餐時間,14:00
轉盤排除天數,3
`;
})(globalThis.CE = globalThis.CE || {});
