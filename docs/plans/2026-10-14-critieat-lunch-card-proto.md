# CRITIEAT 開團單（午餐卡）原型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `proto/v1/lunch.html` 做出可實際操作的開團單原型：提議、+1、開單、點餐、收單、付錢者、訂餐彙總，資料存在瀏覽器 localStorage，可切換身分扮演不同同事。

**Architecture:** 沿用 `proto/v1` 的寫法：純靜態 HTML + 原生 JS，不用建置工具、不用 ES modules，各檔掛在 `globalThis.CE` 上，讓同一份邏輯檔能在瀏覽器與 node 檢查腳本中執行。純邏輯（`lunch.js`，舊 cards → 新 cards）、儲存（`lunch-store.js`）、示範資料（`lunch-demo.js`）、畫面（`lunch-app.js`）分檔。店家資料與營業時間沿用美食地圖的 `data.js`、`stores.js`、`hours.js`。

**Tech Stack:** HTML5、CSS（自訂屬性，接在 `css/style.css` 末段）、原生 JavaScript（ES2020）、`<dialog>`、localStorage；檢查用 node 18 + headless Chrome（CDP）。

**Spec:** `docs/specs/2026-10-14-critieat-lunch-card-design.md`

**說明：** 本計畫的程式碼在撰寫計畫時已於 scratchpad 實際跑過（邏輯檢查 `LUNCH OK`、`STORE OK`，headless Chrome 走過提議／點餐／收單／取消／建立／手機寬度），照抄即可；若有出入以 spec 為準。

## Global Constraints

- 所有資料（店名、成員名、品項、備註）一律以 `textContent` 或 `value` 寫入 DOM，禁止用 `innerHTML`
- 日期與時間一律以台灣時間（`Asia/Taipei`）判斷；頁面只顯示今天的卡片
- 預設收單時間取設定的訂餐時段結束（`13:30`），取餐時間取設定的取餐時間（`14:00`）；延後收單一次 +10 分鐘
- 狀態顏色：提議中＝紫 `#bc13fe`、點餐中＝青 `#00f0ff`、已收單＝灰
- 價格選填，只接受 0 以上整數（全形數字視同半形）；品項名稱必填
- 收單後不鎖單；收單後新增或修改的列標「收單後修改」，卡片標 `changedAfterClose`
- 只記錄付錢者（預設開單者，收單後任何人可改），不做每人已付／收款追蹤
- 不使用 `alert` / `confirm` / `prompt`（取消這團用「再按一次確認」）
- **不得引入任何測試框架**（團隊鐵則）。邏輯以 scratchpad 中的一次性 node 檢查腳本確認（不放進專案），畫面以 headless Chrome 截圖確認
- **不做 git 操作**：`critieat/` 不受版控
- 原型不可依賴建置工具；`python3 -m http.server` 以 `proto/v1` 為根目錄即可運作

## Review Focus

1. **價格用中文輸入法打成全形「７０」或打成「$70」** → 全形視同 70；「$70」顯示「價格請填 0 以上的整數，或留空」而不是靜默存成錯的值。由 Task 1 的 `parsePrice` 檢查與 Task 3 的 `order` 情境覆蓋
2. **切換身分後編輯區** → 編輯區換成新身分自己的餐點，不會把上一個人的草稿送成新身分的單。由 Task 3 的 `switch` 情境覆蓋
3. **localStorage 被封鎖（私密視窗）或資料壞掉** → 頁面照常可用，顯示「本機資料無法讀取，已載入示範資料」。由 Task 2 的 broken / blocked 檢查覆蓋
4. **前一天開的卡片、隔天打開** → 不出現（只顯示今天）；台灣時間過午夜就算隔天。由 Task 1 的 `todayStr`、`cardsForDay` 檢查覆蓋
5. **正在輸入餐點時收單倒數更新** → 不重畫、不打斷輸入（倒數只改文字）。由 Task 3 的 `tick()` 寫法保證，並在 Task 5 手動確認

---

## 檔案結構

```
critieat/
├── proto/v1/
│   ├── lunch.html            新增：開團單頁面骨架（導覽、三欄、兩個 dialog、載入順序）
│   ├── index.html            修改：導覽列「開團單」改為連結
│   ├── bus.html              修改：導覽列「開團單」改為連結
│   ├── css/style.css         修改：末段新增「開團單」樣式
│   └── js/
│       ├── lunch.js          新增：CE.lunch — 純邏輯（狀態轉換、權限、小計、彙總、複製文字、資料格式檢查）
│       ├── lunch-demo.js     新增：CE.lunchDemo(now) — 示範成員與今天的三張卡片
│       ├── lunch-store.js    新增：CE.lunchStore — localStorage 讀寫、重置、目前身分
│       ├── lunch-app.js      新增：畫面狀態與三欄渲染、對話框、事件
│       └── app.js            修改：支援 index.html?store=ID 直接選中店家
└── .superpowers/sdd/2026-10-14-critieat-lunch-card-proto/
    ├── drive-lunch.js        新增：headless Chrome 操作與截圖腳本（一次性工具，比照公車地圖）
    └── progress.md           新增：進度紀錄
```

一次性檢查腳本放在 scratchpad（下文以 `<scratchpad>` 表示本次 session 的 scratchpad 目錄），不放進專案。

---

### Task 1: 開團單純邏輯 `lunch.js`

**Files:**
- Create: `proto/v1/js/lunch.js`
- Test: `<scratchpad>/check-lunch.js`（一次性，不放進專案）

**Interfaces:**
- Consumes: `CE.parseTime(str) → 分鐘 | null`、`CE.formatMin(分鐘) → 'HH:MM'`（`proto/v1/js/hours.js`）
- Produces: `CE.lunch` 物件：
  - `todayStr(now: Date) → 'YYYY-MM-DD'`、`nowMinutes(now) → number`
  - `parsePrice(v) → number | null | undefined`、`validateRows(rows) → (string|null)[]`
  - `can(card, actor) → { vote, start, edit, postpone, close, payer, cancel }`（皆 boolean）
  - `createCard(cards, { store: {id,name}, note, mode: 'propose'|'open', actor, closeAt, pickupAt, now }) → { cards, id }`
  - `toggleVote(cards, id, actor)`、`startOrdering(cards, id, actor)`、`setItems(cards, id, actor, rows, now)`、`postpone(cards, id, actor, minutes)`、`close(cards, id, actor, now)`、`setPayer(cards, id, actor, payer)`、`cancel(cards, id, actor)` → 新 cards（不合法時丟 `Error`，訊息給使用者看）
  - `cardsForDay(cards, day)`、`memberTotals(card) → [{ member, items, subtotal }]`、`totals(card) → { people, count, known, missing }`、`totalLabel(totals) → string`、`summary(card) → { lines: [{ name, note, qty, price }], people, count, known, missing }`、`summaryText(card) → string`、`pending(card) → string[]`、`countdown(card, now) → { overdue, minutes }`、`isValidDb(db) → boolean`
  - Card / Item 欄位見 spec「資料」一節

- [ ] **Step 1: 寫檢查腳本**

建立 `<scratchpad>/check-lunch.js`：

```js
// 一次性檢查腳本（不屬於專案）：node check-lunch.js <proto/v1/js 的路徑>
const path = require('path');
const assert = require('assert/strict');
const dir = process.argv[2];
require(path.join(dir, 'hours.js'));
require(path.join(dir, 'lunch.js'));
const L = globalThis.CE.lunch;

// 2026-10-14 13:18 台灣時間
const now = new Date('2026-10-14T05:18:00Z');
const store = { id: 'R006', name: '八方雲集' };
const base = { store, closeAt: '13:30', pickupAt: '14:00', now };
const throws = (fn, re) => assert.throws(fn, re);

// 日期與時間
assert.equal(L.todayStr(now), '2026-10-14');
assert.equal(L.todayStr(new Date('2026-10-14T16:30:00Z')), '2026-10-15'); // 台灣已過午夜
assert.equal(L.nowMinutes(now), 13 * 60 + 18);

// 建立：先提議
let r = L.createCard([], Object.assign({ mode: 'propose', actor: '阿明', note: ' 想吃辣 ' }, base));
let cards = r.cards; const pid = r.id;
let c = cards[0];
assert.equal(c.status, 'proposed'); assert.equal(c.owner, ''); assert.equal(c.payer, '');
assert.deepEqual(c.voters, ['阿明']); assert.equal(c.note, '想吃辣'); assert.equal(c.date, '2026-10-14');
throws(() => L.createCard([], Object.assign({ mode: 'propose', actor: '' }, base)), /選擇你是誰/);
throws(() => L.createCard([], Object.assign({}, base, { mode: 'open', actor: '阿明', store: null })), /選擇店家/);

// +1：提議者不能取消自己；其他人可以 +1 / 取消
throws(() => L.toggleVote(cards, pid, '阿明'), /不能 \+1/);
cards = L.toggleVote(cards, pid, '小美');
cards = L.toggleVote(cards, pid, '阿翔');
assert.deepEqual(cards[0].voters, ['阿明', '小美', '阿翔']);
cards = L.toggleVote(cards, pid, '阿翔');
assert.deepEqual(cards[0].voters, ['阿明', '小美']);
assert.deepEqual(r.cards[0].voters, ['阿明'], '不可修改傳入的陣列');

// 開始點餐：沒 +1 的人不行；+1 的人可以，成為開單者與付錢者
throws(() => L.startOrdering(cards, pid, '阿翔'), /提議者或 \+1/);
cards = L.startOrdering(cards, pid, '小美');
c = cards[0];
assert.equal(c.status, 'ordering'); assert.equal(c.owner, '小美'); assert.equal(c.payer, '小美');
throws(() => L.toggleVote(cards, pid, '阿翔'), /不能 \+1/);
throws(() => L.setPayer(cards, pid, '小美', '阿明'), /收單後/);

// 點餐：驗證
assert.deepEqual(L.validateRows([{ name: ' ', price: '' }, { name: 'a', price: '-1' }, { name: 'a', price: '3.5' }, { name: 'a', price: ' 70 ' }]),
  ['請填餐點名稱', '價格請填 0 以上的整數，或留空', '價格請填 0 以上的整數，或留空', null]);
throws(() => L.setItems(cards, pid, '阿明', [{ name: '', price: '' }], now), /需要修正/);
assert.equal(L.parsePrice('７０'), 70); assert.equal(L.parsePrice(''), null); assert.equal(L.parsePrice('$70'), undefined);

cards = L.setItems(cards, pid, '小美', [{ name: '招牌鍋貼 10 顆', price: '70', note: '' }, { name: '酸辣湯', price: '35', note: '' }], now);
cards = L.setItems(cards, pid, '阿明', [{ name: '招牌鍋貼 10 顆', price: '70', note: '' }], now);
cards = L.setItems(cards, pid, '阿翔', [{ name: '韭菜水餃 10 顆', price: '', note: '不要辣' }, { name: '韭菜水餃 10 顆', price: '75', note: '' }], now);
c = cards[0];
assert.deepEqual(c.items.map(i => i.member), ['小美', '小美', '阿明', '阿翔', '阿翔']);
assert.equal(c.items[3].price, null);
assert.ok(c.items.every(i => i.afterClose === false));
assert.deepEqual(L.pending(c), []); // 小美、阿明都點了

// 修改自己的列：位置不變、別人的列不受影響
const amingRow = c.items[2];
cards = L.setItems(cards, pid, '小美', [{ id: c.items[0].id, name: '招牌鍋貼 10 顆', price: '70', note: '' }], now); // 刪掉酸辣湯
c = cards[0];
assert.deepEqual(c.items.map(i => i.member), ['小美', '阿明', '阿翔', '阿翔']);
assert.deepEqual(c.items[1], amingRow); // 別人的列原封不動
assert.equal(c.changedAfterClose, false);

// 每人小計、合計、彙總
assert.deepEqual(L.memberTotals(c).map(m => [m.member, m.subtotal]), [['小美', 70], ['阿明', 70], ['阿翔', 75]]);
let s = L.summary(c);
assert.deepEqual(s.lines.map(l => [l.name, l.note, l.qty, l.price]),
  [['招牌鍋貼 10 顆', '', 2, 140], ['韭菜水餃 10 顆', '不要辣', 1, null], ['韭菜水餃 10 顆', '', 1, 75]]);
assert.deepEqual([s.people, s.count, s.known, s.missing], [3, 4, 215, 1]);
assert.equal(L.totalLabel(s), '3 人 已知 $215（1 項未填價格）');
assert.equal(L.summaryText(c), '八方雲集 10/14 取餐 14:00\n招牌鍋貼 10 顆 ×2\n韭菜水餃 10 顆（不要辣）×1\n韭菜水餃 10 顆 ×1\n共 4 項　已知 $215');

// 延後、收單：只有開單者
throws(() => L.postpone(cards, pid, '阿明'), /開單者/);
cards = L.postpone(cards, pid, '小美');
assert.equal(cards[0].closeAt, '13:40');
assert.deepEqual(L.countdown(cards[0], now), { overdue: false, minutes: 22 });
assert.deepEqual(L.countdown(cards[0], new Date('2026-10-14T05:45:00Z')), { overdue: true, minutes: 0 });
throws(() => L.close(cards, pid, '阿明', now), /開單者/);
cards = L.close(cards, pid, '小美', now);
assert.equal(cards[0].status, 'closed'); assert.ok(cards[0].closedAt);
throws(() => L.cancel(cards, pid, '小美'), /取消/); // 已收單不能取消

// 收單後修改：不鎖單，標記 afterClose 與 changedAfterClose
c = cards[0];
const unchanged = L.setItems(cards, pid, '阿明', [{ id: amingRow.id, name: '招牌鍋貼 10 顆', price: '70', note: '' }], now);
assert.equal(unchanged[0].changedAfterClose, false, '沒改東西不算修改');
cards = L.setItems(cards, pid, '阿明', [{ id: amingRow.id, name: '招牌鍋貼 10 顆', price: '70', note: '' }, { name: '玉米濃湯', price: '40', note: '' }], now);
c = cards[0];
assert.equal(c.changedAfterClose, true);
assert.deepEqual(c.items.filter(i => i.member === '阿明').map(i => i.afterClose), [false, true]);
// 已收單後刪除自己的列 → changedAfterClose
let d = L.createCard([], Object.assign({ mode: 'open', actor: 'A' }, base));
let dc = L.setItems(d.cards, d.id, 'A', [{ name: 'x', price: '' }], now);
dc = L.close(dc, d.id, 'A', now);
dc = L.setItems(dc, d.id, 'A', [], now);
assert.equal(dc[0].items.length, 0); assert.equal(dc[0].changedAfterClose, true);

// 付錢者：收單後任何人可改
cards = L.setPayer(cards, pid, '阿翔', '阿明');
assert.equal(cards[0].payer, '阿明');

// 權限表
const can = L.can(cards[0], '阿翔');
assert.deepEqual(can, { vote: false, start: false, edit: true, postpone: false, close: false, payer: true, cancel: false });
assert.equal(L.can(cards[0], '').edit, false);

// 取消：提議中為提議者，點餐中為開單者
r = L.createCard([], Object.assign({ mode: 'propose', actor: '阿明' }, base));
throws(() => L.cancel(r.cards, r.id, '小美'), /取消/);
assert.equal(L.cancel(r.cards, r.id, '阿明').length, 0);
r = L.createCard([], Object.assign({ mode: 'open', actor: '小華' }, base));
assert.equal(r.cards[0].owner, '小華'); assert.equal(r.cards[0].payer, '小華'); assert.equal(r.cards[0].status, 'ordering');
throws(() => L.cancel(r.cards, r.id, '阿明'), /取消/);
assert.equal(L.cancel(r.cards, r.id, '小華').length, 0);

// 全部有價格 / 全部沒價格 / 沒人點
assert.equal(L.totalLabel(L.summary({ items: [{ member: 'a', name: 'x', note: '', price: 10 }] })), '1 人 $10');
assert.equal(L.totalLabel(L.summary({ items: [{ member: 'a', name: 'x', note: '', price: null }] })), '1 人（未填價格）');
assert.equal(L.totalLabel(L.summary({ items: [] })), '還沒有人點餐');
assert.equal(L.summaryText({ storeName: 'S', date: '2026-10-04', pickupAt: '14:00', items: [{ member: 'a', name: 'x', note: '', price: null }] }), 'S 10/4 取餐 14:00\nx ×1\n共 1 項');
assert.equal(L.summaryText({ storeName: 'S', date: '2026-10-04', pickupAt: '14:00', items: [{ member: 'a', name: 'x', note: '', price: 5 }] }), 'S 10/4 取餐 14:00\nx ×1\n共 1 項　$5');

// 今天的卡片與排序
const mk = (id, status, date, createdAt) => ({ id, status, date, createdAt });
assert.deepEqual(L.cardsForDay([mk('a', 'closed', '2026-10-14', '1'), mk('b', 'proposed', '2026-10-14', '2'), mk('c', 'ordering', '2026-10-14', '3'), mk('d', 'ordering', '2026-10-13', '0'), mk('e', 'ordering', '2026-10-14', '0')], '2026-10-14').map(x => x.id), ['e', 'c', 'b', 'a']);

// 讀回資料的格式檢查
assert.equal(L.isValidDb({ members: ['a'], cards }), true);
assert.equal(L.isValidDb(null), false);
assert.equal(L.isValidDb({ members: 'a', cards: [] }), false);
assert.equal(L.isValidDb({ members: [], cards: [{ id: 'x' }] }), false);
assert.equal(L.isValidDb({ members: [], cards: [Object.assign({}, cards[0], { status: 'done' })] }), false);

console.log('LUNCH OK');
```

- [ ] **Step 2: 執行，確認失敗**

Run: `node <scratchpad>/check-lunch.js /Users/critical/Documents/critieat/proto/v1/js`
Expected: FAIL，`Cannot find module '.../lunch.js'`

- [ ] **Step 3: 寫 `proto/v1/js/lunch.js`**

```js
(function (CE) {
  'use strict';

  // 開團單純邏輯：不碰 DOM、不碰 localStorage。
  // 所有操作都是「舊的 cards 陣列 → 新的 cards 陣列」，不修改傳入的物件；不合法的操作丟出 Error（訊息給使用者看）。
  // 依賴 hours.js 的 CE.parseTime / CE.formatMin。

  const STATUSES = ['proposed', 'ordering', 'closed'];
  const STATUS_RANK = { ordering: 0, proposed: 1, closed: 2 };
  let seq = 0;

  function newId(prefix, now) {
    seq += 1;
    return prefix + now.getTime().toString(36) + seq.toString(36);
  }

  function clone(card) {
    return Object.assign({}, card, {
      voters: card.voters.slice(),
      items: card.items.map(it => Object.assign({}, it)),
    });
  }

  function find(cards, id) {
    const card = cards.find(c => c.id === id);
    if (!card) throw new Error('找不到這張午餐卡');
    return card;
  }

  // 以 id 替換一張卡片，回傳新陣列
  function replace(cards, card) {
    return cards.map(c => (c.id === card.id ? card : c));
  }

  // 台灣時間的今天 'YYYY-MM-DD'
  function todayStr(now) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
  }

  // 台灣時間現在是幾點，以分鐘表示
  function nowMinutes(now) {
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const get = t => Number(p.find(x => x.type === t).value);
    return get('hour') * 60 + get('minute');
  }

  // 價格欄：空白 → null；0 以上整數 → number；其他 → undefined（表示格式錯誤）。全形數字（中文輸入法）視同半形。
  function parsePrice(v) {
    const s = String(v == null ? '' : v).trim().replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    if (s === '') return null;
    return /^\d+$/.test(s) ? Number(s) : undefined;
  }

  // 檢查「我的餐點」編輯列。rows: [{ name, price, note }]（price 可為字串）
  // 回傳與 rows 等長的陣列，每列為 null（沒問題）或錯誤訊息
  function validateRows(rows) {
    return rows.map(r => {
      if (String(r.name == null ? '' : r.name).trim() === '') return '請填餐點名稱';
      if (parsePrice(r.price) === undefined) return '價格請填 0 以上的整數，或留空';
      return null;
    });
  }

  // 目前身分在這張卡片上可以做哪些事
  function can(card, actor) {
    const isOwner = !!actor && card.owner === actor;
    const st = card.status;
    return {
      vote: !!actor && st === 'proposed' && actor !== card.proposer,
      start: !!actor && st === 'proposed' && card.voters.includes(actor),
      edit: !!actor && (st === 'ordering' || st === 'closed'),
      postpone: isOwner && st === 'ordering',
      close: isOwner && st === 'ordering',
      payer: !!actor && st === 'closed',
      cancel: !!actor && (st === 'proposed' ? card.proposer === actor : st === 'ordering' && isOwner),
    };
  }

  function deny(ok, msg) {
    if (!ok) throw new Error(msg);
  }

  // 建立卡片。opts: { store: { id, name }, note, mode: 'propose' | 'open', actor, closeAt, pickupAt, now }
  // 回傳 { cards, id }
  function createCard(cards, opts) {
    deny(!!opts.actor, '請先選擇你是誰');
    deny(!!(opts.store && opts.store.id), '請選擇店家');
    deny(opts.mode === 'propose' || opts.mode === 'open', '未知的建立方式');
    const open = opts.mode === 'open';
    const card = {
      id: newId('c', opts.now),
      date: todayStr(opts.now),
      storeId: opts.store.id,
      storeName: opts.store.name,
      status: open ? 'ordering' : 'proposed',
      proposer: opts.actor,
      owner: open ? opts.actor : '',
      note: String(opts.note || '').trim(),
      voters: [opts.actor],
      closeAt: opts.closeAt,
      pickupAt: opts.pickupAt,
      payer: open ? opts.actor : '',
      createdAt: opts.now.toISOString(),
      closedAt: '',
      changedAfterClose: false,
      items: [],
    };
    return { cards: cards.concat([card]), id: card.id };
  }

  // +1 或取消 +1
  function toggleVote(cards, id, actor) {
    const card = clone(find(cards, id));
    deny(can(card, actor).vote, '現在不能 +1');
    card.voters = card.voters.includes(actor)
      ? card.voters.filter(v => v !== actor)
      : card.voters.concat([actor]);
    return replace(cards, card);
  }

  // 提議中 → 點餐中，按的人成為開單者與預設付錢者
  function startOrdering(cards, id, actor) {
    const card = clone(find(cards, id));
    deny(can(card, actor).start, '只有提議者或 +1 的人可以開始點餐');
    card.status = 'ordering';
    card.owner = actor;
    card.payer = actor;
    return replace(cards, card);
  }

  function sameRow(a, b) {
    return a.name === b.name && a.price === b.price && a.note === b.note;
  }

  // 用編輯區送出的列取代 actor 自己的點餐列。
  // rows: [{ id?, name, price, note }]；有 id 且屬於 actor 的列視為修改，沒有 id 視為新增，原有但沒送出的列視為刪除。
  // 已收單時：新增或有改動的列 afterClose = true；有任何新增、修改、刪除就把卡片 changedAfterClose 設為 true。
  function setItems(cards, id, actor, rows, now) {
    const card = clone(find(cards, id));
    deny(can(card, actor).edit, '現在不能修改餐點');
    const errors = validateRows(rows);
    deny(errors.every(e => e === null), '餐點有欄位需要修正');

    const closed = card.status === 'closed';
    const mine = new Map(card.items.filter(it => it.member === actor).map(it => [it.id, it]));
    let changed = false;
    const next = rows.map(r => {
      const row = {
        name: String(r.name).trim(),
        price: parsePrice(r.price),
        note: String(r.note == null ? '' : r.note).trim(),
      };
      const old = r.id ? mine.get(r.id) : null;
      if (old) {
        mine.delete(r.id);
        if (sameRow(old, row)) return old;
        changed = true;
        return Object.assign({}, old, row, { updatedAt: now.toISOString(), afterClose: old.afterClose || closed });
      }
      changed = true;
      return Object.assign({ id: newId('i', now), member: actor }, row, { updatedAt: now.toISOString(), afterClose: closed });
    });
    if (mine.size > 0) changed = true; // 有列被刪除

    // 保留其他人的列；actor 的列放在 actor 原本第一列的位置（沒有的話放最後）
    const firstIdx = card.items.findIndex(it => it.member === actor);
    const others = card.items.filter(it => it.member !== actor);
    const insertAt = firstIdx === -1
      ? others.length
      : card.items.slice(0, firstIdx).filter(it => it.member !== actor).length;
    card.items = others.slice(0, insertAt).concat(next, others.slice(insertAt));
    if (closed && changed) card.changedAfterClose = true;
    return replace(cards, card);
  }

  // 延後收單（預設 10 分鐘）
  function postpone(cards, id, actor, minutes) {
    const card = clone(find(cards, id));
    deny(can(card, actor).postpone, '只有開單者可以延後收單');
    const base = CE.parseTime(card.closeAt);
    card.closeAt = CE.formatMin((base === null ? 0 : base) + (minutes || 10));
    return replace(cards, card);
  }

  function close(cards, id, actor, now) {
    const card = clone(find(cards, id));
    deny(can(card, actor).close, '只有開單者可以收單');
    card.status = 'closed';
    card.closedAt = now.toISOString();
    return replace(cards, card);
  }

  function setPayer(cards, id, actor, payer) {
    const card = clone(find(cards, id));
    deny(can(card, actor).payer, '收單後才能設定付錢者');
    deny(!!payer, '請選擇付錢者');
    card.payer = payer;
    return replace(cards, card);
  }

  function cancel(cards, id, actor) {
    const card = find(cards, id);
    deny(can(card, actor).cancel, '只有開單者（提議中為提議者）可以取消');
    return cards.filter(c => c.id !== id);
  }

  // 只留今天的卡片，排序：點餐中 → 提議中 → 已收單，同狀態依建立時間
  function cardsForDay(cards, day) {
    return cards
      .filter(c => c.date === day)
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.createdAt.localeCompare(b.createdAt));
  }

  // 每人一筆：{ member, items, subtotal }；subtotal 為有填價格的列加總，全部沒填為 null。依第一次出現的順序。
  function memberTotals(card) {
    const map = new Map();
    card.items.forEach(it => {
      if (!map.has(it.member)) map.set(it.member, { member: it.member, items: [], subtotal: null });
      const m = map.get(it.member);
      m.items.push(it);
      if (it.price !== null) m.subtotal = (m.subtotal || 0) + it.price;
    });
    return Array.from(map.values());
  }

  // 合計：{ people, count, known, missing }；known 為已填價格加總，missing 為沒填價格的列數
  function totals(card) {
    const people = new Set(card.items.map(it => it.member)).size;
    const priced = card.items.filter(it => it.price !== null);
    return {
      people,
      count: card.items.length,
      known: priced.reduce((s, it) => s + it.price, 0),
      missing: card.items.length - priced.length,
    };
  }

  // 訂餐彙總：品項名稱與備註都相同的列合併。lines: [{ name, note, qty, price }]，price 為已填價格加總，全沒填為 null
  function summary(card) {
    const map = new Map();
    card.items.forEach(it => {
      const key = it.name + '\u0000' + it.note;
      if (!map.has(key)) map.set(key, { name: it.name, note: it.note, qty: 0, price: null });
      const line = map.get(key);
      line.qty += 1;
      if (it.price !== null) line.price = (line.price || 0) + it.price;
    });
    return Object.assign({ lines: Array.from(map.values()) }, totals(card));
  }

  // 合計的顯示文字，例如「4 人 $395」「3 人 已知 $230（2 項未填價格）」「2 人」
  function totalLabel(t) {
    if (t.count === 0) return '還沒有人點餐';
    if (t.missing === 0) return `${t.people} 人 $${t.known}`;
    if (t.missing === t.count) return `${t.people} 人（未填價格）`;
    return `${t.people} 人 已知 $${t.known}（${t.missing} 項未填價格）`;
  }

  // 複製用的彙總純文字
  function summaryText(card) {
    const s = summary(card);
    const [, m, d] = card.date.split('-').map(Number);
    const out = [`${card.storeName} ${m}/${d} 取餐 ${card.pickupAt}`];
    s.lines.forEach(l => out.push(`${l.name}${l.note ? `（${l.note}）` : ' '}×${l.qty}`));
    let last = `共 ${s.count} 項`;
    if (s.missing === 0 && s.count > 0) last += `　$${s.known}`;
    else if (s.missing < s.count) last += `　已知 $${s.known}`;
    out.push(last);
    return out.join('\n');
  }

  // +1 了但還沒有點餐的人（點餐中、已收單才有意義）
  function pending(card) {
    const ordered = new Set(card.items.map(it => it.member));
    return card.voters.filter(v => !ordered.has(v));
  }

  // 收單倒數：{ overdue, minutes }；minutes 為距離收單還有幾分鐘（overdue 時為 0）
  function countdown(card, now) {
    const close = CE.parseTime(card.closeAt);
    const left = close === null ? 0 : close - nowMinutes(now);
    return { overdue: left < 0, minutes: Math.max(left, 0) };
  }

  // 檢查從 localStorage 讀回來的資料格式
  function isValidDb(db) {
    if (!db || typeof db !== 'object') return false;
    if (!Array.isArray(db.members) || !db.members.every(m => typeof m === 'string')) return false;
    if (!Array.isArray(db.cards)) return false;
    return db.cards.every(c =>
      c && typeof c.id === 'string' && typeof c.date === 'string' && STATUSES.includes(c.status) &&
      typeof c.storeId === 'string' && typeof c.storeName === 'string' &&
      Array.isArray(c.voters) && Array.isArray(c.items) &&
      c.items.every(it => it && typeof it.id === 'string' && typeof it.member === 'string' &&
        typeof it.name === 'string' && (it.price === null || Number.isInteger(it.price)))
    );
  }

  CE.lunch = {
    todayStr, nowMinutes, parsePrice, validateRows, can,
    createCard, toggleVote, startOrdering, setItems, postpone, close, setPayer, cancel,
    cardsForDay, memberTotals, totals, totalLabel, summary, summaryText, pending, countdown, isValidDb,
  };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 4: 執行，確認通過**

Run: `node <scratchpad>/check-lunch.js /Users/critical/Documents/critieat/proto/v1/js`
Expected: 印出 `LUNCH OK`

- [ ] **Step 5: 記錄進度**

建立 `.superpowers/sdd/2026-10-14-critieat-lunch-card-proto/progress.md`：

```
# 開團單 proto 進度 — spec: docs/specs/2026-10-14-critieat-lunch-card-design.md, plan: docs/plans/2026-10-14-critieat-lunch-card-proto.md
Task 1 lunch.js: done — check-lunch.js → LUNCH OK
```

（不做 git commit：專案不受版控。）

---

### Task 2: 示範資料與儲存 `lunch-demo.js`、`lunch-store.js`

**Files:**
- Create: `proto/v1/js/lunch-demo.js`
- Create: `proto/v1/js/lunch-store.js`
- Test: `<scratchpad>/check-store.js`（一次性）

**Interfaces:**
- Consumes: `CE.lunch.todayStr`、`CE.lunch.isValidDb`（Task 1）
- Produces:
  - `CE.lunchDemo(now) → { members: string[], cards: Card[] }`：卡片 `demo-c1`（八方雲集 R006，點餐中，小華開單）、`demo-c2`（涮嘴 R004，提議中，阿明提議 +2）、`demo-c3`（虎記魯肉飯 R002，已收單，2 項沒價格、1 列收單後修改）
  - `CE.lunchStore.load(now) → { db, warning: string|null }`、`save(db) → boolean`、`reset(now) → db`、`getMe() → string`、`setMe(name)`
  - localStorage key：`critieat.lunch.v1`（資料）、`critieat.me`（身分）

- [ ] **Step 1: 寫檢查腳本**

建立 `<scratchpad>/check-store.js`：

```js
// 一次性檢查腳本（不屬於專案）：node check-store.js <proto/v1/js 的路徑>
const path = require('path');
const assert = require('assert/strict');
const dir = process.argv[2];
let mem = {}; let broken = false;
globalThis.localStorage = {
  getItem(k) { if (broken) throw new Error('blocked'); return k in mem ? mem[k] : null; },
  setItem(k, v) { if (broken) throw new Error('blocked'); mem[k] = String(v); },
};
['hours.js', 'lunch.js', 'lunch-demo.js', 'lunch-store.js'].forEach(f => require(path.join(dir, f)));
const { lunch: L, lunchStore: S, lunchDemo } = globalThis.CE;
const now = new Date('2026-10-14T05:18:00Z');

// 示範資料：格式正確、日期是今天、三種狀態各一張
const demo = lunchDemo(now);
assert.equal(L.isValidDb(demo), true);
assert.ok(demo.cards.every(c => c.date === '2026-10-14'));
assert.deepEqual(L.cardsForDay(demo.cards, '2026-10-14').map(c => c.status), ['ordering', 'proposed', 'closed']);
assert.equal(L.totalLabel(L.summary(demo.cards[2])), '4 人 已知 $115（2 項未填價格）');
assert.deepEqual(L.pending(demo.cards[0]), ['阿翔']);

// 第一次打開：沒有資料 → 示範資料、沒有警告、已存檔
let r = S.load(now);
assert.equal(r.warning, null); assert.equal(r.db.cards.length, 3); assert.ok(mem['critieat.lunch.v1']);

// 存檔後讀回
const changed = L.toggleVote(r.db.cards, 'demo-c2', '小明');
assert.equal(S.save({ members: r.db.members, cards: changed }), true);
assert.deepEqual(S.load(now).db.cards[1].voters, ['阿明', '小美', '阿翔', '小明']);

// 格式壞掉 → 示範資料 + 警告
mem['critieat.lunch.v1'] = '{oops';
r = S.load(now);
assert.equal(r.warning, '本機資料無法讀取，已載入示範資料'); assert.equal(r.db.cards.length, 3);
mem['critieat.lunch.v1'] = JSON.stringify({ members: [], cards: [{ id: 1 }] });
assert.ok(S.load(now).warning);

// 重置
S.save({ members: [], cards: [] });
assert.equal(S.reset(now).cards.length, 3);
assert.equal(S.load(now).db.cards.length, 3);

// 身分
assert.equal(S.getMe(), ''); S.setMe('小明'); assert.equal(S.getMe(), '小明');

// localStorage 不能用：不丟錯
broken = true;
r = S.load(now);
assert.equal(r.warning, '本機資料無法讀取，已載入示範資料'); assert.equal(r.db.cards.length, 3);
assert.equal(S.save(r.db), false); assert.equal(S.getMe(), ''); S.setMe('x');

console.log('STORE OK');
```

- [ ] **Step 2: 執行，確認失敗**

Run: `node <scratchpad>/check-store.js /Users/critical/Documents/critieat/proto/v1/js`
Expected: FAIL，`Cannot find module '.../lunch-demo.js'`

- [ ] **Step 3: 寫 `proto/v1/js/lunch-demo.js`**

```js
(function (CE) {
  'use strict';
  // 開團單示範資料。日期一律套成「今天」，所以每天打開都有資料。店家 ID 對應 data.js。
  const MEMBERS = ['小明', '小華', '阿明', '小美', '阿翔', '阿傑', '小芳', '阿凱', '小婷', '阿德'];

  CE.lunchDemo = function lunchDemo(now) {
    const date = CE.lunch.todayStr(now);
    const at = min => new Date(now.getTime() - min * 60000).toISOString();
    const item = (id, member, name, price, note, afterClose) =>
      ({ id: 'demo-i' + id, member, name, price, note: note || '', updatedAt: at(20), afterClose: !!afterClose });
    const card = o => Object.assign({
      date, note: '', closeAt: '13:30', pickupAt: '14:00', closedAt: '', changedAfterClose: false,
    }, o);

    return {
      members: MEMBERS.slice(),
      cards: [
        card({
          id: 'demo-c1', storeId: 'R006', storeName: '八方雲集 南港興華店', status: 'ordering',
          proposer: '小華', owner: '小華', payer: '小華', createdAt: at(40),
          voters: ['小華', '阿明', '小美', '阿翔'],
          items: [
            item(1, '小華', '招牌鍋貼 10 顆', 70), item(2, '小華', '酸辣湯', 35),
            item(3, '阿明', '招牌鍋貼 10 顆', 70),
            item(4, '小美', '韭菜水餃 10 顆', 75, '不要辣'), item(5, '小美', '玉米濃湯', 40),
          ],
        }),
        card({
          id: 'demo-c2', storeId: 'R004', storeName: '涮嘴 南港店', status: 'proposed',
          proposer: '阿明', owner: '', payer: '', note: '今天想吃辣的', createdAt: at(30),
          voters: ['阿明', '小美', '阿翔'], items: [],
        }),
        card({
          id: 'demo-c3', storeId: 'R002', storeName: '虎記魯肉飯', status: 'closed',
          proposer: '阿傑', owner: '阿傑', payer: '阿傑', createdAt: at(90), closedAt: at(25),
          changedAfterClose: true, voters: ['阿傑', '小芳', '阿凱', '小婷'],
          items: [
            item(6, '阿傑', '魯肉飯（大）', 50), item(7, '阿傑', '滷蛋', 15),
            item(8, '小芳', '雞腿飯', null),
            item(9, '阿凱', '魯肉飯（大）', 50),
            item(10, '小婷', '排骨飯', null, '飯少', true),
          ],
        }),
      ],
    };
  };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 4: 寫 `proto/v1/js/lunch-store.js`**

```js
(function (CE) {
  'use strict';
  // 開團單資料存在瀏覽器 localStorage。讀不到（私密視窗、被封鎖）或格式壞掉時改用示範資料。
  const KEY = 'critieat.lunch.v1';
  const ME_KEY = 'critieat.me';
  const BROKEN = '本機資料無法讀取，已載入示範資料';

  // 回傳字串、null（沒有資料），或 undefined（localStorage 無法使用）
  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return undefined; }
  }

  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch (e) { return false; }
  }

  // 回傳 { db, warning }；db: { members: string[], cards: Card[] }
  function load(now) {
    const raw = read(KEY);
    if (raw === undefined) return { db: CE.lunchDemo(now), warning: BROKEN };
    if (raw !== null) {
      try {
        const db = JSON.parse(raw);
        if (CE.lunch.isValidDb(db)) return { db, warning: null };
      } catch (e) { /* 格式壞掉，往下改用示範資料 */ }
    }
    const db = CE.lunchDemo(now);
    save(db);
    return { db, warning: raw === null ? null : BROKEN };
  }

  function reset(now) {
    const db = CE.lunchDemo(now);
    save(db);
    return db;
  }

  function getMe() {
    return read(ME_KEY) || '';
  }

  function setMe(name) {
    try { localStorage.setItem(ME_KEY, name); } catch (e) { /* 存不了就只在這次有效 */ }
  }

  CE.lunchStore = { load, save, reset, getMe, setMe };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 5: 執行兩支檢查，確認通過**

Run: `node <scratchpad>/check-store.js /Users/critical/Documents/critieat/proto/v1/js && node <scratchpad>/check-lunch.js /Users/critical/Documents/critieat/proto/v1/js`
Expected: `STORE OK`、`LUNCH OK`

- [ ] **Step 6: 記錄進度**

在 `.superpowers/sdd/2026-10-14-critieat-lunch-card-proto/progress.md` 加一行：`Task 2 lunch-demo.js + lunch-store.js: done — STORE OK`

---

### Task 3: 開團單頁面 `lunch.html`、`lunch-app.js`、樣式

**Files:**
- Create: `proto/v1/lunch.html`
- Create: `proto/v1/js/lunch-app.js`
- Modify: `proto/v1/css/style.css`（檔案最末尾附加，不改既有規則）
- Create: `.superpowers/sdd/2026-10-14-critieat-lunch-card-proto/drive-lunch.js`

**Interfaces:**
- Consumes: Task 1 的 `CE.lunch.*`、Task 2 的 `CE.lunchDemo`、`CE.lunchStore.*`；既有的 `CE.parseCsv`、`CE.rowsToSettings`、`CE.rowsToStores`、`CE.buildViewModel(stores, settings, dayKey) → StoreView[]`（含 `status`、`todayHours`）、`CE.todayKey(now)`、`CE.formatMin`、`CE.DEMO_STORES_CSV`、`CE.DEMO_SETTINGS_CSV`；`buildViewModel` 需要 `geo.js` 的 `CE.distanceMeters`
- Produces: 頁面 DOM id：`today-label`、`me-btn`、`notice`、`card-list`、`card-view`、`side`、`me-dlg`、`new-dlg`（Task 3 的 driver 與 Task 5 依賴）；右欄連結 `index.html?store=<店家ID>`（Task 4 接收）

- [ ] **Step 1: 寫 `proto/v1/lunch.html`**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CRITIEAT 開團單</title>
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
        <a href="index.html">美食地圖</a>
        <a class="is-active" href="lunch.html">開團單</a>
        <a href="bus.html">公車地圖</a>
      </nav>
      <div class="hdr__right">
        <span id="today-label" class="today mono"></span>
        <button class="pill" type="button" id="me-btn"></button>
      </div>
    </header>
    <p class="notice" id="notice" role="status" hidden></p>

    <main class="main main--lunch">
      <section class="list" id="card-list" aria-label="今天的午餐卡"></section>
      <section class="lcard" id="card-view" aria-label="午餐卡內容"></section>
      <aside class="detail lside" id="side" aria-label="店家資訊或訂餐彙總" hidden></aside>
    </main>
  </div>

  <dialog class="dlg" id="me-dlg" aria-label="選擇身分"></dialog>
  <dialog class="dlg" id="new-dlg" aria-label="提議或開單"></dialog>

  <script src="js/csv.js"></script>
  <script src="js/hours.js"></script>
  <script src="js/geo.js"></script>
  <script src="js/stores.js"></script>
  <script src="js/data.js"></script>
  <script src="js/lunch.js"></script>
  <script src="js/lunch-demo.js"></script>
  <script src="js/lunch-store.js"></script>
  <script src="js/lunch-app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 寫 `proto/v1/js/lunch-app.js`**

```js
(function (CE) {
  'use strict';

  const L = CE.lunch;
  const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
  const STATUS_LABEL = { proposed: '○ 提議中', ordering: '● 點餐中', closed: '■ 已收單' };

  const state = {
    db: null,            // { members, cards }
    me: '',              // 目前身分
    day: '',             // 今天 'YYYY-MM-DD'
    settings: null,
    stores: [],          // StoreView[]（已依今天營業狀態排序）
    selectedId: null,
    draft: [],           // 「我的餐點」編輯列 [{ id?, name, price, note }]，price 為字串
    draftFor: '',        // draft 對應的「卡片|身分」，換卡片或身分時重建
    rowErrors: [],       // 與 draft 等長，null 或錯誤訊息
    confirmCancel: false,
    copied: false,
    copyFallback: false,
  };

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

  function input(cls, value, placeholder, onInput) {
    const i = el('input', cls);
    i.value = value;
    i.placeholder = placeholder;
    i.setAttribute('aria-label', placeholder);
    i.addEventListener('input', e => onInput(e.target.value));
    return i;
  }

  const $ = id => document.getElementById(id);
  const now = () => new Date();
  const todays = () => L.cardsForDay(state.db.cards, state.day);
  const selected = () => todays().find(c => c.id === state.selectedId) || null;
  const storeOf = card => state.stores.find(s => s.id === card.storeId) || null;
  const clock = iso => CE.formatMin(L.nowMinutes(new Date(iso)));
  const blankRow = () => ({ name: '', price: '', note: '' });
  const isBlank = r => [r.name, r.price, r.note].every(v => String(v == null ? '' : v).trim() === '');

  function notice(msg) {
    $('notice').textContent = msg || '';
    $('notice').hidden = !msg;
  }

  function resetView() {
    state.draftFor = '';
    state.rowErrors = [];
    state.confirmCancel = false;
    state.copied = false;
    state.copyFallback = false;
  }

  // 執行一個卡片操作：fn(舊 cards) → 新 cards。成功就存檔、執行 onOk、重畫；失敗顯示錯誤訊息。
  function act(fn, onOk) {
    let next;
    try {
      next = fn(state.db.cards);
    } catch (e) {
      notice(e.message);
      return;
    }
    state.db = Object.assign({}, state.db, { cards: next });
    notice(CE.lunchStore.save(state.db) ? '' : '無法存到瀏覽器，重新整理後這次的變更會不見');
    if (onOk) onOk();
    render();
  }

  function addMember(name) {
    if (state.db.members.includes(name)) return;
    state.db = Object.assign({}, state.db, { members: state.db.members.concat([name]) });
    CE.lunchStore.save(state.db);
  }

  function setMe(name) {
    addMember(name);
    state.me = name;
    CE.lunchStore.setMe(name);
    resetView();
    render();
  }

  function select(id) {
    state.selectedId = id;
    resetView();
    render();
  }

  function selectFirst() {
    const first = todays()[0];
    state.selectedId = first ? first.id : null;
    resetView();
  }

  // 換了卡片或身分時，用我目前的點餐列重建編輯區
  function syncDraft() {
    const card = selected();
    const key = (card ? card.id : '') + '|' + state.me;
    if (key === state.draftFor) return;
    state.draftFor = key;
    state.rowErrors = [];
    state.draft = card
      ? card.items.filter(it => it.member === state.me)
        .map(it => ({ id: it.id, name: it.name, price: it.price === null ? '' : String(it.price), note: it.note }))
      : [];
    if (state.draft.length === 0) state.draft.push(blankRow());
  }

  function countdownText(card) {
    const c = L.countdown(card, now());
    return c.overdue ? '已超過收單時間' : `剩 ${c.minutes} 分鐘`;
  }

  // ── 頁首 ──
  function renderHeader() {
    const [, m, d] = state.day.split('-').map(Number);
    const wd = WEEKDAY[new Date(state.day + 'T12:00:00Z').getUTCDay()];
    $('today-label').textContent = `TODAY · ${m}/${d}（${wd}）`;
    $('me-btn').textContent = `👤 ${state.me || '選擇身分'} ▾`;
  }

  // ── 左欄：今天的卡片 ──
  function renderList() {
    const box = $('card-list');
    box.replaceChildren();
    const list = todays();
    const head = el('div', 'list__head mono');
    head.append(el('span', null, `今天的午餐卡 / ${list.length}`));
    box.append(head);
    if (list.length === 0) box.append(el('p', 'empty', '今天還沒有人開團'));

    list.forEach(c => {
      const item = button(`item item--${c.status}`, null, () => select(c.id));
      if (c.id === state.selectedId) item.classList.add('is-selected');
      const meta = c.status === 'proposed'
        ? `${c.proposer} 提議`
        : `${c.owner} 開單 · ${c.closeAt} ${c.status === 'closed' ? '已收單' : '收單'}`;
      const count = c.status === 'proposed'
        ? `+${c.voters.length - 1}`
        : `${L.totals(c).people} 人`;
      item.append(
        el('span', 'item__name', c.storeName),
        el('span', 'item__meta', meta),
        el('span', `badge badge--${c.status}`, `${STATUS_LABEL[c.status]} · ${count}`)
      );
      box.append(item);
    });

    box.append(
      button('btn btn--primary list__new', '＋ 提議／開單', openNew),
      button('list__reset', '重置示範資料', resetDemo)
    );
  }

  // ── 中欄：選中的卡片 ──
  function renderCard() {
    const box = $('card-view');
    box.replaceChildren();
    const card = selected();
    if (!card) {
      box.append(el('p', 'empty', '今天還沒有人開團'), button('btn btn--primary', '＋ 提議／開單', openNew));
      return;
    }
    const can = L.can(card, state.me);

    const title = el('div', 'lcard__title');
    title.append(el('h3', null, card.storeName), el('span', `badge badge--${card.status}`, STATUS_LABEL[card.status]));
    box.append(title);

    const sub = el('div', 'lcard__sub');
    if (card.status === 'proposed') {
      sub.append(el('span', null, `${card.proposer} 提議 · ${clock(card.createdAt)}`));
    } else {
      sub.append(el('span', null, `${card.owner} 開單`), el('span', 'mono', `${card.closeAt} ${card.status === 'closed' ? '已收單' : '收單'}`));
      if (card.status === 'ordering') sub.append(el('span', 'lcard__count', countdownText(card)));
      sub.append(el('span', null, `預計 ${card.pickupAt} 取餐`));
    }
    box.append(sub);
    if (card.note) box.append(el('p', 'lcard__note', `「${card.note}」`));
    box.append(el('div', 'hr'));

    if (card.status === 'proposed') renderProposal(box, card, can);
    else renderOrders(box, card, can);

    if (can.cancel) {
      const label = state.confirmCancel ? '確定取消這團？再按一次' : '取消這團';
      box.append(button(`btn btn--danger lcard__cancel${state.confirmCancel ? ' is-confirm' : ''}`, label, () => {
        if (!state.confirmCancel) { state.confirmCancel = true; renderCard(); return; }
        act(cs => L.cancel(cs, card.id, state.me), selectFirst);
      }));
    }
  }

  function renderProposal(box, card, can) {
    box.append(el('div', 'sect', `想吃的人 / ${card.voters.length}`));
    const chips = el('div', 'voters');
    card.voters.forEach(v => chips.append(el('span', 'voter', v === card.proposer ? `${v}（提議）` : v)));
    box.append(chips);

    const btns = el('div', 'btns btns--top');
    if (can.vote) {
      const voted = card.voters.includes(state.me);
      btns.append(button('btn', voted ? '取消 +1' : '＋1 我也想吃', () => act(cs => L.toggleVote(cs, card.id, state.me))));
    }
    if (can.start) btns.append(button('btn btn--primary', '開始點餐 →', () => act(cs => L.startOrdering(cs, card.id, state.me), resetView)));
    if (btns.children.length) box.append(btns);
    box.append(el('p', 'hint', '提議的人或 +1 的人可以按「開始點餐」，按的人就是開單者。'));
  }

  function renderOrders(box, card, can) {
    const rows = L.memberTotals(card);
    if (rows.length === 0) {
      box.append(el('p', 'empty', '還沒有人點餐'));
    } else {
      const table = el('table', 'orders');
      rows.forEach(r => {
        const tr = el('tr');
        const items = el('td', 'orders__items');
        r.items.forEach(it => {
          const line = el('div', 'orders__line');
          line.append(el('span', null, it.name));
          if (it.note) line.append(el('span', 'orders__note', it.note));
          if (it.afterClose) line.append(el('span', 'tag tag--late', '收單後修改'));
          if (card.status === 'ordering' && it.price !== null) line.append(el('span', 'orders__price mono', `$${it.price}`));
          items.append(line);
        });
        tr.append(
          el('td', 'orders__who', r.member),
          items,
          el('td', 'orders__sum mono', r.subtotal === null ? '—' : `$${r.subtotal}`)
        );
        table.append(tr);
      });
      box.append(table, el('div', 'orders__total', L.totalLabel(L.totals(card))));
    }

    const waiting = L.pending(card);
    if (waiting.length) box.append(el('p', 'hint', `還沒點：${waiting.join('、')}`));

    if (card.status === 'closed') {
      const row = el('label', 'payer');
      const sel = el('select', 'payer__select');
      sel.disabled = !can.payer;
      state.db.members.forEach(m => {
        const o = el('option', null, m);
        o.value = m;
        if (m === card.payer) o.selected = true;
        sel.append(o);
      });
      sel.addEventListener('change', () => act(cs => L.setPayer(cs, card.id, state.me, sel.value)));
      row.append(el('span', null, '付錢者'), sel);
      box.append(row);
    }

    if (can.edit) renderEditor(box, card);
    else if (!state.me) box.append(button('btn', '先選擇你是誰再點餐', () => openMe(true)));

    if (can.close) {
      const btns = el('div', 'btns btns--top');
      btns.append(
        button('btn', '延後收單 +10 分鐘', () => act(cs => L.postpone(cs, card.id, state.me, 10))),
        button('btn btn--primary', '現在收單', () => act(cs => L.close(cs, card.id, state.me, now())))
      );
      box.append(el('div', 'sect', '開單的人才看得到'), btns);
    }
  }

  function renderEditor(box, card) {
    const wrap = el('div', 'editor');
    wrap.append(el('div', 'sect', `我的餐點（${state.me}）`));
    state.draft.forEach((row, i) => {
      const r = el('div', 'editor__row' + (state.rowErrors[i] ? ' is-error' : ''));
      const price = input('editor__price', row.price, '價格', v => { row.price = v; });
      price.inputMode = 'numeric';
      const del = button('editor__del', '×', () => {
        state.draft.splice(i, 1);
        if (state.draft.length === 0) state.draft.push(blankRow());
        state.rowErrors = [];
        renderCard();
      });
      del.setAttribute('aria-label', '刪除這一項');
      r.append(
        input('editor__name', row.name, '餐點名稱', v => { row.name = v; }),
        price,
        input('editor__note', row.note, '備註（選填）', v => { row.note = v; }),
        del
      );
      wrap.append(r);
      if (state.rowErrors[i]) wrap.append(el('div', 'editor__err', state.rowErrors[i]));
    });
    const btns = el('div', 'btns btns--top');
    btns.append(
      button('btn', '＋ 再加一項', () => { state.draft.push(blankRow()); renderCard(); }),
      button('btn btn--primary', '送出', () => submitDraft(card))
    );
    wrap.append(btns);
    box.append(wrap);
  }

  function submitDraft(card) {
    const errors = state.draft.map(r => (isBlank(r) ? null : L.validateRows([r])[0]));
    if (errors.some(Boolean)) {
      state.rowErrors = errors;
      renderCard();
      return;
    }
    const rows = state.draft.filter(r => !isBlank(r));
    act(cs => L.setItems(cs, card.id, state.me, rows, now()), () => {
      resetView();
      notice('已送出');
    });
  }

  // ── 右欄：店家資訊或訂餐彙總 ──
  function renderSide() {
    const box = $('side');
    box.replaceChildren();
    const card = selected();
    if (!card) { box.hidden = true; return; }
    box.hidden = false;
    if (card.status === 'closed') renderSummary(box, card, storeOf(card));
    else renderStore(box, card, storeOf(card));
  }

  function phoneLink(phone, label) {
    const a = el('a', 'btn', label);
    a.href = 'tel:' + phone.replace(/[^\d+]/g, '');
    return a;
  }

  function renderStore(box, card, store) {
    if (!store) {
      box.append(el('h3', 'detail__name', card.storeName), el('p', 'empty', '找不到店家資料'));
      return;
    }
    box.append(
      el('span', 'detail__kicker', store.category),
      el('h3', 'detail__name', store.name),
      el('span', `badge badge--${store.status}`, `今天 ${store.todayHours || '營業時間未填'}`)
    );
    const rows = el('dl', 'detail__rows');
    [['電話', store.phone], ['地址', store.address]].forEach(([k, v]) => {
      const row = el('div', 'detail__row');
      row.append(el('dt', null, k), el('dd', null, v || '—'));
      rows.append(row);
    });
    box.append(rows, el('div', 'sect', '菜單照片'), el('div', 'menu__ph', '尚未上傳菜單'));
    const link = el('a', 'btn', '在美食地圖上看這家 →');
    link.href = 'index.html?store=' + encodeURIComponent(store.id);
    const btns = el('div', 'btns');
    btns.append(link);
    box.append(btns);
  }

  function renderSummary(box, card, store) {
    const s = L.summary(card);
    box.append(
      el('span', 'detail__kicker', '訂餐彙總'),
      el('h3', 'detail__name', card.storeName),
      el('div', 'detail__sub', `取餐 ${card.pickupAt} · 付錢者 ${card.payer || '—'}`)
    );
    if (card.changedAfterClose) box.append(el('p', 'lside__warn', '收單後有修改，訂餐前請再確認'));
    if (s.count === 0) {
      box.append(el('p', 'empty', '沒有人點餐'));
    } else {
      const table = el('table', 'sum');
      s.lines.forEach(l => {
        const tr = el('tr');
        const name = el('td');
        name.append(el('span', null, l.name));
        if (l.note) name.append(el('span', 'orders__note', l.note));
        tr.append(name, el('td', 'mono', `×${l.qty}`), el('td', 'mono sum__price', l.price === null ? '—' : `$${l.price}`));
        table.append(tr);
      });
      const total = el('tr', 'sum__total');
      const price = s.missing === 0 ? `$${s.known}` : s.missing === s.count ? '—' : `已知 $${s.known}`;
      total.append(el('td', null, '合計'), el('td', 'mono', `${s.count} 項`), el('td', 'mono sum__price', price));
      table.append(total);
      box.append(table);
    }

    const btns = el('div', 'btns');
    btns.append(button('btn btn--primary', state.copied ? '已複製 ✓' : '複製彙總文字', () => copySummary(card)));
    if (store && store.phone) btns.append(phoneLink(store.phone, `📞 ${store.phone}`));
    box.append(btns);

    if (state.copyFallback) {
      const ta = el('textarea', 'copybox');
      ta.readOnly = true;
      ta.value = L.summaryText(card);
      ta.rows = s.lines.length + 2;
      box.append(el('p', 'hint', '無法自動複製，請自己選取下面的文字複製：'), ta);
      setTimeout(() => ta.select(), 0);
    }
  }

  function copySummary(card) {
    const text = L.summaryText(card);
    const done = ok => {
      state.copied = ok;
      state.copyFallback = !ok;
      renderSide();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
    } else {
      done(false);
    }
  }

  // ── 對話框 ──
  // required = true 時（還沒選身分）不能關掉
  function openMe(required) {
    const d = $('me-dlg');
    d.replaceChildren();
    d.append(el('h3', 'dlg__title', '你是誰？'), el('p', 'hint', '選自己的名字；名單裡沒有就新增。只存在這台電腦的瀏覽器。'));
    const grid = el('div', 'members');
    state.db.members.forEach(m => {
      grid.append(button('voter voter--btn' + (m === state.me ? ' is-active' : ''), m, () => { d.close(); setMe(m); }));
    });
    const add = el('div', 'dlg__row');
    const name = input('search', '', '新增名字', () => {});
    const join = () => {
      const v = name.value.trim();
      if (!v) return;
      d.close();
      setMe(v);
    };
    name.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
    add.append(name, button('btn btn--primary', '加入', join));
    d.append(grid, add);
    if (!required) {
      const btns = el('div', 'btns');
      btns.append(button('btn', '取消', () => d.close()));
      d.append(btns);
    }
    d.oncancel = e => { if (!state.me) e.preventDefault(); };
    d.showModal();
  }

  function openNew() {
    if (!state.me) { openMe(true); return; }
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
    const fieldStore = el('label', 'dlg__field');
    fieldStore.append(el('span', 'sect', '店家'), sel);
    const fieldNote = el('label', 'dlg__field');
    fieldNote.append(el('span', 'sect', '備註'), note);
    const btns = el('div', 'btns');
    btns.append(
      button('btn', '取消', () => d.close()),
      button('btn', '先提議', () => create('propose')),
      button('btn btn--primary', '直接開單', () => create('open'))
    );
    d.append(fieldStore, fieldNote, btns);
    d.showModal();
  }

  function resetDemo() {
    state.db = CE.lunchStore.reset(now());
    if (state.me) addMember(state.me);
    selectFirst();
    render();
    notice('已重置示範資料');
  }

  function render() {
    syncDraft();
    renderHeader();
    renderList();
    renderCard();
    renderSide();
  }

  // 每 30 秒更新收單倒數（只改文字，不重畫，避免打斷正在輸入的欄位）
  function tick() {
    const card = selected();
    const span = document.querySelector('.lcard__count');
    if (card && span && card.status === 'ordering') span.textContent = countdownText(card);
  }

  function init() {
    const t = now();
    state.day = L.todayStr(t);
    state.settings = CE.rowsToSettings(CE.parseCsv(CE.DEMO_SETTINGS_CSV));
    state.stores = CE.buildViewModel(
      CE.rowsToStores(CE.parseCsv(CE.DEMO_STORES_CSV)), state.settings, CE.todayKey(t)
    );
    const loaded = CE.lunchStore.load(t);
    state.db = loaded.db;
    state.me = CE.lunchStore.getMe();
    if (state.me) addMember(state.me);
    selectFirst();

    $('me-btn').addEventListener('click', () => openMe(false));
    render();
    if (loaded.warning) notice(loaded.warning);
    if (!state.me) openMe(true);
    setInterval(tick, 30000);
  }

  document.addEventListener('DOMContentLoaded', init);
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 3: 在 `proto/v1/css/style.css` 最末尾附加開團單樣式**

（放在最後，讓 `@media (max-width: 900px)` 的開團單覆寫排在既有手機規則之後。）

```css
/* 開團單（lunch.html） */
.badge--proposed { background: rgba(188, 19, 254, .12); color: var(--purple-ink); }
.badge--ordering { background: rgba(0, 240, 255, .15); color: var(--cyan-ink); }
.item.item--proposed.is-selected { border-color: var(--purple); box-shadow: 0 0 18px 2px rgba(188, 19, 254, .22); }
.item.item--closed.is-selected { border-color: var(--faint); box-shadow: 0 0 14px 1px rgba(107, 114, 128, .2); }
.list__new { margin-top: auto; padding: 11px; font-size: 13.5px; font-family: inherit; cursor: pointer; }
.list__reset { align-self: center; border: 0; background: none; font: inherit; font-size: 11.5px; color: var(--faint); cursor: pointer; text-decoration: underline; }
button.pill { font: inherit; font-size: 13px; font-weight: 600; }

.notice {
  margin: 0; padding: 8px 28px; font-size: 13px; flex: none;
  background: var(--yellow-bg); color: var(--yellow-ink); border-bottom: 1px solid var(--line);
}
.notice[hidden] { display: none; }

.lcard {
  flex: 1; min-width: 0; margin: 18px 18px 18px 0; padding: 22px 24px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 14px;
  background: var(--panel); backdrop-filter: blur(8px); border: 1px solid var(--line); border-radius: 16px;
}
.lcard__title { display: flex; align-items: center; gap: 12px; }
.lcard__title h3 { margin: 0; font-size: 24px; }
.lcard__title .badge { margin: 0; }
.lcard__sub { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; font-size: 13px; color: var(--muted); }
.lcard__count { color: var(--cyan-ink); font-weight: 700; }
.lcard__note { margin: 0; font-size: 14px; }
.lcard__cancel { align-self: flex-start; margin-top: auto; }
.hr { height: 1px; background: var(--line); flex: none; }
.hint { margin: 0; font-size: 12.5px; color: var(--muted); }
.btn--danger { color: #b91c1c; border-color: #fecaca; }
.btn--danger.is-confirm { background: #b91c1c; color: #fff; border-color: #b91c1c; }

.voters, .members { display: flex; flex-wrap: wrap; gap: 8px; }
.voter { font-size: 13px; padding: 5px 12px; border-radius: 999px; background: var(--gray-bg); }
.voter--btn { font: inherit; font-size: 14px; border: 1px solid var(--line); cursor: pointer; background: #fff; }
.voter--btn:hover { border-color: #a5f3fc; }
.voter--btn.is-active { background: var(--ink); color: #fff; border-color: var(--ink); }

.orders { width: 100%; border-collapse: collapse; font-size: 14px; }
.orders td { padding: 8px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
.orders__who { width: 72px; font-weight: 700; }
.orders__line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
.orders__note { font-size: 12px; color: var(--muted); }
.orders__price { margin-left: auto; font-size: 12.5px; color: var(--muted); }
.orders__sum { width: 72px; text-align: right; font-weight: 700; }
.orders__total { align-self: flex-end; font-weight: 800; font-size: 15px; }
.tag--late { background: var(--yellow-bg); color: var(--yellow-ink); }

.payer { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 700; }
.payer__select { font: inherit; font-size: 14px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }

.editor { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 12px; background: rgba(0, 240, 255, .06); border: 1px solid rgba(0, 240, 255, .35); }
.editor .sect { margin-top: 0; }
.editor__row { display: flex; gap: 8px; }
.editor__row input {
  font: inherit; font-size: 14px; padding: 8px 10px; min-width: 0;
  border: 1px solid var(--line); border-radius: 10px; background: #fff; outline: none;
}
.editor__row input:focus { border-color: var(--cyan); }
.editor__name { flex: 2; }
.editor__price { width: 84px; flex: none; font-family: var(--mono) !important; }
.editor__note { flex: 1.4; }
.editor__row.is-error input { border-color: #f87171; }
.editor__del { flex: none; width: 34px; border: 0; background: none; font-size: 18px; color: var(--faint); cursor: pointer; }
.editor__err { font-size: 12px; color: #b91c1c; margin-top: -4px; }

.lside { width: 360px; }
.lside__warn { margin: 0; font-size: 13px; font-weight: 700; padding: 8px 12px; border-radius: 10px; background: var(--yellow-bg); color: var(--yellow-ink); }
.menu__ph {
  height: 160px; display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--faint);
  border: 1px dashed var(--line); border-radius: 12px; background: var(--gray-bg);
}
.sum { width: 100%; border-collapse: collapse; font-size: 14px; }
.sum td { padding: 7px 4px; border-bottom: 1px solid var(--line); vertical-align: top; }
.sum .orders__note { display: block; margin-top: 2px; }
.sum__price { text-align: right; }
.sum__total td { font-weight: 800; border-bottom: 0; }
.copybox { width: 100%; font-family: var(--mono); font-size: 12.5px; padding: 10px; border: 1px solid var(--line); border-radius: 10px; resize: vertical; }

.dlg { width: 420px; max-width: calc(100vw - 32px); border: 1px solid var(--line); border-radius: 16px; padding: 22px; box-shadow: 0 20px 50px rgba(17, 24, 39, .2); }
.dlg::backdrop { background: rgba(17, 24, 39, .25); backdrop-filter: blur(2px); }
.dlg[open] { display: flex; flex-direction: column; gap: 14px; }
.dlg__title { margin: 0; font-size: 18px; }
.dlg__row { display: flex; gap: 8px; }
.dlg__row .search { flex: 1; width: auto; }
.dlg__field { display: flex; flex-direction: column; gap: 6px; }
.dlg__field .sect { margin-top: 0; }
.dlg .btns { justify-content: flex-end; margin-top: 4px; }

@media (max-width: 900px) {
  .main--lunch .list { order: 1; }
  .lcard { order: 2; margin: 0 16px 16px; overflow: visible; }
  .detail.lside { order: 3; position: static; width: auto; max-height: none; margin: 0 16px 16px; border-radius: 16px; }
  .editor__row { flex-wrap: wrap; }
  .editor__name { flex: 1 1 100%; }
}
```

- [ ] **Step 4: 寫操作腳本 `.superpowers/sdd/2026-10-14-critieat-lunch-card-proto/drive-lunch.js`**

```js
// 一次性檢查腳本（不屬於專案）：用 headless Chrome + CDP 操作開團單並截圖。
// 用法：node drive-lunch.js <輸出資料夾> <網址> <名稱> <寬> <高> <步驟...>
// 步驟：clear（清空 localStorage 並重新載入）  reload  me:<名字>  sel:<第幾張卡片，從 0 起>
//       btn:<按鈕文字>  fill:<列>|<品項>|<價格>|<備註>  new:<店家ID>|<備註>|<先提議或直接開單>  wait:<ms>
const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path');
const WebSocket = globalThis.WebSocket || require('/Users/critical/Documents/critical/critical_web/node_modules/ws');
const [out, url, name, w, h, ...steps] = process.argv.slice(2);
const PORT = 9334, prof = path.join(out, 'prof-' + name);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.rmSync(prof, { recursive: true, force: true });
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--hide-scrollbars', `--user-data-dir=${prof}`, `--remote-debugging-port=${PORT}`, `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' });
  const done = code => { chrome.kill('SIGKILL'); setTimeout(() => { fs.rmSync(prof, { recursive: true, force: true }); process.exit(code); }, 500); };
  try {
    let target;
    for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page'); } catch (e) {} }
    const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
    let id = 0; const pending = new Map(); const logs = [];
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
      if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push('CONSOLE ' + m.params.type + ' ' + m.params.args.map(a => a.value || a.description).join(' ').slice(0, 300)); };
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
    const go = async () => { await send('Page.navigate', { url }); await sleep(1500); };
    await go();
    const clickText = t => `(()=>{const d=[...document.querySelectorAll('dialog[open]')].pop()||document;const b=[...d.querySelectorAll('button')].filter(b=>b.offsetParent!==null&&b.textContent.includes(${JSON.stringify(t)}));if(!b.length)throw new Error('no button '+${JSON.stringify(t)});b[0].click()})()`;
    for (const step of steps) {
      const i = step.indexOf(':'); const op = i > -1 ? step.slice(0, i) : step; const arg = i > -1 ? step.slice(i + 1) : '';
      try {
        if (op === 'clear') { await ev('localStorage.clear()'); await go(); }
        else if (op === 'reload') await go();
        else if (op === 'me') { await ev(`(()=>{if(!document.getElementById('me-dlg').open)document.getElementById('me-btn').click()})()`); await ev(`(()=>{const b=[...document.querySelectorAll('#me-dlg .voter--btn')].find(b=>b.textContent===${JSON.stringify(arg)});if(!b)throw new Error('no member');b.click()})()`); }
        else if (op === 'sel') await ev(`document.querySelectorAll('#card-list .item')[${+arg}].click()`);
        else if (op === 'btn') await ev(clickText(arg));
        else if (op === 'fill') { const [row, ...vals] = arg.split('|'); await ev(`(()=>{const r=document.querySelectorAll('.editor__row')[${+row}];['.editor__name','.editor__price','.editor__note'].forEach((s,k)=>{const v=${JSON.stringify(vals)}[k];if(v==null)return;const i=r.querySelector(s);i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}))})})()`); }
        else if (op === 'new') { const [sid, note, mode] = arg.split('|'); await ev(clickText('提議／開單')); await ev(`(()=>{const d=document.getElementById('new-dlg');d.querySelector('select').value=${JSON.stringify(sid)};const n=d.querySelector('input');n.value=${JSON.stringify(note)};})()`); await ev(clickText(mode)); }
        else if (op === 'wait') await sleep(+arg);
      } catch (e) { logs.push('STEP FAIL ' + step + ' ' + e.message.slice(0, 200)); }
      await sleep(400);
    }
    logs.push(await ev(`(()=>{const d=document,t=id=>{const e=d.getElementById(id);return e.hidden?'(hidden)':e.innerText.replace(/\\n+/g,' / ')};const dl=[...d.querySelectorAll('dialog[open]')].map(x=>x.id+': '+x.innerText.replace(/\\n+/g,' / '));return ['header '+t('today-label')+' | '+t('me-btn'),'notice '+t('notice'),'list '+t('card-list'),'card '+t('card-view').slice(0,900),'side '+t('side').slice(0,700),'dialogs '+(dl.join(' || ')||'none'),'overflow '+(d.documentElement.scrollWidth>d.documentElement.clientWidth)].join('\\n')})()`));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(shot.result.data, 'base64'));
    console.log(logs.join('\n')); done(0);
  } catch (e) { console.error('DRIVER ERROR', e); done(1); }
})();
```

- [ ] **Step 5: 起本機伺服器**

Run（背景執行）: `python3 -m http.server 8010 --bind 127.0.0.1 --directory /Users/critical/Documents/critieat/proto/v1`

（開團單沒有地圖，不受 Maps Key 網址限制；用 8010 避免和使用者自己的 8000 衝突。）

- [ ] **Step 6: 跑各情境並確認輸出**

先定義：`D() { node .superpowers/sdd/2026-10-14-critieat-lunch-card-proto/drive-lunch.js .superpowers/sdd/2026-10-14-critieat-lunch-card-proto http://127.0.0.1:8010/lunch.html "$@"; }`（zsh 不會拆變數，要用函式）。每個情境都不得出現 `EXC`、`STEP FAIL`，且 `overflow false`。

```zsh
D first  1440 900 clear
D owner  1440 900 clear me:小華 btn:延後收單
D order  1440 900 clear me:阿翔 'fill:0|鍋貼|$70|' btn:送出
D order2 1440 900 clear me:阿翔 'fill:0|鍋貼|７０|多醬' btn:再加一項 'fill:1|豆漿||' btn:送出
D switch 1440 900 clear me:阿翔 'fill:0|草稿||' me:小美
D propose 1440 900 clear me:小明 sel:1 btn:我也想吃 btn:開始點餐
D closed 1440 900 clear me:小芳 sel:2
D new    1440 900 clear me:小明 'new:R009|吃飯|直接開單'
D cancel 1440 900 clear me:阿明 sel:1 btn:取消這團 btn:確定取消
D close  1440 900 clear me:小華 btn:現在收單 btn:複製彙總
D reset  1440 900 clear me:阿明 sel:1 btn:取消這團 btn:確定取消 btn:重置示範資料
D mobile 390 844 clear me:小華
```

各情境輸出要包含：

- **first**：`dialogs me-dlg: 你是誰？`；list 三張卡片順序 八方雲集 → 涮嘴 → 虎記；card 有 `還沒點：阿翔`、`先選擇你是誰再點餐`
- **owner**：list `小華 開單 · 13:40 收單`；card 有 `延後收單 +10 分鐘`、`現在收單`、`取消這團`
- **order**：card 有 `價格請填 0 以上的整數，或留空`；list 仍是 `3 人`
- **order2**：notice `已送出`；card 有 `鍋貼 / 多醬 / $70`、`4 人 已知 $360（1 項未填價格）`
- **switch**：card 有 `我的餐點（小美）`，且沒有 `草稿`（Read `switch.png` 確認輸入框是 韭菜水餃 10 顆、玉米濃湯）
- **propose**：list `涮嘴 南港店 / 小明 開單`；card `還沒點：阿明、小美、阿翔、小明`，且 `還沒有人點餐` 只出現一次
- **closed**：card 有 `收單後修改`、`4 人 已知 $115（2 項未填價格）`、`付錢者`；side 有 `訂餐彙總`、`收單後有修改，訂餐前請再確認`、`已知 $115`
- **new**：list `/ 4`，有 `滷樂町 南港店 / 小明 開單`；card 有 `「吃飯」`
- **cancel**：list `/ 2`，沒有涮嘴
- **close**：八方雲集排到 list 最後且為 `已收單`；side 有 `5 項` 與 `$290`；headless 不給剪貼簿權限，應出現 `無法自動複製，請自己選取下面的文字複製：`
- **reset**：notice `已重置示範資料`；list `/ 3`
- **mobile**：`overflow false`；Read `mobile.png` 確認卡片清單在上、卡片內容在下

- [ ] **Step 7: 看截圖**

用 Read 打開 `.superpowers/sdd/2026-10-14-critieat-lunch-card-proto/owner.png`、`closed.png`、`propose.png`、`mobile.png`，對照 mockup（`.superpowers/brainstorm/32113-1791890674/content/lunch-card-states.html`）：三欄、狀態顏色（紫／青／灰）、編輯區、右欄彙總表格對齊。

- [ ] **Step 8: 記錄進度**

在 `.superpowers/sdd/2026-10-14-critieat-lunch-card-proto/progress.md` 加一行：`Task 3 lunch page: done — drive-lunch 12 情境通過，截圖在本資料夾`

---

### Task 4: 導覽列連結與美食地圖 `?store=` 

**Files:**
- Modify: `proto/v1/index.html`（導覽列）
- Modify: `proto/v1/bus.html`（導覽列）
- Modify: `proto/v1/js/app.js`（`init()` 末段）

**Interfaces:**
- Consumes: Task 3 右欄連結 `index.html?store=<店家ID>`；既有 `findView(id)`、`CE.selectMarker(view)`（地圖未載入時直接 return）
- Produces: 三頁導覽列都能點到開團單；美食地圖可由網址選中店家

- [ ] **Step 1: 改兩頁導覽列**

在 `proto/v1/index.html` 與 `proto/v1/bus.html` 中，把

```html
        <a class="is-soon" title="即將推出">開團單</a>
```

改成

```html
        <a href="lunch.html">開團單</a>
```

- [ ] **Step 2: 改 `proto/v1/js/app.js` 的 `init()` 末段**

把

```js
    document.getElementById('hide-closed').addEventListener('change', onToggleHideClosed);
    renderHeader();
    renderList();
    renderDetail();

    await CE.loadMap(CE.CONFIG.googleMapsKey, document.getElementById('map'), id => select(id, 'map'));
    CE.renderMarkers(visible(), state.settings);
  }
```

改成

```js
    // 從開團單「在美食地圖上看這家」連過來時（?store=R006），直接選中那家店
    const startId = params.get('store');
    if (startId && findView(startId)) state.selectedId = startId;

    document.getElementById('hide-closed').addEventListener('change', onToggleHideClosed);
    renderHeader();
    renderList();
    renderDetail();
    if (state.selectedId) {
      const item = document.querySelector(`.item[data-id="${CSS.escape(state.selectedId)}"]`);
      if (item) item.scrollIntoView({ block: 'nearest' });
    }

    await CE.loadMap(CE.CONFIG.googleMapsKey, document.getElementById('map'), id => select(id, 'map'));
    CE.renderMarkers(visible(), state.settings);
    CE.selectMarker(findView(state.selectedId));
  }
```

- [ ] **Step 3: 確認**

Run: `grep -n "開團單" /Users/critical/Documents/critieat/proto/v1/index.html /Users/critical/Documents/critieat/proto/v1/bus.html`
Expected: 兩行都是 `<a href="lunch.html">開團單</a>`

用 driver 的頁面讀取確認深連結（driver 讀的 id 在美食地圖不存在，所以直接用 CDP 跑一段）——最簡單的做法是把 Step 4 的 driver 複製成 `<scratchpad>/drive-index.js`，把結尾的讀取式改為：

```js
logs.push(await ev(`(()=>{const d=document;return ['selected '+[...d.querySelectorAll('#store-list .item.is-selected .item__name')].map(e=>e.textContent).join(','),'detail '+(d.getElementById('detail').hidden?'hidden':d.getElementById('detail').innerText.replace(/\\n+/g,' / ').slice(0,200))].join('\\n')})()`));
```

Run: `node <scratchpad>/drive-index.js <scratchpad> 'http://127.0.0.1:8010/index.html?store=R006' deeplink 1440 900`
Expected: `selected 八方雲集 南港興華店`，`detail` 以 `× / 小吃 / 八方雲集 南港興華店` 開頭；沒有 `EXC`

開團單頁自己的導覽列（`is-active`）已在 Task 3 的 `lunch.html` 寫好，不需另外確認。

- [ ] **Step 4: 記錄進度**

在 `.superpowers/sdd/2026-10-14-critieat-lunch-card-proto/progress.md` 加一行：`Task 4 nav + ?store deep link: done`

---

### Task 5: 收尾

**Files:**
- Modify: `docs/specs/2026-10-14-critieat-lunch-card-design.md`（第 3 行狀態）
- Modify: `.superpowers/sdd/2026-10-14-critieat-lunch-card-proto/progress.md`

- [ ] **Step 1: 重新跑全部檢查**

Run: `node <scratchpad>/check-lunch.js /Users/critical/Documents/critieat/proto/v1/js && node <scratchpad>/check-store.js /Users/critical/Documents/critieat/proto/v1/js`
Expected: `LUNCH OK`、`STORE OK`

並重跑 Task 3 Step 6 的 `first`、`closed`、`mobile` 三個情境，確認仍符合。

- [ ] **Step 2: 手動確認收單倒數不打斷輸入**

在 `lunch-app.js` 確認 `tick()` 只改 `.lcard__count` 的文字、不呼叫 `render()`。

- [ ] **Step 3: 更新 spec 狀態**

把 spec 第 3 行改為：`日期：2026-10-14　狀態：原型已實作（\`proto/v1/lunch.html\`），待審核`

- [ ] **Step 4: 停掉 8010 伺服器，寫完進度**

Run: `pkill -f "http.server 8010"`

在 `.superpowers/sdd/2026-10-14-critieat-lunch-card-proto/progress.md` 加：

```
Task 5: done — 全部檢查通過。
Preview: 使用者自己的伺服器（根目錄 proto/v1）→ http://localhost:8000/lunch.html
Pending: 使用者審核 proto。
```
