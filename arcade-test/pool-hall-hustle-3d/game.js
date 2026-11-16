/* POOL HALL HUSTLE (3D): an original Nostalgia Pro pool hall. Rack 'em up against Velvet Rhett, the house hustler.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a WebGL canvas that
   sits directly under the shell's 2D canvas. The shell canvas stays in charge of input, scaling and the
   title / pause / game over flow, and carries the HUD.

   Units are inches and seconds. The table is a 9 foot table: a 100 x 50 inch bed, 2 1/4 inch balls.
   Physics runs on the bed: x along the table (foot spot at +25, head string at -25), y across it.
   In three.js space a bed point (x, y) sits at (x, TABLE_Y + height, -y).

   Everything here is original: the hall, the table, the people, the art and the music are made in code.
   The only image files are the two Nostalgia Pro Games logo files. */

const W = 360, H = 540, TAU = Math.PI * 2, DEG = Math.PI / 180;
const BR = 1.125;                                     // ball radius (2 1/4 inch balls)
const HL = 50, HW = 25;                               // half length, half width of the bed, measured to the cushion noses
const TABLE_Y = 30.5;                                 // cloth height above the floor
const GRAV = 386;                                     // in/s^2
const MU_SLIDE = 0.2, MU_ROLL = 0.0115, ROLL_DRAG = 0.075, SPIN_DECAY = 24;   // cloth: sliding friction, rolling drag (+ a little per in/s), side spin fade (rad/s^2)
const E_BALL = 0.94, E_RAIL = 0.74;
const V_MIN = 18, V_MAX = 345;                        // cue ball speed off the tip, in/s
const MAX_TIP = 0.55;                                 // furthest the tip can strike from center, as a fraction of the radius
const CM = 3.55, SM = 2.85;                           // corner jaw distance from the corner along each rail; half the side mouth
const RAIL_W = 7.4, CUSH_W = 2.1, RAIL_TOP = 1.85;    // wood rail width, cushion depth, rail height over the cloth
const FOOT_SPOT = 25, HEAD_STRING = -25;

const LOGO_URL = "np_games_logo.png";                 // the full studio logo: splash, title and score card
const SCRIPT_URL = "np_games_script.png";             // the script wordmark: every decal inside the hall
const THREE_URL = "../shared/three.module.min.js";
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';
const RIVAL = "VELVET RHETT";
const GROUP_NAME = { solid: "SOLIDS", stripe: "STRIPES" };
const BALL_COLS = ["#fbfaf2", "#ffc61a", "#1d4fd8", "#e3231a", "#5b2a9e", "#ff7a12", "#13874a", "#8a1c22", "#141414",
                   "#ffc61a", "#1d4fd8", "#e3231a", "#5b2a9e", "#ff7a12", "#13874a", "#8a1c22"];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
// The picture and the opponent roll their own dice, so a replay of the same shot always plays out the same.
const vrand = (function () { let s = 0x2545F491; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; })();
function gauss() { let u = 0; for (let i = 0; i < 4; i++) u += vrand(); return (u - 2) * 1.73; }
function money(n) { return (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US"); }

/* ---------------- The table: cushions, jaws and pockets ---------------- */
// Cushion noses are line segments; balls bounce off them (and off the jaws that lead into each pocket).
// A ball whose center reaches a pocket's capture circle is in.
const SEGS = [], POCKETS = [];
(function buildTable() {
  function seg(x1, y1, x2, y2, jaw) { SEGS.push({ x1: x1, y1: y1, x2: x2, y2: y2, jaw: !!jaw }); }
  const J = 3.4;                                        // jaw length into the pocket
  // long rails (y = -HW and y = +HW), two pieces each, split by the side pockets
  [-1, 1].forEach(function (sy) {
    seg(-HL + CM, sy * HW, -SM, sy * HW); seg(SM, sy * HW, HL - CM, sy * HW);
    seg(-SM, sy * HW, -SM + 0.45, sy * (HW + 3.1), true); seg(SM, sy * HW, SM - 0.45, sy * (HW + 3.1), true);
  });
  // short rails
  [-1, 1].forEach(function (sx) { seg(sx * HL, -HW + CM, sx * HL, HW - CM); });
  // corner jaws: both run parallel to the line out of the corner, so the throat is a channel about 5 in wide
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) {
    const ox = c[0] * Math.SQRT1_2 * J, oy = c[1] * Math.SQRT1_2 * J;
    const ax = c[0] * (HL - CM), ay = c[1] * HW, bx = c[0] * HL, by = c[1] * (HW - CM);
    seg(ax, ay, ax + ox, ay + oy, true); seg(bx, by, bx + ox, by + oy, true);
  });
  // pockets, in order around the table: bottom left, bottom side, bottom right, top right, top side, top left
  function corner(sx, sy) {
    const mx = sx * (HL - CM / 2), my = sy * (HW - CM / 2), k = 2.2 * Math.SQRT1_2;
    POCKETS.push({ corner: true, sx: sx, sy: sy, mx: mx, my: my, cx: mx + sx * k, cy: my + sy * k, r: 2.05,
                   vx: sx * (HL + 1.3), vy: sy * (HW + 1.3), ax: sx * (HL - CM * 0.52), ay: sy * (HW - CM * 0.52) });
  }
  function side(sy) {
    POCKETS.push({ corner: false, sx: 0, sy: sy, mx: 0, my: sy * HW, cx: 0, cy: sy * (HW + 2.25), r: 2.0,
                   vx: 0, vy: sy * (HW + 2.55), ax: 0, ay: sy * (HW - 0.2) });
  }
  corner(-1, -1); side(-1); corner(1, -1); corner(1, 1); side(1); corner(-1, 1);
})();
// vx/vy: where the pocket's cup sits for the picture. ax/ay: the spot the opponent aims an object ball at.

/* ---------------- Balls ---------------- */
function mkBall(id, x, y) { return { id: id, x: x, y: y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true, sink: null }; }
function isSolid(n) { return n >= 1 && n <= 7; }
function isStripe(n) { return n >= 9 && n <= 15; }
function groupOf(n) { return isSolid(n) ? "solid" : isStripe(n) ? "stripe" : null; }

function rack8() {
  // a tight triangle, apex on the foot spot pointing at the head of the table; 8 in the middle,
  // a solid and a stripe in the two back corners, the rest shuffled
  const balls = [mkBall(0, -30, 4)];
  const solids = [1, 2, 3, 4, 5, 6, 7], stripes = [9, 10, 11, 12, 13, 14, 15];
  shuffle(solids); shuffle(stripes);
  const cornerA = vrand() < 0.5 ? solids.pop() : stripes.pop();
  const cornerB = isSolid(cornerA) ? stripes.pop() : solids.pop();
  const rest = solids.concat(stripes); shuffle(rest);
  const pos = triangle(5);
  for (let i = 0; i < pos.length; i++) {
    const p = pos[i];
    let n;
    if (p.row === 2 && p.col === 1) n = 8;
    else if (p.row === 4 && p.col === 0) n = cornerA;
    else if (p.row === 4 && p.col === 4) n = cornerB;
    else n = rest.pop();
    balls[n] = mkBall(n, p.x, p.y);
  }
  return balls;
}
function rack9() {
  // a diamond: 1 on the foot spot, 9 in the middle, the rest shuffled
  const balls = [mkBall(0, -30, 4)];
  const rest = [2, 3, 4, 5, 6, 7, 8]; shuffle(rest);
  const rows = [1, 2, 3, 2, 1], dx = BR * Math.sqrt(3) + 0.004;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < rows[r]; c++) {
      const x = FOOT_SPOT + r * dx, y = (c - (rows[r] - 1) / 2) * (2 * BR + 0.004);
      let n;
      if (r === 0) n = 1; else if (r === 2 && c === 1) n = 9; else n = rest.pop();
      balls[n] = mkBall(n, x, y);
    }
  }
  return balls;
}
function triangle(rowsN) {
  const out = [], dx = BR * Math.sqrt(3) + 0.004;
  for (let r = 0; r < rowsN; r++) for (let c = 0; c <= r; c++) out.push({ row: r, col: c, x: FOOT_SPOT + r * dx, y: (c - r / 2) * (2 * BR + 0.004) });
  return out;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(vrand() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

/* ---------------- Ball physics ----------------
   Each ball carries a velocity and a full spin (wx, wy around the bed's axes, wz around the vertical).
   The cloth drags on the ball's contact point: while that point slips the ball slides (and its spin works
   on it: draw, follow, stun), once it stops slipping the ball rolls. Ball on ball is an elastic hit along
   the line of centers that leaves each ball's spin alone, which is what makes draw and follow work.
   Side spin bends a ball's angle off a cushion. */
function cloth(b, dt) {
  const ux = b.vx - BR * b.wy, uy = b.vy + BR * b.wx, us = Math.hypot(ux, uy);
  if (us > 0.04) {
    const a = MU_SLIDE * GRAV, need = 3.5 * a * dt, k = need > us ? us / need : 1;
    const ex = ux / us, ey = uy / us;
    b.vx -= a * ex * dt * k; b.vy -= a * ey * dt * k;
    b.wx -= 2.5 * a * ey / BR * dt * k; b.wy += 2.5 * a * ex / BR * dt * k;
  } else {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
      let dec = MU_ROLL * GRAV + ROLL_DRAG * sp;
      if (sp < 7) dec *= 1 + (7 - sp) * 0.45;            // a slow ball settles instead of creeping for ages
      const ns = Math.max(0, sp - dec * dt);
      b.vx *= ns / sp; b.vy *= ns / sp;
    }
    b.wx = -b.vy / BR; b.wy = b.vx / BR;
  }
  if (b.wz) b.wz = Math.sign(b.wz) * Math.max(0, Math.abs(b.wz) - SPIN_DECAY * dt);
  if (Math.abs(b.vx) + Math.abs(b.vy) < 0.35 && Math.abs(b.vx - BR * b.wy) + Math.abs(b.vy + BR * b.wx) < 0.35) {
    b.vx = b.vy = b.wx = b.wy = 0;
  }
}
function moving(b) { return b.on && (b.vx !== 0 || b.vy !== 0 || b.wx !== 0 || b.wy !== 0); }

// The tip meets the cue ball: ang is the aim (radians on the bed), v0 the speed, tx the side offset
// (+ = right English), ty the height offset (+ = follow), both as fractions of the radius.
function strike(b, ang, v0, tx, ty) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  b.vx = dx * v0; b.vy = dy * v0;
  b.wx = -2.5 * v0 * ty * dy / BR; b.wy = 2.5 * v0 * ty * dx / BR;   // ty = 0.4 is a natural roll
  b.wz = -2.5 * v0 * tx / BR;
}

// One physics step over the whole table. ev collects what happened (for the rules and the sounds).
function physStep(balls, dt, ev) {
  let i, j, a, b;
  for (i = 0; i < balls.length; i++) {
    a = balls[i];
    if (!a || !a.on) continue;
    if (a.vx || a.vy || a.wx || a.wy || a.wz) cloth(a, dt);
    a.x += a.vx * dt; a.y += a.vy * dt;
  }
  for (let pass = 0; pass < 2; pass++) {
    for (i = 0; i < balls.length; i++) {
      a = balls[i];
      if (!a || !a.on) continue;
      for (j = i + 1; j < balls.length; j++) {
        b = balls[j];
        if (!b || !b.on) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= 4 * BR * BR || d2 < 1e-9) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = 2 * BR - d;
        a.x -= nx * pen / 2; a.y -= ny * pen / 2; b.x += nx * pen / 2; b.y += ny * pen / 2;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const jj = -(1 + E_BALL) * rv / 2;
          a.vx -= jj * nx; a.vy -= jj * ny; b.vx += jj * nx; b.vy += jj * ny;
          // a little cloth-free throw: the spin each ball carries nudges the other along the tangent
          const tx = -ny, ty = nx, slip = (a.wz + b.wz) * BR * 0.012;
          b.vx += tx * slip; b.vy += ty * slip; a.vx -= tx * slip * 0.5; a.vy -= ty * slip * 0.5;
          if (ev) ev.hit(a, b, -rv);
        }
      }
    }
  }
  for (i = 0; i < balls.length; i++) {
    a = balls[i];
    if (!a || !a.on) continue;
    // the cushions, and the jaws
    if (Math.abs(a.x) > HL - BR - 0.01 || Math.abs(a.y) > HW - BR - 0.01) {
      for (j = 0; j < SEGS.length; j++) {
        const s = SEGS[j], ex = s.x2 - s.x1, ey = s.y2 - s.y1, l2 = ex * ex + ey * ey;
        const u = clamp(((a.x - s.x1) * ex + (a.y - s.y1) * ey) / l2, 0, 1);
        const px = s.x1 + ex * u, py = s.y1 + ey * u, dx = a.x - px, dy = a.y - py, d2 = dx * dx + dy * dy;
        if (d2 >= BR * BR) continue;
        const d = Math.sqrt(d2) || 1e-4, nx = dx / d, ny = dy / d;
        a.x += nx * (BR - d); a.y += ny * (BR - d);
        const vn = a.vx * nx + a.vy * ny;
        if (vn < 0) {
          const tx = -ny, ty = nx;
          let vt = a.vx * tx + a.vy * ty;
          vt = vt * 0.9 + BR * a.wz * 0.22;                 // English grabs the rubber
          const out = -vn * E_RAIL;
          a.vx = nx * out + tx * vt; a.vy = ny * out + ty * vt;
          a.wz *= 0.55; a.wx *= 0.3; a.wy *= 0.3;
          if (ev) ev.rail(a, -vn, s.jaw);
        }
      }
    }
    // the pockets
    for (j = 0; j < POCKETS.length; j++) {
      const p = POCKETS[j], dx = a.x - p.cx, dy = a.y - p.cy;
      if (dx * dx + dy * dy < p.r * p.r || (Math.abs(a.x) > HL + 2.6 || Math.abs(a.y) > HW + 2.6) && dx * dx + dy * dy < 30) {
        a.on = false;
        a.sink = { p: j, t: 0, x: a.x, y: a.y, vx: a.vx, vy: a.vy };
        if (ev) ev.pocket(a, j);
        break;
      }
    }
  }
}
// Advance the table by dt with substeps sized to the fastest ball, so nothing ever skips through anything.
function advance(balls, dt, ev) {
  let vmax = 0;
  for (let i = 0; i < balls.length; i++) { const b = balls[i]; if (b && b.on) vmax = Math.max(vmax, Math.abs(b.vx) + Math.abs(b.vy)); }
  const n = clamp(Math.ceil(vmax * dt / (BR * 0.45)), 1, 60), sdt = dt / n;
  for (let i = 0; i < n; i++) physStep(balls, sdt, ev);
}
function anyMoving(balls) { for (let i = 0; i < balls.length; i++) if (balls[i] && moving(balls[i])) return true; return false; }
function cloneBalls(balls) { return balls.map(function (b) { return b ? { id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, wx: b.wx, wy: b.wy, wz: b.wz, on: b.on, sink: null } : b; }); }

// Ball in hand: is this a legal spot for the cue ball?
function spotFree(balls, x, y, kitchen) {
  if (Math.abs(x) > HL - BR - 0.05 || Math.abs(y) > HW - BR - 0.05) return false;
  if (kitchen && x > HEAD_STRING) return false;
  for (let i = 1; i < balls.length; i++) { const b = balls[i]; if (b && b.on && Math.hypot(b.x - x, b.y - y) < 2 * BR + 0.05) return false; }
  return true;
}
// Nearest legal spot to (x, y), found by pushing out of whatever it overlaps.
function nearestFree(balls, x, y, kitchen) {
  for (let it = 0; it < 24; it++) {
    x = clamp(x, -HL + BR + 0.1, (kitchen ? HEAD_STRING : HL - BR - 0.1));
    y = clamp(y, -HW + BR + 0.1, HW - BR - 0.1);
    let moved = false;
    for (let i = 1; i < balls.length; i++) {
      const b = balls[i];
      if (!b || !b.on) continue;
      const dx = x - b.x, dy = y - b.y, d = Math.hypot(dx, dy);
      if (d < 2 * BR + 0.08) { const k = (2 * BR + 0.1 - d) / (d || 1); x += (d ? dx : 1) * k; y += (d ? dy : 0) * k; moved = true; }
    }
    if (!moved) break;
  }
  return spotFree(balls, x, y, kitchen) ? { x: x, y: y } : null;
}
// First ball the cue ball would touch going along ang, and where it would be when it does (for the aim guide).
function firstContact(balls, ang) {
  const c = balls[0], dx = Math.cos(ang), dy = Math.sin(ang);
  let best = null, bt = 1e9;
  for (let i = 1; i < balls.length; i++) {
    const b = balls[i];
    if (!b || !b.on) continue;
    const ox = b.x - c.x, oy = b.y - c.y, t = ox * dx + oy * dy;
    if (t <= 0) continue;
    const perp2 = ox * ox + oy * oy - t * t, rr = 4 * BR * BR;
    if (perp2 > rr) continue;
    const tt = t - Math.sqrt(rr - perp2);
    if (tt < bt) { bt = tt; best = b; }
  }
  // distance to the cushion line, for when nothing is in the way
  let tr = 1e9;
  if (dx > 1e-6) tr = Math.min(tr, (HL - BR - c.x) / dx); if (dx < -1e-6) tr = Math.min(tr, (-HL + BR - c.x) / dx);
  if (dy > 1e-6) tr = Math.min(tr, (HW - BR - c.y) / dy); if (dy < -1e-6) tr = Math.min(tr, (-HW + BR - c.y) / dy);
  if (best && bt < tr) return { ball: best, t: bt, x: c.x + dx * bt, y: c.y + dy * bt };
  return { ball: null, t: tr, x: c.x + dx * tr, y: c.y + dy * tr };
}

/* ---------------- Game state ---------------- */
let S = {}, keys = {}, idleT = 0, parts = [], floats = [], paused = false;
let MODE = "8";                                       // "8" or "9", picked on the title card and remembered
let THREE = null, R = null, TV = null;                // R holds everything the renderer owns
// V is how things are being shown (camera, people, cue). It never feeds the rules.
const V = { view: "cue", userView: "cue", cueBack: 0, strokeOff: 0, react: 0, reactKind: "", cheer: 0, sinkFx: [] };

function stakeFor(rack) { return 20 * Math.pow(2, rack); }

function reset() {
  paused = false;
  S = { mode: MODE, race: MODE === "8" ? 2 : 3, rack: 0, won: [0, 0], breaker: 0, bank: 100, t: 0,
        stats: { potted: 0, bestRun: 0, banks: 0, combos: 0, fouls: 0, rivalFouls: 0, shots: 0, breakRuns: 0, racks: [] },
        firstRackLost: false, lostARack: false };
  parts.length = 0; floats.length = 0;
  ledClear();
  newRack();
}

function newRack() {
  S.balls = S.mode === "8" ? rack8() : rack9();
  S.stake = stakeFor(S.rack);
  S.turn = S.breaker;
  S.groups = [null, null]; S.open = true;
  S.breakShot = true; S.ballInHand = true; S.kitchen = true;
  S.aim = 0; S.tipX = 0; S.tipY = 0; S.power = 0; S.charging = false; S.chargeT = 0; S.drag = null; S.kb = false;
  S.run = 0; S.rivalTurns = 0; S.playerFoulThisRack = false;
  S.shot = null; S.plan = null; S.planner = null; S.lastPot = 0; S.taunted = false;
  S.balls[0].x = -32; S.balls[0].y = S.mode === "8" ? 3.5 : -2.5;
  aimAtRack();
  setPhase("intro");
  V.sinkFx.length = 0;
  ledPlay([ledMsg("slide", "RACK " + (S.rack + 1) + "  " + money(S.stake), 2.2, { color: "yellow" }),
           ledMsg("cycle", S.breaker === 0 ? "YOUR BREAK" : RIVAL + " BREAKS", 2.2)]);
  hallSfx("rack");
}
function aimAtRack() { const c = S.balls[0], t = S.balls[1] && S.balls[1].on ? S.balls[1] : S.balls[0]; S.aim = Math.atan2((S.mode === "8" ? 0 : t.y) - c.y, FOOT_SPOT - c.x); }
function setPhase(ph) { S.phase = ph; S.pt = 0; }

function lowestBall() { for (let i = 1; i < S.balls.length; i++) if (S.balls[i] && S.balls[i].on) return i; return 0; }
function groupLeft(g) { let n = 0; for (let i = 1; i < S.balls.length; i++) if (S.balls[i] && S.balls[i].on && groupOf(i) === g) n++; return n; }
function onEight(who) { return S.mode === "8" && !!S.groups[who] && groupLeft(S.groups[who]) === 0; }
// What the shooter may hit first right now.
function legalTargets(who) {
  const out = [];
  if (S.mode === "9") { const l = lowestBall(); if (l) out.push(l); return out; }
  if (S.breakShot) return [1];
  for (let i = 1; i < S.balls.length; i++) {
    const b = S.balls[i];
    if (!b || !b.on) continue;
    if (S.open) { if (i !== 8) out.push(i); }
    else if (onEight(who)) { if (i === 8) out.push(i); }
    else if (groupOf(i) === S.groups[who]) out.push(i);
  }
  return out;
}
// A snapshot of what the rules need to know about the table before a shot.
function shotState(who) {
  return { mode: S.mode, groups: S.groups.slice(), open: S.open, breakShot: S.breakShot, onEight: onEight(who), lowest: lowestBall() };
}
function firstOk(id, who, st) {
  if (st.mode === "9") return id === st.lowest;
  if (st.open) return id !== 8;
  if (st.onEight) return id === 8;
  return groupOf(id) === st.groups[who];
}
// The ruling on a shot. rec: { first, potted[], cue, railAfter }. Pure: the opponent uses it to judge shots it imagines.
function ruling(rec, who, st) {
  const pots = rec.potted.filter(function (id) { return id !== 0; });
  const r = { foul: false, why: "", win: false, lose: false, cont: false, assign: null, own: [], respot: 0 };
  if (rec.cue) { r.foul = true; r.why = "SCRATCH"; }
  else if (rec.first === null) { r.foul = true; r.why = "MISSED EVERYTHING"; }
  else if (!st.breakShot && !firstOk(rec.first, who, st)) { r.foul = true; r.why = st.mode === "9" ? "HIT THE " + st.lowest + " FIRST" : st.open ? "NOT THE 8 FIRST" : "WRONG BALL FIRST"; }
  else if (!st.breakShot && !rec.railAfter && !pots.length) { r.foul = true; r.why = "NO RAIL AFTER CONTACT"; }
  if (st.mode === "8") {
    if (pots.indexOf(8) >= 0) {
      if (st.breakShot) r.respot = 8;                         // the 8 on the break comes back up
      else if (!st.onEight || r.foul) { r.lose = true; r.why = r.foul ? "SCRATCHED ON THE 8" : "8 BALL TOO EARLY"; return r; }
      else { r.win = true; r.why = "8 BALL IN"; return r; }
    }
    if (r.foul) return r;
    let g = st.groups[who];
    if (st.breakShot) { r.own = pots.filter(function (id) { return id !== 8; }); r.cont = r.own.length > 0; return r; }
    if (st.open) { for (let i = 0; i < pots.length; i++) if (pots[i] !== 8) { r.assign = g = groupOf(pots[i]); break; } }
    if (g) r.own = pots.filter(function (id) { return groupOf(id) === g; });
    r.cont = r.own.length > 0;
    return r;
  }
  if (pots.indexOf(9) >= 0) {
    if (r.foul) r.respot = 9;
    else { r.win = true; r.why = st.breakShot ? "9 ON THE BREAK" : "9 BALL IN"; r.own = pots; return r; }
  }
  if (!r.foul) { r.own = pots.filter(function (id) { return id !== 9; }); r.cont = r.own.length > 0; }
  return r;
}

/* ---------------- Taking a shot ---------------- */
function beginShot(who, ang, power, tx, ty) {
  const c = S.balls[0];
  S.shotFrom = { x: c.x, y: c.y };
  S.shotSt = shotState(who);
  S.shot = { who: who, first: null, potted: [], cue: false, railAfter: false, objRail: {}, hitBy: {}, power: power, maxHit: 0 };
  strike(c, ang, V_MIN + clamp(power, 0, 1) * (V_MAX - V_MIN), tx, ty);
  S.ballInHand = false;
  if (who === 0) S.stats.shots++;
  hallSfx("cue", power);
  if (S.breakShot) { hallSfx("crowdUp"); camShake(power > 0.7 ? 0.5 : 0.2, 0.25); ledPlay([ledMsg("flash", "BREAK!", 1.4)]); }
  setPhase("roll");
}
// What the table did during a live shot: the rules' record, and the sounds.
const LIVE = {
  hit: function (a, b, sp) {
    const sh = S.shot;
    if (sh) {
      if (sh.first === null) { if (a.id === 0) sh.first = b.id; else if (b.id === 0) sh.first = a.id; }
      if (a.id !== 0 && sh.hitBy[a.id] === undefined) sh.hitBy[a.id] = b.id;
      if (b.id !== 0 && sh.hitBy[b.id] === undefined) sh.hitBy[b.id] = a.id;
      sh.maxHit = Math.max(sh.maxHit, sp);
    }
    hallSfx("clack", sp);
  },
  rail: function (a, sp, jaw) {
    const sh = S.shot;
    if (sh) {
      if (sh.first !== null) sh.railAfter = true;
      if (a.id !== 0 && !jaw) sh.objRail[a.id] = (sh.objRail[a.id] || 0) + 1;
    }
    hallSfx(jaw ? "jaw" : "rail", sp);
  },
  pocket: function (a, j) {
    const sh = S.shot;
    if (sh) { sh.potted.push(a.id); if (a.id === 0) sh.cue = true; }
    hallSfx("pocket", Math.hypot(a.vx, a.vy));
    V.sinkFx.push({ id: a.id, t: 0 });
    if (a.id !== 0) ledPocket(a.id);
  }
};

function playerShoot(power) {
  if (S.phase !== "aim" || S.turn !== 0 || power < 0.03) return;
  S.shotPower = clamp(power, 0, 1);
  S.charging = false; S.drag = null;
  setPhase("stroke");
}

/* ---------------- After the balls stop ---------------- */
function judge() {
  const sh = S.shot, who = sh.who, st = S.shotSt, r = ruling(sh, who, st), opp = 1 - who;
  V.lastRuling = { who: who, foul: r.foul, why: r.why, first: sh.first, potted: sh.potted.slice(), kind: who === 1 && V.lastPlan ? V.lastPlan.kind : "" };
  const you = who === 0;
  let earned = 0, bonusLine = "";
  // what got paid for (the player's legal pots only)
  if (you && !r.foul && !r.lose) {
    const own = r.own.slice();
    if (r.win && own.indexOf(st.mode === "8" ? 8 : 9) < 0) own.push(st.mode === "8" ? 8 : 9);
    for (let i = 0; i < own.length; i++) {
      const id = own[i];
      earned += 10; S.stats.potted++; S.run++;
      if (window.Trophies && S.stats.potted === 1) Trophies.unlock("phh-first-ball");
      if (sh.hitBy[id] !== undefined && sh.hitBy[id] !== 0) { earned += 25; S.stats.combos++; bonusLine = "COMBO! +$25"; if (window.Trophies) Trophies.unlock("phh-combo"); ledPlay([ledMsg("cycle", "COMBO!", 1.6)], true); }
      else if ((sh.objRail[id] || 0) >= 1) { earned += 25; S.stats.banks++; bonusLine = "BANK SHOT! +$25"; if (window.Trophies) Trophies.unlock("phh-bank"); ledPlay([ledMsg("flash", "BANK SHOT!", 1.6)], true); }
    }
    if (own.length > 1) { earned += 15 * (own.length - 1); bonusLine = bonusLine || own.length + " IN ONE SHOT +$" + 15 * (own.length - 1); }
    if (S.run >= 3 && own.length) earned += 10 * Math.min(own.length, S.run - 2);
    S.stats.bestRun = Math.max(S.stats.bestRun, S.run);
    if (S.run >= 5 && window.Trophies) Trophies.unlock("phh-run5");
    if (own.length && window.NPRewards && S.run >= 2 && (S.run === 2 || S.run % 3 === 0)) NPRewards.streak(S.run, S.run === 2 ? "" : S.run + " IN A ROW!");
    if (st.breakShot && own.length && window.Trophies) Trophies.unlock("phh-break-pot");
  }
  if (earned) { S.bank += earned; floatText("+" + money(earned), "#9bff3f"); hallSfx("cash"); }
  if (bonusLine) Shell.flash(bonusLine.split(" +")[0], bonusLine.indexOf("+") > 0 ? "+" + bonusLine.split("+")[1] : "", "#9bff3f", 1200);

  if (r.respot) respot(r.respot);
  if (r.assign) {
    S.groups[who] = r.assign; S.groups[opp] = r.assign === "solid" ? "stripe" : "solid"; S.open = false;
    Shell.flash(you ? "YOU'RE " + GROUP_NAME[r.assign] : RIVAL + " TAKES " + GROUP_NAME[r.assign], you ? "Clear them, then sink the 8." : "You've got " + GROUP_NAME[S.groups[0]].toLowerCase() + ".", "#3ff0ff", 1500);
    ledPlay([ledMsg("slide", (you ? "YOU: " : "RHETT: ") + GROUP_NAME[r.assign], 1.8, { color: "cyan" })], true);
  }
  if (r.win || r.lose) { endRack(r.win ? who : opp, r.why); return; }

  if (sh.cue) { const c = S.balls[0]; c.on = true; c.sink = null; c.vx = c.vy = c.wx = c.wy = c.wz = 0; const p = nearestFree(S.balls, -HL / 2, 0, false) || { x: -30, y: 0 }; c.x = p.x; c.y = p.y; }
  if (r.foul) {
    if (you) { S.stats.fouls++; S.playerFoulThisRack = true; } else S.stats.rivalFouls++;
    Shell.flash(r.why === "SCRATCH" ? "SCRATCH!" : "FOUL", (r.why === "SCRATCH" ? "" : r.why + ". ") + (you ? RIVAL + " gets ball in hand." : "Ball in hand. Put it anywhere."), you ? "#ff4b3e" : "#ffd23f", 1500);
    ledPlay([ledMsg("blink", r.why === "SCRATCH" ? "SCRATCH!" : "FOUL", 1.6, { color: "red" }), ledMsg("slide", "BALL IN HAND", 1.6, { color: "lime" })]);
    hallSfx("foul");
    reactTo(you ? "smug" : "groan");
    S.turn = opp; S.ballInHand = true; S.kitchen = false;
  } else if (!r.cont) {
    if (you) reactTo(S.run > 0 ? "relief" : "smug"); else reactTo("annoyed");
    S.turn = opp;
  } else if (you && r.own.length) {
    reactTo("annoyed");
  } else if (!you && r.own.length) reactTo("smug");
  if (S.turn !== who) {
    if (who === 0) S.run = 0;
    if (S.turn === 1) S.rivalTurns++;
  }
  S.breakShot = false; S.kitchen = false;
  S.shot = null;
  if (S.turn === 0) startPlayerTurn(); else setPhase("think");
}

function startPlayerTurn() {
  S.tipX = S.tipY = 0; S.power = 0; S.drag = null; S.charging = false;
  // aim at something sensible to start from: the nearest legal ball
  const t = legalTargets(0), c = S.balls[0];
  let best = null, bd = 1e9;
  for (let i = 0; i < t.length; i++) { const b = S.balls[t[i]], d = Math.hypot(b.x - c.x, b.y - c.y); if (d < bd) { bd = d; best = b; } }
  if (best) S.aim = Math.atan2(best.y - c.y, best.x - c.x);
  setPhase("aim");
}

function respot(id) {
  const b = S.balls[id];
  function free(x) { for (let i = 0; i < S.balls.length; i++) { const o = S.balls[i]; if (o && o.on && i !== id && Math.hypot(o.x - x, o.y) < 2 * BR + 0.05) return false; } return true; }
  let x = FOOT_SPOT;
  while (!free(x) && x < HL - BR - 0.2) x += 0.4;
  if (!free(x)) { x = FOOT_SPOT; while (!free(x) && x > -HL + BR + 0.2) x -= 0.4; }
  b.x = x; b.y = 0; b.vx = b.vy = b.wx = b.wy = b.wz = 0; b.on = true; b.sink = null;
}

function endRack(winner, why) {
  const you = winner === 0;
  S.won[winner]++;
  S.stats.racks.push(winner);
  if (you) {
    S.bank += S.stake;
    if (window.Trophies) Trophies.unlock("phh-rack");
    if (S.breaker === 0 && S.rivalTurns === 0 && window.Trophies) Trophies.unlock("phh-break-and-run");
    if (S.breaker === 0 && S.rivalTurns === 0) S.stats.breakRuns++;
    if (why === "9 ON THE BREAK" && window.Trophies) Trophies.unlock("phh-golden-break");
    Shell.flash("YOU WIN THE RACK", why + ". +" + money(S.stake), "#ffd23f", 2000);
    hallSfx("winRack"); hallSfx("cheer");
    reactTo("beaten");
  } else {
    S.bank = Math.max(0, S.bank - S.stake);
    if (S.rack === 0) S.firstRackLost = true;
    S.lostARack = true;
    Shell.flash(RIVAL + " TAKES IT", (why === "8 BALL TOO EARLY" || why === "SCRATCHED ON THE 8" ? "You " + why.toLowerCase() + ". " : why + ". ") + "-" + money(S.stake), "#ff3fa4", 2000);
    hallSfx("loseRack");
    reactTo("gloat");
  }
  rhettStop();
  const over = S.won[winner] >= S.race;
  ledPlay([ledMsg("flash", you ? "RACK WON!" : "RACK LOST", 1.8),
           ledMsg("count", "BANKROLL", 2.4, { from: you ? S.bank - S.stake : S.bank + S.stake, value: S.bank, prefix: "$", keep: true })]);
  S.matchOver = over;
  setPhase("rackend");
}

function finishMatch() {
  const youWon = S.won[0] > S.won[1];
  if (youWon) {
    S.bank += 100;
    if (window.Trophies) {
      Trophies.unlock("phh-match");
      if (!S.lostARack) Trophies.unlock("phh-sweep");
      if (S.firstRackLost) Trophies.unlock("phh-comeback");
    }
  }
  ledFinal(S.bank);
  const row = function (a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; };
  Shell.gameOver(S.bank, {
    title: youWon ? "YOU HUSTLED THE HUSTLER" : "HUSTLED",
    html: row("Match (" + (S.mode === "8" ? "8-ball" : "9-ball") + ")", (youWon ? "Won " : "Lost ") + S.won[0] + " - " + S.won[1]) +
          row("Balls sunk", S.stats.potted) +
          row("Best run", S.stats.bestRun) +
          row("Banks and combos", S.stats.banks + " / " + S.stats.combos) +
          row("Fouls", S.stats.fouls) +
          (youWon ? row("Match bonus", "+$100") : "") +
          row("Bankroll", money(S.bank)),
    stats: { bank: S.bank, won: S.won[0], lost: S.won[1], matchWon: youWon, mode: S.mode, potted: S.stats.potted, bestRun: S.stats.bestRun,
             banks: S.stats.banks, combos: S.stats.combos, fouls: S.stats.fouls, breakRuns: S.stats.breakRuns }
  });
}

/* ---------------- The opponent ----------------
   Velvet Rhett picks shots the way a player does: every legal ball into every pocket it can see, ranked by
   how hard the cut is and how far everything has to travel. He then plays his best few in his head with the
   real table physics, keeps the ones that go, and shoots the best of those with a bit of human error.
   He sandbags the first rack (that's the hustle), then plays for real. */
function pathClear(balls, x1, y1, x2, y2, skipA, skipB) {
  const ex = x2 - x1, ey = y2 - y1, l2 = ex * ex + ey * ey || 1e-6;
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (!b || !b.on || i === skipA || i === skipB) continue;
    const u = clamp(((b.x - x1) * ex + (b.y - y1) * ey) / l2, 0, 1), px = x1 + ex * u, py = y1 + ey * u;
    if (Math.hypot(b.x - px, b.y - py) < 2 * BR - 0.04) return false;
  }
  return true;
}
function shotGeom(balls, cx, cy, t, p) {
  const tb = balls[t], P = POCKETS[p];
  let d1x = P.ax - tb.x, d1y = P.ay - tb.y;
  const L1 = Math.hypot(d1x, d1y); if (L1 < 0.5) return null;
  d1x /= L1; d1y /= L1;
  if (P.corner) { if (d1x * P.sx * Math.SQRT1_2 + d1y * P.sy * Math.SQRT1_2 < 0.42) return null; }
  else if (d1y * P.sy < 0.55) return null;
  const gx = tb.x - d1x * 2 * BR, gy = tb.y - d1y * 2 * BR;
  if (Math.abs(gx) > HL - BR + 0.2 || Math.abs(gy) > HW - BR + 0.2) return null;
  let d0x = gx - cx, d0y = gy - cy;
  const L0 = Math.hypot(d0x, d0y); if (L0 < 0.3) return null;
  d0x /= L0; d0y /= L0;
  const cut = d0x * d1x + d0y * d1y;
  if (cut < 0.22) return null;
  if (!pathClear(balls, cx, cy, gx, gy, 0, t) || !pathClear(balls, tb.x, tb.y, P.ax, P.ay, 0, t)) return null;
  return { t: t, p: p, ang: Math.atan2(d0y, d0x), cut: cut, L0: L0, L1: L1, gx: gx, gy: gy, d1x: d1x, d1y: d1y,
           score: (L0 * 0.45 + L1) / (cut * cut) + (1 - cut) * 40 };
}
function powerFor(g) {
  const v1 = Math.sqrt(2 * 9.5 * (g.L1 + 10)) + 0.075 * (g.L1 + 10) + 18;
  const v0 = v1 / Math.max(0.3, g.cut) * 1.12 + g.L0 * 0.45 + 18;
  return clamp((v0 - V_MIN) / (V_MAX - V_MIN), 0.06, 0.92);
}
function simulate(balls0, ang, power, tx, ty) {
  const balls = cloneBalls(balls0);
  const rec = { first: null, potted: [], cue: false, railAfter: false };
  const ev = {
    hit: function (a, b) { if (rec.first === null) { if (a.id === 0) rec.first = b.id; else if (b.id === 0) rec.first = a.id; } },
    rail: function () { if (rec.first !== null) rec.railAfter = true; },
    pocket: function (a) { rec.potted.push(a.id); if (a.id === 0) rec.cue = true; }
  };
  strike(balls[0], ang, V_MIN + power * (V_MAX - V_MIN), tx, ty);
  for (let t = 0; t < 14; t += 1 / 60) { advance(balls, 1 / 60, ev); if (!anyMoving(balls)) break; }
  rec.balls = balls;
  return rec;
}
// How good a shot's outcome is for "who" (higher is better).
function outcomeValue(rec, who, st) {
  const r = ruling(rec, who, st);
  if (r.lose) return -2000;
  if (r.win) return 1000;
  if (r.foul) return -300;
  let v = r.own.length * 150 + (r.cont ? 80 : 0);
  if (r.cont) {                                           // where did the cue ball end up? (is there a next shot)
    const c = rec.balls[0];
    let best = 1e9;
    const groups = st.groups.slice(); if (r.assign) groups[who] = r.assign;
    for (let i = 1; i < rec.balls.length; i++) {
      const b = rec.balls[i];
      if (!b || !b.on) continue;
      const ok = st.mode === "9" ? true : groups[who] ? groupOf(i) === groups[who] || (i === 8 && !rec.balls.some(function (o) { return o && o.on && groupOf(o.id) === groups[who]; })) : i !== 8;
      if (!ok) continue;
      for (let p = 0; p < 6; p++) { const g = shotGeom(rec.balls, c.x, c.y, i, p); if (g && g.score < best) best = g.score; }
    }
    v += best < 1e9 ? 60 - Math.min(60, best * 0.35) : -20;
  }
  return v;
}

// The plan is worked out a few imagined shots at a time (makePlanner().step(ms)), so a phone never stalls while he thinks.
function planShot(who) { const p = makePlanner(who); while (!p.done) p.step(1e9); return p.result; }
function makePlanner(who) {
  const balls = S.balls, c = balls[0], st = shotState(who), targets = legalTargets(who);
  const sandbag = S.rack === 0 && S.won[1] === 0;
  const P = { done: false, result: null, step: null };
  if (S.breakShot) {                                      // the break
    const place = S.ballInHand ? nearestFree(balls, -32, (vrand() - 0.5) * 10, true) : null;
    const cx = place ? place.x : c.x, cy = place ? place.y : c.y, apex = balls[1];
    P.result = { place: place, ang: Math.atan2(apex.y - cy + (vrand() - 0.5) * 0.25, apex.x - cx), power: 0.9 + vrand() * 0.08, tx: 0, ty: -0.05, kind: "break" };
    P.done = true; P.step = function () {}; return P;
  }
  // ball in hand: try spots straight behind good shots
  let spots = [{ x: c.x, y: c.y, keep: true }];
  if (S.ballInHand) {
    spots = [];
    for (let i = 0; i < targets.length; i++) for (let p = 0; p < 6; p++) {
      const tb = balls[targets[i]], Pk = POCKETS[p];
      let dx = Pk.ax - tb.x, dy = Pk.ay - tb.y; const L = Math.hypot(dx, dy); dx /= L; dy /= L;
      for (let k = 0; k < 3; k++) {
        const back = [11, 16, 8][k], skew = [0, 0.22, -0.22][k];
        const ca = Math.cos(skew), sa = Math.sin(skew), ex = dx * ca - dy * sa, ey = dx * sa + dy * ca;
        const x = tb.x - dx * 2 * BR - ex * back, y = tb.y - dy * 2 * BR - ey * back;
        if (spotFree(balls, x, y, false)) spots.push({ x: x, y: y });
      }
    }
    if (!spots.length) { const p = nearestFree(balls, -20, 0, false); spots.push(p || { x: c.x, y: c.y }); }
  }
  let cands = [];
  for (let s = 0; s < spots.length; s++) for (let i = 0; i < targets.length; i++) for (let p = 0; p < 6; p++) {
    const g = shotGeom(balls, spots[s].x, spots[s].y, targets[i], p);
    if (g) { g.spot = spots[s]; cands.push(g); }
  }
  cands.sort(function (a, b) { return a.score - b.score; });
  cands = cands.slice(0, 7);
  const jobs = [], spins = [0, -0.32, 0.28];
  for (let i = 0; i < cands.length; i++) for (let k = 0; k < spins.length; k++) for (let m = 0; m < 2; m++) jobs.push({ kind: "pot", g: cands[i], ty: spins[k], m: m });
  let best = null, safe = null, safetyQueued = false;
  const from = S.ballInHand ? (nearestFree(balls, -HL / 2, 0, false) || c) : c;
  function queueSafety() {
    // nothing goes: touch a legal ball safely, straight at it or with a kick off one cushion (aim at its mirror image)
    safetyQueued = true;
    const near = targets.slice().sort(function (a, b) { return Math.hypot(balls[a].x - from.x, balls[a].y - from.y) - Math.hypot(balls[b].x - from.x, balls[b].y - from.y); }).slice(0, 4);
    for (let i = 0; i < near.length; i++) {
      const tb = balls[near[i]];
      for (let k = -3; k <= 3; k++) for (let m = 0; m < 2; m++) jobs.push({ kind: "safe", ang: Math.atan2(tb.y - from.y, tb.x - from.x) + k * 0.03, pw: [0.24, 0.42][m] });
      [[2 * (HL - BR) - tb.x, tb.y], [-2 * (HL - BR) - tb.x, tb.y], [tb.x, 2 * (HW - BR) - tb.y], [tb.x, -2 * (HW - BR) - tb.y]].forEach(function (mp) {
        jobs.push({ kind: "safe", ang: Math.atan2(mp[1] - from.y, mp[0] - from.x), pw: 0.5 });
      });
    }
  }
  function finish() {
    P.done = true;
    if (best && best.v > 40) {
      const g = best.g;
      const sig = (sandbag ? 1.25 : 0.42) * DEG * (0.6 + (1 - g.cut) * 1.4 + g.L0 / 120);   // human error, wider while he sandbags
      P.result = { place: g.spot.keep ? null : { x: g.spot.x, y: g.spot.y }, ang: g.ang + gauss() * sig, power: clamp(best.power * (1 + gauss() * 0.05), 0.05, 0.96),
                   tx: 0, ty: best.ty, kind: "pot", target: g.t, pocket: g.p, sandbag: sandbag };
      return;
    }
    if (!safe) safe = { ang: Math.atan2(-c.y, -c.x), power: 0.3 };
    P.result = { place: S.ballInHand ? { x: from.x, y: from.y } : null, ang: safe.ang + gauss() * 0.4 * DEG, power: safe.power, tx: 0, ty: 0, kind: "safety" };
  }
  P.step = function (budget) {
    const t0 = performance.now();
    if (!jobs.length && !safetyQueued) queueSafety();     // no pot to look at: straight to the safeties
    while (jobs.length) {
      const j = jobs.shift();
      if (j.kind === "pot") {
        const g = j.g, pw = clamp(powerFor(g) * [1, 1.3][j.m], 0.05, 0.95);
        const rec = simulate(g.spot.keep ? balls : withCueAt(balls, g.spot.x, g.spot.y), g.ang, pw, 0, j.ty);
        const v = outcomeValue(rec, who, st) - g.score * 0.4;
        if (!best || v > best.v) best = { v: v, g: g, power: pw, ty: j.ty };
      } else {
        const rec = simulate(S.ballInHand ? withCueAt(balls, from.x, from.y) : balls, j.ang, j.pw, 0, 0);
        const v = outcomeValue(rec, who, st) + (rec.first !== null ? 20 : 0);
        if (!safe || v > safe.v) safe = { v: v, ang: j.ang, power: j.pw };
      }
      if (!jobs.length && !safetyQueued && !(best && best.v > 40)) queueSafety();
      if (performance.now() - t0 > budget) break;
    }
    if (!jobs.length) finish();
  };
  return P;
}
function withCueAt(balls, x, y) { const b = cloneBalls(balls); b[0].x = x; b[0].y = y; b[0].on = true; return b; }

/* ---------------- Update ---------------- */
function update(dt) {
  S.t += dt; S.pt += dt;
  updateParts(dt);
  for (let i = V.sinkFx.length - 1; i >= 0; i--) { V.sinkFx[i].t += dt; }
  if (S.phase === "intro") {
    if (!S.taunted && S.pt > 0.35) {
      S.taunted = true;
      const line = S.rack === 0 ? ["Friendly game? " + money(S.stake) + " a rack.", "Rhett's rusty. Or so he says."] :
                   S.won[0] > S.won[1] ? ["Double or nothing, kid.", "Now he's playing for real."] :
                   S.won[1] > S.won[0] ? ["Pay up, or go again?", money(S.stake) + " says you can't."] : ["All square. Let's make it interesting.", money(S.stake) + " on this one."];
      Shell.flash(RIVAL, "\u201C" + line[0] + "\u201D " + line[1], "#ff3fa4", 2200);
    }
    if (S.pt > 2.6) { if (S.turn === 0) startPlayerTurn(); else setPhase("think"); }
    return;
  }
  if (S.phase === "aim") {
    const turn = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0), fine = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
    const shift = keys.ShiftLeft || keys.ShiftRight;
    if (turn || fine) { S.aim += (turn * (shift ? 0.1 : 0.85) + fine * 0.07) * dt; S.kb = true; }
    const sx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), sy = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    if (sx || sy) setTip(S.tipX + sx * 0.9 * dt, S.tipY + sy * 0.9 * dt);
    if (S.charging) { S.chargeT += dt; const ph = (S.chargeT / 1.3) % 2; S.power = ph < 1 ? ph : 2 - ph; }
    return;
  }
  if (S.phase === "stroke") {
    if (S.pt >= 0.11) beginShot(0, S.aim, S.shotPower, S.tipX, S.tipY);
    return;
  }
  if (S.phase === "roll") {
    advance(S.balls, dt, LIVE);
    const sinking = V.sinkFx.some(function (f) { return f.t < 0.55; });
    if (!anyMoving(S.balls) && !sinking) setPhase("settle");
    return;
  }
  if (S.phase === "settle") { if (S.pt > 0.3) judge(); return; }
  if (S.phase === "think") {
    if (!S.plan && !S.planner && S.pt > 0.2) S.planner = makePlanner(1);
    if (S.planner && !S.planner.done) S.planner.step(7);
    if (S.planner && S.planner.done && !S.plan) { S.plan = S.planner.result; S.planner = null; S.thinkFor = Math.max(S.pt + 0.25, 0.7 + vrand() * 0.7 + (S.plan.kind === "safety" ? 0.5 : 0)); }
    if (S.plan && S.pt > S.thinkFor) {
      if (S.plan.place) { S.placeFrom = { x: S.balls[0].x, y: S.balls[0].y }; setPhase("aiplace"); }
      else setPhase("aiaim");
    }
    return;
  }
  if (S.phase === "aiplace") {
    const k = smooth(S.pt / 0.7), c = S.balls[0];
    c.x = lerp(S.placeFrom.x, S.plan.place.x, k); c.y = lerp(S.placeFrom.y, S.plan.place.y, k);
    if (S.pt >= 0.75) { c.x = S.plan.place.x; c.y = S.plan.place.y; setPhase("aiaim"); }
    return;
  }
  if (S.phase === "aiaim") {
    S.aim += angDiff(S.aim, S.plan.ang) * Math.min(1, dt * 6);
    if (S.pt > 0.6 && hustlerReady()) { S.aim = S.plan.ang; setPhase("aistroke"); }
    return;
  }
  if (S.phase === "aistroke") {
    if (S.pt >= AI_STROKE_T) {
      const p = S.plan; S.plan = null; V.lastPlan = p;
      S.tipX = p.tx; S.tipY = p.ty;
      beginShot(1, p.ang, p.power, p.tx, p.ty);
    }
    return;
  }
  if (S.phase === "rackend") {
    if (S.pt > 3.6) {
      if (S.matchOver) { finishMatch(); return; }
      S.rack++; S.breaker = 1 - S.breaker;
      newRack();
    }
  }
}
const AI_STROKE_T = 1.75;                              // two practice strokes, then the real one

function setTip(x, y) {
  const d = Math.hypot(x, y);
  if (d > MAX_TIP) { x *= MAX_TIP / d; y *= MAX_TIP / d; }
  S.tipX = x; S.tipY = y;
}

/* ---------------- Floating text and confetti (drawn on the HUD) ---------------- */
const CONF_COLS = ["#ffd23f", "#3ff0ff", "#ff3fa4", "#9bff3f", "#ff9214", "#ffffff"];
function floatText(txt, col) { floats.push({ txt: txt, col: col, t: 0 }); }
function burst(x, y, n) {
  if (Shell.reduced) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = vrand() * TAU, s = 60 + vrand() * 180;
    parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 90, life: 1.2, c: CONF_COLS[i % CONF_COLS.length], rot: vrand() * TAU, vr: (vrand() - 0.5) * 14 });
  }
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 220 * dt; q.rot += q.vr * dt;
    if (q.life <= 0) parts.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; if (floats[i].t > 1.3) floats.splice(i, 1); }
}

/* ---------------- Input ---------------- */
// HUD controls, in the shell's 360 x 540 units
const SPIN_UI = { x: 46, y: 486, r: 31 };
const POWER_UI = { x: 322, y: 300, w: 26, h: 196 };
const VIEW_UI = { x: 138, y: 512, w: 84, h: 22 };
function inSpin(x, y) { return Math.hypot(x - SPIN_UI.x, y - SPIN_UI.y) < SPIN_UI.r + 12; }
function inPower(x, y) { return x > POWER_UI.x - 22 && y > POWER_UI.y - 26 && y < POWER_UI.y + POWER_UI.h + 30; }
function inView(x, y) { return x > VIEW_UI.x - 6 && x < VIEW_UI.x + VIEW_UI.w + 6 && y > VIEW_UI.y - 8 && y < VIEW_UI.y + VIEW_UI.h + 8; }
function canAim() { return S.phase === "aim" && S.turn === 0; }
function toggleView() {
  V.userView = V.userView === "cue" ? "top" : "cue";
  Shell.sfx("click");
}

function pointer(type, x, y) {
  if (type === "down") {
    if (S.phase === "intro" && S.pt > 0.5) { S.pt = 99; return; }
    if (S.phase === "rackend" && S.pt > 1.2) { S.pt = 99; return; }
    if (inView(x, y) && S.turn === 0) { toggleView(); return; }
    if (!canAim()) return;
    S.kb = false; S.charging = false;
    if (inSpin(x, y)) { S.drag = { kind: "spin" }; spinFrom(x, y); return; }
    if (inPower(x, y)) { S.drag = { kind: "power", sy: y }; S.power = 0; return; }
    if (S.ballInHand) {
      const c = S.balls[0], p = bedToScreen(c.x, c.y, BR);
      if (Math.hypot(p.x - x, p.y - y) < 30) { S.drag = { kind: "place" }; return; }
    }
    S.drag = { kind: "aim", sx: x, sy: y, a0: S.aim, moved: false, t0: S.t, lx: x };
  } else if (type === "move" && S.drag) {
    const d = S.drag;
    if (d.kind === "spin") spinFrom(x, y);
    else if (d.kind === "power") S.power = clamp((y - d.sy) / 160, 0, 1);
    else if (d.kind === "place") {
      const g = screenToBed(x, y);
      if (g) { const p = nearestFree(S.balls, g.x, g.y, S.kitchen); if (p) { S.balls[0].x = p.x; S.balls[0].y = p.y; } }
    } else if (d.kind === "aim") {
      if (Math.abs(x - d.sx) + Math.abs(y - d.sy) > 6) d.moved = true;
      if (!d.moved) return;
      if (viewNow() === "top") {
        const g = screenToBed(x, y), c = S.balls[0];
        if (g && Math.hypot(g.x - c.x, g.y - c.y) > 2.5) S.aim = Math.atan2(g.y - c.y, g.x - c.x);
      } else {
        // slow drags turn the aim finely, fast ones swing it
        const step = x - d.lx, k = Math.abs(step) < 3 ? 0.0012 : 0.0036;
        S.aim -= step * k; d.lx = x;
      }
    }
  } else if ((type === "up" || type === "cancel") && S.drag) {
    const d = S.drag; S.drag = null;
    if (type === "cancel") { if (d.kind === "power") S.power = 0; return; }
    if (d.kind === "power") { const p = S.power; S.power = 0; if (p > 0.03) playerShoot(p); }
    else if (d.kind === "aim" && !d.moved && S.t - d.t0 < 0.35) {
      const g = screenToBed(x, y), c = S.balls[0];
      if (g && Math.abs(g.x) < HL + 4 && Math.abs(g.y) < HW + 4 && Math.hypot(g.x - c.x, g.y - c.y) > 1.5) S.aim = Math.atan2(g.y - c.y, g.x - c.x);
    }
  }
}
function spinFrom(x, y) { setTip((x - SPIN_UI.x) / SPIN_UI.r * MAX_TIP / 0.85, -(y - SPIN_UI.y) / SPIN_UI.r * MAX_TIP / 0.85); }

function key(type, code, e) {
  const act = code === "Space" || code === "Enter" || code === "NumpadEnter";
  if (type === "down") {
    keys[code] = true;
    if (code === "KeyV" && !e.repeat) toggleView();
    if (code === "KeyC" && canAim()) setTip(0, 0);
    if (act && !e.repeat) {
      if (S.phase === "intro" && S.pt > 0.5) { S.pt = 99; return; }
      if (S.phase === "rackend" && S.pt > 1.2) { S.pt = 99; return; }
      if (canAim() && !S.charging) { S.charging = true; S.chargeT = 0; S.power = 0; S.kb = true; S.drag = null; }
    }
  } else {
    keys[code] = false;
    if (act && S.charging) { S.charging = false; const p = S.power; S.power = 0; playerShoot(p); }
  }
}

/* ---------------- Music: "Back Room Shuffle", an original loop for the hall ----------------
   Sixteen bars of a slow swung groove in A minor: electric piano stabs, a funky bass, brushed drums and a
   synth lead with an echo. Self-contained: it takes an audio context and a node to play into, knows nothing
   about the game, and returns a function that stops it. */
function startMusic(ctx, dest) {
  const BPM = 96, STEP = 60 / BPM / 4, SWING = STEP * 0.16, BARS = 16, STEPS = BARS * 16;
  // bass root, then the electric piano voicing, one chord per half bar (MIDI)
  const CH = {
    Am9: [33, 60, 64, 67, 71], D9: [38, 54, 57, 60, 64], F7M: [41, 53, 57, 60, 64], E7x: [40, 56, 59, 62, 67], E7: [40, 56, 59, 62, 64],
    Dm9: [38, 53, 57, 60, 64], G13: [43, 53, 57, 59, 64], C9M: [36, 55, 59, 62, 64], Bh7: [35, 53, 57, 59, 62]
  };
  const PROG = ("Am9 Am9 D9 D9 F7M F7M E7x E7x Am9 Am9 D9 D9 F7M E7 Am9 Am9 " +
                "Dm9 Dm9 G13 G13 C9M C9M F7M F7M Bh7 Bh7 E7 E7 Am9 Am9 E7 E7").split(" ");
  const LEAD_BARS = [
    "0E5-2 3G5-1 4A5-3 8C6-2 10B5-1 11A5-1 12G5-4",
    "0F#5-2 2A5-2 4E5-4 10D5-1 11E5-1 12F#5-2 14A5-2",
    "0C6-3 3A5-1 4G5-2 6E5-2 8F5-4 13E5-1 14C5-2",
    "0B4-2 2D5-2 4G#5-3 7B5-1 8D6-4 12B5-2 14G5-2",
    "0A5-2 2C6-1 3B5-1 4A5-2 6E5-2 8G5-3 11A5-1 12E5-4",
    "0D5-1 1E5-1 2F#5-2 4A5-4 8C6-2 10B5-2 12A5-4",
    "0A5-2 2G5-2 4F5-2 6E5-2 8G#5-2 10B5-2 12D6-2 14B5-2",
    "0A5-6 8E5-1 10G5-1 12A4-4",
    "0F5-3 3E5-1 4D5-2 6F5-2 8A5-4 12C6-2 14A5-2",
    "0B5-2 2A5-1 3G5-1 4F5-2 6E5-2 8D5-4 12F5-2 14G5-2",
    "0E5-3 3G5-1 4B5-4 8D6-2 10C6-2 12B5-2 14G5-2",
    "0A5-4 4C6-2 6A5-2 8G5-2 10F5-2 12E5-4",
    "0D5-2 2F5-2 4A5-2 6B5-2 8D6-3 11C6-1 12B5-2 14A5-2",
    "0G#5-4 4B5-2 6D6-2 8E6-4 12D6-2 14B5-2",
    "0C6-2 2B5-1 3A5-1 4G5-2 6E5-2 8A5-4 12G5-1 13E5-1 14D5-2",
    "0E5-2 2G#5-2 4B5-2 6D6-2 8E6-2 10D6-1 11B5-1 12G#5-2 14E5-2"
  ];
  const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const LEAD = new Array(STEPS).fill(null);
  LEAD_BARS.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(#?)(\d)-(\d+)$/.exec(tok);
      if (m) LEAD[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + semis[m[2]] + (m[3] ? 1 : 0), Number(m[5])];
    });
  });
  const BASS = [[0, 0, 3], [3, 12, 1], [6, 0, 2], [8, 7, 2], [10, 10, 1], [11, 12, 1], [14, 7, 2]];   // step, interval, length
  const COMP = [[2, 0.9, 1.5], [6, 0.5, 0.8], [10, 0.85, 1.5], [13, 0.6, 2]];                          // step, level, length in steps
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(dest);
  function filt(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const leadF = filt("lowpass", 2600, 1.1, bus), bassF = filt("lowpass", 700, 1.4, bus), epF = filt("lowpass", 3200, 0.5, bus), kitF = filt("highpass", 30, 0.7, bus);
  const send = ctx.createGain(), echo = ctx.createDelay(1), back = ctx.createGain(), wet = filt("lowpass", 1900, 0.7, bus);
  send.gain.value = 0.32; echo.delayTime.value = STEP * 3; back.gain.value = 0.36;
  leadF.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(wet);
  const len = Math.floor(ctx.sampleRate * 1.5), noise = ctx.createBuffer(1, len, ctx.sampleRate), nd = noise.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; nd[i] = seed / 1073741823.5 - 1; }

  function tone(to, type, f, t, dur, vol, f1, hold, det) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (det) o.detune.value = det;
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, t + Math.max(0.008, dur * (hold == null ? 0.5 : hold)));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(to, t, dur, vol, type, f, q) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(to); s.start(t, (t * 7.31) % 1); s.stop(t + dur + 0.05);
  }
  function play(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[i >> 3]], b2 = bar >= 8, n = LEAD[i];
    if (n && (bar >= 2 || b2)) {                                      // the lead sits out the first two bars
      tone(leadF, "square", hz(n[0]), t, n[1] * STEP * 0.95, 0.075, 0, 0.6, -6);
      tone(leadF, "sawtooth", hz(n[0]), t, n[1] * STEP * 0.95, 0.045, 0, 0.6, 7);
    }
    for (let k = 0; k < BASS.length; k++) if (BASS[k][0] === s) tone(bassF, "triangle", hz(ch[0] + 12 + BASS[k][1]), t, BASS[k][2] * STEP * 0.9, 0.42, 0, 0.7);
    if (s === 0) tone(bassF, "sine", hz(ch[0] + 12), t, STEP * 3, 0.3, 0, 0.6);
    for (let k = 0; k < COMP.length; k++) if (COMP[k][0] === s) {
      for (let v = 1; v < ch.length; v++) {
        tone(epF, "sine", hz(ch[v]), t, COMP[k][2] * STEP * 1.6, 0.06 * COMP[k][1], 0, 0.15);
        tone(epF, "triangle", hz(ch[v] + 12), t, COMP[k][2] * STEP * 0.7, 0.018 * COMP[k][1], 0, 0.05);
      }
    }
    if (s === 0 || s === 7 || s === 10) tone(kitF, "sine", 140, t, 0.17, 0.55, 45, 0.08);       // kick
    if (s === 4 || s === 12) { hiss(kitF, t, 0.16, 0.2, "bandpass", 1700, 0.6); tone(kitF, "triangle", 190, t, 0.07, 0.12, 120, 0.1); }   // snare
    if (s === 15 && bar % 2 === 1) hiss(kitF, t, 0.06, 0.07, "bandpass", 2000, 0.8);            // ghost note
    if (!(s & 1)) hiss(kitF, t, s === 14 && bar % 2 ? 0.2 : 0.035, s % 4 === 2 ? 0.07 : 0.04, "highpass", 7600, 0.7);   // hats
  }
  let step = 0, next = ctx.currentTime + 0.06, alive = true;
  function pump() {
    if (!alive) return;
    const now = ctx.currentTime;
    if (next < now) next = now + 0.03;
    while (next < now + 0.5) { play(step, next + (step & 1 ? SWING : 0)); step = (step + 1) % STEPS; next += STEP; }
  }
  pump();
  const timer = setInterval(pump, 90);
  return function stop() {
    if (!alive) return;
    alive = false; clearInterval(timer);
    try { bus.gain.setTargetAtTime(0, ctx.currentTime, 0.04); } catch (e) { /* ignore */ }
    setTimeout(function () { try { bus.disconnect(); } catch (e) { /* ignore */ } }, 600);
  };
}

/* ---------------- Hall sound: the band, the balls, the room ----------------
   Made in code with the Web Audio API, no audio files. Nothing is created until the first tap, click or
   key press. Follows the shell's mute button (the same "npArcade.muted" setting); the music has its own
   on / off switch, remembered in "npArcade.music". */
const MUSIC_VOL = 0.15, SFX_VOL = 0.24, MUSIC_KEY = "npArcade.music";
const Hall = (function () {
  let live = null, dead = false, muted = false, stopMusic = null, bedOn = false, lastClack = 0, lastClackV = 0;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  const buttons = [];

  function rig(c) {
    const A = { c: c };
    A.out = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    A.out.connect(comp); comp.connect(c.destination);
    A.music = c.createGain(); A.music.gain.value = MUSIC_VOL; A.music.connect(A.out);
    A.sfx = c.createGain(); A.sfx.gain.value = SFX_VOL; A.sfx.connect(A.out);
    A.bed = c.createGain(); A.bed.gain.value = 0; A.bed.connect(A.out);
    const len = Math.floor(c.sampleRate * 2);
    A.noise = c.createBuffer(1, len, c.sampleRate);
    const d = A.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = vrand() * 2 - 1;
    // the room: a low murmur of people talking, two bands of filtered noise breathing in and out
    [[420, 0.9], [1100, 1.4]].forEach(function (b) {
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = A.noise; s.loop = true; f.type = "bandpass"; f.frequency.value = b[0]; f.Q.value = b[1];
      g.gain.value = 0.5; s.connect(f); f.connect(g); g.connect(A.bed); s.start();
      (A.bedBands = A.bedBands || []).push(g);
    });
    return A;
  }
  function osc(dest, type, f0, t, dur, vol, f1, hold) {
    const A = live, o = A.c.createOscillator(), g = A.c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.setValueAtTime(vol, t + Math.max(0.005, dur * (hold == null ? 0.3 : hold)));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(dest, t, dur, vol, type, f0, q, f1, atk) {
    const A = live, s = A.c.createBufferSource(), f = A.c.createBiquadFilter(), g = A.c.createGain();
    s.buffer = A.noise; f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.003)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, vrand() * 1.5); s.stop(t + dur + 0.05);
  }
  function cue(name, t, x) {
    const d = live.sfx;
    if (name === "clack") {                                  // ball on ball: a hard bright click, louder the harder they meet
      const v = clamp(x / 240, 0.05, 1);
      osc(d, "sine", 2700 + vrand() * 1300, t, 0.035 + v * 0.03, 0.55 * v, 0, 0.05);
      osc(d, "triangle", 1250 + vrand() * 400, t, 0.03, 0.22 * v, 0, 0.05);
      hiss(d, t, 0.025, 0.4 * v, "highpass", 3400, 0.7);
    } else if (name === "rail" || name === "jaw") {          // into the rubber
      const v = clamp(x / 220, 0.05, 1);
      osc(d, "sine", 150, t, 0.11, 0.55 * v, 72, 0.1);
      hiss(d, t, 0.07, 0.25 * v, "lowpass", 700, 0.7);
      if (name === "jaw") osc(d, "triangle", 420, t, 0.05, 0.25 * v, 300, 0.1);
    } else if (name === "pocket") {                          // over the lip, down into the leather
      const v = clamp(0.4 + x / 300, 0.4, 1);
      osc(d, "sine", 230, t, 0.07, 0.6 * v, 120, 0.1);
      for (let i = 0; i < 4; i++) { const tt = t + 0.05 + i * (0.05 - i * 0.008); osc(d, "triangle", 900 - i * 140, tt, 0.03, 0.18 * v * (1 - i * 0.18), 0, 0.1); }
      osc(d, "sine", 95, t + 0.2, 0.18, 0.5 * v, 60, 0.1);
      hiss(d, t + 0.2, 0.22, 0.14 * v, "lowpass", 400, 0.7);
    } else if (name === "cue") {                             // leather tip on the cue ball
      const v = 0.35 + x * 0.65;
      hiss(d, t, 0.03, 0.5 * v, "bandpass", 1900, 1.8);
      osc(d, "sine", 640, t, 0.06, 0.45 * v, 300, 0.1);
      if (x > 0.75) osc(d, "square", 210, t, 0.05, 0.25, 90, 0.1);
    } else if (name === "chalk") {
      for (let i = 0; i < 3; i++) hiss(d, t + i * 0.09, 0.07, 0.12, "bandpass", 3300 + i * 250, 6);
    } else if (name === "rack") {                            // the balls going into the triangle
      for (let i = 0; i < 9; i++) osc(d, "sine", 2600 + vrand() * 1200, t + i * 0.045 + vrand() * 0.02, 0.03, 0.18, 0, 0.05);
      osc(d, "sine", 180, t + 0.45, 0.12, 0.35, 90, 0.1);
    } else if (name === "crowdUp") {                         // the room leans in
      hiss(d, t, 1.1, 0.3, "bandpass", 520, 1.2, 880, 0.25);
    } else if (name === "cheer") {
      hiss(d, t, 2.2, 0.75, "bandpass", 950, 0.5, 1500, 0.25);
      hiss(d, t + 0.1, 1.8, 0.3, "highpass", 3000, 0.6, 0, 0.3);
      for (let i = 0; i < 22; i++) hiss(d, t + 0.15 + vrand() * 1.4, 0.03, 0.25 + vrand() * 0.2, "bandpass", 1600 + vrand() * 2000, 2.5);
    } else if (name === "groan") {                           // "ohhh"
      hiss(d, t, 1.0, 0.4, "bandpass", 720, 3, 330, 0.12);
      hiss(d, t, 1.0, 0.25, "bandpass", 1300, 4, 600, 0.12);
    } else if (name === "foul") {
      osc(d, "sawtooth", 150, t, 0.22, 0.22, 0, 0.6); osc(d, "sawtooth", 112, t + 0.2, 0.32, 0.22, 0, 0.6);
    } else if (name === "cash") {                            // the register
      hiss(d, t, 0.03, 0.3, "highpass", 4000, 0.7);
      osc(d, "sine", 1568, t + 0.03, 0.5, 0.22, 0, 0.05); osc(d, "sine", 2093, t + 0.1, 0.6, 0.2, 0, 0.05);
    } else if (name === "winRack") {
      [72, 76, 79, 84, 88].forEach(function (m, i) { osc(d, "square", 440 * Math.pow(2, (m - 69) / 12), t + i * 0.07, 0.12, 0.2, 0, 0.5); });
      [84, 88, 91].forEach(function (m) { osc(d, "triangle", 440 * Math.pow(2, (m - 69) / 12), t + 0.38, 0.6, 0.18, 0, 0.3); });
    } else if (name === "loseRack") {
      [76, 72, 69, 64].forEach(function (m, i) { osc(d, "triangle", 440 * Math.pow(2, (m - 69) / 12), t + i * 0.12, 0.2, 0.26, 0, 0.5); });
    }
  }
  function shellMuted() {
    const b = document.getElementById("np-mute");
    if (b) return b.getAttribute("aria-pressed") === "true";
    try { return localStorage.getItem("npArcade.muted") === "1"; } catch (e) { return false; }
  }
  function unlock() {
    if (dead) return;
    try {
      if (!live) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        live = rig(new AC());
        muted = shellMuted();
        live.out.gain.value = muted ? 0 : 1;
        setInterval(pump, 150);
      }
      if (live.c.state !== "running") { const p = live.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { live = null; dead = true; }
  }
  function pump() {
    const A = live;
    if (!A || !window.Shell) return;
    const c = A.c, now = c.currentTime, m = shellMuted();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, now, 0.02); }
    const playing = c.state === "running" && Shell.state() === "playing";
    const want = musicOn && !muted && playing;
    if (want && !stopMusic) { A.music.gain.cancelScheduledValues(now); A.music.gain.setValueAtTime(MUSIC_VOL, now); stopMusic = startMusic(c, A.music); }
    else if (!want && stopMusic) { stopMusic(); stopMusic = null; }
    const bed = playing && !muted;
    if (bed !== bedOn) { bedOn = bed; A.bed.gain.setTargetAtTime(bed ? 0.06 : 0, now, 0.4); }
    if (bedOn) for (let i = 0; i < A.bedBands.length; i++) A.bedBands[i].gain.setTargetAtTime(0.35 + vrand() * 0.65, now, 0.5);
  }
  function sfx(name, x) {
    const A = live;
    if (!A || muted || A.c.state !== "running") return;
    const now = A.c.currentTime;
    if (name === "clack") {                                  // a rack exploding is a lot of clicks: keep the loud ones
      if (now - lastClack < 0.014 && x < lastClackV * 1.4) return;
      if (x < 6) return;
      lastClack = now; lastClackV = x;
    }
    try { cue(name, now + 0.005, x || 0); } catch (e) { /* sound is never worth a crash */ }
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
    b.addEventListener("click", function (e) { e.stopPropagation(); unlock(); setMusic(!musicOn); });
    parent.insertBefore(b, before || null);
    buttons.push(b); label();
  }
  return {
    unlock: unlock, pump: pump, sfx: sfx, button: button,
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    newGame: function () { unlock(); if (stopMusic) { stopMusic(); stopMusic = null; } pump(); },
    peek: function () { return { made: !!live, state: live ? live.c.state : "none", music: !!stopMusic, muted: muted, musicOn: musicOn, bed: bedOn }; }
  };
})();
function hallSfx(name, x) { Hall.sfx(name, x); }

/* ---------------- LED ribbon board: a dot-matrix strip running all the way around the hall ----------------
   Same board as the other 3D games: everything on it is painted into a small canvas, one pixel per LED, and a
   small shader turns each pixel into a glowing dot. It runs around all four walls as one long strip at eye level,
   right over the wainscot and along the back bar, so it is always in the picture behind the table. The
   programme scrolls right to left the whole way round; big moments (ledPlay below) cut in on every wall at once. */
const LED_ROWS = 18, LED_PITCH = 0.8, LED_Y = 43.2;           // rows, inches per LED, height of the strip's bottom edge (just over the wainscot)
const LED_SPEED = 46;                                         // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));  // the largest text size that fits (5 x 7 font, in LEDs per font pixel)
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
const LED_BALL = ["white", "yellow", "blue", "red", "violet", "orange", "lime", "pink", "white", "yellow", "blue", "red", "violet", "orange", "lime", "pink"];
// Short messages between the plugs. The wordmark leads each group.
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["RACK 'EM UP", "pink"], ["NO QUARTERS REQUIRED", "cyan"], ["CALL YOUR POCKET", "lime"]];
// Plugs for the rest of the arcade: [game, one-line tag]. Edit freely, the board lays itself out.
const LED_PLUGS = [
  ["TAPE PIN LANES", "3D BOWLING"],
  ["SHELF LINKS", "MINI GOLF"],
  ["BARGAIN BIN BUCKETS", "HOOPS"],
  ["BLEACHER CARTS", "HOME RUN DERBY"],
  ["TICKET ROLL ALLEY", "ROLL FOR TICKETS"],
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
    "*": "00000 00100 01110 11111 01110 00100 00000", "$": "00100 01111 10100 01110 00101 11110 00100"
  };
  const out = {};
  for (const ch in src) out[ch] = src[ch].split(" ");
  return out;
})();
function ledTextW(str, sx) { let w = 0; for (let i = 0; i < str.length; i++) w += (str[i] === " " ? 4 : 6) * sx; return Math.max(0, w - sx); }
function ledText(g, str, x, y, sx, sy, color) {
  g.fillStyle = color;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === " ") { x += 4 * sx; continue; }
    const rows = LED_FONT[ch] || LED_FONT["?"];
    for (let r = 0; r < 7; r++) { const rw = rows[r]; for (let c = 0; c < 5; c++) if (rw.charCodeAt(c) === 49) g.fillRect(x + c * sx, y + r * sy, sx, sy); }
    x += 6 * sx;
  }
  return x;
}
// The whole scrolling programme, painted once into one long strip (LED_ROWS tall).
function ledStrip(script) {
  const HH = LED_ROWS, big = LED_BIG, yBig = Math.floor((HH - 7 * big) / 2), GAP = 14, items = [];
  const markW = Math.max(8, Math.round(HH * script.width / script.height));
  const markC = mkCanvas(markW, HH), mg = markC.getContext("2d", { willReadFrequently: true });
  mg.imageSmoothingEnabled = true; mg.imageSmoothingQuality = "high";
  mg.drawImage(script, 0, 0, markW, HH);
  try {                                                  // cream lettering to full brightness, the red rim dimmer, the navy outline dark
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
// segs: the length of each wall's section, in LEDs, in order around the room
function ledCreate(script, segs) {
  let cols = 0; const starts = [];
  for (let i = 0; i < segs.length; i++) { starts.push(cols); cols += segs[i]; }
  const c = mkCanvas(cols, LED_ROWS), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  const strip = ledStrip(script), sw = strip.canvas.width;
  const start = ((-(segs[0] - strip.markW) / 2) % sw + sw) % sw;
  return { canvas: c, g: g, cols: cols, segs: segs, starts: starts, strip: strip.canvas, scroll: start, pos: -1, msg: null, queue: [], frame: -1, tex: null };
}
function ledDotCanvas() {
  const c = mkCanvas(32, 32), g = c.getContext("2d");
  g.fillStyle = "#000000"; g.fillRect(0, 0, 32, 32);
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.45, "#f4f4f4"); gr.addColorStop(0.8, "#585858"); gr.addColorStop(1, "#000000");
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return c;
}
// kind: "flash" (strobe and chevrons), "slide", "cycle", "blink", "count" (label, a number that counts up)
function ledMsg(kind, text, dur, more) {
  const m = { kind: kind, text: text, dur: dur, t: 0, wait: 0, color: "amber" };
  if (more) for (const k in more) m[k] = more[k];
  return m;
}
function ledPlay(list, append) {
  const L = LED;
  if (!L || !list.length) return;
  if (append && L.msg) { for (let i = 0; i < list.length && L.queue.length < 4; i++) L.queue.push(list[i]); return; }
  if (!list.some(function (m) { return m.keep; })) {
    const old = (L.msg && L.msg.keep ? [L.msg] : []).concat(L.queue.filter(function (m) { return m.keep; }));
    if (old.length) { old[0].t = 0; list = list.concat(old); }
  }
  L.msg = list[0]; L.msg.t = 0;
  L.queue = list.slice(1);
  L.frame = -1;
}
function ledClear() { if (LED) { LED.msg = null; LED.queue = []; LED.pos = -1; } }
function ledFinal(score) { ledPlay([ledMsg("count", "FINAL", 7, { from: 0, value: score, prefix: "$", final: true, wait: 0.4 })]); }
function ledPocket(id) {
  if (!LED || S.breakShot) return;
  ledPlay([ledMsg("slide", id + " BALL", 1.0, { color: LED_BALL[id] })], true);
}
function ledDrawMsg(g, m, WW) {
  const HH = LED_ROWS, big = LED_BIG, calm = Shell.reduced, safe = WW - 24;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(WW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.amber;
  function fit(str) { let sx = big; while (sx > 1 && ledTextW(str, sx) > safe) sx--; return sx; }
  function chase(color, dir) {
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < WW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(WW - x - 3, HH - 1, 3, 1); }
  }
  if (m.kind === "count") {
    const k = calm ? 1 : Math.min(1, t / 0.8), v = Math.round(m.from + (m.value - m.from) * k);
    const label = m.text ? m.text + " " : "", pre = m.prefix || "", full = label + pre + m.value, sxc = fit(full);
    const x = Math.round((WW - ledTextW(full, sxc)) / 2), done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
    const xn = ledText(g, label + pre, x, yBig, sxc, big, LED_C.amber);
    ledText(g, String(v), xn, yBig, sxc, big, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
    if (!calm && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(WW * m.t / 0.3), 0, WW, HH); }
    chase(LED_C.amber, 1);
    return;
  }
  const sx = fit(m.text), w = ledTextW(m.text, sx), x0 = Math.round((WW - w) / 2);
  if (m.kind === "flash") {
    if (!calm && t < 0.6 && Math.floor(t * 12) % 2 === 0) { g.fillStyle = LED_C.yellow; g.fillRect(0, 0, WW, HH); ledText(g, m.text, x0, yBig, sx, big, "#000000"); return; }
    const span = 6 * big + 5, ph = calm ? 0 : Math.floor((t * 46) % span);
    for (let k = 0; k < 40; k++) {
      const off = Math.round(w / 2) + 9 + k * span + ph;
      if (off > mid + span) break;
      const cc = k % 2 ? LED_C.red : LED_C.orange;
      ledText(g, ">", mid + off, yBig, big, big, cc); ledText(g, "<", mid - off - 5 * big, yBig, big, big, cc);
    }
    const cyc = [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0, yBig, sx, big, calm ? LED_C.yellow : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 14; i++) g.fillRect((vrand() * WW) | 0, (vrand() * HH) | 0, 1, 1); }
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "slide") {
    const k = calm ? 1 : Math.min(1, t / 0.45), e = 1 - Math.pow(1 - k, 3), x = Math.round(x0 + (1 - e) * WW);
    ledText(g, m.text, x, yBig, sx, big, col);
    if (!calm && k >= 1) {
      const bx = Math.floor(((t - 0.45) * 160) % (WW + 80)) - 40;
      g.save(); g.beginPath(); g.rect(bx, 0, 12, HH); g.clip(); ledText(g, m.text, x, yBig, sx, big, "#ffffff"); g.restore();
    }
    chase(col, -1);
    return;
  }
  if (m.kind === "cycle") {
    const cyc = [LED_C.yellow, LED_C.pink, LED_C.cyan, LED_C.lime, LED_C.orange];
    let x = x0;
    for (let i = 0; i < m.text.length; i++) x = ledText(g, m.text[i], x, yBig, sx, big, cyc[(i + (calm ? 0 : Math.floor(t * 9))) % cyc.length]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 10; i++) g.fillRect((vrand() * WW) | 0, (vrand() * HH) | 0, 1, 1); }
    chase(LED_C.yellow, 1);
    return;
  }
  if (calm || t > 1.1 || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, yBig, sx, big, col);
  g.fillStyle = col; g.fillRect(0, HH - 1, WW, 1); g.fillRect(0, 0, WW, 1);
}
function ledDraw() {
  const L = LED, g = L.g, HH = LED_ROWS;
  g.fillStyle = "#000000"; g.fillRect(0, 0, L.cols, HH);
  if (L.msg) {
    for (let s = 0; s < L.segs.length; s++) {
      g.save(); g.translate(L.starts[s], 0);
      g.beginPath(); g.rect(0, 0, L.segs[s], HH); g.clip();
      ledDrawMsg(g, L.msg, L.segs[s]);
      g.restore();
    }
    return;
  }
  const sw = L.strip.width;
  let sx = L.pos, dx = 0;
  while (dx < L.cols) { const n = Math.min(L.cols - dx, sw - sx); g.drawImage(L.strip, sx, 0, n, HH, dx, 0, n, HH); dx += n; sx = 0; }
}
function ledTick(dt) {
  const L = LED;
  if (!L) return;
  let redraw = false;
  if (L.msg) { L.msg.t += dt; if (L.msg.t >= L.msg.dur) { L.msg = L.queue.shift() || null; L.frame = -1; redraw = true; } }
  if (L.msg) { const f = Math.floor(L.msg.t * 30); if (f !== L.frame) { L.frame = f; redraw = true; } }
  else {
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
function shade(hex, k) {
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
// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Plain lettering stands in if the PNG is missing.
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
const CANDY_FACE = '"Arial Black", "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
function candyText(g, str, x, y, size, maxW, top, bot, edge) {
  g.font = "900 " + size + "px " + CANDY_FACE;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + CANDY_FACE; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = size * 0.36; g.strokeStyle = edge || "#08205f"; g.strokeText(str, x, y + size * 0.06);
  g.lineWidth = size * 0.17; g.strokeStyle = "#ffffff"; g.strokeText(str, x, y);
  const gr = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  gr.addColorStop(0, top || "#fff06a"); gr.addColorStop(0.55, "#ffc21a"); gr.addColorStop(1, bot || "#ff7a0f");
  g.fillStyle = gr; g.fillText(str, x, y);
  g.fillStyle = "rgba(255,255,255,.45)";
  g.save(); g.beginPath(); g.rect(x - 900, y - size * 0.5, 1800, size * 0.36); g.clip(); g.fillText(str, x, y); g.restore();
}
// Recolor the wordmark: f maps a pixel's lightness (0..1) to [r, g, b].
function tintScript(script, w, h, f, pad) {
  pad = pad || 8;
  const c = mkCanvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
  drawScript(g, script, w / 2, h / 2, w - pad * 2, h - pad * 2);
  try {
    const im = g.getImageData(0, 0, w, h), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const L = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255, o = f(L);
      d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2];
    }
    g.putImageData(im, 0, 0);
  } catch (e) { /* leave it in its own colors */ }
  return c;
}

/* ---- the table ---- */
const CLOTH = "#0f7d86";
function clothCanvas() {
  const c = mkCanvas(512, 512), g = c.getContext("2d"), rnd = rng(3);
  g.fillStyle = CLOTH; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.045)" : "rgba(0,30,35,.07)";
    g.fillRect(rnd() * 512, rnd() * 512, 1, 1 + rnd() * 2);
  }
  return c;
}
// The bed decal: the wordmark woven into the cloth a few shades lighter, and the spots and the head string.
function bedCanvas(script) {
  const N = 1024, c = mkCanvas(N, N / 2), g = c.getContext("2d");
  const X = function (x) { return (x + HL) / (2 * HL) * N; }, Y = function (y) { return (HW - y) / (2 * HW) * (N / 2); };
  const mark = tintScript(script, 640, 270, function (L) { return [20 + 150 * L, 120 + 125 * L, 126 + 120 * L]; });
  g.globalAlpha = 0.55; g.drawImage(mark, X(-17) , Y(7.2), X(17) - X(-17), Y(-7.2) - Y(7.2)); g.globalAlpha = 1;
  g.fillStyle = "rgba(255,255,255,.75)";
  [[FOOT_SPOT, 0], [HEAD_STRING, 0]].forEach(function (p) { g.beginPath(); g.arc(X(p[0]), Y(p[1]), 4, 0, TAU); g.fill(); });
  g.fillStyle = "rgba(255,255,255,.16)"; g.fillRect(X(HEAD_STRING) - 1, Y(HW) + 4, 2, Y(-HW) - Y(HW) - 8);
  return c;
}
function walnutCanvas() {
  const c = mkCanvas(512, 128), g = c.getContext("2d"), rnd = rng(13);
  const bg = g.createLinearGradient(0, 0, 0, 128);
  bg.addColorStop(0, "#5a2a16"); bg.addColorStop(0.5, "#46200f"); bg.addColorStop(1, "#3a1a0c");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 70; i++) {                          // grain runs along u, wavy
    const y0 = rnd() * 128, amp = 1 + rnd() * 4, f = 1 + rnd() * 3;
    g.strokeStyle = rnd() < 0.6 ? "rgba(20,6,2," + (0.12 + rnd() * 0.2) + ")" : "rgba(160,90,50," + (0.06 + rnd() * 0.1) + ")";
    g.lineWidth = 0.6 + rnd() * 1.6; g.beginPath();
    for (let x = 0; x <= 512; x += 8) g.lineTo(x, y0 + Math.sin(x / 512 * TAU * f + i) * amp);
    g.stroke();
  }
  return c;
}
function apronCanvas(script) {
  const c = mkCanvas(1024, 128), g = c.getContext("2d");
  g.drawImage(walnutCanvas(), 0, 0, 1024, 128);
  g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, 0, 1024, 8); g.fillRect(0, 120, 1024, 8);
  // the brass nameplate
  const px = 300, pw = 424;
  rrectPath(g, px, 18, pw, 92, 18);
  const br = g.createLinearGradient(0, 18, 0, 110);
  br.addColorStop(0, "#ffe7a0"); br.addColorStop(0.45, "#d9a443"); br.addColorStop(1, "#8a5a17");
  g.fillStyle = br; g.fill(); g.lineWidth = 4; g.strokeStyle = "#5e3c0c"; g.stroke();
  rrectPath(g, px + 10, 28, pw - 20, 72, 12); g.fillStyle = "#0d1f5c"; g.fill();
  drawScript(g, script, px + pw / 2, 64, pw - 50, 62);
  return c;
}
// A pool ball, as a wrap: u runs around the equator, v pole to pole. Number disks sit on the equator at u = .25 and .75.
function ballCanvas(n, script) {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), col = BALL_COLS[n];
  if (n === 0) {
    g.fillStyle = "#fbfaf2"; g.fillRect(0, 0, 512, 256);
    const SW = 120, SH = Math.round(SW * script.height / script.width), rowH = script.height / SH;
    [128, 384].forEach(function (cx) {
      for (let r = 0; r < SH; r++) {
        const y = 128 - Math.round(SH / 2) + r, lat = (0.5 - (y + 0.5) / 256) * Math.PI, w = SW / Math.max(0.4, Math.cos(lat));
        g.drawImage(script, 0, r * rowH, script.width, rowH, cx - w / 2, y, w, 1);
      }
    });
    return c;
  }
  if (n >= 9) {
    g.fillStyle = "#fbfaf2"; g.fillRect(0, 0, 512, 256);
    g.fillStyle = col; g.fillRect(0, 74, 512, 108);
  } else { g.fillStyle = col; g.fillRect(0, 0, 512, 256); }
  [128, 384].forEach(function (cx) {
    g.fillStyle = "#fbfaf2"; g.beginPath(); g.ellipse(cx, 128, 33, 33, 0, 0, TAU); g.fill();
    g.fillStyle = "#121212"; g.font = "bold " + (n > 9 ? 38 : 46) + "px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(String(n), cx, 130);
    if (n === 6 || n === 9) g.fillRect(cx - 11, 152, 22, 3.5);
  });
  // a hint of wear on the paint
  const rnd = rng(n * 17 + 5);
  speckle(g, 512, 256, 160, rnd, "rgba(255,255,255,.06)", "rgba(0,0,0,.05)", 2);
  return c;
}
// A cue as a wrap. v runs butt (0) to tip (1), the canvas top is the tip.
const CUE_LEN = 58;
function cueCanvas(style, script) {
  const c = mkCanvas(128, 1024), g = c.getContext("2d");
  const Y = function (inch) { return (1 - inch / CUE_LEN) * 1024; };
  function band(a, b, fill) { g.fillStyle = fill; g.fillRect(0, Y(b), 128, Y(a) - Y(b)); }
  const shaft = g.createLinearGradient(0, 0, 128, 0);
  shaft.addColorStop(0, "#e9d2a6"); shaft.addColorStop(0.5, "#f6e6c4"); shaft.addColorStop(1, "#e9d2a6");
  band(29.4, 57.2, shaft);
  band(57.2, 57.9, "#f7f4ea"); band(57.9, 58, style.tip);                      // ferrule, tip
  band(28.6, 29.4, "#d9dde4");                                                // the joint collar
  g.fillStyle = "#9aa0aa"; g.fillRect(0, Y(29.4), 128, 2); g.fillRect(0, Y(28.6) - 2, 128, 2);
  band(19.8, 28.6, style.fore);                                               // forearm, with four inlaid points
  g.fillStyle = style.point;
  for (let k = 0; k < 4; k++) {
    const x = k * 32 + 16;
    g.beginPath(); g.moveTo(x - 13, Y(19.8)); g.lineTo(x, Y(27.6)); g.lineTo(x + 13, Y(19.8)); g.closePath(); g.fill();
    g.fillStyle = style.veneer; g.beginPath(); g.moveTo(x - 7, Y(19.8)); g.lineTo(x, Y(25.6)); g.lineTo(x + 7, Y(19.8)); g.closePath(); g.fill();
    g.fillStyle = style.point;
  }
  band(19.4, 19.8, style.ring); band(9.6, 10, style.ring);
  band(10, 19.4, style.wrap);                                                 // linen wrap
  const rnd = rng(31);
  for (let y = Y(19.4); y < Y(10); y += 3) { g.fillStyle = "rgba(255,255,255," + (0.04 + rnd() * 0.05) + ")"; g.fillRect(0, y, 128, 1); }
  band(0.8, 9.6, style.butt);                                                 // butt sleeve, with the wordmark running round it
  g.save(); g.translate(64, (Y(9.2) + Y(1.2)) / 2); g.rotate(-Math.PI / 2);
  drawScript(g, script, 0, 0, Y(1.2) - Y(9.2) - 10, 110);
  g.restore();
  band(0, 0.8, "#111111");
  const gl = g.createLinearGradient(0, 0, 128, 0);                            // lacquer shine
  gl.addColorStop(0, "rgba(255,255,255,0)"); gl.addColorStop(0.3, "rgba(255,255,255,.18)"); gl.addColorStop(0.4, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.fillRect(0, 0, 128, 1024);
  return c;
}

/* ---- the room ---- */
function floorCanvas() {
  const c = mkCanvas(512, 512), g = c.getContext("2d"), rnd = rng(7);
  const pw = 64;
  for (let i = 0; i < 8; i++) {
    let y = -rnd() * 400;
    while (y < 512) {
      const len = 180 + rnd() * 260, l = 18 + rnd() * 9;
      g.fillStyle = "hsl(" + (24 + rnd() * 8) + "," + (38 + rnd() * 14) + "%," + l + "%)";
      g.fillRect(i * pw, y, pw, len);
      for (let k = 0; k < 9; k++) { g.fillStyle = "rgba(0,0,0," + (0.06 + rnd() * 0.08) + ")"; g.fillRect(i * pw + rnd() * pw, y, 1, len); }
      g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(i * pw, y, pw, 2);
      y += len;
    }
    g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(i * pw, 0, 2, 512);
  }
  speckle(g, 512, 512, 3000, rnd, "rgba(255,230,190,.03)", "rgba(0,0,0,.06)");
  return c;
}
function rugCanvas(script) {
  const c = mkCanvas(1024, 640), g = c.getContext("2d"), rnd = rng(19);
  g.fillStyle = "#0c1a4e"; g.fillRect(0, 0, 1024, 640);
  speckle(g, 1024, 640, 30000, rnd, "rgba(255,255,255,.035)", "rgba(0,0,20,.1)");
  g.lineWidth = 22; g.strokeStyle = "#a3192a"; g.strokeRect(22, 22, 980, 596);
  g.lineWidth = 6; g.strokeStyle = "#f2e2bf"; g.strokeRect(44, 44, 936, 552);
  g.lineWidth = 3; g.strokeRect(10, 10, 1004, 620);
  for (let x = 60; x < 980; x += 40) {                    // a little diamond chain inside the border
    [56, 584].forEach(function (y) { g.fillStyle = "#a3192a"; g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 7, y); g.lineTo(x, y + 7); g.lineTo(x - 7, y); g.fill(); });
  }
  // the wordmark at each end, reading from that end of the table
  [[110, Math.PI / 2], [914, -Math.PI / 2]].forEach(function (e) {
    g.save(); g.translate(e[0], 320); g.rotate(e[1]); drawScript(g, script, 0, 0, 440, 150); g.restore();
  });
  return c;
}
function brickCanvas() {
  const c = mkCanvas(512, 512), g = c.getContext("2d"), rnd = rng(23);
  g.fillStyle = "#3a2a24"; g.fillRect(0, 0, 512, 512);
  const bw = 64, bh = 24;
  for (let r = 0; r < 512 / bh; r++) {
    for (let k = -1; k < 512 / bw + 1; k++) {
      const x = k * bw + (r % 2 ? bw / 2 : 0), y = r * bh;
      const l = 22 + rnd() * 12, h = 6 + rnd() * 12;
      g.fillStyle = "hsl(" + h + "," + (42 + rnd() * 18) + "%," + l + "%)";
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      speckle(g, 0, 0, 0, rnd);
      for (let i = 0; i < 14; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255,200,170,.06)" : "rgba(0,0,0,.12)"; g.fillRect(x + 2 + rnd() * (bw - 6), y + 2 + rnd() * (bh - 6), 2 + rnd() * 5, 1 + rnd() * 3); }
      g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(x + 2, y + 2, bw - 4, 2);
    }
  }
  return c;
}
function wainscotCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  g.drawImage(walnutCanvas(), 0, 0, 512, 256);
  g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 2; i++) {
    const x = i * 256 + 26;
    g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,.45)"; g.strokeRect(x, 34, 204, 180);
    g.lineWidth = 2; g.strokeStyle = "rgba(255,190,140,.16)"; g.strokeRect(x - 4, 30, 212, 188);
  }
  g.fillStyle = "#2a1208"; g.fillRect(0, 0, 512, 14); g.fillStyle = "rgba(255,200,150,.18)"; g.fillRect(0, 14, 512, 2);
  return c;
}
function tinCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  g.fillStyle = "#3b2c22"; g.fillRect(0, 0, 256, 256);
  g.lineWidth = 3; g.strokeStyle = "rgba(255,210,160,.12)"; g.strokeRect(6, 6, 244, 244);
  g.strokeStyle = "rgba(0,0,0,.35)"; g.strokeRect(10, 10, 236, 236);
  for (let k = 0; k < 3; k++) { g.lineWidth = 3; g.strokeStyle = k % 2 ? "rgba(0,0,0,.3)" : "rgba(255,210,160,.14)"; g.beginPath(); g.arc(128, 128, 30 + k * 26, 0, TAU); g.stroke(); }
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.fillStyle = "rgba(255,210,160,.12)"; g.beginPath(); g.arc(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100, 9, 0, TAU); g.fill(); }
  return c;
}
// Neon: glowing tube lettering on a clear background, drawn additively over the brick.
function neonCanvas(w, h, draw) {
  const c = mkCanvas(w, h), g = c.getContext("2d");
  g.lineJoin = "round"; g.lineCap = "round";
  draw(g);
  return c;
}
function neonText(g, str, x, y, size, color, font) {
  g.font = font || ("900 " + size + "px " + CANDY_FACE);
  g.textAlign = "center"; g.textBaseline = "middle";
  for (let k = 0; k < 3; k++) { g.shadowColor = color; g.shadowBlur = [28, 14, 6][k]; g.lineWidth = size * [0.16, 0.11, 0.07][k]; g.strokeStyle = color; g.strokeText(str, x, y); }
  g.shadowBlur = 0; g.lineWidth = size * 0.035; g.strokeStyle = "rgba(255,255,255,.95)"; g.strokeText(str, x, y);
}
function hallNeon() {
  return neonCanvas(1024, 384, function (g) {
    neonText(g, "POOL HALL", 512, 112, 120, "#ff3fa4");
    neonText(g, "HUSTLE", 512, 270, 150, "#3ff0ff", "italic 900 150px Georgia, 'Times New Roman', serif");
    g.shadowColor = "#ffd23f"; g.shadowBlur = 16; g.lineWidth = 6; g.strokeStyle = "#ffd23f";
    g.beginPath(); g.moveTo(120, 352); g.lineTo(904, 352); g.stroke(); g.shadowBlur = 0;
  });
}
function eightNeon() {
  return neonCanvas(512, 256, function (g) {
    g.shadowColor = "#ff8a1e"; g.shadowBlur = 22; g.lineWidth = 9; g.strokeStyle = "#ff8a1e";
    g.beginPath(); g.arc(128, 128, 88, 0, TAU); g.stroke();
    g.lineWidth = 6; g.strokeStyle = "#fff6c8"; g.beginPath(); g.arc(128, 128, 40, 0, TAU); g.stroke(); g.shadowBlur = 0;
    neonText(g, "8", 128, 132, 64, "#fff6c8");
    neonText(g, "BALL", 360, 130, 96, "#7dff3a");
  });
}
function openNeon() {
  return neonCanvas(512, 192, function (g) {
    g.shadowColor = "#2fe6ff"; g.shadowBlur = 18; g.lineWidth = 8; g.strokeStyle = "#2fe6ff"; rrectPath(g, 30, 24, 452, 144, 30); g.stroke(); g.shadowBlur = 0;
    neonText(g, "OPEN LATE", 256, 98, 76, "#ff3322");
  });
}
// The lit sign over the bar: the wordmark on a deep blue lightbox.
function lightboxCanvas(script) {
  const c = mkCanvas(1024, 384), g = c.getContext("2d");
  const bg = g.createRadialGradient(512, 192, 30, 512, 192, 560);
  bg.addColorStop(0, "#2f6bff"); bg.addColorStop(0.6, "#1438a8"); bg.addColorStop(1, "#091a5a");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 384);
  g.lineWidth = 16; g.strokeStyle = "#ff9214"; g.strokeRect(8, 8, 1008, 368);
  g.lineWidth = 4; g.strokeStyle = "#ffe45c"; g.strokeRect(22, 22, 980, 340);
  for (let i = 0; i < 30; i++) {                          // marquee bulbs around the edge
    const x = 44 + i * 32.4;
    [40, 344].forEach(function (y) { const gr = g.createRadialGradient(x, y, 0, x, y, 10); gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.5, "#fff2a8"); gr.addColorStop(1, "rgba(255,210,80,0)"); g.fillStyle = gr; g.fillRect(x - 10, y - 10, 20, 20); });
  }
  const gl = g.createLinearGradient(0, 0, 0, 170);
  gl.addColorStop(0, "rgba(255,255,255,.3)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.beginPath(); g.ellipse(512, -20, 600, 170, 0, 0, TAU); g.fill();
  drawScript(g, script, 512, 196, 860, 270);
  return c;
}
function posterCanvas(script, kind) {
  const c = mkCanvas(512, 704), g = c.getContext("2d"), rnd = rng(kind * 7 + 1);
  if (kind === 0) {
    const bg = g.createLinearGradient(0, 0, 0, 704);
    bg.addColorStop(0, "#0b1f5e"); bg.addColorStop(1, "#05102f");
    g.fillStyle = bg; g.fillRect(0, 0, 512, 704);
    for (let i = 0; i < 18; i += 2) { g.fillStyle = "rgba(255,255,255,.05)"; g.beginPath(); g.moveTo(256, 380); g.arc(256, 380, 700, i / 18 * TAU, (i + 1) / 18 * TAU); g.fill(); }
    drawScript(g, script, 256, 92, 440, 150);
    // a rack of balls, drawn flat
    const tri = triangle(5);
    const nums = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
    tri.forEach(function (p, i) {
      const x = 256 + p.y * 18, y = 470 - (p.x - FOOT_SPOT) * 18, n = nums[i];
      g.fillStyle = "rgba(0,0,0,.4)"; g.beginPath(); g.arc(x + 3, y + 4, 19, 0, TAU); g.fill();
      g.fillStyle = n >= 9 ? "#fbfaf2" : BALL_COLS[n]; g.beginPath(); g.arc(x, y, 19, 0, TAU); g.fill();
      if (n >= 9) { g.save(); g.beginPath(); g.arc(x, y, 19, 0, TAU); g.clip(); g.fillStyle = BALL_COLS[n]; g.fillRect(x - 20, y - 10, 40, 20); g.restore(); }
      g.fillStyle = "#fbfaf2"; g.beginPath(); g.arc(x, y, 8, 0, TAU); g.fill();
      g.fillStyle = "#111"; g.font = "bold 10px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(n), x, y + 1);
      g.fillStyle = "rgba(255,255,255,.5)"; g.beginPath(); g.arc(x - 7, y - 8, 5, 0, TAU); g.fill();
    });
    candyText(g, "POOL HALL", 256, 222, 66, 460);
    candyText(g, "HUSTLE", 256, 292, 82, 460);
    g.fillStyle = "#ffe45c"; g.font = "bold 22px " + HUD_FONT; g.textAlign = "center"; g.fillText("8-BALL  *  9-BALL  *  EVERY NIGHT", 256, 600);
    g.fillStyle = "#a8ecff"; g.font = "bold 18px " + HUD_FONT; g.fillText("THENOSTALGIAPRO.COM", 256, 644);
  } else {
    g.fillStyle = "#e8d7b0"; g.fillRect(0, 0, 512, 704);
    speckle(g, 512, 704, 9000, rnd, "rgba(255,255,255,.06)", "rgba(90,60,20,.07)", 3);
    g.strokeStyle = "#5a3a16"; g.lineWidth = 10; g.strokeRect(18, 18, 476, 668);
    g.fillStyle = "#4a1c10"; g.font = "900 64px " + CANDY_FACE; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("HOUSE PRO", 256, 92);
    // a portrait frame with a silhouette in a fedora
    g.fillStyle = "#2a2230"; g.fillRect(96, 140, 320, 300);
    g.fillStyle = "#14101a";
    g.beginPath(); g.ellipse(256, 300, 70, 84, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(256, 222, 120, 20, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(186, 222); g.quadraticCurveTo(200, 160, 256, 160); g.quadraticCurveTo(312, 160, 326, 222); g.fill();
    g.beginPath(); g.moveTo(130, 440); g.quadraticCurveTo(150, 360, 256, 370); g.quadraticCurveTo(362, 360, 382, 440); g.fill();
    g.fillStyle = "#4a1c10"; g.font = "900 54px " + CANDY_FACE; g.fillText("VELVET RHETT", 256, 500);
    g.font = "bold 24px " + HUD_FONT; g.fillText("ASK FOR A FRIENDLY GAME", 256, 560);
    g.font = "bold 20px " + HUD_FONT; g.fillText("(HE NEVER PLAYS FRIENDLY)", 256, 600);
    drawScript(g, script, 256, 648, 220, 54);
  }
  return c;
}
function chalkboardCanvas() {
  const c = mkCanvas(512, 384), g = c.getContext("2d"), rnd = rng(41);
  g.fillStyle = "#1d2a24"; g.fillRect(0, 0, 512, 384);
  speckle(g, 512, 384, 6000, rnd, "rgba(255,255,255,.035)", "rgba(0,0,0,.08)", 4);
  g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 30;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(rnd() * 512, rnd() * 384); g.quadraticCurveTo(rnd() * 512, rnd() * 384, rnd() * 512, rnd() * 384); g.stroke(); }
  const lines = [["TONIGHT AT THE HALL", 34, "#fff6e0"], ["8-BALL  &  9-BALL", 30, "#ffd0e8"], ["RACKS $20", 30, "#d6f6ff"],
                 ["DOUBLE OR NOTHING", 28, "#fff6e0"], ["NO SHARKING. MOSTLY.", 24, "#e6ffd6"]];
  g.textAlign = "center"; g.textBaseline = "middle";
  lines.forEach(function (l, i) {
    g.font = "bold " + l[1] + "px 'Comic Sans MS', 'Chalkboard SE', 'Trebuchet MS', " + HUD_FONT;
    g.fillStyle = l[2]; g.globalAlpha = 0.88;
    g.save(); g.translate(256, 60 + i * 66); g.rotate((rnd() - 0.5) * 0.05); g.fillText(l[0], 0, 0); g.restore();
  });
  g.globalAlpha = 1;
  return c;
}
function jukeboxCanvas() {
  const c = mkCanvas(256, 512), g = c.getContext("2d");
  g.fillStyle = "#1a0f18"; g.fillRect(0, 0, 256, 512);
  const arch = g.createLinearGradient(0, 0, 256, 0);
  ["#ff3fa4", "#ffb000", "#7dff3a", "#2fe6ff", "#b68cff"].forEach(function (col, i, a) { arch.addColorStop(i / (a.length - 1), col); });
  g.save(); g.beginPath(); g.moveTo(10, 250); g.lineTo(10, 128); g.arc(128, 128, 118, Math.PI, 0); g.lineTo(246, 250); g.closePath();
  g.fillStyle = arch; g.fill();
  g.beginPath(); g.moveTo(34, 250); g.lineTo(34, 132); g.arc(128, 132, 94, Math.PI, 0); g.lineTo(222, 250); g.closePath();
  g.fillStyle = "#2a1630"; g.fill();
  g.restore();
  // the title strips behind the glass
  g.fillStyle = "#f4ead4";
  for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) { g.fillRect(48 + k * 84, 120 + r * 28, 76, 20); g.fillStyle = "#c2302a"; g.fillRect(48 + k * 84, 120 + r * 28, 76, 4); g.fillStyle = "#f4ead4"; }
  g.fillStyle = "#333"; g.font = "bold 9px " + HUD_FONT; g.textAlign = "center";
  const t = ["SIDE POCKET", "NEON NIGHTS", "CHALK IT UP", "LAST CALL", "RACK ATTACK", "EIGHT BALL", "SLOW ROLL", "BANK ON IT"];
  for (let i = 0; i < 8; i++) g.fillText(t[i], 86 + (i % 2) * 84, 134 + Math.floor(i / 2) * 28);
  // speaker grille and chrome
  g.fillStyle = "#3a2830"; g.fillRect(28, 290, 200, 170);
  g.strokeStyle = "#c9ccd6"; g.lineWidth = 3;
  for (let x = 40; x < 228; x += 14) { g.beginPath(); g.moveTo(x, 296); g.lineTo(x, 454); g.stroke(); }
  g.fillStyle = "#d8dbe2"; g.fillRect(10, 262, 236, 14); g.fillRect(10, 474, 236, 14);
  return c;
}
function windowCanvas() {
  const c = mkCanvas(256, 384), g = c.getContext("2d"), rnd = rng(61);
  const sky = g.createLinearGradient(0, 0, 0, 384);
  sky.addColorStop(0, "#08102e"); sky.addColorStop(1, "#28204a");
  g.fillStyle = sky; g.fillRect(0, 0, 256, 384);
  for (let i = 0; i < 9; i++) {                           // the buildings across the street
    const x = i * 30 - 10, w = 26 + rnd() * 20, top = 120 + rnd() * 120;
    g.fillStyle = "#0b0f22"; g.fillRect(x, top, w, 384 - top);
    for (let y = top + 6; y < 360; y += 12) for (let xx = x + 4; xx < x + w - 4; xx += 8) if (rnd() < 0.3) { g.fillStyle = rnd() < 0.7 ? "#ffd86a" : "#8fe0ff"; g.fillRect(xx, y, 4, 6); }
  }
  g.fillStyle = "rgba(255,63,164,.25)"; g.fillRect(0, 300, 256, 84);
  for (let y = 0; y < 384; y += 16) { g.fillStyle = "rgba(220,214,196,.78)"; g.fillRect(0, y, 256, 9); g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, y + 9, 256, 1); }   // blinds, half open
  g.lineWidth = 14; g.strokeStyle = "#2a1208"; g.strokeRect(0, 0, 256, 384); g.fillStyle = "#2a1208"; g.fillRect(122, 0, 12, 384);
  return c;
}
function barFrontCanvas(script) {
  const c = mkCanvas(1024, 256), g = c.getContext("2d");
  g.fillStyle = "#3a0d16"; g.fillRect(0, 0, 1024, 256);
  for (let y = 24; y < 256; y += 46) for (let x = (y / 46 % 2) * 23 + 12; x < 1024; x += 46) {   // tufted leather
    const gr = g.createRadialGradient(x, y, 1, x, y, 26);
    gr.addColorStop(0, "rgba(0,0,0,.5)"); gr.addColorStop(0.2, "rgba(120,30,44,.4)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(x - 26, y - 26, 52, 52);
    g.fillStyle = "#d9a443"; g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill();
  }
  rrectPath(g, 352, 60, 320, 136, 20);
  const br = g.createLinearGradient(0, 60, 0, 196);
  br.addColorStop(0, "#ffe7a0"); br.addColorStop(0.45, "#d9a443"); br.addColorStop(1, "#8a5a17");
  g.fillStyle = br; g.fill();
  rrectPath(g, 364, 72, 296, 112, 14); g.fillStyle = "#0d1f5c"; g.fill();
  drawScript(g, script, 512, 128, 270, 100);
  g.fillStyle = "#1a0606"; g.fillRect(0, 0, 1024, 10); g.fillRect(0, 238, 1024, 18);
  return c;
}
function mirrorCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 512, 256);
  bg.addColorStop(0, "#1c2440"); bg.addColorStop(0.5, "#384770"); bg.addColorStop(1, "#151a30");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "rgba(255,255,255,.08)";
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(60 + i * 130, 0); g.lineTo(110 + i * 130, 0); g.lineTo(40 + i * 130, 256); g.lineTo(-10 + i * 130, 256); g.fill(); }
  return c;
}
// The lamp canopy over the table: the wordmark on both long sides.
function lampCanvas(script) {
  const c = mkCanvas(1024, 160), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 160);
  bg.addColorStop(0, "#14306e"); bg.addColorStop(1, "#0a1a48");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 160);
  g.fillStyle = "#d9a443"; g.fillRect(0, 0, 1024, 10); g.fillRect(0, 150, 1024, 10);
  drawScript(g, script, 512, 80, 600, 124);
  candyText(g, "8", 90, 80, 74); candyText(g, "9", 934, 80, 74);
  return c;
}
function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(0,0,0,.75)"); gr.addColorStop(0.55, "rgba(0,0,0,.38)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function glowCanvas(col) {
  const c = mkCanvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, col || "rgba(255,240,200,.9)"); gr.addColorStop(0.3, "rgba(255,230,180,.35)"); gr.addColorStop(1, "rgba(255,230,180,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
// A tiny painted room for the gloss on the balls, the rails and the chrome: a bright lamp overhead, a warm dark hall.
function envFaces() {
  const side = function (k) {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#2a1c18"); gr.addColorStop(0.35, k ? "#5a3a2a" : "#3f2a40"); gr.addColorStop(0.5, "#1a1214"); gr.addColorStop(0.52, "#0f6f78"); gr.addColorStop(1, "#0a4a50");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = k ? "rgba(255,63,164,.7)" : "rgba(63,240,255,.6)"; g.fillRect(10 + k * 20, 16, 18, 4);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#1a1210"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(8, 26, 48, 12);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#0f7d86"; bgx.fillRect(0, 0, 64, 64);
  return [side(0), side(1), top, bot, side(1), side(0)];
}

/* ---------------- People ----------------
   Sculpted, jointed figures at life size (inches). Every body is built from turned (lathe) shapes with real
   profiles: a torso with a waist, chest and shoulders, limbs that swell at the muscle and taper to the wrist
   and ankle, a neck, a head with a jaw, chin, cheeks, nose, ears, lidded eyes and brows, five-fingered hands
   and proper shoes. A pose is a few numbers (hips, lean, where the hands and feet go); elbows and knees are
   solved from those. Clothes are painted canvases with folds and readable logos. All four are originals. */
const LIMB = {
  upArm:  [[0.88, 0], [1.1, 0.1], [1.08, 0.24], [1.0, 0.44], [0.85, 0.7], [0.75, 0.9], [0.72, 1]],
  foreArm:[[0.8, 0], [1.02, 0.15], [0.99, 0.3], [0.82, 0.55], [0.63, 0.8], [0.55, 0.95], [0.53, 1]],
  sleeve: [[0.92, 0], [0.99, 0.2], [0.93, 0.5], [0.84, 0.84], [0.88, 0.94], [0.88, 1]],
  thigh:  [[1.0, 0], [1.04, 0.12], [0.99, 0.35], [0.89, 0.62], [0.77, 0.88], [0.73, 1]],
  shin:   [[0.74, 0], [0.83, 0.12], [0.87, 0.27], [0.77, 0.5], [0.61, 0.78], [0.51, 0.95], [0.49, 1]],
  pantShin: [[0.78, 0], [0.8, 0.2], [0.77, 0.5], [0.71, 0.8], [0.73, 0.95], [0.76, 1]]
};
const TORSO = [[0.2, -3.6], [5.9, -3.4], [6.5, -1.5], [6.4, 1.2], [6.0, 4.0], [6.1, 6.5], [6.7, 10], [7.3, 13.5], [7.6, 16.4],
               [7.4, 18.0], [6.9, 19.4], [5.9, 20.6], [4.5, 21.6], [3.0, 22.5], [2.4, 23.0], [0.2, 23.2]];
const BODY = { hipX: 3.75, hipDrop: 1.6, thigh: 16.6, shin: 16.3, upArm: 11.6, foreArm: 10.6, shX: 7.3, shY: 19.3, neckY: 21.4, headY: 27.8 };

function latheGeo(T, prof, segs, open) {
  const pts = prof.map(function (p) { return new T.Vector2(p[0], p[1]); });
  const g = new T.LatheGeometry(pts, segs || 16);
  // v follows height (not point index), so painted bands land where they are drawn
  const pos = g.attributes.position, uv = g.attributes.uv;
  let y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < pos.count; i++) { y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i)); }
  for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - y0) / (y1 - y0 || 1));
  g.computeVertexNormals();
  return g;
}

/* ---- clothes and faces, painted ---- */
// A torso wrap: u = 0 (and 1) is the chest, u = .5 the back; v runs hips (0) to neck (1).
function shirtCanvas(o, script) {
  const c = mkCanvas(1024, 512), g = c.getContext("2d"), rnd = rng(o.seed || 1);
  const V = function (inch) { return 512 - (inch + 3.6) / 26.8 * 512; };       // torso height (relative to the pelvis) -> canvas y
  g.fillStyle = o.shirt; g.fillRect(0, 0, 1024, 512);
  if (o.plaid) {
    for (let x = 0; x < 1024; x += 64) { g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(x, 0, 22, 512); g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(x + 40, 0, 6, 512); }
    for (let y = 0; y < 512; y += 64) { g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(0, y, 1024, 22); g.fillStyle = "rgba(255,230,120,.12)"; g.fillRect(0, y + 40, 1024, 5); }
  }
  // folds: pull lines from the armpits toward the waist, bunching above the belt, drape down the back
  function fold(x1, y1, cx, cy, x2, y2, w, dark) {
    g.strokeStyle = dark ? "rgba(0,0,0,.2)" : "rgba(255,255,255,.1)"; g.lineWidth = w; g.lineCap = "round";
    g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(cx, cy, x2, y2); g.stroke();
  }
  for (let s = -1; s <= 1; s += 2) {
    for (let k = 0; k < 3; k++) {
      const x0 = (s > 0 ? 200 : 824) + s * k * 14;
      fold(x0, V(17), x0 - s * 30, V(11), x0 - s * 70, V(4 + k), 7 - k * 1.5, true);
      fold(x0 + s * 6, V(17), x0 - s * 26, V(11), x0 - s * 64, V(4.5 + k), 3, false);
    }
  }
  for (let k = 0; k < 9; k++) { const x = rnd() * 1024, y = V(2 + rnd() * 2.5); fold(x - 30, y, x, y + 6, x + 30, y - 2, 5, true); }
  for (let k = 0; k < 6; k++) { const x = 380 + rnd() * 260; fold(x, V(19), x + 8, V(10), x - 4, V(0), 6, true); fold(x + 7, V(19), x + 15, V(10), x + 3, V(0), 2, false); }
  // underarm shading and a soft light from above
  const sh = g.createLinearGradient(0, 0, 0, 512);
  sh.addColorStop(0, "rgba(255,255,255,.1)"); sh.addColorStop(0.6, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.18)");
  g.fillStyle = sh; g.fillRect(0, 0, 1024, 512);
  if (o.vest) {                                           // a pinstripe vest over the shirt, open in a V at the chest
    g.save();
    g.beginPath();
    g.moveTo(0, V(-3.6)); g.lineTo(1024, V(-3.6)); g.lineTo(1024, V(23.2)); g.lineTo(0, V(23.2)); g.closePath();
    // cut the V (around u = 0 / 1) and the armholes out of the vest
    g.moveTo(0, V(23.2)); g.lineTo(0, V(10)); g.lineTo(52, V(23.2)); g.closePath();
    g.moveTo(1024, V(23.2)); g.lineTo(1024, V(10)); g.lineTo(972, V(23.2)); g.closePath();
    g.clip("evenodd");
    g.fillStyle = o.vest; g.fillRect(0, 0, 1024, 512);
    for (let x = 0; x < 1024; x += 12) { g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(x, 0, 1.5, 512); }
    for (let k = 0; k < 8; k++) { const x = rnd() * 1024; fold(x, V(14), x + 10, V(6), x - 6, V(-2), 6, true); }
    g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, V(-1), 1024, 6);
    // the back: satin panel with the gold embroidered patch
    g.fillStyle = o.vestBack; g.fillRect(300, 0, 424, 512);
    for (let k = 0; k < 6; k++) fold(330 + k * 64, V(21), 340 + k * 64, V(9), 332 + k * 64, V(-3), 5, true);
    g.restore();
    g.fillStyle = "#e9d6a0";                               // vest buttons down both edges of the V
    for (let k = 0; k < 4; k++) { const y = V(9 - k * 2.6); g.beginPath(); g.arc(18, y, 5, 0, TAU); g.fill(); g.beginPath(); g.arc(1006, y, 5, 0, TAU); g.fill(); }
    // tie down the V
    g.fillStyle = o.tie; g.beginPath(); g.moveTo(0, V(22.5)); g.lineTo(14, V(21.8)); g.lineTo(10, V(10.5)); g.lineTo(0, V(9)); g.fill();
    g.beginPath(); g.moveTo(1024, V(22.5)); g.lineTo(1010, V(21.8)); g.lineTo(1014, V(10.5)); g.lineTo(1024, V(9)); g.fill();
  }
  if (o.jacket) {                                         // varsity jacket: knit bands at the hem and collar, snaps down the front
    g.fillStyle = o.trim; g.fillRect(0, V(-1.2), 1024, V(-3.6) - V(-1.2));
    for (let y = V(-1.2); y < V(-3.6); y += 7) { g.fillStyle = "rgba(0,0,0,.15)"; g.fillRect(0, y, 1024, 2); }
    g.fillStyle = o.trim; g.fillRect(0, V(23.2), 1024, V(21.6) - V(23.2));
    g.fillStyle = "#d8dce6"; for (let k = 0; k < 5; k++) { const y = V(2 + k * 4); g.beginPath(); g.arc(8, y, 5, 0, TAU); g.fill(); g.beginPath(); g.arc(1016, y, 5, 0, TAU); g.fill(); }
  }
  if (o.collar) { g.fillStyle = o.collar; g.fillRect(0, V(23.2), 1024, V(21.9) - V(23.2)); }
  // logos
  if (o.front) o.front(g, V, script);
  if (o.back) o.back(g, V, script);
  return c;
}
function hallBadge(g, x, y, r) {                          // the HUSTLE HALL badge: an 8-ball in a ring of lettering
  g.save(); g.translate(x, y);
  g.fillStyle = "#f2e2bf"; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.fillStyle = "#a3192a"; g.beginPath(); g.arc(0, 0, r * 0.9, 0, TAU); g.fill();
  g.fillStyle = "#111"; g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.fill();
  g.fillStyle = "#fbfaf2"; g.beginPath(); g.arc(0, 0, r * 0.25, 0, TAU); g.fill();
  g.fillStyle = "#111"; g.font = "bold " + Math.round(r * 0.34) + "px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("8", 0, 1);
  g.fillStyle = "#f2e2bf"; g.font = "900 " + Math.round(r * 0.2) + "px " + CANDY_FACE;
  const s1 = "HUSTLE", s2 = "HALL";
  for (let i = 0; i < s1.length; i++) { g.save(); g.rotate(-1.05 + i * 0.42); g.fillText(s1[i], 0, -r * 0.7); g.restore(); }
  for (let i = 0; i < s2.length; i++) { g.save(); g.rotate(0.62 - i * 0.42 + Math.PI); g.fillText(s2[i], 0, -r * 0.7); g.restore(); }
  g.restore();
}
// A limb wrap: v runs from the joint nearest the body (0) to the far one (1). fill decides each band.
function limbCanvas(base, opts) {
  const c = mkCanvas(128, 256), g = c.getContext("2d"), rnd = rng(opts.seed || 3);
  const Y = function (v) { return 256 - v * 256; };
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  if (opts.plaid) {
    for (let x = 0; x < 128; x += 32) { g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(x, 0, 11, 256); }
    for (let y = 0; y < 256; y += 32) { g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(0, y, 128, 11); }
  }
  if (opts.stripes) for (let x = 0; x < 128; x += 6) { g.fillStyle = "rgba(255,255,255,.1)"; g.fillRect(x, 0, 1, 256); }
  for (let k = 0; k < (opts.folds || 6); k++) {           // creases bunching around the bend
    const y = Y(opts.foldAt == null ? 0.85 : opts.foldAt) + (rnd() - 0.5) * 40, x = rnd() * 128;
    g.strokeStyle = "rgba(0,0,0,.22)"; g.lineWidth = 3 + rnd() * 3; g.lineCap = "round";
    g.beginPath(); g.moveTo(x - 24, y + 6); g.quadraticCurveTo(x, y - 8, x + 24, y + 4); g.stroke();
    g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 20, y + 10); g.quadraticCurveTo(x, y - 3, x + 20, y + 8); g.stroke();
  }
  for (let k = 0; k < 4; k++) { const x = rnd() * 128; g.fillStyle = "rgba(0,0,0,.1)"; g.fillRect(x, 0, 3, 256); }
  if (opts.skinFrom != null) {                            // a short sleeve: bare arm below the hem
    g.fillStyle = opts.skin; g.fillRect(0, Y(1), 128, Y(opts.skinFrom) - Y(1));
    g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, Y(opts.skinFrom) - 2, 128, 5);
    g.fillStyle = opts.hem || base; g.fillRect(0, Y(opts.skinFrom) - 9, 128, 7);
  }
  if (opts.cuff != null) { g.fillStyle = opts.cuffCol || "rgba(255,255,255,.18)"; g.fillRect(0, Y(1), 128, Y(opts.cuff) - Y(1)); }
  if (opts.rolled != null) {                              // a sleeve rolled up to just below the elbow
    g.fillStyle = opts.rolledCol; g.fillRect(0, Y(opts.rolled), 128, Y(0) - Y(opts.rolled));
    for (let k = 0; k < 3; k++) { g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(0, Y(opts.rolled * (k + 1) / 3) - 2, 128, 3); }
    g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(0, Y(opts.rolled) + 1, 128, 3);
  }
  if (opts.badge) opts.badge(g);
  return c;
}
function faceCanvas(o) {                                   // the jaw: skin, with a day's stubble round the chin and jawline
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(o.seed || 9);
  g.fillStyle = o.skin; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * 512, y = 120 + rnd() * 136;
    if (Math.abs(((x - 128 + 512) % 512) - 0) > 150 && Math.abs(x - 128) > 150) continue;
    g.fillStyle = "rgba(40,28,20," + (0.1 + rnd() * 0.16) + ")"; g.fillRect(x, y, 1.4, 1.4);
  }
  return c;
}
/* ---- the build ---- */
function makePerson(T, M, o) {
  const root = new T.Group();
  const sc = o.scale || 1;
  const skin = new T.MeshPhongMaterial({ color: o.skin, specular: 0x2a1a10, shininess: 14 });
  const face = skin, jawMat = o.stubble ? new T.MeshPhongMaterial({ map: M.tex(faceCanvas(o)), specular: 0x2a1a10, shininess: 14 }) : skin;
  const shirt = new T.MeshLambertMaterial({ map: M.tex(shirtCanvas(o, M.script)) });
  const upArm = new T.MeshLambertMaterial({ map: M.tex(o.upArmCanvas) });
  const foreArm = o.foreArmCanvas ? new T.MeshLambertMaterial({ map: M.tex(o.foreArmCanvas) }) : skin;
  const pants = new T.MeshLambertMaterial({ map: M.tex(o.pantsCanvas) });
  const hair = new T.MeshPhongMaterial({ color: o.hair, specular: o.slick ? 0x8a8a8a : 0x222222, shininess: o.slick ? 70 : 10 });
  const lip = new T.MeshPhongMaterial({ color: o.lip || 0xa8584a, specular: 0x553333, shininess: 30 });
  const dark = new T.MeshBasicMaterial({ color: 0x3a0f0c });
  const white = new T.MeshPhongMaterial({ color: 0xf6f3ea, specular: 0xffffff, shininess: 90 });
  const iris = new T.MeshPhongMaterial({ color: o.eyes || 0x4a2e18, specular: 0xffffff, shininess: 120 });
  const pupil = new T.MeshBasicMaterial({ color: 0x080808 });
  function mesh(geo, mat, parent, x, y, z, sx, sy, sz) {
    const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0);
    if (sx != null) m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
    (parent || root).add(m); return m;
  }
  const P = { root: root, o: o, arms: [], legs: [], hands: [], shoes: [], props: {}, blink: 2 + vrand() * 3, exprNow: "neutral" };

  // hips and torso
  P.pelvis = mesh(M.sphere, pants, root, 0, 0, 0, 6.5 * (o.hips || 1), 4.8, 4.7);
  P.upper = new T.Group(); root.add(P.upper);
  const tg = latheGeo(T, TORSO.map(function (p) { const k = p[1] > 12 ? (o.shoulders || 1) : p[1] < 6 ? (o.waist || 1) : 1; return [p[0] * k, p[1]]; }), 24);
  P.torso = mesh(tg, shirt, P.upper, 0, 0, 0, 1, 1, 0.66 * (o.depth || 1));
  if (o.belly) mesh(M.sphere, new T.MeshLambertMaterial({ color: o.shirt }), P.upper, 0, 6.0, 2.0, 5.7, 6.0, 4.3 * o.belly);
  mesh(M.belt, new T.MeshPhongMaterial({ color: o.belt || 0x1a1410, specular: 0x555555, shininess: 40 }), P.upper, 0, -1.1, 0, 6.42 * (o.waist || 1), 1.25, 4.3 * (o.depth || 1) * (o.belly ? 1.18 : 1));
  if (o.buckle !== false) mesh(M.box, new T.MeshPhongMaterial({ color: 0xd9a443, specular: 0xffffff, shininess: 90 }), P.upper, 0, -1.1, 4.35 * (o.depth || 1) * (o.belly ? 1.2 : 1), 1.5, 1.0, 0.3);
  P.shoulders = [];
  for (let s = 0; s < 2; s++) {
    const sg = s ? -1 : 1;
    P.shoulders.push(mesh(M.sphere, upArm, P.upper, sg * (BODY.shX - 0.7) * (o.shoulders || 1), BODY.shY - 1.1, -0.2, 2.25 * (o.arms || 1), 2.05, 2.35));
  }
  mesh(latheGeo(T, [[2.3, 0], [2.18, 2], [2.08, 4.2], [0.1, 4.6]], 16), skin, P.upper, 0, BODY.neckY, 0.2, o.neck || 1, 1, o.neck || 1);
  if (o.collarRing) mesh(M.torus, new T.MeshLambertMaterial({ color: o.collarRing }), P.upper, 0, BODY.neckY + 0.7, 0.2, 2.55, 2.55, 1.6).rotation.x = Math.PI / 2;

  // head
  const head = P.head = new T.Group(); head.position.set(0, BODY.headY, 0.35); P.upper.add(head);
  mesh(M.sphere, face, head, 0, 0.2, -0.1, 4.05, 4.45, 4.3);                      // cranium
  mesh(M.sphere, jawMat, head, 0, -1.85, 0.25, 3.1, 2.75, 2.95);                  // jaw
  mesh(M.sphere, jawMat, head, 0, -3.75, 2.0, 1.15, 0.95, 1.0);                   // chin
  for (let s = -1; s <= 1; s += 2) {
    const ear = mesh(M.sphere, skin, head, s * 3.95, -0.15, 0.0, 0.42, 1.25, 0.82); ear.rotation.y = s * 0.25;
    mesh(M.sphere, dark, head, s * 4.1, -0.15, 0.08, 0.1, 0.55, 0.32);
  }
  const bridge = mesh(M.sphere, skin, head, 0, -0.05, 3.95, 0.42, 1.25, 0.5); bridge.rotation.x = -0.32;
  mesh(M.sphere, skin, head, 0, -1.1, 4.32, 0.52 * (o.nose || 1), 0.48 * (o.nose || 1), 0.46 * (o.nose || 1));
  for (let s = -1; s <= 1; s += 2) mesh(M.sphere, skin, head, s * 0.47, -1.22, 4.05, 0.36, 0.3, 0.32);
  // eyes, lids, brows
  P.eyes = []; P.lids = []; P.brows = [];
  const browMat = new T.MeshLambertMaterial({ color: o.brows || o.hair });
  for (let s = 0; s < 2; s++) {
    const sg = s ? -1 : 1, ex = sg * 1.42, ey = 0.32, ez = 3.42;
    const eye = new T.Group(); eye.position.set(ex, ey, ez); head.add(eye);
    mesh(M.sphere, white, eye, 0, 0, 0, 0.6);
    mesh(M.sphere, iris, eye, 0, 0, 0.5, 0.34, 0.34, 0.16);
    mesh(M.sphere, pupil, eye, 0, 0, 0.6, 0.16, 0.16, 0.07);
    P.eyes.push(eye);
    const lid = mesh(M.dome, skin, head, ex, ey, ez, 0.66, 0.66, 0.68); lid.rotation.x = -0.95; P.lids.push(lid);
    const low = mesh(M.dome, skin, head, ex, ey - 0.02, ez - 0.04, 0.64, 0.46, 0.66); low.rotation.x = Math.PI + 0.75;
    const brow = mesh(M.brow, browMat, head, ex + sg * 0.1, 1.42, 3.9); brow.rotation.y = sg * 0.22; P.brows.push(brow);
  }
  // mouth: lips, a line that bends into a smile, a smirk or a frown, teeth for a grin, an O for a shock
  const mouth = P.mouth = new T.Group(); mouth.position.set(0, -2.45, o.beard ? 4.05 : 3.62); head.add(mouth);
  mesh(M.sphere, lip, mouth, 0, 0.16, 0, 0.92, 0.19, 0.3);
  P.lowLip = mesh(M.sphere, lip, mouth, 0, -0.24, 0.0, 0.84, 0.24, 0.33);
  P.mline = mesh(M.smile, dark, mouth, 0, 0, 0.27);
  P.teeth = mesh(M.box, white, mouth, 0, -0.05, 0.2, 1.25, 0.3, 0.22); P.teeth.visible = false;
  P.oMouth = mesh(M.sphere, dark, mouth, 0, -0.12, 0.24, 0.36, 0.46, 0.2); P.oMouth.visible = false;
  const fuzz = new T.MeshLambertMaterial({ color: o.hair });
  if (o.mustache) for (let s = -1; s <= 1; s += 2) { const m = mesh(M.sphere, fuzz, mouth, s * 0.48, 0.47, 0.18, 0.62, 0.15, 0.3); m.rotation.z = -s * 0.22; }
  if (o.beard) { mesh(M.sphere, fuzz, head, 0, -2.4, 0.75, 3.55, 2.95, 3.35); mesh(M.sphere, fuzz, head, 0, -4.05, 2.7, 1.55, 1.4, 1.3); }
  // hair
  if (o.hairStyle !== "bald") {
    const cap = mesh(M.cap, hair, head, 0, 0.35, -0.35, 4.28, 4.5, 4.55);
    cap.rotation.x = o.hairStyle === "slick" ? -0.35 : o.hairStyle === "puff" ? -0.5 : -0.15;
    mesh(M.sphere, hair, head, 0, -0.8, -1.6, 3.85, 3.4, 3.2);
    if (o.hairStyle === "puff") { mesh(M.sphere, hair, head, 0, 3.9, -1.9, 3.6, 2.9, 3.3); for (let s = -1; s <= 1; s += 2) mesh(M.sphere, hair, head, s * 3.5, 0.6, -1.4, 1.2, 2.4, 2.4); }
    if (o.hairStyle === "slick") for (let s = -1; s <= 1; s += 2) mesh(M.sphere, hair, head, s * 3.55, 1.0, -0.6, 0.9, 1.9, 2.6);
  }
  if (o.hat === "fedora") {
    const hat = new T.Group(); hat.position.set(0, 2.55, -0.2); hat.rotation.x = 0.1; hat.rotation.z = -0.05; head.add(hat);
    const felt = new T.MeshPhongMaterial({ color: o.hatCol, specular: 0x333333, shininess: 18, side: T.DoubleSide });
    mesh(M.crown, felt, hat, 0, 0, 0, 1, 1, 1.12);
    mesh(M.brim, felt, hat, 0, 0, 0, 1, 1, 1.12);
    mesh(M.band, new T.MeshPhongMaterial({ color: o.bandCol, specular: 0x666666, shininess: 50 }), hat, 0, 0.62, 0, 4.36, 1.05, 4.36 * 1.12);
  } else if (o.hat === "cap") {
    const capM = new T.MeshLambertMaterial({ map: M.tex(o.capCanvas) });
    const cp = mesh(M.cap, capM, head, 0, 0.9, -0.1, 4.45, 4.25, 4.6); cp.rotation.x = -0.05;
    const bill = mesh(M.sphere, new T.MeshLambertMaterial({ color: o.capBill }), head, 0, 1.25, 5.0, 3.0, 0.32, 2.9); bill.rotation.x = 0.12;
  }

  // limbs (live in the root group; posed every frame)
  function limb(geo, m1, m2, geo2, r1, r2, jointMat) {
    const L = { up: new T.Mesh(geo, m1), lo: new T.Mesh(geo2, m2), j1: new T.Mesh(M.sphere, jointMat || m2), r1: r1, r2: r2 };
    root.add(L.up); root.add(L.lo); root.add(L.j1);
    return L;
  }
  const ar = 1.72 * (o.arms || 1), lr = 3.15 * (o.legs || 1);
  for (let s = 0; s < 2; s++) {
    P.arms.push(limb(M.upArm, upArm, foreArm, o.longSleeve ? M.sleeve : M.foreArm, ar, ar * (o.longSleeve ? 0.97 : 0.9), o.longSleeve ? foreArm : upArm));
    P.legs.push(limb(M.thigh, pants, pants, o.pantsShin === false ? M.shin : M.pantShin, lr, lr * 0.95, pants));
    P.hands.push(makeHand(T, M, s === 0 ? -1 : 1, o.glove ? new T.MeshPhongMaterial({ color: o.glove }) : skin, root));
    P.shoes.push(makeShoe(T, M, o.shoe, root));
  }
  // a soft shadow on the floor under each person
  P.shadow = new T.Mesh(M.unit, M.shadowMat); P.shadow.renderOrder = 4; P.shadow.scale.set(30, 1, 22); P.shadow.position.y = 0.2; root.add(P.shadow);
  root.traverse(function (m) { if (m.isMesh && m !== P.shadow) { m.castShadow = false; m.receiveShadow = false; } });
  root.scale.setScalar(sc);
  return P;
}
// thumbSide: which side of the hand (in its own frame: +y the back, +z the fingers) the thumb is on
function makeHand(T, M, thumbSide, mat, parent) {
  const grp = new T.Group(); parent.add(grp);
  const palm = new T.Mesh(M.palm, mat); palm.position.set(0, 0, 1.7); grp.add(palm);
  const fingers = [];
  const xs = [0.98, 0.33, -0.33, -0.96], ls = [2.3, 2.62, 2.5, 1.95];
  for (let i = 0; i < 4; i++) {
    const k1 = new T.Group(); k1.position.set(xs[i] * -thumbSide, 0.02, 3.3); grp.add(k1);
    const s1 = new T.Mesh(M.finger, mat); s1.scale.set(1, 1, ls[i] * 0.55); k1.add(s1);
    const k2 = new T.Group(); k2.position.z = ls[i] * 0.55; k1.add(k2);
    const s2 = new T.Mesh(M.finger, mat); s2.scale.set(0.9, 0.9, ls[i] * 0.48); k2.add(s2);
    fingers.push([k1, k2]);
  }
  const t1 = new T.Group(); t1.position.set(thumbSide * 1.3, -0.22, 1.0); grp.add(t1);
  const ts1 = new T.Mesh(M.finger, mat); ts1.scale.set(1.18, 1.18, 1.55); t1.add(ts1);
  const t2 = new T.Group(); t2.position.z = 1.55; t1.add(t2);
  const ts2 = new T.Mesh(M.finger, mat); ts2.scale.set(1.1, 1.1, 1.25); t2.add(ts2);
  return { grp: grp, fingers: fingers, thumb: [t1, t2], side: thumbSide };
}
function setHand(h, curl, spread, thumb) {
  for (let i = 0; i < 4; i++) {
    h.fingers[i][0].rotation.set(curl * 1.25, (i - 1.5) * spread * 0.12 * -h.side, 0);
    h.fingers[i][1].rotation.x = curl * 1.45;
  }
  h.thumb[0].rotation.set(0.35 + thumb * 0.5, h.side * (0.75 - thumb * 0.55), 0);
  h.thumb[1].rotation.x = thumb * 0.9;
}
function makeShoe(T, M, st, parent) {
  const grp = new T.Group(); parent.add(grp);
  const upper = new T.MeshPhongMaterial({ color: st.upper, specular: st.shine ? 0xbbbbbb : 0x222222, shininess: st.shine ? 90 : 12 });
  const accent = new T.MeshPhongMaterial({ color: st.accent || st.upper, specular: st.shine ? 0xbbbbbb : 0x222222, shininess: st.shine ? 90 : 12 });
  const sole = new T.MeshPhongMaterial({ color: st.sole, specular: 0x111111, shininess: 8 });
  function m(geo, mat, x, y, z, sx, sy, sz) { const o = new T.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); grp.add(o); return o; }
  m(M.sphere, upper, 0, -0.7, 2.6, 2.05, 1.65, 4.9);                 // vamp and quarters
  m(M.sphere, accent, 0, -1.45, 5.6, 1.95, 1.25, 2.1);               // toe cap
  m(M.sphere, accent, 0, -1.0, -0.7, 1.85, 1.65, 1.85);              // heel counter
  m(M.sphere, upper, 0, 0.5, 0.0, 1.75, 1.0, 1.8);                   // collar round the ankle
  m(M.box, sole, 0, -2.75, 2.35, 4.15, 0.75, 11.4);                  // sole
  m(M.box, sole, 0, -2.55, -1.6, 3.6, 0.9, 3.0);                     // heel block
  if (st.laces) for (let k = 0; k < 3; k++) m(M.box, new T.MeshLambertMaterial({ color: st.laces }), 0, 0.55 - k * 0.42, 2.0 + k * 0.95, 2.0, 0.22, 0.32);
  return grp;
}

/* ---- posing ---- */
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
  // if the target is out of reach, the far end stops at full stretch
  if (d > l1 + l2) B.copy(A).addScaledVector(t.d, (l1 + l2) * 0.999);
}
function bone(mesh, A, B, r) {
  const t = TV;
  t.d.subVectors(B, A);
  const l = t.d.length() || 1e-4;
  mesh.position.copy(A);
  mesh.quaternion.setFromUnitVectors(t.up, t.d.multiplyScalar(1 / l));
  mesh.scale.set(r, l, r);
}
// q: hip [x,y,z], yaw, lean, twist, roll, head [yaw, pitch], hands [{p:[x,y,z], dir:[..], palm:[..], curl, spread, thumb}],
//    feet [{p:[x,y,z], yaw}], elbows [pole, pole], expr. Everything in the person's own space (facing +z, left is +x).
function posePerson(P, q) {
  const t = TV, o = P.o, ksh = o.shoulders || 1;
  P.pelvis.position.set(q.hip[0], q.hip[1], q.hip[2]); P.pelvis.rotation.set(0, q.yaw || 0, 0);
  P.upper.position.set(q.hip[0], q.hip[1] + 0.6, q.hip[2]);
  P.upper.rotation.set(q.lean || 0, (q.yaw || 0) + (q.twist || 0), q.roll || 0, "YXZ");
  P.upper.updateMatrix();
  P.head.rotation.set((q.head ? q.head[1] : 0) - (q.lean || 0) * 0.55, q.head ? q.head[0] : 0, 0, "YXZ");
  for (let s = 0; s < 2; s++) {
    const sg = s ? -1 : 1, L = P.arms[s], h = q.hands[s];
    t.a.set(sg * BODY.shX * ksh, BODY.shY - 0.6, -0.2).applyMatrix4(P.upper.matrix);
    t.b.fromArray(h.p);
    const pole = q.elbows && q.elbows[s] ? t.p.fromArray(q.elbows[s]) : t.p.set(sg * 0.5, -0.6, -0.65).applyEuler(P.upper.rotation);
    bend(t.a, t.b, pole, BODY.upArm * (o.reach || 1), BODY.foreArm * (o.reach || 1), t.e);
    bone(L.up, t.a, t.e, L.r1); bone(L.lo, t.e, t.b, L.r2);
    L.j1.position.copy(t.e); L.j1.scale.setScalar(L.r2 * 0.86);
    // the hand: fingers carry on from the forearm unless told otherwise, palm where the pose says
    const H = P.hands[s];
    H.grp.position.copy(t.b);
    if (h.dir) t.c.fromArray(h.dir).normalize(); else t.c.subVectors(t.b, t.e).normalize();
    t.f.fromArray(h.palm || [0, -1, 0]).negate();
    t.f.addScaledVector(t.c, -t.f.dot(t.c));
    if (t.f.lengthSq() < 1e-5) t.f.set(0, 1, 0); t.f.normalize();
    t.g.crossVectors(t.f, t.c);
    t.m.makeBasis(t.g, t.f, t.c); H.grp.quaternion.setFromRotationMatrix(t.m);
    H.grp.scale.setScalar(o.handScale || 1);
    setHand(H, h.curl == null ? 0.35 : h.curl, h.spread || 0, h.thumb == null ? 0.4 : h.thumb);
  }
  const cy = Math.cos(q.yaw || 0), sy = Math.sin(q.yaw || 0);
  for (let s = 0; s < 2; s++) {
    const sg = s ? -1 : 1, L = P.legs[s], f = q.feet[s];
    const hx = sg * BODY.hipX * (o.hips || 1);
    t.a.set(q.hip[0] + hx * cy, q.hip[1] - BODY.hipDrop, q.hip[2] - hx * sy);
    t.b.set(f.p[0], f.p[1] + 0.2, f.p[2]);
    const fy = f.yaw || 0;
    t.p.set(Math.sin(fy) + sg * 0.15 * Math.cos(fy), 0.15, Math.cos(fy) - sg * 0.15 * Math.sin(fy));
    bend(t.a, t.b, t.p, BODY.thigh * (o.legLen || 1), BODY.shin * (o.legLen || 1), t.e);
    bone(L.up, t.a, t.e, L.r1); bone(L.lo, t.e, t.b, L.r2);
    L.j1.position.copy(t.e); L.j1.scale.setScalar(L.r2 * 0.82);
    P.shoes[s].position.set(t.b.x, f.p[1], t.b.z);
    P.shoes[s].rotation.set(f.pitch || 0, fy, 0, "YXZ");
  }
  setExpr(P, q.expr || "neutral");
}
// Faces. Brows tilt (inner end up or down), lids open or squint, the mouth line bends.
const EXPR = {
  neutral: { brow: [0, 0, 0, 0], lid: -0.95, mouth: [0.18, 0, 0], show: "" },
  smug:    { brow: [0.22, 0.12, -0.04, -0.06], lid: -0.55, mouth: [0.4, 0.2, -0.1], show: "" },
  focus:   { brow: [-0.12, 0.22, -0.12, 0.22], lid: -0.42, mouth: [0.05, 0, 0], show: "" },
  annoyed: { brow: [-0.15, 0.28, -0.15, 0.28], lid: -0.6, mouth: [-0.4, 0, 0], show: "" },
  grin:    { brow: [0.18, -0.08, 0.18, -0.08], lid: -0.75, mouth: [0.85, 0, 0], show: "teeth" },
  shock:   { brow: [0.45, -0.18, 0.45, -0.18], lid: -1.25, mouth: [0, 0, 0], show: "o" },
  happy:   { brow: [0.12, -0.05, 0.12, -0.05], lid: -0.85, mouth: [0.7, 0, 0], show: "" },
  cheer:   { brow: [0.35, -0.15, 0.35, -0.15], lid: -1.05, mouth: [0.9, 0, 0], show: "teeth" }
};
function setExpr(P, name) {
  const e = EXPR[name] || EXPR.neutral;
  for (let s = 0; s < 2; s++) {
    const b = P.brows[s], sg = s ? -1 : 1;
    b.position.y = 1.42 + e.brow[s * 2] * 0.8;
    b.rotation.z = sg * e.brow[s * 2 + 1];
    const blink = P.blinkNow ? 1.45 : e.lid;
    P.lids[s].rotation.x = blink;
  }
  const k = e.mouth[0];
  P.mline.scale.set(1, Math.max(0.12, Math.abs(k)), 1);
  P.mline.rotation.z = (k >= 0 ? 0 : Math.PI) + e.mouth[2];
  P.mline.position.set(e.mouth[1] * 0.6, k >= 0 ? -0.07 : -0.12, 0.25);
  P.teeth.visible = e.show === "teeth";
  P.oMouth.visible = e.show === "o";
  P.lowLip.position.y = e.show === "o" ? -0.62 : -0.3;
}
function tickBlink(P, dt) {
  P.blink -= dt;
  if (P.blink < 0) { P.blinkNow = true; if (P.blink < -0.12) { P.blinkNow = false; P.blink = 2.2 + vrand() * 3.5; } }
}

/* ---- the cast ---- */
function castOptions(T, M) {
  const script = M.script;
  return {
    rhett: {                                              // Velvet Rhett, the house hustler
      seed: 11, skin: "#c98f62", hair: "#1c120c", slick: true, hairStyle: "slick", mustache: true, stubble: false, eyes: 0x3a2412,
      shirt: "#5a2a7a", vest: "#2a2c34", vestBack: "#3a1a48", tie: "#b3202a", collar: "#5a2a7a",
      hat: "fedora", hatCol: 0x2a2c34, bandCol: 0x7a3aa0, shoulders: 1.04, waist: 0.97, arms: 1.0, depth: 0.98,
      front: function (g, V) {                             // a gold monogram on the vest pocket
        g.fillStyle = "#e9c46a"; g.font = "italic 900 34px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText("VR", 128, V(14.5));
        g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(96, V(12.4), 64, 3); g.fillRect(864, V(12.4), 64, 3);
      },
      back: function (g, V) {                              // the embroidered back patch: an 8-ball and his name
        g.save(); g.translate(512, V(14.5));
        g.fillStyle = "#e9c46a"; g.beginPath(); g.arc(0, -20, 48, 0, TAU); g.fill();
        g.fillStyle = "#111"; g.beginPath(); g.arc(0, -20, 42, 0, TAU); g.fill();
        g.fillStyle = "#fbfaf2"; g.beginPath(); g.arc(0, -20, 19, 0, TAU); g.fill();
        g.fillStyle = "#111"; g.font = "bold 24px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("8", 0, -18);
        g.font = "italic 900 58px Georgia, serif"; g.lineWidth = 8; g.strokeStyle = "#1a0a20"; g.strokeText("Velvet", 0, 66);
        g.fillStyle = "#e9c46a"; g.fillText("Velvet", 0, 66);
        g.restore();
      },
      upArmCanvas: limbCanvas("#5a2a7a", { seed: 4, foldAt: 0.9 }),
      foreArmCanvas: limbCanvas("#c98f62", { seed: 5, folds: 0, rolled: 0.24, rolledCol: "#5a2a7a" }),
      pantsCanvas: limbCanvas("#1e2028", { seed: 6, stripes: true, foldAt: 0.95, folds: 8 }),
      shoe: { upper: 0xf2efe6, accent: 0x6a3a1c, sole: 0x2a1a10, shine: true },
      belt: 0x111111
    },
    mo: {                                                 // Big Mo, behind the bar
      seed: 21, skin: "#8a5a3a", hair: "#2a2420", hairStyle: "bald", beard: true, eyes: 0x24160c, lip: 0x7a3e30,
      shirt: "#15171d", collarRing: 0x15171d, shoulders: 1.12, waist: 1.12, belly: 1.15, arms: 1.15, hips: 1.08, depth: 1.08, neck: 1.18,
      front: function (g, V) { hallBadge(g, 1024 - 0, V(13), 70); hallBadge(g, 0, V(13), 70); },
      back: function (g, V, script) {
        drawScript(g, script, 512, V(15.5), 330, 130);
        g.fillStyle = "#f2e2bf"; g.font = "900 46px " + CANDY_FACE; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("STAFF", 512, V(8.5));
      },
      upArmCanvas: limbCanvas("#15171d", { seed: 7, skinFrom: 0.42, skin: "#8a5a3a", hem: "#15171d", folds: 3, foldAt: 0.3 }),
      pantsCanvas: limbCanvas("#3a4256", { seed: 8, folds: 6 }),
      shoe: { upper: 0xf2f2f2, accent: 0xd9dbe2, sole: 0xff3fa4, laces: 0xffffff },
      buckle: false
    },
    dee: {                                                // Dee, a regular, on a stool by the bar
      seed: 31, skin: "#f0c8a0", hair: "#6a2e14", hairStyle: "puff", eyes: 0x2a5a2a, lip: 0xb04a5a,
      shirt: "#0d1f5c", jacket: true, trim: "#f2e2bf", shoulders: 0.94, waist: 0.9, hips: 1.04, arms: 0.88, legs: 0.92, neck: 0.9, depth: 0.95, nose: 0.85, handScale: 0.9,
      front: function (g, V) {                             // a chenille letter on the chest
        [150].forEach(function (x) {
          g.font = "900 70px " + CANDY_FACE; g.textAlign = "center"; g.textBaseline = "middle";
          g.lineWidth = 12; g.strokeStyle = "#a3192a"; g.strokeText("NP", x, V(14)); g.fillStyle = "#f2e2bf"; g.fillText("NP", x, V(14));
        });
      },
      back: function (g, V, script) { drawScript(g, script, 512, V(13.5), 380, 170); },
      upArmCanvas: limbCanvas("#f2e2bf", { seed: 9, folds: 5, foldAt: 0.85 }),
      foreArmCanvas: limbCanvas("#f2e2bf", { seed: 10, folds: 4, foldAt: 0.1, cuff: 0.9, cuffCol: "#a3192a" }), longSleeve: true,
      pantsCanvas: limbCanvas("#3f63a8", { seed: 12, folds: 9, stripes: false }),
      shoe: { upper: 0xffffff, accent: 0xa3192a, sole: 0xf2f2f2, laces: 0xffffff }
    },
    gus: {                                                // Gus, waiting on the next game
      seed: 41, skin: "#e2b48c", hair: "#9a9a9a", hairStyle: "short", stubble: true, eyes: 0x2a3a5a, mustache: true,
      shirt: "#a3262a", plaid: true, collar: "#7a1a1e", shoulders: 1.0, waist: 1.06, depth: 1.04,
      hat: "cap", capBill: 0x0d1f5c,
      capCanvas: (function () {
        const c = mkCanvas(512, 256), g = c.getContext("2d");
        g.fillStyle = "#0d1f5c"; g.fillRect(0, 0, 512, 256);
        g.fillStyle = "#a3192a"; g.fillRect(0, 196, 512, 14);
        drawScript(g, script, 128, 150, 180, 80);
        return c;
      })(),
      front: function (g, V) { g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(90, V(15.5), 70, 50); g.fillRect(864, V(15.5), 70, 50); },
      back: null,
      upArmCanvas: limbCanvas("#a3262a", { seed: 13, plaid: true, folds: 4 }),
      foreArmCanvas: limbCanvas("#a3262a", { seed: 14, plaid: true, folds: 5, foldAt: 0.15, cuff: 0.92, cuffCol: "#7a1a1e" }), longSleeve: true,
      pantsCanvas: limbCanvas("#a08a5a", { seed: 15, folds: 8 }),
      shoe: { upper: 0x5a3a1c, accent: 0x4a2c14, sole: 0x1a1410 }
    }
  };
}

/* ---------------- Geometry helpers ---------------- */
// A box with every edge and corner rounded; each face keeps its own material slot (+x -x +y -y +z -z).
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
function scaleUV(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return geo; }
// A flat quad from p0 to p1 (world x/z at its two ends), y0..y1 high, facing the side the normal points.
function quad(T, x0, z0, x1, z1, y0, y1, u0, u1, v0, v1) {
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute([x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0], 3));
  g.setAttribute("uv", new T.Float32BufferAttribute([u0, v0 == null ? 0 : v0, u1, v0 == null ? 0 : v0, u1, v1 == null ? 1 : v1, u0, v1 == null ? 1 : v1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

// Room size (inches): the hall runs 380 x 280, 128 high.
const RX = 190, RZ = 140, ROOM_H = 128;
const TABLE_OX = HL + CUSH_W + RAIL_W, TABLE_OZ = HW + CUSH_W + RAIL_W;     // outer edge of the rails

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg, logoImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: COVER });
  renderer.setClearColor(0x120c0a, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = (parseInt(T.REVISION, 10) || 0) >= 182 ? T.PCFShadowMap : T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(46, W / H, 1.5, 2400);
  const caps = renderer.capabilities;
  const aniso = Math.min(4, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  TV = { a: new T.Vector3(), b: new T.Vector3(), c: new T.Vector3(), d: new T.Vector3(), e: new T.Vector3(), f: new T.Vector3(), g: new T.Vector3(),
         p: new T.Vector3(), q: new T.Vector3(), up: new T.Vector3(0, 1, 0), m: new T.Matrix4() };

  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = aniso;
    return t;
  }
  function add(m, parent) { (parent || scene).add(m); return m; }
  function decal(mat, order) { mat.transparent = true; mat.depthWrite = false; mat._order = order; return mat; }
  const script = scriptCanvas(scriptImg);
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
  const shadowMat = decal(new T.MeshBasicMaterial({ map: tex(shadowCanvas()), opacity: 0.55 }), 4);
  const BY = TABLE_Y;                                                       // the cloth

  /* lights: one bright lamp over the table, a warm dim hall around it */
  scene.add(new T.HemisphereLight(0xffe2c4, 0x2a160c, 0.95));
  const key = new T.DirectionalLight(0xfff1d8, 2.5);
  key.position.set(26, 250, -38); key.target.position.set(0, 0, 0);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 52; sc.bottom = -52; sc.near = 150; sc.far = 270; sc.updateProjectionMatrix();
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 3;
  scene.add(key); scene.add(key.target);
  const fill = new T.DirectionalLight(0xc8d6ff, 0.35); fill.position.set(-220, 140, 120); scene.add(fill);
  const glows = [];
  [[40, 96, RZ - 34, 0xffb070, 0.85, 240], [RX - 26, 70, 0, 0xff6ab8, 0.7, 210], [-RX + 30, 86, 20, 0x7fd8ff, 0.45, 220]].forEach(function (p) {
    const l = new T.PointLight(p[3], p[4], p[5], 0); l.position.set(p[0], p[1], p[2]); scene.add(l); glows.push(l);
  });

  /* the room */
  const tFloor = tex(floorCanvas(), true), tBrick = tex(brickCanvas(), true), tWain = tex(wainscotCanvas(), true), tTin = tex(tinCanvas(), true);
  const floor = add(new T.Mesh(scaleUV(new T.PlaneGeometry(RX * 2, RZ * 2), RX * 2 / 60, RZ * 2 / 60).rotateX(-Math.PI / 2), new T.MeshPhongMaterial({ map: tFloor, specular: 0x332211, shininess: 30 })));
  floor.receiveShadow = true;
  const rug = add(new T.Mesh(new T.PlaneGeometry(210, 140).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ map: tex(rugCanvas(script)) })));
  rug.position.y = 0.15; rug.receiveShadow = true;
  add(new T.Mesh(scaleUV(new T.PlaneGeometry(RX * 2, RZ * 2), RX * 2 / 40, RZ * 2 / 40).rotateX(Math.PI / 2), new T.MeshLambertMaterial({ map: tTin }))).position.y = ROOM_H;
  const brickMat = new T.MeshLambertMaterial({ map: tBrick }), wainMat = new T.MeshLambertMaterial({ map: tWain });
  const trimMat = new T.MeshPhongMaterial({ color: 0x2a1208, specular: 0x553322, shininess: 40 });
  // walls in order around the room, each from its left end to its right end as seen from inside
  const WALLS = [
    { a: [RX, -RZ], b: [RX, RZ], n: [-1, 0] },      // back wall (behind the foot of the table)
    { a: [RX, RZ], b: [-RX, RZ], n: [0, -1] },      // right wall (the bar)
    { a: [-RX, RZ], b: [-RX, -RZ], n: [1, 0] },     // front wall (the door)
    { a: [-RX, -RZ], b: [RX, -RZ], n: [0, 1] }      // left wall (the cue racks)
  ];
  WALLS.forEach(function (w) {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    add(new T.Mesh(quad(T, w.a[0], w.a[1], w.b[0], w.b[1], 40, ROOM_H, 0, len / 48, 40 / 48, ROOM_H / 48), brickMat));
    add(new T.Mesh(quad(T, w.a[0], w.a[1], w.b[0], w.b[1], 0, 40, 0, len / 40, 0, 1), wainMat));
    const ox = w.n[0] * 1.2, oz = w.n[1] * 1.2;                             // chair rail and baseboard
    const rail = add(new T.Mesh(new T.BoxGeometry(Math.abs(w.n[0]) ? 5 : len, 2.6, Math.abs(w.n[0]) ? len : 5), trimMat));
    rail.position.set((w.a[0] + w.b[0]) / 2 + ox * 2.2, 41.2, (w.a[1] + w.b[1]) / 2 + oz * 2.2);
    const base = add(new T.Mesh(new T.BoxGeometry(Math.abs(w.n[0]) ? 2.0 : len, 5, Math.abs(w.n[0]) ? len : 2.0), trimMat));
    base.position.set((w.a[0] + w.b[0]) / 2 + ox * 0.7, 2.5, (w.a[1] + w.b[1]) / 2 + oz * 0.7);
    w.len = len;
  });
  // things hung on the walls: a flat panel against wall i, centered at s inches from its left end, y0..y1 high
  function onWall(i, s, y0, y1, width, mat, off, order) {
    const w = WALLS[i], ux = (w.b[0] - w.a[0]) / w.len, uz = (w.b[1] - w.a[1]) / w.len;
    const cx = w.a[0] + ux * s + w.n[0] * (off || 0.6), cz = w.a[1] + uz * s + w.n[1] * (off || 0.6);
    const m = add(new T.Mesh(quad(T, cx - ux * width / 2, cz - uz * width / 2, cx + ux * width / 2, cz + uz * width / 2, y0, y1, 0, 1), mat));
    if (order) m.renderOrder = order;
    return m;
  }
  function frameOn(i, s, y0, y1, width, canvas) {
    onWall(i, s, y0 - 2.5, y1 + 2.5, width + 5, new T.MeshPhongMaterial({ color: 0xc89a3a, specular: 0xffeebb, shininess: 60 }), 0.5);
    onWall(i, s, y0, y1, width, new T.MeshLambertMaterial({ map: tex(canvas) }), 0.9);
  }
  const additive = function (canvas, op) { return new T.MeshBasicMaterial({ map: tex(canvas), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: op || 1 }); };

  // back wall: the big neon over the table's foot, posters either side, windows at the ends (all above the ribbon)
  onWall(0, 140, 62, 104, 112, additive(hallNeon()), 1.0, 5);
  frameOn(0, 62, 62, 98, 26, posterCanvas(script, 0));
  frameOn(0, 218, 62, 98, 26, posterCanvas(script, 1));
  [18, 262].forEach(function (s) { onWall(0, s, 60, 104, 30, new T.MeshBasicMaterial({ map: tex(windowCanvas()) }), 0.5); });
  // front wall: the OPEN LATE and 8 BALL neons, the chalkboard, the jukebox
  onWall(2, 140, 66, 82, 46, additive(openNeon()), 1.0, 5);
  onWall(2, 60, 62, 92, 60, additive(eightNeon()), 1.0, 5);
  frameOn(2, 222, 62, 96, 44, chalkboardCanvas());
  // left wall: cue racks, a window, a poster
  [70, 320].forEach(function (s) { onWall(3, s, 60, 104, 30, new T.MeshBasicMaterial({ map: tex(windowCanvas()) }), 0.5); });
  frameOn(3, 200, 62, 96, 26, posterCanvas(script, 0));

  /* the LED ribbon, all the way round at the top of the walls */
  const segs = WALLS.map(function (w) { return Math.round(w.len / LED_PITCH); });
  LED = ledCreate(script, segs);
  const tLed = new T.CanvasTexture(LED.canvas);
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas()); tDot.wrapS = tDot.wrapT = T.RepeatWrapping; tDot.anisotropy = aniso;
  const csChunk = T.ShaderChunk && T.ShaderChunk.colorspace_fragment ? "colorspace_fragment" : "encodings_fragment";
  const ledMat = new T.ShaderMaterial({
    uniforms: { tLed: { value: tLed }, tDot: { value: tDot }, grid: { value: new T.Vector2(LED.cols, LED_ROWS) } },
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
  const ledH = LED_ROWS * LED_PITCH, houseMat = new T.MeshBasicMaterial({ color: 0x05060a });
  let u0 = 0;
  WALLS.forEach(function (w, i) {
    const u1 = u0 + segs[i] / LED.cols, ox = w.n[0] * 3.2, oz = w.n[1] * 3.2;
    add(new T.Mesh(quad(T, w.a[0] + ox, w.a[1] + oz, w.b[0] + ox, w.b[1] + oz, LED_Y, LED_Y + ledH, u0, u1), ledMat));
    const hx = w.n[0] * 2.4, hz = w.n[1] * 2.4;
    add(new T.Mesh(quad(T, w.a[0] + hx, w.a[1] + hz, w.b[0] + hx, w.b[1] + hz, LED_Y - 1.6, LED_Y + ledH + 2.2, 0, 1), houseMat));
    const hood = add(new T.Mesh(new T.BoxGeometry(Math.abs(w.n[0]) ? 5 : w.len, 1.6, Math.abs(w.n[0]) ? w.len : 5), trimMat));
    hood.position.set((w.a[0] + w.b[0]) / 2 + w.n[0] * 2.2, LED_Y + ledH + 2.2, (w.a[1] + w.b[1]) / 2 + w.n[1] * 2.2);
    u0 = u1;
  });

  /* the bar along the right wall */
  const barZ = RZ - 46, barX0 = -60, barX1 = 120, barLen = barX1 - barX0;
  const tBarFront = tex(barFrontCanvas(script));
  const barBody = add(new T.Mesh(new T.BoxGeometry(barLen, 41, 20), [trimMat, trimMat, trimMat, trimMat, trimMat, new T.MeshLambertMaterial({ map: tBarFront })]));
  barBody.position.set((barX0 + barX1) / 2, 20.5, barZ); barBody.rotation.y = Math.PI;
  const barTop = add(new T.Mesh(roundBox(T, barLen + 6, 2.2, 27, 1), new T.MeshPhongMaterial({ map: tex(walnutCanvas()), specular: 0x886655, shininess: 80, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.08 })));
  barTop.position.set((barX0 + barX1) / 2, 42.1, barZ - 1);
  const rail = add(new T.Mesh(new T.CylinderGeometry(0.8, 0.8, barLen, 10).rotateZ(Math.PI / 2), new T.MeshPhongMaterial({ color: 0xd9a443, specular: 0xffffff, shininess: 90 })));
  rail.position.set((barX0 + barX1) / 2, 8, barZ - 13);
  // backbar: mirror, shelves, bottles, the lit wordmark sign
  onWall(1, RX - (barX0 + barX1) / 2, 60, 98, barLen - 20, new T.MeshBasicMaterial({ map: tex(mirrorCanvas()) }), 1.0);
  const shelfMat = new T.MeshPhongMaterial({ color: 0x3a1a0c, specular: 0x553322, shininess: 40 });
  [62, 74, 86].forEach(function (y) { const s = add(new T.Mesh(new T.BoxGeometry(barLen - 18, 1.2, 8), shelfMat)); s.position.set((barX0 + barX1) / 2, y, RZ - 5); });
  (function () {
    const bottle = latheGeo(T, [[0.1, 0], [1.6, 0], [1.7, 0.3], [1.7, 6.2], [1.2, 7.4], [0.55, 8.4], [0.55, 10.4], [0.62, 10.6], [0.1, 10.8]], 12);
    const cols = [0x2f8a3a, 0x8a4a12, 0xc9a43a, 0x3a5aa8, 0xa8304a, 0xe0e6ea, 0x6a2a8a, 0x1a6a6a];
    const n = 54, im = new T.InstancedMesh(bottle, new T.MeshPhongMaterial({ color: 0xffffff, specular: 0xffffff, shininess: 100, transparent: true, opacity: 0.82, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.25 }), n);
    const m = new T.Matrix4(), rnd = rng(71), col = new T.Color();
    for (let i = 0; i < n; i++) {
      const row = i % 3, k = Math.floor(i / 3), y = [62.6, 74.6, 86.6][row];
      const s = 0.85 + rnd() * 0.35;
      m.makeScale(s, s * (0.85 + rnd() * 0.4), s).setPosition(barX0 + 14 + k * (barLen - 28) / 17 + (rnd() - 0.5) * 3, y, RZ - 5 + (rnd() - 0.5) * 2);
      im.setMatrixAt(i, m); im.setColorAt(i, col.setHex(cols[Math.floor(rnd() * cols.length)]));
    }
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    add(im);
  })();
  onWall(1, RX - (barX0 + barX1) / 2, 100, 120, 56, new T.MeshBasicMaterial({ map: tex(lightboxCanvas(script)) }), 2.5);
  // stools along the bar
  const stoolMat = new T.MeshPhongMaterial({ color: 0xa3192a, specular: 0x886666, shininess: 50 }), chrome = new T.MeshPhongMaterial({ color: 0xd8dbe2, specular: 0xffffff, shininess: 120, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.4 });
  const stools = [];
  [-20, 30, 82].forEach(function (x) {
    const g = new T.Group(); g.position.set(x, 0, barZ - 26);
    const seat = new T.Mesh(new T.CylinderGeometry(7, 6.4, 3, 20), stoolMat); seat.position.y = 29; g.add(seat);
    const post = new T.Mesh(new T.CylinderGeometry(1, 1, 27, 10), chrome); post.position.y = 14; g.add(post);
    const ring = new T.Mesh(new T.TorusGeometry(6.5, 0.45, 6, 24), chrome); ring.rotation.x = Math.PI / 2; ring.position.y = 11; g.add(ring);
    const foot = new T.Mesh(new T.CylinderGeometry(8, 9, 1.4, 20), chrome); foot.position.y = 0.7; g.add(foot);
    add(g); stools.push(g);
  });

  /* the jukebox, the cue rack, a bench */
  (function () {
    const g = new T.Group(); g.position.set(-RX + 14, 0, 96); g.rotation.y = Math.PI / 2;
    const body = new T.Mesh(roundBox(T, 34, 62, 20, 3), [trimMat, trimMat, trimMat, trimMat, new T.MeshBasicMaterial({ map: tex(jukeboxCanvas()) }), trimMat]);
    body.position.y = 31; g.add(body);
    const top = new T.Mesh(new T.CylinderGeometry(17, 17, 20, 24, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), new T.MeshBasicMaterial({ color: 0xff7ac6 }));
    top.position.y = 62; top.rotation.z = Math.PI / 2; g.add(top);
    add(g);
  })();
  const cueStyles = [
    { tip: "#2f6bff", fore: "#1a1a1a", point: "#e9c46a", veneer: "#f6f0e0", ring: "#d8d8d8", wrap: "#202430", butt: "#3a1a48" },   // Rhett's
    { tip: "#2f6bff", fore: "#0d1f5c", point: "#a3192a", veneer: "#f2e2bf", ring: "#f2e2bf", wrap: "#15171d", butt: "#0d1f5c" },   // the house cue you play with
    { tip: "#5a3a2a", fore: "#7a4a22", point: "#2a1a10", veneer: "#e9d2a6", ring: "#d8d8d8", wrap: "#3a3a3a", butt: "#4a2a12" }    // the rack cues
  ];
  const cueGeo = latheGeo(T, [[0.05, 0], [0.62, 0], [0.62, 0.8], [0.6, 9.6], [0.58, 10], [0.56, 19.4], [0.55, 19.8], [0.5, 28.6], [0.47, 29.4], [0.42, 30], [0.31, 48], [0.265, 57.2], [0.265, 57.9], [0.25, 58], [0.05, 58.05]], 14);
  const cueMats = cueStyles.map(function (s) { return new T.MeshPhongMaterial({ map: tex(cueCanvas(s, script)), specular: 0xbbbbbb, shininess: 80, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.05 }); });
  (function () {                                          // the wall rack on the left wall
    const g = new T.Group(); g.position.set(-70, 0, -RZ + 3);
    const board = new T.Mesh(new T.BoxGeometry(46, 6, 3), trimMat); board.position.y = 66; g.add(board);
    const board2 = new T.Mesh(new T.BoxGeometry(46, 3, 5), trimMat); board2.position.y = 8; g.add(board2);
    for (let k = 0; k < 8; k++) {
      const c = new T.Mesh(cueGeo, cueMats[k === 3 ? 0 : 2]); c.position.set(-19 + k * 5.4, 8, 1.5); c.rotation.z = (k - 3.5) * 0.004; c.rotation.x = -0.03; g.add(c);
    }
    add(g);
    const bench = add(new T.Mesh(roundBox(T, 60, 3, 16, 1), new T.MeshPhongMaterial({ color: 0xa3192a, specular: 0x664444, shininess: 30 })));
    bench.position.set(20, 18, -RZ + 12);
    const bb = add(new T.Mesh(new T.BoxGeometry(56, 16.5, 12), trimMat)); bb.position.set(20, 8.25, -RZ + 12);
  })();

  /* ---------------- the table ---------------- */
  const table = new T.Group(); scene.add(table);
  const tCloth = tex(clothCanvas(), true);
  const clothMat = new T.MeshLambertMaterial({ map: tCloth });
  // the bed, with the six pocket holes cut through it
  const bedShape = new T.Shape();
  const BXo = TABLE_OX - 1, BZo = TABLE_OZ - 1;
  bedShape.moveTo(-BXo, -BZo); bedShape.lineTo(BXo, -BZo); bedShape.lineTo(BXo, BZo); bedShape.lineTo(-BXo, BZo); bedShape.closePath();
  POCKETS.forEach(function (p) { const h = new T.Path(); h.absarc(p.vx, p.vy, p.corner ? 2.7 : 2.6, 0, TAU, true); bedShape.holes.push(h); });
  const bedGeo = new T.ShapeGeometry(bedShape, 10); bedGeo.rotateX(-Math.PI / 2); scaleUV(bedGeo, 1 / 30, 1 / 30);
  const bed = new T.Mesh(bedGeo, clothMat); bed.position.y = BY; bed.receiveShadow = true; table.add(bed);
  const bedDecal = new T.Mesh(new T.PlaneGeometry(2 * HL, 2 * HW).rotateX(-Math.PI / 2), decal(new T.MeshLambertMaterial({ map: tex(bedCanvas(script)) }), 1));
  bedDecal.position.y = BY + 0.02; bedDecal.renderOrder = 1; bedDecal.receiveShadow = true; table.add(bedDecal);
  // cushions: each nose-to-back slab extruded up, cloth covered, jaw ends cut on the pocket angles
  function cushion(pts) {
    const sh = new T.Shape(pts.map(function (p) { return new T.Vector2(p[0], p[1]); }));
    const g = new T.ExtrudeGeometry(sh, { depth: 1.45, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 2, curveSegments: 4 });
    g.rotateX(-Math.PI / 2); scaleUV(g, 1 / 30, 1 / 30);
    const m = new T.Mesh(g, clothMat); m.position.y = BY - 0.05; m.castShadow = false; m.receiveShadow = true; table.add(m);
  }
  const CB = CUSH_W, cj = SM - 0.45 * CB / 3.1;
  [-1, 1].forEach(function (sy) {
    cushion([[-HL + CM, sy * HW], [-SM, sy * HW], [-cj, sy * (HW + CB)], [-HL + CM - CB, sy * (HW + CB)]].map(function (p) { return [p[0], p[1] + sy * 0.3]; }));
    cushion([[SM, sy * HW], [HL - CM, sy * HW], [HL - CM + CB, sy * (HW + CB)], [cj, sy * (HW + CB)]].map(function (p) { return [p[0], p[1] + sy * 0.3]; }));
  });
  [-1, 1].forEach(function (sx) {
    cushion([[sx * HL, -HW + CM], [sx * HL, HW - CM], [sx * (HL + CB), HW - CM + CB], [sx * (HL + CB), -HW + CM - CB]].map(function (p) { return [p[0] + sx * 0.3, p[1]]; }));
  });
  // the wood rails: one frame, its inside edge running along the cushion backs and around each pocket
  const tWal = tex(walnutCanvas(), true);
  const railMat = new T.MeshPhongMaterial({ map: tWal, specular: 0x4a3a30, shininess: 45, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.05 });
  (function () {
    const outer = new T.Shape(), ox = TABLE_OX, oz = TABLE_OZ, r = 3;
    outer.moveTo(-ox + r, -oz); outer.lineTo(ox - r, -oz); outer.quadraticCurveTo(ox, -oz, ox, -oz + r); outer.lineTo(ox, oz - r); outer.quadraticCurveTo(ox, oz, ox - r, oz);
    outer.lineTo(-ox + r, oz); outer.quadraticCurveTo(-ox, oz, -ox, oz - r); outer.lineTo(-ox, -oz + r); outer.quadraticCurveTo(-ox, -oz, -ox + r, -oz);
    const ix = HL + CB, iz = HW + CB, pts = [];
    const per = [[-ix, -iz], [ix, -iz], [ix, iz], [-ix, iz], [-ix, -iz]];
    for (let e = 0; e < 4; e++) {
      const a = per[e], b = per[e + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 0.6);
      for (let k = 0; k < n; k++) {
        let x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n;
        for (let j = 0; j < POCKETS.length; j++) {            // around each pocket the edge bows out along the pocket's rim
          const p = POCKETS[j], rr = (p.corner ? 3.25 : 3.1), dx = x - p.vx, dy = y - p.vy, d = Math.hypot(dx, dy);
          if (d < rr) { x = p.vx + dx / (d || 1) * rr; y = p.vy + dy / (d || 1) * rr; }
        }
        pts.push(new T.Vector2(x, y));
      }
    }
    outer.holes.push(new T.Path(pts));
    const g = new T.ExtrudeGeometry(outer, { depth: RAIL_TOP + 4.6, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 3, curveSegments: 6 });
    g.rotateX(-Math.PI / 2); scaleUV(g, 1 / 24, 1 / 6);
    const m = new T.Mesh(g, railMat); m.position.y = BY - 4.6 - 0.5; m.castShadow = true; m.receiveShadow = true; table.add(m);
  })();
  // mother-of-pearl diamonds in the rail tops
  const pearl = new T.MeshPhongMaterial({ color: 0xf4f0ff, specular: 0xffffff, shininess: 120, emissive: 0x2a2630 });
  const dia = new T.CircleGeometry(0.55, 4).rotateX(-Math.PI / 2);
  const railMid = CB + RAIL_W * 0.5;
  for (let k = -3; k <= 3; k++) {
    if (k === 0) continue;
    [-1, 1].forEach(function (s) { const d = new T.Mesh(dia, pearl); d.position.set(k * 12.5, BY + RAIL_TOP + 0.06, -s * (HW + railMid)); d.scale.set(1, 1, 1.5); table.add(d); });
  }
  for (let k = -1; k <= 1; k++) [-1, 1].forEach(function (s) { const d = new T.Mesh(dia, pearl); d.position.set(s * (HL + railMid), BY + RAIL_TOP + 0.06, k * 12.5); d.scale.set(1.5, 1, 1); table.add(d); });
  // pocket irons, liners and leather drop cups
  const liner = new T.MeshBasicMaterial({ color: 0x050403, side: T.BackSide });
  function ironGeo(span) {
    const g = new T.LatheGeometry([[2.75, 0], [2.95, 0.55], [3.5, 0.78], [4.25, 0.6], [4.55, 0.1], [4.6, -0.5]].map(function (p) { return new T.Vector2(p[0], p[1]); }), 24, -span / 2, span);
    g.computeVertexNormals(); return g;
  }
  const ironC = ironGeo(4.3), ironS = ironGeo(3.5);
  const leather = new T.MeshPhongMaterial({ color: 0x2a140c, specular: 0x553322, shininess: 30 });
  const cupGeo = latheGeo(T, [[0.2, -6.2], [2.4, -6.0], [3.4, -4.6], [3.7, -2.2], [3.4, 0]], 20);
  POCKETS.forEach(function (p) {
    const g = new T.Group(); g.position.set(p.vx, BY, -p.vy); table.add(g);
    const iron = new T.Mesh(p.corner ? ironC : ironS, chrome); iron.position.y = RAIL_TOP - 0.25; iron.rotation.y = p.corner ? Math.atan2(p.sx, -p.sy) : Math.atan2(0, -p.sy); g.add(iron);
    const tube = new T.Mesh(new T.CylinderGeometry(p.corner ? 2.75 : 2.65, 2.6, 7, 20, 1, true), liner); tube.position.y = -2.6; g.add(tube);
    const cup = new T.Mesh(cupGeo, leather); cup.position.y = -4.2; g.add(cup);
  });
  // apron and legs
  const tApron = tex(apronCanvas(script));
  const apronSide = new T.MeshPhongMaterial({ map: tWal, specular: 0x664433, shininess: 50 });
  const apronEnd = new T.MeshPhongMaterial({ map: tApron, specular: 0x664433, shininess: 50 });
  const ax = TABLE_OX - 1.6, az = TABLE_OZ - 1.6;
  [[0, -az, 2 * ax, 2.4, false], [0, az, 2 * ax, 2.4, false], [-ax, 0, 2.4, 2 * az, true], [ax, 0, 2.4, 2 * az, true]].forEach(function (a) {
    const g = new T.BoxGeometry(a[2], 8, a[3]);
    if (!a[4]) scaleUV(g, a[2] / 30, 1);
    const m = new T.Mesh(g, a[4] ? [apronEnd, apronEnd, apronSide, apronSide, apronSide, apronSide] : apronSide);
    m.position.set(a[0], BY - 9.4, a[1]); table.add(m);
  });
  const legGeo = latheGeo(T, [[0.1, 0], [3.4, 0], [3.6, 1.2], [3.1, 2.4], [2.4, 4], [2.3, 7], [3.2, 9.5], [3.4, 12], [2.6, 14.5], [2.9, 17], [3.6, 19], [3.6, 20.4], [0.1, 20.6]], 18);
  [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]].forEach(function (l) {
    const m = new T.Mesh(legGeo, apronSide); m.position.set(l[0] * (ax - 6), 0.2, l[1] * (az - 5)); table.add(m);
  });
  const blob = new T.Mesh(unit, shadowMat); blob.scale.set(TABLE_OX * 2.4, 1, TABLE_OZ * 2.6); blob.position.y = 0.3; blob.renderOrder = 4; scene.add(blob);

  /* the lamp over the table */
  const lamp = new T.Group(); lamp.position.set(0, BY + 39, 0); scene.add(lamp);
  const tLamp = tex(lampCanvas(script));
  const lampSide = new T.MeshBasicMaterial({ map: tLamp }), lampDark = new T.MeshPhongMaterial({ color: 0x0a1a48, specular: 0x334466, shininess: 40 });
  const canopy = new T.Mesh(new T.BoxGeometry(84, 8, 16), [lampDark, lampDark, lampDark, new T.MeshBasicMaterial({ color: 0xfff6dc }), lampSide, lampSide]);
  canopy.position.y = 4; lamp.add(canopy);
  const brass = new T.MeshPhongMaterial({ color: 0xd9a443, specular: 0xffffff, shininess: 90 });
  [-1, 1].forEach(function (s) { const t = new T.Mesh(new T.BoxGeometry(85, 0.8, 0.8), brass); t.position.set(0, 0.2, s * 8); lamp.add(t); });
  [-28, 0, 28].forEach(function (x) {
    const shade = new T.Mesh(new T.CylinderGeometry(3.2, 7.6, 6, 22, 1, true), new T.MeshPhongMaterial({ color: 0x0d1f5c, specular: 0x8899cc, shininess: 60, side: T.DoubleSide }));
    shade.position.set(x, -3, 0); lamp.add(shade);
    const bulb = new T.Mesh(new T.CircleGeometry(7.2, 22).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: 0xfff6dc })); bulb.position.set(x, -5.9, 0); lamp.add(bulb);
  });
  [-36, 36].forEach(function (x) { const c = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, ROOM_H - BY - 47, 6), brass); c.position.set(x, (ROOM_H - BY - 39) / 2 + 4, 0); lamp.add(c); });
  const halo = new T.Sprite(new T.SpriteMaterial({ map: tex(glowCanvas()), blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 }));
  halo.scale.set(150, 40, 1); halo.position.y = -6; lamp.add(halo);

  /* balls */
  const ballGeo = new T.SphereGeometry(BR, 32, 20);
  const balls = [];
  for (let n = 0; n < 16; n++) {
    const t = tex(ballCanvas(n, script), true); t.wrapT = T.ClampToEdgeWrapping;
    const m = new T.Mesh(ballGeo, new T.MeshPhongMaterial({ map: t, specular: 0xffffff, shininess: 140, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12 }));
    m.castShadow = true; m.receiveShadow = false;
    m.quaternion.setFromEuler(new T.Euler(vrand() * TAU, vrand() * TAU, vrand() * TAU));
    scene.add(m);
    const sh = new T.Mesh(unit, shadowMat); sh.renderOrder = 4; sh.visible = false; scene.add(sh);
    balls.push({ mesh: m, shadow: sh });
  }
  const ghost = new T.Mesh(ballGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }));
  ghost.visible = false; scene.add(ghost);
  const ringGeo = new T.RingGeometry(BR * 1.05, BR * 1.35, 32).rotateX(-Math.PI / 2);
  const ghostRing = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
  ghostRing.visible = false; scene.add(ghostRing);
  const placeRing = new T.Mesh(new T.RingGeometry(BR * 1.4, BR * 2.1, 36).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x9bff3f, transparent: true, opacity: 0.8, depthWrite: false }));
  placeRing.visible = false; scene.add(placeRing);

  /* the cues in play */
  const myCue = new T.Mesh(cueGeo, cueMats[1]); scene.add(myCue);
  const rhettCue = new T.Mesh(cueGeo, cueMats[0]); scene.add(rhettCue);
  const gusCue = new T.Mesh(cueGeo, cueMats[2]); scene.add(gusCue);

  /* the cast */
  const M = {
    T: T, tex: tex, script: script, unit: unit, shadowMat: shadowMat,
    sphere: new T.SphereGeometry(1, 20, 14), box: roundBox(T, 1, 1, 1, 0.3), belt: new T.CylinderGeometry(1, 1, 1, 24, 1, true),
    torus: new T.TorusGeometry(1, 0.25, 8, 24), dome: new T.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2),
    cap: new T.SphereGeometry(1, 22, 12, 0, TAU, 0, Math.PI * 0.56), brow: roundBox(T, 1.7, 0.3, 0.5, 0.14),
    palm: roundBox(T, 3.0, 0.92, 3.4, 0.42),
    upArm: latheGeo(T, LIMB.upArm), foreArm: latheGeo(T, LIMB.foreArm), sleeve: latheGeo(T, LIMB.sleeve),
    thigh: latheGeo(T, LIMB.thigh), shin: latheGeo(T, LIMB.shin), pantShin: latheGeo(T, LIMB.pantShin),
    crown: latheGeo(T, [[0.1, 4.1], [2.3, 4.25], [3.2, 3.9], [3.6, 3.2], [3.95, 2.0], [4.3, 0.3], [4.32, 0]], 22),
    brim: latheGeo(T, [[4.2, 0.35], [5.6, 0.12], [6.8, 0.1], [7.3, 0.4], [7.45, 0.75]], 26),
    band: new T.CylinderGeometry(1, 1, 1, 24, 1, true)
  };
  M.finger = new T.CapsuleGeometry(0.31, 0.6, 4, 8); M.finger.rotateX(Math.PI / 2); M.finger.translate(0, 0, 0.67); M.finger.scale(1, 1, 1 / 1.34);
  M.smile = new T.TorusGeometry(0.8, 0.065, 6, 20, 1.9); M.smile.rotateZ(-Math.PI / 2 - 0.95); M.smile.translate(0, 0.8, 0);
  const cast = castOptions(T, M);
  const rhett = makePerson(T, M, cast.rhett), mo = makePerson(T, M, cast.mo), dee = makePerson(T, M, cast.dee), gus = makePerson(T, M, cast.gus);
  scene.add(rhett.root); scene.add(mo.root); scene.add(dee.root); scene.add(gus.root);
  mo.root.position.set(36, 0, RZ - 22); mo.root.rotation.y = Math.PI;
  dee.root.position.set(82, 0, barZ - 26); dee.root.rotation.y = Math.atan2(-82, -(barZ - 26)) + 0.25;
  gus.root.position.set(-36, 0, -RZ + 22); gus.root.rotation.y = 0.35;
  const glass = new T.Mesh(latheGeo(T, [[0.1, 0], [1.3, 0], [1.5, 0.3], [1.7, 4.6], [0.1, 4.6]], 14), new T.MeshPhongMaterial({ color: 0xdfe8f0, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.55 }));
  scene.add(glass);
  const soda = new T.Mesh(latheGeo(T, [[0.1, 0], [1.15, 0], [1.2, 4.2], [0.5, 6.2], [0.45, 7.6], [0.1, 7.7]], 12), new T.MeshPhongMaterial({ color: 0x3a1a0c, specular: 0xffffff, shininess: 110, transparent: true, opacity: 0.85 }));
  scene.add(soda);
  const rag = new T.Mesh(M.sphere, new T.MeshLambertMaterial({ color: 0xe8e0d0 })); rag.scale.set(2.2, 0.8, 1.8); scene.add(rag);

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, key: key, script: script, logoImg: logoImg,
    lamp: lamp, balls: balls, ghost: ghost, ghostRing: ghostRing, placeRing: placeRing, myCue: myCue, rhettCue: rhettCue, gusCue: gusCue,
    rhett: rhett, mo: mo, dee: dee, gus: gus, extras: [mo, dee, gus], glass: glass, soda: soda, rag: rag, glows: glows,
    camPos: new T.Vector3(-150, 80, 0), camTgt: new T.Vector3(0, BY, 0), fov: 46, camReady: false,
    v: new T.Vector3(), v2: new T.Vector3(), v3: new T.Vector3(), v4: new T.Vector3(), bw: new T.Vector3(), gw: new T.Vector3(), q: new T.Quaternion(), axis: new T.Vector3(), up: new T.Vector3(0, 1, 0),
    ray: new T.Raycaster(), ndc: new T.Vector2(),
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0,
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, shadowsOn: true, extrasOn: true, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
// pr = pixel ratio cap, sh = shadow map size (0 = soft painted shadows stand in), extras = the three regulars
const QUALITY = [{ pr: 2, sh: 2048, extras: true }, { pr: 1.5, sh: 1024, extras: true }, { pr: 1.15, sh: 1024, extras: false }, { pr: 1, sh: 0, extras: false }];
function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  const Q = QUALITY[R.quality], on = Q.sh > 0;
  if (on && Q.sh !== R.key.shadow.mapSize.x) { R.key.shadow.mapSize.set(Q.sh, Q.sh); if (R.key.shadow.map) { R.key.shadow.map.dispose(); R.key.shadow.map = null; } }
  if (on !== R.shadowsOn) { R.shadowsOn = on; R.key.castShadow = on; }
  if (Q.extras !== R.extrasOn) { R.extrasOn = Q.extras; for (let i = 0; i < R.extras.length; i++) R.extras[i].root.visible = Q.extras; R.glass.visible = R.soda.visible = R.rag.visible = R.gusCue.visible = Q.extras; }
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

/* ---------------- Bed <-> screen, through the 3D camera ---------------- */
function bedToScreen(x, y, h) {
  if (!R) return { x: W / 2, y: H / 2, ok: false };
  R.v.set(x, TABLE_Y + (h || 0), -y).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1 };
}
function screenToBed(px, py) {
  if (!R) return null;
  R.ndc.set(px / W * 2 - 1, 1 - py / H * 2);
  R.ray.setFromCamera(R.ndc, R.camera);
  const o = R.ray.ray.origin, d = R.ray.ray.direction, h = TABLE_Y + BR;
  if (Math.abs(d.y) < 1e-5) return null;
  const t = (h - o.y) / d.y;
  if (t < 0) return null;
  return { x: o.x + d.x * t, y: -(o.z + d.z * t) };
}
function viewNow() { return S.turn === 0 ? V.userView : "cue"; }
function camShake(mag, dur) { if (!R || Shell.reduced) return; R.shakeMag = mag; R.shakeDur = R.shakeT = dur; }

/* ---------------- The cue line ---------------- */
// Where a cue lies for a shot at angle ang with tip offsets (tx, ty), pulled back "back" inches from the ball.
// Fills tip and dir (world; dir points from butt to tip) and returns the elevation it needed to clear the rail.
function cueLine(c, ang, tx, ty, back, tip, dir) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  // distance back from the ball to the cushion nose, so the butt rides up over the rail
  let tr = 1e9;
  if (dx > 1e-6) tr = Math.min(tr, (c.x + HL) / dx); if (dx < -1e-6) tr = Math.min(tr, (c.x - HL) / dx);
  if (dy > 1e-6) tr = Math.min(tr, (c.y + HW) / dy); if (dy < -1e-6) tr = Math.min(tr, (c.y - HW) / dy);
  const tipH = BR + ty * BR;
  let elev = Math.max(4 * DEG, Math.atan2(RAIL_TOP + 0.9 - tipH, Math.max(0.6, tr - BR)));
  elev = Math.min(elev, 38 * DEG);
  const ce = Math.cos(elev), se = Math.sin(elev);
  dir.set(dx * ce, -se, -dy * ce);
  // contact point on the ball, then back along the cue
  const rx = dy, ry = -dx;                                   // the shooter's right, on the bed
  tip.set(c.x - dx * BR * Math.sqrt(Math.max(0, 1 - tx * tx - ty * ty)) + rx * tx * BR, TABLE_Y + BR + ty * BR, -(c.y - dy * BR * Math.sqrt(Math.max(0, 1 - tx * tx - ty * ty)) + ry * tx * BR));
  tip.addScaledVector(dir, -(0.15 + back));
  return elev;
}
function placeCue(mesh, tip, dir) {
  mesh.quaternion.setFromUnitVectors(R.up, dir);
  mesh.position.copy(tip).addScaledVector(dir, -CUE_LEN);
}

/* ---------------- Velvet Rhett: walking, standing, shooting ---------------- */
const EA = 92, EB = 66;                                      // the ellipse he walks round the table on
const RH = { x: 70, z: -60, yaw: -1, mode: "stand", path: null, pi: 0, walkPh: 0, goal: null, atT: 0, shootK: 0, react: null, chalkT: 4, watchT: 0, lastAim: 0 };
function ellPt(th) { return [EA * Math.cos(th), EB * Math.sin(th)]; }
function ellTh(x, z) { return Math.atan2(z / EB, x / EA); }
function crossesTable(x1, z1, x2, z2) {
  for (let k = 0; k <= 20; k++) {
    const x = lerp(x1, x2, k / 20), z = lerp(z1, z2, k / 20);
    if (Math.abs(x) < TABLE_OX + 8 && Math.abs(z) < TABLE_OZ + 8) return true;
  }
  return false;
}
function rhettGo(x, z, yaw) {
  if (RH.goal && Math.hypot(RH.goal.x - x, RH.goal.z - z) < 3) { RH.goal.yaw = yaw; return; }
  RH.goal = { x: x, z: z, yaw: yaw };
  const pts = [[RH.x, RH.z]];
  if (crossesTable(RH.x, RH.z, x, z)) {
    const th0 = ellTh(RH.x, RH.z), d = angDiff(th0, ellTh(x, z)), n = Math.max(1, Math.ceil(Math.abs(d) / 0.12));
    for (let i = 0; i <= n; i++) pts.push(ellPt(th0 + d * i / n));
  }
  pts.push([x, z]);
  RH.path = pts; RH.pi = 0; RH.mode = Math.hypot(RH.x - x, RH.z - z) > 1.5 ? "walk" : "stand"; RH.atT = 0;
}
function hustlerReady() { return RH.mode === "stand" && RH.atT > 0.45 && RH.goal && Math.abs(angDiff(RH.yaw, RH.goal.yaw)) < 0.06; }
// Where he stands to play a shot at angle ang from the cue ball c (bed coords): returns world x, z and his yaw.
function stanceFor(c, ang) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let te = 1e9;                                              // back along the line to the outer edge of the rails
  if (dx > 1e-6) te = Math.min(te, (c.x + TABLE_OX) / dx); if (dx < -1e-6) te = Math.min(te, (c.x - TABLE_OX) / dx);
  if (dy > 1e-6) te = Math.min(te, (c.y + TABLE_OZ) / dy); if (dy < -1e-6) te = Math.min(te, (c.y - TABLE_OZ) / dy);
  const bd = Math.max(7.5, te - 25), back = Math.max(26, te - bd + 10);
  const wx = dx, wz = -dy, yaw = Math.atan2(wx, wz), lx = Math.cos(yaw), lz = -Math.sin(yaw);
  const bx = c.x - dx * bd, bz = -(c.y - dy * bd);
  return { x: bx - wx * back + lx * 5.5, z: bz - wz * back + lz * 5.5, yaw: yaw, bridge: [bx, bz], bd: bd };
}
function rhettReact(kind) { RH.react = { kind: kind, t: 0 }; }
// the rack is over: he stops where he is and turns to face the table
function rhettStop() { RH.path = null; RH.mode = "stand"; RH.atT = 1; RH.goal = { x: RH.x, z: RH.z, yaw: Math.atan2(-RH.x, -RH.z) }; }
function reactTo(kind) {
  // the hustler's face and body answer what just happened; the regulars cheer the player's good shots
  if (kind === "annoyed" || kind === "beaten" || kind === "groan") { rhettReact(kind); if (kind !== "groan") V.cheer = 1.6; }
  else if (kind === "smug" || kind === "gloat" || kind === "relief") rhettReact(kind === "relief" ? "smug" : kind);
}

function updateRhett(dt, state) {
  const idle = state === "title" || state === "over";
  // where should he be?
  if (!idle && S.turn === 1 && (S.phase === "aiaim" || S.phase === "aistroke" || (S.phase === "aiplace") || (S.phase === "think" && S.plan))) {
    const c = S.phase === "aiplace" && S.plan.place ? S.plan.place : S.balls[0];
    const st = stanceFor(c, S.plan ? S.plan.ang : S.aim);
    rhettGo(st.x, st.z, st.yaw); RH.goal.shot = true;
  } else if (!idle && (S.turn === 0 || S.phase === "roll" || S.phase === "settle" || S.phase === "intro" || S.phase === "rackend")) {
    RH.watchT -= dt;
    const moved = Math.abs(angDiff(RH.lastAim, S.aim)) > 0.9;
    if (S.phase !== "roll" && S.phase !== "settle" && (!RH.goal || RH.goal.shot || (moved && RH.watchT <= 0))) {
      RH.lastAim = S.aim; RH.watchT = 2.5;
      // a spot across the table from where the player is looking, a little off to the side
      const c = S.balls[0], dx = Math.cos(S.aim), dy = Math.sin(S.aim);
      const px = c.x + dx * 95 - dy * 30, pz = -(c.y + dy * 95 + dx * 30);
      const th = ellTh(px, pz), p = ellPt(th);
      rhettGo(p[0], p[1], Math.atan2(-p[0], -p[1]));
    }
  } else if (idle && !RH.goal) { const p = ellPt(-0.6); rhettGo(p[0], p[1], Math.atan2(-p[0], -p[1])); }
  // move along the path
  if (RH.mode === "walk" && RH.path) {
    let left = (Shell.reduced ? 70 : 52) * dt;
    while (left > 0 && RH.pi < RH.path.length - 1) {
      const a = RH.path[RH.pi + 1], dx = a[0] - RH.x, dz = a[1] - RH.z, d = Math.hypot(dx, dz);
      if (d <= left) { RH.x = a[0]; RH.z = a[1]; RH.pi++; left -= d; RH.walkPh += d / 13; }
      else { RH.x += dx / d * left; RH.z += dz / d * left; RH.walkPh += left / 13; left = 0; }
      if (d > 0.01) RH.yaw += angDiff(RH.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
    }
    if (RH.pi >= RH.path.length - 1) { RH.mode = "stand"; RH.atT = 0; }
  } else {
    RH.atT += dt;
    if (RH.goal) RH.yaw += angDiff(RH.yaw, RH.goal.yaw) * Math.min(1, dt * 6);
  }
  const shooting = !idle && S.turn === 1 && (S.phase === "aiaim" || S.phase === "aistroke") && RH.mode === "stand";
  RH.shootK = clamp(RH.shootK + (shooting ? dt * 2.2 : -dt * 3), 0, 1);
  if (RH.react) { RH.react.t += dt; if (RH.react.t > 2.6) RH.react = null; }
  RH.chalkT -= dt;
  if (RH.chalkT < -1.6) RH.chalkT = 7 + vrand() * 6;
  if (RH.chalkT < 0 && RH.chalkT > -dt * 1.5 && state === "playing") hallSfx("chalk");
}

/* ---- poses ---- */
function Q() {
  return { hip: [0, 37.7, 0], yaw: 0, lean: 0.04, twist: 0, roll: 0, head: [0, 0], expr: "neutral",
           hands: [{ p: [9, 35, 1], dir: [0, -1, 0.1], palm: [-1, 0, 0], curl: 0.35, spread: 0, thumb: 0.4 }, { p: [-9, 35, 1], dir: [0, -1, 0.1], palm: [1, 0, 0], curl: 0.35, spread: 0, thumb: 0.4 }],
           feet: [{ p: [4.3, 3.2, 0.5], yaw: 0.12 }, { p: [-4.3, 3.2, 0], yaw: -0.12 }],
           elbows: [[0.5, -0.6, -0.65], [-0.5, -0.6, -0.65]] };
}
const qa = Q(), qb = Q(), qc = Q();
function mixArr(a, b, k, o) { for (let i = 0; i < a.length; i++) o[i] = a[i] + (b[i] - a[i]) * k; }
function mixQ(a, b, k, o) {
  mixArr(a.hip, b.hip, k, o.hip); o.yaw = lerp(a.yaw, b.yaw, k); o.lean = lerp(a.lean, b.lean, k); o.twist = lerp(a.twist, b.twist, k); o.roll = lerp(a.roll, b.roll, k);
  mixArr(a.head, b.head, k, o.head); o.expr = k < 0.5 ? a.expr : b.expr;
  for (let s = 0; s < 2; s++) {
    const A = a.hands[s], B = b.hands[s], O = o.hands[s];
    mixArr(A.p, B.p, k, O.p); mixArr(A.dir, B.dir, k, O.dir); mixArr(A.palm, B.palm, k, O.palm);
    O.curl = lerp(A.curl, B.curl, k); O.spread = lerp(A.spread, B.spread, k); O.thumb = lerp(A.thumb, B.thumb, k);
    mixArr(a.feet[s].p, b.feet[s].p, k, o.feet[s].p); o.feet[s].yaw = lerp(a.feet[s].yaw, b.feet[s].yaw, k);
    mixArr(a.elbows[s], b.elbows[s], k, o.elbows[s]);
  }
  return o;
}
function setH(h, p, dir, palm, curl, spread, thumb) { h.p[0] = p[0]; h.p[1] = p[1]; h.p[2] = p[2]; h.dir[0] = dir[0]; h.dir[1] = dir[1]; h.dir[2] = dir[2]; h.palm[0] = palm[0]; h.palm[1] = palm[1]; h.palm[2] = palm[2]; h.curl = curl; h.spread = spread || 0; h.thumb = thumb == null ? 0.4 : thumb; }
function setF(f, x, y, z, yaw) { f.p[0] = x; f.p[1] = y; f.p[2] = z; f.yaw = yaw; }
function setE(q, l, r) { q.elbows[0][0] = l[0]; q.elbows[0][1] = l[1]; q.elbows[0][2] = l[2]; q.elbows[1][0] = r[0]; q.elbows[1][1] = r[1]; q.elbows[1][2] = r[2]; }

// Standing easy with the cue upright in his right hand. Chalks up now and then.
function poseIdle(q, t, chalk) {
  const br = Shell.reduced ? 0 : Math.sin(t * 1.7) * 0.25, sway = Shell.reduced ? 0 : Math.sin(t * 0.5) * 0.6;
  q.hip[0] = sway * 0.5; q.hip[1] = 37.5 + br * 0.3; q.hip[2] = 0; q.yaw = 0.08; q.lean = 0.04 + br * 0.01; q.twist = -0.08; q.roll = sway * 0.012;
  q.head[0] = Math.sin(t * 0.37) * 0.25; q.head[1] = 0.04; q.expr = "smug";
  setH(q.hands[1], [-9.2, 41 + br * 0.2, 7.4], [0.35, 0, 1], [1, 0.1, -0.2], 0.85, 0, 0.8);
  if (chalk > 0) {
    const k = smooth(Math.min(1, chalk * 3)) * smooth(Math.min(1, (1.6 - chalk) * 3)), ca = t * 14;
    const hp = [-8.6 + Math.cos(ca) * 0.6, 56.5 + Math.sin(ca) * 0.4, 7.9];
    setH(q.hands[0], [lerp(7.6, hp[0] + 2.8, k), lerp(38, hp[1], k), lerp(-2.5, hp[2], k)], [lerp(0, -0.8, k), lerp(-1, 0.2, k), lerp(-0.4, 0.4, k)], [lerp(-1, 0, k), lerp(0, -1, k), 0], 0.65, 0, 0.6);
    q.head[0] = lerp(q.head[0], -0.35, k); q.head[1] = lerp(0.04, 0.25, k); q.expr = k > 0.5 ? "focus" : "smug";
  } else setH(q.hands[0], [8.8, 39.5, -2.2], [0.15, -0.75, -0.6], [-1, 0, 0.2], 0.3, 0.1, 0.3);   // hand on the hip
  setE(q, [1, -0.3, -0.6], [-0.4, -0.7, -0.6]);
  setF(q.feet[0], 4.7, 3.2, 1.6, 0.2); setF(q.feet[1], -4.5, 3.2, -0.8, -0.24);
  return q;
}
function poseWalk(q, ph) {
  const s = Math.sin(ph), c = Math.cos(ph), bob = Shell.reduced ? 0 : Math.abs(c) * 0.9;
  q.hip[0] = s * 0.6; q.hip[1] = 36.9 + bob; q.hip[2] = 0; q.yaw = s * 0.08; q.lean = 0.07; q.twist = -s * 0.1; q.roll = s * 0.02;
  q.head[0] = 0; q.head[1] = 0.05; q.expr = "smug";
  setF(q.feet[0], 4.0, 3.2 + Math.max(0, -c) * 3.2, s * 8.5, 0.05);
  setF(q.feet[1], -4.0, 3.2 + Math.max(0, c) * 3.2, -s * 8.5, -0.05);
  setH(q.hands[0], [9.4, 35.5, -s * 6], [0, -1, -s * 0.3], [-1, 0, 0], 0.4, 0, 0.4);
  setH(q.hands[1], [-9.4, 40, 6.5 + s * 2.5], [0.35, 0, 1], [1, 0.1, -0.2], 0.85, 0, 0.8);
  setE(q, [0.6, -0.6, -0.5], [-0.5, -0.7, -0.6]);
  return q;
}
// Down on the shot: torso over the cue, bridge hand on the cloth, the back arm hanging from the cue.
function poseShoot(q, P, bridgeW, gripW, k) {
  const root = P.root; root.updateMatrixWorld();
  const inv = R.v4;
  q.hip[0] = 1.5; q.hip[1] = 35.8; q.hip[2] = -5.5; q.yaw = 0.22; q.lean = 1.1; q.twist = -0.3; q.roll = 0.05;
  q.head[0] = 0.18; q.head[1] = -0.62; q.expr = "focus";
  inv.copy(bridgeW); root.worldToLocal(inv);
  setH(q.hands[0], [inv.x, inv.y, inv.z], [0, -0.15, 1], [0, -1, 0], 0.2, 0.7, 0.1);
  inv.copy(gripW); root.worldToLocal(inv);
  setH(q.hands[1], [inv.x, inv.y, inv.z], [0.15, -1, 0.1], [1, 0, 0.2], 0.85, 0, 0.8);
  setE(q, [1, -0.5, 0.2], [-0.2, 1, -0.5]);
  setF(q.feet[0], 5.5, 3.2, 10, 0.25); setF(q.feet[1], -7.5, 3.2, -6, -0.55);
  return q;
}
function poseReact(q, kind, t) {
  poseIdle(q, t, 0);
  const shake = Shell.reduced ? 0 : Math.sin(t * 9) * 0.25 * Math.max(0, 1 - t / 1.4);
  if (kind === "gloat") {
    q.expr = "grin"; q.lean = -0.06; q.head[1] = 0.12;
    setH(q.hands[0], [17, 52, 6], [1, 0.3, 0.2], [0, -0.2, 1], 0.15, 0.6, 0.2);
    setH(q.hands[1], [-10, 62, 6], [0.2, 1, 0.3], [1, 0, 0], 0.85, 0, 0.8);
    setE(q, [1, -0.6, -0.4], [-1, -0.4, -0.3]);
  } else if (kind === "annoyed" || kind === "groan") {
    q.expr = "annoyed"; q.head[0] = shake; q.head[1] = -0.05;
    setH(q.hands[0], [3.5, 63.5, -3.5], [-0.2, 0.3, 0.9], [0, 0, 1], 0.5, 0.3, 0.4);   // rubbing the back of his neck
    setE(q, [1, 0.4, -0.2], [-0.4, -0.7, -0.6]);
  } else if (kind === "beaten") {
    q.expr = t < 0.9 ? "shock" : "annoyed"; q.head[0] = shake;
  } else if (kind === "smug") {
    q.expr = "smug"; q.head[1] = 0.1; q.head[0] = -0.2;
  }
  return q;
}
function rhettCueIdle(P, tip, dir) {                          // the cue stands in his right hand
  const h = P.hands[1].grp;
  h.updateMatrixWorld(); R.v.set(0, -0.75, 1.7); h.localToWorld(R.v);
  dir.set(0.05, 1, 0.13).applyQuaternion(P.root.quaternion).normalize();
  tip.copy(R.v).addScaledVector(dir, CUE_LEN - 41);
}

/* ---- the regulars ---- */
function poseMo(q, t, cheer) {
  poseIdle(q, t * 0.8, 0);
  q.hip[1] = 37.6; q.yaw = 0; q.twist = 0; q.lean = 0.12; q.expr = cheer > 0 ? "cheer" : "neutral"; q.head[1] = -0.1;
  const a = t * 3.2;
  setH(q.hands[0], [4 + Math.cos(a) * 1.4, 46 + Math.sin(a) * 1.1, 10], [0, 0.2, 1], [0.2, -1, 0], 0.4, 0.2, 0.4);
  setH(q.hands[1], [-4, 46.5, 10], [0, 1, 0.2], [1, 0, 0], 0.7, 0, 0.7);
  setE(q, [0.7, -0.6, -0.5], [-0.7, -0.6, -0.5]);
  if (cheer > 0) { setH(q.hands[1], [-8, 70, 4], [0, 1, 0], [0, 0, 1], 0.95, 0, 0.9); q.hands[1].p[1] += Math.sin(t * 14) * 1.5; }
  setF(q.feet[0], 5.2, 3.2, 0.5, 0.2); setF(q.feet[1], -5.2, 3.2, 0, -0.2);
  return q;
}
function poseDee(q, t, cheer) {
  q.hip[0] = 0; q.hip[1] = 32.8; q.hip[2] = -1.5; q.yaw = 0; q.lean = -0.06 + (Shell.reduced ? 0 : Math.sin(t * 1.3) * 0.01); q.twist = 0.05; q.roll = 0;
  q.head[1] = 0.05; q.expr = cheer > 0 ? "cheer" : "happy";
  setF(q.feet[0], 3.6, 11.6, 6.2, 0.1); setF(q.feet[1], -3.4, 11.6, 6.0, -0.1);
  q.feet[0].pitch = q.feet[1].pitch = 0;
  const sip = Shell.reduced ? 0 : Math.max(0, Math.sin(t * 0.45) - 0.92) * 12;
  setH(q.hands[1], [-5.5, 40 + sip * 8, 9 - sip * 2], [0, 1, 0.1], [1, 0, 0], 0.8, 0, 0.7);
  setH(q.hands[0], [5.2, 34.5, 13.5], [0, -0.3, 1], [0, -1, 0], 0.3, 0.2, 0.3);
  setE(q, [0.8, -0.6, -0.3], [-0.6, -0.7, -0.3]);
  if (cheer > 0) {
    const b = Math.sin(t * 12) * 1.5;
    setH(q.hands[0], [9, 68 + b, 4], [0.2, 1, 0], [0, 0, 1], 0.1, 0.5, 0.2); setH(q.hands[1], [-9, 66 - b, 4], [-0.2, 1, 0], [0, 0, 1], 0.8, 0, 0.7);
    setE(q, [1, -0.4, -0.2], [-1, -0.4, -0.2]);
  }
  return q;
}
function poseGus(q, t, cheer) {
  q.hip[0] = 0.4; q.hip[1] = 37.2; q.hip[2] = -1.5; q.yaw = 0.05; q.lean = -0.05; q.twist = 0; q.roll = 0.02;
  q.head[1] = 0.02; q.expr = cheer > 0 ? "happy" : "neutral";
  setF(q.feet[0], 3.4, 3.2, 0.8, 0.25); setF(q.feet[1], -1.0, 3.2, 5.5, -0.5);
  setH(q.hands[0], [1.4, 48.5, 10.4], [-0.3, -0.2, 1], [-0.3, -1, 0], 0.55, 0.1, 0.5);
  setH(q.hands[1], [-1.2, 46.5, 10.6], [0.3, -0.1, 1], [0.3, -1, 0], 0.55, 0.1, 0.5);
  setE(q, [0.8, -0.6, -0.3], [-0.8, -0.6, -0.3]);
  if (cheer > 0) { setH(q.hands[0], [8, 66 + Math.sin(t * 13) * 2, 4], [0, 1, 0], [0, 0, 1], 0.95, 0, 0.9); setE(q, [1, -0.3, -0.2], [-0.8, -0.6, -0.3]); }
  return q;
}
// turn a person's head toward a world point, within reason
function lookAt(P, q, wx, wy, wz) {
  R.v.set(wx, wy, wz); P.root.worldToLocal(R.v);
  const hx = R.v.x, hz = R.v.z - 1, hy = R.v.y - 64;
  q.head[0] = clamp(Math.atan2(hx, Math.max(4, hz)) - q.twist - q.yaw, -1.0, 1.0);
  q.head[1] = clamp(Math.atan2(hy, Math.hypot(hx, hz)) * 0.8, -0.6, 0.3);
}

/* ---------------- Game state -> meshes ---------------- */
function syncScene(state, fdt) {
  const idle = state === "title" || state === "over";
  const t = idle ? idleT : S.t;
  R.clock += fdt;
  ledTick(fdt);
  /* balls */
  for (let n = 0; n < 16; n++) {
    const o = R.balls[n], b = S.balls[n];
    if (!b) { o.mesh.visible = false; o.shadow.visible = false; continue; }
    if (b.on) {
      o.mesh.visible = true;
      o.mesh.position.set(b.x, TABLE_Y + BR, -b.y);
      const w = Math.hypot(b.wx, b.wy, b.wz);
      if (w > 1e-3 && fdt > 0) { R.axis.set(b.wx / w, b.wz / w, -b.wy / w); R.q.setFromAxisAngle(R.axis, w * fdt); o.mesh.quaternion.premultiply(R.q); }
    } else if (b.sink) {
      // over the lip and down into the pocket
      const p = POCKETS[b.sink.p];
      b.sink.t += fdt;
      const k = smooth(b.sink.t / 0.18), dropT = Math.max(0, b.sink.t - 0.08);
      const x = lerp(b.sink.x, p.vx, k), y = lerp(b.sink.y, p.vy, k), h = BR - 9 * dropT * dropT * 18;
      o.mesh.visible = h > -6;
      o.mesh.position.set(x, TABLE_Y + h, -y);
    } else o.mesh.visible = false;
    o.shadow.visible = !R.shadowsOn && b.on;
    if (o.shadow.visible) { o.shadow.position.set(b.x + 0.25, TABLE_Y + 0.05, -b.y + 0.25); o.shadow.scale.set(3.4, 1, 3.4); }
  }
  /* the guide ghost, the ball-in-hand ring */
  const aiming = state === "playing" && S.phase === "aim" && S.turn === 0;
  const c = S.balls[0];
  R.ghost.visible = R.ghostRing.visible = false;
  if (aiming && c.on) {
    const fc = firstContact(S.balls, S.aim);
    if (fc.ball) { R.ghost.visible = R.ghostRing.visible = true; R.ghost.position.set(fc.x, TABLE_Y + BR, -fc.y); R.ghostRing.position.set(fc.x, TABLE_Y + 0.06, -fc.y); }
    V.fc = fc;
  } else V.fc = null;
  R.placeRing.visible = aiming && S.ballInHand;
  if (R.placeRing.visible) { R.placeRing.position.set(c.x, TABLE_Y + 0.07, -c.y); R.placeRing.material.opacity = 0.55 + 0.35 * Math.sin(R.clock * 5); }

  /* my cue */
  const tipW = R.v2, dirW = R.v3;
  let showMine = false;
  if (!idle && S.turn === 0 && c.on && (S.phase === "aim" || S.phase === "stroke" || (S.phase === "roll" && S.pt < 0.35))) {
    let back = 0.6;
    if (S.phase === "aim") { const p = S.drag && S.drag.kind === "power" ? S.power : S.charging ? S.power : 0; V.cueBack = lerp(V.cueBack, 1.2 + p * 11, Math.min(1, fdt * 18)); back = V.cueBack; }
    else if (S.phase === "stroke") back = lerp(V.cueBack, 0, smooth(S.pt / 0.11));
    else back = -1.2 + S.pt * 3;
    cueLine(c, S.aim, S.tipX, S.tipY, Math.max(0, back), tipW, dirW);
    placeCue(R.myCue, tipW, dirW); showMine = true;
  }
  R.myCue.visible = showMine && viewNow() === "cue";

  /* Velvet Rhett */
  updateRhett(fdt, state);
  const P = R.rhett;
  P.root.position.set(RH.x, 0, RH.z); P.root.rotation.y = RH.yaw; P.root.updateMatrixWorld();
  tickBlink(P, fdt);
  let q;
  if (RH.mode === "walk") q = poseWalk(qa, RH.walkPh);
  else if (RH.react && !(S.turn === 1 && RH.shootK > 0)) q = poseReact(qa, RH.react.kind, RH.react.t);
  else q = poseIdle(qa, R.clock, RH.chalkT < 0 ? -RH.chalkT : 0);
  const plan = S.plan || (S.shot && S.shot.who === 1 && (S.phase === "roll" || S.phase === "settle") ? V.lastPlan : null);
  if (RH.shootK > 0.01 && plan) {
    // the practice strokes, the shot, the follow through
    let stroke = 0;
    const st = S.phase === "aistroke" ? S.pt : 0;
    if (S.phase === "roll" || S.phase === "settle") stroke = -3.5 * smooth(S.pt / 0.12);
    else if (st < 1.25) stroke = (1 - Math.cos(st / 0.62 * TAU)) * 0.5 * 4.5;
    else if (st < AI_STROKE_T - 0.12) stroke = smooth((st - 1.25) / (AI_STROKE_T - 1.37)) * 7;
    else stroke = 7 * (1 - smooth((st - (AI_STROKE_T - 0.12)) / 0.12));
    const cb = S.phase === "roll" || S.phase === "settle" ? S.shotFrom : (S.phase === "aiplace" && plan.place ? plan.place : S.balls[0]);
    const ang = S.phase === "aistroke" || S.phase === "roll" || S.phase === "settle" ? plan.ang : S.aim;
    cueLine(cb, ang, plan.tx, plan.ty, 0.4 + Math.max(-3.5, stroke), tipW, dirW);
    const st2 = stanceFor(cb, ang);
    const onRail = Math.abs(st2.bridge[0]) > HL + 0.5 || Math.abs(st2.bridge[1]) > HW + 0.5;
    R.bw.copy(tipW).addScaledVector(dirW, -(9.5 - Math.max(0, stroke)));
    R.bw.y = onRail ? TABLE_Y + RAIL_TOP + 0.7 : TABLE_Y + 0.75;
    R.gw.copy(tipW).addScaledVector(dirW, -34);
    poseShoot(qb, P, R.bw, R.gw, RH.shootK);
    q = mixQ(q, qb, smooth(RH.shootK), qc);
    placeCue(R.rhettCue, tipW, dirW);
    posePerson(P, q);
  } else {
    if (RH.mode !== "walk" && state === "playing" && S.phase !== "rackend") lookAt(P, q, c.x, TABLE_Y, -c.y);
    posePerson(P, q);
    rhettCueIdle(P, tipW, dirW); placeCue(R.rhettCue, tipW, dirW);
  }

  /* the regulars */
  V.cheer = Math.max(0, V.cheer - fdt);
  if (R.extrasOn) {
    const ch = V.cheer;
    [[R.mo, poseMo], [R.dee, poseDee], [R.gus, poseGus]].forEach(function (pp, i) {
      const per = pp[0]; tickBlink(per, fdt);
      const qq = pp[1](qa, R.clock + i * 1.7, ch);
      if (state === "playing" && ch <= 0) lookAt(per, qq, c.x, TABLE_Y, -c.y);
      if (pp[0] === R.dee) qq.feet[0].pitch = qq.feet[1].pitch = 0.25;
      posePerson(per, qq);
    });
    // props: Mo's glass and rag, Dee's bottle, Gus's cue
    R.mo.root.updateMatrixWorld(); R.dee.root.updateMatrixWorld(); R.gus.root.updateMatrixWorld();
    R.glass.position.copy(R.mo.hands[1].grp.position); R.mo.root.localToWorld(R.glass.position); R.glass.position.y -= 1.2;
    R.rag.position.copy(R.mo.hands[0].grp.position); R.mo.root.localToWorld(R.rag.position); R.rag.position.y -= 0.6;
    R.soda.position.copy(R.dee.hands[1].grp.position); R.dee.root.localToWorld(R.soda.position); R.soda.position.y -= 2.2;
    R.v.set(0.6, 0.2, 11.2); R.gus.root.localToWorld(R.v); dirW.set(0, 1, -0.04).applyQuaternion(R.gus.root.quaternion);
    R.v2.copy(R.v).addScaledVector(dirW, CUE_LEN); placeCue(R.gusCue, R.v2, dirW);
  }

  /* camera */
  camera(state, fdt);
}

const CAM = { up: null };
function camera(state, fdt) {
  const T = R.T, cam = R.camera, c = S.balls[0], idle = state === "title" || state === "over";
  const gp = R.v, gt = R.v2;
  let fov = 46, rate = 4, top = false;
  const dx = Math.cos(S.aim), dz = -Math.sin(S.aim);
  if (idle) {
    const th = (Shell.reduced ? 0.7 : idleT * 0.09) + 0.7;
    gp.set(Math.cos(th) * 172, 110, Math.sin(th) * 127); gt.set(0, 33, 0); rate = 2;
  } else if (S.phase === "intro") {
    const k = smooth(S.pt / 2.4);
    gp.set(lerp(-160, c.x - dx * 31, k), lerp(104, TABLE_Y + 13.5, k), lerp(70, -c.y - dz * 31, k));
    gt.set(lerp(0, c.x + dx * 26, k), TABLE_Y + 1, lerp(0, -c.y + dz * 26, k)); rate = 6;
  } else if (S.phase === "rackend") {
    const P = R.rhett, f = R.v3.set(Math.sin(RH.yaw), 0, Math.cos(RH.yaw));
    const hx = RH.x, hz = RH.z;
    gp.set(hx + f.x * 56 + f.z * 16, 63, hz + f.z * 56 - f.x * 16); gt.set(hx, 59, hz); fov = 40; rate = 3;
  } else if (S.turn === 0 && (S.phase === "aim" || S.phase === "stroke") && viewNow() === "top") {
    top = true; gp.set(3, 236, 0.001); gt.set(3, TABLE_Y, 0); fov = 40; rate = 6;
  } else if (S.turn === 0 && (S.phase === "aim" || S.phase === "stroke")) {
    gp.set(c.x - dx * 31, TABLE_Y + 13.5, -c.y - dz * 31); gt.set(c.x + dx * 26, TABLE_Y + 1, -c.y + dz * 26); rate = 9;
  } else if (S.shot && (S.phase === "roll" || S.phase === "settle") && S.shot.who === 0 && viewNow() === "top") {
    top = true; gp.set(3, 236, 0.001); gt.set(3, TABLE_Y, 0); fov = 40; rate = 3;
  } else if (S.shot && (S.phase === "roll" || S.phase === "settle")) {
    // a high three-quarter view down the line of the shot, leaning toward the action
    const sx = S.shotFrom ? S.shotFrom.x : c.x, sy = S.shotFrom ? S.shotFrom.y : c.y;
    let mx = 0, my = 0, n = 0;
    for (let i = 0; i < S.balls.length; i++) { const b = S.balls[i]; if (b && b.on && (b.vx || b.vy)) { mx += b.x; my += b.y; n++; } }
    const fx = n ? mx / n : sx, fy = n ? my / n : sy;
    gp.set(sx - dx * 82, TABLE_Y + 28, -sy - dz * 82); gt.set(lerp(sx, fx, 0.5) * 0.7, TABLE_Y, -lerp(sy, fy, 0.5) * 0.7); rate = 2.2; fov = 50;
  } else if (S.turn === 1 && (S.phase === "aiaim" || S.phase === "aistroke")) {
    // the TV angle: out in front of the shot, looking back down the cue at Rhett's face (portrait friendly)
    const px = -dz, pz = dx;
    let cx2 = c.x + dx * 60 + px * 20, cz2 = -c.y + dz * 60 + pz * 20;
    cx2 = clamp(cx2, -RX + 24, RX - 24); cz2 = clamp(cz2, -RZ + 24, RZ - 24);
    gp.set(cx2, TABLE_Y + 23, cz2); gt.set(lerp(c.x, RH.x, 0.62), 43, lerp(-c.y, RH.z, 0.62)); fov = 46; rate = 3;
  } else {
    // Rhett's thinking: a wide shot from across the table
    const ax = -RH.x, az = -RH.z, l = Math.hypot(ax, az) || 1;
    gp.set(ax / l * 150, 60, az / l * 112); gt.set(RH.x * 0.3, 34, RH.z * 0.3); rate = 2.5;
  }
  if (R.debugCam) { gp.fromArray(R.debugCam, 0); gt.fromArray(R.debugCam, 3); fov = R.debugCam[6] || 40; rate = 60; top = false; }
  R.lamp.visible = !(R.camPos.y > 140 || (R.camPos.y > TABLE_Y + 31 && Math.abs(R.camPos.x) < 62 && Math.abs(R.camPos.z) < 30));
  if (!R.camReady) { R.camPos.copy(gp); R.camTgt.copy(gt); R.fov = fov; R.camReady = true; CAM.up = new T.Vector3(0, 1, 0); CAM.top = top; }
  if (top !== CAM.top) {                                        // in and out of the overhead view is a cut, not a swoop through the lamp
    CAM.top = top; R.camPos.copy(gp); R.camTgt.copy(gt); R.fov = fov; CAM.up.set(top ? 1 : 0, top ? 0 : 1, 0);
  }
  const k = 1 - Math.exp(-rate * fdt);
  R.camPos.lerp(gp, k); R.camTgt.lerp(gt, k); R.fov += (fov - R.fov) * k;
  // the overhead view turns the table so its long side runs up the phone
  const wantUp = R.v3.set(top ? 1 : 0, top ? 0 : 1, 0);
  CAM.up.lerp(wantUp, Math.min(1, fdt * (top ? 7 : 9))).normalize();
  let sx = 0, sy = 0;
  if (R.shakeT > 0) { R.shakeT -= fdt; const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur); sx = (vrand() * 2 - 1) * m; sy = (vrand() * 2 - 1) * m; }
  cam.up.copy(CAM.up);
  cam.position.set(R.camPos.x + sx, R.camPos.y + sy, R.camPos.z);
  if (Math.abs(cam.fov - R.fov) > 0.01) { cam.fov = R.fov; cam.updateProjectionMatrix(); }
  cam.lookAt(R.camTgt.x + sx, R.camTgt.y + sy, R.camTgt.z);
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
function ballIcon(c, n, x, y, r, dim) {
  c.globalAlpha = dim ? 0.28 : 1;
  c.fillStyle = n >= 9 ? "#fbfaf2" : BALL_COLS[n];
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  if (n >= 9) { c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip(); c.fillStyle = BALL_COLS[n]; c.fillRect(x - r, y - r * 0.5, r * 2, r); c.restore(); }
  if (r >= 6) { c.fillStyle = "#fbfaf2"; c.beginPath(); c.arc(x, y, r * 0.5, 0, TAU); c.fill(); txt(c, String(n), x, y - r * 0.42, Math.round(r * 0.8), "#111", "center"); }
  c.fillStyle = "rgba(255,255,255,.45)"; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.38, r * 0.25, 0, TAU); c.fill();
  c.globalAlpha = 1;
}
function groupBalls(c, who, x, y, align) {
  // the balls this side still has to sink (8-ball), or the lowest ball on (9-ball)
  if (S.mode === "9") return;
  const g = S.groups[who];
  if (!g) { txt(c, "OPEN TABLE", x, y - 5, 9, "#a8ecff", align); return; }
  const ids = g === "solid" ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
  const left = ids.filter(function (n) { return S.balls[n] && S.balls[n].on; }).length;
  for (let i = 0; i < 8; i++) {
    const n = i < 7 ? ids[i] : 8, xx = align === "right" ? x - (7 - i) * 13 - 5 : x + i * 13 + 5;
    ballIcon(c, n, xx, y, 5.2, n === 8 ? left > 0 : !S.balls[n].on);
  }
}
function drawHUD(c, state) {
  const bg = c.createLinearGradient(0, 0, 0, 62);
  bg.addColorStop(0, "#22305e"); bg.addColorStop(0.55, "#121a3c"); bg.addColorStop(1, "#0a0f26");
  c.fillStyle = bg; c.fillRect(0, 0, W, 62);
  c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(0, 0, W, 1);
  c.fillStyle = "#a3192a"; c.fillRect(0, 62, W, 2); c.fillStyle = "#f2e2bf"; c.fillRect(0, 64, W, 1);
  const playing = state === "playing";
  const you = S.turn === 0;
  // whose turn: a lit bar under the side that's up
  if (playing && S.phase !== "intro" && S.phase !== "rackend") { c.fillStyle = you ? "#9bff3f" : "#ff3fa4"; c.fillRect(you ? 0 : W - 128, 59, 128, 3); }
  txt(c, "YOU", 8, 5, 9, "#a8ecff");
  txt(c, money(S.bank), 8, 16, 17, "#ffe45c", "left", "#000");
  groupBalls(c, 0, 4, 47, "left");
  txt(c, RIVAL, W - 8, 5, 9, "#ffc1e0", "right");
  txt(c, (S.mode === "8" ? "8-BALL" : "9-BALL"), W - 8, 18, 10, "#f2e2bf", "right");
  groupBalls(c, 1, W - 4, 47, "right");
  // the match in the middle
  txt(c, "RACK " + (S.rack + 1) + "  RACE TO " + S.race, W / 2, 5, 8, "#a8ecff", "center");
  txt(c, S.won[0] + " - " + S.won[1], W / 2, 15, 18, "#ffffff", "center", "#000");
  txt(c, money(S.stake) + " ON IT", W / 2, 37, 8, "#9bff3f", "center");
  if (S.mode === "9" && playing) {
    const l = lowestBall();
    if (l) { txt(c, "ON THE", W / 2 - 34, 48, 8, "#a8ecff", "left"); ballIcon(c, l, W / 2 + 22, 52, 6.2); }
  }
  if (!playing) return;
  // a word from the side table
  let hint = "";
  if (S.phase === "aim" && you) {
    if (S.ballInHand) hint = S.kitchen ? "YOUR BREAK: DRAG THE CUE BALL, THEN SHOOT" : "BALL IN HAND: DRAG THE CUE BALL ANYWHERE";
    else hint = viewNow() === "top" ? "DRAG TO AIM  *  PULL THE METER TO SHOOT" : "DRAG TO AIM  *  TAP A BALL  *  PULL THE METER";
  } else if (S.turn === 1 && (S.phase === "think" || S.phase === "aiplace")) hint = RIVAL + " IS LINING IT UP...";
  else if (S.phase === "intro") hint = "TAP TO RACK 'EM";
  if (hint) {
    c.font = "bold 9px " + HUD_FONT;
    const w = c.measureText(hint).width + 16;
    rrect(c, W / 2 - w / 2, 70, w, 16, 8); c.fillStyle = "rgba(8,12,32,.72)"; c.fill();
    txt(c, hint, W / 2, 74, 9, "#ffffff", "center");
  }
  if (S.phase === "aim" && you) { drawSpin(c); drawPower(c); }
  if (S.turn === 0 && S.phase !== "rackend" && S.phase !== "intro") drawViewBtn(c);
}
function drawAim(c) {
  const fc = V.fc, b = S.balls[0];
  if (!fc) return;
  const a = S.aim, dx = Math.cos(a), dy = Math.sin(a);
  const dot = function (x, y, r, col) { const p = bedToScreen(x, y, BR * 0.2); if (!p.ok) return; c.fillStyle = "rgba(0,0,0,.45)"; c.beginPath(); c.arc(p.x, p.y, r + 0.9, 0, TAU); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.fill(); };
  for (let d = BR * 1.6; d < fc.t - 0.6; d += 2.2) dot(b.x + dx * d, b.y + dy * d, 1.3, "rgba(255,255,255,.9)");
  if (fc.ball) {
    // where the object ball goes, and where the cue ball heads off
    const ob = fc.ball, nx = (ob.x - fc.x) / (2 * BR), ny = (ob.y - fc.y) / (2 * BR);
    for (let d = BR + 0.5; d < 16; d += 2) dot(ob.x + nx * d, ob.y + ny * d, 1.4, "#ffe45c");
    const tx = dx - nx * (dx * nx + dy * ny), ty = dy - ny * (dx * nx + dy * ny), tl = Math.hypot(tx, ty);
    if (tl > 0.05) for (let d = 1.5; d < 10 * tl + 2; d += 2) dot(fc.x + tx / tl * d, fc.y + ty / tl * d, 1.0, "rgba(160,236,255,.9)");
    const legal = S.breakShot || legalTargets(0).indexOf(ob.id) >= 0;
    if (!legal) { const p = bedToScreen(ob.x, ob.y, BR * 2.6); if (p.ok) txt(c, "NOT YOURS", p.x, p.y - 10, 8, "#ff6a6a", "center", "#000"); }
  }
}
function drawSpin(c) {
  const u = SPIN_UI;
  c.fillStyle = "rgba(8,12,32,.7)"; c.beginPath(); c.arc(u.x, u.y, u.r + 5, 0, TAU); c.fill();
  const g = c.createRadialGradient(u.x - 9, u.y - 10, 2, u.x, u.y, u.r);
  g.addColorStop(0, "#ffffff"); g.addColorStop(0.7, "#e9e6dc"); g.addColorStop(1, "#b9b5a8");
  c.fillStyle = g; c.beginPath(); c.arc(u.x, u.y, u.r, 0, TAU); c.fill();
  c.strokeStyle = "rgba(0,0,0,.18)"; c.lineWidth = 1; c.beginPath(); c.moveTo(u.x - u.r, u.y); c.lineTo(u.x + u.r, u.y); c.moveTo(u.x, u.y - u.r); c.lineTo(u.x, u.y + u.r); c.stroke();
  const px = u.x + S.tipX / MAX_TIP * u.r * 0.85, py = u.y - S.tipY / MAX_TIP * u.r * 0.85;
  c.fillStyle = "#e3231a"; c.beginPath(); c.arc(px, py, 5.2, 0, TAU); c.fill();
  c.strokeStyle = "#fff"; c.lineWidth = 1.5; c.stroke();
  const lab = Math.abs(S.tipY) < 0.08 && Math.abs(S.tipX) < 0.08 ? "CENTER" : (S.tipY > 0.08 ? "FOLLOW " : S.tipY < -0.08 ? "DRAW " : "") + (S.tipX > 0.08 ? "RIGHT" : S.tipX < -0.08 ? "LEFT" : "");
  txt(c, "SPIN", u.x, u.y - u.r - 17, 8, "#a8ecff", "center", "#000");
  txt(c, lab.trim(), u.x, u.y + u.r + 6, 8, "#ffffff", "center", "#000");
}
function drawPower(c) {
  const u = POWER_UI, p = S.drag && S.drag.kind === "power" ? S.power : S.charging ? S.power : 0;
  rrect(c, u.x - 4, u.y - 4, u.w + 8, u.h + 8, 9); c.fillStyle = "rgba(8,12,32,.78)"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = "#f2e2bf"; c.stroke();
  c.save(); rrect(c, u.x, u.y, u.w, u.h, 6); c.clip();
  const g = c.createLinearGradient(0, u.y, 0, u.y + u.h);
  g.addColorStop(0, "#3fe0ff"); g.addColorStop(0.55, "#ffd21f"); g.addColorStop(1, "#ff3b2e");
  c.fillStyle = "#1a2350"; c.fillRect(u.x, u.y, u.w, u.h);
  c.fillStyle = g; c.fillRect(u.x, u.y, u.w, u.h * p);
  // the cue being drawn back in the meter
  c.fillStyle = "#e9d2a6"; c.fillRect(u.x + u.w / 2 - 2.5, u.y + u.h * p - 60, 5, 60);
  c.fillStyle = "#2f6bff"; c.fillRect(u.x + u.w / 2 - 2.5, u.y + u.h * p, 5, 3);
  c.restore();
  txt(c, p > 0 ? Math.round(p * 100) + "%" : "PULL", u.x + u.w / 2, u.y + u.h + 8, 8, "#ffffff", "center", "#000");
  if (!(p > 0)) {
    const k = Shell.reduced ? 0.5 : (R.clock * 1.2) % 1;
    c.fillStyle = "rgba(255,255,255," + (0.8 * (1 - k)).toFixed(2) + ")";
    const yy = u.y + 18 + k * 30;
    c.beginPath(); c.moveTo(u.x + u.w / 2 - 6, yy); c.lineTo(u.x + u.w / 2 + 6, yy); c.lineTo(u.x + u.w / 2, yy + 7); c.fill();
  }
}
function drawViewBtn(c) {
  const u = VIEW_UI;
  rrect(c, u.x, u.y, u.w, u.h, 11); c.fillStyle = "rgba(8,12,32,.78)"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = "#f2e2bf"; c.stroke();
  txt(c, viewNow() === "top" ? "CUE VIEW" : "TOP VIEW", u.x + u.w / 2, u.y + 6, 9, "#ffe45c", "center");
}

function draw(c, state) {
  Hall.pump();
  if (!R || !R.hud) return;
  const now = performance.now();
  let ms = now - R.lastT;
  R.lastT = now;
  if (!(ms > 0)) ms = 0;
  const sized = layout();
  if (state === "paused" && !R.dirty) return;
  if (state === "playing") watchFrameRate(ms);
  const fdt = state === "paused" ? 0 : Math.min(ms, 50) / 1000;
  if (sized) { syncScene(state, fdt); R.renderer.render(R.scene, R.camera); R.dirty = false; }
  c.clearRect(-24, -24, W + 48, H + 48);
  if (state === "playing" && S.phase === "aim" && S.turn === 0) drawAim(c);
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.globalAlpha = clamp(q.life * 2, 0, 1);
    c.fillStyle = q.c; c.fillRect(-2.5, -1.5, 5, 3); c.restore();
  }
  c.globalAlpha = 1;
  for (let i = 0; i < floats.length; i++) {
    const f = floats[i];
    c.globalAlpha = Math.max(0, 1 - f.t / 1.3);
    txt(c, f.txt, W / 2, 120 - f.t * 40, 18, f.col, "center", "#000");
  }
  c.globalAlpha = 1;
  drawHUD(c, state);
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

/* ---------------- Splash, boot, shell hookup ---------------- */
const COVER = /[?&]cover=1/.test(location.search);           // ?cover=1 renders the 360 x 480 cover art from the hall itself

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
  img.alt = ""; img.decoding = "async";
  img.style.cssText = "display:block;width:min(66vw,44vh,340px);height:auto;opacity:0;transform:scale(.86);" +
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "transition:opacity .2s ease" : "transition:opacity .28s ease,transform .55s cubic-bezier(.2,1.5,.4,1)");
  el.appendChild(img);
  const load = document.createElement("div");
  load.textContent = "Racking the balls...";
  load.style.cssText = "font-size:12px;letter-spacing:1px;color:#a8ecff;opacity:.85";
  el.appendChild(load);
  document.body.appendChild(el);
  return { el: el, img: img };
}
function splashFail(splash, lines) {
  const el = splash.el;
  splash.img.style.width = "min(40vw,26vh,180px)";
  el.setAttribute("role", "alert"); el.removeAttribute("aria-label");
  const p = document.createElement("p"); p.style.cssText = "margin:0;max-width:30em"; p.textContent = lines;
  const a = document.createElement("a"); a.href = "../"; a.textContent = "Back to the arcade"; a.style.cssText = "color:#ffe45c";
  el.appendChild(p); el.appendChild(a);
}
function splashGone(splash) {
  splash.el.style.opacity = "0"; splash.el.style.pointerEvents = "none";
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
function logoImgEl(maxH) {
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
  im.style.cssText = "display:block;width:clamp(56px," + maxH + ",104px);height:auto;margin:0 auto 6px";
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_URL;
  return im;
}
function modeLabel() { return "GAME: " + (MODE === "8" ? "8-BALL, RACE TO 2" : "9-BALL, RACE TO 3"); }

function startGame() {
  Shell.init({
    slug: "pool-hall-hustle",
    title: "POOL HALL HUSTLE",
    accent: "#3ff0ff",
    width: W, height: H,
    format: money,
    howTo: "Real 3D pool against Velvet Rhett, the house hustler. Drag to aim or tap a ball, set spin on the cue ball, then pull the power meter down and let go.",
    keys: "Keys: left and right aim (Shift for fine), W A S D spin, C centers it, hold Space for power and let go to shoot, V switches view. P pause, M mute, N music, R restart.",
    tip: "Every rack's stake doubles. Banks and combos pay extra.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { if (paused) return; idleT += dt; updateParts(dt); },
    onPause: function () { paused = true; keys = {}; S.drag = null; S.charging = false; S.power = 0; },
    onResume: function () { paused = false; }
  });
  attach();
  // sound: nothing is made until the first tap, click or key press; the band starts with the game
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Hall.unlock, true); });
  Shell.onStart(Hall.newGame); Shell.onRestart(Hall.newGame); Shell.onResume(Hall.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Hall.toggleMusic();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) {
    titleCard.insertBefore(logoImgEl("12vh"), titleCard.firstChild);
    // pick the game: 8-ball or 9-ball, remembered
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-btn"; b.style.cssText = "width:100%;margin-top:8px";
    b.textContent = modeLabel();
    b.addEventListener("click", function (e) {
      e.stopPropagation(); Hall.unlock();
      MODE = MODE === "8" ? "9" : "8"; Shell.save("mode", MODE); b.textContent = modeLabel(); reset(); Shell.sfx("click");
    });
    titleCard.insertBefore(b, titleCard.querySelector(".np-tip"));
    Hall.button(titleCard, titleCard.querySelector(".np-tip"));
  }
  if (pauseActions) Hall.button(pauseActions, pauseActions.querySelector("a"));
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) card.insertBefore(logoImgEl("14vh"), card.firstChild);
}

/* ---------------- Cover art: the hall, from the game's own camera ---------------- */
function renderCover(logoImg) {
  const T = THREE, CW = 720, CH = 960;
  R.renderer.setPixelRatio(1); R.renderer.setSize(CW, CH, false);
  R.camera.aspect = CW / CH; R.camera.updateProjectionMatrix();
  // a rack in progress: a few balls left, one hanging over the corner, Rhett down on a shot
  const keep = { 0: [-6, 6], 3: [41.5, 17.2], 8: [24, 3], 2: [3, 15], 9: [-34, 8], 14: [-36.5, -15], 6: [-28, -19.5], 11: [-43.5, -7.5], 5: [-19, -11], 12: [12, -9] };
  for (let n = 1; n < S.balls.length; n++) { const b = S.balls[n]; if (!b) continue; const k = keep[n]; b.on = !!k; if (k) { b.x = k[0]; b.y = k[1]; } }
  S.balls[0].x = keep[0][0]; S.balls[0].y = keep[0][1];
  const ang = Math.atan2(17.2 - 6, 41.5 + 6) + 0.012;
  S.turn = 1; S.phase = "aistroke"; S.pt = 0.15; S.plan = { ang: ang, tx: 0, ty: 0.1, power: 0.5 }; S.aim = ang;
  const st = stanceFor(S.balls[0], ang);
  RH.x = st.x; RH.z = st.z; RH.yaw = st.yaw; RH.goal = { x: st.x, z: st.z, yaw: st.yaw }; RH.mode = "stand"; RH.atT = 1; RH.shootK = 1;
  for (let i = 0; i < 4; i++) syncScene("playing", 0.016);
  RH.shootK = 1; syncScene("playing", 0);
  // a low three-quarter angle: Rhett in the foreground, the bar and the neon behind
  const c = S.balls[0];
  R.camera.up.set(0, 1, 0);
  const cv = (/[?&]cv=([-\d.,]+)/.exec(location.search) || [0, "0.3,80,50,0.6,40"])[1].split(",").map(Number);   // yaw offset, distance, height, look blend, look height
  R.camera.position.set(RH.x + Math.sin(st.yaw + cv[0]) * cv[1], cv[2], RH.z + Math.cos(st.yaw + cv[0]) * cv[1]);
  R.camera.lookAt(lerp(RH.x, c.x, cv[3]), cv[4], lerp(RH.z, -c.y, cv[3]));
  R.camera.fov = 50; R.camera.updateProjectionMatrix(); R.camera.updateMatrixWorld();
  R.renderer.render(R.scene, R.camera);
  const out = mkCanvas(360, 480), g = out.getContext("2d");
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(R.gl, 0, 0, CW, CH, 0, 0, 360, 480);
  const top = g.createLinearGradient(0, 0, 0, 130);
  top.addColorStop(0, "rgba(6,10,30,.85)"); top.addColorStop(1, "rgba(6,10,30,0)");
  g.fillStyle = top; g.fillRect(0, 0, 360, 130);
  const bot = g.createLinearGradient(0, 330, 0, 480);
  bot.addColorStop(0, "rgba(6,10,30,0)"); bot.addColorStop(0.45, "rgba(6,10,30,.78)"); bot.addColorStop(1, "rgba(6,10,30,.95)");
  g.fillStyle = bot; g.fillRect(0, 330, 360, 150);
  drawScript(g, R.script, 180, 52, 300, 92);
  candyText(g, "POOL HALL", 180, 392, 44, 330);
  candyText(g, "HUSTLE", 180, 442, 56, 330);
  const url = out.toDataURL("image/png");
  window.__cover = url;
  document.body.innerHTML = "";
  document.body.style.cssText = "margin:0;background:#0b0f22;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:12px";
  const img = document.createElement("img"); img.id = "np-cover"; img.src = url; img.width = 360; img.height = 480; img.alt = "Pool Hall Hustle cover";
  const a = document.createElement("a"); a.href = url; a.download = "pool-hall-hustle.png"; a.textContent = "Download pool-hall-hustle.png"; a.style.cssText = "color:#ffe45c;font:bold 14px Verdana,sans-serif";
  document.body.appendChild(img); document.body.appendChild(a);
}

// Hook for automated checks (no effect on play)
window.__pool = { S: function () { return S; }, gfx: function () { return R; }, rhett: RH, view: V, led: function () { return LED; }, hall: Hall,
                  shoot: playerShoot, plan: planShot, simulate: simulate, ruling: ruling, POCKETS: POCKETS, SEGS: SEGS, toScreen: bedToScreen, toBed: screenToBed,
                  setMode: function (m) { MODE = m; reset(); },
                  tick: function (secs) { for (let i = 0; i < secs * 60 && Shell.state() === "playing"; i++) update(1 / 60); } };

(function boot() {
  try { const m = localStorage.getItem("npArcade.pool-hall-hustle.mode"); if (m === "8" || m === "9") MODE = m; } catch (e) { /* private mode */ }
  const splash = makeSplash();
  const t0 = performance.now();
  const q = /[?&]gfx=(high|low)/.exec(location.search);
  Promise.all([loadLogo(splash), import(THREE_URL).then(null, function (e) { e.npStage = "three"; throw e; }), loadImage(SCRIPT_URL)])
    .then(function (res) {
      THREE = res[1];
      try { R = buildScene(THREE, res[2], res[0]); } catch (e) { e.npStage = "webgl"; throw e; }
      if (q) { R.qLock = true; setQuality(q[1] === "low" ? QUALITY.length - 1 : 0); }
      reset();
      if (COVER) { renderCover(res[0]); return "cover"; }
      try { syncScene("title", 0); R.renderer.compile(R.scene, R.camera); } catch (e) { /* warm-up only */ }
      const hold = Math.max(0, 1300 - (performance.now() - t0));
      return new Promise(function (r) { setTimeout(r, hold); });
    })
    .then(function (v) {
      if (v === "cover") { return; }
      startGame();
      splashGone(splash);
    })
    .catch(function (e) {
      console.error(e);
      splashFail(splash, e && e.npStage === "three"
        ? "Pool Hall Hustle could not load its 3D engine (" + THREE_URL + ")."
        : "Pool Hall Hustle needs WebGL for its 3D pool hall, and this browser has it switched off or does not support it.");
    });
})();
