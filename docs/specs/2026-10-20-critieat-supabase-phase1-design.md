# CRITIEAT 正式上線第一階段（GitHub Pages ＋ Supabase：共用店家與菜單） 設計

日期：2026-10-20　狀態：已實作並上線（2026-10-20）https://critieat.github.io/

## 目的

目前 proto/v1 所有資料都存在各自瀏覽器的 localStorage，只能在使用者自己電腦的 `localhost:8000` 打開，同事無法一起用。
這次讓團隊（約 10 人）用同一個網址正式使用，資料共用。

使用者最想要的日常情境（2026-10-20）：「想午餐要吃什麼、開團單，大家一起點餐、看誰付錢」。
使用者把正式上線拆成兩階段：

1. **第一階段（本文件）**：大家都能用美食地圖、公車地圖，並共用新增的店家與菜單。
2. **第二階段（另寫 spec）**：開團單共用（含評分，見下）。

## 決定事項（2026-10-20 與使用者確認）

| 項目 | 決定 |
|---|---|
| 前端主機 | GitHub Pages（免費，repo 公開） |
| 資料後端 | Supabase 免費方案（資料庫＋檔案空間）。使用者接受「連續 7 天沒人用會暫停、要手動恢復」 |
| 網址 | 不要有 `/proto/v1`。2026-10-20 改為 GitHub 組織 `critieat` 的 repo `critieat.github.io` → **`https://critieat.github.io/`** 就是美食地圖首頁（放在根目錄，Google Places 只送網域當 referer 也對得上金鑰限制） |
| 店家初始資料 | **不搬 `data.js` 的 10 家店**。正式版一開始店家清單是空的，使用者自己用「新增店家」（Google 帶入）一家家加 |
| 共用範圍 | 店家（新增／編輯／移除）、菜單（品項＋照片） |
| 防護 | 先不設防，讓地圖先能用；**團隊通關碼放在第一階段最後一步**再加 |
| 費用 | 全部維持免費額度內；不接需付費的服務 |
| 本機預覽 | 兩種模式：`localhost:8000` 平常跟正式版一樣連 Supabase；網址加 `?demo=1` 是現在完整的 proto（示範資料、開團單、評分），完全不碰 Supabase，給第二階段開發用（2026-10-20） |
| 通關碼範圍 | 只擋「改」：任何人都能看地圖、菜單、照片；新增／編輯／移除店家與存菜單時才要通關碼（2026-10-20） |

## Claude 的決定（已向使用者說明，使用者未反對；請在審 spec 時確認）

- **評分放第二階段**：店家評分、品項評分都跟開團單一起共用（品項評分的入口之一就是已收單的團單）。
- **菜單 AI 辨識不接**：第一階段只有手動輸入品項＋上傳照片。現有「上傳→辨識中→草稿」的假辨識流程不出現在正式版（改成直接進可編輯的空白／既有草稿）。
- **用 proto/v1 這套程式當正式版**，只把存資料的地方換掉。團隊原本路線是 proto → Nuxt 3 改寫；這次為了快上線先用 proto，Nuxt 改寫之後另議（資料表欄位照未來 DB 命名，屆時好搬）。
- **第一階段正式版不顯示開團單與評分**：導覽列拿掉「開團單」、店家詳情不顯示評分區、菜單燈箱不顯示品項評分欄與「大家推」，免得同事以為能用但資料彼此看不到。轉盤的「排除近 3 天開過團的店」選項在正式版隱藏（沒有共用團單資料）。
- **成員名單換成真實同事**（「選名字」用）。名單放在 Supabase 的 `members` 表（使用者可在 Supabase 後台直接增刪），不做管理畫面。
- **示範資料不進正式版**：`data.js`、`menu-demo.js`、`lunch-demo.js`、`rating-demo.js`、`item-rating-demo.js` 的內容與「重置示範資料」按鈕都不出現在正式版。
- **本機一般模式連的是同一個 Supabase**：使用者在 `localhost:8000`（非 demo）測試會寫到正式資料，可接受；要分開再加第二個 Supabase 專案。
- **demo 模式不寫回正式資料**：`?demo=1` 下所有讀寫照舊用 localStorage 與示範檔；示範 ID（R001–R010）只存在 demo 模式，不會跟正式資料混到。demo 模式要在畫面上明顯標示「示範模式」。

## 範圍

### 要做

1. **Supabase 專案與資料表**：`stores`、`menus`（或 `menus` ＋ `menu_items`，由 builder 決定）、`members`；Storage bucket 放菜單照片。
2. **店家改讀寫 Supabase**：`CE.storeRepo` 改為從 Supabase 讀寫；所有讀店家的頁面（美食地圖、轉盤、公車地圖、店家燈箱）行為不變。
3. **部署到 GitHub Pages**：建立 git repo、推上 GitHub、讓 `proto/v1` 的內容出現在網站根目錄。Google Maps key 加入 GitHub Pages 網址的參照網址限制（使用者在 Google Cloud Console 操作，Claude 提供步驟）。
4. **菜單改讀寫 Supabase**：品項存資料表，照片上傳到 Storage（不再存 data URL）。
5. **團隊通關碼**（最後做）：見下方「防護」。

建議順序如上，每做完一步使用者就能驗收：做完 1–3 地圖就能正式用（第 2 步完成前網站上店家是空的也沒關係）。

### 不做

- 開團單、店家評分、品項評分共用（第二階段）
- 菜單 AI 辨識、Claude API
- 搬 `data.js` 舊資料、`tools/backfill.html` 不上正式版
- 登入／帳號／權限分級（只有選名字，最後加通關碼）
- 即時同步（別人改了，重新整理後看到即可；見下）
- Nuxt 改寫、Laravel API

### 反目標（做到了也算失敗）

- 同事打開網址看到示範店家、示範菜單或假的團單／評分
- 網站上出現看似可用、其實資料不共用的功能
- 產生任何費用（包括被盜用 Maps key 或超過 Supabase 免費額度）
- 本機 `localhost:8000` 預覽壞掉，或 `?demo=1` 的完整 proto 壞掉
- demo 模式的操作寫進正式 Supabase

## 資料

沿用現有前端資料形狀（`js/store-edit.js` 的 `isValidStore`、`js/menu-data.js` 的 Menu），資料表欄位用 snake_case，前端轉換。

### stores

對應現有 Store：`id`（沿用 `R001` 格式，由前端 `nextId` 產生或改由 DB 產生，builder 決定，但要避免兩人同時新增撞號）、`name`、`category`（7 種固定分類）、`area`、`address`、`phone`、`lat`、`lng`（可空）、`hours`（七天字串，可存 jsonb）、`links`（四種連結，可存 jsonb）、`note`、`place_id`（可空、唯一）、`visible`、`updated_by`、`updated_at`。

移除＝`visible = false`，不真刪（沿用 2026-10-16 store-edit spec）。`placeId` 唯一與「這家已經有了」的檢查邏輯不變。

### menus

每家店一份菜單：`store_id`、`sections`（分區＋品項）、`photos`（Storage 的路徑或公開網址）、`updated_by`、`updated_at`。
品項 ID 規則不變（同店唯一；重新上傳時「品名＋備註」相同沿用舊 ID），因為第二階段的點餐連結與品項評分要靠它。

### members

`name`（唯一）、排序用欄位。初始名單（使用者 2026-10-20 提供，依此順序）：David、Mike、雯雯、Ivy、Lexie、Renee、琬翎、老闆。前端「選名字」從這裡讀；選過的名字照舊記在瀏覽器（`critieat.me`）。

### 照片

上傳到 Supabase Storage。前端先縮圖（現有 `menu-lightbox.js` 已有 canvas 縮圖成 JPEG 0.8）再上傳，控制在免費 1GB 內。

## 前端改動要點

- 現有 `CE.storeRepo` / `CE.menuData` 是**同步**介面，Supabase 是非同步。建議：頁面啟動時先把店家（與需要的菜單）一次載入記憶體，之後讀取照舊同步；寫入改為非同步，成功後更新記憶體並照舊發出 `ce:store-change` 等事件。實際作法由 builder 決定。
- 載入中、讀取失敗、寫入失敗都要有提示（沿用現有 `warning()` / `setMsg` 樣式），寫入失敗不可讓畫面顯示成已存檔。
- Supabase 用官方 JS client（CDN 固定版本）或直接打 REST，builder 決定；Supabase 網址與 anon key 放 `js/config.js`。
- 多人同時編輯同一家店：後存的覆蓋先存的（10 人規模可接受）；不做衝突提示。
- 不做即時同步，其他人改的資料重新整理後看到。

## 部署

- 專案目前不是 git repo，要先 `git init`。repo 名稱 `critieat`，公開。
- 網站根目錄＝`proto/v1` 的內容（例如 GitHub Actions 只發布 `proto/v1` 資料夾，或其他方式，builder 決定）。`docs/`、`.superpowers/` 等不需要出現在網站上；但 repo 公開，所以整個 repo 內容都是公開的——推上去前要檢查有沒有不該公開的東西（`.superpowers/` 裡的截圖、腳本、筆記，根目錄的 Gemini 圖片等），不想公開的加進 `.gitignore`。
- Google Maps key：參照網址加入 `https://<帳號>.github.io/*`，保留 `http://localhost:8000/*`；建議設每日用量上限。
- Supabase anon key 會出現在前端，這是正常的；保護靠資料表權限（RLS）與通關碼。

## 防護（第一階段最後一步）

- 團隊通關碼**只擋寫入**：看地圖、菜單、照片不需要通關碼（讀取權限開放、照片 bucket 可公開讀）。第一次要新增／編輯／移除店家或存菜單時才跳出輸入，瀏覽器記住；之後跟現在一樣選名字就用。
- 照片上傳（Storage 寫入）跟資料表寫入一樣要受通關碼保護。
- 必須由 Supabase 端檢查（例如 RLS 搭配自訂 header、或寫入都走帶通關碼驗證的資料庫函式），不能只是前端擋畫面——看得到原始碼的人也不能繞過去改資料。
- 換通關碼不需改前端程式（存在 Supabase 裡）。
- 通關碼加上前，資料表權限先開放讀寫（使用者接受此期間的風險）；**但即使在這之前，也不開放刪除整列**（移除店家只改 `visible`），降低被整批刪掉的風險。
- 備份：Supabase 免費方案不含自動備份可下載；提供一個簡單的手動匯出方式（例如 Supabase 後台匯出 CSV 的步驟說明）。

## 驗收

- 兩個不同瀏覽器（或兩台電腦）打開 GitHub Pages 網址：A 新增店家，B 重新整理後看得到；B 編輯、A 重新整理後看到變更與「最後修改：B」。
- 菜單同上，含照片。
- 正式網址上看不到示範資料、開團單、評分。
- `localhost:8000` 一般模式顯示正式資料；`?demo=1` 顯示完整示範 proto（含開團單、評分），操作後正式資料不受影響。
- 地圖、Google 帶入、公車地圖在 GitHub Pages 網址正常。
- 通關碼加上後：沒輸入通關碼不能寫入（含直接打 Supabase API 與上傳照片）；讀取不受影響。
- 沿用團隊規則：不加測試框架；邏輯用 scratchpad 的一次性 node 腳本驗，UI 用瀏覽器驗。

## 留給 builder 決定

- Supabase 資料表的細部欄位型別、菜單是否拆表、ID 產生方式
- 用 Supabase JS client 還是 REST
- 部署方式（Actions 發布子資料夾或其他）
- 一般／demo 模式切換與隱藏開團單／評分／示範資料的作法（只要符合上面的行為）
- 通關碼的具體實作方式（只要符合上面的要求）

## 需要使用者提供／操作

- GitHub：組織 `critieat`、repo `critieat.github.io` → 網址 `https://critieat.github.io/`
- 建立 Supabase 專案（或授權 Claude 引導操作），提供專案網址與 anon key
- ~~真實同事名單~~（已提供，見 members）
- 在 Google Cloud Console 加入 GitHub Pages 網址到 Maps key 限制
