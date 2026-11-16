/* PAINTBALL BLITZ (3D): the orange squad has your flag. Go get it back.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of the title / pause / game over flow, and carries the HUD and the touch controls.

   The field is laid out in meters. x runs across it (0 = the middle), y is up, and z runs its
   length with your base at +z and the orange base at -z. A heading h faces (sin h, cos h) on the
   ground, so h = PI looks up the field toward the orange base. Everything here is original:
   the teams, the field, the music, the sounds and the people are all made in this file. */

const W = 360, H = 540, TAU = Math.PI * 2, DEG = Math.PI / 180;
const FX = 20, FZ = 33;                                    // half width and half length of the field, inside the netting
const HOME = { x: 0, z: 29 }, AWAY = { x: 0, z: -29 };     // flag stands: yours, and theirs (where your flag is)
const PR = 0.36;                                           // body radius for moving around
const RUN = 6.1, DUCK_RUN = 2.5, TURN_KEYS = 2.6;          // m/s, m/s, rad/s
const BALL_V = 44, BALL_G = 6.5, BALL_LIFE = 1.7, BALL_R = 0.045;
const HOPPER = 25, POD_START = 4, POD_MAX = 6, RELOAD_T = 1.05, FIRE_GAP = 0.125;
const HITS = 3, OUT_T = 2.7, SAFE_T = 2.2, HEAL_T = 6, STATION_R = 3.2;
const GRAB_R = 1.6, CAP_R = 2.7, FLAG_RESET_T = 15;
const PTS = { tag: 100, grab: 250, cap: 1000, perSec: 10, clean: 500, recover: 100 };
const CAM = { back: 3.35, side: 0.66, up: 0.95, ahead: 10, fov: 64, pivot: 1.5 };
const PAINT = { blue: "#ffe600", orange: "#ff2fa8" };      // your paint is bright yellow, theirs is hot pink

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash, title card and score card
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every decal out on the field
const THREE_URL = "../shared/three.module.min.js";
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';

/* ---------------- The fields ---------------- */
// Each piece of cover: k = what it looks like, s = its solid shape ("cyl", "cone" or "box"), h = height.
function can(x, z, col, r, h) { return { k: "can", s: "cyl", x: x, z: z, r: r || 0.72, h: h || 1.75, rot: 0, col: col || "red" }; }
function tower(x, z, col) { return { k: "can", s: "cyl", x: x, z: z, r: 0.85, h: 2.6, rot: 0, col: col || "purple", tall: true }; }
function dorito(x, z, rot, col) { return { k: "dorito", s: "cone", x: x, z: z, r: 1.05, h: 1.55, rot: rot || 0, col: col || "yellow" }; }
function snake(x, z, len, rot, col) { return { k: "snake", s: "box", x: x, z: z, hx: len / 2, hz: 0.62, h: 1.25, rot: rot || 0, col: col || "green", len: len }; }
function brick(x, z, rot, col, w, d, h) { return { k: "brick", s: "box", x: x, z: z, hx: (w || 2.3) / 2, hz: (d || 1.15) / 2, h: h || 1.6, rot: rot || 0, col: col || "blue" }; }
function crate(x, z, rot, n, s) { s = s || 1.3; return { k: "crate", s: "box", x: x, z: z, hx: s / 2, hz: s / 2, h: s * (n || 1), n: n || 1, rot: rot || 0, size: s }; }
function wall(x, z, rot, w) { return { k: "wall", s: "box", x: x, z: z, hx: (w || 3.2) / 2, hz: 0.1, h: 2.05, rot: rot || 0 }; }
function barrels(x, z, col) {
  return [[0, 0], [0.74, 0.05], [0.36, 0.66]].map(function (o) { return { k: "barrel", s: "cyl", x: x + o[0], z: z + o[1], r: 0.34, h: 1.02, rot: 0, col: col || "red" }; });
}
// Lay out your half; the orange half is the same field turned around, so neither side gets the better cover.
function field(list) {
  const out = [];
  list.forEach(function (o) { (Array.isArray(o) ? o : [o]).forEach(function (p) { out.push(p); }); });
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const o = out[i];
    if (Math.abs(o.x) < 0.01 && Math.abs(o.z) < 0.01) continue;
    const m = {}; for (const k in o) m[k] = o[k];
    m.x = -o.x; m.z = -o.z; m.rot = o.rot + Math.PI;
    out.push(m);
  }
  return out;
}

const ARENAS = [
  { name: "DANDELION FIELD", sub: "Morning scrimmage. Three on the orange squad.", time: 150, foes: 3, sky: "morning",
    aim: 0.078, react: 0.95, gap: 0.42, burst: [2, 4], speed: 3.8, respawn: 9, lead: 0, peek: [1.3, 2.2],
    cover: field([dorito(-6, 21, 0.3, "yellow"), dorito(6, 21.5, -0.3, "yellow"), can(-13, 17, "red"), can(13, 16.5, "red"),
                  brick(0, 15.5, 0, "blue"), snake(-14.5, 8, 5, Math.PI / 2, "green"), snake(14.5, 9, 5, Math.PI / 2, "green"),
                  can(-5, 10, "purple"), can(5.5, 8, "purple"), brick(0, 0, 0, "red", 3.4, 1.2, 1.65), dorito(-10, 0, 0.5, "blue")]) },
  { name: "CRATE CANYON", sub: "Wood, barrels and four on orange. Watch the stacks.", time: 150, foes: 4, sky: "noon",
    aim: 0.066, react: 0.75, gap: 0.36, burst: [3, 5], speed: 4.3, respawn: 8, lead: 0.3, peek: [1.1, 1.9],
    cover: field([crate(-5, 22, 0.1, 2), crate(5.2, 20, -0.2, 1), wall(0, 15.5, 0, 3.6), barrels(-12.8, 19), barrels(11.2, 14),
                  crate(-12, 10, 0.3, 1), crate(-10.55, 10.25, 0, 2), crate(12, 6, 0, 2), tower(-4, 7, "blue"), wall(8, 2.6, Math.PI / 2, 3.2),
                  crate(0, 0, 0.785, 2), barrels(-15.6, -0.3, "blue")]) },
  { name: "SUNSET SPEEDBALL", sub: "Inflatables everywhere and five on orange. Keep moving.", time: 150, foes: 5, sky: "sunset",
    aim: 0.058, react: 0.6, gap: 0.3, burst: [3, 6], speed: 4.7, respawn: 7, lead: 0.6, peek: [0.9, 1.6],
    cover: field([dorito(-3.6, 22, 0.2, "yellow"), dorito(3.6, 22, -0.2, "yellow"), snake(-15, 14, 7, Math.PI / 2, "green"),
                  snake(15, 16, 7, Math.PI / 2, "green"), can(-9, 18.5, "red"), can(9, 18, "red"), brick(0, 13, 0, "purple"),
                  tower(-7, 9, "red"), tower(7, 6.5, "yellow"), dorito(-11.5, 4.5, 0.4, "blue"), dorito(12, 2, -0.6, "blue"),
                  brick(0, 0, Math.PI / 2, "blue", 3.2, 1.25, 1.7), can(-5.5, 0, "purple")]) },
  { name: "MIDNIGHT NEON", sub: "Lights on, six on orange, and they do not miss much.", time: 165, foes: 6, sky: "night",
    aim: 0.052, react: 0.5, gap: 0.26, burst: [4, 6], speed: 5.0, respawn: 6, lead: 0.85, peek: [0.8, 1.4],
    cover: field([brick(-4, 22, 0.2, "purple"), brick(4.2, 21, -0.2, "purple"), crate(-13, 20, 0, 2), barrels(10.8, 18.6, "blue"),
                  snake(-8, 13, 6, 0, "green"), dorito(9, 12, 0.3, "yellow"), tower(0, 10.5, "red"), wall(-15, 6, Math.PI / 2, 3.4),
                  can(14, 6, "blue"), dorito(-5, 4.5, -0.3, "red"), crate(5, 3, 0.4, 1), tower(0, 0, "yellow"), snake(-11, 0, 5, Math.PI / 2, "blue")]) }
];

/* ---------------- Solids ---------------- */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function rand(a, b) { return a + Math.random() * (b - a); }
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.15; }
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function local(o, x, z) { const dx = x - o.x, dz = z - o.z, c = Math.cos(o.rot), s = Math.sin(o.rot); return [c * dx - s * dz, s * dx + c * dz]; }
function cover() { return ARENAS[S.arena].cover; }

// Is the point (x, y, z) inside a piece of cover (grown by m)? Returns the piece or null.
function solidAt(x, y, z, m) {
  const L = cover();
  for (let i = 0; i < L.length; i++) {
    const o = L[i];
    if (y > o.h + m || y < -m) continue;
    const dx = x - o.x, dz = z - o.z;
    if (o.s === "box") {
      if (dx * dx + dz * dz > (o.hx + o.hz + m) * (o.hx + o.hz + m)) continue;
      const p = local(o, x, z);
      if (Math.abs(p[0]) < o.hx + m && Math.abs(p[1]) < o.hz + m) return o;
    } else {
      const r = o.s === "cone" ? o.r * (1 - 0.82 * clamp(y / o.h, 0, 1)) : o.r;
      if (dx * dx + dz * dz < (r + m) * (r + m)) return o;
    }
  }
  return null;
}
// Which way the surface of o faces at a point just inside it.
function surfaceNormal(o, x, y, z, out) {
  if (o.s === "box") {
    const p = local(o, x, z), fx = o.hx - Math.abs(p[0]), fz = o.hz - Math.abs(p[1]), fy = o.h - y;
    let lx = 0, lz = 0, ny = 0;
    if (fy < fx && fy < fz) ny = 1; else if (fx < fz) lx = Math.sign(p[0]); else lz = Math.sign(p[1]);
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    out[0] = c * lx + s * lz; out[1] = ny; out[2] = -s * lx + c * lz;
  } else {
    const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz) || 1;
    if (o.s === "cyl" && y > o.h - 0.06) { out[0] = 0; out[1] = 1; out[2] = 0; }
    else { const up = o.s === "cone" ? 0.55 : 0; const l = Math.hypot(1, up); out[0] = dx / d / l; out[1] = up / l; out[2] = dz / d / l; }
  }
  return out;
}
// Nothing solid on the line from a to b (the ends themselves are not checked).
function clearLine(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz), n = Math.ceil(d / 0.3);
  for (let i = 1; i < n; i++) {
    const u = i / n;
    if (solidAt(ax + dx * u, ay + dy * u, az + dz * u, 0)) return false;
  }
  return true;
}
// Keep a body of radius r out of the cover, off the netting and away from the flag stands.
function pushOut(c, r) {
  const L = cover();
  for (let i = 0; i < L.length; i++) {
    const o = L[i], dx = c.x - o.x, dz = c.z - o.z;
    if (o.s === "box") {
      if (dx * dx + dz * dz > (o.hx + o.hz + r) * (o.hx + o.hz + r)) continue;
      const p = local(o, c.x, c.z), qx = clamp(p[0], -o.hx, o.hx), qz = clamp(p[1], -o.hz, o.hz);
      let ex = p[0] - qx, ez = p[1] - qz, d = Math.hypot(ex, ez);
      if (d >= r) continue;
      if (d < 1e-5) {                                         // inside: out through the nearest side
        const fx = o.hx - Math.abs(p[0]), fz = o.hz - Math.abs(p[1]);
        if (fx < fz) { ex = Math.sign(p[0]) || 1; ez = 0; d = -fx; } else { ex = 0; ez = Math.sign(p[1]) || 1; d = -fz; }
      } else { ex /= d; ez /= d; }
      const push = r - d, cc = Math.cos(o.rot), s = Math.sin(o.rot);
      c.x += (cc * ex + s * ez) * push; c.z += (-s * ex + cc * ez) * push;
    } else {
      const rr = (o.s === "cone" ? o.r * 0.9 : o.r) + r, d = Math.hypot(dx, dz);
      if (d < rr) { const k = d > 1e-5 ? (rr - d) / d : 0; c.x += dx * k; c.z += dz * k; if (d <= 1e-5) c.x += rr; }
    }
  }
  [HOME, AWAY].forEach(function (b) {
    const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz), rr = 0.32 + r;
    if (d < rr && d > 1e-5) { c.x += dx / d * (rr - d); c.z += dz / d * (rr - d); }
  });
  c.x = clamp(c.x, -FX + r, FX - r); c.z = clamp(c.z, -FZ + r, FZ - r);
}

/* ---------------- Cover spots: where a player can tuck in behind something ---------------- */
function coverSpots(list) {
  const out = [];
  list.forEach(function (o) {
    if (o.h < 1.2) return;
    const pts = [];
    if (o.s === "box") {
      const ax = o.hx + 0.6, az = o.hz + 0.6;
      [[ax, 0], [-ax, 0], [0, az], [0, -az], [ax * 0.7, az], [-ax * 0.7, az], [ax * 0.7, -az], [-ax * 0.7, -az]].forEach(function (p) {
        const c = Math.cos(o.rot), s = Math.sin(o.rot);
        pts.push([o.x + c * p[0] + s * p[1], o.z - s * p[0] + c * p[1]]);
      });
    } else for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, r = o.r + 0.62; pts.push([o.x + Math.sin(a) * r, o.z + Math.cos(a) * r]); }
    pts.forEach(function (p) {
      if (Math.abs(p[0]) > FX - 0.6 || Math.abs(p[1]) > FZ - 0.6) return;
      const t = { x: p[0], z: p[1] }; pushOut(t, 0.34);
      if (Math.hypot(t.x - p[0], t.z - p[1]) < 0.2) out.push({ x: t.x, z: t.z, o: o });
    });
  });
  return out;
}
// Does this spot have its piece of cover between it and the threat at (px, pz)?
function shields(sp, px, pz) {
  if (!sp.o) return false;                                  // a fallback spot out in the open shields nothing
  const ox = sp.o.x - sp.x, oz = sp.o.z - sp.z, tx = px - sp.x, tz = pz - sp.z;
  const lo = Math.hypot(ox, oz) || 1, lt = Math.hypot(tx, tz) || 1;
  return lt > lo + 1.2 && (ox * tx + oz * tz) / (lo * lt) > 0.82;
}

/* ---------------- People ---------------- */
function mkChar(team, num) {
  return { team: team, num: num, x: 0, z: 0, h: 0, pitch: 0, crouch: 0, duck: false, mvx: 0, mvz: 0, speed: 0, phase: Math.random() * TAU,
           out: false, outT: 0, gone: false, hits: 0, safe: 0, recoil: 0, fireT: 0, cheer: 0, hitT: 0, marks: [], ai: null, lastX: 0, lastZ: 0 };
}
// The parts of a body a paintball can land on: [x, y, z, radius] each, crouch included.
function bodyParts(c, out) {
  const k = c.crouch, fx = Math.sin(c.h), fz = Math.cos(c.h);
  const P = [[1.66 - 0.62 * k, 0.135, 0.2 * k], [1.32 - 0.5 * k, 0.215, 0.13 * k], [0.98 - 0.46 * k, 0.19, 0], [0.52 - 0.24 * k, 0.17, 0]];
  for (let i = 0; i < 4; i++) { out[i * 4] = c.x + fx * P[i][2]; out[i * 4 + 1] = P[i][0]; out[i * 4 + 2] = c.z + fz * P[i][2]; out[i * 4 + 3] = P[i][1]; }
  return out;
}
const PARTS = new Float32Array(16);
function muzzle(c, out) {
  const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = -Math.cos(c.h), rz = Math.sin(c.h);
  out[0] = c.x + fx * 0.74 + rx * 0.1; out[1] = 1.36 - 0.44 * c.crouch; out[2] = c.z + fz * 0.74 + rz * 0.1;
  return out;
}
// The over-the-shoulder camera, before any smoothing. The crosshair sits in the middle of the screen,
// so its ray is camera -> target.
function camIdeal(c, o) {
  const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = -Math.cos(c.h), rz = Math.sin(c.h), py = CAM.pivot - 0.42 * c.crouch;
  o.px = c.x - fx * CAM.back + rx * CAM.side; o.py = py + CAM.up; o.pz = c.z - fz * CAM.back + rz * CAM.side;
  o.tx = c.x + fx * CAM.ahead + rx * CAM.side * 0.35; o.ty = py - 0.12 + Math.tan(c.pitch) * (CAM.ahead + CAM.back); o.tz = c.z + fz * CAM.ahead + rz * CAM.side * 0.35;
  return o;
}

/* ---------------- Game state ---------------- */
let S = {}, keys = {}, idleT = 0, paused = false;
let THREE = null, R = null, TV = null;                     // R holds everything the renderer owns
// V is how things are shown (splats, droplets, the camera's moves). It never feeds back into the rules.
const V = { splats: [], drops: [], lens: [], floats: [], hitDir: [], flash: 0, introCam: 0, splatReset: 0 };
const IN = { stick: null, look: null, fireP: null, mouseFire: false, mouseDrag: null, locked: false, touchUI: false, duckToggle: false, reloadTap: false, lastMouse: 0 };

function reset() {
  paused = false;
  S = { t: 0, arena: 0, score: 0, tags: 0, shots: 0, hits: 0, captures: 0, outs: 0, streak: 0, bestStreak: 0, cleared: 0,
        phase: "intro", pt: 0, time: 0, p: mkChar("blue", 1), foes: [], balls: [], pods: [], hopper: HOPPER, packs: POD_START,
        reload: 0, healT: 0, flag: null, grabbed: false, arenaOuts: 0, arenaT: 0, warned: false, aim: null, lastTagT: -9, multi: 0,
        msg: "", ending: false, endT: 0, champion: false };
  ARENAS.forEach(function (a) { if (!a.spots) a.spots = coverSpots(a.cover); });
  V.splats.length = 0; V.drops.length = 0; V.lens.length = 0; V.floats.length = 0; V.hitDir.length = 0; V.splatReset++;
  IN.stick = IN.look = IN.fireP = null; IN.mouseFire = false; IN.duckToggle = false;
  ledClear();
  setupArena(0, true);
}

function setupArena(i, first) {
  const A = ARENAS[i];
  S.arena = i; S.time = A.time; S.phase = "intro"; S.pt = 0; S.introShown = false; S.arenaOuts = 0; S.arenaT = 0; S.warned = false; S.grabbed = false;
  S.balls.length = 0; S.pods.length = 0;
  const p = S.p;
  p.x = 0; p.z = HOME.z + 1.6; p.h = Math.PI; p.pitch = 0; p.crouch = 0; p.duck = false; p.out = false; p.gone = false; p.hits = 0;
  p.safe = 0; p.cheer = 0; p.marks.length = 0; p.speed = 0;
  S.hopper = HOPPER; S.packs = Math.max(S.packs, POD_START); S.reload = 0;
  S.flag = { st: "base", x: AWAY.x, z: AWAY.z, t: 0 };
  S.foes = [];
  for (let k = 0; k < A.foes; k++) {
    const e = mkChar("orange", 2 + k);
    e.ai = { role: k % 2 === 0 ? "guard" : "rusher", st: "move", spot: null, timer: rand(0.2, 1.2), cycles: 0, seeT: 0, lostT: 9,
             next: 0, burst: 0, stuckT: 0, side: 0, sideT: 0, respawn: 0, sx: 0, sz: 0, tx: 0, tz: 0 };
    spawnFoe(e, k, A.foes);
    S.foes.push(e);
  }
  V.splats.length = 0; V.splatReset++; V.lens.length = 0; V.hitDir.length = 0;
  V.introCam = 0;
}
function spawnFoe(e, k, n) {
  e.x = (k - (n - 1) / 2) * 3.2 + rand(-0.4, 0.4); e.z = AWAY.z - 1.5 + rand(-0.4, 0.4); e.h = 0; e.crouch = 0; e.duck = false;
  e.out = false; e.gone = false; e.hits = 0; e.safe = 1.4; e.marks.length = 0; e.speed = 0;
  e.ai.st = "move"; e.ai.spot = null; e.ai.cycles = 0; e.ai.seeT = 0; e.ai.timer = rand(0.1, 0.8);
}

/* ---------------- Shooting ---------------- */
const TMP = [0, 0, 0], NRM = [0, 0, 0];
function fire(c, tx, ty, tz, err) {
  muzzle(c, TMP);
  const ox = TMP[0], oy = TMP[1], oz = TMP[2];
  let dx = tx - ox, dz = tz - oz;
  const flat = Math.hypot(dx, dz) || 1, t = flat / BALL_V;
  let dy = ty - oy + 0.5 * BALL_G * t * t;                  // aim a little high: the ball drops on the way
  let yaw = Math.atan2(dx, dz), pit = Math.atan2(dy, flat);
  yaw += gauss() * err; pit += gauss() * err * 0.6;
  const cp = Math.cos(pit);
  S.balls.push({ x: ox, y: oy, z: oz, vx: Math.sin(yaw) * cp * BALL_V, vy: Math.sin(pit) * BALL_V, vz: Math.cos(yaw) * cp * BALL_V,
                 team: c.team, t: 0, from: c });
  if (S.balls.length > 90) S.balls.shift();
  c.recoil = 1; c.fireT = 0.35;
  if (c === S.p) { S.shots++; Juke.sfx("pop", 0); }
  else Juke.sfx("pop", Math.min(1, Math.hypot(c.x - S.p.x, c.z - S.p.z) / 40));
}

function stepBalls(dt) {
  for (let i = S.balls.length - 1; i >= 0; i--) {
    const b = S.balls[i];
    b.t += dt;
    const n = Math.max(1, Math.ceil(BALL_V * dt / 0.22)), sdt = dt / n;
    let done = false;
    for (let s = 0; s < n && !done; s++) {
      b.vy -= BALL_G * sdt;
      b.x += b.vx * sdt; b.y += b.vy * sdt; b.z += b.vz * sdt;
      // people
      const targets = b.team === "blue" ? S.foes : [S.p];
      for (let k = 0; k < targets.length && !done; k++) {
        const c = targets[k];
        if (c.out || c.gone || c.safe > 0) continue;
        if (Math.abs(c.x - b.x) > 1 || Math.abs(c.z - b.z) > 1) continue;
        bodyParts(c, PARTS);
        for (let q = 0; q < 4; q++) {
          const dx = b.x - PARTS[q * 4], dy = b.y - PARTS[q * 4 + 1], dz = b.z - PARTS[q * 4 + 2], r = PARTS[q * 4 + 3] + BALL_R;
          if (dx * dx + dy * dy + dz * dz < r * r) { hitPerson(c, b, q); done = true; break; }
        }
      }
      if (done) break;
      // cover
      const o = solidAt(b.x, b.y, b.z, BALL_R * 0.5);
      if (o) { surfaceNormal(o, b.x, b.y, b.z, NRM); splat(b, NRM[0], NRM[1], NRM[2], 1); done = true; break; }
      if (b.y < 0.02) { b.y = 0.02; splat(b, 0, 1, 0, 1); done = true; break; }
      // the netting
      if (Math.abs(b.x) > FX + 0.9 || Math.abs(b.z) > FZ + 0.9) {
        if (b.y < 5.6) {
          const onX = Math.abs(b.x) > FX + 0.9;
          if (onX) b.x = Math.sign(b.x) * (FX + 0.92); else b.z = Math.sign(b.z) * (FZ + 0.92);
          splat(b, onX ? -Math.sign(b.x) : 0, 0, onX ? 0 : -Math.sign(b.z), 0.8);
        }
        done = true;
      }
    }
    if (done || b.t > BALL_LIFE) S.balls.splice(i, 1);
  }
}
function paintOf(team) { return PAINT[team]; }
function splat(b, nx, ny, nz, size) {
  V.splats.push({ x: b.x, y: b.y, z: b.z, nx: nx, ny: ny, nz: nz, col: paintOf(b.team), s: size * rand(0.32, 0.5) });
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * TAU, sp = rand(0.8, 2.6);
    V.drops.push({ x: b.x, y: b.y, z: b.z, vx: nx * 1.6 + Math.cos(a) * sp, vy: ny * 1.6 + rand(0.5, 2.2), vz: nz * 1.6 + Math.sin(a) * sp, life: rand(0.25, 0.45), col: paintOf(b.team) });
  }
  if (V.drops.length > 140) V.drops.splice(0, V.drops.length - 140);
  const d = Math.hypot(b.x - S.p.x, b.z - S.p.z);
  if (d < 26) Juke.sfx("splat", d / 26);
}

function hitPerson(c, b, part) {
  splat(b, -b.vx / BALL_V, 0.2, -b.vz / BALL_V, 0.6);
  // where on the body it landed, in the body's own terms (front or back, which side, how high)
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  const front = -(b.vx * fx + b.vz * fz) > 0;
  c.marks.push({ part: part, front: front, side: rand(-1, 1), col: paintOf(b.team), spin: Math.random() * TAU });
  if (c.marks.length > 4) c.marks.shift();
  c.hitT = 0.25;
  if (c.team === "orange") {
    S.hits++;
    tagOut(c);
  } else {
    if (c.out) return;
    c.hits++;
    S.p.healT = 0;
    Juke.sfx("ouch", 0);
    V.lens.push({ x: rand(60, W - 60), y: rand(140, H - 170), r: rand(46, 74), t: 0, col: paintOf(b.team), seed: Math.random() * 1000 });
    if (V.lens.length > 4) V.lens.shift();
    V.hitDir.push({ a: Math.atan2(-b.vx, -b.vz), t: 0 });
    camShake(0.08, 0.25); Shell.shake(2, 0.15);
    if (c.hits >= HITS) playerOut();
  }
}

function tagOut(e) {
  e.out = true; e.outT = 0; e.crouch = Math.min(e.crouch, 0.3);
  e.ai.respawn = ARENAS[S.arena].respawn;
  S.tags++; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak);
  let pts = PTS.tag;
  const multi = S.t - S.lastTagT < 2.2;
  S.multi = multi ? S.multi + 1 : 1;
  S.lastTagT = S.t;
  if (S.multi >= 2) pts += 50 * (S.multi - 1);
  addScore(pts, e, S.multi >= 2 ? (S.multi === 2 ? "DOUBLE TAG +" : "TRIPLE TAG +") + pts : "TAGGED +" + pts);
  Juke.sfx("tag", 0);
  if (window.Trophies) {
    Trophies.unlock("pbz-first-splat");
    if (S.streak >= 8) Trophies.unlock("pbz-hot-streak");
  }
  if (window.NPRewards && (S.streak === 3 || (S.streak >= 5 && S.streak % 5 === 0))) NPRewards.streak(S.streak, S.streak === 3 ? "" : S.streak + " TAGS, NO HITS!");
  ledPlay([S.multi >= 2 ? ledMsg("cycle", S.multi === 2 ? "DOUBLE TAG!" : "TRIPLE TAG!", 1.6) : ledMsg("flash", "TAGGED!", 1.3),
           ledMsg("count", "SCORE", 1.8, { from: S.score - pts, value: S.score, keep: true })]);
  // sometimes they leave a paint pod behind
  if (Math.random() < 0.45 && S.pods.length < 4) S.pods.push({ x: e.x, z: e.z, t: 0 });
}
function addScore(pts, at, label) {
  S.score += pts;
  V.floats.push({ txt: label, x: at ? at.x : S.p.x, y: 2.2, z: at ? at.z : S.p.z, t: 0, col: "#ffe45c" });
}

function playerOut() {
  const p = S.p;
  p.out = true; p.outT = 0; p.duck = false;
  S.outs++; S.arenaOuts++; S.streak = 0; S.multi = 0;
  S.phase = "out"; S.pt = 0;
  IN.duckToggle = false;
  Shell.flash("YOU'RE OUT!", "Hands up, walk it off. Back in a few.", "#ff3fa4", 1500);
  Juke.sfx("out", 0);
  if (S.flag.st === "carried") dropFlag();
  ledPlay([ledMsg("blink", "YOU'RE OUT!", 2.4, { color: "pink" })]);
}
function respawnPlayer() {
  const p = S.p;
  p.x = rand(-1.5, 1.5); p.z = HOME.z + 1.6; p.h = Math.PI; p.pitch = 0; p.out = false; p.hits = 0; p.safe = SAFE_T;
  p.crouch = 0; p.marks.length = 0; p.speed = 0;
  S.hopper = HOPPER; S.reload = 0;
  V.lens.length = 0;
  S.phase = "play"; S.pt = 0;
}

/* ---------------- The flag ---------------- */
function dropFlag() {
  S.flag.st = "dropped"; S.flag.x = S.p.x; S.flag.z = S.p.z; S.flag.t = 0;
  Juke.sfx("drop", 0);
  ledPlay([ledMsg("blink", "FLAG DOWN!", 2, { color: "red" })], true);
}
function updateFlag(dt) {
  const f = S.flag, p = S.p;
  if (f.st === "carried") { f.x = p.x; f.z = p.z; return; }
  if (!p.out && (f.st === "base" || f.st === "dropped") && Math.hypot(p.x - f.x, p.z - f.z) < GRAB_R) {
    const again = f.st === "dropped";
    f.st = "carried";
    if (!S.grabbed) {
      S.grabbed = true;
      addScore(PTS.grab, p, "FLAG +" + PTS.grab);
      Shell.flash("FLAG GRABBED!", "Now run it home to your base.", "#3ff0ff", 1400);
      ledPlay([ledMsg("cycle", "FLAG GRABBED!", 1.8), ledMsg("slide", "RUN IT HOME!", 1.8, { color: "cyan", keep: true })]);
    } else if (again) {
      addScore(PTS.recover, p, "RECOVERED +" + PTS.recover);
      ledPlay([ledMsg("slide", "GOT IT BACK!", 1.6, { color: "lime" })]);
    }
    Juke.sfx("grab", 0);
    return;
  }
  if (f.st === "dropped") {
    f.t += dt;
    let back = f.t > FLAG_RESET_T;
    for (let i = 0; i < S.foes.length && !back; i++) {
      const e = S.foes[i];
      if (!e.out && !e.gone && Math.hypot(e.x - f.x, e.z - f.z) < 1.2) back = true;
    }
    if (back) {
      f.st = "base"; f.x = AWAY.x; f.z = AWAY.z;
      Shell.flash("FLAG RESET", "It's back on their stand.", "#ff9214", 1100);
      ledPlay([ledMsg("slide", "FLAG RESET", 1.8, { color: "orange" })]);
      Juke.sfx("drop", 0);
    }
  }
}
function capture() {
  const left = Math.ceil(S.time), clean = S.arenaOuts === 0;
  let pts = PTS.cap + left * PTS.perSec;
  if (clean) pts += PTS.clean;
  S.captures++; S.cleared = S.arena + 1;
  addScore(pts, S.p, "CAPTURE +" + pts);
  S.flag.st = "home"; S.flag.x = HOME.x; S.flag.z = HOME.z;
  S.phase = "capture"; S.pt = 0;
  S.p.cheer = 1;
  Juke.sfx("capture", 0);
  Shell.sfx("crowd");
  const last = S.arena >= ARENAS.length - 1;
  Shell.flash(last ? "FIELD CHAMPION!" : "CAPTURE!", left + "s left x " + PTS.perSec + (clean ? "  +" + PTS.clean + " never tagged" : ""), "#ffd23f", 2200);
  Shell.shake(3, 0.3);
  if (window.Trophies) {
    Trophies.unlock("pbz-capture");
    if (clean) Trophies.unlock("pbz-untouched");
    if (S.arenaT < 40) Trophies.unlock("pbz-quick-grab");
    if (last) Trophies.unlock("pbz-champion");
  }
  ledPlay([ledMsg("flash", "CAPTURE!", 2.0), ledMsg("count", "SCORE", 2.2, { from: S.score - pts, value: S.score, keep: true })]);
}

/* ---------------- The orange squad ---------------- */
function nearestFreeSpots(e, px, pz, want) {
  const A = ARENAS[S.arena], ai = e.ai;
  let best = null, bs = 1e9;
  for (let i = 0; i < A.spots.length; i++) {
    const sp = A.spots[i];
    if (!shields(sp, px, pz)) continue;
    let taken = false;
    for (let k = 0; k < S.foes.length; k++) { const o = S.foes[k]; if (o !== e && o.ai.spot && Math.hypot(o.ai.spot.x - sp.x, o.ai.spot.z - sp.z) < 2.2) { taken = true; break; } }
    if (taken) continue;
    const dMe = Math.hypot(sp.x - e.x, sp.z - e.z), dThreat = Math.hypot(sp.x - px, sp.z - pz);
    let sc = dMe * 0.6 + Math.abs(dThreat - want) * 1.2 + Math.random() * 3;
    if (ai.role === "guard" && sp.z > -9) sc += 30;            // guards keep to their own half
    if (ai.role === "guard") sc += Math.abs(sp.z - AWAY.z + 10) * 0.4;
    if (sc < bs) { bs = sc; best = sp; }
  }
  return best;
}
// What of the player can this person see from here? 2 = chest, 1 = head only, 0 = nothing.
function canSee(e, p) {
  const ey = 1.62 - 0.6 * e.crouch;
  bodyParts(p, PARTS);
  if (clearLine(e.x, ey, e.z, PARTS[4], PARTS[5], PARTS[6])) return 2;
  if (clearLine(e.x, ey, e.z, PARTS[0], PARTS[1], PARTS[2])) return 1;
  return 0;
}
function steer(c, tx, tz, speed, dt) {
  let dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
  if (d < 0.15) { c.mvx = 0; c.mvz = 0; c.speed += (0 - c.speed) * Math.min(1, dt * 10); return true; }
  dx /= d; dz /= d;
  const ai = c.ai;
  if (ai && ai.sideT > 0) { ai.sideT -= dt; const s = ai.side; const nx = dx * 0.4 - dz * s, nz = dz * 0.4 + dx * s, l = Math.hypot(nx, nz); dx = nx / l; dz = nz / l; }
  const v = Math.min(speed, d * 4);
  c.x += dx * v * dt; c.z += dz * v * dt;
  c.mvx = dx; c.mvz = dz; c.speed += (v - c.speed) * Math.min(1, dt * 10);
  return false;
}
function updateFoe(e, dt) {
  const A = ARENAS[S.arena], ai = e.ai, p = S.p;
  e.safe = Math.max(0, e.safe - dt); e.recoil = Math.max(0, e.recoil - dt * 6); e.fireT = Math.max(0, e.fireT - dt); e.hitT = Math.max(0, e.hitT - dt);
  if (e.out) {                                                // hands up, walk to the side line, then back to their base
    e.outT += dt; e.crouch = Math.max(0, e.crouch - dt * 4);
    if (!e.gone) {
      const sx = e.x < 0 ? -FX + 0.6 : FX - 0.6;
      if (e.outT > 0.7) steer(e, sx, e.z, 2.2, dt); else { e.speed = 0; e.mvx = e.mvz = 0; }
      e.h += angDiff(e.h, Math.atan2(sx - e.x, 0.001)) * Math.min(1, dt * 4);
      if (e.outT > 3.4) e.gone = true;
    } else {
      ai.respawn -= dt;
      if (ai.respawn <= 0) spawnFoe(e, Math.floor(Math.random() * A.foes), A.foes);
    }
    return;
  }
  const alive = !p.out && S.phase === "play";
  const f = S.flag;
  let tx = e.x, tz = e.z, speed = A.speed, wantCrouch = false, face = null;
  // look for the player
  let see = 0;
  ai.lookT = (ai.lookT || 0) - dt;
  if (alive && ai.lookT <= 0) { ai.lookT = 0.12; ai.see = canSee(e, p); }
  if (alive) see = ai.see || 0; else ai.see = 0;
  const dist = Math.hypot(p.x - e.x, p.z - e.z);
  if (see && dist < 34) { ai.seeT += dt; ai.lostT = 0; } else { ai.lostT += dt; if (ai.lostT > 0.5) ai.seeT = 0; }
  const carrying = f.st === "carried";
  // who goes after a dropped flag: the closest one standing
  let fetcher = null;
  if (f.st === "dropped") {
    let bd = 1e9;
    S.foes.forEach(function (o) { if (!o.out) { const d = Math.hypot(o.x - f.x, o.z - f.z); if (d < bd) { bd = d; fetcher = o; } } });
  }
  if (fetcher === e) { ai.st = "fetch"; tx = f.x; tz = f.z; speed *= 1.1; }
  else if (carrying && alive) {
    // everybody after the flag carrier, fanned out a little so they do not run in a line
    ai.st = "chase";
    const ang = (e.num - 4) * 0.55, r = ai.role === "guard" ? 9 : 6;
    tx = p.x + Math.sin(p.h + ang) * r * 0.3; tz = p.z - r * 0.5 + Math.cos(ang) * 2;
    if (ai.role === "guard") tz = Math.min(tz, p.z - 4);
    if (see && ai.seeT > A.react * 0.6) { speed *= 0.35; face = p; }
  } else {
    if (ai.st === "fetch" || ai.st === "chase") { ai.st = "move"; ai.spot = null; }
    const threatX = alive ? p.x : 0, threatZ = alive ? p.z : HOME.z;
    if (!ai.spot || (ai.st !== "move" && !shields(ai.spot, threatX, threatZ) && ai.st === "hold")) {
      const want = ai.role === "rusher" ? rand(10, 15) : rand(18, 26);
      ai.spot = nearestFreeSpots(e, threatX, threatZ, want);
      if (!ai.spot) ai.spot = { x: e.x * 0.8, z: ai.role === "guard" ? -20 : e.z + 4, o: null };
      ai.st = "move";
    }
    if (ai.st === "move") {
      tx = ai.spot.x; tz = ai.spot.z;
      if (see && ai.seeT > A.react && ai.role === "rusher" && Math.random() < dt * 0.6) { ai.st = "peek"; ai.timer = rand(0.6, 1.1); }
      if (Math.hypot(tx - e.x, tz - e.z) < 0.35) { ai.st = "hold"; ai.timer = rand(0.4, 1.3); }
    } else if (ai.st === "hold") {
      tx = ai.spot.x; tz = ai.spot.z; wantCrouch = true; face = alive ? p : null;
      ai.timer -= dt;
      if (ai.timer <= 0) { ai.st = "peek"; ai.timer = rand(A.peek[0], A.peek[1]); }
    } else if (ai.st === "peek") {
      tx = ai.spot.x; tz = ai.spot.z; face = alive ? p : null;
      // step out past the edge of the cover, on whichever side has a clear line to the player
      const o = ai.spot.o;
      if (o) {
        const ox = ai.spot.x - o.x, oz = ai.spot.z - o.z, l = Math.hypot(ox, oz) || 1, px = -oz / l, pz = ox / l;
        const off = (o.s === "box" ? Math.max(o.hx, o.hz) * 0.75 : o.r) + 0.45;
        if (!ai.peekSide) {
          ai.peekSide = e.num % 2 ? 1 : -1;
          if (alive) for (let k = 0; k < 2; k++) {
            const sd = k ? -ai.peekSide : ai.peekSide;
            if (clearLine(ai.spot.x + px * off * sd, 1.36, ai.spot.z + pz * off * sd, p.x, 1.25, p.z)) { ai.peekSide = sd; break; }
          }
        }
        tx += px * off * ai.peekSide; tz += pz * off * ai.peekSide;
      }
      ai.timer -= dt;
      if (ai.timer <= 0) {
        ai.cycles++;
        if (ai.cycles >= (ai.role === "rusher" ? 2 : 4) || (alive && !shields(ai.spot, p.x, p.z))) {
          ai.cycles = 0;
          const want = ai.role === "rusher" ? rand(8, 13) : rand(18, 26);
          const nxt = nearestFreeSpots(e, alive ? p.x : 0, alive ? p.z : HOME.z, want);
          if (nxt) ai.spot = nxt;
          ai.st = "move";
        } else { ai.st = "hold"; ai.timer = rand(0.5, 1.5); }
        ai.peekSide = 0;
      }
    }
  }
  // move
  const arrived = steer(e, tx, tz, wantCrouch ? DUCK_RUN : speed, dt);
  pushOut(e, PR);
  // stuck on something: sidestep for a moment
  if (!arrived && e.speed > 0.5) {
    ai.stuckT += dt;
    if (ai.stuckT > 0.5) {
      if (Math.hypot(e.x - ai.sx, e.z - ai.sz) < 0.6) { ai.side = Math.random() < 0.5 ? -1 : 1; ai.sideT = 0.7; }
      ai.stuckT = 0; ai.sx = e.x; ai.sz = e.z;
    }
  }
  e.duck = wantCrouch;
  e.crouch += ((wantCrouch ? 1 : 0) - e.crouch) * Math.min(1, dt * 7);
  // face the player when shooting, the way they are going otherwise
  let goalH = e.h;
  if (face) goalH = Math.atan2(face.x - e.x, face.z - e.z);
  else if (e.speed > 0.4) goalH = Math.atan2(e.mvx, e.mvz);
  e.h += angDiff(e.h, goalH) * Math.min(1, dt * 7);
  // shoot
  const canShoot = alive && see && ai.seeT > A.react && dist < 32 && e.crouch < 0.4 && Math.abs(angDiff(e.h, Math.atan2(p.x - e.x, p.z - e.z))) < 0.35;
  ai.next -= dt;
  if (canShoot && ai.next <= 0) {
    bodyParts(p, PARTS);
    let q = see === 2 ? 1 : 0;                                 // chest if it shows, head if that's all there is
    muzzle(e, TMP);
    if (!clearLine(TMP[0], TMP[1], TMP[2], PARTS[q * 4], PARTS[q * 4 + 1], PARTS[q * 4 + 2])) {
      q = q ? 0 : 1;
      if (!clearLine(TMP[0], TMP[1], TMP[2], PARTS[q * 4], PARTS[q * 4 + 1], PARTS[q * 4 + 2])) { ai.next = 0.15; q = -1; }
    }
    if (q >= 0) {
    if (ai.burst <= 0) ai.burst = Math.round(rand(A.burst[0], A.burst[1]));
    let tx2 = PARTS[q * 4], ty2 = PARTS[q * 4 + 1] - 0.05, tz2 = PARTS[q * 4 + 2];
    const t = dist / BALL_V;
    tx2 += p.mvx * p.speed * t * A.lead; tz2 += p.mvz * p.speed * t * A.lead;
    const err = A.aim * (1 + 0.7 * p.speed / RUN) * (1 + Math.max(0, dist - 15) / 40);
    fire(e, tx2, ty2, tz2, err);
    ai.burst--;
    ai.next = ai.burst > 0 ? A.gap * rand(0.8, 1.2) : rand(0.7, 1.3);
    }
  }
}

/* ---------------- Aim ---------------- */
// Where a shot fired now would go: whatever is under the crosshair, with a little help onto people near it.
const AIMO = {};
function computeAim() {
  const p = S.p, c = camIdeal(p, AIMO);
  let dx = c.tx - c.px, dy = c.ty - c.py, dz = c.tz - c.pz;
  const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
  const yaw = Math.atan2(dx, dz);
  const tol = (IN.touchUI ? 6.5 : 2.6) * DEG;
  let best = null, bs = 1e9, bq = 1;
  muzzle(p, TMP);
  for (let i = 0; i < S.foes.length; i++) {
    const e = S.foes[i];
    if (e.out || e.gone) continue;
    const ex = e.x - c.px, ez = e.z - c.pz, d = Math.hypot(ex, ez);
    if (d > 55 || d < 1) continue;
    const da = Math.abs(angDiff(yaw, Math.atan2(ex, ez)));
    if (da > tol + 0.5 / d) continue;
    bodyParts(e, PARTS);
    let q = 1;
    if (!clearLine(TMP[0], TMP[1], TMP[2], PARTS[4], PARTS[5], PARTS[6])) { q = 0; if (!clearLine(TMP[0], TMP[1], TMP[2], PARTS[0], PARTS[1], PARTS[2])) continue; }
    const sc = da * d + d * 0.01;
    if (sc < bs) { bs = sc; best = e; bq = q; }
  }
  const a = S.aim || (S.aim = { x: 0, y: 0, z: 0, lock: null, d: 0 });
  if (best) {
    bodyParts(best, PARTS);
    a.x = PARTS[bq * 4]; a.y = PARTS[bq * 4 + 1]; a.z = PARTS[bq * 4 + 2]; a.lock = best;
  } else {
    a.lock = null;
    let t = 1.5, hit = false;
    for (; t < 60; t += 0.35) {
      const x = c.px + dx * t, y = c.py + dy * t, z = c.pz + dz * t;
      if (y < 0 || solidAt(x, y, z, 0)) { hit = true; break; }
      if (Math.abs(x) > FX + 1 || Math.abs(z) > FZ + 1) { hit = true; break; }
    }
    a.x = c.px + dx * t; a.y = Math.max(0.05, c.py + dy * t); a.z = c.pz + dz * t;
  }
  a.d = Math.hypot(a.x - p.x, a.z - p.z);
  return a;
}

/* ---------------- Update ---------------- */
function update(dt) {
  S.t += dt; S.pt += dt;
  const p = S.p, A = ARENAS[S.arena];
  if (S.phase === "intro") {
    if (!S.introShown) { S.introShown = true; Shell.flash("ARENA " + (S.arena + 1) + ": " + A.name, A.sub, "#3ff0ff", 2200); ledPlay([ledMsg("slide", "ARENA " + (S.arena + 1), 1.4, { color: "cyan" }), ledMsg("cycle", A.name, 2.6)]); }
    if (S.pt > 2.6) { S.phase = "play"; S.pt = 0; Shell.flash("GO!", "", "#9bff3f", 700); Juke.sfx("whistle", 0); }
    animIdle(dt);
    return;
  }
  if (S.phase === "capture") {
    p.cheer = 1; p.speed *= 0.9; p.crouch = Math.max(0, p.crouch - dt * 4);
    S.foes.forEach(function (e) { if (!e.out) { e.speed *= 0.9; e.crouch = Math.max(0, e.crouch - dt * 3); e.h += angDiff(e.h, Math.atan2(p.x - e.x, p.z - e.z)) * Math.min(1, dt * 3); } });
    stepBalls(dt); stepView(dt);
    if (S.pt > 3.2) {
      if (S.arena >= ARENAS.length - 1) { S.champion = true; finish("FIELD CHAMPION!"); }
      else { p.cheer = 0; setupArena(S.arena + 1, false); }
    }
    return;
  }
  if (S.phase === "timeup") {
    stepBalls(dt); stepView(dt);
    S.foes.forEach(function (e) { e.speed *= 0.9; });
    if (S.pt > 2.0) finish("FINAL WHISTLE");
    return;
  }
  // the clock runs while you play and while you sit out
  S.time -= dt; S.arenaT += dt;
  if (!S.warned && S.time <= 30) { S.warned = true; Shell.flash("30 SECONDS!", "Get that flag home.", "#ff9214", 1200); Juke.sfx("warn", 0); ledPlay([ledMsg("blink", "30 SECONDS", 2, { color: "orange" })], true); }
  if (S.time <= 0) {
    S.time = 0; S.phase = "timeup"; S.pt = 0;
    Shell.flash("TIME!", S.flag.st === "carried" ? "So close. The flag never made it home." : "The orange squad held on.", "#ff4b3e", 1800);
    Juke.sfx("whistle", 1);
    return;
  }
  if (S.phase === "out") {
    p.outT += dt; p.speed *= 0.85; p.crouch = Math.max(0, p.crouch - dt * 4);
    if (p.outT > OUT_T) respawnPlayer();
  } else playerControl(dt);
  for (let i = 0; i < S.foes.length; i++) updateFoe(S.foes[i], dt);
  // nobody stands inside anybody
  const all = [p].concat(S.foes);
  for (let i = 0; i < all.length; i++) for (let k = i + 1; k < all.length; k++) {
    const a = all[i], b = all[k];
    if (a.gone || b.gone) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d < PR * 2 && d > 1e-4) { const push = (PR * 2 - d) / 2 / d; a.x -= dx * push; a.z -= dz * push; b.x += dx * push; b.z += dz * push; }
  }
  stepBalls(dt);
  updateFlag(dt);
  // paint pods left behind
  for (let i = S.pods.length - 1; i >= 0; i--) {
    const q = S.pods[i]; q.t += dt;
    if (!p.out && Math.hypot(p.x - q.x, p.z - q.z) < 1.1 && S.packs < POD_MAX) {
      S.packs++; S.pods.splice(i, 1); Juke.sfx("pickup", 0);
      V.floats.push({ txt: "+1 POD", x: p.x, y: 2.1, z: p.z, t: 0, col: "#9bff3f" });
    } else if (q.t > 20) S.pods.splice(i, 1);
  }
  // the flag home: capture
  if (S.flag.st === "carried" && Math.hypot(p.x - HOME.x, p.z - HOME.z) < CAP_R) capture();
  stepView(dt);
}

function playerControl(dt) {
  const p = S.p;
  p.safe = Math.max(0, p.safe - dt); p.recoil = Math.max(0, p.recoil - dt * 6); p.fireT = Math.max(0, p.fireT - dt); p.hitT = Math.max(0, p.hitT - dt);
  // turning: arrow keys here; mouse and touch turn the player as they move (see the input section)
  const turn = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
  if (turn) p.h += turn * TURN_KEYS * dt;
  // moving, relative to where you face
  let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  let s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  if (IN.stick && IN.stick.mag > 0.12) { f = -IN.stick.dy; s = IN.stick.dx; }
  let m = Math.hypot(f, s);
  if (m > 1) { f /= m; s /= m; m = 1; }
  const firing = keys.Space || IN.mouseFire || !!IN.fireP;
  const duckHeld = keys.ShiftLeft || keys.ShiftRight || keys.KeyC || keys.ControlLeft || keys.Mouse2 || IN.duckToggle;
  // firing pops you up out of a crouch, and you stay up a moment after
  if (firing) p.popT = 0.3; else p.popT = Math.max(0, (p.popT || 0) - dt);
  p.duck = duckHeld && p.popT <= 0;
  p.crouch += ((p.duck ? 1 : 0) - p.crouch) * Math.min(1, dt * 9);
  const fx = Math.sin(p.h), fz = Math.cos(p.h), rx = -Math.cos(p.h), rz = Math.sin(p.h);
  const sp = (p.duck ? DUCK_RUN : RUN) * (S.flag.st === "carried" ? 0.93 : 1) * m;
  const mx = fx * f + rx * s, mz = fz * f + rz * s, ml = Math.hypot(mx, mz) || 1;
  p.x += mx / ml * sp * dt; p.z += mz / ml * sp * dt;
  p.mvx = m > 0.01 ? mx / ml : 0; p.mvz = m > 0.01 ? mz / ml : 0;
  p.speed += (sp - p.speed) * Math.min(1, dt * 12);
  p.moveF = f; p.moveS = s;
  pushOut(p, PR);
  // healing: a hit wears off after a while, and the home station fixes everything
  S.healT = (S.healT || 0) + dt;
  if (p.hits > 0 && S.healT > HEAL_T) { p.hits--; S.healT = 0; }
  if (Math.hypot(p.x - HOME.x, p.z - (HOME.z + 0.2)) < STATION_R) {
    S.stationT = (S.stationT || 0) + dt;
    if (S.stationT > 0.8 && !p.fireT) {
      if (S.reload <= 0) S.hopper = HOPPER;                 // topping off the hopper is quiet
      if (p.hits > 0 || S.packs < POD_START) {
        p.hits = 0; S.packs = Math.max(S.packs, POD_START);
        Juke.sfx("pickup", 0);
        V.floats.push({ txt: "PAINT UP!", x: p.x, y: 2.1, z: p.z, t: 0, col: "#3ff0ff" });
      }
      S.stationT = 0;
    }
  } else S.stationT = 0;
  // reload
  if (S.reload > 0) {
    S.reload -= dt;
    if (S.reload <= 0) { S.reload = 0; S.hopper = HOPPER; Juke.sfx("reload", 1); }
  }
  const wantReload = keys.KeyQ || keys.KeyF || IN.reloadTap || (S.hopper === 0 && firing);
  IN.reloadTap = false;
  if (wantReload && S.reload <= 0 && S.hopper < HOPPER) {
    if (S.packs > 0) { S.packs--; S.reload = RELOAD_T; Juke.sfx("reload", 0); }
    else if (!S.emptyMsgT || S.t - S.emptyMsgT > 2.5) { S.emptyMsgT = S.t; Shell.flash("OUT OF PAINT", "Grab a pod or head back to the station at your base.", "#ff9214", 1400); Juke.sfx("empty", 0); }
  }
  // aim assist for thumbs: a gentle pull onto someone near the crosshair while firing
  const a = computeAim();
  if (IN.touchUI && firing && a.lock) {
    const want = Math.atan2(a.lock.x - p.x, a.lock.z - p.z);
    p.h += angDiff(p.h, want) * Math.min(1, dt * 2.2);
  }
  // fire
  p.shotT = (p.shotT || 0) - dt;
  if (firing && p.shotT <= 0 && S.reload <= 0 && p.crouch < 0.4) {
    if (S.hopper > 0) {
      S.hopper--; p.shotT = FIRE_GAP;
      fire(p, a.x, a.y, a.z, IN.touchUI ? 0.012 : 0.009);
    } else if (S.packs <= 0 && p.shotT <= 0) { p.shotT = 0.4; Juke.sfx("empty", 0); }
  }
}

// people idling before the whistle
function animIdle(dt) {
  S.foes.forEach(function (e) { e.speed *= 0.9; e.h += angDiff(e.h, 0) * Math.min(1, dt * 3); });
  S.p.speed *= 0.9;
  stepView(dt);
}

function stepView(dt) {
  for (let i = V.drops.length - 1; i >= 0; i--) {
    const d = V.drops[i]; d.life -= dt; d.vy -= 9 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    if (d.life <= 0 || d.y < 0) V.drops.splice(i, 1);
  }
  for (let i = V.lens.length - 1; i >= 0; i--) { V.lens[i].t += dt; if (V.lens[i].t > 3.2) V.lens.splice(i, 1); }
  for (let i = V.floats.length - 1; i >= 0; i--) { V.floats[i].t += dt; if (V.floats[i].t > 1.4) V.floats.splice(i, 1); }
  for (let i = V.hitDir.length - 1; i >= 0; i--) { V.hitDir[i].t += dt; if (V.hitDir[i].t > 0.9) V.hitDir.splice(i, 1); }
}

function finish(title) {
  if (S.ending || Shell.state() !== "playing") return;
  S.ending = true;
  ledFinal(S.score);
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
  const acc = S.shots ? Math.round(S.hits / S.shots * 100) : 0;
  if (window.Trophies && S.shots >= 40 && acc >= 35) Trophies.unlock("pbz-sharpshooter");
  Shell.gameOver(S.score, { title: title, html:
    row("Arenas cleared", S.cleared + " of " + ARENAS.length) +
    row("Flags captured", S.captures) +
    row("Tags", S.tags + "  (best streak " + S.bestStreak + ")") +
    row("Accuracy", S.hits + " of " + S.shots + " (" + acc + "%)") +
    row("Times tagged out", S.outs),
    stats: { score: S.score, tags: S.tags, shots: S.shots, hits: S.hits, captures: S.captures, cleared: S.cleared, outs: S.outs,
             bestStreak: S.bestStreak, accuracy: acc, champion: S.champion } });
}
function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

/* ---------------- Input ----------------
   The shell hands over one pointer at a time, and a thumbstick plus a fire button needs two, so the
   touch and mouse controls listen on the shell's canvas themselves. Keys still come through the shell. */
const TOUCH = { fire: { x: W - 66, y: H - 96, r: 42 }, duck: { x: W - 154, y: H - 54, r: 27 }, reload: { x: W - 36, y: H - 184, r: 23 }, stickR: 46 };
const touches = {};
function hudXY(e) {
  const r = R.hud.getBoundingClientRect();
  return { x: (e.clientX - r.left) / (r.width / W), y: (e.clientY - r.top) / (r.height / H) };
}
function inBtn(b, x, y, pad) { return Math.hypot(x - b.x, y - b.y) < b.r + (pad || 8); }
function canLock() { return !!(R && R.hud && R.hud.requestPointerLock) && !IN.touchUI; }
function turnBy(dx, dy, k) {
  if (!S.p || S.p.out) return;
  S.p.h -= dx * k;
  S.p.pitch = clamp(S.p.pitch - dy * k * 0.55, -0.2, 0.28);
}
function onDown(e) {
  if (!R || Shell.state() !== "playing") return;
  const q = hudXY(e);
  if (e.pointerType === "mouse") {
    IN.touchUI = false;
    if (e.button === 2) { keys.Mouse2 = true; return; }
    if (e.button !== 0) return;
    if (!IN.locked && canLock()) {
      try { const pr = R.hud.requestPointerLock(); if (pr && pr.catch) pr.catch(function () {}); } catch (er) { /* no lock: drag to turn instead */ }
    }
    IN.mouseFire = true;
    IN.mouseDrag = IN.locked ? null : { x: q.x, y: q.y };
    return;
  }
  e.preventDefault();
  IN.touchUI = true;
  try { R.hud.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
  let role;
  if (inBtn(TOUCH.fire, q.x, q.y, 16)) { role = { k: "fire", x: q.x, y: q.y }; IN.fireP = role; }
  else if (inBtn(TOUCH.duck, q.x, q.y)) { role = { k: "btn" }; IN.duckToggle = !IN.duckToggle; Juke.sfx("click", 0); }
  else if (inBtn(TOUCH.reload, q.x, q.y)) { role = { k: "btn" }; IN.reloadTap = true; }
  else if (q.x < W * 0.5 && q.y > H * 0.38 && !IN.stick) { role = { k: "stick", ox: q.x, oy: q.y, x: q.x, y: q.y, dx: 0, dy: 0, mag: 0 }; IN.stick = role; }
  else role = { k: "look", x: q.x, y: q.y };
  touches[e.pointerId] = role;
}
function onMove(e) {
  if (!R || Shell.state() !== "playing") return;
  if (e.pointerType === "mouse") {
    if (IN.locked) { turnBy(e.movementX || 0, e.movementY || 0, 0.0027); IN.touchUI = false; }
    else if (IN.mouseDrag) { const q = hudXY(e); turnBy(q.x - IN.mouseDrag.x, q.y - IN.mouseDrag.y, 0.0095); IN.mouseDrag.x = q.x; IN.mouseDrag.y = q.y; }
    return;
  }
  const role = touches[e.pointerId];
  if (!role) return;
  e.preventDefault();
  const q = hudXY(e);
  if (role.k === "stick") {
    let dx = q.x - role.ox, dy = q.y - role.oy;
    const d = Math.hypot(dx, dy), R0 = TOUCH.stickR;
    if (d > R0 * 1.6) { role.ox = q.x - dx / d * R0 * 1.6; role.oy = q.y - dy / d * R0 * 1.6; dx = q.x - role.ox; dy = q.y - role.oy; }   // the stick follows a thumb that wanders off
    role.x = q.x; role.y = q.y;
    const m = Math.min(1, Math.hypot(dx, dy) / R0);
    const l = Math.hypot(dx, dy) || 1;
    role.dx = dx / l * m; role.dy = dy / l * m; role.mag = m;
  } else if (role.k === "look" || role.k === "fire") {
    turnBy(q.x - role.x, q.y - role.y, 0.0105);
    role.x = q.x; role.y = q.y;
  }
}
function onUp(e) {
  if (e.pointerType === "mouse") {
    if (e.button === 2) keys.Mouse2 = false;
    else { IN.mouseFire = false; IN.mouseDrag = null; }
    return;
  }
  const role = touches[e.pointerId];
  if (!role) return;
  if (role === IN.stick) IN.stick = null;
  if (role === IN.fireP) IN.fireP = null;
  delete touches[e.pointerId];
}
function releaseInput() {
  keys = {};
  IN.stick = null; IN.fireP = null; IN.mouseFire = false; IN.mouseDrag = null;
  for (const k in touches) delete touches[k];
}
function key(type, code, e) {
  if (type === "down") {
    keys[code] = true;
    IN.touchUI = false;
    if ((code === "KeyQ" || code === "KeyF") && !e.repeat) IN.reloadTap = true;
  } else keys[code] = false;
}
function bindInput() {
  const c = R.hud;
  c.style.touchAction = "none";
  c.addEventListener("pointerdown", onDown);
  c.addEventListener("pointermove", onMove);
  c.addEventListener("pointerup", onUp);
  c.addEventListener("pointercancel", onUp);
  c.addEventListener("lostpointercapture", function (e) { if (e.pointerType !== "mouse") onUp(e); });
  window.addEventListener("blur", releaseInput);
  document.addEventListener("pointerlockchange", function () {
    const was = IN.locked;
    IN.locked = document.pointerLockElement === c;
    if (was && !IN.locked && Shell.state() === "playing") Shell.pause();   // Esc out of mouse aim: pause, like any shooter
  });
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) IN.touchUI = true;
}

/* ---------------- Sound: the field band and the effects ----------------
   Everything is made in code with the Web Audio API, no audio files. Nothing is created until the first
   tap, click or key press. The music lives in startMusic below: give it an audio context and a node to
   play into, and it plays an original looping synth track until the stop function it returns is called.
   It knows nothing about the game. The effects follow the shell's mute button ("npArcade.muted"), and the
   music has its own on / off switch that is remembered too ("npArcade.music", shared across the arcade). */
const MUSIC_VOL = 0.16, SFX_VOL = 0.24;
const MUSIC_KEY = "npArcade.music";

function startMusic(ctx, dest) {
  const BPM = 138, STEP = 60 / BPM / 4, BARS = 16, STEPS = BARS * 16, AHEAD = 0.35;
  const out = ctx.createGain(); out.gain.value = 0; out.connect(dest);
  out.gain.setTargetAtTime(1, ctx.currentTime + 0.02, 0.05);
  function filt(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const leadBus = filt("lowpass", 3600, 0.6, out), bassBus = filt("lowpass", 700, 1.4, out), padBus = filt("lowpass", 1800, 0.9, out);
  const echo = ctx.createDelay(1), fb = ctx.createGain(), send = ctx.createGain(), wet = filt("lowpass", 2200, 0.7, out);
  echo.delayTime.value = STEP * 3; fb.gain.value = 0.3; send.gain.value = 0.26;
  leadBus.connect(send); send.connect(echo); echo.connect(fb); fb.connect(echo); echo.connect(wet);
  const nlen = Math.floor(ctx.sampleRate * 1.5), noiseBuf = ctx.createBuffer(1, nlen, ctx.sampleRate), nd = noiseBuf.getChannelData(0);
  let seed = 0x1234567;
  for (let i = 0; i < nlen; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; nd[i] = ((seed >>> 0) / 4294967296) * 2 - 1; }
  const mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  // Chords, one a bar: bass note, then three for the stabs and the arpeggio (MIDI numbers).
  const CH = { Am: [45, 57, 60, 64], F: [41, 57, 60, 65], C: [48, 55, 60, 64], G: [43, 55, 59, 62], Dm: [38, 57, 62, 65], E: [40, 56, 59, 64] };
  const PROG = "Am F C G Am F Dm E F G Am Am F G E E".split(" ");
  // The tune, a bar a line: step in the bar, note, length in steps.
  const TUNE = [
    "0A4-2 2C5-2 4E5-3 7D5-1 8C5-2 10B4-2 12A4-4", "0F4-2 2A4-2 4C5-3 7B4-1 8A4-2 10G4-2 12A4-4",
    "0E5-2 2G5-2 4E5-2 6C5-2 8D5-3 11E5-1 12G5-4", "0D5-2 2B4-2 4G4-2 6B4-2 8D5-4 12E5-2 14D5-2",
    "0A5-3 3G5-1 4E5-2 6C5-2 8E5-2 10A5-2 12B5-2 14C6-2", "0A5-3 3G5-1 4F5-2 6C5-2 8F5-2 10A5-2 12C6-4",
    "0D6-2 2C6-2 4A5-2 6F5-2 8D5-2 10F5-2 12A5-2 14D6-2", "0E6-4 4D6-2 6C6-2 8B5-4 12G#5-4",
    "0C6-1 1C6-1 2C6-2 4A5-2 6C6-2 8D6-3 11C6-1 12A5-4", "0B5-1 1B5-1 2B5-2 4G5-2 6B5-2 8D6-3 11B5-1 12G5-4",
    "0A5-2 2B5-2 4C6-2 6E6-2 8D6-2 10C6-2 12B5-2 14C6-2", "0A5-6 6E5-2 8A5-2 10C6-2 12E6-4",
    "0C6-1 1C6-1 2C6-2 4A5-2 6C6-2 8D6-3 11C6-1 12A5-4", "0B5-1 1B5-1 2B5-2 4G5-2 6B5-2 8D6-3 11B5-1 12G5-4",
    "0G#5-2 2B5-2 4E6-2 6D6-2 8C6-2 10B5-2 12G#5-2 14B5-2", "0E6-8 8B5-2 10G#5-2 12E5-4"
  ];
  const LEAD = new Array(STEPS).fill(null), SEM = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  TUNE.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(#?)(\d)-(\d+)$/.exec(tok);
      if (m) LEAD[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + SEM[m[2]] + (m[3] ? 1 : 0), Number(m[5])];
    });
  });
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
    s.buffer = noiseBuf; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 1.2); s.stop(t + dur + 0.05);
  }
  function play(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[bar]], B = bar >= 8, n = LEAD[i];
    if (n) { note(leadBus, "square", mtof(n[0]), t, n[1] * STEP * 0.95, 0.16, 0, 0.7); note(leadBus, "sawtooth", mtof(n[0]), t, n[1] * STEP * 0.95, 0.05, 0, 0.7, 8); }
    if (!(s & 1)) note(bassBus, "sawtooth", mtof(ch[0] + (s % 4 === 2 ? 12 : 0)), t, STEP * 1.8, 0.3, 0, 0.5);        // driving eighths
    note(out, "triangle", mtof(ch[1 + [0, 1, 2, 1][s & 3]] + 12), t, STEP * 0.9, 0.05, 0, 0.4);                         // sixteenth arpeggio
    if (s === 2 || s === 6 || s === 10 || s === 14) for (let k = 1; k < 4; k++) note(padBus, "sawtooth", mtof(ch[k]), t, STEP * 1.6, 0.045, 0, 0.3, k * 5);   // off-beat stabs
    if (B ? s % 4 === 0 : (s === 0 || s === 8 || s === 11)) note(out, "sine", 140, t, 0.17, 0.75, 40, 0.06);              // kick
    if (s === 4 || s === 12 || (bar % 4 === 3 && s >= 13)) { hiss(t, 0.14, 0.3, "bandpass", 1800, 0.6); note(out, "triangle", 210, t, 0.07, 0.18, 120, 0.1); }   // snare
    hiss(t, s % 4 === 2 ? 0.08 : 0.03, s % 4 === 2 ? 0.09 : 0.05, "highpass", 7500, 0.7);                                // hats
  }
  let step = 0, nextT = ctx.currentTime + 0.08, live = true;
  function pump() {
    if (!live) return;
    const now = ctx.currentTime;
    if (nextT < now) nextT = now + 0.02;
    while (nextT < now + AHEAD) { play(step, nextT); step = (step + 1) % STEPS; nextT += STEP; }
  }
  pump();
  const timer = setInterval(pump, 50);
  return function stop() {
    if (!live) return;
    live = false; clearInterval(timer);
    const now = ctx.currentTime;
    out.gain.cancelScheduledValues(now); out.gain.setTargetAtTime(0, now, 0.05);
    setTimeout(function () { try { out.disconnect(); } catch (e) { /* gone */ } }, 600);
  };
}

const Juke = (function () {
  let A = null, dead = false, muted = false, stopMusic = null;
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
      if (!A) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        const c = new AC();
        A = { c: c, out: c.createGain(), music: c.createGain(), sfx: c.createGain() };
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
        A.out.connect(comp); comp.connect(c.destination);
        A.music.gain.value = MUSIC_VOL; A.music.connect(A.out);
        A.sfx.gain.value = SFX_VOL; A.sfx.connect(A.out);
        const len = Math.floor(c.sampleRate);
        A.noise = c.createBuffer(1, len, c.sampleRate);
        const d = A.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        muted = shellMuted();
        A.out.gain.value = muted ? 0 : 1;
      }
      if (A.c.state !== "running") { const p = A.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { A = null; dead = true; }
  }
  // Every frame: follow the mute button, and run the band while a game is on.
  function pump() {
    if (!A || !window.Shell) return;
    const now = A.c.currentTime, m = shellMuted();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, now, 0.02); }
    const want = musicOn && !muted && A.c.state === "running" && Shell.state() === "playing";
    if (want && !stopMusic) stopMusic = startMusic(A.c, A.music);
    else if (!want && stopMusic) { stopMusic(); stopMusic = null; }
  }
  function osc(type, f0, t, dur, vol, f1, hold) {
    const o = A.c.createOscillator(), g = A.c.createGain(), h = t + Math.max(0.006, dur * (hold == null ? 0.5 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.sfx); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(t, dur, vol, type, f0, q, f1, atk) {
    const s = A.c.createBufferSource(), f = A.c.createBiquadFilter(), g = A.c.createGain();
    s.buffer = A.noise; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.003)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(A.sfx); s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.05);
  }
  // x: a detail of the moment, mostly how far away it happened (0 = right here, 1 = far off)
  function cue(name, t, x) {
    const far = 1 - 0.75 * (x || 0);
    if (name === "pop") {                                    // a marker going off: a puff of air and a thump
      hiss(t, 0.06, 0.55 * far, "highpass", 2200, 0.8); hiss(t, 0.09, 0.4 * far, "bandpass", 700, 1.2, 300); osc("sine", 180, t, 0.06, 0.45 * far, 70, 0.1);
    } else if (name === "splat") {                           // paint landing: wet and short
      hiss(t, 0.12, 0.42 * (1 - 0.8 * x), "lowpass", 1600, 1.4, 260); osc("sine", 320, t, 0.05, 0.12 * (1 - x), 110, 0.2);
    } else if (name === "tag") {                             // you tagged one: two bright blips and a sparkle
      osc("square", 988, t, 0.07, 0.22, 0, 0.5); osc("square", 1319, t + 0.07, 0.12, 0.22, 0, 0.5); osc("triangle", 2637, t + 0.12, 0.25, 0.12, 0, 0.1);
    } else if (name === "ouch") {                            // you got hit: a thud on the mask
      osc("sine", 120, t, 0.16, 0.8, 50, 0.08); hiss(t, 0.16, 0.5, "lowpass", 900, 1, 200);
    } else if (name === "out") {                             // you're out: a slide down and a buzz
      osc("sawtooth", 440, t, 0.55, 0.22, 110, 0.6); osc("square", 220, t + 0.1, 0.5, 0.12, 82, 0.6);
    } else if (name === "grab") {                            // flag grabbed: a quick run up
      [72, 76, 79, 84, 88].forEach(function (m, i) { osc("square", 440 * Math.pow(2, (m - 69) / 12), t + i * 0.055, 0.1, 0.2, 0, 0.5); });
    } else if (name === "capture") {                         // capture: a fanfare with a held chord on top
      const up = [67, 72, 76, 79, 84, 88, 91];
      up.forEach(function (m, i) { osc("square", 440 * Math.pow(2, (m - 69) / 12), t + i * 0.07, 0.12, 0.22, 0, 0.5); });
      [84, 88, 91, 96].forEach(function (m) { osc("triangle", 440 * Math.pow(2, (m - 69) / 12), t + 0.5, 0.9, 0.16, 0, 0.4); });
      hiss(t + 0.45, 1.8, 0.5, "bandpass", 1100, 0.45, 1500, 0.25);
    } else if (name === "drop") {                            // the flag hits the dirt
      osc("triangle", 330, t, 0.25, 0.3, 140, 0.3); osc("triangle", 247, t + 0.12, 0.3, 0.25, 110, 0.3);
    } else if (name === "reload") {                          // a pod into the hopper: two clacks, or the ready click
      if (x) { osc("square", 1600, t, 0.03, 0.14, 0, 0.4); osc("square", 2200, t + 0.05, 0.03, 0.12, 0, 0.4); }
      else { hiss(t, 0.05, 0.4, "bandpass", 2600, 2); hiss(t + 0.12, 0.05, 0.35, "bandpass", 1900, 2); hiss(t + 0.2, 0.3, 0.18, "bandpass", 900, 1.2); }
    } else if (name === "empty") {                           // dry fire
      osc("square", 1200, t, 0.02, 0.12, 0, 0.4); osc("square", 900, t + 0.06, 0.02, 0.1, 0, 0.4);
    } else if (name === "pickup") {
      osc("triangle", 784, t, 0.08, 0.22, 0, 0.4); osc("triangle", 1175, t + 0.07, 0.14, 0.22, 0, 0.4);
    } else if (name === "whistle") {                         // the ref's whistle: start of play, or the end of it
      const len = x ? 0.9 : 0.5;
      for (let k = 0; k < (x ? 1 : 2); k++) {
        const o = A.c.createOscillator(), lfo = A.c.createOscillator(), lg = A.c.createGain(), g = A.c.createGain(), t0 = t + k * 0.32;
        o.type = "sine"; o.frequency.value = 2900; lfo.frequency.value = 38; lg.gain.value = 160;
        lfo.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.2, t0 + 0.02); g.gain.setValueAtTime(0.2, t0 + len * (k ? 0.6 : 0.4)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len * (k ? 1 : 0.5));
        o.connect(g); g.connect(A.sfx); o.start(t0); lfo.start(t0); o.stop(t0 + len + 0.05); lfo.stop(t0 + len + 0.05);
      }
    } else if (name === "warn") {
      for (let i = 0; i < 3; i++) osc("square", 1046, t + i * 0.18, 0.1, 0.18, 0, 0.6);
    } else if (name === "click") {
      osc("square", 1500, t, 0.02, 0.1, 0, 0.4);
    }
  }
  function sfx(name, x, delay) {
    if (!A || muted || A.c.state !== "running") return;
    try { cue(name, A.c.currentTime + 0.005 + (delay || 0), x || 0); } catch (e) { /* sound is never worth a crash */ }
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
    newGame: function () { unlock(); if (stopMusic) { stopMusic(); stopMusic = null; } pump(); },
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    musicOn: function () { return musicOn; },
    peek: function () { return { made: !!A, state: A ? A.c.state : "none", playing: !!stopMusic, muted: muted, musicOn: musicOn }; }
  };
})();

/* ---------------- LED ribbon board: the strip across the scoreboard at each end of the field ----------------
   The board is a real dot matrix. Everything on it is painted into a small canvas, one pixel per LED, and a small
   shader turns each pixel into a glowing dot. Both scoreboards show the same board. It scrolls its programme right
   to left, and cuts to big animated messages when something happens out on the field (ledPlay). */
const LED_ROWS = 26, LED_COLS = 250;
const LED_SPEED = 44;                                      // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));   // the largest text size that fits (5 x 7 font, in LEDs per font pixel)
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
// Short messages between the plugs. The wordmark leads each group.
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["BE KIND, REWIND", "pink"], ["NO QUARTERS REQUIRED", "cyan"]];
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
  const start = ((-(LED_COLS - strip.markW) / 2) % sw + sw) % sw;   // open with the wordmark in the middle of the board
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
    // a quick one cuts in, but a running score that has not had its turn yet still gets it afterwards
    const old = (L.msg && L.msg.keep ? [L.msg] : []).concat(L.queue.filter(function (m) { return m.keep; }));
    if (old.length) { old[0].t = 0; list = list.concat(old.slice(-1)); }
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
  ledPlay([ledMsg("count", "FINAL", 7, { from: 0, value: score, final: true, wait: 0.4 })]);
}

function ledDrawMsg(g, m) {
  const WW = LED_COLS, HH = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(WW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.amber;
  function fit(str) { let sx = big + 1; if (ledTextW(str, sx) > WW - 60) sx = big; while (sx > 1 && ledTextW(str, sx) > WW - 16) sx--; return sx; }
  function chase(color, dir) {                              // running lights along the top and bottom edges
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < WW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(WW - x - 3, HH - 1, 3, 1); }
  }
  if (m.kind === "count") {                                 // counts up to the new number
    const k = calm ? 1 : Math.min(1, t / 0.7), v = Math.round(m.from + (m.value - m.from) * k);
    const label = m.text ? m.text + " " : "", sxc = Math.min(big, fit(label + m.value));
    const x = Math.round((WW - ledTextW(label + m.value, sxc)) / 2);
    const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
    const xn = ledText(g, label, x, yBig, sxc, big, LED_C.amber);
    ledText(g, String(v), xn, yBig, sxc, big, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
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
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 16; i++) g.fillRect((Math.random() * WW) | 0, (Math.random() * HH) | 0, 1, 1); }
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
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 10; i++) g.fillRect((Math.random() * WW) | 0, (Math.random() * HH) | 0, 1, 1); }
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
  if (L.msg) { ledDrawMsg(g, L.msg); return; }
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
function speckle(g, w, h, n, rnd, light, dark) {
  for (let i = 0; i < n; i++) { g.fillStyle = rnd() < 0.5 ? light : dark; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
}

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every decal out on the field uses this (the
// full logo with the mascot is kept for the splash, the title card and the score card). If the PNG is
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
// The wordmark in one flat color (stencils on wood, the mown logo).
function tintScript(script, col, alpha) {
  const c = mkCanvas(script.width, script.height), g = c.getContext("2d");
  g.drawImage(script, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = col; g.globalAlpha = alpha == null ? 1 : alpha; g.fillRect(0, 0, c.width, c.height);
  return c;
}

function candyText(g, str, x, y, size, maxW, palette) {
  const face = '"Arial Black", "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
  g.font = "900 " + size + "px " + face;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + face; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = size * 0.36; g.strokeStyle = "#08205f"; g.strokeText(str, x, y + size * 0.06);
  g.lineWidth = size * 0.17; g.strokeStyle = "#ffffff"; g.strokeText(str, x, y);
  const pal = palette || ["#fff06a", "#ffc21a", "#ff7a0f"];
  const gr = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  gr.addColorStop(0, pal[0]); gr.addColorStop(0.55, pal[1]); gr.addColorStop(1, pal[2]);
  g.fillStyle = gr; g.fillText(str, x, y);
  g.fillStyle = "rgba(255,255,255,.45)";
  g.save(); g.beginPath(); g.rect(x - 900, y - size * 0.5, 1800, size * 0.36); g.clip(); g.fillText(str, x, y); g.restore();
}

/* ---------------- The ground ---------------- */
// The whole playing field in one picture, 12.8 px a meter: mown bands, the boundary, the center line, the two bases.
function turfCanvas() {
  const PX = 12.8, w = Math.round((FX + 1.5) * 2 * PX), h = Math.round((FZ + 1.5) * 2 * PX);
  const c = mkCanvas(w, h), g = c.getContext("2d"), rnd = rng(5);
  const X = function (x) { return (x + FX + 1.5) * PX; }, Y = function (z) { return (z + FZ + 1.5) * PX; };
  g.fillStyle = "#33b04a"; g.fillRect(0, 0, w, h);
  for (let z = -FZ - 1.5, k = 0; z < FZ + 1.5; z += 4, k++) { g.fillStyle = k % 2 ? "#2ea445" : "#3abd52"; g.fillRect(0, Y(z), w, 4 * PX + 1); }
  speckle(g, w, h, 26000, rnd, "rgba(255,255,255,.05)", "rgba(0,60,15,.08)");
  g.strokeStyle = "rgba(255,255,255,.92)"; g.lineWidth = 0.16 * PX;
  g.strokeRect(X(-FX + 0.4), Y(-FZ + 0.4), (FX - 0.4) * 2 * PX, (FZ - 0.4) * 2 * PX);
  g.beginPath(); g.moveTo(X(-FX + 0.4), Y(0)); g.lineTo(X(FX - 0.4), Y(0)); g.stroke();
  g.setLineDash([0.8 * PX, 0.6 * PX]); g.lineWidth = 0.1 * PX; g.strokeStyle = "rgba(255,255,255,.6)";
  [-12, 12].forEach(function (z) { g.beginPath(); g.moveTo(X(-FX + 0.4), Y(z)); g.lineTo(X(FX - 0.4), Y(z)); g.stroke(); });
  g.setLineDash([]);
  return c;
}
function grassCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(3);
  g.fillStyle = "#2b8f3c"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 256, y = rnd() * 256, r = 10 + rnd() * 26, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rnd() < 0.5 ? "rgba(70,160,60,.35)" : "rgba(20,90,35,.35)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    for (let ox = -256; ox <= 256; ox += 256) for (let oy = -256; oy <= 256; oy += 256) { g.fillStyle = gr; g.save(); g.translate(ox, oy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
  }
  speckle(g, 256, 256, 6000, rnd, "rgba(255,255,255,.05)", "rgba(0,40,10,.08)");
  for (let i = 0; i < 40; i++) {                           // the odd dandelion
    g.fillStyle = rnd() < 0.7 ? "#ffe23a" : "#ffffff"; const x = rnd() * 256, y = rnd() * 256;
    g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill();
  }
  return c;
}
// A base pad: team colors in rings, the wordmark, and what it is.
function padCanvas(script, col, dark, label) {
  const c = mkCanvas(512, 512), g = c.getContext("2d");
  g.beginPath(); g.arc(256, 256, 250, 0, TAU); g.fillStyle = "#ffffff"; g.fill();
  g.beginPath(); g.arc(256, 256, 236, 0, TAU); g.fillStyle = col; g.fill();
  g.beginPath(); g.arc(256, 256, 190, 0, TAU); g.fillStyle = dark; g.fill();
  for (let i = 0; i < 24; i++) {                           // chevrons around the ring
    const a = i / 24 * TAU; g.save(); g.translate(256 + Math.cos(a) * 213, 256 + Math.sin(a) * 213); g.rotate(a + Math.PI / 2);
    g.fillStyle = "rgba(255,255,255,.75)"; g.beginPath(); g.moveTo(-8, 6); g.lineTo(0, -6); g.lineTo(8, 6); g.lineTo(4, 6); g.lineTo(0, 0); g.lineTo(-4, 6); g.closePath(); g.fill();
    g.restore();
  }
  drawScript(g, script, 256, 300, 300, 130);
  candyText(g, label, 256, 168, 40, 280);
  return c;
}

/* ---------------- Sky and the world around the field ---------------- */
const SKIES = {
  morning: { top: "#3c8ff0", mid: "#8cc8ff", low: "#e2f4ff", sun: [0.35, 0.55], sunCol: "rgba(255,248,220,", fog: 0xcfe6ff, hemi: [0xe6f3ff, 0x5f9a4a, 1.25], key: [0xfff1d6, 2.5], keyPos: [-60, 90, 50], clouds: 9, stars: 0, lamps: false, clear: 0x8cc8ff },
  noon:    { top: "#1d6fe6", mid: "#62b2ff", low: "#d6efff", sun: [0.55, 0.25], sunCol: "rgba(255,255,240,", fog: 0xc2e2ff, hemi: [0xf0f7ff, 0x6a9a4c, 1.35], key: [0xffffff, 2.8], keyPos: [30, 120, 40], clouds: 12, stars: 0, lamps: false, clear: 0x62b2ff },
  sunset:  { top: "#2b2a78", mid: "#e2506a", low: "#ffb35a", sun: [0.62, 0.84], sunCol: "rgba(255,190,110,", fog: 0xf0906c, hemi: [0xffc49a, 0x5a4a5a, 1.1], key: [0xffa060, 2.4], keyPos: [70, 30, -60], clouds: 7, stars: 20, lamps: false, clear: 0xe2506a },
  night:   { top: "#040820", mid: "#0c1a52", low: "#24408a", sun: [0.3, 0.3], sunCol: "rgba(220,230,255,", fog: 0x0a1440, hemi: [0x7f94d8, 0x1a2848, 0.72], key: [0xe6eeff, 2.0], keyPos: [-30, 80, 30], clouds: 0, stars: 220, lamps: true, clear: 0x0c1a52, moon: true }
};
function skyCanvas(k) {
  const P = SKIES[k], c = mkCanvas(1024, 512), g = c.getContext("2d"), rnd = rng(k.length * 13);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, P.top); gr.addColorStop(0.62, P.mid); gr.addColorStop(1, P.low);
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = P.low; g.fillRect(0, 256, 1024, 256);
  for (let i = 0; i < P.stars; i++) {
    const y = rnd() * 170; g.fillStyle = "rgba(255,255,255," + ((0.3 + rnd() * 0.7) * (1 - y / 200)).toFixed(2) + ")";
    g.fillRect(rnd() * 1024, y, rnd() < 0.2 ? 2 : 1, rnd() < 0.2 ? 2 : 1);
  }
  const sx = P.sun[0] * 1024, sy = P.sun[1] * 256;
  const sg = g.createRadialGradient(sx, sy, 0, sx, sy, P.moon ? 60 : 150);
  sg.addColorStop(0, P.sunCol + "1)"); sg.addColorStop(0.12, P.sunCol + ".9)"); sg.addColorStop(0.4, P.sunCol + ".25)"); sg.addColorStop(1, P.sunCol + "0)");
  g.fillStyle = sg; g.fillRect(sx - 160, sy - 160, 320, 320);
  if (P.moon) { g.fillStyle = "#f4f6ff"; g.beginPath(); g.arc(sx, sy, 14, 0, TAU); g.fill(); g.fillStyle = P.top; g.beginPath(); g.arc(sx + 6, sy - 3, 12, 0, TAU); g.fill(); }
  for (let i = 0; i < P.clouds; i++) {                       // soft puffy clouds
    const cx = rnd() * 1024, cy = 50 + rnd() * 150, n = 5 + (rnd() * 5 | 0), s = 0.6 + rnd() * 0.8;
    for (let k2 = 0; k2 < n; k2++) {
      const x = cx + (k2 - n / 2) * 22 * s + rnd() * 10, y = cy - Math.sin(k2 / (n - 1) * Math.PI) * 18 * s + rnd() * 6, r = (18 + rnd() * 16) * s;
      const cg = g.createRadialGradient(x, y, 0, x, y, r);
      const tint = k === "sunset" ? "255,200,180" : "255,255,255";
      cg.addColorStop(0, "rgba(" + tint + ",.85)"); cg.addColorStop(0.7, "rgba(" + tint + ",.5)"); cg.addColorStop(1, "rgba(" + tint + ",0)");
      for (let ox = -1024; ox <= 1024; ox += 1024) { g.fillStyle = cg; g.save(); g.translate(ox, 0); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
    }
  }
  return c;
}
// The tree line around the park: rounded hardwoods and pines on a clear background.
function treeLineCanvas(dark) {
  const c = mkCanvas(1024, 128), g = c.getContext("2d"), rnd = rng(61);
  const cols = dark ? ["#0b1a24", "#0e2030", "#0a1520"] : ["#1f6b34", "#185c2c", "#2a7a3a", "#14502a"];
  for (let pass = 0; pass < 2; pass++) {
    let x = -20;
    while (x < 1044) {
      const col = cols[(rnd() * cols.length) | 0], h = (pass ? 60 : 40) + rnd() * 50;
      g.fillStyle = pass ? col : shade(col.length === 7 ? col : "#1f6b34", -0.25);
      if (rnd() < 0.35) { g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 14, 128 - h - 20); g.lineTo(x + 28, 128); g.closePath(); g.fill(); x += 18; }
      else {
        const r = 14 + rnd() * 16;
        for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + r * 0.6 + rnd() * r, 128 - h + rnd() * 22, r * (0.7 + rnd() * 0.4), 0, TAU); g.fill(); }
        g.fillRect(x + r * 0.4, 128 - h + 10, r * 1.4, h);
        x += r * 1.3;
      }
    }
  }
  return c;
}
function netCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  g.strokeStyle = "rgba(20,24,34,.9)"; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64);
  g.moveTo(-32, 32); g.lineTo(32, -32); g.moveTo(32, 96); g.lineTo(96, 32); g.moveTo(-32, 32); g.lineTo(32, 96); g.moveTo(32, -32); g.lineTo(96, 32); g.stroke();
  return c;
}
// A banner for the bottom of the netting. kind 0: the wordmark, 1: the game, 2: a slogan.
function bannerCanvas(script, kind) {
  const c = mkCanvas(1024, 160), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 160);
  if (kind === 1) { bg.addColorStop(0, "#ff5aa8"); bg.addColorStop(1, "#d81b7c"); }
  else { bg.addColorStop(0, "#1c3c9e"); bg.addColorStop(1, "#0b1f5e"); }
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 160);
  g.fillStyle = "#ff9214"; g.fillRect(0, 0, 1024, 12); g.fillRect(0, 148, 1024, 12);
  g.fillStyle = "#ffe45c"; g.fillRect(0, 12, 1024, 4); g.fillRect(0, 144, 1024, 4);
  for (let i = 0; i < 6; i++) { g.fillStyle = "#cfd3dc"; g.beginPath(); g.arc(40 + i * 189, 26, 5, 0, TAU); g.fill(); }   // grommets
  if (kind === 0) { drawScript(g, script, 300, 82, 470, 120); drawScript(g, script, 800, 82, 380, 110); }
  else if (kind === 1) { candyText(g, "PAINTBALL BLITZ", 512, 82, 86, 900); }
  else { drawScript(g, script, 210, 82, 330, 112); candyText(g, "NO QUARTERS REQUIRED", 640, 82, 54, 560, ["#bff4ff", "#3fe0ff", "#1b8fe0"]); }
  return c;
}
// The panel over the LED ribbon on each scoreboard.
function boardCanvas(script) {
  const c = mkCanvas(1024, 256), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 256);
  const gl = g.createLinearGradient(0, 0, 0, 120);
  gl.addColorStop(0, "rgba(255,255,255,.4)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.beginPath(); g.ellipse(512, -20, 620, 140, 0, 0, TAU); g.fill();
  g.lineWidth = 14; g.strokeStyle = "#ff9214"; g.strokeRect(7, 7, 1010, 242);
  g.lineWidth = 4; g.strokeStyle = "#ffe45c"; g.strokeRect(17, 17, 990, 222);
  drawScript(g, script, 280, 128, 460, 200);
  candyText(g, "PAINTBALL", 760, 92, 78, 420);
  candyText(g, "BLITZ", 760, 172, 84, 420, ["#ffd0ef", "#ff5aa8", "#d81b7c"]);
  return c;
}

/* ---------------- Cover ---------------- */
const INFL = { red: ["#ff4b3e", "#b81e16"], yellow: ["#ffd21f", "#d48a00"], blue: ["#2f7bf0", "#1544a8"], green: ["#46d13a", "#1d8a22"], purple: ["#a06bff", "#5c2bc4"] };
// Inflatable vinyl: a glossy color, darker seams, a white band with the wordmark (reps times around).
function vinylCanvas(script, col, reps) {
  const P = INFL[col], c = mkCanvas(1024, 512), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, shade(P[0], 0.18)); bg.addColorStop(0.5, P[0]); bg.addColorStop(1, P[1]);
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 512);
  g.fillStyle = "rgba(0,0,0,.14)"; for (let x = 0; x < 1024; x += 1024 / (reps * 2)) g.fillRect(x - 2, 0, 4, 512);   // seams
  g.fillStyle = "rgba(255,255,255,.95)"; g.fillRect(0, 210, 1024, 120);
  g.fillStyle = P[1]; g.fillRect(0, 204, 1024, 6); g.fillRect(0, 330, 1024, 6);
  for (let i = 0; i < reps; i++) drawScript(g, script, (i + 0.5) * 1024 / reps, 270, 1024 / reps * 0.82, 104);
  return c;
}
// Bricks get one big panel per face.
function brickCanvas(script, col) {
  const P = INFL[col], c = mkCanvas(512, 384), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 384);
  bg.addColorStop(0, shade(P[0], 0.2)); bg.addColorStop(0.6, P[0]); bg.addColorStop(1, P[1]);
  g.fillStyle = bg; g.fillRect(0, 0, 512, 384);
  rrectPath(g, 40, 110, 432, 170, 40); g.fillStyle = "#ffffff"; g.fill();
  g.lineWidth = 8; g.strokeStyle = P[1]; g.stroke();
  drawScript(g, script, 256, 196, 380, 140);
  g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(0, 20, 512, 24);
  return c;
}
// Snakes: rings of two colors down the length.
function snakeCanvas(col) {
  const P = INFL[col], c = mkCanvas(64, 512), g = c.getContext("2d");
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? P[0] : shade(P[0], 0.35); g.fillRect(0, i * 64, 64, 64); g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, i * 64, 64, 3); }
  return c;
}
function crateCanvas(script) {
  const c = mkCanvas(512, 512), g = c.getContext("2d"), rnd = rng(23);
  for (let i = 0; i < 6; i++) {                            // planks
    g.fillStyle = "hsl(" + (30 + rnd() * 6) + "," + (52 + rnd() * 10) + "%," + (50 + rnd() * 8) + "%)";
    g.fillRect(0, i * 512 / 6, 512, 512 / 6 + 1);
    for (let k = 0; k < 30; k++) { g.fillStyle = "rgba(90,50,15," + (0.06 + rnd() * 0.1) + ")"; g.fillRect(0, i * 512 / 6 + rnd() * 85, 512, 1 + rnd()); }
    g.fillStyle = "rgba(60,30,8,.55)"; g.fillRect(0, i * 512 / 6, 512, 3);
  }
  g.fillStyle = "#8a5a2a"; g.fillRect(0, 0, 512, 48); g.fillRect(0, 464, 512, 48); g.fillRect(0, 0, 48, 512); g.fillRect(464, 0, 48, 512);
  g.save(); g.translate(256, 256); g.rotate(Math.atan2(416, 416)); g.fillRect(-300, -24, 600, 48); g.restore();
  g.fillStyle = "rgba(255,240,210,.18)"; g.fillRect(0, 0, 512, 6);
  for (const [x, y] of [[24, 24], [488, 24], [24, 488], [488, 488]]) { g.fillStyle = "#3a3a40"; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); }
  drawScript(g, tintScript(script, "#2a1606", 0.78), 256, 256, 400, 170);
  return c;
}
function barrelCanvas(script, col) {
  const P = INFL[col], c = mkCanvas(512, 256), g = c.getContext("2d");
  g.fillStyle = P[1]; g.fillRect(0, 0, 512, 256);
  const gr = g.createLinearGradient(0, 0, 512, 0);
  for (let i = 0; i <= 8; i++) gr.addColorStop(i / 8, i % 2 ? shade(P[0], 0.1) : P[0]);
  g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#ffffff"; g.fillRect(0, 100, 512, 56);
  g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(0, 60, 512, 8); g.fillRect(0, 188, 512, 8);
  drawScript(g, script, 128, 128, 220, 52); drawScript(g, script, 384, 128, 220, 52);
  return c;
}
function plywoodCanvas(script) {
  const c = mkCanvas(1024, 640), g = c.getContext("2d"), rnd = rng(31);
  g.fillStyle = "#c99a5e"; g.fillRect(0, 0, 1024, 640);
  for (let i = 0; i < 260; i++) { g.strokeStyle = "rgba(120,70,25," + (0.05 + rnd() * 0.12) + ")"; g.lineWidth = 1 + rnd() * 2; const y = rnd() * 640; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(300, y + rnd() * 20 - 10, 700, y + rnd() * 20 - 10, 1024, y); g.stroke(); }
  rrectPath(g, 60, 80, 904, 480, 36); g.fillStyle = "#0b1f5e"; g.fill();
  g.lineWidth = 14; g.strokeStyle = "#ff9214"; g.stroke();
  drawScript(g, script, 512, 250, 760, 250);
  candyText(g, "PAINTBALL BLITZ", 512, 455, 82, 780);
  return c;
}
function flagCanvas(script) {
  const c = mkCanvas(256, 160), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 160);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(1, "#1749c4");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 160);
  g.fillStyle = "#ffe45c"; g.fillRect(0, 0, 256, 9); g.fillRect(0, 151, 256, 9);
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 14, 160);
  drawScript(g, script, 136, 80, 220, 124);
  return c;
}
function tentCanvas(script) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#ff7a1a" : "#ffffff"; g.fillRect(i * 64, 0, 64, 256); }
  g.fillStyle = "#0b1f5e"; g.fillRect(0, 200, 512, 56);
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? "#ff7a1a" : "#ffffff"; g.beginPath(); g.moveTo(i * 32, 256); g.lineTo(i * 32 + 16, 236); g.lineTo(i * 32 + 32, 256); g.fill(); }
  drawScript(g, script, 128, 228, 200, 46); drawScript(g, script, 384, 228, 200, 46);
  return c;
}

/* ---------------- Paint, light, shadow ---------------- */
// A paint splat in white (each one is tinted when it lands).
function splatCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d"), rnd = rng(77);
  g.fillStyle = "#ffffff";
  g.beginPath();
  for (let i = 0; i <= 28; i++) { const a = i / 28 * TAU, r = 30 + rnd() * 14 + (i % 4 === 0 ? 8 : 0); g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.closePath(); g.fill();
  for (let i = 0; i < 11; i++) {
    const a = rnd() * TAU, d = 42 + rnd() * 18, r = 2.5 + rnd() * 5.5;
    g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, TAU); g.fill();
    g.lineWidth = r * 0.9; g.strokeStyle = "#ffffff"; g.beginPath(); g.moveTo(64 + Math.cos(a) * 34, 64 + Math.sin(a) * 34); g.lineTo(64 + Math.cos(a) * d, 64 + Math.sin(a) * d); g.stroke();
  }
  // a little shine so it reads wet
  g.globalCompositeOperation = "source-atop";
  const gr = g.createRadialGradient(54, 52, 2, 64, 64, 50);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.3, "rgba(225,225,225,1)"); gr.addColorStop(1, "rgba(200,200,200,1)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
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
function lampCanvas() {
  const c = mkCanvas(128, 64), g = c.getContext("2d");
  g.fillStyle = "#1a2350"; g.fillRect(0, 0, 128, 64);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) {
    const cx = 14 + x * 20, cy = 12 + y * 20, gr = g.createRadialGradient(cx, cy, 0, cx, cy, 9);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.6, "#fff6c8"); gr.addColorStop(1, "rgba(255,246,200,0)");
    g.fillStyle = gr; g.fillRect(cx - 9, cy - 9, 18, 18);
  }
  return c;
}
// A jersey, wrapped once around the body: u = 0 is the chest, u = .5 the back. Top of the picture is the shoulders.
function jerseyCanvas(script, base, trim, trim2, num, numCol) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, 512, 256);
  const sh = g.createLinearGradient(0, 0, 0, 256);
  sh.addColorStop(0, "rgba(255,255,255,.14)"); sh.addColorStop(1, "rgba(0,0,40,.18)");
  g.fillStyle = sh; g.fillRect(0, 0, 512, 256);
  g.fillStyle = trim; g.fillRect(0, 0, 512, 22); g.fillRect(0, 228, 512, 28);              // yoke and hem
  g.fillStyle = trim2; g.fillRect(0, 22, 512, 6); g.fillRect(0, 222, 512, 6);
  [128, 384].forEach(function (x) { g.fillStyle = trim; g.fillRect(x - 10, 0, 20, 256); g.fillStyle = trim2; g.fillRect(x - 3, 0, 6, 256); });   // side panels
  g.fillStyle = "rgba(0,0,0,.12)";                                                          // padding quilt lines
  for (let y = 40; y < 220; y += 22) g.fillRect(0, y, 512, 2);
  [0, 512].forEach(function (x) { drawScript(g, script, x, 78, 170, 66); });
  if (num) {
    g.font = '900 96px "Arial Black", Arial, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    g.lineWidth = 12; g.strokeStyle = trim; g.strokeText(num, 256, 136);
    g.lineWidth = 5; g.strokeStyle = "#ffffff"; g.strokeText(num, 256, 136);
    g.fillStyle = numCol; g.fillText(num, 256, 136);
    drawScript(g, script, 256, 58, 150, 44);
  }
  return c;
}
// A tiny painted outdoors for the glossy highlights on the vinyl, the markers and the goggles.
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.18, "#cfe6ff"); gr.addColorStop(0.45, "#5aa8ff"); gr.addColorStop(0.5, "#2a7a3a"); gr.addColorStop(1, "#3abd52");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#6ab4ff"; tg.fillRect(0, 0, 64, 64); tg.fillStyle = "#ffffff"; tg.beginPath(); tg.arc(32, 32, 12, 0, TAU); tg.fill();
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#3abd52"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* ---------------- Geometry helpers ---------------- */

// A box with every edge and corner rounded; each face's texture is stretched corner to corner.
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
// Smooth normals across the seams that spheres and lathes leave behind.
function weldNormals(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = Math.round(p.getX(i) * 2e4) + "," + Math.round(p.getY(i) * 2e4) + "," + Math.round(p.getZ(i) * 2e4);
    let e = map.get(k);
    if (!e) { e = [0, 0, 0, []]; map.set(k, e); }
    e[0] += n.getX(i); e[1] += n.getY(i); e[2] += n.getZ(i); e[3].push(i);
  }
  map.forEach(function (e) { const l = Math.hypot(e[0], e[1], e[2]) || 1; for (let j = 0; j < e[3].length; j++) n.setXYZ(e[3][j], e[0] / l, e[1] / l, e[2] / l); });
  n.needsUpdate = true;
  return g;
}
// A shape turned on a lathe (radius, height pairs), then pushed and pulled: o.zs flattens it front to back,
// o.fn(v) moves each point, o.col(v) colors each point (hex) when it is going into a vertex-colored mesh.
const _C = { c: null };
function sculpt(T, prof, segs, o) {
  o = o || {};
  const g = new T.LatheGeometry(prof.map(function (p) { return new T.Vector2(Math.max(0, p[0]), p[1]); }), segs);
  const P = g.attributes.position, v = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < P.count; i++) {
    v.x = P.getX(i); v.y = P.getY(i); v.z = P.getZ(i);
    if (o.xs) v.x *= o.xs;
    if (o.zs) v.z *= o.zs;
    if (o.fn) o.fn(v);
    P.setXYZ(i, v.x, v.y, v.z);
  }
  weldNormals(g);
  if (o.col) paint(T, g, o.col);
  return g;
}
function paint(T, g, col) {
  const P = g.attributes.position, a = new Float32Array(P.count * 3), c = _C.c || (_C.c = new T.Color()), v = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < P.count; i++) {
    v.x = P.getX(i); v.y = P.getY(i); v.z = P.getZ(i);
    c.set(typeof col === "function" ? col(v) : col);
    a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new T.BufferAttribute(a, 3));
  return g;
}
// Many small pieces into one vertex-colored geometry. parts: [geometry, color (hex, or null to keep its own), Matrix4 or null]
function merge(T, parts) {
  let nv = 0, ni = 0;
  parts.forEach(function (p) { const g = p[0]; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  const c = new T.Color(), v = new T.Vector3(), nm = new T.Matrix3();
  let vo = 0, io = 0;
  parts.forEach(function (p) {
    const g = p[0], m = p[2], P = g.attributes.position, N = g.attributes.normal, CC = g.attributes.color;
    if (p[1] != null) c.set(p[1]);
    if (m) nm.getNormalMatrix(m);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); if (m) v.applyMatrix4(m);
      pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
      v.fromBufferAttribute(N, i); if (m) v.applyMatrix3(nm).normalize();
      nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
      if (p[1] == null && CC) { col[(vo + i) * 3] = CC.getX(i); col[(vo + i) * 3 + 1] = CC.getY(i); col[(vo + i) * 3 + 2] = CC.getZ(i); }
      else { col[(vo + i) * 3] = c.r; col[(vo + i) * 3 + 1] = c.g; col[(vo + i) * 3 + 2] = c.b; }
    }
    if (g.index) for (let k = 0; k < g.index.count; k++) idx[io++] = g.index.getX(k) + vo;
    else for (let k = 0; k < P.count; k++) idx[io++] = vo + k;
    vo += P.count;
  });
  const out = new T.BufferGeometry();
  out.setAttribute("position", new T.BufferAttribute(pos, 3));
  out.setAttribute("normal", new T.BufferAttribute(nor, 3));
  out.setAttribute("color", new T.BufferAttribute(col, 3));
  out.setIndex(new T.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
function mirrorX(T, g) {
  const m = g.clone();
  m.applyMatrix4(new T.Matrix4().makeScale(-1, 1, 1));
  const ix = m.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  m.index.needsUpdate = true;
  return m;
}
function M4(T, x, y, z, rx, ry, rz, sx, sy, sz) {
  const m = new T.Matrix4();
  m.compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0, "YXZ")), new T.Vector3(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
  return m;
}
function smooth(x) { return Math.exp(-x * x); }

/* ---------------- People: sculpted, original, and posed from a few numbers every frame ----------------
   Every person is built from shaped pieces, not tubes. The head is a sphere pushed into a skull with a jaw,
   a chin, cheekbones, a brow ridge and eye sockets, with a nose, ears, eyes, brows and lips set into it.
   The torso is turned on a lathe with a chest, a narrow waist and a sloped yoke, and each limb carries its
   muscle (deltoid, biceps, forearm, quads, calf) on the side it belongs. Elbows and knees are solved from where
   the hands and feet need to be. Everything is in meters; a person faces +z with their left side at +x. */
const UA = 0.29, FA = 0.265, TH = 0.42, SH = 0.41;          // upper arm, forearm, thigh, shin
const HEAD = { sx: 0.079, sy: 0.118, sz: 0.1, cy: 0.112, cz: 0.012 };
const GOG = { t0: 1.4, t1: 1.69 };                          // where the goggles sit: between the brows and the nose

const TEAMS = {
  blue:   { jersey: "#1f5fe0", trim: "#0b1f5e", trim2: "#ffe45c", pants: "#232a40", stripe: "#3d8cff", glove: "#1a1c24", accent: "#ffe45c",
            marker: "#1f5fe0", lid: "#ffe600", frame: "#14171f", strap: "#1f5fe0", pad: "#14171f" },
  orange: { jersey: "#ff7a1a", trim: "#0b1f5e", trim2: "#ffffff", pants: "#2c2c33", stripe: "#ff7a1a", glove: "#1a1c24", accent: "#ff7a1a",
            marker: "#ff7a1a", lid: "#ff2fa8", frame: "#14171f", strap: "#ff7a1a", pad: "#14171f" }
};
// The people themselves. Nobody here is anybody real.
const PEOPLE = [
  { skin: "#d99b6c", hair: "#3a2414", eye: "#5a3a1a", lip: "#a85a48", head: 0, top: "beanie", cap: "#0b1f5e", brow: 0.08, smile: 0.9 },  // you
  { skin: "#f0c6a0", hair: "#c48a3a", eye: "#2f6aa0", lip: "#c06a5a", head: 1, top: "hair", band: "#0b1f5e", brow: -0.22, smile: -0.2 },
  { skin: "#8a5634", hair: "#120c08", eye: "#2a1a0c", lip: "#6a3428", head: 2, top: "beanie", cap: "#ff7a1a", brow: -0.28, smile: 0.2, beard: true },
  { skin: "#c78955", hair: "#1c120a", eye: "#3a2a12", lip: "#9a4e3a", head: 0, top: "hair", band: "#ffffff", brow: -0.18, smile: 0.5 },
  { skin: "#f6d3b2", hair: "#7a3a18", eye: "#3a7a3a", lip: "#c87060", head: 1, top: "beanie", cap: "#0b1f5e", brow: -0.25, smile: 0.0 },
  { skin: "#6a4126", hair: "#0c0806", eye: "#1e140a", lip: "#5a2c22", head: 2, top: "hair", band: "#ff7a1a", brow: -0.3, smile: -0.4 },
  { skin: "#e3aa7c", hair: "#2c1c10", eye: "#4a3218", lip: "#a8584a", head: 0, top: "beanie", cap: "#ff7a1a", brow: -0.2, smile: 0.3, beard: true }
];
const HEAD_SHAPES = [{ jaw: 0.6, nose: 1.0, chin: 1.0 }, { jaw: 0.2, nose: 0.85, chin: 0.9 }, { jaw: 1.0, nose: 1.15, chin: 1.1 }];

// The skull: a unit sphere point (x, y, z) pushed into a head, in meters around the head's center.
function deformHead(x, y, z, hs) {
  if (y < 0) {
    const k = -y;
    x *= 1 - (0.42 - hs.jaw * 0.1) * k * k;                 // narrows toward the chin
    if (z > 0) z *= 1 + 0.07 * k * hs.chin - 0.17 * k * k * k;   // the chin stays forward
    else z *= 1 - 0.42 * k;                                 // under the jaw, into the neck
    y *= 1 + 0.06 * k;
  } else if (z < 0) z *= 1 + 0.1 * y;                       // the back of the skull
  if (z > 0.3) z += 0.07 * smooth((y - 0.25) / 0.1) * smooth(x / 0.62);                   // brow ridge
  for (let s = -1; s <= 1; s += 2) if (z > 0.3) z -= 0.075 * Math.exp(-(Math.pow((x - s * 0.37) / 0.17, 2) + Math.pow((y - 0.07) / 0.11, 2)));   // eye sockets
  if (z > 0) x += Math.sign(x) * 0.06 * smooth((y + 0.08) / 0.14) * z;                   // cheekbones
  x += Math.sign(x) * (0.05 + 0.03 * hs.jaw) * smooth((y + 0.52) / 0.16) * smooth((z + 0.05) / 0.45);   // the angle of the jaw
  if (z > 0.5) z += 0.035 * smooth((y + 0.42) / 0.14) * smooth(x / 0.35);               // around the mouth
  return [x * HEAD.sx, y * HEAD.sy + HEAD.cy, z * HEAD.sz + HEAD.cz];
}
// Where the face's surface is, looking straight at it from the front at unit (ux, uy).
function facePoint(ux, uy, hs) { return deformHead(ux, uy, Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy)), hs); }
// A band of the head's surface (theta and phi ranges of a sphere), lifted off it: hair, a beanie, goggles, a strap.
function headShell(T, hs, lift, phi0, phiLen, th0, thLen, ws, hsg) {
  const g = new T.SphereGeometry(1, ws || 36, hsg || 16, phi0, phiLen, th0, thLen);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), p = deformHead(x, y, z, hs);
    const dx = p[0], dy = p[1] - HEAD.cy, dz = p[2] - HEAD.cz, l = Math.hypot(dx, dy, dz) || 1;
    P.setXYZ(i, p[0] + dx / l * lift, p[1] + dy / l * lift, p[2] + dz / l * lift);
  }
  return weldNormals(g);
}

// A patch of the head's surface whose top and bottom edges can wander with the angle around the head
// (th0(phi) to th1(phi)), lifted off it. Hairlines and beanie cuffs sit higher at the forehead than at the nape.
function headPatch(T, hs, lift, phi0, phiLen, th0, th1, ws, hsg) {
  const pos = [], idx = [];
  for (let j = 0; j <= hsg; j++) for (let i = 0; i <= ws; i++) {
    const phi = phi0 + phiLen * i / ws, a = th0(phi), b = th1(phi), th = a + (b - a) * j / hsg;
    const p = deformHead(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th), hs);
    const dx = p[0], dy = p[1] - HEAD.cy, dz = p[2] - HEAD.cz, l = Math.hypot(dx, dy, dz) || 1;
    pos.push(p[0] + dx / l * lift, p[1] + dy / l * lift, p[2] + dz / l * lift);
  }
  for (let j = 0; j < hsg; j++) for (let i = 0; i < ws; i++) {
    const a = j * (ws + 1) + i;
    idx.push(a + 1, a, a + ws + 2, a, a + ws + 1, a + ws + 2);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return weldNormals(g);
}
const PI = Math.PI;
function capLine(phi) { return 0.45 * PI - 0.08 * PI * Math.sin(phi); }      // a beanie: across the forehead, down over the ears, low at the back
function hairLine(phi) { return 0.44 * PI - 0.08 * PI * Math.sin(phi); }
function bandLine(phi) { return 0.4 * PI - 0.05 * PI * Math.sin(phi); }

function headSkinGeo(T, hs) {
  const g = new T.SphereGeometry(1, 38, 30), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) { const p = deformHead(P.getX(i), P.getY(i), P.getZ(i), hs); P.setXYZ(i, p[0], p[1], p[2]); }
  weldNormals(g);
  // the nose: a wedge, narrow at the bridge, out at the tip, with a nostril wing each side
  const nose = new T.SphereGeometry(1, 14, 12), NP = nose.attributes.position;
  for (let i = 0; i < NP.count; i++) {
    let x = NP.getX(i), y = NP.getY(i), z = NP.getZ(i);
    const k = (1 - y) / 2;                                  // 0 at the bridge, 1 at the tip
    x *= 0.45 + 0.55 * k; z = z * (0.55 + 0.45 * k) + k * 0.45;
    NP.setXYZ(i, x * 0.016 * hs.nose, y * 0.03 * hs.nose, z * 0.02 * hs.nose);
  }
  weldNormals(nose);
  const np = facePoint(0, -0.16, hs);
  const parts = [[g, null, null], [nose, null, M4(T, np[0], np[1], np[2] - 0.011, 0.1, 0, 0)]];
  for (let s = -1; s <= 1; s += 2) {
    const w = new T.SphereGeometry(0.0062, 10, 8);
    parts.push([w, null, M4(T, np[0] + s * 0.0105, np[1] - 0.021, np[2] - 0.002, 0, 0, 0, 1, 0.7, 0.9)]);
    const ear = new T.SphereGeometry(1, 14, 10);
    parts.push([ear, null, M4(T, s * HEAD.sx * 0.98, HEAD.cy - 0.004, HEAD.cz - 0.012, 0, s * 0.35, 0, 0.012, 0.031, 0.021)]);
  }
  // the neck, with the big muscles running down from behind the ears
  const neck = sculpt(T, [[0, -0.07], [0.058, -0.066], [0.054, -0.02], [0.05, 0.03], [0.047, 0.07], [0, 0.075]], 20, { zs: 0.92 });
  parts.push([neck, null, M4(T, 0, 0, -0.008)]);
  return merge(T, parts.map(function (p) { return [p[0], "#ffffff", p[2]]; }));
}
// Eyes, brows and lips, one vertex-colored piece per person.
function faceGeo(T, hs, who) {
  const parts = [];
  for (let s = -1; s <= 1; s += 2) {
    const e = facePoint(s * 0.37, 0.07, hs);
    parts.push([new T.SphereGeometry(0.0128, 14, 10), "#f6f3ee", M4(T, e[0], e[1], e[2] - 0.0095)]);
    parts.push([new T.SphereGeometry(0.0074, 12, 8), who.eye, M4(T, e[0] - s * 0.0008, e[1] - 0.0005, e[2] + 0.0004, 0, 0, 0, 1, 1, 0.45)]);
    parts.push([new T.SphereGeometry(0.0038, 10, 6), "#0a0806", M4(T, e[0] - s * 0.0008, e[1] - 0.0005, e[2] + 0.0018, 0, 0, 0, 1, 1, 0.4)]);
    parts.push([new T.SphereGeometry(0.0018, 6, 4), "#ffffff", M4(T, e[0] - s * 0.003 + 0.002, e[1] + 0.0025, e[2] + 0.0028)]);   // catchlight
    // upper lid: a thin skin-dark crescent over the eye gives it a look
    parts.push([new T.SphereGeometry(0.0136, 14, 6, 0, TAU, 0, Math.PI * 0.42), shadeHex(who.skin, -0.25), M4(T, e[0], e[1] + 0.001, e[2] - 0.0098, 0.15 - who.brow * 0.6, 0, 0)]);
    const b = facePoint(s * 0.37, 0.315, hs);
    parts.push([roundBox(T, 0.036, 0.0095, 0.012, 0.004), shadeHex(who.hair, -0.2), M4(T, b[0], b[1], b[2] - 0.002, -0.25, s * 0.25, s * who.brow)]);
  }
  // lips: a curve that smiles (or does not), a darker line between
  const m = facePoint(0, -0.47, hs), sm = who.smile;
  const lip = new T.TorusGeometry(0.019, 0.0042, 8, 18, Math.PI * 0.62);
  parts.push([lip, who.lip, M4(T, m[0], m[1] + 0.012 * sm + 0.002, m[2] - 0.004, 0.25, 0, sm >= 0 ? Math.PI + Math.PI * 0.19 : Math.PI * 0.19, 1, 0.55 + 0.45 * Math.abs(sm), 1)]);
  parts.push([new T.SphereGeometry(1, 12, 6), shadeHex(who.lip, -0.55), M4(T, m[0], m[1] + 0.001, m[2] - 0.004, 0, 0, 0, 0.017, 0.0026, 0.004)]);
  parts.push([new T.SphereGeometry(1, 12, 8), who.lip, M4(T, m[0], m[1] - 0.0065, m[2] - 0.0045, 0, 0, 0, 0.0145, 0.0048, 0.0055)]);
  return merge(T, parts);
}
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16), t = k < 0 ? 0 : 255, a = Math.abs(k);
  const f = function (v) { return Math.round(v * (1 - a) + t * a); };
  return "#" + ((1 << 24) + (f((n >> 16) & 255) << 16) + (f((n >> 8) & 255) << 8) + f(n & 255)).toString(16).slice(1);
}
// Hair, or a beanie, with a headband or a beard as the person has them.
function topGeo(T, hs, who, team) {
  const parts = [];
  if (who.top === "beanie") {
    parts.push([headPatch(T, hs, 0.009, 0, TAU, function () { return 0; }, capLine, 40, 12), who.cap, null]);
    parts.push([headPatch(T, hs, 0.017, 0, TAU, function (f) { return capLine(f) - 0.075 * PI; }, function (f) { return capLine(f) + 0.004 * PI; }, 40, 4), shadeHex(who.cap, 0.18), null]);   // folded cuff
    parts.push([new T.SphereGeometry(0.024, 10, 8), TEAMS[team].trim2, M4(T, 0, HEAD.cy + HEAD.sy + 0.014, HEAD.cz - 0.01)]);   // the bobble
  } else {
    parts.push([headPatch(T, hs, 0.007, 0, TAU, function () { return 0; }, hairLine, 40, 12), who.hair, null]);
    parts.push([headPatch(T, hs, 0.012, 0, TAU, bandLine, function (f) { return bandLine(f) + 0.05 * PI; }, 40, 3), who.band, null]);
    for (let s = -1; s <= 1; s += 2) parts.push([roundBox(T, 0.008, 0.03, 0.016, 0.004), who.hair, M4(T, s * HEAD.sx * 0.99, HEAD.cy - 0.006, HEAD.cz + 0.02)]);   // sideburns
  }
  if (who.beard) parts.push([headShell(T, hs, 0.004, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.7, Math.PI * 0.28, 24, 8), who.hair, null]);
  return merge(T, parts);
}
// The mask: a goggle frame around a lens, a strap round the back, a jaw guard under the lips.
function gogglesGeo(T, hs, team) {
  const C = TEAMS[team], parts = [];
  const f0 = Math.PI / 2 - 1.12, fl = 2.24, t0 = GOG.t0, t1 = GOG.t1, gap = 0.13;
  parts.push([headShell(T, hs, 0.017, f0, fl, t0 - 0.08, 0.08, 28, 2), C.frame, null]);
  parts.push([headShell(T, hs, 0.017, f0, fl / 2 - gap, t1, 0.08, 14, 2), C.frame, null]);
  parts.push([headShell(T, hs, 0.017, Math.PI / 2 + gap, fl / 2 - gap, t1, 0.08, 14, 2), C.frame, null]);
  parts.push([headShell(T, hs, 0.017, Math.PI / 2 - gap, gap * 2, t1 - 0.14, 0.04, 6, 2), C.frame, null]);   // the bridge, up on the nose
  parts.push([headShell(T, hs, 0.017, f0 - 0.1, 0.1, t0 - 0.08, t1 - t0 + 0.16, 2, 6), C.frame, null]);
  parts.push([headShell(T, hs, 0.017, f0 + fl, 0.1, t0 - 0.08, t1 - t0 + 0.16, 2, 6), C.frame, null]);
  parts.push([headShell(T, hs, 0.019, f0 + 0.05, fl - 0.1, t0 - 0.095, 0.02, 28, 1), C.accent, null]);
  parts.push([headShell(T, hs, 0.021, f0 + fl + 0.1, TAU - fl - 0.2, GOG.t0 + 0.02, 0.16, 24, 2), C.strap, null]);
  parts.push([headShell(T, hs, 0.016, Math.PI / 2 - 0.85, 1.7, 2.32, 0.22, 20, 3), C.frame, null]);   // jaw guard
  parts.push([headShell(T, hs, 0.018, Math.PI / 2 - 0.5, 1.0, 2.36, 0.06, 12, 1), C.accent, null]);
  return merge(T, parts);
}
function lensGeo(T, hs) { return headShell(T, hs, 0.015, Math.PI / 2 - 1.12, 2.24, GOG.t0, GOG.t1 - GOG.t0, 28, 6); }

// The torso, turned on a lathe: a narrow waist, the chest out front, shoulder blades behind, a sloped yoke up into the neck.
function torsoGeo(T) {
  return sculpt(T, [[0, -0.03], [0.138, -0.025], [0.144, 0.04], [0.138, 0.12], [0.146, 0.22], [0.168, 0.31], [0.183, 0.385], [0.19, 0.43],
                    [0.18, 0.465], [0.14, 0.497], [0.085, 0.522], [0.056, 0.54], [0, 0.55]], 30, {
    zs: 0.62,
    fn: function (v) {
      if (v.z > 0) v.z *= 1 + 0.22 * smooth((v.y - 0.36) / 0.08) * smooth(v.x / 0.13) + 0.05 * smooth((v.y - 0.1) / 0.1);   // chest, then a little belly
      else v.z *= 1 + 0.12 * smooth((v.y - 0.38) / 0.07) * smooth((Math.abs(v.x) - 0.08) / 0.07);                            // shoulder blades
      v.x *= 1 + 0.06 * smooth((v.y - 0.24) / 0.06) * (v.z < 0 ? 1 : 0.4);                                                  // lats
    }
  });
}
// Shorts / pants over the hips, glutes behind.
function pelvisGeo(T, team) {
  const C = TEAMS[team];
  return sculpt(T, [[0, -0.15], [0.075, -0.145], [0.14, -0.11], [0.165, -0.04], [0.162, 0.04], [0.15, 0.09], [0, 0.1]], 24, {
    zs: 0.74,
    fn: function (v) { if (v.z < 0) v.z *= 1 + 0.2 * smooth((v.y + 0.06) / 0.07) * smooth((Math.abs(v.x) - 0.065) / 0.06); },
    col: C.pants
  });
}
// Belt, pod pack (four pods of paint on the lower back), shoulder pads and a collar.
function beltGeo(T, team) {
  const C = TEAMS[team], parts = [];
  parts.push([new T.TorusGeometry(1, 0.13, 8, 30), "#16181f", M4(T, 0, 0.07, 0, Math.PI / 2, 0, 0, 0.163, 0.124, 0.163)]);
  parts.push([roundBox(T, 0.05, 0.035, 0.02, 0.008), "#c9ced8", M4(T, 0, 0.07, 0.122)]);
  parts.push([roundBox(T, 0.2, 0.12, 0.06, 0.02), "#16181f", M4(T, 0, 0.03, -0.14)]);
  for (let i = 0; i < 4; i++) {
    const x = -0.066 + i * 0.044;
    parts.push([new T.CylinderGeometry(0.02, 0.02, 0.17, 12), team === "blue" ? "#ffe600" : "#ff2fa8", M4(T, x, 0.12, -0.175, -0.12, 0, 0)]);
    parts.push([new T.CylinderGeometry(0.022, 0.022, 0.03, 12), "#16181f", M4(T, x, 0.215, -0.186, -0.12, 0, 0)]);
  }
  return merge(T, parts);
}
function yokeGeo(T, team) {
  const C = TEAMS[team], parts = [];
  for (let s = -1; s <= 1; s += 2) parts.push([new T.SphereGeometry(1, 16, 10, 0, TAU, 0, Math.PI * 0.55), C.trim, M4(T, s * 0.172, 0.448, -0.004, 0, 0, -s * 0.25, 0.078, 0.05, 0.086)]);
  parts.push([new T.TorusGeometry(0.064, 0.013, 8, 22), C.trim, M4(T, 0, 0.53, 0.004, Math.PI / 2 + 0.12, 0, 0, 1, 0.82, 1)]);
  return merge(T, parts);
}
// Limbs. Each runs along +y from its top joint, with +z on the side the joint bends away from (the knee's front,
// the point of the elbow), so the muscle sits where it should whichever way the limb turns.
function upperArmGeo(T, team) {
  return sculpt(T, [[0, -0.055], [0.04, -0.05], [0.063, -0.025], [0.067, 0.02], [0.06, 0.08], [0.057, 0.14], [0.052, 0.2], [0.046, 0.25], [0.043, 0.29], [0.03, 0.31], [0, 0.315]], 18, {
    fn: function (v) {
      if (v.z < 0) v.z *= 1 + 0.22 * smooth((v.y - 0.15) / 0.06);   // biceps
      else v.z *= 1 + 0.1 * smooth((v.y - 0.12) / 0.07);            // triceps
    },
    col: TEAMS[team].jersey
  });
}
function foreArmGeo(T, team) {
  const C = TEAMS[team];
  const g = sculpt(T, [[0, -0.035], [0.04, -0.03], [0.05, 0.0], [0.053, 0.05], [0.049, 0.1], [0.042, 0.17], [0.036, 0.22], [0.034, 0.245], [0.04, 0.25], [0.04, 0.268], [0, 0.27]], 16, {
    fn: function (v) { if (v.x * v.x > 0) v.x *= 1 + 0.12 * smooth((v.y - 0.06) / 0.06); },
    col: function (v) { return v.y > 0.243 ? C.trim2 : C.jersey; }
  });
  const pad = new T.SphereGeometry(1, 14, 10, 0, TAU, 0, Math.PI * 0.5);
  return merge(T, [[g, null, null], [pad, C.pad, M4(T, 0, 0.01, 0.032, Math.PI / 2, 0, 0, 0.042, 0.03, 0.05)]]);
}
function thighGeo(T, team) {
  const C = TEAMS[team];
  return sculpt(T, [[0, -0.07], [0.08, -0.06], [0.098, -0.01], [0.101, 0.06], [0.096, 0.14], [0.085, 0.25], [0.07, 0.34], [0.06, 0.4], [0.054, 0.43], [0.03, 0.45], [0, 0.455]], 18, {
    fn: function (v) {
      if (v.z > 0) v.z *= 1 + 0.12 * smooth((v.y - 0.2) / 0.1);    // quads
      if (v.x > 0) v.x *= 1 + 0.05 * smooth((v.y - 0.3) / 0.08);
    },
    col: function (v) { return Math.abs(v.x) > 0.06 && Math.abs(v.z) < 0.03 ? C.stripe : C.pants; }
  });
}
function shinGeo(T, team) {
  const C = TEAMS[team];
  const g = sculpt(T, [[0, -0.035], [0.052, -0.03], [0.059, 0.02], [0.062, 0.09], [0.06, 0.15], [0.052, 0.24], [0.043, 0.32], [0.04, 0.37], [0.047, 0.38], [0.047, 0.41], [0.03, 0.42], [0, 0.422]], 18, {
    fn: function (v) { if (v.z < 0) v.z *= 1 + 0.32 * smooth((v.y - 0.12) / 0.07); },   // calf
    col: function (v) { return v.y > 0.365 ? C.stripe : C.pants; }
  });
  // a knee pad: a hard cap with a strap
  const cap = new T.SphereGeometry(1, 16, 12, 0, TAU, 0, Math.PI * 0.5);
  return merge(T, [[g, null, null], [cap, C.pad, M4(T, 0, 0.035, 0.044, Math.PI / 2, 0, 0, 0.05, 0.034, 0.068)],
                   [new T.TorusGeometry(0.058, 0.007, 6, 18), C.accent, M4(T, 0, 0.06, 0.004, Math.PI / 2, 0, 0, 1, 0.82, 1)]]);
}
// A gloved fist, wrist at the origin, fingers toward +y. Left hand; the right is its mirror.
function handGeo(T, team) {
  const C = TEAMS[team], parts = [];
  parts.push([new T.CylinderGeometry(0.041, 0.039, 0.035, 14), C.accent, M4(T, 0, 0.005, 0)]);
  parts.push([roundBox(T, 0.08, 0.075, 0.036, 0.014), C.glove, M4(T, 0, 0.055, 0)]);
  for (let i = 0; i < 4; i++) {                              // curled fingers: two knuckles each
    const x = -0.028 + i * 0.0187, l = i === 0 || i === 3 ? 0.9 : 1;
    parts.push([roundBox(T, 0.018, 0.034 * l, 0.03, 0.008), C.glove, M4(T, x, 0.103, 0.006, 0.5, 0, 0)]);
    parts.push([roundBox(T, 0.017, 0.028 * l, 0.024, 0.008), C.glove, M4(T, x, 0.106, 0.034, 1.7, 0, 0)]);
  }
  parts.push([roundBox(T, 0.082, 0.016, 0.03, 0.007), C.accent, M4(T, 0, 0.088, -0.006)]);
  parts.push([roundBox(T, 0.022, 0.05, 0.024, 0.009), C.glove, M4(T, 0.044, 0.062, 0.018, 0.3, 0, -0.5)]);   // thumb
  return merge(T, parts);
}
// A court shoe: ankle at the origin, toe toward +z, flat sole, a toe that turns up a touch.
function shoeGeo(T, team) {
  const C = TEAMS[team], g = new T.SphereGeometry(1, 22, 14), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    y = Math.max(y, -0.55);
    x *= z > 0 ? 1 : 0.88;
    const zz = z * 0.128 + 0.045;
    let yy = y * 0.046 - 0.04;
    if (zz > 0.11) yy += (zz - 0.11) * 0.25 * (y < 0 ? 1 : 0.3);
    P.setXYZ(i, x * 0.052, yy, zz);
  }
  weldNormals(g);
  paint(T, g, function (v) { return v.y < -0.058 ? "#f4f4f4" : v.y > -0.025 && Math.abs(v.x) < 0.02 && v.z > 0 ? C.accent : "#1c1e26"; });
  const sole = roundBox(T, 0.106, 0.022, 0.262, 0.009);
  return merge(T, [[g, null, null], [sole, "#f4f4f4", M4(T, 0, -0.072, 0.045)]]);
}
// The marker: grip at the origin, barrel toward +z. A loud, chunky paintball marker with a hopper on top.
function markerGeo(T, team) {
  const C = TEAMS[team], parts = [];
  parts.push([roundBox(T, 0.046, 0.074, 0.27, 0.014), C.marker, M4(T, 0, 0.03, 0.05)]);
  parts.push([roundBox(T, 0.05, 0.022, 0.2, 0.008), "#16181f", M4(T, 0, 0.069, 0.06)]);
  parts.push([new T.CylinderGeometry(0.014, 0.016, 0.34, 12), "#16181f", M4(T, 0, 0.045, 0.35, Math.PI / 2, 0, 0)]);
  parts.push([new T.CylinderGeometry(0.019, 0.019, 0.03, 12), C.marker, M4(T, 0, 0.045, 0.51, Math.PI / 2, 0, 0)]);
  for (let i = 0; i < 4; i++) parts.push([new T.TorusGeometry(0.016, 0.0035, 6, 12), "#3a3e48", M4(T, 0, 0.045, 0.24 + i * 0.045)]);   // barrel porting
  parts.push([new T.CylinderGeometry(0.016, 0.018, 0.06, 10), "#16181f", M4(T, 0, 0.095, 0.07)]);
  const hop = new T.SphereGeometry(1, 18, 12);
  parts.push([hop, "#2c3240", M4(T, 0, 0.15, 0.04, 0, 0, 0, 0.066, 0.064, 0.102)]);
  parts.push([new T.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI * 0.45), C.lid, M4(T, 0, 0.165, 0.045, 0, 0, 0, 0.06, 0.055, 0.092)]);
  parts.push([roundBox(T, 0.034, 0.105, 0.046, 0.012), "#16181f", M4(T, 0, -0.05, -0.005, -0.28, 0, 0)]);
  parts.push([new T.TorusGeometry(0.026, 0.0045, 6, 14, Math.PI * 1.2), "#16181f", M4(T, 0, -0.008, 0.045, 0, Math.PI / 2, Math.PI * 0.9)]);
  parts.push([roundBox(T, 0.032, 0.075, 0.042, 0.012), "#16181f", M4(T, 0, -0.034, 0.18, -0.1, 0, 0)]);
  parts.push([new T.CylinderGeometry(0.034, 0.034, 0.22, 16), "#c9ced8", M4(T, 0, 0.01, -0.19, Math.PI / 2, 0, 0)]);
  parts.push([new T.CylinderGeometry(0.036, 0.036, 0.04, 16), C.marker, M4(T, 0, 0.01, -0.3, Math.PI / 2, 0, 0)]);
  return merge(T, parts);
}

/* ---------------- One person, put together ---------------- */
function makePerson(T, K, team, who, hs) {
  const kit = K.teams[team], root = new T.Group();
  const skin = new T.MeshPhongMaterial({ color: who.skin, specular: 0x2a2018, shininess: 22 });
  function mesh(geo, mat, parent) { const m = new T.Mesh(geo, mat); m.castShadow = true; (parent || root).add(m); return m; }
  const pelvis = mesh(kit.pelvis, K.cloth);
  mesh(kit.belt, K.gear, pelvis);
  const upper = new T.Group(); root.add(upper);
  mesh(kit.torso, kit.jerseyMat, upper);
  mesh(kit.yoke, K.cloth, upper);
  const head = new T.Group(); head.position.set(0, 0.535, 0.006); upper.add(head);
  mesh(K.headSkin[who.head], skin, head);
  mesh(faceGeo(T, hs, who), K.face, head);
  mesh(topGeo(T, hs, who, team), K.cloth, head);
  mesh(kit.goggles, K.gear, head);
  const lens = new T.Mesh(K.lens[who.head], team === "blue" ? K.lensBlue : K.lensOrange); lens.renderOrder = 3; head.add(lens);
  const marker = new T.Group(); upper.add(marker);
  mesh(kit.marker, K.gloss, marker);
  const arm = [0, 1].map(function (s) { return { up: mesh(kit.upperArm, K.cloth), lo: mesh(kit.foreArm, K.cloth), hand: mesh(s ? kit.handR : kit.handL, K.gear) }; });
  const leg = [0, 1].map(function () { return { up: mesh(kit.thigh, K.cloth), lo: mesh(kit.shin, K.cloth), foot: mesh(kit.shoe, K.gear) }; });
  // paint that lands on them stays on them until they are back in
  const marks = [];
  for (let i = 0; i < 4; i++) {
    const m = new T.Mesh(K.markGeo, new T.MeshLambertMaterial({ map: K.tSplat, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.visible = false; m.renderOrder = 2; marks.push(m);
  }
  const blob = new T.Mesh(K.unit, K.blobMat); blob.renderOrder = 1; blob.scale.set(1.0, 1, 1.0); blob.position.y = 0.025;
  return { root: root, pelvis: pelvis, upper: upper, head: head, marker: marker, arm: arm, leg: leg, marks: marks, blob: blob, lens: lens,
           phase: Math.random() * TAU, outK: 0, cheerK: 0, aimK: 1, markN: -1 };
}

function buildPeopleKit(T, script, tex, env) {
  const K = { teams: {}, unit: new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2) };
  K.cloth = new T.MeshPhongMaterial({ vertexColors: true, specular: 0x222222, shininess: 14 });
  K.gear = new T.MeshPhongMaterial({ vertexColors: true, specular: 0x666666, shininess: 50, side: T.DoubleSide });
  K.gloss = new T.MeshPhongMaterial({ vertexColors: true, specular: 0xffffff, shininess: 90, envMap: env, combine: T.AddOperation, reflectivity: 0.12 });
  K.face = new T.MeshPhongMaterial({ vertexColors: true, specular: 0x555555, shininess: 60 });
  K.lensBlue = new T.MeshPhongMaterial({ color: 0xd4ecff, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.2, envMap: env, combine: T.AddOperation, reflectivity: 0.35, depthWrite: false });
  K.lensOrange = new T.MeshPhongMaterial({ color: 0xfff0dc, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.2, envMap: env, combine: T.AddOperation, reflectivity: 0.35, depthWrite: false });
  K.headSkin = HEAD_SHAPES.map(function (hs) { return headSkinGeo(T, hs); });
  K.lens = HEAD_SHAPES.map(function (hs) { return lensGeo(T, hs); });
  K.markGeo = new T.PlaneGeometry(1, 1);
  K.tSplat = tex.splat;
  K.blobMat = new T.MeshBasicMaterial({ map: tex.shadow, transparent: true, depthWrite: false, opacity: 0.5 });
  const torso = torsoGeo(T);
  ["blue", "orange"].forEach(function (team) {
    const C = TEAMS[team];
    K.teams[team] = {
      torso: torso, pelvis: pelvisGeo(T, team), belt: beltGeo(T, team), yoke: yokeGeo(T, team),
      upperArm: upperArmGeo(T, team), foreArm: foreArmGeo(T, team), thigh: thighGeo(T, team), shin: shinGeo(T, team),
      handL: handGeo(T, team), handR: mirrorX(T, handGeo(T, team)), shoe: shoeGeo(T, team), marker: markerGeo(T, team),
      goggles: gogglesGeo(T, HEAD_SHAPES[0], team),
      jerseyMat: new T.MeshPhongMaterial({ map: tex.jersey[team], specular: 0x333333, shininess: 18 })
    };
  });
  return K;
}

/* ---------------- Posing ---------------- */
// Elbow or knee: the joint between A and B for bones l1 and l2, bent toward "pole". B is pulled in if it is out of reach.
function bend(A, B, pole, l1, l2, out) {
  const t = TV;
  t.d.subVectors(B, A);
  let d = t.d.length();
  if (d < 1e-4) { t.d.set(0, -1, 0); d = 1e-4; } else t.d.multiplyScalar(1 / d);
  if (d > (l1 + l2) * 0.999) { d = (l1 + l2) * 0.999; B.copy(A).addScaledVector(t.d, d); }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  t.q.copy(pole).addScaledVector(t.d, -pole.dot(t.d));
  if (t.q.lengthSq() < 1e-6) t.q.set(0, 0, 1);
  t.q.normalize();
  out.copy(A).addScaledVector(t.d, a).addScaledVector(t.q, hgt);
}
// Point a limb piece from A to B with its +z toward "side".
function aimBone(mesh, A, B, side) {
  const t = TV;
  t.y.subVectors(B, A).normalize();
  t.z.copy(side).addScaledVector(t.y, -side.dot(t.y));
  if (t.z.lengthSq() < 1e-6) t.z.set(0, 0, 1);
  t.z.normalize();
  t.x.crossVectors(t.y, t.z);
  t.m.makeBasis(t.x, t.y, t.z);
  mesh.quaternion.setFromRotationMatrix(t.m);
  mesh.position.copy(A);
}
function setLimb(L, A, B, pole, l1, l2, endMesh) {
  const t = TV;
  bend(A, B, pole, l1, l2, t.e);
  aimBone(L.up, A, t.e, pole);
  aimBone(L.lo, t.e, B, pole);
  if (endMesh) { t.p0.subVectors(B, t.e).normalize(); t.p1.copy(B).add(t.p0); aimBone(endMesh, B, t.p1, pole); }
}
const MK_POS = [null, null, null, null], MK_Q = [null, null, null, null];
function poseMarker(T) {
  // marker poses in the upper body's space: aiming, carried at a run, held up when out, waved overhead
  MK_POS[0] = new T.Vector3(-0.085, 0.29, 0.27); MK_Q[0] = new T.Quaternion();
  MK_POS[1] = new T.Vector3(-0.02, 0.25, 0.21); MK_Q[1] = new T.Quaternion().setFromEuler(new T.Euler(-0.55, 0.6, 0.2, "YXZ"));
  MK_POS[2] = new T.Vector3(-0.17, 0.74, 0.02); MK_Q[2] = new T.Quaternion().setFromEuler(new T.Euler(-1.48, 0, 0, "YXZ"));
  MK_POS[3] = new T.Vector3(0.08, 0.82, 0.08); MK_Q[3] = new T.Quaternion().setFromEuler(new T.Euler(-1.2, 0.3, 0.3, "YXZ"));
}

function poseRig(G, c, dt, clock, aimPitch) {
  const t = TV, calm = Shell.reduced;
  const speed = c.gone ? 0 : c.speed, run = clamp(speed / RUN, 0, 1), k = clamp(speed / 1.1, 0, 1);
  G.outK += ((c.out ? 1 : 0) - G.outK) * Math.min(1, dt * 7);
  G.cheerK += ((c.cheer ? 1 : 0) - G.cheerK) * Math.min(1, dt * 6);
  const wantAim = c === S.p || c.fireT > 0 || speed < 2.6 || c.crouch > 0.3 ? 1 : 0;
  G.aimK += (wantAim - G.aimK) * Math.min(1, dt * 8);
  const out = G.outK, cheer = G.cheerK, crouch = c.crouch;
  // which way they are going, in their own space
  const ch = Math.cos(c.h), sh = Math.sin(c.h);
  let lx = ch * c.mvx - sh * c.mvz, lz = sh * c.mvx + ch * c.mvz;
  if (speed < 0.05) { lx = 0; lz = 1; }
  const stride = 0.42 + speed * 0.13;
  G.phase += dt * Math.PI * speed / stride;
  const ph = G.phase;
  // hips
  const hop = cheer * (calm ? 0 : Math.abs(Math.sin(clock * 8.5)) * 0.13);
  const hipY = 0.91 - crouch * 0.42 + k * (0.026 * Math.cos(2 * ph) - 0.012) + hop + (calm ? 0 : Math.sin(clock * 1.9 + G.phase * 0.0) * 0.006 * (1 - k));
  const hipYaw = -Math.sin(ph) * 0.15 * k * (1 - crouch);
  G.pelvis.position.set(0, hipY, -crouch * 0.05);
  G.pelvis.rotation.set(0, hipYaw, 0);
  // legs
  for (let s = 0; s < 2; s++) {
    const sg = s === 0 ? 1 : -1, phs = ph + (s === 0 ? 0 : Math.PI);
    const fwd = Math.cos(phs) * stride * 0.5 * k, lift = Math.max(0, Math.sin(phs)) * (0.07 + 0.11 * run) * k;
    t.b.set(sg * (0.1 + 0.07 * crouch) + lx * fwd, 0.075 + lift + (s === 1 ? 0.07 * crouch : 0) + hop * 0.6,
            lz * fwd + (s === 0 ? 0.2 : -0.24) * crouch * (1 - k));
    t.a.set(sg * 0.1 * Math.cos(hipYaw), hipY - 0.06, -crouch * 0.05 - sg * 0.1 * Math.sin(hipYaw));
    t.p.set(Math.sin(hipYaw) + sg * 0.12, 0.05 + crouch * 0.4, Math.cos(hipYaw));
    setLimb(G.leg[s], t.a, t.b, t.p, TH, SH, null);
    const f = G.leg[s].foot;
    f.position.copy(t.b);
    f.rotation.set(lift > 0.01 ? -lift * 2.2 : (s === 1 ? -0.55 * crouch : 0), hipYaw * 0.4 + sg * 0.06, 0, "YXZ");
  }
  // upper body
  const aimNow = G.aimK, pop = c.duck ? 0 : 1;
  const lean = 0.05 + 0.14 * run * (1 - aimNow * 0.5) + crouch * (0.62 - 0.3 * pop) - out * 0.08 - cheer * 0.1;
  const twist = Math.sin(ph) * 0.1 * k * (1 - aimNow * 0.6) + (calm ? 0 : Math.sin(clock * 9) * 0.25 * cheer);
  G.upper.position.set(0, hipY + 0.045, -crouch * 0.05);
  G.upper.rotation.set(lean, twist, 0, "YXZ");
  G.upper.updateMatrix();
  // head: up and looking where they aim; a sheepish tilt when out
  G.head.rotation.set(-lean * 0.8 - aimPitch * 0.6 + out * 0.25, -twist * 0.7, out * 0.15, "YXZ");
  // the marker: blend between aiming, carrying, holding it up (out) and waving it (cheer)
  const wAim = aimNow * (1 - out) * (1 - cheer), wRun = (1 - aimNow) * (1 - out) * (1 - cheer), wOut = out * (1 - cheer), wCheer = cheer;
  t.v.set(0, 0, 0).addScaledVector(MK_POS[0], wAim).addScaledVector(MK_POS[1], wRun).addScaledVector(MK_POS[2], wOut).addScaledVector(MK_POS[3], wCheer);
  t.v.z -= c.recoil * 0.035;
  G.marker.position.copy(t.v);
  t.qa.setFromEuler(t.eu.set(-(aimPitch - lean) * wAim - (aimPitch - lean) * 0.5 * wRun, 0, 0, "YXZ"));
  t.qb.copy(MK_Q[0]).multiply(t.qa);
  if (wRun > 0.001) t.qb.slerp(MK_Q[1], wRun / Math.max(1e-4, wAim + wRun));
  if (wOut > 0.001) t.qb.slerp(MK_Q[2], wOut);
  if (wCheer > 0.001) t.qb.slerp(MK_Q[3], wCheer);
  G.marker.quaternion.copy(t.qb);
  G.marker.updateMatrix();
  // arms: right hand on the grip, left on the foregrip (or up in the air when out)
  for (let s = 0; s < 2; s++) {
    const sg = s === 0 ? 1 : -1;
    t.a.set(sg * 0.175, 0.44, -0.01).applyMatrix4(G.upper.matrix);
    if (s === 1) t.b.set(0, -0.058, -0.035);
    else t.b.set(0.002, -0.045, 0.165);
    t.b.applyMatrix4(G.marker.matrix);
    if (s === 0 && out > 0) { t.c.set(0.24, 0.98, 0.1); t.b.lerp(t.c, out); }
    t.b.applyMatrix4(G.upper.matrix);
    // elbows hang down and out
    t.p.set(sg * 0.65, -0.7, -0.35 + out * 0.3).applyAxisAngle(t.upv, G.upper.rotation.y);
    setLimb(G.arm[s], t.a, t.b, t.p, UA, FA, G.arm[s].hand);
  }
  // splats on them
  const n = c.marks.length;
  if (n !== G.markN) {
    G.markN = n;
    for (let i = 0; i < G.marks.length; i++) {
      const m = G.marks[i], mk = c.marks[i];
      if (!mk) { m.visible = false; if (m.parent) m.parent.remove(m); continue; }
      const fz = mk.front ? 1 : -1, sz = mk.part === 0 ? 0.13 : mk.part === 3 ? 0.17 : 0.2;
      let parent = G.upper, x = mk.side * 0.06, y = 0.3, z = fz * 0.128;
      if (mk.part === 0) { parent = G.head; x = mk.side * 0.035; y = HEAD.cy + 0.035; z = HEAD.cz + fz * 0.105; }
      else if (mk.part === 2) { y = 0.1; z = fz * 0.13; }
      else if (mk.part === 3) { parent = G.pelvis; y = -0.04; z = fz * 0.13; x = mk.side * 0.07; }
      parent.add(m);
      m.position.set(x, y, z); m.rotation.set(0, mk.front ? 0 : Math.PI, mk.spin);
      m.scale.set(sz, sz, 1); m.material.color.set(mk.col); m.visible = true;
    }
  }
}

/* ---------------- Scene ---------------- */
// A batch of flat textured quads in one geometry: [x, y, z, w, h, ry] each, facing +z before the turn.
function quads(T, list) {
  const pos = [], nor = [], uv = [], idx = [];
  list.forEach(function (q, i) {
    const c = Math.cos(q[5]), s = Math.sin(q[5]), hw = q[3] / 2;
    [[-hw, 0, 0, 0], [hw, 0, 1, 0], [hw, q[4], 1, 1], [-hw, q[4], 0, 1]].forEach(function (p) {
      pos.push(q[0] + c * p[0], q[1] + p[1], q[2] - s * p[0]); nor.push(s, 0, c); uv.push(p[2], p[3]);
    });
    const o = i * 4; idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
function heightUV(g, h) { const P = g.attributes.position, U = g.attributes.uv; for (let i = 0; i < P.count; i++) U.setY(i, clamp(P.getY(i) / h, 0, 1)); U.needsUpdate = true; return g; }

function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x8cc8ff, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = (parseInt(T.REVISION, 10) || 0) >= 182 ? T.PCFShadowMap : T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.fog = new T.Fog(0xcfe6ff, 80, 300);
  const camera = new T.PerspectiveCamera(CAM.fov, W / H, 0.1, 700);
  const caps = renderer.capabilities;
  const aniso = Math.min(8, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  TV = { a: new T.Vector3(), b: new T.Vector3(), c: new T.Vector3(), d: new T.Vector3(), e: new T.Vector3(), p: new T.Vector3(), q: new T.Vector3(),
         s: new T.Vector3(), v: new T.Vector3(), x: new T.Vector3(), y: new T.Vector3(), z: new T.Vector3(), p0: new T.Vector3(), p1: new T.Vector3(),
         upv: new T.Vector3(0, 1, 0), m: new T.Matrix4(), qa: new T.Quaternion(), qb: new T.Quaternion(), eu: new T.Euler() };
  poseMarker(T);

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
  const tSplat = tex(splatCanvas()), tShadow = tex(shadowCanvas()), tGlow = tex(glowCanvas());
  function lit(m, cast, recv) { m.castShadow = !!cast; m.receiveShadow = !!recv; return m; }
  function decal(mat, order) { mat.transparent = true; mat.depthWrite = false; mat.polygonOffset = true; mat.polygonOffsetFactor = -1 - order; mat._order = order; return mat; }
  const unit = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const fake = [];                                         // painted shadows, shown only when shadow maps are off
  const blobMat = new T.MeshBasicMaterial({ map: tShadow, transparent: true, depthWrite: false, opacity: 0.42 });
  function fakeShadow(parent, x, z, sx, sz, rot) {
    const m = new T.Mesh(unit, blobMat); m.position.set(x, 0.03, z); m.scale.set(sx, 1, sz); m.rotation.y = rot || 0; m.renderOrder = 1; m.visible = false;
    parent.add(m); fake.push(m); return m;
  }

  /* lights */
  const hemi = new T.HemisphereLight(0xe6f3ff, 0x5f9a4a, 1.25); scene.add(hemi);
  const key = new T.DirectionalLight(0xfff1d6, 2.5);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera; sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 10; sc.far = 220; sc.updateProjectionMatrix();
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03;
  scene.add(key); scene.add(key.target);
  const fill = new T.DirectionalLight(0xdfeaff, 0.5); fill.position.set(40, 60, 90); scene.add(fill);

  /* sky, the tree line, the park */
  const skyTex = {}; Object.keys(SKIES).forEach(function (k) { skyTex[k] = tex(skyCanvas(k)); });
  const skyMat = new T.MeshBasicMaterial({ map: skyTex.morning, side: T.BackSide, depthWrite: false, fog: false });
  const sky = new T.Mesh(new T.SphereGeometry(400, 32, 16), skyMat); sky.renderOrder = -2; scene.add(sky);
  const lineGeo = new T.CylinderGeometry(170, 170, 34, 48, 1, true);
  (function () { const uv = lineGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 7); })();
  const tLine = tex(treeLineCanvas(false), true), tLineDark = tex(treeLineCanvas(true), true);
  const treeLine = new T.Mesh(lineGeo, new T.MeshBasicMaterial({ map: tLine, side: T.BackSide, transparent: true, alphaTest: 0.4, fog: false }));
  treeLine.position.y = 16; scene.add(treeLine);
  const grass = new T.Mesh(new T.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ map: tex(grassCanvas(), true) }));
  (function () { const uv = grass.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 700 / 9, uv.getY(i) * 700 / 9); })();
  grass.position.y = -0.02; lit(grass, false, true); scene.add(grass);
  const turf = new T.Mesh(new T.PlaneGeometry((FX + 1.5) * 2, (FZ + 1.5) * 2).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ map: tex(turfCanvas()) }));
  turf.position.y = 0.0; lit(turf, false, true); scene.add(turf);
  // the wordmark mown into the middle of the field
  const mown = tex(tintScript(script, "#5fdc6e", 0.7));
  const mw = 13, mh = mw * script.height / script.width;
  const mownM = new T.Mesh(new T.PlaneGeometry(mw, mh).rotateX(-Math.PI / 2), decal(new T.MeshLambertMaterial({ map: mown }), 1));
  mownM.position.set(0, 0.012, 0); mownM.rotation.y = Math.PI; mownM.renderOrder = 1; scene.add(lit(mownM, false, true));
  // base pads
  [[HOME, "#1f5fe0", "#0b1f5e", "HOME BASE", 0], [AWAY, "#ff7a1a", "#5a2400", "ORANGE BASE", Math.PI]].forEach(function (b) {
    const m = new T.Mesh(new T.PlaneGeometry(5.6, 5.6).rotateX(-Math.PI / 2), decal(new T.MeshLambertMaterial({ map: tex(padCanvas(script, b[1], b[2], b[3])) }), 1));
    m.position.set(b[0].x, 0.014, b[0].z); m.rotation.y = b[4] + Math.PI; m.renderOrder = 1; scene.add(lit(m, false, true));
  });

  /* trees around the park */
  (function () {
    const n = 70, rnd = rng(19);
    const trunkG = new T.CylinderGeometry(0.22, 0.32, 3, 7); trunkG.translate(0, 1.5, 0);
    const crownG = new T.IcosahedronGeometry(1, 1);
    const trunks = new T.InstancedMesh(trunkG, new T.MeshLambertMaterial({ color: 0x6a4a2a }), n);
    const crowns = new T.InstancedMesh(crownG, new T.MeshLambertMaterial({ color: 0xffffff }), n * 2);
    const m = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3(), col = new T.Color();
    for (let i = 0; i < n; i++) {
      let x, z;
      do { x = (rnd() - 0.5) * 220; z = (rnd() - 0.5) * 240; } while (Math.abs(x) < FX + 12 && Math.abs(z) < FZ + 16);
      const sz = 0.8 + rnd() * 0.7;
      trunks.setMatrixAt(i, m.compose(p.set(x, 0, z), q.identity(), s.set(sz, sz, sz)));
      for (let k = 0; k < 2; k++) {
        crowns.setMatrixAt(i * 2 + k, m.compose(p.set(x + (k ? 0.8 : -0.5) * sz, (3.6 + k * 1.3) * sz, z + (k ? 0.3 : -0.4) * sz), q.identity(), s.set(2.2 * sz, 2 * sz, 2.2 * sz)));
        crowns.setColorAt(i * 2 + k, col.set(["#2f8a3a", "#3a9a40", "#246e30", "#4aa848"][(rnd() * 4) | 0]));
      }
    }
    trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true;
    crowns.instanceColor.needsUpdate = true;
    lit(trunks, true, false); lit(crowns, true, false);
    scene.add(trunks); scene.add(crowns);
  })();

  /* netting, its posts, the banners along the bottom */
  const NX = FX + 1, NZ = FZ + 1, NET_H = 6;
  const tNet = tex(netCanvas(), true);
  const netMat = new T.MeshBasicMaterial({ map: tNet, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false });
  [[0, -NZ, NX * 2, 0], [0, NZ, NX * 2, Math.PI], [-NX, 0, NZ * 2, Math.PI / 2], [NX, 0, NZ * 2, -Math.PI / 2]].forEach(function (s) {
    const g = new T.PlaneGeometry(s[2], NET_H);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s[2] / 0.45, uv.getY(i) * NET_H / 0.45);
    const m = new T.Mesh(g, netMat); m.position.set(s[0], NET_H / 2, s[1]); m.rotation.y = s[3]; m.renderOrder = 4; scene.add(m);
  });
  (function () {
    const posts = [];
    for (let x = -NX; x <= NX + 0.01; x += (NX * 2) / 7) { posts.push([x, -NZ], [x, NZ]); }
    for (let z = -NZ + (NZ * 2) / 11; z < NZ - 0.01; z += (NZ * 2) / 11) { posts.push([-NX, z], [NX, z]); }
    const g = new T.CylinderGeometry(0.08, 0.1, NET_H + 0.3, 8); g.translate(0, (NET_H + 0.3) / 2, 0);
    const im = new T.InstancedMesh(g, new T.MeshPhongMaterial({ color: 0x2b3240, specular: 0x888888, shininess: 50 }), posts.length);
    const m = new T.Matrix4();
    posts.forEach(function (p, i) { im.setMatrixAt(i, m.makeTranslation(p[0], 0, p[1])); });
    im.instanceMatrix.needsUpdate = true; lit(im, true, false); scene.add(im);
    // banners: inside of the netting, all the way round, three designs in turn
    const lists = [[], [], []], BW = 6.2, BH = 1.2, Y0 = 0.25;
    let k = 0;
    function run(x0, z0, x1, z1, ry) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / (BW + 0.5));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u;
        if (Math.abs(x) < 3.5 && Math.abs(Math.abs(z) - NZ) < 0.1) continue;     // the gap behind each flag stand
        lists[k++ % 3].push([x, Y0, z, BW, BH, ry]);
      }
    }
    run(-NX, -NZ + 0.06, NX, -NZ + 0.06, 0);
    run(NX, NZ - 0.06, -NX, NZ - 0.06, Math.PI);
    run(-NX + 0.06, NZ, -NX + 0.06, -NZ, Math.PI / 2);
    run(NX - 0.06, -NZ, NX - 0.06, NZ, -Math.PI / 2);
    lists.forEach(function (L, i) {
      const m = new T.Mesh(quads(T, L), new T.MeshLambertMaterial({ map: tex(bannerCanvas(script, i)), side: T.DoubleSide }));
      scene.add(lit(m, false, true));
    });
  })();

  /* scoreboards behind each end, both showing the LED ribbon */
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas());
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
      "  vec2 c0 = (floor(cell) + 0.5) * px;",
      "  vec3 led = texture2D(tLed, c0).rgb;",
      "  vec3 halo = led;",
      "  halo += texture2D(tLed, c0 + px * vec2( 1.5,  1.5)).rgb + texture2D(tLed, c0 + px * vec2(-1.5,  1.5)).rgb;",
      "  halo += texture2D(tLed, c0 + px * vec2( 1.5, -1.5)).rgb + texture2D(tLed, c0 + px * vec2(-1.5, -1.5)).rgb;",
      "  halo += texture2D(tLed, c0 + px * vec2( 3.0,  0.0)).rgb + texture2D(tLed, c0 + px * vec2(-3.0,  0.0)).rgb;",
      "  halo += texture2D(tLed, c0 + px * vec2( 0.0,  3.0)).rgb + texture2D(tLed, c0 + px * vec2( 0.0, -3.0)).rgb;",
      "  halo /= 9.0;",
      "  float lens = texture2D(tDot, cell).r;",
      "  vec3 col = led * lens * 1.45 + halo * 0.38 + vec3(0.030, 0.034, 0.046) * lens + vec3(0.005, 0.006, 0.010);",
      "  gl_FragColor = vec4(col, 1.0);",
      "  #include <" + csChunk + ">",
      "}"
    ].join("\n"),
    fog: false
  });
  const LW = 30, LH = LW * LED_ROWS / LED_COLS;
  const boardTop = new T.MeshBasicMaterial({ map: tex(boardCanvas(script)) });
  const frameMat = new T.MeshPhongMaterial({ color: 0x16245e, specular: 0x666666, shininess: 40 });
  const orangeMat = new T.MeshLambertMaterial({ color: 0xff9214 });
  [[-(FZ + 9), 0], [FZ + 9, Math.PI]].forEach(function (b) {
    const g = new T.Group(); g.position.set(0, 0, b[0]); g.rotation.y = b[1];
    const housing = new T.Mesh(roundBox(T, LW + 1.2, 9.2, 0.9, 0.2), frameMat); housing.position.set(0, 9.7, -0.5); g.add(lit(housing, true, false));
    const led = new T.Mesh(new T.PlaneGeometry(LW, LH), ledMat); led.position.set(0, 6.9, 0.0); g.add(led);
    const top = new T.Mesh(new T.PlaneGeometry(LW * 0.62, LW * 0.62 / 4), boardTop); top.position.set(0, 11.2, 0.0); g.add(top);
    const trim = new T.Mesh(roundBox(T, LW + 1.6, 0.35, 1.1, 0.12), orangeMat); trim.position.set(0, 14.35, -0.5); g.add(trim);
    [-LW * 0.35, LW * 0.35].forEach(function (x) { const leg = new T.Mesh(new T.CylinderGeometry(0.35, 0.45, 5.2, 10), frameMat); leg.position.set(x, 2.6, -0.5); g.add(lit(leg, true, false)); });
    scene.add(g);
  });

  /* light towers for the night game */
  const towers = new T.Group(); scene.add(towers);
  const lampMat = new T.MeshBasicMaterial({ map: tex(lampCanvas()), fog: false });
  const glowMat = new T.SpriteMaterial({ map: tGlow, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85, fog: false });
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
    const g = new T.Group(); g.position.set(c[0] * (NX + 5), 0, c[1] * (NZ - 8)); g.rotation.y = Math.atan2(-c[0], -c[1] * 0.4);
    const pole = new T.Mesh(new T.CylinderGeometry(0.3, 0.5, 18, 8), frameMat); pole.position.y = 9; g.add(pole);
    const bank = new T.Mesh(new T.BoxGeometry(4.4, 2.2, 0.4), [frameMat, frameMat, frameMat, frameMat, lampMat, frameMat]); bank.position.set(0, 18, 0.3); g.add(bank);
    const glow = new T.Sprite(glowMat); glow.scale.set(16, 11, 1); glow.position.set(0, 18, 1.2); g.add(glow);
    towers.add(g);
  });

  /* bases: flag stands, the station at home, the orange team's tent */
  const poleMat = new T.MeshPhongMaterial({ color: 0xf2f2f2, specular: 0xffffff, shininess: 90 });
  const stands = [];
  [[HOME, 0x1f5fe0], [AWAY, 0xff7a1a]].forEach(function (b) {
    const g = new T.Group(); g.position.set(b[0].x, 0, b[0].z);
    const base = new T.Mesh(new T.CylinderGeometry(0.34, 0.42, 0.18, 20), new T.MeshPhongMaterial({ color: b[1], specular: 0xffffff, shininess: 80 })); base.position.y = 0.09; g.add(lit(base, true, true));
    const pole = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 3.3, 10), poleMat); pole.position.y = 1.65; g.add(lit(pole, true, false));
    const knob = new T.Mesh(new T.SphereGeometry(0.08, 12, 8), new T.MeshPhongMaterial({ color: 0xffd21f, specular: 0xffffff, shininess: 100 })); knob.position.y = 3.33; g.add(lit(knob, true, false));
    scene.add(g); stands.push(g);
  });
  // the station: a table of pods, and a ring that says "come here"
  const station = new T.Group(); station.position.set(-2.6, 0, HOME.z + 1.4); scene.add(station);
  (function () {
    const top = new T.Mesh(roundBox(T, 1.5, 0.08, 0.7, 0.03), new T.MeshPhongMaterial({ color: 0x1f5fe0, specular: 0x999999, shininess: 60 })); top.position.y = 0.78; station.add(lit(top, true, true));
    [[-0.65, -0.28], [0.65, -0.28], [-0.65, 0.28], [0.65, 0.28]].forEach(function (p) { const l = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.78, 6), frameMat); l.position.set(p[0], 0.39, p[1]); station.add(l); });
    const podMat = new T.MeshPhongMaterial({ color: 0xffe600, specular: 0xffffff, shininess: 80, transparent: true, opacity: 0.88 });
    for (let i = 0; i < 6; i++) { const p = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 0.26, 12), podMat); p.position.set(-0.5 + i * 0.2, 0.95, (i % 2) * 0.12 - 0.06); station.add(lit(p, true, false)); }
    const sign = new T.Mesh(new T.PlaneGeometry(1.4, 0.35), new T.MeshBasicMaterial({ map: tex((function () { const c = mkCanvas(512, 128), g = c.getContext("2d"); g.fillStyle = "#0b1f5e"; g.fillRect(0, 0, 512, 128); candyText(g, "PAINT UP", 256, 64, 64, 480); return c; })()) }));
    sign.position.set(0, 1.35, 0.1); sign.rotation.y = Math.PI; station.add(sign);
  })();
  const ringMat = decal(new T.MeshBasicMaterial({ color: 0x3ff0ff, opacity: 0.5 }), 2);
  const ring = new T.Mesh(new T.RingGeometry(STATION_R - 0.2, STATION_R, 48).rotateX(-Math.PI / 2), ringMat); ring.position.set(HOME.x, 0.02, HOME.z + 0.2); ring.renderOrder = 2; scene.add(ring);
  (function () {                                            // the orange team's canopy behind their stand
    const g = new T.Group(); g.position.set(0, 0, AWAY.z - 2.6); scene.add(g);
    const roof = new T.Mesh(new T.ConeGeometry(2.6, 1.0, 4, 1, true), new T.MeshLambertMaterial({ map: tex(tentCanvas(script)), side: T.DoubleSide }));
    roof.position.y = 2.8; roof.rotation.y = Math.PI / 4; g.add(lit(roof, true, false));
    [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].forEach(function (p) { const l = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 2.3, 6), poleMat); l.position.set(p[0], 1.15, p[1]); g.add(lit(l, true, false)); });
    const cooler = new T.Mesh(roundBox(T, 0.7, 0.45, 0.45, 0.06), new T.MeshPhongMaterial({ color: 0xff3fa4, specular: 0xffffff, shininess: 70 })); cooler.position.set(1.0, 0.225, -0.6); g.add(lit(cooler, true, true));
  })();
  // the flag: your team's flag, wherever it is
  const flag = new T.Group(); scene.add(flag);
  const flagPole = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 1.6, 8), poleMat); flagPole.position.y = 0.8; flag.add(lit(flagPole, true, false));
  const FLAG_W = 1.15, FLAG_H = 0.72;
  const flagGeo = new T.PlaneGeometry(FLAG_W, FLAG_H, 12, 3); flagGeo.translate(FLAG_W / 2 + 0.03, 1.6 - FLAG_H / 2 - 0.04, 0);
  const flagBase = Float32Array.from(flagGeo.attributes.position.array);
  const cloth = new T.Mesh(flagGeo, new T.MeshLambertMaterial({ map: tex(flagCanvas(script)), side: T.DoubleSide })); flag.add(lit(cloth, true, false));
  const flagGlow = new T.Mesh(new T.RingGeometry(0.9, 1.15, 40).rotateX(-Math.PI / 2), decal(new T.MeshBasicMaterial({ color: 0x3ff0ff, opacity: 0.6 }), 2));
  flagGlow.renderOrder = 2; scene.add(flagGlow);

  /* cover, one set per arena */
  const vinyl = {}, brickT = {}, snakeT = {}, barrelT = {};
  Object.keys(INFL).forEach(function (c) {
    vinyl[c] = [2, 3].map(function (n) { return new T.MeshPhongMaterial({ map: tex(vinylCanvas(script, c, n)), specular: 0xffffff, shininess: 85, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12 }); });
    brickT[c] = new T.MeshPhongMaterial({ map: tex(brickCanvas(script, c)), specular: 0xffffff, shininess: 85, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12 });
    snakeT[c] = new T.MeshPhongMaterial({ map: tex(snakeCanvas(c)), specular: 0xffffff, shininess: 85, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12 });
    barrelT[c] = new T.MeshPhongMaterial({ map: tex(barrelCanvas(script, c)), specular: 0xaaaaaa, shininess: 60 });
  });
  const plain = {}; Object.keys(INFL).forEach(function (c) { plain[c] = new T.MeshPhongMaterial({ color: INFL[c][0], specular: 0xffffff, shininess: 85, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12 }); });
  const crateMat = new T.MeshLambertMaterial({ map: tex(crateCanvas(script)) });
  const plyMat = new T.MeshLambertMaterial({ map: tex(plywoodCanvas(script)) });
  const woodMat = new T.MeshLambertMaterial({ color: 0xc99a5e });
  const capMat = new T.MeshPhongMaterial({ color: 0x2a2e38, specular: 0x999999, shininess: 60 });
  const geoCache = {};
  function canGeo(r, h) {
    const k = "can" + r + h; if (geoCache[k]) return geoCache[k];
    return (geoCache[k] = heightUV(new T.LatheGeometry([[0, 0], [r * 0.86, 0], [r * 0.99, 0.06], [r * 1.03, 0.2], [r * 1.05, h * 0.5], [r * 1.02, h - 0.2], [r * 0.95, h - 0.08], [r * 0.7, h - 0.01], [0, h]].map(function (p) { return new T.Vector2(p[0], p[1]); }), 30), h));
  }
  function doritoGeo(r, h) {
    const k = "dor" + r + h; if (geoCache[k]) return geoCache[k];
    const g = new T.LatheGeometry([[0, 0], [r * 0.95, 0], [r, 0.06], [r * 0.97, 0.22], [r * 0.74, h * 0.5], [r * 0.4, h * 0.82], [r * 0.14, h * 0.97], [0, h]].map(function (p) { return new T.Vector2(p[0], p[1]); }), 36);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i), a = Math.atan2(x, z), f = 1 + 0.17 * Math.cos(3 * a); P.setX(i, x * f); P.setZ(i, z * f); }
    weldNormals(g);
    return (geoCache[k] = heightUV(g, h));
  }
  function snakeGeo(len) {
    const k = "sn" + len; if (geoCache[k]) return geoCache[k];
    const prof = [[0, 0]];
    for (let i = 0; i <= 24; i++) { const y = 0.25 + (len - 0.5) * i / 24; prof.push([0.62 * (1 - 0.06 * Math.abs(Math.sin(i * Math.PI / 3))), y]); }
    prof.splice(1, 0, [0.45, 0.04], [0.58, 0.13]);
    prof.push([0.58, len - 0.13], [0.45, len - 0.04], [0, len]);
    const g = new T.LatheGeometry(prof.map(function (p) { return new T.Vector2(p[0], p[1]); }), 22);
    g.translate(0, -len / 2, 0); g.rotateZ(-Math.PI / 2);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) P.setY(i, Math.max(P.getY(i), -0.56) + 0.6);
    weldNormals(g);
    return (geoCache[k] = g);
  }
  function barrelGeo() {
    if (geoCache.barrel) return geoCache.barrel;
    return (geoCache.barrel = heightUV(new T.LatheGeometry([[0, 0], [0.3, 0], [0.32, 0.03], [0.33, 0.2], [0.36, 0.5], [0.33, 0.82], [0.32, 0.99], [0.29, 1.02], [0, 1.02]].map(function (p) { return new T.Vector2(p[0], p[1]); }), 24), 1.02));
  }
  function buildCover(list) {
    const grp = new T.Group();
    list.forEach(function (o, n) {
      const g = new T.Group(); g.position.set(o.x, 0, o.z); g.rotation.y = o.rot;
      let m;
      if (o.k === "can") { m = new T.Mesh(canGeo(o.r, o.h), vinyl[o.col][0]); fakeShadow(grp, o.x + 0.3, o.z - 0.2, o.r * 3.2, o.r * 3.2); }
      else if (o.k === "dorito") { m = new T.Mesh(doritoGeo(o.r, o.h), vinyl[o.col][1]); fakeShadow(grp, o.x + 0.3, o.z - 0.2, o.r * 3.2, o.r * 3.2); }
      else if (o.k === "snake") { m = new T.Mesh(snakeGeo(o.len), snakeT[o.col]); fakeShadow(grp, o.x, o.z, o.len * 1.15, 1.9, o.rot); }
      else if (o.k === "brick") {
        m = new T.Mesh(roundBox(T, o.hx * 2, o.h, o.hz * 2, 0.24), [plain[o.col], plain[o.col], plain[o.col], plain[o.col], brickT[o.col], brickT[o.col]]);
        m.position.y = o.h / 2; fakeShadow(grp, o.x, o.z, o.hx * 2.8, o.hz * 3.4, o.rot);
      } else if (o.k === "crate") {
        for (let i = 0; i < o.n; i++) {
          const c = new T.Mesh(roundBox(T, o.size, o.size, o.size, 0.03), crateMat);
          c.position.y = o.size * (i + 0.5); c.rotation.y = i * 0.18; g.add(lit(c, true, true));
        }
        fakeShadow(grp, o.x, o.z, o.size * 2, o.size * 2, o.rot);
      } else if (o.k === "barrel") { m = new T.Mesh(barrelGeo(), barrelT[o.col]); const cap = new T.Mesh(new T.CylinderGeometry(0.29, 0.29, 0.02, 20), capMat); cap.position.y = 1.02; g.add(lit(cap, false, true)); fakeShadow(grp, o.x, o.z, 1.1, 1.1); }
      else if (o.k === "wall") {
        m = new T.Mesh(roundBox(T, o.hx * 2, o.h, o.hz * 2, 0.02), [woodMat, woodMat, woodMat, woodMat, plyMat, plyMat]); m.position.y = o.h / 2;
        [-1, 1].forEach(function (s) { const br = new T.Mesh(roundBox(T, 0.1, 1.4, 0.9, 0.02), woodMat); br.position.set(s * (o.hx - 0.3), 0.7, 0); g.add(lit(br, true, true)); });
        fakeShadow(grp, o.x, o.z, o.hx * 2.4, 1.6, o.rot);
      }
      if (m) g.add(lit(m, true, true));
      grp.add(g);
    });
    grp.visible = false;
    scene.add(grp);
    return grp;
  }
  const arenaGroups = ARENAS.map(function (a) { return buildCover(a.cover); });

  /* people */
  const jersey = {
    blue: tex(jerseyCanvas(script, TEAMS.blue.jersey, TEAMS.blue.trim, TEAMS.blue.trim2, "1", "#ffe45c")),
    orange: tex(jerseyCanvas(script, TEAMS.orange.jersey, TEAMS.orange.trim, TEAMS.orange.trim2, "", "#ffffff"))
  };
  const K = buildPeopleKit(T, script, { splat: tSplat, shadow: tShadow, jersey: jersey }, tEnv);
  ["blue", "orange"].forEach(function (team) { K.teams[team].goggles = HEAD_SHAPES.map(function (hs) { return gogglesGeo(T, hs, team); }); });
  // numbered jerseys for the orange squad
  const oj = [2, 3, 4, 5, 6, 7].map(function (n) {
    return new T.MeshPhongMaterial({ map: tex(jerseyCanvas(script, TEAMS.orange.jersey, TEAMS.orange.trim, TEAMS.orange.trim2, String(n * 3 + 1), "#ffffff")), specular: 0x333333, shininess: 18 });
  });
  function person(team, i) {
    const who = PEOPLE[i], hs = HEAD_SHAPES[who.head];
    const kit = K.teams[team];
    const saveG = kit.goggles; kit.goggles = saveG[who.head];
    const saveJ = kit.jerseyMat; if (team === "orange") kit.jerseyMat = oj[(i - 1) % oj.length];
    const G = makePerson(T, K, team, who, hs);
    kit.goggles = saveG; kit.jerseyMat = saveJ;
    G.root.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    scene.add(G.root); scene.add(G.blob);
    return G;
  }
  const playerRig = person("blue", 0);
  const foeRigs = [1, 2, 3, 4, 5, 6].map(function (i) { return person("orange", i); });

  /* paintballs in the air and the paint they leave */
  const ballMesh = new T.InstancedMesh(new T.SphereGeometry(0.068, 10, 8), new T.MeshBasicMaterial({ color: 0xffffff }), 100);
  ballMesh.count = 0; ballMesh.frustumCulled = false; scene.add(ballMesh);
  ballMesh.setColorAt(0, new T.Color(1, 1, 1)); ballMesh.instanceColor.needsUpdate = true;
  const SPLATS = 320;
  const splatMesh = new T.InstancedMesh(new T.PlaneGeometry(1, 1), new T.MeshLambertMaterial({ map: tSplat, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -2 }), SPLATS);
  splatMesh.count = 0; splatMesh.frustumCulled = false; splatMesh.renderOrder = 3; scene.add(splatMesh);
  splatMesh.setColorAt(0, new T.Color(1, 1, 1)); splatMesh.instanceColor.needsUpdate = true;
  /* paint pods left on the ground */
  const podMeshes = [];
  for (let i = 0; i < 4; i++) {
    const g = new T.Group();
    const pod = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.3, 12), new T.MeshPhongMaterial({ color: 0xffe600, emissive: 0x4a3a00, specular: 0xffffff, shininess: 90 }));
    pod.position.y = 0.45; pod.rotation.z = 0.5; g.add(pod);
    const cap = new T.Mesh(new T.CylinderGeometry(0.065, 0.065, 0.05, 12), capMat); cap.position.set(0.075, 0.58, 0); cap.rotation.z = 0.5; g.add(cap);
    const rg = new T.Mesh(new T.RingGeometry(0.42, 0.52, 28).rotateX(-Math.PI / 2), decal(new T.MeshBasicMaterial({ color: 0xffe600, opacity: 0.7 }), 2)); rg.position.y = 0.02; rg.renderOrder = 2; g.add(rg);
    g.visible = false; scene.add(g); podMeshes.push(g);
  }

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, script: script, hemi: hemi, key: key, fill: fill, sky: skyMat, skyTex: skyTex,
    treeLine: treeLine, tLine: tLine, tLineDark: tLineDark, towers: towers, arenaGroups: arenaGroups, shownArena: -1, fake: fake,
    playerRig: playerRig, foeRigs: foeRigs, flag: flag, flagPole: flagPole, cloth: cloth, flagGeo: flagGeo, flagBase: flagBase, flagGlow: flagGlow, stands: stands,
    ballMesh: ballMesh, splatMesh: splatMesh, splatN: 0, splatHead: 0, splatReset: -1, podMeshes: podMeshes, ringMat: ringMat,
    camPos: new T.Vector3(0, 3, 36), camTgt: new T.Vector3(0, 1, 20), camReady: false, mtx: new T.Matrix4(), qq: new T.Quaternion(), vv: new T.Vector3(), ss: new T.Vector3(),
    nz: new T.Vector3(0, 0, 1), nrm: new T.Vector3(), qs: new T.Quaternion(), col: new T.Color(), v: new T.Vector3(), v2: new T.Vector3(),
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0, debugCam: null,
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, shadowsOn: true, shadowSize: 2048, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
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
// Field point -> HUD pixels.
function toScreen(x, y, z) {
  R.v.set(x, y, z).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1 };
}

/* ---------------- Game state -> meshes ---------------- */
function showArena(i) {
  const A = ARENAS[i], P = SKIES[A.sky];
  R.shownArena = i;
  R.arenaGroups.forEach(function (g, k) { g.visible = k === i; });
  R.sky.map = R.skyTex[A.sky]; R.sky.needsUpdate = true;
  R.hemi.color.setHex(P.hemi[0]); R.hemi.groundColor.setHex(P.hemi[1]); R.hemi.intensity = P.hemi[2];
  R.key.color.setHex(P.key[0]); R.key.intensity = P.key[1]; R.keyDir = P.keyPos;
  R.scene.fog.color.setHex(P.fog);
  R.fill.intensity = P.lamps ? 0.9 : 0.5;
  R.towers.visible = !!P.lamps;
  R.treeLine.material.map = P.lamps ? R.tLineDark : R.tLine; R.treeLine.material.needsUpdate = true;
  R.renderer.setClearColor(P.clear, 1);
  R.ringMat.opacity = P.lamps ? 0.8 : 0.5;
  R.splatMesh.count = 0; R.splatN = 0; R.splatHead = 0;
  R.dirty = true;
}

const CAMV = {};
function syncScene(state, fdt) {
  const idle = state === "title" || state === "over", calm = Shell.reduced;
  const p = S.p, T = R.T;
  R.clock += fdt;
  ledTick(fdt);
  if (R.shownArena !== S.arena) showArena(S.arena);

  /* splats: new ones go into the ring */
  if (R.splatReset !== V.splatReset) { R.splatReset = V.splatReset; R.splatMesh.count = 0; R.splatN = 0; R.splatHead = 0; }
  while (V.splats.length) {
    const s = V.splats.shift(), i = R.splatHead;
    R.nrm.set(s.nx, s.ny, s.nz).normalize();
    R.qq.setFromUnitVectors(R.nz, R.nrm);
    R.qs.setFromAxisAngle(R.nz, Math.random() * TAU); R.qq.multiply(R.qs);
    R.vv.set(s.x + s.nx * 0.012, Math.max(0.016, s.y + s.ny * 0.012), s.z + s.nz * 0.012);
    R.splatMesh.setMatrixAt(i, R.mtx.compose(R.vv, R.qq, R.ss.set(s.s, s.s, s.s)));
    R.splatMesh.setColorAt(i, R.col.set(s.col));
    R.splatHead = (i + 1) % R.splatMesh.instanceMatrix.count;
    R.splatN = Math.min(R.splatN + 1, R.splatMesh.instanceMatrix.count);
    R.splatMesh.count = R.splatN;
    R.splatMesh.instanceMatrix.needsUpdate = true; R.splatMesh.instanceColor.needsUpdate = true;
  }
  /* paintballs */
  const bm = R.ballMesh;
  let nb = 0;
  for (let i = 0; i < S.balls.length && nb < 100; i++) {
    const b = S.balls[i];
    bm.setMatrixAt(nb, R.mtx.makeTranslation(b.x, b.y, b.z));
    bm.setColorAt(nb, R.col.set(paintOf(b.team)));
    nb++;
  }
  bm.count = nb;
  if (nb) { bm.instanceMatrix.needsUpdate = true; bm.instanceColor.needsUpdate = true; }

  /* people */
  const rigs = [R.playerRig].concat(R.foeRigs), chars = [p].concat(S.foes);
  for (let i = 0; i < rigs.length; i++) {
    const G = rigs[i], c = chars[i];
    const show = !!c && !c.gone;
    G.root.visible = show; G.blob.visible = show && !R.shadowsOn;
    if (!show) continue;
    G.root.position.set(c.x, 0, c.z); G.root.rotation.y = c.h;
    // blink when they have just come back in
    G.root.visible = !(c.safe > 0 && !calm && Math.floor(R.clock * 12) % 2 === 0 && state === "playing");
    let ap = c === p ? p.pitch : 0;
    if (c !== p && c.ai && c.ai.see && !c.out) { const d = Math.hypot(p.x - c.x, p.z - c.z) || 1; ap = clamp(Math.atan2(1.2 - 1.4, d), -0.3, 0.3); }
    poseRig(G, c, fdt, R.clock + i * 1.7, ap);
    G.blob.position.set(c.x, 0.025, c.z); const bs = 0.95 - c.crouch * 0.1; G.blob.scale.set(bs, 1, bs);
  }
  /* the flag */
  const f = S.flag, fl = R.flag;
  if (f.st === "carried") {
    if (fl.parent !== R.playerRig.upper) R.playerRig.upper.add(fl);
    fl.position.set(0.1, -0.1, -0.2); fl.rotation.set(-0.42, -0.5, 0.18); fl.scale.setScalar(0.62);
  } else {
    if (fl.parent !== R.scene) R.scene.add(fl);
    fl.scale.setScalar(1);
    if (f.st === "dropped") { fl.position.set(f.x, 0.08, f.z); fl.rotation.set(0, R.clock * 0.6, 1.25); }
    else if (f.st === "home") { fl.position.set(HOME.x, 1.75, HOME.z); fl.rotation.set(0, Math.PI / 2, 0); }
    else { fl.position.set(AWAY.x, 1.75, AWAY.z); fl.rotation.set(0, -Math.PI / 2 + Math.sin(R.clock * 0.3) * 0.3, 0); }
  }
  R.flagPole.visible = f.st === "carried" || f.st === "dropped";
  if (!calm) {
    const P2 = R.flagGeo.attributes.position, base = R.flagBase, sp = f.st === "carried" ? 11 : 6;
    for (let i = 0; i < P2.count; i++) { const fx = base[i * 3] - 0.03; P2.setZ(i, Math.sin(fx * 5.5 - R.clock * sp) * fx * 0.12); }
    P2.needsUpdate = true;
  }
  R.flagGlow.visible = f.st === "base" || f.st === "dropped";
  if (R.flagGlow.visible) { R.flagGlow.position.set(f.x, 0.025, f.z); const k = 1 + (calm ? 0 : Math.sin(R.clock * 4) * 0.12); R.flagGlow.scale.set(k, 1, k); }
  /* pods */
  for (let i = 0; i < R.podMeshes.length; i++) {
    const g = R.podMeshes[i], q = S.pods[i];
    g.visible = !!q;
    if (q) { g.position.set(q.x, calm ? 0 : Math.sin(R.clock * 3 + i) * 0.06, q.z); g.rotation.y = R.clock * 1.6 + i; }
  }

  /* camera */
  const cp = R.camPos, ct = R.camTgt;
  if (R.debugCam) { cp.fromArray(R.debugCam, 0); ct.fromArray(R.debugCam, 3); }
  else if (idle) {
    // a slow look around you, in front, so the team colors and the faces show
    const a = calm ? 0.4 : 0.55 * Math.sin(idleT * 0.22) + 0.3, d = state === "over" ? 6.5 : 3.6;
    cp.set(p.x + Math.sin(p.h + a) * d, state === "over" ? 3.2 : 1.65, p.z + Math.cos(p.h + a) * d);
    ct.set(p.x, state === "over" ? 1.0 : 1.3, p.z);
  } else if (S.phase === "intro") {
    camIdeal(p, CAMV);
    const u = clamp(S.pt / 2.4, 0, 1), e = calm ? 1 : u * u * (3 - 2 * u);
    R.v.set(AWAY.x + 6, 7, AWAY.z + 9); R.v2.set(AWAY.x, 1.6, AWAY.z);
    cp.set(R.v.x + (CAMV.px - R.v.x) * e, R.v.y + (CAMV.py - R.v.y) * e + Math.sin(e * Math.PI) * 6, R.v.z + (CAMV.pz - R.v.z) * e);
    ct.set(R.v2.x + (CAMV.tx - R.v2.x) * e, R.v2.y + (CAMV.ty - R.v2.y) * e, R.v2.z + (CAMV.tz - R.v2.z) * e);
  } else if (S.phase === "capture" || S.phase === "timeup") {
    const a = Math.PI * 0.75 + (calm ? 0 : S.pt * 0.35);
    cp.lerp(R.v.set(p.x + Math.sin(a) * 4.2, 1.75, p.z + Math.cos(a) * 4.2), 1 - Math.exp(-fdt * 3));
    ct.lerp(R.v.set(p.x, 1.3, p.z), 1 - Math.exp(-fdt * 5));
  } else {
    camIdeal(p, CAMV);
    let px = CAMV.px, py = CAMV.py, pz = CAMV.pz;
    if (S.phase === "out") { const u = clamp(p.outT / 0.8, 0, 1); py += u * 2.2; px -= Math.sin(p.h) * u * 1.4; pz -= Math.cos(p.h) * u * 1.4; }
    // pull in if a piece of cover is between the shoulder and the camera
    const hx = p.x, hy = 1.5 - 0.42 * p.crouch, hz = p.z;
    let u = 1;
    for (let s = 1; s <= 12; s++) { const k = s / 12; if (solidAt(hx + (px - hx) * k, hy + (py - hy) * k, hz + (pz - hz) * k, 0.18)) { u = Math.max(0.25, (s - 1) / 12); break; } }
    R.camPull = (R.camPull == null ? 1 : R.camPull) + (u - (R.camPull == null ? 1 : R.camPull)) * Math.min(1, fdt * (u < R.camPull ? 20 : 4));
    px = hx + (px - hx) * R.camPull; py = hy + (py - hy) * R.camPull; pz = hz + (pz - hz) * R.camPull;
    if (!R.camReady || S.pt < 0.05) { cp.set(px, py, pz); ct.set(CAMV.tx, CAMV.ty, CAMV.tz); }
    else {
      const kk = 1 - Math.exp(-fdt * 26);
      cp.lerp(R.v.set(px, py, pz), kk); ct.lerp(R.v.set(CAMV.tx, CAMV.ty + (S.phase === "out" ? -0.8 : 0), CAMV.tz), kk);
    }
  }
  R.camReady = true;
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (Math.random() * 2 - 1) * m; sy = (Math.random() * 2 - 1) * m;
  }
  R.camera.position.set(cp.x + sx, cp.y + sy, cp.z);
  R.camera.lookAt(ct.x + sx, ct.y + sy, ct.z);
  R.camera.updateMatrixWorld();
  // the shadow box rides along with you
  const kd = R.keyDir || [-60, 90, 50], kl = Math.hypot(kd[0], kd[1], kd[2]);
  R.key.position.set(p.x + kd[0] / kl * 90, kd[1] / kl * 90, p.z + kd[2] / kl * 90);
  R.key.target.position.set(p.x, 0, p.z); R.key.target.updateMatrixWorld();
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
function splatPath(c, x, y, r, seed) {
  const rnd = rng(seed | 0);
  c.beginPath();
  for (let i = 0; i <= 18; i++) { const a = i / 18 * TAU, rr = r * (0.72 + rnd() * 0.4); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath();
}
function fmtTime(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ":" + ("0" + (t % 60)).slice(-2); }

// Things pinned to the 3D view: paint drops, floating scores, markers over the flag and the orange squad, the crosshair.
function drawWorld(c, state) {
  const p = S.p, f = S.flag;
  for (let i = 0; i < V.drops.length; i++) {
    const d = V.drops[i], q = toScreen(d.x, d.y, d.z);
    if (!q.ok) continue;
    const dist = Math.hypot(d.x - R.camera.position.x, d.z - R.camera.position.z) || 1;
    c.globalAlpha = clamp(d.life * 3, 0, 1); c.fillStyle = d.col;
    c.beginPath(); c.arc(q.x, q.y, clamp(9 / dist, 0.8, 3.2), 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
  // the orange squad: a small marker over anyone far enough off to be hard to see
  for (let i = 0; i < S.foes.length; i++) {
    const e = S.foes[i];
    if (e.gone) continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d < 9) continue;
    const q = toScreen(e.x, 2.15 - e.crouch * 0.6, e.z);
    if (!q.ok || q.x < 0 || q.x > W || q.y < 50 || q.y > H) continue;
    c.fillStyle = e.out ? "rgba(200,200,210,.7)" : "#ff7a1a"; c.strokeStyle = "#08205f"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(q.x - 5, q.y - 6); c.lineTo(q.x + 5, q.y - 6); c.lineTo(q.x, q.y + 1); c.closePath(); c.fill(); c.stroke();
    if (e.out) txt(c, "OUT", q.x, q.y - 17, 8, "#ffffff", "center", "#08205f");
  }
  // where to go: the flag, or home when you have it
  let gx, gy, gz, label, col;
  if (f.st === "carried") { gx = HOME.x; gy = 3.9; gz = HOME.z; label = "HOME"; col = "#3ff0ff"; }
  else if (f.st !== "home") { gx = f.x; gy = f.st === "dropped" ? 1.6 : 3.9; gz = f.z; label = f.st === "dropped" ? "FLAG DOWN" : "YOUR FLAG"; col = f.st === "dropped" ? "#ff9214" : "#3ff0ff"; }
  if (label && state === "playing" && S.phase !== "intro") {
    const q = toScreen(gx, gy, gz), d = Math.round(Math.hypot(gx - p.x, gz - p.z));
    let x = q.x, y = q.y, edge = false;
    if (!q.ok) { x = W - q.x; y = H - 40; edge = true; }
    if (x < 18 || x > W - 18 || y < 96 || y > H - 40) edge = true;
    x = clamp(x, 18, W - 18); y = clamp(y, 96, H - 40);
    const bob = Shell.reduced ? 0 : Math.sin(S.t * 5) * 2;
    c.save(); c.translate(x, y + bob);
    c.fillStyle = col; c.strokeStyle = "#08205f"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -9); c.lineTo(7, 0); c.lineTo(0, 9); c.lineTo(-7, 0); c.closePath(); c.fill(); c.stroke();
    c.restore();
    txt(c, label + (edge ? "" : "  " + d + "m"), x, y + 12 + bob, 9, "#ffffff", "center", "#08205f");
  }
  // floating scores
  for (let i = 0; i < V.floats.length; i++) {
    const fl = V.floats[i], q = toScreen(fl.x, fl.y + fl.t * 0.9, fl.z);
    if (!q.ok) continue;
    c.globalAlpha = clamp(1.4 - fl.t, 0, 1);
    txt(c, fl.txt, clamp(q.x, 50, W - 50), Math.max(100, q.y), 12, fl.col, "center", "#08205f");
  }
  c.globalAlpha = 1;
  // crosshair: on whatever a shot would hit, red brackets when it is on somebody
  if (state === "playing" && (S.phase === "play") && S.aim) {
    const a = S.aim, q = toScreen(a.x, a.y, a.z);
    const x = q.ok ? clamp(q.x, 20, W - 20) : W / 2, y = q.ok ? clamp(q.y, 60, H - 60) : H / 2;
    const lock = !!a.lock, r = lock ? 11 : 9, col = lock ? "#ff3b4e" : "#ffffff";
    c.lineWidth = 3; c.strokeStyle = "rgba(8,32,95,.6)";
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
    c.lineWidth = 1.6; c.strokeStyle = col;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
    c.fillStyle = col; c.fillRect(x - 1, y - 1, 2, 2);
    for (let k = 0; k < 4; k++) { const an = k * Math.PI / 2 + (lock && !Shell.reduced ? S.t * 3 : 0); c.beginPath(); c.moveTo(x + Math.cos(an) * (r + 3), y + Math.sin(an) * (r + 3)); c.lineTo(x + Math.cos(an) * (r + 8), y + Math.sin(an) * (r + 8)); c.stroke(); }
    if (S.reload > 0) {
      const k = 1 - S.reload / RELOAD_T;
      rrect(c, x - 26, y + 18, 52, 7, 3); c.fillStyle = "rgba(8,32,95,.8)"; c.fill();
      c.fillStyle = "#9bff3f"; c.fillRect(x - 24, y + 20, 48 * k, 3);
      txt(c, "RELOADING", x, y + 28, 8, "#ffffff", "center", "#08205f");
    } else if (S.hopper === 0) txt(c, S.packs > 0 ? "RELOAD (Q)" : "NO PAINT", x, y + 18, 9, "#ff9214", "center", "#08205f");
  }
}

// Paint on your goggles when you get hit, and a pointer to where it came from.
function drawGoggles(c) {
  for (let i = 0; i < V.lens.length; i++) {
    const L = V.lens[i], a = clamp(1 - (L.t - 1.6) / 1.6, 0, 1) * 0.78;
    c.globalAlpha = a;
    c.fillStyle = L.col;
    splatPath(c, L.x, L.y + L.t * 6, L.r, L.seed); c.fill();
    const rnd = rng(L.seed | 0);
    for (let k = 0; k < 6; k++) { const an = rnd() * TAU, d = L.r * (1.1 + rnd() * 0.5); c.beginPath(); c.arc(L.x + Math.cos(an) * d, L.y + Math.sin(an) * d + L.t * 6, 3 + rnd() * 6, 0, TAU); c.fill(); }
    for (let k = 0; k < 3; k++) { const dx = (rnd() - 0.5) * L.r, len = 10 + L.t * 26 * (0.5 + rnd()); c.fillRect(L.x + dx - 2.5, L.y, 5, L.r * 0.6 + len); c.beginPath(); c.arc(L.x + dx, L.y + L.r * 0.6 + len, 3.5, 0, TAU); c.fill(); }
    c.globalAlpha = a * 0.5; c.fillStyle = "#ffffff"; c.beginPath(); c.ellipse(L.x - L.r * 0.3, L.y - L.r * 0.35 + L.t * 6, L.r * 0.25, L.r * 0.12, -0.5, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
  const p = S.p;
  for (let i = 0; i < V.hitDir.length; i++) {
    const hd = V.hitDir[i], rel = angDiff(p.h, hd.a), a = 1 - hd.t / 0.9;
    // rel is 0 when it came from straight ahead; on screen, up is ahead and left is +rel
    const ang = -Math.PI / 2 - rel;
    c.strokeStyle = "rgba(255,59,78," + a.toFixed(2) + ")"; c.lineWidth = 6;
    c.beginPath(); c.arc(W / 2, H / 2, 70, ang - 0.35, ang + 0.35); c.stroke();
  }
}

function drawMinimap(c, x, y, w, h) {
  const sx = w / (FX * 2), sz = h / (FZ * 2), P = function (px, pz) { return [x + (px + FX) * sx, y + (pz + FZ) * sz]; };
  rrect(c, x - 3, y - 3, w + 6, h + 6, 5); c.fillStyle = "rgba(8,32,95,.82)"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = "#ffffff"; c.stroke();
  c.fillStyle = "rgba(58,189,82,.55)"; c.fillRect(x, y, w, h);
  c.fillStyle = "rgba(255,255,255,.5)"; c.fillRect(x, y + h / 2 - 0.5, w, 1);
  const L = cover();
  for (let i = 0; i < L.length; i++) {
    const o = L[i], q = P(o.x, o.z);
    c.fillStyle = "rgba(255,255,255,.75)";
    if (o.s === "box") { c.save(); c.translate(q[0], q[1]); c.rotate(-o.rot); c.fillRect(-o.hx * sx, -o.hz * sz, Math.max(1.5, o.hx * 2 * sx), Math.max(1.5, o.hz * 2 * sz)); c.restore(); }
    else { c.beginPath(); c.arc(q[0], q[1], Math.max(1.2, o.r * sx), 0, TAU); c.fill(); }
  }
  let q = P(HOME.x, HOME.z); c.fillStyle = "#3d8cff"; c.beginPath(); c.arc(q[0], q[1], 4, 0, TAU); c.fill();
  q = P(AWAY.x, AWAY.z); c.fillStyle = "#ff7a1a"; c.beginPath(); c.arc(q[0], q[1], 4, 0, TAU); c.fill();
  for (let i = 0; i < S.foes.length; i++) {
    const e = S.foes[i]; if (e.gone) continue;
    q = P(e.x, e.z); c.fillStyle = e.out ? "rgba(255,255,255,.5)" : "#ff7a1a"; c.strokeStyle = "#08205f"; c.lineWidth = 1;
    c.beginPath(); c.arc(q[0], q[1], 2.6, 0, TAU); c.fill(); c.stroke();
  }
  const f = S.flag;
  if (f.st !== "carried") { q = P(f.x, f.z); const blink = Shell.reduced || Math.floor(S.t * 4) % 2 === 0; if (blink) { c.fillStyle = "#3ff0ff"; c.fillRect(q[0] - 1, q[1] - 6, 1.5, 7); c.fillRect(q[0], q[1] - 6, 5, 3.5); } }
  const p = S.p; q = P(p.x, p.z);
  c.save(); c.translate(q[0], q[1]); c.rotate(-p.h + Math.PI);
  c.fillStyle = p.out ? "#9aa3b5" : "#ffe45c"; c.strokeStyle = "#08205f"; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(0, -5); c.lineTo(3.6, 4); c.lineTo(0, 2); c.lineTo(-3.6, 4); c.closePath(); c.fill(); c.stroke();
  if (f.st === "carried") { c.fillStyle = "#3ff0ff"; c.fillRect(-1, -11, 1.5, 7); c.fillRect(0, -11, 5, 3.5); }
  c.restore();
}

function drawTouch(c) {
  // stick
  const st = IN.stick, bx = st ? st.ox : 74, by = st ? st.oy : H - 104, R0 = TOUCH.stickR;
  c.globalAlpha = st ? 0.9 : 0.5;
  c.beginPath(); c.arc(bx, by, R0, 0, TAU); c.fillStyle = "rgba(8,32,95,.45)"; c.fill();
  c.lineWidth = 2; c.strokeStyle = "rgba(255,255,255,.7)"; c.stroke();
  const kx = bx + (st ? st.dx * R0 : 0), ky = by + (st ? st.dy * R0 : 0);
  const g = c.createRadialGradient(kx - 5, ky - 5, 2, kx, ky, 20);
  g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#9fb8ff");
  c.beginPath(); c.arc(kx, ky, 19, 0, TAU); c.fillStyle = g; c.fill(); c.strokeStyle = "#08205f"; c.stroke();
  if (!st) txt(c, "MOVE", bx, by + R0 + 4, 8, "#ffffff", "center", "#08205f");
  // fire
  const F = TOUCH.fire, down = !!IN.fireP;
  c.globalAlpha = down ? 1 : 0.85;
  const fg = c.createRadialGradient(F.x - 10, F.y - 12, 4, F.x, F.y, F.r);
  fg.addColorStop(0, down ? "#ffb0dc" : "#ff7ac6"); fg.addColorStop(1, down ? "#d81b7c" : "#c4146c");
  c.beginPath(); c.arc(F.x, F.y, F.r * (down ? 0.94 : 1), 0, TAU); c.fillStyle = fg; c.fill();
  c.lineWidth = 3; c.strokeStyle = "#ffffff"; c.stroke();
  c.fillStyle = "#ffe600"; splatPath(c, F.x, F.y - 6, 13, 9); c.fill();
  txt(c, "FIRE", F.x, F.y + 12, 11, "#ffffff", "center", "#08205f");
  // duck
  const D = TOUCH.duck, on = IN.duckToggle;
  c.globalAlpha = 0.88;
  c.beginPath(); c.arc(D.x, D.y, D.r, 0, TAU); c.fillStyle = on ? "#3ff0ff" : "rgba(8,32,95,.7)"; c.fill();
  c.lineWidth = 2; c.strokeStyle = "#ffffff"; c.stroke();
  txt(c, "DUCK", D.x, D.y - 6, 10, on ? "#08205f" : "#ffffff", "center");
  // reload
  const Q = TOUCH.reload;
  c.beginPath(); c.arc(Q.x, Q.y, Q.r, 0, TAU); c.fillStyle = "rgba(8,32,95,.7)"; c.fill(); c.stroke();
  c.lineWidth = 2.5; c.strokeStyle = "#9bff3f"; c.beginPath(); c.arc(Q.x, Q.y, 9, 0.4, TAU - 0.6); c.stroke();
  c.fillStyle = "#9bff3f"; c.beginPath(); c.moveTo(Q.x + 9, Q.y - 8); c.lineTo(Q.x + 13, Q.y - 1); c.lineTo(Q.x + 5, Q.y - 2); c.closePath(); c.fill();
  c.globalAlpha = 1;
}

function drawHUD(c, state) {
  const A = ARENAS[S.arena], p = S.p;
  const bg = c.createLinearGradient(0, 0, 0, 46);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, 0, W, 46);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff9214"; c.fillRect(0, 46, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, 48, W, 1);
  txt(c, "SCORE", 10, 6, 9, "#a8ecff", "left", "#08205f");
  txt(c, String(S.score), 10, 19, 17, "#ffe45c", "left", "#08205f");
  // the clock
  const low = S.time <= 30, blink = low && !Shell.reduced && Math.floor(S.t * 2) % 2 === 0;
  rrect(c, W / 2 - 40, 5, 80, 36, 7); c.fillStyle = "#06120a"; c.fill();
  c.lineWidth = 2; c.strokeStyle = low ? "#ff3b4e" : "#ffe45c"; c.stroke();
  txt(c, fmtTime(S.time), W / 2, 12, 21, blink ? "#ff8a96" : low ? "#ff3b4e" : "#5dff7a", "center");
  txt(c, "ARENA " + (S.arena + 1) + "/" + ARENAS.length, W - 10, 6, 9, "#a8ecff", "right", "#08205f");
  txt(c, A.name, W - 10, 20, A.name.length > 13 ? 9 : 11, "#ffffff", "right", "#08205f");
  if (state !== "playing" && state !== "paused") return;
  // hits you can still take, and your paint
  rrect(c, 6, 54, 122, 46, 7); c.fillStyle = "rgba(8,32,95,.78)"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = "rgba(255,255,255,.8)"; c.stroke();
  txt(c, "HITS", 13, 59, 8, "#a8ecff");
  for (let i = 0; i < HITS; i++) {
    const hit = i >= HITS - p.hits, x = 46 + i * 24, y = 64;
    if (hit) { c.fillStyle = PAINT.orange; splatPath(c, x, y, 9, i * 7 + 3); c.fill(); }
    else { rrect(c, x - 9, y - 6, 18, 12, 4); c.fillStyle = "#3d8cff"; c.fill(); c.lineWidth = 1.5; c.strokeStyle = "#ffffff"; c.stroke(); c.fillStyle = "rgba(255,255,255,.7)"; c.fillRect(x - 6, y - 3, 5, 3); }
  }
  txt(c, "PAINT", 13, 80, 8, "#a8ecff");
  const hw = 52, hk = S.reload > 0 ? 1 - S.reload / RELOAD_T : S.hopper / HOPPER;
  rrect(c, 44, 80, hw, 9, 3); c.fillStyle = "#12296e"; c.fill();
  c.fillStyle = S.hopper < 6 && S.reload <= 0 ? "#ff9214" : "#ffe600"; c.fillRect(45, 81, (hw - 2) * hk, 7);
  txt(c, String(S.hopper), 100, 79, 10, "#ffffff");
  for (let i = 0; i < POD_MAX; i++) { c.fillStyle = i < S.packs ? "#ffe600" : "rgba(255,255,255,.18)"; rrect(c, 44 + i * 9, 92, 6, 5, 2); c.fill(); }
  txt(c, "PODS", 104, 90, 7, "#a8ecff");
  // the map
  drawMinimap(c, W - 66, 56, 58, 96);
  // what to do now
  const f = S.flag;
  let goal = "", gc = "#ffffff";
  if (S.phase === "out") { goal = "OUT! BACK IN " + Math.max(0, Math.ceil(OUT_T - p.outT)); gc = "#ff7ac6"; }
  else if (f.st === "carried") { goal = "RUN IT HOME!"; gc = "#3ff0ff"; }
  else if (f.st === "dropped") { goal = "FLAG DOWN! GRAB IT"; gc = "#ff9214"; }
  else if (S.phase === "play") goal = "GET YOUR FLAG BACK";
  if (goal) {
    c.font = "bold 11px " + HUD_FONT; const tw = c.measureText(goal).width + 18;
    rrect(c, W / 2 - tw / 2 - 30, 106, tw, 20, 10); c.fillStyle = "rgba(8,32,95,.75)"; c.fill();
    txt(c, goal, W / 2 - 30, 110, 11, gc, "center");
  }
  if (S.streak >= 3 && S.phase === "play") txt(c, S.streak + " TAG STREAK", 13, 131, 9, "#ffc1e0", "left", "#08205f");
  if (state === "playing" && IN.touchUI && (S.phase === "play" || S.phase === "out")) drawTouch(c);
  if (state === "playing" && !IN.touchUI && !IN.locked && S.phase === "play") {
    c.font = "bold 10px " + HUD_FONT; const msg = "CLICK THE FIELD TO AIM WITH THE MOUSE", tw = c.measureText(msg).width + 16;
    rrect(c, W / 2 - tw / 2, H - 30, tw, 18, 9); c.fillStyle = "rgba(8,32,95,.75)"; c.fill();
    txt(c, msg, W / 2, H - 26, 10, "#ffffff", "center");
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
  if (sized) {
    syncScene(state, fdt);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  const live = state === "playing" || state === "paused";
  if (live) { drawWorld(c, state); drawGoggles(c); }
  if (live) drawHUD(c, state);
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
  const line = document.createElement("p");
  line.textContent = "Loading the field...";
  line.style.cssText = "margin:0;font-size:13px;letter-spacing:.08em;color:#ffe45c;opacity:.9";
  el.appendChild(line);
  document.body.appendChild(el);
  return { el: el, img: img, line: line };
}
function splashFail(splash, lines) {
  const el = splash.el;
  splash.img.style.width = "min(40vw,26vh,180px)";
  el.setAttribute("role", "alert");
  el.removeAttribute("aria-label");
  if (splash.line) splash.line.remove();
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
function logoImg(maxH) {
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
  im.style.cssText = "display:block;width:auto;height:" + maxH + ";max-width:60%;margin:0 auto 6px";
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_URL;
  return im;
}
function startGame() {
  Shell.init({
    slug: "paintball-blitz",
    title: "PAINTBALL BLITZ",
    accent: "#ff3fa4",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "The orange squad has your flag. Work up the field from cover to cover, tag them with paint, grab your flag and run it back to your base before the clock runs out. Four arenas, each one tougher.",
    keys: "Keys: WASD move, mouse or left and right aim, click or Space fires, Shift ducks, Q reloads. P pause, M mute, N music, R restart. On a phone: stick on the left, drag to aim, FIRE on the right.",
    tip: "Duck behind cover to dodge. Firing pops you up. The station at your base refills your paint.",
    reset: reset,
    update: update,
    draw: draw,
    key: key,
    idle: function (dt) { if (paused) return; idleT += dt; S.t += dt; stepView(dt); },
    onPause: function () { paused = true; releaseInput(); try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ } },
    onResume: function () { paused = false; }
  });
  attach();
  bindInput();
  // Sound. Nothing is created until the first tap, click or key press; the music starts with the game.
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Juke.unlock, true); });
  Shell.onStart(Juke.newGame); Shell.onRestart(function () { paused = false; Juke.newGame(); }); Shell.onResume(Juke.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Juke.toggleMusic();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) { Juke.button(titleCard, titleCard.querySelector(".np-tip")); titleCard.insertBefore(logoImg("clamp(56px,13vh,108px)"), titleCard.firstChild); }
  if (pauseActions) Juke.button(pauseActions, pauseActions.querySelector("a"));
  // The studio logo heads the score card too.
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) card.insertBefore(logoImg("clamp(64px,14vh,104px)"), card.firstChild);
}

// Hook for automated checks (no effect on play)
window.__paintball = { S: function () { return S; }, V: V, IN: IN, ARENAS: ARENAS, gfx: function () { return R; }, led: function () { return LED; }, juke: Juke,
                       startMusic: startMusic, setupArena: setupArena, step: update, playerOut: playerOut, solidAt: solidAt, clearLine: clearLine, toScreen: toScreen, tagOut: tagOut, capture: capture, keys: function () { return keys; } };

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
        ? "Paintball Blitz could not load its 3D engine (" + THREE_URL + ")."
        : "Paintball Blitz needs WebGL for its 3D field, and this browser has it switched off or does not support it.");
    });
})();
