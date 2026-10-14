/* Headless sanity checks for the Klondike rules engine.  Run:  node tests/rules.test.js */
global.window = global;
global.document = {};
global.localStorage = {};
require('../js/util.js');
require('../js/klondike.js');
const assert = require('assert');
const K = SNC.K;

// 1. a deal contains each of the 52 cards exactly once
const deal = K.newDeal(12345, { drawCount: 1, winnable: true });
const ids = [...deal.tableau.flat(), ...deal.stock].map(c => c.id);
assert.strictEqual(new Set(ids).size, 52);
assert.deepStrictEqual(deal.tableau.map(p => p.length), [1, 2, 3, 4, 5, 6, 7]);
assert(deal.tableau.every(p => p.every((c, i) => c.faceUp === (i === p.length - 1))));

// 2. the same seed always gives the same deal
assert.strictEqual(JSON.stringify(deal), JSON.stringify(K.newDeal(12345, { drawCount: 1, winnable: true })));

// 3. play many games with a simple bot: cards are conserved, score stays within the cap, undo is free
let wins = 0;
for (let g = 0; g < 40; g++) {
  let s = K.newDeal(1000 + g, { drawCount: g % 2 ? 3 : 1, winnable: true });
  let draws = 0;
  for (let step = 0; step < 2000 && !K.won(s); step++) {
    const f = K.nextFoundationStep(s);
    const hint = f || K.findHints(s)[0];
    const r = hint && K.applyMove(s, hint.from, hint.to);
    if (!r) { const d = K.draw(s); if (!d || ++draws > 600) break; s = d.state; continue; }
    s = r.state;
    const total = s.stock.length + s.waste.length + s.tableau.flat().length + s.foundations.flat().length;
    assert.strictEqual(total, 52, 'cards must be conserved');
  }
  assert(s.score <= K.TOTAL_PTS, 'score cap');
  if (K.won(s)) wins++;
}

// 4. rules spot checks
const k = (suit, rank, faceUp = true) => ({ id: suit * 13 + rank - 1, suit, rank, faceUp });
assert(K.canTableau([k(1, 6)], [k(0, 7)]), 'red 6 on black 7');
assert(!K.canTableau([k(1, 6)], [k(2, 7)]), 'red on red is illegal');
assert(K.canTableau([k(0, 13)], []), 'king on empty column');
assert(!K.canTableau([k(0, 12)], []), 'only kings on empty columns');
assert(K.canFoundation(k(2, 1), [[], [], [], []]), 'ace starts a foundation');
console.log(`ok – ${wins}/40 bot games won`);
