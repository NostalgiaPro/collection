/* NOSTALGIA PRO MINI GOLF CLASSIC (3D): an original 18-hole miniature-golf course in real 3D.
   Play the front nine, the back nine, or all 18. Stroke play, low score wins.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of input, scaling and the title / pause / game over flow, and carries the HUD.

   Course space: every hole is laid out in the shell's 360 x 540 units, x across, y down the
   screen (the tee is near the bottom, the cup near the top). A course point (x, y) of hole i
   at height h sits in three.js space at (i * HOLE_PITCH + x - 180, h, y - 300).
   The greens are real heightfields (flat, ramps, banked and twisted tiles, domes and bowls),
   so the ball climbs, rolls back, leaves the lip of a ramp and lands again.

   Everything here is original: the course, the holes, the art, the two course regulars,
   the music. Nothing is copied from any other game. */

const W = 360, H = 540, TAU = Math.PI * 2;
const BR = 5, CUP_R = 9, MAX_STROKES = 6, MAX_PULL = 115;      // BR = ball radius
const V_MIN = 30, V_MAX = 720, STOP = 5;
const FR_C = 100, FR_K = 0.78;          // turf friction: constant + proportional
const SAND_C = 540, SAND_K = 3.3;       // sand traps
const BOOST = 1500, BOUNCE = 0.72, BUMP_V = 340;
const G_ROLL = 1500, G_AIR = 2000;      // slope pull on the ground, gravity in the air
const WATER_Y = -6;                     // the water sits this far under the turf
const HOLE_PITCH = 560;                 // center to center of neighboring holes
const CX = 180, CZ = 300;
const RAIL_H = 9, BASE = 14, CUP_D = 11;
const CAM_FOV = 30, CAM_PITCH = 50 * Math.PI / 180;
const HUD_H = 77, SLIDE_T = 0.95;
const SAFE = { x1: 6, x2: W - 6, y1: HUD_H + 6, y2: H - 8 };
const SIGN_W = 184, SIGN_H = 62, LED_H = 17;                   // the hole board behind every cup
const FOLK_S = 12;                                             // the course regulars: life-size feet x this

const LOGO_URL = "np_games_logo.png";                          // the full studio logo: splash, title card, score card, cover
const SCRIPT_URL = "np_games_script.png";                      // the script wordmark: every decal on the course
const THREE_URL = "../shared/three.module.min.js";
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';
const SLUG = "mini-golf-classic";
const GAME_NAME = "Nostalgia Pro Mini Golf Classic";

/* ---------------- Course building blocks ---------------- */
function rc(x1, y1, x2, y2) { return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; }
function frame(x1, y1, x2, y2) {
  const t = 10;
  return [rc(x1 - t, y1 - t, x2 + t, y1), rc(x1 - t, y2, x2 + t, y2 + t), rc(x1 - t, y1, x1, y2), rc(x2, y1, x2 + t, y2)];
}
// Turf tiles. c = corner heights [north-west, north-east, south-west, south-east] (north = up the screen).
function flat(x1, y1, x2, y2, hh, more) { return tile(x1, y1, x2, y2, [hh || 0, hh || 0, hh || 0, hh || 0], more); }
// A ramp that climbs toward the north edge (top) from the south edge (bottom).
function rampN(x1, y1, x2, y2, top, bottom, more) { return tile(x1, y1, x2, y2, [top, top, bottom, bottom], more); }
// Any tile whose corners follow a height function: neighbors built from the same function always meet.
function plane(x1, y1, x2, y2, fn, more) { return tile(x1, y1, x2, y2, [fn(x1, y1), fn(x2, y1), fn(x1, y2), fn(x2, y2)], more); }
function tile(x1, y1, x2, y2, c, more) { const z = { r: rc(x1, y1, x2, y2), c: c }; if (more) for (const k in more) z[k] = more[k]; return z; }
// A round hill (top > 0) or bowl (top < 0) on a square tile. rIn is the flat top or floor.
function dome(cx, cy, R, rIn, top, more) {
  const z = { r: rc(cx - R, cy - R, cx + R, cy + R), dome: { cx: cx, cy: cy, R: R, rIn: rIn, top: top } };
  if (more) for (const k in more) z[k] = more[k];
  return z;
}
function seg(x1, y1, x2, y2, t) { return { x1: x1, y1: y1, x2: x2, y2: y2, t: t || 5 }; }
function hole(o) {
  const d = { zones: [], walls: [], segs: [], posts: [], palms: [], bumpers: [], water: [], sand: [], boosts: [],
              sliders: [], rotors: [], windmills: [], tubes: [], loops: [], bridge: null, props: [], tee: [180, 470], cup: [180, 140] };
  for (const k in o) d[k] = o[k];
  return d;
}

// Hole 11's camber: high on the east rail through the middle, flat at both ends.
function camber(x, y) {
  const k = y >= 300 ? Math.max(0, 1 - (y - 300) / 90) : y <= 200 ? Math.max(0, 1 - (200 - y) / 70) : 1;
  return 16 * (x - 100) / 160 * k * k * (3 - 2 * k);
}

const HOLES = [
  /* ---------- FRONT NINE ---------- */
  hole({ name: "Sunrise Straightaway", par: 2, tee: [180, 468], cup: [180, 140], theme: 0,
    zones: [flat(130, 340, 230, 500), rampN(130, 300, 230, 340, 7, 0), rampN(130, 260, 230, 300, 0, 7), flat(130, 90, 230, 260)],
    walls: frame(130, 90, 230, 500) }),

  hole({ name: "Dogleg Drive-In", par: 3, tee: [78, 440], cup: [252, 136], theme: 1,
    zones: [flat(40, 380, 300, 500), flat(200, 90, 300, 380)],
    walls: [rc(30, 370, 40, 510), rc(30, 500, 310, 510), rc(300, 80, 310, 510), rc(190, 80, 310, 90), rc(190, 90, 200, 380), rc(30, 370, 200, 380)],
    segs: [seg(252, 500, 300, 452, 5)],
    palms: [{ x: 250, y: 262, r: 8 }] }),

  hole({ name: "Uphill Hustle", par: 2, tee: [180, 466], cup: [180, 146], theme: 2,
    zones: [flat(120, 330, 240, 500), rampN(120, 230, 240, 330, 18, 0), flat(120, 90, 240, 230, 18)],
    walls: frame(120, 90, 240, 500), bumpers: [{ x: 150, y: 190, r: 10 }, { x: 210, y: 190, r: 10 }] }),

  hole({ name: "Windmill Way", par: 3, tee: [180, 466], cup: [180, 138], theme: 3,
    zones: [flat(110, 90, 250, 500)],
    walls: frame(110, 90, 250, 500).concat([rc(110, 280, 162, 312), rc(198, 280, 250, 312)].map(function (r) { r.hide = true; return r; })),
    windmills: [{ x: 180, y: 296, door: 36, front: 312, speed: 1.45 }] }),

  hole({ name: "Palm Grove", par: 3, tee: [180, 468], cup: [180, 126], theme: 4,
    zones: [flat(70, 90, 290, 500)],
    walls: frame(70, 90, 290, 500),
    palms: [{ x: 128, y: 366, r: 8 }, { x: 232, y: 338, r: 8 }, { x: 180, y: 262, r: 8 }, { x: 112, y: 204, r: 8 }, { x: 250, y: 190, r: 8 }],
    sand: [rc(146, 152, 214, 178)] }),

  hole({ name: "Lagoon Bridge", par: 3, tee: [180, 468], cup: [148, 138], theme: 5,
    zones: [flat(90, 330, 270, 500), rampN(165, 290, 195, 330, 5, 0, { wood: true }), rampN(165, 250, 195, 290, 0, 5, { wood: true }), flat(90, 90, 270, 250)],
    water: [rc(90, 250, 165, 330), rc(195, 250, 270, 330)],
    waterLook: [rc(165, 250, 195, 330)],
    walls: frame(90, 90, 270, 500),
    sand: [rc(196, 116, 250, 158)] }),

  hole({ name: "Volcano Peak", par: 3, tee: [180, 468], cup: [180, 190], theme: 6,
    zones: [flat(80, 268, 280, 500), flat(80, 90, 280, 112), flat(80, 112, 102, 268), flat(258, 112, 280, 268),
            dome(180, 190, 78, 15, 26, { lava: true })],
    walls: frame(80, 90, 280, 500) }),

  hole({ name: "Loop-de-Loop", par: 3, tee: [180, 470], cup: [180, 148], theme: 7,
    zones: [flat(90, 90, 270, 500)],
    walls: frame(90, 90, 270, 500).concat([Object.assign(rc(90, 306, 270, 358), { hide: true })]),
    segs: [seg(96, 432, 146, 368, 5), seg(264, 432, 182, 368, 5)],
    loops: [{ x: 164, fy: 358, exitX: 196, exitY: 298, R: 24, minV: 300 }] }),

  hole({ name: "Lighthouse Leap", par: 3, tee: [180, 470], cup: [180, 132], theme: 8,
    zones: [flat(120, 340, 240, 500), rampN(150, 262, 210, 340, 15, 0), flat(120, 90, 240, 212, 6)],
    water: [rc(120, 212, 240, 262), rc(120, 262, 140, 330), rc(220, 262, 240, 330)],
    walls: [rc(110, 80, 120, 510), rc(240, 80, 250, 510), rc(110, 80, 250, 90), rc(110, 500, 250, 510),
            rc(120, 330, 150, 340), rc(210, 330, 240, 340), rc(140, 262, 150, 330), rc(210, 262, 220, 330)],
    leap: { from: 262, land: 212 } }),

  /* ---------- BACK NINE ---------- */
  hole({ name: "Tube Twister", par: 3, tee: [180, 470], cup: [212, 140], theme: 9,
    zones: [flat(70, 90, 290, 500)],
    walls: frame(70, 90, 290, 500).concat([rc(70, 280, 290, 294)]),
    tubes: [{ x: 116, y: 312, r: 13, ex: 118, ey: 170, dx: 0.35, dy: -1, k: 0.55 },
            { x: 244, y: 312, r: 13, ex: 268, ey: 252, dx: 0, dy: -1, k: 0.8 }],
    sand: [rc(240, 104, 290, 164)] }),

  hole({ name: "Sidewinder Slope", par: 3, tee: [180, 470], cup: [200, 124], theme: 10,
    zones: [flat(100, 390, 260, 500), plane(100, 300, 260, 390, camber), plane(125, 200, 260, 300, camber),
            plane(100, 280, 125, 300, camber), plane(100, 200, 125, 222, camber), plane(100, 130, 260, 200, camber), flat(100, 90, 260, 130)],
    water: [rc(100, 222, 125, 280)],
    walls: frame(100, 90, 260, 500), posts: [{ x: 210, y: 250, r: 7 }] }),

  hole({ name: "Spin Cycle", par: 3, tee: [180, 470], cup: [180, 128], theme: 11,
    zones: [flat(90, 90, 270, 500)],
    walls: frame(90, 90, 270, 500),
    rotors: [{ x: 138, y: 362, len: 46, n: 2, speed: 1.5 }, { x: 222, y: 236, len: 46, n: 3, speed: -1.25 }],
    posts: [{ x: 240, y: 380, r: 7 }, { x: 120, y: 220, r: 7 }] }),

  hole({ name: "Boombox Boulevard", par: 3, tee: [180, 470], cup: [180, 134], theme: 12,
    zones: [flat(80, 320, 280, 500), rampN(80, 252, 280, 320, 12, 0), flat(80, 90, 280, 252, 12)],
    walls: frame(80, 90, 280, 500),
    sliders: [{ w: 84, h: 26, y: 186, x1: 80, x2: 196, speed: 1.35, phase: 0 }] }),

  hole({ name: "Sunset Ledge", par: 3, tee: [190, 468], cup: [186, 140], theme: 13,
    zones: [flat(100, 330, 260, 500, 22), flat(140, 200, 260, 330), flat(100, 90, 260, 200)],
    water: [rc(100, 200, 140, 330)],
    walls: [rc(90, 330, 100, 510), rc(260, 330, 270, 510), rc(90, 500, 270, 510), rc(90, 80, 100, 330), rc(260, 80, 270, 330), rc(90, 80, 270, 90)],
    bumpers: [{ x: 214, y: 218, r: 10 }] }),

  hole({ name: "Whirlpool", par: 2, tee: [180, 468], cup: [180, 176], theme: 14,
    zones: [flat(100, 252, 260, 500), flat(100, 90, 260, 100), flat(100, 100, 104, 252), flat(256, 100, 260, 252), dome(180, 176, 76, 12, -11, { swirl: true })],
    walls: frame(100, 90, 260, 500),
    bumpers: [{ x: 140, y: 336, r: 10 }, { x: 220, y: 336, r: 10 }],
    rotors: [{ x: 180, y: 284, len: 32, n: 2, speed: 1.7 }] }),

  hole({ name: "Castle Moat", par: 3, tee: [180, 470], cup: [180, 140], theme: 15,
    zones: [flat(90, 300, 270, 500), flat(160, 250, 200, 300, 0, { bridge: true, wood: true }), flat(90, 90, 270, 250)],
    water: [rc(90, 250, 160, 300), rc(160, 250, 200, 300), rc(200, 250, 270, 300)],
    walls: frame(90, 90, 270, 500).concat([Object.assign(rc(90, 226, 160, 250), { stone: true }), Object.assign(rc(200, 226, 270, 250), { stone: true })]),
    bridge: { x1: 160, x2: 200, y1: 250, y2: 300, period: 4.6 } }),

  hole({ name: "Neon Pinball", par: 3, tee: [180, 470], cup: [180, 122], theme: 16,
    zones: [flat(70, 90, 290, 500)],
    walls: frame(70, 90, 290, 500),
    segs: [seg(70, 322, 112, 376, 5), seg(290, 322, 248, 376, 5)],
    bumpers: [{ x: 128, y: 300, r: 12 }, { x: 232, y: 300, r: 12 }, { x: 180, y: 232, r: 12 }, { x: 112, y: 176, r: 11 }, { x: 248, y: 176, r: 11 }],
    boosts: [{ r: rc(164, 380, 196, 432), dx: 0, dy: -1 }] }),

  hole({ name: "Grand Finale", par: 4, tee: [80, 462], cup: [108, 148], theme: 17,
    zones: [flat(50, 420, 230, 500), flat(230, 420, 310, 500), rampN(230, 300, 310, 420, 20, 0), flat(230, 180, 310, 300, 20), flat(50, 90, 230, 300)],
    walls: [rc(40, 500, 320, 510), rc(40, 410, 50, 510), rc(40, 410, 230, 420), rc(310, 420, 320, 510), rc(310, 300, 320, 420), rc(310, 170, 320, 300),
            rc(230, 170, 320, 180), rc(230, 80, 240, 170), rc(40, 80, 240, 90), rc(40, 80, 50, 310), rc(40, 300, 220, 310), rc(220, 300, 230, 420)],
    segs: [seg(262, 500, 310, 452, 5)],
    rotors: [{ x: 150, y: 214, len: 34, n: 2, speed: 1.6 }],
    bumpers: [{ x: 178, y: 138, r: 10 }] })
];
const FRONT = [0, 1, 2, 3, 4, 5, 6, 7, 8], BACK = [9, 10, 11, 12, 13, 14, 15, 16, 17];

/* ---------------- Heights ---------------- */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function inRect(x, y, r, pad) { pad = pad || 0; return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad; }

function zoneH(z, x, y) {
  if (z.dome) {
    const d = z.dome, r = Math.hypot(x - d.cx, y - d.cy);
    if (r <= d.rIn) return d.top;
    if (r >= d.R) return 0;
    return d.top * 0.5 * (1 + Math.cos(Math.PI * (r - d.rIn) / (d.R - d.rIn)));
  }
  const u = clamp((x - z.r.x) / z.r.w, 0, 1), v = clamp((y - z.r.y) / z.r.h, 0, 1), c = z.c;
  return (c[0] * (1 - u) + c[1] * u) * (1 - v) + (c[2] * (1 - u) + c[3] * u) * v;
}
// The drawbridge: down most of the time, then up, then back down. Returns its angle (0 = down).
function bridgeAngle(br, t) {
  const p = ((t % br.period) + br.period) % br.period, up = 1.45;
  const e = function (u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  if (p < 2.6) return 0;
  if (p < 3.1) return up * e((p - 2.6) / 0.5);
  if (p < 4.0) return up;
  if (p < 4.5) return up * (1 - e((p - 4.0) / 0.5));
  return 0;
}
// What is under a course point: k = 1 turf, 2 water, 0 nothing (off the course). y = its height.
const GA = { k: 0, y: 0, z: null }, GB = { k: 0, y: 0, z: null }, GC = { k: 0, y: 0, z: null };
function groundAt(h, x, y, t, out) {
  for (let i = h.zones.length - 1; i >= 0; i--) {
    const z = h.zones[i];
    if (z.bridge && bridgeAngle(h.bridge, t) > 0.06) continue;
    if (inRect(x, y, z.r)) { out.k = 1; out.y = zoneH(z, x, y); out.z = z; return out; }
  }
  for (let i = 0; i < h.water.length; i++) if (inRect(x, y, h.water[i])) { out.k = 2; out.y = WATER_Y; out.z = null; return out; }
  out.k = 0; out.y = -BASE - 40; out.z = null;
  return out;
}
function turfH(h, x, y, t, dflt) { const g = groundAt(h, x, y, t, GC); return g.k === 1 ? g.y : dflt; }

/* ---------------- Moving pieces ---------------- */
function sliderRect(s, t) {
  const u = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
  const x = s.x1 + (s.x2 - s.x1) * u;
  const vx = (s.x2 - s.x1) * 0.5 * Math.cos(t * s.speed + s.phase) * s.speed;
  return { x: x, y: s.y, w: s.w, h: s.h, vx: vx, vy: 0 };
}
function rotorAngle(r, t) { return t * r.speed; }
function millAngle(m, t) { return t * m.speed; }
// A windmill blade is in the doorway when one of the four is pointing (nearly) straight down.
function millBlocked(m, t) {
  const a = millAngle(m, t);
  for (let k = 0; k < 4; k++) {
    let d = (a + k * Math.PI / 2) % TAU; if (d < 0) d += TAU;
    if (d > Math.PI) d -= TAU;
    if (Math.abs(d) < 0.34) return true;
  }
  return false;
}

/* ---------------- Collisions ---------------- */
function resolve(b, nx, ny, pen, vx, vy, e) {
  b.x += nx * pen; b.y += ny * pen;
  const rvx = b.vx - vx, rvy = b.vy - vy, vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
    const push = vx * nx + vy * ny, now = b.vx * nx + b.vy * ny;   // a moving piece never leaves the ball slower than itself
    if (push > 0 && now < push) { b.vx += (push - now) * nx; b.vy += (push - now) * ny; }
    return -vn;
  }
  return 0.001;
}
function hitRect(b, r, vx, vy) {
  const cx = clamp(b.x, r.x, r.x + r.w), cy = clamp(b.y, r.y, r.y + r.h);
  const dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
  if (d2 >= BR * BR) return 0;
  let nx, ny, pen;
  if (d2 < 1e-8) {
    const l = b.x - r.x, rr = r.x + r.w - b.x, tp = b.y - r.y, bt = r.y + r.h - b.y;
    const m = Math.min(l, rr, tp, bt);
    if (m === l) { nx = -1; ny = 0; } else if (m === rr) { nx = 1; ny = 0; } else if (m === tp) { nx = 0; ny = -1; } else { nx = 0; ny = 1; }
    pen = BR + m;
  } else { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = BR - d; }
  return resolve(b, nx, ny, pen, vx || 0, vy || 0, BOUNCE);
}
function hitSeg(b, ax, ay, bx, by, th, vfn) {
  const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
  const u = l2 ? clamp(((b.x - ax) * ex + (b.y - ay) * ey) / l2, 0, 1) : 0;
  const px = ax + ex * u, py = ay + ey * u;
  const dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy, rr = BR + th;
  if (d2 >= rr * rr) return 0;
  const d = Math.sqrt(d2) || 1e-4, nx = dx / d, ny = dy / d;
  const v = vfn ? vfn(px, py) : null;
  return resolve(b, nx, ny, rr - d, v ? v[0] : 0, v ? v[1] : 0, BOUNCE);
}
function hitCircle(b, cx, cy, cr, e) {
  const dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy, rr = BR + cr;
  if (d2 >= rr * rr) return 0;
  const d = Math.sqrt(d2) || 1e-4;
  return resolve(b, dx / d, dy / d, rr - d, 0, 0, e == null ? BOUNCE : e);
}

/* ---------------- One physics step ----------------
   Returns "" or an event: "sunk", "water", "lost", "loop", "tube". */
function step(h, b, t, dt) {
  let i, r, imp = 0;
  let c = FR_C, k = FR_K, ax = 0, ay = 0;
  if (!b.air) {
    for (i = 0; i < h.sand.length; i++) if (inRect(b.x, b.y, h.sand[i])) { c = SAND_C; k = SAND_K; b.sanded = true; break; }
    for (i = 0; i < h.boosts.length; i++) {
      const bo = h.boosts[i];
      if (inRect(b.x, b.y, bo.r)) { ax += bo.dx * BOOST; ay += bo.dy * BOOST; c = 30; k = 0.25; b.boosted = true; }
    }
    // the slope pulls the ball downhill
    const h0 = b.z;
    const gx = (turfH(h, b.x + 1.5, b.y, t, h0) - turfH(h, b.x - 1.5, b.y, t, h0)) / 3;
    const gy = (turfH(h, b.x, b.y + 1.5, t, h0) - turfH(h, b.x, b.y - 1.5, t, h0)) / 3;
    const n2 = 1 + gx * gx + gy * gy;
    ax -= G_ROLL * gx / n2; ay -= G_ROLL * gy / n2;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
      const ns = Math.max(0, sp - (c + k * sp) * dt);
      b.vx *= ns / sp; b.vy *= ns / sp;
    }
    // resting on a gentle grade: static friction holds it (keeps it from creeping forever)
    if (sp < STOP && Math.hypot(ax, ay) < 150) { ax = 0; ay = 0; }
  }
  b.vx += ax * dt; b.vy += ay * dt;
  let sp = Math.hypot(b.vx, b.vy);
  if (sp > V_MAX * 1.2) { b.vx *= V_MAX * 1.2 / sp; b.vy *= V_MAX * 1.2 / sp; sp = V_MAX * 1.2; }
  b.x += b.vx * dt; b.y += b.vy * dt;

  // the loop: a ball at the mouth of the track, going north fast enough, rides it
  for (i = 0; i < h.loops.length; i++) {
    const lp = h.loops[i];
    if (!b.air && b.vy < 0 && Math.abs(b.x - lp.x) < 11 && b.y - BR <= lp.fy + 1.5 && b.y > lp.fy - 4 && sp >= lp.minV) { b.loop = i; return "loop"; }
  }
  // tube mouths swallow a ball that rolls in
  for (i = 0; i < h.tubes.length; i++) {
    const tu = h.tubes[i];
    if (!b.air && Math.hypot(b.x - tu.x, b.y - tu.y) < tu.r - 3 && sp > 25) { b.tube = i; return "tube"; }
  }

  for (i = 0; i < h.walls.length; i++) imp = Math.max(imp, hitRect(b, h.walls[i]));
  for (i = 0; i < h.segs.length; i++) { const s = h.segs[i]; imp = Math.max(imp, hitSeg(b, s.x1, s.y1, s.x2, s.y2, s.t)); }
  for (i = 0; i < h.posts.length; i++) imp = Math.max(imp, hitCircle(b, h.posts[i].x, h.posts[i].y, h.posts[i].r));
  for (i = 0; i < h.palms.length; i++) imp = Math.max(imp, hitCircle(b, h.palms[i].x, h.palms[i].y, h.palms[i].r, 0.55));
  for (i = 0; i < h.bumpers.length; i++) {
    const bu = h.bumpers[i], hit = hitCircle(b, bu.x, bu.y, bu.r, 0.9);
    if (hit > 0.01) {
      const dx = b.x - bu.x, dy = b.y - bu.y, d = Math.hypot(dx, dy) || 1, vn = (b.vx * dx + b.vy * dy) / d;
      if (vn < BUMP_V) { b.vx += (BUMP_V - vn) * dx / d; b.vy += (BUMP_V - vn) * dy / d; }
      b.bumped = i + 1;
    }
  }
  for (i = 0; i < h.sliders.length; i++) { r = sliderRect(h.sliders[i], t); imp = Math.max(imp, hitRect(b, r, r.vx, 0)); }
  for (i = 0; i < h.rotors.length; i++) {
    const ro = h.rotors[i], a0 = rotorAngle(ro, t);
    imp = Math.max(imp, hitCircle(b, ro.x, ro.y, 6));
    for (let n = 0; n < ro.n; n++) {
      const a = a0 + n * TAU / ro.n;
      imp = Math.max(imp, hitSeg(b, ro.x, ro.y, ro.x + Math.cos(a) * ro.len, ro.y + Math.sin(a) * ro.len, 3.2,
        function (px, py) { return [-ro.speed * (py - ro.y), ro.speed * (px - ro.x)]; }));
    }
  }
  for (i = 0; i < h.windmills.length; i++) {
    const m = h.windmills[i];
    if (millBlocked(m, t)) imp = Math.max(imp, hitRect(b, { x: m.x - m.door / 2, y: m.front - 8, w: m.door, h: 8 }));
  }
  if (h.bridge && bridgeAngle(h.bridge, t) > 0.9) {            // a raised drawbridge closes the castle gate
    const br = h.bridge;
    imp = Math.max(imp, hitRect(b, { x: br.x1, y: br.y1 - 6, w: br.x2 - br.x1, h: 6 }));
  }
  for (i = 0; i < h.walls.length; i++) hitRect(b, h.walls[i]);   // walls win over moving pieces
  if (imp > 0.01) b.impact = Math.max(b.impact || 0, imp);

  // up and down: follow the turf, leave it off a lip, land again
  const g = groundAt(h, b.x, b.y, t, GB);
  if (b.air) {
    b.vz -= G_AIR * dt; b.z += b.vz * dt;
    if (b.z <= g.y) {
      if (g.k === 2) return "water";
      if (g.k === 0) return "lost";
      const hit = -b.vz;
      b.z = g.y;
      if (hit > 170) { b.vz = hit * 0.3; b.vx *= 0.92; b.vy *= 0.92; }
      else { b.air = false; b.vz = 0; }
      b.landed = Math.max(b.landed || 0, hit);
    }
    if (b.z < -BASE - 20) return "lost";
  } else {
    const zb = b.z + b.vz * dt - 0.5 * G_AIR * dt * dt;
    if (g.y < zb - 0.12) { b.air = true; b.z = zb; b.vz -= G_AIR * dt; b.airFrom = b.y; }
    else { b.vz = dt > 0 ? clamp((g.y - b.z) / dt, -500, 500) : 0; b.z = g.y; }
    if (g.k === 2 && !b.air) return "water";
  }

  if (!b.air) {
    const cdx = h.cup[0] - b.x, cdy = h.cup[1] - b.y, cd = Math.hypot(cdx, cdy);
    if (cd < CUP_R) {
      b.vx += cdx / (cd || 1) * 2600 * dt * (1 - cd / CUP_R);
      b.vy += cdy / (cd || 1) * 2600 * dt * (1 - cd / CUP_R);
      if (Math.hypot(b.vx, b.vy) < 330 && cd < CUP_R - 2) return "sunk";
    }
  }
  return "";
}
// Advance the ball over dt with substeps sized to its speed.
function advance(h, b, t, dt) {
  if (!(dt > 0)) return "";                                     // a zero-length frame: nothing moves
  if (!isFinite(b.vz) || !isFinite(b.z)) { b.vz = 0; b.z = turfH(h, b.x, b.y, t, 0); b.air = false; }
  const sp = Math.max(Math.hypot(b.vx, b.vy), Math.abs(b.vz) * 0.5);
  const n = clamp(Math.ceil(sp * dt / 1.8), 2, 48), sdt = dt / n;
  let ev = "";
  for (let i = 0; i < n && !ev; i++) ev = step(h, b, t + sdt * i, sdt);
  return ev;
}
function newBall(x, y, h) { return { x: x, y: y, vx: 0, vy: 0, z: h, vz: 0, air: false }; }

/* ---------------- The loop and the tubes, as paths ---------------- */
// Loop track: from the mouth (fx at the block front) up and over, landing at the exit. u in [0, 1].
// Returns course x, y and height above the turf. The ball shifts east as it goes round so it misses itself.
function loopPoint(lp, u, out) {
  const L = lp.fy - lp.exitY + BR + 2, a = u * TAU;
  const along = L * u + lp.R * Math.sin(a) * 1.0;
  out.x = lp.x + (lp.exitX - lp.x) * (u * u * (3 - 2 * u));
  out.y = lp.fy + BR + 1 - along;
  out.h = lp.R * (1 - Math.cos(a));
  return out;
}
// Tube: from the mouth up over the course and down to the exit. Course x, y and height.
function tubePoint(tu, u, out) {
  const s = u * u * (3 - 2 * u);
  out.x = tu.x + (tu.ex - tu.x) * s;
  out.y = tu.y + (tu.ey - tu.y) * s;
  const span = Math.hypot(tu.ex - tu.x, tu.ey - tu.y);
  out.h = BR + Math.sin(Math.PI * u) * (34 + span * 0.18);
  return out;
}

/* ---------------- Game state ---------------- */
let S = {}, keys = {}, parts = [], idleT = 0, paused = false, bests = [], playMode = "all";
let THREE = null, R = null;                                    // R holds everything the renderer owns
// V is how things are being shown (re-spot drops, the drop into the cup, the putter, the regulars). It never feeds the rules.
const V = { h: 0, vh: 0, sunk: false, pick: 0, flag: 0, snap: true, from: null, ripples: [], sandT: 0,
            putt: 0, puttA: 0, puttP: 0, react: "idle", reactT: 0, crowdCam: 0, bumpFlash: [], dropShown: 0 };
const MODES = { front: { list: FRONT, label: "FRONT 9" }, back: { list: BACK, label: "BACK 9" }, all: { list: FRONT.concat(BACK), label: "ALL 18" } };

function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* private mode */ } return null; }
function loadMode() { const m = store("npArcade." + SLUG + ".mode"); return MODES[m] ? m : "all"; }
function loadBests() {
  try { const a = JSON.parse(store("npArcade." + SLUG + ".holes") || "[]"); if (Array.isArray(a)) return a; } catch (e) { /* ignore */ }
  return [];
}
function parOf(list) { let p = 0; for (let i = 0; i < list.length; i++) p += HOLES[list[i]].par; return p; }

function reset() {
  paused = false;
  playMode = loadMode();
  S = { list: MODES[playMode].list, i: 0, hole: 0, strokes: 0, card: [], mode: "aim", t: 0, holeT: 0, timer: 0, slide: 0,
        ball: null, last: null, drag: null, aim: 0, power: 0, charging: false, chargeT: 0, kb: false, rest: 0,
        splashes: 0, aces: 0, loops: 0, tubes: 0, leaps: 0, parRow: 0, bestRow: 0, script: null, boostSnd: false, birdies: 0 };
  parts.length = 0;
  V.snap = true; V.from = null; V.ripples.length = 0; V.flag = 0; V.crowdCam = 0; react("idle");
  bests = loadBests();
  ledClear();
  setupHole(0);
}
function curHole() { return HOLES[S.hole]; }
function setupHole(i) {
  S.i = i; S.hole = S.list[i];
  const h = curHole();
  S.strokes = 0; S.holeT = 0; S.mode = "aim"; S.rest = 1; S.script = null;
  S.ball = newBall(h.tee[0], h.tee[1], turfH(h, h.tee[0], h.tee[1], 0, 0));
  S.last = { x: h.tee[0], y: h.tee[1] };
  V.h = 0; V.vh = 0; V.sunk = false; V.pick = 0; V.putt = 0;
  aimAtCup();
  ledHoleIntro();
}
function aimAtCup() {
  const h = curHole();
  S.aim = Math.atan2(h.cup[1] - S.ball.y, h.cup[0] - S.ball.x);
}
function canShoot() { return S.mode === "aim" && S.rest > 0.12; }

function shoot(angle, power) {
  if (!canShoot() || power < 0.04) return;
  const v = V_MIN + power * (V_MAX - V_MIN), b = S.ball;
  S.last = { x: b.x, y: b.y };
  b.vx = Math.cos(angle) * v; b.vy = Math.sin(angle) * v;
  b.leapDone = false; b.sanded = false;
  S.strokes++;
  S.mode = "roll";
  S.rest = 0;
  V.putt = 1; V.puttA = angle; V.puttP = power;
  Shell.sfx("hit");
  Shell.tone(150 + power * 90, 0.05, "triangle", 0.25);
}

function relLabel(d, strokes) {
  if (strokes === 1) return "HOLE IN ONE!";
  if (d <= -3) return "ALBATROSS!";
  if (d === -2) return "EAGLE!";
  if (d === -1) return "BIRDIE!";
  if (d === 0) return "PAR";
  if (d === 1) return "BOGEY";
  if (d === 2) return "DOUBLE BOGEY";
  return "+" + d;
}
function fmt(n) { return n === 0 ? "E" : n > 0 ? "+" + n : String(n); }
function playedRel() {
  let used = 0, par = 0;
  for (let i = 0; i < S.list.length; i++) { const s = S.card[S.list[i]]; if (s != null) { used += s; par += HOLES[S.list[i]].par; } }
  return { used: used, par: par, rel: used - par };
}

function finishHole(sunk) {
  const h = curHole(), hi = S.hole;
  S.card[hi] = S.strokes;
  const d = S.strokes - h.par;
  S.parRow = sunk && d <= 0 ? S.parRow + 1 : 0;
  S.bestRow = Math.max(S.bestRow, S.parRow);
  if (window.NPRewards && S.parRow >= 2) window.NPRewards.streak(S.parRow, S.parRow === 2 ? "2 PARS IN A ROW!" : "");
  if (bests[hi] == null || S.strokes < bests[hi]) { bests[hi] = S.strokes; store("npArcade." + SLUG + ".holes", JSON.stringify(bests)); }
  let led = "";
  if (!sunk) {
    Shell.flash("PICKED UP", "Max " + MAX_STROKES + " strokes. On to the next one.", "#8e93a2", 1300);
    Shell.sfx("miss");
    V.pick = 0.001; led = "picked"; react("groan");
  } else if (S.strokes === 1) {
    S.aces++;
    Shell.flash("HOLE IN ONE!", "One stroke on " + h.name + ".", "#ffd23f", 1900);
    if (window.Trophies) window.Trophies.unlock("mgc-ace");
    Shell.sfx("best"); Shell.sfx("crowd");
    burst(h.cup[0], h.cup[1], Shell.reduced ? 30 : 100);
    Shell.shake(4, 0.35); camShake(5, 0.4);
    led = "ace"; react("cheer"); V.crowdCam = 2.4;
  } else {
    const col = d < 0 ? "#9bff3f" : d === 0 ? "#3ff0ff" : "#ff3fa4";
    Shell.flash(relLabel(d, S.strokes), S.strokes + " strokes", col, 1250);
    if (d < 0) { S.birdies++; Shell.sfx("score"); Shell.sfx("crowd"); burst(h.cup[0], h.cup[1], Shell.reduced ? 12 : 36); react("cheer"); }
    else if (d === 0) react("clap");
    else react("groan");
    led = d <= -2 ? "eagle" : d === -1 ? "birdie" : d === 0 ? "par" : "bogey";
  }
  if (window.Trophies && sunk) {
    if (h.theme === 6 && d <= 0) window.Trophies.unlock("mgc-volcano");
    if (h.theme === 15) window.Trophies.unlock("mgc-moat");
  }
  if (sunk) { V.sunk = true; V.vh = Math.min(V.vh, -30); }
  ledResult(led, sunk ? relLabel(d, S.strokes) : "PICKED UP");
  S.mode = "done";
  S.timer = sunk && S.strokes === 1 ? 2.5 : 1.45;
}

function nextHole() {
  if (S.i >= S.list.length - 1) { endRound(); return; }
  if (R) V.from = { pos: R.camPos.clone(), tgt: R.camTgt.clone() };   // the camera flies on from wherever it is
  const turn = S.list.length === 18 && S.i === 8;
  setupHole(S.i + 1);
  S.mode = "slide"; S.slide = 1;
  V.h = 18; V.vh = 0;                                           // the ball is set down on the new tee
  react("idle");
  if (turn) {
    const p = playedRel();
    Shell.flash("AT THE TURN", "Front nine: " + p.used + " (" + fmt(p.rel) + "). Nine to go.", "#ff9214", 1700);
  }
  Shell.sfx("whoosh");
}

function endRound() {
  const p = playedRel();
  ledFinal(p.rel);
  react(p.rel <= 0 ? "cheer" : "clap");
  const title = p.rel < 0 ? "UNDER PAR!" : p.rel === 0 ? "EVEN PAR" : "ROUND OVER";
  if (window.Trophies) {
    if (p.rel < 0) window.Trophies.unlock("mgc-under");
    if (S.list.length === 18) window.Trophies.unlock("mgc-18");
    if (S.splashes === 0) window.Trophies.unlock("mgc-dry");
  }
  Shell.gameOver(p.rel, { title: title, html: scorecard(p),
    stats: { mode: playMode, holes: S.list.length, total: p.used, par: p.par, rel: p.rel, aces: S.aces, birdies: S.birdies,
             splashes: S.splashes, loops: S.loops, tubes: S.tubes, leaps: S.leaps, bestParRun: S.bestRow,
             card: S.list.map(function (i) { return S.card[i]; }), pars: S.list.map(function (i) { return HOLES[i].par; }) } });
}

function scorecard(p) {
  const nines = [];
  for (let i = 0; i < S.list.length; i += 9) nines.push(S.list.slice(i, i + 9));
  let html = "";
  nines.forEach(function (nine) {
    const out = nine[0] === 0 ? "OUT" : "IN";
    let par = 0, you = 0;
    let row1 = "<tr><th>Hole</th>", row2 = "<tr><th>Par</th>", row3 = "<tr><th>You</th>", row4 = "<tr><th>Best</th>";
    nine.forEach(function (hi) {
      const s = S.card[hi], b = bests[hi], pr = HOLES[hi].par;
      par += pr; you += s || 0;
      const col = s == null ? "" : s < pr ? "#7dff3a" : s === pr ? "" : "#ff8ac8";
      row1 += "<th>" + (hi + 1) + "</th>"; row2 += "<td>" + pr + "</td>";
      row3 += "<td>" + (s == null ? "-" : (s === 1 ? "<b style='color:#ffd23f'>1</b>" : col ? "<b style='color:" + col + "'>" + s + "</b>" : s)) + "</td>";
      row4 += "<td>" + (b == null ? "-" : b) + "</td>";
    });
    html += '<div style="overflow-x:auto;margin:6px 0"><table aria-label="Scorecard ' + out + '" style="font-size:11px">' +
      row1 + "<th>" + out + "</th></tr>" + row2 + "<td><b>" + par + "</b></td></tr>" + row3 + "<td><b>" + you + "</b></td></tr>" + row4 + "<td></td></tr></table></div>";
  });
  html += '<div class="np-row"><span>Total strokes</span><b>' + p.used + " (par " + p.par + ")</b></div>";
  html += '<div class="np-row"><span>Course</span><b>' + MODES[playMode].label + "</b></div>";
  if (S.aces) html += '<div class="np-row"><span>Holes in one</span><b>' + S.aces + "</b></div>";
  html += '<div class="np-row"><span>Splashes</span><b>' + S.splashes + "</b></div>";
  return html;
}

/* ---------------- Update ---------------- */
const LP = { x: 0, y: 0, h: 0 };
function update(dt) {
  S.t += dt; S.holeT += dt;
  const h = curHole(), b = S.ball;
  updateParts(dt);

  if (S.mode === "slide") {
    S.slide -= dt / (Shell.reduced ? 0.15 : SLIDE_T);
    if (S.slide <= 0) { S.slide = 0; S.mode = "aim"; S.rest = 1; aimAtCup(); }
    return;
  }
  if (S.mode === "done") {
    S.timer -= dt;
    if (S.timer <= 0) nextHole();
    return;
  }
  if (S.mode === "script") {                                     // riding the loop or a tube
    const sc = S.script;
    sc.t += dt;
    if (sc.t >= sc.dur) {
      if (sc.kind === "loop") {
        const lp = h.loops[sc.i];
        b.x = lp.exitX; b.y = lp.exitY; b.vx = 0; b.vy = -Math.max(180, sc.v * 0.84);
        Shell.tone(520, 0.12, "square", 0.18, 900);
      } else {
        const tu = h.tubes[sc.i], l = Math.hypot(tu.dx, tu.dy) || 1, v = Math.max(150, sc.v * tu.k);
        b.x = tu.ex; b.y = tu.ey; b.vx = tu.dx / l * v; b.vy = tu.dy / l * v;
        Shell.noise(0.2, 0.3, 900, 0.8, 0, 300);
      }
      b.z = turfH(h, b.x, b.y, S.holeT, 0); b.vz = 0; b.air = false;
      S.mode = "roll"; S.script = null; S.rest = 0;
    }
    return;
  }

  if (S.mode === "aim") {
    const turn = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
    const fine = (keys.ArrowUp ? -1 : 0) + (keys.ArrowDown ? 1 : 0);
    if (turn || fine) { S.aim += (turn * 2.2 + fine * 0.45) * dt; S.kb = true; }
    if (S.charging) {
      S.chargeT += dt;
      const ph = (S.chargeT / 1.25) % 2;
      S.power = ph < 1 ? ph : 2 - ph;
    }
  }

  // physics runs even at rest so moving pieces and slopes can move the ball
  const ev = advance(h, b, S.holeT, dt);
  if (b.impact) { if (b.impact > 60) Shell.sfx("click"); b.impact = 0; }
  if (b.bumped) {
    V.bumpFlash[b.bumped - 1] = 1;
    Shell.tone(880 + Math.random() * 200, 0.08, "square", 0.22); Shell.tone(1320, 0.12, "triangle", 0.16, 0, 0.04);
    b.bumped = 0;
  }
  if (b.landed) {
    if (b.landed > 90) Shell.noise(0.06, Math.min(0.5, b.landed / 600), 400, 0.8, 0, 0, "lowpass");
    if (h.leap && !b.leapDone && b.y < h.leap.land && b.airFrom >= h.leap.land) {
      b.leapDone = true; S.leaps++;
      Shell.flash("AIRMAIL!", "Cleared the lagoon.", "#3ff0ff", 1000);
      if (window.Trophies) window.Trophies.unlock("mgc-leap");
      ledPlay([ledMsg("flash", "AIRMAIL!", 1.6)]);
      Shell.sfx("boost");
    }
    b.landed = 0;
  }
  if (b.boosted) { if (!S.boostSnd) { Shell.sfx("boost"); S.boostSnd = true; } b.boosted = false; }
  else S.boostSnd = false;

  if (ev === "sunk") {
    b.vx = b.vy = 0; b.x = h.cup[0]; b.y = h.cup[1];
    Shell.sfx("cup");
    finishHole(true);
    return;
  }
  if (ev === "loop") {
    S.mode = "script"; S.script = { kind: "loop", i: b.loop, t: 0, dur: Shell.reduced ? 0.4 : 0.8, v: Math.hypot(b.vx, b.vy) };
    S.loops++;
    Shell.sfx("boost"); Shell.tone(300, 0.6, "sawtooth", 0.12, 1100);
    if (window.Trophies) window.Trophies.unlock("mgc-loop");
    ledPlay([ledMsg("cycle", "LOOP-DE-LOOP!", 1.8)]);
    return;
  }
  if (ev === "tube") {
    const tu = h.tubes[b.tube];
    S.mode = "script"; S.script = { kind: "tube", i: b.tube, t: 0, dur: clamp(Math.hypot(tu.ex - tu.x, tu.ey - tu.y) / 260, 0.55, 1.0), v: Math.hypot(b.vx, b.vy) };
    S.tubes++;
    Shell.tone(220, 0.35, "triangle", 0.2, 660); Shell.noise(0.4, 0.18, 600, 1, 0, 2400);
    ledPlay([ledMsg("slide", "TUBE RIDE!", 1.5, { color: "violet" })]);
    return;
  }
  if (ev === "water" || ev === "lost") {
    if (ev === "water") {
      S.strokes++; S.splashes++;
      Shell.sfx("splash");
      splash(b.x, b.y);
      Shell.flash("SPLASH", "In the drink. +1 stroke.", "#3ff0ff", 1000);
      ledPlay([ledMsg("blink", "SPLASH! +1", 1.8, { color: "cyan" })]);
      react("groan");
    } else Shell.flash("OUT OF BOUNDS", "Back where you played it from.", "#8e93a2", 900);
    const g = turfH(h, S.last.x, S.last.y, S.holeT, 0);
    S.ball = newBall(S.last.x, S.last.y, g);
    V.h = ev === "water" ? 24 : 14; V.vh = 0;                     // dropped back where the shot was played from
    if (S.strokes >= MAX_STROKES) { finishHole(false); return; }
    S.mode = "aim"; S.rest = 0;
    return;
  }

  const sp = Math.hypot(b.vx, b.vy);
  if (sp < STOP && !b.air) {
    b.vx = b.vy = 0;
    S.rest += dt;
    if (S.mode === "roll" && S.rest > 0.15) {
      if (S.strokes >= MAX_STROKES) { finishHole(false); return; }
      S.mode = "aim";
      if (!S.kb) aimAtCup();
    }
  } else {
    S.rest = 0;
    if (sp > 70 && !Shell.reduced) {                             // sand sprays where the ball plows through it
      for (let i = 0; i < h.sand.length; i++) if (inRect(b.x, b.y, h.sand[i])) {
        V.sandT -= dt;
        if (V.sandT <= 0) { V.sandT = 0.035; sandPuff(b.x, b.y, sp); }
        break;
      }
    }
  }
}

/* ---------------- Particles (drawn on the HUD layer, placed through the 3D camera) ---------------- */
const CONF_COLS = ["#3ff0ff", "#ff3fa4", "#9bff3f", "#ffd23f", "#a77bff", "#ff8a1e"];
function burst(x, y, n) {
  const p = courseToScreen(x, y, ballBase() + 8);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 60 + Math.random() * 230;
    parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 130, life: 1.2 + Math.random() * 0.9, g: 260,
      c: CONF_COLS[i % CONF_COLS.length], w: 2.5 + (i % 3), rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14, kind: 0 });
  }
}
function splash(x, y) {
  const w = curHole().water;
  for (let i = 0; i < w.length; i++) if (inRect(x, y, w[i], 2)) {
    const ix = Math.min(12, w[i].w / 2), iy = Math.min(12, w[i].h / 2);
    x = clamp(x, w[i].x + ix, w[i].x + w[i].w - ix); y = clamp(y, w[i].y + iy, w[i].y + w[i].h - iy);
    break;
  }
  const p = courseToScreen(x, y, WATER_Y);
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * TAU, s = 30 + Math.random() * 90;
    parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 90, life: 0.55 + Math.random() * 0.25, g: 320,
      c: i % 3 ? "#bff6ff" : "#ffffff", w: 1.5 + Math.random() * 2, rot: 0, vr: 0, kind: 1 });
  }
  V.ripples.push({ x: x, y: y, t: 0, hole: S.hole });
  if (V.ripples.length > 3) V.ripples.shift();
}
function sandPuff(x, y, sp) {
  const p = courseToScreen(x, y, ballBase() + 2), a = Math.random() * TAU, s = 12 + Math.min(60, sp * 0.12) * Math.random();
  parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - 45, life: 0.45, g: 240,
    c: Math.random() < 0.5 ? "#f6e3b4" : "#e8cf92", w: 1.8, rot: 0, vr: 0, kind: 1 });
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt; p.vy += p.g * dt; p.vx *= 0.98; p.rot += p.vr * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0) parts.splice(i, 1);
  }
}
function ballBase() { return S.ball ? S.ball.z : 0; }

/* ---------------- Input ---------------- */
// Drag back from anywhere, let go to putt: the pull sets the power, the line it draws on screen sets the aim.
function pointer(type, x, y) {
  if (type === "down") {
    if (!canShoot()) return;
    S.drag = { sx: x, sy: y, x: x, y: y };
    S.kb = false; S.charging = false;
  } else if (type === "move" && S.drag) {
    S.drag.x = x; S.drag.y = y;
  } else if ((type === "up" || type === "cancel") && S.drag) {
    const shot = dragShot();
    S.drag = null;
    if (type === "cancel" || !shot) return;
    shoot(shot.a, shot.p);
  }
}
function dragShot() {
  if (!S.drag) return null;
  const dx = S.drag.sx - S.drag.x, dy = S.drag.sy - S.drag.y, len = Math.hypot(dx, dy);
  if (len < 7) return null;
  return { a: aimFromScreen(dx / len, dy / len), p: clamp(len / MAX_PULL, 0, 1) };
}
function aimFromScreen(ux, uy) {
  if (R && R.camReady) {
    const b = S.ball, p0 = courseToScreen(b.x, b.y, b.z);
    const g = screenToCourse(p0.x + ux * 24, p0.y + uy * 24, b.z);
    if (g) {
      const ax = g.x - b.x, ay = g.y - b.y;
      if (ax * ax + ay * ay > 1e-6) return Math.atan2(ay, ax);
    }
  }
  return Math.atan2(uy, ux);
}
function key(type, code, e) {
  const act = code === "Space" || code === "Enter" || code === "NumpadEnter";
  if (type === "down") {
    keys[code] = true;
    if (act && !e.repeat && canShoot() && !S.charging) { S.charging = true; S.chargeT = 0; S.power = 0; S.kb = true; S.drag = null; }
  } else {
    keys[code] = false;
    if (act && S.charging) { S.charging = false; shoot(S.aim, S.power); S.power = 0; }
  }
}

/* ---------------- The course regulars: what they are doing ---------------- */
function react(kind) { V.react = kind; V.reactT = 0; }

/* =====================================================================================
   LED ribbon board: the strip across the top of the hole board behind every cup.
   A real dot matrix: everything is painted into a small canvas, one pixel per LED, and a small
   shader turns each pixel into a glowing dot. It scrolls its programme right to left and cuts to
   big animated messages when something happens on the hole.
   ===================================================================================== */
const LED_ROWS = 22, LED_COLS = Math.round((SIGN_W - 10) / (LED_H / LED_ROWS));
const LED_SPEED = 40;
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["18 HOLES OF SUNSHINE", "pink"], ["NO QUARTERS REQUIRED", "cyan"]];
const LED_PLUGS = [
  ["SHELF LINKS", "MORE MINI GOLF"], ["TAPE PIN LANES", "3D BOWLING"], ["BARGAIN BIN BUCKETS", "HOOPS"],
  ["BLEACHER CARTS", "HOME RUN DERBY"], ["TICKET ROLL ALLEY", "ROLL FOR TICKETS"], ["PAWN SHOP POOL", "RACK 'EM UP"],
  ["RINK RAT SHOOTOUT", "HOCKEY SHOOTOUT"], ["FOURTH AND COLLECT", "SPLIT THE UPRIGHTS"], ["POWDER DAY HAUL", "HIT THE SLOPES"],
  ["TABLE RINK RUMBLE", "AIR HOCKEY"], ["FLEA FORTRESS FLYBY", "PLAY IT FREE"], ["CREATURE FEATURE KO", "VHS BOSS RUSH"]
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

// The scrolling programme, painted once into one long strip.
function ledStrip(script) {
  const HH = LED_ROWS, big = LED_BIG, yBig = Math.floor((HH - 7 * big) / 2), GAP = 12, items = [];
  // the wordmark at board resolution: cream lettering pushed to full brightness, the red edge kept as a dim rim
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
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    }
    mg.putImageData(im, 0, 0);
  } catch (e) { /* leave it as drawn */ }
  function mark() { items.push({ w: markW, draw: function (g, x) { g.drawImage(markC, x, 0); } }); }
  function line(str, color) { items.push({ w: ledTextW(str, big), draw: function (g, x) { ledText(g, str, x, yBig, big, big, color); } }); }
  function plug(name, tag, color) {
    const ns = 1, ts = 1, pad = 6, tab = ledTextW("FREE", ts) + 4;
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
  return { canvas: c, g: g, strip: strip.canvas, scroll: start, pos: -1, msg: null, queue: [], frame: -1, tex: null };
}
function ledDotCanvas() {
  const c = mkCanvas(32, 32), g = c.getContext("2d");
  g.fillStyle = "#000000"; g.fillRect(0, 0, 32, 32);
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.45, "#f4f4f4"); gr.addColorStop(0.8, "#585858"); gr.addColorStop(1, "#000000");
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return c;
}
// kind: "flash" (strobe and chevrons), "slide", "cycle", "blink" or "count" (label and a relative-to-par score)
function ledMsg(kind, text, dur, more) {
  const m = { kind: kind, text: text, dur: dur, t: 0, wait: 0, color: "amber" };
  if (more) for (const k in more) m[k] = more[k];
  return m;
}
function ledPlay(list, append) {
  const L = LED;
  if (!L || !list.length) return;
  if (append && L.msg) { for (let i = 0; i < list.length; i++) L.queue.push(list[i]); return; }
  L.msg = list[0]; L.msg.t = 0;
  L.queue = list.slice(1);
  L.frame = -1;
}
function ledClear() { if (!LED) return; LED.msg = null; LED.queue = []; LED.pos = -1; }
function ledHoleIntro() {
  const h = curHole();
  ledPlay([ledMsg("slide", "HOLE " + (S.hole + 1) + "  PAR " + h.par, 2.2, { color: "cyan", wait: 0.4 }),
           ledMsg("slide", h.name.toUpperCase(), 2.6, { color: "yellow" })]);
}
function ledResult(kind, text) {
  const list = [], p = playedRel();
  if (kind === "ace") list.push(ledMsg("flash", "HOLE IN ONE!", 3.4), ledMsg("cycle", "ACE ON " + (S.hole + 1), 1.8));
  else if (kind === "eagle") list.push(ledMsg("flash", text, 2.6));
  else if (kind === "birdie") list.push(ledMsg("cycle", text, 2.4));
  else if (kind === "par") list.push(ledMsg("slide", "PAR", 1.8, { color: "white" }));
  else if (kind === "bogey") list.push(ledMsg("blink", text, 1.8, { color: "pink" }));
  else if (kind === "picked") list.push(ledMsg("blink", "PICKED UP", 1.8, { color: "red" }));
  list.push(ledMsg("count", "TOTAL", 2.2, { value: fmt(p.rel) }));
  ledPlay(list);
}
function ledFinal(rel) { ledPlay([ledMsg("count", "FINAL", 7, { value: fmt(rel), final: true })]); }

function ledDrawMsg(g, m) {
  const WW = LED_COLS, HH = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(WW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.amber;
  function fit(str) { let sx = big; while (sx > 1 && ledTextW(str, sx) > WW - 10) sx--; return sx; }
  function chase(color, dir) {
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < WW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(WW - x - 3, HH - 1, 3, 1); }
  }
  if (m.kind === "count") {
    const label = m.text + " ", str = label + m.value, sxc = fit(str), x = Math.round((WW - ledTextW(str, sxc)) / 2);
    const blink = m.final && !calm && Math.floor(m.t * 3) % 2 === 1;
    const xn = ledText(g, label, x, yBig, sxc, big, LED_C.amber);
    ledText(g, m.value, xn, yBig, sxc, big, blink ? LED_C.amber : m.value[0] === "-" ? LED_C.lime : m.value === "E" ? LED_C.white : LED_C.pink);
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
      const off = Math.round(w / 2) + 7 + k * span + ph;
      if (off > mid + span) break;
      const cc = k % 2 ? LED_C.red : LED_C.orange;
      ledText(g, ">", mid + off, yBig, big, big, cc);
      ledText(g, "<", mid - off - 5 * big, yBig, big, big, cc);
    }
    const cyc = [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0, yBig, sx, big, calm ? LED_C.yellow : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 12; i++) g.fillRect((Math.random() * WW) | 0, (Math.random() * HH) | 0, 1, 1); }
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "slide") {
    const k = calm || m.t < m.wait ? (m.t < m.wait ? 0 : 1) : Math.min(1, t / 0.45), e = 1 - Math.pow(1 - k, 3);
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
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 8; i++) g.fillRect((Math.random() * WW) | 0, (Math.random() * HH) | 0, 1, 1); }
    chase(LED_C.yellow, 1);
    return;
  }
  if (calm || t > 1.1 || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, yBig, sx, big, col);
  g.fillStyle = col; g.fillRect(0, HH - 1, WW, 1); g.fillRect(0, 0, WW, 1);
}
function ledDraw() {
  const L = LED, g = L.g;
  g.fillStyle = "#000000"; g.fillRect(0, 0, LED_COLS, LED_ROWS);
  if (L.msg) { ledDrawMsg(g, L.msg); return; }
  const sw = L.strip.width;
  let sx = L.pos, dx = 0;
  while (dx < LED_COLS) {
    const n = Math.min(LED_COLS - dx, sw - sx);
    g.drawImage(L.strip, sx, 0, n, LED_ROWS, dx, 0, n, LED_ROWS);
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
   Music: an original sunny synth loop, made entirely in code with the Web Audio API.
   startMusic is self-contained: it knows nothing about the game. Hand it an AudioContext and a
   node to play into; it schedules its own notes and returns a function that stops it.
   ===================================================================================== */
function startMusic(ctx, dest) {
  const BPM = 116, STEP = 60 / BPM / 4, BARS = 16, AHEAD = 0.5;
  const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  // the tune, a bar a line: step in the bar, note, length in steps (F major, sunny side up)
  const LEAD_SRC = [
    "0A4-2 2C5-2 4F5-3 7E5-1 8F5-2 10A5-2 12G5-4",
    "0E5-2 2C5-2 4E5-2 6A5-2 8G5-3 11E5-1 12C5-4",
    "0D5-2 2F5-2 4A#5-3 7A5-1 8G5-2 10F5-2 12D5-4",
    "0E5-3 3G5-1 4C6-4 8A#5-2 10A5-2 12G5-4",
    "0A5-2 2G5-1 3F5-1 4C5-2 6F5-2 8A5-3 11C6-1 12A5-4",
    "0C6-2 2A5-2 4E5-2 6G5-2 8A5-2 10E5-2 12C5-4",
    "0D5-2 2G5-2 4A#5-2 6D6-2 8C6-2 10A#5-2 12G5-4",
    "0E5-2 2G5-2 4C6-6 10A#5-2 12G5-2 14E5-2",
    "0F5-4 4A5-4 8D6-3 11C6-1 12A5-4",
    "0D6-3 3C6-1 4A#5-2 6F5-2 8D5-4 12F5-4",
    "0C6-2 2A5-2 4F5-2 6A5-2 8C6-3 11D6-1 12C6-4",
    "0G5-4 4E5-2 6G5-2 8C6-2 10E6-2 12D6-4",
    "0A5-2 2D6-2 4F6-3 7E6-1 8D6-2 10A5-2 12F5-4",
    "0A#5-2 2D6-2 4F6-2 6D6-2 8C6-2 10A#5-2 12A5-4",
    "0G5-2 2A#5-2 4D6-2 6A#5-2 8G5-2 10A5-2 12A#5-2 14B5-2",
    "0C6-3 3G5-1 4E5-2 6C5-2 8G5-4"
  ];
  const CH = { F: [41, 65, 69, 72], Am: [45, 64, 69, 72], Bb: [46, 65, 70, 74], C: [48, 64, 67, 72], Gm: [43, 62, 67, 70], Dm: [38, 62, 65, 69] };
  const PROG = "F Am Bb C F Am Gm C Dm Bb F C Dm Bb Gm C".split(" ");
  const lead = new Array(BARS * 16).fill(null);
  LEAD_SRC.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(#?)(\d)-(\d+)$/.exec(tok);
      if (m) lead[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + semis[m[2]] + (m[3] ? 1 : 0), Number(m[5])];
    });
  });
  function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  const out = ctx.createGain(); out.gain.value = 0; out.connect(dest);
  out.gain.setTargetAtTime(1, ctx.currentTime + 0.05, 0.08);
  function filt(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const leadBus = filt("lowpass", 3400, 0.6, out), bassBus = filt("lowpass", 760, 1.1, out), padBus = filt("lowpass", 1500, 0.5, out);
  const send = ctx.createGain(), echo = ctx.createDelay(1), back = ctx.createGain(), damp = filt("lowpass", 2000, 0.7, out);
  send.gain.value = 0.26; echo.delayTime.value = STEP * 3; back.gain.value = 0.3;
  leadBus.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(damp);
  const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate), ctx.sampleRate), nd = nb.getChannelData(0);
  let seed = 0x1234567;
  for (let i = 0; i < nd.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; nd[i] = ((seed >>> 0) / 4294967296) * 2 - 1; }

  function note(to, type, f, t, dur, vol, hold, f1, detune) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.01, dur * (hold == null ? 0.6 : hold));
    o.type = type; o.frequency.setValueAtTime(f, t); if (detune) o.detune.value = detune;
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(t, dur, vol, type, f, q) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nb; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t, (t * 7.3) % 0.8); s.stop(t + dur + 0.05);
  }
  function play(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[bar]], B = bar >= 8, n = lead[i];
    if (n) { note(leadBus, "square", mtof(n[0]), t, n[1] * STEP * 0.95, 0.13, 0.55, 0, -6); note(leadBus, "square", mtof(n[0]), t, n[1] * STEP * 0.95, 0.07, 0.55, 0, 7); }
    if (s === 0) for (let k = 1; k < 4; k++) note(padBus, "triangle", mtof(ch[k] - 12), t, STEP * 15.5, 0.045, 0.85);
    if ([0, 3, 6, 8, 11, 14].indexOf(s) >= 0) {                  // syncopated bass: root, root, fifth, octave
      const off = s === 6 || s === 14 ? 7 : s === 11 ? 12 : 0;
      note(bassBus, "sawtooth", mtof(ch[0] + off), t, STEP * 1.6, 0.24, 0.5);
    }
    note(out, "sine", mtof(ch[1 + (s % 3)] + 12), t, STEP * 0.9, s % 2 ? 0.03 : 0.05, 0.3);   // a little sparkle arpeggio
    if (s % 4 === 2) hiss(t, 0.05, 0.09, "highpass", 7600);
    if (s === 14) hiss(t, 0.16, 0.07, "highpass", 6200);
    if (s === 4 || s === 12) { hiss(t, 0.14, 0.26, "bandpass", 1700, 0.7); note(out, "triangle", 210, t, 0.07, 0.16, 0.1, 140); }
    if (B && s === 12) hiss(t + 0.012, 0.1, 0.16, "bandpass", 1200, 1.2);
    if (s === 0 || s === 8 || (B && s === 10) || (!B && s === 7 && bar % 2 === 1)) note(out, "sine", 140, t, 0.17, 0.5, 0.08, 44);
    if ((bar === 7 || bar === 15) && s >= 12) { hiss(t, 0.09, 0.14 + 0.03 * (s - 12), "bandpass", 2200, 0.8); note(out, "triangle", 180 + 30 * (s - 12), t, 0.06, 0.12, 0.2); }
  }
  let stepI = 0, nextT = ctx.currentTime + 0.12, alive = true;
  function pump() {
    if (!alive) return;
    const now = ctx.currentTime;
    if (nextT < now) nextT = now + 0.03;
    while (nextT < now + AHEAD) { play(stepI, nextT); stepI = (stepI + 1) % (BARS * 16); nextT += STEP; }
  }
  pump();
  const timer = setInterval(pump, 90);
  return function stop() {
    if (!alive) return;
    alive = false; clearInterval(timer);
    const now = ctx.currentTime;
    out.gain.cancelScheduledValues(now); out.gain.setTargetAtTime(0, now, 0.05);
    setTimeout(function () { try { out.disconnect(); } catch (e) { /* gone */ } }, 900);
  };
}

// The jukebox: owns the AudioContext (made on the first tap, click or key press), follows the shell's mute
// button, and runs the music only while a round is being played and the music setting is on.
const MUSIC_KEY = "npArcade.music", MUSIC_VOL = 0.16;
const Juke = (function () {
  let ac = null, master = null, dead = false, stopFn = null, musicOn = store(MUSIC_KEY) !== "0";
  const buttons = [];
  function shellMuted() {
    const b = document.getElementById("np-mute");
    if (b) return b.getAttribute("aria-pressed") === "true";
    return store("npArcade.muted") === "1";
  }
  function unlock() {
    if (dead) return;
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        ac = new AC();
        master = ac.createGain(); master.gain.value = shellMuted() ? 0 : MUSIC_VOL;
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4;
        master.connect(comp); comp.connect(ac.destination);
      }
      if (ac.state !== "running") { const p = ac.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { ac = null; dead = true; }
  }
  function pump() {
    if (!ac || !window.Shell) return;
    const m = shellMuted();
    master.gain.setTargetAtTime(m ? 0 : MUSIC_VOL, ac.currentTime, 0.03);
    const want = musicOn && !m && ac.state === "running" && Shell.state() === "playing";
    if (want && !stopFn) stopFn = startMusic(ac, master);
    else if (!want && stopFn) { stopFn(); stopFn = null; }
  }
  function label() {
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].textContent = musicOn ? "MUSIC: ON" : "MUSIC: OFF";
      buttons[i].setAttribute("aria-pressed", musicOn ? "true" : "false");
    }
  }
  function setMusic(on) { musicOn = !!on; store(MUSIC_KEY, musicOn ? "1" : "0"); label(); pump(); }
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
    unlock: unlock, pump: pump, button: button,
    newGame: function () { unlock(); if (stopFn) { stopFn(); stopFn = null; } pump(); },
    toggle: function () { unlock(); setMusic(!musicOn); },
    peek: function () { return { made: !!ac, state: ac ? ac.state : "none", playing: !!stopFn, musicOn: musicOn }; }
  };
})();

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
function shade(hex, k) {                                       // k > 0 toward white, k < 0 toward black
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
const DISPLAY = '"Arial Black", "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
// Big glossy sunset lettering: navy outline, white keyline, orange-to-pink fill.
function candyText(g, str, x, y, size, maxW, fill) {
  g.font = "900 " + size + "px " + DISPLAY;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + DISPLAY; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = size * 0.34; g.strokeStyle = "#1a0f4a"; g.strokeText(str, x, y + size * 0.07);
  g.lineWidth = size * 0.16; g.strokeStyle = "#ffffff"; g.strokeText(str, x, y);
  const gr = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  (fill || [["0", "#fff27a"], ["0.5", "#ffb31a"], ["1", "#ff4f7a"]]).forEach(function (s) { gr.addColorStop(Number(s[0]), s[1]); });
  g.fillStyle = gr; g.fillText(str, x, y);
  g.fillStyle = "rgba(255,255,255,.4)";
  g.save(); g.beginPath(); g.rect(x - 900, y - size * 0.5, 1800, size * 0.34); g.clip(); g.fillText(str, x, y); g.restore();
}

/* ---------------- The wordmark ---------------- */
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

/* ---------------- Ground ---------------- */
// Putting turf: one tile is 96 units, mown in diamonds so slopes catch the light differently.
function turfCanvas() {
  const S2 = 256, c = mkCanvas(S2, S2), g = c.getContext("2d"), rnd = rng(5);
  g.fillStyle = "#2fbd56"; g.fillRect(0, 0, S2, S2);
  g.save(); g.translate(S2 / 2, S2 / 2); g.rotate(Math.PI / 4);
  for (let i = -4; i < 4; i++) for (let j = -4; j < 4; j++) if ((i + j) & 1) { g.fillStyle = "#36c95f"; g.fillRect(i * 45.25, j * 45.25, 45.25, 45.25); }
  g.restore();
  for (let i = 0; i < 9000; i++) {                             // the nap
    g.fillStyle = rnd() < 0.5 ? "rgba(255,255,220,.06)" : "rgba(0,60,20,.08)";
    g.fillRect(rnd() * S2, rnd() * S2, 1, 1 + rnd() * 2);
  }
  return c;
}
// The park lawn between the holes, with clover and a few dandelions. One tile is 240 units.
function lawnCanvas() {
  const S2 = 512, c = mkCanvas(S2, S2), g = c.getContext("2d"), rnd = rng(41);
  g.fillStyle = "#3c9a3a"; g.fillRect(0, 0, S2, S2);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S2, y = rnd() * S2, r = 20 + rnd() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rnd() < 0.5 ? "rgba(90,170,60,.35)" : "rgba(30,110,40,.35)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    for (let ox = -S2; ox <= S2; ox += S2) for (let oy = -S2; oy <= S2; oy += S2) { g.fillStyle = gr; g.save(); g.translate(ox, oy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
  }
  speckle(g, S2, S2, 16000, rnd, "rgba(200,255,150,.08)", "rgba(10,60,20,.12)", 2);
  for (let i = 0; i < 40; i++) {
    const x = rnd() * S2, y = rnd() * S2;
    g.fillStyle = i % 3 ? "#fff6a8" : "#ffffff"; g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill();
  }
  return c;
}
// Pastel stucco for the sides of the raised greens, with a tile cap along the top edge (v = 1 is the top).
function stuccoCanvas(col, trim) {
  const c = mkCanvas(256, 64), g = c.getContext("2d"), rnd = rng(col.length * 13);
  g.fillStyle = col; g.fillRect(0, 0, 256, 64);
  speckle(g, 256, 64, 1800, rnd, "rgba(255,255,255,.10)", "rgba(80,40,60,.10)", 1.5);
  g.fillStyle = trim; g.fillRect(0, 0, 256, 13);
  for (let x = 0; x < 256; x += 32) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x, 0, 2, 13); g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(x + 2, 1, 28, 3); }
  g.fillStyle = "rgba(40,20,40,.25)"; g.fillRect(0, 13, 256, 2);
  return c;
}
function plankCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d"), rnd = rng(77);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = "hsl(" + (28 + rnd() * 8) + "," + (55 + rnd() * 10) + "%," + (48 + rnd() * 10) + "%)";
    g.fillRect(0, i * 16, 128, 16);
    for (let k = 0; k < 7; k++) { g.fillStyle = "rgba(90,45,10," + (0.1 + rnd() * 0.15) + ")"; g.fillRect(0, i * 16 + rnd() * 16, 128, 1); }
    g.fillStyle = "rgba(50,25,5,.55)"; g.fillRect(0, i * 16 + 15, 128, 1.5);
    g.fillStyle = "#3a2a1a"; g.beginPath(); g.arc(8, i * 16 + 8, 1.6, 0, TAU); g.arc(120, i * 16 + 8, 1.6, 0, TAU); g.fill();
  }
  return c;
}
function sandCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d"), rnd = rng(19);
  g.fillStyle = "#efd79c"; g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 3000, rnd, "rgba(255,250,230,.5)", "rgba(150,110,50,.25)", 1.2);
  g.strokeStyle = "rgba(170,130,70,.25)"; g.lineWidth = 1.2;            // rake lines
  for (let y = 6; y < 128; y += 9) { g.beginPath(); for (let x = 0; x <= 128; x += 8) g.lineTo(x, y + Math.sin(x / 20.4) * 2); g.stroke(); }
  return c;
}
function waterCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(23);
  const gr = g.createLinearGradient(0, 0, 256, 256);
  gr.addColorStop(0, "#14a7c9"); gr.addColorStop(1, "#0f86b8");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.lineWidth = 2;
  for (let i = 0; i < 90; i++) {                               // caustic squiggles, wrapped
    const x = rnd() * 256, y = rnd() * 256, r = 6 + rnd() * 18, a0 = rnd() * TAU;
    g.strokeStyle = "rgba(190,250,255," + (0.12 + rnd() * 0.22) + ")";
    for (let ox = -256; ox <= 256; ox += 256) for (let oy = -256; oy <= 256; oy += 256) { g.beginPath(); g.arc(x + ox, y + oy, r, a0, a0 + 1.6 + rnd()); g.stroke(); }
  }
  return c;
}
// Volcanic rock with glowing cracks for the volcano hill (it still plays like turf).
function lavaCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(66);
  g.fillStyle = "#7a5a50"; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 9000, rnd, "rgba(255,200,170,.08)", "rgba(10,0,0,.18)", 2.5);
  g.lineCap = "round";
  for (let i = 0; i < 26; i++) {
    let x = rnd() * 256, y = rnd() * 256;
    g.strokeStyle = rnd() < 0.5 ? "rgba(255,120,30,.75)" : "rgba(255,200,60,.6)"; g.lineWidth = 1.2 + rnd() * 2;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  return c;
}
// The whirlpool's turf: the same turf with a painted spiral pointing everyone at the cup.
function swirlCanvas(turf) {
  const c = mkCanvas(512, 512), g = c.getContext("2d");
  g.drawImage(turf, 0, 0, 256, 256, 0, 0, 512, 512);
  g.translate(256, 256);
  for (let arm = 0; arm < 3; arm++) {
    g.strokeStyle = arm % 2 ? "rgba(120,255,240,.55)" : "rgba(255,255,255,.5)"; g.lineWidth = 10; g.lineCap = "round";
    g.beginPath();
    for (let k = 0; k <= 80; k++) { const u = k / 80, r = 250 - u * 210, a = arm * TAU / 3 + u * 4.2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.stroke();
  }
  return c;
}

/* ---------------- Course pieces ---------------- */
// A bright orange ball: dimples all over, the script wordmark once on each side.
function ballCanvas(script) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  g.fillStyle = "#ff7a1f"; g.fillRect(0, 0, 512, 256);
  for (let row = 1; row < 16; row++) {
    const y = row * 16, lat = (0.5 - y / 256) * Math.PI, n = Math.max(6, Math.round(34 * Math.cos(lat)));
    for (let k = 0; k < n; k++) {
      const x = (k + (row % 2) * 0.5) * 512 / n, rx = 4.6 / Math.max(0.3, Math.cos(lat));
      g.fillStyle = "rgba(150,50,0,.3)"; g.beginPath(); g.ellipse(x, y + 0.8, rx, 4.6, 0, 0, TAU); g.fill();
      g.fillStyle = "rgba(255,200,140,.75)"; g.beginPath(); g.ellipse(x, y - 0.6, rx * 0.8, 3.6, 0, 0, TAU); g.fill();
    }
  }
  const SW = 150, SH = Math.round(SW * script.height / script.width), rowH = script.height / SH;
  [128, 384].forEach(function (cx) {
    g.fillStyle = "#fff4e2"; g.beginPath(); g.ellipse(cx, 128, SW * 0.58, SH * 0.66, 0, 0, TAU); g.fill();
    for (let r = 0; r < SH; r++) {
      const y = 128 - Math.round(SH / 2) + r, lat = (0.5 - (y + 0.5) / 256) * Math.PI, w = SW / Math.max(0.4, Math.cos(lat));
      g.drawImage(script, 0, r * rowH, script.width, rowH, cx - w / 2, y, w, 1);
    }
  });
  return c;
}
function flagCanvas(script, n) {
  const c = mkCanvas(256, 160), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 256, 160);
  bg.addColorStop(0, "#ff4f9a"); bg.addColorStop(1, "#ff8a1e");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 160);
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 14, 160);
  g.fillStyle = "#2a1a6a"; g.fillRect(0, 148, 256, 12);
  drawScript(g, script, 92, 78, 146, 110);
  g.font = "900 78px " + DISPLAY; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = 12; g.strokeStyle = "#2a1a6a"; g.strokeText(String(n), 206, 80);
  g.fillStyle = "#fff27a"; g.fillText(String(n), 206, 80);
  return c;
}
function teeCanvas(script) {
  const c = mkCanvas(256, 176), g = c.getContext("2d");
  rrectPath(g, 3, 3, 250, 170, 30); g.fillStyle = "#2a1a6a"; g.fill();
  rrectPath(g, 10, 10, 236, 156, 24);
  const gr = g.createLinearGradient(0, 10, 0, 166); gr.addColorStop(0, "#7a4dff"); gr.addColorStop(1, "#3d22b8");
  g.fillStyle = gr; g.fill();
  g.lineWidth = 4; g.strokeStyle = "#ffcf3a"; g.stroke();
  for (let x = 24; x < 236; x += 10) { g.fillStyle = "rgba(255,255,255,.06)"; g.fillRect(x, 18, 4, 140); }
  drawScript(g, script, 128, 124, 200, 74);
  g.fillStyle = "#ffffff"; g.beginPath(); g.arc(128, 66, 7, 0, TAU); g.fill();
  g.strokeStyle = "#ffcf3a"; g.lineWidth = 3; g.beginPath(); g.arc(128, 66, 14, 0, TAU); g.stroke();
  return c;
}
// The hole board panel under the LED ribbon: wordmark, the hole and its name.
function signCanvas(script, n, par, name) {
  const c = mkCanvas(1024, 300), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 300);
  bg.addColorStop(0, "#5a2bd6"); bg.addColorStop(0.55, "#3a1aa0"); bg.addColorStop(1, "#22106a");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 300);
  g.save(); g.globalAlpha = 0.18;                                // a sunset sunburst behind the lettering
  for (let i = 0; i < 24; i += 2) { g.fillStyle = "#ffb31a"; g.beginPath(); g.moveTo(330, 330); g.arc(330, 330, 900, Math.PI + i / 24 * Math.PI, Math.PI + (i + 1) / 24 * Math.PI); g.closePath(); g.fill(); }
  g.restore();
  g.lineWidth = 16; g.strokeStyle = "#ff4f9a"; g.strokeRect(8, 8, 1008, 284);
  g.lineWidth = 4; g.strokeStyle = "#ffe45c"; g.strokeRect(19, 19, 986, 262);
  drawScript(g, script, 300, 150, 520, 230);
  candyText(g, "HOLE " + n, 790, 86, 86, 380);
  candyText(g, "PAR " + par, 790, 176, 60, 380, [["0", "#b4fff4"], ["0.5", "#3ff0ff"], ["1", "#1aa8ff"]]);
  g.font = "bold 34px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#ffe8ff"; g.fillText(name.toUpperCase(), 790, 246, 400);
  return c;
}
function bumperCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, "#fff6b0"); gr.addColorStop(0.35, "#ff4fa0"); gr.addColorStop(0.8, "#a01a8a"); gr.addColorStop(1, "#4a0a5a");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 16 : 36; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.closePath(); g.fillStyle = "#fff27a"; g.fill(); g.lineWidth = 3; g.strokeStyle = "#2a1a6a"; g.stroke();
  return c;
}
function boostCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  g.fillStyle = "#2a0f5e"; g.fillRect(0, 0, 64, 64);
  g.lineJoin = "round"; g.lineCap = "round";
  [["#14062e", 14, 3], ["#ff3fa4", 10, 0], ["#ffe1f2", 3, -2]].forEach(function (s) {
    g.strokeStyle = s[0]; g.lineWidth = s[1];
    for (let o = -64; o <= 64; o += 64) { g.beginPath(); g.moveTo(8, 48 + o + s[2]); g.lineTo(32, 22 + o + s[2]); g.lineTo(56, 48 + o + s[2]); g.stroke(); }
  });
  return c;
}
// A giant 90s boombox: the top (lid) and the front (speakers and a tape door).
function boomTopCanvas(script) {
  const c = mkCanvas(420, 130), g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 130); gr.addColorStop(0, "#d9dce6"); gr.addColorStop(1, "#9aa0b3");
  g.fillStyle = gr; g.fillRect(0, 0, 420, 130);
  g.fillStyle = "#23252f"; rrectPath(g, 50, 16, 320, 22, 11); g.fill();       // the handle groove
  rrectPath(g, 110, 54, 200, 62, 10); g.fillStyle = "#14131c"; g.fill();
  drawScript(g, script, 210, 85, 186, 54);
  for (let i = 0; i < 6; i++) { g.fillStyle = ["#ff3fa4", "#ffcf3a", "#3ff0ff", "#7dff3a", "#ff8a1e", "#b68cff"][i]; rrectPath(g, 24 + i * 12, 70, 9, 30, 3); g.fill(); }
  return c;
}
function boomFrontCanvas() {
  const c = mkCanvas(420, 130), g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 130); gr.addColorStop(0, "#c4c8d4"); gr.addColorStop(1, "#7c8296");
  g.fillStyle = gr; g.fillRect(0, 0, 420, 130);
  [80, 340].forEach(function (x) {
    g.fillStyle = "#1a1b22"; g.beginPath(); g.arc(x, 66, 54, 0, TAU); g.fill();
    for (let r = 48; r > 10; r -= 7) { g.strokeStyle = r % 2 ? "#33364a" : "#262838"; g.lineWidth = 3; g.beginPath(); g.arc(x, 66, r, 0, TAU); g.stroke(); }
    g.fillStyle = "#5a5f78"; g.beginPath(); g.arc(x, 66, 12, 0, TAU); g.fill();
    g.fillStyle = "#ff3fa4"; g.beginPath(); g.arc(x, 66, 5, 0, TAU); g.fill();
  });
  rrectPath(g, 150, 30, 120, 70, 8); g.fillStyle = "#14131c"; g.fill();
  g.fillStyle = "#3a3d52"; g.fillRect(162, 44, 96, 42);
  g.fillStyle = "#f4efdf"; g.beginPath(); g.arc(186, 65, 9, 0, TAU); g.arc(234, 65, 9, 0, TAU); g.fill();
  for (let i = 0; i < 6; i++) { g.fillStyle = "#2a2c3a"; rrectPath(g, 152 + i * 20, 108, 16, 12, 2); g.fill(); }
  return c;
}
// Windmill sail: a wooden frame with slats.
function sailCanvas() {
  const c = mkCanvas(64, 256), g = c.getContext("2d");
  g.clearRect(0, 0, 64, 256);
  g.fillStyle = "#7a4a22"; g.fillRect(28, 0, 8, 256);
  g.fillStyle = "#c58a4a"; g.fillRect(4, 40, 4, 216); g.fillRect(56, 40, 4, 216);
  for (let y = 44; y < 256; y += 16) { g.fillStyle = y % 32 ? "#ffefe0" : "#ff6f9a"; g.fillRect(6, y, 52, 12); }
  return c;
}
function stoneCanvas(base) {
  const c = mkCanvas(256, 128), g = c.getContext("2d"), rnd = rng(31);
  g.fillStyle = base || "#b7a99a"; g.fillRect(0, 0, 256, 128);
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? 16 : 0;
    for (let x = -32; x < 256; x += 32) {
      g.fillStyle = "hsl(30," + (8 + rnd() * 10) + "%," + (58 + rnd() * 14) + "%)";
      g.fillRect(x + off + 1.5, row * 16 + 1.5, 29, 13);
    }
  }
  speckle(g, 256, 128, 1500, rnd, "rgba(255,255,255,.12)", "rgba(40,30,20,.15)", 1.5);
  return c;
}
function stripeCanvas(a, b, n) {
  const c = mkCanvas(64, 256), g = c.getContext("2d");
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(0, i * 256 / n, 64, 256 / n + 1); }
  return c;
}
function barkCanvas() {
  const c = mkCanvas(64, 256), g = c.getContext("2d"), rnd = rng(8);
  g.fillStyle = "#9a6a3a"; g.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 14) {
    g.fillStyle = "#6a4422"; g.beginPath(); g.moveTo(0, y + 10); g.quadraticCurveTo(32, y + 2, 64, y + 10); g.lineTo(64, y + 14); g.quadraticCurveTo(32, y + 6, 0, y + 14); g.fill();
    g.fillStyle = "rgba(255,220,170," + (0.08 + rnd() * 0.1) + ")"; g.fillRect(0, y + 2, 64, 3);
  }
  return c;
}
function frondCanvas() {
  const c = mkCanvas(64, 256), g = c.getContext("2d");
  g.clearRect(0, 0, 64, 256);
  g.fillStyle = "#1f8a3a";
  for (let y = 10; y < 250; y += 9) {
    const w = 30 * Math.sin(Math.PI * y / 256);
    g.beginPath(); g.moveTo(32, y); g.lineTo(32 - w, y + 16); g.lineTo(32 - w + 4, y + 18); g.lineTo(32, y + 6); g.lineTo(32 + w - 4, y + 18); g.lineTo(32 + w, y + 16); g.closePath();
    g.fillStyle = y % 18 ? "#2aa848" : "#1f8a3a"; g.fill();
  }
  g.fillStyle = "#6a8a2a"; g.fillRect(30, 0, 4, 256);
  return c;
}
function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(10,20,30,.8)"); gr.addColorStop(0.55, "rgba(10,20,30,.4)"); gr.addColorStop(1, "rgba(10,20,30,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function glowCanvas(col) {
  const c = mkCanvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,.95)"); gr.addColorStop(0.3, col); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
// Late-afternoon sky: deep violet up top, sunset at the horizon, clouds. Inside of a sphere.
function skyCanvas() {
  const c = mkCanvas(1024, 512), g = c.getContext("2d"), rnd = rng(12);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "#2a1a6a"); gr.addColorStop(0.45, "#7a3ab8"); gr.addColorStop(0.75, "#ff6f8a"); gr.addColorStop(0.92, "#ffb35a"); gr.addColorStop(1, "#ffe27a");
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = "#3c9a3a"; g.fillRect(0, 256, 1024, 256);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 1024, y = 90 + rnd() * 120, w = 60 + rnd() * 120;
    g.fillStyle = "rgba(255,190,200," + (0.18 + rnd() * 0.2) + ")";
    for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x + k * w * 0.25, y + Math.sin(k) * 4, w * 0.3, 9, 0, 0, TAU); g.fill(); }
  }
  const sx = 512, sy = 236, sun = g.createRadialGradient(sx, sy, 0, sx, sy, 90);
  sun.addColorStop(0, "rgba(255,250,210,1)"); sun.addColorStop(0.35, "rgba(255,210,120,.8)"); sun.addColorStop(1, "rgba(255,150,100,0)");
  g.fillStyle = sun; g.fillRect(sx - 90, sy - 90, 180, 180);
  return c;
}
function hillsCanvas() {
  const c = mkCanvas(1024, 128), g = c.getContext("2d"), rnd = rng(4);
  g.clearRect(0, 0, 1024, 128);
  [["#6a3a8a", 40, 0.9], ["#4a6a9a", 70, 1.3]].forEach(function (L) {
    g.fillStyle = L[0]; g.beginPath(); g.moveTo(0, 128);
    for (let x = 0; x <= 1024; x += 16) g.lineTo(x, L[1] + Math.sin(x / 120 * L[2] + rnd() * 0.2) * 22 + Math.sin(x / 37) * 6);
    g.lineTo(1024, 128); g.closePath(); g.fill();
  });
  for (let x = 6; x < 1024; x += 40 + rnd() * 50) {                // palm silhouettes on the ridge
    const y = 96 + rnd() * 10, h = 26 + rnd() * 18;
    g.strokeStyle = "#2a1a4a"; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + 4, y, x + 6, y - h); g.stroke();
    g.fillStyle = "#2a1a4a";
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.6; g.beginPath(); g.ellipse(x + 6 + Math.cos(a) * 9, y - h + Math.sin(a) * 4 + 4, 10, 2.5, a, 0, TAU); g.fill(); }
  }
  return c;
}
// A tiny painted sunset for the gloss on the ball, rails and bumpers.
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.18, "#ffd2e6"); gr.addColorStop(0.36, "#ff8ab0");
    gr.addColorStop(0.5, "#7a4ad8"); gr.addColorStop(0.52, "#2a8a3a"); gr.addColorStop(1, "#3cc860");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#6a4ad8"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(10, 8, 18, 18); tg.fillRect(38, 34, 16, 16);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#3cc860"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* ---------------- Clothes and faces for the course regulars ----------------
   Wrapped around lathe bodies: u = 0 is the back, u = .5 the chest. Folds are painted in. */
function foldLines(g, w, h, rnd, col, n, region) {
  g.strokeStyle = col; g.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const x = region[0] + rnd() * (region[1] - region[0]), y = region[2] + rnd() * (region[3] - region[2]), len = 18 + rnd() * 40;
    g.lineWidth = 2 + rnd() * 4;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len * 0.5, y + (rnd() - 0.5) * 16, x + len, y + (rnd() - 0.3) * 20); g.stroke();
  }
}
// A polo: placket and buttons, a big wordmark across the chest, the name of the course on the back, folds at the waist.
function poloCanvas(script, base, accent, back) {
  const c = mkCanvas(1024, 512), g = c.getContext("2d"), rnd = rng(base.length * 7 + 3);
  g.fillStyle = base; g.fillRect(0, 0, 1024, 512);
  for (let x = 0; x < 1024; x += 6) { g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(x, 0, 2, 512); }   // pique knit
  g.fillStyle = accent; g.fillRect(0, 486, 1024, 26);                                                      // hem band
  g.fillStyle = shade(base, -0.25); g.fillRect(498, 300, 28, 200);                                         // placket
  g.fillStyle = "#ffffff"; [340, 400, 460].forEach(function (y) { g.beginPath(); g.arc(512, y, 6, 0, TAU); g.fill(); });
  g.fillStyle = accent; g.fillRect(0, 0, 1024, 18);
  drawScript(g, script, 512, 210, 330, 150);                                                               // the chest
  g.font = "900 54px " + DISPLAY; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 8; g.lineJoin = "round"; g.strokeStyle = shade(base, -0.4); g.strokeText(back, 0, 200); g.strokeText(back, 1024, 200);
  g.fillStyle = "#fff4d8"; g.fillText(back, 0, 200); g.fillText(back, 1024, 200);
  foldLines(g, 1024, 512, rnd, "rgba(0,0,30,.13)", 26, [0, 1024, 360, 480]);
  foldLines(g, 1024, 512, rnd, "rgba(255,255,255,.10)", 18, [0, 1024, 340, 470]);
  foldLines(g, 1024, 512, rnd, "rgba(0,0,30,.12)", 10, [220, 320, 120, 300]);
  foldLines(g, 1024, 512, rnd, "rgba(0,0,30,.12)", 10, [700, 800, 120, 300]);
  return c;
}
// A 90s windbreaker: color-block panels, a zipper, the wordmark on the chest and NOSTALGIA PRO across the back.
function jacketCanvas(script) {
  const c = mkCanvas(1024, 512), g = c.getContext("2d"), rnd = rng(91);
  g.fillStyle = "#2b2aa8"; g.fillRect(0, 0, 1024, 512);
  g.fillStyle = "#ff3fa4"; g.beginPath(); g.moveTo(0, 150); g.lineTo(1024, 260); g.lineTo(1024, 340); g.lineTo(0, 230); g.fill();
  g.fillStyle = "#3ff0ff"; g.beginPath(); g.moveTo(0, 230); g.lineTo(1024, 340); g.lineTo(1024, 370); g.lineTo(0, 260); g.fill();
  g.fillStyle = "#14134a"; g.fillRect(0, 470, 1024, 42); g.fillRect(0, 0, 1024, 16);
  g.fillStyle = "#cfd3e0"; g.fillRect(506, 0, 12, 512);
  for (let y = 4; y < 512; y += 8) { g.fillStyle = "#8a8ea0"; g.fillRect(506, y, 12, 3); }
  drawScript(g, script, 650, 150, 190, 90);
  g.font = "900 46px " + DISPLAY; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  ["NOSTALGIA", "PRO"].forEach(function (s, i) {
    g.lineWidth = 9; g.strokeStyle = "#14134a"; g.strokeText(s, 0, 110 + i * 56); g.strokeText(s, 1024, 110 + i * 56);
    g.fillStyle = "#fff27a"; g.fillText(s, 0, 110 + i * 56); g.fillText(s, 1024, 110 + i * 56);
  });
  foldLines(g, 1024, 512, rnd, "rgba(0,0,40,.22)", 30, [0, 1024, 380, 470]);
  foldLines(g, 1024, 512, rnd, "rgba(255,255,255,.16)", 22, [0, 1024, 60, 460]);
  return c;
}
function sleeveCanvas(base, stripe) {
  const c = mkCanvas(128, 256), g = c.getContext("2d"), rnd = rng(base.length + 2);
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  if (stripe) { g.fillStyle = stripe; g.fillRect(0, 20, 128, 22); }
  g.fillStyle = shade(base, -0.3); g.fillRect(0, 230, 128, 26);
  foldLines(g, 128, 256, rnd, "rgba(0,0,30,.18)", 14, [0, 128, 30, 230]);
  foldLines(g, 128, 256, rnd, "rgba(255,255,255,.12)", 8, [0, 128, 30, 230]);
  return c;
}
function shortsCanvas(base, pocket) {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(base.length * 3);
  g.fillStyle = base; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#3a2a1a"; g.fillRect(0, 0, 512, 26);                                                      // belt
  g.fillStyle = "#e7c45a"; g.fillRect(244, 4, 24, 18);                                                     // buckle
  g.strokeStyle = shade(base, -0.3); g.lineWidth = 3;
  g.beginPath(); g.moveTo(256, 26); g.lineTo(256, 120); g.stroke();                                        // fly
  [150, 362].forEach(function (x) { g.beginPath(); g.moveTo(x - 50, 30); g.quadraticCurveTo(x - 10, 70, x + 30, 40); g.stroke(); });   // pockets
  if (pocket) { g.fillStyle = pocket; g.fillRect(40, 60, 50, 6); }
  foldLines(g, 512, 256, rnd, "rgba(40,20,0,.2)", 22, [0, 512, 60, 240]);
  return c;
}
function legCanvas(base, cuff, stripe) {
  const c = mkCanvas(128, 256), g = c.getContext("2d"), rnd = rng(base.length + 9);
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  if (stripe) { g.fillStyle = stripe; g.fillRect(0, 0, 14, 256); g.fillRect(64, 0, 14, 256); }
  if (cuff) { g.fillStyle = cuff; g.fillRect(0, 226, 128, 30); }
  foldLines(g, 128, 256, rnd, "rgba(0,0,30,.2)", 12, [0, 128, 40, 220]);
  return c;
}
// Face skin: u = .25 is the front of the head sphere. Cheeks, a little blush, stubble for one of them.
function faceCanvas(skin, blush, stubble) {
  const c = mkCanvas(256, 128), g = c.getContext("2d");
  g.fillStyle = skin; g.fillRect(0, 0, 256, 128);
  const sh = g.createLinearGradient(0, 0, 0, 128); sh.addColorStop(0, "rgba(255,255,255,.08)"); sh.addColorStop(1, "rgba(60,20,0,.12)");
  g.fillStyle = sh; g.fillRect(0, 0, 256, 128);
  [64 - 18, 64 + 18].forEach(function (x) {
    const gr = g.createRadialGradient(x, 74, 0, x, 74, 13); gr.addColorStop(0, blush); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(x - 13, 61, 26, 26);
  });
  if (stubble) { const rnd = rng(3); g.fillStyle = "rgba(60,40,30,.22)"; for (let i = 0; i < 900; i++) { const a = rnd() * Math.PI - Math.PI / 2, r = rnd(); g.fillRect(64 + Math.sin(a) * 34 * r, 84 + rnd() * 22, 1, 1); } }
  return c;
}
function scorecardCanvas(script) {
  const c = mkCanvas(128, 160), g = c.getContext("2d");
  g.fillStyle = "#8a5a2a"; g.fillRect(0, 0, 128, 160);
  g.fillStyle = "#fffdf4"; g.fillRect(8, 16, 112, 138);
  g.fillStyle = "#c0c4d0"; g.fillRect(40, 4, 48, 18);
  drawScript(g, script, 64, 40, 96, 34);
  g.strokeStyle = "#7a8ab8"; g.lineWidth = 1;
  for (let y = 62; y < 150; y += 10) { g.beginPath(); g.moveTo(12, y); g.lineTo(116, y); g.stroke(); }
  for (let x = 34; x < 116; x += 14) { g.beginPath(); g.moveTo(x, 58); g.lineTo(x, 150); g.stroke(); }
  g.fillStyle = "#2a2a8a"; g.font = "bold 8px " + HUD_FONT;
  for (let i = 0; i < 8; i++) g.fillText(String(2 + (i * 7) % 3), 38 + (i % 6) * 14, 70 + Math.floor(i / 6) * 10 + (i % 2) * 10);
  return c;
}
function capCanvas(base, text) {
  const c = mkCanvas(256, 64), g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, 256, 64);
  g.fillStyle = "rgba(255,255,255,.15)"; g.fillRect(0, 6, 256, 6);
  g.font = "900 30px " + DISPLAY; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#fff27a"; g.fillText(text, 64, 36);
  return c;
}

/* ---------------- Geometry helpers ---------------- */
// A box with every edge and corner rounded. Each face keeps its own material slot (+x -x +y -y +z -z)
// and its texture is stretched corner to corner.
function roundBox(T, w, h, d, r, s) {
  s = s || 4;
  const per = (s + 1) * (s + 1), half = 0.5 / s;
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
function circlePts(T, cx, cy, r, n) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU; pts.push(new T.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
  return pts;
}
function roundRectPts(T, x1, y1, x2, y2, r) {
  const pts = [], n = 5;
  [[x2 - r, y1 + r, -0.25], [x2 - r, y2 - r, 0], [x1 + r, y2 - r, 0.25], [x1 + r, y1 + r, 0.5]].forEach(function (c) {
    for (let i = 0; i <= n; i++) { const a = (c[2] + i / n * 0.25) * TAU; pts.push(new T.Vector2(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r)); }
  });
  return pts;
}
// A flat piece of the course at height y, outlined in course coordinates, facing up. Texture tiles at k per unit.
function flatGeo(T, pts, holes, y, k) {
  holes = holes || [];
  const all = pts.slice();
  holes.forEach(function (hl) { for (let i = 0; i < hl.length; i++) all.push(hl[i]); });
  const tris = T.ShapeUtils.triangulateShape(pts, holes);
  const pos = [], nor = [], uv = [], idx = [];
  all.forEach(function (p) { pos.push(p.x - CX, y, p.y - CZ); nor.push(0, 1, 0); uv.push(p.x * k, -p.y * k); });
  tris.forEach(function (t) {
    const a = all[t[0]], b = all[t[1]], c = all[t[2]];
    const up = (b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y);
    if (up >= 0) idx.push(t[0], t[1], t[2]); else idx.push(t[0], t[2], t[1]);
  });
  return buf(T, pos, nor, uv, idx);
}
function buf(T, pos, nor, uv, idx) {
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  if (nor) g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (!nor) g.computeVertexNormals();
  const col = [];                                              // height shading: high ground a touch brighter, low ground darker
  for (let i = 1; i < pos.length; i += 3) { const k = 0.86 + 0.14 * clamp(pos[i] / 22, -1, 1); col.push(k, k, k); }
  g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  return g;
}
// A sloped or twisted tile: a grid following its corner heights.
function tileGeo(T, z, k) {
  const r = z.r, nx = Math.max(2, Math.round(r.w / 16)), ny = Math.max(2, Math.round(r.h / 16));
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const x = r.x + r.w * i / nx, y = r.y + r.h * j / ny;
    pos.push(x - CX, zoneH(z, x, y), y - CZ); uv.push(x * k, -y * k);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  return buf(T, pos, null, uv, idx);
}
// A hill or bowl: rings from the cup (or the very top) out to the rim. UVs follow the course so the turf lines up.
function domeGeo(T, z, k, cupR, radialUV) {
  const d = z.dome, segs = 48, rings = [];
  if (cupR) rings.push(cupR);
  else rings.push(0);
  rings.push(d.rIn);
  for (let i = 1; i <= 14; i++) rings.push(d.rIn + (d.R - d.rIn) * i / 14);
  const pos = [], uv = [], idx = [];
  for (let j = 0; j < rings.length; j++) for (let i = 0; i <= segs; i++) {
    const a = i / segs * TAU, x = d.cx + Math.cos(a) * rings[j], y = d.cy + Math.sin(a) * rings[j];
    pos.push(x - CX, zoneH(z, x, y), y - CZ);
    if (radialUV) uv.push(0.5 + (x - d.cx) / (2 * d.R), 0.5 - (y - d.cy) / (2 * d.R)); else uv.push(x * k, -y * k);
  }
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < segs; i++) {
    const a = j * (segs + 1) + i, b = a + 1, c = a + segs + 1, e = c + 1;
    idx.push(a, b, c, b, e, c);
  }
  return buf(T, pos, null, uv, idx);
}
// The four sides of a tile, from its top edge down to the lawn. v = 1 at the top edge.
function skirtGeo(T, z) {
  const r = z.r, pos = [], uv = [], nor = [], idx = [];
  const edges = [[r.x, r.y, r.x + r.w, r.y, 0, -1], [r.x + r.w, r.y + r.h, r.x, r.y + r.h, 0, 1],
                 [r.x, r.y + r.h, r.x, r.y, -1, 0], [r.x + r.w, r.y, r.x + r.w, r.y + r.h, 1, 0]];
  edges.forEach(function (e) {
    const n = 6, base = pos.length / 3, len = Math.hypot(e[2] - e[0], e[3] - e[1]);
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = e[0] + (e[2] - e[0]) * u, y = e[1] + (e[3] - e[1]) * u, top = zoneH(z, x, y);
      pos.push(x - CX, top, y - CZ, x - CX, -BASE, y - CZ);
      nor.push(e[4], 0, e[5], e[4], 0, e[5]);
      uv.push((x + y) / 64, 1, (x + y) / 64, 1 - (top + BASE) / 18);
    }
    for (let i = 0; i < n; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    if (!len) idx.length -= n * 6;
  });
  return buf(T, pos, nor, uv, idx);
}
// The turf height a rail runs along: the highest turf within a few units of a spot (0 if none).
function railTop(h, x, y) {
  let m = -1e9;
  for (let dx = -9; dx <= 9; dx += 4.5) for (let dy = -9; dy <= 9; dy += 4.5) {
    for (let i = h.zones.length - 1; i >= 0; i--) {
      const z = h.zones[i];
      if (z.bridge) continue;
      if (inRect(x + dx, y + dy, z.r)) { m = Math.max(m, zoneH(z, x + dx, y + dy)); break; }
    }
  }
  return m < -1e8 ? 0 : Math.max(0, m);
}
// A padded rail: a rounded bar whose top follows the turf beside it. Built in the hole's own space.
function railGeo(T, h, cx, cy, len, thick, ang, tall) {
  const hh = (tall || RAIL_H) + BASE, g = roundBox(T, len, hh, thick, Math.min(3, thick / 2 - 0.2), 6);
  g.rotateY(ang);
  const pos = g.attributes.position, cache = {};
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
    const key = Math.round(lx * 2) + "," + Math.round(lz * 2);
    let gt = cache[key];
    if (gt === undefined) gt = cache[key] = railTop(h, cx + lx, cy + lz);
    const f = (ly + hh / 2) / hh;
    pos.setXYZ(i, lx + cx - CX, ly + hh / 2 - BASE + gt * f, lz + cy - CZ);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

/* =====================================================================================
   The course regulars: two original characters who hang around every hole board.
   Sculpted from lathe-turned bodies and merged ellipsoids: shoulders, a waist and hips,
   tapered limbs with muscle, bent elbows and knees, hands with fingers, real shoes,
   necks and faces with a jaw, nose, brows, eyes and a mouth that changes.
   Units are life-size feet (about six feet tall), scaled up by FOLK_S on the course.
   ===================================================================================== */
const FOLK = {
  hipY: 2.95, thigh: 1.36, shin: 1.27, upper: 1.06, fore: 0.98,
  maleTorso: [[0.5, 0.12], [0.53, 0.4], [0.57, 0.72], [0.67, 1.1], [0.75, 1.44], [0.79, 1.62], [0.72, 1.8], [0.52, 1.93], [0.27, 2.0], [0.2, 2.05]],
  femTorso: [[0.5, 0.12], [0.45, 0.45], [0.48, 0.75], [0.6, 1.08], [0.66, 1.34], [0.68, 1.55], [0.62, 1.76], [0.46, 1.9], [0.24, 1.98], [0.18, 2.02]],
  pelvis: [[0.0, -0.46], [0.3, -0.43], [0.55, -0.3], [0.62, -0.08], [0.6, 0.14], [0.52, 0.34]]
};

function makeFolk(T, G, o) {
  const root = new T.Group(), body = new T.Group();
  root.add(body);
  const lam = function (p) { return new T.MeshLambertMaterial(p); };
  const skin = lam({ color: o.skin });
  const face = lam({ map: G.tex(faceCanvas(o.skinHex, o.blush, o.stubble)) });
  const shirt = new T.MeshPhongMaterial({ map: G.tex(o.shirt), specular: 0x222222, shininess: 14 });
  const sleeve = lam({ map: G.tex(o.sleeve) });
  const lower = lam({ map: G.tex(o.lower) });
  const legM = o.leg ? lam({ map: G.tex(o.leg) }) : skin;
  const hairM = new T.MeshPhongMaterial({ color: o.hair, specular: 0x333333, shininess: 30 });
  const sockM = lam({ color: o.sock });
  const shoeM = new T.MeshPhongMaterial({ color: o.shoe[0], specular: 0x888888, shininess: 60 });
  const shoeA = new T.MeshPhongMaterial({ color: o.shoe[1], specular: 0x888888, shininess: 60 });
  const soleM = lam({ color: o.shoe[2] });
  const white = new T.MeshPhongMaterial({ color: 0xffffff, specular: 0xffffff, shininess: 80 });
  const dark = new T.MeshPhongMaterial({ color: 0x2a1a12, specular: 0xffffff, shininess: 120 });
  const iris = new T.MeshPhongMaterial({ color: o.eye, specular: 0xffffff, shininess: 120 });
  const mouthM = lam({ color: 0x5a1420 }), lipM = lam({ color: o.lip }), toothM = lam({ color: 0xfffaf0 });
  function ell(mat, sx, sy, sz, x, y, z, parent) { const m = new T.Mesh(G.sphere, mat); m.scale.set(sx, sy, sz); m.position.set(x || 0, y || 0, z || 0); (parent || body).add(m); return m; }

  // hips and body (the upper group turns and leans at the waist)
  const pelvis = new T.Mesh(G.lathe(FOLK.pelvis), lower); pelvis.scale.z = 0.74; body.add(pelvis);
  const upper = new T.Group(); body.add(upper);
  const torso = new T.Mesh(G.lathe(o.female ? FOLK.femTorso : FOLK.maleTorso), shirt); torso.scale.z = 0.66; upper.add(torso);
  const shX = o.female ? 0.64 : 0.73;
  if (o.collar) {                                            // polo collar, flared out over the neck
    const col = new T.Mesh(G.lathe([[0.24, 1.94], [0.3, 2.02], [0.33, 2.1], [0.27, 2.13]]), lam({ color: o.collar, side: T.DoubleSide }));
    col.scale.z = 0.8; upper.add(col);
  }
  const neck = new T.Mesh(G.neck, skin); neck.position.y = 1.9; neck.scale.set(o.female ? 0.17 : 0.21, 0.4, o.female ? 0.17 : 0.21); upper.add(neck);
  ell(skin, 0.26, 0.08, 0.2, 0, 1.97, 0.02, upper);           // where the neck meets the collarbones

  // head
  const head = new T.Group(); head.position.set(0, 2.5, 0.03); upper.add(head);
  const skull = new T.Mesh(G.sphere, face); skull.scale.set(0.43, 0.5, 0.47); head.add(skull);
  ell(skin, 0.37, 0.27, 0.39, 0, -0.2, 0.05, head);            // jaw
  ell(skin, 0.15, 0.12, 0.13, 0, -0.38, 0.27, head);           // chin
  ell(skin, 0.13, 0.1, 0.1, 0.24, -0.1, 0.31, head); ell(skin, 0.13, 0.1, 0.1, -0.24, -0.1, 0.31, head);   // cheeks
  ell(skin, 0.075, 0.13, 0.1, 0, 0.0, 0.47, head);             // nose bridge
  ell(skin, 0.095, 0.08, 0.09, 0, -0.08, 0.52, head);          // nose tip
  ell(skin, 0.065, 0.13, 0.1, 0.44, 0.02, 0.0, head); ell(skin, 0.065, 0.13, 0.1, -0.44, 0.02, 0.0, head);  // ears
  const eyes = [], brows = [];
  [-1, 1].forEach(function (s) {
    ell(white, 0.085, 0.075, 0.06, s * 0.16, 0.1, 0.41, head);
    eyes.push(ell(iris, 0.045, 0.05, 0.03, s * 0.16, 0.1, 0.46, head));
    ell(dark, 0.022, 0.025, 0.012, s * 0.16, 0.1, 0.488, head);
    ell(white, 0.012, 0.012, 0.01, s * 0.16 + 0.015, 0.12, 0.494, head);
    ell(skin, 0.1, 0.045, 0.07, s * 0.16, 0.165, 0.405, head);  // upper lids
    const br = new T.Mesh(G.brow, hairM); br.position.set(s * 0.17, 0.25, 0.43); br.scale.set(o.female ? 0.8 : 1, o.female ? 0.7 : 1.1, 1); head.add(br); brows.push(br);
  });
  const mouth = new T.Group(); mouth.position.set(0, -0.22, 0.42); head.add(mouth);
  const smile = new T.Mesh(G.smile, lipM); smile.rotation.z = Math.PI; smile.scale.set(1, 0.8, 1); mouth.add(smile);
  const open = new T.Group(); mouth.add(open);
  ell(mouthM, 0.13, 0.1, 0.06, 0, -0.03, 0, open); ell(toothM, 0.1, 0.03, 0.04, 0, 0.04, 0.025, open); ell(lipM, 0.14, 0.03, 0.05, 0, 0.075, 0.01, open);
  const oh = ell(mouthM, 0.055, 0.075, 0.05, 0, -0.02, 0, mouth);
  if (o.mustache) ell(hairM, 0.19, 0.055, 0.08, 0, 0.07, 0.07, mouth);
  // hair and headwear
  if (o.style === "visor") {
    ell(hairM, 0.45, 0.42, 0.49, 0, 0.12, -0.05, head);
    ell(hairM, 0.12, 0.2, 0.2, 0.37, 0.0, -0.06, head); ell(hairM, 0.12, 0.2, 0.2, -0.37, 0.0, -0.06, head);
    const band = new T.Mesh(G.visorBand, new T.MeshLambertMaterial({ map: G.tex(capCanvas("#ff3fa4", "PRO")), side: T.DoubleSide }));
    band.position.y = 0.33; band.rotation.y = -Math.PI / 2; head.add(band);
    const brim = new T.Mesh(G.brim, new T.MeshPhongMaterial({ color: 0xff3fa4, specular: 0x666666, shininess: 40, side: T.DoubleSide }));
    brim.position.set(0, 0.32, 0.36); brim.rotation.x = -0.12; head.add(brim);
  } else {
    ell(hairM, 0.47, 0.5, 0.5, 0, 0.1, -0.05, head);
    ell(hairM, 0.36, 0.16, 0.2, 0.02, 0.38, 0.27, head);         // bangs
    ell(hairM, 0.12, 0.3, 0.2, 0.36, 0.0, 0.05, head); ell(hairM, 0.12, 0.3, 0.2, -0.36, 0.0, 0.05, head);
    const tie = new T.Mesh(G.ring, lam({ color: 0x3ff0ff })); tie.position.set(0, 0.32, -0.46); tie.rotation.x = 0.4; head.add(tie);
    [[0, 0.3, -0.55, 0.15], [0, 0.12, -0.66, 0.16], [0, -0.1, -0.7, 0.14], [0, -0.3, -0.68, 0.11]].forEach(function (p) { ell(hairM, p[3], p[3] * 1.3, p[3], p[0], p[1], p[2], head); });
    [-1, 1].forEach(function (s) { const hp = new T.Mesh(G.hoop, new T.MeshPhongMaterial({ color: 0xffd23f, specular: 0xffffff, shininess: 120 })); hp.position.set(s * 0.45, -0.17, 0.0); hp.rotation.y = Math.PI / 2; head.add(hp); });
  }

  // arms and legs: tubes between solved joints, with muscle bellies over them
  function limb(m1, m2, r1, r2) {
    const L = { up: new T.Mesh(G.cyl, m1), lo: new T.Mesh(G.cyl, m2), j0: ell(m1, r1 * 1.12, r1 * 1.12, r1 * 1.12), j1: ell(m2, r2 * 1.06, r2 * 1.06, r2 * 1.06),
                b1: ell(m1, 1, 1, 1), b2: ell(m2, 1, 1, 1), r1: r1, r2: r2, cover: null, cuff: null, sock: null };
    body.add(L.up); body.add(L.lo);
    return L;
  }
  const arms = [0, 1].map(function () {
    const L = limb(o.longSleeve ? sleeve : skin, o.longSleeve ? sleeve : skin, 0.15, 0.12);
    if (!o.longSleeve) { L.cover = new T.Mesh(G.sleeveTube, sleeve); body.add(L.cover); }
    else { L.cuff = new T.Mesh(G.cyl, lam({ color: 0x14134a })); body.add(L.cuff); }
    L.delt = ell(o.longSleeve ? sleeve : shirt, 0.21, 0.22, 0.2);
    return L;
  });
  arms[0].hand = makeHand(T, G, skin, 1); arms[1].hand = makeHand(T, G, skin, -1);
  body.add(arms[0].hand.g); body.add(arms[1].hand.g);
  const legs = [0, 1].map(function () {
    const L = limb(legM, legM, 0.24, 0.17);
    if (o.shorts) { L.cover = new T.Mesh(G.shortsTube, lower); body.add(L.cover); }
    L.sock = new T.Mesh(G.cyl, sockM); body.add(L.sock);
    L.shoe = makeShoe(T, G, shoeM, shoeA, soleM, white);
    body.add(L.shoe);
    return L;
  });
  return { root: root, body: body, pelvis: pelvis, upper: upper, torso: torso, head: head, arms: arms, legs: legs, eyes: eyes, brows: brows,
           smile: smile, open: open, oh: oh, shX: shX, o: o, prop: null };
}

// A hand: palm, four two-jointed fingers and a thumb. Fingers run down the hand's -y; the palm faces +z.
function makeHand(T, G, mat, side) {
  const g = new T.Group(), fingers = [];
  const palm = new T.Mesh(G.sphere, mat); palm.scale.set(0.105, 0.13, 0.055); palm.position.y = -0.12; g.add(palm);
  const heel = new T.Mesh(G.sphere, mat); heel.scale.set(0.09, 0.06, 0.05); heel.position.set(0, -0.03, 0.005); g.add(heel);
  [-0.066, -0.022, 0.022, 0.066].forEach(function (x, i) {
    const len = [0.1, 0.12, 0.115, 0.09][i];
    const f = new T.Group(); f.position.set(x * side, -0.235, 0.0); g.add(f);
    const a = new T.Mesh(G.finger, mat); a.scale.set(1, len / 0.1, 1); f.add(a);
    const knuckle = new T.Group(); knuckle.position.y = -len; f.add(knuckle);
    const b = new T.Mesh(G.finger, mat); b.scale.set(0.92, 0.85, 0.92); knuckle.add(b);
    fingers.push({ f: f, k: knuckle });
  });
  const th = new T.Group(); th.position.set(0.085 * side, -0.07, 0.035); th.rotation.set(0.5, 0, 0.75 * side); g.add(th);
  const ta = new T.Mesh(G.finger, mat); ta.scale.set(1.15, 0.9, 1.15); th.add(ta);
  const tk = new T.Group(); tk.position.y = -0.09; th.add(tk);
  const tb = new T.Mesh(G.finger, mat); tb.scale.set(1.05, 0.75, 1.05); tk.add(tb);
  return { g: g, fingers: fingers, thumb: th, thumbK: tk, side: side, curl: -1 };
}
function curlHand(hd, c) {
  if (Math.abs(c - hd.curl) < 0.01) return;
  hd.curl = c;
  for (let i = 0; i < hd.fingers.length; i++) { hd.fingers[i].f.rotation.x = c * 0.9; hd.fingers[i].k.rotation.x = c * 1.25; }
  hd.thumbK.rotation.x = c * 0.6;
}
// A shoe: sole, upper, toe cap, heel counter and laces. Points along +z.
function makeShoe(T, G, upperM, accentM, soleM, laceM) {
  const g = new T.Group();
  const sole = new T.Mesh(G.sole, soleM); sole.position.set(0, 0.045, 0.1); g.add(sole);
  const up = new T.Mesh(G.sphere, upperM); up.scale.set(0.15, 0.15, 0.3); up.position.set(0, 0.15, 0.04); g.add(up);
  const toe = new T.Mesh(G.sphere, accentM); toe.scale.set(0.14, 0.1, 0.14); toe.position.set(0, 0.12, 0.3); g.add(toe);
  const heelC = new T.Mesh(G.sphere, accentM); heelC.scale.set(0.15, 0.13, 0.1); heelC.position.set(0, 0.17, -0.17); g.add(heelC);
  const tongue = new T.Mesh(G.sphere, upperM); tongue.scale.set(0.09, 0.08, 0.13); tongue.position.set(0, 0.26, 0.1); tongue.rotation.x = -0.4; g.add(tongue);
  for (let i = 0; i < 3; i++) { const l = new T.Mesh(G.lace, laceM); l.position.set(0, 0.255 - i * 0.025, 0.04 + i * 0.07); l.rotation.x = -0.45; g.add(l); }
  return g;
}

/* ---------------- Posing ---------------- */
// Elbow or knee: the joint between A and B for bones l1 and l2, bent toward "pole".
function bend(TV, A, B, pole, l1, l2, out) {
  TV.d.subVectors(B, A);
  let d = TV.d.length();
  if (d < 1e-4) { TV.d.set(0, -1, 0); d = 1e-4; } else TV.d.multiplyScalar(1 / d);
  const dm = Math.min(d, (l1 + l2) * 0.995), a = (l1 * l1 - l2 * l2 + dm * dm) / (2 * dm), hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  TV.q.copy(pole).addScaledVector(TV.d, -pole.dot(TV.d));
  if (TV.q.lengthSq() < 1e-6) TV.q.set(0, 0, 1);
  TV.q.normalize();
  out.copy(A).addScaledVector(TV.d, a).addScaledVector(TV.q, hgt);
}
function bone(TV, mesh, A, B, r, rz) {
  TV.e2.subVectors(B, A);
  const l = TV.e2.length() || 1e-4;
  mesh.position.copy(A);
  mesh.quaternion.setFromUnitVectors(TV.up, TV.e2.multiplyScalar(1 / l));
  mesh.scale.set(r, l, rz || r);
}
function belly(TV, mesh, A, B, f, r, k) {
  TV.e2.subVectors(B, A);
  const l = TV.e2.length() || 1e-4;
  mesh.position.copy(A).addScaledVector(TV.e2, f);
  mesh.quaternion.setFromUnitVectors(TV.up, TV.e2.multiplyScalar(1 / l));
  mesh.scale.set(r, l * k, r * 0.92);
}
// Point a hand: its fingers down the forearm line, its palm turned toward pn.
function aimHand(TV, hd, wrist, dir, pn) {
  const y = TV.hy.copy(dir).multiplyScalar(-1).normalize();
  const z = TV.hz.copy(pn).addScaledVector(y, -pn.dot(y));
  if (z.lengthSq() < 1e-6) z.set(0, 0, 1);
  z.normalize();
  const x = TV.hx.crossVectors(y, z).normalize();
  TV.m.makeBasis(x, y, z);
  hd.g.quaternion.setFromRotationMatrix(TV.m);
  hd.g.position.copy(wrist);
}

// P: a pose in the character's own space (feet, facing +z). Filled in by folkPose, applied here.
function applyFolk(TV, F, P) {
  const hy = P.hipYaw, ch = Math.cos(hy), sh = Math.sin(hy);
  F.pelvis.position.set(P.hx, P.hy, P.hz); F.pelvis.rotation.set(0, hy, P.roll * 0.5);
  F.upper.position.set(P.hx, P.hy, P.hz); F.upper.rotation.set(P.lean, hy + P.twist, P.roll, "YXZ");
  F.torso.scale.y = 1 + P.breath;
  F.upper.updateMatrix();
  F.head.rotation.set(P.headPitch, P.headYaw - P.twist, P.headRoll, "YXZ");
  // face
  F.smile.visible = P.mouth === "smile"; F.open.visible = P.mouth === "open"; F.oh.visible = P.mouth === "oh";
  F.open.scale.y = 0.8 + 0.4 * P.mouthOpen;
  F.brows[0].rotation.z = -P.brow * 0.3 - P.browSad * 0.35; F.brows[1].rotation.z = P.brow * 0.3 + P.browSad * 0.35;
  F.brows[0].position.y = F.brows[1].position.y = 0.25 + P.brow * 0.04;
  for (let s = 0; s < 2; s++) {
    const sg = s ? -1 : 1, A = F.arms[s];                    // 0 = left (+x), 1 = right (-x)
    TV.a.set(sg * F.shX, 1.7, 0).applyMatrix4(F.upper.matrix);
    TV.b.fromArray(P.hand[s]);
    TV.p.set(sg * 0.55 + P.elbowOut[s] * sg, -0.7, -0.45);
    TV.p.applyAxisAngle(TV.up, hy + P.twist);
    bend(TV, TV.a, TV.b, TV.p, FOLK.upper, FOLK.fore, TV.e);
    bone(TV, A.up, TV.a, TV.e, A.r1); bone(TV, A.lo, TV.e, TV.b, A.r2);
    belly(TV, A.b1, TV.a, TV.e, 0.42, A.r1 * 1.18, 0.42); belly(TV, A.b2, TV.e, TV.b, 0.3, A.r2 * 1.2, 0.45);
    A.j0.position.copy(TV.a); A.j1.position.copy(TV.e);
    A.delt.position.copy(TV.a); A.delt.position.y += 0.02; A.delt.quaternion.copy(A.up.quaternion);
    if (A.cover) { TV.c.lerpVectors(TV.a, TV.e, 0.55); bone(TV, A.cover, TV.a, TV.c, A.r1 * 1.45); A.cover.position.lerp(TV.e, -0.05); }
    if (A.cuff) { TV.c.lerpVectors(TV.e, TV.b, 0.84); bone(TV, A.cuff, TV.c, TV.b, A.r2 * 1.18); }
    TV.d2.subVectors(TV.b, TV.e).normalize();
    TV.n.fromArray(P.palm[s]);
    aimHand(TV, A.hand, TV.b, TV.d2, TV.n);
    curlHand(A.hand, P.curl[s]);
    // legs
    const L = F.legs[s];
    TV.a.set(P.hx + sg * 0.3 * ch, P.hy - 0.16, P.hz - sg * 0.3 * sh);
    TV.b.fromArray(P.foot[s]); TV.b.y += 0.3;
    TV.p.set(sh + sg * 0.18 * ch, 0.1, ch - sg * 0.18 * sh);
    bend(TV, TV.a, TV.b, TV.p, FOLK.thigh, FOLK.shin, TV.e);
    bone(TV, L.up, TV.a, TV.e, L.r1); bone(TV, L.lo, TV.e, TV.b, L.r2);
    belly(TV, L.b1, TV.a, TV.e, 0.42, L.r1 * 1.12, 0.48); belly(TV, L.b2, TV.e, TV.b, 0.3, L.r2 * 1.3, 0.42);
    L.j0.position.copy(TV.a); L.j1.position.copy(TV.e);
    if (L.cover) { TV.c.lerpVectors(TV.a, TV.e, 0.62); bone(TV, L.cover, TV.a, TV.c, L.r1 * 1.42); L.cover.position.lerp(TV.e, -0.08); }
    TV.c.lerpVectors(TV.e, TV.b, 0.66); bone(TV, L.sock, TV.c, TV.b, L.r2 * 0.95);
    L.shoe.position.set(TV.b.x, P.foot[s][1] - 0.02, TV.b.z - 0.04);
    L.shoe.rotation.set(P.toe[s], hy * 0.6 + P.footYaw[s], 0, "YXZ");
  }
}
function newPose() {
  return { hx: 0, hy: FOLK.hipY, hz: 0, hipYaw: 0, twist: 0, lean: 0, roll: 0, breath: 0, headYaw: 0, headPitch: 0, headRoll: 0,
           mouth: "smile", mouthOpen: 0, brow: 0, browSad: 0, hand: [[0.6, 2.3, 0.1], [-0.6, 2.3, 0.1]], palm: [[-1, 0, 0], [1, 0, 0]],
           curl: [0.3, 0.3], elbowOut: [0, 0], foot: [[0.36, 0, 0], [-0.36, 0, 0]], footYaw: [0.1, -0.1], toe: [0, 0],
           propDir: [0, -1, 0.1] };
}

/* ---------------- Scene ---------------- */
// Per-hole color sets: stucco sides, the tile cap, the padded rails.
const PALETTE = [
  { stucco: "#ffb8cf", trim: "#ff5f9e", rail: 0x17c3c9 }, { stucco: "#9fe6e0", trim: "#1aa8a8", rail: 0xff6f61 },
  { stucco: "#ffd89a", trim: "#ff9a1f", rail: 0x8a5cff }, { stucco: "#d5c2ff", trim: "#7a4dff", rail: 0xffc93c },
  { stucco: "#b8f0a8", trim: "#3bb54a", rail: 0xff3fa4 }, { stucco: "#ffc6a8", trim: "#ff6f3c", rail: 0x2a9df4 }
];

function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: COVER });
  renderer.setClearColor(0x7a3ab8, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = (parseInt(T.REVISION, 10) || 0) >= 182 ? T.PCFShadowMap : T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(CAM_FOV, W / H, 20, 9000);
  const caps = renderer.capabilities;
  const aniso = Math.min(4, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  const TV = { a: new T.Vector3(), b: new T.Vector3(), c: new T.Vector3(), d: new T.Vector3(), d2: new T.Vector3(), e: new T.Vector3(), e2: new T.Vector3(),
               p: new T.Vector3(), q: new T.Vector3(), n: new T.Vector3(), up: new T.Vector3(0, 1, 0), hx: new T.Vector3(), hy: new T.Vector3(), hz: new T.Vector3(), m: new T.Matrix4() };

  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = aniso;
    return t;
  }
  const script = scriptCanvas(scriptImg), sAspect = script.width / script.height;
  const cScript = mkCanvas(1024, 512); cScript.getContext("2d").drawImage(script, 8, 8, 1008, 496);
  const cTurf = turfCanvas();
  const tTurf = tex(cTurf, true), tLawn = tex(lawnCanvas(), true), tPlank = tex(plankCanvas(), true), tSand = tex(sandCanvas(), true);
  const tWater = tex(waterCanvas(), true), tLava = tex(lavaCanvas(), true), tSwirl = tex(swirlCanvas(cTurf));
  const tBall = tex(ballCanvas(script), true), tTee = tex(teeCanvas(script)), tBumper = tex(bumperCanvas()), tBoost = tex(boostCanvas(), true);
  const tShadow = tex(shadowCanvas()), tStone = tex(stoneCanvas(), true), tBark = tex(barkCanvas(), true), tFrond = tex(frondCanvas());
  const tSail = tex(sailCanvas()), tScript = tex(cScript), tSky = tex(skyCanvas()), tHills = tex(hillsCanvas(), true);
  const tStripe = tex(stripeCanvas("#ffffff", "#ff3b4a", 8), true), tFall = tex(waterCanvas(), true);
  tBall.wrapT = T.ClampToEdgeWrapping; tSwirl.center.set(0.5, 0.5);
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;

  /* lights: late afternoon, the sun low over the left shoulder */
  scene.add(new T.HemisphereLight(0xfff0ff, 0x5a7a5a, 0.95));
  const key = new T.DirectionalLight(0xffdcb8, 3.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -330; sc.right = 330; sc.top = 380; sc.bottom = -380; sc.near = 40; sc.far = 1400;
  sc.updateProjectionMatrix();
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.6; key.shadow.radius = 2.4;
  scene.add(key); scene.add(key.target);
  const fill = new T.DirectionalLight(0xc9d8ff, 0.6);
  fill.position.set(160, 200, 360); scene.add(fill);

  function decal(mat, order) { mat.transparent = true; mat.depthWrite = false; mat._order = order; return mat; }
  function lit(mesh, cast, recv) { mesh.castShadow = !!cast; mesh.receiveShadow = !!recv; if (mesh.material && mesh.material._order) mesh.renderOrder = mesh.material._order; return mesh; }
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
  function ground(x1, y1, x2, y2, y, mat, su, sv) {
    const g = new T.PlaneGeometry(x2 - x1, y2 - y1);
    g.rotateX(-Math.PI / 2);
    if (su) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }
    const m = new T.Mesh(g, mat);
    m.position.set((x1 + x2) / 2 - CX, y, (y1 + y2) / 2 - CZ);
    if (mat._order) m.renderOrder = mat._order;
    return m;
  }
  function rectPts(x1, y1, x2, y2) { return [new T.Vector2(x1, y1), new T.Vector2(x2, y1), new T.Vector2(x2, y2), new T.Vector2(x1, y2)]; }
  const phong = function (col, sh, refl, more) {
    const p = { color: col, specular: 0xffffff, shininess: sh || 80 };
    if (refl) { p.envMap = tEnv; p.combine = T.AddOperation; p.reflectivity = refl; }
    if (more) for (const k in more) p[k] = more[k];
    return new T.MeshPhongMaterial(p);
  };

  /* shared materials */
  const turfMat = new T.MeshLambertMaterial({ map: tTurf, vertexColors: true });
  const lavaMat = new T.MeshPhongMaterial({ map: tLava, color: 0xffd8c8, emissive: 0x1a0400, specular: 0x8a5a4a, shininess: 30, vertexColors: true });
  const swirlMat = new T.MeshLambertMaterial({ map: tSwirl, vertexColors: true });
  const plankMat = new T.MeshLambertMaterial({ map: tPlank, vertexColors: true });
  const lawnMat = new T.MeshLambertMaterial({ map: tLawn });
  const stoneMat = new T.MeshLambertMaterial({ map: tStone });
  const waterMat = decal(new T.MeshPhongMaterial({ map: tWater, specular: 0xffffff, shininess: 120, opacity: 0.94, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12 }), 3);
  const sandMat = decal(new T.MeshLambertMaterial({ map: tSand }), 2);
  const teeMat = decal(new T.MeshLambertMaterial({ map: tTee }), 2);
  const boostMat = decal(new T.MeshBasicMaterial({ map: tBoost }), 3);
  const boostEdge = decal(new T.MeshLambertMaterial({ color: 0xffcf3a }), 2);
  const shadowMat = decal(new T.MeshBasicMaterial({ map: tShadow, opacity: 0.55 }), 6);
  const holeMat = decal(new T.MeshBasicMaterial({ color: 0x0a0814 }), 3);
  const cupWall = new T.MeshLambertMaterial({ color: 0xe8eaf0, side: T.BackSide }), cupFloor = new T.MeshLambertMaterial({ color: 0x14161c });
  const rimMat = phong(0xffffff, 80), poleMat = phong(0xf6f6f6, 90), capMat = phong(0xffcf3a, 110, 0.18);
  const skirtMats = PALETTE.map(function (p) { return new T.MeshLambertMaterial({ map: tex(stuccoCanvas(p.stucco, p.trim), true) }); });
  const railMats = PALETTE.map(function (p) { return phong(p.rail, 70, 0.12); });
  const neon = function (col) { return new T.MeshPhongMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, specular: 0xffffff, shininess: 90 }); };
  const navyMat = phong(0x22164e, 60), chromeMat = phong(0xdfe3ec, 120, 0.35), blackMat = phong(0x16141c, 40);
  const signSide = phong(0x2a1a6a, 40);

  /* shared geometry */
  const cupGeo = new T.CylinderGeometry(CUP_R, CUP_R * 0.94, CUP_D, 28, 1, true);
  const cupBot = new T.CircleGeometry(CUP_R, 24); cupBot.rotateX(-Math.PI / 2);
  const rimGeo = new T.RingGeometry(CUP_R - 0.2, CUP_R + 1.1, 36); rimGeo.rotateX(-Math.PI / 2);
  const poleGeo = new T.CylinderGeometry(0.75, 0.75, 46, 8); poleGeo.translate(0, 23 - CUP_D, 0);
  const knobGeo = new T.SphereGeometry(1.6, 10, 8); knobGeo.translate(0, 46 - CUP_D, 0);
  const FLAG_W = 24, FLAG_H = 15;
  const flagGeo = new T.PlaneGeometry(FLAG_W, FLAG_H, 10, 2); flagGeo.translate(FLAG_W / 2 + 0.6, 46 - CUP_D - FLAG_H / 2 - 1.5, 0);
  const flagBase = Float32Array.from(flagGeo.attributes.position.array);
  const postGeo = new T.CylinderGeometry(1, 1, 1, 12); postGeo.translate(0, 0.5, 0);
  const sphereGeo = new T.SphereGeometry(1, 16, 12);

  /* sky, hills, lawn */
  const skyMesh = new T.Mesh(new T.SphereGeometry(6000, 32, 16), new T.MeshBasicMaterial({ map: tSky, side: T.BackSide, depthWrite: false, fog: false }));
  skyMesh.renderOrder = -2; scene.add(skyMesh);
  const hillGeo = new T.CylinderGeometry(4200, 4200, 520, 48, 1, true);
  (function () { const uv = hillGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 6); })();
  const hills = new T.Mesh(hillGeo, new T.MeshBasicMaterial({ map: tHills, side: T.BackSide, transparent: true, alphaTest: 0.5, depthWrite: false }));
  hills.position.y = 120; hills.renderOrder = -1; scene.add(hills);
  const span = HOLE_PITCH * (HOLES.length + 4), deep = 4200;
  const lawn = lit(new T.Mesh(new T.PlaneGeometry(span, deep).rotateX(-Math.PI / 2), lawnMat), false, true);
  (function () { const uv = lawn.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * span / 240, uv.getY(i) * deep / 240); })();
  lawn.position.set(HOLE_PITCH * (HOLES.length - 1) / 2, -BASE, -600); scene.add(lawn);

  const fake = [];                                              // stand-in blob shadows, shown only when shadow maps are off
  function blob(parent, x, z, y, s) { const m = new T.Mesh(unit, shadowMat); m.scale.set(s, 1, s); m.position.set(x, y, z); m.visible = false; m.renderOrder = 6; parent.add(m); fake.push(m); return m; }

  /* ---------- props ---------- */
  function palm(parent, x, y, gy, ht, spread, rnd) {
    const g = new T.Group(); g.position.set(x - CX, gy, y - CZ);
    const lean = (rnd() - 0.5) * 0.25, trunk = new T.Mesh(new T.CylinderGeometry(ht * 0.055, ht * 0.08, ht, 10, 4, true), new T.MeshLambertMaterial({ map: tBark }));
    trunk.position.y = ht / 2; trunk.rotation.z = lean; g.add(lit(trunk, true, true));
    const top = new T.Group(); top.position.set(-Math.sin(lean) * ht, ht * Math.cos(lean), 0); g.add(top);
    const fm = new T.MeshLambertMaterial({ map: tFrond, side: T.DoubleSide, alphaTest: 0.5 });
    for (let k = 0; k < 8; k++) {
      const fg = new T.PlaneGeometry(spread * 0.36, spread, 1, 6);
      const p = fg.attributes.position;
      for (let i = 0; i < p.count; i++) { const v = (p.getY(i) + spread / 2) / spread; p.setXYZ(i, p.getX(i), v * spread, -Math.pow(v, 2) * spread * 0.55); }
      fg.rotateX(-Math.PI / 2 + 0.5);
      const f = new T.Mesh(fg, fm); f.rotation.y = k * TAU / 8 + rnd() * 0.3; top.add(lit(f, true, false));
    }
    for (let k = 0; k < 3; k++) { const cn = new T.Mesh(sphereGeo, new T.MeshLambertMaterial({ color: 0x6a4a1a })); cn.scale.setScalar(ht * 0.035); cn.position.set(Math.cos(k * 2.1) * ht * 0.05, -ht * 0.03, Math.sin(k * 2.1) * ht * 0.05); top.add(cn); }
    parent.add(g);
    blob(parent, x - CX + 4, y - CZ - 2, gy + 0.3, spread * 1.6);
    return g;
  }
  function bush(parent, x, y, gy, s, col, rnd) {
    const g = new T.Group(); g.position.set(x - CX, gy, y - CZ);
    for (let k = 0; k < 4; k++) { const b = new T.Mesh(sphereGeo, new T.MeshLambertMaterial({ color: 0x2e8a3a })); b.scale.set(s * (0.7 + rnd() * 0.4), s * 0.6, s * (0.7 + rnd() * 0.4)); b.position.set((rnd() - 0.5) * s, s * 0.35, (rnd() - 0.5) * s); g.add(lit(b, true, true)); }
    for (let k = 0; k < 7; k++) { const f = new T.Mesh(sphereGeo, new T.MeshLambertMaterial({ color: col })); f.scale.setScalar(s * 0.16); f.position.set((rnd() - 0.5) * s * 1.4, s * (0.55 + rnd() * 0.35), (rnd() - 0.5) * s * 1.2); g.add(f); }
    parent.add(g);
  }

  /* ---------- the LED ribbon (one board, carried to whichever hole is being played) ---------- */
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
      "  vec3 col = led * lens * 1.4 + halo * 0.36 + vec3(0.03, 0.032, 0.05) * lens + vec3(0.006, 0.006, 0.012);",
      "  gl_FragColor = vec4(col, 1.0);",
      "  #include <" + csChunk + ">",
      "}"
    ].join("\n")
  });
  const ledMesh = new T.Mesh(new T.PlaneGeometry(SIGN_W - 10, LED_H), ledMat);

  /* ---------- one hole ---------- */
  function buildHole(i) {
    const h = HOLES[i], pal = h.theme % PALETTE.length, grp = new T.Group();
    const o = { grp: grp, sliders: [], rotors: [], mills: [], bumpers: [], bridge: null, flag: null, pts: [], board: null, ledAnchor: null,
                smoke: [], beam: null, falls: null, swirl: false, crowdAt: null };
    grp.position.x = i * HOLE_PITCH;
    const rnd = rng(i * 97 + 11);
    let m;
    const cupH = turfH(h, h.cup[0], h.cup[1], 0, 0);

    // turf, with a real hole cut for the cup, and the stucco sides of every raised tile
    h.zones.forEach(function (z) {
      let geo, mat = z.wood ? plankMat : turfMat;
      if (z.bridge) return;                                      // the drawbridge is built on its own, below
      if (z.dome) {
        const d = z.dome, atCup = Math.hypot(h.cup[0] - d.cx, h.cup[1] - d.cy) < 1;
        mat = z.lava ? lavaMat : z.swirl ? swirlMat : turfMat;
        grp.add(lit(new T.Mesh(domeGeo(T, z, 1 / 96, atCup ? CUP_R : 0, z.swirl), mat), true, true));
        geo = flatGeo(T, rectPts(z.r.x, z.r.y, z.r.x + z.r.w, z.r.y + z.r.h), [circlePts(T, d.cx, d.cy, d.R, 48)], 0, 1 / 96);
        grp.add(lit(new T.Mesh(geo, turfMat), false, true));
        if (z.swirl) o.swirl = true;
        if (z.lava) {
          const rim = new T.Mesh(new T.TorusGeometry(d.rIn + 1, 1.6, 8, 40), neon(0xff7a1a)); rim.rotation.x = Math.PI / 2;
          rim.position.set(d.cx - CX, d.top + 0.4, d.cy - CZ); grp.add(rim);
          for (let k = 0; k < 4; k++) {
            const sp = new T.Sprite(new T.SpriteMaterial({ map: tex(glowCanvas("rgba(220,210,230,.5)")), transparent: true, depthWrite: false, opacity: 0.5 }));
            sp.position.set(d.cx - CX, d.top + 10, d.cy - CZ); grp.add(sp); o.smoke.push({ s: sp, k: k, cx: d.cx - CX, cz: d.cy - CZ, y: d.top });
          }
        }
      } else {
        const r = z.r, isFlat = z.c[0] === z.c[1] && z.c[1] === z.c[2] && z.c[2] === z.c[3];
        const cupIn = inRect(h.cup[0], h.cup[1], r);
        if (isFlat) geo = flatGeo(T, rectPts(r.x, r.y, r.x + r.w, r.y + r.h), cupIn ? [circlePts(T, h.cup[0], h.cup[1], CUP_R, 28)] : [], z.c[0], z.wood ? 1 / 40 : 1 / 96);
        else geo = tileGeo(T, z, z.wood ? 1 / 40 : 1 / 96);
        grp.add(lit(new T.Mesh(geo, mat), false, true));
      }
      if (!z.wood) grp.add(lit(new T.Mesh(skirtGeo(T, z), skirtMats[pal]), false, true));
      else {                                                     // a plank bridge: a thin deck on posts
        const r = z.r;
        [[r.x + 2, r.y + 4], [r.x + r.w - 2, r.y + 4], [r.x + 2, r.y + r.h - 4], [r.x + r.w - 2, r.y + r.h - 4]].forEach(function (q) {
          const pm = new T.Mesh(postGeo, navyMat); pm.scale.set(1.6, BASE + zoneH(z, q[0], q[1]), 1.6); pm.position.set(q[0] - CX, -BASE, q[1] - CZ); grp.add(lit(pm, true, false));
        });
      }
      const r = z.r;
      [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].forEach(function (q) { o.pts.push([q[0] - CX, turfH(h, q[0], q[1], 0, 0), q[1] - CZ]); });
    });

    // water: a basin under the turf
    h.water.concat(h.waterLook || []).forEach(function (r) {
      grp.add(lit(ground(r.x, r.y, r.x + r.w, r.y + r.h, WATER_Y, waterMat, r.w / 90, r.h / 90), false, true));
    });
    if (false) {                                        // the waterfall off the ledge
      const fg = new T.PlaneGeometry(40, 22 - WATER_Y + 1);
      const fm = new T.MeshPhongMaterial({ map: tFall, color: 0xbff6ff, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.85, side: T.DoubleSide });
      const fall = new T.Mesh(fg, fm); fall.position.set(120 - CX, (22 + WATER_Y) / 2, 330 - CZ + 0.6); grp.add(fall); o.falls = fm;
    }

    // the cup and the pin
    const cup = new T.Group();
    cup.position.set(h.cup[0] - CX, cupH, h.cup[1] - CZ);
    m = new T.Mesh(cupGeo, cupWall); m.position.y = -CUP_D / 2; cup.add(lit(m, false, true));
    m = new T.Mesh(cupBot, cupFloor); m.position.y = -CUP_D; cup.add(m);
    m = new T.Mesh(rimGeo, rimMat); m.position.y = 0.05; cup.add(lit(m, false, true));
    grp.add(cup);
    const flag = new T.Group();
    flag.add(lit(new T.Mesh(poleGeo, poleMat), true, false));
    flag.add(lit(new T.Mesh(knobGeo, capMat), true, false));
    flag.add(lit(new T.Mesh(flagGeo, new T.MeshLambertMaterial({ map: tex(flagCanvas(script, i + 1)), side: T.DoubleSide })), true, false));
    flag.position.copy(cup.position); grp.add(flag); o.flag = flag; o.cupY = cupH;
    o.pts.push([h.cup[0] - CX + FLAG_W, cupH + 36, h.cup[1] - CZ]);

    // the tee mat
    const tH = turfH(h, h.tee[0], h.tee[1], 0, 0);
    grp.add(lit(ground(h.tee[0] - 21, h.tee[1] - 13, h.tee[0] + 21, h.tee[1] + 16, tH + 0.14, teeMat), false, true));

    // padded rails (stone on the castle)
    h.walls.forEach(function (r) {
      if (r.hide) return;
      const along = r.w >= r.h, len = along ? r.w : r.h, th = along ? r.h : r.w;
      const geo = railGeo(T, h, r.x + r.w / 2, r.y + r.h / 2, len, th, along ? 0 : Math.PI / 2, r.stone ? 26 : RAIL_H);
      grp.add(lit(new T.Mesh(geo, r.stone ? stoneMat : railMats[pal]), true, true));
      if (r.stone) for (let x = r.x + 4; x < r.x + r.w - 2; x += 14) { const mm = new T.Mesh(roundBox(T, 7, 6, r.h, 0.8), stoneMat); mm.position.set(x + 3.5 - CX, 26 + 3, r.y + r.h / 2 - CZ); grp.add(lit(mm, true, true)); }
      o.pts.push([r.x - CX, RAIL_H + railTop(h, r.x, r.y), r.y - CZ], [r.x + r.w - CX, RAIL_H, r.y - CZ], [r.x - CX, -BASE, r.y + r.h - CZ], [r.x + r.w - CX, -BASE, r.y + r.h - CZ]);
    });
    h.segs.forEach(function (s) {
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) + s.t, ang = Math.atan2(-(s.y2 - s.y1), s.x2 - s.x1);
      grp.add(lit(new T.Mesh(railGeo(T, h, (s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, len, s.t * 2, ang), h.theme === 16 ? neon(0x3ff0ff) : railMats[pal]), true, true));
    });
    // the wordmark plaque on the front rail, facing the tee
    let maxY = -1e9, px1 = 1e9, px2 = -1e9;
    h.walls.forEach(function (r) { if (r.y + r.h > maxY && r.w >= r.h) maxY = r.y + r.h; });
    h.walls.forEach(function (r) { if (r.y + r.h === maxY && r.w >= r.h) { px1 = Math.min(px1, r.x); px2 = Math.max(px2, r.x + r.w); } });
    if (px2 > px1) {
      const pw = Math.min(96, px2 - px1 - 20), ph = pw / sAspect;
      const plq = new T.Mesh(new T.PlaneGeometry(pw, ph), new T.MeshBasicMaterial({ map: tScript, transparent: true }));
      plq.position.set((px1 + px2) / 2 - CX, -BASE + (BASE + RAIL_H + railTop(h, (px1 + px2) / 2, maxY - 5)) * 0.52, maxY - CZ + 0.4); grp.add(plq);
    }

    // sand, boost pads
    h.sand.forEach(function (r) {
      const g2 = flatGeo(T, roundRectPts(T, r.x, r.y, r.x + r.w, r.y + r.h, 8), null, turfH(h, r.x + r.w / 2, r.y + r.h / 2, 0, 0) + 0.2, 1 / 40);
      grp.add(lit(new T.Mesh(g2, sandMat), false, true)).renderOrder = 2;
    });
    h.boosts.forEach(function (bo) {
      const r = bo.r;
      grp.add(lit(ground(r.x - 2, r.y - 2, r.x + r.w + 2, r.y + r.h + 2, 0.22, boostEdge), false, true));
      m = ground(r.x, r.y, r.x + r.w, r.y + r.h, 0.3, boostMat, r.w / 22, r.h / 20); grp.add(m);
    });

    // pinball bumpers
    h.bumpers.forEach(function (bu) {
      const gy = turfH(h, bu.x, bu.y, 0, 0), g2 = new T.Group(); g2.position.set(bu.x - CX, gy, bu.y - CZ);
      const base = new T.Mesh(new T.CylinderGeometry(bu.r, bu.r * 1.08, 7, 24), navyMat); base.position.y = 3.5; g2.add(lit(base, true, true));
      const ringM = neon(0xff3fa4), ring = new T.Mesh(new T.TorusGeometry(bu.r * 0.98, 1.5, 8, 28), ringM); ring.rotation.x = Math.PI / 2; ring.position.y = 7; g2.add(ring);
      const top = new T.Mesh(new T.CylinderGeometry(bu.r * 0.86, bu.r * 0.86, 2.6, 24), [chromeMat, new T.MeshPhongMaterial({ map: tBumper, emissive: 0x330022, specular: 0xffffff, shininess: 100 }), chromeMat]);
      top.position.y = 8.6; g2.add(lit(top, true, false));
      grp.add(g2); o.bumpers.push({ ring: ringM, top: top, base: ringM.emissiveIntensity });
    });
    h.posts.forEach(function (p) {
      const gy = turfH(h, p.x, p.y, 0, 0);
      const pm = new T.Mesh(new T.CylinderGeometry(p.r, p.r * 1.1, 16, 16), new T.MeshPhongMaterial({ map: tStripe, specular: 0xffffff, shininess: 80 }));
      pm.position.set(p.x - CX, gy + 8, p.y - CZ); grp.add(lit(pm, true, true));
      const cap = new T.Mesh(sphereGeo, capMat); cap.scale.setScalar(p.r * 0.9); cap.position.set(p.x - CX, gy + 17, p.y - CZ); grp.add(lit(cap, true, false));
    });
    h.palms.forEach(function (p) { palm(grp, p.x, p.y, turfH(h, p.x, p.y, 0, 0), 30, 19, rnd); });

    // the boombox sliding across the top deck
    h.sliders.forEach(function (s) {
      const gy = turfH(h, s.x1 + s.w / 2, s.y + s.h / 2, 0, 0), hh = 20;
      const side = phong(0xb4b9c8, 90, 0.2);
      const mesh = new T.Mesh(roundBox(T, s.w, hh, s.h, 3), [side, side, new T.MeshPhongMaterial({ map: tex(boomTopCanvas(script)), specular: 0xcccccc, shininess: 80 }), side,
        new T.MeshPhongMaterial({ map: tex(boomFrontCanvas()), specular: 0xcccccc, shininess: 80 }), side]);
      mesh.position.set(s.x1 + s.w / 2 - CX, gy + hh / 2, s.y + s.h / 2 - CZ); grp.add(lit(mesh, true, true));
      const handle = new T.Mesh(new T.TorusGeometry(s.w * 0.32, 1.8, 8, 20, Math.PI), chromeMat);
      handle.position.y = hh / 2; mesh.add(lit(handle, true, false));
      o.sliders.push({ mesh: mesh, s: s, shadow: blob(grp, mesh.position.x, mesh.position.z, gy + 0.3, s.w * 1.1) });
    });
    // spinning neon bars
    h.rotors.forEach(function (ro) {
      const gy = turfH(h, ro.x, ro.y, 0, 0), rg = new T.Group(); rg.position.set(ro.x - CX, gy, ro.y - CZ);
      const hub = new T.Mesh(new T.CylinderGeometry(6.5, 7, 12, 20), chromeMat); hub.position.y = 6; rg.add(lit(hub, true, true));
      const cap2 = new T.Mesh(sphereGeo, neon(0xffcf3a)); cap2.scale.set(5.5, 3, 5.5); cap2.position.y = 12; rg.add(cap2);
      const armMat = [neon(0x3ff0ff), neon(0xff3fa4), neon(0x7dff3a)];
      for (let k = 0; k < ro.n; k++) {
        const arm = new T.Group(); arm.rotation.y = -k * TAU / ro.n;
        m = new T.Mesh(roundBox(T, ro.len - 3, 8, 6.4, 2.4), armMat[k % 3]); m.position.set(3 + (ro.len - 3) / 2, 5.5, 0);
        arm.add(lit(m, true, true)); rg.add(arm);
      }
      grp.add(rg); o.rotors.push({ ro: ro, grp: rg });
    });
    // the windmill
    h.windmills.forEach(function (mw) {
      const stuc = new T.MeshLambertMaterial({ map: tex(stuccoCanvas("#fff1e6", "#ff5f9e"), true) });
      const back = mw.front - 32, dl = mw.x - mw.door / 2, dr = mw.x + mw.door / 2, ht = 60;
      const blocks = [[110, dl, 0, ht], [dr, 250, 0, ht], [dl, dr, 34, ht]];
      blocks.forEach(function (bk) {
        const bm = new T.Mesh(roundBox(T, bk[1] - bk[0], bk[3] - bk[2], 32, 1.5), stuc);
        bm.position.set((bk[0] + bk[1]) / 2 - CX, (bk[2] + bk[3]) / 2, (back + mw.front) / 2 - CZ); grp.add(lit(bm, true, true));
      });
      const inner = ground(dl, back, dr, mw.front, 0.15, decal(new T.MeshBasicMaterial({ color: 0x2a1a3a, opacity: 0.55 }), 2)); grp.add(inner);
      const roofS = new T.Shape([new T.Vector2(-24, 0), new T.Vector2(24, 0), new T.Vector2(0, 30)]);
      const roof = new T.Mesh(new T.ExtrudeGeometry(roofS, { depth: 150, bevelEnabled: false }), phong(0xff5f9e, 40));
      roof.rotation.y = Math.PI / 2; roof.position.set(110 - 5 - CX, ht, (back + mw.front) / 2 - CZ); grp.add(lit(roof, true, true));
      const plq = new T.Mesh(new T.PlaneGeometry(64, 64 / sAspect), new T.MeshBasicMaterial({ map: tScript, transparent: true }));
      plq.position.set(mw.x - 44 - CX, 44, mw.front - CZ + 0.3); grp.add(plq);
      const plq2 = plq.clone(); plq2.position.x = mw.x + 44 - CX; grp.add(plq2);
      const hubY = 68, blades = new T.Group(); blades.position.set(mw.x - CX, hubY, mw.front + 5 - CZ);
      const sailMat = new T.MeshLambertMaterial({ map: tSail, transparent: true, alphaTest: 0.4, side: T.DoubleSide });
      for (let k = 0; k < 4; k++) {
        const arm = new T.Group(); arm.rotation.z = k * Math.PI / 2;
        const sg = new T.PlaneGeometry(16, 60); sg.translate(0, -34, 0);
        arm.add(lit(new T.Mesh(sg, sailMat), true, false)); blades.add(arm);
      }
      const hubM = new T.Mesh(new T.CylinderGeometry(5, 5, 8, 16), capMat); hubM.rotation.x = Math.PI / 2; blades.add(hubM);
      grp.add(blades); o.mills.push({ m: mw, blades: blades });
      o.pts.push([mw.x - CX, ht + 30, back - CZ]);
    });
    // drawbridge, castle towers
    if (h.bridge) {
      const br = h.bridge, piv = new T.Group(); piv.position.set((br.x1 + br.x2) / 2 - CX, 0, br.y1 - CZ);
      const deckMat = new T.MeshLambertMaterial({ map: tPlank }), deck = new T.Mesh(roundBox(T, br.x2 - br.x1, 3, br.y2 - br.y1, 0.8), deckMat);
      deck.position.set(0, -1.5, (br.y2 - br.y1) / 2); piv.add(lit(deck, true, true));
      grp.add(piv); o.bridge = { piv: piv, br: br };
      [br.x1 - 8, br.x2 + 8].forEach(function (tx) {
        const tw = new T.Mesh(new T.CylinderGeometry(12, 13, 50, 20), stoneMat); tw.position.set(tx - CX, 25, 238 - CZ); grp.add(lit(tw, true, true));
        for (let k = 0; k < 8; k++) { const mm = new T.Mesh(roundBox(T, 5, 6, 5, 0.6), stoneMat); mm.position.set(tx - CX + Math.cos(k * TAU / 8) * 11, 53, 238 - CZ + Math.sin(k * TAU / 8) * 11); grp.add(lit(mm, true, true)); }
        const cone = new T.Mesh(new T.ConeGeometry(14, 26, 20), phong(0xff5f9e, 40)); cone.position.set(tx - CX, 70, 238 - CZ); grp.add(lit(cone, true, true));
        o.pts.push([tx - CX, 83, 238 - CZ]);
      });
    }
    // tubes: a mouth in the turf, a glass pipe arching over to the exit
    h.tubes.forEach(function (tu) {
      const pts = [], q = { x: 0, y: 0, h: 0 };
      for (let k = 0; k <= 16; k++) { tubePoint(tu, k / 16, q); pts.push(new T.Vector3(q.x - CX, q.h + turfH(h, q.x, q.y, 0, 0) * (1 - Math.sin(Math.PI * k / 16)), q.y - CZ)); }
      const curve = new T.CatmullRomCurve3(pts);
      const glass = new T.Mesh(new T.TubeGeometry(curve, 64, 7.5, 14, false), new T.MeshPhongMaterial({ color: 0x9ff6ff, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.32, depthWrite: false, side: T.DoubleSide }));
      glass.renderOrder = 8; grp.add(glass);
      const stripe = new T.Mesh(new T.TubeGeometry(curve, 64, 7.8, 14, false), new T.MeshBasicMaterial({ color: 0xff3fa4, wireframe: true, transparent: true, opacity: 0.25 }));
      grp.add(stripe);
      [[tu.x, tu.y], [tu.ex, tu.ey]].forEach(function (mp, k) {
        const gy = turfH(h, mp[0], mp[1], 0, 0);
        const hole2 = new T.Mesh(new T.CircleGeometry(k ? 8 : tu.r - 1, 24).rotateX(-Math.PI / 2), holeMat); hole2.position.set(mp[0] - CX, gy + 0.2, mp[1] - CZ); hole2.renderOrder = 3; grp.add(hole2);
        const ring = new T.Mesh(new T.TorusGeometry(k ? 9 : tu.r, 2, 8, 28), neon(k ? 0x7dff3a : 0xff3fa4)); ring.rotation.x = Math.PI / 2; ring.position.set(mp[0] - CX, gy + 0.8, mp[1] - CZ); grp.add(lit(ring, true, false));
      });
    });
    // the loop
    h.loops.forEach(function (lp) {
      const N = 120, q = { x: 0, y: 0, h: 0 }, P = [], pos = [], uv = [], idx = [];
      for (let k = 0; k <= N; k++) { loopPoint(lp, k / N, q); P.push(new T.Vector3(q.x - CX, q.h + BR, q.y - CZ)); }
      const Tn = new T.Vector3(), Nn = new T.Vector3(), Bn = new T.Vector3(1, 0, 0), s = new T.Vector3();
      for (let k = 0; k <= N; k++) {
        Tn.subVectors(P[Math.min(N, k + 1)], P[Math.max(0, k - 1)]).normalize();
        Nn.crossVectors(Bn, Tn).normalize();
        const c = P[k].clone().addScaledVector(Nn, -BR - 0.6);
        [[-9, 4.5], [-8, 0], [8, 0], [9, 4.5]].forEach(function (e) { s.copy(c).addScaledVector(Bn, e[0]).addScaledVector(Nn, e[1]); pos.push(s.x, s.y, s.z); uv.push(k / N * 8, (e[0] + 9) / 18); });
      }
      for (let k = 0; k < N; k++) for (let j = 0; j < 3; j++) { const a = k * 4 + j, b = a + 4; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const tg = buf(T, pos, null, uv, idx);
      const track = new T.Mesh(tg, new T.MeshPhongMaterial({ map: tex(stripeCanvas("#ff3fa4", "#ffd23f", 8), true), specular: 0xffffff, shininess: 90, side: T.DoubleSide }));
      grp.add(lit(track, true, true));
      [[lp.x - 14, (lp.fy + lp.exitY) / 2 - 2], [lp.exitX + 14, (lp.fy + lp.exitY) / 2 - 2]].forEach(function (q2) {
        const pm = new T.Mesh(postGeo, chromeMat); pm.scale.set(2, 2 * lp.R + 6, 2); pm.position.set(q2[0] - CX, 0, q2[1] - CZ); grp.add(lit(pm, true, false));
      });
      const bar = new T.Mesh(postGeo, chromeMat); bar.rotation.z = Math.PI / 2; bar.scale.set(1.6, lp.exitX - lp.x + 28, 1.6);
      bar.position.set(lp.exitX + 14 - CX, 2 * lp.R + 6, (lp.fy + lp.exitY) / 2 - 2 - CZ); grp.add(lit(bar, true, false));
      // the planter box the loop rises out of (the ball can only get past it on the track)
      const pl = h.walls[h.walls.length - 1];
      const pbox = new T.Mesh(roundBox(T, pl.w, 6 + BASE, pl.h, 2), skirtMats[pal]); pbox.position.set(pl.x + pl.w / 2 - CX, (6 - BASE) / 2, pl.y + pl.h / 2 - CZ); grp.add(lit(pbox, true, true));
      for (let x = pl.x + 10; x < pl.x + pl.w - 8; x += 18) if (Math.abs(x - (lp.x + lp.exitX) / 2) > 30) bush(grp, x, pl.y + pl.h / 2, 6, 9, ["#ff3fa4", "#ffd23f", "#ffffff"][Math.floor(rnd() * 3)], rnd);
      o.pts.push([lp.x - CX, 2 * lp.R + 12, (lp.fy + lp.exitY) / 2 - CZ]);
    });
    // the lighthouse beside the leap
    if (h.theme === 8) {
      const lh = new T.Group(); lh.position.set(292 - CX, -BASE, 150 - CZ);
      const body = new T.Mesh(new T.CylinderGeometry(9, 14, 86, 20, 1), new T.MeshLambertMaterial({ map: tStripe })); body.position.y = 43; lh.add(lit(body, true, true));
      const deck = new T.Mesh(new T.CylinderGeometry(13, 13, 3, 20), navyMat); deck.position.y = 87; lh.add(lit(deck, true, false));
      const glassM = new T.Mesh(new T.CylinderGeometry(7, 7, 12, 16), new T.MeshPhongMaterial({ color: 0xfff6c8, emissive: 0xffe08a, emissiveIntensity: 0.9 })); glassM.position.y = 95; lh.add(glassM);
      const cone = new T.Mesh(new T.ConeGeometry(10, 12, 16), phong(0xff3b4a, 50)); cone.position.y = 107; lh.add(lit(cone, true, false));
      const beam = new T.Mesh(new T.ConeGeometry(16, 120, 16, 1, true), new T.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      beam.geometry.translate(0, -60, 0); beam.rotation.z = Math.PI / 2;
      const bp = new T.Group(); bp.position.y = 95; bp.add(beam); lh.add(bp);
      grp.add(lh); o.beam = bp;
    }

    // the hole board: posts, the painted panel, a slot for the LED ribbon on top
    let minY = 1e9, sx1 = 1e9, sx2 = -1e9;
    h.walls.forEach(function (r) { if (r.y < minY) minY = r.y; });
    h.walls.forEach(function (r) { if (r.y === minY && r.w >= r.h) { sx1 = Math.min(sx1, r.x); sx2 = Math.max(sx2, r.x + r.w); } });
    const scx = (sx1 + sx2) / 2 - CX, sz = minY - 22 - CZ, lean = 0.55, totH = SIGN_H + LED_H + 10;
    const board = new T.Group(); board.position.set(scx, 6, sz); board.rotation.x = -lean;
    const back2 = new T.Mesh(roundBox(T, SIGN_W + 8, totH, 4, 1.8), signSide); back2.position.y = totH / 2; board.add(lit(back2, true, false));
    const face = new T.Mesh(new T.PlaneGeometry(SIGN_W, SIGN_H), new T.MeshBasicMaterial({ map: tex(signCanvas(script, i + 1, h.par, h.name)) }));
    face.position.set(0, 4 + SIGN_H / 2, 2.1); board.add(face);
    const anchor = new T.Group(); anchor.position.set(0, 4 + SIGN_H + 1 + LED_H / 2, 2.15); board.add(anchor);
    grp.add(board);
    [-1, 1].forEach(function (sg) {
      m = new T.Mesh(postGeo, phong(0xeef0ff, 80)); m.scale.set(2, 6 + BASE + 8, 2); m.position.set(scx + sg * (SIGN_W / 2 - 14), -BASE, sz - 3); grp.add(lit(m, true, false));
    });
    const ty = 6 + totH * Math.cos(lean), tz = sz - totH * Math.sin(lean);
    o.pts.push([scx - SIGN_W / 2, ty, tz], [scx + SIGN_W / 2, ty, tz]);
    o.board = board; o.ledAnchor = anchor;
    // where the regulars stand: beside the board
    o.crowdAt = [[scx - SIGN_W / 2 - 22, sz + 10], [scx + SIGN_W / 2 + 22, sz + 10]];
    o.crowdAt.forEach(function (c) { o.pts.push([c[0], -BASE + 6 * FOLK_S, c[1]], [c[0], -BASE, c[1] + 10]); });

    // scenery on the lawn: palms and flower beds, clear of the course
    let bx1 = 1e9, bx2 = -1e9, by1 = 1e9, by2 = -1e9;
    h.walls.forEach(function (r) { bx1 = Math.min(bx1, r.x); bx2 = Math.max(bx2, r.x + r.w); by1 = Math.min(by1, r.y); by2 = Math.max(by2, r.y + r.h); });
    const busy = [{ x: bx1 - 14, y: by1 - 100, w: bx2 - bx1 + 28, h: by2 - by1 + 114 }, { x: scx + CX - SIGN_W / 2 - 50, y: minY - 80, w: SIGN_W + 100, h: 80 }];
    if (h.theme === 8) busy.push(rc(270, 120, 320, 180));
    const free = function (x, y, pad) { for (let k = 0; k < busy.length; k++) if (inRect(x, y, busy[k], pad)) return false; return true; };
    for (let k = 0, n = 0; k < 60 && n < 7; k++) {
      const x = -120 + rnd() * 600, y = 40 + rnd() * 560;
      if (!free(x, y, 18)) continue;
      n++;
      if (n <= 2) palm(grp, x, y, -BASE, 56 + rnd() * 24, 30, rnd);
      else bush(grp, x, y, -BASE, 9 + rnd() * 5, ["#ff3fa4", "#ffd23f", "#ffffff", "#ff8a1e", "#b68cff"][n % 5], rnd);
    }
    scene.add(grp);
    return o;
  }

  const holes = [];
  for (let i = 0; i < HOLES.length; i++) holes.push(buildHole(i));

  /* the ball, its stand-in shadow, the putter */
  const ballMat = phong(0xffffff, 150, 0.12, { map: tBall });
  const ball = lit(new T.Mesh(new T.SphereGeometry(BR * 1.12, 28, 18), ballMat), true, false);
  scene.add(ball);
  const ballShadow = new T.Mesh(unit, shadowMat.clone()); ballShadow.material._order = 6; ballShadow.renderOrder = 6; ballShadow.visible = false; scene.add(ballShadow);
  const putter = new T.Group(), putHead = new T.Group();
  putter.add(putHead);
  const ph = new T.Mesh(roundBox(T, 14, 4.6, 5, 1.6), [chromeMat, chromeMat, chromeMat, chromeMat, new T.MeshPhongMaterial({ color: 0xff3fa4, specular: 0xffffff, shininess: 90 }), chromeMat]);
  ph.rotation.y = Math.PI / 2; ph.position.y = 2.4; putHead.add(lit(ph, true, false));
  const shaft = new T.Group(); shaft.position.set(0, 4.6, 0); shaft.rotation.x = -0.42; putHead.add(shaft);
  const sm = new T.Mesh(postGeo, chromeMat); sm.scale.set(0.7, 44, 0.7); shaft.add(lit(sm, true, false));
  const grip = new T.Mesh(postGeo, blackMat); grip.scale.set(1.2, 13, 1.2); grip.position.y = 34; shaft.add(lit(grip, true, false));
  putter.visible = false; scene.add(putter);

  /* splash rings */
  const ringGeo = new T.RingGeometry(0.82, 1, 28); ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < 3; i++) { const m = new T.Mesh(ringGeo, decal(new T.MeshBasicMaterial({ color: 0xe8fdff, opacity: 0.8 }), 5)); m.renderOrder = 5; m.visible = false; scene.add(m); rings.push(m); }

  /* the course regulars */
  const G = { sphere: sphereGeo, tex: function (c) { return tex(c); } };
  G.lathe = function (prof) { return new T.LatheGeometry(prof.map(function (p) { return new T.Vector2(p[0], p[1]); }), 24, Math.PI, TAU); };
  G.cyl = new T.CylinderGeometry(0.86, 1, 1, 14, 1, true); G.cyl.translate(0, 0.5, 0);
  G.neck = new T.CylinderGeometry(0.9, 1.05, 1, 14, 1, true); G.neck.translate(0, 0.5, 0);
  G.sleeveTube = new T.CylinderGeometry(0.92, 1, 1, 16, 1, true); G.sleeveTube.translate(0, 0.5, 0);
  G.shortsTube = new T.CylinderGeometry(1.08, 1, 1, 16, 1, true); G.shortsTube.translate(0, 0.5, 0);
  G.brow = roundBox(T, 0.2, 0.045, 0.06, 0.02, 2);
  G.smile = new T.TorusGeometry(0.11, 0.022, 6, 14, Math.PI);
  G.ring = new T.TorusGeometry(0.11, 0.04, 6, 14);
  G.hoop = new T.TorusGeometry(0.08, 0.012, 6, 16);
  G.visorBand = new T.CylinderGeometry(0.47, 0.48, 0.12, 24, 1, true, -Math.PI * 0.62, Math.PI * 1.24);
  G.brim = new T.CircleGeometry(0.4, 20, Math.PI, Math.PI); G.brim.rotateX(-Math.PI / 2); G.brim.scale(1, 1, 0.9);
  G.finger = new T.CapsuleGeometry(0.024, 0.075, 3, 6); G.finger.translate(0, -0.05, 0);
  G.sole = roundBox(T, 0.3, 0.09, 0.66, 0.04, 3);
  G.lace = roundBox(T, 0.13, 0.015, 0.02, 0.007, 1);
  const SK1 = "#e8b48a", SK2 = "#a8683e";
  const dale = makeFolk(T, G, { skin: 0xe8b48a, skinHex: SK1, blush: "rgba(230,110,100,.35)", stubble: true, eye: 0x3a6a2a, lip: 0xb85a5a,
    shirt: poloCanvas(script, "#19b5b0", "#ffcf3a", "COURSE PRO"), sleeve: sleeveCanvas("#19b5b0", "#ffcf3a"), collar: 0xffcf3a,
    lower: shortsCanvas("#d9c08a"), shorts: true, sock: 0xffffff, shoe: [0xffffff, 0x8a4a22, 0x2a2a2a], hair: 0x5a3a22, style: "visor", mustache: true });
  const rita = makeFolk(T, G, { skin: 0xa8683e, skinHex: SK2, blush: "rgba(200,80,90,.3)", eye: 0x3a2214, lip: 0x9a3a4a, female: true,
    shirt: jacketCanvas(script), sleeve: sleeveCanvas("#2b2aa8", "#ff3fa4"), longSleeve: true,
    lower: shortsCanvas("#14134a"), leg: legCanvas("#1c1a5e", "#14134a"), shorts: false, sock: 0xffffff, shoe: [0xffffff, 0xff3fa4, 0xe8e8f0], hair: 0x3a1a12, style: "pony" });
  // Dale's own putter, and Rita's scorecard clipboard (both in life-size feet, carried in a hand)
  const pp = new T.Group();
  const ps = new T.Mesh(postGeo, chromeMat); ps.scale.set(0.035, 2.75, 0.035); pp.add(ps);
  const pg = new T.Mesh(postGeo, blackMat); pg.scale.set(0.055, 0.7, 0.055); pg.position.y = -0.1; pp.add(pg);
  const phd = new T.Mesh(roundBox(T, 0.42, 0.13, 0.15, 0.05, 2), [chromeMat, chromeMat, chromeMat, chromeMat, new T.MeshPhongMaterial({ color: 0xff3fa4, specular: 0xffffff, shininess: 80 }), chromeMat]);
  phd.position.set(0.12, 2.78, 0.0); pp.add(phd);
  dale.body.add(pp); dale.prop = pp;
  const cb = new T.Mesh(roundBox(T, 0.72, 0.9, 0.04, 0.03, 2), [signSide, signSide, signSide, signSide, new T.MeshLambertMaterial({ map: tex(scorecardCanvas(script)) }), signSide]);
  rita.body.add(cb); rita.prop = cb;
  [dale, rita].forEach(function (F) {
    F.root.scale.setScalar(FOLK_S);
    F.root.traverse(function (ob) { if (ob.isMesh) { ob.castShadow = true; ob.receiveShadow = false; } });
    scene.add(F.root);
    F.shadow = new T.Mesh(unit, shadowMat); F.shadow.scale.set(30, 1, 22); F.shadow.renderOrder = 6; scene.add(F.shadow); fake.push(F.shadow); F.shadow.visible = false;
  });

  /* frame every hole: the closest camera that keeps the whole course, its board and the regulars on screen */
  const sinP = Math.sin(CAM_PITCH), cosP = Math.cos(CAM_PITCH), tanF = Math.tan(CAM_FOV * Math.PI / 360), v = new T.Vector3();
  function bounds(pts, tx, tz, d) {
    camera.position.set(tx, d * sinP, tz + d * cosP); camera.lookAt(tx, 0, tz); camera.updateMatrixWorld();
    let x1 = 1e9, x2 = -1e9, y1 = 1e9, y2 = -1e9;
    for (let i = 0; i < pts.length; i++) {
      v.set(pts[i][0], pts[i][1], pts[i][2]).project(camera);
      const px = (v.x * 0.5 + 0.5) * W, py = (-v.y * 0.5 + 0.5) * H;
      if (px < x1) x1 = px; if (px > x2) x2 = px; if (py < y1) y1 = py; if (py > y2) y2 = py;
    }
    return { x1: x1, x2: x2, y1: y1, y2: y2 };
  }
  function centered(pts, d) {
    let tx = 0, tz = 0, bb = null;
    const ppu = H / (2 * d * tanF);
    for (let n = 0; n < 7; n++) {
      bb = bounds(pts, tx, tz, d);
      tx += ((bb.x1 + bb.x2) / 2 - (SAFE.x1 + SAFE.x2) / 2) / ppu;
      tz += ((bb.y1 + bb.y2) / 2 - (SAFE.y1 + SAFE.y2) / 2) / (ppu * sinP);
    }
    return { tx: tx, tz: tz, d: d, bb: bounds(pts, tx, tz, d) };
  }
  const fit = holes.map(function (o) {
    let lo = 300, hi = 5000, best = null;
    for (let n = 0; n < 18; n++) {
      const mid = (lo + hi) / 2, c = centered(o.pts, mid);
      if (c.bb.x2 - c.bb.x1 <= SAFE.x2 - SAFE.x1 && c.bb.y2 - c.bb.y1 <= SAFE.y2 - SAFE.y1) { best = c; hi = mid; } else lo = mid;
    }
    return best || centered(o.pts, 5000);
  });

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, key: key, holes: holes, fit: fit, fake: fake, TV: TV,
    ball: ball, ballShadow: ballShadow, putter: putter, putHead: putHead, rings: rings, flagGeo: flagGeo, flagBase: flagBase,
    tBoost: tBoost, tWater: tWater, tSwirl: tSwirl, tFall: tFall, ledMesh: ledMesh, ledHome: -1, folk: [dale, rita], pose: [newPose(), newPose()],
    sinP: sinP, cosP: cosP, script: script,
    camPos: new T.Vector3(), camTgt: new T.Vector3(), goalPos: new T.Vector3(), goalTgt: new T.Vector3(), camReady: false,
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0, folkHole: -1,
    ballQ: new T.Quaternion(), lastBall: null, bpx: 0, bpy: 0,
    qa: new T.Quaternion(), axis: new T.Vector3(), up: new T.Vector3(0, 1, 0), v: new T.Vector3(), v2: new T.Vector3(),
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, shadowsOn: true, shadowSize: 2048, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
const QUALITY = [{ pr: 2, sh: 2048 }, { pr: 1.5, sh: 1024 }, { pr: 1.15, sh: 1024 }, { pr: 1, sh: 0 }];
function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  const sh = QUALITY[R.quality].sh, on = sh > 0;
  if (on && sh !== R.shadowSize) {
    R.shadowSize = sh; R.key.shadow.mapSize.set(sh, sh);
    if (R.key.shadow.map) { R.key.shadow.map.dispose(); R.key.shadow.map = null; }
  }
  if (on !== R.shadowsOn) {
    R.shadowsOn = on; R.key.castShadow = on;
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
    R.renderer.setPixelRatio(pr); R.renderer.setSize(cw, ch, false);
    R.gl.style.width = cw + "px"; R.gl.style.height = ch + "px";
    R.dirty = true;
  }
  if (left !== R.left || top !== R.top) { R.left = left; R.top = top; R.gl.style.left = left + "px"; R.gl.style.top = top + "px"; }
  return true;
}
function camShake(mag, dur) { if (!R || Shell.reduced) return; R.shakeMag = mag; R.shakeDur = R.shakeT = dur; }

/* ---------------- Course <-> screen, through the 3D camera ---------------- */
function courseToScreen(x, y, hgt) {
  if (!R) return { x: x, y: y, ok: true };
  R.v.set(S.hole * HOLE_PITCH + x - CX, hgt || 0, y - CZ).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1 };
}
// HUD pixel -> the course point under it on the plane at height planeY (null above the horizon).
function screenToCourse(px, py, planeY) {
  const cam = R.camera;
  R.v.set(px / W * 2 - 1, 1 - py / H * 2, 0.5).unproject(cam);
  R.v2.copy(R.v).sub(cam.position);
  if (R.v2.y > -1e-6) return null;
  const t = ((planeY || 0) - cam.position.y) / R.v2.y;
  return { x: cam.position.x + R.v2.x * t - S.hole * HOLE_PITCH + CX, y: cam.position.z + R.v2.z * t + CZ };
}

/* ---------------- The regulars: a pose for this moment ---------------- */
function sstep(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
function set3(a, x, y, z) { a[0] = x; a[1] = y; a[2] = z; return a; }
function mix3(a, x, y, z, w) { a[0] += (x - a[0]) * w; a[1] += (y - a[1]) * w; a[2] += (z - a[2]) * w; }
// who: 0 = Dale (the course pro, with his putter), 1 = Rita (scorekeeper, with her clipboard)
function folkPose(P, who, t, kind, rt, look) {
  const calm = Shell.reduced, ph = who * 1.7, sw = calm ? 0 : 1;
  P.hx = 0.05 * Math.sin(0.9 * t + ph) * sw; P.hy = FOLK.hipY - 0.04 + 0.012 * Math.sin(1.8 * t + ph) * sw; P.hz = 0;
  P.hipYaw = 0.07 * Math.sin(0.45 * t + ph) * sw; P.twist = 0; P.lean = 0.04; P.roll = 0.035 * Math.sin(0.9 * t + ph) * sw;
  P.breath = 0.012 * Math.sin(1.7 * t + ph) * sw;
  P.headYaw = clamp(look, -0.85, 0.85); P.headPitch = 0.06; P.headRoll = 0.04 * Math.sin(0.5 * t + ph) * sw;
  P.mouth = "smile"; P.mouthOpen = 0; P.brow = 0.2; P.browSad = 0;
  set3(P.foot[0], 0.37 + P.hx * 0.4, 0, 0.03); set3(P.foot[1], -0.37 + P.hx * 0.4, 0, -0.03);
  P.footYaw[0] = 0.18; P.footYaw[1] = -0.18; P.toe[0] = P.toe[1] = 0;
  P.elbowOut[0] = P.elbowOut[1] = 0;
  P.propHand = 1;
  if (who === 0) {                                             // leaning on his putter with both hands
    set3(P.hand[0], 0.08 + P.hx, 2.98, 0.66); set3(P.hand[1], -0.03 + P.hx, 3.06, 0.64);
    set3(P.palm[0], -0.6, -0.5, 0.4); set3(P.palm[1], 0.6, -0.5, 0.4);
    P.curl[0] = P.curl[1] = 1.25;
    set3(P.propDir, 0.04, -1, 0.26);
  } else {                                                     // clipboard against her chest, other hand on her hip
    set3(P.hand[0], 0.36 + P.hx, 3.75, 0.5); set3(P.hand[1], -0.52 + P.hx, 3.2, -0.08);
    set3(P.palm[0], -0.4, 0, 1); set3(P.palm[1], 0.3, 0, -1);
    P.curl[0] = 0.95; P.curl[1] = 0.55; P.elbowOut[1] = 0.8;
    P.propHand = 0;
  }
  if (kind === "idle") return;
  const dur = kind === "cheer" ? 2.8 : kind === "wave" ? 1e9 : 2.1;
  const w = sstep(rt * 5) * (1 - sstep((rt - dur) * 3));
  if (w <= 0) return;
  const tt = calm ? 0.3 : t;
  if (kind === "cheer") {
    const hop = calm ? 0 : 0.42 * Math.max(0, Math.sin(7.5 * tt + ph));
    P.hy += hop * w; P.foot[0][1] += hop * w; P.foot[1][1] += hop * w;
    P.toe[0] = P.toe[1] = -0.25 * w * (hop > 0.05 ? 1 : 0);
    mix3(P.hand[0], 0.58, 6.3 + hop, 0.3, w); mix3(P.hand[1], -0.58, 6.3 + hop, 0.3, w);
    mix3(P.palm[0], 0, 0.2, 1, w); mix3(P.palm[1], 0, 0.2, 1, w);
    if (who === 0) { P.curl[0] = 1.3; P.curl[1] = 1.3; mix3(P.propDir, -0.95, 0.3, 0.1, w); }
    else { P.curl[1] = 0.1 * w + P.curl[1] * (1 - w); }
    P.mouth = "open"; P.mouthOpen = 0.5 + 0.5 * Math.abs(Math.sin(5 * tt)); P.brow = 1; P.headPitch = 0.06 - 0.18 * w;
  } else if (kind === "clap") {
    if (who === 0) {                                           // a fist pump, putter hanging from the other hand
      const pump = calm ? 0.5 : Math.abs(Math.sin(8 * tt));
      mix3(P.hand[1], -0.55, 5.85 + 0.35 * pump, 0.3, w); mix3(P.palm[1], 0, 0, 1, w); P.curl[1] = 1.45; P.elbowOut[1] = 0.5 * w; P.mouth = "open"; P.mouthOpen = 0.4;
      mix3(P.hand[0], 0.66, 2.9, 0.2, w); P.curl[0] = 1.3; P.propHand = 0; mix3(P.propDir, 0.12, -1, 0.1, w);
    } else {
      const c = calm ? 0.5 : 0.5 + 0.5 * Math.sin(15 * tt);
      mix3(P.hand[0], 0.07 + 0.22 * c, 4.2, 0.74, w); mix3(P.hand[1], -0.07 - 0.22 * c, 4.2, 0.74, w);
      mix3(P.palm[0], -1, 0, 0.25, w); mix3(P.palm[1], 1, 0, 0.25, w); P.curl[0] = 0.5; P.curl[1] = 0.1; P.elbowOut[1] = 0;
    }
    P.mouth = "smile"; P.brow = 0.6;
  } else if (kind === "groan") {
    mix3(P.hand[0], 0.3, 5.9, 0.16, w); mix3(P.hand[1], -0.3, 5.9, 0.16, w);
    mix3(P.palm[0], -0.3, -1, 0, w); mix3(P.palm[1], 0.3, -1, 0, w);
    P.curl[0] = who === 1 ? 0.9 : 1.25; P.curl[1] = who === 0 ? 1.25 : 0.4;
    P.lean = 0.04 - 0.14 * w; P.headPitch = 0.06 - 0.3 * w; P.mouth = "oh"; P.browSad = w;
    if (who === 0) mix3(P.propDir, -0.15, 0.8, -0.6, w);
  } else if (kind === "wave") {
    const wv = calm ? 0 : Math.sin(7 * tt);
    mix3(P.hand[1], -0.7 + 0.2 * wv, 5.75, 0.35, w); mix3(P.palm[1], 0, 0, 1, w); P.curl[1] = 0.05; P.elbowOut[1] = 0.2;
    if (who === 0) { mix3(P.hand[0], 0.64, 2.92, 0.22, w); P.propHand = 0; mix3(P.propDir, 0.1, -1, 0.15, w); }
    P.mouth = who === 0 ? "smile" : "open"; P.mouthOpen = 0.3; P.brow = 0.6;
  }
}
function placeProp(F, P) {
  const TV = R.TV;
  if (F === R.folk[0]) {
    const hd = F.arms[P.propHand].hand.g;
    F.prop.position.copy(hd.position).addScaledVector(TV.n.set(P.propDir[0], P.propDir[1], P.propDir[2]).normalize(), 0.22);
    F.prop.quaternion.setFromUnitVectors(TV.up, TV.n);
  } else {
    const hd = F.arms[0].hand.g;
    F.prop.position.set(hd.position.x - 0.05, hd.position.y - 0.12, hd.position.z + 0.12);
    F.prop.rotation.set(-0.28, -0.2, 0.18);
  }
}

/* ---------------- Game state -> meshes ---------------- */
const QP = { x: 0, y: 0, h: 0 };
function syncScene(state, fdt) {
  const idle = state === "title" || state === "over";
  const hi = S.hole, h = HOLES[hi], b = S.ball, ox = hi * HOLE_PITCH, t = S.holeT;
  let i, k;
  R.clock += fdt;
  ledTick(fdt);
  V.reactT += fdt;

  /* the LED ribbon and the regulars go to whichever hole is being played */
  if (R.ledHome !== hi) { R.ledHome = hi; R.holes[hi].ledAnchor.add(R.ledMesh); }
  if (R.folkHole !== hi) {
    R.folkHole = hi;
    const at = R.holes[hi].crowdAt;
    R.folk.forEach(function (F, n) { F.root.position.set(ox + at[n][0], -BASE, at[n][1]); F.root.rotation.y = n ? -0.3 : 0.3; });
  }

  /* moving pieces */
  for (i = 0; i < R.holes.length; i++) {
    const o = R.holes[i], show = i === hi || (S.mode === "slide" && i === S.list[S.i - 1]);
    o.grp.visible = show;
    if (!show) continue;
    const ht = i === hi ? t : 99;
    for (k = 0; k < o.sliders.length; k++) {
      const sl = o.sliders[k], r = sliderRect(sl.s, ht);
      sl.mesh.position.x = r.x + r.w / 2 - CX; sl.shadow.position.x = sl.mesh.position.x + 4;
    }
    for (k = 0; k < o.rotors.length; k++) o.rotors[k].grp.rotation.y = -rotorAngle(o.rotors[k].ro, ht);
    for (k = 0; k < o.mills.length; k++) o.mills[k].blades.rotation.z = millAngle(o.mills[k].m, ht);
    if (o.bridge) {
      const a = bridgeAngle(o.bridge.br, ht);
      o.bridge.piv.rotation.x = -a;
    }
    for (k = 0; k < o.bumpers.length; k++) {
      const bu = o.bumpers[k], f = i === hi ? (V.bumpFlash[k] || 0) : 0;
      bu.ring.emissiveIntensity = 0.55 + f * 2.2 + (Shell.reduced ? 0 : 0.15 * Math.sin(R.clock * 4 + k));
      bu.top.position.y = 8.6 - f * 1.6;
      if (f > 0) V.bumpFlash[k] = Math.max(0, f - fdt * 4);
    }
    for (k = 0; k < o.smoke.length; k++) {
      const sm = o.smoke[k], u = ((R.clock * 0.35 + sm.k / 4) % 1);
      sm.s.position.set(sm.cx + Math.sin(u * 5 + sm.k) * 4, sm.y + 4 + u * 50, sm.cz - u * 10);
      sm.s.scale.setScalar(10 + u * 26); sm.s.material.opacity = 0.45 * (1 - u);
    }
    if (o.beam && !Shell.reduced) o.beam.rotation.y = R.clock * 1.2;
    o.flag.position.y = o.cupY + (i === hi ? V.flag * 30 : 0);
  }
  const cd = Math.hypot(h.cup[0] - b.x, h.cup[1] - b.y);
  V.flag += ((cd < 36 || V.sunk ? 1 : 0) - V.flag) * Math.min(1, fdt * 7);
  if (!Shell.reduced) {
    const p = R.flagGeo.attributes.position, base = R.flagBase;
    for (i = 0; i < p.count; i++) { const fx = base[i * 3] - 0.6; p.setZ(i, Math.sin(fx * 0.4 - R.clock * 6.5) * fx * 0.07); }
    p.needsUpdate = true;
    R.tBoost.offset.y = -(R.clock * 1.7) % 1;
    R.tWater.offset.set(Math.sin(R.clock * 0.3) * 0.04, (R.clock * 0.04) % 1);
    R.tSwirl.rotation = -R.clock * 0.6;
    R.tFall.offset.y = (R.clock * 1.6) % 1;
  }

  /* ball */
  const ball = R.ball, bp = R.v2;
  let scale = 1, extra = 0;
  if (S.mode === "script" && S.script && !idle) {
    const sc = S.script, u = clamp(sc.t / sc.dur, 0, 1);
    if (sc.kind === "loop") { loopPoint(h.loops[sc.i], u, QP); bp.set(ox + QP.x - CX, QP.h + BR * 1.12, QP.y - CZ); }
    else { tubePoint(h.tubes[sc.i], u, QP); bp.set(ox + QP.x - CX, QP.h + turfH(h, QP.x, QP.y, t, 0) * (1 - Math.sin(Math.PI * u)), QP.y - CZ); }
    R.qa.setFromAxisAngle(R.axis.set(1, 0, 0), -fdt * 30); R.ballQ.premultiply(R.qa);
    R.lastBall = null;
  } else {
    const dx = b.x - R.bpx, dy = b.y - R.bpy, d = Math.hypot(dx, dy);
    if (R.lastBall === b && d > 1e-4 && d < 40) {
      R.axis.set(dy / d, 0, -dx / d);
      R.qa.setFromAxisAngle(R.axis, d / BR);
      R.ballQ.premultiply(R.qa);
    }
    R.lastBall = b; R.bpx = b.x; R.bpy = b.y;
    if (V.sunk) {
      V.vh -= 900 * fdt; V.h += V.vh * fdt;
      const floor = -(CUP_D - 0.5);
      if (V.h < floor) { V.h = floor; V.vh = V.vh < -70 ? -V.vh * 0.3 : 0; }
    } else if (V.pick > 0) {
      V.pick = Math.min(1, V.pick + fdt * 1.6);
      V.h = V.pick * V.pick * 46; scale = Math.max(0.001, 1 - V.pick * 0.9);
    } else {
      if (S.mode === "slide" && S.slide > 0.3 && !idle) { /* held over the new tee until the camera gets there */ }
      else if (V.h > 0 || V.vh !== 0) {
        V.vh -= 900 * fdt; V.h += V.vh * fdt;
        if (V.h <= 0) { V.h = 0; V.vh = V.vh < -80 ? -V.vh * 0.32 : 0; }
      }
      if (cd < CUP_R && !b.air) extra = -(1 - cd / CUP_R) * 3.2;
      else for (i = 0; i < h.sand.length; i++) if (inRect(b.x, b.y, h.sand[i])) { extra = -1.3; break; }
    }
    bp.set(ox + b.x - CX, b.z + BR * 1.12 + V.h + extra, b.y - CZ);
  }
  const showBall = !(S.mode === "done" && V.pick >= 1);
  ball.visible = showBall;
  ball.position.copy(bp); ball.scale.setScalar(scale); ball.quaternion.copy(R.ballQ);
  const bs = R.ballShadow;
  bs.visible = !R.shadowsOn && showBall && !V.sunk && S.mode !== "script";
  if (bs.visible) {
    const sk = clamp(1 - (V.h + (b.z - turfH(h, b.x, b.y, t, b.z))) / 40, 0.35, 1) * scale;
    bs.position.set(bp.x + 1.5, turfH(h, b.x, b.y, t, b.z) + 0.5, bp.z - 1);
    bs.scale.set(13 * sk, 1, 13 * sk);
  }

  /* the putter behind the ball while you line up, then the stroke */
  const pt = R.putter;
  let back = -1;
  if (state === "playing" && canShoot()) {
    const shot = dragShot();
    if (shot) { back = shot.p; V.puttA = shot.a; }
    else if (S.kb) { back = S.charging ? S.power : 0; V.puttA = S.aim; }
    else { back = 0; V.puttA = S.aim; }
  }
  if (V.putt > 0) { V.putt = Math.max(0, V.putt - fdt * 4.5); back = -0.1 - (1 - V.putt) * 0.25 + V.puttP * V.putt * V.putt; }
  pt.visible = back > -1 && state === "playing" && !Shell.reduced || (V.putt > 0);
  if (pt.visible) {
    const a = V.puttA, off = BR + 3.5 + back * 30;
    pt.position.set(bp.x - Math.cos(a) * off, b.z, bp.z - Math.sin(a) * off);
    pt.rotation.y = -a;
  }

  /* splash rings */
  for (i = 0; i < R.rings.length; i++) {
    const rg = R.rings[i], rp = V.ripples[i];
    if (!rp || rp.t > 0.8) { rg.visible = false; continue; }
    rp.t += fdt;
    const u = rp.t / 0.8;
    rg.visible = true;
    rg.position.set(rp.hole * HOLE_PITCH + rp.x - CX, WATER_Y + 0.6, rp.y - CZ);
    rg.scale.setScalar(3 + u * 12);
    rg.material.opacity = 0.85 * (1 - u);
  }

  /* the regulars */
  const kind = idle ? (state === "over" ? V.react : "wave") : V.react;
  for (i = 0; i < 2; i++) {
    const F = R.folk[i], P = R.pose[i];
    const lx = bp.x - F.root.position.x, lz = bp.z - F.root.position.z;
    const look = Math.atan2(lx, lz) - F.root.rotation.y;
    folkPose(P, i, R.clock, kind, V.reactT, ((look + Math.PI) % TAU + TAU) % TAU - Math.PI);
    applyFolk(R.TV, F, P);
    placeProp(F, P);
    if (F.shadow.visible) F.shadow.position.set(F.root.position.x + 6, -BASE + 0.4, F.root.position.z - 2);
  }

  /* camera: the whole hole while you aim, leaning after the ball as it rolls, in on the cup when it drops,
     over to the regulars for a hole in one, then a flight over the park to the next tee */
  const f = R.fit[hi], gp = R.goalPos, gt2 = R.goalTgt;
  let tx = f.tx, tz = f.tz, dist = f.d, rate = 5.5;
  if (V.crowdCam > 0 && !idle) V.crowdCam = Math.max(0, V.crowdCam - fdt);
  const fx = (R.folk[0].root.position.x + R.folk[1].root.position.x) / 2, fz = R.folk[0].root.position.z;
  if (R.debugCam) {
    gp.fromArray(R.debugCam, 0); gt2.fromArray(R.debugCam, 3); rate = 60;
  } else if (idle) {
    const sway = Shell.reduced ? 0 : Math.sin(idleT * 0.25) * 0.35;
    gt2.set(fx, 30, fz + 40);
    gp.set(fx + Math.sin(sway) * 640, 250, fz + 40 + Math.cos(sway) * 640);
    rate = 2.4;
  } else if (V.crowdCam > 0 && V.crowdCam < 1.9) {
    gt2.set(fx, 20, fz + 10); gp.set(fx, 110, fz + 250); rate = 3.2;
  } else {
    // lean after the ball a little, but keep the hole board (and its LED ribbon) in the picture
    if (S.mode === "roll" || S.mode === "script") { tx += (bp.x - ox - tx) * 0.12; tz += Math.max(0, bp.z - tz) * 0.12; dist *= 0.98; rate = 3.2; }
    else if (S.mode === "done" && V.sunk) { tx += (h.cup[0] - CX - tx) * 0.2; dist *= 0.95; rate = 2.4; }
    gt2.set(ox + tx, 0, tz); gp.set(ox + tx, dist * R.sinP, tz + dist * R.cosP);
  }
  if (V.snap || !R.camReady) {
    R.camPos.copy(gp); R.camTgt.copy(gt2); V.snap = false; R.camReady = true;
  } else if (S.mode === "slide" && V.from && !idle) {
    const e = clamp(1 - S.slide, 0, 1), ke = e * e * (3 - 2 * e), arc = Math.sin(Math.PI * ke);
    R.camPos.lerpVectors(V.from.pos, gp, ke); R.camTgt.lerpVectors(V.from.tgt, gt2, ke);
    if (!Shell.reduced) { R.camPos.y += arc * 90; R.camPos.z += arc * 70; }
  } else {
    const kk = 1 - Math.exp(-rate * fdt);
    R.camPos.lerp(gp, kk); R.camTgt.lerp(gt2, kk);
  }
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (Math.random() * 2 - 1) * m; sy = (Math.random() * 2 - 1) * m;
  }
  R.camera.position.set(R.camPos.x + sx, R.camPos.y + sy, R.camPos.z);
  R.camera.lookAt(R.camTgt.x + sx, R.camTgt.y + sy, R.camTgt.z);
  R.camera.updateMatrixWorld();

  /* the sun rides along with the hole on screen */
  const lx = S.mode === "slide" ? R.camTgt.x : ox;
  R.key.position.set(lx - 400, 300, 220); R.key.target.position.set(lx, 0, -40);
  R.key.target.updateMatrixWorld();
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
function powerColor(p) { return p < 0.45 ? "#3ff0ff" : p < 0.8 ? "#ffd23f" : "#ff3f6a"; }

function drawAim(c) {
  const b = S.ball, shot = dragShot();
  let a, p;
  if (shot) { a = shot.a; p = shot.p; }
  else if (S.kb && canShoot()) { a = S.aim; p = S.charging ? S.power : 0; }
  else {
    if (canShoot() && !Shell.reduced) {                         // a soft ring so the ball is easy to find
      const s0 = courseToScreen(b.x, b.y, b.z), s1 = courseToScreen(b.x + BR, b.y, b.z), rr = Math.abs(s1.x - s0.x);
      const u = (S.t * 0.9) % 1;
      c.lineWidth = 1.5; c.strokeStyle = "rgba(255,255,255," + (0.8 * (1 - u)).toFixed(3) + ")";
      c.beginPath(); c.ellipse(s0.x, s0.y, rr * (1.6 + u * 1.7), rr * (1.6 + u * 1.7) * R.sinP, 0, 0, TAU); c.stroke();
      txt(c, "DRAG BACK TO PUTT", W / 2, H - 22, 10, "rgba(255,255,255,.85)", "center", "#1a0f4a");
    }
    return;
  }
  const dx = Math.cos(a), dy = Math.sin(a), hz = b.z + 0.5, s0 = courseToScreen(b.x, b.y, hz);
  if (shot) {
    const s1 = courseToScreen(b.x - dx * p * 60, b.y - dy * p * 60, hz);
    c.lineCap = "round";
    c.lineWidth = 4; c.strokeStyle = "rgba(26,15,74,.55)"; c.beginPath(); c.moveTo(s0.x, s0.y); c.lineTo(s1.x, s1.y); c.stroke();
    c.lineWidth = 2; c.strokeStyle = "rgba(255,255,255,.85)"; c.beginPath(); c.moveTo(s0.x, s0.y); c.lineTo(s1.x, s1.y); c.stroke();
  }
  const len = 26 + p * 140, col = powerColor(p), px1 = courseToScreen(b.x + 1, b.y, hz);
  const un = Math.max(0.5, Math.abs(px1.x - s0.x));
  for (let d = 10; d < len; d += 8) {
    const q = courseToScreen(b.x + dx * d, b.y + dy * d, hz), last = d + 8 >= len, r = (last ? 2.6 : 1.9) * un;
    c.fillStyle = "rgba(26,15,74,.6)"; c.beginPath(); c.arc(q.x, q.y, r + 1, 0, TAU); c.fill();
    c.fillStyle = last ? col : "#ffffff"; c.beginPath(); c.arc(q.x, q.y, r, 0, TAU); c.fill();
  }
  const e = courseToScreen(b.x + dx * len, b.y + dy * len, hz);
  c.fillStyle = "#1a0f4a"; c.beginPath(); c.arc(e.x, e.y, 4.4 * un, 0, TAU); c.fill();
  c.fillStyle = col; c.beginPath(); c.arc(e.x, e.y, 3.2 * un, 0, TAU); c.fill();
}
function drawPower(c) {
  const shot = dragShot();
  const p = shot ? shot.p : (S.charging ? S.power : -1);
  if (p < 0) return;
  const x = 12, top = 350, hgt = 150, pc = clamp(p, 0, 1);
  rrect(c, x - 3, top - 3, 20, hgt + 6, 6); c.fillStyle = "rgba(26,15,74,.85)"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = "#ffffff"; c.stroke();
  c.save(); rrect(c, x, top, 14, hgt, 4); c.clip();
  const gr = c.createLinearGradient(0, top + hgt, 0, top);
  gr.addColorStop(0, "#3ff0ff"); gr.addColorStop(0.5, "#ffd23f"); gr.addColorStop(1, "#ff3f6a");
  c.fillStyle = "#2a1a6a"; c.fillRect(x, top, 14, hgt);
  c.fillStyle = gr; c.fillRect(x, top + hgt * (1 - pc), 14, hgt * pc);
  c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(x + 2, top, 3, hgt);
  c.restore();
  txt(c, Math.round(pc * 100) + "%", x + 7, top + hgt + 6, 9, "#ffffff", "center", "#1a0f4a");
}
function drawHUD(c, state) {
  const h = curHole();
  const bg = c.createLinearGradient(0, 0, 0, 74);
  bg.addColorStop(0, "#7a3ab8"); bg.addColorStop(0.55, "#4a1fa0"); bg.addColorStop(1, "#2a1068");
  c.fillStyle = bg; c.fillRect(0, 0, W, 74);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff3fa4"; c.fillRect(0, 74, W, 2);
  c.fillStyle = "#ffd23f"; c.fillRect(0, 76, W, 1);
  // the card for the nine being played: one box a hole
  const n0 = S.i < 9 ? 0 : 9, nine = S.list.slice(n0, n0 + 9);
  let x = 4;
  for (let i = 0; i < nine.length; i++) {
    const hi = nine[i], w = 30, cur = hi === S.hole && state !== "over", s = S.card[hi];
    rrect(c, x, 4, w - 1, 38, 3);
    c.fillStyle = cur ? "#fff3a8" : "#ffffff"; c.fill();
    c.lineWidth = cur ? 2 : 1; c.strokeStyle = cur ? "#ff3fa4" : "#2a1068"; c.stroke();
    txt(c, String(hi + 1), x + 3, 6, 7, "#8a6ac4");
    txt(c, "P" + HOLES[hi].par, x + w - 4, 6, 7, "#8a6ac4", "right");
    if (s != null) {
      const d = s - HOLES[hi].par;
      txt(c, String(s), x + w / 2 - 0.5, 19, 15, s === 1 ? "#d48a00" : d < 0 ? "#0a8f2f" : d === 0 ? "#2a1068" : "#e3231a", "center");
    } else if (cur && S.strokes > 0) txt(c, String(S.strokes), x + w / 2 - 0.5, 19, 15, "#a99cc8", "center");
    x += w + 1;
  }
  const p = playedRel();
  rrect(c, x, 4, W - 4 - x, 38, 3); c.fillStyle = "#1a0f4a"; c.fill();
  c.lineWidth = 1; c.strokeStyle = "#ffd23f"; c.stroke();
  txt(c, "TOTAL", x + (W - 4 - x) / 2, 7, 8, "#b4fff4", "center");
  txt(c, fmt(p.rel), x + (W - 4 - x) / 2, 19, 17, p.rel <= 0 ? "#b6ff4a" : "#ffc1e0", "center");
  txt(c, "HOLE " + (S.hole + 1) + "   PAR " + h.par + (S.list.length < 18 ? "   " + (n0 === 0 && S.list[0] === 0 ? "FRONT 9" : "BACK 9") : ""), 8, 46, 10, "#ffffff", "left", "#1a0f4a");
  txt(c, h.name, 8, 59, 10, "#ffd23f", "left", "#1a0f4a");
  txt(c, "STROKE " + S.strokes + "/" + MAX_STROKES, W - 8, 46, 10, "#ffffff", "right", "#1a0f4a");
  const hb = bests[S.hole];
  txt(c, "HOLE BEST " + (hb == null ? "-" : hb), W - 8, 59, 10, "#b4fff4", "right", "#1a0f4a");
}

function draw(c, state) {
  Juke.pump();
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
  if (state === "playing" && S.mode === "aim") drawAim(c);
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    c.globalAlpha = clamp(q.life * 2.5, 0, 1);
    c.fillStyle = q.c;
    if (q.kind) { c.beginPath(); c.arc(q.x, q.y, q.w, 0, TAU); c.fill(); }
    else { c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.fillRect(-q.w, -q.w * 0.6, q.w * 2, q.w * 1.2); c.restore(); }
  }
  c.globalAlpha = 1;
  if (state === "playing") drawHUD(c, state);
  if (state === "playing" && S.mode === "aim") drawPower(c);
}

/* ---------------- Splash, boot, shell hookup ---------------- */
const COVER = /[?&]cover=1/.test(location.search);
function makeSplash() {
  const el = document.createElement("div");
  el.id = "npg-splash";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Nostalgia Pro Games");
  el.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;z-index:9999;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;gap:18px;padding:24px;box-sizing:border-box;text-align:center;" +
    "background:radial-gradient(circle at 50% 40%,#7a3ab8 0%,#3a1a8a 50%,#120a33 100%);" +
    "font:bold 15px/1.5 " + HUD_FONT.replace(/"/g, "'") + ";color:#ffffff;opacity:1;transition:opacity .35s ease";
  const img = document.createElement("img");
  img.alt = ""; img.decoding = "async";
  img.style.cssText = "display:block;width:min(66vw,44vh,340px);height:auto;opacity:0;transform:scale(.86);" +
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "transition:opacity .2s ease" : "transition:opacity .28s ease,transform .55s cubic-bezier(.2,1.5,.4,1)");
  el.appendChild(img);
  const cap = document.createElement("div");
  cap.textContent = "Loading the course...";
  cap.style.cssText = "font-size:13px;letter-spacing:.12em;color:#ffd23f;text-transform:uppercase";
  el.appendChild(cap);
  document.body.appendChild(el);
  return { el: el, img: img, cap: cap };
}
function splashFail(splash, lines) {
  const el = splash.el;
  splash.img.style.width = "min(40vw,26vh,180px)";
  splash.cap.textContent = "";
  el.setAttribute("role", "alert"); el.removeAttribute("aria-label");
  const p = document.createElement("p"); p.style.cssText = "margin:0;max-width:30em"; p.textContent = lines;
  const a = document.createElement("a"); a.href = "../"; a.textContent = "Back to the arcade"; a.style.cssText = "color:#ffd23f";
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
  if (getComputedStyle(hud).position === "static") hud.style.position = "relative";
  const crt = stage.querySelector(".np-crt");
  if (crt) crt.style.display = "none";
  R.lastT = performance.now();
  layout();
}
function logoImg(px) {
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
  im.style.cssText = "display:block;width:" + px + ";height:auto;margin:0 auto 6px";
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_URL;
  return im;
}
// Front nine, back nine or all 18: three buttons on the title card. The choice is remembered.
function modePicker(card, before) {
  const row = document.createElement("div");
  row.setAttribute("role", "group"); row.setAttribute("aria-label", "Choose a course");
  row.style.cssText = "display:flex;gap:6px;margin:8px 0;width:100%";
  const btns = [];
  function paint() {
    const cur = loadMode();
    btns.forEach(function (b) {
      const on = b.getAttribute("data-mode") === cur;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.style.outline = on ? "3px solid #ffd23f" : "none";
      b.style.opacity = on ? "1" : "0.72";
    });
  }
  ["front", "back", "all"].forEach(function (m) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-btn"; b.setAttribute("data-mode", m);
    b.style.cssText = "flex:1 1 0;min-width:0;padding-left:4px;padding-right:4px";
    b.innerHTML = MODES[m].label + '<br><small style="font-size:.72em;opacity:.85">PAR ' + parOf(MODES[m].list) + "</small>";
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      store("npArcade." + SLUG + ".mode", m); paint();
      if (Shell.state() === "title") { reset(); R.folkHole = -1; R.ledHome = -1; }
    });
    row.appendChild(b); btns.push(b);
  });
  card.insertBefore(row, before || null);
  paint();
}
function startGame() {
  Shell.init({
    slug: SLUG,
    title: "NOSTALGIA PRO MINI GOLF CLASSIC",
    accent: "#ff3fa4",
    width: W, height: H,
    lowerIsBetter: true,
    format: fmt,
    howTo: "An 18-hole miniature-golf course in real 3D: windmills, ramps, a loop-de-loop, tubes, a volcano and a castle moat. Drag back from anywhere and let go to putt. Low score wins.",
    keys: "Keys: arrows aim, hold Space to charge, release to putt. P pause, M mute, N music, R restart.",
    tip: "Max 6 strokes a hole. Water costs you one.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { if (paused) return; idleT += dt; S.t += dt; S.holeT += dt; updateParts(dt); },
    onPause: function () { paused = true; keys = {}; S.drag = null; S.charging = false; },
    onResume: function () { paused = false; }
  });
  attach();
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Juke.unlock, true); });
  Shell.onStart(Juke.newGame); Shell.onRestart(Juke.newGame); Shell.onResume(Juke.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Juke.toggle();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) {
    titleCard.insertBefore(logoImg("clamp(84px,17vh,132px)"), titleCard.firstChild);
    modePicker(titleCard, titleCard.querySelector(".np-btn.np-primary"));
    Juke.button(titleCard, titleCard.querySelector(".np-tip"));
  }
  if (pauseActions) Juke.button(pauseActions, pauseActions.querySelector("a"));
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) card.insertBefore(logoImg("clamp(64px,14vh,104px)"), card.firstChild);
  const t = document.querySelector(".np-title");                 // a long name: shrink the top bar title rather than clip it
  if (t) for (let k = 0; k < 6 && t.scrollWidth > t.clientWidth + 1; k++) t.style.fontSize = (parseFloat(getComputedStyle(t).fontSize) * 0.88) + "px";
  // the regulars react to how the round went
  Shell.onRestart(function () { R.folkHole = -1; R.ledHome = -1; });
  Shell.onStart(function () { R.folkHole = -1; R.ledHome = -1; });
}

/* ---------------- Cover render: index.html?cover=1 paints the 360 x 480 cover from the game's own scene ---------------- */
function renderCover(logo) {
  window.Shell = window.Shell || { reduced: false };
  if (!("reduced" in Shell)) Shell.reduced = false;
  const CW = 360, CH = 480, SS = 3;
  S.list = MODES.all.list; S.i = 3; S.hole = 3;
  const h = HOLES[3], ox = 3 * HOLE_PITCH;
  S.ball = newBall(180, 418, 0); S.mode = "aim"; S.holeT = 2.35; S.rest = 1; S.drag = null; S.kb = false;
  R.holes.forEach(function (o, i) { o.grp.visible = i === 3; });
  R.holes[3].ledAnchor.add(R.ledMesh); R.ledHome = 3; R.folkHole = 3;
  LED.msg = null; LED.pos = -1; ledTick(0);
  for (let i = 0; i < 60; i++) ledTick(0.05);
  // the course pro lines up a putt; the scorekeeper cheers him on
  const dale = R.folk[0], rita = R.folk[1];
  dale.root.position.set(ox + 150 - CX, 0, 410 - CZ); dale.root.rotation.y = Math.PI / 2 - 0.15;
  rita.root.position.set(ox + 222 - CX, 0, 372 - CZ); rita.root.rotation.y = 0.35;
  const P0 = R.pose[0], P1 = R.pose[1];
  folkPose(P0, 0, 0.6, "idle", 0, 0.1);
  P0.hy = FOLK.hipY - 0.32; P0.lean = 0.42; P0.headPitch = 0.38; P0.headYaw = -0.15;
  set3(P0.foot[0], 0.52, 0, 0.1); set3(P0.foot[1], -0.52, 0, 0.1);
  set3(P0.hand[0], 0.06, 2.7, 1.12); set3(P0.hand[1], -0.04, 2.48, 1.16); set3(P0.propDir, 0.02, -1, 0.42); P0.propHand = 1;
  set3(P0.palm[0], -1, 0, 0.1); set3(P0.palm[1], 1, 0, 0.1);
  applyFolk(R.TV, dale, P0); placeProp(dale, P0);
  folkPose(P1, 1, 0.9, "cheer", 0.6, 0.3); applyFolk(R.TV, rita, P1); placeProp(rita, P1);
  R.putter.visible = false;
  const b = R.ball; b.position.set(ox + 180 - CX, BR * 1.12, 418 - CZ); b.visible = true;
  b.quaternion.setFromAxisAngle(R.axis.set(0, 1, 0), -0.6);
  for (let i = 0; i < R.holes[3].mills.length; i++) R.holes[3].mills[i].blades.rotation.z = 0.5;
  R.flagGeo.attributes.position.needsUpdate = true;
  R.camera.aspect = CW / CH; R.camera.fov = 40; R.camera.updateProjectionMatrix();
  R.camera.position.set(ox + 258 - CX, 94, 572 - CZ); R.camera.lookAt(ox + 174 - CX, 24, 368 - CZ); R.camera.updateMatrixWorld();
  R.key.position.set(ox - 300, 300, 360); R.key.target.position.set(ox, 0, 0); R.key.target.updateMatrixWorld();
  R.renderer.setPixelRatio(1); R.renderer.setSize(CW * SS, CH * SS, false);
  R.renderer.render(R.scene, R.camera);
  const out = mkCanvas(CW, CH), g = out.getContext("2d");
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(R.gl, 0, 0, CW, CH);
  // the logo up top, the name along the bottom
  const top = g.createLinearGradient(0, 0, 0, 150); top.addColorStop(0, "rgba(26,15,74,.75)"); top.addColorStop(1, "rgba(26,15,74,0)");
  g.fillStyle = top; g.fillRect(0, 0, CW, 150);
  if (logo) { const lw = 128, lh = lw * logo.naturalHeight / logo.naturalWidth; g.drawImage(logo, (CW - lw) / 2, 8, lw, lh); }
  const bot = g.createLinearGradient(0, CH - 140, 0, CH); bot.addColorStop(0, "rgba(26,15,74,0)"); bot.addColorStop(0.45, "rgba(26,15,74,.82)"); bot.addColorStop(1, "rgba(18,8,52,.96)");
  g.fillStyle = bot; g.fillRect(0, CH - 140, CW, 140);
  candyText(g, "NOSTALGIA PRO", CW / 2, CH - 84, 26, 300, [["0", "#b4fff4"], ["0.5", "#3ff0ff"], ["1", "#1aa8ff"]]);
  candyText(g, "MINI GOLF CLASSIC", CW / 2, CH - 46, 38, 336);
  g.font = "bold 11px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#ffd23f";
  g.fillText("18 HOLES  •  FREE AT THENOSTALGIAPRO.COM", CW / 2, CH - 16);
  const url = out.toDataURL("image/png");
  window.__cover = url;
  document.body.innerHTML = "";
  document.body.style.cssText = "margin:0;background:#120a33;display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px;font:14px " + HUD_FONT + ";color:#fff";
  const im = new Image(); im.src = url; im.width = CW; im.height = CH; im.alt = GAME_NAME + " cover"; im.id = "cover";
  const a = document.createElement("a"); a.href = url; a.download = "mini-golf-classic.png"; a.textContent = "Download mini-golf-classic.png (360 x 480)"; a.style.color = "#ffd23f";
  document.body.appendChild(im); document.body.appendChild(a);
}

// Hook for automated checks (no effect on play)
window.__mgc = { S: function () { return S; }, HOLES: HOLES, advance: advance, newBall: newBall, groundAt: groundAt, turfH: turfH, shoot: shoot,
                 V_MIN: V_MIN, V_MAX: V_MAX, gfx: function () { return R; }, view: function () { return V; }, led: function () { return LED; }, juke: Juke,
                 toScreen: courseToScreen, toCourse: screenToCourse, loopPoint: loopPoint, tubePoint: tubePoint,
                 go: function (i) { const k = S.list.indexOf(i); if (k >= 0) { setupHole(k); V.snap = true; R.folkHole = -1; } },
                 update: function (dt) { update(dt); }, react: react, cam: function (a) { R.debugCam = a; R.camReady = false; }, finish: function () { endRound(); } };

(function boot() {
  const splash = makeSplash();
  const t0 = performance.now();
  const q = /[?&]gfx=(high|low)/.exec(location.search);
  Promise.all([loadLogo(splash), import(THREE_URL).then(null, function (e) { e.npStage = "three"; throw e; }), loadImage(SCRIPT_URL)])
    .then(function (res) {
      THREE = res[1];
      if (COVER) { window.Shell = window.Shell || {}; }
      try { R = buildScene(THREE, res[2]); } catch (e) { e.npStage = "webgl"; throw e; }
      if (COVER) { S = { list: MODES.all.list, i: 0, hole: 0, card: [], holeT: 0, t: 0, mode: "aim" }; renderCover(res[0]); return "cover"; }
      if (q) { R.qLock = true; setQuality(q[1] === "low" ? QUALITY.length - 1 : 0); }
      reset();
      try { syncScene("title", 0); R.renderer.compile(R.scene, R.camera); } catch (e) { /* warm-up only */ }
      const hold = Math.max(0, 1300 - (performance.now() - t0));
      return new Promise(function (r) { setTimeout(r, hold); });
    })
    .then(function (how) {
      if (how === "cover") return;
      startGame();
      splash.el.style.opacity = "0";
      splash.el.style.pointerEvents = "none";
      setTimeout(function () { if (splash.el.parentNode) splash.el.parentNode.removeChild(splash.el); }, 420);
    })
    .catch(function (e) {
      console.error(e);
      splashFail(splash, e && e.npStage === "three"
        ? "Mini Golf Classic could not load its 3D engine (" + THREE_URL + ")."
        : "Mini Golf Classic needs WebGL for its 3D course, and this browser has it switched off or does not support it.");
    });
})();
