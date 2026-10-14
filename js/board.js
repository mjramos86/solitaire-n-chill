/*
 * Board: renders a Klondike state and handles pointer input.
 *
 * Feel ported from the Tower of Doom web build:
 *   - cards glide with cubic-bezier(.22,.68,0,1) over .25s, stacks stagger by 28ms
 *   - reveals flip, picked-up cards tilt with horizontal drag velocity and lift (scale 1.04)
 *   - clicking is "smart": unambiguous destinations are taken automatically
 * Unlike the original (which rebuilt innerHTML and FLIP-ed from snapshots) every card
 * here is a persistent element positioned with transform, so CSS transitions do the work.
 */
(function () {
  'use strict';
  const NS = window.SNC;
  const { h, clamp } = NS;
  const K = NS.K;

  const TXT = '︎'; // force text (not emoji) presentation of suit glyphs

  /* pip layouts: [x%, y%, rotated?] inside the pip area */
  const PIPS = (() => {
    const L = 0, C = 50, R = 100;
    const six = [[L, 0], [R, 0], [L, 50], [R, 50], [L, 100, 1], [R, 100, 1]];
    return {
      2: [[C, 0], [C, 100, 1]],
      3: [[C, 0], [C, 50], [C, 100, 1]],
      4: [[L, 0], [R, 0], [L, 100, 1], [R, 100, 1]],
      5: [[L, 0], [R, 0], [C, 50], [L, 100, 1], [R, 100, 1]],
      6: six,
      7: [...six, [C, 25]],
      8: [...six, [C, 25], [C, 75, 1]],
      9: [[L, 0], [R, 0], [L, 33.3], [R, 33.3], [L, 66.7, 1], [R, 66.7, 1], [L, 100, 1], [R, 100, 1], [C, 50]],
      10: [[L, 0], [R, 0], [L, 33.3], [R, 33.3], [L, 66.7, 1], [R, 66.7, 1], [L, 100, 1], [R, 100, 1], [C, 16.7], [C, 83.3, 1]],
    };
  })();
  const COURT_GLYPH = { 11: '♞', 12: '♛', 13: '♚' };

  function cardHTML(card) {
    const r = K.LBL[card.rank], s = K.SYM[card.suit] + TXT;
    const idx = `<div class="idx"><b>${r}</b><i>${s}</i></div>`;
    let center;
    if (card.rank === 1) center = `<div class="ace">${s}</div>`;
    else if (card.rank <= 10) {
      center = '<div class="pips">' + PIPS[card.rank].map(([x, y, rot]) =>
        `<span class="pip${rot ? ' r' : ''}" style="left:${x}%;top:${y}%">${s}</span>`).join('') + '</div>';
    } else {
      center = `<div class="court"><span class="cg">${COURT_GLYPH[card.rank]}${TXT}</span><span class="cl">${r}</span><span class="cs">${s}</span></div>`;
    }
    return `<div class="flip"><div class="face front">${idx}${center}<div class="idx br">${`<b>${r}</b><i>${s}</i>`}</div></div><div class="face back"></div></div>`;
  }

  const GAP_RATIO = 0.14;
  const ASPECT = 1.4;

  class Board {
    constructor(root, cb) {
      this.root = root;
      this.cb = cb; // { click(hit), drop(from,to), pickup() }
      this.state = null;
      this.m = null;
      this.pos = new Map();
      this.els = new Map();
      this.sel = null;
      this.hint = null;
      this.hintTimer = 0;
      this.drag = null;
      this.pending = null;
      this.returning = new Set();
      this.cardScale = 1;

      this.slotsEl = h('div.slots');
      this.cardsEl = h('div.cards');
      this.badge = h('div.stock-count');
      root.append(this.slotsEl, this.cardsEl, this.badge);

      this.slots = { stock: h('div.slot.stock', { dataset: { kind: 'stock' } }, h('span.slot-ico')), waste: h('div.slot.waste', { dataset: { kind: 'waste' } }), found: [], tab: [] };
      this.slotsEl.append(this.slots.stock, this.slots.waste);
      for (let s = 0; s < 4; s++) {
        const el = h('div.slot.found', { dataset: { kind: 'found', col: s } }, h('span.slot-suit.s' + s, K.SYM[s] + TXT));
        this.slots.found.push(el); this.slotsEl.append(el);
      }
      for (let c = 0; c < 7; c++) {
        const el = h('div.slot.tab', { dataset: { kind: 'tab', col: c } }, h('span.slot-king', 'K'));
        this.slots.tab.push(el); this.slotsEl.append(el);
      }

      K.makeDeck().forEach(card => {
        const el = h('div.card.s' + card.suit, { dataset: { id: card.id } });
        el.innerHTML = cardHTML(card);
        el.style.transform = 'translate3d(0,0,0)';
        this.els.set(card.id, el);
        this.cardsEl.appendChild(el);
      });

      root.addEventListener('pointerdown', (e) => this.onDown(e));
      root.addEventListener('pointermove', (e) => this.onMove(e));
      root.addEventListener('pointerup', (e) => this.onUp(e));
      root.addEventListener('pointercancel', (e) => this.onCancel(e));
      root.addEventListener('contextmenu', (e) => e.preventDefault());
      this.ro = new ResizeObserver(() => this.relayout());
      this.ro.observe(root);
    }

    /* ------------------------------------------------------------ geometry */
    setCardScale(pct) { this.cardScale = clamp(pct / 100, 0.6, 1.25); this.relayout(); }

    measure() {
      const W = this.root.clientWidth, H = this.root.clientHeight;
      if (!W || !H) return false;
      const pad = clamp(W * 0.015, 6, 18);
      const widthFit = (W - pad * 2) / (7 + 6 * GAP_RATIO);
      const heightFit = H / (ASPECT * 3.5);
      const base = Math.min(widthFit, heightFit, 132);
      const cw = Math.max(34, Math.floor(Math.min(widthFit, base * this.cardScale)));
      const ch = Math.round(cw * ASPECT);
      const gap = Math.round(cw * GAP_RATIO);
      const total = cw * 7 + gap * 6;
      this.m = { W, H, cw, ch, gap, x0: Math.round((W - total) / 2), rowGap: Math.round(ch * 0.2), tabY: ch + Math.round(ch * 0.2) };
      const s = this.root.style;
      s.setProperty('--cw', cw + 'px');
      s.setProperty('--ch', ch + 'px');
      document.documentElement.style.setProperty('--cw', cw + 'px');
      // slots
      const place = (el, col, y) => { el.style.cssText = `width:${cw}px;height:${ch}px;transform:translate(${this.colX(col)}px,${y}px)`; };
      place(this.slots.stock, 0, 0);
      place(this.slots.waste, 1, 0);
      this.slots.found.forEach((el, i) => place(el, 3 + i, 0));
      this.slots.tab.forEach((el, i) => place(el, i, this.m.tabY));
      this.badge.style.transform = `translate(${this.colX(0) + cw - 2}px,${ch - 4}px)`;
      return true;
    }
    colX(col) { return this.m.x0 + col * (this.m.cw + this.m.gap); }

    /** Vertical spacing for one tableau column, compressed so long runs always fit. */
    steps(pile) {
      const { ch, H, tabY } = this.m;
      const down = pile.filter(c => !c.faceUp).length;
      const up = Math.max(0, pile.length - down);
      let sd = ch * 0.13;
      const avail = H - tabY - ch - 10;
      // tall, narrow screens (phones) have vertical room to spare: fan face-up runs out for readability
      let su = clamp((avail - 3 * sd) / 8, ch * 0.27, ch * 0.42);
      const need = down * sd + Math.max(0, up - 1) * su;
      if (need > avail && need > 0) {
        const k = avail / need;
        sd = Math.max(ch * 0.045, sd * k);
        su = Math.max(ch * 0.11, su * k);
        const need2 = down * sd + Math.max(0, up - 1) * su;
        if (need2 > avail) { const k2 = avail / need2; sd *= k2; su *= k2; }
      }
      return { sd, su };
    }

    targets() {
      const st = this.state, m = this.m;
      const t = new Map();
      this.cols = [];
      const put = (c, x, y, z, dest, key) => t.set(c.id, { x: Math.round(x), y: Math.round(y), z, up: c.faceUp, dest, key });
      st.stock.forEach((c, i) => put(c, this.colX(0), 0, 10 + i, 'stock', i));
      const n = st.waste.length;
      const off = Math.round(m.cw * 0.24);
      st.waste.forEach((c, i) => {
        const rel = n - 1 - i;
        const slot = rel < st.fan ? st.fan - 1 - rel : 0;
        put(c, this.colX(1) + slot * off, 0, 100 + i, 'waste', i);
      });
      st.foundations.forEach((f, s) => f.forEach((c, i) => put(c, this.colX(3 + s), 0, 200 + i, 'found' + s, i)));
      st.tableau.forEach((pile, col) => {
        const { sd, su } = this.steps(pile);
        let y = m.tabY;
        let lastY = m.tabY;
        pile.forEach((c, i) => {
          put(c, this.colX(col), y, 300 + i, 'tab' + col, i);
          lastY = y;
          y += c.faceUp ? su : sd;
        });
        this.cols.push({ x: this.colX(col), lastY: Math.round(lastY) });
      });
      return t;
    }

    /* ------------------------------------------------------------ rendering */
    render(state, opts) { this.state = state; this.layout(opts || {}); }
    relayout() {
      if (!this.state) return;
      if (this.drag) this.abortDrag(); // a resize / rotation mid-drag: put the cards back rather than strand them
      if (this.measure()) this.layout({ instant: true });
    }
    abortDrag() {
      const d = this.drag;
      this.drag = null;
      this.pending = null;
      this.root.classList.remove('is-dragging');
      d.ids.forEach(id => { const el = this.els.get(id); el.classList.remove('dragging'); el.style.rotate = ''; });
      this.refreshMarks();
    }

    layout(opts) {
      if (!this.state || !this.measure()) return;
      const st = this.state;
      const tg = this.targets();
      const instant = !!opts.instant;
      const root = this.root;

      if (opts.deal) {
        // start every card face-down on the stock, then deal out (like shuffling a fresh deck)
        root.classList.add('nomove');
        for (const [id] of tg) {
          const el = this.els.get(id);
          el.classList.remove('up', 'flying');
          el.style.setProperty('--d', '0ms');
          el.style.zIndex = '10';
          el.style.transform = `translate3d(${this.colX(0)}px,0,0)`;
          this.pos.set(id, { x: this.colX(0), y: 0 });
        }
        void root.offsetWidth;
        root.classList.remove('nomove');
      }

      const groups = new Map();
      const dealOrder = new Map();
      if (opts.deal) {
        let k = 0;
        for (let r = 0; r < 7; r++) for (let c = r; c < 7; c++) dealOrder.set(st.tableau[c][r].id, k++);
      }
      if (instant) root.classList.add('nomove');

      for (const [id, t] of tg) {
        const el = this.els.get(id);
        const prev = this.pos.get(id);
        const moved = !prev || prev.x !== t.x || prev.y !== t.y || this.returning.has(id);
        el.style.transform = `translate3d(${t.x}px,${t.y}px,0)`;
        el.style.zIndex = String(t.z);
        el.classList.toggle('up', t.up);
        el.dataset.dest = t.dest;
        if (moved && !instant) {
          if (dealOrder.has(id)) {
            const d = dealOrder.get(id) * 38 + 60;
            el.style.setProperty('--d', d + 'ms');
            this.fly(el, d);
          } else {
            const g = groups.get(t.dest) || [];
            g.push({ el, key: t.key });
            groups.set(t.dest, g);
          }
        } else if (!moved) {
          el.style.setProperty('--d', '0ms');
        }
        this.pos.set(id, { x: t.x, y: t.y });
      }
      groups.forEach(list => {
        list.sort((a, b) => a.key - b.key);
        const stepMs = list.length > 6 ? Math.min(28, 420 / list.length) : 28;
        list.forEach((it, i) => { const d = Math.round(i * stepMs); it.el.style.setProperty('--d', d + 'ms'); this.fly(it.el, d); });
      });
      this.returning.clear();
      if (instant) { void root.offsetWidth; root.classList.remove('nomove'); }

      // stock badge + slot state
      this.badge.textContent = st.stock.length ? String(st.stock.length) : '';
      const sl = this.slots.stock;
      sl.dataset.state = st.stock.length ? 'full' : (st.waste.length ? (st.redealsLeft > 0 ? 'recycle' : 'blocked') : 'empty');
      this.slots.found.forEach((el, s) => el.classList.toggle('filled', st.foundations[s].length > 0));
      this.refreshMarks();
    }

    fly(el, delay) {
      el.classList.add('flying');
      clearTimeout(el._flyT);
      el._flyT = setTimeout(() => el.classList.remove('flying'), 250 + delay + 120);
    }

    /* ------------------------------------------------------------ marks (selection / hints / drop target) */
    idsFor(from) { return from ? K.cardsFrom(this.state, from).map(c => c.id) : []; }
    clearMarks() {
      this.root.querySelectorAll('.sel,.hint-src,.hint-dst,.drop-ok').forEach(el => el.classList.remove('sel', 'hint-src', 'hint-dst', 'drop-ok'));
    }
    pileEls(to) {
      const out = [];
      if (to.type === 'tab') {
        const p = this.state.tableau[to.col];
        out.push(p.length ? this.els.get(p[p.length - 1].id) : this.slots.tab[to.col]);
      } else {
        const f = this.state.foundations[to.col];
        out.push(f.length ? this.els.get(f[f.length - 1].id) : this.slots.found[to.col]);
      }
      return out;
    }
    refreshMarks() {
      this.clearMarks();
      if (!this.state) return;
      if (this.sel) {
        const ids = this.idsFor(this.sel);
        if (!ids.length) this.sel = null;
        ids.forEach(id => this.els.get(id).classList.add('sel'));
      }
      if (this.hint) {
        if (this.hint.draw) this.slots.stock.classList.add('hint-dst');
        else {
          this.idsFor(this.hint.from).forEach(id => this.els.get(id).classList.add('hint-src'));
          this.pileEls(this.hint.to).forEach(el => el.classList.add('hint-dst'));
        }
      }
      if (this.drag && this.drag.target) this.pileEls(this.drag.target).forEach(el => el.classList.add('drop-ok'));
    }
    setSelection(from) { this.sel = from; this.refreshMarks(); }
    showHint(hint, ms = 2400) {
      clearTimeout(this.hintTimer);
      this.hint = hint;
      this.refreshMarks();
      if (hint) this.hintTimer = setTimeout(() => this.clearHint(), ms);
    }
    clearHint() { if (this.hint) { clearTimeout(this.hintTimer); this.hint = null; this.refreshMarks(); } }

    /* ------------------------------------------------------------ hit testing */
    locate(id) {
      const st = this.state;
      let i = st.stock.findIndex(c => c.id === id);
      if (i >= 0) return { kind: 'stock' };
      i = st.waste.findIndex(c => c.id === id);
      if (i >= 0) return i === st.waste.length - 1 ? { kind: 'card', from: { type: 'waste', col: -1, idx: -1 } } : { kind: 'none' };
      for (let s = 0; s < 4; s++) {
        i = st.foundations[s].findIndex(c => c.id === id);
        if (i >= 0) return i === st.foundations[s].length - 1
          ? { kind: 'card', from: { type: 'found', col: s, idx: -1 }, target: { type: 'found', col: s } } : { kind: 'none' };
      }
      for (let c = 0; c < 7; c++) {
        i = st.tableau[c].findIndex(x => x.id === id);
        if (i >= 0) return st.tableau[c][i].faceUp
          ? { kind: 'card', from: { type: 'tab', col: c, idx: i }, target: { type: 'tab', col: c } }
          : { kind: 'card', from: null, target: { type: 'tab', col: c } };
      }
      return { kind: 'none' };
    }
    hitFromEvent(e) {
      const cardEl = e.target.closest && e.target.closest('.card');
      if (cardEl) return this.locate(+cardEl.dataset.id);
      const slot = e.target.closest && e.target.closest('.slot');
      if (slot) {
        const k = slot.dataset.kind;
        if (k === 'stock') return { kind: 'stock' };
        if (k === 'waste') return { kind: 'none' };
        return { kind: 'slot', target: { type: k, col: +slot.dataset.col } };
      }
      // empty board area under a tableau column strip counts as that column
      const r = this.root.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (this.m && y > this.m.tabY) {
        for (let c = 0; c < 7; c++) {
          if (x >= this.colX(c) - this.m.gap / 2 && x <= this.colX(c) + this.m.cw + this.m.gap / 2) return { kind: 'slot', target: { type: 'tab', col: c } };
        }
      }
      return { kind: 'none' };
    }

    /* ------------------------------------------------------------ pointer input */
    onDown(e) {
      if (!this.state || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (this.drag || this.pending) return;
      const hit = this.hitFromEvent(e);
      if (hit.kind === 'none') { this.cb.click({ kind: 'none' }); return; }
      this.pending = { hit, id: e.pointerId, x0: e.clientX, y0: e.clientY, px: e.clientX };
      const cardEl = e.target.closest('.card');
      if (cardEl) {
        const r = cardEl.getBoundingClientRect();
        this.pending.grab = { x: e.clientX - r.left, y: e.clientY - r.top };
      }
      try { this.root.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }

    onMove(e) {
      const p = this.pending;
      if (!p || p.id !== e.pointerId) return;
      const dx = e.clientX - p.x0, dy = e.clientY - p.y0;
      if (!this.drag) {
        if (Math.hypot(dx, dy) < 7) return;
        if (!p.hit.from || p.hit.kind !== 'card') return; // slots, stock and hidden cards are click-only
        this.startDrag(p);
      }
      e.preventDefault();
      this.updateDrag(e, dx, dy);
    }

    startDrag(p) {
      const from = p.hit.from;
      const cards = K.cardsFrom(this.state, from);
      if (!cards.length || !cards[0].faceUp) return;
      this.clearHint();
      this.cb.pickup && this.cb.pickup(from);
      this.drag = { from, ids: cards.map(c => c.id), base: cards.map(c => ({ ...this.pos.get(c.id) })), target: null, tilt: 0 };
      this.drag.ids.forEach((id, i) => {
        const el = this.els.get(id);
        el.classList.add('dragging');
        el.classList.remove('flying');
        el.style.zIndex = String(2000 + i);
      });
      this.root.classList.add('is-dragging');
    }

    updateDrag(e, dx, dy) {
      const d = this.drag;
      const vx = e.clientX - this.pending.px;
      this.pending.px = e.clientX;
      d.tilt += (clamp(vx * 0.4, -6, 6) - d.tilt) * 0.5;
      d.ids.forEach((id, i) => {
        const el = this.els.get(id);
        el.style.transform = `translate3d(${d.base[i].x + dx}px,${d.base[i].y + dy}px,0)`;
        el.style.rotate = d.tilt.toFixed(2) + 'deg';
      });
      const r = this.root.getBoundingClientRect();
      const to = this.findDropTarget(d.from, d.base[0].x + dx, d.base[0].y + dy, e.clientX - r.left, e.clientY - r.top);
      const changed = JSON.stringify(to) !== JSON.stringify(d.target);
      d.target = to;
      if (changed) this.refreshMarks();
    }

    findDropTarget(from, lx, ly, px, py) {
      const m = this.m, st = this.state;
      let best = null, bestScore = 0;
      const consider = (to, rx, ry, stripX0, stripX1, stripY0, stripY1) => {
        const ox = Math.max(0, Math.min(lx + m.cw, rx + m.cw) - Math.max(lx, rx));
        const oy = Math.max(0, Math.min(ly + m.ch, ry + m.ch) - Math.max(ly, ry));
        let score = ox * oy;
        if (px >= stripX0 && px <= stripX1 && py >= stripY0 && py <= stripY1) score += m.cw * m.ch * 0.6;
        if (score > m.cw * m.ch * 0.06 && score > bestScore) { best = to; bestScore = score; }
      };
      for (let c = 0; c < 7; c++) {
        const to = { type: 'tab', col: c };
        if (!K.canMove(st, from, to)) continue;
        const x = this.colX(c);
        const y = st.tableau[c].length ? this.cols[c].lastY : m.tabY;
        consider(to, x, y, x - m.gap / 2, x + m.cw + m.gap / 2, m.tabY - m.ch * 0.3, m.H);
      }
      const cards = K.cardsFrom(st, from);
      if (cards.length === 1) {
        const to = { type: 'found', col: cards[0].suit };
        if (K.canMove(st, from, to)) {
          // any foundation slot works – the card finds its own suit pile
          for (let s = 0; s < 4; s++) {
            const x = this.colX(3 + s);
            consider(to, x, 0, x - m.gap / 2, x + m.cw + m.gap / 2, -m.ch * 0.3, m.ch * 1.3);
          }
        }
      }
      return best;
    }

    onUp(e) {
      const p = this.pending;
      if (!p || p.id !== e.pointerId) return;
      try { this.root.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.pending = null;
      if (!this.drag) { this.cb.click(p.hit); return; }
      const d = this.drag;
      this.drag = null;
      this.root.classList.remove('is-dragging');
      d.ids.forEach(id => {
        const el = this.els.get(id);
        el.classList.remove('dragging');
        el.style.rotate = '';
        this.returning.add(id);
      });
      this.refreshMarks();
      this.cb.drop(d.from, d.target);
      // if the drop was refused (or nothing changed) glide the cards home
      if (this.returning.size) this.layout({});
    }

    onCancel(e) {
      const p = this.pending;
      if (!p || p.id !== e.pointerId) return;
      this.pending = null;
      if (this.drag) {
        this.drag.ids.forEach(id => this.returning.add(id));
        this.abortDrag();
        this.layout({});
      }
    }

    /* ------------------------------------------------------------ helpers for effects */
    /** viewport rect of a foundation pile */
    foundRect(s) {
      const r = this.root.getBoundingClientRect();
      return { left: r.left + this.colX(3 + s), top: r.top, width: this.m.cw, height: this.m.ch };
    }
    cardRect(id) { return this.els.get(id).getBoundingClientRect(); }
  }

  NS.Board = Board;
})();
