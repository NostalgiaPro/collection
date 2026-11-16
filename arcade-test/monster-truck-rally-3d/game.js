/* MONSTER TRUCK RALLY (3D): eight courses of dirt, ramps and junk cars. Crush them, catch air, stick the landing.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of scaling and the title / pause / game over flow, and carries the HUD and the
   on-screen pedals.

   The driving is side-on, the way the old browser truck games played: the truck lives in a
   2D plane (x along the course, y up) and is a real little physics model, a chassis with
   two sprung axles and fat tires on a dirt profile. The picture around it is full 3D.
   Units are meters and seconds. In three.js space a course point (x, y) sits at (x, y, 0);
   the dirt runs from z = -TRACK_W to +TRACK_W and the camera rides out on the +z side. */

const W = 360, H = 540, TAU = Math.PI * 2;

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash, title card and score card
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every sign, decal and board in the stadium
const THREE_URL = "../shared/three.module.min.js";
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, k) { return a + (b - a) * k; }

/* ---------------- The three trucks (all original) ----------------
   engine: drive force (m/s^2 at a standstill), vmax: top speed, grip: tire friction,
   lean: how hard the driver can rock it in the air (rad/s^2), ks / cs: suspension spring and damper,
   crush: how fast it flattens a car. bars are the 1-5 ratings shown on the title card. */
const TRUCKS = [
  { id: "latefee", name: "LATE FEE", tag: "All-rounder. Returns nothing on time.",
    engine: 21, vmax: 23, grip: 1.05, lean: 9.2, ks: 56, cs: 4.2, crush: 1.0,
    body: "#e8321e", body2: "#ff9a1f", trim: "#1b1d26", rim: "#e9edf5", glass: 0x3a6fb8, suit: "#ff6a1a", helmet: "#ffd21f",
    bars: [3, 3, 3] },
  { id: "turbo", name: "TURBO BUTTON", tag: "Fastest truck here. Hold on.",
    engine: 24.5, vmax: 26.5, grip: 0.92, lean: 8.4, ks: 50, cs: 3.8, crush: 0.85,
    body: "#1f6fff", body2: "#2fe6ff", trim: "#0b1440", rim: "#ffd21f", glass: 0x2a4a90, suit: "#2fe6ff", helmet: "#ffffff",
    bars: [5, 2, 3] },
  { id: "mint", name: "MINT IN BOX", tag: "Heavy, grippy, flattens cars fast.",
    engine: 19.5, vmax: 21.5, grip: 1.2, lean: 10.2, ks: 62, cs: 4.8, crush: 1.45,
    body: "#7a3ff2", body2: "#5dffb0", trim: "#20103f", rim: "#b6ff4a", glass: 0x3a2a7a, suit: "#5dffb0", helmet: "#7a3ff2",
    bars: [2, 5, 4] }
];

/* ---------------- Courses ----------------
   A course is a strip of dirt sampled every DX meters, built from a short list of pieces. Every piece
   starts where the last one ended. b is the running base height (steps and platforms move it). */
const DX = 0.25, X0 = -14;                               // first sample sits at x = X0 (behind the start wall)
const TRACK_W = 5.2;                                      // half width of the dirt strip
const CAR_GAP = 0.3;

// Car side profiles, [u, height] pairs in meters from the car's back bumper (the truck meets the back first).
const CAR_KINDS = {
  sedan:   { len: 4.6, pts: [[0, 0], [0.18, 0.62], [0.35, 0.84], [0.95, 0.9], [1.45, 1.36], [2.9, 1.4], [3.45, 0.98], [4.3, 0.86], [4.45, 0.6], [4.6, 0]] },
  compact: { len: 3.9, pts: [[0, 0], [0.18, 0.6], [0.35, 0.82], [0.7, 0.88], [1.15, 1.34], [2.45, 1.36], [2.95, 0.95], [3.65, 0.84], [3.78, 0.58], [3.9, 0]] },
  wagon:   { len: 4.9, pts: [[0, 0], [0.18, 0.62], [0.3, 0.86], [0.4, 1.4], [3.35, 1.42], [3.85, 0.98], [4.6, 0.88], [4.75, 0.6], [4.9, 0]] },
  van:     { len: 5.1, pts: [[0, 0], [0.18, 0.7], [0.3, 1.0], [0.36, 1.86], [4.0, 1.9], [4.55, 1.12], [4.95, 0.98], [5.1, 0]] }
};
const CAR_ROW = ["sedan", "compact", "wagon", "sedan", "van", "compact", "sedan", "wagon"];
const CAR_COLS = ["#d8402e", "#2f6fd8", "#e8c33a", "#3aa35a", "#8a8f9c", "#c8662a", "#6a4fd0", "#e0e0dc", "#1f8f9a", "#a83a6a"];

const LEVELS = [
  { name: "Junkyard Warm-Up", time: 28, spec: [
    ["flat", 24], ["hill", 16, 1.6], ["flat", 10], ["cars", 2], ["flat", 14], ["kick", 9, 2.0], ["flat", 7], ["land", 11, 1.9],
    ["flat", 10], ["hill", 20, 2.4], ["flat", 12], ["cars", 3], ["flat", 14] ] },
  { name: "Crush Hour", time: 32, spec: [
    ["flat", 22], ["cars", 3], ["flat", 12], ["kick", 11, 2.6], ["cars", 3], ["land", 12, 2.3], ["flat", 12],
    ["bumps", 3, 12, 1.2], ["flat", 10], ["cars", 4], ["flat", 14] ] },
  { name: "Washboard Alley", time: 44, spec: [
    ["flat", 20], ["bumps", 8, 7, 0.9], ["flat", 12], ["kick", 10, 2.4], ["flat", 8], ["land", 12, 2.4], ["flat", 10], ["cars", 2],
    ["flat", 6], ["bumps", 5, 9, 1.4], ["flat", 12], ["hill", 26, 4], ["flat", 14], ["cars", 3], ["flat", 14] ] },
  { name: "Tabletop Tango", time: 30, spec: [
    ["flat", 20], ["ramp", 12, 3.2], ["flat", 5], ["cars", 2], ["flat", 5], ["ramp", 12, -3.2], ["flat", 12],
    ["kick", 11, 3.0], ["flat", 10], ["land", 12, 3.0], ["flat", 10], ["ramp", 10, 2.6], ["flat", 16], ["ramp", 1.2, -2.6],
    ["flat", 10], ["cars", 3], ["flat", 14] ] },
  { name: "Long Jump Lot", time: 34, spec: [
    ["flat", 26], ["kick", 14, 3.6], ["cars", 3], ["land", 14, 3.0], ["flat", 16], ["hill", 24, 3], ["flat", 10],
    ["kick", 12, 3.2], ["cars", 3], ["land", 12, 2.6], ["flat", 12], ["cars", 3], ["flat", 14] ] },
  { name: "Step Ladder", time: 32, spec: [
    ["flat", 20], ["ramp", 8, 2], ["flat", 10], ["ramp", 8, 2], ["flat", 12], ["ramp", 1.4, -4], ["flat", 8], ["cars", 3], ["flat", 12],
    ["ramp", 10, 3], ["flat", 6], ["cars", 2], ["flat", 8], ["ramp", 1.2, -3], ["flat", 12], ["kick", 12, 3], ["flat", 11], ["land", 12, 3],
    ["flat", 14] ] },
  { name: "Junk Pile Gauntlet", time: 50, spec: [
    ["flat", 18], ["cars", 4], ["flat", 4], ["hill", 18, 2], ["cars", 5], ["flat", 10], ["kick", 12, 3], ["cars", 3], ["land", 12, 3],
    ["flat", 8], ["bumps", 4, 9, 1.3], ["cars", 6], ["flat", 12], ["hill", 24, 3.5], ["flat", 10], ["cars", 4], ["flat", 14] ] },
  { name: "Grand Finale", time: 48, spec: [
    ["flat", 28], ["kick", 14, 5.0], ["cars", 4], ["land", 16, 4.2], ["flat", 14], ["hill", 28, 4.5], ["flat", 10], ["kick", 10, 3],
    ["flat", 8], ["land", 10, 3], ["flat", 10], ["ramp", 12, 4], ["cars", 3], ["ramp", 1.2, -4], ["flat", 10], ["kick", 14, 5.2],
    ["cars", 5], ["land", 16, 4.2], ["flat", 16], ["cars", 2], ["flat", 14] ] }
];
const FINISH_RUN = 46;                                    // flat dirt past the finish line, then the end wall

let COURSE = null;                                        // the course being driven: samples, cars, landmarks

function buildCourse(li) {
  const lv = LEVELS[li], hs = [], marks = [], cars = [];
  let b = 0;
  const xAt = function () { return X0 + hs.length * DX; };
  function put(len, f) {                                   // f(u) -> height over u in [0, len)
    const n = Math.max(1, Math.round(len / DX));
    for (let i = 0; i < n; i++) hs.push(f(i * len / n, len));
  }
  // the wall behind the start
  put(4, function (u) { return 9 - 9 * Math.pow(u / 4, 0.5) + 0.0001; });
  put(-X0 - 4, function () { return 0; });
  const rnd = rng(li * 97 + 13);
  let carN = 0;
  lv.spec.forEach(function (p) {
    const k = p[0], x0 = xAt();
    if (k === "flat") put(p[1], function () { return b; });
    else if (k === "hill") { const hh = p[2]; put(p[1], function (u, L) { return b + hh * (1 - Math.cos(TAU * u / L)) / 2; }); }
    else if (k === "bumps") { const n = p[1], L1 = p[2], hh = p[3]; for (let j = 0; j < n; j++) put(L1, function (u, L) { return b + hh * (1 - Math.cos(TAU * u / L)) / 2; }); }
    else if (k === "kick") {                                // curved run-up to a lip, then a steep face back down
      const hh = p[2];
      put(p[1], function (u, L) { return b + hh * Math.pow(u / L, 1.6); });
      put(1.0, function (u, L) { return b + hh * (1 - u / L) * (1 - u / L) * 0.85 + (u === 0 ? hh * 0.15 : 0); });
      marks.push({ kind: "kick", x: x0, len: p[1], h: hh, b: b });
    } else if (k === "land") {                              // steep back face, long smooth run-out
      const hh = p[2];
      put(Math.max(2.2, hh * 1.3), function (u, L) { const e = u / L; return b + hh * (e * 0.85 + 0.15 * e * e); });   // steep, but a truck can climb it
      put(p[1], function (u, L) { return b + hh * Math.pow(1 - u / L, 1.15); });
      marks.push({ kind: "land", x: x0, len: p[1], h: hh, b: b });
    } else if (k === "ramp") {                              // a straight change of base height (a cliff when short)
      const b0 = b, dh = p[2], L = p[1];
      put(L, function (u) { const e = u / L; return b0 + dh * (L > 3 ? e * e * (3 - 2 * e) : e); });
      b = b0 + dh;
      if (Math.abs(b) < 1e-6) b = 0;
    } else if (k === "cars") {
      put(1.2, function () { return b; });
      for (let j = 0; j < p[1]; j++) {
        const kind = CAR_ROW[(carN + li) % CAR_ROW.length], ck = CAR_KINDS[kind];
        cars.push({ i: cars.length, kind: kind, x0: xAt(), len: ck.len, b: b, dmg: 0, crushed: false,
                    col: CAR_COLS[(carN * 3 + li * 7) % CAR_COLS.length], seed: Math.floor(rnd() * 1e6), tilt: (rnd() - 0.5) * 0.03 });
        put(ck.len, function () { return b; });
        put(CAR_GAP, function () { return b; });
        carN++;
      }
      put(1.0, function () { return b; });
    }
  });
  const finishX = xAt() + 6;
  put(FINISH_RUN, function () { return b; });
  put(5, function (u) { return b + 10 * Math.pow(u / 5, 2); });
  const n = hs.length, terr = Float32Array.from(hs), surf = Float32Array.from(hs), carAt = new Int16Array(n).fill(-1);
  const C = { li: li, terr: terr, surf: surf, carAt: carAt, n: n, cars: cars, marks: marks, finishX: finishX, endX: X0 + (n - 1) * DX, total: cars.length };
  cars.forEach(function (c) { carSurface(C, c); });
  return C;
}

// The profile of a car at u meters from its back bumper, with damage flattening the roof first.
function carHeight(c, u) {
  const pts = CAR_KINDS[c.kind].pts;
  if (u <= 0 || u >= c.len) return 0;
  let y = 0;
  for (let i = 1; i < pts.length; i++) {
    if (u <= pts[i][0]) { const a = pts[i - 1], q = pts[i], k = (u - a[0]) / (q[0] - a[0]); y = a[1] + (q[1] - a[1]) * k; break; }
  }
  const e = crushAmt(c);
  const belt = 0.9;
  if (y > belt) y = belt + (y - belt) * (1 - e * 0.92);
  return y * (1 - e * 0.42);
}
function crushAmt(c) { const d = Math.min(1, c.dmg); return 1 - (1 - d) * (1 - d); }
// Write a car's current shape into the course surface the tires ride on.
function carSurface(C, c) {
  const i0 = Math.max(0, Math.floor((c.x0 - X0) / DX)), i1 = Math.min(C.n - 1, Math.ceil((c.x0 + c.len - X0) / DX));
  for (let i = i0; i <= i1; i++) {
    const u = X0 + i * DX - c.x0;
    if (u <= 0 || u >= c.len) continue;
    C.surf[i] = Math.max(C.terr[i], c.b + carHeight(c, u));
    C.carAt[i] = c.i;
  }
}
function sAt(i) { return COURSE.surf[clamp(i, 0, COURSE.n - 1)]; }
function surfX(x) {
  const f = (x - X0) / DX, i = Math.floor(f), k = f - i;
  return sAt(i) + (sAt(i + 1) - sAt(i)) * k;
}
function terrX(x) {
  const f = clamp((x - X0) / DX, 0, COURSE.n - 1.001), i = Math.floor(f), k = f - i;
  return COURSE.terr[i] + (COURSE.terr[i + 1] - COURSE.terr[i]) * k;
}
function slopeX(x) { return (surfX(x + 0.3) - surfX(x - 0.3)) / 0.6; }
function carIndexAt(x) { const i = Math.round((x - X0) / DX); return i >= 0 && i < COURSE.n ? COURSE.carAt[i] : -1; }

function rng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- The truck ----------------
   A chassis (mass 1, its center of mass at its origin) and two wheels, each a light disc riding on a
   spring and damper along the chassis' own "down" line and held rigidly across it. Contacts and the
   joints are solved with small impulses a few times per sub-step, so landings bounce instead of snapping. */
const GRAV = 15.5;
const WR = 0.86;                                         // tire radius
const WB = 1.72;                                         // half the wheelbase
const ANC_Y = -0.3;                                      // the axle mounts, below the center of mass
const L0 = 0.82, SMIN = 0.3, SMAX = 1.0;                 // spring free length and the bump / droop stops
const MW = 0.1, INERTIA = 2.5;
const BETA = 0.22, SLOP = 0.008, SUB_DT = 1 / 480, ITERS = 6;
// The body's outline for scraping the ground: [x, y, roof?]
const HULL = [[2.6, -0.15, 0], [-2.6, -0.15, 0], [2.55, 0.75, 0], [-2.55, 0.75, 0], [1.05, 1.62, 1], [-0.85, 1.62, 1],
              [0, -0.62, 0], [1.25, -0.5, 0], [-1.25, -0.5, 0], [2.6, 0.3, 0], [-2.6, 0.3, 0]];
const REST_S = 0.64;                                     // how long the springs sit with the truck parked

function makeTruck(x) {
  const T = { x: x, y: 0, a: 0, vx: 0, vy: 0, w: 0,
    wh: [{ x: 0, y: 0, vx: 0, vy: 0, c: false, jn: 0, jnLast: 0, nx: 0, ny: 1, pen: 0, car: -1, spin: 0, om: 0, s: REST_S, hit: 0 },
         { x: 0, y: 0, vx: 0, vy: 0, c: false, jn: 0, jnLast: 0, nx: 0, ny: 1, pen: 0, car: -1, spin: 0, om: 0, s: REST_S, hit: 0 }],
    hull: false, roof: false, hullCar: -1, slam: 0, grounded: 0 };
  placeTruck(T, x, 0.25);
  return T;
}
// Set the truck down at x, square to the slope, a little above the dirt.
function placeTruck(T, x, lift) {
  const sl = Math.atan((terrX(x + WB) - terrX(x - WB)) / (WB * 2));
  const gy = Math.max(terrX(x + WB), terrX(x - WB), terrX(x));
  T.x = x; T.a = sl; T.vx = T.vy = T.w = 0;
  const c = Math.cos(sl), s = Math.sin(sl);
  T.y = gy + (WR + REST_S - ANC_Y) / Math.max(0.6, c) + (lift || 0);
  for (let k = 0; k < 2; k++) {
    const lx = k ? -WB : WB, ly = ANC_Y - REST_S, wh = T.wh[k];
    wh.x = T.x + c * lx - s * ly; wh.y = T.y + s * lx + c * ly; wh.vx = wh.vy = 0; wh.c = false; wh.jn = wh.jnLast = 0; wh.s = REST_S;
  }
}

// Closest point of the course surface to a disc. Fills out: pen, nx, ny, x (contact). Returns false if clear.
function discContact(px, py, r, out) {
  const i0 = Math.floor((px - r - X0) / DX) - 1, i1 = Math.ceil((px + r - X0) / DX) + 1;
  let best = 1e9, bx = 0, by = 0;
  let ax = X0 + i0 * DX, ay = sAt(i0);
  for (let i = i0 + 1; i <= i1; i++) {
    const qx = X0 + i * DX, qy = sAt(i), ex = qx - ax, ey = qy - ay, l2 = ex * ex + ey * ey;
    let u = ((px - ax) * ex + (py - ay) * ey) / l2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const cx = ax + ex * u, cy = ay + ey * u, d2 = (px - cx) * (px - cx) + (py - cy) * (py - cy);
    if (d2 < best) { best = d2; bx = cx; by = cy; }
    ax = qx; ay = qy;
  }
  const hc = surfX(px);
  if (py < hc) {                                          // center under the surface: push straight out of it
    const sl = slopeX(px), l = Math.hypot(sl, 1);
    out.nx = -sl / l; out.ny = 1 / l; out.pen = r + (hc - py) / l; out.x = px;
    return true;
  }
  const d = Math.sqrt(best);
  if (d >= r) return false;
  out.nx = (px - bx) / (d || 1e-6); out.ny = (py - by) / (d || 1e-6); out.pen = r - d; out.x = bx;
  if (d < 1e-6) { out.nx = 0; out.ny = 1; }
  return true;
}

const PH = { anc: [[0, 0, 0, 0], [0, 0, 0, 0]], ct: { pen: 0, nx: 0, ny: 1, x: 0 }, hc: [] };
for (let i = 0; i < HULL.length; i++) PH.hc.push({ on: false, rx: 0, ry: 0, nx: 0, ny: 1, pen: 0, acc: 0, tacc: 0, x: 0 });

// One sub-step. inp: { gas: 0..1, brake: 0..1, lean: -1..1 (+ = nose up) }. Returns the biggest tire hit this step.
function physStep(T, TS, dt, inp) {
  const c = Math.cos(T.a), s = Math.sin(T.a);
  const dX = s, dY = -c;                                  // chassis "down"
  const fX = c, fY = s;                                   // chassis "forward"
  const air = !T.wh[0].c && !T.wh[1].c;
  let hit = 0, k, it;

  T.vy -= GRAV * dt;
  T.w += inp.lean * TS.lean * (air ? 1 : 0.25) * dt;
  // in the air the spinning tires twist the truck: gas lifts the nose, the brake drops it
  if (air) { T.w += (inp.gas * 3.0 - inp.brake * 3.4) * dt; T.w *= 1 - 0.08 * dt; }
  T.w = clamp(T.w, -7, 7);

  for (k = 0; k < 2; k++) {
    const wh = T.wh[k], lx = k ? -WB : WB, A = PH.anc[k];
    wh.vy -= GRAV * dt;
    A[0] = T.x + c * lx - s * ANC_Y; A[1] = T.y + s * lx + c * ANC_Y; A[2] = A[0] - T.x; A[3] = A[1] - T.y;
    // spring and damper along the shock
    const sp = (wh.x - A[0]) * dX + (wh.y - A[1]) * dY;
    const vAx = T.vx - T.w * A[3], vAy = T.vy + T.w * A[2];
    const vr = (wh.vx - vAx) * dX + (wh.vy - vAy) * dY;
    const imp = (TS.ks * (L0 - sp) - TS.cs * vr) * dt;
    wh.vx += imp * dX / MW; wh.vy += imp * dY / MW;
    applyAt(T, A[2], A[3], -imp * dX, -imp * dY);
    wh.s = sp;
    // the dirt
    wh.jnLast = wh.jn; wh.jn = 0; wh.acc = 0; wh.tacc = 0;
    wh.c = discContact(wh.x, wh.y, WR, PH.ct);
    if (wh.c) {
      wh.nx = PH.ct.nx; wh.ny = PH.ct.ny; wh.pen = PH.ct.pen; wh.car = carIndexAt(PH.ct.x);
      if (wh.car >= 0 && PH.ct.ny > 0.2 && surfX(PH.ct.x) < terrX(PH.ct.x) + 0.06) wh.car = -1;
      const vn = wh.vx * wh.nx + wh.vy * wh.ny;
      wh.bounce = vn < -2.2 ? -0.22 * vn : 0;           // bouncy rubber on a hard hit
      // drive, brake or roll, limited by how hard the tire is pressed into the dirt
      const tx = wh.ny, ty = -wh.nx, vt = wh.vx * tx + wh.vy * ty, lim = TS.grip * Math.max(wh.jnLast, 0.35 * GRAV * dt * 0.55);
      let jt = 0;
      if (inp.hold) jt = clamp(-vt * 0.55, -lim, lim);
      else if (inp.gas > 0) jt = Math.min(TS.engine * inp.gas * Math.max(0, 1 - Math.max(0, vt) / TS.vmax) * dt * 0.55, lim);
      else if (inp.brake > 0) {
        if (vt > 0.6) jt = -Math.min(26 * dt * 0.55, lim, vt * 0.55);
        else jt = -Math.min(TS.engine * 0.55 * inp.brake * Math.max(0, 1 + vt / (TS.vmax * 0.32)) * dt * 0.55, lim);
      } else jt = -Math.sign(vt) * Math.min(Math.abs(vt) * 0.55, 0.9 * dt * 0.55, lim);
      wh.vx += jt * tx / MW; wh.vy += jt * ty / MW;
    } else { wh.car = -1; wh.bounce = 0; }
  }

  // body against the ground
  T.hull = false; T.roof = false; T.hullCar = -1;
  for (let h = 0; h < HULL.length; h++) {
    const hp = PH.hc[h], lx = HULL[h][0], ly = HULL[h][1];
    const px = T.x + c * lx - s * ly, py = T.y + s * lx + c * ly;
    const g = surfX(px);
    hp.on = py < g;
    if (!hp.on) continue;
    const sl = slopeX(px), l = Math.hypot(sl, 1);
    hp.nx = -sl / l; hp.ny = 1 / l; hp.pen = (g - py) / l; hp.rx = px - T.x; hp.ry = py - T.y; hp.acc = 0; hp.tacc = 0; hp.x = px;
    T.hull = true;
    if (HULL[h][2]) T.roof = true;
    const ci = carIndexAt(px);
    if (ci >= 0) T.hullCar = ci;
  }

  for (it = 0; it < ITERS; it++) {
    for (k = 0; k < 2; k++) {
      const wh = T.wh[k], A = PH.anc[k];
      const vAx = T.vx - T.w * A[3], vAy = T.vy + T.w * A[2];
      // held rigidly across the shock
      let rc = A[2] * fY - A[3] * fX;
      let em = 1 / (1 / MW + 1 + rc * rc / INERTIA);
      const ex = (wh.x - A[0]) * fX + (wh.y - A[1]) * fY;
      let vrel = (wh.vx - vAx) * fX + (wh.vy - vAy) * fY;
      let j = -(vrel + BETA * ex / dt) * em;
      wh.vx += j * fX / MW; wh.vy += j * fY / MW; applyAt(T, A[2], A[3], -j * fX, -j * fY);
      // bump stop and droop stop
      const sp = (wh.x - A[0]) * dX + (wh.y - A[1]) * dY;
      if (sp < SMIN || sp > SMAX) {
        const vAx2 = T.vx - T.w * A[3], vAy2 = T.vy + T.w * A[2];
        const vr = (wh.vx - vAx2) * dX + (wh.vy - vAy2) * dY;
        rc = A[2] * dY - A[3] * dX;
        em = 1 / (1 / MW + 1 + rc * rc / INERTIA);
        if (sp < SMIN && vr < 0) {
          if (it === 0 && vr < -3) hit = Math.max(hit, -vr);
          j = -(vr * (it === 0 && vr < -3 ? 1.28 : 1) - BETA * (SMIN - sp) / dt * 0.5) * em;
          j = Math.max(0, j);
          wh.vx += j * dX / MW; wh.vy += j * dY / MW; applyAt(T, A[2], A[3], -j * dX, -j * dY);
        } else if (sp > SMAX && vr > 0) {
          j = -vr * em;
          wh.vx += j * dX / MW; wh.vy += j * dY / MW; applyAt(T, A[2], A[3], -j * dX, -j * dY);
        }
      }
      // tire on the dirt
      if (wh.c) {
        const vn = wh.vx * wh.nx + wh.vy * wh.ny;
        const target = Math.max(BETA * Math.max(0, wh.pen - SLOP) / dt, wh.bounce);
        let jn = (target - vn) * MW;
        const old = wh.acc;
        wh.acc = Math.max(0, old + jn);
        jn = wh.acc - old;
        wh.vx += jn * wh.nx / MW; wh.vy += jn * wh.ny / MW;
        if (it === 0 && vn < -4) hit = Math.max(hit, -vn);
      }
    }
    // the body scraping along
    for (let h = 0; h < HULL.length; h++) {
      const hp = PH.hc[h];
      if (!hp.on) continue;
      const vpx = T.vx - T.w * hp.ry, vpy = T.vy + T.w * hp.rx;
      const vn = vpx * hp.nx + vpy * hp.ny;
      let rc = hp.rx * hp.ny - hp.ry * hp.nx;
      const em = 1 / (1 + rc * rc / INERTIA);
      const target = Math.max(BETA * Math.max(0, hp.pen - SLOP) / dt, vn < -3 ? -0.12 * vn : 0);
      let jn = (target - vn) * em;
      const old = hp.acc;
      hp.acc = Math.max(0, old + jn);
      jn = hp.acc - old;
      applyAt(T, hp.rx, hp.ry, jn * hp.nx, jn * hp.ny);
      if (it === 0 && vn < -4) T.slam = Math.max(T.slam, -vn);
      // friction
      const tx = hp.ny, ty = -hp.nx, vt = vpx * tx + vpy * ty;
      rc = hp.rx * ty - hp.ry * tx;
      const emt = 1 / (1 + rc * rc / INERTIA);
      let jt = -vt * emt;
      const oldt = hp.tacc;
      hp.tacc = clamp(oldt + jt, -0.75 * hp.acc, 0.75 * hp.acc);
      jt = hp.tacc - oldt;
      applyAt(T, hp.rx, hp.ry, jt * tx, jt * ty);
    }
  }

  T.x += T.vx * dt; T.y += T.vy * dt; T.a += T.w * dt;
  for (k = 0; k < 2; k++) {
    const wh = T.wh[k];
    wh.x += wh.vx * dt; wh.y += wh.vy * dt;
    wh.jn = wh.acc || 0;
    // how fast the tire turns: rolling with the ground, or spun up by the throttle in the air
    if (wh.c) { const vt = wh.vx * wh.ny - wh.vy * wh.nx; wh.om = vt / WR + (inp.gas > 0 && Math.abs(vt) < 3 ? inp.gas * 6 : 0); }
    else wh.om += ((inp.gas > 0 ? TS.vmax / WR * inp.gas : inp.brake > 0 ? 0 : wh.om * 0.6) - wh.om) * Math.min(1, dt * 2.5);
    wh.spin -= wh.om * dt;
  }
  return hit;
}
function applyAt(T, rx, ry, jx, jy) {
  T.vx += jx; T.vy += jy;
  T.w += (rx * jy - ry * jx) / INERTIA;
}

/* ---------------- Game state ---------------- */
let S = {}, keys = {}, idleT = 0, parts = [], floats = [];
let pick = 0;                                             // which truck is chosen (saved between visits)
const touch = { ptrs: {}, gas: 0, brake: 0, back: 0, fwd: 0, seen: false };
let THREE = null, R = null;
const V = { snap: true, flagWave: 0, dust: 0, sparkT: 0 };   // presentation only

const CRUSH_K = 0.42;                                     // damage per unit of tire load on a car
const FLIP_PENALTY = 5;
const PTS = { crush: 100, combo: 50, airPerSec: 120, clean: 150, flip: 750, finish: 500, timeSec: 20 };

function TS() { return TRUCKS[pick]; }

function reset() {
  S = { t: 0, level: 0, score: 0, phase: "intro", pt: 0, time: 0, truck: null,
        crushed: 0, crushedTotal: 0, bestAir: 0, cleans: 0, cleanRow: 0, bestCleanRow: 0, flips: 0, tricks: 0, rolled: 0, cleared: 0,
        air: 0, airRot: 0, lastA: 0, land: null, combo: 0, comboT: 0, flipT: 0, safeX: 6, beeps: -1,
        tally: null, levelStart: 0, rpm: 0, gasNow: 0, lastHit: 0, finishT: 0 };
  parts.length = 0; floats.length = 0;
  ledClear();
  loadLevel(0);
}
function loadLevel(li) {
  COURSE = buildCourse(li);
  S.level = li; S.phase = "intro"; S.pt = 0; S.time = LEVELS[li].time; S.crushed = 0; S.beeps = -1;
  S.truck = makeTruck(6); S.safeX = 6; S.air = 0; S.airRot = 0; S.land = null; S.combo = 0; S.flipT = 0; S.tally = null;
  S.levelStart = S.score;
  V.snap = true;
  if (R) buildLevelMeshes(li);
  ledPlay([ledMsg("slide", "LEVEL " + (li + 1), 1.4, { color: "cyan" }), ledMsg("cycle", LEVELS[li].name.toUpperCase(), 1.6)]);
}

function input() {
  if (BOT && S.phase === "race") return BOT(S);
  if (S.phase !== "race") return { gas: 0, brake: 0, hold: S.phase === "intro" || S.phase === "finish" ? 1 : 0, lean: 0 };
  const gas = keys.ArrowUp || keys.KeyW || keys.Space || touch.gas ? 1 : 0;
  const brake = keys.ArrowDown || keys.KeyS || touch.brake ? 1 : 0;
  const lean = (keys.ArrowLeft || keys.KeyA || touch.back ? 1 : 0) - (keys.ArrowRight || keys.KeyD || touch.fwd ? 1 : 0);
  return { gas: gas, brake: gas ? 0 : brake, lean: lean };
}

function award(label, pts, col) {
  S.score += pts;
  floats.push({ txt: label + (pts ? "  +" + pts : ""), col: col || "#ffe45c", t: 0 });
  if (floats.length > 4) floats.shift();
}

function update(dt) {
  if (FREEZE && !STEPPING) return;
  S.t += dt; S.pt += dt;
  updateParts(dt);
  for (let i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; if (floats[i].t > 1.6) floats.splice(i, 1); }
  const T = S.truck, TSel = TS(), inp = input();
  S.gasNow = inp.gas;

  // physics, in fixed little steps
  const n = dt > 0 ? Math.ceil(dt / SUB_DT) : 0, h = n ? dt / n : 0;
  let hit = 0, contact0 = false, contact1 = false, roof = false, hull = false;
  T.slam = 0;
  for (let i = 0; i < n; i++) {
    hit = Math.max(hit, physStep(T, TSel, h, inp));
    if (T.wh[0].c) contact0 = true;
    if (T.wh[1].c) contact1 = true;
    if (T.roof) roof = true;
    if (T.hull) hull = true;
    crushStep(T, TSel);
  }
  if (!(isFinite(T.x) && isFinite(T.y) && isFinite(T.a))) { placeTruck(T, Math.max(4, S.safeX - 1.5), 0.6); S.lastA = T.a; }   // never lose the truck to a bad step
  S.rpm += ((inp.gas ? 0.45 + 0.55 * clamp(Math.abs(T.vx) / TSel.vmax, 0, 1) + (contact0 || contact1 ? 0 : 0.35) : 0.12 + 0.3 * clamp(Math.abs(T.vx) / TSel.vmax, 0, 1)) - S.rpm) * Math.min(1, dt * 5);
  if (hit > 6 && S.t - S.lastHit > 0.15) { S.lastHit = S.t; Sound.sfx("thud", clamp((hit - 6) / 10, 0, 1)); dustAt(T.x, terrX(T.x), Math.min(18, hit * 1.2)); if (hit > 11) camShake(0.35, 0.25); }
  if (T.slam > 6 && S.t - S.lastHit > 0.15) { S.lastHit = S.t; Sound.sfx("scrape"); }
  if ((contact0 || contact1) && Math.abs(T.vx) > 4 && !Shell.reduced) { V.dust -= dt; if (V.dust <= 0) { V.dust = 0.08; const wk = contact1 ? 1 : 0; dustAt(T.wh[wk].x - 0.4, T.wh[wk].y - WR + 0.1, 2, true); } }

  if (S.phase === "intro") {
    const k = Math.floor(S.pt / 0.75) - 1;                 // 3, 2, 1, GO on the beat
    if (k > S.beeps && k >= 0) {
      S.beeps = k;
      if (k < 3) { Sound.sfx("beep"); ledPlay([ledMsg("flash", String(3 - k), 0.75, { quick: true })]); }
      else { Sound.sfx("go"); ledPlay([ledMsg("flash", "GO!", 1.1)]); S.phase = "race"; S.pt = 0; Shell.flash("GO!", LEVELS[S.level].name, "#9bff3f", 700); }
    }
    return;
  }
  if (S.phase === "race" || S.phase === "flipped") {
    S.time -= dt;
    if (S.time <= 0) { S.time = 0; timeUp(); return; }
  }
  if (S.comboT > 0) { S.comboT -= dt; if (S.comboT <= 0) S.combo = 0; }

  const grounded = contact0 || contact1;
  if (S.phase === "race") {
    trackAir(T, grounded, contact0 && contact1, roof || hull, dt);
    // somewhere safe to put the truck back if it rolls
    if (contact0 && contact1 && !hull && Math.cos(T.a - Math.atan(slopeX(T.x))) > 0.94 && T.wh[0].car < 0 && T.wh[1].car < 0 && carIndexAt(T.x) < 0) S.safeX = T.x;
    // on its roof or its side and not getting off it
    const up = Math.cos(T.a);
    if ((up < -0.15 && (roof || hull)) || (up < 0.3 && hull && Math.hypot(T.vx, T.vy) < 1.5)) S.flipT += dt; else S.flipT = Math.max(0, S.flipT - dt * 2);
    if (S.flipT > 0.85) flipped();
    if (T.x >= COURSE.finishX) finishLevel();
  } else if (S.phase === "flipped") {
    if (S.pt > 1.1) respawn();
  } else if (S.phase === "finish") {
    S.tally.t += dt;
    if (S.tally.t > 1.0 && !S.tally.added) { S.tally.added = true; S.score += S.tally.bonus; Sound.sfx("cash"); }
    if (S.tally.t > (S.tally.skip ? 1.4 : 4.2)) nextLevel();
  } else if (S.phase === "timeup") {
    if (S.pt > 2.2) endRun("TIME'S UP");
  }
}

// Tires (and the body) pressing on a car flatten it.
function crushStep(T, TSel) {
  for (let k = 0; k < 2; k++) {
    const wh = T.wh[k];
    if (wh.c && wh.car >= 0) hurtCar(wh.car, wh.acc * CRUSH_K * TSel.crush);
  }
  if (T.hullCar >= 0) {
    let tot = 0;
    for (let h = 0; h < PH.hc.length; h++) if (PH.hc[h].on) tot += PH.hc[h].acc;
    hurtCar(T.hullCar, tot * CRUSH_K * 0.6);
  }
}
function hurtCar(ci, amt) {
  const car = COURSE.cars[ci];
  if (!car || amt <= 0) return;
  const before = car.dmg;
  car.dmg = Math.min(1.25, car.dmg + amt);
  if (Math.abs(car.dmg - before) > 1e-5) carSurface(COURSE, car);
  if (!car.crushed && car.dmg >= 0.62) {
    car.crushed = true;
    S.crushed++; S.crushedTotal++;
    S.combo = S.comboT > 0 ? S.combo + 1 : 1; S.comboT = 2.6;
    const pts = PTS.crush + PTS.combo * (S.combo - 1);
    award(S.combo > 1 ? "CRUSH x" + S.combo : "CRUSHED", pts, "#ff9a3c");
    ledPlay([ledMsg("flash", S.combo > 1 ? "CRUSH X" + S.combo + "!" : "CRUSH!", 1.3, { color: "orange" })]);
    Sound.sfx("crunch", S.combo); Sound.sfx("cheer", 0.5);
    if (window.NPRewards && S.combo >= 2) window.NPRewards.streak(S.combo, S.combo === 2 ? "" : "CRUSH x" + S.combo + "!");
    if (window.Trophies) { window.Trophies.unlock("mtr-crush"); if (S.crushed === COURSE.total && COURSE.total > 0) window.Trophies.unlock("mtr-wrecking"); }
    camShake(0.25, 0.2);
    V.sparkT = 0.25;
    carBurst(car);
  }
}

// Air time, flips and landings.
function trackAir(T, grounded, both, hull, dt) {
  let da = T.a - S.lastA;
  S.lastA = T.a;
  if (!grounded) {
    if (S.land) S.land = null;
    S.air += dt; S.airRot += da;
    return;
  }
  if (S.air > 0.45 && !S.land) S.land = { t: 0, air: S.air, rot: S.airRot, hull: false, both: false };
  S.air = 0; S.airRot = 0;
  const L = S.land;
  if (!L) return;
  L.t += dt;
  if (hull) L.hull = true;
  if (both) L.both = true;
  if (L.t < 0.32 && !(L.both && L.t > 0.12)) return;
  S.land = null;
  const up = Math.cos(T.a - Math.atan(slopeX(T.x)));
  if (up < 0.5) return;                                   // that one ends on its lid; the flip check takes it from here
  const airPts = Math.round(L.air * PTS.airPerSec / 10) * 10;
  S.bestAir = Math.max(S.bestAir, L.air);
  const turns = L.rot / TAU;
  const clean = L.both && !L.hull;
  let led = [];
  if (Math.abs(turns) >= 0.8) {
    S.tricks++;
    const nm = turns > 0 ? "BACKFLIP" : "FRONT FLIP", many = Math.round(Math.abs(turns));
    award(many > 1 ? "DOUBLE " + nm : nm, PTS.flip * Math.max(1, many), "#ff4fc0");
    led.push(ledMsg("flash", (many > 1 ? "DOUBLE " : "") + nm + "!", 1.5, { color: "pink" }));
    Sound.sfx("cheer", 1); Sound.sfx("horn");
    if (window.Trophies) window.Trophies.unlock("mtr-backflip");
    burstAt(W / 2, 170, 40);
  }
  if (L.air >= 0.7) award(L.air >= 1.3 ? "BIG AIR " + L.air.toFixed(1) + "s" : "AIR " + L.air.toFixed(1) + "s", airPts, "#3ff0ff");
  if (L.air >= 1.3) {
    led.push(ledMsg("cycle", "BIG AIR! " + L.air.toFixed(1) + " SEC", 1.6));
    Sound.sfx("cheer", 0.8);
    if (window.Trophies && L.air >= 1.8) window.Trophies.unlock("mtr-bigair");
  }
  if (clean) {
    S.cleans++; S.cleanRow++; S.bestCleanRow = Math.max(S.bestCleanRow, S.cleanRow);
    award("CLEAN LANDING", PTS.clean, "#9bff3f");
    led.push(ledMsg("slide", "CLEAN LANDING", 1.4, { color: "lime" }));
    if (L.air < 1.3 && Math.abs(turns) < 0.8) Sound.sfx("cheer", 0.35);
    if (window.Trophies && S.cleanRow >= 5) window.Trophies.unlock("mtr-clean5");
    if (window.NPRewards && S.cleanRow >= 3 && S.cleanRow % 3 === 0) window.NPRewards.streak(S.cleanRow, S.cleanRow + " CLEAN LANDINGS");
  } else if (L.air >= 0.7) { S.cleanRow = 0; floats.push({ txt: "ROUGH LANDING", col: "#ff8fb8", t: 0 }); }
  if (led.length) ledPlay(led);
}

function flipped() {
  S.flips++; S.cleanRow = 0;
  S.phase = "flipped"; S.pt = 0; S.flipT = 0; S.land = null; S.air = 0; S.airRot = 0;
  S.time = Math.max(0, S.time - FLIP_PENALTY);
  Shell.flash("FLIPPED!", "-" + FLIP_PENALTY + " seconds. Back on your wheels.", "#ff4b3e", 1100);
  ledPlay([ledMsg("blink", "FLIPPED! -" + FLIP_PENALTY + " SEC", 1.8, { color: "red" })]);
  Sound.sfx("ooh"); Shell.sfx("miss");
}
function respawn() {
  let x = Math.max(4, S.safeX - 1.5);
  for (let n = 0; n < 40 && (carIndexAt(x) >= 0 || carIndexAt(x + WB) >= 0 || carIndexAt(x - WB) >= 0); n++) x -= 1;
  placeTruck(S.truck, x, 0.6);
  S.lastA = S.truck.a;
  S.phase = "race"; S.pt = 0;
  Shell.sfx("boost");
}
function finishLevel() {
  const left = Math.max(0, S.time), last = S.level >= LEVELS.length - 1;
  const bonus = Math.round(left * PTS.timeSec) + PTS.finish;
  S.phase = "finish"; S.pt = 0; S.cleared++;
  S.tally = { t: 0, left: left, bonus: bonus, added: false, crushed: S.crushed, total: COURSE.total, pts: S.score - S.levelStart, last: last, skip: false };
  V.flagWave = 1;
  Shell.flash(last ? "CHAMPION!" : "FINISH!", left.toFixed(1) + " seconds to spare", "#ffd23f", 1400);
  ledPlay([ledMsg("flash", "FINISH!", 1.4), ledMsg("count", "SCORE", 2.4, { from: S.score, value: S.score + bonus, keep: true })]);
  Sound.sfx("horn"); Sound.sfx("cheer", 1); Shell.sfx("score");
  burstAt(W / 2, 200, 50);
  if (window.NPRewards && S.cleared >= 2) window.NPRewards.streak(S.cleared, S.cleared + " COURSES CLEARED");
}
function nextLevel() {
  if (!S.tally.added) S.score += S.tally.bonus;
  if (S.level >= LEVELS.length - 1) {
    if (window.Trophies) window.Trophies.unlock("mtr-champion");
    endRun("RALLY CHAMPION");
    return;
  }
  loadLevel(S.level + 1);
  Sound.sfx("whoosh");
}
function timeUp() {
  S.phase = "timeup"; S.pt = 0;
  Shell.flash("TIME'S UP", "The clock ran out on " + LEVELS[S.level].name + ".", "#ff4b3e", 1600);
  ledPlay([ledMsg("blink", "TIME'S UP", 2.2, { color: "red" })]);
  Sound.sfx("buzzer"); Sound.sfx("ooh");
}
function endRun(title) {
  S.phase = "over";
  ledFinal(S.score);
  Shell.gameOver(S.score, { title: title, html:
    row("Truck", TRUCKS[pick].name) +
    row("Courses cleared", S.cleared + " of " + LEVELS.length) +
    row("Cars crushed", S.crushedTotal) +
    row("Best air", S.bestAir ? S.bestAir.toFixed(1) + " sec" : "None") +
    row("Clean landings", S.cleans) +
    row("Flips landed", S.tricks) +
    row("Rolled over", S.flips),
    stats: { score: S.score, cleared: S.cleared, crushed: S.crushedTotal, bestAir: Math.round(S.bestAir * 10) / 10, cleans: S.cleans,
             bestCleanRow: S.bestCleanRow, tricks: S.tricks, flips: S.flips, truck: TRUCKS[pick].id, champion: S.cleared >= LEVELS.length } });
}
function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

/* ---------------- Input ---------------- */
// Keys: up / W / Space gas, down / S brake and reverse, left / A lean back, right / D lean forward.
function key(type, code, e) {
  if (type === "down") {
    keys[code] = true;
    if ((code === "Enter" || code === "NumpadEnter") && !e.repeat && S.phase === "finish" && S.tally && S.tally.t > 0.8) S.tally.skip = true;
  } else keys[code] = false;
}
// The shell routes one pointer at a time; the pedals need two thumbs, so the HUD canvas is watched directly (see bindTouch).
function pointer() { }

// On-screen controls, in HUD pixels.
const PADS = {
  back: { x: 46, y: 486, r: 32, label: "back" },
  fwd: { x: 118, y: 486, r: 32, label: "fwd" },
  brake: { x: 212, y: 446, w: 62, h: 84 },
  gas: { x: 282, y: 432, w: 70, h: 98 }
};
function padAt(x, y) {
  for (const k of ["back", "fwd"]) { const p = PADS[k]; if (Math.hypot(x - p.x, y - p.y) < p.r + 9) return k; }
  for (const k of ["brake", "gas"]) { const p = PADS[k]; if (x > p.x - 8 && x < p.x + p.w + 8 && y > p.y - 10 && y < p.y + p.h + 8) return k; }
  return null;
}
function touchSync() {
  touch.gas = touch.brake = touch.back = touch.fwd = 0;
  for (const id in touch.ptrs) { const k = touch.ptrs[id]; if (k) touch[k] = 1; }
}
function bindTouch(cv) {
  cv.style.touchAction = "none";
  function local(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / (r.width / W), y: (e.clientY - r.top) / (r.height / H) }; }
  cv.addEventListener("pointerdown", function (e) {
    if (Shell.state() !== "playing") return;
    const p = local(e);
    if (e.pointerType === "touch") touch.seen = true;
    if (S.phase === "finish" && S.tally && S.tally.t > 0.8) { S.tally.skip = true; return; }
    touch.ptrs[e.pointerId] = padAt(p.x, p.y);
    touchSync();
  });
  cv.addEventListener("pointermove", function (e) {
    if (!(e.pointerId in touch.ptrs)) return;
    const p = local(e);
    touch.ptrs[e.pointerId] = padAt(p.x, p.y);
    touchSync();
  });
  function end(e) { if (e.pointerId in touch.ptrs) { delete touch.ptrs[e.pointerId]; touchSync(); } }
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end); cv.addEventListener("lostpointercapture", end);
  window.addEventListener("blur", function () { touch.ptrs = {}; touchSync(); keys = {}; });
}

/* ---------------- Particles (drawn on the HUD, placed through the 3D camera) ---------------- */
const CONF_COLS = ["#ffd23f", "#3ff0ff", "#ff3fa4", "#9bff3f", "#ff9214", "#ffffff"];
// world particles: dust, glass, sparks
function dustAt(x, y, n, small) {
  if (Shell.reduced) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    parts.push({ w: true, x: x + (Math.random() - 0.5) * 1.4, y: y + 0.1, z: (Math.random() - 0.5) * 3.2, vx: (Math.random() - 0.5) * 3 - (small ? 2 : 0), vy: 1 + Math.random() * (small ? 1.5 : 3.5),
      vz: (Math.random() - 0.5) * 2, g: -2, life: small ? 0.5 : 0.8 + Math.random() * 0.4, life0: 1, kind: "dust", s: small ? 0.3 : 0.4 + Math.random() * 0.35 });
  }
}
function carBurst(car) {
  const cx = car.x0 + car.len / 2, cy = car.b + 1.1;
  const n = Shell.reduced ? 8 : 26;
  for (let i = 0; i < n; i++) {
    const glass = i % 2 === 0;
    parts.push({ w: true, x: cx + (Math.random() - 0.5) * car.len * 0.7, y: cy, z: (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 7, vy: 2 + Math.random() * 6,
      vz: (Math.random() - 0.3) * 5, g: 14, life: 0.7 + Math.random() * 0.5, kind: glass ? "glass" : "spark", s: 0.12 });
  }
  dustAt(cx, car.b + 0.2, 10);
}
function burstAt(x, y, n) {
  if (Shell.reduced) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 60 + Math.random() * 160;
    parts.push({ w: false, x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 1.1, c: CONF_COLS[i % CONF_COLS.length], rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14 });
  }
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.life -= dt;
    if (q.w) { q.vy -= q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; if (q.kind === "dust") { q.vx *= 1 - dt; q.s += dt * 0.7; } }
    else { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 200 * dt; q.rot += q.vr * dt; }
    if (q.life <= 0) parts.splice(i, 1);
  }
}

/* ---------------- Music ----------------
   An original sixteen-bar loop in E minor at 138 BPM: chugging saw bass, a square-wave lead with a little echo,
   a triangle arpeggio, and a rock kit. startMusic needs nothing but an audio context and somewhere to send the sound;
   it reads no game state. It returns a function that fades the band out and stops it. */
function startMusic(ctx, dest) {
  const BPM = 138, STEP = 60 / BPM / 4, STEPS = 256, AHEAD = 0.35;
  // one chord per half bar: bass note, then the arpeggio's three notes (MIDI)
  const CH = { Em: [40, 64, 67, 71], C: [36, 60, 64, 67], D: [38, 62, 66, 69], B: [35, 63, 66, 71], Am: [33, 60, 64, 69], G: [43, 62, 67, 71] };
  const PROG = ("Em Em Em Em C C D D Em Em Em Em C C B B " +
                "Am Am Am Am Em Em Em Em C C D D B B B B").split(" ");
  // the tune, a bar a line: step in the bar, note, length in steps
  const BARS = [
    "0E5-2 2G5-2 4A5-2 6B5-4 10A5-2 12G5-2 14E5-2",
    "0D5-2 2E5-6 8B4-4 12D5-4",
    "0C5-2 2E5-2 4G5-2 6C6-4 10B5-2 12G5-4",
    "0A5-4 4F#5-2 6D5-2 8A5-4 12F#5-4",
    "0E5-2 2G5-2 4B5-2 6E6-4 10D6-2 12B5-4",
    "0A5-2 2G5-2 4E5-4 8G5-2 10A5-2 12B5-4",
    "0C6-4 4B5-2 6A5-2 8G5-4 12E5-4",
    "0D#5-4 4F#5-4 8B5-8",
    "0A5-6 6C6-2 8B5-4 12A5-4",
    "0E5-4 4A5-4 8C6-4 12E6-4",
    "0B5-6 6G5-2 8E5-4 12G5-4",
    "0B5-4 4D6-4 8E6-8",
    "0C6-4 4B5-2 6C6-2 8E6-4 12C6-4",
    "0D6-4 4C6-2 6B5-2 8A5-4 12F#5-4",
    "0B5-2 2A5-2 4G5-2 6F#5-2 8D#5-4 12F#5-4",
    "0B5-4 4D#6-4 8F#6-4 12B5-4"
  ];
  const SEMI = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
  const LEAD = new Array(STEPS).fill(null);
  BARS.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G]#?)(\d)-(\d+)$/.exec(tok);
      if (m) LEAD[b * 16 + Number(m[1])] = [12 * (Number(m[3]) + 1) + SEMI[m[2]], Number(m[4])];
    });
  });
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.connect(dest);
  out.gain.setTargetAtTime(1, ctx.currentTime + 0.05, 0.08);
  function filt(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const lead = filt("lowpass", 3400, 0.6, out), bass = filt("lowpass", 650, 1.4, out), arp = filt("lowpass", 2600, 0.5, out);
  const send = ctx.createGain(), echo = ctx.createDelay(1), back = ctx.createGain(), damp = filt("lowpass", 2000, 0.7, out);
  send.gain.value = 0.26; echo.delayTime.value = STEP * 3; back.gain.value = 0.3;
  lead.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(damp);
  const len = Math.floor(ctx.sampleRate * 1.5), noise = ctx.createBuffer(1, len, ctx.sampleRate), nd = noise.getChannelData(0);
  let seed = 22695477;
  for (let i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; nd[i] = seed / 0x3fffffff - 1; }

  function note(to, type, f0, t, dur, vol, f1, hold) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.01, dur * (hold == null ? 0.6 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function hit(to, t, dur, vol, type, f0, q, f1) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(to);
    s.start(t, (t * 7.31) % 1.2); s.stop(t + dur + 0.05);
  }
  function play(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[i >> 3]], second = bar >= 8, n = LEAD[i];
    if (n) {
      const d = n[1] * STEP * 0.92;
      note(lead, "square", hz(n[0]), t, d, 0.15);
      note(lead, "sawtooth", hz(n[0]) * 1.004, t, d, 0.05);
    }
    if (!(s & 1)) {                                       // eighths: the chug, and a walking arpeggio an octave up
      const k = s >> 1;
      note(bass, "sawtooth", hz(ch[0] + (k === 3 || k === 7 ? 12 : 0)), t, STEP * 1.6, 0.34, 0, 0.5);
      note(bass, "square", hz(ch[0] - 12), t, STEP * 1.6, 0.12, 0, 0.5);
      note(arp, "triangle", hz(ch[1 + [0, 1, 2, 1][k & 3]] + (second ? 12 : 0)), t, STEP * 1.4, 0.07);
      hit(out, t, s === 14 ? 0.16 : 0.035, s % 4 === 2 ? 0.09 : 0.05, "highpass", 7600, 0.7);
    }
    // kick: one and three, with a push into bar's end on the second half
    if (s === 0 || s === 8 || (s === 10 && bar % 2 === 1) || (second && s === 6)) note(out, "sine", 140, t, 0.18, 0.7, 40, 0.06);
    // snare on two and four, a roll into every eighth bar
    const fill = (bar % 8 === 7) && s >= 12;
    if (s === 4 || s === 12 || fill) {
      const v = fill ? 0.5 + 0.12 * (s - 12) : 1;
      hit(out, t, 0.15, 0.3 * v, "bandpass", 1800, 0.6);
      note(out, "triangle", 210, t, 0.08, 0.17 * v, 140, 0.1);
    }
    if (s === 0 && bar % 8 === 0) hit(out, t, 1.1, 0.13, "highpass", 4800, 0.5, 2600);   // crash
  }

  let step = 0, next = ctx.currentTime + 0.12, live = true;
  function pump() {
    if (!live) return;
    if (next < ctx.currentTime) next = ctx.currentTime + 0.03;
    while (next < ctx.currentTime + AHEAD) { play(step, next); step = (step + 1) % STEPS; next += STEP; }
  }
  const timer = setInterval(pump, 45);
  pump();
  return function stop() {
    if (!live) return;
    live = false;
    clearInterval(timer);
    const t = ctx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setTargetAtTime(0.0001, t, 0.06);
    setTimeout(function () { try { out.disconnect(); } catch (e) { /* already gone */ } }, 700);
  };
}

/* ---------------- Sound: engine, crunches, the crowd, and the band ----------------
   The shell still plays its own little sounds. On top of that the game brings an engine that follows the
   throttle, metal crunches, landing thuds, an air horn and a crowd, all made in code with the Web Audio API.
   Nothing is created until the first tap, click or key press. It goes quiet with the shell's mute button
   (the same remembered "npArcade.muted" setting), and the band has its own remembered on/off switch. */
const MUSIC_KEY = "npArcade.music";
const MUSIC_VOL = 0.16, SFX_VOL = 0.24, ENGINE_VOL = 0.11;

const Sound = (function () {
  let A = null, dead = false, muted = false, stopMusic = null, timer = 0;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  const buttons = [];

  function rig(c) {
    const a = { c: c };
    a.out = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    a.out.connect(comp); comp.connect(c.destination);
    a.music = c.createGain(); a.music.gain.value = MUSIC_VOL;
    a.duck = c.createGain(); a.music.connect(a.duck); a.duck.connect(a.out);
    a.sfx = c.createGain(); a.sfx.gain.value = SFX_VOL; a.sfx.connect(a.out);
    const len = Math.floor(c.sampleRate * 2);
    a.noise = c.createBuffer(1, len, c.sampleRate);
    const d = a.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // the engine: a sawtooth and a sub square through a lowpass, pulsed by the firing rate, over a bed of rumble
    a.eng = c.createGain(); a.eng.gain.value = 0; a.eng.connect(a.out);
    a.engF = c.createBiquadFilter(); a.engF.type = "lowpass"; a.engF.frequency.value = 400; a.engF.Q.value = 2.2; a.engF.connect(a.eng);
    a.engAmp = c.createGain(); a.engAmp.gain.value = 0.7; a.engAmp.connect(a.engF);
    a.o1 = c.createOscillator(); a.o1.type = "sawtooth"; a.o1.frequency.value = 40; a.o1.connect(a.engAmp);
    a.o2 = c.createOscillator(); a.o2.type = "square"; a.o2.frequency.value = 20; const g2 = c.createGain(); g2.gain.value = 0.55; a.o2.connect(g2); g2.connect(a.engAmp);
    a.lfo = c.createOscillator(); a.lfo.type = "square"; a.lfo.frequency.value = 18; a.lfoG = c.createGain(); a.lfoG.gain.value = 0.3; a.lfo.connect(a.lfoG); a.lfoG.connect(a.engAmp.gain);
    a.rum = c.createBufferSource(); a.rum.buffer = a.noise; a.rum.loop = true;
    a.rumF = c.createBiquadFilter(); a.rumF.type = "bandpass"; a.rumF.frequency.value = 160; a.rumF.Q.value = 0.9;
    a.rumG = c.createGain(); a.rumG.gain.value = 0.5; a.rum.connect(a.rumF); a.rumF.connect(a.rumG); a.rumG.connect(a.eng);
    a.o1.start(); a.o2.start(); a.lfo.start(); a.rum.start();
    return a;
  }
  function osc(dest, type, f0, t, dur, vol, f1, hold) {
    const c = A.c, o = c.createOscillator(), g = c.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.5 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(dest, t, dur, vol, type, f0, q, f1, atk) {
    const c = A.c, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = A.noise; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  function duck(t, secs) {
    A.duck.gain.cancelScheduledValues(t);
    A.duck.gain.setTargetAtTime(0.45, t, 0.03);
    A.duck.gain.setTargetAtTime(1, t + secs, 0.3);
  }
  function cue(name, t, x) {
    const d = A.sfx;
    if (name === "crunch") {                                // sheet metal folding, glass going, a thump under it
      hiss(d, t, 0.45, 0.9, "lowpass", 3200, 0.8, 260, 0.003);
      osc(d, "sine", 120, t, 0.25, 0.9, 38, 0.05);
      [430, 760, 1180, 1690].forEach(function (f, i) { osc(d, i % 2 ? "square" : "triangle", f * (0.9 + Math.random() * 0.2), t + i * 0.035, 0.18, 0.12, f * 0.7, 0.05); });
      for (let i = 0; i < 6; i++) hiss(d, t + 0.05 + Math.random() * 0.25, 0.05, 0.25, "highpass", 6000 + Math.random() * 3000, 1.5);
      if (x > 1) osc(d, "square", 523 + 80 * Math.min(6, x), t + 0.1, 0.12, 0.12, 0, 0.6);
    } else if (name === "thud") {                           // tires landing
      osc(d, "sine", 95, t, 0.3, 0.55 + 0.45 * (x || 0), 34, 0.05);
      hiss(d, t, 0.22, 0.35 + 0.4 * (x || 0), "lowpass", 600, 0.7, 120);
    } else if (name === "scrape") {
      hiss(d, t, 0.35, 0.45, "bandpass", 1300, 1.2, 600);
      osc(d, "sawtooth", 180, t, 0.3, 0.12, 120, 0.3);
    } else if (name === "cheer") {                          // the stands: a swell, hiss on top, hands clapping
      const v = 0.35 + 0.65 * (x == null ? 1 : x);
      hiss(d, t, 1.4 + v, 0.9 * v, "bandpass", 1000, 0.45, 1500, 0.25);
      hiss(d, t + 0.1, 1.2 + v, 0.35 * v, "highpass", 3200, 0.6, 0, 0.3);
      for (let i = 0; i < Math.round(10 + 20 * v); i++) hiss(d, t + 0.15 + Math.random() * 1.4, 0.03, 0.22 + Math.random() * 0.2, "bandpass", 1800 + Math.random() * 2200, 2.5);
      if (v > 0.8) duck(t, 1.2);
      V.cheer = Math.max(V.cheer || 0, v);
    } else if (name === "ooh") {                            // the stands wincing
      [196, 233, 262, 294].forEach(function (f, i) { osc(d, "triangle", f * (0.98 + Math.random() * 0.04), t + i * 0.02, 1.2, 0.07, f * 0.78, 0.55); });
      hiss(d, t, 1.2, 0.5, "bandpass", 700, 1.6, 380, 0.12);
    } else if (name === "beep") {
      osc(d, "square", 660, t, 0.16, 0.3, 0, 0.7);
    } else if (name === "go") {
      osc(d, "square", 990, t, 0.45, 0.32, 0, 0.75); osc(d, "square", 1320, t, 0.45, 0.16, 0, 0.75);
    } else if (name === "horn") {                           // air horn
      [233, 294, 349].forEach(function (f) { osc(d, "sawtooth", f, t, 0.9, 0.12, f * 0.97, 0.85); });
      duck(t, 1);
    } else if (name === "cash") {
      [1047, 1319, 1568, 2093].forEach(function (f, i) { osc(d, "square", f, t + i * 0.06, 0.12, 0.16, 0, 0.5); });
      osc(d, "sine", 2637, t + 0.24, 0.6, 0.12, 0, 0.2);
    } else if (name === "buzzer") {
      osc(d, "sawtooth", 110, t, 0.8, 0.3, 0, 0.9); osc(d, "square", 117, t, 0.8, 0.15, 0, 0.9);
    } else if (name === "whoosh") {
      hiss(d, t, 0.4, 0.4, "bandpass", 400, 1.2, 3000);
    }
  }

  function shellMuted() {
    const b = document.getElementById("np-mute");
    if (b) return b.getAttribute("aria-pressed") === "true";
    try { return localStorage.getItem("npArcade.muted") === "1"; } catch (e) { return false; }
  }
  // Called from a tap, click or key press, and nowhere else: browsers only let sound start from one of those.
  function unlock() {
    if (dead) return;
    try {
      if (!A) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        A = rig(new AC());
        muted = shellMuted();
        A.out.gain.value = muted ? 0 : 1;
        if (!timer) timer = setInterval(pump, 150);       // keeps the band honest if the picture stalls
      }
      if (A.c.state !== "running") { const p = A.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { A = null; dead = true; }
  }
  // Every frame: follow the mute button, start or stop the band, and drive the engine from the truck.
  function pump() {
    if (!A || !window.Shell) return;
    const c = A.c, now = c.currentTime, m = shellMuted();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, now, 0.02); }
    const playing = Shell.state() === "playing" && c.state === "running";
    const want = musicOn && !muted && playing;
    if (want && !stopMusic) stopMusic = startMusic(c, A.music);
    else if (!want && stopMusic) { stopMusic(); stopMusic = null; }
    const live = playing && S.phase && S.phase !== "over";
    const rpm = live ? clamp(S.rpm || 0, 0, 1.2) : 0;
    A.o1.frequency.setTargetAtTime(34 + rpm * 92, now, 0.06);
    A.o2.frequency.setTargetAtTime((34 + rpm * 92) * 0.5, now, 0.06);
    A.lfo.frequency.setTargetAtTime(9 + rpm * 26, now, 0.06);
    A.engF.frequency.setTargetAtTime(260 + rpm * 1500, now, 0.06);
    A.rumF.frequency.setTargetAtTime(120 + rpm * 240, now, 0.08);
    A.eng.gain.setTargetAtTime(live ? ENGINE_VOL * (0.55 + 0.45 * (S.gasNow || 0)) : 0, now, live ? 0.08 : 0.04);
  }
  function sfx(name, x) {
    if (!A || muted || A.c.state !== "running") { if (name === "cheer") V.cheer = Math.max(V.cheer || 0, x == null ? 1 : x); return; }
    try { cue(name, A.c.currentTime + 0.01, x); } catch (e) { /* sound is never worth a crash */ }
  }
  function label() {
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      b.setAttribute("aria-pressed", musicOn ? "true" : "false");
      if (b._icon) { b.innerHTML = musicOn ? ICON_NOTE : ICON_NOTE_OFF; b.setAttribute("aria-label", musicOn ? "Turn music off" : "Turn music on"); }
      else b.textContent = musicOn ? "MUSIC: ON" : "MUSIC: OFF";
    }
  }
  function setMusic(on) {
    musicOn = !!on;
    try { localStorage.setItem(MUSIC_KEY, musicOn ? "1" : "0"); } catch (e) { /* private mode */ }
    label(); pump();
  }
  // A "MUSIC: ON / OFF" button in the shell's own button style, for the title and pause cards.
  function button(parent, before) {
    if (!parent) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-btn"; b.setAttribute("data-np-music", "");
    b.style.cssText = "width:100%;margin-top:8px";
    b.addEventListener("click", function (e) { e.stopPropagation(); unlock(); setMusic(!musicOn); });
    parent.insertBefore(b, before || null);
    buttons.push(b); label();
  }
  // A note icon in the top bar, beside the shell's mute button, so the band can go quiet mid-run.
  function barButton() {
    const mute = document.getElementById("np-mute");
    if (!mute || !mute.parentNode) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-icon"; b.id = "np-music"; b._icon = true;
    b.addEventListener("click", function (e) {
      unlock(); setMusic(!musicOn);
      if (e.detail > 0 && Shell.state() === "playing") { const cv = document.getElementById("np-canvas"); try { cv.focus({ preventScroll: true }); } catch (err) { cv.focus(); } }
    });
    mute.parentNode.insertBefore(b, mute);
    buttons.push(b); label();
  }
  return {
    unlock: unlock, pump: pump, sfx: sfx, button: button, barButton: barButton,
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    newGame: function () { unlock(); if (stopMusic) { stopMusic(); stopMusic = null; } pump(); },
    peek: function () { return { made: !!A, state: A ? A.c.state : "none", music: !!stopMusic, muted: muted, musicOn: musicOn, engine: A ? A.eng.gain.value : 0 }; }
  };
})();
const ICON_NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 4l11-2v13.5a3 3 0 1 1-2-2.83V6.3L11 7.6v9.9a3 3 0 1 1-2-2.83z"/></svg>';
const ICON_NOTE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" opacity=".45" d="M9 4l11-2v13.5a3 3 0 1 1-2-2.83V6.3L11 7.6v9.9a3 3 0 1 1-2-2.83z"/><path fill="none" stroke="currentColor" stroke-width="2.4" d="M3 3l18 18"/></svg>';

/* ---------------- LED ribbon board: the strip along the stadium wall, between the padding and the stands ----------------
   The board is a real dot matrix. What it shows is painted into a small canvas, one pixel per LED, and a little shader
   turns each pixel into a glowing dot. The board runs the whole length of the stadium, and the canvas is the stretch
   of it in front of the camera, so a reaction always lands where the player is looking. The programme scrolls right
   to left along the wall; big moments (ledPlay below) cut in. */
const LED_COLS = 420, LED_ROWS = 26, LED_PITCH = 0.08;   // LEDs across the canvas, rows, meters between LEDs
const LED_SAFE = 330;                                      // widest message that stays on screen
const LED_SPEED = 46;                                      // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["BE KIND, REWIND", "pink"], ["NO QUARTERS REQUIRED", "cyan"], ["MONSTER TRUCK RALLY", "lime"]];
// Plugs for the rest of the arcade: [game, one-line tag]. Edit freely, the board lays itself out.
const LED_PLUGS = [
  ["TAPE PIN LANES", "3D BOWLING"],
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
  // The wordmark at board resolution: cream lettering pushed to full brightness, the red edge a dimmer rim, navy to dark.
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
  function plug(name, tag, color) {                         // an ad card: color bar, a "FREE" tab and tag, the game's name under it
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
    ledText(g, "*", x, Math.floor((HH - 7) / 2), 1, 1, LED_C.blue);
    x += 7 + GAP;
  }
  return c;
}
function ledCreate(script) {
  const c = mkCanvas(LED_COLS, LED_ROWS), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  return { canvas: c, g: g, strip: ledStrip(script), scroll: 0, pos: -1, c0: 0, drawnC0: -1e9, msg: null, queue: [], frame: -1, tex: null };
}
function ledDotCanvas() {
  const c = mkCanvas(32, 32), g = c.getContext("2d");
  g.fillStyle = "#000000"; g.fillRect(0, 0, 32, 32);
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.45, "#f4f4f4"); gr.addColorStop(0.8, "#585858"); gr.addColorStop(1, "#000000");
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return c;
}
// kind: "flash" (strobe and chevrons), "slide", "cycle", "blink" or "count" (label, a number that counts up)
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
    const old = (L.msg && L.msg.keep ? [L.msg] : []).concat(L.queue.filter(function (m) { return m.keep; }));
    if (old.length) { old[0].t = 0; list = list.concat(old); }
  }
  L.msg = list[0]; L.msg.t = 0;
  L.queue = list.slice(1);
  L.frame = -1;
}
function ledClear() { if (LED) { LED.msg = null; LED.queue = []; LED.pos = -1; } }
function ledFinal(score) {
  if (!LED) return;
  ledPlay([ledMsg("count", "FINAL", 8, { from: 0, value: score, final: true, wait: 0.4 })]);
}
function ledDrawMsg(g, m) {
  const WW = LED_COLS, HH = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(WW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.amber;
  function fit(str) { let sx = big; while (sx > 1 && ledTextW(str, sx) > LED_SAFE) sx--; return sx; }
  function chase(color, dir) {
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < WW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(WW - x - 3, HH - 1, 3, 1); }
  }
  if (m.kind === "count") {
    const k = calm ? 1 : Math.min(1, t / 0.8), v = Math.round(m.from + (m.value - m.from) * k);
    const label = m.text ? m.text + " " : "", sxc = fit(label + m.value);
    const x = Math.round((WW - ledTextW(label + m.value, sxc)) / 2);
    const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
    const xn = ledText(g, label, x, yBig, sxc, big, LED_C.amber);
    ledText(g, String(v), xn, yBig, sxc, big, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
    if (!calm && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(WW * m.t / 0.3), 0, WW, HH); }
    chase(LED_C.amber, 1);
    return;
  }
  const sx = fit(m.text), w = ledTextW(m.text, sx), x0 = Math.round((WW - w) / 2);
  if (m.kind === "flash") {
    if (!calm && !m.quick && t < 0.6 && Math.floor(t * 12) % 2 === 0) {
      g.fillStyle = LED_C.yellow; g.fillRect(0, 0, WW, HH);
      ledText(g, m.text, x0, yBig, sx, big, "#000000");
      return;
    }
    const span = 6 * big + 5, ph = calm ? 0 : Math.floor((t * 46) % span);
    for (let k = 0; k < 16; k++) {
      const off = Math.round(w / 2) + 9 + k * span + ph;
      if (off > mid + span) break;
      const cc = k % 2 ? LED_C.red : (m.color === "pink" ? LED_C.pink : LED_C.orange);
      ledText(g, ">", mid + off, yBig, big, big, cc);
      ledText(g, "<", mid - off - 5 * big, yBig, big, big, cc);
    }
    const cyc = m.color === "pink" ? [LED_C.pink, LED_C.white, LED_C.violet] : [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0, yBig, sx, big, calm ? LED_C.yellow : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 18; i++) g.fillRect((Math.random() * WW) | 0, (Math.random() * HH) | 0, 1, 1); }
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "slide") {
    const k = calm ? 1 : Math.min(1, t / 0.45), e = 1 - Math.pow(1 - k, 3);
    const x = Math.round(x0 + (1 - e) * WW);
    ledText(g, m.text, x, yBig, sx, big, col);
    if (!calm && k >= 1) {
      const bx = Math.floor(((t - 0.45) * 180) % (WW + 80)) - 40;
      g.save(); g.beginPath(); g.rect(bx, 0, 12, HH); g.clip();
      ledText(g, m.text, x, yBig, sx, big, "#ffffff");
      g.restore();
    }
    chase(col, -1);
    return;
  }
  if (m.kind === "cycle") {
    const cyc = [LED_C.yellow, LED_C.pink, LED_C.cyan, LED_C.lime, LED_C.orange];
    let x = x0;
    for (let i = 0; i < m.text.length; i++) x = ledText(g, m.text[i], x, yBig, sx, big, cyc[(i + (calm ? 0 : Math.floor(t * 9))) % cyc.length]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 12; i++) g.fillRect((Math.random() * WW) | 0, (Math.random() * HH) | 0, 1, 1); }
    chase(LED_C.yellow, 1);
    return;
  }
  if (calm || t > 1.1 || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, yBig, sx, big, col);   // blink, then hold
  g.fillStyle = col; g.fillRect(0, HH - 1, WW, 1); g.fillRect(0, 0, WW, 1);
}
function ledDraw() {
  const L = LED, g = L.g, HH = LED_ROWS;
  g.fillStyle = "#000000"; g.fillRect(0, 0, LED_COLS, HH);
  if (L.msg) { ledDrawMsg(g, L.msg); return; }
  // the programme is fixed to the wall and slides along it; the canvas is just the stretch in view
  const sw = L.strip.width;
  let sx = (((L.c0 + L.pos) % sw) + sw) % sw, dx = 0;
  while (dx < LED_COLS) {
    const n = Math.min(LED_COLS - dx, sw - sx);
    g.drawImage(L.strip, sx, 0, n, HH, dx, 0, n, HH);
    dx += n; sx = 0;
  }
}
// Advance the board. It only repaints (and re-uploads its small texture) when an LED actually changes.
function ledTick(dt, c0) {
  const L = LED;
  if (!L) return;
  let redraw = false;
  if (c0 !== L.c0) { L.c0 = c0; redraw = true; }
  if (L.msg) {
    L.msg.t += dt;
    if (L.msg.t >= L.msg.dur) { L.msg = L.queue.shift() || null; L.frame = -1; redraw = true; }
  }
  if (L.msg) {
    const f = Math.floor(L.msg.t * 30);
    if (f !== L.frame) { L.frame = f; redraw = true; }
  } else {
    L.scroll += dt * (Shell.reduced ? LED_SPEED * 0.5 : LED_SPEED);
    const p = Math.floor(L.scroll);
    if (p !== L.pos) { L.pos = p; redraw = true; }
  }
  if (redraw) { ledDraw(); if (L.tex) L.tex.needsUpdate = true; }
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
function speckle(g, w, h, n, rnd, light, dark, sz) {
  sz = sz || 1.5;
  for (let i = 0; i < n; i++) { g.fillStyle = rnd() < 0.5 ? light : dark; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * sz, 1 + rnd() * sz); }
}
const CANDY_FACE = '"Arial Black", "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
function candyText(g, str, x, y, size, maxW, fill) {
  g.font = "900 " + size + "px " + CANDY_FACE;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + CANDY_FACE; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = size * 0.36; g.strokeStyle = "#08205f"; g.strokeText(str, x, y + size * 0.06);
  g.lineWidth = size * 0.17; g.strokeStyle = "#ffffff"; g.strokeText(str, x, y);
  const gr = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  if (fill) { gr.addColorStop(0, shade(fill, 0.35)); gr.addColorStop(1, shade(fill, -0.15)); }
  else { gr.addColorStop(0, "#fff06a"); gr.addColorStop(0.55, "#ffc21a"); gr.addColorStop(1, "#ff7a0f"); }
  g.fillStyle = gr; g.fillText(str, x, y);
  g.fillStyle = "rgba(255,255,255,.4)";
  g.save(); g.beginPath(); g.rect(x - 900, y - size * 0.5, 1800, size * 0.36); g.clip(); g.fillText(str, x, y); g.restore();
}

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every sign and decal in the stadium uses this
// (the full logo with the mascot is kept for the splash, the title card and the score card). If the PNG is
// missing, plain lettering stands in.
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

/* ---------------- Painted textures ---------------- */

// The top of the dirt strip: 8 m along x per tile, the full width across. Two packed wheel ruts down the middle.
function dirtTopCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(3);
  g.fillStyle = "#b9763f"; g.fillRect(0, 0, 512, 256);
  speckle(g, 512, 256, 9000, rnd, "rgba(255,226,180,.10)", "rgba(90,46,16,.12)", 2.5);
  for (let i = 0; i < 70; i++) {                           // clods
    const x = rnd() * 512, y = rnd() * 256, r = 2 + rnd() * 5;
    g.fillStyle = "rgba(120,62,24,.35)"; g.beginPath(); g.ellipse(x + 1, y + 1.5, r, r * 0.7, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(214,150,96,.5)"; g.beginPath(); g.ellipse(x, y, r * 0.8, r * 0.55, 0, 0, TAU); g.fill();
  }
  [0.5 - 1.38 / (TRACK_W * 2), 0.5 + 1.38 / (TRACK_W * 2)].forEach(function (v) {   // ruts where the tires run
    const y = (1 - v) * 256;
    for (let k = 0; k < 2; k++) {
      const gr = g.createLinearGradient(0, y - 16, 0, y + 16);
      gr.addColorStop(0, "rgba(95,48,18,0)"); gr.addColorStop(0.5, "rgba(95,48,18,.28)"); gr.addColorStop(1, "rgba(95,48,18,0)");
      g.fillStyle = gr; g.fillRect(0, y - 16, 512, 32);
    }
    for (let x = 0; x < 512; x += 10) { g.fillStyle = "rgba(70,34,12,.22)"; g.fillRect(x, y - 9 + (x % 20 ? 0 : 3), 5, 15); }
  });
  return c;
}
// The front face of the dirt: packed layers.
function dirtSideCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(9);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "#a8652f"); gr.addColorStop(1, "#7a4220");
  g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 18 + rnd() * 22) {
    g.fillStyle = "rgba(" + (rnd() < 0.5 ? "60,28,10," : "210,150,96,") + (0.12 + rnd() * 0.12) + ")";
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + y) * 4);
    g.lineTo(512, y + 6); g.lineTo(0, y + 6); g.closePath(); g.fill();
  }
  speckle(g, 512, 256, 6000, rnd, "rgba(255,226,180,.08)", "rgba(60,28,10,.14)", 2.5);
  for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(150,140,130," + (0.25 + rnd() * 0.3) + ")"; g.beginPath(); g.ellipse(rnd() * 512, rnd() * 256, 3 + rnd() * 5, 2 + rnd() * 3, rnd() * 3, 0, TAU); g.fill(); }
  return c;
}
// The arena floor around the course: darker, raked dirt. 12 m a tile.
function floorCanvas() {
  const c = mkCanvas(512, 512), g = c.getContext("2d"), rnd = rng(31);
  g.fillStyle = "#6b4a33"; g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 12000, rnd, "rgba(255,220,170,.06)", "rgba(30,16,6,.14)", 2.5);
  g.strokeStyle = "rgba(60,28,8,.16)"; g.lineWidth = 3;
  for (let i = 0; i < 6; i++) {                             // old tire tracks
    const y0 = rnd() * 512, a = (rnd() - 0.5) * 0.6;
    for (let k = -1; k <= 1; k += 2) { g.beginPath(); for (let x = -20; x <= 532; x += 16) g.lineTo(x, y0 + k * 9 + x * a + Math.sin(x * 0.01 + i) * 12); g.stroke(); }
  }
  return c;
}
// The padded wall around the floor: 24 m a tile, panels of wordmark and slogans.
function wallCanvas(script) {
  const c = mkCanvas(2048, 192), g = c.getContext("2d");
  const items = ["mark", "FREE AT THENOSTALGIAPRO.COM", "mark", "MONSTER TRUCK RALLY", "mark", "BE KIND, REWIND"];
  const pw = 2048 / items.length;
  for (let i = 0; i < items.length; i++) {
    const x = i * pw, blue = i % 2 === 0;
    const bg = g.createLinearGradient(0, 0, 0, 192);
    if (blue) { bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.55, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6"); }
    else { bg.addColorStop(0, "#ffb347"); bg.addColorStop(0.55, "#ff8a1e"); bg.addColorStop(1, "#d8600a"); }
    g.fillStyle = bg; g.fillRect(x, 0, pw, 192);
    g.fillStyle = "rgba(255,255,255,.16)"; g.fillRect(x + 6, 14, pw - 12, 46);
    g.fillStyle = "rgba(4,16,60,.6)"; g.fillRect(x, 0, 4, 192); g.fillRect(x + pw - 4, 0, 4, 192);
    if (items[i] === "mark") drawScript(g, script, x + pw / 2, 100, pw - 40, 150);
    else candyText(g, items[i], x + pw / 2, 98, 52, pw - 40);
  }
  g.fillStyle = "#ffd21f"; g.fillRect(0, 0, 2048, 10);
  g.fillStyle = "rgba(4,16,60,.55)"; g.fillRect(0, 182, 2048, 10);
  return c;
}
// One row of stadium seats seen from the front (the riser with seat backs). 8 m a tile.
function seatCanvas() {
  const c = mkCanvas(512, 64), g = c.getContext("2d");
  g.fillStyle = "#1a2350"; g.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 16; i++) {
    const x = i * 32 + 3;
    rrectPath(g, x, 8, 26, 50, 6); g.fillStyle = i % 2 ? "#ff8a1e" : "#ffb000"; g.fill();
    g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(x + 3, 12, 20, 6);
  }
  return c;
}
function skyCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(11);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, "#0d2f9a"); gr.addColorStop(0.45, "#2a6ff0"); gr.addColorStop(0.8, "#7ec4ff"); gr.addColorStop(1, "#ffd9a0");
  g.fillStyle = gr; g.fillRect(0, 0, 512, 128);
  g.fillStyle = "#c98a50"; g.fillRect(0, 128, 512, 128);
  for (let i = 0; i < 26; i++) {                            // puffy clouds, wrapped around
    const x = rnd() * 512, y = 40 + rnd() * 70, s = 6 + rnd() * 14;
    for (let k = 0; k < 6; k++) for (let o = -512; o <= 512; o += 512) {
      g.fillStyle = "rgba(255,255,255," + (0.35 + rnd() * 0.3) + ")";
      g.beginPath(); g.ellipse(x + o + (k - 2.5) * s * 0.8, y + Math.sin(k * 2.1) * s * 0.25, s, s * 0.55, 0, 0, TAU); g.fill();
    }
  }
  return c;
}
// A jumbotron face: wordmark over the game's name.
function jumboCanvas(script, alt) {
  const c = mkCanvas(1024, 576), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 576);
  if (alt) { bg.addColorStop(0, "#ff6cbb"); bg.addColorStop(1, "#c4157a"); }
  else { bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6"); }
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 576);
  g.fillStyle = "rgba(255,255,255,.08)";
  for (let i = 0; i < 28; i += 2) { g.beginPath(); g.moveTo(512, 250); g.arc(512, 250, 1400, i / 28 * TAU, (i + 1) / 28 * TAU); g.closePath(); g.fill(); }
  const gl = g.createLinearGradient(0, 0, 0, 220);
  gl.addColorStop(0, "rgba(255,255,255,.4)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.beginPath(); g.ellipse(512, -40, 640, 240, 0, 0, TAU); g.fill();
  g.lineWidth = 18; g.strokeStyle = "#ff9214"; g.strokeRect(9, 9, 1006, 558);
  g.lineWidth = 5; g.strokeStyle = "#ffe45c"; g.strokeRect(24, 24, 976, 528);
  drawScript(g, script, 512, 245, 860, 330);
  candyText(g, "MONSTER TRUCK RALLY", 512, 475, 78, 900);
  return c;
}
// Boards along the back of the course.
function boardCanvas(script, i) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  const kinds = [["#1b5fe0", "#0b3aa6", null], ["#ff8a1e", "#d8600a", "FREE AT THENOSTALGIAPRO.COM"], ["#2fbf5a", "#13803a", null], ["#7a3ff2", "#4a1fb8", "NO QUARTERS REQUIRED"]];
  const k = kinds[i % kinds.length];
  const bg = g.createLinearGradient(0, 0, 0, 256); bg.addColorStop(0, k[0]); bg.addColorStop(1, k[1]);
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "rgba(255,255,255,.14)"; g.fillRect(10, 10, 492, 70);
  g.lineWidth = 10; g.strokeStyle = "#ffffff"; g.strokeRect(5, 5, 502, 246);
  if (k[2]) { drawScript(g, script, 256, 102, 420, 150); candyText(g, k[2], 256, 210, 34, 470); }
  else drawScript(g, script, 256, 128, 460, 210);
  return c;
}
// The big gantry banners at the start and the finish.
function gantryCanvas(script, word) {
  const c = mkCanvas(1024, 320), g = c.getContext("2d");
  for (let y = 0; y < 2; y++) for (let x = 0; x < 32; x++) { g.fillStyle = (x + y) % 2 ? "#111" : "#fff"; g.fillRect(x * 32, y * 32, 32, 32); g.fillRect(x * 32, 256 + y * 32, 32, 32); }
  const bg = g.createLinearGradient(0, 64, 0, 256);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fillRect(0, 64, 1024, 192);
  drawScript(g, script, 250, 160, 400, 170);
  candyText(g, word, 700, 160, 120, 560);
  return c;
}
function checkerCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? "#141414" : "#f6f6f0"; g.fillRect(x * 16, y * 16, 16, 16); }
  return c;
}
// A plate on the side of a big ramp: the wordmark on a blue candy plate.
function plateCanvas(script) {
  const c = mkCanvas(512, 224), g = c.getContext("2d");
  rrectPath(g, 4, 4, 504, 216, 40); g.fillStyle = "#0d1f5c"; g.fill();
  rrectPath(g, 14, 14, 484, 196, 32);
  const bg = g.createLinearGradient(0, 14, 0, 210); bg.addColorStop(0, "#3d8cff"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fill();
  g.lineWidth = 6; g.strokeStyle = "#ff9214"; g.stroke();
  drawScript(g, script, 256, 112, 440, 170);
  return c;
}
function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(30,14,4,.8)"); gr.addColorStop(0.55, "rgba(30,14,4,.4)"); gr.addColorStop(1, "rgba(30,14,4,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function glowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,250,225,.95)"); gr.addColorStop(0.25, "rgba(255,246,200,.42)"); gr.addColorStop(1, "rgba(255,246,200,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
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

// A truck's flank, both sides: 4.9 m by 0.84 m of paint. The wordmark on the door, the truck's name on the bed.
function truckSideCanvas(td, script) {
  const c = mkCanvas(1024, 176), g = c.getContext("2d"), WD = 1024, HT = 176;
  const bg = g.createLinearGradient(0, 0, 0, HT);
  bg.addColorStop(0, shade(td.body, 0.28)); bg.addColorStop(0.5, td.body); bg.addColorStop(1, shade(td.body, -0.3));
  g.fillStyle = bg; g.fillRect(0, 0, WD, HT);
  g.save();
  if (td.id === "latefee") {                               // flames off the front wheel
    for (let i = 0; i < 6; i++) {
      const y = 40 + i * 20, len = 380 + (i % 3) * 90;
      const fg = g.createLinearGradient(WD, 0, WD - len, 0); fg.addColorStop(0, "#ffe45c"); fg.addColorStop(0.5, td.body2); fg.addColorStop(1, "rgba(255,120,20,0)");
      g.fillStyle = fg; g.beginPath(); g.moveTo(WD, y - 12);
      g.bezierCurveTo(WD - len * 0.4, y - 26, WD - len * 0.7, y + 10, WD - len, y - 4);
      g.bezierCurveTo(WD - len * 0.65, y + 22, WD - len * 0.35, y + 6, WD, y + 14); g.closePath(); g.fill();
    }
  } else if (td.id === "turbo") {                           // lightning stripe
    g.fillStyle = td.body2; g.beginPath();
    const pts = [[0, 70], [300, 70], [260, 40], [620, 96], [580, 64], [1024, 110], [1024, 126], [560, 92], [600, 124], [240, 66], [270, 96], [0, 96]];
    pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath(); g.fill();
    g.lineWidth = 4; g.strokeStyle = "#ffffff"; g.stroke();
  } else {                                                  // mint stripes and a price sticker
    g.fillStyle = td.body2; g.fillRect(0, 60, WD, 16); g.fillRect(0, 84, WD, 6);
    g.fillStyle = "#ffffff"; g.fillRect(0, 76, WD, 8);
    g.save(); g.translate(880, 120); g.rotate(-0.12);
    rrectPath(g, -70, -26, 140, 52, 8); g.fillStyle = "#fff6d8"; g.fill(); g.lineWidth = 3; g.strokeStyle = "#e3231a"; g.stroke();
    g.font = "900 30px " + CANDY_FACE; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#e3231a"; g.fillText("$4.99", 0, 2);
    g.restore();
  }
  g.restore();
  // door: the wordmark on a dark plate (the cab sits over x 0.95 m .. -0.75 m, from the front)
  const doorX = WD * (2.45 - 0.1) / 4.9;
  rrectPath(g, doorX - 150, 18, 300, 140, 22); g.fillStyle = "rgba(8,20,64,.9)"; g.fill();
  g.lineWidth = 5; g.strokeStyle = "#ffffff"; g.stroke();
  drawScript(g, script, doorX, 88, 270, 118);
  // the bed: the truck's name
  candyText(g, td.name, WD * (2.45 + 1.6) / 4.9, 88, 64, 360, td.body2);
  g.fillStyle = "rgba(255,255,255,.22)"; g.fillRect(0, 8, WD, 10);   // the shine along the top
  g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, HT - 10, WD, 10);
  return c;
}
function truckFrontCanvas(td) {
  const c = mkCanvas(256, 128), g = c.getContext("2d");
  g.fillStyle = td.body; g.fillRect(0, 0, 256, 128);
  rrectPath(g, 50, 30, 156, 70, 10); g.fillStyle = "#16171d"; g.fill();
  g.fillStyle = "#c9ced8"; for (let x = 58; x < 200; x += 12) g.fillRect(x, 36, 5, 58);
  [22, 234].forEach(function (x) { const gr = g.createRadialGradient(x, 64, 2, x, 64, 22); gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.6, "#fff6c8"); gr.addColorStop(1, "#c9a23a"); g.fillStyle = gr; g.beginPath(); g.arc(x, 64, 20, 0, TAU); g.fill(); });
  return c;
}
function truckBackCanvas(td) {
  const c = mkCanvas(256, 128), g = c.getContext("2d");
  g.fillStyle = td.body; g.fillRect(0, 0, 256, 128);
  g.fillStyle = "#ff2a1a"; g.fillRect(6, 30, 26, 56); g.fillRect(224, 30, 26, 56);
  g.fillStyle = "#ffffff"; g.fillRect(6, 70, 26, 10); g.fillRect(224, 70, 26, 10);
  g.font = "900 24px " + CANDY_FACE; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "rgba(0,0,0,.35)"; g.fillText(td.name, 128, 64);
  return c;
}
// Tire rubber: u runs around the tire, v across it from one sidewall to the other.
function tireCanvas() {
  const c = mkCanvas(512, 128), g = c.getContext("2d");
  g.fillStyle = "#1c1d22"; g.fillRect(0, 0, 512, 128);
  g.fillStyle = "#2a2c33"; g.fillRect(0, 34, 512, 60);
  for (let x = 0; x < 512; x += 21) { g.fillStyle = "#121318"; g.fillRect(x, 34, 6, 60); }
  g.font = "bold 13px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#6f7480";
  for (let k = 0; k < 2; k++) { g.fillText("NOSTALGIA PRO  66 X 43", 128 + k * 256, 14); g.fillText("NOSTALGIA PRO  66 X 43", 128 + k * 256, 114); }
  return c;
}
// A junk car's flank in its own coordinates (meters, 100 px each): paint below the belt line, the cabin glass above it.
function carSideCanvas(car, smashed) {
  const ck = CAR_KINDS[car.kind], c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(car.seed);
  const k = 512 / 5.2, Y = function (y) { return 256 - y * k - 4; };
  g.fillStyle = shade(car.col, -0.2); g.fillRect(0, 0, 512, 256);
  const bg = g.createLinearGradient(0, Y(1.4), 0, Y(0.2));
  bg.addColorStop(0, shade(car.col, 0.25)); bg.addColorStop(1, shade(car.col, -0.25));
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  // glass: the part of the outline above the belt, pulled in a little
  g.save();
  g.beginPath();
  ck.pts.forEach(function (p, i) { const yy = Math.max(p[1], 0); if (i) g.lineTo(p[0] * k, Y(yy)); else g.moveTo(p[0] * k, Y(yy)); });
  g.closePath(); g.clip();
  g.fillStyle = smashed ? "#2b3340" : "#1d3550";
  const top = ck.pts.reduce(function (m, p) { return Math.max(m, p[1]); }, 0);
  g.fillRect(0, Y(top - 0.08), 512, Y(0.98) - Y(top - 0.08));
  g.fillStyle = "rgba(160,210,255,.35)"; g.fillRect(0, Y(top - 0.08), 512, (Y(0.98) - Y(top - 0.08)) * 0.35);
  if (smashed) {
    g.strokeStyle = "rgba(230,240,255,.7)"; g.lineWidth = 1.5;
    for (let i = 0; i < 18; i++) { const x = rnd() * 512, y = Y(1 + rnd() * (top - 1.1)); g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 4; j++) g.lineTo(x + (rnd() - 0.5) * 60, y + (rnd() - 0.5) * 30); g.stroke(); }
  }
  g.restore();
  // pillars between the windows
  const pil = [ck.len * 0.48, ck.len * 0.67];
  g.fillStyle = shade(car.col, -0.35);
  pil.forEach(function (u) { g.fillRect(u * k - 6, Y(top), 12, Y(0.95) - Y(top)); });
  // door seams, handle, wheel arches, rust
  g.strokeStyle = "rgba(0,0,0,.4)"; g.lineWidth = 2;
  [ck.len * 0.47, ck.len * 0.68].forEach(function (u) { g.beginPath(); g.moveTo(u * k, Y(0.95)); g.lineTo(u * k, Y(0.32)); g.stroke(); });
  g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(0, Y(0.82), 512, 4);
  [0.82, ck.len - 0.82].forEach(function (u) { g.fillStyle = "#14151a"; g.beginPath(); g.arc(u * k, Y(0.3), 0.44 * k, Math.PI, 0); g.fill(); });
  for (let i = 0; i < 14; i++) {
    const x = rnd() * ck.len * k, y = Y(0.3 + rnd() * 0.55), r = 5 + rnd() * 16;
    g.fillStyle = "rgba(" + (110 + rnd() * 40) + "," + (50 + rnd() * 20) + ",20," + (0.35 + rnd() * 0.3) + ")";
    g.beginPath(); g.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, TAU); g.fill();
  }
  // a headlight at the front, a taillight at the back
  g.fillStyle = "#fff6c8"; g.fillRect(ck.len * k - 14, Y(0.75), 12, 14);
  g.fillStyle = "#e3231a"; g.fillRect(2, Y(0.78), 10, 16);
  return c;
}
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.16, "#dcebff"); gr.addColorStop(0.3, "#3d8cff");
    gr.addColorStop(0.5, "#1648b8"); gr.addColorStop(0.52, "#b07040"); gr.addColorStop(1, "#7a4220");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#2a6ff0"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(8, 6, 14, 52); tg.fillRect(42, 6, 14, 52);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#8a5228"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* ---------------- Geometry helpers ---------------- */
// A box with every edge and corner rounded. Faces keep their own material slots (+x -x +y -y +z -z), textures stretched corner to corner.
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
// Several geometries (each with a matrix) folded into one, positions and normals (and uvs when all have them).
function mergeGeos(T, list) {
  let n = 0, uvs = true;
  const parts = list.map(function (it) {
    let g = it[0].index ? it[0].toNonIndexed() : it[0].clone();
    if (it[1]) g.applyMatrix4(it[1]);
    if (!g.attributes.uv) uvs = false;
    n += g.attributes.position.count;
    return g;
  });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = uvs ? new Float32Array(n * 2) : null;
  let o = 0;
  parts.forEach(function (g) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
    g.dispose();
  });
  const out = new T.BufferGeometry();
  out.setAttribute("position", new T.BufferAttribute(pos, 3));
  out.setAttribute("normal", new T.BufferAttribute(nor, 3));
  if (uv) out.setAttribute("uv", new T.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
const TMP = {};
// Stretch a unit mesh (base at 0, length 1 along +y) from A to B with radius r.
function bone(mesh, ax, ay, az, bx, by, bz, r) {
  const d = TMP.d.set(bx - ax, by - ay, bz - az), l = d.length() || 1e-4;
  mesh.position.set(ax, ay, az);
  mesh.quaternion.setFromUnitVectors(TMP.up, d.multiplyScalar(1 / l));
  mesh.scale.set(r, l, r);
}

/* ---------------- People, built to real proportions ----------------
   A 1.78 m adult, standing, facing +z. Every joint is its own group, so a pose is a handful of rotations.
   Limbs taper (a shoulder is wider than a wrist), the torso is shaped (hips, waist, chest, shoulders),
   and there is a neck, a jaw, a nose, ears, brows and eyes. */
const PERSON_TORSO = [[0.155, 0], [0.15, 0.06], [0.138, 0.15], [0.142, 0.24], [0.16, 0.33], [0.178, 0.41], [0.18, 0.45], [0.155, 0.5], [0.09, 0.53], [0.06, 0.54]];
function personGeos(T, lod) {
  const seg = lod ? 7 : 14;
  const G = {};
  G.torso = new T.LatheGeometry(PERSON_TORSO.map(function (p) { return new T.Vector2(p[0], p[1]); }), seg);
  G.ball = new T.SphereGeometry(1, seg, lod ? 5 : 10);
  G.dome = new T.SphereGeometry(1, seg, lod ? 4 : 8, 0, TAU, 0, Math.PI * 0.55);
  // tapered limb pieces hanging down from their joint: [top radius, bottom radius, length]
  function limb(r0, r1, l) { const g = new T.CylinderGeometry(r0, r1, l, lod ? 6 : 10, 1, false); g.translate(0, -l / 2, 0); return g; }
  G.upArm = limb(0.052, 0.04, 0.3); G.foreArm = limb(0.04, 0.03, 0.26);
  G.thigh = limb(0.078, 0.054, 0.44); G.shin = limb(0.054, 0.036, 0.43);
  G.neck = limb(0.05, 0.055, 0.11);
  G.hand = new T.SphereGeometry(1, lod ? 5 : 8, lod ? 4 : 6);
  G.foot = roundBox(T, 0.1, 0.075, 0.26, 0.035);
  return G;
}
function makePerson(T, G, o) {
  const M = function (c) { return new T.MeshLambertMaterial({ color: c }); };
  const mat = { shirt: M(o.shirt), pants: M(o.pants), skin: M(o.skin), hair: M(o.hair || 0x3a2414), shoe: M(o.shoe || 0x1b1c22), dark: M(0x14151a) };
  if (o.glove) mat.glove = M(o.glove);
  if (o.helmet) mat.helmet = new T.MeshPhongMaterial({ color: o.helmet, specular: 0xffffff, shininess: 120, envMap: o.env || null, combine: T.AddOperation, reflectivity: 0.25 });
  const list = [];
  function add(parent, geo, m, part, x, y, z, sx, sy, sz) {
    const mesh = new T.Mesh(geo, m);
    mesh.position.set(x || 0, y || 0, z || 0);
    if (sx) mesh.scale.set(sx, sy || sx, sz || sx);
    parent.add(mesh); list.push({ mesh: mesh, part: part });
    return mesh;
  }
  const root = new T.Group();
  const pelvis = new T.Group(); pelvis.position.y = 0.95; root.add(pelvis);
  add(pelvis, G.ball, mat.pants, "pants", 0, 0.02, 0, 0.165, 0.11, 0.12);
  const spine = new T.Group(); spine.position.y = 0.03; pelvis.add(spine);
  add(spine, G.torso, mat.shirt, "shirt", 0, 0, 0, 1, 1, 0.64);
  add(spine, G.neck, mat.skin, "skin", 0, 0.62, 0.01);
  const head = new T.Group(); head.position.set(0, 0.6, 0.01); spine.add(head);
  add(head, G.ball, mat.skin, "skin", 0, 0.11, 0, 0.092, 0.117, 0.104);         // skull
  add(head, G.ball, mat.skin, "skin", 0, 0.045, 0.028, 0.072, 0.05, 0.072);     // jaw
  add(head, G.ball, mat.skin, "skin", 0, 0.1, 0.104, 0.017, 0.026, 0.02);       // nose
  add(head, G.ball, mat.skin, "skin", 0.094, 0.1, 0, 0.016, 0.03, 0.022); add(head, G.ball, mat.skin, "skin", -0.094, 0.1, 0, 0.016, 0.03, 0.022);   // ears
  if (o.helmet) {
    add(head, G.ball, mat.helmet, "hair", 0, 0.125, -0.005, 0.135, 0.14, 0.14);
    const visor = add(head, G.dome, mat.dark, "hair", 0, 0.11, 0.04, 0.12, 0.07, 0.11); visor.rotation.x = Math.PI / 2;
  } else {
    add(head, G.dome, mat.hair, "hair", 0, 0.12, -0.008, 0.098, 0.105, 0.11);
    add(head, G.ball, mat.dark, "hair", 0.034, 0.122, 0.092, 0.012, 0.012, 0.008); add(head, G.ball, mat.dark, "hair", -0.034, 0.122, 0.092, 0.012, 0.012, 0.008);   // eyes
    add(head, G.ball, mat.hair, "hair", 0.034, 0.148, 0.094, 0.026, 0.006, 0.01); add(head, G.ball, mat.hair, "hair", -0.034, 0.148, 0.094, 0.026, 0.006, 0.01);  // brows
  }
  const sh = [], el = [], hip = [], kn = [];
  for (let s = 0; s < 2; s++) {
    const sg = s ? -1 : 1;
    const shoulder = new T.Group(); shoulder.position.set(sg * 0.19, 0.46, 0); spine.add(shoulder);
    add(shoulder, G.ball, mat.shirt, "shirt", 0, 0, 0, 0.068, 0.065, 0.068);    // deltoid
    add(shoulder, G.upArm, mat.shirt, "shirt");
    const elbow = new T.Group(); elbow.position.y = -0.3; shoulder.add(elbow);
    add(elbow, G.foreArm, o.sleeves ? mat.shirt : mat.skin, o.sleeves ? "shirt" : "skin");
    add(elbow, G.hand, mat.glove || mat.skin, mat.glove ? "shirt" : "skin", 0, -0.3, 0, 0.034, 0.075, 0.022);
    const hp = new T.Group(); hp.position.set(sg * 0.092, -0.02, 0); pelvis.add(hp);
    add(hp, G.thigh, mat.pants, "pants");
    const knee = new T.Group(); knee.position.y = -0.44; hp.add(knee);
    add(knee, G.ball, mat.pants, "pants", 0, 0, 0.005, 0.056, 0.056, 0.056);
    add(knee, G.shin, mat.pants, "pants");
    add(knee, G.foot, mat.shoe, "pants", 0, -0.46, 0.06);
    sh.push(shoulder); el.push(elbow); hip.push(hp); kn.push(knee);
  }
  return { root: root, pelvis: pelvis, spine: spine, head: head, sh: sh, el: el, hip: hip, kn: kn, list: list, mat: mat };
}
// Sit a person down: hips at seat height (meters above the root), thighs forward, shins down.
function seat(P, seatH) {
  P.pelvis.position.y = seatH;
  for (let s = 0; s < 2; s++) { P.hip[s].rotation.x = -Math.PI / 2 + 0.06; P.kn[s].rotation.x = Math.PI / 2 - 0.1; P.hip[s].rotation.z = (s ? -1 : 1) * 0.06; }
}

/* ---------------- The trucks ---------------- */
function tireGeo(T) {
  const prof = [[0.48, -0.36], [0.58, -0.405], [0.74, -0.41], [0.83, -0.37], [0.862, -0.27], [0.868, 0], [0.862, 0.27], [0.83, 0.37], [0.74, 0.41], [0.58, 0.405], [0.48, 0.36]];
  const lathe = new T.LatheGeometry(prof.map(function (p) { return new T.Vector2(p[0], p[1]); }), 32);
  lathe.rotateX(Math.PI / 2);
  const list = [[lathe, null]];
  const lug = new T.BoxGeometry(0.075, 0.15, 0.3);
  const m = new T.Matrix4(), q = new T.Quaternion(), qa = new T.Quaternion(), qb = new T.Quaternion(), p = new T.Vector3(), sc = new T.Vector3(1, 1, 1);
  for (let i = 0; i < 22; i++) for (let k = -1; k <= 1; k += 2) {
    const a = (i + (k > 0 ? 0.5 : 0)) / 22 * TAU, rl = 0.868 + 0.02;
    p.set(Math.cos(a) * rl, Math.sin(a) * rl, k * 0.17);
    qa.setFromAxisAngle(TMP.zAxis, a); qb.setFromAxisAngle(TMP.xAxis, k * 0.42);
    q.multiplyQuaternions(qa, qb);
    list.push([lug, m.clone().compose(p, q, sc)]);
  }
  return mergeGeos(T, list);
}
function makeTruckModel(T, td, K) {
  const root = new T.Group();
  const gloss = function (c, refl) { return new T.MeshPhongMaterial({ color: c, specular: 0xffffff, shininess: 120, envMap: K.env, combine: T.AddOperation, reflectivity: refl == null ? 0.16 : refl }); };
  const paint = gloss(td.body), paint2 = gloss(td.body2), trim = gloss(td.trim, 0.08);
  const sideMat = new T.MeshPhongMaterial({ map: K.tex(truckSideCanvas(td, K.script)), specular: 0xffffff, shininess: 120, envMap: K.env, combine: T.AddOperation, reflectivity: 0.14 });
  const frontMat = new T.MeshPhongMaterial({ map: K.tex(truckFrontCanvas(td)), specular: 0xffffff, shininess: 90 });
  const backMat = new T.MeshPhongMaterial({ map: K.tex(truckBackCanvas(td)), specular: 0xffffff, shininess: 90 });
  const chrome = K.chrome, black = K.black;
  const glass = new T.MeshPhongMaterial({ color: td.glass, specular: 0xffffff, shininess: 160, envMap: K.env, combine: T.AddOperation, reflectivity: 0.35, transparent: true, opacity: 0.32, depthWrite: false, side: T.DoubleSide });
  const body = new T.Group(); root.add(body);
  function add(geo, m, x, y, z, parent) { const mesh = new T.Mesh(geo, m); mesh.position.set(x || 0, y || 0, z || 0); mesh.castShadow = true; mesh.receiveShadow = true; (parent || body).add(mesh); return mesh; }

  // the shell: hood, doors and bed in one piece
  add(roundBox(T, 4.9, 0.84, 2.0, 0.16), [frontMat, backMat, paint, trim, sideMat, sideMat], 0, 0.44, 0);
  add(roundBox(T, 1.05, 0.2, 0.78, 0.08), paint2, 1.6, 0.92, 0);                     // hood scoop
  add(roundBox(T, 0.5, 0.14, 0.62, 0.05), black, 1.75, 0.95, 0);
  add(roundBox(T, 1.6, 0.06, 1.7, 0.03), trim, -1.6, 0.87, 0);                       // bed floor
  // the cab: a roof on pillars, glass all round, so the driver shows
  add(roundBox(T, 1.6, 0.12, 1.86, 0.05), paint, -0.02, 1.58, 0);
  const pil = new T.BoxGeometry(0.08, 0.72, 0.08);
  [-0.88, 0.88].forEach(function (z) {
    const a = add(pil, paint, 0.79, 1.2, z); a.rotation.z = 0.43;                    // windshield pillars
    add(pil, paint, -0.76, 1.22, z);                                                  // back of the cab
    add(new T.BoxGeometry(0.06, 0.66, 0.05), paint, 0.02, 1.22, z * 1.005);           // door frame
  });
  const sideGlass = new T.ShapeGeometry(new T.Shape([new T.Vector2(-0.74, 0.86), new T.Vector2(0.95, 0.86), new T.Vector2(0.64, 1.53), new T.Vector2(-0.74, 1.53)]));
  [-0.905, 0.905].forEach(function (z) { const m = new T.Mesh(sideGlass, glass); m.position.z = z; m.renderOrder = 3; body.add(m); });
  const ws = new T.Mesh(new T.PlaneGeometry(1.74, 0.74), glass); ws.position.set(0.8, 1.2, 0); ws.rotation.set(0, Math.PI / 2, 0); ws.rotateX(-0.43); ws.renderOrder = 3; body.add(ws);
  const rw = new T.Mesh(new T.PlaneGeometry(1.74, 0.6), glass); rw.position.set(-0.76, 1.2, 0); rw.rotation.y = Math.PI / 2; rw.renderOrder = 3; body.add(rw);
  // the driver, strapped in
  const seatM = new T.Mesh(roundBox(T, 0.5, 0.75, 0.55, 0.1), black); seatM.position.set(-0.45, 1.15, 0); body.add(seatM);
  const drv = makePerson(T, K.pg, { shirt: td.suit, pants: td.suit, skin: 0xd9a073, helmet: td.helmet, glove: 0x1b1c22, sleeves: true, env: K.env });
  seat(drv, 0.48);
  drv.root.rotation.y = Math.PI / 2; drv.root.position.set(-0.33, 0.42, 0);
  for (let s = 0; s < 2; s++) { drv.sh[s].rotation.x = -1.05; drv.sh[s].rotation.z = (s ? 1 : -1) * 0.12; drv.el[s].rotation.x = -0.75; }
  drv.list.forEach(function (it) { it.mesh.castShadow = false; });
  body.add(drv.root);
  const wheel = new T.Mesh(new T.TorusGeometry(0.17, 0.022, 6, 18), black); wheel.position.set(0.42, 1.12, 0); wheel.rotation.y = Math.PI / 2; wheel.rotateX(0.5); body.add(wheel);
  // roll bar in the bed, light bar on the roof, a whip flag
  const tube = new T.CylinderGeometry(0.045, 0.045, 1, 8);
  [-0.82, 0.82].forEach(function (z) { const m = add(tube, chrome, -1.15, 1.2, z); m.scale.y = 0.66; });
  const bar = add(tube, chrome, -1.15, 1.53, 0); bar.rotation.x = Math.PI / 2; bar.scale.y = 1.7;
  add(roundBox(T, 0.22, 0.12, 1.4, 0.04), black, 0.2, 1.7, 0);
  const lampM = new T.MeshBasicMaterial({ color: 0xfff1a8 });
  const lamps = [];
  for (let i = 0; i < 4; i++) { const m = new T.Mesh(new T.CylinderGeometry(0.075, 0.075, 0.05, 12), lampM); m.rotation.z = Math.PI / 2; m.position.set(0.33, 1.7, -0.5 + i / 3); body.add(m); lamps.push(m); }
  const whip = add(new T.CylinderGeometry(0.012, 0.02, 2.2, 5), black, -2.25, 1.9, -0.85);
  const flagG = new T.BufferGeometry(); flagG.setAttribute("position", new T.Float32BufferAttribute([0, 0, 0, -0.55, -0.16, 0, 0, -0.32, 0], 3)); flagG.computeVertexNormals();
  const flag = new T.Mesh(flagG, new T.MeshLambertMaterial({ color: 0xff7a0f, side: T.DoubleSide })); flag.position.set(-2.25, 2.95, -0.85); body.add(flag);
  // bumpers
  const bump = new T.CylinderGeometry(0.11, 0.11, 2.15, 12); bump.rotateX(Math.PI / 2);
  add(bump, chrome, 2.5, 0.22, 0); add(bump, chrome, -2.5, 0.22, 0);
  // the frame under it all
  [-0.55, 0.55].forEach(function (z) { add(new T.BoxGeometry(4.5, 0.2, 0.14), black, 0, -0.18, z); });
  add(new T.BoxGeometry(0.9, 0.36, 0.5), black, 0.35, -0.22, 0);                     // transmission
  add(roundBox(T, 1.1, 0.5, 0.8, 0.12), K.engineMat, 0.95, 0.0, 0);                  // the engine poking out under the hood line

  // axles, wheels, shocks and links: placed every frame from the physics
  const axleGeo = new T.CylinderGeometry(0.11, 0.11, 2.7, 10); axleGeo.rotateX(Math.PI / 2);
  const axles = [], wheels = [];
  for (let k = 0; k < 2; k++) {
    const ax = new T.Group(); root.add(ax);
    const a = new T.Mesh(axleGeo, black); a.castShadow = true; ax.add(a);
    const diff = new T.Mesh(K.pg.ball, black); diff.scale.set(0.28, 0.26, 0.24); diff.position.z = 0.15; ax.add(diff);
    axles.push(ax);
    for (let side = 0; side < 2; side++) {
      const zg = side ? -1 : 1, wg = new T.Group(); wg.position.z = zg * 1.38; ax.add(wg);
      const spin = new T.Group(); wg.add(spin);
      const tire = new T.Mesh(K.tire, K.tireMat); tire.castShadow = true; tire.receiveShadow = true; spin.add(tire);
      const rim = new T.Group(); rim.position.z = zg * 0.33; spin.add(rim);
      const rimMat = gloss(td.rim, 0.3);
      const dish = new T.Mesh(K.dish, rimMat); rim.add(dish);
      const ring = new T.Mesh(K.ring, chrome); ring.position.z = zg * 0.05; rim.add(ring);
      for (let i = 0; i < 6; i++) { const sp = new T.Mesh(K.spoke, chrome); sp.rotation.z = i / 6 * TAU; sp.position.z = zg * 0.05; rim.add(sp); }
      const cap = new T.Mesh(K.pg.ball, chrome); cap.scale.set(0.12, 0.12, 0.08); cap.position.z = zg * 0.07; rim.add(cap);
      wheels.push({ g: wg, spin: spin, k: k });
    }
  }
  const shocks = [];
  const shockBody = new T.CylinderGeometry(1, 1, 1, 10); shockBody.translate(0, 0.5, 0);
  const coilMat = new T.MeshPhongMaterial({ color: td.body2, specular: 0xffffff, shininess: 80 });
  for (let k = 0; k < 2; k++) for (let i = 0; i < 4; i++) {
    const sb = new T.Mesh(shockBody, i % 2 ? coilMat : chrome); sb.castShadow = true; root.add(sb);
    shocks.push({ m: sb, k: k, z: (i < 2 ? 1 : -1) * 0.82, dx: i % 2 ? 0.22 : -0.22, r: i % 2 ? 0.1 : 0.06 });
  }
  const links = [];
  for (let k = 0; k < 2; k++) for (let i = 0; i < 2; i++) {
    const l = new T.Mesh(shockBody, black); root.add(l);
    links.push({ m: l, k: k, z: i ? -0.5 : 0.5 });
  }
  root.traverse(function (o) { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });
  return { root: root, body: body, axles: axles, wheels: wheels, shocks: shocks, links: links, driver: drv, lamps: lamps, flag: flag, whip: whip };
}

/* ---------------- Junk cars ---------------- */
function carGeometry(T, kind) {
  const ck = CAR_KINDS[kind], pts = ck.pts;
  const sh = new T.Shape();
  sh.moveTo(0.06, 0.32);
  for (let i = 1; i < pts.length - 1; i++) sh.lineTo(pts[i][0], Math.max(0.32, pts[i][1]));
  sh.lineTo(ck.len - 0.06, 0.32);
  sh.closePath();
  const g = new T.ExtrudeGeometry(sh, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.05, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -0.81);
  // the profile faces (front and back of the extrusion) carry the painted side: map them car-length to 512 px
  const uv = g.attributes.uv, p = g.attributes.position, nrm = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) if (Math.abs(nrm.getZ(i)) > 0.7) uv.setXY(i, p.getX(i) * (100 / 512) * (512 / 5.2) / 100, (p.getY(i) * (512 / 5.2) + 4) / 256);
  return g;
}
function makeCarModel(T, car, K) {
  const g = new T.Group();
  g.position.set(car.x0, car.b, 0);
  const geo = carGeometry(T, car.kind);
  const base = Float32Array.from(geo.attributes.position.array);
  const sideTex = K.tex(carSideCanvas(car, false)), smashTex = K.tex(carSideCanvas(car, true));
  const capMat = new T.MeshPhongMaterial({ map: sideTex, specular: 0x666666, shininess: 50, envMap: K.env, combine: T.AddOperation, reflectivity: 0.06 });
  const wallMat = new T.MeshPhongMaterial({ color: new T.Color(shade(car.col, -0.05)), specular: 0x666666, shininess: 50, envMap: K.env, combine: T.AddOperation, reflectivity: 0.06 });
  const body = new T.Mesh(geo, [capMat, wallMat]);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  const wheels = [];
  [0.82, car.len - 0.82].forEach(function (u) {
    [-0.78, 0.78].forEach(function (z) {
      const w = new T.Mesh(K.carWheel, K.black); w.position.set(u, 0.32, z); w.castShadow = true; g.add(w); wheels.push(w);
    });
  });
  return { g: g, body: body, geo: geo, base: base, capMat: capMat, smashTex: smashTex, wheels: wheels, shown: -1, smashed: false, car: car };
}
// Bend a car's mesh to its current damage: the same flattening the tires feel, plus a few dents.
function shapeCar(o) {
  const car = o.car, e = crushAmt(car);
  if (Math.abs(e - o.shown) < 0.004) return;
  o.shown = e;
  const p = o.geo.attributes.position, b = o.base, rnd = rng(car.seed);
  const dents = [rnd() * car.len, rnd() * car.len, rnd() * car.len];
  for (let i = 0; i < p.count; i++) {
    const x = b[i * 3], y0 = b[i * 3 + 1], z = b[i * 3 + 2];
    let y = y0;
    if (y > 0.9) y = 0.9 + (y - 0.9) * (1 - e * 0.92);
    y *= 1 - e * 0.42;
    let dent = 0;
    for (let k = 0; k < 3; k++) dent += Math.exp(-Math.pow((x - dents[k]) / 0.5, 2)) * 0.12;
    if (y0 > 0.5) y -= dent * e;
    p.setXYZ(i, x, Math.max(0.1, y), z * (1 + 0.07 * e * (y0 > 0.4 ? 1 : 0)));
  }
  p.needsUpdate = true;
  o.geo.computeVertexNormals();
  if (e > 0.5 && !o.smashed) { o.smashed = true; o.capMat.map = o.smashTex; o.capMat.needsUpdate = true; }
  o.wheels.forEach(function (w, i) { w.rotation.x = (i % 2 ? 1 : -1) * 0.35 * e; w.scale.y = 1 - 0.35 * e; });
  o.g.rotation.z = car.tilt * e * 8;
}

/* ---------------- Scene ---------------- */
const STAND = { wallZ: -12.5, padH: 2.2, ledY: 2.35, deckY: 4.75, rows: 9, rise: 0.62, tread: 1.0, x0: -90, x1: 600 };
const LED_Z = STAND.wallZ + 0.06, LED_H = LED_ROWS * LED_PITCH;

function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x2a6ff0, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = (parseInt(T.REVISION, 10) || 0) >= 182 ? T.PCFShadowMap : T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(46, W / H, 0.5, 1600);
  const caps = renderer.capabilities;
  const aniso = Math.min(4, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  TMP.d = new T.Vector3(); TMP.up = new T.Vector3(0, 1, 0); TMP.zAxis = new T.Vector3(0, 0, 1); TMP.xAxis = new T.Vector3(1, 0, 0);

  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = aniso;
    return t;
  }
  function lit(m, cast, recv) { m.castShadow = !!cast; m.receiveShadow = !!recv; return m; }
  function scaleUV(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return geo; }

  const script = scriptCanvas(scriptImg);
  const env = new T.CubeTexture(envFaces());
  if ("colorSpace" in env && T.SRGBColorSpace) env.colorSpace = T.SRGBColorSpace;
  env.needsUpdate = true;
  const tScript = (function () { const c = mkCanvas(1024, 512); c.getContext("2d").drawImage(script, 8, 8, 1008, 496); return tex(c); })();

  /* lights: a bright afternoon show */
  scene.add(new T.HemisphereLight(0xffffff, 0xb07a50, 1.35));
  const key = new T.DirectionalLight(0xfff4e0, 2.6);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 14; sc.bottom = -10; sc.near = 2; sc.far = 90; sc.updateProjectionMatrix();
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.04;
  scene.add(key); scene.add(key.target);
  const fill = new T.DirectionalLight(0xdfeaff, 0.7); fill.position.set(30, 20, 60); scene.add(fill);

  /* sky and the arena floor */
  const sky = new T.Mesh(new T.SphereGeometry(900, 24, 12), new T.MeshBasicMaterial({ map: tex(skyCanvas()), side: T.BackSide, depthWrite: false }));
  sky.renderOrder = -2; scene.add(sky);
  const fw = STAND.x1 - STAND.x0, fd = 90;
  const floor = lit(new T.Mesh(scaleUV(new T.PlaneGeometry(fw, fd).rotateX(-Math.PI / 2), fw / 12, fd / 12), new T.MeshLambertMaterial({ map: tex(floorCanvas(), true) })), false, true);
  floor.position.set((STAND.x0 + STAND.x1) / 2, FLOOR_Y, STAND.wallZ + fd / 2); scene.add(floor);

  /* the stadium wall, the LED ribbon and the stands */
  const stad = new T.Group(); scene.add(stad);
  const navy = new T.MeshLambertMaterial({ color: 0x16245e }), dark = new T.MeshLambertMaterial({ color: 0x0a0f24 }), orange = new T.MeshLambertMaterial({ color: 0xff9214 });
  const pad = new T.Mesh(scaleUV(new T.PlaneGeometry(fw, STAND.padH - FLOOR_Y), fw / 24, 1), new T.MeshPhongMaterial({ map: tex(wallCanvas(script), true), specular: 0x555555, shininess: 40, envMap: env, combine: T.AddOperation, reflectivity: 0.05 }));
  pad.position.set((STAND.x0 + STAND.x1) / 2, (STAND.padH + FLOOR_Y) / 2, STAND.wallZ); lit(pad, false, true); stad.add(pad);
  const capY = new T.Mesh(new T.BoxGeometry(fw, 0.14, 0.5), new T.MeshLambertMaterial({ color: 0xffd21f })); capY.position.set(pad.position.x, STAND.padH + 0.07, STAND.wallZ - 0.2); stad.add(capY);
  const facade = new T.Mesh(new T.PlaneGeometry(fw, STAND.deckY - STAND.padH), dark); facade.position.set(pad.position.x, (STAND.deckY + STAND.padH) / 2, STAND.wallZ - 0.05); stad.add(facade);
  const lip = new T.Mesh(new T.BoxGeometry(fw, 0.18, 0.4), orange); lip.position.set(pad.position.x, STAND.deckY, STAND.wallZ - 0.1); stad.add(lip);

  /* LED ribbon: one long dot-matrix strip; its canvas is the stretch in front of the camera (see ledTick) */
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas());
  tDot.wrapS = tDot.wrapT = T.RepeatWrapping; tDot.anisotropy = aniso;
  const csChunk = T.ShaderChunk && T.ShaderChunk.colorspace_fragment ? "colorspace_fragment" : "encodings_fragment";
  const ledU = { tLed: { value: tLed }, tDot: { value: tDot }, grid: { value: new T.Vector2(LED_COLS, LED_ROWS) }, c0: { value: 0 } };
  const ledMat = new T.ShaderMaterial({
    uniforms: ledU,
    vertexShader: "uniform float c0;\nvarying vec2 vCell;\nvoid main() {\n  vCell = vec2(uv.x - c0, uv.y * " + LED_ROWS.toFixed(1) + ");\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
    fragmentShader: [
      "uniform sampler2D tLed;", "uniform sampler2D tDot;", "uniform vec2 grid;", "varying vec2 vCell;",
      "vec3 at(vec2 cell) {",
      "  if (cell.x < 0.0 || cell.x >= grid.x) return vec3(0.0);",
      "  return texture2D(tLed, (floor(cell) + 0.5) / grid).rgb;",
      "}",
      "void main() {",
      "  vec2 cell = vCell;",
      "  vec3 led = at(cell);",
      "  vec3 halo = led + at(cell + vec2(1.5, 1.5)) + at(cell + vec2(-1.5, 1.5)) + at(cell + vec2(1.5, -1.5)) + at(cell + vec2(-1.5, -1.5));",
      "  halo += at(cell + vec2(3.0, 0.0)) + at(cell + vec2(-3.0, 0.0)) + at(cell + vec2(0.0, 3.0)) + at(cell + vec2(0.0, -3.0));",
      "  halo /= 9.0;",
      "  float lens = texture2D(tDot, cell).r;",
      "  vec3 col = led * lens * 1.38 + halo * 0.34 + vec3(0.030, 0.034, 0.046) * lens + vec3(0.005, 0.006, 0.010);",
      "  gl_FragColor = vec4(col, 1.0);",
      "  #include <" + csChunk + ">",
      "}"
    ].join("\n")
  });
  const ledGeo = new T.PlaneGeometry(fw, LED_H);
  (function () { const p = ledGeo.attributes.position, uv = ledGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, (p.getX(i) + (STAND.x0 + STAND.x1) / 2) / LED_PITCH); })();
  const ledFace = new T.Mesh(ledGeo, ledMat); ledFace.position.set((STAND.x0 + STAND.x1) / 2, STAND.ledY + LED_H / 2, LED_Z); stad.add(ledFace);
  const ledHood = new T.Mesh(new T.BoxGeometry(fw, 0.12, 0.35), new T.MeshLambertMaterial({ color: 0x05070d })); ledHood.position.set(ledFace.position.x, STAND.ledY + LED_H + 0.1, LED_Z + 0.1); stad.add(ledHood);

  // the stands: one long step per row, seat backs painted on the riser
  const seatTex = tex(seatCanvas(), true), concrete = new T.MeshLambertMaterial({ color: 0x9aa3bd });
  for (let j = 0; j < STAND.rows; j++) {
    const y = STAND.deckY + j * STAND.rise, z = STAND.wallZ - 0.4 - j * STAND.tread;
    const geo = scaleUV(new T.BoxGeometry(fw, STAND.rise, STAND.tread * (STAND.rows - j)), fw / 8, 1);
    const riser = new T.MeshLambertMaterial({ map: seatTex });
    const m = new T.Mesh(geo, [navy, navy, concrete, navy, riser, navy]);
    m.position.set(pad.position.x, y + STAND.rise / 2, z - STAND.tread * (STAND.rows - j) / 2);
    stad.add(m);
  }
  const topY = STAND.deckY + STAND.rows * STAND.rise, backZ = STAND.wallZ - 0.4 - STAND.rows * STAND.tread;
  const rail = new T.Mesh(new T.BoxGeometry(fw, 1.2, 0.3), navy); rail.position.set(pad.position.x, topY + 0.6, backZ); stad.add(rail);
  const railTop = new T.Mesh(new T.BoxGeometry(fw, 0.16, 0.4), orange); railTop.position.set(pad.position.x, topY + 1.25, backZ); stad.add(railTop);
  const backWall = new T.Mesh(new T.PlaneGeometry(fw, 12), new T.MeshLambertMaterial({ color: 0x1b2f86 })); backWall.position.set(pad.position.x, topY + 1.2 + 6, backZ - 3); stad.add(backWall);
  const canopy = new T.Mesh(new T.BoxGeometry(fw, 0.6, 7), new T.MeshLambertMaterial({ color: 0xe8ecf6 })); canopy.position.set(pad.position.x, topY + 9, backZ + 1); stad.add(canopy);
  const canopyTrim = new T.Mesh(new T.BoxGeometry(fw, 0.5, 0.2), orange); canopyTrim.position.set(pad.position.x, topY + 8.9, backZ + 4.55); stad.add(canopyTrim);

  // jumbotrons hung under the canopy, light towers above it
  const jumboA = new T.MeshBasicMaterial({ map: tex(jumboCanvas(script, false)) }), jumboB = new T.MeshBasicMaterial({ map: tex(jumboCanvas(script, true)) });
  const frameMat = new T.MeshLambertMaterial({ color: 0x0b0c18 });
  for (let x = STAND.x0 + 30, i = 0; x < STAND.x1 - 10; x += 56, i++) {
    const jb = new T.Group(); jb.position.set(x, topY + 5.2, backZ + 2.6);
    const box = new T.Mesh(roundBox(T, 9.6, 5.6, 0.6, 0.2), [frameMat, frameMat, frameMat, frameMat, i % 2 ? jumboB : jumboA, frameMat]);
    jb.add(box);
    [-3, 3].forEach(function (dx) { const h = new T.Mesh(new T.BoxGeometry(0.16, 1.2, 0.16), frameMat); h.position.set(dx, 3.4, 0); jb.add(h); });
    stad.add(jb);
  }
  const glowMat = new T.SpriteMaterial({ map: tex(glowCanvas()), blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.75 });
  const lampMat = new T.MeshBasicMaterial({ map: tex(lampCanvas()) }), poleMat = new T.MeshLambertMaterial({ color: 0x2b3566 });
  for (let x = STAND.x0 + 58, i = 0; x < STAND.x1; x += 84, i++) {
    const g = new T.Group(); g.position.set(x, 0, backZ - 6);
    const pole = new T.Mesh(new T.CylinderGeometry(0.5, 0.9, 34, 8), poleMat); pole.position.y = 17; g.add(pole);
    const bank = new T.Mesh(new T.BoxGeometry(9, 4, 0.8), [poleMat, poleMat, poleMat, poleMat, lampMat, poleMat]); bank.position.set(0, 34, 0.5); bank.rotation.x = 0.35; g.add(bank);
    const glow = new T.Sprite(glowMat); glow.scale.set(30, 20, 1); glow.position.set(0, 34, 2); g.add(glow);
    stad.add(g);
  }

  /* the crowd: proportioned seated people, baked into four instanced pieces (shirt, pants, skin, hair) per 40 m of stands */
  const pgLow = personGeos(T, true);
  const fan = makePerson(T, pgLow, { shirt: 0xffffff, pants: 0xffffff, skin: 0xffffff, hair: 0xffffff, shoe: 0xffffff });
  seat(fan, 0.46);
  for (let s = 0; s < 2; s++) { fan.sh[s].rotation.x = -0.45; fan.sh[s].rotation.z = (s ? -1 : 1) * 0.08; fan.el[s].rotation.x = -0.85; }
  fan.root.updateMatrixWorld(true);
  const byPart = { shirt: [], pants: [], skin: [], hair: [] };
  fan.list.forEach(function (it) { byPart[it.part].push([it.mesh.geometry, it.mesh.matrixWorld.clone()]); });
  const fanGeo = {};
  for (const k in byPart) fanGeo[k] = mergeGeos(T, byPart[k]);
  const crowdU = { uTime: { value: 0 }, uCheer: { value: 0 } };
  function cheering(mat) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = crowdU.uTime; sh.uniforms.uCheer = crowdU.uCheer;
      sh.vertexShader = "uniform float uTime;\nuniform float uCheer;\n" + sh.vertexShader.replace("#include <begin_vertex>",
        "#include <begin_vertex>\n#ifdef USE_INSTANCING\n  float npPh = instanceMatrix[3].x * 0.71 + instanceMatrix[3].z * 0.37;\n" +
        "  float npUp = uCheer * (0.3 + 0.7 * abs(sin(uTime * 7.0 + npPh)));\n" +
        "  transformed.y += npUp * 0.32 * smoothstep(0.3, 0.9, transformed.y) + npUp * 0.06;\n" +
        "  transformed.x *= 1.0 + npUp * 0.25 * smoothstep(1.0, 1.25, transformed.y);\n#endif");
    };
    return mat;
  }
  const fanMats = { shirt: cheering(new T.MeshLambertMaterial({ color: 0xffffff })), pants: cheering(new T.MeshLambertMaterial({ color: 0xffffff })),
                    skin: cheering(new T.MeshLambertMaterial({ color: 0xffffff })), hair: cheering(new T.MeshLambertMaterial({ color: 0xffffff })) };
  const SHIRTS = ["#ff4b3e", "#16b9e8", "#ff3fa4", "#58c322", "#ffb81f", "#8a5cff", "#ffffff", "#ff9214", "#f4efdf", "#1b1c22", "#2fe6ff"];
  const PANTS = ["#2a3a6a", "#1b1c22", "#3b4a7a", "#5a4a3a", "#8a8f9c", "#2a2a3a"];
  const SKINS = ["#f1c7a0", "#d9a273", "#a8703f", "#f6d7b8", "#7b4f2c", "#c48a5a"];
  const HAIRS = ["#2a1a10", "#4a2a14", "#1b1c22", "#c89a50", "#8a4a20", "#6a6a6a", "#ff4b3e", "#16b9e8"];
  const crowd = [], rnd = rng(77);
  const CH = 40;
  for (let x0 = STAND.x0 + 2; x0 < STAND.x1 - 2; x0 += CH) {
    const at = [];
    for (let j = 0; j < STAND.rows; j++) {
      const y = STAND.deckY + (j + 1) * STAND.rise, z = STAND.wallZ - 0.4 - (j + 0.45) * STAND.tread;
      for (let x = x0 + rnd() * 0.4; x < Math.min(x0 + CH, STAND.x1 - 2); x += 0.78 + rnd() * 0.12) if (rnd() < 0.86) at.push([x, y, z]);
    }
    const n = at.length, chunk = {};
    const m = new T.Matrix4(), q = new T.Quaternion(), sc2 = new T.Vector3(), v = new T.Vector3(), col = new T.Color(), e = new T.Euler();
    for (const k in fanGeo) chunk[k] = new T.InstancedMesh(fanGeo[k], fanMats[k], n);
    for (let i = 0; i < n; i++) {
      const s = 0.92 + rnd() * 0.16;
      e.set(0, (rnd() - 0.5) * 0.5, 0); q.setFromEuler(e); sc2.set(s, s, s);
      m.compose(v.set(at[i][0], at[i][1], at[i][2]), q, sc2);
      for (const k in chunk) chunk[k].setMatrixAt(i, m);
      chunk.shirt.setColorAt(i, col.set(SHIRTS[Math.floor(rnd() * SHIRTS.length)]));
      chunk.pants.setColorAt(i, col.set(PANTS[Math.floor(rnd() * PANTS.length)]));
      chunk.skin.setColorAt(i, col.set(SKINS[Math.floor(rnd() * SKINS.length)]));
      chunk.hair.setColorAt(i, col.set(HAIRS[Math.floor(rnd() * HAIRS.length)]));
    }
    for (const k in chunk) { chunk[k].instanceMatrix.needsUpdate = true; chunk[k].instanceColor.needsUpdate = true; chunk[k].computeBoundingSphere(); stad.add(chunk[k]); crowd.push(chunk[k]); }
  }

  /* along the back of the course: tire stacks and wordmark boards */
  const tireStack = new T.TorusGeometry(0.42, 0.2, 6, 12); tireStack.rotateX(Math.PI / 2);
  const stackN = Math.floor((STAND.x1 - STAND.x0) / 2.6) * 2;
  const stacks = new T.InstancedMesh(tireStack, new T.MeshLambertMaterial({ color: 0x1d1e24 }), stackN);
  (function () {
    const m = new T.Matrix4(), v = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3(1, 1, 1);
    let i = 0;
    for (let x = STAND.x0; x < STAND.x1 && i < stackN; x += 2.6) for (let k = 0; k < 2 && i < stackN; k++, i++) { m.compose(v.set(x, FLOOR_Y + 0.2 + k * 0.38, -TRACK_W - 0.9), q, s); stacks.setMatrixAt(i, m); }
    stacks.count = i;
  })();
  stacks.castShadow = true; stacks.receiveShadow = true; stacks.instanceMatrix.needsUpdate = true; stacks.computeBoundingSphere(); scene.add(stacks);
  const boardMats = [0, 1, 2, 3].map(function (i) { return new T.MeshBasicMaterial({ map: tex(boardCanvas(script, i)) }); });
  const postMat = new T.MeshLambertMaterial({ color: 0xeef2ff });
  for (let x = STAND.x0 + 14, i = 0; x < STAND.x1; x += 34, i++) {
    const b = new T.Group(); b.position.set(x, FLOOR_Y, -TRACK_W - 3.4);
    const face = new T.Mesh(new T.PlaneGeometry(5.2, 2.6), boardMats[i % 4]); face.position.y = 2.7; b.add(face);
    const backing = new T.Mesh(new T.BoxGeometry(5.4, 2.8, 0.15), navy); backing.position.set(0, 2.7, -0.1); b.add(backing);
    [-2.2, 2.2].forEach(function (dx) { const p = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 1.4, 6), postMat); p.position.set(dx, 0.7, -0.1); b.add(p); });
    b.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    scene.add(b);
  }

  /* shared bits for the trucks and cars */
  const pg = personGeos(T, false);
  const K = { tex: tex, script: script, env: env, pg: pg,
    chrome: new T.MeshPhongMaterial({ color: 0xe2e8f2, specular: 0xffffff, shininess: 200, envMap: env, combine: T.AddOperation, reflectivity: 0.55 }),
    black: new T.MeshPhongMaterial({ color: 0x17181e, specular: 0x444444, shininess: 40 }),
    engineMat: new T.MeshPhongMaterial({ color: 0x9aa0ad, specular: 0xffffff, shininess: 120, envMap: env, combine: T.AddOperation, reflectivity: 0.4 }),
    tire: tireGeo(T), tireMat: new T.MeshPhongMaterial({ map: tex(tireCanvas()), specular: 0x333333, shininess: 14 }),
    dish: new T.CylinderGeometry(0.46, 0.46, 0.06, 24).rotateX(Math.PI / 2),
    ring: new T.TorusGeometry(0.46, 0.035, 8, 28), spoke: new T.BoxGeometry(0.06, 0.82, 0.04),
    carWheel: new T.CylinderGeometry(0.32, 0.32, 0.24, 14).rotateX(Math.PI / 2) };
  const trucks = TRUCKS.map(function (td) { const m = makeTruckModel(T, td, K); m.root.visible = false; scene.add(m.root); return m; });
  const shadowMat = new T.MeshBasicMaterial({ map: tex(shadowCanvas()), transparent: true, depthWrite: false, opacity: 0.6 });
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
  const blob = new T.Mesh(unit, shadowMat); blob.renderOrder = 4; blob.visible = false; scene.add(blob);

  /* the flagger at the finish line */
  const flagger = makePerson(T, pg, { shirt: 0xffffff, pants: 0x1b1c22, skin: 0xa8703f, hair: 0x1b1c22, sleeves: false });
  flagger.list.forEach(function (it) { it.mesh.castShadow = true; });
  const fstick = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.9, 6), K.black); fstick.position.y = -0.5;
  const fcloth = new T.Mesh(new T.PlaneGeometry(0.62, 0.44, 6, 2), new T.MeshLambertMaterial({ map: tex(checkerCanvas(), true), side: T.DoubleSide }));
  fcloth.position.set(0.33, -0.75, 0); fstick.add(fcloth);
  flagger.el[1].add(fstick); fstick.position.set(0, -0.33, 0.02); fstick.rotation.x = Math.PI / 2;
  const fclothBase = Float32Array.from(fcloth.geometry.attributes.position.array);
  scene.add(flagger.root);

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, key: key, script: script, env: env, tex: tex, K: K,
    tScript: tScript, plateTex: tex(plateCanvas(script)), checker: tex(checkerCanvas(), true), dirtTop: tex(dirtTopCanvas(), true), dirtSide: tex(dirtSideCanvas(), true),
    gantryStart: tex(gantryCanvas(script, "START")), gantryFinish: tex(gantryCanvas(script, "FINISH")),
    trucks: trucks, blob: blob, unit: unit, crowd: crowd, crowdU: crowdU, ledU: ledU, flagger: flagger, fcloth: fcloth, fclothBase: fclothBase,
    level: null, cars: [],
    camPos: new T.Vector3(0, 6, 25), camTgt: new T.Vector3(6, 2, 0), goalPos: new T.Vector3(), goalTgt: new T.Vector3(), v: new T.Vector3(), v2: new T.Vector3(),
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0, debugCam: null,
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, shadowsOn: true, crowdOn: 2, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
}

// Everything that belongs to one course: the dirt, the cars, the plates on the big ramps, the start and finish gantries.
function buildLevelMeshes(li) {
  const T = R.T, C = COURSE;
  if (R.level) {
    R.scene.remove(R.level);
    R.level.traverse(function (o) { if (o.isMesh) { if (o.userData.own) o.geometry.dispose(); } });
    R.cars.forEach(function (o) { o.capMat.map.dispose(); o.smashTex.dispose(); o.capMat.dispose(); });
  }
  const grp = new T.Group(); R.level = grp; R.cars = [];
  function own(m) { m.userData.own = true; return m; }
  // the dirt: a top that follows the course, and a front face down to the floor
  const pos = [], nor = [], uv = [], idx = [], n = C.n;
  for (let i = 0; i < n; i++) {
    const x = X0 + i * DX, h = C.terr[i], hl = C.terr[Math.max(0, i - 1)], hr = C.terr[Math.min(n - 1, i + 1)];
    const sl = (hr - hl) / (2 * DX), l = Math.hypot(sl, 1);
    pos.push(x, h, -TRACK_W, x, h, TRACK_W); nor.push(-sl / l, 1 / l, 0, -sl / l, 1 / l, 0); uv.push(x / 8, 0, x / 8, 1);
  }
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  const top = idx.length, t0 = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const x = X0 + i * DX, h = C.terr[i];
    pos.push(x, h, TRACK_W, x, FLOOR_Y, TRACK_W); nor.push(0, 0, 1, 0, 0, 1); uv.push(x / 6, (h - FLOOR_Y) / 3, x / 6, 0);
  }
  for (let i = 0; i < n - 1; i++) { const a = t0 + i * 2; idx.push(a + 1, a + 3, a, a, a + 3, a + 2); }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.addGroup(0, top, 0); geo.addGroup(top, idx.length - top, 1);
  geo.computeBoundingSphere();
  const dirt = own(new T.Mesh(geo, [new T.MeshLambertMaterial({ map: R.dirtTop }), new T.MeshLambertMaterial({ map: R.dirtSide })]));
  dirt.receiveShadow = true; dirt.castShadow = true;
  grp.add(dirt);
  // wordmark plates on the side of the big ramps
  const plateMat = new T.MeshLambertMaterial({ map: R.plateTex, transparent: true });
  C.marks.forEach(function (mk) {
    if (mk.h < 2.2) return;
    let x1 = 1e9, x2 = -1e9;
    for (let x = mk.x; x < mk.x + mk.len + 1.2; x += 0.1) if (terrX(x) >= mk.b + 1.7) { x1 = Math.min(x1, x); x2 = Math.max(x2, x); }
    if (x2 - x1 < 2.4) return;
    const ph = 1.25, pw = Math.min(x2 - x1 - 0.4, ph * 512 / 224);
    const m = own(new T.Mesh(new T.PlaneGeometry(pw, ph), plateMat));
    m.position.set((x1 + x2) / 2, mk.b + 0.22 + ph / 2, TRACK_W + 0.02); m.renderOrder = 2;
    grp.add(m);
  });
  // a checkered line across the dirt at the finish
  const line = own(new T.Mesh(new T.PlaneGeometry(1.2, TRACK_W * 2).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ map: R.checker, polygonOffset: true, polygonOffsetFactor: -2 })));
  line.material.map.repeat.set(1, 1);
  (function () { const u = line.geometry.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 1.2, u.getY(i) * TRACK_W * 2); })();
  line.position.set(C.finishX, terrX(C.finishX) + 0.03, 0); line.receiveShadow = true; grp.add(line);
  // start and finish gantries: a banner on the far side facing the camera, a truss across the dirt
  function gantry(x, texture) {
    const g = new T.Group(); g.position.set(x, terrX(x), 0);
    const post = R.K.chrome, navy = new T.MeshLambertMaterial({ color: 0x16245e });
    const banner = own(new T.Mesh(new T.PlaneGeometry(8, 2.5), new T.MeshBasicMaterial({ map: texture })));
    banner.position.set(0, 6.6, -TRACK_W - 0.6); g.add(banner);
    const back = own(new T.Mesh(new T.BoxGeometry(8.3, 2.8, 0.2), navy)); back.position.set(0, 6.6, -TRACK_W - 0.75); g.add(back);
    [-3.9, 3.9].forEach(function (dx) { const p = own(new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 8.1, 10), post)); p.position.set(dx, 4.05, -TRACK_W - 0.75); p.castShadow = true; g.add(p); });
    const truss = own(new T.Mesh(new T.BoxGeometry(0.4, 0.5, TRACK_W * 2 + 1.2), navy)); truss.position.set(0, 8.25, -0.45); truss.castShadow = true; g.add(truss);
    const strip = own(new T.Mesh(new T.PlaneGeometry(TRACK_W * 2 + 1.2, 0.5), new T.MeshBasicMaterial({ map: R.checker })));
    strip.rotation.y = Math.PI / 2; strip.position.set(0.21, 8.25, -0.45);
    (function () { const u = strip.geometry.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 13, u.getY(i)); })();
    g.add(strip);
    grp.add(g);
    return g;
  }
  gantry(11, R.gantryStart); gantry(C.finishX, R.gantryFinish);
  // the cars
  C.cars.forEach(function (car) { const o = makeCarModel(T, car, R.K); grp.add(o.g); R.cars.push(o); shapeCar(o); });
  // the flagger stands on the floor, out in front, just past the line
  R.flagger.root.position.set(C.finishX + 11, FLOOR_Y, TRACK_W + 1.7);
  R.flagger.root.rotation.y = -0.5;
  R.scene.add(grp);
  R.dirty = true;
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
// pr = pixel ratio cap, sh = shadow map size (0 = a painted blob stands in), crowd: 2 all, 1 thinned, 0 empty seats
const QUALITY = [{ pr: 2, sh: 2048, crowd: 2 }, { pr: 1.5, sh: 1024, crowd: 2 }, { pr: 1.15, sh: 0, crowd: 1 }, { pr: 1, sh: 0, crowd: 0 }];
function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  const Q = QUALITY[R.quality], on = Q.sh > 0;
  if (on && R.key.shadow.mapSize.x !== Q.sh) { R.key.shadow.mapSize.set(Q.sh, Q.sh); if (R.key.shadow.map) { R.key.shadow.map.dispose(); R.key.shadow.map = null; } }
  if (on !== R.shadowsOn) { R.shadowsOn = on; R.key.castShadow = on; }
  if (Q.crowd !== R.crowdOn) {
    R.crowdOn = Q.crowd;
    for (let i = 0; i < R.crowd.length; i++) R.crowd[i].visible = Q.crowd === 2 || (Q.crowd === 1 && Math.floor(i / 4) % 2 === 0);
  }
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
  if (left !== R.left || top !== R.top) { R.left = left; R.top = top; R.gl.style.left = left + "px"; R.gl.style.top = top + "px"; }
  return true;
}
function camShake(mag, dur) {
  if (!R || Shell.reduced) return;
  R.shakeMag = Math.max(R.shakeT > 0 ? R.shakeMag : 0, mag); R.shakeDur = R.shakeT = dur;
}
function toScreen(x, y, z) {
  R.v.set(x, y, z).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1 };
}

/* ---------------- Game state -> meshes ---------------- */
const CAM = { dist: 31, yaw: 0.17, lift: 4.2, ahead: 1.3, rise: 1.4 };
const FLOOR_Y = -0.7;                                       // the arena floor sits a little below the dirt course, so the course reads as a berm
function syncScene(state, fdt) {
  const T3 = R.T, idle = state === "title" || state === "over", calm = Shell.reduced;
  const Tk = S.truck;
  R.clock += fdt;

  /* the truck: the chosen one shows, posed from the physics */
  for (let i = 0; i < R.trucks.length; i++) R.trucks[i].root.visible = i === pick;
  const M = R.trucks[pick], ca = Math.cos(Tk.a), sa = Math.sin(Tk.a);
  M.root.position.set(Tk.x, Tk.y, 0);
  M.root.rotation.z = Tk.a;
  for (let k = 0; k < 2; k++) {
    const wh = Tk.wh[k], dx = wh.x - Tk.x, dy = wh.y - Tk.y;
    const lx = ca * dx + sa * dy, ly = -sa * dx + ca * dy;          // wheel center in the truck's own frame
    M.axles[k].position.set(lx, ly, 0);
    M.axles[k].rotation.z = 0;
  }
  for (let i = 0; i < M.wheels.length; i++) { const w = M.wheels[i]; w.spin.rotation.z = Tk.wh[w.k].spin; }
  for (let i = 0; i < M.shocks.length; i++) {
    const s = M.shocks[i], ax = M.axles[s.k].position, top = (s.k ? -WB : WB) + s.dx * 0.6;
    bone(s.m, ax.x + s.dx, ax.y + 0.12, s.z, top, ANC_Y + 0.38, s.z * 0.95, s.r);
  }
  for (let i = 0; i < M.links.length; i++) {
    const l = M.links[i], ax = M.axles[l.k].position, fx = (l.k ? -1 : 1) * 0.35;
    bone(l.m, ax.x, ax.y - 0.05, l.z, fx, -0.26, l.z * 0.9, 0.055);
  }
  // the driver rides it: head and shoulders lag a touch behind the truck's pitch
  M.driver.spine.rotation.x = clamp(-Tk.w * 0.03, -0.12, 0.12);
  M.driver.head.rotation.x = clamp(-Tk.w * 0.05, -0.2, 0.2);
  M.flag.rotation.y = calm ? 0 : Math.sin(R.clock * 9) * 0.25 + 0.2;
  for (let i = 0; i < M.lamps.length; i++) M.lamps[i].material.color.setScalar(S.phase === "race" && !calm && (Math.floor(R.clock * 6) + i) % 2 ? 1 : 0.85);

  /* cars bend as they're crushed */
  for (let i = 0; i < R.cars.length; i++) shapeCar(R.cars[i]);

  /* the flagger: arm down, then the checkered flag waving overhead at the finish */
  const F = R.flagger, waving = S.phase === "finish" || (S.phase === "over" && S.cleared > 0) || idle;
  V.flagWave += ((waving ? 1 : 0) - V.flagWave) * Math.min(1, fdt * 4);
  const wv = V.flagWave, sw = calm ? 0 : Math.sin(R.clock * 7);
  F.sh[1].rotation.z = -wv * (2.5 + sw * 0.35); F.sh[1].rotation.x = -0.2 * wv;
  F.el[1].rotation.x = -0.3 - wv * 0.25;
  F.sh[0].rotation.z = 0.12; F.sh[0].rotation.x = 0.1;
  if (!calm) {
    const p = R.fcloth.geometry.attributes.position, b = R.fclothBase;
    for (let i = 0; i < p.count; i++) { const x = b[i * 3] + 0.31; p.setZ(i, Math.sin(x * 9 - R.clock * 12) * x * 0.12); }
    p.needsUpdate = true;
  }

  /* the crowd jumps on the big moments */
  V.cheer = Math.max(0, (V.cheer || 0) - fdt * 0.45);
  R.crowdU.uTime.value = R.clock; R.crowdU.uCheer.value = calm ? 0 : Math.min(1, V.cheer * 1.2);

  /* camera */
  const cp = R.camPos, ct = R.camTgt, gp = R.goalPos, gt = R.goalTgt;
  let rate = 4.5;
  const ground = terrX(Tk.x);
  if (R.debugCam) { gp.fromArray(R.debugCam, 0); gt.fromArray(R.debugCam, 3); V.snap = true; }
  else if (state === "title") {                             // showroom: a slow turn around the chosen truck
    const a = calm ? 0.6 : 0.6 + Math.sin(idleT * 0.22) * 0.55;
    gt.set(Tk.x + 0.6, Tk.y + 0.3, 0);
    gp.set(Tk.x + Math.sin(a) * 10.5, Tk.y + 2.4, Math.cos(a) * 10.5);
    rate = 3;
  } else if (S.phase === "intro" && !idle) {                // swing in from wide to the chase
    const k = clamp(S.pt / 1.6, 0, 1), e = k * k * (3 - 2 * k);
    gt.set(Tk.x + CAM.ahead * e + 10 * (1 - e), Tk.y + CAM.rise, 0);
    gp.set(gt.x - Math.sin(CAM.yaw) * CAM.dist + 12 * (1 - e), gt.y + CAM.lift + 6 * (1 - e), Math.cos(CAM.yaw) * CAM.dist + 14 * (1 - e));
    rate = 6;
  } else if (S.phase === "finish") {                        // round to the front as it pulls up
    gt.set(Tk.x + 1.8, Tk.y - 3.4, 3);
    gp.set(Tk.x + 7.5, Tk.y + 1.2, 21);
    rate = 2.2;
  } else {
    const hAbove = Math.max(0, Tk.y - ground - 1.9);
    const ahead = CAM.ahead + clamp(Tk.vx * 0.08, -1.5, 1.6);
    const dist = CAM.dist + Math.min(9, hAbove * 0.7) + Math.min(3, Math.abs(Tk.vx) * 0.1);
    gt.set(Tk.x + ahead, Math.max(Tk.y - hAbove * 0.35, ground + 1.6) + CAM.rise, 0);
    gp.set(gt.x - Math.sin(CAM.yaw) * dist, gt.y + CAM.lift + hAbove * 0.1, Math.cos(CAM.yaw) * dist);
    rate = 4;
  }
  if (V.snap) { cp.copy(gp); ct.copy(gt); V.snap = false; }
  else { const k = 1 - Math.exp(-rate * fdt); cp.lerp(gp, k); ct.lerp(gt, k); }
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (Math.random() * 2 - 1) * m; sy = (Math.random() * 2 - 1) * m;
  }
  R.camera.position.set(cp.x + sx, cp.y + sy, cp.z);
  R.camera.lookAt(ct.x + sx, ct.y + sy, ct.z);
  R.camera.updateMatrixWorld();

  /* the LED canvas covers the stretch of wall straight ahead of the camera */
  const dir = R.v2.set(ct.x - cp.x, ct.y - cp.y, ct.z - cp.z);
  const tw = dir.z < -1e-3 ? (LED_Z - cp.z) / dir.z : 40;
  const wx = cp.x + dir.x * tw;
  const c0 = Math.floor(wx / LED_PITCH) - LED_COLS / 2;
  ledTick(fdt, c0);
  R.ledU.c0.value = c0;

  /* shadows ride with the truck */
  R.key.position.set(Tk.x - 14, Tk.y + 26, 18); R.key.target.position.set(Tk.x + 2, Tk.y - 1, 0); R.key.target.updateMatrixWorld();
  R.blob.visible = !R.shadowsOn;
  if (R.blob.visible) {
    const hg = Math.max(0, Tk.y - ground - 1.8), k = clamp(1 - hg / 12, 0.35, 1);
    R.blob.position.set(Tk.x + 0.4, surfX(Tk.x) + 0.05, 0.3); R.blob.scale.set(6.4 * k, 1, 3.6 * k); R.blob.material.opacity = 0.6 * k;
  }
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
function fmtScore(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

function drawHUD(c, state) {
  const bg = c.createLinearGradient(0, 0, 0, 48);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, 0, W, 48);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff9214"; c.fillRect(0, 48, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, 50, W, 1);
  txt(c, "LEVEL " + (S.level + 1) + "/" + LEVELS.length, 8, 6, 9, "#a8ecff", "left", "#08205f");
  const nm = LEVELS[S.level].name.toUpperCase();
  let ns = 11; c.font = "bold " + ns + "px " + HUD_FONT; while (c.measureText(nm).width > 116 && ns > 8) { ns--; c.font = "bold " + ns + "px " + HUD_FONT; }
  txt(c, nm, 8, 21, ns, "#ffe45c", "left", "#08205f");
  txt(c, TRUCKS[pick].name, 8, 35, 8, "#ffffff", "left", "#08205f");
  txt(c, "SCORE", W / 2, 6, 9, "#a8ecff", "center", "#08205f");
  txt(c, fmtScore(S.score), W / 2, 19, 19, "#ffffff", "center", "#08205f");
  const tl = Math.max(0, S.time), low = tl < 10 && S.phase === "race";
  const blink = low && !Shell.reduced && Math.floor(S.t * 4) % 2 === 0;
  txt(c, "TIME", W - 8, 6, 9, "#a8ecff", "right", "#08205f");
  txt(c, tl.toFixed(1), W - 8, 19, 19, blink ? "#ffffff" : low ? "#ff6a5a" : "#ffe45c", "right", "#08205f");
  // how far along the course
  const x0 = 10, x1 = W - 22, y = 56, sx = 6, fx = COURSE.finishX;
  rrect(c, x0 - 2, y - 2, x1 - x0 + 4, 8, 4); c.fillStyle = "rgba(8,32,95,.75)"; c.fill();
  const P = function (x) { return x0 + clamp((x - sx) / (fx - sx), 0, 1) * (x1 - x0); };
  COURSE.cars.forEach(function (car) { c.fillStyle = car.crushed ? "rgba(255,154,60,.55)" : "#ff9a3c"; c.fillRect(P(car.x0 + car.len / 2) - 1, y, 2, 4); });
  const tp = P(S.truck.x);
  c.fillStyle = "#3ff0ff"; c.fillRect(x0, y + 1, tp - x0, 2);
  c.fillStyle = "#ffffff"; c.beginPath(); c.arc(tp, y + 2, 3.5, 0, TAU); c.fill();
  for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) { c.fillStyle = (k + j) % 2 ? "#111" : "#fff"; c.fillRect(x1 + 4 + k * 3, y - 2 + j * 4, 3, 4); }
  if (S.combo > 1 && S.comboT > 0 && state === "playing") txt(c, "CRUSH COMBO x" + S.combo, W / 2, 66, 11, "#ff9a3c", "center", "#08205f");
}

// The pedals and the lean buttons. Drawn on top of everything while a course is on.
function drawPads(c) {
  const coarse = touch.seen || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  const base = coarse ? 1 : 0.72;
  function lean(p, on, dir) {
    c.globalAlpha = base;
    c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU);
    const gr = c.createLinearGradient(0, p.y - p.r, 0, p.y + p.r);
    gr.addColorStop(0, on ? "#ffe45c" : "#3d8cff"); gr.addColorStop(1, on ? "#ff9214" : "#0b3aa6");
    c.fillStyle = gr; c.fill();
    c.lineWidth = 2.5; c.strokeStyle = "#ffffff"; c.stroke();
    c.lineWidth = 4; c.strokeStyle = on ? "#08205f" : "#ffffff"; c.lineCap = "round";
    c.beginPath(); c.arc(p.x, p.y, p.r * 0.48, dir > 0 ? -0.2 : Math.PI + 0.2, dir > 0 ? Math.PI * 1.1 : -0.1 * Math.PI, dir > 0); c.stroke();
    const ea = dir > 0 ? Math.PI * 1.1 : -0.1 * Math.PI, ex = p.x + Math.cos(ea) * p.r * 0.48, ey = p.y + Math.sin(ea) * p.r * 0.48;
    c.fillStyle = on ? "#08205f" : "#ffffff";
    c.beginPath(); c.moveTo(ex + (dir > 0 ? -7 : 7), ey - 3); c.lineTo(ex + (dir > 0 ? 3 : -3), ey - 9); c.lineTo(ex + (dir > 0 ? 4 : -4), ey + 4); c.closePath(); c.fill();
    txt(c, dir > 0 ? "BACK" : "FWD", p.x, p.y + p.r + 2, 8, "#ffffff", "center", "#08205f");
  }
  function pedal(p, on, label, col) {
    c.globalAlpha = base;
    rrect(c, p.x, p.y, p.w, p.h, 10);
    const gr = c.createLinearGradient(0, p.y, 0, p.y + p.h);
    gr.addColorStop(0, on ? "#ffffff" : shade(col, 0.25)); gr.addColorStop(1, on ? col : shade(col, -0.35));
    c.fillStyle = gr; c.fill();
    c.lineWidth = 2.5; c.strokeStyle = "#ffffff"; c.stroke();
    c.fillStyle = "rgba(0,0,0,.22)"; for (let yy = p.y + 14; yy < p.y + p.h - 22; yy += 9) c.fillRect(p.x + 9, yy, p.w - 18, 4);
    txt(c, label, p.x + p.w / 2, p.y + p.h - 17, 11, "#ffffff", "center", "#08205f");
  }
  const kb = keys;
  lean(PADS.back, touch.back || kb.ArrowLeft || kb.KeyA, 1);
  lean(PADS.fwd, touch.fwd || kb.ArrowRight || kb.KeyD, -1);
  pedal(PADS.brake, touch.brake || kb.ArrowDown || kb.KeyS, "BRAKE", "#ff4b3e");
  pedal(PADS.gas, touch.gas || kb.ArrowUp || kb.KeyW || kb.Space, "GAS", "#2fbf5a");
  c.globalAlpha = 1;
}

function drawWorldParts(c) {
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    if (!q.w) continue;
    const p = toScreen(q.x, q.y, q.z);
    if (!p.ok) continue;
    const e = toScreen(q.x + q.s, q.y, q.z), r = Math.max(0.8, Math.abs(e.x - p.x));
    if (q.kind === "dust") { c.globalAlpha = clamp(q.life * 0.6, 0, 0.38); c.fillStyle = "#c8945e"; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.fill(); }
    else { c.globalAlpha = clamp(q.life * 2, 0, 1); c.fillStyle = q.kind === "glass" ? "#bfe6ff" : "#ffd23f"; c.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4); }
  }
  c.globalAlpha = 1;
}
function drawFloats(c) {
  for (let i = 0; i < floats.length; i++) {
    const f = floats[i], y = 92 + i * 20 - f.t * 10;
    c.globalAlpha = clamp((1.6 - f.t) * 2.5, 0, 1);
    txt(c, f.txt, W / 2, y, 13, f.col, "center", "#08205f");
  }
  c.globalAlpha = 1;
}
function drawTally(c) {
  const t = S.tally;
  if (!t) return;
  const k = clamp(t.t / 0.35, 0, 1), y0 = 300 - (1 - k) * 30;
  c.globalAlpha = k;
  rrect(c, 34, y0, W - 68, 168, 14);
  const bg = c.createLinearGradient(0, y0, 0, y0 + 168); bg.addColorStop(0, "rgba(27,95,224,.94)"); bg.addColorStop(1, "rgba(11,58,166,.94)");
  c.fillStyle = bg; c.fill(); c.lineWidth = 3; c.strokeStyle = "#ff9214"; c.stroke();
  drawScript(c, R.script, W / 2, y0 + 24, 150, 34);
  txt(c, t.last ? "RALLY COMPLETE" : "COURSE CLEAR", W / 2, y0 + 44, 15, "#ffe45c", "center", "#08205f");
  const rowY = y0 + 70, cnt = clamp((t.t - 0.5) / 0.6, 0, 1);
  function line(a, b, n) { txt(c, a, 52, rowY + n * 19, 11, "#ffffff", "left", "#08205f"); txt(c, b, W - 52, rowY + n * 19, 11, "#ffffff", "right", "#08205f"); }
  line("Time left", t.left.toFixed(1) + " s", 0);
  line("Time bonus", "+" + fmtScore(Math.round(t.left * PTS.timeSec * cnt)), 1);
  line("Finish bonus", "+" + PTS.finish, 2);
  line("Cars crushed", t.crushed + " of " + t.total, 3);
  txt(c, t.last ? "Final scores next" : "Next: " + LEVELS[S.level + 1].name, W / 2, y0 + 148, 10, "#a8ecff", "center", "#08205f");
  c.globalAlpha = 1;
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
  if (state === "title") return;                           // the title card sits over the showroom
  drawWorldParts(c);
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    if (q.w) continue;
    c.save(); c.translate(q.x, q.y); c.rotate(q.rot);
    c.globalAlpha = clamp(q.life * 2, 0, 1);
    c.fillStyle = q.c; c.fillRect(-2.5, -1.5, 5, 3);
    c.restore();
  }
  c.globalAlpha = 1;
  drawHUD(c, state);
  drawFloats(c);
  if (S.phase === "intro" && state === "playing") {
    const k = Math.floor(S.pt / 0.75);
    if (k >= 1 && k <= 3) { const f = (S.pt / 0.75) % 1; c.globalAlpha = 1 - f * 0.6; txt(c, String(4 - k), W / 2, 112 - f * 8, 64, "#ffe45c", "center", "#08205f"); c.globalAlpha = 1; }
    else if (k < 1) { txt(c, "LEVEL " + (S.level + 1), W / 2, 120, 22, "#ffffff", "center", "#08205f"); txt(c, LEVELS[S.level].name.toUpperCase(), W / 2, 148, 16, "#ffe45c", "center", "#08205f"); }
  }
  if (S.phase === "finish") drawTally(c);
  if (state === "playing" && (S.phase === "race" || S.phase === "intro" || S.phase === "flipped")) drawPads(c);
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
  const bar = document.createElement("div");
  bar.style.cssText = "width:min(60vw,240px);height:6px;border-radius:3px;background:rgba(255,255,255,.18);overflow:hidden";
  const fillEl = document.createElement("div");
  fillEl.style.cssText = "width:8%;height:100%;background:linear-gradient(90deg,#ff9214,#ffe45c);transition:width .3s ease";
  bar.appendChild(fillEl); el.appendChild(bar);
  document.body.appendChild(el);
  return { el: el, img: img, fill: fillEl };
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
function logoImg(maxPx) {
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
  im.style.cssText = "display:block;width:clamp(56px,12vh," + maxPx + "px);height:auto;margin:0 auto 4px";
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_URL;
  return im;
}

// The truck picker on the title card: three buttons, and the chosen truck's ratings under them.
function truckPicker(card, before) {
  const box = document.createElement("div");
  box.style.cssText = "margin:8px 0 6px;text-align:center";
  const head = document.createElement("p");
  head.className = "np-kicker"; head.textContent = "Pick your truck"; head.style.margin = "0 0 5px";
  box.appendChild(head);
  const rowEl = document.createElement("div");
  rowEl.setAttribute("role", "radiogroup"); rowEl.setAttribute("aria-label", "Pick your truck");
  rowEl.style.cssText = "display:flex;gap:5px";
  const btns = TRUCKS.map(function (td, i) {
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("role", "radio");
    b.textContent = td.name;
    b.style.cssText = "flex:1;min-width:0;padding:7px 2px;border-radius:8px;font:bold 10px/1.15 " + HUD_FONT.replace(/"/g, "'") + ";cursor:pointer;" +
      "border:2px solid " + td.body + ";color:#ffffff;white-space:normal";
    b.addEventListener("click", function (e) { e.stopPropagation(); Sound.unlock(); choose(i); const go = card.querySelector(".np-primary"); if (go) { try { go.focus({ preventScroll: true }); } catch (err) { go.focus(); } } });
    rowEl.appendChild(b);
    return b;
  });
  box.appendChild(rowEl);
  const stats = document.createElement("div");
  stats.style.cssText = "display:flex;justify-content:center;gap:10px;margin-top:6px;font:bold 9px " + HUD_FONT.replace(/"/g, "'") + ";color:#c9ccd6";
  box.appendChild(stats);
  const tag = document.createElement("p");
  tag.style.cssText = "margin:4px 0 0;font-size:10px;color:#a8ecff";
  box.appendChild(tag);
  card.insertBefore(box, before || null);
  function paint() {
    btns.forEach(function (b, i) {
      const on = i === pick, td = TRUCKS[i];
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.style.background = on ? "linear-gradient(" + td.body2 + "," + td.body + ")" : "rgba(255,255,255,.06)";
      b.style.textShadow = on ? "0 1px 0 #08205f" : "none";
    });
    const td = TRUCKS[pick], names = ["SPEED", "GRIP", "AIR"];
    stats.innerHTML = names.map(function (n, k) {
      let s = '<span>' + n + ' <span aria-hidden="true">';
      for (let j = 0; j < 5; j++) s += '<b style="display:inline-block;width:6px;height:8px;margin-left:1px;vertical-align:-1px;background:' + (j < td.bars[k] ? td.body2 : "rgba(255,255,255,.18)") + '"></b>';
      return s + '</span><span style="position:absolute;left:-9999px">' + td.bars[k] + ' of 5</span></span>';
    }).join("");
    tag.textContent = td.tag;
  }
  function choose(i) {
    pick = (i + TRUCKS.length) % TRUCKS.length;
    try { Shell.save("truck", pick); } catch (e) { /* private mode */ }
    paint();
    if (R) R.dirty = true;
    Shell.sfx("click");
  }
  paint();
  return { choose: choose };
}

function startGame() {
  Shell.init({
    slug: "monster-truck-rally",
    title: "MONSTER TRUCK RALLY",
    accent: "#ff9214",
    width: W, height: H,
    format: function (n) { return fmtScore(n) + " PTS"; },
    howTo: "Eight courses of dirt, ramps and junk cars in real 3D. Hold GAS, lean in the air to land on all four wheels, and crush every car you can before the clock runs out.",
    keys: "Keys: up or W gas, down or S brake and reverse, left and right (A, D) lean. P pause, M mute, N music, R restart.",
    tip: "Rolling over costs 5 seconds. Clean landings, big air and flips all score.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; updateParts(dt); },
    onPause: function () { keys = {}; touch.ptrs = {}; touchSync(); }
  });
  attach();
  bindTouch(R.hud);
  // Sound. Nothing is created until the first tap, click or key press.
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Sound.unlock, true); });
  Shell.onStart(Sound.newGame); Shell.onRestart(Sound.newGame); Shell.onResume(Sound.unlock);
  let picker = null;
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "KeyN" && !e.repeat) Sound.toggleMusic();
    if (picker && Shell.state() === "title" && (e.code === "ArrowLeft" || e.code === "ArrowRight")) { e.preventDefault(); picker.choose(pick + (e.code === "ArrowLeft" ? -1 : 1)); }
  });
  Sound.barButton();
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) {
    titleCard.insertBefore(logoImg(92), titleCard.firstChild);
    picker = truckPicker(titleCard, titleCard.querySelector(".np-best"));
    Sound.button(titleCard, titleCard.querySelector(".np-tip"));
  }
  if (pauseActions) Sound.button(pauseActions, pauseActions.querySelector("a"));
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) card.insertBefore(logoImg(104), card.firstChild);
}

// Hooks for automated checks (no effect on play unless a check turns them on)
let BOT = null, FREEZE = false, STEPPING = false;
window.__mtr = { S: function () { return S; }, course: function () { return COURSE; }, gfx: function () { return R; }, led: function () { return LED; },
  sound: Sound, levels: LEVELS, trucks: TRUCKS, view: function () { return V; }, toScreen: toScreen, surf: surfX, update: update, loadLevel: loadLevel,
  touch: function () { return touch; }, setBot: function (f) { BOT = f; }, freeze: function (on) { FREEZE = !!on; },
  step: function (n, dt) { STEPPING = true; try { for (let i = 0; i < n; i++) update(dt || 1 / 60); } finally { STEPPING = false; } }, pick: function (i) { if (i != null) pick = i; return pick; }, startMusic: startMusic };

(function boot() {
  const splash = makeSplash();
  const t0 = performance.now();
  const q = /[?&]gfx=(high|low)/.exec(location.search);
  try { const v = Number(localStorage.getItem("npArcade.monster-truck-rally.truck")); if (v >= 0 && v < TRUCKS.length) pick = Math.floor(v); } catch (e) { /* private mode */ }
  let steps = 0;
  function progress() { steps++; splash.fill.style.width = Math.min(100, 8 + steps * 30) + "%"; }
  Promise.all([loadLogo(splash).then(function (r) { progress(); return r; }),
               import(THREE_URL).then(function (m) { progress(); return m; }, function (e) { e.npStage = "three"; throw e; }),
               loadImage(SCRIPT_URL).then(function (r) { progress(); return r; })])
    .then(function (res) {
      THREE = res[1];
      try { R = buildScene(THREE, res[2]); } catch (e) { e.npStage = "webgl"; throw e; }
      if (q) { R.qLock = true; setQuality(q[1] === "low" ? QUALITY.length - 1 : 0); }
      reset();
      splash.fill.style.width = "100%";
      try { R.renderer.compile(R.scene, R.camera); } catch (e) { /* warm-up only */ }
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
        ? "Monster Truck Rally could not load its 3D engine (" + THREE_URL + ")."
        : "Monster Truck Rally needs WebGL for its 3D stadium, and this browser has it switched off or does not support it.");
    });
})();
