# CRITIEAT 的 Supabase 設定

正式版的店家、菜單、同事名單、菜單照片、開團單與評分都存在 Supabase（免費方案，Tokyo）。

## ① 建立資料表（只做一次）

1. 打開 Supabase Dashboard → 你的專案 → 左側 **SQL Editor** → **New query**
2. 把 `001_phase1.sql` 整份貼上，按 **Run**
3. 看到 `Success. No rows returned` 就好
4. ⚠️ 已經設過通關碼（⑥）之後若重跑 `001_phase1.sql`，通關碼保護會被拿掉：**跑完一定要接著再跑一次 `002_passcode.sql`**（通關碼本身不會變）

## ② 給網站連線資訊

Project Settings → **API Keys**（或 Data API）：

- **Project URL**：`https://xxxx.supabase.co`
- **Publishable key**：`sb_publishable_…`（舊版介面叫 **anon**）

填進 `proto/v1/js/config.js` 的 `supabaseUrl`、`supabaseKey`。這兩個本來就是公開的。
⚠️ **Secret key**（`sb_secret_…`，舊版叫 **service_role**）絕對不要貼到任何地方，它能繞過所有權限。

## ③ 專案被暫停時

免費方案連續 7 天沒人用會自動暫停，網站會顯示「店家資料讀取失敗」。
到 Dashboard 打開專案，按 **Restore project**，等幾分鐘就恢復，資料不會不見。

## ④ 備份

Table Editor → 點 `stores`（或 `menus`、`members`、`lunch_cards`、`lunch_votes`、`lunch_items`、`store_ratings`、`item_ratings`）→ 右上 **Export** → **Export to CSV**。
菜單照片在 Storage → `menu-photos`，需要時可整個資料夾下載。

## ⑤ 增刪同事

Table Editor → `members` → 新增或刪除一列。`sort` 是名單順序（數字小的在前）。

## ⑥ 團隊通關碼（只擋修改）

1. SQL Editor 貼上 `002_passcode.sql` 整份執行
2. 設定通關碼：在 SQL Editor 執行（把 `abc123` 換成你要的碼）

   ```sql
   insert into team_secret (id, code) values (1, 'abc123') on conflict (id) do update set code = excluded.code;
   ```

   通關碼只能用**英文字母、數字和一般符號**（不能有中文或空白）。
3. **更換通關碼**：同一行換個碼再執行一次。同事下次修改資料時網站會再問一次。

看資料不需要通關碼；新增／修改／刪除開團單與評分、修改店家與菜單、上傳照片才需要。店家與菜單不能刪除。

## ⑦ 第二階段資料表（開團單、評分；只做一次）

1. SQL Editor 貼上 `003_phase2.sql` 整份執行（要先跑過 ① 和 ⑥）
2. 看到 `Success. No rows returned` 就好。可重複執行，不會動到通關碼
3. 這份也會把開團單三張表加進 Realtime，網頁才能即時看到別人的變動

## ⑧ 菜單 AI 辨識（Gemini 免費方案；只做一次）

上傳菜單照片後按「開始辨識」，由 Edge Function `menu-recognize` 把照片交給 Google Gemini 讀出品項。全部在網頁上操作，不用裝任何工具。

1. **申請 Gemini API key**：打開 [Google AI Studio](https://aistudio.google.com/) → **Get API key** → **Create API key**。
   ⚠️ **不要替這個 key 所在的 Google Cloud 專案設定帳單（Billing）**。沒綁帳單就只會用免費方案，額度用完只是暫時不能辨識，不會扣錢。
2. **把 key 存進 Supabase**：Dashboard → **Edge Functions** → **Secrets**（`supabase.com/dashboard/project/_/functions/secrets`）
   - Key 填 `GEMINI_API_KEY`，Value 貼上剛剛的 key，按 **Save**
   - （選用）想換模型時再加 `GEMINI_MODEL`，例如 `gemini-3.6-flash`；沒設就用程式裡的預設值
   - key 只存在這裡，不要貼到檔案、LINE 或任何對話裡
3. **部署函式**：Dashboard → **Edge Functions** → **Deploy a new function** → **Via Editor**
   - 函式名稱填 `menu-recognize`（要一字不差，網站用這個名字呼叫）
   - 把編輯器裡的範例全部刪掉，貼上 repo 裡 `supabase/functions/menu-recognize/index.ts` 的全文
   - 按 **Deploy function**
4. **關掉 JWT 驗證**：打開 `menu-recognize` 函式 → 設定（Details／Settings）裡的 **Verify JWT**（或 **Enforce JWT verification**）開關 → 關掉並儲存。
   原因：網站用的 publishable key 不是 JWT，開著會被擋；改由團隊通關碼把關（沒有正確通關碼的請求函式會直接拒絕，也不會呼叫 Gemini）。
5. **更新函式**（之後程式有改時）：點 `menu-recognize` → 貼上新版全文 → **Deploy updates**。編輯器沒有版本紀錄，舊版以 repo 為準。

注意：
- Gemini 免費方案送出的內容（菜單照片）可能被 Google 拿去改進產品；菜單本來就是公開資訊。
- 額度用完時網站會提示「免費辨識次數暫時用完了」，過一陣子（每分鐘或每天的上限重置後）就能再用，期間可以直接手動輸入。
- 網站顯示「辨識功能還沒設定好」：檢查第 2 步的 secret 名稱與第 3 步的函式名稱。
