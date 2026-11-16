/* BLEACHER CARTS (3D): 20 pitches. Time your swing and knock carts into the cheap seats.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of input, scaling and the title / pause / game over flow, and carries the HUD.

   The rules, the timing windows, the scoring, the controls and the trophies are the 2D game's,
   unchanged: the same code decides every pitch and every swing. Only the picture is new.
   The ballpark is laid out in feet. A spot r feet from home plate at an angle a (0 = dead
   center, + = right field) sits in three.js space at (r sin a, height, -r cos a). The players,
   the plate and the ball are drawn 1.6x life size so they read on a phone. */

const W = 360, H = 540, TAU = Math.PI * 2, DEG = Math.PI / 180;
const BASE_PITCHES = 20;
const PERFECT = 0.026, GOOD = 0.056, WEAK = 0.09, TIP = 0.12;
// The tap starts the swing; the bat reaches the hitting zone SWING_T later. Timing is judged on where the ball is
// at that moment (0 = crossing the front of the plate), and the hit happens when bat and ball actually meet:
// a little out in front of the plate on an early swing, a little deep on a late one (MEET of the timing error).
const SWING_T = 0.17, MEET = 0.35;

/* ---------------- Ballpark (feet) ---------------- */
const PS = 1.6;                                           // player scale
const WALL_H = 12;                                        // the padded outfield wall
const LED_Y0 = 13.5, LED_HT = 21;                         // the ribbon board on the facade above it
const DECK_Y = 36, DECK_TOP = 72, DECK_IN = 3, DECK_D = 85, ROWS = 15;   // the bleachers: fence + 3 to fence + 85
const TREAD = (DECK_D - DECK_IN) / ROWS, RISE = (DECK_TOP - DECK_Y) / ROWS, BACK_SLOPE = 1.2;
const SIDE_P = 70, SIDE_A0 = 45 + Math.acos(SIDE_P / 330) / DEG;         // the wall down each foul line, and the backstop
const SIDE_WALL = 9, SIDE_Y = 11, SIDE_TOP = 58, SIDE_D = 64, SIDE_ROWS = 12;
const SIDE_TREAD = (SIDE_D - 1.2) / SIDE_ROWS, SIDE_RISE = (SIDE_TOP - SIDE_Y) / SIDE_ROWS;
const SB = { r: 462, half: 73, y0: 74, y1: 110.5 };       // the scoreboard: dead center, |angle| < 9
const BALL_R = 0.42, ZONE_Y = 4.9, PLATE_Z = -1, MOUND_H = 1.3, MOUND_Z = -60.5;
const HIT0 = { y: 5.0, z: -1.3 };                         // where bat meets ball
const BRK_FT = 0.113;                                     // one 2D pixel of curveball break, in feet
const BAT_X = -4.9, BAT_Z = 0.4;
const CAM = { y: 12.9, z: 35.5, fov: 36, ty: 5.9, tz: -64.5 };           // behind the plate, over the catcher

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash and score card only
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every decal inside the park
const THREE_URL = "../shared/three.module.min.js";
const FALLBACK_URL = "game-2d.js";                        // optional: the classic 2D game, used if 3D cannot start
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';
const CONF_COLS = ["#ffd23f", "#3ff0ff", "#ff3fa4", "#9bff3f", "#ff9214", "#ffffff"];

let S = {}, keys = {}, idleT = 0, parts = [];
let THREE = null, R = null, TV = null;                    // R holds everything the renderer owns
// V is how things are being shown (camera, poses, the ball's flight through the park). It never feeds the rules.
const V = { flight: null, hitT: 0, landT: 0, tick: -1, sbFlash: 0, pk: 0, pb: 0, bs: 0, bb: 0, cheer: 0, spark: 0, lastTotal: 0 };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
// The picture rolls its own dice (shake, sparkle), so the rules see exactly the random numbers the 2D game would.
const vrand = (function () { let s = 0x2545F491; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; })();
function rand(a, b) { return a + Math.random() * (b - a); }
function fence(theta) { return 330 + 70 * (1 - Math.abs(theta) / 45); }
function zone(theta) {
  const a = Math.abs(theta);
  if (a < 8) return "dead center";
  const side = theta < 0 ? "left" : "right";
  if (a < 24) return side + " center";
  return side + " field";
}

function reset() {
  S = { t: 0, phase: "ready", pt: 0, left: BASE_PITCHES, thrown: 0, total: 0, longest: 0, hrs: 0,
        streak: 0, features: 0, bonusEarned: 0, stance: 0, drag: null,
        pitch: null, swing: -1, swingAt: 0, meet: null, hit: null, result: null, msg: "" };
  parts.length = 0;
  V.flight = null; V.landT = 0; V.sbFlash = 0; V.pb = 0; V.bb = 0; V.cheer = 0; V.spark = 0; V.lastTotal = 0;
  ledClear();
}

/* ---------------- Pitching (the 2D game's, untouched) ---------------- */
function newPitch() {
  const n = S.thrown;
  let T = clamp(0.8 - n * 0.016, 0.5, 0.8);
  let type = "fastball", brk = 0;
  if (n >= 8) {
    const r = Math.random();
    if (r < 0.3) { type = "changeup"; T *= 1.35; }
    else if (r < 0.55) { type = "curveball"; T *= 1.12; brk = (Math.random() < 0.5 ? -1 : 1) * rand(14, 22); }
  }
  S.pitch = { T: T, type: type, brk: brk, t: 0, done: false };
  S.thrown++;
  S.left--;
}

function swing() {
  if (S.phase !== "pitch" || S.swing >= 0) return;
  S.swing = 0;
  const p = S.pitch, e = p.t + SWING_T - p.T;             // where the ball will be when the bat gets there
  S.swingAt = e;
  Shell.sfx("whoosh");
  const a = Math.abs(e);
  if (a > TIP) { S.result = { kind: "whiff", e: e }; return; }
  S.meet = { e: e, at: SWING_T - (1 - MEET) * e };        // seconds after the tap that bat and ball meet
}

function contact(e) {
  const a = Math.abs(e);
  let d, launch, perfect = false, label;
  let theta = clamp(e / TIP * 52 + S.stance * 12 + rand(-4, 4), -70, 70);
  if (a <= PERFECT) { d = rand(412, 482); launch = rand(24, 32); perfect = true; label = "PERFECT"; }
  else if (a <= GOOD) { d = 340 + (GOOD - a) / (GOOD - PERFECT) * 75 + rand(-10, 20); launch = rand(22, 36); label = e < 0 ? "EARLY" : "LATE"; }
  else if (a <= WEAK) { d = rand(200, 330); launch = Math.random() < 0.6 ? rand(45, 62) : rand(8, 16); label = e < 0 ? "WAY EARLY" : "WAY LATE"; }
  else { d = rand(60, 150); launch = rand(-4, 8); label = "TOPPED IT"; theta = clamp(theta * 1.3, -80, 80); }
  if (S.pitch.type === "changeup" && !perfect) d -= 12;
  const foul = Math.abs(theta) > 45;
  const fd = fence(theta);
  const hr = !foul && d >= fd;
  let target = null;
  if (hr) {
    if (Math.abs(theta) < 9 && d >= 452) target = "scoreboard";
    else if (d >= fd + 85) target = "clear";
  }
  const peak = launch < 10 ? 4 : Math.tan(launch * Math.PI / 180) * d * 0.42;
  S.hit = { d: Math.round(d), theta: theta, launch: launch, perfect: perfect, foul: foul, hr: hr, fence: fd,
            target: target, peak: peak, label: label, u: 0 };
  S.result = { kind: "hit" };
  Shell.sfx("crack");
  if (perfect) { Shell.shake(4, 0.25); camShake(0.7, 0.25); }
  // presentation only: the path this ball will be drawn along
  V.flight = planFlight(S.hit); V.hitT = S.t; V.landT = 0; V.spark = 0.22; V.tick = -1;
  // the ball leaves from where the bat actually met it, easing onto the planned path
  const at = { set: function (x, y, z) { this.x = x; this.y = y; this.z = z; } };
  pitchPos(S.pitch, S.pitch.t, at);
  V.flight.off = { x: at.x, y: at.y - HIT0.y, z: at.z - HIT0.z };
  Juke.sfx("thump", perfect);
}

/* ---------------- Flow ---------------- */
function setPhase(ph) { S.phase = ph; S.pt = 0; }

function finishHit() {
  const h = S.hit, bonus = [], board = [];
  let title, sub, col = "#eceae2";
  if (h.hr) {
    S.hrs++; S.streak++;
    S.total += h.d;
    S.longest = Math.max(S.longest, h.d);
    title = h.d >= 470 ? "MOONSHOT!" : "HOME RUN!";
    if (window.Trophies) {
      Trophies.unlock("bc-hr");
      if (h.d >= 470) Trophies.unlock("bc-moon");
      if (h.target === "scoreboard") Trophies.unlock("bc-board");
    }
    sub = h.d + " FT to " + zone(h.theta);
    col = "#ffd23f";
    board.push(ledMsg("flash", title, 1.5), ledMsg("count", "", 1.3, { from: 0, value: h.d, suffix: " FT" }));
    if (h.target === "scoreboard") bonus.push("Off the scoreboard! Bonus pitch.");
    if (h.target === "clear") bonus.push("Cleared the bleachers! Bonus pitch.");
    if (h.target) { S.left++; S.bonusEarned++; board.push(ledMsg("slide", "BONUS PITCH", 1.5, { color: "lime", keep: true })); }
    if (S.streak % 3 === 0) {
      S.total += 500; S.features++;
      if (window.Trophies) Trophies.unlock("bc-feature");
      bonus.push("BLEACHER FEATURE +500 FT");
      board.push(ledMsg("cycle", "BLEACHER FEATURE +500", 1.8, { keep: true }));
    }
    Shell.sfx("crowd"); Shell.sfx("score");
    if (h.perfect) burstAt(W / 2, 140, 40);
    if (window.NPRewards && S.streak >= 2) NPRewards.streak(S.streak);
    board.push(ledMsg("count", "TOTAL", 2.2, { from: V.lastTotal, value: S.total, suffix: " FT", keep: true }));
    V.lastTotal = S.total;
    if (h.target === "scoreboard") { V.sbFlash = 1; camShake(1.2, 0.3); Juke.sfx("board"); }
    Juke.sfx("homer", h.d >= 470); Juke.sfx("roar");
    if (h.target) Juke.sfx("bonus", 0, 0.6);
    if (S.streak % 3 === 0) Juke.sfx("feature", 0, h.target ? 1.15 : 0.6);
  } else {
    S.streak = 0;
    if (h.foul) { title = "FOUL BALL"; sub = h.d > 200 ? "Long strike, wrong side of the pole." : "Into the seats behind the dugout."; board.push(ledMsg("blink", "FOUL BALL", 1.8, { color: "pink" })); }
    else if (h.launch < 10) { title = "GROUNDER"; sub = "Beat into the dirt. 0 FT."; }
    else if (h.d >= h.fence - 25) { title = "AT THE WALL"; sub = "Caught on the warning track. " + h.d + " FT."; col = "#ff3fa4"; board.push(ledMsg("blink", "AT THE WALL", 2, { color: "violet" })); Juke.sfx("wall"); }
    else if (h.launch > 44) { title = "POP UP"; sub = "Straight up. 0 FT."; }
    else { title = "FLY OUT"; sub = h.d + " FT, but in the park."; }
    Shell.sfx("miss");
  }
  if (bonus.length) sub += "  " + bonus.join("  ");
  Shell.flash(title, sub, col, bonus.length ? 1700 : 1150);
  ledPlay(board);
  V.landT = 0;
  setPhase("post");
  S.postLen = bonus.length ? 1.25 : 0.85;
}

function strike(swung) {
  S.streak = 0;
  Shell.flash("STRIKE", swung ? (S.swingAt < 0 ? "Way out in front." : "Too late on it.") : "Gotta swing to send it.", "#ff4b3e", 900);
  Shell.noise(0.09, 0.6, 300, 0.7, 0, 0, "lowpass");
  ledPlay([ledMsg("blink", "STRIKE", 1.5, { color: "red" })]);
  Juke.sfx("strike");
  setPhase("post");
  S.postLen = 0.7;
}

function nextPitch() {
  S.pitch = null; S.swing = -1; S.meet = null; S.hit = null; S.result = null;
  if (S.left <= 0) {
    ledFinal(S.total);
    Shell.gameOver(S.total, { title: "DERBY OVER", html:
      row("Home runs", S.hrs + " of " + S.thrown) +
      row("Longest blast", S.longest ? S.longest + " FT" : "None") +
      row("Bonus pitches", S.bonusEarned) +
      row("Bleacher features", S.features),
      stats: { total: S.total, hrs: S.hrs, thrown: S.thrown, longest: S.longest, bonusEarned: S.bonusEarned, features: S.features } });
    return;
  }
  setPhase("ready");
}
function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

function update(dt) {
  S.t += dt; S.pt += dt;
  const sd = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
  if (sd && (S.phase === "ready" || S.phase === "windup")) S.stance = clamp(S.stance + sd * 2.2 * dt, -1, 1);
  if (S.swing >= 0) S.swing += dt;

  if (S.phase === "ready") {
    if (S.pt > 0.4) { newPitch(); setPhase("windup"); }
  } else if (S.phase === "windup") {
    if (S.pt > 0.8) { setPhase("pitch"); Shell.tone(180, 0.12, "triangle", 0.15, 90); }
  } else if (S.phase === "pitch") {
    const p = S.pitch;
    p.t += dt;
    if (S.meet && S.swing >= S.meet.at) { const e = S.meet.e; S.meet = null; contact(e); }
    if (S.result && S.result.kind === "hit") { setPhase("contact"); return; }
    if (p.t > p.T + 0.14) {
      Shell.noise(0.06, 0.7, 500, 0.8, 0, 0, "lowpass"); // into the mitt
      strike(S.swing >= 0);
    }
  } else if (S.phase === "contact") {
    if (S.pt > 0.3) setPhase("flight");
  } else if (S.phase === "flight") {
    const h = S.hit;
    let dur = h.hr ? 1.45 : 1.0;
    if (h.launch < 10) dur = 0.6;
    h.u = Math.min(1, S.pt / dur);
    if (h.u >= 1) finishHit();
  } else if (S.phase === "post") {
    if (S.pt > S.postLen) nextPitch();
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 160 * dt; q.rot += q.vr * dt;
    if (q.life <= 0) parts.splice(i, 1);
  }
}

function burstAt(x, y, n) {
  for (let i = 0; i < (Shell.reduced ? n / 3 : n); i++) {
    const a = Math.random() * TAU, s = 40 + Math.random() * 140;
    parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 1, c: CONF_COLS[i % CONF_COLS.length],
                 rot: vrand() * TAU, vr: (vrand() - 0.5) * 14 });
  }
}

/* ---------------- Sound: the house band and a few extra stingers ----------------
   The shell still plays every sound effect the 2D game had, exactly when it did. On top of that the game brings
   its own small synth: an original sixteen-bar loop in C (lead, bass, arpeggio, drums) and a handful of stingers
   for the big moments. All of it is made in code with the Web Audio API, no audio files. It starts only after the
   first tap or key press, goes quiet with the shell's mute button (the same "npArcade.muted" setting), and rolls
   none of the game's dice. */
const MUSIC_VOL = 0.17, SFX_VOL = 0.2;                     // turn the band or the stingers up and down here
const BPM = 126, STEP = 60 / BPM / 4, SONG_STEPS = 256;    // sixteen bars of sixteenth notes, about half a minute
const MUSIC_KEY = "npArcade.music";
const AHEAD = 0.6;                                         // seconds of music kept queued, so a slow frame never makes the band stumble
// bass note, then the three notes the arpeggio walks (MIDI numbers)
const CHORDS = { C: [36, 60, 64, 67], Am: [33, 57, 60, 64], F: [41, 57, 60, 65], G: [43, 59, 62, 67] };
// one chord per half bar
const PROG = "C C Am Am F F G G C C Am Am F G C C Am Am F F C C G G Am Am F F G G G G".split(" ");
// the tune, a bar a line: step in the bar, note, length in steps
const LEAD_BARS = [
  "0C5-1 2E5-1 4G5-2 6A5-2 8G5-3 11E5-1 12G5-4",
  "0A4-1 2C5-1 4E5-2 6G5-2 8E5-3 11C5-1 12E5-4",
  "0F5-2 2A5-2 4C6-3 7A5-1 8G5-2 10F5-2 12A5-2 14F5-2",
  "0G5-3 3D5-1 4G5-2 6B5-2 8D6-4 12B5-1 13A5-1 14G5-1 15E5-1",
  "0C5-1 2E5-1 4G5-2 6A5-2 8G5-3 11E5-1 12C6-4",
  "0A5-3 3G5-1 4E5-2 6C5-2 8D5-2 10E5-2 12G5-2 14E5-2",
  "0F5-2 2A5-2 4G5-2 6F5-2 8G5-2 10B5-2 12D6-2 14B5-2",
  "0C6-6 6G5-2 8E5-2 10G5-2 12C5-4",
  "0E5-4 4A5-4 8G5-2 10E5-2 12C5-4",
  "0F5-4 4A5-4 8G5-2 10F5-2 12C5-4",
  "0E5-4 4G5-4 8C6-3 11B5-1 12G5-4",
  "0D5-2 2G5-2 4B5-2 6D6-2 8B5-2 10G5-2 12D5-4",
  "0E5-2 2A5-2 4C6-4 8B5-2 10A5-2 12E5-4",
  "0F5-2 2A5-2 4C6-4 8A5-2 10G5-2 12F5-4",
  "0G5-2 3G5-1 4A5-2 6B5-2 8D6-3 11B5-1 12G5-4",
  "0D6-2 2B5-2 4G5-2 6F5-2 8D5-2 10F5-2 12G5-2 14B5-2"
];
function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
const LEAD = (function () {
  const out = new Array(SONG_STEPS).fill(null), semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  LEAD_BARS.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(\d)-(\d+)$/.exec(tok);
      if (m) out[b * 16 + Number(m[1])] = [12 * (Number(m[3]) + 1) + semis[m[2]], Number(m[4])];
    });
  });
  return out;
})();

const Juke = (function () {
  let live = null, dead = false, muted = false, going = false, fresh = true, step = 0, nextT = 0, timer = 0;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  const buttons = [];

  // Everything between the instruments and the speaker, on any audio context (the real one, or an offline one for checks).
  function rig(c) {
    const A = { c: c };
    A.out = c.createGain();                                 // follows the mute button
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    A.out.connect(comp); comp.connect(c.destination);
    A.music = c.createGain(); A.music.gain.value = 0;
    A.duck = c.createGain();                                // the band steps back for a second when the crowd goes up
    A.music.connect(A.duck); A.duck.connect(A.out);
    A.sfx = c.createGain(); A.sfx.gain.value = SFX_VOL; A.sfx.connect(A.out);
    function filter(type, f, q, dest) { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(dest); return n; }
    A.lead = filter("lowpass", 3200, 0.7, A.music);
    A.bass = filter("lowpass", 900, 1.2, A.music);
    const send = c.createGain(), echo = c.createDelay(1), back = c.createGain(), damp = filter("lowpass", 2400, 0.7, A.music);
    send.gain.value = 0.3; echo.delayTime.value = STEP * 3; back.gain.value = 0.32;    // a dotted-eighth echo on the lead
    A.lead.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(damp);
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
  // A burst of filtered noise: hats, snares, the crowd.
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

  // The band: everything that sounds on sixteenth-note i of the loop, starting at time t.
  function playStep(A, i, t) {
    const bar = i >> 4, s = i & 15, ch = CHORDS[PROG[i >> 3]], second = bar >= 8, n = LEAD[i];
    if (n) osc(A, A.lead, "square", mtof(n[0]), t, n[1] * STEP * 0.92, 0.2);
    if (!(s & 1)) {
      const k = s >> 1;                                     // eighth notes: bouncing octave bass, a walking arpeggio, hats
      osc(A, A.bass, "sawtooth", mtof(ch[0] + (k === 6 ? 7 : k & 1 ? 12 : 0)), t, STEP * 1.7, 0.3);
      osc(A, A.music, "triangle", mtof(ch[1 + [0, 1, 2, 1][k & 3]] + (second ? 12 : 0)), t, STEP * 1.5, 0.085);
      hiss(A, A.music, t, s === 14 ? 0.14 : 0.04, s % 4 === 2 ? 0.1 : 0.055, "highpass", 7000, 0.7);
    }
    const fill = bar === 7 ? s >= 12 : bar === 15 ? s >= 8 && (s % 2 === 0 || s >= 12) : false;
    if (fill || s === 4 || s === 12) {
      const v = fill ? 0.55 + 0.45 * (s - 8) / 7 : 1;
      hiss(A, A.music, t, 0.13, 0.32 * v, "bandpass", 1900, 0.6);
      osc(A, A.music, "triangle", 200, t, 0.07, 0.2 * v, 130, 0.1);
    }
    if (second ? s % 4 === 0 : s === 0 || s === 8 || s === 10) osc(A, A.music, "sine", 150, t, 0.16, 0.62, 42, 0.08);
  }

  function duck(A, t, secs) {
    A.duck.gain.cancelScheduledValues(t);
    A.duck.gain.setTargetAtTime(0.5, t, 0.03);
    A.duck.gain.setTargetAtTime(1, t + secs, 0.25);
  }
  // The stingers. x is a detail of the moment (perfect, moonshot, how far the ball has gone).
  function cue(A, name, t, x) {
    const d = A.sfx;
    if (name === "thump") {                                 // wood on leather, with a ring to it when the swing is perfect
      osc(A, d, "sine", 190, t, 0.11, 0.9, 55, 0.05);
      if (x) { osc(A, d, "sine", 1568, t, 0.4, 0.22, 0, 0.05); osc(A, d, "sine", 2349, t + 0.03, 0.45, 0.16, 0, 0.05); }
    } else if (name === "tick") {                           // the distance counter, climbing
      osc(A, d, "square", 520 + 900 * x, t, 0.035, 0.16, 0, 0.3);
    } else if (name === "homer") {                          // home run: a run up the chord and a held one on top
      const up = x ? [72, 76, 79, 84, 88, 91, 96] : [72, 76, 79, 84, 88], te = t + up.length * 0.065;
      up.forEach(function (m, i) { osc(A, d, "square", mtof(m), t + i * 0.065, 0.11, 0.26, 0, 0.5); });
      [84, 88, 91].forEach(function (m) { osc(A, d, "triangle", mtof(m + (x ? 12 : 0)), te, 0.55, 0.2, 0, 0.3); });
      duck(A, t, 1.4);
    } else if (name === "roar") {                           // the bleachers: a swell, some hiss on top, hands clapping
      hiss(A, d, t, 2.4, 1.1, "bandpass", 1000, 0.45, 1500, 0.3);
      hiss(A, d, t + 0.1, 2.0, 0.45, "highpass", 3200, 0.6, 0, 0.35);
      for (let i = 0; i < 26; i++) hiss(A, d, t + 0.15 + vrand() * 1.5, 0.03, 0.3 + vrand() * 0.25, "bandpass", 1800 + vrand() * 2200, 2.5);
    } else if (name === "bonus") {                          // bonus pitch: a power-up slide and two blips
      osc(A, d, "square", 392, t, 0.3, 0.22, 1568, 0.8);
      osc(A, d, "square", 1568, t + 0.32, 0.07, 0.24, 0, 0.5); osc(A, d, "square", 2093, t + 0.4, 0.16, 0.24, 0, 0.5);
    } else if (name === "feature") {                        // bleacher feature: a jackpot trill and a bell
      for (let i = 0; i < 8; i++) osc(A, d, "square", mtof(i % 2 ? 91 : 88), t + i * 0.05, 0.05, 0.2, 0, 0.6);
      osc(A, d, "square", 2093, t + 0.4, 0.5, 0.22, 0, 0.3); osc(A, d, "sine", 3136, t + 0.4, 0.6, 0.14, 0, 0.2);
    } else if (name === "board") {                          // off the scoreboard: a clang
      [1, 2.76, 5.4, 8.93].forEach(function (k, i) { osc(A, d, "sine", 392 * k, t, 1.0 - i * 0.18, 0.3 / (i + 1), 0, 0.03); });
      hiss(A, d, t, 0.06, 0.4, "highpass", 4000, 0.7);
    } else if (name === "sign") {                           // a boing and a ding (not used by the 3D park)
      osc(A, d, "sine", 260, t, 0.16, 0.4, 520, 0.6); osc(A, d, "sine", 520, t + 0.15, 0.2, 0.3, 330, 0.5);
      osc(A, d, "triangle", 1319, t + 0.02, 0.5, 0.18, 0, 0.1);
    } else if (name === "wall") {                           // died at the wall: a thud
      osc(A, d, "sine", 120, t, 0.2, 0.9, 48, 0.05); hiss(A, d, t, 0.12, 0.35, "lowpass", 500, 0.7);
    } else if (name === "strike") {                         // strike: a sad little slide down
      osc(A, d, "triangle", 196, t, 0.26, 0.34, 92, 0.5);
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
        if (!timer) timer = setInterval(pump, 120);         // keeps the band fed if the picture ever stalls
      }
      if (live.c.state !== "running") { const p = live.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { live = null; dead = true; }
  }
  // Called every frame: follow the mute button, and keep the next stretch of music queued while a game is on.
  function pump() {
    const A = live;
    if (!A || !window.Shell) return;
    const c = A.c, now = c.currentTime, m = shellMuted();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, now, 0.02); }
    const want = musicOn && !muted && c.state === "running" && Shell.state() === "playing";
    if (want && !going) {
      going = true;
      nextT = Math.max(nextT, now + (fresh ? 0.42 : 0.08));  // a fresh game lets the shell's start jingle go first
      A.music.gain.cancelScheduledValues(now);
      if (fresh) { A.music.gain.setValueAtTime(0, now); A.music.gain.setTargetAtTime(MUSIC_VOL, nextT - 0.04, 0.012); }
      else A.music.gain.setTargetAtTime(MUSIC_VOL, now, 0.03);
      fresh = false;
    } else if (!want && going) {
      going = false;                                        // whatever is already queued dies under a quick fade
      A.music.gain.cancelScheduledValues(now); A.music.gain.setTargetAtTime(0, now, 0.06);
    }
    if (!going) return;
    if (nextT < now) nextT = now + 0.03;                    // only after a stall longer than the queue
    while (nextT < now + AHEAD) { playStep(A, step, nextT); step = (step + 1) % SONG_STEPS; nextT += STEP; }
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
    newGame: function () { unlock(); step = 0; fresh = true; going = false; if (live) live.music.gain.setTargetAtTime(0, live.c.currentTime, 0.03); pump(); },
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    // for checks: what the engine is doing right now, and the whole loop played into any audio context
    peek: function () { return { made: !!live, state: live ? live.c.state : "none", going: going, step: step, muted: muted, musicOn: musicOn, out: live ? live.out : null }; },
    render: function (c, steps, t0) { const A = rig(c); A.music.gain.value = MUSIC_VOL; for (let i = 0; i < steps; i++) playStep(A, i % SONG_STEPS, (t0 || 0.05) + i * STEP); return A; },
    cue: cue
  };
})();

/* ---------------- Input (the 2D game's, untouched) ---------------- */
function pointer(type, x) {
  if (type === "down") {
    if (S.phase === "flight" && S.pt > 0.25) { S.pt = 99; return; } // tap to skip the replay
    if (S.phase === "pitch") { swing(); return; }
    if (S.phase === "ready" || S.phase === "windup") S.drag = { sx: x, st: S.stance };
  } else if (type === "move" && S.drag) {
    S.stance = clamp(S.drag.st + (x - S.drag.sx) / 70, -1, 1);
  } else if (type === "up" || type === "cancel") {
    S.drag = null;
  }
}
function key(type, code, e) {
  if (type === "down") {
    keys[code] = true;
    if ((code === "Space" || code === "Enter" || code === "NumpadEnter") && !e.repeat) {
      if (S.phase === "flight" && S.pt > 0.25) S.pt = 99;
      else swing();
    }
  } else keys[code] = false;
}

/* =====================================================================================
   3D presentation
   ===================================================================================== */

/* ---------------- Where things are in the park ---------------- */
function normA(a) { while (a > 180) a -= 360; while (a <= -180) a += 360; return a; }
function sideWall(aa) { return aa >= SIDE_A0 ? SIDE_P : SIDE_P / Math.cos((SIDE_A0 - aa) * DEG); }
// Height of whatever is under the spot r feet out at angle a: the field, the bleacher steps, the stands down the lines.
function ground(r, a) {
  const aa = Math.abs(a);
  if (aa <= 45) {
    const k = r - fence(a);
    if (k < 0) return 0;
    if (k < DECK_IN) return DECK_Y;
    if (k <= DECK_D) return DECK_Y + Math.min(ROWS, Math.floor((k - DECK_IN) / TREAD) + 1) * RISE;
    return Math.max(0, DECK_TOP - (k - DECK_D) * BACK_SLOPE);
  }
  const k = aa >= SIDE_A0 ? r - SIDE_P : r * Math.cos((SIDE_A0 - aa) * DEG) - SIDE_P;
  if (k < 0) return 0;
  if (k < 1.2) return SIDE_Y;
  if (k <= SIDE_D) return SIDE_Y + Math.min(SIDE_ROWS, Math.floor((k - 1.2) / SIDE_TREAD) + 1) * SIDE_RISE;
  return Math.max(0, SIDE_TOP - (k - SIDE_D) * BACK_SLOPE);
}

// The line a batted ball is drawn along. The distance, the direction and the timing are the rules' own;
// the arc is raised just enough to carry the wall and come down on the seat it was scored for.
function planFlight(h) {
  const a = h.theta, aa = Math.abs(a), cs = Math.cos(a * DEG);
  const f = { a: a, sx: Math.sin(a * DEG), sz: -cs, roll: h.launch < 10, travel: h.target === "scoreboard" ? Math.min(h.d, 462) : h.d,
              rEnd: 0, yEnd: BALL_R, arc: 0, seats: false, hard: false, rim: 0 };
  if (f.roll) {                                           // on the ground: it runs out, or dies against a wall
    f.rEnd = Math.min(f.travel, (aa <= 45 ? fence(a) : sideWall(aa)) - 2);
    return f;
  }
  if (h.target === "scoreboard") { f.rEnd = (SB.r - 0.8) / cs; f.yEnd = 82 + clamp((h.d - 452) / 30, 0, 1) * 20; f.hard = true; }
  else {
    f.rEnd = f.travel;
    const g = ground(f.rEnd, a);
    f.seats = g > 0;
    f.yEnd = g + (g > 0 ? 3.2 : BALL_R);
    // over the back of a stand: the camera has to see over the top row too
    if (aa <= 45 ? f.rEnd > fence(a) + DECK_D : (aa >= SIDE_A0 ? f.rEnd : f.rEnd * Math.cos((SIDE_A0 - aa) * DEG)) > SIDE_P + SIDE_D) f.rim = aa <= 45 ? DECK_TOP : SIDE_TOP;
  }
  let A = Math.max(h.peak, 6);
  for (let n = 0; n < 60; n++) {
    let ok = true;
    for (let u = 0.05; u < 0.985 && ok; u += 0.015) {
      if (HIT0.y + (f.yEnd - HIT0.y) * u + 4 * A * u * (1 - u) < ground(f.rEnd * u, a) + (f.rim ? 5.5 : 1.2)) ok = false;
    }
    if (ok) break;
    A *= 1.1;
  }
  f.arc = A;
  return f;
}
// Ball position at flight fraction u (the same u the distance read-out runs on). Returns feet from the plate.
function flightPos(f, u, out) {
  let r, y;
  if (f.roll) { r = Math.min(f.travel * u, f.rEnd); y = BALL_R + Math.abs(Math.sin(u * 13)) * 2.4 * (1 - u) * (1 - u); }
  else { r = f.rEnd * u; y = HIT0.y + (f.yEnd - HIT0.y) * u + 4 * f.arc * u * (1 - u); }
  out.set(f.sx * r, y, f.sz * r + HIT0.z * (1 - u));
  if (f.off) { const k = (1 - u) * (1 - u); out.x += f.off.x * k; out.y += f.off.y * k; out.z += f.off.z * k; }
  return r;
}
// A pitch, t seconds after release. It crosses the front of the plate at t = T, exactly as the timing windows expect.
function pitchPos(p, t, out) {
  const u = t / p.T, rel = R.rel, arc = p.type === "fastball" ? 0.5 : p.type === "changeup" ? 1.6 : 2.3;
  out.set(rel.x * (1 - u) + p.brk * BRK_FT * u * u * u,
          rel.y + (ZONE_Y - rel.y) * u + 4 * arc * u * (1 - u),
          rel.z + (PLATE_Z - rel.z) * u);
}

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

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every decal inside the park uses this
// (the full logo with the mascot is kept for the splash and the score card). If the PNG is missing,
// plain lettering stands in.
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

// The wordmark as the grounds crew would mow it in: the same lettering in turf greens, so a white ball still shows over it.
function mownCanvas(script) {
  const c = mkCanvas(1024, 512), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(script, 8, 8, 1008, 496);
  try {
    const im = g.getImageData(0, 0, 1024, 512), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const L = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
      d[i] = 14 + 170 * L; d[i + 1] = 108 + 138 * L; d[i + 2] = 48 + 150 * L;
    }
    g.putImageData(im, 0, 0);
  } catch (e) { /* leave it in its own colors */ }
  return c;
}

// Outfield grass, mown in a checkerboard. One tile is 80 x 80 feet.
function grassCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(3);
  g.fillStyle = "#27ab4c"; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#31bd5a"; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  speckle(g, 256, 256, 6000, rnd, "rgba(255,255,255,.05)", "rgba(0,50,15,.07)");
  return c;
}
function dirtCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d"), rnd = rng(9);
  g.fillStyle = "#cf9050"; g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 2600, rnd, "rgba(255,225,180,.10)", "rgba(110,60,20,.10)");
  return c;
}
// The infield from above: 240 x 240 feet centered 75 feet out from the plate. Clear where the outfield grass shows.
function infieldCanvas() {
  const N = 1024, s = N / 240, c = mkCanvas(N, N), g = c.getContext("2d"), rnd = rng(17);
  const X = function (x) { return N / 2 + x * s; }, Y = function (z) { return (z + 195) * s; };
  function poly(pts, col) { g.fillStyle = col; g.beginPath(); for (let i = 0; i < pts.length; i += 2) g.lineTo(X(pts[i]), Y(pts[i + 1])); g.closePath(); g.fill(); }
  g.fillStyle = "#cf9050"; g.beginPath(); g.arc(X(0), Y(MOUND_Z), 97 * s, 0, TAU); g.fill();     // the skin
  g.globalCompositeOperation = "destination-in";
  poly([0, 21, 150, -129, 150, -200, -150, -200, -150, -129], "#000");
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "#cf9050"; g.beginPath(); g.arc(X(0), Y(0), 20 * s, 0, TAU); g.fill();            // home plate circle
  g.globalCompositeOperation = "source-atop";
  speckle(g, N, N, 16000, rnd, "rgba(255,225,180,.10)", "rgba(110,60,20,.10)");
  g.globalCompositeOperation = "source-over";
  // the infield grass, mown on the diagonal
  g.save(); g.beginPath();
  [0, -16, 47.6, -63.6, 0, -111.2, -47.6, -63.6].forEach(function (v, i, a) { if (i % 2 === 0) g.lineTo(X(v), Y(a[i + 1])); });
  g.closePath(); g.clip();
  g.fillStyle = "#27ab4c"; g.fillRect(0, 0, N, N);
  g.translate(X(0), Y(-63.6)); g.rotate(Math.PI / 4);
  g.fillStyle = "#31bd5a";
  for (let i = -8; i < 8; i += 2) g.fillRect(i * 9 * s, -120 * s, 9 * s, 240 * s);
  g.restore();
  g.fillStyle = "#cf9050"; g.beginPath(); g.arc(X(0), Y(MOUND_Z), 14.5 * s, 0, TAU); g.fill();    // under the mound
  g.strokeStyle = "rgba(255,255,255,.95)"; g.lineWidth = 0.7 * s; g.lineCap = "butt";            // foul lines
  g.beginPath(); g.moveTo(X(2.2), Y(-2.2)); g.lineTo(X(125), Y(-125)); g.moveTo(X(-2.2), Y(-2.2)); g.lineTo(X(-125), Y(-125)); g.stroke();
  return c;
}
// Chalk around home plate: 48 x 48 feet, the two batter's boxes and the catcher's box.
function chalkCanvas() {
  const N = 512, s = N / 48, c = mkCanvas(N, N), g = c.getContext("2d");
  const X = function (x) { return N / 2 + x * s; }, Y = function (z) { return N / 2 + z * s; };
  g.strokeStyle = "rgba(255,255,255,.94)"; g.lineWidth = 0.42 * s; g.lineJoin = "miter";
  g.strokeRect(X(-8.4), Y(-4.9), 6.4 * s, 9.8 * s);
  g.strokeRect(X(2.0), Y(-4.9), 6.4 * s, 9.8 * s);
  g.beginPath(); g.moveTo(X(-3.4), Y(4.9)); g.lineTo(X(-3.4), Y(12.5)); g.lineTo(X(3.4), Y(12.5)); g.lineTo(X(3.4), Y(4.9)); g.stroke();
  return c;
}

// One stretch of outfield wall padding: 1024 x 128, four panels. Wordmark, FREE PLAY, wordmark, MINT IN BOX.
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
function numberCanvas(n) {
  const c = mkCanvas(160, 96), g = c.getContext("2d");
  rrectPath(g, 3, 3, 154, 90, 12); g.fillStyle = "#0b1f5e"; g.fill();
  g.lineWidth = 5; g.strokeStyle = "#ffd21f"; g.stroke();
  g.font = '900 62px "Arial Black", Arial, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#ffd21f"; g.fillText(String(n), 80, 52);
  return c;
}
// The banner along the walls down the foul lines.
function sideWallCanvas(script) {
  const c = mkCanvas(512, 128), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 128);
  bg.addColorStop(0, "#2f7bf0"); bg.addColorStop(1, "#123a9e");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.fillStyle = "#ff9214"; g.fillRect(0, 0, 512, 10);
  g.fillStyle = "rgba(4,16,60,.55)"; g.fillRect(0, 0, 3, 128); g.fillRect(253, 0, 6, 128); g.fillRect(509, 0, 3, 128);
  drawScript(g, script, 128, 72, 220, 96);
  candyText(g, "NO QUARTERS", 384, 54, 30, 220); candyText(g, "REQUIRED", 384, 92, 30, 220);
  return c;
}

const FAN_COLS = ["#ff4b3e", "#16b9e8", "#ff3fa4", "#58c322", "#ffb81f", "#8a5cff", "#ffffff", "#ff9214", "#f4efdf"];
const SKIN_COLS = ["#f1c7a0", "#d9a273", "#a8703f", "#f6d7b8", "#7b4f2c"];
// One row of bleacher: the riser with its seats (lower half of the tile) and the concrete step (upper half).
function seatCanvas() {
  const c = mkCanvas(256, 128), g = c.getContext("2d"), rnd = rng(29);
  g.fillStyle = "#131c46"; g.fillRect(0, 0, 256, 64);
  speckle(g, 256, 64, 500, rnd, "rgba(255,255,255,.05)", "rgba(0,0,0,.12)");
  g.fillStyle = "#0c1438"; g.fillRect(0, 64, 256, 64);
  for (let i = 0; i < 6; i++) {
    const x = i * 42.7 + 4;
    rrectPath(g, x, 74, 34, 50, 8); g.fillStyle = i % 2 ? "#1b56cf" : "#2468e0"; g.fill();
    g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(x + 4, 78, 26, 5);
    if (rnd() < 0.8) {                                    // somebody in the seat, for when the 3D crowd is switched off
      g.fillStyle = FAN_COLS[Math.floor(rnd() * FAN_COLS.length)]; rrectPath(g, x + 5, 92, 24, 36, 9); g.fill();
      g.fillStyle = SKIN_COLS[Math.floor(rnd() * SKIN_COLS.length)]; g.beginPath(); g.arc(x + 17, 84, 9, 0, TAU); g.fill();
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
// The lots outside the park, from the air: rows of parked cars under street lamps, kept dim. One tile is 300 feet.
function lotCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(53), cols = ["#3d2a4e", "#1f3f74", "#4a5078", "#4a4458", "#353e70", "#2a4a5c", "#444c78"];
  g.fillStyle = "#111b4d"; g.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 4; r++) {
    const y = 14 + r * 64;
    g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(0, y + 17, 256, 1.5);
    for (let i = 0; i < 16; i++) {
      for (let k = 0; k < 2; k++) if (rnd() < 0.6) { g.fillStyle = cols[Math.floor(rnd() * cols.length)]; rrectPath(g, i * 16 + 4, y + 2 + k * 19, 9, 14, 3); g.fill(); }
    }
  }
  for (let i = 0; i < 2; i++) {
    const x = 64 + i * 128, y = 62 + i * 128, gr = g.createRadialGradient(x, y, 0, x, y, 34);
    gr.addColorStop(0, "rgba(255,236,170,.16)"); gr.addColorStop(1, "rgba(255,236,170,0)");
    g.fillStyle = gr; g.fillRect(x - 34, y - 34, 68, 68);
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

// The scoreboard face (1024 x 256): wordmark, the game, and the three numbers the 2D board showed.
function paintBoard(g, script) {
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 256);
  const gl = g.createLinearGradient(0, 0, 0, 120);
  gl.addColorStop(0, "rgba(255,255,255,.38)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.beginPath(); g.ellipse(512, -20, 620, 140, 0, 0, TAU); g.fill();
  g.lineWidth = 14; g.strokeStyle = "#ff9214"; g.strokeRect(7, 7, 1010, 242);
  g.lineWidth = 4; g.strokeStyle = "#ffe45c"; g.strokeRect(17, 17, 990, 222);
  drawScript(g, script, 196, 128, 330, 196);
  candyText(g, "BLEACHER CARTS", 690, 62, 56, 600);
  const cells = [["PITCH", S.thrown + "/" + (S.thrown + S.left)], ["HOME RUNS", String(S.hrs)], ["LONGEST", S.longest ? S.longest + " FT" : "--"]];
  for (let i = 0; i < 3; i++) {
    const x = 384 + i * 208;
    rrectPath(g, x, 108, 196, 122, 12); g.fillStyle = "#060a1c"; g.fill();
    g.lineWidth = 3; g.strokeStyle = "#ffe45c"; g.stroke();
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "bold 24px " + HUD_FONT; g.fillStyle = "#a8ecff"; g.fillText(cells[i][0], x + 98, 132);
    g.font = '900 60px "Arial Black", Arial, sans-serif';
    let tw = g.measureText(cells[i][1]).width;
    if (tw > 176) g.font = "900 " + Math.floor(60 * 176 / tw) + 'px "Arial Black", Arial, sans-serif';
    g.shadowColor = "#ff9a00"; g.shadowBlur = 14; g.fillStyle = "#ffc21a"; g.fillText(cells[i][1], x + 98, 186); g.shadowBlur = 0;
  }
}
// A jersey, wrapped once around the body: u = 0 is the chest, u = .5 the back. Wordmark on both, number on the back.
function jerseyCanvas(script, base, stripe, num, numCol) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, 512, 256);
  if (stripe) { g.fillStyle = stripe; for (let x = 6; x < 512; x += 16) g.fillRect(x, 0, 1.6, 256); }
  const sh = g.createLinearGradient(0, 0, 0, 256);
  sh.addColorStop(0, "rgba(255,255,255,.12)"); sh.addColorStop(1, "rgba(0,0,40,.16)");
  g.fillStyle = sh; g.fillRect(0, 0, 512, 256);
  [0, 256, 512].forEach(function (x) { drawScript(g, script, x, 92, 150, 62); });
  if (num) {
    g.font = '900 78px "Arial Black", Arial, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    g.lineWidth = 8; g.strokeStyle = "#ffffff"; g.strokeText(num, 256, 176);
    g.fillStyle = numCol; g.fillText(num, 256, 176);
  }
  return c;
}
// A baseball: red stitching, the script wordmark once on each side.
function ballCanvas(script) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  g.fillStyle = "#fbfaf4"; g.fillRect(0, 0, 512, 256);
  for (let k = 0; k < 2; k++) {
    const off = k ? 46 : -46;
    g.strokeStyle = "#e3231a"; g.lineWidth = 3;
    g.beginPath(); for (let x = 0; x <= 512; x += 4) g.lineTo(x, 128 + off + Math.sin(x / 512 * TAU * 2) * 34 * (k ? -1 : 1)); g.stroke();
    g.lineWidth = 2;
    for (let x = 0; x < 512; x += 9) {
      const y = 128 + off + Math.sin(x / 512 * TAU * 2) * 34 * (k ? -1 : 1);
      g.beginPath(); g.moveTo(x - 3, y - 6); g.lineTo(x + 3, y + 6); g.stroke();
    }
  }
  const SW = 132, SH = Math.round(SW * script.height / script.width), rowH = script.height / SH;
  [128, 384].forEach(function (cx) {                       // widened by 1 / cos(latitude) so it lands on the sphere undistorted
    g.fillStyle = "#fbfaf4"; g.beginPath(); g.ellipse(cx, 128, SW * 0.56, SH * 0.62, 0, 0, TAU); g.fill();
    for (let r = 0; r < SH; r++) {
      const y = 128 - Math.round(SH / 2) + r, lat = (0.5 - (y + 0.5) / 256) * Math.PI, w = SW / Math.max(0.4, Math.cos(lat));
      g.drawImage(script, 0, r * rowH, script.width, rowH, cx - w / 2, y, w, 1);
    }
  });
  return c;
}
// The face of the cartridge a perfect swing sends out: grey shell, grip ridges, a label with the wordmark.
function cartCanvas(script) {
  const c = mkCanvas(256, 224), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 224);
  bg.addColorStop(0, "#c2c5d0"); bg.addColorStop(1, "#8f93a2");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 224);
  for (let y = 12; y < 48; y += 9) { g.fillStyle = "#6c7080"; g.fillRect(18, y, 220, 4); g.fillStyle = "#dfe2ea"; g.fillRect(18, y + 4, 220, 1.5); }
  rrectPath(g, 22, 58, 212, 148, 12); g.fillStyle = "#16171d"; g.fill();
  rrectPath(g, 28, 64, 200, 136, 9);
  const lb = g.createLinearGradient(0, 64, 0, 200);
  lb.addColorStop(0, "#ffe45c"); lb.addColorStop(1, "#ff9214");
  g.fillStyle = lb; g.fill();
  drawScript(g, script, 128, 132, 184, 110);
  return c;
}

// A tiny painted park for the glossy highlights on helmets, the bat, the ball and the wall padding.
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

/* ---------------- LED ribbon board: the strip on the facade between the outfield wall and the bleachers ----------------
   The board is a real dot matrix. Everything on it is painted into a small canvas, one pixel per LED, and a small
   shader turns each pixel into a glowing dot. It runs foul pole to foul pole in three sections: the programme scrolls
   right to left through all three, and big moments (ledPlay below) cut in on every section at once. */
const LED_SEG = 240, LED_SEGS = 3, LED_COLS = LED_SEG * LED_SEGS, LED_ROWS = 26;
const LED_SAFE = 172;                                      // widest message that stays in the batter's view of the center section
const LED_SPEED = 46;                                      // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));   // the largest text size that fits (5 x 7 font, in LEDs per font pixel)
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
// Short messages between the plugs. The wordmark leads each group.
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["NO QUARTERS REQUIRED", "cyan"]];
// Plugs for the rest of the arcade: [game, one-line tag]. Edit freely, the board lays itself out.
const LED_PLUGS = [
  ["TAPE PIN LANES", "3D BOWLING"],
  ["SHELF LINKS", "MINI GOLF"],
  ["BARGAIN BIN BUCKETS", "HOOPS"],
  ["TICKET ROLL ALLEY", "ROLL FOR TICKETS"],
  ["PAWN SHOP POOL", "RACK 'EM UP"],
  ["RINK RAT SHOOTOUT", "HOCKEY SHOOTOUT"],
  ["FOURTH AND COLLECT", "SPLIT THE UPRIGHTS"],
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
    // a strike or a foul cuts in, but a bonus or a running total that has not had its turn yet still gets it afterwards
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
  ledPlay([ledMsg("count", "FINAL", 7, { from: Math.min(V.lastTotal, score), value: score, suffix: " FT", final: true, wait: 0.5 })], true);
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
      g.fillStyle = LED_C.yellow; g.fillRect(0, 0, WW, HH);
      ledText(g, m.text, x0, yBig, sx, big, "#000000");
      return;
    }
    const span = 6 * big + 5, ph = calm ? 0 : Math.floor((t * 46) % span);
    for (let k = 0; k < 12; k++) {                          // chevrons racing outward on both sides
      const off = Math.round(w / 2) + 9 + k * span + ph;
      if (off > mid + span) break;
      const cc = k % 2 ? LED_C.red : LED_C.orange;
      ledText(g, ">", mid + off, yBig, big, big, cc);
      ledText(g, "<", mid - off - 5 * big, yBig, big, big, cc);
    }
    const cyc = [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0, yBig, sx, big, calm ? LED_C.yellow : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 14; i++) g.fillRect((vrand() * WW) | 0, (vrand() * HH) | 0, 1, 1); }
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

/* ---------------- Geometry helpers ---------------- */

// A box with every edge and corner rounded. Each face keeps its own material slot (+x -x +y -y +z -z),
// and its texture is stretched corner to corner.
function roundBox(T, w, h, d, r) {
  const s = 4, per = (s + 1) * (s + 1), half = 0.5 / s;
  r = Math.min(r, w / 2, h / 2, d / 2);
  const g = new T.BoxGeometry(1, 1, 1, s, s, s);
  const pos = g.attributes.position, nor = g.attributes.normal, tuv = g.attributes.uv;
  const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    let nx = px - Math.sign(px) * half, ny = py - Math.sign(py) * half, nz = pz - Math.sign(pz) * half;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const x = bx * Math.sign(px) + nx * r, y = by * Math.sign(py) + ny * r, z = bz * Math.sign(pz) + nz * r;
    pos.setXYZ(i, x, y, z); nor.setXYZ(i, nx, ny, nz);
    const side = Math.floor(i / per);
    if (side < 2) tuv.setXY(i, 0.5 + (side ? z : -z) / d, 0.5 + y / h);
    else if (side < 4) tuv.setXY(i, 0.5 + x / w, 0.5 - z / d);
    else tuv.setXY(i, 0.5 + (side === 4 ? x : -x) / w, 0.5 + y / h);
  }
  pos.needsUpdate = nor.needsUpdate = tuv.needsUpdate = true;
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// The line of the outfield wall, foul pole to foul pole: a point every degree with the way "out" at each.
function fencePath() {
  const p = [];
  for (let a = -45; a <= 45.001; a += 1) {
    const r = fence(a), s = Math.sin(a * DEG), c = Math.cos(a * DEG);
    p.push({ x: r * s, z: -r * c, nx: s, nz: -c, a: a, len: 0 });
  }
  return p;
}
// The wall down one foul line and around behind the plate (sg = 1 first-base side, -1 third-base side).
function sidePath(sg) {
  const list = [];
  for (let a = 45; a < 60; a += 1) list.push(a);
  for (let a = 60; a < SIDE_A0 - 1; a += 2.5) list.push(a);
  for (let a = SIDE_A0; a < 180; a += 5) list.push(a);
  list.push(180);
  if (sg < 0) list.reverse();                              // always walked in the direction of rising angle
  const p = [], n0 = { x: Math.sin(sg * SIDE_A0 * DEG), z: -Math.cos(SIDE_A0 * DEG) };
  let len = 0;
  for (let i = 0; i < list.length; i++) {
    const aa = list[i], a = sg * aa, r = sideWall(aa), s = Math.sin(a * DEG), c = Math.cos(a * DEG);
    const q = { x: r * s, z: -r * c, nx: aa < SIDE_A0 ? n0.x : s, nz: aa < SIDE_A0 ? n0.z : -c, a: a, len: 0 };
    if (i) len += Math.hypot(q.x - p[i - 1].x, q.z - p[i - 1].z);
    q.len = len; p.push(q);
  }
  return p;
}
// Bands swept along a wall line. segs: [k0, y0, v0, k1, y1, v1, uShift], k = feet out from the line, y = height.
// The front of every band faces the field (a wall) or the sky (a step).
function sweep(T, path, segs, uOf) {
  const pos = [], nor = [], uv = [], idx = [], n = path.length;
  for (let j = 0; j < segs.length; j++) {
    const s = segs[j], dk = s[3] - s[0], dy = s[4] - s[1], l = Math.hypot(dk, dy) || 1, nk = -dy / l, ny = dk / l, base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const p = path[i], u = (uOf ? uOf(p) : 0) + (s[6] || 0);
      pos.push(p.x + p.nx * s[0], s[1], p.z + p.nz * s[0], p.x + p.nx * s[3], s[4], p.z + p.nz * s[3]);
      nor.push(p.nx * nk, ny, p.nz * nk, p.nx * nk, ny, p.nz * nk);
      uv.push(u, s[2], u, s[5]);
    }
    for (let i = 0; i < n - 1; i++) { const o = base + i * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// The flat end of a stand: its cross-section (k, y) stood up at one point of the wall line.
function endCap(T, p, poly) {
  const pts = poly.map(function (q) { return new T.Vector2(q[0], q[1]); });
  const tris = T.ShapeUtils.triangulateShape(pts, []), pos = [], idx = [];
  poly.forEach(function (q) { pos.push(p.x + p.nx * q[0], q[1], p.z + p.nz * q[0]); });
  tris.forEach(function (t) { idx.push(t[0], t[1], t[2]); });
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ---------------- Players ----------------
   Each player is built from sculpted parts: a lofted torso with a broad chest and a narrow waist, baggy knickers,
   limbs turned on a lathe with real muscle and cloth profiles, fists with fingers, a modelled head with a face,
   and an old-time pillbox cap. Every frame the parts are placed from a pose, a short list of numbers (PK below).
   Elbows and knees are solved from where the hands and feet are.
   Player space is life-size feet, facing +z, with the player's own left at +x. */
const UNI = { royal: "#1f4fc8", royalDk: "#163a96", navy: "#0d1a46", white: "#ffffff", tan: "#d8c59c", tanDk: "#a8926a",
              red: "#c81d25", redDk: "#8e1218", sani: "#f2efe6", gold: "#f5b81e" };
// Pose channels. x y z: hips. hip / sh: which way the hips and the shoulders face (deg, + turns toward the
// player's left). lean: forward bend. l / r: hands (l is the bottom hand on the bat for the batter).
// lf / rf: ankles, lfa / rfa: which way each foot points. head: where the face points (deg, like hip).
// nod: chin down. roll: shoulders tilt (+ drops the right shoulder). doff: cap lifted off.
// phi / el: the bat, around and up. lel / rel: elbows lifted out. f: the free left hand, onbat: left hand
// on the bat (1) or free (0), brim: left hand on the brim of the cap. lez / rez: front / back elbow swung toward the plate.
const PK = ["x", "y", "z", "hip", "sh", "lean", "lx", "ly", "lz", "rx", "ry", "rz", "lfx", "lfy", "lfz", "rfx", "rfy", "rfz",
            "head", "nod", "roll", "doff", "phi", "el", "lfa", "rfa", "lel", "rel", "fx", "fy", "fz", "onbat", "brim", "lez", "rez"];
const PX = {};
PK.forEach(function (k, i) { PX[k] = i; });
function pose(o, base) {
  const a = base ? base.slice() : new Array(PK.length).fill(0);
  if (!base) { a[PX.y] = 3.2; a[PX.lfy] = a[PX.rfy] = 0.33; a[PX.onbat] = 1; }
  for (const k in o) a[PX[k]] = o[k];
  return a;
}

/* The batter. Between pitches he stands square to the stands behind the plate with the bat on his shoulder and a
   hand on his hip (SWAG), lifts his cap to the crowd, then settles into a tall old-time stance with the bat cocked
   over his back shoulder. A small leg kick and stride ride along with the pitch, and the swing runs from wherever he
   is at the tap. The bat's heading (phi) only ever increases through a swing: up over the back shoulder (-110),
   down through the slot, level through the ball (12) and round to the finish over his front shoulder (220). */
const B_SWAG = pose({ x: 0, y: 3.12, z: 0.1, hip: -52, sh: -72, lean: -4, lx: -0.97, ly: 4.0, lz: -0.69, phi: -252, el: 57,
                      lfx: 0.75, lfz: 0.55, rfx: -0.75, rfz: -0.45, lfa: -40, rfa: -65, head: -55, nod: -6, lel: 0.9, rel: 0.2,
                      fx: 0.5, fy: 3.32, fz: 0.62, onbat: 0 });
const B_LOOK = pose({ hip: -54, sh: -76, head: -80, nod: 2 }, B_SWAG);             // turned full to the stands behind the plate
// The stance: tall and square to the plate (hips and shoulders both facing it, shoulders level), feet shoulder width
// with the weight a little on the back foot, knees soft over the toes, a small hip hinge. Hands together on the
// handle just in front of and below the back shoulder, the bat up at 45 degrees with the barrel over and behind that
// shoulder, the back elbow out behind at a little under shoulder height, the front arm across the chest with its
// elbow down toward the plate. Head turned full to the pitcher, eyes level.
const B_STANCE = pose({ x: -0.1, y: 3.16, z: 0.12, hip: 0, sh: 0, lean: 9, roll: 0, lx: -0.85, ly: 4.55, lz: 0.9, phi: -132, el: 45,
                        lfx: 0.95, lfz: 0.14, rfx: -1.0, rfz: 0.1, lfa: 4, rfa: 0, head: 90, nod: -3, lel: 0, rel: 0.75, lez: 1.1, rez: 0.6, onbat: 1 });
const B_LIFT = pose({ x: -0.2, y: 3.18, hip: -6, sh: -8, lx: -0.95, ly: 4.6, lz: 0.85, phi: -128, el: 47, lfx: 0.6, lfy: 0.6, lfz: 0.15, lfa: 0 }, B_STANCE);
const B_STRIDE = pose({ x: 0.1, y: 3.08, z: 0.14, hip: -3, sh: -6, lean: 10, lx: -0.92, ly: 4.55, lz: 0.88, phi: -124, el: 45, lfx: 1.38, lfy: 0.33, lfz: 0.18, lfa: 18 }, B_STANCE);
const B_CONTACT = pose({ x: 0.32, y: 2.96, z: 0.18, hip: 52, sh: 66, lean: 13, roll: 12, lx: 0.6, ly: 3.45, lz: 1.1, phi: 12, el: -8,
                         rfx: -0.92, rfy: 0.5, rfz: 0.14, rfa: 50, lfa: 30, head: 78, nod: 12, lel: 0.05, rel: 0, lez: 0, rez: 0 }, B_STRIDE);
const B_EXTEND = pose({ x: 0.4, y: 3.02, hip: 85, sh: 115, lean: 9, roll: 5, lx: 1.35, ly: 3.9, lz: 0.9, phi: 95, el: 6,
                        rfx: -0.78, rfy: 0.62, rfz: 0.25, rfa: 80, head: 70, nod: 6 }, B_CONTACT);
const B_FINISH = pose({ x: 0.38, y: 3.12, z: 0.15, hip: 95, sh: 140, lean: 0, roll: -6, lx: 0.1, ly: 5.25, lz: -0.55, phi: 220, el: 22,
                        rfx: -0.45, rfy: 0.7, rfz: 0.4, rfa: 95, head: 55, nod: -10, lel: 0.6, rel: 0.3 }, B_EXTEND);
// The launch: front foot down, hips starting to open, hands dropping into the slot with the bat flattening behind.
const B_LAUNCH = pose({ x: 0.22, y: 3.02, hip: 22, sh: 14, lean: 11, roll: 6, lx: -0.35, ly: 4.35, lz: 0.85, phi: -45, el: 12,
                        lfx: 1.38, lfy: 0.33, lfz: 0.18, lfa: 22, rfx: -0.98, rfy: 0.4, rfz: 0.12, rfa: 20, head: 82, nod: 6, lel: 0.1, rel: 0.3, lez: 0.4 }, B_STRIDE);
const LOAD_KEYS = [0, 0.12, 0.42, 0.7];                   // fraction of the pitch's flight: still, leg lift, stride down
const LOAD_POSES = [B_STANCE, B_STANCE, B_LIFT, B_STRIDE];
// Seconds after the tap: start, launch, contact (moved per swing to when bat and ball meet), extension, finish.
const SWING_KEYS = [0, 0.09, SWING_T, SWING_T + 0.09, SWING_T + 0.3];
const SWING_POSES = [null, B_LAUNCH, pose({}, B_CONTACT), B_EXTEND, B_FINISH];   // the first is wherever he was when he swung

/* The pitcher: an old-school full windup. k runs 0 to 1 through the windup and reaches the release at exactly 1,
   where the pitch leaves his hand (R.rel). */
const P_SET = pose({ x: 0, y: 3.22, z: -0.3, lean: 4, lx: 0.14, ly: 4.3, lz: 0.42, rx: -0.06, ry: 4.32, rz: 0.45,
                     lfx: 0.42, lfz: -0.25, rfx: -0.42, rfz: -0.3, lfa: 8, rfa: -8, nod: 4, lel: 0.1, rel: 0.1 });
const P_UP = pose({ y: 3.24, z: -0.45, lean: -6, lx: 0.12, ly: 6.5, lz: -0.1, rx: -0.08, ry: 6.55, rz: -0.05, lfx: 0.48, lfy: 0.38, lfz: -0.8, lfa: 0, nod: -4, lel: 1, rel: 1 }, P_SET);
const P_PIVOT = pose({ x: -0.05, y: 3.2, z: -0.3, hip: -60, sh: -70, lean: 0, lx: -0.1, ly: 4.7, lz: 0.32, rx: -0.2, ry: 4.65, rz: 0.2,
                       lfx: 0.35, lfy: 0.6, lfz: -0.35, lfa: -40, rfx: -0.1, rfz: -0.25, rfa: -90, head: 10, nod: 2, lel: 0.4, rel: 0.4 }, P_SET);
const P_LIFT = pose({ x: 0.05, y: 3.24, hip: -90, sh: -100, lean: -4, lx: -0.45, ly: 4.85, lz: 0.25, rx: -0.5, ry: 4.8, rz: 0.05,
                      lfx: -0.55, lfy: 1.75, lfz: 0.3, lfa: -70, head: 8, lel: 0.3, rel: 0.3 }, P_PIVOT);
const P_STRIDE = pose({ x: 0.05, y: 2.78, z: 1.0, hip: -55, sh: -95, lean: 2, lx: 0.5, ly: 4.95, lz: 1.9, rx: 0.12, ry: 5.5, rz: -1.35,
                        lfx: 0.35, lfy: 0.33, lfz: 2.9, lfa: -25, rfx: 0, rfy: 0.42, rfz: -0.28, rfa: -85, head: 2, nod: 0, lel: 0.6, rel: 1 }, P_LIFT);
const P_RELEASE = pose({ x: 0, y: 2.72, z: 1.55, hip: 5, sh: 30, lean: 28, roll: -10, lx: 0.62, ly: 4.15, lz: 1.95, rx: -0.8, ry: 6.0, rz: 3.55,
                         rfx: -0.15, rfy: 0.6, rfz: 0.05, rfa: -55, head: 0, nod: 12, lel: 0.5, rel: 0.6 }, P_STRIDE);
const P_FOLLOW = pose({ x: 0.1, y: 2.58, z: 2.1, hip: 35, sh: 70, lean: 45, roll: 0, lx: 0.75, ly: 3.85, lz: 1.75, rx: 0.9, ry: 2.65, rz: 3.6,
                        rfx: -0.4, rfy: 1.35, rfz: 1.3, rfa: -10, nod: 16, lel: 0.4, rel: 0.1 }, P_RELEASE);
const P_FIELD = pose({ x: 0.05, y: 2.95, z: 2.35, hip: 0, sh: 0, lean: 16, lx: 0.45, ly: 4.0, lz: 3.25, rx: -0.4, ry: 3.85, rz: 3.15,
                       lfx: 0.55, lfy: 0.33, lfz: 2.85, lfa: 0, rfx: -0.75, rfy: 0.33, rfz: 2.6, rfa: 0, head: 0, nod: 6, lel: 0.3, rel: 0.3 }, P_FOLLOW);
const PIT_KEYS = [0, 0.22, 0.42, 0.6, 0.84, 1.0, 1.4, 2.0];   // set, arms up, pivot, leg lift, stride, release, follow through, fielding
const PIT_POSES = [P_SET, P_UP, P_PIVOT, P_LIFT, P_STRIDE, P_RELEASE, P_FOLLOW, P_FIELD];
const PIT_RELEASE = 5;

const poseA = pose({}), poseB = pose({}), poseC = pose({});
function sstep(a, b, x) { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); }
// Smooth (Catmull-Rom) path through the key poses: no corners at the keys, and it passes through each one exactly.
function poseAt(keysK, poses, k, out) {
  const n = keysK.length;
  let i = 0;
  while (i < n - 2 && k > keysK[i + 1]) i++;
  const u = clamp((k - keysK[i]) / (keysK[i + 1] - keysK[i]), 0, 1), u2 = u * u, u3 = u2 * u;
  const p0 = poses[Math.max(0, i - 1)], p1 = poses[i], p2 = poses[i + 1], p3 = poses[Math.min(n - 1, i + 2)];
  for (let j = 0; j < p1.length; j++) {
    out[j] = 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * u3);
  }
  return out;
}
function mixPose(a, b, u, out) {
  for (let n = 0; n < a.length; n++) out[n] = a[n] + (b[n] - a[n]) * u;
  return out;
}

/* Uniform paint (all drawn here). Royal blue jersey, tan knickers, navy belt, red socks, striped pillbox cap. */
// Light diagonal weave for the knickers.
function hatch(g, w, h, step, col, a) {
  g.save(); g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = 1;
  g.beginPath();
  for (let x = -h; x < w + h; x += step) { g.moveTo(x, 0); g.lineTo(x + h, h); g.moveTo(x + h, 0); g.lineTo(x, h); }
  g.stroke(); g.restore();
}
// The chest wordmark, at its true shape (it is squeezed into the texture later, so it looks right on the body).
function wordmarkCanvas() {
  const c = mkCanvas(1000, 340), g = c.getContext("2d"), txt = "Nostalgia Pro";
  g.lineJoin = "round"; g.lineCap = "round"; g.textAlign = "center"; g.textBaseline = "alphabetic";
  let fs = 190;
  g.font = 'italic 900 ' + fs + 'px Georgia, "Times New Roman", "Noto Serif", serif';
  const w = g.measureText(txt).width;
  if (w > 880) { fs = Math.floor(fs * 880 / w); g.font = 'italic 900 ' + fs + 'px Georgia, "Times New Roman", "Noto Serif", serif'; }
  g.save(); g.translate(500, 200); g.rotate(-0.09);
  // the tail swash under the lettering, like the old ball club scripts
  g.beginPath(); g.moveTo(-420, 62); g.quadraticCurveTo(0, 128, 455, 22);
  g.strokeStyle = UNI.white; g.lineWidth = 46; g.stroke();
  g.lineWidth = 34; g.strokeText(txt, 0, 0);
  g.strokeStyle = UNI.white; g.lineWidth = 30; g.strokeText(txt, 0, 0);
  g.strokeStyle = UNI.navy; g.lineWidth = 22; g.beginPath(); g.moveTo(-420, 62); g.quadraticCurveTo(0, 128, 455, 22); g.stroke();
  g.fillStyle = UNI.navy; g.fillText(txt, 0, 0);
  g.lineWidth = 7; g.strokeText(txt, 0, 0);               // a touch heavier so it holds up small
  g.restore();
  return c;
}
// The jersey round the torso: u = .5 is the chest, the seam runs down the back. v runs from the waist (y 0) to the neck (y 2.55).
// The torso is about 5.5 ft round and 2.55 ft tall, so one foot is ~93 px across but ~200 px down: lettering is
// drawn squeezed by that ratio so it comes out the right shape on the body.
function torsoCanvas(o) {
  const c = mkCanvas(512, 512), g = c.getContext("2d");
  const row = function (y) { return (2.55 - y) / 2.55 * 512; }, PXF = 512 / o.round;   // px per foot across
  const bg = g.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, UNI.royal); bg.addColorStop(0.75, UNI.royal); bg.addColorStop(1, UNI.royalDk);
  g.fillStyle = bg; g.fillRect(0, 0, 512, 512);
  hatch(g, 512, 512, 7, "#ffffff", 0.05);
  // wordmark across the chest
  const wm = wordmarkCanvas(), ww = o.wordW * PXF, wh = ww * wm.height / wm.width * 200 / PXF;
  g.drawImage(wm, 256 - ww / 2, row(o.chestY) - wh / 2, ww, wh);
  if (o.num) {                                              // the number on the back, split across the seam
    const n = mkCanvas(200, 260), ng = n.getContext("2d");
    ng.font = '900 230px "Arial Black", Arial, sans-serif'; ng.textAlign = "center"; ng.textBaseline = "middle"; ng.lineJoin = "round";
    ng.lineWidth = 24; ng.strokeStyle = UNI.navy; ng.strokeText(o.num, 100, 136);
    ng.fillStyle = UNI.white; ng.fillText(o.num, 100, 136);
    const nw = 0.62 * PXF, nh = 0.78 * 200;
    [0, 512].forEach(function (x) { g.drawImage(n, x - nw / 2, row(1.18) - nh / 2, nw, nh); });
  }
  // neck, collar and a short buttoned placket
  g.fillStyle = o.skin; g.fillRect(0, 0, 512, row(2.12));
  g.fillStyle = UNI.navy; g.fillRect(0, row(2.12), 512, row(1.98) - row(2.12));
  g.fillRect(256 - 7, row(2.0), 14, row(1.55) - row(2.0));
  g.fillStyle = UNI.white;
  [1.88, 1.74, 1.61].forEach(function (y) { g.beginPath(); g.arc(256, row(y), 3.5, 0, TAU); g.fill(); });
  g.fillRect(0, row(1.985), 512, 2);
  return c;
}
// The knickers round the hips, with the navy belt (loops and a buckle) on top.
function pelvisCanvas() {
  const c = mkCanvas(256, 128), g = c.getContext("2d"), row = function (y) { return (0.2 - y) / 1.02 * 128; };
  g.fillStyle = UNI.tan; g.fillRect(0, 0, 256, 128);
  hatch(g, 256, 128, 6, UNI.tanDk, 0.35);
  g.fillStyle = UNI.navy; g.fillRect(0, row(0.17), 256, row(0.02) - row(0.17));
  g.fillStyle = UNI.tan;
  [20, 70, 186, 236].forEach(function (x) { g.fillRect(x - 3, row(0.2), 6, row(0.0) - row(0.2)); });
  g.fillStyle = "#c9ccd2"; g.fillRect(128 - 9, row(0.16), 18, row(0.03) - row(0.16));
  g.fillStyle = UNI.navy; g.fillRect(128 - 4, row(0.13), 8, row(0.06) - row(0.13));
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(127, row(0.02), 2, 40);  // fly seam
  return c;
}
// A limb: bands from the top of the bone (row 0) down to the joint below. [from, to, color, pattern]
function bandCanvas(bands) {
  const c = mkCanvas(64, 128), g = c.getContext("2d");
  bands.forEach(function (b) {
    const y0 = Math.round(b[0] * 128), y1 = Math.round(b[1] * 128);
    g.fillStyle = b[2]; g.fillRect(0, y0, 64, y1 - y0);
    if (b[3] === "hatch") { g.save(); g.beginPath(); g.rect(0, y0, 64, y1 - y0); g.clip(); hatch(g, 64, 128, 6, UNI.tanDk, 0.35); g.restore(); }
    if (b[3] === "stirrup") { g.fillStyle = UNI.red; g.fillRect(0, y0, 18, y1 - y0); g.fillRect(32, y0, 18, y1 - y0); }
  });
  return c;
}
// Pillbox cap: royal with thin white hoops, a navy band, the flat top, NP on the front (u = .5).
function capCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  g.fillStyle = UNI.royal; g.fillRect(0, 0, 512, 256);
  g.fillStyle = UNI.white;
  for (let y = 60; y < 216; y += 30) g.fillRect(0, y, 512, 8);
  g.fillStyle = UNI.navy; g.fillRect(0, 216, 512, 40);        // the band round the bottom
  g.fillStyle = UNI.royal; g.fillRect(0, 0, 512, 44);          // the top
  g.save(); g.translate(256, 140); g.scale(0.62, 1);
  g.font = 'bold 118px Georgia, "Times New Roman", "Noto Serif", serif'; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = 26; g.strokeStyle = UNI.navy; g.strokeText("NP", 0, 0);
  g.fillStyle = UNI.white; g.fillText("NP", 0, 0);
  g.restore();
  return c;
}

/* Geometry builders */
function mat4(T, x, y, z, sx, sy, sz, rx, ry, rz) {
  return new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0)), new T.Vector3(sx, sy == null ? sx : sy, sz == null ? sx : sz));
}
// Many small pieces baked into one mesh (one draw call). Each piece: geometry, matrix, color, optional fixed uv.
function mergeParts(T, parts) {
  const pos = [], nor = [], col = [], uv = [], idx = [];
  const v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3(), c = new T.Color();
  let base = 0;
  parts.forEach(function (p) {
    const g = p.g, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    nm.getNormalMatrix(p.m); c.set(p.c == null ? 0xffffff : p.c);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(p.m); pos.push(v.x, v.y, v.z);
      n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z);
      col.push(c.r, c.g, c.b);
      if (p.uv) uv.push(p.uv[0], p.uv[1]); else if (U) uv.push(U.getX(i), U.getY(i)); else uv.push(0, 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < P.count; i++) idx.push(base + i);
    base += P.count;
  });
  const out = new T.BufferGeometry();
  out.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  out.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  out.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}
// A rounded box: a sphere pushed out toward its corners (p < 1 is squarer).
function blobGeo(T, p, ws, hs) {
  const g = new T.SphereGeometry(1, ws || 16, hs || 12), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const f = function (v) { return Math.sign(v) * Math.pow(Math.abs(v), p); };
    P.setXYZ(i, f(P.getX(i)), f(P.getY(i)), f(P.getZ(i)));
  }
  g.computeVertexNormals();
  return g;
}
// A body section lofted through rings [y, half width, front depth, back depth]. Squarish where p < 1.
// u = .5 at the front, the seam at the back; v from the lowest ring to the highest.
function loftGeo(T, rings, n, p) {
  const pos = [], uv = [], idx = [], y0 = rings[0][0], y1 = rings[rings.length - 1][0];
  for (let j = 0; j < rings.length; j++) {
    const r = rings[j];
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU, s = Math.sin(a), c = -Math.cos(a);
      const sx = Math.sign(s) * Math.pow(Math.abs(s), p), sz = Math.sign(c) * Math.pow(Math.abs(c), p);
      pos.push(r[1] * sx, r[0], (c > 0 ? r[2] : r[3]) * sz);
      uv.push(1 - i / n, (r[0] - y0) / (y1 - y0));          // so lettering reads the right way round from the front
    }
  }
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const N = g.attributes.normal;                            // one smooth normal across the seam
  for (let j = 0; j < rings.length; j++) {
    const a = j * (n + 1), b = a + n;
    const x = N.getX(a) + N.getX(b), y = N.getY(a) + N.getY(b), z = N.getZ(a) + N.getZ(b), l = Math.hypot(x, y, z) || 1;
    N.setXYZ(a, x / l, y / l, z / l); N.setXYZ(b, x / l, y / l, z / l);
  }
  g.computeBoundingSphere();
  return g;
}
// A round shape turned on a lathe along +y from a profile [y, radius]. v runs 1 at y = 0 to 0 at y = L0
// (or, with up set, 0 at the bottom to 1 at the top). k scales the radius.
function latheGeo(T, prof, L0, k, n, up) {
  const pos = [], nor = [], uv = [], idx = [], m = prof.length;
  for (let j = 0; j < m; j++) {
    const y = prof[j][0], r = prof[j][1] * k;
    const pa = prof[Math.max(0, j - 1)], pb = prof[Math.min(m - 1, j + 1)];
    let dy = pb[0] - pa[0], dr = (pb[1] - pa[1]) * k;
    const l = Math.hypot(dy, dr) || 1; dy /= l; dr /= l;
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU, s = Math.sin(a), c = -Math.cos(a);
      pos.push(r * s, y, r * c); nor.push(dy * s, -dr, dy * c);
      uv.push(1 - i / n, up ? clamp(y / L0, 0, 1) : 1 - clamp(y / L0, 0, 1));
    }
  }
  for (let j = 0; j < m - 1; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}
// A tube along a curve that swells and tapers (the mustache, the smirk).
function tubeGeo(T, pts, rf, n, m) {
  const curve = new T.CatmullRomCurve3(pts.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }));
  const fr = curve.computeFrenetFrames(n, false), pos = [], nor = [], idx = [], P = new T.Vector3(), N = new T.Vector3();
  for (let i = 0; i <= n; i++) {
    curve.getPointAt(i / n, P);
    const r = rf(i / n);
    for (let j = 0; j <= m; j++) {
      const a = j / m * TAU;
      N.copy(fr.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a));
      pos.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r); nor.push(N.x, N.y, N.z);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a = i * (m + 1) + j, b = a + 1, c = a + m + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// Head, face, hair, mustache and sideburns in one mesh (vertex colors). Head space: center of the head, facing +z.
function headGeo(T, o) {
  const S = new T.SphereGeometry(1, 18, 13), s = new T.SphereGeometry(1, 10, 7), box = blobGeo(T, 0.55, 16, 12), parts = [];
  function add(g, c, x, y, z, sx, sy, sz, rx, ry, rz) { parts.push({ g: g, c: c, m: mat4(T, x, y, z, sx, sy, sz, rx, ry, rz) }); }
  const skin = o.skin, shade = o.shade, hair = o.hair, J = o.slugger ? 1 : 0.88;
  add(S, skin, 0, 0.06, -0.02, 0.43, 0.48, 0.47);                            // cranium
  add(box, skin, 0, -0.19, 0.06, 0.42 * J, 0.29, 0.42);                       // big square jaw
  add(box, skin, 0, -0.37, 0.27, 0.2 * J, 0.12, 0.13);                        // chin
  add(s, skin, 0, 0.165, 0.37, 0.36, 0.075, 0.12);                           // heavy brow
  [-1, 1].forEach(function (sg) {
    add(s, shade, sg * 0.43, -0.02, -0.04, 0.065, 0.14, 0.095);           // ears
    add(s, skin, sg * 0.25, -0.04, 0.36, 0.11, 0.08, 0.07);                // cheekbones
    add(s, 0xffffff, sg * 0.155, 0.075, 0.425, 0.072, 0.05, 0.045);        // eyes
    add(s, 0x16100c, sg * 0.15, 0.072, 0.455, 0.04, 0.046, 0.025);
    add(s, skin, sg * 0.155, 0.112, 0.43, 0.085, 0.045, 0.055);             // heavy lids: a confident squint
    const up = sg > 0 ? 0.03 : 0;                                            // one eyebrow cocked
    add(s, hair, sg * 0.16, 0.19 + up, 0.43, 0.13, 0.04, 0.05, 0, 0, sg * (sg > 0 ? 0.24 : -0.08));
    add(s, hair, sg * 0.41, -0.1, 0.06, 0.07, 0.27, 0.12, 0.1);            // long thick sideburns
    add(s, shade, sg * 0.05, -0.135, 0.485, 0.045, 0.035, 0.04);          // nostrils
  });
  add(s, skin, 0, -0.01, 0.47, 0.07, 0.15, 0.09, -0.25);                     // a strong straight nose
  add(s, shade, 0, -0.105, 0.52, 0.075, 0.062, 0.07);
  add(new T.SphereGeometry(1, 18, 8, 0, TAU, 0, Math.PI * 0.5), hair, 0, 0.05, -0.03, 0.448, 0.5, 0.49, -0.5);   // hair, slicked back
  add(s, hair, 0, -0.06, -0.35, 0.36, 0.25, 0.16);                           // at the nape
  if (o.mustache) {                                          // a huge handlebar, curled right round at the tips
    const rf = function (u) { return (0.085 - 0.07 * u) * sstep(0, 0.05, u) * (1 - sstep(0.93, 1, u)) + 0.008; };
    const pts = [[0, -0.17, 0.53], [0.12, -0.2, 0.505], [0.26, -0.19, 0.45], [0.38, -0.14, 0.38], [0.47, -0.05, 0.31], [0.505, 0.05, 0.28],
                 [0.47, 0.125, 0.28], [0.41, 0.11, 0.3], [0.405, 0.05, 0.31], [0.44, 0.03, 0.305]];
    [-1, 1].forEach(function (sg) {
      add(tubeGeo(T, pts.map(function (p) { return [sg * p[0], p[1], p[2]]; }), rf, 34, 8), hair, 0, 0, 0, 1);
    });
  } else add(s, hair, 0, -0.17, 0.49, 0.17, 0.035, 0.05);                    // a trim mustache
  // the smirk: one corner up
  add(tubeGeo(T, [[-0.11, -0.27, 0.425], [0, -0.29, 0.448], [0.09, -0.278, 0.44], [0.15, -0.245, 0.41]], function (u) { return 0.017 * Math.sin(Math.PI * clamp(u, 0.04, 0.96)); }, 12, 6), 0x6e231c, 0, 0, 0, 1);
  add(s, shade, 0.01, -0.315, 0.43, 0.09, 0.025, 0.035);                     // lower lip
  return mergeParts(T, parts);
}

// Old-time pillbox cap: a straight-sided drum with a flat top and a short bill, sat a little back on the head.
function capGeo(T) {
  const drum = latheGeo(T, [[0, 0.455], [0.04, 0.46], [0.3, 0.45], [0.345, 0.44], [0.36, 0.41], [0.365, 0.2], [0.365, 0]], 0.365, 1, 24, true);
  const tilt = -0.12, base = mat4(T, 0, 0.16, -0.03, 1, 1, 1.06, tilt);
  return mergeParts(T, [
    { g: drum, m: base },
    { g: new T.SphereGeometry(1, 16, 6, 0, TAU, 0, Math.PI / 2), m: mat4(T, 0, 0.18, 0.41, 0.34, 0.03, 0.19, tilt + 0.16), uv: [0.05, 0.08] }   // bill
  ]);
}
// A cleat, ankle at the origin, flat sole 0.33 below it, with a raised heel.
function shoeGeo(T) {
  const foot = new T.SphereGeometry(1, 14, 9), heel = new T.SphereGeometry(1, 10, 7);
  [foot, heel].forEach(function (g) {
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) if (P.getY(i) < -0.75) { P.setY(i, -0.75); N.setXYZ(i, 0, -1, 0); }
  });
  return mergeParts(T, [
    { g: foot, m: mat4(T, 0, -0.1875, 0.2, 0.19, 0.19, 0.48) },
    { g: heel, m: mat4(T, 0, -0.17, -0.06, 0.17, 0.215, 0.2) }
  ]);
}
// A fist closed round a bat handle: the handle runs along x through the origin, the wrist is down -y.
function fistGeo(T, k) {
  const parts = [], box = blobGeo(T, 0.6, 12, 10), s = new T.SphereGeometry(1, 10, 7);
  parts.push({ g: box, m: mat4(T, 0, -0.06, -0.075, 0.175 * k, 0.15 * k, 0.07 * k) });            // back of the hand
  parts.push({ g: s, m: mat4(T, 0, -0.17 * k, -0.04, 0.11 * k, 0.08 * k, 0.085 * k) });           // wrist
  [-0.105, -0.035, 0.035, 0.105].forEach(function (x, i) {                                      // four fingers wrapped round
    const f = new T.TorusGeometry(0.072 * k, 0.037 * k, 6, 10, Math.PI * (1.42 - i * 0.03));
    parts.push({ g: f, m: mat4(T, x * k, 0, 0, 1, 1, 1, 0, Math.PI / 2, 0) });
  });
  parts.push({ g: s, m: mat4(T, 0.1 * k, -0.06 * k, 0.07 * k, 0.05 * k, 0.1 * k, 0.045 * k, 0.5, 0, -0.9) });   // thumb
  return mergeParts(T, parts);
}
// A leather glove: a padded mitt with a thumb and a cuff.
function gloveGeo(T) {
  const box = blobGeo(T, 0.7, 14, 10), s = new T.SphereGeometry(1, 12, 8);
  return mergeParts(T, [
    { g: box, m: mat4(T, 0, 0.06, -0.02, 0.2, 0.25, 0.09), c: 0x8a5228 },
    { g: s, m: mat4(T, 0, 0.06, 0.06, 0.15, 0.19, 0.03), c: 0xb07440 },                  // the pocket
    { g: s, m: mat4(T, 0.17, -0.02, 0.03, 0.07, 0.15, 0.07, 0, 0, -0.45), c: 0x7a4620 },  // thumb
    { g: s, m: mat4(T, 0, -0.16, -0.02, 0.13, 0.07, 0.1), c: 0x5e3416 }                   // cuff
  ]);
}

// Builds and paints one player. o: skin, shade, hair, build ("slugger" or "lean"), mustache, glove, num.
function makePlayer(T, tex, script, env, o) {
  const big = o.build === "slugger", root = new T.Group();
  root.scale.setScalar(PS);
  const ak = big ? 1 : 0.84, lk = big ? 1 : 0.88, tw = big ? 1 : 0.84, td = big ? 1 : 0.84;
  const torsoRings = [[0, 0.5, 0.36, 0.38], [0.18, 0.52, 0.38, 0.4], [0.45, 0.6, 0.46, 0.44], [0.8, 0.78, 0.6, 0.5], [1.15, 0.92, 0.7, 0.55],
                      [1.45, 1.0, 0.68, 0.58], [1.7, 0.98, 0.52, 0.55], [1.88, 0.72, 0.4, 0.46], [2.0, 0.42, 0.32, 0.36], [2.1, 0.33, 0.3, 0.31],
                      [2.3, 0.3, 0.27, 0.28], [2.55, 0.28, 0.25, 0.26]]
    .map(function (r) { return [r[0], r[1] * tw, r[2] * td, r[3] * td]; });
  const pelvisRings = [[-0.82, 0.3, 0.24, 0.26], [-0.7, 0.64, 0.4, 0.46], [-0.45, 0.7, 0.46, 0.56], [-0.2, 0.66, 0.46, 0.55], [0.02, 0.58, 0.44, 0.46], [0.2, 0.56, 0.42, 0.44]]
    .map(function (r) { return [r[0], r[1] * lk, r[2] * lk, r[3] * lk]; });

  const lam = function (m) { return new T.MeshLambertMaterial({ map: tex(m) }); };
  const jersey = new T.MeshPhongMaterial({ map: tex(torsoCanvas({ skin: o.skin, chestY: 1.2, wordW: big ? 1.72 : 1.5, round: big ? 5.6 : 4.8, num: o.num })), specular: 0x222222, shininess: 12 });
  const knick = lam(pelvisCanvas()), tan = lam(bandCanvas([[0, 1, UNI.tan, "hatch"]])), sleeveM = new T.MeshLambertMaterial({ color: UNI.royal });
  const upperArm = lam(bandCanvas([[0, 0.45, UNI.royal], [0.45, 0.5, UNI.navy], [0.5, 0.52, UNI.white], [0.52, 1, o.skin]]));
  const shin = lam(bandCanvas([[0, 0.24, UNI.tan, "hatch"], [0.24, 0.27, UNI.tanDk], [0.27, 0.84, UNI.red], [0.84, 1, UNI.sani, "stirrup"]]));
  const skin = new T.MeshLambertMaterial({ color: o.skin }), vc = new T.MeshLambertMaterial({ vertexColors: true });
  const capMat = new T.MeshPhongMaterial({ map: tex(capCanvas()), side: T.DoubleSide, specular: 0x222222, shininess: 10 });
  const shoeM = new T.MeshPhongMaterial({ color: 0x14161b, specular: 0x777777, shininess: 50 });
  const ball = new T.SphereGeometry(1, 14, 10);
  function mesh(g, m, parent) { const x = new T.Mesh(g, m); (parent || root).add(x); return x; }

  const hips = new T.Group(); root.add(hips);
  mesh(loftGeo(T, pelvisRings, 22, 0.85), knick, hips);
  const upper = new T.Group(); root.add(upper);
  mesh(loftGeo(T, torsoRings, 26, 0.8), jersey, upper);
  const head = new T.Group(); head.position.set(0, big ? 2.74 : 2.68, big ? 0.07 : 0.05); head.scale.setScalar(big ? 1.12 : 1.04); upper.add(head);
  mesh(headGeo(T, { slugger: big, skin: o.skin, shade: o.shade, hair: o.hair, mustache: o.mustache }), vc, head);
  const helmet = mesh(capGeo(T), capMat, head);

  // limb profiles [along the bone, radius]: a short royal sleeve over a big biceps, forearms thick at the elbow,
  // baggy knickers that billow over the knee and gather into high red socks
  const UA = [[-0.06, 0], [-0.045, 0.12], [-0.01, 0.2], [0.08, 0.25], [0.3, 0.26], [0.5, 0.255], [0.56, 0.24], [0.6, 0.2], [0.7, 0.215], [0.84, 0.205],
              [0.98, 0.17], [1.1, 0.15], [1.16, 0.12], [1.2, 0.07], [1.22, 0]];
  const FA = [[-0.07, 0], [-0.05, 0.11], [-0.015, 0.16], [0.08, 0.2], [0.25, 0.215], [0.45, 0.19], [0.7, 0.15], [0.9, 0.115], [1.0, 0.1], [1.04, 0.08], [1.07, 0]];
  const TH = [[-0.12, 0], [-0.1, 0.14], [-0.05, 0.24], [0.05, 0.3], [0.3, 0.32], [0.7, 0.315], [1.05, 0.3], [1.3, 0.285], [1.45, 0.27], [1.52, 0.2], [1.56, 0]];
  const SH = [[-0.1, 0], [-0.08, 0.15], [-0.03, 0.24], [0.06, 0.285], [0.2, 0.29], [0.3, 0.255], [0.36, 0.2], [0.4, 0.18], [0.62, 0.19], [0.9, 0.145],
              [1.2, 0.11], [1.36, 0.1], [1.42, 0.07], [1.45, 0]];
  const gUA = latheGeo(T, UA, 1.12, ak, 16), gFA = latheGeo(T, FA, 1.08, ak, 14), gTH = latheGeo(T, TH, 1.42, lk, 16), gSH = latheGeo(T, SH, 1.4, lk, 14);
  const gFist = fistGeo(T, big ? 1.12 : 0.95), gShoe = shoeGeo(T);
  const hv = { x: new T.Vector3(), y: new T.Vector3(), z: new T.Vector3(), m: new T.Matrix4() };
  const arm = [0, 1].map(function (s) {
    const L = { up: mesh(gUA, upperArm), lo: mesh(gFA, skin), delt: mesh(ball, sleeveM), j1: mesh(ball, skin), l1: 1.12, l2: 1.08, hv: hv };
    L.delt.scale.set(0.24 * ak, 0.29 * ak, 0.24 * ak);
    L.j1.scale.setScalar(0.155 * ak);
    L.end = mesh(s === 0 && o.glove ? gloveGeo(T) : gFist, s === 0 && o.glove ? vc : skin);
    return L;
  });
  const leg = [0, 1].map(function () {
    const L = { up: mesh(gTH, tan), lo: mesh(gSH, shin), j1: mesh(ball, tan), j0: mesh(ball, tan), l1: 1.42, l2: 1.4 };
    L.j1.scale.setScalar(0.27 * lk); L.j0.scale.setScalar(0.28 * lk);
    return L;
  });
  const shoe = [mesh(gShoe, shoeM), mesh(gShoe, shoeM)];
  shoe.forEach(function (m) { m.rotation.order = "YXZ"; m.scale.setScalar(lk); });
  return { root: root, hips: hips, upper: upper, head: head, helmet: helmet, arm: arm, leg: leg, shoe: shoe, batter: !!o.mustache,
           shoulder: [0.96 * tw, 1.72, -0.02], hipJ: [0.38 * lk, -0.22, 0], grip: new T.Vector3() };
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
// Stand a limb mesh (modelled along +y, nominal length l0) between A and B.
function bone(mesh, A, B, l0) {
  const t = TV;
  t.d.subVectors(B, A);
  const l = t.d.length() || 1e-4;
  mesh.position.copy(A);
  mesh.quaternion.setFromUnitVectors(t.up, t.d.multiplyScalar(1 / l));
  mesh.scale.set(1, l / l0, 1);
}
// grip: the line the fist closes round (the bat), or null to close it across the bend of the arm.
function setLimb(L, A, B, pole, grip) {
  const t = TV;
  bend(A, B, pole, L.l1, L.l2, t.e);
  bone(L.up, A, t.e, L.l1); bone(L.lo, t.e, B, L.l2);
  L.j1.position.copy(t.e);
  if (L.j0) L.j0.position.copy(A);
  if (L.delt) {                                             // the shoulder cap rides along the upper arm
    L.delt.quaternion.copy(L.up.quaternion);
    L.delt.position.copy(A).addScaledVector(TV.d.subVectors(t.e, A).normalize(), 0.05);
  }
  if (L.end) {                                              // the hand: fingers closed round the grip line, wrist toward the elbow
    const h = L.hv;
    h.y.subVectors(B, t.e).normalize();
    if (grip) h.x.copy(grip); else h.x.subVectors(t.e, A).cross(h.y);
    h.x.addScaledVector(h.y, -h.x.dot(h.y));
    if (h.x.lengthSq() < 1e-6) h.x.set(1, 0, 0).addScaledVector(h.y, -h.y.x);
    h.x.normalize(); h.z.crossVectors(h.x, h.y);
    h.m.makeBasis(h.x, h.y, h.z);
    L.end.quaternion.setFromRotationMatrix(h.m);
    L.end.position.copy(B);
  }
}
const BRIM_PT = [0.34, 0.26, 0.36];                          // where the hand takes the cap, in cap space
function applyPose(P, v) {
  const t = TV, hy = v[PX.hip] * DEG, uy = v[PX.sh] * DEG, ch = Math.cos(hy), sh = Math.sin(hy), cu = Math.cos(uy), su = Math.sin(uy);
  P.hips.position.set(v[0], v[1], v[2]); P.hips.rotation.set(0, hy, 0);
  P.upper.position.set(v[0], v[1], v[2]); P.upper.rotation.set(v[PX.lean] * DEG, uy, v[PX.roll] * DEG, "YXZ");
  P.upper.updateMatrix();
  P.head.rotation.set((v[PX.nod] - v[PX.lean] * 0.7) * DEG, (v[PX.head] - v[PX.sh]) * DEG, 0, "YXZ");
  const d = v[PX.doff];                                     // lifted and tipped toward the crowd
  P.helmet.position.set(0, d * 0.3, d * 0.12); P.helmet.rotation.set(d * 0.3, 0, -d * 0.14);
  // the batter's hands close round the bat
  const phi = v[PX.phi] * DEG, el = v[PX.el] * DEG;
  P.grip.set(Math.sin(phi) * Math.cos(el), Math.sin(el), Math.cos(phi) * Math.cos(el));
  // the left hand: on the bat, free, or on the brim
  const on = v[PX.onbat], br = v[PX.brim];
  t.b.set(v[PX.fx] + (v[PX.lx] - v[PX.fx]) * on, v[PX.fy] + (v[PX.ly] - v[PX.fy]) * on, v[PX.fz] + (v[PX.lz] - v[PX.fz]) * on);
  if (br > 0) {
    P.head.updateMatrix(); P.helmet.updateMatrix();
    t.q.fromArray(BRIM_PT).applyMatrix4(P.helmet.matrix).applyMatrix4(P.head.matrix).applyMatrix4(P.upper.matrix);
    t.b.lerp(t.q, br);
  }
  for (let s = 0; s < 2; s++) {                             // 0 = left, 1 = right
    const sg = s ? -1 : 1, lift = v[s ? PX.rel : PX.lel], px = sg * (0.5 + 0.7 * lift), pz = -0.5 - 0.2 * lift + v[s ? PX.rez : PX.lez];
    t.a.set(sg * P.shoulder[0], P.shoulder[1], P.shoulder[2]).applyMatrix4(P.upper.matrix);
    if (s) t.b.set(v[PX.rx], v[PX.ry], v[PX.rz]);
    t.p.set(px * cu + pz * su, -0.8 + 0.85 * lift, -px * su + pz * cu);   // elbows hang down, out and back, or lift out
    const onBat = P.batter && (s === 1 || (on > 0.5 && br < 0.5));
    setLimb(P.arm[s], t.a, t.b, t.p, onBat ? P.grip : null);
    t.a.set(v[0] + sg * P.hipJ[0] * ch, v[1] + P.hipJ[1], v[2] - sg * P.hipJ[0] * sh);
    t.b.set(v[PX.lfx + s * 3], v[PX.lfy + s * 3], v[PX.lfz + s * 3]);
    t.p.set(sh + sg * 0.25 * ch, 0.2, ch - sg * 0.25 * sh); // knees point where the hips face
    setLimb(P.leg[s], t.a, t.b, t.p);
    const f = P.shoe[s];
    f.position.copy(t.b);
    f.rotation.set(clamp((t.b.y - 0.36) * 1.4, 0, 1.0), v[s ? PX.rfa : PX.lfa] * DEG, 0);   // toe down when the heel comes up
  }
}

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x0a1a5c, 1);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(CAM.fov, W / H, 3, 8000);
  const caps = renderer.capabilities;
  const aniso = Math.min(4, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  TV = { a: new T.Vector3(), b: new T.Vector3(), d: new T.Vector3(), e: new T.Vector3(), p: new T.Vector3(), q: new T.Vector3(), up: new T.Vector3(0, 1, 0) };

  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = aniso;
    return t;
  }
  function pol(r, a, y) { return new T.Vector3(r * Math.sin(a * DEG), y || 0, -r * Math.cos(a * DEG)); }
  function decal(mat, order) { mat.transparent = true; mat.depthWrite = false; mat._order = order; return mat; }
  function add(mesh, parent) { if (mesh.material && mesh.material._order) mesh.renderOrder = mesh.material._order; (parent || scene).add(mesh); return mesh; }
  // A flat rectangle on the ground. Texture "up" points out toward center field.
  function flat(w, d, x, y, z, mat, su, sv) {
    const g = new T.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    if (su) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }
    const m = new T.Mesh(g, mat);
    m.position.set(x, y, z);
    return add(m);
  }

  const script = scriptCanvas(scriptImg);
  const tMown = tex(mownCanvas(script)), tGrass = tex(grassCanvas(), true), tDirt = tex(dirtCanvas(), true), tInfield = tex(infieldCanvas()), tChalk = tex(chalkCanvas());
  const tWall = tex(wallCanvas(script), true), tSideWall = tex(sideWallCanvas(script), true), tSeat = tex(seatCanvas(), true);
  const tSky = tex(skyCanvas()), tSkyline = tex(skylineCanvas(), true), tLamp = tex(lampCanvas()), tGlow = tex(glowCanvas()), tShadow = tex(shadowCanvas());
  const tBall = tex(ballCanvas(script), true), tCart = tex(cartCanvas(script));
  tBall.wrapT = T.ClampToEdgeWrapping;
  const cBoard = mkCanvas(1024, 256), tBoard = tex(cBoard);
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;

  /* lights: a night game under the towers */
  scene.add(new T.HemisphereLight(0xffffff, 0x7f97d8, 1.35));
  const key = new T.DirectionalLight(0xffffff, 2.0);
  key.position.set(-160, 320, 200); scene.add(key);
  const fill = new T.DirectionalLight(0xdfeaff, 0.75);      // from behind the plate, so the batter's back never goes flat
  fill.position.set(120, 90, 260); scene.add(fill);

  /* sky, skyline, the ground outside the park */
  const sky = new T.Mesh(new T.SphereGeometry(5200, 24, 12), new T.MeshBasicMaterial({ map: tSky, side: T.BackSide, depthWrite: false }));
  sky.renderOrder = -2; scene.add(sky);
  const lineGeo = new T.CylinderGeometry(2600, 2600, 330, 48, 1, true);
  (function () { const uv = lineGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 9); })();
  const skyline = new T.Mesh(lineGeo, new T.MeshBasicMaterial({ map: tSkyline, side: T.BackSide, transparent: true, alphaTest: 0.5 }));
  skyline.position.y = 150; scene.add(skyline);
  const lotGeo = new T.CircleGeometry(2700, 40).rotateX(-Math.PI / 2);
  (function () { const p = lotGeo.attributes.position, uv = lotGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 300, -p.getZ(i) / 300); })();
  const lot = new T.Mesh(lotGeo, new T.MeshBasicMaterial({ map: tex(lotCanvas(), true) }));
  lot.position.y = -0.4; scene.add(lot);

  /* the field */
  const grassGeo = new T.BufferGeometry();                // the turf runs out to the walls and stops there
  (function () {
    const pos = [0, 0, 0], uv = [0, 0], nor = [0, 1, 0], idx = [];
    for (let a = -180; a <= 180; a += 1.5) {
      const r = (Math.abs(a) <= 45 ? fence(a) : sideWall(Math.abs(a))) + 4, x = r * Math.sin(a * DEG), z = -r * Math.cos(a * DEG);
      pos.push(x, 0, z); uv.push(x / 80, -z / 80); nor.push(0, 1, 0);
    }
    for (let i = 1; i < pos.length / 3 - 1; i++) idx.push(0, i + 1, i);
    grassGeo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    grassGeo.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
    grassGeo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    grassGeo.setIndex(idx);
  })();
  scene.add(new T.Mesh(grassGeo, new T.MeshLambertMaterial({ map: tGrass })));
  flat(240, 240, 0, 0.05, -75, decal(new T.MeshLambertMaterial({ map: tInfield }), 1));
  flat(48, 48, 0, 0.09, 0, decal(new T.MeshBasicMaterial({ map: tChalk }), 2));
  // the script wordmark mown into the grass between the plate and the mound, stretched so it reads from behind the plate
  const markW = 19, markD = 30;
  flat(markW, markD, 0, 0.08, -32.5, decal(new T.MeshLambertMaterial({ map: tMown, opacity: 0.9 }), 2));
  const chalk = new T.MeshBasicMaterial({ color: 0xf6f6f0 });
  [-1, 1].forEach(function (sg) {                          // foul lines, on out to the poles
    const m = flat(0.7, 205, 0, 0.07, 0, chalk);
    const mid = pol(227.5, sg * 45, 0.07);
    m.position.copy(mid); m.rotation.y = -sg * 45 * DEG;
  });
  const plateShape = new T.Shape([new T.Vector2(-1.13, 1), new T.Vector2(1.13, 1), new T.Vector2(1.13, -0.13), new T.Vector2(0, -1.27), new T.Vector2(-1.13, -0.13)]);
  const plate = new T.Mesh(new T.ExtrudeGeometry(plateShape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }).rotateX(-Math.PI / 2),
    new T.MeshPhongMaterial({ color: 0xffffff, specular: 0x999999, shininess: 60 }));
  plate.position.y = 0.06; scene.add(plate);
  const rubberMat = new T.MeshPhongMaterial({ color: 0xf6f6f0, specular: 0x888888, shininess: 40 });
  const baseGeo = roundBox(T, 2.5, 0.55, 2.5, 0.22);
  [[90, 45], [127.3, 0], [90, -45]].forEach(function (b) { const m = new T.Mesh(baseGeo, rubberMat); m.position.copy(pol(b[0], b[1], 0.28)); m.rotation.y = Math.PI / 4; scene.add(m); });
  const dirtMat = new T.MeshLambertMaterial({ map: tDirt });
  const moundR = (13.5 * 13.5 + MOUND_H * MOUND_H) / (2 * MOUND_H), moundGeo = new T.SphereGeometry(moundR, 30, 5, 0, TAU, 0, Math.asin(13.5 / moundR));
  (function () { const p = moundGeo.attributes.position, uv = moundGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 14, p.getZ(i) / 14); })();
  const mound = new T.Mesh(moundGeo, dirtMat); mound.position.set(0, MOUND_H - moundR + 0.06, MOUND_Z); scene.add(mound);
  const rubber = new T.Mesh(roundBox(T, 3.8, 0.3, 1.0, 0.1), rubberMat); rubber.position.set(0, MOUND_H + 0.1, MOUND_Z - 0.6); scene.add(rubber);

  /* outfield wall, the LED facade and the bleachers */
  const fp = fencePath();
  const uWall = function (p) { return (p.a + 45) / 15; };
  const padMat = new T.MeshPhongMaterial({ map: tWall, specular: 0x555555, shininess: 40, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.05 });
  scene.add(new T.Mesh(sweep(T, fp, [[0, 0, 0, 0, WALL_H, 1]], uWall), padMat));
  const darkMat = new T.MeshLambertMaterial({ color: 0x0a0f24 }), backMat = new T.MeshLambertMaterial({ color: 0x1b2f86 }), navyMat = new T.MeshLambertMaterial({ color: 0x16245e }), yellowMat = new T.MeshLambertMaterial({ color: 0xffd21f });
  const trackMat = new T.MeshLambertMaterial({ map: tDirt });
  const uTrack = function (p) { return (p.a + 45) / 3; };
  scene.add(new T.Mesh(sweep(T, fp, [[-16, 0.04, 0, 0, 0.04, 1]], uTrack), trackMat));
  scene.add(new T.Mesh(sweep(T, fp, [[0, WALL_H, 0, 1.4, WALL_H, 1]]), yellowMat));
  scene.add(new T.Mesh(sweep(T, fp, [[1.4, WALL_H, 0, 1.4, LED_Y0, 1], [1.4, LED_Y0 + LED_HT, 0, 1.4, DECK_Y, 1], [1.4, DECK_Y, 0, DECK_IN, DECK_Y, 1]]), darkMat));
  scene.add(new T.Mesh(sweep(T, fp, [[DECK_D + 1, DECK_TOP + 4, 0, DECK_D + 1, DECK_TOP, 1], [DECK_D, DECK_TOP, 0, DECK_D + DECK_TOP / BACK_SLOPE, 0, 1]]), backMat));
  const rows = [];
  for (let j = 0; j < ROWS; j++) {
    const k = DECK_IN + j * TREAD, y = DECK_Y + j * RISE;
    rows.push([k, y, 0, k, y + RISE, 0.5, j * 0.37], [k, y + RISE, 0.5, k + TREAD, y + RISE, 1, j * 0.37]);
  }
  const seatMat = new T.MeshLambertMaterial({ map: tSeat }), orangeMat = new T.MeshLambertMaterial({ color: 0xff9214 });
  scene.add(new T.Mesh(sweep(T, fp, rows, function (p) { return (p.a + 45) / 90 * 30; }), seatMat));
  // the rail along the top row
  scene.add(new T.Mesh(sweep(T, fp, [[DECK_D, DECK_TOP, 0, DECK_D, DECK_TOP + 4, 1]]), navyMat)); scene.add(new T.Mesh(sweep(T, fp, [[DECK_D, DECK_TOP + 4, 0, DECK_D + 1, DECK_TOP + 4, 1]]), orangeMat));
  const capMat = new T.MeshLambertMaterial({ color: 0x122a78, side: T.DoubleSide });
  const deckPoly = [[0, 0], [0, WALL_H], [1.4, WALL_H], [1.4, DECK_Y], [DECK_IN, DECK_Y], [DECK_D, DECK_TOP], [DECK_D + DECK_TOP / BACK_SLOPE, 0]];
  scene.add(new T.Mesh(endCap(T, fp[0], deckPoly), capMat)); scene.add(new T.Mesh(endCap(T, fp[fp.length - 1], deckPoly), capMat));
  [[0, "400"], [-22.5, "365"], [22.5, "365"], [-43.2, "330"], [43.2, "330"]].forEach(function (n) {
    const m = new T.Mesh(new T.PlaneGeometry(8.4, 5), new T.MeshBasicMaterial({ map: tex(numberCanvas(n[1])), transparent: true }));
    m.position.copy(pol(fence(n[0]) - 0.25, n[0], 5.4)); m.rotation.y = -n[0] * DEG; scene.add(m);
  });
  [-1, 1].forEach(function (sg) {                          // foul poles
    const pole = new T.Mesh(new T.CylinderGeometry(0.8, 0.8, 78, 10), new T.MeshPhongMaterial({ color: 0xffd21f, specular: 0xffffff, shininess: 80 }));
    pole.position.copy(pol(329, sg * 45, 39)); scene.add(pole);
  });

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
  scene.add(new T.Mesh(sweep(T, fp, [[1.4, LED_Y0, 0, 1.4, LED_Y0 + LED_HT, 1]], function (p) { return (p.a + 45) / 90; }), ledMat));
  const pylonGeo = roundBox(T, 5, LED_HT + 3, 2.4, 0.8);    // the posts between the three sections of the board
  [-15, 15].forEach(function (a) { const m = new T.Mesh(pylonGeo, navyMat); m.position.copy(pol(fence(a) + 1.2, a, LED_Y0 + LED_HT / 2)); m.rotation.y = -a * DEG; scene.add(m); });

  /* the crowd in the bleachers: instanced bodies and heads, one draw call each. They bounce on a home run. */
  const crowdU = { uTime: { value: 0 }, uCheer: { value: 0 } };
  function cheering(mat) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = crowdU.uTime; sh.uniforms.uCheer = crowdU.uCheer;
      sh.vertexShader = "uniform float uTime;\nuniform float uCheer;\n" + sh.vertexShader.replace("#include <begin_vertex>",
        "#include <begin_vertex>\n#ifdef USE_INSTANCING\n  float npPh = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;\n" +
        "  transformed.y += uCheer * (0.25 + 0.75 * abs(sin(uTime * 8.0 + npPh))) * 1.3;\n#endif");
    };
    return mat;
  }
  const seatsAt = [], rnd = rng(77);
  for (let j = 0; j < ROWS; j++) {
    const k = DECK_IN + (j + 0.5) * TREAD, y = DECK_Y + (j + 1) * RISE;
    let a = -44.3 + rnd();
    while (a < 44.3) { const r = fence(a) + k; if (rnd() < 0.9) seatsAt.push(r * Math.sin(a * DEG), y, -r * Math.cos(a * DEG)); a += (4.3 + rnd() * 0.6) / r / DEG; }
  }
  const bodyGeo = new T.CylinderGeometry(0.62, 0.98, 2.5, 6, 1, true); bodyGeo.translate(0, 1.25, 0);
  const headGeo = new T.SphereGeometry(0.56, 5, 3); headGeo.translate(0, 3.0, 0);
  const bodyMat = cheering(new T.MeshLambertMaterial({ color: 0xffffff })), headMat = cheering(new T.MeshLambertMaterial({ color: 0xffffff }));
  const fans = [];
  function seatCrowd(at) {                                  // at: x, y, z for every fan
    const n = at.length / 3, bodies = new T.InstancedMesh(bodyGeo, bodyMat, n), heads = new T.InstancedMesh(headGeo, headMat, n);
    const m = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), col = new T.Color(), v = new T.Vector3();
    for (let i = 0; i < n; i++) {
      const z = 1.36 * (0.88 + rnd() * 0.26);
      sc.set(z, z, z);
      m.compose(v.set(at[i * 3], at[i * 3 + 1], at[i * 3 + 2]), q, sc);
      bodies.setMatrixAt(i, m); heads.setMatrixAt(i, m);
      bodies.setColorAt(i, col.set(FAN_COLS[Math.floor(rnd() * FAN_COLS.length)]));
      heads.setColorAt(i, col.set(SKIN_COLS[Math.floor(rnd() * SKIN_COLS.length)]));
    }
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
    bodies.instanceColor.needsUpdate = heads.instanceColor.needsUpdate = true;
    scene.add(bodies); scene.add(heads); fans.push(bodies, heads);
  }
  seatCrowd(seatsAt);

  /* the stands down the lines and behind the plate */
  const sideMat = new T.MeshPhongMaterial({ map: tSideWall, specular: 0x444444, shininess: 30 });
  const sideRows = [];
  for (let j = 0; j < SIDE_ROWS; j++) {
    const k = 1.2 + j * SIDE_TREAD, y = SIDE_Y + j * SIDE_RISE;
    sideRows.push([k, y, 0, k, y + SIDE_RISE, 0.5, j * 0.37], [k, y + SIDE_RISE, 0.5, k + SIDE_TREAD, y + SIDE_RISE, 1, j * 0.37]);
  }
  const sideAt = [];
  const sidePoly = [[0, 0], [0, SIDE_WALL], [1.2, SIDE_WALL], [1.2, SIDE_Y], [SIDE_D, SIDE_TOP], [SIDE_D + SIDE_TOP / BACK_SLOPE, 0]];
  [1, -1].forEach(function (sg) {
    const sp = sidePath(sg), uLen = function (p) { return p.len / 48; };
    scene.add(new T.Mesh(sweep(T, sp, [[0, 0, 0, 0, SIDE_WALL, 1]], uLen), sideMat));
    scene.add(new T.Mesh(sweep(T, sp, [[-11, 0.04, 0, 0, 0.04, 1]], function (p) { return p.len / 11; }), trackMat));
    scene.add(new T.Mesh(sweep(T, sp, [[0, SIDE_WALL, 0, 1.2, SIDE_WALL, 1]]), yellowMat));
    scene.add(new T.Mesh(sweep(T, sp, [[1.2, SIDE_WALL, 0, 1.2, SIDE_Y, 1]]), darkMat));
    scene.add(new T.Mesh(sweep(T, sp, [[SIDE_D + 1, SIDE_TOP + 4, 0, SIDE_D + 1, SIDE_TOP, 1], [SIDE_D, SIDE_TOP, 0, SIDE_D + SIDE_TOP / BACK_SLOPE, 0, 1]]), backMat));
    for (let j = 0; j < SIDE_ROWS; j++) {                  // seats for the 3D crowd, a row at a time along the wall
      const k = 1.2 + (j + 0.5) * SIDE_TREAD, y = SIDE_Y + (j + 1) * SIDE_RISE;
      let d = 3 + rnd() * 4;
      for (let i = 1; i < sp.length; i++) {
        const p0 = sp[i - 1], p1 = sp[i];
        if (Math.abs(p0.a) > 140 || Math.abs(p1.a) > 140) { d = Math.max(d, p1.len + 2); continue; }   // nobody sits behind the camera
        while (d <= p1.len) {
          const u = (d - p0.len) / (p1.len - p0.len), nx = p0.nx + (p1.nx - p0.nx) * u, nz = p0.nz + (p1.nz - p0.nz) * u;
          if (rnd() < 0.88) sideAt.push(p0.x + (p1.x - p0.x) * u + nx * k, y, p0.z + (p1.z - p0.z) * u + nz * k);
          d += 4.4 + rnd() * 0.7;
        }
      }
    }
    scene.add(new T.Mesh(sweep(T, sp, sideRows, function (p) { return p.len / 21; }), seatMat));
    scene.add(new T.Mesh(sweep(T, sp, [[SIDE_D, SIDE_TOP, 0, SIDE_D, SIDE_TOP + 4, 1]]), navyMat)); scene.add(new T.Mesh(sweep(T, sp, [[SIDE_D, SIDE_TOP + 4, 0, SIDE_D + 1, SIDE_TOP + 4, 1]]), orangeMat));
    scene.add(new T.Mesh(endCap(T, sg > 0 ? sp[0] : sp[sp.length - 1], sidePoly), capMat));
  });
  seatCrowd(sideAt);

  /* light towers */
  const lampMat = new T.MeshBasicMaterial({ map: tLamp }), poleMat = new T.MeshLambertMaterial({ color: 0x2b3566 });
  const glowMat = new T.SpriteMaterial({ map: tGlow, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 });
  const bankGeo = new T.BoxGeometry(38, 16, 3);
  [[10.7, 565, 118], [-10.7, 565, 118], [33, 530, 124], [-33, 530, 124], [70, 300, 112], [-70, 300, 112], [118, 215, 112], [-118, 215, 112]].forEach(function (tw) {
    const g = new T.Group(); g.position.copy(pol(tw[1], tw[0], 0)); g.rotation.y = -tw[0] * DEG;
    const pole = new T.Mesh(new T.CylinderGeometry(1.3, 2.4, tw[2], 8), poleMat); pole.position.y = tw[2] / 2; g.add(pole);
    const bank = new T.Mesh(bankGeo, [poleMat, poleMat, poleMat, poleMat, lampMat, poleMat]); bank.position.set(0, tw[2] - 6, 1.6); g.add(bank);
    const glow = new T.Sprite(glowMat); glow.scale.set(120, 80, 1); glow.position.set(0, tw[2] - 6, 5); g.add(glow);
    scene.add(g);
  });

  /* the scoreboard, standing over the bleachers in dead center */
  const board = new T.Group(); board.position.set(0, 0, -SB.r);
  const boardFace = new T.MeshBasicMaterial({ map: tBoard });
  const boardSide = new T.MeshLambertMaterial({ color: 0x122a78 });
  const boardBox = new T.Mesh(new T.BoxGeometry(SB.half * 2, SB.y1 - SB.y0, 7), [boardSide, boardSide, boardSide, boardSide, boardFace, boardSide]);
  boardBox.position.set(0, (SB.y0 + SB.y1) / 2, -3.5); board.add(boardBox);
  const crown = new T.Mesh(roundBox(T, SB.half * 2 + 6, 3, 9, 1), new T.MeshLambertMaterial({ color: 0xff9214 })); crown.position.set(0, SB.y1 + 1.2, -3.5); board.add(crown);
  [-52, 52].forEach(function (x) { const leg = new T.Mesh(new T.BoxGeometry(5, SB.y0 - 40, 5), boardSide); leg.position.set(x, (SB.y0 + 40) / 2, -4); board.add(leg); });
  scene.add(board);

  /* players: the old-time slugger at the plate and the pitcher on the mound, in the same club colors */
  const batter = makePlayer(T, tex, script, tEnv, { build: "slugger", skin: "#e3a77c", shade: "#cf8a64", hair: "#141010", mustache: true, num: "1" });
  batter.root.rotation.y = Math.PI / 2; scene.add(batter.root);
  const pitcher = makePlayer(T, tex, script, tEnv, { build: "lean", skin: "#c98a5a", shade: "#b5744e", hair: "#1e140c", glove: true });
  pitcher.root.position.set(0, MOUND_H, MOUND_Z); scene.add(pitcher.root);
  const batGeo = new T.LatheGeometry([[0, 0], [0.13, 0.01], [0.13, 0.09], [0.07, 0.14], [0.066, 1.0], [0.1, 1.7], [0.155, 2.25], [0.16, 2.85], [0.12, 2.98], [0, 3.02]].map(function (p) { return new T.Vector2(p[0], p[1]); }), 12);
  const bat = new T.Mesh(batGeo, new T.MeshPhongMaterial({ color: 0xd9a05a, specular: 0xffffff, shininess: 70, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.08 }));
  batter.root.add(bat);
  const shadowMat = decal(new T.MeshBasicMaterial({ map: tShadow, opacity: 0.55 }), 4);
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
  const batShadow = add(new T.Mesh(unit, shadowMat)); batShadow.scale.set(10, 1, 6); batShadow.position.set(BAT_X, 0.11, BAT_Z);
  const pitShadow = add(new T.Mesh(unit, shadowMat)); pitShadow.scale.set(9, 1, 6); pitShadow.position.set(0, MOUND_H + 0.12, MOUND_Z + 1);

  /* the ball, and the cartridge a perfect swing turns it into */
  const ball = new T.Mesh(new T.SphereGeometry(BALL_R, 20, 14), new T.MeshPhongMaterial({ map: tBall, specular: 0xffffff, shininess: 90, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.06 }));
  const inkMat = new T.MeshBasicMaterial({ color: 0x08205f, side: T.BackSide });   // a dark rim, so the ball reads over anything
  const ballInk = new T.Mesh(ball.geometry, inkMat); ballInk.scale.setScalar(1.2); ball.add(ballInk);
  scene.add(ball);
  const cartSide = new T.MeshPhongMaterial({ color: 0x9a9eac, specular: 0xaaaaaa, shininess: 60 });
  const cartFace = new T.MeshPhongMaterial({ map: tCart, specular: 0xaaaaaa, shininess: 70, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.08 });
  const cart = new T.Mesh(roundBox(T, 1.5, 1.3, 0.36, 0.1), [cartSide, cartSide, cartSide, cartSide, cartFace, cartFace]);
  const cartInk = new T.Mesh(cart.geometry, inkMat); cartInk.scale.set(1.08, 1.09, 1.4); cart.add(cartInk);
  cart.visible = false; scene.add(cart);
  const ballShadow = add(new T.Mesh(unit, shadowMat.clone())); ballShadow.material._order = 4; ballShadow.renderOrder = 4;

  // where the pitcher lets go: his throwing hand at the release pose
  applyPose(pitcher, PIT_POSES[PIT_RELEASE]);
  pitcher.root.updateMatrixWorld(true);
  const rel = new T.Vector3(); pitcher.arm[1].end.getWorldPosition(rel);

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, script: script,
    cBoard: cBoard, tBoard: tBoard, boardFace: boardFace, boardKey: "",
    batter: batter, pitcher: pitcher, bat: bat, batShadow: batShadow, ball: ball, cart: cart, ballShadow: ballShadow, rel: rel,
    fans: fans, crowdU: crowdU,
    camPos: new T.Vector3(0, CAM.y, CAM.z), camTgt: new T.Vector3(0, CAM.ty, CAM.tz), bp: new T.Vector3(), v: new T.Vector3(), v2: new T.Vector3(),
    spin: new T.Quaternion(), qa: new T.Quaternion(), axis: new T.Vector3(1, 0.3, 0.2).normalize(),
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0, debugCam: null,
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, fansOn: 2, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
// pr = pixel ratio cap, fans = the 3D crowd: 2 everywhere, 1 outfield bleachers only, 0 off (the people painted on the seats stand in)
const QUALITY = [{ pr: 2, fans: 2 }, { pr: 1.5, fans: 2 }, { pr: 1.15, fans: 1 }, { pr: 1, fans: 0 }];

function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  const on = QUALITY[R.quality].fans;
  if (on !== R.fansOn) { R.fansOn = on; for (let i = 0; i < R.fans.length; i++) R.fans[i].visible = on > (i < 2 ? 0 : 1); }
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

// Park point (three.js space) -> HUD pixels.
function toScreen(x, y, z) {
  R.v.set(x, y, z).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1 };
}

/* ---------------- The batter's routine ---------------- */
const bLast = pose({}), bSnap = pose({});
const B_SWAG_OUT = pose({ phi: 108 }, B_SWAG);             // the same rest, reached the long way round after a swing
// Like mixPose, but the bat's heading takes the short way round.
function mixPoseA(a, b, u, out) {
  const pa = a[PX.phi];
  let dp = b[PX.phi] - pa;
  dp -= Math.round(dp / 360) * 360;
  mixPose(a, b, u, out);
  out[PX.phi] = pa + dp * u;
  return out;
}
// Bat on the shoulder, hand on the hip. kind 1 doffs the helmet to the stands behind the plate,
// kind 0 just touches the brim. tau: seconds into it.
function swagPose(tau, kind, out) {
  let turn, hand, lift;
  if (kind) {
    turn = sstep(0, 0.2, tau) * (1 - sstep(0.6, 0.86, tau));
    hand = sstep(0.02, 0.2, tau) * (1 - sstep(0.6, 0.8, tau));
    lift = sstep(0.18, 0.34, tau) * (1 - sstep(0.46, 0.62, tau));
  } else {
    turn = 0.25 * sstep(0, 0.15, tau) * (1 - sstep(0.3, 0.5, tau));
    hand = sstep(0, 0.16, tau) * (1 - sstep(0.34, 0.5, tau));
    lift = 0.22 * sstep(0.12, 0.22, tau) * (1 - sstep(0.24, 0.36, tau));
  }
  mixPose(B_SWAG, B_LOOK, turn, out);
  out[PX.brim] = hand; out[PX.doff] = lift; out[PX.nod] += lift * 12;
  return out;
}
// Set the swing up so the bat arrives on the ball: the contact key moves to the moment they meet, and the bat is
// pointed at where the ball will be then (pulled out front when early, dragged deep when late). A miss uses the
// textbook contact. tap: the pitch's clock when he swung.
const AIM_G = [0.6, 3.45, 1.1];                             // the bottom hand at a textbook contact, batter space
function aimSwing(tap) {
  const m = S.meet, c = SWING_POSES[2];
  mixPose(B_CONTACT, B_CONTACT, 0, c);
  const at = m ? m.at : SWING_T;
  SWING_KEYS[1] = at * 0.53; SWING_KEYS[2] = at; SWING_KEYS[3] = at + 0.09; SWING_KEYS[4] = at + 0.3;
  if (!m) return;
  const v = R.v2;
  pitchPos(S.pitch, tap + at, v);
  R.batter.root.updateMatrixWorld(true); R.batter.root.worldToLocal(v);
  let dx = v.x - AIM_G[0], dy = v.y - AIM_G[1], dz = v.z - AIM_G[2];
  const n = Math.hypot(dx, dy, dz) || 1; dx /= n; dy /= n; dz /= n;
  c[PX.lx] = v.x - dx * 2.45; c[PX.ly] = v.y - dy * 2.45; c[PX.lz] = v.z - dz * 2.45;
  c[PX.phi] = Math.atan2(dx, dz) / DEG; c[PX.el] = Math.asin(clamp(dy, -1, 1)) / DEG;
  const turn = clamp(-m.e * 180, -16, 16);                  // early: further round; late: still closed
  c[PX.sh] += turn; c[PX.hip] += turn * 0.7;
}
function batterPose(idle, calm, out) {
  const ph = S.phase;
  let wag = 0;
  if (idle) swagPose((idleT % 8) - 3, 1, out);              // title and score card: he tips his helmet now and then
  else if (ph === "ready" || ph === "windup") {
    // the full doff for the first pitch and after a home run, a touch of the brim otherwise, then into the stance
    if (ph === "ready") V.swagKind = S.thrown === 0 || S.streak > 0 ? 1 : 0;
    const tau = ph === "ready" ? S.pt : 0.4 + S.pt, settle = V.swagKind ? sstep(0.62, 1.08, tau) : sstep(0.4, 0.95, tau);
    mixPose(swagPose(tau, V.swagKind, poseC), B_STANCE, settle, out);
    wag = settle;
  } else if (S.swing < 0 && ph === "pitch" && S.pitch) {    // the leg kick and stride, timed to the pitch
    const u = S.pitch.t / S.pitch.T;
    poseAt(LOAD_KEYS, LOAD_POSES, u, out);
    wag = 1 - sstep(0.05, 0.25, u);
  } else if (S.swing >= 0 && S.pitch) {                     // the swing, from wherever he was when he let it go
    if (V.swingId !== S.thrown || !(S.swing >= V.swingLast)) {
      V.swingId = S.thrown; V.preU = clamp((S.pitch.t - S.swing) / S.pitch.T, 0, 1);
      aimSwing(S.pitch.t - S.swing);
    }
    V.swingLast = S.swing;
    SWING_POSES[0] = poseAt(LOAD_KEYS, LOAD_POSES, V.preU, poseC);
    poseAt(SWING_KEYS, SWING_POSES, S.swing, out);
    const r = sstep(SWING_KEYS[4] + 0.2, SWING_KEYS[4] + 0.65, S.swing);
    if (r > 0) mixPose(out, B_SWAG_OUT, r, out);
  } else {                                                  // took the pitch: back out of the stride
    poseAt(LOAD_KEYS, LOAD_POSES, 1, poseC);
    mixPose(poseC, B_SWAG, sstep(0.05, 0.5, S.pt), out);
  }
  if (!calm) {
    // a small bat waggle and a slow rock between the feet while he waits
    const c = R.clock;
    out[PX.phi] += Math.sin(c * 3.1) * 6 * wag; out[PX.el] += Math.sin(c * 2.2) * 4 * wag;
    out[PX.lx] += Math.sin(c * 3.1 + 0.6) * 0.04 * wag; out[PX.ly] += Math.sin(c * 2.2 + 0.4) * 0.03 * wag;
    out[PX.x] -= (0.5 + 0.5 * Math.sin(c * 1.4)) * 0.07 * wag; out[PX.hip] -= Math.sin(c * 1.4) * 2 * wag;
    out[PX.y] += Math.sin(c * 2.4) * 0.025 * Math.max(wag, idle ? 1 : 0);
  }
  return out;
}

/* ---------------- Game state -> meshes ---------------- */
function syncScene(state, fdt) {
  const idle = state === "title" || state === "over";
  const t = idle ? idleT : S.t, ph = S.phase, h = idle ? null : S.hit, f = V.flight;
  const air = !!(h && f && (ph === "contact" || ph === "flight" || ph === "post"));
  const calm = Shell.reduced;
  R.clock += fdt;
  ledTick(fdt);

  /* scoreboard */
  const bk = S.thrown + "|" + S.left + "|" + S.hrs + "|" + S.longest;
  if (bk !== R.boardKey) { R.boardKey = bk; paintBoard(R.cBoard.getContext("2d"), R.script); R.tBoard.needsUpdate = true; }
  if (V.sbFlash > 0) V.sbFlash = Math.max(0, V.sbFlash - fdt * 1.8);
  R.boardFace.color.setScalar(1 + (V.sbFlash > 0 && !calm ? (Math.sin(R.clock * 44) > 0 ? 0.9 : 0.15) * V.sbFlash : 0));

  /* pitcher: k runs through the windup to the release at 1, then the follow through */
  let k = -1;
  if (!idle) {
    if (ph === "windup") k = S.pt / 0.8;
    else if (ph === "pitch" && S.pitch) k = 1 + S.pitch.t / 0.4;
    else if (ph === "contact" || ph === "flight") k = V.pk + fdt / 0.4;
  }
  if (k >= 0) { V.pk = k; V.pb = Math.min(1, V.pb + fdt * 12); } else V.pb = Math.max(0, V.pb - fdt * 2.2);
  poseAt(PIT_KEYS, PIT_POSES, V.pk, poseA);
  mixPose(P_SET, poseA, V.pb * V.pb * (3 - 2 * V.pb), poseB);
  if (!calm) { const br = Math.sin(R.clock * 2.1) * 0.025 * (1 - V.pb); poseB[PX.y] += br; poseB[PX.ly] += br * 1.4; poseB[PX.ry] += br * 1.4; }
  applyPose(R.pitcher, poseB);

  /* batter */
  batterPose(idle, calm, poseB);
  const bKey = idle ? "idle" : ph === "ready" ? "ready" : "go";
  if (bKey !== V.bKey) {                                    // a cut in his routine: ease over from where he was
    if (V.bKey && bKey !== "go") { mixPose(bLast, bLast, 0, bSnap); V.bFade = 1; }
    V.bKey = bKey;
  }
  if (V.bFade > 0) { V.bFade = Math.max(0, V.bFade - fdt / 0.25); mixPoseA(poseB, bSnap, sstep(0, 1, V.bFade), poseB); }
  mixPose(poseB, poseB, 0, bLast);
  const phi = poseB[PX.phi] * DEG, el = poseB[PX.el] * DEG, bdx = Math.sin(phi) * Math.cos(el), bdy = Math.sin(el), bdz = Math.cos(phi) * Math.cos(el);
  poseB[PX.rx] = poseB[PX.lx] + bdx * 0.36; poseB[PX.ry] = poseB[PX.ly] + bdy * 0.36; poseB[PX.rz] = poseB[PX.lz] + bdz * 0.36;   // top hand, up the handle
  applyPose(R.batter, poseB);
  TV.d.set(bdx, bdy, bdz);
  R.bat.position.set(poseB[PX.lx] - bdx * 0.32, poseB[PX.ly] - bdy * 0.32, poseB[PX.lz] - bdz * 0.32);
  R.bat.quaternion.setFromUnitVectors(TV.up, TV.d);
  const st = idle ? 0 : S.stance;
  R.batter.root.position.set(BAT_X + st * 1.0, 0, BAT_Z);
  R.batter.root.rotation.y = Math.PI / 2 - st * 0.16;
  R.batShadow.position.x = BAT_X + st * 1.0;

  /* ball */
  const bp = R.bp;
  let show = false, isCart = false, big = 1;
  if (!idle) {
    if (ph === "windup" && V.pk > 0.04) { R.pitcher.root.updateMatrixWorld(true); R.pitcher.arm[1].end.getWorldPosition(bp); show = true; }
    else if (ph === "pitch" && S.pitch && !(S.result && S.result.kind === "hit")) { pitchPos(S.pitch, S.pitch.t, bp); show = true; }
    else if (air) {
      isCart = h.perfect; show = true;
      if (ph === "contact") flightPos(f, 0.16 * Math.min(1, S.pt / 0.3), bp);
      else if (ph === "flight") {
        flightPos(f, h.u, bp); big = 1.5;
        const tk = Math.floor(h.u * 18);                    // the read-out ticks as it climbs
        if (tk !== V.tick && state === "playing") { V.tick = tk; if (h.u < 1) Juke.sfx("tick", h.u); }
      }
      else {
        flightPos(f, 1, bp); big = 1.5;
        V.landT += fdt;
        if (f.hard) { bp.y -= 46 * V.landT * V.landT; bp.x -= f.sx * 16 * V.landT; bp.z -= f.sz * 16 * V.landT; }   // off the board, back toward the seats
        else if (!f.roll) bp.y += Math.abs(Math.sin(V.landT * 10)) * Math.exp(-3.5 * V.landT) * (f.seats ? 5 : 3.5);
      }
    }
  }
  if (show && !calm) { R.qa.setFromAxisAngle(R.axis, fdt * (isCart ? 13 : 22)); R.spin.premultiply(R.qa); }
  R.ball.visible = show && !isCart; R.cart.visible = show && isCart;
  const mesh = isCart ? R.cart : R.ball;
  mesh.position.copy(bp); mesh.quaternion.copy(R.spin); mesh.scale.setScalar(big * (isCart ? 1.15 : 1));
  const br = Math.hypot(bp.x, bp.z), onField = show && ground(br, Math.atan2(bp.x, -bp.z) / DEG) === 0 && br < 640;
  R.ballShadow.visible = onField;
  if (onField) {
    const mound = Math.max(0, MOUND_H * (1 - Math.pow(Math.hypot(bp.x, bp.z - MOUND_Z) / 13.5, 2)));
    const sk = clamp(1 - bp.y / 120, 0.3, 1);
    R.ballShadow.position.set(bp.x, mound + 0.13, bp.z);
    R.ballShadow.scale.set(BALL_R * 3.4 * big / sk, 1, BALL_R * 3.4 * big / sk);
    R.ballShadow.material.opacity = 0.6 * sk;
  }

  /* crowd */
  const cheer = air && h.hr && (ph === "post" || (ph === "flight" && h.u > 0.5)) ? 1 : 0;
  V.cheer += (cheer - V.cheer) * Math.min(1, fdt * 6);
  R.crowdU.uTime.value = R.clock; R.crowdU.uCheer.value = calm ? 0 : V.cheer;

  /* camera: behind the plate for the pitch, then a cut to a chase camera that rides out after the ball */
  const cp = R.camPos, ct = R.camTgt;
  if (R.debugCam) { cp.fromArray(R.debugCam, 0); ct.fromArray(R.debugCam, 3); }
  else if (air && (ph === "flight" || ph === "post")) {
    const u = ph === "flight" ? h.u : 1, r = flightPos(f, u, R.v2), by = R.v2.y;
    const rc = Math.max(-40, r * 0.9 - 60), side = f.a >= 0 ? -1 : 1;
    // ride a little above the ball and look past it to where it is coming down, so the park stays in the picture
    const cy = Math.max(22, by * 0.9 + 10, ground(Math.abs(rc), normA(rc >= 0 ? f.a : f.a + 180)) + 14, f.rim ? f.rim + 22 : 0);
    cp.set(f.sx * rc - f.sz * 14 * side, cy, f.sz * rc + f.sx * 14 * side);
    ct.copy(R.v2);
    if (!f.roll) { flightPos(f, 1, R.v); ct.lerp(R.v, 0.45); }
    if (ph === "post" && !calm) cp.lerp(ct, 0.1 * Math.min(1, V.landT));
  } else {
    const sway = idle && !calm ? Math.sin(idleT * 0.4) * 2.5 : 0;
    cp.set(sway, CAM.y, CAM.z); ct.set(sway * 0.3, CAM.ty, CAM.tz);
    if (air && ph === "contact") ct.lerp(bp, 0.3 * Math.min(1, S.pt / 0.3));
  }
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (vrand() * 2 - 1) * m; sy = (vrand() * 2 - 1) * m;
  }
  R.camera.position.set(cp.x + sx, cp.y + sy, cp.z);
  R.camera.lookAt(ct.x + sx, ct.y + sy, ct.z);
  R.camera.updateMatrixWorld();
}

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

// Things pinned to the 3D view: the ball's trail, the crack off the bat, the stance hint.
function drawWorld(c) {
  const ph = S.phase, h = S.hit, f = V.flight;
  if (h && f && ph === "flight") {
    for (let tu = 0.02; tu < h.u - 0.015; tu += 0.035) {
      flightPos(f, tu, R.v2);
      const p = toScreen(R.v2.x, R.v2.y, R.v2.z);
      if (!p.ok) continue;
      const k = 1 - (h.u - tu) / Math.max(0.2, h.u);
      c.fillStyle = "rgba(255,255,255," + (0.12 + 0.4 * k).toFixed(3) + ")";
      c.beginPath(); c.arc(p.x, p.y, 1.1 + 1.4 * k, 0, TAU); c.fill();
    }
  }
  if (V.spark > 0 && ph === "contact" && !Shell.reduced) {
    const o = (V.flight && V.flight.off) || { x: 0, y: 0, z: 0 }, p = toScreen(0.4 + o.x, HIT0.y + o.y, HIT0.z + o.z), k = 1 - V.spark / 0.22, rr = 8 + k * 26;
    c.save(); c.translate(p.x, p.y); c.globalAlpha = 1 - k;
    c.fillStyle = "#fff6c8"; c.beginPath();
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, q = i % 2 ? rr * 0.42 : rr; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); }
    c.closePath(); c.fill();
    c.restore(); c.globalAlpha = 1;
  }
  if ((ph === "ready" || ph === "windup") && Math.abs(S.stance) > 0.3) {
    const p = toScreen(R.batter.root.position.x, 0, BAT_Z + 3);
    txt(c, S.stance < 0 ? "< PULL" : "OPPO >", clamp(p.x, 34, W - 34), Math.min(H - 16, p.y + 4), 10, "#ffffff", "center", "#08205f");
  }
}

function drawHUD(c, state) {
  const bg = c.createLinearGradient(0, 0, 0, 44);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, 0, W, 44);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff9214"; c.fillRect(0, 44, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, 46, W, 1);
  txt(c, "TOTAL", 10, 6, 9, "#a8ecff", "left", "#08205f");
  txt(c, S.total + " FT", 10, 19, 17, "#ffe45c", "left", "#08205f");
  txt(c, "PITCHES", W - 10, 6, 9, "#a8ecff", "right", "#08205f");
  txt(c, String(Math.max(0, S.left)), W - 10, 19, 17, "#ffffff", "right", "#08205f");
  if (S.streak > 0 && state === "playing") {
    txt(c, "STREAK " + S.streak, W / 2, S.streak % 3 === 2 ? 8 : 15, 13, "#ffc1e0", "center", "#08205f");
    if (S.streak % 3 === 2) txt(c, "ONE MORE FOR +500", W / 2, 26, 9, "#ffe45c", "center", "#08205f");
  } else drawScript(c, R.script, W / 2, 23, 104, 36);
  // the live distance while a ball is in the air
  const h = S.hit;
  if (state === "playing" && h && S.phase === "flight") {
    const travel = h.target === "scoreboard" ? Math.min(h.d, 462) : h.d, bx = travel * h.u;
    rrect(c, W / 2 - 84, 54, 168, 48, 9); c.fillStyle = "rgba(8,32,95,.82)"; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = h.hr && bx >= h.fence ? "#ffe45c" : "#ffffff"; c.stroke();
    txt(c, Math.round(bx) + " FT", W / 2, 59, 22, h.hr && bx >= h.fence ? "#ffe45c" : "#ffffff", "center", "#08205f");
    txt(c, (h.foul ? "FOUL TERRITORY" : zone(h.theta).toUpperCase()) + "   " + h.label, W / 2, 86, 9, "#a8ecff", "center");
  }
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
  if (V.spark > 0) V.spark = Math.max(0, V.spark - fdt);
  if (sized) {
    syncScene(state, fdt);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  if (state === "playing") drawWorld(c);
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    c.save(); c.translate(q.x, q.y); c.rotate(q.rot);
    c.globalAlpha = clamp(q.life * 2, 0, 1);
    c.fillStyle = q.c; c.fillRect(-2.5, -1.5, 5, 3);
    c.restore();
  }
  c.globalAlpha = 1;
  drawHUD(c, state);
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
  if (getComputedStyle(hud).position === "static") hud.style.position = "relative";   // so it stacks above the WebGL canvas
  const crt = stage.querySelector(".np-crt");
  if (crt) crt.style.display = "none";                       // glossy ballpark, no scanlines
  R.lastT = performance.now();
  layout();
}

function startGame() {
  Shell.init({
    slug: "bleacher-carts",
    title: "BLEACHER CARTS",
    accent: "#ffd23f",
    width: W, height: H,
    format: function (n) { return n + " FT"; },
    howTo: "20 pitches in real 3D. Tap anywhere to swing. Early pulls it, late goes the other way, right on time sends it. Only home runs count.",
    keys: "Keys: Space swings. Left and right shift your stance before the pitch. P pause, M mute, N music, R restart.",
    tip: "Hit the scoreboard or clear the bleachers for a bonus pitch.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { keys = {}; S.drag = null; }
  });
  attach();
  // Sound. Nothing is created until the first tap, click or key press; the band starts with the game.
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Juke.unlock, true); });
  Shell.onStart(Juke.newGame); Shell.onRestart(Juke.newGame); Shell.onResume(Juke.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));   // not while initials are being typed
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Juke.toggleMusic();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) Juke.button(titleCard, titleCard.querySelector(".np-tip"));
  if (pauseActions) Juke.button(pauseActions, pauseActions.querySelector("a"));
  // The studio logo heads the score card. The title menu stays clean: the splash is its logo moment.
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) {
    const im = document.createElement("img");
    im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
    im.style.cssText = "display:block;width:clamp(64px,14vh,104px);height:auto;margin:0 auto 6px";
    im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
    im.src = LOGO_URL;
    card.insertBefore(im, card.firstChild);
  }
}

// Hook for automated checks (no effect on play)
window.__bleacher = { S: function () { return S; }, swing: swing, fence: fence, gfx: function () { return R; }, led: function () { return LED; },
                      view: function () { return V; }, ground: ground, planFlight: planFlight, toScreen: toScreen, juke: Juke, song: { lead: LEAD, prog: PROG, step: STEP } };

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
          ? "Bleacher Carts could not load its 3D engine (" + THREE_URL + ")."
          : "Bleacher Carts needs WebGL for its 3D ballpark, and this browser has it switched off or does not support it.");
      });
    });
})();
