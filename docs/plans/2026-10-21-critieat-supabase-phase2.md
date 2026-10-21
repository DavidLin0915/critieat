# CRITIEAT 正式上線第二階段（開團單＋評分共用）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 開團單、店家評分、品項評分在 `https://critieat.github.io/` 上由 Supabase 共用；開團單頁別人的變動幾秒內自動出現。

**Architecture:** 沿用第一階段：`proto/v1` 純靜態、IIFE 掛 `globalThis.CE`、`CE.supa` REST 客戶端、live 模式「啟動時載入記憶體、讀取同步、寫入非同步」、demo 模式完全不動。開團單保留 `lunch.js` 的「舊 cards → 新 cards」純邏輯；新增 `lunch-sync.js` 把資料庫列轉成 Card、並把「操作前後的 cards」算成逐筆寫入（diff），所以每個動作只寫它碰到的列。即時更新用 Supabase Realtime（官方 supabase-js 只用來訂閱；收到變動就重新抓一次開團單），連不上時退回 10 秒輪詢。

**Tech Stack:** HTML5、CSS、原生 JavaScript（ES2020）、Supabase（Postgres＋RLS＋Realtime，免費方案）、`@supabase/supabase-js` v2 UMD（jsDelivr CDN，固定版本，只用 Realtime）、GitHub Pages；檢查用 node 18（`vm`）＋ headless Chrome（CDP）。

**Spec:** `docs/specs/2026-10-21-critieat-supabase-phase2-design.md`（功能與畫面以原型 spec 為準：`2026-10-14-critieat-lunch-card-design.md`、`2026-10-15-critieat-store-rating-design.md`、`2026-10-16-critieat-item-rating-design.md`）

## Global Constraints

- live 模式所有寫入（開團單三張表、兩張評分表）都要通關碼，透過現有 `CE.supa` 的 `x-team-code` 重試機制；讀取不帶通關碼
- 允許刪除的表：`lunch_cards`、`lunch_votes`、`lunch_items`、`store_ratings`、`item_ratings`（要通關碼）；`stores`、`menus` 仍不開放刪除
- demo 模式（`?demo=1`）行為與現在完全相同、**不發出任何 Supabase 請求、不建立 Realtime 連線**
- 正式版不出現示範卡片、示範評分、「重置示範資料」；選身分只列 `members` 表的名字，沒有「新增名字」
- 開團單頁別人的變動目標 5 秒內出現；分頁切到背景時不必更新，切回前景立刻抓一次
- 遠端更新不得清掉：「我的餐點」還沒送出的內容（含輸入游標所在的欄位）、開著的對話框、評分表單的草稿
- 權限（誰能收單、只能改自己的列…）只在前端由 `CE.lunch.can` 判斷；資料庫只檢查通關碼
- 每個動作送出前先重新抓最新開團單，用最新資料跑 `CE.lunch` 的操作，再把差異逐筆寫入；不整張卡或整份資料覆蓋
- 固定文字：
  - 開團單讀取失敗「開團單讀取失敗，請檢查網路後重新整理」
  - 評分讀取失敗「評分讀取失敗，請檢查網路後重新整理」
  - 寫入失敗「儲存失敗，請檢查網路後再試一次」（與第一階段相同）
  - 選中的卡片被別人取消「這團已經被取消了」
  - 選身分說明（live）「選自己的名字。只存在這台電腦的瀏覽器。」
- 所有資料以 `textContent` 寫入 DOM；不用 `alert`／`confirm`／`prompt`
- supabase-js 用 jsDelivr 的固定版本 UMD：`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@<版本>/dist/umd/supabase.js`，版本為發布超過兩週的 2.x（Task 3 用 `npm view` 確認）；**不得引入 npm 套件、build 或測試框架**
- 邏輯用 scratchpad 的 node `vm` 腳本驗，畫面用 headless Chrome；每個 Task 結束 commit 並在 `.superpowers/sdd/2026-10-21-critieat-supabase-phase2/progress.md` 記一行
- Supabase 網址與 publishable key 沿用 `js/config.js`；secret key 不得出現在任何檔案；使用者的通關碼不得寫進任何檔案（檢查時用環境變數 `CODE`）

## Review Focus

1. **我正在打餐點時別人送出了餐點** → 我的輸入框、游標、打到一半的字都還在；離開輸入框後卡片才更新成最新。Task 4 `RF1`
2. **兩人幾乎同時對同一團操作**（同時 +1、同時送出餐點）→ 兩人的 +1、餐點都在，誰也沒蓋掉誰。Task 2 `RF2`（diff 只產生自己的列）、Task 6 `RF2`（真資料庫）
3. **刪掉一筆已經不存在的列**（別人剛取消這團，我再取消／刪列）→ 不跳通關碼輸入框、不顯示成功；顯示「這團已經被取消了」。Task 1 `RF3`、Task 4 `RF3`
4. **Realtime 連不上**（CDN 被擋、WebSocket 失敗）→ 頁面照常可用，退回 10 秒輪詢，別人的變動最晚約 10 秒出現。Task 3 `RF4`
5. **評分存檔失敗**（網路斷）→ 表單內容保留、顯示「儲存失敗，請檢查網路後再試一次」，平均分數不變。Task 5 `RF5`

---

## 檔案結構

| 檔案 | 動作 | 負責 |
|---|---|---|
| `supabase/003_phase2.sql` | 新增 | 開團單三張表、評分兩張表、RLS（讀開放、寫要通關碼、可刪）、加入 Realtime publication |
| `supabase/README.md` | 修改 | 步驟 ⑦ 執行 003；改寫「刪除一直都不開放」；備份清單加新表 |
| `proto/v1/js/supa.js` | 修改 | 新增 `del()`；空結果時用 `check_team_code` 分辨「被擋」與「本來就沒有這列」 |
| `proto/v1/js/lunch.js` | 修改 | `newId` 加隨機尾碼（多台電腦不撞號） |
| `proto/v1/js/lunch-sync.js` | 新增 | `CE.lunchSync`：資料庫列 → Card、Card 前後差異 → 寫入操作 |
| `proto/v1/js/live-sync.js` | 新增 | `CE.liveSync.watch()`：Realtime 訂閱＋輪詢備援＋回前景補抓 |
| `proto/v1/js/lunch-store.js` | 修改 | live 分支：`ready`／`refresh`／`apply`；`peekCards`、`peekMembers`、`getMe` 在 live 走共用資料 |
| `proto/v1/js/lunch-app.js` | 修改 | live 啟動、非同步動作、遠端更新不打斷輸入、live 選身分 |
| `proto/v1/js/rating-store.js` | 修改 | live 分支：`ready`、`save(db, change)` 改回傳 Promise |
| `proto/v1/js/rating-form.js` | 修改 | 非同步存檔、live 名單用 `CE.memberRepo` |
| `proto/v1/js/nav.js`、`app.js`、`menu-lightbox.js` | 修改 | 拿掉第一階段的 live 隱藏（開團單連結、評分、大家推、轉盤） |
| `proto/v1/lunch.html`、`proto/v1/index.html` | 修改 | 載入新檔（`passcode.js`、`lunch-sync.js`、`live-sync.js`、supabase-js、`rating-ui` 相關） |

檢查工具（不屬於專案）：
- `<scratchpad>/p2/`：`check-supa2.js`、`check-sync.js`、`check-lunch-store.js`、`check-rating-live.js`（`vm` 載入專案檔，假 `fetch`／假 Realtime）、`check-real2.js`（打真的 Supabase，需要 `CODE`）
- `.superpowers/sdd/2026-10-21-critieat-supabase-phase2/`：`drive-live.js` 由第一階段同名檔複製，改成 `PORT` 可用環境變數覆蓋（預設 9351）；`stub-supa.js` 由第一階段複製並擴充（見 Task 4）；`steps-*.sh`、截圖、`progress.md`

`<scratchpad>` = `/private/tmp/claude-501/-Users-critical-Documents-critieat/57d16dfe-5c43-4b84-b63c-e8acd8f43d2b/scratchpad`

檢查用伺服器：在 `proto/v1` 內 `python3 -m http.server 8010 --bind 127.0.0.1`（Google 地圖在 8010 報 Referer 錯誤屬預期）。

---

### Task 1: 資料表與 REST 刪除

**Files:**
- Create: `supabase/003_phase2.sql`
- Modify: `supabase/README.md`、`proto/v1/js/supa.js`
- Create: `.superpowers/sdd/2026-10-21-critieat-supabase-phase2/progress.md`
- Test: `<scratchpad>/p2/check-supa2.js`

**Interfaces:**
- Produces（資料表，Task 2–6 依此命名）：
  - `lunch_cards`：`id text pk`、`date date`、`store_id text references stores(id)`、`store_name text`、`status text check in ('proposed','ordering','closed')`、`proposer text`、`owner text default ''`、`note text default ''`、`close_at text`、`pickup_at text`、`payer text default ''`、`created_at timestamptz`、`closed_at timestamptz null`、`changed_after_close boolean default false`
  - `lunch_votes`：`card_id text references lunch_cards(id) on delete cascade`、`member text`、`created_at timestamptz default now()`、`primary key (card_id, member)`
  - `lunch_items`：`id text pk`、`card_id text references lunch_cards(id) on delete cascade`、`member text`、`name text check (name <> '')`、`price int null check (price >= 0)`、`note text default ''`、`menu_item_id text null`、`created_at timestamptz`、`updated_at timestamptz`、`after_close boolean default false`
  - `store_ratings`：`store_id text references stores(id)`、`member text`、`stars numeric(2,1) check (stars between 0.5 and 5 and stars * 2 = floor(stars * 2))`、`comment text default '' check (char_length(comment) <= 50)`、`updated_at timestamptz`、`primary key (store_id, member)`
  - `item_ratings`：`item_id text`、`member text`、`store_id text references stores(id)`、`item_name text`、`item_note text default ''`、`stars`／`comment`／`updated_at` 同上、`primary key (item_id, member)`
- Produces（`CE.supa`）：
  - `del(table: string, match: { [col]: string }) → Promise<Row[]>`：`DELETE …?col=eq.val&…`，`Prefer: return=representation`，走 `write()` 重試
  - `update(table, id, patch)` 不變
  - `write()` 的「空結果」判斷改為：結果是空陣列時呼叫 `rpc('check_team_code', { c: 目前的碼 })`；回 `true` → 直接回傳空陣列（不是被擋，是列不存在）；回 `false` → 照舊清碼、問通關碼、重送

- [ ] **Step 1: 寫 `003_phase2.sql`**

照 `002_passcode.sql` 的寫法：`create table if not exists`；`enable row level security`；`revoke all … from anon, authenticated`；`grant select, insert, update, delete` 五張表給 `anon, authenticated`；policy `select using (true)`，`insert`／`update`／`delete` 都用 `check_team_code(request_team_code())`（`drop policy if exists` 後重建）。檔案最後：

```sql
-- Realtime：開團單三張表的變動推給網頁（已加過會報錯，所以先檢查）
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'lunch_cards') then
    alter publication supabase_realtime add table lunch_cards, lunch_votes, lunch_items;
  end if;
end $$;
```

檔頭註解說明：需先跑過 001、002；可重複執行；不會動到通關碼。

- [ ] **Step 2: 改 README**：新增「⑦ 第二階段資料表」（執行 003）；⑥ 最後一句改成「看資料不需要通關碼；新增／修改／刪除開團單與評分、修改店家與菜單、上傳照片才需要。店家與菜單不能刪除。」；④ 備份清單加 `lunch_cards`、`lunch_votes`、`lunch_items`、`store_ratings`、`item_ratings`。

- [ ] **Step 3: 寫 `check-supa2.js`（先失敗）**

`vm` 載入 `config.js`、`mode.js`（假 `location.search=''`）、`supa.js`，`CE.supaFetch` 為記錄請求的假 fetch。案例：
- `D1` `del('lunch_votes', { card_id: 'c1', member: '雯雯' })` 送出 `DELETE`，網址含 `card_id=eq.c1&member=eq.%E9%9B%AF%E9%9B%AF`，header 有 `x-team-code`
- `RF3` DELETE 回 `200 []`，`check_team_code` 回 `true` → 回傳 `[]`，`CE.askPasscode` 沒被呼叫
- `D3` DELETE 回 `200 []`，`check_team_code` 回 `false` → 呼叫 `CE.askPasscode`，拿到新碼後重送一次
- `D4` PATCH 回 `200 []`、碼有效 → 回傳 `[]` 不問通關碼（取代第一階段「空就當被擋」）
- `D5` DELETE 回 `403 42501` → 照舊問通關碼

Run: `node <scratchpad>/p2/check-supa2.js` → Expected: `D1` FAIL（`del is not a function`）

- [ ] **Step 4: 實作 `del()` 與新的空結果判斷**

- [ ] **Step 5: 跑 `check-supa2.js` → `ALL PASS`；第一階段的 supa 行為沒變（`steps-passcode.sh` 第一階段版本照跑：`bash .superpowers/sdd/2026-10-20-critieat-supabase-phase1/steps-passcode.sh | grep -v "^=="` 無輸出）**

- [ ] **Step 6: 請使用者在 SQL Editor 執行 `003_phase2.sql`**，確認 `Success`；用瀏覽器或 curl 讀 `…/rest/v1/lunch_cards?select=*,lunch_votes(*),lunch_items(*)` 回 `[]`（不是 404／PGRST200）

- [ ] **Step 7: Commit** `feat: phase 2 tables and REST delete`

---

### Task 2: 開團單資料轉換與差異

**Files:**
- Create: `proto/v1/js/lunch-sync.js`
- Modify: `proto/v1/js/lunch.js`（`newId`）
- Test: `<scratchpad>/p2/check-sync.js`

**Interfaces:**
- Consumes: Task 1 的資料表欄位
- Produces（`CE.lunchSync`，純函式、不碰網路）：
  - `SELECT: string` = `'select=*,lunch_votes(member,created_at),lunch_items(*)&order=created_at'`
  - `fromRows(rows: CardRow[]) → Card[]`：Card 形狀與 `lunch.js` 相同（`isValidDb({ members: [], cards })` 為 true）；`voters` 依 `created_at` 排序；`items` 依 `created_at`、再依 `id` 排序；`menu_item_id` 為 null 時不放 `menuItemId`；`closed_at` null → `''`；`createdAt`／`updatedAt`／`closedAt` 一律轉成 `new Date(x).toISOString()`；`price` 照原值（null 或整數）
  - `diff(before: Card[], after: Card[]) → Op[]`；`Op = { kind: 'insert' | 'update' | 'delete', table, row?, patch?, match }`
    - 新卡片：`insert lunch_cards` 整列，接著每個 voter `insert lunch_votes`（`created_at` = 卡片 `createdAt`），每個 item `insert lunch_items`
    - 消失的卡片：只一筆 `delete lunch_cards { id }`（votes／items 由 cascade 處理，不另外產生）
    - 同一張卡片：欄位有變的才放進 `update lunch_cards` 的 `patch`（snake_case）；voters 多的 `insert`、少的 `delete { card_id, member }`；items 依 `id` 比對：新增 `insert`（`created_at` = 該列 `updatedAt`）、內容變了 `update`（只放變了的欄位）、消失 `delete { id }`
    - 順序：卡片 insert → votes／items insert → 卡片 update → items update → votes／items delete → 卡片 delete
  - `newId(prefix, now)`：原本格式後面加 4 碼 `[0-9a-z]` 隨機尾碼

- [ ] **Step 1: 寫 `check-sync.js`（先失敗）**

`vm` 載入 `hours.js`、`lunch.js`、`lunch-sync.js`。用 `CE.lunch` 的操作產生 before／after：
- `S1` `createCard`（open）→ ops 依序為 `insert lunch_cards`、`insert lunch_votes`（1 筆）；card row 的 `closed_at` 為 null、`changed_after_close` false
- `S2` `toggleVote` 加入 → 只有 1 筆 `insert lunch_votes`；再取消 → 只有 1 筆 `delete lunch_votes { card_id, member }`
- `RF2` 卡片已有小華 2 列，小明 `setItems` 新增 1 列 → ops 只有 1 筆 `insert lunch_items`，沒有任何碰到小華列的 op
- `S4` 已收單時小明改自己 1 列的價格 → `update lunch_items`（patch 只有 `price`、`updated_at`、`after_close: true`）＋ `update lunch_cards { changed_after_close: true }`
- `S5` 刪自己 1 列 → `delete lunch_items { id }`
- `S6` `close` → 一筆 `update lunch_cards`，patch 只有 `status`、`closed_at`
- `S7` `cancel` → 只有一筆 `delete lunch_cards`
- `S8` `fromRows(由 S1–S6 的 ops 套用出來的假資料列)` 等於 after（`JSON.stringify` 比對），且 `CE.lunch.isValidDb` 為 true
- `S9` `menuItemId` 從有變成沒有 → patch 含 `menu_item_id: null`
- `S10` 連續 2000 次 `newId('c', 同一個 now)` 不重複，且符合 `/^c[0-9a-z]+$/`

Run: `node <scratchpad>/p2/check-sync.js` → Expected: FAIL（`CE.lunchSync` undefined）

- [ ] **Step 2: 實作 `lunch-sync.js` 與 `newId` 尾碼**

- [ ] **Step 3: 跑 `check-sync.js` → `ALL PASS`**

- [ ] **Step 4: Commit** `feat: lunch card row mapping and diff`

---

### Task 3: 開團單 live 存取與即時訂閱

**Files:**
- Create: `proto/v1/js/live-sync.js`
- Modify: `proto/v1/js/lunch-store.js`
- Test: `<scratchpad>/p2/check-lunch-store.js`

**Interfaces:**
- Consumes: `CE.supa.select/insert/update/del`（Task 1）、`CE.lunchSync.SELECT/fromRows/diff`（Task 2）、`CE.memberRepo.list()`
- Produces（`CE.lunchStore`，demo 行為全部不變）：
  - `ready() → Promise<boolean>`：live 抓全部卡片放記憶體；demo 回 true
  - `refresh() → Promise<boolean>`：live 重新抓；失敗回 false、記憶體保留舊資料
  - `cards() → Card[]`：live 記憶體中的卡片（複本）
  - `apply(ops: Op[]) → Promise<void>`：依序送出（`insert` → `CE.supa.insert`、`update` → `CE.supa.update(table, {col:'id',val}, patch)`、`delete` → `CE.supa.del(table, match)`）；任一筆失敗就 throw（後面不送）
  - `loadFailed() → boolean`
  - `peekCards()`：live 回 `cards()`；`peekMembers()`：live 回 `CE.memberRepo.list()`；`getMe()`：live 只在名字屬於 `CE.memberRepo.list()` 時回傳，否則 `''`
- Produces（`CE.liveSync`）：
  - `watch({ tables: string[], onChange: () => void }) → { stop() }`
  - 建 client：`CE.supaRealtime` 有設就用它（測試接縫），否則 `globalThis.supabase.createClient(url, key)`；一個 channel，每張表一個 `postgres_changes`（`event: '*'`, `schema: 'public'`）
  - 收到事件 → 300ms 內合併成一次 `onChange()`
  - 訂閱狀態 `SUBSCRIBED` → 停止輪詢；如果之前斷過就 `onChange()` 補抓
  - `CHANNEL_ERROR`／`TIMED_OUT`／`CLOSED`，或沒有 `supabase` 全域 → 每 10 秒 `onChange()`
  - `visibilitychange` 回到 `visible` → `onChange()`；`hidden` 時輪詢暫停
  - demo 模式呼叫 `watch` 直接回 `{ stop(){} }`，不建 client

- [ ] **Step 1: 確認 supabase-js 版本**：`npm view @supabase/supabase-js time --json` 選發布超過兩週的最新 2.x，`curl -sI https://cdn.jsdelivr.net/npm/@supabase/supabase-js@<版本>/dist/umd/supabase.js` 回 200；版本寫進 progress.md（Task 4 載入用）

- [ ] **Step 2: 寫 `check-lunch-store.js`（先失敗）**

`vm` 載入 `config.js`、`mode.js`、`supa.js`、`member-repo.js`、`hours.js`、`lunch.js`、`lunch-demo.js`、`lunch-sync.js`、`lunch-store.js`、`live-sync.js`；假 fetch 回固定資料列；假 `document`（可觸發 `visibilitychange`）；假計時器。
- `T1` live `ready()` 打一次 `GET lunch_cards?select=*,lunch_votes(...` ，`cards()` 為 `fromRows` 結果
- `T2` `apply([insert, update, delete])` 依序打 `POST`、`PATCH`、`DELETE`；第二筆失敗時 throw 且第三筆沒送
- `T3` `ready()` 網路失敗 → false、`loadFailed()` true、`peekCards()` 為 `[]`
- `T4` `getMe()`：localStorage 是 `小明`（不在名單）→ `''`；是 `Mike` → `'Mike'`
- `T5` 假 Realtime：連續 3 個事件 → 300ms 後 `onChange` 只呼叫 1 次
- `RF4` 沒有 `supabase` 全域且沒有 `CE.supaRealtime` → 每 10 秒呼叫一次 `onChange`；`hidden` 時不呼叫，回 `visible` 立刻呼叫 1 次
- `T7` 假 Realtime 先回 `CHANNEL_ERROR`（開始輪詢），再回 `SUBSCRIBED` → 輪詢停止、`onChange` 補抓 1 次
- `T8` demo 模式（`location.search='?demo=1'`）：`ready`、`watch` 都不發出任何 fetch、不建 client；`load()` 照舊回示範資料

Run: `node <scratchpad>/p2/check-lunch-store.js` → Expected: FAIL

- [ ] **Step 3: 實作 `lunch-store.js` live 分支與 `live-sync.js`**

- [ ] **Step 4: 跑 `check-lunch-store.js` → `ALL PASS`**

- [ ] **Step 5: Commit** `feat: shared lunch store with realtime watch`

---

### Task 4: 開團單頁上正式版

**Files:**
- Modify: `proto/v1/js/lunch-app.js`、`proto/v1/lunch.html`、`proto/v1/js/nav.js`
- Create: `.superpowers/sdd/2026-10-21-critieat-supabase-phase2/drive-live.js`、`stub-supa.js`、`steps-lunch.sh`
- Test: `steps-lunch.sh`、第一階段 `steps-mode.sh` 的 demo 段落

**Interfaces:**
- Consumes: Task 3 的 `CE.lunchStore`、`CE.liveSync`；`CE.memberRepo.ready/list`；`CE.storeRepo.ready`；`CE.menuData.ready`；`CE.itemRatingStore.ready`（Task 5 才加；Task 4 先用 `if (CE.itemRatingStore.ready)` 判斷）
- Produces: live 的 `lunch.html` 可用；`stub-supa.js` 支援 Task 5 也會用到的表

- [ ] **Step 1: 準備檢查工具**
  - `drive-live.js`：複製第一階段，`const PORT = +(process.env.PORT || 9351)`
  - `stub-supa.js`：複製第一階段並擴充：表 `lunch_cards`／`lunch_votes`／`lunch_items`／`store_ratings`／`item_ratings` 存在 `__stub_db`；`GET` 支援 `eq.` 篩選與 `lunch_cards` 的嵌入（依 `card_id` 掛上 `lunch_votes`、`lunch_items`）；`POST` 支援 `on_conflict` upsert；`PATCH`／`DELETE` 支援多個 `eq.` 篩選、回傳受影響的列；刪 `lunch_cards` 時一併刪子列；`check_team_code` 照舊；`CE.supaRealtime` 設為假 client，`CE.__emit()` 觸發所有已訂閱的 callback；`CE.__stubWrite(table, row)` 直接改假資料（模擬別人）

- [ ] **Step 2: 寫 `steps-lunch.sh`（先失敗）**，live 頁 `http://127.0.0.1:8010/lunch.html` + `prestub:supa`，`localStorage['critieat.me.v2']='David'`：
  - `L1` 頁面不再跳回 `index.html`；導覽列有「開團單」；沒有 `.demo-badge`、沒有「重置示範資料」
  - `L2` 選身分對話框只列 8 位同事、沒有「新增名字」輸入框，說明文字為「選自己的名字。只存在這台電腦的瀏覽器。」
  - `L3` 直接開單 → 假後端多 1 筆 `lunch_cards`、1 筆 `lunch_votes`；畫面出現卡片
  - `L4` 送出 2 項餐點 → 假後端 `lunch_items` 2 筆；提示「已送出」
  - `RF1` 在「我的餐點」品名欄 focus 並打「雞腿」→ `__stubWrite` 加一筆 Mike 的點餐列 → `__emit()` → 等 500ms：品名欄仍是 focus、值為「雞腿」；左欄人數已更新；`blur` 後中欄出現 Mike 的列，草稿「雞腿」還在
  - `L6` `__stubWrite` 加一張新卡（別人開的）→ `__emit()` → 500ms 內左欄出現
  - `RF3` 選中一張卡 → 假後端刪掉它 → 按「取消這團」確認 → 提示「這團已經被取消了」，沒有開通關碼對話框，選中改成第一張
  - `L8` 假後端 `failWrite` → 送出餐點 → 提示「儲存失敗，請檢查網路後再試一次」，編輯區內容還在
  - `L9` 假後端 `failSelect` → 提示「開團單讀取失敗，請檢查網路後重新整理」，不出現示範卡片
  - `L10` 收單後改自己的列 → 假後端該列 `after_close` true、卡片 `changed_after_close` true；右欄出現「收單後有修改」
  - `D1` `lunch.html?demo=1` 一整輪（開單、點餐、收單、重置示範資料）`CE.__supaLog.length===0`，且沒有建立假 Realtime client

Run: `bash .superpowers/sdd/2026-10-21-critieat-supabase-phase2/steps-lunch.sh` → Expected: 多數 `val` 不是 true

- [ ] **Step 3: 改 `lunch.html`、`nav.js`**
  - `lunch.html` 在 `supa.js` 後加 `passcode.js`；在 `lunch-store.js` 前加 `lunch-sync.js`；`lunch-store.js` 後加 supabase-js UMD（Task 3 選定的版本）與 `live-sync.js`
  - `nav.js` 拿掉 live 移除「開團單」連結那段

- [ ] **Step 4: 改 `lunch-app.js`**
  - `init` 拿掉「正式版跳回 index」；live 時先顯示讀取中，`await Promise.all([CE.storeRepo.ready(), CE.memberRepo.ready(), CE.menuData.ready(), CE.lunchStore.ready(), CE.itemRatingStore.ready?.()])`，`state.db = { members: CE.lunchStore.peekMembers(), cards: CE.lunchStore.cards() }`；失敗時 `warn('開團單讀取失敗，請檢查網路後重新整理')`；然後 `CE.liveSync.watch({ tables: ['lunch_cards','lunch_votes','lunch_items'], onChange: onRemote })`
  - `act(fn, onOk)`：demo 走原本的同步流程；live 改 `async`：`await CE.lunchStore.refresh()` → 用最新 cards 跑 `fn`（丟錯就 `notice(e.message)` 並 render）→ `ops = CE.lunchSync.diff(fresh, next)` → `await CE.lunchStore.apply(ops)` → `await CE.lunchStore.refresh()` → 更新 `state.db.cards`、`onOk()`、render。`apply` 失敗：`notice('儲存失敗，請檢查網路後再試一次')`、refresh、render，**不**呼叫 `onOk`（草稿保留）。動作進行中按鈕不能重按（`state.busy`）
  - 選中的卡片在 refresh 後不見了（不管是自己動作前的 refresh 或遠端更新）→ `selectFirst()`、`notice('這團已經被取消了')`；自己剛取消的除外
  - `onRemote()`：`await CE.lunchStore.refresh()`，更新 `state.db.cards`；若焦點在 `#card-view` 內的 `input, textarea, select`，只重畫 `renderHeader`、`renderList`、`renderSide` 並設 `state.cardStale = true`；否則 `render()`。`#card-view` 的 `focusout` 時若新焦點不在 `#card-view` 且 `cardStale` → `renderCard()`
  - live 的 `openMe`：名單用 `CE.lunchStore.peekMembers()`，不顯示新增名字列，說明文字照 Global Constraints；`addMember` 在 live 不做事
  - live 不顯示「重置示範資料」

- [ ] **Step 5: 跑 `steps-lunch.sh` → 無輸出（全部 true）；第一階段 `steps-mode.sh` 的 `D2` 仍 true（`L2` 已改變預期，不再檢查）**

- [ ] **Step 6: Commit** `feat: shared lunch cards with live updates`

---

### Task 5: 評分共用，正式版打開所有入口

**Files:**
- Modify: `proto/v1/js/rating-store.js`、`rating-form.js`、`app.js`、`menu-lightbox.js`、`proto/v1/index.html`
- Test: `<scratchpad>/p2/check-rating-live.js`、`.superpowers/sdd/2026-10-21-critieat-supabase-phase2/steps-rating.sh`

**Interfaces:**
- Consumes: `CE.supa.select/upsert/del`、`CE.memberRepo`、`CE.lunchStore.ready/peekCards`（Task 3）
- Produces:
  - `makeStore` 多參數 `{ table, conflict, fromRow, toRow }`；店家評分 `table: 'store_ratings'`、`conflict: 'store_id,member'`；品項評分 `table: 'item_ratings'`、`conflict: 'item_id,member'`
  - `store.ready() → Promise<boolean>`：live 抓整表放記憶體；demo 回 true
  - `store.load(now)`：live 回 `{ db: 記憶體, warning: 失敗時 '評分讀取失敗，請檢查網路後重新整理' 否則 null }`；demo 不變
  - `store.save(db, change) → Promise<boolean>`；`change = { type: 'upsert', rating } | { type: 'remove', id, member }`；demo 忽略 `change` 寫整份 db；live 依 `change` 打 `upsert`／`del`，成功才更新記憶體
  - `rating-form.js`：`commitDb(db, change, rebuild, onChange)` 改 async；存檔中送出／刪除按鈕 disabled；失敗 `state.error = '儲存失敗，請檢查網路後再試一次'`、表單內容保留；`who()` 的名單改用 `CE.lunchStore.peekMembers()`（live 已是 `memberRepo`），`getMe` 同理
  - 正式版打開：`app.js` 清單平均分數、店家詳情評分區、`init` 改為 `await` 店家評分與品項評分 `ready()` 後再 `CE.ratingUi.init`；轉盤 `cards: CE.lunchStore.peekCards()`、`source: 'map'`（`ready()` 加進現有的 `Promise.all`，失敗不擋地圖）；`menu-lightbox.js` 拿掉三處 `!CE.isDemo()` 的評分隱藏（品項列可展開、大家推、評分欄）
  - `index.html` 在 `lunch-store.js` 前加 `lunch-sync.js`

- [ ] **Step 1: 寫 `check-rating-live.js`（先失敗）**：`vm` 載入 `config.js`、`mode.js`、`supa.js`、`rating.js`、`rating-demo.js`、`item-rating-demo.js`、`rating-store.js`，假 fetch：
  - `R1` 店家評分 live `ready()` 打 `GET store_ratings`，`load().db.ratings` 為 camelCase Rating（`storeId`、`updatedAt`），`isValidDb` true
  - `R2` `save(db, { type: 'upsert', rating })` 打 `POST store_ratings?on_conflict=store_id,member`，body 為 snake_case；回傳 true 後 `load().db` 含新評分
  - `R3` `save(db, { type: 'remove', id: 'R001', member: 'Mike' })` 打 `DELETE store_ratings?store_id=eq.R001&member=eq.Mike`
  - `RF5` 網路失敗 → `save` 回 false，`load().db` 不變
  - `R5` 品項評分的 row 含 `item_id`、`store_id`、`item_name`、`item_note`
  - `R6` demo：`save` 寫 localStorage、不發 fetch

- [ ] **Step 2: 寫 `steps-rating.sh`（先失敗）**，live `index.html` + `prestub:supa`（假後端預先有一家店 R001 與一份菜單）：
  - `G1` 店家詳情有評分區；選 4 星、留言、送出 → 假後端 `store_ratings` 1 筆、清單 meta 出現 `★ 4.0 (1)`
  - `G2` 同一人改成 3.5 星 → 仍 1 筆、`stars` 3.5
  - `G3` 「刪除我的評分」兩段確認 → 假後端 0 筆
  - `RF5` `failWrite` → 送出 → 錯誤訊息「儲存失敗，請檢查網路後再試一次」，星數與留言還在
  - `G5` 菜單燈箱品項列可展開、評分後「大家推」在 ≥4.0 時出現
  - `G6` 轉盤勾「排除近 3 天」：假後端有今天 R001 的卡片 → R001 被排除；結果按鈕有「用這家開單」
  - `G7` `index.html?demo=1` 評分、轉盤流程 `CE.__supaLog.length===0`

- [ ] **Step 3: 實作 rating-store live、rating-form async、app.js／menu-lightbox 打開、index.html script**

- [ ] **Step 4: 跑 `check-rating-live.js` → `ALL PASS`；`steps-rating.sh`、`steps-lunch.sh` 無輸出；已收單卡片的品項評分（`steps-lunch.sh` 加 `L11`：已收單卡片自己的列按評分 → 假後端 `item_ratings` 1 筆）**

- [ ] **Step 5: Commit** `feat: shared store and item ratings`

---

### Task 6: 真資料庫驗收與上線

**Files:**
- Create: `<scratchpad>/p2/check-real2.js`
- Modify: `docs/specs/2026-10-21-critieat-supabase-phase2-design.md`（狀態）、`progress.md`

**Interfaces:**
- Consumes: 全部前面 Task；使用者提供的通關碼（`CODE=… node check-real2.js`，不寫進檔案）

- [ ] **Step 1: 寫 `check-real2.js`**：直接打真的 Supabase REST（帶 `CODE`）與一個 headless Chrome 頁面（`drive-live.js`，`http://127.0.0.1:8010/lunch.html`，`critieat.me.v2=David`）：
  - `X1` 沒帶通關碼 insert `lunch_cards` → 被拒；讀取成功
  - `X2` 帶通關碼 insert 一張 `date='2000-01-01'` 的測試卡（店家用現有第一家）→ 頁面在 5 秒內 `CE.lunchStore.cards()` 含此卡（Realtime 實測）
  - `RF2` 兩個並行請求同時 insert 兩人的 `lunch_votes` 與 `lunch_items` → 重新讀取兩人都在
  - `X4` 刪除測試卡 → 子列跟著消失；再刪一次回 `[]`
  - `X5` `store_ratings` upsert 兩次同人同店 → 1 列；刪除後 0 列
  - 結束時一定刪掉測試卡與測試評分（`finally`）

- [ ] **Step 2: 跑 `CODE=<使用者提供> node <scratchpad>/p2/check-real2.js` → `ALL PASS`**，並確認真資料庫沒有殘留測試列

- [ ] **Step 3: push 到 GitHub，等 Pages 部署完成**；headless 開 `https://critieat.github.io/lunch.html`：live 模式、導覽有開團單、選身分 8 人、沒有示範卡片、console 無錯誤；`https://critieat.github.io/`：店家詳情有評分區

- [ ] **Step 4: 請使用者用兩台電腦（或兩個瀏覽器）照 spec「驗收」第一段實測**

- [ ] **Step 5: spec 狀態改為「已實作並上線（日期）」，progress.md 記完成；Commit** `docs: phase 2 implemented`
