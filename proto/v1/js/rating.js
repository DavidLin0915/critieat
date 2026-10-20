(function (CE) {
  'use strict';

  // 評分純邏輯：不碰 DOM、不碰 localStorage。店家評分與品項評分共用，差在「評分對象」欄位。
  // 操作都是「舊的 db → 新的 db」，不修改傳入的物件。db: { ratings: Rating[] }
  // Rating: { [field], member, stars（0.5～5、每 0.5 一級）, comment（最多 50 字，可為空字串）, updatedAt（ISO）, ...其他欄位 }
  //   店家評分 field = 'storeId'；品項評分 field = 'itemId'，另有 storeId、itemName、itemNote（評分當時的快照）
  // 字數以字串長度計，和 <input maxlength> 一致。

  const MAX_COMMENT = 50;

  function isValidStars(v) {
    return typeof v === 'number' && v >= 0.5 && v <= 5 && Number.isInteger(v * 2);
  }

  function normalizeComment(v) {
    return String(v == null ? '' : v).trim();
  }

  function formatStars(n) {
    return n.toFixed(1);
  }

  // 台灣時間 'MM/DD'
  function dateLabel(iso) {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(iso));
    const get = t => p.find(x => x.type === t).value;
    return get('month') + '/' + get('day');
  }

  function ratingKit(field, extraValid) {
    const str = v => typeof v === 'string';
    const keyOf = r => r[field] + '\n' + r.member;

    function isValidRating(r) {
      return !!r && typeof r === 'object' &&
        str(r[field]) && r[field] !== '' && str(r.member) && r.member !== '' &&
        isValidStars(r.stars) && str(r.comment) && r.comment.length <= MAX_COMMENT &&
        str(r.updatedAt) && !Number.isNaN(Date.parse(r.updatedAt)) &&
        (!extraValid || extraValid(r));
    }

    // 每筆格式正確，而且同一人對同一個對象最多一筆
    function isValidDb(db) {
      if (!db || typeof db !== 'object' || !Array.isArray(db.ratings)) return false;
      if (!db.ratings.every(isValidRating)) return false;
      return new Set(db.ratings.map(keyOf)).size === db.ratings.length;
    }

    // 平均四捨五入到小數 1 位。星數都是 0.5 的倍數，先換成「半星數」的整數再算，避免浮點誤差
    function summary(ratings, id) {
      const list = ratings.filter(r => r[field] === id);
      if (list.length === 0) return null;
      const halves = list.reduce((sum, r) => sum + Math.round(r.stars * 2), 0);
      return { avg: Math.round(halves * 5 / list.length) / 10, count: list.length };
    }

    function find(db, id, member) {
      return db.ratings.find(r => r[field] === id && r.member === member) || null;
    }

    // 該對象其他人的評分，新到舊；exclude 傳空字串表示全部
    function others(db, id, exclude) {
      return db.ratings
        .filter(r => r[field] === id && r.member !== exclude)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    }

    function upsert(db, rating) {
      if (!isValidRating(rating)) throw new Error('評分格式不正確');
      const key = keyOf(rating);
      return { ratings: db.ratings.filter(r => keyOf(r) !== key).concat([Object.assign({}, rating)]) };
    }

    function remove(db, id, member) {
      return { ratings: db.ratings.filter(r => !(r[field] === id && r.member === member)) };
    }

    // 大家推：items（照菜單順序）中平均 ≥ min 的，平均高→低、人數多→少、菜單順序，取前 n
    function top(ratings, items, min, n) {
      return items
        .map((item, i) => ({ item, i, s: summary(ratings, item.id) }))
        .filter(x => x.s && x.s.avg >= min)
        .sort((a, b) => b.s.avg - a.s.avg || b.s.count - a.s.count || a.i - b.i)
        .slice(0, n)
        .map(x => ({ item: x.item, avg: x.s.avg, count: x.s.count }));
    }

    return {
      MAX_COMMENT, isValidStars, isValidRating, isValidDb, normalizeComment,
      summary, formatStars, find, others, upsert, remove, dateLabel, top,
    };
  }

  CE.ratingKit = ratingKit;
  CE.rating = ratingKit('storeId');
  CE.itemRating = ratingKit('itemId', r =>
    typeof r.storeId === 'string' && r.storeId !== '' &&
    typeof r.itemName === 'string' && r.itemName !== '' && typeof r.itemNote === 'string');
})(globalThis.CE = globalThis.CE || {});
