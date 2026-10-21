(function (CE) {
  'use strict';

  const L = CE.lunch;
  const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
  const STATUS_LABEL = { proposed: '○ 提議中', ordering: '● 點餐中', closed: '■ 已收單' };

  const state = {
    db: null,            // { members, cards }
    me: '',              // 目前身分
    day: '',             // 今天 'YYYY-MM-DD'
    viewDay: '',         // 正在看的日期；不是今天就是唯讀的歷史紀錄
    settings: null,
    stores: [],          // StoreView[]（已依今天營業狀態排序）
    selectedId: null,
    draft: [],           // 「我的餐點」編輯列 [{ id?, name, price, note }]，price 為字串
    draftFor: '',        // draft 對應的「卡片|身分」，換卡片或身分時重建
    drafts: {},          // 還沒送出的草稿，key 同 draftFor；切走再切回來時還原（只在記憶體，重新整理就沒了）
    message: '',         // 一般提示（已送出、操作失敗…），切換卡片或日期時清掉
    warning: '',         // 存檔／讀檔問題，按「知道了」或存檔成功才消失
    rowErrors: [],       // 與 draft 等長，null 或錯誤訊息
    confirmCancel: false,
    rateOpen: '',        // 已收單卡片上展開評分的那一列：'卡片ID|點餐列ID'
    copied: false,
    copyFallback: false,
    pendingNew: null,    // 從網址或選身分前要求的「提議／開單」：{ id, as }
    busy: false,         // 正式版：動作送出中，不接受下一個動作
    cardStale: false,    // 正式版：別人改了資料，但我正在中欄輸入，等離開輸入框再重畫中欄
  };

  // 所有資料一律用 textContent 寫入，不用 innerHTML
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function button(cls, text, onClick) {
    const b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function input(cls, value, placeholder, onInput) {
    const i = el('input', cls);
    i.value = value;
    i.placeholder = placeholder;
    i.setAttribute('aria-label', placeholder);
    i.addEventListener('input', e => onInput(e.target.value));
    return i;
  }

  const $ = id => document.getElementById(id);
  const now = () => new Date();
  const dayCards = () => L.cardsForDay(state.db.cards, state.viewDay);
  const selected = () => dayCards().find(c => c.id === state.selectedId) || null;
  const isPast = () => state.viewDay !== state.day;
  // 歷史紀錄唯讀：所有操作都不能做
  const READ_ONLY = { vote: false, start: false, edit: false, postpone: false, close: false, payer: false, cancel: false };
  const storeOf = card => state.stores.find(s => s.id === card.storeId) || null;
  const clock = iso => CE.formatMin(L.nowMinutes(new Date(iso)));
  const blankRow = () => ({ name: '', price: '', note: '' });
  const isBlank = r => [r.name, r.price, r.note].every(v => String(v == null ? '' : v).trim() === '');

  const SAVE_FAILED = '無法存到瀏覽器，重新整理後這次的變更會不見';
  const WRITE_FAILED = '儲存失敗，請檢查網路後再試一次';
  const LOAD_FAILED = '開團單讀取失敗，請檢查網路後重新整理';
  const GONE = '這團已經被取消了';

  function renderNotice() {
    const box = $('notice');
    box.replaceChildren();
    if (state.warning) {
      box.append(el('span', null, state.warning), button('notice__close', '知道了', () => warn('')));
      if (state.message) box.append(el('span', 'notice__msg', state.message));
    } else if (state.message) {
      box.append(el('span', null, state.message));
    }
    box.hidden = !state.warning && !state.message;
  }

  function notice(msg) { state.message = msg || ''; renderNotice(); }
  function warn(msg) { state.warning = msg || ''; renderNotice(); }

  const draftRowsOf = (card, me) => card.items.filter(it => it.member === me)
    .map(it => ({ id: it.id, name: it.name, price: it.price === null ? '' : String(it.price), note: it.note, menuItemId: it.menuItemId || '' }));
  const rowSig = r => [r.name.trim(), String(r.price).trim(), r.note.trim(), r.menuItemId || ''];
  const sameRows = (a, b) => JSON.stringify(a.filter(r => !isBlank(r)).map(rowSig)) === JSON.stringify(b.map(rowSig));

  // 離開目前的編輯區前，有改過又沒送出的草稿先收起來
  function stashDraft() {
    const key = state.draftFor;
    if (!key) return;
    const [id, me] = key.split('|');
    const card = state.db.cards.find(c => c.id === id);
    if (card && me && !sameRows(state.draft, draftRowsOf(card, me))) state.drafts[key] = state.draft;
    else delete state.drafts[key];
  }

  function resetView() {
    stashDraft();
    state.draftFor = '';
    state.rowErrors = [];
    state.confirmCancel = false;
    state.rateOpen = '';
    state.copied = false;
    state.copyFallback = false;
  }

  // 執行一個卡片操作：fn(舊 cards) → 新 cards。成功就存檔、執行 onOk、重畫；失敗顯示錯誤訊息。
  function act(fn, onOk) {
    if (CE.isDemo()) actDemo(fn, onOk);
    else actLive(fn, onOk);
  }

  function actDemo(fn, onOk) {
    let next;
    try {
      next = fn(state.db.cards);
    } catch (e) {
      notice(e.message);
      return;
    }
    state.db = Object.assign({}, state.db, { cards: next });
    if (CE.lunchStore.save(state.db)) {
      if (state.warning === SAVE_FAILED) warn('');
      notice('');
    } else {
      warn(SAVE_FAILED);
    }
    if (onOk) onOk();
    render();
  }

  // 正式版：重新抓資料庫的最新卡片。選中的卡片不見了就改選第一張並提示（quiet 裡的是自己剛取消的，不提示）
  async function pull(quiet) {
    if (!(await CE.lunchStore.refresh())) return false;
    state.db = Object.assign({}, state.db, { cards: CE.lunchStore.cards() });
    if (state.warning === LOAD_FAILED) warn('');
    const id = state.selectedId;
    if (id && !state.db.cards.some(c => c.id === id)) {
      selectFirst();
      if (!(quiet || []).includes(id)) notice(GONE);
    }
    return true;
  }

  // 正式版：先抓最新資料、用最新資料跑操作，再把差異逐筆寫進資料庫（只寫自己碰到的列）
  async function actLive(fn, onOk) {
    if (state.busy) return;
    state.busy = true;
    try {
      if (!(await pull())) { notice(WRITE_FAILED); render(); return; }
      const before = state.db.cards;
      let next;
      try {
        next = fn(before);
      } catch (e) {
        if (state.message !== GONE) notice(e.message);
        render();
        return;
      }
      const removed = before.filter(c => !next.some(n => n.id === c.id)).map(c => c.id);
      try {
        await CE.lunchStore.apply(CE.lunchSync.diff(before, next));
      } catch (e) {
        console.warn('[CRITIEAT] 開團單寫入失敗', e);
        notice(WRITE_FAILED);
        await pull();
        render();
        return;
      }
      if (!(await pull(removed))) state.db = Object.assign({}, state.db, { cards: next });
      notice('');
      if (onOk) onOk();
      render();
    } finally {
      state.busy = false;
    }
  }

  // 正式版：別人改了開團單。我正在中欄輸入時不重畫中欄（輸入框、游標、打到一半的字都留著）
  const editing = () => {
    const a = document.activeElement;
    return !!a && $('card-view').contains(a) && a.matches('input, textarea, select');
  };

  async function onRemote() {
    if (state.busy) return; // 動作做完會自己抓最新資料
    if (!(await pull())) return;
    if (editing()) {
      state.cardStale = true;
      renderHeader();
      renderList();
      renderSide();
    } else {
      state.cardStale = false;
      render();
    }
  }

  function addMember(name) {
    if (!CE.isDemo()) return; // 正式版名單在 Supabase 的 members 表
    if (state.db.members.includes(name)) return;
    state.db = Object.assign({}, state.db, { members: state.db.members.concat([name]) });
    CE.lunchStore.save(state.db);
  }

  function setMe(name) {
    addMember(name);
    resetView();
    state.me = name;
    CE.lunchStore.setMe(name);
    notice('');
    render();
    if (state.pendingNew) {
      const p = state.pendingNew;
      state.pendingNew = null;
      openNew(p);
    }
  }

  function select(id) {
    resetView();
    state.selectedId = id;
    notice('');
    render();
  }

  function selectFirst() {
    resetView();
    const first = dayCards()[0];
    state.selectedId = first ? first.id : null;
  }

  // 這張卡有我還沒送出的草稿（正在編輯的那張看畫面，其他看 drafts）
  function hasDraft(card) {
    const key = card.id + '|' + state.me;
    if (key === state.draftFor) return !sameRows(state.draft, draftRowsOf(card, state.me));
    return !!state.drafts[key];
  }

  // 換了卡片或身分時，用我目前的點餐列重建編輯區
  function syncDraft() {
    const card = selected();
    const key = (card ? card.id : '') + '|' + state.me;
    if (key === state.draftFor) return;
    state.draftFor = key;
    state.rowErrors = [];
    state.draft = state.drafts[key] || (card ? draftRowsOf(card, state.me) : []);
    if (state.draft.length === 0) state.draft.push(blankRow());
  }

  // 'YYYY-MM-DD' → '10/14（三）'
  function dayLabel(day) {
    const [, m, d] = day.split('-').map(Number);
    return `${m}/${d}（${WEEKDAY[new Date(day + 'T12:00:00Z').getUTCDay()]}）`;
  }

  // 切換到另一天（只在有午餐卡的日子與今天之間跳）
  function goDay(day) {
    state.viewDay = day;
    selectFirst();
    notice('');
    render();
  }

  // 前一天／後一天有卡片的日期，沒有就是 null；今天一定算在內
  function neighborDays() {
    const days = L.cardDays(state.db.cards).filter(d => d <= state.day);
    if (!days.includes(state.day)) days.unshift(state.day);
    const i = days.indexOf(state.viewDay);
    return { prev: days[i + 1] || null, next: i > 0 ? days[i - 1] : null };
  }

  function countdownText(card) {
    const c = L.countdown(card, now());
    if (c.overdue) return '已超過收單時間';
    return c.minutes === 0 ? '收單時間到了' : `剩 ${c.minutes} 分鐘`;
  }

  // ── 頁首 ──
  function renderHeader() {
    $('today-label').textContent = `TODAY · ${dayLabel(state.day)}`;
    $('me-btn').textContent = `👤 ${state.me || '選擇身分'} ▾`;
  }

  // ── 左欄：日期切換＋當天的卡片 ──
  function renderDayNav(box) {
    const { prev, next } = neighborDays();
    const nav = el('div', 'daynav');
    const prevBtn = button('daynav__btn', '‹', () => goDay(prev));
    prevBtn.disabled = !prev;
    prevBtn.setAttribute('aria-label', '前一個有午餐卡的日子');
    const nextBtn = button('daynav__btn', '›', () => goDay(next));
    nextBtn.disabled = !next;
    nextBtn.setAttribute('aria-label', '後一個有午餐卡的日子');
    const label = el('span', 'daynav__label mono', dayLabel(state.viewDay));
    if (!isPast()) label.append(el('span', 'daynav__today', '今天'));
    nav.append(prevBtn, label, nextBtn);
    box.append(nav);
  }

  function renderList() {
    const box = $('card-list');
    box.replaceChildren();
    renderDayNav(box);
    const list = dayCards();
    const head = el('div', 'list__head mono');
    head.append(el('span', null, `${isPast() ? '這天' : '今天'}的午餐卡 / ${list.length}`));
    box.append(head);
    if (list.length === 0) box.append(el('p', 'empty', isPast() ? '這天沒有午餐卡' : '今天還沒有人開團'));

    list.forEach(c => {
      const item = button(`item item--${c.status}`, null, () => select(c.id));
      if (c.id === state.selectedId) item.classList.add('is-selected');
      const meta = c.status === 'proposed'
        ? `${c.proposer} 提議`
        : `${c.owner} 開單 · ${c.closeAt} ${c.status === 'closed' ? '已收單' : '收單'}`;
      const count = c.status === 'proposed'
        ? `+${c.voters.length - 1}`
        : `${L.totals(c).people} 人`;
      item.append(
        el('span', 'item__name', c.storeName),
        el('span', 'item__meta', meta),
        el('span', `badge badge--${c.status}`, `${STATUS_LABEL[c.status]} · ${count}`)
      );
      if (hasDraft(c)) item.append(el('span', 'item__draft', '✎ 餐點還沒送出'));
      box.append(item);
    });

    box.append(
      isPast()
        ? button('btn btn--primary list__new', '← 回到今天', () => goDay(state.day))
        : button('btn btn--primary list__new', '＋ 提議／開單', () => openNew()),
      CE.isDemo() ? button('list__reset', '重置示範資料', resetDemo) : document.createDocumentFragment()
    );
  }

  // ── 中欄：選中的卡片 ──
  function renderCard() {
    const box = $('card-view');
    box.replaceChildren();
    const card = selected();
    if (!card) {
      if (isPast()) box.append(el('p', 'empty', '這天沒有午餐卡'));
      else box.append(el('p', 'empty', '今天還沒有人開團'), button('btn btn--primary', '＋ 提議／開單', () => openNew()));
      return;
    }
    const can = isPast() ? READ_ONLY : L.can(card, state.me);
    if (isPast()) box.append(el('p', 'lcard__past', `📅 這是 ${dayLabel(card.date)} 的紀錄，只能查看`));

    const title = el('div', 'lcard__title');
    title.append(el('h3', null, card.storeName), el('span', `badge badge--${card.status}`, STATUS_LABEL[card.status]));
    box.append(title);

    const sub = el('div', 'lcard__sub');
    if (card.status === 'proposed') {
      sub.append(el('span', null, `${card.proposer} 提議 · ${clock(card.createdAt)}`));
    } else {
      sub.append(el('span', null, `${card.owner} 開單`), el('span', 'mono', `${card.closeAt} ${card.status === 'closed' ? '已收單' : '收單'}`));
      if (card.status === 'ordering') sub.append(el('span', 'lcard__count', countdownText(card)));
      sub.append(el('span', null, `預計 ${card.pickupAt} 取餐`));
    }
    box.append(sub);
    if (card.note) box.append(el('p', 'lcard__note', `「${card.note}」`));
    box.append(el('div', 'hr'));

    if (card.status === 'proposed') renderProposal(box, card, can);
    else renderOrders(box, card, can);

    if (can.cancel) {
      const label = state.confirmCancel ? '確定取消這團？再按一次' : '取消這團';
      box.append(button(`btn btn--danger lcard__cancel${state.confirmCancel ? ' is-confirm' : ''}`, label, () => {
        if (!state.confirmCancel) { state.confirmCancel = true; renderCard(); return; }
        act(cs => L.cancel(cs, card.id, state.me), selectFirst);
      }));
    }
  }

  function renderProposal(box, card, can) {
    box.append(el('div', 'sect', `想吃的人 / ${card.voters.length}`));
    const chips = el('div', 'voters');
    card.voters.forEach(v => chips.append(el('span', 'voter', v === card.proposer ? `${v}（提議）` : v)));
    box.append(chips);

    const btns = el('div', 'btns btns--top');
    if (can.vote) {
      const voted = card.voters.includes(state.me);
      btns.append(button('btn', voted ? '取消 +1' : '＋1 我也想吃', () => act(cs => L.toggleVote(cs, card.id, state.me))));
    }
    if (can.start) btns.append(button('btn btn--primary', '開始點餐 →', () => act(cs => L.startOrdering(cs, card.id, state.me), resetView)));
    if (btns.children.length) box.append(btns);
    if (!isPast()) box.append(el('p', 'hint', '提議的人或 +1 的人可以按「開始點餐」，按的人就是開單者。'));
  }

  // 已收單卡片上自己點的一列 → 要評分的菜單品項；對不上回傳 null
  // 有 menuItemId：品項還在菜單上就用菜單的品名；下架了仍可評，用點餐列的品名當快照
  function rateTarget(card, it) {
    const D = CE.menuData;
    if (it.menuItemId) {
      const m = D.findItem(card.storeId, it.menuItemId);
      return m
        ? { id: m.id, storeId: card.storeId, name: m.name, note: m.note }
        : { id: it.menuItemId, storeId: card.storeId, name: it.name, note: it.note };
    }
    const m = D.matchItem(card.storeId, it.name, it.note);
    return m ? { id: m.id, storeId: card.storeId, name: m.name, note: m.note } : null;
  }

  function renderOrders(box, card, can) {
    const rows = L.memberTotals(card);
    if (rows.length === 0) {
      box.append(el('p', 'empty', '還沒有人點餐'));
    } else {
      const table = el('table', 'orders');
      rows.forEach(r => {
        const tr = el('tr');
        const items = el('td', 'orders__items');
        r.items.forEach(it => {
          const line = el('div', 'orders__line');
          line.append(el('span', null, it.name));
          if (it.note) line.append(el('span', 'orders__note', it.note));
          if (it.afterClose) line.append(el('span', 'tag tag--late', '收單後修改'));
          if (card.status === 'ordering' && it.price !== null) line.append(el('span', 'orders__price mono', `$${it.price}`));
          items.append(line);
          // 已收單：自己點的、對得到菜單品項的列可以評分
          const target = card.status === 'closed' && state.me && r.member === state.me ? rateTarget(card, it) : null;
          if (!target) return;
          const key = card.id + '|' + it.id;
          const open = state.rateOpen === key;
          const mine = CE.itemRatingUi.mineLabel(target.id);
          const btn = button('rbtn' + (mine ? ' is-done' : ''), mine || '☆ 評分', () => {
            state.rateOpen = open ? '' : key;
            renderCard();
          });
          btn.setAttribute('aria-expanded', String(open));
          line.append(btn);
          if (open) items.append(CE.itemRatingUi.panel(target, () => {}, { showAvg: true, hideSwitch: true }));
        });
        tr.append(
          el('td', 'orders__who', r.member),
          items,
          el('td', 'orders__sum mono', r.subtotal === null ? '—' : `$${r.subtotal}`)
        );
        table.append(tr);
      });
      box.append(table, el('div', 'orders__total', L.totalLabel(L.totals(card))));
    }

    const waiting = L.pending(card);
    if (waiting.length) box.append(el('p', 'hint', `還沒點：${waiting.join('、')}`));

    if (card.status === 'closed') {
      const row = el('label', 'payer');
      const sel = el('select', 'payer__select');
      sel.disabled = !can.payer;
      state.db.members.forEach(m => {
        const o = el('option', null, m);
        o.value = m;
        if (m === card.payer) o.selected = true;
        sel.append(o);
      });
      sel.addEventListener('change', () => act(cs => L.setPayer(cs, card.id, state.me, sel.value)));
      row.append(el('span', null, '付錢者'), sel);
      box.append(row);
    }

    if (can.edit) renderEditor(box, card);
    else if (!state.me && !isPast()) box.append(button('btn', '先選擇你是誰再點餐', () => openMe(true)));

    if (can.close) {
      const btns = el('div', 'btns btns--top');
      btns.append(
        button('btn', '延後收單 +10 分鐘', () => act(cs => L.postpone(cs, card.id, state.me, 10))),
        button('btn btn--primary', '現在收單', () => act(cs => L.close(cs, card.id, state.me, now())))
      );
      box.append(el('div', 'sect', '開單的人才看得到'), btns);
    }
  }

  // 「我上次在這家點什麼」提示：一鍵把上次的品項加進編輯區
  function renderLastOrder(wrap, card) {
    const last = L.lastOrder(state.db.cards, card.storeId, state.me, card.date);
    if (!last) return;
    const box = el('div', 'lastorder');
    const text = last.items.map(it => it.name + (it.note ? `（${it.note}）` : '') + (it.price === null ? '' : ` $${it.price}`)).join('、');
    box.append(
      el('span', 'lastorder__label', `上次 ${dayLabel(last.date)} 你點了`),
      el('span', 'lastorder__items', text),
      button('btn lastorder__btn', '帶入', () => {
        state.draft = state.draft.filter(r => !isBlank(r)).concat(last.items.map(it => ({
          name: it.name, price: it.price === null ? '' : String(it.price), note: it.note, menuItemId: it.menuItemId || '',
        })));
        state.rowErrors = [];
        renderCard();
      })
    );
    wrap.append(box);
  }

  // 上次在這家點過、對得到目前菜單的品項 ID（下拉裡標「上次點」）
  function lastItemIds(card) {
    const ids = new Set();
    const last = L.lastOrder(state.db.cards, card.storeId, state.me, card.date);
    if (!last) return ids;
    last.items.forEach(it => {
      const m = it.menuItemId
        ? CE.menuData.findItem(card.storeId, it.menuItemId)
        : CE.menuData.matchItem(card.storeId, it.name, it.note);
      if (m) ids.add(m.id);
    });
    return ids;
  }

  function renderEditor(box, card) {
    const wrap = el('div', 'editor');
    wrap.append(el('div', 'sect', `我的餐點（${state.me}）`));
    renderLastOrder(wrap, card);
    const lastIds = lastItemIds(card);
    state.draft.forEach((row, i) => {
      const r = el('div', 'editor__row' + (state.rowErrors[i] ? ' is-error' : ''));
      const price = input('editor__price', row.price, '價格', v => { row.price = v; });
      price.inputMode = 'numeric';
      const del = button('editor__del', '×', () => {
        state.draft.splice(i, 1);
        if (state.draft.length === 0) state.draft.push(blankRow());
        state.rowErrors = [];
        renderCard();
      });
      del.setAttribute('aria-label', '刪除這一項');

      // 品名欄：從菜單選了品項會標「📋 菜單」；之後手動改品名就解除連結
      const nameBox = el('div', 'editor__namebox');
      const tag = el('span', 'editor__menutag', '📋 菜單');
      const name = input('editor__name', row.name, '餐點名稱', v => {
        row.name = v;
        if (row.menuItemId) { row.menuItemId = ''; tag.remove(); nameBox.classList.remove('is-linked'); }
      });
      nameBox.append(name);
      if (row.menuItemId) { nameBox.classList.add('is-linked'); nameBox.append(tag); }
      CE.menuCombo(name, card.storeId, {
        isLast: it => lastIds.has(it.id),
        onPick(it) {
          Object.assign(row, {
            name: it.name,
            price: Number.isInteger(it.price) ? String(it.price) : '', // 開團單價格只收整數（每顆 6.5 這種留空）
            note: it.note || '',
            menuItemId: it.id,
          });
          state.rowErrors = [];
          renderCard();
          const next = document.querySelectorAll('.editor__row .editor__price')[i];
          if (next) next.focus();
        },
      });

      r.append(nameBox, price, input('editor__note', row.note, '備註（選填）', v => { row.note = v; }), del);
      wrap.append(r);
      if (state.rowErrors[i]) wrap.append(el('div', 'editor__err', state.rowErrors[i]));
    });
    const btns = el('div', 'btns btns--top');
    btns.append(
      button('btn', '＋ 再加一項', () => { state.draft.push(blankRow()); renderCard(); }),
      button('btn btn--primary', '送出', () => submitDraft(card))
    );
    wrap.append(btns);
    box.append(wrap);
  }

  function submitDraft(card) {
    const errors = state.draft.map(r => (isBlank(r) ? null : L.validateRows([r])[0]));
    if (errors.some(Boolean)) {
      state.rowErrors = errors;
      renderCard();
      return;
    }
    const rows = state.draft.filter(r => !isBlank(r));
    act(cs => L.setItems(cs, card.id, state.me, rows, now()), () => {
      delete state.drafts[state.draftFor];
      state.draftFor = '';
      resetView();
      notice('已送出');
    });
  }

  // ── 右欄：店家資訊或訂餐彙總 ──
  function renderSide() {
    const box = $('side');
    box.replaceChildren();
    const card = selected();
    if (!card) { box.hidden = true; return; }
    box.hidden = false;
    if (card.status === 'closed') renderSummary(box, card, storeOf(card));
    else renderStore(box, card, storeOf(card));
  }

  // 菜單存好、刪除或還原後：右欄按鈕文字要更新，編輯區的品名下拉也要重新掛（有沒有菜單、上次點的品項可能變了）
  document.addEventListener('ce:menu-change', () => { if (state.db) { renderSide(); renderCard(); } });

  // 身分在別處換掉（燈箱裡的評分「切換」、或另一個分頁）：開團單跟著換，評分與點餐才會是同一個人
  function followMe(name) {
    if (!state.db || !name || name === state.me) return;
    setMe(name);
  }
  document.addEventListener('ce:me-change', e => followMe(e.detail.name));
  window.addEventListener('storage', e => { if (e.key === 'critieat.me.v2') followMe(e.newValue); });

  // 品項評分存好或刪掉（這裡的面板或燈箱裡）：更新「我 ★n」按鈕
  document.addEventListener('ce:item-rating-change', () => { if (state.db) renderCard(); });

  function phoneLink(phone, label) {
    const a = el('a', 'btn', label);
    a.href = 'tel:' + phone.replace(/[^\d+]/g, '');
    return a;
  }

  function renderStore(box, card, store) {
    if (!store) {
      // 已移除的店不在 state.stores，卡片本身存了店名
      const gone = CE.storeRepo.get(card.storeId) ? '這家店已從地圖移除' : '找不到店家資料';
      box.append(el('h3', 'detail__name', card.storeName), el('p', 'empty', gone));
      return;
    }
    box.append(
      el('span', 'detail__kicker', store.category),
      el('h3', 'detail__name', store.name),
      el('span', `badge badge--${store.status}`, `今天 ${store.todayHours || '營業時間未填'}`)
    );
    const rows = el('dl', 'detail__rows');
    [['電話', store.phone], ['地址', store.address]].forEach(([k, v]) => {
      const row = el('div', 'detail__row');
      row.append(el('dt', null, k), el('dd', null, v || '—'));
      rows.append(row);
    });
    box.append(rows);
    const menuBtn = el('button', 'btn btn--primary', CE.hasMenu(store.id) ? '📋 看菜單' : '📋 菜單（尚未建立）');
    menuBtn.type = 'button';
    menuBtn.addEventListener('click', () => CE.openMenu(store));
    const link = el('a', 'btn', '在美食地圖上看這家 →');
    link.href = CE.demoHref('index.html?store=' + encodeURIComponent(store.id));
    const btns = el('div', 'btns');
    btns.append(menuBtn, link);
    box.append(btns);
  }

  function renderSummary(box, card, store) {
    const s = L.summary(card);
    box.append(
      el('span', 'detail__kicker', '訂餐彙總'),
      el('h3', 'detail__name', card.storeName),
      el('div', 'detail__sub', `取餐 ${card.pickupAt} · 付錢者 ${card.payer || '—'}`)
    );
    if (card.changedAfterClose) box.append(el('p', 'lside__warn', '收單後有修改，訂餐前請再確認'));
    if (s.count === 0) {
      box.append(el('p', 'empty', '沒有人點餐'));
    } else {
      const table = el('table', 'sum');
      s.lines.forEach(l => {
        const tr = el('tr');
        const name = el('td');
        name.append(el('span', null, l.name));
        if (l.note) name.append(el('span', 'orders__note', l.note));
        tr.append(name, el('td', 'mono', `×${l.qty}`), el('td', 'mono sum__price', l.price === null ? '—' : `$${l.price}`));
        table.append(tr);
      });
      const total = el('tr', 'sum__total');
      const price = s.missing === 0 ? `$${s.known}` : s.missing === s.count ? '—' : `已知 $${s.known}`;
      total.append(el('td', null, '合計'), el('td', 'mono', `${s.count} 項`), el('td', 'mono sum__price', price));
      table.append(total);
      box.append(table);
    }

    const btns = el('div', 'btns');
    btns.append(button('btn btn--primary', state.copied ? '已複製 ✓' : '複製彙總文字', () => copySummary(card)));
    if (store && store.phone) btns.append(phoneLink(store.phone, `📞 ${store.phone}`));
    box.append(btns);

    if (state.copyFallback) {
      const ta = el('textarea', 'copybox');
      ta.readOnly = true;
      ta.value = L.summaryText(card);
      ta.rows = s.lines.length + 2;
      box.append(el('p', 'hint', '無法自動複製，請自己選取下面的文字複製：'), ta);
      setTimeout(() => ta.select(), 0);
    }
  }

  function copySummary(card) {
    const text = L.summaryText(card);
    const done = ok => {
      state.copied = ok;
      state.copyFallback = !ok;
      renderSide();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
    } else {
      done(false);
    }
  }

  // ── 對話框 ──
  // required = true 時（還沒選身分）不能關掉
  function openMe(required) {
    const d = $('me-dlg');
    d.replaceChildren();
    const live = !CE.isDemo();
    d.append(el('h3', 'dlg__title', '你是誰？'), el('p', 'hint', live ? '選自己的名字。只存在這台電腦的瀏覽器。' : '選自己的名字；名單裡沒有就新增。只存在這台電腦的瀏覽器。'));
    const grid = el('div', 'members');
    state.db.members.forEach(m => {
      grid.append(button('voter voter--btn' + (m === state.me ? ' is-active' : ''), m, () => { d.close(); setMe(m); }));
    });
    const add = el('div', 'dlg__row');
    const name = input('search', '', '新增名字', () => {});
    const join = () => {
      const v = name.value.trim();
      if (!v) return;
      d.close();
      setMe(v);
    };
    name.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
    add.append(name, button('btn btn--primary', '加入', join));
    d.append(grid);
    if (!live) d.append(add); // 正式版不能自己加名字
    if (!required) {
      const btns = el('div', 'btns');
      btns.append(button('btn', '取消', () => d.close()));
      d.append(btns);
    }
    d.oncancel = e => { if (!state.me) e.preventDefault(); };
    d.showModal();
  }

  // preset：{ id, as }（從轉盤或網址來的），預先選好店家並聚焦對應的按鈕
  function openNew(preset) {
    if (!state.me) { state.pendingNew = preset || null; openMe(true); return; }
    const d = $('new-dlg');
    d.replaceChildren();
    d.append(el('h3', 'dlg__title', '提議／開單'));

    const sel = el('select', 'search');
    sel.setAttribute('aria-label', '店家');
    state.stores.forEach(s => {
      const o = el('option', null, s.status === 'closed' ? `${s.name}（今天公休）` : s.name);
      o.value = s.id;
      sel.append(o);
    });
    if (preset && state.stores.some(s => s.id === preset.id)) sel.value = preset.id;
    const dice = button('btn pdice', '🎲', () => CE.openPicker({
      stores: state.stores, cards: state.db.cards, days: state.settings.pickerDays, today: state.day,
      source: 'lunch', onPick: store => { sel.value = store.id; },
    }));
    dice.setAttribute('aria-label', '用轉盤選店家');
    dice.title = '不知道吃什麼？轉一下';
    const pickRow = el('div', 'dlg__row');
    pickRow.append(sel, dice);

    const note = input('search', '', '備註（選填），例如：今天想吃辣的', () => {});
    const create = mode => {
      const st = state.stores.find(s => s.id === sel.value);
      let id = null;
      act(cs => {
        const r = L.createCard(cs, {
          store: st ? { id: st.id, name: st.name } : null,
          note: note.value, mode, actor: state.me,
          closeAt: CE.formatMin(state.settings.orderEnd),
          pickupAt: CE.formatMin(state.settings.pickup),
          now: now(),
        });
        id = r.id;
        return r.cards;
      }, () => { state.selectedId = id; resetView(); });
      d.close();
    };
    const fieldStore = el('div', 'dlg__field'); // 不用 <label>：裡面有 select 和 🎲 兩個控制項
    fieldStore.append(el('span', 'sect', '店家'), pickRow);
    const fieldNote = el('label', 'dlg__field');
    fieldNote.append(el('span', 'sect', '備註'), note);
    const proposeBtn = button('btn', '先提議', () => create('propose'));
    const openBtn = button('btn btn--primary', '直接開單', () => create('open'));
    const btns = el('div', 'btns');
    btns.append(button('btn', '取消', () => d.close()), proposeBtn, openBtn);
    d.append(fieldStore, fieldNote, btns);
    d.showModal();
    if (preset) (preset.as === 'propose' ? proposeBtn : openBtn).focus();
  }

  function resetDemo() {
    state.db = CE.lunchStore.reset(now());
    state.drafts = {};
    state.draftFor = '';
    if (state.me) addMember(state.me);
    state.viewDay = state.day;
    selectFirst();
    render();
    notice('已重置示範資料');
  }

  // 換日了（分頁開著過夜）：重算今天、店家今天的營業狀態，選中的卡片不是今天的就改選第一張。回傳是否換日。
  function refreshDay() {
    const t = now();
    const day = L.todayStr(t);
    if (day === state.day) return false;
    if (state.viewDay === state.day) state.viewDay = day; // 原本在看今天就跟著換日
    state.day = day;
    state.stores = CE.buildViewModel(CE.storeRepo.visible(), state.settings, CE.todayKey(t));
    if (!selected()) selectFirst();
    return true;
  }

  function render() {
    refreshDay();
    syncDraft();
    renderHeader();
    renderList();
    renderCard();
    renderSide();
  }

  // 每 30 秒更新收單倒數（只改文字，不重畫，避免打斷正在輸入的欄位）
  function tick() {
    if (refreshDay()) { render(); return; }
    if (isPast()) return;
    const card = selected();
    const span = document.querySelector('.lcard__count');
    if (card && span && card.status === 'ordering') span.textContent = countdownText(card);
  }

  async function init() {
    const t = now();
    const live = !CE.isDemo();
    state.settings = CE.rowsToSettings(CE.parseCsv(CE.DEMO_SETTINGS_CSV));
    state.db = { members: [], cards: [] };
    refreshDay();
    let loadWarning = null;
    if (live) {
      // 正式版：從 Supabase 載入店家、同事、菜單、開團單與品項評分
      $('card-list').append(el('p', 'empty', '讀取開團單中…'));
      await Promise.all([
        CE.storeRepo.ready(), CE.memberRepo.ready(), CE.menuData.ready(), CE.lunchStore.ready(),
        CE.itemRatingStore.ready ? CE.itemRatingStore.ready() : true,
      ]);
      state.stores = CE.buildViewModel(CE.storeRepo.visible(), state.settings, CE.todayKey(t));
      state.db = { members: CE.lunchStore.peekMembers(), cards: CE.lunchStore.cards() };
      if (CE.lunchStore.loadFailed()) loadWarning = LOAD_FAILED;
    } else {
      const loaded = CE.lunchStore.load(t);
      state.db = loaded.db;
      loadWarning = loaded.warning;
    }
    state.me = CE.lunchStore.getMe();
    if (state.me) addMember(state.me);
    selectFirst();
    // 從美食地圖轉盤來的（lunch.html?new=R002&as=open）：開「提議／開單」並選好店家；參數用完就清掉
    const params = new URLSearchParams(location.search);
    const newId = params.get('new');
    if (newId) {
      history.replaceState(null, '', CE.demoHref(location.pathname));
      if (state.stores.some(s => s.id === newId)) state.pendingNew = { id: newId, as: params.get('as') === 'propose' ? 'propose' : 'open' };
    }

    $('me-btn').addEventListener('click', () => openMe(false));
    // 別人的更新先擱著的中欄：焦點離開中欄才重畫
    $('card-view').addEventListener('focusout', e => {
      if (!state.cardStale || (e.relatedTarget && $('card-view').contains(e.relatedTarget))) return;
      state.cardStale = false;
      setTimeout(renderCard, 0); // 等這次點擊／切換焦點完成再重畫
    });
    render();
    if (loadWarning) warn(loadWarning);
    if (live) CE.liveSync.watch({ tables: ['lunch_cards', 'lunch_votes', 'lunch_items'], onChange: onRemote });
    if (!state.me) openMe(true);
    else if (state.pendingNew) { const p = state.pendingNew; state.pendingNew = null; openNew(p); }
    setInterval(tick, 30000);
  }

  document.addEventListener('DOMContentLoaded', init);
})(globalThis.CE = globalThis.CE || {});
