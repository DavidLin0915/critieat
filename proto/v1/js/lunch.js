(function (CE) {
  'use strict';

  // 開團單純邏輯：不碰 DOM、不碰 localStorage。
  // 所有操作都是「舊的 cards 陣列 → 新的 cards 陣列」，不修改傳入的物件；不合法的操作丟出 Error（訊息給使用者看）。
  // 依賴 hours.js 的 CE.parseTime / CE.formatMin。

  const STATUSES = ['proposed', 'ordering', 'closed'];
  const STATUS_RANK = { ordering: 0, proposed: 1, closed: 2 };
  let seq = 0;

  // 加 4 碼隨機尾碼：多台電腦同一毫秒建立也不會撞號
  function newId(prefix, now) {
    seq += 1;
    const tail = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');
    return prefix + now.getTime().toString(36) + seq.toString(36) + tail;
  }

  function clone(card) {
    return Object.assign({}, card, {
      voters: card.voters.slice(),
      items: card.items.map(it => Object.assign({}, it)),
    });
  }

  function find(cards, id) {
    const card = cards.find(c => c.id === id);
    if (!card) throw new Error('找不到這張午餐卡');
    return card;
  }

  // 以 id 替換一張卡片，回傳新陣列
  function replace(cards, card) {
    return cards.map(c => (c.id === card.id ? card : c));
  }

  // 台灣時間的今天 'YYYY-MM-DD'
  function todayStr(now) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
  }

  // 台灣時間現在是幾點，以分鐘表示
  function nowMinutes(now) {
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const get = t => Number(p.find(x => x.type === t).value);
    return get('hour') * 60 + get('minute');
  }

  // 價格欄：空白 → null；0 以上整數 → number；其他 → undefined（表示格式錯誤）。全形數字（中文輸入法）視同半形。
  function parsePrice(v) {
    const s = String(v == null ? '' : v).trim().replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    if (s === '') return null;
    return /^\d+$/.test(s) ? Number(s) : undefined;
  }

  // 檢查「我的餐點」編輯列。rows: [{ name, price, note }]（price 可為字串）
  // 回傳與 rows 等長的陣列，每列為 null（沒問題）或錯誤訊息
  function validateRows(rows) {
    return rows.map(r => {
      if (String(r.name == null ? '' : r.name).trim() === '') return '請填餐點名稱';
      if (parsePrice(r.price) === undefined) return '價格請填 0 以上的整數，或留空';
      return null;
    });
  }

  // 目前身分在這張卡片上可以做哪些事
  function can(card, actor) {
    const isOwner = !!actor && card.owner === actor;
    const st = card.status;
    return {
      vote: !!actor && st === 'proposed' && actor !== card.proposer,
      start: !!actor && st === 'proposed' && card.voters.includes(actor),
      edit: !!actor && (st === 'ordering' || st === 'closed'),
      postpone: isOwner && st === 'ordering',
      close: isOwner && st === 'ordering',
      payer: !!actor && st === 'closed',
      cancel: !!actor && (st === 'proposed' ? card.proposer === actor : st === 'ordering' && isOwner),
    };
  }

  function deny(ok, msg) {
    if (!ok) throw new Error(msg);
  }

  // 建立卡片。opts: { store: { id, name }, note, mode: 'propose' | 'open', actor, closeAt, pickupAt, now }
  // 回傳 { cards, id }
  function createCard(cards, opts) {
    deny(!!opts.actor, '請先選擇你是誰');
    deny(!!(opts.store && opts.store.id), '請選擇店家');
    deny(opts.mode === 'propose' || opts.mode === 'open', '未知的建立方式');
    const open = opts.mode === 'open';
    const card = {
      id: newId('c', opts.now),
      date: todayStr(opts.now),
      storeId: opts.store.id,
      storeName: opts.store.name,
      status: open ? 'ordering' : 'proposed',
      proposer: opts.actor,
      owner: open ? opts.actor : '',
      note: String(opts.note || '').trim(),
      voters: [opts.actor],
      closeAt: opts.closeAt,
      pickupAt: opts.pickupAt,
      payer: open ? opts.actor : '',
      createdAt: opts.now.toISOString(),
      closedAt: '',
      changedAfterClose: false,
      items: [],
    };
    return { cards: cards.concat([card]), id: card.id };
  }

  // +1 或取消 +1
  function toggleVote(cards, id, actor) {
    const card = clone(find(cards, id));
    deny(can(card, actor).vote, '現在不能 +1');
    card.voters = card.voters.includes(actor)
      ? card.voters.filter(v => v !== actor)
      : card.voters.concat([actor]);
    return replace(cards, card);
  }

  // 提議中 → 點餐中，按的人成為開單者與預設付錢者
  function startOrdering(cards, id, actor) {
    const card = clone(find(cards, id));
    deny(can(card, actor).start, '只有提議者或 +1 的人可以開始點餐');
    card.status = 'ordering';
    card.owner = actor;
    card.payer = actor;
    return replace(cards, card);
  }

  function sameRow(a, b) {
    return a.name === b.name && a.price === b.price && a.note === b.note && (a.menuItemId || '') === (b.menuItemId || '');
  }

  // 用編輯區送出的列取代 actor 自己的點餐列。
  // rows: [{ id?, name, price, note, menuItemId? }]；有 id 且屬於 actor 的列視為修改，沒有 id 視為新增，原有但沒送出的列視為刪除。
  // 已收單時：新增或有改動的列 afterClose = true；有任何新增、修改、刪除就把卡片 changedAfterClose 設為 true。
  function setItems(cards, id, actor, rows, now) {
    const card = clone(find(cards, id));
    deny(can(card, actor).edit, '現在不能修改餐點');
    const errors = validateRows(rows);
    deny(errors.every(e => e === null), '餐點有欄位需要修正');

    const closed = card.status === 'closed';
    const mine = new Map(card.items.filter(it => it.member === actor).map(it => [it.id, it]));
    let changed = false;
    const next = rows.map(r => {
      const row = {
        name: String(r.name).trim(),
        price: parsePrice(r.price),
        note: String(r.note == null ? '' : r.note).trim(),
      };
      if (typeof r.menuItemId === 'string' && r.menuItemId) row.menuItemId = r.menuItemId;
      const old = r.id ? mine.get(r.id) : null;
      if (old) {
        mine.delete(r.id);
        if (sameRow(old, row)) return old;
        changed = true;
        const merged = Object.assign({}, old, row, { updatedAt: now.toISOString(), afterClose: old.afterClose || closed });
        if (!row.menuItemId) delete merged.menuItemId;
        return merged;
      }
      changed = true;
      return Object.assign({ id: newId('i', now), member: actor }, row, { updatedAt: now.toISOString(), afterClose: closed });
    });
    if (mine.size > 0) changed = true; // 有列被刪除

    // 保留其他人的列；actor 的列放在 actor 原本第一列的位置（沒有的話放最後）
    const firstIdx = card.items.findIndex(it => it.member === actor);
    const others = card.items.filter(it => it.member !== actor);
    const insertAt = firstIdx === -1
      ? others.length
      : card.items.slice(0, firstIdx).filter(it => it.member !== actor).length;
    card.items = others.slice(0, insertAt).concat(next, others.slice(insertAt));
    if (closed && changed) card.changedAfterClose = true;
    return replace(cards, card);
  }

  // 延後收單（預設 10 分鐘）
  function postpone(cards, id, actor, minutes) {
    const card = clone(find(cards, id));
    deny(can(card, actor).postpone, '只有開單者可以延後收單');
    const base = CE.parseTime(card.closeAt);
    card.closeAt = CE.formatMin((base === null ? 0 : base) + (minutes || 10));
    return replace(cards, card);
  }

  function close(cards, id, actor, now) {
    const card = clone(find(cards, id));
    deny(can(card, actor).close, '只有開單者可以收單');
    card.status = 'closed';
    card.closedAt = now.toISOString();
    return replace(cards, card);
  }

  function setPayer(cards, id, actor, payer) {
    const card = clone(find(cards, id));
    deny(can(card, actor).payer, '收單後才能設定付錢者');
    deny(!!payer, '請選擇付錢者');
    card.payer = payer;
    return replace(cards, card);
  }

  function cancel(cards, id, actor) {
    const card = find(cards, id);
    deny(can(card, actor).cancel, '只有開單者（提議中為提議者）可以取消');
    return cards.filter(c => c.id !== id);
  }

  // 只留今天的卡片，排序：點餐中 → 提議中 → 已收單，同狀態依建立時間
  function cardsForDay(cards, day) {
    return cards
      .filter(c => c.date === day)
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.createdAt.localeCompare(b.createdAt));
  }

  // 有卡片的日期，新到舊、不重複
  function cardDays(cards) {
    return Array.from(new Set(cards.map(c => c.date))).sort().reverse();
  }

  // member 在 storeId 這家店、beforeDate 之前最近一次的點餐：{ date, items } 或 null
  function lastOrder(cards, storeId, member, beforeDate) {
    let best = null;
    cards.forEach(c => {
      if (c.storeId !== storeId || c.date >= beforeDate) return;
      const items = c.items.filter(it => it.member === member);
      if (items.length === 0) return;
      if (!best || c.date > best.card.date || (c.date === best.card.date && c.createdAt > best.card.createdAt)) best = { card: c, items };
    });
    return best && { date: best.card.date, items: best.items };
  }

  // 每人一筆：{ member, items, subtotal }；subtotal 為有填價格的列加總，全部沒填為 null。依第一次出現的順序。
  function memberTotals(card) {
    const map = new Map();
    card.items.forEach(it => {
      if (!map.has(it.member)) map.set(it.member, { member: it.member, items: [], subtotal: null });
      const m = map.get(it.member);
      m.items.push(it);
      if (it.price !== null) m.subtotal = (m.subtotal || 0) + it.price;
    });
    return Array.from(map.values());
  }

  // 合計：{ people, count, known, missing }；known 為已填價格加總，missing 為沒填價格的列數
  function totals(card) {
    const people = new Set(card.items.map(it => it.member)).size;
    const priced = card.items.filter(it => it.price !== null);
    return {
      people,
      count: card.items.length,
      known: priced.reduce((s, it) => s + it.price, 0),
      missing: card.items.length - priced.length,
    };
  }

  // 訂餐彙總：品項名稱與備註都相同的列合併。lines: [{ name, note, qty, price }]，price 為已填價格加總，全沒填為 null
  function summary(card) {
    const map = new Map();
    card.items.forEach(it => {
      const key = it.name + '\u0000' + it.note;
      if (!map.has(key)) map.set(key, { name: it.name, note: it.note, qty: 0, price: null });
      const line = map.get(key);
      line.qty += 1;
      if (it.price !== null) line.price = (line.price || 0) + it.price;
    });
    return Object.assign({ lines: Array.from(map.values()) }, totals(card));
  }

  // 合計的顯示文字，例如「4 人 $395」「3 人 已知 $230（2 項未填價格）」「2 人」
  function totalLabel(t) {
    if (t.count === 0) return '還沒有人點餐';
    if (t.missing === 0) return `${t.people} 人 $${t.known}`;
    if (t.missing === t.count) return `${t.people} 人（未填價格）`;
    return `${t.people} 人 已知 $${t.known}（${t.missing} 項未填價格）`;
  }

  // 複製用的彙總純文字
  function summaryText(card) {
    const s = summary(card);
    const [, m, d] = card.date.split('-').map(Number);
    const out = [`${card.storeName} ${m}/${d}`];
    s.lines.forEach(l => out.push(`${l.name}${l.note ? `（${l.note}）` : ' '}×${l.qty}`));
    let last = `共 ${s.count} 項`;
    if (s.missing === 0 && s.count > 0) last += `　$${s.known}`;
    else if (s.missing < s.count) last += `　已知 $${s.known}`;
    out.push(last);
    return out.join('\n');
  }

  // +1 了但還沒有點餐的人（點餐中、已收單才有意義）
  function pending(card) {
    const ordered = new Set(card.items.map(it => it.member));
    return card.voters.filter(v => !ordered.has(v));
  }

  // 收單倒數：{ overdue, minutes }；minutes 為距離收單還有幾分鐘（overdue 時為 0）
  function countdown(card, now) {
    const close = CE.parseTime(card.closeAt);
    const left = close === null ? 0 : close - nowMinutes(now);
    return { overdue: left < 0, minutes: Math.max(left, 0) };
  }

  // 檢查從 localStorage 讀回來的資料格式
  function isValidDb(db) {
    if (!db || typeof db !== 'object') return false;
    if (!Array.isArray(db.members) || !db.members.every(m => typeof m === 'string')) return false;
    if (!Array.isArray(db.cards)) return false;
    const str = v => typeof v === 'string';
    return db.cards.every(c =>
      c && str(c.id) && str(c.date) && STATUSES.includes(c.status) &&
      str(c.storeId) && str(c.storeName) && str(c.proposer) && str(c.owner) && str(c.payer) && str(c.note) &&
      str(c.closeAt) && str(c.pickupAt) && str(c.createdAt) && !Number.isNaN(Date.parse(c.createdAt)) &&
      Array.isArray(c.voters) && c.voters.every(str) && Array.isArray(c.items) &&
      c.items.every(it => it && typeof it.id === 'string' && typeof it.member === 'string' &&
        typeof it.name === 'string' && (it.price === null || Number.isInteger(it.price)) && (it.menuItemId === undefined || typeof it.menuItemId === 'string'))
    );
  }

  CE.lunch = {
    todayStr, nowMinutes, parsePrice, validateRows, can,
    createCard, toggleVote, startOrdering, setItems, postpone, close, setPayer, cancel,
    cardsForDay, cardDays, lastOrder, memberTotals, totals, totalLabel, summary, summaryText, pending, countdown, isValidDb,
  };
})(globalThis.CE = globalThis.CE || {});
