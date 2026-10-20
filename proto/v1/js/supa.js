(function (CE) {
  'use strict';
  // Supabase REST 客戶端（PostgREST＋Storage，不用 SDK）。網址與 publishable key 在 config.js。
  // 失敗一律 throw CE.SupaError { status, code, message }；連不上時 status 0、code 'net'。
  // 測試接縫：CE.supaFetch 有設定就用它代替 fetch。

  class SupaError extends Error {
    constructor(status, code, message) {
      super(message || code);
      this.name = 'SupaError';
      this.status = status;
      this.code = code;
    }
  }

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

  CE.SupaError = SupaError;
  CE.supa = {
    get configured() { return !!base(); },

    select(table, query) {
      return request(rest(table, query), { method: 'GET', headers: headers() });
    },

    async insert(table, row) {
      return first(await request(rest(table), { method: 'POST', headers: headers(JSON_WRITE), body: JSON.stringify(row) }));
    },

    update(table, id, patch) {
      return request(rest(table, `${id.col}=eq.${encodeURIComponent(id.val)}`),
        { method: 'PATCH', headers: headers(JSON_WRITE), body: JSON.stringify(patch) });
    },

    async upsert(table, row, onConflict) {
      const h = headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' });
      return first(await request(rest(table, 'on_conflict=' + encodeURIComponent(onConflict)), { method: 'POST', headers: h, body: JSON.stringify(row) }));
    },

    // 回傳公開網址（bucket 需設成公開讀取）
    async upload(bucket, path, blob, contentType) {
      await request(`${base()}/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers: headers({ 'Content-Type': contentType }), body: blob });
      return `${base()}/storage/v1/object/public/${bucket}/${path}`;
    },
  };
})(globalThis.CE = globalThis.CE || {});
