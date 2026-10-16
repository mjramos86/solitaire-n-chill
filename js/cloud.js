/*
 * Cloud sync: optional Google sign-in (Firebase Auth) + saving of preferences, music list,
 * sticky note and statistics in the player's own Firestore document.
 *
 * - Local-first: the game always works from localStorage; the cloud is a mirror.
 * - Sections (settings / music / note) sync per section, newest change wins, with a one-time
 *   "which version do you want?" prompt when a device that already has its own data first
 *   meets an account that has different data.
 * - Statistics are merged (counters add up across devices, records keep the best value) so
 *   playing on two devices never loses games.
 * - The Firebase SDK is only downloaded when the site is configured (a moment after the page loads, so the
 *   Login click can open Google's pop-up straight away); an unconfigured site never loads it.
 * - All Firebase calls sit behind a small `backend` object (init/onAuth/signIn/signOut/get/set/stats/del)
 *   so the sync logic can be tested with an in-memory fake (see tests/cloud.sync.test.js).
 */
(function () {
  'use strict';
  const NS = window.SNC;
  const { h } = NS;

  const COL = 'snc_users';
  const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const SECTIONS = ['settings', 'music', 'note'];
  const DEBOUNCE_MS = 3000;

  const cfg = window.SNC_FIREBASE;
  const configured = !!(cfg && cfg.apiKey && cfg.projectId);

  const S = { backend: null, user: null, status: configured ? 'signedout' : 'off', message: '', lastSync: 0 };
  let meta = Object.assign({ settings: 0, music: 0, note: 0 }, NS.store.get('cloud.meta', {}));
  let link = NS.store.get('cloud.link', null); // { uid, synced:{}, rbase:{}, statsLinked }
  let delta = Object.assign({ played: 0, won: 0, touch: false }, NS.store.get('cloud.delta', {}));
  let applying = false, timer = 0, syncing = false, again = false, backendPromise = null;

  const saveMeta = () => NS.store.set('cloud.meta', meta);
  const saveLink = () => NS.store.set('cloud.link', link);
  const saveDelta = () => NS.store.set('cloud.delta', delta);
  const t = (...a) => NS.t(...a);
  /** status messages are stored as language keys ('cloud.…') so they follow a language change; anything else is shown as is */
  const msgText = (m) => (/^cloud\.\w+$/.test(m || '') ? t(m) : (m || ''));
  function setStatus(status, message) {
    S.status = status; S.message = message || '';
    NS.bus.emit('cloud');
  }

  /* ---------------------------------------------------------------- local <-> sections */
  const readLocal = {
    settings: () => JSON.stringify(NS.settings.data),
    music: () => JSON.stringify(NS.store.get('music', {})),
    note: () => JSON.stringify(NS.store.get('note', '')),
  };
  const applyLocal = {
    settings(json) { applying = true; try { NS.settings.replaceAll(JSON.parse(json)); } finally { applying = false; } },
    music(json) { const d = JSON.parse(json); NS.store.set('music', d); if (NS.music && NS.music.applyRemote) NS.music.applyRemote(d); },
    note(json) { NS.store.set('note', JSON.parse(json)); NS.bus.emit('noteRemote'); },
  };

  function markDirty(section) {
    if (applying) return;
    meta[section] = Date.now();
    saveMeta();
    schedule(DEBOUNCE_MS);
  }
  function schedule(ms) {
    if (!S.user || !S.backend) return;
    clearTimeout(timer);
    timer = setTimeout(sync, ms);
  }

  /* statistics: only counters need tracking, the rest is merged by value */
  function noteStat(kind) {
    if (kind === 'played' || kind === 'won') delta[kind]++;
    delta.touch = true;
    saveDelta();
    schedule(DEBOUNCE_MS);
  }
  const minNZ = (a, b) => (a && b) ? Math.min(a, b) : (a || b || 0);
  function mergeStats(R, L, d) {
    const r = R || {};
    return {
      played: (r.played || 0) + d.played, won: (r.won || 0) + d.won,
      bestTime: minNZ(r.bestTime, L.bestTime), bestMoves: minNZ(r.bestMoves, L.bestMoves),
      bestScore: Math.max(r.bestScore || 0, L.bestScore || 0), bestStreak: Math.max(r.bestStreak || 0, L.bestStreak || 0),
      streak: d.touch ? (L.streak || 0) : (r.streak != null ? r.streak : (L.streak || 0)),
    };
  }

  /* ---------------------------------------------------------------- the sync pass */
  function askConflict() {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const m = NS.modal.open({
        title: t('cloud.conflictTitle'),
        body: h('div', null,
          h('p.confirm-text', null, t('cloud.conflictText')),
          h('p.cz-note', { style: 'margin-top:10px' }, t('cloud.conflictNote'))),
        actions: [
          h('button.btn', { onclick: () => { finish('device'); m.close(); } }, t('cloud.keepDevice')),
          h('button.btn.primary', { onclick: () => { finish('cloud'); m.close(); } }, t('cloud.useAccount')),
        ],
        onClose: () => finish('cancel'),
      });
    });
  }

  async function syncStats(first) {
    const L = NS.game.stats;
    if (first || !link.statsLinked) delta = { played: L.played || 0, won: L.won || 0, touch: (L.played || 0) > 0 }; // guest history joins the account once (an empty device must not overwrite the account's streak)
    const d = { ...delta };
    const merged = await S.backend.stats(S.user.uid, (R) => mergeStats(R, L, d));
    const extra = { played: delta.played - d.played, won: delta.won - d.won }; // games finished while we were talking to the server
    Object.assign(L, merged);
    L.played += extra.played; L.won += extra.won;
    delta = { played: extra.played, won: extra.won, touch: delta.touch && (extra.played > 0 || extra.won > 0) };
    link.statsLinked = true;
    NS.store.set('stats', L);
    saveDelta();
    NS.bus.emit('state');
  }

  async function sync() {
    if (!S.user || !S.backend) return;
    if (syncing) { again = true; return; }
    syncing = true;
    clearTimeout(timer);
    setStatus('syncing');
    try {
      const uid = S.user.uid;
      const first = !link || link.uid !== uid;
      if (first) link = { uid, synced: { settings: 0, music: 0, note: 0 }, rbase: {}, statsLinked: false };
      const doc = await S.backend.get(uid);
      const rt = (doc && doc.t) || {};

      let choice = null;
      if (first && doc) {
        const conflicts = SECTIONS.filter(s => meta[s] > 0 && doc[s] != null && doc[s] !== readLocal[s]());
        if (conflicts.length) {
          choice = await askConflict();
          if (choice === 'cancel') { link = null; setStatus('paused', 'cloud.paused'); return; }
        }
      }

      const patch = { t: {} };
      let pushed = false;
      for (const s of SECTIONS) {
        const remoteHas = !!(doc && doc[s] != null);
        const localChanged = meta[s] > (link.synced[s] || 0);
        const remoteChanged = remoteHas && rt[s] !== link.rbase[s];
        let dir = null;
        if (first) {
          if (remoteHas && !(meta[s] > 0)) dir = 'pull';
          else if (!remoteHas && meta[s] > 0) dir = 'push';
          else if (remoteHas && meta[s] > 0) dir = doc[s] === readLocal[s]() ? 'same' : (choice === 'device' ? 'push' : 'pull');
        } else if (localChanged && remoteChanged) dir = meta[s] >= (rt[s] || 0) ? 'push' : 'pull';
        else if (localChanged) dir = 'push';
        else if (remoteChanged) dir = 'pull';

        if (dir === 'pull') {
          applyLocal[s](doc[s]);
          meta[s] = rt[s] || Date.now(); link.synced[s] = meta[s]; link.rbase[s] = rt[s];
        } else if (dir === 'push') {
          const t = meta[s] || Date.now();
          patch[s] = readLocal[s](); patch.t[s] = t;
          meta[s] = t; link.synced[s] = t; link.rbase[s] = t; pushed = true;
        } else if (dir === 'same') {
          meta[s] = rt[s] || meta[s]; link.synced[s] = meta[s]; link.rbase[s] = rt[s];
        }
      }
      if (pushed) await S.backend.set(uid, { ...patch, v: 1 });
      await syncStats(first);
      saveMeta(); saveLink();
      S.lastSync = Date.now();
      setStatus('synced');
    } catch (e) {
      console.warn('cloud sync failed', e);
      const offline = e && (e.code === 'unavailable' || /network|offline|Failed to fetch/i.test(String(e.message || e)));
      link = NS.store.get('cloud.link', null); // forget a half-finished first link
      setStatus(offline ? 'offline' : 'error', friendly(e));
      if (offline) schedule(30000);
    } finally {
      syncing = false;
      if (again) { again = false; schedule(1000); }
    }
  }

  function friendly(e) {
    const code = (e && e.code) || '';
    if (code === 'permission-denied' || code === 'firestore/permission-denied') return 'cloud.errRules';
    if (code === 'auth/unauthorized-domain') return 'cloud.errDomain';
    if (code === 'auth/operation-not-allowed') return 'cloud.errNotAllowed';
    if (code === 'auth/network-request-failed' || code === 'unavailable') return 'cloud.errNetwork';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
    return (e && e.message) ? String(e.message).slice(0, 140) : 'cloud.errGeneric';
  }

  /* ---------------------------------------------------------------- Firebase backend (compat SDK, loaded on demand) */
  function loadScript(src) {
    return new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = src; el.async = false;
      el.onload = res; el.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(el);
    });
  }
  function firebaseBackend() {
    let auth, db, fb;
    const ref = (uid) => db.collection(COL).doc(uid);
    return {
      async init() {
        if (!window.firebase) {
          await loadScript(SDK + 'firebase-app-compat.js');
          await Promise.all([loadScript(SDK + 'firebase-auth-compat.js'), loadScript(SDK + 'firebase-firestore-compat.js')]);
        }
        fb = window.firebase;
        if (!fb.apps.length) fb.initializeApp(cfg);
        auth = fb.auth(); db = fb.firestore();
      },
      onAuth(cb) {
        auth.getRedirectResult().catch((e) => setStatus('error', friendly(e)));
        auth.onAuthStateChanged(u => cb(u ? { uid: u.uid, name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' } : null));
      },
      async signIn() {
        const provider = new fb.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try { await auth.signInWithPopup(provider); } catch (e) {
          if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) return auth.signInWithRedirect(provider);
          throw e;
        }
      },
      signOut() { return auth.signOut(); },
      async get(uid) { const s = await ref(uid).get(); return s.exists ? s.data() : null; },
      async set(uid, data) { await ref(uid).set({ ...data, updatedAt: fb.firestore.FieldValue.serverTimestamp() }, { merge: true }); },
      async stats(uid, fn) {
        return db.runTransaction(async (tx) => {
          const s = await tx.get(ref(uid));
          const cur = s.exists && s.data().stats ? JSON.parse(s.data().stats) : null;
          const next = fn(cur);
          if (JSON.stringify(next) !== JSON.stringify(cur)) tx.set(ref(uid), { stats: JSON.stringify(next), v: 1, updatedAt: fb.firestore.FieldValue.serverTimestamp() }, { merge: true });
          return next;
        });
      },
      async del(uid) { await ref(uid).delete(); },
    };
  }

  /** The fake backend used by tests has the same shape; `get` must return `stats` as a JSON string like Firestore does. */
  function ensureBackend(silent) {
    if (S.backend) return Promise.resolve(S.backend);
    if (!backendPromise) {
      backendPromise = (async () => {
        const b = cfg.testBackend || firebaseBackend(); // testBackend: in-memory stand-in used by the test-suite
        await b.init();
        b.onAuth(onAuth);
        S.backend = b;
        return b;
      })().catch((e) => { backendPromise = null; if (!silent) setStatus('error', friendly(e)); throw e; });
    }
    return backendPromise;
  }

  function onAuth(user) {
    S.user = user;
    NS.store.set('cloud.wasSignedIn', !!user);
    if (user) { setStatus('syncing'); schedule(200); } else setStatus('signedout');
  }

  /* ---------------------------------------------------------------- public API */
  const Cloud = {
    configured,
    get state() { return S; },

    init() {
      if (!configured) return;
      document.body.classList.add('cloud-on');
      NS.bus.on('settings', () => markDirty('settings'));
      NS.bus.on('music', () => markDirty('music'));
      NS.bus.on('note', () => markDirty('note'));
      NS.bus.on('stats', () => schedule(DEBOUNCE_MS));
      document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user && Date.now() - S.lastSync > 60000) schedule(500); });
      window.addEventListener('online', () => { if (S.user) schedule(500); });
      // Load the SDK in the background: a pop-up is only allowed if it opens straight from the click, so the
      // script must already be there when the player presses Login.
      const preload = () => ensureBackend(true).catch(() => {});
      if (NS.store.get('cloud.wasSignedIn')) preload();
      else setTimeout(() => (window.requestIdleCallback ? window.requestIdleCallback(preload, { timeout: 4000 }) : preload()), 1200);
    },

    async signIn() {
      try {
        setStatus('connecting');
        // when the SDK is already loaded this calls the pop-up in the same tick as the click (browsers require that)
        const b = S.backend || await ensureBackend();
        await b.signIn();
        if (!S.user) setStatus('signedout');
      } catch (e) {
        const msg = friendly(e);
        setStatus('signedout', msg);
        if (msg) NS.toast(msgText(msg), 5000);
      }
    },
    async signOut() {
      if (!S.backend) return;
      clearTimeout(timer);
      await S.backend.signOut();
      NS.toast(t('cloud.signedOut'));
    },
    syncNow() { return sync(); },
    async deleteCloudData() {
      if (!S.user) return;
      try {
        await S.backend.del(S.user.uid);
        link = null; NS.store.remove('cloud.link');
        delta = { played: 0, won: 0, touch: false }; saveDelta();
        NS.toast(t('cloud.deleted'));
        setStatus('synced', 'cloud.deletedMsg');
      } catch (e) { NS.toast(msgText(friendly(e)) || t('cloud.deleteFail'), 5000); }
    },
    noteStat,

    /** Fills `box` with the account UI and keeps it up to date while it is on screen. */
    renderAccount(box) {
      const draw = () => {
        box.innerHTML = '';
        if (S.user) {
          const u = S.user;
          const ago = S.lastSync ? Math.max(0, Math.round((Date.now() - S.lastSync) / 1000)) : 0;
          const label = t({ syncing: 'cloud.st.syncing', synced: S.lastSync ? (ago < 10 ? 'cloud.st.justNow' : 'cloud.st.saved') : 'cloud.st.signedIn', offline: 'cloud.st.offline', error: 'cloud.st.error', paused: 'cloud.st.paused', connecting: 'cloud.st.connecting' }[S.status] || 'cloud.st.signedIn');
          box.append(...[
            h('div.acct-card', null,
              u.photo ? h('img.avatar.big', { src: u.photo, alt: '', referrerpolicy: 'no-referrer' }) : h('span.avatar.big.ph', null, (u.name || u.email || '?').slice(0, 1).toUpperCase()),
              h('div.acct-who', null, h('b', null, u.name || t('cloud.signedInFallback')), h('small', null, u.email))),
            h('div.acct-status.' + S.status, null, h('span.dot'), label),
            S.message ? h('div.mp-msg.show.warn', null, msgText(S.message)) : null,
            h('ul.acct-list', null,
              h('li', null, t('cloud.l1')), h('li', null, t('cloud.l2')), h('li', null, t('cloud.l3')), h('li', null, t('cloud.l4')),
              h('li.dim', null, t('cloud.l5'))),
            h('div.row', null,
              h('button.btn', { onclick: () => Cloud.syncNow() }, t('cloud.syncNow')),
              h('button.btn', { onclick: () => Cloud.signOut() }, t('cloud.signOut')),
              h('button.btn.danger', { onclick: () => NS.modal.confirm(t('cloud.deleteTitle'), t('cloud.deleteText'), t('cloud.delete'), () => Cloud.deleteCloudData()) }, t('cloud.deleteData')))].filter(Boolean));
        } else {
          const busy = S.status === 'connecting';
          box.append(...[
            h('p.cz-note', null, t('cloud.intro')),
            h('button.gbtn', { disabled: busy, onclick: () => Cloud.signIn() }, h('span.gmark', { innerHTML: G_LOGO }), t(busy ? 'cloud.opening' : 'cloud.google')),
            S.message ? h('div.mp-msg.show.warn', null, msgText(S.message)) : null,
            h('p.cz-note.fine', null, t('cloud.fine'))].filter(Boolean));
        }
      };
      const sub = () => {
        if (!box.isConnected) { off(); return; }
        draw();
      };
      const off = NS.bus.on('cloud', sub);
      const offLang = NS.bus.on('lang', () => { if (box.isConnected) draw(); else offLang(); });
      draw();
    },
  };

  const G_LOGO = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

  NS.cloud = Cloud;
  NS.cloudInternals = { mergeStats, SECTIONS };
})();
