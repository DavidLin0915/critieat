# CRITIEAT 正式上線第一階段（GitHub Pages ＋ Supabase）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同事用 `https://davidlin0915.github.io/critieat/` 共用美食地圖、公車地圖、店家與菜單；資料存在 Supabase；`?demo=1` 保留完整示範 proto。

**Architecture:** 沿用 `proto/v1`（純靜態 HTML + 原生 JS、IIFE 掛 `globalThis.CE`、無 build）。新增 `mode.js` 決定 `CE.MODE`（`live`｜`demo`）；新增 `supa.js` 直接打 Supabase REST（PostgREST + Storage，不用 SDK）。`store-repo.js`／`menu-data.js` 保留同步讀取介面：live 模式在頁面啟動時 `ready()` 一次載入記憶體，寫入改為非同步；demo 模式照舊用 localStorage 與示範檔。GitHub Actions 把 `proto/v1` 發布成網站根目錄。

**Tech Stack:** HTML5、CSS、原生 JavaScript（ES2020）、Supabase（Postgres + RLS + Storage，免費方案，Tokyo）、GitHub Pages（Actions 部署）、Google Maps JS API；檢查用 node 18（`vm`）＋ headless Chrome（CDP）。

**Spec:** `docs/specs/2026-10-20-critieat-supabase-phase1-design.md`

## Global Constraints

- 網址：`https://davidlin0915.github.io/critieat/` 直接是美食地圖（`proto/v1` 的內容在網站根目錄）；`tools/` 不發布
- live 模式不得出現：`data.js` 的示範店家、`menu-demo.js` 的示範菜單、開團單（導覽連結與頁面）、店家評分、品項評分欄與「大家推」、「重置示範資料」、「還原示範菜單」、轉盤的「排除最近吃過」與「用這家開單／提議」
- demo 模式（網址有 `demo=1`）：行為與現在完全相同、**不發出任何 Supabase 請求**；頁首顯示「示範模式」；站內連結都帶 `demo=1`
- 資料表不給 anon 刪除權限；移除店家＝`visible = false`
- 新店 ID 由資料庫產生，格式 `R` + 3 位以上數字（`R001`…），兩人同時新增不撞號
- `place_id` 唯一；資料庫拒絕重複時，前端顯示既有的「這家已經有了」
- 同事名單初始：David、Mike、雯雯、Ivy、Lexie、Renee、琬翎、老闆（依此順序）
- 固定文字：
  - 讀取中「讀取店家中…」；讀取失敗「店家資料讀取失敗，請檢查網路後重新整理」
  - 寫入失敗「儲存失敗，請檢查網路後再試一次」
  - 照片上傳失敗「照片上傳失敗，這次沒有儲存」
  - 通關碼：標題「輸入團隊通關碼」、說明「第一次修改資料需要通關碼，問一下同事就有」、錯誤「通關碼不對」、按鈕「確定」「取消」
  - 頁首徽章「示範模式」
- Supabase 網址與 publishable key 放 `js/config.js`（`supabaseUrl`、`supabaseKey`）；**secret / service_role key 不得出現在任何檔案**
- 所有資料以 `textContent` 寫入 DOM；不用 `alert`／`confirm`／`prompt`；IME Enter（`isComposing || keyCode === 229`）不送出
- **不得引入測試框架、npm 套件或 build**；邏輯用 scratchpad 的 node `vm` 腳本，畫面用 headless Chrome
- 每個 Task 結束 commit（Task 1 之後才有 git），並在 `.superpowers/sdd/2026-10-20-critieat-supabase-phase1/progress.md` 記一行
- Google Maps key 只允許 `http://localhost:8000/*` 與 `https://davidlin0915.github.io/critieat/*`，不可繞過

## Review Focus

1. **Supabase 連不上或專案被暫停**（7 天沒用）→ 頁面照常開、地圖照常載入，清單顯示「店家資料讀取失敗…」，新增／編輯按鈕不會假裝存成功。Task 4 `RF1`
2. **兩人同時把同一家 Google 店家加進來** → 第二個人收到「這家已經有了」，不產生重複。Task 4 `RF2`
3. **示範資料外洩到正式版，或 demo 模式寫進正式資料** → live 頁面查不到任何示範店名／開團單入口；demo 模式整段操作 Supabase 請求數為 0。Task 3 `RF3`、Task 4 `RF3`
4. **一份菜單 3 張照片其中 1 張上傳失敗** → 整份不存、顯示「照片上傳失敗，這次沒有儲存」，草稿留在畫面上可重試。Task 6 `RF4`
5. **瀏覽器記著舊的／錯的通關碼**（換過碼）→ 寫入被拒時清掉舊碼、跳出輸入框，輸入正確後自動重送；不會靜默失敗。Task 7 `RF5`

---

## 檔案結構

| 檔案 | 動作 | 負責 |
|---|---|---|
| `.gitignore`、`.github/workflows/pages.yml` | 新增 | 版控排除、Pages 部署 |
| `supabase/001_phase1.sql`、`supabase/002_passcode.sql`、`supabase/README.md` | 新增 | 資料表、RLS、Storage；使用者操作說明（執行 SQL、改通關碼、匯出備份、恢復暫停專案） |
| `proto/v1/js/mode.js` | 新增 | `CE.MODE`、`CE.demoHref`、示範徽章、live 下的導覽處理 |
| `proto/v1/js/supa.js` | 新增 | `CE.supa` REST 客戶端、通關碼 header 與重試 |
| `proto/v1/js/member-repo.js` | 新增 | `CE.memberRepo` |
| `proto/v1/js/passcode.js` | 新增 | 通關碼輸入燈箱 |
| `proto/v1/js/config.js` | 修改 | `supabaseUrl`、`supabaseKey` |
| `proto/v1/js/store-edit.js` | 修改 | `toRow`／`fromRow` |
| `proto/v1/js/store-repo.js` | 修改 | live 分支、`ready()`、非同步寫入 |
| `proto/v1/js/store-form.js` | 修改 | 非同步存檔、改用 `memberRepo` |
| `proto/v1/js/menu-data.js`、`menu-lightbox.js` | 修改 | live 分支、照片上傳、無辨識流程、無評分 |
| `proto/v1/js/app.js`、`bus-app.js`、`lunch-app.js`、`pick-lightbox.js`、`nav.js` | 修改 | 等 `ready()`、live 隱藏項目、`demoHref` |
| `proto/v1/index.html`、`bus.html`、`lunch.html` | 修改 | 載入新檔（`mode.js` 緊接 `config.js`） |
| `proto/v1/css/style.css` | 修改 | 末段加「正式版」區塊（徽章、通關碼燈箱） |

檢查工具（不屬於專案）：
- `<scratchpad>/live/`：`check-supa.js`、`check-store-live.js`、`check-menu-live.js`（`vm` 載入專案檔，假 `fetch`）、`check-real.js`（打真的 Supabase，只讀或只做可接受的寫入）
- `.superpowers/sdd/2026-10-20-critieat-supabase-phase1/`：`drive-live.js` 由 `.superpowers/sdd/2026-10-16-critieat-store-edit/drive-store.js` 複製，加步驟 `prestub:<名稱>`（用 `Page.addScriptToEvaluateOnNewDocument` 注入 `stub-<名稱>.js` 後重新載入，讓假資料在頁面腳本之前就位）；`stub-supa.js`（設定 `globalThis.CE = { supaFetch: <記憶體假後端> }`，記錄每次請求到 `CE.__supaLog`）；`stub-places.js` 沿用；`steps-*.sh`、截圖、`progress.md`

`<scratchpad>` = `/private/tmp/claude-501/-Users-critical-Documents-critieat/8aedcfaa-fa06-428e-9839-8b77dcdde1c8/scratchpad`

檢查用伺服器：在 `proto/v1` 內 `python3 -m http.server 8010 --bind 127.0.0.1`（Google 地圖在 8010 會報 Referer 錯誤，屬預期；Google 相關用 `stub-places`）。真的 Supabase／Google 由使用者在 `localhost:8000` 與正式網址確認。

---

### Task 1: 版控起點

**Files:**
- Create: `.gitignore`（`critieat/` 根目錄）
- Create: `.superpowers/sdd/2026-10-20-critieat-supabase-phase1/progress.md`

**Interfaces:** 無（後續 Task 的 commit 依賴此 repo）

- [ ] **Step 1: 掃描不該公開的內容**

Run: `cd /Users/critical/Documents/critieat && grep -rIl -E "sb_secret_|service_role|BEGIN (RSA|OPENSSH) PRIVATE|password\s*[:=]" --exclude-dir=.superpowers . ; ls -la`
Expected: 無輸出（Maps key 與日後的 publishable key 是公開的，不算）。有命中就停下來問使用者。

- [ ] **Step 2: 寫 `.gitignore`**

內容：`.superpowers/`、`Gemini_Generated_Image_*.jpeg`、`.DS_Store`、`*.log`。（`.superpowers/` 有 166MB 截圖、檢查腳本與筆記，不進公開 repo；`docs/` 保留。）

- [ ] **Step 3: 初始化並確認追蹤清單**

Run: `git init -b main && git add -A && git status --short | awk '{print $2}' | cut -d/ -f1-2 | sort -u`
Expected: 只有 `.gitignore`、`docs/...`、`proto/v1`；沒有 `.superpowers`、jpeg。

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: track CRITIEAT proto and docs"
```

---

### Task 2: Supabase 資料表與 REST 客戶端

**Files:**
- Create: `supabase/001_phase1.sql`、`supabase/README.md`
- Create: `proto/v1/js/supa.js`
- Modify: `proto/v1/js/config.js`（加 `supabaseUrl`、`supabaseKey`，註解說明只能放 publishable key）
- Test: `<scratchpad>/live/check-supa.js`、`<scratchpad>/live/check-real.js`

**Interfaces:**
- Produces:
  - 資料表 `stores(id text pk default 'R'||lpad(nextval('store_seq')::text,3,'0'), name, category, area, address, phone, lat float8 null, lng float8 null, hours jsonb, links jsonb, note, place_id text null unique, visible bool default true, updated_by, updated_at timestamptz)`；`menus(store_id text pk references stores, sections jsonb, photos jsonb default '[]', updated_by, updated_at timestamptz)`；`members(name text pk, sort int)`，seed 8 人
  - RLS：三表 anon `select` 全開；`stores`、`menus` anon `insert`、`update` 為 `true`（Task 7 收緊）；無 `delete` policy。`members` 只能讀。
  - Storage bucket `menu-photos`（public read），anon 可 `insert` 物件（Task 7 收緊），無 delete
  - `CE.supa = { configured: boolean, select(table, query: string): Promise<any[]>, insert(table, row): Promise<object>, update(table, id: {col, val}, patch): Promise<object[]>, upsert(table, row, onConflict: string): Promise<object>, upload(bucket, path, blob, contentType): Promise<string /* public URL */> }`
  - 失敗一律 throw `CE.SupaError { status: number, code: string, message: string }`（網路錯誤 `status: 0, code: 'net'`）
  - 請求一律帶 `apikey` 與 `Authorization: Bearer <supabaseKey>`；寫入帶 `Prefer: return=representation`
  - 測試接縫：`CE.supaFetch`（有就用它，沒有用全域 `fetch`）

- [ ] **Step 1: 寫 `check-supa.js`（假 fetch）**

斷言：
- `select('stores','order=id')` 打 `${url}/rest/v1/stores?order=id`，GET，header 含 `apikey` 與 `Authorization`
- `insert` 用 POST、body 為 JSON、header 含 `Prefer: return=representation`，回傳陣列第一筆
- `update('stores',{col:'id',val:'R003'},{note:'x'})` 打 `?id=eq.R003`、PATCH，回傳陣列
- `upsert('menus',row,'store_id')` 打 `?on_conflict=store_id`、POST、`Prefer` 含 `resolution=merge-duplicates`
- `upload('menu-photos','R003/a.jpg',blob,'image/jpeg')` 打 `${url}/storage/v1/object/menu-photos/R003/a.jpg`，回傳 `${url}/storage/v1/object/public/menu-photos/R003/a.jpg`
- 409 回應 `{code:'23505'}` → throw `SupaError` 且 `code === '23505'`、`status === 409`
- fetch reject → throw `SupaError` 且 `status === 0`、`code === 'net'`
- `supabaseUrl` 空字串 → `configured === false`

- [ ] **Step 2: 跑 `node <scratchpad>/live/check-supa.js`，預期 FAIL（`CE.supa` 未定義）**

- [ ] **Step 3: 實作 `proto/v1/js/supa.js` 並在 `config.js` 加兩個欄位（先留空字串）**

- [ ] **Step 4: 跑 check-supa.js，預期全部 PASS**

- [ ] **Step 5: 寫 `supabase/001_phase1.sql` 與 `supabase/README.md`**

README 段落：①在 SQL Editor 貼上執行 `001_phase1.sql`；②到 Project Settings → API Keys 複製 Project URL 與 publishable key（**不要**複製 secret）；③專案被暫停時到 Dashboard 按 Restore；④匯出備份：Table Editor → 各表 → Export to CSV；⑤增刪同事：Table Editor → `members`。

- [ ] **Step 6: 使用者操作（停下來等）**

請使用者照 README ①② 執行，貼回 Project URL 與 publishable key，填進 `config.js`。

- [ ] **Step 7: 寫並跑 `check-real.js`（真的 Supabase，只讀）**

Run: `node <scratchpad>/live/check-real.js`
Expected: `members` 依 `sort` 回傳 `David,Mike,雯雯,Ivy,Lexie,Renee,琬翎,老闆`；`stores`、`menus` 回傳 `[]`；對 `stores` 送 `DELETE ?id=eq.NOPE` 回傳不是 2xx 成功刪除（或 0 列且 policy 中無 delete——在 SQL Editor 跑 `select * from pg_policies where cmd='DELETE'` 確認為空）。

- [ ] **Step 8: Commit**

```bash
git add supabase proto/v1/js/supa.js proto/v1/js/config.js
git commit -m "feat: supabase schema and REST client"
```

---

### Task 3: live／demo 模式與正式版隱藏項目

**Files:**
- Create: `proto/v1/js/mode.js`
- Modify: `index.html`、`bus.html`、`lunch.html`（`mode.js` 接在 `config.js` 後；`supa.js` 接在 `mode.js` 後）
- Modify: `nav.js`、`app.js`、`lunch-app.js`、`pick-lightbox.js`、`menu-lightbox.js`、`css/style.css`
- Test: `.superpowers/sdd/2026-10-20-critieat-supabase-phase1/steps-mode.sh`

**Interfaces:**
- Produces: `CE.MODE: 'live' | 'demo'`（`new URLSearchParams(location.search).get('demo') === '1'` 為 demo；`config.js` 的 `supabaseUrl` 為空時也視為 demo，免得未設定時整站壞掉）；`CE.isDemo(): boolean`；`CE.demoHref(href: string): string`（demo 時加上 `demo=1`，保留原有 query 與 hash；live 原樣回傳）
- `CE.openPicker` 新增 `source: 'maplive'`，按鈕只有「在地圖上看這家」（action `map`，primary）

改動要點：
- `nav.js`：live 移除導覽中 `href="lunch.html"` 的連結；demo 把站內 `.html` 連結改成 `CE.demoHref(...)`，並在 `.hdr` 加 `<span class="pill demo-badge">示範模式</span>`
- `lunch-app.js` 的 init 最前面：live 時 `location.replace('index.html')` 並結束；`index.html?store=` 連結與 `app.js` 跳 `lunch.html?new=` 都包 `CE.demoHref`
- `app.js`：live 不顯示「重置示範資料」、清單不顯示評分、詳情不放 `CE.ratingUi.section`、不呼叫 `CE.ratingUi.init`；`openPicker` 在 live 傳 `cards: []`、`source: 'maplive'`
- `menu-lightbox.js`：live 時 `renderRows` 不加評分欄、列不可點開、`paintTop` 不顯示；不出現「還原示範菜單」「刪除這份菜單」（本 Task 只做隱藏，資料改接在 Task 6）

- [ ] **Step 1: 寫 `steps-mode.sh`（prestub:supa，stub 先回空清單）**

`RF3` 斷言（每行 `val` 為 true）：
- live `index.html`：`!document.querySelector('a[href^="lunch.html"]')`；`!document.querySelector('.store__reset')`；`!document.querySelector('.demo-badge')`；頁面文字不含 `R001` 示範店名（從 `CE.DEMO_STORES_CSV` 取第一個店名比對）
- live `lunch.html` → 載入後 `location.pathname.endsWith('index.html')`
- live `bus.html`：沒有開團單連結
- demo `index.html?demo=1`：`.demo-badge` 文字為「示範模式」；開團單連結 href 含 `demo=1`；清單有 10 家示範店；詳情有評分區；`CE.__supaLog.length === 0`
- demo 轉盤抽中後按鈕有「用這家開單」；live 只有「在地圖上看這家」
- `CE.demoHref('index.html?store=R002#x')` 在 demo 為 `index.html?store=R002&demo=1#x`

- [ ] **Step 2: 跑 `bash steps-mode.sh`，預期有 false**

- [ ] **Step 3: 實作 `mode.js` 與上述改動；徽章樣式接在 `style.css` 末段「正式版」區塊**

- [ ] **Step 4: 跑 `bash steps-mode.sh`，預期全部 true、無 EXC**

- [ ] **Step 5: 回歸**：`bash .superpowers/sdd/2026-10-16-critieat-store-edit/steps.sh` 與 `.superpowers/sdd/2026-10-16-critieat-item-rating/store-suite.sh` 改用 `?demo=1` 網址重跑，預期與改動前一樣全 true

- [ ] **Step 6: Commit**

```bash
git add proto/v1
git commit -m "feat: live/demo mode, hide demo-only features in live"
```

---

### Task 4: 店家與同事名單接 Supabase

**Files:**
- Create: `proto/v1/js/member-repo.js`
- Modify: `store-edit.js`（`toRow`、`fromRow`）、`store-repo.js`、`store-form.js`、`app.js`、`bus-app.js`、`index.html`、`bus.html`、`lunch.html`
- Test: `<scratchpad>/live/check-store-live.js`、`.superpowers/sdd/.../steps-store.sh`

**Interfaces:**
- Consumes: `CE.supa`、`CE.SupaError`、`CE.MODE`（Task 2、3）
- Produces:
  - `CE.storeEdit.toRow(store): object`（camelCase → snake_case；`placeId ''` → `place_id null`；不送 `id` 給 insert）、`fromRow(row): Store`（反向；`null` 字串欄位 → `''`；`updated_at` → ISO 字串）
  - `CE.storeRepo.ready(): Promise<boolean>`（live：`select('stores','order=id')` 進記憶體，失敗回 `false`；demo：`true`）
  - `all()`／`visible()`／`get()`／`findByPlaceId()`／`warning()` 維持同步；live `warning()` 在載入失敗時回「店家資料讀取失敗，請檢查網路後重新整理」
  - `save(store, member, now): Promise<{ ok: true, id: string } | { ok: false, dup: boolean }>`：live 有 `id` → `update`、無 → `insert`（ID 由 DB 給）；`23505` → `{ ok:false, dup:true }`；成功更新記憶體並發 `ce:store-change`。demo 包裝原本邏輯（`nextId` 照舊）
  - `remove(id, member, now): Promise<boolean>`
  - `nextId()`：live 回 `''`
  - `CE.memberRepo = { ready(): Promise<boolean>, list(): string[] }`（live 讀 `members order=sort`；demo 回 `CE.lunchStore.peekMembers()`）
- `store-form.js`：`who()`、名單下拉改用 `CE.memberRepo.list()`；`doSave`／`doRemove` 改 `async`，等待中存檔鈕 disabled；`dup` → 既有「這家已經有了」訊息（`gotoId` 用 `findByPlaceId`）；其他失敗 → 「儲存失敗，請檢查網路後再試一次」，燈箱不關
- `app.js`／`bus-app.js` init：先顯示「讀取店家中…」，`await Promise.all([storeRepo.ready(), memberRepo.ready()])` 再算清單；地圖載入不等它（並行）

- [ ] **Step 1: 寫 `check-store-live.js`（vm、假 `CE.supa`）**

斷言：
- `toRow(fromRow(row))` 對一筆完整 row 往返相等；`placeId:''` → `place_id:null`
- live `ready()` 後 `visible()` 不含 `visible:false` 的店、`all()` 含
- `save` 新店：`CE.supa.insert` 收到的 row 沒有 `id`；回傳 `{ok:true,id:'R001'}`（假後端給的）；`get('R001').updatedBy === 'Mike'`
- `save` 既有店：走 `update`、`{col:'id',val:'R001'}`
- `RF2`：insert throw `SupaError{code:'23505',status:409}` → `{ok:false,dup:true}`，記憶體不變
- `RF1`：`select` throw `status:0` → `ready()` 回 `false`、`warning()` 為固定文字、`visible()` 為 `[]`；`save` throw → `{ok:false,dup:false}`
- demo：`ready()` 為 `true`、`visible().length === 10`、`CE.supa` 一次都沒被呼叫

- [ ] **Step 2: 跑，預期 FAIL**

- [ ] **Step 3: 實作 `store-edit.js` 映射、`store-repo.js` live 分支、`member-repo.js`**

- [ ] **Step 4: 跑 check-store-live.js，預期 PASS；再跑 2026-10-16 的 `check-store-edit.js`、`check-store-repo.js`（demo 行為）仍 PASS**

- [ ] **Step 5: 寫 `steps-store.sh`（prestub:supa＋stub:places，live 網址）**

斷言：
- 開頁時清單出現「讀取店家中…」，stub 回應後消失；空清單顯示「還沒有店家資料」與「＋ 新增店家」
- 新增 → 帶入 → 選分類 → 名單下拉是 8 位真同事（第一個 `David`）→ 存檔：燈箱關、清單 1 家、`CE.__supaLog` 有一筆 POST `stores` 且 body 無 `id`
- 編輯後存檔：PATCH `stores?id=eq.R001`；詳情顯示「最後修改：Mike…」
- 移除：PATCH body `visible:false`；清單 0 家；`CE.__supaLog` 無 DELETE
- `RF1`：stub 設 `failSelect` → 頁面有 `#store-notice` 文字「店家資料讀取失敗…」，`#map` 存在；stub 設 `failWrite` → 存檔後燈箱仍開、訊息「儲存失敗，請檢查網路後再試一次」
- `RF2`：stub 設 `dupOnInsert` → 訊息「這家已經有了」
- `RF3`：`bus.html` live 用 stub 的店家；`?demo=1` 下同流程 `CE.__supaLog.length === 0`

- [ ] **Step 6: 跑 `bash steps-store.sh`，預期全部 true、無 EXC；截圖 `s-live-desktop.png`、`s-live-phone.png`（390×844）**

- [ ] **Step 7: Commit**

```bash
git add proto/v1
git commit -m "feat: shared stores and members via supabase"
```

---

### Task 5: 部署到 GitHub Pages

**Files:**
- Create: `.github/workflows/pages.yml`

**Interfaces:** 無程式介面；產出正式網址

- [ ] **Step 1: 寫 workflow**

觸發：push 到 `main`、手動 `workflow_dispatch`。步驟：`actions/checkout@v4` → 複製 `proto/v1` 到 `_site` 並刪 `_site/tools` → `actions/configure-pages@v5` → `actions/upload-pages-artifact@v3`（path `_site`）→ `actions/deploy-pages@v4`。權限 `pages: write`、`id-token: write`；`concurrency: pages`。

- [ ] **Step 2: Commit**

```bash
git add .github && git commit -m "ci: deploy proto/v1 to GitHub Pages"
```

- [ ] **Step 3: 使用者操作（停下來等）**

請使用者：GitHub 建立**公開**、**空的**（不勾 README）repo `critieat`；Settings → Pages → Source 選 **GitHub Actions**。

- [ ] **Step 4: 推上去**

Run: `git remote add origin https://github.com/DavidLin0915/critieat.git && git push -u origin main`
這台沒有 `gh`、git 沒設 credential helper；若要求登入，請使用者自己執行 `! git push -u origin main`（用瀏覽器授權或 Personal Access Token）。

- [ ] **Step 5: 驗證部署**

Run: `curl -s -o /dev/null -w "%{http_code}" https://davidlin0915.github.io/critieat/` 與 `.../tools/backfill.html`
Expected: `200` 與 `404`（Actions 跑完後約 1–2 分鐘）。

- [ ] **Step 6: 使用者驗收**：正式網址上地圖有出現、Google 搜尋帶入可用、新增第一家真實店家後在另一台裝置重新整理看得到；公車地圖正常。記在 progress.md。

---

### Task 6: 菜單接 Supabase（品項＋照片）

**Files:**
- Modify: `proto/v1/js/menu-data.js`、`proto/v1/js/menu-lightbox.js`、`app.js`（init 一起 `await CE.menuData.ready()`）
- Test: `<scratchpad>/live/check-menu-live.js`、`.superpowers/sdd/.../steps-menu.sh`

**Interfaces:**
- Consumes: `CE.supa`（Task 2）、`CE.MODE`（Task 3）
- Produces:
  - `CE.menuData.ready(): Promise<boolean>`（live：`select('menus','select=*')` 進快取；demo：`true`）
  - `saveMenu(storeId, menu): Promise<boolean>`（live：`upsert('menus', row, 'store_id')`；demo：包裝原本同步結果）
  - `uploadPhoto(storeId, blob): Promise<string | null>`（live：路徑 `<storeId>/<Date.now()>-<序號>.jpg`，回公開網址；失敗回 `null`）
  - live 下 `getMenu`／`hasMenu`／`items`／`findItem`／`matchItem`／`search` 只看快取，不讀 `CE.DEMO_MENUS`；`assignIds` 規則不變
- `menu-lightbox.js` live 流程：上傳畫面主按鈕改為「下一步：輸入品項」→ 直接進草稿（有舊菜單用 `menuDraft.fromSections(舊 sections)`，否則一列空白）；草稿標題「輸入菜單」、說明「對照照片輸入品項，價格看不清楚可以留空」；不顯示 AI／辨識字樣與黃色不確定列。`shrink` 在 live 產生 Blob（`canvas.toBlob('image/jpeg', 0.8)`，長邊 1200px）；網址型照片直接存網址
- 存檔順序：先上傳全部檔案照片 → 任一回 `null` → 顯示「照片上傳失敗，這次沒有儲存」，停在草稿（`RF4`）→ 全成功才 `saveMenu`；`saveMenu` 失敗顯示「儲存失敗，請檢查網路後再試一次」，停在草稿
- 「重新上傳」時，未選新照片則保留舊 `photos`；選了新照片則以新照片取代

- [ ] **Step 1: 寫 `check-menu-live.js`**

斷言：live `ready()` 後 `getMenu('R001')` 來自假後端、`CE.DEMO_MENUS` 的店回 `null`；`saveMenu` 送出 row `{store_id, sections, photos, updated_by, updated_at}`；重存同品名＋備註沿用舊 ID；`uploadPhoto` 失敗回 `null`。

- [ ] **Step 2: 跑，預期 FAIL**

- [ ] **Step 3: 實作 `menu-data.js` live 分支**

- [ ] **Step 4: 跑，預期 PASS；2026-10-16 的 menu-item-link 檢查腳本（demo）仍 PASS**

- [ ] **Step 5: 寫 `steps-menu.sh`（prestub:supa，live）**

斷言：沒菜單的店 →「📷 上傳菜單」→ 選 2 張圖（CDP `DOM.setFileInputFiles` 用 `proto/v1/img/logo.png`）→「下一步：輸入品項」→ 填兩列 → 存：`__supaLog` 有 2 次 storage POST、1 次 `menus` upsert，畫面顯示表格且無評分欄、無「大家推」、無「刪除這份菜單」；`RF4`：stub `failUploadNth=2` → 訊息「照片上傳失敗，這次沒有儲存」、仍在草稿、`menus` 無寫入；頁面無「AI」「辨識」字樣；`?demo=1` 下原本假辨識流程照舊且 `__supaLog.length === 0`。

- [ ] **Step 6: 跑，預期全部 true；截圖 `m-live.png`**

- [ ] **Step 7: Commit 並推送**

```bash
git add proto/v1 && git commit -m "feat: shared menus with photo upload via supabase" && git push
```

- [ ] **Step 8: 使用者驗收**：正式網址上幫一家店建菜單（含照片），另一台看得到。

---

### Task 7: 團隊通關碼（只擋寫入）

**Files:**
- Create: `supabase/002_passcode.sql`、`proto/v1/js/passcode.js`
- Modify: `supa.js`、`supabase/README.md`、`index.html`、`bus.html`、`css/style.css`
- Test: `<scratchpad>/live/check-supa.js`（加案例）、`<scratchpad>/live/check-real.js`（加案例）、`steps-passcode.sh`

**Interfaces:**
- Consumes: `CE.supa`（Task 2）
- Produces:
  - DB：`team_secret(code text)` 單列、anon 無任何權限；`check_team_code(c text) returns boolean`（security definer，anon 可執行）；`stores`、`menus` 的 insert／update policy 與 `storage.objects` 的 insert policy 改為 `check_team_code(current_setting('request.headers', true)::json->>'x-team-code')`；select 不變
  - `supa.js`：寫入與上傳帶 header `x-team-code`（取自 localStorage `critieat.teamCode`，沒有就不帶）；寫入被拒（insert／upsert／upload 回 401/403，或 update 回空陣列）時：清掉存的碼 → `await CE.askPasscode()` → 取得碼則重送一次，使用者取消則 throw `SupaError{code:'passcode'}`
  - `CE.askPasscode(): Promise<string | null>`（`passcode.js`：燈箱，固定文字見 Global Constraints；送出時呼叫 RPC `check_team_code`，false 顯示「通關碼不對」並留在燈箱；true 存進 localStorage 並 resolve）
  - `CE.supa.rpc(fn, args): Promise<any>`
- 呼叫端把 `code:'passcode'` 視為一般失敗（不顯示「儲存失敗」以外的新訊息）

- [ ] **Step 1: 先確認 Storage 吃得到 header（spike）**

在使用者的 Supabase 套用一條暫時的 storage insert policy（`request.headers` 的 `x-team-code` 等於 `'spike'`），用 `check-real.js` 上傳一個 1×1 圖：不帶 header 應被拒、帶 `spike` 應成功；之後移除該 policy，並請使用者在 Storage 後台刪掉測試檔。
**若 Storage 讀不到 header：停下來回報使用者**（替代方案是 Edge Function 代傳照片，需另行同意）。

- [ ] **Step 2: 在 `check-supa.js` 加 `RF5` 案例**

存著錯碼 → 第一次寫入 403 → 呼叫假的 `CE.askPasscode` 回 `'right'` → 重送帶 `x-team-code: right` → 成功，且 localStorage 為 `right`；update 回 `[]` 同樣觸發；`askPasscode` 回 `null` → throw `code:'passcode'`；讀取請求永遠不帶 header 也不觸發輸入。

- [ ] **Step 3: 跑，預期 FAIL；實作 `supa.js` 改動與 `passcode.js`；再跑，預期 PASS**

- [ ] **Step 4: 寫 `002_passcode.sql`，README 加「設定／更換通關碼」（`update team_secret set code = '...'`）**

- [ ] **Step 5: 使用者操作（停下來等）**：在 SQL Editor 執行 `002_passcode.sql`，再執行設定通關碼的那行（碼由使用者自己決定，不必告訴 Claude，除了要做 Step 6 的話可給一個暫時碼、驗完再換）。

- [ ] **Step 6: 跑 `check-real.js` 新案例**

不帶碼 insert `stores` → 被拒（401/403）；不帶碼 update 既有店 → 回 `[]`；帶正確碼 update 既有店（`note` 設成原值）→ 回 1 列；不帶碼上傳照片 → 被拒；不帶碼 select → 正常。

- [ ] **Step 7: `steps-passcode.sh`（prestub:supa，stub 模擬 403 與 RPC）**：新增店家存檔 → 跳出「輸入團隊通關碼」→ 輸入錯 →「通關碼不對」→ 輸入對 → 燈箱關、店家存好；重新整理後再存不再詢問；按「取消」→ 店家燈箱顯示「儲存失敗，請檢查網路後再試一次」且不關。IME Enter 不送出。

- [ ] **Step 8: Commit 並推送；使用者在正式網址驗收**（自己的瀏覽器輸入一次碼即可）

```bash
git add supabase proto/v1 && git commit -m "feat: team passcode for writes" && git push
```

---

## 完成後

- 寫 `progress.md` 結尾：正式網址、未做事項（第二階段：開團單＋評分）、已知取捨（後存覆蓋、不即時同步）
- 更新 spec 開頭狀態為「已實作」
