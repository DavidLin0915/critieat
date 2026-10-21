(function (CE) {
  'use strict';
  // 開團單與資料庫之間的轉換：不碰網路、不碰 DOM。
  // fromRows：lunch_cards（嵌入 lunch_votes、lunch_items）→ Card[]（格式同 lunch.js）。
  // diff：同一份 cards 操作前後的差異 → 逐筆寫入的操作，只寫有變的列，兩個人同時操作才不會互相蓋掉。
  // Op: { kind: 'insert' | 'update' | 'delete', table, row?, patch?, match? }；update、delete 依 match 的欄位找列。

  const SELECT = 'select=*,lunch_votes(member,created_at),lunch_items(*)&order=created_at';
  const iso = v => new Date(v).toISOString();
  const byTime = (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at);

  function itemFromRow(r) {
    const it = { id: r.id, member: r.member, name: r.name, price: r.price === null ? null : Number(r.price), note: r.note };
    if (r.menu_item_id) it.menuItemId = r.menu_item_id;
    it.updatedAt = iso(r.updated_at);
    it.afterClose = !!r.after_close;
    return it;
  }

  function fromRows(rows) {
    return rows.map(r => ({
      id: r.id,
      date: r.date,
      storeId: r.store_id,
      storeName: r.store_name,
      status: r.status,
      proposer: r.proposer,
      owner: r.owner,
      note: r.note,
      voters: (r.lunch_votes || []).slice().sort(byTime).map(v => v.member),
      closeAt: r.close_at,
      pickupAt: r.pickup_at,
      payer: r.payer,
      createdAt: iso(r.created_at),
      closedAt: r.closed_at ? iso(r.closed_at) : '',
      changedAfterClose: !!r.changed_after_close,
      items: (r.lunch_items || []).slice().sort((a, b) => byTime(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(itemFromRow),
    }));
  }

  // 卡片本身的欄位（不含 voters、items）
  function cardRow(c) {
    return {
      id: c.id, date: c.date, store_id: c.storeId, store_name: c.storeName, status: c.status,
      proposer: c.proposer, owner: c.owner, note: c.note, close_at: c.closeAt, pickup_at: c.pickupAt,
      payer: c.payer, created_at: c.createdAt, closed_at: c.closedAt || null, changed_after_close: !!c.changedAfterClose,
    };
  }

  // 點餐列可改的欄位
  function itemFields(it) {
    return {
      member: it.member, name: it.name, price: it.price, note: it.note, menu_item_id: it.menuItemId || null,
      updated_at: it.updatedAt, after_close: !!it.afterClose,
    };
  }

  function changed(a, b) {
    const patch = {};
    Object.keys(b).forEach(k => { if (a[k] !== b[k]) patch[k] = b[k]; });
    return patch;
  }

  const nonEmpty = o => Object.keys(o).length > 0;

  function diff(before, after) {
    const ins = { cards: [], children: [] };
    const cardUpd = [], itemUpd = [], childDel = [], cardDel = [];
    const old = new Map(before.map(c => [c.id, c]));
    const now = new Set(after.map(c => c.id));

    after.forEach(c => {
      const o = old.get(c.id);
      if (!o) {
        ins.cards.push({ kind: 'insert', table: 'lunch_cards', row: cardRow(c) });
        c.voters.forEach(m => ins.children.push({ kind: 'insert', table: 'lunch_votes', row: { card_id: c.id, member: m, created_at: c.createdAt } }));
        c.items.forEach(it => ins.children.push({ kind: 'insert', table: 'lunch_items', row: Object.assign({ id: it.id, card_id: c.id }, itemFields(it), { created_at: it.updatedAt }) }));
        return;
      }
      const patch = changed(cardRow(o), cardRow(c));
      if (nonEmpty(patch)) cardUpd.push({ kind: 'update', table: 'lunch_cards', patch, match: { id: c.id } });

      c.voters.filter(m => !o.voters.includes(m)).forEach(m => ins.children.push({ kind: 'insert', table: 'lunch_votes', row: { card_id: c.id, member: m } }));
      o.voters.filter(m => !c.voters.includes(m)).forEach(m => childDel.push({ kind: 'delete', table: 'lunch_votes', match: { card_id: c.id, member: m } }));

      const oldItems = new Map(o.items.map(it => [it.id, it]));
      const newIds = new Set(c.items.map(it => it.id));
      c.items.forEach(it => {
        const was = oldItems.get(it.id);
        if (!was) {
          ins.children.push({ kind: 'insert', table: 'lunch_items', row: Object.assign({ id: it.id, card_id: c.id }, itemFields(it), { created_at: it.updatedAt }) });
          return;
        }
        const p = changed(itemFields(was), itemFields(it));
        if (nonEmpty(p)) itemUpd.push({ kind: 'update', table: 'lunch_items', patch: p, match: { id: it.id } });
      });
      o.items.filter(it => !newIds.has(it.id)).forEach(it => childDel.push({ kind: 'delete', table: 'lunch_items', match: { id: it.id } }));
    });
    before.filter(c => !now.has(c.id)).forEach(c => cardDel.push({ kind: 'delete', table: 'lunch_cards', match: { id: c.id } }));

    return ins.cards.concat(ins.children, cardUpd, itemUpd, childDel, cardDel);
  }

  CE.lunchSync = { SELECT, fromRows, diff };
})(globalThis.CE = globalThis.CE || {});
