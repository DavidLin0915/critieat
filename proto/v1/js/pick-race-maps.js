(function (CE) {
  'use strict';
  // 競速的地圖資料（2026-10-15 與使用者一起調整定案）。pick-race.js 照這份資料把跑道蓋出來。
  // 座標：寬 380，y 往下；起跑閘門在 y=175，finish 是終點線的 y。
  // 機關：pegs 釘子區、zig 之字斜坡、ramp 斜坡、wall 牆、funnel 漏斗（中間留 gap）、bump 彈跳墊、
  //       spin 翹翹板（被珠子壓了會轉、會回正）、mill 十字風車（一直轉）、slide 左右滑動擋板、trap 定時開關的活門
  // 設計原則：每段機關之間空檔約 100px 內；貼牆的圓形障礙圓心離牆 10px 內（珠子才不會被夾住）；
  //          機關之間至少留 40px（不夾出口袋）；牆邊的小擋板由 pick-race.js 自動補。

  // 彈跳墊陣列：偶數排 5 顆、奇數排 4 顆交錯，最外側貼牆（擋住牆邊直通道）
  // 偶數排的縫 = 奇數排的位置；每個 x 至少被其中一排擋到（縫都 < 珠子直徑），最外側貼牆不夾珠子
  const bumpRows = (y, rows, dy = 80) => [...Array(rows)].flatMap((_, row) =>
    (row % 2 ? [[52, 15], [145, 13], [235, 13], [328, 15]] : [[8, 13], [100, 13], [190, 13], [280, 13], [372, 13]])
      .map(([x, r]) => ({ t: 'bump', x, y: y + row * dy, r })));
  // 一對翹翹板：外端離牆約 30px（壓下去時珠子能從末端掉出去），外端上方的牆邊擋板把貼牆的珠子撥到板上
  const spinPair = (y, speed = .05, w = 100) => [
    { t: 'spin', x: 80, y, w, speed }, { t: 'spin', x: 300, y, w, speed: -speed },
    { t: 'ramp', x: 16, y: y - 40, w: 46, a: .55 }, { t: 'ramp', x: 364, y: y - 40, w: 46, a: -.55 },
  ];

  // 原則：每段機關下面緊接釘子或之字坡（空檔 ≤ 約 100px），牆邊一定有東西擋
  const MAPS = [
    { id: 'neon', name: '霓虹彈珠台', finish: 3030, items: [
      { t: 'pegs', y: 240, rows: 4 },
      ...bumpRows(410, 3, 70),
      { t: 'zig', y: 600, n: 2 },
      ...spinPair(800),
      { t: 'pegs', y: 880, rows: 3 },
      ...bumpRows(1010, 3),
      { t: 'zig', y: 1290, n: 3 },
      { t: 'slide', x: 190, y: 1560, w: 100, range: 120, speed: .03 },
      { t: 'pegs', y: 1610, rows: 4 },
      { t: 'mill', x: 190, y: 1750, len: 120, speed: .05 }, { t: 'bump', x: 8, y: 1760, r: 16 }, { t: 'bump', x: 372, y: 1760, r: 16 },
      { t: 'zig', y: 1850, n: 2 },
      ...bumpRows(2030, 2),
      { t: 'pegs', y: 2190, rows: 4 },
      ...spinPair(2360),
      { t: 'zig', y: 2480, n: 2 },
      { t: 'bump', x: 8, y: 2680, r: 14 }, { t: 'bump', x: 110, y: 2680, r: 16 }, { t: 'bump', x: 270, y: 2680, r: 16 }, { t: 'bump', x: 372, y: 2680, r: 14 }, { t: 'bump', x: 190, y: 2740, r: 16 },
      { t: 'pegs', y: 2800, rows: 3 },
      { t: 'funnel', y: 2950, gap: 50 },
    ] },
    { id: 'factory', name: '機關工廠', finish: 2990, items: [
      { t: 'pegs', y: 240, rows: 3 },
      { t: 'trap', y: 380, closed: 180, open: 120, phase: 0 },
      { t: 'mill', x: 100, y: 470, len: 110, speed: .05 }, { t: 'mill', x: 280, y: 470, len: 110, speed: -.05 }, { t: 'bump', x: 190, y: 470, r: 14 }, { t: 'bump', x: 8, y: 470, r: 14 }, { t: 'bump', x: 372, y: 470, r: 14 },
      { t: 'pegs', y: 550, rows: 3 },
      { t: 'slide', x: 190, y: 690, w: 100, range: 110, speed: .03 },
      { t: 'zig', y: 770, n: 3 },
      { t: 'trap', y: 1060, closed: 170, open: 120, phase: 60 },
      { t: 'pegs', y: 1130, rows: 2 },
      { t: 'mill', x: 90, y: 1240, len: 110, speed: .06 }, { t: 'mill', x: 290, y: 1240, len: 110, speed: -.06 }, { t: 'ramp', x: 16, y: 1180, w: 46, a: .55 }, { t: 'ramp', x: 364, y: 1180, w: 46, a: -.55 },
      { t: 'mill', x: 190, y: 1330, len: 120, speed: .05 }, { t: 'bump', x: 8, y: 1320, r: 14 }, { t: 'bump', x: 372, y: 1320, r: 14 },
      { t: 'pegs', y: 1410, rows: 3 },
      { t: 'slide', x: 120, y: 1540, w: 100, range: 80, speed: .035 }, { t: 'slide', x: 260, y: 1610, w: 100, range: 80, speed: -.035 },
      { t: 'pegs', y: 1680, rows: 3 },
      { t: 'zig', y: 1810, n: 2 },
      { t: 'trap', y: 2000, closed: 170, open: 120, phase: 150 },
      { t: 'pegs', y: 2070, rows: 2 },
      { t: 'mill', x: 190, y: 2180, len: 130, speed: -.05 },
      ...spinPair(2270, .06),
      { t: 'pegs', y: 2340, rows: 3 },
      { t: 'zig', y: 2480, n: 3 },
      { t: 'pegs', y: 2770, rows: 2 },
      { t: 'funnel', y: 2900, gap: 50 },
    ] },
    { id: 'maze', name: '分岔迷宮', finish: 2940, items: [
      { t: 'pegs', y: 240, rows: 3 },
      // 第一次分岔：左邊釘子＋機關，右邊長長的之字坡
      { t: 'ramp', x: 145, y: 400, w: 100, a: -.6 }, { t: 'ramp', x: 235, y: 400, w: 100, a: .6 },
      { t: 'wall', x: 190, y: 760, w: 8, h: 700 },
      // 左路用彈跳墊格子（窄路放釘子兩側對不齊，會留直通道）：A 排貼牆、B 排擋 A 排的縫
      ...[460, 520, 580, 640, 790, 850, 910, 970, 1030, 1090].flatMap((y, k) =>
        (k % 2 ? [45, 95, 145] : [8, 70, 120, 166]).map(x => ({ t: 'bump', x, y, r: 12 }))),
      { t: 'spin', x: 95, y: 720, w: 120, speed: .07 }, { t: 'ramp', x: 16, y: 682, w: 46, a: .55 }, { t: 'ramp', x: 170, y: 682, w: 46, a: -.55 },
      ...[0, 1, 2, 3, 4, 5, 6].map(i => ({ t: 'ramp', x: i % 2 ? 300 : 270, y: 460 + i * 88, w: 160, a: i % 2 ? -.3 : .3 })),
      // 合流 → 瓶頸
      { t: 'funnel', y: 1180, gap: 36 },
      { t: 'wall', x: 172, y: 1270, w: 8, h: 80 }, { t: 'wall', x: 208, y: 1270, w: 8, h: 80 },
      { t: 'spin', x: 190, y: 1370, w: 130, speed: .06 },
      { t: 'pegs', y: 1430, rows: 4 },
      // 第二次分岔：三條路
      { t: 'wall', x: 127, y: 1870, w: 8, h: 580 }, { t: 'wall', x: 253, y: 1870, w: 8, h: 580 },
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ t: 'bump', x: [25, 98, 62][i % 3], y: 1600 + i * 62, r: 14 })),
      ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap(i => (i % 2 ? [190] : [145, 235]).map(x => ({ t: 'bump', x, y: 1610 + i * 70, r: 14 }))),
      ...[0, 1, 2, 3, 4, 5, 6].map(i => ({ t: 'ramp', x: i % 2 ? 330 : 305, y: 1610 + i * 80, w: 100, a: i % 2 ? -.35 : .35 })),
      { t: 'funnel', y: 2220, gap: 36 },
      { t: 'bump', x: 190, y: 2310, r: 16 }, ...spinPair(2380, .06),
      { t: 'pegs', y: 2450, rows: 4 },
      { t: 'zig', y: 2640, n: 2 },
      { t: 'funnel', y: 2840, gap: 50 },
    ] },
  ];

  CE.RACE_MAPS = MAPS;
})(globalThis.CE = globalThis.CE || {});
