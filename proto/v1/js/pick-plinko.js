(function (CE) {
  'use strict';
  // 彈珠台：先公平抽一家，再用同一套物理模擬試不同的投入位置與亂數，找到會落進那格的路徑照著播。
  // 真的落珠台中間機率高，這樣做每家機率仍然一樣。模擬座標固定 340×400，畫的時候依實際寬度縮放。
  const W = 340, H = 400, R = 7, PR = 4, G = 0.25, ROWS = 9, TRIES = 3000;
  const DIV_TOP = H - 62;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // 可重現的亂數（mulberry32）
  function rng(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // 釘子交錯排列；家數少時釘距最多 W/8，板子才不會太空
  function pegsFor(n) {
    const gap = W / Math.max(n, 8), pegs = [];
    for (let row = 0; row < ROWS; row++) {
      const y = 60 + row * 30, off = row % 2 ? gap / 2 : 0;
      for (let x = off + gap / 2; x < W - 4; x += gap) pegs.push({ x, y });
    }
    return pegs;
  }

  // 投一次：frames 每格 { x, y, hit }（hit 為撞到的釘子索引，沒撞到 -1），slot 為落進第幾格
  function simulate(n, seed, pegs) {
    pegs = pegs || pegsFor(n);
    const slotW = W / n, rnd = rng(seed), frames = [];
    let x = W / 2 + (rnd() - 0.5) * 120, y = 14, vx = (rnd() - 0.5) * 1.2, vy = 0, lane = null;
    for (let f = 0; f < 1400; f++) {
      let hit = -1;
      for (let sub = 0; sub < 2; sub++) {
        vy += G / 2; x += vx / 2; y += vy / 2;
        for (let k = 0; k < pegs.length; k++) {
          const p = pegs[k], dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
          if (d > 0 && d < R + PR) {
            const nx = dx / d, ny = dy / d, dot = vx * nx + vy * ny;
            x = p.x + nx * (R + PR); y = p.y + ny * (R + PR);
            if (dot < 0) { vx -= 1.5 * dot * nx; vy -= 1.5 * dot * ny; }
            vx += (rnd() - 0.5) * 0.6;
            hit = k;
          }
        }
        if (x < R) { x = R; vx = Math.abs(vx) * 0.5; }
        if (x > W - R) { x = W - R; vx = -Math.abs(vx) * 0.5; }
        if (y > DIV_TOP && lane === null) lane = Math.min(n - 1, Math.max(0, Math.floor(x / slotW)));
        if (lane !== null) {
          const lo = lane * slotW + R + 1, hi = (lane + 1) * slotW - R - 1;
          if (x < lo) { x = lo; vx = Math.abs(vx) * 0.4; }
          if (x > hi) { x = hi; vx = -Math.abs(vx) * 0.4; }
        }
        if (y > H - R - 2) { y = H - R - 2; vy = -vy * 0.3; vx *= 0.7; }
      }
      frames.push({ x, y, hit });
      if (lane !== null && y >= H - R - 3 && Math.abs(vy) < 0.4) break;
    }
    return { frames, slot: lane === null ? Math.min(n - 1, Math.max(0, Math.floor(x / slotW))) : lane };
  }

  // 找一條落進 target 的路徑；試 TRIES 次都找不到就用最後一次（結果以它實際落的格子為準）
  function pathTo(n, target) {
    const pegs = pegsFor(n);
    let run = null;
    for (let t = 0; t < TRIES; t++) {
      run = simulate(n, Math.floor(Math.random() * 1e9), pegs);
      if (run.slot === target) return run;
    }
    return run;
  }

  function mount(box, stores, o) {
    const n = stores.length, pegs = pegsFor(n), slotW = W / n;
    const cssW = Math.min(W, box.clientWidth || W), scale = cssW / W, dpr = window.devicePixelRatio || 1;
    const wrap = el('div', 'pplinko');
    const cv = el('canvas', 'pplinko__board');
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(H * scale * dpr);
    cv.style.width = cssW + 'px';
    cv.style.height = H * scale + 'px';
    const names = el('div', 'pplinko__names');
    names.style.width = cssW + 'px';
    const nameEls = stores.map(s => {
      const d = el('div');
      d.append(el('span', null, s.name.replace(/\s+/g, '').slice(0, 7)));
      names.append(d);
      return d;
    });
    wrap.append(cv, names);
    box.append(wrap);

    const ctx = cv.getContext('2d');
    const glow = new Map(); // 釘子索引 → 亮度 0..1
    function draw(ball, trail) {
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#374151';
      for (let i = 1; i < n; i++) ctx.fillRect(i * slotW - 1.5, DIV_TOP, 3, H - DIV_TOP);
      pegs.forEach((p, k) => {
        const g = glow.get(k) || 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, PR + g * 2, 0, Math.PI * 2);
        ctx.fillStyle = g > 0 ? `rgba(0,240,255,${0.5 + g / 2})` : '#4b5563';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = g * 14;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      (trail || []).forEach((t, i, all) => {
        ctx.beginPath();
        ctx.arc(t.x, t.y, R * (i / all.length), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(188,19,254,${0.25 * i / all.length})`;
        ctx.fill();
      });
      if (ball) {
        const grd = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, R);
        grd.addColorStop(0, '#fff');
        grd.addColorStop(1, '#bc13fe');
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.shadowColor = '#bc13fe';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    draw(null);

    let raf = 0;
    return {
      start() {
        nameEls.forEach(d => d.classList.remove('is-win'));
        const run = pathTo(n, CE.pick.pickIndex(n, Math.random));
        const finish = () => {
          glow.clear();
          draw(run.frames[run.frames.length - 1]);
          nameEls[run.slot].classList.add('is-win');
          o.onWin(stores[run.slot]);
        };
        if (o.reduced) { finish(); return; }
        let f = 0;
        const trail = [];
        const tick = () => {
          const fr = run.frames[f++];
          if (fr.hit >= 0) glow.set(fr.hit, 1);
          trail.push(fr);
          if (trail.length > 10) trail.shift();
          glow.forEach((v, k) => (v - 0.06 <= 0 ? glow.delete(k) : glow.set(k, v - 0.06)));
          draw(fr, trail);
          if (f < run.frames.length) raf = requestAnimationFrame(tick);
          else finish();
        };
        raf = requestAnimationFrame(tick);
      },
      destroy() { cancelAnimationFrame(raf); },
    };
  }

  CE.plinkoSim = { simulate, pathTo, pegsFor };
  CE.pickers = CE.pickers || {};
  CE.pickers.plinko = { label: '彈珠台', startText: '投！', limit: small => (small ? 6 : 10), mount };
})(globalThis.CE = globalThis.CE || {});
