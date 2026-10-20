# CRITIEAT 點餐連品項原型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 菜單品項有固定 ID（重新上傳時依品名＋備註沿用），開團單「餐點名稱」可以從菜單自動完成選品項，點餐列記下 `menuItemId`。這是品項評分 spec 的計畫 ①；計畫 ②（品項評分）另寫。

**Architecture:** 新增純資料模組 `menu-data.js`（從 `menu-lightbox.js` 抽出菜單讀寫，加上品項 ID、比對、搜尋），燈箱與開團單都改從這裡拿菜單。`lunch.js` 讓點餐列帶選填 `menuItemId`。新增 `menu-combo.js`：整頁共用一個下拉元素，掛到開團單每列的品名輸入框；`lunch-app.js` 負責帶入與「📋 菜單」標記。

**Tech Stack:** HTML5、CSS（接在 `css/style.css`）、原生 JavaScript（ES2020）、IIFE 掛 `globalThis.CE`；檢查用 node 18（`vm`）＋ headless Chrome（CDP）。

**Spec:** `docs/specs/2026-10-16-critieat-item-rating-design.md`（本計畫涵蓋「菜單品項 ID」「開團單點餐列」「① 點餐自動完成」）

## Global Constraints

- 品項 ID 同一家店內唯一；示範菜單固定 ID `<店家ID>-<兩位數序號>`（例 `R002-01`），依檔案中出現順序編號
- 比對鍵＝品名＋`'\n'`＋備註，兩者先：全形英數符號（U+FF01–FF5E）轉半形、全形空白轉半形、去掉前後空白、英文轉小寫；中文不做同義轉換
- 重新上傳確認時：比對鍵相同且還沒用掉的舊品項 → 沿用 ID；否則新 ID `<店家ID>-<時間戳 base36><序號 base36>`，不得和舊 ID 重複；沒被用到的舊品項下架（不保存）
- 舊資料沒有 ID → 讀取時補固定 ID `<店家ID>-s<兩位數序號>`（依攤平後順序）並寫回
- 對舊紀錄比對品項：先比完整比對鍵；對不上時，菜單上只有一道同名（正規化後）品項也算對上
- 點餐列 `menuItemId` 選填；選品項才有；手動改品名就清掉；改價格或備註保留；舊資料沒有此欄位照讀
- 自動完成：輸入框空白不顯示；品名「包含」輸入文字，開頭符合的排前面，其餘照菜單順序；最多 8 筆；↑↓ 移動、Enter 帶入（沒有選中任何一筆時 Enter 只關閉下拉、照打的字）、Esc 關閉；選字中（`isComposing` 或 `keyCode 229`）的按鍵不處理
- 帶入：品名、備註照菜單；價格是整數才帶入，否則留空；帶入後游標移到同一列的價格欄
- 該店沒有菜單 → 完全沒有下拉，和現在一樣
- 所有資料以 `textContent` 寫入 DOM，禁止 `innerHTML`；不用 `alert` / `confirm` / `prompt`
- **不得引入任何測試框架**；邏輯用 scratchpad 一次性 node 腳本，畫面用 headless Chrome
- **不做 git 操作**（`critieat/` 不受版控）；進度記在 `.superpowers/sdd/2026-10-16-critieat-menu-item-link/progress.md`
- 原型不依賴建置工具；以 `proto/v1` 為根的靜態伺服器即可運作

## Review Focus

1. **帶入後編輯區整個重畫** → 下拉不殘留、不會一直多出新的下拉元素（整頁只有一個 `#menu-combo`），游標在價格欄。由 Task 4 的 `C1`、`C7` 覆蓋
2. **帶入後只改價格或備註（例如加「不要辣」）** → 「📋 菜單」標記和 `menuItemId` 都保留；改品名才消失。由 Task 3 的 setItems 檢查、Task 4 的 `C2` 覆蓋
3. **重新上傳菜單時，有的品項漲價、有的改名、有兩道同名同備註** → 漲價沿用 ID、改名換新 ID、同名兩道各自對到不同舊 ID。由 Task 1 的 `assignIds` 檢查覆蓋
4. **原型時期存在 localStorage 的菜單沒有 ID** → 讀取時補上、每次讀都一樣、而且寫回。由 Task 1 的 legacy 檢查、Task 2 的 `B3` 覆蓋
5. **換卡片再換回來（草稿暫存）或重新整理後** → 還沒送出的列仍帶著連結；送出後 `menuItemId` 存進 localStorage。由 Task 4 的 `C1`（送出後讀 localStorage）、`C6`（換卡片再回來）覆蓋

---

## 檔案結構

| 檔案 | 動作 | 負責 |
|---|---|---|
| `proto/v1/js/menu-data.js` | 新增 | `CE.menuData`：菜單讀寫、品項 ID、比對、搜尋 |
| `proto/v1/js/menu-demo.js` | 修改 | 每個品項加固定 `id` |
| `proto/v1/js/menu-lightbox.js` | 修改 | 改用 `CE.menuData`；儲存時 `assignIds` |
| `proto/v1/js/lunch.js` | 修改 | `setItems`、`sameRow`、`isValidDb` 支援 `menuItemId` |
| `proto/v1/js/menu-combo.js` | 新增 | `CE.menuCombo(input, storeId, opts)` 下拉 |
| `proto/v1/js/lunch-app.js` | 修改 | 編輯列接上下拉、標記、草稿帶 `menuItemId` |
| `proto/v1/index.html`、`proto/v1/lunch.html` | 修改 | 載入 `menu-data.js`（兩頁）、`menu-combo.js`（lunch） |
| `proto/v1/css/style.css` | 修改 | 下拉與標記樣式 |

檢查工具（不屬於專案）：
- `<scratchpad>/menulink/check-menu-data.js`、`check-lunch-link.js`
- `.superpowers/sdd/2026-10-16-critieat-menu-item-link/drive-link.js`（由 `drive-rating.js` 複製改寫）、`progress.md`、截圖

`<scratchpad>` = `/private/tmp/claude-501/-Users-critical-Documents-critieat/68572742-9d17-4b59-9053-b1b68c2e86da/scratchpad`

檢查用伺服器：在 `proto/v1` 內 `python3 -m http.server 8010 --bind 127.0.0.1`。

---

### Task 1: `menu-data.js` 與示範菜單 ID

**Files:**
- Create: `proto/v1/js/menu-data.js`
- Modify: `proto/v1/js/menu-demo.js`
- Test: `<scratchpad>/menulink/check-menu-data.js`

**Interfaces:**
- Consumes: `CE.DEMO_MENUS`（menu-demo.js）、`localStorage`
- Produces（`CE.menuData`）：
  - `KEY = 'critieat.menus.v1'`
  - `norm(v) → string`、`itemKey(name, note) → string`
  - `isSaved(storeId) → boolean`
  - `getMenu(storeId) → Menu | null`（存的優先，補 ID 並寫回；否則示範菜單）
  - `hasMenu(storeId) → boolean`
  - `saveMenu(storeId, menu) → boolean`、`removeSaved(storeId) → boolean`
  - `assignIds(oldMenu | null, sections, storeId, now: Date) → sections`（新物件，每個 item 有 `id`）
  - `ensureIds(menu, storeId) → { menu, changed: boolean }`
  - `items(storeId) → { id, name, price, note, category }[]`（攤平，照菜單順序；沒菜單回 `[]`）
  - `findItem(storeId, itemId) → item | null`
  - `matchItem(storeId, name, note) → item | null`
  - `search(storeId, q, max = 8) → item[]`

- [ ] **Step 1: 寫檢查腳本（會失敗）**

`<scratchpad>/menulink/check-menu-data.js`：

```js
// 一次性檢查（不屬於專案）：node check-menu-data.js
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ROOT = '/Users/critical/Documents/critieat/proto/v1/js/';
function memStorage(init = {}) {
  const s = Object.assign({}, init);
  return { s, getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; } };
}
function boot(localStorage) {
  const ctx = { console, Date, Math, JSON, localStorage }; ctx.globalThis = ctx; vm.createContext(ctx);
  ['menu-demo.js', 'menu-data.js'].forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
  return ctx.CE;
}
const plain = v => JSON.parse(JSON.stringify(v));
let CE = boot(memStorage()), M = CE.menuData;

// 示範菜單：每個品項都有固定 ID，依序編號、店內唯一
for (const [sid, menu] of Object.entries(CE.DEMO_MENUS)) {
  const ids = menu.sections.flatMap(s => s.items.map(it => it.id));
  ids.forEach((id, i) => assert.strictEqual(id, `${sid}-${String(i + 1).padStart(2, '0')}`, sid + ' 第 ' + (i + 1) + ' 個'));
}
assert.strictEqual(M.findItem('R002', 'R002-02').note, '大', 'R002-02 是魯肉飯（大）');
assert.strictEqual(M.findItem('R006', 'R006-02').name, '韓式辣味鍋貼');
assert.strictEqual(M.findItem('R006', 'nope'), null);

// 正規化
assert.strictEqual(M.itemKey(' 魯肉飯 ', '大'), M.itemKey('魯肉飯', '大'));
assert.strictEqual(M.itemKey('ＡＢＣ便當', '（大）'), M.itemKey('abc便當', '(大)'));
assert.strictEqual(M.itemKey('雞腿', '　小　'), M.itemKey('雞腿', '小'));
assert.notStrictEqual(M.itemKey('魯肉飯', '大'), M.itemKey('魯肉飯', '小'));
assert.notStrictEqual(M.itemKey('魯肉飯', ''), M.itemKey('滷肉飯', ''), '中文不做同義轉換');

// items / hasMenu
assert.strictEqual(M.items('R002').length, 12);
assert.deepStrictEqual(plain(M.items('R002')[0]), { id: 'R002-01', name: '魯肉飯', price: 35, note: '小', category: '飯類' });
assert.deepStrictEqual(plain(M.items('R003')), []);
assert(M.hasMenu('R002') && !M.hasMenu('R003'));

// search：包含、開頭優先、最多 8、空白不搜
assert.deepStrictEqual(plain(M.search('R002', '飯').map(i => i.id)), ['R002-01', 'R002-02', 'R002-03', 'R002-04', 'R002-05']);
assert.deepStrictEqual(plain(M.search('R006', '鍋貼').map(i => i.name)), ['招牌鍋貼', '韓式辣味鍋貼', '咖哩鍋貼']);
assert.deepStrictEqual(plain(M.search('R005', '烏龍').map(i => i.name)).slice(0, 1), ['釜揚烏龍麵']);
assert.deepStrictEqual(plain(M.search('R006', '玉米').map(i => i.name)), ['玉米水餃', '玉米濃湯'], '開頭符合的照菜單順序');
assert.deepStrictEqual(plain(M.search('R006', '湯').map(i => i.name)), ['酸辣湯', '玉米濃湯', '餛飩湯麵']);
assert.strictEqual(M.search('R005', '天婦羅', 8).length, 5);
assert.strictEqual(M.search('R002', '湯', 2).length, 2, 'max');
assert.deepStrictEqual(plain(M.search('R002', '   ')), []);
assert.deepStrictEqual(plain(M.search('R003', '飯')), []);
assert.strictEqual(M.search('R002', '湯')[0].name, '貢丸湯');

// matchItem：完整比對優先；備註不同但同名只有一道也算；同名多道不算
assert.strictEqual(M.matchItem('R002', '魯肉飯', '大').id, 'R002-02');
assert.strictEqual(M.matchItem('R002', '控肉飯', '').id, 'R002-04', '控肉飯只有一道');
assert.strictEqual(M.matchItem('R002', '魯肉飯', '不要香菜'), null, '魯肉飯有兩道，對不上');
assert.strictEqual(M.matchItem('R002', '魯肉飯（大）', ''), null);
assert.strictEqual(M.matchItem('R003', '魯肉飯', '大'), null);

// assignIds：沿用、漲價、換順序、改名、下架、同名兩道、新 ID 不重複
const old = { sections: [{ name: 'A', items: [
  { id: 'X-01', name: '魯肉飯', price: 35, note: '小' },
  { id: 'X-02', name: '魯肉飯', price: 50, note: '大' },
  { id: 'X-03', name: '雞肉飯', price: 45 },
  { id: 'X-04', name: '貢丸湯', price: 35 },
  { id: 'X-05', name: '滷蛋', price: 15 },
  { id: 'X-06', name: '滷蛋', price: 15 },
] }] };
const now = new Date('2026-10-16T05:00:00.000Z');
const next = M.assignIds(old, [
  { name: '湯', items: [{ name: '貢丸湯', price: 40, note: '' }] },                  // 換分類＋漲價
  { name: '飯', items: [
    { name: '魯肉飯', price: 55, note: '大' },                                        // 換順序＋漲價
    { name: '魯肉飯', price: 35, note: '小' },
    { name: '雞肉飯（大）', price: 60, note: '' },                                    // 改名 → 新 ID
    { name: '滷蛋', price: 15, note: '' }, { name: '滷蛋', price: 15, note: '' },     // 同名兩道各對各的
    { name: '新品', price: 99, note: '' },
  ] },
], 'X', now);
const ids = next.flatMap(s => s.items.map(i => i.id));
assert.deepStrictEqual(ids.slice(0, 3), ['X-04', 'X-02', 'X-01']);
assert.deepStrictEqual(ids.slice(4, 6), ['X-05', 'X-06']);
assert(ids[3].startsWith('X-') && !['X-03'].includes(ids[3]), '改名給新 ID，不沿用下架的 X-03');
assert.strictEqual(new Set(ids).size, ids.length, '不重複');
assert.strictEqual(next[1].items[0].price, 55, '其他欄位照新的');
assert.strictEqual(old.sections[0].items[0].id, 'X-01', '不改舊物件');
const fresh = M.assignIds(null, [{ name: 'A', items: [{ name: 'a', price: 1, note: '' }, { name: 'b', price: 2, note: '' }] }], 'Y', now);
assert.strictEqual(new Set(fresh[0].items.map(i => i.id)).size, 2, '沒有舊菜單也給 ID');
assert(fresh[0].items.every(i => /^Y-/.test(i.id)));

// saveMenu → getMenu
const ls = memStorage(); CE = boot(ls); M = CE.menuData;
assert(M.saveMenu('R003', { updatedAt: '2026-10-16', updatedBy: '小明', sections: [{ name: 'A', items: [{ id: 'R003-x1', name: '咖哩', price: 120, note: '' }] }] }));
assert(M.isSaved('R003') && M.hasMenu('R003'));
assert.strictEqual(M.findItem('R003', 'R003-x1').name, '咖哩');
assert(M.removeSaved('R003'));
assert(!M.hasMenu('R003'));

// 舊資料沒有 ID：補固定 ID、寫回、每次一樣
const legacy = { R002: { updatedAt: '2026-10-15', updatedBy: '小安', sections: [
  { name: '飯類', items: [{ name: '魯肉飯', price: 40, note: '小' }, { name: '排骨飯', price: 110 }] },
  { name: '湯品', items: [{ name: '貢丸湯', price: 35 }] },
] } };
const ls2 = memStorage({ 'critieat.menus.v1': JSON.stringify(legacy) }); CE = boot(ls2); M = CE.menuData;
assert.deepStrictEqual(plain(M.items('R002').map(i => i.id)), ['R002-s01', 'R002-s02', 'R002-s03']);
assert.strictEqual(JSON.parse(ls2.s['critieat.menus.v1']).R002.sections[1].items[0].id, 'R002-s03', '寫回');
CE = boot(memStorage({ 'critieat.menus.v1': JSON.stringify(legacy) }));
assert.deepStrictEqual(plain(CE.menuData.items('R002').map(i => i.id)), ['R002-s01', 'R002-s02', 'R002-s03'], '每次一樣');

// 壞掉的 localStorage：讀不到就用示範菜單
CE = boot(memStorage({ 'critieat.menus.v1': '{bad' }));
assert.strictEqual(CE.menuData.items('R002').length, 12);
CE = boot({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
assert.strictEqual(CE.menuData.items('R002').length, 12);
assert.strictEqual(CE.menuData.saveMenu('R003', { updatedAt: 'x', sections: [] }), false);

console.log('check-menu-data: all passed');
```

- [ ] **Step 2: 跑檢查確認失敗**

Run: `node <scratchpad>/menulink/check-menu-data.js`
Expected: FAIL，`ENOENT ... menu-data.js`

- [ ] **Step 3: 實作 `proto/v1/js/menu-data.js`**

```js
(function (CE) {
  'use strict';
  // 菜單資料：讀寫、品項 ID、比對、搜尋。不碰 DOM。
  // 使用者存的菜單放 localStorage（critieat.menus.v1，{ [storeId]: Menu }），沒有就用 CE.DEMO_MENUS。之後換成 API。
  // Menu: { updatedAt, updatedBy, sections: [{ name, items: [{ id, name, price, note }] }], photos? }
  // 品項 ID 同一家店內唯一；重新上傳時「品名＋備註」相同的品項沿用舊 ID（品項評分、點餐連結才不會斷）。

  const KEY = 'critieat.menus.v1';

  // ── 比對用的正規化：全形英數符號與全形空白轉半形、去前後空白、英文轉小寫 ──
  function norm(v) {
    return String(v == null ? '' : v)
      .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/　/g, ' ')
      .trim()
      .toLowerCase();
  }

  function itemKey(name, note) {
    return norm(name) + '\n' + norm(note);
  }

  // ── 儲存 ──
  function loadSaved() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch (e) { return {}; }
  }

  function writeSaved(map) {
    try { localStorage.setItem(KEY, JSON.stringify(map)); return true; } catch (e) { return false; }
  }

  function isValidMenu(m) {
    return !!m && typeof m.updatedAt === 'string' && Array.isArray(m.sections) &&
      m.sections.every(s => s && typeof s.name === 'string' && Array.isArray(s.items));
  }

  const flat = menu => menu.sections.flatMap(s => s.items);

  // 沒有 ID 的品項補固定 ID（<店家ID>-s<序號>，依攤平後順序），每次讀到的結果一樣
  function ensureIds(menu, storeId) {
    const used = new Set(flat(menu).map(it => it.id).filter(id => typeof id === 'string' && id));
    let n = 0;
    let changed = false;
    const sections = menu.sections.map(sec => Object.assign({}, sec, {
      items: sec.items.map(it => {
        n += 1;
        if (typeof it.id === 'string' && it.id) return it;
        let id = `${storeId}-s${String(n).padStart(2, '0')}`;
        while (used.has(id)) id += 'x';
        used.add(id);
        changed = true;
        return Object.assign({}, it, { id });
      }),
    }));
    return { menu: changed ? Object.assign({}, menu, { sections }) : menu, changed };
  }

  function savedMenu(storeId) {
    const map = loadSaved();
    const m = map[storeId];
    if (!isValidMenu(m)) return null;
    const r = ensureIds(m, storeId);
    if (r.changed) { map[storeId] = r.menu; writeSaved(map); }
    return r.menu;
  }

  function isSaved(storeId) {
    return !!savedMenu(storeId);
  }

  function getMenu(storeId) {
    return savedMenu(storeId) || (CE.DEMO_MENUS && CE.DEMO_MENUS[storeId]) || null;
  }

  function hasMenu(storeId) {
    return !!getMenu(storeId);
  }

  function saveMenu(storeId, menu) {
    const map = loadSaved();
    map[storeId] = menu;
    return writeSaved(map);
  }

  function removeSaved(storeId) {
    const map = loadSaved();
    delete map[storeId];
    return writeSaved(map);
  }

  // 新菜單的品項配 ID：比對鍵相同、還沒用掉的舊品項沿用；其餘給新 ID。沒被用到的舊品項就是下架。
  function assignIds(oldMenu, sections, storeId, now) {
    const oldItems = oldMenu ? flat(oldMenu).filter(it => it.id) : [];
    const pool = new Map();
    oldItems.forEach(it => {
      const k = itemKey(it.name, it.note);
      if (!pool.has(k)) pool.set(k, []);
      pool.get(k).push(it.id);
    });
    const used = new Set(oldItems.map(it => it.id));
    const stamp = now.getTime().toString(36);
    let seq = 0;
    return sections.map(sec => Object.assign({}, sec, {
      items: sec.items.map(it => {
        const ids = pool.get(itemKey(it.name, it.note));
        let id = ids && ids.length ? ids.shift() : '';
        if (!id) {
          do { seq += 1; id = `${storeId}-${stamp}${seq.toString(36)}`; } while (used.has(id));
          used.add(id);
        }
        return Object.assign({}, it, { id });
      }),
    }));
  }

  // ── 查詢 ──
  function items(storeId) {
    const menu = getMenu(storeId);
    if (!menu) return [];
    return menu.sections.flatMap(sec => sec.items.map(it => ({
      id: it.id, name: it.name, price: it.price == null ? null : it.price, note: it.note || '', category: sec.name,
    })));
  }

  function findItem(storeId, itemId) {
    return items(storeId).find(it => it.id === itemId) || null;
  }

  // 舊點餐紀錄對品項：先比品名＋備註；對不上時，菜單上只有一道同名品項也算
  function matchItem(storeId, name, note) {
    const list = items(storeId);
    const key = itemKey(name, note);
    const exact = list.find(it => itemKey(it.name, it.note) === key);
    if (exact) return exact;
    const n = norm(name);
    const same = list.filter(it => norm(it.name) === n);
    return same.length === 1 ? same[0] : null;
  }

  // 品名包含 q 的品項：開頭符合的在前，其餘照菜單順序
  function search(storeId, q, max) {
    const qn = norm(q);
    if (!qn) return [];
    const hit = items(storeId).filter(it => norm(it.name).includes(qn));
    const head = hit.filter(it => norm(it.name).startsWith(qn));
    const rest = hit.filter(it => !norm(it.name).startsWith(qn));
    return head.concat(rest).slice(0, max || 8);
  }

  CE.menuData = {
    KEY, norm, itemKey, isSaved, getMenu, hasMenu, saveMenu, removeSaved,
    assignIds, ensureIds, items, findItem, matchItem, search,
  };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 4: 示範菜單加固定 ID**

在 `proto/v1` 內執行（把每個 `{ name: '` 品項開頭改成 `{ id: '<店家>-NN', name: '`，依店家內出現順序編號；分類那行 `{ name: '飯類', items: [` 不動）：

```bash
python3 - <<'EOF'
import re
p = 'js/menu-demo.js'
out, store, n = [], None, 0
for line in open(p).read().split('\n'):
    m = re.match(r"\s+(R\d{3}): \{", line)
    if m: store, n = m.group(1), 0
    if re.match(r"\s+\{ name: '", line) and 'items: [' not in line:
        n += 1
        line = line.replace("{ name: '", "{ id: '%s-%02d', name: '" % (store, n), 1)
    out.append(line)
open(p, 'w').write('\n'.join(out))
EOF
grep -c "id: 'R0" js/menu-demo.js
```

Expected：最後一行印出 `36`（R002、R005、R006 各 12）

同時把檔案開頭註解的結構說明改成：`// 結構對應未來 DB：menus（store_id, updated_at, updated_by, source_photo）+ menu_items（id 固定，重新上傳時依品名＋備註沿用）。`

- [ ] **Step 5: 跑檢查確認通過**

Run: `node <scratchpad>/menulink/check-menu-data.js`
Expected: `check-menu-data: all passed`

- [ ] **Step 6: 記進度**

`progress.md` 加一行：`Task 1: complete (check-menu-data passed)`

---

### Task 2: 燈箱改用 `menu-data.js`

**Files:**
- Modify: `proto/v1/js/menu-lightbox.js`
- Modify: `proto/v1/index.html`、`proto/v1/lunch.html`（在 `menu-demo.js` 後面加 `<script src="js/menu-data.js"></script>`）
- Test: `.superpowers/sdd/2026-10-16-critieat-menu-item-link/drive-link.js`

**Interfaces:**
- Consumes: Task 1 的 `CE.menuData.{ KEY, isSaved, getMenu, hasMenu, saveMenu, removeSaved, assignIds }`
- Produces: `CE.hasMenu`、`CE.openMenu` 對外行為不變；儲存後菜單品項帶 ID

- [ ] **Step 1: 建 driver**

複製 `.superpowers/sdd/2026-10-16-critieat-store-rating/drive-rating.js` 成 `.superpowers/sdd/2026-10-16-critieat-menu-item-link/drive-link.js`，改：
- 開頭註解：「操作點餐連品項並截圖」；步驟說明加上 `type:<文字>`、`key:<按鍵>[:229]`、`menu:<標籤>`
- `PORT = 9338`
- 在 `reload` 那行前面加：

```js
        else if (op === 'type') await send('Input.insertText', { text: arg }); // 真的打字（會觸發 trusted input）
        else if (op === 'key') { // key:ArrowDown / key:Enter / key:Enter:229（模擬注音選字中的 Enter）
          const [k, code] = arg.split(':');
          const vk = code ? +code : { ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27, End: 35 }[k];
          for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
        }
        else if (op === 'menu') logs.push(arg + ' => ' + JSON.stringify(await ev(`(()=>{const d=document.getElementById('menu-dlg');return {open:!!(d&&d.open),text:d?d.innerText.replace(/\\n+/g,' / ').slice(0,300):''}})()`)));
```

- `info` 改成印編輯區與下拉狀態：

```js
        else if (op === 'info') logs.push(arg + ' => ' + JSON.stringify(await ev(`(()=>{const m=document.getElementById('menu-combo');const shown=!!(m&&!m.hidden);const rows=[...document.querySelectorAll('.editor__row')].map(r=>({name:r.querySelector('.editor__name').value,price:r.querySelector('.editor__price').value,note:r.querySelector('.editor__note').value,linked:!!r.querySelector('.editor__menutag')}));const a=document.activeElement;return {combo:shown?[...m.querySelectorAll('.mcombo__item')].map(li=>li.innerText.replace(/\\n+/g,' ')+(li.classList.contains('is-active')?' *':'')):null,combos:document.querySelectorAll('#menu-combo').length,rows,focus:a?a.className:'',comboRight:shown?Math.round(m.getBoundingClientRect().right):null,vw:innerWidth,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}})()`)));
```

- [ ] **Step 2: 先記下改之前燈箱的樣子（基準）**

在 `proto/v1` 內背景執行 `python3 -m http.server 8010 --bind 127.0.0.1`。

```bash
D=.superpowers/sdd/2026-10-16-critieat-menu-item-link
node $D/drive-link.js $D "http://127.0.0.1:8010/index.html?store=R002" b0 1440 900 \
  "js:[...document.querySelectorAll('#detail .btn')].find(b=>b.textContent.includes('看菜單')).click()" menu:B0
```

Expected：`B0 => {"open":true,"text":"虎記魯肉飯 / ... 魯肉飯 / 小 / $35 ..."}`（記下 text 開頭，Step 5 比對）

- [ ] **Step 3: 改 `proto/v1/js/menu-lightbox.js`**

1. 開頭註解第 4 行改成：`// 資料：讀寫交給 menu-data.js（CE.menuData）。`；第 7 行改成 `// 依賴 menu-draft.js（CE.menuDraft）、menu-data.js（CE.menuData）。`
2. `const D = CE.menuDraft;` 下面加 `const MD = CE.menuData;`，刪掉 `const KEY = 'critieat.menus.v1';`
3. 刪掉整段 `// ── 儲存 ──` 的 `loadSaved`、`writeSaved`、`isValidMenu`、`savedMenu`、`getMenu` 五個函式
4. `CE.hasMenu` 改成：

```js
  CE.hasMenu = function (storeId) {
    return MD.hasMenu(storeId);
  };
```

5. 其餘呼叫照下表替換：

| 原本 | 改成 |
|---|---|
| `getMenu(store.id)`（兩處） | `MD.getMenu(store.id)` |
| `savedMenu(store.id)`（兩處，`if` 條件） | `MD.isSaved(store.id)` |
| 「還原示範菜單」與「刪除這份菜單」裡的 `const map = loadSaved(); delete map[store.id]; writeSaved(map);` | `MD.removeSaved(store.id);` |

6. `save()` 裡原本的兩行

```js
      const sections = D.toSections(rows);
      if (sections.length === 0) { showDraft('至少要有一個品項'); return; }
```

改成一行（`sections` 改到下面才算）：

```js
      if (D.toSections(rows).length === 0) { showDraft('至少要有一個品項'); return; }
```

再把從 `const menu = { updatedAt: ...` 到 `flash = writeSaved(map) ? ... ;` 所在的 `else { ... }` 結束為止，改成：

```js
      const sections = MD.assignIds(MD.getMenu(store.id), D.toSections(rows), store.id, new Date());
      const menu = { updatedAt: today(), updatedBy: me() || '（未選身分）', sections, photos: srcs.filter(Boolean) };
      if (MD.saveMenu(store.id, menu)) {
        flash = '已儲存';
      } else {
        menu.photos = [];
        flash = MD.saveMenu(store.id, menu) ? '照片太大存不進瀏覽器，只存了表格' : '無法存到瀏覽器（可能是私密視窗），這次沒有儲存';
      }
```

7. 確認檔案裡已沒有 `loadSaved`、`writeSaved`、`savedMenu`、`isValidMenu`、`KEY`：

Run: `grep -nE "loadSaved|writeSaved|savedMenu|isValidMenu|\bKEY\b" proto/v1/js/menu-lightbox.js`
Expected: 沒有輸出

- [ ] **Step 4: 兩頁載入 `menu-data.js`**

`proto/v1/index.html`、`proto/v1/lunch.html`：`<script src="js/menu-demo.js"></script>` 後面加 `<script src="js/menu-data.js"></script>`。

- [ ] **Step 5: 跑燈箱回歸與 ID 沿用**

```bash
D=.superpowers/sdd/2026-10-16-critieat-menu-item-link; U=http://127.0.0.1:8010
OPEN="js:[...document.querySelectorAll('#detail .btn')].find(b=>b.textContent.includes('菜單')).click()"
# B1 燈箱照舊
node $D/drive-link.js $D "$U/index.html?store=R002" b1 1440 900 "$OPEN" menu:B1
# B2 重新上傳（假辨識）→ 改一列價格 → 確認儲存 → 沿用 ID
node $D/drive-link.js $D "$U/index.html?store=R002" b2 1440 900 "$OPEN" \
  "js:[...document.querySelectorAll('#menu-dlg button')].find(b=>b.textContent.includes('重新上傳')).click()" \
  "js:document.querySelector('#menu-dlg input.search').value='https://example.com/menu.jpg'" \
  "js:[...document.querySelectorAll('#menu-dlg button')].find(b=>b.textContent==='加入').click()" \
  "js:[...document.querySelectorAll('#menu-dlg button')].find(b=>b.textContent.includes('辨識')).click()" wait:2200 \
  "js:(()=>{const i=document.querySelectorAll('#menu-dlg .mdraft__price')[0];i.value='38';i.dispatchEvent(new Event('input',{bubbles:true}))})()" \
  "js:[...document.querySelectorAll('#menu-dlg button')].find(b=>b.textContent.includes('確認儲存')).click()" wait:800 menu:B2 \
  "val:(()=>{const m=JSON.parse(localStorage.getItem('critieat.menus.v1')).R002;return m.sections.flatMap(s=>s.items.map(i=>i.id+':'+i.price))})()"
# B3 舊資料（沒有 ID）→ 補 ID 並寫回
node $D/drive-link.js $D "$U/index.html?store=R002" b3 1440 900 \
  "js:localStorage.setItem('critieat.menus.v1',JSON.stringify({R002:{updatedAt:'2026-10-15',updatedBy:'小安',sections:[{name:'飯類',items:[{name:'魯肉飯',price:40,note:'小'}]}]}}))" \
  reload "$OPEN" menu:B3 \
  "val:JSON.parse(localStorage.getItem('critieat.menus.v1')).R002.sections[0].items[0].id"
```

Expected:
- B1：`open: true`，`text` 開頭與 B0 相同
- B2：`text` 含「已儲存」；`val` 陣列 12 個，`R002-01:38`、`R002-02:50` … 全部是 `R002-01`～`R002-12`（假辨識依示範菜單產生，品名備註都一樣，所以全部沿用；第 2 列價格被假辨識清空 → `R002-02:null` 也算符合）
- B3：`text` 含「魯肉飯」；`val` 為 `"R002-s01"`
- 沒有 `EXC`

（Step 5 的 B2 選擇器是依現有上傳畫面寫的；若元素找不到，`STEP FAIL` 會指出是哪一步，照實際 DOM 修正選擇器，並在 ledger 記 Ruling。）

- [ ] **Step 6: 記進度**

`progress.md` 加：`Task 2: complete (B1 regression same as B0; B2 ids kept R002-01..12; B3 legacy id R002-s01 written back)`

---

### Task 3: 點餐列 `menuItemId`（`lunch.js`）

**Files:**
- Modify: `proto/v1/js/lunch.js`（`sameRow`、`setItems`、`isValidDb`）
- Test: `<scratchpad>/menulink/check-lunch-link.js`

**Interfaces:**
- Consumes: 無新依賴
- Produces: `CE.lunch.setItems(cards, id, actor, rows, now)` 的 `rows[i].menuItemId?: string`；點餐列 `item.menuItemId?: string`（空字串或沒給就不放這個欄位）

- [ ] **Step 1: 寫檢查腳本（會失敗）**

`<scratchpad>/menulink/check-lunch-link.js`：

```js
// 一次性檢查（不屬於專案）：node check-lunch-link.js
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ROOT = '/Users/critical/Documents/critieat/proto/v1/js/';
const ctx = { console, Intl, Date, Math, JSON }; ctx.globalThis = ctx; vm.createContext(ctx);
['hours.js', 'lunch.js', 'lunch-demo.js'].forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
const L = ctx.CE.lunch;
const now = new Date('2026-10-16T04:30:00.000Z');
const db = ctx.CE.lunchDemo(now);
const c1 = () => db.cards.find(c => c.id === 'demo-c1');   // R006 點餐中
const mine = (cards, who) => cards.find(c => c.id === 'demo-c1').items.filter(it => it.member === who);

// 選品項 → 存 menuItemId
let cards = L.setItems(db.cards, 'demo-c1', '小明', [
  { name: '韓式辣味鍋貼', price: '', note: '每顆', menuItemId: 'R006-02' },
  { name: '自己打的', price: '50', note: '' },
  { name: '空字串連結', price: '', note: '', menuItemId: '' },
], now);
let rows = mine(cards, '小明');
assert.strictEqual(rows[0].menuItemId, 'R006-02');
assert(!('menuItemId' in rows[1]), '沒選就沒有欄位');
assert(!('menuItemId' in rows[2]), '空字串不放欄位');

// 只改備註 → 連結保留（UI 只有改品名才會拿掉 menuItemId）
let cards2 = L.setItems(cards, 'demo-c1', '小明', [
  { id: rows[0].id, name: '韓式辣味鍋貼', price: '65', note: '每顆，要 10 顆', menuItemId: 'R006-02' },
  { id: rows[1].id, name: '自己打的', price: '50', note: '' },
], now);
let rows2 = mine(cards2, '小明');
assert.strictEqual(rows2[0].menuItemId, 'R006-02');
assert.strictEqual(rows2[0].price, 65);

// 拿掉連結（UI 改了品名）→ 欄位消失，而且算有變更
const later = new Date(now.getTime() + 60000);
let cards3 = L.setItems(cards2, 'demo-c1', '小明', [
  { id: rows2[0].id, name: '韓式辣味鍋貼', price: '65', note: '每顆，要 10 顆' },
  { id: rows2[1].id, name: '自己打的', price: '50', note: '' },
], later);
let rows3 = mine(cards3, '小明');
assert(!('menuItemId' in rows3[0]), '連結拿掉了');
assert.strictEqual(rows3[0].updatedAt, later.toISOString(), '只有連結不同也算修改');
assert.strictEqual(rows3[1], rows2[1], '沒改的列原樣保留');

// 只加上連結也算修改
let cards4 = L.setItems(cards3, 'demo-c1', '小明', [
  { id: rows3[0].id, name: '韓式辣味鍋貼', price: '65', note: '每顆，要 10 顆', menuItemId: 'R006-02' },
  { id: rows3[1].id, name: '自己打的', price: '50', note: '' },
], later);
assert.strictEqual(mine(cards4, '小明')[0].menuItemId, 'R006-02');

// isValidDb：舊資料（沒有欄位）OK、字串 OK、其他型別不行
assert(L.isValidDb(db), '示範資料沒有 menuItemId 也合法');
assert(L.isValidDb(Object.assign({}, db, { cards: cards4 })));
const bad = JSON.parse(JSON.stringify(Object.assign({}, db, { cards: cards4 })));
bad.cards.find(c => c.id === 'demo-c1').items.find(it => it.menuItemId).menuItemId = 123;
assert(!L.isValidDb(bad), 'menuItemId 不是字串');

console.log('check-lunch-link: all passed');
```

- [ ] **Step 2: 跑檢查確認失敗**

Run: `node <scratchpad>/menulink/check-lunch-link.js`
Expected: FAIL，`AssertionError ... undefined !== 'R006-02'`

- [ ] **Step 3: 改 `proto/v1/js/lunch.js`**

`sameRow` 改成：

```js
  function sameRow(a, b) {
    return a.name === b.name && a.price === b.price && a.note === b.note && (a.menuItemId || '') === (b.menuItemId || '');
  }
```

`setItems` 上方註解的 `rows: [{ id?, name, price, note }]` 改成 `rows: [{ id?, name, price, note, menuItemId? }]`，並在 `const row = { ... };` 之後加：

```js
      if (typeof r.menuItemId === 'string' && r.menuItemId) row.menuItemId = r.menuItemId;
```

`if (old)` 區塊裡的合併改成（舊列有連結、新列沒有時要拿掉）：

```js
        const merged = Object.assign({}, old, row, { updatedAt: now.toISOString(), afterClose: old.afterClose || closed });
        if (!row.menuItemId) delete merged.menuItemId;
        return merged;
```

（取代原本的 `return Object.assign({}, old, row, { updatedAt: now.toISOString(), afterClose: old.afterClose || closed });`）

`isValidDb` 的品項條件 `(it.price === null || Number.isInteger(it.price))` 後面加：

```js
 && (it.menuItemId === undefined || typeof it.menuItemId === 'string')
```

- [ ] **Step 4: 跑檢查確認通過**

Run: `node <scratchpad>/menulink/check-lunch-link.js && node <scratchpad>/menulink/check-menu-data.js`
Expected: 兩行 `all passed`

- [ ] **Step 5: 記進度**

`progress.md` 加：`Task 3: complete (check-lunch-link passed)`

---

### Task 4: 自動完成下拉與開團單接線

**Files:**
- Create: `proto/v1/js/menu-combo.js`
- Modify: `proto/v1/js/lunch-app.js`（`draftRowsOf`、`sameRows`、`renderLastOrder` 的帶入、`renderEditor`）
- Modify: `proto/v1/lunch.html`（`menu-lightbox.js` 後面加 `<script src="js/menu-combo.js"></script>`）
- Modify: `proto/v1/css/style.css`
- Test: `drive-link.js`

**Interfaces:**
- Consumes: `CE.menuData.{ hasMenu, search, findItem, matchItem }`（Task 1）、`CE.lunch.lastOrder`、Task 3 的 `menuItemId`
- Produces: `CE.menuCombo(input: HTMLInputElement, storeId: string, opts: { onPick(item), isLast?(item) → boolean })`；該店沒菜單時什麼都不做

- [ ] **Step 1: 跑 driver 確認目前沒有下拉（失敗）**

```bash
D=.superpowers/sdd/2026-10-16-critieat-menu-item-link; U=http://127.0.0.1:8010
ME="js:localStorage.setItem('critieat.me','小明')"
node $D/drive-link.js $D "$U/lunch.html" c0 1440 900 "$ME" reload \
  "js:document.querySelector('.editor__row .editor__name').focus()" type:鍋 info:C0
```

Expected: `C0 => {"combo":null,"combos":0,...}`

- [ ] **Step 2: 實作 `proto/v1/js/menu-combo.js`**

```js
(function (CE) {
  'use strict';
  // 開團單「餐點名稱」的菜單品項下拉（自動完成）。
  // 整頁共用一個選單元素（#menu-combo），掛在 body、fixed 定位；編輯區每次重畫都會重新掛到新的輸入框上，
  // 舊輸入框被移除時會失焦，選單跟著關掉。選了品項由呼叫端（opts.onPick）決定怎麼帶入。

  const MAX = 8;
  let menu = null;
  let current = null; // { input, storeId, opts, items, active }

  // 所有資料一律用 textContent 寫入，不用 innerHTML
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function price(n) {
    if (n == null) return '—';
    return '$' + (Number.isInteger(n) ? n : n.toFixed(1));
  }

  function place() {
    if (!current || !current.input.isConnected) { close(); return; }
    const r = current.input.getBoundingClientRect();
    const w = Math.min(Math.max(r.width, 280), window.innerWidth - 16);
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    menu.style.top = (r.bottom + 6) + 'px';
    menu.style.width = w + 'px';
    menu.style.maxHeight = Math.max(120, Math.min(320, window.innerHeight - r.bottom - 18)) + 'px';
  }

  function getMenuEl() {
    if (menu) return menu;
    menu = el('ul', 'combo-menu mcombo');
    menu.id = 'menu-combo';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    menu.addEventListener('mousedown', e => e.preventDefault()); // 點選單時不要讓輸入框失焦
    document.body.append(menu);
    window.addEventListener('resize', () => { if (!menu.hidden) place(); });
    window.addEventListener('scroll', e => { if (!menu.hidden && e.target !== menu) place(); }, true);
    return menu;
  }

  function close() {
    if (!menu) return;
    menu.hidden = true;
    if (current) {
      current.active = -1;
      current.input.setAttribute('aria-expanded', 'false');
    }
  }

  function setActive(i) {
    current.active = i;
    [...menu.children].forEach((li, k) => {
      li.classList.toggle('is-active', k === i);
      li.setAttribute('aria-selected', String(k === i));
      if (k === i) li.scrollIntoView({ block: 'nearest' });
    });
  }

  function pick(item) {
    const c = current;
    close();
    c.opts.onPick(item);
  }

  function open(c) {
    current = c;
    const m = getMenuEl();
    const q = c.input.value.trim();
    c.items = CE.menuData.search(c.storeId, q, MAX);
    c.active = -1;
    m.replaceChildren();
    if (!c.items.length) { close(); return; }
    c.items.forEach((it, i) => {
      const li = el('li', 'mcombo__item');
      li.setAttribute('role', 'option');
      const name = el('span', 'mcombo__name');
      // 符合輸入的那一段加粗
      const at = it.name.toLowerCase().indexOf(q.toLowerCase());
      if (at < 0) name.append(it.name);
      else name.append(it.name.slice(0, at), el('b', null, it.name.slice(at, at + q.length)), it.name.slice(at + q.length));
      if (it.note) name.append(el('span', 'mcombo__note', it.note));
      if (c.opts.isLast && c.opts.isLast(it)) name.append(el('span', 'mcombo__last', '上次點'));
      li.append(name, el('span', 'mcombo__price mono', price(it.price)));
      li.addEventListener('mousemove', () => { if (c.active !== i) setActive(i); });
      li.addEventListener('click', () => pick(it));
      m.append(li);
    });
    m.hidden = false;
    m.scrollTop = 0;
    c.input.setAttribute('aria-expanded', 'true');
    place();
  }

  CE.menuCombo = function menuCombo(input, storeId, opts) {
    if (!CE.menuData.hasMenu(storeId)) return; // 沒有菜單的店：跟原本一樣，只是一般輸入框
    const c = { input, storeId, opts, items: [], active: -1 };
    getMenuEl();
    input.autocomplete = 'off';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', 'menu-combo');
    input.setAttribute('aria-expanded', 'false');

    input.addEventListener('input', () => { if (input.value.trim()) open(c); else if (current === c) close(); });
    input.addEventListener('blur', () => { if (current === c) close(); });
    input.addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229) return; // 注音選字中（Safari 選字確認的 Enter 是 keyCode 229）
      const shown = current === c && !menu.hidden;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!shown) { if (input.value.trim()) open(c); return; }
        e.preventDefault();
        const n = c.items.length;
        setActive(e.key === 'ArrowDown' ? (c.active + 1) % n : (c.active - 1 + n) % n);
      } else if (e.key === 'Enter') {
        if (!shown) return;
        e.preventDefault();
        if (c.active > -1) pick(c.items[c.active]);
        else close(); // 沒選任何一筆：照打的字
      } else if (e.key === 'Escape') {
        if (shown) { e.preventDefault(); close(); }
      }
    });
  };
})(globalThis.CE = globalThis.CE || {});
```

- [ ] **Step 3: 改 `proto/v1/js/lunch-app.js`**

`draftRowsOf` 改成（草稿帶連結）：

```js
  const draftRowsOf = (card, me) => card.items.filter(it => it.member === me)
    .map(it => ({ id: it.id, name: it.name, price: it.price === null ? '' : String(it.price), note: it.note, menuItemId: it.menuItemId || '' }));
```

`sameRows` 改成（連結不同也算有改）：

```js
  const rowSig = r => [r.name.trim(), String(r.price).trim(), r.note.trim(), r.menuItemId || ''];
  const sameRows = (a, b) => JSON.stringify(a.filter(r => !isBlank(r)).map(rowSig)) === JSON.stringify(b.map(rowSig));
```

`renderLastOrder` 的「帶入」對應的 map 改成帶上連結：

```js
        state.draft = state.draft.filter(r => !isBlank(r)).concat(last.items.map(it => ({
          name: it.name, price: it.price === null ? '' : String(it.price), note: it.note, menuItemId: it.menuItemId || '',
        })));
```

在 `renderEditor` 前面加：

```js
  // 上次在這家點過、對得到目前菜單的品項 ID（下拉裡標「上次點」）
  function lastItemIds(card) {
    const ids = new Set();
    const last = L.lastOrder(state.db.cards, card.storeId, state.me, card.date);
    if (!last) return ids;
    last.items.forEach(it => {
      const m = it.menuItemId
        ? CE.menuData.findItem(card.storeId, it.menuItemId)
        : CE.menuData.matchItem(card.storeId, it.name, it.note);
      if (m) ids.add(m.id);
    });
    return ids;
  }
```

`renderEditor` 改成（名稱欄包一層放標記、接上下拉；其他照舊）：

```js
  function renderEditor(box, card) {
    const wrap = el('div', 'editor');
    wrap.append(el('div', 'sect', `我的餐點（${state.me}）`));
    renderLastOrder(wrap, card);
    const lastIds = lastItemIds(card);
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

      // 品名欄：從菜單選了品項會標「📋 菜單」；之後手動改品名就解除連結
      const nameBox = el('div', 'editor__namebox');
      const tag = el('span', 'editor__menutag', '📋 菜單');
      const name = input('editor__name', row.name, '餐點名稱', v => {
        row.name = v;
        if (row.menuItemId) { row.menuItemId = ''; tag.remove(); nameBox.classList.remove('is-linked'); }
      });
      nameBox.append(name);
      if (row.menuItemId) { nameBox.classList.add('is-linked'); nameBox.append(tag); }
      CE.menuCombo(name, card.storeId, {
        isLast: it => lastIds.has(it.id),
        onPick(it) {
          Object.assign(row, {
            name: it.name,
            price: Number.isInteger(it.price) ? String(it.price) : '', // 開團單價格只收整數（每顆 6.5 這種留空）
            note: it.note || '',
            menuItemId: it.id,
          });
          state.rowErrors = [];
          renderCard();
          const next = document.querySelectorAll('.editor__row .editor__price')[i];
          if (next) next.focus();
        },
      });

      r.append(nameBox, price, input('editor__note', row.note, '備註（選填）', v => { row.note = v; }), del);
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
```

- [ ] **Step 4: `proto/v1/css/style.css`**

把 `.editor__name { flex: 2; }` 改成：

```css
.editor__namebox { flex: 2; min-width: 0; position: relative; display: flex; }
.editor__namebox .editor__name { flex: 1; width: 100%; }
.editor__namebox.is-linked .editor__name { padding-right: 70px; }
.editor__menutag {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%); pointer-events: none;
  font-size: 10.5px; font-weight: 700; color: var(--cyan-ink); background: rgba(0, 240, 255, .14); border-radius: 6px; padding: 1px 6px;
}
```

手機區塊（`@media (max-width: 900px)` 開團單那段）的 `.editor__name { flex: 1 1 100%; }` 改成 `.editor__namebox { flex: 1 1 100%; }`。

`.combo-menu__hint` 那行後面加：

```css
.mcombo__item { display: flex; align-items: baseline; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; }
.mcombo__item.is-active { background: rgba(0, 240, 255, .16); }
.mcombo__name { flex: 1; min-width: 0; }
.mcombo__name b { font-weight: 800; color: var(--cyan-ink); }
.mcombo__note { margin-left: 6px; font-size: 11.5px; color: var(--faint); }
.mcombo__last { margin-left: 6px; font-size: 10.5px; font-weight: 700; color: var(--purple-ink); }
.mcombo__price { flex: none; font-size: 12.5px; font-weight: 700; }
```

- [ ] **Step 5: `proto/v1/lunch.html` 載入**

`<script src="js/menu-lightbox.js"></script>` 後面加 `<script src="js/menu-combo.js"></script>`。

- [ ] **Step 6: 跑 UI 流程（桌機 1440）**

```bash
D=.superpowers/sdd/2026-10-16-critieat-menu-item-link; U=http://127.0.0.1:8010
ME="js:localStorage.setItem('critieat.me','小明')"
NAME0="js:document.querySelectorAll('.editor__row .editor__name')[0].focus()"
CARD() { echo "js:[...document.querySelectorAll('#card-list .item')].find(b=>b.textContent.includes('$1')).click()"; }
SUBMIT="js:[...document.querySelectorAll('.editor .btn--primary')].find(b=>b.textContent==='送出').click()"
STORED="val:JSON.parse(localStorage.getItem('critieat.lunch.v1')).cards.find(c=>c.id==='demo-c1').items.filter(i=>i.member==='小明').map(i=>[i.name,i.price,i.note,i.menuItemId||''])"

# C1 八方雲集（點餐中）：打字 → 鍵盤選 → 帶入 → 送出
node $D/drive-link.js $D "$U/lunch.html" c1 1440 900 "$ME" reload "$(CARD 八方雲集)" "$NAME0" type:鍋 info:C1a \
  key:ArrowDown key:ArrowDown info:C1b key:Enter info:C1c shot:C1-picked "$SUBMIT" "$STORED"
# C2 帶入後改備註 → 連結保留；改品名 → 連結消失
node $D/drive-link.js $D "$U/lunch.html" c2 1440 900 "$ME" reload "$(CARD 八方雲集)" "$NAME0" type:鍋 key:ArrowDown key:Enter \
  "js:(()=>{const n=document.querySelectorAll('.editor__row .editor__note')[0];n.focus()})()" type:，不要辣 info:C2a \
  "$NAME0" key:End type:加大 info:C2b "$SUBMIT" "$STORED"
# C3 虎記（今天已收單）：上次點 標記、滑鼠點選、價格整數帶入
node $D/drive-link.js $D "$U/lunch.html" c3 1440 900 "$ME" reload "$(CARD 虎記)" "$NAME0" type:飯 info:C3a \
  "js:[...document.querySelectorAll('#menu-combo .mcombo__item')].find(li=>li.textContent.includes('控肉飯')).click()" info:C3b
# C4 沒選任何一筆按 Enter → 照打的字、下拉關閉；Esc 關閉；選字中 Enter 不帶入
node $D/drive-link.js $D "$U/lunch.html" c4 1440 900 "$ME" reload "$(CARD 八方雲集)" "$NAME0" type:湯 key:Enter info:C4a \
  type:麵 info:C4b key:Escape info:C4c key:ArrowDown key:ArrowDown key:Enter:229 info:C4d
# C5 沒有菜單的店：把 demo-c1 改成蜥蜴咖哩 → 沒有下拉
node $D/drive-link.js $D "$U/lunch.html" c5 1440 900 "$ME" \
  "js:(()=>{const db=JSON.parse(localStorage.getItem('critieat.lunch.v1'));const c=db.cards.find(c=>c.id==='demo-c1');c.storeId='R003';c.storeName='蜥蜴咖哩';localStorage.setItem('critieat.lunch.v1',JSON.stringify(db))})()" \
  reload "$(CARD 蜥蜴咖哩)" "$NAME0" type:飯 info:C5
# C6 選了沒送出 → 換卡片再回來 → 連結還在
node $D/drive-link.js $D "$U/lunch.html" c6 1440 900 "$ME" reload "$(CARD 八方雲集)" "$NAME0" type:鍋 key:ArrowDown key:Enter \
  "$(CARD 虎記)" "$(CARD 八方雲集)" info:C6
```

Expected:
- C1a：`combo` 3 筆依序含 `招牌鍋貼`、`韓式辣味鍋貼`、`咖哩鍋貼`，價格 `$6`、`$6.5`、`$6.5`；`combos` 為 `1`
- C1b：第 2 筆（韓式辣味鍋貼）結尾 ` *`
- C1c：`combo` 為 `null`；第 1 列 `name` `韓式辣味鍋貼`、`price` `""`（6.5 不是整數）、`note` `每顆`、`linked` `true`；`focus` 含 `editor__price`；`combos` 仍是 `1`
- C1 val：`[["韓式辣味鍋貼",null,"每顆","R006-02"]]`
- C2a：`note` 為 `每顆，10 顆起，不要辣`、`linked` `true`
- C2b：`name` 為 `招牌鍋貼加大`、`linked` `false`；val 的第 4 個值是 `""`
- C3a：`combo` 5 筆（`魯肉飯 小`、`魯肉飯 大`、`雞肉飯`、`控肉飯 … 上次點`、`排骨飯`）；只有控肉飯那筆含「上次點」
- C3b：第 1 列 `控肉飯`、`price` `85`、`note` `附半顆滷蛋`、`linked` `true`
- C4a：`combo` `null`、`name` `湯`、`linked` `false`
- C4b：`combo` 只有一筆 `餛飩湯麵`（`湯麵` 包含）
- C4c：`combo` `null`
- C4d：`combo` 仍顯示（229 不處理）、`name` 仍是 `湯麵`、`linked` `false`
- C5：`combo` `null`、`combos` `0`
- C6：第 1 列 `招牌鍋貼`、`linked` `true`
- 全部沒有 `EXC`、`STEP FAIL`

- [ ] **Step 7: 手機（390）**

```bash
node $D/drive-link.js $D "$U/lunch.html" phone 390 844 "$ME" reload "$(CARD 八方雲集)" "$NAME0" type:鍋 info:M1 shot:M1-phone key:ArrowDown key:Enter info:M2 shot:M2-phone
```

Expected：M1 `comboRight` ≤ `vw`（390）、`overflow` `false`；M2 `linked` `true`。看兩張截圖：下拉不超出畫面、標記不壓到文字。

- [ ] **Step 8: 開團單原有功能回歸**

用原本的開團單 driver（步驟格式見它開頭註解：`me:`、`sel:`、`fill:<列>|<品項>|<價格>|<備註>`、`btn:`）：

```bash
L=.superpowers/sdd/2026-10-14-critieat-lunch-card-proto
# R1 自由輸入點餐送出（原 order2 情境）
node $L/drive-lunch.js $D "$U/lunch.html" r1 1440 900 me:阿翔 sel:0 "fill:0|鍋貼|70|多醬" "btn:＋ 再加一項" "fill:1|豆漿||" btn:送出
# R2 已收單後修改（虎記）
node $L/drive-lunch.js $D "$U/lunch.html" r2 1440 900 me:阿凱 sel:2 "fill:0|魯肉飯（小）|35|" btn:送出
# R3 「上次你點了」帶入（虎記，小明上次點控肉飯、燙青菜）
node $L/drive-lunch.js $D "$U/lunch.html" r3 1440 900 me:小明 sel:2 btn:帶入 btn:送出
```

Expected:
- R1：card 含 `阿翔 / 鍋貼 / 多醬 / $70 / 豆漿` 與 `4 人 已知 $360（1 項未填價格）`
- R2：card 含 `魯肉飯（小）`，且有「收單後修改」字樣
- R3：card 含 `小明` 與 `控肉飯`、`燙青菜`
- 三個都沒有 `EXC`、`STEP FAIL`，`overflow false`

- [ ] **Step 9: 收尾**

停掉 8010 伺服器。`progress.md` 加：`Task 4: complete (C1–C6、M1–M2、lunch 回歸 3 情境通過；截圖 C1-picked、M1-phone、M2-phone)`

---

## 完成後

請使用者在 `http://localhost:8000/lunch.html` 試：在八方雲集或虎記的點餐列打「鍋」「飯」。接著寫計畫 ②（品項評分）。
