(function (CE) {
  'use strict';

  // 共用的評分表單（店家評分、品項評分）：選身分、半星、短評、儲存／更新、刪除（兩段確認）、其他人的評分。
  // const f = CE.ratingForm({ kit, store, field })
  //   kit：CE.rating 或 CE.itemRating；store：{ load(now), save(db) }；field：評分對象欄位（'storeId' / 'itemId'）
  // f.panel(target, onChange, opts)：target = { id, extra }，extra 是存檔時一併寫入的欄位（品項評分的 storeId、itemName、itemNote）
  //   儲存或刪除成功後呼叫 onChange（由頁面重畫）；opts.hideSwitch：不顯示「切換」（開團單的身分由頁面右上角管理）
  // 身分與成員名單共用開團單（lunch-store.js），每次畫面重建時重新讀，所以兩頁換身分會同步。
  // 還沒存的星數與短評、正在換身分、刪除確認都留在表單物件裡，畫面因為其他原因重畫時不會不見。
  const SAVE_FAILED = '無法儲存到這台電腦的瀏覽器';

  // 所有使用者資料一律用 textContent 寫入，不用 innerHTML
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

  CE.ratingForm = function ratingForm({ kit, store, field }) {
    const state = {
      loaded: false,
      db: { ratings: [] },
      warning: null,
      draft: null,          // { id, member, stars: number | null, comment }
      switching: false,     // 正在換身分
      confirmDelete: false,
      error: null,
    };

    function init(now) {
      const r = store.load(now);
      state.db = r.db;
      state.warning = r.warning;
      state.loaded = true;
    }

    function ensure() {
      if (!state.loaded) init(new Date());
    }

    function who() {
      const members = CE.lunchStore.peekMembers();
      const me = CE.lunchStore.getMe();
      return { members, me: members.includes(me) ? me : '' }; // 名字不在名單裡就當作還沒選
    }

    function summary(id) { ensure(); return kit.summary(state.db.ratings, id); }
    function ratings() { ensure(); return state.db.ratings; }
    function mine(id) {
      ensure();
      const { me } = who();
      return me ? kit.find(state.db, id, me) : null;
    }

    // 換對象或換身分時，表單改帶入這個人對這個對象的評分
    function ensureDraft(id, me) {
      const d = state.draft;
      if (d && d.id === id && d.member === me) return;
      if (!d || d.id !== id) state.switching = false; // 換了評分對象，上一個沒完成的「切換」不帶過來
      const old = me ? kit.find(state.db, id, me) : null;
      state.draft = { id, member: me, stars: old ? old.stars : null, comment: old ? old.comment : '' };
      state.confirmDelete = false;
      state.error = null;
    }

    // 存得進去才更新資料與畫面；存不進去就留著表單內容並顯示錯誤
    function commitDb(db, rebuild, onChange) {
      if (!store.save(db)) { state.error = SAVE_FAILED; rebuild(); return; }
      state.db = db;
      state.warning = null;
      state.error = null;
      state.draft = null;
      state.confirmDelete = false;
      onChange();
    }

    function identity(me, rebuild, opts) {
      const p = el('p', 'rate__me');
      p.append('以 ', el('b', null, me), ' 身分評分');
      if (!opts.hideSwitch) p.append(button('rate__link', '切換', () => { state.switching = true; rebuild(); }));
      return p;
    }

    function whoPicker(members, me, rebuild) {
      const box = el('div', 'rate__pick');
      box.append(el('span', null, me ? '換成：' : '你是誰？'));
      const sel = el('select', 'rate__select');
      sel.setAttribute('aria-label', '選擇你的名字');
      sel.append(new Option('選擇名字', ''));
      members.forEach(m => sel.append(new Option(m, m, false, m === me)));
      sel.addEventListener('change', () => {
        if (!sel.value) return;
        state.switching = false;
        CE.lunchStore.setMe(sel.value); // 和開團單同步
        rebuild();
        document.dispatchEvent(new CustomEvent('ce:me-change', { detail: { name: sel.value } }));
      });
      box.append(sel);
      if (me) box.append(button('rate__link', '取消', () => { state.switching = false; rebuild(); }));
      return box;
    }

    function form(target, me, rebuild, onChange) {
      const d = state.draft;
      const old = kit.find(state.db, target.id, me);
      const box = el('div', 'rate__form');

      function save() {
        if (d.stars == null) return;
        commitDb(kit.upsert(state.db, Object.assign({}, target.extra, {
          [field]: target.id, member: me, stars: d.stars,
          comment: kit.normalizeComment(d.comment), updatedAt: new Date().toISOString(),
        })), rebuild, onChange);
      }

      const submit = button('btn btn--primary', old ? '更新' : '儲存', save);
      submit.disabled = d.stars == null;
      const stars = CE.starPicker(d.stars, v => { d.stars = v; submit.disabled = false; });

      const fieldBox = el('div', 'rate__field');
      const input = el('input', 'rate__input');
      input.type = 'text';
      input.maxLength = kit.MAX_COMMENT;
      input.placeholder = '短評（選填）';
      input.value = d.comment;
      input.setAttribute('aria-label', '短評');
      const count = el('span', 'rate__count mono');
      const showCount = () => { count.textContent = `${input.value.length}/${kit.MAX_COMMENT}`; };
      input.addEventListener('input', () => { d.comment = input.value; showCount(); });
      input.addEventListener('keydown', e => {
        // 中文選字的 Enter 不送出；Safari 選字確認的 Enter 是 isComposing=false、keyCode 229
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && !submit.disabled) save();
      });
      showCount();
      fieldBox.append(input, count);

      const btns = el('div', 'rate__btns');
      btns.append(submit);
      if (old) {
        btns.append(button(
          'btn btn--danger' + (state.confirmDelete ? ' is-confirm' : ''),
          state.confirmDelete ? '確定刪除？' : '刪除我的評分',
          () => {
            if (!state.confirmDelete) { state.confirmDelete = true; rebuild(); return; }
            commitDb(kit.remove(state.db, target.id, me), rebuild, onChange);
          }
        ));
      }

      box.append(stars, fieldBox, btns);
      if (state.error) {
        const err = el('p', 'rate__error', state.error);
        err.setAttribute('role', 'alert');
        box.append(err);
      }
      return box;
    }

    function panel(target, onChange, opts) {
      ensure();
      const o = opts || {};
      const { members, me } = who();
      ensureDraft(target.id, me);
      const box = el('div', 'rate__panel');
      const rebuild = () => box.replaceWith(panel(target, onChange, o));

      if (state.warning) box.append(el('p', 'rate__warn', state.warning));
      if (me && (!state.switching || o.hideSwitch)) box.append(identity(me, rebuild, o), form(target, me, rebuild, onChange));
      else box.append(whoPicker(members, me, rebuild));

      const list = kit.others(state.db, target.id, me);
      if (list.length) {
        const ul = el('ul', 'rate__list');
        list.forEach(r => {
          const li = el('li', 'rate__row');
          li.append(
            el('span', 'rate__who', r.member),
            el('span', 'rate__stars', '★ ' + kit.formatStars(r.stars)),
            el('span', 'rate__comment', r.comment),
            el('span', 'rate__date mono', kit.dateLabel(r.updatedAt))
          );
          ul.append(li);
        });
        box.append(ul);
      }
      return box;
    }

    return { init, summary, mine, ratings, panel };
  };
})(globalThis.CE = globalThis.CE || {});
