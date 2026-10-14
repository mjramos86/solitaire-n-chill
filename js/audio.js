/* Sound: card sfx (the original game's two samples), little synthesized chimes,
   and a three-channel ambience mixer (rain / wind / fireplace) generated with WebAudio. */
(function () {
  'use strict';
  const NS = window.SNC;

  /* ---------------------------------------------------------------- card sfx */
  const SRC = { taken: 'assets/sfx/card_taken.mp3', moved: 'assets/sfx/card_moved.mp3' };
  const pools = {};
  function sfx(name) {
    const st = NS.settings.data.sound;
    if (!st.sfx || !SRC[name]) return;
    let p = pools[name];
    if (!p) {
      p = pools[name] = { list: [], i: 0 };
      for (let k = 0; k < 5; k++) { const a = new Audio(SRC[name]); a.preload = 'auto'; p.list.push(a); }
    }
    const a = p.list[p.i];
    p.i = (p.i + 1) % p.list.length;
    try { a.currentTime = 0; a.volume = NS.clamp(st.sfxVolume, 0, 1); a.play().catch(() => {}); } catch (e) { /* ignore */ }
  }

  /* ---------------------------------------------------------------- WebAudio context */
  let ctx = null;
  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  /** Soft bell-ish arpeggio for the pomodoro timer and for winning. */
  function chime(notes, gain = 0.12) {
    const c = ac();
    if (!c || !NS.settings.data.sound.sfx) return;
    const t0 = c.currentTime + 0.02;
    notes.forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = t0 + i * 0.16;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain * NS.settings.data.sound.sfxVolume, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 1.4);
    });
  }
  const winChime = () => chime([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.14);
  const doneChime = () => chime([659.25, 523.25, 659.25, 783.99], 0.14);

  /* ---------------------------------------------------------------- ambience */
  let master = null;
  const chans = {};

  function noiseBuffer(c, seconds, kind) {
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }
  function loopSource(c, buf) {
    const s = c.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.start(0, Math.random() * buf.duration);
    return s;
  }

  function buildChannel(name) {
    const c = ac();
    const out = c.createGain();
    out.gain.value = 0;
    out.connect(master);
    const ch = { out, stop() {} };
    if (name === 'rain') {
      const s = loopSource(c, noiseBuffer(c, 4, 'white'));
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7500;
      s.connect(hp).connect(lp).connect(out);
      // a quieter, rounder layer underneath for body
      const s2 = loopSource(c, noiseBuffer(c, 5, 'brown'));
      const lp2 = c.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 500;
      const g2 = c.createGain(); g2.gain.value = 0.35;
      s2.connect(lp2).connect(g2).connect(out);
    } else if (name === 'wind') {
      const s = loopSource(c, noiseBuffer(c, 6, 'brown'));
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.7;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.11;
      const lg = c.createGain(); lg.gain.value = 260;
      lfo.connect(lg).connect(bp.frequency); lfo.start();
      s.connect(bp).connect(out);
    } else if (name === 'fire') {
      const s = loopSource(c, noiseBuffer(c, 5, 'brown'));
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      const rumble = c.createGain(); rumble.gain.value = 0.9;
      s.connect(lp).connect(rumble).connect(out);
      // crackles: short band-passed noise ticks at random times
      const crackBuf = noiseBuffer(c, 0.06, 'white');
      let alive = true;
      const pop = () => {
        if (!alive) return;
        if (out.gain.value > 0.005) {
          const b = c.createBufferSource(); b.buffer = crackBuf;
          const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200 + Math.random() * 3800; f.Q.value = 1.2;
          const g = c.createGain(); g.gain.value = 0.15 + Math.random() * 0.55;
          g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.05);
          b.connect(f).connect(g).connect(out);
          b.start();
        }
        setTimeout(pop, 60 + Math.random() * (Math.random() < 0.2 ? 90 : 650));
      };
      pop();
      ch.stop = () => { alive = false; };
    }
    return ch;
  }

  const LEVEL = { rain: 0.5, wind: 0.55, fire: 0.6 };
  function setAmbience(name, level) {
    level = NS.clamp(level, 0, 1);
    NS.settings.set('sound.ambience.' + name, level);
    if (level <= 0 && !chans[name]) return;
    const c = ac();
    if (!c) return;
    if (!master) { master = c.createGain(); master.gain.value = 1; master.connect(c.destination); }
    if (!chans[name]) chans[name] = buildChannel(name);
    chans[name].out.gain.setTargetAtTime(level * (LEVEL[name] || 0.5), c.currentTime, 0.25);
  }
  /** Re-start remembered ambience after the first user gesture (autoplay policy). */
  function resumeSaved() {
    const a = NS.settings.data.sound.ambience;
    Object.keys(a).forEach(n => { if (a[n] > 0) setAmbience(n, a[n]); });
  }

  NS.audio = { sfx, chime, winChime, doneChime, setAmbience, resumeSaved, ac };
})();
