# CRITIEAT 菜單 AI 辨識（Gemini）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 正式版上傳菜單照片後按「開始辨識」，Gemini 讀出品項，合併進可編輯的草稿，人確認後才儲存。

**Architecture:** 新增一支 Supabase Edge Function `menu-recognize`：驗通關碼 → 整理照片（base64 或抓網址）→ 呼叫 Gemini REST → 清洗結果回傳草稿列。前端 `CE.supa.invoke` 呼叫它（沿用通關碼重試），`CE.menuData.recognize` 包一層，`CE.menuDraft.mergeRecognized` 把結果併進舊菜單，`menu-lightbox.js` 接上原型就有的「辨識中 → 確認草稿」畫面。函式寫成**不含 TypeScript 語法、不 import 任何東西**的單一檔案，才能貼進 Supabase Dashboard 的函式編輯器部署，也能用 node `vm` 檢查。

**Tech Stack:** 原生 JavaScript（ES2020，IIFE 掛 `globalThis.CE`）、Supabase Edge Functions（Deno，`Deno.serve`）、Gemini API REST（`generativelanguage.googleapis.com/v1beta`，免費方案）；檢查用 node 18（`vm`）＋ headless Chrome。

**Spec:** `docs/specs/2026-10-22-critieat-menu-ai-design.md`（流程與畫面以原型 spec `docs/specs/2026-10-15-critieat-menu-design.md` 為準）

## Global Constraints

- Gemini key 只從函式的環境變數 `GEMINI_API_KEY` 讀；不得出現在任何檔案、前端、回應內容、log、對話裡
- 模型從環境變數 `GEMINI_MODEL` 讀，沒設時用程式裡的預設值（Task 2 查 ai.google.dev 選一個**免費方案有提供、支援圖片輸入**的 Flash 型號）
- 函式先驗通關碼（`x-team-code` → `rpc/check_team_code`），不對回 403，**而且不呼叫 Gemini、不抓網址**
- 一次最多 6 張照片；網址照片 10MB 上限、必須是 `image/*`
- AI 結果一律先進草稿，只有使用者按「確認儲存」才寫入；存檔沿用現有 `save()`／`assignIds`
- `?demo=1` 行為完全不變：照舊 `fakeRecognize`，不呼叫函式
- 不加 npm 套件、build、測試框架；邏輯用 scratchpad 的 node `vm` 腳本驗，畫面用 headless Chrome
- 所有資料以 `textContent` 寫入 DOM；不用 `alert`／`confirm`／`prompt`
- 每個 Task 結束 commit，並在 `.superpowers/sdd/2026-10-22-critieat-menu-ai/progress.md` 記一行
- 固定文字：
  - 辨識後草稿提示：「請對照照片檢查。AI 沒把握的列標成黃色，價格讀不出來的留空；改過的列黃色就會消失。」（原型那句）
  - 原價提示：`原價 $120`（數字照舊價格）
  - 按鈕：「開始辨識（n 張）」「不辨識，直接輸入」「直接輸入」「重試」「取消」
  - 超過張數：「一次最多辨識 6 張照片」
  - 額度用完：「免費辨識次數暫時用完了，可以過一陣子再試，或先直接輸入」
  - 沒辨識到：「沒有辨識到菜單品項，可以直接輸入」
  - 沒設定好：「辨識功能還沒設定好，可以先直接輸入」
  - 照片都讀不到：「照片都讀不到，請改用截圖上傳」
  - 其他失敗：「辨識失敗，可以重試或直接輸入」
  - 部分網址照片失敗：「第 2、3 張照片讀不到，沒有辨識」（序號 1 起算，用「、」連接）

`<scratchpad>` = `/private/tmp/claude-501/-Users-critical-Desktop-ME-critieat/7ecda67b-3130-4295-b0e2-fff2bee6a3df/scratchpad`

## 介面約定（各 Task 共用）

函式請求：`POST {supabaseUrl}/functions/v1/menu-recognize`，header `apikey`、`Authorization: Bearer <publishable key>`、`x-team-code`、`Content-Type: application/json`
```
body: { images: [ { data: "<base64，不含 data: 前綴>", mime: "image/jpeg" } | { url: "https://…" } ] }
200:  { rows: [ { category: string, name: string, price: number|null, note: string, uncertain: boolean } ], failed: [<images 的索引，0 起算>] }
錯誤: 400 { error: "bad_request" | "too_many" | "no_images" }   403 { error: "passcode" }
      429 { error: "quota" }   502 { error: "ai" }   503 { error: "not_configured" }
```
`rows` 為空陣列時前端視為「沒辨識到」。CORS：所有回應（含 `OPTIONS` 預檢回 204）帶 `Access-Control-Allow-Origin: *`、`Access-Control-Allow-Headers: apikey, authorization, content-type, x-team-code`、`Access-Control-Allow-Methods: POST, OPTIONS`。

## Review Focus

1. **辨識中按取消或關掉燈箱，結果晚到** → 晚到的結果被丟掉，不會把後來的畫面換成草稿。Task 4 `RF1`
2. **跳出通關碼輸入框時按取消** → 回到上傳畫面、照片還在，不顯示「辨識失敗」。Task 4 `RF2`
3. **Gemini 回奇怪的值**（價格是負數、字串、`NaN`，沒有品名，`uncertain` 不是布林）→ 沒品名的列丟掉，壞價格變 `null` 並標 `uncertain`，其他欄位補空字串。Task 2 `RF3`
4. **舊菜單有全形／半形、大小寫不同的同一品項，或 AI 在兩張照片都讀到同一品項** → 只比對到一列、不重複加。Task 1 `RF4`
5. **手機的 HEIC 或壞掉的照片**（`shrink` 回 `null`）→ 那張不送出、算進「第 n 張照片讀不到」，其他張照樣辨識；全部都讀不到時直接顯示「照片都讀不到，請改用截圖上傳」不呼叫函式。Task 4 `RF5`

---

## 檔案結構

| 檔案 | 動作 | 負責 |
|---|---|---|
| `proto/v1/js/menu-draft.js` | 修改 | `mergeRecognized(oldRows, aiRows)` 合併純函式 |
| `supabase/functions/menu-recognize/index.ts` | 新增 | Edge Function（純 JS 語法、無 import） |
| `proto/v1/js/supa.js` | 修改 | `invoke(fn, body)` |
| `proto/v1/js/menu-data.js` | 修改 | `recognize(images)` |
| `proto/v1/js/menu-lightbox.js` | 修改 | 正式版辨識流程、錯誤畫面、原價提示 |
| `proto/v1/css/style.css` | 修改 | `.mdraft__old`（原價提示）樣式 |
| `supabase/README.md` | 修改 | 新增 ⑧：申請 key、設 secret、部署函式 |

---

### Task 1: 合併純函式 `mergeRecognized`

**Files:**
- Modify: `proto/v1/js/menu-draft.js`
- Test: `<scratchpad>/ai/check-merge.js`

**Interfaces:**
- Consumes: `CE.menuData.norm(v)`（在函式內呼叫時才取，`menu-data.js` 先載入）；`CE.menuDraft.parsePrice`
- Produces: `CE.menuDraft.mergeRecognized(oldRows: DraftRow[], aiRows: AiRow[]) -> DraftRow[]`
  - `DraftRow = { category, name, price: string, note, uncertain: boolean, oldPrice?: string }`
  - `AiRow = { category, name, price: number|null, note, uncertain }`（函式回傳的列）
  - 不改動傳入的陣列與物件

- [ ] **Step 1: 寫 `check-merge.js`（先失敗）**：`vm` 載入 `menu-data.js`（假 `localStorage`、`window` 可省略，`CE.isDemo = () => true`）、`menu-draft.js`。案例（`old` 用 `fromSections` 或直接寫列）：
  - `M1` 舊 `[{名:雞腿便當, 價:'130'}]`、AI `[{雞腿便當, 130}]` → 結果 1 列、`uncertain:false`、無 `oldPrice`
  - `M2` AI `{雞腿便當, null}` → 舊列不動
  - `M3` AI `{雞腿便當, 140}` → `price:'140'`、`uncertain:true`、`oldPrice:'130'`
  - `M4` AI `{雞腿便當, 140, uncertain:true}` → `price:'130'`、`uncertain:true`、無 `oldPrice`
  - `M5` 舊列 `price:''`、AI `{…, 90}` → `price:'90'`、`uncertain:true`、無 `oldPrice`
  - `M6` AI 新品項 `{category:'湯品', 味噌湯, 30, uncertain:false}` → 加在最後、`price:'30'`；AI `{…, null, uncertain:true}` → `price:''`、`uncertain:true`
  - `RF4` 舊 `ＢＢＱ飯`、AI `bbq飯` 同價 → 不加；AI 同一列出現兩次 → 只加一次；同名不同備註（`大`／`小`）→ 視為不同品項
  - `M7` 舊列 `uncertain` 原本都為 `false`、順序不變；傳入的 `oldRows` 物件沒被改（深比較執行前後的 JSON）
  - `M8` `oldRows` 為 `[]` → 全部 AI 列依序加入

  Run: `node <scratchpad>/ai/check-merge.js` → Expected: FAIL（`mergeRecognized is not a function`）

- [ ] **Step 2: 實作 `mergeRecognized`**：key ＝ `norm(name) + '\n' + norm(note)`；先把 AI 列依 key 去重（留第一筆），再對每筆找舊列中同 key 的第一列套 spec「合併規則」；價格比較用 `parsePrice` 後的數字。`fakeRecognize` 不動。

- [ ] **Step 3: 跑 `check-merge.js`** → Expected: 全部 PASS

- [ ] **Step 4: Commit** `feat: merge AI-recognized rows into menu draft`

---

### Task 2: Edge Function `menu-recognize`

**Files:**
- Create: `supabase/functions/menu-recognize/index.ts`
- Test: `<scratchpad>/ai/check-fn.js`

**Interfaces:**
- Consumes: 環境變數 `GEMINI_API_KEY`、`GEMINI_MODEL`（選用）、`SUPABASE_URL`、`SUPABASE_ANON_KEY`（Supabase 自動提供）
- Produces: 上方「介面約定」的 HTTP 介面。檔案最後是 `Deno.serve(handle)`；`handle(req: Request) -> Promise<Response>`

- [ ] **Step 1: 寫 `check-fn.js`（先失敗）**：`vm` 執行 `index.ts` 原文，context 給 `Deno = { env: { get } , serve(h) { captured = h } }`、node 18 的 `fetch`/`Request`/`Response`/`btoa`/`atob`/`AbortController`/`setTimeout`/`TextEncoder` 與記錄呼叫的假 `fetch`（依網址回：`rpc/check_team_code` → `true`/`false`；`generativelanguage…` → 設定好的回應；圖片網址 → 設定好的回應）。案例：
  - `F1` `OPTIONS` → 204，帶上方三個 CORS header
  - `F2` 沒有 `x-team-code` 或碼錯 → 403 `{error:'passcode'}`，假 fetch **沒有**收到 Gemini 或圖片網址的請求
  - `F3` 沒設 `GEMINI_API_KEY` → 503 `not_configured`（碼正確時）
  - `F4` 7 張 → 400 `too_many`；`images` 不是陣列或空 → 400 `bad_request`
  - `F5` Gemini 回 429 → 429 `quota`；回 500 或丟例外 → 502 `ai`
  - `F6` Gemini 正常回應（`candidates[0].content.parts[0].text` 為 JSON 字串）→ 200，`rows` 正確；送出的請求帶 `x-goog-api-key` header、網址含預設型號或 `GEMINI_MODEL`、`generationConfig.responseMimeType === 'application/json'` 且有 `responseSchema`、parts 含每張圖的 `inline_data`
  - `F7` 第 2 張網址回 404、第 3 張回 `text/html` → `failed:[1,2]`，Gemini 只收到 1 張；全部失敗 → 400 `no_images` 且不呼叫 Gemini
  - `RF3` Gemini 回 `[{name:'', …}, {name:' 滷蛋 ', price:-5}, {name:'湯', price:'30元', uncertain:'yes'}, {name:'飯', price:12.34}]` → 只剩 3 列：`滷蛋` `price:null, uncertain:true`；`湯` `price:null, uncertain:true`；`飯` `price:12.3`；缺的字串欄位補 `''`
  - `F8` Gemini 回的 text 不是 JSON → 502 `ai`

  Run: `node <scratchpad>/ai/check-fn.js` → Expected: FAIL（檔案不存在）

- [ ] **Step 2: 查型號**：到 ai.google.dev 的 models／pricing 頁，選免費方案有額度、支援圖片的 Flash 型號當預設，在檔案頂端註解寫上查詢日期。

- [ ] **Step 3: 實作 `index.ts`**：不得用型別註記、`import`、`export`。要點：
  - 通關碼：`POST ${SUPABASE_URL}/rest/v1/rpc/check_team_code`，header `apikey`/`Authorization` 用 `SUPABASE_ANON_KEY`，body `{ c }`，回應為 `true` 才放行
  - 網址照片：15 秒逾時、`content-type` 以 `image/` 開頭、長度 ≤ 10MB；轉 base64 用分段 `String.fromCharCode` ＋ `btoa`（不用 `Buffer`）
  - Gemini：`POST https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`，header `x-goog-api-key`；body `contents:[{ parts:[...每張圖 { inline_data:{ mime_type, data } }, { text: PROMPT }] }]`、`generationConfig:{ responseMimeType:'application/json', responseSchema }`（陣列，item 含 `category,name,price(number, nullable),note,uncertain(boolean)`，`name`、`uncertain` 必填）
  - 呼叫 Gemini 集中在 `callAi(images, key, model) -> Promise<rawRows>`（失敗 throw 帶 `quota`／`ai` 的錯誤），以後換 Claude 只換這個函式
  - `PROMPT` 照 spec「提示詞重點」五點，用繁體中文寫
  - 清洗：`name` trim 後空的丟掉；`price` 不是有限且 ≥0 的數字 → `null` 並設 `uncertain:true`，否則四捨五入到一位小數；`uncertain` 只有 `true` 才算真
  - 錯誤時不得把 Gemini 的原始錯誤訊息或 key 放進回應

- [ ] **Step 4: 跑 `check-fn.js`** → Expected: 全部 PASS；`grep -n "import\|export\|: string\|: number" supabase/functions/menu-recognize/index.ts` 沒有結果

- [ ] **Step 5: Commit** `feat: menu-recognize edge function (Gemini)`

---

### Task 3: 前端呼叫 `CE.supa.invoke`、`CE.menuData.recognize`

**Files:**
- Modify: `proto/v1/js/supa.js`、`proto/v1/js/menu-data.js`
- Test: `<scratchpad>/ai/check-invoke.js`

**Interfaces:**
- Consumes: `supa.js` 既有的 `request`、`write`、`headers`、`withCode`、`deniedError`
- Produces:
  - `CE.supa.invoke(fn: string, body: object) -> Promise<object>`：`POST ${base}/functions/v1/${fn}`，帶通關碼並走 `write()` 的重試；失敗 throw `SupaError`（`code` 取回應的 `error`）
  - `CE.menuData.recognize(images) -> Promise<{ rows: AiRow[], failed: number[] }>`；示範模式呼叫時 throw（不該被呼叫）

- [ ] **Step 1: 寫 `check-invoke.js`（先失敗）**：`vm` 載入 `config.js`、`mode.js`（`location.search=''`）、`supa.js`、`menu-data.js`，`CE.supaFetch` 為假 fetch，`localStorage` 預存一個碼。案例：
  - `I1` 200 → 回傳 body；請求網址結尾 `/functions/v1/menu-recognize`、帶 `x-team-code`、`apikey`、body 原樣
  - `I2` 第一次 403 `{error:'passcode'}` → 呼叫假 `CE.askPasscode`（回 `'new'`）→ 重送時 `x-team-code: new` → 成功
  - `I3` `askPasscode` 回 `null` → throw `code === 'passcode'`
  - `I4` 429 `{error:'quota'}` → throw `status 429, code 'quota'`，沒有問通關碼；404 → throw `status 404`
  - `I5` `CE.menuData.recognize([...])` 呼叫 `invoke('menu-recognize', { images })`，回傳 `{ rows, failed }`（缺 `failed` 時補 `[]`）

  Run: `node <scratchpad>/ai/check-invoke.js` → Expected: FAIL

- [ ] **Step 2: 實作 `invoke` 與 `recognize`**

- [ ] **Step 3: 跑 `check-invoke.js`；再跑前一階段留下的 `supa` 檢查腳本（若 scratchpad 已不在，跳過並在 progress 記下）** → Expected: PASS

- [ ] **Step 4: Commit** `feat: call menu-recognize from the frontend`

---

### Task 4: 燈箱接上辨識流程

**Files:**
- Modify: `proto/v1/js/menu-lightbox.js`、`proto/v1/css/style.css`
- Test: `<scratchpad>/ai/check-ui.js`（headless Chrome，本機 `python3 -m http.server` 開 `proto/v1`）

**Interfaces:**
- Consumes: `CE.menuData.recognize`（Task 3）、`CE.menuDraft.mergeRecognized`、`fromSections`（Task 1）
- Produces: 無（畫面）

- [ ] **Step 1: 寫 `check-ui.js`（先失敗）**：開正式版首頁（真的 Supabase 只讀），頁面載入前注入腳本把 `window.fetch` 對 `/functions/v1/menu-recognize` 的請求換成可控的假回應（其他照常）；開一家**已有菜單**的店的燈箱 → 重新上傳 → 用 `DataTransfer` 塞 2 張測試 JPEG（`<scratchpad>/ai/` 產生）。**全程不按「確認儲存」**。案例：
  - `U1` 上傳畫面有「開始辨識（2 張）」「不辨識，直接輸入」「取消」；0 張時只有「直接輸入」「取消」；7 張時「開始辨識」disabled 並顯示「一次最多辨識 6 張照片」
  - `U2` 假回應 `rows` 含一筆舊品項改價、一筆新品項 → 草稿：舊列全在、改價那列 `.is-uncertain` 且顯示「原價 $…」、新列在最後；提示為辨識後那句；在改價列輸入後黃色與原價提示消失
  - `U3` 假回應 429／`rows:[]`／404／500 → 錯誤畫面分別顯示四句固定文字，有「重試」「直接輸入」；「直接輸入」進草稿＝舊菜單列
  - `RF1` 假回應延遲 3 秒，1 秒時按「取消」→ 回上傳畫面且照片還在；4 秒時畫面仍是上傳畫面
  - `RF2` 假回應 403 且 `CE.askPasscode` 被換成回 `null` → 回上傳畫面、照片還在、沒有錯誤畫面
  - `RF5` 一張是壞掉的圖（`shrink` 回 `null`）→ 送出的 `images` 只有 1 張；草稿上方顯示「第 2 張照片讀不到，沒有辨識」；兩張都壞 → 顯示「照片都讀不到，請改用截圖上傳」且沒有送出請求
  - `U4` 網址照片：送出 `{ url }`，回應 `failed:[0]` → 顯示「第 1 張照片讀不到，沒有辨識」
  - `U5` `?demo=1`：流程與畫面同現在（「開始辨識」→ 假辨識草稿），沒有 `/functions/v1/` 請求

  Run: `node <scratchpad>/ai/check-ui.js` → Expected: FAIL

- [ ] **Step 2: 實作**：
  - 正式版上傳畫面按鈕照 `U1`；demo 照舊
  - `showLoading` 正式版：拿掉「原型示意」那行、加「取消」（回 `showUpload('')`）；準備 `images`（檔案 → `shrink(src, true)` → base64；網址 → `{ url }`；`shrink` 為 `null` 的記下序號）；呼叫 `MD.recognize`，60 秒逾時視同失敗；每個 `await` 後檢查 `token` 與 `dlg.open`
  - 成功：`rows = D.mergeRecognized(old ? D.fromSections(old.sections) : [], result.rows)`；前端讀不到的序號＋回應 `failed`（換回原序號）合起來顯示讀不到的提示
  - 新增錯誤畫面 `showFail(code)`：`quota`／`empty`／`not_configured`（含 404）／其他 對應固定文字；`no_images` 顯示照片讀不到那句；`passcode` 不進這畫面，直接 `showUpload('')`
  - `showDraft`：用一個變數記「這份草稿是辨識來的」決定提示文字；`oldPrice` 顯示成 `span.mdraft__old`，輸入後跟 `uncertain` 一起清掉；讀不到照片的提示放在提示文字下面
  - 檔案開頭註解改成正式版也有 AI 辨識
  - `style.css` 加 `.mdraft__old`（小字、次要色，沿用現有變數）

- [ ] **Step 3: 跑 `check-ui.js`，並看手機寬度（390px）草稿畫面的截圖，原價提示不撐破列** → Expected: 全部 PASS

- [ ] **Step 4: Commit** `feat: menu lightbox uses AI recognition in live mode`

---

### Task 5: 部署說明與真機驗收

**Files:**
- Modify: `supabase/README.md`、`docs/specs/2026-10-22-critieat-menu-ai-design.md`（狀態行）
- Test: `<scratchpad>/ai/check-real.sh`

**Interfaces:**
- Consumes: Task 2 的函式、Task 4 的畫面

- [ ] **Step 1: 寫 README ⑧「菜單 AI 辨識」**：用 Dashboard 網頁操作（使用者沒有 Supabase CLI）：
  1. aistudio.google.com 申請 API key，**不要替專案綁帳單**
  2. Dashboard → Edge Functions → Secrets 新增 `GEMINI_API_KEY`（可選 `GEMINI_MODEL`）
  3. Edge Functions → Deploy a new function → 名稱 `menu-recognize` → 貼上 `supabase/functions/menu-recognize/index.ts` 全文 → Deploy
  4. 函式設定關掉 **Verify JWT**（理由：publishable key 不是 JWT；由通關碼把關）
  5. 更新函式：同一頁貼上新版再 Deploy
  6. 提醒：免費方案的內容可能被 Google 用來改進模型；額度用完網站會提示，隔一段時間恢復
  先照目前 Dashboard 實際介面確認每一步的按鈕名稱（WebFetch Supabase 文件），對不上就照實際改

- [ ] **Step 2: 請使用者照 README 申請 key、設 secret、部署**（Claude 不經手 key）

- [ ] **Step 3: 寫並跑 `check-real.sh`**：`curl` 正式函式網址：不帶碼 → 403；錯碼 → 403；`CODE` 環境變數帶正確碼、送一張 scratchpad 的測試菜單圖 → 200 且 `rows` 非空。回應裡沒有 `GEMINI` 字樣或 key

- [ ] **Step 4: 真機驗收（spec「驗收」）**：使用者提供 2–3 張真實菜單照片（至少一張手機拍、一張 Google Maps 截圖），在正式網址實際跑一次，含一家已有菜單的店；儲存後確認品項評分還在。瀏覽器網路紀錄看不到 key

- [ ] **Step 5: spec 狀態改成「已實作（日期）」；Commit** `docs: menu AI recognition setup steps`
