# CRITIEAT 的 Supabase 設定

正式版的店家、菜單、同事名單與菜單照片都存在 Supabase（免費方案，Tokyo）。

## ① 建立資料表（只做一次）

1. 打開 Supabase Dashboard → 你的專案 → 左側 **SQL Editor** → **New query**
2. 把 `001_phase1.sql` 整份貼上，按 **Run**
3. 看到 `Success. No rows returned` 就好（重複執行也沒關係）

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

Table Editor → 點 `stores`（或 `menus`、`members`）→ 右上 **Export** → **Export to CSV**。
菜單照片在 Storage → `menu-photos`，需要時可整個資料夾下載。

## ⑤ 增刪同事

Table Editor → `members` → 新增或刪除一列。`sort` 是名單順序（數字小的在前）。
