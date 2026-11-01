// Nostalgia Pro: sound. Everything is generated with Web Audio. There are no audio files.
// Browsers (iPhone Safari most of all) only allow sound after a tap or key press, so the game opens on a
// "Tap to start" screen and audio unlocks inside that tap. Works in iframes and from file://.
var NP = window.NP || {};
window.NP = NP;

NP.Sound = (function () {
  'use strict';
  var KEY = 'npgame_sound_muted';
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  var muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) {}
  var wanted = null, playing = null, seq = null, unlocked = false;
  var MASTER = 0.9, VOL = 1;
  try { var sv = parseFloat(localStorage.getItem('npgame_volume')); if (sv >= 0 && sv <= 1) VOL = sv; } catch (e) {}

  function ensure() {
    if (!AC) return null;
    if (!ctx) {
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain(); master.gain.value = muted ? 0 : MASTER * VOL; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.2; musicBus.connect(master);
      ctx.onstatechange = function () { if (ctx.state === 'running') afterUnlock(); };
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ctx;
  }
  function ready() { return !!(ctx && ctx.state === 'running'); }

  // ---------- unlock on the first tap, click or key ----------
  // Only these events count as a real tap to Chrome on Android and Safari on iPhone, so audio starts on them.
  // (A finger touching down, pointerdown, does not count yet; the lift does.) The listeners stay on, so a phone
  // call or a trip to another app that pauses the audio is fixed by the next tap.
  var GESTURES = ['touchend', 'pointerup', 'mousedown', 'keydown', 'click'];
  var isIOS = (function () {
    try { return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); } catch (e) { return false; }
  })();

  // iPhone: the ring/silent switch mutes Web Audio unless the page says it is playing real audio.
  // Safari 17 and up have navigator.audioSession for that. Older iPhones need a silent <audio> loop running.
  function playbackSession() {
    try { if (navigator.audioSession) { navigator.audioSession.type = 'playback'; return true; } } catch (e) {}
    return false;
  }
  var hasSession = playbackSession();
  function silentWav() {
    // half a second of 8-bit silence, built here so there is no audio file to ship
    var n = 4000, b = new Uint8Array(44 + n), dv = new DataView(b.buffer);
    var w = function (o, str) { for (var i = 0; i < str.length; i++) b[o + i] = str.charCodeAt(i); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
    w(36, 'data'); dv.setUint32(40, n, true);
    for (var i = 0; i < n; i++) b[44 + i] = 128;
    var bin = ''; for (i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }
  var silentEl = null;
  function silentLoop() {
    if (!isIOS || hasSession || muted) return;
    try {
      if (!silentEl) {
        silentEl = document.createElement('audio');
        silentEl.setAttribute('x-webkit-airplay', 'deny');
        silentEl.setAttribute('playsinline', '');
        silentEl.preload = 'auto'; silentEl.loop = true;
        silentEl.src = silentWav();
      }
      if (silentEl.paused) { var p = silentEl.play(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) {}
  }

  function onGesture() {
    if (ready()) { silentLoop(); return; }
    var c = ensure();
    if (!c) { detach(); return; }
    playbackSession();
    silentLoop();
    try {
      // a silent one-sample buffer, played inside the tap, is what wakes up iOS
      var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
      s.buffer = b; s.connect(c.destination); s.start(0);
      if (c.state !== 'running' && c.resume) {
        var p = c.resume();
        if (p && p.then) p.then(afterUnlock, function () {});
      }
    } catch (e) {}
    afterUnlock();
  }
  function afterUnlock() {
    if (!ready()) return;
    unlocked = true;
    if (seq) seq.next = ctx.currentTime + 0.05;
    startMusic(); startAmb(); if (ambWanted === 'radio') radioOn();
  }
  function attach() {
    GESTURES.forEach(function (g) { window.addEventListener(g, onGesture, true); });
  }
  function detach() { GESTURES.forEach(function (g) { window.removeEventListener(g, onGesture, true); }); }
  attach();

  // pause audio when the tab or app goes to the background
  document.addEventListener('visibilitychange', function () {
    if (!ctx || !unlocked) return;
    try {
      if (document.hidden) { ctx.suspend(); if (silentEl) silentEl.pause(); }
      else { silentLoop(); var p = ctx.resume(); if (p && p.then) p.then(afterUnlock, function () {}); }
    } catch (e) {}
  });

  // ---------- building blocks ----------
  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(f, t, dur, type, vol, bus, f2) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    env(g, t, 0.004, vol, dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(t, dur, vol, ftype, freq, bus) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = ftype || 'highpass'; f.frequency.value = freq || 1000;
    env(g, t, 0.003, vol, dur);
    s.connect(f); f.connect(g); g.connect(bus || sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // ---------- effects ----------
  var FX = {
    blip: function (t) { tone(880, t, 0.045, 'square', 0.1); },
    start: function (t) { tone(midi(72), t, 0.07, 'square', 0.16); tone(midi(79), t + 0.08, 0.14, 'square', 0.16); },
    vcr: function (t) { tone(1320, t, 0.07, 'square', 0.12); },
    tvclick: function (t) { noise(t, 0.04, 0.5, 'lowpass', 3000); tone(110, t, 0.08, 'sine', 0.4, null, 40); },
    tvoff: function (t) { tone(1500, t, 0.32, 'sine', 0.18, null, 60); noise(t, 0.05, 0.3, 'lowpass', 2000); },
    static: function (t) { noise(t, 0.9, 0.16, 'highpass', 900); },
    staticshort: function (t) { noise(t, 0.22, 0.14, 'highpass', 900); },
    alarm: function (t) { for (var i = 0; i < 6; i++) tone(1046, t + i * 0.2, 0.09, 'square', 0.15); },
    keys: function (t) { for (var i = 0; i < 6; i++) tone(2400 + Math.random() * 1800, t + i * 0.035, 0.05, 'triangle', 0.07); },
    accept: function (t) { [72, 76, 79].forEach(function (n, i) { tone(midi(n), t + i * 0.06, 0.08, 'square', 0.13); }); },
    reject: function (t) { tone(330, t, 0.22, 'sawtooth', 0.09, null, 140); },
    cash: function (t) { noise(t, 0.05, 0.28, 'bandpass', 2500); tone(1568, t + 0.05, 0.35, 'triangle', 0.2); tone(2093, t + 0.12, 0.45, 'triangle', 0.17); },
    step: function (t) { noise(t, 0.025, 0.05, 'lowpass', 900); },
    dex: function (t) { [64, 67, 70, 69, 0, 64].forEach(function (n, i) { if (n) tone(midi(n), t + i * 0.11, 0.1, 'square', 0.12); }); },
    uhoh: function (t) { tone(midi(67), t, 0.12, 'square', 0.12); tone(midi(63), t + 0.15, 0.28, 'square', 0.12); },
    fanfare: function (t) { [60, 64, 67, 72].forEach(function (n, i) { tone(midi(n), t + i * 0.09, i === 3 ? 0.4 : 0.09, 'square', 0.12); }); },
    // the "unsponsored moment" jingle: a bright little ad sting with a shimmer on top
    jingle: function (t) {
      [72, 76, 79, 84, 79, 84].forEach(function (n, i) { tone(midi(n), t + i * 0.09, i === 5 ? 0.5 : 0.08, 'triangle', 0.16); });
      [60, 67].forEach(function (n, i) { tone(midi(n), t + i * 0.27, 0.25, 'square', 0.06); });
      for (var i = 0; i < 8; i++) tone(3000 + i * 260, t + 0.45 + i * 0.03, 0.05, 'sine', 0.05);
    },
    sparkle: function (t) { for (var i = 0; i < 5; i++) tone(2600 + i * 400, t + i * 0.04, 0.06, 'sine', 0.06); },
    // Round 3c: little reward sounds (count-ups, great finds, streaks, unlocks). Quiet on purpose.
    tick: function (t) { tone(1760, t, 0.025, 'square', 0.04); },
    squeak: function (t) { tone(2300, t, 0.07, 'sine', 0.05, null, 3100); tone(2900, t + 0.09, 0.06, 'sine', 0.04, null, 2200); },
    buzz: function (t) { tone(190, t, 0.25, 'sawtooth', 0.02, null, 230); },
    sting: function (t) {
      [67, 72, 76, 79, 84].forEach(function (n, i) { tone(midi(n), t + i * 0.07, i === 4 ? 0.35 : 0.07, 'square', 0.1); });
      for (var i = 0; i < 6; i++) tone(2800 + i * 320, t + 0.35 + i * 0.035, 0.05, 'sine', 0.05);
    },
    streak: function (t) { [74, 79, 83].forEach(function (n, i) { tone(midi(n), t + i * 0.05, 0.07, 'triangle', 0.12); }); },
    unlock: function (t) { [72, 79, 84, 88].forEach(function (n, i) { tone(midi(n), t + i * 0.08, i === 3 ? 0.3 : 0.07, 'triangle', 0.12); }); },
    // Round 5: the jackpot sounds
    rise: function (t, n) { var b = 67 + Math.min(12, (n || 1) * 2); [0, 4, 7].forEach(function (d, i) { tone(midi(b + d), t + i * 0.045, i === 2 ? 0.12 : 0.05, 'square', 0.1); }); },
    coin: function (t) { tone(1976, t, 0.04, 'square', 0.07); tone(2637, t + 0.04, 0.09, 'square', 0.06); },
    flip: function (t) { noise(t, 0.08, 0.18, 'bandpass', 1400); tone(520, t + 0.02, 0.07, 'triangle', 0.08, null, 900); },
    shake: function (t) { tone(70, t, 0.18, 'sine', 0.35, null, 40); noise(t, 0.12, 0.12, 'lowpass', 400); },
    grail: function (t) {
      [60, 64, 67, 72, 76, 79, 84].forEach(function (n, i) { tone(midi(n), t + i * 0.08, i === 6 ? 0.6 : 0.09, 'square', 0.11); });
      [72, 76, 79].forEach(function (n) { tone(midi(n), t + 0.6, 0.7, 'triangle', 0.08); });
      for (var i = 0; i < 10; i++) tone(2600 + i * 240, t + 0.55 + i * 0.03, 0.06, 'sine', 0.05);
    },
    miss: function (t) { tone(midi(70), t, 0.1, 'square', 0.1); tone(midi(66), t + 0.12, 0.1, 'square', 0.1); tone(midi(61), t + 0.24, 0.3, 'square', 0.1); }
  };
  // the same sound twice within 30ms only plays once (a burst of wins never piles up hundreds of notes)
  var lastFx = {};
  function sfx(name, arg) {
    if (muted || !ready() || !FX[name]) return;
    var now = ctx.currentTime;
    if (lastFx[name] != null && now - lastFx[name] < 0.03) return;
    lastFx[name] = now;
    try { FX[name](now + 0.01, arg); } catch (e) {}
  }

  // ---------- music: two short chiptune loops, 4 bars of 16 steps ----------
  var TRACKS = {
    // laid back, for the TV, menus and the map
    title: {
      bpm: 96, chords: [[48, [60, 64, 67, 72]], [45, [57, 60, 64, 69]], [41, [53, 57, 60, 65]], [43, [55, 59, 62, 67]]],
      lead: { 0: 76, 4: 74, 6: 72, 8: 67, 16: 69, 20: 72, 24: 76, 28: 74, 32: 77, 36: 76, 40: 72, 42: 69, 48: 71, 52: 74, 56: 79 },
      leadType: 'triangle', style: 'soft'
    },
    // upbeat, for the swap meet
    swap: {
      bpm: 132, chords: [[45, [57, 60, 64]], [41, [53, 57, 60]], [48, [55, 60, 64]], [43, [55, 59, 62]]],
      lead: { 0: 69, 2: 72, 4: 76, 6: 74, 8: 72, 12: 69, 16: 65, 18: 69, 20: 72, 22: 74, 24: 72, 26: 69,
        32: 67, 34: 72, 36: 76, 38: 79, 40: 76, 44: 72, 48: 71, 50: 74, 52: 79, 54: 77, 56: 74, 58: 71, 60: 67 },
      leadType: 'square', style: 'bounce'
    },
    // Round 3c scenery: each part of the day sounds a little different
    // early morning, driveways and card tables: bright and easy
    morning: {
      bpm: 104, chords: [[48, [60, 64, 67, 71]], [53, [57, 60, 65, 69]], [50, [57, 62, 65, 69]], [55, [59, 62, 67, 71]]],
      lead: { 0: 72, 2: 74, 4: 76, 8: 79, 12: 76, 16: 77, 20: 76, 24: 74, 28: 72, 32: 74, 36: 76, 40: 77, 44: 79, 48: 81, 52: 79, 56: 76, 60: 74 },
      leadType: 'triangle', style: 'soft'
    },
    // the afternoon: strip malls and store closings, a little moodier
    store: {
      bpm: 116, chords: [[45, [57, 60, 64]], [43, [55, 59, 62]], [41, [53, 57, 60]], [40, [52, 56, 59]]],
      lead: { 0: 76, 3: 74, 6: 72, 8: 69, 12: 71, 16: 72, 19: 71, 22: 69, 24: 67, 28: 64, 32: 69, 36: 72, 40: 76, 44: 74, 48: 71, 52: 68, 56: 71, 60: 76 },
      leadType: 'square', style: 'soft'
    },
    // the convention floor: big and busy
    expo: {
      bpm: 144, chords: [[50, [62, 66, 69]], [47, [59, 62, 66]], [43, [55, 59, 62]], [45, [57, 61, 64]]],
      lead: { 0: 74, 2: 78, 4: 81, 6: 78, 8: 74, 10: 78, 12: 81, 14: 86, 16: 83, 20: 79, 24: 78, 28: 74, 32: 76, 34: 79, 36: 83, 38: 79, 40: 76, 44: 73, 48: 74, 52: 78, 56: 81, 60: 86 },
      leadType: 'square', style: 'bounce'
    },
    // fever: faster, higher
    fever: {
      bpm: 160, chords: [[52, [64, 68, 71]], [49, [61, 64, 68]], [45, [57, 61, 64]], [47, [59, 63, 66]]],
      lead: { 0: 76, 1: 80, 2: 83, 4: 88, 6: 83, 8: 80, 10: 83, 12: 88, 16: 85, 18: 88, 20: 92, 24: 88, 28: 85, 32: 81, 34: 85, 36: 88, 40: 93, 44: 88, 48: 87, 50: 83, 52: 87, 56: 90, 60: 95 },
      leadType: 'square', style: 'bounce'
    }
  };
  function playStep(tr, s, t, d) {
    var bar = s >> 4, i = s & 15, ch = tr.chords[bar], root = ch[0], notes = ch[1];
    if (tr.style === 'soft') {
      if (i === 0 || i === 6 || i === 8 || i === 14) tone(midi(root), t, d * 1.8, 'triangle', 0.5, musicBus);
      if (i % 2 === 0) tone(midi(notes[(i / 2) % notes.length]), t, d * 1.4, 'square', 0.05, musicBus);
      if (i === 4 || i === 12) noise(t, 0.06, 0.06, 'bandpass', 1800, musicBus);
      if (i % 4 === 2) noise(t, 0.02, 0.03, 'highpass', 7000, musicBus);
    } else {
      if (i % 2 === 0) tone(midi(i % 4 === 0 ? root : root + 12), t, d * 1.5, 'triangle', 0.45, musicBus);
      if (i === 2 || i === 6 || i === 10 || i === 14) notes.forEach(function (n) { tone(midi(n), t, d * 0.9, 'square', 0.03, musicBus); });
      if (i === 0 || i === 8) tone(140, t, 0.12, 'sine', 0.55, musicBus, 45);
      if (i === 4 || i === 12) noise(t, 0.08, 0.13, 'bandpass', 1800, musicBus);
      if (i % 2 === 1) noise(t, 0.02, 0.035, 'highpass', 7000, musicBus);
    }
    var ln = tr.lead[s];
    if (ln) tone(midi(ln), t, d * (tr.style === 'soft' ? 2.6 : 1.8), tr.leadType, tr.style === 'soft' ? 0.14 : 0.1, musicBus);
  }
  function pump() {
    if (!seq || !ready()) return;
    var now = ctx.currentTime;
    if (seq.next < now - 0.05) seq.next = now + 0.05; // after a stall, skip ahead instead of bursting
    while (seq.next < now + 0.15) {
      try { playStep(seq.tr, seq.step, seq.next, seq.dur); } catch (e) {}
      seq.next += seq.dur;
      seq.step = (seq.step + 1) % 64;
    }
  }
  function stopSeq() { if (seq) clearInterval(seq.id); seq = null; }
  function startMusic() {
    if (!ready() || muted) return;
    if (playing === wanted && seq) return;
    stopSeq(); playing = wanted;
    if (!wanted || !TRACKS[wanted]) { playing = null; return; }
    var tr = TRACKS[wanted];
    seq = { tr: tr, step: 0, next: ctx.currentTime + 0.08, dur: 60 / (tr.bpm * tempoMult) / 4, id: setInterval(pump, 30) };
    pump();
  }
  // the full game speeds the music up a little as your combo climbs (1 = normal)
  var tempoMult = 1;
  function tempo(m) {
    m = Math.max(0.8, Math.min(1.4, +m || 1));
    if (Math.abs(m - tempoMult) < 0.001) return;
    tempoMult = m;
    if (seq) seq.dur = 60 / (seq.tr.bpm * tempoMult) / 4;
  }
  function music(name) {
    wanted = name || null;
    if (wanted !== playing) { stopSeq(); playing = null; startMusic(); }
  }

  // ---------- mute ----------
  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) {}
    if (master && ctx) { try { master.gain.setTargetAtTime(muted ? 0 : MASTER * VOL, ctx.currentTime, 0.02); } catch (e) { master.gain.value = muted ? 0 : MASTER * VOL; } }
    if (muted) { stopSeq(); playing = null; stopAmb(); if (silentEl) silentEl.pause(); } else { silentLoop(); startMusic(); startAmb(); }
    var label = muted ? 'Sound: off' : 'Sound: on';
    document.querySelectorAll('[data-act="mute"]').forEach(function (b) { b.textContent = label; b.setAttribute('aria-pressed', muted ? 'true' : 'false'); });
  }
  function toggle() { setMuted(!muted); if (muted && NP.track) NP.track('muted'); return muted; }

  // ---------- volume (Demo round 5 settings) ----------
  function setVolume(v) {
    VOL = Math.max(0, Math.min(1, +v));
    try { localStorage.setItem('npgame_volume', String(VOL)); } catch (e) {}
    if (master && ctx && !muted) { try { master.gain.setTargetAtTime(MASTER * VOL, ctx.currentTime, 0.02); } catch (e) { master.gain.value = MASTER * VOL; } }
  }

  // ---------- ambience: a swap meet crowd murmur (filtered noise that swells, plus far-off chatter blips) ----------
  var ambWanted = null, amb = null;
  function stopAmb() {
    if (!amb) return;
    clearInterval(amb.id);
    try { amb.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2); amb.src.stop(ctx.currentTime + 0.8); } catch (e) {}
    amb = null;
  }
  function startAmb() {
    if (!ready() || muted || amb || ambWanted !== 'crowd') return;
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.7;
    g.gain.value = 0.0001; g.gain.setTargetAtTime(0.05, ctx.currentTime, 0.6);
    src.connect(f); f.connect(g); g.connect(musicBus);
    src.start();
    amb = { src: src, g: g, f: f, id: setInterval(function () {
      if (!ready() || !amb) return;
      var t = ctx.currentTime;
      try { amb.g.gain.setTargetAtTime(0.035 + Math.random() * 0.035, t, 0.5); amb.f.frequency.setTargetAtTime(420 + Math.random() * 260, t, 0.6); } catch (e) {}
      // somebody laughs, somebody haggles: two or three quick voice-like blips, low and far away
      if (Math.random() < 0.55) { var b = 180 + Math.random() * 140, n = 2 + (Math.random() * 2 | 0); for (var i = 0; i < n; i++) tone(b * (1 + Math.random() * 0.25), t + i * 0.09, 0.07, 'triangle', 0.025, musicBus); }
    }, 900) };
  }
  // Round 6.4: at a yard sale the music comes out of a little radio on the card table. The same music,
  // squeezed through a tinny speaker (a narrow band of frequencies), with a little static now and then.
  var radio = null;
  function radioOn() {
    if (!ready() || radio) return;
    var hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), pk = ctx.createBiquadFilter(), g = ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 520;
    lp.type = 'lowpass'; lp.frequency.value = 2600;
    pk.type = 'peaking'; pk.frequency.value = 1300; pk.Q.value = 1.2; pk.gain.value = 7;
    g.gain.value = 0.75;
    try { musicBus.disconnect(); } catch (e) {}
    musicBus.connect(hp); hp.connect(pk); pk.connect(lp); lp.connect(g); g.connect(master);
    radio = { g: g, id: setInterval(function () {
      if (!ready() || !radio || muted) return;
      var t = ctx.currentTime;
      if (Math.random() < 0.5) noise(t, 0.05 + Math.random() * 0.12, 0.012 + Math.random() * 0.02, 'bandpass', 2400 + Math.random() * 1600, master);
      if (Math.random() < 0.12) { try { g.gain.setTargetAtTime(0.45, t, 0.05); g.gain.setTargetAtTime(0.75, t + 0.35, 0.1); } catch (e) {} } // the signal drifts for a second
    }, 1100) };
  }
  function radioOff() {
    if (!radio) return;
    clearInterval(radio.id);
    try { musicBus.disconnect(); musicBus.connect(master); radio.g.disconnect(); } catch (e) {}
    radio = null;
  }
  function ambience(name) {
    ambWanted = name || null;
    if (ambWanted === 'radio') { stopAmb(); radioOn(); return; }
    radioOff();
    if (ambWanted !== 'crowd') stopAmb(); else startAmb();
  }

  // ---------- ad jingles: [midi note, beats, bass note] steps, a lead with a bass under it ----------
  function jingle(notes, bpm, wave) {
    if (muted || !ready() || !notes) return 0;
    var t = ctx.currentTime + 0.05, beat = 60 / (bpm || 140);
    notes.forEach(function (n) {
      if (n[0]) tone(midi(n[0]), t, beat * n[1] * 0.9, wave || 'square', 0.09);
      if (n[2]) tone(midi(n[2]), t, beat * n[1] * 0.9, 'triangle', 0.35);
      t += beat * n[1];
    });
    return (t - ctx.currentTime) * 1000;
  }

  // a soft blip on every button press (the specific sounds layer on top)
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('button, a.ibtn, a.cart-item');
    if (!el || el.disabled || el.getAttribute('data-act') === 'mute') return;
    sfx('blip');
  }, true);

  return {
    sfx: sfx, music: music, tempo: tempo, toggle: toggle, setMuted: setMuted, setVolume: setVolume, volume: function () { return VOL; },
    ambience: ambience, jingle: jingle, radio: function () { return !!radio; },
    isMuted: function () { return muted; }, isReady: ready, supported: !!AC, unlock: onGesture,
    nowPlaying: function () { return seq ? playing : null; },
    label: function () { return muted ? 'Sound: off' : 'Sound: on'; }
  };
})();
