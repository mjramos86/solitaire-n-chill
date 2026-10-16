/*
 * News widget: headlines for a chosen part of the world and chosen subjects.
 *
 * Source: Google News RSS (regional editions + topic sections + keyword search + local "geo" news).
 * A browser page can't read that feed directly (no CORS), so each feed is requested through a
 * public relay; the relays are tried in turn and the one that last worked is tried first.
 * Any RSS/Atom feed URL can be added as an extra source.
 */
(function () {
  'use strict';
  const NS = window.SNC;
  const { h, clamp } = NS;

  /* [code, label, hl, gl, ceid-language] – Google News "editions" */
  const REGIONS = [
    ['WORLD', '🌍 Worldwide (English)', 'en', 'US', 'en'],
    ['US', 'United States', 'en-US', 'US', 'en'], ['GB', 'United Kingdom', 'en-GB', 'GB', 'en'], ['CA', 'Canada (English)', 'en-CA', 'CA', 'en'], ['CA-FR', 'Canada – Québec (français)', 'fr-CA', 'CA', 'fr'],
    ['AU', 'Australia', 'en-AU', 'AU', 'en'], ['NZ', 'New Zealand', 'en-NZ', 'NZ', 'en'], ['IE', 'Ireland', 'en-IE', 'IE', 'en'],
    ['IN', 'India', 'en-IN', 'IN', 'en'], ['SG', 'Singapore', 'en-SG', 'SG', 'en'], ['PH', 'Philippines', 'en-PH', 'PH', 'en'],
    ['MY', 'Malaysia', 'en-MY', 'MY', 'en'], ['ZA', 'South Africa', 'en-ZA', 'ZA', 'en'], ['NG', 'Nigeria', 'en-NG', 'NG', 'en'],
    ['KE', 'Kenya', 'en-KE', 'KE', 'en'], ['IL', 'Israel', 'en-IL', 'IL', 'en'],
    ['FR', 'France', 'fr', 'FR', 'fr'], ['DE', 'Germany', 'de', 'DE', 'de'], ['AT', 'Austria', 'de', 'AT', 'de'], ['CH', 'Switzerland', 'de', 'CH', 'de'],
    ['ES', 'Spain', 'es', 'ES', 'es'], ['MX', 'Mexico', 'es-419', 'MX', 'es-419'], ['AR', 'Argentina', 'es-419', 'AR', 'es-419'],
    ['CO', 'Colombia', 'es-419', 'CO', 'es-419'], ['CL', 'Chile', 'es-419', 'CL', 'es-419'], ['PE', 'Peru', 'es-419', 'PE', 'es-419'],
    ['BR', 'Brazil', 'pt-BR', 'BR', 'pt-419'], ['PT', 'Portugal', 'pt-PT', 'PT', 'pt-150'],
    ['IT', 'Italy', 'it', 'IT', 'it'], ['NL', 'Netherlands', 'nl', 'NL', 'nl'], ['BE', 'Belgium', 'nl', 'BE', 'nl'],
    ['SE', 'Sweden', 'sv', 'SE', 'sv'], ['NO', 'Norway', 'no', 'NO', 'no'], ['DK', 'Denmark', 'da', 'DK', 'da'], ['FI', 'Finland', 'fi', 'FI', 'fi'],
    ['PL', 'Poland', 'pl', 'PL', 'pl'], ['CZ', 'Czechia', 'cs', 'CZ', 'cs'], ['HU', 'Hungary', 'hu', 'HU', 'hu'], ['RO', 'Romania', 'ro', 'RO', 'ro'],
    ['GR', 'Greece', 'el', 'GR', 'el'], ['TR', 'Türkiye', 'tr', 'TR', 'tr'], ['UA', 'Ukraine', 'uk', 'UA', 'uk'],
    ['EG', 'Egypt', 'ar', 'EG', 'ar'], ['SA', 'Saudi Arabia', 'ar', 'SA', 'ar'], ['AE', 'United Arab Emirates', 'ar', 'AE', 'ar'],
    ['JP', 'Japan', 'ja', 'JP', 'ja'], ['KR', 'South Korea', 'ko', 'KR', 'ko'], ['TW', 'Taiwan', 'zh-TW', 'TW', 'zh-Hant'], ['HK', 'Hong Kong', 'zh-HK', 'HK', 'zh-Hant'],
    ['TH', 'Thailand', 'th', 'TH', 'th'], ['VN', 'Vietnam', 'vi', 'VN', 'vi'], ['ID', 'Indonesia', 'id', 'ID', 'id'],
  ];

  /* subject filters: key → [label, Google News topic section (null = front page)] */
  const TOPICS = [
    ['top', 'Top stories', null], ['world', 'World', 'WORLD'], ['nation', 'National', 'NATION'], ['local', 'Local', 'geo'],
    ['business', 'Business', 'BUSINESS'], ['technology', 'Tech', 'TECHNOLOGY'], ['science', 'Science', 'SCIENCE'],
    ['health', 'Health', 'HEALTH'], ['sports', 'Sports', 'SPORTS'], ['entertainment', 'Culture', 'ENTERTAINMENT'],
  ];

  /* flag emoji from the country part of the code; Québec has no flag emoji, so it gets the fleur-de-lis */
  const FLAG_OVERRIDE = { 'CA-FR': '⚜️' };
  const flag = (code) => {
    if (FLAG_OVERRIDE[code]) return FLAG_OVERRIDE[code];
    const cc = String(code).slice(0, 2);
    return /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '🌍';
  };
  const regionByCode = (c) => REGIONS.find(r => r[0] === c);

  /** 'auto' → the visitor's browser region if we have an edition for it, else Worldwide. */
  function autoRegion() {
    const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en-US']);
    for (const l of langs) {
      const m = /^([A-Za-z]{2,3})-([A-Za-z]{2})$/.exec(l);
      if (!m) continue;
      const lang = m[1].toLowerCase(), cc = m[2].toUpperCase();
      if (regionByCode(cc + '-' + lang.toUpperCase())) return cc + '-' + lang.toUpperCase(); // e.g. fr-CA -> CA-FR (Québec)
      if (regionByCode(cc)) return cc;
    }
    return 'WORLD';
  }

  /* ---------------------------------------------------------------- feed URLs */
  function feedUrls(cfg) {
    const reg = regionByCode(cfg.region === 'auto' ? autoRegion() : cfg.region) || REGIONS[0];
    const [, , hl, gl, lang] = reg;
    const q = `hl=${hl}&gl=${gl}&ceid=${gl}:${lang}`;
    const base = 'https://news.google.com/rss';
    const urls = [];
    const topics = (cfg.topics && cfg.topics.length ? cfg.topics : (cfg.query || cfg.custom ? [] : ['top']));
    topics.forEach(key => {
      const t = TOPICS.find(x => x[0] === key);
      if (!t) return;
      if (key === 'top') urls.push(`${base}?${q}`);
      else if (key === 'local') { if ((cfg.place || '').trim()) urls.push(`${base}/headlines/section/geo/${encodeURIComponent(cfg.place.trim())}?${q}`); }
      else urls.push(`${base}/headlines/section/topic/${t[2]}?${q}`);
    });
    const query = (cfg.query || '').trim();
    if (query) urls.push(`${base}/search?q=${encodeURIComponent(query)}&${q}`);
    const custom = (cfg.custom || '').trim();
    if (/^https?:\/\//i.test(custom)) urls.push(custom);
    return urls.slice(0, 6);
  }

  /* ---------------------------------------------------------------- fetching through relays */
  async function fetchText(url, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms || 9000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } finally { clearTimeout(t); }
  }

  const safeLink = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } };
  const parseDate = (s) => {
    if (!s) return 0;
    if (/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(s)) return Date.parse(s.replace(' ', 'T') + 'Z') || 0; // rss2json: UTC
    return Date.parse(s) || 0;
  };
  /** Google News titles read "Headline - Outlet": split them. */
  function splitTitle(title, source) {
    title = (title || '').replace(/\s+/g, ' ').trim();
    if (source) {
      const tail = ' - ' + source;
      if (title.endsWith(tail)) title = title.slice(0, -tail.length);
      return { title, source };
    }
    const i = title.lastIndexOf(' - ');
    return i > 10 ? { title: title.slice(0, i), source: title.slice(i + 3) } : { title, source: '' };
  }

  /** RSS 2.0 or Atom text → [{title, link, date, source}] */
  function parseFeed(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('not a feed');
    const chanTitle = (doc.querySelector('channel > title, feed > title') || {}).textContent || '';
    const out = [];
    doc.querySelectorAll('item, entry').forEach(n => {
      const get = (sel) => { const e = n.querySelector(sel); return e ? e.textContent : ''; };
      let link = get('link');
      if (!link) { const a = n.querySelector('link[href]'); link = a ? a.getAttribute('href') : ''; }
      const src = get('source');
      const t = splitTitle(get('title'), src);
      out.push({ title: t.title, source: t.source || (/news\.google\./.test(chanTitle) ? '' : chanTitle.trim()), link: safeLink(link.trim()), date: parseDate(get('pubDate') || get('updated') || get('published')) });
    });
    return out;
  }

  const RELAYS = [
    { name: 'rss2json', run: async (u) => {
      const j = JSON.parse(await fetchText('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(u)));
      if (j.status !== 'ok' || !Array.isArray(j.items)) throw new Error('relay refused');
      const feedTitle = (j.feed && j.feed.title) || '';
      return j.items.map(i => { const t = splitTitle(i.title, ''); return { title: t.title, source: t.source || (/google news/i.test(feedTitle) ? '' : feedTitle), link: safeLink(i.link), date: parseDate(i.pubDate) }; });
    } },
    { name: 'allorigins', run: async (u) => parseFeed(await fetchText('https://api.allorigins.win/raw?url=' + encodeURIComponent(u))) },
    { name: 'corsproxy', run: async (u) => parseFeed(await fetchText('https://corsproxy.io/?url=' + encodeURIComponent(u))) },
  ];
  let preferred = 0;

  async function loadFeed(url) {
    let lastErr = null;
    for (let k = 0; k < RELAYS.length; k++) {
      const idx = (preferred + k) % RELAYS.length;
      try {
        const items = await RELAYS[idx].run(url);
        if (items.length) { preferred = idx; return items; }
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('empty feed');
  }

  /** all selected feeds → one de-duplicated list, newest first */
  async function loadAll(cfg) {
    const urls = feedUrls(cfg);
    if (!urls.length) return { items: [], empty: true };
    const settled = await Promise.allSettled(urls.map(loadFeed));
    const ok = settled.filter(s => s.status === 'fulfilled').map(s => s.value);
    if (!ok.length) throw new Error('no feed could be loaded');
    const seen = new Set();
    const items = [];
    // take a fair share from each feed, then sort everything by date
    const per = Math.max(3, Math.ceil(cfg.count * 1.6 / ok.length) + 1);
    ok.forEach(list => list.slice(0, per).forEach(it => {
      const key = it.title.toLowerCase().slice(0, 70);
      if (!it.title || !it.link || seen.has(key)) return; // no title or no safe http(s) link: skip
      seen.add(key); items.push(it);
    }));
    items.sort((a, b) => (b.date || 0) - (a.date || 0));
    return { items: items.slice(0, cfg.count), partial: ok.length < urls.length };
  }

  const ago = (ms) => {
    if (!ms) return '';
    const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (m < 1) return 'now';
    if (m < 60) return m + 'm';
    const hr = Math.round(m / 60);
    if (hr < 24) return hr + 'h';
    return Math.round(hr / 24) + 'd';
  };

  /* ---------------------------------------------------------------- the widget */
  function mount(body) {
    const cfgPath = 'widgets.cfg.news';
    const getCfg = () => NS.settings.get(cfgPath) || {};
    const setCfg = (partial) => NS.settings.set(cfgPath, Object.assign({}, getCfg(), partial));
    const root = h('div.nw');
    body.append(root);
    let mode = 'list', loading = false, state = { items: [], error: '', updated: 0, partial: false };
    let reqId = 0;

    const cacheKey = () => JSON.stringify(getCfg());
    const header = () => {
      const c = getCfg();
      const code = c.region === 'auto' ? autoRegion() : c.region;
      const reg = regionByCode(code) || REGIONS[0];
      const labels = (c.topics || []).map(k => (TOPICS.find(t => t[0] === k) || [])[1]).filter(Boolean);
      if (c.query) labels.push('“' + c.query.trim() + '”');
      if (c.custom) labels.push('feed');
      return h('div.nw-bar', null,
        h('div.nw-scope', { title: 'Region and subjects' }, h('span.nw-flag', flag(reg[0] === 'WORLD' ? '' : reg[0])), h('span.nw-scope-txt', { title: labels.join(', ') }, (reg[0] === 'WORLD' ? 'Worldwide' : reg[1]) + ' · ' + (labels.join(', ') || 'Top stories'))),
        h('span.nw-tools', null,
          h('button.ico.small', { title: 'Refresh', 'aria-label': 'Refresh news', onclick: () => refresh(true) }, '↻'),
          h('button.ico.small', { title: 'Region & subjects', 'aria-label': 'News settings', onclick: () => { mode = 'settings'; draw(); } }, '⚙')));
    };

    function drawList() {
      root.innerHTML = '';
      root.append(header());
      const list = h('ul.nw-list');
      if (loading && !state.items.length) list.append(...Array.from({ length: 4 }, () => h('li.nw-skel', null, h('i'), h('i.s'))));
      state.items.forEach(it => {
        const meta = [it.source, ago(it.date)].filter(Boolean).join(' · ');
        const inner = [h('span.nw-title', null, it.title), meta ? h('span.nw-meta', null, meta) : null];
        list.append(h('li', null, it.link ? h('a.nw-item', { href: it.link, target: '_blank', rel: 'noopener noreferrer' }, ...inner) : h('span.nw-item', null, ...inner)));
      });
      root.append(list);
      if (state.error && !state.items.length) root.append(h('div.w-note', null, state.error), h('button.btn.small', { onclick: () => refresh(true) }, 'Try again'));
      else if (state.empty) root.append(h('div.w-note', null, getCfg().topics && getCfg().topics.includes('local') ? 'Type a town or city under “Local” in the settings (⚙).' : 'Pick a subject, a keyword or a feed in the settings (⚙).'));
      else if (!loading && !state.items.length) root.append(h('div.w-note', null, 'No headlines found for that mix – try other subjects.'));
      const foot = [];
      if (state.updated) foot.push('Updated ' + new Date(state.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      if (state.stale) foot.push('offline – last reading');
      if (state.partial) foot.push('some sources unavailable');
      if (foot.length) root.append(h('div.w-note.nw-foot', null, foot.join(' · ')));
    }

    function drawSettings() {
      const c = getCfg();
      root.innerHTML = '';
      const regionSel = h('select.text.nw-select', { 'aria-label': 'Region', onchange: (e) => { setCfg({ region: e.target.value }); dirty = true; } },
        h('option', { value: 'auto', selected: c.region === 'auto' }, '📍 My region (' + (regionByCode(autoRegion())[0] === 'WORLD' ? 'worldwide' : regionByCode(autoRegion())[1]) + ')'),
        REGIONS.map(r => h('option', { value: r[0], selected: c.region === r[0] }, (r[0] === 'WORLD' ? '' : flag(r[0]) + '  ') + r[1])));
      const chips = h('div.nw-chips');
      const renderChips = () => {
        chips.innerHTML = '';
        TOPICS.forEach(([key, label]) => {
          const on = (getCfg().topics || []).includes(key);
          chips.append(h('button.chip' + (on ? '.on' : ''), { type: 'button', 'aria-pressed': String(on), onclick: () => {
            const cur = getCfg().topics || [];
            setCfg({ topics: on ? cur.filter(k => k !== key) : [...cur, key] });
            dirty = true; renderChips(); renderLocal();
          } }, label));
        });
      };
      const localWrap = h('div.nw-field');
      const renderLocal = () => {
        localWrap.innerHTML = '';
        if (!(getCfg().topics || []).includes('local')) return;
        const weatherCity = ((NS.settings.get('widgets.cfg.weather') || {}).name || '').split(',')[0].replace(/\s*·.*/, '').trim();
        const inp = h('input.text', { type: 'text', placeholder: weatherCity ? 'e.g. ' + weatherCity : 'Town or city', value: getCfg().place || '', 'aria-label': 'Local place', onkeydown: (e) => e.stopPropagation(),
          onchange: (e) => { setCfg({ place: e.target.value }); dirty = true; } });
        localWrap.append(h('label', null, 'Local news for'), inp);
        if (!getCfg().place && weatherCity && weatherCity !== 'Your location') { setCfg({ place: weatherCity }); inp.value = weatherCity; dirty = true; }
      };
      const field = (label, el, hint) => h('div.nw-field', null, h('label', null, label), el, hint ? h('small', null, hint) : null);
      renderChips(); renderLocal();
      root.append(
        h('div.nw-bar', null, h('strong.nw-set-title', null, 'News settings'), h('button.btn.small.primary', { onclick: () => { mode = 'list'; draw(); if (dirty) { dirty = false; refresh(true); } } }, 'Done')),
        field('Where in the world', regionSel),
        field('Subjects', chips, 'Pick one or several – they are merged.'),
        localWrap,
        field('Keywords', h('input.text', { type: 'text', placeholder: 'e.g. space telescope, climate', value: c.query || '', 'aria-label': 'Keywords', onkeydown: (e) => e.stopPropagation(),
          onchange: (e) => { setCfg({ query: e.target.value }); dirty = true; } }), 'Optional – adds a search for these words.'),
        field('Your own RSS feed', h('input.text', { type: 'url', placeholder: 'https://… feed URL', value: c.custom || '', 'aria-label': 'Custom RSS feed', onkeydown: (e) => e.stopPropagation(),
          onchange: (e) => { setCfg({ custom: e.target.value.trim() }); dirty = true; } }), 'Optional – any RSS or Atom link.'),
        field('Headlines', h('div.seg', null, [5, 8, 12].map(n => h('button' + (getCfg().count === n ? '.on' : ''), { type: 'button', onclick: (e) => { setCfg({ count: n }); dirty = true; e.currentTarget.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, String(n))))),
        h('div.w-note', null, 'Headlines come from Google News through public relay services (rss2json / allorigins / corsproxy), so they see the region and subjects you choose.'));
    }
    let dirty = false;
    function draw() { if (mode === 'settings') drawSettings(); else drawList(); }

    async function refresh(force) {
      if (!body.isConnected || loading) return;
      const key = cacheKey();
      const cache = NS.store.get('news.cache', null);
      if (!force && cache && cache.key === key && Date.now() - cache.t < 15 * 60 * 1000) {
        state = { ...state, items: cache.items, updated: cache.t, error: '', stale: false, empty: false, partial: false }; if (mode === 'list') draw(); return;
      }
      loading = true; const my = ++reqId;
      if (mode === 'list') draw();
      try {
        const res = await loadAll({ ...getCfg(), count: clamp(getCfg().count || 8, 3, 20) });
        if (my !== reqId) return;
        state = { items: res.items, error: '', updated: Date.now(), partial: !!res.partial, stale: false, empty: !!res.empty };
        if (!res.empty) NS.store.set('news.cache', { key, t: state.updated, items: res.items });
      } catch (e) {
        if (my !== reqId) return;
        if (cache && cache.key === key) state = { items: cache.items, error: '', updated: cache.t, stale: true, partial: false, empty: false };
        else state = { items: [], error: 'Couldn’t load headlines right now – check your connection.', updated: 0, stale: false, partial: false, empty: false };
      } finally { loading = false; if (mode === 'list') draw(); }
    }

    draw();
    refresh(false);
    NS.bus.on('widgets', () => { if (body.isConnected && !state.updated && !loading) refresh(false); });
    setInterval(() => { if (body.isConnected && !document.hidden && Date.now() - (state.updated || 0) > 15 * 60 * 1000) refresh(true); }, 60 * 1000);
    return { update() {} };
  }

  NS.newsWidget = { mount, feedUrls, parseFeed, REGIONS, TOPICS, loadAll };
})();
