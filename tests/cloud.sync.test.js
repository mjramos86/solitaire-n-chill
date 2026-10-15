/* Cloud-sync tests: several simulated devices share one in-memory "Firestore".
   Needs Playwright (npm i playwright). Run:  node tests/cloud.sync.test.js */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(b); }); });
let BASE = '';
const assert = require('assert');
const db = {};
const FAKE = `window.SNC_FIREBASE={apiKey:'x',projectId:'test',authDomain:'x',testBackend:(function(){let cb=null;return{async init(){},onAuth(f){cb=f},async signIn(){cb({uid:window.__uid||'u1',name:'Test Player',email:'test@example.com',photo:''})},async signOut(){cb(null)},async get(uid){return await window.dbGet(uid)},async set(uid,d){await window.dbSet(uid,d)},async stats(uid,fn){const d=await window.dbGet(uid);const cur=d&&d.stats?JSON.parse(d.stats):null;const next=fn(cur);if(JSON.stringify(next)!==JSON.stringify(cur))await window.dbSet(uid,{stats:JSON.stringify(next),v:1});return next},async del(uid){await window.dbDel(uid)}}})()};`;
async function device(b, name) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
  await ctx.exposeFunction('dbGet', (uid) => db[uid] ? JSON.parse(JSON.stringify(db[uid])) : null);
  await ctx.exposeFunction('dbSet', (uid, d) => { const cur = db[uid] || {}; db[uid] = { ...cur, ...d, t: { ...(cur.t || {}), ...(d.t || {}) } }; });
  await ctx.exposeFunction('dbDel', (uid) => { delete db[uid]; });
  await ctx.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE }));
  const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', e => p.errs.push(name + ' PAGEERR ' + e.message));
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(500);
  p.ctx = ctx; p.name = name;
  return p;
}
const settle = (p, ms = 600) => p.waitForTimeout(ms);
const syncNow = async (p) => { await p.evaluate(() => SNC.cloud.syncNow()); await p.waitForTimeout(300); };
const status = (p) => p.evaluate(() => SNC.cloud.state.status);
(async () => {
  await new Promise(r => server.listen(0, r)); BASE = 'http://localhost:' + server.address().port;
  const b = await chromium.launch();
  const A = await device(b, 'A');
  // --- 1. signed-out UI
  assert(await A.evaluate(() => !document.getElementById('btn-account').hidden), 'account button visible');
  assert.strictEqual((await A.textContent('#btn-account .acct-lbl')).trim(), 'Login', 'button says Login');
  await A.evaluate(() => SNC.customize.open('account')); await A.waitForTimeout(400);
  assert(await A.evaluate(() => !!document.querySelector('.gbtn')), 'google button shown');
  await A.keyboard.press('Escape');
  console.log('1 signed-out UI ok');

  // --- 2. A customises, plays, signs in -> uploaded
  await A.evaluate(() => {
    SNC.settings.patch('look', { bg: { id: 'sakura' }, fx: 'petals', face: 'rose', accent: '#ff8fb1' });
    SNC.store.set('note', 'buy milk'); SNC.bus.emit('note');
    SNC.music.addLink('https://example.com/tone.mp3', false);
    SNC.game.stats.played = 3; SNC.game.stats.won = 1; SNC.game.stats.bestTime = 200; SNC.game.stats.bestMoves = 80; SNC.game.stats.bestScore = 500; SNC.game.stats.streak = 1; SNC.game.stats.bestStreak = 1; SNC.game.saveStats();
  });
  await A.evaluate(() => SNC.cloud.signIn()); await settle(A, 1200);
  assert.strictEqual(await status(A), 'synced', 'A synced: ' + await status(A));
  const d1 = db.u1;
  assert(d1 && JSON.parse(d1.settings).look.bg.id === 'sakura', 'settings uploaded');
  assert.strictEqual(JSON.parse(d1.note), 'buy milk');
  assert.strictEqual(JSON.parse(d1.music).items.length, 1);
  assert.strictEqual(JSON.parse(d1.stats).played, 3);
  console.log('2 upload ok  ->', JSON.stringify(JSON.parse(d1.stats)));
  await A.click('#btn-account'); await A.waitForTimeout(400);
  await A.keyboard.press('Escape');

  // --- 3. B fresh device signs in -> receives everything, no prompt
  const B = await device(b, 'B');
  await B.click('#btn-account'); await settle(B, 1200); // the Login button itself signs in
  assert.strictEqual((await B.textContent('#btn-account .acct-lbl')).trim(), 'Test', 'signed-in button shows the first name');
  assert(!(await B.evaluate(() => !!document.querySelector('.modal'))), 'no prompt for a clean device');
  assert.strictEqual(await B.evaluate(() => SNC.settings.data.look.bg.id), 'sakura');
  assert.strictEqual(await B.evaluate(() => SNC.settings.data.look.accent), '#ff8fb1');
  assert.strictEqual(await B.evaluate(() => SNC.store.get('note', '')), 'buy milk');
  assert.strictEqual(await B.evaluate(() => SNC.music.items.length), 1);
  assert.strictEqual(await B.evaluate(() => SNC.game.stats.played), 3);
  assert.strictEqual(await B.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()), '#ff8fb1');
  console.log('3 clean device receives account data ok');

  // --- 4. both play before syncing -> counters add, records keep best
  await A.evaluate(() => { const g = SNC.game; g.stats.played++; g.stats.won++; g.stats.bestTime = 150; g.saveStats(); SNC.cloud.noteStat('played'); SNC.cloud.noteStat('won'); });
  await B.evaluate(() => { const g = SNC.game; g.stats.played += 2; g.stats.bestScore = 900; g.saveStats(); SNC.cloud.noteStat('played'); SNC.cloud.noteStat('played'); });
  await syncNow(A); await syncNow(B); await syncNow(A);
  const stA = await A.evaluate(() => ({ ...SNC.game.stats })), stB = await B.evaluate(() => ({ ...SNC.game.stats }));
  console.log('4 merged stats A', JSON.stringify(stA), 'B', JSON.stringify(stB), 'cloud', db.u1.stats);
  assert.strictEqual(stA.played, 6); assert.strictEqual(stB.played, 6); assert.strictEqual(stA.streak, 1, 'streak survives a clean device linking'); assert.strictEqual(stB.streak, 1);
  assert.strictEqual(stA.won, 2); assert.strictEqual(stA.bestTime, 150); assert.strictEqual(stB.bestScore, 900); assert.strictEqual(stA.bestScore, 900);

  // --- 5. settings change on B shows up on A; newest wins on concurrent edits
  await B.evaluate(() => SNC.settings.set('look.accent', '#6fb4ff')); await B.waitForTimeout(3600);
  await syncNow(A);
  assert.strictEqual(await A.evaluate(() => SNC.settings.data.look.accent), '#6fb4ff', 'A received B change');
  await A.evaluate(() => SNC.settings.set('look.accent', '#7fd8b0')); await A.waitForTimeout(50);
  await B.evaluate(() => SNC.settings.set('look.accent', '#ffd27a')); await B.waitForTimeout(3600); // B edits later -> wins
  await syncNow(A); await syncNow(B); await syncNow(A);
  const accA = await A.evaluate(() => SNC.settings.data.look.accent), accB = await B.evaluate(() => SNC.settings.data.look.accent);
  console.log('5 concurrent accent A', accA, 'B', accB);
  assert.strictEqual(accA, accB);

  // --- 6. first link with differing local data -> prompt (device wins, then cloud wins)
  const C = await device(b, 'C');
  await C.evaluate(() => { SNC.settings.set('look.face', 'night'); SNC.game.stats.played = 5; SNC.game.stats.won = 5; SNC.game.saveStats(); });
  await C.waitForTimeout(100);
  await C.evaluate(() => { SNC.cloud.signIn(); }); await settle(C, 1000);
  assert(await C.evaluate(() => !!document.querySelector('.modal')), 'conflict prompt shown');
  await C.evaluate(() => [...document.querySelectorAll('.modal .btn')].find(x => x.textContent.startsWith('Keep this')).click()); await settle(C, 1200);
  assert.strictEqual(JSON.parse(db.u1.settings).look.face, 'night', 'device version pushed to cloud');
  assert.strictEqual(JSON.parse(db.u1.stats).played, 11, 'guest stats added to the account: ' + db.u1.stats);
  const D = await device(b, 'D');
  await D.evaluate(() => { SNC.settings.set('look.face', 'snow'); });
  await D.waitForTimeout(100);
  await D.evaluate(() => { SNC.cloud.signIn(); }); await settle(D, 1000);
  await D.evaluate(() => [...document.querySelectorAll('.modal .btn')].find(x => x.textContent.startsWith('Use my')).click()); await settle(D, 1200);
  assert.strictEqual(await D.evaluate(() => SNC.settings.data.look.face), 'night', 'cloud version applied');
  // dismissing the prompt pauses sync without touching anything
  const E = await device(b, 'E');
  await E.evaluate(() => { SNC.settings.set('look.face', 'sage'); }); await E.waitForTimeout(100);
  await E.evaluate(() => { SNC.cloud.signIn(); }); await settle(E, 800);
  await E.keyboard.press('Escape'); await settle(E, 600);
  assert.strictEqual(await status(E), 'paused'); assert.strictEqual(JSON.parse(db.u1.settings).look.face, 'night');
  console.log('6 first-link prompt ok (device / cloud / dismiss)');

  // --- 7. sign out keeps local data; delete wipes cloud only
  await A.evaluate(() => SNC.cloud.signOut()); await settle(A, 400);
  assert.strictEqual(await status(A), 'signedout'); assert(await A.evaluate(() => SNC.game.stats.played) >= 6);
  await A.evaluate(() => SNC.cloud.signIn()); await settle(A, 1000);
  await A.evaluate(() => SNC.cloud.deleteCloudData()); await settle(A, 400);
  assert(!db.u1, 'cloud doc deleted');
  assert(await A.evaluate(() => SNC.game.stats.played) >= 6, 'local stats kept');
  console.log('7 sign-out / delete ok');
  const errs = [A, B, C, D, E].flatMap(p => p.errs);
  console.log(errs.join('\n') || 'no page errors');
  await b.close(); server.close();
})().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
