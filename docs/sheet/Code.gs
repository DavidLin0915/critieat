/**
 * CRITIEAT — 店家試算表的 Apps Script
 * 地址新增或修改時，自動用 Apps Script 內建的地址轉座標服務填入「緯度」「經度」。
 * 安裝方式見 docs/sheet/README.md。
 */

const SHEET_STORES = '店家';
const COL_ADDRESS = '地址';
const COL_LAT = '緯度';
const COL_LNG = '經度';
const NOT_FOUND = '找不到地址';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CRITIEAT')
    .addItem('補上缺少的座標', 'fillMissingCoords')
    .addItem('重新計算選取列的座標', 'recalcSelectedRows')
    .addToUi();
}

// 執行一次：建立「編輯時」觸發器（可重複執行，不會重複建立）
function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onAddressEdit')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onAddressEdit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
}

function onAddressEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_STORES) return;
  const idx = headerIndex_(sheet);
  const col = idx[COL_ADDRESS];
  if (!col || e.range.getColumn() > col || e.range.getLastColumn() < col) return;
  const multi = e.range.getNumRows() > 1;
  for (let r = Math.max(2, e.range.getRow()); r <= e.range.getLastRow(); r++) {
    geocodeRow_(sheet, r, idx);
    if (multi) Utilities.sleep(200);
  }
}

function fillMissingCoords() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_STORES);
  const idx = headerIndex_(sheet);
  const last = sheet.getLastRow();
  let filled = 0;
  for (let r = 2; r <= last; r++) {
    const address = String(sheet.getRange(r, idx[COL_ADDRESS]).getValue()).trim();
    const lat = String(sheet.getRange(r, idx[COL_LAT]).getValue()).trim();
    const lng = String(sheet.getRange(r, idx[COL_LNG]).getValue()).trim();
    if (address && (lat === '' || lng === '' || lat === NOT_FOUND)) {
      geocodeRow_(sheet, r, idx);
      filled++;
      Utilities.sleep(200);
    }
  }
  SpreadsheetApp.getActive().toast(`已處理 ${filled} 列`, 'CRITIEAT');
}

function recalcSelectedRows() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SHEET_STORES) {
    SpreadsheetApp.getUi().alert('請在「店家」工作表選取要重新計算的列');
    return;
  }
  const idx = headerIndex_(sheet);
  const range = sheet.getActiveRange();
  for (let r = Math.max(2, range.getRow()); r <= range.getLastRow(); r++) {
    geocodeRow_(sheet, r, idx);
    Utilities.sleep(200);
  }
}

function headerIndex_(sheet) {
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = {};
  header.forEach((h, i) => { idx[String(h).trim()] = i + 1; });
  [COL_ADDRESS, COL_LAT, COL_LNG].forEach(name => {
    if (!idx[name]) throw new Error(`找不到「${name}」欄位，請確認表頭`);
  });
  return idx;
}

function geocodeRow_(sheet, row, idx) {
  const address = String(sheet.getRange(row, idx[COL_ADDRESS]).getValue()).trim();
  const latCell = sheet.getRange(row, idx[COL_LAT]);
  const lngCell = sheet.getRange(row, idx[COL_LNG]);
  if (!address) {
    latCell.clearContent();
    lngCell.clearContent();
    return;
  }
  // 任何錯誤（例如呼叫次數過多）都不讓舊座標留著，改標示找不到，避免整批中斷
  try {
    const res = Maps.newGeocoder().setRegion('tw').setLanguage('zh-TW').geocode(address);
    if (res.status === 'OK' && res.results.length) {
      const loc = res.results[0].geometry.location;
      latCell.setValue(loc.lat);
      lngCell.setValue(loc.lng);
      return;
    }
  } catch (err) {
    console.error(`第 ${row} 列轉座標失敗：${err}`);
  }
  latCell.setValue(NOT_FOUND);
  lngCell.clearContent();
}
