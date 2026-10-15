/* Customize dialog: looks, game rules, widgets, sound and data. */
(function () {
  'use strict';
  const NS = window.SNC;
  const { h } = NS;
  const T = NS.themes;
  const S = () => NS.settings;

  /* ---------------------------------------------------------------- controls */
  const field = (label, ctrl, desc) => h('div.field', null, h('div.field-head', null, h('label', null, label), desc ? h('small', null, desc) : null), ctrl);
  const seg = (options, value, onChange, label) => h('div.seg', { role: 'group', 'aria-label': label || '' },
    options.map(([v, l]) => h('button' + (String(v) === String(value) ? '.on' : ''), { type: 'button', 'aria-pressed': String(String(v) === String(value)), onclick: () => onChange(v) }, l)));
  const toggle = (label, value, onChange, desc) => h('label.toggle', null,
    h('span.toggle-text', null, h('span', null, label), desc ? h('small', null, desc) : null),
    h('input', { type: 'checkbox', checked: !!value, onchange: (e) => onChange(e.target.checked) }), h('span.switch'));
  const slider = (label, min, max, step, value, onInput, fmt) => {
    const out = h('output', null, fmt ? fmt(value) : value);
    const input = h('input.range', { type: 'range', min, max, step, value, 'aria-label': label, oninput: (e) => { const v = +e.target.value; out.textContent = fmt ? fmt(v) : v; onInput(v); } });
    return h('div.field.slider', null, h('div.field-head', null, h('label', null, label), out), input);
  };
  const colorInput = (label, value, onInput) => h('label.color', null, h('span', null, label), h('input', { type: 'color', value, 'aria-label': label, oninput: (e) => onInput(e.target.value) }));
  const tile = (name, previewStyle, active, onclick, extra) => h('button.tile' + (active ? '.on' : ''), { type: 'button', onclick, title: name, 'aria-pressed': String(!!active) },
    h('span.tile-pre', { style: previewStyle }, extra || null), h('span.tile-name', null, name));
  const section = (title, ...kids) => h('section.cz-sec', null, h('h3', null, title), ...kids);

  /* ---------------------------------------------------------------- image helpers */
  async function pickImage(accept, maxSide, quality, storeKey) {
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', accept: accept || 'image/*', style: 'display:none' });
      inp.addEventListener('change', async () => {
        const f = inp.files && inp.files[0];
        inp.remove();
        if (!f) return resolve(false);
        try {
          const url = await NS.imageToDataURL(f, maxSide, quality);
          if (!NS.store.set(storeKey, url)) { NS.toast('That picture is too big to save in your browser – try a smaller one.', 4000); return resolve(false); }
          resolve(true);
        } catch (e) { NS.toast(e.message || 'Could not read that image'); resolve(false); }
      });
      document.body.appendChild(inp);
      inp.click();
    });
  }

  /* ---------------------------------------------------------------- tabs */
  function tabLook(rerender) {
    const look = S().data.look;
    const set = (path, v) => S().set(path, v);
    const out = [];

    out.push(section('Vibes', h('p.cz-note', null, 'One-tap looks – then tweak anything below.'),
      h('div.tiles.vibes', null, T.VIBES.map(v => {
        const bg = T.BACKGROUNDS.find(b => b.id === v.look.bg.id);
        return tile(v.name, `background:${bg.css}`, false, () => {
          S().patch('look', { ...v.look, bg: { ...look.bg, id: v.look.bg.id }, back: { ...look.back, ...v.look.back } });
          rerender();
        }, h('span.mini-back', { style: `background-image:${T.backCSS(v.look.back.design, v.look.back.c1, v.look.back.c2)}` }));
      }))));

    // background
    const bgSec = [h('div.tiles', null, T.BACKGROUNDS.map(b => {
      const pre = b.id === 'custom' ? `background:linear-gradient(${look.bg.angle}deg,${look.bg.c1},${look.bg.c2})`
        : b.id === 'image' ? (NS.store.get('img.bg') ? `background:url(${NS.store.get('img.bg')}) center/cover` : 'background:#444 repeating-linear-gradient(45deg,#555 0 6px,#444 6px 12px)')
          : `background:${b.css}`;
      return tile(b.name, pre, look.bg.id === b.id, () => {
        S().set('look.bg', { ...look.bg, id: b.id });
        if (b.fx && b.id !== 'custom' && b.id !== 'image') S().set('look.fx', b.fx);
        rerender();
      });
    }))];
    if (look.bg.id === 'custom') {
      bgSec.push(h('div.row', null,
        colorInput('Top', look.bg.c1, v => set('look.bg', { ...S().data.look.bg, c1: v })),
        colorInput('Bottom', look.bg.c2, v => set('look.bg', { ...S().data.look.bg, c2: v }))),
      slider('Angle', 0, 360, 5, look.bg.angle, v => set('look.bg', { ...S().data.look.bg, angle: v }), v => v + '°'));
    }
    if (look.bg.id === 'image') {
      const url = h('input.text', { type: 'url', placeholder: 'https://… link to a picture', value: look.bg.url || '', 'aria-label': 'Background image link',
        onkeydown: (e) => e.stopPropagation(),
        onchange: (e) => { NS.store.remove('img.bg'); set('look.bg', { ...S().data.look.bg, url: e.target.value.trim(), stamp: Date.now() }); rerender(); } });
      bgSec.push(h('div.field', null, h('div.field-head', null, h('label', null, 'Your picture'), h('small', null, 'Paste an image link, or choose a file – it stays in this browser.')),
        h('div.row', null, url, h('button.btn', { onclick: async () => { if (await pickImage('image/*', 1920, 0.82, 'img.bg')) { set('look.bg', { ...S().data.look.bg, url: '', stamp: Date.now() }); rerender(); } } }, 'Choose file…'),
          h('button.btn', { onclick: () => { NS.store.remove('img.bg'); set('look.bg', { ...S().data.look.bg, url: '', stamp: Date.now() }); rerender(); } }, 'Clear'))));
    }
    bgSec.push(slider('Darken', 0, 0.8, 0.02, look.dim, v => set('look.dim', v), v => Math.round(v * 100) + '%'),
      slider('Blur', 0, 16, 1, look.blur, v => set('look.blur', v), v => v + 'px'),
      toggle('Film grain', look.grain, v => set('look.grain', v), 'A touch of texture so gradients feel less flat'));
    out.push(section('Background', ...bgSec));

    // effects
    out.push(section('Atmosphere',
      seg([['none', 'None'], ['rain', 'Rain'], ['snow', 'Snow'], ['petals', 'Petals'], ['fireflies', 'Fireflies'], ['stars', 'Stars']], look.fx, v => { set('look.fx', v); rerender(); }, 'Ambient effect'),
      slider('Amount', 5, 100, 5, look.fxAmount, v => set('look.fxAmount', v), v => v + '%'),
      toggle('Match the weather', look.fxFromWeather, v => set('look.fxFromWeather', v), 'Rain or snow outside? Add it here (needs the weather widget)')));

    // card backs
    const b = look.back;
    const backSec = [h('div.tiles.backs', null,
      T.BACK_DESIGNS.map(d => tile(d.name, `background-image:${T.backCSS(d.id, b.design === d.id ? b.c1 : d.c1, b.design === d.id ? b.c2 : d.c2)};background-size:100% 100%`, b.design === d.id, () => {
        S().set('look.back', { ...b, design: d.id, c1: d.c1, c2: d.c2 }); rerender();
      }, null)),
      tile('My picture', NS.store.get('img.back') ? `background:url(${NS.store.get('img.back')}) center/cover` : 'background:#444 repeating-linear-gradient(45deg,#555 0 6px,#444 6px 12px)', b.design === 'image', () => { S().set('look.back', { ...b, design: 'image' }); rerender(); }))];
    if (b.design !== 'image') {
      backSec.push(h('div.row', null,
        colorInput('Base colour', b.c1, v => set('look.back', { ...S().data.look.back, c1: v })),
        colorInput('Pattern colour', b.c2, v => set('look.back', { ...S().data.look.back, c2: v })),
        h('button.btn', { onclick: () => { const d = T.BACK_DESIGNS.find(x => x.id === b.design); set('look.back', { ...b, c1: d.c1, c2: d.c2 }); rerender(); } }, 'Reset colours')));
    } else {
      const url = h('input.text', { type: 'url', placeholder: 'https://… link to a picture', value: b.url || '', 'aria-label': 'Card back image link', onkeydown: (e) => e.stopPropagation(),
        onchange: (e) => { NS.store.remove('img.back'); set('look.back', { ...S().data.look.back, url: e.target.value.trim() }); rerender(); } });
      backSec.push(h('div.field', null, h('div.field-head', null, h('label', null, 'Your card back'), h('small', null, 'Tall pictures (5:7) fit best.')),
        h('div.row', null, url, h('button.btn', { onclick: async () => { if (await pickImage('image/*', 500, 0.88, 'img.back')) { set('look.back', { ...S().data.look.back, url: '', stamp: Date.now() }); rerender(); } } }, 'Choose file…'))));
    }
    out.push(section('Card backs', ...backSec));

    // faces
    out.push(section('Card faces',
      h('div.tiles.faces', null, T.FACES.map(f => tile(f.name, `background:${f.bg};box-shadow:inset 0 0 0 2px ${f.edge}`, look.face === f.id, () => { set('look.face', f.id); rerender(); },
        h('span.face-sample', { style: `color:${f.ink}` }, 'A', h('i', { style: `color:${f.red}` }, '♥'))))),
      field('Suit colours', seg([['classic', 'Classic (red / black)'], ['four', 'Four colours']], look.suits, v => { set('look.suits', v); rerender(); }, 'Suit colours')),
      slider('Card size', 70, 120, 5, look.cardScale, v => set('look.cardScale', v), v => v + '%')));

    // table + accent
    const swatches = ['#ffb86b', '#f2c46d', '#ff8fb1', '#c7b6ff', '#6fb4ff', '#7fd8b0', '#ff8a7a', '#e8e1d0'];
    out.push(section('Table & accents',
      field('Table mat', seg([['glass', 'Frosted glass'], ['felt', 'Soft felt'], ['none', 'None']], look.matStyle, v => { set('look.matStyle', v); rerender(); }, 'Table mat')),
      slider('Mat strength', 0, 0.8, 0.02, look.mat, v => set('look.mat', v), v => Math.round(v * 100) + '%'),
      h('div.field', null, h('div.field-head', null, h('label', null, 'Accent colour')),
        h('div.row.swatches', null, swatches.map(c => h('button.swatch' + (look.accent.toLowerCase() === c ? '.on' : ''), { type: 'button', style: `background:${c}`, 'aria-label': 'Accent ' + c, onclick: () => { set('look.accent', c); rerender(); } })),
          colorInput('Custom', look.accent, v => set('look.accent', v))))));
    return out;
  }

  function tabGame(rerender) {
    const g = S().data.game;
    const set = (k, v) => S().set('game.' + k, v);
    return [
      section('Dealing', h('p.cz-note', null, 'These apply to your next deal.'),
        field('Draw from the deck', seg([[1, 'One card'], [3, 'Three cards']], g.drawCount, v => { set('drawCount', v); rerender(); }, 'Draw count'), 'Draw one is relaxed; draw three is the classic challenge.'),
        field('Passes through the deck', seg([['unlimited', 'Unlimited'], ['3', 'Three'], ['0', 'One']], g.redeals, v => { set('redeals', v); rerender(); }, 'Redeals')),
        toggle('Friendly deals', g.winnable, v => set('winnable', v), 'Skip hopeless shuffles – a quick test-solver makes sure the deal can be won')),
      section('Playing',
        toggle('Tap to move', g.clickToMove, v => set('clickToMove', v), 'A single click sends a card where it obviously belongs. Dragging always works.'),
        toggle('Zen mode', g.zen, v => set('zen', v), 'Hide moves, time and score. Just cards.')),
      h('p.cz-note', null, 'Shortcuts: Space draw · U undo · H hint · F finish · N new deal · M music')];
  }

  function tabWidgets(rerender) {
    const W = NS.widgets, w = S().data.widgets;
    const rows = Object.keys(W.REGISTRY).map(id => {
      const def = W.REGISTRY[id], where = W.locate(id);
      return h('div.wrow', null,
        toggle(def.icon + '  ' + def.title, where !== 'hidden', () => { W.toggle(id); rerender(); }),
        where === 'hidden' ? null : seg([['left', 'Left'], ['right', 'Right']], where, v => { W.move(id, v); rerender(); }, def.title + ' side'));
    });
    return [section('Widgets', h('p.cz-note', null, 'Little panels beside the table. On narrow screens they live in the Widgets drawer.'), ...rows,
      h('button.btn.wide', { onclick: () => { NS.modal.closeAll(); W.setEdit(true); } }, 'Arrange on the page…')),
    section('Tip', h('p.cz-note', null, 'The weather widget uses your city (or your location if you allow it) – set it from the widget itself.'))];
  }

  function tabSound(rerender) {
    const s = S().data.sound, m = NS.music;
    return [
      section('Cards', toggle('Card sounds', s.sfx, v => { S().set('sound.sfx', v); }),
        slider('Volume', 0, 1, 0.05, s.sfxVolume, v => S().set('sound.sfxVolume', v), v => Math.round(v * 100) + '%')),
      section('Ambience', h('p.cz-note', null, 'Soft sounds made right in your browser.'),
        ...[['rain', '🌧️ Rain'], ['wind', '💨 Wind'], ['fire', '🔥 Fireplace']].map(([k, l]) =>
          slider(l, 0, 1, 0.05, s.ambience[k] || 0, v => NS.audio.setAmbience(k, v), v => Math.round(v * 100) + '%'))),
      section('Music', slider('Music volume', 0, 100, 1, m.volume, v => m.setVolume(v), v => v + '%'),
        h('button.btn.wide', { onclick: () => { NS.modal.closeAll(); m.setOpen(true); } }, 'Open the music player'))];
  }

  function tabData(rerender) {
    const st = NS.game.stats;
    const row = (k, v) => h('div.drow', null, h('span', null, k), h('b', null, v));
    return [
      section('Your stats',
        row('Games played', st.played), row('Games won', st.won), row('Current streak', st.streak), row('Best streak', st.bestStreak),
        row('Fastest win', st.bestTime ? NS.fmtTime(st.bestTime) : '—'), row('Fewest moves', st.bestMoves || '—'), row('Best score', st.bestScore || '—'),
        h('button.btn', { onclick: () => { if (confirm('Reset your statistics?')) { Object.assign(st, { played: 0, won: 0, bestTime: 0, bestMoves: 0, bestScore: 0, streak: 0, bestStreak: 0 }); NS.game.saveStats(); NS.bus.emit('state'); rerender(); } } }, 'Reset stats')),
      section('Backup', h('p.cz-note', null, 'Everything is saved in this browser only. Export your look, widgets and music list to keep a copy or move to another device.'),
        h('div.row', null,
          h('button.btn', { onclick: () => {
            const data = { app: 'solitaire-n-chill', v: 1, settings: S().data, music: NS.store.get('music', {}), note: NS.store.get('note', '') };
            const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: 'solitaire-n-chill-settings.json' });
            document.body.appendChild(a); a.click(); a.remove();
          } }, 'Export settings'),
          h('button.btn', { onclick: () => {
            const inp = h('input', { type: 'file', accept: 'application/json', style: 'display:none' });
            inp.addEventListener('change', async () => {
              try {
                const data = JSON.parse(await inp.files[0].text());
                if (data.app !== 'solitaire-n-chill') throw new Error('not ours');
                S().replaceAll(data.settings);
                if (data.music) { NS.store.set('music', data.music); }
                if (data.note != null) NS.store.set('note', data.note);
                NS.toast('Settings imported – reloading…'); setTimeout(() => location.reload(), 700);
              } catch (e) { NS.toast('That file doesn’t look like a Solitaire n’ Chill backup.'); }
              inp.remove();
            });
            document.body.appendChild(inp); inp.click();
          } }, 'Import settings'))),
      section('Reset',
        h('div.row', null,
          h('button.btn', { onclick: () => { if (confirm('Put every look and widget setting back to the defaults?')) { S().reset(); rerender(); } } }, 'Reset looks & settings'),
          h('button.btn.danger', { onclick: () => { if (confirm('Erase everything saved by this game in your browser (game, stats, settings, music list, notes)?')) { NS.store.clearAll(); location.reload(); } } }, 'Erase all data')))];
  }

  function tabAccount() {
    const box = h('div.acct');
    NS.cloud.renderAccount(box);
    return [section('Your account', box)];
  }

  const ALL_TABS = [['account', '☁️', 'Account', tabAccount], ['look', '🎨', 'Look', tabLook], ['game', '🂡', 'Game', tabGame], ['widgets', '🧩', 'Widgets', tabWidgets], ['sound', '🔊', 'Sound', tabSound], ['data', '💾', 'Data', tabData]];
  let lastTab = 'look';

  function open(tabId) {
    const TABS = ALL_TABS.filter(t => t[0] !== 'account' || (NS.cloud && NS.cloud.configured));
    let cur = TABS.some(t => t[0] === (tabId || lastTab)) ? (tabId || lastTab) : 'look';
    const content = h('div.cz-content');
    const tabs = h('div.cz-tabs', { role: 'tablist' });
    function renderTabs() {
      tabs.innerHTML = '';
      TABS.forEach(([id, icon, label]) => tabs.append(h('button' + (id === cur ? '.on' : ''), { role: 'tab', 'aria-selected': String(id === cur), onclick: () => { cur = id; lastTab = id; content.scrollTop = 0; renderTabs(); render(); } }, h('span.tab-ico', icon), h('span.tab-lbl', label))));
    }
    function render() {
      const top = content.scrollTop;
      const fn = TABS.find(t => t[0] === cur)[3];
      content.innerHTML = '';
      fn(render).forEach(n => content.append(n));
      content.scrollTop = top;
    }
    renderTabs(); render();
    NS.modal.open({ title: 'Make it yours', body: h('div.cz', null, tabs, content), wide: true, className: 'cz-modal' });
  }

  NS.customize = { open };
})();
