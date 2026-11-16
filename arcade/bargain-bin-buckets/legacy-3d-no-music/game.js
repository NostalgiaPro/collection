/* BARGAIN BIN BUCKETS (3D): 60 seconds, a rack of balls, and a hoop that keeps backing up.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of input, scaling and the title / pause / game over flow, and carries the HUD.

   The rules, the clock, the scoring, the controls, the shot assist and the ball physics are the
   2D game's, unchanged: the ball was already being flown in three dimensions, it was only being
   drawn flat. Units are meters and seconds. x runs across the cage (0 = center), y is up from
   the floor, z runs away from the shooter. In three.js space that is (x, y, -z). */

const W = 360, H = 540, TAU = Math.PI * 2;
const GRAV = 11, BALL_R = 0.12, RIM_R = 0.23, RIM_Y = 3.05, TUBE = 0.02;
const HAND = { x: 0, y: 0.95, z: 0.3 };
const LEVELS = [3.2, 4.4, 5.5];
const LAUNCH = 64 * Math.PI / 180;
const AIM_DEEP = 0.12; // aim a touch past the rim center so the front rim stays clear
const ROUND_TIME = 60, BONUS_TIME = 15, BONUS_NEED = 20, DRIFT_AT = 20;
const MAX_DRAG = 240;

/* Where the physics keeps its walls (the numbers inside stepBall), named so the scenery can be built on them. */
const CAGE_X = 1.8;                                       // side nets
const BOARD_Z = RIM_R + 0.15, BOARD_HW = 0.75, BOARD_Y0 = 2.8, BOARD_Y1 = 4.0;   // backboard face, behind the rim center
const CATCH_Z = 1.3 + BALL_R;                             // the catch net rides this far behind the rim center
const CAGE_LEN = 7.3, CAGE_H = 4.3;                       // the cage itself: floor length and net height
const GANTRY_X = 2.14, GANTRY_H = 4.4;                    // the rolling frame that carries the hoop
const WALL_Z = 8.3, WALL_W = 11, WALL_H = 8;              // back wall of the game room

/* Camera (meters, game axes). One fixed seat behind the rack; it only leans and creeps. */
const CAM_FOV = 43;
const CAM = { y: 3.45, z: -5.0, ty: 2.52, tz: 4.2 };
const GHOST_T = 0.34;                                    // seconds a finished ball takes to roll out of the picture

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash and score card only
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every decal inside the cage
const THREE_URL = "../shared/three.module.min.js";
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';
const MAX_BALLS = 16, MAX_GHOSTS = 6;                     // balls in play at once, and balls rolling out of the picture

let S = {}, keys = {}, titleT = 0, idleT = 0, parts = [], floats = [], quiet = false;
let THREE = null, R = null;                               // R holds everything the renderer owns
// V is presentation only (rim rattle, net swish, the rack feeding the next ball). It never feeds back into the rules.
let V = { rim: 0, rimT: 9, board: 0, boardT: 9, net: 0, netT: 9, netX: 0, feed: 0, push: 0, ghosts: [] };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function sfx(name) { if (!quiet) Shell.sfx(name); }

function reset() {
  S = { t: 0, time: ROUND_TIME, round: "main", score: 0, makes: 0, shots: 0, swishes: 0,
        streak: 0, bestStreak: 0, fire: false, level: 0, hoopZ: LEVELS[0], hoopX: 0, driftT: 0,
        balls: [], ready: 0.2, drag: null, aim: 0, power: 0, charging: false, chargeT: 0, kb: false,
        ending: false, endT: 0, netT: 0, missCount: 0, lastQuip: -10, bonusDone: false };
  parts.length = 0; floats.length = 0;
  V.rim = V.board = V.net = 0; V.push = 0; V.ghosts.length = 0;
  ledClear();
}

/* ---------------- Shooting (the 2D game's, untouched) ---------------- */
// Launch speed that carries the ball a horizontal distance R up a height h at the fixed launch angle.
function speedFor(Rg, h) {
  const c = Math.cos(LAUNCH), tn = Math.tan(LAUNCH), den = 2 * c * c * (Rg * tn - h);
  if (den <= 0.01) return 14;
  return Math.sqrt(GRAV * Rg * Rg / den);
}
function hoopAt(tAhead) {
  let hx = S.hoopX;
  if (driftOn()) hx = driftX(S.driftT + tAhead);
  return { x: hx, z: S.hoopZ };
}
function driftOn() { return S.round === "bonus" || (S.round === "main" && S.time <= DRIFT_AT); }
function driftX(t) { return 0.55 * Math.sin(t * 1.5); }

function idealP() {
  const hp = hoopAt(0.9), Ri = Math.hypot(hp.x - HAND.x, hp.z - HAND.z) + AIM_DEEP;
  return (Ri - 0.8) / 7.0;
}

function shoot(p, phi) {
  if (S.ready > 0 || S.ending) return;
  let Rt = 0.8 + clamp(p, 0, 1.15) * 7.0;
  // rough flight time to look ahead at a drifting hoop
  const v0 = speedFor(Rt, RIM_Y - HAND.y), T = Rt / (v0 * Math.cos(LAUNCH));
  const hp = hoopAt(T);
  const Ri = Math.hypot(hp.x - HAND.x, hp.z - HAND.z) + AIM_DEEP, phiI = Math.atan2(hp.x - HAND.x, hp.z - HAND.z);
  const eR = Rt - Ri, eL = (phi - phiI) * Ri;
  // Friendly arcade assist: close shots get pulled most of the way in, wild ones do not.
  if (Math.abs(eR) < 0.75 && Math.abs(eL) < 0.55) {
    Rt = Ri + eR * 0.25;
    phi = phiI + (eL * 0.3) / Ri;
  }
  const v = speedFor(Rt, RIM_Y - HAND.y);
  const vh = v * Math.cos(LAUNCH);
  S.balls.push({ x: HAND.x, y: HAND.y, z: HAND.z, vx: Math.sin(phi) * vh, vy: v * Math.sin(LAUNCH), vz: Math.cos(phi) * vh,
                 touched: false, scored: false, missed: false, t: 0, spin: 0, bounces: 0, fire: S.fire });
  S.shots++;
  S.ready = 0.32;
  V.feed = 1;                                              // the rack rolls the next ball up (looks only)
  Shell.sfx("whoosh");
}

/* ---------------- Physics (the 2D game's, untouched: only the V.* lines are new, and they are looks only) ---------------- */
function stepBall(b, dt) {
  const hx = S.hoopX, hz = S.hoopZ, bz = hz + RIM_R + 0.15;
  const py = b.y;
  b.vy -= GRAV * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  b.spin += dt * 8;

  // rim: a ring of points
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * TAU;
    const px = hx + Math.cos(a) * RIM_R, pz = hz + Math.sin(a) * RIM_R;
    const dx = b.x - px, dy = b.y - RIM_Y, dz = b.z - pz, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const rr = BALL_R + TUBE;
    if (d < rr && d > 1e-5) {
      const nx = dx / d, ny = dy / d, nz = dz / d, pen = rr - d;
      b.x += nx * pen; b.y += ny * pen; b.z += nz * pen;
      const vn = b.vx * nx + b.vy * ny + b.vz * nz;
      if (vn < 0) {
        b.vx -= 1.55 * vn * nx; b.vy -= 1.55 * vn * ny; b.vz -= 1.55 * vn * nz;
        if (-vn > 0.6) { sfx("rim"); V.rim = Math.min(1, 0.25 - vn * 0.14); V.rimT = 0; }
        b.touched = true;
      }
    }
  }
  // backboard
  if (b.vz > 0 && b.z + BALL_R > bz && b.z < bz + 0.15 && Math.abs(b.x - hx) < 0.75 && b.y > 2.8 && b.y < 4.0) {
    V.board = Math.min(1, 0.2 + b.vz * 0.13); V.boardT = 0;
    b.z = bz - BALL_R; b.vz = -b.vz * 0.55; b.vx *= 0.9;
    b.touched = true;
    sfx("hit");
  }
  // cage walls and back net
  if (Math.abs(b.x) > 1.8 - BALL_R) { b.x = clamp(b.x, -1.8 + BALL_R, 1.8 - BALL_R); b.vx = -b.vx * 0.5; }
  if (b.z > hz + 1.3) { b.z = hz + 1.3; b.vz = -Math.abs(b.vz) * 0.3; }
  if (b.z < 0.05) { b.z = 0.05; b.vz = Math.abs(b.vz) * 0.4; }

  // through the hoop
  if (!b.scored && !b.missed && py > RIM_Y && b.y <= RIM_Y && b.vy < 0 && Math.hypot(b.x - hx, b.z - hz) < RIM_R - BALL_R * 0.35) {
    b.scored = true;
    made(b);
  }
  // floor
  if (b.y < BALL_R) {
    b.y = BALL_R;
    if (b.vy < 0) { b.vy = -b.vy * 0.5; b.vx *= 0.8; b.vz *= 0.8; b.bounces++; }
    if (!b.scored && !b.missed) { b.missed = true; missed(); }
  }
}

function made(b) {
  S.makes++;
  S.streak++;
  S.bestStreak = Math.max(S.bestStreak, S.streak);
  if (window.Trophies && S.streak >= 10) Trophies.unlock("bbb-streak10");
  let pts = S.level === 0 ? 2 : 3;
  const swish = !b.touched;
  if (swish) { pts += 1; S.swishes++; if (window.Trophies) Trophies.unlock("bbb-swish"); }
  if (S.fire) pts *= 2;
  S.score += pts;
  S.netT = 1;
  V.net = swish ? 1 : 0.7; V.netT = 0; V.netX = clamp(b.vx * 0.5, -1, 1);   // the net snaps (looks only)
  Shell.sfx(swish ? "swish" : "score");
  if (swish) Shell.sfx("score");
  const label = swish ? "SWISH! +" + pts : "+" + pts;
  const board = [];                                         // what the LED ribbon flashes for this bucket
  if (S.streak === 3 && !S.fire) {
    S.fire = true;
    Shell.flash("ON FIRE!", "Double points until you miss.", "#ff4b3e", 1300);
    if (window.Trophies) Trophies.unlock("bbb-fire");
    Shell.sfx("boost");
    Shell.shake(3, 0.3); camShake(0.05, 0.3);
    board.push(ledMsg("fire", "ON FIRE", 2.3, { prio: 4 }));
  } else {
    floatText(label, swish ? "#b6ff4a" : "#ffffff");
    if (swish) board.push(ledMsg("swish", "SWISH!", 1.5, { prio: 2 }));
  }
  if (window.NPRewards && (S.streak === 2 || (S.streak >= 5 && S.streak % 5 === 0))) NPRewards.streak(S.streak, S.streak === 2 ? "" : S.streak + " STRAIGHT!");
  const lvl = Math.min(LEVELS.length - 1, Math.floor(S.makes / 10));
  if (lvl > S.level) {
    S.level = lvl;
    Shell.flash("HOOP BACKS UP", lvl === 1 ? "Every bucket is worth 3 now." : "Farthest it goes. Make it count.", "#3ff0ff", 1300);
    Shell.sfx("boost");
    board.push(ledMsg("level", lvl === 1 ? "HOOP BACKS UP" : "MAX DISTANCE", 2.2, { prio: 3 }));
  }
  board.push(ledScore(board.length ? 1.9 : 2.4));
  ledPlay(board);
  burst(S.hoopX, RIM_Y - 0.1, S.hoopZ, S.fire ? 18 : 8, S.fire ? "#ff4b3e" : "#ffd23f");
}
function missed() {
  if (S.fire) { Shell.flash("FIRE'S OUT", "", "#8e93a2", 700); ledPlay([ledMsg("out", "FIRE'S OUT", 1.5, { prio: 4 })]); }
  S.streak = 0;
  S.fire = false;
  S.missCount++;
  if (S.t - S.lastQuip > 5 && S.missCount % 3 === 0) {
    S.lastQuip = S.t;
    floatText("Brick. Still 25 cents.", "#dfe6ff", true);
    ledPlay([ledMsg("brick", "BRICK", 1.7, { prio: 1 })]);
  }
  Shell.sfx("miss");
}

/* ---------------- Particles + float text (drawn on the HUD layer, placed through the 3D camera) ---------------- */
function burst(x, y, z, n, col) {
  const p = toScreen(x, y, z);
  if (Shell.reduced) n = Math.ceil(n / 2);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 30 + Math.random() * 90;
    parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.7, g: 120, c: i % 2 ? col : "#ffffff",
                 w: 1.6 + Math.random() * 1.4, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14, kind: 0 });
  }
}
function floatText(txt, col, small) {
  floats.push({ txt: txt, col: col, small: !!small, t: 0 });
}
function updateFx(dt) {
  let i;
  for (i = parts.length - 1; i >= 0; i--) {
    const q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.g * dt; q.rot += q.vr * dt;
    if (q.life <= 0) parts.splice(i, 1);
  }
  for (i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; if (floats[i].t > 1.1) floats.splice(i, 1); }
}

/* ---------------- Update (the 2D game's) ---------------- */
function update(dt) {
  S.t += dt;
  if (!S.ending) S.time -= dt;
  if (S.netT > 0) S.netT = Math.max(0, S.netT - dt * 2.5);
  if (S.ready > 0) S.ready -= dt;

  // hoop slides back toward its level and drifts late in the game
  const tz = LEVELS[S.level];
  S.hoopZ += (tz - S.hoopZ) * Math.min(1, dt * 3);
  if (driftOn()) {
    S.driftT += dt;
    S.hoopX = driftX(S.driftT);
  } else {
    S.hoopX += (0 - S.hoopX) * Math.min(1, dt * 4);
  }

  if (S.charging) {
    S.chargeT += dt;
    const ph = (S.chargeT / 1.1) % 2;
    S.power = ph < 1 ? ph : 2 - ph;
  }
  const turn = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
  if (turn) { S.aim = clamp(S.aim + turn * 0.6 * dt, -0.5, 0.5); S.kb = true; }

  let i;
  for (i = S.balls.length - 1; i >= 0; i--) {
    const b = S.balls[i];
    b.t += dt;
    for (let k = 0; k < 4; k++) stepBall(b, dt / 4);
    if (b.fire && Math.random() < 0.6 && !Shell.reduced) {
      const p = toScreen(b.x, b.y, b.z);
      parts.push({ x: p.x + (Math.random() - 0.5) * 6, y: p.y, vx: (Math.random() - 0.5) * 10, vy: -20, life: 0.35, g: 0,
                   c: Math.random() < 0.5 ? "#ff4b3e" : "#ffd23f", w: 1.5 + Math.random() * 1.6, rot: 0, vr: 0, kind: 1 });
    }
    if (b.t > 4.5 || b.bounces > 3) {
      if (!b.scored && !b.missed) { b.missed = true; missed(); }
      S.balls.splice(i, 1);
      ghost(b);
    }
  }
  updateFx(dt);

  // clock
  if (!S.ending && S.time <= 0) {
    S.time = 0;
    if (S.round === "main" && S.makes >= BONUS_NEED && !S.bonusDone) {
      S.round = "bonus"; S.bonusDone = true; S.time = BONUS_TIME;
      Shell.flash("BONUS ROUND!", "15 more seconds. Keep it going.", "#ffd23f", 1500);
      if (window.Trophies) Trophies.unlock("bbb-bonus");
      Shell.sfx("best");
      ledPlay([ledMsg("bonus", "BONUS ROUND", 2.6, { prio: 5 })]);
    } else {
      S.ending = true; S.endT = 0;
      S.charging = false; S.drag = null;
      Shell.sfx("buzzer");
      Shell.flash("TIME!", S.round === "main" && S.makes < BONUS_NEED ? "Make " + BONUS_NEED + " to unlock the bonus round." : "", "#ff4b3e", 1200);
      ledPlay([ledMsg("time", "TIME!", 1.6, { prio: 6 })]);
    }
  }
  if (S.ending) {
    S.endT += dt;
    const flying = S.balls.some(function (b) { return !b.scored && !b.missed; });
    if (S.endT > 1.4 && (!flying || S.endT > 3)) {
      const pct = S.shots ? Math.round(S.makes / S.shots * 100) : 0;
      ledFinal(S.score);
      Shell.gameOver(S.score, { title: "FINAL BUZZER", html:
        row("Buckets", S.makes + " of " + S.shots + " (" + pct + "%)") +
        row("Swishes", S.swishes) +
        row("Longest streak", S.bestStreak) +
        row("Bonus round", S.bonusDone ? "Unlocked" : "Make " + BONUS_NEED),
        stats: { makes: S.makes, shots: S.shots, swishes: S.swishes, bestStreak: S.bestStreak, score: S.score, bonus: S.bonusDone } });
    }
  }
}
function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

// After the final buzzer the balls still in the cage finish bouncing behind the score card.
// They are already counted (or past counting) and make no sound: this is looks only.
function settle(dt) {
  quiet = true;
  for (let i = S.balls.length - 1; i >= 0; i--) {
    const b = S.balls[i];
    b.scored = true;
    b.t += dt;
    for (let k = 0; k < 4; k++) stepBall(b, dt / 4);
    if (b.t > 4.5 || b.bounces > 3) { S.balls.splice(i, 1); ghost(b); }
  }
  quiet = false;
  updateFx(dt);
}

// A ball the game is finished with does not blink out: it rolls on a little way and is gone (looks only).
function ghost(b) {
  if (!b.q) return;
  V.ghosts.push({ x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, q: b.q, t: 0, fire: b.fire });
  if (V.ghosts.length > MAX_GHOSTS) V.ghosts.shift();
}

/* ---------------- Input (the 2D game's) ---------------- */
function pointer(type, x, y) {
  if (type === "down") {
    if (S.ending) return;
    S.drag = { sx: x, sy: y, x: x, y: y };
    S.kb = false; S.charging = false;
  } else if (type === "move" && S.drag) {
    S.drag.x = x; S.drag.y = y;
  } else if ((type === "up" || type === "cancel") && S.drag) {
    const d = S.drag; S.drag = null;
    if (type === "cancel") return;
    const dy = d.sy - d.y, dx = d.x - d.sx;
    if (dy < 12) return; // must swipe upward
    shoot(dy / MAX_DRAG, clamp(Math.atan2(dx, dy) * 0.9, -0.6, 0.6));
  }
}
function dragShot() {
  if (!S.drag) return null;
  const dy = S.drag.sy - S.drag.y, dx = S.drag.x - S.drag.sx;
  if (dy < 4) return null;
  return { p: clamp(dy / MAX_DRAG, 0, 1.15), a: clamp(Math.atan2(dx, dy) * 0.9, -0.6, 0.6) };
}
function key(type, code, e) {
  const act = code === "Space" || code === "Enter" || code === "NumpadEnter";
  if (type === "down") {
    keys[code] = true;
    if (act && !e.repeat && !S.charging && !S.ending) { S.charging = true; S.chargeT = 0; S.power = 0; S.kb = true; S.drag = null; }
  } else {
    keys[code] = false;
    if (act && S.charging) { S.charging = false; shoot(S.power, S.aim); }
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

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every decal inside the cage uses this
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

// A strip of masking tape with a price in red marker: the bargain bin's price sticker.
function tapeSticker(g, cx, cy, w, h, rot, label, sx) {
  g.save(); g.translate(cx, cy); g.rotate(rot); g.scale(sx || 1, 1);
  g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(-w / 2 + 2, -h / 2 + 3, w, h);
  g.fillStyle = "#ecdfb2"; g.fillRect(-w / 2, -h / 2, w, h);
  g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(-w / 2, -h / 2, w, h * 0.3);
  g.fillStyle = "rgba(150,120,60,.25)";
  for (let x = -w / 2; x < w / 2; x += 5) { g.fillRect(x, -h / 2, 2, 2); g.fillRect(x + 2, h / 2 - 2, 2, 2); }   // torn edges
  g.fillStyle = "#c21f17"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = "italic 900 " + Math.round(h * 0.78) + "px " + HUD_FONT;
  g.fillText(label, 0, h * 0.04);
  g.restore();
}

// The cage floor (3.6 x 7.3 m of maple). Boards run away from the shooter; the script wordmark is printed
// under the lacquer, stretched along the floor so it reads from the rack. The top of the canvas is the far end.
function courtCanvas(script) {
  const CW = 512, CH = 1024, c = mkCanvas(CW, CH), g = c.getContext("2d"), rnd = rng(11);
  const kx = CW / (CAGE_X * 2), kz = CH / CAGE_LEN;
  const X = function (x) { return (x + CAGE_X) * kx; }, Z = function (z) { return CH - z * kz; };
  const n = 30, bw = CW / n;
  for (let i = 0; i < n; i++) {
    let y = -rnd() * 180;
    while (y < CH) {                                        // boards of mixed lengths, butted end to end
      const len = 150 + rnd() * 190;
      g.fillStyle = "hsl(" + (33 + rnd() * 6) + "," + (60 + rnd() * 14) + "%," + (66 + rnd() * 9) + "%)";
      g.fillRect(Math.floor(i * bw), y, Math.ceil(bw) + 1, len);
      g.fillStyle = "rgba(110,62,20,.35)"; g.fillRect(Math.floor(i * bw), y + len - 1, Math.ceil(bw), 1);
      y += len;
    }
    for (let k = 0; k < 5; k++) { g.fillStyle = "rgba(120,70,20," + (0.04 + rnd() * 0.07) + ")"; g.fillRect(i * bw + rnd() * bw, 0, 1, CH); }
    if (rnd() < 0.4) { g.fillStyle = "rgba(255,240,210," + (0.08 + rnd() * 0.08) + ")"; g.fillRect(i * bw + rnd() * bw, 0, 2, CH); }
  }
  for (let i = 1; i < n; i++) { g.fillStyle = "rgba(118,70,28,.32)"; g.fillRect(Math.round(i * bw), 0, 1, CH); }
  // painted lines: a border, and a mark on each side for the three places the hoop parks
  g.lineWidth = 6; g.strokeStyle = "#ffffff"; g.strokeRect(X(-1.72), Z(CAGE_LEN - 0.08), 3.44 * kx, (CAGE_LEN - 0.16) * kz);
  LEVELS.forEach(function (z, i) {
    [-1, 1].forEach(function (s) {
      const x1 = X(s * 1.72), x2 = X(s * 1.2);
      g.fillStyle = i ? "#ff9214" : "#1b5fe0"; g.fillRect(Math.min(x1, x2), Z(z) - 6, Math.abs(x2 - x1), 12);
      g.fillStyle = "#ffffff"; g.fillRect(Math.min(x1, x2), Z(z) - 9, Math.abs(x2 - x1), 3); g.fillRect(Math.min(x1, x2), Z(z) + 6, Math.abs(x2 - x1), 3);
    });
  });
  g.globalAlpha = 0.92;
  g.drawImage(script, X(-1.4), Z(4.44), 2.8 * kx, 1.86 * kz);
  g.globalAlpha = 1;
  return c;
}

// The game room carpet around the cage: the same bright blue confetti floor as the mini golf.
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
      if (kind === 0) {
        g.beginPath(); g.moveTo(-sz * 1.6, 0);
        for (let k = 0; k < 4; k++) g.quadraticCurveTo(-sz * 1.6 + (k + 0.5) * sz * 0.8, k % 2 ? sz * 0.6 : -sz * 0.6, -sz * 1.6 + (k + 1) * sz * 0.8, 0);
        g.stroke();
      } else if (kind === 1) {
        g.beginPath(); g.moveTo(0, -sz * 0.7); g.lineTo(sz * 0.65, sz * 0.5); g.lineTo(-sz * 0.65, sz * 0.5); g.closePath(); g.stroke();
      } else if (kind === 2) {
        g.beginPath(); g.arc(0, 0, sz * 0.3, 0, TAU); g.fill();
      } else {
        g.beginPath(); g.moveTo(-sz, sz * 0.3); g.lineTo(-sz * 0.5, -sz * 0.3); g.lineTo(0, sz * 0.3); g.lineTo(sz * 0.5, -sz * 0.3); g.lineTo(sz, sz * 0.3); g.stroke();
      }
      g.restore();
    }
  }
  return c;
}

// A basketball: pebbled orange rubber, black seams, the script wordmark once on each side, and a strip of
// masking tape with the price on it. u = .25 faces the shooter at rest.
function ballCanvas(script) {
  const CW = 1024, CH = 512, c = mkCanvas(CW, CH), g = c.getContext("2d"), rnd = rng(5);
  const bg = g.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, "#ff9a3d"); bg.addColorStop(0.5, "#f47a22"); bg.addColorStop(1, "#d85e12");
  g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
  for (let i = 0; i < 15000; i++) {                         // pebbling, stretched toward the poles like everything else on the map
    const y = rnd() * CH, lat = (0.5 - y / CH) * Math.PI, sx = 1 / Math.max(0.25, Math.cos(lat));
    g.fillStyle = rnd() < 0.55 ? "rgba(120,44,0,.2)" : "rgba(255,214,150,.2)";
    g.fillRect(rnd() * CW, y, 2 * sx, 2);
  }
  // seams: one great circle through the poles and two ribs, drawn a row at a time so they keep their width on the sphere
  const sw = 7;
  function rib(u) { return 0.2 - 0.09 * Math.cos(4 * Math.PI * u); }
  g.fillStyle = "#1f0d04";
  for (let y = 0; y < CH; y++) {
    const lat = (0.5 - (y + 0.5) / CH) * Math.PI, w = Math.min(CW / 2, sw / Math.max(0.05, Math.cos(lat)));
    g.fillRect(-w / 2, y, w, 1); g.fillRect(CW - w / 2, y, w, 1); g.fillRect(CW / 2 - w / 2, y, w, 1);
  }
  g.lineWidth = sw; g.strokeStyle = "#1f0d04"; g.lineJoin = "round";
  [-1, 1].forEach(function (s) {
    g.beginPath();
    for (let x = -8; x <= CW + 8; x += 8) { const y = (0.5 + s * rib(x / CW)) * CH; if (x === -8) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  });
  // each row is widened by 1 / cos(latitude) so the wordmark lands on the sphere undistorted
  const SW = 262, SH = Math.round(SW * script.height / script.width), rowH = script.height / SH;
  [256, 768].forEach(function (cx) {
    for (let r = 0; r < SH; r++) {
      const y = 262 - Math.round(SH / 2) + r, lat = (0.5 - (y + 0.5) / CH) * Math.PI, w = SW / Math.max(0.4, Math.cos(lat));
      g.drawImage(script, 0, r * rowH, script.width, rowH, cx - w / 2, y, w, 1);
    }
    tapeSticker(g, cx + 26, 152, 92, 40, -0.12, "25¢", 1.28);
  });
  return c;
}

// The backboard face (1.5 x 1.2 m): white glass, the shooter's square, the wordmark over it.
function boardCanvas(script) {
  const CW = 1024, CH = 820, c = mkCanvas(CW, CH), g = c.getContext("2d");
  const Y = function (y) { return (BOARD_Y1 - y) / (BOARD_Y1 - BOARD_Y0) * CH; }, kx = CW / (BOARD_HW * 2);
  const bg = g.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, "#ffffff"); bg.addColorStop(1, "#e4ebf7");
  g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
  g.save(); g.globalAlpha = 0.5;                            // a soft sheen across the glass
  const gl = g.createLinearGradient(0, 0, CW, CH);
  gl.addColorStop(0.2, "rgba(255,255,255,0)"); gl.addColorStop(0.42, "rgba(200,225,255,.8)"); gl.addColorStop(0.5, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.fillRect(0, 0, CW, CH); g.restore();
  g.lineWidth = 44; g.strokeStyle = "#1b5fe0"; g.strokeRect(22, 22, CW - 44, CH - 44);
  g.lineWidth = 8; g.strokeStyle = "#ff9214"; g.strokeRect(48, 48, CW - 96, CH - 96);
  g.lineWidth = 3; g.strokeStyle = "#ffe45c"; g.strokeRect(55, 55, CW - 110, CH - 110);
  const sx = CW / 2 - 0.3 * kx, sy = Y(3.5), sw = 0.6 * kx, sh = Y(3.08) - Y(3.5);
  g.lineWidth = 22; g.strokeStyle = "#ff4b3e"; g.lineJoin = "miter"; g.strokeRect(sx, sy, sw, sh);
  g.lineWidth = 4; g.strokeStyle = "rgba(120,10,0,.35)"; g.strokeRect(sx - 12, sy - 12, sw + 24, sh + 24);
  drawScript(g, script, CW / 2, (62 + sy - 14) / 2, 600, sy - 62 - 34);
  tapeSticker(g, 196, 690, 190, 62, -0.09, "AS IS", 1);
  return c;
}

// The padded apron along the foot of the catch net (3.6 x 0.62 m): the cabinet's marquee.
// Script wordmark on the left, the game on the right. Same candy sign as the lanes and the links.
function apronCanvas(script) {
  const c = mkCanvas(2048, 352), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 352);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fillRect(0, 0, 2048, 352);
  const gl = g.createLinearGradient(0, 0, 0, 160);
  gl.addColorStop(0, "rgba(255,255,255,.42)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.beginPath(); g.ellipse(1024, -24, 1240, 180, 0, 0, TAU); g.fill();
  g.lineWidth = 18; g.strokeStyle = "#ff9214"; g.strokeRect(9, 9, 2030, 334);
  g.lineWidth = 5; g.strokeStyle = "#ffe45c"; g.strokeRect(22, 22, 2004, 308);
  drawScript(g, script, 500, 176, 800, 280);
  candyText(g, "BARGAIN BIN", 1440, 122, 104, 1060);
  candyText(g, "BUCKETS", 1440, 248, 104, 1060);
  return c;
}

// The back wall of the game room in one piece: the long blue and orange banner from the lanes.
// The LED ribbon board (below) hangs high on it; the cage stands in front of the rest.
function wallCanvas() {
  const CW = 1024, CH = 745;
  const c = mkCanvas(CW, CH), g = c.getContext("2d"), rnd = rng(23);
  const kx = CW / WALL_W, ky = CH / WALL_H;
  const Y = function (y) { return CH - y * ky; };
  const bg = g.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, "#143fae"); bg.addColorStop(0.45, "#2f7bf0"); bg.addColorStop(0.8, "#1b56cf"); bg.addColorStop(1, "#143fae");
  g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
  const cy = Y(3.2);
  const glow = g.createRadialGradient(CW / 2, cy, 10, CW / 2, cy, 360);    // one soft spotlight behind the hoop
  glow.addColorStop(0, "rgba(150,208,255,.6)"); glow.addColorStop(1, "rgba(150,208,255,0)");
  g.fillStyle = glow; g.fillRect(0, 0, CW, CH);
  for (let i = 0; i < 28; i += 2) {                         // one sunburst for the whole banner
    g.fillStyle = "rgba(255,255,255,.075)";
    g.beginPath(); g.moveTo(CW / 2, cy);
    g.arc(CW / 2, cy, 1400, i / 28 * TAU, (i + 1) / 28 * TAU); g.closePath(); g.fill();
  }
  for (let i = 0; i < 110; i++) {                         // candy bubbles scattered end to end
    const x = rnd() * CW, y = rnd() * CH, r = 0.05 + rnd() * 0.17;
    g.lineWidth = 1.6; g.strokeStyle = "rgba(255,255,255," + (0.07 + rnd() * 0.1) + ")";
    g.beginPath(); g.ellipse(x, y, r * kx, r * ky, 0, 0, TAU); g.stroke();
  }
  // a painted base band with trim, so the wall meets the carpet like the rest of the arcade
  g.fillStyle = "#0b2a7c"; g.fillRect(0, Y(0.9), CW, CH - Y(0.9));
  g.fillStyle = "#ff9214"; g.fillRect(0, Y(1.02), CW, Y(0.9) - Y(1.02));
  g.fillStyle = "#ffe45c"; g.fillRect(0, Y(1.02) - 3, CW, 3);
  g.fillStyle = "#ffffff"; g.fillRect(0, Y(0.9), CW, 2);
  return c;
}

// Knotted cord netting, one diamond per tile.
function netCanvas(size, lw, alpha) {
  const c = mkCanvas(size, size), g = c.getContext("2d");
  g.strokeStyle = "rgba(255,255,255," + alpha + ")"; g.lineWidth = lw; g.lineCap = "round";
  for (let o = -size; o <= size; o += size) {
    g.beginPath(); g.moveTo(o, 0); g.lineTo(o + size, size); g.stroke();
    g.beginPath(); g.moveTo(o + size, 0); g.lineTo(o, size); g.stroke();
  }
  g.fillStyle = "rgba(255,255,255," + Math.min(1, alpha * 1.15) + ")";
  [[0, 0], [size, 0], [0, size], [size, size], [size / 2, size / 2]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], lw * 0.95, 0, TAU); g.fill(); });
  return c;
}

function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(30,14,0,.8)"); gr.addColorStop(0.55, "rgba(30,14,0,.4)"); gr.addColorStop(1, "rgba(30,14,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function glowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(255,210,90,.95)"); gr.addColorStop(0.4, "rgba(255,110,30,.55)"); gr.addColorStop(1, "rgba(255,60,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}

// A tiny painted room for the glossy highlights on the rim, the rails and the floor.
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

/* ---------------- LED ribbon board: the full-width strip high on the back wall ----------------
   The same board as the lanes. It is a real dot matrix: everything on it is painted into a tiny canvas,
   one pixel per LED, and a small shader turns each pixel into a glowing dot. It scrolls its programme
   right to left, and cuts to big animated messages when the game calls for one (ledPlay below). */
const LED_H = 0.76, LED_Y = 5.31;                          // meters: lit height, and its center height on the wall
const LED_ROWS = 26, LED_COLS = Math.round(WALL_W / (LED_H / LED_ROWS));
const LED_SPEED = 42;                                      // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));   // the largest text size that fits (5 x 7 font, in LEDs per font pixel)
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff", slate: "#8fa3d8" };
// Short messages between the plugs. The wordmark leads each group.
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["MAKE 20 FOR THE BONUS ROUND", "pink"], ["NO QUARTERS REQUIRED", "cyan"]];
// Plugs for the rest of the arcade: [game, one-line tag]. Edit freely, the board lays itself out.
const LED_PLUGS = [
  ["TAPE PIN LANES", "BOWLING"],
  ["SHELF LINKS", "MINI GOLF"],
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
    "*": "00000 00100 01110 11111 01110 00100 00000", "^": "00100 01010 10001 00000 00000 00000 00000"
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
  function mark() {
    items.push({ w: markW, draw: function (g, x) { g.drawImage(markC, x, 0); } });
  }
  function line(str, color) {
    items.push({ w: ledTextW(str, big), draw: function (g, x) { ledText(g, str, x, yBig, big, big, color); } });
  }
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
  // open with the wordmark sitting in the middle of the board
  const start = ((-(LED_COLS - strip.markW) / 2) % sw + sw) % sw;
  return { canvas: c, g: g, strip: strip.canvas, scroll: start, pos: -1, msg: null, queue: [], frame: -1, lastScore: 0, tex: null, vis: LED_COLS };
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
  const m = { kind: kind, text: text, dur: dur, t: 0, prio: 1 };
  if (more) for (const k in more) m[k] = more[k];
  return m;
}
function ledScore(dur) {
  const from = LED ? Math.min(LED.lastScore, S.score) : 0;
  if (LED) LED.lastScore = S.score;
  return ledMsg("score", "SCORE", dur, { from: from, value: S.score, prio: 1 });
}
// Cut to a list of messages, then return to the scroll. A bigger moment already on the board (ON FIRE,
// BONUS ROUND...) is left to finish first; whatever was waiting behind it is replaced by the newer list.
function ledPlay(list, append) {
  const L = LED;
  if (!L || !list.length) return;
  if (L.msg && (append || (L.msg.prio > list[0].prio && L.msg.t < L.msg.dur - 0.05))) {
    if (append) for (let i = 0; i < list.length; i++) L.queue.push(list[i]); else L.queue = list;
    return;
  }
  L.msg = list[0]; L.msg.t = 0;
  L.queue = list.slice(1);
  L.frame = -1;
}
function ledClear() {
  if (!LED) return;
  LED.msg = null; LED.queue = []; LED.lastScore = 0; LED.pos = -1;
}
function ledFinal(score) {
  if (!LED) return;
  LED.queue = [];
  ledPlay([ledMsg("score", "FINAL", 6, { from: Math.min(LED.lastScore, score), value: score, final: true, prio: 6 })], true);
  LED.lastScore = score;
}

function ledDrawMsg(g, m) {
  const CW = LED_COLS, HH = LED_ROWS, big = LED_BIG, calm = Shell.reduced, VW = Math.min(CW, LED.vis);
  const t = m.t, yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(CW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24);
  function fit(str) {                                       // widest lettering that still leaves room either side
    let sx = big + 1;
    if (ledTextW(str, sx) > VW - 44) sx = big;
    while (sx > 1 && ledTextW(str, sx) > VW - 14) sx--;
    return sx;
  }
  function chase(color, dir) {                              // running lights along the top and bottom edges
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < CW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(CW - x - 3, HH - 1, 3, 1); }
  }
  function chevrons(w, colA, colB, speed) {                 // chevrons racing outward on both sides of the lettering
    const span = 6 * big + 5, ph = calm ? 0 : Math.floor((t * speed) % span);
    for (let k = 0; k < 14; k++) {
      const off = Math.round(w / 2) + 9 + k * span + ph;
      if (off > mid + span) break;
      const col = k % 2 ? colA : colB;
      ledText(g, ">", mid + off, yBig, big, big, col);
      ledText(g, "<", mid - off - 5 * big, yBig, big, big, col);
    }
  }
  function sparkle(n) { if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < n; i++) g.fillRect((Math.random() * CW) | 0, (Math.random() * HH) | 0, 1, 1); } }
  const sx = fit(m.text), w = ledTextW(m.text, sx), x0 = Math.round((CW - w) / 2);

  if (m.kind === "swish") {                                 // drops in from the top, clean through, then a white glint sweeps across it
    const k = calm ? 1 : Math.min(1, t / 0.3), e = 1 - Math.pow(1 - k, 3);
    ledText(g, m.text, x0, Math.round(yBig - (1 - e) * (HH + 2)), sx, big, LED_C.lime);
    if (!calm && k >= 1) {
      const bx = x0 - 14 + Math.floor(((t - 0.3) * 260) % (w + 60));
      g.save(); g.beginPath(); g.rect(bx, 0, 10, HH); g.clip();
      ledText(g, m.text, x0, yBig, sx, big, "#ffffff");
      g.restore();
    }
    chase(LED_C.lime, 1);
    return;
  }
  if (m.kind === "fire") {                                  // the board catches: flames along the bottom, lettering flickering hot
    if (!calm && t < 0.5 && Math.floor(t * 12) % 2 === 0) {
      g.fillStyle = LED_C.orange; g.fillRect(0, 0, CW, HH);
      ledText(g, m.text, x0, yBig, sx, big, "#000000");
      return;
    }
    for (let x = 0; x < CW; x += 2) {
      const inText = x > x0 - 6 && x < x0 + w + 4;
      const v = calm ? 0.6 : (0.5 + 0.5 * Math.sin(x * 0.37 + step * 0.9)) * (0.55 + 0.45 * Math.sin(x * 1.31 - step * 0.61 + 1.7));
      const h = Math.round(2 + Math.max(0, v) * (inText ? 3 : HH * 0.82));
      g.fillStyle = LED_C.red; g.fillRect(x, HH - h, 2, h);
      g.fillStyle = LED_C.orange; g.fillRect(x, HH - Math.round(h * 0.66), 2, Math.round(h * 0.66));
      g.fillStyle = LED_C.yellow; g.fillRect(x, HH - Math.round(h * 0.3), 2, Math.round(h * 0.3));
    }
    const cyc = [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0 + 1, yBig, sx, big, "#000000");
    ledText(g, m.text, x0, yBig - 1, sx, big, calm ? LED_C.yellow : cyc[Math.floor(t * 9) % 3]);
    return;
  }
  if (m.kind === "bonus") {                                 // strobe, then chevrons racing outward
    if (!calm && t < 0.6 && Math.floor(t * 12) % 2 === 0) {
      g.fillStyle = LED_C.yellow; g.fillRect(0, 0, CW, HH);
      ledText(g, m.text, x0, yBig, sx, big, "#000000");
      return;
    }
    chevrons(w, LED_C.pink, LED_C.orange, 46);
    const cyc = [LED_C.yellow, LED_C.white, LED_C.pink];
    ledText(g, m.text, x0, yBig, sx, big, calm ? LED_C.yellow : cyc[Math.floor(t * 8) % 3]);
    sparkle(18);
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "level") {                                 // carets climbing either side: the hoop is on its way back
    const k = calm ? 1 : Math.min(1, t / 0.35), e = 1 - Math.pow(1 - k, 3);
    ledText(g, m.text, Math.round(x0 - (1 - e) * CW), yBig, sx, big, LED_C.cyan);
    for (let s = -1; s <= 1; s += 2) for (let c = 0; c < 3; c++) {
      const cx = mid + s * (Math.round(w / 2) + 12 + c * 14) - (s < 0 ? 10 : 0);
      for (let j = 0; j < 5; j++) {
        const y = j * 8 - (calm ? 0 : (step + c * 3) % 8) - 2;
        ledText(g, "^", cx, y, 2, 2, (j + c) % 2 ? LED_C.blue : LED_C.cyan);
      }
    }
    chase(LED_C.cyan, -1);
    return;
  }
  if (m.kind === "brick") {                                 // blinks, while a ball bounces along the bottom
    if (calm || t > 1.1 || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, yBig, sx, big, LED_C.pink);
    g.fillStyle = LED_C.red; g.fillRect(0, HH - 1, CW, 1);
    if (!calm) {
      const bx = Math.floor(mid - VW / 2 + (t * 120) % VW), by = HH - 4 - Math.round(Math.abs(Math.sin(t * 9)) * 9);
      g.fillStyle = LED_C.orange; g.fillRect(bx, by, 3, 3);
    }
    return;
  }
  if (m.kind === "out") {                                   // the fire goes out: the lettering cools and thins to embers
    const k = calm ? 0 : clamp((t - 0.7) / (m.dur - 0.7), 0, 1);
    ledText(g, m.text, x0, yBig, sx, big, t < 0.25 && !calm ? LED_C.orange : LED_C.slate);
    if (k > 0) { g.fillStyle = "#000000"; for (let y = 0; y < HH; y++) if (((y * 7919) % 13) / 13 < k) g.fillRect(0, y, CW, 1); }
    return;
  }
  if (m.kind === "time") {                                  // the buzzer: the whole board flips red
    if (!calm && t < 0.8 && Math.floor(t * 10) % 2 === 0) {
      g.fillStyle = LED_C.red; g.fillRect(0, 0, CW, HH);
      ledText(g, m.text, x0, yBig, sx, big, "#000000");
      return;
    }
    ledText(g, m.text, x0, yBig, sx, big, LED_C.red);
    chase(LED_C.red, 1);
    return;
  }
  // score: counts up to the new total
  const k = calm ? 1 : Math.min(1, t / 0.5), v = Math.round(m.from + (m.value - m.from) * k);
  const label = m.text + " ", full = ledTextW(label + m.value, big), x = Math.round((CW - full) / 2);
  const xn = ledText(g, label, x, yBig, big, big, LED_C.amber);
  const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
  ledText(g, String(v), xn, yBig, big, big, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
  chase(LED_C.amber, 1);
}

function ledDraw() {
  const L = LED, g = L.g, CW = LED_COLS, HH = LED_ROWS;
  g.fillStyle = "#000000"; g.fillRect(0, 0, CW, HH);
  if (L.msg) { ledDrawMsg(g, L.msg); return; }
  const sw = L.strip.width;
  let sx = L.pos, dx = 0;
  while (dx < CW) {                                         // the strip wraps around
    const n = Math.min(CW - dx, sw - sx);
    g.drawImage(L.strip, sx, 0, n, HH, dx, 0, n, HH);
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

// A box with every edge and corner rounded. Each face keeps its own material slot (+x -x +y -y +z -z)
// and its texture stretched corner to corner.
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
  const camera = new T.PerspectiveCamera(CAM_FOV, W / H, 0.4, 60);
  const caps = renderer.capabilities;
  const aniso = Math.min(4, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);

  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = aniso;
    return t;
  }
  function lit(mesh, cast, recv) { mesh.castShadow = !!cast; mesh.receiveShadow = !!recv; return mesh; }
  function scaleUV(geo, su, sv) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    return geo;
  }
  // A flat rectangle on the floor between x1..x2 and z1..z2 (game axes) at height y. Texture "up" points away from the shooter.
  function floor(x1, x2, z1, z2, y, mat, su, sv) {
    const g = new T.PlaneGeometry(x2 - x1, z2 - z1);
    g.rotateX(-Math.PI / 2);
    if (su) scaleUV(g, su, sv);
    const m = new T.Mesh(g, mat);
    m.position.set((x1 + x2) / 2, y, -(z1 + z2) / 2);
    return m;
  }
  // A round bar between two points (three.js axes).
  const UP = new T.Vector3(0, 1, 0);
  function bar(ax, ay, az, bx, by, bz, r, mat, seg) {
    const d = new T.Vector3(bx - ax, by - ay, bz - az), len = d.length();
    const m = new T.Mesh(new T.CylinderGeometry(r, r, len, seg || 12), mat);
    m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    return m;
  }

  const script = scriptCanvas(scriptImg);
  const tCourt = tex(courtCanvas(script)), tCarpet = tex(carpetCanvas(), true), tBall = tex(ballCanvas(script), true);
  const tBoard = tex(boardCanvas(script)), tApron = tex(apronCanvas(script)), tWall = tex(wallCanvas());
  const tNet = tex(netCanvas(64, 5, 0.95), true), tCord = tex(netCanvas(64, 8, 1), true);
  const tBlob = tex(shadowCanvas()), tGlow = tex(glowCanvas());
  tBall.wrapT = T.ClampToEdgeWrapping;
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;

  /* lights */
  scene.add(new T.HemisphereLight(0xffffff, 0x9fb2e6, 1.35));
  const key = new T.DirectionalLight(0xfff6e4, 2.5);        // the one light that throws shadows: almost straight down, so a ball's shadow tracks under it
  key.position.set(-0.9, 12, -1.1); key.target.position.set(0, 0, -3.7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -5.6; sc.right = 5.6; sc.top = 5.6; sc.bottom = -5.6; sc.near = 2; sc.far = 20;
  sc.updateProjectionMatrix();
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02; key.shadow.radius = 2.4;
  scene.add(key); scene.add(key.target);
  const fill = new T.DirectionalLight(0xeef3ff, 0.95);       // from behind the shooter, so the faces toward the camera never go flat
  fill.position.set(2.5, 3.5, 7); scene.add(fill);

  function gloss(color, shin, refl) {
    return new T.MeshPhongMaterial({ color: color, specular: 0xffffff, shininess: shin || 90, envMap: tEnv, combine: T.AddOperation, reflectivity: refl == null ? 0.12 : refl });
  }
  const chrome = gloss(0xeef2ff, 110, 0.3), yellow = gloss(0xffcf1a, 90, 0.12), blue = gloss(0x1b5fe0, 70, 0.1), orange = gloss(0xff9214, 90, 0.12);
  const dark = new T.MeshPhongMaterial({ color: 0x1a2038, specular: 0x8899cc, shininess: 50 });
  const pad = new T.MeshPhongMaterial({ color: 0x1746c8, specular: 0x9bb4ff, shininess: 35 });
  const padTrim = new T.MeshPhongMaterial({ color: 0xff9214, specular: 0xffd9a0, shininess: 35 });

  /* floor: carpet under everything, the maple court inside the cage */
  const carpet = lit(floor(-14, 14, -8, WALL_Z, -0.012, new T.MeshLambertMaterial({ map: tCarpet }), 28 / 2.2, (WALL_Z + 8) / 2.2), false, true);
  scene.add(carpet);
  const courtMat = new T.MeshPhongMaterial({ map: tCourt, specular: 0x8a8a8a, shininess: 80, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.07 });
  scene.add(lit(floor(-CAGE_X, CAGE_X, 0, CAGE_LEN, 0, courtMat), false, true));

  /* back wall and the LED ribbon board on it */
  const wall = new T.Mesh(new T.PlaneGeometry(WALL_W, WALL_H), new T.MeshBasicMaterial({ map: tWall }));
  wall.position.set(0, WALL_H / 2, -WALL_Z); scene.add(wall);
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);             // one texel per LED, never smoothed
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas());         // one LED lens, tiled; its mipmaps fade the dots out cleanly at a distance
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
  const ledHouse = new T.Mesh(new T.BoxGeometry(WALL_W, LED_H + 0.2, 0.08), new T.MeshBasicMaterial({ color: 0x05070d }));
  ledHouse.position.set(0, LED_Y + 0.04, -(WALL_Z - 0.04)); scene.add(ledHouse);   // a thin lip below, a deeper hood above
  const ledFace = new T.Mesh(new T.PlaneGeometry(WALL_W, LED_H), ledMat);
  ledFace.position.set(0, LED_Y, -(WALL_Z - 0.09)); scene.add(ledFace);
  [LED_Y - LED_H / 2 - 0.085, LED_Y + LED_H / 2 + 0.165].forEach(function (y) {   // orange trim above and below the housing
    const m = new T.Mesh(new T.BoxGeometry(WALL_W, 0.05, 0.1), new T.MeshBasicMaterial({ color: 0xff9214 }));
    m.position.set(0, y, -(WALL_Z - 0.05)); scene.add(m);
  });

  /* the cage: padded base rails, posts, top rails and netting down both sides (the catch net on the hoop frame is its back) */
  const netMat = new T.MeshBasicMaterial({ map: tNet, transparent: true, opacity: 0.42, side: T.DoubleSide, depthWrite: false });
  function netPlane(w, h, tile) { return scaleUV(new T.PlaneGeometry(w, h), w / tile, h / tile); }
  [-1, 1].forEach(function (s) {
    const x = s * (CAGE_X + 0.1);
    let m = new T.Mesh(roundBox(T, 0.2, 0.34, CAGE_LEN, 0.07), pad); m.position.set(x, 0.17, -CAGE_LEN / 2); scene.add(lit(m, true, true));
    m = new T.Mesh(roundBox(T, 0.215, 0.07, CAGE_LEN + 0.01, 0.03), padTrim); m.position.set(x, 0.36, -CAGE_LEN / 2); scene.add(lit(m, false, true));
    for (let k = 0; k < 4; k++) { const z = -k * CAGE_LEN / 3; scene.add(lit(bar(x, 0.3, z, x, CAGE_H, z, 0.045, chrome), true, false)); }
    scene.add(lit(bar(x, CAGE_H, 0.03, x, CAGE_H, -CAGE_LEN - 0.03, 0.045, chrome), true, false));
    m = new T.Mesh(netPlane(CAGE_LEN, CAGE_H - 0.36, 0.17), netMat); m.rotation.y = Math.PI / 2;
    m.position.set(s * CAGE_X, (CAGE_H + 0.36) / 2, -CAGE_LEN / 2); m.renderOrder = 3; scene.add(m);
  });
  let m = new T.Mesh(roundBox(T, CAGE_X * 2 + 0.4, 0.34, 0.2, 0.07), pad); m.position.set(0, 0.17, -(CAGE_LEN + 0.1)); scene.add(lit(m, true, true));
  scene.add(lit(bar(-CAGE_X - 0.1, CAGE_H, -CAGE_LEN, CAGE_X + 0.1, CAGE_H, -CAGE_LEN, 0.045, chrome), true, false));
  // floor tracks the hoop frame rolls back on
  [-1, 1].forEach(function (s) {
    const t = new T.Mesh(new T.BoxGeometry(0.07, 0.024, 4.6), dark); t.position.set(s * GANTRY_X, 0.0, -(LEVELS[0] + CATCH_Z + 1.55)); scene.add(lit(t, false, true));
  });

  /* the hoop frame: two posts on trolleys, a top beam, the catch net hanging from it with the marquee apron
     along its foot, and the backboard slung forward on two arms. The whole frame rolls back with S.hoopZ;
     the carriage (backboard, rim, net) slides along the beam with S.hoopX. Origin: under the rim center. */
  const gantry = new T.Group();
  [-1, 1].forEach(function (s) {
    gantry.add(lit(bar(s * GANTRY_X, 0.12, -CATCH_Z, s * GANTRY_X, GANTRY_H, -CATCH_Z, 0.055, yellow, 14), true, false));
    const foot = new T.Mesh(roundBox(T, 0.26, 0.15, 0.62, 0.055), orange); foot.position.set(s * GANTRY_X, 0.105, -CATCH_Z); gantry.add(lit(foot, true, false));
    [-0.2, 0.2].forEach(function (dz) {
      const wh = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.07, 14), dark); wh.rotation.z = Math.PI / 2;
      wh.position.set(s * GANTRY_X, 0.06, -CATCH_Z + dz); gantry.add(wh);
    });
    const capS = new T.Mesh(new T.SphereGeometry(0.075, 14, 10), orange); capS.position.set(s * GANTRY_X, GANTRY_H, -CATCH_Z); gantry.add(capS);
  });
  m = new T.Mesh(roundBox(T, GANTRY_X * 2, 0.14, 0.14, 0.05), blue); m.position.set(0, GANTRY_H, -CATCH_Z); gantry.add(lit(m, true, false));
  const catchMat = new T.MeshBasicMaterial({ map: tNet, transparent: true, opacity: 0.46, side: T.DoubleSide, depthWrite: false });
  m = new T.Mesh(netPlane(CAGE_X * 2 - 0.04, GANTRY_H - 0.72, 0.17), catchMat);
  m.position.set(0, (GANTRY_H + 0.58) / 2, -CATCH_Z); m.renderOrder = 4; gantry.add(m);
  const APRON_H = 0.62;
  const apronFace = new T.MeshPhongMaterial({ map: tApron, specular: 0x555555, shininess: 30 });
  m = new T.Mesh(roundBox(T, CAGE_X * 2 - 0.02, APRON_H, 0.16, 0.06), [pad, pad, pad, pad, apronFace, pad]);
  m.position.set(0, APRON_H / 2 + 0.02, -CATCH_Z - 0.08); gantry.add(lit(m, true, true));
  // chase bulbs along the top of the apron: the 2D game's marquee lights
  const BULBS = 19;
  const bulbs = new T.InstancedMesh(new T.SphereGeometry(0.03, 10, 8), new T.MeshBasicMaterial({ color: 0xffffff }), BULBS);
  const bm = new T.Matrix4(), bcOn = new T.Color(0xfff2a0), bcOff = new T.Color(0x6a4a10);
  for (let i = 0; i < BULBS; i++) {
    bm.makeTranslation(-1.66 + i * 3.32 / (BULBS - 1), APRON_H + 0.06, -CATCH_Z + 0.0);
    bulbs.setMatrixAt(i, bm); bulbs.setColorAt(i, bcOff);
  }
  bulbs.instanceMatrix.needsUpdate = true;
  const bulbRail = new T.Mesh(roundBox(T, CAGE_X * 2 - 0.02, 0.07, 0.1, 0.03), dark); bulbRail.position.set(0, APRON_H + 0.05, -CATCH_Z - 0.04);
  gantry.add(bulbRail); gantry.add(bulbs);

  const slide = new T.Group(); gantry.add(slide);
  m = new T.Mesh(roundBox(T, 1.05, 0.2, 0.24, 0.07), orange); m.position.set(0, GANTRY_H, -CATCH_Z); slide.add(lit(m, true, false));   // the carriage on the beam
  [-1, 1].forEach(function (s) {
    slide.add(lit(bar(s * 0.42, GANTRY_H - 0.06, -CATCH_Z + 0.06, s * 0.42, 3.82, -BOARD_Z - 0.09, 0.032, chrome), true, false));
    slide.add(lit(bar(s * 0.42, GANTRY_H - 0.06, -CATCH_Z + 0.06, s * 0.42, 3.05, -BOARD_Z - 0.09, 0.026, chrome), true, false));
  });
  const boardGrp = new T.Group(); boardGrp.position.set(0, BOARD_Y1, -BOARD_Z); slide.add(boardGrp);    // hinged at its top edge for the shudder
  const boardFace = new T.MeshPhongMaterial({ map: tBoard, specular: 0x3a3a3a, shininess: 50, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.05 });
  const boardEdge = gloss(0x1b5fe0, 70, 0.1), boardBack = new T.MeshPhongMaterial({ color: 0x8f9bbd, specular: 0x777777, shininess: 40 });
  const BH = BOARD_Y1 - BOARD_Y0;
  m = new T.Mesh(roundBox(T, BOARD_HW * 2, BH, 0.07, 0.03), [boardEdge, boardEdge, boardEdge, boardEdge, boardFace, boardBack]);
  m.position.set(0, -BH / 2, -0.035); boardGrp.add(lit(m, true, true));
  m = new T.Mesh(roundBox(T, BOARD_HW * 2 + 0.03, 0.09, 0.1, 0.04), padTrim); m.position.set(0, -BH + 0.02, -0.035); boardGrp.add(lit(m, true, false));   // padded bottom edge

  const rimGrp = new T.Group(); rimGrp.position.set(0, RIM_Y, -BOARD_Z); slide.add(rimGrp);            // hinged at the backboard for the rattle
  const rimMat = new T.MeshPhongMaterial({ color: 0xff4a12, specular: 0xffc9a8, shininess: 80, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.08 });
  const rimGeo = new T.TorusGeometry(RIM_R, TUBE + 0.004, 12, 44); rimGeo.rotateX(Math.PI / 2);
  m = new T.Mesh(rimGeo, rimMat); m.position.set(0, 0, BOARD_Z); rimGrp.add(lit(m, true, false));
  m = new T.Mesh(roundBox(T, 0.13, 0.045, BOARD_Z - RIM_R + 0.03, 0.02), rimMat); m.position.set(0, -0.012, (BOARD_Z - RIM_R) / 2); rimGrp.add(lit(m, true, false));
  m = new T.Mesh(roundBox(T, 0.2, 0.16, 0.025, 0.012), rimMat); m.position.set(0, -0.06, 0.012); rimGrp.add(m);
  // the net: a cord basket hanging off the rim. Its vertices are moved every frame it is swinging.
  const NS = 18, NR = 6, NET_DROP = 0.42;
  const netGeo = new T.BufferGeometry(), nPos = new Float32Array((NS + 1) * (NR + 1) * 3), nUv = new Float32Array((NS + 1) * (NR + 1) * 2), nIdx = [];
  for (let j = 0; j <= NR; j++) for (let i = 0; i <= NS; i++) {
    const n = j * (NS + 1) + i;
    nUv[n * 2] = i / NS * 9; nUv[n * 2 + 1] = j / NR * 3;
    if (j < NR && i < NS) nIdx.push(n, n + NS + 1, n + 1, n + 1, n + NS + 1, n + NS + 2);
  }
  netGeo.setAttribute("position", new T.BufferAttribute(nPos, 3));
  netGeo.setAttribute("uv", new T.BufferAttribute(nUv, 2));
  netGeo.setIndex(nIdx);
  const cordMat = new T.MeshBasicMaterial({ map: tCord, transparent: true, side: T.DoubleSide, depthWrite: false, alphaTest: 0.08 });
  const net = new T.Mesh(netGeo, cordMat); net.position.set(0, 0, BOARD_Z); net.renderOrder = 6; net.frustumCulled = false; rimGrp.add(net);

  scene.add(gantry);

  /* the rack at the shooter's end: two chrome rails, the ball in the cradle, the next ones lined up to its right */
  const rack = new T.Group();
  const RAIL_Y = HAND.y - Math.sqrt(Math.pow(BALL_R + 0.016, 2) - 0.085 * 0.085), RACK_HALF = 1.55;
  [-0.085, 0.085].forEach(function (dz) { rack.add(lit(bar(-RACK_HALF, RAIL_Y, -HAND.z + dz, RACK_HALF, RAIL_Y, -HAND.z + dz, 0.016, chrome, 10), true, false)); });
  [-RACK_HALF, -0.78, 0.26, 0.78, RACK_HALF].forEach(function (x) {   // cross ties and legs
    rack.add(bar(x, RAIL_Y, -HAND.z - 0.085, x, RAIL_Y, -HAND.z + 0.085, 0.012, chrome, 8));
  });
  [-RACK_HALF, RACK_HALF].forEach(function (x) {
    rack.add(lit(bar(x, 0, -HAND.z, x, RAIL_Y, -HAND.z, 0.03, yellow), true, false));
    const ft = new T.Mesh(new T.CylinderGeometry(0.16, 0.19, 0.05, 20), dark); ft.position.set(x, 0.025, -HAND.z); rack.add(lit(ft, true, true));
  });
  const cup = new T.TorusGeometry(0.075, 0.014, 8, 24); cup.rotateX(Math.PI / 2);
  m = new T.Mesh(cup, orange); m.position.set(HAND.x, RAIL_Y + 0.004, -HAND.z); rack.add(m);
  rack.add(lit(bar(HAND.x, 0, -HAND.z, HAND.x, RAIL_Y - 0.01, -HAND.z, 0.028, yellow), true, false));
  const base = new T.Mesh(new T.CylinderGeometry(0.2, 0.24, 0.05, 24), dark); base.position.set(HAND.x, 0.025, -HAND.z); rack.add(lit(base, true, true));
  scene.add(rack);

  /* balls: the ones in play, and the ones on the rack */
  const ballGeo = new T.SphereGeometry(BALL_R, 30, 20);
  const ballMat = new T.MeshPhongMaterial({ map: tBall, specular: 0x6a5a4a, shininess: 28 });
  const fireMat = new T.MeshPhongMaterial({ map: tBall, specular: 0x6a5a4a, shininess: 28, emissive: 0xff4a00, emissiveIntensity: 0.55 });
  const blobMat = new T.MeshBasicMaterial({ map: tBlob, transparent: true, opacity: 0.55, depthWrite: false });
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
  const glowMat = new T.SpriteMaterial({ map: tGlow, blending: T.AdditiveBlending, depthWrite: false, transparent: true });
  const balls = [], fake = [];
  for (let i = 0; i < MAX_BALLS + MAX_GHOSTS; i++) {
    const mesh = lit(new T.Mesh(ballGeo, ballMat), true, false); mesh.visible = false; scene.add(mesh);
    const blob = new T.Mesh(unit, blobMat); blob.renderOrder = 1; blob.visible = false; scene.add(blob);
    const glow = new T.Sprite(glowMat); glow.scale.set(0.62, 0.62, 1); glow.visible = false; glow.renderOrder = 5; scene.add(glow);
    balls.push({ mesh: mesh, blob: blob, glow: glow });
  }
  const rackBalls = [];
  for (let i = 0; i < 6; i++) { const mesh = lit(new T.Mesh(ballGeo, ballMat), true, false); scene.add(mesh); rackBalls.push(mesh); }
  // stand-in shadows for the low setting (shadow maps off): one under the backboard, one under the rack
  const boardBlob = new T.Mesh(unit, blobMat); boardBlob.scale.set(2.4, 1, 1.0); boardBlob.renderOrder = 1; boardBlob.visible = false; scene.add(boardBlob); fake.push(boardBlob);

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  // how many LEDs across the camera can actually see: big messages are fitted inside that
  const visW = 2 * Math.tan(CAM_FOV * Math.PI / 360) * (W / H) * (WALL_Z - CAM.z - 0.7);
  LED.vis = Math.max(60, Math.min(LED_COLS, Math.floor(visW / (LED_H / LED_ROWS)) - 6));

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, key: key, fake: fake,
    gantry: gantry, slide: slide, boardGrp: boardGrp, rimGrp: rimGrp, net: net, netGeo: netGeo, NS: NS, NR: NR, NET_DROP: NET_DROP, netStill: false,
    bulbs: bulbs, BULBS: BULBS, bcOn: bcOn, bcOff: bcOff, bulbStep: -1,
    balls: balls, rackBalls: rackBalls, ballMat: ballMat, fireMat: fireMat, boardBlob: boardBlob,
    camPos: new T.Vector3(0, CAM.y, -CAM.z), camTgt: new T.Vector3(0, CAM.ty, -CAM.tz), goalPos: new T.Vector3(), goalTgt: new T.Vector3(),
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0,
    restQ: new T.Quaternion().setFromEuler(new T.Euler(-0.36, 0, 0)),
    qa: new T.Quaternion(), qb: new T.Quaternion(), axis: new T.Vector3(), up: new T.Vector3(0, 1, 0), zAxis: new T.Vector3(0, 0, 1), v: new T.Vector3(),
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

// A point in the cage (meters, game axes) -> HUD pixels.
function toScreen(x, y, z) {
  if (!R) return { x: W / 2, y: H / 2, ok: false };
  R.v.set(x, y, -z).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1 };
}

/* ---------------- Game state -> meshes ---------------- */
function syncNet(fdt) {
  V.netT += fdt;
  const a = V.net * Math.exp(-V.netT * 4.2);
  if (a < 0.004) { if (R.netStill) return; V.net = 0; }
  R.netStill = a < 0.004;
  const pos = R.netGeo.attributes.position, NS = R.NS, NR = R.NR, t = V.netT, calm = Shell.reduced ? 0.3 : 1;
  for (let j = 0; j <= NR; j++) {
    const k = j / NR, wave = a * calm * Math.sin(t * 21 - k * 3.2);
    // the basket narrows toward the bottom; a ball going through pulls it long and flares the hem
    const r = RIM_R * (1 - 0.47 * Math.pow(k, 0.85)) * (1 + k * 0.34 * wave + k * a * calm * 0.1);
    const y = -(k * R.NET_DROP) * (1 + a * calm * 0.2 * Math.max(0, Math.sin(t * 15))) + k * 0.03 * wave;
    const sx = k * k * (a * calm * 0.07 * Math.sin(t * 13) + V.netX * a * calm * 0.05);
    for (let i = 0; i <= NS; i++) {
      const an = i / NS * TAU;
      pos.setXYZ(j * (NS + 1) + i, Math.cos(an) * r + sx, y, Math.sin(an) * r);
    }
  }
  pos.needsUpdate = true;
}

function syncScene(state, fdt) {
  const idle = state === "title" || state === "over";
  let i;
  R.clock += fdt;
  ledTick(fdt);

  /* the hoop frame */
  R.gantry.position.z = -S.hoopZ;
  R.slide.position.x = S.hoopX;
  V.rimT += fdt; V.boardT += fdt;
  const calm = Shell.reduced ? 0.25 : 1;
  const rw = V.rim * Math.exp(-V.rimT * 7.5) * Math.sin(V.rimT * 58) * calm;
  R.rimGrp.rotation.x = rw * 0.05;
  const bw = V.board * Math.exp(-V.boardT * 9) * Math.sin(V.boardT * 44) * calm;
  R.boardGrp.rotation.x = -bw * 0.014;
  syncNet(fdt);
  const step = Shell.reduced ? 0 : Math.floor(R.clock * (S.fire && !idle ? 9 : 4));
  if (step !== R.bulbStep) {
    R.bulbStep = step;
    for (i = 0; i < R.BULBS; i++) R.bulbs.setColorAt(i, (i + step) % 3 === 0 ? R.bcOn : R.bcOff);
    R.bulbs.instanceColor.needsUpdate = true;
  }
  R.boardBlob.position.set(S.hoopX, 0.012, -(S.hoopZ + 0.2));

  /* balls in play */
  for (i = V.ghosts.length - 1; i >= 0; i--) {             // finished balls: a short roll, shrinking away
    const gh = V.ghosts[i];
    gh.t += fdt;
    if (gh.t >= GHOST_T) { V.ghosts.splice(i, 1); continue; }
    gh.vy -= GRAV * fdt; gh.y += gh.vy * fdt;
    if (gh.y < BALL_R) { gh.y = BALL_R; gh.vy = Math.abs(gh.vy) * 0.4; }
    const gx = gh.vx * fdt, gz = gh.vz * fdt, gd = Math.hypot(gx, gz);
    gh.x = clamp(gh.x + gx, -1.8 + BALL_R, 1.8 - BALL_R); gh.z = clamp(gh.z + gz, 0.05, S.hoopZ + 1.3);
    if (gd > 1e-5) { R.axis.set(-gz / gd, 0, -gx / gd); R.qa.setFromAxisAngle(R.axis, gd / BALL_R); gh.q.premultiply(R.qa); }
  }
  for (i = 0; i < R.balls.length; i++) {
    const o = R.balls[i], b = S.balls[i];
    if (i >= MAX_BALLS) {
      const gh = V.ghosts[i - MAX_BALLS];
      o.glow.visible = false;
      o.mesh.visible = !!gh; o.blob.visible = !!gh && !R.shadowsOn;
      if (gh) {
        const sc = Math.max(0.001, 1 - Math.pow(gh.t / GHOST_T, 2));
        o.mesh.material = gh.fire ? R.fireMat : R.ballMat;
        o.mesh.position.set(gh.x, gh.y - BALL_R * (1 - sc), -gh.z); o.mesh.quaternion.copy(gh.q); o.mesh.scale.setScalar(sc);
        o.blob.position.set(gh.x, 0.014, -gh.z); o.blob.scale.set(0.34 * sc, 1, 0.34 * sc);
      }
      continue;
    }
    if (!b) { o.mesh.visible = o.blob.visible = o.glow.visible = false; continue; }
    if (!b.q) { b.q = R.restQ.clone(); b.px = b.x; b.pz = b.z; }
    const dx = b.x - b.px, dz = b.z - b.pz, d = Math.hypot(dx, dz);
    b.px = b.x; b.pz = b.z;
    if (d > 1e-5) {
      const tx = dx / d, tz = -dz / d;
      if (b.y <= BALL_R + 0.02) { R.axis.set(tz, 0, -tx); R.qa.setFromAxisAngle(R.axis, d / BALL_R); }           // rolling on the boards
      else { R.axis.set(-tz, 0, tx); R.qa.setFromAxisAngle(R.axis, (b.touched || b.bounces ? 3 : 8.5) * fdt); }   // backspin off the fingers
      b.q.premultiply(R.qa);
    }
    o.mesh.visible = true;
    o.mesh.material = b.fire ? R.fireMat : R.ballMat;
    o.mesh.position.set(b.x, b.y, -b.z);
    o.mesh.quaternion.copy(b.q);
    o.glow.visible = !!b.fire;
    if (b.fire) { o.glow.position.copy(o.mesh.position); const gs = 0.62 + (Shell.reduced ? 0 : Math.sin(R.clock * 30 + i) * 0.06); o.glow.scale.set(gs, gs, 1); }
    o.blob.visible = !R.shadowsOn;
    if (o.blob.visible) {
      const sk = 0.34 * (1 + Math.min(4, b.y) * 0.16);
      o.blob.position.set(b.x + b.y * 0.075, 0.014, -(b.z + b.y * 0.21));
      o.blob.scale.set(sk, 1, sk);
    }
  }

  /* the rack: the ball in the cradle and the next ones rolling up behind it */
  let k = S.ready > 0 ? clamp(S.ready / 0.32, 0, 1) : 0;
  if (state !== "playing" && !S.ending) k = 0;              // the title card always finds a ball waiting
  V.feed += (k - V.feed) * Math.min(1, fdt * 30);
  k = V.feed;
  const e = k * k * (3 - 2 * k), FIRST = 0.4, PITCH = 0.255;
  for (i = 0; i < R.rackBalls.length; i++) {
    const mesh = R.rackBalls[i];
    const x = i === 0 ? e * FIRST : FIRST + (i - 1) * PITCH + e * PITCH;
    mesh.visible = i === 0 ? !S.ending || idle : true;
    mesh.position.set(HAND.x + x, HAND.y, -HAND.z);
    R.qa.setFromAxisAngle(R.zAxis, e * TAU);                // one full turn per place, so every ball comes to rest wordmark up
    R.qb.setFromAxisAngle(R.up, i === 0 ? 0 : ((i * 37) % 9 - 4) * 0.045);
    mesh.quaternion.multiplyQuaternions(R.qa, R.qb.multiply(R.restQ));
    if (i === 0 && state === "title" && !Shell.reduced) {   // show the ball off while the title card is up
      R.qa.setFromAxisAngle(R.up, Math.sin(idleT * 0.9) * 0.5);
      mesh.quaternion.premultiply(R.qa);
    }
  }

  /* camera: one seat behind the rack, framed so the board up top and the ball in the cradle both stay in the
     picture wherever the hoop is. It leans with a drifting hoop and with the ball in the air, and pushes in
     at the buzzer. */
  const gp = R.goalPos, gt = R.goalTgt;
  let px = S.hoopX * 0.1, py = CAM.y, pz = CAM.z;
  let tx = S.hoopX * 0.3, ty = CAM.ty, tz = CAM.tz, rate = 3.2;
  if (idle) {
    if (!Shell.reduced) { px += Math.sin(idleT * 0.45) * 0.3; tx += Math.sin(idleT * 0.45) * 0.08; pz += Math.sin(idleT * 0.31) * 0.08; }
    rate = 2;
  } else {
    let fb = null;                                          // the newest ball still on its way
    for (i = S.balls.length - 1; i >= 0; i--) if (!S.balls[i].scored && !S.balls[i].missed) { fb = S.balls[i]; break; }
    if (fb && !Shell.reduced) { tx += (fb.x - S.hoopX) * 0.1; px += fb.x * 0.04; ty += clamp((fb.y - 3.4) * 0.05, -0.03, 0.09); }
    if (S.ending) { V.push = Math.min(1, V.push + fdt * 0.6); pz += V.push * 0.4; rate = 2; }
  }
  gp.set(px, py, -pz); gt.set(tx, ty, -tz);
  const kk = 1 - Math.exp(-rate * fdt);
  R.camPos.lerp(gp, kk); R.camTgt.lerp(gt, kk);
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const mg = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (Math.random() * 2 - 1) * mg; sy = (Math.random() * 2 - 1) * mg;
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
function fr(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
function powerColor(p) { return p > 1 ? "#ff3b2e" : p < 0.45 ? "#3fe0ff" : p < 0.8 ? "#ffd21f" : "#ff9214"; }

// The clock is still the VCR: seven-segment green, and it still blinks 12:00 until somebody sets it.
const SEG = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg" };
function digit(c, ch, x, y, on, off) {
  const w = 12, h = 22, t = 3, segs = SEG[ch] || "";
  const map = { a: [t, 0, w - 2 * t, t], b: [w - t, t, t, h / 2 - t], c: [w - t, h / 2, t, h / 2 - t], d: [t, h - t, w - 2 * t, t],
                e: [0, h / 2, t, h / 2 - t], f: [0, t, t, h / 2 - t], g: [t, h / 2 - 1, w - 2 * t, t] };
  for (const k in map) { const mm = map[k]; fr(c, x + mm[0], y + mm[1], mm[2], mm[3], segs.indexOf(k) >= 0 ? on : off); }
}
function vcr(c, str, blinkOff) {
  const x = W / 2 - 55, y = 4;
  rrect(c, x, y, 110, 38, 4); c.fillStyle = "#0b0c10"; c.fill();
  c.lineWidth = 1; c.strokeStyle = "#ffe45c"; c.stroke();
  rrect(c, x + 4, y + 3, 102, 26, 2); c.fillStyle = "#06120a"; c.fill();
  const on = "#5dff7a", off = "#10261a";
  let cx = x + 55 - (str.length * 17 - 9) / 2 - 2;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === ":") { if (!blinkOff) { fr(c, cx + 1, y + 10, 3, 3, on); fr(c, cx + 1, y + 19, 3, 3, on); } cx += 8; continue; }
    digit(c, ch, cx, y + 5, blinkOff ? off : on, off);
    cx += 17;
  }
  txt(c, "VCR   CH 3", x + 55, y + 30, 6, "#8e93a2", "center");
}

function drawAim(c) {
  const shot = dragShot();
  let p, a, showBand = false;
  if (shot) { p = shot.p; a = shot.a; }
  else if (S.kb && !S.ending) { p = S.charging ? S.power : 0; a = S.aim; showBand = true; }
  else return;
  // the first stretch of the arc this swipe would throw, drawn through the camera
  const Rt = 0.8 + clamp(p, 0, 1.15) * 7.0, v = speedFor(Rt, RIM_Y - HAND.y), vh = v * Math.cos(LAUNCH), vy = v * Math.sin(LAUNCH);
  const col = powerColor(p), T1 = 0.2 + clamp(p, 0, 1.15) * 0.3;
  for (let t = 0.06; t <= T1 + 1e-6; t += 0.03) {
    const q = toScreen(HAND.x + Math.sin(a) * vh * t, HAND.y + vy * t - GRAV * t * t / 2, HAND.z + Math.cos(a) * vh * t);
    const end = t + 0.03 > T1 + 1e-6, r = end ? 4 : 2.9 - t * 2.2;
    c.fillStyle = "rgba(8,32,95,.6)"; c.beginPath(); c.arc(q.x, q.y, r + 1, 0, TAU); c.fill();
    c.fillStyle = end ? col : "#ffffff"; c.beginPath(); c.arc(q.x, q.y, r, 0, TAU); c.fill();
  }
  // meter
  const x = 14, top = 318, hgt = 150, pc = clamp(p, 0, 1);
  rrect(c, x - 3, top - 3, 20, hgt + 6, 6); c.fillStyle = "rgba(8,32,95,.82)"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = "#ffffff"; c.stroke();
  c.save(); rrect(c, x, top, 14, hgt, 4); c.clip();
  c.fillStyle = "#12296e"; c.fillRect(x, top, 14, hgt);
  c.fillStyle = col; c.fillRect(x, top + hgt * (1 - pc), 14, hgt * pc);
  c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(x + 2, top, 3, hgt);
  c.restore();
  if (showBand) {                                           // keyboard players get the sweet spot marked on the meter
    const ip = clamp(idealP(), 0, 1), by = top + hgt * (1 - ip);
    c.fillStyle = "rgba(182,255,74,.5)"; c.fillRect(x - 5, by - 5, 24, 10);
    c.lineWidth = 1; c.strokeStyle = "#b6ff4a"; c.strokeRect(x - 5.5, by - 5.5, 25, 11);
  }
  txt(c, "PWR", x + 7, top + hgt + 7, 9, "#ffffff", "center", "#08205f");
}

function drawHUD(c, state) {
  const bg = c.createLinearGradient(0, 0, 0, 74);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, 0, W, 74);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff9214"; c.fillRect(0, 74, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, 76, W, 1);
  // score, clock, makes
  function card(x, w, label, value, vcol) {
    rrect(c, x, 4, w, 38, 3); c.fillStyle = "#08205f"; c.fill();
    c.lineWidth = 1; c.strokeStyle = "#ffe45c"; c.stroke();
    txt(c, label, x + w / 2, 7, 8, "#a8ecff", "center");
    txt(c, value, x + w / 2, 19, 17, vcol, "center");
  }
  card(4, 112, "SCORE", String(S.score), "#ffe45c");
  const bonus = S.round === "bonus";
  card(W - 116, 112, bonus ? "BONUS MAKES" : "MAKES", String(S.makes), bonus ? "#ffe45c" : "#b6ff4a");
  const t = Math.ceil(Math.max(0, S.time || 0));
  if (state !== "playing") vcr(c, "12:00", Math.floor(idleT * 2) % 2 === 1);
  else vcr(c, Math.floor(t / 60) + ":" + ("0" + (t % 60)).slice(-2), false);
  // second row: where the hoop is, and what is live
  const lvlTxt = S.level < LEVELS.length - 1 ? "HOOP MOVES IN " + (10 - S.makes % 10) : "MAX DISTANCE";
  txt(c, (S.level === 0 ? "2 PT   " : "3 PT   ") + lvlTxt, 8, 47, 10, "#ffffff", "left", "#08205f");
  if (bonus) txt(c, "BONUS ROUND", 8, 60, 10, "#ffe45c", "left", "#08205f");
  else if (S.makes >= BONUS_NEED) txt(c, "BONUS ROUND UNLOCKED", 8, 60, 10, "#ffe45c", "left", "#08205f");
  else txt(c, "BONUS ROUND AT " + BONUS_NEED + " MAKES", 8, 60, 10, "#a8ecff", "left", "#08205f");
  if (S.fire) {
    c.globalAlpha = Shell.reduced ? 1 : 0.82 + 0.18 * Math.sin(S.t * 18);
    txt(c, "ON FIRE x2", W - 8, 47, 10, "#ffc23a", "right", "#7a1200");
    c.globalAlpha = 1;
  } else if (S.streak > 0) txt(c, "STREAK " + S.streak, W - 8, 47, 10, "#ffffff", "right", "#08205f");
  if (driftOn() && state === "playing" && !S.ending) txt(c, "HOOP ON THE MOVE", W - 8, 60, 10, "#ffc1e0", "right", "#08205f");
}

function drawFloats(c) {
  if (!floats.length) return;
  const hp = toScreen(S.hoopX, RIM_Y, S.hoopZ);
  for (let i = 0; i < floats.length; i++) {
    const f = floats[i], size = f.small ? 12 : 17;
    const x = clamp(hp.x, 70, W - 70), y = hp.y - (f.small ? 62 : 44) - f.t * 60;
    c.globalAlpha = clamp((1.1 - f.t) * 3, 0, 1);
    c.font = "bold " + size + "px " + HUD_FONT; c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round";
    c.lineWidth = size * 0.3; c.strokeStyle = "#08205f"; c.strokeText(f.txt, x, y);
    c.fillStyle = f.col; c.fillText(f.txt, x, y);
  }
  c.globalAlpha = 1;
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
    syncScene(state, state === "paused" ? 0 : Math.min(ms, 50) / 1000);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    c.globalAlpha = clamp(q.life * 3, 0, 1);
    c.fillStyle = q.c;
    if (q.kind) { c.beginPath(); c.arc(q.x, q.y, q.w, 0, TAU); c.fill(); }
    else { c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.fillRect(-q.w, -q.w * 0.6, q.w * 2, q.w * 1.2); c.restore(); }
  }
  c.globalAlpha = 1;
  drawFloats(c);
  drawHUD(c, state);
  if (state === "playing") drawAim(c);
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
  if (crt) crt.style.display = "none";                       // glossy gym, no scanlines
  R.lastT = performance.now();
  layout();
}

function startGame() {
  Shell.init({
    slug: "bargain-bin-buckets",
    title: "BARGAIN BIN BUCKETS",
    accent: "#ff3fa4",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "60 seconds, a rack of balls, and a hoop that keeps backing up, now in real 3D. Swipe up to shoot: longer swipe, more power. Angle the swipe to aim.",
    keys: "Keys: left and right aim, hold Space for power, release to shoot. P pause, M mute, R restart.",
    tip: "Hit 3 in a row to catch fire. Make 20 for a bonus round.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) {
      idleT += dt;
      const st = Shell.state();
      // secret: leave the title card alone while the VCR clock blinks 12:00
      if (st === "title" && !document.hidden) { titleT += dt; if (titleT >= 60 && window.Trophies) Trophies.unlock("bbb-clock"); }
      if (st === "over") settle(dt);
    },
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
window.__buckets = { S: function () { return S; }, shoot: shoot, idealP: idealP, stepBall: stepBall, update: update,
                     gfx: function () { return R; }, led: function () { return LED; }, view: function () { return V; }, toScreen: toScreen };

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
        ? "Bargain Bin Buckets could not load its 3D engine (" + THREE_URL + ")."
        : "Bargain Bin Buckets needs WebGL for its 3D court, and this browser has it switched off or does not support it.");
    });
})();
