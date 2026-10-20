(function (CE) {
  'use strict';
  // 菜單草稿純邏輯：不碰 DOM、不碰 localStorage。
  // 草稿列：{ category, name, price, note, uncertain }（price 為字串，給輸入框用）

  const GENERIC = [
    ['主餐', '招牌便當', 120], ['主餐', '雞腿便當', 130, '', true], ['主餐', '排骨便當', 120],
    ['湯品', '例湯', 30], ['湯品', '味噌湯', null, '', true],
    ['小菜', '燙青菜', 40], ['小菜', '滷蛋', 15],
  ];

  // 價格欄：空白 → null；0 以上、最多一位小數 → number；其他 → undefined（格式錯誤）。全形數字視同半形。
  function parsePrice(v) {
    const s = String(v == null ? '' : v).trim()
      .replace(/[０-９．]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/^\$/, '');
    if (s === '') return null;
    return /^\d+(\.\d)?$/.test(s) ? Number(s) : undefined;
  }

  const isBlank = r => [r.category, r.name, r.price, r.note].every(v => String(v == null ? '' : v).trim() === '');

  // 回傳與 rows 等長的陣列：null（沒問題，空白列也算）或錯誤訊息
  function validate(rows) {
    return rows.map(r => {
      if (isBlank(r)) return null;
      if (String(r.name == null ? '' : r.name).trim() === '') return '請填品名';
      if (parsePrice(r.price) === undefined) return '價格請填數字（可以有一位小數），或留空';
      return null;
    });
  }

  // 草稿列 → 菜單 sections；分類空白歸到「其他」，分類順序依第一次出現
  function toSections(rows) {
    const map = new Map();
    rows.filter(r => !isBlank(r)).forEach(r => {
      const cat = String(r.category == null ? '' : r.category).trim() || '其他';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push({ name: String(r.name).trim(), price: parsePrice(r.price), note: String(r.note == null ? '' : r.note).trim() });
    });
    return Array.from(map, ([name, items]) => ({ name, items }));
  }

  function fromSections(sections) {
    const rows = [];
    sections.forEach(sec => sec.items.forEach(it => rows.push({
      category: sec.name, name: it.name, price: it.price == null ? '' : String(it.price), note: it.note || '', uncertain: false,
    })));
    return rows;
  }

  // 假的 AI 辨識結果（原型用）：有菜單就拿它當底，挑兩列標成「沒把握」、其中一列價格讀不出來；沒有就用通用範例
  function fakeRecognize(menu) {
    if (!menu || !menu.sections || menu.sections.length === 0) {
      return GENERIC.map(([category, name, price, note, uncertain]) => ({
        category, name, price: price == null ? '' : String(price), note: note || '', uncertain: !!uncertain,
      }));
    }
    const rows = fromSections(menu.sections);
    if (rows[1]) Object.assign(rows[1], { price: '', uncertain: true });
    if (rows[3]) rows[3].uncertain = true;
    return rows;
  }

  CE.menuDraft = { parsePrice, isBlank, validate, toSections, fromSections, fakeRecognize };
})(globalThis.CE = globalThis.CE || {});
