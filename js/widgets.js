/* Widgets: small cosy panels that live in the side rails (or a drawer on narrow screens). */
(function () {
  'use strict';
  const NS = window.SNC;
  const { h, clamp, pad2 } = NS;

  const cfgOf = (id) => NS.settings.data.widgets.cfg[id] || (NS.settings.data.widgets.cfg[id] = {});
  const setCfg = (id, partial) => { NS.settings.set('widgets.cfg.' + id, Object.assign({}, cfgOf(id), partial)); };
  const chip = (label, active, onclick, title) => h('button.chip' + (active ? '.on' : ''), { onclick, title, 'aria-pressed': String(!!active) }, label);

  /* ================================================================ clock */
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
        chip('24h', c.h24, () => { setCfg('clock', { h24: !cfgOf('clock').h24 }); renderOpts(); update(); }),
        chip('sec', c.seconds, () => { setCfg('clock', { seconds: !cfgOf('clock').seconds }); renderOpts(); update(); }),
        chip('date', c.date, () => { setCfg('clock', { date: !cfgOf('clock').date }); renderOpts(); update(); }));
    }
    function update() {
      const c = cfgOf('clock'), d = new Date();
      let hh = d.getHours();
      const suffix = hh >= 12 ? 'PM' : 'AM';
      if (!c.h24) hh = hh % 12 || 12;
      time.innerHTML = '';
      time.append(`${c.h24 ? pad2(hh) : hh}:${pad2(d.getMinutes())}`);
      if (c.seconds) time.append(h('span.clk-sec', null, ':' + pad2(d.getSeconds())));
      if (!c.h24) time.append(h('span.clk-ampm', null, suffix));
      date.textContent = c.date ? d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : '';
      date.style.display = c.date ? '' : 'none';
      const hr = d.getHours();
      greet.textContent = hr < 5 ? 'Still up? Cosy night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : hr < 22 ? 'Good evening' : 'Cosy night';
    }
    renderOpts(); update();
    setInterval(update, 1000);
    return { update };
  }

  /* ================================================================ weather */
  const WX = (code, day) => {
    if (code === 0) return day ? ['☀️', 'Clear'] : ['🌙', 'Clear'];
    if (code === 1) return day ? ['🌤️', 'Mostly clear'] : ['🌙', 'Mostly clear'];
    if (code === 2) return ['⛅', 'Partly cloudy'];
    if (code === 3) return ['☁️', 'Overcast'];
    if (code === 45 || code === 48) return ['🌫️', 'Foggy'];
    if (code >= 51 && code <= 57) return ['🌦️', 'Drizzle'];
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['🌧️', 'Rain'];
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['❄️', 'Snow'];
    if (code >= 95) return ['⛈️', 'Thunderstorm'];
    return ['🌡️', 'Weather'];
  };

  function mountWeather(body) {
    const view = h('div.wx');
    body.append(view);
    let loading = false;

    function setupUI(msg) {
      view.innerHTML = '';
      const input = h('input.text', { type: 'text', placeholder: 'Your city…', 'aria-label': 'City name', onkeydown: (e) => { if (e.key === 'Enter') search(); e.stopPropagation(); } });
      const results = h('div.wx-results');
      const info = h('div.w-note', null, msg || 'Weather comes from Open-Meteo (no account, no tracking).');
      async function search() {
        const q = input.value.trim();
        if (!q) return;
        results.textContent = 'Searching…';
        try {
          const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`);
          const j = await r.json();
          results.innerHTML = '';
          if (!j.results || !j.results.length) { results.textContent = 'No places found – try another spelling.'; return; }
          j.results.forEach(p => results.append(h('button.wx-hit', { onclick: () => choose(p.name + (p.admin1 && p.admin1 !== p.name ? ', ' + p.admin1 : '') + (p.country_code ? ' · ' + p.country_code : ''), p.latitude, p.longitude) },
            h('b', null, p.name), ' ', h('span', null, [p.admin1, p.country].filter(Boolean).join(', ')))));
        } catch (e) { results.textContent = 'Couldn’t reach the weather service – are you online?'; }
      }
      view.append(
        h('div.wx-row', null, input, h('button.btn', { onclick: search }, 'Search')),
        h('button.btn.wide', { onclick: locate }, '📍 Use my location'), results, info);
    }

    function choose(name, lat, lon) {
      setCfg('weather', { name, lat, lon });
      NS.store.remove('weather.cache');
      refresh(true);
    }
    function locate() {
      if (!navigator.geolocation) { setupUI('Your browser can’t share a location – search for a city instead.'); return; }
      view.textContent = 'Asking your browser for permission…';
      navigator.geolocation.getCurrentPosition(
        (pos) => choose('Your location', +pos.coords.latitude.toFixed(3), +pos.coords.longitude.toFixed(3)),
        () => setupUI('Location was declined – search for a city instead.'),
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
      if (!view.querySelector('.wx-main')) view.textContent = 'Checking the sky…';
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
        else { view.innerHTML = ''; view.append(h('div.w-note', null, 'Couldn’t load the weather right now.'), h('button.btn', { onclick: () => refresh(true) }, 'Try again'), h('button.btn', { onclick: () => setupUI() }, 'Change place')); }
      } finally { loading = false; }
    }

    function show(data, stale) {
      const c = cfgOf('weather');
      const cur = data.cur, day = !!cur.is_day;
      const [emoji, label] = WX(cur.weather_code, day);
      const u = data.f ? '°F' : '°C';
      view.innerHTML = '';
      view.append(...[
        h('div.wx-main', null, h('span.wx-emoji', null, emoji), h('div', null, h('div.wx-temp', null, Math.round(cur.temperature_2m) + u), h('div.wx-desc', null, label))),
        h('div.wx-meta', null,
          h('span', { title: 'Feels like' }, 'Feels ' + Math.round(cur.apparent_temperature) + '°'),
          h('span', { title: 'Today' }, `↑${Math.round(data.hi)}° ↓${Math.round(data.lo)}°`),
          h('span', { title: 'Wind' }, '💨 ' + Math.round(cur.wind_speed_10m) + (data.f ? ' mph' : ' km/h'))),
        h('div.wx-place', null, h('span.wx-name', null, c.name || 'Somewhere nice'),
          h('span.wx-tools', null,
            h('button.ico.small', { title: 'Switch °C / °F', 'aria-label': 'Switch units', onclick: () => { setCfg('weather', { units: c.units === 'f' ? 'c' : 'f' }); refresh(true); } }, u === '°C' ? '°F' : '°C'),
            h('button.ico.small', { title: 'Refresh', 'aria-label': 'Refresh weather', onclick: () => refresh(true) }, '↻'),
            h('button.ico.small', { title: 'Change place', 'aria-label': 'Change place', onclick: () => setupUI() }, '✎'))),
        stale ? h('div.w-note', null, 'Offline – showing the last reading.') : null].filter(Boolean));
      NS.bus.emit('weather', { code: cur.weather_code, day });
    }

    refresh(false);
    setInterval(() => refresh(false), 5 * 60 * 1000);
    return { update() {} };
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
      deal.textContent = st.daily ? `Daily deal · ${st.drawCount === 3 ? 'draw 3' : 'draw 1'}` : `Deal #${st.seed} · ${st.drawCount === 3 ? 'draw 3' : 'draw 1'}`;
      grid.innerHTML = '';
      if (zen) {
        grid.append(h('div.w-note.zen', null, 'Zen mode – no numbers, just cards 🍃'));
        bar.style.display = 'none'; barLabel.textContent = ''; streak.textContent = '';
        return;
      }
      grid.append(cell('moves', st.moves), cell('time', NS.fmtTime(g.elapsed)), cell('score', st.score));
      bar.style.display = '';
      bar.firstChild.style.width = Math.round(st.score / NS.K.TOTAL_PTS * 100) + '%';
      barLabel.textContent = `${st.score} / ${NS.K.TOTAL_PTS}`;
      const s = g.stats;
      streak.textContent = s.played ? `${s.won} won of ${s.played} · streak ${s.streak}` : 'First game of the day?';
    }
    NS.bus.on('state', update); NS.bus.on('tick', update); NS.bus.on('settings', (p) => { if (p === '*' || p === 'game.zen') update(); });
    update();
    return { update };
  }

  /* ================================================================ focus timer */
  function mountFocus(body) {
    const MODES = { focus: 'Focus', short: 'Break', long: 'Long break' };
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
    const startBtn = h('button.btn.primary', { onclick: () => toggle() }, 'Start');
    const resetBtn = h('button.btn', { onclick: () => reset() }, 'Reset');
    const count = h('div.w-note');
    body.append(dial, modes, h('div.fc-btns', null, startBtn, resetBtn), count);

    const total = () => cfgOf('focus')[mode] * 60;
    function draw() {
      const m = Math.floor(remaining / 60), s = remaining % 60;
      readout.textContent = `${pad2(m)}:${pad2(s)}`;
      ringEl.setAttribute('stroke-dashoffset', String(C * (1 - remaining / total())));
      startBtn.textContent = timer ? 'Pause' : (remaining < total() ? 'Resume' : 'Start');
      count.textContent = done ? `${done} focus session${done > 1 ? 's' : ''} done today 🍅` : 'Small steps. Deal a hand, take a break.';
      modes.innerHTML = '';
      Object.keys(MODES).forEach(k => modes.append(chip(MODES[k], k === mode, () => setMode(k))));
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
        if (mode === 'focus') { done++; NS.toast('Focus session complete – time for a little break 🌿', 5000); mode = done % 4 === 0 ? 'long' : 'short'; }
        else { NS.toast('Break over – ready when you are ☕', 5000); mode = 'focus'; }
        remaining = total();
      }
      draw();
    }
    function reset() { stop(); remaining = total(); draw(); }
    NS.bus.on('settings', (p) => { if (p === '*' || p.startsWith('widgets.cfg.focus')) { if (!timer) remaining = total(); draw(); } });
    draw();
    // durations
    const dur = h('div.fc-dur');
    ['focus', 'short', 'long'].forEach(k => {
      dur.append(h('label', null, MODES[k], h('input.num', { type: 'number', min: 1, max: 180, value: cfgOf('focus')[k], 'aria-label': MODES[k] + ' minutes',
        onchange: (e) => { setCfg('focus', { [k]: clamp(parseInt(e.target.value, 10) || 1, 1, 180) }); }, onkeydown: (e) => e.stopPropagation() })));
    });
    body.append(h('details.fc-set', null, h('summary', null, 'Durations (min)'), dur));
    return { update() {} };
  }

  /* ================================================================ note */
  function mountNote(body) {
    const ta = h('textarea.note', { placeholder: 'A little note to self…', 'aria-label': 'Sticky note', rows: 5, maxLength: 2000, spellcheck: true,
      onkeydown: (e) => e.stopPropagation() });
    ta.value = NS.store.get('note', '');
    ta.addEventListener('input', NS.debounce(() => NS.store.set('note', ta.value), 300));
    body.append(ta);
    return { update() {} };
  }

  /* ================================================================ quote */
  const QUOTES = [
    'Nothing has to be perfect. A good hand is enough.',
    'Breathe in, deal out.',
    'The next card is just a card. You are doing fine.',
    'Tea is still warm. There is no rush.',
    'Little by little, the whole pile comes undone.',
    'Be gentle with yourself – even Aces start at the bottom.',
    'Not every game needs to be won to be enjoyed.',
    'Rain on the window, cards on the table. Good.',
    'You can always undo. Life is a bit trickier, so be kind.',
    'Slow is a perfectly good speed.',
    'A quiet minute is a small victory.',
    'Shuffle the day. Start again whenever you like.',
    'Comfort is a deck of cards and a soft light.',
    'Some days you stack kings. Some days you stack patience.',
    'Stretch your shoulders. Unclench your jaw. Carry on.',
    'There is always one more move you have not seen yet.',
  ];
  function mountQuote(body) {
    const text = h('blockquote.q');
    const day = Math.floor(Date.now() / 86400000);
    let i = day % QUOTES.length;
    const next = h('button.ico.small.q-next', { title: 'Another one', 'aria-label': 'Show another quote', onclick: () => { i = (i + 1) % QUOTES.length; draw(); } }, '↻');
    function draw() { text.textContent = '“' + QUOTES[i] + '”'; }
    draw();
    body.append(text, next);
    return { update() {} };
  }

  /* ================================================================ ambience mixer */
  function mountAmbience(body) {
    const rows = [['rain', '🌧️', 'Rain'], ['wind', '💨', 'Wind'], ['fire', '🔥', 'Fireplace']];
    const sl = {};
    rows.forEach(([key, emoji, label]) => {
      const input = h('input.range', { type: 'range', min: 0, max: 100, value: Math.round((NS.settings.data.sound.ambience[key] || 0) * 100), 'aria-label': label + ' volume',
        oninput: (e) => NS.audio.setAmbience(key, e.target.value / 100) });
      sl[key] = input;
      body.append(h('label.amb-row', null, h('span.amb-ico', null, emoji), h('span.amb-label', null, label), input));
    });
    body.append(h('div.w-note', null, 'Soft sounds generated right here – no downloads.'));
    NS.bus.on('settings', (p) => { if (p === '*') rows.forEach(([k]) => { sl[k].value = Math.round((NS.settings.data.sound.ambience[k] || 0) * 100); }); });
    return { update() {} };
  }

  /* ================================================================ registry + layout */
  const REGISTRY = {
    clock: { title: 'Clock', icon: '🕰️', mount: mountClock },
    weather: { title: 'Weather', icon: '🌤️', mount: mountWeather },
    stats: { title: 'This game', icon: '🂡', mount: mountStats },
    focus: { title: 'Focus timer', icon: '🍅', mount: mountFocus },
    note: { title: 'Sticky note', icon: '📝', mount: mountNote },
    quote: { title: 'Gentle words', icon: '🌱', mount: mountQuote },
    news: { title: 'News', icon: '📰', mount: (body) => NS.newsWidget.mount(body) },
    ambience: { title: 'Ambience', icon: '🎧', mount: mountAmbience },
  };

  const Widgets = {
    nodes: {},
    edit: false,
    REGISTRY,

    init(els) {
      this.els = els; // { left, right, drawer, drawerList, tray }
      Object.keys(REGISTRY).forEach(id => {
        const def = REGISTRY[id];
        const tools = h('div.w-tools', null,
          h('button.ico.small', { title: 'Move to left', 'aria-label': 'Move ' + def.title + ' left', onclick: () => this.move(id, 'left') }, '◀'),
          h('button.ico.small', { title: 'Move up', 'aria-label': 'Move up', onclick: () => this.shift(id, -1) }, '▲'),
          h('button.ico.small', { title: 'Move down', 'aria-label': 'Move down', onclick: () => this.shift(id, 1) }, '▼'),
          h('button.ico.small', { title: 'Move to right', 'aria-label': 'Move ' + def.title + ' right', onclick: () => this.move(id, 'right') }, '▶'),
          h('button.ico.small', { title: 'Hide', 'aria-label': 'Hide ' + def.title, onclick: () => this.hide(id) }, '✕'));
        const body = h('div.w-body');
        const node = h('section.widget', { dataset: { w: id } },
          h('header.w-head', null, h('span.w-icon', null, def.icon), h('span.w-title', null, def.title), tools), body);
        def.mount(body);
        this.nodes[id] = node;
      });
      const mq = window.matchMedia('(min-width: 1180px)');
      (mq.addEventListener ? mq.addEventListener('change', () => this.place()) : mq.addListener(() => this.place()));
      NS.bus.on('settings', (p) => { if (p === '*') this.place(); });
      this.place();
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
      t.append(h('strong', null, 'Arranging widgets'));
      if (w.hidden.length) {
        t.append(h('span.tray-label', null, 'Add:'));
        w.hidden.forEach(id => t.append(h('button.chip', { onclick: () => this.show(id) }, '＋ ' + REGISTRY[id].icon + ' ' + REGISTRY[id].title)));
      }
      t.append(h('button.btn.primary', { onclick: () => this.setEdit(false) }, 'Done'));
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
