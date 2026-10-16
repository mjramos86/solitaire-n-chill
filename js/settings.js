/* Settings: one JSON blob, deep-merged over defaults, persisted, with change events. */
(function () {
  'use strict';
  const NS = window.SNC;

  const DEFAULTS = {
    lang: 'auto',          // 'auto' (follow the browser) | fr | en | es | pt | de | ru
    game: {
      drawCount: 1,        // 1 | 3
      winnable: true,      // retry shuffles until a simple solver can win them
      redeals: 'unlimited', // 'unlimited' | '3' | '0'
      clickToMove: true,   // single click sends a card to its obvious destination
      zen: false,          // hide moves / time / score
    },
    look: {
      bg: { id: 'rainy-night', c1: '#3a3f6b', c2: '#16182e', angle: 160, url: '' },
      dim: 0.12,
      blur: 0,
      grain: true,
      fx: 'rain',
      fxAmount: 60,         // 0-100
      fxFromWeather: false,
      back: { design: 'moon', c1: '#1f3a4f', c2: '#f6eac2', url: '' },
      face: 'cream',
      suits: 'classic',     // 'classic' | 'four'
      cardScale: 100,       // %
      mat: 0.28,
      matStyle: 'glass',    // 'glass' | 'felt' | 'none'
      accent: '#ffb86b',
    },
    sound: {
      sfx: true,
      sfxVolume: 0.7,
      ambience: { rain: 0, wind: 0, fire: 0 },
    },
    widgets: {
      left: ['clock', 'weather', 'quote'],
      right: ['stats', 'focus', 'note'],
      hidden: ['news', 'ambience'],
      cfg: {
        clock: { h24: null, seconds: false, date: true }, // h24 null = follow the language
        weather: { name: '', lat: null, lon: null, units: 'c' },
        focus: { focus: 25, short: 5, long: 15 },
        news: { region: 'auto', topics: ['top'], place: '', query: '', custom: '', count: 8 },
      },
    },
  };

  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  function merge(base, over) {
    if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
    const out = { ...base };
    for (const k of Object.keys(over)) out[k] = isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k];
    return out;
  }
  const copy = (o) => JSON.parse(JSON.stringify(o));

  let data = merge(copy(DEFAULTS), NS.store.get('settings', {}));
  // every widget id the app knows must live in exactly one list
  function normaliseWidgets() {
    const all = ['clock', 'weather', 'quote', 'stats', 'focus', 'note', 'news', 'ambience'];
    const w = data.widgets;
    const seen = new Set();
    ['left', 'right', 'hidden'].forEach(k => { w[k] = (w[k] || []).filter(id => all.includes(id) && !seen.has(id) && seen.add(id)); });
    all.forEach(id => { if (!seen.has(id)) w.hidden.push(id); });
  }
  normaliseWidgets();

  const save = NS.debounce(() => NS.store.set('settings', data), 150);

  NS.settings = {
    DEFAULTS,
    get data() { return data; },
    get(path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), data); },
    /** set('look.dim', .2) – emits 'settings' with the changed path. */
    set(path, value) {
      const keys = path.split('.');
      let o = data;
      for (let i = 0; i < keys.length - 1; i++) { if (!isObj(o[keys[i]])) o[keys[i]] = {}; o = o[keys[i]]; }
      o[keys[keys.length - 1]] = value;
      save();
      NS.bus.emit('settings', path);
    },
    /** Merge a partial object at a path (used by vibes). */
    patch(path, partial) {
      const cur = this.get(path);
      this.set(path, merge(cur, partial));
    },
    replaceAll(obj) {
      data = merge(copy(DEFAULTS), obj || {});
      normaliseWidgets();
      NS.store.set('settings', data);
      NS.bus.emit('settings', '*');
    },
    reset() { this.replaceAll({}); },
    flush() { NS.store.set('settings', data); },
  };
  window.addEventListener('pagehide', () => NS.settings.flush());
})();
