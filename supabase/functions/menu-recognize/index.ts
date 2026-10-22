// CRITIEAT 菜單 AI 辨識：照片 → Gemini → 草稿列。部署方式見 supabase/README.md ⑧。
// 這個檔案刻意不用 TypeScript 語法、不 import 任何東西：可以整份貼進 Supabase Dashboard 的函式編輯器，也能用 node 檢查。
// 環境變數：GEMINI_API_KEY（必填，Supabase secrets）、GEMINI_MODEL（選填）；SUPABASE_URL、SUPABASE_ANON_KEY 由 Supabase 自動提供。
// 請求：POST { images: [{ data: base64, mime } | { url }] }，header x-team-code＝團隊通關碼。
// 回應：200 { rows: [{ category, name, price: number|null, note, uncertain }], failed: [索引] }；
//       錯誤 { error: bad_request | too_many | no_images | passcode | quota | ai | not_configured }。

// 預設型號：2026-10-22 查 ai.google.dev，免費方案有額度的 Flash 穩定版
const DEFAULT_MODEL = 'gemini-3.8-flash';
const MAX_IMAGES = 6;
const MAX_URL_BYTES = 10 * 1024 * 1024;
const URL_TIMEOUT_MS = 15000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-team-code',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PROMPT = `你會看到同一家店的菜單照片（可能是手機拍的紙本菜單，或 Google Maps 的截圖）。請把照片上的品項整理成 JSON 陣列，每一項是 { category, name, price, note, uncertain }。
規則：
1. 只抄照片上看得到的內容，不要猜、不要補。價格看不清楚或沒有標價就填 null，並把 uncertain 設成 true；品名看不清楚也把 uncertain 設成 true。
2. 品名照菜單原文（繁體中文），不翻譯、不美化、不加說明。
3. 同一品項有大小份或不同口味不同價格時，拆成多項，差別寫在 note（例如「大」「小」）；沒有差別時 note 填空字串。
4. category 照菜單上的分類標題；沒有標題就填空字串。
5. 照片不是菜單，或完全讀不到品項時，回傳空陣列 []。`;

const SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      category: { type: 'STRING' },
      name: { type: 'STRING' },
      price: { type: 'NUMBER', nullable: true },
      note: { type: 'STRING' },
      uncertain: { type: 'BOOLEAN' },
    },
    required: ['name', 'uncertain'],
  },
};

function reply(status, body) {
  if (body == null) return new Response(null, { status, headers: CORS });
  return new Response(JSON.stringify(body), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS) });
}

class AiError extends Error {
  constructor(code) { super(code); this.code = code; }
}

async function codeOk(code) {
  if (!code) return false;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  const res = await fetch(`${url}/rest/v1/rpc/check_team_code`, {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ c: code }),
  });
  return res.ok && (await res.json()) === true;
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// 網址照片：抓不到、不是圖片、太大都回傳 null
async function fetchImage(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), URL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!res.ok || !type.startsWith('image/')) return null;
    if (Number(res.headers.get('content-length') || 0) > MAX_URL_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_URL_BYTES) return null;
    return { data: toBase64(bytes), mime: type };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 換 AI 供應商只要換這個函式：輸入 [{ data, mime }]，回傳未清洗的列陣列；失敗 throw AiError('quota' | 'ai')
async function callAi(images, key, model) {
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: images.map(im => ({ inline_data: { mime_type: im.mime, data: im.data } })).concat([{ text: PROMPT }]) }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    });
  } catch (e) {
    throw new AiError('ai');
  }
  if (res.status === 429) throw new AiError('quota');
  if (!res.ok) throw new AiError('ai');
  try {
    const out = await res.json();
    const text = out.candidates[0].content.parts.map(p => p.text || '').join('');
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) throw new Error('not array');
    return rows;
  } catch (e) {
    throw new AiError('ai');
  }
}

const str = v => (typeof v === 'string' ? v.trim() : '');

function clean(raw) {
  const rows = [];
  raw.forEach(r => {
    if (!r || typeof r !== 'object') return;
    const name = str(r.name);
    if (!name) return;
    let price = r.price == null ? null : r.price;
    let uncertain = r.uncertain === true;
    if (price != null) {
      if (typeof price === 'number' && Number.isFinite(price) && price >= 0) price = Math.round(price * 10) / 10;
      else { price = null; uncertain = true; }
    }
    rows.push({ category: str(r.category), name, price, note: str(r.note), uncertain });
  });
  return rows;
}

async function handle(req) {
  if (req.method === 'OPTIONS') return reply(204, null);
  if (req.method !== 'POST') return reply(400, { error: 'bad_request' });
  try {
    if (!(await codeOk(req.headers.get('x-team-code')))) return reply(403, { error: 'passcode' });
  } catch (e) {
    return reply(502, { error: 'ai' });
  }

  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return reply(503, { error: 'not_configured' });

  let body;
  try { body = await req.json(); } catch (e) { return reply(400, { error: 'bad_request' }); }
  const list = body && body.images;
  if (!Array.isArray(list) || list.length === 0) return reply(400, { error: 'bad_request' });
  if (list.length > MAX_IMAGES) return reply(400, { error: 'too_many' });

  const failed = [];
  const images = [];
  const got = await Promise.all(list.map(im => {
    if (im && typeof im.data === 'string' && im.data && typeof im.mime === 'string' && im.mime.startsWith('image/')) return { data: im.data, mime: im.mime };
    if (im && typeof im.url === 'string' && /^https?:\/\//i.test(im.url)) return fetchImage(im.url);
    return null;
  }));
  got.forEach((im, i) => { if (im) images.push(im); else failed.push(i); });
  if (images.length === 0) return reply(400, { error: 'no_images' });

  try {
    const rows = clean(await callAi(images, key, Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL));
    return reply(200, { rows, failed });
  } catch (e) {
    return reply(e instanceof AiError && e.code === 'quota' ? 429 : 502, { error: e instanceof AiError ? e.code : 'ai' });
  }
}

Deno.serve(handle);
