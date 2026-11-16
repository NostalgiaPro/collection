/* SHELF LINKS (3D): nine holes of mini golf built from game boxes, shelves and tape decks.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of input, scaling and the title / pause / game over flow, and carries the HUD.

   The nine holes, the rules, the scoring, the controls and the ball physics are the 2D game's,
   unchanged: the course is still laid out in the same 360 x 540 units and the ball is still
   stepped by the same code. Only the picture is new. A course point (x, y) of hole i sits in
   three.js space at (i * HOLE_PITCH + x - 180, height, y - 300): the holes stand side by side
   on the carpet and the camera flies from one to the next. */

const W = 360, H = 540, TAU = Math.PI * 2;
const BR = 5, CUP_R = 9, MAX_STROKES = 6, MAX_PULL = 110;   // BR = ball radius
const V_MIN = 30, V_MAX = 640, STOP = 4;
const FR_C = 120, FR_K = 0.9;          // felt friction: constant + proportional
const SAND_C = 520, SAND_K = 3.2;      // packing peanuts
const BOOST = 1100, BOUNCE = 0.74;

const HOLE_PITCH = 460;                // center to center of neighboring holes
const CX = 180, CZ = 300;              // course point that sits on a hole's origin
const RAIL_H = 10, BASE = 12, CUP_D = 11;                 // rail height above the felt, felt above the carpet, cup depth
const BOX_H = 17, CART_H = 12, BLADE_H = 8;
const CAM_FOV = 30, CAM_PITCH = 52 * Math.PI / 180;
const HUD_H = 77, SLIDE_T = 0.9;
const SAFE = { x1: 10, x2: W - 10, y1: HUD_H + 8, y2: H - 10 };   // where a whole hole has to fit on screen

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash and score card only
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every decal on the course
const THREE_URL = "../shared/three.module.min.js";
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';
const BOX_COLS = ["#ff4b3e", "#16b9e8", "#ff3fa4", "#58c322", "#ffb81f", "#8a5cff"];

/* ---------------- Course ---------------- */
function rc(x1, y1, x2, y2) { return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; }
function frame(x1, y1, x2, y2) {
  const t = 10;
  return [rc(x1 - t, y1 - t, x2 + t, y1), rc(x1 - t, y2, x2 + t, y2 + t), rc(x1 - t, y1, x1, y2), rc(x2, y1, x2 + t, y2)];
}
function hole(o) {
  const d = { floor: [], walls: [], boxes: [], carts: [], gates: [], sand: [], water: [], boosts: [], sliders: [], rotors: [] };
  for (const k in o) d[k] = o[k];
  return d;
}

const HOLES = [
  hole({ name: "The Bargain Bin", par: 2, tee: [180, 470], cup: [180, 125],
    floor: [rc(120, 80, 240, 510)], walls: frame(120, 80, 240, 510) }),

  hole({ name: "Rewind Alley", par: 3, tee: [100, 440], cup: [262, 128],
    floor: [rc(50, 340, 310, 510), rc(210, 80, 310, 340)],
    walls: [rc(40, 340, 50, 520), rc(40, 510, 320, 520), rc(310, 70, 320, 520), rc(200, 70, 320, 80),
            rc(200, 70, 210, 340), rc(40, 330, 210, 340)] }),

  hole({ name: "Packing Peanut Pit", par: 3, tee: [180, 470], cup: [180, 120],
    floor: [rc(70, 80, 290, 510)], walls: frame(70, 80, 290, 510),
    sand: [rc(100, 270, 260, 330)], boxes: [rc(152, 188, 208, 214)] }),

  hole({ name: "Coin Slot Squeeze", par: 3, tee: [180, 470], cup: [180, 130],
    floor: [rc(100, 80, 260, 510)], walls: frame(100, 80, 260, 510),
    boxes: [rc(100, 290, 152, 312), rc(208, 290, 260, 312)],
    rotors: [{ x: 180, y: 301, len: 30, n: 3, speed: 1.7 }] }),

  hole({ name: "Sealed Copy Canyon", par: 3, tee: [180, 482], cup: [180, 118],
    floor: [rc(70, 80, 290, 510)], walls: frame(70, 80, 290, 510),
    sliders: [{ w: 90, h: 22, y: 360, x1: 70, x2: 200, speed: 1.3, phase: 0 },
              { w: 90, h: 22, y: 222, x1: 70, x2: 200, speed: 1.8, phase: 2.2 }] }),

  hole({ name: "Soda Spill Crossing", par: 3, tee: [180, 470], cup: [262, 128],
    floor: [rc(50, 80, 310, 510)], walls: frame(50, 80, 310, 510),
    water: [rc(50, 262, 92, 328), rc(140, 262, 310, 328)],
    boosts: [{ r: rc(96, 268, 136, 322), dx: 0, dy: -1 }],
    boxes: [rc(196, 172, 236, 200)] }),

  hole({ name: "The Cart Gate", par: 3, tee: [180, 470], cup: [180, 116],
    floor: [rc(60, 80, 300, 510)], walls: frame(60, 80, 300, 510),
    carts: [rc(60, 270, 110, 290), rc(150, 270, 210, 290), rc(250, 270, 300, 290)],
    gates: [{ r: rc(110, 272, 150, 288), dx: 0, dy: -1 }, { r: rc(210, 272, 250, 288), dx: 0, dy: -1 }],
    boxes: [rc(148, 156, 212, 178)],
    boosts: [{ r: rc(112, 330, 148, 384), dx: 0, dy: -1 }] }),

  hole({ name: "Swap Meet Shuffle", par: 4, tee: [80, 462], cup: [272, 124],
    floor: [rc(40, 80, 320, 510)], walls: frame(40, 80, 320, 510).concat([rc(40, 380, 250, 396), rc(110, 230, 320, 246)]),
    sliders: [{ w: 64, h: 20, y: 302, x1: 40, x2: 256, speed: 1.1, phase: 1 }],
    sand: [rc(200, 160, 320, 200)] }),

  hole({ name: "Mint Condition Gauntlet", par: 4, tee: [180, 492], cup: [180, 112],
    floor: [rc(70, 80, 290, 510)], walls: frame(70, 80, 290, 510),
    sliders: [{ w: 76, h: 20, y: 436, x1: 70, x2: 214, speed: 1.5, phase: 0.5 }],
    water: [rc(70, 350, 140, 392), rc(220, 350, 290, 392)],
    boxes: [rc(70, 252, 152, 272), rc(208, 252, 290, 272)],
    rotors: [{ x: 180, y: 262, len: 30, n: 3, speed: -1.9 }],
    carts: [rc(70, 168, 150, 184), rc(210, 168, 290, 184)],
    gates: [{ r: rc(150, 170, 210, 182), dx: 0, dy: -1 }] })
];
const TOTAL_PAR = HOLES.reduce(function (s, h) { return s + h.par; }, 0);

// Where the wordmark is printed on each green (center x, center y, width), clear of the moving pieces.
const FELT_MARKS = [[180, 300, 92], [205, 428, 130], [180, 402, 140], [180, 402, 118], [180, 292, 140],
                    [180, 404, 150], [222, 428, 120], [226, 452, 120], [180, 312, 104]];

/* ---------------- Physics (the 2D game's, untouched) ---------------- */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function inRect(x, y, r, pad) { pad = pad || 0; return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad; }

function sliderRect(s, t) {
  const u = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
  const x = s.x1 + (s.x2 - s.x1) * u;
  const vx = (s.x2 - s.x1) * 0.5 * Math.cos(t * s.speed + s.phase) * s.speed;
  return { x: x, y: s.y, w: s.w, h: s.h, vx: vx, vy: 0 };
}
function rotorAngle(r, t) { return t * r.speed; }

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
  } else {
    const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = BR - d;
  }
  return resolve(b, nx, ny, pen, vx || 0, vy || 0);
}
function hitSeg(b, ax, ay, bx, by, th, vfn) {
  const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
  const u = l2 ? clamp(((b.x - ax) * ex + (b.y - ay) * ey) / l2, 0, 1) : 0;
  const px = ax + ex * u, py = ay + ey * u;
  const dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy, rr = BR + th;
  if (d2 >= rr * rr) return 0;
  const d = Math.sqrt(d2) || 1e-4, nx = dx / d, ny = dy / d;
  const v = vfn ? vfn(px, py) : [0, 0];
  return resolve(b, nx, ny, rr - d, v[0], v[1]);
}
function hitCircle(b, cx, cy, cr) {
  const dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy, rr = BR + cr;
  if (d2 >= rr * rr) return 0;
  const d = Math.sqrt(d2) || 1e-4;
  return resolve(b, dx / d, dy / d, rr - d, 0, 0);
}
function resolve(b, nx, ny, pen, vx, vy) {
  b.x += nx * pen; b.y += ny * pen;
  const rvx = b.vx - vx, rvy = b.vy - vy, vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    b.vx -= (1 + BOUNCE) * vn * nx; b.vy -= (1 + BOUNCE) * vn * ny;
    // a moving obstacle can never leave the ball slower than itself along the normal
    const push = vx * nx + vy * ny, now = b.vx * nx + b.vy * ny;
    if (push > 0 && now < push) { b.vx += (push - now) * nx; b.vy += (push - now) * ny; }
    return -vn;
  }
  return 0.001;
}

// One physics step. Returns an event string or "" ("water", "sunk").
function step(h, b, t, dt) {
  let sp = Math.hypot(b.vx, b.vy), i, r;
  let c = FR_C, k = FR_K, ax = 0, ay = 0;
  for (i = 0; i < h.sand.length; i++) if (inRect(b.x, b.y, h.sand[i])) { c = SAND_C; k = SAND_K; b.sanded = true; break; }
  for (i = 0; i < h.boosts.length; i++) {
    const bo = h.boosts[i];
    if (inRect(b.x, b.y, bo.r)) { ax += bo.dx * BOOST; ay += bo.dy * BOOST; c = 40; k = 0.3; b.boosted = true; }
  }
  if (sp > 0) {
    const dec = (c + k * sp) * dt, ns = Math.max(0, sp - dec);
    b.vx *= ns / sp; b.vy *= ns / sp;
  }
  b.vx += ax * dt; b.vy += ay * dt;
  sp = Math.hypot(b.vx, b.vy);
  if (sp > V_MAX * 1.15) { b.vx *= V_MAX * 1.15 / sp; b.vy *= V_MAX * 1.15 / sp; }
  b.x += b.vx * dt; b.y += b.vy * dt;

  let imp = 0;
  const solids = [h.walls, h.boxes, h.carts];
  for (let s = 0; s < solids.length; s++) for (i = 0; i < solids[s].length; i++) imp = Math.max(imp, hitRect(b, solids[s][i]));
  for (i = 0; i < h.sliders.length; i++) {
    r = sliderRect(h.sliders[i], t);
    imp = Math.max(imp, hitRect(b, r, r.vx, 0));
  }
  for (i = 0; i < h.gates.length; i++) {
    const g = h.gates[i];
    if (b.vx * g.dx + b.vy * g.dy < 0) imp = Math.max(imp, hitRect(b, g.r));
  }
  for (i = 0; i < h.rotors.length; i++) {
    const ro = h.rotors[i], a0 = rotorAngle(ro, t);
    imp = Math.max(imp, hitCircle(b, ro.x, ro.y, 6));
    for (let n = 0; n < ro.n; n++) {
      const a = a0 + n * TAU / ro.n;
      imp = Math.max(imp, hitSeg(b, ro.x, ro.y, ro.x + Math.cos(a) * ro.len, ro.y + Math.sin(a) * ro.len, 3,
        function (px, py) { return [-ro.speed * (py - ro.y), ro.speed * (px - ro.x)]; }));
    }
  }
  // walls win over moving pieces: one more pass so nothing pushes the ball through a wall
  for (i = 0; i < h.walls.length; i++) hitRect(b, h.walls[i]);
  if (imp > 0.01) b.impact = Math.max(b.impact || 0, imp);

  for (i = 0; i < h.water.length; i++) {
    if (inRect(b.x, b.y, h.water[i]) && !onBoost(h, b)) return "water";
  }
  const cdx = h.cup[0] - b.x, cdy = h.cup[1] - b.y, cd = Math.hypot(cdx, cdy);
  if (cd < CUP_R) {
    b.vx += cdx / (cd || 1) * 2600 * dt * (1 - cd / CUP_R);
    b.vy += cdy / (cd || 1) * 2600 * dt * (1 - cd / CUP_R);
    if (Math.hypot(b.vx, b.vy) < 300 && cd < CUP_R - 2) return "sunk";
  }
  return "";
}
function onBoost(h, b) {
  for (let i = 0; i < h.boosts.length; i++) if (inRect(b.x, b.y, h.boosts[i].r)) return true;
  return false;
}
function onCourse(h, b) {
  for (let i = 0; i < h.floor.length; i++) if (inRect(b.x, b.y, h.floor[i], 1)) return true;
  return false;
}
// Advance the ball over dt with substeps sized to its speed.
function advance(h, b, t, dt) {
  const sp = Math.hypot(b.vx, b.vy);
  const n = clamp(Math.ceil(sp * dt / 2), 2, 40), sdt = dt / n;
  let ev = "";
  for (let i = 0; i < n && !ev; i++) ev = step(h, b, t + sdt * i, sdt);
  if (!ev && !onCourse(h, b)) ev = "lost";
  return ev;
}

/* ---------------- Game state ---------------- */
let S = {}, keys = {}, parts = [], idleT = 0, paused = false;
let bests = [];
let THREE = null, R = null;                              // R holds everything the renderer owns
// V is how the ball and camera are being shown (hops, the drop into the cup, the fly to the next hole).
// It never feeds back into the rules.
let V = { h: 0, vh: 0, sunk: false, pick: 0, flag: 0, snap: true, from: null, ripples: [], sandT: 0 };

function loadBests() {
  try { const a = JSON.parse(window.Shell ? Shell.load("holes") || "[]" : "[]"); if (Array.isArray(a)) return a; } catch (e) { /* ignore */ }
  return [];
}

function reset() {
  paused = false;
  S = { hole: 0, splashes: 0, strokes: 0, card: [], mode: "aim", t: 0, holeT: 0, timer: 0, slide: 0,
        ball: null, last: null, drag: null, aim: 0, power: 0, charging: false, chargeT: 0, kb: false,
        rest: 0, sinkT: 0, msgShown: false };
  parts.length = 0;
  V.snap = true; V.from = null; V.ripples.length = 0; V.flag = 0;
  bests = loadBests();
  setupHole(0);
}
function setupHole(i) {
  const h = HOLES[i];
  S.hole = i; S.strokes = 0; S.holeT = 0; S.mode = "aim"; S.rest = 1;
  S.ball = { x: h.tee[0], y: h.tee[1], vx: 0, vy: 0, z: 1 };
  S.last = { x: h.tee[0], y: h.tee[1] };
  V.h = 0; V.vh = 0; V.sunk = false; V.pick = 0;
  aimAtCup();
}
function aimAtCup() {
  const h = HOLES[S.hole];
  S.aim = Math.atan2(h.cup[1] - S.ball.y, h.cup[0] - S.ball.x);
}
function canShoot() { return S.mode === "aim" && S.rest > 0.12; }

function shoot(angle, power) {
  if (!canShoot() || power < 0.04) return;
  const v = V_MIN + power * (V_MAX - V_MIN);
  S.last = { x: S.ball.x, y: S.ball.y };
  S.ball.vx = Math.cos(angle) * v;
  S.ball.vy = Math.sin(angle) * v;
  S.strokes++;
  S.mode = "roll";
  S.rest = 0;
  Shell.sfx("hit");
  Juke.sfx("putt", power);
}

function relLabel(d, strokes) {
  if (strokes === 1) return "ACE!";
  if (d <= -3) return "ALBATROSS!";
  if (d === -2) return "EAGLE!";
  if (d === -1) return "BIRDIE!";
  if (d === 0) return "PAR";
  if (d === 1) return "BOGEY";
  if (d === 2) return "DOUBLE BOGEY";
  return "+" + d;
}

function finishHole(sunk) {
  const h = HOLES[S.hole];
  S.card[S.hole] = S.strokes;
  const d = S.strokes - h.par;
  S.parRow = sunk && d <= 0 ? (S.parRow || 0) + 1 : 0;
  if (window.NPRewards && S.parRow >= 2) window.NPRewards.streak(S.parRow, S.parRow === 2 ? "2 PARS IN A ROW!" : "");
  if (bests[S.hole] == null || S.strokes < bests[S.hole]) {
    bests[S.hole] = S.strokes;
    Shell.save("holes", JSON.stringify(bests));
  }
  if (!sunk) {
    Shell.flash("PICKED UP", "Max " + MAX_STROKES + " strokes. On to the next one.", "#8e93a2", 1300);
    Shell.sfx("miss"); Juke.sfx("pickup");
    V.pick = 0.001;
  } else if (S.strokes === 1) {
    Shell.flash("ACE!", "Is it on the shelf? It is now.", "#ffd23f", 1800);
    if (window.Trophies) window.Trophies.unlock("sl-ace");
    Shell.sfx("best"); Shell.sfx("crowd"); Juke.sfx("ace");
    burst(h.cup[0], h.cup[1], Shell.reduced ? 30 : 90);
    Shell.shake(4, 0.35); camShake(5, 0.4);
  } else {
    const col = d < 0 ? "#9bff3f" : d === 0 ? "#3ff0ff" : "#ff3fa4";
    Shell.flash(relLabel(d, S.strokes), S.strokes + (S.strokes === 1 ? " stroke" : " strokes"), col, 1200);
    Juke.sfx(d < 0 ? "birdie" : d === 0 ? "par" : "bogey", d);
    if (d < 0) { Shell.sfx("score"); burst(h.cup[0], h.cup[1], Shell.reduced ? 10 : 30); }
  }
  if (window.Trophies && sunk) {
    if (S.hole === 2 && !S.ball.sanded) window.Trophies.unlock("sl-peanut");
    if (S.hole === 8 && S.strokes <= h.par) window.Trophies.unlock("sl-gauntlet");
  }
  if (sunk) { V.sunk = true; V.vh = Math.min(V.vh, -30); }
  S.mode = "done";
  S.timer = sunk && S.strokes === 1 ? 1.9 : 1.35;
}

function nextHole() {
  if (S.hole >= HOLES.length - 1) {
    let total = 0;
    for (let i = 0; i < S.card.length; i++) total += S.card[i];
    Juke.sfx("over", total - TOTAL_PAR);
    Shell.gameOver(total - TOTAL_PAR, { title: "ROUND OVER", html: scorecard(total),
      stats: { holes: S.card.length, total: total, rel: total - TOTAL_PAR, splashes: S.splashes, card: S.card.slice(), par: HOLES.map(function (x) { return x.par; }) } });
    return;
  }
  if (R) V.from = { pos: R.camPos.clone(), tgt: R.camTgt.clone() };   // the camera flies on from wherever it is
  S.mode = "slide"; S.slide = 1;
  setupHole(S.hole + 1);
  S.mode = "slide";
  V.h = 16;                                                 // the ball is set down on the new tee
  Shell.sfx("whoosh");
  Juke.sfx("next");
}

function scorecard(total) {
  const row = function (label, f) {
    let s = "<tr><th>" + label + "</th>";
    for (let i = 0; i < HOLES.length; i++) s += "<td>" + f(i) + "</td>";
    return s + "</tr>";
  };
  let html = '<table aria-label="Scorecard"><tr><th>H</th>';
  for (let i = 0; i < HOLES.length; i++) html += "<th>" + (i + 1) + "</th>";
  html += "</tr>" +
    row("Par", function (i) { return HOLES[i].par; }) +
    row("You", function (i) {
      const s = S.card[i], b = bests[i];
      return s === b ? "<b style='color:#ffd23f'>" + s + "</b>" : s;
    }) +
    row("Best", function (i) { return bests[i] == null ? "-" : bests[i]; }) +
    "</table>";
  html += '<div class="np-row" style="margin-top:10px"><span>Total strokes</span><b>' + total + ' (par ' + TOTAL_PAR + ')</b></div>';
  return html;
}

/* ---------------- Update ---------------- */
function update(dt) {
  S.t += dt;
  S.holeT += dt;
  const h = HOLES[S.hole], b = S.ball;
  updateParts(dt);

  if (S.mode === "slide") {
    S.slide -= dt / (Shell.reduced ? 0.15 : SLIDE_T);
    if (S.slide <= 0) { S.slide = 0; S.mode = "aim"; S.rest = 1; aimAtCup(); }
    return;
  }
  if (S.mode === "done") {
    if (b.z > 0) b.z = Math.max(0, b.z - dt * 4);
    S.timer -= dt;
    if (S.timer <= 0) nextHole();
    return;
  }

  // keyboard aim + charge
  if (S.mode === "aim") {
    const turn = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
    const fine = (keys.ArrowUp ? -1 : 0) + (keys.ArrowDown ? 1 : 0);
    if (turn || fine) { S.aim += (turn * 2.2 + fine * 0.45) * dt; S.kb = true; }
    if (S.charging) {
      S.chargeT += dt;
      const ph = (S.chargeT / 1.2) % 2;
      S.power = ph < 1 ? ph : 2 - ph;
    }
  }

  // physics runs even at rest so moving pieces can nudge the ball
  const ev = advance(h, b, S.holeT, dt);
  if (b.impact) {
    if (b.impact > 60) { Shell.sfx("click"); Juke.sfx("knock", b.impact); }
    if (b.impact > 150 && V.h <= 0) V.vh = Math.min(62, b.impact * 0.11);   // a hard knock pops the ball off the felt (looks only)
    b.impact = 0;
  }
  if (b.boosted) { if (!S.boostSnd) { Shell.sfx("boost"); Juke.sfx("boost"); S.boostSnd = true; } b.boosted = false; }
  else S.boostSnd = false;

  if (ev === "sunk") {
    b.vx = b.vy = 0; b.x = h.cup[0]; b.y = h.cup[1];
    Shell.sfx("cup"); Juke.sfx("cup");
    finishHole(true);
    return;
  }
  if (ev === "water" || ev === "lost") {
    if (ev === "water") {
      S.strokes++;
      S.splashes++;
      Shell.sfx("splash"); Juke.sfx("splash");
      splash(b.x, b.y);
      Shell.flash("SPLASH", "Spilled soda. +1 stroke.", "#ff4b3e", 1000);
    }
    b.x = S.last.x; b.y = S.last.y; b.vx = b.vy = 0;
    V.h = ev === "water" ? 24 : 14; V.vh = 0;               // dropped back where the shot was played from
    if (S.strokes >= MAX_STROKES) { finishHole(false); return; }
    S.mode = "aim"; S.rest = 0;
    return;
  }

  const sp = Math.hypot(b.vx, b.vy);
  if (sp < STOP) {
    b.vx = b.vy = 0;
    S.rest += dt;
    if (S.mode === "roll" && S.rest > 0.12) {
      if (S.strokes >= MAX_STROKES) { finishHole(false); return; }
      S.mode = "aim";
      if (!S.kb) aimAtCup();
    }
  } else {
    S.rest = 0;
    // packing peanuts fly where the ball plows through them
    if (sp > 70 && !Shell.reduced) {
      for (let i = 0; i < h.sand.length; i++) if (inRect(b.x, b.y, h.sand[i])) {
        V.sandT -= dt;
        if (V.sandT <= 0) { V.sandT = 0.035; peanut(b.x, b.y, sp); }
        break;
      }
    }
  }
}

/* ---------------- Particles (drawn on the HUD layer, placed through the 3D camera) ---------------- */
const CONF_COLS = ["#3ff0ff", "#ff3fa4", "#9bff3f", "#ffd23f", "#a77bff", "#ff4b3e"];
function burst(x, y, n) {
  const p = courseToScreen(x, y, 8);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 60 + Math.random() * 220;
    parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 1.2 + Math.random() * 0.8, g: 260,
      c: CONF_COLS[i % CONF_COLS.length], w: 2.5 + (i % 3), rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14, kind: 0 });
  }
}
function splash(x, y) {
  // the ball crosses the edge of the spill, so the splash is drawn a little way in
  const w = HOLES[S.hole].water;
  for (let i = 0; i < w.length; i++) if (inRect(x, y, w[i], 1)) {
    const ix = Math.min(14, w[i].w / 2), iy = Math.min(14, w[i].h / 2);
    x = clamp(x, w[i].x + ix, w[i].x + w[i].w - ix); y = clamp(y, w[i].y + iy, w[i].y + w[i].h - iy);
    break;
  }
  const p = courseToScreen(x, y, 2);
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * TAU, s = 30 + Math.random() * 80;
    parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 70, life: 0.55 + Math.random() * 0.2, g: 300,
      c: i % 3 ? "#8a3a18" : "#e7b98c", w: 1.6 + Math.random() * 1.8, rot: 0, vr: 0, kind: 1 });
  }
  V.ripples.push({ x: x, y: y, t: 0, hole: S.hole });
  if (V.ripples.length > 3) V.ripples.shift();
}
function peanut(x, y, sp) {
  const p = courseToScreen(x, y, 3), a = Math.random() * TAU, s = 12 + Math.min(60, sp * 0.12) * Math.random();
  parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - 45, life: 0.45, g: 240,
    c: Math.random() < 0.5 ? "#fffaf0" : "#efe6cf", w: 2.2, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 16, kind: 0 });
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt; p.vy += p.g * dt; p.vx *= 0.98; p.rot += p.vr * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0) parts.splice(i, 1);
  }
}

/* ---------------- Input ---------------- */
function pointer(type, x, y) {
  if (type === "down") {
    if (!canShoot()) return;
    S.drag = { sx: x, sy: y, x: x, y: y };
    S.kb = false;
    S.charging = false;
  } else if (type === "move" && S.drag) {
    S.drag.x = x; S.drag.y = y;
  } else if ((type === "up" || type === "cancel") && S.drag) {
    const shot = dragShot();
    S.drag = null;
    if (type === "cancel" || !shot) return;
    shoot(shot.a, shot.p);
  }
}
// Drag back, let go: the pull is measured on screen exactly as before (6 px dead zone, MAX_PULL px for
// full power). Its direction is read through the camera, so the ball leaves along the line the pull
// draws on screen even though the green is now seen at an angle.
function dragShot() {
  if (!S.drag) return null;
  const dx = S.drag.sx - S.drag.x, dy = S.drag.sy - S.drag.y, len = Math.hypot(dx, dy);
  if (len < 6) return null;
  return { a: aimFromScreen(dx / len, dy / len), p: clamp(len / MAX_PULL, 0, 1) };
}
function aimFromScreen(ux, uy) {
  if (R && R.camReady) {
    const b = S.ball, p0 = courseToScreen(b.x, b.y, 0);
    const g = screenToCourse(p0.x + ux * 24, p0.y + uy * 24);
    if (g) {
      const ax = g.x - b.x, ay = g.y - b.y;
      if (ax * ax + ay * ay > 1e-6) return Math.atan2(ay, ax);
    }
  }
  return Math.atan2(uy, ux);
}
function key(type, code, e) {
  if (type === "down") {
    keys[code] = true;
    if ((code === "Space" || code === "Enter" || code === "NumpadEnter") && !e.repeat && canShoot() && !S.charging) {
      S.charging = true; S.chargeT = 0; S.power = 0; S.kb = true; S.drag = null;
    }
  } else {
    keys[code] = false;
    if ((code === "Space" || code === "Enter" || code === "NumpadEnter") && S.charging) {
      S.charging = false;
      shoot(S.aim, S.power);
      S.power = 0;
    }
  }
}

/* =====================================================================================
   Sound
   ===================================================================================== */
const MUSIC_VOL = 0.16, SFX_VOL = 0.22;                    // turn the tune or the stingers up and down here
const MUSIC_KEY = "npArcade.music", MUTE_KEY = "npArcade.muted";

/* The house tune: "Back Nine Breeze", an original 16-bar loop in F major at 96 BPM with a lazy swing: a marimba
   carrying the tune, a walking bass, soft electric piano comping on the off-beats, brushes and a shaker, and a
   couple of birds over the course. Self-contained: it knows nothing about the game, so it can be lifted out
   whole (a radio station, a jukebox). startMusic(ctx, dest) starts it on any audio context, into any node, and
   returns stop(). stop() fades it out and returns the step it got to; pass that back as opts.step to pick the
   tune up where it left off. opts.delay holds the downbeat back that many seconds. */
function startMusic(ctx, dest, opts) {
  opts = opts || {};
  const BPM = 96, STEP = 60 / BPM / 4, SWING = STEP * 0.36, N = 16 * 16, AHEAD = 0.5;
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function parse(bars) {
    const out = new Array(N).fill(null);
    bars.forEach(function (bar, b) {
      bar.split(" ").forEach(function (tok) {
        const m = /^(\d+)([A-G])([#b]?)(\d)-(\d+)$/.exec(tok);
        if (m) out[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + SEMI[m[2]] + (m[3] === "#" ? 1 : m[3] === "b" ? -1 : 0), Number(m[5])];
      });
    });
    return out;
  }
  // bass root, then the three notes the piano comps with (MIDI numbers); one chord a bar. The third flag is minor.
  const CH = { F: [41, 60, 65, 69, 0], Dm: [38, 62, 65, 69, 1], Gm: [43, 62, 67, 70, 1], C: [48, 60, 64, 67, 0], C7: [48, 58, 64, 67, 0],
               Bb: [46, 62, 65, 70, 0], Bbm: [46, 61, 65, 70, 1], D7: [38, 60, 66, 69, 0] };
  const PROG = "F Dm Gm C F Dm Gm C Bb Bbm F D7 Gm C7 F C7".split(" ");
  const LEAD = parse([
    "0A5-2 2C6-2 4A5-2 6F5-2 8G5-4 12A5-4",
    "0F5-2 2A5-2 4D6-4 8C6-2 10A5-2 12F5-4",
    "0G5-2 2Bb5-2 4D6-2 6Bb5-2 8A5-2 10G5-2 12F5-2 14E5-2",
    "0G5-6 6E5-2 8C5-4 12E5-2 14G5-2",
    "0A5-2 2C6-2 4F6-4 8E6-2 10C6-2 12A5-4",
    "0D6-2 2C6-2 4A5-2 6F5-2 8A5-4 12D6-4",
    "0Bb5-3 3A5-1 4G5-2 6D5-2 8E5-2 10G5-2 12Bb5-2 14C6-2",
    "0C6-6 8E5-2 10G5-2 12C6-2",
    "0D6-4 4F6-2 6D6-2 8Bb5-4 12F5-4",
    "0Db6-4 4F6-2 6Db6-2 8Bb5-6 14Ab5-2",
    "0C6-2 2A5-2 4F5-2 6A5-2 8C6-4 12F6-4",
    "0F#5-2 2A5-2 4C6-2 6D6-2 8C6-4 12A5-4",
    "0Bb5-2 2D6-2 4G6-4 8F6-2 10D6-2 12Bb5-4",
    "0E6-2 2D6-2 4C6-2 6Bb5-2 8G5-4 12E5-4",
    "0F5-2 2A5-2 4C6-2 6F6-2 8E6-2 10C6-2 12A5-4",
    "0G5-4 4Bb5-4 8E6-4 12C6-4"
  ]);

  // the rig: every voice ends up in out, which is all stop() has to fade
  const out = ctx.createGain(); out.connect(dest);
  function filt(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const malletBus = filt("lowpass", 5000, 0.7, out), bassBus = filt("lowpass", 700, 1.1, out), keysBus = filt("lowpass", 2200, 0.7, out);
  const send = ctx.createGain(), echo = ctx.createDelay(1), back = ctx.createGain(), wet = filt("lowpass", 2400, 0.7, out);
  send.gain.value = 0.22; echo.delayTime.value = STEP * 3; back.gain.value = 0.28;
  malletBus.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(wet);
  let seed = 0x5EEDF00D;
  function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
  const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate), ctx.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;
  function tone(to, type, f0, t, dur, vol, f1, hold) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.5 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(to, t, dur, vol, type, f, q) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nb; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(to); s.start(t, rnd() * 0.5); s.stop(t + dur + 0.02);
  }
  // a marimba bar: the warm body and a bright click from the mallet
  function mallet(m, t, vol) {
    const f = mtof(m);
    tone(malletBus, "sine", f, t, 0.42, vol, 0, 0.02);
    tone(malletBus, "sine", f * 4, t, 0.05, vol * 0.22, 0, 0.1);
    tone(malletBus, "triangle", f * 2, t, 0.12, vol * 0.12, 0, 0.1);
  }

  function playStep(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[bar]], n = LEAD[i];
    const tt = s % 4 === 2 ? t + SWING : t;                  // the off-beat eighths lean late: the swing
    if (n) mallet(n[0], tt, 0.22);
    if (s % 4 === 0) {                                      // walking bass, one note a beat, stepping into the next chord
      const beat = s >> 2, next = CH[PROG[(bar + 1) % 16]][0];
      const m = beat === 0 ? ch[0] : beat === 1 ? ch[0] + (ch[4] ? 3 : 4) : beat === 2 ? ch[0] + 7 : next - 1;
      tone(bassBus, "triangle", mtof(m), t, STEP * 3.4, 0.42, 0, 0.18);
      tone(bassBus, "sine", mtof(m) * 2, t, 0.05, 0.08, 0, 0.1);
    }
    if (s === 6 || s === 14 || (s === 0 && bar % 4 === 0)) {   // piano comping on the off-beats
      for (let k = 1; k <= 3; k++) { tone(keysBus, "triangle", mtof(ch[k]), tt, STEP * 1.6, 0.05, 0, 0.3); tone(keysBus, "sine", mtof(ch[k] + 12), tt, STEP * 1.2, 0.015, 0, 0.2); }
    }
    if (s === 0 || s === 8) tone(out, "sine", 105, t, 0.16, 0.42, 48, 0.05);                    // soft kick
    if (s === 4 || s === 12) { noise(out, t, 0.035, 0.16, "bandpass", 2800, 2); tone(out, "triangle", 1500, t, 0.025, 0.05, 0, 0.2); }   // rim click
    if (s % 2 === 0) noise(out, tt, 0.05, s % 4 === 0 ? 0.045 : 0.03, "highpass", 6500);        // shaker
    if ((bar === 3 || bar === 11) && s >= 13) {             // a bird over the course
      tone(out, "sine", 2600, t, 0.07, 0.035, 3500, 0.3); tone(out, "sine", 3000, t + 0.08, 0.06, 0.03, 3900, 0.3);
    }
  }

  let step = (((opts.step | 0) % N) + N) % N, nextT = ctx.currentTime + (opts.delay == null ? 0.05 : opts.delay), stopped = false, queued = 0;
  function tick() {
    if (stopped) return;
    const now = ctx.currentTime;
    if (nextT < now) nextT = now + 0.03;
    while (nextT < now + AHEAD) { playStep(step, nextT); step = (step + 1) % N; nextT += STEP; queued++; }
  }
  tick();
  const timer = setInterval(tick, 90);
  let at = step;
  return function stop() {
    if (stopped) return at;
    stopped = true; clearInterval(timer);
    const now = ctx.currentTime;
    at = ((step - Math.min(queued, Math.max(0, Math.ceil((nextT - now) / STEP)))) % N + N) % N;
    out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(out.gain.value, now); out.gain.linearRampToValueAtTime(0, now + 0.12);
    setTimeout(function () { try { out.disconnect(); } catch (e) { /* already gone */ } }, 600);
    return at;
  };
}

/* The rest of the sound: the mixer, the stingers, and the switches. The shell still plays every sound effect it
   always did, exactly when it did; these stingers sit on top of them. Nothing is created until the first tap,
   click or key press. The shell's mute button (the "npArcade.muted" setting) silences all of it; the music has
   its own switch (the "npArcade.music" setting, shared across the arcade), as a button on the title and pause
   cards and on the N key. The tune plays while a game is on and steps out for the title, pause and score cards.
   None of this rolls the game's dice or touches its state. */
const Juke = (function () {
  let live = null, dead = false, muted = false, stopMusic = null, songAt = 0, fresh = true, timer = 0, hooked = false, lastState = "";
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  let ownMute = (function () { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch (e) { return false; } })();
  const buttons = [], muteButtons = [];
  let seed = 0x2545F491;
  function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // Everything between the instruments and the speaker.
  function rig(c) {
    const A = { c: c };
    A.out = c.createGain();                                 // follows the mute button
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    A.out.connect(comp); comp.connect(c.destination);
    A.duck = c.createGain();                                // the tune steps back for a moment under the big stingers
    A.duck.connect(A.out);
    A.music = c.createGain(); A.music.gain.value = MUSIC_VOL; A.music.connect(A.duck);
    A.sfx = c.createGain(); A.sfx.gain.value = SFX_VOL; A.sfx.connect(A.out);
    const len = Math.floor(c.sampleRate * 2);
    A.noise = c.createBuffer(1, len, c.sampleRate);
    const d = A.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
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
  // A burst of filtered noise. f1 sweeps the filter.
  function hiss(A, dest, t, dur, vol, type, f0, q, f1, atk) {
    const s = A.c.createBufferSource(), f = A.c.createBiquadFilter(), g = A.c.createGain();
    s.buffer = A.noise; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, rnd() * 1.5); s.stop(t + dur + 0.05);
  }
  function duck(A, t, secs) {
    A.duck.gain.cancelScheduledValues(t);
    A.duck.gain.setTargetAtTime(0.45, t, 0.03);
    A.duck.gain.setTargetAtTime(1, t + secs, 0.25);
  }
  // The stingers. x is a detail of the moment (how hard, how many, how far under par).
  function cue(A, name, t, x) {
    const d = A.sfx;
    function mallet(m, at, v) {                             // a marimba bar, to match the tune
      osc(A, d, "sine", mtof(m), at, 0.42, v, 0, 0.02);
      osc(A, d, "sine", mtof(m) * 4, at, 0.05, v * 0.25, 0, 0.1);
    }
    if (name === "tap") {                                   // a button on the cards
      osc(A, d, "sine", 1047, t, 0.07, 0.22, 0, 0.3); osc(A, d, "sine", 1568, t + 0.05, 0.08, 0.18, 0, 0.3);
    } else if (name === "putt") {                           // the putter face meeting the ball, crisper the harder the stroke
      const k = clamp(x || 0, 0, 1);
      osc(A, d, "sine", 1500 - 300 * k, t, 0.07, 0.3 + 0.4 * k, 850, 0.05);
      osc(A, d, "triangle", 620, t, 0.05, 0.12 + 0.15 * k, 400, 0.1);
      hiss(A, d, t, 0.03, 0.18 + 0.2 * k, "bandpass", 3200, 1.5);
    } else if (name === "knock") {                          // off a rail, a box or a spinner
      const k = Math.min(1, (x || 0) / 500);
      osc(A, d, "triangle", 480 + 200 * k, t, 0.09, 0.12 + 0.28 * k, 300, 0.1);
      hiss(A, d, t, 0.025, 0.1 + 0.18 * k, "bandpass", 1800, 2);
    } else if (name === "cup") {                            // the drop, and the rattle off the bottom of the cup
      osc(A, d, "sine", 320, t, 0.12, 0.5, 140, 0.05);
      [0.07, 0.15, 0.21, 0.255, 0.29, 0.315].forEach(function (o, i) {
        const f = 1700 + rnd() * 600, v = 1 - i / 7;
        osc(A, d, "sine", f, t + o, 0.07, 0.26 * v, 0, 0.1); osc(A, d, "sine", f * 2.71, t + o, 0.04, 0.07 * v, 0, 0.1);
      });
    } else if (name === "ace") {                            // hole in one: a run up the chord, a held one on top, a sparkle
      const up = [65, 69, 72, 77, 81, 84, 89], te = t + 0.35 + up.length * 0.06;
      up.forEach(function (m, i) { osc(A, d, "square", mtof(m), t + 0.35 + i * 0.06, 0.1, 0.18, 0, 0.5); });
      [77, 81, 84, 89].forEach(function (m) { osc(A, d, "triangle", mtof(m), te, 0.8, 0.17, 0, 0.3); });
      for (let i = 0; i < 10; i++) mallet(i % 2 ? 96 : 93, te + 0.25 + i * 0.05, 0.09);
      duck(A, t, 2.2);
    } else if (name === "birdie") {                         // under par: up the chord on the marimba, higher for an eagle
      const up = (x || 0) <= -2 ? [72, 76, 79, 84, 88] : [72, 76, 79, 84];
      up.forEach(function (m, i) { mallet(m, t + 0.3 + i * 0.09, 0.26); });
      duck(A, t, 1.0);
    } else if (name === "par") {                            // par: two notes, job done
      mallet(67, t + 0.3, 0.24); mallet(72, t + 0.42, 0.24);
    } else if (name === "bogey") {                          // over par: a step or two down
      ((x || 0) >= 2 ? [67, 63, 60] : [67, 63]).forEach(function (m, i) { osc(A, d, "triangle", mtof(m), t + 0.3 + i * 0.16, 0.22, 0.24, 0, 0.4); });
    } else if (name === "pickup") {                         // out of strokes
      osc(A, d, "triangle", 392, t, 0.5, 0.26, 180, 0.6);
    } else if (name === "splash") {                         // into the soda: a fizz and some bubbles
      hiss(A, d, t, 0.45, 0.38, "bandpass", 1400, 0.7, 500, 0.01);
      hiss(A, d, t + 0.05, 0.7, 0.1, "highpass", 5000, 0.7, 0, 0.05);
      for (let i = 0; i < 7; i++) { const f = 380 + rnd() * 500; osc(A, d, "sine", f, t + 0.05 + i * 0.05 + rnd() * 0.03, 0.06, 0.13, f * 1.8, 0.2); }
    } else if (name === "boost") {                          // onto the belt
      osc(A, d, "sawtooth", 220, t, 0.22, 0.1, 880, 0.8); osc(A, d, "square", 440, t, 0.22, 0.08, 1320, 0.8);
    } else if (name === "next") {                           // off to the next tee
      osc(A, d, "triangle", 784, t, 0.12, 0.22, 0, 0.4); osc(A, d, "triangle", 1175, t + 0.1, 0.2, 0.22, 0, 0.4);
    } else if (name === "over") {                           // round over (x: strokes against par)
      const good = (x || 0) <= 0, up = good ? [65, 69, 72, 77, 81] : [65, 69, 72, 74, 72], te = t + up.length * 0.1;
      up.forEach(function (m, i) { mallet(m, t + i * 0.1, 0.24); });
      (good ? [77, 81, 84] : [65, 69, 72]).forEach(function (m) { osc(A, d, "triangle", mtof(m), te, 1.0, 0.14, 0, 0.4); });
      duck(A, t, 1.6);
    }
  }

  function isMuted() {
    const b = document.getElementById("np-mute");
    if (b) return b.getAttribute("aria-pressed") === "true";
    return ownMute;
  }
  // Browsers only let sound start from a tap, a click or a key press, so this is called from those and nowhere else.
  function unlock() {
    if (dead) return;
    try {
      if (!live) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        live = rig(new AC());
        muted = isMuted();
        live.out.gain.value = muted ? 0 : 1;
        if (!timer) timer = setInterval(pump, 150);         // keeps the switches followed if the picture ever stalls
      }
      if (live.c.state !== "running") { const p = live.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { live = null; dead = true; }
  }
  // Called every frame: follow the mute button, and start or stop the tune with the game.
  function pump() {
    const A = live;
    if (!A || !window.Shell || !Shell.state) return;
    const c = A.c, now = c.currentTime, m = isMuted(), st = Shell.state();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, now, 0.02); }
    if (!hooked && st === "playing" && (lastState === "title" || lastState === "over")) { songAt = 0; fresh = true; }
    lastState = st;
    const want = musicOn && !muted && c.state === "running" && st === "playing";
    if (want && !stopMusic) {
      try { stopMusic = startMusic(c, A.music, { step: songAt, delay: fresh ? 0.42 : 0.06 }); } catch (e) { stopMusic = null; }
      fresh = false;                                        // a fresh game lets the shell's start jingle go first
    } else if (!want && stopMusic) {
      songAt = stopMusic(); stopMusic = null;               // paused: the tune picks up where it stopped
    }
  }
  function sfx(name, x, delay) {
    const A = live;
    if (!A || muted || A.c.state === "closed") return;
    try { cue(A, name, A.c.currentTime + 0.01 + (delay || 0), x); } catch (e) { /* sound is never worth a crash */ }
  }
  function newGame() {
    unlock();
    songAt = 0; fresh = true;
    if (stopMusic) { stopMusic(); stopMusic = null; }
    pump();
  }

  function label() {
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].textContent = musicOn ? "MUSIC: ON" : "MUSIC: OFF";
      buttons[i].setAttribute("aria-pressed", musicOn ? "true" : "false");
    }
    for (let i = 0; i < muteButtons.length; i++) {
      muteButtons[i].textContent = ownMute ? "SOUND: OFF" : "SOUND: ON";
      muteButtons[i].setAttribute("aria-pressed", ownMute ? "false" : "true");
    }
  }
  function setMusic(on) {
    musicOn = !!on;
    try { localStorage.setItem(MUSIC_KEY, musicOn ? "1" : "0"); } catch (e) { /* private mode */ }
    label(); pump();
  }
  function setMute(on) {
    ownMute = !!on;
    try { localStorage.setItem(MUTE_KEY, ownMute ? "1" : "0"); } catch (e) { /* private mode */ }
    label(); pump();
  }
  // A switch in the shell's own button style, for the title card and the pause card.
  function makeButton(parent, before, attr, flip) {
    if (!parent) return null;
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-btn"; b.setAttribute(attr, "");
    b.style.cssText = "width:100%;margin-top:8px";
    b.addEventListener("click", function (e) { e.stopPropagation(); unlock(); flip(); sfx("tap"); });   // never a "tap to start"
    parent.insertBefore(b, before || null);
    return b;
  }
  function addButtons(parent, before) {
    const b = makeButton(parent, before, "data-np-music", function () { setMusic(!musicOn); });
    if (b) buttons.push(b);
    // the shell has its own mute button; if a page ever comes without one, the game brings a sound switch
    if (!document.getElementById("np-mute")) {
      const s = makeButton(parent, before, "data-np-sound", function () { setMute(!ownMute); });
      if (s) muteButtons.push(s);
    }
    label();
  }
  // A blip for every other button and link on the cards.
  function menuTap(e) {
    const el = e.target && e.target.closest ? e.target.closest("button, a, [role=button]") : null;
    if (el && !el.hasAttribute("data-np-music") && !el.hasAttribute("data-np-sound")) sfx("tap");
  }
  // Wire everything to the page and the shell. Called once, after Shell.init.
  function hook() {
    ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, unlock, true); });
    document.addEventListener("click", menuTap);
    if (typeof Shell.onStart === "function") { Shell.onStart(newGame); hooked = true; }
    if (typeof Shell.onRestart === "function") Shell.onRestart(newGame);
    if (typeof Shell.onResume === "function") Shell.onResume(unlock);
    document.addEventListener("keydown", function (e) {
      const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));   // not while initials are being typed
      if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) { unlock(); setMusic(!musicOn); }
    });
    const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
    if (titleCard) addButtons(titleCard, titleCard.querySelector(".np-tip"));
    if (pauseActions) addButtons(pauseActions, pauseActions.querySelector("a"));
  }
  return {
    hook: hook, unlock: unlock, pump: pump, sfx: sfx, newGame: newGame,
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    // for checks: what the engine is doing right now
    peek: function () { return { made: !!live, state: live ? live.c.state : "none", playing: !!stopMusic, songAt: songAt, muted: muted, musicOn: musicOn }; },
    cue: cue, rig: rig
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
// Draw the wordmark as large as fits inside a box, centered.
function drawScript(g, script, cx, cy, maxW, maxH) {
  let w = maxW, h = w * script.height / script.width;
  if (h > maxH) { h = maxH; w = h * script.width / script.height; }
  g.drawImage(script, cx - w / 2, cy - h / 2, w, h);
}

/* ---------------- Painted textures (all drawn here, no image files besides the wordmark) ---------------- */

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every decal on the course uses this
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

// Putting felt: one tile is 64 x 64 course units, mown in two 32-unit bands like the 2D greens.
function feltCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(3);
  g.fillStyle = "#23a348"; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#2cb655"; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 2; i++) {                             // soft seams between the bands
    const y = i * 128, gr = g.createLinearGradient(0, y - 5, 0, y + 5);
    gr.addColorStop(0, i ? "rgba(44,182,85,0)" : "rgba(35,163,72,0)"); gr.addColorStop(1, i ? "rgba(35,163,72,0)" : "rgba(44,182,85,0)");
    g.fillStyle = gr; g.fillRect(0, y - 5, 256, 10);
  }
  for (let i = 0; i < 7000; i++) {                          // the nap
    g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.055)" : "rgba(0,50,15,.075)";
    g.fillRect(rnd() * 256, rnd() * 256, 1, 1 + rnd() * 2);
  }
  return c;
}

// Lacquered shelf boards for the rails. Grain runs up the canvas; one tile is 40 x 40 units.
function woodCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(11);
  const n = 4, bw = 256 / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = "hsl(" + (33 + rnd() * 5) + "," + (64 + rnd() * 10) + "%," + (64 + rnd() * 7) + "%)";
    g.fillRect(Math.floor(i * bw), 0, Math.ceil(bw) + 1, 256);
    for (let k = 0; k < 16; k++) {
      g.fillStyle = "rgba(120,66,18," + (0.05 + rnd() * 0.09) + ")";
      g.fillRect(i * bw + rnd() * bw, 0, 1 + rnd() * 1.5, 256);
    }
    for (let k = 0; k < 3; k++) { g.fillStyle = "rgba(255,238,205," + (0.1 + rnd() * 0.1) + ")"; g.fillRect(i * bw + rnd() * bw, 0, 2, 256); }
  }
  for (let i = 0; i < n; i++) { g.fillStyle = "rgba(96,52,14,.4)"; g.fillRect(Math.round(i * bw), 0, 1, 256); }
  return c;
}

// The game room carpet: bright blue with the kind of confetti every arcade floor had. One tile is 220 units.
function carpetCanvas() {
  const S2 = 512, c = mkCanvas(S2, S2), g = c.getContext("2d"), rnd = rng(41);
  g.fillStyle = "#1a48b6"; g.fillRect(0, 0, S2, S2);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.035)" : "rgba(0,10,60,.06)";
    g.fillRect(rnd() * S2, rnd() * S2, 2, 2);
  }
  const cols = ["#ff9214", "#ffd21f", "#ff5aa8", "#3fe0ff", "#8a6bff", "#58d94a"];
  g.lineCap = "round"; g.lineJoin = "round";
  for (let i = 0; i < 34; i++) {
    const x = rnd() * S2, y = rnd() * S2, a = rnd() * TAU, kind = i % 4, col = cols[i % cols.length], sz = 12 + rnd() * 12;
    for (let ox = -S2; ox <= S2; ox += S2) for (let oy = -S2; oy <= S2; oy += S2) {   // wrapped, so the tile repeats cleanly
      g.save(); g.translate(x + ox, y + oy); g.rotate(a);
      g.globalAlpha = 0.62; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 4;
      if (kind === 0) {                                     // squiggle
        g.beginPath(); g.moveTo(-sz * 1.6, 0);
        for (let k = 0; k < 4; k++) g.quadraticCurveTo(-sz * 1.6 + (k + 0.5) * sz * 0.8, k % 2 ? sz * 0.6 : -sz * 0.6, -sz * 1.6 + (k + 1) * sz * 0.8, 0);
        g.stroke();
      } else if (kind === 1) {                              // triangle
        g.beginPath(); g.moveTo(0, -sz * 0.7); g.lineTo(sz * 0.65, sz * 0.5); g.lineTo(-sz * 0.65, sz * 0.5); g.closePath(); g.stroke();
      } else if (kind === 2) {                              // dot
        g.beginPath(); g.arc(0, 0, sz * 0.3, 0, TAU); g.fill();
      } else {                                              // zigzag
        g.beginPath(); g.moveTo(-sz, sz * 0.3); g.lineTo(-sz * 0.5, -sz * 0.3); g.lineTo(0, sz * 0.3); g.lineTo(sz * 0.5, -sz * 0.3); g.lineTo(sz, sz * 0.3); g.stroke();
      }
      g.restore();
    }
  }
  return c;
}

// A white golf ball: dimples all over, the script wordmark once on each side.
function ballCanvas(script) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  g.fillStyle = "#fbfbf7"; g.fillRect(0, 0, 512, 256);
  for (let row = 1; row < 16; row++) {                      // dimples, fewer per row toward the poles
    const y = row * 16, lat = (0.5 - y / 256) * Math.PI, n = Math.max(6, Math.round(34 * Math.cos(lat)));
    for (let k = 0; k < n; k++) {
      const x = (k + (row % 2) * 0.5) * 512 / n, rx = 4.6 / Math.max(0.3, Math.cos(lat));
      g.fillStyle = "rgba(120,128,150,.26)"; g.beginPath(); g.ellipse(x, y + 0.8, rx, 4.6, 0, 0, TAU); g.fill();
      g.fillStyle = "rgba(255,255,255,.9)"; g.beginPath(); g.ellipse(x, y - 0.6, rx * 0.8, 3.6, 0, 0, TAU); g.fill();
      if (x < 8) { g.fillStyle = "rgba(120,128,150,.26)"; g.beginPath(); g.ellipse(x + 512, y + 0.8, rx, 4.6, 0, 0, TAU); g.fill(); }
    }
  }
  // each row is widened by 1 / cos(latitude) so the wordmark lands on the sphere undistorted
  const SW = 150, SH = Math.round(SW * script.height / script.width), rowH = script.height / SH;
  [128, 384].forEach(function (cx) {
    g.fillStyle = "#fbfbf7"; g.beginPath(); g.ellipse(cx, 128, SW * 0.56, SH * 0.6, 0, 0, TAU); g.fill();
    for (let r = 0; r < SH; r++) {
      const y = 128 - Math.round(SH / 2) + r, lat = (0.5 - (y + 0.5) / 256) * Math.PI, w = SW / Math.max(0.4, Math.cos(lat));
      g.drawImage(script, 0, r * rowH, script.width, rowH, cx - w / 2, y, w, 1);
    }
  });
  return c;
}

// The lid of a game box (or a sealed copy sliding across the green): loud color, wordmark plate in the middle.
function boxCanvas(w, d, col, script, seed) {
  const k = 5, cw = Math.round(w * k), ch = Math.round(d * k);
  const c = mkCanvas(cw, ch), g = c.getContext("2d"), rnd = rng(seed * 7 + 3);
  const bg = g.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, shade(col, 0.22)); bg.addColorStop(1, shade(col, -0.12));
  g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
  g.save(); g.globalAlpha = 0.16; g.fillStyle = "#ffffff";   // speed stripes
  for (let x = -ch; x < cw; x += 34) { g.beginPath(); g.moveTo(x, ch); g.lineTo(x + ch, 0); g.lineTo(x + ch + 13, 0); g.lineTo(x + 13, ch); g.closePath(); g.fill(); }
  g.restore();
  g.lineWidth = 5; g.strokeStyle = shade(col, -0.38); g.strokeRect(2.5, 2.5, cw - 5, ch - 5);
  const ph = ch * 0.74, pw = Math.min(cw * 0.86, ph * (script.width / script.height) * 1.12), px = (cw - pw) / 2, py = (ch - ph) / 2;
  rrectPath(g, px, py, pw, ph, ph * 0.22); g.fillStyle = "#0d1f5c"; g.fill();
  g.lineWidth = 3; g.strokeStyle = "#fff3cf"; g.stroke();
  drawScript(g, script, cw / 2, ch / 2, pw * 0.9, ph * 0.84);
  const side = px - 10;                                      // room beside the plate gets a star
  if (side > 26) {
    [px / 2, cw - px / 2].forEach(function (sx) {
      const r1 = Math.min(side, ch) * 0.3, r0 = r1 * 0.45, rot = rnd() * TAU;
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5, r = i % 2 ? r0 : r1; g.lineTo(sx + Math.cos(a) * r, ch / 2 + Math.sin(a) * r); }
      g.closePath(); g.fillStyle = "#fff3cf"; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = "#0d1f5c"; g.stroke();
    });
  }
  const gl = g.createLinearGradient(0, 0, 0, ch * 0.5);     // shrink-wrap shine
  gl.addColorStop(0, "rgba(255,255,255,.34)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.fillRect(0, 0, cw, ch * 0.5);
  return c;
}

// A game cartridge seen from above: grey shell, grip ridges at both ends, a label with the wordmark.
function cartCanvas(w, d, script) {
  const k = 5, cw = Math.round(w * k), ch = Math.round(d * k);
  const c = mkCanvas(cw, ch), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, "#c2c5d0"); bg.addColorStop(1, "#8f93a2");
  g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
  const lw = Math.min(cw * 0.6, (ch - 14) * (script.width / script.height) * 1.5), lx = (cw - lw) / 2;
  for (let x = 9; x < lx - 10; x += 9) { g.fillStyle = "#6c7080"; g.fillRect(x, 8, 4, ch - 16); g.fillStyle = "#dfe2ea"; g.fillRect(x + 4, 8, 1.5, ch - 16); }
  for (let x = cw - 13; x > lx + lw + 6; x -= 9) { g.fillStyle = "#6c7080"; g.fillRect(x, 8, 4, ch - 16); g.fillStyle = "#dfe2ea"; g.fillRect(x + 4, 8, 1.5, ch - 16); }
  rrectPath(g, lx, 6, lw, ch - 12, 7); g.fillStyle = "#16171d"; g.fill();
  rrectPath(g, lx + 3, 9, lw - 6, ch - 18, 5);
  const lb = g.createLinearGradient(0, 9, 0, ch - 9);
  lb.addColorStop(0, "#ffe45c"); lb.addColorStop(1, "#ff9214");
  g.fillStyle = lb; g.fill();
  drawScript(g, script, cw / 2, ch / 2, lw - 16, ch - 26);
  return c;
}

// The top of a video tape: the spinner's blades are three of them.
function tapeCanvas() {
  const c = mkCanvas(128, 32), g = c.getContext("2d");
  g.fillStyle = "#1b1d26"; g.fillRect(0, 0, 128, 32);
  g.fillStyle = "#2b2e3b"; g.fillRect(3, 3, 122, 26);
  g.fillStyle = "#f4efdf"; g.fillRect(34, 6, 86, 20);
  g.fillStyle = "#ff9214"; g.fillRect(34, 6, 86, 5);
  g.fillStyle = "#1b1d26"; g.fillRect(40, 15, 60, 2); g.fillRect(40, 20, 40, 2);
  g.fillStyle = "#0c0d12"; g.beginPath(); g.arc(18, 16, 8, 0, TAU); g.fill();
  g.fillStyle = "#f4efdf"; g.beginPath(); g.arc(18, 16, 4, 0, TAU); g.fill();
  return c;
}

// Conveyor chevrons: one tile, scrolled along the boost.
function boostCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  g.fillStyle = "#0d2f8a"; g.fillRect(0, 0, 64, 64);
  g.lineJoin = "miter"; g.lineCap = "butt";
  [["#0a2266", 13, 3], ["#3fe0ff", 9, 0], ["#d8fbff", 3, -2]].forEach(function (s) {
    g.strokeStyle = s[0]; g.lineWidth = s[1];
    for (let o = -64; o <= 64; o += 64) { g.beginPath(); g.moveTo(4, 50 + o + s[2]); g.lineTo(32, 20 + o + s[2]); g.lineTo(60, 50 + o + s[2]); g.stroke(); }
  });
  return c;
}

// Spilled cola: dark, fizzy.
function sodaCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d"), rnd = rng(77);
  g.fillStyle = "#4a1608"; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 128, y = rnd() * 128, r = 8 + rnd() * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(122,46,16,.5)"); gr.addColorStop(1, "rgba(122,46,16,0)");
    for (let ox = -128; ox <= 128; ox += 128) for (let oy = -128; oy <= 128; oy += 128) { g.fillStyle = gr; g.save(); g.translate(ox, oy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
  }
  for (let i = 0; i < 46; i++) {
    const x = rnd() * 128, y = rnd() * 128, r = 0.7 + rnd() * 1.5;
    g.fillStyle = "rgba(214,150,98," + (0.3 + rnd() * 0.35) + ")"; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,236,214,.5)"; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU); g.fill();
  }
  return c;
}

// The bed of the peanut pit (the loose peanuts on top are real geometry).
function sandCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d"), rnd = rng(19);
  g.fillStyle = "#d8ccae"; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 150; i++) {
    const x = rnd() * 128, y = rnd() * 128, a = rnd() * Math.PI;
    for (let ox = -128; ox <= 128; ox += 128) for (let oy = -128; oy <= 128; oy += 128) {
      g.save(); g.translate(x + ox, y + oy); g.rotate(a);
      g.fillStyle = "rgba(120,100,60,.25)"; g.beginPath(); g.ellipse(1, 1.5, 7, 3.6, 0, 0, TAU); g.fill();
      g.fillStyle = i % 3 ? "#f7f1e1" : "#ece2c8"; g.beginPath(); g.ellipse(0, 0, 7, 3.6, 0, 0, TAU); g.fill();
      g.restore();
    }
  }
  return c;
}

function flagCanvas(script) {
  const c = mkCanvas(256, 160), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 160);
  bg.addColorStop(0, "#ff4a3a"); bg.addColorStop(1, "#d21a14");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 160);
  g.fillStyle = "#ffe45c"; g.fillRect(0, 0, 256, 9); g.fillRect(0, 151, 256, 9);
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 12, 160);
  drawScript(g, script, 134, 80, 226, 124);
  return c;
}

// The rubber tee mat, wordmark across it.
function teeCanvas(script) {
  const c = mkCanvas(256, 176), g = c.getContext("2d");
  rrectPath(g, 3, 3, 250, 170, 26); g.fillStyle = "#0f2f86"; g.fill();
  rrectPath(g, 10, 10, 236, 156, 20); g.fillStyle = "#1b56cf"; g.fill();
  g.lineWidth = 4; g.strokeStyle = "#ff9214"; g.stroke();
  for (let y = 22; y < 160; y += 9) { g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(18, y, 220, 3); }
  drawScript(g, script, 128, 126, 200, 72);
  g.fillStyle = "#ffffff"; g.beginPath(); g.arc(128, 72, 6, 0, TAU); g.fill();
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

// The course sign behind each cup: the wordmark on the left, the hole on the right. Same marquee as the lanes.
function signCanvas(script, n, par) {
  const c = mkCanvas(1024, 300), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 300);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 300);
  const gl = g.createLinearGradient(0, 0, 0, 140);
  gl.addColorStop(0, "rgba(255,255,255,.42)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.beginPath(); g.ellipse(512, -20, 620, 160, 0, 0, TAU); g.fill();
  g.lineWidth = 16; g.strokeStyle = "#ff9214"; g.strokeRect(8, 8, 1008, 284);
  g.lineWidth = 4; g.strokeStyle = "#ffe45c"; g.strokeRect(19, 19, 986, 262);
  drawScript(g, script, 352, 150, 600, 232);
  candyText(g, "HOLE " + n, 836, 112, 86, 300);
  candyText(g, "PAR " + par, 836, 206, 58, 300);
  return c;
}

function arrowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  g.lineJoin = "round";
  g.beginPath(); g.moveTo(32, 6); g.lineTo(58, 40); g.lineTo(42, 40); g.lineTo(42, 58); g.lineTo(22, 58); g.lineTo(22, 40); g.lineTo(6, 40); g.closePath();
  g.lineWidth = 7; g.strokeStyle = "#0b4a12"; g.stroke();
  g.fillStyle = "#b6ff4a"; g.fill();
  return c;
}
function flapCanvas() {
  const c = mkCanvas(64, 32), g = c.getContext("2d");
  g.fillStyle = "rgba(120,255,90,.55)"; g.fillRect(0, 0, 64, 32);
  g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 3; g.lineJoin = "round";
  for (let x = 12; x < 64; x += 20) { g.beginPath(); g.moveTo(x - 6, 21); g.lineTo(x, 11); g.lineTo(x + 6, 21); g.stroke(); }
  g.strokeStyle = "rgba(20,120,30,.9)"; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 61, 29);
  return c;
}

function shadowCanvas(round) {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  if (round) {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, "rgba(0,20,10,.8)"); gr.addColorStop(0.55, "rgba(0,20,10,.4)"); gr.addColorStop(1, "rgba(0,20,10,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  } else {
    g.filter = "blur(5px)";
    g.fillStyle = "rgba(0,20,10,.62)"; g.fillRect(10, 10, 44, 44);
    g.filter = "none";
    g.fillStyle = "rgba(0,20,10,.3)"; g.fillRect(14, 14, 36, 36);    // still there if the browser has no canvas blur
  }
  return c;
}

// A tiny painted room for the glossy highlights on the ball, the boxes and the rails.
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.16, "#dcebff"); gr.addColorStop(0.3, "#3d8cff");
    gr.addColorStop(0.5, "#1648b8"); gr.addColorStop(0.52, "#1d7a3c"); gr.addColorStop(1, "#2cb655");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#2a55b8"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(8, 6, 14, 52); tg.fillRect(42, 6, 14, 52);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#2cb655"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* ---------------- Geometry helpers ---------------- */

// A box with every edge and corner rounded. Each face keeps its own material slot (+x -x +y -y +z -z).
// uv: { fit: true } stretches a face's texture corner to corner (lids, labels);
//     { k, long } tiles in course units with v running along the "x" or "z" axis (wood grain).
function roundBox(T, w, h, d, r, uv) {
  const s = 5, per = (s + 1) * (s + 1), half = 0.5 / s;
  r = Math.min(r, w / 2, h / 2, d / 2);
  const g = new T.BoxGeometry(1, 1, 1, s, s, s);
  const pos = g.attributes.position, nor = g.attributes.normal, tuv = g.attributes.uv;
  const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r;
  uv = uv || { fit: true };
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    let nx = px - Math.sign(px) * half, ny = py - Math.sign(py) * half, nz = pz - Math.sign(pz) * half;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const x = bx * Math.sign(px) + nx * r, y = by * Math.sign(py) + ny * r, z = bz * Math.sign(pz) + nz * r;
    pos.setXYZ(i, x, y, z); nor.setXYZ(i, nx, ny, nz);
    const side = Math.floor(i / per);
    if (uv.fit) {
      if (side < 2) tuv.setXY(i, 0.5 + (side ? z : -z) / d, 0.5 + y / h);
      else if (side < 4) tuv.setXY(i, 0.5 + x / w, 0.5 - z / d);
      else tuv.setXY(i, 0.5 + (side === 4 ? x : -x) / w, 0.5 + y / h);
    } else {
      let a, b;                                             // the two in-face directions
      if (side < 2) { a = z; b = y; } else if (side < 4) { a = x; b = z; } else { a = x; b = y; }
      const along = uv.long === "x" ? (side < 2 ? null : a) : (side < 2 ? a : side < 4 ? b : null);
      if (along === null) tuv.setXY(i, a * uv.k, b * uv.k);
      else tuv.setXY(i, (along === a ? b : a) * uv.k + 0.37, along * uv.k);
    }
  }
  pos.needsUpdate = nor.needsUpdate = tuv.needsUpdate = true;
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

function rectPts(T, x1, y1, x2, y2) { return [new T.Vector2(x1, y1), new T.Vector2(x2, y1), new T.Vector2(x2, y2), new T.Vector2(x1, y2)]; }
function roundRectPts(T, x1, y1, x2, y2, r) {
  const pts = [], n = 5;
  [[x2 - r, y1 + r, -0.25], [x2 - r, y2 - r, 0], [x1 + r, y2 - r, 0.25], [x1 + r, y1 + r, 0.5]].forEach(function (c) {
    for (let i = 0; i <= n; i++) { const a = (c[2] + i / n * 0.25) * TAU; pts.push(new T.Vector2(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r)); }
  });
  return pts;
}
function circlePts(T, cx, cy, r, n) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU; pts.push(new T.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
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
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x143c9e, 1);
  renderer.shadowMap.enabled = true;
  // newer three.js builds fold the soft filter into PCFShadowMap and warn about the old name
  renderer.shadowMap.type = (parseInt(T.REVISION, 10) || 0) >= 182 ? T.PCFShadowMap : T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(CAM_FOV, W / H, 60, 6000);
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
  // the wordmark as a decal texture: a power-of-two canvas with a clear rim so its edges never smear
  const cScript = mkCanvas(1024, 512);
  cScript.getContext("2d").drawImage(script, 8, 8, 1008, 496);
  const tScript = tex(cScript), tFelt = tex(feltCanvas(), true), tWood = tex(woodCanvas(), true), tCarpet = tex(carpetCanvas(), true);
  const tBall = tex(ballCanvas(script), true), tTape = tex(tapeCanvas()), tBoost = tex(boostCanvas(), true), tSoda = tex(sodaCanvas(), true);
  const tSand = tex(sandCanvas(), true), tFlag = tex(flagCanvas(script)), tTee = tex(teeCanvas(script)), tArrow = tex(arrowCanvas());
  const tFlap = tex(flapCanvas()), tBlob = tex(shadowCanvas(true)), tSoft = tex(shadowCanvas(false));
  tBall.wrapT = T.ClampToEdgeWrapping;
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;

  /* lights */
  scene.add(new T.HemisphereLight(0xffffff, 0x8fa8e6, 1.2));
  const key = new T.DirectionalLight(0xfff6e4, 3.1);        // the one light that throws shadows: high, from the left
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -260; sc.right = 260; sc.top = 340; sc.bottom = -340; sc.near = 40; sc.far = 1000;
  sc.updateProjectionMatrix();
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.6; key.shadow.radius = 2.4;
  scene.add(key); scene.add(key.target);
  const fill = new T.DirectionalLight(0xdfeaff, 0.55);      // from the far side, so the faces toward the camera never go flat
  fill.position.set(140, 180, 320); scene.add(fill);

  function decal(mat, order) { mat.transparent = true; mat.depthWrite = false; mat._order = order; return mat; }
  function lit(mesh, cast, recv) { mesh.castShadow = !!cast; mesh.receiveShadow = !!recv; return mesh; }
  // A flat rectangle on the course at height y. Texture "up" points up the course (toward the cup).
  function ground(x1, y1, x2, y2, y, mat, su, sv) {
    const g = new T.PlaneGeometry(x2 - x1, y2 - y1);
    g.rotateX(-Math.PI / 2);
    if (su) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }
    const m = new T.Mesh(g, mat);
    m.position.set((x1 + x2) / 2 - CX, y, (y1 + y2) / 2 - CZ);
    if (mat._order) m.renderOrder = mat._order;
    return m;
  }

  /* shared materials */
  const feltMat = new T.MeshLambertMaterial({ map: tFelt });
  const railMat = new T.MeshPhongMaterial({ map: tWood, specular: 0x8a8a8a, shininess: 70, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.06 });
  const carpetMat = new T.MeshLambertMaterial({ map: tCarpet });
  const cupWall = new T.MeshLambertMaterial({ color: 0xdfe3ea, side: T.BackSide });
  const cupFloor = new T.MeshLambertMaterial({ color: 0x14161c });
  const rimMat = new T.MeshPhongMaterial({ color: 0xffffff, specular: 0xffffff, shininess: 80 });
  const poleMat = new T.MeshPhongMaterial({ color: 0xf2f2f2, specular: 0xffffff, shininess: 90 });
  const flagMat = new T.MeshLambertMaterial({ map: tFlag, side: T.DoubleSide });
  const markMat = decal(new T.MeshLambertMaterial({ map: tScript, opacity: 0.9 }), 1);
  const teeMat = decal(new T.MeshLambertMaterial({ map: tTee }), 2);
  const sandMat = decal(new T.MeshLambertMaterial({ map: tSand }), 3);
  const boostMat = decal(new T.MeshBasicMaterial({ map: tBoost }), 3);
  const boostEdge = decal(new T.MeshLambertMaterial({ color: 0xff9214 }), 2);
  const arrowMat = decal(new T.MeshBasicMaterial({ map: tArrow }), 3);
  const foamMat = decal(new T.MeshLambertMaterial({ color: 0xe2b98a }), 3);
  const sodaMat = decal(new T.MeshPhongMaterial({ map: tSoda, specular: 0xb08a66, shininess: 90, opacity: 0.97 }), 4);
  const rippleMat = decal(new T.MeshBasicMaterial({ color: 0xffe2c0, opacity: 0.8 }), 5);
  const softMat = decal(new T.MeshBasicMaterial({ map: tSoft, opacity: 0.55 }), 6);
  const blobMat = decal(new T.MeshBasicMaterial({ map: tBlob, opacity: 0.6 }), 6);
  const peanutMat = new T.MeshLambertMaterial({ color: 0xfbf6e8 });
  const cartSide = new T.MeshPhongMaterial({ color: 0x9a9eac, specular: 0x999999, shininess: 50 });
  const tapeSide = new T.MeshPhongMaterial({ color: 0x23252f, specular: 0xaaaaaa, shininess: 70 });
  const tapeTop = new T.MeshPhongMaterial({ map: tTape, specular: 0x888888, shininess: 60 });
  const hubMat = new T.MeshPhongMaterial({ color: 0xf4efdf, specular: 0xffffff, shininess: 90, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12 });
  const capMat = new T.MeshPhongMaterial({ color: 0xff9214, specular: 0xffffff, shininess: 110, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.18 });
  const gatePost = new T.MeshPhongMaterial({ color: 0x58d94a, specular: 0xffffff, shininess: 90 });
  const flapMat = new T.MeshBasicMaterial({ map: tFlap, transparent: true, side: T.DoubleSide, depthWrite: false });
  const postMat = new T.MeshPhongMaterial({ color: 0xeef2ff, specular: 0xffffff, shininess: 80 });
  const signSide = new T.MeshPhongMaterial({ color: 0x1b4fc0, specular: 0x777777, shininess: 40 });
  const sideMats = BOX_COLS.map(function (c) {
    return new T.MeshPhongMaterial({ color: new T.Color(shade(c, -0.1)), specular: 0xaaaaaa, shininess: 70, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.08 });
  });
  function lidMat(canvas) {
    return new T.MeshPhongMaterial({ map: tex(canvas), specular: 0xbbbbbb, shininess: 90, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.1 });
  }
  function six(sideMat, top) { return [sideMat, sideMat, top, sideMat, sideMat, sideMat]; }

  /* shared geometry */
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
  const cupGeo = new T.CylinderGeometry(CUP_R, CUP_R * 0.94, CUP_D, 28, 1, true);
  const cupBot = new T.CircleGeometry(CUP_R, 24); cupBot.rotateX(-Math.PI / 2);
  const rimGeo = new T.RingGeometry(CUP_R - 0.2, CUP_R + 1.1, 36); rimGeo.rotateX(-Math.PI / 2);
  const poleGeo = new T.CylinderGeometry(0.75, 0.75, 44, 8); poleGeo.translate(0, 22 - CUP_D, 0);
  const knobGeo = new T.SphereGeometry(1.5, 10, 8); knobGeo.translate(0, 44 - CUP_D, 0);
  const FLAG_W = 22, FLAG_H = 13;
  const flagGeo = new T.PlaneGeometry(FLAG_W, FLAG_H, 10, 2); flagGeo.translate(FLAG_W / 2 + 0.6, 44 - CUP_D - FLAG_H / 2 - 1.5, 0);
  const flagBase = Float32Array.from(flagGeo.attributes.position.array);
  const peanutGeo = new T.SphereGeometry(1, 7, 5);
  const hubGeo = new T.CylinderGeometry(6, 6.6, 11, 22); hubGeo.translate(0, 5.5, 0);
  const hubCap = new T.SphereGeometry(5.6, 18, 8, 0, TAU, 0, Math.PI / 2); hubCap.scale(1, 0.55, 1); hubCap.translate(0, 11, 0);
  const postGeo = new T.CylinderGeometry(1.3, 1.3, 1, 10); postGeo.translate(0, 0.5, 0);
  const ballGeo = new T.SphereGeometry(BR * 1.1, 28, 18);     // a touch over true size so it reads at a glance

  /* the carpet under everything */
  const cw = HOLE_PITCH * (HOLES.length + 3), cd = 3600;
  const carpet = lit(new T.Mesh(new T.PlaneGeometry(cw, cd).rotateX(-Math.PI / 2), carpetMat), false, true);
  (function () { const uv = carpet.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * cw / 220, uv.getY(i) * cd / 220); })();
  carpet.position.set(HOLE_PITCH * (HOLES.length - 1) / 2, -BASE, -700);
  scene.add(carpet);

  const fake = [];                                          // stand-in shadows, shown only when shadow maps are off
  function softShadow(parent, w, d, x, z, y) {
    const m = new T.Mesh(unit, softMat);
    m.scale.set(w * 1.5, 1, d * 1.9); m.position.set(x + 2.5, y, z - 1.5); m.renderOrder = 6; m.visible = false;
    parent.add(m); fake.push(m);
    return m;
  }

  /* one hole */
  function buildHole(i) {
    const h = HOLES[i], grp = new T.Group(), o = { grp: grp, sliders: [], rotors: [], gates: [], flag: null, pts: [] };
    grp.position.x = i * HOLE_PITCH;
    let k, m;

    // the green, with a real hole cut for the cup
    h.floor.forEach(function (f) {
      const inCup = inRect(h.cup[0], h.cup[1], f);
      const geo = flatGeo(T, rectPts(T, f.x - 1, f.y - 1, f.x + f.w + 1, f.y + f.h + 1), inCup ? [circlePts(T, h.cup[0], h.cup[1], CUP_R, 28)] : [], 0, 1 / 64);
      grp.add(lit(new T.Mesh(geo, feltMat), false, true));
    });
    const cup = new T.Group();
    cup.position.set(h.cup[0] - CX, 0, h.cup[1] - CZ);
    m = new T.Mesh(cupGeo, cupWall); m.position.y = -CUP_D / 2; cup.add(lit(m, false, true));
    m = new T.Mesh(cupBot, cupFloor); m.position.y = -CUP_D; cup.add(m);
    m = new T.Mesh(rimGeo, rimMat); m.position.y = 0.05; cup.add(lit(m, false, true));
    grp.add(cup);
    const flag = new T.Group();
    flag.add(lit(new T.Mesh(poleGeo, poleMat), true, false));
    flag.add(lit(new T.Mesh(knobGeo, capMat), true, false));
    flag.add(lit(new T.Mesh(flagGeo, flagMat), true, false));
    flag.position.copy(cup.position); grp.add(flag); o.flag = flag;
    o.pts.push([h.cup[0] - CX + FLAG_W, 34, h.cup[1] - CZ]);

    // tee mat and the wordmark printed on the felt
    grp.add(lit(ground(h.tee[0] - 20, h.tee[1] - 11, h.tee[0] + 20, h.tee[1] + 16, 0.14, teeMat), false, true));
    const fm = FELT_MARKS[i], mh = fm[2] / sAspect;
    grp.add(lit(ground(fm[0] - fm[2] / 2, fm[1] - mh / 2, fm[0] + fm[2] / 2, fm[1] + mh / 2, 0.08, markMat), false, true));

    // rails: lacquered shelf boards, rounded over
    h.walls.forEach(function (r, n) {
      const across = r.w >= r.h, hh = RAIL_H + BASE + (across ? 0 : 0.04) + n * 0.003;
      m = new T.Mesh(roundBox(T, r.w, hh, r.h, 2.8, { k: 1 / 40, long: across ? "x" : "z" }), railMat);
      m.position.set(r.x + r.w / 2 - CX, hh / 2 - BASE, r.y + r.h / 2 - CZ);
      grp.add(lit(m, true, true));
      o.pts.push([r.x - CX, RAIL_H, r.y - CZ], [r.x + r.w - CX, RAIL_H, r.y - CZ], [r.x - CX, -BASE, r.y + r.h - CZ], [r.x + r.w - CX, -BASE, r.y + r.h - CZ]);
    });

    // game boxes
    function addBox(r, n, moving) {
      const ci = (n + h.par + i) % BOX_COLS.length, hh = moving ? BOX_H - 2 : BOX_H;
      const mesh = new T.Mesh(roundBox(T, r.w, hh, r.h, 2.6), six(sideMats[ci], lidMat(boxCanvas(r.w, r.h, BOX_COLS[ci], script, i * 10 + n))));
      mesh.position.set(r.x + r.w / 2 - CX, hh / 2, r.y + r.h / 2 - CZ);
      grp.add(lit(mesh, true, true));
      const sh = softShadow(grp, r.w, r.h, mesh.position.x, mesh.position.z, 0.2);
      return { mesh: mesh, shadow: sh };
    }
    h.boxes.forEach(function (r, n) { addBox(r, n, false); });
    h.sliders.forEach(function (s, n) { const b = addBox({ x: s.x1, y: s.y, w: s.w, h: s.h }, n + 2, true); b.s = s; o.sliders.push(b); });

    // cartridges, and the one-way gates between them
    h.carts.forEach(function (r) {
      m = new T.Mesh(roundBox(T, r.w, CART_H, r.h, 2.2), six(cartSide, lidMat(cartCanvas(r.w, r.h, script))));
      m.position.set(r.x + r.w / 2 - CX, CART_H / 2, r.y + r.h / 2 - CZ);
      grp.add(lit(m, true, true));
      softShadow(grp, r.w, r.h, m.position.x, m.position.z, 0.2);
    });
    h.gates.forEach(function (g) {
      const r = g.r, gx = r.x + r.w / 2 - CX, gz = r.y + r.h / 2 - CZ, top = CART_H + 3.5;
      const gg = new T.Group(); gg.position.set(gx, 0, gz);
      [-1, 1].forEach(function (s) { m = new T.Mesh(postGeo, gatePost); m.scale.y = top; m.position.x = s * (r.w / 2 - 1.3); gg.add(lit(m, true, false)); });
      const bar = new T.Mesh(postGeo, gatePost); bar.rotation.z = Math.PI / 2; bar.scale.y = r.w; bar.position.set(r.w / 2, top, 0); gg.add(lit(bar, true, false));
      const fg = new T.PlaneGeometry(r.w - 5, top - 2); fg.translate(0, -(top - 2) / 2, 0);
      const flap = new T.Mesh(fg, flapMat); flap.position.y = top - 0.6; flap.renderOrder = 7; gg.add(flap);
      const ar = new T.Mesh(unit, arrowMat); ar.scale.set(13, 1, 13); ar.position.set(0, 0.2, 0); ar.renderOrder = 3;
      ar.rotation.y = Math.atan2(-g.dx, -g.dy); gg.add(ar);
      grp.add(gg);
      o.gates.push({ g: g, flap: flap, arrow: ar, a: 0 });
    });

    // packing peanuts: a painted bed, loose ones on top
    h.sand.forEach(function (r, n) {
      grp.add(lit(new T.Mesh(flatGeo(T, roundRectPts(T, r.x, r.y, r.x + r.w, r.y + r.h, 7), null, 0.22, 1 / 46), sandMat), false, true)).renderOrder = 3;
      const count = Math.round(r.w * r.h / 34), im = new T.InstancedMesh(peanutGeo, peanutMat, count), rnd = rng(i * 31 + n);
      const mat = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), p = new T.Vector3(), sc2 = new T.Vector3();
      for (k = 0; k < count; k++) {
        p.set(r.x + 4 + rnd() * (r.w - 8) - CX, 1 + rnd() * 1.1, r.y + 4 + rnd() * (r.h - 8) - CZ);
        e.set((rnd() - 0.5) * 0.5, rnd() * TAU, (rnd() - 0.5) * 0.5); q.setFromEuler(e);
        const z = 0.8 + rnd() * 0.5; sc2.set(2.7 * z, 1.25 * z, 1.45 * z);
        im.setMatrixAt(k, mat.compose(p, q, sc2));
      }
      im.instanceMatrix.needsUpdate = true;
      grp.add(lit(im, false, true));
    });

    // spilled soda with a froth edge
    h.water.forEach(function (r) {
      grp.add(lit(new T.Mesh(flatGeo(T, roundRectPts(T, r.x - 0.5, r.y - 1.5, r.x + r.w + 0.5, r.y + r.h + 1.5, 5), null, 0.3, 1 / 60), foamMat), false, true)).renderOrder = 3;
      grp.add(lit(new T.Mesh(flatGeo(T, roundRectPts(T, r.x + 1.2, r.y + 0.6, r.x + r.w - 1.2, r.y + r.h - 0.6, 4), null, 0.45, 1 / 60), sodaMat), false, true)).renderOrder = 4;
    });

    // boost belts
    h.boosts.forEach(function (bo) {
      const r = bo.r;
      grp.add(lit(ground(r.x - 2, r.y - 2, r.x + r.w + 2, r.y + r.h + 2, 0.24, boostEdge), false, true));
      m = ground(r.x, r.y, r.x + r.w, r.y + r.h, 0.3, boostMat, r.w / 20, r.h / 18);
      grp.add(m);
    });

    // tape spinners
    h.rotors.forEach(function (ro) {
      const rg = new T.Group(); rg.position.set(ro.x - CX, 0, ro.y - CZ);
      rg.add(lit(new T.Mesh(hubGeo, hubMat), true, true));
      rg.add(lit(new T.Mesh(hubCap, capMat), true, false));
      const bl = roundBox(T, ro.len - 3, BLADE_H, 6.4, 2);
      for (k = 0; k < ro.n; k++) {
        const arm = new T.Group(); arm.rotation.y = -k * TAU / ro.n;
        m = new T.Mesh(bl, six(tapeSide, tapeTop)); m.position.set(3 + (ro.len - 3) / 2, BLADE_H / 2 + 0.6, 0);
        arm.add(lit(m, true, true)); rg.add(arm);
      }
      grp.add(rg);
      const sh = new T.Mesh(unit, blobMat); sh.scale.set(ro.len * 2.3, 1, ro.len * 2.3); sh.position.set(rg.position.x + 2, 0.2, rg.position.z - 1);
      sh.renderOrder = 6; sh.visible = false; grp.add(sh); fake.push(sh);
      o.rotors.push({ ro: ro, grp: rg });
    });

    // the course sign behind the cup end
    let minY = 1e9, sx1 = 1e9, sx2 = -1e9;
    h.walls.forEach(function (r) { if (r.y < minY) minY = r.y; });
    h.walls.forEach(function (r) { if (r.y === minY && r.w >= r.h) { sx1 = Math.min(sx1, r.x); sx2 = Math.max(sx2, r.x + r.w); } });
    const sw = clamp(sx2 - sx1 + 6, 132, 178), shh = sw * 300 / 1024, scx = (sx1 + sx2) / 2 - CX, sz = minY - 20 - CZ, lean = 0.62;
    const sign = new T.Group(); sign.position.set(scx, 12, sz); sign.rotation.x = -lean;
    const face = new T.MeshBasicMaterial({ map: tex(signCanvas(script, i + 1, h.par)) });
    m = new T.Mesh(roundBox(T, sw, shh, 3.4, 1.6), [signSide, signSide, signSide, signSide, face, signSide]);
    m.position.y = shh / 2; sign.add(lit(m, true, false));
    grp.add(sign);
    [-1, 1].forEach(function (s) {
      m = new T.Mesh(postGeo, postMat); m.scale.set(1.5, 14 + BASE, 1.5); m.position.set(scx + s * (sw / 2 - 9), -BASE, sz - 2.5); grp.add(lit(m, true, false));
    });
    const ty = 12 + shh * Math.cos(lean), tz = sz - shh * Math.sin(lean);
    o.pts.push([scx - sw / 2, ty, tz], [scx + sw / 2, ty, tz]);

    scene.add(grp);
    return o;
  }

  const holes = [];
  for (let i = 0; i < HOLES.length; i++) holes.push(buildHole(i));

  /* things lying around the game room (scenery, nothing to hit) */
  (function () {
    const rnd = rng(8);
    const tapeGeo = roundBox(T, 34, 5.4, 19, 1.4);
    function boxPile(g, x, y, n, sc) {
      let top = -BASE;
      for (let k = 0; k < n; k++) {
        const w = (44 + rnd() * 16) * sc, d = (30 + rnd() * 8) * sc, hh = 7 + rnd() * 3, ci = Math.floor(rnd() * BOX_COLS.length);
        const m = new T.Mesh(roundBox(T, w, hh, d, 2.2), six(sideMats[ci], lidMat(boxCanvas(w, d, BOX_COLS[ci], script, k + x))));
        m.position.set(x - CX + (rnd() - 0.5) * 5, top + hh / 2, y - CZ + (rnd() - 0.5) * 5); m.rotation.y = (rnd() - 0.5) * 0.9;
        top += hh; g.add(lit(m, true, true));
      }
    }
    function tapePile(g, x, y, n) {
      for (let k = 0; k < n; k++) {
        const m = new T.Mesh(tapeGeo, six(tapeSide, tapeTop));
        m.position.set(x - CX + (rnd() - 0.5) * 4, -BASE + 2.7 + k * 5.4, y - CZ + (rnd() - 0.5) * 4); m.rotation.y = (rnd() - 0.5) * 0.8;
        g.add(lit(m, true, true));
      }
    }
    // [hole, kind, x, y, count, scale]: only where the carpet shows beside a green
    [[0, "b", 62, 196, 3, 1], [0, "t", 298, 150, 4], [0, "t", 60, 392, 2], [0, "b", 300, 366, 2, 0.9],
     [1, "b", 96, 232, 4, 1.25], [1, "t", 150, 128, 5], [1, "t", 68, 122, 2], [1, "b", 150, 290, 1, 1],
     [3, "t", 52, 200, 3], [3, "b", 312, 250, 3, 0.8], [3, "b", 50, 420, 2, 0.8], [3, "t", 310, 430, 2]].forEach(function (p) {
      if (p[1] === "b") boxPile(holes[p[0]].grp, p[2], p[3], p[4], p[5]); else tapePile(holes[p[0]].grp, p[2], p[3], p[4]);
    });
  })();

  /* ball */
  const ballMat = new T.MeshPhongMaterial({ map: tBall, specular: 0xffffff, shininess: 160, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.1 });
  const ball = lit(new T.Mesh(ballGeo, ballMat), true, false);
  scene.add(ball);
  const ballShadow = new T.Mesh(unit, blobMat); ballShadow.renderOrder = 6; ballShadow.visible = false; scene.add(ballShadow);

  /* splash rings on the soda */
  const ringGeo = new T.RingGeometry(0.82, 1, 28); ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < 3; i++) { const m = new T.Mesh(ringGeo, rippleMat.clone()); m.material._order = 5; m.renderOrder = 5; m.visible = false; scene.add(m); rings.push(m); }

  /* frame every hole: the closest camera that keeps the whole green, its rails and its sign on screen */
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
    let lo = 300, hi = 4000, best = null;
    for (let n = 0; n < 16; n++) {
      const mid = (lo + hi) / 2, c = centered(o.pts, mid);
      if (c.bb.x2 - c.bb.x1 <= SAFE.x2 - SAFE.x1 && c.bb.y2 - c.bb.y1 <= SAFE.y2 - SAFE.y1) { best = c; hi = mid; } else lo = mid;
    }
    return best || centered(o.pts, 4000);
  });

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, key: key, holes: holes, fit: fit, fake: fake,
    ball: ball, ballShadow: ballShadow, rings: rings, flagGeo: flagGeo, flagBase: flagBase, tBoost: tBoost, tSoda: tSoda,
    sinP: sinP, cosP: cosP,
    camPos: new T.Vector3(), camTgt: new T.Vector3(), goalPos: new T.Vector3(), goalTgt: new T.Vector3(), camReady: false,
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0,
    ballQ: new T.Quaternion(), lastBall: null, bpx: 0, bpy: 0,
    qa: new T.Quaternion(), axis: new T.Vector3(), up: new T.Vector3(0, 1, 0), v: new T.Vector3(), v2: new T.Vector3(),
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
  R.shakeMag = mag; R.shakeDur = R.shakeT = dur;
}

/* ---------------- Course <-> screen, through the 3D camera ---------------- */
// Course point of the current hole (at a height above the felt) -> HUD pixels.
function courseToScreen(x, y, hgt) {
  if (!R) return { x: x, y: y, ok: true };
  R.v.set(S.hole * HOLE_PITCH + x - CX, hgt || 0, y - CZ).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1 };
}
// HUD pixel -> the point of the felt under it (null above the horizon).
function screenToCourse(px, py) {
  const cam = R.camera;
  R.v.set(px / W * 2 - 1, 1 - py / H * 2, 0.5).unproject(cam);
  R.v2.copy(R.v).sub(cam.position);
  if (R.v2.y > -1e-6) return null;
  const t = -cam.position.y / R.v2.y;
  return { x: cam.position.x + R.v2.x * t - S.hole * HOLE_PITCH + CX, y: cam.position.z + R.v2.z * t + CZ };
}

/* ---------------- Game state -> meshes ---------------- */
function syncScene(state, fdt) {
  const idle = state === "title" || state === "over";
  const hi = S.hole, h = HOLES[hi], b = S.ball, ox = hi * HOLE_PITCH, t = S.holeT;
  let i, k;
  R.clock += fdt;

  /* moving pieces */
  for (i = 0; i < R.holes.length; i++) {
    const o = R.holes[i], show = i === hi || (S.mode === "slide" && i === hi - 1);
    o.grp.visible = show;
    if (!show) continue;
    for (k = 0; k < o.sliders.length; k++) {
      const sl = o.sliders[k], r = sliderRect(sl.s, t);
      sl.mesh.position.x = r.x + r.w / 2 - CX;
      sl.shadow.position.x = sl.mesh.position.x + 2.5;
    }
    for (k = 0; k < o.rotors.length; k++) o.rotors[k].grp.rotation.y = -rotorAngle(o.rotors[k].ro, t);
    for (k = 0; k < o.gates.length; k++) {
      const gt = o.gates[k], g = gt.g;
      // the flap swings clear for a ball going the right way, and hangs shut for one that is not
      const open = i === hi && inRect(b.x, b.y, g.r, BR + 1) && (b.vx * g.dx + b.vy * g.dy) >= 0 ? 1.35 : 0;
      gt.a += (open - gt.a) * Math.min(1, fdt * (open ? 26 : 7));
      gt.flap.rotation.x = gt.a;
      const bob = Shell.reduced ? 0 : Math.sin(R.clock * 5) * 1.5;
      gt.arrow.position.set(g.dx * bob, 0.2, g.dy * bob);
    }
    o.flag.position.y = i === hi ? V.flag * 30 : 0;
  }
  // the pin lifts out as the ball closes in on the cup
  const cd = Math.hypot(h.cup[0] - b.x, h.cup[1] - b.y);
  V.flag += ((cd < 34 || V.sunk ? 1 : 0) - V.flag) * Math.min(1, fdt * 7);
  if (!Shell.reduced) {
    const p = R.flagGeo.attributes.position, base = R.flagBase;
    for (i = 0; i < p.count; i++) {
      const fx = base[i * 3] - 0.6;
      p.setZ(i, Math.sin(fx * 0.42 - R.clock * 6.5) * fx * 0.075);
    }
    p.needsUpdate = true;
    R.tBoost.offset.y = -(R.clock * 1.7) % 1;
    R.tSoda.offset.set(Math.sin(R.clock * 0.35) * 0.05, (R.clock * 0.045) % 1);
  }

  /* ball */
  const ball = R.ball;
  const dx = b.x - R.bpx, dy = b.y - R.bpy, d = Math.hypot(dx, dy);
  if (R.lastBall === b && d > 1e-4 && d < 40) {             // roll without slipping (a jump that big is a re-spot, not a roll)
    R.axis.set(dy / d, 0, -dx / d);
    R.qa.setFromAxisAngle(R.axis, d / BR);
    R.ballQ.premultiply(R.qa);
  }
  R.lastBall = b; R.bpx = b.x; R.bpy = b.y;
  let scale = 1, rest = 0;
  if (V.sunk) {                                             // down into the cup, one rattle off the bottom
    V.vh -= 900 * fdt; V.h += V.vh * fdt;
    const floor = -(CUP_D - 0.5);
    if (V.h < floor) { V.h = floor; V.vh = V.vh < -70 ? -V.vh * 0.3 : 0; }
  } else if (V.pick > 0) {                                  // out of strokes: picked up
    V.pick = Math.min(1, V.pick + fdt * 1.6);
    V.h = V.pick * V.pick * 46; scale = Math.max(0.001, 1 - V.pick * 0.9);
  } else {
    if (S.mode === "slide" && S.slide > 0.3 && !idle) { /* held over the new tee until the camera gets there */ }
    else if (V.h > 0 || V.vh !== 0) {                       // set down on the felt, or popped up by a hard knock
      V.vh -= 900 * fdt; V.h += V.vh * fdt;
      if (V.h <= 0) { V.h = 0; V.vh = V.vh < -80 ? -V.vh * 0.32 : 0; }
    }
    if (cd < CUP_R) rest = -(1 - cd / CUP_R) * 3.2;         // tipping over the lip
    else for (i = 0; i < h.sand.length; i++) if (inRect(b.x, b.y, h.sand[i])) { rest = -1.3; break; }
  }
  const showBall = !(S.mode === "done" && V.pick >= 1);
  ball.visible = showBall;
  ball.position.set(ox + b.x - CX, BR + V.h + rest, b.y - CZ);
  ball.scale.setScalar(scale);
  ball.quaternion.copy(R.ballQ);
  const bs = R.ballShadow;
  bs.visible = !R.shadowsOn && showBall && !V.sunk;
  if (bs.visible) {
    const sk = clamp(1 - V.h / 40, 0.35, 1) * scale;
    bs.position.set(ball.position.x + 1.5 + V.h * 0.4, 0.5, ball.position.z - 1 - V.h * 0.2);
    bs.scale.set(13 * sk, 1, 13 * sk);
  }

  /* splash rings */
  for (i = 0; i < R.rings.length; i++) {
    const rg = R.rings[i], rp = V.ripples[i];
    if (!rp || rp.t > 0.8) { rg.visible = false; continue; }
    rp.t += fdt;
    const u = rp.t / 0.8;
    rg.visible = true;
    rg.position.set(rp.hole * HOLE_PITCH + rp.x - CX, 0.6, rp.y - CZ);
    rg.scale.setScalar(3 + u * 11);
    rg.material.opacity = 0.85 * (1 - u);
  }

  /* camera: the whole hole while you aim, leaning after the ball as it rolls, in on the cup when it drops,
     then a flight over the carpet to the next tee */
  const f = R.fit[hi], gp = R.goalPos, gt2 = R.goalTgt;
  let tx = f.tx, tz = f.tz, dist = f.d, rate = 5.5;
  if (idle) {
    if (!Shell.reduced) { tx += Math.sin(idleT * 0.45) * 10; dist *= 1 + Math.sin(idleT * 0.31) * 0.012; }
    rate = 3;
  } else if (S.mode === "roll") {
    tx += (b.x - CX - tx) * 0.28; tz += (b.y - CZ - tz) * 0.28; dist *= 0.94; rate = 3.2;
  } else if (S.mode === "done" && V.sunk) {
    tx += (h.cup[0] - CX - tx) * 0.5; tz += (h.cup[1] - CZ - tz) * 0.5; dist *= 0.8; rate = 2.4;
  }
  gt2.set(ox + tx, 0, tz); gp.set(ox + tx, dist * R.sinP, tz + dist * R.cosP);
  if (V.snap || !R.camReady) {
    R.camPos.copy(gp); R.camTgt.copy(gt2); V.snap = false; R.camReady = true;
  } else if (S.mode === "slide" && V.from && !idle) {
    const e = clamp(1 - S.slide, 0, 1), ke = e * e * (3 - 2 * e), arc = Math.sin(Math.PI * ke);
    R.camPos.lerpVectors(V.from.pos, gp, ke); R.camTgt.lerpVectors(V.from.tgt, gt2, ke);
    if (!Shell.reduced) { R.camPos.y += arc * 70; R.camPos.z += arc * 60; }
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

  /* the shadow light rides along with the hole on screen */
  const lx = S.mode === "slide" ? R.camTgt.x : ox;
  R.key.position.set(lx - 230, 340, 120); R.key.target.position.set(lx, 0, -20);
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
function fmt(n) { return n === 0 ? "E" : n > 0 ? "+" + n : String(n); }
function powerColor(p) { return p < 0.45 ? "#3fe0ff" : p < 0.8 ? "#ffd21f" : "#ff3b2e"; }

function drawAim(c) {
  const b = S.ball, shot = dragShot();
  let a, p;
  if (shot) { a = shot.a; p = shot.p; }
  else if (S.kb && canShoot()) { a = S.aim; p = S.charging ? S.power : 0; }
  else {
    // nothing being aimed yet: a quiet ring so the ball is easy to find on the green
    if (canShoot() && !Shell.reduced) {
      const s0 = courseToScreen(b.x, b.y, 0), s1 = courseToScreen(b.x + BR, b.y, 0), rr = Math.abs(s1.x - s0.x);
      const u = (S.t * 0.9) % 1;
      c.lineWidth = 1.5; c.strokeStyle = "rgba(255,255,255," + (0.75 * (1 - u)).toFixed(3) + ")";
      c.beginPath(); c.ellipse(s0.x, s0.y, rr * (1.5 + u * 1.6), rr * (1.5 + u * 1.6) * R.sinP, 0, 0, TAU); c.stroke();
    }
    return;
  }
  const dx = Math.cos(a), dy = Math.sin(a), s0 = courseToScreen(b.x, b.y, 0.5);
  if (shot) {                                               // the pull band, back toward the finger
    const s1 = courseToScreen(b.x - dx * p * 60, b.y - dy * p * 60, 0.5);
    c.lineCap = "round";
    c.lineWidth = 4; c.strokeStyle = "rgba(8,32,95,.55)"; c.beginPath(); c.moveTo(s0.x, s0.y); c.lineTo(s1.x, s1.y); c.stroke();
    c.lineWidth = 2; c.strokeStyle = "rgba(255,255,255,.8)"; c.beginPath(); c.moveTo(s0.x, s0.y); c.lineTo(s1.x, s1.y); c.stroke();
  }
  const len = 26 + p * 130, col = powerColor(p), px1 = courseToScreen(b.x + 1, b.y, 0.5);
  const unit = Math.max(0.5, Math.abs(px1.x - s0.x));       // pixels per course unit at the ball
  for (let d = 10; d < len; d += 8) {
    const q = courseToScreen(b.x + dx * d, b.y + dy * d, 0.5), last = d + 8 >= len, r = (last ? 2.6 : 1.9) * unit;
    c.fillStyle = "rgba(8,32,95,.6)"; c.beginPath(); c.arc(q.x, q.y, r + 1, 0, TAU); c.fill();
    c.fillStyle = last ? col : "#ffffff"; c.beginPath(); c.arc(q.x, q.y, r, 0, TAU); c.fill();
  }
  const e = courseToScreen(b.x + dx * len, b.y + dy * len, 0.5);
  c.fillStyle = "#08205f"; c.beginPath(); c.arc(e.x, e.y, 4.4 * unit, 0, TAU); c.fill();
  c.fillStyle = col; c.beginPath(); c.arc(e.x, e.y, 3.2 * unit, 0, TAU); c.fill();
}

function drawPower(c) {
  const shot = dragShot();
  const p = shot ? shot.p : (S.charging ? S.power : -1);
  if (p < 0) return;
  const x = 12, top = 356, hgt = 150, pc = clamp(p, 0, 1);
  rrect(c, x - 3, top - 3, 20, hgt + 6, 6); c.fillStyle = "rgba(8,32,95,.82)"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = "#ffffff"; c.stroke();
  c.save(); rrect(c, x, top, 14, hgt, 4); c.clip();
  c.fillStyle = "#12296e"; c.fillRect(x, top, 14, hgt);
  c.fillStyle = powerColor(pc);
  c.fillRect(x, top + hgt * (1 - pc), 14, hgt * pc);
  c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(x + 2, top, 3, hgt);
  c.restore();
  txt(c, Math.round(pc * 100) + "%", x + 7, top + hgt + 6, 9, "#ffffff", "center", "#08205f");
}

function drawHUD(c, state) {
  const h = HOLES[S.hole];
  const bg = c.createLinearGradient(0, 0, 0, 74);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, 0, W, 74);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff9214"; c.fillRect(0, 74, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, 76, W, 1);
  // the card: one box a hole, strokes under the hole number
  let x = 4, used = 0, par = 0, i;
  for (i = 0; i < HOLES.length; i++) {
    const w = 30, cur = i === S.hole && state !== "over", s = S.card[i];
    rrect(c, x, 4, w - 1, 38, 3);
    c.fillStyle = cur ? "#fff3a8" : "#ffffff"; c.fill();
    c.lineWidth = cur ? 2 : 1; c.strokeStyle = cur ? "#ff9214" : "#08205f"; c.stroke();
    txt(c, String(i + 1), x + 3, 6, 7, "#6d86c4");
    txt(c, "P" + HOLES[i].par, x + w - 4, 6, 7, "#6d86c4", "right");
    if (s != null) {
      const d = s - HOLES[i].par;
      txt(c, String(s), x + w / 2 - 0.5, 19, 15, d < 0 ? "#0a8f2f" : d === 0 ? "#0b1f5c" : "#e3231a", "center");
      used += s; par += HOLES[i].par;
    } else if (cur && S.strokes > 0) txt(c, String(S.strokes), x + w / 2 - 0.5, 19, 15, "#9aa9cf", "center");
    x += w + 1;
  }
  const rel = used - par;
  rrect(c, x, 4, W - 4 - x, 38, 3); c.fillStyle = "#08205f"; c.fill();
  c.lineWidth = 1; c.strokeStyle = "#ffe45c"; c.stroke();
  txt(c, "TOTAL", x + (W - 4 - x) / 2, 7, 8, "#a8ecff", "center");
  txt(c, fmt(rel), x + (W - 4 - x) / 2, 19, 17, rel <= 0 ? "#b6ff4a" : "#ffc1e0", "center");
  txt(c, "HOLE " + (S.hole + 1) + "/9   PAR " + h.par, 8, 46, 10, "#ffffff", "left", "#08205f");
  txt(c, h.name, 8, 59, 10, "#ffe45c", "left", "#08205f");
  txt(c, "STROKE " + S.strokes + "/" + MAX_STROKES, W - 8, 46, 10, "#ffffff", "right", "#08205f");
  const hb = bests[S.hole];
  txt(c, "HOLE BEST " + (hb == null ? "-" : hb), W - 8, 59, 10, "#a8ecff", "right", "#08205f");
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
  drawHUD(c, state);
  if (state === "playing" && S.mode === "aim") drawPower(c);
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
  // the shell canvas becomes a clear HUD layer over the 3D view
  hud.style.background = "transparent";
  if (getComputedStyle(hud).position === "static") hud.style.position = "relative";   // so it stacks above the WebGL canvas
  const crt = stage.querySelector(".np-crt");
  if (crt) crt.style.display = "none";                       // glossy course, no scanlines
  R.lastT = performance.now();
  layout();
}

function startGame() {
  Shell.init({
    slug: "shelf-links",
    title: "SHELF LINKS",
    accent: "#9bff3f",
    width: W, height: H,
    lowerIsBetter: true,
    format: fmt,
    howTo: "Nine holes of mini golf in real 3D, built out of game boxes, shelves and tape decks. Drag back from anywhere, then let go to putt.",
    keys: "Keys: arrows aim, hold Space to charge, release to putt. P pause, M mute, N music, R restart.",
    tip: "Max 6 strokes a hole. Spilled soda costs you one.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { if (paused) return; idleT += dt; S.t += dt; S.holeT += dt; updateParts(dt); },   // spinners and sliders freeze while paused
    onPause: function () { paused = true; keys = {}; S.drag = null; S.charging = false; },
    onResume: function () { paused = false; }
  });
  attach();
  Juke.hook();                                              // sound: nothing starts until the first tap
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

// Hook for automated course checks (no effect on play)
window.__shelfLinks = { S: function () { return S; }, HOLES: HOLES, advance: advance, R: BR, V_MIN: V_MIN, V_MAX: V_MAX, MAX_PULL: MAX_PULL, STOP: STOP,
                        shoot: shoot, gfx: function () { return R; }, view: function () { return V; }, toScreen: courseToScreen, toCourse: screenToCourse, juke: Juke, music: startMusic };

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
      // hold the logo for a beat, then hand over to the title card
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
        ? "Shelf Links could not load its 3D engine (" + THREE_URL + ")."
        : "Shelf Links needs WebGL for its 3D course, and this browser has it switched off or does not support it.");
    });
})();
