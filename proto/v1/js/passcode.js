(function (CE) {
  'use strict';
  // 團隊通關碼輸入框。supa.js 寫入被資料庫擋下時呼叫 CE.askPasscode()：
  // 確認碼正確（資料庫函式 check_team_code）才回傳碼，按取消或關掉回傳 null。
  // 通關碼只收英數與一般符號（要放進 HTTP header）。
  const TXT = {
    title: '輸入團隊通關碼',
    hint: '請輸入通關密碼',
    wrong: '通關碼不對',
    net: '儲存失敗，請檢查網路後再試一次',
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

  let pending = null; // 同時有兩筆寫入被擋時，共用同一個輸入框

  CE.askPasscode = function askPasscode() {
    if (pending) return pending;
    pending = new Promise(resolve => {
      let dlg = document.getElementById('code-dlg');
      if (!dlg) {
        dlg = el('dialog', 'dlg code');
        dlg.id = 'code-dlg';
        dlg.setAttribute('aria-label', TXT.title);
        document.body.append(dlg);
      }
      const input = el('input', 'search code__input');
      input.type = 'password';
      input.autocomplete = 'off';
      input.setAttribute('aria-label', TXT.title);
      const err = el('p', 'code__err');
      let checking = false;

      function done(code) {
        dlg.onclose = null;
        if (dlg.open) dlg.close();
        pending = null;
        resolve(code);
      }

      async function submit() {
        if (checking) return;
        const v = input.value.trim();
        err.textContent = '';
        if (!v || !/^[\x21-\x7e]+$/.test(v)) { err.textContent = TXT.wrong; input.focus(); return; }
        checking = true;
        ok.disabled = true;
        let right = false;
        try {
          right = (await CE.supa.rpc('check_team_code', { c: v })) === true;
        } catch (e) {
          err.textContent = TXT.net;
          checking = false;
          ok.disabled = false;
          return;
        }
        checking = false;
        ok.disabled = false;
        if (right) done(v);
        else { err.textContent = TXT.wrong; input.select(); }
      }

      input.addEventListener('keydown', e => {
        if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        submit();
      });
      const ok = button('btn btn--primary', '確定', submit);
      const btns = el('div', 'btns code__btns');
      btns.append(button('btn', '取消', () => done(null)), ok);
      dlg.replaceChildren(el('h3', 'dlg__title', TXT.title), el('p', 'hint', TXT.hint), input, err, btns);
      dlg.onclose = () => done(null); // Esc
      dlg.showModal();
      input.focus();
    });
    return pending;
  };
})(globalThis.CE = globalThis.CE || {});
