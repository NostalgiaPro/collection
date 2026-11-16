/* TAPE PIN LANES (3D): ten fast frames on a glossy lane. Curve it, strike it.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of input, scaling and the title / pause / game over flow, and carries the HUD.

   Rules, controls, scoring and the ball / pin collision model are the same as the 2D game.
   Units are inches and seconds. x runs across the lane (0 = center), y runs down it
   (0 = foul line), z is up. In three.js space that is (x, z, -y). */

const W = 360, H = 540, TAU = Math.PI * 2;
const LW = 20.75, GUT = 9.25, KICK = LW + GUT;           // half lane, gutter, kickback walls
const HEAD_Y = 720, DECK_END = 756, PIT_Y = 772;
const BALL_R = 4.3, PIN_R = 2.25, PIN_TALL = 15;
const BALL_M = 13, PIN_M = 3.5;                          // lighter ball: more deflection on off-center hits
const V_MIN = 420, V_MAX = 660, HOOK = 135, OIL_GRIP = 0.12;
const FALL_V = 28;                                       // a pin pushed faster than this goes down
const START_Y = -14, POS_MAX = LW - BALL_R - 1;
const BUMPER_FRAMES = 3;
// Oil length per frame (inches). Shorter oil = earlier, bigger hook.
const OIL = [470, 380, 560, 330, 500, 420, 300, 540, 360, 450];
const SPOTS = [[0, 0], [-6, 10.39], [6, 10.39], [-12, 20.78], [0, 20.78], [12, 20.78], [-18, 31.18], [-6, 31.18], [6, 31.18], [18, 31.18]];

const GRAV = 386;                                        // in/s^2, for hops and the drop into the pit
const LIE = Math.PI / 2 + 0.1235;                        // a toppled pin rests on its belly and its head
const SWEEP_T = 0.38;
const BOARD_W = (LW * 2) / 39;
const LANE_PITCH = 72;                                   // center to center of neighboring lanes
const WALL_Y = PIT_Y + 30, WALL_H = 150, PIT_Z = -7;
const CAM0 = -150, CAM_H = 40, CAM_AHEAD = 285, CAM_FOV = 30.2;   // aim camera = the old 2D projection
const DECK_CAM = { y: 566, z: 60, ty: 741, tz: 7 };      // the pin-deck view
const LANE_MARK = 150;                                   // length of the wordmark printed on the lane, inches

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash and score card only
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every decal inside the alley
const THREE_URL = "../shared/three.module.min.js";
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';
const PIN_COLORS = ["#ff4b3e", "#16b9e8", "#ff3fa4", "#58c322", "#ffb81f"];

let S = {}, keys = {}, idleT = 0, parts = [];
let THREE = null, R = null;                              // R holds everything the renderer owns

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* ---------------- Rack + scoring ---------------- */
function makePin(i) {
  return { i: i, x: SPOTS[i][0], y: HEAD_Y + SPOTS[i][1], vx: 0, vy: 0, st: "up", dir: 1, wob: 0, wobT: 0, wobDir: 0, drop: 0,
           // 3D presentation only: tip angle and speed, heading of the fall, hop height, spin
           tilt: 0, tiltV: 0, head: 0, z: 0, vz: 0, yaw: Math.random() * TAU, yawV: 0, bounced: false };
}
function fullRack() { const a = []; for (let i = 0; i < 10; i++) a.push(makePin(i)); return a; }

function reset() {
  S = { t: 0, phase: "aim", pt: 0, splitFrame: -1, frame: 0, ball: 0, frames: [[]], pins: fullRack(), dead: [],
        pos: 0, spin: 0, power: 0, charging: false, chargeT: 0, drag: null, kb: false,
        b: null, camY: CAM0, strikesRow: 0, strikes: 0, spares: 0, splitMsg: "", lastClack: 0, rollSnd: 0,
        announcedBumpers: false, sweepFull: false, over: false };
  parts.length = 0;
  ledClear();
}

function oilLen() { return OIL[S.frame % OIL.length]; }
function bumpersUp() { return S.frame < BUMPER_FRAMES; }

function standingCount() {
  let n = 0;
  for (let i = 0; i < S.pins.length; i++) if (S.pins[i].st === "up") n++;
  return n;
}

// Cumulative score per frame (null until it can be scored)
function scores(frames) {
  let rolls = [], i;
  const out = [];
  for (i = 0; i < frames.length; i++) rolls = rolls.concat(frames[i]);
  let r = 0, total = 0;
  for (let f = 0; f < 10; f++) {
    if (r >= rolls.length) { out.push(null); continue; }
    if (rolls[r] === 10) {
      if (rolls.length < r + 3) { out.push(null); r += 1; continue; }
      total += 10 + rolls[r + 1] + rolls[r + 2]; r += 1;
    } else {
      if (rolls.length < r + 2) { out.push(null); r += 2; continue; }
      if (rolls[r] + rolls[r + 1] === 10) {
        if (rolls.length < r + 3) { out.push(null); r += 2; continue; }
        total += 10 + rolls[r + 2];
      } else total += rolls[r] + rolls[r + 1];
      r += 2;
    }
    out.push(total);
  }
  return out;
}
function total() {
  const sc = scores(S.frames);
  let t = 0;
  for (let i = 0; i < sc.length; i++) if (sc[i] != null) t = sc[i];
  return t;
}
function sym(n) { return n === 0 ? "-" : String(n); }
function marks(fr, f) {
  const m = [];
  if (!fr.length) return m;
  if (f < 9) {
    if (fr[0] === 10) return ["X"];
    m.push(sym(fr[0]));
    if (fr.length > 1) m.push(fr[0] + fr[1] === 10 ? "/" : sym(fr[1]));
    return m;
  }
  m.push(fr[0] === 10 ? "X" : sym(fr[0]));
  if (fr.length > 1) {
    if (fr[0] === 10) m.push(fr[1] === 10 ? "X" : sym(fr[1]));
    else m.push(fr[0] + fr[1] === 10 ? "/" : sym(fr[1]));
  }
  if (fr.length > 2) {
    if (fr[0] === 10 && fr[1] !== 10) m.push(fr[1] + fr[2] === 10 ? "/" : sym(fr[2]));
    else m.push(fr[2] === 10 ? "X" : sym(fr[2]));
  }
  return m;
}

/* ---------------- Throw ---------------- */
function canThrow() { return S.phase === "aim" && S.pt > 0.15; }

function throwBall(p, spin) {
  if (!canThrow() || p < 0.05) return;
  const v = V_MIN + clamp(p, 0, 1) * (V_MAX - V_MIN);
  S.b = { x: S.pos, y: START_Y, vx: 0, vy: v, spin: clamp(spin, -1, 1), gutter: false, roll: 0, hitPins: false, atPinsT: 0,
          z: BALL_R, vz: 0 };
  S.phase = "roll"; S.pt = 0;
  S.drag = null; S.charging = false;
  Shell.sfx("whoosh");
}

/* ---------------- Physics ---------------- */
function clack(speed) {
  if (speed < 40 || S.t - S.lastClack < 0.03) return;
  S.lastClack = S.t;
  const v = Math.min(0.45, 0.12 + speed / 1500);
  Shell.noise(0.05, v, 2400 + Math.random() * 1600, 1.5);
  Shell.tone(700 + Math.random() * 500, 0.04, "square", v * 0.5);
}

// A standing pin goes over. The game only cares that it is no longer "up"; the rest is for show.
function topple(p) {
  if (p.st !== "up") return;
  const sp = Math.hypot(p.vx, p.vy);
  p.st = "falling";
  p.dir = p.vx >= 0 ? 1 : -1;
  // The hit lands low, so the base kicks out and the head tips back toward where the hit came from.
  p.head = sp > 1 ? Math.atan2(-p.vy, -p.vx) + (Math.random() - 0.5) * 0.7 : Math.random() * TAU;
  p.tilt = Math.max(p.tilt, 0.04);
  p.tiltV = 2.5 + Math.min(9, sp / 20);
  p.vz = Math.min(95, sp * 0.2) * (0.35 + Math.random() * 0.65);
  p.yawV = (Math.random() - 0.5) * Math.min(16, 2 + sp / 10);
  p.bounced = false;
}

function knock(p, speed) {
  if (p.st === "up") {
    if (speed > FALL_V) topple(p);
    else if (speed > 4) { p.wob = Math.min(0.35, speed / 80); p.wobT = 0; p.wobDir = Math.atan2(p.vy, p.vx); }
  }
}

function collide(a, ar, am, b, br, bm, e) {
  const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, rr = ar + br;
  if (d2 >= rr * rr || d2 < 1e-6) return 0;
  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = rr - d;
  const tm = am + bm;
  a.x -= nx * pen * bm / tm; a.y -= ny * pen * bm / tm;
  b.x += nx * pen * am / tm; b.y += ny * pen * am / tm;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv >= 0) return 0;
  const j = -(1 + e) * rv / (1 / am + 1 / bm);
  a.vx -= j * nx / am; a.vy -= j * ny / am;
  b.vx += j * nx / bm; b.vy += j * ny / bm;
  return -rv;
}

function pinR(p) { return p.st === "up" ? PIN_R : PIN_R + 1.2; } // a toppled pin covers more deck

function step(dt) {
  const b = S.b;
  let i, j, p, q, imp;
  if (b && b.y < PIT_Y + 40) {
    // hook: almost nothing in the oil, full bite on the dry back end
    const grip = b.y > oilLen() ? 1 : OIL_GRIP;
    if (!b.gutter && b.y < HEAD_Y - 10) b.vx += b.spin * HOOK * grip * dt;
    b.vy = Math.max(200, b.vy - 18 * dt);
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.roll += b.vy * dt / BALL_R;
    if (!b.gutter && b.y < DECK_END) {
      const edge = LW - BALL_R + 2.2;
      if (bumpersUp()) {
        if (Math.abs(b.x) > edge) { b.x = Math.sign(b.x) * edge; b.vx = -b.vx * 0.55; Shell.sfx("click"); }
      } else if (Math.abs(b.x) > LW - 0.5) {
        b.gutter = true; b.vx = 0; b.side = Math.sign(b.x);
        Shell.noise(0.18, 0.35, 220, 0.8, 0, 0, "lowpass");
      }
    }
    if (b.gutter) b.x += (b.side * (LW + GUT / 2) - b.x) * Math.min(1, dt * 18);
    if (!b.gutter) {
      for (i = 0; i < S.pins.length; i++) {
        p = S.pins[i];
        if (p.st === "gone" || p.st === "down" && p.drop > 0) continue;
        imp = collide(b, BALL_R, BALL_M, p, pinR(p), PIN_M, 0.62);
        if (imp) { b.hitPins = true; clack(imp); knock(p, Math.hypot(p.vx, p.vy)); }
      }
    }
  }
  // pins
  for (i = 0; i < S.pins.length; i++) {
    p = S.pins[i];
    if (p.st === "gone") continue;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 0) {
      const ns = Math.max(0, sp - (260 + sp * 1.4) * dt);
      p.vx *= ns / sp; p.vy *= ns / sp;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (Math.abs(p.x) > KICK - PIN_R) { p.x = Math.sign(p.x) * (KICK - PIN_R); p.vx = -p.vx * 0.5; clack(Math.abs(p.vx) * 2); }
    if (p.y > PIT_Y) { p.st = "gone"; continue; }
    if (p.y < HEAD_Y - 40) { p.vy = Math.abs(p.vy) * 0.3; }
    if (p.st === "up" && Math.hypot(p.x - (SPOTS[p.i][0]), p.y - (HEAD_Y + SPOTS[p.i][1])) > 2.5) topple(p);
  }
  for (i = 0; i < S.pins.length; i++) {
    p = S.pins[i];
    if (p.st === "gone") continue;
    for (j = i + 1; j < S.pins.length; j++) {
      q = S.pins[j];
      if (q.st === "gone") continue;
      if (p.st === "up" && q.st === "up" && !p.vx && !p.vy && !q.vx && !q.vy) continue;
      imp = collide(p, pinR(p), PIN_M, q, pinR(q), PIN_M, 0.55);
      if (imp) {
        clack(imp);
        knock(p, Math.hypot(p.vx, p.vy)); knock(q, Math.hypot(q.vx, q.vy));
      }
    }
  }
}

function anyMoving() {
  for (let i = 0; i < S.pins.length; i++) {
    const p = S.pins[i];
    if (p.st !== "gone" && Math.hypot(p.vx, p.vy) > 4) return true;
  }
  return false;
}

/* ---------------- Pin action (presentation only, never changes a score) ---------------- */
function animatePin(p, dt) {
  if (p.wob > 0) { p.wobT += dt; p.wob = Math.max(0, p.wob - dt * 0.5); }
  if (p.st === "up") return;
  // tip over like an inverted pendulum, with one small bounce off the deck
  if (p.tilt < LIE || p.tiltV < 0) {
    p.tiltV += 34 * Math.sin(Math.max(p.tilt, 0.06)) * dt;
    p.tilt += p.tiltV * dt;
    if (p.tilt >= LIE) {
      p.tilt = LIE;
      if (p.tiltV > 5 && !p.bounced) { p.bounced = true; p.tiltV *= -0.2; }
      else { p.tiltV = 0; if (p.st === "falling") p.st = "down"; }
    }
  }
  // hop, then land (or keep dropping once it is over the pit)
  const overPit = p.st === "gone" || p.y > PIT_Y;
  if (p.vz !== 0 || p.z > 0 || overPit) {
    p.vz -= GRAV * dt; p.z += p.vz * dt;
    const floor = overPit ? -40 : 0;
    if (p.z < floor) { p.z = floor; p.vz = p.vz < -45 ? -p.vz * 0.28 : 0; }
  }
  if (p.st === "gone") {
    p.x = clamp(p.x + p.vx * dt * 0.7, -KICK + 2, KICK - 2);
    p.y = Math.min(WALL_Y - 9, p.y + Math.max(p.vy, 30) * dt * 0.7);
  }
  p.head += p.yawV * dt;
  p.yawV *= Math.max(0, 1 - 1.8 * dt);
}

function rakeY() { return HEAD_Y - 12 + clamp(S.pt / SWEEP_T, 0, 1) * 70; }

// Deadwood (and, on a full reset, anything still standing) rides the rake into the pit.
function animateDead(dt) {
  const rake = S.phase === "sweep" ? rakeY() : null;
  for (let i = S.dead.length - 1; i >= 0; i--) {
    const p = S.dead[i];
    if (rake != null && p.st !== "gone" && p.y < rake + 2.5) {
      if (p.st === "up") { p.vx = 0; p.vy = 1; topple(p); p.head = Math.PI / 2 + (Math.random() - 0.5); p.tiltV = 5; p.vz = 0; }
      p.y = rake + 2.5; p.vx *= 0.5; p.vy = 190;
    }
    if (p.st !== "gone" && p.y > PIT_Y) p.st = "gone";
    animatePin(p, dt);
    if (p.z <= -30) S.dead.splice(i, 1);
  }
}

/* ---------------- Flow ---------------- */
function setPhase(ph) { S.phase = ph; S.pt = 0; }

function update(dt) {
  S.t += dt; S.pt += dt;
  let i;
  for (i = 0; i < S.pins.length; i++) animatePin(S.pins[i], dt);
  animateDead(dt);
  for (i = parts.length - 1; i >= 0; i--) {
    const q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 200 * dt; q.rot += q.vr * dt;
    if (q.life <= 0) parts.splice(i, 1);
  }

  if (S.phase === "aim") {
    const mv = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
    if (mv) { S.pos = clamp(S.pos + mv * 22 * dt, -POS_MAX, POS_MAX); S.kb = true; }
    const hk = (keys.ArrowUp ? 1 : 0) + (keys.ArrowDown ? -1 : 0);
    if (hk) { S.spin = clamp(S.spin + hk * 1.1 * dt, -1, 1); S.kb = true; }
    if (S.charging) {
      S.chargeT += dt;
      const ph = (S.chargeT / 1.1) % 2;
      S.power = ph < 1 ? ph : 2 - ph;
    }
    if (!S.announcedBumpers && S.frame === BUMPER_FRAMES && S.ball === 0) {
      S.announcedBumpers = true;
      Shell.flash("BUMPERS DOWN", "Gutters are live from here on.", "#ff3fa4", 1300);
    }
    return;
  }

  if (S.phase === "roll" || S.phase === "settle") {
    const b = S.b;
    let maxV = Math.max(Math.hypot(b.vx, b.vy), 1);
    for (i = 0; i < S.pins.length; i++) maxV = Math.max(maxV, Math.hypot(S.pins[i].vx, S.pins[i].vy));
    const n = clamp(Math.ceil(maxV * dt / 1.6), 2, 30);
    for (i = 0; i < n; i++) step(dt / n);
    // the ball sits lower in the gutter and drops off the end of the deck into the pit
    if (b.y > PIT_Y) { b.vz -= GRAV * dt; b.z = Math.max(PIT_Z + BALL_R, b.z + b.vz * dt); }
    else b.z += ((b.gutter ? BALL_R - 2.3 : BALL_R) - b.z) * Math.min(1, dt * 20);
    // rolling rumble
    if (b.y < PIT_Y) {
      S.rollSnd -= dt;
      if (S.rollSnd <= 0) { S.rollSnd = 0.08; Shell.noise(0.1, b.gutter ? 0.1 : 0.16, b.gutter ? 260 : 140, 0.7, 0, 0, "lowpass", 0.02); }
    }
    if (S.phase === "roll" && b.y > HEAD_Y - 6) setPhase("settle");
    if (S.phase === "settle") {
      const done = (b.y > PIT_Y || b.gutter) && (!anyMoving() && S.pt > 0.35 || S.pt > 2.2);
      if (done) resolveBall();
    }
    return;
  }
  if (S.phase === "result") {
    if (S.pt > 0.55) startSweep();
    return;
  }
  if (S.phase === "sweep") {
    const k = S.pt / SWEEP_T;
    if (S.sweepFull) for (i = 0; i < S.pins.length; i++) S.pins[i].drop = Math.max(0, 1 - k);
    if (k >= 1) {
      for (i = 0; i < S.pins.length; i++) S.pins[i].drop = 0;
      S.b = null;
      if (S.over) { finishGame(); return; }
      setPhase("aim");
    }
  }
}

function resolveBall() {
  const b = S.b;
  let i, p, down = 0;
  for (i = 0; i < S.pins.length; i++) {
    p = S.pins[i];
    if (p.st !== "up") { if (!p.counted) { p.counted = true; down++; } }
  }
  const fr = S.frames[S.frame];
  fr.push(down);
  const first = S.ball === 0, f = S.frame;
  const standing = standingCount();
  const strike = down === 10 && (first || (f === 9 && fr.length === 2 && fr[0] === 10) || (f === 9 && fr.length === 3 && (fr[1] === 10 || fr[0] + fr[1] === 10)));
  const spare = !strike && standing === 0 && !first;
  let title, sub = "", col = "#eceae2", board = null;      // board: what the LED ribbon flashes for this ball

  if (strike) {
    board = "strike";
    S.strikes++; S.strikesRow++;
    if (S.strikesRow === 3) { title = "TURKEY!"; sub = "Three in a row. BE KIND, REWIND... ALL OF THEM."; col = "#ff4b3e"; burst(60); Shell.sfx("best"); }
    else { title = S.strikesRow > 3 ? S.strikesRow + " IN A ROW!" : "STRIKE!"; sub = "BE KIND, REWIND... ALL OF THEM."; col = "#ffd23f"; burst(30); }
    Shell.sfx("crowd"); Shell.sfx("score"); Shell.shake(4, 0.3); camShake(1.3, 0.35);
    if (window.Trophies) { window.Trophies.unlock("tpl-strike"); if (S.strikesRow === 3) window.Trophies.unlock("tpl-turkey"); }
    if (window.NPRewards && S.strikesRow >= 2) window.NPRewards.streak(S.strikesRow);
  } else {
    S.strikesRow = 0;
    if (spare) {
      S.spares++; title = "SPARE!"; sub = "Picked it clean."; col = "#3ff0ff"; Shell.sfx("score"); board = "spare";
      if (window.Trophies) { window.Trophies.unlock("tpl-spare"); if (S.splitFrame === f) window.Trophies.unlock("tpl-split"); }
    }
    else if (down === 0 && b.gutter) {
      title = "LATE FEE."; sub = "Gutter ball."; col = "#ff3fa4"; Shell.sfx("miss"); board = "gutter";
      if (window.Trophies && f >= BUMPER_FRAMES) window.Trophies.unlock("tpl-latefee");
    }
    else if (down === 0) { title = "MISS"; sub = "Not a scratch on them."; col = "#8e93a2"; Shell.sfx("miss"); }
    else {
      title = down + (down === 1 ? " PIN" : " PINS");
      if (first && isSplit()) { title = "SPLIT"; sub = down + " down. Good luck with the rest."; col = "#a77bff"; S.splitFrame = f; board = "split"; }
      else if (standing > 0) sub = standing + " left standing.";
      Shell.sfx("tap");
    }
  }
  Shell.flash(title, sub, col, 900);

  // advance frame / ball
  let rerack = false;
  if (f < 9) {
    if (strike || !first) { S.frame++; S.ball = 0; S.frames.push([]); rerack = true; }
    else S.ball = 1;
  } else {
    if (fr.length === 1) { S.ball = 1; rerack = strike; }
    else if (fr.length === 2) {
      if (fr[0] === 10 || fr[0] + fr[1] === 10) { S.ball = 2; rerack = strike || spare; }
      else S.over = true;
    } else S.over = true;
  }
  S.sweepFull = rerack && !S.over;
  ledResult(board, title);
  setPhase("result");
}

function startSweep() {
  const keep = [];
  S.dead = [];
  for (let i = 0; i < S.pins.length; i++) {
    const p = S.pins[i];
    // clear the deadwood, leave standing pins where they are (unless the whole rack is being reset)
    if (!S.sweepFull && p.st === "up") { p.vx = p.vy = 0; p.wob = 0; keep.push(p); }
    else if (p.z > -30) S.dead.push(p);
  }
  if (S.sweepFull) {
    S.pins = fullRack();
    for (let i = 0; i < S.pins.length; i++) S.pins[i].drop = 1;
  } else S.pins = keep;
  Shell.noise(0.3, 0.12, 400, 0.6, 0, 900);
  setPhase("sweep");
}

function isSplit() {
  const up = [];
  let i, j;
  for (i = 0; i < S.pins.length; i++) if (S.pins[i].st === "up") up.push(S.pins[i]);
  if (up.length < 2) return false;
  for (i = 0; i < up.length; i++) if (up[i].i === 0) return false; // headpin still up: not a split
  // group standing pins by neighbor distance; more than one group = split
  const group = up.map(function (_, k) { return k; });
  function find(k) { while (group[k] !== k) k = group[k]; return k; }
  for (i = 0; i < up.length; i++) for (j = i + 1; j < up.length; j++) {
    const a = SPOTS[up[i].i], c = SPOTS[up[j].i];
    if (Math.hypot(a[0] - c[0], a[1] - c[1]) < 12.5) group[find(i)] = find(j);
  }
  const roots = {};
  for (i = 0; i < up.length; i++) roots[find(i)] = 1;
  return Object.keys(roots).length > 1;
}

function finishGame() {
  const t = total();
  const title = t === 300 ? "PERFECT GAME!" : "TEN FRAMES DONE";
  ledFinal(t);
  Shell.gameOver(t, { title: title, html: cardHTML() +
    '<div class="np-row" style="margin-top:10px"><span>Strikes</span><b>' + S.strikes + '</b></div>' +
    '<div class="np-row"><span>Spares</span><b>' + S.spares + '</b></div>',
    stats: { total: t, strikes: S.strikes, spares: S.spares, frames: JSON.parse(JSON.stringify(S.frames)) } });
}
function cardHTML() {
  const sc = scores(S.frames);
  let h = '<table class="np-card10" aria-label="Scorecard"><tr>', i;
  for (i = 0; i < 10; i++) h += "<th>" + (i + 1) + "</th>";
  h += "</tr><tr>";
  // Each roll is its own box with a gap, so a 1 then a 7 never reads as "17".
  for (i = 0; i < 10; i++) {
    const mk = S.frames[i] ? marks(S.frames[i], i) : [];
    h += '<td class="np-nw"' + (mk.length ? ' aria-label="Frame ' + (i + 1) + ': ' + mk.join(", ") + '"' : "") + ">" +
      mk.map(function (m) { return '<span class="np-roll">' + m + "</span>"; }).join("") + "</td>";
  }
  h += "</tr><tr>";
  for (i = 0; i < 10; i++) h += "<td>" + (sc[i] == null ? "" : sc[i]) + "</td>";
  return h + "</tr></table>";
}

function burst(n) {
  const cols = ["#ffd23f", "#3ff0ff", "#ff3fa4", "#9bff3f", "#ff9214", "#ffffff"];
  if (Shell.reduced) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 60 + Math.random() * 160;
    parts.push({ x: W / 2, y: 230, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 1.1, c: cols[i % cols.length],
                 rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14 });
  }
}

/* ---------------- Input ---------------- */
function pointer(type, x, y) {
  if (type === "down") {
    if (!canThrow()) return;
    S.drag = { sx: x, sy: y, ox: x, oy: y, mode: "slide", pos0: S.pos, x: x, y: y };
    S.kb = false; S.charging = false;
  } else if (type === "move" && S.drag) {
    const d = S.drag;
    d.x = x; d.y = y;
    if (d.mode === "slide") {
      if (y > d.oy) { d.oy = y; d.ox = x; }            // lowest point so far starts the flick
      if (d.oy - y > 16) d.mode = "flick";
      else S.pos = clamp(d.pos0 + (x - d.sx) * 0.15, -POS_MAX, POS_MAX);
    }
  } else if ((type === "up" || type === "cancel") && S.drag) {
    const dd = S.drag; S.drag = null;
    if (type === "cancel" || dd.mode !== "flick") return;
    const f = flick(dd);
    if (f) throwBall(f.p, f.spin);
  }
}
function flick(d) {
  const dy = d.oy - d.y, dx = d.x - d.ox;
  if (dy < 24) return null;
  return { p: clamp(dy / 210, 0, 1), spin: clamp(dx / Math.max(dy, 60) * 1.5, -1, 1) };
}
function key(type, code, e) {
  const act = code === "Space" || code === "Enter" || code === "NumpadEnter";
  if (type === "down") {
    keys[code] = true;
    if (act && !e.repeat && canThrow() && !S.charging) { S.charging = true; S.chargeT = 0; S.power = 0; S.kb = true; S.drag = null; }
  } else {
    keys[code] = false;
    if (act && S.charging) { S.charging = false; throwBall(S.power, S.spin); S.power = 0; }
  }
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
// A small, blurry copy of a painted texture: what the lacquer reflects is a soft glow, not a mirror image.
function softCanvas(src, w, h) {
  const c = mkCanvas(w, h), g = c.getContext("2d");
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, w, h);
  return c;
}

/* ---------------- Painted textures (all drawn here, no image files besides the wordmark) ---------------- */

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every decal inside the alley uses this
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

function woodCanvas() {
  const c = mkCanvas(512, 512), g = c.getContext("2d"), rnd = rng(11);
  const bw = 512 / 39;
  for (let i = 0; i < 39; i++) {
    g.fillStyle = "hsl(" + (35 + rnd() * 6) + "," + (62 + rnd() * 12) + "%," + (69 + rnd() * 9) + "%)";
    g.fillRect(Math.floor(i * bw), 0, Math.ceil(bw) + 1, 512);
    for (let k = 0; k < 4; k++) {                          // grain runs the length of the lane
      g.fillStyle = "rgba(120,70,20," + (0.04 + rnd() * 0.07) + ")";
      g.fillRect(i * bw + rnd() * bw, 0, 1, 512);
    }
    if (rnd() < 0.35) { g.fillStyle = "rgba(255,240,210," + (0.08 + rnd() * 0.08) + ")"; g.fillRect(i * bw + rnd() * bw, 0, 2, 512); }
  }
  for (let i = 1; i < 39; i++) {
    g.fillStyle = i % 5 === 0 ? "rgba(105,60,20,.5)" : "rgba(125,78,34,.26)";
    g.fillRect(Math.round(i * bw), 0, 1, 512);
  }
  return c;
}

function ballCanvas(script) {
  const c = mkCanvas(1024, 512), g = c.getContext("2d"), rnd = rng(5);
  const bg = g.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, "#7d3ff2"); bg.addColorStop(0.5, "#4a1fb8"); bg.addColorStop(1, "#2a0f78");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 512);
  // pearl swirls, wrapped so the seam does not show
  for (let i = 0; i < 46; i++) {
    const x = rnd() * 1024, y = 40 + rnd() * 432, r = 30 + rnd() * 90, a0 = rnd() * TAU, len = 1 + rnd() * 2.4;
    g.lineWidth = 3 + rnd() * 12;
    g.strokeStyle = ["rgba(196,150,255,.30)", "rgba(120,200,255,.22)", "rgba(255,130,220,.20)", "rgba(40,10,110,.35)"][i % 4];
    for (let k = -1; k <= 1; k++) { g.beginPath(); g.arc(x + k * 1024, y, r, a0, a0 + len); g.stroke(); }
  }
  // the script wordmark, once on each side of the ball (u = .25 faces the bowler at rest)
  // each row is widened by 1 / cos(latitude) so it lands on the sphere undistorted
  const SW = 256, SH = Math.round(SW * script.height / script.width), rowH = script.height / SH;
  [256, 768].forEach(function (cx) {
    for (let r = 0; r < SH; r++) {
      const y = 256 - Math.round(SH / 2) + r, lat = (0.5 - (y + 0.5) / 512) * Math.PI, w = SW / Math.max(0.4, Math.cos(lat));
      g.drawImage(script, 0, r * rowH, script.width, rowH, cx - w / 2, y, w, 1);
    }
  });
  // finger holes up top, between the two logos
  const hy = 100, st = 1.5;
  g.fillStyle = "#12052e";
  [[-26, 0], [26, 0], [0, 40]].forEach(function (o) {
    const sx = o[1] ? 1.25 : st;
    g.beginPath(); g.ellipse(512 + o[0] * st, hy + o[1], 12 * sx, 12, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(o[0] * st, hy + o[1], 12 * sx, 12, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(1024 + o[0] * st, hy + o[1], 12 * sx, 12, 0, 0, TAU); g.fill();
  });
  return c;
}

// A white pin wearing a rental-tape label around its belly. v runs base (bottom of canvas) to head.
function pinCanvas(color) {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  const Y = function (h) { return 256 - h / PIN_TALL * 256; };
  g.fillStyle = "#fbfaf4"; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#d9d5c8"; g.fillRect(0, Y(0.35), 256, 256 - Y(0.35));          // base ring
  g.fillStyle = color;                                                            // neck stripes
  g.fillRect(0, Y(11.75), 256, Y(11.2) - Y(11.75));
  g.fillRect(0, Y(10.75), 256, Y(10.2) - Y(10.75));
  // tape label
  const top = Y(7.1), bot = Y(2.3);
  g.fillStyle = "#16171d"; g.fillRect(0, top - 2, 256, bot - top + 4);
  g.fillStyle = "#f4efdf"; g.fillRect(0, top, 256, bot - top);
  g.fillStyle = color; g.fillRect(0, top + 5, 256, 9);
  g.fillStyle = "#16171d"; g.fillRect(0, top + 17, 256, 2);
  g.fillStyle = color; g.fillRect(0, bot - 13, 256, 5);
  g.fillStyle = "#16171d";
  g.font = "bold 17px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle";
  const mid = (top + 19 + bot - 13) / 2 + 1;
  g.fillText("BE KIND", 64, mid - 10); g.fillText("REWIND", 64, mid + 10);
  g.fillText("BE KIND", 192, mid - 10); g.fillText("REWIND", 192, mid + 10);
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

// The masking unit above the pins: 70 x 22 inches of marquee. Script wordmark on the left, the game on the right.
function maskCanvas(script) {
  const c = mkCanvas(1024, 322), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 322);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 322);
  const gl = g.createLinearGradient(0, 0, 0, 150);
  gl.addColorStop(0, "rgba(255,255,255,.42)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.beginPath(); g.ellipse(512, -20, 620, 170, 0, 0, TAU); g.fill();
  g.lineWidth = 16; g.strokeStyle = "#ff9214"; g.strokeRect(8, 8, 1008, 306);
  g.lineWidth = 4; g.strokeStyle = "#ffe45c"; g.strokeRect(19, 19, 986, 284);
  let sw = 590, sh = sw * script.height / script.width;
  if (sh > 236) { sh = 236; sw = sh * script.width / script.height; }
  g.drawImage(script, 334 - sw / 2, 161 - sh / 2, sw, sh);
  candyText(g, "TAPE PIN", 818, 116, 62, 330);
  candyText(g, "LANES", 818, 208, 84, 330);
  return c;
}

// The whole back wall in one piece (360 x 150 inches): a single long blue and orange banner above the
// masking units. The LED ribbon board (below) hangs in front of the lower part of it.
const WALL_W = LANE_PITCH * 5;
const BANNER = { z: 67 };                                  // height the wall's spotlight is centered on, inches
function wallCanvas() {
  const CW = 1024, CH = 512;
  const c = mkCanvas(CW, CH), g = c.getContext("2d"), rnd = rng(23);
  const kx = CW / WALL_W, ky = CH / WALL_H;
  const Y = function (z) { return CH - z * ky; };
  const bg = g.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, "#143fae"); bg.addColorStop(0.45, "#2f7bf0"); bg.addColorStop(0.8, "#1b56cf"); bg.addColorStop(1, "#143fae");
  g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
  const cy = Y(BANNER.z), top = Y(46.5);
  g.save(); g.beginPath(); g.rect(0, 0, CW, top); g.clip();
  const glow = g.createRadialGradient(CW / 2, cy, 10, CW / 2, cy, 330);  // one soft spotlight behind the wordmark
  glow.addColorStop(0, "rgba(140,200,255,.55)"); glow.addColorStop(1, "rgba(140,200,255,0)");
  g.fillStyle = glow; g.fillRect(0, 0, CW, top);
  for (let i = 0; i < 28; i += 2) {                       // one sunburst for the whole banner
    g.fillStyle = "rgba(255,255,255,.07)";
    g.beginPath(); g.moveTo(CW / 2, cy);
    g.arc(CW / 2, cy, 1400, i / 28 * TAU, (i + 1) / 28 * TAU); g.closePath(); g.fill();
  }
  for (let i = 0; i < 90; i++) {                          // candy bubbles scattered end to end
    const x = rnd() * CW, y = rnd() * top, r = 2 + rnd() * 6.5;
    g.lineWidth = 1.6; g.strokeStyle = "rgba(255,255,255," + (0.07 + rnd() * 0.1) + ")";
    g.beginPath(); g.ellipse(x, y, r * kx, r * ky, 0, 0, TAU); g.stroke();
  }
  g.restore();
  // trim stripes run the full width, top and bottom of the banner
  g.fillStyle = "#ff9214"; g.fillRect(0, Y(46.5), CW, Y(41) - Y(46.5));
  g.fillStyle = "#ffe45c"; g.fillRect(0, Y(46.5) - 3, CW, 3);
  g.fillStyle = "#ffffff"; g.fillRect(0, Y(41), CW, 2);
  g.fillStyle = "#ff9214"; g.fillRect(0, Y(132), CW, Y(128) - Y(132));
  g.fillStyle = "#ffe45c"; g.fillRect(0, Y(128), CW, 3);
  // behind the masking units, and the pit curtain under them
  g.fillStyle = "#0a1a52"; g.fillRect(0, Y(41) + 2, CW, Y(18) - Y(41));
  const cu = g.createLinearGradient(0, Y(18), 0, CH);
  cu.addColorStop(0, "#050816"); cu.addColorStop(1, "#0c1330");
  g.fillStyle = cu; g.fillRect(0, Y(18), CW, CH - Y(18));
  for (let x = 3; x < CW; x += 13) { g.fillStyle = "rgba(255,255,255,.035)"; g.fillRect(x, Y(18), 5, CH - Y(18)); }
  return c;
}
/* ---------------- LED ribbon board: the full-width strip on the back wall, above the masking units ----------------
   The board is a real dot matrix. Everything on it is painted into a tiny canvas, one pixel per LED, and a small
   shader turns each pixel into a glowing dot. It scrolls its programme right to left, and cuts to big animated
   messages when the game calls for one (ledResult / ledFinal below). */
const LED_H = 39, LED_Z = 66.5;                            // inches: lit height, and its center height on the wall
const LED_ROWS = 26, LED_COLS = Math.round(WALL_W / (LED_H / LED_ROWS));
const LED_SPEED = 42;                                      // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));   // the largest text size that fits (5 x 7 font, in LEDs per font pixel)
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
// Short messages between the plugs. The wordmark leads each group.
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["BE KIND, REWIND", "pink"], ["NO QUARTERS REQUIRED", "cyan"]];
// Plugs for the rest of the arcade: [game, one-line tag]. Edit freely, the board lays itself out.
const LED_PLUGS = [
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
      const row = rows[r];
      for (let c = 0; c < 5; c++) if (row.charCodeAt(c) === 49) g.fillRect(x + c * sx, y + r * sy, sx, sy);
    }
    x += 6 * sx;
  }
  return x;
}

// The whole scrolling programme, painted once into one long strip (LED_ROWS tall).
function ledStrip(script) {
  const H = LED_ROWS, big = LED_BIG, yBig = Math.floor((H - 7 * big) / 2), GAP = 13, items = [];
  // The wordmark at board resolution, prepared once. At this size the thin script strokes come out half
  // lit, so the cream lettering is pushed to full LED brightness, the red edge is kept as a dimmer rim
  // and the navy outline falls back to dark: the script reads as light on black.
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
  function mark() {
    items.push({ w: markW, draw: function (g, x) { g.drawImage(markC, x, 0); } });
  }
  function line(str, color) {
    items.push({ w: ledTextW(str, big), draw: function (g, x) { ledText(g, str, x, yBig, big, big, color); } });
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
    ledText(g, "*", x, Math.floor((H - 7) / 2), 1, 1, LED_C.blue);       // a small separator between items
    x += 7 + GAP;
  }
  return { canvas: c, markW: items[0].w };
}

function ledCreate(script) {
  const c = mkCanvas(LED_COLS, LED_ROWS), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  const strip = ledStrip(script), sw = strip.canvas.width;
  // open with the wordmark sitting in the middle of the board
  const start = ((-(LED_COLS - strip.markW) / 2) % sw + sw) % sw;
  return { canvas: c, g: g, strip: strip.canvas, scroll: start, pos: -1, msg: null, queue: [], frame: -1, lastScore: 0, tex: null };
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

function ledMsg(kind, text, dur, more) {
  const m = { kind: kind, text: text, dur: dur, t: 0, wait: 0 };
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
function ledClear() {
  if (!LED) return;
  LED.msg = null; LED.queue = []; LED.lastScore = 0; LED.pos = -1;
}
// A ball has been scored. kind: "strike" | "spare" | "split" | "gutter" | null. The camera is over the pin deck at
// this moment and the board is out of sight, so the first message holds still for a beat before it animates.
function ledResult(kind, text) {
  const L = LED;
  if (!L) return;
  const list = [], sc = total(), wait = 1.15;
  if (kind === "strike") list.push(ledMsg("strike", text, 3.6, { wait: wait }));
  else if (kind === "spare") list.push(ledMsg("spare", "SPARE", 3.2, { wait: wait }));
  else if (kind === "split") list.push(ledMsg("split", "SPLIT", 3.2, { wait: wait }));
  else if (kind === "gutter") list.push(ledMsg("gutter", "GUTTER", 3.2, { wait: wait }));
  if (!S.over && sc > 0) {
    list.push(ledMsg("score", "SCORE", list.length ? 2.1 : 3.4, { from: Math.min(L.lastScore, sc), value: sc, wait: list.length ? 0 : wait }));
  }
  L.lastScore = sc;
  ledPlay(list);
}
function ledFinal(score) {
  if (!LED) return;
  ledPlay([ledMsg("score", "FINAL", 6, { from: Math.min(LED.lastScore, score), value: score, final: true, wait: 0.7 })], true);
  LED.lastScore = score;
}

function ledDrawMsg(g, m) {
  const W = LED_COLS, H = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((H - 7 * big) / 2), mid = Math.round(W / 2);
  const step = calm ? 0 : Math.floor(m.t * 24);
  function fit(str) {                                       // widest lettering that still leaves room either side
    let sx = big + 1;
    if (ledTextW(str, sx) > W - 60) sx = big;
    while (sx > 1 && ledTextW(str, sx) > W - 16) sx--;
    return sx;
  }
  function chase(color, dir) {                              // running lights along the top and bottom edges
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < W; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(W - x - 3, H - 1, 3, 1); }
  }
  const sx = fit(m.text), sy = Math.min(sx, big), w = ledTextW(m.text, sx), x0 = Math.round((W - w) / 2);

  if (m.kind === "strike") {
    if (!calm && m.t >= m.wait && t < 0.6 && Math.floor(t * 12) % 2 === 0) {      // strobe: the whole board flips
      g.fillStyle = LED_C.yellow; g.fillRect(0, 0, W, H);
      ledText(g, m.text, x0, yBig, sx, big, "#000000");
      return;
    }
    const span = 6 * big + 5, ph = calm ? 0 : Math.floor((t * 46) % span);
    for (let k = 0; k < 12; k++) {                          // chevrons racing outward on both sides
      const off = Math.round(w / 2) + 9 + k * span + ph;
      if (off > mid + span) break;
      const col = k % 2 ? LED_C.red : LED_C.orange;
      ledText(g, ">", mid + off, yBig, big, big, col);
      ledText(g, "<", mid - off - 5 * big, yBig, big, big, col);
    }
    const cyc = [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0, yBig, sx, big, calm ? LED_C.yellow : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 18; i++) g.fillRect((Math.random() * W) | 0, (Math.random() * H) | 0, 1, 1); }
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "spare") {                                 // slides in from the right, then a white glint sweeps across it
    const k = calm || m.t < m.wait ? 1 : Math.min(1, t / 0.45), e = 1 - Math.pow(1 - k, 3);
    const x = Math.round(x0 + (1 - e) * W);
    ledText(g, m.text, x, yBig, sx, big, LED_C.cyan);
    if (!calm && k >= 1) {
      const bx = Math.floor(((t - 0.45) * 150) % (W + 80)) - 40;
      g.save(); g.beginPath(); g.rect(bx, 0, 12, H); g.clip();
      ledText(g, m.text, x, yBig, sx, big, "#ffffff");
      g.restore();
    }
    chase(LED_C.cyan, -1);
    return;
  }
  if (m.kind === "split") {                                 // the word keeps coming apart down the middle
    const half = Math.ceil(m.text.length / 2), a = m.text.slice(0, half), b = m.text.slice(half);
    const gap = calm ? 8 : Math.round(3 + 15 * Math.abs(Math.sin(t * 3.1)));
    ledText(g, a, x0 - gap, yBig, sx, big, LED_C.violet);
    ledText(g, b, x0 + ledTextW(a, sx) + sx + gap, yBig, sx, big, LED_C.violet);
    const cx = x0 + ledTextW(a, sx) + Math.floor(sx / 2);
    g.fillStyle = "#ffffff";
    if (gap > 6) for (let r = 1; r < H - 1; r++) g.fillRect(cx + ((r >> 1) % 2 ? 1 : -1), r, 1, 1);
    chase(LED_C.violet, 1);
    return;
  }
  if (m.kind === "gutter") {                                // blinks, while a ball trundles along the bottom
    if (calm || m.t < m.wait || t > 1.2 || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, yBig, sx, big, LED_C.pink);
    g.fillStyle = LED_C.red; g.fillRect(0, H - 1, W, 1);
    if (!calm) { g.fillStyle = "#ffffff"; g.fillRect(Math.floor((m.t * 95) % (W + 16)) - 8, H - 3, 4, 2); }
    return;
  }
  // score: counts up to the new total
  const k = calm ? 1 : Math.min(1, t / 0.7), v = Math.round(m.from + (m.value - m.from) * k);
  const label = m.text + " ", full = ledTextW(label + m.value, big), x = Math.round((W - full) / 2);
  const xn = ledText(g, label, x, yBig, big, big, LED_C.amber);
  const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
  ledText(g, String(v), xn, yBig, big, big, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
  if (!calm && m.wait === 0 && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(W * m.t / 0.3), 0, W, H); }   // wipe in
  chase(LED_C.amber, 1);
}

function ledDraw() {
  const L = LED, g = L.g, W = LED_COLS, H = LED_ROWS;
  g.fillStyle = "#000000"; g.fillRect(0, 0, W, H);
  if (L.msg) { ledDrawMsg(g, L.msg); return; }
  const sw = L.strip.width;
  let sx = L.pos, dx = 0;
  while (dx < W) {                                          // the strip wraps around
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

function ceilingCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  g.fillStyle = "#0b1f5e"; g.fillRect(0, 0, 256, 256);
  g.shadowColor = "#9fd0ff"; g.shadowBlur = 34;
  const gr = g.createLinearGradient(0, 40, 0, 216);
  gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "#d6ebff");
  g.fillStyle = gr; g.fillRect(74, 34, 108, 188);
  g.shadowBlur = 0;
  return c;
}

function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(20,10,0,.85)"); gr.addColorStop(0.55, "rgba(20,10,0,.45)"); gr.addColorStop(1, "rgba(20,10,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}

// Pin spots and a lighter pin deck, laid over the lane from y = 700 to 760.
function deckCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  const X = function (x) { return (x + LW) / (LW * 2) * 256; }, Y = function (y) { return (760 - y) / 60 * 256; };
  const gr = g.createLinearGradient(0, Y(712), 0, Y(700));
  gr.addColorStop(0, "rgba(255,250,235,.16)"); gr.addColorStop(1, "rgba(255,250,235,0)");
  g.fillStyle = gr; g.fillRect(0, Y(712), 256, Y(700) - Y(712));
  g.fillStyle = "rgba(255,250,235,.16)"; g.fillRect(0, 0, 256, Y(712));
  for (let i = 0; i < 10; i++) {
    const x = X(SPOTS[i][0]), y = Y(HEAD_Y + SPOTS[i][1]);
    g.fillStyle = "rgba(70,36,10,.30)"; g.beginPath(); g.ellipse(x, y, 14.5, 10, 0, 0, TAU); g.fill();
    g.lineWidth = 1.5; g.strokeStyle = "rgba(60,30,8,.45)"; g.stroke();
  }
  return c;
}

// A tiny painted room for the glossy highlights on the ball and pins.
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.16, "#dcebff"); gr.addColorStop(0.3, "#3d8cff");
    gr.addColorStop(0.5, "#1648b8"); gr.addColorStop(0.52, "#b97f3e"); gr.addColorStop(1, "#e9c58a");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#2a55b8"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(8, 6, 14, 52); tg.fillRect(42, 6, 14, 52);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#e3bd80"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x0b2a7c, 1);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(CAM_FOV, W / H, 6, 3200);
  const caps = renderer.capabilities;
  const aniso = Math.min(4, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);

  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = aniso;
    return t;
  }

  const script = scriptCanvas(scriptImg);
  // the wordmark as a decal texture: a power-of-two canvas with a clear rim so its edges never smear
  const cScript = mkCanvas(1024, 256);
  cScript.getContext("2d").drawImage(script, 6, 6, 1012, 244);
  const tScript = tex(cScript), tWood = tex(woodCanvas(), true), tBall = tex(ballCanvas(script), true);
  const cMask = maskCanvas(script), cWall = wallCanvas();
  const tMask = tex(cMask), tWall = tex(cWall), tCeil = tex(ceilingCanvas(), true);
  // what the lane reflects of the wall: one soft glow
  const cWallSoft = softCanvas(cWall, 128, 64);
  const tMaskSoft = tex(softCanvas(cMask, 64, 32)), tWallSoft = tex(cWallSoft);
  const tShadow = tex(shadowCanvas()), tDeck = tex(deckCanvas());
  tBall.wrapT = T.ClampToEdgeWrapping;
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;

  // Everything in "world" that stands above the floor gets a twin in "mirror" (flipped through the
  // lane surface). The lane itself is slightly see-through, so the twins read as its reflection.
  const world = new T.Group(), mirror = new T.Group();
  mirror.scale.y = -1;
  scene.add(world); scene.add(mirror);
  function both(mesh) { world.add(mesh); const m = mesh.clone(); mirror.add(m); return m; }
  // The room's reflection is kept soft so the wood still reads as wood; pins and the ball reflect at full strength.
  function dim(mat, k) { const m = mat.clone(); m.color.multiplyScalar(k); return m; }

  function scaleUV(geo, su, sv) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    return geo;
  }
  // A flat rectangle on the floor, texture "up" pointing down the lane.
  function floor(x1, x2, y1, y2, z, mat, su, sv) {
    const g = new T.PlaneGeometry(x2 - x1, y2 - y1);
    g.rotateX(-Math.PI / 2);
    if (su) scaleUV(g, su, sv);
    const m = new T.Mesh(g, mat);
    m.position.set((x1 + x2) / 2, z, -(y1 + y2) / 2);
    return m;
  }
  function decal(mat, order) { mat.transparent = true; mat.depthWrite = false; mat._order = order; return mat; }
  function addDecal(mesh) { mesh.renderOrder = mesh.material._order; world.add(mesh); return mesh; }

  /* lights */
  scene.add(new T.HemisphereLight(0xffffff, 0xb7c6ea, 1.55));
  const key = new T.DirectionalLight(0xffffff, 2.1);       // from the bowler's left, so the ball's glint lands clear of its wordmark
  key.position.set(-172, 143, 50); scene.add(key);
  const gloss = new T.DirectionalLight(0xfff4dc, 1.25);     // low, from down the lane: the long shine on the wood
  gloss.position.set(25, 62, -200); scene.add(gloss);

  /* lane surfaces */
  const laneMat = new T.MeshPhongMaterial({ map: tWood, specular: 0x9a9a9a, shininess: 85, transparent: true, opacity: 0.8, depthWrite: false });
  const approachMat = new T.MeshPhongMaterial({ map: tWood, color: 0xe2a268, specular: 0x8a8a8a, shininess: 70, transparent: true, opacity: 0.86, depthWrite: false });
  const woodSolid = new T.MeshPhongMaterial({ map: tWood, color: 0xe9e2d6, specular: 0x666666, shininess: 60 });
  const approachSolid = new T.MeshPhongMaterial({ map: tWood, color: 0xe2a268, specular: 0x555555, shininess: 50 });
  const lane = floor(-LW, LW, 0, PIT_Y, 0, laneMat, 1, PIT_Y / 83);
  lane.renderOrder = 1; world.add(lane);
  const appr = floor(-KICK, KICK, -96, 0, 0, approachMat, KICK / LW, 96 / 83);
  appr.renderOrder = 1; world.add(appr);
  world.add(floor(KICK, 420, -96, 0, 0, approachSolid, (420 - KICK) / (LW * 2), 96 / 83));
  world.add(floor(-420, -KICK, -96, 0, 0, approachSolid, (420 - KICK) / (LW * 2), 96 / 83));

  const gutterMat = new T.MeshPhongMaterial({ color: 0x2a3454, specular: 0x8899bb, shininess: 50, side: T.DoubleSide });
  const gutterGeo = new T.CylinderGeometry(GUT / 2, GUT / 2, 1, 10, 1, true, -Math.PI / 2, Math.PI);
  gutterGeo.rotateX(Math.PI / 2);
  const capMat = new T.MeshPhongMaterial({ color: 0x1f58d6, specular: 0x99aadd, shininess: 60 });
  const kickMat = new T.MeshPhongMaterial({ color: 0xeef2ff, specular: 0x888888, shininess: 50 });
  const capLen = HEAD_Y - 36;
  for (let k = -1; k <= 1; k++) {
    const cx = k * LANE_PITCH;
    if (k !== 0) world.add(floor(cx - LW, cx + LW, 0, PIT_Y, 0, woodSolid, 1, PIT_Y / 83));
    for (let s = -1; s <= 1; s += 2) {
      const gm = new T.Mesh(gutterGeo, gutterMat);
      gm.scale.set(1, 2.4 / (GUT / 2), PIT_Y);
      gm.position.set(cx + s * (LW + GUT / 2), 0, -PIT_Y / 2);
      world.add(gm);
    }
  }
  for (let d = -2; d <= 1; d++) {                           // the dividers between lanes, and the kickbacks at the deck
    const dx = d * LANE_PITCH + LANE_PITCH / 2;
    const cap = new T.Mesh(new T.BoxGeometry(12, 1.4, capLen), capMat);
    cap.position.set(dx, 0.7, -capLen / 2); world.add(cap);
    const kb = new T.Mesh(new T.BoxGeometry(12, 18 - PIT_Z, WALL_Y - capLen), kickMat);
    kb.position.set(dx, (18 + PIT_Z) / 2, -(capLen + WALL_Y) / 2); world.add(kb);
  }
  const carpet = new T.MeshLambertMaterial({ color: 0x1746b4 });
  world.add(floor(114, 420, 0, WALL_Y, 0, carpet));
  world.add(floor(-420, -114, 0, WALL_Y, 0, carpet));
  world.add(floor(-114, 114, PIT_Y, WALL_Y, PIT_Z, new T.MeshLambertMaterial({ color: 0x090c18 })));

  /* lane markings */
  const tri = [];
  function pushTri(ax, ay, bx, by, cx, cy) { tri.push(ax, 0.05, -ay, bx, 0.05, -by, cx, 0.05, -cy); }
  for (let k = -3; k <= 3; k++) {
    const ax = k * 5 * BOARD_W, ay = 180 + (3 - Math.abs(k)) * 8;
    pushTri(ax, ay + 15, ax - 1.9, ay, ax + 1.9, ay);         // the seven arrows
    for (let s = 0; s < 8; s++) {                             // approach dots
      const a0 = s / 8 * TAU, a1 = (s + 1) / 8 * TAU;
      pushTri(ax, -8, ax + Math.cos(a0) * 0.75, -8 + Math.sin(a0) * 0.75, ax + Math.cos(a1) * 0.75, -8 + Math.sin(a1) * 0.75);
    }
  }
  const markGeo = new T.BufferGeometry();
  markGeo.setAttribute("position", new T.Float32BufferAttribute(tri, 3));
  addDecal(new T.Mesh(markGeo, decal(new T.MeshBasicMaterial({ color: 0x7a3a12, opacity: 0.85, side: T.DoubleSide }), 2)));
  addDecal(floor(-KICK, KICK, 0, 1.6, 0.04, decal(new T.MeshBasicMaterial({ color: 0xe3231a }), 2)));
  addDecal(floor(-LW, LW, 700, 760, 0.03, decal(new T.MeshBasicMaterial({ map: tDeck }), 2)));
  // the script wordmark printed under the lacquer, stretched down the lane so it reads from the foul line
  addDecal(floor(-18.5, 18.5, 250, 250 + LANE_MARK, 0.03, decal(new T.MeshBasicMaterial({ map: tScript, opacity: 0.7 }), 2)));

  /* oil: a shiny stripe as long as this frame's pattern */
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
  const oil = addDecal(new T.Mesh(unit, decal(new T.MeshBasicMaterial({ color: 0xcdeaff, opacity: 0.17, blending: T.AdditiveBlending }), 3)));
  const oilEnd = addDecal(new T.Mesh(unit, decal(new T.MeshBasicMaterial({ color: 0x12c4ff, opacity: 0.75 }), 3)));
  const sheen = addDecal(new T.Mesh(unit, decal(new T.MeshBasicMaterial({ color: 0xffffff, opacity: 0.13, blending: T.AdditiveBlending }), 3)));
  oil.position.y = 0.06; oilEnd.position.y = 0.07; sheen.position.y = 0.08;

  /* back wall, masking units, ceiling */
  const wall = new T.Mesh(new T.PlaneGeometry(WALL_W, WALL_H), new T.MeshBasicMaterial({ map: tWall }));
  wall.position.set(0, WALL_H / 2, -WALL_Y); both(wall).material = dim(new T.MeshBasicMaterial({ map: tWallSoft }), 0.8);
  /* LED ribbon board: a dark housing across the whole wall with the dot matrix on its face */
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);             // one texel per LED, never smoothed
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas());         // one LED lens, tiled; its mipmaps fade the dots out cleanly at a distance
  tDot.wrapS = tDot.wrapT = T.RepeatWrapping; tDot.anisotropy = aniso;
  const csChunk = T.ShaderChunk && T.ShaderChunk.colorspace_fragment ? "colorspace_fragment" : "encodings_fragment";
  function ledMat(level) {
    return new T.ShaderMaterial({
      uniforms: { tLed: { value: tLed }, tDot: { value: tDot }, grid: { value: new T.Vector2(LED_COLS, LED_ROWS) }, level: { value: level } },
      vertexShader: "varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
      fragmentShader: [
        "uniform sampler2D tLed;", "uniform sampler2D tDot;", "uniform vec2 grid;", "uniform float level;", "varying vec2 vUv;",
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
        "  gl_FragColor = vec4(col * level, 1.0);",
        "  #include <" + csChunk + ">",
        "}"
      ].join("\n")
    });
  }
  const ledHouse = new T.Mesh(new T.BoxGeometry(WALL_W + 4, LED_H + 9, 1), new T.MeshBasicMaterial({ color: 0x05070d }));
  ledHouse.position.set(0, LED_Z + 3.1, -(WALL_Y - 0.5)); world.add(ledHouse);   // a thin lip below, a deeper hood above
  const ledFace = new T.Mesh(new T.PlaneGeometry(WALL_W, LED_H), ledMat(1));
  ledFace.position.set(0, LED_Z, -(WALL_Y - 1.3));
  both(ledFace).material = ledMat(0.85);                    // and its moving reflection in the lane
  const maskSide = new T.MeshPhongMaterial({ color: 0x1b4fc0, specular: 0x555555, shininess: 30 });
  const maskFront = new T.MeshBasicMaterial({ map: tMask });
  const maskGeo = new T.BoxGeometry(70, 22, 3);
  const maskSideDim = dim(maskSide, 0.8), maskFrontDim = dim(new T.MeshBasicMaterial({ map: tMaskSoft }), 0.8);
  for (let k = -1; k <= 1; k++) {
    const mu = new T.Mesh(maskGeo, [maskSide, maskSide, maskSide, maskSide, maskFront, maskSide]);
    mu.position.set(k * LANE_PITCH, 29, -(PIT_Y + 3.5));
    both(mu).material = [maskSideDim, maskSideDim, maskSideDim, maskSideDim, maskFrontDim, maskSideDim];
  }
  const ceilGeo = scaleUV(new T.PlaneGeometry(LANE_PITCH * 11, 1440), 11, 20);
  ceilGeo.rotateX(Math.PI / 2);
  const ceil = new T.Mesh(ceilGeo, new T.MeshBasicMaterial({ map: tCeil }));
  ceil.position.set(0, WALL_H, -280); both(ceil).material = dim(ceil.material, 0.7);

  /* pins */
  const prof = [[1.0, 0], [1.41, 0.75], [1.96, 2.25], [2.26, 3.375], [2.383, 4.5], [2.28, 5.875], [1.9, 7.25], [1.36, 8.625],
                [1.06, 9.4], [0.9, 10.1], [0.94, 10.9], [1.06, 11.75], [1.2, 12.6], [1.274, 13.5], [1.16, 14.2], [0.82, 14.72]];
  const curve = new T.SplineCurve(prof.map(function (p) { return new T.Vector2(p[0], p[1]); }));
  const pts = [new T.Vector2(0, 0)].concat(curve.getPoints(30)).concat([new T.Vector2(0.4, 14.94), new T.Vector2(0, PIN_TALL)]);
  function pinUV(geo) {                                      // v follows height, so the painted bands sit where they belong
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, clamp(pos.getY(i) / PIN_TALL, 0, 1));
    return geo;
  }
  const pinGeo = pinUV(new T.LatheGeometry(pts, 18));
  const pinMats = PIN_COLORS.map(function (col) {
    return new T.MeshPhongMaterial({ map: tex(pinCanvas(col), true), specular: 0xb0b0b0, shininess: 90, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.16 });
  });
  const shadowMat = decal(new T.MeshBasicMaterial({ map: tShadow, opacity: 0.6 }), 4);
  function pinSet() {
    const set = [];
    for (let i = 0; i < 10; i++) {
      const mesh = new T.Mesh(pinGeo, pinMats[i % 5]);
      const twin = both(mesh);
      const shadow = addDecal(new T.Mesh(unit, shadowMat));
      mesh.visible = twin.visible = shadow.visible = false;
      set.push({ mesh: mesh, twin: twin, shadow: shadow });
    }
    return set;
  }
  const pins = pinSet(), dead = pinSet();
  // full racks standing on the two neighboring lanes (scenery, one draw call)
  const farGeo = pinUV(new T.LatheGeometry(pts.filter(function (_, i) { return i % 2 === 0 || i === pts.length - 1; }), 10));
  const farPins = new T.InstancedMesh(farGeo, pinMats[1], 20);
  const farM = new T.Matrix4();
  for (let k = 0; k < 20; k++) {
    const sp = SPOTS[k % 10];
    farM.makeTranslation((k < 10 ? -1 : 1) * LANE_PITCH + sp[0], 0, -(HEAD_Y + sp[1]));
    farPins.setMatrixAt(k, farM);
  }
  farPins.instanceMatrix.needsUpdate = true;
  world.add(farPins);

  /* ball */
  const ballMat = new T.MeshPhongMaterial({ map: tBall, specular: 0xdddddd, shininess: 240, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.3 });
  const ball = new T.Mesh(new T.SphereGeometry(BALL_R, 30, 20), ballMat);
  const ballTwin = both(ball);
  const ballShadow = addDecal(new T.Mesh(unit, shadowMat));

  /* bumpers + sweep rake */
  const railGeo = new T.CylinderGeometry(1.3, 1.3, 1, 10); railGeo.rotateX(Math.PI / 2);
  const railMat = new T.MeshPhongMaterial({ color: 0xffcf1a, specular: 0xffffff, shininess: 90 });
  const rails = [-1, 1].map(function (s) {
    const m = new T.Mesh(railGeo, railMat);
    m.scale.z = DECK_END - 6; m.position.set(s * (LW + 3.55), 3.4, -(DECK_END - 6) / 2 - 1);
    world.add(m); return m;
  });
  const rake = new T.Group();
  const rakeBar = new T.Mesh(new T.BoxGeometry(KICK * 2 - 1, 9, 1.6), new T.MeshPhongMaterial({ color: 0x26356e, specular: 0x8899cc, shininess: 60 }));
  rakeBar.position.y = 5;
  const rakeTrim = new T.Mesh(new T.BoxGeometry(KICK * 2 - 1, 1.6, 1.9), new T.MeshPhongMaterial({ color: 0xff9214, specular: 0xffffff, shininess: 60 }));
  rakeTrim.position.y = 8.8;
  rake.add(rakeBar); rake.add(rakeTrim); rake.visible = false; world.add(rake);

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, mirror: mirror, laneMat: laneMat, approachMat: approachMat,
    pins: pins, dead: dead, ball: ball, ballTwin: ballTwin, ballShadow: ballShadow, oil: oil, oilEnd: oilEnd, sheen: sheen,
    rails: rails, railZ: 3.4, rake: rake,
    camPos: new T.Vector3(0, CAM_H, -CAM0), camTgt: new T.Vector3(0, 0, -(CAM0 + CAM_AHEAD)), goalPos: new T.Vector3(), goalTgt: new T.Vector3(),
    shakeT: 0, shakeDur: 0, shakeMag: 0,
    ballQ: new T.Quaternion(), restQ: new T.Quaternion().setFromEuler(new T.Euler(-0.5, 0, 0)), lastBall: null, bpx: 0, bpy: 0,
    qa: new T.Quaternion(), qb: new T.Quaternion(), axis: new T.Vector3(), up: new T.Vector3(0, 1, 0), fwd: new T.Vector3(0, 0, -1), v: new T.Vector3(),
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, mirrorOn: true, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
const QUALITY = [{ pr: 2, mirror: true }, { pr: 1.5, mirror: true }, { pr: 1.15, mirror: true }, { pr: 1, mirror: false }];

function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  const on = QUALITY[R.quality].mirror;
  if (on !== R.mirrorOn) {
    R.mirrorOn = on;
    R.mirror.visible = on;
    R.laneMat.transparent = R.approachMat.transparent = on;
    R.laneMat.opacity = on ? 0.8 : 1; R.approachMat.opacity = on ? 0.86 : 1;
    R.laneMat.depthWrite = R.approachMat.depthWrite = !on;
    R.laneMat.needsUpdate = R.approachMat.needsUpdate = true;
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
      while (q < QUALITY.length - 1 && Math.min(window.devicePixelRatio || 1, QUALITY[q].pr) === before && QUALITY[q].mirror === R.mirrorOn) q++;
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

/* ---------------- Game state -> meshes ---------------- */
// How far the base center of a pin tipped by angle a sits above the deck, so its lowest point just touches.
const PIN_RIM = [[1.0, 0], [1.41, 0.75], [1.96, 2.25], [2.383, 4.5], [1.9, 7.25], [1.274, 13.5], [0.82, 14.72], [0, PIN_TALL]];
function pinLift(a) {
  const s = Math.abs(Math.sin(a)), c = Math.cos(a);
  let m = 0;
  for (let i = 0; i < PIN_RIM.length; i++) m = Math.max(m, PIN_RIM[i][0] * s - PIN_RIM[i][1] * c);
  return m;
}

function placePin(o, p) {
  const up = p.st === "up";
  const a = up ? Math.sin(p.wobT * 30) * p.wob : p.tilt;
  const hd = up ? p.wobDir : p.head;
  const hx = Math.cos(hd), hy = Math.sin(hd), sn = Math.sin(a), lean = Math.abs(sn);
  // A lying pin rests on its belly and is centered on its physics spot (its base swings out behind it).
  let z = p.drop * 30 + p.z + pinLift(a);
  const off = up ? 0 : 5.8 * sn;
  if (Math.abs(p.x) > LW + 0.5 && p.y < PIT_Y) z -= Math.min(2.2, (Math.abs(p.x) - LW - 0.5) * 0.8);   // slid into a gutter
  o.mesh.position.set(p.x - hx * off, z, -(p.y - hy * off));
  R.axis.set(-hy, 0, -hx);
  R.qa.setFromAxisAngle(R.axis, a);
  R.qb.setFromAxisAngle(R.up, p.yaw);
  o.mesh.quaternion.multiplyQuaternions(R.qa, R.qb);
  const vis = z > -28;
  o.mesh.visible = vis;
  o.twin.visible = vis && R.mirrorOn && p.st !== "gone" && p.z >= 0 && Math.abs(p.x) < LW + 0.5 && p.y < PIT_Y;
  if (o.twin.visible) { o.twin.position.copy(o.mesh.position); o.twin.quaternion.copy(o.mesh.quaternion); }
  const sh = o.shadow;
  sh.visible = vis && p.st !== "gone" && p.y < PIT_Y - 1 && Math.abs(p.x) < LW + 0.5 && z < 30;
  if (sh.visible) {
    const k = clamp(1 - (p.drop * 30 + p.z) / 34, 0.3, 1);
    sh.position.set(p.x, 0.09, -p.y);
    sh.rotation.y = hd;
    sh.scale.set((6.4 + 13 * lean) * k, 1, (6.4 + 1.5 * lean) * k);
  }
}

function syncScene(state, fdt) {
  let i;
  ledTick(fdt);
  for (i = 0; i < 10; i++) {
    R.pins[i].mesh.visible = R.pins[i].twin.visible = R.pins[i].shadow.visible = false;
    R.dead[i].mesh.visible = R.dead[i].twin.visible = R.dead[i].shadow.visible = false;
  }
  for (i = 0; i < S.pins.length; i++) placePin(R.pins[S.pins[i].i], S.pins[i]);
  for (i = 0; i < S.dead.length; i++) placePin(R.dead[S.dead[i].i], S.dead[i]);

  /* ball */
  const b = S.b, ball = R.ball;
  if (b) {
    if (R.lastBall !== b) { R.lastBall = b; R.bpx = b.x; R.bpy = b.y; }
    const dx = b.x - R.bpx, dy = b.y - R.bpy, d = Math.hypot(dx, dy);
    R.bpx = b.x; R.bpy = b.y;
    if (d > 1e-4) {                                          // roll without slipping
      R.axis.set(-dy / d, 0, -dx / d);
      R.qa.setFromAxisAngle(R.axis, d / BALL_R);
      R.ballQ.premultiply(R.qa);
    }
    if (!b.gutter && b.y < HEAD_Y && d > 1e-4) {            // the side rotation that makes it hook
      R.qa.setFromAxisAngle(R.fwd, b.spin * 11 * fdt);
      R.ballQ.premultiply(R.qa);
    }
    ball.visible = b.y < WALL_Y - 8;
    ball.position.set(b.x, b.z, -b.y);
    R.ballTwin.visible = ball.visible && R.mirrorOn && !b.gutter && b.y < PIT_Y;
    R.ballShadow.visible = ball.visible && b.y < PIT_Y;
    R.ballShadow.position.set(b.x, b.gutter ? -2.2 : 0.09, -b.y);
  } else {
    R.lastBall = null;
    const show = S.phase === "aim" || S.phase === "sweep";
    if (state === "title" && !Shell.reduced) { R.qa.setFromAxisAngle(R.up, idleT * 0.7); R.ballQ.multiplyQuaternions(R.restQ, R.qa); }
    else R.ballQ.slerp(R.restQ, Math.min(1, fdt * 12));
    ball.visible = show;
    ball.position.set(S.pos, BALL_R, -START_Y);
    R.ballTwin.visible = show && R.mirrorOn;
    R.ballShadow.visible = show;
    R.ballShadow.position.set(S.pos, 0.09, -START_Y);
  }
  ball.quaternion.copy(R.ballQ);
  R.ballShadow.scale.set(11.5, 1, 11.5);
  if (R.ballTwin.visible) { R.ballTwin.position.copy(ball.position); R.ballTwin.quaternion.copy(R.ballQ); }

  /* oil */
  const len = oilLen(), ow = LW * 2 - 6 * BOARD_W, t = (state === "title" || state === "over") ? idleT : S.t;
  R.oil.scale.set(ow, 1, len); R.oil.position.z = -len / 2;
  R.oilEnd.scale.set(ow, 1, 4); R.oilEnd.position.z = -(len - 2);
  const sh0 = (t * 260) % (len + 120) - 60, y1 = Math.max(0, sh0), y2 = Math.min(len, sh0 + 50);
  R.sheen.visible = y2 > y1 + 1;
  if (R.sheen.visible) { R.sheen.scale.set(LW * 2 - 10 * BOARD_W, 1, y2 - y1); R.sheen.position.z = -(y1 + y2) / 2; }

  /* bumpers drop into the gutters after frame 3 */
  const goalZ = bumpersUp() ? 3.4 : -3.6;
  R.railZ += (goalZ - R.railZ) * Math.min(1, fdt * 5);
  for (i = 0; i < 2; i++) { R.rails[i].position.y = R.railZ; R.rails[i].visible = R.railZ > -3.2; }

  /* sweep rake */
  R.rake.visible = state === "playing" && S.phase === "sweep";
  if (R.rake.visible) R.rake.position.z = -rakeY();

  /* camera: behind the ball at the line, follow it down the lane, then cut in over the pin deck */
  const gp = R.goalPos, gt = R.goalTgt;
  let rate = 9;
  const idle = state === "title" || state === "over";
  if (!idle && b && (S.phase === "roll" || S.phase === "settle" || S.phase === "result")) {
    if (S.phase === "roll" && b.y < 300) {
      const cy = clamp(b.y - 150, CAM0, CAM0 + 320);
      gp.set(b.x * 0.3, CAM_H, -cy); gt.set(b.x * 0.45, 0, -(cy + CAM_AHEAD));
      rate = 7;
    } else {
      gp.set(0, DECK_CAM.z, -DECK_CAM.y); gt.set(0, DECK_CAM.tz, -DECK_CAM.ty);
      rate = 4.2;
    }
  } else {
    const sway = idle && !Shell.reduced ? Math.sin(idleT * 0.45) * 5 : 0;
    gp.set(sway, CAM_H, -CAM0); gt.set(sway * 0.3, 0, -(CAM0 + CAM_AHEAD));
  }
  const k = 1 - Math.exp(-rate * fdt);
  R.camPos.lerp(gp, k); R.camTgt.lerp(gt, k);
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (Math.random() * 2 - 1) * m; sy = (Math.random() * 2 - 1) * m;
  }
  R.camera.position.set(R.camPos.x + sx, R.camPos.y + sy, R.camPos.z);
  R.camera.lookAt(R.camTgt.x + sx, R.camTgt.y + sy, R.camTgt.z);
  R.camera.updateMatrixWorld();
  S.camY = -R.camPos.z;
}

// World point (inches) -> HUD pixels, for the aim guide.
function toScreen(x, y, z) {
  R.v.set(x, z, -y).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1 };
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

function drawAim(c) {
  const drag = S.drag, f = drag && drag.mode === "flick" ? flick(drag) : null;
  const spin = f ? f.spin : S.spin, pw = f ? f.p : (S.charging ? S.power : -1);
  // straight guide through the oil (the ball barely bites there)
  const oil = oilLen();
  for (let y = 20; y < oil; y += 24) {
    const p = toScreen(S.pos, y, 0.3);
    if (!p.ok) continue;
    const r = clamp(2.6 - y / 260, 1.1, 2.6);
    c.fillStyle = "rgba(8,32,95,.55)"; c.beginPath(); c.arc(p.x, p.y, r + 0.9, 0, TAU); c.fill();
    c.fillStyle = "#ffffff"; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.fill();
  }
  const e = toScreen(S.pos, oil, 0.3);
  if (e.ok) {
    c.fillStyle = "#08205f"; c.beginPath(); c.arc(e.x, e.y, 3.6, 0, TAU); c.fill();
    c.fillStyle = "#3fe0ff"; c.beginPath(); c.arc(e.x, e.y, 2.5, 0, TAU); c.fill();
  }
  // hook meter
  const cx = 300, cy = 470;
  rrect(c, cx - 46, cy - 6, 92, 12, 6); c.fillStyle = "rgba(8,32,95,.82)"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = "#ffffff"; c.stroke();
  rrect(c, cx - 42, cy - 2, 84, 4, 2); c.fillStyle = "#3d8cff"; c.fill();
  c.fillStyle = "#ffffff"; c.fillRect(cx - 1, cy - 5, 2, 10);
  const hx = cx + spin * 40;
  c.beginPath(); c.arc(hx, cy, 7, 0, TAU);
  c.fillStyle = Math.abs(spin) > 0.05 ? "#ff9214" : "#ffffff"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = "#08205f"; c.stroke();
  txt(c, Math.abs(spin) < 0.05 ? "HOOK: NONE" : "HOOK " + (spin < 0 ? "<" : ">") + " " + Math.round(Math.abs(spin) * 100) + "%",
      cx, cy + 11, 9, "#ffffff", "center", "#08205f");
  // power meter while charging or flicking
  if (pw >= 0) {
    const x = 14, top = 300, hgt = 150, pc = clamp(pw, 0, 1);
    rrect(c, x - 3, top - 3, 20, hgt + 6, 6); c.fillStyle = "rgba(8,32,95,.82)"; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = "#ffffff"; c.stroke();
    c.save(); rrect(c, x, top, 14, hgt, 4); c.clip();
    c.fillStyle = "#12296e"; c.fillRect(x, top, 14, hgt);
    c.fillStyle = pc > 0.8 ? "#ff3b2e" : pc > 0.45 ? "#ffd21f" : "#3fe0ff";
    c.fillRect(x, top + hgt * (1 - pc), 14, hgt * pc);
    c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(x + 2, top, 3, hgt);
    c.restore();
    txt(c, "PWR", x + 7, top + hgt + 7, 9, "#ffffff", "center", "#08205f");
  }
}

function drawHUD(c) {
  const bg = c.createLinearGradient(0, 0, 0, 74);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, 0, W, 74);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff9214"; c.fillRect(0, 74, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, 76, W, 1);
  const sc = scores(S.frames);
  let x = 4, i;
  for (i = 0; i < 10; i++) {
    const w = i === 9 ? 51 : 32, cur = i === S.frame && !S.over;
    rrect(c, x, 4, w - 1, 38, 3);
    c.fillStyle = cur ? "#fff3a8" : "#ffffff"; c.fill();
    c.lineWidth = cur ? 2 : 1; c.strokeStyle = cur ? "#ff9214" : "#08205f"; c.stroke();
    txt(c, String(i + 1), x + 3, 6, 7, "#6d86c4");
    const m = S.frames[i] ? marks(S.frames[i], i) : [];
    for (let k = 0; k < m.length; k++) {
      const mx = i === 9 ? x + 11 + k * 15 : x + 13 + k * 11;
      txt(c, m[k], mx, 13, 10, m[k] === "X" ? "#e3231a" : m[k] === "/" ? "#0a66d8" : "#0b1f5c", "center");
    }
    if (sc[i] != null) txt(c, String(sc[i]), x + w / 2, 28, 10, "#0b1f5c", "center");
    x += w + 1;
  }
  txt(c, "FRAME " + Math.min(10, S.frame + 1) + "  BALL " + (S.ball + 1), 8, 47, 10, "#ffffff", "left", "#08205f");
  txt(c, "OIL " + Math.round(oilLen() / 12) + " FT", 8, 60, 10, "#a8ecff", "left", "#08205f");
  txt(c, bumpersUp() ? "BUMPERS UP" : "GUTTERS LIVE", 86, 60, 10, bumpersUp() ? "#ffe45c" : "#ffc1e0", "left", "#08205f");
  // pin diagram (standing pins solid, down pins hollow)
  for (i = 0; i < 10; i++) {
    const sp = SPOTS[i], px = 292 + sp[0] * 1.45, py = 68 - sp[1] * 0.72;
    let p = null;
    for (let j = 0; j < S.pins.length; j++) if (S.pins[j].i === i) p = S.pins[j];
    c.beginPath(); c.arc(px, py, 2.7, 0, TAU);
    if (p && p.st === "up") { c.fillStyle = "#ffffff"; c.fill(); }
    else { c.lineWidth = 1; c.strokeStyle = "rgba(255,255,255,.5)"; c.stroke(); }
  }
  txt(c, String(total()), 353, 51, 13, "#ffe45c", "right", "#08205f");
}

function draw(c, state) {
  if (!R || !R.hud) return;
  const now = performance.now();
  let ms = now - R.lastT;
  R.lastT = now;
  if (!(ms > 0)) ms = 0;
  const sized = layout();
  if (state === "paused" && !R.dirty) return;              // nothing moves while paused: leave the last frame up
  if (state === "playing") watchFrameRate(ms);
  if (sized) {
    syncScene(state, Math.min(ms, 50) / 1000);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    c.save(); c.translate(q.x, q.y); c.rotate(q.rot);
    c.globalAlpha = clamp(q.life * 2, 0, 1);
    c.fillStyle = q.c; c.fillRect(-2.5, -1.5, 5, 3);
    c.restore();
  }
  drawHUD(c);
  if (state === "playing" && S.phase === "aim") drawAim(c);
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
      else img.style.display = "none";
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
  if (crt) crt.style.display = "none";                       // glossy lanes, no scanlines
  R.lastT = performance.now();
  layout();
}

function startGame() {
  Shell.init({
    slug: "tape-pin-lanes",
    title: "TAPE PIN LANES",
    accent: "#a77bff",
    width: W, height: H,
    format: function (n) { return String(n); },
    howTo: "Ten frames in real 3D, and every pin wears a VHS tape label. Drag sideways to line up, then flick up to roll. Flick a little left or right to hook it.",
    keys: "Keys: left and right move, up and down set the hook, hold Space for power, release to roll. P pause, M mute, R restart.",
    tip: "Watch the shiny oil. The ball only hooks once it's past it.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; animateDead(dt); },
    onPause: function () { keys = {}; S.drag = null; S.charging = false; }
  });
  attach();
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
window.__tapePins = { S: function () { return S; }, rack: fullRack, throwBall: throwBall, scores: scores, step: step, resolve: resolveBall,
                      gfx: function () { return R; }, led: function () { return LED; } };

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
      try { R.renderer.compile(R.scene, R.camera); } catch (e) { /* warm-up only */ }
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
        ? "Tape Pin Lanes could not load its 3D engine (" + THREE_URL + ")."
        : "Tape Pin Lanes needs WebGL for its 3D lanes, and this browser has it switched off or does not support it.");
    });
})();
