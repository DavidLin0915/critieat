(function (CE) {
  'use strict';
  // 開團單示範資料。日期一律以「今天」往回推，所以每天打開都有資料。店家 ID 對應 data.js。
  // 今天 3 張（點餐中、提議中、已收單）＋ 前幾天 4 張已收單的紀錄（歷史紀錄與「我上次點什麼」用）。
  const MEMBERS = ['Ivy', 'Mike', '雯雯', 'Renee', 'Lexie', 'David', '刀哥', '琬翎'];

  CE.lunchDemo = function lunchDemo(now) {
    const date = CE.lunch.todayStr(now);
    const at = min => new Date(now.getTime() - min * 60000).toISOString();
    const item = (id, member, name, price, note, afterClose) =>
      ({ id: 'demo-i' + id, member, name, price, note: note || '', updatedAt: at(20), afterClose: !!afterClose });
    const card = o => Object.assign({
      date, note: '', closeAt: '13:30', pickupAt: '14:00', closedAt: '', changedAfterClose: false,
    }, o);
    // n 天前的已收單卡片
    const past = (n, o) => {
      const base = now.getTime() - n * 86400000;
      const iso = min => new Date(base - min * 60000).toISOString();
      return card(Object.assign({
        date: CE.lunch.todayStr(new Date(base)), status: 'closed', createdAt: iso(60), closedAt: iso(30),
      }, o, { items: o.items.map(it => Object.assign(it, { updatedAt: iso(40) })) }));
    };

    return {
      members: MEMBERS.slice(),
      cards: [
        card({
          id: 'demo-c1', storeId: 'R006', storeName: '八方雲集 南港興華店', status: 'ordering',
          proposer: 'Mike', owner: 'Mike', payer: 'Mike', createdAt: at(40),
          voters: ['Mike', '雯雯', 'Renee', 'Lexie'],
          items: [
            item(1, 'Mike', '招牌鍋貼 10 顆', 70), item(2, 'Mike', '酸辣湯', 35),
            item(3, '雯雯', '招牌鍋貼 10 顆', 70),
            item(4, 'Renee', '韭菜水餃 10 顆', 75, '不要辣'), item(5, 'Renee', '玉米濃湯', 40),
          ],
        }),
        card({
          id: 'demo-c2', storeId: 'R004', storeName: '涮嘴 南港店', status: 'proposed',
          proposer: '雯雯', owner: '', payer: '', note: '今天想吃辣的', createdAt: at(30),
          voters: ['雯雯', 'Renee', 'Lexie'], items: [],
        }),
        card({
          id: 'demo-c3', storeId: 'R002', storeName: '虎記魯肉飯', status: 'closed',
          proposer: 'Mike', owner: 'Mike', payer: 'Mike', createdAt: at(90), closedAt: at(25),
          changedAfterClose: true, voters: ['Mike', 'David', '刀哥', '琬翎'],
          items: [
            item(6, 'Mike', '魯肉飯（大）', 50), item(7, 'Mike', '滷蛋', 15),
            item(8, 'David', '雞腿飯', null),
            item(9, '刀哥', '魯肉飯（大）', 50),
            item(10, '琬翎', '排骨飯', null, '飯少', true),
          ],
        }),
        past(1, {
          id: 'demo-h1', storeId: 'R005', storeName: '丸亀製麵 環球南港店',
          proposer: 'Lexie', owner: 'Lexie', payer: 'Lexie', voters: ['Lexie', 'Ivy', '刀哥', 'David'],
          items: [
            item(11, 'Lexie', '釜揚烏龍麵', 119, '大碗'),
            item(12, 'Ivy', '明太子奶油烏龍麵', 159), item(13, 'Ivy', '炸蝦天婦羅', 45),
            item(14, '刀哥', '牛肉烏龍麵', 169),
            item(15, 'David', '清湯烏龍麵', 89), item(16, 'David', '地瓜天婦羅', 30),
          ],
        }),
        past(1, {
          id: 'demo-h2', storeId: 'R009', storeName: '滷樂町 南港店',
          proposer: 'Renee', owner: 'Renee', payer: '雯雯', voters: ['Renee', '雯雯'],
          items: [item(17, 'Renee', '滷肉便當', 110), item(18, '雯雯', '雞腿便當', 130, '不要青菜')],
        }),
        past(3, {
          id: 'demo-h3', storeId: 'R006', storeName: '八方雲集 南港興華店',
          proposer: '雯雯', owner: '雯雯', payer: '雯雯', voters: ['雯雯', 'Ivy', 'Mike'],
          items: [
            item(19, 'Ivy', '招牌鍋貼 10 顆', 60), item(20, 'Ivy', '酸辣湯', 40, '不要香菜'),
            item(21, '雯雯', '韭菜水餃 10 顆', 60),
            item(22, 'Mike', '咖哩鍋貼 10 顆', 65),
          ],
        }),
        past(6, {
          id: 'demo-h4', storeId: 'R002', storeName: '虎記魯肉飯',
          proposer: 'Ivy', owner: 'Ivy', payer: 'Ivy', voters: ['Ivy', 'Mike', '琬翎'],
          items: [
            item(23, 'Ivy', '控肉飯', 85), item(24, 'Ivy', '燙青菜', 40),
            item(25, 'Mike', '魯肉飯（大）', 50),
            item(26, '琬翎', '排骨飯', 110),
          ],
        }),
      ],
    };
  };
})(globalThis.CE = globalThis.CE || {});
