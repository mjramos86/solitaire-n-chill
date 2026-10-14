/* Theme catalogue (backgrounds, card backs, faces, vibes) + the code that paints them. */
(function () {
  'use strict';
  const NS = window.SNC;

  /* ---------------------------------------------------------------- backgrounds */
  const BACKGROUNDS = [
    { id: 'rainy-night', name: 'Rainy night', css: 'radial-gradient(1200px 700px at 20% 10%, #38456f 0%, transparent 60%), linear-gradient(160deg, #1b2038 0%, #131627 55%, #0d0f1c 100%)', fx: 'rain' },
    { id: 'forest', name: 'Forest cabin', css: 'radial-gradient(900px 600px at 80% 0%, #4d7a55 0%, transparent 60%), linear-gradient(170deg, #2d4a3a 0%, #1d3328 60%, #14241c 100%)', fx: 'fireflies' },
    { id: 'sunset', name: 'Sunset', css: 'linear-gradient(180deg, #5b3a7a 0%, #b4527a 38%, #f0845c 72%, #ffc27a 100%)', fx: 'none' },
    { id: 'sakura', name: 'Sakura', css: 'radial-gradient(900px 600px at 50% 0%, #ffe3ec 0%, transparent 70%), linear-gradient(180deg, #f4b9cb 0%, #d98aa6 55%, #a9627f 100%)', fx: 'petals' },
    { id: 'cafe', name: 'Warm café', css: 'radial-gradient(900px 700px at 50% 20%, #8a5b3b 0%, transparent 65%), linear-gradient(180deg, #5a3a28 0%, #3b2519 100%)', fx: 'none' },
    { id: 'felt', name: 'Green felt', css: 'radial-gradient(1000px 800px at 50% 40%, #2f7a54 0%, #1f5a3f 55%, #143d2b 100%)', fx: 'none' },
    { id: 'ocean', name: 'Ocean', css: 'linear-gradient(180deg, #2a7f9e 0%, #1f5f86 50%, #143e63 100%)', fx: 'none' },
    { id: 'lavender', name: 'Lavender haze', css: 'radial-gradient(900px 700px at 70% 10%, #d8c9ff 0%, transparent 60%), linear-gradient(160deg, #8d7bc9 0%, #6a5aa8 60%, #4a3f80 100%)', fx: 'stars' },
    { id: 'snowy', name: 'Snow day', css: 'linear-gradient(180deg, #8fa7c4 0%, #c9d6e6 60%, #eef3f9 100%)', fx: 'snow' },
    { id: 'charcoal', name: 'Charcoal', css: 'linear-gradient(160deg, #2b2d33 0%, #1c1d22 100%)', fx: 'none' },
    { id: 'aurora', name: 'Aurora', css: 'linear-gradient(120deg, #0f2a3d, #1d5a63, #3b8f7a, #2a4a8f, #0f2a3d)', fx: 'stars', animated: true },
    { id: 'custom', name: 'Custom colours', css: null, fx: 'none' },
    { id: 'image', name: 'My picture', css: null, fx: 'none' },
  ];

  /* ---------------------------------------------------------------- card faces */
  const FACES = [
    { id: 'cream', name: 'Cream', bg: '#fbf4e4', edge: '#d9ccaa', ink: '#2b2420', red: '#b3342b' },
    { id: 'snow', name: 'Snow', bg: '#ffffff', edge: '#d3d7e0', ink: '#1f2430', red: '#d03a3a' },
    { id: 'night', name: 'Night', bg: '#2a2a3a', edge: '#4a4a62', ink: '#e8e6f2', red: '#ff7f86' },
    { id: 'rose', name: 'Rose', bg: '#fff0f3', edge: '#efc2cf', ink: '#4a2f3a', red: '#d1456b' },
    { id: 'sage', name: 'Sage', bg: '#f1f5e9', edge: '#c5d2b2', ink: '#2c3a2c', red: '#b4533c' },
  ];

  /* ---------------------------------------------------------------- card backs */
  const BACK_DESIGNS = [
    { id: 'lattice', name: 'Lattice', c1: '#2f4f8f', c2: '#f3e3b0' },
    { id: 'stars', name: 'Stargazer', c1: '#27264d', c2: '#ffd98a' },
    { id: 'moon', name: 'Moonlight', c1: '#1f3a4f', c2: '#f6eac2' },
    { id: 'paws', name: 'Cat paws', c1: '#7a4b6e', c2: '#ffd1dc' },
    { id: 'waves', name: 'Waves', c1: '#1f6f8b', c2: '#bfe8ef' },
    { id: 'floral', name: 'Floral', c1: '#a8485f', c2: '#ffe3d6' },
    { id: 'plaid', name: 'Cosy plaid', c1: '#9c3b34', c2: '#f4e2c0' },
    { id: 'sun', name: 'Sunburst', c1: '#c4622d', c2: '#ffe2a8' },
  ];

  function backSVG(design, c1, c2) {
    const frame = `<rect x="4" y="4" width="92" height="132" rx="6" fill="none" stroke="${c2}" stroke-width="1.6" opacity=".95"/>` +
      `<rect x="8" y="8" width="84" height="124" rx="3.5" fill="none" stroke="${c2}" stroke-width=".6" opacity=".6"/>`;
    const fillPat = (pat, w, h, inner) => `<defs><pattern id="p" width="${w}" height="${h}" patternUnits="userSpaceOnUse">${inner}</pattern></defs><rect x="8" y="8" width="84" height="124" fill="url(#p)"/>`;
    let body = '';
    switch (design) {
      case 'lattice':
        body = fillPat('p', 14, 14, `<path d="M0 0L14 14M14 0L0 14" stroke="${c2}" stroke-width=".9" opacity=".75"/><circle cx="7" cy="7" r="1.6" fill="${c2}" opacity=".9"/>`); break;
      case 'stars':
        body = fillPat('p', 20, 20, `<path d="M10 5l1.7 3.6 3.9.5-2.9 2.7.8 3.9L10 13.7 6.5 15.7l.8-3.9L4.4 9.1l3.9-.5z" fill="${c2}" opacity=".9"/><circle cx="0" cy="0" r="1" fill="${c2}" opacity=".6"/><circle cx="20" cy="20" r="1" fill="${c2}" opacity=".6"/>`); break;
      case 'moon':
        body = `<defs><mask id="m"><rect width="100" height="140" fill="#fff"/><circle cx="60" cy="62" r="23" fill="#000"/></mask></defs>` +
          `<circle cx="50" cy="70" r="27" fill="${c2}" mask="url(#m)"/>` +
          [[22, 24, 1.8], [78, 30, 1.4], [30, 112, 1.6], [74, 108, 2], [18, 70, 1.2], [84, 78, 1.2], [58, 22, 1.2], [44, 120, 1.2]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c2}" opacity=".9"/>`).join('');
        break;
      case 'paws': {
        const paw = `<ellipse cx="14" cy="18" rx="5.2" ry="4.4" fill="${c2}" opacity=".85"/>` + [[8, 11], [12.5, 8.5], [17.5, 8.5], [22, 11]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.9" ry="2.4" fill="${c2}" opacity=".85"/>`).join('');
        body = fillPat('p', 28, 28, paw); break;
      }
      case 'waves':
        body = fillPat('p', 24, 12, `<path d="M0 12q6-9 12 0t12 0" fill="none" stroke="${c2}" stroke-width="1.1" opacity=".8"/><path d="M0 6q6-9 12 0t12 0" fill="none" stroke="${c2}" stroke-width=".7" opacity=".45"/>`); break;
      case 'floral': {
        const petals = [0, 72, 144, 216, 288].map(a => `<circle cx="${15 + 5 * Math.cos(a * Math.PI / 180)}" cy="${15 + 5 * Math.sin(a * Math.PI / 180)}" r="3.4" fill="${c2}" opacity=".85"/>`).join('');
        body = fillPat('p', 30, 30, petals + `<circle cx="15" cy="15" r="2.2" fill="${c1}"/><circle cx="0" cy="0" r="1.4" fill="${c2}" opacity=".7"/><circle cx="30" cy="30" r="1.4" fill="${c2}" opacity=".7"/>`); break;
      }
      case 'plaid':
        body = fillPat('p', 24, 24, `<rect x="0" y="0" width="9" height="24" fill="${c2}" opacity=".28"/><rect x="0" y="0" width="24" height="9" fill="${c2}" opacity=".28"/><path d="M15 0v24M0 15h24" stroke="${c2}" stroke-width=".8" opacity=".55"/>`); break;
      case 'sun': {
        let rays = '';
        for (let i = 0; i < 20; i++) {
          const a1 = (i * 18) * Math.PI / 180, a2 = ((i * 18) + 9) * Math.PI / 180;
          rays += `<path d="M50 70L${50 + 90 * Math.cos(a1)} ${70 + 90 * Math.sin(a1)}L${50 + 90 * Math.cos(a2)} ${70 + 90 * Math.sin(a2)}Z" fill="${c2}" opacity=".22"/>`;
        }
        body = `<clipPath id="cp"><rect x="8" y="8" width="84" height="124"/></clipPath><g clip-path="url(#cp)">${rays}</g>` +
          `<circle cx="50" cy="70" r="15" fill="${c2}"/><circle cx="50" cy="70" r="10" fill="${c1}"/><circle cx="50" cy="70" r="5" fill="${c2}"/>`;
        break;
      }
      default: body = '';
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" preserveAspectRatio="none"><rect width="100" height="140" rx="7" fill="${c1}"/>${body}${frame}</svg>`;
  }
  const svgUrl = (svg) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  const backCSS = (design, c1, c2) => svgUrl(backSVG(design, c1, c2));

  /* ---------------------------------------------------------------- vibes (bundled looks) */
  const VIBES = [
    { id: 'rainy-cafe', name: 'Rainy night in', look: { bg: { id: 'rainy-night' }, fx: 'rain', back: { design: 'moon', c1: '#1f3a4f', c2: '#f6eac2' }, face: 'cream', mat: 0.28, accent: '#ffb86b' } },
    { id: 'forest-cabin', name: 'Forest cabin', look: { bg: { id: 'forest' }, fx: 'fireflies', back: { design: 'plaid', c1: '#8a3b2f', c2: '#f4e2c0' }, face: 'sage', mat: 0.3, accent: '#f2c46d' } },
    { id: 'sakura-morning', name: 'Sakura morning', look: { bg: { id: 'sakura' }, fx: 'petals', back: { design: 'floral', c1: '#a8485f', c2: '#ffe3d6' }, face: 'rose', mat: 0.25, accent: '#ff8fb1' } },
    { id: 'golden-hour', name: 'Golden hour', look: { bg: { id: 'sunset' }, fx: 'none', back: { design: 'sun', c1: '#c4622d', c2: '#ffe2a8' }, face: 'cream', mat: 0.22, accent: '#ffd27a' } },
    { id: 'stargazing', name: 'Stargazing', look: { bg: { id: 'lavender' }, fx: 'stars', back: { design: 'stars', c1: '#27264d', c2: '#ffd98a' }, face: 'snow', mat: 0.3, accent: '#c7b6ff' } },
    { id: 'classic', name: 'Classic felt', look: { bg: { id: 'felt' }, fx: 'none', back: { design: 'lattice', c1: '#2f4f8f', c2: '#f3e3b0' }, face: 'snow', mat: 0, accent: '#ffd36e' } },
    { id: 'snow-day', name: 'Snow day', look: { bg: { id: 'snowy' }, fx: 'snow', back: { design: 'waves', c1: '#1f6f8b', c2: '#bfe8ef' }, face: 'snow', mat: 0.35, accent: '#6fb4ff' } },
    { id: 'cat-nap', name: 'Cat nap', look: { bg: { id: 'cafe' }, fx: 'none', back: { design: 'paws', c1: '#7a4b6e', c2: '#ffd1dc' }, face: 'cream', mat: 0.25, accent: '#ffb3c7' } },
  ];

  /* ---------------------------------------------------------------- painting */
  function bgCSS(bg) {
    if (bg.id === 'image' && NS.store.get('img.bg')) return `url("${NS.store.get('img.bg')}") center/cover no-repeat`;
    if (bg.id === 'image' && bg.url) return `url("${bg.url.replace(/"/g, '%22')}") center/cover no-repeat`;
    if (bg.id === 'custom') return `linear-gradient(${bg.angle == null ? 160 : bg.angle}deg, ${bg.c1 || '#3a3f6b'}, ${bg.c2 || '#16182e'})`;
    const found = BACKGROUNDS.find(b => b.id === bg.id) || BACKGROUNDS[0];
    return found.css || BACKGROUNDS[0].css;
  }

  function backImageCSS(back) {
    if (back.design === 'image') {
      const src = NS.store.get('img.back') || back.url;
      if (src) return `url("${String(src).replace(/"/g, '%22')}")`;
    }
    const d = BACK_DESIGNS.find(x => x.id === back.design) || BACK_DESIGNS[0];
    return backCSS(d.id, back.c1 || d.c1, back.c2 || d.c2);
  }

  function hexToRgb(hex) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 184, 107];
  }

  /** Apply a `look` object to the page. Cheap enough to call on every change. */
  function applyLook(look) {
    const root = document.documentElement;
    const face = FACES.find(f => f.id === look.face) || FACES[0];
    root.style.setProperty('--face-bg', face.bg);
    root.style.setProperty('--face-edge', face.edge);
    root.style.setProperty('--ink', face.ink);
    root.style.setProperty('--red', face.red);
    root.dataset.suits = look.suits || 'classic';
    root.style.setProperty('--back-img', backImageCSS(look.back));
    const [r, g, b] = hexToRgb(look.accent);
    root.style.setProperty('--accent', look.accent || '#ffb86b');
    root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
    // readable text on the accent colour
    root.style.setProperty('--on-accent', (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#22180f' : '#fff');
    root.style.setProperty('--mat-a', String(look.mat == null ? 0.25 : look.mat));
    root.dataset.mat = look.matStyle || 'glass';

    const bgEl = document.getElementById('bg');
    if (bgEl) {
      const def = BACKGROUNDS.find(b2 => b2.id === look.bg.id);
      bgEl.style.background = bgCSS(look.bg);
      bgEl.classList.toggle('animated', !!(def && def.animated));
      bgEl.style.backgroundSize = def && def.animated ? '300% 300%' : '';
      bgEl.style.filter = look.blur ? `blur(${look.blur}px)` : '';
      bgEl.style.transform = look.blur ? 'scale(1.06)' : '';
    }
    const dim = document.getElementById('bg-dim');
    if (dim) dim.style.opacity = String(look.dim == null ? 0.18 : look.dim);
    const grain = document.getElementById('bg-grain');
    if (grain) grain.style.display = look.grain === false ? 'none' : '';
  }

  NS.themes = { BACKGROUNDS, FACES, BACK_DESIGNS, VIBES, backCSS, backImageCSS, applyLook, bgCSS };
})();
