/* App shell: top bar, menus, dialogs, keyboard, settings → page, boot. */
(function () {
  'use strict';
  const NS = window.SNC;
  const { h, $ } = NS;
  const t = NS.t;
  const S = NS.settings;

  /* ================================================================ modal */
  const modals = [];
  NS.modal = {
    open({ title, body, wide, actions, className, onClose }) {
      const prevFocus = document.activeElement;
      const close = () => {
        const i = modals.indexOf(m);
        if (i < 0) return;
        modals.splice(i, 1);
        wrap.classList.remove('in');
        setTimeout(() => wrap.remove(), 220);
        NS.bus.emit('modal', false);
        if (onClose) onClose();
        if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* ignore */ } }
      };
      const dlg = h('div.modal' + (wide ? '.wide' : '') + (className ? '.' + className : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div.modal-head', null, h('h2', null, title), h('button.ico', { 'aria-label': t('btn.close'), title: t('btn.close'), onclick: close }, '✕')),
        h('div.modal-body', null, body),
        actions && actions.length ? h('div.modal-actions', null, actions) : null);
      const wrap = h('div.modal-wrap', { onpointerdown: (e) => { if (e.target === wrap) close(); } }, dlg);
      $('#modal-root').appendChild(wrap);
      requestAnimationFrame(() => wrap.classList.add('in'));
      const m = { close, el: wrap };
      modals.push(m);
      NS.bus.emit('modal', true);
      if (!window.matchMedia('(pointer: coarse)').matches) { // no stray focus ring / keyboard pop-up on touch screens
        setTimeout(() => { const f = dlg.querySelector('[autofocus], .modal-actions .primary, .cz-tabs .on, input, button'); if (f) f.focus({ preventScroll: true }); }, 40);
      }
      return m;
    },
    closeAll() { modals.slice().forEach(m => m.close()); },
    any() { return modals.length > 0; },
    confirm(title, text, okLabel, onOk) {
      const m = NS.modal.open({
        title, body: h('p.confirm-text', null, text),
        actions: [h('button.btn', { onclick: () => m.close() }, t('confirm.later')), h('button.btn.primary', { onclick: () => { m.close(); onOk(); } }, okLabel)],
      });
    },
  };

  /* ================================================================ popup menu */
  let openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
  function popMenu(anchor, items, opts) {
    closeMenu();
    const menu = h('div.menu', { role: 'menu' }, items.map(it => it === '-' ? h('hr') : h('button' + (it.on ? '.on' : ''), { role: 'menuitem', onclick: () => { closeMenu(); it.run(); } },
      h('span.menu-check', null, it.on ? '✓' : ''), h('span' + (it.cls ? '.' + it.cls : ''), null, it.label), it.hint ? h('small', null, it.hint) : null)));
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    // menus opened from the dock flip upwards so they stay on screen
    const up = (opts && opts.up) || (r.bottom + 6 + menu.offsetHeight > window.innerHeight - 8 && r.top > menu.offsetHeight + 14);
    if (up) { menu.classList.add('up'); menu.style.top = Math.max(8, r.top - 6 - menu.offsetHeight) + 'px'; } else menu.style.top = (r.bottom + 6) + 'px';
    const left = opts && opts.alignRight ? r.right - menu.offsetWidth : r.left;
    menu.style.left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, left)) + 'px';
    openMenu = menu;
    setTimeout(() => document.addEventListener('pointerdown', function off(e) {
      if (!menu.contains(e.target)) { closeMenu(); document.removeEventListener('pointerdown', off, true); }
    }, true), 0);
  }

  /* ================================================================ game actions */
  function startNew(kind) {
    const g = NS.game;
    const go = () => { NS.modal.closeAll(); g.newGame(kind === 'daily' ? { daily: true } : kind === 'replay' ? { replay: true } : {}); };
    if (g.started && !g.won && g.state.moves > 8) NS.modal.confirm(t('confirm.newTitle'), t('confirm.newText'), t('confirm.newOk'), go);
    else go();
  }

  function showWin() {
    const g = NS.game, st = g.state, s = g.stats;
    const zen = S.data.game.zen;
    const m = NS.modal.open({
      title: t('win.title'),
      className: 'win',
      body: h('div.win-body', null,
        h('p', null, t('win.text')),
        zen ? null : h('div.win-grid', null,
          h('div', null, h('b', null, NS.fmtTime(g.elapsed)), h('span', null, t('stat.time'))),
          h('div', null, h('b', null, st.moves), h('span', null, t('stat.moves'))),
          h('div', null, h('b', null, st.score), h('span', null, t('stat.score')))),
        zen ? null : h('p.win-sub', null, t('win.sub', { best: NS.fmtTime(s.bestTime), streak: s.streak, won: s.won, played: s.played }))),
      actions: [h('button.btn', { onclick: () => m.close() }, t('win.admire')), h('button.btn.primary', { autofocus: true, onclick: () => { m.close(); g.newGame(); } }, t('win.again'))],
    });
  }

  /* ================================================================ settings → page */
  let lastWeather = null;
  function effectiveFx() {
    const l = S.data.look;
    if (l.fxFromWeather && lastWeather) {
      const c = lastWeather.code;
      if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) return 'rain';
      if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
    }
    return l.fx;
  }
  function applyFx() { NS.fx.setMode(effectiveFx(), S.data.look.fxAmount); }
  function applyAll(path) {
    const look = S.data.look;
    NS.themes.applyLook(look);
    document.body.classList.toggle('zen', !!S.data.game.zen);
    const all = !path || path === '*' || path === 'look'; // 'look' = a whole-look patch (vibes)
    if (all || path.startsWith('look.fx')) applyFx();
    if (all || path === 'look.cardScale') NS.board.setCardScale(look.cardScale);
  }
  NS.bus.on('weather', (w) => { lastWeather = w; if (S.data.look.fxFromWeather) applyFx(); });

  /* ================================================================ boot */
  function boot() {
    NS.board = new NS.Board($('#board'), {
      click: (hit) => NS.game.click(hit),
      drop: (from, to) => NS.game.drop(from, to),
      pickup: (from) => NS.game.pickup(from),
    });
    NS.bus.on('settings', applyAll);
    applyAll('*');
    NS.game.init(NS.board);

    NS.i18n.applyStatic();
    NS.widgets.init({ left: $('#rail-left'), right: $('#rail-right'), drawerList: $('#drawer-list'), tray: $('#tray') });
    NS.music.init($('#music'));

    /* top bar */
    const g = NS.game;
    const undoBtn = $('#btn-undo'), finishBtn = $('#btn-finish'), miniStats = $('#mini-stats');
    $('#btn-new').addEventListener('click', (e) => popMenu(e.currentTarget, [
      { label: t('menu.newDeal'), hint: 'N', run: () => startNew('new') },
      { label: t('menu.daily'), hint: t('menu.dailyHint'), run: () => startNew('daily') },
      { label: t('menu.replay'), run: () => startNew('replay') },
      '-',
      { label: t('menu.draw1'), on: S.data.game.drawCount === 1, run: () => setDraw(1) },
      { label: t('menu.draw3'), on: S.data.game.drawCount === 3, run: () => setDraw(3) },
    ]));
    function setDraw(n) {
      S.set('game.drawCount', n);
      if (!g.started || g.won) startNew('new'); else NS.toast(t(n === 1 ? 'toast.draw1Next' : 'toast.draw3Next'));
    }
    $('#btn-lang').addEventListener('click', (e) => popMenu(e.currentTarget, NS.i18n.LANGS.map(l => ({
      label: l.name, on: NS.i18n.current() === l.code, cls: 'menu-native', run: () => NS.i18n.set(l.code),
    })), { up: true, alignRight: true }));
    undoBtn.addEventListener('click', () => g.undoMove());
    $('#btn-hint').addEventListener('click', () => g.hint());
    finishBtn.addEventListener('click', () => g.autoFinish());
    $('#btn-customize').addEventListener('click', () => NS.customize.open());
    $('#btn-widgets').addEventListener('click', () => { if (NS.widgets.wide()) NS.widgets.setEdit(!NS.widgets.edit); else document.body.classList.toggle('drawer-open'); });
    $('#drawer-close').addEventListener('click', () => document.body.classList.remove('drawer-open'));
    $('#drawer-arrange').addEventListener('click', () => { NS.widgets.setEdit(true); });
    NS.bus.on('drawer', (open) => document.body.classList.toggle('drawer-open', !!open));

    function refreshBar() {
      const st = g.state;
      undoBtn.disabled = !g.undo.length;
      const can = st && NS.K.canAutoFinish(st);
      finishBtn.hidden = !can;
      finishBtn.classList.toggle('active', g.busy);
      finishBtn.querySelector('.lbl').textContent = t(g.busy ? 'btn.stop' : 'btn.finish');
      const zen = S.data.game.zen;
      miniStats.hidden = zen;
      miniStats.innerHTML = '';
      if (!zen) miniStats.append(h('span', null, st.moves, h('small', null, ' ' + t('stat.moves'))), h('span', null, h('small', null, ' · '), NS.fmtTime(g.elapsed)), h('span', null, h('small', null, ' · '), st.score, h('small', null, ' ' + t('stat.pts'))));
    }
    NS.bus.on('state', refreshBar); NS.bus.on('tick', refreshBar); NS.bus.on('settings', refreshBar); NS.bus.on('lang', refreshBar);
    refreshBar();

    NS.bus.on('winscreen', showWin);

    /* optional cloud account (only present once js/firebase-config.js has a config) */
    if (NS.cloud && NS.cloud.configured) {
      const btn = $('#btn-account');
      btn.hidden = false;
      // signed out: the button signs in right away; signed in: it opens the account page
      btn.addEventListener('click', () => { if (NS.cloud.state.user) NS.customize.open('account'); else NS.cloud.signIn(); });
      const paint = () => {
        const u = NS.cloud.state.user, st = NS.cloud.state.status;
        btn.classList.toggle('signed', !!u);
        btn.classList.toggle('guest', !u);
        btn.dataset.status = st;
        btn.title = u ? t('tip.account', { name: u.name || u.email }) : t('tip.login');
        btn.querySelector('.acct-lbl').textContent = u ? ((u.name || u.email || t('tab.account')).split(' ')[0]) : (st === 'connecting' ? '…' : t('btn.login'));
        btn.disabled = st === 'connecting';
        const ico = btn.querySelector('.acct-ico');
        ico.innerHTML = '';
        if (u && u.photo) ico.append(h('img.avatar', { src: u.photo, alt: '', referrerpolicy: 'no-referrer' }));
        else ico.textContent = u ? (u.name || u.email || '?').slice(0, 1).toUpperCase() : '👤';
        if (u) ico.append(h('span.sdot'));
      };
      NS.bus.on('cloud', paint); NS.bus.on('lang', paint);
      paint();
      NS.cloud.init();
    }

    /* audio needs a gesture before it may start */
    const unlock = () => { NS.audio.resumeSaved(); document.removeEventListener('pointerdown', unlock, true); };
    document.addEventListener('pointerdown', unlock, true);

    /* keyboard */
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === 'Escape') {
        if (openMenu) { closeMenu(); return; }
        if (modals.length) { modals[modals.length - 1].close(); return; }
        if (NS.widgets.edit) { NS.widgets.setEdit(false); return; }
        if (document.body.classList.contains('drawer-open')) { document.body.classList.remove('drawer-open'); return; }
        if (NS.music.open) { NS.music.setOpen(false); return; }
        g.clearSel(); g.board.clearHint();
        return;
      }
      if (typing || modals.length || e.altKey) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); g.undoMove(); return; }
      if (e.ctrlKey || e.metaKey) return;
      if (t && t.tagName === 'BUTTON' && e.key === ' ') return; // let focused buttons use space
      switch (e.key.toLowerCase()) {
        case 'u': g.undoMove(); break;
        case 'h': g.hint(); break;
        case 'f': g.autoFinish(); break;
        case 'n': startNew('new'); break;
        case 'm': NS.music.setOpen(!NS.music.open); break;
        case 'd': case ' ': e.preventDefault(); if (!g.busy && !g.won) { g.clearSel(); g.drawStock(); } break;
        default: break;
      }
    }, true); // capture: inputs stop propagation of their own keys, but Escape must always get through

    /* keep the clock honest while hidden tabs sleep: persist on leave */
    window.addEventListener('pagehide', () => { g.saveNow(); });

    /* keep --vvh = the visible height (shrinks when a phone keyboard is open) and undo any page pan after typing */
    const vv = window.visualViewport;
    const setVvh = () => document.documentElement.style.setProperty('--vvh', (vv ? vv.height : window.innerHeight) + 'px');
    setVvh();
    if (vv) vv.addEventListener('resize', setVvh);
    document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement || !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) window.scrollTo(0, 0); }, 60));

    document.body.classList.add('ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
