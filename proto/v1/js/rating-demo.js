(function (CE) {
  'use strict';
  // 店家評分示範資料。時間以「現在」往回推。店家 ID 對應 data.js，成員對應 lunch-demo.js。
  CE.ratingDemo = function ratingDemo(now) {
    const r = (storeId, member, stars, comment, daysAgo) => ({
      storeId, member, stars, comment,
      updatedAt: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
    });
    return {
      ratings: [
        r('R002', 'Mike', 4.5, '魯肉飯大碗很划算', 6),
        r('R002', 'Ivy', 4, '', 6),
        r('R002', '琬翎', 3.5, '排骨有點乾', 5),
        r('R005', 'Lexie', 5, '湯頭穩定，天婦羅現炸', 1.1),
        r('R005', 'Ivy', 4.5, '', 1),
        r('R005', '刀哥', 4, '牛肉偏少', 1.2),
        r('R005', 'David', 4.5, '', 2),
        r('R006', 'Mike', 3.5, '', 3),
        r('R006', '雯雯', 3, '鍋貼有點油', 3.1),
        r('R006', 'Ivy', 4, '酸辣湯推', 2),
        r('R009', 'Renee', 4, '滷肉入味', 1),
        r('R004', '雯雯', 2.5, '辣度很誠實，吃完肚子不太舒服', 9),
      ],
    };
  };
})(globalThis.CE = globalThis.CE || {});
