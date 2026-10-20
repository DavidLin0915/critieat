# CRITIEAT 店家新增／編輯（Google 帶入）原型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 美食地圖可新增、編輯、移除店家，用 Google Places (New) 帶入地址／座標／電話／營業時間；所有頁面讀同一份店家清單；另做一次性工具補齊現有 10 家。

**Architecture:** 沿用 `proto/v1`：純靜態 HTML + 原生 JS，IIFE 掛 `globalThis.CE`。純邏輯 `store-edit.js`（合併、ID、驗證、營業時間轉換、CSV 輸出）可用 node 測；`store-repo.js` 管 localStorage 覆蓋層並提供 `all()`／`visible()` 給各頁；`places.js` 包 Maps JS 的 Places (New)；`store-form.js` 是燈箱。`app.js` 只放入口與重繪。

**Tech Stack:** HTML5、CSS（接在 `css/style.css` 末段）、原生 JavaScript（ES2020）、Google Maps JavaScript API（`libraries=places`）；檢查用 node 18（`vm`）+ headless Chrome（CDP）。

**Spec:** `docs/specs/2026-10-16-critieat-store-edit-design.md`

## Global Constraints

- 分類固定 7 種：`飯、麵、便當、小吃、異國、輕食、其他`
- 移除＝`visible: false`，不刪資料；不做恢復清單
- `placeId` 唯一：新增或編輯時，選中的 Google 店家已屬於別家店 → 擋下並顯示「這家已經有了」＋「去看這家」（那家可見時才有按鈕）。例外：新增時符合的是已移除的店 → 沿用那家的 ID 重新顯示
- 覆蓋層 localStorage key `critieat.stores.v1` = `{ stores: Store[] }`，每筆是整家店；身分 key `critieat.me`（共用）
- 新店 ID：基本清單＋覆蓋層中 `/^R(\d+)$/` 最大值 +1，補零到 3 位（`R011`）
- 只在使用者打字搜尋（停頓 300ms、≥ 2 字）與選中候選時呼叫 Google；開頁面、看詳情不呼叫
- 重新帶入（編輯）覆蓋：地址、座標、電話、營業時間、Google Maps 連結、placeId；保留：店名、分類、外送連結、備註。**Google 沒有營業時間時保留原本的**（Claude 的決定，避免清掉手填資料）
- 固定文字：
  - 帶入標記「已從 Google 帶入」；Google 失敗「Google 搜尋暫時無法使用，請手動填寫」
  - 錯誤：「請填店名」「請選分類」「連結要以 http:// 或 https:// 開頭」；營業時間黃字「看不懂這個格式，會當成「不確定」」
  - 移除確認「確定把 {店名} 從地圖移除？過去的開團單和評分會保留。」按鈕「確定移除」「取消」
  - 放棄確認「放棄修改？」按鈕「放棄」「繼續編輯」
  - 小地圖失敗「地圖暫時無法使用，位置可之後再補」
  - 最後修改「最後修改：{成員}・{M/D HH:mm}」（台灣時間）
  - 覆蓋層壞掉「本機店家資料無法讀取，已改用預設清單」；存不進去「無法儲存到這台電腦的瀏覽器」
  - 曾移除的店「這家之前被移除過，儲存後會重新出現在地圖上」
- 所有資料以 `textContent` 寫入 DOM，禁止 `innerHTML`（`map.js` 既有的 fallback 字串除外）；不用 `alert`／`confirm`／`prompt`
- IME：搜尋框的 Enter 在 `e.isComposing || e.keyCode === 229` 時不處理
- **不得引入測試框架**；邏輯用 scratchpad 的 node 檢查腳本，畫面用 headless Chrome
- **不做 git 操作**（`critieat/` 不受版控）。每個 Task 結束在 `.superpowers/sdd/2026-10-16-critieat-store-edit/progress.md` 記一行
- Key 只允許 `http://localhost:8000/*`，不可繞過（不偽造 Referer、不另用 server 呼叫）

## Review Focus

1. **`critieat.stores.v1` 壞掉或 localStorage 被封鎖** → 用 `data.js` 原始清單、各頁照常，美食地圖顯示「本機店家資料無法讀取，已改用預設清單」；存檔失敗時燈箱不關、顯示「無法儲存到這台電腦的瀏覽器」。Task 2 `RF1`、Task 4 `RF1`
2. **已移除的店仍被引用**：開團單歷史卡片照樣顯示店名；`index.html?store=<已移除>` 不開詳情；轉盤、開團單新卡下拉、公車地圖都不出現。Task 2 `RF2`
3. **Google 營業時間的怪形狀**：24 小時（只有 open）、跨午夜、收在隔天 00:00、一天兩段、某天沒時段、完全沒有 → 轉換正確。Task 1 `RF3`
4. **有未存修改時用 Esc、✕、點背景關燈箱** → 都先問「放棄修改？」；沒改過直接關。Task 4 `RF4`
5. **搜尋框用注音選字按 Enter（keyCode 229）** → 不選中候選、不送出表單。Task 4 `RF5`

---

## 檔案結構

| 檔案 | 動作 | 負責 |
|---|---|---|
| `proto/v1/js/stores.js` | 修改 | 新欄位、保留已移除的店、匯出表頭 |
| `proto/v1/js/store-edit.js` | 新增 | 純邏輯 `CE.storeEdit` |
| `proto/v1/js/store-repo.js` | 新增 | `CE.storeRepo`（覆蓋層、事件） |
| `proto/v1/js/places.js` | 新增 | `CE.places`（Google Places New） |
| `proto/v1/js/store-form.js` | 新增 | `CE.openStoreForm` 燈箱 |
| `proto/v1/js/map.js` | 修改 | 載入網址加 `libraries=places` |
| `proto/v1/js/app.js`、`lunch-app.js`、`bus-app.js` | 修改 | 改讀 `storeRepo` |
| `proto/v1/index.html`、`lunch.html`、`bus.html` | 修改 | 載入新檔 |
| `proto/v1/css/style.css` | 修改 | 末段加「店家編輯」區塊 |
| `proto/v1/tools/backfill.html`、`tools/backfill.js` | 新增 | 一次性補資料工具 |
| `proto/v1/js/data.js`、`docs/sheet/stores-template.csv`、`docs/sheet/README.md` | 修改 | 新三欄 |

檢查工具（不屬於專案）：
- `<scratchpad>/store-edit/`：`check-store-edit.js`、`check-store-repo.js`（用 `vm` 載入 `csv.js`、`hours.js`、`stores.js`、`data.js`、`store-edit.js`、`store-repo.js`，假 `localStorage`）
- `.superpowers/sdd/2026-10-16-critieat-store-edit/drive-store.js`：由 `.superpowers/sdd/2026-10-16-critieat-item-rating/drive-item.js` 複製，加步驟 `stub:places`（注入假的 `CE.places`，見 Task 4）；`progress.md`、截圖

`<scratchpad>` = `/private/tmp/claude-501/-Users-critical-Documents-critieat/1cb69dc9-a722-44f5-a625-88e925f2cb82/scratchpad`

檢查用伺服器：在 `proto/v1` 內 `python3 -m http.server 8010 --bind 127.0.0.1`。8010 上 Google 會出 `RefererNotAllowedMapError`（預期）；Google 相關畫面用假的 `CE.places` 測，真的 Google 留到 Task 6 由使用者在 8000 上確認。

---

### Task 1: 資料欄位與純邏輯 `store-edit.js`

**Files:**
- Modify: `proto/v1/js/stores.js`（`HEADER_MAP`、`rowsToStores`）
- Modify: `proto/v1/js/data.js`（表頭與每列尾端加三個空欄）
- Modify: `docs/sheet/stores-template.csv`、`docs/sheet/README.md`（填寫規則加三欄說明：Place ID 由網站帶入、最後修改者／時間由網站寫入，不要手改）
- Create: `proto/v1/js/store-edit.js`
- Test: `<scratchpad>/store-edit/check-store-edit.js`

**Interfaces:**
- Produces：
  - `HEADER_MAP` 加 `'Google Place ID': 'place_id'`、`'最後修改者': 'updated_by'`、`'最後修改時間': 'updated_at'`
  - `CE.STORE_HEADERS: string[]`：完整中文表頭，順序＝現有 21 欄＋上述 3 欄
  - Store 加 `placeId: string`、`updatedBy: string`、`updatedAt: string`、`visible: boolean`
  - `rowsToStores` 不再濾掉 `顯示 = 否`，改帶 `visible: false`（其他值都是 `true`）
  - `CE.storeEdit`：
    - `CATEGORIES = ['飯','麵','便當','小吃','異國','輕食','其他']`
    - `merge(base: Store[], overlay: Store[]) → Store[]`：同 ID 整筆取代（保持 base 順序），新 ID 依 overlay 順序接在後面
    - `nextId(stores: Store[]) → string`
    - `isValidOverlay(db) → boolean`：`{ stores: [] }`，每筆 `id`／`name` 非空字串、`category` 在 `CATEGORIES`、`hours` 有 7 個字串欄、`links` 有 4 個字串欄、`lat`／`lng` 同為數字或同為 `null`、`visible` 是 boolean、ID 不重複
    - `validate(input) → { store: Store|null, errors: {[field]: string}, warnings: {[day]: string} }`：`input` 與 Store 同形（字串欄位未 trim）；trim 所有字串；`errors` 鍵用 `name`、`category`、`link.googleMaps|foodpanda|ubereats|nidin`；`warnings` 鍵用 `mon`…`sun`；有 errors 時 `store` 為 `null`
    - `periodsToHours(openingHours) → { mon…sun } | null`：輸入 Google `regularOpeningHours`（`{ periods: [{ open:{day,hour,minute}, close?:{day,hour,minute} }] }`），`null`／`undefined` → `null`
    - `cleanAddress(s) → string`：去掉開頭郵遞區號（3～6 位數字）與「台灣」
    - `cleanPhone(s) → string`：空白換成 `-`
    - `toCsv(stores: Store[]) → string`：表頭 `CE.STORE_HEADERS`，`visible` 輸出 `是`／`否`；含 `,` `"` 換行的值用雙引號包、內部 `"` 變 `""`；結尾換行

- [ ] **Step 1: 寫檢查腳本 `check-store-edit.js`**（`vm` 依序載入 `csv.js`、`hours.js`、`stores.js`、`data.js`、`store-edit.js`；用 `assert`）

```js
const base = CE.rowsToStores(CE.parseCsv(CE.DEMO_STORES_CSV));
assert.equal(base.length, 10);
assert.ok(base.every(s => s.visible === true && s.placeId === ''));
const hiddenCsv = CE.DEMO_STORES_CSV.replace(/,是,,,\n/, ',否,,,\n'); // 第一家改成否（顯示欄後面是新加的 3 個空欄）
assert.equal(CE.rowsToStores(CE.parseCsv(hiddenCsv))[0].visible, false);

const E = CE.storeEdit;
const edited = Object.assign({}, base[1], { name: '虎記（改）' });
const added = Object.assign({}, base[0], { id: 'R011', name: '新店' });
const m = E.merge(base, [added, edited]);
assert.deepEqual(m.map(s => s.id), ['R001','R002','R003','R004','R005','R006','R007','R008','R009','R010','R011']);
assert.equal(m[1].name, '虎記（改）');
assert.equal(E.nextId(m), 'R012');
assert.equal(E.nextId([]), 'R001');
assert.equal(E.nextId([{ id: 'R099' }, { id: 'X5' }]), 'R100');

assert.equal(E.isValidOverlay({ stores: [added] }), true);
assert.equal(E.isValidOverlay({ stores: [added, added] }), false);
assert.equal(E.isValidOverlay({ stores: [Object.assign({}, added, { category: '飲料' })] }), false);
assert.equal(E.isValidOverlay({ stores: [Object.assign({}, added, { lat: 25, lng: null })] }), false);
assert.equal(E.isValidOverlay([]), false);

const v1 = E.validate(Object.assign({}, base[0], { name: '  ', category: '' }));
assert.deepEqual(v1.errors, { name: '請填店名', category: '請選分類' });
assert.equal(v1.store, null);
const v2 = E.validate(Object.assign({}, base[0], { links: { googleMaps: 'javascript:x', foodpanda: '', ubereats: '', nidin: '' } }));
assert.equal(v2.errors['link.googleMaps'], '連結要以 http:// 或 https:// 開頭');
const v3 = E.validate(Object.assign({}, base[0], { name: ' 新名 ', hours: Object.assign({}, base[0].hours, { mon: '早上', tue: '11:00-14:00' }) }));
assert.deepEqual(v3.warnings, { mon: '看不懂這個格式，會當成「不確定」' });
assert.equal(v3.store.name, '新名');

// RF3：營業時間轉換
const P = (d, h, mi) => ({ day: d, hour: h, minute: mi });
assert.equal(E.periodsToHours(null), null);
assert.deepEqual(E.periodsToHours({ periods: [{ open: P(0, 0, 0) }] }),
  { mon: '00:00-24:00', tue: '00:00-24:00', wed: '00:00-24:00', thu: '00:00-24:00', fri: '00:00-24:00', sat: '00:00-24:00', sun: '00:00-24:00' });
const h = E.periodsToHours({ periods: [
  { open: P(1, 17, 0), close: P(1, 20, 30) }, { open: P(1, 11, 0), close: P(1, 14, 0) }, // 週一兩段，順序亂
  { open: P(2, 18, 0), close: P(3, 2, 0) },                                              // 週二跨午夜
  { open: P(3, 11, 0), close: P(4, 0, 0) },                                              // 週三收在隔天 00:00
] });
assert.deepEqual(h, { mon: '11:00-14:00, 17:00-20:30', tue: '18:00-02:00', wed: '11:00-24:00', thu: '公休', fri: '公休', sat: '公休', sun: '公休' });
Object.values(h).forEach(s => assert.notEqual(CE.parseHours(s).type, 'unknown'));

assert.equal(E.cleanAddress('115台灣台北市南港區興中路28號'), '台北市南港區興中路28號');
assert.equal(E.cleanPhone('02 2785 1234'), '02-2785-1234');

const withComma = Object.assign({}, base[0], { note: '有 "辣", 很辣', placeId: 'ChIJabc', visible: false });
const round = CE.rowsToStores(CE.parseCsv(E.toCsv([withComma, base[1]])));
assert.deepEqual(round, [withComma, base[1]]);
assert.ok(E.toCsv(base).startsWith(CE.STORE_HEADERS.join(',') + '\n'));
console.log('store-edit OK');
```

- [ ] **Step 2: 執行，確認失敗**：`node <scratchpad>/store-edit/check-store-edit.js` → 失敗（`CE.storeEdit` 未定義）
- [ ] **Step 3: 實作** `stores.js` 的改動、`data.js` 三欄、`store-edit.js`、Sheet 範本與 README
- [ ] **Step 4: 執行，確認通過**：印出 `store-edit OK`
- [ ] **Step 5: 回歸**：在 8010 開 `index.html`、`lunch.html`、`bus.html`，console 沒有錯誤、清單仍 10 家（此時三頁還讀 `rowsToStores`，已移除的店暫時會顯示，Task 2 修正）
- [ ] **Step 6: 記錄** progress.md 一行

### Task 2: `store-repo.js` 與各頁改讀同一份清單

**Files:**
- Create: `proto/v1/js/store-repo.js`
- Modify: `proto/v1/js/app.js:208`、`proto/v1/js/lunch-app.js:727`、`proto/v1/js/bus-app.js:391`
- Modify: `proto/v1/index.html`、`lunch.html`、`bus.html`（`data.js` 之後加 `store-edit.js`、`store-repo.js`）
- Test: `<scratchpad>/store-edit/check-store-repo.js`

**Interfaces:**
- Consumes：`CE.storeEdit.merge / nextId / isValidOverlay`、`CE.rowsToStores`、`CE.DEMO_STORES_CSV`
- Produces（`CE.storeRepo`）：
  - `warning() → string|null`（覆蓋層壞掉或讀不到時為固定文字；第一次呼叫任何方法時才讀）
  - `all() → Store[]`、`visible() → Store[]`、`get(id) → Store|null`（含已移除）
  - `findByPlaceId(placeId) → Store|null`（空字串回 `null`）
  - `nextId() → string`
  - `save(store: Store, member: string, now: Date) → boolean`：蓋上 `updatedBy = member`、`updatedAt = now.toISOString()`，寫入覆蓋層；成功後 `document`（存在時）發 `ce:store-change`，`detail: { id }`
  - `remove(id, member, now) → boolean`：等同把那家 `visible: false` 後 `save`
  - `reset() → void`：刪掉 `critieat.stores.v1` 並發事件（`detail: { id: null }`）
  - 每次呼叫都重新讀 localStorage（不快取），其他分頁改過、重新整理後即看到

- [ ] **Step 1: 寫 `check-store-repo.js`**（假 `localStorage` 物件；可切換成 `getItem` 會丟例外）

```js
const R = CE.storeRepo;
assert.equal(R.all().length, 10); assert.equal(R.warning(), null);
const s = Object.assign({}, R.get('R002'), { note: '改' });
assert.equal(R.save(s, '小王', new Date('2026-10-16T05:00:00Z')), true);
assert.equal(R.get('R002').updatedBy, '小王');
assert.equal(R.get('R002').updatedAt, '2026-10-16T05:00:00.000Z');
assert.equal(R.nextId(), 'R011');
assert.equal(R.save(Object.assign({}, s, { id: 'R011', name: '新店', placeId: 'P1' }), '小王', new Date()), true);
assert.equal(R.findByPlaceId('P1').id, 'R011'); assert.equal(R.findByPlaceId(''), null);
assert.equal(R.remove('R011', '小李', new Date()), true);
assert.equal(R.visible().some(x => x.id === 'R011'), false);
assert.equal(R.get('R011').name, '新店'); // RF2：all／get 仍查得到
// RF1：壞掉的覆蓋層
storage['critieat.stores.v1'] = '{"stores":[{"id":1}]}';
assert.equal(R.all().length, 10); assert.equal(R.warning(), '本機店家資料無法讀取，已改用預設清單');
// RF1：setItem 丟例外
breakSetItem = true; assert.equal(R.save(R.get('R001'), '小王', new Date()), false); breakSetItem = false;
R.reset(); assert.equal(storage['critieat.stores.v1'], undefined); assert.equal(R.all().length, 10);
console.log('store-repo OK');
```

- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作 `store-repo.js`**，三頁改讀：`app.js` 用 `CE.storeRepo.visible()`；`lunch-app.js` 的 `refreshDay` 用 `visible()`（`storeOf` 用 `CE.storeRepo.get` 補查已移除的店，卡片本身已存 `storeName`）；`bus-app.js` 用 `visible()`；`app.js` 的 `?store=` 只接受 `visible()` 裡的 ID
- [ ] **Step 4: 執行，確認通過**：`store-repo OK`
- [ ] **Step 5: RF2 瀏覽器檢查**（`drive-store.js`）：先 `js:` 在 localStorage 寫入一筆把 R002 設 `visible:false` 的覆蓋層 → `reload`；確認 `index.html` 清單 9 家、`index.html?store=R002` 沒開詳情、`lunch.html` 新卡下拉沒有虎記且示範歷史卡（若有 R002）仍顯示店名、`bus.html` 店家圖層沒有 R002（`val:` 讀 `state` 不可得時改讀 DOM／`CE.renderBusStores` 參數長度）、三頁 console 無錯誤
- [ ] **Step 6: 記錄** progress.md

### Task 3: `places.js`（Google Places New）

**Files:**
- Modify: `proto/v1/js/map.js:83`（網址加 `&libraries=places`）
- Create: `proto/v1/js/places.js`
- Modify: `proto/v1/index.html`（`map.js` 之後載入 `places.js`）

**Interfaces:**
- Consumes：`CE.storeEdit.periodsToHours / cleanAddress / cleanPhone`
- Produces（`CE.places`）：
  - `available() → boolean`：`google.maps.places.AutocompleteSuggestion` 存在
  - `suggest(text: string, center: {lat,lng}) → Promise<Suggestion[]>`；`Suggestion = { placeId, main, secondary, raw }`（`raw` 是 `placePrediction`）。用 `AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, sessionToken, locationBias: { center, radius: 2000 }, language: 'zh-TW', region: 'tw' })`；模組內持有一個 session token，沒有就新建
  - `details(s: Suggestion) → Promise<PlaceInfo>`：`s.raw.toPlace().fetchFields({ fields: FIELDS })`，完成後丟棄 session token
  - `searchText(query, center, radius) → Promise<PlaceInfo|null>`：`Place.searchByText({ textQuery, fields: FIELDS, locationBias: { center, radius }, language: 'zh-TW', region: 'tw', maxResultCount: 1 })`
  - `FIELDS = ['id','displayName','formattedAddress','location','nationalPhoneNumber','regularOpeningHours','googleMapsURI']`
  - `PlaceInfo = { placeId, name, address, lat, lng, phone, hours: {mon…sun}|null, googleMapsUrl }`（地址、電話過 `cleanAddress`／`cleanPhone`）
  - `load(key) → Promise<boolean>`：給沒有地圖的頁面（工具頁）用；`google.maps` 已存在直接 resolve
  - 所有失敗以 reject 傳給呼叫端

- [ ] **Step 1: 實作**
- [ ] **Step 2: 檢查**：8010 上 `index.html` 地圖照舊顯示 fallback、console 只有預期的 Referer 錯誤；`val:typeof CE.places.suggest` → `"function"`；`val:CE.places.available()` → `false`（key 被擋時）且不丟例外
- [ ] **Step 3: 記錄** progress.md（真的 Google 呼叫在 Task 6 驗）

### Task 4: 燈箱 `store-form.js` 與美食地圖入口

**Files:**
- Create: `proto/v1/js/store-form.js`
- Modify: `proto/v1/js/app.js`（入口、重置、`ce:store-change`）
- Modify: `proto/v1/index.html`（`places.js` 之後載入 `store-form.js`）
- Modify: `proto/v1/css/style.css`（末段 `/* 店家編輯 */`，class 前綴 `sdlg`，外框沿用 `.dlg .mdlg`）
- Test: `.superpowers/sdd/2026-10-16-critieat-store-edit/drive-store.js`

**Interfaces:**
- Consumes：`CE.storeRepo.*`、`CE.storeEdit.validate / CATEGORIES`、`CE.places.*`、`CE.lunchStore.getMe / setMe / peekMembers`、`CE.mapReady`、`CE.parseHours`
- Produces：`CE.openStoreForm(storeId: string|null, opts: { center: {lat,lng}, onDone(id: string|null) })`
  - `null` = 新增；`onDone(id)` 在儲存後帶店家 ID、移除後帶 `null`；取消不呼叫
  - `center`：公司座標，沒有就 `visible()` 有座標店家的平均，再沒有用 `map.js` 的 `FALLBACK_CENTER` 值 `{ lat: 25.0478, lng: 121.517 }`

行為（spec〈畫面〉一節的要點，實作照 spec）：
- 單一 `<dialog id="store-dlg" class="dlg mdlg sdlg">`；標題「新增店家」／「編輯店家　{店名}」
- 搜尋：輸入停頓 300ms、≥ 2 字才 `suggest`；過時回應丟掉（只用最後一次請求的結果）；上下鍵移動、Enter 選中、Esc 只關下拉；`CE.places.available()` 為 false 或 reject → 顯示失敗文字，表單照用
- 選中：`details` → 新增時填全部 PlaceInfo 欄位（店名也填）；編輯時照 Global Constraints 的覆蓋規則；被填的欄位標「已從 Google 帶入」，使用者再改該欄就拿掉。檢查 `findByPlaceId`：屬於別家（ID 不同）→ 擋下（不填欄位，顯示「這家已經有了」，那家 `visible` 時加「去看這家」按鈕：關燈箱並 `onDone(那家 ID)`）；新增時屬於已移除的店 → 填欄位、改用那家 ID、`visible: true`，顯示「這家之前被移除過…」
- 小地圖：`CE.mapReady` 時建 `google.maps.Map`（高 200px、`clickableIcons: false`、與 `map.js` 同樣的隱藏 POI 樣式），可拖曳 Marker；點地圖移動圖釘；帶入時圖釘跳過去；否則顯示失敗文字
- 身分：`getMe()` 不在 `peekMembers()` → 底部顯示「你是誰？」下拉，選了才可儲存；選完 `setMe` 並發 `ce:me-change`
- 儲存：`validate` → 有錯就標在欄位下、焦點移到第一個錯誤；`storeRepo.save` 失敗顯示存不進去文字、燈箱不關；成功關燈箱、`onDone(id)`
- 移除與放棄：在燈箱內換成確認區塊（不用 `confirm()`）；Esc 走 dialog `cancel` 事件 `preventDefault` 後判斷；「有改過」＝目前表單值與開啟時的值深度比較不同
- 最後修改列：`updatedBy` 有值才顯示
- 手機 ≤ 900px：全螢幕、單欄

`app.js`：
- 列表 `list__head` 右側加按鈕「＋ 新增店家」→ `CE.openStoreForm(null, …)`
- 詳情 `btns` 最前面加「✏️ 編輯」→ `CE.openStoreForm(v.id, …)`
- 列表最後加 `list__reset`「重置示範資料」→ `CE.storeRepo.reset()`
- 監聽 `ce:store-change`：重建 `state.all`、重畫列表與標記；選中的店不在 `visible()` 就關詳情
- `onDone(id)`：`id` 有值就 `select(id, 'map')`
- `storeRepo.warning()` 有值時在清單上方顯示（樣式照 `lunch-app.js` 的 notice）

`drive-store.js` 的 `stub:places` 注入：

```js
CE.places = {
  available: () => true,
  suggest: async t => t.length < 2 ? [] : [
    { placeId: 'P-TIGER', main: '虎記魯肉飯', secondary: '台北市南港區興中路28號', raw: null },
    { placeId: 'P-NEW', main: '測試新店', secondary: '台北市南港區三重路1號', raw: null }],
  details: async s => ({ placeId: s.placeId, name: s.main, address: s.secondary, lat: 25.055, lng: 121.61,
    phone: '02-2785-1234', hours: { mon: '11:00-14:00', tue: '11:00-14:00', wed: '11:00-14:00', thu: '11:00-14:00', fri: '11:00-14:00', sat: '公休', sun: '公休' },
    googleMapsUrl: 'https://maps.google.com/?cid=1' }),
};
```

- [ ] **Step 1: 寫 drive 步驟清單**（存成 `progress.md` 旁的 `steps.sh`，每條一個 `node drive-store.js …` 呼叫，寬 1280×860，另一組 390×844）：
  - `S1` 新增：`stub:places` → 點「＋ 新增店家」→ 搜尋框 `type:測試` → 等 400ms → `key:ArrowDown` `key:ArrowDown` `key:Enter` → 斷言店名「測試新店」、電話、週一欄有「已從 Google 帶入」標記 → 選分類「小吃」→ 選身分 → 儲存 → 斷言清單 11 家、詳情開的是「測試新店」、`localStorage['critieat.stores.v1']` 裡 ID `R011`、`placeId: 'P-NEW'`
  - `S2` 重複：再開新增、選「虎記魯肉飯」前先 `js:` 把 R002 的 placeId 設 `P-TIGER` → 斷言出現「這家已經有了」與「去看這家」，按下後詳情是虎記
  - `S3` 編輯重新帶入：開 R002 編輯，手改備註、把 foodpanda 填 `https://x`，再帶入 `P-TIGER`（先清掉 R002 自己的 placeId 以免被當重複）→ 斷言備註與 foodpanda 未變、地址變成 stub 值；`details` 回 `hours: null` 的變體 → 斷言營業時間保留原值
  - `S4` 驗證：店名清空、foodpanda 填 `javascript:1`、週一填「早上」→ 儲存 → 紅字兩個、黃字一個、燈箱未關；改回合法後可存
  - `S5` 移除：編輯 R011 → 「從地圖移除」→ 確認文字含店名 →「確定移除」→ 清單 10 家、詳情關閉
  - `RF1` `js:` 讓 `localStorage.setItem` 對 `critieat.stores.v1` 丟例外 → 儲存 → 顯示存不進去文字、燈箱仍開
  - `RF4` 改一個欄位後分別按 Esc、✕、點背景 → 每次出現「放棄修改？」；按「繼續編輯」值還在；沒改過按 Esc 直接關
  - `RF5` 搜尋框 `type:測試` → `key:Enter:229` → 下拉仍開、店名沒被填、燈箱未送出
  - `S6` Places 失敗：`js:CE.places.suggest = async () => { throw new Error('x') }` → 搜尋 → 顯示失敗文字，仍可手填存檔
  - `S7` 手機 390×844：開編輯，截圖確認單欄、全螢幕、底部按鈕可見
  - `S8` 重置：按「重置示範資料」→ 清單回 10 家、R002 的修改不見
- [ ] **Step 2: 執行，確認失敗**（`CE.openStoreForm` 不存在）
- [ ] **Step 3: 實作** `store-form.js`、`app.js`、CSS
- [ ] **Step 4: 執行全部步驟，確認通過**，截圖存 `.superpowers/sdd/2026-10-16-critieat-store-edit/`；三頁 console 無非預期錯誤
- [ ] **Step 5: 人工看程式碼**：搜尋框 keydown 有 `isComposing || keyCode === 229` 判斷；沒有 `innerHTML`、`alert`、`confirm`
- [ ] **Step 6: 記錄** progress.md

### Task 5: 一次性補資料工具

**Files:**
- Create: `proto/v1/tools/backfill.html`（載入 `../js/config.js`、`csv.js`、`hours.js`、`geo.js`、`stores.js`、`data.js`、`store-edit.js`、`places.js`、`backfill.js`，`../css/style.css`）
- Create: `proto/v1/tools/backfill.js`

**Interfaces:**
- Consumes：`CE.places.load / searchText`、`CE.distanceMeters`、`CE.storeEdit.toCsv`、`CE.rowsToStores`

行為：
- 「開始查詢」按鈕（不自動查，避免重新整理就呼叫）→ 依序對每家 `searchText(店名, {lat,lng}, 200)`，一次一家
- 表格欄：勾選、我們的店名、Google 店名、Google 地址、距離（公尺，整數）、電話、七天營業時間（一格內換行）、狀態
- 標黃：距離 > 150、或兩邊店名互不包含（去空白後比對）、或查無結果；標黃與查無的預設不勾
- 「產生 CSV」：對勾選列把 `address`、`phone`、`placeId` 換成 Google 值，`hours` 在 Google 有值時才換；其他欄不動 → `CE.storeEdit.toCsv(all)` 放進 `<textarea readonly>`，旁邊「複製」按鈕（`navigator.clipboard.writeText`）
- `CE.places.load` 失敗：頁面顯示「Google 無法載入，請確認是在 http://localhost:8000 開啟」

- [ ] **Step 1: 實作**
- [ ] **Step 2: 檢查**：8010 開 `tools/backfill.html`，按開始 → 顯示無法載入文字、不丟例外；用 `drive-store.js` 注入假的 `CE.places.searchText`（一家回距離 300m 的結果、一家回 `null`、其他正常）→ 標黃與預設勾選正確；產生的 CSV 用 `CE.rowsToStores(CE.parseCsv(...))` 解回 10 家且未勾的列不變
- [ ] **Step 3: 記錄** progress.md

### Task 6: 使用者實測與寫回 `data.js`

需要使用者操作，控制者（不是子代理）負責。

- [ ] **Step 1:** 請使用者在自己的 8000 伺服器開 `http://localhost:8000/tools/backfill.html`，按開始，檢查標黃列，勾好後產生 CSV，把 CSV 貼回對話
- [ ] **Step 2:** 把 CSV 寫進 `data.js` 的 `CE.DEMO_STORES_CSV`（保留檔頭註解，更新「地址、電話、營業時間待補」那句），重跑 `check-store-edit.js` 的前兩個斷言（10 家、全部 `visible`），並確認每家 `parseHours` 沒有 `unknown`（有的話列給使用者看）
- [ ] **Step 3:** 請使用者在 `http://localhost:8000/index.html` 實測：新增一家真的店（Google 帶入）、編輯一家重新帶入、移除再新增、一家 Google 搜不到的店用小地圖點位置
- [ ] **Step 4:** 記錄 progress.md；更新 spec 狀態為「已實作」
