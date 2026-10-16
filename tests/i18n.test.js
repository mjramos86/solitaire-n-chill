/* Language-file tests (no browser needed):  node tests/i18n.test.js
   - every language defines exactly the keys of en.js (plus extra plural forms where the language needs them)
   - {placeholders} match between English and each translation
   - every key used by the code (t('…'), data-i18n="…", dynamic prefixes) exists in English */
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const LANGS = ['en', 'fr', 'es', 'pt', 'de', 'ru'];

global.window = global;
const dicts = {};
global.SNC = { i18n: { add(code, d) { dicts[code] = Object.assign(dicts[code] || {}, d); } } };
LANGS.forEach(l => require(path.join(ROOT, 'js/lang', l + '.js')));

const en = dicts.en, enKeys = Object.keys(en);
const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join();
const PLURAL = /_(zero|one|two|few|many|other)$/;
let problems = 0;
const fail = (m) => { problems++; console.error('✗ ' + m); };

for (const l of LANGS.filter(x => x !== 'en')) {
  const d = dicts[l];
  const missing = enKeys.filter(k => !(k in d));
  // plural keys: a language may add forms (ru: _few/_many) as long as the base key exists in English
  const extra = Object.keys(d).filter(k => !(k in en) && !(PLURAL.test(k) && enKeys.some(e => e.replace(PLURAL, '') === k.replace(PLURAL, ''))));
  const badPh = enKeys.filter(k => k in d && ph(en[k]) !== ph(d[k]));
  const empty = Object.keys(d).filter(k => !String(d[k]).trim());
  if (missing.length) fail(`${l}: missing ${missing.join(', ')}`);
  if (extra.length) fail(`${l}: unknown keys ${extra.join(', ')}`);
  if (badPh.length) fail(`${l}: placeholder mismatch in ${badPh.join(', ')}`);
  if (empty.length) fail(`${l}: empty ${empty.join(', ')}`);
  console.log(`${l}: ${Object.keys(d).length} keys`);
}
// Russian needs its extra plural forms
['fc.done_few', 'fc.done_many'].forEach(k => { if (!dicts.ru[k]) fail('ru: missing ' + k); });

/* keys referenced by the code */
const files = [...fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'i18n.js').map(f => path.join('js', f)), 'index.html'];
const used = new Set(), prefixes = new Set();
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of src.matchAll(/\b(?:NS\.t|tr|t)\(\s*'([\w.]+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/\b(?:NS\.t|tr|t)\(\s*'([\w.]+\.)'\s*\+/g)) prefixes.add(m[1]);
  for (const m of src.matchAll(/data-i18n(?:-title|-aria|-content)?="([\w.]+)"/g)) used.add(m[1]);
  for (const m of src.matchAll(/\b(?:cb\.error|setMsg|setupUI)\(\s*'([\w.]+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/'(cloud\.(?:conflict|keep|use|paused|err|st\.|l\d|sync|sign|delete|intro|google|opening|fine|deleted)\w*)'/g)) used.add(m[1]); // status messages are stored as keys
  for (const m of src.matchAll(/error: '(news\.\w+)'/g)) used.add(m[1]);
}
const has = (k) => k in en || ['one', 'other'].some(c => (k + '_' + c) in en);
for (const k of used) if (!k.endsWith('.') && !has(k)) fail('code uses unknown key ' + k);
// dynamic key families
const FAMILIES = {
  'w.': ['clock', 'weather', 'stats', 'focus', 'note', 'quote', 'news', 'ambience'], 'tab.': ['account', 'look', 'game', 'widgets', 'sound', 'data'],
  'fx.': ['none', 'rain', 'snow', 'petals', 'fireflies', 'stars'], 'amb.': ['rain', 'wind', 'fire'], 'topic.': ['top', 'world', 'nation', 'local', 'business', 'technology', 'science', 'health', 'sports', 'entertainment'],
  'wx.': ['clear', 'mostlyClear', 'partlyCloudy', 'overcast', 'fog', 'drizzle', 'rain', 'snow', 'thunder', 'other'],
  'bg.': ['rainy-night', 'forest', 'sunset', 'sakura', 'cafe', 'felt', 'ocean', 'lavender', 'snowy', 'charcoal', 'aurora', 'custom', 'image'],
  'face.': ['cream', 'snow', 'night', 'rose', 'sage'], 'back.': ['lattice', 'stars', 'moon', 'paws', 'waves', 'floral', 'plaid', 'sun'],
  'vibe.': ['rainy-cafe', 'forest-cabin', 'sakura-morning', 'golden-hour', 'stargazing', 'classic', 'snow-day', 'cat-nap'],
  'mp.sp.': ['track', 'album', 'playlist', 'episode', 'show', 'artist'], 'mp.rep.': ['all', 'one', 'off'], 'news.region.': ['WORLD', 'CA', 'CA-FR'],
  'q.': Array.from({ length: 16 }, (_, i) => String(i)),
};
for (const [pre, ids] of Object.entries(FAMILIES)) for (const id of ids) if (!has(pre + id)) fail('missing key ' + pre + id);
for (const p of prefixes) if (!FAMILIES[p]) console.warn('! dynamic prefix not covered by this test: ' + p);

/* the theme ids in themes.js are the ones the key families above assume */
const themes = fs.readFileSync(path.join(ROOT, 'js/themes.js'), 'utf8');
const ids = [...themes.matchAll(/\{ id: '([\w-]+)', name:/g)].map(m => m[1]);
ids.forEach(id => { if (!['bg.', 'face.', 'back.', 'vibe.'].some(p => has(p + id))) fail('theme id without a translated name: ' + id); });

assert.strictEqual(problems, 0, problems + ' problem(s)');
console.log('i18n OK – ' + enKeys.length + ' keys × ' + LANGS.length + ' languages');
