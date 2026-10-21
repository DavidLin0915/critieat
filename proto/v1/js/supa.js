(function (CE) {
  'use strict';
  // Supabase REST 客戶端（PostgREST＋Storage，不用 SDK）。網址與 publishable key 在 config.js。
  // 失敗一律 throw CE.SupaError { status, code, message }；連不上時 status 0、code 'net'。
  // 測試接縫：CE.supaFetch 有設定就用它代替 fetch。
  // 團隊通關碼：寫入（新增、修改、刪除、上傳）帶 x-team-code header（存在 localStorage）。被資料庫擋下時
  // 清掉舊碼、用 CE.askPasscode() 問一次，拿到碼就重送；使用者取消或頁面沒有輸入框時 throw code 'passcode'。
  // 讀取永遠不帶通關碼。

  class SupaError extends Error {
    constructor(status, code, message) {
      super(message || code);
      this.name = 'SupaError';
      this.status = status;
      this.code = code;
    }
  }

  const CODE_KEY = 'critieat.teamCode';
  const cfg = () => CE.CONFIG || {};
  const base = () => String(cfg().supabaseUrl || '').replace(/\/+$/, '');

  function headers(extra) {
    const key = cfg().supabaseKey || '';
    return Object.assign({ apikey: key, Authorization: 'Bearer ' + key }, extra);
  }

  async function request(url, init) {
    const f = CE.supaFetch || fetch;
    let res;
    try { res = await f(url, init); } catch (e) { throw new SupaError(0, 'net', e && e.message); }
    let body = null;
    try { body = await res.json(); } catch (e) { /* 沒有內容 */ }
    if (!res.ok) {
      const b = body || {};
      throw new SupaError(res.status, String(b.code || b.error || res.status), b.message || b.msg || '');
    }
    return body;
  }

  const rest = (table, query) => `${base()}/rest/v1/${table}${query ? '?' + query : ''}`;
  const JSON_WRITE = { 'Content-Type': 'application/json', Prefer: 'return=representation' };

  const first = rows => (Array.isArray(rows) ? rows[0] : rows);
  const isEmpty = rows => Array.isArray(rows) && rows.length === 0;
  const matchQuery = match => Object.keys(match).map(k => `${k}=eq.${encodeURIComponent(match[k])}`).join('&');

  function getCode() {
    try { return localStorage.getItem(CODE_KEY) || ''; } catch (e) { return ''; }
  }
  function setCode(v) {
    try { if (v) localStorage.setItem(CODE_KEY, v); else localStorage.removeItem(CODE_KEY); } catch (e) { /* 存不了就只在這次有效 */ }
  }
  const withCode = h => { const c = getCode(); return c ? Object.assign({}, h, { 'x-team-code': c }) : h; };

  // 資料表回 401/403 或 42501；Storage 回 400 但內容是 403／row-level security；PATCH 沒權限時回空陣列
  const deniedError = e => e instanceof SupaError && (e.status === 401 || e.status === 403 || e.code === '42501' || e.code === '403' || /row-level security/i.test(e.message));

  // 目前的碼資料庫認不認得（PATCH／DELETE 回空陣列時，分辨「被擋」與「本來就沒有這列」）
  async function codeOk() {
    const c = getCode();
    return !!c && (await request(rest('rpc/check_team_code'), { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ c }) })) === true;
  }

  // send() 每次重新組 header（才會帶到新的通關碼）；empty(result) 為 true 時，碼有效就照樣回傳（列不存在），無效才算被擋
  async function write(send, empty) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await send();
        if (!(empty && empty(out))) return out;
        if (attempt === 1 || await codeOk()) return out;
      } catch (e) {
        if (!deniedError(e)) throw e;
      }
      if (attempt === 1) break;
      setCode('');
      const code = CE.askPasscode ? await CE.askPasscode() : null;
      if (!code) throw new SupaError(403, 'passcode', '沒有通關碼');
      setCode(code);
    }
    throw new SupaError(403, 'passcode', '通關碼被拒');
  }

  CE.SupaError = SupaError;
  CE.supa = {
    get configured() { return !!base(); },

    select(table, query) {
      return request(rest(table, query), { method: 'GET', headers: headers() });
    },

    async insert(table, row) {
      return first(await write(() => request(rest(table), { method: 'POST', headers: headers(withCode(JSON_WRITE)), body: JSON.stringify(row) })));
    },

    update(table, id, patch) {
      return write(() => request(rest(table, `${id.col}=eq.${encodeURIComponent(id.val)}`),
        { method: 'PATCH', headers: headers(withCode(JSON_WRITE)), body: JSON.stringify(patch) }), isEmpty);
    },

    // match: { 欄位: 值 }，全部相等的列才刪；回傳刪掉的列（列本來就不存在時回 []）
    del(table, match) {
      return write(() => request(rest(table, matchQuery(match)),
        { method: 'DELETE', headers: headers(withCode({ Prefer: 'return=representation' })) }), isEmpty);
    },

    async upsert(table, row, onConflict) {
      const h = () => headers(withCode({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }));
      return first(await write(() => request(rest(table, 'on_conflict=' + encodeURIComponent(onConflict)), { method: 'POST', headers: h(), body: JSON.stringify(row) })));
    },

    // 回傳公開網址（bucket 需設成公開讀取）
    async upload(bucket, path, blob, contentType) {
      await write(() => request(`${base()}/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers: headers(withCode({ 'Content-Type': contentType })), body: blob }));
      return `${base()}/storage/v1/object/public/${bucket}/${path}`;
    },

    rpc(fn, args) {
      return request(rest('rpc/' + fn), { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(args || {}) });
    },
  };
})(globalThis.CE = globalThis.CE || {});
