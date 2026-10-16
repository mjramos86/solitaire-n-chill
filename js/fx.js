/* Visual effects: ambient particle backdrop + the bouncing-cards win cascade. */
(function () {
  'use strict';
  const NS = window.SNC;
  const K = NS.K;

  /* ---------------------------------------------------------------- ambient particles */
  const canvas = () => document.getElementById('bg-fx');
  let mode = 'none', parts = [], raf = 0, W = 0, H = 0, amount = 0.6, last = 0, sprite = null;

  function makeSprite() {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,240,170,1)');
    grd.addColorStop(0.25, 'rgba(255,220,120,.55)');
    grd.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
    return c;
  }

  function count() {
    const area = (W * H) / (1280 * 720);
    const base = { rain: 170, snow: 90, petals: 28, fireflies: 26, stars: 90 }[mode] || 0;
    return Math.round(base * Math.max(0.5, area) * amount * 1.6);
  }

  function spawn(initial) {
    const rnd = Math.random;
    switch (mode) {
      case 'rain': return { x: rnd() * (W + 200) - 100, y: initial ? rnd() * H : -30, v: 700 + rnd() * 500, l: 12 + rnd() * 18, a: 0.12 + rnd() * 0.22 };
      case 'snow': return { x: rnd() * W, y: initial ? rnd() * H : -10, v: 28 + rnd() * 50, r: 1.2 + rnd() * 2.8, ph: rnd() * 6.28, a: 0.45 + rnd() * 0.45 };
      case 'petals': return { x: rnd() * W, y: initial ? rnd() * H : -20, v: 30 + rnd() * 35, s: 5 + rnd() * 6, ph: rnd() * 6.28, rot: rnd() * 6.28, rv: (rnd() - 0.5) * 2, a: 0.55 + rnd() * 0.4 };
      case 'fireflies': return { x: rnd() * W, y: rnd() * H, vx: (rnd() - 0.5) * 18, vy: (rnd() - 0.5) * 18, ph: rnd() * 6.28, sp: 0.5 + rnd() * 1.2, s: 10 + rnd() * 14 };
      case 'stars': return { x: rnd() * W, y: rnd() * H * 0.9, ph: rnd() * 6.28, sp: 0.4 + rnd() * 1.4, r: 0.5 + rnd() * 1.4 };
      default: return null;
    }
  }

  function resize() {
    const c = canvas();
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    c.style.width = W + 'px'; c.style.height = H + 'px';
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuild();
  }
  function rebuild() {
    parts = [];
    const n = count();
    for (let i = 0; i < n; i++) parts.push(spawn(true));
  }

  function frame(ts) {
    raf = 0;
    if (mode === 'none' || document.hidden) return;
    const c = canvas(), g = c.getContext('2d');
    const dt = Math.min(0.05, (ts - (last || ts)) / 1000);
    last = ts;
    g.clearRect(0, 0, W, H);
    const t = ts / 1000;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      switch (mode) {
        case 'rain':
          p.y += p.v * dt; p.x -= p.v * dt * 0.18;
          g.strokeStyle = `rgba(190,210,255,${p.a})`; g.lineWidth = 1;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + p.l * 0.18, p.y - p.l); g.stroke();
          if (p.y > H + 20) parts[i] = spawn(false);
          break;
        case 'snow':
          p.y += p.v * dt; p.x += Math.sin(t * 0.8 + p.ph) * 14 * dt;
          g.fillStyle = `rgba(255,255,255,${p.a})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill();
          if (p.y > H + 10) parts[i] = spawn(false);
          break;
        case 'petals':
          p.y += p.v * dt; p.x += Math.sin(t * 0.7 + p.ph) * 26 * dt + 8 * dt; p.rot += p.rv * dt;
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = p.a;
          g.fillStyle = '#ffd3e0'; g.beginPath(); g.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, 6.283); g.fill();
          g.fillStyle = 'rgba(255,150,185,.55)'; g.beginPath(); g.ellipse(p.s * 0.25, 0, p.s * 0.45, p.s * 0.25, 0, 0, 6.283); g.fill();
          g.restore();
          if (p.y > H + 20 || p.x > W + 30) parts[i] = spawn(false);
          break;
        case 'fireflies': {
          p.vx += (Math.random() - 0.5) * 20 * dt; p.vy += (Math.random() - 0.5) * 20 * dt;
          p.vx = NS.clamp(p.vx, -22, 22); p.vy = NS.clamp(p.vy, -22, 22);
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20; if (p.y < -20) p.y = H + 20; if (p.y > H + 20) p.y = -20;
          g.globalAlpha = 0.25 + 0.75 * Math.max(0, Math.sin(t * p.sp + p.ph));
          if (!sprite) sprite = makeSprite();
          g.drawImage(sprite, p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
          g.globalAlpha = 1;
          break;
        }
        case 'stars':
          g.fillStyle = `rgba(255,255,255,${0.25 + 0.75 * Math.abs(Math.sin(t * p.sp + p.ph))})`;
          g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill();
          break;
        default: break;
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function setMode(next, amt) {
    amount = NS.clamp((amt == null ? 60 : amt) / 100, 0.05, 1);
    if (NS.prefersReducedMotion()) next = next === 'stars' ? 'stars' : 'none';
    mode = next || 'none';
    const c = canvas();
    if (!c) return;
    if (mode === 'none') { cancelAnimationFrame(raf); raf = 0; c.getContext('2d').clearRect(0, 0, c.width, c.height); return; }
    resize();
    last = 0;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  window.addEventListener('resize', NS.debounce(() => { if (mode !== 'none') resize(); }, 150));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && mode !== 'none' && !raf) { last = 0; raf = requestAnimationFrame(frame); } });

  /* ---------------------------------------------------------------- win cascade (ported) */
  function cascade(board, done) {
    const cv = document.createElement('canvas');
    cv.id = 'cascade';
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    document.body.appendChild(cv);
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(10,8,22,.55)';
    g.fillRect(0, 0, cv.width, cv.height);

    const cs = getComputedStyle(document.documentElement);
    const faceBg = cs.getPropertyValue('--face-bg').trim() || '#fbf4e4';
    const edge = cs.getPropertyValue('--face-edge').trim() || '#999';
    const ink = cs.getPropertyValue('--ink').trim() || '#222';
    const red = cs.getPropertyValue('--red').trim() || '#b33';
    const four = document.documentElement.dataset.suits === 'four';
    const suitColor = (s) => four ? ['', '#d64541', '#3b82f6', '#2f9e5f'][s] || ink : (K.isRed(s) ? red : ink);

    const cw = Math.round(Math.max(48, board.m.cw)), ch = Math.round(cw * 1.4);
    const queue = [];
    for (let s = 0; s < 4; s++) {
      const r = board.foundRect(s);
      for (let rank = 13; rank >= 1; rank--) {
        const dir = s < 2 ? 1 : -1;
        queue.push({ suit: s, rank, x: r.left, y: r.top, vx: dir * (3.4 + Math.random() * 3.6), vy: -(4 + Math.random() * 4), active: false, done: false });
      }
    }
    let launched = 0, frames = 0, finished = false;

    function drawCard(c) {
      const x = Math.round(c.x), y = Math.round(c.y), rad = Math.round(cw * 0.07);
      g.fillStyle = faceBg; g.strokeStyle = edge; g.lineWidth = 1;
      g.beginPath(); g.roundRect ? g.roundRect(x, y, cw, ch, rad) : g.rect(x, y, cw, ch); g.fill(); g.stroke();
      g.fillStyle = suitColor(c.suit);
      g.font = `bold ${Math.round(cw * 0.24)}px Georgia, serif`;
      g.fillText(K.LBL[c.rank], x + cw * 0.08, y + cw * 0.28);
      g.font = `${Math.round(cw * 0.22)}px Georgia, serif`;
      g.fillText(K.SYM[c.suit], x + cw * 0.08, y + cw * 0.5);
      g.font = `${Math.round(cw * 0.5)}px Georgia, serif`;
      g.fillText(K.SYM[c.suit], x + cw * 0.5 - cw * 0.17, y + ch * 0.68);
    }

    const hint = document.createElement('div');
    hint.id = 'cascade-hint';
    hint.textContent = NS.t('fx.tap');
    document.body.appendChild(hint);
    function finish() {
      if (finished) return;
      finished = true;
      cv.remove();
      hint.remove();
      done && done();
    }
    setTimeout(finish, 9000); // never let the party outstay its welcome
    function tick() {
      if (finished) return;
      frames++;
      if (launched < queue.length && frames % 3 === 0) queue[launched++].active = true;
      let allDone = true;
      for (const c of queue) {
        if (!c.active || c.done) continue;
        allDone = false;
        c.vy += 0.25; c.x += c.vx; c.y += c.vy;
        if (c.y + ch >= cv.height) { c.y = cv.height - ch; c.vy = -c.vy * 0.75; if (Math.abs(c.vy) < 1) c.vy = -3; }
        if (c.x > cv.width + cw || c.x < -cw * 2) { c.done = true; continue; }
        drawCard(c);
      }
      if (allDone && launched >= queue.length) { setTimeout(finish, 700); return; }
      requestAnimationFrame(tick);
    }
    cv.addEventListener('pointerdown', finish);
    if (NS.prefersReducedMotion()) { setTimeout(finish, 300); return; }
    requestAnimationFrame(tick);
  }

  NS.fx = { setMode, cascade };
})();
