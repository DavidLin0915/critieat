// CRITIEAT 菜單 AI 辨識：照片 → Gemini → 草稿列。部署方式見 supabase/README.md ⑧。
// 這個檔案刻意不用 TypeScript 語法、不 import 任何東西：可以整份貼進 Supabase Dashboard 的函式編輯器，也能用 node 檢查。
// 環境變數：GEMINI_API_KEY（必填，Supabase secrets）、GEMINI_MODEL（選填）；SUPABASE_URL、SUPABASE_PUBLISHABLE_KEYS（舊版 SUPABASE_ANON_KEY）由 Supabase 自動提供。
// 請求：POST { images: [{ data: base64, mime } | { url }] }，header x-team-code＝團隊通關碼。
// 回應：200 { rows: [{ category, name, price: number|null, note, uncertain }], failed: [索引] }；
//       錯誤 { error: bad_request | too_many | no_images | passcode | quota | ai | not_configured }。

// 預設型號：2026-10-22 查 ai.google.dev，免費方案、支援圖片的 Flash-Lite。
// 實測 gemini-3.8-flash 想太久（超過 Supabase 函式時限、常 503），Flash-Lite 一份菜單約 8 秒且讀得準
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
// 部署版本：回應 header x-menu-recognize-version，用來確認 Dashboard 上跑的是哪一版
const VERSION = '2026-10-22.3';
const MAX_IMAGES = 6;
const MAX_URL_BYTES = 10 * 1024 * 1024;
const URL_TIMEOUT_MS = 15000;
// Gemini 收的圖片格式；一次請求的圖片總量上限（base64 後要低於 Gemini 的 20MB）
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
const MAX_TOTAL_BYTES = 14 * 1024 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-team-code',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-menu-recognize-version',
  'x-menu-recognize-version': VERSION,
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

// code 給前端分辨畫面；reason 是失敗在哪一步（不含 key 或 Gemini 的訊息內容），方便查問題
class AiError extends Error {
  constructor(code, reason) { super(code); this.code = code; this.reason = reason; }
}

// 呼叫資料庫用的公開 key：新版是 JSON 字典取 default，舊專案退回 anon key
function publicKey() {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
    if (keys && keys.default) return keys.default;
  } catch (e) { /* 沒有或格式不對就用舊版 */ }
  return Deno.env.get('SUPABASE_ANON_KEY');
}

async function codeOk(code) {
  if (!code) return false;
  const url = Deno.env.get('SUPABASE_URL');
  const key = publicKey();
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
    if (!res.ok || !TYPES.includes(type)) return null;
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
    console.error(`Gemini 連不上 (${model}): ${e && e.message}`);
    throw new AiError('ai', 'gemini_fetch_failed');
  }
  if (!res.ok) {
    // 只寫進函式 log（Dashboard → Edge Functions → menu-recognize → Logs），不回給前端；key 先遮掉
    const detail = (await res.text().catch(() => '')).split(key).join('***').slice(0, 500);
    console.error(`Gemini ${res.status} (${model}): ${detail}`);
    throw new AiError(res.status === 429 ? 'quota' : 'ai', 'gemini_' + res.status);
  }
  try {
    const out = await res.json();
    const text = out.candidates[0].content.parts.map(p => p.text || '').join('');
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) throw new Error('not array');
    return rows;
  } catch (e) {
    console.error(`Gemini 回應無法解析 (${model}): ${e && e.message}`);
    throw new AiError('ai', 'gemini_bad_response');
  }
}

const str = v => (typeof v === 'string' ? v.trim() : '');
const CJK = '\u3400-\u9fff\uf900-\ufaff';
// 分類照抄時常帶裝飾：「~抄 手 類~」「～小 菜 類～ 45」→「抄手類」「小菜類」（中文字之間的空白、波浪號、結尾的共用價格去掉）
function cleanCategory(v) {
  return str(v)
    .replace(/[~～]/g, '')
    .replace(new RegExp(`(?<=[${CJK}])\\s+(?=[${CJK}])`, 'g'), '')
    .replace(/\s*\$?\d+(\.\d+)?\s*元?$/, '')
    .trim();
}

function clean(raw) {
  const rows = [];
  raw.forEach(r => {
    if (!r || typeof r !== 'object') return;
    const name = str(r.name);
    if (!name) return;
    let price = r.price == null ? null : r.price;
    let uncertain = r.uncertain === true || price == null;
    if (price != null) {
      if (typeof price === 'number' && Number.isFinite(price) && price >= 0) price = Math.round(price * 10) / 10;
      else { price = null; uncertain = true; }
    }
    rows.push({ category: cleanCategory(r.category), name, price, note: str(r.note), uncertain });
  });
  return rows;
}

async function handle(req) {
  if (req.method === 'OPTIONS') return reply(204, null);
  if (req.method !== 'POST') return reply(400, { error: 'bad_request' });
  try {
    if (!(await codeOk(req.headers.get('x-team-code')))) return reply(403, { error: 'passcode' });
  } catch (e) {
    console.error(`通關碼檢查失敗: ${e && e.message}`);
    return reply(502, { error: 'ai', reason: 'passcode_check_failed' });
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
    if (im && typeof im.data === 'string' && im.data && TYPES.includes(im.mime)) return { data: im.data, mime: im.mime };
    if (im && typeof im.url === 'string' && /^https?:\/\//i.test(im.url)) return fetchImage(im.url);
    return null;
  }));
  let total = 0;
  got.forEach((im, i) => {
    const size = im ? im.data.length * 3 / 4 : 0;
    if (im && total + size <= MAX_TOTAL_BYTES) { images.push(im); total += size; } else failed.push(i);
  });
  if (images.length === 0) return reply(400, { error: 'no_images' });

  try {
    const rows = clean(await callAi(images, key, Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL));
    return reply(200, { rows, failed });
  } catch (e) {
    if (!(e instanceof AiError)) console.error(`辨識失敗: ${e && e.message}`);
    const err = e instanceof AiError ? e : new AiError('ai', 'unexpected');
    return reply(err.code === 'quota' ? 429 : 502, { error: err.code, reason: err.reason });
  }
}

Deno.serve(handle);
