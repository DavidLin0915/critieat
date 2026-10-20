(function (CE) {
  'use strict';

  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const SEG_RE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;
  const TIME_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/; // Sheets 可能把時間發布成 HH:MM:SS

  // 容忍常見寫法：全形冒號、～ ~ – — 當連字號、全形逗號、任意空白
  function normalize(raw) {
    return String(raw == null ? '' : raw)
      .replace(/：/g, ':')
      .replace(/[～~–—－]/g, '-')
      .replace(/，/g, ',')
      .replace(/\s+/g, '');
  }

  function toMin(h, m) {
    h = Number(h);
    m = Number(m);
    if (h > 24 || m > 59 || (h === 24 && m > 0)) return NaN;
    return h * 60 + m;
  }

  // 解析某一天的營業時間字串。
  // 回傳 { type: 'unknown' } | { type: 'closed' } | { type: 'open', segments: [{ start, end }] }
  // start / end 為分鐘；跨午夜時 end 會大於 1440。
  CE.parseHours = function parseHours(raw) {
    const s = normalize(raw);
    if (s === '') return { type: 'unknown' };
    if (s === '公休') return { type: 'closed' };
    const segments = [];
    for (const part of s.split(',')) {
      const m = SEG_RE.exec(part);
      if (!m) return { type: 'unknown' };
      const start = toMin(m[1], m[2]);
      let end = toMin(m[3], m[4]);
      if (Number.isNaN(start) || Number.isNaN(end) || start === end) return { type: 'unknown' };
      if (end < start) end += 1440;
      segments.push({ start, end });
    }
    return { type: 'open', segments };
  };

  // 'HH:MM' 或 'HH:MM:SS' → 分鐘（秒數忽略）；格式錯誤回傳 null
  CE.parseTime = function parseTime(raw) {
    const m = TIME_RE.exec(normalize(raw));
    if (!m) return null;
    const v = toMin(m[1], m[2]);
    return Number.isNaN(v) ? null : v;
  };

  // 'HH:MM-HH:MM' → { start, end }；格式錯誤或多段回傳 null
  CE.parseRange = function parseRange(raw) {
    const p = CE.parseHours(raw);
    if (p.type !== 'open' || p.segments.length !== 1) return null;
    return p.segments[0];
  };

  // 分鐘 → 'HH:MM'（超過 24 小時會繞回）
  CE.formatMin = function formatMin(min) {
    const m = ((min % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };

  // 午餐營業狀態。settings: { orderStart, orderEnd, pickup }（分鐘）
  // 回傳 { status: 'open' | 'early' | 'closed' | 'unknown', closesAt: 'HH:MM' | null }
  //   open    某時段與訂餐時段重疊，且在取餐時間（含）之後才打烊
  //   early   某時段與訂餐時段重疊，但都在取餐時間前打烊（closesAt = 最晚的打烊時間）
  //   closed  公休，或沒有任何時段與訂餐時段重疊
  //   unknown 空白或格式看不懂
  CE.lunchStatus = function lunchStatus(raw, settings) {
    const p = CE.parseHours(raw);
    if (p.type === 'unknown') return { status: 'unknown', closesAt: null };
    if (p.type === 'closed') return { status: 'closed', closesAt: null };
    const overlapping = p.segments.filter(
      seg => seg.start < settings.orderEnd && seg.end > settings.orderStart
    );
    if (overlapping.length === 0) return { status: 'closed', closesAt: null };
    if (overlapping.some(seg => seg.end >= settings.pickup)) return { status: 'open', closesAt: null };
    const last = Math.max(...overlapping.map(seg => seg.end));
    return { status: 'early', closesAt: CE.formatMin(last) };
  };

  // 以台灣時間取得今天的星期 key（'mon'…'sun'）。override 為合法 key 時直接採用（原型用 ?day= 模擬）。
  CE.todayKey = function todayKey(now, override) {
    if (override && DAY_KEYS.includes(override)) return override;
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', weekday: 'short' })
      .format(now || new Date());
    return wd.slice(0, 3).toLowerCase();
  };

  CE.DAY_KEYS = DAY_KEYS;
})(globalThis.CE = globalThis.CE || {});
