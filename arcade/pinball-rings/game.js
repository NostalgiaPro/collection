/* PINBALL RINGS (3D): a full pinball table built around collecting rings.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of scaling and the title / pause / game over flow, and carries the HUD.

   Units are inches and seconds. x runs across the table (0 = the cabinet's center line, + = right),
   y runs up the table (0 = the bottom edge, under the apron), h is height above the playfield.
   The ball rolls in the (x, y) plane with gravity pulling toward -y, which is what the table's
   slope does on a real machine. Ramps are the one place the ball leaves the playfield: it rides a
   3D path (x, y, h) and climbs against real gravity until it makes the ramp or rolls back down.
   In three.js the playfield sits in a group tilted TILT toward the player, and a table point
   (x, y, h) is (x, h, -y) inside that group.

   Everything here is original: the table layout, the art (all painted in code below), the music
   (generated in code), the names. The only image files are the two Nostalgia Pro Games logos. */

const W = 360, H = 540, TAU = Math.PI * 2, DEG = Math.PI / 180;
const TW = 10.5;                          // half width inside the cabinet walls
const TOP_Y = 32, ARCH_R = 10.5;          // the top arch is centered on (0, TOP_Y)
const LANE_X = 9.0;                       // the shooter lane's inner wall
const X0 = -0.75;                         // the playfield's own center line, left of the shooter lane
const BR = 0.56;                          // ball radius (a touch over life size so it reads on a phone)
const GRAV = 62;                          // in/s^2 down the table
const RAMP_G = 210;                       // in/s^2 along a ramp, per unit of climb: ramps want a real shot
const STEP = 1 / 1200;                    // physics substep
const VMAX = 230;
const TILT = 6.5 * DEG;
const BALLS = 3, SAVE_T = 8, MB_SAVE_T = 12, COMBO_T = 4.2, HOLD_T = 1.1;
const FL = 3.35, F_R0 = 0.48, F_R1 = 0.26;                  // flipper length, base and tip radius
const F_REST = -0.5, F_UP = 0.47, F_W_UP = 30, F_W_DN = 15;  // flipper angles (left flipper; the right mirrors)
const PLUNGE_Y = 1.0;                     // top of the plunger tip at rest
const BUMP_KICK = 50, SLING_KICK = 46;
const MIR = function (x) { return 2 * X0 - x; };              // left side of the lower playfield -> right side

const LOGO_URL = "np_games_logo.png";     // the full studio logo: splash, backglass, apron card, score card, cover
const SCRIPT_URL = "np_games_script.png"; // the script wordmark: every other decal on the table
const THREE_URL = "../shared/three.module.min.js";
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';
const CONF_COLS = ["#ffd23f", "#3ff0ff", "#ff3fa4", "#9bff3f", "#ff9214", "#ffffff"];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function fmtScore(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

/* ---------------- The table: every wall, post and sensor ---------------- */
// Segments are capsules (a line with a radius). look tells the renderer what to build there.
const SEGS = [], CIRCS = [];
function seg(x1, y1, x2, y2, o) {
  o = o || {};
  const s = { x1: x1, y1: y1, x2: x2, y2: y2, r: o.r == null ? 0.08 : o.r, e: o.e == null ? 0.4 : o.e, kind: o.kind || "wall",
              oneWay: !!o.oneWay, on: true, look: o.look || "rail", id: o.id == null ? -1 : o.id, hgt: o.hgt || 0.9, cool: 0 };
  SEGS.push(s);
  return s;
}
function circ(x, y, r, o) {
  o = o || {};
  const c = { x: x, y: y, r: r, e: o.e == null ? 0.65 : o.e, kind: o.kind || "post", look: o.look || "post", id: o.id == null ? -1 : o.id, cool: 0 };
  CIRCS.push(c);
  return c;
}

// cabinet walls and the top arch
seg(-TW, -3, -TW, TOP_Y, { look: "wood", e: 0.3 });
seg(TW, TOP_Y, TW, -3, { look: "wood", e: 0.3 });
const ARC_N = 40;
for (let i = 0; i < ARC_N; i++) {
  const a0 = Math.PI - i / ARC_N * Math.PI, a1 = Math.PI - (i + 1) / ARC_N * Math.PI;
  seg(Math.cos(a0) * ARCH_R, TOP_Y + Math.sin(a0) * ARCH_R, Math.cos(a1) * ARCH_R, TOP_Y + Math.sin(a1) * ARCH_R, { look: "arch", e: 0.25 });
}
// shooter lane, its one-way gate, and the plunger tip
seg(LANE_X, -3, LANE_X, 27.6, { look: "rail" });
seg(LANE_X, 27.6, TW, 29.5, { oneWay: true, look: "gate" });
const PLUNGER = seg(LANE_X, PLUNGE_Y - 0.1, TW, PLUNGE_Y - 0.1, { r: 0.1, e: 0.1, look: "none", kind: "plunger" });
// The upper playfield is laid out on the flippers' own shot lines: from the left flipper a tip shot leaves
// at about 62 degrees (the right orbit), a little later about 70 (the right ramp), and a mid-flipper shot goes
// straight up the middle (the drop targets, and the vault behind them). The right flipper mirrors it.
// the orbits: a lane up each side, with a one-way diverter at the bottom that feeds a returning ball to the inlane
seg(-6.4, 21.6, -8.1, 25.5, { look: "rail" });
seg(-8.1, 25.5, -8.1, 29.5, { look: "rail" });
seg(-TW, 17.6, -8.0, 15.0, { oneWay: true, look: "diverter" });
seg(4.9, 21.6, 6.6, 25.5, { look: "rail" });
seg(6.6, 25.5, 6.6, 30.5, { look: "rail" });
seg(LANE_X, 21.8, 6.4, 19.0, { oneWay: true, look: "diverter" });
// ramp mouths
seg(-4.2, 17.8, -4.2, 21.6, { look: "plastic" });
seg(-6.4, 20.3, -6.4, 21.6, { look: "plastic" });
seg(-6.4, 21.6, -4.2, 21.6, { look: "none", e: 0.3 });
seg(2.7, 17.8, 2.7, 21.6, { look: "plastic" });
seg(4.9, 20.3, 4.9, 21.6, { look: "plastic" });
seg(2.7, 21.6, 4.9, 21.6, { look: "none", e: 0.3 });
// the vault pocket behind the drop targets: knock R I N G down and it opens
seg(-2.78, 18.15, -1.75, 21.6, { look: "rail" });
seg(1.28, 18.15, 0.25, 21.6, { look: "rail" });
seg(-1.75, 21.6, -1.2, 22.25, { look: "rail" });
seg(-1.2, 22.25, -0.3, 22.25, { look: "rail" });
seg(-0.3, 22.25, 0.25, 21.6, { look: "rail" });
// top lane guides
const LANE_GUIDES = [-3.95, -1.95, 0.05, 2.05];
LANE_GUIDES.forEach(function (x) { seg(x, 33.8, x, 36.4, { r: 0.12, look: "laneguide", e: 0.5 }); });
const TOP_LANES = [-2.95, -0.95, 1.05], LANE_Y = 35.1;
// pop bumpers
const BUMPERS = [[-3.1, 30.0], [1.6, 30.0], [-0.75, 26.4]].map(function (p, i) {
  return circ(p[0], p[1], 1.05, { kind: "bumper", look: "bumper", e: 0.5, id: i });
});
// the lower playfield: outlane dividers, inlane floors and slingshots, left side then mirrored
const SLINGS = [];
[-1, 1].forEach(function (side) {
  const X = side < 0 ? function (x) { return x; } : MIR;
  circ(X(-8.9), 14.0, 0.22, { e: 0.7, look: "post" });
  seg(X(-8.9), 14.0, X(-8.9), 9.8, { look: "rail" });
  seg(X(-8.9), 9.8, X(-5.55), 7.45, { look: "rail" });     // sits a touch above the flipper so the ball steps down onto it
  const A = [X(-7.2), 13.0], B = [X(-7.2), 10.4], C = [X(-5.7), 9.5];
  [A, B, C].forEach(function (p) { circ(p[0], p[1], 0.22, { e: 0.7, look: "post" }); });
  const kick = seg(A[0], A[1], C[0], C[1], { kind: "sling", e: 0.6, look: "none", id: side < 0 ? 0 : 1 });
  seg(A[0], A[1], B[0], B[1], { e: 0.5, look: "none" });
  seg(B[0], B[1], C[0], C[1], { e: 0.5, look: "none" });
  SLINGS.push({ side: side, A: A, B: B, C: C, seg: kick, flash: 0 });
});
// drop targets: R I N G
const DROPS = [-2.33, -1.28, -0.23, 0.83].map(function (x, i) {
  const s = seg(x - 0.36, 17.9, x + 0.36, 17.9, { r: 0.15, kind: "drop", e: 0.35, look: "none", id: i });   // no gap a ball fits through
  return { x: x, y: 17.9, seg: s, down: false, z: 0 };
});
const DROP_LETTERS = ["R", "I", "N", "G"];
// the vault (a kickout hole at the top of its own lane) and the spinner across the left orbit
const VAULT = { x: X0, y: 21.3, r: 0.72 };
const SPINNER = { y: 23.5, x1: -TW, x2: -7.2 };
const ORBIT_Y = 26, ORBIT_L = [-TW, -8.1], ORBIT_R = [6.6, LANE_X];

// Flippers. a is the angle from the pivot to the tip; the right flipper mirrors the left.
const FLIPPERS = [
  { side: -1, px: -5.0, py: 6.4, rest: F_REST, up: F_UP, a: F_REST, w: 0, held: false },
  { side: 1, px: MIR(-5.0), py: 6.4, rest: Math.PI - F_REST, up: Math.PI - F_UP, a: Math.PI - F_REST, w: 0, held: false }
];

/* ---------------- Ramps: 3D paths the ball rides (x, y, h) ---------------- */
const RAMP_DEF = [
  { name: "LEFT RAMP", mouth: [-6.4, -4.2], assist: [MIR(4.3), MIR(1.5)], color: "#2fd8ff",
    pts: [[-5.3, 20.8, 0], [-5.35, 23.6, 1.2], [-5.6, 27.4, 2.8], [-5.1, 30.8, 4.0], [-3.4, 34.0, 4.6], [-0.4, 35.9, 4.7],
          [2.6, 35.4, 4.6], [4.9, 32.6, 4.2], [6.0, 28.6, 3.4], [6.35, 24.0, 2.4], [6.5, 19.5, 1.4], [6.55, 16.2, 0.45], [6.55, 15.2, 0]] },
  { name: "RIGHT RAMP", mouth: [2.7, 4.9], assist: [1.5, 4.3], color: "#ff3fa4",
    pts: [[3.8, 20.8, 0], [3.8, 23.8, 0.9], [3.1, 28.0, 1.9], [1.2, 31.6, 2.2], [-2.2, 32.4, 2.2], [-5.4, 31.6, 2.1],
          [-8.2, 29.2, 2.0], [-9.3, 25.5, 1.8], [-9.25, 20.5, 1.3], [-8.5, 17.2, 0.6], [-8.05, 15.8, 0.25], [-8.05, 15.0, 0]] }
];
const RAMP_Y = 20.8;
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
const RAMPS = RAMP_DEF.map(function (r) {
  const P = r.pts, out = [], per = 16;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      out.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), y: catmull(p0[1], p1[1], p2[1], p3[1], t), h: Math.max(0, catmull(p0[2], p1[2], p2[2], p3[2], t)) });
    }
  }
  const L = P[P.length - 1];
  out.push({ x: L[0], y: L[1], h: L[2] });
  let d = 0;
  for (let i = 0; i < out.length; i++) {
    if (i) d += Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y, out[i].h - out[i - 1].h);
    out[i].d = d;
  }
  let top = 0;
  for (let i = 0; i < out.length; i++) if (out[i].h > out[top].h) top = i;
  return { name: r.name, mouth: r.mouth, assist: r.assist, color: r.color, s: out, len: d, topD: out[top].d };
});
// Where on a ramp distance d is (and how steep it is there).
function rampAt(r, d, o) {
  const s = r.s;
  d = clamp(d, 0, r.len);
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m].d <= d) lo = m; else hi = m; }
  const a = s[lo], b = s[hi], span = b.d - a.d || 1, k = (d - a.d) / span;
  o = o || {};
  o.x = a.x + (b.x - a.x) * k; o.y = a.y + (b.y - a.y) * k; o.h = a.h + (b.h - a.h) * k;
  o.slope = (b.h - a.h) / span; o.dx = (b.x - a.x) / span; o.dy = (b.y - a.y) / span;
  return o;
}

/* ---------------- Rings ---------------- */
// Floating gold rings. Some hang over the playfield (h is fixed), some ride along a ramp (ramp, d).
const RINGS = [];
function ringAt(x, y) { RINGS.push({ x: x, y: y, h: 0.95, ramp: -1, d: 0, got: false, back: 0, pop: 0 }); }
[18.6, 20.9, 26.2, 28.4].forEach(function (y) { ringAt(-9.15, y); });
[24.2, 26.5, 28.8].forEach(function (y) { ringAt(7.8, y); });
[62, 76, 90, 104, 118].forEach(function (a) { ringAt(Math.cos(a * DEG) * 8.9, TOP_Y + Math.sin(a * DEG) * 8.9); });
ringAt(X0, 19.9);
ringAt(-0.75, 31.4); ringAt(-3.55, 27.2); ringAt(2.05, 27.2);
RAMPS.forEach(function (r, i) {
  for (let k = 0; k < 6; k++) {
    const d = r.len * (0.16 + k * 0.135), p = rampAt(r, d);
    RINGS.push({ x: p.x, y: p.y, h: p.h + 0.75, ramp: i, d: d, got: false, back: 0, pop: 0 });
  }
});
const RING_BACK_T = 14;

/* ---------------- Missions ---------------- */
const MISSIONS = [
  { id: "ramps", name: "RAMP RUN", need: 3, unit: "RAMPS" },
  { id: "pops", name: "POP PARTY", need: 25, unit: "POPS" },
  { id: "spins", name: "SPIN CYCLE", need: 30, unit: "SPINS" },
  { id: "rings", name: "RING GRAB", need: 30, unit: "RINGS" },
  { id: "drops", name: "RING DROP", need: 2, unit: "BANKS" },
  { id: "orbits", name: "ORBIT LOOP", need: 3, unit: "ORBITS" },
  { id: "combo", name: "COMBO KING", need: 3, unit: "WAY COMBO" }
];

/* ---------------- Game state ---------------- */
let S = {}, keys = {}, idleT = 0, parts = [], paused = false, ballId = 0;
let THREE = null, R = null;                              // R holds everything the renderer owns
// V is how things are being shown (flashes, kicks). It never feeds the rules.
const V = { bump: [0, 0, 0], vaultKick: 0, laneFlash: [0, 0, 0] };

// Something that should happen a little later in this game (paused with the game, dropped on a restart).
function later(sec, fn) { S.timers.push({ t: sec, fn: fn }); }

function reset() {
  S = { t: 0, score: 0, ball: 1, balls: [], phase: "play", phaseT: 0, pull: 0, pulling: false, kbPull: false, auto: 0,
        saveT: 0, saveArm: true, saved: 0, mult: 1, lanes: [false, false, false], skill: -1, skillT: 0,
        lockLit: false, locks: 0, mb: false, mbT: 0, jackpots: 0, superLit: false, ejects: [], held: [],
        mission: 0, cycle: 0, prog: 0, missionsDone: 0, missionWait: 0,
        ringsBall: 0, ringsGame: 0, ringStack: 0, ringChain: 0, ringChainT: 0,
        combo: 0, bestCombo: 0, lastShotT: -99, lastShot: "",
        ramps: 0, orbits: 0, spins: 0, pops: 0, banks: 0, jackpotsTotal: 0, supers: 0, multiballs: 0, skillShots: 0,
        extra: 0, extraGiven: false, bonus: null, over: false, spinA: 0, spinW: 0, timers: [] };
  parts.length = 0;
  for (let i = 0; i < RINGS.length; i++) { RINGS[i].got = false; RINGS[i].back = 0; RINGS[i].pop = 0; }
  for (let i = 0; i < DROPS.length; i++) { DROPS[i].down = false; DROPS[i].seg.on = true; DROPS[i].z = 0; }
  S.bankT = 0;
  for (let i = 0; i < FLIPPERS.length; i++) { const f = FLIPPERS[i]; f.a = f.rest; f.w = 0; f.held = false; }
  keys = {};
  for (const k in held) held[k] = false;
  TOUCH.clear();
  PLUNGER.y1 = PLUNGER.y2 = PLUNGE_Y - 0.1;
  serveBall(false);
  ledClear();
}

function mission() { return MISSIONS[S.mission % MISSIONS.length]; }
function missionNeed() { const m = mission(); return Math.round(m.need * (1 + S.cycle * 0.5)); }

function newBall(x, y, vx, vy) {
  const b = { id: ++ballId, x: x, y: y, vx: vx || 0, vy: vy || 0, mode: "table", h: 0, ramp: -1, d: 0, s: 0, top: false,
              hold: 0, still: 0, px: x, py: y, orbitFrom: null, orbitT: 0, fromPlunger: false, vaultOK: 0 };
  S.balls.push(b);
  return b;
}
// Put a ball on the plunger. auto: it launches itself (ball save, multiball).
function serveBall(auto) {
  const b = newBall((LANE_X + TW) / 2, PLUNGE_Y + BR + 0.02, 0, 0);
  b.fromPlunger = true;
  if (auto) S.auto = 0.55;
  else if (S.skill < 0 && S.saveArm) { S.skill = Math.floor(Math.random() * 3); }
  return b;
}
function inPlay() {
  let n = 0;
  for (let i = 0; i < S.balls.length; i++) if (S.balls[i].mode !== "gone") n++;
  return n + S.ejects.length;
}
function waitingBall() {
  for (let i = 0; i < S.balls.length; i++) {
    const b = S.balls[i];
    if (b.mode === "table" && b.x > LANE_X && b.y < PLUNGE_Y + BR + 0.6 && Math.abs(b.vy) < 6) return b;
  }
  return null;
}
function armed() { return S.phase === "play" && !!waitingBall(); }
function onlyWaiting() { return armed() && inPlay() === 1; }

function launch(p) {
  const b = waitingBall();
  if (!b || p < 0.04) return false;
  b.y = Math.max(b.y, PLUNGE_Y + BR + 0.02);
  b.vy = 60 + clamp(p, 0, 1) * 62;                  // a soft plunge (about a quarter) drops into the top lanes; a full one rides the arch
  b.fromPlunger = true;
  if (S.saveArm) { S.saveT = SAVE_T; S.saveArm = false; S.skillT = 5; }
  sfx("launch", p);
  return true;
}

/* ---------------- Scoring + events ---------------- */
function award(n) { S.score += n; }

function shotMade(kind) {
  // Ramps and orbits chain into combos when they come one after another.
  if (S.t - S.lastShotT < COMBO_T) S.combo++;
  else S.combo = 1;
  S.lastShotT = S.t; S.lastShot = kind;
  if (S.combo >= 2) {
    award(100000 * S.combo);
    if (S.combo > S.bestCombo) S.bestCombo = S.combo;
    ledPlay([ledMsg("slide", S.combo + "-WAY COMBO", 1.4, { color: "lime" })], true);
    sfx("combo", S.combo);
    if (window.NPRewards && S.combo >= 2) window.NPRewards.streak(S.combo, S.combo === 2 ? "COMBO!" : S.combo + "-WAY COMBO!");
    if (window.Trophies && S.combo >= 4) window.Trophies.unlock("pr-combo4");
    if (mission().id === "combo" && S.combo >= 2) missionTick(Math.max(0, S.combo - S.prog), true);
  }
}

function missionTick(n, abs) {
  if (S.missionWait > 0 || S.phase !== "play") return;
  const m = mission();
  if (m.id === "combo") { if (S.combo > S.prog) S.prog = S.combo; }
  else S.prog += n;
  if (S.prog >= missionNeed()) {
    S.missionsDone++;
    const pts = 500000 * S.missionsDone;
    award(pts);
    Shell.flash("MISSION COMPLETE", m.name + "  +" + fmtScore(pts), "#9bff3f", 1500);
    ledPlay([ledMsg("cycle", "MISSION COMPLETE", 1.8), ledMsg("count", m.name, 1.6, { from: 0, value: pts })]);
    sfx("mission");
    burst(W / 2, 260, 40);
    S.missionWait = 2.2; S.prog = 0;
    if (window.Trophies && S.missionsDone >= 3) window.Trophies.unlock("pr-mission3");
    if (S.missionsDone === 3 && !S.extraGiven) {
      S.extraGiven = true; S.extra++;
      ledPlay([ledMsg("flash", "EXTRA BALL", 1.6, { color: "yellow" })], true);
      later(1.6, function () { if (S.phase === "play") Shell.flash("EXTRA BALL", "Three missions down. Shoot again after this one.", "#ffd23f", 1500); });
      sfx("extra");
    }
  }
}

function ringGet(r) {
  r.got = true; r.back = RING_BACK_T; r.pop = 1;
  S.ringsBall++; S.ringsGame++;
  award(S.mb ? 2000 : 1000);
  S.ringChain = S.t - S.ringChainT < 0.9 ? S.ringChain + 1 : 0; S.ringChainT = S.t;
  sfx("ring", S.ringChain);
  sparkle(r);
  if (mission().id === "rings") missionTick(1);
  if (window.Trophies && S.ringsGame >= 100) window.Trophies.unlock("pr-rings100");
  if (S.ringsGame % 50 === 0) {
    S.ringStack++;
    const pts = 250000 * S.ringStack;
    award(pts);
    ledPlay([ledMsg("count", "RING STACK", 1.8, { from: 0, value: pts, color: "yellow" })], true);
    sfx("stack");
  }
}

function bumperHit(i) {
  V.bump[i] = 1;
  S.pops++;
  award(5000);
  sfx("pop", i);
  if (mission().id === "pops") missionTick(1);
}
function slingHit(i) {
  SLINGS[i].flash = 1;
  award(1010);
  sfx("sling");
}
function dropHit(i) {
  const d = DROPS[i];
  if (d.down) return;
  d.down = true; d.seg.on = false;
  award(10000);
  sfx("drop");
  let all = true;
  for (let k = 0; k < DROPS.length; k++) if (!DROPS[k].down) all = false;
  if (all) {
    S.banks++;
    award(75000);
    if (mission().id === "drops") missionTick(1);
    if (!S.mb && !S.lockLit) {
      S.lockLit = true;
      ledPlay([ledMsg("flash", "LOCK IS LIT", 1.6, { color: "cyan" })], true);
      Shell.flash("LOCK IS LIT", "Shoot the vault.", "#3ff0ff", 1100);
      sfx("lit");
    } else ledPlay([ledMsg("slide", "R I N G  +75,000", 1.3, { color: "yellow" })], true);
    if (!S.lockLit && !S.mb) S.bankT = 2.2;           // with the lock lit (or in multiball) the bank stays down: the vault is open
  } else ledPlay([ledMsg("blink", DROP_LETTERS[i], 0.7, { color: "yellow", big: true })]);
}
function laneHit(i, b) {
  V.laneFlash[i] = 1;
  award(5000);
  sfx("lane");
  if (b.fromPlunger && S.skillT > 0 && S.skill >= 0) {
    if (i === S.skill) {
      award(250000); S.skillShots++;
      Shell.flash("SKILL SHOT", "+250,000", "#ffd23f", 1300);
      ledPlay([ledMsg("cycle", "SKILL SHOT", 1.6), ledMsg("count", "SKILL", 1.2, { from: 0, value: 250000 })]);
      sfx("skill");
      if (window.Trophies) window.Trophies.unlock("pr-skill");
    }
    S.skill = -1; S.skillT = 0;
  }
  b.fromPlunger = false;
  S.lanes[i] = true;
  if (S.lanes[0] && S.lanes[1] && S.lanes[2]) {
    S.lanes = [false, false, false];
    if (S.mult < 5) S.mult++;
    award(50000);
    ledPlay([ledMsg("flash", "BONUS " + S.mult + "X", 1.4, { color: "orange" })], true);
    sfx("mult");
  }
}
function spinnerSpin() {
  S.spins++;
  award(2000);
  sfx("spin");
  if (mission().id === "spins") missionTick(1);
}
function orbitMade() {
  S.orbits++;
  award(40000);
  shotMade("orbit");
  ledPlay([ledMsg("slide", "ORBIT", 1.0, { color: "violet" })], true);
  sfx("orbit");
  if (mission().id === "orbits") missionTick(1);
}
function rampMade(i) {
  S.ramps++;
  shotMade("ramp" + i);
  if (S.mb) {
    S.jackpots++; S.jackpotsTotal++;
    const pts = 1000000 + 250000 * (S.jackpotsTotal - 1);
    award(pts);
    Shell.flash("JACKPOT!", "+" + fmtScore(pts), "#ffd23f", 1300);
    ledPlay([ledMsg("jackpot", "JACKPOT", 2.0), ledMsg("count", "JACKPOT", 1.4, { from: 0, value: pts })]);
    sfx("jackpot");
    burst(W / 2, 220, 50);
    if (window.Trophies) window.Trophies.unlock("pr-jackpot");
    if (S.jackpots >= 3 && !S.superLit) {
      S.superLit = true;
      later(0.9, function () { if (S.mb) ledPlay([ledMsg("flash", "SUPER AT VAULT", 1.6, { color: "pink" })], true); });
    }
  } else {
    award(50000);
    ledPlay([ledMsg("slide", RAMPS[i].name, 1.1, { color: i ? "pink" : "cyan" })], true);
    sfx("ramp");
  }
  if (mission().id === "ramps") missionTick(1);
}

// The vault has the ball. What it does depends on what is lit.
function vaultIn(b) {
  b.mode = "vault"; b.hold = HOLD_T; b.vx = b.vy = 0; b.x = VAULT.x; b.y = VAULT.y;
  sfx("vault");
  b.fromPlunger = false;
  if (S.mb) {
    if (S.superLit) {
      S.superLit = false; S.jackpots = 0; S.supers++;
      award(5000000);
      Shell.flash("SUPER JACKPOT!", "+5,000,000", "#ff3fa4", 1600);
      ledPlay([ledMsg("jackpot", "SUPER JACKPOT", 2.4), ledMsg("count", "SUPER", 1.4, { from: 0, value: 5000000 })]);
      sfx("super"); burst(W / 2, 200, 80); camShake(1.0, 0.4);
      if (window.Trophies) window.Trophies.unlock("pr-super");
    } else { award(50000); ledPlay([ledMsg("slide", "VAULT  +50,000", 1.0, { color: "amber" })], true); }
    return;
  }
  if (S.lockLit) {
    S.lockLit = false;
    S.locks++;
    if (S.locks >= 2) { startMultiball(b); return; }
    award(100000);
    S.bankT = 1.2;
    b.mode = "gone"; b.locked = true;
    S.held.push(1);
    Shell.flash("BALL LOCKED", "One more lock starts Ring Rush multiball.", "#3ff0ff", 1300);
    ledPlay([ledMsg("cycle", "BALL 1 LOCKED", 1.8, { color: "cyan" })]);
    sfx("lock");
    later(0.9, function () { if (S.phase === "play") serveBall(false); });
    return;
  }
  award(25000);
  if (!S.bankT) S.bankT = HOLD_T + 1;
  for (let k = 0; k < 5; k++) { S.ringsBall++; S.ringsGame++; }
  if (mission().id === "rings") missionTick(5);
  ledPlay([ledMsg("count", "VAULT RINGS", 1.3, { from: S.ringsGame - 5, value: S.ringsGame, color: "yellow" })], true);
}

function startMultiball(b) {
  S.mb = true; S.mbT = 0; S.locks = 0; S.jackpots = 0; S.superLit = false; S.multiballs++;
  S.held.length = 0;
  S.saveT = MB_SAVE_T;
  award(250000);
  b.hold = 1.9;                                     // the vault holds this one through the fanfare
  S.ejects.push({ t: 2.7 });                        // the locked ball comes back out after it
  later(1.5, function () { if (S.phase === "play" && S.mb) serveBall(true); });
  Shell.flash("RING RUSH MULTIBALL!", "Every ramp is a jackpot.", "#ff3fa4", 1800);
  ledPlay([ledMsg("jackpot", "RING RUSH", 2.2), ledMsg("cycle", "MULTIBALL", 1.6)]);
  sfx("multiball");
  burst(W / 2, 240, 70); camShake(0.8, 0.5);
  if (window.Trophies) window.Trophies.unlock("pr-multiball");
}

function drain(b) {
  b.mode = "gone";
  if (S.phase !== "play") return;
  if (S.saveT > 0 && !(S.mb && inPlay() > 1)) {
    S.saved++;
    Shell.flash("BALL SAVED", "", "#9bff3f", 900);
    ledPlay([ledMsg("blink", "BALL SAVED", 1.4, { color: "lime" })]);
    sfx("saved");
    serveBall(true);
    return;
  }
  sfx("drain");
  const left = inPlay();
  if (S.mb && left <= 1) {
    S.mb = false; S.superLit = false; S.bankT = 1.5;
    ledPlay([ledMsg("slide", "MULTIBALL OVER", 1.4, { color: "amber" })]);
  }
  if (left === 0) endOfBall();                       // a locked ball stays locked for the next one
}

function endOfBall() {
  S.phase = "bonus"; S.phaseT = 0;
  S.mb = false; S.superLit = false;
  if (!S.lockLit) S.bankT = 1.0;
  for (let i = 0; i < FLIPPERS.length; i++) FLIPPERS[i].held = false;
  const ringPts = S.ringsBall * 1000, total = ringPts * S.mult;
  S.bonus = { rings: S.ringsBall, ringPts: ringPts, mult: S.mult, total: total, added: false };
  ledPlay([ledMsg("count", "RING BONUS", 1.3, { from: 0, value: ringPts }),
           ledMsg("slide", "X " + S.mult + " MULTIPLIER", 1.0, { color: "orange" }),
           ledMsg("count", "BONUS", 1.3, { from: 0, value: total })]);
  Shell.flash("BALL " + S.ball + " OVER", "Ring bonus " + fmtScore(total), "#8e93a2", 1400);
}

function nextBall() {
  S.ringsBall = 0; S.mult = 1; S.lanes = [false, false, false]; S.combo = 0;
  S.saveArm = true; S.skill = -1;
  if (S.extra > 0) {
    S.extra--;
    Shell.flash("SHOOT AGAIN", "Same ball.", "#ffd23f", 1100);
    ledPlay([ledMsg("flash", "SHOOT AGAIN", 1.5, { color: "yellow" })]);
  } else if (S.ball >= BALLS) { finishGame(); return; }
  else {
    S.ball++;
    ledPlay([ledMsg("slide", "BALL " + S.ball, 1.2, { color: "amber" })]);
  }
  S.phase = "play"; S.phaseT = 0;
  S.balls = S.balls.filter(function (b) { return b.mode !== "gone"; });
  serveBall(false);
}

function finishGame() {
  S.over = true; S.phase = "over";
  ledFinal(S.score);
  if (window.Trophies && S.score >= 10000000) window.Trophies.unlock("pr-10m");
  Shell.gameOver(S.score, { title: "GAME OVER", html:
    row("Rings collected", S.ringsGame) +
    row("Missions complete", S.missionsDone) +
    row("Ramps", S.ramps) +
    row("Best combo", S.bestCombo >= 2 ? S.bestCombo + "-way" : "None") +
    row("Multiballs", S.multiballs) +
    row("Jackpots", S.jackpotsTotal + (S.supers ? " + " + S.supers + " super" : "")),
    stats: { score: S.score, rings: S.ringsGame, missions: S.missionsDone, ramps: S.ramps, orbits: S.orbits, bestCombo: S.bestCombo,
             multiballs: S.multiballs, jackpots: S.jackpotsTotal, supers: S.supers, skillShots: S.skillShots, pops: S.pops, spins: S.spins } });
}
function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

/* ---------------- Physics ---------------- */
// Push the ball out of a surface along n and bounce it off. (vx, vy) is the surface's own velocity there.
function resolve(b, nx, ny, pen, e, sx, sy) {
  b.x += nx * pen; b.y += ny * pen;
  const rvx = b.vx - sx, rvy = b.vy - sy, vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
  // a real knock (not a ball just rolling along) loses a little speed along the surface too
  if (vn < -12) {
    const tx = -ny, ty = nx, vt = rvx * tx + rvy * ty;
    b.vx -= vt * 0.04 * tx; b.vy -= vt * 0.04 * ty;
  }
  return -vn;
}
function hitSeg(b, s) {
  const ex = s.x2 - s.x1, ey = s.y2 - s.y1, l2 = ex * ex + ey * ey;
  const u = l2 ? clamp(((b.x - s.x1) * ex + (b.y - s.y1) * ey) / l2, 0, 1) : 0;
  const px = s.x1 + ex * u, py = s.y1 + ey * u;
  const dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy, rr = BR + s.r;
  if (d2 >= rr * rr) return 0;
  const d = Math.sqrt(d2) || 1e-4;
  return resolve(b, dx / d, dy / d, rr - d, s.e, 0, 0) || 0.001;
}
function hitCirc(b, c) {
  const dx = b.x - c.x, dy = b.y - c.y, d2 = dx * dx + dy * dy, rr = BR + c.r;
  if (d2 >= rr * rr) return 0;
  const d = Math.sqrt(d2) || 1e-4;
  return resolve(b, dx / d, dy / d, rr - d, c.e, 0, 0) || 0.001;
}
// Flippers are tapered capsules turning about their pivot. The surface moves, so a swinging flipper hits hard.
function hitFlipper(b, f) {
  const c = Math.cos(f.a), s = Math.sin(f.a), ex = c * FL, ey = s * FL;
  const t = clamp(((b.x - f.px) * ex + (b.y - f.py) * ey) / (FL * FL), 0, 1);
  const qx = f.px + ex * t, qy = f.py + ey * t, rr = F_R0 + (F_R1 - F_R0) * t;
  const dx = b.x - qx, dy = b.y - qy, d2 = dx * dx + dy * dy, lim = rr + BR;
  if (d2 >= lim * lim) return 0;
  const d = Math.sqrt(d2) || 1e-4, nx = dx / d, ny = dy / d;
  const cx = qx + nx * rr, cy = qy + ny * rr;
  const sx = -f.w * (cy - f.py), sy = f.w * (cx - f.px);
  const imp = resolve(b, nx, ny, lim - d, 0.3, sx, sy);
  // a flipper moving into the ball never leaves it slower than itself
  const push = sx * nx + sy * ny, now = b.vx * nx + b.vy * ny;
  if (push > 0 && now < push * 1.05) { b.vx += (push * 1.05 - now) * nx; b.vy += (push * 1.05 - now) * ny; }
  // Aim. Where the ball meets a swinging flipper sets where it goes, smoothly: off the tip it crosses the table
  // (about 62 degrees from the left flipper), off the middle it goes up the center, near the base it stays on
  // its own side. This is what lets a player aim by timing, the way a real flipper does.
  const up = f.side < 0 ? f.w : -f.w;
  if (up > 6 && ny > 0) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 20) {
      const deg = 58 + (1 - t) * 42, a = (f.side < 0 ? deg : 180 - deg) * DEG;
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
    }
  }
  return imp;
}

function moveFlippers(dt) {
  for (let i = 0; i < FLIPPERS.length; i++) {
    const f = FLIPPERS[i], goal = f.held ? f.up : f.rest, a0 = f.a;
    const sp = (f.held ? F_W_UP : F_W_DN) * dt;
    if (Math.abs(goal - f.a) <= sp) f.a = goal;
    else f.a += Math.sign(goal - f.a) * sp;
    f.w = (f.a - a0) / dt;
  }
}

function crossed(b, y, x1, x2) {
  // did the ball's center cross the line y between x1 and x2 this substep? returns +1 going up, -1 going down
  if ((b.py < y) === (b.y < y)) return 0;
  const k = (y - b.py) / ((b.y - b.py) || 1e-6), x = b.px + (b.x - b.px) * k;
  if (x < x1 || x > x2) return 0;
  return b.y > b.py ? 1 : -1;
}

function stepTable(b, dt) {
  b.px = b.x; b.py = b.y;
  b.vy -= GRAV * dt;
  const drag = 1 - 0.12 * dt;
  b.vx *= drag; b.vy *= drag;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > VMAX) { b.vx *= VMAX / sp; b.vy *= VMAX / sp; }
  b.x += b.vx * dt; b.y += b.vy * dt;
  let i, imp;
  for (i = 0; i < SEGS.length; i++) {
    const s = SEGS[i];
    if (!s.on) continue;
    if (s.oneWay && b.vy > 0) continue;
    if (s.kind === "plunger" && b.x < LANE_X) continue;
    imp = hitSeg(b, s);
    if (!imp) continue;
    if (s.kind === "sling") {
      // the rubber kicks the ball off unless it is only rolling along it
      if (imp > 6 && s.cool <= 0) {
        const ex = s.x2 - s.x1, ey = s.y2 - s.y1, l = Math.hypot(ex, ey);
        let nx = -ey / l, ny = ex / l;
        if ((b.x - s.x1) * nx + (b.y - s.y1) * ny < 0) { nx = -nx; ny = -ny; }
        const vn = b.vx * nx + b.vy * ny;
        if (vn < SLING_KICK) { b.vx += (SLING_KICK - vn) * nx; b.vy += (SLING_KICK - vn) * ny; }
        s.cool = 0.12;
        slingHit(s.id);
      }
    } else if (s.kind === "drop") {
      if (imp > 4) dropHit(s.id);
    } else if (imp > 30) knock(imp);
  }
  for (i = 0; i < CIRCS.length; i++) {
    const c = CIRCS[i];
    imp = hitCirc(b, c);
    if (!imp) continue;
    if (c.kind === "bumper") {
      const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < BUMP_KICK) { b.vx += (BUMP_KICK - vn) * nx; b.vy += (BUMP_KICK - vn) * ny; }
      if (c.cool <= 0) { c.cool = 0.08; bumperHit(c.id); }
    } else if (imp > 30) knock(imp * 0.7);
  }
  for (i = 0; i < FLIPPERS.length; i++) hitFlipper(b, FLIPPERS[i]);
  // the walls win: one more pass so nothing pushes the ball through one
  for (i = 0; i < SEGS.length; i++) {
    const s = SEGS[i];
    if (s.look === "wood" || s.look === "arch") hitSeg(b, s);
  }

  /* sensors */
  if (b.vy > 30) {
    // An arcade assist at each ramp mouth: a shot close to the mouth is steered in. The zone stops short of
    // the outside edge, where orbit shots pass by on their own line.
    for (i = 0; i < RAMPS.length; i++) {
      const z = RAMPS[i].assist;
      if (crossed(b, 18.5, z[0], z[1]) > 0) {
        const mx = (RAMPS[i].mouth[0] + RAMPS[i].mouth[1]) / 2, want = b.vy * (mx - b.x) / (RAMP_Y + 0.4 - b.y);
        b.vx = want * 0.85 + b.vx * 0.15;
      }
    }
  }
  if (b.vy > 0) {
    for (i = 0; i < RAMPS.length; i++) {
      const rp = RAMPS[i];
      if (crossed(b, RAMP_Y, rp.mouth[0], rp.mouth[1]) > 0) { enterRamp(b, i); return; }
    }
  }
  if (crossed(b, SPINNER.y, SPINNER.x1, SPINNER.x2)) {
    const v = Math.abs(b.vy);
    S.spinW = Math.max(S.spinW, v * 0.9);
  }
  const ol = crossed(b, ORBIT_Y, ORBIT_L[0], ORBIT_L[1]), or = crossed(b, ORBIT_Y, ORBIT_R[0], ORBIT_R[1]);
  if (ol > 0) { b.orbitFrom = "L"; b.orbitT = S.t; }
  if (or > 0) { b.orbitFrom = "R"; b.orbitT = S.t; }
  if ((ol < 0 && b.orbitFrom === "R") || (or < 0 && b.orbitFrom === "L")) {
    if (S.t - b.orbitT < 3.5) orbitMade();
    b.orbitFrom = null;
  }
  for (i = 0; i < TOP_LANES.length; i++) {
    if (crossed(b, LANE_Y, TOP_LANES[i] - 0.9, TOP_LANES[i] + 0.9)) laneHit(i, b);
  }
  if (S.t > b.vaultOK && Math.hypot(b.x - VAULT.x, b.y - VAULT.y) < VAULT.r) { vaultIn(b); return; }
  for (i = 0; i < RINGS.length; i++) {
    const r = RINGS[i];
    if (r.got || r.ramp >= 0) continue;
    const dx = b.x - r.x, dy = b.y - r.y;
    if (dx * dx + dy * dy < 0.8) ringGet(r);
  }
  if (b.y < -0.8) drain(b);
}

function knock(imp) {
  if (S.t - (S.knockT || 0) < 0.04) return;
  S.knockT = S.t;
  sfx("knock", imp);
}

function enterRamp(b, i) {
  const r = RAMPS[i];
  b.mode = "ramp"; b.ramp = i; b.d = 0.01; b.s = Math.max(10, b.vy * 0.95 + Math.abs(b.vx) * 0.2); b.top = false;
  b.fromPlunger = false;
  sfx("rampUp", b.s);
  if (b.s < Math.sqrt(2 * RAMP_G * rampAt(r, r.topD).h)) b.weak = true; else b.weak = false;
}
const RP = {};
function stepRamp(b, dt) {
  const r = RAMPS[b.ramp];
  rampAt(r, b.d, RP);
  b.s -= RAMP_G * RP.slope * dt;
  b.s *= 1 - 0.05 * dt;
  if (b.s > 75) b.s = 75;
  b.d += b.s * dt;
  if (b.d >= r.topD) b.top = true;
  if (b.top && b.s < 8) b.s = 8;                    // the downhill side always carries it home
  rampAt(r, b.d, RP);
  b.x = RP.x; b.y = RP.y; b.h = RP.h;
  for (let i = 0; i < RINGS.length; i++) {
    const g = RINGS[i];
    if (g.got || g.ramp !== b.ramp) continue;
    if (Math.abs(g.d - b.d) < 0.7) ringGet(g);
  }
  if (b.d >= r.len) {
    // made it: drop out onto the inlane below
    const end = rampAt(r, r.len - 0.5);
    b.mode = "table"; b.h = 0; b.x = r.s[r.s.length - 1].x; b.y = r.s[r.s.length - 1].y;
    b.vx = end.dx * Math.min(30, b.s * 0.6); b.vy = -Math.max(14, Math.min(30, b.s * 0.6));
    b.px = b.x; b.py = b.y;
    rampMade(b.ramp);
    b.ramp = -1;
  } else if (b.d <= 0) {
    // rolled back down: out of the mouth, heading back toward the flippers
    b.mode = "table"; b.h = 0; b.x = clamp(b.x, r.mouth[0] + BR + 0.1, r.mouth[1] - BR - 0.1); b.y = RAMP_Y - 0.25;
    b.vx = 0; b.vy = Math.min(-6, b.s);
    b.px = b.x; b.py = b.y;
    b.ramp = -1;
    sfx("rampFail");
  }
}

function stepBalls(dt) {
  let i, j;
  for (i = 0; i < S.balls.length; i++) {
    const b = S.balls[i];
    if (b.mode === "table") stepTable(b, dt);
    else if (b.mode === "ramp") stepRamp(b, dt);
  }
  // balls knock into each other during multiball
  for (i = 0; i < S.balls.length; i++) {
    const a = S.balls[i];
    if (a.mode !== "table") continue;
    for (j = i + 1; j < S.balls.length; j++) {
      const b = S.balls[j];
      if (b.mode !== "table") continue;
      const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, rr = BR * 2;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = (rr - d) / 2;
      a.x -= nx * pen; a.y -= ny * pen; b.x += nx * pen; b.y += ny * pen;
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) {
        const jn = -(1 + 0.9) * rv / 2;
        a.vx -= jn * nx; a.vy -= jn * ny; b.vx += jn * nx; b.vy += jn * ny;
        if (-rv > 20) knock(-rv);
      }
    }
  }
}

/* ---------------- Update ---------------- */
function update(dt) {
  S.t += dt; S.phaseT += dt;
  let i;
  updateParts(dt);
  for (i = 0; i < SEGS.length; i++) if (SEGS[i].cool > 0) SEGS[i].cool -= dt;
  for (i = 0; i < CIRCS.length; i++) if (CIRCS[i].cool > 0) CIRCS[i].cool -= dt;
  for (i = 0; i < RINGS.length; i++) {
    const r = RINGS[i];
    if (r.pop > 0) r.pop = Math.max(0, r.pop - dt * 2.5);
    if (r.got) { r.back -= dt; if (r.back <= 0) { r.got = false; r.pop = 0; } }
  }
  if (S.saveT > 0) S.saveT = Math.max(0, S.saveT - dt);
  if (S.skillT > 0) { S.skillT -= dt; if (S.skillT <= 0) S.skill = -1; }
  if (S.missionWait > 0) {
    S.missionWait -= dt;
    if (S.missionWait <= 0) {
      S.mission++;
      if (S.mission % MISSIONS.length === 0) S.cycle++;
      S.prog = 0;
      ledPlay([ledMsg("slide", "MISSION: " + mission().name, 1.6, { color: "cyan" })], true);
    }
  }
  if (S.mb) S.mbT += dt;
  for (i = S.timers.length - 1; i >= 0; i--) {
    const tm = S.timers[i];
    tm.t -= dt;
    if (tm.t <= 0) { S.timers.splice(i, 1); tm.fn(); }
  }

  // flippers: keys and touches both hold them
  const lHeld = S.phase === "play" && (keys.left || touchHeld(-1)), rHeld = S.phase === "play" && (keys.right || touchHeld(1));
  if (lHeld && !FLIPPERS[0].held) { flipPress(0); }
  if (rHeld && !FLIPPERS[1].held) { flipPress(1); }
  FLIPPERS[0].held = lHeld; FLIPPERS[1].held = rHeld;

  // plunger: the tip follows the pull, and the ball sitting on it follows the tip
  if (S.kbPull) S.pull = Math.min(1, S.pull + dt * 1.15);
  PLUNGER.y1 = PLUNGER.y2 = PLUNGE_Y - 0.1 - S.pull * 1.4;
  if (S.auto > 0) {
    S.auto -= dt;
    if (S.auto <= 0) { if (!launch(0.78 + Math.random() * 0.12)) S.auto = 0.3; }
  }

  // drop target bank comes back up once it is clear
  if (S.bankT > 0) {
    S.bankT -= dt;
    if (S.bankT <= 0) {
      let clear = true;
      for (i = 0; i < S.balls.length; i++) { const b = S.balls[i]; if (b.mode === "vault" || (b.mode === "table" && b.y > 16.6 && b.y < 22.5 && b.x > -3.4 && b.x < 1.9)) clear = false; }
      if (S.lockLit || S.mb) clear = false;
      if (clear) { for (i = 0; i < DROPS.length; i++) { DROPS[i].down = false; DROPS[i].seg.on = true; } sfx("bankUp"); }
      else S.bankT = 0.3;
    }
  }

  // the physics, in small fixed steps
  const n = clamp(Math.round(dt / STEP), 1, 80), sdt = dt / n;
  for (i = 0; i < n; i++) {
    moveFlippers(sdt);
    stepBalls(sdt);
    // the spinner: every half turn scores
    S.spinA += S.spinW * sdt;
    while (S.spinA >= Math.PI) { S.spinA -= Math.PI; spinnerSpin(); }
    S.spinW *= Math.exp(-1.1 * sdt);
    if (S.spinW < 2) { S.spinW = 0; if (S.spinA > 0.02) S.spinA = Math.max(0, S.spinA - sdt * 6); }
  }

  // vault holds, then kicks the ball back down its lane
  for (i = 0; i < S.balls.length; i++) {
    const b = S.balls[i];
    if (b.mode !== "vault") continue;
    b.hold -= dt;
    if (b.hold <= 0) vaultKick(b);
  }
  for (i = S.ejects.length - 1; i >= 0; i--) {
    S.ejects[i].t -= dt;
    if (S.ejects[i].t <= 0) {
      S.ejects.splice(i, 1);
      const b = newBall(VAULT.x, VAULT.y, 0, 0);
      vaultKick(b);
    }
  }

  // a ball that has stopped dead somewhere it should not be gets a nudge
  for (i = 0; i < S.balls.length; i++) {
    const b = S.balls[i];
    if (b.mode !== "table" || b.x > LANE_X) { b.still = 0; continue; }
    const cradled = (FLIPPERS[0].held && Math.hypot(b.x - FLIPPERS[0].px, b.y - FLIPPERS[0].py) < FL + 1) ||
                    (FLIPPERS[1].held && Math.hypot(b.x - FLIPPERS[1].px, b.y - FLIPPERS[1].py) < FL + 1);
    if (Math.hypot(b.vx, b.vy) < 3 && !cradled) b.still += dt; else b.still = 0;
    if (b.still > 3) { b.still = 0; b.vx += (Math.random() - 0.5) * 30; b.vy += 22; sfx("knock", 40); }
  }
  S.balls = S.balls.filter(function (b) { return b.mode !== "gone"; });

  if (S.phase === "bonus") {
    if (!S.bonus.added && S.phaseT > 1.4) { S.bonus.added = true; award(S.bonus.total); }
    if (S.phaseT > 3.4) nextBall();
  }
}

function vaultKick(b) {
  b.mode = "table"; b.hold = 0; b.vaultOK = S.t + 0.6;       // it is not caught again on its way out
  b.x = VAULT.x; b.y = VAULT.y - 0.3; b.px = b.x; b.py = b.y;
  b.vx = -6 - Math.random() * 4; b.vy = -30;
  V.vaultKick = 1;
  sfx("kick");
}

function flipPress(i) {
  sfx("flip", i);
  // lane change: the lit top lanes slide over with the flipper
  if (S.phase === "play") {
    const L = S.lanes;
    S.lanes = i === 0 ? [L[1], L[2], L[0]] : [L[2], L[0], L[1]];
  }
}

/* ---------------- Particles (drawn on the HUD layer, placed through the 3D camera) ---------------- */
function burst(x, y, n) {
  if (Shell.reduced) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 60 + Math.random() * 180;
    parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 90, life: 1.1 + Math.random() * 0.6, g: 220,
                 c: CONF_COLS[i % CONF_COLS.length], w: 2.4 + (i % 3) * 0.6, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14, kind: 0 });
  }
}
function sparkle(r) {
  if (!R) return;
  const p = toScreen(r.x, r.y, r.h);
  if (!p.ok) return;
  const n = Shell.reduced ? 4 : 10;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + Math.random() * 0.4, s = 40 + Math.random() * 50;
    parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0.45 + Math.random() * 0.2, g: 60,
                 c: i % 2 ? "#fff6b0" : "#ffd23f", w: 1.6, rot: 0, vr: 0, kind: 1 });
  }
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt; p.vy += p.g * dt; p.vx *= 0.985; p.rot += p.vr * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0) parts.splice(i, 1);
  }
}

/* ---------------- Music ----------------
   An original looping arcade tune, made entirely in code with the Web Audio API. It knows nothing about the
   game: hand it an AudioContext and a node to play into, and it plays until the function it returns is called.
   136 BPM, sixteen bars in A minor / C major: square-wave lead with an echo, a pulsing saw bass, a sparkle
   arpeggio, and a drum machine. */
function startMusic(ctx, dest) {
  const BPM = 136, ST = 60 / BPM / 4, BARS = 16, STEPS = BARS * 16, AHEAD = 0.5;
  // bass root, then the arpeggio notes (MIDI)
  const CH = { Am: [45, 69, 72, 76], F: [41, 65, 69, 72], C: [48, 67, 72, 76], G: [43, 67, 71, 74], E: [40, 68, 71, 76],
               Dm: [38, 65, 69, 74], Em: [40, 67, 71, 76] };
  const PROG = ["Am", "F", "C", "G", "Am", "F", "C", "E", "F", "G", "Em", "Am", "Dm", "G", "C", "E"];
  // the tune, a bar a line: step, note, length in steps
  const TUNE = [
    "0A4-2 2C5-2 4E5-3 7D5-1 8E5-2 10A5-4 14G5-2",
    "0F5-3 3E5-1 4C5-2 6A4-2 8C5-2 10F5-2 12E5-4",
    "0G5-2 2E5-2 4C5-2 6E5-2 8G5-3 11A5-1 12G5-4",
    "0D5-2 2G4-2 4B4-2 6D5-2 8G5-6 14F5-1 15E5-1",
    "0A4-2 2C5-2 4E5-3 7D5-1 8E5-2 10A5-4 14B5-2",
    "0C6-3 3B5-1 4A5-2 6F5-2 8A5-2 10C6-2 12A5-4",
    "0G5-2 2E5-2 4G5-2 6C6-2 8B5-2 10G5-2 12E5-4",
    "0G#5-4 4B5-4 8E5-2 10G#5-2 12B5-4",
    "0A5-2 2C6-2 4A5-2 6F5-2 8C5-4 12F5-2 14A5-2",
    "0B5-3 3A5-1 4G5-2 6D5-2 8G5-4 12B5-2 14D6-2",
    "0E6-4 4B5-2 6G5-2 8E5-4 12G5-2 14B5-2",
    "0A5-6 6E5-2 8C5-2 10E5-2 12A5-4",
    "0D5-2 2F5-2 4A5-2 6D6-2 8C6-2 10A5-2 12F5-4",
    "0G5-2 2B5-2 4D6-4 8B5-2 10G5-2 12D5-4",
    "0E5-2 2G5-2 4C6-4 8E6-3 11D6-1 12C6-4",
    "0B5-2 2G#5-2 4E5-2 6G#5-2 8B5-2 10E6-2 12D6-2 14B5-2"
  ];
  const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const LEAD = new Array(STEPS).fill(null);
  TUNE.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(#?)(\d)-(\d+)$/.exec(tok);
      if (m) LEAD[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + semis[m[2]] + (m[3] ? 1 : 0), Number(m[5])];
    });
  });
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(dest);
  function filt(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const lead = filt("lowpass", 3600, 0.6, bus), bass = filt("lowpass", 700, 2.2, bus), pad = filt("lowpass", 2200, 0.5, bus);
  const send = ctx.createGain(), echo = ctx.createDelay(1), fb = ctx.createGain(), wet = filt("lowpass", 2000, 0.6, bus);
  send.gain.value = 0.28; echo.delayTime.value = ST * 3; fb.gain.value = 0.3;
  lead.connect(send); send.connect(echo); echo.connect(fb); fb.connect(echo); echo.connect(wet);
  const nlen = Math.floor(ctx.sampleRate);
  const noise = ctx.createBuffer(1, nlen, ctx.sampleRate), nd = noise.getChannelData(0);
  let seed = 0x1234567;
  for (let i = 0; i < nlen; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; nd[i] = ((seed >>> 0) / 4294967296) * 2 - 1; }

  function note(to, type, f0, t, dur, vol, f1, hold, detune) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.6 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (detune) o.detune.value = detune;
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.03);
  }
  function hit(t, dur, vol, type, f, q, f1) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true;
    fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, (t * 7.3) % 0.8); s.stop(t + dur + 0.05);
  }
  function play(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[bar]], n = LEAD[i], late = bar >= 8;
    if (n) { note(lead, "square", hz(n[0]), t, n[1] * ST * 0.9, 0.16); note(lead, "square", hz(n[0]), t, n[1] * ST * 0.9, 0.06, 0, 0.6, 9); }
    // bass: pulsing eighths with an octave hop on the offbeat
    if (!(s & 1)) note(bass, "sawtooth", hz(ch[0] + ((s >> 1) % 4 === 3 ? 12 : 0)), t, ST * 1.6, 0.26, 0, 0.5);
    // sparkle arpeggio on sixteenths, up and down the chord, an octave up in the second half
    const arp = [1, 2, 3, 2][s & 3];
    note(pad, "triangle", hz(ch[arp] + (late ? 12 : 0)), t, ST * 1.2, s % 4 === 0 ? 0.075 : 0.05, 0, 0.4);
    // drums: four on the floor, claps on 2 and 4, hats on the offbeats, a fill at the end of each half
    if (s % 4 === 0) note(bus, "sine", 140, t, 0.18, 0.6, 40, 0.05);
    const fill = (bar === 7 || bar === 15) && s >= 12;
    if (s === 4 || s === 12 || fill) {
      hit(t, 0.14, fill ? 0.2 + 0.05 * (s - 12) : 0.26, "bandpass", 1500, 0.8);
      note(bus, "triangle", 230, t, 0.06, 0.12, 150, 0.1);
    }
    if (s % 4 === 2) hit(t, 0.05, 0.09, "highpass", 8000, 0.7);
    else if (s & 1) hit(t, 0.03, 0.035, "highpass", 9000, 0.7);
    if (s === 0 && bar % 4 === 0) hit(t, 0.9, 0.08, "highpass", 6000, 0.5, 9000);   // a crash every four bars
  }

  let step = 0, nextT = ctx.currentTime + 0.08, live = true;
  function pump() {
    if (!live) return;
    const now = ctx.currentTime;
    if (nextT < now) nextT = now + 0.03;
    while (nextT < now + AHEAD) { play(step, nextT); step = (step + 1) % STEPS; nextT += ST; }
  }
  pump();
  const timer = setInterval(pump, 60);
  return function stop() {
    if (!live) return;
    live = false;
    clearInterval(timer);
    try {
      const now = ctx.currentTime;
      bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(bus.gain.value, now); bus.gain.linearRampToValueAtTime(0, now + 0.12);
    } catch (e) { /* already gone */ }
    setTimeout(function () { try { bus.disconnect(); } catch (e) { /* ignore */ } }, 400);
  };
}

/* ---------------- Sound: the game's own audio engine ----------------
   One AudioContext, made on the first tap, click or key press (never before). It carries the music and the
   table's sound effects, follows the shell's mute button (the shared "npArcade.muted" setting), and remembers
   the music switch in "npArcade.music". The shell's own start / game over jingles still play as usual. */
const MUSIC_KEY = "npArcade.music";
const MUSIC_VOL = 0.15, SFX_VOL = 0.26;
const Sound = (function () {
  let ac = null, out = null, mus = null, fx = null, noise = null, dead = false, muted = false, stopMusic = null;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  const buttons = [];

  function shellMuted() {
    const b = document.getElementById("np-mute");
    if (b) return b.getAttribute("aria-pressed") === "true";
    try { return localStorage.getItem("npArcade.muted") === "1"; } catch (e) { return false; }
  }
  function unlock() {
    if (dead) return;
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        ac = new AC();
        out = ac.createGain();
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
        out.connect(comp); comp.connect(ac.destination);
        mus = ac.createGain(); mus.gain.value = MUSIC_VOL; mus.connect(out);
        fx = ac.createGain(); fx.gain.value = SFX_VOL; fx.connect(out);
        muted = shellMuted(); out.gain.value = muted ? 0 : 1;
        const len = Math.floor(ac.sampleRate * 1.5);
        noise = ac.createBuffer(1, len, ac.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ac.state !== "running") { const p = ac.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { ac = null; dead = true; }
  }
  // every frame: follow the mute button, and run the music only while a game is being played
  function pump() {
    if (!ac || !window.Shell) return;
    const m = shellMuted();
    if (m !== muted) { muted = m; out.gain.setTargetAtTime(m ? 0 : 1, ac.currentTime, 0.02); }
    const want = musicOn && !muted && ac.state === "running" && Shell.state() === "playing";
    if (want && !stopMusic) {
      mus.gain.cancelScheduledValues(ac.currentTime); mus.gain.setValueAtTime(MUSIC_VOL, ac.currentTime);
      stopMusic = startMusic(ac, mus);
    } else if (!want && stopMusic) { stopMusic(); stopMusic = null; }
  }
  function restart() { if (stopMusic) { stopMusic(); stopMusic = null; } pump(); }

  function tone(type, f0, t, dur, vol, f1, hold) {
    const o = ac.createOscillator(), g = ac.createGain(), h = t + Math.max(0.006, dur * (hold == null ? 0.4 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(fx); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(t, dur, vol, type, f, q, f1, atk) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise; s.loop = true;
    fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q || 0.7;
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.003)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(fx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function run(list, type, step, vol, t) { list.forEach(function (m, i) { tone(type, mtof(m), t + i * step, step * 1.6, vol, 0, 0.5); }); }

  const CUES = {
    flip: function (t, i) { hiss(t, 0.05, 0.5, "bandpass", i ? 1500 : 1300, 1.2); tone("square", 110, t, 0.06, 0.25, 60, 0.2); },
    pop: function (t, i) { tone("sine", 520 + i * 70, t, 0.16, 0.55, 140, 0.1); hiss(t, 0.08, 0.5, "bandpass", 2400, 1.5); tone("square", 1040 + i * 140, t, 0.05, 0.12); },
    sling: function (t) { hiss(t, 0.06, 0.6, "highpass", 2200, 0.8); tone("square", 330, t, 0.08, 0.2, 180); },
    knock: function (t, x) { hiss(t, 0.04, Math.min(0.45, 0.08 + x / 400), "bandpass", 1800 + Math.random() * 800, 1.6); },
    drop: function (t) { tone("triangle", 180, t, 0.12, 0.5, 70, 0.1); hiss(t, 0.06, 0.4, "lowpass", 900, 0.7); },
    bankUp: function (t) { tone("square", 200, t, 0.1, 0.15, 400); },
    lane: function (t) { tone("square", 1320, t, 0.06, 0.16); tone("square", 1760, t + 0.05, 0.08, 0.14); },
    spin: function (t) { tone("square", 2200 + Math.random() * 200, t, 0.02, 0.07); },
    ring: function (t, k) { const f = mtof(84 + Math.min(12, k || 0)); tone("triangle", f, t, 0.18, 0.32, 0, 0.2); tone("sine", f * 1.5, t + 0.05, 0.25, 0.22, 0, 0.2); },
    stack: function (t) { run([84, 88, 91, 96, 100], "square", 0.05, 0.2, t); },
    rampUp: function (t, s) { tone("sawtooth", 160, t, 0.5, 0.12, 160 + Math.min(70, s) * 9, 0.8); },
    rampFail: function (t) { tone("triangle", 400, t, 0.35, 0.22, 120, 0.6); },
    ramp: function (t) { run([76, 79, 84, 88], "square", 0.06, 0.22, t); },
    orbit: function (t) { hiss(t, 0.45, 0.35, "bandpass", 600, 1.2, 3200, 0.15); tone("square", 880, t + 0.3, 0.12, 0.16, 1320); },
    combo: function (t, n) { for (let i = 0; i < Math.min(6, n + 1); i++) tone("square", mtof(79 + i * 4), t + i * 0.05, 0.08, 0.2); },
    vault: function (t) { tone("sine", 600, t, 0.4, 0.4, 90, 0.3); hiss(t, 0.3, 0.3, "lowpass", 1400, 0.7, 300); },
    kick: function (t) { hiss(t, 0.08, 0.7, "lowpass", 600, 0.8); tone("sine", 90, t, 0.15, 0.6, 50, 0.05); },
    lit: function (t) { run([72, 79, 84, 79, 84, 91], "square", 0.06, 0.18, t); },
    lock: function (t) { tone("sine", 140, t, 0.25, 0.7, 60, 0.05); run([60, 67, 72, 76], "square", 0.08, 0.2, t + 0.15); },
    multiball: function (t) {
      run([60, 64, 67, 72, 76, 79, 84, 88, 91, 96], "square", 0.06, 0.22, t);
      [84, 88, 91].forEach(function (m) { tone("sawtooth", mtof(m), t + 0.65, 0.8, 0.12, 0, 0.5); });
      hiss(t + 0.6, 1.2, 0.3, "highpass", 5000, 0.5);
    },
    jackpot: function (t) {
      for (let i = 0; i < 10; i++) tone("square", mtof(i % 2 ? 91 : 86), t + i * 0.045, 0.05, 0.22);
      [79, 84, 88, 91].forEach(function (m) { tone("square", mtof(m), t + 0.48, 0.6, 0.14, 0, 0.5); });
    },
    super: function (t) { CUES.jackpot(t); run([84, 88, 91, 96, 100, 103, 108], "square", 0.07, 0.2, t + 0.9); },
    mission: function (t) { run([72, 76, 79, 84], "square", 0.1, 0.22, t); [84, 88, 91].forEach(function (m) { tone("triangle", mtof(m), t + 0.42, 0.7, 0.18, 0, 0.5); }); },
    extra: function (t) { run([79, 84, 88, 91, 96], "triangle", 0.08, 0.26, t); },
    skill: function (t) { run([88, 84, 88, 91, 96], "square", 0.06, 0.22, t); },
    mult: function (t) { run([72, 76, 79], "square", 0.06, 0.2, t); },
    saved: function (t) { run([67, 72, 76, 79], "triangle", 0.07, 0.26, t); },
    drain: function (t) { tone("sawtooth", 330, t, 0.7, 0.2, 70, 0.7); tone("square", 165, t + 0.05, 0.6, 0.1, 50, 0.7); },
    launch: function (t, p) { hiss(t, 0.18, 0.45, "bandpass", 500, 1.0, 2400); tone("triangle", 140, t, 0.12, 0.4, 70 + p * 60, 0.2); }
  };
  function sfx(name, x) {
    if (!ac || muted || ac.state !== "running" || !CUES[name]) return;
    try { CUES[name](ac.currentTime + 0.005, x); } catch (e) { /* sound is never worth a crash */ }
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
  // a "MUSIC: ON / OFF" button in the shell's own style, for the title card and the pause card
  function button(parent, before) {
    if (!parent) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-btn"; b.setAttribute("data-np-music", "");
    b.style.cssText = "width:100%;margin-top:8px";
    b.addEventListener("click", function (e) { e.stopPropagation(); unlock(); setMusic(!musicOn); });
    parent.insertBefore(b, before || null);
    buttons.push(b); label();
  }
  return {
    unlock: unlock, pump: pump, sfx: sfx, button: button, restart: restart,
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    peek: function () { return { made: !!ac, state: ac ? ac.state : "none", music: !!stopMusic, musicOn: musicOn, muted: muted }; }
  };
})();
function sfx(name, x) { Sound.sfx(name, x); }

/* =====================================================================================
   3D presentation
   ===================================================================================== */

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
// Draw an image as large as fits inside a box, centered.
function drawFit(g, img, cx, cy, maxW, maxH) {
  let w = maxW, h = w * img.height / img.width;
  if (h > maxH) { h = maxH; w = h * img.width / img.height; }
  g.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

/* ---------------- Painted textures (all drawn here, no image files besides the two logos) ---------------- */

// A logo PNG trimmed to its ink, so sizes below mean the artwork itself. If the file is missing,
// plain lettering stands in.
function trimmed(img, maxW) {
  if (img && img.naturalWidth > 0) {
    const k = Math.min(1, maxW / img.naturalWidth);
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = mkCanvas(w, h), g = c.getContext("2d");
    g.drawImage(img, 0, 0, w, h);
    try {
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
  return null;
}
function scriptCanvas(img) {
  const t = trimmed(img, 1024);
  if (t) return t;
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
function logoCanvas(img, script) { return trimmed(img, 800) || script; }

function candyText(g, str, x, y, size, maxW, cols) {
  const face = '"Arial Black", "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
  g.font = "900 " + size + "px " + face;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + face; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = size * 0.36; g.strokeStyle = "#08205f"; g.strokeText(str, x, y + size * 0.06);
  g.lineWidth = size * 0.17; g.strokeStyle = "#ffffff"; g.strokeText(str, x, y);
  const gr = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  cols = cols || ["#fff06a", "#ffc21a", "#ff7a0f"];
  gr.addColorStop(0, cols[0]); gr.addColorStop(0.55, cols[1]); gr.addColorStop(1, cols[2]);
  g.fillStyle = gr; g.fillText(str, x, y);
  g.fillStyle = "rgba(255,255,255,.45)";
  g.save(); g.beginPath(); g.rect(x - 900, y - size * 0.5, 1800, size * 0.36); g.clip(); g.fillText(str, x, y); g.restore();
  return size;
}
function plainText(g, str, x, y, size, col, rot) {
  g.save(); g.translate(x, y); if (rot) g.rotate(rot);
  g.font = "900 " + size + "px " + '"Arial Black", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = col; g.fillText(str, 0, 0);
  g.restore();
}

// A gold ring drawn flat (for the art).
function paintRing(g, x, y, r, w, alpha) {
  g.save(); g.globalAlpha = alpha == null ? 1 : alpha;
  g.lineWidth = w * 1.4; g.strokeStyle = "#7a4a06"; g.beginPath(); g.arc(x, y + w * 0.15, r, 0, TAU); g.stroke();
  const gr = g.createLinearGradient(x - r, y - r, x + r, y + r);
  gr.addColorStop(0, "#fff6b8"); gr.addColorStop(0.35, "#ffd23f"); gr.addColorStop(0.7, "#e59a12"); gr.addColorStop(1, "#ffe680");
  g.lineWidth = w; g.strokeStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  g.lineWidth = w * 0.25; g.strokeStyle = "rgba(255,255,255,.75)"; g.beginPath(); g.arc(x, y, r + w * 0.12, -2.4, -1.2); g.stroke();
  g.restore();
}

// The playfield art. The canvas covers x -TW..TW and y PF_Y0..PF_Y1.
const PF_Y0 = -2.6, PF_Y1 = 43;
function playfieldCanvas(script) {
  const CW = 1024, CH = 2048, c = mkCanvas(CW, CH), g = c.getContext("2d"), rnd = rng(17);
  const X = function (x) { return (x + TW) / (2 * TW) * CW; }, Y = function (y) { return (PF_Y1 - y) / (PF_Y1 - PF_Y0) * CH; };
  const kx = CW / (2 * TW), ky = CH / (PF_Y1 - PF_Y0);
  const bg = g.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, "#1c0f5e"); bg.addColorStop(0.45, "#2a0f6e"); bg.addColorStop(0.75, "#170a47"); bg.addColorStop(1, "#0c0628");
  g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
  // stars
  for (let i = 0; i < 420; i++) {
    const x = rnd() * CW, y = rnd() * CH, r = rnd() < 0.85 ? 1.2 : 2.4;
    g.fillStyle = "rgba(255,255,255," + (0.25 + rnd() * 0.6) + ")"; g.fillRect(x, y, r, r);
  }
  // the sunset behind the pop bumpers
  const sx = X(X0), sy = Y(29), sr = 7.6 * kx;
  g.save(); g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.clip();
  const sun = g.createLinearGradient(0, sy - sr, 0, sy + sr);
  sun.addColorStop(0, "#fff36a"); sun.addColorStop(0.45, "#ff9a2a"); sun.addColorStop(0.75, "#ff3f8e"); sun.addColorStop(1, "#b11a9a");
  g.fillStyle = sun; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  g.fillStyle = "#24105f";
  for (let k = 0; k < 7; k++) { const yy = sy + sr * (0.05 + k * 0.14), hh = 4 + k * 3.2; g.fillRect(sx - sr, yy, sr * 2, hh); }
  g.restore();
  const halo = g.createRadialGradient(sx, sy, sr * 0.9, sx, sy, sr * 1.6);
  halo.addColorStop(0, "rgba(255,90,170,.35)"); halo.addColorStop(1, "rgba(255,90,170,0)");
  g.fillStyle = halo; g.fillRect(0, sy - sr * 1.7, CW, sr * 3.4);
  // the neon grid running toward the horizon
  const hy = Y(23.0), base = Y(5);
  g.fillStyle = "#130833"; g.fillRect(0, hy, CW, base - hy);
  g.strokeStyle = "rgba(255,63,164,.55)"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, hy); g.lineTo(CW, hy); g.stroke();
  for (let k = -12; k <= 12; k++) { g.beginPath(); g.moveTo(X(X0) + k * 18, hy); g.lineTo(X(X0) + k * 130, base); g.stroke(); }
  for (let k = 1; k < 14; k++) { const yy = hy + (base - hy) * Math.pow(k / 14, 1.8); g.beginPath(); g.moveTo(0, yy); g.lineTo(CW, yy); g.stroke(); }
  // big gold rings as art across the middle
  paintRing(g, X(-7.6), Y(9.0), 2.6 * kx, 0.42 * kx, 0.35);
  paintRing(g, X(6.2), Y(8.6), 2.2 * kx, 0.36 * kx, 0.35);
  paintRing(g, X(X0), Y(29), 8.8 * kx, 0.3 * kx, 0.5);
  // the wordmark, center of the table
  const mw = 9.6 * kx;
  g.save(); g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 18; g.shadowOffsetY = 8;
  drawFit(g, script, X(X0), Y(12.6), mw, 4.2 * ky);
  g.restore();
  candyText(g, "PINBALL RINGS", X(X0), Y(9.3), 74, 7.6 * kx);
  // lane floors: the orbits, inlanes, outlanes and shooter lane get darker tracks
  g.fillStyle = "rgba(4,2,20,.55)";
  g.beginPath(); g.moveTo(X(-TW), Y(31)); g.lineTo(X(-8.1), Y(31)); g.lineTo(X(-8.1), Y(25.5)); g.lineTo(X(-6.4), Y(21.6)); g.lineTo(X(-6.4), Y(17)); g.lineTo(X(-TW), Y(17)); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(X(LANE_X), Y(31)); g.lineTo(X(6.6), Y(31)); g.lineTo(X(6.6), Y(25.5)); g.lineTo(X(4.9), Y(21.6)); g.lineTo(X(4.9), Y(19)); g.lineTo(X(LANE_X), Y(19)); g.closePath(); g.fill();
  // the vault pocket
  g.fillStyle = "rgba(255,63,164,.22)";
  g.beginPath(); g.moveTo(X(-2.78), Y(18.15)); g.lineTo(X(-1.75), Y(21.6)); g.lineTo(X(-1.2), Y(22.25)); g.lineTo(X(-0.3), Y(22.25)); g.lineTo(X(0.25), Y(21.6)); g.lineTo(X(1.28), Y(18.15)); g.closePath(); g.fill();
  g.fillRect(X(-TW), Y(14), X(-7.2) - X(-TW), Y(4) - Y(14));
  g.fillRect(X(5.7), Y(14), X(LANE_X) - X(5.7), Y(4) - Y(14));
  const sl = g.createLinearGradient(X(LANE_X), 0, X(TW), 0);
  sl.addColorStop(0, "#14141c"); sl.addColorStop(0.5, "#2a2c38"); sl.addColorStop(1, "#14141c");
  g.fillStyle = sl; g.fillRect(X(LANE_X), Y(PF_Y1), X(TW) - X(LANE_X), CH);
  g.strokeStyle = "#ffd23f"; g.lineWidth = 5;
  for (let y = 3; y < 26; y += 2.2) { g.beginPath(); g.moveTo(X(LANE_X + 0.25), Y(y)); g.lineTo(X((LANE_X + TW) / 2), Y(y + 0.7)); g.lineTo(X(TW - 0.25), Y(y)); g.stroke(); }
  plainText(g, "SHOOT", X((LANE_X + TW) / 2), Y(16), 30, "#ffd23f", -Math.PI / 2);
  // shot labels
  plainText(g, "ORBIT", X(-9.3), Y(27.6), 34, "rgba(200,180,255,.9)", -Math.PI / 2);
  plainText(g, "ORBIT", X(7.8), Y(27.6), 34, "rgba(200,180,255,.9)", -Math.PI / 2);
  plainText(g, "SPIN", X(-8.7), Y(22.3), 26, "rgba(255,210,63,.9)", 0);
  plainText(g, "VAULT", X(X0), Y(21.2), 24, "rgba(255,255,255,.85)", 0);
  // the top lane area
  g.fillStyle = "rgba(4,2,20,.45)"; g.fillRect(X(-3.95), Y(37.2), X(2.05) - X(-3.95), Y(33.4) - Y(37.2));
  // outline sockets where the inserts sit (the lit lenses are their own meshes)
  // the shooter lane exit and the arch edge
  g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 6;
  g.beginPath(); g.arc(X(0), Y(TOP_Y), (ARCH_R - 0.7) * kx, Math.PI, 0); g.stroke();
  // a thin border of light where the playfield meets the walls
  g.strokeStyle = "rgba(63,240,255,.35)"; g.lineWidth = 4; g.strokeRect(2, 2, CW - 4, CH - 4);
  return c;
}

// The plastic apron across the bottom: a wordmark between two cards.
function apronCanvas(script, logo) {
  const c = mkCanvas(1024, 384), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 384);
  bg.addColorStop(0, "#232a6e"); bg.addColorStop(1, "#0e1238");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 384);
  g.fillStyle = "rgba(255,255,255,.07)";
  for (let x = -384; x < 1024; x += 40) { g.beginPath(); g.moveTo(x, 384); g.lineTo(x + 384, 0); g.lineTo(x + 398, 0); g.lineTo(x + 14, 384); g.closePath(); g.fill(); }
  // left card: how to play
  rrectPath(g, 36, 150, 260, 200, 18); g.fillStyle = "#f6edd4"; g.fill(); g.lineWidth = 6; g.strokeStyle = "#ff9214"; g.stroke();
  g.fillStyle = "#12224f"; g.font = "900 26px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("RING RUSH", 166, 186);
  g.font = "bold 19px " + HUD_FONT;
  ["Drop R I N G", "to light LOCK.", "Lock 2 in the vault", "for multiball."].forEach(function (s, i) { g.fillText(s, 166, 222 + i * 30); });
  // right card: the studio logo
  rrectPath(g, 728, 150, 260, 200, 18); g.fillStyle = "#f6edd4"; g.fill(); g.lineWidth = 6; g.strokeStyle = "#ff9214"; g.stroke();
  drawFit(g, logo, 858, 236, 220, 150);
  g.fillStyle = "#12224f"; g.font = "bold 18px " + HUD_FONT; g.fillText("3 BALLS PER GAME", 858, 330);
  // the wordmark in the middle
  drawFit(g, script, 512, 270, 340, 150);
  g.fillStyle = "#ff9214"; g.fillRect(0, 0, 1024, 10); g.fillStyle = "#ffe45c"; g.fillRect(0, 10, 1024, 4);
  return c;
}

// The backglass: the logo, the title, a sky full of rings.
function backglassCanvas(script, logo) {
  const CW = 1024, CH = 560, c = mkCanvas(CW, CH), g = c.getContext("2d"), rnd = rng(5);
  const bg = g.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, "#0b0a3a"); bg.addColorStop(0.55, "#3a0f7a"); bg.addColorStop(0.8, "#a8178f"); bg.addColorStop(1, "#ff6a3a");
  g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
  for (let i = 0; i < 160; i++) { g.fillStyle = "rgba(255,255,255," + (0.3 + rnd() * 0.6) + ")"; g.fillRect(rnd() * CW, rnd() * CH * 0.6, 2, 2); }
  // sun and grid
  const sx = 690, sy = 470, sr = 210;
  g.save(); g.beginPath(); g.arc(sx, sy, sr, Math.PI, 0); g.clip();
  const sun = g.createLinearGradient(0, sy - sr, 0, sy);
  sun.addColorStop(0, "#fff36a"); sun.addColorStop(0.6, "#ff9a2a"); sun.addColorStop(1, "#ff3f8e");
  g.fillStyle = sun; g.fillRect(sx - sr, sy - sr, sr * 2, sr);
  g.fillStyle = "#5a1280"; for (let k = 0; k < 6; k++) g.fillRect(sx - sr, sy - 110 + k * 22, sr * 2, 4 + k * 2.5);
  g.restore();
  g.fillStyle = "#1a0838"; g.fillRect(0, 470, CW, CH - 470);
  g.strokeStyle = "rgba(255,63,164,.8)"; g.lineWidth = 3;
  for (let k = -14; k <= 14; k++) { g.beginPath(); g.moveTo(sx + k * 20, 470); g.lineTo(sx + k * 120, CH); g.stroke(); }
  for (let k = 0; k < 5; k++) { const yy = 470 + (CH - 470) * Math.pow((k + 1) / 5, 1.6); g.beginPath(); g.moveTo(0, yy); g.lineTo(CW, yy); g.stroke(); }
  // rings flying out of the sun
  [[470, 120, 46], [560, 70, 30], [880, 110, 40], [960, 250, 28], [800, 300, 22], [430, 300, 26], [620, 200, 18]].forEach(function (r) { paintRing(g, r[0], r[1], r[2], r[2] * 0.28); });
  // the studio logo, left
  g.save(); g.shadowColor = "rgba(0,0,0,.55)"; g.shadowBlur = 24; g.shadowOffsetY = 10;
  drawFit(g, logo, 200, 268, 360, 470);
  g.restore();
  // the title, right
  candyText(g, "PINBALL", 690, 182, 150, 600);
  candyText(g, "RINGS", 690, 330, 170, 560, ["#ffffff", "#7ff0ff", "#1d8cff"]);
  g.lineWidth = 14; g.strokeStyle = "#ff9214"; g.strokeRect(7, 7, CW - 14, CH - 14);
  g.lineWidth = 4; g.strokeStyle = "#ffe45c"; g.strokeRect(20, 20, CW - 40, CH - 40);
  return c;
}

// The speaker panel around the LED board: two grilles, a wordmark on each.
function speakerCanvas(script) {
  const c = mkCanvas(1024, 192), g = c.getContext("2d");
  g.fillStyle = "#0b0c12"; g.fillRect(0, 0, 1024, 192);
  [[110, 96], [914, 96]].forEach(function (p) {
    g.fillStyle = "#16171f"; g.beginPath(); g.arc(p[0], p[1], 78, 0, TAU); g.fill();
    g.fillStyle = "#05060a";
    for (let y = -70; y <= 70; y += 9) for (let x = -70; x <= 70; x += 9) if (x * x + y * y < 66 * 66) { g.beginPath(); g.arc(p[0] + x, p[1] + y, 2.6, 0, TAU); g.fill(); }
    g.lineWidth = 6; g.strokeStyle = "#ff9214"; g.beginPath(); g.arc(p[0], p[1], 80, 0, TAU); g.stroke();
  });
  g.fillStyle = "#ff9214"; g.fillRect(0, 0, 1024, 6); g.fillRect(0, 186, 1024, 6);
  return c;
}

// Cabinet side art: black, with a magenta / cyan stripe and the wordmark.
function cabinetCanvas(script) {
  const c = mkCanvas(1024, 256), g = c.getContext("2d");
  g.fillStyle = "#0c0d14"; g.fillRect(0, 0, 1024, 256);
  const st = g.createLinearGradient(0, 0, 1024, 0);
  st.addColorStop(0, "#ff3fa4"); st.addColorStop(0.5, "#8a5cff"); st.addColorStop(1, "#2fd8ff");
  g.fillStyle = st; g.fillRect(0, 150, 1024, 22); g.fillRect(0, 186, 1024, 8);
  drawFit(g, script, 512, 82, 420, 130);
  return c;
}

function bumperCapCanvas(script, col) {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  const gr = g.createRadialGradient(110, 100, 10, 128, 128, 128);
  gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.6, "#f2f2f6"); gr.addColorStop(1, "#c9cbd6");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.lineWidth = 26; g.strokeStyle = col; g.beginPath(); g.arc(128, 128, 112, 0, TAU); g.stroke();
  g.lineWidth = 6; g.strokeStyle = "#ffffff"; g.beginPath(); g.arc(128, 128, 96, 0, TAU); g.stroke();
  drawFit(g, script, 128, 130, 170, 120);
  return c;
}
function stripeCanvas(col) {
  const c = mkCanvas(128, 64), g = c.getContext("2d");
  g.fillStyle = col; g.fillRect(0, 0, 128, 64);
  g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(0, 22, 128, 8);
  g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, 50, 128, 14);
  return c;
}
function dropCanvas(letter) {
  const c = mkCanvas(128, 160), g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 160);
  gr.addColorStop(0, "#fff36a"); gr.addColorStop(1, "#ffb21f");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 160);
  g.lineWidth = 8; g.strokeStyle = "#08205f"; g.strokeRect(4, 4, 120, 152);
  g.fillStyle = "#08205f"; g.font = "900 104px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(letter, 64, 86);
  return c;
}
function plateCanvas(script) {
  const c = mkCanvas(256, 128), g = c.getContext("2d");
  g.fillStyle = "#0d1f5c"; g.fillRect(0, 0, 256, 128);
  g.lineWidth = 8; g.strokeStyle = "#ffd23f"; g.strokeRect(4, 4, 248, 120);
  drawFit(g, script, 128, 64, 220, 100);
  return c;
}
function slingCanvas(col) {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  g.fillStyle = col; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "rgba(255,255,255,.22)";
  for (let k = -256; k < 256; k += 36) { g.beginPath(); g.moveTo(k, 256); g.lineTo(k + 256, 0); g.lineTo(k + 270, 0); g.lineTo(k + 14, 256); g.closePath(); g.fill(); }
  paintRing(g, 128, 128, 56, 18);
  return c;
}
// Lamp inserts: the lens shape in white (tinted by the material), with a label punched in dark.
function insertCanvas(shape, label) {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.save();
  if (shape === "arrow") {
    g.beginPath(); g.moveTo(64, 6); g.lineTo(118, 70); g.lineTo(88, 70); g.lineTo(88, 122); g.lineTo(40, 122); g.lineTo(40, 70); g.lineTo(10, 70); g.closePath();
  } else if (shape === "rect") rrectPath(g, 6, 34, 116, 60, 16);
  else { g.beginPath(); g.arc(64, 64, 58, 0, TAU); }
  const gr = g.createRadialGradient(54, 50, 6, 64, 64, 70);
  gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "#d8d8d8");
  g.fillStyle = gr; g.fill();
  g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,.55)"; g.stroke();
  g.restore();
  if (label) {
    g.fillStyle = "rgba(10,10,30,.85)"; g.textAlign = "center"; g.textBaseline = "middle";
    let size = shape === "rect" ? 30 : label.length > 2 ? 34 : 54;
    g.font = "900 " + size + "px " + HUD_FONT;
    const w = g.measureText(label).width, maxW = shape === "rect" ? 108 : 92;
    if (w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + HUD_FONT; }
    g.fillText(label, 64, shape === "arrow" ? 82 : 66);
  }
  return c;
}
function glowCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return c;
}
function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(0,0,10,.8)"); gr.addColorStop(0.55, "rgba(0,0,10,.4)"); gr.addColorStop(1, "rgba(0,0,10,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
// The arcade floor: dark carpet with neon confetti.
function carpetCanvas() {
  const S2 = 512, c = mkCanvas(S2, S2), g = c.getContext("2d"), rnd = rng(41);
  g.fillStyle = "#120f2e"; g.fillRect(0, 0, S2, S2);
  const cols = ["#ff3fa4", "#2fd8ff", "#ffd23f", "#8a5cff", "#9bff3f"];
  g.lineCap = "round"; g.lineWidth = 5;
  for (let i = 0; i < 40; i++) {
    const x = rnd() * S2, y = rnd() * S2, a = rnd() * TAU, sz = 10 + rnd() * 12;
    for (let ox = -S2; ox <= S2; ox += S2) for (let oy = -S2; oy <= S2; oy += S2) {
      g.save(); g.translate(x + ox, y + oy); g.rotate(a); g.globalAlpha = 0.55; g.strokeStyle = cols[i % cols.length];
      if (i % 3 === 0) { g.beginPath(); g.arc(0, 0, sz * 0.5, 0, TAU); g.stroke(); }
      else if (i % 3 === 1) { g.beginPath(); g.moveTo(-sz, 0); g.quadraticCurveTo(-sz / 2, -sz * 0.7, 0, 0); g.quadraticCurveTo(sz / 2, sz * 0.7, sz, 0); g.stroke(); }
      else { g.beginPath(); g.moveTo(0, -sz * 0.6); g.lineTo(sz * 0.55, sz * 0.4); g.lineTo(-sz * 0.55, sz * 0.4); g.closePath(); g.stroke(); }
      g.restore();
    }
  }
  return c;
}
// The back wall of the arcade, with the wordmark glowing on it like a neon sign.
function roomWallCanvas(script) {
  const c = mkCanvas(1024, 512), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, "#07061a"); bg.addColorStop(1, "#1a0f3a");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 512);
  g.save(); g.shadowColor = "#ff3fa4"; g.shadowBlur = 40;
  drawFit(g, script, 512, 200, 560, 260);
  g.restore();
  g.strokeStyle = "rgba(47,216,255,.6)"; g.lineWidth = 4; g.shadowColor = "#2fd8ff"; g.shadowBlur = 20;
  g.strokeRect(200, 40, 624, 330);
  return c;
}
// A tiny painted room for the chrome: what the ball, rails and rings reflect.
function envFaces() {
  const side = function (k) {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.2, "#b9a6ff"); gr.addColorStop(0.42, "#ff3fa4");
    gr.addColorStop(0.5, "#2a0f6e"); gr.addColorStop(0.53, "#2fd8ff"); gr.addColorStop(1, "#140a3a");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(10 + k * 9, 6, 12, 18);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#2a1f6e"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(6, 8, 52, 10); tg.fillRect(6, 40, 52, 10);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#1c0f5e"; bgx.fillRect(0, 0, 64, 64);
  return [side(0), side(1), top, bot, side(2), side(3)];
}

/* ---------------- LED board: the dot matrix in the backbox ----------------
   A real dot matrix. Everything on it is painted into a tiny canvas, one pixel per LED, and a small shader
   turns each pixel into a glowing dot. In play it shows the score; between games it scrolls the arcade's
   plugs; and it cuts to big animated messages when the table calls for one. */
const LED_ROWS = 32, LED_COLS = 128;
const LED_SPEED = 40;
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["COLLECT EVERY RING", "yellow"], ["NO QUARTERS REQUIRED", "cyan"]];
// Plugs for the rest of the arcade: [game, one-line tag]. Edit freely, the board lays itself out.
const LED_PLUGS = [
  ["TAPE PIN LANES", "BOWLING"],
  ["SHELF LINKS", "MINI GOLF"],
  ["BARGAIN BIN BUCKETS", "HOOPS"],
  ["BLEACHER CARTS", "HOME RUN DERBY"],
  ["TICKET ROLL ALLEY", "ROLL FOR TICKETS"],
  ["PAWN SHOP POOL", "RACK 'EM UP"],
  ["RINK RAT SHOOTOUT", "HOCKEY SHOOTOUT"],
  ["TABLE RINK RUMBLE", "AIR HOCKEY"],
  ["CREATURE FEATURE KO", "VHS BOSS RUSH"]
];
let LED = null;

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
    "*": "00000 00100 01110 11111 01110 00100 00000", "o": "00000 01110 10001 10001 10001 01110 00000"
  };
  const out = {};
  for (const ch in src) out[ch] = src[ch].split(" ");
  return out;
})();
function ledCharW(ch) { return ch === " " ? 4 : ch === "," || ch === "." ? 4 : 6; }
function ledTextW(str, sx) {
  let w = 0;
  for (let i = 0; i < str.length; i++) w += ledCharW(str[i]) * sx;
  return Math.max(0, w - sx);
}
function ledText(g, str, x, y, sx, sy, color) {
  g.fillStyle = color;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === " ") { x += 4 * sx; continue; }
    const rows = LED_FONT[ch] || LED_FONT["?"], narrow = ch === "," || ch === ".";
    for (let r = 0; r < 7; r++) {
      const row = rows[r];
      for (let c = narrow ? 1 : 0; c < (narrow ? 4 : 5); c++) if (row.charCodeAt(c) === 49) g.fillRect(x + (c - (narrow ? 1 : 0)) * sx, y + r * sy, sx, sy);
    }
    x += ledCharW(ch) * sx;
  }
  return x;
}
// A small gold ring in LEDs (the board's own icon).
function ledRing(g, x, y, r, col) {
  g.fillStyle = col;
  for (let a = 0; a < 40; a++) { const t = a / 40 * TAU; g.fillRect(Math.round(x + Math.cos(t) * r), Math.round(y + Math.sin(t) * r * 1.1), 1, 1); }
}

// The whole scrolling programme, painted once into one long strip.
function ledStrip(script) {
  const H = LED_ROWS, big = 3, yBig = Math.floor((H - 7 * big) / 2), GAP = 12, items = [];
  // The wordmark at board resolution: cream lettering pushed to full brightness, the red edge kept as a rim.
  const markW = Math.max(8, Math.round(H * script.width / script.height));
  const markC = mkCanvas(markW, H), mg = markC.getContext("2d", { willReadFrequently: true });
  mg.imageSmoothingEnabled = true; mg.imageSmoothingQuality = "high";
  mg.drawImage(script, 0, 0, markW, H);
  try {
    const im = mg.getImageData(0, 0, markW, H), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const m = Math.max(d[i], d[i + 1], d[i + 2]);
      if (m < 6) continue;
      const warm = d[i] >= d[i + 2], cream = warm && d[i + 1] > 0.55 * d[i];
      let k = cream ? (m > 70 ? 255 / m : 0.2) : warm ? 0.6 : 0.1;
      k = Math.min(k, 255 / m);
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    }
    mg.putImageData(im, 0, 0);
  } catch (e) { /* leave it as drawn */ }
  function mark() { items.push({ w: markW, draw: function (g, x) { g.drawImage(markC, x, 0); } }); }
  function line(str, color) { items.push({ w: ledTextW(str, big), draw: function (g, x) { ledText(g, str, x, yBig, big, big, color); } }); }
  function title() {
    const s = 2, w = Math.max(ledTextW("PINBALL", s), ledTextW("RINGS", s)) + 22;
    items.push({ w: w, draw: function (g, x) {
      ledRing(g, x + 7, 16, 6, LED_C.yellow);
      ledText(g, "PINBALL", x + 18, 1, s, s, LED_C.yellow);
      ledText(g, "RINGS", x + 18, 17, s, s, LED_C.cyan);
    } });
  }
  function plug(name, tag, color) {
    const ns = 2, ts = 1, pad = 7, tab = ledTextW("FREE", ts) + 4;
    const top = Math.max(1, Math.floor((H - (7 * ts + 3 + 7 * ns)) / 2));
    const w = pad + Math.max(ledTextW(name, ns), tab + 4 + ledTextW(tag, ts));
    items.push({ w: w, draw: function (g, x) {
      g.fillStyle = color; g.fillRect(x, 2, 3, H - 4);
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
    mark(); title();
    line(LED_LINES[k][0], LED_C[LED_LINES[k][1]] || LED_C.amber);
    for (let j = 0; j < per && n < LED_PLUGS.length; j++, n++) plug(LED_PLUGS[n][0], LED_PLUGS[n][1], tints[n % tints.length]);
  }
  let total = 0;
  for (let i = 0; i < items.length; i++) total += items[i].w + GAP * 2 + 7;
  const c = mkCanvas(total, H), g = c.getContext("2d");
  g.fillStyle = "#000000"; g.fillRect(0, 0, total, H);
  let x = 0;
  for (let i = 0; i < items.length; i++) {
    items[i].draw(g, x);
    x += items[i].w + GAP;
    ledText(g, "*", x, Math.floor((H - 7) / 2), 1, 1, LED_C.blue);
    x += 7 + GAP;
  }
  return { canvas: c, markW: markW };
}

function ledCreate(script) {
  const c = mkCanvas(LED_COLS, LED_ROWS), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  const strip = ledStrip(script), sw = strip.canvas.width;
  const start = ((-(LED_COLS - strip.markW) / 2) % sw + sw) % sw;
  return { canvas: c, g: g, strip: strip.canvas, scroll: start, pos: -1, msg: null, queue: [], frame: -1, tex: null, idleKey: "" };
}
function ledDotCanvas() {
  const c = mkCanvas(32, 32), g = c.getContext("2d");
  g.fillStyle = "#000000"; g.fillRect(0, 0, 32, 32);
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.45, "#f4f4f4"); gr.addColorStop(0.8, "#585858"); gr.addColorStop(1, "#000000");
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return c;
}
function ledMsg(kind, text, dur, more) {
  const m = { kind: kind, text: text, dur: dur, t: 0, wait: 0 };
  if (more) for (const k in more) m[k] = more[k];
  return m;
}
// Cut to a list of messages (or queue them after what is showing), then go back to the score.
function ledPlay(list, append) {
  const L = LED;
  if (!L || !list.length) return;
  if (append && L.msg) { for (let i = 0; i < list.length; i++) if (L.queue.length < 4) L.queue.push(list[i]); return; }
  L.msg = list[0]; L.msg.t = 0;
  L.queue = list.slice(1);
  L.frame = -1;
}
function ledClear() { if (LED) { LED.msg = null; LED.queue = []; LED.pos = -1; LED.idleKey = ""; } }
function ledFinal(score) {
  if (!LED) return;
  ledPlay([ledMsg("count", "FINAL", 6, { from: 0, value: score, final: true, wait: 0.5 })]);
}

function ledDrawMsg(g, m) {
  const W = LED_COLS, H = LED_ROWS, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), mid = Math.round(W / 2);
  const step = calm ? 0 : Math.floor(m.t * 24);
  function fit(str, most) {
    let sx = most || LED_BIG;
    while (sx > 1 && ledTextW(str, sx) > W - 6) sx--;
    return sx;
  }
  function chase(color, dir) {
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < W; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(W - x - 3, H - 1, 3, 1); }
  }
  const col = LED_C[m.color] || null;
  const sx = fit(m.text, m.big ? LED_BIG : 3), sy = sx, w = ledTextW(m.text, sx), x0 = Math.round((W - w) / 2), y0 = Math.floor((H - 7 * sy) / 2);

  if (m.kind === "flash" || m.kind === "jackpot") {
    if (!calm && t < 0.6 && Math.floor(t * 12) % 2 === 0) {
      g.fillStyle = col || LED_C.yellow; g.fillRect(0, 0, W, H);
      ledText(g, m.text, x0, y0, sx, sy, "#000000");
      return;
    }
    if (m.kind === "jackpot") {
      const span = 6 * 2 + 4, ph = calm ? 0 : Math.floor((t * 40) % span);
      for (let k = 0; k < 8; k++) {
        const off = Math.round(w / 2) + 4 + k * span + ph;
        if (off > mid + span) break;
        const cc = k % 2 ? LED_C.red : LED_C.orange, yy = Math.floor((H - 14) / 2);
        ledText(g, ">", mid + off, yy, 2, 2, cc);
        ledText(g, "<", mid - off - 10, yy, 2, 2, cc);
      }
      if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 14; i++) g.fillRect((Math.random() * W) | 0, (Math.random() * H) | 0, 1, 1); }
    }
    const cyc = [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0, y0, sx, sy, calm ? (col || LED_C.yellow) : m.kind === "jackpot" ? cyc[Math.floor(t * 8) % 3] : (col || LED_C.yellow));
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "slide") {
    const k = calm ? 1 : Math.min(1, t / 0.35), e = 1 - Math.pow(1 - k, 3);
    const x = Math.round(x0 + (1 - e) * W);
    ledText(g, m.text, x, y0, sx, sy, col || LED_C.cyan);
    if (!calm && k >= 1) {
      const bx = Math.floor(((t - 0.35) * 160) % (W + 60)) - 30;
      g.save(); g.beginPath(); g.rect(bx, 0, 8, H); g.clip();
      ledText(g, m.text, x, y0, sx, sy, "#ffffff");
      g.restore();
    }
    chase(col || LED_C.cyan, -1);
    return;
  }
  if (m.kind === "blink") {
    if (calm || Math.floor(t * 6) % 2 === 0) ledText(g, m.text, x0, y0, sx, sy, col || LED_C.pink);
    return;
  }
  if (m.kind === "cycle") {
    const cyc = [LED_C.pink, LED_C.cyan, LED_C.yellow, LED_C.lime, LED_C.violet];
    let x = x0;
    for (let i = 0; i < m.text.length; i++) {
      const ch = m.text[i], bob = calm ? 0 : Math.round(Math.sin(t * 9 + i * 0.7) * 1.5);
      ledText(g, ch, x, y0 + bob, sx, sy, calm ? (col || LED_C.yellow) : cyc[(i + Math.floor(t * 6)) % cyc.length]);
      x += ledCharW(ch) * sx;
    }
    chase(LED_C.violet, 1);
    return;
  }
  // count: a label over a number that counts up to its value
  const k = calm ? 1 : Math.min(1, t / 0.8), v = Math.round(m.from + (m.value - m.from) * k);
  const num = fmtScore(v), ns = fit(num, 3), lw = ledTextW(m.text, 1);
  ledText(g, m.text, Math.round((W - lw) / 2), 2, 1, 1, col || LED_C.amber);
  const nw = ledTextW(num, ns), done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
  ledText(g, num, Math.round((W - nw) / 2), 11 + Math.floor((21 - 7 * ns) / 2), ns, ns, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
  chase(LED_C.amber, 1);
}

// In play, with nothing to announce: the score up top, the ball and the mission underneath.
function ledIdle(g) {
  const W = LED_COLS, H = LED_ROWS;
  const sc = fmtScore(S.score);
  let sx = 3;
  while (sx > 1 && ledTextW(sc, sx) > W - 4) sx--;
  ledText(g, sc, Math.round((W - ledTextW(sc, sx)) / 2), sx === 3 ? 1 : 3, sx, sx, LED_C.amber);
  let line;
  const m = mission(), alt = Math.floor(S.t / 3.5) % 2 === 0;
  if (S.phase === "bonus") line = "BALL " + S.ball + " BONUS";
  else if (S.mb) line = alt ? "SHOOT RAMPS FOR JACKPOT" : "RING RUSH  JACKPOTS " + S.jackpots;
  else if (armed() && inPlay() === 1) line = alt ? "BALL " + S.ball + "  PULL TO LAUNCH" : "MISSION: " + m.name;
  else line = alt ? "BALL " + S.ball + "   RINGS " + S.ringsGame : m.name + " " + Math.min(S.prog, missionNeed()) + "/" + missionNeed();
  const lw = ledTextW(line, 1);
  ledText(g, line, Math.round((W - lw) / 2), H - 8, 1, 1, S.mb ? LED_C.pink : LED_C.cyan);
  return sc + "|" + line;
}

function ledDraw(state) {
  const L = LED, g = L.g, W = LED_COLS, H = LED_ROWS;
  g.fillStyle = "#000000"; g.fillRect(0, 0, W, H);
  if (L.msg) { ledDrawMsg(g, L.msg); return; }
  if (state === "playing" || state === "paused") { ledIdle(g); return; }
  const sw = L.strip.width;
  let sx = L.pos, dx = 0;
  while (dx < W) {
    const n = Math.min(W - dx, sw - sx);
    g.drawImage(L.strip, sx, 0, n, H, dx, 0, n, H);
    dx += n; sx = 0;
  }
}
// Advance the board. It only repaints (and re-uploads its tiny texture) when an LED actually changes.
function ledTick(dt, state) {
  const L = LED;
  if (!L) return;
  let redraw = false;
  if (L.msg) {
    L.msg.t += dt;
    if (L.msg.t >= L.msg.dur) { L.msg = L.queue.shift() || null; L.frame = -1; L.idleKey = ""; redraw = true; }
  }
  if (L.msg) {
    const f = Math.floor(L.msg.t * 30);
    if (f !== L.frame) { L.frame = f; redraw = true; }
  } else if (state === "playing" || state === "paused") {
    const key = fmtScore(S.score) + S.ball + S.prog + S.mission + S.mb + S.jackpots + S.ringsGame + Math.floor(S.t / 3.5) + armed();
    if (key !== L.idleKey) { L.idleKey = key; redraw = true; }
  } else {
    const sw = L.strip.width;
    L.scroll = (L.scroll + dt * (Shell.reduced ? LED_SPEED * 0.5 : LED_SPEED)) % sw;
    const p = Math.floor(L.scroll);
    if (p !== L.pos) { L.pos = p; redraw = true; }
  }
  if (redraw) { ledDraw(state); if (L.tex) L.tex.needsUpdate = true; }
}

/* ---------------- Scene ---------------- */
const CAM_FOV = 40, CAM_PITCH = 49 * DEG;
const HUD_H = 50;
const SAFE = { x1: 2, x2: W - 2, y1: HUD_H + 2, y2: H - 2 };
const BUMPER_COLS = ["#ff3fa4", "#2fd8ff", "#ffd23f"];
const MAX_BALLS = 6;

// Lamp inserts: x, y, size, which way it points (degrees, 0 = up the table), shape, label, color, what lights it.
const INSERTS = [
  { x: -7.6, y: 19.4, s: 1.25, rot: 28, shape: "arrow", label: "", col: "#b68cff", key: "orbit" },
  { x: 6.1, y: 19.4, s: 1.25, rot: -28, shape: "arrow", label: "", col: "#b68cff", key: "orbit" },
  { x: -5.3, y: 18.6, s: 1.4, rot: 18, shape: "arrow", label: "", col: "#2fd8ff", key: "ramp0" },
  { x: 3.8, y: 18.6, s: 1.4, rot: -18, shape: "arrow", label: "", col: "#ff3fa4", key: "ramp1" },
  { x: -5.3, y: 16.8, s: 2.0, rot: 0, shape: "rect", label: "JACKPOT", col: "#ffd23f", key: "jackpot" },
  { x: 3.8, y: 16.8, s: 2.0, rot: 0, shape: "rect", label: "JACKPOT", col: "#ffd23f", key: "jackpot" },
  { x: X0, y: 19.4, s: 1.25, rot: 0, shape: "arrow", label: "LOCK", col: "#2fd8ff", key: "vault" },
  { x: X0, y: 3.4, s: 2.7, rot: 0, shape: "rect", label: "SHOOT AGAIN", col: "#ff4b3e", key: "again" }
];
DROPS.forEach(function (d, i) { INSERTS.push({ x: d.x, y: 16.75, s: 0.78, rot: 0, shape: "circle", label: DROP_LETTERS[i], col: "#ffd23f", key: "drop" + i }); });
["2X", "3X", "4X", "5X"].forEach(function (l, i) { INSERTS.push({ x: -2.4 + i * 1.1, y: 15.3, s: 0.86, rot: 0, shape: "circle", label: l, col: "#ff8a1e", key: "mult" + (i + 2) }); });
["N", "P", "G"].forEach(function (l, i) { INSERTS.push({ x: TOP_LANES[i], y: LANE_Y, s: 0.95, rot: 0, shape: "circle", label: l, col: "#9bff3f", key: "lane" + i }); });

function buildScene(T, scriptImg, logoImg, opts) {
  opts = opts || {};
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2 || !!opts.cover, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.cover });
  renderer.setClearColor(0x07061a, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = (parseInt(T.REVISION, 10) || 0) >= 182 ? T.PCFShadowMap : T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(CAM_FOV, W / H, 2, 900);
  const caps = renderer.capabilities;
  const aniso = Math.min(8, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = aniso;
    return t;
  }

  const script = scriptCanvas(scriptImg), logo = logoCanvas(logoImg, script);
  const tPF = tex(playfieldCanvas(script)), tApron = tex(apronCanvas(script, logo)), tBack = tex(backglassCanvas(script, logo));
  const tSpeak = tex(speakerCanvas(script)), tCab = tex(cabinetCanvas(script)), tGlow = tex(glowCanvas()), tShadow = tex(shadowCanvas());
  const tCarpet = tex(carpetCanvas(), true), tRoom = tex(roomWallCanvas(script)), tPlate = tex(plateCanvas(script));
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;

  /* lights */
  scene.add(new T.HemisphereLight(0xe8e6ff, 0x2a1d58, 1.25));
  const key = new T.DirectionalLight(0xfff4e6, 2.6);
  key.position.set(-14, 70, 6);
  key.target.position.set(0, 0, -22);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -26; sc.right = 26; sc.top = 30; sc.bottom = -30; sc.near = 20; sc.far = 140;
  sc.updateProjectionMatrix();
  key.shadow.bias = -0.0008; key.shadow.normalBias = 0.04;
  scene.add(key); scene.add(key.target);
  const fill = new T.DirectionalLight(0xb8a8ff, 0.7);
  fill.position.set(30, 30, 40); scene.add(fill);

  /* materials */
  const chrome = new T.MeshPhongMaterial({ color: 0x8c8ea0, specular: 0xffffff, shininess: 120, envMap: tEnv, combine: T.MixOperation, reflectivity: 0.72 });
  const darkMetal = new T.MeshPhongMaterial({ color: 0x2c2e3a, specular: 0x888899, shininess: 70 });
  const railDark = new T.MeshPhongMaterial({ color: 0x3a3550, specular: 0x9988cc, shininess: 80, envMap: tEnv, combine: T.MixOperation, reflectivity: 0.25 });
  const wallMat = new T.MeshPhongMaterial({ color: 0x241653, specular: 0x6655aa, shininess: 40 });
  const wallTop = new T.MeshPhongMaterial({ color: 0x15102e, specular: 0x333355, shininess: 30 });
  const rubber = new T.MeshPhongMaterial({ color: 0xf4f1ea, specular: 0x444444, shininess: 25 });
  const redRubber = new T.MeshPhongMaterial({ color: 0xe0281e, specular: 0x553333, shininess: 30 });
  const plasticMat = function (col, op) { return new T.MeshPhongMaterial({ color: new T.Color(col), specular: 0xffffff, shininess: 100, transparent: true, opacity: op == null ? 0.62 : op, depthWrite: false, side: T.DoubleSide }); };
  const blobMat = new T.MeshBasicMaterial({ map: tShadow, transparent: true, depthWrite: false, opacity: 0.7 });

  const table = new T.Group();
  table.rotation.x = TILT;
  scene.add(table);
  function V3(x, y, h) { return new T.Vector3(x, h, -y); }
  function lit(m, cast, recv) { m.castShadow = !!cast; m.receiveShadow = !!recv; return m; }
  function add(m, parent) { (parent || table).add(m); return m; }
  // a box standing on the playfield along a table segment
  function segBox(x1, y1, x2, y2, th, h0, h1, mat) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const m = new T.Mesh(new T.BoxGeometry(len + th, h1 - h0, th), mat);
    m.position.set((x1 + x2) / 2, (h0 + h1) / 2, -(y1 + y2) / 2);
    m.rotation.y = Math.atan2(y2 - y1, x2 - x1);
    return m;
  }
  // a flat shape on the playfield (table coordinates), its texture spread over the box u0..u1, v0..v1
  function flatShape(pts, h, mat, box) {
    const shape = new T.Shape(pts.map(function (p) { return new T.Vector2(p[0], p[1]); }));
    const g = new T.ShapeGeometry(shape, 12);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      if (box) uv.setXY(i, (x - box[0]) / (box[2] - box[0]), (y - box[1]) / (box[3] - box[1]));
    }
    g.rotateX(-Math.PI / 2);
    g.translate(0, h, 0);
    return new T.Mesh(g, mat);
  }

  /* the playfield */
  const pfGeo = new T.PlaneGeometry(2 * TW, PF_Y1 - PF_Y0);
  pfGeo.rotateX(-Math.PI / 2);
  const playfield = lit(new T.Mesh(pfGeo, new T.MeshPhongMaterial({ map: tPF, specular: 0x6a6a7a, shininess: 70 })), false, true);
  playfield.position.set(0, 0, -(PF_Y0 + PF_Y1) / 2);
  add(playfield);

  /* cabinet walls and the arch: one continuous wall, a block filling the corners above the arch */
  (function () {
    const pts = [[-TW, PF_Y0]];
    for (let i = 0; i <= ARC_N; i++) { const a = Math.PI - i / ARC_N * Math.PI; pts.push([Math.cos(a) * ARCH_R, TOP_Y + Math.sin(a) * ARCH_R]); }
    pts.push([TW, PF_Y0]);
    const TH = 0.9, HT = 2.3, pos = [], nor = [], idx = [];
    function quad(a, b, c, d, n) {
      const base = pos.length / 3;
      [a, b, c, d].forEach(function (p) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); });
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy), ox = -dy / l, oy = dx / l;
      const n = new T.Vector3(-ox, 0, oy);                 // the inner face looks into the table
      quad(V3(p[0], p[1], 0), V3(q[0], q[1], 0), V3(q[0], q[1], HT), V3(p[0], p[1], HT), n);
      quad(V3(p[0], p[1], HT), V3(q[0], q[1], HT), V3(q[0] + ox * TH, q[1] + oy * TH, HT), V3(p[0] + ox * TH, p[1] + oy * TH, HT), new T.Vector3(0, 1, 0));
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    add(lit(new T.Mesh(g, [wallMat]), true, true)).material = new T.MeshPhongMaterial({ color: 0x2b1a63, specular: 0x7766cc, shininess: 50, side: T.DoubleSide });
    // corner blocks above the arch
    [-1, 1].forEach(function (s) {
      const cp = [[s * (TW + TH), TOP_Y], [s * (TW + TH), PF_Y1 + 0.6], [0, PF_Y1 + 0.6]];
      for (let i = 0; i <= 20; i++) { const a = Math.PI / 2 + (s < 0 ? 1 : -1) * i / 20 * Math.PI / 2; cp.push([Math.cos(a) * (ARCH_R + TH * 0.5), TOP_Y + Math.sin(a) * (ARCH_R + TH * 0.5)]); }
      const m = flatShape(cp, HT, wallTop);
      add(lit(m, false, true));
    });
    // side rails on top of the cabinet walls, and the cabinet sides below
    [-1, 1].forEach(function (s) {
      const r = new T.Mesh(new T.BoxGeometry(0.9, 0.6, PF_Y1 - PF_Y0 + 3.2), railDark);
      r.position.set(s * (TW + 1.2), HT + 0.1, -(PF_Y0 + PF_Y1) / 2 + 1.0); add(lit(r, true, true));
      const side = new T.Mesh(new T.BoxGeometry(0.8, 9, PF_Y1 - PF_Y0 + 3.2), new T.MeshPhongMaterial({ map: tCab, specular: 0x444444, shininess: 40 }));
      side.position.set(s * (TW + 1.6), HT - 4.6, -(PF_Y0 + PF_Y1) / 2 + 1.0); add(side);
    });
    // the lockdown bar across the front
    const lock = new T.Mesh(new T.BoxGeometry(2 * TW + 4, 1.1, 1.6), chrome);
    lock.position.set(0, HT + 0.2, -(PF_Y0 - 1.2)); add(lit(lock, true, true));
    const front = new T.Mesh(new T.BoxGeometry(2 * TW + 4, 9, 1.2), new T.MeshPhongMaterial({ map: tCab, shininess: 30 }));
    front.position.set(0, HT - 4.4, -(PF_Y0 - 1.6)); add(front);
    const body = new T.Mesh(new T.BoxGeometry(2 * TW + 3, 12, PF_Y1 - PF_Y0 + 3), new T.MeshLambertMaterial({ color: 0x0b0a16 }));
    body.position.set(0, -6.1, -(PF_Y0 + PF_Y1) / 2 + 0.8); add(body);
  })();

  /* guides, rails, plastics, posts */
  const railMat = chrome;
  const funnelMats = [plasticMat(RAMPS[0].color, 0.55), plasticMat(RAMPS[1].color, 0.55)];
  const gates = [];
  SEGS.forEach(function (s) {
    if (s.look === "rail") add(lit(segBox(s.x1, s.y1, s.x2, s.y2, 0.18, 0, 0.95, railMat), true, true));
    else if (s.look === "plastic") add(segBox(s.x1, s.y1, s.x2, s.y2, 0.18, 0, 1.25, s.x1 < 0 ? funnelMats[0] : funnelMats[1]));
    else if (s.look === "laneguide") {
      add(lit(segBox(s.x1, s.y1, s.x2, s.y2, 0.26, 0, 0.8, new T.MeshPhongMaterial({ color: 0x7c3cff, specular: 0xffffff, shininess: 90 })), true, true));
      [s.y1, s.y2].forEach(function (y) { const c = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 1.1, 12), chrome); c.position.set(s.x1, 0.55, -y); add(lit(c, true, false)); });
    } else if (s.look === "gate" || s.look === "diverter") {
      // a one-way gate: a hinged wire flap that swings up for a ball going the right way
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      const gg = new T.Group();
      gg.position.set((s.x1 + s.x2) / 2, 0, -(s.y1 + s.y2) / 2);
      gg.rotation.y = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const bar = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, len, 8), chrome); bar.rotation.z = Math.PI / 2; bar.position.y = 1.0; gg.add(bar);
      const flap = new T.Group(); flap.position.y = 1.0; gg.add(flap);
      const plate = new T.Mesh(new T.BoxGeometry(len - 0.2, 0.95, 0.05), new T.MeshPhongMaterial({ color: 0xd8dbe6, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.85 }));
      plate.position.y = -0.5; flap.add(plate);
      [-1, 1].forEach(function (k) { const p = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 1.05, 8), chrome); p.position.set(k * len / 2, 0.52, 0); gg.add(p); });
      add(gg);
      gates.push({ s: s, flap: flap, a: 0 });
    }
  });
  const postGeo = new T.CylinderGeometry(0.12, 0.12, 1.05, 10), ringGeo = new T.TorusGeometry(1, 0.09, 8, 24);
  CIRCS.forEach(function (c) {
    if (c.look !== "post") return;
    const p = new T.Mesh(postGeo, chrome); p.position.set(c.x, 0.52, -c.y); add(lit(p, true, false));
    const r = new T.Mesh(ringGeo, redRubber); r.scale.set(c.r - 0.02, c.r - 0.02, 1.2); r.rotation.x = Math.PI / 2; r.position.set(c.x, 0.5, -c.y); add(lit(r, true, false));
  });

  /* slingshots: a plastic triangle over rubber bands */
  const slings = SLINGS.map(function (sl) {
    const A = sl.A, B = sl.B, C = sl.C;
    const top = flatShape([A, B, C], 1.2, new T.MeshPhongMaterial({ map: tex(slingCanvas(sl.side < 0 ? "#2fd8ff" : "#ff3fa4")), specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.9 }),
      [Math.min(A[0], B[0], C[0]), Math.min(A[1], B[1], C[1]), Math.max(A[0], B[0], C[0]), Math.max(A[1], B[1], C[1])]);
    add(lit(top, true, false));
    add(segBox(A[0], A[1], B[0], B[1], 0.16, 0.2, 0.75, rubber)); add(segBox(B[0], B[1], C[0], C[1], 0.16, 0.2, 0.75, rubber));
    const kick = segBox(A[0], A[1], C[0], C[1], 0.18, 0.2, 0.8, rubber); add(lit(kick, true, false));
    // which way the kick face looks (into the playfield)
    const ex = C[0] - A[0], ey = C[1] - A[1], l = Math.hypot(ex, ey);
    let nx = -ey / l, ny = ex / l;
    if ((X0 - A[0]) * nx + (12 - A[1]) * ny < 0) { nx = -nx; ny = -ny; }
    const glow = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: new T.Color(sl.side < 0 ? "#2fd8ff" : "#ff3fa4"), blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    glow.position.set((A[0] + B[0] + C[0]) / 3, 1.4, -(A[1] + B[1] + C[1]) / 3); glow.scale.set(3.4, 3.4, 1); add(glow);
    return { kick: kick, nx: nx, ny: ny, base: kick.position.clone(), glow: glow };
  });

  /* pop bumpers */
  const bumpers = BUMPERS.map(function (b, i) {
    const col = BUMPER_COLS[i], gg = new T.Group();
    gg.position.set(b.x, 0, -b.y);
    const base = new T.Mesh(new T.CylinderGeometry(1.15, 1.2, 0.22, 28), darkMetal); base.position.y = 0.11; gg.add(lit(base, true, true));
    const bodyMat = new T.MeshPhongMaterial({ map: tex(stripeCanvas(col), true), specular: 0xffffff, shininess: 80, transparent: true, opacity: 0.92 });
    const body = new T.Mesh(new T.CylinderGeometry(0.82, 0.86, 1.0, 28, 1, true), bodyMat); body.position.y = 0.72; gg.add(lit(body, true, false));
    const skirt = new T.Mesh(new T.CylinderGeometry(1.05, 1.08, 0.12, 28), new T.MeshPhongMaterial({ color: 0xf2f2f6, specular: 0xffffff, shininess: 90 }));
    skirt.position.y = 0.3; gg.add(lit(skirt, true, true));
    const capMat = new T.MeshPhongMaterial({ map: tex(bumperCapCanvas(script, col)), specular: 0xffffff, shininess: 110, emissive: new T.Color(col), emissiveIntensity: 0 });
    const capSide = new T.MeshPhongMaterial({ color: new T.Color(col), specular: 0xffffff, shininess: 110, emissive: new T.Color(col), emissiveIntensity: 0 });
    const cap = new T.Mesh(new T.CylinderGeometry(1.1, 1.1, 0.3, 32), [capSide, capMat, capSide]); cap.position.y = 1.36; gg.add(lit(cap, true, false));
    const glow = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: new T.Color(col), blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.2 }));
    glow.position.y = 1.6; glow.scale.set(4.6, 4.6, 1); gg.add(glow);
    add(gg);
    return { g: gg, skirt: skirt, cap: cap, capMat: capMat, capSide: capSide, glow: glow };
  });

  /* flippers: white plastic over a red rubber ring */
  function flipperShape(r0, r1, len) {
    const a = Math.acos((r0 - r1) / len), sh = new T.Shape();
    sh.moveTo(r0 * Math.cos(a), r0 * Math.sin(a));
    sh.lineTo(len + r1 * Math.cos(a), r1 * Math.sin(a));
    sh.absarc(len, 0, r1, a, -a, true);
    sh.lineTo(r0 * Math.cos(a), -r0 * Math.sin(a));
    sh.absarc(0, 0, r0, -a, a, true);
    return sh;
  }
  const fBody = new T.ExtrudeGeometry(flipperShape(F_R0 - 0.08, F_R1 - 0.06, FL), { depth: 0.62, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 14 });
  fBody.rotateX(-Math.PI / 2); fBody.translate(0, 0.16, 0);
  const fRub = new T.ExtrudeGeometry(flipperShape(F_R0, F_R1, FL), { depth: 0.3, bevelEnabled: false, curveSegments: 16 });
  fRub.rotateX(-Math.PI / 2); fRub.translate(0, 0.28, 0);
  const fMat = new T.MeshPhongMaterial({ color: 0xffffff, specular: 0xffffff, shininess: 100 });
  const flippers = FLIPPERS.map(function (f) {
    const gg = new T.Group();
    gg.position.set(f.px, 0, -f.py);
    gg.add(lit(new T.Mesh(fBody, fMat), true, true));
    gg.add(lit(new T.Mesh(fRub, redRubber), true, false));
    const cap = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.9, 12), chrome); cap.position.y = 0.45; gg.add(cap);
    add(gg);
    return gg;
  });

  /* drop targets */
  const dropMeshes = DROPS.map(function (d, i) {
    const face = new T.MeshPhongMaterial({ map: tex(dropCanvas(DROP_LETTERS[i])), specular: 0xffffff, shininess: 60 });
    const side = new T.MeshPhongMaterial({ color: 0xffb21f, specular: 0xffffff, shininess: 60 });
    const m = new T.Mesh(new T.BoxGeometry(0.98, 1.15, 0.28), [side, side, side, side, face, side]);
    m.position.set(d.x, 0.575, -d.y); add(lit(m, true, true));
    return m;
  });

  /* spinner across the left orbit */
  const spinner = (function () {
    const gg = new T.Group(), x1 = SPINNER.x1 + 0.25, x2 = SPINNER.x2 - 0.2, mid = (x1 + x2) / 2, w = x2 - x1;
    gg.position.set(mid, 0, -SPINNER.y);
    [-1, 1].forEach(function (k) { const p = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 1.7, 8), chrome); p.position.set(k * w / 2, 0.85, 0); gg.add(lit(p, true, false)); });
    const axle = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, w, 8), chrome); axle.rotation.z = Math.PI / 2; axle.position.y = 1.62; gg.add(axle);
    const pivot = new T.Group(); pivot.position.y = 1.62; gg.add(pivot);
    const tp = tex(plateCanvas(script));
    const pm = new T.MeshPhongMaterial({ map: tp, specular: 0xffffff, shininess: 80 });
    const plate = new T.Mesh(new T.BoxGeometry(w - 0.3, 0.95, 0.05), [chrome, chrome, chrome, chrome, pm, pm]);
    plate.position.y = -0.55; pivot.add(lit(plate, true, false));
    add(gg);
    return pivot;
  })();

  /* the vault: a kickout hole with a chrome rim */
  (function () {
    const hole = new T.Mesh(new T.CircleGeometry(0.72, 28), new T.MeshBasicMaterial({ color: 0x020205 }));
    hole.rotation.x = -Math.PI / 2; hole.position.set(VAULT.x, 0.02, -VAULT.y); add(hole);
    const rim = new T.Mesh(new T.TorusGeometry(0.76, 0.09, 8, 28), chrome); rim.rotation.x = Math.PI / 2; rim.position.set(VAULT.x, 0.05, -VAULT.y); add(lit(rim, true, true));
  })();

  /* plunger in the shooter lane */
  const plunger = new T.Group();
  (function () {
    const rod = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 4.2, 10), chrome); rod.rotation.x = Math.PI / 2; rod.position.set(0, 0, 2.1); plunger.add(rod);
    const tip = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.3, 16), new T.MeshPhongMaterial({ color: 0x15151c, specular: 0x666666, shininess: 50 }));
    tip.rotation.x = Math.PI / 2; tip.position.z = 0.15; plunger.add(tip);
    const coil = [];
    for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * TAU * 9; coil.push(new T.Vector3(Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.5 + t * 2.4)); }
    const spring = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(coil), 240, 0.04, 5), chrome); plunger.add(spring);
    plunger.userData.spring = spring;
    plunger.position.set((LANE_X + TW) / 2, BR, -(PLUNGE_Y - 0.1));
    add(plunger);
  })();

  /* ramps: tinted plastic channels on chrome wire rails */
  const rampMeshes = RAMPS.map(function (r, ri) {
    const s = r.s, half = 0.86, wallH = 0.95, pos = [], idx = [], up = new T.Vector3(0, 1, 0);
    const left = [], right = [];
    for (let i = 0; i < s.length; i++) {
      const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
      const tng = new T.Vector3(b.x - a.x, b.h - a.h, -(b.y - a.y)).normalize();
      const side = new T.Vector3().crossVectors(tng, up).normalize();
      const c = V3(s[i].x, s[i].y, Math.max(0.03, s[i].h));
      const L = c.clone().addScaledVector(side, -half), Rr = c.clone().addScaledVector(side, half);
      pos.push(L.x, L.y + wallH, L.z, L.x, L.y, L.z, Rr.x, Rr.y, Rr.z, Rr.x, Rr.y + wallH, Rr.z);
      left.push(new T.Vector3(L.x, L.y + wallH, L.z)); right.push(new T.Vector3(Rr.x, Rr.y + wallH, Rr.z));
      if (i) {
        const o = (i - 1) * 4, n = i * 4;
        for (let k = 0; k < 3; k++) idx.push(o + k, n + k, n + k + 1, o + k, n + k + 1, o + k + 1);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = plasticMat(r.color, 0.42);
    const mesh = new T.Mesh(g, mat); mesh.renderOrder = 5; add(mesh);
    const rails = [left, right].map(function (pts) {
      const m = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), pts.length * 2, 0.07, 6), chrome);
      add(lit(m, true, false)); return m;
    });
    // posts holding it up
    for (let d = 5; d < r.len - 3; d += 6.5) {
      const p = rampAt(r, d);
      if (p.h < 1.4) continue;
      const post = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, p.h, 8), chrome);
      post.position.set(p.x, p.h / 2, -p.y); add(lit(post, true, false));
    }
    // a little sign at the top of each ramp
    const top = rampAt(r, r.topD);
    const sign = new T.Mesh(new T.PlaneGeometry(2.8, 1.0), new T.MeshBasicMaterial({ map: tex(rampSignCanvas(r.name, r.color)), transparent: true, side: T.DoubleSide }));
    sign.position.set(top.x, top.h + 1.5, -top.y - 0.9); sign.rotation.x = -0.35; add(sign);
    return { mesh: mesh, mat: mat };
  });

  /* rings: one instanced mesh, every ring a gold torus spinning in place */
  const ringMat = new T.MeshPhongMaterial({ color: 0xffc21a, specular: 0xfff2b0, shininess: 120, envMap: tEnv, combine: T.MixOperation, reflectivity: 0.35, emissive: 0x5a3a00 });
  const rings = new T.InstancedMesh(new T.TorusGeometry(0.46, 0.12, 10, 26), ringMat, RINGS.length);
  rings.castShadow = true;
  add(rings);

  /* inserts: lamp lenses set into the playfield, each with a glow when lit */
  const inserts = INSERTS.map(function (d) {
    const shape = d.shape, w = d.s, h = shape === "rect" ? d.s * 0.52 : d.s;
    const m = new T.Mesh(new T.PlaneGeometry(w, shape === "rect" ? w : h), new T.MeshBasicMaterial({ map: tex(insertCanvas(shape, d.label)), color: new T.Color(d.col), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = d.rot * DEG;
    m.position.set(d.x, 0.03, -d.y); m.renderOrder = 2; add(m);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: new T.Color(d.col), blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    glow.position.set(d.x, 0.25, -d.y); glow.scale.set(d.s * 2, d.s * 2, 1); glow.renderOrder = 3; add(glow);
    return { d: d, m: m, glow: glow, col: new T.Color(d.col), dim: new T.Color(d.col).multiplyScalar(0.22), v: 0 };
  });

  /* apron */
  (function () {
    const pts = [[-TW, PF_Y0], [LANE_X, PF_Y0], [LANE_X, 5.4], [7.6, 5.4], [5.2, 4.3], [2.0, 3.0], [X0, 2.6], [-3.5, 3.0], [-6.7, 4.3], [-9.1, 5.4], [-TW, 5.4]];
    const top = flatShape(pts, 0.9, new T.MeshPhongMaterial({ map: tApron, specular: 0x8888aa, shininess: 60 }), [-TW, PF_Y0, LANE_X, 5.4]);
    add(lit(top, false, true));
    for (let i = 2; i < pts.length - 1; i++) add(segBox(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0.1, 0, 0.9, new T.MeshPhongMaterial({ color: 0xff9214, specular: 0xffffff, shininess: 60 })));
  })();

  /* balls */
  // a bright, polished ball with a faint halo, so it reads at a glance on a phone
  const ballMat = new T.MeshPhongMaterial({ color: 0xe2e4ee, specular: 0xffffff, shininess: 180, envMap: tEnv, combine: T.MixOperation, reflectivity: 0.5, emissive: 0x2a2a34 });
  const haloMat = new T.SpriteMaterial({ map: tGlow, color: 0xffffff, blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.38 });
  const ballGeo = new T.SphereGeometry(BR, 32, 22);
  const balls = [], blobs = [];
  for (let i = 0; i < MAX_BALLS; i++) {
    const m = lit(new T.Mesh(ballGeo, ballMat), true, false); m.visible = false; m.scale.setScalar(1.12); add(m); balls.push(m);
    const halo = new T.Sprite(haloMat); halo.scale.set(2.6, 2.6, 1); halo.renderOrder = 6; m.add(halo);
    const s = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blobMat); s.visible = false; s.renderOrder = 4; add(s); blobs.push(s);
  }

  /* the backbox: backglass, the LED board, a speaker panel. It stands upright at the top of the table. */
  const topEnd = table.localToWorld(V3(0, PF_Y1 + 1.6, 2.3));
  table.updateMatrixWorld(true);
  topEnd.copy(table.localToWorld(V3(0, PF_Y1 + 1.6, 2.3)));
  const box = new T.Group();
  box.position.set(0, topEnd.y, topEnd.z - 3);
  scene.add(box);
  const BBW = 2 * TW + 3.6, BBH = 19, BBD = 6;
  const shell = new T.Mesh(new T.BoxGeometry(BBW, BBH, BBD), new T.MeshPhongMaterial({ map: tCab, specular: 0x333333, shininess: 30 }));
  shell.position.set(0, BBH / 2, 0); box.add(shell);
  const glass = new T.Mesh(new T.PlaneGeometry(BBW - 2.2, (BBW - 2.2) * 560 / 1024), new T.MeshBasicMaterial({ map: tBack }));
  const glassH = (BBW - 2.2) * 560 / 1024;
  glass.position.set(0, BBH - 0.9 - glassH / 2, BBD / 2 + 0.02); box.add(glass);
  const spk = new T.Mesh(new T.PlaneGeometry(BBW - 2.2, (BBW - 2.2) * 192 / 1024), new T.MeshBasicMaterial({ map: tSpeak }));
  const spkH = (BBW - 2.2) * 192 / 1024;
  spk.position.set(0, 0.9 + spkH / 2, BBD / 2 + 0.02); box.add(spk);
  // the LED board itself
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas());
  tDot.wrapS = tDot.wrapT = T.RepeatWrapping; tDot.anisotropy = aniso;
  const csChunk = T.ShaderChunk && T.ShaderChunk.colorspace_fragment ? "colorspace_fragment" : "encodings_fragment";
  const ledMat = new T.ShaderMaterial({
    uniforms: { tLed: { value: tLed }, tDot: { value: tDot }, grid: { value: new T.Vector2(LED_COLS, LED_ROWS) }, level: { value: 1 } },
    vertexShader: "varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
    fragmentShader: [
      "uniform sampler2D tLed;", "uniform sampler2D tDot;", "uniform vec2 grid;", "uniform float level;", "varying vec2 vUv;",
      "void main() {",
      "  vec2 cell = vUv * grid;",
      "  vec2 px = 1.0 / grid;",
      "  vec2 c0 = (floor(cell) + 0.5) * px;",
      "  vec3 led = texture2D(tLed, c0).rgb;",
      "  vec3 halo = led;",
      "  halo += texture2D(tLed, c0 + px * vec2( 1.5,  1.5)).rgb + texture2D(tLed, c0 + px * vec2(-1.5,  1.5)).rgb;",
      "  halo += texture2D(tLed, c0 + px * vec2( 1.5, -1.5)).rgb + texture2D(tLed, c0 + px * vec2(-1.5, -1.5)).rgb;",
      "  halo += texture2D(tLed, c0 + px * vec2( 3.0,  0.0)).rgb + texture2D(tLed, c0 + px * vec2(-3.0,  0.0)).rgb;",
      "  halo += texture2D(tLed, c0 + px * vec2( 0.0,  3.0)).rgb + texture2D(tLed, c0 + px * vec2( 0.0, -3.0)).rgb;",
      "  halo /= 9.0;",
      "  float lens = texture2D(tDot, cell).r;",
      "  vec3 col = led * lens * 1.38 + halo * 0.34 + vec3(0.030, 0.034, 0.046) * lens + vec3(0.005, 0.006, 0.010);",
      "  gl_FragColor = vec4(col * level, 1.0);",
      "  #include <" + csChunk + ">",
      "}"
    ].join("\n")
  });
  const LEDW = 15.2, LEDH = LEDW * LED_ROWS / LED_COLS;
  const ledFrame = new T.Mesh(new T.BoxGeometry(LEDW + 0.8, LEDH + 0.8, 0.3), new T.MeshBasicMaterial({ color: 0x020206 }));
  ledFrame.position.set(0, spk.position.y, BBD / 2 + 0.1); box.add(ledFrame);
  const ledFace = new T.Mesh(new T.PlaneGeometry(LEDW, LEDH), ledMat);
  ledFace.position.set(0, spk.position.y, BBD / 2 + 0.27); box.add(ledFace);
  // a lit marquee strip along the top of the backbox
  const marquee = new T.Mesh(new T.BoxGeometry(BBW + 0.4, 0.8, BBD + 0.4), new T.MeshBasicMaterial({ color: 0xff3fa4 }));
  marquee.position.set(0, BBH + 0.4, 0); box.add(marquee);
  // the neck between the table and the backbox
  const neck = new T.Mesh(new T.BoxGeometry(BBW, 4, 7), new T.MeshPhongMaterial({ map: tCab, shininess: 30 }));
  neck.position.set(0, -1.6, 0.5); box.add(neck);

  /* the room: carpet, a back wall with the neon wordmark */
  const floorY = -34;
  const carpet = new T.Mesh(new T.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ map: tCarpet }));
  (function () { const uv = carpet.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 400 / 40, uv.getY(i) * 400 / 40); })();
  carpet.position.set(0, floorY, -40); scene.add(carpet);
  const wall = new T.Mesh(new T.PlaneGeometry(220, 110), new T.MeshBasicMaterial({ map: tRoom }));
  wall.position.set(0, floorY + 70, topEnd.z - 40); scene.add(wall);

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, key: key, table: table, box: box, script: script, logo: logo,
    flippers: flippers, bumpers: bumpers, slings: slings, drops: dropMeshes, spinner: spinner, plunger: plunger, gates: gates,
    rings: rings, inserts: inserts, balls: balls, blobs: blobs, ramps: rampMeshes, marquee: marquee,
    m4: new T.Matrix4(), q: new T.Quaternion(), e: new T.Euler(), v: new T.Vector3(), v2: new T.Vector3(), sc: new T.Vector3(),
    camPos: new T.Vector3(), camTgt: new T.Vector3(), fit: null, shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0,
    ballQ: [], hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, shadowsOn: true, shadowSize: 2048, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
}

function rampSignCanvas(name, col) {
  const c = mkCanvas(256, 96), g = c.getContext("2d");
  rrectPath(g, 4, 4, 248, 88, 18); g.fillStyle = "#0d1f5c"; g.fill();
  g.lineWidth = 6; g.strokeStyle = col; g.stroke();
  candyText(g, name.split(" ")[1] || name, 128, 50, 50, 220);
  return c;
}

/* frame the table: the closest camera at this pitch that keeps the whole table and the LED board in view */
function fitCamera() {
  const T = R.T, cam = R.camera, sinP = Math.sin(CAM_PITCH), cosP = Math.cos(CAM_PITCH), tanF = Math.tan(CAM_FOV * Math.PI / 360), v = R.v;
  const pts = [];
  [[-TW - 1.6, PF_Y0 - 2.2], [TW + 1.6, PF_Y0 - 2.2], [-TW - 1.2, 20], [TW + 1.2, 20], [-TW, TOP_Y], [TW, TOP_Y]].forEach(function (p) {
    pts.push(R.table.localToWorld(new T.Vector3(p[0], 2.6, -p[1])));
  });
  // the LED board's bottom edge must show (the backglass above it can run off the top of the screen)
  R.box.updateMatrixWorld(true);
  pts.push(R.box.localToWorld(new T.Vector3(-8, 5.2, 3.3)), R.box.localToWorld(new T.Vector3(8, 5.2, 3.3)));
  function bounds(tx, ty, tz, d) {
    cam.position.set(tx, ty + d * sinP, tz + d * cosP); cam.lookAt(tx, ty, tz); cam.updateMatrixWorld();
    let x1 = 1e9, x2 = -1e9, y1 = 1e9, y2 = -1e9;
    for (let i = 0; i < pts.length; i++) {
      v.copy(pts[i]).project(cam);
      const px = (v.x * 0.5 + 0.5) * W, py = (-v.y * 0.5 + 0.5) * H;
      if (px < x1) x1 = px; if (px > x2) x2 = px; if (py < y1) y1 = py; if (py > y2) y2 = py;
    }
    return { x1: x1, x2: x2, y1: y1, y2: y2 };
  }
  const ty = 2;
  function centered(d) {
    let tx = 0, tz = -20, bb = null;
    const ppu = H / (2 * d * tanF);
    for (let n = 0; n < 8; n++) {
      bb = bounds(tx, ty, tz, d);
      tx += ((bb.x1 + bb.x2) / 2 - (SAFE.x1 + SAFE.x2) / 2) / ppu;
      tz += ((bb.y1 + bb.y2) / 2 - (SAFE.y1 + SAFE.y2) / 2) / (ppu * sinP);
    }
    return { tx: tx, ty: ty, tz: tz, d: d, bb: bounds(tx, ty, tz, d) };
  }
  let lo = 20, hi = 400, best = null;
  for (let n = 0; n < 18; n++) {
    const mid = (lo + hi) / 2, c = centered(mid);
    if (c.bb.x2 - c.bb.x1 <= SAFE.x2 - SAFE.x1 && c.bb.y2 - c.bb.y1 <= SAFE.y2 - SAFE.y1) { best = c; hi = mid; } else lo = mid;
  }
  R.fit = best || centered(400);
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
const QUALITY = [{ pr: 2, sh: 2048 }, { pr: 1.5, sh: 1024 }, { pr: 1.15, sh: 1024 }, { pr: 1, sh: 0 }];
function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  const sh = QUALITY[R.quality].sh, on = sh > 0;
  if (on && sh !== R.shadowSize) {
    R.shadowSize = sh;
    R.key.shadow.mapSize.set(sh, sh);
    if (R.key.shadow.map) { R.key.shadow.map.dispose(); R.key.shadow.map = null; }
  }
  if (on !== R.shadowsOn) { R.shadowsOn = on; R.key.castShadow = on; }
  R.dirty = true;
}
function pixelRatio() { return Math.min(window.devicePixelRatio || 1, QUALITY[R.quality].pr); }
function watchFrameRate(ms) {
  if (R.qLock || R.quality >= QUALITY.length - 1 || ms > 250) return;
  if (R.warm < 45) { R.warm++; return; }
  R.slowSum += ms; R.slowN++;
  if (R.slowN < 60) return;
  const avg = R.slowSum / R.slowN;
  R.slowSum = 0; R.slowN = 0;
  if (avg > 24) {
    if (++R.slowHits >= 2) {
      R.slowHits = 0;
      const before = pixelRatio();
      let q = R.quality + 1;
      while (q < QUALITY.length - 1 && Math.min(window.devicePixelRatio || 1, QUALITY[q].pr) === before && QUALITY[q].sh === QUALITY[R.quality].sh) q++;
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
// Table point (inches) -> HUD pixels.
function toScreen(x, y, h) {
  if (!R) return { x: W / 2, y: H / 2, ok: false };
  R.v.set(x, h || 0, -y);
  R.table.localToWorld(R.v).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1 };
}

/* ---------------- Game state -> meshes ---------------- */
function insertValue(key, i) {
  const t = R.clock, blink = function (hz) { return Math.floor(t * hz * 2) % 2 === 0 ? 1 : 0.15; };
  if (S.phase === "over" || !S.balls) return 0;
  const combo = S.t - S.lastShotT < COMBO_T;
  if (key === "orbit") return mission().id === "orbits" ? blink(1.5) : combo && S.lastShot !== "orbit" ? 1 : 0;
  if (key === "ramp0" || key === "ramp1") {
    if (S.mb) return blink(4);
    if (mission().id === "ramps") return blink(1.5);
    return combo && S.lastShot !== key ? 1 : 0;
  }
  if (key === "jackpot") return S.mb ? blink(3) : 0;
  if (key === "vault") return S.superLit ? blink(5) : S.lockLit ? blink(1.6) : 0;
  if (key === "again") return S.extra > 0 ? 1 : S.saveT > 0 ? blink(S.saveT < 2 ? 4 : 1.5) : 0;
  if (key.indexOf("drop") === 0) { const n = +key.slice(4); return DROPS[n].down ? 1 : mission().id === "drops" ? blink(1) * 0.5 : 0; }
  if (key.indexOf("mult") === 0) return S.mult >= +key.slice(4) ? 1 : 0;
  if (key.indexOf("lane") === 0) {
    const n = +key.slice(4);
    if (S.skill === n && (S.skillT > 0 || (S.saveArm && armed()))) return blink(4);
    return S.lanes[n] ? 1 : 0;
  }
  return 0;
}

function syncScene(state, fdt) {
  const T = R.T, idle = state === "title" || state === "over";
  let i;
  R.clock += fdt;
  ledTick(fdt, state);

  /* flippers */
  for (i = 0; i < 2; i++) R.flippers[i].rotation.y = FLIPPERS[i].a;

  /* bumpers and slingshots flash when hit */
  for (i = 0; i < R.bumpers.length; i++) {
    V.bump[i] = Math.max(0, V.bump[i] - fdt * 5);
    const b = R.bumpers[i], k = V.bump[i], att = idle && !Shell.reduced ? 0.5 + 0.5 * Math.sin(R.clock * 3 + i * 2.1) : 0;
    b.capMat.emissiveIntensity = b.capSide.emissiveIntensity = 0.06 + k * 0.85 + att * 0.3;
    b.skirt.position.y = 0.3 - k * 0.14;
    b.glow.material.opacity = 0.15 + k * 0.85 + att * 0.3;
    const gs = 4.6 + k * 2; b.glow.scale.set(gs, gs, 1);
  }
  for (i = 0; i < R.slings.length; i++) {
    const sl = SLINGS[i], m = R.slings[i];
    sl.flash = Math.max(0, sl.flash - fdt * 7);
    m.kick.position.set(m.base.x + m.nx * sl.flash * 0.28, m.base.y, m.base.z - m.ny * sl.flash * 0.28);
    m.glow.material.opacity = sl.flash * 0.9;
  }

  /* drop targets sink */
  for (i = 0; i < DROPS.length; i++) {
    const d = DROPS[i];
    d.z += ((d.down ? 1 : 0) - d.z) * Math.min(1, fdt * (d.down ? 18 : 9));
    R.drops[i].position.y = 0.575 - d.z * 1.25;
  }

  /* spinner, gates, plunger */
  R.spinner.rotation.x = S.spinA || 0;
  for (i = 0; i < R.gates.length; i++) {
    const gt = R.gates[i], s = gt.s;
    let open = 0;
    for (let k = 0; k < S.balls.length; k++) {
      const b = S.balls[k];
      if (b.mode !== "table" || b.vy <= 0) continue;
      const ex = s.x2 - s.x1, ey = s.y2 - s.y1, l2 = ex * ex + ey * ey, u = clamp(((b.x - s.x1) * ex + (b.y - s.y1) * ey) / l2, 0, 1);
      if (Math.hypot(b.x - (s.x1 + ex * u), b.y - (s.y1 + ey * u)) < 1.3) open = 1.25;
    }
    gt.a += (open - gt.a) * Math.min(1, fdt * (open ? 30 : 6));
    gt.flap.rotation.x = gt.a;
  }
  R.plunger.position.z = -(PLUNGE_Y - 0.1) + S.pull * 1.4;
  R.plunger.userData.spring.scale.z = 1 - S.pull * 0.35;

  /* rings */
  const m4 = R.m4, q = R.q, e = R.e, p = R.v, sc = R.sc;
  for (i = 0; i < RINGS.length; i++) {
    const r = RINGS[i];
    let s = 1, lift = 0;
    if (r.got) {
      if (r.pop > 0) { s = r.pop < 0.4 ? r.pop / 0.4 : 1 + (1 - r.pop) * 0.6; lift = (1 - r.pop) * 1.4; }
      else s = r.back < 0.6 ? 1 - r.back / 0.6 : 0;
    }
    const bob = Shell.reduced ? 0 : Math.sin(R.clock * 2.2 + i * 1.3) * 0.1;
    p.set(r.x, r.h + bob + lift, -r.y);
    e.set(0, (Shell.reduced ? 0 : R.clock * 2.6) + i * 0.7 + (r.got ? (1 - r.pop) * 9 : 0), 0); q.setFromEuler(e);
    sc.set(s, s, s);
    R.rings.setMatrixAt(i, m4.compose(p, q, sc));
  }
  R.rings.instanceMatrix.needsUpdate = true;

  /* inserts */
  for (i = 0; i < R.inserts.length; i++) {
    const it = R.inserts[i];
    let v;
    if (idle) v = Shell.reduced ? 0.6 : Math.max(0, Math.sin(R.clock * 3.2 - i * 0.55)) > 0.55 ? 1 : 0.1;
    else v = insertValue(it.d.key, i);
    it.v += (v - it.v) * Math.min(1, fdt * 22);
    it.m.material.color.copy(it.dim).lerp(it.col, it.v);
    it.glow.material.opacity = it.v * 0.8;
  }

  /* balls */
  const used = {};
  let n = 0;
  for (i = 0; i < S.balls.length && n < MAX_BALLS; i++) {
    const b = S.balls[i];
    if (b.mode === "gone") continue;
    const mesh = R.balls[n], blob = R.blobs[n];
    n++;
    let h = BR + (b.mode === "ramp" ? b.h : 0);
    if (b.mode === "vault") h = BR - 0.75 * Math.min(1, (HOLD_T - b.hold) * 4 + 0.2);
    if (b.mode === "table" && b.y < 2.6 && b.x < LANE_X) h -= (2.6 - b.y) * 0.7;
    mesh.visible = true;
    mesh.position.set(b.x, h, -b.y);
    // roll without slipping
    let bq = R.ballQ[b.id];
    if (!bq) { bq = R.ballQ[b.id] = { q: new T.Quaternion(), x: b.x, y: b.y }; }
    const dx = b.x - bq.x, dy = b.y - bq.y, d = Math.hypot(dx, dy);
    if (d > 1e-4 && d < 6) { R.v2.set(-dy / d, 0, -dx / d); R.q.setFromAxisAngle(R.v2, d / BR); bq.q.premultiply(R.q); }
    bq.x = b.x; bq.y = b.y;
    used[b.id] = 1;
    mesh.quaternion.copy(bq.q);
    blob.visible = !R.shadowsOn && b.mode === "table" && h > 0.2;
    if (blob.visible) { blob.position.set(b.x + 0.15, 0.05, -b.y + 0.2); blob.scale.set(1.6, 1, 1.6); }
  }
  for (; n < MAX_BALLS; n++) { R.balls[n].visible = false; R.blobs[n].visible = false; }
  for (const id in R.ballQ) if (!used[id]) delete R.ballQ[id];

  /* marquee light */
  const mc = S.mb && !Shell.reduced ? ["#ff3fa4", "#2fd8ff", "#ffd23f"][Math.floor(R.clock * 6) % 3] : "#ff3fa4";
  R.marquee.material.color.set(mc);

  /* camera: the whole table, a touch of sway on the title screen, a jolt on the big moments */
  const f = R.fit;
  let tx = f.tx, ty = f.ty, tz = f.tz, d = f.d;
  if (idle && !Shell.reduced) { tx += Math.sin(idleT * 0.4) * 0.8; }
  R.camTgt.set(tx, ty, tz);
  R.camPos.set(tx, ty + d * Math.sin(CAM_PITCH), tz + d * Math.cos(CAM_PITCH));
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const mm = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (Math.random() * 2 - 1) * mm; sy = (Math.random() * 2 - 1) * mm;
  }
  R.camera.position.set(R.camPos.x + sx, R.camPos.y + sy, R.camPos.z);
  R.camera.lookAt(R.camTgt.x + sx, R.camTgt.y + sy, R.camTgt.z);
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
function hudRing(c, x, y, r) {
  c.lineWidth = r * 0.5; c.strokeStyle = "#7a4a06"; c.beginPath(); c.arc(x, y + 0.8, r, 0, TAU); c.stroke();
  c.strokeStyle = "#ffd23f"; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  c.lineWidth = 1.2; c.strokeStyle = "#fff6b8"; c.beginPath(); c.arc(x, y, r, -2.4, -1.3); c.stroke();
}

function drawHUD(c, state) {
  const bg = c.createLinearGradient(0, 0, 0, HUD_H);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, 0, W, HUD_H);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff9214"; c.fillRect(0, HUD_H, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, HUD_H + 2, W, 1);
  txt(c, "SCORE", 8, 4, 8, "#a8ecff", "left", "#08205f");
  txt(c, fmtScore(S.score), 8, 14, 16, "#ffe45c", "left", "#08205f");
  txt(c, "BALL", W - 8, 4, 8, "#a8ecff", "right", "#08205f");
  txt(c, Math.min(S.ball, BALLS) + "/" + BALLS + (S.extra ? " +" + S.extra : ""), W - 8, 14, 16, "#ffffff", "right", "#08205f");
  hudRing(c, 214, 22, 6.5);
  txt(c, String(S.ringsGame), 226, 14, 16, "#ffffff", "left", "#08205f");
  // second line: the mission, or what the table is doing right now
  let line, col = "#ffe45c";
  if (S.mb) { line = "RING RUSH MULTIBALL   JACKPOTS " + S.jackpots + (S.superLit ? "   SUPER LIT" : ""); col = "#ffc1e0"; }
  else if (S.missionWait > 0) { line = "MISSION COMPLETE"; col = "#b6ff4a"; }
  else line = "MISSION: " + mission().name + "  " + Math.min(S.prog, missionNeed()) + "/" + missionNeed() + " " + mission().unit;
  txt(c, line, 8, 35, 10, col, "left", "#08205f");
  const tags = [];
  if (S.lockLit) tags.push("LOCK LIT");
  else if (S.locks) tags.push("LOCKS " + S.locks);
  if (S.mult > 1) tags.push(S.mult + "X");
  if (S.t - S.lastShotT < COMBO_T && S.combo >= 1 && state === "playing") tags.push("COMBO LIT");
  if (tags.length && !S.mb) txt(c, tags.join("  "), W - 8, 35, 10, "#a8ecff", "right", "#08205f");
}

function drawControls(c, state) {
  if (state !== "playing" || S.phase !== "play") return;
  const waiting = armed();
  // plunger meter, over the shooter lane
  if (waiting) {
    const lane = toScreen((LANE_X + TW) / 2, 2.0, 0.6);
    const x = Math.min(W - 22, lane.x + 14), top = 318, hgt = 140, pc = clamp(S.pull, 0, 1);
    rrect(c, x - 3, top - 3, 20, hgt + 6, 6); c.fillStyle = "rgba(8,32,95,.82)"; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = "#ffffff"; c.stroke();
    c.save(); rrect(c, x, top, 14, hgt, 4); c.clip();
    c.fillStyle = "#12296e"; c.fillRect(x, top, 14, hgt);
    c.fillStyle = pc > 0.8 ? "#ff3b2e" : pc > 0.45 ? "#ffd21f" : "#3fe0ff";
    c.fillRect(x, top, 14, hgt * pc);
    c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(x + 2, top, 3, hgt);
    c.restore();
    txt(c, "PULL", x + 7, top + hgt + 6, 9, "#ffffff", "center", "#08205f");
    if (onlyWaiting() && S.pull < 0.02 && !Shell.reduced) {
      const k = (S.t * 0.8) % 1, ay = top + 20 + k * 60;
      c.globalAlpha = 1 - k;
      c.fillStyle = "#ffffff"; c.beginPath(); c.moveTo(x + 7, ay + 10); c.lineTo(x + 1, ay); c.lineTo(x + 13, ay); c.closePath(); c.fill();
      c.globalAlpha = 1;
    }
  }
  if (onlyWaiting()) {
    const msg = touchSeen ? "DRAG DOWN ON THE RIGHT, LET GO TO LAUNCH" : "HOLD SPACE OR DOWN, LET GO TO LAUNCH";
    rrect(c, 20, 476, W - 40, 22, 8); c.fillStyle = "rgba(8,32,95,.8)"; c.fill();
    txt(c, msg, W / 2, 482, 9, "#ffffff", "center");
    if (S.skill >= 0 && S.saveArm) txt(c, "SKILL SHOT: LANE " + ["N", "P", "G"][S.skill], W / 2, 504, 10, "#b6ff4a", "center", "#08205f");
  }
  // flipper buttons on touch screens
  if (touchSeen) {
    [-1, 1].forEach(function (side) {
      const on = touchHeld(side), x = side < 0 ? 6 : W - 98, y = H - 46;
      rrect(c, x, y, 92, 40, 12);
      c.fillStyle = on ? "rgba(255,210,63,.42)" : "rgba(8,32,95,.32)"; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = on ? "#ffe45c" : "rgba(255,255,255,.45)"; c.stroke();
      const cx = x + 46, cy = y + 20;
      c.fillStyle = on ? "#ffffff" : "rgba(255,255,255,.75)";
      c.beginPath(); c.moveTo(cx + side * 14, cy); c.lineTo(cx - side * 8, cy - 11); c.lineTo(cx - side * 8, cy + 11); c.closePath(); c.fill();
    });
  }
}

function draw(c, state) {
  Sound.pump();
  if (!R || !R.hud) return;
  const now = performance.now();
  let ms = now - R.lastT;
  R.lastT = now;
  if (!(ms > 0)) ms = 0;
  const sized = layout();
  if (state === "paused" && !R.dirty) return;
  if (state === "playing") watchFrameRate(ms);
  if (sized) {
    syncScene(state, state === "paused" ? 0 : Math.min(ms, 50) / 1000);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    c.globalAlpha = clamp(q.life * 2.5, 0, 1);
    c.fillStyle = q.c;
    if (q.kind) { c.beginPath(); c.arc(q.x, q.y, q.w, 0, TAU); c.fill(); }
    else { c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.fillRect(-q.w, -q.w * 0.6, q.w * 2, q.w * 1.2); c.restore(); }
  }
  c.globalAlpha = 1;
  drawHUD(c, state);
  drawControls(c, state);
}

/* ---------------- Input ----------------
   The shell routes one pointer at a time; pinball needs both thumbs, so the table listens to every touch
   itself. Left half of the screen is the left flipper, right half the right flipper. When a ball is sitting
   on the plunger and nothing else is in play, a touch on the right half pulls the plunger instead: drag down,
   let go to launch. */
const TOUCH = new Map();
let touchSeen = false;
function touchHeld(side) {
  for (const t of TOUCH.values()) if (t.side === side && !t.plunger) return true;
  return false;
}
function toLocal(e) {
  const r = R.hud.getBoundingClientRect();
  return { x: (e.clientX - r.left) / (r.width / W), y: (e.clientY - r.top) / (r.height / H) };
}
function bindTouch() {
  const cv = R.hud;
  cv.style.touchAction = "none";
  cv.addEventListener("pointerdown", function (e) {
    if (Shell.state() !== "playing") return;
    e.preventDefault();
    Sound.unlock();
    if (e.pointerType === "touch" || e.pointerType === "pen") touchSeen = true;
    const p = toLocal(e), side = p.x < W / 2 ? -1 : 1;
    const plunger = side > 0 && onlyWaiting();
    TOUCH.set(e.pointerId, { side: side, plunger: plunger, y0: p.y });
    if (plunger) { S.pull = 0; S.pulling = true; }
  });
  cv.addEventListener("pointermove", function (e) {
    const t = TOUCH.get(e.pointerId);
    if (!t || !t.plunger || Shell.state() !== "playing") return;
    S.pull = clamp((toLocal(e).y - t.y0) / 120, 0, 1);
  });
  function end(e) {
    const t = TOUCH.get(e.pointerId);
    if (!t) return;
    TOUCH.delete(e.pointerId);
    if (t.plunger && Shell.state() === "playing") {
      if (e.type === "pointerup") launch(S.pull);
      S.pull = 0; S.pulling = false;
    }
  }
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);
  cv.addEventListener("lostpointercapture", end);
}

const LEFT_KEYS = { ArrowLeft: 1, KeyA: 1, ShiftLeft: 1, KeyZ: 1 };
const RIGHT_KEYS = { ArrowRight: 1, KeyD: 1, ShiftRight: 1, Slash: 1 };
const PLUNGE_KEYS = { ArrowDown: 1, KeyS: 1, Space: 1, Enter: 1, NumpadEnter: 1 };
const held = {};
function key(type, code, e) {
  if (type === "down") {
    held[code] = true;
    if (PLUNGE_KEYS[code] && !e.repeat && armed() && !S.kbPull) { S.kbPull = true; S.pull = 0; }
  } else {
    held[code] = false;
    if (PLUNGE_KEYS[code] && S.kbPull) { S.kbPull = false; launch(S.pull); S.pull = 0; }
  }
  keys.left = false; keys.right = false;
  for (const k in held) if (held[k]) { if (LEFT_KEYS[k]) keys.left = true; if (RIGHT_KEYS[k]) keys.right = true; }
}
function releaseAll() {
  for (const k in held) held[k] = false;
  keys = {}; TOUCH.clear();
  S.kbPull = false; S.pull = 0; S.pulling = false;
}

/* ---------------- Splash, boot, shell hookup ---------------- */
function makeSplash() {
  const el = document.createElement("div");
  el.id = "npg-splash";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Nostalgia Pro Games");
  el.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;z-index:9999;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;gap:18px;padding:24px;box-sizing:border-box;text-align:center;" +
    "background:radial-gradient(circle at 50% 42%,#3a1f8c 0%,#160d4a 52%,#070616 100%);" +
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
      else {
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

function attach() {
  const hud = document.getElementById("np-canvas"), stage = document.getElementById("np-stage");
  R.hud = hud; R.stage = stage;
  if (getComputedStyle(stage).position === "static") stage.style.position = "relative";
  const gl = R.gl;
  gl.style.cssText = "position:absolute;left:0;top:0;z-index:0;display:block;margin:0;padding:0;border:0;box-shadow:none;" +
    "max-width:none;max-height:none;transform:none;image-rendering:auto;pointer-events:none;touch-action:none;" +
    "border-radius:" + getComputedStyle(hud).borderRadius;
  stage.insertBefore(gl, hud);
  hud.style.background = "transparent";
  if (getComputedStyle(hud).position === "static") hud.style.position = "relative";
  const crt = stage.querySelector(".np-crt");
  if (crt) crt.style.display = "none";
  R.lastT = performance.now();
  layout();
}
function logoImg(width, margin) {
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
  im.style.cssText = "display:block;width:" + width + ";height:auto;margin:" + margin;
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_URL;
  return im;
}

function startGame() {
  Shell.init({
    slug: "pinball-rings",
    title: "PINBALL RINGS",
    accent: "#ff3fa4",
    width: W, height: H,
    format: function (n) { return fmtScore(n); },
    howTo: "A real 3D pinball table built for collecting rings. Tap the left or right side of the screen to flip. Drag down on the right side to pull the plunger, let go to launch. Run missions, lock two balls in the vault for Ring Rush multiball.",
    keys: "Keys: left and right arrows (or A and D, or Shift) flip. Hold Space or Down to pull the plunger, release to launch. P pause, M mute, N music, R restart.",
    tip: "Drop all four R I N G targets to light the lock. Ramps and orbits back to back make combos.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: function () { /* the table reads every touch itself (bindTouch) */ },
    key: key,
    idle: function (dt) { if (paused) return; idleT += dt; updateParts(dt); },
    onPause: function () { paused = true; releaseAll(); },
    onResume: function () { paused = false; }
  });
  attach();
  bindTouch();
  // Sound: nothing is created until the first tap, click or key press; the music starts with the game.
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Sound.unlock, true); });
  Shell.onStart(Sound.restart); Shell.onRestart(Sound.restart); Shell.onResume(Sound.unlock);
  Shell.onRestart(releaseAll);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Sound.toggleMusic();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) {
    titleCard.insertBefore(logoImg("clamp(72px,16vh,120px)", "0 auto 4px"), titleCard.firstChild);
    Sound.button(titleCard, titleCard.querySelector(".np-tip"));
  }
  if (pauseActions) Sound.button(pauseActions, pauseActions.querySelector("a"));
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) card.insertBefore(logoImg("clamp(64px,14vh,104px)", "0 auto 6px"), card.firstChild);
}

/* ---------------- Cover render: ?cover=1 draws the 360x480 arcade cover from this table ---------------- */
function renderCover(logo) {
  const CW = 360, CH = 480, K = 2;
  document.body.style.cssText = "margin:0;background:#101219;display:flex;align-items:center;justify-content:center;min-height:100vh";
  R.renderer.setPixelRatio(1);
  R.renderer.setSize(CW * K, CH * K, false);
  R.camera.aspect = CW / CH; R.camera.fov = 44; R.camera.updateProjectionMatrix();
  // a game in full swing: three balls up, a bumper lit, rings everywhere
  S.mb = true; S.jackpots = 1; S.lanes = [true, false, true]; S.mult = 3; S.lockLit = false; S.score = 4815160;
  DROPS[0].down = true; DROPS[0].z = 1; DROPS[2].down = true; DROPS[2].z = 1;
  S.balls.length = 0;
  const b1 = newBall(0, 0); b1.mode = "ramp"; b1.ramp = 0; b1.d = RAMPS[0].len * 0.36;
  const p1 = rampAt(RAMPS[0], b1.d); b1.x = p1.x; b1.y = p1.y; b1.h = p1.h;
  newBall(-1.2, 23.6); newBall(1.4, 7.6);
  FLIPPERS[1].a = FLIPPERS[1].up; FLIPPERS[0].a = FLIPPERS[0].rest + 0.3;
  V.bump[0] = 1; V.bump[2] = 0.6; SLINGS[0].flash = 0.7;
  S.spinA = 1.1;
  ledPlay([ledMsg("cycle", "PINBALL RINGS", 99, { t: 0.4 })]);
  LED.msg.t = 0.4;
  Shell.reduced = false;
  syncScene("playing", 0.016);
  LED.msg.t = 0.4; ledDraw("playing"); LED.tex.needsUpdate = true;
  const cam = R.camera;
  cam.position.set(-6.5, 42, 6);
  cam.lookAt(0.6, 1, -21.5);
  cam.updateMatrixWorld();
  R.renderer.render(R.scene, R.camera);
  const c = mkCanvas(CW, CH), g = c.getContext("2d");
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(R.gl, 0, 0, CW, CH);
  // shade the top and bottom so the logo and the title read
  let gr = g.createLinearGradient(0, 0, 0, 150);
  gr.addColorStop(0, "rgba(7,6,26,.88)"); gr.addColorStop(1, "rgba(7,6,26,0)");
  g.fillStyle = gr; g.fillRect(0, 0, CW, 150);
  gr = g.createLinearGradient(0, CH - 170, 0, CH);
  gr.addColorStop(0, "rgba(7,6,26,0)"); gr.addColorStop(0.55, "rgba(7,6,26,.8)"); gr.addColorStop(1, "rgba(7,6,26,.95)");
  g.fillStyle = gr; g.fillRect(0, CH - 170, CW, 170);
  const lg = trimmed(logo, 800) || R.script;
  g.save(); g.shadowColor = "rgba(0,0,0,.7)"; g.shadowBlur = 12; g.shadowOffsetY = 4;
  drawFit(g, lg, CW / 2, 70, 170, 128);
  g.restore();
  candyText(g, "PINBALL", CW / 2, CH - 104, 58, 300);
  candyText(g, "RINGS", CW / 2, CH - 46, 70, 300, ["#ffffff", "#7ff0ff", "#1d8cff"]);
  const url = c.toDataURL("image/png");
  window.__pinballCover = url;
  const im = document.createElement("img");
  im.src = url; im.width = CW; im.height = CH; im.alt = "Pinball Rings cover";
  im.style.cssText = "display:block;width:360px;height:480px";
  im.id = "cover";
  document.body.appendChild(im);
}

// Hook for automated checks (no effect on play)
window.__pinball = { S: function () { return S; }, launch: launch, FLIPPERS: FLIPPERS, RAMPS: RAMPS, RINGS: RINGS, DROPS: DROPS, SEGS: SEGS, CIRCS: CIRCS,
                     update: update, stepBalls: stepBalls, newBall: newBall, serveBall: serveBall, gfx: function () { return R; }, led: function () { return LED; },
                     sound: Sound, toScreen: toScreen, keys: function () { return keys; }, touch: TOUCH };

(function boot() {
  const cover = /[?&]cover=1/.test(location.search);
  const splash = makeSplash();
  if (cover) splash.el.style.display = "none";
  const t0 = performance.now();
  const q = /[?&]gfx=(high|low)/.exec(location.search);
  let started = false;
  Promise.all([loadLogo(splash), import(THREE_URL).then(null, function (e) { e.npStage = "three"; throw e; }), loadImage(SCRIPT_URL)])
    .then(function (res) {
      THREE = res[1];
      try { R = buildScene(THREE, res[2], res[0], { cover: cover }); } catch (e) { e.npStage = "webgl"; throw e; }
      if (q) { R.qLock = true; setQuality(q[1] === "low" ? QUALITY.length - 1 : 0); }
      reset();
      fitCamera();
      if (cover) { renderCover(res[0]); return "cover"; }
      try { syncScene("title", 0); R.renderer.compile(R.scene, R.camera); } catch (e) { /* warm-up only */ }
      const hold = Math.max(0, 1300 - (performance.now() - t0));
      return new Promise(function (r) { setTimeout(r, hold); });
    })
    .then(function (v) {
      if (v === "cover") { splash.el.remove(); return; }
      started = true;
      startGame();
      splashGone(splash);
    })
    .catch(function (e) {
      console.error(e);
      if (started) return;
      splash.el.style.display = "";
      splashFail(splash, e && e.npStage === "three"
        ? "Pinball Rings could not load its 3D engine (" + THREE_URL + ")."
        : "Pinball Rings needs WebGL for its 3D table, and this browser has it switched off or does not support it.");
    });
})();
