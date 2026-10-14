/* Shared helpers: namespaced storage, tiny event bus, DOM builder, rng, toast. */
(function () {
  'use strict';
  const NS = (window.SNC = window.SNC || {});

  /* ---------- storage (every access guarded: private windows / quota) ---------- */
  NS.store = {
    prefix: 'snc.',
    get(key, fallback) {
      try {
        const v = localStorage.getItem(this.prefix + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(this.prefix + key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    remove(key) { try { localStorage.removeItem(this.prefix + key); } catch (e) { /* ignore */ } },
    clearAll() {
      try {
        Object.keys(localStorage).filter(k => k.startsWith(this.prefix)).forEach(k => localStorage.removeItem(k));
      } catch (e) { /* ignore */ }
    },
  };

  /* ---------- event bus ---------- */
  NS.bus = (function () {
    const map = {};
    return {
      on(evt, fn) { (map[evt] = map[evt] || []).push(fn); return () => { map[evt] = map[evt].filter(f => f !== fn); }; },
      emit(evt, ...args) {
        (map[evt] || []).slice().forEach(fn => { try { fn(...args); } catch (err) { console.error(err); } });
      },
    };
  })();

  /* ---------- DOM ---------- */
  NS.$ = (sel, root) => (root || document).querySelector(sel);
  NS.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** Tiny hyperscript: h('div.cls#id', {onclick, style:{}, dataset:{}}, ...children) */
  NS.h = function (tag, props, ...kids) {
    const m = /^([a-z0-9-]+)((?:[.#][\w-]+)*)/i.exec(tag);
    // allow h('b.x', 'text') / h('div', child) – a non-plain-object second argument is a child
    if (props != null && (typeof props !== 'object' || props.nodeType || Array.isArray(props))) { kids.unshift(props); props = null; }
    const el = document.createElement(m ? m[1] : 'div');
    if (m && m[2]) {
      m[2].replace(/([.#])([\w-]+)/g, (_, k, v) => { if (k === '.') el.classList.add(v); else el.id = v; });
    }
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') v.split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
        else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else Object.assign(el.style, v); }
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k in el && k !== 'list' && typeof v !== 'object') { try { el[k] = v; } catch (e) { el.setAttribute(k, v); } }
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    const add = (kid) => {
      if (kid == null || kid === false) return;
      if (Array.isArray(kid)) kid.forEach(add);
      else el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
    };
    kids.forEach(add);
    return el;
  };

  /* ---------- misc ---------- */
  NS.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  NS.pad2 = (n) => String(n).padStart(2, '0');
  NS.fmtTime = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${NS.pad2(m)}:${NS.pad2(s)}` : `${m}:${NS.pad2(s)}`;
  };
  NS.prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** mulberry32 – small, fast, good enough for shuffles; a seed of 0 is fine. */
  NS.mkRng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  NS.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------- toast ---------- */
  NS.toast = function (msg, ms = 2600) {
    let host = document.getElementById('toasts');
    if (!host) { host = NS.h('div#toasts', { 'aria-live': 'polite' }); document.body.appendChild(host); }
    if (Array.from(host.children).some(c => c.textContent === msg)) return; // no duplicate stacks
    const t = NS.h('div.toast', null, msg);
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 350); }, ms);
  };

  /** Downscale an image File/Blob to a JPEG/PNG data-URL so it fits in localStorage. */
  NS.imageToDataURL = function (file, maxSide, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL(file.type === 'image/png' && maxSide <= 600 ? 'image/png' : 'image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
      img.src = url;
    });
  };
})();
