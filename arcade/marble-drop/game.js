/* MARBLE DROP (3D): Grandpa's jar of giant marbles spilled all over town, and every one of them is
   rolling for a drain. Aim, shoot, match three.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of input, scaling and the title / pause / game over flow, and carries the HUD.

   The rules run on a flat board measured in board units: x runs across (0 = center, + = right),
   z runs down the screen (+ = toward the player). In three.js space a board point (x, z) sits at
   (x, height, z). Every track is a path through the board measured along its length, s:
   marbles leave the pipe at s = 0 and the drain waits at s = L. Everything about the picture
   (the camera, the poses, the sparkle) is kept apart from the rules and never feeds back. */

const W = 360, H = 540, TAU = Math.PI * 2;
const D = 22, BR = D / 2;                                  // marble diameter and radius
const SHOT_V = 760, SHOT_GAP = 0.15, MAX_SHOTS = 3;        // fired marble speed, refire delay, marbles in the air
const INS_T = 0.12;                                         // seconds a fired marble takes to settle into the chain
const PULL_A = 1500, PULL_MAX = 560;                        // a gap with matching ends closes: acceleration, top speed
const ROLL_IN = 7, ROLL_TO = 0.24;                          // the opening rush: speed multiplier, and how far it runs
const REV_V = 75, SLOW_K = 0.35;                            // the rewind and slow-down power-ups
const SLOW_T = 6, REV_T = 2.6, POWER_LIFE = 13;             // seconds
const LIVES0 = 3, LIVES_MAX = 5, LIFE_EVERY = 15000;
const BOARD = { x1: -182, x2: 182, z1: -202, z2: 206 };     // the playing surface inside the frame
const FRAME = 12, FRAME_H = 13;
const HERO_H = 92;                                          // Kit, cap to sneakers, in board units
const HUD_H = 58;
const CAM_FOV = 34, CAM_PITCH = 56 * Math.PI / 180;

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash, title card and score card
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every decal in the world
const THREE_URL = "../shared/three.module.min.js";
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';

// The marbles. Six colors at most, picked to stay apart from each other.
const COLORS = [
  { name: "RED", hex: "#ff3b30" }, { name: "BLUE", hex: "#2f7bff" }, { name: "YELLOW", hex: "#ffd21f" },
  { name: "GREEN", hex: "#35d04a" }, { name: "PURPLE", hex: "#a45cff" }, { name: "WHITE", hex: "#f4f1ea" }
];
const POWERS = ["slow", "reverse", "bomb", "wild"];
const POWER_INFO = {
  slow: { title: "SLOW DOWN", sub: "The whole chain eases off for a few seconds.", col: "#3ff0ff", led: "SLOW DOWN" },
  reverse: { title: "BE KIND, REWIND", sub: "The chain backs up toward the pipe.", col: "#ff3fa4", led: "REWIND" },
  bomb: { title: "KABOOM!", sub: "Everything close by goes with it.", col: "#ff9214", led: "KABOOM" },
  wild: { title: "WILD MARBLE", sub: "Your next shot matches any color it hits.", col: "#ffd23f", led: "WILD MARBLE" }
};

/* ---------------- Tracks ---------------- */
// A polyline with its corners rounded off (each corner becomes a smooth curve of about radius rad).
function roundPoly(v, rad) {
  const out = [v[0].slice()];
  for (let i = 1; i < v.length - 1; i++) {
    const a = v[i - 1], b = v[i], c = v[i + 1];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const t = Math.min(rad, l1 / 2, l2 / 2);
    const p1 = [b[0] + (a[0] - b[0]) / l1 * t, b[1] + (a[1] - b[1]) / l1 * t];
    const p2 = [b[0] + (c[0] - b[0]) / l2 * t, b[1] + (c[1] - b[1]) / l2 * t];
    out.push(p1);
    for (let k = 1; k < 12; k++) {                          // a quarter-ish curve through the corner
      const u = k / 12, m = 1 - u;
      out.push([m * m * p1[0] + 2 * m * u * b[0] + u * u * p2[0], m * m * p1[1] + 2 * m * u * b[1] + u * u * p2[1]]);
    }
    out.push(p2);
  }
  out.push(v[v.length - 1].slice());
  return out;
}
// An oval spiral around (cx, cz), from radii (rx0, rz0) in to (rx1, rz1). dir 1 runs clockwise on screen.
// lead: a point the track runs straight in from, lined up with the spiral's first tangent.
function spiral(o) {
  const out = [];
  if (o.lead) out.push(o.lead.slice());
  const n = Math.ceil(o.turns * 160);
  for (let i = 0; i <= n; i++) {
    const k = i / n, a = o.a0 + o.dir * k * o.turns * TAU;
    const rx = o.rx0 + (o.rx1 - o.rx0) * k, rz = o.rz0 + (o.rz1 - o.rz0) * k;
    out.push([o.cx + rx * Math.cos(a), o.cz + rz * Math.sin(a)]);
  }
  return out;
}

// Seven stops across town. theme picks the surface, props and colors of the board (see THEMES).
const LEVELS = [
  { name: "THE BACKYARD", story: "It started at the sandbox. Keep them out of the drain.",
    theme: 0, colors: 4, count: 52, speed: 19, power: 0.03, shooter: [30, -6],
    path: function () { return roundPoly([[-176, -160], [150, -160], [150, 160], [-150, 160], [-150, 40], [-78, 40]], 48); } },
  { name: "GARAGE SALE", story: "They're circling the card table. Everything's a quarter.",
    theme: 1, colors: 4, count: 64, speed: 20, power: 0.035, shooter: [0, 6],
    path: function () { return spiral({ cx: 0, cz: 6, a0: Math.PI, dir: 1, turns: 1.55, rx0: 168, rx1: 80, rz0: 186, rz1: 84, lead: [-168, 202] }); } },
  { name: "PAPER ROUTE", story: "Down the block, zigzagging like the morning papers.",
    theme: 2, colors: 5, count: 72, speed: 20, power: 0.035, shooter: [0, 132],
    path: function () { return roundPoly([[-176, -165], [150, -165], [150, -100], [-150, -100], [-150, -35], [150, -35], [150, 30], [-100, 30]], 32); } },
  { name: "MALL FOUNTAIN", story: "Round and round the fountain. No pennies, please.",
    theme: 3, colors: 5, count: 80, speed: 21, power: 0.04, shooter: [0, 150],
    path: function () { return spiral({ cx: 0, cz: -52, a0: 0, dir: -1, turns: 1.7, rx0: 164, rx1: 64, rz0: 130, rz1: 52, lead: [164, 202] }); } },
  { name: "VIDEO STORE", story: "Into the aisles at the video store. Be kind, rewind.",
    theme: 4, colors: 5, count: 76, speed: 20, power: 0.04, shooter: [-6, 150],
    path: function () { return roundPoly([[-140, -198], [-140, 58], [-75, 58], [-75, -172], [-10, -172], [-10, 58], [55, 58], [55, -172], [120, -172], [120, 58]], 32); } },
  { name: "ARCADE CARPET", story: "The arcade carpet. Glow-in-the-dark trouble.",
    theme: 5, colors: 6, count: 96, speed: 22, power: 0.045, shooter: [14, 32],
    path: function () { return roundPoly([[-176, -175], [165, -175], [165, 178], [-165, 178], [-165, -112], [105, -112], [105, 118], [-105, 118], [-105, -52], [30, -52]], 30); } },
  { name: "THE STORM DRAIN", story: "The big drain on Maple Street. Grandpa's last jar.",
    theme: 6, colors: 6, count: 110, speed: 23, power: 0.045, shooter: [0, 0],
    path: function () { return spiral({ cx: 0, cz: 0, a0: -Math.PI / 2, dir: 1, turns: 2.15, rx0: 170, rx1: 72, rz0: 186, rz1: 76, lead: [-176, -186] }); } }
];

// Resample a track every board unit: position and unit tangent at each whole s, plus a coarse copy for searches.
function buildPath(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.floor(L) + 1;
  const x = new Float32Array(n + 1), z = new Float32Array(n + 1), tx = new Float32Array(n + 1), tz = new Float32Array(n + 1);
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = Math.min(i, L);
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j] || 1, u = (s - cum[j]) / seg;
    x[i] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u;
    z[i] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u;
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n, i + 2);
    const dx = x[b] - x[a], dz = z[b] - z[a], l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
  }
  const coarse = [];
  for (let s = 0; s <= L; s += 4) coarse.push(s);
  return { L: L, n: n, x: x, z: z, tx: tx, tz: tz, coarse: coarse };
}
const PATHS = LEVELS.map(function (lv) { return buildPath(lv.path()); });

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// Where s is on track p. Before the pipe and past the drain the track carries straight on.
function posAt(p, s, out) {
  out = out || {};
  if (s <= 0) { out.x = p.x[0] + p.tx[0] * s; out.z = p.z[0] + p.tz[0] * s; out.tx = p.tx[0]; out.tz = p.tz[0]; return out; }
  if (s >= p.L) { const n = p.n; out.x = p.x[n] + p.tx[n] * (s - p.L); out.z = p.z[n] + p.tz[n] * (s - p.L); out.tx = p.tx[n]; out.tz = p.tz[n]; return out; }
  const i = Math.floor(s), u = s - i, k = Math.min(i + 1, p.n);
  out.x = p.x[i] + (p.x[k] - p.x[i]) * u; out.z = p.z[i] + (p.z[k] - p.z[i]) * u;
  out.tx = p.tx[i] + (p.tx[k] - p.tx[i]) * u; out.tz = p.tz[i] + (p.tz[k] - p.tz[i]) * u;
  return out;
}
// The point of the track nearest (x, z): { s, d }.
function nearestOnPath(p, x, z) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < p.coarse.length; i++) {
    const s = p.coarse[i], dx = p.x[s] - x, dz = p.z[s] - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = s; }
  }
  for (let s = Math.max(0, best - 4); s <= Math.min(p.n, best + 4); s++) {
    const dx = p.x[s] - x, dz = p.z[s] - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = s; }
  }
  return { s: best, d: Math.sqrt(bd) };
}

/* ---------------- Game state ---------------- */
let S = {}, keys = {}, parts = [], floats = [], idleT = 0, paused = false;
let THREE = null, R = null, LED = null, P = PATHS[0];
let ballId = 1;
const TMP = {}, TMP2 = {};

function rnd() { return Math.random(); }

function reset() {
  paused = false;
  const demo = !window.Shell || Shell.state() === "boot";
  S = { score: 0, lives: LIVES0, nextLife: LIFE_EVERY, level: 0, cleared: 0, poppedTotal: 0, shotsFired: 0,
        streak: 0, bestStreak: 0, bestDepth: 0, gapShots: 0, powersUsed: {}, t: 0, aim: -Math.PI / 2, kb: false,
        drag: null, fireCd: 0, recoil: 0, swapT: 0, demo: demo };
  parts.length = 0; floats.length = 0;
  ledClear();
  setupLevel(0);
  if (demo) demoChain();
}

function setupLevel(n) {
  const lv = LEVELS[n];
  S.level = n; P = PATHS[n];
  S.chain = []; S.popping = []; S.shots = [];
  S.toSpawn = lv.count; S.mode = "intro"; S.modeT = 0; S.rollIn = true;
  S.slowT = 0; S.revT = 0; S.lostLife = false; S.lastC = -1; S.run = 0; S.maxDanger = 0; S.danger = 0;
  S.dangerMsgT = 0; S.beatT = 0; S.loseV = 0; S.gulpT = 0; S.levelT = 0; S.checkT = 0; S.powerCount = 0;
  S.cur = newShot(); S.next = newShot();
  // start aimed at the middle of the board
  S.aim = Math.atan2(0 - lv.shooter[1], 0 - lv.shooter[0]);
  if (Math.hypot(lv.shooter[0], lv.shooter[1]) < 30) S.aim = -Math.PI / 2;
  V.intro = 1;
}

// The title screen shows the first stop with a chain already laid in, sitting still.
function demoChain() {
  S.rollIn = false;
  for (let i = 0; i < 26; i++) {
    const b = makeBall(spawnColor(), 300 - i * D);
    S.chain.unshift(b);
  }
  S.toSpawn = 0;
}

function makeBall(c, s) {
  return { id: ballId++, c: c, s: s, w: 1, ins: false, it: 0, pv: 0, pd: 0, power: null, pt: 0, spin: rnd() * TAU, tilt: rnd() * TAU };
}

// Spawn colors come in short runs, the way a real jar spills.
function spawnColor() {
  const n = LEVELS[S.level].colors;
  let c;
  if (S.lastC >= 0 && S.run < 2 && rnd() < 0.42) c = S.lastC;
  else { do { c = Math.floor(rnd() * n); } while (n > 1 && c === S.lastC && rnd() < 0.7); }
  S.run = c === S.lastC ? S.run + 1 : 1;
  S.lastC = c;
  return c;
}

function colorsInPlay() {
  const seen = {}, out = [];
  for (let i = 0; i < S.chain.length; i++) { const c = S.chain[i].c; if (!seen[c]) { seen[c] = 1; out.push(c); } }
  if (!out.length) for (let c = 0; c < LEVELS[S.level].colors; c++) out.push(c);
  return out;
}
function newShot() {
  const cs = colorsInPlay();
  return { c: cs[Math.floor(rnd() * cs.length)], wild: false };
}
// A color that is gone from the board is no use to shoot: swap it for one that is still there.
function refreshShots() {
  const cs = colorsInPlay();
  if (!S.cur.wild && cs.indexOf(S.cur.c) < 0) S.cur.c = cs[Math.floor(rnd() * cs.length)];
  if (!S.next.wild && cs.indexOf(S.next.c) < 0) S.next.c = cs[Math.floor(rnd() * cs.length)];
}

function need(a, b) { return D * (a.w + b.w) * 0.5; }
function linked(i) { const C = S.chain, a = C[i - 1], b = C[i]; return b.s - a.s <= need(a, b) + 0.6; }

/* ---------------- The chain ---------------- */
function stepChain(dt) {
  const C = S.chain, lv = LEVELS[S.level];
  let i;
  // new marbles come out of the pipe behind the last one
  while (S.toSpawn > 0 && S.mode !== "lose" && (C.length === 0 || C[0].s >= 0)) {
    const b = makeBall(spawnColor(), C.length ? C[0].s - D : 0);
    if (S.level > 0 || S.cleared > 0 || S.toSpawn < lv.count - 12) {
      if (rnd() < lv.power && S.powerCount < 2) { b.power = POWERS[Math.floor(rnd() * POWERS.length)]; S.powerCount++; }
    }
    C.unshift(b);
    S.toSpawn--;
  }
  if (!C.length) return;

  // how fast the pipe pushes
  let v = lv.speed;
  const lead = C[C.length - 1].s / P.L;
  if (S.rollIn) {
    v *= ROLL_IN;
    if (lead > ROLL_TO || S.toSpawn === 0) S.rollIn = false;
  } else if (lead > 0.8) v *= 0.62;                         // a little mercy near the drain
  if (S.slowT > 0) v *= SLOW_K;
  if (S.revT > 0 && !S.rollIn) v = -REV_V;
  if (S.mode === "lose") { S.loseV = Math.min(700, S.loseV + 900 * dt); v = S.loseV; }

  // the back segment (everything touching the last marble out of the pipe) moves together
  let j = 0;
  if (S.mode === "lose") j = C.length - 1;
  else while (j + 1 < C.length && linked(j + 1)) j++;
  let mv = v * dt;
  if (mv < 0) mv = Math.max(mv, Math.min(0, -D * 3 - C[0].s));
  for (i = 0; i <= j; i++) C[i].s += mv;

  // gaps whose two ends match pull back together; the meeting can set off a chain reaction
  const joins = [];
  if (S.mode !== "lose") {
    for (i = 1; i < C.length; i++) {
      if (linked(i)) continue;
      const a = C[i - 1], b = C[i];
      let e = i;
      while (e + 1 < C.length && linked(e + 1)) e++;
      if (a.c === b.c && !a.ins && !b.ins) {
        b.pv = Math.min(PULL_MAX, b.pv + PULL_A * dt);
        const room = b.s - a.s - need(a, b);
        let d = b.pv * dt, joined = false;
        if (d >= room) { d = room; joined = true; }
        for (let k = i; k <= e; k++) C[k].s -= d;
        if (joined) { b.pv = 0; joins.push(b); }
      } else b.pv = 0;
      i = e;
    }
  }
  // nothing overlaps: whatever is behind pushes whatever is in front
  for (i = 1; i < C.length; i++) {
    const n = need(C[i - 1], C[i]);
    if (C[i].s < C[i - 1].s + n) C[i].s = C[i - 1].s + n;
  }

  // fired marbles growing into their slot
  const settled = [];
  for (i = 0; i < C.length; i++) {
    const b = C[i];
    if (b.ins) { b.it += dt; b.w = Math.min(1, b.it / INS_T); if (b.w >= 1) { b.ins = false; settled.push(b); } }
    if (b.power && b.s >= 0) { b.pt += dt; if (b.pt > POWER_LIFE) { b.power = null; S.powerCount = Math.max(0, S.powerCount - 1); } }
  }
  for (i = 0; i < joins.length; i++) {
    const k = C.indexOf(joins[i]);
    if (k < 0) continue;
    const depth = (joins[i].pd || 0) + 1;
    joins[i].pd = 0;
    if (k > 0) C[k - 1].pd = 0;
    matchAt(k, depth, null);
  }
  for (i = 0; i < settled.length; i++) {
    const k = C.indexOf(settled[i]);
    const shot = settled[i].shot;
    settled[i].shot = null;
    const popped = k >= 0 && matchAt(k, 1, shot);
    shotResult(popped, shot);
  }
}

// Three or more of a color, touching, around marble i: pop them. Returns true if anything went.
function matchAt(i, depth, shot) {
  const C = S.chain;
  if (i < 0 || i >= C.length) return false;
  const c = C[i].c;
  let a = i, b = i;
  while (a > 0 && linked(a) && C[a - 1].c === c && !C[a - 1].ins) a--;
  while (b + 1 < C.length && linked(b + 1) && C[b + 1].c === c && !C[b + 1].ins) b++;
  if (b - a + 1 < 3) return false;
  popRange(a, b, depth, shot);
  return true;
}

function popRange(a, b, depth, shot) {
  const C = S.chain, gone = [];
  let i, k, bomb = false;
  for (i = a; i <= b; i++) gone.push(C[i]);
  const powers = [];
  for (i = 0; i < gone.length; i++) if (gone[i].power) powers.push(gone[i].power);
  if (powers.indexOf("bomb") >= 0) {
    bomb = true;
    // the blast takes everything within reach, any color, on any part of the track
    const centers = gone.filter(function (g) { return g.power === "bomb"; }).map(function (g) { return posAt(P, g.s, {}); });
    for (i = 0; i < C.length; i++) {
      if (gone.indexOf(C[i]) >= 0 || C[i].s < 0) continue;
      const p = posAt(P, C[i].s, TMP);
      for (k = 0; k < centers.length; k++) if (Math.hypot(p.x - centers[k].x, p.z - centers[k].z) < D * 2.6) { gone.push(C[i]); break; }
    }
  }
  // the scoring and the show
  let sx = 0, sz = 0;
  for (i = 0; i < gone.length; i++) {
    const g = gone[i], p = posAt(P, g.s, TMP);
    sx += p.x; sz += p.z;
    S.popping.push({ x: p.x, z: p.z, c: g.c, t: 0, spin: g.spin, tilt: g.tilt });
    if (g.power) S.powerCount = Math.max(0, S.powerCount - 1);
    popBurst(p.x, p.z, g.c, depth);
  }
  sx /= gone.length; sz /= gone.length;
  for (i = C.length - 1; i >= 0; i--) if (gone.indexOf(C[i]) >= 0) C.splice(i, 1);
  // every gap left behind whose ends match will pull closed, and remembers how deep the chain reaction is
  for (i = 1; i < C.length; i++) if (!linked(i) && C[i - 1].c === C[i].c) C[i].pd = Math.max(C[i].pd || 0, depth);

  const n = gone.length;
  let pts = n * 10 * depth + (depth > 1 ? 100 * depth : 0);
  addScore(pts);
  S.poppedTotal += n;
  S.bestDepth = Math.max(S.bestDepth, depth);
  floatText("+" + pts, sx, sz, depth > 1 ? "#ffe45c" : "#ffffff", depth > 1 ? 17 : 14);
  if (depth > 1) {
    floatText("CHAIN x" + depth + "!", sx, sz - 18, "#ff3fa4", 15, 0.15);
    ledChain(depth, pts);
    Shell.flash("CHAIN x" + depth + "!", n + " marbles popped", "#ff3fa4", 900);
    if (window.Trophies && depth >= 3) Trophies.unlock("md-chain3");
    camShake(1.2 + depth * 0.6, 0.25);
  }
  Sound.sfx("pop", depth, n);
  if (bomb) { Sound.sfx("bomb"); camShake(3, 0.4); Shell.shake(4, 0.3); }
  for (i = 0; i < powers.length; i++) usePower(powers[i], sx, sz);
  refreshShots();
}

function usePower(kind, x, z) {
  const info = POWER_INFO[kind];
  S.powersUsed[kind] = 1;
  if (kind === "slow") S.slowT = SLOW_T;
  else if (kind === "reverse") { S.revT = REV_T; S.slowT = Math.max(S.slowT, 0); }
  else if (kind === "wild") { S.next = S.cur; S.cur = { c: S.cur.c, wild: true }; }
  if (kind !== "bomb") Sound.sfx(kind);
  Shell.flash(info.title, info.sub, info.col, 1200);
  floatText(info.led + "!", x, z - 30, info.col, 13, 0.25);
  ledPower(kind);
  if (window.Trophies && POWERS.every(function (p) { return S.powersUsed[p]; })) Trophies.unlock("md-powers");
}

function shotResult(popped, shot) {
  if (!shot) return;
  if (popped) {
    S.streak++;
    S.bestStreak = Math.max(S.bestStreak, S.streak);
    if (shot.gap) {
      S.gapShots++;
      addScore(250);
      const p = shot.at;
      floatText("GAP SHOT +250", p.x, p.z - 34, "#9bff3f", 13, 0.1);
      ledFlash("GAP SHOT", "lime");
      Sound.sfx("gap");
      if (window.Trophies) Trophies.unlock("md-gap");
    }
    if (S.streak >= 3) addScore(S.streak * 20);
    if (window.NPRewards && (S.streak === 2 || (S.streak >= 5 && S.streak % 5 === 0))) NPRewards.streak(S.streak, S.streak === 2 ? "" : S.streak + " STRAIGHT!");
  } else S.streak = 0;
}

function addScore(n) {
  S.score += n;
  while (S.score >= S.nextLife) {
    S.nextLife += LIFE_EVERY;
    if (S.lives < LIVES_MAX) {
      S.lives++;
      Shell.flash("EXTRA LIFE", "Grandpa slipped you another marble bag.", "#9bff3f", 1300);
      ledFlash("EXTRA LIFE", "lime");
      Sound.sfx("life");
    }
  }
}

/* ---------------- Shooting ---------------- */
function shooterPos() { const s = LEVELS[S.level].shooter; return { x: s[0], z: s[1] }; }
function muzzle() {
  const sp = shooterPos(), c = Math.cos(S.aim), s = Math.sin(S.aim);
  return { x: sp.x + c * HERO_H * 0.38, z: sp.z + s * HERO_H * 0.38, y: HERO_H * 0.6 };
}
function canFire() { return (S.mode === "play" || S.mode === "intro") && S.fireCd <= 0 && S.shots.length < MAX_SHOTS; }

function fire() {
  if (!canFire()) return;
  const m = muzzle(), c = Math.cos(S.aim), s = Math.sin(S.aim);
  S.shots.push({ x: m.x, z: m.z, y: m.y, y0: m.y, vx: c * SHOT_V, vz: s * SHOT_V, c: S.cur.c, wild: S.cur.wild, gap: false, t: 0, at: null });
  S.cur = S.next;
  S.next = newShot();
  S.fireCd = SHOT_GAP;
  S.shotsFired++;
  S.recoil = 1;
  Sound.sfx("shoot");
}
function swap() {
  if (S.mode !== "play" && S.mode !== "intro") return;
  const t = S.cur; S.cur = S.next; S.next = t;
  S.swapT = 1;
  Sound.sfx("swap");
}

function stepShots(dt) {
  const C = S.chain;
  for (let q = S.shots.length - 1; q >= 0; q--) {
    const sh = S.shots[q];
    sh.t += dt;
    sh.y = BR + (sh.y0 - BR) * Math.max(0, 1 - sh.t / 0.09);
    const n = Math.max(1, Math.ceil(SHOT_V * dt / 5));
    let gone = false;
    for (let k = 0; k < n && !gone; k++) {
      sh.x += sh.vx * dt / n; sh.z += sh.vz * dt / n;
      // went through a gap in the chain on the way? (only counts if it then pops something)
      if (C.length > 1 && !sh.gap) {
        const np = nearestOnPath(P, sh.x, sh.z);
        if (np.d < BR * 0.9 && np.s > C[0].s + D && np.s < C[C.length - 1].s - D) {
          let clear = true;
          for (let i = 0; i < C.length; i++) if (Math.abs(C[i].s - np.s) < D * 1.05) { clear = false; break; }
          if (clear) sh.gap = true;
        }
      }
      let hit = -1, hd = D * 0.92;
      for (let i = 0; i < C.length; i++) {
        if (C[i].s < -2) continue;
        const p = posAt(P, C[i].s, TMP), d = Math.hypot(p.x - sh.x, p.z - sh.z);
        if (d < hd) { hd = d; hit = i; }
      }
      if (hit >= 0) { insertShot(sh, hit); S.shots.splice(q, 1); gone = true; break; }
      if (sh.x < BOARD.x1 - 30 || sh.x > BOARD.x2 + 30 || sh.z < BOARD.z1 - 40 || sh.z > BOARD.z2 + 30) {
        S.shots.splice(q, 1); gone = true;
        S.streak = 0;
      }
    }
  }
}

function insertShot(sh, h) {
  const C = S.chain, hb = C[h], p = posAt(P, hb.s, TMP);
  const ahead = (sh.x - p.x) * p.tx + (sh.z - p.z) * p.tz > 0;
  let k, s;
  if (ahead) {
    k = h + 1;
    s = k < C.length && linked(k) ? (hb.s + C[k].s) / 2 : hb.s + BR;
  } else {
    k = h;
    s = h > 0 && linked(h) ? (C[h - 1].s + hb.s) / 2 : hb.s - BR;
  }
  const nb = makeBall(sh.wild ? hb.c : sh.c, s);
  nb.w = 0; nb.ins = true; nb.it = 0;
  nb.fx = sh.x; nb.fz = sh.z; nb.fy = sh.y;
  nb.shot = { gap: sh.gap, wild: sh.wild, at: { x: sh.x, z: sh.z } };
  C.splice(k, 0, nb);
  Sound.sfx("clack");
}

/* ---------------- Flow ---------------- */
function update(dt) {
  S.t += dt; S.modeT += dt;
  if (S.fireCd > 0) S.fireCd -= dt;
  if (S.recoil > 0) S.recoil = Math.max(0, S.recoil - dt * 5);
  if (S.swapT > 0) S.swapT = Math.max(0, S.swapT - dt * 4);
  if (S.slowT > 0) S.slowT -= dt;
  if (S.revT > 0) S.revT -= dt;
  updateParts(dt);

  const turn = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
  if (turn) { S.aim += turn * 2.6 * dt; S.kb = true; }

  for (let i = S.popping.length - 1; i >= 0; i--) { S.popping[i].t += dt; if (S.popping[i].t > 0.16) S.popping.splice(i, 1); }

  if (S.mode === "intro" || S.mode === "play") {
    if (S.mode === "intro" && S.modeT > 1.2) { S.mode = "play"; S.modeT = 0; }
    S.levelT += dt;
    stepChain(dt);
    stepShots(dt);
    S.checkT -= dt;
    if (S.checkT <= 0) { S.checkT = 0.25; refreshShots(); }
    const C = S.chain;
    if (C.length) {
      const lead = C[C.length - 1];
      S.danger = clamp((lead.s / P.L - 0.72) / 0.26, 0, 1);
      S.maxDanger = Math.max(S.maxDanger, lead.s / P.L);
      if (S.danger > 0) {
        S.beatT -= dt;
        if (S.beatT <= 0) { S.beatT = 0.85 - S.danger * 0.45; Sound.sfx("beat", S.danger); }
        S.dangerMsgT -= dt;
        if (S.danger > 0.35 && S.dangerMsgT <= 0) { S.dangerMsgT = 7; ledFlash("DANGER!", "red", true); }
      }
      if (lead.s >= P.L - 1) startLose();
    } else S.danger = 0;
    if (S.mode === "play" && !C.length && S.toSpawn === 0 && !S.popping.length && !S.shots.length) clearLevel();
  } else if (S.mode === "lose") {
    stepChain(dt);
    const C = S.chain;
    for (let i = C.length - 1; i >= 0; i--) {
      if (C[i].s > P.L + D * 0.6) {
        C.splice(i, 1);
        S.gulpT -= 1;
        if (S.gulpT <= 0) { S.gulpT = 3; Sound.sfx("gulp"); }
      }
    }
    if (!C.length && S.modeT > 1.2) {
      S.lives--;
      if (S.lives <= 0) { finish(false); return; }
      Shell.flash("TRY THAT STOP AGAIN", S.lives + (S.lives === 1 ? " life left." : " lives left."), "#ffd23f", 1500);
      setupLevel(S.level);
      S.lostLife = true;
      levelIntro(true);
    }
  } else if (S.mode === "clear") {
    stepShots(dt);
    if (S.modeT > 2.8) {
      if (S.level >= LEVELS.length - 1) { finish(true); return; }
      setupLevel(S.level + 1);
      levelIntro(false);
    }
  }
}

function levelIntro(again) {
  const lv = LEVELS[S.level];
  if (!again) Shell.flash("STOP " + (S.level + 1) + ": " + lv.name, lv.story, "#ffd23f", 2200);
  ledLevel();
  Sound.sfx("whoosh");
}

function startLose() {
  if (S.mode === "lose") return;
  S.mode = "lose"; S.modeT = 0; S.loseV = 120; S.toSpawn = 0; S.shots.length = 0; S.streak = 0;
  S.lostLife = true;
  Shell.flash("DOWN THE DRAIN!", "The chain made it to the drain.", "#ff4b3e", 1500);
  Shell.sfx("buzzer");
  ledFlash("DOWN THE DRAIN", "red", true);
  camShake(3, 0.6);
  Sound.sfx("lose");
}

function clearLevel() {
  S.mode = "clear"; S.modeT = 0; S.cleared++;
  const bonus = 1000 + 500 * S.level, clean = S.lostLife ? 0 : 1000;
  addScore(bonus + clean);
  Shell.flash("STOP CLEARED!", "+" + bonus + (clean ? "  CLEAN STOP +" + clean : ""), "#9bff3f", 2000);
  ledClearStop(bonus + clean);
  Sound.sfx("clear");
  Shell.sfx("crowd");
  confetti(Shell.reduced ? 30 : 90);
  if (window.Trophies) {
    if (!S.lostLife) Trophies.unlock("md-clean");
    if (S.maxDanger > 0.9) Trophies.unlock("md-close");
  }
}

function finish(won) {
  if (won && window.Trophies) Trophies.unlock("md-town");
  ledFinal(S.score, won);
  const acc = S.shotsFired ? Math.round(S.poppedTotal / S.shotsFired * 10) / 10 : 0;
  Shell.gameOver(S.score, { title: won ? "TOWN SAVED!" : "DOWN THE DRAIN", html:
    row("Stops cleared", S.cleared + " of " + LEVELS.length) +
    row("Marbles popped", S.poppedTotal) +
    row("Best chain reaction", S.bestDepth > 1 ? "x" + S.bestDepth : "None") +
    row("Longest streak", S.bestStreak) +
    row("Gap shots", S.gapShots),
    stats: { score: S.score, won: won, stops: S.cleared, popped: S.poppedTotal, shots: S.shotsFired, perShot: acc,
             bestChain: S.bestDepth, bestStreak: S.bestStreak, gapShots: S.gapShots, powers: Object.keys(S.powersUsed).length } });
}
function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

/* ---------------- Input ---------------- */
// Touch: put a finger down, slide to aim, lift to shoot. Mouse: point to aim, click to shoot.
// Tap Kit or the marble box in the corner to swap the two marbles (right click and Down / X swap too).
const SWAP_BOX = { x: 8, y: 470, w: 98, h: 62 };
function onSwapSpot(x, y) {
  if (x >= SWAP_BOX.x && x <= SWAP_BOX.x + SWAP_BOX.w && y >= SWAP_BOX.y && y <= SWAP_BOX.y + SWAP_BOX.h) return true;
  if (!R || !R.camReady) return false;
  const sp = shooterPos(), h = boardToScreen(sp.x, sp.z, HERO_H * 0.55);
  return Math.hypot(x - h.x, y - h.y) < Math.max(22, heroScreenR());
}
function aimAt(x, y) {
  const g = screenToBoard(x, y, BR);
  if (!g) return;
  const sp = shooterPos(), dx = g.x - sp.x, dz = g.z - sp.z;
  if (dx * dx + dz * dz > 64) S.aim = Math.atan2(dz, dx);
  S.kb = false;
}
function pointer(type, x, y, e) {
  if (S.mode === "lose" || S.mode === "clear") { S.drag = null; return; }
  if (type === "down") {
    if (e && e.button === 2) { swap(); return; }
    if (onSwapSpot(x, y)) { S.drag = { swap: true, sx: x, sy: y }; return; }
    S.drag = { swap: false, sx: x, sy: y };
    aimAt(x, y);
  } else if (type === "move") {
    if (S.drag && S.drag.swap) return;
    // a mouse aims just by pointing; a finger aims while it is down
    if (S.drag || (e && e.pointerType === "mouse")) aimAt(x, y);
  } else if (type === "up" || type === "cancel") {
    const d = S.drag; S.drag = null;
    if (!d || type === "cancel") return;
    if (d.swap) { if (onSwapSpot(x, y) || Math.hypot(x - d.sx, y - d.sy) < 14) swap(); return; }
    aimAt(x, y);
    fire();
  }
}
function key(type, code, e) {
  if (type === "down") {
    keys[code] = true;
    if (e.repeat) return;
    if (code === "Space" || code === "Enter" || code === "NumpadEnter" || code === "ArrowUp") fire();
    else if (code === "ArrowDown" || code === "KeyX" || code === "ShiftLeft" || code === "ShiftRight") swap();
  } else keys[code] = false;
}

/* ---------------- Particles and floating text (drawn on the HUD layer, placed through the 3D camera) ---------------- */
const CONF_COLS = ["#3ff0ff", "#ff3fa4", "#9bff3f", "#ffd23f", "#a77bff", "#ff4b3e"];
function popBurst(x, z, c, depth) {
  const p = boardToScreen(x, z, BR), col = COLORS[c] ? COLORS[c].hex : "#ffffff";
  const n = Shell.reduced ? 5 : 10 + depth * 4;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 50 + Math.random() * (110 + depth * 30);
    parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.45 + Math.random() * 0.35, g: 300,
                 c: i % 3 ? col : "#ffffff", w: 1.6 + Math.random() * 2, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14, kind: i % 2 });
  }
}
function confetti(n) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, s = 140 + Math.random() * 260;
    parts.push({ x: W / 2 + (Math.random() - 0.5) * 120, y: 300, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.6 + Math.random() * 0.8, g: 260,
                 c: CONF_COLS[i % CONF_COLS.length], w: 2.5 + (i % 3), rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14, kind: 0 });
  }
}
function floatText(txt, x, z, col, size, delay) {
  floats.push({ txt: txt, x: x, z: z, col: col, size: size || 14, t: -(delay || 0) });
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt; p.vy += p.g * dt; p.vx *= 0.98; p.rot += p.vr * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0) parts.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; if (floats[i].t > 1.1) floats.splice(i, 1); }
}

/* ---------------- Music ----------------
   An original looping synth tune, made entirely in code. startMusic is self-contained: give it an
   AudioContext and a node to play into, and it plays until the returned stop() is called. stop()
   fades out and returns the sixteenth note it stopped on, which can be passed back in as from to
   pick up the tune where it left off. It knows nothing about the game. */
function startMusic(ctx, dest, from) {
  const BPM = 120, STEP = 60 / BPM / 4, BARS = 16, STEPS = BARS * 16, AHEAD = 0.3;
  // one chord per bar: bass note, then the three notes the arpeggio walks (MIDI numbers)
  const CH = { Am: [45, 69, 72, 76], F: [41, 65, 69, 72], C: [48, 67, 72, 76], G: [43, 67, 71, 74], E: [40, 68, 71, 76],
               Em: [40, 67, 71, 76], Dm: [38, 65, 69, 74] };
  const PROG = "Am F C G Am F G E F G Em Am Dm G C E".split(" ");
  // the tune, a bar a line: step in the bar, note, length in steps
  const TUNE = [
    "0E5-2 2A5-2 4C6-2 6B5-2 8A5-4 12E5-2 14G5-2",
    "0A5-3 3G5-1 4F5-2 6E5-2 8F5-2 10A5-2 12C6-4",
    "0E6-2 2D6-2 4C6-2 6G5-2 8E5-4 12G5-2 14C6-2",
    "0B5-4 4A5-2 6G5-2 8D5-6 14G5-2",
    "0E5-2 2A5-2 4C6-2 6E6-2 8D6-2 10C6-2 12B5-2 14A5-2",
    "0C6-4 4A5-2 6F5-2 8A5-3 11C6-1 12F6-4",
    "0D6-2 2B5-2 4G5-2 6B5-2 8D6-2 10G6-2 12F6-2 14D6-2",
    "0E6-6 6B5-2 8G#5-4 12E5-4",
    "0A5-2 2C6-2 4F6-4 8E6-2 10C6-2 12A5-4",
    "0B5-2 2D6-2 4G6-4 8F6-2 10D6-2 12B5-4",
    "0G5-2 2B5-2 4E6-3 7D6-1 8B5-2 10G5-2 12E5-4",
    "0A5-2 2C6-2 4E6-2 6A6-2 8G6-4 12E6-4",
    "0F6-3 3E6-1 4D6-2 6A5-2 8F5-2 10A5-2 12D6-4",
    "0D6-2 2B5-2 4G5-2 6D6-2 8B5-2 10G5-2 12D5-4",
    "0C6-4 4E6-4 8G6-4 12E6-2 14G6-2",
    "0G#6-4 4E6-2 6B5-2 8G#5-2 10B5-2 12E6-4"
  ];
  const LEAD = new Array(STEPS).fill(null), semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  TUNE.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(#?)(\d)-(\d+)$/.exec(tok);
      if (m) LEAD[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + semis[m[2]] + (m[3] ? 1 : 0), Number(m[5])];
    });
  });
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  const out = ctx.createGain(); out.gain.value = 0; out.connect(dest);
  out.gain.setTargetAtTime(1, ctx.currentTime + 0.05, 0.05);
  function filt(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const leadBus = filt("lowpass", 3600, 0.6, out), bassBus = filt("lowpass", 820, 1.4, out), padBus = filt("lowpass", 1500, 0.5, out);
  const send = ctx.createGain(), echo = ctx.createDelay(1), fb = ctx.createGain(), damp = filt("lowpass", 2200, 0.7, out);
  send.gain.value = 0.28; echo.delayTime.value = STEP * 3; fb.gain.value = 0.3;   // a dotted-eighth echo on the lead
  leadBus.connect(send); send.connect(echo); echo.connect(fb); fb.connect(echo); echo.connect(damp);
  const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate), ctx.sampleRate), nd = nb.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < nd.length; i++) { seed = (seed * 16807) % 2147483647; nd[i] = seed / 1073741823.5 - 1; }

  function note(to, type, f0, t, dur, vol, f1, hold, detune) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.01, dur * (hold == null ? 0.6 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (detune) o.detune.value = detune;
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(t, dur, vol, type, f, q) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nb; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function play(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[bar]], two = bar >= 8, n = LEAD[i];
    if (n) {                                                 // lead: two square waves a hair apart
      note(leadBus, "square", hz(n[0]), t, n[1] * STEP * 0.95, 0.075, 0, 0.55, -6);
      note(leadBus, "square", hz(n[0]), t, n[1] * STEP * 0.95, 0.06, 0, 0.55, 7);
    }
    note(out, "triangle", hz(ch[1 + [0, 1, 2, 1][s & 3]] + 12), t, STEP * 1.2, 0.05, 0, 0.3);   // sixteenth arpeggio
    if (!(s & 1)) {                                          // eighth-note octave bass
      const k = s >> 1;
      note(bassBus, "sawtooth", hz(ch[0] + (k & 1 ? 12 : 0)), t, STEP * 1.8, 0.22, 0, 0.5);
      hiss(t, s % 4 === 2 ? 0.09 : 0.035, s % 4 === 2 ? 0.09 : 0.05, "highpass", 7600);
    }
    if (s === 0) {                                           // a soft pad under each bar
      for (let k = 1; k < 4; k++) note(padBus, "sawtooth", hz(ch[k] - 12), t, STEP * 15.5, 0.022, 0, 0.85, (k - 2) * 8);
    }
    if (s === 4 || s === 12 || (bar % 4 === 3 && s >= 13)) { // snare, with a little fill every fourth bar
      hiss(t, 0.14, s >= 13 ? 0.16 : 0.26, "bandpass", 1800, 0.55);
      note(out, "triangle", 210, t, 0.07, 0.16, 140, 0.1);
    }
    if (two ? s % 4 === 0 : (s === 0 || s === 6 || s === 8 || s === 11)) note(out, "sine", 140, t, 0.17, 0.55, 42, 0.08);   // kick
  }

  let step = ((from | 0) % STEPS + STEPS) % STEPS, nextT = ctx.currentTime + 0.08, live = true;
  function pump() {
    if (!live) return;
    const now = ctx.currentTime;
    if (nextT < now - 0.2) nextT = now + 0.04;               // after a long stall, skip ahead rather than rush
    while (nextT < now + AHEAD) { play(step, nextT); step = (step + 1) % STEPS; nextT += STEP; }
  }
  pump();
  const timer = setInterval(pump, 60);
  return function stop() {
    if (!live) return step;
    live = false;
    clearInterval(timer);
    const t = ctx.currentTime;
    out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(function () { try { out.disconnect(); } catch (e) { /* already gone */ } }, 900);
    return step;
  };
}

/* ---------------- Sound: the game's own audio (music + extra effects) ----------------
   The shell still plays its own effects. On top of that the game keeps one AudioContext of its own for the
   music and a handful of effects. Nothing is created until the first tap, click or key press. It follows the
   shell's mute button (the same "npArcade.muted" setting), and the music button is remembered too. */
const MUSIC_KEY = "npArcade.music", MUSIC_VOL = 0.5, FX_VOL = 0.24;
const Sound = (function () {
  let A = null, dead = false, muted = false, stopMusic = null, at = 0;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  const buttons = [];

  function shellMuted() {
    const b = document.getElementById("np-mute");
    if (b) return b.getAttribute("aria-pressed") === "true";
    try { return localStorage.getItem("npArcade.muted") === "1"; } catch (e) { return false; }
  }
  function rig(c) {
    const o = { c: c };
    o.out = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    o.out.connect(comp); comp.connect(c.destination);
    o.music = c.createGain(); o.music.gain.value = MUSIC_VOL; o.music.connect(o.out);
    o.fx = c.createGain(); o.fx.gain.value = FX_VOL; o.fx.connect(o.out);
    const len = Math.floor(c.sampleRate * 1.5);
    o.noise = c.createBuffer(1, len, c.sampleRate);
    const d = o.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return o;
  }
  // Browsers only let sound start from a tap, a click or a key press, so this is called from those and nowhere else.
  function unlock() {
    if (dead) return;
    try {
      if (!A) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        A = rig(new AC());
        muted = shellMuted();
        A.out.gain.value = muted ? 0 : 1;
        setInterval(pump, 250);                              // keeps the mute state right even with the game paused
      }
      if (A.c.state !== "running") { const p = A.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { A = null; dead = true; }
  }
  // Called every frame: follow the mute button, start and stop the music with the game.
  function pump() {
    if (!A || !window.Shell) return;
    const m = shellMuted();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, A.c.currentTime, 0.02); }
    const want = musicOn && !muted && A.c.state === "running" && Shell.state() === "playing";
    if (want && !stopMusic) stopMusic = startMusic(A.c, A.music, at);
    else if (!want && stopMusic) { at = stopMusic(); stopMusic = null; }
  }
  function tone(type, f0, t, dur, vol, f1, hold) {
    const o = A.c.createOscillator(), g = A.c.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.5 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.fx); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(t, dur, vol, type, f0, q, f1) {
    const s = A.c.createBufferSource(), f = A.c.createBiquadFilter(), g = A.c.createGain();
    s.buffer = A.noise; f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(A.fx); s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.05);
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function cue(name, x, y) {
    const t = A.c.currentTime + 0.01;
    if (name === "shoot") {                                  // a springy thwip
      tone("square", 300, t, 0.09, 0.28, 1100, 0.2); hiss(t, 0.08, 0.25, "bandpass", 2600, 1.2, 600);
    } else if (name === "clack") {                           // glass on glass
      tone("sine", 2600, t, 0.05, 0.3, 1900, 0.05); tone("triangle", 1300, t, 0.04, 0.22, 0, 0.1); hiss(t, 0.03, 0.2, "highpass", 5000);
    } else if (name === "pop") {                             // pops climb with the chain reaction
      const base = 64 + Math.min(5, x - 1) * 3, n = Math.min(4, 1 + Math.floor((y || 3) / 3));
      for (let i = 0; i < n + 1; i++) tone("square", mtof(base + [0, 4, 7, 12, 16][i]), t + i * 0.045, 0.09, 0.2, 0, 0.4);
      hiss(t, 0.1, 0.3, "bandpass", 3200, 0.9, 1200);
      if (x > 1) tone("triangle", mtof(base + 24), t + 0.22, 0.4, 0.18, 0, 0.3);
    } else if (name === "gap") {
      [76, 79, 83, 88].forEach(function (m, i) { tone("square", mtof(m), t + i * 0.05, 0.08, 0.2, 0, 0.5); });
    } else if (name === "swap") {
      tone("square", 660, t, 0.05, 0.18, 990, 0.4); tone("square", 990, t + 0.05, 0.05, 0.16, 660, 0.4);
    } else if (name === "slow") {                            // winding down
      tone("sawtooth", 880, t, 0.6, 0.18, 180, 0.7); tone("sine", 440, t, 0.6, 0.2, 90, 0.7);
    } else if (name === "reverse") {                         // a tape rewinding
      for (let i = 0; i < 10; i++) tone("square", 1800 - i * 60, t + i * 0.035, 0.03, 0.12, 2400, 0.4);
      hiss(t, 0.5, 0.2, "bandpass", 3000, 2, 6000);
    } else if (name === "bomb") {                            // kaboom
      tone("sine", 160, t, 0.6, 0.9, 35, 0.05); hiss(t, 0.7, 0.8, "lowpass", 1800, 0.6, 120); hiss(t, 0.15, 0.5, "highpass", 3000);
    } else if (name === "wild") {                            // sparkle
      for (let i = 0; i < 8; i++) tone("triangle", mtof(84 + (i * 5) % 17), t + i * 0.04, 0.12, 0.16, 0, 0.3);
    } else if (name === "beat") {                            // the danger heartbeat
      const v = 0.35 + x * 0.45;
      tone("sine", 72, t, 0.13, v, 44, 0.1); tone("sine", 68, t + 0.17, 0.13, v * 0.8, 40, 0.1);
    } else if (name === "gulp") {                            // one down the drain
      tone("sine", 520, t, 0.16, 0.3, 140, 0.3); hiss(t, 0.12, 0.2, "lowpass", 900, 0.8, 200);
    } else if (name === "lose") {
      [67, 66, 65, 64].forEach(function (m, i) { tone("sawtooth", mtof(m - 12), t + i * 0.22, 0.28, 0.2, i === 3 ? mtof(m - 24) : 0, 0.6); });
    } else if (name === "clear") {                           // stop cleared fanfare
      [72, 76, 79, 84, 79, 84, 88, 91].forEach(function (m, i) { tone("square", mtof(m), t + i * 0.08, 0.12, 0.2, 0, 0.6); });
      [84, 88, 91].forEach(function (m) { tone("triangle", mtof(m), t + 0.7, 0.8, 0.16, 0, 0.4); });
    } else if (name === "life") {
      [72, 79, 84, 91].forEach(function (m, i) { tone("square", mtof(m), t + i * 0.07, 0.1, 0.2, 0, 0.5); });
    } else if (name === "whoosh") {
      hiss(t, 0.45, 0.3, "bandpass", 400, 1.2, 3600);
    }
  }
  function sfx(name, x, y) {
    if (!A || muted || A.c.state !== "running") return;
    try { cue(name, x, y); } catch (e) { /* sound is never worth a crash */ }
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
    newGame: function () { unlock(); at = 0; if (stopMusic) { stopMusic(); stopMusic = null; } pump(); },
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    peek: function () { return { made: !!A, state: A ? A.c.state : "none", playing: !!stopMusic, muted: muted, musicOn: musicOn }; }
  };
})();

/* =====================================================================================
   3D presentation
   ===================================================================================== */
// V is how things are being shown (the camera swoop, the hero's turn). It never feeds the rules.
const V = { intro: 0, heroA: -Math.PI / 2, lastLevel: -1 };

function rng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mkCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function shade(hex, k) {                                   // k > 0 toward white, k < 0 toward black
  const n = parseInt(hex.slice(1), 16), t = k < 0 ? 0 : 255, a = Math.abs(k);
  const r = Math.round(((n >> 16) & 255) * (1 - a) + t * a), g = Math.round(((n >> 8) & 255) * (1 - a) + t * a), b = Math.round((n & 255) * (1 - a) + t * a);
  return "rgb(" + r + "," + g + "," + b + ")";
}
function rrectPath(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function drawScript(g, script, cx, cy, maxW, maxH) {
  let w = maxW, h = w * script.height / script.width;
  if (h > maxH) { h = maxH; w = h * script.width / script.height; }
  g.drawImage(script, cx - w / 2, cy - h / 2, w, h);
}
// Draw into a tile so whatever crosses an edge comes back on the other side.
function wrapDraw(g, size, x, y, fn) {
  for (let ox = -size; ox <= size; ox += size) for (let oy = -size; oy <= size; oy += size) { g.save(); g.translate(x + ox, y + oy); fn(g); g.restore(); }
}

/* ---------------- Painted textures (all drawn here, no image files besides the two logos) ---------------- */

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every decal in the world uses this
// (the full logo with the mascot is kept for the splash, the title card and the score card).
// If the PNG is missing, plain lettering stands in.
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

// A glass marble, painted pale so the per-marble color tints it: a cat's-eye ribbon through the middle,
// swirls around it, a few air bubbles. u wraps around the marble, v runs pole to pole.
function marbleCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), r = rng(9);
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, "#c8c8c8"); bg.addColorStop(0.5, "#e2e2e2"); bg.addColorStop(1, "#bdbdbd");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  function ribbon(y0, amp, freq, ph, width, col) {
    g.fillStyle = col; g.beginPath();
    for (let x = 0; x <= 512; x += 4) g.lineTo(x, y0 + Math.sin(x / 512 * TAU * freq + ph) * amp - width / 2);
    for (let x = 512; x >= 0; x -= 4) g.lineTo(x, y0 + Math.sin(x / 512 * TAU * freq + ph + 0.6) * amp + width / 2);
    g.closePath(); g.fill();
  }
  ribbon(128, 30, 2, 0, 46, "rgba(255,255,255,.95)");       // the cat's eye
  ribbon(128, 30, 2, 0, 16, "rgba(140,140,140,.55)");
  ribbon(70, 16, 3, 1.3, 12, "rgba(255,255,255,.7)");
  ribbon(190, 16, 3, 2.4, 12, "rgba(255,255,255,.7)");
  ribbon(96, 12, 4, 0.4, 5, "rgba(120,120,120,.35)");
  ribbon(162, 12, 4, 2.0, 5, "rgba(120,120,120,.35)");
  for (let i = 0; i < 40; i++) {                            // tiny air bubbles
    const x = r() * 512, y = 30 + r() * 196, rr = 1 + r() * 2.4;
    g.fillStyle = "rgba(255,255,255,.75)"; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
  }
  return c;
}
// The wild marble: every color at once.
function wildCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  const cols = ["#ff3b30", "#ff9214", "#ffd21f", "#35d04a", "#2fe6ff", "#2f7bff", "#a45cff", "#ff3fa4"];
  for (let i = 0; i < 16; i++) {
    g.fillStyle = cols[i % cols.length]; g.beginPath();
    const x0 = i * 32;
    g.moveTo(x0, 0); g.lineTo(x0 + 32, 0); g.lineTo(x0 + 96, 256); g.lineTo(x0 + 64, 256); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x0 - 512, 0); g.lineTo(x0 - 480, 0); g.lineTo(x0 - 416, 256); g.lineTo(x0 - 448, 256); g.closePath(); g.fill();
  }
  g.fillStyle = "rgba(255,255,255,.55)";
  g.beginPath();
  for (let x = 0; x <= 512; x += 4) g.lineTo(x, 128 + Math.sin(x / 512 * TAU * 2) * 24 - 10);
  for (let x = 512; x >= 0; x -= 4) g.lineTo(x, 128 + Math.sin(x / 512 * TAU * 2 + 0.6) * 24 + 10);
  g.fill();
  return c;
}

// The badge that floats over a power-up marble.
function iconCanvas(kind) {
  const c = mkCanvas(128, 128), g = c.getContext("2d"), col = POWER_INFO[kind].col;
  g.fillStyle = "rgba(8,16,48,.92)"; g.beginPath(); g.arc(64, 64, 54, 0, TAU); g.fill();
  g.lineWidth = 9; g.strokeStyle = col; g.stroke();
  g.lineWidth = 3; g.strokeStyle = "#ffffff"; g.beginPath(); g.arc(64, 64, 60, 0, TAU); g.stroke();
  g.fillStyle = col; g.strokeStyle = col; g.lineJoin = "round"; g.lineCap = "round";
  if (kind === "slow") {                                    // an hourglass
    g.beginPath(); g.moveTo(40, 30); g.lineTo(88, 30); g.lineTo(66, 64); g.lineTo(88, 98); g.lineTo(40, 98); g.lineTo(62, 64); g.closePath();
    g.lineWidth = 7; g.stroke();
    g.beginPath(); g.moveTo(50, 92); g.lineTo(78, 92); g.lineTo(64, 74); g.closePath(); g.fill();
  } else if (kind === "reverse") {                          // rewind
    [[30, 0], [60, 0]].forEach(function (o) { g.beginPath(); g.moveTo(o[0] + 30, 36); g.lineTo(o[0] + 30, 92); g.lineTo(o[0], 64); g.closePath(); g.fill(); });
  } else if (kind === "bomb") {
    g.fillStyle = "#1a1c24"; g.beginPath(); g.arc(60, 70, 28, 0, TAU); g.fill();
    g.lineWidth = 3; g.strokeStyle = "#ffffff"; g.stroke();
    g.fillStyle = "#6a6e80"; g.fillRect(72, 36, 14, 12);
    g.lineWidth = 4; g.strokeStyle = "#e8d9a8"; g.beginPath(); g.moveTo(80, 36); g.quadraticCurveTo(86, 22, 98, 24); g.stroke();
    g.fillStyle = "#ffe45c"; g.beginPath(); g.arc(99, 23, 7, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,.6)"; g.beginPath(); g.arc(50, 60, 7, 0, TAU); g.fill();
  } else {                                                  // a rainbow star
    const cols = ["#ff3b30", "#ffd21f", "#35d04a", "#2fe6ff", "#a45cff"];
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 17 : 40; g.lineTo(64 + Math.cos(a) * rr, 66 + Math.sin(a) * rr); }
    g.closePath();
    const gr = g.createLinearGradient(24, 26, 104, 106);
    cols.forEach(function (cc, i) { gr.addColorStop(i / (cols.length - 1), cc); });
    g.fillStyle = gr; g.fill(); g.lineWidth = 3; g.strokeStyle = "#ffffff"; g.stroke();
  }
  return c;
}

/* the board surfaces, one 512 x 512 tile each */
function grassCanvas() {
  const c = mkCanvas(512, 512), g = c.getContext("2d"), r = rng(3);
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#3aa63a" : "#45b543"; g.fillRect(0, i * 64, 512, 64); }
  for (let i = 0; i < 16000; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(255,255,140,.08)" : "rgba(0,60,10,.12)";
    g.fillRect(r() * 512, r() * 512, 1, 2 + r() * 3);
  }
  for (let i = 0; i < 26; i++) {                            // clover and dandelions
    const x = r() * 512, y = r() * 512, kind = i % 3;
    wrapDraw(g, 512, x, y, function (q) {
      if (kind === 0) { q.fillStyle = "#ffe23a"; q.beginPath(); q.arc(0, 0, 5, 0, TAU); q.fill(); q.fillStyle = "#ffb000"; q.beginPath(); q.arc(0, 0, 2, 0, TAU); q.fill(); }
      else if (kind === 1) { q.fillStyle = "#ffffff"; for (let k = 0; k < 5; k++) { q.beginPath(); q.arc(Math.cos(k * 1.26) * 4, Math.sin(k * 1.26) * 4, 2.6, 0, TAU); q.fill(); } q.fillStyle = "#ffd21f"; q.beginPath(); q.arc(0, 0, 2, 0, TAU); q.fill(); }
      else { q.fillStyle = "#2a8a2c"; for (let k = 0; k < 3; k++) { q.beginPath(); q.arc(Math.cos(k * 2.1) * 4, Math.sin(k * 2.1) * 4, 4, 0, TAU); q.fill(); } }
    });
  }
  return c;
}
function concreteCanvas() {
  const c = mkCanvas(512, 512), g = c.getContext("2d"), r = rng(5);
  g.fillStyle = "#a3a7ad"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 22000; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.08)"; g.fillRect(r() * 512, r() * 512, 2, 2); }
  for (let i = 0; i < 4; i++) {                             // oil stains
    const x = r() * 512, y = r() * 512, rr = 30 + r() * 40;
    wrapDraw(g, 512, x, y, function (q) {
      const gr = q.createRadialGradient(0, 0, 2, 0, 0, rr); gr.addColorStop(0, "rgba(40,36,30,.35)"); gr.addColorStop(1, "rgba(40,36,30,0)");
      q.fillStyle = gr; q.scale(1.4, 1); q.beginPath(); q.arc(0, 0, rr, 0, TAU); q.fill();
    });
  }
  g.strokeStyle = "rgba(60,60,64,.5)"; g.lineWidth = 2;     // control joints
  g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke();
  g.font = "bold 34px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle";
  [["25¢", 120, 110, "#ffffff"], ["50¢", 380, 360, "#ffe45c"], ["$1", 400, 120, "#ffc1e0"], ["SALE", 130, 380, "#a8ecff"]].forEach(function (t) {
    g.save(); g.translate(t[1], t[2]); g.rotate((r() - 0.5) * 0.5); g.globalAlpha = 0.55; g.fillStyle = t[3]; g.fillText(t[0], 0, 0); g.restore();
  });
  return c;
}
function sidewalkCanvas() {
  const c = mkCanvas(512, 512), g = c.getContext("2d"), r = rng(7);
  g.fillStyle = "#cfc9bd"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 20000; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,255,255,.08)" : "rgba(60,50,30,.08)"; g.fillRect(r() * 512, r() * 512, 2, 2); }
  g.fillStyle = "rgba(90,80,64,.45)";
  for (let k = 0; k < 2; k++) { g.fillRect(k * 256, 0, 3, 512); g.fillRect(0, k * 256, 512, 3); }
  g.lineWidth = 5; g.globalAlpha = 0.5;                     // chalk hopscotch and doodles
  g.strokeStyle = "#ff7ac4"; [[60, 300], [60, 360], [30, 420], [90, 420], [60, 480]].forEach(function (b) { g.strokeRect(b[0], b[1], 56, 56); });
  g.strokeStyle = "#6fd4ff"; g.beginPath(); g.arc(380, 120, 40, 0, TAU); g.stroke();
  g.strokeStyle = "#ffe45c"; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 16 : 36; g.lineTo(380 + Math.cos(a) * rr, 380 + Math.sin(a) * rr); } g.closePath(); g.stroke();
  g.globalAlpha = 1;
  return c;
}
function terrazzoCanvas() {
  const c = mkCanvas(512, 512), g = c.getContext("2d"), r = rng(13);
  g.fillStyle = "#efe6d6"; g.fillRect(0, 0, 512, 512);
  const cols = ["#e2589b", "#28b7b0", "#f4a531", "#7a6cf0", "#9aa0aa", "#ffffff"];
  for (let i = 0; i < 1400; i++) {
    const x = r() * 512, y = r() * 512, s = 1.5 + r() * 4.5;
    g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.7;
    g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y + s * 0.4); g.lineTo(x - s * 0.7, y + s); g.closePath(); g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = "#1fa6a0"; g.fillRect(0, 0, 512, 6); g.fillRect(0, 0, 6, 512);
  g.fillStyle = "#e2589b"; g.fillRect(0, 254, 512, 4); g.fillRect(254, 0, 4, 512);
  return c;
}
function storeCarpetCanvas() {
  const c = mkCanvas(512, 512), g = c.getContext("2d"), r = rng(17);
  g.fillStyle = "#1e3a9e"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 14000; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,255,255,.04)" : "rgba(0,0,40,.12)"; g.fillRect(r() * 512, r() * 512, 2, 2); }
  for (let y = 0; y < 512; y += 64) for (let x = 0; x < 512; x += 64) {
    const ox = (y / 64) % 2 ? 32 : 0;
    g.fillStyle = (x + y) % 128 ? "rgba(255,210,31,.55)" : "rgba(255,75,62,.5)";
    g.beginPath(); g.moveTo(x + ox + 32, y + 22); g.lineTo(x + ox + 42, y + 32); g.lineTo(x + ox + 32, y + 42); g.lineTo(x + ox + 22, y + 32); g.closePath(); g.fill();
  }
  return c;
}
function arcadeCarpetCanvas() {
  const S2 = 512, c = mkCanvas(S2, S2), g = c.getContext("2d"), r = rng(41);
  g.fillStyle = "#140a2c"; g.fillRect(0, 0, S2, S2);
  for (let i = 0; i < 9000; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,255,255,.03)" : "rgba(0,0,0,.2)"; g.fillRect(r() * S2, r() * S2, 2, 2); }
  const cols = ["#ff3fa4", "#3ff0ff", "#9bff3f", "#ffd23f", "#a77bff", "#ff9214"];
  g.lineCap = "round"; g.lineJoin = "round";
  for (let i = 0; i < 40; i++) {
    const x = r() * S2, y = r() * S2, a = r() * TAU, kind = i % 4, col = cols[i % cols.length], sz = 12 + r() * 12;
    wrapDraw(g, S2, x, y, function (q) {
      q.rotate(a); q.strokeStyle = col; q.fillStyle = col; q.lineWidth = 4; q.globalAlpha = 0.85;
      if (kind === 0) { q.beginPath(); q.moveTo(-sz * 1.6, 0); for (let k = 0; k < 4; k++) q.quadraticCurveTo(-sz * 1.6 + (k + 0.5) * sz * 0.8, k % 2 ? sz * 0.6 : -sz * 0.6, -sz * 1.6 + (k + 1) * sz * 0.8, 0); q.stroke(); }
      else if (kind === 1) { q.beginPath(); q.moveTo(0, -sz * 0.7); q.lineTo(sz * 0.65, sz * 0.5); q.lineTo(-sz * 0.65, sz * 0.5); q.closePath(); q.stroke(); }
      else if (kind === 2) { q.beginPath(); q.arc(0, 0, sz * 0.32, 0, TAU); q.fill(); }
      else { q.beginPath(); q.moveTo(-sz, sz * 0.3); q.lineTo(-sz * 0.5, -sz * 0.3); q.lineTo(0, sz * 0.3); q.lineTo(sz * 0.5, -sz * 0.3); q.lineTo(sz, sz * 0.3); q.stroke(); }
    });
  }
  return c;
}
function asphaltCanvas() {
  const c = mkCanvas(512, 512), g = c.getContext("2d"), r = rng(23);
  g.fillStyle = "#30343c"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) { const v = r(); g.fillStyle = v < 0.4 ? "rgba(255,255,255,.09)" : v < 0.8 ? "rgba(0,0,0,.18)" : "rgba(180,170,150,.12)"; g.fillRect(r() * 512, r() * 512, 2, 2); }
  for (let i = 0; i < 5; i++) {                             // puddles that catch the streetlight
    const x = r() * 512, y = r() * 512, rx = 26 + r() * 40, ry = rx * (0.4 + r() * 0.3);
    wrapDraw(g, 512, x, y, function (q) {
      q.fillStyle = "rgba(20,40,70,.55)"; q.beginPath(); q.ellipse(0, 0, rx, ry, 0, 0, TAU); q.fill();
      q.fillStyle = "rgba(160,200,255,.18)"; q.beginPath(); q.ellipse(-rx * 0.25, -ry * 0.2, rx * 0.4, ry * 0.25, 0, 0, TAU); q.fill();
    });
  }
  return c;
}

// The groove a marble rolls in: one tile across the track, v runs along it.
function bedCanvas(base, stripe) {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 64, 0);
  gr.addColorStop(0, shade(base, -0.35)); gr.addColorStop(0.18, base); gr.addColorStop(0.5, shade(base, 0.12)); gr.addColorStop(0.82, base); gr.addColorStop(1, shade(base, -0.35));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.fillStyle = stripe; g.fillRect(30, 0, 4, 32);
  g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(0, 62, 64, 2);
  return c;
}
// Arrows painted along the last stretch to the drain.
function warnCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  g.fillStyle = "#ffd21f"; g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#16171d";
  for (let o = -64; o < 64; o += 32) { g.beginPath(); g.moveTo(0, o + 32); g.lineTo(32, o); g.lineTo(64, o + 32); g.lineTo(64, o + 46); g.lineTo(32, o + 14); g.lineTo(0, o + 46); g.closePath(); g.fill(); }
  return c;
}

// Kit's T-shirt, wrapped around the torso: the wordmark across the chest and across the back.
function shirtCanvas(script) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, "#ff7a3a"); bg.addColorStop(1, "#e8501c");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#ffe45c"; g.fillRect(0, 222, 512, 10);      // a stripe near the hem
  g.fillStyle = "#1b3fa8"; g.fillRect(0, 234, 512, 6);
  g.fillStyle = "#fff3cf"; g.fillRect(0, 0, 512, 10);        // collar
  [256, 0, 512].forEach(function (cx) { drawScript(g, script, cx, 92, 150, 70); });
  return c;
}

function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(0,10,20,.8)"); gr.addColorStop(0.55, "rgba(0,10,20,.4)"); gr.addColorStop(1, "rgba(0,10,20,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function glowCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 20, 64, 64, 63);
  gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.35, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return c;
}

// A tiny painted room for the glossy highlights on the marbles, the rails and the launcher.
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.16, "#dcebff"); gr.addColorStop(0.3, "#3d8cff");
    gr.addColorStop(0.5, "#1648b8"); gr.addColorStop(0.52, "#3a2a5a"); gr.addColorStop(1, "#6a5a8a");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#2a55b8"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(8, 6, 14, 52); tg.fillRect(42, 6, 14, 52);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#4a3a6a"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* The look of each stop: surface tile, tile size in board units, rail / groove / frame colors, the room around
   the board, and the props scattered in the open corners. */
const THEMES = [
  { surf: grassCanvas, tile: 170, rail: "#ff8a1e", bed: "#e9dcc0", stripe: "#d4c3a0", frame: "#c78a4a", room: 0x1d3f8a, props: ["flower", "flower", "soda"] },
  { surf: concreteCanvas, tile: 220, rail: "#2fb8ff", bed: "#e8e4dc", stripe: "#cfc8bc", frame: "#7a5a3a", room: 0x2a2f45, props: ["box", "box", "tapes"] },
  { surf: sidewalkCanvas, tile: 200, rail: "#ff3fa4", bed: "#f2ecdf", stripe: "#d9cfba", frame: "#5e8f3e", room: 0x23407a, props: ["cone", "soda", "flower"] },
  { surf: terrazzoCanvas, tile: 190, rail: "#1fc8bf", bed: "#fff6e8", stripe: "#e7d6bc", frame: "#e2589b", room: 0x3a2a6a, props: ["plant", "plant", "soda"] },
  { surf: storeCarpetCanvas, tile: 160, rail: "#ffd21f", bed: "#e8eefc", stripe: "#c6d2f0", frame: "#2a2f45", room: 0x101a4a, props: ["tapes", "tapes", "box"] },
  { surf: arcadeCarpetCanvas, tile: 180, rail: "#9bff3f", bed: "#2a1a4a", stripe: "#4a2f80", frame: "#1a1030", room: 0x0c0620, props: ["tapes", "soda", "box"] },
  { surf: asphaltCanvas, tile: 210, rail: "#ffd21f", bed: "#3a3f4a", stripe: "#5a6070", frame: "#8a8f9a", room: 0x070b1c, props: ["cone", "cone", "soda"] }
];

/* ---------------- LED ribbon board: the strip across the far edge of the board ----------------
   The board is a real dot matrix. Everything on it is painted into a tiny canvas, one pixel per LED, and a small
   shader turns each pixel into a glowing dot. It scrolls its programme right to left, and cuts to big animated
   messages when the game calls for one (the led... functions below). */
const LED_W = 372, LED_HT = 26;                            // board units
const LED_ROWS = 18, LED_COLS = Math.round(LED_W / (LED_HT / LED_ROWS));
const LED_SPEED = 34;                                      // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["KEEP 'EM OUT OF THE DRAIN", "pink"], ["NO QUARTERS REQUIRED", "cyan"]];
// Plugs for the rest of the arcade: [game, one-line tag]. Edit freely, the board lays itself out.
const LED_PLUGS = [
  ["TAPE PIN LANES", "BOWLING"],
  ["SHELF LINKS", "MINI GOLF"],
  ["BARGAIN BIN BUCKETS", "HOOPS"],
  ["BLEACHER CARTS", "HOME RUN DERBY"],
  ["TICKET ROLL ALLEY", "ROLL FOR TICKETS"],
  ["PAWN SHOP POOL", "RACK 'EM UP"],
  ["RINK RAT SHOOTOUT", "HOCKEY SHOOTOUT"],
  ["FOURTH AND COLLECT", "SPLIT THE UPRIGHTS"],
  ["POWDER DAY HAUL", "HIT THE SLOPES"],
  ["TABLE RINK RUMBLE", "AIR HOCKEY"],
  ["FLEA FORTRESS FLYBY", "PLAY IT FREE"],
  ["CREATURE FEATURE KO", "VHS BOSS RUSH"]
];

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
    "*": "00000 00100 01110 11111 01110 00100 00000", "o": "00000 01110 11111 11111 11111 01110 00000"
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
      const row = rows[r];
      for (let c = 0; c < 5; c++) if (row.charCodeAt(c) === 49) g.fillRect(x + c * sx, y + r * sy, sx, sy);
    }
    x += 6 * sx;
  }
  return x;
}

// The whole scrolling programme, painted once into one long strip (LED_ROWS tall).
function ledStrip(script) {
  const H = LED_ROWS, big = LED_BIG, yBig = Math.floor((H - 7 * big) / 2), GAP = 12, items = [];
  // The wordmark at board resolution: the cream lettering pushed to full brightness, the red edge kept as a
  // dimmer rim and the navy outline dropped to dark, so the script reads as light on black.
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
      d[i] = d[i] * k; d[i + 1] = d[i + 1] * k; d[i + 2] = d[i + 2] * k;
    }
    mg.putImageData(im, 0, 0);
  } catch (e) { /* leave it as drawn */ }
  function mark() { items.push({ w: markW, draw: function (g, x) { g.drawImage(markC, x, 0); } }); }
  function line(str, color) { items.push({ w: ledTextW(str, big), draw: function (g, x) { ledText(g, str, x, yBig, big, big, color); } }); }
  // the game's own name, with a row of marbles under it
  function title() {
    const s = "MARBLE DROP", w = ledTextW(s, big);
    const sy = Math.max(1, Math.floor((H - 4) / 7));
    items.push({ w: w, draw: function (g, x) {
      ledText(g, s, x, 0, big, sy, LED_C.yellow);
      const cols = [LED_C.red, LED_C.blue, LED_C.yellow, LED_C.lime, LED_C.violet];
      for (let k = 0; k * 5 + 3 <= w; k++) {               // a row of little marbles under the name
        g.fillStyle = cols[k % cols.length];
        g.fillRect(x + k * 5 + 1, H - 3, 1, 3); g.fillRect(x + k * 5, H - 2, 3, 1);
      }
    } });
  }
  // an ad card: a color bar, a little "FREE" tab with the tag beside it, and the game's name underneath
  function plug(name, tag, color) {
    const ns = Math.max(1, big - 1), ts = 1, pad = 7, tab = ledTextW("FREE", ts) + 4;
    const top = Math.max(1, Math.floor((H - (7 * ts + 3 + 7 * ns)) / 2));
    const w = pad + Math.max(ledTextW(name, ns), tab + 4 + ledTextW(tag, ts));
    items.push({ w: w, draw: function (g, x) {
      g.fillStyle = color; g.fillRect(x, 1, 3, H - 2);
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
    if (k === 0) title();
    line(LED_LINES[k][0], LED_C[LED_LINES[k][1]] || LED_C.amber);
    for (let j = 0; j < per && n < LED_PLUGS.length; j++, n++) plug(LED_PLUGS[n][0], LED_PLUGS[n][1], tints[n % tints.length]);
  }
  let total = 0;
  for (let i = 0; i < items.length; i++) total += items[i].w + GAP * 2 + 7;
  const c = mkCanvas(total, H), g = c.getContext("2d");
  g.fillStyle = "#000000"; g.fillRect(0, 0, total, H);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  let x = 0;
  for (let i = 0; i < items.length; i++) {
    items[i].draw(g, x);
    x += items[i].w + GAP;
    ledText(g, "*", x, Math.floor((H - 7) / 2), 1, 1, LED_C.blue);
    x += 7 + GAP;
  }
  return { canvas: c, markW: items[0].w };
}

function ledCreate(script) {
  const c = mkCanvas(LED_COLS, LED_ROWS), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  const strip = ledStrip(script), sw = strip.canvas.width;
  const start = ((-(LED_COLS - strip.markW) / 2) % sw + sw) % sw;      // open with the wordmark in the middle
  return { canvas: c, g: g, strip: strip.canvas, scroll: start, pos: -1, msg: null, queue: [], frame: -1, lastScore: 0, tex: null };
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
  const m = { kind: kind, text: text, dur: dur, t: 0, wait: 0, color: "yellow" };
  if (more) for (const k in more) m[k] = more[k];
  return m;
}
// Cut to a list of messages (or add them after whatever is showing), then return to the scroll.
function ledPlay(list, append) {
  const L = LED;
  if (!L || !list.length) return;
  if (append && L.msg) { for (let i = 0; i < list.length; i++) L.queue.push(list[i]); return; }
  L.msg = list[0]; L.msg.t = 0;
  L.queue = list.slice(1);
  L.frame = -1;
}
function ledClear() { if (!LED) return; LED.msg = null; LED.queue = []; LED.lastScore = 0; LED.pos = -1; }
function ledScore(dur) {
  const m = ledMsg("score", "SCORE", dur || 2.2, { from: Math.min(LED ? LED.lastScore : 0, S.score), value: S.score });
  if (LED) LED.lastScore = S.score;
  return m;
}
function ledLevel() {
  const lv = LEVELS[S.level];
  ledPlay([ledMsg("slide", "STOP " + (S.level + 1) + ": " + lv.name, 3.2, { color: "cyan" })]);
}
function ledChain(depth, pts) {
  ledPlay([ledMsg("strobe", "CHAIN X" + depth + "!", 2.2, { color: depth >= 3 ? "pink" : "yellow" }), ledScore(1.8)]);
}
function ledPower(kind) {
  const col = { slow: "cyan", reverse: "pink", bomb: "orange", wild: "yellow" }[kind];
  ledPlay([ledMsg(kind === "bomb" ? "strobe" : "slide", POWER_INFO[kind].led + (kind === "bomb" ? "!" : ""), 2.2, { color: col })], !!(LED && LED.msg && LED.msg.kind === "strobe"));
}
function ledFlash(text, color, urgent) {
  ledPlay([ledMsg(urgent ? "blink" : "slide", text, urgent ? 2.4 : 2.0, { color: color })]);
}
function ledClearStop(bonus) {
  ledPlay([ledMsg("strobe", "STOP CLEARED!", 2.4, { color: "lime" }), ledMsg("slide", "BONUS +" + bonus, 1.6, { color: "yellow" }), ledScore(2.2)]);
}
function ledFinal(score, won) {
  if (!LED) return;
  ledPlay([ledMsg("score", won ? "TOWN SAVED" : "FINAL", 8, { from: Math.min(LED.lastScore, score), value: score, final: true, wait: 0.5 })]);
  LED.lastScore = score;
}

function ledDrawMsg(g, m) {
  const W = LED_COLS, H = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((H - 7 * big) / 2), mid = Math.round(W / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.yellow;
  function fit(str) {
    let sx = big;
    while (sx > 1 && ledTextW(str, sx) > W - 16) sx--;
    return sx;
  }
  function chase(color, dir) {
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < W; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(W - x - 3, H - 1, 3, 1); }
  }
  const sx = fit(m.text), sy = sx, w = ledTextW(m.text, sx), x0 = Math.round((W - w) / 2), yT = Math.floor((H - 7 * sy) / 2);

  if (m.kind === "strobe") {                                // the whole board flips, then chevrons race outward
    if (!calm && t < 0.5 && Math.floor(t * 12) % 2 === 0) {
      g.fillStyle = col; g.fillRect(0, 0, W, H);
      ledText(g, m.text, x0, yT, sx, sy, "#000000");
      return;
    }
    const span = 6 * big + 5, ph = calm ? 0 : Math.floor((t * 46) % span);
    for (let k = 0; k < 12; k++) {
      const off = Math.round(w / 2) + 8 + k * span + ph;
      if (off > mid + span) break;
      const cc = k % 2 ? LED_C.red : LED_C.orange;
      ledText(g, ">", mid + off, yBig, big, big, cc);
      ledText(g, "<", mid - off - 5 * big, yBig, big, big, cc);
    }
    const cyc = [col, LED_C.white, col];
    ledText(g, m.text, x0, yT, sx, sy, calm ? col : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 14; i++) g.fillRect((Math.random() * W) | 0, (Math.random() * H) | 0, 1, 1); }
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "slide") {                                 // slides in from the right, then a white glint sweeps across
    const k = calm ? 1 : Math.min(1, t / 0.45), e = 1 - Math.pow(1 - k, 3);
    const x = Math.round(x0 + (1 - e) * W);
    ledText(g, m.text, x, yT, sx, sy, col);
    if (!calm && k >= 1) {
      const bx = Math.floor(((t - 0.45) * 150) % (W + 80)) - 40;
      g.save(); g.beginPath(); g.rect(bx, 0, 12, H); g.clip();
      ledText(g, m.text, x, yT, sx, sy, "#ffffff");
      g.restore();
    }
    chase(col, -1);
    return;
  }
  if (m.kind === "blink") {                                 // urgent: blinks, with a red bar running along the bottom
    if (calm || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, yT, sx, sy, col);
    g.fillStyle = LED_C.red; g.fillRect(0, H - 1, W, 1); g.fillRect(0, 0, W, 1);
    if (!calm) { g.fillStyle = "#ffffff"; g.fillRect(Math.floor((m.t * 95) % (W + 16)) - 8, H - 3, 4, 2); }
    return;
  }
  // score: counts up to the new total
  const k = calm ? 1 : Math.min(1, t / 0.7), v = Math.round(m.from + (m.value - m.from) * k);
  const label = m.text + " ", lw = ledTextW(label + m.value, big);
  const s2 = lw > W - 10 ? 1 : big, full = ledTextW(label + m.value, s2), x = Math.round((W - full) / 2), y = Math.floor((H - 7 * s2) / 2);
  const xn = ledText(g, label, x, y, s2, s2, LED_C.amber);
  const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
  ledText(g, String(v), xn, y, s2, s2, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
  if (!calm && m.wait === 0 && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(W * m.t / 0.3), 0, W, H); }
  chase(LED_C.amber, 1);
}

function ledDraw() {
  const L = LED, g = L.g, W = LED_COLS, H = LED_ROWS;
  g.fillStyle = "#000000"; g.fillRect(0, 0, W, H);
  if (L.msg) { ledDrawMsg(g, L.msg); return; }
  const sw = L.strip.width;
  let sx = L.pos, dx = 0;
  while (dx < W) {
    const n = Math.min(W - dx, sw - sx);
    g.drawImage(L.strip, sx, 0, n, H, dx, 0, n, H);
    dx += n; sx = 0;
  }
}
// Advance the board. It only repaints (and re-uploads its tiny texture) when an LED actually changes.
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
// and each face's texture is stretched corner to corner.
function roundBox(T, w, h, d, r) {
  const s = 5, per = (s + 1) * (s + 1), half = 0.5 / s;
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
function lathe(T, prof, seg, phiStart) {
  return new T.LatheGeometry(prof.map(function (p) { return new T.Vector2(p[0], p[1]); }), seg || 18, phiStart || 0);
}

// Free spots on a board: grid points with the most room around them, clear of the track, the shooter and anything
// already placed. Used for the wordmark printed on the board and for the props.
function clearance(p, x, z) {
  let m = 1e9;
  for (let s = 0; s <= p.L; s += 4) { const d = Math.hypot(p.x[s] - x, p.z[s] - z); if (d < m) m = d; }
  return m;
}
function rectClear(p, x, z, hw, hh, pad) {
  for (let s = -30; s <= p.L; s += 3) {
    const q = posAt(p, s, TMP2);
    if (Math.abs(q.x - x) < hw + pad && Math.abs(q.z - z) < hh + pad) return false;
  }
  return true;
}

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(THEMES[0].room, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = (parseInt(T.REVISION, 10) || 0) >= 182 ? T.PCFShadowMap : T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(CAM_FOV, W / H, 40, 4000);
  const caps = renderer.capabilities;
  const aniso = Math.min(4, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = aniso;
    return t;
  }

  const script = scriptCanvas(scriptImg), sAspect = script.width / script.height;
  const cScript = mkCanvas(1024, 512);                      // the wordmark as a decal: a clear rim so its edges never smear
  drawScript(cScript.getContext("2d"), script, 512, 256, 1008, 496);
  const tScript = tex(cScript);
  const tMarble = tex(marbleCanvas(), true), tWild = tex(wildCanvas(), true), tShadow = tex(shadowCanvas()), tGlow = tex(glowCanvas());
  tMarble.wrapT = tWild.wrapT = T.ClampToEdgeWrapping;
  const tShirt = tex(shirtCanvas(script));
  const tWarn = tex(warnCanvas(), true);
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;
  // the band around each pipe: the wordmark twice, on navy
  const cBand = mkCanvas(1024, 256), bg2 = cBand.getContext("2d");
  bg2.fillStyle = "#0d1f5c"; bg2.fillRect(0, 0, 1024, 256);
  bg2.fillStyle = "#ffe45c"; bg2.fillRect(0, 0, 1024, 14); bg2.fillRect(0, 242, 1024, 14);
  drawScript(bg2, script, 256, 128, 440, 190); drawScript(bg2, script, 768, 128, 440, 190);
  const tBand = tex(cBand, true);

  /* lights */
  scene.add(new T.HemisphereLight(0xffffff, 0x8f9fd6, 1.25));
  const key = new T.DirectionalLight(0xfff4e0, 2.7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -280; sc.right = 280; sc.top = 300; sc.bottom = -300; sc.near = 50; sc.far = 1200;
  sc.updateProjectionMatrix();
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.8; key.shadow.radius = 2.2;
  key.position.set(-210, 420, 170); key.target.position.set(0, 0, 0);
  scene.add(key); scene.add(key.target);
  const fill = new T.DirectionalLight(0xdfeaff, 0.6);
  fill.position.set(220, 240, 360); scene.add(fill);

  function decal(mat, order) { mat.transparent = true; mat.depthWrite = false; mat._order = order; return mat; }
  function lit(m, cast, recv) { m.castShadow = !!cast; m.receiveShadow = !!recv; return m; }
  function gloss(col, shin, refl) { return new T.MeshPhongMaterial({ color: col, specular: 0xffffff, shininess: shin || 80, envMap: tEnv, combine: T.AddOperation, reflectivity: refl == null ? 0.12 : refl }); }

  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
  const sph = new T.SphereGeometry(1, 20, 14);
  const fake = [];                                          // stand-in shadows, shown only when shadow maps are off
  const shadowMat = decal(new T.MeshBasicMaterial({ map: tShadow, opacity: 0.55 }), 5);
  function blob(parent, x, z, sx, sz) {
    const m = new T.Mesh(unit, shadowMat); m.scale.set(sx, 1, sz); m.position.set(x, 0.4, z); m.renderOrder = 5; m.visible = false;
    parent.add(m); fake.push(m); return m;
  }

  /* the room the board sits in */
  const floorMat = new T.MeshLambertMaterial({ color: 0x1d3f8a });
  const floor = new T.Mesh(new T.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), floorMat);
  floor.position.y = -24; scene.add(lit(floor, false, true));

  /* LED ribbon board on its stand, leaning back toward the player, across the far edge */
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas());
  tDot.wrapS = tDot.wrapT = T.RepeatWrapping; tDot.anisotropy = aniso;
  const csChunk = T.ShaderChunk && T.ShaderChunk.colorspace_fragment ? "colorspace_fragment" : "encodings_fragment";
  const ledFaceMat = new T.ShaderMaterial({
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
  const LED_LEAN = 0.62, ledZ = BOARD.z1 - FRAME - 16, ledY0 = 6;
  const ledStand = new T.Group();
  ledStand.position.set(0, ledY0, ledZ); ledStand.rotation.x = -LED_LEAN;
  const housingMat = gloss(0x0b0f1e, 60, 0.08);
  const house = new T.Mesh(roundBox(T, LED_W + 10, LED_HT + 10, 5, 2.2), housingMat);
  house.position.set(0, LED_HT / 2 + 2, -2.6); ledStand.add(lit(house, true, false));
  const trim = new T.Mesh(roundBox(T, LED_W + 12, 2.4, 6, 1), gloss(0xff9214, 90, 0.15));
  trim.position.set(0, LED_HT + 7.4, -2.4); ledStand.add(trim);
  const trim2 = trim.clone(); trim2.position.y = -3.4; ledStand.add(trim2);
  const ledFace = new T.Mesh(new T.PlaneGeometry(LED_W, LED_HT), ledFaceMat);
  ledFace.position.set(0, LED_HT / 2 + 2, 0.05); ledStand.add(ledFace);
  // the marquee sign on top of the board: the wordmark and the game's name
  const SIGN_W = 286, SIGN_H = 74;
  const cSign = mkCanvas(1024, 266), sgx = cSign.getContext("2d");
  const sbg = sgx.createLinearGradient(0, 0, 0, 266);
  sbg.addColorStop(0, "#3d8cff"); sbg.addColorStop(0.5, "#1b5fe0"); sbg.addColorStop(1, "#0b3aa6");
  sgx.fillStyle = sbg; sgx.fillRect(0, 0, 1024, 266);
  const sgl = sgx.createLinearGradient(0, 0, 0, 120);
  sgl.addColorStop(0, "rgba(255,255,255,.42)"); sgl.addColorStop(1, "rgba(255,255,255,0)");
  sgx.fillStyle = sgl; sgx.beginPath(); sgx.ellipse(512, -20, 620, 140, 0, 0, TAU); sgx.fill();
  sgx.lineWidth = 16; sgx.strokeStyle = "#ff9214"; sgx.strokeRect(8, 8, 1008, 250);
  sgx.lineWidth = 4; sgx.strokeStyle = "#ffe45c"; sgx.strokeRect(19, 19, 986, 228);
  drawScript(sgx, script, 300, 133, 500, 200);
  candyText(sgx, "MARBLE", 768, 92, 80, 380);
  candyText(sgx, "DROP", 768, 184, 92, 380);
  const signFace = new T.MeshBasicMaterial({ map: tex(cSign) }), signSide = gloss(0x1b4fc0, 40, 0.06);
  const sign = new T.Mesh(roundBox(T, SIGN_W, SIGN_H, 4, 2), [signSide, signSide, signSide, signSide, signFace, signSide]);
  sign.position.set(0, LED_HT + 12 + SIGN_H / 2, -2.4); ledStand.add(lit(sign, true, false));
  [-1, 1].forEach(function (s) {
    const post = new T.Mesh(new T.CylinderGeometry(1.6, 1.6, 8, 8), legMat0());
    post.position.set(s * (SIGN_W / 2 - 30), LED_HT + 9, -3); ledStand.add(post);
  });
  function legMat0() { return gloss(0xc8ccd6, 100, 0.2); }
  scene.add(ledStand);
  const legMat = gloss(0x2a3150, 50, 0.06);
  [-1, 1].forEach(function (s) {
    const leg = new T.Mesh(new T.CylinderGeometry(2.2, 2.2, 40, 10), legMat);
    leg.position.set(s * (LED_W / 2 - 30), -12, ledZ - 12); scene.add(lit(leg, true, false));
  });

  /* marbles: one instanced mesh for the whole chain (and the pops), with a soft shadow under each for low quality */
  const MAXB = 220;
  const marbleGeo = new T.SphereGeometry(BR, 26, 18);
  const marbleMat = new T.MeshPhongMaterial({ map: tMarble, specular: 0xffffff, shininess: 150, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.24 });
  const marbles = new T.InstancedMesh(marbleGeo, marbleMat, MAXB);
  marbles.instanceMatrix.setUsage(T.DynamicDrawUsage);
  const col0 = new T.Color(1, 1, 1);
  for (let i = 0; i < MAXB; i++) marbles.setColorAt(i, col0);
  marbles.count = 0; marbles.frustumCulled = false;
  scene.add(lit(marbles, true, false));
  const blobs = new T.InstancedMesh(unit, shadowMat, MAXB);
  blobs.count = 0; blobs.frustumCulled = false; blobs.renderOrder = 5; blobs.visible = false;
  scene.add(blobs);
  const COLS3 = COLORS.map(function (c) { return new T.Color(c.hex); });
  // single marbles: the ones in the air, the one on the launcher, the one in the hopper
  function single() {
    const m = new T.Mesh(marbleGeo, new T.MeshPhongMaterial({ map: tMarble, specular: 0xffffff, shininess: 150, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.24 }));
    m.castShadow = true; m.visible = false; m.userData.own = m.material; scene.add(m);
    return m;
  }
  const wildMat = new T.MeshPhongMaterial({ map: tWild, specular: 0xffffff, shininess: 150, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.24 });
  const shots = []; for (let i = 0; i < MAX_SHOTS + 2; i++) shots.push(single());
  const loaded = single(), hopper = single();

  // the badges floating over power-up marbles
  const iconMats = {};
  POWERS.forEach(function (k) { iconMats[k] = new T.SpriteMaterial({ map: tex(iconCanvas(k)), depthTest: false, transparent: true }); });
  const icons = [];
  for (let i = 0; i < 6; i++) { const sp = new T.Sprite(iconMats.slow); sp.renderOrder = 30; sp.visible = false; sp.scale.set(15, 15, 1); scene.add(sp); icons.push(sp); }

  /* Kit */
  const hero = makeHero(T, { tShirt: tShirt, tScript: tScript, sAspect: sAspect, env: tEnv, gloss: gloss });
  scene.add(hero.root);
  const heroBlob = new T.Mesh(unit, shadowMat); heroBlob.scale.set(46, 1, 40); heroBlob.renderOrder = 5; heroBlob.visible = false;
  scene.add(heroBlob); fake.push(heroBlob);

  /* the stops */
  const levels = LEVELS.map(function (lv, i) { return buildLevel(i); });

  function buildLevel(li) {
    const lv = LEVELS[li], th = THEMES[lv.theme], p = PATHS[li], grp = new T.Group();
    const end = posAt(p, p.L, {}), DR = 19;
    const tSurf = tex(th.surf(), true);
    tSurf.repeat.set(1 / th.tile, 1 / th.tile);
    // the playing surface, with a real hole cut for the drain
    const shape = new T.Shape();
    shape.moveTo(BOARD.x1, -BOARD.z1); shape.lineTo(BOARD.x2, -BOARD.z1); shape.lineTo(BOARD.x2, -BOARD.z2); shape.lineTo(BOARD.x1, -BOARD.z2); shape.closePath();
    const hole = new T.Path(); hole.absarc(end.x, -end.z, DR, 0, TAU, true); shape.holes.push(hole);
    const sg = new T.ShapeGeometry(shape, 40); sg.rotateX(-Math.PI / 2);
    grp.add(lit(new T.Mesh(sg, new T.MeshLambertMaterial({ map: tSurf })), false, true));
    // the tray frame
    const frameMat = gloss(new T.Color(th.frame), 70, 0.08);
    const fw = BOARD.x2 - BOARD.x1 + FRAME * 2, fd = BOARD.z2 - BOARD.z1, fh = FRAME_H + 24;
    [[0, BOARD.z1 - FRAME / 2, fw, FRAME], [0, BOARD.z2 + FRAME / 2, fw, FRAME], [BOARD.x1 - FRAME / 2, (BOARD.z1 + BOARD.z2) / 2, FRAME, fd], [BOARD.x2 + FRAME / 2, (BOARD.z1 + BOARD.z2) / 2, FRAME, fd]].forEach(function (f) {
      const m = new T.Mesh(roundBox(T, f[2], fh, f[3], 3.5), frameMat);
      m.position.set(f[0], FRAME_H - fh / 2, f[1]); grp.add(lit(m, true, true));
    });
    // the groove: a flat bed between two round rails, hazard chevrons on the last stretch
    const bedT = tex(bedCanvas(th.bed, th.stripe), true);
    const sEnd = p.L - DR + 3, halfW = BR + 3.6;
    function ribbon(s0, s1, y, hw, vk, mat) {
      const pos = [], uv = [], idx = [], nor = [];
      let k = 0;
      for (let s = s0; ; s = Math.min(s1, s + 3)) {
        const q = posAt(p, s, TMP2), nx = -q.tz, nz = q.tx;
        pos.push(q.x - nx * hw, y, q.z - nz * hw, q.x + nx * hw, y, q.z + nz * hw);
        nor.push(0, 1, 0, 0, 1, 0);
        uv.push(0, s * vk, 1, s * vk);
        if (k > 0) { const a = (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        k++;
        if (s >= s1) break;
      }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
      g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      // keep the triangles facing up whichever way the track turns
      const tmp = g.index.array;
      for (let t = 0; t < tmp.length; t += 3) {
        const a = tmp[t] * 3, b = tmp[t + 1] * 3, c = tmp[t + 2] * 3;
        const cr = (pos[b] - pos[a]) * (pos[c + 2] - pos[a + 2]) - (pos[b + 2] - pos[a + 2]) * (pos[c] - pos[a]);
        if (cr > 0) { const sw = tmp[t + 1]; tmp[t + 1] = tmp[t + 2]; tmp[t + 2] = sw; }
      }
      const m = new T.Mesh(g, mat);
      return m;
    }
    grp.add(lit(ribbon(-6, sEnd, 0.25, halfW, 1 / 64, new T.MeshLambertMaterial({ map: bedT })), false, true));
    const warn = ribbon(Math.max(0, sEnd - 64), sEnd, 0.4, halfW - 4, 1 / 28, decal(new T.MeshLambertMaterial({ map: tWarn, opacity: 0.85 }), 2));
    warn.renderOrder = 2; grp.add(lit(warn, false, true));
    const railMat = gloss(new T.Color(th.rail), 110, 0.18);
    [-1, 1].forEach(function (side) {
      const pts = [];
      for (let s = -2; s < sEnd; s += 7) { const q = posAt(p, s, TMP2); pts.push(new T.Vector3(q.x - q.tz * side * (BR + 4.2), 4.0, q.z + q.tx * side * (BR + 4.2))); }
      const q = posAt(p, sEnd, TMP2); pts.push(new T.Vector3(q.x - q.tz * side * (BR + 4.2), 4.0, q.z + q.tx * side * (BR + 4.2)));
      const curve = new T.CatmullRomCurve3(pts);
      grp.add(lit(new T.Mesh(new T.TubeGeometry(curve, Math.ceil(sEnd / 5), 2.6, 8, false), railMat), true, true));
      const cap = new T.Mesh(sph, railMat); cap.scale.setScalar(2.9); cap.position.copy(pts[pts.length - 1]); grp.add(cap);
    });
    // the pipe the marbles come out of, with the wordmark band around it
    const st = posAt(p, 0, {}), pipeMat = gloss(new T.Color(th.rail).multiplyScalar(0.8), 90, 0.15);
    const pipe = new T.Group();
    const pr = BR + 6.5, plen = 74;
    let m = new T.Mesh(new T.CylinderGeometry(pr, pr, plen, 28, 1, true), pipeMat); m.position.y = plen / 2; pipe.add(lit(m, true, true));
    m = new T.Mesh(new T.CylinderGeometry(pr - 1.6, pr - 1.6, plen, 28, 1, true), new T.MeshLambertMaterial({ color: 0x0c0e16, side: T.BackSide })); m.position.y = plen / 2; pipe.add(m);
    m = new T.Mesh(new T.TorusGeometry(pr, 2.4, 10, 30), gloss(0xffe45c, 100, 0.15)); m.rotation.x = Math.PI / 2; m.position.y = 0.4; pipe.add(lit(m, true, false));
    const bandG = new T.CylinderGeometry(pr + 0.5, pr + 0.5, 26, 32, 1, true);
    m = new T.Mesh(bandG, new T.MeshPhongMaterial({ map: tBand, specular: 0x666666, shininess: 60 })); m.position.y = 34; pipe.add(lit(m, true, false));
    pipe.position.set(st.x, BR + 1.5, st.z);
    pipe.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(-st.tx, 0, -st.tz));
    grp.add(pipe);
    // the drain: a deep round hole with a steel rim, and a ring that glows as the chain closes in
    const drain = new T.Group(); drain.position.set(end.x, 0, end.z);
    m = new T.Mesh(new T.CylinderGeometry(DR, DR * 0.92, 34, 30, 1, true), new T.MeshLambertMaterial({ color: 0x2a2e38, side: T.BackSide })); m.position.y = -17; drain.add(m);
    m = new T.Mesh(new T.CircleGeometry(DR, 24).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x020306 })); m.position.y = -33; drain.add(m);
    m = new T.Mesh(new T.TorusGeometry(DR + 1.2, 2.6, 12, 36), gloss(0xc8ccd6, 120, 0.3)); m.rotation.x = Math.PI / 2; m.position.y = 0.9; drain.add(lit(m, true, true));
    for (let k = 0; k < 8; k++) {                           // little hazard studs around the rim
      const a = k / 8 * TAU, stud = new T.Mesh(sph, gloss(k % 2 ? 0x16171d : 0xffd21f, 80, 0.1));
      stud.scale.set(2.2, 1.2, 2.2); stud.position.set(Math.cos(a) * (DR + 8), 0.8, Math.sin(a) * (DR + 8)); drain.add(lit(stud, true, false));
    }
    const glow = new T.Mesh(new T.RingGeometry(DR + 3, DR + 18, 36).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({ map: tGlow, color: 0xff3322, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    glow.position.y = 1.2; glow.renderOrder = 8; drain.add(glow);
    grp.add(drain);

    // the wordmark printed on the board, in the biggest open space it fits
    const sp = lv.shooter, placed = [];
    let best = null;
    for (let wd = 150; wd >= 80 && !best; wd -= 10) {
      const hh = wd / sAspect / 2, hw = wd / 2;
      let bestScore = -1e9;
      for (let x = BOARD.x1 + hw + 12; x <= BOARD.x2 - hw - 12; x += 10) for (let z = BOARD.z1 + hh + 12; z <= BOARD.z2 - hh - 12; z += 10) {
        if (Math.abs(x - sp[0]) < hw + 32 && Math.abs(z - sp[1]) < hh + 32) continue;
        if (Math.abs(x - end.x) < hw + DR + 6 && Math.abs(z - end.z) < hh + DR + 6) continue;
        if (x - hw < BOARD.x1 + 120 && z + hh > BOARD.z2 - 95) continue;   // keep clear of the marble box in the corner
        if (!rectClear(p, x, z, hw, hh, BR + 8)) continue;
        const score = -Math.hypot(x * 0.6, z) * 0.2 + Math.min(clearance(p, x, z), 120);
        if (score > bestScore) { bestScore = score; best = { x: x, z: z, w: wd, h: hh * 2 }; }
      }
    }
    if (best) {
      const mk = new T.Mesh(unit, decal(new T.MeshLambertMaterial({ map: tScript, opacity: 0.92 }), 1));
      mk.scale.set(best.w, 1, best.h); mk.position.set(best.x, 0.15, best.z); mk.renderOrder = 1;
      grp.add(lit(mk, false, true));
      placed.push({ x: best.x, z: best.z, r: best.w / 2 });
    }
    // the mall fountain sits in the middle of its spiral
    if (lv.theme === 3) { grp.add(fountain(T, 0, -52)); placed.push({ x: 0, z: -52, r: 30 }); }
    // props in the open corners
    const r2 = rng(li * 17 + 5), spots = [];
    for (let x = BOARD.x1 + 18; x <= BOARD.x2 - 18; x += 8) for (let z = BOARD.z1 + 18; z <= BOARD.z2 - 18; z += 8) {
      if (Math.hypot(x - sp[0], z - sp[1]) < 64 || Math.hypot(x - end.x, z - end.z) < 44) continue;
      const cl = clearance(p, x, z) - BR - 6;
      if (cl < 20) continue;
      spots.push({ x: x, z: z, cl: cl });
    }
    spots.sort(function (a, b) { return b.cl - a.cl; });
    let made = 0;
    for (let k = 0; k < spots.length && made < th.props.length; k++) {
      const s2 = spots[k];
      if (placed.some(function (q) { return Math.hypot(q.x - s2.x, q.z - s2.z) < q.r + 22; })) continue;
      const pr2 = prop(T, th.props[made], r2);
      pr2.position.set(s2.x, 0, s2.z); pr2.rotation.y = r2() * TAU;
      grp.add(pr2); blob(grp, s2.x + 3, s2.z - 2, 30, 30);
      placed.push({ x: s2.x, z: s2.z, r: 18 });
      made++;
    }
    grp.visible = false;
    scene.add(grp);
    return { grp: grp, glow: glow, tSurf: tSurf };
  }

  // little things lying around, all low enough that they never hide the track
  function prop(T, kind, r) {
    const g = new T.Group();
    if (kind === "flower") {
      const stem = new T.Mesh(new T.CylinderGeometry(0.7, 0.9, 12, 6), new T.MeshLambertMaterial({ color: 0x2f8a2a })); stem.position.y = 6; g.add(lit(stem, true, false));
      const petal = gloss(r() < 0.5 ? 0xffffff : 0xffe23a, 40, 0.04);
      for (let k = 0; k < 7; k++) { const pm = new T.Mesh(sph, petal); pm.scale.set(3, 1, 1.6); const a = k / 7 * TAU; pm.position.set(Math.cos(a) * 3.4, 12.5, Math.sin(a) * 3.4); pm.rotation.y = -a; g.add(lit(pm, true, false)); }
      const mid = new T.Mesh(sph, gloss(0xffa000, 40, 0.05)); mid.scale.set(2.4, 1.6, 2.4); mid.position.y = 13; g.add(mid);
      const leaf = new T.Mesh(sph, new T.MeshLambertMaterial({ color: 0x3aa63a })); leaf.scale.set(5, 0.8, 2); leaf.position.set(3, 4, 0); g.add(lit(leaf, true, false));
    } else if (kind === "soda") {
      const can = new T.Mesh(new T.CylinderGeometry(4.4, 4.4, 12, 18), gloss(r() < 0.5 ? 0xd8202a : 0x2f7bff, 100, 0.2)); can.position.y = 6; g.add(lit(can, true, true));
      const top = new T.Mesh(new T.CylinderGeometry(4.2, 4.4, 1, 18), gloss(0xd0d4dc, 120, 0.3)); top.position.y = 12.4; g.add(top);
      const band = new T.Mesh(new T.CylinderGeometry(4.5, 4.5, 3, 18, 1, true), gloss(0xffffff, 80, 0.1)); band.position.y = 6; g.add(band);
    } else if (kind === "box") {
      const cols = [0xff4b3e, 0x16b9e8, 0xff3fa4, 0x58c322, 0xffb81f, 0x8a5cff], c = cols[Math.floor(r() * cols.length)];
      const side = gloss(c, 70, 0.08);
      const lid = new T.MeshPhongMaterial({ map: boxLid(T, c), specular: 0xbbbbbb, shininess: 80 });
      const bx = new T.Mesh(roundBox(T, 30, 7, 22, 1.8), [side, side, lid, side, side, side]); bx.position.y = 3.5; g.add(lit(bx, true, true));
    } else if (kind === "tapes") {
      const side = gloss(0x1b1d26, 70, 0.1), label = new T.MeshPhongMaterial({ map: tapeTop(T), specular: 0x888888, shininess: 60 });
      for (let k = 0; k < 3; k++) {
        const t2 = new T.Mesh(roundBox(T, 24, 3.6, 13, 1), [side, side, label, side, side, side]);
        t2.position.set((r() - 0.5) * 2, 1.8 + k * 3.7, (r() - 0.5) * 2); t2.rotation.y = (r() - 0.5) * 0.5; g.add(lit(t2, true, true));
      }
    } else if (kind === "cone") {
      const base = new T.Mesh(roundBox(T, 16, 1.6, 16, 0.6), gloss(0xff6a10, 50, 0.05)); base.position.y = 0.8; g.add(lit(base, true, true));
      const cone = new T.Mesh(new T.CylinderGeometry(1.2, 6, 17, 18), gloss(0xff6a10, 70, 0.08)); cone.position.y = 10; g.add(lit(cone, true, true));
      const band = new T.Mesh(new T.CylinderGeometry(3.3, 4.2, 4, 18, 1, true), gloss(0xffffff, 90, 0.1)); band.position.y = 10.5; g.add(band);
    } else {                                                // a potted plant
      const pot = new T.Mesh(new T.CylinderGeometry(6, 4.6, 9, 16), gloss(0xe2589b, 60, 0.06)); pot.position.y = 4.5; g.add(lit(pot, true, true));
      const leafM = new T.MeshLambertMaterial({ color: 0x2f9a4a });
      for (let k = 0; k < 6; k++) { const lf = new T.Mesh(sph, leafM); const a = k / 6 * TAU; lf.scale.set(2.4, 7, 2.4); lf.position.set(Math.cos(a) * 3, 13, Math.sin(a) * 3); lf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); g.add(lit(lf, true, false)); }
    }
    return g;
  }
  function boxLid(T, col) {
    const c = mkCanvas(300, 220), g = c.getContext("2d"), hex = "#" + new T.Color(col).getHexString();
    g.fillStyle = hex; g.fillRect(0, 0, 300, 220);
    g.fillStyle = "rgba(255,255,255,.16)"; for (let x = -220; x < 300; x += 34) { g.beginPath(); g.moveTo(x, 220); g.lineTo(x + 220, 0); g.lineTo(x + 233, 0); g.lineTo(x + 13, 220); g.closePath(); g.fill(); }
    rrectPath(g, 24, 50, 252, 120, 24); g.fillStyle = "#0d1f5c"; g.fill(); g.lineWidth = 4; g.strokeStyle = "#fff3cf"; g.stroke();
    drawScript(g, script, 150, 110, 226, 100);
    return tex(c);
  }
  function tapeTop(T) {
    const c = mkCanvas(128, 72), g = c.getContext("2d");
    g.fillStyle = "#1b1d26"; g.fillRect(0, 0, 128, 72);
    g.fillStyle = "#f4efdf"; g.fillRect(14, 10, 100, 52);
    g.fillStyle = "#ff9214"; g.fillRect(14, 10, 100, 12);
    g.fillStyle = "#1b1d26"; g.fillRect(22, 32, 70, 4); g.fillRect(22, 42, 50, 4);
    return tex(c);
  }
  function fountain(T, x, z) {
    const g = new T.Group(); g.position.set(x, 0, z);
    const stone = gloss(0xe9e0cf, 50, 0.06), tile = gloss(0x1fa6a0, 80, 0.12);
    let m = new T.Mesh(new T.CylinderGeometry(26, 27, 7, 32), stone); m.position.y = 3.5; g.add(lit(m, true, true));
    m = new T.Mesh(new T.TorusGeometry(25, 2.2, 10, 36), tile); m.rotation.x = Math.PI / 2; m.position.y = 7.2; g.add(lit(m, true, false));
    const water = new T.Mesh(new T.CircleGeometry(23, 32).rotateX(-Math.PI / 2), new T.MeshPhongMaterial({ color: 0x3fc8ff, specular: 0xffffff, shininess: 160, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.35, transparent: true, opacity: 0.85 }));
    water.position.y = 6.4; g.add(water);
    m = new T.Mesh(new T.CylinderGeometry(4, 5.5, 16, 18), stone); m.position.y = 12; g.add(lit(m, true, false));
    m = new T.Mesh(new T.CylinderGeometry(11, 4, 4, 24), tile); m.position.y = 21; g.add(lit(m, true, false));
    const spray = new T.Mesh(new T.CylinderGeometry(0.8, 3.5, 12, 14, 1, true), new T.MeshBasicMaterial({ color: 0xcff4ff, transparent: true, opacity: 0.55, depthWrite: false }));
    spray.position.y = 29; g.add(spray);
    for (let k = 0; k < 6; k++) {                           // pennies on the bottom
      const c2 = new T.Mesh(new T.CylinderGeometry(1.6, 1.6, 0.5, 12), gloss(0xc8782a, 120, 0.3));
      const a = k * 1.1, rr = 9 + (k % 3) * 4; c2.position.set(Math.cos(a) * rr, 6.2, Math.sin(a) * rr); g.add(c2);
    }
    return g;
  }

  /* frame every stop the same way: the closest camera that keeps the whole tray and the board on screen */
  const sinP = Math.sin(CAM_PITCH), cosP = Math.cos(CAM_PITCH), tanF = Math.tan(CAM_FOV * Math.PI / 360), v = new T.Vector3();
  const fitPts = [];
  [BOARD.x1 - FRAME, BOARD.x2 + FRAME].forEach(function (x) { [BOARD.z2 + FRAME].forEach(function (z) { fitPts.push([x, FRAME_H, z], [x, -10, z]); }); });
  ledStand.updateMatrixWorld(true);
  [[-LED_W / 2 - 6, LED_HT + 9, 0], [LED_W / 2 + 6, LED_HT + 9, 0], [-SIGN_W / 2, LED_HT + 12 + SIGN_H, 0], [SIGN_W / 2, LED_HT + 12 + SIGN_H, 0]].forEach(function (q) { const w = new T.Vector3(q[0], q[1], q[2]).applyMatrix4(ledStand.matrixWorld); fitPts.push([w.x, w.y, w.z]); });
  [BOARD.x1 - FRAME, BOARD.x2 + FRAME].forEach(function (x) { fitPts.push([x, FRAME_H, BOARD.z1 - FRAME]); });
  const SAFE = { x1: 2, x2: W - 2, y1: HUD_H + 2, y2: H - 2 };
  function bounds(tx, tz, d) {
    camera.position.set(tx, d * sinP, tz + d * cosP); camera.lookAt(tx, 0, tz); camera.updateMatrixWorld();
    let x1 = 1e9, x2 = -1e9, y1 = 1e9, y2 = -1e9;
    for (let i = 0; i < fitPts.length; i++) {
      v.set(fitPts[i][0], fitPts[i][1], fitPts[i][2]).project(camera);
      const px = (v.x * 0.5 + 0.5) * W, py = (-v.y * 0.5 + 0.5) * H;
      if (px < x1) x1 = px; if (px > x2) x2 = px; if (py < y1) y1 = py; if (py > y2) y2 = py;
    }
    return { x1: x1, x2: x2, y1: y1, y2: y2 };
  }
  function centered(d) {
    let tx = 0, tz = 0, bb = null;
    const ppu = H / (2 * d * tanF);
    for (let n = 0; n < 8; n++) {
      bb = bounds(tx, tz, d);
      tx += ((bb.x1 + bb.x2) / 2 - (SAFE.x1 + SAFE.x2) / 2) / ppu;
      tz += ((bb.y1 + bb.y2) / 2 - (SAFE.y1 + SAFE.y2) / 2) / (ppu * sinP);
    }
    return { tx: tx, tz: tz, d: d, bb: bounds(tx, tz, d) };
  }
  let lo = 200, hi = 4000, fit = null;
  for (let n = 0; n < 18; n++) {
    const mid = (lo + hi) / 2, c = centered(mid);
    if (c.bb.x2 - c.bb.x1 <= SAFE.x2 - SAFE.x1 && c.bb.y2 - c.bb.y1 <= SAFE.y2 - SAFE.y1) { fit = c; hi = mid; } else lo = mid;
  }
  fit = fit || centered(4000);

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, key: key, floorMat: floorMat, levels: levels, fake: fake,
    marbles: marbles, blobs: blobs, COLS3: COLS3, shots: shots, loaded: loaded, hopper: hopper, wildMat: wildMat, icons: icons, iconMats: iconMats,
    hero: hero, heroBlob: heroBlob, fit: fit, sinP: sinP, cosP: cosP, ledFace: ledFace,
    camPos: new T.Vector3(), camTgt: new T.Vector3(), camReady: false, shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0,
    m4: new T.Matrix4(), q: new T.Quaternion(), q2: new T.Quaternion(), axis: new T.Vector3(), up: new T.Vector3(0, 1, 0),
    v: new T.Vector3(), v2: new T.Vector3(), sc: new T.Vector3(1, 1, 1), col: new T.Color(),
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, shadowsOn: true, shadowSize: 2048, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
}

/* ---------------- Kit Calloway ----------------
   A 12-year-old built at real proportions: about six and a half heads tall, with a shaped torso, hips,
   thighs and calves that taper, knees and elbows that bend, hands, sneakers and a face. Modeled in
   centimeters (156 cm to the top of the cap) and scaled to HERO_H board units. Kit faces +z; Kit's
   left is +x. Elbows and knees are solved from where the hands and feet need to be. */
const HERO_CM = 156;
function makeHero(T, o) {
  const root = new T.Group(), body = new T.Group();
  body.scale.setScalar(HERO_H / HERO_CM);
  root.add(body);
  const sph = new T.SphereGeometry(1, 22, 16);
  const skin = new T.MeshLambertMaterial({ color: 0xe6a47a });
  const hairM = new T.MeshLambertMaterial({ color: 0x4a2a14 });
  const shirtM = new T.MeshPhongMaterial({ map: o.tShirt, specular: 0x222222, shininess: 12 });
  const sleeveM = new T.MeshLambertMaterial({ color: 0xf06228 });
  const shortsM = new T.MeshLambertMaterial({ color: 0x2d5aa8 });
  const sockM = new T.MeshLambertMaterial({ color: 0xf6f6f2 });
  const shoeM = o.gloss(0xf4f4f4, 60, 0.05), soleM = new T.MeshLambertMaterial({ color: 0xdcdcdc }), stripeM = new T.MeshLambertMaterial({ color: 0xd8202a });
  const capM = o.gloss(0x1e47c8, 40, 0.05), eyeW = new T.MeshLambertMaterial({ color: 0xffffff }), eyeD = o.gloss(0x2a1608, 120, 0.2);
  const mouthM = new T.MeshLambertMaterial({ color: 0x8a2a24 });
  function add(geo, mat, parent, x, y, z, sx, sy, sz) {
    const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0);
    if (sx) m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
    m.castShadow = true; (parent || body).add(m); return m;
  }

  // torso: chest, shoulders and a waist, flattened front to back. phiStart = PI puts the shirt's front at u = 0.5
  const torsoGeo = lathe(T, [[0.01, 89], [12.4, 89], [12.9, 95], [13.0, 98], [13.7, 106], [14.9, 113], [15.5, 118], [15.0, 121], [12.2, 124.4], [7.4, 126.8], [4.8, 128], [0.01, 128.2]], 28, Math.PI);
  const chest = add(torsoGeo, shirtM, body, 0, 0, 0); chest.scale.set(1, 1, 0.66);
  // hips and shorts
  add(sph, shortsM, body, 0, 83.5, -0.5, 13.3, 11.0, 9.0);
  add(lathe(T, [[12.5, 0], [13.2, -4], [13.6, -9], [13.3, -13]], 24), shortsM, body, 0, 93, 0).scale.set(1, 1, 0.72);
  const neck = add(new T.CylinderGeometry(4.3, 4.7, 9, 14), skin, body, 0, 129.5, -0.4);

  // head
  const head = new T.Group(); head.position.set(0, 141.5, 0.4); body.add(head);
  // one shape from the crown to a rounded chin, a little deeper than it is wide
  const headG = lathe(T, [[0.01, -11.4], [3.6, -11.0], [6.0, -9.6], [7.6, -6.9], [8.6, -3.2], [9.3, 0.8], [9.5, 4.0], [8.9, 7.6], [7.0, 10.2], [3.8, 11.7], [0.01, 12.1]], 28);
  add(headG, skin, head, 0, 0, 0).scale.set(1, 1, 1.08);
  [-1, 1].forEach(function (s) {
    add(sph, skin, head, s * 9.2, -0.6, -0.4, 1.5, 2.9, 2.2);         // ears
    add(sph, eyeW, head, s * 3.5, 1.4, 9.0, 2.0, 2.3, 1.2);           // eyes
    add(sph, eyeD, head, s * 3.4, 1.2, 10.05, 1.0, 1.15, 0.55);
    const brow = add(new T.BoxGeometry(4.4, 0.9, 1.2), hairM, head, s * 3.6, 4.4, 9.0);
    brow.rotation.z = -s * 0.12;
  });
  add(sph, skin, head, 0, -1.4, 10.1, 1.5, 1.8, 1.6);                // nose
  const smile = add(new T.TorusGeometry(2.4, 0.45, 6, 16, Math.PI), mouthM, head, 0, -4.4, 9.0);
  smile.rotation.z = Math.PI;
  // a ball cap worn backward: tipped up at the front so the bangs show, brim and strap behind
  const cap = new T.Group(); cap.position.set(0, 4.6, -0.6); cap.rotation.x = -0.26; head.add(cap);
  add(new T.SphereGeometry(1, 26, 12, 0, TAU, 0, Math.PI * 0.5), capM, cap, 0, 0, 0, 11.0, 9.4, 11.6);
  add(new T.CylinderGeometry(11.05, 11.05, 1.6, 26, 1, true), o.gloss(0xffd21f, 40, 0.05), cap, 0, 0.6, 0).scale.set(1, 1, 11.65 / 11.05);
  const brim = add(new T.CylinderGeometry(8.6, 8.6, 0.9, 22, 1, false, Math.PI / 2, Math.PI), capM, cap, 0, 0.5, -9.6);
  brim.rotation.x = -0.08;
  add(sph, o.gloss(0xffd21f, 40, 0.05), cap, 0, 9.5, 0, 1.5, 0.9, 1.5);
  [-3.6, 0, 3.6].forEach(function (x, i) { add(sph, hairM, head, x, 6.4 + (i === 1 ? 0.6 : 0), 8.6 - Math.abs(x) * 0.15, 2.8, 1.7, 1.5); });
  add(sph, hairM, head, 0, 2.0, -7.2, 7.8, 6.4, 3.4);                 // hair showing under the back of the cap

  // limbs: bones are lathe profiles along +y (0 = the joint nearer the body, 1 = the far one)
  const thighG = lathe(T, [[0.01, 0], [7.2, 0.02], [7.0, 0.3], [6.1, 0.75], [5.0, 1]], 16);
  const shinG = lathe(T, [[4.8, 0], [5.3, 0.22], [4.7, 0.55], [3.5, 0.9], [3.4, 1], [0.01, 1.01]], 16);
  const upArmG = lathe(T, [[4.5, 0], [4.3, 0.4], [3.6, 1]], 14);
  const foreG = lathe(T, [[3.5, 0], [3.8, 0.25], [3.0, 0.8], [2.5, 1]], 14);
  const shortLegG = lathe(T, [[8.6, 0], [8.4, 0.6], [7.9, 1]], 16);
  const sleeveG = lathe(T, [[6.0, 0], [6.1, 0.5], [5.5, 1]], 16);
  function limb(upG, loG, upM, loM, jr1, jr2, coverG, coverM, coverLen) {
    return { up: add(upG, upM), lo: add(loG, loM), j0: add(sph, upM, body, 0, 0, 0, jr1), j1: add(sph, loM, body, 0, 0, 0, jr2),
             cover: coverG ? add(coverG, coverM) : null, coverLen: coverLen };
  }
  const legs = [limb(thighG, shinG, skin, skin, 6.6, 4.8, shortLegG, shortsM, 0.5), limb(thighG, shinG, skin, skin, 6.6, 4.8, shortLegG, shortsM, 0.5)];
  const arms = [limb(upArmG, foreG, skin, skin, 4.6, 3.6, sleeveG, sleeveM, 0.42), limb(upArmG, foreG, skin, skin, 4.6, 3.6, sleeveG, sleeveM, 0.42)];
  legs.forEach(function (L) { L.j0.visible = false; });       // the hip joint is inside the shorts
  arms.forEach(function (L) { L.j0.material = sleeveM; L.j0.scale.setScalar(6.0); });
  // sneakers and socks, at the ankles
  const feet = [-1, 1].map(function () {
    const f = new T.Group(); body.add(f);
    add(new T.CylinderGeometry(3.7, 3.6, 6, 12), sockM, f, 0, 3.5, 0);
    add(sph, shoeM, f, 0, 3.4, 4.0, 4.8, 3.9, 10.2);
    add(sph, soleM, f, 0, 1.3, 4.0, 5.0, 1.4, 10.6);
    add(roundBox(T, 9.9, 1.2, 9, 0.5), stripeM, f, 0, 3.2, 1.0);
    return f;
  });
  // hands: a palm and a thumb, gripping
  const hands = [-1, 1].map(function (s) {
    const h = new T.Group(); body.add(h);
    add(sph, skin, h, 0, 0, 0, 2.7, 3.9, 3.2);
    add(sph, skin, h, s * 1.8, 1.0, 1.6, 1.2, 2.4, 1.2).rotation.z = s * 0.5;
    return h;
  });

  // the launcher: Grandpa's Big Shooter. Held at the waist, pointing where Kit is aiming
  const gun = new T.Group(); gun.position.set(-8, 96, 26); body.add(gun);
  const blue = o.gloss(0x2f7bff, 110, 0.18), yellow = o.gloss(0xffd21f, 110, 0.18), orange = o.gloss(0xff8a1e, 110, 0.18), dark = o.gloss(0x1b1d26, 60, 0.1);
  const tube = add(new T.CylinderGeometry(9.2, 10.2, 44, 26), blue, gun, 0, 0, 0); tube.rotation.x = Math.PI / 2;
  const bell = add(new T.CylinderGeometry(12.6, 9.2, 9, 26, 1, true), yellow, gun, 0, 0, 26); bell.rotation.x = Math.PI / 2;
  add(new T.TorusGeometry(12.4, 2.0, 10, 28), yellow, gun, 0, 0, 30.4);
  add(new T.CircleGeometry(9.4, 22), dark, gun, 0, 0, 23.5);
  add(sph, orange, gun, 0, 0, -22, 10.2, 10.2, 5);
  [-12, 8].forEach(function (z) { add(new T.TorusGeometry(10.1, 1.5, 8, 26), orange, gun, 0, 0, z); });
  const gripF = add(roundBox(T, 4.6, 14, 5.4, 1.6), dark, gun, 0, -14, 4); gripF.rotation.x = 0.1;
  const gripR = add(roundBox(T, 4.6, 15, 6.0, 1.8), dark, gun, 0, -15, -14); gripR.rotation.x = -0.32;
  add(roundBox(T, 3.4, 3.2, 18, 1.2), dark, gun, 0, 11.4, 2);                         // carry handle
  const cup = add(new T.CylinderGeometry(7.4, 6.2, 7, 22, 1, true), new T.MeshPhongMaterial({ color: 0xbfe8ff, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false }), gun, 0, 14.4, -12);
  cup.castShadow = false;
  // the wordmark on both sides of the tube
  const markM = new T.MeshLambertMaterial({ map: o.tScript, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  [-1, 1].forEach(function (s) {
    const pl = new T.Mesh(new T.PlaneGeometry(30, 30 / o.sAspect), markM);
    pl.position.set(s * 10.3, 0, 0); pl.rotation.y = s * Math.PI / 2; pl.renderOrder = 3; gun.add(pl);
  });
  const muzzleAt = new T.Object3D(); muzzleAt.position.set(0, 0, 33); gun.add(muzzleAt);
  const hopperAt = new T.Object3D(); hopperAt.position.set(0, 17.6, -12); gun.add(hopperAt);

  return { root: root, body: body, head: head, chest: chest, gun: gun, legs: legs, arms: arms, feet: feet, hands: hands,
           gripF: new T.Vector3(0, -8, 4), gripR: new T.Vector3(0, -9.5, -12.5), muzzleAt: muzzleAt, hopperAt: hopperAt,
           t: { a: new T.Vector3(), b: new T.Vector3(), e: new T.Vector3(), d: new T.Vector3(), q: new T.Vector3(), p: new T.Vector3(), up: new T.Vector3(0, 1, 0) } };
}

// Elbow or knee: the joint between A and B for bones l1 and l2, bent toward "pole".
function bendJoint(t, A, B, pole, l1, l2, out) {
  t.d.subVectors(B, A);
  let d = t.d.length();
  if (d < 1e-4) { t.d.set(0, -1, 0); d = 1e-4; } else t.d.multiplyScalar(1 / d);
  const dm = Math.min(d, (l1 + l2) * 0.999), a = (l1 * l1 - l2 * l2 + dm * dm) / (2 * dm), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  t.q.copy(pole).addScaledVector(t.d, -pole.dot(t.d));
  if (t.q.lengthSq() < 1e-6) t.q.set(0, 0, 1);
  t.q.normalize();
  out.copy(A).addScaledVector(t.d, a).addScaledVector(t.q, h);
}
function boneTo(t, mesh, A, B) {
  t.d.subVectors(B, A);
  const l = t.d.length() || 1e-4;
  mesh.position.copy(A);
  mesh.quaternion.setFromUnitVectors(t.up, t.d.multiplyScalar(1 / l));
  mesh.scale.set(1, l, 1);
}
function setLimb(Hh, L, A, B, pole, l1, l2) {
  const t = Hh.t;
  bendJoint(t, A, B, pole, l1, l2, t.e);
  boneTo(t, L.up, A, t.e); boneTo(t, L.lo, t.e, B);
  L.j0.position.copy(A); L.j1.position.copy(t.e);
  if (L.cover) { t.p.copy(t.e).sub(A).multiplyScalar(L.coverLen).add(A); boneTo(t, L.cover, A, t.p); }
}
const POLE = { knee: null };
// Pose Kit: stance, breathing, recoil. Everything here is in Kit's own (centimeter) space.
function poseHero(Hh, k, breathe, recoil) {
  const T = THREE, t = Hh.t;
  if (!POLE.knee) {
    POLE.knee = new T.Vector3(0.15, 0, 1); POLE.elL = new T.Vector3(1, -0.7, -0.5); POLE.elR = new T.Vector3(-1, -0.7, -0.6);
    POLE.sh = new T.Vector3(); POLE.hip = new T.Vector3(); POLE.ank = new T.Vector3(); POLE.g = new T.Vector3();
  }
  const bob = breathe * 0.6;
  Hh.chest.scale.y = 1 + breathe * 0.006;
  Hh.head.position.y = 141.5 + bob * 0.9;
  Hh.gun.position.set(-8, 96 + bob * 0.5, 26 - recoil * 4);
  Hh.gun.rotation.x = -recoil * 0.08;
  // legs: hips a little apart, Kit's left foot a step forward
  for (let s = 0; s < 2; s++) {
    const sg = s ? 1 : -1;                                   // 0 = right (-x), 1 = left (+x)
    POLE.hip.set(sg * 7.4, 80, 0);
    POLE.ank.set(sg * 10.5, 8, sg > 0 ? 5 : -5);
    setLimb(Hh, Hh.legs[s], POLE.hip, POLE.ank, POLE.knee, 37.5, 36);
    Hh.feet[s].position.set(POLE.ank.x, 0, POLE.ank.z - 3);
    Hh.feet[s].rotation.y = sg * 0.18;
  }
  // arms: right hand on the rear grip, left hand on the front grip
  Hh.gun.updateMatrix();
  for (let s = 0; s < 2; s++) {
    const sg = s ? 1 : -1;
    POLE.sh.set(sg * 15.0, 120 + bob, -0.6);
    POLE.g.copy(s ? Hh.gripF : Hh.gripR).applyMatrix4(Hh.gun.matrix);
    setLimb(Hh, Hh.arms[s], POLE.sh, POLE.g, s ? POLE.elL : POLE.elR, 25, 23.5);
    Hh.hands[s].position.copy(POLE.g);
    Hh.hands[s].rotation.set(0.2, sg * -0.3, 0);
  }
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
// pr = pixel ratio cap, sh = shadow map size (0 = no shadow maps: soft painted shadows stand in)
const QUALITY = [{ pr: 2, sh: 2048 }, { pr: 1.5, sh: 1024 }, { pr: 1.15, sh: 1024 }, { pr: 1, sh: 0 }];

function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  const sh = QUALITY[R.quality].sh, on = sh > 0;
  if (on && sh !== R.shadowSize) {
    R.shadowSize = sh;
    R.key.shadow.mapSize.set(sh, sh);
    if (R.key.shadow.map) { R.key.shadow.map.dispose(); R.key.shadow.map = null; }
  }
  if (on !== R.shadowsOn) {
    R.shadowsOn = on;
    R.key.castShadow = on;
    for (let i = 0; i < R.fake.length; i++) R.fake[i].visible = !on;
    R.blobs.visible = !on;
  }
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
  R.shakeMag = Math.max(R.shakeT > 0 ? R.shakeMag : 0, mag); R.shakeDur = R.shakeT = dur;
}

/* ---------------- Board <-> screen, through the 3D camera ---------------- */
function boardToScreen(x, z, hgt) {
  if (!R) return { x: W / 2 + x * 0.9, y: H / 2 + z * 0.9, ok: true };
  R.v.set(x, hgt || 0, z).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1 };
}
// HUD pixel -> the board point under it at height hgt (null above the horizon).
function screenToBoard(px, py, hgt) {
  if (!R) return null;
  const cam = R.camera;
  R.v.set(px / W * 2 - 1, 1 - py / H * 2, 0.5).unproject(cam);
  R.v2.copy(R.v).sub(cam.position);
  if (R.v2.y > -1e-6) return null;
  const t = ((hgt || 0) - cam.position.y) / R.v2.y;
  return { x: cam.position.x + R.v2.x * t, z: cam.position.z + R.v2.z * t };
}
function heroScreenR() {
  const sp = shooterPos(), a = boardToScreen(sp.x, sp.z, HERO_H * 0.5), b = boardToScreen(sp.x + 24, sp.z, HERO_H * 0.5);
  return Math.abs(b.x - a.x);
}

/* ---------------- Game state -> meshes ---------------- */
function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
function setMarble(n, x, y, z, b, p, sc, ci) {
  const Rr = R;
  Rr.axis.set(p.tz, 0, -p.tx);
  if (Rr.axis.lengthSq() < 1e-6) Rr.axis.set(1, 0, 0); else Rr.axis.normalize();
  Rr.q.setFromAxisAngle(Rr.axis, b.s / BR + b.spin);
  Rr.q2.setFromAxisAngle(Rr.up, b.tilt);
  Rr.q.multiply(Rr.q2);
  Rr.v.set(x, y, z); Rr.sc.set(sc, sc, sc);
  Rr.m4.compose(Rr.v, Rr.q, Rr.sc);
  Rr.marbles.setMatrixAt(n, Rr.m4);
  Rr.marbles.setColorAt(n, Rr.COLS3[ci] || Rr.COLS3[0]);
  if (Rr.blobs.visible) {
    const k = clamp(1 - (y - BR) / 30, 0.2, 1) * sc;
    Rr.v.set(x + 2, 0.45, z - 1.5); Rr.q.identity(); Rr.sc.set(D * 1.3 * k, 1, D * 1.3 * k);
    Rr.m4.compose(Rr.v, Rr.q, Rr.sc);
    Rr.blobs.setMatrixAt(n, Rr.m4);
  }
}
const POPB = { s: 0, spin: 0, tilt: 0 }, NOTAN = { tx: 1, tz: 0 };

function syncScene(state, fdt) {
  const idle = state === "title" || state === "over";
  let i;
  R.clock += fdt;
  ledTick(fdt);
  const li = S.level, th = THEMES[LEVELS[li].theme];
  if (V.lastLevel !== li) {
    V.lastLevel = li;
    for (i = 0; i < R.levels.length; i++) R.levels[i].grp.visible = i === li;
    R.renderer.setClearColor(th.room, 1);
    R.floorMat.color.setHex(th.room).multiplyScalar(0.8);
    R.dirty = true;
  }
  if (!idle && state !== "paused") V.intro = Math.max(0, V.intro - fdt / 1.4);

  /* the chain */
  const C = S.chain, M = R.marbles, DRe = P.L - 19 + BR;
  let n = 0, ic = 0;
  for (i = 0; i < C.length && n < 200; i++) {
    const b = C[i];
    if (b.s < -BR * 1.3) continue;
    const p = posAt(P, b.s, TMP);
    let x = p.x, z = p.z, y = BR;
    if (b.s > DRe) y = BR - (b.s - DRe) * 0.95;            // tipping into the drain
    if (b.ins) {
      const e = ease(b.it / INS_T);
      x = b.fx + (x - b.fx) * e; z = b.fz + (z - b.fz) * e; y = b.fy + (y - b.fy) * e;
    }
    let sc = 1;
    if (b.power && !Shell.reduced) sc = 1 + 0.06 * Math.sin(R.clock * 9);
    setMarble(n++, x, y, z, b, p, sc, b.c);
    if (b.power && b.s > -4 && ic < R.icons.length) {
      const sp = R.icons[ic++], late = b.pt > POWER_LIFE - 3;
      sp.visible = !late || Math.floor(R.clock * 6) % 2 === 0;
      sp.material = R.iconMats[b.power];
      sp.position.set(x, y + BR * 1.7, z + 2);
      const k = 19 + (Shell.reduced ? 0 : Math.sin(R.clock * 6) * 1.5);
      sp.scale.set(k, k, 1);
    }
  }
  for (; ic < R.icons.length; ic++) R.icons[ic].visible = false;
  for (i = 0; i < S.popping.length && n < 210; i++) {        // pops swell for a moment and vanish
    const q = S.popping[i];
    POPB.s = q.t * 30; POPB.spin = q.spin; POPB.tilt = q.tilt;
    setMarble(n++, q.x, BR + q.t * 20, q.z, POPB, NOTAN, 1 + q.t * 4.5, q.c);
  }
  M.count = n; M.instanceMatrix.needsUpdate = true;
  if (M.instanceColor) M.instanceColor.needsUpdate = true;
  if (R.blobs.visible) { R.blobs.count = n; R.blobs.instanceMatrix.needsUpdate = true; }

  /* marbles in the air */
  for (i = 0; i < R.shots.length; i++) {
    const m = R.shots[i], sh = S.shots[i];
    m.visible = !!sh;
    if (!sh) continue;
    paintSingle(m, sh);
    m.position.set(sh.x, sh.y, sh.z);
    m.scale.setScalar(0.62 + 0.38 * clamp(sh.t / 0.07, 0, 1));
    m.rotation.set(sh.t * 30, 0, 0);
  }

  /* Kit */
  const H0 = R.hero, sp = shooterPos();
  H0.root.position.set(sp.x, 0, sp.z);
  let want = S.aim;
  if (idle) want = -Math.PI / 2 + Math.sin(idleT * 0.6) * 0.7;
  const target = Math.atan2(Math.cos(want), Math.sin(want));
  let da = target - V.heroA;
  while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
  V.heroA += da * Math.min(1, fdt * (idle ? 4 : 22));
  H0.root.rotation.y = V.heroA;
  poseHero(H0, 0, Shell.reduced ? 0 : Math.sin(R.clock * 2.4), S.recoil || 0);
  H0.root.updateMatrixWorld(true);
  const playing = S.mode === "play" || S.mode === "intro" || idle;
  const reload = clamp(1 - S.fireCd / SHOT_GAP, 0, 1), pop = 1 + (S.swapT || 0) * 0.35;
  R.loaded.visible = playing && reload > 0.05;
  if (R.loaded.visible) {
    H0.muzzleAt.getWorldPosition(R.loaded.position);
    R.loaded.scale.setScalar(0.62 * reload * pop);
    paintSingle(R.loaded, S.cur);
    R.loaded.rotation.y = R.clock * 1.5;
  }
  R.hopper.visible = playing;
  if (R.hopper.visible) {
    H0.hopperAt.getWorldPosition(R.hopper.position);
    R.hopper.scale.setScalar(0.5 * pop);
    paintSingle(R.hopper, S.next);
    R.hopper.rotation.y = -R.clock;
  }
  if (R.heroBlob.visible) R.heroBlob.position.set(sp.x + 4, 0.4, sp.z - 2);

  /* the drain glows as the chain closes in */
  const glow = R.levels[li].glow;
  const dz = S.mode === "lose" ? 1 : (S.danger || 0), pulse = Shell.reduced ? 0.8 : 0.6 + 0.4 * Math.sin(R.clock * (6 + dz * 8));
  glow.material.opacity = 0.18 + dz * 0.75 * pulse;
  glow.material.color.setHex(dz > 0.05 ? 0xff3322 : 0xffc21a);

  /* camera: the whole tray, swooping in at the start of each stop */
  const f = R.fit;
  let d = f.d, yaw = 0, rate = 6;
  if (idle) { if (!Shell.reduced) { yaw = Math.sin(idleT * 0.25) * 0.07; d *= 1 + Math.sin(idleT * 0.31) * 0.012; } rate = 3; }
  else if (V.intro > 0 && !Shell.reduced) { const k = ease(V.intro); d *= 1 + 0.5 * k; yaw += 0.55 * k; rate = 12; }
  if (S.mode === "clear" && !Shell.reduced) { const k = Math.min(1, S.modeT / 0.8); d *= 1 - 0.05 * k; yaw += Math.sin(S.modeT * 0.9) * 0.05 * k; }
  const gx = f.tx + Math.sin(yaw) * d * R.cosP, gz = f.tz + Math.cos(yaw) * d * R.cosP, gy = d * R.sinP;
  if (!R.camReady) { R.camPos.set(gx, gy, gz); R.camTgt.set(f.tx, 0, f.tz); R.camReady = true; }
  else { const kk = 1 - Math.exp(-rate * fdt); R.camPos.x += (gx - R.camPos.x) * kk; R.camPos.y += (gy - R.camPos.y) * kk; R.camPos.z += (gz - R.camPos.z) * kk; R.camTgt.set(f.tx, 0, f.tz); }
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (Math.random() * 2 - 1) * m; sy = (Math.random() * 2 - 1) * m;
  }
  if (V.camOverride) { R.camPos.fromArray(V.camOverride.pos); R.camTgt.fromArray(V.camOverride.tgt); }
  R.camera.position.set(R.camPos.x + sx, R.camPos.y + sy, R.camPos.z);
  R.camera.lookAt(R.camTgt.x + sx, R.camTgt.y + sy, R.camTgt.z);
  R.camera.updateMatrixWorld();
}
function paintSingle(m, shot) {
  if (shot.wild) { m.material = R.wildMat; return; }
  m.material = m.userData.own;
  m.material.color.copy(R.COLS3[shot.c] || R.COLS3[0]);
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
const RAINBOW = ["#ff3b30", "#ff9214", "#ffd21f", "#35d04a", "#2fe6ff", "#2f7bff", "#a45cff"];
function marbleIcon(c, x, y, r, shot) {
  c.save();
  c.beginPath(); c.arc(x, y, r + 1.5, 0, TAU); c.fillStyle = "#08205f"; c.fill();
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
  if (shot.wild) {
    const off = (S.t || idleT) * 2;
    for (let k = 0; k < 7; k++) { c.fillStyle = RAINBOW[k]; c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, off + k / 7 * TAU, off + (k + 1) / 7 * TAU); c.closePath(); c.fill(); }
  } else {
    const hex = COLORS[shot.c].hex, g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, shade(hex, 0.55)); g.addColorStop(0.45, hex); g.addColorStop(1, shade(hex, -0.45));
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = r * 0.22;
    c.beginPath(); c.moveTo(x - r, y + r * 0.1); c.quadraticCurveTo(x, y - r * 0.5, x + r, y + r * 0.1); c.stroke();
  }
  c.fillStyle = "rgba(255,255,255,.8)"; c.beginPath(); c.ellipse(x - r * 0.35, y - r * 0.42, r * 0.28, r * 0.18, -0.5, 0, TAU); c.fill();
  c.restore();
}

function drawAim(c) {
  const m = muzzle(), dx = Math.cos(S.aim), dz = Math.sin(S.aim), C = S.chain;
  let len = 0, hitAt = -1;
  for (len = 0; len < 420; len += 5) {
    const x = m.x + dx * len, z = m.z + dz * len;
    if (x < BOARD.x1 || x > BOARD.x2 || z < BOARD.z1 || z > BOARD.z2) break;
    let hit = false;
    for (let i = 0; i < C.length; i++) {
      if (C[i].s < -2) continue;
      const p = posAt(P, C[i].s, TMP);
      if ((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < D * D * 0.85) { hit = true; break; }
    }
    if (hit) { hitAt = len; break; }
  }
  const col = S.cur.wild ? RAINBOW[Math.floor(S.t * 10) % RAINBOW.length] : COLORS[S.cur.c].hex;
  const ph = Shell.reduced ? 0 : (S.t * 60) % 16;
  for (let d = 4 + ph; d < len; d += 16) {
    const q = boardToScreen(m.x + dx * d, m.z + dz * d, BR + (m.y - BR) * Math.max(0, 1 - d / 70)), a = clamp(1 - d / 440, 0.25, 1);
    c.globalAlpha = a;
    c.fillStyle = "rgba(8,32,95,.7)"; c.beginPath(); c.arc(q.x, q.y, 3.4, 0, TAU); c.fill();
    c.fillStyle = col; c.beginPath(); c.arc(q.x, q.y, 2.4, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
  if (hitAt >= 0) {
    const q = boardToScreen(m.x + dx * hitAt, m.z + dz * hitAt, BR), r = 7 + (Shell.reduced ? 0 : Math.sin(S.t * 10) * 1.5);
    c.lineWidth = 2.5; c.strokeStyle = "#08205f"; c.beginPath(); c.arc(q.x, q.y, r + 1, 0, TAU); c.stroke();
    c.lineWidth = 1.6; c.strokeStyle = col; c.beginPath(); c.arc(q.x, q.y, r, 0, TAU); c.stroke();
  }
}

function drawSwap(c) {
  const b = SWAP_BOX;
  rrect(c, b.x, b.y, b.w, b.h, 10); c.fillStyle = "rgba(8,32,95,.84)"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = "#ffffff"; c.stroke();
  const bump = 1 + (S.swapT || 0) * 0.2;
  marbleIcon(c, b.x + 28, b.y + 28, 17 * bump, S.cur);
  marbleIcon(c, b.x + 74, b.y + 24, 10, S.next);
  txt(c, "NEXT", b.x + 74, b.y + 37, 8, "#a8ecff", "center");
  txt(c, "TAP TO SWAP", b.x + b.w / 2, b.y + b.h - 11, 8, "#ffe45c", "center");
  // power-ups running right now
  const chips = [];
  if (S.slowT > 0) chips.push(["SLOW " + Math.ceil(S.slowT), "#3ff0ff"]);
  if (S.revT > 0) chips.push(["REWIND", "#ff3fa4"]);
  if (S.cur.wild) chips.push(["WILD SHOT", "#ffd23f"]);
  for (let i = 0; i < chips.length; i++) {
    const y = b.y - 22 - i * 22;
    rrect(c, b.x, y, 84, 18, 9); c.fillStyle = "rgba(8,32,95,.84)"; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = chips[i][1]; c.stroke();
    txt(c, chips[i][0], b.x + 42, y + 4, 9, chips[i][1], "center");
  }
}

function drawHUD(c, state) {
  const lv = LEVELS[S.level];
  const bg = c.createLinearGradient(0, 0, 0, HUD_H - 6);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, 0, W, HUD_H - 6);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff9214"; c.fillRect(0, HUD_H - 6, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, HUD_H - 4, W, 1);
  txt(c, "SCORE", 8, 5, 9, "#a8ecff", "left", "#08205f");
  txt(c, String(S.score), 8, 16, 17, "#ffe45c", "left", "#08205f");
  txt(c, "STOP " + (S.level + 1) + "/" + LEVELS.length, W / 2, 5, 9, "#a8ecff", "center", "#08205f");
  c.font = "bold 12px " + HUD_FONT;
  const nm = lv.name, sz = c.measureText(nm).width > 150 ? 10 : 12;
  txt(c, nm, W / 2, 18, sz, "#ffffff", "center", "#08205f");
  txt(c, "LIVES", W - 8, 5, 9, "#a8ecff", "right", "#08205f");
  for (let i = 0; i < Math.min(LIVES_MAX, S.lives); i++) marbleIcon(c, W - 14 - i * 15, 25, 5.5, { c: i % COLORS.length, wild: false });
  // how much of the jar is cleared on this stop
  const total = lv.count, done = clamp(total - S.toSpawn - S.chain.length, 0, total), x = 8, y = 37, w = W - 16, hh = 8;
  rrect(c, x, y, w, hh, 4); c.fillStyle = "#08205f"; c.fill();
  const fr = S.demo ? 0 : done / total;
  if (fr > 0) {
    c.save(); rrect(c, x, y, w, hh, 4); c.clip();
    const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, "#9bff3f"); g.addColorStop(1, "#3ff0ff");
    c.fillStyle = g; c.fillRect(x, y, w * fr, hh); c.restore();
  }
  if (S.danger > 0) {
    c.lineWidth = 1.5; c.strokeStyle = "rgba(255,59,48," + (0.5 + 0.5 * Math.sin(S.t * 10)).toFixed(2) + ")";
    rrect(c, x, y, w, hh, 4); c.stroke();
  } else { c.lineWidth = 1; c.strokeStyle = "rgba(255,255,255,.5)"; rrect(c, x, y, w, hh, 4); c.stroke(); }
}

function draw(c, state) {
  if (!R || !R.hud) return;
  Sound.pump();
  const now = performance.now();
  let ms = now - R.lastT;
  R.lastT = now;
  if (!(ms > 0)) ms = 0;
  const sized = layout();
  if (state === "paused" && !R.dirty) return;              // nothing moves while paused: leave the last frame up
  if (state === "playing") watchFrameRate(ms);
  if (sized) {
    syncScene(state, state === "paused" ? 0 : Math.min(ms, 50) / 1000);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  // the danger glow at the edges of the screen
  if (S.danger > 0 && state === "playing") {
    const a = S.danger * (Shell.reduced ? 0.3 : 0.22 + 0.16 * Math.sin(S.t * 9));
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.7);
    g.addColorStop(0, "rgba(255,40,30,0)"); g.addColorStop(1, "rgba(255,40,30," + a.toFixed(3) + ")");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  if (state === "playing" && (S.mode === "play" || S.mode === "intro")) drawAim(c);
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    c.globalAlpha = clamp(q.life * 2.5, 0, 1);
    c.fillStyle = q.c;
    if (q.kind) { c.beginPath(); c.arc(q.x, q.y, q.w, 0, TAU); c.fill(); }
    else { c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.fillRect(-q.w, -q.w * 0.6, q.w * 2, q.w * 1.2); c.restore(); }
  }
  c.globalAlpha = 1;
  for (let i = 0; i < floats.length; i++) {
    const f = floats[i];
    if (f.t < 0) continue;
    const p = boardToScreen(f.x, f.z, BR + 8);
    c.globalAlpha = clamp(1.4 - f.t * 1.3, 0, 1);
    txt(c, f.txt, clamp(p.x, 50, W - 50), p.y - 14 - f.t * 34, f.size, f.col, "center", "#08205f");
  }
  c.globalAlpha = 1;
  drawHUD(c, state);
  if (state === "playing" && (S.mode === "play" || S.mode === "intro")) drawSwap(c);
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
  const bar = document.createElement("div");                // a row of marbles rolling while the board loads
  bar.setAttribute("aria-hidden", "true");
  bar.style.cssText = "display:flex;gap:8px;height:14px";
  ["#ff3b30", "#2f7bff", "#ffd21f", "#35d04a", "#a45cff"].forEach(function (col, i) {
    const d = document.createElement("span");
    d.style.cssText = "width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff 0,#fff 12%," + col + " 45%,#0b1640 100%);" +
      "opacity:.35;animation:npgDot 1s " + (i * 0.14) + "s infinite ease-in-out";
    bar.appendChild(d);
  });
  const st = document.createElement("style");
  st.textContent = "@keyframes npgDot{0%,100%{opacity:.35;transform:translateY(0)}40%{opacity:1;transform:translateY(-6px)}}" +
    "@media (prefers-reduced-motion: reduce){#npg-splash span{animation:none!important;opacity:.8!important}}";
  el.appendChild(st);
  el.appendChild(bar);
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

function attach() {
  const hud = document.getElementById("np-canvas"), stage = document.getElementById("np-stage");
  R.hud = hud; R.stage = stage;
  if (getComputedStyle(stage).position === "static") stage.style.position = "relative";
  const gl = R.gl;
  gl.style.cssText = "position:absolute;left:0;top:0;z-index:0;display:block;margin:0;padding:0;border:0;box-shadow:none;" +
    "max-width:none;max-height:none;transform:none;image-rendering:auto;pointer-events:none;touch-action:none;" +
    "border-radius:" + getComputedStyle(hud).borderRadius;
  stage.insertBefore(gl, hud);
  hud.style.background = "transparent";                   // the shell canvas becomes a clear HUD layer over the 3D view
  hud.style.touchAction = "none";
  if (getComputedStyle(hud).position === "static") hud.style.position = "relative";
  const crt = stage.querySelector(".np-crt");
  if (crt) crt.style.display = "none";                       // glossy board, no scanlines
  R.lastT = performance.now();
  layout();
}

function logoImg(w) {
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
  im.style.cssText = "display:block;width:" + w + ";height:auto;margin:0 auto 6px";
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_URL;
  return im;
}

function startGame() {
  Shell.init({
    slug: "marble-drop",
    title: "MARBLE DROP",
    accent: "#ffd23f",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "Grandpa's jar of giant marbles spilled, and they're rolling for every drain in town. Help Kit pop them: tap to aim and shoot, match 3 or more of a color before the chain reaches the drain.",
    keys: "Keys: left and right aim, Space shoots, Down or X swaps. Mouse: point and click, right click swaps. P pause, M mute, N music, R restart.",
    tip: "Tap Kit or the marble box to swap. Close a gap with matching ends for a chain reaction.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { if (paused) return; idleT += dt; updateParts(dt); },
    onPause: function () { paused = true; keys = {}; S.drag = null; },
    onResume: function () { paused = false; }
  });
  attach();
  // Sound. Nothing is created until the first tap, click or key press; the music starts with the game.
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Sound.unlock, true); });
  Shell.onStart(function () { Sound.newGame(); levelIntro(false); });
  Shell.onRestart(function () { Sound.newGame(); levelIntro(false); });
  Shell.onResume(Sound.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));   // not while initials are being typed
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Sound.toggleMusic();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) {
    titleCard.insertBefore(logoImg("clamp(72px,16vh,120px)"), titleCard.firstChild);
    Sound.button(titleCard, titleCard.querySelector(".np-tip"));
  }
  if (pauseActions) Sound.button(pauseActions, pauseActions.querySelector("a"));
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) card.insertBefore(logoImg("clamp(64px,14vh,104px)"), card.firstChild);
}

// Hook for automated checks (no effect on play)
window.__marbleDrop = { S: function () { return S; }, LEVELS: LEVELS, PATHS: PATHS, posAt: posAt, fire: fire, swap: swap, stepChain: stepChain,
                        matchAt: matchAt, gfx: function () { return R; }, led: function () { return LED; }, sound: Sound, startMusic: startMusic,
                        toScreen: boardToScreen, toBoard: screenToBoard, setupLevel: setupLevel, D: D, view: V, update: update, shooterPos: shooterPos, muzzle: muzzle };

(function boot() {
  const splash = makeSplash();
  const t0 = performance.now();
  const q = /[?&]gfx=(high|low)/.exec(location.search);
  Promise.all([loadLogo(splash), import(THREE_URL).then(null, function (e) { e.npStage = "three"; throw e; }), loadImage(SCRIPT_URL)])
    .then(function (res) {
      THREE = res[1];
      try { R = buildScene(THREE, res[2]); } catch (e) { e.npStage = "webgl"; throw e; }
      if (q) { R.qLock = true; setQuality(q[1] === "low" ? QUALITY.length - 1 : 0); }
      reset();
      try { syncScene("title", 0); R.renderer.compile(R.scene, R.camera); } catch (e) { /* warm-up only */ }
      const hold = Math.max(0, 1300 - (performance.now() - t0));
      return new Promise(function (r) { setTimeout(r, hold); });
    })
    .then(function () {
      startGame();
      splash.el.style.opacity = "0";
      splash.el.style.pointerEvents = "none";
      setTimeout(function () { if (splash.el.parentNode) splash.el.parentNode.removeChild(splash.el); }, 420);
    })
    .catch(function (e) {
      console.error(e);
      splashFail(splash, e && e.npStage === "three"
        ? "Marble Drop could not load its 3D engine (" + THREE_URL + ")."
        : "Marble Drop needs WebGL for its 3D board, and this browser has it switched off or does not support it.");
    });
})();
