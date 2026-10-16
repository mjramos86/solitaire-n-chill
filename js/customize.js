/* Customize dialog: looks, game rules, widgets, sound and data. */
(function () {
  'use strict';
  const NS = window.SNC;
  const { h } = NS;
  const T = NS.themes;
  const S = () => NS.settings;
  const t = NS.t;
  const nm = (kind, item) => t(kind + '.' + item.id); // localised names of backgrounds, faces, backs, vibes

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
          if (!NS.store.set(storeKey, url)) { NS.toast(t('toast.tooBig'), 4000); return resolve(false); }
          resolve(true);
        } catch (e) { NS.toast(t('toast.badImage')); resolve(false); }
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

    out.push(section(t('sec.vibes'), h('p.cz-note', null, t('cz.vibesNote')),
      h('div.tiles.vibes', null, T.VIBES.map(v => {
        const bg = T.BACKGROUNDS.find(b => b.id === v.look.bg.id);
        return tile(nm('vibe', v), `background:${bg.css}`, false, () => {
          S().patch('look', { ...v.look, bg: { ...look.bg, id: v.look.bg.id }, back: { ...look.back, ...v.look.back } });
          rerender();
        }, h('span.mini-back', { style: `background-image:${T.backCSS(v.look.back.design, v.look.back.c1, v.look.back.c2)}` }));
      }))));

    // background
    const bgSec = [h('div.tiles', null, T.BACKGROUNDS.map(b => {
      const pre = b.id === 'custom' ? `background:linear-gradient(${look.bg.angle}deg,${look.bg.c1},${look.bg.c2})`
        : b.id === 'image' ? (NS.store.get('img.bg') ? `background:url(${NS.store.get('img.bg')}) center/cover` : 'background:#444 repeating-linear-gradient(45deg,#555 0 6px,#444 6px 12px)')
          : `background:${b.css}`;
      return tile(nm('bg', b), pre, look.bg.id === b.id, () => {
        S().set('look.bg', { ...look.bg, id: b.id });
        if (b.fx && b.id !== 'custom' && b.id !== 'image') S().set('look.fx', b.fx);
        rerender();
      });
    }))];
    if (look.bg.id === 'custom') {
      bgSec.push(h('div.row', null,
        colorInput(t('cz.top'), look.bg.c1, v => set('look.bg', { ...S().data.look.bg, c1: v })),
        colorInput(t('cz.bottom'), look.bg.c2, v => set('look.bg', { ...S().data.look.bg, c2: v }))),
      slider(t('cz.angle'), 0, 360, 5, look.bg.angle, v => set('look.bg', { ...S().data.look.bg, angle: v }), v => v + '°'));
    }
    if (look.bg.id === 'image') {
      const url = h('input.text', { type: 'url', placeholder: t('cz.imageLinkPh'), value: look.bg.url || '', 'aria-label': t('cz.bgLinkAria'),
        onkeydown: (e) => e.stopPropagation(),
        onchange: (e) => { NS.store.remove('img.bg'); set('look.bg', { ...S().data.look.bg, url: e.target.value.trim(), stamp: Date.now() }); rerender(); } });
      bgSec.push(h('div.field', null, h('div.field-head', null, h('label', null, t('cz.yourPicture')), h('small', null, t('cz.pictureHint'))),
        h('div.row', null, url, h('button.btn', { onclick: async () => { if (await pickImage('image/*', 1920, 0.82, 'img.bg')) { set('look.bg', { ...S().data.look.bg, url: '', stamp: Date.now() }); rerender(); } } }, t('btn.chooseFile')),
          h('button.btn', { onclick: () => { NS.store.remove('img.bg'); set('look.bg', { ...S().data.look.bg, url: '', stamp: Date.now() }); rerender(); } }, t('btn.clear')))));
    }
    bgSec.push(slider(t('cz.darken'), 0, 0.8, 0.02, look.dim, v => set('look.dim', v), v => Math.round(v * 100) + '%'),
      slider(t('cz.blur'), 0, 16, 1, look.blur, v => set('look.blur', v), v => v + 'px'),
      toggle(t('cz.grain'), look.grain, v => set('look.grain', v), t('cz.grainHint')));
    out.push(section(t('sec.background'), ...bgSec));

    // effects
    out.push(section(t('sec.atmosphere'),
      seg(['none', 'rain', 'snow', 'petals', 'fireflies', 'stars'].map(k => [k, t('fx.' + k)]), look.fx, v => { set('look.fx', v); rerender(); }, t('cz.ambientAria')),
      slider(t('cz.amount'), 5, 100, 5, look.fxAmount, v => set('look.fxAmount', v), v => v + '%'),
      toggle(t('cz.matchWeather'), look.fxFromWeather, v => set('look.fxFromWeather', v), t('cz.matchWeatherHint'))));

    // card backs
    const b = look.back;
    const backSec = [h('div.tiles.backs', null,
      T.BACK_DESIGNS.map(d => tile(nm('back', d), `background-image:${T.backCSS(d.id, b.design === d.id ? b.c1 : d.c1, b.design === d.id ? b.c2 : d.c2)};background-size:100% 100%`, b.design === d.id, () => {
        S().set('look.back', { ...b, design: d.id, c1: d.c1, c2: d.c2 }); rerender();
      }, null)),
      tile(t('cz.myPicture'), NS.store.get('img.back') ? `background:url(${NS.store.get('img.back')}) center/cover` : 'background:#444 repeating-linear-gradient(45deg,#555 0 6px,#444 6px 12px)', b.design === 'image', () => { S().set('look.back', { ...b, design: 'image' }); rerender(); }))];
    if (b.design !== 'image') {
      backSec.push(h('div.row', null,
        colorInput(t('cz.baseColour'), b.c1, v => set('look.back', { ...S().data.look.back, c1: v })),
        colorInput(t('cz.patternColour'), b.c2, v => set('look.back', { ...S().data.look.back, c2: v })),
        h('button.btn', { onclick: () => { const d = T.BACK_DESIGNS.find(x => x.id === b.design); set('look.back', { ...b, c1: d.c1, c2: d.c2 }); rerender(); } }, t('cz.resetColours'))));
    } else {
      const url = h('input.text', { type: 'url', placeholder: t('cz.imageLinkPh'), value: b.url || '', 'aria-label': t('cz.backLinkAria'), onkeydown: (e) => e.stopPropagation(),
        onchange: (e) => { NS.store.remove('img.back'); set('look.back', { ...S().data.look.back, url: e.target.value.trim() }); rerender(); } });
      backSec.push(h('div.field', null, h('div.field-head', null, h('label', null, t('cz.yourCardBack')), h('small', null, t('cz.tallHint'))),
        h('div.row', null, url, h('button.btn', { onclick: async () => { if (await pickImage('image/*', 500, 0.88, 'img.back')) { set('look.back', { ...S().data.look.back, url: '', stamp: Date.now() }); rerender(); } } }, t('btn.chooseFile')))));
    }
    out.push(section(t('sec.cardBacks'), ...backSec));

    // faces
    out.push(section(t('sec.faces'),
      h('div.tiles.faces', null, T.FACES.map(f => tile(nm('face', f), `background:${f.bg};box-shadow:inset 0 0 0 2px ${f.edge}`, look.face === f.id, () => { set('look.face', f.id); rerender(); },
        h('span.face-sample', { style: `color:${f.ink}` }, 'A', h('i', { style: `color:${f.red}` }, '♥'))))),
      field(t('cz.suitColours'), seg([['classic', t('suits.classic')], ['four', t('suits.four')]], look.suits, v => { set('look.suits', v); rerender(); }, t('cz.suitColours'))),
      slider(t('cz.cardSize'), 70, 120, 5, look.cardScale, v => set('look.cardScale', v), v => v + '%')));

    // table + accent
    const swatches = ['#ffb86b', '#f2c46d', '#ff8fb1', '#c7b6ff', '#6fb4ff', '#7fd8b0', '#ff8a7a', '#e8e1d0'];
    out.push(section(t('sec.table'),
      field(t('cz.tableMat'), seg([['glass', t('mat.glass')], ['felt', t('mat.felt')], ['none', t('mat.none')]], look.matStyle, v => { set('look.matStyle', v); rerender(); }, t('cz.tableMat'))),
      slider(t('cz.matStrength'), 0, 0.8, 0.02, look.mat, v => set('look.mat', v), v => Math.round(v * 100) + '%'),
      h('div.field', null, h('div.field-head', null, h('label', null, t('cz.accent'))),
        h('div.row.swatches', null, swatches.map(c => h('button.swatch' + (look.accent.toLowerCase() === c ? '.on' : ''), { type: 'button', style: `background:${c}`, 'aria-label': t('cz.accentAria', { c }), onclick: () => { set('look.accent', c); rerender(); } })),
          colorInput(t('cz.custom'), look.accent, v => set('look.accent', v))))));
    return out;
  }

  function tabGame(rerender) {
    const g = S().data.game;
    const set = (k, v) => S().set('game.' + k, v);
    return [
      section(t('cz.language'),
        seg(NS.i18n.LANGS.map(l => [l.code, l.name]), NS.i18n.current(), v => NS.i18n.set(v), t('cz.language'))),
      section(t('sec.dealing'), h('p.cz-note', null, t('cz.nextDeal')),
        field(t('cz.drawFrom'), seg([[1, t('cz.draw1')], [3, t('cz.draw3')]], g.drawCount, v => { set('drawCount', v); rerender(); }, t('cz.drawFrom')), t('cz.drawHint')),
        field(t('cz.passes'), seg([['unlimited', t('cz.unlimited')], ['3', t('cz.three')], ['0', t('cz.one')]], g.redeals, v => { set('redeals', v); rerender(); }, t('cz.passes'))),
        toggle(t('cz.friendly'), g.winnable, v => set('winnable', v), t('cz.friendlyHint'))),
      section(t('sec.playing'),
        toggle(t('cz.tap'), g.clickToMove, v => set('clickToMove', v), t('cz.tapHint')),
        toggle(t('cz.zen'), g.zen, v => set('zen', v), t('cz.zenHint'))),
      h('p.cz-note', null, t('cz.shortcuts'))];
  }

  function tabWidgets(rerender) {
    const W = NS.widgets, w = S().data.widgets;
    const rows = Object.keys(W.REGISTRY).map(id => {
      const def = W.REGISTRY[id], where = W.locate(id);
      return h('div.wrow', null,
        toggle(def.icon + '  ' + t('w.' + id), where !== 'hidden', () => { W.toggle(id); rerender(); }),
        where === 'hidden' ? null : seg([['left', t('cz.left')], ['right', t('cz.right')]], where, v => { W.move(id, v); rerender(); }, t('cz.sideAria', { w: t('w.' + id) })));
    });
    return [section(t('btn.widgets'), h('p.cz-note', null, t('cz.widgetsNote')), ...rows,
      h('button.btn.wide', { onclick: () => { NS.modal.closeAll(); W.setEdit(true); } }, t('cz.arrangePage'))),
    section(t('sec.tip'), h('p.cz-note', null, t('cz.weatherTip')))];
  }

  function tabSound(rerender) {
    const s = S().data.sound, m = NS.music;
    return [
      section(t('sec.cards'), toggle(t('cz.cardSounds'), s.sfx, v => { S().set('sound.sfx', v); }),
        slider(t('cz.volume'), 0, 1, 0.05, s.sfxVolume, v => S().set('sound.sfxVolume', v), v => Math.round(v * 100) + '%')),
      section(t('sec.ambience'), h('p.cz-note', null, t('cz.ambNote')),
        ...[['rain', '🌧️ '], ['wind', '💨 '], ['fire', '🔥 ']].map(([k, ico]) =>
          slider(ico + t('amb.' + k), 0, 1, 0.05, s.ambience[k] || 0, v => NS.audio.setAmbience(k, v), v => Math.round(v * 100) + '%'))),
      section(t('sec.music'), slider(t('cz.musicVolume'), 0, 100, 1, m.volume, v => m.setVolume(v), v => v + '%'),
        h('button.btn.wide', { onclick: () => { NS.modal.closeAll(); m.setOpen(true); } }, t('cz.openPlayer')))];
  }

  function tabData(rerender) {
    const st = NS.game.stats;
    const row = (k, v) => h('div.drow', null, h('span', null, k), h('b', null, v));
    return [
      section(t('sec.stats'),
        row(t('st.played'), st.played), row(t('st.won'), st.won), row(t('st.streak'), st.streak), row(t('st.bestStreak'), st.bestStreak),
        row(t('st.fastest'), st.bestTime ? NS.fmtTime(st.bestTime) : '—'), row(t('st.fewest'), st.bestMoves || '—'), row(t('st.bestScore'), st.bestScore || '—'),
        h('button.btn', { onclick: () => { if (confirm(t('cz.resetStatsConfirm'))) { Object.assign(st, { played: 0, won: 0, bestTime: 0, bestMoves: 0, bestScore: 0, streak: 0, bestStreak: 0 }); NS.game.saveStats(); NS.bus.emit('state'); rerender(); } } }, t('cz.resetStats'))),
      section(t('sec.backup'), h('p.cz-note', null, t('cz.backupNote')),
        h('div.row', null,
          h('button.btn', { onclick: () => {
            const data = { app: 'solitaire-n-chill', v: 1, settings: S().data, music: NS.store.get('music', {}), note: NS.store.get('note', '') };
            const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: 'solitaire-n-chill-settings.json' });
            document.body.appendChild(a); a.click(); a.remove();
          } }, t('cz.export')),
          h('button.btn', { onclick: () => {
            const inp = h('input', { type: 'file', accept: 'application/json', style: 'display:none' });
            inp.addEventListener('change', async () => {
              try {
                const data = JSON.parse(await inp.files[0].text());
                if (data.app !== 'solitaire-n-chill') throw new Error('not ours');
                S().replaceAll(data.settings);
                if (data.music) { NS.store.set('music', data.music); }
                if (data.note != null) NS.store.set('note', data.note);
                NS.toast(t('toast.imported')); setTimeout(() => location.reload(), 700);
              } catch (e) { NS.toast(t('toast.badBackup')); }
              inp.remove();
            });
            document.body.appendChild(inp); inp.click();
          } }, t('cz.import')))),
      section(t('sec.reset'),
        h('div.row', null,
          h('button.btn', { onclick: () => { if (confirm(t('cz.resetLooksConfirm'))) { S().replaceAll({ lang: S().data.lang }); rerender(); } } }, t('cz.resetLooks')),
          h('button.btn.danger', { onclick: () => { if (confirm(t('cz.eraseConfirm'))) { NS.store.clearAll(); location.reload(); } } }, t('cz.eraseAll'))))];
  }

  function tabAccount() {
    const box = h('div.acct');
    NS.cloud.renderAccount(box);
    return [section(t('cloud.sec'), box)];
  }

  const ALL_TABS = [['account', '☁️', tabAccount], ['look', '🎨', tabLook], ['game', '🂡', tabGame], ['widgets', '🧩', tabWidgets], ['sound', '🔊', tabSound], ['data', '💾', tabData]];
  let lastTab = 'look';

  function open(tabId) {
    const TABS = ALL_TABS.filter(x => x[0] !== 'account' || (NS.cloud && NS.cloud.configured));
    let cur = TABS.some(x => x[0] === (tabId || lastTab)) ? (tabId || lastTab) : 'look';
    const content = h('div.cz-content');
    const tabs = h('div.cz-tabs', { role: 'tablist' });
    function renderTabs() {
      tabs.innerHTML = '';
      TABS.forEach(([id, icon]) => tabs.append(h('button' + (id === cur ? '.on' : ''), { role: 'tab', 'aria-selected': String(id === cur), onclick: () => { cur = id; lastTab = id; content.scrollTop = 0; renderTabs(); render(); } }, h('span.tab-ico', icon), h('span.tab-lbl', t('tab.' + id)))));
    }
    function render() {
      const top = content.scrollTop;
      const fn = TABS.find(x => x[0] === cur)[2];
      content.innerHTML = '';
      fn(render).forEach(n => content.append(n));
      content.scrollTop = top;
    }
    renderTabs(); render();
    // switching language inside the dialog re-draws it in place (scroll position and tab are kept)
    const off = NS.bus.on('lang', () => {
      renderTabs(); render();
      const head = m.el.querySelector('.modal-head h2'); if (head) head.textContent = t('cz.title');
      m.el.querySelector('.modal').setAttribute('aria-label', t('cz.title'));
    });
    const m = NS.modal.open({ title: t('cz.title'), body: h('div.cz', null, tabs, content), wide: true, className: 'cz-modal', onClose: off });
  }

  NS.customize = { open };
})();
