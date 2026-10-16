/* Widgets: small cosy panels that live in the side rails (or a drawer on narrow screens). */
(function () {
  'use strict';
  const NS = window.SNC;
  const { h, clamp, pad2 } = NS;
  const t = (...a) => NS.t(...a);

  const cfgOf = (id) => NS.settings.data.widgets.cfg[id] || (NS.settings.data.widgets.cfg[id] = {});
  const setCfg = (id, partial) => { NS.settings.set('widgets.cfg.' + id, Object.assign({}, cfgOf(id), partial)); };
  const chip = (label, active, onclick, title) => h('button.chip' + (active ? '.on' : ''), { onclick, title, 'aria-pressed': String(!!active) }, label);

  /* ================================================================ clock */
  /* "AM"/"PM" as the current language writes it */
  function ampm(d) {
    try { const p = new Intl.DateTimeFormat(NS.i18n.locale(), { hour: 'numeric', hour12: true }).formatToParts(d).find(x => x.type === 'dayPeriod'); if (p) return p.value; } catch (e) { /* fall through */ }
    return d.getHours() >= 12 ? 'PM' : 'AM';
  }
  /** 24-hour clock? an explicit choice wins, otherwise follow the language (English = 12 h) */
  function is24(c) {
    if (typeof c.h24 === 'boolean') return c.h24;
    try { return !new Intl.DateTimeFormat(NS.i18n.locale(), { hour: 'numeric' }).resolvedOptions().hour12; } catch (e) { return false; }
  }
  function mountClock(body) {
    const time = h('div.clk-time');
    const date = h('div.clk-date');
    const greet = h('div.clk-greet');
    const opts = h('div.w-opts');
    body.append(greet, time, date, opts);
    function renderOpts() {
      const c = cfgOf('clock');
      opts.innerHTML = '';
      opts.append(
        chip(t('clk.24h'), is24(c), () => { setCfg('clock', { h24: !is24(cfgOf('clock')) }); renderOpts(); update(); }),
        chip(t('clk.sec'), c.seconds, () => { setCfg('clock', { seconds: !cfgOf('clock').seconds }); renderOpts(); update(); }),
        chip(t('clk.date'), c.date, () => { setCfg('clock', { date: !cfgOf('clock').date }); renderOpts(); update(); }));
    }
    function update() {
      const c = cfgOf('clock'), d = new Date();
      let hh = d.getHours();
      const suffix = ampm(d);
      const h24 = is24(c);
      if (!h24) hh = hh % 12 || 12;
      time.innerHTML = '';
      time.append(`${h24 ? pad2(hh) : hh}:${pad2(d.getMinutes())}`);
      if (c.seconds) time.append(h('span.clk-sec', null, ':' + pad2(d.getSeconds())));
      if (!h24) time.append(h('span.clk-ampm', null, suffix));
      date.textContent = c.date ? d.toLocaleDateString(NS.i18n.locale(), { weekday: 'long', month: 'long', day: 'numeric' }) : '';
      date.style.display = c.date ? '' : 'none';
      const hr = d.getHours();
      greet.textContent = t(hr < 5 ? 'greet.late' : hr < 12 ? 'greet.morning' : hr < 18 ? 'greet.afternoon' : hr < 22 ? 'greet.evening' : 'greet.night');
    }
    renderOpts(); update();
    setInterval(update, 1000);
    return { update, relang() { renderOpts(); update(); } };
  }

  /* ================================================================ weather */
  const WX = (code, day) => {
    if (code === 0) return day ? ['☀️', 'clear'] : ['🌙', 'clear'];
    if (code === 1) return day ? ['🌤️', 'mostlyClear'] : ['🌙', 'mostlyClear'];
    if (code === 2) return ['⛅', 'partlyCloudy'];
    if (code === 3) return ['☁️', 'overcast'];
    if (code === 45 || code === 48) return ['🌫️', 'fog'];
    if (code >= 51 && code <= 57) return ['🌦️', 'drizzle'];
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['🌧️', 'rain'];
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['❄️', 'snow'];
    if (code >= 95) return ['⛈️', 'thunder'];
    return ['🌡️', 'other'];
  };

  function mountWeather(body) {
    const view = h('div.wx');
    body.append(view);
    let loading = false, redraw = null; // redraw = repaint whatever is on screen (used when the language changes)
    const GEO = '@geo'; // stored instead of a translated "Your location"
    const placeName = (c) => (!c.name ? t('wx.somewhere') : (c.name === GEO || c.name === 'Your location') ? t('wx.yourLocation') : c.name);

    function setupUI(msgKey) {
      redraw = () => setupUI(msgKey);
      view.innerHTML = '';
      const input = h('input.text', { type: 'text', placeholder: t('wx.cityPh'), 'aria-label': t('wx.cityAria'), onkeydown: (e) => { if (e.key === 'Enter') search(); e.stopPropagation(); } });
      const results = h('div.wx-results');
      const info = h('div.w-note', null, t(msgKey || 'wx.note'));
      async function search() {
        const q = input.value.trim();
        if (!q) return;
        results.textContent = t('wx.searching');
        try {
          const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=${NS.i18n.current()}&format=json`);
          const j = await r.json();
          results.innerHTML = '';
          if (!j.results || !j.results.length) { results.textContent = t('wx.noPlaces'); return; }
          j.results.forEach(p => results.append(h('button.wx-hit', { onclick: () => choose(p.name + (p.admin1 && p.admin1 !== p.name ? ', ' + p.admin1 : '') + (p.country_code ? ' · ' + p.country_code : ''), p.latitude, p.longitude) },
            h('b', null, p.name), ' ', h('span', null, [p.admin1, p.country].filter(Boolean).join(', ')))));
        } catch (e) { results.textContent = t('wx.unreachable'); }
      }
      view.append(
        h('div.wx-row', null, input, h('button.btn', { onclick: search }, t('wx.search'))),
        h('button.btn.wide', { onclick: locate }, t('wx.locate')), results, info);
    }

    function choose(name, lat, lon) {
      setCfg('weather', { name, lat, lon });
      NS.store.remove('weather.cache');
      refresh(true);
    }
    function locate() {
      if (!navigator.geolocation) { setupUI('wx.noGeo'); return; }
      redraw = null; view.textContent = t('wx.asking');
      navigator.geolocation.getCurrentPosition(
        (pos) => choose(GEO, +pos.coords.latitude.toFixed(3), +pos.coords.longitude.toFixed(3)),
        () => setupUI('wx.declined'),
        { timeout: 10000, maximumAge: 600000 });
    }

    async function refresh(force) {
      const c = cfgOf('weather');
      if (c.lat == null || c.lon == null) { setupUI(); return; }
      if (loading) return;
      const key = `${c.lat},${c.lon},${c.units}`;
      const cache = NS.store.get('weather.cache', null);
      if (!force && cache && cache.key === key && Date.now() - cache.t < 15 * 60 * 1000) { show(cache.data); return; }
      loading = true;
      if (!view.querySelector('.wx-main')) { redraw = null; view.textContent = t('wx.checking'); }
      try {
        const f = c.units === 'f';
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1&temperature_unit=${f ? 'fahrenheit' : 'celsius'}&wind_speed_unit=${f ? 'mph' : 'kmh'}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        const data = { cur: j.current, hi: j.daily.temperature_2m_max[0], lo: j.daily.temperature_2m_min[0], f };
        NS.store.set('weather.cache', { key, t: Date.now(), data });
        show(data);
      } catch (e) {
        if (cache && cache.key === key) show(cache.data, true);
        else { redraw = failUI; failUI(); }
      } finally { loading = false; }
    }

    function failUI() {
      view.innerHTML = '';
      view.append(h('div.w-note', null, t('wx.fail')), h('button.btn', { onclick: () => refresh(true) }, t('btn.tryAgain')), h('button.btn', { onclick: () => setupUI() }, t('wx.change')));
    }

    function show(data, stale) {
      redraw = () => show(data, stale);
      const c = cfgOf('weather');
      const cur = data.cur, day = !!cur.is_day;
      const [emoji, wxKey] = WX(cur.weather_code, day);
      const label = t('wx.' + wxKey);
      const u = data.f ? '°F' : '°C';
      view.innerHTML = '';
      view.append(...[
        h('div.wx-main', null, h('span.wx-emoji', null, emoji), h('div', null, h('div.wx-temp', null, Math.round(cur.temperature_2m) + u), h('div.wx-desc', null, label))),
        h('div.wx-meta', null,
          h('span', { title: t('wx.feelsTitle') }, t('wx.feels', { t: Math.round(cur.apparent_temperature) })),
          h('span', { title: t('wx.today') }, `↑${Math.round(data.hi)}° ↓${Math.round(data.lo)}°`),
          h('span', { title: t('wx.wind') }, '💨 ' + Math.round(cur.wind_speed_10m) + (data.f ? ' mph' : ' km/h'))),
        h('div.wx-place', null, h('span.wx-name', null, placeName(c)),
          h('span.wx-tools', null,
            h('button.ico.small', { title: t('wx.units'), 'aria-label': t('wx.unitsAria'), onclick: () => { setCfg('weather', { units: c.units === 'f' ? 'c' : 'f' }); refresh(true); } }, u === '°C' ? '°F' : '°C'),
            h('button.ico.small', { title: t('tip.refresh'), 'aria-label': t('wx.refreshAria'), onclick: () => refresh(true) }, '↻'),
            h('button.ico.small', { title: t('wx.change'), 'aria-label': t('wx.change'), onclick: () => setupUI() }, '✎'))),
        stale ? h('div.w-note', null, t('wx.stale')) : null].filter(Boolean));
      NS.bus.emit('weather', { code: cur.weather_code, day });
    }

    refresh(false);
    setInterval(() => refresh(false), 5 * 60 * 1000);
    return { update() {}, relang() { if (redraw) redraw(); } };
  }

  /* ================================================================ stats */
  function mountStats(body) {
    const deal = h('div.st-deal');
    const grid = h('div.st-grid');
    const bar = h('div.st-bar', null, h('div.st-fill'));
    const barLabel = h('div.st-barlabel');
    const streak = h('div.st-streak');
    body.append(deal, grid, bar, barLabel, streak);
    const cell = (k, v) => h('div.st-cell', null, h('div.st-v', null, v), h('div.st-k', null, k));
    function update() {
      const g = NS.game, st = g.state;
      if (!st) return;
      const zen = NS.settings.data.game.zen;
      deal.textContent = st.daily ? t('st.daily', { n: st.drawCount === 3 ? 3 : 1 }) : t('st.deal', { seed: st.seed, n: st.drawCount === 3 ? 3 : 1 });
      grid.innerHTML = '';
      if (zen) {
        grid.append(h('div.w-note.zen', null, t('st.zen')));
        bar.style.display = 'none'; barLabel.textContent = ''; streak.textContent = '';
        return;
      }
      grid.append(cell(t('stat.moves'), st.moves), cell(t('stat.time'), NS.fmtTime(g.elapsed)), cell(t('stat.score'), st.score));
      bar.style.display = '';
      bar.firstChild.style.width = Math.round(st.score / NS.K.TOTAL_PTS * 100) + '%';
      barLabel.textContent = `${st.score} / ${NS.K.TOTAL_PTS}`;
      const s = g.stats;
      streak.textContent = s.played ? t('st.line', { won: s.won, played: s.played, streak: s.streak }) : t('st.first');
    }
    NS.bus.on('state', update); NS.bus.on('tick', update); NS.bus.on('settings', (p) => { if (p === '*' || p === 'game.zen') update(); });
    update();
    return { update, relang: update };
  }

  /* ================================================================ focus timer */
  function mountFocus(body) {
    const MODES = { focus: 'fc.focus', short: 'fc.break', long: 'fc.long' };
    let mode = 'focus', remaining = cfgOf('focus').focus * 60, endAt = 0, timer = 0, done = 0;
    const R = 34, C = 2 * Math.PI * R;
    const SVGNS = 'http://www.w3.org/2000/svg';
    const circle = (cls) => {
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', 40); c.setAttribute('cy', 40); c.setAttribute('r', R);
      c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', 6); c.setAttribute('class', cls);
      return c;
    };
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 80 80'); svg.setAttribute('class', 'ring');
    const ringEl = circle('ring-fg');
    ringEl.setAttribute('stroke-linecap', 'round'); ringEl.setAttribute('stroke-dasharray', C); ringEl.setAttribute('transform', 'rotate(-90 40 40)');
    svg.append(circle('ring-bg'), ringEl);
    const readout = h('div.fc-read');
    const dial = h('div.fc-dial', null, svg, readout);
    const modes = h('div.fc-modes');
    const startBtn = h('button.btn.primary', { onclick: () => toggle() }, t('fc.start'));
    const resetBtn = h('button.btn', { onclick: () => reset() }, t('fc.reset'));
    const count = h('div.w-note');
    body.append(dial, modes, h('div.fc-btns', null, startBtn, resetBtn), count);

    const total = () => cfgOf('focus')[mode] * 60;
    function draw() {
      const m = Math.floor(remaining / 60), s = remaining % 60;
      readout.textContent = `${pad2(m)}:${pad2(s)}`;
      ringEl.setAttribute('stroke-dashoffset', String(C * (1 - remaining / total())));
      startBtn.textContent = t(timer ? 'fc.pause' : (remaining < total() ? 'fc.resume' : 'fc.start'));
      resetBtn.textContent = t('fc.reset');
      count.textContent = done ? t('fc.done', { n: done }) : t('fc.idle');
      modes.innerHTML = '';
      Object.keys(MODES).forEach(k => modes.append(chip(t(MODES[k]), k === mode, () => setMode(k))));
    }
    function setMode(k) { stop(); mode = k; remaining = total(); draw(); }
    function stop() { clearInterval(timer); timer = 0; }
    function toggle() {
      if (timer) { stop(); draw(); return; }
      endAt = Date.now() + remaining * 1000;
      timer = setInterval(tick, 250);
      NS.audio.ac(); // unlock audio for the end chime
      draw();
    }
    function tick() {
      remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      if (remaining <= 0) {
        stop();
        NS.audio.doneChime();
        if (mode === 'focus') { done++; NS.toast(t('toast.focusDone'), 5000); mode = done % 4 === 0 ? 'long' : 'short'; }
        else { NS.toast(t('toast.breakOver'), 5000); mode = 'focus'; }
        remaining = total();
      }
      draw();
    }
    function reset() { stop(); remaining = total(); draw(); }
    NS.bus.on('settings', (p) => { if (p === '*' || p.startsWith('widgets.cfg.focus')) { if (!timer) remaining = total(); draw(); } });
    draw();
    // durations
    const dur = h('div.fc-dur');
    const durTitle = h('summary');
    function renderDur() {
      dur.innerHTML = '';
      durTitle.textContent = t('fc.durations');
      ['focus', 'short', 'long'].forEach(k => {
        dur.append(h('label', null, t(MODES[k]), h('input.num', { type: 'number', min: 1, max: 180, value: cfgOf('focus')[k], 'aria-label': t('fc.minutesAria', { mode: t(MODES[k]) }),
          onchange: (e) => { setCfg('focus', { [k]: clamp(parseInt(e.target.value, 10) || 1, 1, 180) }); }, onkeydown: (e) => e.stopPropagation() })));
      });
    }
    renderDur();
    body.append(h('details.fc-set', null, durTitle, dur));
    return { update() {}, relang() { draw(); renderDur(); } };
  }

  /* ================================================================ note */
  function mountNote(body) {
    const ta = h('textarea.note', { placeholder: t('note.ph'), 'aria-label': t('note.aria'), rows: 5, maxLength: 2000, spellcheck: true,
      onkeydown: (e) => e.stopPropagation() });
    ta.value = NS.store.get('note', '');
    ta.addEventListener('input', NS.debounce(() => { NS.store.set('note', ta.value); NS.bus.emit('note'); }, 300));
    NS.bus.on('noteRemote', () => { ta.value = NS.store.get('note', ''); });
    body.append(ta);
    return { update() {}, relang() { ta.placeholder = t('note.ph'); ta.setAttribute('aria-label', t('note.aria')); } };
  }

  /* ================================================================ quote */
  const QUOTE_COUNT = 16; // q.0 … q.15 in the language files
  function mountQuote(body) {
    const text = h('blockquote.q');
    const day = Math.floor(Date.now() / 86400000);
    let i = day % QUOTE_COUNT;
    const next = h('button.ico.small.q-next', { title: t('q.another'), 'aria-label': t('q.anotherAria'), onclick: () => { i = (i + 1) % QUOTE_COUNT; draw(); } }, '↻');
    function draw() { text.textContent = '“' + t('q.' + i) + '”'; next.title = t('q.another'); next.setAttribute('aria-label', t('q.anotherAria')); }
    draw();
    body.append(text, next);
    return { update() {}, relang: draw };
  }

  /* ================================================================ ambience mixer */
  function mountAmbience(body) {
    const rows = [['rain', '🌧️'], ['wind', '💨'], ['fire', '🔥']];
    const sl = {}, labels = {};
    rows.forEach(([key, emoji]) => {
      const input = h('input.range', { type: 'range', min: 0, max: 100, value: Math.round((NS.settings.data.sound.ambience[key] || 0) * 100),
        oninput: (e) => NS.audio.setAmbience(key, e.target.value / 100) });
      sl[key] = input;
      labels[key] = h('span.amb-label');
      body.append(h('label.amb-row', null, h('span.amb-ico', null, emoji), labels[key], input));
    });
    const note = h('div.w-note');
    body.append(note);
    const relang = () => {
      rows.forEach(([k]) => { labels[k].textContent = t('amb.' + k); sl[k].setAttribute('aria-label', t('amb.volumeAria', { label: t('amb.' + k) })); });
      note.textContent = t('amb.note');
    };
    relang();
    NS.bus.on('settings', (p) => { if (p === '*') rows.forEach(([k]) => { sl[k].value = Math.round((NS.settings.data.sound.ambience[k] || 0) * 100); }); });
    return { update() {}, relang };
  }

  /* ================================================================ registry + layout */
  const REGISTRY = {
    clock: { icon: '🕰️', mount: mountClock },
    weather: { icon: '🌤️', mount: mountWeather },
    stats: { icon: '🂡', mount: mountStats },
    focus: { icon: '🍅', mount: mountFocus },
    note: { icon: '📝', mount: mountNote },
    quote: { icon: '🌱', mount: mountQuote },
    news: { icon: '📰', mount: (body) => NS.newsWidget.mount(body) },
    ambience: { icon: '🎧', mount: mountAmbience },
  };

  const Widgets = {
    nodes: {},
    api: {},
    edit: false,
    REGISTRY,

    init(els) {
      this.els = els; // { left, right, drawer, drawerList, tray }
      Object.keys(REGISTRY).forEach(id => {
        const def = REGISTRY[id];
        const btn = (act, glyph, run) => h('button.ico.small', { dataset: { act }, onclick: run }, glyph);
        const tools = h('div.w-tools', null,
          btn('left', '◀', () => this.move(id, 'left')), btn('up', '▲', () => this.shift(id, -1)), btn('down', '▼', () => this.shift(id, 1)),
          btn('right', '▶', () => this.move(id, 'right')), btn('hide', '✕', () => this.hide(id)));
        const body = h('div.w-body');
        const node = h('section.widget', { dataset: { w: id } },
          h('header.w-head', null, h('span.w-icon', null, def.icon), h('span.w-title'), tools), body);
        this.nodes[id] = node;
        this.api[id] = def.mount(body) || {};
      });
      this.relabel();
      NS.bus.on('lang', () => {
        this.relabel();
        Object.values(this.api).forEach(a => { if (a && a.relang) a.relang(); });
        this.renderTray();
      });
      const mq = window.matchMedia('(min-width: 1180px)');
      (mq.addEventListener ? mq.addEventListener('change', () => this.place()) : mq.addListener(() => this.place()));
      NS.bus.on('settings', (p) => { if (p === '*') this.place(); });
      this.place();
    },

    /** titles and tooltips of every widget frame, in the current language */
    relabel() {
      Object.keys(REGISTRY).forEach(id => {
        const node = this.nodes[id], name = t('w.' + id);
        node.querySelector('.w-title').textContent = name;
        const set = (act, title, aria) => { const b = node.querySelector(`[data-act="${act}"]`); b.title = title; b.setAttribute('aria-label', aria || title); };
        set('left', t('w.moveLeft'), t('w.moveLeftAria', { w: name })); set('up', t('w.up')); set('down', t('w.down'));
        set('right', t('w.moveRight'), t('w.moveRightAria', { w: name })); set('hide', t('w.hide'), t('w.hideAria', { w: name }));
      });
      this.els.left.dataset.empty = this.els.right.dataset.empty = t('tray.drop');
    },

    wide() { return window.matchMedia('(min-width: 1180px)').matches; },

    place() {
      const w = NS.settings.data.widgets, e = this.els;
      [e.left, e.right, e.drawerList].forEach(el => { while (el.firstChild) el.removeChild(el.firstChild); });
      Object.values(this.nodes).forEach(n => n.remove());
      if (this.wide()) {
        w.left.forEach(id => e.left.appendChild(this.nodes[id]));
        w.right.forEach(id => e.right.appendChild(this.nodes[id]));
      } else {
        [...w.left, ...w.right].forEach(id => e.drawerList.appendChild(this.nodes[id]));
      }
      e.left.classList.toggle('empty', !w.left.length);
      e.right.classList.toggle('empty', !w.right.length);
      document.body.classList.toggle('no-widgets', !w.left.length && !w.right.length);
      this.renderTray();
      NS.bus.emit('widgets');
    },

    renderTray() {
      const t = this.els.tray, w = NS.settings.data.widgets;
      t.innerHTML = '';
      t.append(h('strong', null, NS.t('tray.title')));
      if (w.hidden.length) {
        t.append(h('span.tray-label', null, NS.t('tray.add')));
        w.hidden.forEach(id => t.append(h('button.chip', { onclick: () => this.show(id) }, '＋ ' + REGISTRY[id].icon + ' ' + NS.t('w.' + id))));
      }
      t.append(h('button.btn.primary', { onclick: () => this.setEdit(false) }, NS.t('btn.done')));
    },

    setEdit(v) {
      this.edit = v;
      document.body.classList.toggle('arranging', v);
      this.els.tray.hidden = !v;
      if (v && !this.wide()) NS.bus.emit('drawer', true);
      this.renderTray();
    },

    locate(id) { const w = NS.settings.data.widgets; return ['left', 'right', 'hidden'].find(k => w[k].includes(id)); },
    commit(w) { NS.settings.set('widgets.left', w.left); NS.settings.set('widgets.right', w.right); NS.settings.set('widgets.hidden', w.hidden); this.place(); },
    take(id) { const w = NS.settings.data.widgets; const l = { left: w.left.slice(), right: w.right.slice(), hidden: w.hidden.slice() }; Object.keys(l).forEach(k => { l[k] = l[k].filter(x => x !== id); }); return l; },
    move(id, rail) { const l = this.take(id); l[rail].push(id); this.commit(l); },
    show(id) { this.move(id, this.wide() && NS.settings.data.widgets.right.length < NS.settings.data.widgets.left.length ? 'right' : 'left'); },
    hide(id) { const l = this.take(id); l.hidden.push(id); this.commit(l); },
    shift(id, dir) {
      const w = NS.settings.data.widgets, where = this.locate(id);
      if (!where || where === 'hidden') return;
      const l = { left: w.left.slice(), right: w.right.slice(), hidden: w.hidden.slice() };
      const arr = l[where], i = arr.indexOf(id), j = i + dir;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      this.commit(l);
    },
    toggle(id) { if (this.locate(id) === 'hidden') this.show(id); else this.hide(id); },
  };

  NS.widgets = Widgets;
})();
