# CRITIEAT 店家新增／編輯（Google 帶入） 設計

日期：2026-10-16　狀態：設計已與使用者確認，待審核 spec

## 目的

目前店家資料只能改 `data.js`（之後是 Google Sheet），10 家店只有店名與座標，地址、電話、營業時間都是空的。
讓同事在美食地圖上直接新增、修改、移除店家，並用 Google Places 自動帶入地址、電話、營業時間，不用手打。
同時把現有 10 家一次補齊。

背景：使用者已在 Google Cloud 啟用 Places API (New)，並加入現有 Maps key 的 API 限制（2026-10-16）。
Key 仍只允許 `http://localhost:8000/*`，不可繞過。

## 決定事項（2026-10-16 與使用者確認）

| 項目 | 決定 |
|---|---|
| 誰能改 | 同事都能新增、修改、移除，不分權限 |
| 介面 | 燈箱（跟「看菜單」同一種），桌機兩欄排版（使用者從 A 右欄表單／B 燈箱 兩案中選 B） |
| 入口 | 清單上方「＋ 新增店家」；店家詳情「✏️ 編輯」。兩者開同一個燈箱 |
| Google 帶入 | 燈箱最上方搜尋框，打店名出候選，選中後帶入欄位，全部可再改；編輯既有店家時也能重新帶入（更新營業時間） |
| Google 搜不到 | 燈箱內有小地圖，點一下放圖釘當位置，其他欄位手填 |
| 移除 | 「從地圖移除」，先確認一次。不做「已移除的店家」清單或恢復按鈕，要再出現就重新新增（使用者 2026-10-16：「再加就好」） |
| 階段 | 原型（純前端、localStorage）；多人共用等第二階段 DB |
| 飲料 | 不在這次範圍，飲料地圖移到第二階段 |

## Claude 的決定（使用者已看過概要，未逐條確認）

- 移除＝把「顯示」設成「否」，不真的刪資料；過去的開團單、評分仍能顯示這家店的店名。
- 多存 `placeId`（Google Place ID）。新增時若選中的 Google 店家已在清單上，提示「這家已經有了」並提供「去看這家」，不建立重複；若那家先前被移除，新增時直接沿用原本的 ID 重新顯示並帶入新資料（避免同一個 placeId 兩筆）；沒有 placeId 的舊店重新新增會拿到新 ID。
- 燈箱顯示「最後修改：{成員}・{日期時間}」。儲存需要身分，沿用 `critieat.me`；還沒選過就在燈箱內當場選（跟評分區一樣）。
- 分類維持現有 7 種（飯、麵、便當、小吃、異國、輕食、其他），本版不能新增分類。
- 店名預設用 Google 的名稱，可改；分類 Google 不帶，一律手選。
- 所有頁面（美食地圖、開團單、公車地圖、轉盤）改讀同一份店家清單，新增的店各頁都看得到。
- 一次性補資料工具頁，補齊現有 10 家後寫回 `data.js`。
- `placeId` 視為唯一：編輯店家 A 時重新帶入，若選中的 Google 店家已屬於店家 B，同樣擋下並提示「這家已經有了」＋「去看這家」，不合併。
- 跨分頁：各頁載入時讀最新清單；已開著的其他分頁重新整理後才看到變更（原型不做跨分頁即時同步）。

## 資料

### Store 欄位（新增的部分）

在現有 Store（見 `js/stores.js`）上加：

| 欄位 | Sheet 表頭 | 說明 |
|---|---|---|
| `placeId` | `Google Place ID` | 可空 |
| `updatedBy` | `最後修改者` | 成員名，可空（`data.js` 原始資料沒有） |
| `updatedAt` | `最後修改時間` | ISO 字串，可空 |
| `visible` | `顯示`（已存在） | `rowsToStores` 目前直接濾掉 `否`；改成保留在資料裡並帶 `visible: false`，由使用端決定要不要顯示 |

`docs/sheet/stores-template.csv`、`HEADER_MAP` 同步加三欄，讓 Sheet 欄位與未來 DB 一致。

未來 DB：`stores` 表加 `place_id VARCHAR NULL UNIQUE`、`updated_by`、`updated_at`。

### 儲存方式：覆蓋層

- localStorage `critieat.stores.v1` = `{ stores: StoreRecord[] }`，只存「有被新增或修改過」的店的完整資料（一筆就是整家店，不是單一欄位差異）。
- 讀取時：`data.js` 的基本清單，再用覆蓋層同 ID 的整筆取代、ID 不存在的當新店加入。
- 這樣之後更新 `data.js`（例如補資料工具跑完），沒被同事改過的店會直接吃到新資料。
- 新店 ID：取基本清單＋覆蓋層中 `R` 開頭數字的最大值 +1，補零到 3 位（`R011`）。
- localStorage 讀不到或格式壞掉：當作沒有覆蓋層，照 `lunch-store.js` 的方式處理並在 console 警告。
- 「重置示範資料」：美食地圖目前沒有這顆按鈕。加在清單底部（樣式照開團單的 `list__reset`），清掉 `critieat.stores.v1`。

### 共用讀取

新增 `CE.storeRepo`（檔名建議 `js/store-repo.js`）：

- `all()` → 所有店（含已移除），給開團單歷史、評分等「用 ID 查店名」的地方。
- `visible()` → `visible !== false` 的店，給地圖、清單、轉盤、開團單新卡下拉、公車地圖。
- `get(id)`、`save(store, member)`（寫入覆蓋層並蓋上 `updatedBy`／`updatedAt`）、`remove(id, member)`、`findByPlaceId(placeId)`。
- 存檔後發 `ce:store-change` 事件，畫面重繪（同 `ce:menu-change` 的作法）。

`app.js`、`lunch-app.js`、`bus-app.js` 目前各自 `CE.rowsToStores(CE.parseCsv(CE.DEMO_STORES_CSV))`，全部改用 `storeRepo`。
開團單、轉盤目前用 `state.stores.find` 查店，要確認改成 `all()` 之後已移除店家的舊卡片仍顯示店名。

## Google 帶入

用 Maps JavaScript API 的 Places (New) 函式庫（`google.maps.importLibrary('places')`），同一把 key，純前端。

- **搜尋**：`AutocompleteSuggestion.fetchAutocompleteSuggestions`，帶 session token，偏好公司附近（有公司座標用公司，沒有就用現有店家的中心，半徑約 2 公里），語言 `zh-TW`、地區 `tw`。輸入停頓約 300ms 才查，少於 2 個字不查。
- **選中**：`place.fetchFields`，只要這些欄位：`id`、`displayName`、`formattedAddress`、`location`、`nationalPhoneNumber`、`regularOpeningHours`、`googleMapsURI`。用同一個 session token 收尾（Autocomplete 不另計費）。
- **只在使用者打字搜尋、選中候選時呼叫**，開頁面、看店家詳情都不呼叫。
- 帶入後欄位旁標「已從 Google 帶入」；使用者改過該欄就拿掉標記。
- 重新帶入（編輯既有店家）會覆蓋地址、座標、電話、營業時間、Google Maps 連結、placeId；店名、分類、外送連結、備註保留不動。
- Places 載入失敗或查詢出錯：搜尋框下顯示「Google 搜尋暫時無法使用，請手動填寫」，表單照常可用。

### 營業時間轉換

`regularOpeningHours.periods` → 週一～週日字串，格式與 Sheet 相同（`11:00-14:00, 17:00-20:30`）：

- 依 `open.day`（0 = 週日）歸到那一天，同一天多段用 `, ` 接起來，依開始時間排序。
- 跨午夜（`close.day` 是隔天）：寫成 `17:00-02:00`，`CE.parseHours` 已支援。
- 只有 `open` 沒有 `close`（24 小時營業）：七天都寫 `00:00-24:00`。
- 有 `regularOpeningHours` 但某天沒有任何時段 → `公休`。
- 完全沒有 `regularOpeningHours` → 七天都留空（不確定）。
- 轉換寫成純函式，放進可用 node 直接測的檔案。

## 畫面

### 燈箱（桌機 > 900px）

標題：新增時「新增店家」，編輯時「編輯店家　{店名}」；右上 ✕。內容由上到下：

1. **從 Google 帶入**：搜尋框＋下拉候選（每筆顯示店名、地址）；鍵盤上下選、Enter 選中、Esc 關下拉。注意 IME 組字中的 Enter 不算（`isComposing` 或 keyCode 229，評分區踩過的雷）。
2. **兩欄**
   - 左：店名（必填）、分類（7 顆按鈕，必選；新增時預設沒選）、地址、電話、foodpanda／Uber Eats／你訂連結、備註、小地圖。
   - 右：週一～週日營業時間 7 格。
3. **底部**：左「從地圖移除」（新增時不顯示）；中間小字「最後修改：…」；右「取消」「儲存」。

小地圖：

- 高約 200px，以目前座標（沒有就以公司或店家中心）為中心。
- 有座標時顯示圖釘，可拖曳微調；點地圖任一處把圖釘移過去。
- Google 帶入後圖釘跳到帶入的位置。
- 地圖無法載入時改顯示「地圖暫時無法使用，位置可之後再補」，可以沒有座標存檔（地圖上本來就有「地圖位置未設定」的處理）。

驗證（按儲存時，錯誤欄位下方顯示紅字，不關燈箱）：

- 店名不可空白；分類必選。
- 營業時間每格用 `CE.parseHours` 檢查，看不懂的格式顯示黃字「看不懂這個格式，會當成『不確定』」，**不擋存檔**（跟 Sheet 的「顯示警告」一致）。
- 連結欄只接受 `http(s)://` 開頭，其他顯示紅字。
- 尚未選身分：先在燈箱內選成員，選完才存。

儲存後：關燈箱，清單與地圖重繪，選中（打開詳情）這家店。
取消／✕／Esc：有改過欄位時先問「放棄修改？」。

### 移除

按「從地圖移除」→ 燈箱內確認「確定把 {店名} 從地圖移除？過去的開團單和評分會保留。」→ 確定後關燈箱、關詳情、清單與地圖重繪。

### 手機（≤ 900px）

燈箱全螢幕，兩欄改成一欄（營業時間排在左欄內容之後）。

## 一次性補資料工具

`proto/v1/tools/backfill.html`（使用者要在 `http://localhost:8000` 開，因為 key 只允許這個網址）：

- 對 `data.js` 每一家，用 `Place.searchByText`（店名＋店家座標附近約 200m 偏好）取第一筆，再 `fetchFields` 同上欄位。
- 表格列出：我們的店名、Google 店名、Google 地址、與我們座標的距離（公尺）、電話、營業時間。距離 > 150m 或名稱差很多的列標黃，讓人檢查。
- 每列有勾選框（預設勾選、標黃的不勾）。按「產生 CSV」輸出整份 `DEMO_STORES_CSV`，表頭用新版 `stores-template.csv` 的完整表頭（含 `Google Place ID`、`最後修改者`、`最後修改時間`，後兩欄留空）（只填勾選列的地址、電話、營業時間、placeId；店名、座標、分類、原本的短網址連結都不動）。
- 使用者把 CSV 貼回來，由 Claude 寫入 `data.js`。工具不寫檔。
- 10 家約 20 次呼叫，遠低於免費額度。

## 不在這次範圍

多人同步與衝突處理（第二階段 DB）、修改紀錄／復原、新增分類、店家照片、飲料店、權限、把 Places 呼叫搬到後端。

## 留給實作者

- 模組怎麼拆（例如 `store-form.js` 燈箱、`places.js` Google 帶入、`store-repo.js`），照現有 IIFE 寫法。
- Places 函式庫怎麼載入：目前 `map.js` 用 `callback=__ceMapInit` 的舊式載入，可改成 `loading=async` 加 `importLibrary`，或另外載入。燈箱的小地圖用同一份 Maps。
- 燈箱樣式沿用 `menu-lightbox.js` 的外框與 Critical 官網風格。
- 驗證照團隊慣例：純邏輯（營業時間轉換、ID 產生、覆蓋層合併）用 scratchpad 的 node 腳本驗證，畫面用瀏覽器驗證；不加測試框架。
