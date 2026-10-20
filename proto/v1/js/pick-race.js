(function (CE) {
  'use strict';
  // 競速：每家店一顆珠子（matter.js），起跑位置隨機分配給店家，第一個過終點線的中獎；
  // 其他珠子繼續跑到全部抵達或 75 秒。起跑位置隨機，所以不管跑道怎麼設計每家機率都一樣。
  // 跑道照 CE.RACE_MAPS（pick-race-maps.js）的資料蓋；地圖可選，預設每場隨機。
  // 物理座標固定寬 380，畫的時候依實際寬度縮放。需要 globalThis.Matter（matter-js 0.19.0）。
  const W = 380, R = 10;
  const GRAVITY = 1, AIR = 0.012;   // 重力與空氣阻力：第一名約 25～30 秒到
  const CAP = 5;                    // 每個物理步（1/120 秒）最多移動幾 px，防止穿牆
  const WIN_BY = 60 * 60;           // 60 秒還沒人到：最前面那顆中獎
  const MAX_FRAMES = 60 * 75;       // 75 秒後不再跑
  const CAT_COLOR = { 飯: '#00c2d1', 麵: '#3b82f6', 小吃: '#f59e0b', 異國: '#bc13fe' };
  const OTHER = '#6b7280';
  const KIND_COLOR = { mill: '#00f0ff', slide: '#f59e0b', gate: '#bc13fe' };
  let chosenMap = ''; // 使用者選的地圖（空字串＝隨機），「再來一次」時沿用

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function build(M, stores, map) {
    const { Engine, Bodies, Body, Composite, Constraint, Events, Query } = M;
    const engine = Engine.create({ gravity: { y: GRAVITY } });
    const statics = [], movers = [], levers = [];
    const opt = { isStatic: true, restitution: 0.5, friction: 0 };
    // 自訂屬性不能叫 speed：Matter 每一步會用實際速度覆寫 body.speed
    const add = (b, kind, extra) => { Object.assign(b, { kind }, extra); statics.push(b); return b; };
    const H = map.finish + 120;
    add(Bodies.rectangle(-10, H / 2, 20, H * 2, opt), 'edge');
    add(Bodies.rectangle(W + 10, H / 2, 20, H * 2, opt), 'edge');
    const gate = add(Bodies.rectangle(W / 2, 175, W, 10, opt), 'gate', { on: true });
    add(Bodies.rectangle(W / 2, H - 5, W, 10, opt), 'floor');

    map.items.forEach(it => {
      switch (it.t) {
        case 'pegs': {
          const x0 = it.x0 == null ? 0 : it.x0, x1 = it.x1 == null ? W : it.x1;
          for (let row = 0; row < it.rows; row++) {
            // 偶數排從 30 開始、奇數排從 11 開始：奇數排把牆邊的縫擋住，珠子不能貼牆直落
            const y = it.y + row * 34, start = row % 2 ? 11 : 30;
            for (let x = x0 + start; x < x1 - 4; x += 38) {
              const gl = x - 4.5 - x0, gr = x1 - x - 4.5;
              // 釘子跟牆的縫在 5～20px 會把珠子夾住：挪到離牆 5px，珠子碰到會往內滾開
              const px = gl > 5 && gl < 20.5 ? x0 + 5 : gr > 5 && gr < 20.5 ? x1 - 5 : x;
              add(Bodies.circle(px, y, 4.5, opt), 'peg');
            }
          }
          break;
        }
        case 'ramp': add(Bodies.rectangle(it.x, it.y, it.w, 10, Object.assign({ angle: it.a }, opt)), 'ramp'); break;
        case 'zig':
          for (let i = 0; i < it.n; i++) {
            const left = i % 2 === 0;
            add(Bodies.rectangle(left ? 130 : W - 130, it.y + i * 95, 270, 10, Object.assign({ angle: left ? 0.3 : -0.3 }, opt)), 'ramp');
          }
          break;
        case 'wall': add(Bodies.rectangle(it.x, it.y, it.w, it.h, opt), 'ramp'); break;
        case 'funnel': {
          const half = (W - it.gap) / 2, len = half / Math.cos(0.55);
          add(Bodies.rectangle(half / 2, it.y, len, 10, Object.assign({ angle: 0.55 }, opt)), 'ramp');
          add(Bodies.rectangle(W - half / 2, it.y, len, 10, Object.assign({ angle: -0.55 }, opt)), 'ramp');
          break;
        }
        case 'spin': { // 翹翹板：中心有軸、被珠子壓了會轉，沒東西時慢慢回到水平
          const bar = Bodies.rectangle(it.x, it.y, it.w, 8, { restitution: 0.3, friction: 0, density: 0.001, frictionAir: 0.02 });
          bar.kind = 'spin';
          levers.push(bar);
          Composite.add(engine.world, [bar, Constraint.create({ pointA: { x: it.x, y: it.y }, bodyB: bar, pointB: { x: 0, y: 0 }, stiffness: 1, length: 0 })]);
          break;
        }
        case 'mill': { // 十字風車，中心加圓形軸心，珠子才不會卡在葉片夾角
          const parts = [Bodies.rectangle(it.x, it.y, it.len, 8), Bodies.rectangle(it.x, it.y, 8, it.len), Bodies.circle(it.x, it.y, 13)];
          movers.push(add(Body.create(Object.assign({ parts }, opt)), 'mill', { rate: it.speed }));
          break;
        }
        case 'bump': add(Bodies.circle(it.x, it.y, it.r, Object.assign({}, opt, { restitution: 1.15 })), 'bump', { flash: 0, r: it.r }); break;
        case 'slide':
          movers.push(add(Bodies.rectangle(it.x, it.y, it.w, 10, Object.assign({ angle: it.speed > 0 ? 0.15 : -0.15 }, opt)),
            'slide', { cx: it.x, range: Math.min(it.range, 60), ph: Math.random() * Math.PI * 2 }));
          break;
        case 'trap': movers.push(add(Bodies.rectangle(W / 2, it.y, W, 10, opt), 'trap', { closed: it.closed, open: it.open, phase: it.phase || 0 })); break;
      }
    });

    // 牆邊小擋板：每邊每 70px 一片（左右錯開），把貼牆直落的珠子撥回中間；附近 34px 內已有機關就不放（避免夾出口袋）
    const solid = statics.filter(b => b.kind !== 'edge' && b.kind !== 'floor').concat(levers);
    const near = (x, y) => Query.region(solid, { min: { x: x - 34, y: y - 34 }, max: { x: x + 34, y: y + 34 } }).length > 0;
    for (let y = 280, k = 0; y < map.finish - 120; y += 35, k++) {
      const left = k % 2 === 0, x = left ? 16 : W - 16;
      if (!near(x, y)) add(Bodies.rectangle(x, y, 46, 8, Object.assign({ angle: left ? 0.55 : -0.55 }, opt)), 'guard');
    }
    Composite.add(engine.world, statics);
    Events.on(engine, 'collisionStart', e => e.pairs.forEach(p => [p.bodyA, p.bodyB].forEach(b => {
      const root = b.parent || b;
      if (root.kind === 'bump') root.flash = 1;
    })));

    const order = CE.pick.shuffle(stores, Math.random); // 起跑位置隨機分配給店家
    const marbles = order.map((store, k) => {
      const col = k % 8, row = Math.floor(k / 8);
      const b = Bodies.circle(34 + col * 45 + (row % 2) * 12, 60 + row * 26 + Math.random() * 6, R,
        { restitution: 0.45, friction: 0.005, frictionAir: AIR, density: 0.002 });
      return Object.assign(b, {
        store, short: store.name.replace(/\s+/g, '').slice(0, 2),
        color: CAT_COLOR[store.category] || OTHER, place: 0, lastY: b.position.y, still: 0,
      });
    });
    Composite.add(engine.world, marbles);
    return { map, engine, statics, movers, levers, gate, marbles, H };
  }

  // 一個物理步（1/120 秒）前更新機關；f 為第幾步
  function tickMovers(M, w, f) {
    w.levers.forEach(b => { b.torque = -b.angle * 0.05 - b.angularVelocity * 0.6; }); // 回正力小：一顆珠子壓在一端約斜 20～30 度
    w.movers.forEach(b => {
      if (b.kind === 'mill') {
        M.Body.setAngle(b, b.angle + b.rate / 2); // rate 以每格（1/60 秒）計
        M.Body.setAngularVelocity(b, b.rate / 2);
      } else if (b.kind === 'slide') {
        const x = b.cx + Math.sin(f / 120 * 1.5 + b.ph) * b.range; // 約 4 秒來回一趟，最快每秒約 90px
        M.Body.setVelocity(b, { x: x - b.position.x, y: 0 });
        M.Body.setPosition(b, { x, y: b.position.y });
      } else if (b.kind === 'trap') {
        const open = (f + b.phase) % (b.closed + b.open) >= b.closed;
        // 要關上時若有珠子還在門裡，先不關（否則珠子會被嵌在活門裡）
        const inside = b.isSensor && w.marbles.some(m => Math.abs(m.position.y - b.position.y) < R + 6);
        b.isSensor = open || inside;
      }
    });
  }

  function pickMap(id) {
    const maps = CE.RACE_MAPS;
    return maps.find(m => m.id === id) || maps[Math.floor(Math.random() * maps.length)];
  }

  function mount(box, stores, o) {
    const M = globalThis.Matter;
    if (!M || !CE.RACE_MAPS) {
      box.append(el('p', 'pick__warn', '競速需要網路載入物理引擎，請改用其他款式'));
      return { unavailable: true, start() {}, destroy() {} };
    }
    const VH = o.small ? 400 : 520;
    const wrap = el('div', 'prace');
    const main = el('div', 'prace__main');
    const bar = el('label', 'prace__map');
    const sel = el('select');
    sel.append(el('option', null, '🎲 隨機'));
    sel.options[0].value = '';
    CE.RACE_MAPS.forEach(m => { const op = el('option', null, m.name); op.value = m.id; sel.append(op); });
    sel.value = chosenMap;
    bar.append('地圖 ', sel);
    const cssW = Math.min(W, box.clientWidth || W), scale = cssW / W, dpr = window.devicePixelRatio || 1;
    const cv = el('canvas', 'prace__board');
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(VH * scale * dpr);
    cv.style.width = cssW + 'px';
    cv.style.height = VH * scale + 'px';
    main.append(bar, cv);
    const side = el('div', 'prace__side');
    const mapName = el('div', 'prace__mapname');
    const rank = el('ol', 'prace__rank');
    side.append(el('div', 'sect', o.small ? '即時前三名' : '即時名次'), mapName, rank);
    wrap.append(main, side);
    box.append(wrap);
    const ctx = cv.getContext('2d');

    let w = null, camY = 0, frame = 0, raf = 0, won = false, running = false;
    let finished = [];

    function setup() {
      if (w) { M.Composite.clear(w.engine.world, false); M.Engine.clear(w.engine); }
      w = build(M, stores, pickMap(sel.value));
      camY = 0; frame = 0; finished = [];
      mapName.textContent = '地圖：' + w.map.name;
      draw();
      renderRank();
    }
    sel.addEventListener('change', () => { chosenMap = sel.value; if (!running) setup(); });

    function poly(b) {
      ctx.beginPath();
      (b.parts.length > 1 ? b.parts.slice(1) : [b]).forEach(p => {
        p.vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
        ctx.closePath();
      });
    }

    function draw() {
      const F = w.map.finish;
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      ctx.clearRect(0, 0, W, VH);
      ctx.save();
      ctx.translate(0, -camY);
      ctx.fillStyle = 'rgba(188,19,254,.25)';
      ctx.fillRect(0, F, W, 4);
      ctx.fillStyle = '#bc13fe';
      ctx.font = '700 12px Inter, sans-serif';
      ctx.fillText('FINISH', 8, F - 6);
      w.statics.forEach(b => {
        if (b.kind === 'edge' || (b.kind === 'gate' && !b.on)) return;
        const { x, y } = b.position;
        if (y < camY - 80 || y > camY + VH + 80) return;
        if (b.kind === 'peg') {
          ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#4b5563'; ctx.fill();
          return;
        }
        if (b.kind === 'bump') {
          ctx.beginPath(); ctx.arc(x, y, b.r, 0, Math.PI * 2);
          ctx.fillStyle = b.flash > 0 ? `rgba(188,19,254,${0.4 + b.flash * 0.6})` : 'rgba(188,19,254,.25)';
          ctx.strokeStyle = '#bc13fe'; ctx.lineWidth = 2;
          ctx.shadowColor = '#bc13fe'; ctx.shadowBlur = 6 + b.flash * 18;
          ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
          b.flash = Math.max(0, b.flash - 0.08);
          return;
        }
        const open = b.kind === 'trap' && b.isSensor;
        poly(b);
        ctx.fillStyle = b.kind === 'trap' ? (open ? 'rgba(188,19,254,.15)' : '#bc13fe') : KIND_COLOR[b.kind] || '#374151';
        ctx.shadowColor = b.kind === 'slide' ? '#f59e0b' : '#00f0ff';
        ctx.shadowBlur = b.kind === 'mill' || b.kind === 'slide' ? 10 : 0;
        ctx.fill();
        ctx.shadowBlur = 0;
        if (b.kind === 'trap' && !open) {
          ctx.fillStyle = '#fff';
          ctx.font = '700 10px "Noto Sans TC", sans-serif';
          ctx.fillText('▼ 活門', W - 52, y - 8);
        }
      });
      w.levers.forEach(b => {
        poly(b);
        ctx.fillStyle = '#00f0ff'; ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 10;
        ctx.fill(); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(b.position.x, b.position.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#0b1020'; ctx.fill();
      });
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 8.5px "Noto Sans TC", sans-serif';
      w.marbles.forEach(m => {
        const { x, y } = m.position;
        ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fillStyle = m.color;
        ctx.shadowColor = m.color;
        ctx.shadowBlur = m.place === 1 ? 18 : 6;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.fillText(m.short, x, y + 0.5);
      });
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
      // 右側細條：每顆珠子的進度
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillRect(W - 8, 8, 4, VH - 16);
      w.marbles.forEach(m => {
        ctx.fillStyle = m.color;
        ctx.fillRect(W - 10, 8 + (VH - 16) * Math.min(1, m.position.y / F) - 1, 8, 2);
      });
    }

    function renderRank() {
      const live = w.marbles.filter(m => !m.place).sort((a, b) => b.position.y - a.position.y);
      rank.replaceChildren();
      // 手機只列前三名（排成一行），開始鈕和結果才不會被擠到畫面外
      finished.concat(live).slice(0, o.small ? 3 : undefined).forEach(m => {
        const li = el('li', m.place === 1 ? 'is-win' : m.place ? 'is-done' : null);
        const dot = el('span', 'prace__dot');
        dot.style.background = m.color;
        li.append(dot, el('span', null, m.store.name));
        rank.append(li);
      });
    }

    function win(m) {
      if (won) return;
      won = true;
      if (!m.place) { m.place = 1; finished.unshift(m); }
      o.onWin(m.store);
    }

    function step() {
      for (let s = 0; s < 2; s++) { // 一格算兩個物理步，比較不會穿過薄的機關
        tickMovers(M, w, frame * 2 + s);
        M.Engine.update(w.engine, 1000 / 120);
      }
      frame++;
      const F = w.map.finish;
      w.marbles.forEach(m => {
        const v = m.velocity, sp = Math.hypot(v.x, v.y);
        if (sp > CAP) M.Body.setVelocity(m, { x: v.x * CAP / sp, y: v.y * CAP / sp });
        if (m.position.x < R || m.position.x > W - R) { // 出界保護：被彈飛也不會穿出左右牆
          M.Body.setPosition(m, { x: Math.min(W - R, Math.max(R, m.position.x)), y: m.position.y });
          M.Body.setVelocity(m, { x: -m.velocity.x * 0.5, y: m.velocity.y });
        }
        if (!m.place && m.position.y > F) {
          m.place = finished.length + 1;
          finished.push(m);
          if (m.place === 1) win(m);
        }
        if (frame % 60 === 0 && !m.place) { // 卡住 2 秒以上就往旁邊上方推一下
          m.still = Math.abs(m.position.y - m.lastY) < 2 ? m.still + 1 : 0;
          m.lastY = m.position.y;
          if (m.still >= 2) M.Body.applyForce(m, m.position, { x: (Math.random() < 0.5 ? -1 : 1) * (0.01 + Math.random() * 0.01), y: -0.02 });
        }
      });
      const live = w.marbles.filter(m => !m.place);
      const leader = live.reduce((a, b) => (b.position.y > a.position.y ? b : a), live[0] || finished[0]);
      const focus = finished.length ? finished[0] : leader;
      camY += (Math.max(0, Math.min(w.H - VH, focus.position.y - VH * 0.55)) - camY) * 0.08;
      draw();
      if (frame % 10 === 0) renderRank();
      if (frame >= WIN_BY && !won) win(leader);
      if (finished.length < w.marbles.length && frame < MAX_FRAMES) raf = requestAnimationFrame(step);
      else { renderRank(); running = false; }
    }

    setup();
    return {
      start() {
        running = true;
        sel.disabled = true;
        if (o.reduced) {
          win(w.marbles[CE.pick.pickIndex(w.marbles.length, Math.random)]);
          renderRank();
          draw();
          return;
        }
        M.Composite.remove(w.engine.world, w.gate);
        w.gate.on = false;
        raf = requestAnimationFrame(step);
      },
      destroy() {
        cancelAnimationFrame(raf);
        M.Composite.clear(w.engine.world, false);
        M.Engine.clear(w.engine);
      },
    };
  }

  CE.pickers = CE.pickers || {};
  CE.pickers.race = { label: '競速', startText: '開跑！', limit: () => 30, ready: () => !!globalThis.Matter, mount };
})(globalThis.CE = globalThis.CE || {});
