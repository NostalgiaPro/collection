/* BATTLE KARTS (3D): six karts, three laps, prize cubes full of trouble.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of scaling and the title / pause / game over flow, and carries the HUD and the
   on-screen touch controls.

   Everything here is original: the karts, the drivers, the tracks, the items, the music.
   Units are meters and seconds. A track is a closed loop: a centerline sampled every meter,
   with the road HW meters either side of it and a wall of props at WALL meters. A spot on a
   track is (s, d): s = meters along the loop from the start line, d = meters right of center.
   In three.js space the ground is the x-z plane and y is up.

   Trophy ids (add these to shared/trophy-list.js under "battle-karts"):
     bk-win    "Checkered Flag"      Win a race.
     bk-hits5  "Bumper Crop"         Land 5 hits in one race.
     bk-turbo  "Orange Sparks"       Fire an orange mini-turbo off a long drift.
     bk-block  "Bubble Wrap"         Block a hit with the Bubble Shield.
     bk-clean  "Not a Scratch"       Win a race without getting hit.
     bk-tour   "Grand Tour"          Win on all three tracks. */

const W = 360, H = 540, TAU = Math.PI * 2;
const SLUG = "battle-karts";
const LAPS = 3, KARTS = 6;
const HW = 6, WALL = 9, KART_R = 0.95;                    // road half width, wall line, kart bumper radius
const V_MAX = 24, ACC = 15, BRK = 30, REV = -7, DRAG = 2.4;
const TURN = 2.35, TURN_FALL = 0.36;                      // steering rate, and how much of it fades at top speed
const GRIP = 11, DRIFT_GRIP = 4.4, DRIFT_MIN_V = 11;
const MT1 = 0.7, MT2 = 1.55;                              // seconds of drifting for a blue / an orange mini-turbo
const BOOST_V = 7.5, OFF_MUL = 0.58;
const SPIN_T = 1.15, INV_T = 1.5, SHIELD_T = 8, TURBO_T = 1.5;
const PIN_V = 36, PIN_R = 0.48, PIN_LIFE = 4.6, TAPE_R = 1.15, TAPE_LIFE = 30;
const BOX_R = 1.7, BOX_BACK = 3.2;                        // pickup reach, seconds until a prize cube comes back
const COUNT_T = 3.6;                                      // countdown: 3 at 0.6s, 2 at 1.6s, 1 at 2.6s, GO at 3.6s
const PLACE_PTS = [5000, 3500, 2500, 1800, 1200, 800], HIT_PTS = 300, TIME_PTS = 50;
const STEP = 1 / 120;

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash, title card and score card
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every sign, board and kart on the tracks
const THREE_URL = "../shared/three.module.min.js";
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';

/* ---------------- Tracks ---------------- */
// Control points of each closed loop (meters). The start line is at the first point, racing toward the second.
const TRACKS = [
  { id: "canyon", name: "CARTRIDGE CANYON", tag: "Sunbaked sand and giant carts", par: 70,
    ctrl: [[-30, 0], [22.5, 0], [60, 0], [86.25, -9], [97.5, -33.75], [86.25, -60], [60, -67.5], [41.25, -52.5], [30, -33.75],
           [11.25, -28.5], [-11.25, -41.25], [-22.5, -67.5], [-48.75, -78.75], [-75, -63.75], [-81, -33.75], [-63.75, -9]] },
  { id: "rewind", name: "REWIND RACEWAY", tag: "Neon night on the tape deck strip", par: 84,
    ctrl: [[-45, 0], [30, 0], [75, 6], [112.5, -11.25], [123.75, -45], [105, -75], [67.5, -82.5], [45, -105], [7.5, -112.5],
           [-30, -97.5], [-45, -71.25], [-71.25, -61.5], [-101.25, -66], [-121.5, -41.25], [-105, -11.25]] },
  { id: "arcade", name: "ARCADE AFTER HOURS", tag: "Tokens, cabinets and a carpet that never ends", par: 88,
    ctrl: [[-22.5, 0], [30, 0], [56.25, -7.5], [66, -30], [48.75, -46.5], [21, -43.5], [6, -58.5], [11.25, -82.5], [41.25, -91.5],
           [69, -81], [91.5, -96], [95.25, -123.75], [69, -140.25], [22.5, -136.5], [-22.5, -129], [-54, -108.75], [-63, -81],
           [-54, -60], [-60, -36], [-51, -10.5]] }
];

// The field: the player and five originals. Kart color, suit, helmet, skin, number.
const DRIVERS = [
  { name: "YOU", short: "YOU", kart: "#ff9214", trim: "#0d1f5c", suit: "#1b56cf", helmet: "#ffffff", visor: "#ff9214", skin: "#e0a070", num: "1" },
  { name: "ROXY REWIND", short: "ROXY", kart: "#ff3fa4", trim: "#ffffff", suit: "#2b1446", helmet: "#ff3fa4", visor: "#1a1030", skin: "#f1c7a0", num: "7" },
  { name: "MACK CASSETTE", short: "MACK", kart: "#16b9e8", trim: "#0b1f5e", suit: "#f4efdf", helmet: "#16b9e8", visor: "#10131c", skin: "#7b4f2c", num: "3" },
  { name: "DUSTY CARTRIDGE", short: "DUSTY", kart: "#ffd21f", trim: "#7a3a12", suit: "#7a3a12", helmet: "#ffd21f", visor: "#2a1606", skin: "#d9a273", num: "5" },
  { name: "BENNY BITMAP", short: "BENNY", kart: "#58c322", trim: "#ffffff", suit: "#123a1a", helmet: "#9bff3f", visor: "#0b1a0b", skin: "#a8703f", num: "8" },
  { name: "VERA VHS", short: "VERA", kart: "#8a5cff", trim: "#ffd21f", suit: "#ffd21f", helmet: "#8a5cff", visor: "#150c2c", skin: "#f6d7b8", num: "4" }
];
const AI_SKILL = [1, 0.955, 0.94, 0.925, 0.95, 0.965];
const GRID_SLOT = [4, 0, 2, 5, 1, 3];                     // where each kart lines up (0 = pole). The player starts fifth.

const ITEMS = { pin: "PINBALL", tape: "TAPE TANGLE", turbo: "TURBO", shield: "BUBBLE SHIELD" };
// Odds by place: leaders get defense, the back of the pack gets speed and firepower.
function itemOdds(place) {
  if (place <= 1) return [["tape", 0.42], ["shield", 0.33], ["pin", 0.2], ["turbo", 0.05]];
  if (place <= 3) return [["pin", 0.38], ["tape", 0.24], ["turbo", 0.18], ["shield", 0.2]];
  return [["turbo", 0.42], ["pin", 0.4], ["shield", 0.12], ["tape", 0.06]];
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function wrapA(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
function rng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// The race rolls its own dice from a seed, so a race can be replayed exactly by the checks.
let rand = Math.random;

/* ---------------- Track math ---------------- */
function catmull(p0, p1, p2, p3, t, i) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
}
const TR = [];                                             // built tracks, by index
function trackData(ti) {
  if (TR[ti]) return TR[ti];
  const P = TRACKS[ti].ctrl, n = P.length, dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < 60; k++) dense.push([catmull(p0, p1, p2, p3, k / 60, 0), catmull(p0, p1, p2, p3, k / 60, 1)]);
  }
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) { const a = dense[i - 1], b = dense[i % dense.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const len = cum[dense.length], N = Math.round(len), step = len / N;
  const X = new Float32Array(N), Z = new Float32Array(N), TX = new Float32Array(N), TZ = new Float32Array(N);
  let j = 0;
  for (let k = 0; k < N; k++) {
    const s = k * step;
    while (cum[j + 1] < s) j++;
    const u = (s - cum[j]) / (cum[j + 1] - cum[j]), a = dense[j], b = dense[(j + 1) % dense.length];
    X[k] = a[0] + (b[0] - a[0]) * u; Z[k] = a[1] + (b[1] - a[1]) * u;
  }
  for (let k = 0; k < N; k++) {
    const a = (k - 1 + N) % N, b = (k + 1) % N, dx = X[b] - X[a], dz = Z[b] - Z[a], l = Math.hypot(dx, dz) || 1;
    TX[k] = dx / l; TZ[k] = dz / l;
  }
  // curvature radius (signed: + turns right) and the speed a kart can carry through it
  const RAD = new Float32Array(N), VLIM = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const a = (k - 4 + N) % N, b = (k + 4) % N;
    const turn = wrapA(Math.atan2(TZ[b], TX[b]) - Math.atan2(TZ[a], TX[a]));
    const R = Math.abs(turn) > 1e-4 ? (8 * step) / turn : 1e4 * (turn >= 0 ? 1 : -1);
    RAD[k] = R;
    const r = Math.abs(R);
    VLIM[k] = Math.min(V_MAX * 1.4, 0.93 * TURN * r / (1 + TURN * r * TURN_FALL / V_MAX));
  }
  for (let pass = 0; pass < 2; pass++) {                  // brake in time for what is coming
    for (let k = N - 1; k >= 0; k--) {
      const nx = VLIM[(k + 1) % N];
      VLIM[k] = Math.min(VLIM[k], Math.sqrt(nx * nx + 2 * BRK * 0.45 * step));
    }
  }
  const tr = { ti: ti, def: TRACKS[ti], N: N, len: len, step: step, X: X, Z: Z, TX: TX, TZ: TZ, RAD: RAD, VLIM: VLIM };
  layout(tr);
  TR[ti] = tr;
  return tr;
}
function idxAt(tr, s) { return ((Math.round(s / tr.step) % tr.N) + tr.N) % tr.N; }
function wrapS(tr, s) { return ((s % tr.len) + tr.len) % tr.len; }
// World point of track spot (s, d).
function spot(tr, s, d, out) {
  const i = idxAt(tr, s);
  out = out || {};
  out.x = tr.X[i] - tr.TZ[i] * d; out.z = tr.Z[i] + tr.TX[i] * d; out.i = i;
  return out;
}
// Where an object is on the track: nearest sample (searched around its last one), s and d.
function locate(tr, o, full) {
  const N = tr.N, X = tr.X, Z = tr.Z;
  let best = o.idx || 0, bd = 1e18;
  if (full) {
    for (let i = 0; i < N; i++) { const dx = o.x - X[i], dz = o.z - Z[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
  } else {
    const c = best;
    for (let j = -9; j <= 9; j++) {
      const i = (c + j + N) % N, dx = o.x - X[i], dz = o.z - Z[i], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
  }
  const dx = o.x - X[best], dz = o.z - Z[best];
  o.idx = best;
  o.s = wrapS(tr, best * tr.step + dx * tr.TX[best] + dz * tr.TZ[best]);
  o.d = -dx * tr.TZ[best] + dz * tr.TX[best];
}
// The flattest sample in a window of the loop (for boards and pads).
function flattest(tr, f0, f1) {
  let best = 0, br = 0;
  for (let f = f0; f <= f1; f += 0.004) {
    const i = idxAt(tr, f * tr.len);
    let r = 1e9;
    for (let k = -14; k <= 14; k += 2) r = Math.min(r, Math.abs(tr.RAD[(i + k + tr.N) % tr.N]));
    if (r > br) { br = r; best = i; }
  }
  return best * tr.step;
}
// Clear of every part of the road (for scenery).
function clearOf(tr, x, z, m) {
  const m2 = m * m;
  for (let i = 0; i < tr.N; i += 2) { const dx = x - tr.X[i], dz = z - tr.Z[i]; if (dx * dx + dz * dz < m2) return false; }
  return true;
}
// Prize cube rows, boost pads, LED boards and billboards: placed once per track.
function layout(tr) {
  const L = tr.len;
  tr.boxRows = [0.2, 0.5, 0.78].map(function (f) { return flattest(tr, f - 0.05, f + 0.05); });
  tr.pads = [flattest(tr, 0.08, 0.14), flattest(tr, 0.62, 0.7)].map(function (s, k) { return { s: s + 20, d: k ? 2.6 : -2.6 }; });
  tr.leds = [flattest(tr, 0.3, 0.42), flattest(tr, 0.84, 0.94)];
  const r = rng(tr.ti * 97 + 5);
  tr.boards = [];
  for (let k = 0; k < 9; k++) {
    const s = wrapS(tr, (k + 0.5) / 9 * L + (r() - 0.5) * 12), i = idxAt(tr, s);
    const side = tr.RAD[i] > 0 ? -1 : 1;                   // the outside of the bend, where drivers look
    const d = side * (WALL + 4.5);
    const ok = [-6, 0, 6].every(function (o) { const q = spot(tr, s + o, d); return clearOf(tr, q.x, q.z, WALL + 3.5); });
    if (ok) tr.boards.push({ s: s, d: d, side: side, kind: k % 3 });
  }
}

/* ---------------- Race state ---------------- */
let S = {}, keys = {}, idleT = 0, parts = [];
let THREE = null, R = null;                              // R holds everything the renderer owns
let trackSel = 0, touchMode = false, AUTO = false;            // AUTO: the checks let the player's kart drive itself
const SAVE = { get: function (k) { try { return window.Shell && Shell.load ? Shell.load(k) : null; } catch (e) { return null; } },
               set: function (k, v) { try { if (window.Shell && Shell.save) Shell.save(k, v); } catch (e) { /* private mode */ } } };

function newKart(i, tr) {
  const slot = GRID_SLOT[i], row = Math.floor(slot / 2), s = wrapS(tr, -5 - row * 5.6 - (slot % 2) * 1.2), d = slot % 2 ? 2.5 : -2.5;
  const p = spot(tr, s, d), h = Math.atan2(tr.TZ[p.i], tr.TX[p.i]);
  const dv = DRIVERS[i];
  const k = { i: i, name: dv.name, short: dv.short, isPlayer: i === 0, x: p.x, z: p.z, vx: 0, vz: 0, h: h, idx: p.i, s: s, d: d, ps: s,
              lap: 0, half: false, prog: s - tr.len, place: slot + 1, finished: false, finishT: 0, lapT0: 0, laps: [], best: 0,
              spin: 0, spinA: 0, spinDir: 1, inv: 0, boost: 0, boostLvl: 0, drift: 0, driftT: 0, hop: 0, steerV: 0,
              item: null, roll: 0, rollItem: null, shield: 0, wrongT: 0, off: false, wall: 0, vmul: 1, speed: 0,
              hitsLanded: 0, hitsTaken: 0, mt: 0, startPress: -1,
              inp: { steer: 0, gas: false, brake: false, drift: false, use: false },
              ai: { skill: AI_SKILL[i], base: d * 0.8, ph: i * 1.7, wf: 0.21 + i * 0.037, hold: 0, stuck: 0, rev: 0, react: 0.05 + (i * 0.37) % 0.25,
                    rocket: i % 2 === 1, corner: 0.97 + (i % 3) * 0.015, stucks: 0, back: false } };
  locate(tr, k, true);
  k.ps = k.s; k.prog = k.s - tr.len;
  return k;
}

// demo: the attract loop behind the title card (every kart drives itself, nothing makes a sound).
function newRace(ti, demo, seed) {
  const tr = trackData(ti);
  rand = rng(seed == null ? (Math.random() * 1e9) | 0 : seed);
  const karts = [];
  for (let i = 0; i < KARTS; i++) karts.push(newKart(i, tr));
  const boxes = [];
  tr.boxRows.forEach(function (s, r) {
    [-4.2, -1.4, 1.4, 4.2].forEach(function (d, c) { const p = spot(tr, s, d); boxes.push({ x: p.x, z: p.z, s: s, d: d, back: 0, seed: r * 4 + c }); });
  });
  return { tr: tr, ti: ti, demo: !!demo, after: false, phase: demo ? "race" : "count", t: 0, pt: 0, raceT: 0,
           karts: karts, player: karts[0], boxes: boxes, items: [], order: [], finishOrder: [],
           hits: 0, hitRow: 0, gotHit: 0, blocks: 0, mts: 0, wrong: false, kbSteer: 0, itemReq: false, gasAt: -1,
           countShown: 0, leader: -1, lapShown: 0, result: null, endT: 0 };
}

function reset() {
  const boot = !window.Shell || !Shell.state || Shell.state() === "boot";
  const saved = parseInt(SAVE.get("track"), 10);
  if (saved >= 0 && saved < TRACKS.length) trackSel = saved;
  S = newRace(trackSel, boot);
  parts.length = 0;
  ledClear();
  if (R) R.trackShown = -1;
  if (!S.demo) {
    ledPlay([ledMsg("slide", TRACKS[trackSel].name, 2.2, { color: "cyan" }), ledMsg("blink", "GET READY", 1.4, { color: "amber" })]);
  }
}
// Title card: show (and race the attract loop on) another track.
function pickTrack(ti) {
  trackSel = (ti + TRACKS.length) % TRACKS.length;
  SAVE.set("track", trackSel);
  S = newRace(trackSel, true);
  ledClear();
  if (R) R.trackShown = -1;
  if (typeof labelTracks === "function") labelTracks();
}

/* ---------------- Events: sound, flashes, the LED board, trophies (never from the attract loop) ---------------- */
function live() { return !S.demo && !S.after && window.Shell && Shell.state() === "playing"; }
// How loud something at (x, z) is for the player: full at the kart, gone 60 m away.
function near(x, z) {
  const p = S.player, d = Math.hypot(x - p.x, z - p.z);
  return clamp(1 - d / 60, 0, 1);
}
function sfx(name, x, z, more) {
  if (S.demo || !window.Shell || Shell.state() !== "playing") return;
  const v = x == null ? 1 : near(x, z);
  if (v > 0.02) Sound.cue(name, v, more);
}
function trophy(id) { if (live() && window.Trophies) { try { window.Trophies.unlock(id); } catch (e) { /* optional */ } } }

/* ---------------- Kart physics ---------------- */
function stepKart(k, dt) {
  const tr = S.tr, inp = k.inp;
  let fx = Math.cos(k.h), fz = Math.sin(k.h);
  let vf = k.vx * fx + k.vz * fz;
  k.off = Math.abs(k.d) > HW + 0.35;
  let vmax = V_MAX * k.vmul * (k.off ? OFF_MUL : 1);
  if (k.boost > 0) vmax = Math.max(vmax, V_MAX * k.vmul) + BOOST_V;
  const canDrive = S.phase !== "count" && k.spin <= 0;
  if (k.spin > 0) {
    k.spin -= dt;
    k.spinA += dt * 13 * k.spinDir * clamp(k.spin / SPIN_T + 0.3, 0, 1);
    vf *= Math.exp(-2.6 * dt);
    if (k.spin <= 0) { k.spin = 0; k.spinA = 0; }
  } else if (canDrive) {
    if (k.boost > 0) vf += 34 * dt;
    if (inp.gas && !inp.brake) {
      if (vf < vmax) vf += ACC * (1 - 0.6 * clamp(vf / vmax, 0, 1)) * dt;
    } else if (inp.brake) {
      if (vf > 0.5) vf -= BRK * dt;
      else vf = Math.max(REV, vf - ACC * 0.45 * dt);
    } else {
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), DRAG * (k.off ? 3 : 1) * dt);
    }
  }
  if (vf > vmax) vf -= Math.min(vf - vmax, (k.off ? 26 : 9) * dt);
  if (S.phase === "count") vf = 0;
  // velocity keeps its sideways part for now: grip pulls it back after the turn
  const vl0 = k.vx * -fz + k.vz * fx;
  k.vx = fx * vf - fz * vl0; k.vz = fz * vf + fx * vl0;

  // steering and drifting
  const sp = Math.abs(vf);
  if (canDrive) {
    if (inp.drift && !k.drift && Math.abs(inp.steer) > 0.3 && vf > DRIFT_MIN_V && !k.off) {
      k.drift = inp.steer > 0 ? 1 : -1; k.driftT = 0; k.hop = 0.001;
      if (k.isPlayer) sfx("hop");
    }
    if (k.drift && (!inp.drift || vf < DRIFT_MIN_V * 0.65 || inp.brake)) endDrift(k, !inp.brake && vf >= DRIFT_MIN_V * 0.65);
    let turn;
    const auth = clamp(sp / 6, 0, 1) * (vf < 0 ? -1 : 1);
    const w = TURN * (1 - TURN_FALL * clamp(sp / V_MAX, 0, 1.3));
    if (k.drift) {
      turn = (0.62 + 0.5 * inp.steer * k.drift) * k.drift * w * 1.28;
      const before = k.driftT;
      k.driftT += dt * (0.55 + 0.6 * clamp(inp.steer * k.drift, 0, 1));
      if (k.isPlayer && ((before < MT1 && k.driftT >= MT1) || (before < MT2 && k.driftT >= MT2))) sfx("charge", null, null, k.driftT >= MT2 ? 2 : 1);
    } else turn = inp.steer * w;
    k.h += turn * auth * dt;
  }
  k.steerV += ((k.spin > 0 ? 0 : k.drift ? k.drift * 0.6 + inp.steer * 0.4 : inp.steer) - k.steerV) * Math.min(1, dt * 12);
  fx = Math.cos(k.h); fz = Math.sin(k.h);
  let vf2 = k.vx * fx + k.vz * fz, vl = k.vx * -fz + k.vz * fx;
  vl *= Math.exp(-(k.spin > 0 ? 1.2 : k.drift ? DRIFT_GRIP : GRIP) * dt);
  k.vx = fx * vf2 - fz * vl; k.vz = fz * vf2 + fx * vl;
  k.slide = vl;
  k.x += k.vx * dt; k.z += k.vz * dt;
  k.speed = vf2;

  // walls
  locate(tr, k);
  const lim = WALL - KART_R;
  if (Math.abs(k.d) > lim) {
    const sg = Math.sign(k.d), nx = -tr.TZ[k.idx] * sg, nz = tr.TX[k.idx] * sg, over = Math.abs(k.d) - lim;
    k.x -= nx * over; k.z -= nz * over;
    const vn = k.vx * nx + k.vz * nz;
    if (vn > 0) {
      k.vx -= nx * vn * 1.35; k.vz -= nz * vn * 1.35;
      k.vx *= 0.96; k.vz *= 0.96;
      if (vn > 4) { k.wall = 0.25; if (k.isPlayer) { sfx("wall", null, null, Math.min(1, vn / 14)); camShake(0.12 * Math.min(1, vn / 10), 0.2); } }
      spark(k.x + nx * KART_R, 0.3, k.z + nz * KART_R, Math.min(8, vn | 0), 0);
    }
    k.d = sg * lim;
  }
  if (k.wall > 0) k.wall -= dt;
  if (k.boost > 0) { k.boost -= dt; if (k.boost <= 0) { k.boost = 0; k.boostLvl = 0; } }
  if (k.shield > 0) { k.shield -= dt; if (k.shield <= 0) { k.shield = 0; if (k.isPlayer) sfx("pop"); } }
  if (k.inv > 0) k.inv -= dt;
  if (k.hop > 0) { k.hop += dt; if (k.hop > 0.26) k.hop = 0; }

  // laps
  const L = tr.len;
  if (k.ps > L - 40 && k.s < 40) {
    if (k.half || k.lap === 0) { k.lap++; k.half = false; lapDone(k); }
  } else if (k.ps < 40 && k.s > L - 40) {
    if (k.lap > 0) { k.lap--; k.half = true; }
  }
  if (k.s > L * 0.35 && k.s < L * 0.65) k.half = true;
  k.ps = k.s;
  k.prog = (k.lap - 1) * L + k.s;

  // boost pads
  for (let i = 0; i < tr.pads.length; i++) {
    const pd = tr.pads[i], ds = wrapS(tr, k.s - pd.s + 3);
    if (ds < 6 && Math.abs(k.d - pd.d) < 1.9 && k.boost < 0.6) { k.boost = 0.9; k.boostLvl = 3; if (k.isPlayer) sfx("pad"); }
  }
  // wrong way (the player only)
  if (k.isPlayer && live()) {
    const along = k.vx * tr.TX[k.idx] + k.vz * tr.TZ[k.idx];
    k.wrongT = along < -2 && k.spin <= 0 ? k.wrongT + dt : Math.max(0, k.wrongT - dt * 2);
  }
}

function endDrift(k, fire) {
  if (fire && k.driftT >= MT1) {
    const lvl = k.driftT >= MT2 ? 2 : 1;
    k.boost = Math.max(k.boost, lvl === 2 ? 1.05 : 0.55); k.boostLvl = lvl; k.mt++;
    if (k.isPlayer) {
      sfx("mini", null, null, lvl);
      if (lvl === 2) trophy("bk-turbo");
      if (live()) S.mts++;
    }
  }
  k.drift = 0; k.driftT = 0;
}

function lapDone(k) {
  if (k.lap === 1) { k.lapT0 = S.raceT; return; }
  const lt = S.raceT - k.lapT0;
  k.laps.push(lt); k.lapT0 = S.raceT;
  if (!k.best || lt < k.best) k.best = lt;
  if (S.demo) { if (k.lap > LAPS) k.lap = 1; return; }
  if (k.lap > LAPS && !k.finished) {
    k.finished = true; k.finishT = S.raceT;
    S.finishOrder.push(k.i);
    if (k.isPlayer) playerFinished();
    return;
  }
  if (k.isPlayer && live()) {
    if (k.lap === LAPS) {
      Shell.flash("FINAL LAP", "Lap " + (k.lap - 1) + ": " + clock(lt), "#ff3fa4", 1300);
      ledPlay([ledMsg("cycle", "FINAL LAP", 2.4)]);
      sfx("final");
    } else {
      Shell.flash("LAP " + k.lap, "Lap " + (k.lap - 1) + ": " + clock(lt), "#3ff0ff", 1100);
      ledPlay([ledMsg("slide", "LAP " + k.lap + " OF " + LAPS, 2.2, { color: "cyan" })]);
      sfx("lap");
    }
  }
}
function clock(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2);
}

// Karts bump each other.
function bumps() {
  const ks = S.karts;
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const a = ks[i], b = ks[j], dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, rr = KART_R * 2;
    if (d2 >= rr * rr || d2 < 1e-6) continue;
    const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = rr - d;
    a.x -= nx * pen / 2; a.z -= nz * pen / 2; b.x += nx * pen / 2; b.z += nz * pen / 2;
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv < 0) {
      const j2 = -(1 + 0.45) * rv / 2;
      a.vx -= j2 * nx; a.vz -= j2 * nz; b.vx += j2 * nx; b.vz += j2 * nz;
      if (-rv > 3 && (a.isPlayer || b.isPlayer)) { sfx("bump", null, null, Math.min(1, -rv / 10)); spark((a.x + b.x) / 2, 0.45, (a.z + b.z) / 2, 4, 0); }
    }
  }
}

/* ---------------- Items ---------------- */
function rollItem(k) {
  const odds = itemOdds(k.place), r = rand();
  let acc = 0;
  for (let i = 0; i < odds.length; i++) { acc += odds[i][1]; if (r <= acc) return odds[i][0]; }
  return odds[0][0];
}
function boxes(dt) {
  for (let b = 0; b < S.boxes.length; b++) {
    const bx = S.boxes[b];
    if (bx.back > 0) { bx.back -= dt; continue; }
    for (let i = 0; i < S.karts.length; i++) {
      const k = S.karts[i];
      if (k.item || k.roll > 0 || k.finished) continue;
      const dx = k.x - bx.x, dz = k.z - bx.z;
      if (dx * dx + dz * dz < BOX_R * BOX_R) {
        bx.back = BOX_BACK;
        k.rollItem = rollItem(k); k.roll = k.isPlayer && !S.demo ? 1.05 : 0.45;
        burst3(bx.x, 0.9, bx.z, 14, 1);
        if (k.isPlayer) sfx("box");
        break;
      }
    }
  }
}
function useItem(k, back) {
  const it = k.item;
  if (!it || k.roll > 0 || k.spin > 0) return;
  k.item = null; k.ai.hold = 0;
  const fx = Math.cos(k.h), fz = Math.sin(k.h);
  if (it === "pin") {
    const v = back ? -12 : Math.max(0, k.speed) + PIN_V - 12, o = back ? -1.6 : 1.7;
    S.items.push({ type: "pin", x: k.x + fx * o, z: k.z + fz * o, vx: fx * v, vz: fz * v, owner: k, t: 0, life: PIN_LIFE, bounces: 0, idx: k.idx, s: k.s, d: k.d, dead: false });
    sfx("launch", k.x, k.z);
  } else if (it === "tape") {
    const o = back ? 2.2 : -2.2;
    if (back) {                                          // tossed ahead: lands a few car lengths in front
      S.items.push({ type: "tape", x: k.x + fx * 14, z: k.z + fz * 14, vx: 0, vz: 0, owner: k, t: 0, life: TAPE_LIFE, idx: k.idx, toss: 0.5, fx: k.x + fx * 2, fz: k.z + fz * 2, dead: false });
    } else S.items.push({ type: "tape", x: k.x + fx * o, z: k.z + fz * o, vx: 0, vz: 0, owner: k, t: 0, life: TAPE_LIFE, idx: k.idx, dead: false });
    const tapes = S.items.filter(function (q) { return q.type === "tape" && !q.dead; });
    if (tapes.length > 12) tapes[0].dead = true;
    sfx("drop", k.x, k.z);
  } else if (it === "turbo") {
    k.boost = TURBO_T; k.boostLvl = 3;
    const v = k.speed + 6;
    k.vx += fx * (v - k.speed) * 0.5; k.vz += fz * (v - k.speed) * 0.5;
    sfx("turbo", k.x, k.z);
  } else if (it === "shield") {
    k.shield = SHIELD_T;
    sfx("shield", k.x, k.z);
  }
}
function stepItems(dt) {
  const tr = S.tr;
  for (let n = 0; n < S.items.length; n++) {
    const q = S.items[n];
    if (q.dead) continue;
    q.t += dt;
    if (q.t > q.life) { q.dead = true; if (q.type === "pin") burst3(q.x, 0.5, q.z, 6, 2); continue; }
    if (q.type === "pin") {
      q.x += q.vx * dt; q.z += q.vz * dt;
      locate(tr, q);
      const lim = WALL - PIN_R;
      if (Math.abs(q.d) > lim) {                          // pinballs bank off the walls
        const sg = Math.sign(q.d), nx = -tr.TZ[q.idx] * sg, nz = tr.TX[q.idx] * sg, over = Math.abs(q.d) - lim;
        q.x -= nx * over; q.z -= nz * over;
        const vn = q.vx * nx + q.vz * nz;
        if (vn > 0) { q.vx -= 2 * vn * nx; q.vz -= 2 * vn * nz; q.bounces++; sfx("ping", q.x, q.z); spark(q.x, 0.5, q.z, 5, 2); }
        if (q.bounces > 7) { q.dead = true; continue; }
      }
      // a light pull along the road, so a pinball keeps rolling down the track and around bends
      const along = q.vx * tr.TX[q.idx] + q.vz * tr.TZ[q.idx], sgn = along >= 0 ? 1 : -1, sp = Math.hypot(q.vx, q.vz);
      q.vx += (tr.TX[q.idx] * sgn * sp - q.vx) * Math.min(1, dt * 1.6);
      q.vz += (tr.TZ[q.idx] * sgn * sp - q.vz) * Math.min(1, dt * 1.6);
    } else if (q.toss > 0) {
      q.toss -= dt;
    }
    // pinball against tape: both gone
    if (q.type === "pin") {
      for (let m = 0; m < S.items.length; m++) {
        const o = S.items[m];
        if (o === q || o.dead || o.type !== "tape" || o.toss > 0) continue;
        const dx = o.x - q.x, dz = o.z - q.z;
        if (dx * dx + dz * dz < (PIN_R + TAPE_R) * (PIN_R + TAPE_R)) { q.dead = o.dead = true; burst3(o.x, 0.4, o.z, 16, 3); sfx("pop", o.x, o.z); break; }
      }
      if (q.dead) continue;
    }
    if (q.toss > 0) continue;
    const r = q.type === "pin" ? PIN_R : TAPE_R;
    for (let i = 0; i < S.karts.length; i++) {
      const k = S.karts[i];
      if (k === q.owner && q.t < (q.type === "pin" ? 0.35 : 0.8)) continue;
      const dx = k.x - q.x, dz = k.z - q.z, rr = KART_R + r;
      if (dx * dx + dz * dz < rr * rr) { if (hitKart(k, q)) { q.dead = true; break; } }
    }
  }
  if (S.items.length > 60) S.items = S.items.filter(function (q) { return !q.dead; });
}
// Returns true when the item is used up.
function hitKart(k, q) {
  if (k.finished && !S.demo) return false;
  if (k.inv > 0) return q.type === "pin";
  if (k.shield > 0) {
    k.shield = 0; k.inv = 0.45;
    burst3(k.x, 1, k.z, 18, 4);
    sfx("block", k.x, k.z);
    if (k.isPlayer && live()) {
      S.blocks++; trophy("bk-block");
      Shell.flash("BLOCKED!", "The bubble took it.", "#3ff0ff", 900);
      ledPlay([ledMsg("slide", "BLOCKED!", 1.6, { color: "cyan" })]);
    }
    return true;
  }
  k.spin = SPIN_T; k.spinDir = rand() < 0.5 ? -1 : 1; k.inv = INV_T; k.boost = 0; k.boostLvl = 0;
  if (k.drift) { k.drift = 0; k.driftT = 0; }
  k.vx *= 0.32; k.vz *= 0.32;
  k.hitsTaken++;
  burst3(k.x, 0.9, k.z, 22, 5);
  sfx("hit", k.x, k.z);
  const o = q.owner;
  if (o && o !== k) {
    o.hitsLanded++;
    if (o.isPlayer && live()) {
      S.hits++; S.hitRow++;
      Shell.flash(S.hitRow >= 3 ? S.hitRow + " IN A ROW!" : "DIRECT HIT!", k.name + " spins out.", "#9bff3f", 1000);
      ledPlay([ledMsg("flash", S.hitRow >= 2 ? "HIT x" + S.hitRow + "!" : "DIRECT HIT!", 1.7), ledMsg("count", "HITS", 1.3, { from: S.hits - 1, value: S.hits })]);
      if (window.NPRewards && (S.hitRow === 2 || (S.hitRow > 2 && S.hitRow % 2 === 0))) { try { NPRewards.streak(S.hitRow, S.hitRow === 2 ? "" : S.hitRow + " HITS IN A ROW!"); } catch (e) { /* optional */ } }
      if (S.hits >= 5) trophy("bk-hits5");
      sfx("score");
    }
  }
  if (k.isPlayer && live()) {
    S.gotHit++; S.hitRow = 0;
    Shell.flash("SPUN OUT", o && o !== k ? "Courtesy of " + o.name + "." : "Watch the road.", "#ff4b3e", 1000);
    ledPlay([ledMsg("blink", "SPUN OUT", 1.6, { color: "red" })]);
    camShake(0.35, 0.4); Shell.shake(3, 0.3);
  }
  return true;
}

/* ---------------- The other drivers ---------------- */
function aiDrive(k, dt) {
  const tr = S.tr, a = k.ai, inp = k.inp, v = Math.max(0, k.speed);
  inp.use = false;
  if (S.phase === "count") {
    inp.steer = 0; inp.brake = false; inp.drift = false;
    inp.gas = a.rocket && S.pt > COUNT_T - 0.32;           // some of them nail the rocket start
    return;
  }
  if (S.raceT < a.react && !S.demo) { inp.gas = false; return; }
  // pick a line: a lazy weave, a prize cube when the hands are empty, around any tape on the road
  let lane = a.base + Math.sin(S.raceT * a.wf + a.ph) * 1.7;
  if (!k.item && k.roll <= 0) {
    for (let r = 0; r < tr.boxRows.length; r++) {
      const ahead = wrapS(tr, tr.boxRows[r] - k.s);
      if (ahead > 4 && ahead < 46) {
        let bd = 99, best = lane;
        for (let b = 0; b < S.boxes.length; b++) { const bx = S.boxes[b]; if (bx.s === tr.boxRows[r] && bx.back <= 0 && Math.abs(bx.d - k.d) < bd) { bd = Math.abs(bx.d - k.d); best = bx.d; } }
        lane = best; break;
      }
    }
  }
  for (let n = 0; n < S.items.length; n++) {
    const q = S.items[n];
    if (q.dead || q.type !== "tape" || q.toss > 0) continue;
    if (q.s == null) locate(tr, q, true);
    const ahead = wrapS(tr, q.s - k.s);
    if (ahead > 1 && ahead < 30 && Math.abs(q.d - lane) < 2.6) lane = q.d > 0 ? q.d - 3.2 : q.d + 3.2;
  }
  lane = clamp(lane, -HW + 1.3, HW - 1.3);
  const look = 6 + v * 0.42, ti = idxAt(tr, k.s + look);
  const tx = tr.X[ti] - tr.TZ[ti] * lane, tz = tr.Z[ti] + tr.TX[ti] * lane;
  const diff = wrapA(Math.atan2(tz - k.z, tx - k.x) - k.h);
  // speed: what the next bends allow, and a gentle leash to the player so the pack stays in the race
  let mul = a.skill;
  if (!S.demo && !k.isPlayer) mul *= 1 + clamp((S.player.prog - k.prog) / 420, -0.08, 0.07);
  if (k.finished) mul = 0.7;
  k.vmul = mul;
  let lim = V_MAX * mul;
  for (let j = 2; j < 10; j += 3) lim = Math.min(lim, tr.VLIM[idxAt(tr, k.s + v * 0.12 * j)] * a.corner * (k.drift ? 1.12 : 1));
  // stuck against a wall: back out
  if (a.rev > 0) {
    a.rev -= dt;
    inp.gas = false; inp.brake = true; inp.drift = false; inp.steer = -Math.sign(diff || 1);
    return;
  }
  if (S.phase !== "count" && v < 1.2) a.stuck += dt; else a.stuck = Math.max(0, a.stuck - dt);
  if (a.stuck > 1.1) { a.stuck = 0; a.rev = 0.7; if (++a.stucks > 3) respawn(k); return; }
  if (v > 5) a.stucks = 0;
  inp.steer = clamp(diff * 2.7, -1, 1);
  inp.gas = v < lim;
  inp.brake = v > lim + 3;
  // drift through the tighter bends, the way the player is meant to
  const rAhead = Math.abs(tr.RAD[idxAt(tr, k.s + 8 + v * 0.3)]);
  if (!k.drift) inp.drift = rAhead < 24 && v > 14 && Math.abs(diff) > 0.12 && (k.i + Math.floor(S.raceT)) % 3 !== 0;
  else inp.drift = !(Math.abs(diff) < 0.05 || rAhead > 40 || k.driftT > 2.4);
  aiItems(k, dt);
  if (inp.use) { inp.use = false; useItem(k, a.back); }
}
function respawn(k) {
  const tr = S.tr, p = spot(tr, k.s, 0);
  k.x = p.x; k.z = p.z; k.vx = k.vz = 0; k.h = Math.atan2(tr.TZ[p.i], tr.TX[p.i]); k.ai.stucks = 0;
  locate(tr, k, true);
}
function aiItems(k, dt) {
  const a = k.ai;
  a.back = false;
  if (!k.item || k.roll > 0) return;
  a.hold += dt;
  if (a.hold < 0.7) return;
  const ks = S.karts;
  if (k.item === "pin") {
    for (let i = 0; i < ks.length; i++) {
      const o = ks[i];
      if (o === k || o.finished) continue;
      const gap = o.prog - k.prog;
      if (gap > 3 && gap < 42 && Math.abs(wrapA(Math.atan2(o.z - k.z, o.x - k.x) - k.h)) < 0.28) { k.inp.use = true; return; }
      if (gap < -3 && gap > -14 && rand() < 0.004) { a.back = true; k.inp.use = true; return; }
    }
    if (a.hold > 7) k.inp.use = true;
  } else if (k.item === "tape") {
    for (let i = 0; i < ks.length; i++) { const gap = ks[i].prog - k.prog; if (ks[i] !== k && gap < -2 && gap > -22) { k.inp.use = true; return; } }
    if (a.hold > 6) k.inp.use = true;
  } else if (k.item === "turbo") {
    if (S.tr.VLIM[idxAt(S.tr, k.s + 25)] > V_MAX * 1.2 || a.hold > 3) k.inp.use = true;
  } else if (k.item === "shield") {
    for (let n = 0; n < S.items.length; n++) {
      const q = S.items[n];
      if (!q.dead && q.type === "pin" && q.owner !== k && Math.hypot(q.x - k.x, q.z - k.z) < 14) { k.inp.use = true; return; }
    }
    if (a.hold > 9) k.inp.use = true;
  }
}

/* ---------------- The player's controls ---------------- */
function playerDrive(dt) {
  const k = S.player, inp = k.inp;
  const st = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  S.kbSteer += (st - S.kbSteer) * Math.min(1, dt * (st ? 9 : 14));
  const tc = touchState();
  inp.steer = tc.active ? tc.steer : S.kbSteer;
  inp.gas = !!(keys.ArrowUp || keys.KeyW || tc.gas);
  inp.brake = !!(keys.ArrowDown || keys.KeyS || tc.brake);
  inp.drift = !!(keys.ShiftLeft || keys.ShiftRight || tc.drift);
  if (S.phase === "count") {                              // rocket start: get on the gas just before GO
    if (inp.gas && S.gasAt < 0) S.gasAt = S.pt;
    if (!inp.gas) S.gasAt = -1;
  }
  if (S.itemReq) {
    S.itemReq = false;
    if (S.phase === "race") useItem(k, inp.brake);
  }
}

/* ---------------- Flow ---------------- */
function update(dt) { simulate(dt); }
function simulate(dt) {
  if (!S.tr) return;
  S.t += dt; S.pt += dt;
  updateParts(dt);
  if (S.phase === "count") countdown();
  const n = Math.max(1, Math.round(dt / STEP)), h = dt / n;
  const ctl = !S.demo && !S.after && S.phase !== "finish" && !AUTO;
  for (let s = 0; s < n; s++) {
    if (S.phase !== "count") S.raceT += h;
    for (let i = 0; i < S.karts.length; i++) {
      const k = S.karts[i];
      if (k.roll > 0) { k.roll -= h; if (k.roll <= 0) { k.roll = 0; k.item = k.rollItem; k.ai.hold = 0; if (k.isPlayer && ctl) sfx("got"); } }
      if (k.isPlayer && ctl) playerDrive(h); else aiDrive(k, h);
      stepKart(k, h);
    }
    bumps();
    boxes(h);
    stepItems(h);
  }
  rank();
  if (S.phase === "count" && S.pt >= COUNT_T) go();
  if (S.phase === "finish") {
    S.endT += dt;
    if (S.endT > 4.2 && live()) endRace();
  }
  // a race left running far too long ends itself
  if (!S.demo && !S.after && S.phase === "race" && S.raceT > S.tr.def.par * 3) { S.player.finished = true; S.finishOrder.push(0); S.player.finishT = S.raceT; playerFinished(); }
}
function countdown() {
  const n = S.pt < 0.6 ? 0 : S.pt < 1.6 ? 3 : S.pt < 2.6 ? 2 : 1;
  if (n && n !== S.countShown) {
    S.countShown = n;
    if (live()) { ledPlay([ledMsg("flash", String(n), 1)]); sfx("beep"); }
  }
}
function go() {
  S.phase = "race"; S.pt = 0;
  for (let i = 0; i < S.karts.length; i++) {
    const k = S.karts[i];
    const rocket = k.isPlayer && !S.demo ? S.gasAt >= 0 && S.gasAt > COUNT_T - 0.5 : k.inp.gas;
    if (rocket) { k.boost = 0.9; k.boostLvl = 3; }
    k.lapT0 = 0;
  }
  if (live()) {
    const r = S.player.boost > 0;
    if (r) Shell.flash("ROCKET START!", "Right on the GO.", "#9bff3f", 900);
    ledPlay([ledMsg("flash", "GO!", 1.4), ledMsg("slide", r ? "ROCKET START!" : "3 LAPS", 1.8, { color: "lime" })]);
    sfx("go");
    if (r) sfx("turbo");
  }
}
function rank() {
  const ks = S.karts.slice();
  const fo = S.finishOrder;
  ks.sort(function (a, b) {
    if (a.finished && b.finished) return fo.indexOf(a.i) - fo.indexOf(b.i);
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.prog - a.prog;
  });
  for (let i = 0; i < ks.length; i++) ks[i].place = i + 1;
  S.order = ks;
  if (live() && S.phase === "race" && S.raceT > 4) {
    const lead = ks[0].i;
    if (lead !== S.leader) {
      if (lead === 0) { ledPlay([ledMsg("slide", "YOU TAKE THE LEAD", 2, { color: "lime" })], true); sfx("lead"); }
      S.leader = lead;
    }
  } else if (S.phase === "race") S.leader = ks[0].i;
}
const PLACE_TXT = ["1ST", "2ND", "3RD", "4TH", "5TH", "6TH"];
function playerFinished() {
  const k = S.player;
  S.phase = "finish"; S.endT = 0; S.pt = 0;
  const place = S.finishOrder.indexOf(0) + 1;
  S.result = { place: place, time: k.finishT };
  k.place = place;
  if (!live()) return;
  const col = place === 1 ? "#ffd23f" : place <= 3 ? "#3ff0ff" : "#eceae2";
  Shell.flash(place === 1 ? "YOU WIN!" : "FINISH!", PLACE_TXT[place - 1] + " PLACE  " + clock(k.finishT), col, 2000);
  ledPlay([ledMsg("flash", place === 1 ? "WINNER!" : "FINISH", 1.8), ledMsg("cycle", PLACE_TXT[place - 1] + " PLACE", 2.2, { keep: true })]);
  sfx(place === 1 ? "win" : "finish");
  if (place === 1) { burst2(70); camShake(0.2, 0.4); }
  else burst2(24);
}
// Everyone who has not crossed the line yet is placed by how far round they are, with a time to match.
function finalStandings() {
  const tr = S.tr, out = [];
  S.order.forEach(function (k, n) {
    let t = k.finishT;
    if (!k.finished) {
      const left = Math.max(0, LAPS * tr.len - Math.max(0, k.prog));
      t = S.raceT + left / (V_MAX * 0.8 * k.ai.skill);
    }
    out.push({ k: k, place: n + 1, t: t, est: !k.finished });
  });
  return out;
}
function scoreOf(place, hits, time, par) {
  const tb = Math.max(0, Math.round((par - time) * TIME_PTS));
  return { place: PLACE_PTS[place - 1], hits: hits * HIT_PTS, time: tb, total: PLACE_PTS[place - 1] + hits * HIT_PTS + tb };
}
function endRace() {
  const k = S.player, tr = S.tr, st = finalStandings();
  const place = S.result ? S.result.place : k.place, time = S.result ? S.result.time : S.raceT;
  const sc = scoreOf(place, S.hits, time, tr.def.par);
  if (place === 1) {
    trophy("bk-win");
    if (S.gotHit === 0) trophy("bk-clean");
    let wins = {};
    try { wins = JSON.parse(SAVE.get("wins") || "{}") || {}; } catch (e) { wins = {}; }
    wins[tr.def.id] = 1;
    SAVE.set("wins", JSON.stringify(wins));
    if (TRACKS.every(function (t) { return wins[t.id]; })) trophy("bk-tour");
  }
  ledFinal(sc.total);
  let table = '<table aria-label="Standings" style="width:100%;margin:2px 0 8px;border-collapse:collapse">';
  st.forEach(function (r) {
    const me = r.k.isPlayer, c = DRIVERS[r.k.i].kart;
    table += '<tr style="' + (me ? "color:#ffd23f;font-weight:bold" : "") + '"><td style="text-align:left;padding:1px 4px">' + PLACE_TXT[r.place - 1] +
      '</td><td style="text-align:left;padding:1px 4px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;background:' + c + '"></span>' +
      r.k.name + '</td><td style="text-align:right;padding:1px 4px">' + (r.est ? "+" : "") + clock(r.t) + "</td></tr>";
  });
  table += "</table>";
  const best = k.best ? clock(k.best) : "-";
  S.after = true;
  Shell.gameOver(sc.total, {
    title: place === 1 ? "YOU WIN!" : PLACE_TXT[place - 1] + " PLACE",
    html: table +
      row(PLACE_TXT[place - 1] + " place", "+" + sc.place) +
      row("Hits landed (" + S.hits + ")", "+" + sc.hits) +
      row("Time " + clock(time) + " (par " + clock(tr.def.par) + ")", "+" + sc.time) +
      row("Best lap", best) +
      row("Track", tr.def.name),
    stats: { place: place, hits: S.hits, time: Math.round(time * 100) / 100, bestLap: Math.round((k.best || 0) * 100) / 100, track: tr.def.id,
             hitsTaken: S.gotHit, blocks: S.blocks, miniTurbos: S.mts, score: sc.total, clean: S.gotHit === 0 }
  });
}
function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

/* ---------------- Music: an original synthwave loop, made in code ----------------
   Self-contained on purpose: give it an AudioContext and a node to play into, and it plays until the
   function it returns is called. It knows nothing about the game. Sixteen bars in A minor at 132 BPM
   (about 29 seconds): lead, bass, arpeggio, pad and drums, all Web Audio oscillators and noise. */
function startMusic(ctx, dest) {
  const BPM = 132, Q = 60 / BPM / 4, STEPS = 16 * 16, AHEAD = 0.4;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0, ctx.currentTime);
  bus.gain.setTargetAtTime(1, ctx.currentTime + 0.02, 0.04);
  bus.connect(dest);
  function filt(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const leadF = filt("lowpass", 2800, 0.8, bus), bassF = filt("lowpass", 820, 2.2, bus), padF = filt("lowpass", 1300, 0.6, bus);
  const echo = ctx.createDelay(1), fb = ctx.createGain(), send = ctx.createGain(), wet = filt("lowpass", 2200, 0.7, bus);
  echo.delayTime.value = Q * 3; fb.gain.value = 0.3; send.gain.value = 0.28;
  leadF.connect(send); send.connect(echo); echo.connect(fb); fb.connect(echo); echo.connect(wet);
  const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = nb.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < nd.length; i++) { seed = (seed * 16807) % 2147483647; nd[i] = seed / 1073741823.5 - 1; }

  const CH = { Am: [45, 57, 60, 64], F: [41, 57, 60, 65], C: [48, 55, 60, 64], G: [43, 55, 59, 62], E: [40, 56, 59, 64], Em: [40, 55, 59, 64] };
  const PROG = "Am F C G Am F G E F G Em Am F G Am E".split(" ");
  const BARS = [
    "0E5-3 3E5-1 4D5-2 6C5-2 8A4-4 12C5-2 14D5-2", "0E5-3 3F5-1 4E5-2 6D5-2 8C5-6 14A4-2",
    "0G5-3 3G5-1 4E5-2 6C5-2 8D5-4 12E5-2 14G5-2", "0D5-6 6B4-2 8G4-4 12B4-2 14D5-2",
    "0E5-3 3E5-1 4D5-2 6C5-2 8A4-4 12C5-2 14E5-2", "0A5-4 4G5-2 6F5-2 8E5-4 12C5-2 14D5-2",
    "0D5-2 2E5-2 4F5-2 6G5-2 8B5-4 12A5-2 14G5-2", "0G#5-4 4E5-4 8B4-4 12G#4-4",
    "0C6-4 4A5-2 6F5-2 8C6-4 12D6-2 14C6-2", "0B5-4 4G5-2 6D5-2 8B5-6 14A5-2",
    "0G5-4 4E5-2 6B4-2 8G5-4 12A5-2 14B5-2", "0C6-6 6B5-2 8A5-4 12E5-4",
    "0A5-2 2C6-2 4F6-4 8E6-2 10D6-2 12C6-4", "0B5-2 2D6-2 4G6-4 8F6-2 10E6-2 12D6-4",
    "0E6-4 4C6-2 6A5-2 8B5-2 10C6-2 12D6-4", "0E6-8 8B5-2 10G#5-2 12E5-4"
  ];
  const LEAD = new Array(STEPS).fill(null), SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  BARS.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(#?)(\d)-(\d+)$/.exec(tok);
      if (m) LEAD[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + SEMI[m[2]] + (m[3] ? 1 : 0), Number(m[5])];
    });
  });
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function note(to, type, f, t, dur, vol, f1, hold, det) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (det) o.detune.value = det;
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const h = t + Math.max(0.01, dur * (hold == null ? 0.6 : hold));
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(t, dur, vol, type, f, q) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nb; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, (t * 7.31) % 0.8); s.stop(t + dur + 0.02);
  }
  function play(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[bar]], hi = bar >= 8, n = LEAD[i];
    if (n) { note(leadF, "square", hz(n[0]), t, n[1] * Q * 0.94, 0.11); note(leadF, "sawtooth", hz(n[0]), t, n[1] * Q * 0.94, 0.05, 0, 0.6, 9); }
    if (!(s & 1)) note(bassF, "sawtooth", hz(ch[0] + (s % 4 === 2 ? 12 : 0)), t, Q * 1.8, 0.24, 0, 0.5);
    note(bus, "triangle", hz(ch[1 + [0, 1, 2, 1][s & 3]] + (hi ? 12 : 0) + (s >= 8 ? 12 : 0)), t, Q * 0.9, 0.05, 0, 0.4);
    if (s === 0) for (let k = 1; k < 4; k++) note(padF, "sawtooth", hz(ch[k]), t, Q * 16, 0.022, 0, 0.85, k * 7 - 14);
    if (s % 4 === 0) note(bus, "sine", 150, t, 0.18, 0.55, 42, 0.08);
    const fill = (bar === 7 || bar === 15) && s >= 12;
    if (s === 4 || s === 12 || fill) { hiss(t, 0.16, fill ? 0.12 + (s - 12) * 0.04 : 0.26, "bandpass", 1900, 0.6); note(bus, "triangle", 200, t, 0.08, 0.14, 130, 0.1); }
    if (s & 1) hiss(t, 0.035, 0.05, "highpass", 8000);
    else if (s % 4 === 2) hiss(t, 0.12, 0.05, "highpass", 6500);
  }
  let step = 0, next = ctx.currentTime + 0.08;
  function pump() {
    const now = ctx.currentTime;
    if (next < now - 0.25) next = now + 0.05;              // after a stall or a suspend, pick the beat back up
    while (next < now + AHEAD) { try { play(step, next); } catch (e) { /* never worth a crash */ } step = (step + 1) % STEPS; next += Q; }
  }
  pump();
  const timer = setInterval(pump, 80);
  return function stop() {
    clearInterval(timer);
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now); bus.gain.setTargetAtTime(0, now, 0.05);
    setTimeout(function () { try { bus.disconnect(); } catch (e) { /* gone */ } }, 500);
  };
}

/* ---------------- Sound: engines and effects on top of the shell's own ----------------
   The AudioContext is made on the first tap, click or key press, never before. The shell's mute button
   ("npArcade.muted") silences all of it; the music has its own switch ("npArcade.music"), both remembered. */
const MUSIC_KEY = "npArcade.music", MUSIC_VOL = 0.15, SFX_VOL = 0.32;
const Sound = (function () {
  let A = null, dead = false, muted = false, stopMusic = null;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  const buttons = [];
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
    a.sfx = c.createGain(); a.sfx.gain.value = SFX_VOL; a.sfx.connect(a.out);
    const len = c.sampleRate | 0;
    a.noise = c.createBuffer(1, len, c.sampleRate);
    const d = a.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // the player's engine: a buzzy two-stroke, a filter that opens with the throttle
    a.eg = c.createGain(); a.eg.gain.value = 0;
    a.ef = c.createBiquadFilter(); a.ef.type = "lowpass"; a.ef.frequency.value = 500; a.ef.Q.value = 3;
    a.ef.connect(a.eg); a.eg.connect(a.sfx);
    a.e1 = c.createOscillator(); a.e1.type = "sawtooth"; a.e2 = c.createOscillator(); a.e2.type = "square";
    const e2g = c.createGain(); e2g.gain.value = 0.5;
    a.e1.connect(a.ef); a.e2.connect(e2g); e2g.connect(a.ef);
    a.e1.frequency.value = 48; a.e2.frequency.value = 24; a.e1.start(); a.e2.start();
    // tires on the edge of grip
    a.sg = c.createGain(); a.sg.gain.value = 0;
    const sf = c.createBiquadFilter(); sf.type = "bandpass"; sf.frequency.value = 2300; sf.Q.value = 2.2;
    const sn = c.createBufferSource(); sn.buffer = a.noise; sn.loop = true; sn.connect(sf); sf.connect(a.sg); a.sg.connect(a.sfx); sn.start();
    // the pack around you: one more engine that swells as the nearest kart closes in
    a.og = c.createGain(); a.og.gain.value = 0;
    const of = c.createBiquadFilter(); of.type = "lowpass"; of.frequency.value = 700; of.connect(a.og); a.og.connect(a.sfx);
    a.o1 = c.createOscillator(); a.o1.type = "sawtooth"; a.o1.frequency.value = 60; a.o1.connect(of); a.o1.start();
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
  // Every frame: follow the mute button, start or stop the music, drive the engines.
  function pump(state, k, others) {
    if (!A) return;
    const c = A.c, now = c.currentTime, m = shellMuted();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, now, 0.02); }
    const want = musicOn && !muted && c.state === "running" && state === "playing";
    if (want && !stopMusic) { try { stopMusic = startMusic(c, A.music); } catch (e) { stopMusic = null; } }
    else if (!want && stopMusic) { stopMusic(); stopMusic = null; }
    const on = state === "playing" && k && !muted;
    const sp = k ? Math.max(0, Math.abs(k.speed)) : 0, thr = k && k.inp.gas ? 1 : 0.35;
    const f = 44 + sp * 4.6 + (k && k.boost > 0 ? 22 : 0) + (k && k.spin > 0 ? Math.sin(now * 40) * 8 : 0);
    A.e1.frequency.setTargetAtTime(f, now, 0.05); A.e2.frequency.setTargetAtTime(f / 2, now, 0.05);
    A.ef.frequency.setTargetAtTime(380 + sp * 55 * thr + (k && k.boost > 0 ? 900 : 0), now, 0.06);
    A.eg.gain.setTargetAtTime(on ? 0.05 + 0.07 * thr : 0, now, 0.08);
    const slip = k ? Math.min(1, Math.max(0, Math.abs(k.slide || 0) - 2.2) / 6) * (k.off ? 0.3 : 1) : 0;
    A.sg.gain.setTargetAtTime(on ? slip * 0.16 : 0, now, 0.05);
    A.o1.frequency.setTargetAtTime(52 + (others ? others.v : 0) * 4, now, 0.1);
    A.og.gain.setTargetAtTime(on && others ? 0.045 * others.near : 0, now, 0.15);
  }
  function osc(type, f0, t, dur, vol, f1, hold) {
    const o = A.c.createOscillator(), g = A.c.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.5 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.sfx); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(t, dur, vol, type, f0, q, f1, atk) {
    const s = A.c.createBufferSource(), f = A.c.createBiquadFilter(), g = A.c.createGain();
    s.buffer = A.noise; s.loop = true; f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(A.sfx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function mt(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  // v: 0..1 how close it happened to the player. x: a detail (mini-turbo level, impact strength).
  function cue(name, v, x) {
    if (!A || muted || A.c.state !== "running") return;
    const t = A.c.currentTime + 0.01;
    v = v == null ? 1 : v;
    try {
      switch (name) {
        case "beep": osc("square", 440, t, 0.22, 0.3); break;
        case "go": osc("square", 880, t, 0.5, 0.32, 0, 0.7); osc("square", 1320, t, 0.5, 0.16, 0, 0.7); break;
        case "lap": [76, 81, 88].forEach(function (m, i) { osc("square", mt(m), t + i * 0.08, 0.14, 0.24); }); break;
        case "final": [72, 76, 79, 84, 79, 84, 88].forEach(function (m, i) { osc("square", mt(m), t + i * 0.07, 0.12, 0.24); }); break;
        case "finish": [72, 76, 79, 84].forEach(function (m, i) { osc("square", mt(m), t + i * 0.1, 0.18, 0.26); }); osc("triangle", mt(88), t + 0.42, 0.7, 0.22, 0, 0.4); break;
        case "win":
          [72, 76, 79, 84, 88, 91, 96].forEach(function (m, i) { osc("square", mt(m), t + i * 0.07, 0.12, 0.26); });
          [84, 88, 91].forEach(function (m) { osc("triangle", mt(m), t + 0.5, 0.9, 0.2, 0, 0.4); });
          hiss(t + 0.3, 2.2, 0.8, "bandpass", 1000, 0.45, 1500, 0.3);
          break;
        case "lead": osc("square", 660, t, 0.08, 0.2); osc("square", 990, t + 0.08, 0.16, 0.2); break;
        case "box": osc("square", 523, t, 0.06, 0.22 * v); osc("square", 784, t + 0.05, 0.06, 0.22 * v); osc("square", 1047, t + 0.1, 0.1, 0.22 * v); break;
        case "tick": osc("square", 1400 + Math.random() * 300, t, 0.025, 0.08); break;
        case "got": osc("triangle", 1568, t, 0.12, 0.25); osc("triangle", 2093, t + 0.06, 0.18, 0.2); break;
        case "launch": osc("square", 220, t, 0.18, 0.3 * v, 880, 0.4); hiss(t, 0.15, 0.25 * v, "highpass", 3000); break;
        case "ping": osc("sine", 1760, t, 0.18, 0.25 * v, 0, 0.05); osc("sine", 2637, t, 0.14, 0.12 * v, 0, 0.05); break;
        case "drop": hiss(t, 0.18, 0.45 * v, "bandpass", 900, 1.4); osc("triangle", 300, t, 0.12, 0.25 * v, 160); break;
        case "turbo": hiss(t, 0.7, 0.4 * v, "bandpass", 600, 0.9, 4000, 0.05); osc("sawtooth", 140, t, 0.6, 0.18 * v, 420, 0.7); break;
        case "shield": osc("sine", 523, t, 0.5, 0.2 * v, 1046, 0.6); osc("triangle", 1568, t + 0.1, 0.4, 0.12 * v, 0, 0.2); break;
        case "block": osc("sine", 2093, t, 0.3, 0.28 * v, 0, 0.05); osc("sine", 3136, t, 0.25, 0.18 * v, 0, 0.05); hiss(t, 0.12, 0.3 * v, "highpass", 5000); break;
        case "pop": osc("sine", 900, t, 0.08, 0.25 * v, 300); hiss(t, 0.06, 0.25 * v, "highpass", 3000); break;
        case "hit": hiss(t, 0.35, 0.8 * v, "lowpass", 1400, 0.8, 300); osc("square", 520, t, 0.45, 0.22 * v, 110, 0.3); osc("sine", 90, t, 0.25, 0.6 * v, 40, 0.1); break;
        case "score": osc("square", 988, t + 0.12, 0.08, 0.2); osc("square", 1319, t + 0.2, 0.14, 0.2); break;
        case "bump": osc("sine", 120, t, 0.14, 0.6 * (x || 0.5), 60, 0.1); hiss(t, 0.06, 0.2 * (x || 0.5), "lowpass", 900); break;
        case "wall": hiss(t, 0.14, 0.5 * (x || 0.5), "bandpass", 2600, 1.2, 900); osc("sine", 100, t, 0.12, 0.5 * (x || 0.5), 50, 0.1); break;
        case "pad": osc("sawtooth", 300, t, 0.35, 0.16, 1200, 0.6); hiss(t, 0.4, 0.25, "bandpass", 1200, 0.9, 5000); break;
        case "hop": osc("square", 330, t, 0.07, 0.12, 520); break;
        case "charge": osc("square", x === 2 ? 1175 : 880, t, 0.07, 0.14); osc("square", x === 2 ? 1568 : 1175, t + 0.06, 0.08, 0.14); break;
        case "mini": osc("sawtooth", x === 2 ? 220 : 180, t, 0.4, 0.2, x === 2 ? 900 : 600, 0.6); hiss(t, 0.4, 0.3, "bandpass", 800, 0.9, 3500, 0.03); break;
      }
    } catch (e) { /* sound is never worth a crash */ }
  }
  function label() {
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      if (b.dataset.icon) {
        b.innerHTML = musicOn ? ICON_NOTE : ICON_NOTE_OFF;
        b.setAttribute("aria-label", musicOn ? "Turn music off" : "Turn music on");
      } else b.textContent = musicOn ? "MUSIC: ON" : "MUSIC: OFF";
      b.setAttribute("aria-pressed", musicOn ? "true" : "false");
    }
  }
  function setMusic(on) {
    musicOn = !!on;
    try { localStorage.setItem(MUSIC_KEY, musicOn ? "1" : "0"); } catch (e) { /* private mode */ }
    label();
  }
  // A "MUSIC: ON / OFF" button in the shell's button style (title card, pause card)...
  function button(parent, before) {
    if (!parent) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-btn"; b.setAttribute("data-np-music", "");
    b.style.cssText = "width:100%;margin-top:8px";
    b.addEventListener("click", function (e) { e.stopPropagation(); unlock(); setMusic(!musicOn); });
    parent.insertBefore(b, before || null);
    buttons.push(b); label();
  }
  // ...and a note icon in the top bar, next to the shell's mute button, for during a race.
  function barButton() {
    const mute = document.getElementById("np-mute");
    if (!mute || !mute.parentNode) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-icon"; b.id = "bk-music"; b.dataset.icon = "1";
    b.addEventListener("click", function (e) {
      e.stopPropagation(); unlock(); setMusic(!musicOn);
      if (e.detail > 0 && window.Shell && Shell.state() === "playing") { try { document.getElementById("np-canvas").focus({ preventScroll: true }); } catch (er) { /* ignore */ } }
    });
    mute.parentNode.insertBefore(b, mute);
    buttons.push(b); label();
  }
  return {
    unlock: unlock, pump: pump, cue: cue, button: button, barButton: barButton,
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    peek: function () { return { made: !!A, state: A ? A.c.state : "none", music: !!stopMusic, musicOn: musicOn, muted: muted }; }
  };
})();
const ICON_NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 4l11-2v13.5a3 3 0 1 1-2-2.83V6.2l-7 1.3v10a3 3 0 1 1-2-2.83z"/></svg>';
const ICON_NOTE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" opacity=".45" d="M9 4l11-2v13.5a3 3 0 1 1-2-2.83V6.2l-7 1.3v10a3 3 0 1 1-2-2.83z"/><path fill="none" stroke="currentColor" stroke-width="2.4" d="M3 3l18 18"/></svg>';

/* ---------------- Particles ---------------- */
// 3D sparks and puffs live in the world (drawn by one points mesh); confetti is drawn flat on the HUD.
const P3 = [], CONF = [];
const PCOL = [
  ["#fff6c8", "#ffd23f", "#ff9214"],                      // 0 sparks
  ["#ff3fa4", "#3ff0ff", "#9bff3f", "#ffd23f", "#a77bff"],   // 1 prize cube
  ["#ffffff", "#c8d4e6", "#8fa8d6"],                      // 2 pinball
  ["#3a2416", "#1b1d26", "#8a5a33"],                      // 3 tape
  ["#3ff0ff", "#ffffff", "#9fe8ff"],                      // 4 shield
  ["#ffd23f", "#ffffff", "#ff4b3e"],                      // 5 hit stars
  ["#d8c4a0", "#b8a888", "#e8dcc4"],                      // 6 dust
  ["#4ad0ff", "#bff4ff", "#2f7bff"],                      // 7 blue mini-turbo
  ["#ff9214", "#ffd23f", "#ff4b3e"],                      // 8 orange mini-turbo
  ["#ff6a2a", "#ffd23f", "#fff6c8"]                       // 9 flame
];
let fxMul = 1;
function addP(x, y, z, vx, vy, vz, life, size, kind, grav) {
  if (P3.length > 520) P3.shift();
  const c = PCOL[kind];
  P3.push({ x: x, y: y, z: z, vx: vx, vy: vy, vz: vz, life: life, max: life, size: size, col: c[(Math.random() * c.length) | 0], g: grav == null ? 9 : grav, mix: kind === 3 || kind === 6 });
}
function burst3(x, y, z, n, kind) {
  n = Math.ceil(n * fxMul);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, e = Math.random() * 1.2, s = 3 + Math.random() * 6;
    addP(x, y, z, Math.cos(a) * s * Math.cos(e), 2 + Math.sin(e) * s, Math.sin(a) * s * Math.cos(e), 0.5 + Math.random() * 0.5, kind === 5 ? 0.24 : 0.18, kind, 12);
  }
}
function spark(x, y, z, n, kind) {
  n = Math.ceil(n * fxMul);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 2 + Math.random() * 5;
    addP(x, y, z, Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s, 0.25 + Math.random() * 0.25, 0.12, kind, 14);
  }
}
const CONF_COLS = ["#ffd23f", "#3ff0ff", "#ff3fa4", "#9bff3f", "#ff9214", "#ffffff"];
function burst2(n) {
  if (Shell.reduced) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 60 + Math.random() * 180;
    CONF.push({ x: W / 2, y: 210, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 90, life: 1.4 + Math.random() * 0.6, c: CONF_COLS[i % CONF_COLS.length], rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14 });
  }
}
function updateParts(dt) {
  for (let i = P3.length - 1; i >= 0; i--) {
    const p = P3[i];
    p.life -= dt;
    if (p.life <= 0) { P3.splice(i, 1); continue; }
    p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.05) { p.y = 0.05; p.vy = Math.abs(p.vy) * 0.3; p.vx *= 0.7; p.vz *= 0.7; }
  }
  for (let i = CONF.length - 1; i >= 0; i--) {
    const q = CONF[i];
    q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 200 * dt; q.vx *= 0.99; q.rot += q.vr * dt;
    if (q.life <= 0) CONF.splice(i, 1);
  }
}

/* ---------------- Input: keys, and the on-screen buttons for touch ---------------- */
function pointer() { /* the shell only reports one finger: the touch controls below read every finger themselves */ }
function key(type, code, e) {
  if (type === "down") {
    keys[code] = true;
    if ((code === "Space" || code === "Enter" || code === "NumpadEnter" || code === "KeyE") && !e.repeat) S.itemReq = true;
  } else keys[code] = false;
}
// The pad on the left steers (slide along it); the cluster on the right is item, brake, drift and gas.
// Drift holds the gas down too, so one thumb can sit on GAS and roll onto DRIFT through a bend.
const TC = {
  pad: { x: 8, y: 436, w: 164, h: 94 },
  item: { x: 246, y: 414, r: 27, label: "ITEM" }, brake: { x: 322, y: 412, r: 22, label: "BRAKE" },
  drift: { x: 238, y: 486, r: 29, label: "DRIFT" }, gas: { x: 314, y: 484, r: 40, label: "GAS" }
};
const fingers = new Map();
function tcHit(x, y) {
  const p = TC.pad;
  if (x >= p.x - 6 && x <= p.x + p.w + 10 && y >= p.y - 14 && y <= p.y + p.h + 10) return "pad";
  let best = null, bd = 1e9;
  ["item", "brake", "drift", "gas"].forEach(function (n) {
    const b = TC[n], d = Math.hypot(x - b.x, y - b.y) - b.r;
    if (d < 10 && d < bd) { bd = d; best = n; }
  });
  return best;
}
function touchState() {
  const o = { active: false, steer: 0, gas: false, brake: false, drift: false };
  fingers.forEach(function (f) {
    if (f.btn === "pad") {
      o.active = true;
      const p = TC.pad, u = (f.x - (p.x + p.w / 2)) / (p.w * 0.36);
      o.steer = Math.abs(u) < 0.08 ? 0 : clamp(u, -1, 1);
    } else if (f.btn === "gas" || f.btn === "drift" || (f.btn === "item" && f.wasGas)) o.gas = true;
    if (f.btn === "brake") o.brake = true;
    if (f.btn === "drift") o.drift = true;
  });
  return o;
}
function bindTouch(cv) {
  function loc(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / (r.width / W), y: (e.clientY - r.top) / (r.height / H) }; }
  function set(f, btn) {
    if (btn === "item" && f.btn !== "item") S.itemReq = true;
    if (btn === "gas" || btn === "drift") f.wasGas = true;
    else if (btn !== "item") f.wasGas = false;
    f.btn = btn;
  }
  cv.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "touch" || e.pointerType === "pen") touchMode = true;
    if (!window.Shell || Shell.state() !== "playing" || !touchMode) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    const p = loc(e), f = { x: p.x, y: p.y, btn: null, wasGas: false };
    set(f, tcHit(p.x, p.y));
    fingers.set(e.pointerId, f);
  }, { passive: false });
  cv.addEventListener("pointermove", function (e) {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    const p = loc(e);
    f.x = p.x; f.y = p.y;
    const b = f.btn === "pad" ? (tcHit(p.x, p.y) === "pad" || p.x < TC.pad.x + TC.pad.w + 30 ? "pad" : tcHit(p.x, p.y)) : tcHit(p.x, p.y);
    if (b !== f.btn) set(f, b);
  }, { passive: true });
  function up(e) { fingers.delete(e.pointerId); }
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up); cv.addEventListener("lostpointercapture", up);
}

/* ---------------- LED ribbon board ----------------
   The same dot matrix as the lanes and the ballpark: everything on it is painted into a small canvas, one pixel
   per LED, and a little shader turns each pixel into a glowing dot. One canvas feeds every board on the track
   (the start gantry and two trackside boards). It scrolls its programme right to left and cuts to big animated
   messages when the race calls for one. */
const LED_ROWS = 26, LED_COLS = 300;
const LED_SAFE = LED_COLS - 24;
const LED_SPEED = 44;
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["BE KIND, REWIND", "pink"], ["NO QUARTERS REQUIRED", "cyan"], ["BATTLE KARTS", "lime"]];
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
function ledStrip(script) {
  const HH = LED_ROWS, big = LED_BIG, yBig = Math.floor((HH - 7 * big) / 2), GAP = 13, items = [];
  const markW = Math.max(8, Math.round(HH * script.width / script.height));
  const markC = mkCanvas(markW, HH), mg = markC.getContext("2d", { willReadFrequently: true });
  mg.imageSmoothingEnabled = true; mg.imageSmoothingQuality = "high";
  mg.drawImage(script, 0, 0, markW, HH);
  try {                                                    // the cream lettering at full brightness, the red rim dimmer, the navy dark
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
    ledText(g, "*", x, Math.floor((HH - 7) / 2), 1, 1, LED_C.blue);
    x += 7 + GAP;
  }
  return { canvas: c, markW: items[0].w };
}
function ledCreate(script) {
  const c = mkCanvas(LED_COLS, LED_ROWS), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  const strip = ledStrip(script), sw = strip.canvas.width;
  const start = ((-(LED_COLS - strip.markW) / 2) % sw + sw) % sw;
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
// kind: "flash" (strobe and chevrons), "slide", "cycle", "blink" or "count" (label, a number that counts up)
function ledMsg(kind, text, dur, more) {
  const m = { kind: kind, text: text, dur: dur, t: 0, wait: 0, color: "amber" };
  if (more) for (const k in more) m[k] = more[k];
  return m;
}
function ledPlay(list, append) {
  const L = LED;
  if (!L || !list.length || (S && (S.demo || S.after))) return;
  if (append && L.msg) { for (let i = 0; i < list.length; i++) L.queue.push(list[i]); return; }
  if (!list.some(function (m) { return m.keep; })) {
    const old = (L.msg && L.msg.keep ? [L.msg] : []).concat(L.queue.filter(function (m) { return m.keep; }));
    if (old.length) { old[0].t = 0; list = list.concat(old); }
  }
  L.msg = list[0]; L.msg.t = 0;
  L.queue = list.slice(1);
  L.frame = -1;
}
function ledClear() {
  if (!LED) return;
  LED.msg = null; LED.queue = []; LED.pos = -1; LED.lastScore = 0;
}
function ledFinal(score) {
  if (!LED) return;
  const L = LED, list = [ledMsg("count", "SCORE", 8, { from: 0, value: score, final: true, wait: 0.3 })];
  L.msg = list[0]; L.queue = []; L.frame = -1;
}
function ledDrawMsg(g, m) {
  const WW = LED_COLS, HH = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(WW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.amber;
  function fit(str) { let sx = big + 1; while (sx > 1 && ledTextW(str, sx) > LED_SAFE) sx--; return sx; }
  function chase(color, dir) {
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < WW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(WW - x - 3, HH - 1, 3, 1); }
  }
  if (m.kind === "count") {
    const k = calm ? 1 : Math.min(1, t / 0.7), v = Math.round(m.from + (m.value - m.from) * k);
    const label = m.text ? m.text + " " : "", suffix = m.suffix || "", sxc = Math.min(big, fit(label + m.value + suffix));
    const x = Math.round((WW - ledTextW(label + m.value + suffix, sxc)) / 2);
    const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
    let xn = ledText(g, label, x, yBig, sxc, big, LED_C.amber);
    xn = ledText(g, String(v), xn, yBig, sxc, big, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
    ledText(g, suffix, xn, yBig, sxc, big, LED_C.amber);
    if (!calm && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(WW * m.t / 0.3), 0, WW, HH); }
    chase(LED_C.amber, 1);
    return;
  }
  const sx = fit(m.text), w = ledTextW(m.text, sx), x0 = Math.round((WW - w) / 2);
  if (m.kind === "flash") {
    if (!calm && t < 0.6 && Math.floor(t * 12) % 2 === 0) {
      g.fillStyle = LED_C.yellow; g.fillRect(0, 0, WW, HH);
      ledText(g, m.text, x0, yBig, sx, big, "#000000");
      return;
    }
    const span = 6 * big + 5, ph = calm ? 0 : Math.floor((t * 46) % span);
    for (let k = 0; k < 12; k++) {
      const off = Math.round(w / 2) + 9 + k * span + ph;
      if (off > mid + span) break;
      const cc = k % 2 ? LED_C.red : LED_C.orange;
      ledText(g, ">", mid + off, yBig, big, big, cc);
      ledText(g, "<", mid - off - 5 * big, yBig, big, big, cc);
    }
    const cyc = [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0, yBig, sx, big, calm ? LED_C.yellow : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 14; i++) g.fillRect((Math.random() * WW) | 0, (Math.random() * HH) | 0, 1, 1); }
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "slide") {
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
  if (m.kind === "cycle") {
    const cyc = [LED_C.yellow, LED_C.pink, LED_C.cyan, LED_C.lime, LED_C.orange];
    let x = x0;
    for (let i = 0; i < m.text.length; i++) x = ledText(g, m.text[i], x, yBig, sx, big, cyc[(i + (calm ? 0 : Math.floor(t * 9))) % cyc.length]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 10; i++) g.fillRect((Math.random() * WW) | 0, (Math.random() * HH) | 0, 1, 1); }
    chase(LED_C.yellow, 1);
    return;
  }
  if (calm || t > 1.1 || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, yBig, sx, big, col);
  g.fillStyle = col; g.fillRect(0, HH - 1, WW, 1); g.fillRect(0, 0, WW, 1);
}
function ledDraw() {
  const L = LED, g = L.g, HH = LED_ROWS;
  g.fillStyle = "#000000"; g.fillRect(0, 0, LED_COLS, HH);
  if (L.msg) { ledDrawMsg(g, L.msg); return; }
  const sw = L.strip.width;
  let sx = L.pos, dx = 0;
  while (dx < LED_COLS) {
    const n = Math.min(LED_COLS - dx, sw - sx);
    g.drawImage(L.strip, sx, 0, n, HH, dx, 0, n, HH);
    dx += n; sx = 0;
  }
}
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

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every sign, board and kart on the tracks
// uses this (the full logo with the mascot is kept for the splash, the title card and the score card).
// If the PNG is missing, plain lettering stands in.
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

/* ---------------- Track themes ---------------- */
const THEMES = {
  canyon: { clear: 0x9fd2ff, fog: 0xf0d6ac, fogNear: 150, fogFar: 560, sky: ["#2f7bf0", "#8fcfff", "#ffe6b8"], night: false,
            road: "#5a5450", line: "#ffffff", dash: "#ffd21f", curb: ["#e3231a", "#ffffff"], shoulder: ["#d6ad6f", "#c99c5c"],
            hemi: [0xffffff, 0xd9b98a, 1.25], sun: [0xfff2dc, 2.4], sunPos: [-160, 260, 120], walls: ["#ff4b3e", "#16b9e8", "#ff3fa4", "#58c322", "#ffb81f", "#8a5cff"] },
  rewind: { clear: 0x0b0628, fog: 0x2a0f52, fogNear: 110, fogFar: 470, sky: ["#04021a", "#24094e", "#ff3fa4"], night: true,
            road: "#26222f", line: "#ff3fa4", dash: "#3ff0ff", curb: ["#ff3fa4", "#3ff0ff"], shoulder: ["#1a0e34", "#231446"],
            hemi: [0xc8b8ff, 0x40207a, 1.35], sun: [0xffd0f0, 1.6], sunPos: [120, 220, -200], walls: ["#ff3fa4", "#3ff0ff", "#ffd21f", "#9bff3f", "#ff9214", "#a77bff"] },
  arcade: { clear: 0x24144d, fog: 0x3a2068, fogNear: 120, fogFar: 480, sky: ["#0e0730", "#4f2486", "#ff9a4a"], night: true,
            road: "#333b5c", line: "#3ff0ff", dash: "#ffe45c", curb: ["#ffd21f", "#1b56cf"], shoulder: ["#1c2c80", "#22359a"],
            hemi: [0xffffff, 0x6a4aa8, 1.3], sun: [0xffe8d0, 2.0], sunPos: [-140, 240, 160], walls: ["#9aa0ad", "#c2c5d0", "#ff4b3e", "#ffd21f", "#16b9e8", "#58c322"] }
};

/* ---------------- Painted textures (all drawn here, no image files besides the wordmark) ---------------- */
// Road: across the canvas is curb to curb (2 * HW), down it is 10 m of track.
function roadCanvas(th) {
  const c = mkCanvas(256, 512), g = c.getContext("2d"), rnd = rng(3);
  g.fillStyle = th.road; g.fillRect(0, 0, 256, 512);
  speckle(g, 256, 512, 9000, rnd, "rgba(255,255,255,.06)", "rgba(0,0,0,.12)");
  for (let i = 0; i < 5; i++) { g.fillStyle = "rgba(0,0,0,.08)"; g.fillRect(58 + i * 34 + rnd() * 8, 0, 14, 512); }   // the racing line, worn darker
  g.fillStyle = th.line; g.fillRect(6, 0, 5, 512); g.fillRect(245, 0, 5, 512);
  g.fillStyle = th.dash; g.fillRect(125, 0, 6, 215);
  if (th.night) {                                          // the lines glow a little at night
    g.globalAlpha = 0.35; g.fillStyle = th.line; g.fillRect(3, 0, 11, 512); g.fillRect(242, 0, 11, 512); g.globalAlpha = 1;
  }
  return c;
}
function curbCanvas(th) {
  const c = mkCanvas(64, 128), g = c.getContext("2d");
  g.fillStyle = th.curb[0]; g.fillRect(0, 0, 64, 64);
  g.fillStyle = th.curb[1]; g.fillRect(0, 64, 64, 64);
  g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, 0, 8, 128);
  g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(52, 0, 12, 128);
  return c;
}
function shoulderCanvas(th) {
  const c = mkCanvas(128, 128), g = c.getContext("2d"), rnd = rng(9);
  g.fillStyle = th.shoulder[0]; g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 1400, rnd, th.night ? "rgba(255,120,220,.10)" : "rgba(255,240,210,.22)", "rgba(0,0,0,.14)", 2.5);
  if (th === THEMES.arcade) { g.fillStyle = "rgba(255,255,255,.06)"; for (let y = 4; y < 128; y += 8) g.fillRect(0, y, 128, 3); }   // rubber mat ribs
  return c;
}
// The ground beyond the walls. sand: dunes; grid: a neon floor grid; carpet: arcade carpet.
function groundCanvas(id) {
  const N = 512, c = mkCanvas(N, N), g = c.getContext("2d"), rnd = rng(41);
  if (id === "canyon") {
    g.fillStyle = "#e0b676"; g.fillRect(0, 0, N, N);
    for (let y = 0; y < N; y += 6) {
      g.strokeStyle = y % 12 ? "rgba(255,236,200,.22)" : "rgba(160,110,50,.18)"; g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x <= N; x += 8) g.lineTo(x, y + Math.sin(x / N * TAU * 2 + y * 0.05) * 5);
      g.stroke();
    }
    speckle(g, N, N, 7000, rnd, "rgba(255,250,235,.2)", "rgba(120,80,30,.16)", 2);
    for (let i = 0; i < 26; i++) {                         // pebbles, wrapped so the tile repeats
      const x = rnd() * N, y = rnd() * N, r = 2 + rnd() * 5;
      for (let ox = -N; ox <= N; ox += N) for (let oy = -N; oy <= N; oy += N) {
        g.fillStyle = "rgba(120,80,40,.35)"; g.beginPath(); g.ellipse(x + ox + 1, y + oy + 1.5, r, r * 0.7, 0, 0, TAU); g.fill();
        g.fillStyle = "#c69a62"; g.beginPath(); g.ellipse(x + ox, y + oy, r, r * 0.7, 0, 0, TAU); g.fill();
      }
    }
  } else if (id === "rewind") {
    g.fillStyle = "#120728"; g.fillRect(0, 0, N, N);
    for (let k = 0; k < 4; k++) {
      const p = k * 128;
      [[10, "rgba(255,63,164,.10)"], [5, "rgba(255,63,164,.28)"], [2, "#ff6ad0"]].forEach(function (s) {
        g.fillStyle = s[1]; g.fillRect(p - s[0] / 2, 0, s[0], N); g.fillRect(0, p - s[0] / 2, N, s[0]);
        g.fillRect(p + N - s[0] / 2, 0, s[0], N); g.fillRect(0, p + N - s[0] / 2, N, s[0]);
      });
    }
  } else {
    g.fillStyle = "#0f1550"; g.fillRect(0, 0, N, N);
    speckle(g, N, N, 6000, rnd, "rgba(255,255,255,.04)", "rgba(0,0,30,.12)", 2);
    const cols = ["#ff9214", "#ffd21f", "#ff5aa8", "#3fe0ff", "#8a6bff", "#58d94a"];
    g.lineCap = "round"; g.lineJoin = "round";
    for (let i = 0; i < 40; i++) {
      const x = rnd() * N, y = rnd() * N, a = rnd() * TAU, kind = i % 5, col = cols[i % cols.length], sz = 14 + rnd() * 14;
      for (let ox = -N; ox <= N; ox += N) for (let oy = -N; oy <= N; oy += N) {
        g.save(); g.translate(x + ox, y + oy); g.rotate(a);
        g.globalAlpha = 0.7; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 4;
        if (kind === 0) { g.beginPath(); g.arc(0, 0, sz * 0.55, 0, TAU); g.stroke(); g.beginPath(); g.ellipse(0, 0, sz, sz * 0.25, 0.4, 0, TAU); g.stroke(); }   // ringed planet
        else if (kind === 1) { g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? sz * 0.25 : sz * 0.6, q = k * Math.PI / 5; g.lineTo(Math.cos(q) * r, Math.sin(q) * r); } g.closePath(); g.fill(); }   // star
        else if (kind === 2) { g.beginPath(); g.moveTo(-sz, sz * 0.3); g.lineTo(-sz * 0.5, -sz * 0.3); g.lineTo(0, sz * 0.3); g.lineTo(sz * 0.5, -sz * 0.3); g.lineTo(sz, sz * 0.3); g.stroke(); }
        else if (kind === 3) { g.beginPath(); g.moveTo(0, -sz * 0.6); g.lineTo(sz * 0.55, sz * 0.45); g.lineTo(-sz * 0.55, sz * 0.45); g.closePath(); g.stroke(); }
        else { g.fillRect(-sz * 0.35, -sz * 0.35, sz * 0.7, sz * 0.7); }
        g.restore();
      }
    }
  }
  return c;
}
// The prop the walls are built from: a game box (canyon), a tape (rewind), a cartridge (arcade). Painted
// light so each one can be tinted its own color.
function wallCanvas(id) {
  const c = mkCanvas(256, 128), g = c.getContext("2d");
  if (id === "canyon") {
    g.fillStyle = "#f4f4f4"; g.fillRect(0, 0, 256, 128);
    g.save(); g.globalAlpha = 0.2; g.fillStyle = "#ffffff";
    for (let x = -128; x < 256; x += 30) { g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 128, 0); g.lineTo(x + 140, 0); g.lineTo(x + 12, 128); g.closePath(); g.fill(); }
    g.restore();
    g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, 0, 256, 6); g.fillRect(0, 122, 256, 6);
    rrectPath(g, 70, 34, 116, 60, 12); g.fillStyle = "#0d1f5c"; g.fill();
    g.lineWidth = 4; g.strokeStyle = "#fff3cf"; g.stroke();
    g.fillStyle = "#fff3cf"; g.fillRect(88, 54, 80, 7); g.fillRect(96, 68, 64, 6);
  } else if (id === "rewind") {
    g.fillStyle = "#111218"; g.fillRect(0, 0, 256, 128);
    g.fillStyle = "#f2f2f2"; g.fillRect(18, 16, 220, 46);
    g.fillStyle = "#c8c8c8"; g.fillRect(18, 26, 220, 5);
    g.fillStyle = "#0b0c10"; g.fillRect(40, 40, 120, 4); g.fillRect(40, 48, 80, 4);
    g.fillStyle = "#22242e"; rrectPath(g, 60, 72, 136, 40, 8); g.fill();
    g.fillStyle = "#4a4e5e"; g.beginPath(); g.arc(98, 92, 14, 0, TAU); g.arc(158, 92, 14, 0, TAU); g.fill();
    g.fillStyle = "#111218"; g.beginPath(); g.arc(98, 92, 5, 0, TAU); g.arc(158, 92, 5, 0, TAU); g.fill();
  } else {
    g.fillStyle = "#b8bcc8"; g.fillRect(0, 0, 256, 128);
    for (let y = 10; y < 118; y += 9) { g.fillStyle = "#8a8e9c"; g.fillRect(10, y, 40, 4); g.fillRect(206, y, 40, 4); }
    rrectPath(g, 62, 10, 132, 108, 8); g.fillStyle = "#1a1b22"; g.fill();
    rrectPath(g, 68, 16, 120, 96, 6); g.fillStyle = "#ffffff"; g.fill();
    g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(68, 80, 120, 32);
  }
  return c;
}
// Billboards around the track. kind 0: wordmark + BATTLE KARTS, 1: the wordmark alone, 2: wordmark + the site.
function boardCanvas(script, kind) {
  const c = mkCanvas(1024, 320), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 320);
  if (kind === 1) { bg.addColorStop(0, "#ff7ac6"); bg.addColorStop(1, "#d81f86"); }
  else { bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6"); }
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 320);
  const gl = g.createLinearGradient(0, 0, 0, 150);
  gl.addColorStop(0, "rgba(255,255,255,.42)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.beginPath(); g.ellipse(512, -20, 620, 170, 0, 0, TAU); g.fill();
  g.lineWidth = 16; g.strokeStyle = kind === 1 ? "#ffd21f" : "#ff9214"; g.strokeRect(8, 8, 1008, 304);
  g.lineWidth = 4; g.strokeStyle = "#ffe45c"; g.strokeRect(19, 19, 986, 282);
  if (kind === 0) {
    drawScript(g, script, 340, 162, 590, 250);
    candyText(g, "BATTLE", 826, 118, 80, 330);
    candyText(g, "KARTS", 826, 214, 92, 330);
  } else if (kind === 1) {
    drawScript(g, script, 512, 162, 900, 270);
  } else {
    drawScript(g, script, 512, 120, 700, 190);
    candyText(g, "FREE AT THENOSTALGIAPRO.COM", 512, 262, 56, 900);
  }
  return c;
}
function checkerCanvas() {
  const c = mkCanvas(256, 64), g = c.getContext("2d");
  for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? "#111111" : "#f8f8f8"; g.fillRect(x * 32, y * 32, 32, 32); }
  return c;
}
// A prize cube's face: a candy frame and a star.
function cubeCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 128, 128);
  ["#ff3fa4", "#ffd21f", "#9bff3f", "#3ff0ff", "#a77bff"].forEach(function (col, i) { gr.addColorStop(i / 4, col); });
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  rrectPath(g, 12, 12, 104, 104, 16); g.fillStyle = "rgba(255,255,255,.55)"; g.fill();
  g.beginPath();
  for (let k = 0; k < 10; k++) { const r = k % 2 ? 17 : 40, q = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(64 + Math.cos(q) * r, 66 + Math.sin(q) * r); }
  g.closePath(); g.fillStyle = "#ffffff"; g.fill(); g.lineWidth = 5; g.strokeStyle = "#ff9214"; g.stroke();
  return c;
}
function chevronCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  g.fillStyle = "#0d2f8a"; g.fillRect(0, 0, 64, 64);
  g.lineJoin = "miter"; g.lineCap = "butt";
  [["#0a2266", 13, 3], ["#3fe0ff", 9, 0], ["#e8fdff", 3, -2]].forEach(function (s) {
    g.strokeStyle = s[0]; g.lineWidth = s[1];
    for (let o = -64; o <= 64; o += 64) { g.beginPath(); g.moveTo(4, 50 + o + s[2]); g.lineTo(32, 20 + o + s[2]); g.lineTo(60, 50 + o + s[2]); g.stroke(); }
  });
  return c;
}
function skyCanvas(th) {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(11);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, th.sky[0]); gr.addColorStop(0.62, th.sky[1]); gr.addColorStop(1, th.sky[2]);
  g.fillStyle = gr; g.fillRect(0, 0, 512, 128);
  g.fillStyle = th.sky[2]; g.fillRect(0, 128, 512, 128);
  if (th.night) for (let i = 0; i < 180; i++) {
    const y = rnd() * 92, s = rnd() < 0.2 ? 1.6 : 1;
    g.fillStyle = "rgba(255,255,255," + (0.3 + rnd() * 0.6) * (1 - y / 110) + ")"; g.fillRect(rnd() * 512, y, s, s);
  }
  return c;
}
// The ring of scenery on the horizon (mesas, a neon skyline, giant shelves).
function horizonCanvas(id) {
  const c = mkCanvas(1024, 128), g = c.getContext("2d"), rnd = rng(47);
  let x = 0;
  while (x < 1024) {
    const w = 30 + rnd() * 70, h = 26 + rnd() * 80;
    if (id === "canyon") {
      g.fillStyle = rnd() < 0.5 ? "#c47a46" : "#b06a3c";
      g.beginPath(); g.moveTo(x, 128); g.lineTo(x + w * 0.12, 128 - h); g.lineTo(x + w * 0.88, 128 - h); g.lineTo(x + w, 128); g.fill();
      g.fillStyle = "rgba(255,220,170,.25)"; g.fillRect(x + w * 0.12, 128 - h, w * 0.76, 4);
      x += w * 0.85 + rnd() * 40;
    } else if (id === "rewind") {
      g.fillStyle = rnd() < 0.5 ? "#1a0b3a" : "#220e48"; g.fillRect(x, 128 - h, w * 0.6 + 1, h);
      g.fillStyle = rnd() < 0.5 ? "#ff3fa4" : "#3ff0ff"; g.fillRect(x, 128 - h, w * 0.6, 2);
      for (let wy = 128 - h + 6; wy < 124; wy += 8) for (let wx = x + 3; wx < x + w * 0.6 - 4; wx += 6) {
        if (rnd() < 0.3) { g.fillStyle = rnd() < 0.6 ? "#ff7ad0" : "#7fe8ff"; g.fillRect(wx, wy, 3, 4); }
      }
      x += w * 0.6;
    } else {
      const shelfH = 34 + rnd() * 60;
      g.fillStyle = "#2a1858"; g.fillRect(x, 128 - shelfH, w + 1, shelfH);
      for (let sy = 128 - shelfH + 4; sy < 124; sy += 16) {
        let bx = x + 2;
        while (bx < x + w - 6) {
          const bw = 4 + rnd() * 6;
          g.fillStyle = ["#ff4b3e", "#16b9e8", "#ffd21f", "#58c322", "#ff3fa4", "#8a5cff"][(rnd() * 6) | 0];
          g.globalAlpha = 0.55; g.fillRect(bx, sy, bw, 12); g.globalAlpha = 1;
          bx += bw + 1;
        }
        g.fillStyle = "#3a2470"; g.fillRect(x, sy + 12, w, 3);
      }
      x += w;
    }
  }
  return c;
}
function sunCanvas(id) {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  if (id === "canyon") {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, "rgba(255,255,240,1)"); gr.addColorStop(0.2, "rgba(255,248,210,.9)"); gr.addColorStop(1, "rgba(255,230,170,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return c;
  }
  const gr = g.createLinearGradient(0, 20, 0, 236);
  gr.addColorStop(0, id === "rewind" ? "#ffe838" : "#ffd27a"); gr.addColorStop(1, id === "rewind" ? "#ff2f96" : "#ff5a3a");
  g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 108, 0, TAU); g.fill();
  g.globalCompositeOperation = "destination-out";
  for (let k = 0; k < 7; k++) { const y = 140 + k * 14, h = 2 + k * 1.4; g.fillRect(0, y, 256, h); }
  return c;
}
// The giant scenery: a cartridge label, a tape label, an arcade cabinet's marquee and screen, a token.
function cartFaceCanvas(script, col) {
  const c = mkCanvas(256, 320), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 320);
  bg.addColorStop(0, "#c8cbd6"); bg.addColorStop(1, "#9296a4");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 320);
  for (let y = 14; y < 70; y += 11) { g.fillStyle = "#6c7080"; g.fillRect(24, y, 208, 5); g.fillStyle = "#e4e6ee"; g.fillRect(24, y + 5, 208, 2); }
  rrectPath(g, 26, 86, 204, 206, 14); g.fillStyle = "#16171d"; g.fill();
  rrectPath(g, 34, 94, 188, 190, 10);
  const lb = g.createLinearGradient(0, 94, 0, 284);
  lb.addColorStop(0, shade(col, 0.35)); lb.addColorStop(1, col);
  g.fillStyle = lb; g.fill();
  rrectPath(g, 46, 150, 164, 80, 12); g.fillStyle = "#0d1f5c"; g.fill();
  drawScript(g, script, 128, 190, 150, 70);
  g.fillStyle = "rgba(255,255,255,.55)"; g.fillRect(46, 112, 120, 10); g.fillRect(46, 128, 80, 8);
  return c;
}
function tapeFaceCanvas(script) {
  const c = mkCanvas(512, 288), g = c.getContext("2d");
  g.fillStyle = "#111218"; g.fillRect(0, 0, 512, 288);
  rrectPath(g, 30, 22, 452, 130, 10); g.fillStyle = "#f4efdf"; g.fill();
  g.fillStyle = "#ff3fa4"; g.fillRect(30, 40, 452, 16);
  drawScript(g, script, 256, 110, 300, 70);
  rrectPath(g, 96, 172, 320, 92, 16); g.fillStyle = "#24262f"; g.fill();
  [176, 336].forEach(function (x) {
    g.fillStyle = "#3a2416"; g.beginPath(); g.arc(x, 218, 40, 0, TAU); g.fill();
    g.fillStyle = "#e8e8e8"; g.beginPath(); g.arc(x, 218, 15, 0, TAU); g.fill();
    g.fillStyle = "#111218"; for (let k = 0; k < 6; k++) { const q = k * TAU / 6; g.fillRect(x + Math.cos(q) * 9 - 2, 218 + Math.sin(q) * 9 - 2, 4, 4); }
  });
  return c;
}
function marqueeCanvas(script) {
  const c = mkCanvas(512, 160), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 160);
  bg.addColorStop(0, "#ff9ad8"); bg.addColorStop(0.5, "#ff3fa4"); bg.addColorStop(1, "#a0106a");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 160);
  drawScript(g, script, 256, 82, 440, 130);
  return c;
}
function screenCanvas(seed) {
  const c = mkCanvas(256, 200), g = c.getContext("2d"), rnd = rng(seed);
  g.fillStyle = "#050818"; g.fillRect(0, 0, 256, 200);
  g.strokeStyle = "#2f7bff"; g.lineWidth = 6;
  for (let i = 0; i < 9; i++) { const x = 16 + ((rnd() * 7) | 0) * 32, y = 16 + ((rnd() * 5) | 0) * 32; g.strokeRect(x, y, 32 + ((rnd() * 2) | 0) * 32, 6); }
  g.fillStyle = "#ffe838"; for (let x = 24; x < 240; x += 16) for (let y = 24; y < 190; y += 32) if (rnd() < 0.5) g.fillRect(x, y, 4, 4);
  g.fillStyle = "#ffd21f"; g.beginPath(); g.arc(120, 104, 13, 0.6, TAU - 0.6); g.lineTo(120, 104); g.fill();
  ["#ff3fa4", "#3ff0ff", "#9bff3f"].forEach(function (col, i) { g.fillStyle = col; rrectPath(g, 170 + i * 0, 40 + i * 50, 22, 22, 9); g.fill(); });
  g.fillStyle = "#ffffff"; g.font = "bold 14px monospace"; g.fillText("1UP  " + (10000 + seed * 370), 10, 14);
  return c;
}
function tokenCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  const gr = g.createRadialGradient(100, 90, 10, 128, 128, 128);
  gr.addColorStop(0, "#fff2a8"); gr.addColorStop(0.6, "#f0b81c"); gr.addColorStop(1, "#b07a08");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.lineWidth = 10; g.strokeStyle = "#9a6a06"; g.beginPath(); g.arc(128, 128, 104, 0, TAU); g.stroke();
  g.beginPath();
  for (let k = 0; k < 10; k++) { const r = k % 2 ? 26 : 62, q = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(128 + Math.cos(q) * r, 132 + Math.sin(q) * r); }
  g.closePath(); g.fillStyle = "#c98c0a"; g.fill(); g.lineWidth = 4; g.strokeStyle = "#fff2a8"; g.stroke();
  return c;
}
// Kart paint: the number plate on the nose, the name board at the back (wordmark), the tires.
function plateCanvas(num, col) {
  const c = mkCanvas(128, 96), g = c.getContext("2d");
  rrectPath(g, 4, 4, 120, 88, 18); g.fillStyle = "#ffffff"; g.fill();
  g.lineWidth = 6; g.strokeStyle = col; g.stroke();
  g.font = '900 70px "Arial Black", Arial, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#0b1f5c"; g.fillText(num, 64, 52);
  return c;
}
function rearCanvas(script, col, trim) {
  const c = mkCanvas(512, 160), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 160);
  bg.addColorStop(0, shade(col, 0.3)); bg.addColorStop(1, shade(col, -0.2));
  g.fillStyle = bg; g.fillRect(0, 0, 512, 160);
  g.fillStyle = trim; g.fillRect(0, 0, 512, 12); g.fillRect(0, 148, 512, 12);
  rrectPath(g, 40, 22, 432, 116, 22); g.fillStyle = "#0d1f5c"; g.fill();
  drawScript(g, script, 256, 80, 400, 104);
  return c;
}
// One wheel texture: tread on the left half (the tire's side), the hub on the right half (both faces).
function wheelCanvas(col) {
  const c = mkCanvas(256, 128), g = c.getContext("2d");
  g.fillStyle = "#1a1b20"; g.fillRect(0, 0, 256, 128);
  g.fillStyle = "#2c2e36"; for (let y = 0; y < 128; y += 16) { g.fillRect(10, y, 40, 8); g.fillRect(70, y + 8, 40, 8); }
  const cx = 192, cy = 64;
  g.fillStyle = "#d8dce6"; g.beginPath(); g.arc(cx, cy, 40, 0, TAU); g.fill();
  g.fillStyle = col; g.beginPath(); g.arc(cx, cy, 26, 0, TAU); g.fill();
  g.fillStyle = "#d8dce6"; for (let k = 0; k < 5; k++) { g.save(); g.translate(cx, cy); g.rotate(k * TAU / 5); g.fillRect(-4, -32, 8, 32); g.restore(); }
  g.fillStyle = "#555a66"; g.beginPath(); g.arc(cx, cy, 8, 0, TAU); g.fill();
  return c;
}
function blobCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(0,0,10,.75)"); gr.addColorStop(0.55, "rgba(0,0,10,.38)"); gr.addColorStop(1, "rgba(0,0,10,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function dotCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.85)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function tapeTopCanvas() {
  const c = mkCanvas(128, 80), g = c.getContext("2d");
  g.fillStyle = "#16171e"; g.fillRect(0, 0, 128, 80);
  g.fillStyle = "#f4efdf"; g.fillRect(10, 8, 108, 22);
  g.fillStyle = "#ff3fa4"; g.fillRect(10, 12, 108, 5);
  g.fillStyle = "#3a2416"; g.beginPath(); g.arc(40, 52, 15, 0, TAU); g.arc(88, 52, 12, 0, TAU); g.fill();
  return c;
}
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.16, "#dcebff"); gr.addColorStop(0.32, "#3d8cff");
    gr.addColorStop(0.5, "#1648b8"); gr.addColorStop(0.52, "#3a3a46"); gr.addColorStop(1, "#6a6a78");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#2a55b8"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(8, 6, 14, 52); tg.fillRect(42, 6, 14, 52);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#4a4a58"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* ---------------- Geometry helpers ---------------- */
// A box with every edge rounded. Each face keeps its own material slot (+x -x +y -y +z -z), texture stretched corner to corner.
function roundBox(T, w, h, d, r) {
  const s = 3, per = (s + 1) * (s + 1), half = 0.5 / s;
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
// Several geometries baked into one (fewer draw calls). parts: [geometry, matrix]
function merge(T, parts) {
  const P = [], N = [], U = [], v = new T.Vector3(), nm = new T.Matrix3();
  parts.forEach(function (pt) {
    const g = pt[0].index ? pt[0].toNonIndexed() : pt[0], m = pt[1];
    nm.getNormalMatrix(m);
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m); P.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z);
      if (u) U.push(u.getX(i), u.getY(i)); else U.push(0, 0);
    }
  });
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(N, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(U, 2));
  g.computeBoundingSphere();
  return g;
}
// A strip that runs the whole loop from d0 to d1 (right of center), at height y. v repeats every vLen meters.
function ribbon(T, tr, d0, d1, y, vLen) {
  const N = tr.N, reps = Math.max(1, Math.round(tr.len / vLen)), P = [], U = [], Nn = [], I = [];
  for (let k = 0; k <= N; k++) {
    const i = k % N, nx = -tr.TZ[i], nz = tr.TX[i], v = k / N * reps;
    P.push(tr.X[i] + nx * d0, y, tr.Z[i] + nz * d0, tr.X[i] + nx * d1, y, tr.Z[i] + nz * d1);
    U.push(0, v, 1, v); Nn.push(0, 1, 0, 0, 1, 0);
    if (k < N) { const o = k * 2; I.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(Nn, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  // make sure the strip faces up whichever side it is on
  const a = new T.Vector3(P[0], P[1], P[2]), b = new T.Vector3(P[3], P[4], P[5]), c = new T.Vector3(P[6], P[7], P[8]);
  const n = new T.Vector3().crossVectors(b.sub(a), c.sub(a));
  if (n.y < 0) { for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } g.setIndex(I); }
  g.computeBoundingSphere();
  return g;
}

/* ---------------- Drivers: jointed figures, seated, real proportions ---------------- */
let TV = null;
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
function bakeBone(T, geo, A, B, r) {                       // a bone fixed for good, as a matrix for merge()
  const d = new T.Vector3().subVectors(B, A), l = d.length();
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.multiplyScalar(1 / l));
  return [geo, new T.Matrix4().compose(A.clone(), q, new T.Vector3(r, l, r))];
}

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x9fd2ff, 1);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(62, W / H, 0.15, 1400);
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
  const script = scriptCanvas(scriptImg);
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;
  const tBlob = tex(blobCanvas()), tDot = tex(dotCanvas());

  /* lights */
  const hemi = new T.HemisphereLight(0xffffff, 0xd9b98a, 1.25); scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff2dc, 2.4); scene.add(sun); scene.add(sun.target);
  const fill = new T.DirectionalLight(0xdfeaff, 0.5); fill.position.set(80, 60, -120); scene.add(fill);
  scene.fog = new T.Fog(0xf0d6ac, 150, 560);

  /* the LED board texture and its dot shader, shared by every board */
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tLedDot = new T.CanvasTexture(ledDotCanvas());
  tLedDot.wrapS = tLedDot.wrapT = T.RepeatWrapping; tLedDot.anisotropy = aniso;
  const csChunk = T.ShaderChunk && T.ShaderChunk.colorspace_fragment ? "colorspace_fragment" : "encodings_fragment";
  const ledMat = new T.ShaderMaterial({
    uniforms: { tLed: { value: tLed }, tDot: { value: tLedDot }, grid: { value: new T.Vector2(LED_COLS, LED_ROWS) } },
    vertexShader: "varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
    fragmentShader: [
      "uniform sampler2D tLed;", "uniform sampler2D tDot;", "uniform vec2 grid;", "varying vec2 vUv;",
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
      "  gl_FragColor = vec4(col, 1.0);",
      "  #include <" + csChunk + ">",
      "}"
    ].join("\n")
  });

  const G = {
    T: T, tex: tex, script: script, env: tEnv, blob: tBlob, ledMat: ledMat, aniso: aniso,
    unit: new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    sphere: new T.SphereGeometry(1, 14, 10),
    cyl: (function () { const c = new T.CylinderGeometry(1, 0.88, 1, 9, 1, true); c.translate(0, 0.5, 0); return c; })(),
    blobMat: (function () { const m = new T.MeshBasicMaterial({ map: tBlob, transparent: true, depthWrite: false, opacity: 0.7 }); return m; })()
  };

  /* karts */
  const karts = DRIVERS.map(function (dv, i) { const k = makeKart(G, dv, i); scene.add(k.root); return k; });

  /* items: pinballs and tape tangles, kept in pools */
  const chrome = new T.MeshPhongMaterial({ color: 0xdfe6f2, specular: 0xffffff, shininess: 140, envMap: tEnv, combine: T.MixOperation, reflectivity: 0.75 });
  const pinGeo = new T.SphereGeometry(PIN_R, 20, 14);
  const pins = [];
  for (let i = 0; i < 16; i++) {
    const m = new T.Mesh(pinGeo, chrome); m.visible = false; scene.add(m);
    const sh = new T.Mesh(G.unit, G.blobMat); sh.scale.set(1.3, 1, 1.3); sh.visible = false; sh.renderOrder = 3; scene.add(sh);
    pins.push({ m: m, sh: sh });
  }
  const loops = [], rl = rng(5);
  const ring = new T.TorusGeometry(1, 0.018, 4, 20);
  for (let i = 0; i < 9; i++) {
    const r = 0.22 + rl() * 0.3, m = new T.Matrix4().compose(new T.Vector3((rl() - 0.5) * 1.1, 0.06 + rl() * 0.12, (rl() - 0.5) * 1.1),
      new T.Quaternion().setFromEuler(new T.Euler(Math.PI / 2 + (rl() - 0.5) * 0.9, rl() * TAU, (rl() - 0.5) * 0.6)), new T.Vector3(r, r, r * 3));
    loops.push([ring, m]);
  }
  const loopGeo = merge(T, loops), loopMat = new T.MeshLambertMaterial({ color: 0x4a2a14 });
  const cassette = roundBox(T, 0.62, 0.11, 0.4, 0.03), cassMat = [0, 0, 0, 0, 0, 0].map(function (_, f) { return f === 2 ? new T.MeshPhongMaterial({ map: tex(tapeTopCanvas()), shininess: 40 }) : new T.MeshPhongMaterial({ color: 0x16171e, shininess: 50 }); });
  const tapes = [];
  for (let i = 0; i < 14; i++) {
    const g = new T.Group();
    const c = new T.Mesh(cassette, cassMat); c.position.y = 0.07; c.rotation.y = 0.4; g.add(c);
    g.add(new T.Mesh(loopGeo, loopMat));
    g.visible = false; scene.add(g);
    tapes.push(g);
  }

  /* particles: one additive points mesh for sparks and light, one blended for dust and debris */
  function pointsLayer(additive) {
    const n = 560, geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("color", new T.Float32BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("size", new T.Float32BufferAttribute(new Float32Array(n), 1));
    geo.setAttribute("alpha", new T.Float32BufferAttribute(new Float32Array(n), 1));
    const mat = new T.ShaderMaterial({
      uniforms: { tDot: { value: tDot }, uScale: { value: 400 } },
      vertexShader: "attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale;\n" +
        "void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = alpha * smoothstep(1.5, 4.0, -mv.z); gl_PointSize = size * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }",
      fragmentShader: "uniform sampler2D tDot; varying vec3 vC; varying float vA;\nvoid main() { float a = texture2D(tDot, gl_PointCoord).a * vA; if (a < 0.02) discard; gl_FragColor = vec4(vC, a); }",
      transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending
    });
    const pts = new T.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 8;
    scene.add(pts);
    return pts;
  }
  const fxAdd = pointsLayer(true), fxMix = pointsLayer(false);

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, G: G, gl: gl, renderer: renderer, scene: scene, camera: camera, hemi: hemi, sun: sun, script: script,
    karts: karts, pins: pins, tapes: tapes, fxAdd: fxAdd, fxMix: fxMix, tracks: [], trackShown: -1, cur: null,
    camPos: new T.Vector3(0, 3, 0), camTgt: new T.Vector3(), camYaw: 0, camFov: 62, camSnap: true,
    v: new T.Vector3(), v2: new T.Vector3(), col: new T.Color(),
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0,
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, slowSum: 0, slowN: 0, slowHits: 0, warm: 0, decorOn: true
  };
}

/* ---------------- One kart and its driver ---------------- */
// Built facing +x (forward), +z to the driver's right, y up. Sizes are a real kart's, in meters.
function makeKart(G, dv, idx) {
  const T = G.T, root = new T.Group(), body = new T.Group();
  root.add(body);
  const paint = new T.MeshPhongMaterial({ color: dv.kart, specular: 0xffffff, shininess: 90, envMap: G.env, combine: T.AddOperation, reflectivity: 0.16 });
  const trim = new T.MeshPhongMaterial({ color: dv.trim, specular: 0x999999, shininess: 60 });
  const dark = new T.MeshPhongMaterial({ color: 0x1b1d26, specular: 0x444444, shininess: 30 });
  const metal = new T.MeshPhongMaterial({ color: 0xc8ccd6, specular: 0xffffff, shininess: 110, envMap: G.env, combine: T.AddOperation, reflectivity: 0.25 });
  const suit = new T.MeshPhongMaterial({ color: dv.suit, specular: 0x333333, shininess: 20 });
  const skin = new T.MeshLambertMaterial({ color: dv.skin });
  const helmet = new T.MeshPhongMaterial({ color: dv.helmet, specular: 0xffffff, shininess: 120, envMap: G.env, combine: T.AddOperation, reflectivity: 0.2 });
  const visor = new T.MeshPhongMaterial({ color: dv.visor, specular: 0xffffff, shininess: 160, envMap: G.env, combine: T.AddOperation, reflectivity: 0.5 });
  const M = function (x, y, z, ry, rz) { return new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(0, ry || 0, rz || 0)), new T.Vector3(1, 1, 1)); };

  // painted shell: nose, side pods, the cowl in front of the driver's knees
  body.add(new T.Mesh(merge(T, [
    [roundBox(T, 0.46, 0.2, 0.94, 0.09), M(0.76, 0.2, 0)],
    [roundBox(T, 0.5, 0.24, 0.5, 0.1), M(0.36, 0.32, 0, 0, 0.32)],
    [roundBox(T, 0.98, 0.2, 0.2, 0.08), M(-0.02, 0.2, 0.53)], [roundBox(T, 0.98, 0.2, 0.2, 0.08), M(-0.02, 0.2, -0.53)]
  ]), paint));
  body.add(new T.Mesh(merge(T, [
    [roundBox(T, 0.9, 0.04, 0.08, 0.02), M(-0.02, 0.31, 0.53)], [roundBox(T, 0.9, 0.04, 0.08, 0.02), M(-0.02, 0.31, -0.53)],
    [roundBox(T, 0.08, 0.05, 0.9, 0.02), M(0.96, 0.27, 0)]
  ]), trim));
  // dark parts: the floor tray, bumpers, the seat, axles, the driver's shoes
  const darkParts = [
    [roundBox(T, 1.86, 0.05, 0.98, 0.02), M(0, 0.1, 0)],
    [roundBox(T, 0.12, 0.1, 1.28, 0.05), M(1.0, 0.14, 0)], [roundBox(T, 0.12, 0.12, 1.34, 0.05), M(-0.99, 0.18, 0)],
    [roundBox(T, 0.42, 0.1, 0.44, 0.04), M(-0.3, 0.17, 0)], [roundBox(T, 0.12, 0.52, 0.46, 0.05), M(-0.52, 0.42, 0, 0, 0.32)],
    [roundBox(T, 0.06, 0.06, 1.26, 0.02), M(0.62, 0.15, 0)], [roundBox(T, 0.07, 0.07, 1.3, 0.02), M(-0.62, 0.17, 0)],
    [roundBox(T, 0.26, 0.09, 0.1, 0.04), M(0.63, 0.24, 0.13)], [roundBox(T, 0.26, 0.09, 0.1, 0.04), M(0.63, 0.24, -0.13)]
  ];
  // metal: engine, exhaust, steering column, the name board struts
  const metalParts = [
    [roundBox(T, 0.3, 0.26, 0.24, 0.05), M(-0.66, 0.32, 0.33)],
    [new T.CylinderGeometry(0.04, 0.045, 0.42, 8).rotateZ(Math.PI / 2), M(-0.9, 0.3, 0.44)],
    [new T.CylinderGeometry(0.018, 0.018, 0.5, 6), M(0.36, 0.38, 0, 0, 0.95)],
    [roundBox(T, 0.03, 0.42, 0.03, 0.01), M(-0.92, 0.42, 0.3)], [roundBox(T, 0.03, 0.42, 0.03, 0.01), M(-0.92, 0.42, -0.3)]
  ];

  // driver: legs and hips fixed in place, merged; torso, head and arms move
  const hipY = 0.28, hipX = -0.3;
  const legParts = [];
  [-1, 1].forEach(function (s) {
    const hip = new T.Vector3(hipX, hipY, s * 0.1), knee = new T.Vector3(0.12, 0.5, s * 0.15), ankle = new T.Vector3(0.52, 0.22, s * 0.13);
    legParts.push(bakeBone(T, G.cyl, hip, knee, 0.072), bakeBone(T, G.cyl, knee, ankle, 0.056));
    legParts.push([G.sphere, new T.Matrix4().compose(knee, new T.Quaternion(), new T.Vector3(0.068, 0.068, 0.068))]);
    darkParts.push([roundBox(T, 0.24, 0.1, 0.1, 0.04), M(0.6, 0.2, s * 0.13, 0, -0.5)]);
  });
  legParts.push([G.sphere, new T.Matrix4().compose(new T.Vector3(hipX, hipY + 0.02, 0), new T.Quaternion(), new T.Vector3(0.16, 0.1, 0.19))]);
  body.add(new T.Mesh(merge(T, darkParts), dark));
  body.add(new T.Mesh(merge(T, metalParts), metal));
  body.add(new T.Mesh(merge(T, legParts), suit));

  const upper = new T.Group(); upper.position.set(hipX, hipY, 0); upper.rotation.z = 0.22; body.add(upper);
  const torsoGeo = new T.LatheGeometry([[0.15, 0], [0.16, 0.08], [0.15, 0.2], [0.17, 0.33], [0.2, 0.45], [0.19, 0.51], [0.11, 0.56], [0.06, 0.59]].map(function (p) { return new T.Vector2(p[0], p[1]); }), 16);
  const torso = new T.Mesh(torsoGeo, suit); torso.scale.set(0.68, 1, 1); upper.add(torso);
  const stripe = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.05, 16, 1, true), new T.MeshPhongMaterial({ color: dv.kart, shininess: 30 }));
  stripe.scale.set(0.69, 1, 1.01); stripe.position.y = 0.4; upper.add(stripe);
  const head = new T.Group(); head.position.set(0.02, 0.66, 0); upper.add(head);
  const S3 = function (x, y, z, sx, sy, sz) { return new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion(), new T.Vector3(sx, sy, sz)); };
  head.add(new T.Mesh(merge(T, [[G.cyl, S3(0, -0.1, 0, 0.05, 0.1, 0.05)], [G.sphere, S3(0.01, 0.02, 0, 0.1, 0.115, 0.095)]]), skin));
  head.add(new T.Mesh(merge(T, [[G.sphere, S3(-0.005, 0.045, 0, 0.15, 0.142, 0.136)], [G.sphere, S3(0.1, -0.06, 0, 0.07, 0.04, 0.1)]]), helmet));
  const vis = new T.Mesh(new T.SphereGeometry(1, 16, 6, Math.PI - 1.05, 2.1, 1.12, 0.62), visor);
  vis.scale.set(0.153, 0.145, 0.139); vis.position.set(-0.005, 0.045, 0); head.add(vis);

  const glove = new T.MeshLambertMaterial({ color: 0x1b1d26 });
  function limb(r1, r2) {
    const L = { up: new T.Mesh(G.cyl, suit), lo: new T.Mesh(G.cyl, suit), j: new T.Mesh(G.sphere, suit), end: new T.Mesh(G.sphere, glove), r1: r1, r2: r2 };
    L.j.scale.setScalar(r1 * 1.05); L.end.scale.set(0.05, 0.045, 0.04);
    body.add(L.up); body.add(L.lo); body.add(L.j); body.add(L.end);
    return L;
  }
  const arms = [limb(0.052, 0.042), limb(0.052, 0.042)];

  // steering wheel on its column
  const wheelP = new T.Group(); wheelP.position.set(0.2, 0.55, 0); wheelP.rotation.z = -0.95; body.add(wheelP);
  const swGeo = new T.TorusGeometry(0.15, 0.022, 6, 18); swGeo.rotateY(Math.PI / 2);
  const sw = new T.Group(); wheelP.add(sw);
  sw.add(new T.Mesh(merge(T, [[swGeo, new T.Matrix4()], [roundBox(T, 0.02, 0.03, 0.28, 0.01), new T.Matrix4()],
                              [new T.CylinderGeometry(0.04, 0.04, 0.03, 10).rotateZ(Math.PI / 2), new T.Matrix4()]]), dark));

  // number plate on the nose, the name board at the back
  const plate = new T.Mesh(new T.PlaneGeometry(0.34, 0.25), new T.MeshLambertMaterial({ map: G.tex(plateCanvas(dv.num, dv.kart)) }));
  plate.position.set(0.995, 0.24, 0); plate.rotation.set(0, Math.PI / 2, 0); plate.rotateX(-0.25); body.add(plate);
  const rearMat = new T.MeshPhongMaterial({ map: G.tex(rearCanvas(G.script, dv.kart, dv.trim)), specular: 0x666666, shininess: 70 });
  const board = new T.Mesh(roundBox(T, 0.04, 0.3, 0.96, 0.015), [paint, rearMat, paint, paint, paint, paint]);
  board.position.set(-0.94, 0.66, 0); body.add(board);

  // wheels: the front pair steers. Tire and hub caps are one mesh with one texture.
  const wheelMat = new T.MeshLambertMaterial({ map: G.tex(wheelCanvas(dv.kart)) });
  function wheelGeo(rad, wid) {
    const side = new T.CylinderGeometry(rad, rad, wid, 16, 1, true), cap = new T.CircleGeometry(rad, 16);
    const su = side.attributes.uv; for (let i = 0; i < su.count; i++) su.setX(i, su.getX(i) * 0.5);
    const cu = cap.attributes.uv; for (let i = 0; i < cu.count; i++) cu.setX(i, 0.5 + cu.getX(i) * 0.5);
    const up = new T.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, wid / 2, 0), dn = new T.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, -wid / 2, 0);
    return merge(T, [[side, new T.Matrix4()], [cap, up], [cap, dn]]).rotateX(Math.PI / 2);
  }
  const wheels = [], pivots = [];
  [[0.62, 0.6, 0.15, 0.14], [0.62, -0.6, 0.15, 0.14], [-0.62, 0.62, 0.17, 0.22], [-0.62, -0.62, 0.17, 0.22]].forEach(function (w, n) {
    const m = new T.Mesh(wheelGeo(w[2], w[3]), wheelMat);
    if (n < 2) { const p = new T.Group(); p.position.set(w[0], w[2], w[1]); p.add(m); body.add(p); pivots.push(p); }
    else { m.position.set(w[0], w[2], w[1]); body.add(m); }
    wheels.push({ m: m, r: w[2] });
  });

  // shield bubble, boost flame, shadow
  const shield = new T.Mesh(new T.SphereGeometry(1.3, 22, 14), new T.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: "varying vec3 vN; varying vec3 vV;\nvoid main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader: "uniform float uT; varying vec3 vN; varying vec3 vV;\nvoid main() { float f = pow(1.0 - abs(dot(vN, vV)), 2.2); float b = 0.5 + 0.5 * sin(vN.y * 14.0 + uT * 5.0); gl_FragColor = vec4(vec3(0.25, 0.94, 1.0) * (0.08 + f * 1.1 + b * 0.05), 1.0); }",
    transparent: true, depthWrite: false, blending: T.AdditiveBlending
  }));
  shield.position.y = 0.55; shield.visible = false; root.add(shield);
  const flameGeo = new T.ConeGeometry(0.09, 0.6, 10, 1, true); flameGeo.rotateZ(Math.PI / 2); flameGeo.translate(-0.3, 0, 0);
  const flameMat = new T.MeshBasicMaterial({ color: 0xff9214, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false });
  const flame = new T.Mesh(flameGeo, flameMat); flame.position.set(-1.1, 0.3, 0.44); flame.visible = false; body.add(flame);
  const shadow = new T.Mesh(G.unit, G.blobMat); shadow.scale.set(2.6, 1, 1.9); shadow.renderOrder = 3; root.add(shadow);
  shadow.position.y = 0.04;

  return { root: root, body: body, upper: upper, head: head, arms: arms, wheels: wheels, pivots: pivots, sw: sw, wheelP: wheelP,
           shield: shield, flame: flame, flameMat: flameMat, shadow: shadow, roll: 0, idx: idx };
}

// Hands on the wheel (or one up in the air at the finish). Elbows bend out and down.
function poseDriver(o, steer, wave, t) {
  const tv = TV;
  o.upper.updateMatrix(); o.wheelP.updateMatrix(); o.sw.updateMatrix();
  for (let s = 0; s < 2; s++) {
    const sg = s ? -1 : 1;                                  // 0 = right side (+z), 1 = left
    tv.a.set(0.02, 0.52, sg * 0.18).applyMatrix4(o.upper.matrix);
    if (wave && s === 0) tv.b.set(-0.12 + Math.sin(t * 9) * 0.06, 1.25, 0.34);
    else tv.b.set(0, 0, sg * 0.15).applyMatrix4(o.sw.matrix).applyMatrix4(o.wheelP.matrix);
    tv.p.set(-0.3, -0.6, sg * 0.75);
    const L = o.arms[s];
    bend(tv.a, tv.b, tv.p, 0.29, 0.27, tv.e);
    bone(L.up, tv.a, tv.e, L.r1); bone(L.lo, tv.e, tv.b, L.r2);
    L.j.position.copy(tv.e); L.end.position.copy(tv.b);
  }
}

/* ---------------- One track in 3D (built the first time it is shown) ---------------- */
function buildTrackGroup(ti) {
  const T = R.T, G = R.G, tr = trackData(ti), id = tr.def.id, th = THEMES[id];
  const grp = new T.Group(), decor = new T.Group();
  grp.add(decor);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < tr.N; i++) { x0 = Math.min(x0, tr.X[i]); x1 = Math.max(x1, tr.X[i]); z0 = Math.min(z0, tr.Z[i]); z1 = Math.max(z1, tr.Z[i]); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  tr.cx = cx; tr.cz = cz;
  const r = rng(ti * 131 + 7);
  function lay(mat, layer) { mat.polygonOffset = true; mat.polygonOffsetFactor = -layer; mat.polygonOffsetUnits = -layer * 3; return mat; }
  function face(obj, x, y, z, nx, nz) { obj.position.set(x, y, z); obj.rotation.y = Math.atan2(nx, nz); return obj; }

  /* sky, horizon, sun */
  const sky = new T.Mesh(new T.SphereGeometry(950, 24, 12), new T.MeshBasicMaterial({ map: G.tex(skyCanvas(th)), side: T.BackSide, depthWrite: false, fog: false }));
  sky.position.set(cx, 0, cz); sky.renderOrder = -3; grp.add(sky);
  const hTex = G.tex(horizonCanvas(id), true); hTex.repeat.set(5, 1);
  const hz = new T.Mesh(new T.CylinderGeometry(760, 760, 140, 48, 1, true), new T.MeshBasicMaterial({ map: hTex, side: T.BackSide, transparent: true, alphaTest: 0.4, fog: false, depthWrite: false }));
  hz.position.set(cx, 62, cz); hz.renderOrder = -2; grp.add(hz);
  const sunDir = new T.Vector3(th.sunPos[0], 0, th.sunPos[2]).normalize();
  const sunS = new T.Sprite(new T.SpriteMaterial({ map: G.tex(sunCanvas(id)), fog: false, depthWrite: false, transparent: true }));
  sunS.position.set(cx + sunDir.x * 740, id === "canyon" ? 230 : 60, cz + sunDir.z * 740); sunS.scale.setScalar(id === "canyon" ? 260 : 240); sunS.renderOrder = -1;
  grp.add(sunS);

  /* ground, shoulders, road, curbs */
  const gTile = id === "canyon" ? 30 : id === "rewind" ? 12 : 16;
  const gTex = G.tex(groundCanvas(id), true); gTex.repeat.set(1800 / gTile, 1800 / gTile);
  const ground = new T.Mesh(new T.PlaneGeometry(1800, 1800).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ map: gTex }));
  ground.position.set(cx, -0.02, cz); grp.add(ground);
  const shMat = lay(new T.MeshLambertMaterial({ map: G.tex(shoulderCanvas(th), true) }), 1);
  grp.add(new T.Mesh(ribbon(T, tr, HW, WALL + 1.2, 0.0, 6), shMat));
  grp.add(new T.Mesh(ribbon(T, tr, -WALL - 1.2, -HW, 0.0, 6), shMat));
  const roadMat = lay(new T.MeshPhongMaterial({ map: G.tex(roadCanvas(th), true), specular: th.night ? 0x554466 : 0x333333, shininess: 30 }), 2);
  grp.add(new T.Mesh(ribbon(T, tr, -HW, HW, 0.01, 10), roadMat));
  const curbMat = lay(new T.MeshLambertMaterial({ map: G.tex(curbCanvas(th), true) }), 3);
  grp.add(new T.Mesh(ribbon(T, tr, HW - 0.15, HW + 0.85, 0.02, 2.4), curbMat));
  grp.add(new T.Mesh(ribbon(T, tr, -HW - 0.85, -HW + 0.15, 0.02, 2.4), curbMat));

  /* the walls: game boxes, tapes or cartridges standing shoulder to shoulder */
  const dims = id === "canyon" ? [1.95, 1.1, 0.75, 2.02] : id === "rewind" ? [1.95, 1.05, 0.5, 2.02] : [1.55, 1.4, 0.42, 1.62];
  const per = Math.floor(tr.len / dims[3]), wall = new T.InstancedMesh(roundBox(T, dims[0], dims[1], dims[2], 0.07),
    new T.MeshPhongMaterial({ map: G.tex(wallCanvas(id)), specular: 0x777777, shininess: 60, envMap: G.env, combine: T.AddOperation, reflectivity: 0.06 }), per * 2);
  const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), sc = new T.Vector3(1, 1, 1), pv = new T.Vector3(), col = new T.Color();
  let n = 0;
  for (let side = -1; side <= 1; side += 2) {
    for (let k = 0; k < per; k++) {
      const s = (k + 0.5) * tr.len / per, p = spot(tr, s, side * (WALL + dims[2] / 2 + 0.05)), i = p.i;
      e.set(0, -Math.atan2(tr.TZ[i], tr.TX[i]) + (r() - 0.5) * 0.05, (r() - 0.5) * 0.03);
      q.setFromEuler(e); pv.set(p.x, dims[1] / 2, p.z);
      wall.setMatrixAt(n, m4.compose(pv, q, sc));
      wall.setColorAt(n, col.set(th.walls[(k * 7 + (side > 0 ? 3 : 0)) % th.walls.length]));
      n++;
    }
  }
  wall.instanceMatrix.needsUpdate = true; if (wall.instanceColor) wall.instanceColor.needsUpdate = true;
  grp.add(wall);

  /* start line and the gantry over it, with the big LED board facing the grid */
  const chk = G.tex(checkerCanvas(), true);
  const startM = lay(new T.MeshLambertMaterial({ map: chk }), 4);
  const sl = new T.Mesh(new T.PlaneGeometry(2 * HW, 1.6).rotateX(-Math.PI / 2), startM);
  const p0 = spot(tr, 0, 0), h0 = Math.atan2(tr.TZ[p0.i], tr.TX[p0.i]);
  sl.position.set(p0.x, 0.03, p0.z); sl.rotation.y = -h0 + Math.PI / 2; grp.add(sl);
  const navy = new T.MeshPhongMaterial({ color: 0x0d1f5c, specular: 0x555577, shininess: 40 }), orange = new T.MeshPhongMaterial({ color: 0xff9214, specular: 0xffffff, shininess: 60 });
  const span = 2 * WALL + 2.2, bw = 2 * WALL - 1.2, bh = bw * LED_ROWS / LED_COLS;
  const gantry = new T.Group(); gantry.position.set(p0.x, 0, p0.z); gantry.rotation.y = -h0;
  [-1, 1].forEach(function (s) {
    const pil = new T.Mesh(roundBox(T, 0.9, 7.6, 0.9, 0.2), navy); pil.position.set(0, 3.8, s * (span / 2)); gantry.add(pil);
    const cap = new T.Mesh(roundBox(T, 1.1, 0.4, 1.1, 0.15), orange); cap.position.set(0, 7.7, s * (span / 2)); gantry.add(cap);
  });
  const beam = new T.Mesh(roundBox(T, 1.2, bh + 0.9, span, 0.2), navy); beam.position.set(0, 6.1, 0); gantry.add(beam);
  const trimB = new T.Mesh(roundBox(T, 1.25, 0.18, span + 0.1, 0.06), orange); trimB.position.set(0, 6.1 + bh / 2 + 0.5, 0); gantry.add(trimB);
  const ledFace = new T.Mesh(new T.PlaneGeometry(bw, bh), G.ledMat); ledFace.position.set(-0.62, 6.1, 0); ledFace.rotation.y = -Math.PI / 2; gantry.add(ledFace);
  const backBoard = new T.Mesh(new T.PlaneGeometry(bw * 0.6, bh * 0.95), new T.MeshBasicMaterial({ map: G.tex(boardCanvas(G.script, 1)) }));
  backBoard.position.set(0.62, 6.1, 0); backBoard.rotation.y = Math.PI / 2; gantry.add(backBoard);
  grp.add(gantry);

  /* two more LED boards beside the road, angled at the drivers coming up to them */
  tr.leds.forEach(function (s) {
    const i = idxAt(tr, s), side = tr.RAD[i] > 0 ? -1 : 1, d = side * (WALL + 2.6), p = spot(tr, s, d);
    const w = 14, hh = w * LED_ROWS / LED_COLS, nx = -tr.TX[i] * 0.7 + tr.TZ[i] * side * 0.7, nz = -tr.TZ[i] * 0.7 - tr.TX[i] * side * 0.7;
    const g = new T.Group(); face(g, p.x, 0, p.z, nx, nz);
    const house = new T.Mesh(roundBox(T, w + 0.6, hh + 0.6, 0.5, 0.15), navy); house.position.set(0, 3.4, -0.3); g.add(house);
    const f = new T.Mesh(new T.PlaneGeometry(w, hh), G.ledMat); f.position.set(0, 3.4, 0.0); g.add(f);
    [-1, 1].forEach(function (k) { const post = new T.Mesh(roundBox(T, 0.35, 3.0, 0.35, 0.1), navy); post.position.set(k * w * 0.36, 1.5, -0.3); g.add(post); });
    grp.add(g);
  });

  /* billboards with the wordmark */
  const boardTex = [0, 1, 2].map(function (k) { return G.tex(boardCanvas(G.script, k)); });
  const postMat = new T.MeshPhongMaterial({ color: 0xeef2ff, specular: 0xffffff, shininess: 80 });
  tr.boards.forEach(function (b) {
    const i = idxAt(tr, b.s), p = spot(tr, b.s, b.d), side = b.side;
    const nx = -tr.TX[i] * 0.55 + tr.TZ[i] * side * 0.83, nz = -tr.TZ[i] * 0.55 - tr.TX[i] * side * 0.83;
    const g = new T.Group(); face(g, p.x, 0, p.z, nx, nz);
    const w = 10, hh = w * 320 / 1024;
    const bm = new T.Mesh(roundBox(T, w, hh, 0.3, 0.1), [navy, navy, navy, navy, new T.MeshBasicMaterial({ map: boardTex[b.kind] }), navy]);
    bm.position.y = 3.2 + hh / 2; g.add(bm);
    [-1, 1].forEach(function (k) { const post = new T.Mesh(roundBox(T, 0.3, 3.4, 0.3, 0.1), postMat); post.position.set(k * w * 0.32, 1.7, -0.25); g.add(post); });
    grp.add(g);
  });

  /* prize cubes, in the same order the race lays them out */
  const cubeGeo = roundBox(T, 1.05, 1.05, 1.05, 0.14);
  const cubeMat = new T.MeshPhongMaterial({ map: G.tex(cubeCanvas()), specular: 0xffffff, shininess: 120, envMap: G.env, combine: T.AddOperation, reflectivity: 0.2, transparent: true, opacity: 0.9, emissive: 0x332244 });
  const cubes = [];
  tr.boxRows.forEach(function (s) {
    [-4.2, -1.4, 1.4, 4.2].forEach(function (d) {
      const p = spot(tr, s, d), m = new T.Mesh(cubeGeo, cubeMat);
      m.position.set(p.x, 1.05, p.z); grp.add(m);
      const sh = new T.Mesh(G.unit, G.blobMat); sh.scale.set(1.5, 1, 1.5); sh.position.set(p.x, 0.05, p.z); sh.renderOrder = 3; grp.add(sh);
      cubes.push({ m: m, sh: sh, ph: r() * TAU });
    });
  });

  /* boost pads */
  const padTex = G.tex(chevronCanvas(), true);
  const padMat = lay(new T.MeshBasicMaterial({ map: padTex }), 5), padEdge = lay(new T.MeshLambertMaterial({ color: 0xff9214 }), 4);
  tr.pads.forEach(function (pd) {
    const p = spot(tr, pd.s, pd.d), hh = Math.atan2(tr.TZ[p.i], tr.TX[p.i]);
    const edge = new T.Mesh(new T.PlaneGeometry(6.4, 3.8).rotateX(-Math.PI / 2), padEdge); edge.position.set(p.x, 0.035, p.z); edge.rotation.y = -hh; grp.add(edge);
    const g = new T.PlaneGeometry(6, 3.4); g.rotateZ(-Math.PI / 2); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 1.7, uv.getY(k) * 3);
    const pad = new T.Mesh(g, padMat); pad.position.set(p.x, 0.04, p.z); pad.rotation.y = -hh; grp.add(pad);
  });

  /* scenery beyond the walls (dropped on slow phones) */
  const spots = [];
  function findSpot(minD, maxD, rad) {
    for (let tries = 0; tries < 40; tries++) {
      const s = r() * tr.len, side = r() < 0.5 ? -1 : 1, d = side * (WALL + minD + r() * (maxD - minD)), p = spot(tr, s, d);
      if (!clearOf(tr, p.x, p.z, WALL + 2 + rad)) continue;
      if (spots.some(function (o) { return Math.hypot(o.x - p.x, o.z - p.z) < o.r + rad + 3; })) continue;
      const o = { x: p.x, z: p.z, r: rad, nx: tr.X[p.i] - p.x, nz: tr.Z[p.i] - p.z };
      const l = Math.hypot(o.nx, o.nz) || 1; o.nx /= l; o.nz /= l;
      spots.push(o); return o;
    }
    return null;
  }
  tr.boards.forEach(function (b) { const p = spot(tr, b.s, b.d); spots.push({ x: p.x, z: p.z, r: 6 }); });
  tr.leds.forEach(function (s) { const i = idxAt(tr, s), p = spot(tr, s, (tr.RAD[i] > 0 ? -1 : 1) * (WALL + 2.6)); spots.push({ x: p.x, z: p.z, r: 8 }); });
  const greyM = new T.MeshPhongMaterial({ color: 0xa6aab6, specular: 0xaaaaaa, shininess: 50 });
  if (id === "canyon") {
    for (let k = 0; k < 9; k++) {                          // giant cartridges stuck in the sand like monuments
      const o = findSpot(6, 34, 4); if (!o) continue;
      const colr = th.walls[k % th.walls.length], fm = new T.MeshPhongMaterial({ map: G.tex(cartFaceCanvas(G.script, colr)), specular: 0x999999, shininess: 50 });
      const m = new T.Mesh(roundBox(T, 6.4, 8, 1.4, 0.3), [greyM, greyM, greyM, greyM, fm, fm]);
      face(m, o.x, 3.7, o.z, o.nx, o.nz); m.rotation.z = (r() - 0.5) * 0.25; m.rotateX(-0.08 - r() * 0.1);
      decor.add(m);
    }
    const rock = new T.MeshLambertMaterial({ color: 0xb8683a });
    for (let k = 0; k < 14; k++) {                          // mesas
      const o = findSpot(12, 70, 9); if (!o) continue;
      const hgt = 6 + r() * 16, m = new T.Mesh(new T.CylinderGeometry(5 + r() * 4, 8 + r() * 5, hgt, 7), rock);
      m.position.set(o.x, hgt / 2 - 0.5, o.z); m.rotation.y = r() * TAU; decor.add(m);
      const top = new T.Mesh(new T.CylinderGeometry(5.2, 5.2, 0.6, 7), new T.MeshLambertMaterial({ color: 0xd99460 }));
      top.position.set(o.x, hgt - 0.4, o.z); top.rotation.y = m.rotation.y; decor.add(top);
    }
    for (let k = 0; k < 6; k++) {                           // game boxes the size of houses, leaning on each other
      const o = findSpot(8, 40, 6); if (!o) continue;
      const colr = th.walls[(k + 2) % th.walls.length];
      const fm = new T.MeshPhongMaterial({ map: G.tex(boardCanvas(G.script, 1)), shininess: 60 });
      const sm = new T.MeshPhongMaterial({ color: colr, shininess: 70 });
      const m = new T.Mesh(roundBox(T, 7, 9.5, 1.8, 0.25), [sm, sm, sm, sm, fm, sm]);
      face(m, o.x, 4.5, o.z, o.nx, o.nz); m.rotation.z = 0.12 * (k % 2 ? 1 : -1); decor.add(m);
    }
  } else if (id === "rewind") {
    for (let k = 0; k < 8; k++) {                          // giant tapes on their edges
      const o = findSpot(6, 34, 6); if (!o) continue;
      const fm = new T.MeshPhongMaterial({ map: G.tex(tapeFaceCanvas(G.script)), specular: 0x888888, shininess: 80 });
      const bm = new T.MeshPhongMaterial({ color: 0x111218, specular: 0x666666, shininess: 70 });
      const m = new T.Mesh(roundBox(T, 10, 5.6, 1.3, 0.25), [bm, bm, bm, bm, fm, fm]);
      face(m, o.x, 2.8, o.z, o.nx, o.nz); decor.add(m);
    }
    const neon = [new T.MeshBasicMaterial({ color: 0xff3fa4 }), new T.MeshBasicMaterial({ color: 0x3ff0ff })];
    for (let k = 0; k < 22; k++) {                          // neon pylons
      const o = findSpot(2, 26, 1.2); if (!o) continue;
      const hgt = 5 + r() * 7, m = new T.Mesh(roundBox(T, 0.5, hgt, 0.5, 0.2), neon[k % 2]);
      m.position.set(o.x, hgt / 2, o.z); decor.add(m);
      const base = new T.Mesh(roundBox(T, 1.2, 0.4, 1.2, 0.15), new T.MeshLambertMaterial({ color: 0x1a0e34 })); base.position.set(o.x, 0.2, o.z); decor.add(base);
    }
    for (let k = 0; k < 10; k++) {                          // speaker stacks
      const o = findSpot(10, 60, 4); if (!o) continue;
      const hgt = 6 + r() * 6, m = new T.Mesh(roundBox(T, 4, hgt, 3, 0.3), new T.MeshPhongMaterial({ color: 0x1b1430, specular: 0xff3fa4, shininess: 30 }));
      face(m, o.x, hgt / 2, o.z, o.nx, o.nz); decor.add(m);
      [0.3, 0.7].forEach(function (f) {
        const cone = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, 0.2, 18).rotateX(Math.PI / 2), new T.MeshPhongMaterial({ color: 0x2a2440, emissive: 0x401040 }));
        cone.position.set(0, hgt * (f - 0.5), 1.55); m.add(cone);
      });
    }
  } else {
    const cabM = new T.MeshPhongMaterial({ color: 0x2a1858, specular: 0x8866ff, shininess: 40 });
    for (let k = 0; k < 14; k++) {                          // arcade cabinets facing the track
      const o = findSpot(3, 30, 2.4); if (!o) continue;
      const g = new T.Group(); face(g, o.x, 0, o.z, o.nx, o.nz);
      const bodyM = new T.Mesh(roundBox(T, 2.2, 4.6, 2.0, 0.12), cabM); bodyM.position.y = 2.3; g.add(bodyM);
      const mq = new T.Mesh(new T.PlaneGeometry(2.0, 0.62), new T.MeshBasicMaterial({ map: G.tex(marqueeCanvas(G.script)) })); mq.position.set(0, 4.15, 1.02); g.add(mq);
      const scr = new T.Mesh(new T.PlaneGeometry(1.7, 1.3), new T.MeshBasicMaterial({ map: G.tex(screenCanvas(k + ti * 20)) })); scr.position.set(0, 3.05, 1.06); scr.rotation.x = -0.15; g.add(scr);
      const panel = new T.Mesh(roundBox(T, 2.2, 0.35, 0.9, 0.1), new T.MeshPhongMaterial({ color: th.walls[k % th.walls.length] })); panel.position.set(0, 2.05, 1.3); panel.rotation.x = 0.25; g.add(panel);
      const stick = new T.Mesh(new T.SphereGeometry(0.13, 10, 8), new T.MeshPhongMaterial({ color: 0xff3322, shininess: 90 })); stick.position.set(-0.4, 2.45, 1.35); g.add(stick);
      decor.add(g);
    }
    const tokTex = G.tex(tokenCanvas()), gold = new T.MeshPhongMaterial({ color: 0xe8b020, specular: 0xffffff, shininess: 120, envMap: G.env, combine: T.AddOperation, reflectivity: 0.3 });
    const tokFace = new T.MeshPhongMaterial({ map: tokTex, specular: 0xffffff, shininess: 120 });
    tr.tokens = [];
    for (let k = 0; k < 8; k++) {                           // giant tokens rolling in place
      const o = findSpot(6, 40, 4); if (!o) continue;
      const m = new T.Mesh(new T.CylinderGeometry(3.4, 3.4, 0.6, 30).rotateX(Math.PI / 2), [gold, tokFace, tokFace]);
      m.position.set(o.x, 3.6, o.z); m.rotation.y = r() * TAU; decor.add(m); tr.tokens.push(m);
    }
    for (let k = 0; k < 6; k++) {                           // joysticks the height of a house
      const o = findSpot(10, 50, 5); if (!o) continue;
      const base = new T.Mesh(roundBox(T, 7, 2, 7, 0.5), new T.MeshPhongMaterial({ color: 0x1b1d26, shininess: 40 })); base.position.set(o.x, 1, o.z); decor.add(base);
      const shaft = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 7, 12), greyM); shaft.position.set(o.x, 5, o.z); shaft.rotation.z = (r() - 0.5) * 0.4; decor.add(shaft);
      const ball = new T.Mesh(new T.SphereGeometry(1.6, 18, 12), new T.MeshPhongMaterial({ color: th.walls[2 + (k % 3)], specular: 0xffffff, shininess: 120 })); ball.position.set(o.x + Math.sin(-shaft.rotation.z) * 3.5, 8.6, o.z); decor.add(ball);
    }
  }
  return { grp: grp, decor: decor, cubes: cubes, padTex: padTex, th: th, tr: tr };
}

function showTrack(ti) {
  if (!R.tracks[ti]) { R.tracks[ti] = buildTrackGroup(ti); R.scene.add(R.tracks[ti].grp); }
  for (let i = 0; i < R.tracks.length; i++) if (R.tracks[i]) R.tracks[i].grp.visible = i === ti;
  const t = R.tracks[ti], th = t.th;
  R.cur = t; R.trackShown = ti;
  R.renderer.setClearColor(th.clear, 1);
  R.scene.fog.color.setHex(th.fog); R.scene.fog.near = th.fogNear; R.scene.fog.far = th.fogFar;
  R.hemi.color.setHex(th.hemi[0]); R.hemi.groundColor.setHex(th.hemi[1]); R.hemi.intensity = th.hemi[2];
  R.sun.color.setHex(th.sun[0]); R.sun.intensity = th.sun[1];
  R.sun.position.set(t.tr.cx + th.sunPos[0], th.sunPos[1], t.tr.cz + th.sunPos[2]); R.sun.target.position.set(t.tr.cx, 0, t.tr.cz); R.sun.target.updateMatrixWorld();
  t.decor.visible = R.decorOn;
  R.camSnap = true;
  R.dirty = true;
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
// pr = pixel ratio cap, fx = particle density, decor = scenery beyond the walls
const QUALITY = [{ pr: 2, fx: 1, decor: true }, { pr: 1.5, fx: 1, decor: true }, { pr: 1.15, fx: 0.6, decor: true }, { pr: 1, fx: 0.35, decor: false }];
function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  const Q = QUALITY[R.quality];
  fxMul = Q.fx; R.decorOn = Q.decor;
  if (R.cur) R.cur.decor.visible = Q.decor;
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
    if (++R.slowHits >= 2) { R.slowHits = 0; setQuality(R.quality + 1); }
  } else R.slowHits = 0;
}

/* ---------------- Keep the WebGL canvas exactly under the shell's canvas ---------------- */
function layoutGL() {
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

/* ---------------- Race state -> meshes ---------------- */
function emit(k, fdt) {
  const c = Math.cos(k.h), s = Math.sin(k.h), sp = Math.abs(k.speed);
  function at(fx, sz, y) { return [k.x + c * fx - s * sz, y, k.z + s * fx + c * sz]; }
  if (k.drift && sp > 8 && Math.random() < fdt * 70 * fxMul) {
    const kind = k.driftT >= MT2 ? 8 : k.driftT >= MT1 ? 7 : 6, side = Math.random() < 0.5 ? 1 : -1, p = at(-0.7, side * 0.62, 0.08);
    addP(p[0], p[1], p[2], -c * 3 + (Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, -s * 3 + (Math.random() - 0.5) * 3, kind === 6 ? 0.45 : 0.25, kind === 6 ? 0.34 : 0.13, kind, kind === 6 ? -0.5 : 10);
  }
  if (k.off && sp > 5 && Math.random() < fdt * 26 * fxMul) {
    const p = at(-0.7, (Math.random() - 0.5) * 1.2, 0.1);
    addP(p[0], p[1], p[2], -c * 2, 0.8 + Math.random(), -s * 2, 0.7, 0.45, 6, -0.4);
  }
  if (k.boost > 0 && Math.random() < fdt * 40 * fxMul) {
    const p = at(-1.35, 0.44, 0.3);
    addP(p[0], p[1], p[2], -c * 6 + k.vx * 0.6, 0.4, -s * 6 + k.vz * 0.6, 0.18, 0.2, k.boostLvl === 1 ? 7 : 9, 0);
  }
  if (k.spin > 0 && Math.random() < fdt * 30 * fxMul) addP(k.x, 1.6 + Math.random() * 0.3, k.z, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, 0.4, 0.16, 5, -1);
}
function syncScene(state, fdt) {
  const idle = state === "title" || state === "over";
  R.clock += fdt;
  ledTick(fdt);
  if (R.trackShown !== S.ti) showTrack(S.ti);
  const cur = R.cur, tr = S.tr, calm = Shell.reduced, t = R.clock;

  /* prize cubes and pads */
  for (let i = 0; i < S.boxes.length && i < cur.cubes.length; i++) {
    const b = S.boxes[i], cb = cur.cubes[i], back = b.back > 0;
    cb.m.visible = cb.sh.visible = !back;
    if (!back) {
      cb.m.rotation.set(calm ? 0.5 : t * 1.3 + cb.ph, calm ? 0.6 : t * 1.7 + cb.ph, 0.3);
      cb.m.position.y = 1.05 + (calm ? 0 : Math.sin(t * 2.4 + cb.ph) * 0.15);
    }
  }
  if (!calm) cur.padTex.offset.y = -(t * 1.8) % 1;
  if (tr.tokens && !calm) tr.tokens.forEach(function (m, i) { m.rotation.y += fdt * (0.4 + i * 0.05); });

  /* karts */
  const cam = R.camera.position;
  for (let i = 0; i < S.karts.length; i++) {
    const k = S.karts[i], o = R.karts[i];
    const hop = k.hop > 0 ? Math.sin(k.hop / 0.26 * Math.PI) * 0.2 : 0;
    o.root.position.set(k.x, hop, k.z);
    o.root.rotation.y = -(k.h + k.spinA);
    const lean = clamp(-(k.slide || 0) * 0.012 + k.steerV * Math.min(1, Math.abs(k.speed) / V_MAX) * 0.05, -0.1, 0.1);
    o.body.rotation.x += (lean - o.body.rotation.x) * Math.min(1, fdt * 8);
    o.body.rotation.z = (k.inp.gas && k.speed < V_MAX * 0.6 ? 0.025 : 0) - (k.inp.brake && k.speed > 2 ? 0.03 : 0);
    o.roll += k.speed * fdt;
    for (let w = 0; w < 4; w++) o.wheels[w].m.rotation.z = -o.roll / o.wheels[w].r;
    for (let w = 0; w < 2; w++) o.pivots[w].rotation.y = -k.steerV * 0.42;
    o.sw.rotation.x = k.steerV * 1.1;
    o.head.rotation.x = k.steerV * 0.16; o.head.rotation.y = -k.steerV * 0.2;
    o.upper.rotation.x = k.steerV * 0.07;
    const dc = Math.hypot(k.x - cam.x, k.z - cam.z);
    if (dc < 48 || o.first !== true) {
      const wave = k.isPlayer && (S.phase === "finish" || S.after) && S.result && S.result.place <= 3;
      poseDriver(o, k.steerV, wave, t);
      o.first = true;
    }
    o.shield.visible = k.shield > 0 && (k.shield > 1.5 || Math.floor(t * 10) % 2 === 0);
    o.shield.material.uniforms.uT.value = t;
    o.flame.visible = k.boost > 0;
    if (o.flame.visible) {
      o.flameMat.color.setHex(k.boostLvl === 1 ? 0x4ad0ff : 0xff9214);
      const f = calm ? 1 : 0.8 + Math.random() * 0.5;
      o.flame.scale.set(f * (k.boostLvl === 1 ? 0.8 : 1.15), 1, 1);
    }
    if (!idle || S.demo || S.after) emit(k, fdt);
  }

  /* pinballs and tape */
  let np = 0, nt = 0;
  for (let n = 0; n < S.items.length; n++) {
    const q = S.items[n];
    if (q.dead) continue;
    if (q.type === "pin" && np < R.pins.length) {
      const p = R.pins[np++];
      p.m.visible = p.sh.visible = true;
      p.m.position.set(q.x, PIN_R + Math.abs(Math.sin(q.t * 11)) * 0.3, q.z);
      p.m.rotation.x += fdt * 14; p.m.rotation.z += fdt * 9;
      p.sh.position.set(q.x, 0.05, q.z);
    } else if (q.type === "tape" && nt < R.tapes.length) {
      const g = R.tapes[nt++];
      g.visible = true;
      if (q.toss > 0) {
        const u = 1 - q.toss / 0.5;
        g.position.set(q.fx + (q.x - q.fx) * u, Math.sin(u * Math.PI) * 3 + 0.05, q.fz + (q.z - q.fz) * u);
        g.rotation.y = u * 9;
      } else { g.position.set(q.x, 0.04, q.z); g.rotation.y = (q.x * 7.3 + q.z * 3.1) % TAU; }
    }
  }
  for (; np < R.pins.length; np++) R.pins[np].m.visible = R.pins[np].sh.visible = false;
  for (; nt < R.tapes.length; nt++) R.tapes[nt].visible = false;

  /* particles into the two points layers */
  fillPoints();

  /* camera */
  camera(state, fdt);
}
function fillPoints() {
  const la = R.fxAdd.geometry, lm = R.fxMix.geometry;
  const pa = la.attributes.position.array, ca = la.attributes.color.array, sa = la.attributes.size.array, aa = la.attributes.alpha.array;
  const pm = lm.attributes.position.array, cm = lm.attributes.color.array, sm = lm.attributes.size.array, am = lm.attributes.alpha.array;
  let na = 0, nm = 0;
  const cap = sa.length, col = R.col;
  for (let i = 0; i < P3.length; i++) {
    const p = P3[i], mix = p.mix;
    const u = p.life / p.max;
    col.set(p.col);
    if (mix ? nm < cap : na < cap) {
      const P = mix ? pm : pa, C = mix ? cm : ca, Sz = mix ? sm : sa, A = mix ? am : aa, j = mix ? nm++ : na++;
      P[j * 3] = p.x; P[j * 3 + 1] = p.y; P[j * 3 + 2] = p.z;
      C[j * 3] = col.r; C[j * 3 + 1] = col.g; C[j * 3 + 2] = col.b;
      Sz[j] = p.size * (mix ? 1 + (1 - u) * 1.1 : 0.6 + u * 0.6); A[j] = mix ? u * 0.55 : Math.min(1, u * 1.6);
    }
  }
  la.setDrawRange(0, na); lm.setDrawRange(0, nm);
  [la, lm].forEach(function (g) { for (const k in g.attributes) g.attributes[k].needsUpdate = true; });
  const sc = R.ch * R.pr / (2 * Math.tan(R.camera.fov * Math.PI / 360));
  R.fxAdd.material.uniforms.uScale.value = R.fxMix.material.uniforms.uScale.value = sc || 400;
}
function camera(state, fdt) {
  const k = S.player, idle = state === "title" || state === "over", calm = Shell.reduced;
  const sp = Math.hypot(k.vx, k.vz);
  let goal = k.h;
  if (sp > 4 && k.spin <= 0) goal = k.h + wrapA(Math.atan2(k.vz, k.vx) - k.h) * 0.55;
  if (k.spin > 0) goal = R.camYaw;
  if (R.camSnap) R.camYaw = goal;
  R.camYaw += wrapA(goal - R.camYaw) * Math.min(1, fdt * 4.5);
  // with the touch buttons along the bottom, the camera looks a little further down so the kart rides above them
  let orbit = R.camYaw, dist = 5.5 + clamp(sp, 0, 32) * 0.035, hgt = touchMode ? 2.3 : 2.15, look = 3.6, tgtY = touchMode ? 0.3 : 0.95, rate = 12, orbitT = false;
  if (S.demo) {
    orbit += calm ? 0.35 : Math.sin(idleT * 0.23) * 0.9; dist = 6.6; hgt = 2.7; rate = 5;
  } else if (S.phase === "count") {
    const u = clamp((S.pt - 0.2) / (COUNT_T - 0.9), 0, 1), e = calm ? 1 : u * u * (3 - 2 * u);
    orbit += (1 - e) * Math.PI * 0.95; dist += (1 - e) * 4; hgt += (1 - e) * 1.2; orbitT = e < 0.98; rate = 30;
  } else if (S.phase === "finish" || S.after) {
    const tt = S.after ? idleT : S.endT;
    orbit = R.camYaw + Math.PI + 0.7 - (calm ? 0 : tt * 0.3); dist = 5.6; hgt = 1.9; orbitT = true; rate = 4;
  }
  const cp = R.camPos, ct = R.camTgt, v = R.v2;
  v.set(k.x - Math.cos(orbit) * dist, hgt, k.z - Math.sin(orbit) * dist);
  const kk = R.camSnap ? 1 : 1 - Math.exp(-rate * fdt);
  cp.lerp(v, kk);
  if (orbitT) v.set(k.x, 0.8, k.z);
  else v.set(k.x + Math.cos(R.camYaw) * look, tgtY, k.z + Math.sin(R.camYaw) * look);
  ct.lerp(v, R.camSnap ? 1 : 1 - Math.exp(-(rate + 4) * fdt));
  R.camSnap = false;
  const fov = 62 + (k.boost > 0 && !idle && !calm ? 8 : 0);
  R.camFov += (fov - R.camFov) * Math.min(1, fdt * 5);
  if (Math.abs(R.camera.fov - R.camFov) > 0.01) { R.camera.fov = R.camFov; R.camera.updateProjectionMatrix(); }
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (Math.random() * 2 - 1) * m; sy = (Math.random() * 2 - 1) * m;
  }
  R.camera.position.set(cp.x + sx, cp.y + sy, cp.z);
  R.camera.lookAt(ct.x + sx * 0.5, ct.y + sy * 0.5, ct.z);
  R.camera.updateMatrixWorld();
}

/* ---------------- HUD (2D canvas on top) ---------------- */
function txt(c, s, x, y, size, color, align, shadow) {
  c.font = "bold " + size + "px " + HUD_FONT;
  c.textAlign = align || "left"; c.textBaseline = "top";
  if (shadow) { c.fillStyle = shadow; c.fillText(s, x + 1, y + 1); }
  c.fillStyle = color; c.fillText(s, x, y);
}
function bigText(c, s, x, y, size, top, bot) {
  c.font = '900 ' + size + 'px "Arial Black", "Arial Rounded MT Bold", ' + HUD_FONT;
  c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round";
  c.lineWidth = size * 0.3; c.strokeStyle = "#08205f"; c.strokeText(s, x, y + size * 0.05);
  c.lineWidth = size * 0.13; c.strokeStyle = "#ffffff"; c.strokeText(s, x, y);
  const gr = c.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  gr.addColorStop(0, top || "#fff06a"); gr.addColorStop(1, bot || "#ff7a0f");
  c.fillStyle = gr; c.fillText(s, x, y);
}
function rrect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function itemIcon(c, it, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s / 32, s / 32);
  if (it === "pin") {
    const g = c.createRadialGradient(-5, -6, 1, 0, 0, 13);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, "#c8d4e6"); g.addColorStop(1, "#5a6a88");
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 12, 0, TAU); c.fill();
    c.lineWidth = 1.5; c.strokeStyle = "#08205f"; c.stroke();
  } else if (it === "tape") {
    rrect(c, -14, -9, 28, 18, 3); c.fillStyle = "#16171e"; c.fill();
    c.fillStyle = "#f4efdf"; c.fillRect(-11, -7, 22, 6); c.fillStyle = "#ff3fa4"; c.fillRect(-11, -6, 22, 2);
    c.fillStyle = "#8a5a33"; c.beginPath(); c.arc(-6, 4, 3.5, 0, TAU); c.arc(6, 4, 3.5, 0, TAU); c.fill();
    c.strokeStyle = "#8a5a33"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(10, 8); c.bezierCurveTo(20, 16, 4, 18, 12, 13); c.stroke();
  } else if (it === "turbo") {
    c.fillStyle = "#ff9214"; c.beginPath(); c.moveTo(-12, -10); c.lineTo(2, 0); c.lineTo(-12, 10); c.lineTo(-7, 0); c.closePath(); c.fill();
    c.fillStyle = "#ffd23f"; c.beginPath(); c.moveTo(-1, -10); c.lineTo(13, 0); c.lineTo(-1, 10); c.lineTo(4, 0); c.closePath(); c.fill();
    c.lineWidth = 1.2; c.strokeStyle = "#08205f"; c.stroke();
  } else if (it === "shield") {
    const g = c.createRadialGradient(-4, -5, 1, 0, 0, 13);
    g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(0.6, "rgba(63,240,255,.5)"); g.addColorStop(1, "rgba(63,240,255,.9)");
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 12.5, 0, TAU); c.fill();
    c.lineWidth = 1.6; c.strokeStyle = "#0b7fa0"; c.stroke();
  }
  c.restore();
}
const MM = [];
function minimap(c, x, y, s) {
  const tr = S.tr;
  let m = MM[tr.ti];
  if (!m) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < tr.N; i++) { x0 = Math.min(x0, tr.X[i]); x1 = Math.max(x1, tr.X[i]); z0 = Math.min(z0, tr.Z[i]); z1 = Math.max(z1, tr.Z[i]); }
    m = MM[tr.ti] = { k: (s - 12) / Math.max(x1 - x0, z1 - z0), cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
  }
  const P = function (wx, wz) { return [x + s / 2 + (wx - m.cx) * m.k, y + s / 2 + (wz - m.cz) * m.k]; };
  rrect(c, x, y, s, s, 8); c.fillStyle = "rgba(8,16,48,.5)"; c.fill();
  c.lineJoin = "round";
  [[6, "rgba(8,32,95,.85)"], [3, "#eef2ff"]].forEach(function (L) {
    c.lineWidth = L[0]; c.strokeStyle = L[1]; c.beginPath();
    for (let i = 0; i <= tr.N; i += 4) { const p = P(tr.X[i % tr.N], tr.Z[i % tr.N]); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }
    c.closePath(); c.stroke();
  });
  const st = P(tr.X[0], tr.Z[0]); c.fillStyle = "#ffd23f"; c.fillRect(st[0] - 2, st[1] - 2, 4, 4);
  for (let i = S.karts.length - 1; i >= 0; i--) {
    const k = S.karts[i], p = P(k.x, k.z);
    c.fillStyle = "#08205f"; c.beginPath(); c.arc(p[0], p[1], k.isPlayer ? 4.6 : 3.4, 0, TAU); c.fill();
    c.fillStyle = DRIVERS[i].kart; c.beginPath(); c.arc(p[0], p[1], k.isPlayer ? 3.4 : 2.4, 0, TAU); c.fill();
    if (k.isPlayer) { c.lineWidth = 1.2; c.strokeStyle = "#ffffff"; c.stroke(); }
  }
}
function drawTouch(c) {
  const tc = touchState(), pressed = {};
  fingers.forEach(function (f) { if (f.btn) pressed[f.btn] = true; });
  const p = TC.pad;
  rrect(c, p.x, p.y, p.w, p.h, 22); c.fillStyle = pressed.pad ? "rgba(8,32,95,.55)" : "rgba(8,32,95,.38)"; c.fill();
  c.lineWidth = 2; c.strokeStyle = "rgba(255,255,255,.55)"; c.stroke();
  const mid = p.x + p.w / 2, cy = p.y + p.h / 2;
  [-1, 1].forEach(function (s) {
    const on = tc.steer * s > 0.1;
    c.fillStyle = on ? "#ffd23f" : "rgba(255,255,255,.8)";
    c.beginPath(); c.moveTo(mid + s * 66, cy); c.lineTo(mid + s * 40, cy - 18); c.lineTo(mid + s * 40, cy + 18); c.closePath(); c.fill();
  });
  if (pressed.pad) { c.fillStyle = "#ffffff"; c.beginPath(); c.arc(mid + tc.steer * p.w * 0.36, cy, 9, 0, TAU); c.fill(); }
  else { c.fillStyle = "rgba(255,255,255,.5)"; c.beginPath(); c.arc(mid, cy, 6, 0, TAU); c.fill(); }
  const k = S.player;
  ["item", "brake", "drift", "gas"].forEach(function (n) {
    const b = TC[n], on = pressed[n] || (n === "gas" && tc.gas);
    const fill = n === "gas" ? "rgba(88,195,34," : n === "brake" ? "rgba(255,75,62," : n === "drift" ? "rgba(255,146,20," : "rgba(167,123,255,";
    c.fillStyle = fill + (on ? ".8)" : ".42)"); c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill();
    c.lineWidth = 2; c.strokeStyle = on ? "#ffffff" : "rgba(255,255,255,.6)"; c.stroke();
    if (n === "item" && k.item && k.roll <= 0) itemIcon(c, k.item, b.x, b.y - 4, 22);
    txt(c, b.label, b.x, b.y + (n === "item" && k.item ? 9 : -5), n === "gas" ? 12 : 9, "#ffffff", "center", "rgba(8,32,95,.8)");
  });
}
const ORD = ["1ST", "2ND", "3RD", "4TH", "5TH", "6TH"];
function drawHUD(c, state) {
  const k = S.player, playing = state === "playing" || state === "paused";
  if (!playing) {                                         // title and score card: just the wordmark and the track over the attract loop
    const bg = c.createLinearGradient(0, 0, 0, 40);
    bg.addColorStop(0, "rgba(13,31,92,.85)"); bg.addColorStop(1, "rgba(13,31,92,0)");
    c.fillStyle = bg; c.fillRect(0, 0, W, 40);
    drawScript(c, R.script, W / 2, 20, 96, 32);
    return;
  }
  const bg = c.createLinearGradient(0, 0, 0, 48);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, 0, W, 48);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff9214"; c.fillRect(0, 48, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, 50, W, 1);
  // place
  const pl = S.result ? S.result.place : k.place;
  bigText(c, ORD[pl - 1], 46, 25, 24, pl === 1 ? "#fff06a" : "#ffffff", pl === 1 ? "#ff9a0f" : "#a8ecff");
  txt(c, "/" + KARTS, 84, 22, 11, "#a8ecff", "left", "#08205f");
  // lap and time
  const lap = clamp(k.lap, 1, LAPS);
  txt(c, (k.lap > LAPS ? "FINISHED" : "LAP " + lap + "/" + LAPS), W / 2 + 6, 7, 14, k.lap === LAPS ? "#ffc1e0" : "#ffffff", "center", "#08205f");
  txt(c, clock(S.result ? S.result.time : S.raceT), W / 2 + 6, 27, 12, "#a8ecff", "center", "#08205f");
  // item slot
  const ix = W - 50, iy = 4;
  rrect(c, ix, iy, 44, 40, 8); c.fillStyle = "#ffffff"; c.fill();
  c.lineWidth = 2; c.strokeStyle = k.item ? "#ff9214" : "#08205f"; c.stroke();
  if (k.roll > 0) itemIcon(c, ["pin", "tape", "turbo", "shield"][Math.floor(S.t * 14) % 4], ix + 22, iy + 20, 26);
  else if (k.item) itemIcon(c, k.item, ix + 22, iy + 20, 28);
  else { c.fillStyle = "#c9d3ea"; c.font = "900 20px " + HUD_FONT; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("?", ix + 22, iy + 21); }
  // minimap and hits
  minimap(c, 6, 56, 84);
  txt(c, "HITS " + S.hits, W - 8, 56, 11, "#ffffff", "right", "#08205f");
  if (k.item && k.roll <= 0 && !touchMode && S.phase === "race") txt(c, ITEMS[k.item] + " - SPACE", W - 8, 70, 9, "#ffe45c", "right", "#08205f");
  // drift charge
  if (k.drift && k.driftT > 0.2) {
    const lvl = k.driftT >= MT2 ? 2 : k.driftT >= MT1 ? 1 : 0, w = 70, x = W / 2 - w / 2, y = touchMode ? 382 : 470;
    rrect(c, x, y, w, 8, 4); c.fillStyle = "rgba(8,32,95,.7)"; c.fill();
    const f = clamp(k.driftT / MT2, 0, 1);
    rrect(c, x + 1, y + 1, (w - 2) * f, 6, 3); c.fillStyle = lvl === 2 ? "#ff9214" : lvl === 1 ? "#4ad0ff" : "#c8d4e6"; c.fill();
    c.fillStyle = "#ffffff"; c.fillRect(x + w * MT1 / MT2, y, 1.5, 8);
  }
  // countdown
  if (S.phase === "count" && S.countShown) bigText(c, String(S.countShown), W / 2, 190, 76 - (S.pt % 1) * 10);
  else if (S.phase === "race" && S.pt < 0.7) bigText(c, "GO!", W / 2, 190, 70, "#d6ff8a", "#3cb31a");
  if (k.wrongT > 1 && state === "playing" && Math.floor(S.t * 3) % 2 === 0) bigText(c, "WRONG WAY", W / 2, 200, 36, "#ffd0d0", "#ff3b2e");
  // the finish: standings so far
  if (S.phase === "finish") {
    const x = 70, w = W - 140, y = H - 30 - S.order.length * 16;
    rrect(c, x, y, w, 20 + S.order.length * 16, 10); c.fillStyle = "rgba(8,16,48,.78)"; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = "#ffe45c"; c.stroke();
    S.order.forEach(function (o, n) {
      const yy = y + 10 + n * 16, me = o.isPlayer;
      txt(c, ORD[n], x + 10, yy, 11, me ? "#ffd23f" : "#a8ecff");
      c.fillStyle = DRIVERS[o.i].kart; c.fillRect(x + 44, yy + 2, 8, 8);
      txt(c, o.short, x + 58, yy, 11, me ? "#ffd23f" : "#ffffff");
      txt(c, o.finished ? clock(o.finishT) : "LAP " + clamp(o.lap, 1, LAPS), x + w - 10, yy, 10, "#ffffff", "right");
    });
  }
  if (touchMode && state === "playing" && S.phase !== "finish") drawTouch(c);
}

function draw(c, state) {
  const k = S.player;
  let near2 = null;
  if (k && R) {
    let best = 1e9, bv = 0;
    for (let i = 1; i < S.karts.length; i++) { const o = S.karts[i], d = Math.hypot(o.x - k.x, o.z - k.z); if (d < best) { best = d; bv = Math.abs(o.speed); } }
    near2 = { near: clamp(1 - best / 22, 0, 1), v: bv };
  }
  Sound.pump(state, k, near2);
  if (!R || !R.hud) return;
  const now = performance.now();
  let ms = now - R.lastT;
  R.lastT = now;
  if (!(ms > 0)) ms = 0;
  const sized = layoutGL();
  if (state === "paused" && !R.dirty) return;
  if (state === "playing") watchFrameRate(ms);
  const fdt = state === "paused" ? 0 : Math.min(ms, 50) / 1000;
  if (sized) {
    syncScene(state, fdt);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  drawHUD(c, state);
  for (let i = 0; i < CONF.length; i++) {
    const q = CONF[i];
    c.save(); c.translate(q.x, q.y); c.rotate(q.rot);
    c.globalAlpha = clamp(q.life * 2, 0, 1);
    c.fillStyle = q.c; c.fillRect(-3, -1.8, 6, 3.6);
    c.restore();
  }
  c.globalAlpha = 1;
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
  const cap = document.createElement("p");
  cap.textContent = "LOADING THE TRACKS...";
  cap.style.cssText = "margin:0;letter-spacing:2px;font-size:12px;color:#a8ecff";
  el.appendChild(cap);
  document.body.appendChild(el);
  return { el: el, img: img, cap: cap };
}
function splashFail(splash, lines) {
  const el = splash.el;
  splash.img.style.width = "min(40vw,26vh,180px)";
  if (splash.cap) splash.cap.remove();
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
  hud.style.touchAction = "none";
  if (getComputedStyle(hud).position === "static") hud.style.position = "relative";
  const crt = stage.querySelector(".np-crt");
  if (crt) crt.style.display = "none";
  R.lastT = performance.now();
  layoutGL();
}
// "TRACK: NAME >" on the title card and the score card. Changing it races the attract loop on the new track.
const trackButtons = [];
function trackButton(parent, before) {
  if (!parent) return;
  const b = document.createElement("button");
  b.type = "button"; b.className = "np-btn"; b.style.cssText = "width:100%;margin-top:8px";
  b.addEventListener("click", function (e) { e.stopPropagation(); Sound.unlock(); pickTrack(trackSel + 1); labelTracks(); });
  parent.insertBefore(b, before || null);
  trackButtons.push(b); labelTracks();
}
function labelTracks() {
  trackButtons.forEach(function (b) {
    b.textContent = "TRACK: " + TRACKS[trackSel].name + "  >";
    b.setAttribute("aria-label", "Track: " + TRACKS[trackSel].name + ". Tap for the next track.");
  });
}
function logoImg(card, w) {
  if (!card) return;
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
  im.style.cssText = "display:block;width:" + w + ";height:auto;margin:0 auto 6px";
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_URL;
  card.insertBefore(im, card.firstChild);
}
function startGame() {
  Shell.init({
    slug: SLUG,
    title: "BATTLE KARTS",
    accent: "#ff9214",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "Six karts, three laps, prize cubes full of trouble. Grab a cube for a Pinball, a Tape Tangle, a Turbo or a Bubble Shield. Hold a drift through the bends and let go for a mini-turbo. On a phone: steer on the left pad, GAS, DRIFT, BRAKE and ITEM on the right.",
    keys: "Keys: up/W gas, down/S brake, left/right or A/D steer, Shift drift, Space item (hold down to throw it behind). N music, P pause, M mute, R restart. Left and right pick the track here.",
    tip: "Hold a drift until the sparks turn orange, then let go.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; simulate(dt); },
    onPause: function () { keys = {}; fingers.clear(); S.itemReq = false; },
    onResume: function () { Sound.unlock(); }
  });
  attach();
  bindTouch(R.hud);
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Sound.unlock, true); });
  Shell.onStart(function () { Sound.unlock(); CONF.length = 0; R.camSnap = true; });
  Shell.onRestart(function () { Sound.unlock(); CONF.length = 0; R.camSnap = true; });
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));
    if (typing || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.code === "KeyN") Sound.toggleMusic();
    const st = Shell.state();
    if ((st === "title" || st === "over") && (e.code === "ArrowLeft" || e.code === "ArrowRight")) {
      e.preventDefault(); pickTrack(trackSel + (e.code === "ArrowLeft" ? -1 : 1)); labelTracks();
    }
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  const overActions = document.querySelector("#np-ov-over .np-actions");
  if (titleCard) {
    logoImg(titleCard, "clamp(72px,16vh,120px)");
    const tip = titleCard.querySelector(".np-tip");
    trackButton(titleCard, tip);
    Sound.button(titleCard, tip);
  }
  if (pauseActions) Sound.button(pauseActions, pauseActions.querySelector("a"));
  if (overActions) trackButton(overActions, overActions.querySelector("a"));
  Sound.barButton();
  logoImg(document.querySelector("#np-ov-over .np-card"), "clamp(64px,14vh,104px)");
}

// Hook for automated checks (no effect on play)
window.__battleKarts = { S: function () { return S; }, gfx: function () { return R; }, led: function () { return LED; }, sound: Sound, tracks: TRACKS, trackData: trackData,
                         newRace: newRace, simulate: simulate, scoreOf: scoreOf, pick: pickTrack, keys: function () { return keys; },
                         touch: function (on) { touchMode = !!on; }, auto: function (on) { AUTO = !!on; }, setRace: function (r) { S = r; }, startMusic: startMusic };

(function boot() {
  const splash = makeSplash();
  const t0 = performance.now();
  const q = /[?&]gfx=(high|low)/.exec(location.search);
  if (/[?&]touch=1/.test(location.search) || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)) touchMode = true;
  Promise.all([loadLogo(splash), import(THREE_URL).then(null, function (e) { e.npStage = "three"; throw e; }), loadImage(SCRIPT_URL)])
    .then(function (res) {
      THREE = res[1];
      try { R = buildScene(THREE, res[2]); } catch (e) { e.npStage = "webgl"; throw e; }
      if (q) { R.qLock = true; setQuality(q[1] === "low" ? QUALITY.length - 1 : 0); }
      reset();
      try { showTrack(S.ti); syncScene("title", 0); R.renderer.compile(R.scene, R.camera); } catch (e) { console.error(e); }
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
        ? "Battle Karts could not load its 3D engine (" + THREE_URL + ")."
        : "Battle Karts needs WebGL for its 3D tracks, and this browser has it switched off or does not support it.");
    });
})();
