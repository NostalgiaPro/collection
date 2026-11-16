/* SHIFT RACING (3D): arcade street racing where the gear shifts are the whole game.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a WebGL canvas that sits
   directly under the shell's 2D canvas. The shell canvas stays in charge of scaling and the title / pause / game over
   flow, and carries the HUD (tachometer, positions, the LED strip, the touch buttons).

   Three circuits (Midnight Loop, Route 88, Neon Boardwalk), 3 laps against 5 drivers, plus a quarter mile drag.
   Hold the gas and shift up when the needle is in the green. Perfect shifts give a burst of speed, early and late
   shifts lose some, and sitting on the redline cuts the power until you shift.

   Everything in here is original: cars, drivers, tracks, music and names. All art is painted in code; the only
   image files are the two Nostalgia Pro Games logos (full logo on the splash, title and score card, the script
   wordmark on everything in the world). */

const W = 360, H = 540, TAU = Math.PI * 2;
const SLUG = "shift-racing";
const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash, title card, score card
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: billboards, cars, boards, the arcade
const THREE_URL = "../shared/three.module.min.js";
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';
const EVENT_KEY = "event";                                // Shell.save key for the last event picked

/* ---------------- Engine and gearbox ---------------- */
const IDLE = 900, REDLINE = 8000;
const GREEN_LO = 6800, GREEN_HI = 7600, EARLY_RPM = 6000;  // the shift zone on the tach
const LAUNCH_LO = 4800, LAUNCH_HI = 6400;                 // the launch zone (revs held at the start)
const GEAR_TOP = [0, 17, 29, 41, 52, 62, 72];             // m/s at the redline in each gear (N, 1-6)
const GEAR_PULL = [0, 12, 8.6, 6.4, 4.9, 3.9, 3.2];       // peak drive, m/s per second, in each gear
const DRAG_K = 0.00042, ROLL = 0.15, BRAKE = 15, ENGINE_BRAKE = 1.3;
const SHIFT_T = 0.14;                                     // clutch time: no drive while the gear changes
const PERFECT_KICK = 1.0, PERFECT_BOOST = 2.4, PERFECT_T = 0.6;
const MPH = 2.23694;

/* ---------------- Track ---------------- */
const ROAD = 8, CURB = 0.9, WALL = 11.5;                  // half widths, meters
const CAR_L = 4.4, CAR_W = 1.95;
const LAPS = 3;
const GRIP = 21, ASSIST = 0.5;                            // lateral grip before the tires let go; how much the road steers for you
const DRAG_LEN = 402.336, DRAG_START = 60;                // a quarter mile, and where the line sits on the strip

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, k) { return a + (b - a) * k; }
function mod(a, n) { return ((a % n) + n) % n; }
function torque(r) {                                      // the engine's pull across the rev range, 0..1
  if (r < 1500) return 0.5;
  if (r < 6000) return 0.5 + 0.5 * (r - 1500) / 4500;
  if (r < 7400) return 1;
  return 1 - 0.18 * Math.min(1, (r - 7400) / 600);
}
function rng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- Events ----------------
   A circuit is drawn like a turtle: S = straight (meters), L / R = arc (radius, degrees). Every layout closes on
   itself exactly and stays at least 50 m clear of itself. */
const EVENTS = [
  { id: "city", name: "MIDNIGHT LOOP", sub: "City night", kind: "circuit", theme: "city", par: 150,
    spec: [["S", 220], ["L", 45, 90], ["S", 160], ["L", 40, 90], ["S", 60], ["L", 32, 90], ["S", 50], ["R", 32, 90], ["S", 56],
           ["R", 32, 90], ["S", 50], ["L", 40, 90], ["S", 60], ["L", 45, 90], ["S", 165], ["L", 45, 90], ["S", 85]] },
  { id: "desert", name: "ROUTE 88", sub: "Desert highway", kind: "circuit", theme: "desert", par: 150,
    spec: [["S", 420], ["L", 95, 120], ["S", 130], ["L", 80, 60], ["S", 110], ["R", 90, 50], ["L", 90, 50], ["S", 170],
           ["L", 85, 90], ["S", 189.4], ["L", 85, 90], ["S", 49.9]] },
  { id: "board", name: "NEON BOARDWALK", sub: "Boardwalk night", kind: "circuit", theme: "board", par: 150,
    spec: [["S", 300], ["L", 55, 180], ["S", 70], ["R", 42, 90], ["S", 70], ["L", 42, 90], ["S", 110], ["L", 42, 90], ["S", 70],
           ["R", 42, 90], ["S", 40], ["L", 55, 180], ["S", 88]] },
  { id: "drag", name: "QUARTER MILE", sub: "Drag strip", kind: "drag", theme: "drag", par: 13,
    spec: [["S", 900]] }
];

// The cars. Every design is original; nothing here is a real make or model.
const DESIGNS = {
  tapehead: { name: "TAPEHEAD GT", spoiler: true },
  boombox: { name: "BOOMBOX TURBO", spoiler: false },
  dart: { name: "PIXEL DART", spoiler: true },
  saturday: { name: "SATURDAY 500", spoiler: false }
};
const PLAYER_CAR = { name: "YOU", design: "tapehead", color: "#ff3d2e", trim: "#ffd21f", num: 88 };
const RIVALS = [
  { name: "REX REWIND", design: "saturday", color: "#2a6bff", trim: "#ffffff", num: 7, skill: 0.965 },
  { name: "DEE DEE PIXEL", design: "dart", color: "#ff3fa4", trim: "#3ff0ff", num: 21, skill: 0.952 },
  { name: "ACE CARTRIDGE", design: "boombox", color: "#ffd21f", trim: "#101219", num: 3, skill: 0.94 },
  { name: "MAX MIXTAPE", design: "tapehead", color: "#2fd36b", trim: "#ffffff", num: 64, skill: 0.928 },
  { name: "TINA TURBOTAPE", design: "dart", color: "#a77bff", trim: "#ffd21f", num: 12, skill: 0.915 }
];
const DRAG_RIVAL = { name: "VIC VOLUME", design: "saturday", color: "#2a6bff", trim: "#ffd21f", num: 1 };

/* ---------------- Track geometry ---------------- */
// Plan view (x east, y north), sampled once a meter. World space: X = x, Z = -y (three.js looks down -Z).
function buildTrack(ev) {
  let x = 0, y = 0, h = 0;
  const P = [[0, 0]];
  ev.spec.forEach(function (s) {
    if (s[0] === "S") {
      const n = Math.max(1, Math.ceil(s[1]));
      for (let i = 1; i <= n; i++) P.push([x + Math.cos(h) * s[1] * i / n, y + Math.sin(h) * s[1] * i / n]);
      x += Math.cos(h) * s[1]; y += Math.sin(h) * s[1];
    } else {
      const r = s[1], a = s[2] * Math.PI / 180 * (s[0] === "L" ? 1 : -1), n = Math.max(2, Math.ceil(r * Math.abs(a)));
      const side = a > 0 ? 1 : -1, cx = x + Math.cos(h + side * Math.PI / 2) * r, cy = y + Math.sin(h + side * Math.PI / 2) * r;
      const a0 = Math.atan2(y - cy, x - cx);
      for (let i = 1; i <= n; i++) { const t = a0 + a * i / n; P.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); }
      x = P[P.length - 1][0]; y = P[P.length - 1][1]; h += a;
    }
  });
  const closed = ev.kind === "circuit";
  // cumulative length, and for a loop, the tiny closing error spread along the whole lap
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const total = cum[cum.length - 1];
  if (closed) {
    const ex = P[P.length - 1][0] - P[0][0], ey = P[P.length - 1][1] - P[0][1];
    for (let i = 0; i < P.length; i++) { P[i][0] -= ex * cum[i] / total; P[i][1] -= ey * cum[i] / total; }
  }
  // resample evenly
  const N = Math.round(total), ds = total / N, X = new Float32Array(N + 1), Z = new Float32Array(N + 1);
  let j = 0;
  for (let i = 0; i <= N; i++) {
    const s = i * ds;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const k = cum[j + 1] > cum[j] ? (s - cum[j]) / (cum[j + 1] - cum[j]) : 0;
    X[i] = P[j][0] + (P[j + 1][0] - P[j][0]) * k;
    Z[i] = -(P[j][1] + (P[j + 1][1] - P[j][1]) * k);
  }
  const TX = new Float32Array(N + 1), TZ = new Float32Array(N + 1), K = new Float32Array(N + 1), HD = new Float32Array(N + 1);
  function at(i) { return closed ? mod(i, N) : clamp(i, 0, N); }
  for (let i = 0; i <= N; i++) {
    const a = at(i - 1), b = at(i + 1), dx = X[b] - X[a], dz = Z[b] - Z[a], l = Math.hypot(dx, dz) || 1;
    TX[i] = dx / l; TZ[i] = dz / l;
    HD[i] = Math.atan2(-TZ[i], TX[i]);                     // heading in plan view, counter clockwise
  }
  for (let i = 0; i <= N; i++) {                          // curvature, smoothed over 16 m so the joins never jolt
    const a = at(i - 8), b = at(i + 8);
    let dh = HD[b] - HD[a];
    while (dh > Math.PI) dh -= TAU; while (dh < -Math.PI) dh += TAU;
    K[i] = dh / (16 * ds);                                 // > 0 turns left
  }
  return { N: N, ds: ds, L: closed ? N * ds : total, X: X, Z: Z, TX: TX, TZ: TZ, K: K, closed: closed };
}
// Point, tangent and curvature at distance s along the track.
function trackAt(tr, s, out) {
  const u = (tr.closed ? mod(s, tr.L) : clamp(s, 0, tr.L - 0.001)) / tr.ds;
  const i = Math.floor(u), k = u - i, j = tr.closed ? (i + 1) % tr.N : Math.min(i + 1, tr.N);
  out.x = tr.X[i] + (tr.X[j] - tr.X[i]) * k; out.z = tr.Z[i] + (tr.Z[j] - tr.Z[i]) * k;
  out.tx = tr.TX[i] + (tr.TX[j] - tr.TX[i]) * k; out.tz = tr.TZ[i] + (tr.TZ[j] - tr.TZ[i]) * k;
  const l = Math.hypot(out.tx, out.tz) || 1; out.tx /= l; out.tz /= l;
  out.k = tr.K[i] + (tr.K[j] - tr.K[i]) * k;
  return out;                                              // right of travel = (-tz, tx)
}
const TP = { x: 0, z: 0, tx: 1, tz: 0, k: 0 };
function curveAt(tr, s) { return trackAt(tr, s, TP).k; }

/* ---------------- Game state ---------------- */
let S = {}, keys = {}, idleT = 0, paused = false;
let evIndex = 0, TRACK = null;
let THREE = null, R = null;                                // R holds everything the renderer owns
const floats = [];                                         // little HUD words: PERFECT, EARLY, LATE...
const touches = new Map();                                 // pointer id -> button
let touchMode = false;
const INPUT = { gas: false, brake: false, steer: 0 };

function makeCar(spec, isPlayer, i) {
  return { name: spec.name, design: spec.design, color: spec.color, trim: spec.trim, num: spec.num, skill: spec.skill || 1,
    isPlayer: isPlayer, idx: i, dist: 0, s: 0, d: 0, a: 0, v: 0, gear: 1, rpm: IDLE, gas: false, brake: false, steer: 0, steerSm: 0,
    shiftT: 0, boostT: 0, bogT: 0, spinT: 0, redT: 0, slip: 0, finished: false, finishT: 0, lane: 0, dodgeT: 0, dodge: 0,
    wheelRot: 0, roll: 0, pitch: 0, lastV: 0, credGear: 1, brakeT: 9, bumpT: 0, react: 0, launched: false, latG: 0, offroad: 0, sparkT: 0, place: 0 };
}

function loadBests() {                                     // read straight from storage: this runs before the shell is up
  try { const o = JSON.parse(localStorage.getItem("npArcade." + SLUG + ".bests") || "{}"); if (o && typeof o === "object") return o; } catch (e) { /* ignore */ }
  return {};
}
let bests = {};

function reset() {
  paused = false;
  const ev = EVENTS[evIndex];
  TRACK = R ? R.tracks[evIndex] : buildTrack(ev);
  bests = loadBests();
  S = { ev: evIndex, kind: ev.kind, phase: ev.kind === "drag" ? "stage" : "grid", t: 0, clock: 0, phaseT: 0,
        cars: [], P: null, order: [], lapT0: 0, laps: [], bestLap: 0, lapShown: 1, perfect: 0, good: 0, early: 0, late: 0,
        shifts: 0, row: 0, bestRow: 0, lapCredits: 0, launch: "", launchShown: false, reaction: 0, foul: false, green: false, greenT: 0,
        treeT: 0, amberAt: 1.2, et: 0, trap: 0, rivalEt: 0, rivalRt: 0, doneT: 0, over: false, walls: 0, place: 6,
        finishT: 0, countN: -1, rivalDone: false, flashT: 0, burstT: 0, autopilot: false };
  floats.length = 0;
  INPUT.gas = INPUT.brake = false; INPUT.steer = 0; touches.clear();
  const P = makeCar(PLAYER_CAR, true, 0);
  S.P = P; S.cars.push(P);
  if (ev.kind === "drag") {
    const r = makeCar(DRAG_RIVAL, false, 1);
    // the rival's night: a reaction time and how hard the car pulls, picked once per run
    r.react = 0.16 + Math.random() * 0.14; r.skill = 0.97 + Math.random() * 0.05;
    P.d = -3.4; r.d = 3.4; P.dist = r.dist = DRAG_START - 6; P.gear = 0; r.gear = 0;
    S.cars.push(r);
    S.amberAt = 1.6 + Math.random() * 0.8;
  } else {
    // a two-wide grid behind the line; you start at the back
    RIVALS.forEach(function (sp, i) { S.cars.push(makeCar(sp, false, i + 1)); });
    const order = S.cars.slice(1).concat([P]);
    order.forEach(function (c, i) {
      c.dist = -9 - i * 8.5; c.d = i % 2 ? 3.2 : -3.2; c.lane = c.d; c.gear = 1;
      c.skill *= 0.995 + Math.random() * 0.01;
    });
  }
  S.cars.forEach(function (c) { c.s = TRACK.closed ? mod(c.dist, TRACK.L) : c.dist; });
  ledReset();
  if (R) snapCamera();
}

/* ---------------- The player's car ---------------- */
function rpmFor(c) { return c.gear > 0 ? c.v / GEAR_TOP[c.gear] * REDLINE : IDLE; }
function zoneOf(r) { return r >= GREEN_LO && r <= GREEN_HI ? "perfect" : r < EARLY_RPM ? "early" : r > GREEN_HI ? "late" : "good"; }

function shiftUp() {
  const P = S.P;
  if (!P || S.phase === "done") return;
  if (S.kind === "drag" && P.gear === 0) { dropClutch(); return; }
  if (P.gear >= 6 || P.shiftT > 0) { if (P.gear >= 6) floatText("TOP GEAR", "#8e93a2"); return; }
  const racing = S.phase === "race";
  if (!racing) { return; }
  const r = P.rpm, z = zoneOf(r);
  // Each gear earns credit once per climb. A climb starts at the launch and again whenever you brake and drop a
  // gear, so dropping a gear and going straight back up earns nothing. A lap pays out for ten shifts at most.
  const earned = P.gear + 1 > P.credGear && (S.kind === "drag" || S.lapCredits < 10);
  P.gear++; P.shiftT = SHIFT_T; P.redT = 0;
  if (earned) { P.credGear = P.gear; S.lapCredits++; }
  S.shifts++;
  Snd.sfx("shift", z === "perfect" && earned ? 1 : 0);
  if (!earned && (z === "perfect" || z === "good")) return;
  if (z === "perfect") {
    P.v += PERFECT_KICK; P.boostT = PERFECT_T; S.perfect++; S.row++; S.bestRow = Math.max(S.bestRow, S.row);
    floatText("PERFECT SHIFT", "#9bff3f", true); S.burstT = 0.5;
    ledShift(S.row);
    if (window.Trophies) Trophies.unlock("sr-perfect");
    if (window.NPRewards && (S.row === 3 || S.row === 6 || (S.row >= 10 && S.row % 5 === 0))) NPRewards.streak(S.row, S.row + " PERFECT IN A ROW!");
    if (S.row === 10 && window.Trophies) Trophies.unlock("sr-tenrow");
  } else {
    S.row = 0;
    if (z === "good") { S.good++; floatText("GOOD", "#3ff0ff"); }
    else if (z === "early") { S.early++; P.v = Math.max(0, P.v - 1.2); P.bogT = 0.5; floatText("EARLY", "#ffd23f"); }
    else { S.late++; P.v = Math.max(0, P.v - 1.4); floatText("LATE", "#ff4b3e"); }
  }
}
function shiftDown() {
  const P = S.P;
  if (!P || S.phase !== "race" || P.gear <= 1 || P.shiftT > 0) return;
  const r = P.v / GEAR_TOP[P.gear - 1] * REDLINE;
  if (r > REDLINE + 250) { floatText("TOO FAST", "#ff4b3e"); Snd.sfx("deny"); return; }
  P.gear--; P.shiftT = SHIFT_T * 0.8;
  if (P.brakeT < 0.8) P.credGear = Math.min(P.credGear, P.gear);
  Snd.sfx("shift", -1);
}
// Drag strip: the car sits in neutral; the first upshift drops the clutch into first.
function dropClutch() {
  const P = S.P;
  if (P.launched) return;
  P.gear = 1; P.launched = true; P.credGear = 1;
  if (!S.green) {
    S.foul = true;
    floatText("RED LIGHT", "#ff4b3e", true);
    Shell.flash("RED LIGHT", "Jumped the green. The run still counts for time.", "#ff4b3e", 1500);
    ledPlay([ledMsg("blink", "RED LIGHT", 2.4, { color: "#ff3322" })]);
    Snd.sfx("deny");
    if (window.Trophies) Trophies.unlock("sr-redlight");
    if (S.phase !== "race") S.phase = "race";
  }
  launch(P);
}
function launch(c) {
  const r = c.rpm;
  c.launched = true; c.launchClock = S.clock;
  if (!c.isPlayer) { c.v = 1.5; return; }
  let what;
  if (r >= LAUNCH_LO && r <= LAUNCH_HI) { what = "perfect"; c.v = 3.2; c.boostT = 0.9; }
  else if (r > LAUNCH_HI) { what = "spin"; c.spinT = 1.0; c.v = 0.6; }
  else if (r < 3000) { what = "bog"; c.bogT = 0.9; c.v = 0.4; }
  else { what = "good"; c.v = 1.8; }
  S.launch = what;
  Snd.sfx("launch", what === "perfect" ? 1 : what === "spin" ? 2 : 0);
  if (what === "perfect") {
    floatText("PERFECT LAUNCH", "#9bff3f", true); S.burstT = 0.6;
    ledPlay([ledMsg("flash", "PERFECT LAUNCH", 2.6)]);
    if (window.Trophies) Trophies.unlock("sr-launch");
  } else if (what === "spin") floatText("WHEELSPIN", "#ff4b3e", true);
  else if (what === "bog") floatText("BOGGED DOWN", "#ffd23f", true);
  else floatText("GOOD LAUNCH", "#3ff0ff", true);
}

// Revs while the car is held (grid, staging, neutral).
function freeRev(c, gas, dt) {
  const prev = c.rpm;
  c.rpm += (gas ? 5200 : -4200) * dt;                       // slow enough to feather the revs into the blue
  if (c.rpm >= REDLINE) { c.rpm = REDLINE - 520; if (c.isPlayer) Snd.limiter(); }
  c.rpm = Math.max(IDLE, c.rpm);
  return prev;
}

// Engine, gearbox and brakes along the road. Returns the drive acceleration used.
function drive(c, gas, brake, dt) {
  if (c.shiftT > 0) c.shiftT -= dt;
  if (c.boostT > 0) c.boostT -= dt;
  if (c.bogT > 0) c.bogT -= dt;
  if (c.spinT > 0) c.spinT -= dt;
  const top = GEAR_TOP[c.gear], wheel = c.v / top * REDLINE;
  if (c.gear === 1 && wheel < 3400) c.rpm = Math.max(wheel, lerp(c.rpm, IDLE + (gas ? 2600 : 0), Math.min(1, dt * 6)));
  else c.rpm = wheel;
  const limiter = c.rpm >= REDLINE - 8;
  let acc = 0;
  if (gas && c.shiftT <= 0 && !limiter) {
    let k = torque(c.rpm);
    if (c.bogT > 0) k *= 0.5;
    if (c.spinT > 0) k *= 0.62;
    acc += GEAR_PULL[c.gear] * k * c.skill;
  }
  if (gas && c.boostT > 0) acc += PERFECT_BOOST;
  if (gas && limiter) {                                    // sitting on the redline: the power is cut until you shift
    c.redT += dt;
    if (c.redT > 0.25) acc -= 1.6;
  } else c.redT = 0;
  if (!gas) acc -= ENGINE_BRAKE * (0.3 + 0.7 * c.rpm / REDLINE);
  if (brake) acc -= BRAKE;
  if (c.v > 0.1) acc -= DRAG_K * c.v * c.v + ROLL;
  c.v = Math.max(0, c.v + acc * dt);
  if (c.v > top) c.v = top;                                // the wheels can't turn the engine past the redline
  return acc;
}

function steerCar(c, steer, dt, k) {
  c.steerSm += (steer - c.steerSm) * Math.min(1, dt * (touchMode && c.isPlayer ? 7 : 9));
  const v = c.v, yawMax = v / (14 + 0.55 * v);
  const a0 = c.a;
  c.a += c.steerSm * yawMax * dt + k * v * dt * (1 - ASSIST);
  if (Math.abs(steer) < 0.05) c.a -= c.a * Math.min(1, dt * 1.3);   // let go of the wheel and the car settles along the road
  c.a = clamp(c.a, -0.62, 0.62);
  const worldYaw = k * v - (c.a - a0) / Math.max(dt, 1e-4);
  c.latG = Math.abs(worldYaw * v);
  c.slip = Math.max(0, (c.latG - GRIP) / GRIP);
  if (c.slip > 0) c.v = Math.max(0, c.v - c.slip * 9 * dt);
}

function stepPlayer(dt) {
  const P = S.P, tr = TRACK;
  let gas = INPUT.gas, brake = INPUT.brake, steer = INPUT.steer;
  if (S.autopilot || S.phase === "done") return aiStep(P, dt, true);
  if (S.phase !== "race" || (S.kind === "drag" && !P.launched)) {
    freeRev(P, gas, dt);
    P.v = 0;
    return;
  }
  if (!P.launched && gas) { if (S.t < 0.4) launch(P); else P.launched = true; }   // a short grace window after GO
  drive(P, gas, brake, dt);
  P.brakeT = brake && P.v > 3 ? 0 : P.brakeT + dt;
  if (S.kind === "drag") {                                 // locked in the lane; the wheel only nudges
    P.d = clamp(P.d + steer * dt * 0.6, -4.6, -2.2);
    P.a = 0; P.slip = P.spinT > 0 ? 0.8 : 0;
    P.dist += P.v * dt; P.s = P.dist;
    return;
  }
  const k = curveAt(tr, P.s);
  steerCar(P, steer, dt, k);
  const sdot = P.v * Math.cos(P.a) / Math.max(0.5, 1 + k * P.d);
  P.d += P.v * Math.sin(P.a) * dt;
  // curbs, the shoulder, and the wall
  const ad = Math.abs(P.d);
  P.offroad = ad > ROAD + CURB ? 2 : ad > ROAD ? 1 : 0;
  if (P.offroad === 2 && P.v > 8) P.v -= (4 + P.v * 0.08) * dt;
  const lim = WALL - CAR_W / 2 - 0.15;
  if (ad > lim) {
    const side = Math.sign(P.d), into = P.v * Math.sin(P.a) * side;
    P.d = side * lim;
    if (P.a * side > 0) P.a = -P.a * 0.35;
    if (into > 1.5 || P.v > 12) {
      P.v *= 1 - Math.min(0.3, 0.04 + Math.max(0, into) * 0.025);
      if (P.sparkT <= 0) {
        P.sparkT = 0.35; S.walls++;
        Snd.sfx("wall", Math.min(1, Math.max(into, 3) / 12));
        Shell.shake(2, 0.2); camShake(0.25, 0.25);
        sparks(P, side);
      }
    }
  }
  if (P.sparkT > 0) P.sparkT -= dt;
  P.dist += sdot * dt;
  P.s = mod(P.dist, tr.L);
}

/* ---------------- The other drivers ---------------- */
const AI_BRAKE = 11;
function aiTarget(c) {
  const tr = TRACK, look = c.v * c.v / (2 * AI_BRAKE) + 30;
  let target = GEAR_TOP[6] * 0.985;
  for (let x = 0; x < look; x += 5) {
    const k = Math.abs(curveAt(tr, c.s + x));
    if (k < 1e-4) continue;
    const vc = Math.sqrt((GRIP - 1.5) * c.skill / k);
    target = Math.min(target, Math.sqrt(vc * vc + 2 * AI_BRAKE * x));
  }
  return target;
}
function aiStep(c, dt, autopilot) {
  const tr = TRACK;
  if (S.phase !== "race" && S.phase !== "done") { c.v = 0; c.rpm = lerp(c.rpm, IDLE + 1900 + Math.sin(S.clock * 9 + c.idx) * 400, Math.min(1, dt * 4)); return; }
  if (S.kind === "drag") {
    if (!c.launched) {
      c.rpm = lerp(c.rpm, 5600, Math.min(1, dt * 5));
      if (S.green && S.clock - S.greenT >= c.react) { c.gear = 1; launch(c); }
      else return;
    }
    autoGear(c);
    drive(c, !c.finished, c.finished && c.v > 8, dt);
    c.dist += c.v * dt; c.s = c.dist;
    return;
  }
  // speed: as fast as the road ahead allows
  let target = aiTarget(c);
  if (!autopilot && S.phase === "race" && !c.finished) {
    // a light rubber band: never far ahead, never hopeless behind
    const gap = c.dist - S.P.dist;
    if (gap > 70) target *= 0.94; else if (gap > 35) target *= 0.975;
    else if (gap < -90) target *= 1.03; else if (gap < -45) target *= 1.015;
  }
  if (autopilot) target *= S.phase === "done" ? 0.75 : 0.97;
  autoGear(c);
  const gas = c.v < target - 0.3, brake = c.v > target + 1.5;
  c.lastBrake = brake && !gas;
  drive(c, gas, brake && !gas, dt);
  // line: a touch toward the inside of the corner ahead, around anyone slower in the way
  const kAhead = curveAt(tr, c.s + 25);
  let tD = clamp(c.lane - kAhead * 220, -5.5, 5.5);
  if (c.dodgeT > 0) { c.dodgeT -= dt; tD = c.dodge; }
  else {
    for (let i = 0; i < S.cars.length; i++) {
      const o = S.cars[i];
      if (o === c) continue;
      const gap = tr.closed ? mod(o.dist - c.dist + tr.L / 2, tr.L) - tr.L / 2 : o.dist - c.dist;
      if (gap > 0 && gap < 16 && o.v < c.v + 0.5 && Math.abs(o.d - c.d) < 2.6) {
        c.dodge = o.d > c.d - 0.3 ? clamp(o.d - 3.2, -6, 6) : clamp(o.d + 3.2, -6, 6);
        if (Math.abs(c.dodge) > 6) c.dodge = o.d > 0 ? o.d - 3.2 : o.d + 3.2;
        c.dodgeT = 1.1;
        tD = c.dodge;
        break;
      }
    }
  }
  const dd = clamp((tD - c.d) * 1.4, -4.5, 4.5);
  c.d = clamp(c.d + dd * dt, -WALL + 1.4, WALL - 1.4);
  c.a = lerp(c.a, Math.atan2(dd, Math.max(4, c.v)), Math.min(1, dt * 6));
  const k = curveAt(tr, c.s);
  c.latG = Math.abs(k) * c.v * c.v; c.slip = Math.max(0, (c.latG - GRIP + 2) / GRIP);
  c.steerSm = clamp(-k * 18 + dd * 0.15, -1, 1);
  c.dist += c.v * Math.cos(c.a) / Math.max(0.5, 1 + k * c.d) * dt;
  c.s = mod(c.dist, tr.L);
}
function autoGear(c) {
  if (c.gear === 0) return;
  if (c.gear < 6 && c.v / GEAR_TOP[c.gear] * REDLINE > 7250 && c.shiftT <= 0) {
    c.gear++; c.shiftT = SHIFT_T;
    // the other drivers nail a shift now and then too
    if (!c.isPlayer && c.gear > 2 && Math.random() < 0.3 + (c.skill - 0.9) * 4) { c.v += PERFECT_KICK * 0.7; c.boostT = PERFECT_T * 0.8; }
    if (!c.isPlayer && c.v > 4 && R) Snd.aiShift(c);
  } else if (c.gear > 1 && c.v / GEAR_TOP[c.gear - 1] * REDLINE < 6200) c.gear--;
}

/* ---------------- Contact between cars ---------------- */
function collide(dt) {
  const cars = S.cars, tr = TRACK;
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    const ds = tr.closed ? mod(b.dist - a.dist + tr.L / 2, tr.L) - tr.L / 2 : b.dist - a.dist;
    const dd = b.d - a.d, ox = CAR_L - Math.abs(ds), oy = CAR_W * 1.04 - Math.abs(dd);
    if (ox <= 0 || oy <= 0) continue;
    if (oy < ox * 0.55) {                                  // side by side: rub and push apart
      const push = oy / 2 + 0.02, sgn = dd >= 0 ? 1 : -1;
      a.d -= sgn * push; b.d += sgn * push;
      a.v *= 0.995; b.v *= 0.995;
      if (a.isPlayer) a.a -= sgn * 0.04; if (b.isPlayer) b.a += sgn * 0.04;
    } else {                                               // nose to tail: the one behind loses out
      const back = ds > 0 ? a : b, front = ds > 0 ? b : a;
      back.dist -= ox * 0.6; front.dist += ox * 0.4;
      const rel = back.v - front.v;
      if (rel > 0) { back.v -= rel * 0.65; front.v += rel * 0.35; }
      back.s = tr.closed ? mod(back.dist, tr.L) : back.dist; front.s = tr.closed ? mod(front.dist, tr.L) : front.dist;
    }
    if ((a.isPlayer || b.isPlayer) && S.P.bumpT <= 0) { S.P.bumpT = 0.4; Snd.sfx("bump"); camShake(0.12, 0.15); }
  }
  if (S.P.bumpT > 0) S.P.bumpT -= dt;
}

/* ---------------- Race flow ---------------- */
function placeOf(c) {
  let p = 1;
  for (let i = 0; i < S.cars.length; i++) {
    const o = S.cars[i];
    if (o === c) continue;
    if (o.finished && !c.finished) p++;
    else if (o.finished && c.finished && o.finishT < c.finishT) p++;
    else if (!o.finished && !c.finished && o.dist > c.dist) p++;
  }
  return p;
}

function update(dt) {
  S.clock += dt;
  S.phaseT += dt;
  if (S.burstT > 0) S.burstT -= dt;
  for (let i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; if (floats[i].t > 1.1) floats.splice(i, 1); }
  updateFx(dt);
  readInput();
  // two physics steps a frame keep the gearbox honest at low frame rates
  const n = dt > 1 / 50 ? 2 : 1, h = dt / n;
  for (let k = 0; k < n; k++) stepRace(h);
  ledTick(dt);
  Snd.engine();
}

function stepRace(dt) {
  if (S.kind === "drag") return stepDrag(dt);
  const P = S.P;
  if (S.phase === "grid") {
    stepPlayer(dt); S.cars.forEach(function (c) { if (!c.isPlayer) aiStep(c, dt); });
    if (S.phaseT > 1.1) { S.phase = "count"; S.phaseT = 0; S.countN = -1; }
    return;
  }
  if (S.phase === "count") {
    stepPlayer(dt); S.cars.forEach(function (c) { if (!c.isPlayer) aiStep(c, dt); });
    const n = Math.floor(S.phaseT);
    if (n !== S.countN && n < 3) { S.countN = n; Snd.sfx("beep", 0); ledPlay([ledMsg("count", String(3 - n), 1)]); }
    if (S.phaseT >= 3) {
      S.phase = "race"; S.phaseT = 0; S.t = 0; S.lapT0 = 0;
      Snd.sfx("beep", 1);
      ledPlay([ledMsg("flash", "GO GO GO", 1.6)]);
      S.cars.forEach(function (c) { if (!c.isPlayer) c.launched = true; });
      if (INPUT.gas) launch(P); else P.v = 0;
    }
    return;
  }
  S.t += dt;
  stepPlayer(dt);
  for (let i = 1; i < S.cars.length; i++) aiStep(S.cars[i], dt);
  collide(dt);
  // laps and the finish
  const L = TRACK.L;
  S.cars.forEach(function (c) {
    if (!c.finished && c.dist >= LAPS * L) {
      c.finished = true; c.finishT = S.t - (c.dist - LAPS * L) / Math.max(1, c.v);
      if (!c.isPlayer) S.order.push(c);
    }
  });
  if (S.phase === "race") {
    const lap = Math.floor(Math.max(0, P.dist) / L) + 1;
    if (lap > S.lapShown && lap <= LAPS + 1) {
      const lt = S.t - S.lapT0;
      S.laps.push(lt); S.lapT0 = S.t; S.lapCredits = 0;
      if (!S.bestLap || lt < S.bestLap) S.bestLap = lt;
      S.lapShown = lap;
      if (lap <= LAPS) {
        Snd.sfx("lap", lap === LAPS ? 1 : 0);
        if (lap === LAPS) { Shell.flash("FINAL LAP", "Lap " + (lap - 1) + ": " + timeStr(lt), "#ffd23f", 1300); ledPlay([ledMsg("flash", "FINAL LAP", 2.6)]); }
        else { floatText("LAP " + lap + " / " + LAPS, "#3ff0ff", true); ledPlay([ledMsg("slide", "LAP " + lap + " OF " + LAPS, 2.4, { color: "#2fe6ff" })]); }
      }
    }
    // position calls on the board when you move up
    // only when the board is free, so it never shows an old place
    const pl = placeOf(P);
    if (pl < S.place && S.t > 2 && LED && !LED.msg) ledPlay([ledMsg("slide", "P" + pl + "  " + ordinal(pl).toUpperCase() + " PLACE", 1.8, { color: pl === 1 ? "#ffe838" : "#7dff3a" })]);
    S.place = pl;
    if (P.finished) finishRace();
  } else if (S.phase === "done") {
    S.doneT += dt;
    if (S.doneT > 3.6 && !S.over) endRun();
  }
}

function finishRace() {
  const P = S.P;
  S.phase = "done"; S.doneT = 0;
  S.place = 1 + S.order.length;
  S.order.push(P);
  S.finishT = P.finishT;
  const pl = S.place;
  Snd.sfx("finish", pl === 1 ? 1 : 0);
  ledPlay([ledMsg("flash", pl === 1 ? "WINNER" : "FINISH  P" + pl, 2.8), ledMsg("score", "TIME", 4, { value: timeStr(P.finishT) })]);
  Shell.flash(pl === 1 ? "CHECKERED FLAG!" : ordinal(pl).toUpperCase() + " PLACE", timeStr(P.finishT), pl === 1 ? "#ffd23f" : "#3ff0ff", 1800);
  if (pl === 1) { Shell.shake(4, 0.4); confetti(90); } else if (pl <= 3) confetti(40);
  if (window.Trophies) {
    if (pl === 1) Trophies.unlock("sr-win");
    if (pl === 1) {
      const won = JSON.parse(Shell.load("wins") || "{}");
      won[EVENTS[S.ev].id] = 1; Shell.save("wins", JSON.stringify(won));
      if (won.city && won.desert && won.board) Trophies.unlock("sr-tour");
    }
  }
}

function stepDrag(dt) {
  const P = S.P, rv = S.cars[1], fin = DRAG_START + DRAG_LEN;
  if (S.phase === "stage") {                               // both cars creep up to the beams
    S.cars.forEach(function (c) { c.dist = lerp(c.dist, DRAG_START, Math.min(1, dt * 2.2)); c.s = c.dist; c.v = 0; });
    freeRev(P, INPUT.gas, dt); aiStep(rv, dt);
    if (S.phaseT > 1.1) { S.phase = "tree"; S.phaseT = 0; S.treeT = 0; S.countN = -1; S.cars.forEach(function (c) { c.dist = c.s = DRAG_START; }); }
    return;
  }
  if (!S.green) {                                          // the tree runs on its own clock, red light or not
    S.treeT += dt;
    const t = S.treeT - S.amberAt, n = Math.floor(t / 0.5);
    if (t >= 0 && n < 3 && n !== S.countN) { S.countN = n; Snd.sfx("beep", 0); }
    if (t >= 1.5) {
      S.green = true; S.greenT = S.clock;
      if (S.phase === "tree") S.phase = "race";
      Snd.sfx("beep", 1);
      if (!S.foul) ledPlay([ledMsg("flash", "GREEN", 1.4)]);
    }
  }
  if (S.green || P.launched) S.t += dt;
  if (!P.launched) freeRev(P, INPUT.gas, dt);
  else if (!P.finished) stepPlayer(dt);
  else { autoGear(P); drive(P, false, P.v > 8, dt); P.dist += P.v * dt; P.s = P.dist; }
  aiStep(rv, dt);
  [P, rv].forEach(function (c) {
    if (!c.finished && c.launched && c.dist >= fin) {
      c.finished = true;
      c.finishClock = S.clock - (c.dist - fin) / Math.max(1, c.v);
      c.et = c.finishClock - c.launchClock; c.trap = c.v;
      if (c === P) dragResult();
    }
  });
  if (P.finished) {
    S.doneT += dt;
    if (S.doneT > 3.4 && (rv.finished || S.doneT > 6) && !S.over) {
      if (!rv.finished) { rv.et = (S.clock - rv.launchClock) + (fin - rv.dist) / Math.max(5, rv.v); }
      S.rivalEt = rv.et; S.rivalRt = rv.react;
      endRun();
    }
  }
}
function dragResult() {
  const P = S.P, rv = S.cars[1];
  S.reaction = P.launchClock - S.greenT;
  S.et = P.et; S.trap = P.trap; S.finishT = P.et;
  const win = !S.foul && !(rv.finished && rv.finishClock < P.finishClock);
  S.phase = "done"; S.doneT = 0;
  S.place = win ? 1 : 2;
  Snd.sfx("finish", win ? 1 : 0);
  ledPlay([ledMsg("flash", S.foul ? "RED LIGHT" : win ? "WINNER" : "BEATEN", 2.4), ledMsg("score", "ET", 4, { value: S.et.toFixed(2) })]);
  Shell.flash(S.foul ? "FOUL" : win ? "WIN!" : "BEATEN", S.et.toFixed(3) + " s @ " + Math.round(S.trap * MPH) + " MPH", win ? "#ffd23f" : "#ff3fa4", 1800);
  if (win) confetti(70);
  if (window.Trophies) {
    if (win) Trophies.unlock("sr-dragwin");
    if (!S.foul && S.et < 10.5) Trophies.unlock("sr-eleven");
  }
}

/* ---------------- Score ---------------- */
const PLACE_PTS = [5000, 3500, 2500, 1600, 1000, 600];
function scoreRun() {
  const ev = EVENTS[S.ev];
  const parts = [];
  let total = 0;
  function add(label, v) { parts.push([label, v]); total += v; }
  if (S.kind === "drag") {
    add(S.foul ? "Red light" : S.place === 1 ? "Win" : "Runner up", S.foul ? 300 : S.place === 1 ? 3000 : 1200);
    if (!S.foul) add("Reaction " + S.reaction.toFixed(3), Math.round(Math.max(0, 0.5 - S.reaction) * 2000));
    add("ET " + S.et.toFixed(2), Math.round(Math.max(0, ev.par + 2 - S.et) * 350));
  } else {
    add(ordinal(S.place) + " place", PLACE_PTS[S.place - 1]);
    add("Race time " + timeStr(S.finishT), Math.round(Math.max(0, ev.par - S.finishT) * 30));
  }
  add("Perfect shifts x" + S.perfect, S.perfect * (S.kind === "drag" ? 200 : 150));
  if (S.good) add("Good shifts x" + S.good, S.good * 50);
  if (S.launch === "perfect") add("Perfect launch", 300);
  return { total: total, parts: parts };
}

function endRun() {
  S.over = true;
  const ev = EVENTS[S.ev], sc = scoreRun();
  // bests per event: race time for the circuits, elapsed time for the drag
  const key = ev.id, mine = S.kind === "drag" ? (S.foul ? 0 : S.et) : S.finishT;
  if (mine && (!bests[key] || mine < bests[key])) { bests[key] = mine; Shell.save("bests", JSON.stringify(bests)); }
  if (S.kind !== "drag" && S.bestLap) {
    const lk = key + "Lap";
    if (!bests[lk] || S.bestLap < bests[lk]) { bests[lk] = S.bestLap; Shell.save("bests", JSON.stringify(bests)); }
  }
  ledFinal(sc.total);
  const row = function (a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; };
  let html = '<p class="np-kicker" style="margin:2px 0 6px">' + ev.name + " &middot; " + ev.sub + "</p>";
  if (S.kind === "drag") {
    html += standingsHtml([
      { pos: S.foul ? "DQ" : S.place === 1 ? "1" : "2", name: "YOU", t: (S.foul ? "RED " : "") + S.et.toFixed(3) + " s", sub: "RT " + S.reaction.toFixed(3) + " / " + Math.round(S.trap * MPH) + " MPH", me: true },
      { pos: S.foul || S.place === 2 ? "1" : "2", name: DRAG_RIVAL.name, t: S.rivalEt.toFixed(3) + " s", sub: "RT " + S.rivalRt.toFixed(3) }
    ].sort(function (a, b) { return a.pos === "DQ" ? 1 : b.pos === "DQ" ? -1 : Number(a.pos) - Number(b.pos); }));
  } else {
    const rows = finalOrder().map(function (o, i) {
      return { pos: String(i + 1), name: o.c.isPlayer ? "YOU" : o.c.name, t: (o.est ? "~" : "") + timeStr(o.t), me: o.c.isPlayer };
    });
    html += standingsHtml(rows);
    html += row("Best lap", timeStr(S.bestLap || 0));
  }
  html += '<div style="margin-top:8px">' + sc.parts.map(function (p) { return row(p[0], p[1].toLocaleString()); }).join("") + "</div>";
  const shiftsTotal = S.perfect + S.good + S.early + S.late;
  Shell.gameOver(sc.total, {
    title: S.kind === "drag" ? (S.foul ? "RED LIGHT" : S.place === 1 ? "WIN LIGHT!" : "BEATEN AT THE STRIPE") : S.place === 1 ? "CHECKERED FLAG" : "FINISH",
    html: html,
    stats: { event: ev.id, mode: S.kind, place: S.place, score: sc.total, perfect: S.perfect, good: S.good, early: S.early, late: S.late,
             shifts: shiftsTotal, bestRow: S.bestRow, launch: S.launch, time: S.kind === "drag" ? S.et : S.finishT,
             bestLap: S.bestLap || 0, reaction: S.reaction, foul: S.foul, walls: S.walls,
             clean: shiftsTotal >= 8 && S.perfect === shiftsTotal }
  });
}
function finalOrder() {
  const out = S.order.map(function (c) { return { c: c, t: c.finishT, est: false }; });
  const rest = S.cars.filter(function (c) { return !c.finished || out.every(function (o) { return o.c !== c; }); })
    .filter(function (c) { return out.every(function (o) { return o.c !== c; }); });
  rest.forEach(function (c) {
    const left = LAPS * TRACK.L - c.dist, pace = Math.max(18, c.dist / Math.max(1, S.t));
    out.push({ c: c, t: S.t + left / pace, est: true });
  });
  return out.sort(function (a, b) { return a.t - b.t; });
}
function standingsHtml(rows) {
  let h = '<table aria-label="Standings" style="width:100%;border-collapse:collapse;margin:2px 0 8px;font-size:12px">';
  rows.forEach(function (r) {
    const st = r.me ? "color:#ffd23f" : "";
    h += '<tr style="' + st + '"><td style="text-align:left;padding:2px 4px;width:2em">' + r.pos + '</td><td style="text-align:left;padding:2px 4px">' + r.name +
      (r.sub ? '<br><span style="opacity:.7;font-size:10px">' + r.sub + "</span>" : "") + '</td><td style="text-align:right;padding:2px 4px">' + r.t + "</td></tr>";
  });
  return h + "</table>";
}
function timeStr(t) {
  if (!(t > 0)) return "--:--.--";
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2);
}
function ordinal(n) { return n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"); }
function floatText(txt, col, big) { floats.push({ txt: txt, col: col, big: !!big, t: 0 }); if (floats.length > 3) floats.shift(); }

/* ---------------- Input ---------------- */
// Touch buttons, in HUD pixels. Left thumb steers and shifts, right thumb works the pedals.
const BTN = {
  left: { x: 8, y: 478, w: 54, h: 54, label: "<" },
  right: { x: 66, y: 478, w: 54, h: 54, label: ">" },
  down: { x: 8, y: 420, w: 54, h: 52, label: "DN" },
  up: { x: 66, y: 420, w: 54, h: 52, label: "UP" },
  brake: { x: 240, y: 478, w: 54, h: 54, label: "BRK" },
  gas: { x: 298, y: 420, w: 54, h: 112, label: "GAS" }
};
function hitButton(x, y) {
  let best = null, bd = 1e9;
  for (const k in BTN) {
    const b = BTN[k], pad = 7;
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) {
      const d = Math.hypot(x - (b.x + b.w / 2), y - (b.y + b.h / 2));
      if (d < bd) { bd = d; best = k; }
    }
  }
  return best;
}
function readInput() {
  if (window.__srBot) { window.__srBot(INPUT, S); return; }   // automated checks only
  let steer = 0, gas = false, brake = false;
  if (keys.ArrowLeft || keys.KeyA) steer -= 1;
  if (keys.ArrowRight || keys.KeyD) steer += 1;
  if (keys.ArrowUp || keys.KeyW) gas = true;
  if (keys.ArrowDown || keys.KeyS) brake = true;
  touches.forEach(function (b) {
    if (b === "left") steer -= 1; else if (b === "right") steer += 1;
    else if (b === "gas") gas = true; else if (b === "brake") brake = true;
  });
  INPUT.steer = clamp(steer, -1, 1); INPUT.gas = gas; INPUT.brake = brake;
}
function pressButton(b) {
  if (b === "up") shiftUp();
  else if (b === "down") shiftDown();
}
function key(type, code, e) {
  if (type === "down") {
    keys[code] = true;
    if (e && e.repeat) return;
    if (code === "KeyE" || code === "Space" || code === "ShiftLeft" || code === "ShiftRight") shiftUp();
    else if (code === "KeyQ") shiftDown();
  } else keys[code] = false;
}
function pointer() { /* the shell's single pointer is ignored: every finger is tracked below */ }
function bindTouch(canvas) {
  function local(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / (r.width / W), y: (e.clientY - r.top) / (r.height / H) };
  }
  canvas.addEventListener("pointerdown", function (e) {
    if (Shell.state() !== "playing") return;
    if (e.pointerType === "touch" || e.pointerType === "pen") touchMode = true;
    const p = local(e), b = hitButton(p.x, p.y);
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (!b) return;
    touches.set(e.pointerId, b);
    pressButton(b);
  }, { passive: false });
  canvas.addEventListener("pointermove", function (e) {
    if (!touches.has(e.pointerId)) return;
    const cur = touches.get(e.pointerId);
    if (cur !== "left" && cur !== "right") return;     // a thumb can slide between the two steering buttons
    const p = local(e), b = hitButton(p.x, p.y);
    if (b === "left" || b === "right") touches.set(e.pointerId, b);
  });
  function up(e) { touches.delete(e.pointerId); }
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("lostpointercapture", up);
}

/* ---------------- Music ----------------
   An original synth loop: sixteen bars in A minor at 118 BPM (bass, arpeggio, pad, lead, drums), all made with the
   Web Audio API. It knows nothing about the game: hand it an audio context and a node to play into, and it plays
   until the function it returns is called. */
function startMusic(ctx, dest) {
  const BPM = 118, STEP = 60 / BPM / 4, STEPS = 256, AHEAD = 0.25;
  const CH = { Am: [45, 57, 60, 64], F: [41, 57, 60, 65], C: [48, 55, 60, 64], G: [43, 55, 59, 62], Dm: [50, 57, 62, 65], E: [40, 56, 59, 64] };
  const PROG = "Am Am F F C C G G Am Am F F Dm Dm E E".split(" ");
  const BARS = [
    "0E5-3 3A5-3 6B5-2 8C6-4 12B5-2 14A5-2", "0E5-6 8D5-2 10C5-2 12D5-4",
    "0F5-3 3A5-3 6C6-2 8A5-4 12G5-2 14F5-2", "0E5-8 12C5-2 14D5-2",
    "0E5-3 3G5-3 6C6-2 8D6-4 12C6-2 14B5-2", "0G5-8 8E5-4 12G5-4",
    "0D6-3 3B5-3 6G5-2 8A5-3 11B5-3 14D6-2", "0B5-12 12A5-2 14G5-2",
    "0A5-2 2C6-2 4E6-4 8D6-2 10C6-2 12B5-2 14C6-2", "0A5-8 8E5-4 12A5-4",
    "0C6-2 2A5-2 4F5-4 8G5-2 10A5-2 12C6-4", "0A5-8 8G5-4 12F5-4",
    "0D5-2 2F5-2 4A5-4 8C6-3 11A5-1 12F5-4", "0A5-6 6G5-2 8F5-4 12E5-4",
    "0E5-2 2G#5-2 4B5-4 8E6-4 12D6-2 14B5-2", "0G#5-8 8B5-4 12E5-4"
  ];
  const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const lead = new Array(STEPS).fill(null);
  BARS.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(#?)(\d)-(\d+)$/.exec(tok);
      if (m) lead[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + semis[m[2]] + (m[3] ? 1 : 0), Number(m[5])];
    });
  });
  function hz(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(dest);
  bus.gain.setTargetAtTime(1, ctx.currentTime + 0.05, 0.08);
  function filt(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const leadF = filt("lowpass", 3400, 0.8, bus), bassF = filt("lowpass", 520, 3, bus), padF = filt("lowpass", 1300, 0.6, bus), arpF = filt("lowpass", 2600, 1, bus);
  // a slap of echo on the lead and the arpeggio
  const send = ctx.createGain(), echo = ctx.createDelay(1), fb = ctx.createGain(), wet = filt("lowpass", 2200, 0.7, bus);
  send.gain.value = 0.26; echo.delayTime.value = STEP * 3; fb.gain.value = 0.34;
  leadF.connect(send); arpF.connect(send); send.connect(echo); echo.connect(fb); fb.connect(echo); echo.connect(wet);
  const nlen = Math.floor(ctx.sampleRate);
  const noise = ctx.createBuffer(1, nlen, ctx.sampleRate), nd = noise.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < nlen; i++) { seed = (seed * 16807) % 2147483647; nd[i] = seed / 1073741823.5 - 1; }

  function note(to, type, f, t, dur, vol, detune, f1) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (detune) o.detune.value = detune;
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.03);
  }
  function hit(t, dur, vol, type, f, q) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, (t * 7.31) % 0.8); s.stop(t + dur + 0.02);
  }
  function pad(ch, t, dur) {                               // two detuned saws that swell in under each chord
    [1, 2, 3].forEach(function (k) {
      [-9, 9].forEach(function (dt) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sawtooth"; o.frequency.value = hz(ch[k]); o.detune.value = dt;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.022, t + dur * 0.35);
        g.gain.setValueAtTime(0.022, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(padF); o.start(t); o.stop(t + dur + 0.05);
      });
    });
  }
  function play(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[bar]], n = lead[i];
    if (s === 0) pad(ch, t, STEP * 16);
    if (n && bar >= 0) { note(leadF, "square", hz(n[0]), t, n[1] * STEP * 0.95, 0.075, 0); note(leadF, "sawtooth", hz(n[0]), t, n[1] * STEP * 0.95, 0.04, 7); }
    // bass: driving eighths, root and octave
    if (!(s & 1)) note(bassF, "sawtooth", hz(ch[0] + ((s >> 1) % 2 ? 12 : 0)), t, STEP * 1.8, 0.2);
    // arpeggio: sixteenths up and down the chord
    const arp = [1, 2, 3, 2][s & 3] , up = (s >> 2) % 2 ? 12 : 0;
    note(arpF, "triangle", hz(ch[arp] + up), t, STEP * 0.9, 0.05);
    // drums: four on the floor, a snare on two and four, hats on the offbeats
    if (s % 4 === 0) note(bus, "sine", 140, t, 0.2, 0.55, 0, 40);
    if (s === 4 || s === 12) { hit(t, 0.2, 0.32, "bandpass", 1700, 0.7); note(bus, "triangle", 210, t, 0.08, 0.12, 0, 120); }
    if (s % 4 === 2) hit(t, 0.05, 0.12, "highpass", 8000);
    if (bar % 4 === 3 && s >= 12) hit(t, 0.08, 0.16 + (s - 12) * 0.04, "bandpass", 2400, 0.9);
  }
  let step = 0, next = ctx.currentTime + 0.08, alive = true;
  function pump() {
    if (!alive) return;
    const now = ctx.currentTime;
    if (next < now) next = now + 0.03;
    while (next < now + AHEAD) { play(step, next); step = (step + 1) % STEPS; next += STEP; }
  }
  pump();
  const timer = setInterval(pump, 50);
  return function stop() {
    if (!alive) return;
    alive = false; clearInterval(timer);
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now); bus.gain.setTargetAtTime(0, now, 0.06);
    setTimeout(function () { try { bus.disconnect(); } catch (e) { /* gone */ } }, 600);
  };
}

/* ---------------- Sound effects and the engine ----------------
   Nothing is made until the first tap, click or key press. The engine, the other cars, the tires and the wind are
   always-on voices whose pitch and level follow the race; the rest are one-shot stingers. Everything follows the
   shell's mute button; the music has its own button (and N), and both are remembered. */
const MUSIC_KEY = "npArcade.music";
const MUSIC_VOL = 0.15;
const Snd = (function () {
  let A = null, dead = false, muted = false, musicOn = true, stopMusic = null;
  try { musicOn = localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { /* private mode */ }
  const buttons = [];
  let limT = 0;

  function shellMuted() {
    const b = document.getElementById("np-mute");
    if (b) return b.getAttribute("aria-pressed") === "true";
    try { return localStorage.getItem("npArcade.muted") === "1"; } catch (e) { return false; }
  }
  function rig(c) {
    const a = { c: c };
    a.out = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    a.out.connect(comp); comp.connect(c.destination);
    a.music = c.createGain(); a.music.gain.value = MUSIC_VOL; a.music.connect(a.out);
    a.sfx = c.createGain(); a.sfx.gain.value = 0.32; a.sfx.connect(a.out);
    const len = Math.floor(c.sampleRate * 2);
    a.noise = c.createBuffer(1, len, c.sampleRate);
    const d = a.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // the engine: two saws an octave apart and a square, through a filter that opens with the throttle
    a.eng = c.createGain(); a.eng.gain.value = 0; a.eng.connect(a.sfx);
    a.engF = c.createBiquadFilter(); a.engF.type = "lowpass"; a.engF.frequency.value = 600; a.engF.Q.value = 4; a.engF.connect(a.eng);
    const shaper = c.createWaveShaper(), curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.4); }
    shaper.curve = curve; shaper.connect(a.engF);
    a.o1 = c.createOscillator(); a.o1.type = "sawtooth";
    a.o2 = c.createOscillator(); a.o2.type = "square";
    a.o3 = c.createOscillator(); a.o3.type = "sawtooth";
    const g1 = c.createGain(), g2 = c.createGain(), g3 = c.createGain();
    g1.gain.value = 0.5; g2.gain.value = 0.28; g3.gain.value = 0.22;
    a.o1.connect(g1); a.o2.connect(g2); a.o3.connect(g3); g1.connect(shaper); g2.connect(shaper); g3.connect(shaper);
    a.o1.start(); a.o2.start(); a.o3.start();
    // the field: one low drone for the nearest rival
    a.ai = c.createGain(); a.ai.gain.value = 0; a.ai.connect(a.sfx);
    const aiF = c.createBiquadFilter(); aiF.type = "lowpass"; aiF.frequency.value = 700; aiF.connect(a.ai);
    a.oa = c.createOscillator(); a.oa.type = "sawtooth"; a.oa.connect(aiF); a.oa.start();
    // tires and wind: looping noise through filters
    function loop(type, f, q) {
      const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
      s.buffer = a.noise; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(a.sfx); s.start();
      return { g: g, f: fl };
    }
    a.squeal = loop("bandpass", 2300, 6);
    a.wind = loop("lowpass", 900, 0.5);
    a.rumble = loop("lowpass", 160, 2);
    return a;
  }
  function unlock() {
    if (dead) return;
    try {
      if (!A) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        A = rig(new AC());
        muted = shellMuted();
        A.out.gain.value = muted ? 0 : 1;
      }
      if (A.c.state !== "running") { const p = A.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { A = null; dead = true; }
  }
  function osc(dest, type, f0, t, dur, vol, f1, hold) {
    const o = A.c.createOscillator(), g = A.c.createGain(), h = t + Math.max(0.006, dur * (hold == null ? 0.4 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(dest, t, dur, vol, type, f0, q, f1) {
    const s = A.c.createBufferSource(), f = A.c.createBiquadFilter(), g = A.c.createGain();
    s.buffer = A.noise; f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  const CUES = {
    shift: function (t, x) {                                // the clunk of the box, a blow-off, and a chime for a perfect one
      hiss(A.sfx, t, 0.05, 0.5, "bandpass", 900, 1.2);
      osc(A.sfx, "square", 120, t, 0.06, 0.25, 70);
      if (x >= 0) hiss(A.sfx, t + 0.03, 0.32, 0.22, "highpass", 2500, 0.8, 6000);
      if (x === 1) { osc(A.sfx, "square", 1319, t + 0.02, 0.09, 0.14); osc(A.sfx, "square", 1976, t + 0.09, 0.16, 0.14); }
    },
    deny: function (t) { osc(A.sfx, "square", 180, t, 0.16, 0.2); osc(A.sfx, "square", 150, t + 0.08, 0.18, 0.2); },
    launch: function (t, x) {
      if (x === 2) hiss(A.sfx, t, 1.0, 0.4, "bandpass", 2600, 4);
      else hiss(A.sfx, t, 0.4, 0.2, "bandpass", 1800, 2, 600);
      if (x === 1) { [72, 76, 79, 84].forEach(function (m, i) { osc(A.sfx, "square", mtof(m), t + i * 0.05, 0.09, 0.14); }); }
    },
    wall: function (t, x) { osc(A.sfx, "sine", 110, t, 0.25, 0.8 * (0.5 + x / 2), 45, 0.05); hiss(A.sfx, t, 0.18, 0.5, "lowpass", 900, 0.7); hiss(A.sfx, t + 0.02, 0.35, 0.25 * x, "highpass", 4500, 0.7); },
    bump: function (t) { osc(A.sfx, "sine", 160, t, 0.12, 0.5, 70, 0.05); hiss(A.sfx, t, 0.08, 0.3, "bandpass", 700, 1); },
    beep: function (t, x) { osc(A.sfx, "square", x ? 880 : 440, t, x ? 0.7 : 0.22, 0.2, 0, 0.8); },
    lap: function (t, x) { (x ? [76, 79, 83, 88] : [79, 84]).forEach(function (m, i) { osc(A.sfx, "square", mtof(m), t + i * 0.07, 0.12, 0.16); }); },
    finish: function (t, x) {
      const up = x ? [72, 76, 79, 84, 79, 84, 88] : [67, 72, 76, 79];
      up.forEach(function (m, i) { osc(A.sfx, "square", mtof(m), t + i * 0.09, 0.15, 0.17, 0, 0.6); });
      if (x) { [84, 88, 91].forEach(function (m) { osc(A.sfx, "triangle", mtof(m), t + up.length * 0.09, 0.9, 0.13, 0, 0.3); }); hiss(A.sfx, t + 0.2, 2.0, 0.35, "bandpass", 1100, 0.4); }
    },
    pop: function (t) { hiss(A.sfx, t, 0.05, 0.5, "lowpass", 600, 1); osc(A.sfx, "square", 70, t, 0.04, 0.3, 40); }
  };
  function sfx(name, x) {
    if (!A || muted || A.c.state !== "running" || !CUES[name]) return;
    try { CUES[name](A.c.currentTime + 0.005, x || 0); } catch (e) { /* sound is never worth a crash */ }
  }
  // Every frame: the mute button, the music, and the engine voices.
  function engine() {
    if (!A || !window.Shell) return;
    const c = A.c, now = c.currentTime, m = shellMuted(), st = Shell.state();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, now, 0.02); }
    const wantMusic = musicOn && !muted && c.state === "running" && st === "playing";
    if (wantMusic && !stopMusic) stopMusic = startMusic(c, A.music);
    else if (!wantMusic && stopMusic) { stopMusic(); stopMusic = null; }
    const live = st === "playing" && S.P;
    const P = S.P;
    if (!live) {
      A.eng.gain.setTargetAtTime(0, now, 0.05); A.ai.gain.setTargetAtTime(0, now, 0.05);
      A.squeal.g.gain.setTargetAtTime(0, now, 0.05); A.wind.g.gain.setTargetAtTime(0, now, 0.05); A.rumble.g.gain.setTargetAtTime(0, now, 0.05);
      return;
    }
    let rpm = P.rpm;
    if (P.redT > 0 || limT > 0) rpm *= 0.97 + Math.random() * 0.06;   // the limiter stutters
    if (limT > 0) limT -= 1 / 60;
    const f = rpm / 60 * 2;                                // a four: two firing pulses a turn
    A.o1.frequency.setTargetAtTime(f, now, 0.015);
    A.o2.frequency.setTargetAtTime(f * 0.5, now, 0.015);
    A.o3.frequency.setTargetAtTime(f * 1.007, now, 0.015);
    const thr = P.gas || INPUT.gas ? 1 : 0, cut = P.shiftT > 0 || (P.redT > 0 && Math.random() < 0.5);
    A.engF.frequency.setTargetAtTime(cut ? 300 : 420 + rpm * (0.18 + 0.22 * thr), now, 0.03);
    A.eng.gain.setTargetAtTime(cut ? 0.05 : 0.12 + 0.12 * thr, now, 0.02);
    // nearest rival
    let near = null, nd = 1e9;
    for (let i = 1; i < S.cars.length; i++) {
      const o = S.cars[i], d = TRACK && TRACK.closed ? Math.abs(mod(o.dist - P.dist + TRACK.L / 2, TRACK.L) - TRACK.L / 2) : Math.abs(o.dist - P.dist);
      if (d < nd) { nd = d; near = o; }
    }
    if (near) {
      A.oa.frequency.setTargetAtTime(Math.max(30, near.rpm / 60 * 2), now, 0.05);
      A.ai.gain.setTargetAtTime(0.06 * clamp(1 - nd / 45, 0, 1), now, 0.08);
    }
    const sq = clamp(P.slip * 1.6 + (P.spinT > 0 ? 0.7 : 0), 0, 1) * (P.v > 3 || P.spinT > 0 ? 1 : 0);
    A.squeal.g.gain.setTargetAtTime(sq * 0.22, now, 0.04);
    A.squeal.f.frequency.setTargetAtTime(2000 + sq * 800, now, 0.05);
    A.wind.g.gain.setTargetAtTime(Math.min(0.18, P.v * P.v * 0.00004), now, 0.1);
    A.rumble.g.gain.setTargetAtTime(P.offroad && P.v > 4 ? 0.5 : 0, now, 0.04);
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
    label(); engine();
  }
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
    unlock: unlock, sfx: sfx, engine: engine, button: button,
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    limiter: function () { limT = 0.06; if (A && !muted && Math.random() < 0.35) sfx("pop"); },
    aiShift: function (c) {
      if (!A || muted) return;
      const P = S.P, d = Math.abs(c.dist - P.dist);
      if (d < 25) { try { hiss(A.sfx, A.c.currentTime, 0.2, 0.12 * (1 - d / 25), "highpass", 3000, 0.8, 6000); } catch (e) { /* ignore */ } }
    },
    peek: function () { return { made: !!A, state: A ? A.c.state : "none", music: !!stopMusic, musicOn: musicOn, muted: muted }; }
  };
})();

/* ---------------- LED ribbon board ----------------
   One dot-matrix board, shown three ways: across the start gantry, on trackside boards, and as a thin strip in the
   HUD so its calls are never out of sight. Everything is painted into a tiny canvas, one pixel per LED; a small shader
   turns each pixel into a glowing dot in 3D. It scrolls its programme right to left and cuts to animated calls when
   the race gives it something to shout about (perfect shifts, launches, laps, places, the finish). */
const LED_ROWS = 16, LED_COLS = 240;
const LED_SPEED = 38;                                      // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 2) / 7));
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["SHIFT IN THE GREEN", "lime"], ["BE KIND, REWIND", "pink"], ["NO QUARTERS REQUIRED", "cyan"]];
// Plugs for the rest of the arcade: [game, one-line tag]. Edit freely, the board lays itself out.
const LED_PLUGS = [
  ["TAPE PIN LANES", "BOWLING"], ["SHELF LINKS", "MINI GOLF"], ["BARGAIN BIN BUCKETS", "HOOPS"],
  ["BLEACHER CARTS", "HOME RUN DERBY"], ["TICKET ROLL ALLEY", "ROLL FOR TICKETS"], ["PAWN SHOP POOL", "RACK 'EM UP"],
  ["RINK RAT SHOOTOUT", "HOCKEY SHOOTOUT"], ["FOURTH AND COLLECT", "SPLIT THE UPRIGHTS"], ["POWDER DAY HAUL", "HIT THE SLOPES"],
  ["TABLE RINK RUMBLE", "AIR HOCKEY"], ["FLEA FORTRESS FLYBY", "PLAY IT FREE"], ["CREATURE FEATURE KO", "VHS BOSS RUSH"]
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

// The whole scrolling programme, painted once into one long strip.
function ledStrip(script) {
  const H = LED_ROWS, big = LED_BIG, yBig = Math.floor((H - 7 * big) / 2), GAP = 12, items = [];
  // The wordmark at board resolution: the cream lettering pushed to full brightness, the red rim kept dimmer,
  // the navy outline dropped to dark, so the script reads light on black.
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
  // an ad card: a color bar, a little "FREE" tab with the tag beside it, the game's name underneath
  function plug(name, tag, color) {
    const pad = 6, tab = ledTextW("FREE", 1) + 4, top = 1;
    const w = pad + Math.max(ledTextW(name, 1), tab + 4 + ledTextW(tag, 1));
    items.push({ w: w, draw: function (g, x) {
      g.fillStyle = color; g.fillRect(x, 1, 2, H - 2);
      g.fillStyle = LED_C.yellow; g.fillRect(x + pad, top - 1 < 0 ? 0 : top - 1, tab, 8);
      ledText(g, "FREE", x + pad + 2, top, 1, 1, "#000000");
      ledText(g, tag, x + pad + tab + 4, top, 1, 1, LED_C.white);
      ledText(g, name, x + pad, top + 8, 1, 1, color);
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
  const c = mkCanvas(total, H), g = c.getContext("2d");
  g.fillStyle = "#000000"; g.fillRect(0, 0, total, H);
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
  const start = ((-(LED_COLS - strip.markW) / 2) % sw + sw) % sw;   // open with the wordmark in the middle
  return { canvas: c, g: g, strip: strip.canvas, scroll: start, pos: -1, msg: null, queue: [], frame: -1, lastScore: 0, tex: null, hud: null, hudDirty: true };
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
// Cut to a list of calls (or queue them after whatever is showing), then go back to the scroll.
function ledPlay(list, append) {
  const L = LED;
  if (!L || !list.length) return;
  if (append && L.msg) { if (L.queue.length < 2) for (let i = 0; i < list.length; i++) L.queue.push(list[i]); return; }
  L.msg = list[0]; L.msg.t = 0;
  L.queue = list.slice(1);
  L.frame = -1;
}
function ledReset() { if (!LED) return; LED.msg = null; LED.queue = []; LED.pos = -1; LED.lastScore = 0; }
function ledShift(row) {
  ledPlay([ledMsg("perfect", row >= 3 ? "PERFECT X" + row : "PERFECT SHIFT", 1.5)]);
}
function ledFinal(score) {
  if (!LED) return;
  ledPlay([ledMsg("score", "SCORE", 6, { value: score, from: 0, final: true, wait: 0.5 })], true);
}

function ledDrawMsg(g, m) {
  const W = LED_COLS, H = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((H - 7 * big) / 2), mid = Math.round(W / 2);
  const step = calm ? 0 : Math.floor(m.t * 24);
  function fit(str) { let sx = big; while (sx > 1 && ledTextW(str, sx) > W - 12) sx--; return sx; }
  function chase(color, dir) {
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < W; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(W - x - 3, H - 1, 3, 1); }
  }
  const sx = fit(m.text), w = ledTextW(m.text, sx), x0 = Math.round((W - w) / 2), y0 = Math.floor((H - 7 * sx) / 2);

  if (m.kind === "flash" || m.kind === "perfect") {         // strobe, then the call with chevrons racing outward
    const col1 = m.kind === "perfect" ? LED_C.lime : LED_C.yellow;
    if (!calm && t < 0.45 && Math.floor(t * 14) % 2 === 0) {
      g.fillStyle = col1; g.fillRect(0, 0, W, H);
      ledText(g, m.text, x0, y0, sx, sx, "#000000");
      return;
    }
    const span = 6 * big + 4, ph = calm ? 0 : Math.floor((t * 50) % span);
    for (let k = 0; k < 14; k++) {
      const off = Math.round(w / 2) + 8 + k * span + ph;
      if (off > mid + span) break;
      const col = k % 2 ? (m.kind === "perfect" ? LED_C.cyan : LED_C.red) : (m.kind === "perfect" ? LED_C.lime : LED_C.orange);
      ledText(g, ">", mid + off, yBig, big, big, col);
      ledText(g, "<", mid - off - 5 * big, yBig, big, big, col);
    }
    const cyc = m.kind === "perfect" ? [LED_C.lime, LED_C.white, LED_C.yellow] : [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0, y0, sx, sx, calm ? cyc[0] : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 14; i++) g.fillRect((Math.random() * W) | 0, (Math.random() * H) | 0, 1, 1); }
    chase(m.kind === "perfect" ? LED_C.lime : LED_C.amber, 1);
    return;
  }
  if (m.kind === "slide") {                                 // slides in from the right, a glint sweeps across it
    const k = calm ? 1 : Math.min(1, t / 0.4), e = 1 - Math.pow(1 - k, 3);
    const x = Math.round(x0 + (1 - e) * W), col = m.color || LED_C.cyan;
    ledText(g, m.text, x, y0, sx, sx, col);
    if (!calm && k >= 1) {
      const bx = Math.floor(((t - 0.4) * 150) % (W + 60)) - 30;
      g.save(); g.beginPath(); g.rect(bx, 0, 10, H); g.clip(); ledText(g, m.text, x, y0, sx, sx, "#ffffff"); g.restore();
    }
    chase(col, -1);
    return;
  }
  if (m.kind === "blink") {
    if (calm || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, y0, sx, sx, m.color || LED_C.pink);
    g.fillStyle = m.color || LED_C.red; g.fillRect(0, H - 1, W, 1); g.fillRect(0, 0, W, 1);
    return;
  }
  if (m.kind === "count") {                                 // the countdown: a big digit between two bars of light
    const col = LED_C.red, grow = calm ? 1 : Math.min(1, t / 0.15);
    ledText(g, m.text, Math.round((W - ledTextW(m.text, big)) / 2), yBig, big, big, grow < 1 ? LED_C.white : col);
    const bw = Math.round((W / 2 - 20) * (1 - Math.min(1, t)));
    g.fillStyle = LED_C.red; g.fillRect(0, yBig + 3, bw, 7); g.fillRect(W - bw, yBig + 3, bw, 7);
    return;
  }
  // score: a label and a value; numbers count up to it
  let val = m.value;
  const k = calm ? 1 : Math.min(1, t / 0.8);
  if (typeof val === "number") val = Math.round((m.from || 0) + (val - (m.from || 0)) * k);
  const label = m.text + " ", vs = String(val), lw = ledTextW(label + vs, big), x = Math.round((W - lw) / 2);
  const xn = ledText(g, label, x, yBig, big, big, LED_C.amber);
  const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
  ledText(g, vs, xn, yBig, big, big, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
  if (!calm && m.wait === 0 && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(W * m.t / 0.3), 0, W, H); }
  chase(LED_C.amber, 1);
}
function ledDraw() {
  const L = LED, g = L.g, W = LED_COLS, H = LED_ROWS;
  g.fillStyle = "#000000"; g.fillRect(0, 0, W, H);
  if (L.msg) { ledDrawMsg(g, L.msg); return; }
  const sw = L.strip.width;
  let sx = L.pos, dx = 0;
  while (dx < W) { const n = Math.min(W - dx, sw - sx); g.drawImage(L.strip, sx, 0, n, H, dx, 0, n, H); dx += n; sx = 0; }
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
  if (redraw) { ledDraw(); if (L.tex) L.tex.needsUpdate = true; L.hudDirty = true; }
}
// The HUD copy: each LED becomes a little round dot with a soft glow. Rebuilt only when the board changes.
function ledHud() {
  const L = LED;
  if (!L.hud) { L.hud = mkCanvas(LED_COLS * 3, LED_ROWS * 3); L.hudG = L.hud.getContext("2d"); }
  if (!L.hudDirty) return L.hud;
  L.hudDirty = false;
  const g = L.hudG, cw = L.hud.width, ch = L.hud.height;
  g.globalCompositeOperation = "source-over";
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#000"; g.fillRect(0, 0, cw, ch);
  g.drawImage(L.canvas, 0, 0, cw, ch);
  if (!L.mask) {                                            // dark gaps between the dots
    const m = mkCanvas(3, 3), mg = m.getContext("2d");
    mg.fillStyle = "rgba(0,0,0,.78)"; mg.fillRect(0, 2, 3, 1); mg.fillRect(2, 0, 1, 3);
    mg.fillStyle = "rgba(0,0,0,.25)"; mg.fillRect(0, 0, 1, 1); mg.fillRect(1, 0, 1, 1); mg.fillRect(0, 1, 1, 1);
    L.mask = g.createPattern(m, "repeat");
  }
  g.fillStyle = L.mask; g.fillRect(0, 0, cw, ch);
  return L.hud;
}

/* =====================================================================================
   3D presentation
   ===================================================================================== */
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
// The script wordmark trimmed to its ink. If the PNG is missing, plain lettering stands in.
function scriptCanvas(img) {
  if (img && img.naturalWidth > 0) {
    const k = Math.min(1, 1024 / img.naturalWidth);
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
function candyText(g, str, x, y, size, maxW, cols) {
  const face = '"Arial Black", "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
  g.font = "900 " + size + "px " + face;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + face; }
  cols = cols || ["#fff06a", "#ffc21a", "#ff7a0f"];
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = size * 0.36; g.strokeStyle = "#08205f"; g.strokeText(str, x, y + size * 0.06);
  g.lineWidth = size * 0.17; g.strokeStyle = "#ffffff"; g.strokeText(str, x, y);
  const gr = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  gr.addColorStop(0, cols[0]); gr.addColorStop(0.55, cols[1]); gr.addColorStop(1, cols[2]);
  g.fillStyle = gr; g.fillText(str, x, y);
}
function neonText(g, str, x, y, size, col, maxW) {
  const face = '"Arial Black", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
  g.font = "900 " + size + "px " + face;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + face; }
  g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = col; g.shadowBlur = size * 0.5;
  g.lineWidth = size * 0.1; g.strokeStyle = col; g.strokeText(str, x, y);
  g.fillStyle = "#ffffff"; g.fillText(str, x, y);
  g.shadowBlur = 0;
}

/* ---------------- Themes ---------------- */
const THEMES = {
  city: { sky: ["#05061a", "#1a0f45", "#5a1f6e", "#c23b7a"], fog: 0x1a1240, fogNear: 90, fogFar: 620, hemi: [0x8a8cff, 0x24183c, 0.75], sun: [0xb9c6ff, 0.6],
          ground: "#15151f", accent: "#ff3fa4", accent2: "#3ff0ff", night: true, stars: true },
  desert: { sky: ["#1b0b3d", "#5b1a6e", "#e8466b", "#ffb347"], fog: 0xd9706a, fogNear: 160, fogFar: 900, hemi: [0xffd1b0, 0x6b3a52, 1.35], sun: [0xffb070, 2.2],
            ground: "#c9844c", accent: "#ff8a1e", accent2: "#ffd23f", night: false, sunDisc: true },
  board: { sky: ["#030a1c", "#0b2350", "#16466e", "#2b6e8a"], fog: 0x0f2b4a, fogNear: 90, fogFar: 650, hemi: [0x7fd6ff, 0x1a2a40, 0.8], sun: [0xcfe6ff, 0.7],
           ground: "#d9c08a", accent: "#3ff0ff", accent2: "#ff3fa4", night: true, stars: true, moon: true },
  drag: { sky: ["#0d1238", "#3a2a7a", "#c2508a", "#ffa65c"], fog: 0x8a5a8a, fogNear: 150, fogFar: 900, hemi: [0xffe0c8, 0x40304a, 1.2], sun: [0xffc090, 1.8],
          ground: "#3f6b2e", accent: "#ffd23f", accent2: "#ff3fa4", night: false, sunDisc: true }
};

/* ---------------- Painted textures ---------------- */
function skyCanvas(th) {
  const c = mkCanvas(1024, 512), g = c.getContext("2d"), rnd = rng(5);
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, th.sky[0]); gr.addColorStop(0.32, th.sky[1]); gr.addColorStop(0.44, th.sky[2]); gr.addColorStop(0.5, th.sky[3]); gr.addColorStop(1, th.sky[3]);
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  if (th.stars) for (let i = 0; i < 420; i++) {
    const y = Math.pow(rnd(), 1.6) * 220;
    g.fillStyle = "rgba(255,255,255," + (0.3 + rnd() * 0.7) * (1 - y / 240) + ")";
    g.fillRect(rnd() * 1024, y, rnd() < 0.1 ? 2 : 1, rnd() < 0.1 ? 2 : 1);
  }
  if (th.moon) {
    const gl = g.createRadialGradient(300, 120, 0, 300, 120, 60);
    gl.addColorStop(0, "rgba(220,240,255,.5)"); gl.addColorStop(1, "rgba(220,240,255,0)");
    g.fillStyle = gl; g.fillRect(240, 60, 120, 120);
    g.fillStyle = "#eef6ff"; g.beginPath(); g.arc(300, 120, 16, 0, TAU); g.fill();
  }
  if (th.sunDisc) {                                       // a big striped sunset sun, low on the horizon
    const cx = 512, cy = 232, r = 30;
    const gl = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 2.4);
    gl.addColorStop(0, "rgba(255,200,120,.55)"); gl.addColorStop(1, "rgba(255,120,120,0)");
    g.fillStyle = gl; g.fillRect(cx - r * 2.5, cy - r * 2.5, r * 5, r * 5);
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
    const sg = g.createLinearGradient(0, cy - r, 0, cy + r);
    sg.addColorStop(0, "#fff36a"); sg.addColorStop(0.5, "#ff9a3c"); sg.addColorStop(1, "#ff3f7a");
    g.fillStyle = sg; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.fillStyle = th.sky[2];
    for (let k = 0; k < 5; k++) { const y = cy + 3 + k * k * 0.9 + k * 3.2; g.fillRect(cx - r, y, r * 2, 1 + k * 0.6); }
    g.restore();
  }
  return c;
}
// A ring of far silhouettes on the horizon: skyline, mesas or hills, with a few lit windows at night.
function horizonCanvas(kind, th) {
  const c = mkCanvas(2048, 256), g = c.getContext("2d"), rnd = rng(kind.length * 13);
  if (kind === "city" || kind === "board") {
    let x = 0;
    while (x < 2048) {
      const w = 20 + rnd() * 60, h = 40 + rnd() * (kind === "city" ? 190 : 90);
      g.fillStyle = kind === "city" ? "#0d0a24" : "#0a1830"; g.fillRect(x, 256 - h, w, h);
      for (let y = 256 - h + 6; y < 250; y += 7) for (let xx = x + 3; xx < x + w - 3; xx += 6) if (rnd() < 0.28) {
        g.fillStyle = rnd() < 0.7 ? "rgba(255,214,140,.85)" : "rgba(120,220,255,.85)"; g.fillRect(xx, y, 3, 3);
      }
      x += w + rnd() * 6;
    }
  } else {
    g.fillStyle = kind === "desert" ? "#7a3550" : "#3c2b5e";
    g.beginPath(); g.moveTo(0, 256);
    for (let x = 0; x <= 2048; x += 16) {
      const n = Math.sin(x * 0.004) * 30 + Math.sin(x * 0.011 + 1) * 18 + Math.sin(x * 0.031) * 6;
      const mesa = kind === "desert" && (Math.sin(x * 0.006 + 2) > 0.55) ? 40 : 0;
      g.lineTo(x, 160 - n - mesa);
    }
    g.lineTo(2048, 256); g.closePath(); g.fill();
    g.fillStyle = kind === "desert" ? "rgba(255,150,120,.25)" : "rgba(255,170,200,.2)"; g.fillRect(0, 150, 2048, 4);
  }
  return c;
}
function asphaltCanvas(theme) {
  const c = mkCanvas(256, 512), g = c.getContext("2d"), rnd = rng(9);
  if (theme === "board") {                                // boardwalk: planks across the road
    for (let y = 0; y < 512; y += 16) {
      g.fillStyle = "hsl(" + (24 + rnd() * 8) + ",38%," + (24 + rnd() * 8) + "%)"; g.fillRect(0, y, 256, 15);
      g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, y + 15, 256, 1);
      for (let k = 0; k < 6; k++) { g.fillStyle = "rgba(255,230,190,.06)"; g.fillRect(0, y + rnd() * 14, 256, 1); }
      g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect((rnd() * 256) | 0, y + 3, 2, 2); g.fillRect((rnd() * 256) | 0, y + 10, 2, 2);
    }
  } else {
    g.fillStyle = theme === "desert" ? "#3b3640" : theme === "drag" ? "#2a2a30" : "#24242c"; g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 14000; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.12)"; g.fillRect(rnd() * 256, rnd() * 512, 1.4, 1.4); }
    if (theme === "drag") {                                // rubber laid down in each lane
      [64, 192].forEach(function (x) { const gr = g.createLinearGradient(x - 40, 0, x + 40, 0); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.3, "rgba(0,0,0,.35)"); gr.addColorStop(0.5, "rgba(0,0,0,.12)"); gr.addColorStop(0.7, "rgba(0,0,0,.35)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x - 40, 0, 80, 512); });
    }
  }
  const line = theme === "board" ? "rgba(140,255,250,.9)" : "rgba(240,240,232,.92)";
  g.fillStyle = line; g.fillRect(5, 0, 4, 512); g.fillRect(247, 0, 4, 512);
  if (theme === "drag") { g.fillStyle = "#ffd23f"; g.fillRect(126, 0, 4, 512); }
  else { g.fillStyle = theme === "board" ? "rgba(255,120,220,.9)" : line; [85, 169].forEach(function (x) { g.fillRect(x, 0, 3, 200); }); }
  return c;
}
function curbCanvas(a, b) {
  const c = mkCanvas(32, 128), g = c.getContext("2d");
  g.fillStyle = a; g.fillRect(0, 0, 32, 64); g.fillStyle = b; g.fillRect(0, 64, 32, 64);
  g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, 0, 3, 128);
  return c;
}
function shoulderCanvas(theme) {
  const c = mkCanvas(128, 128), g = c.getContext("2d"), rnd = rng(31);
  const base = { city: "#3a3a46", desert: "#c48a54", board: "#6b4a2e", drag: "#5d5d64" }[theme];
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2500; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.1)"; g.fillRect(rnd() * 128, rnd() * 128, 2, 2); }
  if (theme === "city" || theme === "drag") { g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(0, 63, 128, 2); g.fillRect(63, 0, 2, 128); }
  if (theme === "board") for (let x = 0; x < 128; x += 16) { g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(x, 0, 1, 128); }
  return c;
}
function groundCanvas(theme) {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(77);
  const th = THEMES[theme];
  g.fillStyle = th.ground; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.08)";
    g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  if (theme === "city") { g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(0, 0, 256, 3); g.fillRect(0, 0, 3, 256); }
  if (theme === "desert") for (let i = 0; i < 40; i++) { g.strokeStyle = "rgba(120,60,30,.18)"; g.lineWidth = 2; g.beginPath(); const y = rnd() * 256; g.moveTo(0, y); g.bezierCurveTo(80, y + 10, 170, y - 10, 256, y); g.stroke(); }
  if (theme === "drag") for (let i = 0; i < 6000; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(120,190,80,.15)" : "rgba(20,50,10,.15)"; g.fillRect(rnd() * 256, rnd() * 256, 1, 3); }
  return c;
}
// Barriers: a long repeating panel. Desert and boardwalk use see-through rails.
function wallCanvas(theme) {
  const c = mkCanvas(256, 64), g = c.getContext("2d");
  const th = THEMES[theme];
  if (theme === "desert") {
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = "#6f7480"; for (let x = 8; x < 256; x += 64) g.fillRect(x, 20, 7, 44);
    const gr = g.createLinearGradient(0, 14, 0, 36); gr.addColorStop(0, "#f2f4f8"); gr.addColorStop(0.5, "#9aa1ad"); gr.addColorStop(1, "#d8dce4");
    g.fillStyle = gr; g.fillRect(0, 14, 256, 22);
    g.fillStyle = "#ff8a1e"; for (let x = 30; x < 256; x += 64) g.fillRect(x, 20, 10, 6);
    return c;
  }
  if (theme === "board") {
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = "#f4efe2"; for (let x = 4; x < 256; x += 32) g.fillRect(x, 8, 6, 56);
    g.fillRect(0, 6, 256, 8); g.fillRect(0, 34, 256, 5);
    return c;
  }
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, "#d9dbe2"); gr.addColorStop(1, "#8c8f99");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 64);
  g.fillStyle = th.accent; g.fillRect(0, 14, 256, 10);
  g.fillStyle = "#1b1d26"; g.fillRect(0, 24, 256, 3);
  g.fillStyle = "rgba(0,0,0,.35)"; for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 2, 64);
  return c;
}
function windowsCanvas(seed, cols, rows) {
  const c = mkCanvas(256, 512), g = c.getContext("2d"), rnd = rng(seed);
  g.fillStyle = "#16142a"; g.fillRect(0, 0, 256, 512);
  const cw = 256 / cols, rh = 512 / rows;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const lit = rnd() < 0.42;
    g.fillStyle = lit ? (rnd() < 0.75 ? "#ffd68c" : rnd() < 0.5 ? "#9fe8ff" : "#ff9ad2") : "#272442";
    g.fillRect(k * cw + cw * 0.18, r * rh + rh * 0.2, cw * 0.64, rh * 0.55);
  }
  g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(0, 0, 256, 6);
  return c;
}
function glowCanvas(inner, outer) {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner || "rgba(255,255,255,1)"); gr.addColorStop(0.25, inner || "rgba(255,255,255,.8)"); gr.addColorStop(1, outer || "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function beamCanvas() {                                   // headlight light pooled on the road ahead
  const c = mkCanvas(128, 256), g = c.getContext("2d");
  for (let y = 0; y < 256; y++) {
    const k = y / 256, w = 20 + k * 100, a = (1 - k) * 0.55 * Math.min(1, (256 - y) / 30) * Math.min(1, y / 18 + 0.2);
    const gr = g.createLinearGradient(64 - w / 2, 0, 64 + w / 2, 0);
    gr.addColorStop(0, "rgba(255,240,200,0)"); gr.addColorStop(0.5, "rgba(255,240,200," + a + ")"); gr.addColorStop(1, "rgba(255,240,200,0)");
    g.fillStyle = gr; g.fillRect(0, 255 - y, 128, 1);
  }
  return c;
}
function blobCanvas() {
  const c = mkCanvas(64, 128), g = c.getContext("2d");
  g.filter = "blur(7px)"; g.fillStyle = "rgba(0,0,0,.75)"; rrectPath(g, 12, 12, 40, 104, 14); g.fill(); g.filter = "none";
  g.fillStyle = "rgba(0,0,0,.25)"; rrectPath(g, 16, 18, 32, 92, 10); g.fill();
  return c;
}
function checkerCanvas(n) {
  const c = mkCanvas(256, 32), g = c.getContext("2d"), s = 256 / n;
  for (let x = 0; x < n; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? "#111" : "#f4f4f4"; g.fillRect(x * s, y * 16, s, 16); }
  return c;
}
function rimCanvas(col) {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.fillStyle = "#15161b"; g.beginPath(); g.arc(64, 64, 64, 0, TAU); g.fill();
  g.fillStyle = "#c8ccd6"; g.beginPath(); g.arc(64, 64, 44, 0, TAU); g.fill();
  g.fillStyle = "#3a3d47";
  for (let k = 0; k < 5; k++) { g.save(); g.translate(64, 64); g.rotate(k * TAU / 5); g.beginPath(); g.moveTo(-7, 12); g.lineTo(-10, 40); g.lineTo(10, 40); g.lineTo(7, 12); g.closePath(); g.fill(); g.restore(); }
  g.fillStyle = col; g.beginPath(); g.arc(64, 64, 11, 0, TAU); g.fill();
  return c;
}
// The livery painted on each side of a car (shape coordinates: x -2.4..2.4 m, y 0.15..1.05 m).
function liveryCanvas(car, script) {
  const c = mkCanvas(512, 128), g = c.getContext("2d");
  const X = function (x) { return (x + 2.4) / 4.8 * 512; }, Y = function (y) { return (1 - (y - 0.15) / 0.9) * 128; };
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, shade(car.color, 0.25)); gr.addColorStop(0.55, car.color); gr.addColorStop(1, shade(car.color, -0.35));
  g.fillStyle = gr; g.fillRect(0, 0, 512, 128);
  g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, Y(0.36), 512, 128);                      // rocker panel
  g.fillStyle = car.trim; g.fillRect(0, Y(0.74), 512, Y(0.68) - Y(0.74));                 // twin stripes
  g.fillRect(0, Y(0.64), 512, Y(0.61) - Y(0.64));
  g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(X(0.55), Y(0.88), 2, Y(0.36) - Y(0.88)); g.fillRect(X(-0.65), Y(0.9), 2, Y(0.36) - Y(0.9));   // door seams
  // number roundel on the door
  const cx = X(-0.05), cy = Y(0.54), r = 23;
  g.fillStyle = "#ffffff"; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  g.lineWidth = 3; g.strokeStyle = "#101219"; g.stroke();
  g.fillStyle = "#101219"; g.font = "900 28px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(car.num), cx, cy + 1);
  // the script wordmark on a plate over the rear quarter
  const pw = 120, ph = 44, px = X(-1.35) - pw / 2, py = Y(0.56) - ph / 2;
  rrectPath(g, px, py, pw, ph, 9); g.fillStyle = "rgba(13,31,92,.92)"; g.fill();
  drawScript(g, script, px + pw / 2, py + ph / 2, pw - 10, ph - 6);
  const gl = g.createLinearGradient(0, 0, 0, 50); gl.addColorStop(0, "rgba(255,255,255,.3)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.fillRect(0, 0, 512, 50);
  return c;
}
function billboardCanvas(script, theme, tag, seed) {
  const c = mkCanvas(1024, 400), g = c.getContext("2d"), th = THEMES[theme], rnd = rng(seed);
  const bgs = [["#2a0b5a", "#ff3fa4"], ["#06264a", "#3ff0ff"], ["#3a0d0d", "#ff8a1e"], ["#0d2a12", "#9bff3f"]];
  const b = bgs[seed % bgs.length];
  const gr = g.createLinearGradient(0, 0, 1024, 400);
  gr.addColorStop(0, b[0]); gr.addColorStop(1, shade(b[0], 0.15));
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 400);
  g.save(); g.globalAlpha = 0.18; g.fillStyle = b[1];
  for (let x = -400; x < 1024; x += 70) { g.beginPath(); g.moveTo(x, 400); g.lineTo(x + 400, 0); g.lineTo(x + 430, 0); g.lineTo(x + 30, 400); g.closePath(); g.fill(); }
  g.restore();
  g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, 300, 1024, 100);
  drawScript(g, script, 512, 165, 820, 250);
  candyText(g, tag, 512, 348, 58, 920, th === THEMES.desert ? ["#fff7cf", "#ffd23f", "#ff8a1e"] : null);
  g.lineWidth = 14; g.strokeStyle = b[1]; g.strokeRect(7, 7, 1010, 386);
  g.lineWidth = 3; g.strokeStyle = "#ffffff"; g.strokeRect(18, 18, 988, 364);
  return c;
}
function arcadeSignCanvas(script) {
  const c = mkCanvas(1024, 512), g = c.getContext("2d");
  g.fillStyle = "#0b0a1c"; rrectPath(g, 0, 0, 1024, 512, 40); g.fill();
  g.lineWidth = 12; g.strokeStyle = "#ff3fa4"; g.shadowColor = "#ff3fa4"; g.shadowBlur = 30; rrectPath(g, 18, 18, 988, 476, 30); g.stroke(); g.shadowBlur = 0;
  drawScript(g, script, 512, 200, 860, 300);
  neonText(g, "ARCADE", 512, 418, 120, "#3ff0ff", 760);
  return c;
}
function arcadeFrontCanvas() {
  const c = mkCanvas(1024, 256), g = c.getContext("2d"), rnd = rng(12);
  g.fillStyle = "#2b1d4a"; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = "#ffd23f"; g.fillRect(0, 0, 1024, 10); g.fillStyle = "#ff3fa4"; g.fillRect(0, 10, 1024, 6);
  for (let k = 0; k < 6; k++) {                            // windows full of glowing cabinets
    const x = 30 + k * 165; if (k === 3) continue;
    g.fillStyle = "#0a0716"; g.fillRect(x, 60, 140, 150);
    for (let m = 0; m < 4; m++) {
      const cx = x + 12 + m * 33;
      g.fillStyle = ["#3ff0ff", "#ff3fa4", "#9bff3f", "#ffd23f"][(k + m) % 4]; g.fillRect(cx, 110, 22, 20);
      g.fillStyle = "#1b1530"; g.fillRect(cx - 2, 132, 26, 78);
    }
    g.fillStyle = "rgba(160,220,255,.12)"; g.fillRect(x, 60, 140, 150);
  }
  g.fillStyle = "#0a0716"; g.fillRect(30 + 3 * 165 + 20, 70, 100, 186);   // the door
  g.fillStyle = "rgba(255,210,63,.6)"; g.fillRect(30 + 3 * 165 + 24, 74, 44, 182); g.fillRect(30 + 3 * 165 + 72, 74, 44, 182);
  neonText(g, "FREE PLAY", 545 + 5, 40, 30, "#9bff3f");
  neonText(g, "OPEN LATE", 160, 40, 28, "#ff3fa4");
  neonText(g, "HIGH SCORES", 880, 40, 28, "#3ff0ff");
  return c;
}
function boothCanvas(seed) {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  const cols = [["#ff3fa4", "#ffffff"], ["#3ff0ff", "#ffffff"], ["#ffd23f", "#ff4b3e"], ["#9bff3f", "#2a6bff"]][seed % 4];
  for (let x = 0; x < 256; x += 32) { g.fillStyle = cols[(x / 32) % 2]; g.fillRect(x, 0, 32, 256); }
  return c;
}
function boothFrontCanvas(seed) {
  const c = mkCanvas(256, 128), g = c.getContext("2d");
  const names = ["SKEE BALL", "SNO CONES", "PRIZES", "TOKENS", "CORN DOGS", "RING TOSS", "SALT TAFFY", "FUNNEL CAKE"];
  g.fillStyle = "#1b1530"; g.fillRect(0, 0, 256, 128);
  neonText(g, names[seed % names.length], 128, 34, 30, ["#ff3fa4", "#3ff0ff", "#ffd23f", "#9bff3f"][seed % 4], 230);
  g.fillStyle = "#ffd68c"; g.fillRect(20, 62, 216, 52);
  g.fillStyle = "rgba(0,0,0,.25)"; for (let x = 30; x < 236; x += 30) g.fillRect(x, 70, 18, 36);
  return c;
}
function crowdCanvas() {
  const c = mkCanvas(512, 128), g = c.getContext("2d"), rnd = rng(66);
  g.fillStyle = "#2b2f3c"; g.fillRect(0, 0, 512, 128);
  for (let row = 0; row < 4; row++) {
    const y = 18 + row * 30;
    g.fillStyle = "#3a3f4f"; g.fillRect(0, y + 14, 512, 6);
    for (let x = 4; x < 512; x += 9 + rnd() * 5) {
      const col = ["#ff4b3e", "#3ff0ff", "#ffd23f", "#ffffff", "#9bff3f", "#ff3fa4", "#2a6bff", "#e9a36a"][(rnd() * 8) | 0];
      g.fillStyle = col; g.fillRect(x, y + 2, 7, 12);
      g.fillStyle = ["#f1c7a0", "#d49a6a", "#9c6440", "#5e3a22"][(rnd() * 4) | 0]; g.beginPath(); g.arc(x + 3.5, y - 1, 3.4, 0, TAU); g.fill();
    }
  }
  return c;
}
function mesaCanvas() {
  const c = mkCanvas(64, 256), g = c.getContext("2d"), rnd = rng(4);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "#d9784a"); gr.addColorStop(0.5, "#b2513a"); gr.addColorStop(1, "#7a3348");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  for (let y = 10; y < 256; y += 14 + rnd() * 10) { g.fillStyle = "rgba(255,210,170," + (0.08 + rnd() * 0.1) + ")"; g.fillRect(0, y, 64, 3 + rnd() * 3); }
  return c;
}
function palmLeafCanvas() {
  const c = mkCanvas(128, 32), g = c.getContext("2d");
  g.fillStyle = "#1f8a4a";
  g.beginPath(); g.moveTo(0, 16);
  for (let x = 0; x <= 128; x += 8) g.lineTo(x, 16 - Math.sin(x / 128 * Math.PI) * 13 + (x / 8 % 2 ? 3 : 0));
  for (let x = 128; x >= 0; x -= 8) g.lineTo(x, 16 + Math.sin(x / 128 * Math.PI) * 13 - (x / 8 % 2 ? 3 : 0));
  g.closePath(); g.fill();
  g.strokeStyle = "#0f5a2e"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 16); g.lineTo(128, 16); g.stroke();
  return c;
}
function envFaces(th) {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, th.sky[0]); gr.addColorStop(0.35, th.sky[2]); gr.addColorStop(0.5, "#ffffff"); gr.addColorStop(0.53, th.sky[3]);
    gr.addColorStop(0.56, "#101018"); gr.addColorStop(1, "#000000");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = th.accent; g.fillRect(6, 26, 10, 3); g.fillStyle = th.accent2; g.fillRect(36, 24, 16, 3);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = th.sky[0]; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = th.night ? "#8a8cb0" : "#ffffff"; tg.fillRect(10, 8, 12, 48); tg.fillRect(40, 8, 12, 48);
  const bot = mkCanvas(64, 64), bg = bot.getContext("2d");
  bg.fillStyle = "#08080c"; bg.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* ---------------- Geometry helpers ---------------- */
function roundBox(T, w, h, d, r) {
  const s = 4, half = 0.5 / s;
  r = Math.min(r, w / 2, h / 2, d / 2);
  const g = new T.BoxGeometry(1, 1, 1, s, s, s);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    let nx = px - Math.sign(px) * half, ny = py - Math.sign(py) * half, nz = pz - Math.sign(pz) * half;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    pos.setXYZ(i, bx * Math.sign(px) + nx * r, by * Math.sign(py) + ny * r, bz * Math.sign(pz) + nz * r);
    nor.setXYZ(i, nx, ny, nz);
  }
  pos.needsUpdate = nor.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}
// A cylinder (or a tapered limb) running from point a to point b.
function limb(T, r0, r1, a, b, seg) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  const g = new T.CylinderGeometry(r1, r0, len, seg || 10, 1);
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(dx / len, dy / len, dz / len));
  g.applyQuaternion(q);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}
function ball(T, r, at, sc, seg) {
  const g = new T.SphereGeometry(r, seg || 14, Math.max(8, (seg || 14) - 4));
  if (sc) g.scale(sc[0], sc[1], sc[2]);
  g.translate(at[0], at[1], at[2]);
  return g;
}
// Merge parts [[geometry, "#color"], ...] into one mesh with vertex colors (one draw call a figure).
function merge(T, parts) {
  let n = 0;
  const geos = parts.map(function (p) { const g = p[0].index ? p[0].toNonIndexed() : p[0]; n += g.attributes.position.count; return [g, new T.Color(p[1])]; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  geos.forEach(function (p) {
    const g = p[0], c = p[1], P = g.attributes.position.array, N = g.attributes.normal.array, cnt = g.attributes.position.count;
    pos.set(P, o * 3); nor.set(N, o * 3);
    for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += cnt;
  });
  const out = new T.BufferGeometry();
  out.setAttribute("position", new T.BufferAttribute(pos, 3));
  out.setAttribute("normal", new T.BufferAttribute(nor, 3));
  out.setAttribute("color", new T.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/* ---------------- People: real proportions, about seven and a half heads tall ---------------- */
const SKIN = ["#f1c7a0", "#d49a6a", "#9c6440", "#6e4428"];
// A standing adult, 1.75 m. Returns { body, arm } with the right arm separate so it can wave.
function personGeo(T, o) {
  const skin = o.skin, shirt = o.shirt, pants = o.pants, shoes = o.shoes || "#1b1b22", hair = o.hair || "#2b1a10";
  const parts = [];
  [-1, 1].forEach(function (s) {
    const x = s * 0.1;
    const shoe = new T.BoxGeometry(0.11, 0.08, 0.27); shoe.translate(x, 0.04, 0.04); parts.push([shoe, shoes]);
    parts.push([limb(T, 0.047, 0.058, [x, 0.08, 0], [x, 0.49, 0.01]), pants]);           // shin
    parts.push([ball(T, 0.06, [x, 0.49, 0.01]), pants]);                                  // knee
    parts.push([limb(T, 0.064, 0.088, [x, 0.49, 0.01], [x * 1.05, 0.9, 0]), pants]);      // thigh
  });
  parts.push([ball(T, 0.17, [0, 0.93, 0], [1.05, 0.75, 0.68]), pants]);                    // hips
  const torso = new T.CylinderGeometry(0.205, 0.16, 0.5, 14, 1); torso.scale(1, 1, 0.56); torso.translate(0, 1.18, 0);
  parts.push([torso, shirt]);
  parts.push([ball(T, 0.2, [0, 1.42, 0], [1.08, 0.42, 0.6]), shirt]);                      // shoulders
  parts.push([limb(T, 0.05, 0.048, [0, 1.44, 0], [0, 1.54, 0.01]), skin]);                // neck
  parts.push([ball(T, 0.1, [0, 1.635, 0.01], [0.9, 1.13, 1.02], 16), skin]);              // head
  const cap = new T.SphereGeometry(0.106, 16, 8, 0, TAU, 0, Math.PI * 0.42); cap.scale(0.94, 1.0, 1.04); cap.translate(0, 1.652, -0.004);
  parts.push([cap, hair]);                                                                    // hair: a cap on top
  const back = new T.SphereGeometry(0.105, 16, 8, 0, TAU, 0, Math.PI * 0.5); back.rotateX(-Math.PI / 2); back.scale(0.95, 1.02, 1.0); back.translate(0, 1.64, -0.012);
  parts.push([back, hair]);                                                                   // and down the back of the head
  parts.push([ball(T, 0.02, [0, 1.625, 0.112], null, 6), skin]);                           // nose
  [-0.034, 0.034].forEach(function (x) { parts.push([ball(T, 0.011, [x, 1.65, 0.098], null, 6), "#1b1410"]); });   // eyes
  parts.push([ball(T, 0.026, [0, 1.594, 0.094], [1.3, 0.35, 0.5], 6), "#8a4a3a"]);       // mouth
  // left arm hangs at the side
  parts.push([limb(T, 0.05, 0.043, [-0.215, 1.41, 0], [-0.235, 1.13, 0.02]), shirt]);
  parts.push([limb(T, 0.042, 0.033, [-0.235, 1.13, 0.02], [-0.245, 0.88, 0.05]), skin]);
  parts.push([ball(T, 0.046, [-0.247, 0.835, 0.055], [0.7, 1.2, 0.9]), skin]);
  const body = merge(T, parts);
  // right arm, built hanging from the shoulder pivot at the origin
  const arm = merge(T, [
    [limb(T, 0.05, 0.043, [0, 0, 0], [0.02, -0.28, 0.02]), shirt],
    [limb(T, 0.042, 0.033, [0.02, -0.28, 0.02], [0.03, -0.53, 0.05]), skin],
    [ball(T, 0.046, [0.032, -0.575, 0.055], [0.7, 1.2, 0.9]), skin]
  ]);
  return { body: body, arm: arm, shoulder: [0.215, 1.41, 0] };
}
// A driver, seated, hands on the wheel. Car space: +x forward, +y up, the driver sits at the origin (hips).
function driverGeo(T, suit, helmet) {
  const skin = "#d49a6a", parts = [];
  const torso = new T.CylinderGeometry(0.19, 0.155, 0.48, 12, 1); torso.scale(1, 1, 0.6);
  torso.rotateZ(0.22); torso.translate(-0.05, 0.25, 0);
  parts.push([torso, suit]);
  parts.push([ball(T, 0.19, [-0.1, 0.47, 0], [0.62, 0.42, 1.08]), suit]);                 // shoulders
  parts.push([limb(T, 0.05, 0.05, [-0.1, 0.5, 0], [-0.08, 0.6, 0]), skin]);               // neck
  parts.push([ball(T, 0.135, [-0.07, 0.72, 0], [1.05, 1.0, 0.95], 16), helmet]);          // helmet
  const visor = new T.SphereGeometry(0.137, 16, 8, -0.9, 1.8, 1.15, 0.7); visor.translate(-0.07, 0.72, 0);
  parts.push([visor, "#121624"]);
  [-1, 1].forEach(function (s) {
    const z = s * 0.2;
    parts.push([limb(T, 0.048, 0.042, [-0.1, 0.45, z], [0.14, 0.3, z * 0.95]), suit]);    // upper arm
    parts.push([limb(T, 0.04, 0.034, [0.14, 0.3, z * 0.95], [0.38, 0.38, z * 0.6]), suit]);
    parts.push([ball(T, 0.042, [0.4, 0.39, z * 0.58]), "#151515"]);                      // gloves
    parts.push([limb(T, 0.08, 0.075, [0.0, 0.02, z * 0.5], [0.42, 0.1, z * 0.5]), suit]);  // thigh
  });
  const wheel = new T.TorusGeometry(0.17, 0.018, 6, 20); wheel.rotateY(Math.PI / 2); wheel.rotateZ(-0.35); wheel.translate(0.44, 0.38, 0);
  parts.push([wheel, "#16161a"]);
  return merge(T, parts);
}

/* ---------------- Cars ---------------- */
// Side profiles in meters: x forward, y up. "top" runs from the front bottom over the top to the rear bottom.
const PROFILES = {
  tapehead: { width: 1.92, glassW: 1.5, wheelX: 1.36, wheelR: 0.33, arch: 0.42,
    top: [[2.22, 0.3], [2.3, 0.52], [2.05, 0.7], [0.55, 0.9], [-1.55, 0.95], [-2.2, 0.93], [-2.27, 0.55], [-2.2, 0.3]],
    glass: [[0.6, 0.88], [-0.2, 1.23], [-0.95, 1.23], [-1.62, 0.93]],
    roof: [[-0.16, 1.22], [-0.98, 1.22], [-0.99, 1.27], [-0.14, 1.27]], seat: -0.4, spoiler: [-2.0, 1.12, 1.6] },
  boombox: { width: 1.86, glassW: 1.52, wheelX: 1.3, wheelR: 0.33, arch: 0.42,
    top: [[2.05, 0.3], [2.12, 0.55], [2.05, 0.82], [1.05, 0.92], [-1.95, 0.98], [-2.08, 0.95], [-2.1, 0.55], [-2.05, 0.3]],
    glass: [[1.05, 0.9], [0.3, 1.4], [-1.75, 1.4], [-1.98, 0.96]],
    roof: [[0.3, 1.39], [-1.78, 1.39], [-1.8, 1.45], [0.27, 1.45]], seat: -0.2 },
  dart: { width: 1.9, glassW: 1.48, wheelX: 1.38, wheelR: 0.33, arch: 0.42,
    top: [[2.2, 0.3], [2.3, 0.45], [2.22, 0.6], [1.8, 0.72], [0.7, 0.88], [-1.2, 0.97], [-1.9, 0.95], [-2.2, 0.82], [-2.25, 0.5], [-2.18, 0.3]],
    glass: [[0.72, 0.87], [0.0, 1.21], [-0.7, 1.25], [-1.3, 1.14], [-1.78, 0.95]],
    roof: [[0.02, 1.2], [-0.7, 1.24], [-1.29, 1.13], [-1.27, 1.19], [-0.7, 1.3], [0.0, 1.26]], seat: -0.4, spoiler: [-2.05, 1.08, 1.5] },
  saturday: { width: 1.96, glassW: 1.52, wheelX: 1.42, wheelR: 0.35, arch: 0.44,
    top: [[2.3, 0.3], [2.36, 0.5], [2.3, 0.8], [0.35, 0.87], [-1.7, 0.91], [-2.25, 0.87], [-2.3, 0.5], [-2.25, 0.3]],
    glass: [[0.37, 0.85], [-0.35, 1.2], [-0.9, 1.22], [-1.88, 0.9]],
    roof: [[-0.33, 1.19], [-0.92, 1.21], [-0.94, 1.26], [-0.31, 1.24]], seat: -0.5, scoop: true }
};
function carModel(T, spec, script, kit) {
  const pf = PROFILES[spec.design], grp = new T.Group(), body = new T.Group();
  grp.add(body);
  const yb = 0.22, wy = pf.wheelR;
  const sh = new T.Shape();
  const top = pf.top, xr = top[top.length - 1][0], xf = top[0][0];
  sh.moveTo(xr, yb);
  [-pf.wheelX, pf.wheelX].forEach(function (wx) {
    sh.lineTo(wx - pf.arch, yb); sh.lineTo(wx - pf.arch, wy);
    sh.absarc(wx, wy, pf.arch, Math.PI, 0, true);
    sh.lineTo(wx + pf.arch, yb);
  });
  sh.lineTo(xf, yb);
  for (let i = 0; i < top.length; i++) sh.lineTo(top[i][0], top[i][1]);
  sh.closePath();
  const bev = 0.07, depth = pf.width - bev * 2;
  const bg = new T.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: true, bevelThickness: bev, bevelSize: 0.05, bevelSegments: 2, curveSegments: 10 });
  bg.translate(0, 0, -depth / 2);
  // both sides read the livery the right way round (the left side's u is mirrored)
  const uv = bg.attributes.uv, p = bg.attributes.position, caps = bg.groups[0];
  for (let i = caps.start; i < caps.start + caps.count; i++) uv.setX(i, p.getZ(i) < 0 ? -p.getX(i) : p.getX(i));
  const livTex = kit.tex(liveryCanvas(spec, script));
  livTex.repeat.set(1 / 4.8, 1 / 0.9); livTex.offset.set(0.5, -0.15 / 0.9);
  const paint = new T.MeshPhongMaterial({ color: new T.Color(spec.color), specular: 0xffffff, shininess: 90, envMap: kit.env, combine: T.MixOperation, reflectivity: 0.22 });
  const side = new T.MeshPhongMaterial({ map: livTex, specular: 0xffffff, shininess: 90, envMap: kit.env, combine: T.MixOperation, reflectivity: 0.16 });
  const bm = new T.Mesh(bg, [side, paint]);
  body.add(bm);
  // the greenhouse: tinted glass you can see the driver through, and a painted roof
  const gs = new T.Shape(pf.glass.map(function (q) { return new T.Vector2(q[0], q[1]); }));
  const gd = pf.glassW - 0.08, gg = new T.ExtrudeGeometry(gs, { depth: gd, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 1 });
  gg.translate(0, 0, -gd / 2);
  body.add(new T.Mesh(gg, kit.glass));
  const rs = new T.Shape(pf.roof.map(function (q) { return new T.Vector2(q[0], q[1]); }));
  const rd = pf.glassW + 0.02, rg = new T.ExtrudeGeometry(rs, { depth: rd, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 1 });
  rg.translate(0, 0, -rd / 2);
  body.add(new T.Mesh(rg, paint));
  const pillar = new T.Mesh(new T.BoxGeometry(0.08, 0.3, pf.glassW + 0.01), kit.black);
  const gm = pf.glass; pillar.position.set((gm[1][0] + gm[2][0]) / 2 - 0.25, (gm[0][1] + gm[1][1]) / 2 + 0.02, 0);
  body.add(pillar);
  // bumpers, grille, lights
  const fx = xf + 0.02, rx = xr - 0.02;
  const bumper = new T.Mesh(roundBox(T, 0.16, 0.16, pf.width - 0.1, 0.05), kit.black);
  bumper.position.set(fx, 0.32, 0); body.add(bumper);
  const rb = bumper.clone(); rb.position.set(rx, 0.32, 0); body.add(rb);
  const head = new T.Mesh(new T.BoxGeometry(0.06, 0.09, 0.38), kit.headMat);
  const tail = new T.Mesh(new T.BoxGeometry(0.06, 0.1, 0.5), kit.tailMat.clone());
  const hy = Math.min(0.55, top[1][1] - 0.02), ty = Math.min(0.72, top[top.length - 2][1] + 0.12);
  [-1, 1].forEach(function (s) {
    const h = head.clone(); h.position.set(top[1][0] - 0.02, hy, s * (pf.width / 2 - 0.3)); body.add(h);
    const t = new T.Mesh(tail.geometry, tail.material); t.position.set(rx - 0.03, ty, s * (pf.width / 2 - 0.32)); body.add(t);
  });
  const grille = new T.Mesh(new T.BoxGeometry(0.05, 0.08, pf.width * 0.4), kit.black);
  grille.position.set(top[1][0] - 0.01, hy - 0.08, 0); body.add(grille);
  if (pf.spoiler) {
    const sp = pf.spoiler, wing = new T.Mesh(roundBox(T, 0.34, 0.05, sp[2], 0.02), paint);
    wing.position.set(sp[0], sp[1], 0); wing.rotation.z = 0.08; body.add(wing);
    [-1, 1].forEach(function (s) { const post = new T.Mesh(new T.BoxGeometry(0.08, sp[1] - 0.93, 0.05), kit.black); post.position.set(sp[0] + 0.04, (sp[1] + 0.93) / 2, s * sp[2] * 0.35); body.add(post); });
  }
  if (pf.scoop) {
    const sc = new T.Mesh(roundBox(T, 0.7, 0.1, 0.55, 0.04), kit.black); sc.position.set(1.25, 0.86, 0); body.add(sc);
  }
  // the driver, on the left side of the cabin
  const drv = new T.Mesh(driverGeo(T, spec.color === "#ffd21f" ? "#1b1d26" : "#f4f1e8", spec.trim === "#ffffff" ? spec.color : spec.trim), kit.figure);
  drv.position.set(pf.seat, 0.4, -0.36); drv.scale.setScalar(0.94); body.add(drv);
  // wheels
  const wheels = [];
  [[pf.wheelX, -1], [pf.wheelX, 1], [-pf.wheelX, -1], [-pf.wheelX, 1]].forEach(function (w, i) {
    const steerG = new T.Group(); steerG.position.set(w[0], wy, w[1] * (pf.width / 2 - 0.13));
    const spin = new T.Group(); steerG.add(spin);
    const tire = new T.Mesh(kit.tireGeo(pf.wheelR), kit.tire); spin.add(tire);
    const rim = new T.Mesh(kit.rimGeo(pf.wheelR), kit.rim); rim.position.z = w[1] * 0.131; if (w[1] < 0) rim.rotation.y = Math.PI; spin.add(rim);
    grp.add(steerG);
    wheels.push({ steer: steerG, spin: spin, front: i < 2 });
  });
  // light on the road, glows, and a soft shadow
  const beam = new T.Mesh(kit.unit, kit.beamMat); beam.rotation.y = -Math.PI / 2; beam.scale.set(6.4, 1, 16); beam.position.set(xf + 8, 0.05, 0); beam.renderOrder = 3; grp.add(beam);
  const glows = [];
  [-1, 1].forEach(function (s) {
    const hg = new T.Sprite(kit.headGlow); hg.scale.set(1.0, 1.0, 1); hg.position.set(top[1][0] + 0.05, hy, s * (pf.width / 2 - 0.3)); body.add(hg);
    const tg = new T.Sprite(kit.tailGlow.clone()); tg.scale.set(0.55, 0.55, 1); tg.position.set(rx - 0.08, ty, s * (pf.width / 2 - 0.32)); body.add(tg);
    glows.push(hg, tg);
  });
  const shadow = new T.Mesh(kit.unit, kit.blobMat); shadow.position.y = 0.035; shadow.renderOrder = 2;
  shadow.rotation.y = Math.PI / 2; shadow.scale.set(pf.width * 1.4, 1, 5.4);
  grp.add(shadow);
  return { grp: grp, body: body, wheels: wheels, beam: beam, glows: glows, paint: paint, side: side, wheelR: pf.wheelR,
           tailMat: tail.material };
}

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x05061a, 1);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(64, W / H, 0.3, 3200);
  const caps = renderer.capabilities, aniso = Math.min(8, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = aniso;
    return t;
  }
  const script = scriptCanvas(scriptImg);
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);

  /* LED board: one texture, many faces */
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas()); tDot.wrapS = tDot.wrapT = T.RepeatWrapping; tDot.anisotropy = aniso;
  const csChunk = T.ShaderChunk && T.ShaderChunk.colorspace_fragment ? "colorspace_fragment" : "encodings_fragment";
  const ledMat = new T.ShaderMaterial({
    uniforms: { tLed: { value: tLed }, tDot: { value: tDot }, grid: { value: new T.Vector2(LED_COLS, LED_ROWS) }, level: { value: 1 } },
    vertexShader: "varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
    fragmentShader: [
      "uniform sampler2D tLed;", "uniform sampler2D tDot;", "uniform vec2 grid;", "uniform float level;", "varying vec2 vUv;",
      "void main() {",
      "  vec2 cell = vUv * grid;", "  vec2 px = 1.0 / grid;", "  vec2 c0 = (floor(cell) + 0.5) * px;",
      "  vec3 led = texture2D(tLed, c0).rgb;", "  vec3 halo = led;",
      "  halo += texture2D(tLed, c0 + px * vec2( 1.5,  1.5)).rgb + texture2D(tLed, c0 + px * vec2(-1.5,  1.5)).rgb;",
      "  halo += texture2D(tLed, c0 + px * vec2( 1.5, -1.5)).rgb + texture2D(tLed, c0 + px * vec2(-1.5, -1.5)).rgb;",
      "  halo += texture2D(tLed, c0 + px * vec2( 3.0,  0.0)).rgb + texture2D(tLed, c0 + px * vec2(-3.0,  0.0)).rgb;",
      "  halo += texture2D(tLed, c0 + px * vec2( 0.0,  3.0)).rgb + texture2D(tLed, c0 + px * vec2( 0.0, -3.0)).rgb;",
      "  halo /= 9.0;", "  float lens = texture2D(tDot, cell).r;",
      "  vec3 col = led * lens * 1.38 + halo * 0.34 + vec3(0.030, 0.034, 0.046) * lens + vec3(0.005, 0.006, 0.010);",
      "  gl_FragColor = vec4(col * level, 1.0);",
      "  #include <" + csChunk + ">",
      "}"
    ].join("\n")
  });

  /* car kit */
  const tireGeos = {}, rimGeos = {};
  const tHeadGlow = tex(glowCanvas("rgba(255,250,230,1)", "rgba(255,240,200,0)")), tTailGlow = tex(glowCanvas("rgba(255,60,40,1)", "rgba(255,20,10,0)"));
  const kit = {
    tex: tex, unit: unit, env: null,
    glass: new T.MeshPhongMaterial({ color: 0x0b1020, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.62, envMap: null, combine: T.MixOperation, reflectivity: 0.35 }),
    black: new T.MeshPhongMaterial({ color: 0x16171c, specular: 0x444444, shininess: 40 }),
    headMat: new T.MeshBasicMaterial({ color: 0xfff6dc }),
    tailMat: new T.MeshBasicMaterial({ color: 0x8a0d0d }),
    figure: new T.MeshLambertMaterial({ vertexColors: true }),
    tire: new T.MeshLambertMaterial({ color: 0x141418 }),
    rim: new T.MeshPhongMaterial({ map: tex(rimCanvas("#ffd21f")), specular: 0xffffff, shininess: 80 }),
    tireGeo: function (r) { if (!tireGeos[r]) { const g = new T.CylinderGeometry(r, r, 0.24, 20); g.rotateX(Math.PI / 2); tireGeos[r] = g; } return tireGeos[r]; },
    rimGeo: function (r) { if (!rimGeos[r]) rimGeos[r] = new T.CircleGeometry(r * 0.7, 20); return rimGeos[r]; },
    beamMat: new T.MeshBasicMaterial({ map: tex(beamCanvas()), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.8 }),
    headGlow: new T.SpriteMaterial({ map: tHeadGlow, color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending }),
    tailGlow: new T.SpriteMaterial({ map: tTailGlow, color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.6 }),
    blobMat: new T.MeshBasicMaterial({ map: tex(blobCanvas()), transparent: true, depthWrite: false, opacity: 0.8 })
  };
  kit.beamMat.polygonOffset = true; kit.beamMat.polygonOffsetFactor = -2;
  kit.blobMat.polygonOffset = true; kit.blobMat.polygonOffsetFactor = -1;
  const envs = {};
  for (const k in THEMES) { const e = new T.CubeTexture(envFaces(THEMES[k])); if ("colorSpace" in e && T.SRGBColorSpace) e.colorSpace = T.SRGBColorSpace; e.needsUpdate = true; envs[k] = e; }
  kit.env = envs.city; kit.glass.envMap = envs.city;

  /* lights, sky */
  const hemi = new T.HemisphereLight(0xffffff, 0x404040, 1); scene.add(hemi);
  const sun = new T.DirectionalLight(0xffffff, 1); sun.position.set(-300, 400, -200); scene.add(sun);
  const skyMat = {}; const horizonMat = {};
  for (const k in THEMES) {
    skyMat[k] = new T.MeshBasicMaterial({ map: tex(skyCanvas(THEMES[k])), side: T.BackSide, fog: false, depthWrite: false });
    const ht = tex(horizonCanvas(k, THEMES[k])); ht.wrapS = T.RepeatWrapping; ht.repeat.x = 3;
    horizonMat[k] = new T.MeshBasicMaterial({ map: ht, side: T.BackSide, transparent: true, fog: false, depthWrite: false });
  }
  const sky = new T.Mesh(new T.SphereGeometry(2600, 32, 16), skyMat.city); sky.renderOrder = -10; scene.add(sky);
  const horizon = new T.Mesh(new T.CylinderGeometry(2200, 2200, 420, 48, 1, true), horizonMat.city); horizon.renderOrder = -9; scene.add(horizon);

  /* cars */
  const carModels = [];
  [PLAYER_CAR].concat(RIVALS).concat([DRAG_RIVAL]).forEach(function (sp) { const m = carModel(T, sp, script, kit); scene.add(m.grp); carModels.push(m); });

  /* flag starter and a few fans */
  const starter = personGeo(T, { skin: SKIN[2], shirt: "#f4f1e8", pants: "#1b2440", hair: "#1a120c" });
  const starterG = new T.Group();
  starterG.add(new T.Mesh(starter.body, kit.figure));
  const armG = new T.Group(); armG.position.set(starter.shoulder[0], starter.shoulder[1], starter.shoulder[2]);
  armG.add(new T.Mesh(starter.arm, kit.figure));
  const poleG = new T.CylinderGeometry(0.012, 0.012, 0.9, 6); poleG.translate(0.032, -0.575 - 0.45, 0.055);
  armG.add(new T.Mesh(poleG, kit.black));
  const flagCanvasG = mkCanvas(64, 40), fg = flagCanvasG.getContext("2d"); fg.fillStyle = "#1ec84a"; fg.fillRect(0, 0, 64, 40);
  const flagTexGreen = tex(flagCanvasG), flagTexCheck = tex(checkerCanvas(8));
  const flagMat = new T.MeshBasicMaterial({ map: flagTexGreen, side: T.DoubleSide });
  const flagGeo = new T.PlaneGeometry(0.75, 0.5, 6, 1); flagGeo.translate(0.375, 0, 0);
  const flag = new T.Mesh(flagGeo, flagMat); flag.position.set(0.032, -0.575 - 0.65, 0.055); flag.rotation.z = -Math.PI / 2; armG.add(flag);
  starterG.add(armG);
  scene.add(starterG);
  const fans = [];
  [["#ff3fa4", "#2b3a66", SKIN[0], "#7a4a1c"], ["#3ff0ff", "#1b1b22", SKIN[3], "#111"], ["#ffd23f", "#4a3020", SKIN[1], "#3a2210"],
   ["#9bff3f", "#2b2b38", SKIN[2], "#0e0e0e"], ["#a77bff", "#3a4e7a", SKIN[0], "#d9b46a"]].forEach(function (c, i) {
    const pg = personGeo(T, { shirt: c[0], pants: c[1], skin: c[2], hair: c[3] });
    const g = new T.Group(); g.add(new T.Mesh(pg.body, kit.figure));
    const a = new T.Mesh(pg.arm, kit.figure); a.position.set(pg.shoulder[0], pg.shoulder[1], pg.shoulder[2]); g.add(a);
    g.scale.setScalar(0.93 + (i % 3) * 0.04);
    scene.add(g); fans.push({ g: g, arm: a });
  });

  /* effects: tire smoke and sparks */
  const smokeMat = new T.SpriteMaterial({ map: tex(glowCanvas("rgba(220,220,230,.55)", "rgba(200,200,210,0)")), transparent: true, depthWrite: false });
  const smoke = [];
  for (let i = 0; i < 26; i++) { const s = new T.Sprite(smokeMat.clone()); s.visible = false; scene.add(s); smoke.push({ sp: s, life: 0, vx: 0, vy: 0, vz: 0, size: 1 }); }
  const sparkGeo = new T.BufferGeometry(), sparkPos = new Float32Array(48 * 3);
  sparkGeo.setAttribute("position", new T.BufferAttribute(sparkPos, 3));
  const sparkPts = new T.Points(sparkGeo, new T.PointsMaterial({ map: tex(glowCanvas("rgba(255,230,140,1)", "rgba(255,120,20,0)")), size: 0.5, transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: 0xffc070 }));
  sparkPts.frustumCulled = false; scene.add(sparkPts);
  const sparkV = [];
  for (let i = 0; i < 48; i++) { sparkV.push({ life: 0, vx: 0, vy: 0, vz: 0 }); sparkPos[i * 3 + 1] = -100; }

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, tex: tex, script: script, unit: unit, kit: kit, envs: envs,
    hemi: hemi, sun: sun, sky: sky, horizon: horizon, skyMat: skyMat, horizonMat: horizonMat, ledMat: ledMat,
    tracks: EVENTS.map(buildTrack), worlds: [], world: -1, cars: carModels,
    starter: starterG, starterArm: armG, flag: flag, flagMat: flagMat, flagTexGreen: flagTexGreen, flagTexCheck: flagTexCheck, flagBase: Float32Array.from(flagGeo.attributes.position.array), fans: fans,
    smoke: smoke, sparkPts: sparkPts, sparkPos: sparkPos, sparkV: sparkV, sparkN: 0, smokeN: 0,
    camPos: new T.Vector3(), camLook: new T.Vector3(), camYaw: 0, camSnap: true, fov: 64,
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0,
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
}

/* ---------------- One venue ---------------- */
// A strip that follows the track from offset d0 to d1 (meters right of center) at heights y0, y1.
function ribbon(T, tr, d0, d1, y0, y1, tile, opt) {
  opt = opt || {};
  const step = opt.step || 2, s0 = opt.from == null ? 0 : opt.from, s1 = opt.to == null ? tr.L : opt.to;
  const n = Math.max(1, Math.ceil((s1 - s0) / step)), pos = [], uv = [], idx = [], p = { x: 0, z: 0, tx: 1, tz: 0, k: 0 };
  const u0 = opt.u0 || 0, u1 = opt.u1 == null ? 1 : opt.u1;
  for (let i = 0; i <= n; i++) {
    const s = s0 + (s1 - s0) * i / n;
    trackAt(tr, s, p);
    const rx = -p.tz, rz = p.tx;
    pos.push(p.x + rx * d0, y0, p.z + rz * d0, p.x + rx * d1, y1, p.z + rz * d1);
    if (opt.swap) uv.push(s / tile, u0, s / tile, u1); else uv.push(u0, s / tile, u1, s / tile);
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }   // faces up
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// Where something can stand: at least r meters from the center line of the whole track.
function clearance(tr) {
  const cell = 24, grid = new Map();
  for (let i = 0; i < tr.N; i += 3) {
    const key = Math.floor(tr.X[i] / cell) + "," + Math.floor(tr.Z[i] / cell);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
  return function (x, z, r) {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell), span = Math.ceil(r / cell) + 1;
    for (let a = -span; a <= span; a++) for (let b = -span; b <= span; b++) {
      const l = grid.get((cx + a) + "," + (cz + b));
      if (!l) continue;
      for (let k = 0; k < l.length; k++) { const i = l[k]; if (Math.hypot(tr.X[i] - x, tr.Z[i] - z) < r) return false; }
    }
    return true;
  };
}
function headingOf(p) { return Math.atan2(-p.tz, p.tx); }

function buildWorld(i) {
  const T = R.T, ev = EVENTS[i], th = THEMES[ev.theme], tr = R.tracks[i], tex = R.tex, script = R.script;
  const grp = new T.Group(), lite = new T.Group(), rnd = rng(i * 97 + 5);
  grp.add(lite);
  const free = clearance(tr), p = { x: 0, z: 0, tx: 1, tz: 0, k: 0 };
  const W2 = { grp: grp, lite: lite, lights: [], tree: null, spin: [], water: null, arches: [] };
  function at(s, d, out) { trackAt(tr, s, p); out = out || {}; out.x = p.x - p.tz * d; out.z = p.z + p.tx * d; out.h = headingOf(p); return out; }

  /* ground */
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let k = 0; k <= tr.N; k += 5) { minX = Math.min(minX, tr.X[k]); maxX = Math.max(maxX, tr.X[k]); minZ = Math.min(minZ, tr.Z[k]); maxZ = Math.max(maxZ, tr.Z[k]); }
  const gs = 3600, gt = tex(groundCanvas(ev.theme), true); gt.repeat.set(gs / 26, gs / 26);
  const ground = new T.Mesh(new T.PlaneGeometry(gs, gs).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ map: gt }));
  ground.position.set((minX + maxX) / 2, -0.12, (minZ + maxZ) / 2); grp.add(ground);

  /* road, curbs, shoulders, barriers */
  const tRoad = tex(asphaltCanvas(ev.theme), true);
  const roadMat = new T.MeshLambertMaterial({ map: tRoad });
  grp.add(new T.Mesh(ribbon(T, tr, -ROAD, ROAD, 0.02, 0.02, 16), roadMat));
  const curbMat = new T.MeshLambertMaterial({ map: tex(ev.theme === "board" ? curbCanvas("#ff3fa4", "#f4f4f4") : ev.theme === "desert" ? curbCanvas("#ff8a1e", "#f4f4f4") : curbCanvas("#e8231a", "#f4f4f4"), true) });
  if (ev.kind === "circuit") {
    grp.add(new T.Mesh(ribbon(T, tr, -ROAD - CURB, -ROAD, 0.05, 0.03, 4), curbMat));
    grp.add(new T.Mesh(ribbon(T, tr, ROAD, ROAD + CURB, 0.03, 0.05, 4), curbMat));
  }
  const shMat = new T.MeshLambertMaterial({ map: tex(shoulderCanvas(ev.theme), true) });
  const sw = WALL - ROAD - (ev.kind === "circuit" ? CURB : 0) + 0.4;
  grp.add(new T.Mesh(ribbon(T, tr, -WALL - 0.4, -WALL - 0.4 + sw, 0.01, 0.01, 6, { u1: sw / 6 }), shMat));
  grp.add(new T.Mesh(ribbon(T, tr, WALL + 0.4 - sw, WALL + 0.4, 0.01, 0.01, 6, { u1: sw / 6 }), shMat));
  const wallH = ev.theme === "desert" ? 0.95 : ev.theme === "board" ? 1.05 : 1.1;
  const see = ev.theme === "desert" || ev.theme === "board";
  const wallMat = new T.MeshLambertMaterial({ map: tex(wallCanvas(ev.theme), true), side: T.DoubleSide, alphaTest: see ? 0.5 : 0, transparent: false });
  [-1, 1].forEach(function (sd) {
    grp.add(new T.Mesh(ribbon(T, tr, sd * WALL, sd * WALL, 0, wallH, 8, { swap: true }), wallMat));
    if (th.night || ev.theme === "drag") {                // a neon tube along the top of the barrier
      const tube = new T.Mesh(ribbon(T, tr, sd * (WALL - 0.04), sd * (WALL - 0.04), wallH - 0.07, wallH + 0.01, 8, { step: 4 }),
        new T.MeshBasicMaterial({ color: new T.Color(sd < 0 ? th.accent : th.accent2), side: T.DoubleSide }));
      grp.add(tube);
    }
  });

  /* start line (or the drag stripes) */
  const chk = tex(checkerCanvas(16), true);
  const lineMat = new T.MeshLambertMaterial({ map: chk, polygonOffset: true, polygonOffsetFactor: -2 });
  const lineAt = ev.kind === "drag" ? [DRAG_START, DRAG_START + DRAG_LEN] : [0];
  lineAt.forEach(function (s) { grp.add(new T.Mesh(ribbon(T, tr, -ROAD, ROAD, 0.03, 0.03, 2, { from: s - 1, to: s + 1, step: 1 }), lineMat)); });

  /* the LED board on a gantry over the line (and the finish at the drag strip) */
  function gantry(s, withLights) {
    const g = new T.Group(), q = at(s, 0);
    g.position.set(q.x, 0, q.z); g.rotation.y = q.h;
    const postMat = new T.MeshPhongMaterial({ color: 0x2a2e3a, specular: 0x666666, shininess: 50 });
    [-1, 1].forEach(function (sd) { const post = new T.Mesh(new T.BoxGeometry(0.7, 8, 0.7), postMat); post.position.set(0, 4, sd * (WALL + 0.9)); g.add(post); });
    const beam = new T.Mesh(new T.BoxGeometry(1.2, 2.3, 2 * WALL + 2.6), postMat); beam.position.set(0, 7.15, 0); g.add(beam);
    const face = new T.Mesh(new T.PlaneGeometry(2 * WALL + 1.6, (2 * WALL + 1.6) * LED_ROWS / LED_COLS), R.ledMat);
    face.rotation.y = -Math.PI / 2; face.position.set(-0.62, 7.15, 0); g.add(face);
    const plate = new T.Mesh(new T.PlaneGeometry(9, 9 * script.height / script.width), new T.MeshBasicMaterial({ map: R.tex(script), transparent: true }));
    plate.rotation.y = -Math.PI / 2; plate.position.set(-0.62, 9.6, 0); g.add(plate);
    const lights = [];
    if (withLights) for (let k = 0; k < 5; k++) {
      const m = new T.Mesh(new T.SphereGeometry(0.26, 12, 8), new T.MeshBasicMaterial({ color: 0x300606 }));
      m.position.set(-0.7, 5.55, (k - 2) * 1.0); g.add(m); lights.push(m);
    }
    grp.add(g);
    return lights;
  }
  if (ev.kind === "circuit") W2.lights = gantry(0, true);
  else gantry(DRAG_START + DRAG_LEN, false);

  /* trackside LED boards and billboards: they face the cars coming toward them */
  function sideBoard(s, sd, w) {
    const q = at(s, sd * (WALL + 1.6)), g = new T.Group();
    g.position.set(q.x, 0, q.z); g.rotation.y = q.h - sd * 0.5;
    const hgt = w * LED_ROWS / LED_COLS;
    const box = new T.Mesh(new T.BoxGeometry(0.4, hgt + 0.3, w + 0.3), new T.MeshBasicMaterial({ color: 0x05070d }));
    box.position.set(0.21, 2.1, 0); g.add(box);
    const face = new T.Mesh(new T.PlaneGeometry(w, hgt), R.ledMat); face.rotation.y = -Math.PI / 2; face.position.set(0, 2.1, 0); g.add(face);
    [-1, 1].forEach(function (k) { const post = new T.Mesh(new T.BoxGeometry(0.2, 2, 0.2), new T.MeshLambertMaterial({ color: 0x2a2e3a })); post.position.set(0.2, 1, k * w * 0.35); g.add(post); });
    grp.add(g);
  }
  const tags = ["SHIFT IN THE GREEN", "FREE AT THENOSTALGIAPRO.COM", "BE KIND, REWIND", "NO QUARTERS REQUIRED", "REDLINE IS NOT A STRATEGY", "PLAY IT FREE"];
  function billboard(s, sd, seed) {
    const q = at(s, sd * (WALL + 6)), g = new T.Group();
    if (!free(q.x, q.z, WALL + 3)) return;
    g.position.set(q.x, 0, q.z); g.rotation.y = q.h - sd * 0.45;
    const bw = 11, bh = bw * 400 / 1024;
    const face = new T.Mesh(new T.PlaneGeometry(bw, bh), new T.MeshBasicMaterial({ map: tex(billboardCanvas(script, ev.theme, tags[seed % tags.length], seed)) }));
    face.rotation.y = -Math.PI / 2; face.position.set(0, 3.2 + bh / 2, 0); g.add(face);
    const back = new T.Mesh(new T.BoxGeometry(0.3, bh + 0.4, bw + 0.4), new T.MeshLambertMaterial({ color: 0x23252e })); back.position.set(0.18, 3.2 + bh / 2, 0); g.add(back);
    [-1, 1].forEach(function (k) { const post = new T.Mesh(new T.CylinderGeometry(0.16, 0.2, 3.3, 8), new T.MeshLambertMaterial({ color: 0x3a3e4a })); post.position.set(0.2, 1.65, k * bw * 0.3); g.add(post); });
    grp.add(g);
  }
  if (ev.kind === "circuit") {
    // LED boards on the two longest straights, billboards spread around the lap
    const straights = [];
    for (let s = 20; s < tr.L - 40; s += 10) {
      let ok = true;
      for (let x = -30; x <= 30; x += 10) if (Math.abs(curveAt(tr, s + x)) > 0.002) { ok = false; break; }
      if (ok) straights.push(s);
    }
    const picks = [];
    straights.forEach(function (s) { if (picks.every(function (q) { return Math.abs(q - s) > tr.L * 0.22; })) picks.push(s); });
    picks.slice(0, 3).forEach(function (s, k) { sideBoard(s + 15, k % 2 ? -1 : 1, 14); });
    for (let k = 0; k < 8; k++) billboard(tr.L * (k + 0.35) / 8, k % 2 ? 1 : -1, k + i);
  } else {
    sideBoard(DRAG_START - 30, 1, 14);
    for (let k = 0; k < 4; k++) billboard(DRAG_START + 90 + k * 95, k % 2 ? 1 : -1, k + 2);
  }

  /* the venues */
  const m4 = new T.Matrix4(), qq = new T.Quaternion(), sc = new T.Vector3(), ps = new T.Vector3(), up = new T.Vector3(0, 1, 0);
  function inst(geo, mat, list) {
    const im = new T.InstancedMesh(geo, mat, Math.max(1, list.length));
    list.forEach(function (o, k) {
      qq.setFromAxisAngle(up, o.r || 0); ps.set(o.x, o.y || 0, o.z); sc.set(o.sx || 1, o.sy || 1, o.sz || 1);
      im.setMatrixAt(k, m4.compose(ps, qq, sc));
      if (o.c) im.setColorAt(k, new T.Color(o.c));
    });
    im.count = list.length;
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    return im;
  }
  function glowPoints(list, color, size) {
    const g = new T.BufferGeometry(), a = new Float32Array(list.length * 3);
    list.forEach(function (o, k) { a[k * 3] = o[0]; a[k * 3 + 1] = o[1]; a[k * 3 + 2] = o[2]; });
    g.setAttribute("position", new T.BufferAttribute(a, 3));
    return new T.Points(g, new T.PointsMaterial({ map: R.tex(glowCanvas()), color: color, size: size, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
  }

  if (ev.theme === "city") {
    const sets = [[], [], []];
    for (let s = 0; s < tr.L; s += 13) [-1, 1].forEach(function (sd) {
      for (let row = 0; row < 2; row++) {
        const w = 12 + rnd() * 14, dp = 12 + rnd() * 12, h = row ? 30 + rnd() * 60 : 14 + rnd() * 34;
        const q = at(s + rnd() * 6, sd * (WALL + 10 + row * 26 + rnd() * 10));
        if (!free(q.x, q.z, WALL + 4 + Math.max(w, dp) * 0.72)) continue;
        const cls = h < 28 ? 0 : h < 55 ? 1 : 2;
        sets[cls].push({ x: q.x, z: q.z, r: q.h + (rnd() - 0.5) * 0.2, sx: w, sy: h, sz: dp, c: shade(["#ffffff", "#e8e0ff", "#ffe6f0", "#dff8ff"][(rnd() * 4) | 0], -rnd() * 0.25) });
      }
    });
    const bgeo = new T.BoxGeometry(1, 1, 1); bgeo.translate(0, 0.5, 0);
    sets.forEach(function (list, k) {
      const t = tex(windowsCanvas(30 + k, [6, 7, 8][k], [6, 12, 20][k]));
      lite.add(inst(bgeo, new T.MeshBasicMaterial({ map: t }), list));
    });
    // street lights
    const poles = [], lamps = [], glows = [];
    for (let s = 6; s < tr.L; s += 34) {
      const sd = Math.floor(s / 34) % 2 ? 1 : -1, q = at(s, sd * (WALL + 1.3));
      poles.push({ x: q.x, z: q.z, r: q.h + (sd > 0 ? Math.PI / 2 : -Math.PI / 2) });
      const l = at(s, sd * (WALL - 1.0)); lamps.push({ x: l.x, y: 8.3, z: l.z, r: q.h });
      glows.push([l.x, 8.1, l.z]);
    }
    const poleGeo = merge(T, [[limb(T, 0.13, 0.1, [0, 0, 0], [0, 8.5, 0], 8), "#3a3e4c"], [limb(T, 0.07, 0.07, [0, 8.4, 0], [0, 8.5, 2.4], 6), "#3a3e4c"]]);
    lite.add(inst(poleGeo, new T.MeshLambertMaterial({ vertexColors: true }), poles));
    lite.add(inst(new T.BoxGeometry(0.9, 0.18, 0.5), new T.MeshBasicMaterial({ color: 0xfff1c8 }), lamps));
    grp.add(glowPoints(glows, 0xffd9a0, 7));
  }

  if (ev.theme === "desert") {
    // mesas on the horizon side
    const mesaMat = new T.MeshLambertMaterial({ map: tex(mesaCanvas()) });
    for (let k = 0; k < 10; k++) {
      const a = rnd() * TAU, dist = 420 + rnd() * 500, x = (minX + maxX) / 2 + Math.cos(a) * dist, z = (minZ + maxZ) / 2 + Math.sin(a) * dist;
      const r = 40 + rnd() * 90, h = 30 + rnd() * 70;
      if (!free(x, z, r + 30)) continue;
      const m = new T.Mesh(new T.CylinderGeometry(r * 0.78, r, h, 7 + (k % 3)), mesaMat); m.position.set(x, h / 2 - 1, z); m.rotation.y = rnd() * 3; grp.add(m);
    }
    // cacti
    const cact = merge(T, [[limb(T, 0.32, 0.28, [0, 0, 0], [0, 4.2, 0], 8), "#2f8a46"], [ball(T, 0.28, [0, 4.2, 0], null, 8), "#2f8a46"],
      [limb(T, 0.2, 0.2, [0, 1.8, 0], [0.9, 1.9, 0], 6), "#2f8a46"], [limb(T, 0.2, 0.18, [0.9, 1.9, 0], [0.95, 3.1, 0], 6), "#2f8a46"], [ball(T, 0.18, [0.95, 3.1, 0], null, 6), "#2f8a46"],
      [limb(T, 0.18, 0.18, [0, 2.4, 0], [-0.8, 2.5, 0], 6), "#2b7a40"], [limb(T, 0.18, 0.16, [-0.8, 2.5, 0], [-0.82, 3.4, 0], 6), "#2b7a40"], [ball(T, 0.16, [-0.82, 3.4, 0], null, 6), "#2b7a40"]]);
    const cl = [], rocks = [];
    for (let k = 0; k < 260 && cl.length < 80; k++) {
      const s = rnd() * tr.L, sd = rnd() < 0.5 ? -1 : 1, q = at(s, sd * (WALL + 6 + rnd() * 70));
      if (!free(q.x, q.z, WALL + 3)) continue;
      cl.push({ x: q.x, z: q.z, r: rnd() * TAU, sx: 0.8 + rnd() * 0.6, sy: 0.7 + rnd() * 0.7, sz: 0.8 + rnd() * 0.6 });
    }
    for (let k = 0; k < 160 && rocks.length < 60; k++) {
      const s = rnd() * tr.L, sd = rnd() < 0.5 ? -1 : 1, q = at(s, sd * (WALL + 4 + rnd() * 50));
      if (!free(q.x, q.z, WALL + 2)) continue;
      const z = 0.5 + rnd() * 1.8; rocks.push({ x: q.x, z: q.z, y: 0.1, r: rnd() * TAU, sx: z * 1.3, sy: z * 0.7, sz: z });
    }
    lite.add(inst(cact, new T.MeshLambertMaterial({ vertexColors: true }), cl));
    lite.add(inst(new T.DodecahedronGeometry(1, 0), new T.MeshLambertMaterial({ color: 0x9a5a3a }), rocks));
    // telephone poles along the long straight
    const tp = merge(T, [[limb(T, 0.16, 0.13, [0, 0, 0], [0, 9, 0], 6), "#5a3a22"], [limb(T, 0.08, 0.08, [0, 8.4, -1.4], [0, 8.4, 1.4], 4), "#5a3a22"]]);
    const tpl = [];
    for (let s = 10; s < 420; s += 40) { const q = at(s, -(WALL + 14)); if (free(q.x, q.z, WALL + 3)) tpl.push({ x: q.x, z: q.z, r: q.h }); }
    lite.add(inst(tp, new T.MeshLambertMaterial({ vertexColors: true }), tpl));
    // the arcade, right off the main straight
    const ag = new T.Group(), aq = at(230, WALL + 48);
    ag.position.set(aq.x, 0, aq.z); ag.rotation.y = aq.h;
    const bodyMat = new T.MeshLambertMaterial({ color: 0x3a2a66 });
    const frontMat = new T.MeshBasicMaterial({ map: tex(arcadeFrontCanvas()) });
    const box = new T.Mesh(new T.BoxGeometry(46, 11, 24), [bodyMat, bodyMat, new T.MeshLambertMaterial({ color: 0x2a1f4a }), bodyMat, bodyMat, frontMat]);
    box.rotation.y = Math.PI; box.position.set(0, 5.5, 0); ag.add(box);
    const trim = new T.Mesh(new T.BoxGeometry(46.4, 0.4, 0.4), new T.MeshBasicMaterial({ color: 0xff3fa4 })); trim.position.set(0, 11, -12.1); ag.add(trim);
    const trim2 = trim.clone(); trim2.material = new T.MeshBasicMaterial({ color: 0x3ff0ff }); trim2.position.y = 0.3; ag.add(trim2);
    const sign = new T.Mesh(new T.PlaneGeometry(26, 13), new T.MeshBasicMaterial({ map: tex(arcadeSignCanvas(script)), transparent: true }));
    sign.rotation.y = Math.PI; sign.position.set(0, 18.4, -9); ag.add(sign);
    [-1, 1].forEach(function (k) { const post = new T.Mesh(new T.BoxGeometry(0.5, 6, 0.5), new T.MeshLambertMaterial({ color: 0x23252e })); post.position.set(k * 9, 14, -8.7); ag.add(post); });
    const lot = new T.Mesh(new T.PlaneGeometry(60, 30).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ color: 0x34313c })); lot.position.set(0, -0.08, -27); ag.add(lot);
    for (let k = -5; k <= 5; k++) { const ln = new T.Mesh(new T.PlaneGeometry(0.2, 8).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xe8e6dc })); ln.position.set(k * 4.5, -0.06, -24); ag.add(ln); }
    grp.add(ag);
    W2.arcade = ag;
  }

  if (ev.theme === "board") {
    // the ocean on the south side of the main straight
    const wc = mkCanvas(256, 256), wg = wc.getContext("2d"), wr = rng(3);
    wg.fillStyle = "#06223d"; wg.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 500; k++) { wg.fillStyle = "rgba(120,200,255," + (0.05 + wr() * 0.12) + ")"; wg.fillRect(wr() * 256, wr() * 256, 6 + wr() * 18, 1.5); }
    const wt = tex(wc, true); wt.repeat.set(60, 30);
    const water = new T.Mesh(new T.PlaneGeometry(3600, 1800).rotateX(-Math.PI / 2), new T.MeshPhongMaterial({ map: wt, color: 0x9fd6ff, specular: 0x9fd6ff, shininess: 60 }));
    water.position.set((minX + maxX) / 2, -0.6, 36 + 900); grp.add(water); W2.water = wt;
    const beach = new T.Mesh(new T.PlaneGeometry(3600, 10).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ color: 0xe9d6a6 })); beach.position.set((minX + maxX) / 2, -0.3, 32); grp.add(beach);
    // the pier and its wheel
    const deckMat = new T.MeshLambertMaterial({ map: tex(asphaltCanvas("board"), true) });
    const deck = new T.Mesh(new T.BoxGeometry(44, 1, 120), deckMat); deck.position.set(150, 0, 36 + 60); grp.add(deck);
    const piles = [];
    for (let x = -20; x <= 20; x += 10) for (let z = 0; z <= 120; z += 12) piles.push({ x: 150 + x, y: -3, z: 36 + z });
    lite.add(inst(new T.CylinderGeometry(0.4, 0.4, 6, 6), new T.MeshLambertMaterial({ color: 0x4a3420 }), piles));
    const wheel = new T.Group(), wheelR = 20; wheel.position.set(150, 24, 110);
    const rimMat = new T.MeshBasicMaterial({ color: 0xf4f4f4 });
    [-1.4, 1.4].forEach(function (z) { const ring = new T.Mesh(new T.TorusGeometry(wheelR, 0.35, 6, 64), rimMat); ring.position.z = z; wheel.add(ring); });
    const spokes = [], wl = [], gondolas = [];
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * TAU, ex = Math.cos(a) * wheelR, ey = Math.sin(a) * wheelR;
      [-1.4, 1.4].forEach(function (z) { wheel.add(new T.Mesh(limb(T, 0.12, 0.12, [0, 0, z], [ex, ey, z], 4), rimMat)); });
      for (let j = 0; j < 4; j++) { const b = (k + j / 4) / 14 * TAU; wl.push([Math.cos(b) * wheelR, Math.sin(b) * wheelR, 1.5]); }
      const gd = new T.Mesh(roundBox(T, 2.2, 2.0, 2.4, 0.3), new T.MeshLambertMaterial({ color: new T.Color(["#ff3fa4", "#3ff0ff", "#ffd23f", "#9bff3f"][k % 4]) }));
      gd.position.set(ex, ey - 1.6, 0); wheel.add(gd); gondolas.push(gd);
    }
    const wlp = glowPoints(wl, 0xff8ad8, 2.2); wheel.add(wlp);
    const hub = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, 3.6, 12).rotateX(Math.PI / 2), rimMat); wheel.add(hub);
    grp.add(wheel);
    [-1, 1].forEach(function (k) { [-2.5, 2.5].forEach(function (z) { const leg = new T.Mesh(limb(T, 0.5, 0.5, [150 + k * 13, 0.5, 110 + z * 2], [150, 24, 110 + z * 0.6], 6), new T.MeshLambertMaterial({ color: 0xdedede })); grp.add(leg); }); });
    W2.spin.push({ obj: wheel, rate: 0.12, gondolas: gondolas });
    // neon arches over the road
    for (let s = 60, k = 0; s < tr.L - 30; s += 150, k++) {
      const q = at(s, 0), g = new T.Group(); g.position.set(q.x, 0, q.z); g.rotation.y = q.h;
      [0, 2.2].forEach(function (dx, j) {
        const arch = new T.Mesh(new T.TorusGeometry(WALL + 0.6, 0.24, 6, 36, Math.PI), new T.MeshBasicMaterial({ color: new T.Color((k + j) % 2 ? th.accent : th.accent2) }));
        arch.rotation.y = Math.PI / 2; arch.position.x = dx; g.add(arch);
      });
      grp.add(g);
    }
    // booths and palms
    let bk = 0;
    for (let s = 20; s < tr.L; s += 46) {
      const sd = (Math.floor(s / 46) % 3 === 0) ? 1 : -1, q = at(s, sd * (WALL + 6));
      if (!free(q.x, q.z, WALL + 3.5) || (sd > 0 && q.z > 20)) continue;
      const g = new T.Group(); g.position.set(q.x, 0, q.z); g.rotation.y = q.h + (sd > 0 ? -Math.PI / 2 : Math.PI / 2);
      const b = new T.Mesh(new T.BoxGeometry(6, 3.2, 4.2), [new T.MeshLambertMaterial({ color: 0x2b2140 }), new T.MeshLambertMaterial({ color: 0x2b2140 }), new T.MeshLambertMaterial({ color: 0x2b2140 }),
        new T.MeshLambertMaterial({ color: 0x2b2140 }), new T.MeshBasicMaterial({ map: tex(boothFrontCanvas(bk)) }), new T.MeshLambertMaterial({ color: 0x2b2140 })]);
      b.position.set(0, 1.6, 0); g.add(b);
      const aw = new T.Mesh(new T.BoxGeometry(6.6, 0.15, 2.2), new T.MeshLambertMaterial({ map: tex(boothCanvas(bk)) })); aw.position.set(0, 3.25, 2.6); aw.rotation.x = 0.35; g.add(aw);
      grp.add(g); bk++;
    }
    const trunk = merge(T, [[limb(T, 0.32, 0.26, [0, 0, 0], [0.4, 3, 0], 7), "#7a5232"], [limb(T, 0.26, 0.22, [0.4, 3, 0], [1.1, 6, 0], 7), "#6e4a2c"], [limb(T, 0.22, 0.18, [1.1, 6, 0], [1.9, 8.6, 0], 7), "#7a5232"]]);
    const leafGeo = (function () {
      const parts = [];
      for (let k = 0; k < 8; k++) {
        const pl = new T.PlaneGeometry(4.2, 1.1, 4, 1);
        const pa = pl.attributes.position;
        for (let v = 0; v < pa.count; v++) { const x = pa.getX(v) + 2.1; pa.setX(v, x); pa.setY(v, -x * x * 0.07); }
        pl.rotateX(-Math.PI / 2 + 0.2); pl.rotateY(k / 8 * TAU); pl.translate(1.9, 8.7, 0);
        parts.push(pl);
      }
      let n = 0; parts.forEach(function (g) { n += g.index.count; });
      const pos = [], uv = [];
      parts.forEach(function (g) { const ng = g.toNonIndexed(); pos.push.apply(pos, ng.attributes.position.array); uv.push.apply(uv, ng.attributes.uv.array); });
      const out = new T.BufferGeometry();
      out.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); out.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
      out.computeVertexNormals();
      return out;
    })();
    const palms = [];
    for (let k = 0; k < 200 && palms.length < 44; k++) {
      const s = rnd() * tr.L, sd = rnd() < 0.5 ? -1 : 1, q = at(s, sd * (WALL + 3 + rnd() * 26));
      if (!free(q.x, q.z, WALL + 2.5) || q.z > 30) continue;
      palms.push({ x: q.x, z: q.z, r: rnd() * TAU, sx: 0.9 + rnd() * 0.3, sy: 0.85 + rnd() * 0.35, sz: 0.9 + rnd() * 0.3 });
    }
    lite.add(inst(trunk, new T.MeshLambertMaterial({ vertexColors: true }), palms));
    lite.add(inst(leafGeo, new T.MeshLambertMaterial({ map: tex(palmLeafCanvas()), alphaTest: 0.5, side: T.DoubleSide }), palms));
    // lamp posts with round globes
    const glows = [];
    for (let s = 10; s < tr.L; s += 30) [-1, 1].forEach(function (sd) { const q = at(s, sd * (WALL + 0.9)); glows.push([q.x, 4.2, q.z]); });
    const lp = merge(T, [[limb(T, 0.09, 0.07, [0, 0, 0], [0, 4, 0], 6), "#e8e8f0"]]);
    lite.add(inst(lp, new T.MeshLambertMaterial({ vertexColors: true }), glows.map(function (g) { return { x: g[0], z: g[2] }; })));
    lite.add(inst(new T.SphereGeometry(0.3, 10, 8), new T.MeshBasicMaterial({ color: 0xfff1d8 }), glows.map(function (g) { return { x: g[0], y: 4.2, z: g[2] }; })));
    grp.add(glowPoints(glows, 0xffe0b0, 4));
  }

  if (ev.theme === "drag") {
    // grandstands either side of the launch
    const crowd = tex(crowdCanvas(), true); crowd.repeat.set(6, 1);
    [-1, 1].forEach(function (sd) {
      const q = at(DRAG_START + 80, sd * (WALL + 9)), g = new T.Group();
      g.position.set(q.x, 0, q.z); g.rotation.y = q.h + (sd > 0 ? Math.PI : 0);
      const slope = new T.Mesh(new T.PlaneGeometry(150, 12), new T.MeshLambertMaterial({ map: crowd }));
      slope.rotation.x = -Math.PI / 2 + 0.6; slope.position.set(0, 3.4, 0); g.add(slope);
      const back = new T.Mesh(new T.BoxGeometry(150, 8, 0.6), new T.MeshLambertMaterial({ color: 0x2b2f3c })); back.position.set(0, 4, -5); g.add(back);
      const roof = new T.Mesh(new T.BoxGeometry(152, 0.4, 13), new T.MeshLambertMaterial({ color: 0xd8dbe4 })); roof.position.set(0, 10, 0.5); g.add(roof);
      grp.add(g);
    });
    // light towers
    const glows = [], towers = [];
    for (let s = DRAG_START - 40; s < DRAG_START + DRAG_LEN + 200; s += 70) [-1, 1].forEach(function (sd) { const q = at(s, sd * (WALL + 3)); towers.push({ x: q.x, z: q.z }); glows.push([q.x, 14, q.z]); });
    lite.add(inst(merge(T, [[limb(T, 0.2, 0.15, [0, 0, 0], [0, 14, 0], 6), "#4a4e5c"], [new T.BoxGeometry(2.4, 1.2, 0.6).translate(0, 14, 0), "#2a2e3a"]]), new T.MeshLambertMaterial({ vertexColors: true }), towers));
    grp.add(glowPoints(glows, 0xfff1d0, 9));
    // the Christmas tree between the lanes
    const tq = at(DRAG_START + 7, 0), tg = new T.Group();
    tg.position.set(tq.x, 0, tq.z); tg.rotation.y = tq.h;
    const dark = new T.MeshPhongMaterial({ color: 0x1b1d26, specular: 0x555555, shininess: 40 });
    const pole = new T.Mesh(new T.BoxGeometry(0.25, 2.2, 0.25), dark); pole.position.y = 1.1; tg.add(pole);
    const head = new T.Mesh(new T.BoxGeometry(0.35, 2.4, 0.9), dark); head.position.y = 3.3; tg.add(head);
    const lamps = {};
    const rows = [["pre", 4.35, 0xffffff, 0.09], ["stage", 4.1, 0xffffff, 0.09], ["a1", 3.75, 0xffb000, 0.13], ["a2", 3.43, 0xffb000, 0.13], ["a3", 3.11, 0xffb000, 0.13], ["green", 2.75, 0x22ff44, 0.15], ["red", 2.4, 0xff2222, 0.15]];
    rows.forEach(function (r) {
      lamps[r[0]] = [];
      [-0.22, 0.22].forEach(function (z) {
        const off = new T.Color(r[2]).multiplyScalar(0.12);
        const m = new T.Mesh(new T.SphereGeometry(r[3], 12, 8), new T.MeshBasicMaterial({ color: off }));
        m.position.set(-0.2, r[1], z); m.userData = { on: new T.Color(r[2]), off: off }; tg.add(m); lamps[r[0]].push(m);
      });
    });
    grp.add(tg);
    W2.tree = lamps;
  }

  grp.visible = false;
  R.scene.add(grp);
  return W2;
}

function showWorld(i) {
  if (!R) return;
  if (!R.worlds[i]) R.worlds[i] = buildWorld(i);
  R.worlds.forEach(function (w, k) { if (w) w.grp.visible = k === i; });
  R.world = i;
  const th = THEMES[EVENTS[i].theme], T = R.T;
  R.scene.fog = new T.Fog(th.fog, th.fogNear, th.fogFar);
  R.renderer.setClearColor(th.sky[1], 1);
  R.sky.material = R.skyMat[EVENTS[i].theme]; R.horizon.material = R.horizonMat[EVENTS[i].theme];
  R.hemi.color.set(th.hemi[0]); R.hemi.groundColor.set(th.hemi[1]); R.hemi.intensity = th.hemi[2];
  R.sun.color.set(th.sun[0]); R.sun.intensity = th.sun[1];
  const env = R.envs[EVENTS[i].theme];
  R.cars.forEach(function (c) { c.paint.envMap = env; c.side.envMap = env; c.paint.needsUpdate = c.side.needsUpdate = true; });
  R.kit.glass.envMap = env; R.kit.glass.needsUpdate = true;
  R.kit.beamMat.opacity = th.night ? 0.8 : 0.25;
  R.worlds[i].lite.visible = R.quality < QUALITY.length - 1;
  R.flagMat.map = R.flagTexGreen; R.flagMat.needsUpdate = true;
  R.dirty = true;
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
const QUALITY = [{ pr: 2 }, { pr: 1.5 }, { pr: 1.15 }, { pr: 1, lite: true }];
function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  if (R.world >= 0 && R.worlds[R.world]) R.worlds[R.world].lite.visible = !QUALITY[R.quality].lite;
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
  if (avg > 24) { if (++R.slowHits >= 2) { R.slowHits = 0; setQuality(R.quality + 1); } }
  else R.slowHits = 0;
}
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
    R.renderer.setPixelRatio(pr); R.renderer.setSize(cw, ch, false);
    R.gl.style.width = cw + "px"; R.gl.style.height = ch + "px";
    R.dirty = true;
  }
  if (left !== R.left || top !== R.top) { R.left = left; R.top = top; R.gl.style.left = left + "px"; R.gl.style.top = top + "px"; }
  return true;
}
function camShake(mag, dur) { if (!R || Shell.reduced) return; R.shakeMag = mag; R.shakeDur = R.shakeT = dur; }
function snapCamera() { if (R) R.camSnap = true; }

/* ---------------- Effects ---------------- */
const fxParts = [];                                          // HUD confetti
const CONF_COLS = ["#3ff0ff", "#ff3fa4", "#9bff3f", "#ffd23f", "#a77bff", "#ff4b3e"];
function confetti(n) {
  if (Shell.reduced) n = Math.round(n / 3);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, s = 120 + Math.random() * 260;
    fxParts.push({ x: W / 2 + (Math.random() - 0.5) * 120, y: 200, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.6 + Math.random(), c: CONF_COLS[i % CONF_COLS.length], w: 2.5 + (i % 3), rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14 });
  }
}
function sparks(c, side) {
  if (!R) return;
  const q = carWorld(c);
  for (let k = 0; k < 14; k++) {
    const i = R.sparkN = (R.sparkN + 1) % R.sparkV.length, v = R.sparkV[i];
    v.life = 0.35 + Math.random() * 0.35;
    R.sparkPos[i * 3] = q.x + q.rx * side * 1.0 + q.fx * (Math.random() - 0.3) * 2; R.sparkPos[i * 3 + 1] = 0.5 + Math.random() * 0.4; R.sparkPos[i * 3 + 2] = q.z + q.rz * side * 1.0 + q.fz * (Math.random() - 0.3) * 2;
    v.vx = q.fx * c.v * 0.6 + q.rx * side * (2 + Math.random() * 4) + (Math.random() - 0.5) * 3;
    v.vz = q.fz * c.v * 0.6 + q.rz * side * (2 + Math.random() * 4) + (Math.random() - 0.5) * 3;
    v.vy = 2 + Math.random() * 4;
  }
}
function puff(x, z, vx, vz, big) {
  const i = R.smokeN = (R.smokeN + 1) % R.smoke.length, s = R.smoke[i];
  s.life = 1; s.sp.visible = true; s.sp.position.set(x, 0.45, z); s.vx = vx; s.vz = vz; s.vy = 0.7 + Math.random() * 0.5; s.size = big ? 1.6 : 1.0;
  s.sp.material.opacity = 0.7;
}
function updateFx(dt) {
  for (let i = fxParts.length - 1; i >= 0; i--) {
    const p = fxParts[i];
    p.life -= dt; p.vy += 300 * dt; p.vx *= 0.985; p.rot += p.vr * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0 || p.y > H + 20) fxParts.splice(i, 1);
  }
  if (!R) return;
  for (let i = 0; i < R.sparkV.length; i++) {
    const v = R.sparkV[i];
    if (v.life <= 0) { R.sparkPos[i * 3 + 1] = -100; continue; }
    v.life -= dt; v.vy -= 14 * dt;
    R.sparkPos[i * 3] += v.vx * dt; R.sparkPos[i * 3 + 1] = Math.max(0.03, R.sparkPos[i * 3 + 1] + v.vy * dt); R.sparkPos[i * 3 + 2] += v.vz * dt;
    if (v.life <= 0) R.sparkPos[i * 3 + 1] = -100;
  }
  R.sparkPts.geometry.attributes.position.needsUpdate = true;
  for (let i = 0; i < R.smoke.length; i++) {
    const s = R.smoke[i];
    if (s.life <= 0) continue;
    s.life -= dt * 0.9;
    if (s.life <= 0) { s.sp.visible = false; continue; }
    s.sp.position.x += s.vx * dt; s.sp.position.y += s.vy * dt; s.sp.position.z += s.vz * dt;
    s.vx *= 0.96; s.vz *= 0.96;
    const sz = s.size * (1 + (1 - s.life) * 3.2);
    s.sp.scale.set(sz, sz, 1); s.sp.material.opacity = 0.6 * s.life;
  }
}

/* ---------------- Game state -> meshes ---------------- */
const CW = { x: 0, z: 0, fx: 1, fz: 0, rx: 0, rz: 1, h: 0 };
function carWorld(c, out) {
  out = out || CW;
  trackAt(TRACK, c.s, TP);
  const h = headingOf(TP) - c.a;
  out.x = TP.x - TP.tz * c.d; out.z = TP.z + TP.tx * c.d; out.h = h;
  out.fx = Math.cos(h); out.fz = -Math.sin(h); out.rx = -out.fz; out.rz = out.fx;
  out.th = headingOf(TP);
  return out;
}
const CWS = [];
function syncScene(state, fdt) {
  const T = R.T, idle = state === "title" || state === "over";
  R.clock += fdt;
  const night = THEMES[EVENTS[S.ev].theme].night;
  // which cars are in this event
  const inRace = S.kind === "drag" ? [0, 6] : [0, 1, 2, 3, 4, 5];
  R.cars.forEach(function (m, k) { m.grp.visible = inRace.indexOf(k) >= 0; });
  S.cars.forEach(function (c, k) {
    const m = R.cars[S.kind === "drag" && k === 1 ? 6 : k];
    const q = carWorld(c, CWS[k] || (CWS[k] = {}));
    m.grp.position.set(q.x, 0, q.z); m.grp.rotation.y = q.h;
    c.wheelRot += c.v * fdt / m.wheelR;
    const steerA = clamp(c.steerSm * 0.42, -0.42, 0.42);
    m.wheels.forEach(function (w) { w.spin.rotation.z = -c.wheelRot; w.steer.rotation.y = w.front ? -steerA : 0; });
    // body roll in corners, squat under power, dive under brakes
    const acc = (c.v - c.lastV) / Math.max(fdt, 1e-3); c.lastV = c.v;
    c.pitch = lerp(c.pitch, clamp(acc * 0.004, -0.05, 0.04), Math.min(1, fdt * 6));
    const lat = c.isPlayer ? c.steerSm * c.v * 0.0016 : -curveAt(TRACK, c.s) * c.v * c.v * 0.0012;
    c.roll = lerp(c.roll, clamp(lat, -0.07, 0.07), Math.min(1, fdt * 5));
    m.body.rotation.set(c.roll, 0, c.pitch);
    m.body.position.y = Math.sin(R.clock * 40 + k) * (c.v > 3 ? 0.004 : 0.008);
    const braking = c.isPlayer ? INPUT.brake && S.phase === "race" : c.v > 4 && c.lastBrake;
    m.tailMat.color.setHex(braking ? 0xff2a1a : 0x8a0d0d);
    // headlight pools only for you and the cars ahead: one from behind would land under the camera
    m.beam.visible = (night || S.kind === "drag") && (c.isPlayer || c.dist > S.P.dist + 2);
    m.glows.forEach(function (g, j) { g.visible = night || j % 2 === 1; if (j % 2) g.material.opacity = braking ? 1 : 0.5; });
    // tire smoke: wheelspin, slides, the burnout before a launch
    if (!idle && state !== "paused" && (c.spinT > 0 || c.slip > 0.25 || (S.kind === "drag" && S.phase !== "race" && c.isPlayer && c.rpm > 6800)) && Math.random() < (c.isPlayer ? 0.7 : 0.3)) {
      const back = carWorld(c, {});
      [-0.8, 0.8].forEach(function (sd) { puff(back.x - back.fx * 1.4 + back.rx * sd, back.z - back.fz * 1.4 + back.rz * sd, -back.fx * c.v * 0.1, -back.fz * c.v * 0.1, c.spinT > 0); });
    }
  });
  // the starter: flag up through the countdown, a big wave at GO, the checkered flag for the finish
  const st = R.starter;
  st.visible = S.kind === "circuit";
  if (st.visible) {
    const q = { x: 0, z: 0 }; trackAt(TRACK, 3, TP);
    st.position.set(TP.x - TP.tz * -(WALL + 2.4), 0, TP.z + TP.tx * -(WALL + 2.4)); st.rotation.y = headingOf(TP);
    let arm = 2.75;
    if (S.phase === "race" && S.t < 3 && !Shell.reduced) arm = 2.45 + Math.sin(S.t * 10) * 0.45;
    else if (S.phase === "race") arm = 0.12;
    if (S.phase === "done" || (S.phase === "race" && S.P.dist > (LAPS - 1) * TRACK.L + TRACK.L * 0.8)) {
      arm = 2.45 + Math.sin(R.clock * 10) * 0.45;
      if (R.flagMat.map !== R.flagTexCheck) { R.flagMat.map = R.flagTexCheck; R.flagMat.needsUpdate = true; }
    }
    R.starterArm.rotation.z = arm;
    if (!Shell.reduced) {
      const fp = R.flag.geometry.attributes.position, fb = R.flagBase;
      for (let i = 0; i < fp.count; i++) { const fx = fb[i * 3]; fp.setZ(i, Math.sin(fx * 7 - R.clock * 9) * fx * 0.12); }
      fp.needsUpdate = true;
    }
  }
  R.fans.forEach(function (f, k) {
    f.g.visible = true;
    const d = S.kind === "drag" ? (k % 2 ? 1 : -1) * (WALL + 2.2) : -(WALL + 2.4 + (k % 2) * 1.2);
    const s = S.kind === "drag" ? DRAG_START - 6 + k * 3.5 : 9 + k * 3.2;
    trackAt(TRACK, s, TP);
    f.g.position.set(TP.x - TP.tz * d, 0, TP.z + TP.tx * d); f.g.rotation.y = headingOf(TP) + (d > 0 ? Math.PI : 0) + (k - 2) * 0.15;
    const cheer = S.phase === "done" || (S.phase === "race" && S.t < 2.5) || S.place === 1 && S.over;
    f.arm.rotation.z = cheer && !Shell.reduced ? 2.5 + Math.sin(R.clock * 9 + k) * 0.4 : 0.08;
  });
  // the world: start lights, the tree, spinning things, water
  const w = R.worlds[R.world];
  if (w && w.lights.length) {
    const lit = S.phase === "count" ? Math.min(5, Math.floor(S.phaseT / 0.6) + 1) : 0, go = S.phase === "race" && S.t < 2.5;
    w.lights.forEach(function (m, k) { m.material.color.setHex(go ? 0x22ff55 : k < lit ? 0xff2a1a : 0x300606); });
  }
  if (w && w.tree) {
    const tt = S.treeT - S.amberAt, on = function (name, b) { w.tree[name].forEach(function (m) { m.material.color.copy(b ? m.userData.on : m.userData.off); }); };
    on("pre", S.phase !== "stage" || S.phaseT > 0.4); on("stage", S.phase !== "stage");
    on("a1", !S.green && tt >= 0 && tt < 1.5); on("a2", !S.green && tt >= 0.5 && tt < 1.5); on("a3", !S.green && tt >= 1.0 && tt < 1.5);
    on("green", S.green && !S.foul); on("red", S.foul);
  }
  if (w) {
    w.spin.forEach(function (o) { o.obj.rotation.z += o.rate * fdt; o.gondolas.forEach(function (g) { g.rotation.z = -o.obj.rotation.z; }); });
    if (w.water && !Shell.reduced) w.water.offset.set((R.clock * 0.01) % 1, (R.clock * 0.02) % 1);
  }
  updateCamera(state, fdt);
  R.sky.position.copy(R.camera.position); R.horizon.position.set(R.camera.position.x, 120, R.camera.position.z);
}

function updateCamera(state, dt) {
  const P = S.P, cam = R.camera, q = carWorld(P, {}), idle = state === "title" || state === "over";
  let pos = R.camPos, look = R.camLook, fov = 62;
  const yawGoal = S.kind === "drag" ? q.th : q.h * 0.6 + q.th * 0.4;
  let dyaw = yawGoal - R.camYaw;
  while (dyaw > Math.PI) dyaw -= TAU; while (dyaw < -Math.PI) dyaw += TAU;
  R.camYaw += dyaw * Math.min(1, dt * 5);
  if (R.camSnap) { R.camYaw = yawGoal; }
  const fx = Math.cos(R.camYaw), fz = -Math.sin(R.camYaw), rx = -fz, rz = fx;
  let px, py, pz, lx, ly, lz;
  if (idle || S.phase === "done") {
    const a = (idle ? idleT * 0.22 : R.clock * 0.35) + 0.6, rad = idle ? 9.5 : 10;
    px = q.x + Math.cos(q.h + a) * rad; pz = q.z - Math.sin(q.h + a) * rad; py = idle ? 2.6 : 3.2;
    lx = q.x; ly = 0.9; lz = q.z;
  } else if (S.phase === "grid" || S.phase === "count" || S.phase === "stage" || S.phase === "tree") {
    // swing in from the front corner, settle in behind
    const t = S.phase === "grid" || S.phase === "stage" ? S.phaseT : (S.kind === "drag" ? 1.1 + S.treeT : 1.1 + S.phaseT);
    const k = Shell.reduced ? 1 : clamp(t / 2.6, 0, 1), e = k * k * (3 - 2 * k), a = (1 - e) * 2.5;
    const rad = lerp(8, S.kind === "drag" ? 8.4 : 7.6, e), side = S.kind === "drag" ? 1.6 * e : 0;
    px = q.x - (Math.cos(a) * fx - Math.sin(a) * rx) * rad + rx * side; pz = q.z - (Math.cos(a) * fz - Math.sin(a) * rz) * rad + rz * side;
    py = lerp(1.6, 2.9, e);
    lx = q.x + fx * 6 * e; ly = 1.0; lz = q.z + fz * 6 * e;
  } else {
    const back = S.kind === "drag" ? 8.4 : 7.4, hgt = S.kind === "drag" ? 3.0 : 2.75, side = S.kind === "drag" ? 1.6 : 0;
    px = q.x - fx * back + rx * side; pz = q.z - fz * back + rz * side; py = hgt;
    lx = q.x + fx * 7 + rx * side * 0.5; ly = 1.05; lz = q.z + fz * 7 + rz * side * 0.5;
    fov = 62 + clamp(P.v, 0, 72) * 0.17 + (S.burstT > 0 && !Shell.reduced ? S.burstT * 10 : 0);
  }
  // The camera eases its offset from the car, never its place in the world, so it can't fall behind at speed.
  if (R.camSnap) { pos.set(px - q.x, py, pz - q.z); look.set(lx - q.x, ly, lz - q.z); R.camSnap = false; }
  else {
    const k = 1 - Math.exp(-dt * (S.phase === "race" ? 14 : 4));
    pos.x += (px - q.x - pos.x) * k; pos.y += (py - pos.y) * k; pos.z += (pz - q.z - pos.z) * k;
    look.x += (lx - q.x - look.x) * k; look.y += (ly - look.y) * k; look.z += (lz - q.z - look.z) * k;
  }
  R.fov += (fov - R.fov) * Math.min(1, dt * 4);
  let sx = 0, sy = 0;
  if (R.shakeT > 0) { R.shakeT -= dt; const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur); sx = (Math.random() * 2 - 1) * m; sy = (Math.random() * 2 - 1) * m; }
  if (S.phase === "race" && P.v > 45 && !Shell.reduced) { sy += (Math.random() - 0.5) * (P.v - 45) * 0.0016; }
  cam.position.set(q.x + pos.x + sx, pos.y + sy, q.z + pos.z);
  cam.lookAt(q.x + look.x + sx, look.y + sy, q.z + look.z);
  if (Math.abs(cam.fov - R.fov) > 0.01) { cam.fov = R.fov; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
}

/* ---------------- HUD (2D canvas on top) ---------------- */
function txt(c, s, x, y, size, color, align, shadow, weight) {
  c.font = (weight || "bold") + " " + size + "px " + HUD_FONT;
  c.textAlign = align || "left"; c.textBaseline = "top";
  if (shadow) { c.fillStyle = shadow; c.fillText(s, x + 1, y + 1); }
  c.fillStyle = color; c.fillText(s, x, y);
}
function rrect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
const TACH_A0 = Math.PI * 0.75, TACH_SPAN = Math.PI * 1.5;   // 0 rpm at lower left, 9000 at lower right
function tachAngle(r) { return TACH_A0 + clamp(r / 9000, 0, 1) * TACH_SPAN; }

function drawTach(c, cx, cy, rad) {
  const P = S.P, rpm = P.rpm;
  c.save();
  // housing
  const bg = c.createRadialGradient(cx, cy - rad * 0.3, rad * 0.2, cx, cy, rad);
  bg.addColorStop(0, "#232842"); bg.addColorStop(1, "#090b16");
  c.fillStyle = "rgba(0,0,0,.45)"; c.beginPath(); c.arc(cx + 2, cy + 3, rad + 4, 0, TAU); c.fill();
  c.fillStyle = bg; c.beginPath(); c.arc(cx, cy, rad + 3, 0, TAU); c.fill();
  c.lineWidth = 3; c.strokeStyle = "#c9cfe0"; c.stroke();
  // zones: the green shift window, the red line
  const zr = rad - 7;
  c.lineWidth = 7;
  c.strokeStyle = "rgba(255,255,255,.12)"; c.beginPath(); c.arc(cx, cy, zr, tachAngle(0), tachAngle(9000)); c.stroke();
  c.strokeStyle = "#ffd23f"; c.beginPath(); c.arc(cx, cy, zr, tachAngle(EARLY_RPM), tachAngle(GREEN_LO)); c.stroke();
  c.strokeStyle = "#39ff6a"; c.beginPath(); c.arc(cx, cy, zr, tachAngle(GREEN_LO), tachAngle(GREEN_HI)); c.stroke();
  c.strokeStyle = "#ff3322"; c.beginPath(); c.arc(cx, cy, zr, tachAngle(GREEN_HI), tachAngle(9000)); c.stroke();
  if (S.kind === "drag" ? !S.P.launched : (S.phase === "grid" || S.phase === "count")) {     // the launch window, while the car is held
    c.lineWidth = 4; c.strokeStyle = "#3ff0ff"; c.beginPath(); c.arc(cx, cy, zr - 7, tachAngle(LAUNCH_LO), tachAngle(LAUNCH_HI)); c.stroke();
  }
  // ticks and numbers
  for (let k = 0; k <= 9; k++) {
    const a = tachAngle(k * 1000), ca = Math.cos(a), sa = Math.sin(a);
    c.lineWidth = 2; c.strokeStyle = k >= 8 ? "#ff6a5a" : "#e8ecf6";
    c.beginPath(); c.moveTo(cx + ca * (rad - 12), cy + sa * (rad - 12)); c.lineTo(cx + ca * (rad - 19), cy + sa * (rad - 19)); c.stroke();
    if (rad > 44) txt(c, String(k), cx + ca * (rad - 27), cy + sa * (rad - 27) - 4, 8, k >= 8 ? "#ff6a5a" : "#aab3cc", "center");
  }
  // gear and speed
  const gear = S.kind === "drag" && P.gear === 0 ? "N" : String(P.gear);
  const inZone = rpm >= GREEN_LO && rpm <= GREEN_HI && S.phase === "race";
  txt(c, gear, cx, cy - rad * 0.36, Math.round(rad * 0.56), inZone ? "#39ff6a" : "#ffffff", "center", "#000");
  txt(c, Math.round(P.v * MPH) + " MPH", cx, cy + rad * 0.3, Math.max(8, Math.round(rad * 0.18)), "#ffd23f", "center", "#000");
  // needle
  const na = tachAngle(rpm) + (P.redT > 0 && !Shell.reduced ? (Math.random() - 0.5) * 0.05 : 0);
  c.lineCap = "round";
  c.lineWidth = 4; c.strokeStyle = "rgba(0,0,0,.5)"; c.beginPath(); c.moveTo(cx + 1, cy + 2); c.lineTo(cx + 1 + Math.cos(na) * (rad - 10), cy + 2 + Math.sin(na) * (rad - 10)); c.stroke();
  c.lineWidth = 3; c.strokeStyle = "#ff4b3e"; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(na) * (rad - 10), cy + Math.sin(na) * (rad - 10)); c.stroke();
  c.fillStyle = "#e8ecf6"; c.beginPath(); c.arc(cx, cy, 5, 0, TAU); c.fill();
  c.restore();
}
// The shift lights above the tach: they fill from 5,000 and all flash when it is time to shift.
function drawShiftLights(c, cx, y) {
  const P = S.P, n = 9, gap = 3, sz = 9, w = n * sz + (n - 1) * gap, x0 = cx - w / 2;
  const held = S.kind === "drag" ? !P.launched : S.phase !== "race";
  const lo = held ? 2000 : 5000, hi = held ? LAUNCH_HI : GREEN_LO;
  const lit = clamp(Math.floor((P.rpm - lo) / (hi - lo) * n), 0, n);
  const zone = held ? P.rpm >= LAUNCH_LO && P.rpm <= LAUNCH_HI : P.rpm >= GREEN_LO && P.rpm <= GREEN_HI;
  const over = held ? P.rpm > LAUNCH_HI : P.rpm > GREEN_HI;
  const flash = !Shell.reduced && Math.floor(S.clock * 14) % 2 === 0;
  rrect(c, x0 - 5, y - 4, w + 10, sz + 8, 5); c.fillStyle = "rgba(6,8,18,.82)"; c.fill();
  for (let i = 0; i < n; i++) {
    let col = i < 4 ? "#39ff6a" : i < 7 ? "#ffd23f" : "#ff3322", on = i < lit;
    if (zone) { col = held ? "#3ff0ff" : "#39ff6a"; on = true; }
    if (over) { col = "#ff3322"; on = flash; }
    c.fillStyle = on ? col : "rgba(255,255,255,.1)";
    c.beginPath(); c.arc(x0 + i * (sz + gap) + sz / 2, y + sz / 2, sz / 2, 0, TAU); c.fill();
    if (on) { c.fillStyle = "rgba(255,255,255,.55)"; c.beginPath(); c.arc(x0 + i * (sz + gap) + sz / 2 - 1.3, y + sz / 2 - 1.3, 1.6, 0, TAU); c.fill(); }
  }
}
function drawButtons(c) {
  for (const k in BTN) {
    const b = BTN[k];
    let held = false;
    touches.forEach(function (v) { if (v === k) held = true; });
    rrect(c, b.x, b.y, b.w, b.h, 10);
    const base = k === "gas" ? "rgba(40,170,80," : k === "brake" ? "rgba(200,50,50," : k === "up" || k === "down" ? "rgba(40,120,220," : "rgba(30,34,52,";
    c.fillStyle = base + (held ? ".85)" : ".45)"); c.fill();
    c.lineWidth = 2; c.strokeStyle = held ? "#ffffff" : "rgba(255,255,255,.55)"; c.stroke();
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    c.fillStyle = "#ffffff";
    if (k === "left" || k === "right") {
      const s = k === "left" ? 1 : -1;                     // the point faces the way you steer
      c.beginPath(); c.moveTo(cx + s * 10, cy - 12); c.lineTo(cx - s * 10, cy); c.lineTo(cx + s * 10, cy + 12); c.closePath(); c.fill();
    } else if (k === "up" || k === "down") {
      c.beginPath();
      if (k === "up") { c.moveTo(cx - 11, cy + 2); c.lineTo(cx, cy - 10); c.lineTo(cx + 11, cy + 2); }
      else { c.moveTo(cx - 11, cy - 6); c.lineTo(cx, cy + 6); c.lineTo(cx + 11, cy - 6); }
      c.closePath(); c.fill();
      txt(c, k === "up" ? "SHIFT" : "DOWN", cx, b.y + b.h - 16, 8, "#dfe8ff", "center");
    } else txt(c, b.label, cx, cy - 6, 11, "#ffffff", "center", "rgba(0,0,0,.5)");
  }
}
function drawMap(c, x, y, sz) {
  if (!TRACK.closed) return;
  if (!R.map || R.map.ev !== S.ev) {
    let a = 1e9, b = -1e9, d = 1e9, e = -1e9;
    for (let i = 0; i < TRACK.N; i += 4) { a = Math.min(a, TRACK.X[i]); b = Math.max(b, TRACK.X[i]); d = Math.min(d, TRACK.Z[i]); e = Math.max(e, TRACK.Z[i]); }
    const k = (sz - 12) / Math.max(b - a, e - d);
    R.map = { ev: S.ev, k: k, ox: (sz - (b - a) * k) / 2 - a * k, oz: (sz - (e - d) * k) / 2 - d * k };
  }
  const m = R.map;
  rrect(c, x, y, sz, sz, 8); c.fillStyle = "rgba(6,8,20,.6)"; c.fill();
  c.lineWidth = 4; c.strokeStyle = "rgba(255,255,255,.25)"; c.lineJoin = "round";
  c.beginPath();
  for (let i = 0; i <= TRACK.N; i += 6) { const px = x + m.ox + TRACK.X[i % TRACK.N] * m.k, pz = y + m.oz + TRACK.Z[i % TRACK.N] * m.k; if (i) c.lineTo(px, pz); else c.moveTo(px, pz); }
  c.closePath(); c.stroke();
  c.lineWidth = 1.5; c.strokeStyle = "rgba(255,255,255,.75)"; c.stroke();
  for (let k = S.cars.length - 1; k >= 0; k--) {
    const car = S.cars[k]; trackAt(TRACK, car.s, TP);
    c.fillStyle = car.isPlayer ? "#ffd23f" : car.color;
    c.beginPath(); c.arc(x + m.ox + TP.x * m.k, y + m.oz + TP.z * m.k, car.isPlayer ? 4 : 2.8, 0, TAU); c.fill();
    if (car.isPlayer) { c.lineWidth = 1.5; c.strokeStyle = "#101219"; c.stroke(); }
  }
}
function drawTree(c, x, y) {                               // a small copy of the drag tree in the HUD
  const tt = S.treeT - S.amberAt;
  rrect(c, x, y, 34, 118, 6); c.fillStyle = "rgba(6,8,18,.85)"; c.fill();
  const rows = [["#ffffff", S.phase !== "stage"], ["#ffffff", S.phase !== "stage"], ["#ffb000", !S.green && tt >= 0 && tt < 1.5], ["#ffb000", !S.green && tt >= 0.5 && tt < 1.5],
                ["#ffb000", !S.green && tt >= 1.0 && tt < 1.5], ["#22ff44", S.green && !S.foul], ["#ff2222", S.foul]];
  rows.forEach(function (r, i) {
    const big = i >= 2, rr = big ? 6 : 4, cy = y + 10 + i * 15.5 + (big ? 2 : 0);
    [x + 10, x + 24].forEach(function (cx) { c.fillStyle = r[1] ? r[0] : "rgba(255,255,255,.1)"; c.beginPath(); c.arc(cx, cy, rr, 0, TAU); c.fill(); });
  });
}

function drawHUD(c, state) {
  const P = S.P, ev = EVENTS[S.ev], th = THEMES[ev.theme];
  // top bar
  const bg = c.createLinearGradient(0, 0, 0, 44);
  bg.addColorStop(0, "rgba(16,18,40,.95)"); bg.addColorStop(1, "rgba(8,10,24,.92)");
  c.fillStyle = bg; c.fillRect(0, 0, W, 44);
  c.fillStyle = th.accent; c.fillRect(0, 44, W, 2);
  if (S.kind === "drag") {
    txt(c, "REACTION", 8, 5, 8, "#8e93a2");
    txt(c, P.launched ? (S.foul ? "RED" : (P.launchClock - S.greenT).toFixed(3)) : "-.---", 8, 17, 17, S.foul ? "#ff4b3e" : "#3ff0ff");
    txt(c, "1/4 MILE", W / 2, 5, 8, "#8e93a2", "center");
    const left = clamp(DRAG_START + DRAG_LEN - P.dist, 0, DRAG_LEN);
    txt(c, Math.round(left * 3.281) + " FT", W / 2, 17, 17, "#ffffff", "center");
    txt(c, "ELAPSED", W - 8, 5, 8, "#8e93a2", "right");
    const et = S.et || (P.launched ? S.clock - P.launchClock : 0);
    txt(c, et.toFixed(2), W - 8, 17, 17, "#ffd23f", "right");
  } else {
    txt(c, "POS", 8, 5, 8, "#8e93a2");
    const pl = state === "playing" || state === "paused" ? (S.phase === "done" ? S.place : placeOf(P)) : S.place;
    txt(c, String(pl), 8, 15, 22, pl === 1 ? "#ffd23f" : "#ffffff");
    txt(c, "/" + S.cars.length, 8 + (pl >= 10 ? 28 : 16), 24, 12, "#8e93a2");
    txt(c, "LAP", W / 2, 5, 8, "#8e93a2", "center");
    const lap = clamp(Math.floor(Math.max(0, P.dist) / TRACK.L) + 1, 1, LAPS);
    txt(c, lap + " / " + LAPS, W / 2, 16, 18, lap === LAPS ? "#ff3fa4" : "#ffffff", "center");
    txt(c, "TIME", W - 8, 5, 8, "#8e93a2", "right");
    txt(c, timeStr(S.phase === "done" ? S.finishT : S.t), W - 8, 15, 15, "#ffd23f", "right");
    txt(c, "BEST LAP " + (S.bestLap ? timeStr(S.bestLap) : "--"), W - 8, 32, 8, "#a8ecff", "right");
  }
  // the LED strip under the bar
  if (LED) {
    const img = ledHud();
    c.fillStyle = "#000"; c.fillRect(0, 46, W, 26);
    c.imageSmoothingEnabled = true;
    c.drawImage(img, 0, 47, W, 24);
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#1b1d26"; c.fillRect(0, 71, W, 2);
  }
  if (S.kind === "circuit") drawMap(c, W - 74, 78, 66);
  else if (S.phase !== "done") drawTree(c, 8, 80);

  // speed lines on a perfect shift
  if (S.burstT > 0 && !Shell.reduced) {
    c.save(); c.globalAlpha = Math.min(1, S.burstT * 2.2) * 0.55; c.strokeStyle = "#e8fffb"; c.lineWidth = 2;
    for (let k = 0; k < 18; k++) {
      const a = k / 18 * TAU + S.clock * 0.7, r0 = 120 + (k * 37) % 60;
      c.beginPath(); c.moveTo(W / 2 + Math.cos(a) * r0, 250 + Math.sin(a) * r0 * 1.2); c.lineTo(W / 2 + Math.cos(a) * (r0 + 90), 250 + Math.sin(a) * (r0 + 90) * 1.2); c.stroke();
    }
    c.restore();
  }
  // countdown
  if (S.phase === "count") {
    const n = 3 - Math.floor(S.phaseT), k = S.phaseT % 1;
    c.save(); c.globalAlpha = 1 - k * 0.6;
    txt(c, String(n), W / 2, 150 - k * 10, 74 + k * 12, "#ffd23f", "center", "#08205f", "900");
    c.restore();
  }
  if (S.phase === "race" && S.t < 0.8 && S.kind === "circuit") txt(c, "GO!", W / 2, 150, 70, "#39ff6a", "center", "#08205f", "900");
  // hints while the car is held
  const held = S.kind === "drag" ? !P.launched && S.phase !== "done" : S.phase === "grid" || S.phase === "count";
  if (held && state === "playing") {
    const l1 = S.kind === "drag" ? "HOLD GAS, REVS IN THE BLUE" : "HOLD GAS: REVS IN THE BLUE";
    const l2 = S.kind === "drag" ? "SHIFT UP ON GREEN TO LAUNCH" : "THE CAR LAUNCHES ON GO";
    rrect(c, 40, 256, W - 80, 40, 8); c.fillStyle = "rgba(6,8,20,.7)"; c.fill();
    txt(c, l1, W / 2, 262, 11, "#3ff0ff", "center");
    txt(c, l2, W / 2, 278, 11, "#ffffff", "center");
  }
  // redline warning
  if (P.redT > 0.12 && S.phase === "race" && (Shell.reduced || Math.floor(S.clock * 8) % 2 === 0)) txt(c, "REDLINE! SHIFT UP", W / 2, 312, 13, "#ff3322", "center", "#000");
  // floating calls
  for (let i = 0; i < floats.length; i++) {
    const f = floats[i], yy = 340 - f.t * 30 - i * 2;
    c.globalAlpha = Math.max(0, 1 - f.t / 1.1);
    txt(c, f.txt, W / 2, yy, f.big ? 18 : 14, f.col, "center", "#000", "900");
    c.globalAlpha = 1;
  }
  // cluster
  const tcx = W / 2, tcy = touchMode ? 486 : 474, trad = touchMode ? 50 : 60;
  drawShiftLights(c, tcx, tcy - trad - 20);
  drawTach(c, tcx, tcy, trad);
  if (!touchMode) {
    txt(c, "E / SHIFT: UP", 12, H - 34, 9, "rgba(255,255,255,.7)", "left", "#000");
    txt(c, "Q / CTRL: DOWN", 12, H - 20, 9, "rgba(255,255,255,.7)", "left", "#000");
    txt(c, "ARROWS / WASD", W - 12, H - 34, 9, "rgba(255,255,255,.7)", "right", "#000");
    txt(c, "STEER, GAS, BRAKE", W - 12, H - 20, 9, "rgba(255,255,255,.7)", "right", "#000");
  } else drawButtons(c);
}

function draw(c, state) {
  if (!R || !R.hud) return;
  const now = performance.now();
  let ms = now - R.lastT;
  R.lastT = now;
  if (!(ms > 0)) ms = 0;
  const sized = layout();
  if (state === "paused" && !R.dirty) return;
  if (state === "playing") watchFrameRate(ms);
  if (state !== "playing" && state !== "paused") { ledTick(Math.min(ms, 50) / 1000); }
  if (sized) {
    syncScene(state, state === "paused" ? 0 : Math.min(ms, 50) / 1000);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  if (state === "playing" || state === "paused") drawHUD(c, state);
  for (let i = 0; i < fxParts.length; i++) {
    const q = fxParts[i];
    c.globalAlpha = clamp(q.life * 2, 0, 1); c.fillStyle = q.c;
    c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.fillRect(-q.w, -q.w * 0.6, q.w * 2, q.w * 1.2); c.restore();
  }
  c.globalAlpha = 1;
}

/* ---------------- Splash, event picker, boot, shell hookup ---------------- */
function makeSplash() {
  const el = document.createElement("div");
  el.id = "npg-splash";
  el.setAttribute("role", "img"); el.setAttribute("aria-label", "Nostalgia Pro Games");
  el.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;z-index:9999;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;gap:18px;padding:24px;box-sizing:border-box;text-align:center;" +
    "background:radial-gradient(circle at 50% 42%,#3a1f6e 0%,#140a33 52%,#05061a 100%);" +
    "font:bold 15px/1.5 " + HUD_FONT.replace(/"/g, "'") + ";color:#ffffff;opacity:1;transition:opacity .35s ease";
  const img = document.createElement("img");
  img.alt = ""; img.decoding = "async";
  img.style.cssText = "display:block;width:min(66vw,44vh,340px);height:auto;opacity:0;transform:scale(.86);" +
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "transition:opacity .2s ease" : "transition:opacity .28s ease,transform .55s cubic-bezier(.2,1.5,.4,1)");
  el.appendChild(img);
  const bar = document.createElement("div");
  bar.style.cssText = "width:min(60vw,240px);height:6px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden";
  const fill = document.createElement("div");
  fill.style.cssText = "height:100%;width:8%;background:linear-gradient(90deg,#39ff6a,#ffd23f,#ff3322);transition:width .3s ease";
  bar.appendChild(fill); el.appendChild(bar);
  document.body.appendChild(el);
  return { el: el, img: img, fill: fill };
}
function splashFail(splash, lines) {
  const el = splash.el;
  splash.img.style.width = "min(40vw,26vh,180px)";
  el.setAttribute("role", "alert"); el.removeAttribute("aria-label");
  if (splash.fill.parentNode) splash.fill.parentNode.style.display = "none";
  const p = document.createElement("p"); p.style.cssText = "margin:0;max-width:30em"; p.textContent = lines;
  const a = document.createElement("a"); a.href = "../"; a.textContent = "Back to the arcade"; a.style.cssText = "color:#ffe45c";
  el.appendChild(p); el.appendChild(a);
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
    img.onload = function () { fin(true); }; img.onerror = function () { fin(false); };
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
  hud.style.touchAction = "none";
  if (getComputedStyle(hud).position === "static") hud.style.position = "relative";
  const crt = stage.querySelector(".np-crt");
  if (crt) crt.style.display = "none";
  R.lastT = performance.now();
  layout();
  bindTouch(hud);
}

// The event picker: four buttons on the title card (and on the score card, for the next run).
const pickers = [];
function bestLine(ev) {
  const b = bests[ev.id];
  if (!b) return "No time yet";
  return ev.kind === "drag" ? "Best " + b.toFixed(3) + " s" : "Best " + timeStr(b);
}
function buildPicker(parent, before) {
  if (!parent) return;
  const wrap = document.createElement("div");
  wrap.setAttribute("role", "radiogroup"); wrap.setAttribute("aria-label", "Pick an event");
  wrap.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0 10px";
  const btns = EVENTS.map(function (ev, i) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-btn"; b.setAttribute("role", "radio");
    b.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:7px 4px;min-height:54px;font-size:11px;line-height:1.2;white-space:normal";
    b.addEventListener("click", function (e) { e.stopPropagation(); Snd.unlock(); pickEvent(i); });
    wrap.appendChild(b);
    return b;
  });
  parent.insertBefore(wrap, before || null);
  pickers.push(btns);
  labelPickers();
}
function labelPickers() {
  bests = loadBests();
  pickers.forEach(function (btns) {
    btns.forEach(function (b, i) {
      const ev = EVENTS[i], on = i === evIndex, th = THEMES[ev.theme];
      b.innerHTML = "<b style='font-size:12px'>" + (i + 1) + ". " + ev.name + "</b><span style='opacity:.85'>" + ev.sub + (ev.kind === "circuit" ? ", 3 laps" : "") + "</span><span style='opacity:.7;font-size:10px'>" + bestLine(ev) + "</span>";
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.style.outline = on ? "3px solid " + th.accent : "none";
      b.style.outlineOffset = "-3px";
      b.style.background = on ? "linear-gradient(180deg," + shade(th.accent, -0.35) + "," + shade(th.accent, -0.6) + ")" : "";
      b.style.color = on ? "#ffffff" : "";
    });
  });
}
function pickEvent(i) {
  if (i === evIndex) return;
  evIndex = clamp(i, 0, EVENTS.length - 1);
  Shell.save(EVENT_KEY, evIndex);
  showWorld(evIndex);
  const st = Shell.state();
  if (st === "title" || st === "over") { reset(); }
  labelPickers();
}

function startGame() {
  Shell.init({
    slug: SLUG,
    title: "SHIFT RACING",
    accent: "#39ff6a",
    width: W, height: H,
    format: function (n) { return n.toLocaleString() + " PTS"; },
    howTo: "Street racing in real 3D. Hold the gas and shift up when the needle hits the green: a perfect shift kicks you forward, early or late ones cost you, and the redline cuts your power. 3 laps against 5 drivers, or a quarter mile drag.",
    keys: "Keys: arrows or WASD steer, gas and brake. E, Space or Shift shifts up, Q or Ctrl shifts down. 1 to 4 picks an event. P pause, M mute, N music, R restart.",
    tip: "Hold the revs in the blue at the start for a perfect launch.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { if (paused) return; idleT += dt; updateFx(dt); for (let i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; if (floats[i].t > 1.1) floats.splice(i, 1); } Snd.engine(); },
    onPause: function () { paused = true; keys = {}; touches.clear(); Snd.engine(); },
    onResume: function () { paused = false; }
  });
  attach();
  // Sound: nothing is made until the first tap, click or key press.
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Snd.unlock, true); });
  Shell.onStart(function () { Snd.unlock(); snapCamera(); });
  Shell.onRestart(function () { Snd.unlock(); snapCamera(); });
  Shell.onResume(Snd.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));
    if (typing || e.metaKey || e.altKey) return;
    const st = Shell.state();
    if (e.code === "KeyN" && !e.ctrlKey && !e.repeat) Snd.toggleMusic();
    // Ctrl shifts down. The shell ignores keys while Ctrl is held, so it is caught here.
    if ((e.code === "ControlLeft" || e.code === "ControlRight") && st === "playing") { e.preventDefault(); if (!e.repeat) shiftDown(); }
    if ((st === "title" || st === "over") && !e.ctrlKey && /^Digit[1-4]$/.test(e.code)) pickEvent(Number(e.code.slice(5)) - 1);
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  // The full studio logo heads the title card and the score card; the course itself carries the script wordmark.
  function logo(card, size) {
    if (!card) return;
    const im = document.createElement("img");
    im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
    im.style.cssText = "display:block;width:" + size + ";height:auto;margin:0 auto 6px";
    im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
    im.src = LOGO_URL;
    card.insertBefore(im, card.firstChild);
  }
  logo(titleCard, "clamp(56px,11vh,92px)");
  if (titleCard) buildPicker(titleCard, titleCard.querySelector("[data-act='start']"));
  if (titleCard) Snd.button(titleCard, titleCard.querySelector(".np-tip"));
  if (pauseActions) Snd.button(pauseActions, pauseActions.querySelector("a"));
  const over = document.querySelector("#np-ov-over .np-card");
  logo(over, "clamp(64px,14vh,104px)");
  if (over) buildPicker(over, over.querySelector(".np-actions"));
  Shell.onStart(labelPickers); Shell.onRestart(labelPickers);
  const obs = new MutationObserver(function () { if (Shell.state() === "over") labelPickers(); });
  const ov = document.getElementById("np-ov-over");
  if (ov) obs.observe(ov, { attributes: true, attributeFilter: ["class"] });
}

// Hook for automated checks (no effect on play)
window.__shiftRacing = {
  S: function () { return S; }, R: function () { return R; }, track: function () { return TRACK; }, led: function () { return LED; }, snd: function () { return Snd.peek(); },
  input: INPUT, keys: function () { return keys; }, shiftUp: shiftUp, shiftDown: shiftDown, pick: pickEvent, events: EVENTS, update: update,
  setTouch: function (on) { touchMode = !!on; },
  curveAt: function (s) { return curveAt(TRACK, s); }, aiTarget: aiTarget, zoneOf: zoneOf, GEAR_TOP: GEAR_TOP, ROAD: ROAD, WALL: WALL
};

(function boot() {
  const splash = makeSplash();
  const t0 = performance.now();
  const q = /[?&]gfx=(high|low)/.exec(location.search);
  try { const e = Number(window.localStorage.getItem("npArcade." + SLUG + "." + EVENT_KEY)); if (e >= 0 && e < EVENTS.length) evIndex = e | 0; } catch (err) { /* private mode */ }
  touchMode = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  Promise.all([loadLogo(splash), import(THREE_URL).then(null, function (e) { e.npStage = "three"; throw e; }), loadImage(SCRIPT_URL)])
    .then(function (res) {
      splash.fill.style.width = "45%";
      THREE = res[1];
      try { R = buildScene(THREE, res[2]); showWorld(evIndex); } catch (e) { e.npStage = "webgl"; throw e; }
      if (q) { R.qLock = true; setQuality(q[1] === "low" ? QUALITY.length - 1 : 0); }
      splash.fill.style.width = "80%";
      reset();
      try { syncScene("title", 0); R.renderer.compile(R.scene, R.camera); } catch (e) { /* warm-up only */ }
      splash.fill.style.width = "100%";
      const hold = Math.max(0, 1400 - (performance.now() - t0));
      return new Promise(function (r) { setTimeout(r, hold); });
    })
    .then(function () {
      startGame();
      splash.el.style.opacity = "0"; splash.el.style.pointerEvents = "none";
      setTimeout(function () { if (splash.el.parentNode) splash.el.parentNode.removeChild(splash.el); }, 420);
    })
    .catch(function (e) {
      console.error(e);
      splashFail(splash, e && e.npStage === "three"
        ? "Shift Racing could not load its 3D engine (" + THREE_URL + ")."
        : "Shift Racing needs WebGL for its 3D tracks, and this browser has it switched off or does not support it.");
    });
})();
