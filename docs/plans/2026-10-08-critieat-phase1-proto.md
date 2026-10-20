# CRITIEAT 第一階段：美食地圖原型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出可審核的靜態原型 `proto/v1/`（假資料、真實營業狀態邏輯、可接 Google 地圖），並準備好 Google Sheet 範本與自動補座標的 Apps Script。

**Architecture:** 純靜態 HTML + 原生 JS，不用建置工具、不用 ES modules（各檔以 `globalThis.CE` 命名空間掛載函式，讓同一份檔案能在瀏覽器與 node 驗證腳本中執行）。資料邏輯（CSV 解析、營業狀態、店家轉換）與畫面（清單、詳情、地圖）分檔；假資料採用與 Google Sheet 發布 CSV 完全相同的格式，讓原型同時驗證試算表欄位設計。邏輯檔之後可直接搬進 `critieat_web` 的 composable。

**Tech Stack:** HTML5、CSS（自訂屬性）、原生 JavaScript（ES2020）、Google Maps JavaScript API（classic `google.maps.Marker` + 地圖 styles）、Google Apps Script、Google Fonts（Inter、Noto Sans TC、JetBrains Mono）。

**Spec:** `docs/specs/2026-10-08-critieat-phase1-food-map-design.md`

**範圍說明：** 本計畫涵蓋規格 4.8 交付順序的第 1 步（靜態原型）與第 3 步（Google Sheet 範本 + Apps Script）。第 2 步（Contract-First contracts）在原型審核通過後進行；第 4 步（還原成 `critieat_web`）需先對照 critical_web 的實際結構，屆時另寫一份計畫。部署位置仍為待決。

## Global Constraints

- 使用者資料（店名、地址、備註等）一律以 `textContent` 寫入 DOM，禁止用 `innerHTML` 插入任何來自資料的內容
- 外部連結只接受 `http://` 或 `https://` 開頭，其他（例如 `javascript:`）視為空值、不顯示按鈕
- 營業狀態一律以台灣時間（`Asia/Taipei`）判斷
- 預設值：訂餐時段 `13:00-13:30`、取餐時間 `14:00`、公司名稱 `公司`
- 試算表表頭（中文）必須與規格 4.3 完全一致：`ID,店名,分類,區域,地址,緯度,經度,電話,週一,週二,週三,週四,週五,週六,週日,Google Maps 連結,foodpanda,Uber Eats,你訂,備註,顯示`
- 分類下拉清單：飯、麵、便當、小吃、異國、輕食、其他
- 狀態顏色：午餐有開＝青 `#00f0ff`、提早打烊＝紫 `#bc13fe`、不確定＝黃 `#facc15`、午餐沒開＝灰 `#d1d5db`
- 視覺風格 A：白底、文字 `#111827`、細框 `#e5e7eb`、毛玻璃卡片、模糊漸層色塊；字體 Inter + Noto Sans TC，編號與標籤用 JetBrains Mono
- **不得引入任何測試框架**（團隊鐵則）。邏輯以 scratchpad 中的一次性 node 驗證腳本確認（不放進專案），畫面以瀏覽器實際打開比對
- **不做 git 操作**：`critieat/` 總目錄比照 critical 不做 `git init`，`proto/` 與 `docs/` 不受版控
- 原型不可依賴建置工具；`proto/v1/index.html` 透過 `python3 -m http.server` 開啟即可運作

## Review Focus

1. **試算表儲存格含逗號、雙引號、換行**（例如「重慶南路一段 1 號, 2樓」、多行備註）→ 欄位完整保留、不錯位。由 Task 1 的 CSV 檢查與 Task 2 的 R012 檢查覆蓋
2. **同事用不標準寫法填營業時間**（全形冒號、`～`、`~`、全形逗號、多餘空白、`公休 `）→ 能辨識的照常判斷，真的看不懂的歸為「不確定」而不是當掉。由 Task 1 的營業狀態檢查覆蓋
3. **店名或連結含 HTML／`javascript:`** → 店名以純文字顯示，危險連結不顯示按鈕。由 Task 2 的 R012 檢查與 Task 3 的瀏覽器檢查覆蓋
4. **公司座標沒填、店家沒有座標、全部店都被隱藏** → 頁面仍可用並顯示說明文字（依店名排序、「地圖位置未設定」、「今天午餐時段沒有營業的店」）。由 Task 2 的 noCompany 檢查與 Task 3 的瀏覽器檢查覆蓋
5. **缺 ID／店名或 ID 重複的列** → 略過並在 console 警告，其餘店家照常顯示。由 Task 2 的 ID 清單檢查覆蓋

---

## 檔案結構

```
critieat/
├── proto/v1/
│   ├── index.html          頁面骨架：導覽列、三欄（清單／地圖／詳情）、載入順序
│   ├── css/style.css       風格 A 的所有樣式與手機版斷點
│   ├── img/logo.png        CRITIEAT logo（由根目錄的 Gemini logo JPEG 轉成透明 PNG）
│   └── js/
│       ├── config.js       CE.CONFIG（Google Maps Key）
│       ├── csv.js          CE.parseCsv
│       ├── hours.js        CE.parseHours / parseTime / parseRange / formatMin / lunchStatus / todayKey / DAY_KEYS
│       ├── geo.js          CE.distanceMeters / formatDistance
│       ├── stores.js       CE.rowsToStores / rowsToSettings / buildViewModel
│       ├── data.js         CE.DEMO_STORES_CSV / DEMO_SETTINGS_CSV（假資料）
│       ├── map.js          CE.loadMap / renderMarkers / selectMarker / mapReady
│       └── app.js          畫面狀態與渲染、事件綁定、init
└── docs/sheet/
    ├── README.md               試算表建立、資料驗證、Apps Script、發布 CSV 的步驟
    ├── stores-template.csv     「店家」工作表範本
    ├── settings-template.csv   「設定」工作表範本
    └── Code.gs                 Apps Script：自動補座標
```

驗證腳本放在 scratchpad（以下以 `$SCRATCH` 代表 scratchpad 目錄），不進專案：

```
$SCRATCH/check-logic.js
```

---

### Task 1: CSV 解析與營業狀態邏輯

**Files:**
- Create: `proto/v1/js/csv.js`
- Create: `proto/v1/js/hours.js`
- Verify（不進專案）: `$SCRATCH/check-logic.js`

**Interfaces:**
- Consumes: 無
- Produces:
  - `CE.parseCsv(text: string): string[][]`
  - `CE.parseHours(raw: string): { type: 'unknown' } | { type: 'closed' } | { type: 'open', segments: { start: number, end: number }[] }`（分鐘，跨午夜 end > 1440）
  - `CE.parseTime(raw: string): number | null`
  - `CE.parseRange(raw: string): { start: number, end: number } | null`
  - `CE.formatMin(min: number): string`（`'HH:MM'`）
  - `CE.lunchStatus(raw: string, settings: { orderStart: number, orderEnd: number, pickup: number }): { status: 'open' | 'early' | 'closed' | 'unknown', closesAt: string | null }`
  - `CE.todayKey(now?: Date, override?: string): 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'`
  - `CE.DAY_KEYS: ['sun','mon','tue','wed','thu','fri','sat']`

- [ ] **Step 1: 建立驗證腳本**

建立 `$SCRATCH/check-logic.js`（Task 2 會用同一支腳本的 `t2` 階段）：

```js
// 一次性驗證腳本（不進專案、不是測試框架）：node check-logic.js <proto/v1/js 目錄> [t1|t2]
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const dir = process.argv[2];
const stage = process.argv[3] || 't2';
const files = stage === 't1' ? ['csv.js', 'hours.js'] : ['csv.js', 'hours.js', 'geo.js', 'stores.js', 'data.js'];
files.forEach(f => vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f }));
const CE = globalThis.CE;
console.warn = () => {}; // 略過預期中的警告訊息

// ---- CSV ----
assert.deepStrictEqual(CE.parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
assert.deepStrictEqual(
  CE.parseCsv('﻿a,"x, y","say ""hi"""\r\n"line1\nline2",,z'),
  [['a', 'x, y', 'say "hi"'], ['line1\nline2', '', 'z']]
);
assert.deepStrictEqual(CE.parseCsv('a,b\n\n,\n1,2'), [['a', 'b'], ['1', '2']]);
assert.deepStrictEqual(CE.parseCsv(''), []);

// ---- 營業狀態（訂餐 13:00-13:30、取餐 14:00）----
const S = { orderStart: 780, orderEnd: 810, pickup: 840 };
const st = h => CE.lunchStatus(h, S);
assert.deepStrictEqual(st('11:00-14:30'), { status: 'open', closesAt: null });
assert.deepStrictEqual(st('11:00-14:00'), { status: 'open', closesAt: null });
assert.deepStrictEqual(st('13:15-15:00'), { status: 'open', closesAt: null });
assert.deepStrictEqual(st('11:00-14:00,17:00-20:30'), { status: 'open', closesAt: null });
assert.deepStrictEqual(st('11：00～14：00'), { status: 'open', closesAt: null });
assert.deepStrictEqual(st('11:00-13:30'), { status: 'early', closesAt: '13:30' });
assert.deepStrictEqual(st('11:00 ~ 13:20，17:00-20:00'), { status: 'early', closesAt: '13:20' });
assert.deepStrictEqual(st('10:00-13:10, 13:20-13:40'), { status: 'early', closesAt: '13:40' });
assert.deepStrictEqual(st('11:00-13:00'), { status: 'closed', closesAt: null });
assert.deepStrictEqual(st('17:00-21:00'), { status: 'closed', closesAt: null });
assert.deepStrictEqual(st('18:00-02:00'), { status: 'closed', closesAt: null });
assert.deepStrictEqual(st('公休'), { status: 'closed', closesAt: null });
assert.deepStrictEqual(st(' 公休 '), { status: 'closed', closesAt: null });
assert.deepStrictEqual(st(''), { status: 'unknown', closesAt: null });
assert.deepStrictEqual(st(undefined), { status: 'unknown', closesAt: null });
assert.deepStrictEqual(st('11點到2點'), { status: 'unknown', closesAt: null });
assert.deepStrictEqual(st('11:00-14:00, 25:00-26:00'), { status: 'unknown', closesAt: null });
assert.deepStrictEqual(st('11:00-11:00'), { status: 'unknown', closesAt: null });

assert.strictEqual(CE.parseTime('14:00'), 840);
assert.strictEqual(CE.parseTime('abc'), null);
assert.strictEqual(CE.parseTime('14:00:00'), 840); // Sheets 可能把時間發布成 HH:MM:SS
assert.strictEqual(CE.parseTime('13:45:00'), 825);
assert.deepStrictEqual(CE.parseRange('13:00-13:30'), { start: 780, end: 810 });
assert.strictEqual(CE.parseRange('x'), null);
assert.strictEqual(CE.formatMin(1530), '01:30');

// 2026-10-08 是週四；15:00Z = 台灣 23:00 週四，17:00Z = 台灣 01:00 週五
assert.strictEqual(CE.todayKey(new Date('2026-10-08T15:00:00Z')), 'thu');
assert.strictEqual(CE.todayKey(new Date('2026-10-08T17:00:00Z')), 'fri');
assert.strictEqual(CE.todayKey(new Date(), 'mon'), 'mon');
assert.notStrictEqual(CE.todayKey(new Date(), 'xyz'), 'xyz');

if (stage === 't1') { console.log('T1 OK'); process.exit(0); }

// ---- 距離 ----
assert.strictEqual(CE.formatDistance(null), '');
assert.strictEqual(CE.formatDistance(347), '350m');
assert.strictEqual(CE.formatDistance(1234), '1.2km');
const d = CE.distanceMeters({ lat: 25.0478, lng: 121.517 }, { lat: 25.049, lng: 121.5195 });
assert.ok(d > 250 && d < 320, 'distance ' + d);
assert.strictEqual(CE.distanceMeters(null, { lat: 1, lng: 1 }), null);

// ---- 設定 ----
const set = CE.rowsToSettings(CE.parseCsv(CE.DEMO_SETTINGS_CSV));
assert.deepStrictEqual(set, {
  companyName: 'CRITICAL（示意位置）', company: { lat: 25.0478, lng: 121.517 },
  orderStart: 780, orderEnd: 810, pickup: 840,
});
assert.deepStrictEqual(CE.rowsToSettings([['訂餐時段', '亂寫'], ['取餐時間', '']]), {
  companyName: '公司', company: null, orderStart: 780, orderEnd: 810, pickup: 840,
});

// ---- 店家 ----
const stores = CE.rowsToStores(CE.parseCsv(CE.DEMO_STORES_CSV));
assert.deepStrictEqual(stores.map(s => s.id).sort(),
  ['R001', 'R002', 'R003', 'R004', 'R005', 'R006', 'R007', 'R008', 'R010', 'R012']);
const byId = Object.fromEntries(stores.map(s => [s.id, s]));
assert.strictEqual(byId.R001.name, 'XX 拉麵');
assert.strictEqual(byId.R001.hours.tue, '11:00-14:30, 17:00-20:30');
assert.strictEqual(byId.R012.name, 'Tom\'s "漢堡" <店>');
assert.strictEqual(byId.R012.address, '台北市中正區重慶南路一段 1 號, 2樓');
assert.strictEqual(byId.R012.links.foodpanda, '');
assert.strictEqual(byId.R012.note, '第一行備註\n第二行備註');
assert.strictEqual(byId.R010.lat, null);
assert.strictEqual(byId.R010.lng, null);
assert.strictEqual(byId.R001.links.foodpanda, 'https://www.foodpanda.com.tw/');
assert.deepStrictEqual(CE.rowsToStores([]), []);

// ---- 畫面資料（週四）----
const vms = CE.buildViewModel(stores, set, 'thu');
const thu = Object.fromEntries(vms.map(v => [v.id, v]));
const expectThu = { R001: 'open', R002: 'early', R003: 'unknown', R004: 'closed', R005: 'closed',
  R006: 'closed', R007: 'open', R008: 'unknown', R010: 'open', R012: 'open' };
Object.entries(expectThu).forEach(([id, s]) => assert.strictEqual(thu[id].status, s, id));
assert.strictEqual(thu.R002.closesAt, '13:30');
assert.strictEqual(thu.R010.distance, null);
const rank = { open: 0, early: 1, unknown: 2, closed: 3 };
for (let i = 1; i < vms.length; i++) {
  assert.ok(rank[vms[i - 1].status] <= rank[vms[i].status], 'status order');
  if (vms[i - 1].status === vms[i].status && vms[i].distance != null) {
    assert.ok(vms[i - 1].distance != null && vms[i - 1].distance <= vms[i].distance, 'distance order');
  }
}
const mon = Object.fromEntries(CE.buildViewModel(stores, set, 'mon').map(v => [v.id, v.status]));
assert.strictEqual(mon.R001, 'closed');
assert.strictEqual(mon.R004, 'open');
const noCompany = CE.buildViewModel(stores, Object.assign({}, set, { company: null }), 'thu');
assert.ok(noCompany.every(v => v.distance === null));

console.log('T2 OK');
```

- [ ] **Step 2: 執行驗證，確認失敗**

Run: `node $SCRATCH/check-logic.js proto/v1/js t1`（在 `critieat/` 目錄下執行）
Expected: FAIL，錯誤為 `ENOENT: no such file or directory ... csv.js`

- [ ] **Step 3: 建立 `proto/v1/js/csv.js`**

```js
(function (CE) {
  'use strict';

  // 解析 CSV（RFC 4180）：支援雙引號包住的欄位，欄位內可含逗號、換行，"" 代表一個雙引號。
  // 回傳 string[][]，並略過整列都是空白的列。
  CE.parseCsv = function parseCsv(text) {
    const s = String(text == null ? '' : text).replace(/^﻿/, '');
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inQuotes) {
        if (ch === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter(r => r.some(c => c.trim() !== ''));
  };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 4: 建立 `proto/v1/js/hours.js`**

```js
(function (CE) {
  'use strict';

  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const SEG_RE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;
  const TIME_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/; // Sheets 可能把時間發布成 HH:MM:SS

  // 容忍常見寫法：全形冒號、～ ~ – — 當連字號、全形逗號、任意空白
  function normalize(raw) {
    return String(raw == null ? '' : raw)
      .replace(/：/g, ':')
      .replace(/[～~–—－]/g, '-')
      .replace(/，/g, ',')
      .replace(/\s+/g, '');
  }

  function toMin(h, m) {
    h = Number(h);
    m = Number(m);
    if (h > 24 || m > 59 || (h === 24 && m > 0)) return NaN;
    return h * 60 + m;
  }

  // 解析某一天的營業時間字串。
  // 回傳 { type: 'unknown' } | { type: 'closed' } | { type: 'open', segments: [{ start, end }] }
  // start / end 為分鐘；跨午夜時 end 會大於 1440。
  CE.parseHours = function parseHours(raw) {
    const s = normalize(raw);
    if (s === '') return { type: 'unknown' };
    if (s === '公休') return { type: 'closed' };
    const segments = [];
    for (const part of s.split(',')) {
      const m = SEG_RE.exec(part);
      if (!m) return { type: 'unknown' };
      const start = toMin(m[1], m[2]);
      let end = toMin(m[3], m[4]);
      if (Number.isNaN(start) || Number.isNaN(end) || start === end) return { type: 'unknown' };
      if (end < start) end += 1440;
      segments.push({ start, end });
    }
    return { type: 'open', segments };
  };

  // 'HH:MM' 或 'HH:MM:SS' → 分鐘（秒數忽略）；格式錯誤回傳 null
  CE.parseTime = function parseTime(raw) {
    const m = TIME_RE.exec(normalize(raw));
    if (!m) return null;
    const v = toMin(m[1], m[2]);
    return Number.isNaN(v) ? null : v;
  };

  // 'HH:MM-HH:MM' → { start, end }；格式錯誤或多段回傳 null
  CE.parseRange = function parseRange(raw) {
    const p = CE.parseHours(raw);
    if (p.type !== 'open' || p.segments.length !== 1) return null;
    return p.segments[0];
  };

  // 分鐘 → 'HH:MM'（超過 24 小時會繞回）
  CE.formatMin = function formatMin(min) {
    const m = ((min % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };

  // 午餐營業狀態。settings: { orderStart, orderEnd, pickup }（分鐘）
  // 回傳 { status: 'open' | 'early' | 'closed' | 'unknown', closesAt: 'HH:MM' | null }
  //   open    某時段與訂餐時段重疊，且在取餐時間（含）之後才打烊
  //   early   某時段與訂餐時段重疊，但都在取餐時間前打烊（closesAt = 最晚的打烊時間）
  //   closed  公休，或沒有任何時段與訂餐時段重疊
  //   unknown 空白或格式看不懂
  CE.lunchStatus = function lunchStatus(raw, settings) {
    const p = CE.parseHours(raw);
    if (p.type === 'unknown') return { status: 'unknown', closesAt: null };
    if (p.type === 'closed') return { status: 'closed', closesAt: null };
    const overlapping = p.segments.filter(
      seg => seg.start < settings.orderEnd && seg.end > settings.orderStart
    );
    if (overlapping.length === 0) return { status: 'closed', closesAt: null };
    if (overlapping.some(seg => seg.end >= settings.pickup)) return { status: 'open', closesAt: null };
    const last = Math.max(...overlapping.map(seg => seg.end));
    return { status: 'early', closesAt: CE.formatMin(last) };
  };

  // 以台灣時間取得今天的星期 key（'mon'…'sun'）。override 為合法 key 時直接採用（原型用 ?day= 模擬）。
  CE.todayKey = function todayKey(now, override) {
    if (override && DAY_KEYS.includes(override)) return override;
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', weekday: 'short' })
      .format(now || new Date());
    return wd.slice(0, 3).toLowerCase();
  };

  CE.DAY_KEYS = DAY_KEYS;
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 5: 執行驗證，確認通過**

Run: `node $SCRATCH/check-logic.js proto/v1/js t1`
Expected: 輸出 `T1 OK`

- [ ] **Step 6: 版控**

不需要：`critieat/` 總目錄不做 git（見 Global Constraints）。

---

### Task 2: 距離、店家／設定轉換、假資料

**Files:**
- Create: `proto/v1/js/geo.js`
- Create: `proto/v1/js/stores.js`
- Create: `proto/v1/js/data.js`
- Verify（不進專案）: `$SCRATCH/check-logic.js`（Task 1 已建立）

**Interfaces:**
- Consumes: Task 1 的 `CE.parseCsv`、`CE.lunchStatus`、`CE.parseRange`、`CE.parseTime`、`CE.DAY_KEYS`
- Produces:
  - `CE.distanceMeters(a: {lat,lng} | null, b: {lat,lng} | null): number | null`
  - `CE.formatDistance(m: number | null): string`
  - `CE.rowsToStores(rows: string[][]): Store[]`，`Store = { id, name, category, area, address, phone, lat: number|null, lng: number|null, hours: { sun, mon, tue, wed, thu, fri, sat: string }, links: { googleMaps, foodpanda, ubereats, nidin: string }, note }`
  - `CE.rowsToSettings(rows: string[][]): Settings`，`Settings = { companyName: string, company: {lat,lng} | null, orderStart: number, orderEnd: number, pickup: number }`
  - `CE.buildViewModel(stores: Store[], settings: Settings, dayKey: string): StoreView[]`，`StoreView = Store & { status, closesAt, todayHours: string, distance: number | null }`，已排序
  - `CE.DEMO_STORES_CSV: string`、`CE.DEMO_SETTINGS_CSV: string`

- [ ] **Step 1: 執行驗證，確認失敗**

Run: `node $SCRATCH/check-logic.js proto/v1/js t2`
Expected: FAIL，錯誤為 `ENOENT: no such file or directory ... geo.js`

- [ ] **Step 2: 建立 `proto/v1/js/geo.js`**

```js
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
```

- [ ] **Step 3: 建立 `proto/v1/js/stores.js`**

```js
(function (CE) {
  'use strict';

  // 試算表中文表頭 → 英文欄位名（與未來 DB 欄位一致）
  const HEADER_MAP = {
    'ID': 'id', '店名': 'name', '分類': 'category', '區域': 'area', '地址': 'address',
    '緯度': 'lat', '經度': 'lng', '電話': 'phone',
    '週一': 'hours_mon', '週二': 'hours_tue', '週三': 'hours_wed', '週四': 'hours_thu',
    '週五': 'hours_fri', '週六': 'hours_sat', '週日': 'hours_sun',
    'Google Maps 連結': 'google_maps_url', 'foodpanda': 'foodpanda_url',
    'Uber Eats': 'ubereats_url', '你訂': 'nidin_url', '備註': 'note', '顯示': 'visible',
  };

  const SETTING_MAP = {
    '公司名稱': 'companyName', '公司緯度': 'companyLat', '公司經度': 'companyLng',
    '訂餐時段': 'orderWindow', '取餐時間': 'pickupTime',
  };

  const DEFAULTS = { companyName: '公司', orderWindow: '13:00-13:30', pickupTime: '14:00' };

  const STATUS_RANK = { open: 0, early: 1, unknown: 2, closed: 3 };

  function toNum(v) {
    const s = String(v == null ? '' : v).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // 只接受 http(s) 連結，其他（例如 javascript:）一律視為空
  function safeUrl(v) {
    const s = String(v == null ? '' : v).trim();
    return /^https?:\/\//i.test(s) ? s : '';
  }

  // CSV 列（第一列為表頭）→ Store[]
  // Store: { id, name, category, area, address, phone, lat, lng, hours: { mon…sun }, links: { googleMaps, foodpanda, ubereats, nidin }, note }
  // 略過：缺 ID 或店名的列、重複 ID（保留第一筆）、顯示 = 否
  CE.rowsToStores = function rowsToStores(rows) {
    if (!rows.length) return [];
    const header = rows[0].map(h => HEADER_MAP[String(h).trim()] || null);
    const seen = new Set();
    const stores = [];

    rows.slice(1).forEach((cells, i) => {
      const r = {};
      header.forEach((key, c) => { if (key) r[key] = String(cells[c] == null ? '' : cells[c]).trim(); });
      const line = i + 2;
      if (!r.id || !r.name) {
        console.warn(`[CRITIEAT] 第 ${line} 列缺少 ID 或店名，已略過`);
        return;
      }
      if (seen.has(r.id)) {
        console.warn(`[CRITIEAT] 第 ${line} 列 ID「${r.id}」重複，已略過`);
        return;
      }
      seen.add(r.id);
      if (r.visible === '否') return;

      const lat = toNum(r.lat);
      const lng = toNum(r.lng);
      const hasCoords = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

      stores.push({
        id: r.id,
        name: r.name,
        category: r.category || '其他',
        area: r.area || '',
        address: r.address || '',
        phone: r.phone || '',
        lat: hasCoords ? lat : null,
        lng: hasCoords ? lng : null,
        hours: Object.fromEntries(CE.DAY_KEYS.map(d => [d, r['hours_' + d] || ''])),
        links: {
          googleMaps: safeUrl(r.google_maps_url),
          foodpanda: safeUrl(r.foodpanda_url),
          ubereats: safeUrl(r.ubereats_url),
          nidin: safeUrl(r.nidin_url),
        },
        note: r.note || '',
      });
    });
    return stores;
  };

  // 設定工作表（A 欄名稱、B 欄值）→ Settings
  // Settings: { companyName, company: { lat, lng } | null, orderStart, orderEnd, pickup }（時間為分鐘）
  CE.rowsToSettings = function rowsToSettings(rows) {
    const raw = {};
    rows.forEach(([k, v]) => {
      const key = SETTING_MAP[String(k == null ? '' : k).trim()];
      if (key) raw[key] = String(v == null ? '' : v).trim();
    });

    let win = CE.parseRange(raw.orderWindow);
    if (!win) {
      if (raw.orderWindow) console.warn('[CRITIEAT] 訂餐時段格式錯誤，改用預設值 ' + DEFAULTS.orderWindow);
      win = CE.parseRange(DEFAULTS.orderWindow);
    }
    let pickup = CE.parseTime(raw.pickupTime);
    if (pickup === null) {
      if (raw.pickupTime) console.warn('[CRITIEAT] 取餐時間格式錯誤，改用預設值 ' + DEFAULTS.pickupTime);
      pickup = CE.parseTime(DEFAULTS.pickupTime);
    }
    const lat = toNum(raw.companyLat);
    const lng = toNum(raw.companyLng);

    return {
      companyName: raw.companyName || DEFAULTS.companyName,
      company: lat !== null && lng !== null ? { lat, lng } : null,
      orderStart: win.start,
      orderEnd: win.end,
      pickup,
    };
  };

  // Store[] → StoreView[]（加上 status, closesAt, todayHours, distance），並排序：
  // 狀態（有開 → 提早打烊 → 不確定 → 沒開）→ 距離（近到遠，無距離排後）→ 店名
  CE.buildViewModel = function buildViewModel(stores, settings, dayKey) {
    return stores
      .map(s => {
        const st = CE.lunchStatus(s.hours[dayKey], settings);
        return Object.assign({}, s, {
          status: st.status,
          closesAt: st.closesAt,
          todayHours: s.hours[dayKey],
          distance: CE.distanceMeters(settings.company, s),
        });
      })
      .sort((a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        (a.distance ?? Infinity) - (b.distance ?? Infinity) ||
        a.name.localeCompare(b.name, 'zh-Hant')
      );
  };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 4: 建立 `proto/v1/js/data.js`**

假資料刻意涵蓋所有狀態與異常列。以週四為例的預期結果：R001 有開、R002 提早打烊（13:30）、R003 不確定（空白）、R004 沒開（週四公休）、R005 沒開（只開晚上）、R006 沒開（13:00 就打烊）、R007 有開（不標準寫法）、R008 不確定（看不懂）、R009 不顯示（顯示＝否）、R010 有開但沒座標、R011 略過（缺店名）、第二個 R001 略過（ID 重複）、R012 有開（含逗號、引號、HTML 字元、`javascript:` 連結、多行備註）。

```js
(function (CE) {
  'use strict';
  // 原型用假資料：格式與 Google Sheet 發布的 CSV 完全相同（中文表頭）。
  // 刻意包含異常列（缺店名、重複 ID、看不懂的營業時間、沒座標、HTML 字元、javascript: 連結），用來檢查容錯。
  CE.DEMO_STORES_CSV = `ID,店名,分類,區域,地址,緯度,經度,電話,週一,週二,週三,週四,週五,週六,週日,Google Maps 連結,foodpanda,Uber Eats,你訂,備註,顯示
R001,XX 拉麵,麵,公司旁,台北市中正區忠孝西路一段 50 號,25.0490,121.5195,02-2311-0001,公休,"11:00-14:30, 17:00-20:30","11:00-14:30, 17:00-20:30","11:00-14:30, 17:00-20:30","11:00-14:30, 17:00-20:30",11:00-14:30,公休,https://www.google.com/maps/search/?api=1&query=XX+拉麵,https://www.foodpanda.com.tw/,https://www.ubereats.com/tw,,中午人多，建議 12:50 前訂,是
R002,阿婆便當,便當,公司旁,台北市中正區館前路 10 號,25.0465,121.5160,02-2311-0002,10:30-13:30,10:30-13:30,10:30-13:30,10:30-13:30,10:30-13:30,公休,公休,https://www.google.com/maps/search/?api=1&query=阿婆便當,,,https://order.nidin.shop/,可以先打電話訂,是
R003,好吃滷肉飯,飯,,台北市中正區懷寧街 20 號,25.0455,121.5135,,,,,,,,,,,,,營業時間還沒查,是
R004,OO 義大利麵,異國,站前,台北市中正區許昌街 30 號,25.0470,121.5185,02-2311-0004,11:30-14:00,11:30-14:00,11:30-14:00,公休,11:30-14:00,11:30-15:00,11:30-15:00,https://www.google.com/maps/search/?api=1&query=OO+義大利麵,https://www.foodpanda.com.tw/,,,,是
R005,夜貓燒烤,小吃,,台北市大同區華陰街 40 號,25.0500,121.5155,,18:00-02:00,18:00-02:00,18:00-02:00,18:00-02:00,18:00-02:00,18:00-02:00,18:00-02:00,,,,,只開晚上,是
R006,早安輕食,輕食,,台北市中正區公園路 15 號,25.0445,121.5165,,07:00-13:00,07:00-13:00,07:00-13:00,07:00-13:00,07:00-13:00,07:00-13:00,公休,,,,,,是
R007,巷口麵線,小吃,,台北市中正區開封街一段 5 號,25.0460,121.5145,,11：00～14：00,11：00～14：00,11：00～14：00,11：00～14：00,11：00～14：00,11：00～14：00,11：00～14：00,,,,,營業時間寫法不標準，但可以辨識,是
R008,越南河粉,異國,,台北市中正區漢口街一段 8 號,25.0458,121.5125,,11點到2點,11點到2點,11點到2點,11點到2點,11點到2點,11點到2點,11點到2點,,,,,營業時間格式看不懂 → 不確定,是
R009,已收掉的店,其他,,台北市中正區某路 1 號,25.0480,121.5150,,11:00-14:00,11:00-14:00,11:00-14:00,11:00-14:00,11:00-14:00,11:00-14:00,11:00-14:00,,,,,,否
R010,新開的咖哩,異國,,台北市中正區青島西路 3 號,,,02-2311-0010,11:00-20:00,11:00-20:00,11:00-20:00,11:00-20:00,11:00-20:00,11:00-20:00,11:00-20:00,,,,,地址待確認，還沒有座標,是
R011,,麵,,台北市中正區某路 2 號,25.0481,121.5151,,11:00-14:00,11:00-14:00,11:00-14:00,11:00-14:00,11:00-14:00,11:00-14:00,11:00-14:00,,,,,缺店名 → 應被略過,是
R001,重複 ID 的店,麵,,台北市中正區某路 3 號,25.0482,121.5152,,11:00-14:00,11:00-14:00,11:00-14:00,11:00-14:00,11:00-14:00,11:00-14:00,11:00-14:00,,,,,ID 重複 → 應被略過,是
R012,"Tom's ""漢堡"" <店>",異國,,"台北市中正區重慶南路一段 1 號, 2樓",25.0475,121.5130,,11:00-15:00,11:00-15:00,11:00-15:00,11:00-15:00,11:00-15:00,11:00-15:00,11:00-15:00,,javascript:alert(1),,,"第一行備註
第二行備註",是
`;

  CE.DEMO_SETTINGS_CSV = `名稱,值
公司名稱,CRITICAL（示意位置）
公司緯度,25.0478
公司經度,121.5170
訂餐時段,13:00-13:30
取餐時間,14:00
`;
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 5: 執行驗證，確認通過**

Run: `node $SCRATCH/check-logic.js proto/v1/js t2`
Expected: 輸出 `T2 OK`

- [ ] **Step 6: 版控**

不需要（見 Global Constraints）。

---

### Task 3: 頁面、樣式、清單／詳情／地圖模組

**Files:**
- Create: `proto/v1/index.html`
- Create: `proto/v1/css/style.css`
- Create: `proto/v1/js/config.js`
- Create: `proto/v1/js/map.js`
- Create: `proto/v1/js/app.js`

**Interfaces:**
- Consumes: Task 1、2 的所有 `CE.*` 函式與 `CE.DEMO_*_CSV`
- Produces:
  - `CE.CONFIG = { googleMapsKey: string }`
  - `CE.mapReady: boolean`
  - `CE.loadMap(key: string, el: HTMLElement, onPick: (id: string) => void): Promise<boolean>`
  - `CE.renderMarkers(views: StoreView[], settings: Settings): void`
  - `CE.selectMarker(view: StoreView | null): void`
  - 網址參數 `?day=mon|tue|wed|thu|fri|sat|sun`：模擬某一天（導覽列顯示「（模擬）」）

- [ ] **Step 1: 建立 `proto/v1/index.html`**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CRITIEAT 美食地圖</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Noto+Sans+TC:wght@400;500;700;900&family=JetBrains+Mono:wght@400;700&display=swap">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div class="blob blob--cyan" aria-hidden="true"></div>
  <div class="blob blob--purple" aria-hidden="true"></div>

  <div class="app">
    <header class="hdr">
      <img class="logo" src="img/logo.png" alt="CRITIEAT" width="158" height="28">
      <nav class="nav">
        <a class="is-active" href="#">美食地圖</a>
        <a class="is-soon" title="即將推出">開團單</a>
        <a class="is-soon" title="即將推出">公車地圖</a>
      </nav>
      <div class="hdr__right">
        <span id="today-label" class="today mono"></span>
        <label class="pill mono"><input type="checkbox" id="hide-closed"> 隱藏沒開的店</label>
      </div>
    </header>

    <main class="main">
      <section class="list" id="store-list" aria-label="店家清單"></section>
      <div class="map-wrap"><div class="map" id="map"></div></div>
      <aside class="detail" id="detail" aria-label="店家詳情" hidden></aside>
    </main>
  </div>

  <script src="js/config.js"></script>
  <script src="js/csv.js"></script>
  <script src="js/hours.js"></script>
  <script src="js/geo.js"></script>
  <script src="js/stores.js"></script>
  <script src="js/data.js"></script>
  <script src="js/map.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 建立 `proto/v1/css/style.css`**

```css
/* CRITIEAT — 風格 A（Critical 官網風），樣本：docs/design/style-a-critical.html */
:root {
  --ink: #111827;
  --muted: #6b7280;
  --faint: #9ca3af;
  --line: #e5e7eb;
  --bg: #fff;
  --panel: rgba(255, 255, 255, .75);
  --cyan: #00f0ff;
  --cyan-ink: #0891b2;
  --purple: #bc13fe;
  --purple-ink: #9d0fd6;
  --yellow-bg: #fef9c3;
  --yellow-ink: #a16207;
  --gray-bg: #f3f4f6;
  --mono: "JetBrains Mono", ui-monospace, monospace;
}

* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  font-family: Inter, "Noto Sans TC", sans-serif;
  color: var(--ink);
  background: var(--bg);
  overflow: hidden;
}
.mono { font-family: var(--mono); }

/* 背景模糊色塊 */
.blob { position: fixed; border-radius: 50%; filter: blur(80px); opacity: .45; z-index: 0; pointer-events: none; }
.blob--cyan { width: 520px; height: 520px; background: #a5f3fc; top: -180px; left: -160px; }
.blob--purple { width: 560px; height: 560px; background: #e9d5ff; bottom: -220px; right: -140px; }

.app { position: relative; z-index: 1; height: 100vh; display: flex; flex-direction: column; }

/* 導覽列 */
.hdr {
  height: 64px; flex: none; display: flex; align-items: center; gap: 36px; padding: 0 28px;
  border-bottom: 1px solid var(--line); background: rgba(255, 255, 255, .6); backdrop-filter: blur(8px);
}
.logo { display: block; height: 28px; width: auto; flex: none; }
.nav { display: flex; gap: 26px; font-size: 14px; font-weight: 600; }
.nav a { color: var(--muted); text-decoration: none; }
.nav a.is-active { color: var(--ink); border-bottom: 2px solid var(--cyan); padding-bottom: 4px; }
.nav a.is-soon { opacity: .35; cursor: not-allowed; }
.hdr__right { margin-left: auto; display: flex; align-items: center; gap: 14px; font-size: 13px; }
.today { color: var(--muted); }
.pill {
  display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); border-radius: 999px;
  padding: 6px 14px; background: rgba(255, 255, 255, .7); color: #4b5563; cursor: pointer; user-select: none;
}

/* 三欄 */
.main { flex: 1; min-height: 0; display: flex; }

.list { width: 340px; flex: none; padding: 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.list__head { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); }
.item {
  display: block; width: 100%; text-align: left; font: inherit; color: inherit; cursor: pointer;
  padding: 14px 16px; line-height: 1.45; background: var(--panel); backdrop-filter: blur(6px);
  border: 1px solid var(--line); border-radius: 12px; transition: box-shadow .15s, border-color .15s;
}
.item:hover { border-color: #a5f3fc; }
.item.is-selected { border-color: var(--cyan); box-shadow: 0 0 18px 2px rgba(0, 240, 255, .3); }
.item.is-closed { opacity: .45; }
.item__num { font-family: var(--mono); font-size: 11px; color: var(--faint); }
.item__name { display: block; font-size: 16px; font-weight: 700; }
.item__meta { display: block; font-size: 12.5px; color: var(--muted); }
.item__warn { display: block; font-size: 11.5px; color: var(--faint); margin-top: 4px; }
.empty { font-size: 13px; color: var(--muted); text-align: center; padding: 32px 0; }

.badge { display: inline-block; font-size: 11.5px; font-weight: 700; padding: 3px 10px; border-radius: 999px; margin-top: 6px; }
.badge--open { background: rgba(0, 240, 255, .15); color: var(--cyan-ink); }
.badge--early { background: rgba(188, 19, 254, .12); color: var(--purple-ink); }
.badge--unknown { background: var(--yellow-bg); color: var(--yellow-ink); }
.badge--closed { background: var(--gray-bg); color: var(--faint); }

.map-wrap { flex: 1; min-width: 0; padding: 18px 18px 18px 0; }
.map { width: 100%; height: 100%; border-radius: 16px; border: 1px solid var(--line); background: var(--gray-bg); overflow: hidden; }
.map--failed { display: flex; align-items: center; justify-content: center; }
.map-fallback { text-align: center; color: var(--muted); font-size: 15px; line-height: 1.8; }
.map-pin-label {
  font-family: Inter, "Noto Sans TC", sans-serif !important; white-space: nowrap;
  text-shadow: 0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff, 0 0 4px #fff;
}

.detail {
  width: 340px; flex: none; margin: 18px 18px 18px 0; padding: 22px; position: relative;
  background: var(--panel); backdrop-filter: blur(8px); border: 1px solid var(--line); border-radius: 16px;
  overflow-y: auto; display: flex; flex-direction: column; gap: 12px;
}
.detail[hidden] { display: none; }
.detail__close { position: absolute; top: 12px; right: 14px; border: 0; background: none; cursor: pointer; color: var(--faint); font-size: 22px; line-height: 1; }
.detail__kicker { font-family: var(--mono); font-size: 11px; color: var(--faint); }
.detail__name { margin: 0; font-size: 22px; padding-right: 24px; }
.detail .badge { align-self: flex-start; margin: 0; }
.detail__rows { margin: 0; display: flex; flex-direction: column; gap: 6px; }
.detail__row { display: flex; gap: 8px; font-size: 13px; }
.detail__row dt { width: 44px; flex: none; color: var(--faint); }
.detail__row dd { margin: 0; }
.detail__row a { color: var(--cyan-ink); }
.week { font-family: var(--mono); font-size: 12.5px; border-collapse: collapse; width: 100%; }
.week td { padding: 3px 0; vertical-align: top; color: var(--muted); }
.week td:first-child { width: 44px; color: var(--faint); }
.week tr.is-today td { font-weight: 800; color: var(--ink); }
.detail__note { margin: 0; font-size: 13px; white-space: pre-line; background: var(--gray-bg); border-radius: 10px; padding: 10px 12px; }
.btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto; }
.btn {
  font-size: 12.5px; font-weight: 700; padding: 8px 14px; border-radius: 999px;
  border: 1px solid var(--line); background: #fff; color: var(--ink); text-decoration: none;
}
.btn--primary { background: var(--ink); color: #fff; border-color: var(--ink); }

/* 手機：地圖在上、清單在下、詳情為底部抽屜 */
@media (max-width: 900px) {
  body { overflow: auto; }
  .app { height: auto; min-height: 100vh; }
  .hdr { height: auto; min-height: 56px; flex-wrap: wrap; gap: 8px 16px; padding: 8px 16px; }
  .nav { display: none; }
  .hdr__right { margin-left: 0; flex-wrap: wrap; }
  .main { flex-direction: column; }
  .map-wrap { order: 1; flex: none; height: 45vh; padding: 12px 16px 0; }
  .list { order: 2; width: auto; overflow: visible; padding: 12px 16px; }
  .detail {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; margin: 0; width: auto; max-height: 70vh;
    border-radius: 16px 16px 0 0; background: rgba(255, 255, 255, .97);
  }
}
```

- [ ] **Step 3: 建立 `proto/v1/js/config.js`**

```js
(function (CE) {
  'use strict';
  // 填入團隊的 Google Maps JavaScript API Key。留空時地圖區會顯示「地圖暫時無法使用」，清單照常運作。
  // Key 若有設定 HTTP 參照網址限制，需加入 http://localhost:8000/* 才能在本機預覽。
  CE.CONFIG = {
    googleMapsKey: '',
  };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 4: 建立 `proto/v1/js/map.js`**

```js
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
        '&callback=__ceMapInit&language=zh-TW&region=TW';
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
```

- [ ] **Step 5: 建立 `proto/v1/js/app.js`**

```js
(function (CE) {
  'use strict';

  const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_LABEL = { mon: '一', tue: '二', wed: '三', thu: '四', fri: '五', sat: '六', sun: '日' };
  const LINKS = [
    ['googleMaps', 'Google Maps 導航', true],
    ['foodpanda', 'foodpanda', false],
    ['ubereats', 'Uber Eats', false],
    ['nidin', '你訂', false],
  ];

  const state = {
    all: [],
    settings: null,
    dayKey: '',
    dayOverridden: false,
    hideClosed: false,
    selectedId: null,
  };

  // 所有使用者資料一律用 textContent 寫入，不用 innerHTML
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function visible() {
    return state.hideClosed ? state.all.filter(v => v.status !== 'closed') : state.all;
  }

  function findView(id) {
    return state.all.find(v => v.id === id) || null;
  }

  function statusLabel(v) {
    switch (v.status) {
      case 'open': return '● 午餐有開';
      case 'early': return `${v.closesAt} 打烊，要早點訂`;
      case 'unknown': return '? 不確定';
      default: return CE.parseHours(v.todayHours).type === 'closed' ? '今日公休' : '午餐沒開';
    }
  }

  function renderHeader() {
    const s = state.settings;
    const sim = state.dayOverridden ? '（模擬）' : '';
    document.getElementById('today-label').textContent =
      `週${DAY_LABEL[state.dayKey]}${sim} · 訂餐 ${CE.formatMin(s.orderStart)}–${CE.formatMin(s.orderEnd)} · 取餐 ${CE.formatMin(s.pickup)}`;
  }

  function renderList() {
    const box = document.getElementById('store-list');
    box.replaceChildren();
    const list = visible();

    const head = el('div', 'list__head mono');
    head.append(el('span', null, `STORES / ${list.length}`), el('span', null, state.settings.company ? '依距離' : '依店名'));
    box.append(head);

    if (state.all.length === 0) { box.append(el('p', 'empty', '還沒有店家資料')); return; }
    if (list.length === 0) { box.append(el('p', 'empty', '今天午餐時段沒有營業的店')); return; }

    list.forEach((v, i) => {
      const item = el('button', 'item');
      item.type = 'button';
      item.dataset.id = v.id;
      if (v.status === 'closed') item.classList.add('is-closed');
      if (v.id === state.selectedId) item.classList.add('is-selected');
      const meta = [v.category, CE.formatDistance(v.distance), v.todayHours || '營業時間未填']
        .filter(Boolean).join(' · ');
      item.append(
        el('span', 'item__num', String(i + 1).padStart(2, '0')),
        el('span', 'item__name', v.name),
        el('span', 'item__meta', meta),
        el('span', `badge badge--${v.status}`, statusLabel(v))
      );
      if (v.lat == null) item.append(el('span', 'item__warn', '地圖位置未設定'));
      item.addEventListener('click', () => select(v.id, 'list'));
      box.append(item);
    });
  }

  function addRow(dl, label, value) {
    const row = el('div', 'detail__row');
    const dd = el('dd');
    if (typeof value === 'string') dd.textContent = value;
    else dd.append(value);
    row.append(el('dt', null, label), dd);
    dl.append(row);
  }

  function renderDetail() {
    const box = document.getElementById('detail');
    const v = findView(state.selectedId);
    box.replaceChildren();
    if (!v) { box.hidden = true; return; }
    box.hidden = false;

    const close = el('button', 'detail__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '關閉');
    close.addEventListener('click', () => select(null));

    const rows = el('dl', 'detail__rows');
    addRow(rows, '地址', v.address || '—');
    if (v.phone) {
      const a = el('a', null, v.phone);
      a.href = 'tel:' + v.phone.replace(/[^\d+]/g, '');
      addRow(rows, '電話', a);
    }
    if (v.area) addRow(rows, '區域', v.area);

    const week = el('table', 'week');
    WEEK.forEach(d => {
      const tr = el('tr', d === state.dayKey ? 'is-today' : null);
      tr.append(el('td', null, DAY_LABEL[d]), el('td', null, v.hours[d] || '—'));
      week.append(tr);
    });

    box.append(
      close,
      el('span', 'detail__kicker', v.category),
      el('h3', 'detail__name', v.name),
      el('span', `badge badge--${v.status}`, `${statusLabel(v)} · 今天 ${v.todayHours || '營業時間未填'}`),
      rows,
      week
    );
    if (v.note) box.append(el('p', 'detail__note', v.note));

    const btns = el('div', 'btns');
    LINKS.forEach(([key, label, primary]) => {
      if (!v.links[key]) return;
      const a = el('a', primary ? 'btn btn--primary' : 'btn', label);
      a.href = v.links[key];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      btns.append(a);
    });
    if (btns.children.length) box.append(btns);
  }

  function select(id, source) {
    state.selectedId = id;
    renderList();
    renderDetail();
    CE.selectMarker(findView(id));
    if (id && source === 'map') {
      const item = document.querySelector(`.item[data-id="${CSS.escape(id)}"]`);
      if (item) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function onToggleHideClosed(e) {
    state.hideClosed = e.target.checked;
    const sel = findView(state.selectedId);
    if (sel && state.hideClosed && sel.status === 'closed') state.selectedId = null;
    renderList();
    renderDetail();
    CE.renderMarkers(visible(), state.settings);
    CE.selectMarker(findView(state.selectedId));
  }

  async function init() {
    const params = new URLSearchParams(location.search);
    const override = params.get('day');
    state.dayKey = CE.todayKey(new Date(), override);
    state.dayOverridden = state.dayKey === override;
    state.settings = CE.rowsToSettings(CE.parseCsv(CE.DEMO_SETTINGS_CSV));
    state.all = CE.buildViewModel(
      CE.rowsToStores(CE.parseCsv(CE.DEMO_STORES_CSV)), state.settings, state.dayKey
    );

    document.getElementById('hide-closed').addEventListener('change', onToggleHideClosed);
    renderHeader();
    renderList();
    renderDetail();

    await CE.loadMap(CE.CONFIG.googleMapsKey, document.getElementById('map'), id => select(id, 'map'));
    CE.renderMarkers(visible(), state.settings);
  }

  document.addEventListener('DOMContentLoaded', init);
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 6: 語法檢查**

Run: `for f in proto/v1/js/*.js; do node --check "$f" || echo "FAIL $f"; done`
Expected: 沒有任何輸出

- [ ] **Step 7: 啟動本機伺服器**

Run（背景執行）: `python3 -m http.server 8000 --bind 127.0.0.1 --directory proto/v1`

- [ ] **Step 8: 瀏覽器檢查（桌機 1440×900，`http://localhost:8000/?day=thu`）**

逐項確認，任何一項不符就修正後重新檢查：

- 導覽列：CRITIEAT 圖片 logo（叉子取代 I）、「美食地圖」底線為青色、「開團單」「公車地圖」為淡灰；右側顯示「週四（模擬） · 訂餐 13:00–13:30 · 取餐 14:00」
- 清單標題 `STORES / 10`、右側「依距離」
- 清單順序：先是 4 家「● 午餐有開」（有距離者由近到遠：XX 拉麵 290m、巷口麵線 320m、Tom's… 400m，最後是沒距離的新開的咖哩），接著阿婆便當「13:30 打烊，要早點訂」（紫色），再來兩家「? 不確定」（黃色），最後三家灰色半透明（OO 義大利麵「今日公休」、早安輕食與夜貓燒烤「午餐沒開」）
- `Tom's "漢堡" <店>` 店名以純文字顯示（看得到 `<店>` 字樣）
- 新開的咖哩下方有「地圖位置未設定」
- 地圖區（沒填 Key）：顯示「地圖暫時無法使用／清單與店家資訊仍可正常使用」，地圖右側與視窗之間有留白
- 點「XX 拉麵」：卡片變青色外框；右側出現詳情，包含分類、店名、狀態「● 午餐有開 · 今天 11:00-14:30, 17:00-20:30」、地址、可點的電話、區域、一週營業時間（「四」那列加粗）、備註、按鈕「Google Maps 導航」（黑底）「foodpanda」「Uber Eats」
- 點 `Tom's "漢堡" <店>`：詳情沒有 foodpanda 按鈕（`javascript:` 連結被擋），備註顯示兩行，地址完整顯示「…1 號, 2樓」
- 點詳情右上角 ×：詳情關閉、卡片取消選取
- 勾選「隱藏沒開的店」：清單變 `STORES / 7`，三家灰色店消失；若當時選取的是灰色店，詳情一併關閉
- 開瀏覽器開發者工具 console：看得到兩則 `[CRITIEAT]` 警告（第 12 列缺少 ID 或店名、第 13 列 ID「R001」重複），沒有其他錯誤

- [ ] **Step 9: 瀏覽器檢查：其他日子與極端情況**

- `?day=mon`：XX 拉麵變灰（今日公休），OO 義大利麵變「● 午餐有開」
- `?day=sun`：阿婆便當與早安輕食都顯示「今日公休」
- `?day=xyz`：導覽列顯示今天實際的星期，沒有「（模擬）」
- 空資料：暫時把 `data.js` 的 `DEMO_STORES_CSV` 內容改成只剩表頭那一列，重新整理 → 清單顯示「還沒有店家資料」、`STORES / 0`，頁面沒有錯誤
- 全部都沒開：暫時把 `DEMO_STORES_CSV` 改成只剩表頭與 R006（早安輕食）那一列，打開 `?day=thu` 並勾選「隱藏沒開的店」→ 清單顯示「今天午餐時段沒有營業的店」
- 以上兩項確認後，把 `data.js` 復原成 Task 2 Step 4 的內容
- 暫時把 `data.js` 設定中的「公司緯度」那一列刪掉並重新整理：清單標題右側顯示「依店名」、清單不顯示距離、頁面沒有錯誤；確認後復原

- [ ] **Step 10: 瀏覽器檢查：手機寬度（390×844）**

- 導覽選單隱藏，logo、日期、開關換行排列，沒有水平捲軸
- 地圖區在上（約 45% 高）、清單在下，整頁可以捲動
- 點任一家店：詳情從底部以抽屜形式出現，可以捲動、可以按 × 關閉

- [ ] **Step 11: 版控**

不需要（見 Global Constraints）。

---

### Task 4: 接上真的 Google 地圖

需要團隊的 Google Maps API Key，由使用者提供。

**Files:**
- Modify: `proto/v1/js/config.js`（填入 `googleMapsKey`）

**Interfaces:**
- Consumes: Task 3 的 `CE.loadMap`、`CE.renderMarkers`、`CE.selectMarker`
- Produces: 無新介面

- [ ] **Step 1: 確認 Key 的限制設定**

請使用者到 Google Cloud Console → API 和服務 → 憑證，確認這把 Key：已啟用 **Maps JavaScript API**；若有「HTTP 參照網址」限制，加入 `http://localhost:8000/*`。

- [ ] **Step 2: 填入 Key**

把 `proto/v1/js/config.js` 的 `googleMapsKey: ''` 改成 `googleMapsKey: '<使用者提供的 Key>'`。

- [ ] **Step 3: 瀏覽器檢查（`http://localhost:8000/?day=thu`）**

- 地圖顯示台北車站附近，沒有任何商家、景點、大眾運輸圖標
- 公司位置為黑色圓角方塊；店家為圓點：青（有開）、紫（阿婆便當）、黃（不確定）、灰（沒開）；新開的咖哩不在地圖上
- 初次載入時地圖自動縮放到看得見公司與所有店
- 點地圖上 XX 拉麵的圓點：圓點放大、出現店名標籤、清單捲到 XX 拉麵並選取、右側出現詳情
- 點清單的阿婆便當：地圖移到該店、圓點放大並顯示店名，前一家的圓點恢復原大小
- 勾選「隱藏沒開的店」：灰色圓點消失；取消勾選：灰色圓點出現，地圖不會重新縮放
- console 沒有錯誤

- [ ] **Step 4: 檢查 Key 錯誤時的替代畫面**

暫時把 Key 改成 `invalid-key` 並重新整理：地圖區改為「地圖暫時無法使用」，清單與詳情照常運作。確認後改回正確的 Key。

- [ ] **Step 5: 版控**

不需要（見 Global Constraints）。提醒使用者：原型資料夾含 Key，分享原型檔案時要留意；正式版會改用環境變數。

---

### Task 5: Google Sheet 範本與 Apps Script

**Files:**
- Create: `docs/sheet/README.md`
- Create: `docs/sheet/stores-template.csv`
- Create: `docs/sheet/settings-template.csv`
- Create: `docs/sheet/Code.gs`

**Interfaces:**
- Consumes: Task 2 的 `CE.parseCsv`、`CE.rowsToStores`、`CE.rowsToSettings`（用來確認範本格式能被解析）
- Produces: 試算表的表頭與設定鍵名，與 `stores.js` 的 `HEADER_MAP`、`SETTING_MAP` 完全一致；兩個發布後的 CSV 網址（由使用者填入 README）

- [ ] **Step 1: 建立 `docs/sheet/stores-template.csv`**

```csv
ID,店名,分類,區域,地址,緯度,經度,電話,週一,週二,週三,週四,週五,週六,週日,Google Maps 連結,foodpanda,Uber Eats,你訂,備註,顯示
R001,範例：XX 拉麵,麵,公司旁,台北市中正區忠孝西路一段 50 號,,,02-2311-0001,公休,"11:00-14:30, 17:00-20:30","11:00-14:30, 17:00-20:30","11:00-14:30, 17:00-20:30","11:00-14:30, 17:00-20:30",11:00-14:30,公休,,,,,範例資料，請改成真實店家,是
R002,範例：阿婆便當,便當,公司旁,台北市中正區館前路 10 號,,,02-2311-0002,10:30-13:30,10:30-13:30,10:30-13:30,10:30-13:30,10:30-13:30,公休,公休,,,,,範例資料，請改成真實店家,是
```

- [ ] **Step 2: 建立 `docs/sheet/settings-template.csv`**

```csv
名稱,值
公司名稱,CRITICAL
公司緯度,
公司經度,
訂餐時段,13:00-13:30
取餐時間,14:00
```

- [ ] **Step 3: 確認範本能被原型的解析邏輯讀取**

Run（在 `critieat/` 目錄下）：

```bash
node -e "
const vm=require('vm'),fs=require('fs');
['csv.js','hours.js','geo.js','stores.js'].forEach(f=>vm.runInThisContext(fs.readFileSync('proto/v1/js/'+f,'utf8')));
const s=CE.rowsToStores(CE.parseCsv(fs.readFileSync('docs/sheet/stores-template.csv','utf8')));
console.log(s.length, s[0].hours.tue, s[0].lat);
console.log(JSON.stringify(CE.rowsToSettings(CE.parseCsv(fs.readFileSync('docs/sheet/settings-template.csv','utf8')))));"
```

Expected:
```
2 11:00-14:30, 17:00-20:30 null
{"companyName":"CRITICAL","company":null,"orderStart":780,"orderEnd":810,"pickup":840}
```

- [ ] **Step 4: 建立 `docs/sheet/Code.gs`**

```js
/**
 * CRITIEAT — 店家試算表的 Apps Script
 * 地址新增或修改時，自動用 Apps Script 內建的地址轉座標服務填入「緯度」「經度」。
 * 安裝方式見 docs/sheet/README.md。
 */

const SHEET_STORES = '店家';
const COL_ADDRESS = '地址';
const COL_LAT = '緯度';
const COL_LNG = '經度';
const NOT_FOUND = '找不到地址';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CRITIEAT')
    .addItem('補上缺少的座標', 'fillMissingCoords')
    .addItem('重新計算選取列的座標', 'recalcSelectedRows')
    .addToUi();
}

// 執行一次：建立「編輯時」觸發器（可重複執行，不會重複建立）
function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onAddressEdit')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onAddressEdit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
}

function onAddressEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_STORES) return;
  const idx = headerIndex_(sheet);
  const col = idx[COL_ADDRESS];
  if (!col || e.range.getColumn() > col || e.range.getLastColumn() < col) return;
  const multi = e.range.getNumRows() > 1;
  for (let r = Math.max(2, e.range.getRow()); r <= e.range.getLastRow(); r++) {
    geocodeRow_(sheet, r, idx);
    if (multi) Utilities.sleep(200);
  }
}

function fillMissingCoords() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_STORES);
  const idx = headerIndex_(sheet);
  const last = sheet.getLastRow();
  let filled = 0;
  for (let r = 2; r <= last; r++) {
    const address = String(sheet.getRange(r, idx[COL_ADDRESS]).getValue()).trim();
    const lat = String(sheet.getRange(r, idx[COL_LAT]).getValue()).trim();
    const lng = String(sheet.getRange(r, idx[COL_LNG]).getValue()).trim();
    if (address && (lat === '' || lng === '' || lat === NOT_FOUND)) {
      geocodeRow_(sheet, r, idx);
      filled++;
      Utilities.sleep(200);
    }
  }
  SpreadsheetApp.getActive().toast(`已處理 ${filled} 列`, 'CRITIEAT');
}

function recalcSelectedRows() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SHEET_STORES) {
    SpreadsheetApp.getUi().alert('請在「店家」工作表選取要重新計算的列');
    return;
  }
  const idx = headerIndex_(sheet);
  const range = sheet.getActiveRange();
  for (let r = Math.max(2, range.getRow()); r <= range.getLastRow(); r++) {
    geocodeRow_(sheet, r, idx);
    Utilities.sleep(200);
  }
}

function headerIndex_(sheet) {
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = {};
  header.forEach((h, i) => { idx[String(h).trim()] = i + 1; });
  [COL_ADDRESS, COL_LAT, COL_LNG].forEach(name => {
    if (!idx[name]) throw new Error(`找不到「${name}」欄位，請確認表頭`);
  });
  return idx;
}

function geocodeRow_(sheet, row, idx) {
  const address = String(sheet.getRange(row, idx[COL_ADDRESS]).getValue()).trim();
  const latCell = sheet.getRange(row, idx[COL_LAT]);
  const lngCell = sheet.getRange(row, idx[COL_LNG]);
  if (!address) {
    latCell.clearContent();
    lngCell.clearContent();
    return;
  }
  // 任何錯誤（例如呼叫次數過多）都不讓舊座標留著，改標示找不到，避免整批中斷
  try {
    const res = Maps.newGeocoder().setRegion('tw').setLanguage('zh-TW').geocode(address);
    if (res.status === 'OK' && res.results.length) {
      const loc = res.results[0].geometry.location;
      latCell.setValue(loc.lat);
      lngCell.setValue(loc.lng);
      return;
    }
  } catch (err) {
    console.error(`第 ${row} 列轉座標失敗：${err}`);
  }
  latCell.setValue(NOT_FOUND);
  lngCell.clearContent();
}
```

- [ ] **Step 5: 語法檢查 Apps Script**

Run: `cp docs/sheet/Code.gs $SCRATCH/_gs.js && node --check $SCRATCH/_gs.js && echo GS-OK`
Expected: `GS-OK`

- [ ] **Step 6: 建立 `docs/sheet/README.md`**

````markdown
# CRITIEAT 店家試算表設定說明

第一階段的店家資料放在 Google Sheet，網頁讀取「發布到網路」的 CSV。本文件說明如何建立試算表。

## 1. 建立試算表

1. 在 Google 雲端硬碟新增一份試算表，命名為「CRITIEAT 店家資料」
2. 把第一個工作表改名為 **店家**，匯入 `stores-template.csv`（檔案 → 匯入 → 上傳 → 「取代目前的工作表」）
3. 新增工作表 **設定**，匯入 `settings-template.csv`（「取代目前的工作表」）
4. 在「設定」工作表把公司名稱、公司緯度、公司經度改成實際值（可在 Google Maps 對公司按右鍵，複製座標）

> 表頭文字必須與範本完全一致，網頁靠表頭辨識欄位。欄位順序可以調整。
>
> **匯入時把「將文字轉換為數字、日期和公式」取消勾選**，並把「設定」工作表的 B 欄、「店家」工作表的電話欄設為「格式 → 數字 → 純文字」。否則 `14:00` 可能被轉成時間值、手機號碼開頭的 0 會不見。

## 2. 資料驗證

在「店家」工作表設定（資料 → 資料驗證）：

| 範圍 | 規則 | 不符時 |
|---|---|---|
| 分類欄（第 2 列以下） | 下拉式選單：飯、麵、便當、小吃、異國、輕食、其他 | 拒絕輸入 |
| 顯示欄（第 2 列以下） | 下拉式選單：是、否 | 拒絕輸入 |
| 週一～週日 7 欄（第 2 列以下） | 自訂公式（見下方） | 顯示警告 |

營業時間的自訂公式（以週一在 I 欄為例；套用範圍選 I2:O，公式寫 I2，Google 會自動對應每一格）：

```
=OR(I2="", TRIM(I2)="公休", REGEXMATCH(I2, "^\s*\d{1,2}[:：]\d{2}\s*[-~～–]\s*\d{1,2}[:：]\d{2}(\s*[,，]\s*\d{1,2}[:：]\d{2}\s*[-~～–]\s*\d{1,2}[:：]\d{2})*\s*$"))
```

## 3. 安裝 Apps Script（自動補座標）

1. 擴充功能 → Apps Script
2. 把預設的 `Code.gs` 內容全部換成本資料夾的 `Code.gs`，儲存
3. 上方函式選單選 `installTrigger` → 執行 → 依提示用自己的 Google 帳號授權
4. 回到試算表重新整理，選單列會出現「CRITIEAT」
5. 執行「CRITIEAT → 補上缺少的座標」，把範本中的店家座標補齊

之後在「地址」欄新增或修改地址，緯度、經度會自動填入；找不到時緯度欄會顯示「找不到地址」，網頁會把這家店標示為「地圖位置未設定」。

## 4. 發布 CSV

1. 檔案 → 共用 → 發布到網路
2. 連結 → 選「店家」工作表 → 格式選「逗號分隔值 (.csv)」→ 發布，複製網址
3. 重複一次，選「設定」工作表，複製網址
4. 把兩個網址記錄在下方，之後 critieat_web 會用到

| 工作表 | CSV 網址 |
|---|---|
| 店家 | （發布後填入） |
| 設定 | （發布後填入） |

> 發布後，知道網址的人都看得到內容；資料只有餐廳的公開資訊。Google 發布的 CSV 會延遲數分鐘才反映最新修改。

## 5. 填寫規則

- **ID**：每家店一個固定編號（R001、R002…），填了就不要改，也不要重複
- **營業時間**：`11:00-14:00`；多段用逗號 `11:00-14:00, 17:00-20:30`；整天休息寫 `公休`；不知道就留空
- **刪除店家**：不要刪列，把「顯示」改成「否」
- **緯度、經度**：不要手填，由 Apps Script 自動產生
````

- [ ] **Step 7: 使用者在 Google 端操作並回報**

這一步需要使用者的 Google 帳號，由使用者依 `docs/sheet/README.md` 第 1～4 節操作，完成後確認：

- 「CRITIEAT」選單出現；執行「補上缺少的座標」後，兩筆範例店家的緯度、經度被填入
- 把其中一筆地址改成 `這不是地址`：緯度欄顯示「找不到地址」；改回正確地址：座標重新出現
- 在週二欄輸入 `11點到2點`：出現資料驗證警告
- 「店家」與「設定」兩個 CSV 網址已發布，並填入 README 第 4 節的表格
- 用瀏覽器打開「店家」CSV 網址，內容第一列是中文表頭

- [ ] **Step 8: 版控**

不需要（見 Global Constraints）。

---

### Task 6: 原型審核關卡

**Files:** 無

- [ ] **Step 1: 請使用者審核原型**

請使用者（與午餐團）打開 `http://localhost:8000/`（已填 Key），依規格第 4 節檢查畫面與行為。收集回饋：

- 版面、資訊、狀態判斷是否符合實際午餐習慣
- 有沒有需要調整的欄位或文字

- [ ] **Step 2: 依回饋修正原型**

小修正直接改 `proto/v1/`，並重跑 Task 3 Step 8～10 的檢查；若回饋影響規格（例如欄位、狀態定義），先更新 `docs/specs/2026-10-08-critieat-phase1-food-map-design.md` 並請使用者確認。

- [ ] **Step 3: 停止，交接下一步**

原型核准後停止本計畫。下一步（不在本計畫範圍）：

1. 以 contract-first skill 初始化 `critieat/`（`CLAUDE.md`、`contracts/`），依原型撰寫 contracts 與驗收標準 → 使用者審核
2. 對照 critical_web 的實際結構，另寫「還原成 critieat_web」的計畫（接 Google Sheet CSV、CSV 讀取失敗時使用上次成功的資料等規格 4.6 項目）
3. 決定部署位置
