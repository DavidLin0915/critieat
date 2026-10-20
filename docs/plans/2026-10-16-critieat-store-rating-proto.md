# CRITIEAT 店家評分原型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `proto/v1` 美食地圖的店家詳情加上評分區塊（每人每店一筆半星評分＋短評），列表卡片顯示平均與人數。

**Architecture:** 沿用 `proto/v1` 寫法：純靜態 HTML + 原生 JS，各檔是 IIFE 掛在 `globalThis.CE`。純邏輯 `rating.js`（驗證、平均、新增/取代/刪除），儲存 `rating-store.js`（localStorage，照 `lunch-store.js`），示範資料 `rating-demo.js`，畫面 `rating-ui.js`（模組內保留還沒存的表單狀態，詳情重畫時不會不見）。`app.js` 只負責把評分區塊放進詳情、把平均放進列表。身分與成員名單共用開團單（`critieat.me`、`lunchStore.peekMembers()`）。

**Tech Stack:** HTML5、CSS（接在 `css/style.css` 末段）、原生 JavaScript（ES2020）；檢查用 node 18（`vm`）+ headless Chrome（CDP）。

**Spec:** `docs/specs/2026-10-15-critieat-store-rating-design.md`

## Global Constraints

- 每人每店一筆，唯一鍵 `(storeId, member)`；儲存時直接取代
- 星等 0.5～5，每 0.5 一級，沒有 0 星
- 短評選填、單行、最多 50 字；存之前去掉前後空白，空字串表示沒寫。字數以字串長度計（和 `<input maxlength>` 一致）
- 平均＝算術平均四捨五入到小數 1 位，固定顯示 1 位小數（`4.0`）；一律顯示平均與人數，不設門檻；沒評分的店不顯示
- localStorage key `critieat.ratings.v1` = `{ ratings: Rating[] }`；身分 key `critieat.me`（與開團單共用）
- 格式壞掉時的提示文字：「本機評分資料無法讀取，已載入示範資料」；存不進去時：「無法儲存到這台電腦的瀏覽器」
- 所有資料一律以 `textContent`（或 `new Option(text, value)`）寫入 DOM，禁止 `innerHTML`
- 不使用 `alert` / `confirm` / `prompt`；刪除用「按兩次」確認
- 星星點擊區至少 32px；手機版（≤900px）詳情可完整操作
- **不得引入任何測試框架**（團隊鐵則）。邏輯以 scratchpad 的一次性 node 檢查腳本確認（不放進專案），畫面以 headless Chrome 確認
- **不做 git 操作**：`critieat/` 不受版控。每個 Task 結束在 `.superpowers/sdd/2026-10-16-critieat-store-rating/progress.md` 記一行
- 原型不可依賴建置工具；以 `proto/v1` 為根目錄的靜態伺服器即可運作

## Review Focus

1. **正在填評分時，詳情因為別的原因重畫（在列表或地圖上再點同一家店）** → 還沒存的星數與短評還在；換到別家店時，表單改帶那家店自己的評分。由 Task 3 的 `RF1` 覆蓋
2. **`critieat.me` 存的名字不在成員名單裡（開團單資料被重置或換過）** → 當作還沒選身分，顯示「你是誰？」。由 Task 3 的 `RF2` 覆蓋
3. **localStorage 寫不進去（容量滿、被封鎖）** → 顯示「無法儲存到這台電腦的瀏覽器」，表單內容保留，平均不變。由 Task 3 的 `RF3` 覆蓋
4. **存的資料壞掉：JSON 壞掉、同一人同一店兩筆、星數不是 0.5 的倍數** → 改用示範資料覆寫並顯示提示。由 Task 1（`isValidDb`）、Task 2（`load`）、Task 3 的 `RF4` 覆蓋
5. **短評只打空白、剛好 50 字、用中文輸入法選字時按 Enter** → 空白存成沒寫；50 字可存；選字中的 Enter 不會送出。由 Task 1 的 normalize／長度檢查覆蓋；Enter 由程式碼的 `!e.isComposing` 守住（headless 不易模擬，Task 3 人工看程式碼）

---

## 檔案結構

| 檔案 | 動作 | 負責 |
|---|---|---|
| `proto/v1/js/rating.js` | 新增 | 純邏輯 `CE.rating` |
| `proto/v1/js/rating-demo.js` | 新增 | 示範資料 `CE.ratingDemo(now)` |
| `proto/v1/js/rating-store.js` | 新增 | `CE.ratingStore = { load, save }` |
| `proto/v1/js/lunch-store.js` | 修改 | 加 `peekMembers()` |
| `proto/v1/js/rating-ui.js` | 新增 | `CE.ratingUi = { init, summary, section }` |
| `proto/v1/js/app.js` | 修改 | 列表平均、詳情評分區塊、初始化 |
| `proto/v1/index.html` | 修改 | 載入 `lunch-demo.js` 與 4 個評分檔 |
| `proto/v1/css/style.css` | 修改 | 末段加「店家評分」區塊 |

檢查工具（不屬於專案）：
- scratchpad `rating/`：`check-rating.js`、`check-rating-store.js`
- `.superpowers/sdd/2026-10-16-critieat-store-rating/drive-rating.js`（由 `drive-picker.js` 複製改寫）、`progress.md`、截圖

`<scratchpad>` = `/private/tmp/claude-501/-Users-critical-Documents-critieat/68572742-9d17-4b59-9053-b1b68c2e86da/scratchpad`

檢查用伺服器：在 `proto/v1` 內 `python3 -m http.server 8010 --bind 127.0.0.1`；8010 上 Google Maps 會出 `RefererNotAllowedMapError`，是預期的。

---

### Task 1: 純邏輯 `rating.js`

**Files:**
- Create: `proto/v1/js/rating.js`
- Test: `<scratchpad>/rating/check-rating.js`

**Interfaces:**
- Consumes: 無
- Produces（`CE.rating`）：
  - `MAX_COMMENT = 50`
  - `isValidStars(v) → boolean`
  - `isValidRating(r) → boolean`
  - `isValidDb(db) → boolean`（含唯一鍵檢查）
  - `normalizeComment(v) → string`
  - `summary(ratings: Rating[], storeId) → { avg: number, count: number } | null`
  - `formatStars(n: number) → string`（`4` → `'4.0'`）
  - `find(db, storeId, member) → Rating | null`
  - `others(db, storeId, exclude: string) → Rating[]`（該店、排除 `exclude`、`updatedAt` 新到舊）
  - `upsert(db, rating) → db`（不合法丟 `Error('評分格式不正確')`；不修改傳入物件）
  - `remove(db, storeId, member) → db`
  - `dateLabel(iso) → 'MM/DD'`（台灣時間）

- [ ] **Step 1: 寫檢查腳本（會失敗）**

`<scratchpad>/rating/check-rating.js`：

```js
// 一次性檢查（不屬於專案）：node check-rating.js
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ROOT = '/Users/critical/Documents/critieat/proto/v1/js/';
const ctx = { console, Intl, Date, Math, JSON }; ctx.globalThis = ctx; vm.createContext(ctx);
['rating.js'].forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
const R = ctx.CE.rating;

// 星等級距
[0.5, 1, 3.5, 5].forEach(v => assert(R.isValidStars(v), 'ok ' + v));
[0, 0.3, 5.5, -1, '3', NaN, Infinity, null, undefined].forEach(v => assert(!R.isValidStars(v), 'bad ' + v));

// 短評
assert.strictEqual(R.normalizeComment('  好吃  '), '好吃');
assert.strictEqual(R.normalizeComment('   '), '');
assert.strictEqual(R.normalizeComment(null), '');
const T = '2026-10-15T05:30:00.000Z';
const rt = (storeId, member, stars, comment = '', updatedAt = T) => ({ storeId, member, stars, comment, updatedAt });
assert(R.isValidRating(rt('R1', '小明', 3, '字'.repeat(50))), '50 字可以');
assert(!R.isValidRating(rt('R1', '小明', 3, '字'.repeat(51))), '51 字不行');
assert(!R.isValidRating(rt('', '小明', 3)), '沒有店');
assert(!R.isValidRating(rt('R1', '', 3)), '沒有人');
assert(!R.isValidRating(rt('R1', '小明', 3, '', 'not a date')), '時間壞掉');
assert(!R.isValidRating(rt('R1', '小明', 3, null)), 'comment 不是字串');

// 平均：四捨五入到 1 位、固定 1 位小數
const avg = stars => R.summary(stars.map((s, i) => rt('A', 'm' + i, s)), 'A');
assert.deepStrictEqual(avg([3.5, 4, 4.5]), { avg: 4, count: 3 });
assert.strictEqual(R.formatStars(avg([3.5, 4, 4.5]).avg), '4.0');
assert.strictEqual(avg([4, 4.5]).avg, 4.3, '4.25 → 4.3');
assert.strictEqual(avg([1, 1.5, 1.5]).avg, 1.3, '1.333 → 1.3');
assert.strictEqual(avg([5, 4.5, 4.5]).avg, 4.7, '4.666 → 4.7');
assert.strictEqual(avg([0.5, 1]).avg, 0.8, '0.75 → 0.8');
assert.strictEqual(R.formatStars(5), '5.0');
assert.strictEqual(R.summary([rt('B', 'x', 3)], 'A'), null, '別家的評分不算');
assert.strictEqual(R.summary([], 'A'), null);

// 取代、刪除、不修改傳入的物件
const db0 = { ratings: [rt('A', '小明', 3, '普通'), rt('A', '小美', 4), rt('B', '小明', 5)] };
const before = JSON.stringify(db0);
const db1 = R.upsert(db0, rt('A', '小明', 4.5, '改觀了', '2026-10-16T05:30:00.000Z'));
assert.strictEqual(JSON.stringify(db0), before, 'upsert 不改原物件');
assert.strictEqual(db1.ratings.length, 3, '同一人同一店是取代');
assert.strictEqual(R.find(db1, 'A', '小明').stars, 4.5);
assert.strictEqual(R.find(db1, 'A', '小明').comment, '改觀了');
const db2 = R.upsert(db1, rt('C', '小明', 2));
assert.strictEqual(db2.ratings.length, 4, '別家是新增');
assert.throws(() => R.upsert(db0, rt('A', '小明', 0)), /評分格式不正確/);
const db3 = R.remove(db1, 'A', '小明');
assert.strictEqual(R.find(db3, 'A', '小明'), null);
assert.strictEqual(db3.ratings.length, 2);
assert.strictEqual(db1.ratings.length, 3, 'remove 不改原物件');
assert.strictEqual(R.find(db0, 'Z', '小明'), null);

// 其他人的評分：排除自己、新到舊
const db4 = { ratings: [rt('A', '甲', 3, '', '2026-10-10T00:00:00.000Z'), rt('A', '乙', 4, '', '2026-10-12T00:00:00.000Z'), rt('A', '我', 5), rt('B', '丙', 2)] };
assert.deepStrictEqual(R.others(db4, 'A', '我').map(r => r.member), ['乙', '甲']);
assert.deepStrictEqual(R.others(db4, 'A', '').map(r => r.member), ['我', '乙', '甲']);

// 資料庫格式
assert(R.isValidDb({ ratings: [] }));
assert(R.isValidDb(db0));
assert(!R.isValidDb(null));
assert(!R.isValidDb({}));
assert(!R.isValidDb({ ratings: [rt('A', '小明', 3), rt('A', '小明', 4)] }), '同一人同一店兩筆');
assert(!R.isValidDb({ ratings: [rt('A', '小明', 3.3)] }), '星數不是 0.5 的倍數');

// 日期（台灣時間）
assert.strictEqual(R.dateLabel('2026-10-15T17:00:00.000Z'), '10/16', 'UTC 17:00 是台灣隔天 01:00');
assert.strictEqual(R.dateLabel('2026-01-05T03:00:00.000Z'), '01/05');

console.log('check-rating: all passed');
```

- [ ] **Step 2: 跑檢查確認失敗**

Run: `node <scratchpad>/rating/check-rating.js`
Expected: FAIL，`ENOENT ... rating.js`

- [ ] **Step 3: 實作 `proto/v1/js/rating.js`**

```js
(function (CE) {
  'use strict';

  // 店家評分純邏輯：不碰 DOM、不碰 localStorage。
  // 操作都是「舊的 db → 新的 db」，不修改傳入的物件。db: { ratings: Rating[] }
  // Rating: { storeId, member, stars（0.5～5、每 0.5 一級）, comment（最多 50 字，可為空字串）, updatedAt（ISO） }
  // 字數以字串長度計，和 <input maxlength> 一致。

  const MAX_COMMENT = 50;

  function isValidStars(v) {
    return typeof v === 'number' && v >= 0.5 && v <= 5 && Number.isInteger(v * 2);
  }

  function normalizeComment(v) {
    return String(v == null ? '' : v).trim();
  }

  function isValidRating(r) {
    const str = v => typeof v === 'string';
    return !!r && typeof r === 'object' &&
      str(r.storeId) && r.storeId !== '' && str(r.member) && r.member !== '' &&
      isValidStars(r.stars) && str(r.comment) && r.comment.length <= MAX_COMMENT &&
      str(r.updatedAt) && !Number.isNaN(Date.parse(r.updatedAt));
  }

  const keyOf = r => r.storeId + '\n' + r.member;

  // 每筆格式正確，而且同一人同一家店最多一筆
  function isValidDb(db) {
    if (!db || typeof db !== 'object' || !Array.isArray(db.ratings)) return false;
    if (!db.ratings.every(isValidRating)) return false;
    return new Set(db.ratings.map(keyOf)).size === db.ratings.length;
  }

  // 平均四捨五入到小數 1 位。星數都是 0.5 的倍數，先換成「半星數」的整數再算，避免浮點誤差
  function summary(ratings, storeId) {
    const list = ratings.filter(r => r.storeId === storeId);
    if (list.length === 0) return null;
    const halves = list.reduce((sum, r) => sum + Math.round(r.stars * 2), 0);
    return { avg: Math.round(halves * 5 / list.length) / 10, count: list.length };
  }

  function formatStars(n) {
    return n.toFixed(1);
  }

  function find(db, storeId, member) {
    return db.ratings.find(r => r.storeId === storeId && r.member === member) || null;
  }

  // 該店其他人的評分，新到舊；exclude 傳空字串表示全部
  function others(db, storeId, exclude) {
    return db.ratings
      .filter(r => r.storeId === storeId && r.member !== exclude)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  function upsert(db, rating) {
    if (!isValidRating(rating)) throw new Error('評分格式不正確');
    const key = keyOf(rating);
    return { ratings: db.ratings.filter(r => keyOf(r) !== key).concat([Object.assign({}, rating)]) };
  }

  function remove(db, storeId, member) {
    return { ratings: db.ratings.filter(r => !(r.storeId === storeId && r.member === member)) };
  }

  // 台灣時間 'MM/DD'
  function dateLabel(iso) {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(iso));
    const get = t => p.find(x => x.type === t).value;
    return get('month') + '/' + get('day');
  }

  CE.rating = {
    MAX_COMMENT, isValidStars, isValidRating, isValidDb, normalizeComment,
    summary, formatStars, find, others, upsert, remove, dateLabel,
  };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 4: 跑檢查確認通過**

Run: `node <scratchpad>/rating/check-rating.js`
Expected: `check-rating: all passed`

- [ ] **Step 5: 記進度**

在 `.superpowers/sdd/2026-10-16-critieat-store-rating/progress.md` 加一行：`- [x] Task 1 rating.js — check-rating passed`

---

### Task 2: 示範資料、儲存、成員名單

**Files:**
- Create: `proto/v1/js/rating-demo.js`
- Create: `proto/v1/js/rating-store.js`
- Modify: `proto/v1/js/lunch-store.js`（加 `peekMembers`，export）
- Test: `<scratchpad>/rating/check-rating-store.js`

**Interfaces:**
- Consumes: `CE.rating.isValidDb`（Task 1）、`CE.lunch.isValidDb`、`CE.lunch.todayStr`（lunch.js）、`CE.lunchDemo(now)`（lunch-demo.js）
- Produces:
  - `CE.ratingDemo(now: Date) → { ratings: Rating[] }`
  - `CE.ratingStore.load(now: Date) → { db, warning: string | null }`
  - `CE.ratingStore.save(db) → boolean`
  - `CE.lunchStore.peekMembers() → string[]`（只讀，不寫入開團單示範資料）

- [ ] **Step 1: 寫檢查腳本（會失敗）**

`<scratchpad>/rating/check-rating-store.js`：

```js
// 一次性檢查（不屬於專案）：node check-rating-store.js
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ROOT = '/Users/critical/Documents/critieat/proto/v1/js/';
const FILES = ['hours.js', 'data.js', 'lunch.js', 'lunch-demo.js', 'lunch-store.js', 'rating.js', 'rating-demo.js', 'rating-store.js'];
const BROKEN = '本機評分資料無法讀取，已載入示範資料';
const KEY = 'critieat.ratings.v1';

function memStorage(init = {}) {
  const s = Object.assign({}, init);
  return { s, getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; } };
}
function boot(localStorage) {
  const ctx = { console, Intl, Date, Math, JSON, localStorage }; ctx.globalThis = ctx; vm.createContext(ctx);
  FILES.forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
  return ctx.CE;
}
const now = new Date('2026-10-16T04:00:00.000Z');

// 示範資料：格式正確、店家在 data.js、成員在開團單示範名單裡、有半星、有短評也有沒短評
let CE = boot(memStorage());
const demo = CE.ratingDemo(now);
assert(CE.rating.isValidDb(demo), '示範資料格式正確');
const storeIds = new Set(CE.DEMO_STORES_CSV.match(/^R\d{3}/gm));
const members = CE.lunchDemo(now).members;
demo.ratings.forEach(r => {
  assert(storeIds.has(r.storeId), '店家不存在 ' + r.storeId);
  assert(members.includes(r.member), '成員不存在 ' + r.member);
});
const demoStores = new Set(demo.ratings.map(r => r.storeId));
assert(demoStores.size >= 5 && demoStores.size <= 6, '5～6 家店');
assert(demo.ratings.some(r => !Number.isInteger(r.stars)), '有半星');
assert(demo.ratings.some(r => r.comment) && demo.ratings.some(r => !r.comment), '有的有短評、有的沒有');

// 第一次載入：寫入示範資料，不顯示提示
let ls = memStorage();
CE = boot(ls);
let r = CE.ratingStore.load(now);
assert.strictEqual(r.warning, null);
assert(CE.rating.isValidDb(JSON.parse(ls.s[KEY])), '寫入示範資料');

// 已有資料：原樣讀出
const mine = { ratings: [{ storeId: 'R003', member: '小明', stars: 3.5, comment: '好吃', updatedAt: now.toISOString() }] };
ls = memStorage({ [KEY]: JSON.stringify(mine) });
CE = boot(ls);
r = CE.ratingStore.load(now);
assert.deepStrictEqual(JSON.parse(JSON.stringify(r.db)), mine);
assert.strictEqual(r.warning, null);

// 格式壞掉：JSON 壞掉、同一人同一店兩筆 → 示範資料覆寫並提示
for (const bad of ['{bad', JSON.stringify({ ratings: [mine.ratings[0], mine.ratings[0]] })]) {
  ls = memStorage({ [KEY]: bad });
  CE = boot(ls);
  r = CE.ratingStore.load(now);
  assert.strictEqual(r.warning, BROKEN);
  assert(CE.rating.isValidDb(JSON.parse(ls.s[KEY])), '已覆寫成示範資料');
}

// localStorage 無法使用：顯示示範資料，不提示；save 回傳 false
const thrower = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
CE = boot(thrower);
r = CE.ratingStore.load(now);
assert(CE.rating.isValidDb(r.db));
assert.strictEqual(r.warning, null);
assert.strictEqual(CE.ratingStore.save(r.db), false);

// 成員名單：沒有開團單資料 → 示範名單，且不寫入開團單
ls = memStorage();
CE = boot(ls);
assert.deepStrictEqual(Array.from(CE.lunchStore.peekMembers()), members);
assert(!('critieat.lunch.v1' in ls.s), 'peekMembers 不寫入開團單資料');
// 開團單有新增成員 → 讀到新名單
const lunchDb = CE.lunchDemo(now); lunchDb.members.push('新人');
ls = memStorage({ 'critieat.lunch.v1': JSON.stringify(lunchDb) });
CE = boot(ls);
assert(CE.lunchStore.peekMembers().includes('新人'));
// 開團單資料壞掉 → 示範名單
CE = boot(memStorage({ 'critieat.lunch.v1': '{bad' }));
assert.deepStrictEqual(Array.from(CE.lunchStore.peekMembers()), members);

console.log('check-rating-store: all passed');
```

- [ ] **Step 2: 跑檢查確認失敗**

Run: `node <scratchpad>/rating/check-rating-store.js`
Expected: FAIL，`ENOENT ... rating-demo.js`

- [ ] **Step 3: 實作 `proto/v1/js/rating-demo.js`**

```js
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
        r('R002', '阿傑', 4.5, '魯肉飯大碗很划算', 6),
        r('R002', '小明', 4, '', 6),
        r('R002', '小婷', 3.5, '排骨有點乾', 5),
        r('R005', '阿翔', 5, '湯頭穩定，天婦羅現炸', 1.1),
        r('R005', '小明', 4.5, '', 1),
        r('R005', '阿凱', 4, '牛肉偏少', 1.2),
        r('R005', '小芳', 4.5, '', 2),
        r('R006', '小華', 3.5, '', 3),
        r('R006', '阿明', 3, '鍋貼有點油', 3.1),
        r('R006', '小明', 4, '酸辣湯推', 2),
        r('R009', '小美', 4, '滷肉入味', 1),
        r('R004', '阿明', 2.5, '辣度很誠實，吃完肚子不太舒服', 9),
      ],
    };
  };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 4: 實作 `proto/v1/js/rating-store.js`**

```js
(function (CE) {
  'use strict';
  // 店家評分存在瀏覽器 localStorage，處理方式照 lunch-store.js。
  const KEY = 'critieat.ratings.v1';
  const BROKEN = '本機評分資料無法讀取，已載入示範資料';

  // 回傳字串、null（沒有資料），或 undefined（localStorage 無法使用）
  function read() {
    try { return localStorage.getItem(KEY); } catch (e) { return undefined; }
  }

  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch (e) { return false; }
  }

  // 回傳 { db, warning }。localStorage 無法使用時只顯示示範資料，按儲存時才會報錯
  function load(now) {
    const raw = read();
    if (raw === undefined) return { db: CE.ratingDemo(now), warning: null };
    if (raw !== null) {
      try {
        const db = JSON.parse(raw);
        if (CE.rating.isValidDb(db)) return { db, warning: null };
      } catch (e) { /* 格式壞掉，往下改用示範資料 */ }
    }
    const db = CE.ratingDemo(now);
    save(db);
    return { db, warning: raw === null ? null : BROKEN };
  }

  CE.ratingStore = { load, save };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 5: `proto/v1/js/lunch-store.js` 加 `peekMembers`**

在 `peekCards` 後面加：

```js
  // 只讀不寫：給美食地圖的評分選身分。讀不到或格式不對時回傳示範成員，不會寫入示範資料
  function peekMembers() {
    const raw = read(KEY);
    if (raw) {
      try {
        const db = JSON.parse(raw);
        if (CE.lunch.isValidDb(db)) return db.members.slice();
      } catch (e) { /* 往下用示範成員 */ }
    }
    return CE.lunchDemo(new Date()).members;
  }
```

export 改成：

```js
  CE.lunchStore = { load, save, reset, getMe, setMe, peekCards, peekMembers };
```

- [ ] **Step 6: 跑檢查確認通過**

Run: `node <scratchpad>/rating/check-rating-store.js && node <scratchpad>/rating/check-rating.js`
Expected: 兩行 `all passed`

- [ ] **Step 7: 記進度**

`progress.md` 加一行：`- [x] Task 2 rating-demo / rating-store / peekMembers — check-rating-store passed`

---

### Task 3: 評分畫面與接進美食地圖

**Files:**
- Create: `proto/v1/js/rating-ui.js`
- Modify: `proto/v1/js/app.js`（`renderList` 的 meta、`renderDetail` 插入區塊、`init` 呼叫 `CE.ratingUi.init`）
- Modify: `proto/v1/index.html`（script 順序）
- Modify: `proto/v1/css/style.css`（末段加區塊）
- Test: `.superpowers/sdd/2026-10-16-critieat-store-rating/drive-rating.js`

**Interfaces:**
- Consumes: Task 1 的 `CE.rating.*`、Task 2 的 `CE.ratingStore.load/save`、`CE.lunchStore.peekMembers/getMe/setMe`
- Produces（`CE.ratingUi`）：
  - `init(now: Date)`：讀評分、成員、身分
  - `summary(storeId) → { avg, count } | null`
  - `section(store: StoreView, onChange: () => void) → HTMLElement`；儲存／刪除成功後呼叫 `onChange`（由 app 重畫列表與詳情）

- [ ] **Step 1: 建 headless driver**

複製 `.superpowers/sdd/2026-10-15-critieat-lunch-picker/drive-picker.js` 成 `.superpowers/sdd/2026-10-16-critieat-store-rating/drive-rating.js`，改：
- 開頭註解改成「操作店家評分並截圖」、`PORT = 9337`
- `info` 步驟改成印評分區與列表的狀態：

```js
        else if (op === 'info') logs.push(arg + ' => ' + JSON.stringify(await ev(`(()=>{const r=document.querySelector('.rate');const sel=document.querySelector('.item.is-selected .item__meta');const star=document.querySelector('.star');return {rate:r?r.innerText.replace(/\\n+/g,' / ').slice(0,500):null,meta:sel?sel.textContent:null,input:(document.querySelector('.rate__input')||{}).value,starPx:star?star.getBoundingClientRect().width:null,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}})()`)));
```

- 加兩種步驟（放在 `info` 那行前面）：

```js
        else if (op === 'reload') { await send('Page.reload'); await sleep(1500); }
        else if (op === 'click') { // click:<選擇器>:<x 比例>，真的用滑鼠點在元素寬度的某個比例
          const j = arg.lastIndexOf(':'); const sel = arg.slice(0, j); const fx = +arg.slice(j + 1);
          const p = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const b=e.getBoundingClientRect();return {x:b.left+b.width*${fx},y:b.top+b.height/2}})()`);
          if (!p) throw new Error('找不到 ' + sel);
          for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
        }
```

- [ ] **Step 2: 跑 driver 確認目前沒有評分區（失敗）**

先在 `proto/v1` 內背景執行 `python3 -m http.server 8010 --bind 127.0.0.1`。

Run: `node .superpowers/sdd/2026-10-16-critieat-store-rating/drive-rating.js .superpowers/sdd/2026-10-16-critieat-store-rating http://127.0.0.1:8010/index.html?store=R003 u0 1440 900 info:U0`
Expected: `U0 => {"rate":null,...}`

- [ ] **Step 3: 實作 `proto/v1/js/rating-ui.js`**

```js
(function (CE) {
  'use strict';

  // 店家詳情的評分區塊。資料在 rating-store.js、邏輯在 rating.js；身分與成員名單共用開團單（lunch-store.js）。
  // 還沒存的星數與短評、是否正在換身分、刪除確認都留在模組裡，
  // 所以詳情因為其他原因重畫（例如再點一次同一家店）時，正在填的內容不會不見。
  const SAVE_FAILED = '無法儲存到這台電腦的瀏覽器';

  const state = {
    db: { ratings: [] },
    warning: null,
    members: [],
    me: '',
    draft: null,          // { storeId, member, stars: number | null, comment }
    switching: false,     // 正在換身分
    confirmDelete: false,
    error: null,
  };

  // 所有使用者資料一律用 textContent 寫入，不用 innerHTML
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

  function init(now) {
    const r = CE.ratingStore.load(now);
    state.db = r.db;
    state.warning = r.warning;
    state.members = CE.lunchStore.peekMembers();
    const me = CE.lunchStore.getMe();
    state.me = state.members.includes(me) ? me : ''; // 名字不在名單裡就當作還沒選
  }

  function summary(storeId) {
    return CE.rating.summary(state.db.ratings, storeId);
  }

  // 換店或換身分時，表單改帶入這個人在這家店的評分
  function ensureDraft(storeId) {
    const d = state.draft;
    if (d && d.storeId === storeId && d.member === state.me) return;
    const mine = state.me ? CE.rating.find(state.db, storeId, state.me) : null;
    state.draft = { storeId, member: state.me, stars: mine ? mine.stars : null, comment: mine ? mine.comment : '' };
    state.confirmDelete = false;
    state.error = null;
  }

  // 存得進去才更新資料與畫面；存不進去就留著表單內容並顯示錯誤
  function commitDb(db, rebuild, onChange) {
    if (!CE.ratingStore.save(db)) { state.error = SAVE_FAILED; rebuild(); return; }
    state.db = db;
    state.warning = null;
    state.error = null;
    state.draft = null;
    state.confirmDelete = false;
    onChange();
  }

  // 半星選擇器：點星星左半邊是 n − 0.5、右半邊是 n；滑鼠移上去預覽；← → 每次調 0.5
  function starPicker(initial, onPick) {
    let current = initial;
    const wrap = el('div', 'stars');
    const row = el('div', 'stars__row');
    row.tabIndex = 0;
    row.setAttribute('role', 'slider');
    row.setAttribute('aria-label', '星等');
    row.setAttribute('aria-valuemin', '0.5');
    row.setAttribute('aria-valuemax', '5');
    const stars = [1, 2, 3, 4, 5].map(n => {
      const s = el('span', 'star', '★');
      s.dataset.n = String(n);
      s.setAttribute('aria-hidden', 'true');
      row.append(s);
      return s;
    });
    const label = el('span', 'stars__value mono');
    wrap.append(row, label);

    function paint(v) {
      stars.forEach((s, i) => {
        s.classList.toggle('is-full', v != null && v >= i + 1);
        s.classList.toggle('is-half', v === i + 0.5);
      });
      label.textContent = v == null ? '點星星評分' : CE.rating.formatStars(v);
    }
    function setAria(v) {
      if (v == null) return;
      row.setAttribute('aria-valuenow', String(v));
      row.setAttribute('aria-valuetext', CE.rating.formatStars(v) + ' 星');
    }
    function commit(v) {
      current = v;
      setAria(v);
      paint(v);
      onPick(v);
    }
    function valueAt(e) {
      const s = e.target.closest('.star');
      if (!s) return null;
      const rect = s.getBoundingClientRect();
      const n = Number(s.dataset.n);
      return e.clientX - rect.left < rect.width / 2 ? n - 0.5 : n;
    }

    row.addEventListener('click', e => { const v = valueAt(e); if (v != null) commit(v); });
    row.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return; // 手機不依賴 hover
      const v = valueAt(e);
      if (v != null) paint(v);
    });
    row.addEventListener('pointerleave', () => paint(current));
    row.addEventListener('keydown', e => {
      const step = { ArrowLeft: -0.5, ArrowDown: -0.5, ArrowRight: 0.5, ArrowUp: 0.5 }[e.key];
      if (!step) return;
      e.preventDefault();
      const next = current == null ? 0.5 : current + step;
      commit(Math.min(5, Math.max(0.5, next)));
    });

    setAria(current);
    paint(current);
    return wrap;
  }

  function identity(rebuild) {
    const p = el('p', 'rate__me');
    p.append('以 ', el('b', null, state.me), ' 身分評分');
    p.append(button('rate__link', '切換', () => { state.switching = true; rebuild(); }));
    return p;
  }

  function whoPicker(rebuild) {
    const box = el('div', 'rate__pick');
    box.append(el('span', null, state.me ? '換成：' : '你是誰？'));
    const sel = el('select', 'rate__select');
    sel.setAttribute('aria-label', '選擇你的名字');
    sel.append(new Option('選擇名字', ''));
    state.members.forEach(m => sel.append(new Option(m, m, false, m === state.me)));
    sel.addEventListener('change', () => {
      if (!sel.value) return;
      state.me = sel.value;
      state.switching = false;
      CE.lunchStore.setMe(sel.value); // 和開團單同步
      rebuild();
    });
    box.append(sel);
    if (state.me) box.append(button('rate__link', '取消', () => { state.switching = false; rebuild(); }));
    return box;
  }

  function form(store, rebuild, onChange) {
    const d = state.draft;
    const mine = CE.rating.find(state.db, store.id, state.me);
    const box = el('div', 'rate__form');

    function save() {
      if (d.stars == null) return;
      commitDb(CE.rating.upsert(state.db, {
        storeId: store.id, member: state.me, stars: d.stars,
        comment: CE.rating.normalizeComment(d.comment), updatedAt: new Date().toISOString(),
      }), rebuild, onChange);
    }

    const submit = button('btn btn--primary', mine ? '更新' : '儲存', save);
    submit.disabled = d.stars == null;
    const stars = starPicker(d.stars, v => { d.stars = v; submit.disabled = false; });

    const field = el('div', 'rate__field');
    const input = el('input', 'rate__input');
    input.type = 'text';
    input.maxLength = CE.rating.MAX_COMMENT;
    input.placeholder = '短評（選填）';
    input.value = d.comment;
    input.setAttribute('aria-label', '短評');
    const count = el('span', 'rate__count mono');
    const showCount = () => { count.textContent = `${input.value.length}/${CE.rating.MAX_COMMENT}`; };
    input.addEventListener('input', () => { d.comment = input.value; showCount(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing && !submit.disabled) save(); // 中文選字中的 Enter 不送出
    });
    showCount();
    field.append(input, count);

    const btns = el('div', 'rate__btns');
    btns.append(submit);
    if (mine) {
      btns.append(button(
        'btn btn--danger' + (state.confirmDelete ? ' is-confirm' : ''),
        state.confirmDelete ? '確定刪除？' : '刪除我的評分',
        () => {
          if (!state.confirmDelete) { state.confirmDelete = true; rebuild(); return; }
          commitDb(CE.rating.remove(state.db, store.id, state.me), rebuild, onChange);
        }
      ));
    }

    box.append(stars, field, btns);
    if (state.error) {
      const err = el('p', 'rate__error', state.error);
      err.setAttribute('role', 'alert');
      box.append(err);
    }
    return box;
  }

  function section(store, onChange) {
    ensureDraft(store.id);
    const box = el('section', 'rate');
    box.setAttribute('aria-label', '評分');
    const rebuild = () => box.replaceWith(section(store, onChange));

    const s = summary(store.id);
    const head = el('div', 'rate__head');
    head.append(
      el('h4', 'rate__title', '評分'),
      el('span', 'rate__avg', s ? `★ ${CE.rating.formatStars(s.avg)} · ${s.count} 人` : '還沒有人評分')
    );
    box.append(head);
    if (state.warning) box.append(el('p', 'rate__warn', state.warning));

    if (state.me && !state.switching) box.append(identity(rebuild), form(store, rebuild, onChange));
    else box.append(whoPicker(rebuild));

    const list = CE.rating.others(state.db, store.id, state.me);
    if (list.length) {
      const ul = el('ul', 'rate__list');
      list.forEach(r => {
        const li = el('li', 'rate__row');
        li.append(
          el('span', 'rate__who', r.member),
          el('span', 'rate__stars', '★ ' + CE.rating.formatStars(r.stars)),
          el('span', 'rate__comment', r.comment),
          el('span', 'rate__date mono', CE.rating.dateLabel(r.updatedAt))
        );
        ul.append(li);
      });
      box.append(ul);
    }
    return box;
  }

  CE.ratingUi = { init, summary, section };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 4: 改 `proto/v1/js/app.js`**

`renderList` 的 meta 改成：

```js
      const rating = CE.ratingUi.summary(v.id);
      const meta = [
        v.category, CE.formatDistance(v.distance), v.todayHours || '營業時間未填',
        rating && `★ ${CE.rating.formatStars(rating.avg)} (${rating.count})`,
      ].filter(Boolean).join(' · ');
```

`renderDetail` 在 `if (v.note) box.append(...)` 之後、`const btns = ...` 之前加：

```js
    box.append(CE.ratingUi.section(v, onRatingChange));
```

在 `renderDetail` 函式後面加：

```js
  // 評分存好或刪掉後，列表平均與詳情一起更新；詳情維持原本捲動位置（手機抽屜裡評分區在下面）
  function onRatingChange() {
    const box = document.getElementById('detail');
    const top = box.scrollTop;
    renderList();
    renderDetail();
    box.scrollTop = top;
  }
```

`init` 在 `state.all = CE.buildViewModel(...)` 之後加：

```js
    CE.ratingUi.init(new Date());
```

- [ ] **Step 5: 改 `proto/v1/index.html`**

`<script src="js/lunch.js"></script>` 後面加 `<script src="js/lunch-demo.js"></script>`；`<script src="js/pick-lightbox.js"></script>` 後面、`app.js` 前面加：

```html
  <script src="js/rating.js"></script>
  <script src="js/rating-demo.js"></script>
  <script src="js/rating-store.js"></script>
  <script src="js/rating-ui.js"></script>
```

- [ ] **Step 6: `proto/v1/css/style.css` 末段加**

```css
/* 店家評分（index.html 店家詳情） */
.rate { --star: #f59e0b; --star-off: #e5e7eb; --star-ink: #b45309; display: flex; flex-direction: column; gap: 10px; padding-top: 12px; border-top: 1px solid var(--line); }
.rate__head { display: flex; align-items: baseline; gap: 10px; }
.rate__title { margin: 0; font-size: 14px; font-weight: 800; }
.rate__avg { font-size: 13px; font-weight: 700; color: var(--star-ink); }
.rate__warn { margin: 0; font-size: 12.5px; font-weight: 700; padding: 8px 12px; border-radius: 10px; background: var(--yellow-bg); color: var(--yellow-ink); }
.rate__me { margin: 0; font-size: 13px; color: var(--muted); }
.rate__me b { color: var(--ink); }
.rate__link { border: 0; background: none; padding: 0 0 0 8px; font: inherit; font-size: 12.5px; color: var(--cyan-ink); text-decoration: underline; cursor: pointer; }
.rate__pick { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 13px; }
.rate__select { font: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
.rate__form { display: flex; flex-direction: column; gap: 10px; }
.stars { display: flex; align-items: center; gap: 10px; }
.stars__row { display: flex; border-radius: 8px; outline: none; cursor: pointer; user-select: none; touch-action: manipulation; }
.stars__row:focus-visible { box-shadow: 0 0 0 3px rgba(0, 240, 255, .35); }
.star { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 28px; line-height: 1; color: var(--star-off); }
.star.is-full { color: var(--star); }
.star.is-half { background: linear-gradient(90deg, var(--star) 50%, var(--star-off) 50%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.stars__value { font-size: 13px; color: var(--muted); }
.rate__field { position: relative; }
.rate__input { box-sizing: border-box; width: 100%; font: inherit; font-size: 13px; padding: 8px 56px 8px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; outline: none; }
.rate__input:focus { border-color: var(--cyan); }
.rate__count { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 11px; color: var(--faint); pointer-events: none; }
.rate__btns { display: flex; flex-wrap: wrap; gap: 8px; }
.rate__error { margin: 0; font-size: 12.5px; font-weight: 700; color: #b91c1c; }
.rate__list { list-style: none; margin: 0; padding: 10px 0 0; display: flex; flex-direction: column; gap: 6px; border-top: 1px dashed var(--line); }
.rate__row { display: grid; grid-template-columns: auto auto 1fr auto; gap: 8px; align-items: baseline; font-size: 13px; }
.rate__who { font-weight: 700; }
.rate__stars { color: var(--star-ink); font-weight: 700; white-space: nowrap; }
.rate__comment { color: var(--muted); overflow-wrap: anywhere; }
.rate__date { font-size: 11px; color: var(--faint); }
```

- [ ] **Step 7: 跑 UI 流程（桌機 1440）**

`D=.superpowers/sdd/2026-10-16-critieat-store-rating`、`U=http://127.0.0.1:8010/index.html`；以下每組各跑一次（每次是乾淨的瀏覽器設定檔）。設定選單的 js 片段：`SEL=js:(()=>{const s=document.querySelector('.rate__select');s.value='小明';s.dispatchEvent(new Event('change'))})()`

U1–U6 主流程（同一次執行）：

```bash
node $D/drive-rating.js $D "$U?store=R003" main 1440 900 \
  info:U1-未選身分 "$SEL" info:U2-已選身分 \
  "val:document.querySelector('.rate .btn--primary').disabled" \
  "click:.star[data-n=\"4\"]:0.25" \
  "js:(()=>{const i=document.querySelector('.rate__input');i.value='咖哩很香';i.dispatchEvent(new Event('input'))})()" \
  "js:document.querySelector('.rate .btn--primary').click()" info:U3-存好 shot:U3-desktop \
  "val:localStorage.getItem('critieat.me')" \
  reload info:U4-重新整理 \
  "js:document.querySelector('.stars__row').focus()" \
  "js:['ArrowRight','ArrowRight'].forEach(k=>document.querySelector('.stars__row').dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true})))" \
  "js:document.querySelector('.rate .btn--primary').click()" info:U5-鍵盤改4.5 \
  "js:document.querySelector('.rate .btn--danger').click()" info:U6a-確認 \
  "js:document.querySelector('.rate .btn--danger').click()" info:U6b-刪掉
```

Expected:
- U1：`rate` 含「還沒有人評分」「你是誰？」；`meta` 沒有 `★`
- U2：含「以 / 小明 / 身分評分」「點星星評分」；`disabled` 為 `true`
- U3：含「★ 3.5 · 1 人」「更新」「刪除我的評分」；`meta` 結尾 `★ 3.5 (1)`；`critieat.me` 為 `"小明"`
- U4：仍是「★ 3.5 · 1 人」，`input` 為 `咖哩很香`，按鈕「更新」
- U5：「★ 4.5 · 1 人」
- U6a：含「確定刪除？」；U6b：「還沒有人評分」、`meta` 沒有 `★`、表單回到「儲存」
- 沒有 `EXC` 或與評分有關的 `CONSOLE error`（`RefererNotAllowedMapError` 不算）

U7 其他人的評分（R005，小明有示範評分 4.5）：

```bash
node $D/drive-rating.js $D "$U?store=R005" others 1440 900 "$SEL" info:U7 shot:U7-desktop
```

Expected：「★ 4.5 · 4 人」；表單帶入 `4.5`、按鈕「更新」；列表 3 行依序 阿翔、阿凱、小芳，不含小明

- [ ] **Step 8: 跑 Review Focus 檢查**

```bash
# RF1 重畫保留草稿、換店改帶那家店的評分
node $D/drive-rating.js $D "$U?store=R003" rf1 1440 900 "$SEL" \
  "click:.star[data-n=\"2\"]:0.75" \
  "js:(()=>{const i=document.querySelector('.rate__input');i.value='未存';i.dispatchEvent(new Event('input'))})()" \
  "js:document.querySelector('.item[data-id=\"R003\"]').click()" info:RF1a-同店重畫 \
  "js:document.querySelector('.item[data-id=\"R006\"]').click()" info:RF1b-換店
# RF2 身分不在名單裡
node $D/drive-rating.js $D "$U?store=R003" rf2 1440 900 \
  "js:localStorage.setItem('critieat.me','不存在的人')" reload info:RF2
# RF3 存不進去
node $D/drive-rating.js $D "$U?store=R003" rf3 1440 900 "$SEL" \
  "js:Storage.prototype.setItem=function(){throw new Error('quota')}" \
  "click:.star[data-n=\"3\"]:0.75" \
  "js:(()=>{const i=document.querySelector('.rate__input');i.value='存不進去';i.dispatchEvent(new Event('input'))})()" \
  "js:document.querySelector('.rate .btn--primary').click()" info:RF3
# RF4 資料壞掉
node $D/drive-rating.js $D "$U?store=R005" rf4 1440 900 \
  "js:localStorage.setItem('critieat.ratings.v1','{bad')" reload info:RF4
```

Expected:
- RF1a：`stars__value` 仍是 `2.0`（`rate` 內含 `2.0`），`input` 為 `未存`
- RF1b：「★ 3.5 · 3 人」，表單帶入小明在 R006 的 `4.0`、`input` 為 `酸辣湯推`
- RF2：含「你是誰？」，沒有「身分評分」
- RF3：含「無法儲存到這台電腦的瀏覽器」、仍是「還沒有人評分」、`input` 為 `存不進去`
- RF4：含「本機評分資料無法讀取，已載入示範資料」、「★ 4.5 · 4 人」

- [ ] **Step 9: 手機（390）**

```bash
node $D/drive-rating.js $D "$U?store=R005" phone 390 844 "$SEL" \
  "js:document.querySelector('#detail').scrollTop=9999" info:M1 shot:M1-phone
```

Expected：`overflow` 為 `false`、`starPx` ≥ 32；看截圖：評分區在抽屜內完整可見、名字／星數／短評／日期排列不擠壓

- [ ] **Step 10: 看截圖與程式碼**

讀 `U3-desktop.png`、`U7-desktop.png`、`M1-phone.png` 確認版面（半星顯示一半金色、列表卡片 `★` 那段不換行破版）。確認 `rating-ui.js` 的 Enter 有 `!e.isComposing`。

- [ ] **Step 11: 記進度、收尾**

停掉 8010 伺服器。`progress.md` 加：`- [x] Task 3 rating-ui + app 接線 — U1–U7、RF1–RF4、M1 通過`，附截圖檔名。

---

## 完成後

請使用者在自己的 `http://localhost:8000/` 打開美食地圖看評分（第一次載入會寫入示範評分；R002/R004/R005/R006/R009 有評分）。
