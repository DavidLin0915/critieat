(function (CE) {
  'use strict';
  // 即時更新：資料表有變動就呼叫 onChange（300ms 內的多個變動合併成一次）。
  // 用 Supabase Realtime（supabase-js，只拿來訂閱）；連不上或 supabase-js 還沒載入時改成每 10 秒呼叫一次。
  // supabase-js 由這裡非同步載入（不放在 <script> 裡，CDN 卡住時才不會擋住整個頁面）。
  // 分頁在背景時不輪詢，回到前景立刻呼叫一次補抓。示範模式不連線。
  // 測試接縫：CE.supaRealtime(url, key) 有設定就用它代替 supabase.createClient。
  const DEBOUNCE = 300;
  const POLL = 10000;
  const BROKEN = ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'];
  const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
  const sdkReady = () => !!CE.supaRealtime || !!(globalThis.supabase && globalThis.supabase.createClient);

  function loadSdk(onload) {
    const s = document.createElement('script');
    s.src = SDK;
    s.async = true;
    s.onload = onload;
    s.onerror = () => console.warn('[CRITIEAT] supabase-js 載入失敗，維持定時更新');
    document.head.appendChild(s);
  }

  function makeClient() {
    const cfg = CE.CONFIG || {};
    if (CE.supaRealtime) return CE.supaRealtime(cfg.supabaseUrl, cfg.supabaseKey);
    const sb = globalThis.supabase;
    if (!sb || !sb.createClient) return null;
    return sb.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  // 回傳 { stop() }
  function watch({ tables, onChange }) {
    if (CE.isDemo()) return { stop() {} };
    let debounce = null;
    let poll = null;
    let broken = false;
    let stopped = false;

    const hidden = () => document.visibilityState === 'hidden';
    const fire = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { debounce = null; if (!stopped) onChange(); }, DEBOUNCE);
    };
    const startPoll = () => {
      broken = true;
      if (!poll) poll = setInterval(() => { if (!stopped && !hidden()) onChange(); }, POLL);
    };
    const stopPoll = () => { clearInterval(poll); poll = null; };

    let client = null;
    let channel = null;
    function connect() {
      try {
        client = makeClient();
        if (!client) { startPoll(); return; }
        channel = client.channel('critieat-' + tables.join('-'));
        tables.forEach(table => channel.on('postgres_changes', { event: '*', schema: 'public', table }, fire));
        channel.subscribe(status => {
          if (stopped) return;
          if (status === 'SUBSCRIBED') {
            stopPoll();
            if (broken) { broken = false; onChange(); } // 斷線期間的變動補抓一次
          } else if (BROKEN.includes(status)) {
            startPoll();
          }
        });
      } catch (e) {
        console.warn('[CRITIEAT] 即時更新連不上，改成定時更新', e);
        startPoll();
      }
    }

    if (sdkReady()) {
      connect();
    } else {
      startPoll(); // 載入 supabase-js 期間先定時更新
      loadSdk(() => { if (!stopped) connect(); });
    }

    const onVisible = () => { if (!stopped && !hidden()) onChange(); };
    document.addEventListener('visibilitychange', onVisible);

    return {
      stop() {
        stopped = true;
        clearTimeout(debounce);
        stopPoll();
        if (client && channel && client.removeChannel) client.removeChannel(channel);
      },
    };
  }

  CE.liveSync = { watch };
})(globalThis.CE = globalThis.CE || {});
