# 公車資料更新說明

公車地圖（`proto/v1/bus.html`）用的是預先抓好的靜態檔 `proto/v1/js/bus-data.js`，頁面本身不會呼叫 TDX。
路線或站牌有異動時，重新產生一次即可。

## 更新資料

在 `critieat/` 目錄下執行（需要 Node 18 以上）：

```
node docs/bus/fetch-bus-data.js
```

成功會顯示路線數、站位數，並覆寫 `proto/v1/js/bus-data.js`。頁首右上角的日期會跟著變。

## TDX 呼叫次數

- 沒有金鑰也能跑，一次會呼叫 TDX 4 次。免金鑰的每日次數很少（同一個對外 IP 共用），出現「今日呼叫次數已用完」就隔天再試。
- 有 TDX 會員金鑰（<https://tdx.transportdata.tw> 免費註冊）的話，先設定環境變數再執行，就不受免金鑰的限制：

```
TDX_CLIENT_ID=你的ID TDX_CLIENT_SECRET=你的Secret node docs/bus/fetch-bus-data.js
```

金鑰只在本機抓資料時使用，不會寫進任何檔案。

- 調整腳本時請加 `--cache <資料夾>`，TDX 的原始回應會存在該資料夾，之後直接讀檔、不再重抓。

## 調整範圍

在 `fetch-bus-data.js` 開頭：

- `ANCHORS`：定義範圍的折線（目前是 昆陽站 → 南港車站 → 南港軟體園區）。
- `CORRIDOR_M`：離折線多遠以內算「入口站牌」（目前 650 公尺）。
- `AREA`：向 TDX 查詢用的外框，必須包住整個範圍。
