# CRITIEAT 品項評分原型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 菜單燈箱每列可以評分（列內展開、表格多一欄平均、「我 ★n」、上方「大家推」），開團單已收單卡片「自己點的」每列也能評同一筆品項評分。這是品項評分 spec 的計畫 ②（計畫 ① 點餐連品項已完成）。

**Architecture:** 店家評分的邏輯與表單抽成可共用的零件：`rating.js` 改成 `CE.ratingKit(field)`（店家用 `storeId`、品項用 `itemId`），`rating-store.js` 改成工廠產生兩個 store，半星選擇器抽到 `star-picker.js`，表單本體（選身分、星星、短評、儲存、刪除、其他人的評分）抽到 `rating-form.js`。`rating-ui.js`（店家）與新的 `item-rating-ui.js`（品項）都只是在共用表單外面包一層。燈箱與開團單只負責「哪一列展開」與重畫。順便讓 `menu-data.js` 快取讀到的菜單，避免每次查品項都重新解析含照片的整份 localStorage。

**Tech Stack:** HTML5、CSS、原生 JavaScript（ES2020）、IIFE 掛 `globalThis.CE`；檢查用 node 18（`vm`）＋ headless Chrome（CDP）。

**Spec:** `docs/specs/2026-10-16-critieat-item-rating-design.md`（本計畫涵蓋「品項評分」「平均與大家推」「② 菜單燈箱」「② 開團單：點過的來評分」）

## Global Constraints

- 品項評分：每人每品項一筆（唯一鍵 `(itemId, member)`），可修改、可刪除；0.5～5 星每 0.5 一級；短評選填、去前後空白、最多 50 字；`updatedAt` ISO
- 品項評分另存 `storeId`、`itemName`、`itemNote`（評分當時的快照，每次儲存更新）
- localStorage `critieat.itemRatings.v1` = `{ ratings: ItemRating[] }`；格式壞掉提示「本機品項評分資料無法讀取，已載入示範資料」；存不進去提示「無法儲存到這台電腦的瀏覽器」
- 平均：四捨五入到小數 1 位、固定顯示 1 位小數、一律顯示人數；沒有評分顯示 `—`
- 大家推：該店目前菜單上平均 ≥ 4.0，依平均高→低、同分人數多→少、再同分照菜單順序，取前 3；沒有就整排不顯示
- 燈箱：點列展開／收起、同時只展開一列、存檔後面板維持展開
- 開團單：只在 `status === 'closed'` 的卡片、只在自己點的列；`menuItemId` 對得到菜單 → 用菜單品項；`menuItemId` 對不到（下架）→ 仍可評，用點餐列品名／備註當快照；沒有 `menuItemId` → `CE.menuData.matchItem`；都對不上不顯示按鈕
- 同一道在燈箱或開團單評，都是同一筆
- 店家評分的行為完全不變（`check-rating.js`、`check-rating-store.js`、店家評分 UI 流程全部照舊通過）
- 所有資料以 `textContent` 寫入，禁止 `innerHTML`；不用 `alert` / `confirm` / `prompt`；星星點擊區至少 32px；手機 ≤900px 可完整操作
- **不得引入任何測試框架**；**不做 git 操作**；進度記在 `.superpowers/sdd/2026-10-16-critieat-item-rating/progress.md`

## Review Focus

1. **在開團單頁用不同身分評分** → 面板用的是頁面目前的身分；面板不提供「切換」（身分由頁面右上角管理），避免兩邊不同步。由 Task 6 的 `L4`（阿傑）、`L1b`（小明，無「切換」）覆蓋
2. **在燈箱評了一道，背後的開團單卡片** → 關掉燈箱就看到那列變成「我 ★n」，不用重新整理。由 Task 6 的 `L1c` 覆蓋
3. **評分存好後燈箱重畫** → 捲動位置不跳回頂端、同一列仍展開、「大家推」同步更新。由 Task 5 的 `I2` 覆蓋
4. **抽出共用表單後，店家評分** → 原本 U1–U7、RF1–RF4 全部照舊。由 Task 4 的回歸覆蓋
5. **菜單快取後，菜單被存檔／刪除／還原** → 馬上讀到新的，不會拿到舊快取。由 Task 3 的檢查、Task 5 的 `I6` 覆蓋

---

## 檔案結構

| 檔案 | 動作 | 負責 |
|---|---|---|
| `proto/v1/js/rating.js` | 修改 | `CE.ratingKit(field, extraValid)`；`CE.rating`（店家）、`CE.itemRating`（品項，含 `top`） |
| `proto/v1/js/rating-store.js` | 修改 | `makeStore` 工廠；`CE.ratingStore`、`CE.itemRatingStore` |
| `proto/v1/js/item-rating-demo.js` | 新增 | `CE.itemRatingDemo(now)` |
| `proto/v1/js/menu-data.js` | 修改 | 讀取快取 |
| `proto/v1/js/star-picker.js` | 新增 | `CE.starPicker(initial, onPick)`（從 `rating-ui.js` 搬出） |
| `proto/v1/js/rating-form.js` | 新增 | `CE.ratingForm({ kit, store, field })` 共用表單 |
| `proto/v1/js/rating-ui.js` | 修改 | 店家評分改用 `rating-form.js` |
| `proto/v1/js/item-rating-ui.js` | 新增 | `CE.itemRatingUi`：`badge`、`mineLabel`、`summary`、`top`、`panel` |
| `proto/v1/js/menu-lightbox.js` | 修改 | 表格評分欄、「我」標記、大家推、列內展開 |
| `proto/v1/js/lunch-app.js` | 修改 | 已收單卡片自己點的列加評分按鈕與面板 |
| `proto/v1/index.html`、`proto/v1/lunch.html` | 修改 | 載入新檔案 |
| `proto/v1/css/style.css` | 修改 | 品項評分樣式 |

Spec 的模組表列了 `item-rating-store.js`；本計畫改成在 `rating-store.js` 用工廠產生（兩個 store 只差 key、提示文字、驗證與示範資料），避免複製整份檔案。

檢查工具（不屬於專案）：
- `<scratchpad>/itemrating/check-item-rating.js`、`check-menu-cache.js`；沿用 `<scratchpad>/rating/check-rating.js`、`check-rating-store.js`
- `.superpowers/sdd/2026-10-16-critieat-item-rating/drive-item.js`（由 `drive-link.js` 複製改寫）、`progress.md`、截圖
- 店家評分回歸用 `.superpowers/sdd/2026-10-16-critieat-store-rating/drive-rating.js`

`<scratchpad>` = `/private/tmp/claude-501/-Users-critical-Documents-critieat/68572742-9d17-4b59-9053-b1b68c2e86da/scratchpad`

檢查用伺服器：在 `proto/v1` 內 `python3 -m http.server 8010 --bind 127.0.0.1`。

---

### Task 1: `rating.js` 參數化（`ratingKit`、`itemRating`、`top`）

**Files:**
- Modify: `proto/v1/js/rating.js`（整檔改寫）
- Test: `<scratchpad>/itemrating/check-item-rating.js`；回歸 `<scratchpad>/rating/check-rating.js`

**Interfaces:**
- Produces:
  - `CE.ratingKit(field: 'storeId' | 'itemId', extraValid?: (r) → boolean) → Kit`
  - `Kit = { MAX_COMMENT, isValidStars, isValidRating, isValidDb, normalizeComment, summary(ratings, id), formatStars, find(db, id, member), others(db, id, exclude), upsert(db, rating), remove(db, id, member), dateLabel, top(ratings, items, min, n) }`
  - `CE.rating = ratingKit('storeId')`（對外行為與現在完全相同）
  - `CE.itemRating = ratingKit('itemId', r => storeId/itemName 非空字串、itemNote 是字串)`
  - `top(ratings, items: { id }[], min: number, n: number) → { item, avg, count }[]`

- [ ] **Step 1: 寫檢查腳本（會失敗）**

`<scratchpad>/itemrating/check-item-rating.js`：

```js
// 一次性檢查（不屬於專案）：node check-item-rating.js
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ROOT = '/Users/critical/Documents/critieat/proto/v1/js/';
const ctx = { console, Intl, Date, Math, JSON }; ctx.globalThis = ctx; vm.createContext(ctx);
['rating.js'].forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
const R = ctx.CE.itemRating;
const plain = v => JSON.parse(JSON.stringify(v));
const T = '2026-10-16T05:00:00.000Z';
const ir = (itemId, member, stars, extra = {}) => Object.assign(
  { storeId: 'R002', itemId, itemName: '魯肉飯', itemNote: '大', member, stars, comment: '', updatedAt: T }, extra);

// 驗證：快照欄位必填
assert(R.isValidRating(ir('R002-02', '小明', 4.5)));
assert(!R.isValidRating(ir('R002-02', '小明', 4.5, { itemName: '' })), '沒有品名');
assert(!R.isValidRating(ir('R002-02', '小明', 4.5, { storeId: '' })), '沒有店家');
assert(!R.isValidRating(ir('R002-02', '小明', 4.5, { itemNote: null })), '備註要是字串');
assert(!R.isValidRating(ir('', '小明', 4.5)), '沒有品項');
assert(R.isValidRating(ir('R002-02', '小明', 4.5, { itemNote: '' })), '備註可以空白');

// 唯一鍵是 (itemId, member)：同一人不同品項可以、同一品項同一人不行
assert(R.isValidDb({ ratings: [ir('R002-01', '小明', 4), ir('R002-02', '小明', 5)] }));
assert(!R.isValidDb({ ratings: [ir('R002-02', '小明', 4), ir('R002-02', '小明', 5)] }));

// upsert 取代、快照更新；remove
const db0 = { ratings: [ir('R002-02', '小明', 4), ir('R002-02', '阿傑', 5)] };
const db1 = R.upsert(db0, ir('R002-02', '小明', 3.5, { itemName: '魯肉飯（新）' }));
assert.strictEqual(db1.ratings.length, 2);
assert.strictEqual(R.find(db1, 'R002-02', '小明').itemName, '魯肉飯（新）');
assert.strictEqual(R.find(db0, 'R002-02', '小明').stars, 4, '不改舊物件');
assert.strictEqual(R.remove(db1, 'R002-02', '小明').ratings.length, 1);
assert.deepStrictEqual(plain(R.summary(db0.ratings, 'R002-02')), { avg: 4.5, count: 2 });
assert.deepStrictEqual(plain(R.others(db0, 'R002-02', '小明').map(r => r.member)), ['阿傑']);

// 大家推：≥ 4.0、平均高→低、同分人數多→少、再同分照菜單順序、取前 3
const items = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id }));
const rs = [
  ir('a', 'x', 4), ir('a', 'y', 4),          // 4.0 (2)
  ir('b', 'x', 5),                            // 5.0 (1)
  ir('c', 'x', 3.5), ir('c', 'y', 4),         // 3.8 不到 4
  ir('d', 'x', 4),                            // 4.0 (1)
  ir('e', 'x', 4.5), ir('e', 'y', 4.5),       // 4.5 (2)
  ir('f', 'x', 4), ir('f', 'y', 4),           // 4.0 (2)，菜單順序在 a 後面
  ir('zz', 'x', 5),                           // 不在菜單上（下架）不算
];
assert.deepStrictEqual(plain(R.top(rs, items, 4, 3).map(x => [x.item.id, x.avg, x.count])), [['b', 5, 1], ['e', 4.5, 2], ['a', 4, 2]]);
assert.deepStrictEqual(plain(R.top(rs, items, 4, 10).map(x => x.item.id)), ['b', 'e', 'a', 'f', 'd']);
assert.deepStrictEqual(plain(R.top([ir('c', 'x', 3)], items, 4, 3)), []);

// 店家評分的 kit 不受影響（唯一鍵仍是 storeId）
const S = ctx.CE.rating;
const sr = (storeId, member) => ({ storeId, member, stars: 4, comment: '', updatedAt: T });
assert(S.isValidDb({ ratings: [sr('R1', '小明'), sr('R2', '小明')] }));
assert(!S.isValidDb({ ratings: [sr('R1', '小明'), sr('R1', '小明')] }));
assert(typeof ctx.CE.ratingKit === 'function');

console.log('check-item-rating: all passed');
```

- [ ] **Step 2: 跑檢查確認失敗**

Run: `node <scratchpad>/itemrating/check-item-rating.js`
Expected: FAIL，`TypeError: Cannot read properties of undefined (reading 'isValidRating')`

- [ ] **Step 3: 改寫 `proto/v1/js/rating.js`**

```js
(function (CE) {
  'use strict';

  // 評分純邏輯：不碰 DOM、不碰 localStorage。店家評分與品項評分共用，差在「評分對象」欄位。
  // 操作都是「舊的 db → 新的 db」，不修改傳入的物件。db: { ratings: Rating[] }
  // Rating: { [field], member, stars（0.5～5、每 0.5 一級）, comment（最多 50 字，可為空字串）, updatedAt（ISO）, ...其他欄位 }
  //   店家評分 field = 'storeId'；品項評分 field = 'itemId'，另有 storeId、itemName、itemNote（評分當時的快照）
  // 字數以字串長度計，和 <input maxlength> 一致。

  const MAX_COMMENT = 50;

  function isValidStars(v) {
    return typeof v === 'number' && v >= 0.5 && v <= 5 && Number.isInteger(v * 2);
  }

  function normalizeComment(v) {
    return String(v == null ? '' : v).trim();
  }

  function formatStars(n) {
    return n.toFixed(1);
  }

  // 台灣時間 'MM/DD'
  function dateLabel(iso) {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(iso));
    const get = t => p.find(x => x.type === t).value;
    return get('month') + '/' + get('day');
  }

  function ratingKit(field, extraValid) {
    const str = v => typeof v === 'string';
    const keyOf = r => r[field] + '\n' + r.member;

    function isValidRating(r) {
      return !!r && typeof r === 'object' &&
        str(r[field]) && r[field] !== '' && str(r.member) && r.member !== '' &&
        isValidStars(r.stars) && str(r.comment) && r.comment.length <= MAX_COMMENT &&
        str(r.updatedAt) && !Number.isNaN(Date.parse(r.updatedAt)) &&
        (!extraValid || extraValid(r));
    }

    // 每筆格式正確，而且同一人對同一個對象最多一筆
    function isValidDb(db) {
      if (!db || typeof db !== 'object' || !Array.isArray(db.ratings)) return false;
      if (!db.ratings.every(isValidRating)) return false;
      return new Set(db.ratings.map(keyOf)).size === db.ratings.length;
    }

    // 平均四捨五入到小數 1 位。星數都是 0.5 的倍數，先換成「半星數」的整數再算，避免浮點誤差
    function summary(ratings, id) {
      const list = ratings.filter(r => r[field] === id);
      if (list.length === 0) return null;
      const halves = list.reduce((sum, r) => sum + Math.round(r.stars * 2), 0);
      return { avg: Math.round(halves * 5 / list.length) / 10, count: list.length };
    }

    function find(db, id, member) {
      return db.ratings.find(r => r[field] === id && r.member === member) || null;
    }

    // 該對象其他人的評分，新到舊；exclude 傳空字串表示全部
    function others(db, id, exclude) {
      return db.ratings
        .filter(r => r[field] === id && r.member !== exclude)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    }

    function upsert(db, rating) {
      if (!isValidRating(rating)) throw new Error('評分格式不正確');
      const key = keyOf(rating);
      return { ratings: db.ratings.filter(r => keyOf(r) !== key).concat([Object.assign({}, rating)]) };
    }

    function remove(db, id, member) {
      return { ratings: db.ratings.filter(r => !(r[field] === id && r.member === member)) };
    }

    // 大家推：items（照菜單順序）中平均 ≥ min 的，平均高→低、人數多→少、菜單順序，取前 n
    function top(ratings, items, min, n) {
      return items
        .map((item, i) => ({ item, i, s: summary(ratings, item.id) }))
        .filter(x => x.s && x.s.avg >= min)
        .sort((a, b) => b.s.avg - a.s.avg || b.s.count - a.s.count || a.i - b.i)
        .slice(0, n)
        .map(x => ({ item: x.item, avg: x.s.avg, count: x.s.count }));
    }

    return {
      MAX_COMMENT, isValidStars, isValidRating, isValidDb, normalizeComment,
      summary, formatStars, find, others, upsert, remove, dateLabel, top,
    };
  }

  CE.ratingKit = ratingKit;
  CE.rating = ratingKit('storeId');
  CE.itemRating = ratingKit('itemId', r =>
    typeof r.storeId === 'string' && r.storeId !== '' &&
    typeof r.itemName === 'string' && r.itemName !== '' && typeof r.itemNote === 'string');
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 4: 跑檢查確認通過（含店家評分回歸）**

Run: `node <scratchpad>/itemrating/check-item-rating.js && node <scratchpad>/rating/check-rating.js && node <scratchpad>/rating/check-rating-store.js`
Expected: 三行 `all passed`

- [ ] **Step 5: 記進度**：`Task 1: complete (...)`

---

### Task 2: 儲存工廠與品項評分示範資料

**Files:**
- Modify: `proto/v1/js/rating-store.js`（整檔改寫）
- Create: `proto/v1/js/item-rating-demo.js`
- Test: 在 `<scratchpad>/itemrating/check-item-rating.js` 後面接一段；回歸 `check-rating-store.js`

**Interfaces:**
- Consumes: Task 1 的 `CE.rating.isValidDb`、`CE.itemRating.isValidDb`
- Produces: `CE.ratingStore`、`CE.itemRatingStore`（皆為 `{ load(now) → { db, warning }, save(db) → boolean }`）；`CE.itemRatingDemo(now) → { ratings }`

- [ ] **Step 1: 檢查腳本加一段（會失敗）**

另存 `<scratchpad>/itemrating/check-item-store.js`：

```js
// 一次性檢查（不屬於專案）：node check-item-store.js
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ROOT = '/Users/critical/Documents/critieat/proto/v1/js/';
const KEY = 'critieat.itemRatings.v1';
const BROKEN = '本機品項評分資料無法讀取，已載入示範資料';
function memStorage(init = {}) {
  const s = Object.assign({}, init);
  return { s, getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; } };
}
function boot(localStorage) {
  const ctx = { console, Intl, Date, Math, JSON, localStorage }; ctx.globalThis = ctx; vm.createContext(ctx);
  ['hours.js', 'lunch.js', 'lunch-demo.js', 'menu-demo.js', 'menu-data.js', 'rating.js', 'rating-demo.js', 'item-rating-demo.js', 'rating-store.js']
    .forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
  return ctx.CE;
}
const now = new Date('2026-10-16T04:00:00.000Z');

// 示範資料：格式正確；品項都在示範菜單上、快照與菜單一致；成員在開團單名單；有半星、有短評也有沒短評
let CE = boot(memStorage());
const demo = CE.itemRatingDemo(now);
assert(CE.itemRating.isValidDb(demo));
const members = CE.lunchDemo(now).members;
demo.ratings.forEach(r => {
  const it = CE.menuData.findItem(r.storeId, r.itemId);
  assert(it, '品項不存在 ' + r.itemId);
  assert.strictEqual(r.itemName, it.name, r.itemId);
  assert.strictEqual(r.itemNote, it.note, r.itemId);
  assert(members.includes(r.member), '成員不存在 ' + r.member);
});
assert.deepStrictEqual(Array.from(new Set(demo.ratings.map(r => r.storeId))).sort(), ['R002', 'R005', 'R006']);
assert(demo.ratings.some(r => !Number.isInteger(r.stars)) && demo.ratings.some(r => r.comment) && demo.ratings.some(r => !r.comment));
// R002 的大家推（spec mockup）：魯肉飯（大）4.7、控肉飯 4.5、魯肉飯（小）4.0
const top = CE.itemRating.top(demo.ratings, CE.menuData.items('R002'), 4, 3).map(x => [x.item.id, x.avg, x.count]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(top)), [['R002-02', 4.7, 3], ['R002-04', 4.5, 2], ['R002-01', 4, 2]]);
assert(CE.itemRating.find(demo, 'R002-04', '小明'), '小明評過控肉飯（開團單「我 ★」的示範）');
assert(!CE.itemRating.find(demo, 'R002-09', '小明'), '小明沒評過燙青菜（「☆ 評分」的示範）');

// 店家與品項 store 各自獨立
let ls = memStorage(); CE = boot(ls);
assert.strictEqual(CE.itemRatingStore.load(now).warning, null);
assert(CE.itemRating.isValidDb(JSON.parse(ls.s[KEY])), '第一次寫入示範資料');
assert(!('critieat.ratings.v1' in ls.s), '沒碰店家評分');
assert.strictEqual(CE.ratingStore.load(now).warning, null);
assert(CE.rating.isValidDb(JSON.parse(ls.s['critieat.ratings.v1'])));

// 壞掉 → 示範資料＋提示；無法使用 → 示範資料、save false
ls = memStorage({ [KEY]: '{bad' }); CE = boot(ls);
assert.strictEqual(CE.itemRatingStore.load(now).warning, BROKEN);
assert(CE.itemRating.isValidDb(JSON.parse(ls.s[KEY])));
CE = boot({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } });
const r = CE.itemRatingStore.load(now);
assert(CE.itemRating.isValidDb(r.db) && r.warning === null);
assert.strictEqual(CE.itemRatingStore.save(r.db), false);

console.log('check-item-store: all passed');
```

- [ ] **Step 2: 跑檢查確認失敗**

Run: `node <scratchpad>/itemrating/check-item-store.js`
Expected: FAIL，`ENOENT ... item-rating-demo.js`

- [ ] **Step 3: 新增 `proto/v1/js/item-rating-demo.js`**

```js
(function (CE) {
  'use strict';
  // 品項評分示範資料。時間以「現在」往回推。品項 ID 對應 menu-demo.js，成員對應 lunch-demo.js。
  // R002 的「大家推」：魯肉飯（大）4.7、控肉飯 4.5、魯肉飯（小）4.0；小明評過控肉飯、沒評過燙青菜（開團單示範用）。
  CE.itemRatingDemo = function itemRatingDemo(now) {
    const r = (storeId, itemId, itemName, itemNote, member, stars, comment, daysAgo) => ({
      storeId, itemId, itemName, itemNote, member, stars, comment,
      updatedAt: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
    });
    return {
      ratings: [
        r('R002', 'R002-02', '魯肉飯', '大', '阿傑', 5, '大碗很划算', 6),
        r('R002', 'R002-02', '魯肉飯', '大', '阿凱', 4.5, '', 6),
        r('R002', 'R002-02', '魯肉飯', '大', '小婷', 4.5, '肥瘦剛好', 5),
        r('R002', 'R002-04', '控肉飯', '附半顆滷蛋', '小明', 4, '肉很軟', 6),
        r('R002', 'R002-04', '控肉飯', '附半顆滷蛋', '阿傑', 5, '', 5),
        r('R002', 'R002-01', '魯肉飯', '小', '小婷', 4, '', 6),
        r('R002', 'R002-01', '魯肉飯', '小', '阿凱', 4, '', 6),
        r('R002', 'R002-05', '排骨飯', '', '小婷', 3, '排骨有點乾', 6),
        r('R005', 'R005-01', '釜揚烏龍麵', '中碗 / 大碗 +30', '阿翔', 5, '麵很Q', 1),
        r('R005', 'R005-01', '釜揚烏龍麵', '中碗 / 大碗 +30', '小芳', 4, '', 1),
        r('R005', 'R005-03', '明太子奶油烏龍麵', '', '小明', 4.5, '奶油很香', 1),
        r('R005', 'R005-04', '牛肉烏龍麵', '', '阿凱', 3.5, '牛肉偏少', 1),
        r('R005', 'R005-06', '炸蝦天婦羅', '', '小明', 4, '', 1),
        r('R005', 'R005-06', '炸蝦天婦羅', '', '阿翔', 4.5, '', 1),
        r('R006', 'R006-01', '招牌鍋貼', '每顆，10 顆起', '小華', 4, '', 3),
        r('R006', 'R006-01', '招牌鍋貼', '每顆，10 顆起', '阿明', 3.5, '有點油', 3),
        r('R006', 'R006-01', '招牌鍋貼', '每顆，10 顆起', '小明', 4, '', 3),
        r('R006', 'R006-07', '酸辣湯', '', '小明', 4.5, '料很多', 3),
        r('R006', 'R006-04', '韭菜水餃', '每顆', '小美', 4, '', 2),
      ],
    };
  };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 4: 改寫 `proto/v1/js/rating-store.js`**

```js
(function (CE) {
  'use strict';
  // 評分存在瀏覽器 localStorage，處理方式照 lunch-store.js。店家評分與品項評分各一個 store，只差 key、提示、驗證與示範資料。

  // 回傳 { load(now) → { db, warning }, save(db) → boolean }
  function makeStore({ key, broken, isValidDb, demo }) {
    // 回傳字串、null（沒有資料），或 undefined（localStorage 無法使用）
    function read() {
      try { return localStorage.getItem(key); } catch (e) { return undefined; }
    }

    function save(db) {
      try { localStorage.setItem(key, JSON.stringify(db)); return true; } catch (e) { return false; }
    }

    // localStorage 無法使用時只顯示示範資料，按儲存時才會報錯
    function load(now) {
      const raw = read();
      if (raw === undefined) return { db: demo(now), warning: null };
      if (raw !== null) {
        try {
          const db = JSON.parse(raw);
          if (isValidDb(db)) return { db, warning: null };
        } catch (e) { /* 格式壞掉，往下改用示範資料 */ }
      }
      const db = demo(now);
      save(db);
      return { db, warning: raw === null ? null : broken };
    }

    return { load, save };
  }

  CE.ratingStore = makeStore({
    key: 'critieat.ratings.v1',
    broken: '本機評分資料無法讀取，已載入示範資料',
    isValidDb: db => CE.rating.isValidDb(db),
    demo: now => CE.ratingDemo(now),
  });

  CE.itemRatingStore = makeStore({
    key: 'critieat.itemRatings.v1',
    broken: '本機品項評分資料無法讀取，已載入示範資料',
    isValidDb: db => CE.itemRating.isValidDb(db),
    demo: now => CE.itemRatingDemo(now),
  });
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 5: 跑檢查確認通過**

Run: `S=<scratchpad>; node $S/itemrating/check-item-store.js && node $S/itemrating/check-item-rating.js && node $S/rating/check-rating-store.js && node $S/rating/check-rating.js`
Expected: 四行 `all passed`

- [ ] **Step 6: 記進度**：`Task 2: complete (...)`

---

### Task 3: `menu-data.js` 讀取快取

**Files:**
- Modify: `proto/v1/js/menu-data.js`（`loadSaved`、`writeSaved`、`savedMenu`、`saveMenu`、`removeSaved`）
- Test: `<scratchpad>/itemrating/check-menu-cache.js`；回歸 `<scratchpad>/menulink/check-menu-data.js`

**Interfaces:**
- Produces: `CE.menuData` 對外函式不變；同一頁內重複查詢不再重新讀取／解析 localStorage；本頁寫入立即生效；其他分頁寫入透過 `storage` 事件讓快取失效

- [ ] **Step 1: 寫檢查腳本（會失敗）**

`<scratchpad>/itemrating/check-menu-cache.js`：

```js
// 一次性檢查（不屬於專案）：node check-menu-cache.js
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ROOT = '/Users/critical/Documents/critieat/proto/v1/js/';
const KEY = 'critieat.menus.v1';
let reads = 0;
const s = { [KEY]: JSON.stringify({ R003: { updatedAt: '2026-10-16', updatedBy: '小明', sections: [{ name: 'A', items: [{ id: 'R003-01', name: '咖哩飯', price: 120, note: '' }] }] } }) };
const ls = { getItem: k => { reads += 1; return k in s ? s[k] : null; }, setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; } };
const ctx = { console, Date, Math, JSON, localStorage: ls }; ctx.globalThis = ctx; vm.createContext(ctx);
['menu-demo.js', 'menu-data.js'].forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
const M = ctx.CE.menuData;

assert.strictEqual(M.search('R003', '咖哩').length, 1);
const after1 = reads;
for (let i = 0; i < 20; i++) { M.search('R003', '咖'); M.items('R002'); M.hasMenu('R003'); M.matchItem('R003', '咖哩飯', ''); }
assert.strictEqual(reads, after1, '重複查詢不再讀 localStorage');

// 本頁寫入立即生效
assert(M.saveMenu('R003', { updatedAt: '2026-10-17', updatedBy: '小明', sections: [{ name: 'A', items: [{ id: 'R003-02', name: '牛肉咖哩', price: 150, note: '' }] }] }));
assert.strictEqual(M.items('R003')[0].name, '牛肉咖哩');
assert(M.removeSaved('R003'));
assert.strictEqual(M.hasMenu('R003'), false);

// 寫入失敗：快取不能變成沒存進去的內容
ls.setItem = () => { throw new Error('quota'); };
assert.strictEqual(M.saveMenu('R003', { updatedAt: 'x', updatedBy: '', sections: [{ name: 'A', items: [{ id: 'z', name: '不該出現', price: 1, note: '' }] }] }), false);
assert.strictEqual(M.hasMenu('R003'), false, '存失敗就沒有');

// 讀到的物件被外面改到不會汙染快取
ls.setItem = (k, v) => { s[k] = String(v); };
M.saveMenu('R003', { updatedAt: '2026-10-17', updatedBy: '小明', sections: [{ name: 'A', items: [{ id: 'R003-03', name: '雞肉咖哩', price: 130, note: '' }] }] });
M.getMenu('R003').sections[0].items[0].name = '亂改';
assert.strictEqual(M.items('R003')[0].name, '雞肉咖哩', '快取沒被外面改到');

console.log('check-menu-cache: all passed');
```

- [ ] **Step 2: 跑檢查確認失敗**

Run: `node <scratchpad>/itemrating/check-menu-cache.js`
Expected: FAIL，`重複查詢不再讀 localStorage`

- [ ] **Step 3: 改 `proto/v1/js/menu-data.js`**

`// ── 儲存 ──` 底下的 `loadSaved`、`writeSaved` 換成：

```js
  // ── 儲存 ──
  // 讀到的整份菜單（含照片 data URL，可能很大）快取在記憶體：同一頁重複查品項不再重新解析。
  // 本頁寫入成功才更新快取；其他分頁改了菜單時，瀏覽器的 storage 事件讓快取失效。
  let cache = null;

  function loadSaved() {
    if (cache) return cache;
    let map = {};
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (v && typeof v === 'object') map = v;
    } catch (e) { /* 讀不到或壞掉：當作沒有存的菜單 */ }
    cache = map;
    return cache;
  }

  function writeSaved(map) {
    try {
      localStorage.setItem(KEY, JSON.stringify(map));
      cache = map;
      return true;
    } catch (e) { return false; }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) cache = null; });
  }
```

`savedMenu` 裡寫回改成先複製（不直接改快取裡的物件）：

```js
  function savedMenu(storeId) {
    const map = loadSaved();
    const m = map[storeId];
    if (!isValidMenu(m)) return null;
    const r = ensureIds(m, storeId);
    if (r.changed) writeSaved(Object.assign({}, map, { [storeId]: r.menu }));
    return r.menu;
  }
```

`saveMenu`、`removeSaved` 改成複製後寫入：

```js
  function saveMenu(storeId, menu) {
    return writeSaved(Object.assign({}, loadSaved(), { [storeId]: menu }));
  }

  function removeSaved(storeId) {
    const map = Object.assign({}, loadSaved());
    delete map[storeId];
    return writeSaved(map);
  }
```

`getMenu` 改成回傳深複製，外面改了不會汙染快取：

```js
  function getMenu(storeId) {
    const m = savedMenu(storeId) || (CE.DEMO_MENUS && CE.DEMO_MENUS[storeId]) || null;
    return m && JSON.parse(JSON.stringify(m));
  }
```

`hasMenu` 不再透過 `getMenu`（避免無謂複製）：

```js
  function hasMenu(storeId) {
    return !!(savedMenu(storeId) || (CE.DEMO_MENUS && CE.DEMO_MENUS[storeId]));
  }
```

`items(storeId)` 一樣不需要複製，把第一行 `const menu = getMenu(storeId);` 改成：

```js
    const menu = savedMenu(storeId) || (CE.DEMO_MENUS && CE.DEMO_MENUS[storeId]) || null;
```

- [ ] **Step 4: 跑檢查確認通過**

Run: `S=<scratchpad>; node $S/itemrating/check-menu-cache.js && node $S/menulink/check-menu-data.js && node $S/itemrating/check-item-store.js`
Expected: 三行 `all passed`

- [ ] **Step 5: 記進度**：`Task 3: complete (...)`

---

### Task 4: 共用評分表單（`star-picker.js`、`rating-form.js`），店家評分改用

**Files:**
- Create: `proto/v1/js/star-picker.js`、`proto/v1/js/rating-form.js`
- Modify: `proto/v1/js/rating-ui.js`（整檔改寫）
- Modify: `proto/v1/index.html`（script）
- Test: 店家評分 driver（U1–U7、RF1–RF4、M1）

**Interfaces:**
- Consumes: `CE.rating`／`CE.itemRating`（Task 1）、`CE.ratingStore`（Task 2）、`CE.lunchStore.peekMembers/getMe/setMe`
- Produces:
  - `CE.starPicker(initial: number | null, onPick: (v) → void) → HTMLElement`
  - `CE.ratingForm({ kit, store, field }) → { init(now), summary(id), mine(id) → Rating | null, ratings() → Rating[], panel(target: { id, extra }, onChange, opts?: { hideSwitch?: boolean }) → HTMLElement }`；第一次用到時自動 `init`
  - `CE.ratingUi = { init, summary, section }`（對外與現在相同）

- [ ] **Step 1: 確認回歸基準（現在應全數通過）**

照 `docs/plans/2026-10-16-critieat-store-rating-proto.md` Task 3 Step 7–9 的指令，跑 `main`（U1–U6）、`others`（U7）、`rf1`～`rf4`、`phone`（M1），輸出存到 `.superpowers/sdd/2026-10-16-critieat-item-rating/store-before.txt`。

Expected：與該計畫 Expected 相同（已於 2026-10-16 驗證）。

- [ ] **Step 2: 新增 `proto/v1/js/star-picker.js`**

把 `proto/v1/js/rating-ui.js` 裡整個 `function starPicker(initial, onPick) { ... }`（含上方註解「半星選擇器：點星星左半邊是 n − 0.5…」）原封不動搬過來，包成：

```js
(function (CE) {
  'use strict';

  // 所有資料一律用 textContent 寫入，不用 innerHTML
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // （這裡貼上 rating-ui.js 的 starPicker 函式，內容不改）

  CE.starPicker = starPicker;
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 3: 新增 `proto/v1/js/rating-form.js`**

```js
(function (CE) {
  'use strict';

  // 共用的評分表單（店家評分、品項評分）：選身分、半星、短評、儲存／更新、刪除（兩段確認）、其他人的評分。
  // const f = CE.ratingForm({ kit, store, field })
  //   kit：CE.rating 或 CE.itemRating；store：{ load(now), save(db) }；field：評分對象欄位（'storeId' / 'itemId'）
  // f.panel(target, onChange, opts)：target = { id, extra }，extra 是存檔時一併寫入的欄位（品項評分的 storeId、itemName、itemNote）
  //   儲存或刪除成功後呼叫 onChange（由頁面重畫）；opts.hideSwitch：不顯示「切換」（開團單的身分由頁面右上角管理）
  // 身分與成員名單共用開團單（lunch-store.js），每次畫面重建時重新讀，所以兩頁換身分會同步。
  // 還沒存的星數與短評、正在換身分、刪除確認都留在表單物件裡，畫面因為其他原因重畫時不會不見。
  const SAVE_FAILED = '無法儲存到這台電腦的瀏覽器';

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

  CE.ratingForm = function ratingForm({ kit, store, field }) {
    const state = {
      loaded: false,
      db: { ratings: [] },
      warning: null,
      draft: null,          // { id, member, stars: number | null, comment }
      switching: false,     // 正在換身分
      confirmDelete: false,
      error: null,
    };

    function init(now) {
      const r = store.load(now);
      state.db = r.db;
      state.warning = r.warning;
      state.loaded = true;
    }

    function ensure() {
      if (!state.loaded) init(new Date());
    }

    function who() {
      const members = CE.lunchStore.peekMembers();
      const me = CE.lunchStore.getMe();
      return { members, me: members.includes(me) ? me : '' }; // 名字不在名單裡就當作還沒選
    }

    function summary(id) { ensure(); return kit.summary(state.db.ratings, id); }
    function ratings() { ensure(); return state.db.ratings; }
    function mine(id) {
      ensure();
      const { me } = who();
      return me ? kit.find(state.db, id, me) : null;
    }

    // 換對象或換身分時，表單改帶入這個人對這個對象的評分
    function ensureDraft(id, me) {
      const d = state.draft;
      if (d && d.id === id && d.member === me) return;
      const old = me ? kit.find(state.db, id, me) : null;
      state.draft = { id, member: me, stars: old ? old.stars : null, comment: old ? old.comment : '' };
      state.confirmDelete = false;
      state.error = null;
    }

    // 存得進去才更新資料與畫面；存不進去就留著表單內容並顯示錯誤
    function commitDb(db, rebuild, onChange) {
      if (!store.save(db)) { state.error = SAVE_FAILED; rebuild(); return; }
      state.db = db;
      state.warning = null;
      state.error = null;
      state.draft = null;
      state.confirmDelete = false;
      onChange();
    }

    function identity(me, rebuild, opts) {
      const p = el('p', 'rate__me');
      p.append('以 ', el('b', null, me), ' 身分評分');
      if (!opts.hideSwitch) p.append(button('rate__link', '切換', () => { state.switching = true; rebuild(); }));
      return p;
    }

    function whoPicker(members, me, rebuild) {
      const box = el('div', 'rate__pick');
      box.append(el('span', null, me ? '換成：' : '你是誰？'));
      const sel = el('select', 'rate__select');
      sel.setAttribute('aria-label', '選擇你的名字');
      sel.append(new Option('選擇名字', ''));
      members.forEach(m => sel.append(new Option(m, m, false, m === me)));
      sel.addEventListener('change', () => {
        if (!sel.value) return;
        state.switching = false;
        CE.lunchStore.setMe(sel.value); // 和開團單同步
        rebuild();
      });
      box.append(sel);
      if (me) box.append(button('rate__link', '取消', () => { state.switching = false; rebuild(); }));
      return box;
    }

    function form(target, me, rebuild, onChange) {
      const d = state.draft;
      const old = kit.find(state.db, target.id, me);
      const box = el('div', 'rate__form');

      function save() {
        if (d.stars == null) return;
        commitDb(kit.upsert(state.db, Object.assign({}, target.extra, {
          [field]: target.id, member: me, stars: d.stars,
          comment: kit.normalizeComment(d.comment), updatedAt: new Date().toISOString(),
        })), rebuild, onChange);
      }

      const submit = button('btn btn--primary', old ? '更新' : '儲存', save);
      submit.disabled = d.stars == null;
      const stars = CE.starPicker(d.stars, v => { d.stars = v; submit.disabled = false; });

      const fieldBox = el('div', 'rate__field');
      const input = el('input', 'rate__input');
      input.type = 'text';
      input.maxLength = kit.MAX_COMMENT;
      input.placeholder = '短評（選填）';
      input.value = d.comment;
      input.setAttribute('aria-label', '短評');
      const count = el('span', 'rate__count mono');
      const showCount = () => { count.textContent = `${input.value.length}/${kit.MAX_COMMENT}`; };
      input.addEventListener('input', () => { d.comment = input.value; showCount(); });
      input.addEventListener('keydown', e => {
        // 中文選字的 Enter 不送出；Safari 選字確認的 Enter 是 isComposing=false、keyCode 229
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && !submit.disabled) save();
      });
      showCount();
      fieldBox.append(input, count);

      const btns = el('div', 'rate__btns');
      btns.append(submit);
      if (old) {
        btns.append(button(
          'btn btn--danger' + (state.confirmDelete ? ' is-confirm' : ''),
          state.confirmDelete ? '確定刪除？' : '刪除我的評分',
          () => {
            if (!state.confirmDelete) { state.confirmDelete = true; rebuild(); return; }
            commitDb(kit.remove(state.db, target.id, me), rebuild, onChange);
          }
        ));
      }

      box.append(stars, fieldBox, btns);
      if (state.error) {
        const err = el('p', 'rate__error', state.error);
        err.setAttribute('role', 'alert');
        box.append(err);
      }
      return box;
    }

    function panel(target, onChange, opts) {
      ensure();
      const o = opts || {};
      const { members, me } = who();
      ensureDraft(target.id, me);
      const box = el('div', 'rate__panel');
      const rebuild = () => box.replaceWith(panel(target, onChange, o));

      if (state.warning) box.append(el('p', 'rate__warn', state.warning));
      if (me && !state.switching) box.append(identity(me, rebuild, o), form(target, me, rebuild, onChange));
      else box.append(whoPicker(members, me, rebuild));

      const list = kit.others(state.db, target.id, me);
      if (list.length) {
        const ul = el('ul', 'rate__list');
        list.forEach(r => {
          const li = el('li', 'rate__row');
          li.append(
            el('span', 'rate__who', r.member),
            el('span', 'rate__stars', '★ ' + kit.formatStars(r.stars)),
            el('span', 'rate__comment', r.comment),
            el('span', 'rate__date mono', kit.dateLabel(r.updatedAt))
          );
          ul.append(li);
        });
        box.append(ul);
      }
      return box;
    }

    return { init, summary, mine, ratings, panel };
  };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 4: 改寫 `proto/v1/js/rating-ui.js`**

```js
(function (CE) {
  'use strict';

  // 店家詳情的評分區塊（美食地圖）。表單本體在 rating-form.js，資料在 rating-store.js、邏輯在 rating.js。
  const form = CE.ratingForm({ kit: CE.rating, store: CE.ratingStore, field: 'storeId' });

  // 所有使用者資料一律用 textContent 寫入，不用 innerHTML
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function section(store, onChange) {
    const box = el('section', 'rate');
    box.setAttribute('aria-label', '評分');
    const s = form.summary(store.id);
    const head = el('div', 'rate__head');
    head.append(
      el('h4', 'rate__title', '評分'),
      el('span', 'rate__avg', s ? `★ ${CE.rating.formatStars(s.avg)} · ${s.count} 人` : '還沒有人評分')
    );
    box.append(head, form.panel({ id: store.id, extra: {} }, onChange));
    return box;
  }

  CE.ratingUi = { init: form.init, summary: form.summary, section };
})(globalThis.CE = globalThis.CE || {});
```

在 `css/style.css` 的 `.rate__form { ... }` 那行前面加：

```css
.rate__panel { display: flex; flex-direction: column; gap: 10px; }
```

- [ ] **Step 5: `proto/v1/index.html` 載入**

`<script src="js/rating-store.js"></script>` 後面、`rating-ui.js` 前面加：

```html
  <script src="js/star-picker.js"></script>
  <script src="js/rating-form.js"></script>
```

- [ ] **Step 6: 跑店家評分回歸**

同 Step 1 的指令再跑一次，輸出存到 `store-after.txt`。

Expected：與 Step 1 的 Expected 全部相同（U1–U7、RF1–RF4、M1）；沒有 `EXC`。

- [ ] **Step 7: 記進度**：`Task 4: complete (...)`

---

### Task 5: 品項評分 UI 與菜單燈箱

**Files:**
- Create: `proto/v1/js/item-rating-ui.js`
- Modify: `proto/v1/js/menu-lightbox.js`（`renderTable` 拆成 `renderJump`／`renderRows`、`showMenu` 加大家推與展開狀態）
- Modify: `proto/v1/index.html`（script）
- Modify: `proto/v1/css/style.css`
- Test: `.superpowers/sdd/2026-10-16-critieat-item-rating/drive-item.js`

**Interfaces:**
- Consumes: `CE.itemRating`（Task 1）、`CE.itemRatingStore`（Task 2）、`CE.ratingForm`（Task 4）、`CE.menuData.items`
- Produces（`CE.itemRatingUi`）：
  - `summary(itemId) → { avg, count } | null`、`badge(itemId) → '★ 4.7 (3)' | '—'`、`mineLabel(itemId) → '我 ★4.5' | ''`
  - `top(storeId) → { item, avg, count }[]`
  - `panel(item: { id, storeId, name, note }, onChange, opts?: { showAvg?, hideSwitch? }) → HTMLElement`
  - 儲存或刪除後在 `document` 發出 `ce:item-rating-change`

- [ ] **Step 1: 建 driver**

複製 `.superpowers/sdd/2026-10-16-critieat-menu-item-link/drive-link.js` 成 `.superpowers/sdd/2026-10-16-critieat-item-rating/drive-item.js`，改：開頭註解「操作品項評分並截圖」、`PORT = 9339`，`info` 換成：

```js
        else if (op === 'info') logs.push(arg + ' => ' + JSON.stringify(await ev(`(()=>{const d=document.getElementById('menu-dlg');const inDlg=!!(d&&d.open);const q=s=>[...document.querySelectorAll(s)];const t=e=>e.innerText.replace(/\\s*\\n+\\s*/g,' / ').trim();return {top:inDlg?q('#menu-dlg .mtop').map(t)[0]||null:null,rows:inDlg?q('#menu-dlg .mitems__row').slice(0,12).map(tr=>t(tr)+(tr.classList.contains('is-open')?' [open]':'')):null,panel:q(inDlg?'#menu-dlg .rate--item':'#card-view .rate--item').map(t)[0]||null,lines:inDlg?null:q('#card-view .orders__line').filter(l=>l.querySelector('.rbtn')).map(t),scroll:inDlg?Math.round(d.querySelector('.mdlg__body').scrollTop):null,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}})()`)));
```

- [ ] **Step 2: 跑 driver 確認目前沒有評分欄（失敗）**

```bash
D=.superpowers/sdd/2026-10-16-critieat-item-rating; U=http://127.0.0.1:8010
OPEN="js:[...document.querySelectorAll('#detail .btn')].find(b=>b.textContent.includes('菜單')).click()"
node $D/drive-item.js $D "$U/index.html?store=R002" i0 1440 900 "js:localStorage.setItem('critieat.me','小明')" reload "$OPEN" info:I0
```

Expected：`I0 => {"top":null,"rows":[],...}`（還沒有 `.mitems__row`）

- [ ] **Step 3: 新增 `proto/v1/js/item-rating-ui.js`**

```js
(function (CE) {
  'use strict';

  // 品項評分：菜單燈箱與開團單共用。表單本體在 rating-form.js；品項清單在 menu-data.js。
  // 儲存或刪除後在 document 發出 'ce:item-rating-change'，其他畫面（例如燈箱背後的開團單）藉此更新。
  const R = CE.itemRating;
  const form = CE.ratingForm({ kit: R, store: CE.itemRatingStore, field: 'itemId' });
  const TOP_MIN = 4;
  const TOP_N = 3;

  // 所有使用者資料一律用 textContent 寫入，不用 innerHTML
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function badge(itemId) {
    const s = form.summary(itemId);
    return s ? `★ ${R.formatStars(s.avg)} (${s.count})` : '—';
  }

  function mineLabel(itemId) {
    const r = form.mine(itemId);
    return r ? `我 ★${R.formatStars(r.stars)}` : '';
  }

  function top(storeId) {
    return R.top(form.ratings(), CE.menuData.items(storeId), TOP_MIN, TOP_N);
  }

  // item: { id, storeId, name, note }；opts.showAvg：面板上方多一行「大家：★ 4.7 · 3 人」
  function panel(item, onChange, opts) {
    const o = opts || {};
    const box = el('div', 'rate rate--item');
    if (o.showAvg) {
      const s = form.summary(item.id);
      box.append(el('p', 'rate__avgline', s ? `大家：★ ${R.formatStars(s.avg)} · ${s.count} 人` : '大家：還沒有人評分'));
    }
    const changed = () => {
      onChange();
      document.dispatchEvent(new CustomEvent('ce:item-rating-change', { detail: { itemId: item.id } }));
    };
    box.append(form.panel({ id: item.id, extra: { storeId: item.storeId, itemName: item.name, itemNote: item.note || '' } }, changed, o));
    return box;
  }

  CE.itemRatingUi = { summary: form.summary, badge, mineLabel, top, panel };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 4: 改 `proto/v1/js/menu-lightbox.js`**

把整個 `function renderTable(menu, body) { ... }` 換成下面兩個函式：

```js
  // ── 菜單檢視：表格／照片 ──
  function renderJump(menu, body) {
    const jump = el('div', 'mjump');
    menu.sections.forEach((sec, i) => {
      jump.append(button('mjump__btn', sec.name, () => {
        const target = body.querySelector(`[data-sec="${i}"]`);
        if (target) body.scrollTo({ top: target.offsetTop - 8, behavior: 'smooth' });
      }));
    });
    return jump;
  }

  // 每列：品名（＋備註、我評過的「我 ★n」）、平均、價格；點列在下面展開品項評分，同時只展開一列
  // rate: { openId, toggle(id), changed() }
  function renderRows(menu, storeId, rate) {
    const IR = CE.itemRatingUi;
    const wrap = el('div', 'mtable');
    menu.sections.forEach((sec, i) => {
      const h = el('h4', 'msec', sec.name);
      h.dataset.sec = String(i);
      const table = el('table', 'mitems');
      sec.items.forEach(it => {
        const open = rate.openId === it.id;
        const tr = el('tr', 'mitems__row' + (open ? ' is-open' : ''));
        tr.dataset.item = it.id;
        tr.tabIndex = 0;
        tr.setAttribute('aria-expanded', String(open));
        const name = el('td', 'mitems__name', it.name);
        if (it.note) name.append(el('span', 'mitems__note', it.note));
        const mine = IR.mineLabel(it.id);
        if (mine) name.append(el('span', 'mitems__mine', mine));
        const rt = el('td', 'mitems__rate' + (IR.summary(it.id) ? '' : ' is-none'), IR.badge(it.id));
        tr.append(name, rt, el('td', 'mitems__price mono', price(it.price)));
        tr.addEventListener('click', () => rate.toggle(it.id));
        tr.addEventListener('keydown', e => {
          if (e.target === tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); rate.toggle(it.id); }
        });
        table.append(tr);
        if (open) {
          const ptr = el('tr', 'mitems__panel');
          const td = el('td');
          td.colSpan = 3;
          td.append(IR.panel({ id: it.id, storeId, name: it.name, note: it.note || '' }, rate.changed));
          ptr.append(td);
          table.append(ptr);
        }
      });
      wrap.append(h, table);
    });
    return wrap;
  }
```

`showMenu()` 裡從 `const body = el('div', 'mdlg__body');` 到 `show('table');` 那段換成：

```js
      const body = el('div', 'mdlg__body');
      const jump = renderJump(menu, body);
      const photo = renderPhoto(menu);
      const top = el('div', 'mtop');
      let openId = null;
      let wrap = null;
      let tab = 'table';

      // 同名品項才在膠囊上加備註區分（魯肉飯（大））
      const sameName = name => menu.sections.reduce((n, s) => n + s.items.filter(x => x.name === name).length, 0) > 1;

      function paintTop() {
        const list = CE.itemRatingUi.top(store.id);
        top.replaceChildren();
        top.hidden = tab !== 'table' || list.length === 0;
        if (!list.length) return;
        top.append(el('b', 'mtop__label', '大家推'));
        list.forEach(x => {
          const chip = button('mtop__chip', x.item.name + (x.item.note && sameName(x.item.name) ? `（${x.item.note}）` : ''), () => {
            openId = x.item.id;
            paint(x.item.id);
          });
          chip.append(el('b', null, '★ ' + CE.itemRating.formatStars(x.avg)));
          top.append(chip);
        });
      }

      // 重畫表格：保留捲動位置；scrollTo 有給就捲到那一列
      function paint(scrollTo) {
        const keep = body.scrollTop;
        const next = renderRows(menu, store.id, {
          openId,
          toggle: id => { openId = openId === id ? null : id; paint(); },
          changed: () => paint(),
        });
        if (wrap && wrap.isConnected) wrap.replaceWith(next);
        wrap = next;
        paintTop();
        body.scrollTop = keep;
        if (scrollTo) {
          const tr = wrap.querySelector(`[data-item="${CSS.escape(scrollTo)}"]`);
          if (tr) body.scrollTo({ top: tr.offsetTop - 8, behavior: 'smooth' });
        }
      }

      function show(which) {
        tab = which;
        tTable.classList.toggle('is-active', which === 'table');
        tPhoto.classList.toggle('is-active', which === 'photo');
        jump.hidden = which !== 'table';
        paintTop();
        body.replaceChildren(which === 'table' ? wrap : photo);
        body.scrollTop = 0;
      }

      paint();
      dlg.append(tabs, top, jump, body);
      show('table');
```

- [ ] **Step 5: `proto/v1/index.html` 載入**

`<script src="js/rating-demo.js"></script>` 後面加 `<script src="js/item-rating-demo.js"></script>`；`<script src="js/rating-ui.js"></script>` 後面加 `<script src="js/item-rating-ui.js"></script>`。

- [ ] **Step 6: `proto/v1/css/style.css` 末段加**

```css
/* 品項評分（菜單燈箱、開團單） */
.mtop { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12.5px; }
.mtop[hidden] { display: none; }
.mtop__label { color: var(--purple-ink); font-weight: 800; margin-right: 2px; }
.mtop__chip { border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; background: #fff; font: inherit; font-size: 12.5px; color: var(--ink); cursor: pointer; }
.mtop__chip:hover { border-color: var(--cyan); }
.mtop__chip b { margin-left: 4px; color: #b45309; }
.mitems__row { cursor: pointer; }
.mitems__row:focus-visible { outline: 2px solid var(--cyan); outline-offset: -2px; }
.mitems__row.is-open td { background: rgba(0, 240, 255, .06); border-bottom: 0; }
.mitems__rate { text-align: right; white-space: nowrap; width: 84px; font-size: 12.5px; font-weight: 700; color: #b45309; }
.mitems__rate.is-none { color: var(--faint); font-weight: 400; }
.mitems__mine { margin-left: 6px; font-size: 10.5px; font-weight: 700; color: var(--cyan-ink); background: rgba(0, 240, 255, .14); border-radius: 6px; padding: 1px 6px; white-space: nowrap; }
.mitems__panel td, .mitems tr.mitems__panel:hover td { background: rgba(0, 240, 255, .06); padding: 4px 10px 12px; }
.rate--item { border-top: 0; padding-top: 0; }
.rate__avgline { margin: 0; font-size: 12.5px; color: var(--muted); }
```

- [ ] **Step 7: 跑燈箱流程（桌機）**

```bash
D=.superpowers/sdd/2026-10-16-critieat-item-rating; U=http://127.0.0.1:8010
ME="js:localStorage.setItem('critieat.me','小明')"
OPEN="js:[...document.querySelectorAll('#detail .btn')].find(b=>b.textContent.includes('菜單')).click()"
ROW() { echo "js:document.querySelector('#menu-dlg .mitems__row[data-item=\"$1\"]').click()"; }
SAVE="js:document.querySelector('#menu-dlg .rate--item .btn--primary').click()"
node $D/drive-item.js $D "$U/index.html?store=R002" lb 1440 900 "$ME" reload "$OPEN" info:I1 shot:I1-desktop \
  "$(ROW R002-03)" info:I2a 'click:#menu-dlg .rate--item .star[data-n="4"]:0.75' \
  "js:(()=>{const i=document.querySelector('#menu-dlg .rate--item .rate__input');i.value='雞肉很嫩';i.dispatchEvent(new Event('input'))})()" \
  "js:document.querySelector('#menu-dlg .mdlg__body').scrollTop=120" "$SAVE" info:I2b shot:I2-saved \
  reload "$OPEN" info:I3 \
  "js:[...document.querySelectorAll('#menu-dlg .mtop__chip')][0].click()" wait:600 info:I4 \
  "js:document.querySelector('#menu-dlg .mitems__row[data-item=\"R002-03\"]').focus()" key:Enter info:I5a key:Enter info:I5b
# I6 刪掉 → 大家推與平均同步；菜單還原示範不影響評分
node $D/drive-item.js $D "$U/index.html?store=R002" lb2 1440 900 "$ME" reload "$OPEN" "$(ROW R002-04)" \
  "js:document.querySelector('#menu-dlg .rate--item .btn--danger').click()" "js:document.querySelector('#menu-dlg .rate--item .btn--danger').click()" info:I6
```

Expected:
- I1：`top` 為 `大家推 / 魯肉飯（大） ★ 4.7 / 控肉飯 ★ 4.5 / 魯肉飯（小） ★ 4.0`（換行切分可能略有不同，三個名稱與分數依序出現即可）；`rows` 中 `控肉飯` 那列含 `我 ★4.0` 與 `★ 4.5 (2)`，`雞肉飯` 那列含 `—`
- I2a：`雞肉飯` 那列結尾 `[open]`；`panel` 含 `以 / 小明 / 身分評分`、`點星星評分`、沒有「切換」以外的身分選單
- I2b：`雞肉飯` 那列含 `我 ★4.0`、`★ 4.0 (1)` 且仍 `[open]`；`panel` 含 `更新`；`scroll` 為 `120`（沒有跳回頂端）
- I3：重新整理後 `雞肉飯` 那列仍含 `我 ★4.0`
- I4：`魯肉飯 大` 那列 `[open]`，`panel` 含 `阿傑 / ★ 5.0 / 大碗很划算`
- I5a：`雞肉飯` 那列 `[open]`；I5b：沒有任何 `[open]`
- I6：`控肉飯` 那列 `★ 5.0 (1)`、沒有 `我 ★`；`top` 依序為 `控肉飯 ★ 5.0`、`魯肉飯（大） ★ 4.7`、`魯肉飯（小） ★ 4.0`（只剩阿傑的 5 分，所以控肉飯排第一）
- 沒有 `EXC`、`STEP FAIL`

- [ ] **Step 8: 手機（390）**

```bash
node $D/drive-item.js $D "$U/index.html?store=R002" lbm 390 844 "$ME" reload "$OPEN" "$(ROW R002-02)" info:M1 shot:M1-lightbox
```

Expected：`overflow` `false`；看截圖：表格三欄（品名、平均、價格）沒擠壞、展開的面板在燈箱內完整可操作。

- [ ] **Step 9: 記進度**：`Task 5: complete (...)`

---

### Task 6: 開團單已收單卡片評分

**Files:**
- Modify: `proto/v1/js/lunch-app.js`（`state.rateOpen`、`resetView`、`rateTarget`、`renderOrders`、`ce:item-rating-change` 監聽）
- Modify: `proto/v1/lunch.html`（script）
- Modify: `proto/v1/css/style.css`
- Test: `drive-item.js`

**Interfaces:**
- Consumes: `CE.itemRatingUi.{ mineLabel, panel }`（Task 5）、`CE.menuData.{ findItem, matchItem }`

- [ ] **Step 1: 跑 driver 確認目前沒有評分按鈕（失敗）**

```bash
D=.superpowers/sdd/2026-10-16-critieat-item-rating; U=http://127.0.0.1:8010
ME="js:localStorage.setItem('critieat.me','小明')"
PAST="js:(()=>{for(let i=0;i<10&&![...document.querySelectorAll('#card-list .item')].some(b=>b.textContent.includes('虎記'));i++)document.querySelector('.daynav__btn').click()})()"
node $D/drive-item.js $D "$U/lunch.html" l0 1440 900 "$ME" reload "$PAST" "js:[...document.querySelectorAll('#card-list .item')].find(b=>b.textContent.includes('虎記')).click()" info:L0
```

Expected：`L0 => {"lines":[],...}`

- [ ] **Step 2: 改 `proto/v1/js/lunch-app.js`**

`state` 裡 `confirmCancel: false,` 後面加：

```js
    rateOpen: '',        // 已收單卡片上展開評分的那一列：'卡片ID|點餐列ID'
```

`resetView()` 裡 `state.confirmCancel = false;` 後面加 `state.rateOpen = '';`

`renderOrders` 前面加：

```js
  // 已收單卡片上自己點的一列 → 要評分的菜單品項；對不上回傳 null
  // 有 menuItemId：品項還在菜單上就用菜單的品名；下架了仍可評，用點餐列的品名當快照
  function rateTarget(card, it) {
    const D = CE.menuData;
    if (it.menuItemId) {
      const m = D.findItem(card.storeId, it.menuItemId);
      return m
        ? { id: m.id, storeId: card.storeId, name: m.name, note: m.note }
        : { id: it.menuItemId, storeId: card.storeId, name: it.name, note: it.note };
    }
    const m = D.matchItem(card.storeId, it.name, it.note);
    return m ? { id: m.id, storeId: card.storeId, name: m.name, note: m.note } : null;
  }
```

`renderOrders` 裡 `r.items.forEach(it => { ... items.append(line); });` 改成：

```js
        r.items.forEach(it => {
          const line = el('div', 'orders__line');
          line.append(el('span', null, it.name));
          if (it.note) line.append(el('span', 'orders__note', it.note));
          if (it.afterClose) line.append(el('span', 'tag tag--late', '收單後修改'));
          if (card.status === 'ordering' && it.price !== null) line.append(el('span', 'orders__price mono', `$${it.price}`));
          items.append(line);
          // 已收單：自己點的、對得到菜單品項的列可以評分
          const target = card.status === 'closed' && state.me && r.member === state.me ? rateTarget(card, it) : null;
          if (!target) return;
          const key = card.id + '|' + it.id;
          const open = state.rateOpen === key;
          const mine = CE.itemRatingUi.mineLabel(target.id);
          const btn = button('rbtn' + (mine ? ' is-done' : ''), mine || '☆ 評分', () => {
            state.rateOpen = open ? '' : key;
            renderCard();
          });
          btn.setAttribute('aria-expanded', String(open));
          line.append(btn);
          if (open) items.append(CE.itemRatingUi.panel(target, () => {}, { showAvg: true, hideSwitch: true }));
        });
```

在 `document.addEventListener('ce:menu-change', ...)` 那行後面加：

```js
  // 品項評分存好或刪掉（這裡的面板或燈箱裡）：更新「我 ★n」按鈕
  document.addEventListener('ce:item-rating-change', () => { if (state.db) renderCard(); });
```

- [ ] **Step 3: `proto/v1/lunch.html` 載入**

`<script src="js/menu-combo.js"></script>` 後面加：

```html
  <script src="js/rating.js"></script>
  <script src="js/item-rating-demo.js"></script>
  <script src="js/rating-store.js"></script>
  <script src="js/star-picker.js"></script>
  <script src="js/rating-form.js"></script>
  <script src="js/item-rating-ui.js"></script>
```

（`rating-store.js` 也會建立店家評分的 store，但開團單不會呼叫它的 `load`，不需要 `rating-demo.js`。）

- [ ] **Step 4: `proto/v1/css/style.css` 末段（品項評分區塊後）加**

```css
.rbtn { margin-left: auto; flex: none; border: 1px solid var(--line); border-radius: 999px; padding: 2px 10px; font: inherit; font-size: 12px; color: var(--cyan-ink); background: #fff; cursor: pointer; white-space: nowrap; }
.rbtn.is-done { color: #b45309; font-weight: 700; border-color: #fde68a; background: #fffbeb; }
.orders__items .rate--item { margin: 4px 0 8px; padding: 10px 12px; border-radius: 10px; background: rgba(0, 240, 255, .06); }
```

- [ ] **Step 5: 跑開團單流程**

```bash
CARD() { echo "js:[...document.querySelectorAll('#card-list .item')].find(b=>b.textContent.includes('$1')).click()"; }
RB() { echo "js:[...document.querySelectorAll('#card-view .orders__line')].find(l=>l.textContent.includes('$1')).querySelector('.rbtn').click()"; }
SAVE="js:document.querySelector('#card-view .rate--item .btn--primary').click()"
NAME0="js:document.querySelectorAll('.editor__row .editor__name')[0].focus()"
SUBMIT="js:[...document.querySelectorAll('.editor .btn--primary')].find(b=>b.textContent==='送出').click()"
LBOPEN="js:[...document.querySelectorAll('#side .btn')].find(b=>b.textContent.includes('菜單')).click()"
# L1 歷史紀錄（6 天前虎記，小明點了控肉飯、燙青菜）
node $D/drive-item.js $D "$U/lunch.html" l1 1440 900 "$ME" reload "$PAST" "$(CARD 虎記)" info:L1a \
  "$(RB 燙青菜)" info:L1b 'click:#card-view .rate--item .star[data-n="4"]:0.25' "$SAVE" info:L1c shot:L1-rated \
  "$LBOPEN" info:L1d
# L2 今天點餐中的卡片：自己點的也沒有評分按鈕；今天已收單、自己點的自由輸入列對不上 → 沒按鈕
node $D/drive-item.js $D "$U/lunch.html" l2 1440 900 "$ME" reload "$(CARD 八方雲集)" "$NAME0" type:鍋 key:ArrowDown key:Enter "$SUBMIT" info:L2a \
  "$(CARD 虎記)" "$NAME0" type:控 key:ArrowDown key:Enter \
  "js:[...document.querySelectorAll('.editor .btn')].find(b=>b.textContent.includes('再加一項')).click()" \
  "js:document.querySelectorAll('.editor__row .editor__name')[1].focus()" type:加辣的那個 "$SUBMIT" info:L2b
# L3 燈箱裡評 → 關掉燈箱 → 卡片按鈕更新
node $D/drive-item.js $D "$U/lunch.html" l3 1440 900 "$ME" reload "$PAST" "$(CARD 虎記)" "$LBOPEN" \
  "js:document.querySelector('#menu-dlg .mitems__row[data-item=\"R002-09\"]').click()" 'click:#menu-dlg .rate--item .star[data-n="3"]:0.75' \
  "js:document.querySelector('#menu-dlg .rate--item .btn--primary').click()" "js:document.getElementById('menu-dlg').close()" info:L3
# L4 換身分後評分用新身分；面板沒有「切換」
node $D/drive-item.js $D "$U/lunch.html" l4 1440 900 "js:localStorage.setItem('critieat.me','阿傑')" reload "$(CARD 虎記)" "$(RB 滷蛋)" info:L4
# L5 手機
node $D/drive-item.js $D "$U/lunch.html" l5 390 844 "$ME" reload "$PAST" "$(CARD 虎記)" "$(RB 燙青菜)" info:L5 shot:L5-phone
```

Expected:
- L0（Step 1）：`lines` `[]`
- L1a：`lines` 兩列：`控肉飯 … 我 ★4.0`、`燙青菜 … ☆ 評分`
- L1b：`panel` 含 `大家：還沒有人評分`、`以 / 小明 / 身分評分`，不含 `切換`
- L1c：`燙青菜` 那列變成 `我 ★3.5`；面板仍展開、按鈕「更新」
- L1d：燈箱 `rows` 的 `燙青菜` 那列含 `我 ★3.5`、`★ 3.5 (1)`
- L2a：八方雲集（點餐中）`lines` `[]`
- L2b：虎記（今天已收單）`lines` 只有一列 `控肉飯 … 我 ★4.0`（`加辣的那個` 沒有按鈕）
- L3：`lines` 的 `燙青菜` 那列為 `我 ★3.0`
- L4：今天虎記，身分阿傑：`lines` 只有一列 `滷蛋 … ☆ 評分`（`魯肉飯（大）` 是自由輸入，菜單上魯肉飯有兩道、備註也對不上 → 沒有按鈕）；`panel` 含 `以 / 阿傑 / 身分評分`，不含 `切換`
- L5：`overflow` `false`；看截圖面板在卡片內完整
- 沒有 `EXC`、`STEP FAIL`

- [ ] **Step 6: 開團單與點餐連品項回歸**

```bash
L=.superpowers/sdd/2026-10-14-critieat-lunch-card-proto; K=.superpowers/sdd/2026-10-16-critieat-menu-item-link
node $L/drive-lunch.js $D "$U/lunch.html" r1 1440 900 me:阿翔 sel:0 "fill:0|鍋貼|70|多醬" "btn:＋ 再加一項" "fill:1|豆漿||" btn:送出
node $L/drive-lunch.js $D "$U/lunch.html" r3 1440 900 me:小明 sel:2 btn:帶入 btn:送出
node $K/drive-link.js $D "$U/lunch.html" c1 1440 900 "$ME" reload "$(CARD 八方雲集)" "$NAME0" type:鍋 key:ArrowDown key:ArrowDown key:Enter info:C1c
```

Expected：R1 card 含 `4 人 已知 $360（1 項未填價格）`；R3 card 含 `控肉飯`、`燙青菜`；C1c 第 1 列 `韓式辣味鍋貼`、`linked` `true`；沒有 `EXC`。

- [ ] **Step 7: 收尾**

停掉 8010 伺服器。`progress.md` 加 `Task 6: complete (...)`。

---

## 完成後

請使用者在 `http://localhost:8000/` 看：美食地圖虎記／丸亀／八方雲集的「📋 看菜單」；開團單往前翻到 6 天前的虎記，評燙青菜。
