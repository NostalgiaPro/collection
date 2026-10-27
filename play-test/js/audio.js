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
  var MASTER = 0.9;

  function ensure() {
    if (!AC) return null;
    if (!ctx) {
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain(); master.gain.value = muted ? 0 : MASTER; master.connect(ctx.destination);
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
    startMusic();
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
    sparkle: function (t) { for (var i = 0; i < 5; i++) tone(2600 + i * 400, t + i * 0.04, 0.06, 'sine', 0.06); }
  };
  function sfx(name) {
    if (muted || !ready() || !FX[name]) return;
    try { FX[name](ctx.currentTime + 0.01); } catch (e) {}
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
    seq = { tr: tr, step: 0, next: ctx.currentTime + 0.08, dur: 60 / tr.bpm / 4, id: setInterval(pump, 30) };
    pump();
  }
  function music(name) {
    wanted = name || null;
    if (wanted !== playing) { stopSeq(); playing = null; startMusic(); }
  }

  // ---------- mute ----------
  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) {}
    if (master && ctx) { try { master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.02); } catch (e) { master.gain.value = muted ? 0 : MASTER; } }
    if (muted) { stopSeq(); playing = null; if (silentEl) silentEl.pause(); } else { silentLoop(); startMusic(); }
    var label = muted ? 'Sound: off' : 'Sound: on';
    document.querySelectorAll('[data-act="mute"]').forEach(function (b) { b.textContent = label; b.setAttribute('aria-pressed', muted ? 'true' : 'false'); });
  }
  function toggle() { setMuted(!muted); if (muted && NP.track) NP.track('muted'); return muted; }

  // a soft blip on every button press (the specific sounds layer on top)
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('button, a.ibtn, a.cart-item');
    if (!el || el.disabled || el.getAttribute('data-act') === 'mute') return;
    sfx('blip');
  }, true);

  return {
    sfx: sfx, music: music, toggle: toggle, setMuted: setMuted,
    isMuted: function () { return muted; }, isReady: ready, supported: !!AC, unlock: onGesture,
    nowPlaying: function () { return seq ? playing : null; },
    label: function () { return muted ? 'Sound: off' : 'Sound: on'; }
  };
})();
