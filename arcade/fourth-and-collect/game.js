/* FOURTH AND COLLECT (3D): split the uprights from farther and farther back. Watch the wind flag.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of input, scaling and the title / pause / game over flow, and carries the HUD.

   The rules, the ball flight, the wind, the scoring, the controls and the trophies are the 2D game's,
   unchanged: the same code steps every kick and decides every result. Only the picture is new.
   Units are yards and seconds. x runs across the field, y downfield from the ball, z up.
   In three.js space that is (x, z, -y). The goal posts, the end zone and the stands behind them are
   one group laid out from the posts (yP = yards past the posts), and the whole stadium slides back
   five yards after every make. The people are drawn life size. */

const W = 360, H = 540, TAU = Math.PI * 2, DEG = Math.PI / 180;
const G = 10.7, ELEV = 40 * Math.PI / 180, CROSSBAR = 3.33, POST_TOP = 13.3, BALL_R = 0.15;
const START_D = 20, STEP_D = 5, STRIKES = 3;
const P_MAX = 1.2;

/* ---------------- Stadium (yards) ---------------- */
const FIELD_HALF = 26.67, HASH_X = 3.083, EZ = 10;          // half the field's width, the hash marks, end zone depth
const WALL_Y = 10.5, WALL_H = 1.4;                          // the padded wall past the end line
const LED_Y = 11.1, LED_Z0 = 1.72;                          // the ribbon board on the facade above it
const STAND_Y = 11.6, STAND_Z = 5.0, ROWS = 9, TREAD = 1.5, RISE = 0.9, STAND_X = 40;
const BOARD = { y: 29, z0: 15.6, z1: 24.6, half: 13 };      // the scoreboard over the stands
const TEE_TOP = 0.125, BALL_TEE_Z = 0.28;                   // the kicking tee, and the ball's center sitting on it
const KICK_ROOT = { x: -0.35, y: -0.9 };                    // where the kicker's feet are measured from, beside the ball
const CAM_K = 4.8, CAM_RISE = 0.28;                         // camera distance x tan(half fov) keeps the kicker one size while the lens zooms; height per yard back

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash, title card and score card
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every decal inside the stadium
const THREE_URL = "../shared/three.module.min.js";
const FALLBACK_URL = "game-2d.js";                        // optional: the classic 2D game, used if 3D cannot start
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';
const CONF_COLS = ["#9bff3f", "#ffd23f", "#3ff0ff", "#ff3fa4", "#ff9214", "#ffffff"];

let S = {}, keys = {}, idleT = 0, parts = [];
let THREE = null, R = null, TV = null;                    // R holds everything the renderer owns
// V is how things are being shown (the stadium sliding back, poses, the crowd). It never feeds the rules.
const V = { D: START_D, kick: -1, plant: 0, ready: 1, cheer: 0, ref: "", refT: 0, trail: [], lastTotal: 0, spin: 0, snap: true, hintT: 0 };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
// The picture rolls its own dice (sparkle, crowd colors), so the rules see exactly the random numbers the 2D game would.
const vrand = (function () { let s = 0x2545F491; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; })();

/* ---------------- Rules (the 2D game's, untouched) ---------------- */
function speedOf(p) { return 13 + clamp(p, 0, P_MAX) * 17; }
function halfWidth(D) { return D <= 50 ? 3.08 : Math.max(2.4, 3.08 - (D - 50) * 0.025); }

function reset() {
  S = { t: 0, phase: "aim", pt: 0, D: START_D, makes: 0, strikes: 0, total: 0, longest: 0, attempts: 0,
        aim: 0, power: 0, charging: false, chargeT: 0, drag: null, kb: false, ball: null, result: null, legT: -1 };
  parts.length = 0;
  newWind();
  V.D = START_D; V.kick = -1; V.plant = 0; V.cheer = 0; V.ref = ""; V.trail.length = 0; V.lastTotal = 0; V.snap = true;
  ledClear();
}

function newWind() {
  const lvl = S.makes;
  const max = Math.min(4 + lvl * 2.2, 24);
  const sign = Math.random() < 0.5 ? -1 : 1;
  S.wind = { base: sign * max * (0.35 + Math.random() * 0.65), gust: Math.min(lvl * 0.7, 7), ph: Math.random() * TAU };
}
function windAt(t) {
  const w = S.wind;
  return w.base + w.gust * Math.sin(t * 1.6 + w.ph) + w.gust * 0.45 * Math.sin(t * 3.7 + w.ph * 2);
}

// Power needed to just clear the bar with no wind (for the meter marker)
function neededPower(D) {
  for (let p = 0; p <= P_MAX; p += 0.01) {
    const v = speedOf(p), vy = v * Math.cos(ELEV), vz = v * Math.sin(ELEV), t = D / vy;
    if (vz * t - 0.5 * G * t * t > CROSSBAR + 0.3) return p;
  }
  return P_MAX;
}

/* ---------------- Kicking ---------------- */
function canKick() { return S.phase === "aim" && S.pt > 0.2; }

function kick(p, phi) {
  if (!canKick() || p < 0.05) return;
  p = clamp(p, 0, P_MAX);
  const v = speedOf(p);
  phi = clamp(phi, -0.25, 0.25);
  const hook = p > 1 ? (p - 1) * 16 * (phi >= 0 ? 1 : -1) : 0;   // overkicked: it hooks off line
  S.ball = { x: 0, y: 0, z: BALL_R, vx: v * Math.cos(ELEV) * Math.sin(phi), vy: v * Math.cos(ELEV) * Math.cos(phi), vz: v * Math.sin(ELEV),
             hook: hook, spin: 0, crossed: false, done: false, t: 0 };
  S.overkick = p > 1;
  S.attempts++;
  S.phase = "flight"; S.pt = 0; S.legT = 0;
  S.drag = null; S.charging = false;
  Shell.sfx("hit"); Shell.sfx("whoosh");
  // presentation only
  V.kick = 0; V.trail.length = 0; V.D = S.D;
  Juke.sfx("thump", S.overkick ? 1 : 0);
  if (S.overkick) camShake(0.25, 0.2);
}

function stepBall(b, dt) {
  const py = b.y, px = b.x, pz = b.z;
  b.vx += (windAt(S.t) * 0.1 + b.hook) * dt;
  b.vz -= G * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  b.spin += dt * 9;
  b.t += dt;
  const D = S.D, hw = halfWidth(D);
  if (!b.crossed && py < D && b.y >= D) {
    b.crossed = true;
    const k = (D - py) / (b.y - py), cx = px + (b.x - px) * k, cz = pz + (b.z - pz) * k;
    const ax = Math.abs(cx);
    if (cz < 0.2) { decide("SHORT", false); return; }
    // the posts
    if (Math.abs(ax - hw) < 0.22 && cz > CROSSBAR - 0.1 && cz < POST_TOP) {
      Shell.sfx("ding");
      const inside = ax < hw;
      b.vy = -Math.abs(b.vy) * 0.25; b.vx = (inside ? -1 : 1) * Math.sign(cx || 1) * 3;
      b.y = D - 0.05;
      decide(inside ? "DOINK IN" : "DOINK OUT", inside);
      return;
    }
    // the crossbar
    if (ax < hw && Math.abs(cz - CROSSBAR) < 0.22) {
      Shell.sfx("ding");
      const over = cz > CROSSBAR;
      if (over) { b.vz = Math.abs(b.vz) * 0.4 + 1; b.vy *= 0.3; }
      else { b.vy = -Math.abs(b.vy) * 0.3; b.y = D - 0.05; }
      decide(over ? "BAR OVER" : "BAR UNDER", over);
      return;
    }
    if (ax < hw && cz > CROSSBAR) { decide("GOOD", true); return; }
    if (ax >= hw) { decide(cx < 0 ? "WIDE LEFT" : "WIDE RIGHT", false); return; }
    decide("UNDER", false);
  }
  if (b.z <= BALL_R) {
    b.z = BALL_R;
    if (!b.crossed) { b.crossed = true; decide("SHORT", false); }
    b.vz = Math.abs(b.vz) * 0.3; b.vx *= 0.6; b.vy *= 0.5;
  }
}

function decide(kind, good) {
  S.result = { kind: kind, good: good, D: S.D };
}

/* ---------------- Flow ---------------- */
function update(dt) {
  S.t += dt; S.pt += dt;
  let i;
  for (i = parts.length - 1; i >= 0; i--) {
    const q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 160 * dt; q.rot += q.vr * dt;
    if (q.life <= 0) parts.splice(i, 1);
  }
  if (S.legT >= 0) { S.legT += dt; if (S.legT > 0.35) S.legT = -1; }

  if (S.phase === "aim") {
    const turn = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
    if (turn) { S.aim = clamp(S.aim + turn * 0.22 * dt, -0.25, 0.25); S.kb = true; }
    if (S.charging) {
      S.chargeT += dt;
      const ph = (S.chargeT / 1.0) % 2;
      S.power = (ph < 1 ? ph : 2 - ph) * P_MAX;
    }
    return;
  }
  if (S.phase === "flight") {
    const b = S.ball;
    for (i = 0; i < 6; i++) stepBall(b, dt / 6);
    if (S.result && !S.shown) {
      S.shown = true; S.after = 0;
      announce();
    }
    if (S.shown) S.after += dt;
    if ((S.shown && S.after > 1.15) || S.pt > 6) next();
  }
}

function announce() {
  const r = S.result;
  let title, sub = "", col;
  const board = [];
  if (r.good) {
    S.makes++; S.total += r.D; S.longest = Math.max(S.longest, r.D);
    S.row = (S.row || 0) + 1;
    if (window.NPRewards && S.row >= 2) NPRewards.streak(S.row);
    title = r.kind === "GOOD" ? "IT'S GOOD!" : "DOINK... GOOD!";
    sub = r.D >= 50 ? "Mint condition. " + r.D + " yards." : r.D + " yards. Back 5.";
    col = "#9bff3f";
    Shell.sfx("crowd"); Shell.sfx("score");
    if (r.D >= 50) { burst(50); Shell.sfx("best"); Shell.shake(3, 0.3); camShake(0.5, 0.3); } else burst(18);
    if (window.Trophies) {
      Trophies.unlock("fac-good");
      if (r.kind !== "GOOD") Trophies.unlock("fac-doink");
      if (r.D >= 50) Trophies.unlock("fac-50");
      if (r.D >= 50 && S.strikes === 0) Trophies.unlock("fac-clean50");
      if (r.D >= 60) Trophies.unlock("fac-60");
      if (r.D >= 70) Trophies.unlock("fac-70");
    }
    // presentation only: the board, the refs, the crowd, the band
    board.push(ledMsg("flash", r.kind === "GOOD" ? "IT'S GOOD!" : "DOINK! GOOD!", 1.6),
               ledMsg("count", "", 1.3, { from: 0, value: r.D, suffix: " YDS" }));
    if (r.D >= 50) board.push(ledMsg("cycle", "MINT CONDITION", 1.8, { keep: true }));
    board.push(ledMsg("count", "TOTAL", 2.2, { from: V.lastTotal, value: S.total, suffix: " YDS", keep: true }));
    V.lastTotal = S.total;
    V.ref = "good"; V.refT = 0;
    Juke.sfx(r.kind === "GOOD" ? "good" : "doinkgood", r.D >= 50 ? 1 : 0);
    Juke.sfx("roar");
    if (r.D >= 50) Juke.sfx("fifty", 0, 0.55);
  } else {
    S.strikes++; S.row = 0;
    col = "#ff4b3e";
    if (r.kind === "SHORT") { title = "SHORT"; sub = "Needs more leg."; }
    else if (r.kind === "UNDER" || r.kind === "BAR UNDER") { title = r.kind === "BAR UNDER" ? "DOINK!" : "NO GOOD"; sub = "Under the crossbar."; }
    else if (r.kind === "DOINK OUT") { title = "DOINK!"; sub = "Off the upright and out."; }
    else {
      title = r.kind; sub = S.overkick ? "Overkicked it. It hooked." : "Check the wind flag.";
      if (S.overkick && window.Trophies) Trophies.unlock("fac-hook");
    }
    sub += "  Strike " + S.strikes + " of " + STRIKES + ".";
    Shell.sfx("miss");
    board.push(ledMsg("blink", title === "NO GOOD" ? "NO GOOD" : title, 1.6, { color: r.kind.indexOf("DOINK") >= 0 || r.kind.indexOf("BAR") >= 0 ? "orange" : "red" }),
               ledMsg("slide", "STRIKE " + S.strikes + " OF " + STRIKES, 1.6, { color: S.strikes >= STRIKES ? "red" : "pink", keep: true }));
    V.ref = "nogood"; V.refT = 0;
    Juke.sfx(r.kind.indexOf("DOINK") >= 0 || r.kind.indexOf("BAR") >= 0 ? "doink" : "nogood");
  }
  Shell.flash(title, sub, col, 1100);
  ledPlay(board);
  Juke.sfx("whistle", 0, 0.25);
}

function next() {
  const good = S.result && S.result.good;
  S.ball = null; S.result = null; S.shown = false;
  if (S.strikes >= STRIKES) {
    ledFinal(S.total);
    Shell.gameOver(S.total, { title: "THREE STRIKES", html:
      row("Kicks made", S.makes + " of " + S.attempts) +
      row("Longest kick", S.longest ? S.longest + " YDS" : "None") +
      row("Last attempt from", S.D + " YDS"),
      stats: { total: S.total, makes: S.makes, attempts: S.attempts, longest: S.longest, strikes: S.strikes, lastD: S.D } });
    return;
  }
  if (good) S.D += STEP_D;
  newWind();
  S.phase = "aim"; S.pt = 0;
  if (good && S.D === 55) {
    Shell.flash("UPRIGHTS NARROW", "Past 50 they start closing in.", "#ffd23f", 1300);
    ledPlay([ledMsg("slide", "UPRIGHTS NARROW", 2.2, { color: "yellow", keep: true })], true);
    Juke.sfx("narrow");
  }
  V.ref = ""; V.trail.length = 0;
}
function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

// Confetti from the crossbar, drawn on the HUD layer where the posts are on screen.
function burst(n) {
  if (Shell.reduced) n = Math.ceil(n / 3);
  const p = R ? toScreen(0, S.D, POST_TOP * 0.6) : { x: W / 2, y: 160 };
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 40 + Math.random() * 120;
    parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 1.1, c: CONF_COLS[i % CONF_COLS.length],
                 rot: vrand() * TAU, vr: (vrand() - 0.5) * 14 });
  }
}

/* ---------------- Input (the 2D game's, untouched) ---------------- */
function pointer(type, x, y) {
  if (type === "down") {
    if (!canKick()) return;
    S.drag = { sx: x, sy: y, x: x, y: y };
    S.kb = false; S.charging = false;
  } else if (type === "move" && S.drag) {
    S.drag.x = x; S.drag.y = y;
  } else if ((type === "up" || type === "cancel") && S.drag) {
    const d = S.drag; S.drag = null;
    if (type === "cancel") return;
    const s = swipe(d);
    if (s) kick(s.p, s.a);
  }
}
function swipe(d) {
  const dy = d.sy - d.y, dx = d.x - d.sx;
  if (dy < 16) return null;
  return { p: clamp(dy / 220, 0, P_MAX), a: clamp(Math.atan2(dx, dy) * 0.35, -0.25, 0.25) };
}
function key(type, code, e) {
  const act = code === "Space" || code === "Enter" || code === "NumpadEnter";
  if (type === "down") {
    keys[code] = true;
    if (act && !e.repeat && canKick() && !S.charging) { S.charging = true; S.chargeT = 0; S.power = 0; S.kb = true; S.drag = null; }
  } else {
    keys[code] = false;
    if (act && S.charging) { S.charging = false; kick(S.power, S.aim); S.power = 0; }
  }
}

/* ---------------- Music: one self-contained function ----------------
   startMusic(ctx, dest) plays an original, code-generated sixteen-bar loop in D major (a brassy two-saw lead with a
   stadium echo, square bass, a triangle arpeggio, claps, hats, kick, and stab chords in the back half) on the
   AudioContext it is given, into the node it is given, and keeps looping until the function it returns is called.
   It reads nothing from the game: no state, no settings, no other code in this file. The game only decides when
   to call it and when to stop it. */
function startMusic(ctx, dest) {
  const BPM = 132, STEP = 60 / BPM / 4, SONG_STEPS = 256;  // sixteen bars of sixteenth notes, about half a minute
  const AHEAD = 0.6, TICK = 90;                            // seconds kept queued, and how often (ms) the queue is topped up
  // bass note, then the three notes the arpeggio walks (MIDI numbers)
  const CHORDS = { D: [38, 62, 66, 69], Bm: [35, 59, 62, 66], G: [43, 59, 62, 67], A: [45, 61, 64, 69], Em: [40, 59, 64, 67] };
  // one chord per half bar
  const PROG = ("D D Bm Bm G G A A D D Bm Bm G A D D " +
                "G G D D Em Em A A G G D Bm Em A A A").split(" ");
  // the tune, a bar a line: step in the bar, note (sharps written C#), length in steps
  const LEAD_BARS = [
    "0D5-2 2F#5-2 4A5-3 7F#5-1 8A5-2 10B5-2 12A5-4",
    "0F#5-2 2D5-2 4B4-3 7D5-1 8F#5-4 12D5-2 14F#5-2",
    "0G5-2 2B5-2 4D6-3 7B5-1 8A5-2 10G5-2 12F#5-2 14G5-2",
    "0A5-3 3E5-1 4A5-2 6C#6-2 8E6-4 12C#6-2 14A5-2",
    "0D6-2 2C#6-1 3B5-1 4A5-2 6F#5-2 8A5-3 11D5-1 12F#5-4",
    "0B5-3 3A5-1 4F#5-2 6D5-2 8E5-2 10F#5-2 12B4-4",
    "0G5-2 2B5-2 4D6-2 6B5-2 8A5-2 10C#6-2 12E6-2 14C#6-2",
    "0D6-6 6A5-2 8F#5-2 10A5-2 12D5-4",
    "0B5-4 4D6-4 8B5-2 10G5-2 12D5-4",
    "0A5-4 4F#5-4 8A5-2 10D6-2 12A5-4",
    "0G5-2 2B5-2 4E6-4 8D6-2 10B5-2 12G5-4",
    "0E5-2 2A5-2 4C#6-2 6E6-2 8C#6-2 10A5-2 12E5-4",
    "0D6-2 2B5-2 4G5-4 8A5-2 10B5-2 12D6-4",
    "0F#6-3 3E6-1 4D6-2 6A5-2 8B5-2 10D6-2 12F#5-4",
    "0G5-2 2B5-2 4E6-2 6G5-2 8A5-2 10C#6-2 12E6-4",
    "0E6-2 2C#6-2 4A5-2 6G5-2 8E5-2 10G5-2 12A5-2 14C#6-2"
  ];
  const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }, LEAD = new Array(SONG_STEPS).fill(null);
  LEAD_BARS.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(#?)(\d)-(\d+)$/.exec(tok);
      if (m) LEAD[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + semis[m[2]] + (m[3] ? 1 : 0), Number(m[5])];
    });
  });
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // the band's own little mixer: everything runs into "bus", which fades in now and out on stop
  const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(dest);
  function filter(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const lead = filter("lowpass", 2600, 1.1, bus), bass = filter("lowpass", 760, 1.4, bus);
  const send = ctx.createGain(), echo = ctx.createDelay(1), back = ctx.createGain(), damp = filter("lowpass", 2000, 0.7, bus);
  send.gain.value = 0.26; echo.delayTime.value = STEP * 3; back.gain.value = 0.3;   // a dotted-eighth echo, stadium size
  lead.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(damp);
  let seed = 0x1F2E3D4C;                                   // its own dice for the noise, so it never touches anyone else's
  function rand() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
  const len = Math.floor(ctx.sampleRate), noise = ctx.createBuffer(1, len, ctx.sampleRate), nd = noise.getChannelData(0);
  for (let i = 0; i < len; i++) nd[i] = rand() * 2 - 1;

  function note(to, type, f0, t, dur, vol, f1, hold, detune) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.55 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (detune) o.detune.value = detune;
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.03);
  }
  function hit(t, dur, vol, type, f0, q) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true; f.type = type; f.frequency.value = f0; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, rand() * 0.8); s.stop(t + dur + 0.05);
  }
  // everything that sounds on sixteenth note i of the loop, at time t
  function play(i, t) {
    const bar = i >> 4, s = i & 15, ch = CHORDS[PROG[i >> 3]], second = bar >= 8, n = LEAD[i];
    if (n) {                                               // two saws a few cents apart: a little horn section
      note(lead, "sawtooth", hz(n[0]), t, n[1] * STEP * 0.92, 0.1, 0, 0.6, -7);
      note(lead, "sawtooth", hz(n[0]), t, n[1] * STEP * 0.92, 0.1, 0, 0.6, 7);
    }
    if (!(s & 1)) {                                        // eighth notes: driving bass, a walking arpeggio, hats
      const k = s >> 1;
      note(bass, "square", hz(ch[0] + (k & 1 ? 12 : 0)), t, STEP * 1.6, 0.22);
      note(bus, "triangle", hz(ch[1 + [0, 1, 2, 1][k & 3]] + 12), t, STEP * 1.4, 0.075);
      hit(t, s % 4 === 2 ? 0.09 : 0.035, s % 4 === 2 ? 0.1 : 0.05, "highpass", 7600, 0.7);
    }
    if (second && (s === 6 || s === 14)) for (let k = 1; k < 4; k++) note(lead, "square", hz(ch[k]), t, STEP * 1.2, 0.045, 0, 0.3);   // stabs
    const fill = bar === 7 ? s >= 12 : bar === 15 ? s >= 8 && (s % 2 === 0 || s >= 12) : false;
    if (fill || s === 4 || s === 12) {                     // claps on the backbeat, rolls into bars 8 and 16
      const v = fill ? 0.55 + 0.45 * (s - 8) / 7 : 1;
      hit(t, 0.11, 0.3 * v, "bandpass", 1500, 0.8); hit(t + 0.012, 0.09, 0.22 * v, "bandpass", 2300, 0.9);
    }
    if (second ? s % 4 === 0 : s === 0 || s === 6 || s === 8) note(bus, "sine", 140, t, 0.18, 0.66, 40, 0.08);   // kick
  }

  let step = 0, nextT = ctx.currentTime + 0.06, stopped = false;
  bus.gain.setTargetAtTime(1, nextT - 0.04, 0.012);
  function feed() {
    if (stopped) return;
    const now = ctx.currentTime;
    if (nextT < now) nextT = now + 0.03;                   // only after a stall longer than the queue
    while (nextT < now + AHEAD) { play(step, nextT); step = (step + 1) % SONG_STEPS; nextT += STEP; }
  }
  feed();
  const timer = setInterval(feed, TICK);
  return function stop() {
    if (stopped) return;
    stopped = true; clearInterval(timer);
    const now = ctx.currentTime;                           // whatever is already queued dies under a quick fade
    bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(bus.gain.value, now); bus.gain.setTargetAtTime(0, now, 0.05);
    setTimeout(function () { try { bus.disconnect(); } catch (e) { /* already gone */ } }, 600);
  };
}

/* ---------------- Sound: the stingers, the music switch and the mute ----------------
   The shell still plays every sound effect the 2D game had, exactly when it did. On top of that the game brings a
   few stingers of its own for the big moments (the boot, the good, the doink, the referee's whistle), made in code
   with the Web Audio API, no audio files. No AudioContext exists until the first tap, click or key press. The shell's
   mute button ("npArcade.muted", remembered by the shell) silences all of it; the music button and the N key turn the
   band on and off ("npArcade.music", remembered here). The band plays while a game is on and stops when it isn't. */
const MUSIC_VOL = 0.16, SFX_VOL = 0.2;                     // turn the band or the stingers up and down here
const MUSIC_KEY = "npArcade.music";
function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

const Juke = (function () {
  let live = null, dead = false, muted = false, stopBand = null, startAt = 0, fresh = true, timer = 0;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  const buttons = [];

  // Everything between the sounds and the speaker.
  function rig(c) {
    const A = { c: c };
    A.out = c.createGain();                                 // follows the mute button
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    A.out.connect(comp); comp.connect(c.destination);
    A.music = c.createGain(); A.music.gain.value = MUSIC_VOL; // where startMusic plays into
    A.duck = c.createGain();                                // the band steps back for a second when the crowd goes up
    A.music.connect(A.duck); A.duck.connect(A.out);
    A.sfx = c.createGain(); A.sfx.gain.value = SFX_VOL; A.sfx.connect(A.out);
    const len = Math.floor(c.sampleRate * 2);
    A.noise = c.createBuffer(1, len, c.sampleRate);
    const d = A.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = vrand() * 2 - 1;
    return A;
  }
  // One note: a quick attack, held for part of its length, then it dies away. f1 slides the pitch.
  function osc(A, dest, type, f0, t, dur, vol, f1, hold) {
    const o = A.c.createOscillator(), g = A.c.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.55 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.03);
  }
  // A burst of filtered noise: the crowd, the boot on leather.
  function hiss(A, dest, t, dur, vol, type, f0, q, f1, atk) {
    const s = A.c.createBufferSource(), f = A.c.createBiquadFilter(), g = A.c.createGain();
    s.buffer = A.noise; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, vrand() * 1.5); s.stop(t + dur + 0.05);
  }
  function duck(A, t, secs) {
    A.duck.gain.cancelScheduledValues(t);
    A.duck.gain.setTargetAtTime(0.45, t, 0.03);
    A.duck.gain.setTargetAtTime(1, t + secs, 0.25);
  }
  // The stingers. x is a detail of the moment (an overkick, a 50 yarder).
  function cue(A, name, t, x) {
    const d = A.sfx;
    if (name === "thump") {                                 // the boot through the ball
      osc(A, d, "sine", 150, t, 0.13, 1.0, 48, 0.05);
      hiss(A, d, t, 0.05, 0.5, "bandpass", 900, 1.2);
      if (x) osc(A, d, "sawtooth", 220, t + 0.02, 0.25, 0.12, 110, 0.4);   // an overkick has an ugly edge to it
    } else if (name === "good") {                           // a fanfare up the chord and a held one on top
      const up = x ? [74, 78, 81, 86, 90, 93] : [74, 78, 81, 86], te = t + up.length * 0.07;
      up.forEach(function (m, i) { osc(A, d, "square", mtof(m), t + i * 0.07, 0.12, 0.24, 0, 0.5); });
      [86, 90, 93].forEach(function (m) { osc(A, d, "sawtooth", mtof(m), te, 0.6, 0.1, 0, 0.35); osc(A, d, "triangle", mtof(m), te, 0.6, 0.12, 0, 0.35); });
      duck(A, t, 1.4);
    } else if (name === "doinkgood") {                      // off the iron and in
      cue(A, "doink", t, 0); cue(A, "good", t + 0.22, x);
    } else if (name === "doink") {                          // ball on steel: a clang with a long ring
      [1, 2.76, 5.4, 8.93].forEach(function (k, i) { osc(A, d, "sine", 523 * k, t, 1.1 - i * 0.2, 0.32 / (i + 1), 0, 0.02); });
      hiss(A, d, t, 0.05, 0.45, "highpass", 4000, 0.7);
    } else if (name === "nogood") {                         // a sad slide down
      osc(A, d, "triangle", 330, t, 0.22, 0.34, 247, 0.6); osc(A, d, "triangle", 247, t + 0.22, 0.42, 0.34, 165, 0.5);
    } else if (name === "roar") {                           // the stands: a swell, some hiss on top, hands clapping
      hiss(A, d, t, 2.4, 1.1, "bandpass", 1000, 0.45, 1500, 0.3);
      hiss(A, d, t + 0.1, 2.0, 0.45, "highpass", 3200, 0.6, 0, 0.35);
      for (let i = 0; i < 26; i++) hiss(A, d, t + 0.15 + vrand() * 1.5, 0.03, 0.3 + vrand() * 0.25, "bandpass", 1800 + vrand() * 2200, 2.5);
    } else if (name === "fifty") {                          // 50 and beyond: a jackpot trill and a bell
      for (let i = 0; i < 8; i++) osc(A, d, "square", mtof(i % 2 ? 93 : 90), t + i * 0.05, 0.05, 0.2, 0, 0.6);
      osc(A, d, "square", 2349, t + 0.4, 0.5, 0.2, 0, 0.3); osc(A, d, "sine", 3520, t + 0.4, 0.6, 0.14, 0, 0.2);
    } else if (name === "whistle") {                        // the referee: two tones and a pea rattling between them
      const o1 = A.c.createOscillator(), o2 = A.c.createOscillator(), lfo = A.c.createOscillator(), lg = A.c.createGain(), g = A.c.createGain();
      o1.type = "sine"; o2.type = "sine"; o1.frequency.value = 2650; o2.frequency.value = 2950;
      lfo.frequency.value = 34; lg.gain.value = 0.5; lfo.connect(lg); lg.connect(g.gain);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.02); g.gain.setValueAtTime(0.09, t + 0.32); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      o1.connect(g); o2.connect(g); g.connect(d);
      [o1, o2, lfo].forEach(function (o) { o.start(t); o.stop(t + 0.45); });
    } else if (name === "narrow") {                         // the uprights close in: a two-tone alert
      for (let i = 0; i < 4; i++) osc(A, d, "square", i % 2 ? 660 : 880, t + i * 0.13, 0.12, 0.16, 0, 0.8);
    }
  }

  function shellMuted() {
    const b = document.getElementById("np-mute");
    if (b) return b.getAttribute("aria-pressed") === "true";
    try { return localStorage.getItem("npArcade.muted") === "1"; } catch (e) { return false; }
  }
  // Browsers only let sound start from a tap, a click or a key press, so this is called from those and nowhere else.
  function unlock() {
    if (dead) return;
    try {
      if (!live) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        live = rig(new AC());
        muted = shellMuted();
        live.out.gain.value = muted ? 0 : 1;
        if (!timer) timer = setInterval(pump, 150);         // follows the mute and the game even if frames stall
      }
      if (live.c.state !== "running") { const p = live.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { live = null; dead = true; }
  }
  // Called every frame: follow the mute button, and start or stop the band with the game.
  function pump() {
    const A = live;
    if (!A || !window.Shell) return;
    const c = A.c, now = c.currentTime, m = shellMuted();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, now, 0.02); }
    const want = musicOn && !muted && c.state === "running" && Shell.state() === "playing";
    if (want && !stopBand) {
      if (!startAt) startAt = now + (fresh ? 0.42 : 0.05);   // a fresh game lets the shell's start jingle go first
      if (now >= startAt) { stopBand = startMusic(c, A.music); startAt = 0; fresh = false; }
    } else if (!want) {
      startAt = 0;
      if (stopBand) { stopBand(); stopBand = null; }
    }
  }
  function sfx(name, x, delay) {
    const A = live;
    if (!A || muted || A.c.state !== "running") return;
    try { cue(A, name, A.c.currentTime + 0.01 + (delay || 0), x); } catch (e) { /* sound is never worth a crash */ }
  }
  function label() {
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].textContent = musicOn ? "MUSIC: ON" : "MUSIC: OFF";
      buttons[i].setAttribute("aria-pressed", musicOn ? "true" : "false");
    }
  }
  function setMusic(on) {
    musicOn = !!on;
    try { localStorage.setItem(MUSIC_KEY, musicOn ? "1" : "0"); } catch (e) { /* private mode */ }
    label(); pump();
  }
  // A "MUSIC: ON / OFF" button in the shell's own button style, for the title card and the pause card.
  function button(parent, before) {
    if (!parent) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-btn"; b.setAttribute("data-np-music", "");
    b.style.cssText = "width:100%;margin-top:8px";
    b.addEventListener("click", function (e) { e.stopPropagation(); unlock(); setMusic(!musicOn); });   // never a "tap to start"
    parent.insertBefore(b, before || null);
    buttons.push(b); label();
  }
  return {
    unlock: unlock, pump: pump, sfx: sfx, button: button,
    // a new game starts the song from the top
    newGame: function () { unlock(); if (stopBand) { stopBand(); stopBand = null; } startAt = 0; fresh = true; pump(); },
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    // for checks: what the engine is doing right now
    peek: function () { return { made: !!live, state: live ? live.c.state : "none", going: !!stopBand, muted: muted, musicOn: musicOn }; },
    cue: cue
  };
})();

/* =====================================================================================
   3D presentation
   ===================================================================================== */

/* ---------------- Small helpers ---------------- */
function rng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mkCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function rrectPath(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// Draw the wordmark as large as fits inside a box, centered.
function drawScript(g, script, cx, cy, maxW, maxH) {
  let w = maxW, h = w * script.height / script.width;
  if (h > maxH) { h = maxH; w = h * script.width / script.height; }
  g.drawImage(script, cx - w / 2, cy - h / 2, w, h);
}
function speckle(g, w, h, n, rnd, light, dark) {
  for (let i = 0; i < n; i++) { g.fillStyle = rnd() < 0.5 ? light : dark; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
}

/* ---------------- Painted textures (all drawn here, no image files besides the wordmark) ---------------- */

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every decal inside the stadium uses this
// (the full logo with the mascot is kept for the splash, the title card and the score card). If the PNG is
// missing, plain lettering stands in.
function scriptCanvas(img) {
  if (img && img.naturalWidth > 0) {
    const k = Math.min(1, 1024 / img.naturalWidth);
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = mkCanvas(w, h), g = c.getContext("2d");
    g.drawImage(img, 0, 0, w, h);
    try {                                                    // crop any transparent margin so sizes below mean the ink itself
      const d = g.getImageData(0, 0, w, h).data;
      let x0 = w, x1 = -1, y0 = h, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 > x0 && y1 > y0 && (x0 > 0 || y0 > 0 || x1 < w - 1 || y1 < h - 1)) {
        const t = mkCanvas(x1 - x0 + 1, y1 - y0 + 1);
        t.getContext("2d").drawImage(c, x0, y0, t.width, t.height, 0, 0, t.width, t.height);
        return t;
      }
    } catch (e) { /* keep the untrimmed image */ }
    return c;
  }
  const c = mkCanvas(900, 300), g = c.getContext("2d");
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.font = 'italic 900 150px Georgia, "Times New Roman", serif';
  g.lineWidth = 30; g.strokeStyle = "#b3202a"; g.strokeText("Nostalgia Pro", 450, 118);
  g.lineWidth = 20; g.strokeStyle = "#12224f"; g.strokeText("Nostalgia Pro", 450, 118);
  g.fillStyle = "#f6e8c8"; g.fillText("Nostalgia Pro", 450, 118);
  g.font = "900 54px " + HUD_FONT;
  g.lineWidth = 10; g.strokeStyle = "#f6e8c8"; g.strokeText("GAMES", 450, 250);
  g.fillStyle = "#12224f"; g.fillText("GAMES", 450, 250);
  return c;
}

function candyText(g, str, x, y, size, maxW) {
  const face = '"Arial Black", "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
  g.font = "900 " + size + "px " + face;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + face; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = size * 0.36; g.strokeStyle = "#08205f"; g.strokeText(str, x, y + size * 0.06);
  g.lineWidth = size * 0.17; g.strokeStyle = "#ffffff"; g.strokeText(str, x, y);
  const gr = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  gr.addColorStop(0, "#fff06a"); gr.addColorStop(0.55, "#ffc21a"); gr.addColorStop(1, "#ff7a0f");
  g.fillStyle = gr; g.fillText(str, x, y);
  g.fillStyle = "rgba(255,255,255,.45)";
  g.save(); g.beginPath(); g.rect(x - 600, y - size * 0.5, 1200, size * 0.36); g.clip(); g.fillText(str, x, y); g.restore();
}

// Turf, mown in five-yard bands that change at every yard line. One tile is 10 x 10 yards.
function turfCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(3);
  g.fillStyle = "#24a147"; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#2fb756"; g.fillRect(0, 0, 256, 128);
  speckle(g, 256, 256, 7000, rnd, "rgba(255,255,255,.045)", "rgba(0,50,15,.07)");
  for (let i = 0; i < 900; i++) { g.fillStyle = "rgba(0,60,20,.06)"; g.fillRect(rnd() * 256, rnd() * 256, 1, 4 + rnd() * 6); }   // blades, along the field
  return c;
}

// The end zone, from end line (top) to goal line (bottom), 53.3 x 10 yards. Lettering is drawn tall so it reads from the tee.
function endZoneCanvas(script) {
  const c = mkCanvas(2048, 384), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 384);
  bg.addColorStop(0, "#1b56cf"); bg.addColorStop(1, "#123a9e");
  g.fillStyle = bg; g.fillRect(0, 0, 2048, 384);
  g.save(); g.globalAlpha = 0.13; g.fillStyle = "#ffffff";   // diagonal stripes
  for (let x = -400; x < 2048; x += 90) { g.beginPath(); g.moveTo(x, 384); g.lineTo(x + 384, 0); g.lineTo(x + 420, 0); g.lineTo(x + 36, 384); g.closePath(); g.fill(); }
  g.restore();
  g.fillStyle = "#ff9214"; g.fillRect(0, 0, 2048, 10); g.fillRect(0, 374, 2048, 10);
  // the wordmark in the middle, pulled tall so the shallow view squares it up again
  g.save(); g.translate(1024, 192); g.scale(1, 1.55);
  drawScript(g, script, 0, 0, 820, 220);
  g.restore();
  [[420, "FOURTH AND"], [1628, "COLLECT"]].forEach(function (s) {
    g.save(); g.translate(s[0], 192); g.scale(1, 1.6); candyText(g, s[1], 0, 0, 120, 560); g.restore();
  });
  return c;
}

// A painted yard number with its arrow, read from the sideline. Canvas up points toward the middle of the field.
function numberCanvas(n, arrowLeft) {
  const c = mkCanvas(256, 128), g = c.getContext("2d");
  g.font = '900 104px "Arial Black", Arial, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#f6f6ee";
  const s = String(n);
  g.fillText(s[0], 76, 70); g.fillText(s[1], 180, 70);
  if (arrowLeft != null) {
    g.beginPath();
    if (arrowLeft) { g.moveTo(4, 44); g.lineTo(26, 34); g.lineTo(26, 54); } else { g.moveTo(252, 44); g.lineTo(230, 34); g.lineTo(230, 54); }
    g.closePath(); g.fill();
  }
  return c;
}

// The wordmark alone on a clear canvas with a clean rim (decals on the turf).
function scriptDecal(script, w, h, stretch) {
  const c = mkCanvas(w, h), g = c.getContext("2d");
  g.save(); g.translate(w / 2, h / 2); g.scale(1, stretch || 1);
  drawScript(g, script, 0, 0, w - 16, (h - 16) / (stretch || 1));
  g.restore();
  return c;
}

// One stretch of padded wall: 1024 x 128, four panels. Wordmark, FREE PLAY, wordmark, MINT IN BOX.
function wallCanvas(script) {
  const c = mkCanvas(1024, 128), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 128);
  bg.addColorStop(0, "#2f7bf0"); bg.addColorStop(0.55, "#1b56cf"); bg.addColorStop(1, "#123a9e");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 128);
  for (let i = 0; i < 4; i++) {
    const x = i * 256;
    g.fillStyle = "rgba(255,255,255,.10)"; g.fillRect(x + 4, 14, 248, 40);                   // the shine on the padding
    g.fillStyle = "rgba(4,16,60,.55)"; g.fillRect(x, 0, 3, 128); g.fillRect(x + 253, 0, 3, 128);
    if (i % 2 === 0) drawScript(g, script, x + 128, 70, 226, 96);
    else {
      rrectPath(g, x + 22, 24, 212, 92, 14); g.fillStyle = "#0b1f5e"; g.fill();
      g.lineWidth = 4; g.strokeStyle = i === 1 ? "#ffe45c" : "#ff7ac6"; g.stroke();
      candyText(g, i === 1 ? "FREE PLAY" : "MINT IN BOX", x + 128, 71, 40, 186);
    }
  }
  g.fillStyle = "#ffd21f"; g.fillRect(0, 0, 1024, 9);
  g.fillStyle = "rgba(4,16,60,.5)"; g.fillRect(0, 120, 1024, 8);
  return c;
}

const FAN_COLS = ["#ff4b3e", "#16b9e8", "#ff3fa4", "#58c322", "#ffb81f", "#8a5cff", "#ffffff", "#ff9214", "#f4efdf", "#1b56cf"];
const PANT_COLS = ["#1d2a5a", "#2c3a66", "#3b3f4a", "#5a4632", "#1a1d26", "#24467a", "#6b6f7a", "#c9b38a"];
const SKIN_COLS = ["#f1c7a0", "#d9a273", "#a8703f", "#f6d7b8", "#7b4f2c", "#c68b59", "#5c3a20"];
const HAIR_COLS = ["#2a1a10", "#4a2a14", "#1a1410", "#8a5a2a", "#c99a50", "#2a1a10", "#ff4b3e", "#1b56cf", "#ff9214", "#9a9aa4"];

// One row of stands: the riser with its seat backs (lower half of the tile) and the concrete step (upper half).
function seatCanvas() {
  const c = mkCanvas(256, 128), g = c.getContext("2d"), rnd = rng(29);
  g.fillStyle = "#131c46"; g.fillRect(0, 0, 256, 64);
  speckle(g, 256, 64, 500, rnd, "rgba(255,255,255,.05)", "rgba(0,0,0,.12)");
  g.fillStyle = "#0c1438"; g.fillRect(0, 64, 256, 64);
  for (let i = 0; i < 6; i++) {
    const x = i * 42.7 + 4;
    rrectPath(g, x, 74, 34, 50, 8); g.fillStyle = i % 2 ? "#ff7a1a" : "#ff9214"; g.fill();
    g.fillStyle = "rgba(255,255,255,.2)"; g.fillRect(x + 4, 78, 26, 5);
    if (rnd() < 0.8) {                                    // somebody in the seat, for when the 3D crowd is switched off
      g.fillStyle = FAN_COLS[Math.floor(rnd() * FAN_COLS.length)]; rrectPath(g, x + 5, 92, 24, 36, 9); g.fill();
      g.fillStyle = SKIN_COLS[Math.floor(rnd() * SKIN_COLS.length)]; g.beginPath(); g.arc(x + 17, 84, 8, 0, TAU); g.fill();
    }
  }
  return c;
}
// Night game: deep blue overhead, a bright band at the horizon, stars. Wrapped on the inside of a sphere.
function skyCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(11);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, "#050c33"); gr.addColorStop(0.5, "#0a2278"); gr.addColorStop(0.84, "#1b56cf"); gr.addColorStop(1, "#6fb6ff");
  g.fillStyle = gr; g.fillRect(0, 0, 512, 128);
  g.fillStyle = "#0a1433"; g.fillRect(0, 128, 512, 128);
  for (let i = 0; i < 150; i++) {
    const y = rnd() * 96, s = rnd() < 0.25 ? 1.6 : 1;
    g.fillStyle = "rgba(255,255,255," + (0.35 + rnd() * 0.6) * (1 - y / 130) + ")"; g.fillRect(rnd() * 512, y, s, s);
  }
  return c;
}
function skylineCanvas() {
  const c = mkCanvas(512, 128), g = c.getContext("2d"), rnd = rng(47);
  let x = 0;
  while (x < 512) {
    const w = 18 + rnd() * 30, h = 26 + rnd() * 86;
    g.fillStyle = rnd() < 0.5 ? "#0a1a55" : "#0c2068"; g.fillRect(x, 128 - h, w + 1, h);
    for (let wy = 128 - h + 5; wy < 122; wy += 7) for (let wx = x + 3; wx < x + w - 4; wx += 6) {
      if (rnd() < 0.34) { g.fillStyle = rnd() < 0.75 ? "#ffd86a" : "#8fe0ff"; g.fillRect(wx, wy, 3, 4); }
    }
    x += w;
  }
  return c;
}
function lampCanvas() {
  const c = mkCanvas(128, 64), g = c.getContext("2d");
  g.fillStyle = "#1a2350"; g.fillRect(0, 0, 128, 64);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 7; x++) {
    const cx = 13 + x * 17, cy = 12 + y * 20, gr = g.createRadialGradient(cx, cy, 0, cx, cy, 8);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.6, "#fff6c8"); gr.addColorStop(1, "rgba(255,246,200,0)");
    g.fillStyle = gr; g.fillRect(cx - 8, cy - 8, 16, 16);
  }
  return c;
}
function glowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,250,225,.95)"); gr.addColorStop(0.25, "rgba(255,246,200,.42)"); gr.addColorStop(1, "rgba(255,246,200,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(0,20,10,.8)"); gr.addColorStop(0.55, "rgba(0,20,10,.4)"); gr.addColorStop(1, "rgba(0,20,10,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}

// The scoreboard face (1024 x 448): the wordmark, the game, the numbers the 2D board showed, and the sponsor panel.
function paintBoard(g, script) {
  const bg = g.createLinearGradient(0, 0, 0, 448);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 448);
  const gl = g.createLinearGradient(0, 0, 0, 140);
  gl.addColorStop(0, "rgba(255,255,255,.38)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.beginPath(); g.ellipse(512, -20, 620, 150, 0, 0, TAU); g.fill();
  g.lineWidth = 14; g.strokeStyle = "#ff9214"; g.strokeRect(7, 7, 1010, 434);
  g.lineWidth = 4; g.strokeStyle = "#ffe45c"; g.strokeRect(17, 17, 990, 414);
  const cells = [["KICK FROM", S.D + " YDS"], ["MADE", String(S.makes || 0)], ["LONG", S.longest ? S.longest + " YDS" : "--"], ["STRIKES", null]];
  for (let i = 0; i < 4; i++) {
    const x = 34 + i * 241;
    rrectPath(g, x, 30, 230, 128, 12); g.fillStyle = "#060a1c"; g.fill();
    g.lineWidth = 3; g.strokeStyle = "#ffe45c"; g.stroke();
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "bold 24px " + HUD_FONT; g.fillStyle = "#a8ecff"; g.fillText(cells[i][0], x + 115, 54);
    if (cells[i][1] != null) {
      g.font = '900 58px "Arial Black", Arial, sans-serif';
      const tw = g.measureText(cells[i][1]).width;
      if (tw > 206) g.font = "900 " + Math.floor(58 * 206 / tw) + 'px "Arial Black", Arial, sans-serif';
      g.shadowColor = "#ff9a00"; g.shadowBlur = 14; g.fillStyle = "#ffc21a"; g.fillText(cells[i][1], x + 115, 112); g.shadowBlur = 0;
    } else {
      for (let k = 0; k < STRIKES; k++) {
        const on = k < (S.strikes || 0), bx = x + 30 + k * 60;
        rrectPath(g, bx, 84, 50, 56, 8); g.fillStyle = on ? "#ff3322" : "#1d2133"; g.fill();
        if (on) { g.font = '900 44px "Arial Black", Arial, sans-serif'; g.fillStyle = "#ffffff"; g.fillText("X", bx + 25, 114); }
      }
    }
  }
  // the sponsor panel from the 2D board, kept
  rrectPath(g, 34, 172, 956, 74, 12); g.fillStyle = "#ffd23f"; g.fill();
  g.lineWidth = 4; g.strokeStyle = "#08205f"; g.stroke();
  g.font = '900 46px "Arial Black", Arial, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#101219"; g.fillText("SATURDAY MORNING SWAP MEET", 512, 211);
  drawScript(g, script, 262, 340, 420, 150);
  candyText(g, "FOURTH AND", 730, 306, 50, 500);
  candyText(g, "COLLECT", 730, 370, 62, 500);
}

// The pad around the base of the goal post: blue, orange trim, the wordmark facing the field.
function padCanvas(script) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 512, 0);
  bg.addColorStop(0, "#123a9e"); bg.addColorStop(0.5, "#2f7bf0"); bg.addColorStop(1, "#123a9e");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#ff9214"; g.fillRect(0, 0, 512, 22); g.fillRect(0, 234, 512, 22);
  g.fillStyle = "#ffe45c"; g.fillRect(0, 22, 512, 4); g.fillRect(0, 230, 512, 4);
  g.save(); g.translate(256, 128); g.scale(0.7, 1.25); drawScript(g, script, 0, 0, 300, 150); g.restore();
  return c;
}

// The football: pebbled leather, white stripes near the tips, laces down one side, the wordmark on the other.
// u runs around the ball (u = 0 faces the kicker on the tee), v from tip to tip.
function footballCanvas(script) {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(61);
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, "#5a2b10"); bg.addColorStop(0.5, "#8b4a20"); bg.addColorStop(1, "#5a2b10");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  speckle(g, 512, 256, 5000, rnd, "rgba(255,200,150,.08)", "rgba(40,15,0,.14)");
  g.fillStyle = "rgba(30,10,0,.5)"; [0, 128, 256, 384].forEach(function (x) { g.fillRect(x + 63, 0, 2, 256); });   // the panel seams
  g.fillStyle = "#f6f2e6"; g.fillRect(0, 34, 512, 10); g.fillRect(0, 212, 512, 10);
  // laces, opposite the wordmark
  g.fillStyle = "#f6f2e6"; g.fillRect(250, 78, 12, 100);
  for (let i = 0; i < 8; i++) g.fillRect(238, 82 + i * 12, 36, 6);
  // the wordmark, across the belly facing the kicker (drawn on both edges so it wraps the seam)
  [0, 512].forEach(function (x) { g.save(); g.translate(x, 128); g.scale(1, 1.25); drawScript(g, script, 0, 0, 140, 60); g.restore(); });
  return c;
}

// A jersey, wrapped once around the body: u = 0 is the chest, u = .5 the back. Wordmark on both, number on the back.
function jerseyCanvas(script, base, stripe, num, numCol, stripes) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, 512, 256);
  if (stripes) { g.fillStyle = stripes; for (let x = 0; x < 512; x += 32) g.fillRect(x, 0, 16, 256); }
  if (stripe) { g.fillStyle = stripe; g.fillRect(0, 208, 512, 10); g.fillRect(0, 224, 512, 6); }
  const sh = g.createLinearGradient(0, 0, 0, 256);
  sh.addColorStop(0, "rgba(255,255,255,.12)"); sh.addColorStop(1, "rgba(0,0,40,.16)");
  g.fillStyle = sh; g.fillRect(0, 0, 512, 256);
  if (!stripes) {
    [0, 512].forEach(function (x) { drawScript(g, script, x, 88, 150, 62); });
    if (num) {
      g.font = '900 86px "Arial Black", Arial, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
      g.lineWidth = 9; g.strokeStyle = "#ffffff"; g.strokeText(num, 256, 120); g.strokeText(num, 0, 168); g.strokeText(num, 512, 168);
      g.fillStyle = numCol; g.fillText(num, 256, 120); g.fillText(num, 0, 168); g.fillText(num, 512, 168);
    }
  }
  return c;
}

function flagCanvas(script) {
  const c = mkCanvas(512, 320), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 320);
  bg.addColorStop(0, "#2f7bf0"); bg.addColorStop(1, "#123a9e");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 320);
  g.fillStyle = "#ff9214"; g.fillRect(0, 0, 512, 18); g.fillRect(0, 302, 512, 18);
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 16, 320);
  drawScript(g, script, 266, 160, 440, 250);
  return c;
}

// A tiny painted stadium for the glossy highlights on helmets, the posts and the ball.
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.14, "#dcebff"); gr.addColorStop(0.3, "#2f7bf0");
    gr.addColorStop(0.5, "#123a9e"); gr.addColorStop(0.52, "#1d7a3c"); gr.addColorStop(1, "#2cb655");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#0a2278"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(6, 6, 16, 16); tg.fillRect(42, 6, 16, 16); tg.fillRect(6, 42, 16, 16); tg.fillRect(42, 42, 16, 16);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#2cb655"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* ---------------- LED ribbon board: the strip on the facade behind the end zone ----------------
   The board is a real dot matrix. Everything on it is painted into a small canvas, one pixel per LED, and a small
   shader turns each pixel into a glowing dot. It runs most of the width of the end zone in three sections: the
   programme scrolls right to left through all three, and big moments (ledPlay below) cut in on every section at
   once, so the middle one, right behind the uprights, always carries the message. */
const LED_SEG = 128, LED_SEGS = 3, LED_COLS = LED_SEG * LED_SEGS, LED_ROWS = 18;
const LED_PITCH = 0.16;                                    // yards from one LED to the next
const LED_SAFE = 120;                                      // widest message that stays inside one section
const LED_SPEED = 40;                                      // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));   // the largest text size that fits (5 x 7 font, in LEDs per font pixel)
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
// Short messages between the plugs. The wordmark leads each group.
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["SPLIT THE UPRIGHTS", "lime"], ["NO QUARTERS REQUIRED", "cyan"]];
// Plugs for the rest of the arcade: [game, one-line tag]. Edit freely, the board lays itself out.
const LED_PLUGS = [
  ["TAPE PIN LANES", "3D BOWLING"],
  ["SHELF LINKS", "MINI GOLF"],
  ["BARGAIN BIN BUCKETS", "HOOPS"],
  ["BLEACHER CARTS", "HOME RUN DERBY"],
  ["TICKET ROLL ALLEY", "ROLL FOR TICKETS"],
  ["PAWN SHOP POOL", "RACK 'EM UP"],
  ["RINK RAT SHOOTOUT", "HOCKEY SHOOTOUT"],
  ["POWDER DAY HAUL", "HIT THE SLOPES"],
  ["TABLE RINK RUMBLE", "AIR HOCKEY"],
  ["FLEA FORTRESS FLYBY", "PLAY IT FREE"],
  ["CREATURE FEATURE KO", "VHS BOSS RUSH"]
];
let LED = null;

// 5 x 7 dot-matrix font, seven rows of five per character
const LED_FONT = (function () {
  const src = {
    A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110",
    C: "01110 10001 10000 10000 10000 10001 01110", D: "11110 10001 10001 10001 10001 10001 11110",
    E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
    G: "01110 10001 10000 10111 10001 10001 01111", H: "10001 10001 10001 11111 10001 10001 10001",
    I: "01110 00100 00100 00100 00100 00100 01110", J: "00111 00010 00010 00010 00010 10010 01100",
    K: "10001 10010 10100 11000 10100 10010 10001", L: "10000 10000 10000 10000 10000 10000 11111",
    M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 11001 10101 10011 10001 10001 10001",
    O: "01110 10001 10001 10001 10001 10001 01110", P: "11110 10001 10001 11110 10000 10000 10000",
    Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
    S: "01111 10000 10000 01110 00001 00001 11110", T: "11111 00100 00100 00100 00100 00100 00100",
    U: "10001 10001 10001 10001 10001 10001 01110", V: "10001 10001 10001 10001 10001 01010 00100",
    W: "10001 10001 10001 10101 10101 11011 10001", X: "10001 10001 01010 00100 01010 10001 10001",
    Y: "10001 10001 01010 00100 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
    "0": "01110 10001 10011 10101 11001 10001 01110", "1": "00100 01100 00100 00100 00100 00100 01110",
    "2": "01110 10001 00001 00010 00100 01000 11111", "3": "11110 00001 00001 01110 00001 00001 11110",
    "4": "00010 00110 01010 10010 11111 00010 00010", "5": "11111 10000 11110 00001 00001 10001 01110",
    "6": "00110 01000 10000 11110 10001 10001 01110", "7": "11111 00001 00010 00100 01000 01000 01000",
    "8": "01110 10001 10001 01110 10001 10001 01110", "9": "01110 10001 10001 01111 00001 00010 01100",
    "!": "00100 00100 00100 00100 00100 00000 00100", ".": "00000 00000 00000 00000 00000 01100 01100",
    ",": "00000 00000 00000 00000 01100 00100 01000", "'": "00100 00100 01000 00000 00000 00000 00000",
    "-": "00000 00000 00000 11111 00000 00000 00000", ":": "00000 01100 01100 00000 01100 01100 00000",
    "/": "00001 00001 00010 00100 01000 10000 10000", "&": "01100 10010 10100 01000 10101 10010 01101",
    "?": "01110 10001 00001 00010 00100 00000 00100", "+": "00000 00100 00100 11111 00100 00100 00000",
    ">": "10000 01000 00100 00010 00100 01000 10000", "<": "00001 00010 00100 01000 00100 00010 00001",
    "*": "00000 00100 01110 11111 01110 00100 00000"
  };
  const out = {};
  for (const ch in src) out[ch] = src[ch].split(" ");
  return out;
})();
function ledTextW(str, sx) {
  let w = 0;
  for (let i = 0; i < str.length; i++) w += (str[i] === " " ? 4 : 6) * sx;
  return Math.max(0, w - sx);
}
// Paints str with its top-left LED at (x, y); each font pixel is sx by sy LEDs. Returns the x after the last character.
function ledText(g, str, x, y, sx, sy, color) {
  g.fillStyle = color;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === " ") { x += 4 * sx; continue; }
    const rows = LED_FONT[ch] || LED_FONT["?"];
    for (let r = 0; r < 7; r++) {
      const rw = rows[r];
      for (let c = 0; c < 5; c++) if (rw.charCodeAt(c) === 49) g.fillRect(x + c * sx, y + r * sy, sx, sy);
    }
    x += 6 * sx;
  }
  return x;
}

// The whole scrolling programme, painted once into one long strip (LED_ROWS tall).
function ledStrip(script) {
  const HH = LED_ROWS, big = LED_BIG, yBig = Math.floor((HH - 7 * big) / 2), GAP = 13, items = [];
  // The wordmark at board resolution, prepared once. At this size the thin script strokes come out half
  // lit, so the cream lettering is pushed to full LED brightness, the red edge is kept as a dimmer rim
  // and the navy outline falls back to dark: the script reads as light on black.
  const markW = Math.max(8, Math.round(HH * script.width / script.height));
  const markC = mkCanvas(markW, HH), mg = markC.getContext("2d", { willReadFrequently: true });
  mg.imageSmoothingEnabled = true; mg.imageSmoothingQuality = "high";
  mg.drawImage(script, 0, 0, markW, HH);
  try {
    const im = mg.getImageData(0, 0, markW, HH), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const m = Math.max(d[i], d[i + 1], d[i + 2]);
      if (m < 6) continue;
      const warm = d[i] >= d[i + 2], cream = warm && d[i + 1] > 0.55 * d[i];
      let k = cream ? (m > 70 ? 255 / m : 0.2) : warm ? 0.6 : 0.1;
      k = Math.min(k, 255 / m);
      d[i] = d[i] * k; d[i + 1] = d[i + 1] * k; d[i + 2] = d[i + 2] * k;
    }
    mg.putImageData(im, 0, 0);
  } catch (e) { /* leave it as drawn */ }
  function mark() { items.push({ w: markW, draw: function (g, x) { g.drawImage(markC, x, 0); } }); }
  function line(str, color) { items.push({ w: ledTextW(str, big), draw: function (g, x) { ledText(g, str, x, yBig, big, big, color); } }); }
  // an ad card: a color bar, a little "FREE" tab with the tag beside it, and the game's name underneath
  function plug(name, tag, color) {
    const ns = Math.max(1, big - 1), ts = 1, pad = 7, tab = ledTextW("FREE", ts) + 4;
    const top = Math.max(1, Math.floor((HH - (7 * ts + 3 + 7 * ns)) / 2));
    const w = pad + Math.max(ledTextW(name, ns), tab + 4 + ledTextW(tag, ts));
    items.push({ w: w, draw: function (g, x) {
      g.fillStyle = color; g.fillRect(x, 1, 3, HH - 2);
      g.fillStyle = LED_C.yellow; g.fillRect(x + pad, top - 1, tab, 7 * ts + 2);
      ledText(g, "FREE", x + pad + 2, top, ts, ts, "#000000");
      ledText(g, tag, x + pad + tab + 4, top, ts, ts, LED_C.white);
      ledText(g, name, x + pad, top + 7 * ts + 3, ns, ns, color);
    } });
  }
  const tints = [LED_C.orange, LED_C.lime, LED_C.cyan, LED_C.pink, LED_C.yellow];
  const per = Math.ceil(LED_PLUGS.length / LED_LINES.length);
  let n = 0;
  for (let k = 0; k < LED_LINES.length; k++) {
    mark();
    line(LED_LINES[k][0], LED_C[LED_LINES[k][1]] || LED_C.amber);
    for (let j = 0; j < per && n < LED_PLUGS.length; j++, n++) plug(LED_PLUGS[n][0], LED_PLUGS[n][1], tints[n % tints.length]);
  }
  let total = 0;
  for (let i = 0; i < items.length; i++) total += items[i].w + GAP * 2 + 7;
  const c = mkCanvas(total, HH), g = c.getContext("2d");
  g.fillStyle = "#000000"; g.fillRect(0, 0, total, HH);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  let x = 0;
  for (let i = 0; i < items.length; i++) {
    items[i].draw(g, x);
    x += items[i].w + GAP;
    ledText(g, "*", x, Math.floor((HH - 7) / 2), 1, 1, LED_C.blue);       // a small separator between items
    x += 7 + GAP;
  }
  return { canvas: c, markW: items[0].w };
}

function ledCreate(script) {
  const c = mkCanvas(LED_COLS, LED_ROWS), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  const strip = ledStrip(script), sw = strip.canvas.width;
  // open with the wordmark sitting in the middle of the center section
  const start = ((-(LED_COLS - strip.markW) / 2) % sw + sw) % sw;
  return { canvas: c, g: g, strip: strip.canvas, scroll: start, pos: -1, msg: null, queue: [], frame: -1, tex: null };
}

// One LED cell for the shader: a round lens, bright in the middle, dark between neighbors.
function ledDotCanvas() {
  const c = mkCanvas(32, 32), g = c.getContext("2d");
  g.fillStyle = "#000000"; g.fillRect(0, 0, 32, 32);
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.45, "#f4f4f4"); gr.addColorStop(0.8, "#585858"); gr.addColorStop(1, "#000000");
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return c;
}

// kind: "flash" (strobe and chevrons), "slide", "cycle", "blink" or "count" (label, a number that counts up, suffix)
function ledMsg(kind, text, dur, more) {
  const m = { kind: kind, text: text, dur: dur, t: 0, wait: 0, color: "amber" };
  if (more) for (const k in more) m[k] = more[k];
  return m;
}
// Cut to a list of messages (or add them after whatever is showing), then return to the scroll.
function ledPlay(list, append) {
  const L = LED;
  if (!L || !list.length) return;
  if (append && L.msg) { for (let i = 0; i < list.length; i++) L.queue.push(list[i]); return; }
  if (!list.some(function (m) { return m.keep; })) {
    // a miss cuts in, but a running total that has not had its turn yet still gets it afterwards
    const old = (L.msg && L.msg.keep ? [L.msg] : []).concat(L.queue.filter(function (m) { return m.keep; }));
    if (old.length) { old[0].t = 0; list = list.concat(old); }
  }
  L.msg = list[0]; L.msg.t = 0;
  L.queue = list.slice(1);
  L.frame = -1;
}
function ledClear() {
  if (!LED) return;
  LED.msg = null; LED.queue = []; LED.pos = -1;
}
function ledFinal(score) {
  if (!LED) return;
  ledPlay([ledMsg("count", "FINAL", 7, { from: Math.min(V.lastTotal, score), value: score, suffix: " YDS", final: true, wait: 0.5 })], true);
}

// One section's worth of a message (LED_SEG wide).
function ledDrawMsg(g, m) {
  const WW = LED_SEG, HH = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(WW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.amber;
  function fit(str) { let sx = big; while (sx > 1 && ledTextW(str, sx) > LED_SAFE) sx--; return sx; }
  function chase(color, dir) {                              // running lights along the top and bottom edges
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < WW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(WW - x - 3, HH - 1, 3, 1); }
  }
  if (m.kind === "count") {                                 // counts up to the new number
    const k = calm ? 1 : Math.min(1, t / 0.7), v = Math.round(m.from + (m.value - m.from) * k);
    const label = m.text ? m.text + " " : "", suffix = m.suffix || "", sxc = fit(label + m.value + suffix);
    const x = Math.round((WW - ledTextW(label + m.value + suffix, sxc)) / 2);
    const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
    let xn = ledText(g, label, x, yBig, sxc, big, LED_C.amber);
    xn = ledText(g, String(v), xn, yBig, sxc, big, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
    ledText(g, suffix, xn, yBig, sxc, big, LED_C.amber);
    if (!calm && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(WW * m.t / 0.3), 0, WW, HH); }   // wipe in
    chase(LED_C.amber, 1);
    return;
  }
  const sx = fit(m.text), w = ledTextW(m.text, sx), x0 = Math.round((WW - w) / 2);
  if (m.kind === "flash") {
    if (!calm && t < 0.6 && Math.floor(t * 12) % 2 === 0) {                        // strobe: the whole board flips
      g.fillStyle = LED_C.lime; g.fillRect(0, 0, WW, HH);
      ledText(g, m.text, x0, yBig, sx, big, "#000000");
      return;
    }
    const span = 6 * big + 5, ph = calm ? 0 : Math.floor((t * 46) % span);
    for (let k = 0; k < 12; k++) {                          // chevrons racing outward on both sides
      const off = Math.round(w / 2) + 9 + k * span + ph;
      if (off > mid + span) break;
      const cc = k % 2 ? LED_C.lime : LED_C.yellow;
      ledText(g, ">", mid + off, yBig, big, big, cc);
      ledText(g, "<", mid - off - 5 * big, yBig, big, big, cc);
    }
    const cyc = [LED_C.lime, LED_C.white, LED_C.yellow];
    ledText(g, m.text, x0, yBig, sx, big, calm ? LED_C.lime : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 12; i++) g.fillRect((vrand() * WW) | 0, (vrand() * HH) | 0, 1, 1); }
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "slide") {                                 // slides in from the right, then a white glint sweeps across it
    const k = calm ? 1 : Math.min(1, t / 0.45), e = 1 - Math.pow(1 - k, 3);
    const x = Math.round(x0 + (1 - e) * WW);
    ledText(g, m.text, x, yBig, sx, big, col);
    if (!calm && k >= 1) {
      const bx = Math.floor(((t - 0.45) * 150) % (WW + 80)) - 40;
      g.save(); g.beginPath(); g.rect(bx, 0, 12, HH); g.clip();
      ledText(g, m.text, x, yBig, sx, big, "#ffffff");
      g.restore();
    }
    chase(col, -1);
    return;
  }
  if (m.kind === "cycle") {                                 // every letter takes its turn through the colors
    const cyc = [LED_C.yellow, LED_C.pink, LED_C.cyan, LED_C.lime, LED_C.orange];
    let x = x0;
    for (let i = 0; i < m.text.length; i++) x = ledText(g, m.text[i], x, yBig, sx, big, cyc[(i + (calm ? 0 : Math.floor(t * 9))) % cyc.length]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 10; i++) g.fillRect((vrand() * WW) | 0, (vrand() * HH) | 0, 1, 1); }
    chase(LED_C.yellow, 1);
    return;
  }
  // blink: a few flashes, then it holds over a solid bar
  if (calm || t > 1.1 || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, yBig, sx, big, col);
  g.fillStyle = col; g.fillRect(0, HH - 1, WW, 1); g.fillRect(0, 0, WW, 1);
}

function ledDraw() {
  const L = LED, g = L.g, HH = LED_ROWS;
  g.fillStyle = "#000000"; g.fillRect(0, 0, LED_COLS, HH);
  if (L.msg) {
    for (let s = 0; s < LED_SEGS; s++) {
      g.save(); g.translate(s * LED_SEG, 0);
      g.beginPath(); g.rect(0, 0, LED_SEG, HH); g.clip();
      ledDrawMsg(g, L.msg);
      g.restore();
    }
    return;
  }
  const sw = L.strip.width;
  let sx = L.pos, dx = 0;
  while (dx < LED_COLS) {                                   // the strip wraps around
    const n = Math.min(LED_COLS - dx, sw - sx);
    g.drawImage(L.strip, sx, 0, n, HH, dx, 0, n, HH);
    dx += n; sx = 0;
  }
}

// Advance the board. It only repaints (and re-uploads its small texture) when an LED actually changes.
function ledTick(dt) {
  const L = LED;
  if (!L) return;
  let redraw = false;
  if (L.msg) {
    L.msg.t += dt;
    if (L.msg.t >= L.msg.dur) { L.msg = L.queue.shift() || null; L.frame = -1; redraw = true; }
  }
  if (L.msg) {
    const f = Math.floor(L.msg.t * 30);
    if (f !== L.frame) { L.frame = f; redraw = true; }
  } else {
    const sw = L.strip.width;
    L.scroll = (L.scroll + dt * (Shell.reduced ? LED_SPEED * 0.5 : LED_SPEED)) % sw;
    const p = Math.floor(L.scroll);
    if (p !== L.pos) { L.pos = p; redraw = true; }
  }
  if (redraw) { ledDraw(); if (L.tex) L.tex.needsUpdate = true; }
}

/* ---------------- Players: jointed figures posed from a short list of numbers ----------------
   Built in feet at life size, then the whole figure is scaled to yards. A pose is: hips x y z, hips turn,
   shoulders turn, lean, left hand x y z, right hand x y z, left foot x y z, right foot x y z, head turn
   (all in the player's own space, facing +z; his left is +x). Elbows and knees are solved from where the
   hands and feet are. */
// The kicker, right footed, measured from KICK_ROOT: the ball sits at x -1.05, z 2.7 in his space.
const KICK_READY = [3.0, 2.95, -2.0, -25, -25, 6, 3.85, 2.75, -1.6, 2.15, 2.75, -2.4, 3.45, 0.2, -1.8, 2.6, 0.2, -2.25, -25];   // two steps back and a step over, squared up to the ball
const KICK_PLANT = [0.1, 2.75, 1.35, 25, 20, 10, 2.4, 4.0, 1.2, -1.6, 3.5, 0.5, 0.15, 0.2, 2.5, -0.9, 1.3, -0.4, -10];
const KICK_HIT = [-0.1, 2.85, 1.9, -10, -15, -6, 2.6, 4.3, 1.4, -0.4, 3.6, 2.4, 0.15, 0.25, 2.5, -1.0, 0.45, 2.25, 0];
const KICK_FOLLOW = [-0.3, 3.05, 2.4, -20, -25, -14, 2.4, 4.8, 1.0, 0.6, 3.9, 2.6, 0.15, 0.6, 2.6, -0.8, 4.0, 4.6, 0];
// The referees under the uprights.
const REF_STAND = [0, 3.0, 0, 0, 0, 2, 0.95, 2.8, 0.1, -0.95, 2.8, 0.1, 0.5, 0.2, 0, -0.5, 0.2, 0, 0];
const REF_GOOD = [0, 3.05, 0, 0, 0, -4, 0.6, 6.95, 0.25, -0.6, 6.95, 0.25, 0.5, 0.2, 0, -0.5, 0.2, 0, 0];
const REF_WAVE_A = [0, 3.0, 0, 0, 0, 4, -1.1, 4.4, 1.5, 1.1, 4.4, 1.5, 0.5, 0.2, 0, -0.5, 0.2, 0, 0];
const REF_WAVE_B = [0, 3.0, 0, 0, 0, 4, 2.6, 4.7, 0.6, -2.6, 4.7, 0.6, 0.5, 0.2, 0, -0.5, 0.2, 0, 0];
const poseA = [], poseB = [];

function mixPose(a, b, u, out) {
  for (let n = 0; n < a.length; n++) out[n] = a[n] + (b[n] - a[n]) * u;
  return out;
}
function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }

function makePlayer(T, G, o) {
  const root = new T.Group();
  root.scale.setScalar(1 / 3);                              // feet to yards: life size
  const skin = new T.MeshLambertMaterial({ color: o.skin });
  const jersey = new T.MeshPhongMaterial({ map: o.jersey, specular: 0x333333, shininess: 18 });
  const sleeve = o.sleeveMap ? jersey : new T.MeshLambertMaterial({ color: o.sleeve });
  const pants = new T.MeshPhongMaterial({ color: o.pants, specular: 0x222222, shininess: 14 });
  const sock = new T.MeshLambertMaterial({ color: o.sock });
  const hat = new T.MeshPhongMaterial({ color: o.hat, specular: o.helmet ? 0xffffff : 0x1a1a1a, shininess: o.helmet ? 120 : 20, envMap: G.env, combine: T.AddOperation, reflectivity: o.helmet ? 0.22 : 0.04 });
  const shoeM = new T.MeshPhongMaterial({ color: 0x14161c, specular: 0x666666, shininess: 40 });
  function ball(mat, sx, sy, sz, parent) { const m = new T.Mesh(G.sphere, mat); m.scale.set(sx, sy || sx, sz || sx); (parent || root).add(m); return m; }

  const hips = ball(pants, 0.6, 0.44, 0.47);
  const upper = new T.Group(); root.add(upper);
  const torso = new T.Mesh(G.torso, jersey); torso.scale.z = 0.72; upper.add(torso);
  if (o.pads) { torso.scale.x = 1.08; const pad = ball(jersey, 1.0, 0.36, 0.62, upper); pad.position.y = 1.78; }   // shoulder pads under the jersey
  const belt = new T.Mesh(G.belt, new T.MeshLambertMaterial({ color: o.beltCol || 0x1a1d26 })); belt.scale.set(0.56, 0.17, 0.42); belt.position.y = 0.04; upper.add(belt);
  const neck = new T.Mesh(G.cyl, skin); neck.scale.set(0.2, 0.36, 0.2); neck.position.y = 2.05; upper.add(neck);
  const head = new T.Group(); head.position.y = 2.7; upper.add(head);
  ball(skin, 0.46, 0.52, 0.5, head);
  ball(skin, 0.09, 0.12, 0.06, head).position.set(0, -0.02, 0.5);                       // nose
  [-1, 1].forEach(function (s) { ball(skin, 0.07, 0.13, 0.08, head).position.set(s * 0.46, 0, 0.02); });   // ears
  if (o.helmet) {
    const shell = ball(hat, 0.62, 0.6, 0.66, head); shell.position.set(0, 0.08, -0.04);   // the helmet shell
    const mask = new T.MeshPhongMaterial({ color: 0xd8dbe2, specular: 0xffffff, shininess: 90 });
    [-0.08, -0.26].forEach(function (y) { const bar = new T.Mesh(G.mask, mask); bar.position.set(0, y, 0.0); head.add(bar); });
    const v = new T.Mesh(G.cyl, mask); v.scale.set(0.035, 0.34, 0.035); v.position.set(0, -0.3, 0.6); head.add(v);
    const stripe = ball(new T.MeshPhongMaterial({ color: o.stripe || 0xff9214, specular: 0xffffff, shininess: 100 }), 0.1, 0.61, 0.67, head);
    stripe.position.set(0, 0.09, -0.04);
  } else {
    const dome = new T.Mesh(G.dome, hat); dome.scale.setScalar(0.52); dome.position.y = 0.05; head.add(dome);
    const brim = ball(hat, 0.38, 0.05, 0.38, head); brim.position.set(0, 0.11, 0.48);
    const hair = ball(new T.MeshLambertMaterial({ color: 0x3a2414 }), 0.47, 0.3, 0.42, head); hair.position.set(0, -0.12, -0.12);
  }

  function limb(m1, m2, r1, r2, endMat, endR) {
    const L = { up: new T.Mesh(G.cyl, m1), lo: new T.Mesh(G.cyl, m2), j0: ball(m1, r1 * 1.08), j1: ball(m2, r2 * 1.1), end: ball(endMat, endR), r1: r1, r2: r2 };
    root.add(L.up); root.add(L.lo);
    return L;
  }
  const arm = [limb(sleeve, skin, 0.22, 0.165, skin, 0.19), limb(sleeve, skin, 0.22, 0.165, skin, 0.19)];
  const leg = [limb(pants, sock, 0.31, 0.22, sock, 0.2), limb(pants, sock, 0.31, 0.22, sock, 0.2)];
  const shoe = [ball(shoeM, 0.25, 0.19, 0.5), ball(shoeM, 0.25, 0.19, 0.5)];
  return { root: root, hips: hips, upper: upper, head: head, arm: arm, leg: leg, shoe: shoe };
}

// Elbow or knee: the joint between A and B for bones l1 and l2, bent toward "pole".
function bend(A, B, pole, l1, l2, out) {
  const t = TV;
  t.d.subVectors(B, A);
  let d = t.d.length();
  if (d < 1e-4) { t.d.set(0, -1, 0); d = 1e-4; } else t.d.multiplyScalar(1 / d);
  const dm = Math.min(d, (l1 + l2) * 0.999), a = (l1 * l1 - l2 * l2 + dm * dm) / (2 * dm), hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  t.q.copy(pole).addScaledVector(t.d, -pole.dot(t.d));
  if (t.q.lengthSq() < 1e-6) t.q.set(0, 0, 1);
  t.q.normalize();
  out.copy(A).addScaledVector(t.d, a).addScaledVector(t.q, hgt);
}
function bone(mesh, A, B, r) {
  const t = TV;
  t.d.subVectors(B, A);
  const l = t.d.length() || 1e-4;
  mesh.position.copy(A);
  mesh.quaternion.setFromUnitVectors(t.up, t.d.multiplyScalar(1 / l));
  mesh.scale.set(r, l, r);
}
function setLimb(L, A, B, pole, l1, l2) {
  const t = TV;
  bend(A, B, pole, l1, l2, t.e);
  bone(L.up, A, t.e, L.r1); bone(L.lo, t.e, B, L.r2);
  L.j0.position.copy(A); L.j1.position.copy(t.e); L.end.position.copy(B);
}
function applyPose(P, v) {
  const t = TV, hy = v[3] * DEG, uy = v[4] * DEG, ch = Math.cos(hy), sh = Math.sin(hy), cu = Math.cos(uy), su = Math.sin(uy);
  P.hips.position.set(v[0], v[1], v[2]); P.hips.rotation.y = hy;
  P.upper.position.set(v[0], v[1], v[2]); P.upper.rotation.set(v[5] * DEG, uy, 0, "YXZ");
  P.upper.updateMatrix();
  P.head.rotation.y = (v[18] - v[4]) * DEG;
  for (let s = 0; s < 2; s++) {                             // 0 = left, 1 = right
    const sg = s ? -1 : 1, px = sg * 0.5, pz = -0.5;
    t.a.set(sg * 0.8, 1.88, 0).applyMatrix4(P.upper.matrix);
    t.b.set(v[6 + s * 3], v[7 + s * 3], v[8 + s * 3]);
    t.p.set(px * cu + pz * su, -0.8, -px * su + pz * cu);   // elbows hang down, out and a little back
    setLimb(P.arm[s], t.a, t.b, t.p, 1.15, 1.12);
    t.a.set(v[0] + sg * 0.4 * ch, v[1] - 0.08, v[2] - sg * 0.4 * sh);
    t.b.set(v[12 + s * 3], v[13 + s * 3] + 0.14, v[14 + s * 3]);
    t.p.set(sh + sg * 0.25 * ch, 0.2, ch - sg * 0.25 * sh); // knees point where the hips face
    setLimb(P.leg[s], t.a, t.b, t.p, 1.5, 1.48);
    P.shoe[s].position.set(t.b.x + sh * 0.26, v[13 + s * 3], t.b.z + ch * 0.26);
    P.shoe[s].rotation.y = hy * 0.6;
  }
}

/* ---------------- The crowd: seated people with real proportions, built once and drawn instanced ----------------
   Four pieces per fan (shirt, trousers, skin, hair or cap), each one draw call for the whole stand. The arms carry
   a marker so the stands can throw their hands up on a make. Sizes are an adult's, in meters, turned into yards. */
const M2Y = 1 / 0.9144;
const SHOULDER = { x: 0.2 * M2Y, y: 0.93 * M2Y };
function crowdPieces(T) {
  const lists = { shirt: [], pants: [], skin: [], hair: [] };
  const up = new T.Vector3(0, 1, 0), q = new T.Quaternion(), m = new T.Matrix4(), v = new T.Vector3(), sc = new T.Vector3();
  function put(list, geo, mat, arm) {
    const g = geo.clone().applyMatrix4(mat);
    const ng = g.index ? g.toNonIndexed() : g;
    list.push({ g: ng, arm: arm || 0 });
  }
  function at(x, y, z, sx, sy, sz) { return m.compose(v.set(x * M2Y, y * M2Y, z * M2Y), q.identity(), sc.set(sx * M2Y, sy * M2Y, sz * M2Y)).clone(); }
  // a tapered tube from a to b (meters)
  function tube(list, a, b, r1, r2, seg, arm) {
    const A = new T.Vector3(a[0], a[1], a[2]).multiplyScalar(M2Y), B = new T.Vector3(b[0], b[1], b[2]).multiplyScalar(M2Y);
    const d = B.clone().sub(A), len = d.length();
    const geo = new T.CylinderGeometry(r2 * M2Y, r1 * M2Y, len, seg, 1, true); geo.translate(0, len / 2, 0);
    q.setFromUnitVectors(up, d.normalize());
    put(list, geo, new T.Matrix4().compose(A, q.clone(), sc.set(1, 1, 1)), arm);
    q.identity();
  }
  // facet counts kept low: the stands hold hundreds of these and are seen from 40 yards and more
  const sphHead = new T.SphereGeometry(1, 7, 5), sphMid = new T.SphereGeometry(1, 6, 4), sphLo = new T.SphereGeometry(1, 4, 3);
  const cap = new T.SphereGeometry(1, 7, 3, 0, TAU, 0, Math.PI * 0.5);
  // trousers: hips, thighs out to the knees, shins down to the feet
  put(lists.pants, sphMid, at(0, 0.47, -0.03, 0.17, 0.11, 0.15));
  [-1, 1].forEach(function (s) {
    tube(lists.pants, [s * 0.095, 0.46, -0.02], [s * 0.11, 0.48, 0.4], 0.075, 0.06, 6);
    tube(lists.pants, [s * 0.11, 0.48, 0.4], [s * 0.12, 0.06, 0.45], 0.055, 0.042, 5);
    put(lists.pants, sphLo, at(s * 0.12, 0.04, 0.49, 0.05, 0.04, 0.1));   // shoes
  });
  // shirt: a torso wider at the chest than the waist, flattened front to back, rounded shoulders, sleeves
  const torso = new T.CylinderGeometry(0.19 * M2Y, 0.155 * M2Y, 0.46 * M2Y, 7, 1, true); torso.scale(1, 1, 0.66);
  put(lists.shirt, torso, at(0, 0.73, -0.04, 1 / M2Y, 1 / M2Y, 1 / M2Y));
  put(lists.shirt, sphMid, at(0, 0.95, -0.04, 0.2, 0.075, 0.125));
  [-1, 1].forEach(function (s) {
    tube(lists.shirt, [s * 0.2, 0.93, -0.04], [s * 0.23, 0.68, 0.02], 0.05, 0.044, 5, s);
    // forearms resting toward the lap, and the hands
    tube(lists.skin, [s * 0.23, 0.68, 0.02], [s * 0.18, 0.58, 0.27], 0.038, 0.032, 5, s);
    put(lists.skin, sphLo, at(s * 0.175, 0.575, 0.295, 0.042, 0.03, 0.05), s);
  });
  // skin: neck and head (an adult head is about an eighth of the standing height)
  tube(lists.skin, [0, 0.97, -0.05], [0, 1.06, -0.04], 0.05, 0.047, 5);
  put(lists.skin, sphHead, at(0, 1.16, -0.03, 0.098, 0.12, 0.108));
  // hair, or a ball cap
  put(lists.hair, cap, at(0, 1.175, -0.045, 0.106, 0.11, 0.116));
  const out = {};
  for (const k in lists) {
    const L = lists[k]; let n = 0;
    L.forEach(function (p) { n += p.g.attributes.position.count; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), arm = new Float32Array(n);
    let o = 0;
    L.forEach(function (p) {
      const c = p.g.attributes.position.count;
      pos.set(p.g.attributes.position.array, o * 3); nor.set(p.g.attributes.normal.array, o * 3);
      arm.fill(p.arm, o, o + c); o += c;
    });
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(pos, 3));
    g.setAttribute("normal", new T.BufferAttribute(nor, 3));
    g.setAttribute("aArm", new T.BufferAttribute(arm, 1));
    g.computeBoundingSphere();
    out[k] = g;
  }
  return out;
}

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x0a1a5c, 1);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(36, W / H, 0.4, 4000);
  const caps = renderer.capabilities;
  const aniso = Math.min(8, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  TV = { a: new T.Vector3(), b: new T.Vector3(), d: new T.Vector3(), e: new T.Vector3(), p: new T.Vector3(), q: new T.Vector3(), up: new T.Vector3(0, 1, 0) };

  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = aniso;
    return t;
  }
  function decal(mat, order) { mat.transparent = true; mat.depthWrite = false; mat._order = order; mat.polygonOffset = true; mat.polygonOffsetFactor = -order; mat.polygonOffsetUnits = -order; return mat; }
  // The stadium past the goal line: x across, yP yards past the posts, z up. Three.js: (x, z, -yP).
  const park = new T.Group(); scene.add(park);
  function add(mesh, parent) { if (mesh.material && mesh.material._order) mesh.renderOrder = mesh.material._order; (parent || park).add(mesh); return mesh; }
  // A flat rectangle on the turf, x1..x2 across and y1..y2 yards past the posts. Texture "up" points away from the kicker.
  function flat(x1, x2, y1, y2, z, mat, su, sv) {
    const g = new T.PlaneGeometry(x2 - x1, y2 - y1);
    g.rotateX(-Math.PI / 2);
    if (su) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }
    const m = new T.Mesh(g, mat);
    m.position.set((x1 + x2) / 2, z, -(y1 + y2) / 2);
    return add(m);
  }

  const script = scriptCanvas(scriptImg);
  const tTurf = tex(turfCanvas(), true), tEZ = tex(endZoneCanvas(script)), tWall = tex(wallCanvas(script), true), tSeat = tex(seatCanvas(), true);
  const tSky = tex(skyCanvas()), tSkyline = tex(skylineCanvas(), true), tLamp = tex(lampCanvas()), tGlow = tex(glowCanvas()), tShadow = tex(shadowCanvas());
  const tMid = tex(scriptDecal(script, 1024, 512, 1)), tPad = tex(padCanvas(script)), tBall = tex(footballCanvas(script), true);
  const tFlag = tex(flagCanvas(script));
  const cBoard = mkCanvas(1024, 448), tBoard = tex(cBoard);
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;

  /* lights: a night game under the towers */
  scene.add(new T.HemisphereLight(0xffffff, 0x7f97d8, 1.35));
  const key = new T.DirectionalLight(0xffffff, 2.0);
  key.position.set(-60, 120, 40); scene.add(key);
  const fill = new T.DirectionalLight(0xdfeaff, 0.8);       // from behind the kicker, so the faces toward the camera never go flat
  fill.position.set(40, 40, 120); scene.add(fill);

  /* sky, skyline, the ground outside the stadium (these stay put; the stadium slides inside them) */
  const sky = new T.Mesh(new T.SphereGeometry(2600, 24, 12), new T.MeshBasicMaterial({ map: tSky, side: T.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -2; scene.add(sky);
  const lineGeo = new T.CylinderGeometry(1200, 1200, 150, 48, 1, true);
  (function () { const uv = lineGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 9); })();
  const skyline = new T.Mesh(lineGeo, new T.MeshBasicMaterial({ map: tSkyline, side: T.BackSide, transparent: true, alphaTest: 0.5 }));
  skyline.position.y = 68; scene.add(skyline);
  const lot = new T.Mesh(new T.CircleGeometry(1300, 40).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x0c1440 }));
  lot.position.y = -0.3; scene.add(lot);

  /* the field */
  const turfGeo = new T.PlaneGeometry(96, 170, 1, 1).rotateX(-Math.PI / 2);
  (function () {                                           // turf bands: tile edges on the goal line, a band change every 5 yards
    const p = turfGeo.attributes.position, uv = turfGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 10, (-(p.getZ(i) - 75) + EZ) / 10);
  })();
  const turf = new T.Mesh(turfGeo, new T.MeshLambertMaterial({ map: tTurf }));
  turf.position.z = 75; park.add(turf);                    // yP from -160 to +10, past the wall
  flat(-FIELD_HALF, FIELD_HALF, -EZ, 0, 0.01, decal(new T.MeshLambertMaterial({ map: tEZ }), 1));
  flat(-10, 10, -65, -55, 0.012, decal(new T.MeshLambertMaterial({ map: tMid, opacity: 0.9 }), 1));   // the wordmark at the 50

  // the lines, one mesh: yard lines, goal lines, end lines, sidelines, hash marks and the try line
  (function () {
    const pos = [], idx = [];
    function quad(x1, x2, y1, y2) {
      const b = pos.length / 3;
      pos.push(x1, 0, -y1, x2, 0, -y1, x2, 0, -y2, x1, 0, -y2);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const goal = -EZ, far = -EZ - 100;
    for (let y = goal; y >= far; y -= 5) { const w = y === goal || y === far ? 0.11 : 0.08; quad(-FIELD_HALF, FIELD_HALF, y - w, y + w); }
    quad(-FIELD_HALF, FIELD_HALF, -0.08, 0.08); quad(-FIELD_HALF, FIELD_HALF, far - EZ - 0.08, far - EZ + 0.08);
    [-1, 1].forEach(function (s) {
      quad(s > 0 ? FIELD_HALF : -FIELD_HALF - 2, s > 0 ? FIELD_HALF + 2 : -FIELD_HALF, far - EZ - 2, 2);   // the white border
      for (let y = goal - 1; y > far; y--) {
        if ((y - goal) % 5 === 0) continue;
        quad(s > 0 ? HASH_X : -HASH_X - 0.67, s > 0 ? HASH_X + 0.67 : -HASH_X, y - 0.06, y + 0.06);
        quad(s > 0 ? FIELD_HALF - 1.0 : -FIELD_HALF + 0.33, s > 0 ? FIELD_HALF - 0.33 : -FIELD_HALF + 1.0, y - 0.06, y + 0.06);
      }
    });
    quad(-0.5, 0.5, goal - 2.06, goal - 1.94);
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new T.Mesh(g, decal(new T.MeshBasicMaterial({ color: 0xf4f4ec }), 2));
    m.position.y = 0.02; add(m);
  })();
  // yard numbers: 10 to 50 and back, both sides, arrows toward the nearer goal line
  (function () {
    const mats = {};
    for (let k = 1; k <= 9; k++) {
      const n = k <= 5 ? k * 10 : 100 - k * 10, y = -EZ - k * 10;
      [-1, 1].forEach(function (s) {
        const arrowToGoal = k < 5 ? true : k > 5 ? false : null;
        const id = n + "|" + s + "|" + arrowToGoal;
        // seen from the right sideline (s = 1) the near goal is to the reader's left
        if (!mats[id]) mats[id] = decal(new T.MeshLambertMaterial({ map: tex(numberCanvas(n, arrowToGoal == null ? null : (s > 0) === arrowToGoal)) }), 2);
        const g = new T.PlaneGeometry(4, 2).rotateX(-Math.PI / 2);
        const m = new T.Mesh(g, mats[id]);
        m.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;  // the tops of the numbers point toward the middle of the field
        m.position.set(s * (FIELD_HALF - 10), 0.015, -y);
        add(m);
      });
    }
  })();
  // pylons at the corners of the end zone
  const pylonMat = new T.MeshLambertMaterial({ color: 0xff8a1e }), pylonGeo = new T.BoxGeometry(0.12, 0.5, 0.12);
  [[-1, 0], [1, 0], [-1, -EZ], [1, -EZ]].forEach(function (p) { const m = new T.Mesh(pylonGeo, pylonMat); m.position.set(p[0] * FIELD_HALF, 0.25, -p[1]); park.add(m); });

  /* the padded wall, the LED facade and the stands behind the end zone */
  const padMat = new T.MeshPhongMaterial({ map: tWall, specular: 0x555555, shininess: 40, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.05 });
  const wallGeo = new T.PlaneGeometry(STAND_X * 2, WALL_H);
  (function () { const uv = wallGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * STAND_X * 2 / 16); })();
  const wall = new T.Mesh(wallGeo, padMat); wall.position.set(0, WALL_H / 2, -WALL_Y); park.add(wall);
  const yellowMat = new T.MeshLambertMaterial({ color: 0xffd21f }), darkMat = new T.MeshLambertMaterial({ color: 0x0a0f24 });
  const navyMat = new T.MeshLambertMaterial({ color: 0x16245e }), orangeMat = new T.MeshLambertMaterial({ color: 0xff9214 }), backMat = new T.MeshLambertMaterial({ color: 0x1b2f86 });
  const capBar = new T.Mesh(new T.BoxGeometry(STAND_X * 2, 0.16, 0.7), yellowMat); capBar.position.set(0, WALL_H + 0.08, -(WALL_Y + 0.3)); park.add(capBar);
  const facade = new T.Mesh(new T.PlaneGeometry(STAND_X * 2, STAND_Z - WALL_H), darkMat); facade.position.set(0, (STAND_Z + WALL_H) / 2, -(LED_Y + 0.12)); park.add(facade);
  const lip = new T.Mesh(new T.BoxGeometry(STAND_X * 2, 0.3, STAND_Y - LED_Y + 0.2), orangeMat); lip.position.set(0, STAND_Z - 0.15, -(LED_Y + STAND_Y) / 2); park.add(lip);

  /* LED ribbon board: a dark housing on the facade with the dot matrix on its face */
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);             // one texel per LED, never smoothed
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas());         // one LED lens, tiled; its mipmaps fade the dots out cleanly at a distance
  tDot.wrapS = tDot.wrapT = T.RepeatWrapping; tDot.anisotropy = aniso;
  const csChunk = T.ShaderChunk && T.ShaderChunk.colorspace_fragment ? "colorspace_fragment" : "encodings_fragment";
  const ledMat = new T.ShaderMaterial({
    uniforms: { tLed: { value: tLed }, tDot: { value: tDot }, grid: { value: new T.Vector2(LED_COLS, LED_ROWS) } },
    vertexShader: "varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
    fragmentShader: [
      "uniform sampler2D tLed;", "uniform sampler2D tDot;", "uniform vec2 grid;", "varying vec2 vUv;",
      "void main() {",
      "  vec2 cell = vUv * grid;",
      "  vec2 px = 1.0 / grid;",
      "  vec2 c0 = (floor(cell) + 0.5) * px;",                                   // every fragment of a cell reads that cell's one LED
      "  vec3 led = texture2D(tLed, c0).rgb;",
      "  vec3 halo = led;",                                                      // light bleeding from the neighbors: the glow
      "  halo += texture2D(tLed, c0 + px * vec2( 1.5,  1.5)).rgb + texture2D(tLed, c0 + px * vec2(-1.5,  1.5)).rgb;",
      "  halo += texture2D(tLed, c0 + px * vec2( 1.5, -1.5)).rgb + texture2D(tLed, c0 + px * vec2(-1.5, -1.5)).rgb;",
      "  halo += texture2D(tLed, c0 + px * vec2( 3.0,  0.0)).rgb + texture2D(tLed, c0 + px * vec2(-3.0,  0.0)).rgb;",
      "  halo += texture2D(tLed, c0 + px * vec2( 0.0,  3.0)).rgb + texture2D(tLed, c0 + px * vec2( 0.0, -3.0)).rgb;",
      "  halo /= 9.0;",
      "  float lens = texture2D(tDot, cell).r;",
      "  vec3 col = led * lens * 1.38 + halo * 0.34 + vec3(0.030, 0.034, 0.046) * lens + vec3(0.005, 0.006, 0.010);",
      "  gl_FragColor = vec4(col, 1.0);",
      "  #include <" + csChunk + ">",
      "}"
    ].join("\n")
  });
  const ledW = LED_COLS * LED_PITCH, ledH = LED_ROWS * LED_PITCH;
  const ledHouse = new T.Mesh(new T.BoxGeometry(ledW + 0.6, ledH + 0.5, 0.3), new T.MeshBasicMaterial({ color: 0x05070d }));
  ledHouse.position.set(0, LED_Z0 + ledH / 2, -(LED_Y + 0.05)); park.add(ledHouse);
  const ledFace = new T.Mesh(new T.PlaneGeometry(ledW, ledH), ledMat);
  ledFace.position.set(0, LED_Z0 + ledH / 2, -(LED_Y - 0.12)); park.add(ledFace);
  const pylonG = new T.BoxGeometry(0.7, ledH + 0.9, 0.5);  // the posts between the three sections of the board
  [-1, 1].forEach(function (s) { const m = new T.Mesh(pylonG, navyMat); m.position.set(s * LED_SEG * LED_PITCH / 2, LED_Z0 + ledH / 2, -(LED_Y - 0.2)); park.add(m); });

  /* the stands: rows of seats rising away from the field */
  (function () {
    const pos = [], nor = [], uv = [], idx = [], X = STAND_X;
    function band(y1, z1, y2, z2, v1, v2, u0, ny, nz) {
      const b = pos.length / 3;
      pos.push(-X, z1, -y1, X, z1, -y1, X, z2, -y2, -X, z2, -y2);
      for (let i = 0; i < 4; i++) nor.push(0, ny, nz);
      uv.push(u0, v1, u0 + X * 2 / 4.3, v1, u0 + X * 2 / 4.3, v2, u0, v2);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    for (let j = 0; j < ROWS; j++) {
      const y = STAND_Y + j * TREAD, z = STAND_Z + j * RISE;
      band(y, z, y, z + RISE, 0, 0.5, j * 0.37, 0, 1);          // the riser, facing the field
      band(y, z + RISE, y + TREAD, z + RISE, 0.5, 1, j * 0.37, 1, 0);   // the step
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    park.add(new T.Mesh(g, new T.MeshLambertMaterial({ map: tSeat })));
  })();
  const topY = STAND_Y + ROWS * TREAD, topZ = STAND_Z + ROWS * RISE;
  const backWall = new T.Mesh(new T.PlaneGeometry(STAND_X * 2, 2.2), navyMat); backWall.position.set(0, topZ + 1.1, -topY); park.add(backWall);
  const rail = new T.Mesh(new T.BoxGeometry(STAND_X * 2, 0.3, 0.4), orangeMat); rail.position.set(0, topZ + 2.3, -topY); park.add(rail);
  [-1, 1].forEach(function (s) {                            // the ends of the stand
    const shape = new T.Shape([new T.Vector2(LED_Y, 0), new T.Vector2(LED_Y, STAND_Z), new T.Vector2(STAND_Y, STAND_Z), new T.Vector2(topY, topZ), new T.Vector2(topY, topZ + 2.2), new T.Vector2(topY + 4, 0)]);
    const g = new T.ShapeGeometry(shape); g.rotateY(-Math.PI / 2);
    const m = new T.Mesh(g, new T.MeshLambertMaterial({ color: 0x122a78, side: T.DoubleSide }));
    m.position.x = s * STAND_X; m.scale.z = -1; park.add(m);
  });

  /* the crowd: instanced people in every seat that can be seen, one draw call per piece. They stand up and cheer on a make. */
  const crowdU = { uTime: { value: 0 }, uCheer: { value: 0 } };
  function cheering(mat) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = crowdU.uTime; sh.uniforms.uCheer = crowdU.uCheer;
      sh.vertexShader = "uniform float uTime;\nuniform float uCheer;\nattribute float aArm;\n" + sh.vertexShader.replace("#include <begin_vertex>",
        "#include <begin_vertex>\n#ifdef USE_INSTANCING\n" +
        "  float npPh = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;\n" +
        "  float npUp = uCheer * step(0.3, fract(npPh * 1.7));\n" +
        "  if (aArm != 0.0) {\n" +
        "    vec2 npPv = vec2(aArm * " + SHOULDER.x.toFixed(4) + ", " + SHOULDER.y.toFixed(4) + ");\n" +
        "    vec2 npD = transformed.xy - npPv;\n" +
        "    float npA = aArm * npUp * (2.45 + 0.3 * sin(uTime * 9.0 + npPh));\n" +
        "    float npC = cos(npA), npS = sin(npA);\n" +
        "    transformed.xy = npPv + vec2(npD.x * npC - npD.y * npS, npD.x * npS + npD.y * npC);\n" +
        "  }\n" +
        "  transformed.y += uCheer * (0.15 + 0.85 * abs(sin(uTime * 8.0 + npPh))) * 0.32;\n#endif");
    };
    return mat;
  }
  // only the seats the camera can ever see get a 3D fan (the lens is narrow: about 20 yards either side of the posts)
  const CROWD_X = 23, pieces = crowdPieces(T), fans = [], rnd = rng(77);
  const at = [];
  for (let j = 0; j < ROWS; j++) {
    const y = STAND_Y + (j + 0.45) * TREAD, z = STAND_Z + (j + 1) * RISE;
    for (let x = -CROWD_X + rnd() * 0.5; x < CROWD_X; x += 0.62 + rnd() * 0.12) if (rnd() < 0.86) at.push(x, z, -y);
  }
  const n = at.length / 3;
  const pal = { shirt: FAN_COLS, pants: PANT_COLS, skin: SKIN_COLS, hair: HAIR_COLS };
  const mm = new T.Matrix4(), qq = new T.Quaternion(), ss = new T.Vector3(), vv = new T.Vector3(), cc = new T.Color(), ee = new T.Euler();
  const mats = [];
  for (let i = 0; i < n; i++) {
    const k = 0.93 + rnd() * 0.14;
    ee.set(0, (rnd() - 0.5) * 0.5, 0); qq.setFromEuler(ee);
    mats.push(mm.compose(vv.set(at[i * 3], at[i * 3 + 1], at[i * 3 + 2]), qq, ss.set(k, k, k)).clone());
  }
  ["pants", "shirt", "skin", "hair"].forEach(function (k) {
    const im = new T.InstancedMesh(pieces[k], cheering(new T.MeshLambertMaterial({ color: 0xffffff })), n);
    const P = pal[k];
    for (let i = 0; i < n; i++) { im.setMatrixAt(i, mats[i]); im.setColorAt(i, cc.set(P[Math.floor(rnd() * P.length)])); }
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    park.add(im); fans.push(im);
  });

  /* light towers behind the stands */
  const lampMat = new T.MeshBasicMaterial({ map: tLamp }), poleMat = new T.MeshLambertMaterial({ color: 0x2b3566 });
  const glowMat = new T.SpriteMaterial({ map: tGlow, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 });
  const bankGeo = new T.BoxGeometry(13, 5.5, 1);
  [[-26, 48, 40], [26, 48, 40], [-48, 20, 36], [48, 20, 36]].forEach(function (tw) {
    const g = new T.Group(); g.position.set(tw[0], 0, -tw[1]); g.rotation.y = tw[0] * 0.012;
    const pole = new T.Mesh(new T.CylinderGeometry(0.45, 0.8, tw[2], 8), poleMat); pole.position.y = tw[2] / 2; g.add(pole);
    const bank = new T.Mesh(bankGeo, [poleMat, poleMat, poleMat, poleMat, lampMat, poleMat]); bank.position.set(0, tw[2] - 2, 0.6); g.add(bank);
    const glow = new T.Sprite(glowMat); glow.scale.set(42, 28, 1); glow.position.set(0, tw[2] - 2, 2); g.add(glow);
    park.add(g);
  });

  /* the scoreboard over the stands, with the flag flying off the top of it */
  const board = new T.Group(); board.position.set(0, 0, -BOARD.y);
  const boardFace = new T.MeshBasicMaterial({ map: tBoard });
  const boardSide = new T.MeshLambertMaterial({ color: 0x122a78 });
  const boardBox = new T.Mesh(new T.BoxGeometry(BOARD.half * 2, BOARD.z1 - BOARD.z0, 1.6), [boardSide, boardSide, boardSide, boardSide, boardFace, boardSide]);
  boardBox.position.set(0, (BOARD.z0 + BOARD.z1) / 2, 0); board.add(boardBox);
  const crown = new T.Mesh(new T.BoxGeometry(BOARD.half * 2 + 1.4, 0.8, 2.2), orangeMat); crown.position.set(0, BOARD.z1 + 0.35, 0); board.add(crown);
  [-8, 8].forEach(function (x) { const leg = new T.Mesh(new T.BoxGeometry(1.2, BOARD.z0, 1.2), boardSide); leg.position.set(x, BOARD.z0 / 2, -0.9); board.add(leg); });
  const flagPole = new T.Mesh(new T.CylinderGeometry(0.1, 0.12, 7, 8), new T.MeshPhongMaterial({ color: 0xf2f2f2, specular: 0xffffff, shininess: 80 }));
  flagPole.position.set(0, BOARD.z1 + 4.2, 0); board.add(flagPole);
  const FLAG_W = 5.6, FLAG_H = 3.5;
  const flagGeo = new T.PlaneGeometry(FLAG_W, FLAG_H, 12, 3); flagGeo.translate(FLAG_W / 2, 0, 0);
  const flagBase = Float32Array.from(flagGeo.attributes.position.array);
  tFlag.wrapS = T.RepeatWrapping;
  const flag = new T.Mesh(flagGeo, new T.MeshLambertMaterial({ map: tFlag, side: T.DoubleSide }));
  flag.position.set(0.1, BOARD.z1 + 7.6 - FLAG_H / 2, 0); board.add(flag);
  park.add(board);

  /* the goal post: padded base, gooseneck, crossbar, uprights, and a streamer on top of each upright */
  const postMat = new T.MeshPhongMaterial({ color: 0xffd21f, specular: 0xffffff, shininess: 110, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.16 });
  const post = new T.Group(); park.add(post);
  const pad = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 2.1, 24), new T.MeshPhongMaterial({ map: tPad, specular: 0x444444, shininess: 30 }));
  pad.position.set(0, 1.05, -2); pad.rotation.y = Math.PI; post.add(pad);
  const pole = new T.Mesh(new T.CylinderGeometry(0.13, 0.13, CROSSBAR - 1.2 - 2.1, 12), postMat);
  pole.position.set(0, 2.1 + (CROSSBAR - 1.2 - 2.1) / 2, -2); post.add(pole);
  const neckCurve = new T.CubicBezierCurve3(new T.Vector3(0, CROSSBAR - 1.2, -2), new T.Vector3(0, CROSSBAR - 0.1, -2), new T.Vector3(0, CROSSBAR, -1.1), new T.Vector3(0, CROSSBAR, 0));
  post.add(new T.Mesh(new T.TubeGeometry(neckCurve, 20, 0.12, 10, false), postMat));
  const cylX = new T.CylinderGeometry(0.075, 0.075, 1, 12); cylX.rotateZ(Math.PI / 2);
  const crossbar = new T.Mesh(cylX, postMat); crossbar.position.set(0, CROSSBAR, 0); post.add(crossbar);
  const upGeo = new T.CylinderGeometry(0.075, 0.075, POST_TOP - CROSSBAR, 12); upGeo.translate(0, (POST_TOP - CROSSBAR) / 2, 0);
  const uprights = [-1, 1].map(function () { const m = new T.Mesh(upGeo, postMat); m.position.y = CROSSBAR; post.add(m); return m; });
  const tipGeo = new T.SphereGeometry(0.09, 10, 6);
  const tips = [-1, 1].map(function () { const m = new T.Mesh(tipGeo, postMat); m.position.y = POST_TOP; post.add(m); return m; });
  const STR_W = 1, STR_H = 0.42;
  const strGeo = new T.PlaneGeometry(STR_W, STR_H, 10, 1); strGeo.translate(STR_W / 2, -STR_H / 2, 0);
  const strBase = Float32Array.from(strGeo.attributes.position.array);
  const strMat = new T.MeshLambertMaterial({ color: 0xff4b3e, side: T.DoubleSide, emissive: 0x401008 });
  const streamers = [-1, 1].map(function () { const m = new T.Mesh(strGeo, strMat); m.position.y = POST_TOP - 0.05; post.add(m); return m; });

  /* the people: the kicker beside the tee and a referee under each upright */
  const G = { sphere: new T.SphereGeometry(1, 16, 12), env: tEnv };
  G.cyl = new T.CylinderGeometry(0.86, 1, 1, 10, 1, true); G.cyl.translate(0, 0.5, 0);
  G.torso = new T.LatheGeometry([[0.5, -0.12], [0.56, 0.2], [0.6, 0.75], [0.7, 1.3], [0.76, 1.72], [0.63, 1.98], [0.3, 2.1], [0.2, 2.22]].map(function (p) { return new T.Vector2(p[0], p[1]); }), 18);
  G.belt = new T.CylinderGeometry(1, 0.98, 1, 16);
  G.dome = new T.SphereGeometry(1, 18, 9, 0, TAU, 0, Math.PI * 0.56);
  const ARC = 2.1;
  G.mask = new T.TorusGeometry(0.6, 0.035, 5, 14, ARC); G.mask.rotateX(Math.PI / 2); G.mask.rotateY(ARC / 2 - Math.PI / 2);
  const kicker = makePlayer(T, G, { jersey: tex(jerseyCanvas(script, "#1b56cf", "#ff9214", "3", "#ff9214")), sleeve: 0x1b56cf, pants: 0xf2efe6, sock: 0x1b56cf,
                                    skin: 0xd9a070, hat: 0x0d2a7a, stripe: 0xff9214, helmet: true, pads: true, beltCol: 0x0b1f5e });
  kicker.root.rotation.y = Math.PI;                        // facing downfield
  kicker.root.position.set(KICK_ROOT.x, 0, -KICK_ROOT.y);
  scene.add(kicker.root);
  const refJersey = tex(jerseyCanvas(script, "#f6f6f0", null, "", "#000", "#141418"));
  const refs = [-1, 1].map(function () {
    const r = makePlayer(T, G, { jersey: refJersey, sleeveMap: true, pants: 0xf2f2ee, sock: 0x141418, skin: 0xc68b59, hat: 0x141418, beltCol: 0x141418 });
    park.add(r.root);
    return r;
  });

  /* the tee and the ball */
  const tee = new T.Mesh(new T.CylinderGeometry(0.035, 0.09, TEE_TOP, 14), new T.MeshPhongMaterial({ color: 0xff6a2a, specular: 0xffffff, shininess: 80 }));
  tee.position.set(0, TEE_TOP / 2, 0); scene.add(tee);
  const prof = [];
  for (let i = 0; i <= 18; i++) { const u = i / 18 * 2 - 1; prof.push(new T.Vector2(Math.max(0.004, 0.093 * Math.pow(1 - u * u, 0.8)), u * 0.155)); }
  const ballGeo = new T.LatheGeometry(prof, 24);
  const ball = new T.Mesh(ballGeo, new T.MeshPhongMaterial({ map: tBall, specular: 0xffffff, shininess: 60, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.05 }));
  const ink = new T.Mesh(ballGeo, new T.MeshBasicMaterial({ color: 0x08205f, side: T.BackSide }));   // a dark rim, so the ball reads over anything
  ink.scale.setScalar(1.14); ball.add(ink);
  const halo = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: 0xfff2c0, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  halo.scale.setScalar(0.85); ball.add(halo);              // a soft glow in flight, so the ball reads against the crowd
  scene.add(ball);

  /* contact shadows */
  const shadowMat = decal(new T.MeshBasicMaterial({ map: tShadow, opacity: 0.55 }), 4);
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
  const ballShadow = add(new T.Mesh(unit, shadowMat.clone()), scene); ballShadow.material._order = 4; ballShadow.renderOrder = 4;
  const kickShadow = add(new T.Mesh(unit, shadowMat), scene); kickShadow.scale.set(1.3, 1, 1.1);
  const refShadows = refs.map(function () { const m = add(new T.Mesh(unit, shadowMat)); m.scale.set(1.2, 1, 1); return m; });

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, script: script, park: park,
    cBoard: cBoard, tBoard: tBoard, boardKey: "", flag: flag, flagGeo: flagGeo, flagBase: flagBase, tFlag: tFlag,
    crossbar: crossbar, uprights: uprights, tips: tips, streamers: streamers, strGeo: strGeo, strBase: strBase,
    kicker: kicker, refs: refs, ball: ball, halo: halo, tee: tee, ballShadow: ballShadow, kickShadow: kickShadow, refShadows: refShadows,
    fans: fans, crowdU: crowdU,
    camPos: new T.Vector3(0, 2.3, 11), camTgt: new T.Vector3(0, 3, -20), goalPos: new T.Vector3(), goalTgt: new T.Vector3(), fov: 36,
    v: new T.Vector3(), v2: new T.Vector3(), q: new T.Quaternion(), e: new T.Euler(),
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0,
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, fansOn: true, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
// pr = pixel ratio cap, fans = the 3D crowd (off: the people painted on the seats stand in)
const QUALITY = [{ pr: 2, fans: true }, { pr: 1.5, fans: true }, { pr: 1.15, fans: true }, { pr: 1, fans: false }];

function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  const on = QUALITY[R.quality].fans;
  if (on !== R.fansOn) { R.fansOn = on; for (let i = 0; i < R.fans.length; i++) R.fans[i].visible = on; }
  R.dirty = true;
}
function pixelRatio() { return Math.min(window.devicePixelRatio || 1, QUALITY[R.quality].pr); }

function watchFrameRate(ms) {
  if (R.qLock || R.quality >= QUALITY.length - 1 || ms > 250) return;
  if (R.warm < 45) { R.warm++; return; }                    // let shaders compile first
  R.slowSum += ms; R.slowN++;
  if (R.slowN < 60) return;
  const avg = R.slowSum / R.slowN;
  R.slowSum = 0; R.slowN = 0;
  if (avg > 24) {
    if (++R.slowHits >= 2) {                                // two slow seconds in a row, not one hiccup
      R.slowHits = 0;
      const before = pixelRatio();
      let q = R.quality + 1;
      while (q < QUALITY.length - 1 && Math.min(window.devicePixelRatio || 1, QUALITY[q].pr) === before && QUALITY[q].fans === R.fansOn) q++;
      setQuality(q);
    }
  } else R.slowHits = 0;
}

/* ---------------- Keep the WebGL canvas exactly under the shell's canvas ---------------- */
function layout() {
  const hud = R.hud, st = R.stage;
  const cw = hud.clientWidth, ch = hud.clientHeight;
  if (!cw || !ch) return false;
  const hr = hud.getBoundingClientRect(), sr = st.getBoundingClientRect();
  const left = Math.round((hr.left - sr.left - st.clientLeft + hud.clientLeft + st.scrollLeft) * 100) / 100;
  const top = Math.round((hr.top - sr.top - st.clientTop + hud.clientTop + st.scrollTop) * 100) / 100;
  const pr = pixelRatio();
  if (cw !== R.cw || ch !== R.ch || pr !== R.pr) {
    R.cw = cw; R.ch = ch; R.pr = pr;
    R.renderer.setPixelRatio(pr);
    R.renderer.setSize(cw, ch, false);
    R.gl.style.width = cw + "px"; R.gl.style.height = ch + "px";
    R.dirty = true;
  }
  if (left !== R.left || top !== R.top) {
    R.left = left; R.top = top;
    R.gl.style.left = left + "px"; R.gl.style.top = top + "px";
  }
  return true;
}

function camShake(mag, dur) {
  if (!R || Shell.reduced) return;
  R.shakeMag = mag; R.shakeDur = R.shakeT = dur;
}

// Field point (yards: x across, y downfield from the ball, z up) -> HUD pixels.
function toScreen(x, y, z) {
  R.v.set(x, z, -y);
  const d = R.v.distanceTo(R.camera.position);
  R.v.project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1, d: d };
}

/* ---------------- The camera: behind the kicker, framed for the kick ----------------
   The ball always sits low in the frame and the tops of the uprights just under the score bar, at any
   distance, seen from a little above the kicker's shoulder. Farther kicks get a longer lens, and the camera backs off to match, so the kicker stays one size
   while the posts stay big enough to aim at. */
const FRAME = { ball: 452, top: 68, topZ: POST_TOP + 0.3 };
function frameCam(D) {
  const u1 = (H / 2 - FRAME.ball) / (H / 2);
  function at(f) {
    const k = Math.tan(f * DEG / 2), back = CAM_K / k, h = BALL_TEE_Z + CAM_RISE * back;
    const p = Math.atan2(BALL_TEE_Z - h, back) - Math.atan(u1 * k);
    const aTop = Math.atan2(FRAME.topZ - h, D + back);
    return { f: f, back: back, h: h, p: p, y: H / 2 - Math.tan(aTop - p) / k * H / 2 };
  }
  let lo = 18, hi = 44, r = at(lo);
  if (r.y >= FRAME.top) return r;
  r = at(hi);
  if (r.y <= FRAME.top) return r;
  for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; r = at(mid); if (r.y < FRAME.top) lo = mid; else hi = mid; }
  return r;
}

/* ---------------- Game state -> meshes ---------------- */
function syncScene(state, fdt) {
  const idle = state === "title" || state === "over";
  const t = idle ? idleT : S.t, calm = Shell.reduced;
  R.clock += fdt;
  ledTick(fdt);

  /* the stadium slides back after a make (and is exactly where the rules have it while a ball is in the air) */
  if (V.snap || S.phase === "flight") { V.D = S.D; V.snap = false; }
  else V.D += (S.D - V.D) * Math.min(1, fdt * (calm ? 30 : 6));
  R.park.position.z = -V.D;

  /* the posts close in past 50, and the streamers show the wind */
  const hw = halfWidth(V.D), wind = windAt(t), dir = wind >= 0 ? 1 : -1;
  R.crossbar.scale.x = hw * 2 + 0.15;
  for (let s = 0; s < 2; s++) {
    const x = (s ? 1 : -1) * hw;
    R.uprights[s].position.x = x; R.tips[s].position.x = x;
    R.streamers[s].position.x = x;
    R.streamers[s].scale.set(dir * (0.9 + Math.abs(wind) * 0.12), 1, 1);
  }
  {
    const p = R.strGeo.attributes.position, base = R.strBase, sp = 7 + Math.abs(wind) * 0.35, amp = calm ? 0 : 1;
    for (let i = 0; i < p.count; i++) {
      const fx = base[i * 3];
      p.setZ(i, Math.sin(fx * 6 - R.clock * sp) * fx * 0.16 * amp);
      p.setY(i, base[i * 3 + 1] + Math.sin(fx * 5 - R.clock * sp * 0.8) * fx * 0.06 * amp - fx * fx * Math.max(0, 0.25 - Math.abs(wind) * 0.02));
    }
    p.needsUpdate = true;
  }
  /* the flag over the scoreboard, flying with the same wind; its lettering always reads the right way round */
  {
    R.flag.scale.x = dir;
    R.tFlag.repeat.x = dir; R.tFlag.offset.x = dir < 0 ? 1 : 0;
    const p = R.flagGeo.attributes.position, base = R.flagBase, sp = 4 + Math.abs(wind) * 0.25;
    const droop = Math.max(0, 1 - Math.abs(wind) / 8);
    for (let i = 0; i < p.count; i++) {
      const fx = base[i * 3], fy = base[i * 3 + 1], k = fx / 5.6;
      p.setZ(i, calm ? 0 : Math.sin(fx * 1.1 - R.clock * sp) * k * 0.55);
      p.setX(i, fx * (1 - droop * 0.35));
      p.setY(i, fy - k * k * droop * 1.4);
    }
    p.needsUpdate = true;
  }

  /* scoreboard */
  const bk = S.D + "|" + S.makes + "|" + S.longest + "|" + S.strikes;
  if (bk !== R.boardKey) { R.boardKey = bk; paintBoard(R.cBoard.getContext("2d"), R.script); R.tBoard.needsUpdate = true; }

  /* the referees: arms straight up for a make, waved across for a miss */
  V.refT += fdt;
  for (let s = 0; s < 2; s++) {
    const r = R.refs[s], sg = s ? 1 : -1;
    if (V.ref === "good") mixPose(REF_STAND, REF_GOOD, smooth(V.refT / 0.22), poseB);
    else if (V.ref === "nogood") {
      mixPose(REF_WAVE_A, REF_WAVE_B, calm ? 0.5 : 0.5 + 0.5 * Math.sin(V.refT * 9), poseA);
      mixPose(REF_STAND, poseA, smooth(V.refT / 0.2), poseB);
    } else {
      for (let n = 0; n < REF_STAND.length; n++) poseB[n] = REF_STAND[n];
      if (!calm) poseB[1] += Math.sin(R.clock * 1.8 + s) * 0.02;
    }
    applyPose(r, poseB);
    r.root.position.set(sg * (hw + 1.25), 0, -1.2);
    r.root.rotation.y = -sg * 0.18;
    R.refShadows[s].position.set(sg * (hw + 1.25), 0.03, -1.2);
  }

  /* the kicker: waits beside the tee, steps up while you swipe or hold, swings through, then walks back */
  if (!idle && S.phase === "aim" && V.kick >= 0) { V.kick = -1; V.back = 0; }
  if (V.kick >= 0) {
    V.kick += fdt;
    const k = V.kick;
    if (k < 0.14) mixPose(KICK_HIT, KICK_FOLLOW, smooth(k / 0.14), poseB);
    else mixPose(KICK_FOLLOW, KICK_LAND, smooth((k - 0.14) / 0.5), poseB);
    V.plant = 0;
  } else {
    V.back = (V.back == null ? 1 : V.back) + fdt;
    if (V.back < 0.8) mixPose(KICK_LAND, KICK_READY, smooth(V.back / 0.8), poseA);
    else for (let n = 0; n < KICK_READY.length; n++) poseA[n] = KICK_READY[n];
    if (!calm) { poseA[1] += Math.sin(R.clock * 2.2) * 0.025; poseA[18] += Math.sin(R.clock * 0.7) * 6; }
    const want = !idle && (S.drag || S.charging) ? 1 : 0;
    V.plant += (want - V.plant) * Math.min(1, fdt * 7);
    mixPose(poseA, KICK_PLANT, smooth(V.plant) * 0.85, poseB);
  }
  applyPose(R.kicker, poseB);
  R.kickShadow.position.set(KICK_ROOT.x - poseB[0] / 3, 0.03, -KICK_ROOT.y - poseB[2] / 3);

  /* the ball: on the tee, or tumbling end over end along the rules' own flight */
  const b = idle ? null : S.ball, ball = R.ball;
  if (b) {
    ball.position.set(b.x, b.z, -b.y);
    ball.rotation.set(0.22 + b.spin, 0, 0);
    ball.scale.setScalar(1.25 + Math.min(1.35, b.y / 14));
    R.halo.material.opacity = calm ? 0.35 : clamp(b.y / 6, 0, 1) * 0.75;
    ball.visible = b.y < S.D + STAND_Y + 30;
    if (state === "playing") {
      const tr = V.trail;
      if (!tr.length || Math.abs(tr[tr.length - 1][1] - b.y) > 0.5) { tr.push([b.x, b.y, b.z]); if (tr.length > 26) tr.shift(); }
    }
  } else {
    ball.position.set(0, BALL_TEE_Z, 0);
    ball.rotation.set(0.22, idle && !calm ? Math.sin(idleT * 0.6) * 0.4 : 0, 0);
    ball.scale.setScalar(1);
    ball.visible = true;
    R.halo.material.opacity = 0;
  }
  const bs = R.ballShadow, onField = ball.visible && ball.position.z > -(S.D + WALL_Y);
  bs.visible = onField;
  if (onField) {
    const hgt = Math.max(0, ball.position.y - 0.15), sk = clamp(1 - hgt / 18, 0.25, 1);
    bs.position.set(ball.position.x, 0.03, ball.position.z);
    bs.scale.set(0.42 * ball.scale.x / sk, 1, 0.42 * ball.scale.x / sk);
    bs.material.opacity = 0.55 * sk;
  }

  /* the crowd stands up for a make */
  const cheer = !idle && S.phase === "flight" && S.result && S.result.good ? 1 : 0;
  V.cheer += (cheer - V.cheer) * Math.min(1, fdt * 5);
  R.crowdU.uTime.value = R.clock; R.crowdU.uCheer.value = calm ? 0 : V.cheer;

  /* camera */
  const fc = frameCam(V.D);
  let px = 0, tx = 0;
  if (idle && !calm) { px = Math.sin(idleT * 0.4) * 0.8; tx = px * 0.4; }
  if (b && state !== "title") { px = clamp(b.x * 0.12, -1, 1); tx = clamp(b.x * 0.35, -3, 3); }     // leans after a ball blowing wide, never far enough to lose the posts
  R.goalPos.set(px, fc.h, fc.back);
  R.goalTgt.set(tx, fc.h + Math.tan(fc.p) * 60, fc.back - 60);
  const kk = 1 - Math.exp(-(b ? 4 : 8) * fdt);
  if (!R.camInit) { R.camPos.copy(R.goalPos); R.camTgt.copy(R.goalTgt); R.camInit = true; }
  else { R.camPos.lerp(R.goalPos, kk); R.camTgt.lerp(R.goalTgt, kk); }
  R.camPos.y = fc.h; R.camPos.z = fc.back;                  // distance and height always match the lens exactly
  R.camTgt.y = R.goalTgt.y; R.camTgt.z = R.goalTgt.z;
  if (Math.abs(R.camera.fov - fc.f) > 1e-3) { R.camera.fov = fc.f; R.camera.updateProjectionMatrix(); }
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (vrand() * 2 - 1) * m; sy = (vrand() * 2 - 1) * m;
  }
  R.camera.position.set(R.camPos.x + sx, R.camPos.y + sy, R.camPos.z);
  R.camera.lookAt(R.camTgt.x + sx, R.camTgt.y + sy, R.camTgt.z);
  R.camera.updateMatrixWorld();
}
// After the follow through: both feet down, watching the ball.
const KICK_LAND = [-0.15, 2.95, 2.4, -6, -8, 2, 1.25, 3.0, 2.6, -1.35, 3.0, 2.6, 0.25, 0.2, 2.7, -0.75, 0.2, 3.3, 0];

/* ---------------- HUD (2D canvas on top) ---------------- */
function txt(c, s, x, y, size, color, align, shadow) {
  c.font = "bold " + size + "px " + HUD_FONT;
  c.textAlign = align || "left"; c.textBaseline = "top";
  if (shadow) { c.fillStyle = shadow; c.fillText(s, x + 1, y + 1); }
  c.fillStyle = color; c.fillText(s, x, y);
}
function rrect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// Things pinned to the 3D view: the ball's trail, and the swipe hint before the first kick.
function drawWorld(c, state) {
  const tr = V.trail;
  if (S.ball && tr.length > 1) {                            // a fading ribbon behind the ball
    const pts = [];
    for (let i = 0; i < tr.length; i++) { const p = toScreen(tr[i][0], tr[i][1], tr[i][2]); if (p.ok) pts.push(p); }
    const bp = toScreen(S.ball.x, S.ball.y, S.ball.z);
    if (bp.ok) pts.push(bp);
    c.lineCap = "round"; c.lineJoin = "round";
    for (let i = 1; i < pts.length; i++) {
      const k = i / pts.length;
      c.lineWidth = 1 + 3 * k; c.strokeStyle = "rgba(8,32,95," + (0.35 * k).toFixed(3) + ")";
      c.beginPath(); c.moveTo(pts[i - 1].x, pts[i - 1].y); c.lineTo(pts[i].x, pts[i].y); c.stroke();
      c.lineWidth = 0.5 + 1.6 * k; c.strokeStyle = "rgba(255,246,200," + (0.15 + 0.7 * k).toFixed(3) + ")";
      c.beginPath(); c.moveTo(pts[i - 1].x, pts[i - 1].y); c.lineTo(pts[i].x, pts[i].y); c.stroke();
    }
  }
  if (state === "playing" && S.phase === "aim" && S.attempts === 0 && !S.drag && !S.charging && !Shell.reduced) {
    const p = toScreen(0, 0, BALL_TEE_Z), u = (S.t * 1.4) % 1;
    for (let i = 0; i < 3; i++) {
      const k = (u + i / 3) % 1, y = p.y - 22 - k * 54, a = Math.sin(k * Math.PI);
      c.globalAlpha = a; c.lineWidth = 3; c.lineJoin = "round"; c.lineCap = "round";
      c.strokeStyle = "#08205f"; c.beginPath(); c.moveTo(p.x - 10, y + 7); c.lineTo(p.x, y); c.lineTo(p.x + 10, y + 7); c.stroke();
      c.lineWidth = 1.6; c.strokeStyle = "#ffe45c"; c.beginPath(); c.moveTo(p.x - 10, y + 7); c.lineTo(p.x, y); c.lineTo(p.x + 10, y + 7); c.stroke();
    }
    c.globalAlpha = 1;
    txt(c, "SWIPE UP THROUGH THE BALL", W / 2, Math.min(H - 18, p.y + 22), 11, "#ffffff", "center", "#08205f");
  }
}

function drawAim(c) {
  const s = S.drag ? swipe(S.drag) : null;
  const a = s ? s.a : S.aim, pw = s ? s.p : (S.charging ? S.power : -1);
  // the line the ball leaves on (wind and hook not included, as in the 2D game)
  for (let y = 2; y < S.D; y += 2) {
    const p = toScreen(Math.sin(a) * y, y, 0.05);
    if (!p.ok) continue;
    const r = clamp(46 / p.d, 0.9, 2.6), last = y + 2 >= S.D;
    c.fillStyle = "rgba(8,32,95,.55)"; c.beginPath(); c.arc(p.x, p.y, r + 0.9, 0, TAU); c.fill();
    c.fillStyle = last ? "#ffd23f" : "rgba(255,255,255,.92)"; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.fill();
  }
  if (S.drag) {                                             // the finger's stroke
    c.lineCap = "round";
    c.lineWidth = 5; c.strokeStyle = "rgba(8,32,95,.45)"; c.beginPath(); c.moveTo(S.drag.sx, S.drag.sy); c.lineTo(S.drag.x, S.drag.y); c.stroke();
    c.lineWidth = 2; c.strokeStyle = "rgba(255,255,255,.75)"; c.beginPath(); c.moveTo(S.drag.sx, S.drag.sy); c.lineTo(S.drag.x, S.drag.y); c.stroke();
  }
  // power meter: the green notch clears the bar on a calm day, the red zone overkicks
  const x = 16, top = 300, hgt = 160;
  rrect(c, x - 3, top - 3, 20, hgt + 6, 6); c.fillStyle = "rgba(8,32,95,.82)"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = "#ffffff"; c.stroke();
  c.save(); rrect(c, x, top, 14, hgt, 4); c.clip();
  c.fillStyle = "#12296e"; c.fillRect(x, top, 14, hgt);
  c.fillStyle = "rgba(255,59,46,.42)"; c.fillRect(x, top, 14, hgt * (P_MAX - 1) / P_MAX);
  const need = neededPower(S.D);
  if (pw >= 0) {
    const pc = clamp(pw, 0, P_MAX) / P_MAX;
    c.fillStyle = pw > 1 ? "#ff3b2e" : pw >= need ? "#9bff3f" : "#ffd21f";
    c.fillRect(x, top + hgt * (1 - pc), 14, hgt * pc);
  }
  c.fillStyle = "rgba(255,255,255,.3)"; c.fillRect(x + 2, top, 3, hgt);
  c.restore();
  const ny = top + hgt * (1 - need / P_MAX);
  c.fillStyle = "#08205f"; c.fillRect(x - 6, ny - 2, 26, 4);
  c.fillStyle = "#9bff3f"; c.fillRect(x - 5, ny - 1, 24, 2);
  txt(c, "PWR", x + 7, top + hgt + 7, 9, "#ffffff", "center", "#08205f");
}

function drawHUD(c, state, t) {
  const bg = c.createLinearGradient(0, 0, 0, 54);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, 0, W, 54);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff9214"; c.fillRect(0, 54, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, 56, W, 1);
  // score and strikes
  txt(c, "SCORE", 10, 5, 9, "#a8ecff", "left", "#08205f");
  txt(c, S.total + " YDS", 10, 17, 16, "#ffe45c", "left", "#08205f");
  txt(c, "STRIKES", 10, 40, 8, "#a8ecff", "left", "#08205f");
  for (let i = 0; i < STRIKES; i++) {
    const on = i < S.strikes, bx = 56 + i * 12;
    rrect(c, bx, 39, 10, 10, 2); c.fillStyle = on ? "#ff3b2e" : "rgba(8,32,95,.75)"; c.fill();
    c.lineWidth = 1; c.strokeStyle = on ? "#ffffff" : "#6d86c4"; c.stroke();
    if (on) txt(c, "X", bx + 5, 40, 8, "#ffffff", "center");
  }
  // where this kick is from
  txt(c, "KICK FROM", W / 2, 5, 9, "#a8ecff", "center", "#08205f");
  txt(c, S.D + " YDS", W / 2, 17, 16, "#ffffff", "center", "#08205f");
  txt(c, "MADE " + S.makes + "   LONG " + (S.longest || "--"), W / 2, 40, 8, "#a8ecff", "center", "#08205f");
  // the wind flag
  const wind = windAt(t), mph = Math.round(Math.abs(wind)), dir = wind >= 0 ? 1 : -1;
  const gusty = S.wind.gust > 0.5;
  txt(c, gusty ? "GUSTY WIND" : "WIND", W - 8, 5, 9, gusty ? "#ffc1e0" : "#a8ecff", "right", "#08205f");
  const fx = W - 74, fy = 17;
  c.fillStyle = "#08205f"; c.fillRect(fx - 1, fy - 1, 4, 24);
  c.fillStyle = "#eceae2"; c.fillRect(fx, fy, 2, 22);
  const len = 8 + Math.min(34, Math.abs(wind) * 1.4), flap = Shell.reduced ? 0 : Math.sin(t * 7) * 2;
  c.beginPath(); c.moveTo(fx + 1, fy); c.lineTo(fx + 1 + dir * len, fy + 5 + flap); c.lineTo(fx + 1, fy + 11); c.closePath();
  c.lineWidth = 2.5; c.lineJoin = "round"; c.strokeStyle = "#08205f"; c.stroke();
  c.fillStyle = "#ff4b3e"; c.fill();
  txt(c, mph === 0 ? "CALM" : (dir > 0 ? "> " : "< ") + mph + " MPH", W - 8, 40, 9, "#ffffff", "right", "#08205f");
}

function draw(c, state) {
  Juke.pump();
  if (!R || !R.hud) return;
  const now = performance.now();
  let ms = now - R.lastT;
  R.lastT = now;
  if (!(ms > 0)) ms = 0;
  const sized = layout();
  if (state === "paused" && !R.dirty) return;              // nothing moves while paused: leave the last frame up
  if (state === "playing") watchFrameRate(ms);
  const fdt = state === "paused" ? 0 : Math.min(ms, 50) / 1000;
  if (sized) {
    syncScene(state, fdt);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  const t = (state === "title" || state === "over") ? idleT : S.t;
  c.clearRect(-24, -24, W + 48, H + 48);
  if (state === "playing") drawWorld(c, state);
  if (state === "playing" && S.phase === "aim") drawAim(c);
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    c.save(); c.translate(q.x, q.y); c.rotate(q.rot);
    c.globalAlpha = clamp(q.life * 2, 0, 1);
    c.fillStyle = q.c; c.fillRect(-2.5, -1.5, 5, 3);
    c.restore();
  }
  c.globalAlpha = 1;
  drawHUD(c, state, t);
}

/* ---------------- Splash, boot, shell hookup ---------------- */
function makeSplash() {
  const el = document.createElement("div");
  el.id = "npg-splash";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Nostalgia Pro Games");
  el.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;z-index:9999;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;gap:18px;padding:24px;box-sizing:border-box;text-align:center;" +
    "background:radial-gradient(circle at 50% 42%,#21429c 0%,#0f2057 52%,#070d28 100%);" +
    "font:bold 15px/1.5 " + HUD_FONT.replace(/"/g, "'") + ";color:#ffffff;opacity:1;transition:opacity .35s ease";
  const img = document.createElement("img");
  img.alt = "";
  img.decoding = "async";
  img.style.cssText = "display:block;width:min(66vw,44vh,340px);height:auto;opacity:0;transform:scale(.86);" +
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "transition:opacity .2s ease" : "transition:opacity .28s ease,transform .55s cubic-bezier(.2,1.5,.4,1)");
  el.appendChild(img);
  document.body.appendChild(el);
  return { el: el, img: img };
}

function splashFail(splash, lines) {
  const el = splash.el;
  splash.img.style.width = "min(40vw,26vh,180px)";
  el.setAttribute("role", "alert");
  el.removeAttribute("aria-label");
  const p = document.createElement("p");
  p.style.cssText = "margin:0;max-width:30em";
  p.textContent = lines;
  const a = document.createElement("a");
  a.href = "../"; a.textContent = "Back to the arcade";
  a.style.cssText = "color:#ffe45c";
  el.appendChild(p); el.appendChild(a);
}
function splashGone(splash) {
  splash.el.style.opacity = "0";
  splash.el.style.pointerEvents = "none";
  setTimeout(function () { if (splash.el.parentNode) splash.el.parentNode.removeChild(splash.el); }, 420);
}

function loadLogo(splash) {
  return new Promise(function (resolve) {
    const img = splash.img;
    let done = false;
    function fin(ok) {
      if (done) return; done = true;
      if (ok) { img.style.opacity = "1"; img.style.transform = "scale(1)"; }
      else {                                                // no logo file: plain lettering holds the splash
        img.style.display = "none";
        const t = document.createElement("div");
        t.textContent = "Nostalgia Pro Games";
        t.style.cssText = "font:italic 900 34px/1.2 Georgia,'Times New Roman',serif;color:#f6e8c8;text-shadow:0 3px 0 #12224f";
        splash.el.insertBefore(t, splash.el.firstChild);
      }
      resolve(ok ? img : null);
    }
    img.onload = function () { fin(true); };
    img.onerror = function () { fin(false); };
    setTimeout(function () { fin(false); }, 6000);
    img.src = LOGO_URL;
  });
}

function loadImage(url) {
  return new Promise(function (resolve) {
    const img = new Image();
    let done = false;
    function fin(ok) { if (done) return; done = true; resolve(ok ? img : null); }
    img.onload = function () { fin(true); };
    img.onerror = function () { fin(false); };
    setTimeout(function () { fin(false); }, 6000);
    img.src = url;
  });
}

// No WebGL, or the 3D engine did not load: hand the page to the classic 2D game if it is on the server.
function loadClassic() {
  return new Promise(function (resolve, reject) {
    const s = document.createElement("script");
    s.src = FALLBACK_URL;
    s.onload = function () { if (window.Shell && Shell.state && Shell.state() !== "boot") resolve(); else reject(new Error("classic game did not start")); };
    s.onerror = function () { reject(new Error("no classic game")); };
    document.body.appendChild(s);
  });
}

function attach() {
  const hud = document.getElementById("np-canvas"), stage = document.getElementById("np-stage");
  R.hud = hud; R.stage = stage;
  if (getComputedStyle(stage).position === "static") stage.style.position = "relative";
  const gl = R.gl;
  gl.style.cssText = "position:absolute;left:0;top:0;z-index:0;display:block;margin:0;padding:0;border:0;box-shadow:none;" +
    "max-width:none;max-height:none;transform:none;image-rendering:auto;pointer-events:none;touch-action:none;" +
    "border-radius:" + getComputedStyle(hud).borderRadius;
  stage.insertBefore(gl, hud);
  // the shell canvas becomes a clear HUD layer over the 3D view
  hud.style.background = "transparent";
  hud.style.touchAction = "none";                            // a swipe up must never turn into a page scroll on a phone
  if (getComputedStyle(hud).position === "static") hud.style.position = "relative";   // so it stacks above the WebGL canvas
  const crt = stage.querySelector(".np-crt");
  if (crt) crt.style.display = "none";                       // glossy stadium, no scanlines
  R.lastT = performance.now();
  layout();
}

function logoImg(cls) {
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96; im.className = cls;
  im.style.cssText = "display:block;width:clamp(64px,14vh,108px);height:auto;margin:0 auto 6px";
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_URL;
  return im;
}

function startGame() {
  Shell.init({
    slug: "fourth-and-collect",
    title: "FOURTH AND COLLECT",
    accent: "#9bff3f",
    width: W, height: H,
    format: function (n) { return n + " YDS"; },
    howTo: "Split the uprights from farther and farther back, in real 3D. Swipe up through the ball: a longer swipe kicks harder, the angle aims. Watch the wind flag.",
    keys: "Keys: left and right aim, hold Space for power, release to kick. P pause, M mute, N music, R restart.",
    tip: "The green notch on the power bar clears the bar on a calm day. Red means you overkicked it.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { keys = {}; S.drag = null; S.charging = false; }
  });
  attach();
  // Sound. Nothing is created until the first tap, click or key press; the band starts with the game.
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Juke.unlock, true); });
  Shell.onStart(Juke.newGame); Shell.onRestart(Juke.newGame); Shell.onResume(Juke.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));   // not while initials are being typed
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Juke.toggleMusic();
  });
  // The studio logo heads the title card and the score card; the music button sits on the title and pause cards.
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) { titleCard.insertBefore(logoImg("npg-logo-title"), titleCard.firstChild); Juke.button(titleCard, titleCard.querySelector(".np-tip")); }
  if (pauseActions) Juke.button(pauseActions, pauseActions.querySelector("a"));
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) card.insertBefore(logoImg("npg-logo-over"), card.firstChild);
}

// Hook for automated checks (no effect on play)
window.__fourth = { S: function () { return S; }, kick: kick, stepBall: stepBall, windAt: windAt, neededPower: neededPower, halfWidth: halfWidth,
                    gfx: function () { return R; }, led: function () { return LED; }, view: function () { return V; }, toScreen: toScreen,
                    frameCam: frameCam, juke: Juke, startMusic: startMusic };

(function boot() {
  const splash = makeSplash();
  const t0 = performance.now();
  const q = /[?&]gfx=(high|low|2d)/.exec(location.search);
  let started = false;
  Promise.all([loadLogo(splash),
               q && q[1] === "2d" ? Promise.reject(Object.assign(new Error("2D asked for"), { npStage: "webgl" }))
                                  : import(THREE_URL).then(null, function (e) { e.npStage = "three"; throw e; }),
               loadImage(SCRIPT_URL)])
    .then(function (res) {
      THREE = res[1];
      try { R = buildScene(THREE, res[2]); } catch (e) { e.npStage = "webgl"; throw e; }
      if (q) { R.qLock = true; setQuality(q[1] === "low" ? QUALITY.length - 1 : 0); }
      reset();
      try { R.renderer.compile(R.scene, R.camera); } catch (e) { /* warm-up only */ }
      // hold the logo for a beat, then hand over to the title card
      const hold = Math.max(0, 1300 - (performance.now() - t0));
      return new Promise(function (r) { setTimeout(r, hold); });
    })
    .then(function () {
      started = true;
      startGame();
      splashGone(splash);
    })
    .catch(function (e) {
      console.error(e);
      if (started) return;
      R = null;
      loadClassic().then(function () { splashGone(splash); }, function () {
        splashFail(splash, e && e.npStage === "three"
          ? "Fourth and Collect could not load its 3D engine (" + THREE_URL + ")."
          : "Fourth and Collect needs WebGL for its 3D stadium, and this browser has it switched off or does not support it.");
      });
    });
})();
