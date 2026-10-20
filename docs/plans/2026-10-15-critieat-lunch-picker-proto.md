# CRITIEAT 午餐轉盤原型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `proto/v1` 做出午餐轉盤：美食地圖與開團單都能打開同一個燈箱，三款（轉盤、彈珠台、競速）可切換，抽到後可直接拿去開團單。

**Architecture:** 沿用 `proto/v1` 的寫法：純靜態 HTML + 原生 JS，各檔掛在 `globalThis.CE`。純邏輯 `pick.js`（候選、排除、隨機挑、抽）與畫面分開；三款各一檔，實作同一個介面 `CE.pickers[mode] = { label, startText, limit(small), mount(box, stores, opts) → { start(), destroy(), unavailable? } }`；燈箱 `pick-lightbox.js` 只依賴這個介面，對外提供 `CE.openPicker(...)`。頁面（`app.js`、`lunch-app.js`）只負責傳候選與處理抽到後要做什麼。

**Tech Stack:** HTML5、CSS（接在 `css/style.css` 末段）、原生 JavaScript（ES2020）、`<dialog>`、canvas、matter.js 0.19.0（cdnjs，只有競速用）；檢查用 node 18 + headless Chrome（CDP）。

**Spec:** `docs/specs/2026-10-15-critieat-lunch-picker-design.md`

## Global Constraints

- 所有資料（店名、分類）一律以 `textContent` 寫入 DOM 或畫在 canvas 上，禁止用 `innerHTML`
- 日期以台灣時間（`Asia/Taipei`）`'YYYY-MM-DD'` 判斷；「最近 N 天」＝今天往前 1～N 個日曆天，今天不算
- 只算真的開過單的卡片（`status` 為 `ordering` 或 `closed`）；`proposed` 不算
- 今天確定公休（`status === 'closed'`）一律拿掉；`unknown` 保留
- 候選不到 2 家不能開始，提示文字：「候選不到 2 家，放寬篩選或把最近吃過的加回來」
- 數量上限：轉盤 12；彈珠台電腦 10、手機（≤900px）6；競速 30。超過時每輪隨機挑，提示「共 N 家候選，這輪隨機挑 M 家」
- 三款每家店中獎機率都相同（轉盤、彈珠台先抽結果；競速起跑位置隨機分配）
- 競速第一個過終點線的中獎；其他珠子繼續跑到全部抵達或 60 秒
- 款式記在 `localStorage` `critieat.picker.mode`，第一次預設 `race`；讀寫失敗不影響功能
- 設定「轉盤排除天數」預設 3，0 表示不排除
- matter.js 只從 `https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js` 載入
- `prefers-reduced-motion: reduce` 時不播動畫，直接出結果
- 不使用 `alert` / `confirm` / `prompt`
- **不得引入任何測試框架**（團隊鐵則）。邏輯以 scratchpad 的一次性 node 檢查腳本確認（不放進專案），畫面以 headless Chrome 確認
- **不做 git 操作**：`critieat/` 不受版控（使用者 2026-10-15 決定先不 `git init`）。每個 Task 結束改在進度紀錄 `.superpowers/sdd/2026-10-15-critieat-lunch-picker/progress.md` 記一行
- 原型不可依賴建置工具；以 `proto/v1` 為根目錄的靜態伺服器即可運作

## Review Focus

1. **轉到一半關掉燈箱、或切換分頁／勾選框** → 不會之後才跳出結果、不會報錯，動畫與物理引擎停掉。由 Task 2 的 `W6`、Task 4 的 `R4` 覆蓋
2. **候選很多（例如 23 家）** → 每輪只上 12／10／6／30 家並顯示提示，「再來一次」重新挑；板子不爆版。由 Task 2 的 `W5`、Task 3 的 `P3` 覆蓋
3. **從地圖按「用這家開單」但還沒選身分** → 先選身分，選完立刻打開「提議／開單」對話框並選好店家；重新整理不會再跳一次。由 Task 5 的 `L3`、`L4` 覆蓋
4. **網路擋掉 cdnjs（matter.js 沒載到）** → 競速分頁顯示「競速需要網路載入物理引擎，請改用其他款式」，另兩款照常。由 Task 4 的 `R5` 覆蓋
5. **手機 390px 寬開燈箱** → 燈箱全螢幕、三款板子都在畫面內、頁面沒有橫向捲動。由 Task 2 的 `W4`、Task 3 的 `P2`、Task 4 的 `R3` 覆蓋

---

## 檔案結構

| 檔案 | 動作 | 負責 |
|---|---|---|
| `proto/v1/js/pick.js` | 新增 | 純邏輯：`candidates`、`agoLabel`、`dayDiff`、`sample`、`shuffle`、`pickIndex`、`MIN` |
| `proto/v1/js/pick-wheel.js` | 新增 | 轉盤 `CE.pickers.wheel` |
| `proto/v1/js/pick-plinko.js` | 新增 | 彈珠台 `CE.pickers.plinko`；模擬 `CE.plinkoSim = { simulate, pathTo, pegsFor }` |
| `proto/v1/js/pick-race.js` | 新增 | 競速 `CE.pickers.race` |
| `proto/v1/js/pick-lightbox.js` | 新增 | 燈箱 `CE.openPicker` |
| `proto/v1/js/stores.js` | 修改 | 設定「轉盤排除天數」→ `settings.pickerDays` |
| `proto/v1/js/data.js` | 修改 | 示範設定加一列 |
| `docs/sheet/settings-template.csv` | 修改 | 試算表設定範本加一列 |
| `proto/v1/js/lunch-store.js` | 修改 | `peekCards()` |
| `proto/v1/index.html`、`proto/v1/js/app.js` | 修改 | 地圖入口 |
| `proto/v1/lunch.html`、`proto/v1/js/lunch-app.js` | 修改 | 開團單入口、`?new=&as=` |
| `proto/v1/css/style.css` | 修改 | 末段加「午餐轉盤」區塊 |

檢查工具（不屬於專案）：
- scratchpad：`check-pick.js`、`check-plinko.js`
- `.superpowers/sdd/2026-10-15-critieat-lunch-picker/drive-picker.js`（由 `drive-menu.js` 複製改寫）、`progress.md`、截圖

預覽：使用者自己的伺服器 `http://localhost:8000/`（以 `proto/v1` 為根）。檢查時另開 `python3 -m http.server 8010 --bind 127.0.0.1`（在 `proto/v1` 內）；8010 上 Google Maps 會出 `RefererNotAllowedMapError`，是預期的，不算錯誤。

---

### Task 1: 純邏輯、設定、`peekCards`

**Files:**
- Create: `proto/v1/js/pick.js`
- Modify: `proto/v1/js/stores.js`（`SETTING_MAP`、`DEFAULTS`、`rowsToSettings`）
- Modify: `proto/v1/js/data.js`（`DEMO_SETTINGS_CSV`）
- Modify: `docs/sheet/settings-template.csv`
- Modify: `proto/v1/js/lunch-store.js`
- Test: `<scratchpad>/picker/check-pick.js`

**Interfaces:**
- Consumes: `CE.lunch.isValidDb(db)`（lunch.js）、`CE.rowsToSettings(rows)`、`CE.parseCsv(text)`
- Produces:
  - `CE.pick.MIN = 2`
  - `CE.pick.dayDiff(a: 'YYYY-MM-DD', b: 'YYYY-MM-DD') → number`（a − b 天數）
  - `CE.pick.candidates(stores: StoreView[], cards: Card[] | null, { today, days, includeRecent }) → { list: StoreView[], excluded: { store, date, ago }[] }`
  - `CE.pick.agoLabel(ago: number) → '昨天' | 'N 天前'`
  - `CE.pick.shuffle(arr, rnd) → 新陣列`；`CE.pick.sample(list, max, rnd) → 新陣列`（不超過上限時保留原順序）；`CE.pick.pickIndex(n, rnd) → 0..n-1`
  - `settings.pickerDays: number`
  - `CE.lunchStore.peekCards() → Card[]`

- [ ] **Step 1: 寫檢查腳本（會失敗）**

`<scratchpad>/picker/check-pick.js`：

```js
// 一次性檢查（不屬於專案）：node check-pick.js
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ROOT = '/Users/critical/Documents/critieat/proto/v1/js/';
const ctx = { console, Intl, Date, Math, JSON }; ctx.globalThis = ctx; vm.createContext(ctx);
['hours.js', 'csv.js', 'stores.js', 'data.js', 'lunch.js', 'lunch-demo.js', 'lunch-store.js', 'pick.js']
  .forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
const CE = ctx.CE, P = CE.pick;

const S = (id, status) => ({ id, name: '店' + id, category: '飯', status });
const card = (storeId, date, status = 'closed') => ({ storeId, date, status });
const stores = [S('A', 'open'), S('B', 'closed'), S('C', 'unknown'), S('D', 'early'), S('E', 'open'), S('F', 'open')];
const today = '2026-10-15';
const cards = [
  card('A', '2026-10-14'), card('A', '2026-10-12'),   // 1 天前（取最近一次）
  card('D', '2026-10-12', 'ordering'),                 // 3 天前：第 N 天算
  card('E', '2026-10-11'),                             // 4 天前：不算
  card('F', '2026-10-15'),                             // 今天：不算
  card('C', '2026-10-13', 'proposed'),                 // 只有提議：不算
  card('B', '2026-10-14'),                             // 公休的店不出現在排除說明
];
const ids = r => r.list.map(s => s.id);

let r = P.candidates(stores, cards, { today, days: 3, includeRecent: false });
assert.deepStrictEqual(ids(r), ['C', 'E', 'F']);
assert.deepStrictEqual(r.excluded.map(x => [x.store.id, x.date, x.ago]), [['A', '2026-10-14', 1], ['D', '2026-10-12', 3]]);

r = P.candidates(stores, cards, { today, days: 3, includeRecent: true });
assert.deepStrictEqual(ids(r), ['A', 'C', 'D', 'E', 'F']);
assert.strictEqual(r.excluded.length, 2, '加回來時仍列出最近吃過的');

r = P.candidates(stores, cards, { today, days: 0, includeRecent: false });
assert.deepStrictEqual(ids(r), ['A', 'C', 'D', 'E', 'F']);
assert.strictEqual(r.excluded.length, 0);

r = P.candidates(stores, null, { today, days: 3, includeRecent: false });
assert.deepStrictEqual(ids(r), ['A', 'C', 'D', 'E', 'F'], 'cards 為 null 視為沒有紀錄');

assert.strictEqual(P.dayDiff('2026-11-01', '2026-10-31'), 1);
assert.strictEqual(P.dayDiff('2026-10-15', '2026-10-15'), 0);
assert.strictEqual(P.agoLabel(1), '昨天');
assert.strictEqual(P.agoLabel(3), '3 天前');

const big = Array.from({ length: 23 }, (_, i) => S('X' + i, 'open'));
const s1 = P.sample(big, 12, Math.random);
assert.strictEqual(s1.length, 12);
assert.strictEqual(new Set(s1).size, 12);
s1.forEach(x => assert(big.includes(x)));
const small = stores.slice(0, 3), s2 = P.sample(small, 12, Math.random);
assert.deepStrictEqual(s2, small);
assert.notStrictEqual(s2, small, 'sample 回傳新陣列');
const sh = P.shuffle(big, Math.random);
assert.strictEqual(sh.length, 23); assert.strictEqual(new Set(sh).size, 23);
for (let i = 0; i < 1000; i++) { const k = P.pickIndex(5, Math.random); assert(k >= 0 && k < 5 && Number.isInteger(k)); }

// 公平：23 家隨機挑 12 再抽 1，每家約 1/23
const cnt = {};
for (let i = 0; i < 46000; i++) {
  const s = P.sample(big, 12, Math.random);
  const w = s[P.pickIndex(s.length, Math.random)];
  cnt[w.id] = (cnt[w.id] || 0) + 1;
}
assert.strictEqual(Object.keys(cnt).length, 23);
Object.values(cnt).forEach(c => assert(c > 1700 && c < 2300, '分布不均 ' + c));

// 設定
assert.strictEqual(CE.rowsToSettings([['轉盤排除天數', '5']]).pickerDays, 5);
assert.strictEqual(CE.rowsToSettings([['轉盤排除天數', '0']]).pickerDays, 0);
assert.strictEqual(CE.rowsToSettings([]).pickerDays, 3);
assert.strictEqual(CE.rowsToSettings([['轉盤排除天數', 'abc']]).pickerDays, 3);
assert.strictEqual(CE.rowsToSettings(CE.parseCsv(CE.DEMO_SETTINGS_CSV)).pickerDays, 3);

// peekCards：沒有 localStorage、壞資料、正常資料；都不寫入
assert.deepStrictEqual(Array.from(CE.lunchStore.peekCards()), []);
let writes = 0;
ctx.localStorage = { getItem: () => 'not json', setItem: () => { writes++; } };
assert.deepStrictEqual(Array.from(CE.lunchStore.peekCards()), []);
ctx.localStorage.getItem = () => null;
assert.deepStrictEqual(Array.from(CE.lunchStore.peekCards()), []);
const db = CE.lunchDemo(new Date());
ctx.localStorage.getItem = () => JSON.stringify(db);
assert.strictEqual(CE.lunchStore.peekCards().length, db.cards.length);
assert.strictEqual(writes, 0, 'peekCards 不可寫入');

console.log('PICK OK');
```

- [ ] **Step 2: 執行，確認失敗**

Run: `node <scratchpad>/picker/check-pick.js`
Expected: 失敗，`ENOENT ... pick.js`

- [ ] **Step 3: 新增 `proto/v1/js/pick.js`**

```js
(function (CE) {
  'use strict';
  // 午餐轉盤純邏輯：候選店家、排除最近吃過、隨機挑一批、抽一家。不碰 DOM、不碰 localStorage。
  // StoreView 至少要有 { id, name, status }；午餐卡至少要有 { storeId, date, status }。

  const MIN = 2;

  // 兩個 'YYYY-MM-DD' 相差幾天（a − b）
  function dayDiff(a, b) {
    return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
  }

  // opts: { today: 'YYYY-MM-DD', days: 排除天數（0 = 不排除）, includeRecent: 是否把最近吃過的加回來 }
  // 回傳 { list, excluded }：excluded 是「今天有開、最近 days 天內真的開過單」的店，依幾天前由近到遠
  function candidates(stores, cards, opts) {
    const open = stores.filter(s => s.status !== 'closed');
    const recent = new Map(); // storeId → 最近一次開單的日期
    if (opts.days > 0) {
      (cards || []).forEach(c => {
        if (c.status !== 'ordering' && c.status !== 'closed') return;
        const ago = dayDiff(opts.today, c.date);
        if (ago < 1 || ago > opts.days) return;
        if (!recent.has(c.storeId) || c.date > recent.get(c.storeId)) recent.set(c.storeId, c.date);
      });
    }
    const excluded = open
      .filter(s => recent.has(s.id))
      .map(s => ({ store: s, date: recent.get(s.id), ago: dayDiff(opts.today, recent.get(s.id)) }))
      .sort((a, b) => a.ago - b.ago);
    const list = opts.includeRecent ? open.slice() : open.filter(s => !recent.has(s.id));
    return { list, excluded };
  }

  const agoLabel = ago => (ago === 1 ? '昨天' : `${ago} 天前`);

  function pickIndex(n, rnd) {
    return Math.min(n - 1, Math.floor(rnd() * n));
  }

  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = pickIndex(i + 1, rnd);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 超過上限就隨機挑 max 家；沒超過就原順序複製一份
  function sample(list, max, rnd) {
    return list.length <= max ? list.slice() : shuffle(list, rnd).slice(0, max);
  }

  CE.pick = { MIN, dayDiff, candidates, agoLabel, pickIndex, shuffle, sample };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 4: 設定「轉盤排除天數」**

`proto/v1/js/stores.js`：

```js
  const SETTING_MAP = {
    '公司名稱': 'companyName', '公司緯度': 'companyLat', '公司經度': 'companyLng',
    '訂餐時段': 'orderWindow', '取餐時間': 'pickupTime', '轉盤排除天數': 'pickerDays',
  };

  const DEFAULTS = { companyName: '公司', orderWindow: '13:00-13:30', pickupTime: '14:00', pickerDays: 3 };
```

在 `rowsToSettings` 裡 `const lat = toNum(raw.companyLat);` 前面加：

```js
    let pickerDays = DEFAULTS.pickerDays;
    if (raw.pickerDays) {
      if (/^\d+$/.test(raw.pickerDays)) pickerDays = Number(raw.pickerDays);
      else console.warn('[CRITIEAT] 轉盤排除天數格式錯誤，改用預設值 ' + DEFAULTS.pickerDays);
    }
```

回傳物件最後加 `pickerDays,`（接在 `pickup,` 後面）。

`proto/v1/js/data.js` 的 `DEMO_SETTINGS_CSV` 在 `取餐時間,14:00` 下一行加 `轉盤排除天數,3`。
`docs/sheet/settings-template.csv` 同樣在 `取餐時間,14:00` 下一行加 `轉盤排除天數,3`（若該檔有說明欄，比照其他列補「午餐轉盤排除最近幾天開過團的店，0 = 不排除」）。

- [ ] **Step 5: `peekCards()`**

`proto/v1/js/lunch-store.js`，在 `function reset(now)` 前加：

```js
  // 只讀不寫：給美食地圖的轉盤看最近的午餐卡。讀不到或格式不對回傳 []，不會寫入示範資料
  function peekCards() {
    const raw = read(KEY);
    if (!raw) return [];
    try {
      const db = JSON.parse(raw);
      return CE.lunch.isValidDb(db) ? db.cards : [];
    } catch (e) { return []; }
  }
```

匯出改成 `CE.lunchStore = { load, save, reset, getMe, setMe, peekCards };`

- [ ] **Step 6: 執行，確認通過**

Run: `node <scratchpad>/picker/check-pick.js`
Expected: `PICK OK`（`abc` 那行會印一行 `[CRITIEAT] 轉盤排除天數格式錯誤…` 警告，是預期的）

- [ ] **Step 7: 記錄進度**

建立 `.superpowers/sdd/2026-10-15-critieat-lunch-picker/progress.md`，第一行 `# 午餐轉盤原型 進度`，加一行：`Task 1: pick.js + pickerDays + peekCards — check-pick PICK OK`

---

### Task 2: 燈箱、轉盤、美食地圖入口

**Files:**
- Create: `proto/v1/js/pick-lightbox.js`
- Create: `proto/v1/js/pick-wheel.js`
- Modify: `proto/v1/index.html`（頁首按鈕、script）
- Modify: `proto/v1/js/app.js`
- Modify: `proto/v1/css/style.css`（末段）
- Create: `.superpowers/sdd/2026-10-15-critieat-lunch-picker/drive-picker.js`

**Interfaces:**
- Consumes: `CE.pick.*`（Task 1）、`CE.lunchStore.peekCards()`、`CE.lunch.todayStr(now)`、`settings.pickerDays`
- Produces:
  - `CE.openPicker({ stores, cards, days, today, source: 'map' | 'lunch', onPick(store, action) })`；`action` 為 `'open' | 'propose' | 'map'`（map）或 `'use'`（lunch）
  - 款式介面 `CE.pickers[mode] = { label, startText, limit(small: boolean) → number, mount(box: HTMLElement, stores: StoreView[], { onWin(store), small, reduced }) → { start(), destroy(), unavailable?: true } }`
  - `CE.pickers.wheel`
  - DOM：`dialog#pick-dlg`、`.pdlg__go`（開始鈕）、`.pdlg__res`（結果）、`.pdlg__info`、`.pdlg__tabs .tab`、`#pick-btn`

- [ ] **Step 1: 建檢查工具**

```bash
mkdir -p /Users/critical/Documents/critieat/.superpowers/sdd/2026-10-15-critieat-lunch-picker
cd /Users/critical/Documents/critieat/.superpowers/sdd
sed -e 's/菜單燈箱/午餐轉盤/' -e 's/PORT = 9335/PORT = 9336/' -e "s/getElementById('menu-dlg')/getElementById('pick-dlg')/" \
  2026-10-15-critieat-menu-lightbox/drive-menu.js > 2026-10-15-critieat-lunch-picker/drive-picker.js
```

再在 `drive-picker.js` 的 `else if (op === 'wait')` 那行後加一個 `val:` 步驟（印出運算式的值）：

```js
        else if (op === 'val') logs.push('val ' + arg.slice(0, 60) + ' => ' + JSON.stringify(await ev(arg)));
```

用法：`node drive-picker.js <輸出資料夾> <網址> <名稱> <寬> <高> <步驟...>`，步驟 `js:<運算式>`、`val:<運算式>`、`wait:<ms>`、`info:<標籤>`（印出 `#pick-dlg` 的文字與是否開著、是否橫向溢出）、`shot:<檔名>`。

- [ ] **Step 2: 先跑一次確認目前沒有入口（失敗）**

Run（在 `proto/v1` 開 8010 後）：
```bash
cd /Users/critical/Documents/critieat/.superpowers/sdd/2026-10-15-critieat-lunch-picker
node drive-picker.js . http://127.0.0.1:8010/index.html w0 1440 900 "js:document.getElementById('pick-btn').click()" info:after
```
Expected: `STEP FAIL js:... Cannot read properties of null`

- [ ] **Step 3: 新增 `proto/v1/js/pick-wheel.js`**

```js
(function (CE) {
  'use strict';
  // 轉盤：先公平抽一家，再算好角度讓那一格停在正上方的指針下。介面見 pick-lightbox.js。
  const COLORS = ['#e0fdff', '#f6e3ff'];
  const ODD_LAST = '#fff7d6'; // 家數為奇數時最後一格換色，避免跟第一格同色相鄰
  const SPIN_MS = 3600;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function mount(box, stores, o) {
    const n = stores.length, seg = 360 / n;
    const size = Math.min(300, box.clientWidth || 300);
    const wrap = el('div', 'pwheel');
    wrap.style.width = wrap.style.height = size + 'px';
    const disc = el('div', 'pwheel__disc');
    disc.style.background = 'conic-gradient(' + stores.map((s, i) => {
      const c = n % 2 && i === n - 1 ? ODD_LAST : COLORS[i % 2];
      return `${c} ${i * seg}deg ${(i + 1) * seg}deg`;
    }).join(',') + ')';
    const labels = stores.map((s, i) => {
      const t = el('span', 'pwheel__label' + (n > 8 ? ' is-small' : ''), s.name.length > 7 ? s.name.slice(0, 6) + '…' : s.name);
      t.style.width = (size / 2 - 22) + 'px';
      t.style.transform = `rotate(${i * seg + seg / 2 - 90}deg)`;
      disc.append(t);
      return t;
    });
    wrap.append(el('div', 'pwheel__pin'), disc, el('div', 'pwheel__hub'));
    box.append(wrap);

    let rot = 0, timer = 0;
    return {
      start() {
        labels.forEach(l => l.classList.remove('is-win'));
        const i = CE.pick.pickIndex(n, Math.random);
        // 第 i 格中心在順時針 i*seg + seg/2 度；轉到 360 − 中心角，那一格就到正上方
        rot = rot - (rot % 360) + 360 * 5 + (360 - (i * seg + seg / 2));
        disc.style.transition = o.reduced ? 'none' : '';
        disc.style.transform = `rotate(${rot}deg)`;
        timer = setTimeout(() => {
          labels[i].classList.add('is-win');
          o.onWin(stores[i]);
        }, o.reduced ? 0 : SPIN_MS + 100);
      },
      destroy() { clearTimeout(timer); },
    };
  }

  CE.pickers = CE.pickers || {};
  CE.pickers.wheel = { label: '轉盤', startText: '轉！', limit: () => 12, mount };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 4: 新增 `proto/v1/js/pick-lightbox.js`**

```js
(function (CE) {
  'use strict';
  // 午餐轉盤燈箱：款式分頁、候選與排除說明、開始鈕、抽到後的按鈕。
  // 用法：CE.openPicker({ stores, cards, days, today, source: 'map' | 'lunch', onPick(store, action) })
  //   stores：StoreView[]；cards：午餐卡（算最近吃過）；days：排除天數；today：'YYYY-MM-DD'
  //   action：source 為 map 時 'open' | 'propose' | 'map'，為 lunch 時 'use'
  // 款式介面（pick-wheel.js、pick-plinko.js、pick-race.js）：
  //   CE.pickers[mode] = { label, startText, limit(small), mount(box, stores, { onWin, small, reduced }) → { start(), destroy(), unavailable? } }
  // 依賴 pick.js（CE.pick）。

  const P = CE.pick;
  const ORDER = ['wheel', 'plinko', 'race'];
  const DEFAULT_MODE = 'race';
  const MODE_KEY = 'critieat.picker.mode';
  const ACTIONS = {
    map: [['用這家開單', 'open', true], ['用這家提議', 'propose'], ['在地圖上看這家', 'map']],
    lunch: [['就這家', 'use', true]],
  };

  let dlg = null, opts = null, mode = DEFAULT_MODE, includeRecent = false, runner = null;

  // 所有資料一律用 textContent 寫入，不用 innerHTML
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function button(cls, text, onClick) {
    const b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  const modes = () => ORDER.filter(m => CE.pickers && CE.pickers[m]);
  const small = () => window.matchMedia('(max-width: 900px)').matches;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function loadMode() {
    let m = DEFAULT_MODE;
    try { m = localStorage.getItem(MODE_KEY) || DEFAULT_MODE; } catch (e) { /* 讀不到用預設 */ }
    const ok = modes();
    return ok.includes(m) ? m : (ok.includes(DEFAULT_MODE) ? DEFAULT_MODE : ok[0]);
  }

  function saveMode(m) {
    try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* 記不住就只在這次有效 */ }
  }

  function stop() {
    if (runner) runner.destroy();
    runner = null;
  }

  function getDialog() {
    if (dlg) return dlg;
    dlg = el('dialog', 'dlg mdlg pdlg');
    dlg.id = 'pick-dlg';
    dlg.setAttribute('aria-label', '午餐轉盤');
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', stop);
    document.body.append(dlg);
    return dlg;
  }

  // 重畫整個燈箱；autoStart（再來一次）畫完直接開始
  function render(autoStart) {
    stop();
    const d = getDialog();
    d.replaceChildren();
    const picker = CE.pickers[mode];

    const close = button('detail__close', '×', () => d.close());
    close.setAttribute('aria-label', '關閉');
    const tabs = el('div', 'tabs pdlg__tabs');
    modes().forEach(m => tabs.append(button('tab' + (m === mode ? ' is-active' : ''), CE.pickers[m].label, () => {
      if (m === mode) return;
      mode = m;
      saveMode(m);
      render(false);
    })));
    d.append(close, el('h3', 'dlg__title', '🎲 今天吃什麼'), tabs);

    const { list, excluded } = P.candidates(opts.stores, opts.cards, { today: opts.today, days: opts.days, includeRecent });
    const info = el('div', 'pdlg__info');
    if (excluded.length) {
      const names = excluded.map(x => `${x.store.name}（${P.agoLabel(x.ago)}）`).join('、');
      info.append(el('span', null, (includeRecent ? '最近吃過（已加回來）：' : '已排除：') + names));
      const lab = el('label', 'pdlg__check');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = !includeRecent;
      cb.addEventListener('change', () => { includeRecent = !cb.checked; render(false); });
      lab.append(cb, ' 排除最近吃過');
      info.append(lab);
    }
    const max = picker.limit(small());
    if (list.length > max) info.append(el('span', null, `共 ${list.length} 家候選，這輪隨機挑 ${max} 家`));
    if (info.childNodes.length) d.append(info);

    const stage = el('div', 'pdlg__stage');
    const res = el('div', 'pdlg__res');
    const go = button('btn btn--primary pdlg__go', picker.startText, () => {
      go.disabled = true;
      res.replaceChildren(el('p', 'hint', '結果揭曉中…'));
      runner.start();
    });
    d.append(stage, go, res);
    if (!d.open) d.showModal(); // 先顯示，stage 才量得到寬度

    if (list.length < P.MIN) {
      stage.append(el('p', 'pick__warn', '候選不到 2 家，放寬篩選或把最近吃過的加回來'));
      go.disabled = true;
      return;
    }
    const round = P.sample(list, max, Math.random);
    runner = picker.mount(stage, round, { small: small(), reduced: reduced(), onWin: store => showResult(res, go, store) });
    if (runner.unavailable) { go.disabled = true; return; }
    if (autoStart) go.click();
  }

  function showResult(res, go, store) {
    go.hidden = true;
    res.replaceChildren(el('div', 'pdlg__label', '抽到了'), el('div', 'pdlg__win', store.name));
    const btns = el('div', 'btns pdlg__acts');
    ACTIONS[opts.source].forEach(([text, action, primary]) => btns.append(button(primary ? 'btn btn--primary' : 'btn', text, () => {
      dlg.close();
      opts.onPick(store, action);
    })));
    btns.append(button('btn', '再來一次', () => render(true)));
    res.append(btns);
  }

  CE.openPicker = function openPicker(o) {
    opts = o;
    mode = loadMode();
    includeRecent = false;
    render(false);
  };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 5: 樣式**

`proto/v1/css/style.css` 檔案最末端加：

```css
/* 午餐轉盤（pick-*.js） */
.pill--pick { cursor: pointer; font: inherit; font-size: 13px; font-weight: 700; color: var(--purple-ink); }
.pdlg { height: auto; max-height: calc(100vh - 48px); overflow-y: auto; align-items: center; }
.pdlg .dlg__title, .pdlg__info { align-self: stretch; }
.pdlg__tabs { align-self: flex-start; }
.pdlg__info { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; font-size: 12.5px; color: var(--muted); background: var(--gray-bg); border-radius: 10px; padding: 8px 12px; }
.pdlg__check { white-space: nowrap; cursor: pointer; color: var(--ink); }
.pdlg__stage { align-self: stretch; display: flex; justify-content: center; min-height: 120px; }
.pdlg__go { padding: 10px 34px; font-size: 15px; }
.pdlg__go[hidden] { display: none; }
.pdlg__res { text-align: center; min-height: 40px; }
.pdlg__label { font-size: 12.5px; color: var(--muted); }
.pdlg__win { font-size: 22px; font-weight: 800; margin: 2px 0 10px; }
.pdlg__acts { justify-content: center; flex-wrap: wrap; }
.pick__warn { align-self: center; margin: 0; padding: 10px 14px; border-radius: 10px; background: var(--yellow-bg); color: var(--yellow-ink); font-size: 13px; font-weight: 700; }

.pwheel { position: relative; flex: none; }
.pwheel__disc { position: absolute; inset: 0; border-radius: 50%; border: 3px solid var(--ink); transition: transform 3.6s cubic-bezier(.17, .67, .12, 1); }
.pwheel__label { position: absolute; left: 50%; top: 50%; margin-top: -.6em; transform-origin: 0 50%; text-align: right; padding-right: 8px; font-size: 12px; font-weight: 700; line-height: 1.2; white-space: nowrap; box-sizing: border-box; }
.pwheel__label.is-small { font-size: 10.5px; }
.pwheel__label.is-win { color: var(--purple-ink); }
.pwheel__pin { position: absolute; left: 50%; top: -10px; margin-left: -10px; border-left: 10px solid transparent; border-right: 10px solid transparent; border-top: 18px solid var(--purple); z-index: 2; filter: drop-shadow(0 0 4px rgba(188, 19, 254, .6)); }
.pwheel__hub { position: absolute; left: 50%; top: 50%; width: 34px; height: 34px; margin: -17px; border-radius: 50%; background: var(--ink); box-shadow: 0 0 0 3px #fff, 0 0 12px var(--cyan); }

@media (max-width: 900px) {
  .pdlg { width: 100vw; max-width: 100vw; height: 100dvh; max-height: 100dvh; margin: 0; border-radius: 0; border: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .pwheel__disc { transition: none; }
}
```

- [ ] **Step 6: 美食地圖入口**

`proto/v1/index.html`：在 `<span id="today-label" ...></span>` 後面加
```html
        <button class="pill pill--pick" type="button" id="pick-btn">🎲 不知道吃什麼</button>
```
在 `<script src="js/menu-lightbox.js"></script>` 後、`js/app.js` 前加：
```html
  <script src="js/lunch.js"></script>
  <script src="js/lunch-store.js"></script>
  <script src="js/pick.js"></script>
  <script src="js/pick-wheel.js"></script>
  <script src="js/pick-lightbox.js"></script>
```

`proto/v1/js/app.js`：在 `function onToggleHideClosed(e) {` 前加

```js
  // 午餐轉盤：候選＝目前清單（勾了「隱藏沒開的店」就只有有開的）；最近吃過讀開團單的資料
  function openPicker() {
    CE.openPicker({
      stores: visible(),
      cards: CE.lunchStore.peekCards(),
      days: state.settings.pickerDays,
      today: CE.lunch.todayStr(new Date()),
      source: 'map',
      onPick(store, action) {
        if (action === 'map') { select(store.id, 'map'); return; }
        location.href = `lunch.html?new=${encodeURIComponent(store.id)}&as=${action}`;
      },
    });
  }
```

在 `init()` 的 `document.getElementById('hide-closed').addEventListener(...)` 下一行加
```js
    document.getElementById('pick-btn').addEventListener('click', openPicker);
```

- [ ] **Step 7: 畫面檢查**

先讓瀏覽器有開團單示範資料（到 lunch.html 走一趟），再回地圖。下列在 `drive-picker.js` 所在資料夾執行，`U=http://127.0.0.1:8010`：

```bash
SEED="js:location.href='lunch.html'" ; BACK="js:location.href='index.html'"
# W1 轉盤：排除說明、轉、結果按鈕
node drive-picker.js . $U/index.html W1 1440 900 "$SEED" wait:1500 "$BACK" wait:1500 \
  "js:document.getElementById('pick-btn').click()" info:open \
  "js:document.querySelector('.pdlg__go').click()" wait:4200 info:won shot:W1
# W2 取消勾選 → 加回來
node drive-picker.js . $U/index.html W2 1440 900 "$SEED" wait:1500 "$BACK" wait:1500 \
  "js:document.getElementById('pick-btn').click()" "js:document.querySelector('.pdlg__check input').click()" info:incl
# W3 用這家開單 → 跳到開團單
node drive-picker.js . $U/index.html W3 1440 900 \
  "js:document.getElementById('pick-btn').click()" "js:document.querySelector('.pdlg__go').click()" wait:4200 \
  "js:[...document.querySelectorAll('.pdlg__acts button')].find(b=>b.textContent==='用這家開單').click()" wait:1500 "val:location.pathname+location.search"
# W4 手機
node drive-picker.js . $U/index.html W4 390 844 "js:document.getElementById('pick-btn').click()" info:mobile shot:W4
# W5 候選很多 / 不到 2 家
node drive-picker.js . $U/index.html W5 1440 900 \
  "js:CE.openPicker({stores:Array.from({length:23},(_,i)=>({id:'X'+i,name:'測試店'+i,category:'飯',status:'open'})),cards:[],days:3,today:'2026-10-15',source:'map',onPick(){}})" info:many \
  "val:document.querySelectorAll('.pwheel__label').length" \
  "js:CE.openPicker({stores:[{id:'A',name:'只有一家',category:'飯',status:'open'}],cards:[],days:3,today:'2026-10-15',source:'map',onPick(){}})" info:one \
  "val:document.querySelector('.pdlg__go').disabled"
# W6 轉到一半關掉
node drive-picker.js . $U/index.html W6 1440 900 "js:document.getElementById('pick-btn').click()" \
  "js:document.querySelector('.pdlg__go').click()" wait:500 "js:document.getElementById('pick-dlg').close()" wait:4500 info:closed
```

Expected：
- W1 `open`：文字含「已排除：」與「丸亀製麵 環球南港店（昨天）」「滷樂町 南港店（昨天）」「八方雲集 南港興華店（3 天前）」與「排除最近吃過」；`won` 含「抽到了」「用這家開單」「用這家提議」「在地圖上看這家」「再來一次」；截圖中被抽中的店名在指針下
- W2 `incl`：含「最近吃過（已加回來）：」
- W3：`val ... => "/lunch.html?new=R0xx&as=open"`（這時 lunch 還沒處理參數，Task 5 才做）
- W4：`overflow:false`、`dlgOverflow:false`，截圖燈箱全螢幕、轉盤完整
- W5 `many`：含「共 23 家候選，這輪隨機挑 12 家」，`val => 12`；`one` 含「候選不到 2 家」，`val => true`
- W6 `closed`：`open:false`，沒有 `EXC`
- 全部沒有 `EXC`；`CONSOLE` 只允許 Google Maps 的 `RefererNotAllowedMapError`

- [ ] **Step 8: 記錄進度**：`Task 2: lightbox + wheel + map entry — W1–W6 pass`

---

### Task 3: 彈珠台

**Files:**
- Create: `proto/v1/js/pick-plinko.js`
- Modify: `proto/v1/index.html`（script）
- Modify: `proto/v1/css/style.css`（「午餐轉盤」區塊）
- Test: `<scratchpad>/picker/check-plinko.js`

**Interfaces:**
- Consumes: `CE.pick.pickIndex`；款式介面（Task 2）
- Produces: `CE.pickers.plinko`（`label: '彈珠台'`、`startText: '投！'`、`limit: small => small ? 6 : 10`）；`CE.plinkoSim = { simulate(n, seed, pegs?) → { frames: { x, y, hit }[], slot }, pathTo(n, target) → 同上, pegsFor(n) }`

- [ ] **Step 1: 寫檢查腳本（會失敗）**

`<scratchpad>/picker/check-plinko.js`：

```js
// 一次性檢查（不屬於專案）：node check-plinko.js
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ROOT = '/Users/critical/Documents/critieat/proto/v1/js/';
const ctx = { console, Math }; ctx.globalThis = ctx; vm.createContext(ctx);
['pick.js', 'pick-plinko.js'].forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
const { simulate, pathTo } = ctx.CE.plinkoSim;

for (let n = 2; n <= 10; n++) {
  const t0 = Date.now();
  for (let target = 0; target < n; target++) {
    for (let k = 0; k < 5; k++) {
      const run = pathTo(n, target);
      assert.strictEqual(run.slot, target, `n=${n} 找不到第 ${target} 格`);
      const last = run.frames[run.frames.length - 1];
      assert(last.y > 380, `n=${n} 珠子沒落到底 y=${last.y}`);
      assert(run.frames.length < 1400, `n=${n} 跑太久`);
    }
  }
  console.log(`n=${n} ok, 平均 ${((Date.now() - t0) / (n * 5)).toFixed(1)}ms/次`);
}
const a = simulate(8, 42), b = simulate(8, 42);
assert.deepStrictEqual(a.frames, b.frames, '同一個 seed 要得到同樣路徑');
console.log('PLINKO OK');
```

- [ ] **Step 2: 執行，確認失敗**

Run: `node <scratchpad>/picker/check-plinko.js` → Expected: `ENOENT ... pick-plinko.js`

- [ ] **Step 3: 新增 `proto/v1/js/pick-plinko.js`**

```js
(function (CE) {
  'use strict';
  // 彈珠台：先公平抽一家，再用同一套物理模擬試不同的投入位置與亂數，找到會落進那格的路徑照著播。
  // 真的落珠台中間機率高，這樣做每家機率仍然一樣。模擬座標固定 340×400，畫的時候依實際寬度縮放。
  const W = 340, H = 400, R = 7, PR = 4, G = 0.25, ROWS = 9, TRIES = 3000;
  const DIV_TOP = H - 62;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // 可重現的亂數（mulberry32）
  function rng(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // 釘子交錯排列；家數少時釘距最多 W/8，板子才不會太空
  function pegsFor(n) {
    const gap = W / Math.max(n, 8), pegs = [];
    for (let row = 0; row < ROWS; row++) {
      const y = 60 + row * 30, off = row % 2 ? gap / 2 : 0;
      for (let x = off + gap / 2; x < W - 4; x += gap) pegs.push({ x, y });
    }
    return pegs;
  }

  // 投一次：frames 每格 { x, y, hit }（hit 為撞到的釘子索引，沒撞到 -1），slot 為落進第幾格
  function simulate(n, seed, pegs) {
    pegs = pegs || pegsFor(n);
    const slotW = W / n, rnd = rng(seed), frames = [];
    let x = W / 2 + (rnd() - 0.5) * 120, y = 14, vx = (rnd() - 0.5) * 1.2, vy = 0, lane = null;
    for (let f = 0; f < 1400; f++) {
      let hit = -1;
      for (let sub = 0; sub < 2; sub++) {
        vy += G / 2; x += vx / 2; y += vy / 2;
        for (let k = 0; k < pegs.length; k++) {
          const p = pegs[k], dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
          if (d > 0 && d < R + PR) {
            const nx = dx / d, ny = dy / d, dot = vx * nx + vy * ny;
            x = p.x + nx * (R + PR); y = p.y + ny * (R + PR);
            if (dot < 0) { vx -= 1.5 * dot * nx; vy -= 1.5 * dot * ny; }
            vx += (rnd() - 0.5) * 0.6;
            hit = k;
          }
        }
        if (x < R) { x = R; vx = Math.abs(vx) * 0.5; }
        if (x > W - R) { x = W - R; vx = -Math.abs(vx) * 0.5; }
        if (y > DIV_TOP && lane === null) lane = Math.min(n - 1, Math.max(0, Math.floor(x / slotW)));
        if (lane !== null) {
          const lo = lane * slotW + R + 1, hi = (lane + 1) * slotW - R - 1;
          if (x < lo) { x = lo; vx = Math.abs(vx) * 0.4; }
          if (x > hi) { x = hi; vx = -Math.abs(vx) * 0.4; }
        }
        if (y > H - R - 2) { y = H - R - 2; vy = -vy * 0.3; vx *= 0.7; }
      }
      frames.push({ x, y, hit });
      if (lane !== null && y >= H - R - 3 && Math.abs(vy) < 0.4) break;
    }
    return { frames, slot: lane === null ? Math.min(n - 1, Math.max(0, Math.floor(x / slotW))) : lane };
  }

  // 找一條落進 target 的路徑；試 TRIES 次都找不到就用最後一次（結果以它實際落的格子為準）
  function pathTo(n, target) {
    const pegs = pegsFor(n);
    let run = null;
    for (let t = 0; t < TRIES; t++) {
      run = simulate(n, Math.floor(Math.random() * 1e9), pegs);
      if (run.slot === target) return run;
    }
    return run;
  }

  function mount(box, stores, o) {
    const n = stores.length, pegs = pegsFor(n), slotW = W / n;
    const cssW = Math.min(W, box.clientWidth || W), scale = cssW / W, dpr = window.devicePixelRatio || 1;
    const wrap = el('div', 'pplinko');
    const cv = el('canvas', 'pplinko__board');
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(H * scale * dpr);
    cv.style.width = cssW + 'px';
    cv.style.height = H * scale + 'px';
    const names = el('div', 'pplinko__names');
    names.style.width = cssW + 'px';
    const nameEls = stores.map(s => {
      const d = el('div');
      d.append(el('span', null, s.name.replace(/\s+/g, '').slice(0, 7)));
      names.append(d);
      return d;
    });
    wrap.append(cv, names);
    box.append(wrap);

    const ctx = cv.getContext('2d');
    const glow = new Map(); // 釘子索引 → 亮度 0..1
    function draw(ball, trail) {
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#374151';
      for (let i = 1; i < n; i++) ctx.fillRect(i * slotW - 1.5, DIV_TOP, 3, H - DIV_TOP);
      pegs.forEach((p, k) => {
        const g = glow.get(k) || 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, PR + g * 2, 0, Math.PI * 2);
        ctx.fillStyle = g > 0 ? `rgba(0,240,255,${0.5 + g / 2})` : '#4b5563';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = g * 14;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      (trail || []).forEach((t, i, all) => {
        ctx.beginPath();
        ctx.arc(t.x, t.y, R * (i / all.length), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(188,19,254,${0.25 * i / all.length})`;
        ctx.fill();
      });
      if (ball) {
        const grd = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, R);
        grd.addColorStop(0, '#fff');
        grd.addColorStop(1, '#bc13fe');
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.shadowColor = '#bc13fe';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    draw(null);

    let raf = 0;
    return {
      start() {
        nameEls.forEach(d => d.classList.remove('is-win'));
        const run = pathTo(n, CE.pick.pickIndex(n, Math.random));
        const finish = () => {
          glow.clear();
          draw(run.frames[run.frames.length - 1]);
          nameEls[run.slot].classList.add('is-win');
          o.onWin(stores[run.slot]);
        };
        if (o.reduced) { finish(); return; }
        let f = 0;
        const trail = [];
        const tick = () => {
          const fr = run.frames[f++];
          if (fr.hit >= 0) glow.set(fr.hit, 1);
          trail.push(fr);
          if (trail.length > 10) trail.shift();
          glow.forEach((v, k) => (v - 0.06 <= 0 ? glow.delete(k) : glow.set(k, v - 0.06)));
          draw(fr, trail);
          if (f < run.frames.length) raf = requestAnimationFrame(tick);
          else finish();
        };
        raf = requestAnimationFrame(tick);
      },
      destroy() { cancelAnimationFrame(raf); },
    };
  }

  CE.plinkoSim = { simulate, pathTo, pegsFor };
  CE.pickers = CE.pickers || {};
  CE.pickers.plinko = { label: '彈珠台', startText: '投！', limit: small => (small ? 6 : 10), mount };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 4: 執行，確認通過**

Run: `node <scratchpad>/picker/check-plinko.js`
Expected: n=2..10 各一行 `ok`（平均應在數十毫秒內），最後 `PLINKO OK`

- [ ] **Step 5: 掛上頁面與樣式**

`proto/v1/index.html`：`js/pick-wheel.js` 後加 `<script src="js/pick-plinko.js"></script>`。

`style.css`「午餐轉盤」區塊（`@media (max-width: 900px)` 那段之前）加：

```css
.pplinko { display: flex; flex-direction: column; align-items: center; }
.pplinko__board { display: block; border-radius: 14px; background: #0b1020; box-shadow: inset 0 0 0 2px #1f2937, 0 0 22px rgba(0, 240, 255, .18); }
.pplinko__names { display: flex; }
.pplinko__names div { flex: 1; min-width: 0; height: 110px; display: flex; justify-content: center; padding-top: 6px; transition: color .2s; }
.pplinko__names span { writing-mode: vertical-rl; text-orientation: upright; font-size: 12px; font-weight: 700; letter-spacing: 1px; }
.pplinko__names .is-win { color: var(--purple-ink); text-shadow: 0 0 8px rgba(188, 19, 254, .45); }
```

- [ ] **Step 6: 畫面檢查**

```bash
MODE="js:localStorage.setItem('critieat.picker.mode','plinko')"
# P1 電腦
node drive-picker.js . $U/index.html P1 1440 900 "$MODE" "js:document.getElementById('pick-btn').click()" \
  "val:document.querySelector('.pdlg__tabs .is-active').textContent" \
  "js:document.querySelector('.pdlg__go').click()" wait:1500 shot:P1-mid wait:3500 info:won shot:P1
# P2 手機：最多 6 家
node drive-picker.js . $U/index.html P2 390 844 "$MODE" \
  "js:CE.openPicker({stores:Array.from({length:9},(_,i)=>({id:'X'+i,name:'測試店'+i,category:'飯',status:'open'})),cards:[],days:3,today:'2026-10-15',source:'map',onPick(){}})" \
  info:mobile "val:document.querySelectorAll('.pplinko__names div').length" shot:P2
# P3 再來一次
node drive-picker.js . $U/index.html P3 1440 900 "$MODE" "js:document.getElementById('pick-btn').click()" \
  "js:document.querySelector('.pdlg__go').click()" wait:5000 \
  "js:[...document.querySelectorAll('.pdlg__acts button')].find(b=>b.textContent==='再來一次').click()" wait:5000 info:again
# P4 換分頁
node drive-picker.js . $U/index.html P4 1440 900 "$MODE" "js:document.getElementById('pick-btn').click()" \
  "js:document.querySelector('.pdlg__go').click()" wait:800 \
  "js:[...document.querySelectorAll('.pdlg__tabs .tab')].find(b=>b.textContent==='轉盤').click()" wait:4000 info:switched \
  "val:localStorage.getItem('critieat.picker.mode')"
```

Expected：
- P1：`val => "彈珠台"`；`won` 含「抽到了」；截圖 P1-mid 看得到珠子與亮起的釘子，P1 抽中的店名亮紫
- P2：含「共 9 家候選，這輪隨機挑 6 家」，`val => 6`，`overflow:false`
- P3 `again`：含「抽到了」（第二輪自動開始並結束）
- P4 `switched`：轉盤分頁、沒有「抽到了」（彈珠台的結果沒跑出來），`val => "wheel"`
- 沒有 `EXC`

- [ ] **Step 7: 記錄進度**：`Task 3: plinko — check-plinko PLINKO OK, P1–P4 pass`

---

### Task 4: 競速

**Files:**
- Create: `proto/v1/js/pick-race.js`
- Modify: `proto/v1/index.html`（matter.js、script）
- Modify: `proto/v1/css/style.css`（「午餐轉盤」區塊）

**Interfaces:**
- Consumes: `CE.pick.shuffle`、`CE.pick.pickIndex`；`globalThis.Matter`；款式介面
- Produces: `CE.pickers.race`（`label: '競速'`、`startText: '開跑！'`、`limit: () => 30`）

- [ ] **Step 1: 先確認競速分頁還不存在（失敗）**

```bash
node drive-picker.js . $U/index.html R0 1440 900 "js:document.getElementById('pick-btn').click()" \
  "val:[...document.querySelectorAll('.pdlg__tabs .tab')].map(t=>t.textContent)"
```
Expected: `val => ["轉盤","彈珠台"]`

- [ ] **Step 2: 新增 `proto/v1/js/pick-race.js`**

```js
(function (CE) {
  'use strict';
  // 競速：每家店一顆珠子（matter.js），起跑位置隨機分配給店家，第一個過終點線的中獎；
  // 其他珠子繼續跑到全部抵達或 60 秒。起跑位置隨機，所以不管跑道怎麼設計每家機率都一樣。
  // 物理座標固定寬 380，畫的時候依實際寬度縮放。需要 globalThis.Matter（matter-js 0.19.0）。
  const W = 380, R = 10, FINISH = 2140, WORLD_H = 2260, MAX_FRAMES = 60 * 60;
  const CAT_COLOR = { 飯: '#00c2d1', 麵: '#3b82f6', 小吃: '#f59e0b', 異國: '#bc13fe' };
  const OTHER = '#6b7280';

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // 跑道：釘子區 → 旋轉槳 → 之字斜坡 → 釘子＋旋轉槳 → 漏斗 → 終點
  function build(M, stores) {
    const { Engine, Bodies, Composite } = M;
    const engine = Engine.create({ gravity: { y: 1 } });
    const statics = [], spinners = [];
    const opt = { isStatic: true, restitution: 0.5, friction: 0 };
    const add = (b, kind) => { b.kind = kind; statics.push(b); return b; };
    const ramp = (x, y, w, angle) => add(Bodies.rectangle(x, y, w, 10, Object.assign({ angle }, opt)), 'ramp');
    const spin = (x, y, w, speed) => { const b = add(Bodies.rectangle(x, y, w, 8, opt), 'spin'); b.speed = speed; spinners.push(b); };
    const pegRows = (y0, rows) => {
      for (let row = 0; row < rows; row++) {
        const y = y0 + row * 34, off = row % 2 ? 19 : 0;
        for (let x = 22 + off; x < W - 12; x += 38) add(Bodies.circle(x, y, 4.5, opt), 'peg');
      }
    };

    add(Bodies.rectangle(-10, WORLD_H / 2, 20, WORLD_H * 2, opt), 'wall');
    add(Bodies.rectangle(W + 10, WORLD_H / 2, 20, WORLD_H * 2, opt), 'wall');
    const gate = add(Bodies.rectangle(W / 2, 175, W, 10, opt), 'gate');
    gate.on = true;
    pegRows(240, 11);
    [[95, 680, 0.05], [285, 680, -0.05], [190, 800, 0.06], [95, 920, -0.05], [285, 920, 0.05]].forEach(a => spin(a[0], a[1], 120, a[2]));
    for (let i = 0; i < 5; i++) {
      const left = i % 2 === 0;
      ramp(left ? 130 : W - 130, 1040 + i * 95, 270, left ? 0.22 : -0.22);
    }
    pegRows(1560, 7);
    spin(110, 1830, 110, 0.07);
    spin(270, 1830, 110, -0.07);
    ramp(80, 1990, 200, 0.55);
    ramp(W - 80, 1990, 200, -0.55);
    add(Bodies.rectangle(W / 2, WORLD_H - 5, W, 10, opt), 'floor');
    Composite.add(engine.world, statics);

    const order = CE.pick.shuffle(stores, Math.random); // 起跑位置隨機分配給店家
    const marbles = order.map((store, k) => {
      const col = k % 8, row = Math.floor(k / 8);
      const b = Bodies.circle(34 + col * 45 + (row % 2) * 12, 60 + row * 26 + Math.random() * 6, R,
        { restitution: 0.45, friction: 0.005, frictionAir: 0.004, density: 0.002 });
      return Object.assign(b, {
        store, short: store.name.replace(/\s+/g, '').slice(0, 2),
        color: CAT_COLOR[store.category] || OTHER, place: 0, lastY: b.position.y, still: 0,
      });
    });
    Composite.add(engine.world, marbles);
    return { engine, statics, spinners, gate, marbles };
  }

  function mount(box, stores, o) {
    const M = globalThis.Matter;
    if (!M) {
      box.append(el('p', 'pick__warn', '競速需要網路載入物理引擎，請改用其他款式'));
      return { unavailable: true, start() {}, destroy() {} };
    }
    const VH = o.small ? 440 : 520;
    const wrap = el('div', 'prace');
    const cssW = Math.min(W, box.clientWidth || W), scale = cssW / W, dpr = window.devicePixelRatio || 1;
    const cv = el('canvas', 'prace__board');
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(VH * scale * dpr);
    cv.style.width = cssW + 'px';
    cv.style.height = VH * scale + 'px';
    const side = el('div', 'prace__side');
    const rank = el('ol', 'prace__rank');
    side.append(el('div', 'sect', '即時名次'), rank);
    wrap.append(cv, side);
    box.append(wrap);
    const ctx = cv.getContext('2d');

    const w = build(M, stores);
    let camY = 0, frame = 0, raf = 0, won = false;
    const finished = [];

    function draw() {
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      ctx.clearRect(0, 0, W, VH);
      ctx.save();
      ctx.translate(0, -camY);
      ctx.fillStyle = 'rgba(188,19,254,.25)';
      ctx.fillRect(0, FINISH, W, 4);
      ctx.fillStyle = '#bc13fe';
      ctx.font = '700 12px Inter, sans-serif';
      ctx.fillText('FINISH', 8, FINISH - 6);
      w.statics.forEach(b => {
        if (b.kind === 'wall' || (b.kind === 'gate' && !b.on)) return;
        if (b.kind === 'peg') {
          ctx.beginPath(); ctx.arc(b.position.x, b.position.y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#4b5563'; ctx.fill();
          return;
        }
        ctx.beginPath();
        b.vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
        ctx.closePath();
        ctx.fillStyle = b.kind === 'spin' ? '#00f0ff' : b.kind === 'gate' ? '#bc13fe' : '#374151';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = b.kind === 'spin' ? 10 : 0;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 8.5px "Noto Sans TC", sans-serif';
      w.marbles.forEach(m => {
        const { x, y } = m.position;
        ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fillStyle = m.color;
        ctx.shadowColor = m.color;
        ctx.shadowBlur = m.place === 1 ? 18 : 6;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.fillText(m.short, x, y + 0.5);
      });
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
      // 右側細條：每顆珠子的進度
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillRect(W - 8, 8, 4, VH - 16);
      w.marbles.forEach(m => {
        ctx.fillStyle = m.color;
        ctx.fillRect(W - 10, 8 + (VH - 16) * Math.min(1, m.position.y / FINISH) - 1, 8, 2);
      });
    }

    function renderRank() {
      const live = w.marbles.filter(m => !m.place).sort((a, b) => b.position.y - a.position.y);
      rank.replaceChildren();
      finished.concat(live).forEach(m => {
        const li = el('li', m.place === 1 ? 'is-win' : m.place ? 'is-done' : null);
        const dot = el('span', 'prace__dot');
        dot.style.background = m.color;
        li.append(dot, el('span', null, m.store.name));
        rank.append(li);
      });
    }

    function win(m) {
      if (won) return;
      won = true;
      if (!m.place) { m.place = 1; finished.unshift(m); }
      o.onWin(m.store);
    }

    function step() {
      w.spinners.forEach(b => { M.Body.setAngle(b, b.angle + b.speed); M.Body.setAngularVelocity(b, b.speed); });
      M.Engine.update(w.engine, 1000 / 60);
      frame++;
      w.marbles.forEach(m => {
        if (!m.place && m.position.y > FINISH) {
          m.place = finished.length + 1;
          finished.push(m);
          if (m.place === 1) win(m);
        }
        if (frame % 60 === 0 && !m.place) { // 卡住 2 秒以上就輕推一下
          m.still = Math.abs(m.position.y - m.lastY) < 2 ? m.still + 1 : 0;
          m.lastY = m.position.y;
          if (m.still >= 2) M.Body.applyForce(m, m.position, { x: (Math.random() - 0.5) * 0.01, y: -0.012 });
        }
      });
      const live = w.marbles.filter(m => !m.place);
      const leader = live.reduce((a, b) => (b.position.y > a.position.y ? b : a), live[0] || finished[0]);
      const focus = finished.length ? finished[0] : leader;
      camY += (Math.max(0, Math.min(WORLD_H - VH, focus.position.y - VH * 0.55)) - camY) * 0.08;
      draw();
      if (frame % 10 === 0) renderRank();
      if (frame >= MAX_FRAMES && !won) win(leader); // 60 秒還沒人到：最前面的那顆中獎
      if (finished.length < w.marbles.length && frame < MAX_FRAMES) raf = requestAnimationFrame(step);
      else renderRank();
    }

    draw();
    renderRank();
    return {
      start() {
        if (o.reduced) {
          win(w.marbles[CE.pick.pickIndex(w.marbles.length, Math.random)]);
          renderRank();
          draw();
          return;
        }
        M.Composite.remove(w.engine.world, w.gate);
        w.gate.on = false;
        raf = requestAnimationFrame(step);
      },
      destroy() {
        cancelAnimationFrame(raf);
        M.Composite.clear(w.engine.world, false);
        M.Engine.clear(w.engine);
      },
    };
  }

  CE.pickers = CE.pickers || {};
  CE.pickers.race = { label: '競速', startText: '開跑！', limit: () => 30, mount };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 3: 掛上頁面與樣式**

`proto/v1/index.html`：`js/pick-plinko.js` 後加
```html
  <script src="https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js"></script>
  <script src="js/pick-race.js"></script>
```

`style.css`「午餐轉盤」區塊（`@media (max-width: 900px)` 那段之前）加：

```css
.prace { display: flex; gap: 18px; align-items: flex-start; justify-content: center; flex-wrap: wrap; }
.prace__board { display: block; border-radius: 14px; background: #0b1020; box-shadow: inset 0 0 0 2px #1f2937, 0 0 22px rgba(0, 240, 255, .18); }
.prace__side { width: 200px; }
.prace__side .sect { margin-top: 0; }
.prace__rank { margin: 6px 0 0; padding-left: 22px; font-size: 13px; max-height: 480px; overflow-y: auto; }
.prace__rank li { padding: 2px 4px; }
.prace__rank li > * { vertical-align: middle; }
.prace__rank .is-done { font-weight: 700; }
.prace__rank .is-win { font-weight: 800; background: rgba(188, 19, 254, .12); border-radius: 6px; }
.prace__dot { display: inline-block; width: 11px; height: 11px; border-radius: 50%; margin-right: 6px; }
```

並在 `@media (max-width: 900px)` 的 `.pdlg { ... }` 下一行加：
```css
  .prace__side { width: 100%; }
  .prace__rank { max-height: 160px; }
```

- [ ] **Step 4: 畫面檢查**

```bash
MODE="js:localStorage.setItem('critieat.picker.mode','race')"
START="js:document.getElementById('pick-btn').click()"
GO="js:window.__t=performance.now();document.querySelector('.pdlg__go').click()"
# R1 預設款式是競速；跑一場
node drive-picker.js . $U/index.html R1 1440 900 "js:localStorage.removeItem('critieat.picker.mode')" "$START" \
  "val:document.querySelector('.pdlg__tabs .is-active').textContent" "$GO" wait:6000 shot:R1-mid wait:20000 info:won shot:R1
# R2 23 家（全部上場）
node drive-picker.js . $U/index.html R2 1440 900 "$MODE" \
  "js:CE.openPicker({stores:Array.from({length:23},(_,i)=>({id:'X'+i,name:'測試店'+i,category:['飯','麵','小吃','異國'][i%4],status:'open'})),cards:[],days:3,today:'2026-10-15',source:'map',onPick(){}})" \
  "val:document.querySelectorAll('.prace__rank li').length" "$GO" wait:30000 info:won23
# R3 手機
node drive-picker.js . $U/index.html R3 390 844 "$MODE" "$START" info:mobile shot:R3 "$GO" wait:25000 info:wonMobile
# R4 跑到一半關掉、再打開
node drive-picker.js . $U/index.html R4 1440 900 "$MODE" "$START" "$GO" wait:3000 \
  "js:document.getElementById('pick-dlg').close()" wait:3000 "$START" info:reopen
# R5 matter.js 沒載到
node drive-picker.js . $U/index.html R5 1440 900 "$MODE" "js:delete window.Matter" "$START" info:nomatter \
  "val:document.querySelector('.pdlg__go').disabled" \
  "js:[...document.querySelectorAll('.pdlg__tabs .tab')].find(b=>b.textContent==='轉盤').click()" \
  "val:document.querySelector('.pdlg__go').disabled"
```

Expected：
- R1：`val => "競速"`；`won` 含「抽到了」與即時名次，截圖 R1-mid 看得到珠子在跑道中段；第一名約 12～20 秒出現
- R2：`val => 23`；`won23` 含「抽到了」
- R3：`overflow:false`、`dlgOverflow:false`，截圖板子在畫面內、名次在板子下方；`wonMobile` 含「抽到了」
- R4 `reopen`：燈箱開著、閘門在、沒有「抽到了」、沒有 `EXC`
- R5 `nomatter`：含「競速需要網路載入物理引擎，請改用其他款式」，`val => true`；切到轉盤後 `val => false`
- 沒有 `EXC`

- [ ] **Step 5: 記錄進度**：`Task 4: race — R1–R5 pass（附第一名秒數）`

---

### Task 5: 開團單入口與 `?new=&as=`

**Files:**
- Modify: `proto/v1/lunch.html`（script）
- Modify: `proto/v1/js/lunch-app.js`（`state`、`setMe`、`renderList`、`openNew`、`init`）

**Interfaces:**
- Consumes: `CE.openPicker`（`source: 'lunch'`，`onPick(store, 'use')`）、`settings.pickerDays`
- Produces: `openNew(preset?: { id, as: 'open' | 'propose' })`；網址 `lunch.html?new=<店家ID>&as=open|propose`

- [ ] **Step 1: 先確認目前不支援（失敗）**

```bash
node drive-picker.js . "$U/lunch.html?new=R002&as=propose" L0 1440 900 \
  "js:(()=>{const b=[...document.querySelectorAll('#me-dlg .voter--btn')].find(b=>b.textContent==='小明');if(b)b.click()})()" wait:500 \
  "val:document.getElementById('new-dlg').open"
```
Expected: `val => false`

- [ ] **Step 2: 載入轉盤**

`proto/v1/lunch.html`：`<script src="js/menu-lightbox.js"></script>` 後、`js/lunch-app.js` 前加：
```html
  <script src="js/pick.js"></script>
  <script src="js/pick-wheel.js"></script>
  <script src="js/pick-plinko.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js"></script>
  <script src="js/pick-race.js"></script>
  <script src="js/pick-lightbox.js"></script>
```

- [ ] **Step 3: `lunch-app.js`**

`state` 物件最後加：
```js
    pendingNew: null,    // 從網址或選身分前要求的「提議／開單」：{ id, as }
```

`setMe` 在 `render();` 之後加：
```js
    if (state.pendingNew) {
      const p = state.pendingNew;
      state.pendingNew = null;
      openNew(p);
    }
```

`renderList` 裡的
```js
        : button('btn btn--primary list__new', '＋ 提議／開單', openNew),
```
改成
```js
        : button('btn btn--primary list__new', '＋ 提議／開單', () => openNew()),
```
（直接傳 `openNew` 會把 click 事件當成 `preset`。）

`openNew` 整個換成：

```js
  // preset：{ id, as }（從轉盤或網址來的），預先選好店家並聚焦對應的按鈕
  function openNew(preset) {
    if (!state.me) { state.pendingNew = preset || null; openMe(true); return; }
    const d = $('new-dlg');
    d.replaceChildren();
    d.append(el('h3', 'dlg__title', '提議／開單'));

    const sel = el('select', 'search');
    sel.setAttribute('aria-label', '店家');
    state.stores.forEach(s => {
      const o = el('option', null, s.status === 'closed' ? `${s.name}（今天公休）` : s.name);
      o.value = s.id;
      sel.append(o);
    });
    if (preset && state.stores.some(s => s.id === preset.id)) sel.value = preset.id;
    const dice = button('btn pdice', '🎲', () => CE.openPicker({
      stores: state.stores, cards: state.db.cards, days: state.settings.pickerDays, today: state.day,
      source: 'lunch', onPick: store => { sel.value = store.id; },
    }));
    dice.setAttribute('aria-label', '用轉盤選店家');
    dice.title = '不知道吃什麼？轉一下';
    const pickRow = el('div', 'dlg__row');
    pickRow.append(sel, dice);

    const note = input('search', '', '備註（選填），例如：今天想吃辣的', () => {});
    const create = mode => {
      const st = state.stores.find(s => s.id === sel.value);
      let id = null;
      act(cs => {
        const r = L.createCard(cs, {
          store: st ? { id: st.id, name: st.name } : null,
          note: note.value, mode, actor: state.me,
          closeAt: CE.formatMin(state.settings.orderEnd),
          pickupAt: CE.formatMin(state.settings.pickup),
          now: now(),
        });
        id = r.id;
        return r.cards;
      }, () => { state.selectedId = id; resetView(); });
      d.close();
    };
    const fieldStore = el('div', 'dlg__field'); // 不用 <label>：裡面有 select 和 🎲 兩個控制項
    fieldStore.append(el('span', 'sect', '店家'), pickRow);
    const fieldNote = el('label', 'dlg__field');
    fieldNote.append(el('span', 'sect', '備註'), note);
    const proposeBtn = button('btn', '先提議', () => create('propose'));
    const openBtn = button('btn btn--primary', '直接開單', () => create('open'));
    const btns = el('div', 'btns');
    btns.append(button('btn', '取消', () => d.close()), proposeBtn, openBtn);
    d.append(fieldStore, fieldNote, btns);
    d.showModal();
    if (preset) (preset.as === 'propose' ? proposeBtn : openBtn).focus();
  }
```

`init()` 裡 `selectFirst();` 下一行加：
```js
    // 從美食地圖轉盤來的（lunch.html?new=R002&as=open）：開「提議／開單」並選好店家；參數用完就清掉
    const params = new URLSearchParams(location.search);
    const newId = params.get('new');
    if (newId) {
      history.replaceState(null, '', location.pathname);
      if (state.stores.some(s => s.id === newId)) state.pendingNew = { id: newId, as: params.get('as') === 'propose' ? 'propose' : 'open' };
    }
```

把 `init()` 最後的
```js
    if (!state.me) openMe(true);
```
改成
```js
    if (!state.me) openMe(true);
    else if (state.pendingNew) { const p = state.pendingNew; state.pendingNew = null; openNew(p); }
```

- [ ] **Step 4: 🎲 樣式**

`style.css`「午餐轉盤」區塊加：
```css
.pdice { flex: none; padding: 0 12px; font-size: 16px; }
```

- [ ] **Step 5: 畫面檢查**

```bash
ME="js:(()=>{const b=[...document.querySelectorAll('#me-dlg .voter--btn')].find(b=>b.textContent==='小明');if(b)b.click()})()"
NEWDLG="val:(()=>{const d=document.getElementById('new-dlg');return {open:d.open,store:d.querySelector('select').value,focus:document.activeElement.textContent,url:location.search}})()"
# L1 對話框的 🎲 → 就這家
node drive-picker.js . $U/lunch.html L1 1440 900 "$ME" "js:[...document.querySelectorAll('button')].find(b=>b.textContent==='＋ 提議／開單').click()" \
  "js:localStorage.setItem('critieat.picker.mode','wheel')" "js:document.querySelector('.pdice').click()" info:picker \
  "js:document.querySelector('.pdlg__go').click()" wait:4200 \
  "val:document.querySelector('.pdlg__win').textContent" \
  "js:[...document.querySelectorAll('.pdlg__acts button')].find(b=>b.textContent==='就這家').click()" wait:300 "$NEWDLG" shot:L1
# L2 網址帶 as=propose（已選身分）
node drive-picker.js . $U/lunch.html L2 1440 900 "$ME" "js:location.href='lunch.html?new=R002&as=propose'" wait:1500 "$NEWDLG"
# L3 還沒選身分：先選身分再開
node drive-picker.js . "$U/lunch.html?new=R005&as=open" L3 1440 900 "val:document.getElementById('me-dlg').open" "$ME" wait:300 "$NEWDLG"
# L4 重新整理不再開；不存在的店家不開
node drive-picker.js . $U/lunch.html L4 1440 900 "$ME" "js:location.href='lunch.html?new=R002'" wait:1500 \
  "js:document.getElementById('new-dlg').close()" "js:location.reload()" wait:1500 "$NEWDLG" \
  "js:location.href='lunch.html?new=NOPE&as=open'" wait:1500 "$NEWDLG"
# L5 從地圖一路到開團單
node drive-picker.js . $U/index.html L5 1440 900 "js:localStorage.setItem('critieat.me','小明')" \
  "js:localStorage.setItem('critieat.picker.mode','wheel')" "js:document.getElementById('pick-btn').click()" \
  "js:document.querySelector('.pdlg__go').click()" wait:4200 \
  "js:window.__win=document.querySelector('.pdlg__win').textContent;sessionStorage.setItem('win',window.__win)" \
  "js:[...document.querySelectorAll('.pdlg__acts button')].find(b=>b.textContent==='用這家提議').click()" wait:1800 \
  "$NEWDLG" "val:sessionStorage.getItem('win')+' / '+document.querySelector('#new-dlg select').selectedOptions[0].textContent"
# L6 手機
node drive-picker.js . $U/lunch.html L6 390 844 "$ME" "js:[...document.querySelectorAll('button')].find(b=>b.textContent==='＋ 提議／開單').click()" \
  "js:document.querySelector('.pdice').click()" info:mobile shot:L6
```

Expected：
- L1：`picker` 含「🎲 今天吃什麼」，沒有「用這家開單」；`.pdlg__win` 的店名＝之後 `NEWDLG` 的 `store` 對應店家（`open:true`），截圖燈箱已關、對話框選著那家
- L2：`{open:true, store:"R002", focus:"先提議", url:""}`
- L3：先 `val => true`（身分對話框），選完 `{open:true, store:"R005", focus:"直接開單", url:""}`
- L4：重新整理後 `open:false`；`NOPE` 時 `open:false`、`url:""`
- L5：`open:true`、`focus:"先提議"`；最後一行兩邊店名相同（`store.name` 與選項文字一致；公休店會多「（今天公休）」，但候選已排除公休，所以應完全相同）
- L6：`overflow:false`、燈箱全螢幕
- 沒有 `EXC`

- [ ] **Step 6: 開團單回歸**

用 `.superpowers/sdd/2026-10-14-critieat-lunch-card-proto/drive-lunch.js`（`U=http://127.0.0.1:8010/lunch.html`）跑：`clear me:小明 'new:R002|好餓|直接開單'`、`clear me:小美 sel:1 btn:開始點餐`、`clear me:小華 btn:取消這團 btn:確定取消`、`clear me:小明 'fill:0|鍋貼|80|' btn:送出`。
Expected：與 2026-10-15 修 Minor 後的結果相同（開新單後卡片「虎記魯肉飯 ● 點餐中 小明 開單」、開始點餐、取消、送出顯示「已送出」），沒有 `EXC`、`overflow false`。

- [ ] **Step 7: 記錄進度**：`Task 5: lunch entry + ?new — L1–L6 pass, lunch regression pass`

---

### Task 6: 收尾

**Files:**
- Modify: `docs/specs/2026-10-15-critieat-lunch-picker-design.md`（狀態行）
- Modify: `docs/specs/2026-10-08-critieat-phase1-food-map-design.md`（第四階段表格註記）
- Modify: `.superpowers/sdd/2026-10-15-critieat-lunch-picker/progress.md`

- [ ] **Step 1: 全部再跑一次**

`node check-pick.js`、`node check-plinko.js`（`PICK OK`、`PLINKO OK`），Task 2～5 的 W1、P1、R1、L1、L5 各再跑一次，並在 1024×768 開一次三款各轉一次：`overflow:false`、沒有 `EXC`。

- [ ] **Step 2: 菜單燈箱回歸**

```bash
node drive-picker.js . $U/index.html M1 1440 900 \
  "js:document.querySelector('.item').click()" "js:[...document.querySelectorAll('#detail button')].find(b=>b.textContent.includes('菜單')).click()" \
  "val:document.getElementById('menu-dlg').open"
```
Expected: `val => true`，沒有 `EXC`（確認 `.mdlg` 樣式沒被 `.pdlg` 影響）。

- [ ] **Step 3: 文件**

- spec 狀態行改成：`日期：2026-10-15　狀態：原型已實作（proto/v1），待使用者審核`；「這一版不做」之前加一節「原型」：列出新增檔案與 `.superpowers/sdd/2026-10-15-critieat-lunch-picker/` 驗證紀錄。
- phase1 spec 第四階段那列（`| 四 | 午餐轉盤及回饋 | …`）的備註欄寫：`轉盤原型已做（2026-10-15，見 2026-10-15-critieat-lunch-picker-design.md）`；第 249 行附近「轉盤需自行排除午餐沒開的店」那列標註「已處理：排除今天公休，營業時間未填的保留」。

- [ ] **Step 4: 停掉 8010 伺服器，記錄進度**：`Task 6: final — all checks pass; docs updated`
