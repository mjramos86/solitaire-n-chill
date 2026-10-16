/*
 * Tiny i18n layer.
 *   NS.t('key', {name: value})   – look up a string (falls back to English, then to the key itself)
 *   NS.i18n.set('fr')            – switch language (saved in settings, applied live)
 * Dictionaries live in js/lang/<code>.js and register themselves with NS.i18n.add(code, {...}).
 * Plurals: give `key_one`, `key_other` (…`_few`, `_many` for Russian) and call t(key, {n}).
 */
(function () {
  'use strict';
  const NS = window.SNC;

  /* the order shown in the menu; `locale` is what Intl (dates, plurals, country names) should use */
  const LANGS = [
    { code: 'fr', name: 'Français', locale: 'fr' },
    { code: 'en', name: 'English', locale: 'en' },
    { code: 'es', name: 'Español (Latinoamérica)', locale: 'es-419' },
    { code: 'pt', name: 'Português (Brasil)', locale: 'pt-BR' },
    { code: 'de', name: 'Deutsch', locale: 'de' },
    { code: 'ru', name: 'Русский', locale: 'ru' },
  ];
  const dicts = {};
  let active = null, plural = null;

  const supported = (code) => LANGS.some(l => l.code === code);
  const detect = () => {
    const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    for (const l of list) { const p = String(l).toLowerCase().split('-')[0]; if (supported(p)) return p; }
    return 'en';
  };
  const resolve = () => {
    const pref = NS.settings && NS.settings.data && NS.settings.data.lang;
    return supported(pref) ? pref : detect();
  };

  function activate(code) {
    active = code;
    const loc = I18n.locale();
    try { plural = new Intl.PluralRules(loc); } catch (e) { plural = null; }
    document.documentElement.lang = loc;
  }

  function t(key, params) {
    if (!active) activate(resolve());
    const d = dicts[active] || {}, en = dicts.en || {};
    let s;
    if (params && typeof params.n === 'number') {
      const cat = plural ? plural.select(params.n) : 'other';
      s = d[key + '_' + cat] || d[key + '_other'] || en[key + '_' + cat] || en[key + '_other'];
    }
    if (s == null) s = d[key] != null ? d[key] : (en[key] != null ? en[key] : key);
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
    return s;
  }

  /** translate everything that is written statically in index.html */
  function applyStatic() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.querySelectorAll('[data-i18n-content]').forEach(el => { el.setAttribute('content', t(el.dataset.i18nContent)); });
    const lb = document.getElementById('btn-lang');
    if (lb) { lb.querySelector('.lang-code').textContent = active.toUpperCase(); lb.title = t('tip.language'); lb.setAttribute('aria-label', t('tip.language')); }
  }

  const I18n = {
    LANGS,
    add(code, dict) { dicts[code] = Object.assign(dicts[code] || {}, dict); },
    dict(code) { return dicts[code]; },
    current() { if (!active) activate(resolve()); return active; },
    locale() { const l = LANGS.find(x => x.code === (active || resolve())); return l ? l.locale : 'en'; },
    /** switch language: saved in the settings (so it also follows the account) and applied everywhere */
    set(code) { if (supported(code)) NS.settings.set('lang', code); },
    /** re-read the setting and refresh the page if the language really changed */
    refresh(force) {
      const next = resolve();
      if (!force && next === active) return;
      activate(next);
      applyStatic();
      NS.bus.emit('lang', next);
    },
    applyStatic,
    /** localised name of a country / region code (falls back to the English name list) */
    regionName(code, fallback) {
      try { return new Intl.DisplayNames([I18n.locale()], { type: 'region' }).of(code) || fallback; } catch (e) { return fallback; }
    },
    /** "3 min ago" style text in the current language */
    ago(ms) {
      const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
      try {
        const rtf = new Intl.RelativeTimeFormat(I18n.locale(), { numeric: 'auto', style: 'short' });
        if (m < 1) return rtf.format(0, 'minute');
        if (m < 60) return rtf.format(-m, 'minute');
        const hr = Math.round(m / 60);
        if (hr < 24) return rtf.format(-hr, 'hour');
        return rtf.format(-Math.round(hr / 24), 'day');
      } catch (e) { return m < 60 ? m + 'm' : Math.round(m / 60) + 'h'; }
    },
  };

  NS.i18n = I18n;
  NS.t = t;
  // the setting can change from elsewhere (language menu, backup import, another device via the account)
  NS.bus.on('settings', (p) => { if (p === 'lang' || p === '*') I18n.refresh(); });
})();
