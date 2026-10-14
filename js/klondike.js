/*
 * Klondike rules – pure functions over a plain-JSON state.
 * Ported from the Solitaire Tower of Doom web build (kl* functions) and
 * reshaped so every move returns a NEW state (cheap undo, easy persistence).
 *
 * state = {
 *   tableau: Card[7][], stock: Card[], waste: Card[], foundations: Card[4][],  // foundations[suit]
 *   fan: number,           // how many waste cards are fanned (draw-3 look)
 *   drawCount: 1|3, redealsLeft: number,
 *   moves, score, cardPoints: {id: pts}, seed, winnable
 * }
 * Card = { id, suit(0 ♠ 1 ♥ 2 ♦ 3 ♣), rank(1..13), faceUp }
 *
 * "from" = {type:'waste'|'tab'|'found', col, idx}     "to" = {type:'tab'|'found', col}
 */
(function () {
  'use strict';
  const NS = (window.SNC = window.SNC || {});

  const SYM = ['♠', '♥', '♦', '♣'];
  const LBL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const isRed = (suit) => suit === 1 || suit === 2;

  /* Scoring (klondike.md): every card is worth at most 20 points. */
  const MAX_CARD_PTS = 20;
  const PTS_WASTE_TO_TABLEAU = 5;
  const PTS_REVEAL = 5;
  const TOTAL_PTS = 52 * MAX_CARD_PTS; // 1040
  const UNLIMITED = 999;

  /* ---------- deck ---------- */
  function makeDeck() {
    const d = [];
    for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) d.push({ id: s * 13 + r - 1, suit: s, rank: r, faceUp: false });
    return d;
  }
  function shuffle(deck, rng) {
    const d = deck.map(c => ({ ...c }));
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }
  function clone(st) {
    const cp = (c) => ({ ...c });
    return {
      ...st,
      stock: st.stock.map(cp),
      waste: st.waste.map(cp),
      foundations: st.foundations.map(f => f.map(cp)),
      tableau: st.tableau.map(p => p.map(cp)),
      cardPoints: { ...st.cardPoints },
    };
  }

  /* ---------- dealing ---------- */
  function buildDeal(deck, opts) {
    const tableau = [];
    let idx = 0;
    for (let c = 0; c < 7; c++) {
      const pile = [];
      for (let r = 0; r <= c; r++) pile.push({ ...deck[idx++], faceUp: r === c });
      tableau.push(pile);
    }
    const stock = deck.slice(idx).map(c => ({ ...c, faceUp: false }));
    return {
      tableau, stock, waste: [], foundations: [[], [], [], []], fan: 0,
      drawCount: opts.drawCount === 3 ? 3 : 1,
      redealsLeft: opts.redeals == null ? UNLIMITED : opts.redeals,
      moves: 0, score: 0, cardPoints: {},
    };
  }

  /** Same seed + same options => same deal (the winnable retry loop is deterministic too). */
  function newDeal(seed, opts) {
    const rng = NS.mkRng(seed);
    let st;
    for (let attempt = 0; attempt < 25; attempt++) {
      st = buildDeal(shuffle(makeDeck(), rng), opts);
      if (!opts.winnable || greedySolvable(st)) break;
    }
    st.seed = seed;
    st.winnable = !!opts.winnable;
    return st;
  }

  /* ---------- predicates ---------- */
  function canFoundation(card, foundations) {
    const f = foundations[card.suit];
    return f.length === 0 ? card.rank === 1 : f[f.length - 1].rank === card.rank - 1;
  }
  function canTableau(cards, pile) {
    if (!cards || !cards.length) return false;
    const m = cards[0];
    if (!pile.length) return m.rank === 13;
    const top = pile[pile.length - 1];
    return top.faceUp && top.rank === m.rank + 1 && isRed(top.suit) !== isRed(m.suit);
  }
  const won = (st) => st.foundations.every(f => f.length === 13);

  /* ---------- scoring ---------- */
  function cardScore(st, card, pts) {
    const earned = st.cardPoints[card.id] || 0;
    const give = Math.min(pts, MAX_CARD_PTS - earned);
    if (give > 0) { st.cardPoints[card.id] = earned + give; st.score += give; }
    return give;
  }
  /** Flip every exposed face-down tableau card. Returns the ids of revealed cards. */
  function autoReveal(st) {
    const revealed = [];
    st.tableau.forEach(col => {
      if (col.length && !col[col.length - 1].faceUp) {
        const c = col[col.length - 1];
        c.faceUp = true;
        cardScore(st, c, PTS_REVEAL);
        revealed.push(c.id);
      }
    });
    return revealed;
  }
  function revealSilent(st) {
    st.tableau.forEach(col => { if (col.length && !col[col.length - 1].faceUp) col[col.length - 1].faceUp = true; });
  }

  /* ---------- moves ---------- */
  function cardsFrom(st, from) {
    if (!from) return [];
    if (from.type === 'waste') return st.waste.length ? [st.waste[st.waste.length - 1]] : [];
    if (from.type === 'tab') return (st.tableau[from.col] || []).slice(from.idx);
    if (from.type === 'found') { const f = st.foundations[from.col]; return f && f.length ? [f[f.length - 1]] : []; }
    return [];
  }

  function canMove(st, from, to) {
    const cards = cardsFrom(st, from);
    if (!cards.length || !cards[0].faceUp) return false;
    if (to.type === 'found') return cards.length === 1 && canFoundation(cards[0], st.foundations);
    if (to.type === 'tab') {
      if (from.type === 'tab' && from.col === to.col) return false;
      return canTableau(cards, st.tableau[to.col]);
    }
    return false;
  }

  /** Returns { state, revealed:[ids] } or null if illegal. */
  function applyMove(st, from, to) {
    if (!canMove(st, from, to)) return null;
    const s = clone(st);
    const cards = cardsFrom(s, from);
    const lead = cards[0];
    if (from.type === 'waste') {
      s.waste.pop();
      s.fan = s.waste.length ? Math.max(1, s.fan - 1) : 0;
    } else if (from.type === 'tab') s.tableau[from.col].splice(from.idx);
    else s.foundations[from.col].pop();

    if (to.type === 'found') {
      if (from.type === 'waste') cardScore(s, lead, PTS_WASTE_TO_TABLEAU);
      s.foundations[lead.suit].push(lead);
      cardScore(s, lead, MAX_CARD_PTS);
    } else {
      if (from.type === 'waste') cardScore(s, lead, PTS_WASTE_TO_TABLEAU);
      s.tableau[to.col].push(...cards);
    }
    const revealed = autoReveal(s);
    s.moves++;
    return { state: s, revealed };
  }

  /** Click the stock. Returns { state, recycled, drawn } or null when there is nothing to do. */
  function draw(st) {
    if (!st.stock.length && !st.waste.length) return null;
    const s = clone(st);
    if (!s.stock.length) {
      if (s.redealsLeft <= 0) return null;
      s.stock = s.waste.reverse().map(c => ({ ...c, faceUp: false }));
      s.waste = [];
      s.fan = 0;
      s.redealsLeft--;
      s.moves++;
      return { state: s, recycled: true, drawn: [] };
    }
    const drawn = [];
    for (let i = 0; i < s.drawCount && s.stock.length > 0; i++) {
      const c = s.stock.pop();
      c.faceUp = true;
      s.waste.push(c);
      drawn.push(c.id);
    }
    s.fan = drawn.length;
    s.moves++;
    return { state: s, recycled: false, drawn };
  }

  /**
   * Smart single-click target (from the original autoMoveKlondike):
   * foundation first, otherwise the unambiguous non-empty column, otherwise an empty one.
   * Returns a `to`, or null when the choice is ambiguous / impossible (caller then selects).
   */
  function autoTarget(st, from) {
    const cards = cardsFrom(st, from);
    if (!cards.length || !cards[0].faceUp) return null;
    if (cards.length === 1 && from.type !== 'found' && canFoundation(cards[0], st.foundations)) {
      return { type: 'found', col: cards[0].suit };
    }
    if (from.type === 'found') return null;
    const valid = [];
    for (let d = 0; d < 7; d++) {
      if (from.type === 'tab' && d === from.col) continue;
      if (canTableau(cards, st.tableau[d])) valid.push(d);
    }
    if (!valid.length) return null;
    const nonEmpty = valid.filter(d => st.tableau[d].length > 0);
    if (nonEmpty.length > 1) return null;
    if (nonEmpty.length === 1) return { type: 'tab', col: nonEmpty[0] };
    // only empty columns: a king that already sits on the bottom of its pile gains nothing
    if (from.type === 'tab' && from.idx === 0) return null;
    return { type: 'tab', col: valid[0] };
  }

  /** All sensible moves, best first (foundation, then tableau; waste before tableau). */
  function findHints(st) {
    const hints = [];
    const wTop = st.waste.length ? st.waste[st.waste.length - 1] : null;
    if (wTop) {
      if (canFoundation(wTop, st.foundations)) hints.push({ from: { type: 'waste', col: -1, idx: -1 }, to: { type: 'found', col: wTop.suit } });
    }
    for (let c = 0; c < 7; c++) {
      const pile = st.tableau[c];
      if (!pile.length) continue;
      const top = pile[pile.length - 1];
      if (top.faceUp && canFoundation(top, st.foundations)) hints.push({ from: { type: 'tab', col: c, idx: pile.length - 1 }, to: { type: 'found', col: top.suit } });
    }
    // moves that flip a face-down card are the most useful tableau moves
    const tabMoves = [];
    for (let c = 0; c < 7; c++) {
      const pile = st.tableau[c];
      for (let idx = 0; idx < pile.length; idx++) {
        if (!pile[idx].faceUp) continue;
        const cards = pile.slice(idx);
        for (let d = 0; d < 7; d++) {
          if (d === c || !canTableau(cards, st.tableau[d])) continue;
          if (!st.tableau[d].length && idx === 0) continue; // pointless king shuffle
          tabMoves.push({ from: { type: 'tab', col: c, idx }, to: { type: 'tab', col: d }, reveals: idx > 0 && !pile[idx - 1].faceUp, size: cards.length });
        }
        break; // only the whole face-up run is worth suggesting from each column
      }
    }
    tabMoves.sort((a, b) => (b.reveals - a.reveals) || (b.size - a.size));
    hints.push(...tabMoves);
    if (wTop) {
      for (let d = 0; d < 7; d++) {
        if (canTableau([wTop], st.tableau[d])) hints.push({ from: { type: 'waste', col: -1, idx: -1 }, to: { type: 'tab', col: d } });
      }
    }
    return hints;
  }

  /* ---------- auto finish (the "cozy" shortcut once nothing is hidden) ---------- */
  function canAutoFinish(st) {
    return !won(st) && st.tableau.every(p => p.every(c => c.faceUp));
  }
  /** Next foundation move, if any. */
  function nextFoundationStep(st) {
    if (st.waste.length) {
      const t = st.waste[st.waste.length - 1];
      if (canFoundation(t, st.foundations)) return { from: { type: 'waste', col: -1, idx: -1 }, to: { type: 'found', col: t.suit } };
    }
    for (let c = 0; c < 7; c++) {
      const p = st.tableau[c];
      if (p.length && canFoundation(p[p.length - 1], st.foundations)) {
        return { from: { type: 'tab', col: c, idx: p.length - 1 }, to: { type: 'found', col: p[p.length - 1].suit } };
      }
    }
    return null;
  }

  /* ---------- "is this deal friendly?" – the original's greedy test-solver ---------- */
  function greedySolvable(gs) {
    let s = clone(gs);
    s.redealsLeft = UNLIMITED;
    for (let iter = 0; iter < 600; iter++) {
      if (won(s)) return true;
      let moved = false;
      let again = true;
      while (again) {
        again = false;
        for (let c = 0; c < 7; c++) {
          const p = s.tableau[c];
          if (!p.length) continue;
          const t = p[p.length - 1];
          if (t.faceUp && canFoundation(t, s.foundations)) { p.pop(); s.foundations[t.suit].push(t); revealSilent(s); again = moved = true; }
        }
        if (s.waste.length) {
          const t = s.waste[s.waste.length - 1];
          if (canFoundation(t, s.foundations)) { s.waste.pop(); s.foundations[t.suit].push(t); again = moved = true; }
        }
      }
      if (moved) continue;
      for (let sc = 0; sc < 7 && !moved; sc++) {
        const sp = s.tableau[sc];
        if (!sp.length) continue;
        let si = sp.length - 1;
        while (si > 0 && sp[si].faceUp) si--;
        if (!sp[si].faceUp) si++;
        const cards = sp.slice(si);
        if (!cards.length || !cards[0].faceUp) continue;
        for (let dc = 0; dc < 7 && !moved; dc++) {
          if (dc === sc) continue;
          if (canTableau(cards, s.tableau[dc]) && s.tableau[dc].length > 0) {
            s.tableau[dc].push(...s.tableau[sc].splice(si));
            revealSilent(s);
            moved = true;
          }
        }
      }
      if (moved) continue;
      const snap = s.stock.length + ',' + s.waste.length;
      const d = draw(s);
      if (!d) break;
      s = d.state;
      if (s.stock.length + ',' + s.waste.length === snap) break;
    }
    return won(s);
  }

  NS.K = {
    SYM, LBL, isRed, MAX_CARD_PTS, TOTAL_PTS, UNLIMITED,
    makeDeck, shuffle, clone, newDeal, buildDeal,
    canFoundation, canTableau, canMove, cardsFrom, applyMove, draw, autoTarget, findHints,
    canAutoFinish, nextFoundationStep, won, autoReveal,
  };
})();
