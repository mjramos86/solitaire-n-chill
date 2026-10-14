/* Game controller: owns the state, undo history, timer, persistence and statistics. */
(function () {
  'use strict';
  const NS = window.SNC;
  const K = NS.K;

  const sameFrom = (a, b) => a && b && a.type === b.type && a.col === b.col && a.idx === b.idx;
  const todaySeed = () => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };

  const Game = {
    state: null,
    undo: [],
    elapsed: 0,
    started: false,
    won: false,
    paused: 0,       // >0 while a dialog is open
    busy: false,     // auto-finish running
    board: null,
    sel: null,
    hintIdx: 0,
    stats: NS.store.get('stats', { played: 0, won: 0, bestTime: 0, bestMoves: 0, bestScore: 0, streak: 0, bestStreak: 0 }),

    /* ------------------------------------------------------------ lifecycle */
    init(board) {
      this.board = board;
      const saved = NS.store.get('game', null);
      if (saved && this.valid(saved.state)) {
        this.state = saved.state;
        this.undo = (saved.undo || []).filter(s => this.valid(s));
        this.elapsed = saved.elapsed || 0;
        this.started = !!saved.started;
        this.won = !!saved.won;
        board.render(this.state, { instant: true });
      } else {
        this.newGame({ silent: true });
      }
      setInterval(() => {
        if (this.started && !this.won && !document.hidden && !this.paused) { this.elapsed++; NS.bus.emit('tick'); }
      }, 1000);
      NS.bus.emit('state');
    },

    valid(s) {
      return !!(s && Array.isArray(s.tableau) && s.tableau.length === 7 && Array.isArray(s.stock) &&
        s.tableau.reduce((n, p) => n + p.length, 0) + s.stock.length + s.waste.length + s.foundations.reduce((n, f) => n + f.length, 0) === 52);
    },

    options() {
      const g = NS.settings.data.game;
      return {
        drawCount: g.drawCount === 3 ? 3 : 1,
        winnable: !!g.winnable,
        redeals: g.redeals === 'unlimited' ? K.UNLIMITED : parseInt(g.redeals, 10) || 0,
      };
    },

    /** opts: { seed, replay, daily, silent } */
    newGame(opts) {
      opts = opts || {};
      if (this.started && !this.won) { this.stats.streak = 0; this.saveStats(); }
      const o = this.options();
      let seed;
      if (opts.replay && this.state) {
        seed = this.state.seed;
        o.drawCount = this.state.drawCount;
        o.winnable = this.state.winnable;
      } else if (opts.daily) seed = todaySeed();
      else seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 1000000);
      this.state = K.newDeal(seed, o);
      this.state.daily = !!opts.daily;
      this.undo = [];
      this.elapsed = 0;
      this.started = false;
      this.won = false;
      this.busy = false;
      this.clearSel();
      this.board.clearHint();
      this.board.render(this.state, { deal: !opts.silent && !NS.prefersReducedMotion(), instant: !!opts.silent });
      this.save();
      NS.bus.emit('state');
      NS.bus.emit('newgame');
    },

    /* ------------------------------------------------------------ persistence */
    saveNow() {
      NS.store.set('game', { v: 1, state: this.state, undo: this.undo.slice(-40), elapsed: this.elapsed, started: this.started, won: this.won });
    },
    save: NS.debounce(function () { Game.saveNow(); }, 250),
    saveStats() { NS.store.set('stats', this.stats); },

    /* ------------------------------------------------------------ committing changes */
    commit(next, opts) {
      opts = opts || {};
      if (!this.started) { this.started = true; this.stats.played++; this.saveStats(); }
      this.undo.push(this.state);
      if (this.undo.length > 300) this.undo.shift();
      this.state = next;
      this.hintIdx = 0;
      this.clearSel();
      this.board.clearHint();
      NS.audio.sfx('moved');
      this.board.render(this.state, {});
      this.save();
      NS.bus.emit('state');
      if (K.won(this.state)) this.handleWin();
    },

    handleWin() {
      this.won = true;
      this.busy = false;
      const s = this.stats, st = this.state;
      s.won++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak);
      if (!s.bestTime || this.elapsed < s.bestTime) s.bestTime = this.elapsed;
      if (!s.bestMoves || st.moves < s.bestMoves) s.bestMoves = st.moves;
      s.bestScore = Math.max(s.bestScore, st.score);
      this.saveStats();
      this.save();
      NS.audio.winChime();
      NS.bus.emit('win');
      NS.fx.cascade(this.board, () => NS.bus.emit('winscreen'));
    },

    /* ------------------------------------------------------------ actions */
    move(from, to) {
      const r = K.applyMove(this.state, from, to);
      if (!r) return false;
      this.commit(r.state);
      return true;
    },

    drawStock() {
      const r = K.draw(this.state);
      if (!r) {
        if (this.state.stock.length === 0 && this.state.waste.length) NS.toast('No more passes through the deck – try undo, or start a new deal.');
        return false;
      }
      this.commit(r.state);
      return true;
    },

    undoMove() {
      if (this.busy) { this.busy = false; }
      if (!this.undo.length) { NS.toast('Nothing to undo'); return; }
      this.state = this.undo.pop();
      this.won = false;
      this.hintIdx = 0;
      this.clearSel();
      this.board.clearHint();
      NS.audio.sfx('moved');
      this.board.render(this.state, {});
      this.save();
      NS.bus.emit('state');
    },

    hint() {
      if (this.won) return;
      const hints = K.findHints(this.state);
      if (hints.length) {
        const h = hints[this.hintIdx % hints.length];
        this.hintIdx++;
        this.board.showHint(h);
        return;
      }
      if (this.state.stock.length || (this.state.waste.length && this.state.redealsLeft > 0)) {
        this.board.showHint({ draw: true });
        NS.toast('No moves on the table – try the deck');
      } else NS.toast('No moves left – undo a few steps, or start a fresh deal');
    },

    autoFinish() {
      if (this.busy) { this.busy = false; return; }
      if (!K.canAutoFinish(this.state)) { NS.toast('Reveal every card first, then I can finish for you'); return; }
      this.busy = true;
      let idle = 0;
      const stop = (msg) => { this.busy = false; if (msg) NS.toast(msg); NS.bus.emit('state'); };
      const step = () => {
        if (!this.busy) return stop();
        if (K.won(this.state)) return stop();
        const nf = K.nextFoundationStep(this.state);
        if (nf) { idle = 0; this.move(nf.from, nf.to); setTimeout(step, 110); return; }
        const d = K.draw(this.state);
        if (d && idle <= this.state.stock.length + this.state.waste.length + 1) {
          idle++;
          this.commit(d.state);
          setTimeout(step, 90);
          return;
        }
        stop('Almost there – the last few moves are yours');
      };
      NS.bus.emit('state');
      step();
    },

    /* ------------------------------------------------------------ selection + clicks */
    clearSel() { this.sel = null; if (this.board) this.board.setSelection(null); },
    select(from) { this.sel = from; this.board.setSelection(from); NS.audio.sfx('taken'); },

    pickup() { NS.audio.sfx('taken'); this.sel = null; this.board.setSelection(null); },

    click(hit) {
      if (this.busy || this.won) return;
      this.board.clearHint();
      if (hit.kind === 'none') { this.clearSel(); return; }
      if (hit.kind === 'stock') { this.clearSel(); this.drawStock(); return; }
      const sel = this.sel;
      if (sel) {
        if (hit.from && sameFrom(sel, hit.from)) { this.clearSel(); return; }
        if (hit.target && K.canMove(this.state, sel, hit.target) && this.move(sel, hit.target)) return;
        this.clearSel();
      }
      if (hit.kind === 'card' && hit.from) {
        if (NS.settings.data.game.clickToMove) {
          const to = K.autoTarget(this.state, hit.from);
          if (to && this.move(hit.from, to)) return;
        }
        this.select(hit.from);
      }
    },

    drop(from, to) {
      if (this.busy || this.won) return;
      if (to && this.move(from, to)) return;
      // refused: the board glides the cards home by itself
    },
  };

  NS.game = Game;
  NS.todaySeed = todaySeed;
  // dialogs pause the clock
  NS.bus.on('modal', (open) => { Game.paused = Math.max(0, Game.paused + (open ? 1 : -1)); });
})();
