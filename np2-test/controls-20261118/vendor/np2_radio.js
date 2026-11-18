// NP2 radio voice. One sound for the unnamed radio in both cutscenes (the flashback and the rescue).
// It is made in the browser from noise and a buzzing tone pushed through a narrow radio band: a squelch,
// a run of voice-like syllables nobody can make out, and a click off. There are no recorded words and no
// named speaker. In the rescue the exact line is read in the speech bubble; in the flashback the words stay
// indistinct, as the plan asks.
//
// A browser only plays sound after the person has pressed or clicked something on the page. The game has
// always had that by the time a cutscene plays. If not, the sound starts on the next press, and the scene
// never waits for it.

let ctx = null;
const state = { made: 0, played: 0, last: null, audio: 'none' };
window.__np2radio = state;

function audio() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { state.audio = 'unsupported'; return null; }
    ctx = new AC();
    state.audio = ctx.state;
    const wake = () => { if (ctx && ctx.state !== 'running') ctx.resume().then(() => { state.audio = ctx.state; }).catch(() => {}); };
    addEventListener('pointerdown', wake, { passive: true });
    addEventListener('keydown', wake);
    wake();
  } catch (e) {
    state.audio = 'error';
    ctx = null;
  }
  return ctx;
}

function noiseBuffer(c, secs) {
  const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * secs)), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function crunch(c) {
  const ws = c.createWaveShaper();
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * 3.2); }
  ws.curve = curve;
  return ws;
}

// opts: syllables (how many sounds), rate (syllables a second), garble (0 to 1: more noise, less tone),
// pitch (Hz of the buzz), gain (overall loudness). Returns how long it lasts, in seconds.
export function radioVoice(opts = {}) {
  const syl = Math.max(1, opts.syllables || 8);
  const rate = opts.rate || 3.6;
  const garble = Math.min(1, Math.max(0, opts.garble == null ? 0.35 : opts.garble));
  const pitch = opts.pitch || 118;
  const gain = opts.gain == null ? 0.22 : opts.gain;
  const len = 0.28 + syl / rate + 0.22;
  state.made += 1;
  state.last = { syllables: syl, garble, secs: +len.toFixed(2) };
  const c = audio();
  if (!c) return len;
  const t0 = c.currentTime + 0.03;
  const out = c.createGain();
  out.gain.value = gain;
  out.connect(c.destination);
  // the radio band: nothing below about 500 Hz or above about 2.6 kHz gets through
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 480;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
  const sh = crunch(c);
  hp.connect(lp); lp.connect(sh); sh.connect(out);
  // squelch in, a bed of hiss under the voice, squelch and click out
  const hiss = c.createBufferSource(); hiss.buffer = noiseBuffer(c, len + 0.1);
  const hissG = c.createGain();
  hissG.gain.setValueAtTime(0.0, t0);
  hissG.gain.linearRampToValueAtTime(0.9, t0 + 0.04);
  hissG.gain.linearRampToValueAtTime(0.18 + garble * 0.35, t0 + 0.24);
  hissG.gain.setValueAtTime(0.18 + garble * 0.35, t0 + len - 0.2);
  hissG.gain.linearRampToValueAtTime(0.8, t0 + len - 0.06);
  hissG.gain.linearRampToValueAtTime(0.0, t0 + len);
  hiss.connect(hissG); hissG.connect(hp);
  hiss.start(t0); hiss.stop(t0 + len + 0.05);
  // the voice: a buzz whose pitch wanders, shaped into syllables by two moving resonances
  const osc = c.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(pitch, t0);
  const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 6;
  const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 8;
  const env = c.createGain(); env.gain.setValueAtTime(0, t0);
  osc.connect(f1); osc.connect(f2); f1.connect(env); f2.connect(env); env.connect(hp);
  const vowels = [[700, 1220], [400, 2000], [300, 870], [600, 1700], [500, 1000], [350, 2300]];
  const voiced = 1.0 - garble * 0.55;
  for (let i = 0; i < syl; i++) {
    const s = t0 + 0.26 + i / rate;
    const d = (1 / rate) * (0.62 + Math.random() * 0.25);
    const v = vowels[Math.floor(Math.random() * vowels.length)];
    f1.frequency.setValueAtTime(v[0] * (0.9 + Math.random() * 0.2), s);
    f2.frequency.setValueAtTime(v[1] * (0.9 + Math.random() * 0.2), s);
    osc.frequency.setValueAtTime(pitch * (0.88 + Math.random() * 0.3), s);
    osc.frequency.linearRampToValueAtTime(pitch * (0.8 + Math.random() * 0.2), s + d);
    env.gain.setValueAtTime(0.0, s);
    env.gain.linearRampToValueAtTime(voiced * (0.7 + Math.random() * 0.3), s + 0.03);
    env.gain.linearRampToValueAtTime(voiced * 0.35, s + d * 0.7);
    env.gain.linearRampToValueAtTime(0.0, s + d);
  }
  osc.start(t0); osc.stop(t0 + len);
  // the click when it cuts off
  const click = c.createBufferSource(); click.buffer = noiseBuffer(c, 0.02);
  const clickG = c.createGain(); clickG.gain.value = 1.2;
  click.connect(clickG); clickG.connect(out);
  click.start(t0 + len); click.stop(t0 + len + 0.02);
  state.played += 1;
  state.audio = c.state;
  return len;
}

// A short burst of static on its own (a set switching on, or a picture breaking up).
export function radioStatic(secs = 0.4, gain = 0.16) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + 0.02;
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, secs);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.7;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0); g.gain.linearRampToValueAtTime(0, t0 + secs);
  src.connect(bp); bp.connect(g); g.connect(c.destination);
  src.start(t0); src.stop(t0 + secs);
}
