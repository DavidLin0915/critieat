(function (CE) {
  'use strict';
  // 即時更新：資料表有變動就呼叫 onChange（300ms 內的多個變動合併成一次）。
  // 用 Supabase Realtime（supabase-js，只拿來訂閱）；連不上或沒有載入 supabase-js 時改成每 10 秒呼叫一次。
  // 分頁在背景時不輪詢，回到前景立刻呼叫一次補抓。示範模式不連線。
  // 測試接縫：CE.supaRealtime(url, key) 有設定就用它代替 supabase.createClient。
  const DEBOUNCE = 300;
  const POLL = 10000;
  const BROKEN = ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'];

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
    try {
      client = makeClient();
      if (client) {
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
      } else {
        startPoll();
      }
    } catch (e) {
      console.warn('[CRITIEAT] 即時更新連不上，改成定時更新', e);
      startPoll();
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
