/* CLUTCH BALL 4000 (3D): sixty seconds of neon arcade hoops.

   An original Nostalgia Pro Arcade game in real 3D on three.js (self-hosted, imported from
   ../shared/three.module.min.js), drawn on a WebGL canvas that sits directly under the shell's 2D
   canvas, the same way as Tape Pin Lanes, Shelf Links and Bleacher Carts. The shell canvas stays in
   charge of input, scaling and the title / pause / game over flow, and carries the HUD.

   The arena is laid out in meters. The rim's center hangs over (hoopX, 3.05, 0); late in the game the
   whole hoop rides a rail along x. The shooter works around five spots on the +z side of the court,
   one shot per spot, so every five shots make a lap. The camera rides over his shoulder.

   Rules
     60 seconds on the clock. Hold anywhere to charge the meter, let go inside the green to shoot.
     Once the hoop starts to move, drag sideways while you hold (or use the arrow keys) to lead it.
     2, 3 or 4 points by spot, +1 for a swish. Makes in a row build a combo: x2 at 3, x3 at 6, x4 at 10.
     Special balls come up in the rack: GOLD doubles the shot, CHRONO adds 5 seconds, MAGNET widens the
     green and pulls close shots in for 7 seconds.
     Make all five spots in one lap: PERFECT LAP, +20 and 4 more seconds.
     Now and then a bonus drone crosses the shot: put a ball through its ring for +10 and 3 more seconds.
     The last 12 seconds are CLUTCH TIME: every bucket counts double. A ball in the air at the horn still counts (+5).
     Make 20 and the horn brings 15 seconds of OVERTIME, played under clutch rules.

   Trophy ids (add them to shared/trophy-list.js):
     cb4k-swish  Nothing But Neon      a swish
     cb4k-hyper  Hyperdrive            reach the x4 combo
     cb4k-lap    Perfect Lap           make all five spots in one lap
     cb4k-zap    Drone Zapper          put a ball through the bonus drone
     cb4k-deep   From 4000             make the 4000 spot with a gold ball
     cb4k-buzzer Beat The Horn         a buzzer beater
     cb4k-ot     Free Basketball       reach overtime                                                   */

const W = 360, H = 540, TAU = Math.PI * 2, DEG = Math.PI / 180;

/* ---------------- The arena (meters) ---------------- */
const GRAV = 9.8, BALL_R = 0.12, RIM_R = 0.23, RIM_Y = 3.05, TUBE = 0.022;
const BOARD_Z = -(RIM_R + 0.15), BOARD_HW = 0.9, BOARD_Y0 = 2.85, BOARD_Y1 = 4.1;
const BASELINE = -1.58, SIDELINE = 7.5, RAIL_Z = -1.78;
const WALL_Z = -4.5;                                     // the front of the stands behind the baseline
const PS = 0.319;                                        // the shooter is posed in feet; this stands him about 2.0 m tall
const REL = [-0.18, 7.35, 0.72], JUMP0 = 0.2;           // the ball's center as it leaves his hand (his space, feet), and his height off the floor then
const AIM_DEEP = 0.04;                                   // aim a hair past the rim's center so the front iron stays clear
const ROWS = 9, TREAD = 0.85, RISE = 0.48, FRONT_H = 1.0;   // the stands
const STAND_TOP = FRONT_H + (ROWS - 1) * RISE, PARA_K = ROWS * TREAD + 0.05;
const LED_Y0 = 6.75, LED_HT = 1.7;                       // the ribbon board on the parapet above the stands

/* ---------------- Rules ---------------- */
const ROUND_TIME = 60, OT_TIME = 15, OT_NEED = 20, MOVE_AT = 40, CLUTCH_AT = 12;
const SPOTS = [
  { a: -47, r: 4.4, pts: 2, name: "LEFT BLOCK" },
  { a: -31, r: 6.9, pts: 3, name: "LEFT WING" },
  { a: 0, r: 8.3, pts: 4, name: "4000 SPOT" },
  { a: 31, r: 6.9, pts: 3, name: "RIGHT WING" },
  { a: 47, r: 4.4, pts: 2, name: "RIGHT BLOCK" }
];
const METER_T = 1.4;                                     // seconds for the meter to run from empty to full
const FRINGE = 0.06, AUTO_LEAD = 0.4;                    // just outside the green still rattles in now and then; the shot leads a moving hoop part way by itself
const SPAWN_T = 0.16, DASH_AT = 0.4;
const TIER_NAMES = ["", "CHARGED x2", "SUPERCHARGED x3", "HYPERDRIVE x4"];
const TIER_COLS = ["#ffffff", "#3ff0ff", "#ff3fd8", "#ffd23f"];
const MAGNET_T = 7, CHRONO_ADD = 5, LAP_PTS = 20, LAP_TIME = 4, ZAP_PTS = 10, ZAP_TIME = 3, BEATER_PTS = 5;
// the balls: base / dark / seam / neon line colors for the painted ball, and the HUD's color and words for it
const KINDS = {
  std: { col: "#ff8a2a", base: "#f07a22", dark: "#b8460e", seam: "#170a33", line: "#3ff0ff", glow: 0x3ff0ff, name: "", tag: "" },
  gold: { col: "#ffd23f", base: "#ffd24a", dark: "#c98a0c", seam: "#3a2200", line: "#fff6c8", glow: 0xffd23f, name: "GOLD BALL", tag: "DOUBLE POINTS" },
  chrono: { col: "#3ff0ff", base: "#3fe6ff", dark: "#0b7fb0", seam: "#04163a", line: "#ffffff", glow: 0x3ff0ff, name: "CHRONO BALL", tag: "+5 SECONDS" },
  magnet: { col: "#ff3fd8", base: "#ff52dc", dark: "#a1128a", seam: "#2a0430", line: "#ffffff", glow: 0xff3fd8, name: "MAGNET BALL", tag: "BIG GREEN" }
};

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash, title card and score card
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every decal inside the arena
const THREE_URL = "../shared/three.module.min.js";
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';
const CONF_COLS = ["#3ff0ff", "#ff3fd8", "#ffd23f", "#9bff3f", "#ff8a2a", "#ffffff"];

let S = {}, keys = {}, idleT = 0, parts = [], floats = [], paused = false;
let THREE = null, R = null, TV = null;                    // R holds everything the renderer owns
// V is how things are being shown (poses, the camera, flashes). It never feeds the rules.
const V = { px: 0, pz: 8.3, yaw: Math.PI, netT: 0, rimFlash: 0, cheer: 0, cheerT: 0, handOK: false, boom: null, ring: 0, ledScore: 0,
            trailT: 0, lastClock: "", dashGlow: 0 };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, k) { return a + (b - a) * k; }
function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
function trophy(id) { try { if (window.Trophies) window.Trophies.unlock(id); } catch (e) { /* the shelf is optional */ } }

function reset() {
  paused = false;
  S = { t: 0, time: ROUND_TIME, round: "main", score: 0, makes: 0, shots: 0, swishes: 0, streak: 0, bestStreak: 0,
        perfectLaps: 0, zaps: 0, beaters: 0, deepMakes: 0, otDone: false, clutch: false, moveSaid: false,
        at: 0, hand: false, spawn: -0.35, dash: null, relT: 9, holdT: 0,
        charging: false, chargeT: 0, power: 0, lead: 0, ptr: null, queued: false, kbCharge: false,
        cur: "std", queue: ["std", "std", "std"], kindN: 0, sinceSpecial: 0, magnetT: 0,
        hoopX: 0, hoopAmp: 0, hoopPh: 0, lapId: 0, laps: {},
        balls: [], drone: null, droneIn: 8, misses: 0, lastQuip: -9, ending: false, endT: 0 };
  parts.length = 0; floats.length = 0;
  const p = spotXZ(0);
  V.px = p.x; V.pz = p.z; V.netT = 0; V.rimFlash = 0; V.boom = null; V.ledScore = 0; V.cheer = 0; V.cheerT = 0;
  ledClear();
}

/* ---------------- Shot geometry ---------------- */
function spotXZ(i) { const s = SPOTS[i]; return { x: s.r * Math.sin(s.a * DEG), z: s.r * Math.cos(s.a * DEG) }; }
// Where the ball leaves his hand at spot i: he faces the middle of the hoop's rail.
function relPoint(i) {
  const p = spotXZ(i), yaw = Math.atan2(-p.x, -p.z), c = Math.cos(yaw), s = Math.sin(yaw);
  const lx = REL[0] * PS, lz = REL[2] * PS;
  return { x: p.x + lx * c + lz * s, y: REL[1] * PS + JUMP0, z: p.z - lx * s + lz * c };
}
function launchAngle(D) { return clamp(58 - (D - 4) * 1.7, 50, 58) * DEG; }
// Launch speed that carries the ball a horizontal distance D up a height h at angle th.
function speedFor(D, h, th) {
  const c = Math.cos(th), den = 2 * c * c * (D * Math.tan(th) - h);
  if (den <= 0.01) return 14;
  return Math.sqrt(GRAV * D * D / den);
}
function plan(from, tx, tz, ty) {
  const dx = tx - from.x, dz = tz - from.z, D = Math.max(0.5, Math.hypot(dx, dz)), th = launchAngle(D);
  const v = speedFor(D, ty - from.y, th), vh = v * Math.cos(th);
  return { vx: dx / D * vh, vy: v * Math.sin(th), vz: dz / D * vh, T: D / vh };
}
function hoopOmega() { return S.clutch ? 1.15 : 0.85; }
function hoopAmpGoal() {
  if (S.round === "ot" || S.clutch) return 1.25;
  return S.time <= MOVE_AT ? 0.9 : 0;
}
function hoopXAt(dt) { return S.hoopAmp * Math.sin(S.hoopPh + hoopOmega() * dt); }
// The green part of the meter for the spot he is on.
function zone() {
  const k = (SPOTS[S.at].r - 4.3) / 4.0;
  let h = (0.085 - 0.022 * k) * 1.5;
  if (S.clutch) h *= 0.92;
  if (S.magnetT > 0) h *= 1.5;
  return { c: 0.5 + 0.32 * k, h: Math.min(0.24, h) };
}
function tierOf(n) { return n >= 10 ? 3 : n >= 6 ? 2 : n >= 3 ? 1 : 0; }
function nextKind() {
  S.kindN++; S.sinceSpecial++;
  if (S.kindN < 4 || S.sinceSpecial < 4 || Math.random() > 0.2) return "std";
  S.sinceSpecial = 0;
  const r = Math.random();
  return r < 0.4 ? "gold" : r < 0.72 ? "chrono" : "magnet";
}

/* ---------------- Shooting ---------------- */
function canShoot() { return S.hand && !S.dash && !S.ending; }
function startCharge(kb) { S.charging = true; S.chargeT = 0; S.power = 0; S.kbCharge = !!kb; S.queued = false; }

function release() {
  const p = S.power, held = S.chargeT;
  S.charging = false; S.kbCharge = false;
  if (held < 0.07) return;                                // a stray tap is not a shot
  shoot(p, S.lead);
}

function shoot(p, lead) {
  if (!canShoot()) return null;
  const i = S.at, sp = SPOTS[i], from = relPoint(i), z = zone(), mag = S.magnetT > 0;
  // where the hoop will be when the ball gets there
  let pl = plan(from, S.hoopX, 0, RIM_Y), hx = hoopXAt(pl.T);
  pl = plan(from, hx, 0, RIM_Y); hx = hoopXAt(pl.T);
  const dx = hx - from.x, dz = -from.z, D = Math.hypot(dx, dz), ux = dx / D, uz = dz / D;
  // power: inside the green is a make, the middle of it a swish; just outside rattles the iron
  const e = p - z.c, ae = Math.abs(e), perfect = ae < z.h * 0.45;
  let depth;
  if (perfect) depth = 0;
  else if (ae <= z.h) { const u = (ae - z.h * 0.45) / (z.h * 0.55); depth = mag ? e * 0.5 : e > 0 ? 0.1 + 0.025 * u : -(0.04 + 0.015 * u); }   // the outer green rattles in off the iron
  else if (ae < z.h + FRINGE && Math.random() < 0.9 - 0.65 * (ae - z.h) / FRINGE) depth = e > 0 ? 0.12 : -0.08;   // a near miss: off the iron and in
  else depth = e > 0 ? Math.min(0.33, 0.2 + (ae - z.h) * 3) : -(0.2 + (ae - z.h) * 4.2);   // long ones die on the back iron, short ones fall off the front
  // aim: at where the hoop is now, plus the lead; a near miss gets pulled most of the way in
  let side = S.hoopX + lead + AUTO_LEAD * (hx - S.hoopX) - hx;
  if (Math.abs(side) < (mag ? 1.0 : 0.7)) side *= mag ? 0.05 : 0.15;
  const tx = hx + ux * (depth + AIM_DEEP) + side, tz = uz * (depth + AIM_DEEP);
  const f = plan(from, tx, tz, RIM_Y);
  const b = { x: from.x, y: from.y, z: from.z, vx: f.vx, vy: f.vy, vz: f.vz, kind: S.cur, spot: i, base: sp.pts, lap: S.lapId,
              clutch: S.clutch, perfect: perfect, touched: false, scored: false, missed: false, zapped: false, t: 0, bounces: 0, lastRim: -1,
              vis: null, trail: [] };
  S.balls.push(b);
  S.shots++;
  S.hand = false; S.relT = 0; S.holdT = 0;
  S.cur = S.queue.shift(); S.queue.push(nextKind());
  if (i === SPOTS.length - 1) S.lapId++;
  Shell.sfx("whoosh");
  return b;
}

function startDash() {
  const from = S.at, to = (S.at + 1) % SPOTS.length, a = spotXZ(from), c = spotXZ(to);
  S.dash = { from: from, to: to, t: 0, dur: 0.26 + Math.hypot(c.x - a.x, c.z - a.z) * 0.035 };
  Snd.sfx("dash");
}

/* ---------------- Ball flight ---------------- */
function stepBall(b, dt) {
  const hx = S.hoopX, py = b.y;
  b.vy -= GRAV * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  // the rim: a ring of points
  if (Math.abs(b.y - RIM_Y) < 0.4 && Math.abs(b.z) < 0.6 && Math.abs(b.x - hx) < 0.6) {
    const rr = BALL_R + TUBE;
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * TAU, px = hx + Math.cos(a) * RIM_R, pz = Math.sin(a) * RIM_R;
      const dx = b.x - px, dy = b.y - RIM_Y, dz = b.z - pz, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < rr && d > 1e-5) {
        const nx = dx / d, ny = dy / d, nz = dz / d, pen = rr - d;
        b.x += nx * pen; b.y += ny * pen; b.z += nz * pen;
        const vn = b.vx * nx + b.vy * ny + b.vz * nz;
        if (vn < 0) {
          b.vx -= 1.55 * vn * nx; b.vy -= 1.55 * vn * ny; b.vz -= 1.55 * vn * nz;
          if (-vn > 0.7 && b.t - b.lastRim > 0.08) { b.lastRim = b.t; Shell.sfx("rim"); V.rimFlash = Math.max(V.rimFlash, 0.6); }
          b.touched = true;
        }
      }
    }
  }
  // the glass
  if (b.vz < 0 && b.z - BALL_R < BOARD_Z && b.z > BOARD_Z - 0.12 && Math.abs(b.x - hx) < BOARD_HW + 0.02 && b.y > BOARD_Y0 - 0.06 && b.y < BOARD_Y1 + 0.06) {
    b.z = BOARD_Z + BALL_R; b.vz = -b.vz * 0.55; b.vx *= 0.9;
    b.touched = true;
    Shell.sfx("hit");
  }
  // through the hoop
  if (!b.scored && !b.missed && py > RIM_Y && b.y <= RIM_Y && b.vy < 0 && Math.hypot(b.x - hx, b.z) < RIM_R - BALL_R * 0.35) {
    b.scored = true;
    made(b);
  }
  // the net holds a made ball for a moment
  if (b.scored && b.y < RIM_Y && b.y > RIM_Y - 0.5) {
    const k = Math.exp(-7 * dt);
    b.vx *= k; b.vz *= k;
    b.x += (hx - b.x) * Math.min(1, dt * 9); b.z += (0 - b.z) * Math.min(1, dt * 9);
  }
  // the bonus drone
  const d = S.drone;
  if (d && !d.hit && !b.zapped && !b.scored && Math.hypot(b.x - d.x, b.y - d.y, b.z - d.z) < 0.42) zap(b);
  // floor, the walls of the stands
  if (b.y < BALL_R) {
    b.y = BALL_R;
    if (b.vy < 0) { if (b.vy < -2.5) Snd.sfx("bounce", Math.min(1, -b.vy / 8)); b.vy = -b.vy * 0.58; b.vx *= 0.82; b.vz *= 0.82; b.bounces++; }
    if (!b.scored && !b.missed) { b.missed = true; missed(b); }
  }
  if (b.z < WALL_Z + BALL_R) { b.z = WALL_Z + BALL_R; b.vz = Math.abs(b.vz) * 0.4; }
  if (Math.abs(b.x) > 9.3) { b.x = Math.sign(b.x) * 9.3; b.vx = -b.vx * 0.4; }
}

function made(b) {
  const swish = !b.touched;
  S.makes++; S.streak++;
  S.bestStreak = Math.max(S.bestStreak, S.streak);
  const was = tierOf(S.streak - 1), tier = tierOf(S.streak), late = S.ending;
  let pts = (b.base + (swish ? 1 : 0)) * (tier + 1);
  if (b.kind === "gold") pts *= 2;
  if (b.clutch) pts *= 2;
  if (late) { pts += BEATER_PTS; S.beaters++; trophy("cb4k-buzzer"); }
  S.score += pts;
  if (swish) { S.swishes++; trophy("cb4k-swish"); }
  if (b.spot === 2) { S.deepMakes++; if (b.kind === "gold") trophy("cb4k-deep"); }
  V.netT = 1; V.rimFlash = 1;
  cheer(tier >= 2 || swish ? 1.4 : 0.9);
  Shell.sfx(swish ? "swish" : "score");
  if (swish) Shell.sfx("score");
  const board = [];
  if (late) board.push(ledMsg("flash", "BUZZER BEATER", 1.6));
  else if (swish) board.push(ledMsg("flash", "SWISH!", 1.0));
  // what the ball brings with it
  const k = KINDS[b.kind];
  if (b.kind === "gold") { Snd.sfx("gold"); board.push(ledMsg("slide", "GOLD BALL x2", 1.3, { color: "yellow", keep: true })); }
  if (b.kind === "chrono") { S.time += CHRONO_ADD; Snd.sfx("chrono"); board.push(ledMsg("slide", "+5 SECONDS", 1.3, { color: "cyan", keep: true })); floatText("+5 SEC", k.col, 0.3); }
  if (b.kind === "magnet") { S.magnetT = MAGNET_T; Snd.sfx("magnet"); board.push(ledMsg("slide", "MAGNET RIM", 1.3, { color: "pink", keep: true })); floatText("MAGNET RIM", k.col, 0.3); }
  if (tier > was) {
    Snd.sfx("combo", tier);
    board.push(ledMsg("cycle", TIER_NAMES[tier], 1.6, { keep: true }));
    Shell.flash(TIER_NAMES[tier], tier === 3 ? "Every bucket is worth four times." : "Keep it going.", TIER_COLS[tier], 1000);
    if (tier === 3) trophy("cb4k-hyper");
  }
  if (window.NPRewards && (tier > was || (S.streak > 10 && S.streak % 5 === 0))) {
    try { window.NPRewards.streak(S.streak, S.streak >= 10 ? S.streak + " STRAIGHT!" : ""); } catch (e) { /* optional */ }
  }
  board.push(ledMsg("count", "SCORE", 1.5, { from: V.ledScore, value: S.score, keep: true }));
  V.ledScore = S.score;
  ledPlay(board);
  floatText((late ? "BEATER " : swish ? "SWISH " : "") + "+" + pts, swish ? "#9bff3f" : b.kind === "std" ? "#ffffff" : k.col, 0);
  burstAtWorld(S.hoopX, RIM_Y, 0, b.kind === "std" ? (swish ? 26 : 14) : 34);
  lapNote(b, true);
}

function missed(b) {
  const had = S.streak;
  S.streak = 0; S.misses++;
  Shell.sfx("miss");
  if (had >= 3) {
    floatText("COMBO LOST", "#ff5a5a", 0.2, true);
    ledPlay([ledMsg("blink", "COMBO LOST", 1.2, { color: "red" })]);
  } else if (S.t - S.lastQuip > 5 && S.misses % 3 === 0) {
    S.lastQuip = S.t;
    const q = ["OFF THE IRON", "BRICK.", "NOT IN 4000 YEARS"];
    floatText(q[Math.floor(S.misses / 3) % q.length], "#8e93c2", 0.2, true);
  }
  lapNote(b, false);
}

function lapNote(b, ok) {
  const L = S.laps[b.lap] || (S.laps[b.lap] = { n: 0, m: 0 });
  L.n++; if (ok) L.m++;
  if (L.n === SPOTS.length && L.m === SPOTS.length) {
    S.perfectLaps++; S.score += LAP_PTS; S.time += LAP_TIME;
    trophy("cb4k-lap");
    Shell.flash("PERFECT LAP", "+" + LAP_PTS + " and " + LAP_TIME + " more seconds.", "#9bff3f", 1300);
    Snd.sfx("lap"); cheer(1.6);
    ledPlay([ledMsg("cycle", "PERFECT LAP +" + LAP_PTS, 1.8, { keep: true }), ledMsg("count", "SCORE", 1.4, { from: V.ledScore, value: S.score, keep: true })], true);
    V.ledScore = S.score;
  }
}

function zap(b) {
  const d = S.drone;
  d.hit = true; b.zapped = true;
  S.zaps++; S.score += ZAP_PTS; S.time += ZAP_TIME;
  trophy("cb4k-zap");
  Snd.sfx("zap"); cheer(1.2);
  V.boom = { x: d.x, y: d.y, z: d.z, t: 0 };
  burstAtWorld(d.x, d.y, d.z, 40);
  floatText("DRONE ZAP +" + ZAP_PTS, "#ffd23f", 0.5);
  ledPlay([ledMsg("flash", "DRONE ZAP!", 1.2), ledMsg("slide", "+" + ZAP_TIME + " SECONDS", 1.2, { color: "cyan", keep: true })]);
}

/* ---------------- The bonus drone ---------------- */
// It crosses on the line of the shot from where he stands, slowing as it passes the middle.
function droneAt(d, t) {
  const u = clamp(t / d.dur, 0, 1), w = 2 * u - 1;
  return d.mid + d.dir * 4.6 * w * w * w;
}
function updateDrone(dt) {
  const d = S.drone;
  if (!d) {
    if (S.ending) return;
    S.droneIn -= dt;
    if (S.droneIn <= 0 && S.hand) {
      S.drone = { t: 0, dur: 4.2, dir: Math.random() < 0.5 ? -1 : 1, x: 0, y: 4, z: 3, mid: 0, hit: false, gone: 0 };
      Snd.sfx("drone");
      floatText("BONUS DRONE", "#ffd23f", 0.6, true);
      placeDrone(S.drone, 1);
    }
    return;
  }
  d.t += dt;
  if (d.hit) { d.gone += dt; if (d.gone > 0.7) { S.drone = null; S.droneIn = 10 + Math.random() * 4; } return; }
  placeDrone(d, Math.min(1, dt * 3));
  if (d.t >= d.dur) { S.drone = null; S.droneIn = 9 + Math.random() * 4; }
}
function placeDrone(d, k) {
  // the middle of the shot from the spot he is standing on (or dashing to)
  const at = S.dash ? S.dash.to : S.at, from = relPoint(at), pl = plan(from, S.hoopX, 0, RIM_Y), u = 0.74;
  const mx = from.x + pl.vx * pl.T * u, mz = from.z + pl.vz * pl.T * u, my = from.y + pl.vy * pl.T * u - 0.5 * GRAV * Math.pow(pl.T * u, 2);
  d.mid += (mx - d.mid) * k; d.y += (my + 0.05 - d.y) * k; d.z += (mz - d.z) * k;
  d.x = droneAt(d, d.t);
}

/* ---------------- Flow ---------------- */
function update(dt) {
  S.t += dt;
  if (!S.ending) S.time -= dt;
  S.relT += dt;
  // the hoop starts to slide with 40 seconds left, faster in clutch time
  S.hoopAmp += (hoopAmpGoal() - S.hoopAmp) * Math.min(1, dt * 0.9);
  S.hoopPh += hoopOmega() * dt;
  S.hoopX = S.hoopAmp * Math.sin(S.hoopPh);
  if (S.magnetT > 0) S.magnetT = Math.max(0, S.magnetT - dt);
  if (S.round === "main" && !S.moveSaid && S.time <= MOVE_AT) {
    S.moveSaid = true;
    Shell.flash("HOOP ON THE MOVE", "Drag sideways while you hold to lead it.", "#3ff0ff", 1400);
    ledPlay([ledMsg("slide", "HOOP ON THE MOVE", 1.8, { color: "cyan" })]);
    Snd.sfx("rail");
  }
  if (S.round === "main" && !S.clutch && S.time <= CLUTCH_AT) {
    S.clutch = true;
    Shell.flash("CLUTCH TIME", "Every bucket counts double.", "#ff3fd8", 1400);
    ledPlay([ledMsg("flash", "CLUTCH TIME", 1.5), ledMsg("blink", "ALL BUCKETS x2", 1.6, { color: "pink" })]);
    Snd.sfx("clutch"); cheer(1);
  }

  // the shooter: shot, landing, dash to the next spot, a new ball beamed into his hands
  if (S.hand) S.holdT += dt;
  else if (S.dash) {
    S.dash.t += dt;
    if (S.dash.t >= S.dash.dur) { S.at = S.dash.to; S.dash = null; S.spawn = 0; Snd.sfx("teleport"); }
  } else if (S.spawn !== null) {
    S.spawn += dt;
    if (S.spawn >= SPAWN_T) { S.spawn = null; S.hand = true; S.holdT = 0; }
  } else if (S.relT >= DASH_AT && !S.ending) startDash();

  if (S.queued && canShoot()) startCharge(false);
  if (S.charging) {
    if (S.ending) S.charging = false;
    S.chargeT += dt;
    const ph = (S.chargeT / METER_T) % 2;
    S.power = ph < 1 ? ph : 2 - ph;
  }
  const turn = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
  if (turn) S.lead = clamp(S.lead + turn * 1.4 * dt, -1.6, 1.6);

  for (let i = S.balls.length - 1; i >= 0; i--) {
    const b = S.balls[i];
    b.t += dt;
    for (let k = 0; k < 6; k++) stepBall(b, dt / 6);
    if (b.t > 4.5 || b.bounces > 3) {
      if (!b.scored && !b.missed) { b.missed = true; missed(b); }
      S.balls.splice(i, 1);
    }
  }
  updateDrone(dt);
  updateFx(dt);

  // the horn
  if (!S.ending && S.time <= 0) {
    S.time = 0;
    if (S.round === "main" && S.makes >= OT_NEED && !S.otDone) {
      S.round = "ot"; S.otDone = true; S.time = OT_TIME; S.clutch = true;
      trophy("cb4k-ot");
      Shell.flash("OVERTIME", OT_TIME + " more seconds. Clutch rules.", "#ffd23f", 1500);
      ledPlay([ledMsg("cycle", "OVERTIME", 1.8, { keep: true })]);
      Snd.sfx("horn"); Shell.sfx("best"); cheer(1.5);
    } else {
      S.ending = true; S.endT = 0;
      S.charging = false; S.queued = false;
      Shell.sfx("buzzer"); Snd.sfx("horn");
      Shell.flash("TIME!", S.round === "main" && S.makes < OT_NEED ? "Make " + OT_NEED + " to earn overtime." : "", "#ff3fd8", 1200);
      ledPlay([ledMsg("blink", "TIME!", 1.4, { color: "red" })]);
    }
  }
  if (S.ending) {
    S.endT += dt;
    const flying = S.balls.some(function (b) { return !b.scored && !b.missed; });
    if (S.endT > 1.4 && (!flying || S.endT > 3.2)) finish();
  }
}

function finish() {
  const pct = S.shots ? Math.round(S.makes / S.shots * 100) : 0;
  ledFinal(S.score);
  Shell.gameOver(S.score, { title: "FINAL HORN", html:
    row("Buckets", S.makes + " of " + S.shots + " (" + pct + "%)") +
    row("Swishes", S.swishes) +
    row("Best combo", S.bestStreak + " in a row") +
    row("Perfect laps", S.perfectLaps) +
    row("Drone zaps", S.zaps) +
    row("Overtime", S.otDone ? "Earned" : "Make " + OT_NEED),
    stats: { score: S.score, makes: S.makes, shots: S.shots, swishes: S.swishes, bestStreak: S.bestStreak, laps: S.perfectLaps,
             zaps: S.zaps, beaters: S.beaters, deep: S.deepMakes, ot: S.otDone } });
}
function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

/* ---------------- Particles and float text (drawn on the HUD, placed through the 3D camera) ---------------- */
function burstAtWorld(x, y, z, n) {
  if (Shell.reduced) n = Math.ceil(n / 3);
  const p = R ? toScreen(x, y, z) : { x: W / 2, y: 200 };
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 50 + Math.random() * 170;
    parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 90, life: 0.8 + Math.random() * 0.5, c: CONF_COLS[i % CONF_COLS.length],
                 rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14 });
  }
}
function floatText(txt, col, delay, small) { floats.push({ txt: txt, col: col, t: -(delay || 0), small: !!small }); }
function cheer(k) { V.cheerT = Math.max(V.cheerT, k); }
function updateFx(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 220 * dt; q.rot += q.vr * dt;
    if (q.life <= 0) parts.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; if (floats[i].t > 1.2) floats.splice(i, 1); }
}

/* ---------------- Input ---------------- */
// Hold anywhere to charge; drag sideways while holding to lead the hoop; let go to shoot.
function pointer(type, x) {
  if (type === "down") {
    S.ptr = { sx: x };
    S.lead = 0;
    if (canShoot()) startCharge(false); else if (!S.ending) S.queued = true;   // pressed early: it charges the moment the ball arrives
  } else if (type === "move" && S.ptr) {
    S.lead = clamp((x - S.ptr.sx) / 110, -1.6, 1.6);
  } else if (type === "up" || type === "cancel") {
    S.ptr = null; S.queued = false;
    if (type === "cancel") { if (!S.kbCharge) S.charging = false; return; }
    if (S.charging && !S.kbCharge) release();
  }
}
function key(type, code, e) {
  const act = code === "Space" || code === "Enter" || code === "NumpadEnter";
  if (type === "down") {
    keys[code] = true;
    if (act && !e.repeat && !S.charging) { if (canShoot()) startCharge(true); }
    if (code === "ArrowDown" || code === "ArrowUp") S.lead = 0;
  } else {
    keys[code] = false;
    if (act && S.charging && S.kbCharge) release();
  }
}

/* =====================================================================================
   Sound: the house band and the stingers
   ===================================================================================== */

/* The music: an original synthwave loop in A minor, sixteen bars (lead, bass, arpeggio, pad, drums), all made
   in code with the Web Audio API. Self-contained: it knows nothing about the game. Give it an AudioContext and
   a node to play into; it returns a function that stops it. */
function startMusic(ctx, dest) {
  const BPM = 118, STEP = 60 / BPM / 4, BARS = 16, STEPS = BARS * 16, AHEAD = 0.4;
  // one chord a bar: bass root, then the three notes the arpeggio walks (MIDI numbers)
  const CH = { Am: [45, 69, 72, 76], F: [41, 65, 69, 72], C: [48, 67, 72, 76], G: [43, 67, 71, 74], E: [40, 68, 71, 76],
               Em: [40, 67, 71, 76], Dm: [38, 65, 69, 74] };
  const PROG = "Am F C G Am F G E F G Em Am Dm F G E".split(" ");
  // the tune, a bar a line: step in the bar, note, length in steps
  const TUNE = [
    "0A4-2 2C5-2 4E5-3 7D5-1 8C5-2 10E5-2 12A5-4",
    "0A5-2 2G5-1 3F5-1 4E5-2 6C5-2 8F5-3 11E5-1 12C5-4",
    "0G4-2 2C5-2 4E5-2 6G5-2 8E5-3 11D5-1 12C5-2 14E5-2",
    "0D5-3 3B4-1 4D5-2 6G5-2 8B5-6 14A5-1 15G5-1",
    "0A5-3 3G5-1 4E5-2 6C5-2 8D5-2 10E5-2 12A4-4",
    "0C5-2 2F5-2 4A5-2 6C6-2 8A5-3 11G5-1 12F5-4",
    "0G5-2 2B5-2 4D6-4 8C6-2 10B5-2 12G5-4",
    "0G#5-3 3E5-1 4B5-4 8G#5-2 10F#5-2 12E5-4",
    "0F5-4 4A5-2 6C6-2 8E6-6 14D6-1 15C6-1",
    "0B5-4 4D6-2 6B5-2 8G5-4 12A5-2 14B5-2",
    "0E5-2 2G5-2 4B5-2 6E6-2 8D6-3 11B5-1 12G5-4",
    "0A5-6 6C6-2 8E6-4 12A5-4",
    "0F5-2 2A5-2 4D6-4 8C6-2 10A5-2 12F5-4",
    "0A5-2 2C6-2 4F6-4 8E6-2 10C6-2 12A5-4",
    "0B5-2 2D6-2 4G6-3 7F6-1 8E6-2 10D6-2 12B5-4",
    "0E6-2 2D6-1 3C6-1 4B5-2 6G#5-2 8E5-4 12B4-2 14E5-2"
  ];
  const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }, lead = new Array(STEPS).fill(null);
  TUNE.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(#?)(\d)-(\d+)$/.exec(tok);
      if (m) lead[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + semis[m[2]] + (m[3] ? 1 : 0), Number(m[5])];
    });
  });
  function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  // the mixer
  const out = ctx.createGain(); out.gain.value = 0; out.connect(dest);
  out.gain.setTargetAtTime(1, ctx.currentTime + 0.02, 0.05);
  function filt(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const leadBus = filt("lowpass", 2600, 1.4, out), bassBus = filt("lowpass", 700, 2.2, out), padBus = filt("lowpass", 1300, 0.6, out);
  const arpBus = filt("bandpass", 1800, 0.7, out), drumBus = ctx.createGain(); drumBus.gain.value = 1; drumBus.connect(out);
  const send = ctx.createGain(), echo = ctx.createDelay(1), back = ctx.createGain(), wet = filt("lowpass", 2000, 0.7, out);
  send.gain.value = 0.28; echo.delayTime.value = STEP * 3; back.gain.value = 0.35;          // a dotted-eighth echo on the lead and arpeggio
  leadBus.connect(send); arpBus.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(wet);
  const nlen = Math.floor(ctx.sampleRate * 1.5), noise = ctx.createBuffer(1, nlen, ctx.sampleRate), nd = noise.getChannelData(0);
  let seed = 0x1234567;
  for (let i = 0; i < nlen; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; nd[i] = ((seed >>> 0) / 4294967296) * 2 - 1; }

  function tone(to, type, f0, t, dur, vol, f1, hold, detune) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.01, dur * (hold == null ? 0.6 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (detune) o.detune.value = detune;
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, h);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(to, t, dur, vol, type, f, q) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(to);
    s.start(t, (t * 7.31) % 1); s.stop(t + dur + 0.05);
  }
  function playStep(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[bar]], n = lead[i], late = bar >= 8;
    if (n) {                                               // the lead: two saws a hair apart
      const d = n[1] * STEP * 0.95;
      tone(leadBus, "sawtooth", mtof(n[0]), t, d, 0.085, 0, 0.7, -7);
      tone(leadBus, "sawtooth", mtof(n[0]), t, d, 0.085, 0, 0.7, 7);
    }
    if (!(s & 1)) tone(bassBus, "square", mtof(ch[0] + (s % 4 === 2 ? 12 : 0)), t, STEP * 1.8, 0.2, 0, 0.5);   // driving octave bass
    tone(arpBus, "triangle", mtof(ch[1 + [0, 1, 2, 1][s & 3]] + (late && s >= 8 ? 12 : 0)), t, STEP * 0.9, 0.07, 0, 0.3);
    if (s === 0) {                                         // the pad, one chord a bar
      for (let k = 1; k < 4; k++) tone(padBus, "sawtooth", mtof(ch[k] - 12), t, STEP * 16, 0.028, 0, 0.85, k * 5 - 10);
    }
    // drums: four on the floor, a big snare on two and four, hats on the eighths
    if (s % 4 === 0) tone(drumBus, "sine", 150, t, 0.22, 0.6, 42, 0.05);
    if (s === 4 || s === 12) { hiss(drumBus, t, 0.24, 0.26, "bandpass", 1700, 0.6); tone(drumBus, "triangle", 190, t, 0.1, 0.18, 120, 0.1); }
    if (s % 2 === 0) hiss(drumBus, t, s % 4 === 2 ? 0.09 : 0.035, s % 4 === 2 ? 0.07 : 0.045, "highpass", 8000, 0.7);
    const fill = (bar === 7 || bar === 15) && s >= 12;
    if (fill) hiss(drumBus, t, 0.1, 0.15 + (s - 12) * 0.04, "bandpass", 1200 + (s - 12) * 300, 0.8);
  }

  let step = 0, nextT = ctx.currentTime + 0.06, dead = false;
  function pump() {
    if (dead) return;
    const now = ctx.currentTime;
    if (nextT < now - 0.2) nextT = now + 0.05;            // after a stall (a background tab), pick the beat up again
    while (nextT < now + AHEAD) { playStep(step, nextT); step = (step + 1) % STEPS; nextT += STEP; }
  }
  pump();
  const timer = setInterval(pump, 50);
  return function stop() {
    if (dead) return;
    dead = true; clearInterval(timer);
    const now = ctx.currentTime;
    out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(out.gain.value, now); out.gain.setTargetAtTime(0, now, 0.05);
    setTimeout(function () { try { out.disconnect(); } catch (e) { /* already gone */ } }, 700);
  };
}

/* The rest of the sound: one AudioContext, made on the first tap, click or key press. The shell plays its own
   effects as always; this adds the band and the game's own stingers, follows the shell's mute button and keeps
   a music on/off setting (npArcade.music) that is remembered. */
const MUSIC_VOL = 0.16, SFX_VOL = 0.22, MUSIC_KEY = "npArcade.music";
const Snd = (function () {
  let A = null, dead = false, muted = false, stopMusic = null, fresh = true, startAt = 0;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  const buttons = [], icons = [];

  function rig(c) {
    const a = { c: c };
    a.out = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    a.out.connect(comp); comp.connect(c.destination);
    a.music = c.createGain(); a.music.gain.value = MUSIC_VOL; a.music.connect(a.out);
    a.sfx = c.createGain(); a.sfx.gain.value = SFX_VOL; a.sfx.connect(a.out);
    const len = Math.floor(c.sampleRate);
    a.noise = c.createBuffer(1, len, c.sampleRate);
    const d = a.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return a;
  }
  function osc(type, f0, t, dur, vol, f1, hold) {
    const o = A.c.createOscillator(), g = A.c.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.5 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.sfx); o.start(t); o.stop(t + dur + 0.04);
  }
  function hiss(t, dur, vol, type, f0, q, f1) {
    const s = A.c.createBufferSource(), f = A.c.createBiquadFilter(), g = A.c.createGain();
    s.buffer = A.noise; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(A.sfx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function cue(name, t, x) {
    if (name === "teleport") { osc("sine", 300, t, 0.2, 0.3, 1400, 0.3); osc("triangle", 2093, t + 0.1, 0.18, 0.12, 0, 0.2); }
    else if (name === "dash") { hiss(t, 0.26, 0.35, "bandpass", 600, 1.4, 2600); osc("sine", 190, t, 0.18, 0.2, 90, 0.2); }
    else if (name === "bounce") { osc("sine", 120, t, 0.12, 0.5 * x + 0.1, 70, 0.05); hiss(t, 0.05, 0.12 * x + 0.02, "lowpass", 500, 0.7); }
    else if (name === "zap") { osc("square", 1900, t, 0.3, 0.22, 180, 0.4); hiss(t, 0.35, 0.4, "bandpass", 2400, 0.8, 300); osc("triangle", 1568, t + 0.12, 0.3, 0.18, 0, 0.3); osc("triangle", 2093, t + 0.2, 0.3, 0.16, 0, 0.3); }
    else if (name === "chrono") { osc("square", 1760, t, 0.03, 0.2, 0, 0.3); osc("square", 1320, t + 0.12, 0.03, 0.2, 0, 0.3); [72, 76, 79, 84].forEach(function (m, i) { osc("triangle", mtof(m), t + 0.25 + i * 0.06, 0.14, 0.2, 0, 0.5); }); }
    else if (name === "gold") { osc("square", 988, t, 0.08, 0.22, 0, 0.6); osc("square", 1319, t + 0.08, 0.3, 0.22, 0, 0.4); osc("sine", 2637, t + 0.08, 0.4, 0.1, 0, 0.2); }
    else if (name === "magnet") { for (let i = 0; i < 6; i++) osc("sine", i % 2 ? 330 : 440, t + i * 0.05, 0.07, 0.18, i % 2 ? 440 : 330, 0.5); osc("triangle", 880, t + 0.3, 0.3, 0.15, 1760, 0.3); }
    else if (name === "combo") { const up = [72, 76, 79, 84, 88, 91].slice(0, 2 + (x || 1)); up.forEach(function (m, i) { osc("square", mtof(m), t + i * 0.055, 0.1, 0.2, 0, 0.5); }); osc("triangle", mtof(up[up.length - 1] + 12), t + up.length * 0.055, 0.4, 0.16, 0, 0.3); }
    else if (name === "lap") { [[72, 0], [76, 0.09], [79, 0.18], [84, 0.27]].forEach(function (n) { osc("square", mtof(n[0]), t + n[1], 0.14, 0.2, 0, 0.6); }); [84, 88, 91].forEach(function (m) { osc("triangle", mtof(m), t + 0.38, 0.6, 0.16, 0, 0.4); }); }
    else if (name === "clutch") { for (let i = 0; i < 3; i++) { osc("sawtooth", 523, t + i * 0.24, 0.11, 0.14, 0, 0.8); osc("sawtooth", 784, t + i * 0.24 + 0.12, 0.11, 0.14, 0, 0.8); } }
    else if (name === "horn") { [233, 277, 349].forEach(function (f) { osc("sawtooth", f, t, 0.95, 0.12, 0, 0.85); }); }
    else if (name === "drone") { osc("square", 1320, t, 0.06, 0.12, 0, 0.6); osc("square", 1320, t + 0.12, 0.06, 0.12, 0, 0.6); osc("sine", 220, t, 0.5, 0.1, 330, 0.5); }
    else if (name === "rail") { osc("sawtooth", 110, t, 0.5, 0.12, 220, 0.6); hiss(t, 0.5, 0.15, "bandpass", 800, 1, 1600); }
  }

  function shellMuted() {
    const b = document.getElementById("np-mute");
    if (b) return b.getAttribute("aria-pressed") === "true";
    try { return localStorage.getItem("npArcade.muted") === "1"; } catch (e) { return false; }
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
      }
      if (A.c.state !== "running") { const p = A.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { A = null; dead = true; }
  }
  // Every frame: follow the mute button, and start or stop the band with the game.
  function pump() {
    if (!A || !window.Shell) return;
    const now = A.c.currentTime, m = shellMuted();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, now, 0.02); }
    const want = musicOn && !muted && A.c.state === "running" && Shell.state() === "playing" && performance.now() >= startAt;
    if (want && !stopMusic) { stopMusic = startMusic(A.c, A.music); fresh = false; }
    else if (!want && stopMusic) { stopMusic(); stopMusic = null; }
  }
  function sfx(name, x, delay) {
    if (!A || muted || A.c.state !== "running") return;
    try { cue(name, A.c.currentTime + 0.01 + (delay || 0), x); } catch (e) { /* sound is never worth a crash */ }
  }
  function label() {
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].textContent = musicOn ? "MUSIC: ON" : "MUSIC: OFF";
      buttons[i].setAttribute("aria-pressed", musicOn ? "true" : "false");
    }
    for (let i = 0; i < icons.length; i++) {
      icons[i].innerHTML = musicOn ? NOTE_ON : NOTE_OFF;
      icons[i].setAttribute("aria-pressed", musicOn ? "true" : "false");
      icons[i].setAttribute("aria-label", musicOn ? "Turn music off" : "Turn music on");
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
  // A music icon in the top bar, next to the shell's mute button.
  function iconButton(bar, before) {
    if (!bar) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-icon"; b.id = "np-music";
    b.addEventListener("click", function (e) {
      e.stopPropagation(); unlock(); setMusic(!musicOn);
      if (e.detail > 0 && Shell.state() === "playing") { const c = document.getElementById("np-canvas"); try { c.focus({ preventScroll: true }); } catch (er) { c.focus(); } }
    });
    bar.insertBefore(b, before || null);
    icons.push(b); label();
  }
  return {
    unlock: unlock, pump: pump, sfx: sfx, button: button, iconButton: iconButton,
    newGame: function () { unlock(); if (stopMusic) { stopMusic(); stopMusic = null; } fresh = true; startAt = performance.now() + 420; pump(); },   // let the shell's start jingle go first
    stopNow: function () { if (stopMusic) { stopMusic(); stopMusic = null; } },
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    peek: function () { return { made: !!A, state: A ? A.c.state : "none", playing: !!stopMusic, muted: muted, musicOn: musicOn }; },
    // for checks: play every stinger once and report any that throw
    check: function () { const errs = []; if (!A) return ["no audio"]; ["teleport", "dash", "bounce", "zap", "chrono", "gold", "magnet", "combo", "lap", "clutch", "horn", "drone", "rail"].forEach(function (n) { try { cue(n, A.c.currentTime + 0.01, 1); } catch (e) { errs.push(n + ": " + e.message); } }); return errs; }
  };
})();
const NOTE_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 4l11-2v13.5a3 3 0 1 1-2-2.83V6.2L11 7.5v10a3 3 0 1 1-2-2.83z"/></svg>';
const NOTE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" opacity=".55" d="M9 4l11-2v13.5a3 3 0 1 1-2-2.83V6.2L11 7.5v10a3 3 0 1 1-2-2.83z"/><path fill="none" stroke="currentColor" stroke-width="2.4" d="M3 3l18 18"/></svg>';

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

/* ---------------- Painted textures (all drawn here, no image files besides the two logos) ---------------- */

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every decal in the arena uses this (the full
// logo with the mascot is kept for the splash, the title card and the score card). If the PNG is missing,
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

// Neon tube lettering: a colored glow, the tube, a white-hot core.
function neonText(g, str, x, y, size, color, maxW) {
  const face = '"Arial Black", "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
  g.font = "900 " + size + "px " + face;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + face; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.save();
  g.shadowColor = color; g.shadowBlur = size * 0.5;
  g.lineWidth = size * 0.12; g.strokeStyle = color; g.strokeText(str, x, y);
  g.shadowBlur = size * 0.25; g.fillStyle = color; g.fillText(str, x, y);
  g.restore();
  g.fillStyle = "rgba(255,255,255,.85)"; g.save(); g.globalAlpha = 0.75; g.fillText(str, x, y); g.restore();
}

// The court lines, painted for the frontcourt: 18 x 18 m, x -9..9, z -4.4..13.6. Clear where the floor shows.
const COURT = { x0: -9, z0: -4.4, m: 18, px: 2048 };
function courtCanvas(script) {
  const N = COURT.px, k = N / COURT.m, c = mkCanvas(N, N), g = c.getContext("2d");
  const X = function (x) { return (x - COURT.x0) * k; }, Y = function (z) { return (z - COURT.z0) * k; };
  function glowLine(col, w, blur) { g.strokeStyle = col; g.lineWidth = w * k; g.shadowColor = col; g.shadowBlur = blur || 18; }
  g.lineCap = "round"; g.lineJoin = "round";
  // the apron behind the baseline
  g.fillStyle = "rgba(4,2,16,.45)"; g.fillRect(0, 0, N, Y(BASELINE));
  // the key
  g.fillStyle = "rgba(255,63,216,.16)"; g.fillRect(X(-2.45), Y(BASELINE), 4.9 * k, (4.22 - BASELINE) * k);
  g.save();
  glowLine("#ff3fd8", 0.06);
  g.strokeRect(X(-2.45), Y(BASELINE), 4.9 * k, (4.22 - BASELINE) * k);
  g.beginPath(); g.arc(X(0), Y(4.22), 1.8 * k, 0, Math.PI); g.stroke();
  g.setLineDash([0.3 * k, 0.3 * k]); g.beginPath(); g.arc(X(0), Y(4.22), 1.8 * k, Math.PI, TAU); g.stroke(); g.setLineDash([]);
  // the three-point line
  glowLine("#3ff0ff", 0.065);
  const a0 = Math.asin(6.6 / 6.75);
  g.beginPath(); g.moveTo(X(-6.6), Y(BASELINE));
  for (let a = -a0; a <= a0 + 1e-6; a += 0.02) g.lineTo(X(6.75 * Math.sin(a)), Y(6.75 * Math.cos(a)));
  g.lineTo(X(6.6), Y(BASELINE)); g.stroke();
  // the restricted arc, the court's edges, the half court line
  glowLine("#3ff0ff", 0.04, 10);
  g.beginPath(); g.arc(X(0), Y(0), 1.25 * k, 0, Math.PI); g.stroke();
  glowLine("#8a6bff", 0.07, 14);
  g.strokeRect(X(-SIDELINE), Y(BASELINE), SIDELINE * 2 * k, (12.42 - BASELINE) * k + 6);
  g.beginPath(); g.arc(X(0), Y(12.42), 1.8 * k, Math.PI, TAU); g.stroke();
  // the 4000 line: a dashed gold arc around the deep spot
  glowLine("#ffd23f", 0.06, 16);
  g.setLineDash([0.45 * k, 0.3 * k]);
  g.beginPath();
  for (let a = -24; a <= 24.01; a += 1) { const r = a * DEG, px = X(7.75 * Math.sin(r)), py = Y(7.75 * Math.cos(r)); if (a === -24) g.moveTo(px, py); else g.lineTo(px, py); }
  g.stroke(); g.setLineDash([]);
  g.restore();
  // the hoop's rail behind the baseline
  g.save();
  glowLine("#3ff0ff", 0.05, 16);
  [-0.16, 0.16].forEach(function (o) { g.beginPath(); g.moveTo(X(-2.6), Y(RAIL_Z + o)); g.lineTo(X(2.6), Y(RAIL_Z + o)); g.stroke(); });
  g.restore();
  g.fillStyle = "rgba(63,240,255,.12)"; g.fillRect(X(-2.6), Y(RAIL_Z - 0.16), 5.2 * k, 0.32 * k);
  // the shooting spots
  const spotCol = { 2: "#3ff0ff", 3: "#ff3fd8", 4: "#ffd23f" };
  SPOTS.forEach(function (s) {
    const p = spotXZ(SPOTS.indexOf(s)), x = X(p.x), y = Y(p.z), col = spotCol[s.pts], gr = g.createRadialGradient(x, y, 0, x, y, 0.75 * k);
    gr.addColorStop(0, col + "55"); gr.addColorStop(1, col + "00");
    g.fillStyle = gr; g.fillRect(x - 0.75 * k, y - 0.75 * k, 1.5 * k, 1.5 * k);
    g.save(); glowLine(col, 0.05, 16);
    g.beginPath(); g.arc(x, y, 0.36 * k, 0, TAU); g.stroke(); g.restore();
    g.font = "900 " + Math.round(0.42 * k) + 'px "Arial Black", Arial, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = col; g.fillText(String(s.pts), x, y + 0.02 * k);
  });
  // the wordmark, inside the key between the rim and the free throw line, reading from the shooter's side
  g.save(); g.globalAlpha = 0.92; drawScript(g, script, X(0), Y(2.25), 3.9 * k, 1.75 * k); g.restore();
  // the game on the apron behind the baseline
  neonText(g, "CLUTCH BALL 4000", X(0), Y(-3.15), Math.round(0.95 * k), "#ff3fd8", 11 * k);
  return c;
}

// The floor itself: dark glass over a hex grid, one tile 2.4 m.
function floorCanvas() {
  const c = mkCanvas(512, 512), g = c.getContext("2d"), rnd = rng(13);
  const bg = g.createLinearGradient(0, 0, 512, 512);
  bg.addColorStop(0, "#13103a"); bg.addColorStop(1, "#0d0b2c");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.025)" : "rgba(0,0,0,.08)"; g.fillRect(rnd() * 512, rnd() * 512, 2, 2); }
  const r = 512 / 6 / Math.sqrt(3) * 1.0, hw = Math.sqrt(3) * r;
  g.strokeStyle = "rgba(140,110,255,.16)"; g.lineWidth = 2;
  for (let row = -1; row < 6; row++) for (let col = -1; col < 8; col++) {
    const cx = col * hw + (row % 2 ? hw / 2 : 0), cy = row * r * 1.5;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + Math.PI / 6; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    g.closePath(); g.stroke();
  }
  return c;
}

// A ball: pebbled, dark seams with a neon line in each, the wordmark stamped once on each side.
function ballCanvas(script, kind) {
  const K = KINDS[kind], c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(kind.length * 31 + 7);
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, K.base); bg.addColorStop(1, K.dark);
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.10)" : "rgba(0,0,0,.12)"; g.fillRect(rnd() * 512, rnd() * 256, 1.6, 1.6); }
  function seams(col, w) {
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath(); g.moveTo(0, 128); g.lineTo(512, 128); g.stroke();                       // the equator
    [0, 256, 512].forEach(function (x) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); });   // a great circle through the poles
    [128, 384].forEach(function (cx) {                                                       // the two curved seams
      [-1, 1].forEach(function (sd) {
        g.beginPath();
        for (let y = 0; y <= 256; y += 4) { const lat = (y / 256 - 0.5) * Math.PI, x = cx + sd * 92 * Math.pow(Math.cos(lat), 0.6); if (y === 0) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke();
      });
    });
  }
  seams(K.seam, 7);
  g.save(); g.shadowColor = K.line; g.shadowBlur = 6; seams(K.line, 1.6); g.restore();
  // each row widened by 1 / cos(latitude) so the wordmark lands on the sphere undistorted
  const SW = 118, SH = Math.round(SW * script.height / script.width), rowH = script.height / SH;
  [128, 384].forEach(function (cx) {
    g.fillStyle = "rgba(10,6,30,.85)"; g.beginPath(); g.ellipse(cx, 128, SW * 0.6, SH * 0.72, 0, 0, TAU); g.fill();
    for (let r = 0; r < SH; r++) {
      const y = 128 - Math.round(SH / 2) + r, lat = (0.5 - (y + 0.5) / 256) * Math.PI, w = SW / Math.max(0.4, Math.cos(lat));
      g.drawImage(script, 0, r * rowH, script.width, rowH, cx - w / 2, y, w, 1);
    }
  });
  return c;
}

// The jersey, wrapped once around the body: u = 0 is the chest, u = .5 the back.
function jerseyCanvas(script) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, "#6a34ec"); bg.addColorStop(1, "#3a168f");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#3ff0ff"; [128, 384].forEach(function (x) { g.fillRect(x - 9, 0, 18, 256); });          // side panels
  g.fillStyle = "#ff3fd8"; [128, 384].forEach(function (x) { g.fillRect(x - 3, 0, 6, 256); });
  g.fillStyle = "#14082e"; g.fillRect(0, 0, 512, 10);                                                   // neckline and arm holes
  [0, 256, 512].forEach(function (x) { drawScript(g, script, x, x === 256 ? 70 : 96, 150, 58); });      // wordmark across the chest and the shoulders
  g.font = '900 92px "Arial Black", Arial, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = 12; g.strokeStyle = "#14082e"; g.strokeText("40", 256, 160);
  g.save(); g.shadowColor = "#3ff0ff"; g.shadowBlur = 10; g.fillStyle = "#3ff0ff"; g.fillText("40", 256, 160); g.restore();
  g.fillStyle = "rgba(255,255,255,.85)"; g.font = '900 64px "Arial Black", Arial, sans-serif'; g.fillText("40", 0, 186); g.fillText("40", 512, 186);   // and on the chest, across the wrap
  return c;
}

// The shorts, wrapped around each leg (and the hips): side stripes, a hem band at the top of the canvas (the
// waistband on the hips, the hem on the legs, which run down from the hip), the number on the front of the left leg.
function shortsCanvas(num) {
  const c = mkCanvas(256, 128), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 128);
  bg.addColorStop(0, "#3a168f"); bg.addColorStop(1, "#5a2be0");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  [64, 192].forEach(function (x) { g.fillStyle = "#3ff0ff"; g.fillRect(x - 9, 0, 18, 128); g.fillStyle = "#ff3fd8"; g.fillRect(x - 3, 0, 6, 128); });
  g.fillStyle = "#14082e"; g.fillRect(0, 0, 256, 12); g.fillStyle = "#3ff0ff"; g.fillRect(0, 12, 256, 3);
  if (num) {                                                // the leg runs downward, so the number is painted turned around
    g.save(); g.translate(0, 58); g.rotate(Math.PI);
    g.font = '900 38px "Arial Black", Arial, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#3ff0ff"; g.fillText("40", -26, 0); g.fillText("40", 230, 0);
    g.restore();
  }
  return c;
}
// The net: white cord in diamonds, clear between.
function netCanvas() {
  const c = mkCanvas(256, 128), g = c.getContext("2d");
  g.strokeStyle = "rgba(255,255,255,.95)"; g.lineWidth = 3.4;
  for (let x = -128; x < 384; x += 32) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(x + 128, 0); g.lineTo(x, 128); g.stroke();
  }
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 256, 6);
  return c;
}
function glowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.45)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function ringCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.shadowColor = "#ffffff"; g.shadowBlur = 14; g.strokeStyle = "#ffffff"; g.lineWidth = 7;
  g.beginPath(); g.arc(64, 64, 46, 0, TAU); g.stroke();
  return c;
}
function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(0,0,10,.85)"); gr.addColorStop(0.55, "rgba(0,0,10,.4)"); gr.addColorStop(1, "rgba(0,0,10,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
// The front of the glass: the shooter's square and the wordmark above it. The glass is 1.8 x 1.25 m.
function glassCanvas(script) {
  const c = mkCanvas(1024, 712), g = c.getContext("2d"), k = 1024 / 1.8;
  const Y = function (y) { return (BOARD_Y1 - y) * k; };
  g.save(); g.shadowColor = "#ff3fd8"; g.shadowBlur = 16; g.strokeStyle = "#ff3fd8"; g.lineWidth = 0.05 * k;
  g.strokeRect(512 - 0.295 * k, Y(RIM_Y + 0.6), 0.59 * k, 0.45 * k); g.restore();
  g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 3; g.strokeRect(512 - 0.295 * k, Y(RIM_Y + 0.6), 0.59 * k, 0.45 * k);
  drawScript(g, script, 512, Y(3.88), 1.1 * k, 0.36 * k);
  return c;
}
// The game clock on top of the glass. Repainted when the second changes.
function paintClock(g, t, clutch) {
  const W2 = 512, H2 = 200;
  g.fillStyle = "#05030f"; g.fillRect(0, 0, W2, H2);
  g.strokeStyle = "#3ff0ff"; g.lineWidth = 6; g.strokeRect(3, 3, W2 - 6, H2 - 6);
  g.font = "bold 26px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = clutch ? "#ff3fd8" : "#3ff0ff"; g.fillText(clutch ? "CLUTCH TIME" : "CLUTCH BALL 4000", W2 / 2, 32);
  const s = Math.max(0, Math.ceil(t)), str = Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
  g.font = '900 120px "Arial Black", Arial, sans-serif';
  g.save(); g.shadowColor = "#ff2a2a"; g.shadowBlur = 22; g.fillStyle = clutch && s <= 5 ? "#ffd23f" : "#ff3b30"; g.fillText(str, W2 / 2, 122); g.restore();
}
// A banner hanging over the stands behind the hoop.
function bannerCanvas(script, sub) {
  const c = mkCanvas(512, 704), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 704);
  bg.addColorStop(0, "#2a0f6e"); bg.addColorStop(1, "#0c0630");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 704);
  g.fillStyle = "#3ff0ff"; g.fillRect(0, 0, 512, 14); g.fillStyle = "#ff3fd8"; g.fillRect(0, 14, 512, 6);
  g.beginPath(); g.moveTo(0, 704); g.lineTo(256, 640); g.lineTo(512, 704); g.closePath(); g.fillStyle = "#07061a"; g.fill();
  drawScript(g, script, 256, 200, 440, 220);
  neonText(g, "CLUTCH", 256, 400, 86, "#ff3fd8", 440);
  neonText(g, "BALL 4000", 256, 500, 72, "#3ff0ff", 440);
  g.font = "bold 26px " + HUD_FONT; g.textAlign = "center"; g.fillStyle = "#ffd23f"; g.fillText(sub, 256, 585);
  return c;
}
// The stands: one row of seats (lower half of the tile) and the step (upper half). With people painted in for low quality.
function seatCanvas(people) {
  const c = mkCanvas(256, 128), g = c.getContext("2d"), rnd = rng(people ? 29 : 31);
  g.fillStyle = "#120d33"; g.fillRect(0, 0, 256, 64);
  g.fillStyle = "#0b0824"; g.fillRect(0, 64, 256, 64);
  for (let i = 0; i < 6; i++) {
    const x = i * 42.7 + 4;
    rrectPath(g, x, 74, 34, 50, 8); g.fillStyle = i % 2 ? "#2a1a6e" : "#331f84"; g.fill();
    g.fillStyle = "rgba(63,240,255,.25)"; g.fillRect(x + 4, 78, 26, 3);
    if (people && rnd() < 0.85) {
      g.fillStyle = FAN_COLS[Math.floor(rnd() * FAN_COLS.length)]; rrectPath(g, x + 6, 90, 22, 38, 8); g.fill();
      g.fillStyle = SKIN_COLS[Math.floor(rnd() * SKIN_COLS.length)]; g.beginPath(); g.arc(x + 17, 84, 7, 0, TAU); g.fill();
    }
  }
  return c;
}
// The upper bowl: dark seats, a scatter of phone lights and exit signs. One tile is 6 m wide.
function upperCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(61);
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, "#05040f"); bg.addColorStop(1, "#140f3a");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
  for (let y = 132; y < 256; y += 12) { g.fillStyle = "rgba(90,70,200,.18)"; g.fillRect(0, y, 256, 2); }
  for (let i = 0; i < 80; i++) {
    const y = 130 + rnd() * 120;
    g.fillStyle = ["rgba(255,255,255,.7)", "rgba(63,240,255,.6)", "rgba(255,63,216,.6)", "rgba(255,210,63,.6)"][i % 4];
    g.fillRect(rnd() * 256, y, 2, 2);
  }
  g.fillStyle = "rgba(255,63,216,.55)"; g.fillRect(0, 118, 256, 4);
  return c;
}
// A tiny painted arena for the glossy highlights.
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#1a1050"); gr.addColorStop(0.3, "#3ff0ff"); gr.addColorStop(0.36, "#140c40");
    gr.addColorStop(0.5, "#ff3fd8"); gr.addColorStop(0.54, "#0d0a2a"); gr.addColorStop(1, "#14103a");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#0a0826"; tg.fillRect(0, 0, 64, 64);
  tg.strokeStyle = "#ffffff"; tg.lineWidth = 5; tg.beginPath(); tg.arc(32, 32, 20, 0, TAU); tg.stroke();
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#13103a"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}
const FAN_COLS = ["#3ff0ff", "#ff3fd8", "#ffd23f", "#9bff3f", "#8a5cff", "#ffffff", "#ff8a2a", "#ff4b3e", "#2a6bff"];
const SKIN_COLS = ["#f1c7a0", "#d9a273", "#a8703f", "#f6d7b8", "#7b4f2c", "#5a3820"];

/* ---------------- LED ribbon boards ----------------
   A real dot matrix, the same build as Tape Pin Lanes and Bleacher Carts. Everything on it is painted into a
   small canvas, one pixel per LED, and a small shader turns each pixel into a glowing dot. The board runs in
   three sections around the parapet over the stands (right side, behind the hoop, left side), and the
   courtside board under the hoop shows the same matrix. The programme scrolls right to left through all
   three; big moments cut in on every section at once. */
const LED_SEG = 220, LED_SEGS = 3, LED_COLS = LED_SEG * LED_SEGS, LED_ROWS = 26;
const LED_SAFE = 190;                                      // widest message that stays readable in one section
const LED_SPEED = 46;                                      // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
// Short messages between the plugs. The wordmark leads each group.
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["CLUTCH BALL 4000", "cyan"], ["NO QUARTERS REQUIRED", "pink"]];
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
  // The wordmark at board resolution: the cream lettering pushed to full brightness, the red edge kept as a
  // dimmer rim, the navy outline dark, so the script reads as light on black.
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
  // open with the wordmark sitting in the middle of the center section, behind the hoop
  const start = ((-(LED_COLS - strip.markW) / 2) % sw + sw) % sw;
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
    // a quick cut-in, but a bonus or a running total that has not had its turn yet still gets it afterwards
    const old = (L.msg && L.msg.keep ? [L.msg] : []).concat(L.queue.filter(function (m) { return m.keep; }));
    if (old.length) { old[0].t = 0; list = list.concat(old); }
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
  ledPlay([ledMsg("count", "FINAL", 7, { from: Math.min(V.ledScore, score), value: score, suffix: " PTS", final: true, wait: 0.5 })], true);
}

// One section's worth of a message (LED_SEG wide).
function ledDrawMsg(g, m) {
  const WW = LED_SEG, HH = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(WW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.amber;
  function fit(str) { let sx = big; while (sx > 1 && ledTextW(str, sx) > LED_SAFE) sx--; return sx; }
  function chase(color, dir) {                              // running lights along the top and bottom edges
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < WW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(WW - x - 3, HH - 1, 3, 1); }
  }
  if (m.kind === "count") {                                 // counts up to the new number
    const k = calm ? 1 : Math.min(1, t / 0.7), v = Math.round(m.from + (m.value - m.from) * k);
    const label = m.text ? m.text + " " : "", suffix = m.suffix || "", sxc = fit(label + m.value + suffix);
    const x = Math.round((WW - ledTextW(label + m.value + suffix, sxc)) / 2);
    const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
    let xn = ledText(g, label, x, yBig, sxc, big, LED_C.cyan);
    xn = ledText(g, String(v), xn, yBig, sxc, big, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
    ledText(g, suffix, xn, yBig, sxc, big, LED_C.cyan);
    if (!calm && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(WW * m.t / 0.3), 0, WW, HH); }   // wipe in
    chase(LED_C.cyan, 1);
    return;
  }
  const sx = fit(m.text), w = ledTextW(m.text, sx), x0 = Math.round((WW - w) / 2);
  if (m.kind === "flash") {
    if (!calm && t < 0.5 && Math.floor(t * 12) % 2 === 0) {                        // strobe: the whole board flips
      g.fillStyle = LED_C.cyan; g.fillRect(0, 0, WW, HH);
      ledText(g, m.text, x0, yBig, sx, big, "#000000");
      return;
    }
    const span = 6 * big + 5, ph = calm ? 0 : Math.floor((t * 46) % span);
    for (let k = 0; k < 12; k++) {                          // chevrons racing outward on both sides
      const off = Math.round(w / 2) + 9 + k * span + ph;
      if (off > mid + span) break;
      const cc = k % 2 ? LED_C.pink : LED_C.cyan;
      ledText(g, ">", mid + off, yBig, big, big, cc);
      ledText(g, "<", mid - off - 5 * big, yBig, big, big, cc);
    }
    const cyc = [LED_C.yellow, LED_C.white, LED_C.cyan];
    ledText(g, m.text, x0, yBig, sx, big, calm ? LED_C.yellow : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 14; i++) g.fillRect((Math.random() * WW) | 0, (Math.random() * HH) | 0, 1, 1); }
    chase(LED_C.pink, 1);
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
  // blink: a few flashes, then it holds between two solid bars
  if (calm || t > 1.1 || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, yBig, sx, big, col);
  g.fillStyle = col; g.fillRect(0, HH - 1, WW, 1); g.fillRect(0, 0, WW, 1);
}

function ledDraw() {
  const L = LED, g = L.g, HH = LED_ROWS;
  g.fillStyle = "#000000"; g.fillRect(0, 0, LED_COLS, HH);
  if (L.msg) {
    for (let s = 0; s < LED_SEGS; s++) {
      g.save(); g.translate(s * LED_SEG, 0);
      g.beginPath(); g.rect(0, 0, LED_SEG, HH); g.clip();
      ledDrawMsg(g, L.msg);
      g.restore();
    }
    return;
  }
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

/* ---------------- Geometry helpers ---------------- */

// A box with every edge and corner rounded. Each face keeps its own material slot (+x -x +y -y +z -z).
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

// The line the stands follow around the court: down the right side, round the corner, along behind the
// baseline, round the other corner and back up the left side. Each point carries the way "out" (away from the court).
function standPath(zNear) {
  const p = [];
  let len = 0;
  function push(x, z, nx, nz) {
    if (p.length) len += Math.hypot(x - p[p.length - 1].x, z - p[p.length - 1].z);
    p.push({ x: x, z: z, nx: nx, nz: nz, len: len });
  }
  const R0 = 3.5, CX = 9.5 - R0, CZ = WALL_Z + R0;
  for (let z = zNear; z > CZ + 0.01; z -= 1.5) push(9.5, z, 1, 0);
  for (let a = 0; a >= -180; a -= 7.5) {
    const r = a * DEG, cx = a > -90 ? CX : -CX, nx = Math.cos(r), nz = Math.sin(r);
    if (a === -90) { push(CX, WALL_Z, 0, -1); for (let x = CX - 2; x > -CX + 0.01; x -= 2) push(x, WALL_Z, 0, -1); push(-CX, WALL_Z, 0, -1); continue; }
    push(cx + nx * R0, CZ + nz * R0, nx, nz);
  }
  for (let z = CZ + 1.5; z <= zNear + 0.01; z += 1.5) push(-9.5, z, -1, 0);
  return p;
}
// Bands swept along a path. segs: [k0, y0, v0, k1, y1, v1, uShift], k = meters out from the line, y = height.
function sweep(T, path, segs, uOf) {
  const pos = [], nor = [], uv = [], idx = [], n = path.length;
  for (let j = 0; j < segs.length; j++) {
    const s = segs[j], dk = s[3] - s[0], dy = s[4] - s[1], l = Math.hypot(dk, dy) || 1, nk = -dy / l, ny = dk / l, base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const p = path[i], u = (uOf ? uOf(p) : 0) + (s[6] || 0);
      pos.push(p.x + p.nx * s[0], s[1], p.z + p.nz * s[0], p.x + p.nx * s[3], s[4], p.z + p.nz * s[3]);
      nor.push(p.nx * nk, ny, p.nz * nk, p.nx * nk, ny, p.nz * nk);
      uv.push(u, s[2], u, s[5]);
    }
    for (let i = 0; i < n - 1; i++) { const o = base + i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
/* ---------------- People: shaped bodies ----------------
   Every body part is its own shaped surface, not a tube: rings of points swept along the part, each ring with
   its own width, front depth and back depth, so a biceps swells in front and a triceps behind, a calf bulges at
   the back, a chest is wider than it is deep and a wrist is flat. The ends are rounded so the joints run into
   each other. The shooter's parts are posed one by one; the fans in the stands are the same kind of body,
   seated, merged into two instanced meshes. */

// A smooth curve through rows [t, a, b, c, ...], Catmull-Rom along t.
function spline(keys) {
  const n = keys.length;
  return function (t) {
    if (t <= keys[0][0]) return keys[0].slice(1);
    if (t >= keys[n - 1][0]) return keys[n - 1].slice(1);
    let i = 1; while (keys[i][0] < t) i++;
    const p0 = keys[Math.max(0, i - 2)], p1 = keys[i - 1], p2 = keys[i], p3 = keys[Math.min(n - 1, i + 1)];
    const h = p2[0] - p1[0], u = (t - p1[0]) / h, u2 = u * u, u3 = u2 * u, out = [];
    for (let k = 1; k < p1.length; k++) {
      const m1 = (p2[k] - p0[k]) / Math.max(1e-6, p2[0] - p0[0]) * h, m2 = (p3[k] - p1[k]) / Math.max(1e-6, p3[0] - p1[0]) * h;
      out.push((2 * u3 - 3 * u2 + 1) * p1[k] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[k] + (u3 - u2) * m2);
    }
    return out;
  };
}
// A body part along +y from 0 to len, its front toward +z. keys: [t, half width, front depth, back depth], t 0 to 1.
// o: segs, rings, sq (below 1 squares the cross-section off), cap0 / cap1 (rounding at each end, 0 leaves it open),
// capN (rings in a rounded end), bump(t, angle, y) (a fractional swell anywhere on the surface).
function shapeGeo(T, len, keys, o) {
  o = o || {};
  const segs = o.segs || 12, rings = o.rings || 8, sq = o.sq || 1, capN = o.capN || 3, f = spline(keys), rows = [];
  const c0 = o.cap0 == null ? 0.85 : o.cap0, c1 = o.cap1 == null ? 0.85 : o.cap1;
  if (c0 > 0) {
    const p = f(0), cr = Math.min(p[0], p[1], p[2]) * c0;
    for (let i = capN; i >= 1; i--) { const a = i / capN * Math.PI / 2, k = Math.max(0.05, Math.cos(a)); rows.push([-Math.sin(a) * cr, p[0] * k, p[1] * k, p[2] * k, 0]); }
  }
  for (let i = 0; i <= rings; i++) { const t = i / rings, p = f(t); rows.push([t * len, p[0], p[1], p[2], t]); }
  if (c1 > 0) {
    const p = f(1), cr = Math.min(p[0], p[1], p[2]) * c1;
    for (let i = 1; i <= capN; i++) { const a = i / capN * Math.PI / 2, k = Math.max(0.05, Math.cos(a)); rows.push([len + Math.sin(a) * cr, p[0] * k, p[1] * k, p[2] * k, 1]); }
  }
  const C = segs + 1, pos = [], uv = [], idx = [];
  for (let r = 0; r < rows.length; r++) {
    const rw = rows[r];
    for (let j = 0; j <= segs; j++) {
      const ph = j / segs * TAU, s = Math.sin(ph), c = Math.cos(ph);
      const s2 = Math.sign(s) * Math.pow(Math.abs(s), sq), c2 = Math.sign(c) * Math.pow(Math.abs(c), sq);
      const b = o.bump ? 1 + o.bump(rw[4], ph, rw[0]) : 1;
      pos.push(rw[1] * s2 * b, rw[0], (c2 >= 0 ? rw[2] : rw[3]) * c2 * b);
      uv.push(j / segs, rw[4]);
    }
  }
  for (let r = 0; r < rows.length - 1; r++) for (let j = 0; j < segs; j++) {
    const a = r * C + j, b = a + 1, c = a + C, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal;                            // one smooth normal across the seam
  for (let r = 0; r < rows.length; r++) {
    const i0 = r * C, i1 = r * C + segs;
    const x = n.getX(i0) + n.getX(i1), y = n.getY(i0) + n.getY(i1), z = n.getZ(i0) + n.getZ(i1), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(i0, x / l, y / l, z / l); n.setXYZ(i1, x / l, y / l, z / l);
  }
  return g;
}
function tint(T, g, r, gg, b) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gg; a[i * 3 + 2] = b; }
  g.setAttribute("color", new T.BufferAttribute(a, 3));
  return g;
}
// Many geometries into one: position, normal and color (white where a part has none).
function mergeGeos(T, list) {
  const pos = [], nor = [], col = [];
  list.forEach(function (g0) {
    const g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color ? g.attributes.color.array : null;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); col.push(c ? c[i] : 1); }
  });
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
// The axes of a part running from A to B: y along it, z turned toward "hint" (fb if hint runs along the part).
function frameAxes(A, B, hint, fb, X, Y, Z) {
  Y.subVectors(B, A);
  const l = Y.length() || 1e-4;
  Y.multiplyScalar(1 / l);
  Z.copy(hint).addScaledVector(Y, -hint.dot(Y));
  if (Z.lengthSq() < 1e-8) { Z.copy(fb).addScaledVector(Y, -fb.dot(Y)); }
  if (Z.lengthSq() < 1e-8) { Z.set(Math.abs(Y.x) < 0.9 ? 1 : 0, Math.abs(Y.x) < 0.9 ? 0 : 1, 0); Z.addScaledVector(Y, -Z.dot(Y)); }
  Z.normalize(); X.crossVectors(Y, Z);
  return l;
}
let PT = null;                                              // scratch vectors for posing
function orient(obj, A, B, hint, fb, L0) {
  const l = frameAxes(A, B, hint, fb, PT.x, PT.y, PT.z);
  PT.m.makeBasis(PT.x, PT.y, PT.z);
  obj.quaternion.setFromRotationMatrix(PT.m);
  obj.position.copy(A);
  obj.scale.set(1, L0 ? l / L0 : 1, 1);
}
// A head: wider at the cheekbones than the jaw, a chin, a rounder back of the skull.
function headGeo(T, rx, ry, rz, ws, hs) {
  const g = new T.SphereGeometry(1, ws, hs), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0) { const k = Math.pow(-y, 1.5); x *= 1 - 0.3 * k; if (z < 0) z *= 1 - 0.4 * k; }
    if (z > 0 && y < -0.55) z *= 1.06;
    if (z < 0 && y > -0.3) z *= 1.06;
    if (z > 0.55 && Math.abs(y) < 0.45) z *= 0.96;
    p.setXYZ(i, x * rx, y * ry, z * rz);
  }
  g.computeVertexNormals();
  return g;
}
// Short hair, a tight fade: down over the back of the head, up off the forehead.
function hairGeo(T, rx, ry, rz, ws, hs) {
  const g = new T.SphereGeometry(1, ws, hs, 0, TAU, 0, Math.PI * 0.5), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0.25 && z < 0) y -= 0.32 * -z * (1 - y / 0.25);
    if (y < 0.35 && z > 0.45) y += 0.3 * (z - 0.45) * (1 - y / 0.35);
    p.setXYZ(i, x * rx * 1.05, y * ry * 1.04, z * rz * 1.05);
  }
  g.computeVertexNormals();
  return g;
}
// A hand at the wrist: fingers along +y, the back of the hand toward +z. side: +1 puts the thumb on +x (left hand).
function handGeo(T, side) {
  const parts = [];
  const palm = roundBox(T, 0.27, 0.3, 0.1, 0.045); palm.translate(0, 0.19, 0); parts.push(palm);
  const L = [0.24, 0.27, 0.26, 0.2], X = [0.095, 0.032, -0.032, -0.095];
  for (let i = 0; i < 4; i++) {
    const f = shapeGeo(T, L[i], [[0, 0.034, 0.028, 0.03], [1, 0.026, 0.021, 0.023]], { segs: 6, rings: 2, capN: 2, cap0: 0.9, cap1: 0.9 });
    f.rotateX(-0.28 - i * 0.04); f.translate(side * X[i], 0.33, -0.005); parts.push(f);
  }
  const th = shapeGeo(T, 0.2, [[0, 0.045, 0.04, 0.042], [1, 0.031, 0.027, 0.028]], { segs: 6, rings: 2, capN: 2 });
  th.rotateX(-0.45); th.rotateZ(-side * 0.75); th.translate(side * 0.12, 0.07, -0.035); parts.push(th);
  return mergeGeos(T, parts);
}
// A high-top at the ankle, toe along +z: the upper and the collar (the glowing sole is its own piece).
function shoeGeo(T) {
  const up = new T.SphereGeometry(1, 18, 12), p = up.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * 0.175, z = p.getZ(i) * 0.5;
    let y = p.getY(i) * 0.17;
    if (z > 0.1) y -= Math.max(0, y) * Math.min(1, (z - 0.1) / 0.35) * 0.45;   // the toe box slopes down
    if (y < -0.07) y = -0.07 + (y + 0.07) * 0.3;                               // flat underneath
    p.setXYZ(i, x, y, z);
  }
  up.computeVertexNormals(); up.translate(0, -0.1, 0.22);
  const collar = shapeGeo(T, 0.32, [[0, 0.175, 0.17, 0.2], [1, 0.155, 0.145, 0.17]], { segs: 16, rings: 2, cap0: 0, cap1: 0 });
  collar.translate(0, -0.14, -0.01);
  return mergeGeos(T, [up, collar]);
}
// Every part of the shooter, in his own units (the pose numbers' feet).
function bodyGeos(T) {
  const G = {};
  G.torso = shapeGeo(T, 2.25, [[0, 0.55, 0.4, 0.42], [0.14, 0.52, 0.38, 0.4], [0.32, 0.5, 0.37, 0.38], [0.49, 0.57, 0.42, 0.4], [0.64, 0.66, 0.46, 0.43],
                              [0.77, 0.71, 0.45, 0.46], [0.86, 0.72, 0.4, 0.44], [0.92, 0.66, 0.33, 0.36], [0.965, 0.48, 0.26, 0.3], [1, 0.27, 0.2, 0.22]],
    { segs: 22, rings: 20, sq: 0.85, cap0: 0, cap1: 0.5, bump: function (t, ph) {
      const y = t * 2.25 - 0.18, c = Math.cos(ph), a = Math.abs(Math.atan2(Math.sin(ph), c));   // a: 0 at the front, pi at the back
      let b = 0;
      if (c > 0) b += 0.08 * Math.exp(-Math.pow((y - 1.38) / 0.17, 2)) * Math.exp(-Math.pow((a - 0.6) / 0.38, 2));    // chest
      if (c < 0) b += 0.06 * Math.exp(-Math.pow((y - 1.6) / 0.2, 2)) * Math.exp(-Math.pow((a - 2.45) / 0.35, 2));    // shoulder blades
      if (c > 0) b -= 0.03 * Math.exp(-Math.pow((y - 0.7) / 0.25, 2)) * Math.exp(-Math.pow(a / 0.3, 2));             // a line down the stomach
      return b;
    } });
  G.torso.translate(0, -0.18, 0);
  G.pelvis = shapeGeo(T, 1.0, [[0, 0.3, 0.24, 0.27], [0.25, 0.53, 0.39, 0.45], [0.7, 0.57, 0.41, 0.46], [1, 0.56, 0.41, 0.44]], { segs: 20, rings: 6, cap0: 0.9, cap1: 0 });
  G.pelvis.translate(0, -0.78, 0);
  G.neck = shapeGeo(T, 0.42, [[0, 0.3, 0.18, 0.28], [0.4, 0.21, 0.18, 0.21], [1, 0.19, 0.17, 0.18]], { segs: 14, rings: 5, cap0: 0, cap1: 0.6 });
  G.neck.translate(0, 1.95, -0.03);
  const rx = 0.25, ry = 0.36, rz = 0.31;
  const nose = new T.SphereGeometry(1, 8, 6); nose.scale(0.045, 0.085, 0.06); nose.translate(0, -0.05, rz * 0.93);
  const ears = [-1, 1].map(function (s) { const e = new T.SphereGeometry(1, 8, 6); e.scale(0.035, 0.08, 0.055); e.translate(s * rx * 0.96, -0.02, -0.02); return e; });
  G.head = mergeGeos(T, [headGeo(T, rx, ry, rz, 24, 18), nose, ears[0], ears[1]]);
  G.hair = hairGeo(T, rx, ry, rz, 24, 8);
  G.visor = new T.SphereGeometry(1, 18, 2, Math.PI / 2 - 1.0, 2.0, 1.36, 0.32); G.visor.scale(rx * 1.08, ry * 1.05, rz * 1.08);
  G.band = new T.TorusGeometry(1, 0.055, 6, 32); G.band.rotateX(Math.PI / 2); G.band.scale(rx * 0.92, 1, rz * 0.92); G.band.translate(0, ry * 0.5, 0);
  G.uarm = shapeGeo(T, 1.15, [[0, 0.23, 0.23, 0.23], [0.12, 0.25, 0.24, 0.23], [0.35, 0.2, 0.21, 0.2], [0.52, 0.19, 0.23, 0.2], [0.8, 0.17, 0.17, 0.17], [1, 0.14, 0.135, 0.145]], { segs: 14, rings: 9, cap0: 1, cap1: 0.9 });
  G.farm = shapeGeo(T, 1.12, [[0, 0.145, 0.145, 0.155], [0.18, 0.18, 0.175, 0.165], [0.5, 0.145, 0.13, 0.125], [1, 0.11, 0.08, 0.08]], { segs: 12, rings: 8, cap0: 0.9, cap1: 0.7 });
  G.thigh = shapeGeo(T, 1.5, [[0, 0.3, 0.3, 0.3], [0.15, 0.31, 0.32, 0.31], [0.45, 0.27, 0.3, 0.27], [0.8, 0.2, 0.22, 0.19], [1, 0.16, 0.18, 0.15]], { segs: 14, rings: 9, cap0: 0.9, cap1: 0.9 });
  G.shin = shapeGeo(T, 1.48, [[0, 0.155, 0.16, 0.15], [0.22, 0.17, 0.15, 0.23], [0.45, 0.14, 0.13, 0.17], [0.85, 0.1, 0.1, 0.1], [1, 0.1, 0.1, 0.1]], { segs: 12, rings: 9 });
  G.sock = shapeGeo(T, 0.42, [[0, 0.12, 0.125, 0.125], [1, 0.125, 0.125, 0.13]], { segs: 14, rings: 1, cap0: 0, cap1: 0 });
  G.shortL = shapeGeo(T, 0.85, [[0, 0.37, 0.37, 0.39], [1, 0.36, 0.37, 0.37]], { segs: 18, rings: 2, cap0: 0, cap1: 0 });
  G.wrist = shapeGeo(T, 0.17, [[0, 0.125, 0.095, 0.095], [1, 0.125, 0.095, 0.095]], { segs: 12, rings: 1, cap0: 0, cap1: 0 });
  G.hand = [handGeo(T, 1), handGeo(T, -1)];
  G.shoe = shoeGeo(T);
  G.sole = roundBox(T, 0.38, 0.085, 1.06, 0.035); G.sole.translate(0, -0.205, 0.21);
  return G;
}
// A seated fan at life size (meters), facing +z, sitting on y = 0: the shirt (torso and upper arms, white for
// the instance color) and the rest (head, hair, neck, forearms, hands, legs, shoes), colored so the instance's
// skin tone lands on the skin and darkens the hair, pants and shoes.
function fanGeos(T) {
  const V3 = function (x, y, z) { return new T.Vector3(x, y, z); }, fwd = V3(0, 0, 1);
  function at(geo, A, B, hint, L0) {
    const X = V3(), Y = V3(), Z = V3(), l = frameAxes(A, B, hint, fwd, X, Y, Z), m = new T.Matrix4();
    m.makeBasis(X, Y.multiplyScalar(l / L0), Z); m.setPosition(A);
    geo.applyMatrix4(m);
    return geo;
  }
  const lo = { segs: 6, rings: 2, capN: 1 }, lo1 = { segs: 6, rings: 1, capN: 1 }, shirt = [], body = [], pants = [0.22, 0.24, 0.36];
  const torso = shapeGeo(T, 0.6, [[0, 0.165, 0.12, 0.13], [0.45, 0.15, 0.115, 0.115], [0.75, 0.19, 0.13, 0.12], [0.9, 0.185, 0.11, 0.12], [1, 0.09, 0.07, 0.08]], { segs: 8, rings: 4, sq: 0.85, cap0: 0, cap1: 0.5, capN: 1 });
  torso.translate(0, 0.44, 0); shirt.push(torso);
  const neck = shapeGeo(T, 0.13, [[0, 0.055, 0.05, 0.055], [1, 0.048, 0.045, 0.048]], { segs: 7, rings: 1, cap0: 0, cap1: 0 });
  neck.translate(0, 0.99, 0); body.push(neck);
  const head = headGeo(T, 0.074, 0.11, 0.094, 7, 5); head.translate(0, 1.2, 0.01); body.push(head);
  const hair = hairGeo(T, 0.074, 0.11, 0.094, 7, 2); hair.translate(0, 1.2, 0.01); body.push(tint(T, hair, 0.1, 0.08, 0.07));
  [-1, 1].forEach(function (s) {
    const sh = V3(s * 0.185, 0.97, -0.01), el = V3(s * 0.21, 0.71, 0.05), wr = V3(s * 0.13, 0.62, 0.3);
    shirt.push(at(shapeGeo(T, 0.27, [[0, 0.055, 0.05, 0.05], [0.4, 0.05, 0.055, 0.05], [1, 0.042, 0.04, 0.04]], lo), sh, el, V3().subVectors(wr, el), 0.27));
    body.push(at(shapeGeo(T, 0.27, [[0, 0.042, 0.04, 0.04], [0.2, 0.046, 0.046, 0.043], [1, 0.033, 0.025, 0.025]], lo1), el, wr, V3().subVectors(sh, el), 0.27));
    const hand = new T.SphereGeometry(1, 5, 3); hand.scale(0.034, 0.022, 0.052); hand.translate(wr.x * 0.95, 0.605, 0.355); body.push(hand);
    const hp = V3(s * 0.1, 0.47, 0.02), kn = V3(s * 0.11, 0.5, 0.45), an = V3(s * 0.11, 0.07, 0.49);
    body.push(tint(T, at(shapeGeo(T, 0.43, [[0, 0.08, 0.08, 0.08], [0.4, 0.072, 0.078, 0.07], [1, 0.055, 0.058, 0.05]], lo1), hp, kn, V3().subVectors(kn, an), 0.43), pants[0], pants[1], pants[2]));
    body.push(tint(T, at(shapeGeo(T, 0.43, [[0, 0.052, 0.055, 0.05], [0.25, 0.055, 0.05, 0.068], [1, 0.035, 0.035, 0.035]], lo1), kn, an, V3().subVectors(kn, hp), 0.43), pants[0], pants[1], pants[2]));
    const shoe = new T.SphereGeometry(1, 6, 3); shoe.scale(0.045, 0.035, 0.1); shoe.translate(s * 0.11, 0.035, 0.53); body.push(tint(T, shoe, 0.75, 0.75, 0.78));
  });
  return { shirt: mergeGeos(T, shirt), body: mergeGeos(T, body) };
}

/* ---------------- The shooter: posed from a short list of numbers ----------------
   A pose is: hips x y z, hips turn, shoulders turn, lean, left palm x y z, right palm x y z, left foot x y z,
   right foot x y z, head turn, left wrist flex, right wrist flex, shooting elbow forward (0 to 1). All in his own
   space (feet and degrees), facing +z, left is +x; he shoots right handed. The wrist sits a hand's width back from
   the palm; elbows and knees are solved from where the wrists and ankles go. Wrist flex: + bends the fingers
   toward the palm (the flick), - cocks the hand back. */
const BALL_SET = [-0.92, 3.78, 0.62], BALL_LOAD = [-0.22, 6.0, 0.86];   // the ball on his right hip, and at his set point over his head
function onBall(ball, n) { const l = Math.hypot(n[0], n[1], n[2]), r = 0.43; return [ball[0] + n[0] / l * r, ball[1] + n[1] / l * r, ball[2] + n[2] / l * r]; }
const P_SET = [0, 2.95, 0, -8, -14, 4].concat(onBall(BALL_SET, [0.25, 0.9, 0.3]), onBall(BALL_SET, [-0.55, -0.45, -0.35]), [0.52, 0.2, 0.1, -0.52, 0.2, -0.1, 0, 0, 0, 0]);
const P_LOAD = [0, 2.58, 0.05, 0, 0, 3].concat(onBall(BALL_LOAD, [1, 0.15, -0.1]), onBall(BALL_LOAD, [-0.15, -0.8, -0.45]), [0.56, 0.2, 0.1, -0.56, 0.2, -0.1, 0, 0, -15, 1]);
const P_REL = [0, 3.05, 0, 0, 0, -3, 0.45, 6.45, 0.5, -0.18, 6.95, 0.62, 0.4, 0.25, 0.1, -0.4, 0.2, 0, 0, 0, -25, 1];
const P_FOLLOW = [0, 3.0, 0, 0, 0, -1, 0.55, 6.15, 0.7, -0.15, 6.7, 1.15, 0.4, 0.25, 0.1, -0.4, 0.2, 0, 0, 10, 80, 1];
const P_LAND = [0, 2.7, 0.05, 0, 0, 7, 0.85, 3.6, 0.5, -0.85, 3.8, 0.6, 0.56, 0.2, 0.1, -0.56, 0.2, -0.1, 0, 0, 30, 0.4];
const P_EMPTY = [0, 2.98, 0, 0, 0, 3, 0.95, 2.85, 0.2, -0.95, 2.85, 0.2, 0.55, 0.2, 0.05, -0.55, 0.2, -0.05, 0, 0, 0, 0];
const P_DASH = [0, 2.8, 0.1, 0, 0, 14, 0.95, 3.2, -0.45, -0.95, 3.4, 0.55, 0.45, 0.35, 0.6, -0.45, 0.25, -0.5, 0, 0, 0, 0];
const P_DRIB = [0, 2.82, 0, -12, -16, 10, 0.75, 3.7, 0.8, -1.0, 3.6, 0.8, 0.62, 0.2, 0.25, -0.55, 0.2, -0.2, 0, 0, 0, 0];
const poseB = [];
function mixPose(a, b, u, out) { for (let n = 0; n < a.length; n++) out[n] = a[n] + (b[n] - a[n]) * u; return out; }

function makePlayer(T, G, o) {
  const root = new T.Group();
  root.scale.setScalar(PS);
  const skin = new T.MeshPhongMaterial({ color: o.skin, specular: 0x3a2a22, shininess: 28 });
  const jersey = new T.MeshPhongMaterial({ map: o.jersey, specular: 0x444466, shininess: 30 });
  const shortsA = new T.MeshPhongMaterial({ map: o.shorts[0], specular: 0x5555aa, shininess: 40, side: T.DoubleSide });
  const shortsB = new T.MeshPhongMaterial({ map: o.shorts[1], specular: 0x5555aa, shininess: 40, side: T.DoubleSide });
  const sock = new T.MeshLambertMaterial({ color: 0xf2f2f8, side: T.DoubleSide });
  const shoeM = new T.MeshPhongMaterial({ color: 0xf4f6ff, specular: 0xffffff, shininess: 80, envMap: G.env, combine: T.AddOperation, reflectivity: 0.12, side: T.DoubleSide });
  const glowM = new T.MeshBasicMaterial({ color: 0x3ff0ff });
  const hairM = new T.MeshLambertMaterial({ color: 0x1c120c });
  const visorM = new T.MeshPhongMaterial({ color: 0x0a0a14, specular: 0xffffff, shininess: 140, envMap: G.env, combine: T.AddOperation, reflectivity: 0.5, side: T.DoubleSide });
  function add(geo, mat, parent) { const m = new T.Mesh(geo, mat); (parent || root).add(m); return m; }
  const hips = new T.Group(); root.add(hips);
  add(G.pelvis, shortsB, hips);
  const upper = new T.Group(); root.add(upper);
  add(G.torso, jersey, upper); add(G.neck, skin, upper);
  const head = new T.Group(); head.position.set(0, 2.6, 0.04); upper.add(head);
  add(G.head, skin, head); add(G.hair, hairM, head); add(G.visor, visorM, head); add(G.band, glowM, head);
  const arm = [0, 1].map(function (s) { return { up: add(G.uarm, skin), lo: add(G.farm, skin), hand: add(G.hand[s], skin) }; });
  const leg = [0, 1].map(function (s) {
    return { th: add(G.thigh, skin), sh: add(G.shin, skin), sock: add(G.sock, sock), shoe: add(G.shoe, shoeM), sole: add(G.sole, glowM), shorts: add(G.shortL, s ? shortsB : shortsA) };
  });
  const wrist = add(G.wrist, glowM);
  return { root: root, hips: hips, upper: upper, head: head, arm: arm, leg: leg, wrist: wrist, glow: glowM };
}

// Elbow or knee: the joint between A and B for bones l1 and l2, bent toward "pole".
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
// Put every part where the pose says. ball: where the ball is (his space), so the palms turn to it.
function applyPose(P, v, ball) {
  const t = TV, hy = v[3] * DEG, uy = v[4] * DEG, ch = Math.cos(hy), sh = Math.sin(hy), cu = Math.cos(uy), su = Math.sin(uy);
  P.hips.position.set(v[0], v[1], v[2]); P.hips.rotation.y = hy;
  P.upper.position.set(v[0], v[1], v[2]); P.upper.rotation.set(v[5] * DEG, uy, 0, "YXZ");
  P.upper.updateMatrix();
  P.head.rotation.y = (v[18] - v[4]) * DEG;
  t.fwd.set(su, 0, cu);
  for (let s = 0; s < 2; s++) {
    const sg = s ? -1 : 1, L = P.arm[s];
    t.a.set(sg * 0.66, 1.84, -0.02).applyMatrix4(P.upper.matrix);                        // shoulder
    t.b.set(v[6 + s * 3], v[7 + s * 3], v[8 + s * 3]);                                   // palm
    t.c.subVectors(t.b, t.a); t.c.multiplyScalar(-0.24 / (t.c.length() || 1)).add(t.b);  // wrist
    t.p.set(sg * 0.5 * cu - 0.5 * su, -0.8, -sg * 0.5 * su - 0.5 * cu);                   // elbows hang down, out and a little back
    if (s === 1 && v[21] > 0) t.p.lerp(t.g.set(su * 0.7 - cu * 0.2, -0.45, cu * 0.7 + su * 0.2), v[21]);   // the shooting elbow tucks under the ball
    bend(t.a, t.c, t.p, 1.15, 1.12, t.e);
    orient(L.up, t.a, t.e, t.h.subVectors(t.c, t.e), t.fwd, 1.15);                      // biceps toward the bend
    orient(L.lo, t.e, t.c, t.h.subVectors(t.a, t.e), t.fwd, 1.12);
    // the hand: fingers on along the forearm, palm to the ball (or to the hoop, or in to the leg), then the wrist
    const Y = PT.hy.subVectors(t.c, t.e).normalize();
    if (ball) PT.ht.set(ball[0], ball[1], ball[2]);
    else if (s === 1 && v[21] > 0.5) PT.ht.copy(t.c).add(t.fwd);
    else PT.ht.set(0, t.c.y, t.c.z);
    const Z = PT.hz.subVectors(t.c, PT.ht);
    Z.addScaledVector(Y, -Z.dot(Y));
    if (Z.lengthSq() < 1e-8) { Z.copy(t.fwd).negate(); Z.addScaledVector(Y, -Z.dot(Y)); }
    Z.normalize();
    const f = v[19 + s] * DEG, cf = Math.cos(f), sf = Math.sin(f);
    PT.hy2.copy(Y).multiplyScalar(cf).addScaledVector(Z, -sf);
    PT.hz2.copy(Z).multiplyScalar(cf).addScaledVector(Y, sf);
    PT.hx.crossVectors(PT.hy2, PT.hz2);
    PT.m.makeBasis(PT.hx, PT.hy2, PT.hz2);
    L.hand.quaternion.setFromRotationMatrix(PT.m); L.hand.position.copy(t.c);
    if (s === 1) {                                         // the wristband, just up the forearm from the hand
      t.g.subVectors(t.e, t.c).normalize();
      t.h.copy(t.c).addScaledVector(t.g, 0.05); t.k.copy(t.c).addScaledVector(t.g, 0.22);
      orient(P.wrist, t.h, t.k, PT.hz, t.fwd, 0.17);
    }
  }
  t.g.set(sh, 0, ch);                                       // which way the hips face
  for (let s = 0; s < 2; s++) {
    const sg = s ? -1 : 1, L = P.leg[s];
    t.a.set(v[0] + sg * 0.36 * ch, v[1] - 0.1, v[2] - sg * 0.36 * sh);                // hip joint
    t.b.set(v[12 + s * 3], v[13 + s * 3] + 0.05, v[14 + s * 3]);                       // ankle
    t.p.set(sh + sg * 0.2 * ch, 0.2, ch - sg * 0.2 * sh);                               // knees point where the hips face
    bend(t.a, t.b, t.p, 1.5, 1.48, t.e);
    orient(L.th, t.a, t.e, t.h.subVectors(t.e, t.b), t.g, 1.5);                         // quads to the front
    orient(L.sh, t.e, t.b, t.h.subVectors(t.e, t.a), t.g, 1.48);                        // shin to the front, calf behind
    t.c.subVectors(t.e, t.a).normalize(); t.h.copy(t.a); t.h.y += 0.12; t.k.copy(t.h).addScaledVector(t.c, 0.85);
    orient(L.shorts, t.h, t.k, t.g, t.g, 0.85);
    t.c.subVectors(t.e, t.b).normalize(); t.k.copy(t.b).addScaledVector(t.c, 0.42);
    orient(L.sock, t.b, t.k, t.g, t.g, 0.42);
    L.shoe.position.copy(t.b); L.shoe.rotation.set(0, hy + sg * 0.1, 0);
    L.sole.position.copy(t.b); L.sole.rotation.copy(L.shoe.rotation);
  }
}

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x07061a, 1);
  const scene = new T.Scene();
  scene.fog = new T.Fog(0x0a0824, 26, 62);
  const camera = new T.PerspectiveCamera(48, W / H, 0.3, 200);
  const caps = renderer.capabilities;
  const aniso = Math.min(4, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  const V3 = function () { return new T.Vector3(); };
  TV = { a: V3(), b: V3(), c: V3(), d: V3(), e: V3(), g: V3(), h: V3(), k: V3(), p: V3(), q: V3(), fwd: V3(), up: new T.Vector3(0, 1, 0) };
  PT = { x: V3(), y: V3(), z: V3(), hx: V3(), hy: V3(), hz: V3(), ht: V3(), hy2: V3(), hz2: V3(), m: new T.Matrix4() };

  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = aniso;
    return t;
  }
  function decal(mat, order) { mat.transparent = true; mat.depthWrite = false; mat._order = order; return mat; }
  function add(mesh, parent) { if (mesh.material && mesh.material._order) mesh.renderOrder = mesh.material._order; (parent || scene).add(mesh); return mesh; }
  // Things that show in the glossy floor: the floor pass renders layer 1 upside down first.
  function refl(o) { o.traverse(function (c) { c.layers.enable(1); }); return o; }
  function flat(w, d, x, y, z, mat) {
    const g = new T.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
    const m = new T.Mesh(g, mat); m.position.set(x, y, z);
    return add(m);
  }

  const script = scriptCanvas(scriptImg);
  const cScript = mkCanvas(1024, 512); cScript.getContext("2d").drawImage(script, 8, 8, 1008, 496);
  const tScript = tex(cScript), tCourt = tex(courtCanvas(script)), tFloor = tex(floorCanvas(), true);
  const tNet = tex(netCanvas(), true), tGlow = tex(glowCanvas()), tRing = tex(ringCanvas()), tShadow = tex(shadowCanvas());
  const tGlass = tex(glassCanvas(script)), tSeat = tex(seatCanvas(false), true), tSeatP = tex(seatCanvas(true), true), tUpper = tex(upperCanvas(), true);
  const cClock = mkCanvas(512, 200), tClock = tex(cClock);
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;
  const ballTex = {};
  Object.keys(KINDS).forEach(function (k) { ballTex[k] = tex(ballCanvas(script, k), true); ballTex[k].wrapT = T.ClampToEdgeWrapping; });

  /* lights: white from overhead, cyan and magenta neon from the sides */
  const lights = [new T.HemisphereLight(0xc8ccff, 0x2a1450, 1.35)];
  const key = new T.DirectionalLight(0xffffff, 2.0); key.position.set(-4, 12, 10); lights.push(key);
  const rimL = new T.DirectionalLight(0xff4fd8, 1.3); rimL.position.set(5, 6, -9); lights.push(rimL);
  const fill = new T.DirectionalLight(0x3ff0ff, 0.9); fill.position.set(9, 4, 6); lights.push(fill);
  lights.forEach(function (l) { l.layers.enableAll(); scene.add(l); });

  /* the floor: dark glass, so the hoop, the shooter and the neon show in it */
  const floorMat = new T.MeshPhongMaterial({ map: tFloor, specular: 0x6a6aa8, shininess: 70, transparent: true, opacity: 0.82, depthWrite: false });
  const floorGeo = new T.PlaneGeometry(60, 60); floorGeo.rotateX(-Math.PI / 2);
  (function () { const uv = floorGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 25, uv.getY(i) * 25); })();
  const floor = new T.Mesh(floorGeo, floorMat); floor.position.set(0, 0, 6); floor.renderOrder = 0; scene.add(floor);
  flat(COURT.m, COURT.m, COURT.x0 + COURT.m / 2, 0.004, COURT.z0 + COURT.m / 2, decal(new T.MeshBasicMaterial({ map: tCourt }), 1));
  const hoopPool = flat(3.6, 3.6, 0, 0.006, -0.6, decal(new T.MeshBasicMaterial({ map: tGlow, color: 0x3ff0ff, opacity: 0.35, blending: T.AdditiveBlending }), 2));

  /* the stands, the parapet with the ribbon board, the upper bowl */
  const path = standPath(15);
  const seatMat = new T.MeshLambertMaterial({ map: tSeat, side: T.DoubleSide });
  const darkMat = new T.MeshLambertMaterial({ color: 0x0b0824, side: T.DoubleSide });
  const trimMat = new T.MeshBasicMaterial({ color: 0x3ff0ff, side: T.DoubleSide }), trimPink = new T.MeshBasicMaterial({ color: 0xff3fd8, side: T.DoubleSide });
  scene.add(new T.Mesh(sweep(T, path, [[0, 0, 0, 0, FRONT_H, 1]]), darkMat));
  scene.add(new T.Mesh(sweep(T, path, [[0, FRONT_H, 0, 0, FRONT_H + 0.06, 1], [0, FRONT_H + 0.06, 0, 0.12, FRONT_H + 0.06, 1]]), trimMat));
  const steps = [];
  for (let j = 0; j < ROWS; j++) {
    const k = j * TREAD, y = FRONT_H + j * RISE;
    if (j) steps.push([k, y - RISE, 0, k, y, 0.5, j * 0.37]);
    steps.push([k, y, 0.5, k + TREAD, y, 1, j * 0.37]);
  }
  const seats = new T.Mesh(sweep(T, path, steps, function (p) { return p.len / 5; }), seatMat);
  scene.add(seats);
  scene.add(new T.Mesh(sweep(T, path, [[PARA_K, STAND_TOP, 0, PARA_K, LED_Y0 - 0.15, 1], [PARA_K, LED_Y0 + LED_HT + 0.15, 0, PARA_K, LED_Y0 + LED_HT + 0.55, 1]]), darkMat));
  scene.add(new T.Mesh(sweep(T, path, [[PARA_K - 0.01, LED_Y0 + LED_HT + 0.55, 0, PARA_K - 0.01, LED_Y0 + LED_HT + 0.62, 1]]), trimPink));
  scene.add(new T.Mesh(sweep(T, path, [[PARA_K - 0.01, LED_Y0 - 0.22, 0, PARA_K - 0.01, LED_Y0 - 0.15, 1]]), trimMat));
  scene.add(new T.Mesh(sweep(T, path, [[PARA_K, LED_Y0 + LED_HT + 0.62, 0, PARA_K + 1.2, 22, 1]], function (p) { return p.len / 6; }), new T.MeshBasicMaterial({ map: tUpper, side: T.DoubleSide })));

  /* the crowd: seated fans at life size, instanced (one draw call per part). They bounce on big moments. */
  const crowdU = { uTime: { value: 0 }, uCheer: { value: 0 } };
  function cheering(mat) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = crowdU.uTime; sh.uniforms.uCheer = crowdU.uCheer;
      sh.vertexShader = "uniform float uTime;\nuniform float uCheer;\n" + sh.vertexShader.replace("#include <begin_vertex>",
        "#include <begin_vertex>\n#ifdef USE_INSTANCING\n  float npPh = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;\n" +
        "  float npUp = uCheer * (0.25 + 0.75 * abs(sin(uTime * 8.0 + npPh)));\n" +
        "  transformed.y += npUp * 0.22;\n  transformed.y += npUp * max(0.0, transformed.y - 0.9) * 0.6;\n#endif");
    };
    return mat;
  }
  const fg = fanGeos(T), rnd = rng(77), seatsAt = [];
  for (let j = 0; j < ROWS - 1; j++) {
    const k = j * TREAD + 0.48, y = FRONT_H + j * RISE;
    let d = rnd() * 0.5;
    for (let i = 1; i < path.length; i++) {
      const p0 = path[i - 1], p1 = path[i];
      while (d <= p1.len) {
        const u = (d - p0.len) / Math.max(1e-6, p1.len - p0.len), nx = p0.nx + (p1.nx - p0.nx) * u, nz = p0.nz + (p1.nz - p0.nz) * u;
        const x = p0.x + (p1.x - p0.x) * u + nx * k, z = p0.z + (p1.z - p0.z) * u + nz * k;
        if (rnd() < 0.86 && z < 13) seatsAt.push(x, y, z, Math.atan2(-nx, -nz));
        d += 0.66 + rnd() * 0.1;
      }
    }
  }
  const nFans = seatsAt.length / 4, fanMats = [cheering(new T.MeshLambertMaterial({ vertexColors: true })), cheering(new T.MeshLambertMaterial({ vertexColors: true }))];
  const fans = [new T.InstancedMesh(fg.shirt, fanMats[0], nFans), new T.InstancedMesh(fg.body, fanMats[1], nFans)];   // the front rows come first, so a partial count keeps them
  (function () {
    const m = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), col = new T.Color(), v = new T.Vector3(), up = new T.Vector3(0, 1, 0);
    for (let i = 0; i < nFans; i++) {
      const z = 0.94 + rnd() * 0.12;
      sc.set(z, z, z); q.setFromAxisAngle(up, seatsAt[i * 4 + 3]);
      m.compose(v.set(seatsAt[i * 4], seatsAt[i * 4 + 1], seatsAt[i * 4 + 2]), q, sc);
      for (let k = 0; k < 2; k++) fans[k].setMatrixAt(i, m);
      fans[0].setColorAt(i, col.set(FAN_COLS[Math.floor(rnd() * FAN_COLS.length)]));
      fans[1].setColorAt(i, col.set(SKIN_COLS[Math.floor(rnd() * SKIN_COLS.length)]));
    }
    fans.forEach(function (f) { f.instanceMatrix.needsUpdate = true; f.instanceColor.needsUpdate = true; f.frustumCulled = false; scene.add(f); });
  })();

  /* LED ribbon boards: the long one on the parapet and the courtside one under the hoop */
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas());
  tDot.wrapS = tDot.wrapT = T.RepeatWrapping; tDot.anisotropy = aniso;
  const csChunk = T.ShaderChunk && T.ShaderChunk.colorspace_fragment ? "colorspace_fragment" : "encodings_fragment";
  function ledMat(level, u0, u1) {
    return new T.ShaderMaterial({
      uniforms: { tLed: { value: tLed }, tDot: { value: tDot }, grid: { value: new T.Vector2(LED_COLS, LED_ROWS) }, level: { value: level }, span: { value: new T.Vector2(u0, u1) } },
      side: T.DoubleSide,
      vertexShader: "uniform vec2 span;\nvarying vec2 vUv;\nvoid main() {\n  vUv = vec2(mix(span.x, span.y, uv.x), uv.y);\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
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
  }
  // the parapet board starts 5 m up each side and wraps behind the hoop: right side, back, left side = the three sections
  const ledPath = standPath(5), ledLen = ledPath[ledPath.length - 1].len;
  const ribbon = new T.Mesh(sweep(T, ledPath, [[PARA_K - 0.02, LED_Y0, 0, PARA_K - 0.02, LED_Y0 + LED_HT, 1]], function (p) { return 1 - p.len / ledLen; }), ledMat(1, 0, 1));
  scene.add(refl(ribbon));
  const courtLed = new T.Mesh(new T.PlaneGeometry(12, 0.92), ledMat(0.95, 1 / 3, 2 / 3));
  courtLed.position.set(0, 0.5, WALL_Z + 0.09); scene.add(refl(courtLed));
  const courtHouse = new T.Mesh(new T.BoxGeometry(12.3, 1.05, 0.14), new T.MeshLambertMaterial({ color: 0x05040e }));
  courtHouse.position.set(0, 0.52, WALL_Z + 0.02); scene.add(courtHouse);

  /* banners and the neon halo over the court */
  [[-5.2, "THENOSTALGIAPRO.COM"], [5.2, "FREE TO PLAY"]].forEach(function (b) {
    const m = new T.Mesh(new T.PlaneGeometry(3.0, 4.12), new T.MeshBasicMaterial({ map: tex(bannerCanvas(script, b[1])), fog: true }));
    m.position.set(b[0], 11.0, WALL_Z - PARA_K + 0.6); scene.add(m);
  });
  const halo = new T.Mesh(new T.TorusGeometry(7.5, 0.09, 8, 90), new T.MeshBasicMaterial({ color: 0x3ff0ff }));
  halo.rotation.x = Math.PI / 2; halo.position.set(0, 14.5, 3); scene.add(halo);
  const halo2 = new T.Mesh(new T.TorusGeometry(7.0, 0.06, 8, 90), new T.MeshBasicMaterial({ color: 0xff3fd8 }));
  halo2.rotation.x = Math.PI / 2; halo2.position.set(0, 14.2, 3); scene.add(halo2);

  /* the hoop: glass, neon frame, game clock, rim, net, an arm back to a pylon on a hover base. It all rides the rail. */
  const hoop = new T.Group(); scene.add(hoop);
  const glassMat = new T.MeshPhongMaterial({ color: 0xbfe8ff, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.22, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.25, depthWrite: false });
  const glass = new T.Mesh(new T.BoxGeometry(BOARD_HW * 2, BOARD_Y1 - BOARD_Y0, 0.04), glassMat);
  glass.position.set(0, (BOARD_Y0 + BOARD_Y1) / 2, BOARD_Z - 0.02); glass.renderOrder = 3; hoop.add(glass);
  const glassFace = new T.Mesh(new T.PlaneGeometry(BOARD_HW * 2, BOARD_Y1 - BOARD_Y0), decal(new T.MeshBasicMaterial({ map: tGlass }), 4));
  glassFace.position.set(0, (BOARD_Y0 + BOARD_Y1) / 2, BOARD_Z + 0.002); glassFace.renderOrder = 4; hoop.add(glassFace);
  const neonC = new T.MeshBasicMaterial({ color: 0x3ff0ff }), neonP = new T.MeshBasicMaterial({ color: 0xff3fd8 });
  const fw = BOARD_HW * 2, fh = BOARD_Y1 - BOARD_Y0, ft = 0.045;
  [[0, BOARD_Y1, fw + ft, ft], [0, BOARD_Y0, fw + ft, ft], [-BOARD_HW, (BOARD_Y0 + BOARD_Y1) / 2, ft, fh], [BOARD_HW, (BOARD_Y0 + BOARD_Y1) / 2, ft, fh]].forEach(function (f) {
    const m = new T.Mesh(new T.BoxGeometry(f[2], f[3], 0.07), neonC); m.position.set(f[0], f[1], BOARD_Z - 0.02); hoop.add(m);
  });
  const clockFace = new T.MeshBasicMaterial({ map: tClock }), bodyMat = new T.MeshPhongMaterial({ color: 0x1a1240, specular: 0x8888cc, shininess: 60 });
  const clockBox = new T.Mesh(roundBox(T, 0.9, 0.36, 0.2, 0.04), [bodyMat, bodyMat, bodyMat, bodyMat, clockFace, bodyMat]);
  clockBox.position.set(0, BOARD_Y1 + 0.22, BOARD_Z - 0.06); hoop.add(clockBox);
  const rimMat = new T.MeshPhongMaterial({ color: 0xff7a1a, emissive: 0xff4a00, emissiveIntensity: 0.6, specular: 0xffffff, shininess: 90 });
  const rim = new T.Mesh(new T.TorusGeometry(RIM_R, TUBE, 10, 44), rimMat); rim.rotation.x = Math.PI / 2; rim.position.y = RIM_Y; hoop.add(rim);
  const rimGlow = new T.Mesh(new T.RingGeometry(RIM_R - 0.05, RIM_R + 0.09, 40), new T.MeshBasicMaterial({ map: tGlow, color: 0xff7a1a, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
  rimGlow.rotation.x = -Math.PI / 2; rimGlow.position.y = RIM_Y + 0.005; hoop.add(rimGlow);
  const bracket = new T.Mesh(new T.BoxGeometry(0.16, 0.05, RIM_R + 0.12), bodyMat); bracket.position.set(0, RIM_Y - 0.02, -RIM_R - 0.06); hoop.add(bracket);
  const netGeo = new T.CylinderGeometry(RIM_R * 0.97, RIM_R * 0.55, 0.42, 18, 4, true); netGeo.translate(0, -0.21, 0);
  (function () { const uv = netGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 3); })();
  const netBase = Float32Array.from(netGeo.attributes.position.array);
  const net = new T.Mesh(netGeo, new T.MeshBasicMaterial({ map: tNet, transparent: true, alphaTest: 0.35, side: T.DoubleSide, color: 0xe8f6ff }));
  net.position.y = RIM_Y - 0.01; hoop.add(net);
  const armMat = new T.MeshPhongMaterial({ color: 0x241a5a, specular: 0x9999dd, shininess: 70, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12 });
  const arm = new T.Mesh(roundBox(T, 0.22, 0.22, -RAIL_Z - 0.45, 0.06), armMat);
  arm.position.set(0, 3.55, (-0.45 + RAIL_Z) / 2); hoop.add(arm);
  const pylon = new T.Mesh(roundBox(T, 0.42, 3.55, 0.42, 0.1), armMat); pylon.position.set(0, 0.3 + 3.55 / 2, RAIL_Z); hoop.add(pylon);
  const stripe = new T.Mesh(new T.BoxGeometry(0.06, 3.2, 0.02), neonP); stripe.position.set(0, 2.05, RAIL_Z + 0.215); hoop.add(stripe);
  [-0.16, 0.16].forEach(function (x) { const s = new T.Mesh(new T.BoxGeometry(0.025, 3.2, 0.02), neonC); s.position.set(x, 2.05, RAIL_Z + 0.215); hoop.add(s); });
  const base = new T.Mesh(roundBox(T, 1.5, 0.28, 1.1, 0.1), armMat); base.position.set(0, 0.32, RAIL_Z); hoop.add(base);
  const baseGlow = new T.Mesh(new T.BoxGeometry(1.4, 0.03, 1.0), neonC); baseGlow.position.set(0, 0.17, RAIL_Z); hoop.add(baseGlow);
  refl(hoop);

  /* the shooter */
  const G = bodyGeos(T); G.env = tEnv;
  const shooter = makePlayer(T, G, { jersey: tex(jerseyCanvas(script)), shorts: [tex(shortsCanvas(true)), tex(shortsCanvas(false))], skin: 0x8a5232 });
  scene.add(refl(shooter.root));
  const shadowMat = decal(new T.MeshBasicMaterial({ map: tShadow, opacity: 0.6 }), 3);
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
  const pShadow = add(new T.Mesh(unit, shadowMat));
  const footGlow = add(new T.Mesh(unit, decal(new T.MeshBasicMaterial({ map: tGlow, color: 0x3ff0ff, opacity: 0.5, blending: T.AdditiveBlending }), 3)));

  /* balls: one for his hands, a pool for the air */
  const ballGeo = new T.SphereGeometry(BALL_R, 28, 18), ballMats = {};
  Object.keys(KINDS).forEach(function (k) {
    ballMats[k] = new T.MeshPhongMaterial({ map: ballTex[k], specular: 0x555555, shininess: 40, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.06,
      emissive: k === "std" ? 0x000000 : new T.Color(KINDS[k].col).multiplyScalar(0.25) });
  });
  function makeBall() {
    const m = new T.Mesh(ballGeo, ballMats.std);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: 0xffffff, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
    glow.scale.set(0.75, 0.75, 1); m.add(glow);
    const sh = add(new T.Mesh(unit, shadowMat.clone())); sh.material._order = 3; sh.renderOrder = 3;
    scene.add(refl(m));
    return { mesh: m, glow: glow, shadow: sh, q: new T.Quaternion() };
  }
  const handBall = makeBall(), pool = [];
  handBall.glow.material.depthTest = false; handBall.glow.renderOrder = 9;   // a special ball's aura still shows when his body is in the way
  for (let i = 0; i < 8; i++) pool.push(makeBall());
  const tport = new T.Sprite(new T.SpriteMaterial({ map: tRing, color: 0x3ff0ff, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
  tport.visible = false; scene.add(refl(tport));

  /* the bonus drone: a gold ring with a little body and two rotors */
  const drone = new T.Group();
  const dRing = new T.Mesh(new T.TorusGeometry(0.3, 0.04, 10, 36), new T.MeshBasicMaterial({ color: 0xffd23f })); drone.add(dRing);
  const dRing2 = new T.Mesh(new T.TorusGeometry(0.25, 0.012, 6, 36), new T.MeshBasicMaterial({ color: 0xff3fd8 })); drone.add(dRing2);
  const dBody = new T.Mesh(roundBox(T, 0.34, 0.14, 0.2, 0.05), armMat); dBody.position.y = 0.4; drone.add(dBody);
  const dEye = new T.Mesh(new T.SphereGeometry(0.04, 10, 8), new T.MeshBasicMaterial({ color: 0x3ff0ff })); dEye.position.set(0, 0.4, 0.11); drone.add(dEye);
  const rotors = [-1, 1].map(function (s) {
    const r = new T.Mesh(new T.CylinderGeometry(0.13, 0.13, 0.01, 16), new T.MeshBasicMaterial({ color: 0x9aa4ff, transparent: true, opacity: 0.45 }));
    r.position.set(s * 0.26, 0.49, 0); drone.add(r); return r;
  });
  const dGlow = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: 0xffd23f, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
  dGlow.scale.set(1.0, 1.0, 1); drone.add(dGlow);
  drone.visible = false; scene.add(refl(drone));
  const boom = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: 0xffe9a0, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
  boom.visible = false; scene.add(refl(boom));

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, script: script, floorMat: floorMat, seats: seats, seatMats: [seatMat, new T.MeshLambertMaterial({ map: tSeatP, side: T.DoubleSide })],
    fans: fans, nFans: nFans, crowdU: crowdU, hoop: hoop, rimMat: rimMat, rimGlow: rimGlow, net: net, netGeo: netGeo, netBase: netBase, cClock: cClock, tClock: tClock, hoopPool: hoopPool,
    shooter: shooter, pShadow: pShadow, footGlow: footGlow, handBall: handBall, pool: pool, ballMats: ballMats, tport: tport,
    drone: drone, dRing: dRing, rotors: rotors, boom: boom, halo: halo, halo2: halo2,
    camPos: new T.Vector3(0, 3, 12), camTgt: new T.Vector3(0, 2.4, 0), camReady: false, v: new T.Vector3(), v2: new T.Vector3(), handPos: new T.Vector3(),
    qa: new T.Quaternion(), axis: new T.Vector3(),
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0,
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, reflectOn: true, crowdOn: 1, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
// pr = pixel ratio cap, refl = the glossy floor's reflections, crowd = how much of the 3D crowd is seated (front rows first; painted fans fill the rest)
const QUALITY = [{ pr: 2, refl: true, crowd: 1 }, { pr: 1.5, refl: true, crowd: 1 }, { pr: 1.15, refl: false, crowd: 0.55 }, { pr: 1, refl: false, crowd: 0 }];

function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  const Q = QUALITY[R.quality];
  if (Q.refl !== R.reflectOn) {
    R.reflectOn = Q.refl;
    const m = R.floorMat;
    m.transparent = Q.refl; m.opacity = Q.refl ? 0.82 : 1; m.depthWrite = !Q.refl; m.needsUpdate = true;
  }
  if (Q.crowd !== R.crowdOn) {
    R.crowdOn = Q.crowd;
    const n = Math.round(R.nFans * Q.crowd);
    for (let i = 0; i < R.fans.length; i++) { R.fans[i].count = n; R.fans[i].visible = n > 0; }
    R.seats.material = R.seatMats[Q.crowd >= 1 ? 0 : 1];
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
      setQuality(R.quality + 1);
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

// Arena point -> HUD pixels.
function toScreen(x, y, z) {
  R.v.set(x, y, z).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1 };
}

/* ---------------- Game state -> meshes ---------------- */
function shooterSpot(state) {
  if (state === "title" || state === "over") { const p = spotXZ(2); return { x: p.x, z: p.z, dash: 0 }; }
  if (S.dash) {
    const a = SPOTS[S.dash.from], b = SPOTS[S.dash.to], u = ease(S.dash.t / S.dash.dur);
    const ang = lerp(a.a, b.a, u) * DEG, r = lerp(a.r, b.r, u) - Math.sin(u * Math.PI) * (S.dash.to === 0 ? 1.2 : 0.3);
    return { x: r * Math.sin(ang), z: r * Math.cos(ang), dash: Math.sin(u * Math.PI), dir: Math.sign(b.a - a.a) };
  }
  const p = spotXZ(S.at);
  return { x: p.x, z: p.z, dash: 0 };
}

function syncScene(state, fdt) {
  const idle = state === "title" || state === "over", calm = Shell.reduced, T = R.T;
  R.clock += fdt;
  ledTick(fdt);
  const hx = idle ? 0 : S.hoopX;

  /* the hoop */
  R.hoop.position.x = hx;
  R.hoopPool.position.x = hx;
  if (V.rimFlash > 0) V.rimFlash = Math.max(0, V.rimFlash - fdt * 2.2);
  const hyper = !idle && tierOf(S.streak) === 3;
  R.rimMat.emissiveIntensity = 0.6 + V.rimFlash * 2.2 + (hyper && !calm ? 0.6 + 0.4 * Math.sin(R.clock * 10) : 0);
  R.rimGlow.material.opacity = 0.45 + V.rimFlash * 0.55;
  R.rimGlow.material.color.set(hyper ? 0xffd23f : 0xff7a1a);
  // the net swings when a ball drops through
  if (V.netT > 0) V.netT = Math.max(0, V.netT - fdt * 1.6);
  {
    const p = R.netGeo.attributes.position, base = R.netBase, k = calm ? 0 : V.netT;
    for (let i = 0; i < p.count; i++) {
      const y = base[i * 3 + 1], d = -y / 0.42;
      const sway = Math.sin(R.clock * 22 - d * 4) * 0.035 * k * d;
      p.setXYZ(i, base[i * 3] * (1 - 0.18 * k * d), y * (1 + 0.28 * k * Math.sin(R.clock * 14)) , base[i * 3 + 2] * (1 - 0.18 * k * d) + sway);
    }
    p.needsUpdate = true;
  }
  // the game clock on the glass
  const ck = idle ? "title" : Math.ceil(Math.max(0, S.time)) + "|" + S.clutch;
  if (ck !== V.lastClock) { V.lastClock = ck; paintClock(R.cClock.getContext("2d"), idle ? ROUND_TIME : S.time, !idle && S.clutch); R.tClock.needsUpdate = true; }
  R.halo.rotation.z += fdt * 0.12; R.halo2.rotation.z -= fdt * 0.08;

  /* the shooter */
  const sp = shooterSpot(state), P = R.shooter;
  V.px = sp.x; V.pz = sp.z;
  const yawGoal = Math.atan2(hx * 0.5 - sp.x, -sp.z);
  V.yaw = yawGoal;
  let jump = 0, tilt = 0, ballLocal = null, glow = 0.35;
  const pose = poseB;
  if (idle) {
    // dribbling at the top of the key
    const u = (idleT * 1.9) % 1, by = 0.38 + 3.0 * Math.abs(Math.cos(Math.PI * u));
    mixPose(P_DRIB, P_DRIB, 0, pose);
    pose[9] = -1.02; pose[10] = Math.max(3.15, by + 0.43); pose[11] = 0.85; pose[1] += calm ? 0 : Math.sin(idleT * 3.8) * 0.04;
    ballLocal = [-1.02, by, 0.85];
  } else if (S.dash) {
    const u = S.dash.t / S.dash.dur, st = calm ? 0 : Math.sin(u * TAU * 1.5);
    mixPose(P_EMPTY, P_DASH, Math.sin(Math.min(1, u * 1.2) * Math.PI * 0.5), pose);
    pose[14] += st * 0.5; pose[17] -= st * 0.5; pose[13] += Math.max(0, st) * 0.3; pose[16] += Math.max(0, -st) * 0.3;
    tilt = -sp.dir * 0.22 * sp.dash;
    jump = sp.dash * 0.12;
    glow = 0.35 + sp.dash * 1.2;
  } else if (!S.hand && S.relT < DASH_AT + 0.2) {
    // up, out of the hand, follow through, land
    const t = S.relT;
    if (t < 0.09) mixPose(P_LOAD, P_REL, ease(t / 0.09), pose);                 // up through the legs, the arm extends
    else if (t < 0.3) mixPose(P_REL, P_FOLLOW, ease((t - 0.09) / 0.17), pose);  // the wrist flicks, hold the follow-through
    else mixPose(P_FOLLOW, P_LAND, ease((t - 0.3) / 0.16), pose);              // land soft on bent knees
    jump = Math.max(0, JUMP0 + 1.21 * t - 4.9 * t * t);
  } else if (S.charging) {
    const u = ease(S.chargeT / 0.2);
    mixPose(P_SET, P_LOAD, u, pose);
    if (!calm) { const dip = Math.sin(Math.min(1, S.chargeT / 0.5) * Math.PI) * 0.08; pose[1] -= dip; pose[7] -= dip * 0.5; pose[10] -= dip * 0.5; }   // a little dip in the knees as he gathers
    ballLocal = mixPose(BALL_SET, BALL_LOAD, u, []);
  } else if (S.hand || S.spawn !== null) {
    if (S.hand && S.holdT > 2.4 && !calm) {
      // waiting on you: he dribbles
      const u = ((S.holdT - 2.4) * 1.9) % 1, by = 0.38 + 3.0 * Math.abs(Math.cos(Math.PI * u));
      mixPose(P_DRIB, P_DRIB, 0, pose);
      pose[9] = -1.02; pose[10] = Math.max(3.15, by + 0.43); pose[11] = 0.85;
      ballLocal = [-1.02, by, 0.85];
    } else {
      mixPose(P_SET, P_SET, 0, pose);
      const bob = calm ? 0 : Math.sin(R.clock * 3) * 0.03;
      pose[1] += bob; pose[7] += bob; pose[10] += bob;
      ballLocal = [BALL_SET[0], BALL_SET[1] + bob, BALL_SET[2]];
    }
  } else {
    mixPose(P_LAND, P_EMPTY, ease((S.relT - DASH_AT) / 0.3), pose);
  }
  if (V.dbgPose) { mixPose(V.dbgPose.p, V.dbgPose.p, 0, pose); ballLocal = V.dbgPose.ball || null; jump = V.dbgPose.jump || 0; }   // checks only
  applyPose(P, pose, ballLocal);
  P.root.position.set(sp.x, jump, sp.z);
  P.root.rotation.set(0, V.yaw, tilt, "YXZ");
  P.root.updateMatrixWorld(true);
  V.dashGlow += (glow - V.dashGlow) * Math.min(1, fdt * 10);
  P.glow.color.setRGB(0.25 + 0.75 * Math.min(1, V.dashGlow), 0.94, 1);
  R.pShadow.position.set(sp.x, 0.008, sp.z); R.pShadow.scale.set(1.2 - jump, 1, 1.0 - jump);
  R.footGlow.position.set(sp.x, 0.01, sp.z); R.footGlow.scale.set(1.3, 1, 1.3); R.footGlow.material.opacity = 0.25 + 0.5 * Math.min(1, V.dashGlow);

  /* the ball in his hands (beamed in after each dash) */
  const hb = R.handBall;
  let spawnK = 1;
  if (!idle && S.spawn !== null) spawnK = clamp(S.spawn / SPAWN_T, 0, 1);
  const showHand = !!ballLocal && (idle || S.hand || S.spawn !== null) && !(S.ending && !S.hand);
  hb.mesh.visible = showHand;
  if (showHand) {
    R.v.set(ballLocal[0], ballLocal[1], ballLocal[2]); P.root.localToWorld(R.v);
    hb.mesh.position.copy(R.v); R.handPos.copy(R.v);
    hb.mesh.scale.setScalar(Math.max(0.01, spawnK));
    const kind = idle ? "std" : S.cur;
    hb.mesh.material = R.ballMats[kind];
    hb.glow.visible = kind !== "std"; hb.glow.material.color.setHex(KINDS[kind].glow);
    if (hb.glow.visible) hb.glow.material.opacity = 0.55 + (calm ? 0 : 0.25 * Math.sin(R.clock * 8));
    if (!calm) { R.qa.setFromAxisAngle(R.axis.set(1, 0, 0), fdt * (ballLocal[1] < 3.5 ? 14 : 1)); hb.q.premultiply(R.qa); }
    hb.mesh.quaternion.copy(hb.q);
    hb.shadow.visible = true; hb.shadow.position.set(R.v.x, 0.009, R.v.z);
    const sk = clamp(1 - R.v.y / 3, 0.25, 1); hb.shadow.scale.set(0.34 * sk + 0.08, 1, 0.34 * sk + 0.08);
  } else hb.shadow.visible = false;
  // the teleport ring when a ball arrives
  if (!idle && S.spawn !== null && S.spawn >= 0) {
    const u = S.spawn / SPAWN_T;
    R.tport.visible = true; R.tport.position.copy(R.handPos);
    R.tport.scale.setScalar(0.25 + u * 0.7); R.tport.material.opacity = 1 - u * 0.6; R.tport.material.color.setHex(KINDS[S.cur].glow);
  } else if (R.tport.visible) {
    R.tport.material.opacity -= fdt * 4; R.tport.scale.multiplyScalar(1 + fdt * 3);
    if (R.tport.material.opacity <= 0) R.tport.visible = false;
  }

  /* balls in the air */
  for (let i = 0; i < R.pool.length; i++) {
    const o = R.pool[i], b = idle ? null : S.balls[i];
    o.mesh.visible = !!b; o.shadow.visible = !!b;
    if (!b) continue;
    if (!b.vis) { b.vis = { x: R.handPos.x - b.x, y: R.handPos.y - b.y, z: R.handPos.z - b.z }; b.q = hb.q.clone(); }
    const k = Math.exp(-b.t / 0.06);
    o.mesh.position.set(b.x + b.vis.x * k, b.y + b.vis.y * k, b.z + b.vis.z * k);
    o.mesh.material = R.ballMats[b.kind];
    o.glow.visible = b.kind !== "std"; o.glow.material.color.setHex(KINDS[b.kind].glow);
    if (!calm) {
      const sp2 = Math.hypot(b.vx, b.vz) || 1;
      R.axis.set(-b.vz / sp2, 0, b.vx / sp2);                // backspin
      R.qa.setFromAxisAngle(R.axis, -fdt * 13);
      b.q.premultiply(R.qa);
    }
    o.mesh.quaternion.copy(b.q);
    const sk = clamp(1 - b.y / 5, 0.25, 1);
    o.shadow.position.set(b.x, 0.009, b.z); o.shadow.scale.set(0.36 * sk + 0.06, 1, 0.36 * sk + 0.06);
    o.shadow.material.opacity = 0.6 * sk;
    if (!calm && (b.trail.length === 0 || b.t - b.trail[b.trail.length - 1][3] > 0.022)) {
      b.trail.push([o.mesh.position.x, o.mesh.position.y, o.mesh.position.z, b.t]);
      if (b.trail.length > 18) b.trail.shift();
    }
  }

  /* the drone */
  const d = idle ? null : S.drone;
  R.drone.visible = !!d && !(d.hit && d.gone > 0.12);
  if (d) {
    R.drone.position.set(d.x, d.y, d.z);
    const fx = V.px - d.x, fz = V.pz - d.z;
    R.drone.rotation.set(0, Math.atan2(fx, fz), 0);
    R.drone.position.y += calm ? 0 : Math.sin(R.clock * 5) * 0.05;
    R.rotors[0].rotation.y += fdt * 40; R.rotors[1].rotation.y -= fdt * 40;
    R.dRing.rotation.z += fdt * (d.hit ? 20 : 2);
  }
  if (V.boom) {
    V.boom.t += fdt;
    const u = V.boom.t / 0.5;
    R.boom.visible = u < 1; R.boom.position.set(V.boom.x, V.boom.y, V.boom.z);
    R.boom.scale.setScalar(0.4 + u * 3.2); R.boom.material.opacity = 1 - u;
    if (u >= 1) V.boom = null;
  } else R.boom.visible = false;

  /* crowd */
  V.cheerT = Math.max(0, V.cheerT - fdt);
  V.cheer += ((V.cheerT > 0 ? 1 : 0) - V.cheer) * Math.min(1, fdt * 6);
  R.crowdU.uTime.value = R.clock; R.crowdU.uCheer.value = calm ? 0 : V.cheer;

  /* camera: over his shoulder, looking at the hoop; a slow orbit on the title and score screens */
  let cx, cy, cz, tx, ty, tz, rate = 6;
  if (idle) {
    const a = (calm ? 0 : Math.sin(idleT * 0.16) * 0.55);
    cx = Math.sin(a) * 12.5; cz = Math.cos(a) * 12.5; cy = 3.3;
    tx = 0; ty = 2.25; tz = 1.2; rate = 2.5;
  } else {
    const ux = sp.x - hx * 0.4, uz = sp.z, l = Math.hypot(ux, uz) || 1, nx = ux / l, nz = uz / l;
    cx = sp.x + nx * 3.5 + nz * 0.5; cz = sp.z + nz * 3.5 - nx * 0.5; cy = 2.95;
    tx = hx * 0.6 + sp.x * 0.12; ty = 2.25; tz = sp.z * 0.14;
  }
  if (!R.camReady) { R.camPos.set(cx, cy, cz); R.camTgt.set(tx, ty, tz); R.camReady = true; }
  const kk = 1 - Math.exp(-rate * fdt);
  R.camPos.x += (cx - R.camPos.x) * kk; R.camPos.y += (cy - R.camPos.y) * kk; R.camPos.z += (cz - R.camPos.z) * kk;
  R.camTgt.x += (tx - R.camTgt.x) * kk; R.camTgt.y += (ty - R.camTgt.y) * kk; R.camTgt.z += (tz - R.camTgt.z) * kk;
  if (V.dbgCam) { R.camPos.fromArray(V.dbgCam, 0); R.camTgt.fromArray(V.dbgCam, 3); }   // checks only
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (Math.random() * 2 - 1) * m; sy = (Math.random() * 2 - 1) * m;
  }
  R.camera.position.set(R.camPos.x + sx, R.camPos.y + sy, R.camPos.z);
  R.camera.lookAt(R.camTgt.x + sx, R.camTgt.y + sy, R.camTgt.z);
  R.camera.updateMatrixWorld();
}

// Two passes when the floor reflects: the shiny things upside down under the floor, then the arena over them.
function renderFrame() {
  const rd = R.renderer, sc = R.scene, cam = R.camera;
  if (R.reflectOn) {
    rd.autoClear = true;
    sc.scale.y = -1; cam.layers.set(1);
    rd.render(sc, cam);
    sc.scale.y = 1; cam.layers.set(0);
    rd.autoClear = false; rd.clearDepth();
    rd.render(sc, cam);
    rd.autoClear = true;
  } else rd.render(sc, cam);
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
const SEG = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg" };
function digit(c, ch, x, y, on, off) {
  const w = 13, h = 24, t = 3, segs = SEG[ch] || "";
  const map = { a: [t, 0, w - 2 * t, t], b: [w - t, t, t, h / 2 - t], c: [w - t, h / 2, t, h / 2 - t], d: [t, h - t, w - 2 * t, t],
                e: [0, h / 2, t, h / 2 - t], f: [0, t, t, h / 2 - t], g: [t, h / 2 - 1, w - 2 * t, t] };
  for (const k in map) { const m = map[k]; c.fillStyle = segs.indexOf(k) >= 0 ? on : off; c.fillRect(x + m[0], y + m[1], m[2], m[3]); }
}

// Things pinned to the 3D view: ball trails, the lead marker on a moving hoop, float text.
function drawWorld(c, state) {
  for (let i = 0; i < S.balls.length; i++) {
    const b = S.balls[i], col = KINDS[b.kind].col;
    for (let k = 0; k < b.trail.length; k++) {
      const p = toScreen(b.trail[k][0], b.trail[k][1], b.trail[k][2]);
      if (!p.ok) continue;
      const a = (k + 1) / b.trail.length;
      c.globalAlpha = 0.5 * a; c.fillStyle = b.kind === "std" ? "#3ff0ff" : col;
      c.beginPath(); c.arc(p.x, p.y, 1 + 2.4 * a, 0, TAU); c.fill();
    }
  }
  c.globalAlpha = 1;
  if (state !== "playing") return;
  // the lead marker: where the shot is pointed on a moving hoop
  if (S.hoopAmp > 0.05 && !S.ending) {
    // the ghost: where the hoop will be when a ball let go now gets there. Put the ring on it.
    const at = S.dash ? S.dash.to : S.at, pl = plan(relPoint(at), S.hoopX, 0, RIM_Y), gx = hoopXAt(pl.T);
    const gh = toScreen(gx, RIM_Y, 0), g0 = toScreen(gx + RIM_R, RIM_Y, 0), gr = Math.abs(g0.x - gh.x);
    c.setLineDash([4, 4]); c.lineWidth = 2; c.strokeStyle = "rgba(255,63,216,.85)";
    c.beginPath(); c.ellipse(gh.x, gh.y, gr * 1.1, gr * 0.38, 0, 0, TAU); c.stroke(); c.setLineDash([]);
    const ax = S.hoopX + S.lead + AUTO_LEAD * (gx - S.hoopX);
    const aim = toScreen(ax, RIM_Y, 0), r0 = toScreen(ax + RIM_R, RIM_Y, 0), rr = Math.abs(r0.x - aim.x);
    c.lineWidth = 2; c.strokeStyle = S.charging ? "#ffd23f" : "rgba(63,240,255,.75)";
    c.beginPath(); c.ellipse(aim.x, aim.y, rr * 1.1, rr * 0.38, 0, 0, TAU); c.stroke();
    if (Math.abs(S.lead) > 0.05) {
      const h0 = toScreen(S.hoopX, RIM_Y, 0);
      c.strokeStyle = "rgba(255,210,63,.8)"; c.beginPath(); c.moveTo(h0.x, h0.y + 10); c.lineTo(aim.x, aim.y + 10); c.stroke();   // the lead you added
    }
  }
  // float text, rising from the rim
  const h = toScreen(S.hoopX, RIM_Y + 0.5, 0);
  for (let i = 0; i < floats.length; i++) {
    const f = floats[i];
    if (f.t < 0) continue;
    const yy = Math.max(96, h.y - 18 - f.t * 46);
    c.globalAlpha = Math.max(0, 1 - f.t / 1.2);
    txt(c, f.txt, clamp(h.x, 70, W - 70), yy, f.small ? 12 : 17, f.col, "center", "#08041c");
  }
  c.globalAlpha = 1;
}

function drawMeter(c) {
  const z = zone(), x = 14, top = 318, hgt = 156;
  rrect(c, x - 4, top - 4, 24, hgt + 8, 7); c.fillStyle = "rgba(10,6,34,.82)"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = S.magnetT > 0 ? "#ff3fd8" : "#3ff0ff"; c.stroke();
  c.save(); rrect(c, x, top, 16, hgt, 4); c.clip();
  c.fillStyle = "#170f45"; c.fillRect(x, top, 16, hgt);
  const zy0 = top + hgt * (1 - (z.c + z.h)), zy1 = top + hgt * (1 - (z.c - z.h));
  c.fillStyle = "rgba(255,210,63,.22)"; c.fillRect(x, top + hgt * (1 - (z.c + z.h + FRINGE)), 16, hgt * (z.h * 2 + FRINGE * 2));   // the rattle zone
  c.fillStyle = "rgba(155,255,63,.55)"; c.fillRect(x, zy0, 16, zy1 - zy0);
  c.fillStyle = "rgba(220,255,180,.8)"; c.fillRect(x, top + hgt * (1 - (z.c + z.h * 0.45)), 16, hgt * z.h * 0.9);
  if (S.charging) {
    const p = S.power, inZ = Math.abs(p - z.c) <= z.h;
    c.fillStyle = inZ ? "#9bff3f" : p > z.c ? "#ff3b2e" : "#3ff0ff";
    c.globalAlpha = 0.85; c.fillRect(x, top + hgt * (1 - p), 16, hgt * p); c.globalAlpha = 1;
    c.fillStyle = "#ffffff"; c.fillRect(x - 2, top + hgt * (1 - p) - 1.5, 20, 3);
  }
  c.fillStyle = "rgba(255,255,255,.3)"; c.fillRect(x + 2, top, 3, hgt);
  c.restore();
  txt(c, "PWR", x + 8, top + hgt + 7, 9, "#ffffff", "center", "#08041c");
}

function drawRack(c) {
  const x0 = W - 16, y = 486;
  txt(c, "NEXT", x0, y - 32, 9, "#a8ecff", "right", "#08041c");
  for (let i = 0; i < S.queue.length; i++) {
    const k = KINDS[S.queue[i]], x = x0 - 9 - i * 22, r = i === 0 ? 9 : 7;
    c.beginPath(); c.arc(x, y - 8, r + 2, 0, TAU); c.fillStyle = "rgba(10,6,34,.85)"; c.fill();
    c.beginPath(); c.arc(x, y - 8, r, 0, TAU); c.fillStyle = k.col; c.fill();
    c.strokeStyle = "rgba(10,6,34,.8)"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - r, y - 8); c.lineTo(x + r, y - 8); c.stroke();
  }
  const nk = KINDS[S.queue[0]];
  if (nk.name) txt(c, nk.name, x0, y + 6, 9, nk.col, "right", "#08041c");
}

function drawHUD(c, state) {
  const bg = c.createLinearGradient(0, 0, 0, 56);
  bg.addColorStop(0, "#3a1a9e"); bg.addColorStop(0.5, "#22106a"); bg.addColorStop(1, "#120840");
  c.fillStyle = bg; c.fillRect(0, 0, W, 56);
  c.fillStyle = "rgba(255,255,255,.18)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#3ff0ff"; c.fillRect(0, 56, W, 2);
  c.fillStyle = "#ff3fd8"; c.fillRect(0, 58, W, 1);
  txt(c, "SCORE", 10, 7, 9, "#a8ecff", "left", "#08041c");
  txt(c, String(S.score), 10, 21, 22, "#ffe45c", "left", "#08041c");
  // the clock, in segments
  const t = Math.ceil(Math.max(0, S.time || 0)), str = Math.floor(t / 60) + ":" + ("0" + (t % 60)).slice(-2);
  const bx = W / 2 - 50, clutchBlink = S.clutch && state === "playing" && !Shell.reduced && t <= 5 && Math.floor(S.t * 4) % 2;
  rrect(c, bx, 5, 100, 34, 6); c.fillStyle = "#05030f"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = S.clutch ? "#ff3fd8" : "#3ff0ff"; c.stroke();
  const on = clutchBlink ? "#ffd23f" : S.clutch ? "#ff3fd8" : "#ff3b30", off = "#2a0d18";
  let cx = bx + 18;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === ":") { c.fillStyle = on; c.fillRect(cx + 1, 15, 3, 3); c.fillRect(cx + 1, 25, 3, 3); cx += 9; continue; }
    digit(c, str[i], cx, 10, on, off); cx += 19;
  }
  const lbl = S.round === "ot" ? "OVERTIME" : S.clutch ? "CLUTCH TIME x2" : "GAME CLOCK";
  txt(c, lbl, W / 2, 42, 9, S.round === "ot" ? "#ffd23f" : S.clutch ? "#ff3fd8" : "#8e93c2", "center");
  // combo
  const tier = tierOf(S.streak);
  txt(c, "COMBO", W - 10, 7, 9, "#a8ecff", "right", "#08041c");
  txt(c, "x" + (tier + 1), W - 10, 21, 22, TIER_COLS[tier], "right", "#08041c");
  const goal = [3, 6, 10][Math.min(2, tier)], from = [0, 3, 6][Math.min(2, tier)];
  if (tier < 3) for (let i = 0; i < goal - from; i++) {
    c.fillStyle = S.streak - from > i ? TIER_COLS[tier + 1] : "rgba(255,255,255,.18)";
    c.fillRect(W - 12 - (goal - from - i) * 9, 46, 7, 4);
  } else txt(c, "MAX", W - 10, 44, 8, "#ffd23f", "right");
  // under the bar
  const sp = SPOTS[S.dash ? S.dash.to : S.at];
  txt(c, sp.name + "  " + sp.pts + " PT", 10, 64, 10, sp.pts === 4 ? "#ffd23f" : "#ffffff", "left", "#08041c");
  txt(c, "MAKES " + S.makes + (S.round === "main" && S.makes < OT_NEED ? "/" + OT_NEED : ""), W - 10, 64, 10, "#ffffff", "right", "#08041c");
  let y2 = 78;
  if (S.magnetT > 0) { txt(c, "MAGNET RIM " + S.magnetT.toFixed(1), 10, y2, 10, "#ff3fd8", "left", "#08041c"); }
  if (S.hoopAmp > 0.05 && state === "playing" && !S.ending) txt(c, "HOOP ON THE MOVE", W - 10, y2, 10, "#3ff0ff", "right", "#08041c");
  if (state !== "playing" || S.ending) return;
  drawMeter(c);
  drawRack(c);
  // the ball in his hands, if it is a special
  const k = KINDS[S.cur];
  if (k.name && (S.hand || S.spawn !== null)) {
    const a = Shell.reduced ? 1 : 0.7 + 0.3 * Math.sin(S.t * 8);
    c.globalAlpha = a; txt(c, k.name + ": " + k.tag, W / 2, 506, 11, k.col, "center", "#08041c"); c.globalAlpha = 1;
  } else if (S.shots < 2) {
    txt(c, "HOLD TO CHARGE, LET GO IN THE GREEN", W / 2, 506, 10, "#ffffff", "center", "#08041c");
  } else if (S.hoopAmp > 0.05 && S.shots < 30 && !S.charging && S.lead === 0) {
    txt(c, "DRAG YOUR RING ONTO THE PINK GHOST", W / 2, 506, 10, "#a8ecff", "center", "#08041c");
  }
}

function draw(c, state) {
  Snd.pump();
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
    renderFrame();
    R.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  if (state === "playing" || state === "paused") drawWorld(c, state);
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    c.save(); c.translate(q.x, q.y); c.rotate(q.rot);
    c.globalAlpha = clamp(q.life * 2, 0, 1);
    c.fillStyle = q.c; c.fillRect(-2.5, -1.5, 5, 3);
    c.restore();
  }
  c.globalAlpha = 1;
  drawHUD(c, state);
}

/* ---------------- Splash, boot, shell hookup ---------------- */
function makeSplash() {
  const el = document.createElement("div");
  el.id = "npg-splash";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Nostalgia Pro Games");
  el.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;z-index:9999;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;gap:18px;padding:24px;box-sizing:border-box;text-align:center;" +
    "background:radial-gradient(circle at 50% 42%,#3a1a9e 0%,#160a4a 52%,#07061a 100%);" +
    "font:bold 15px/1.5 " + HUD_FONT.replace(/"/g, "'") + ";color:#ffffff;opacity:1;transition:opacity .35s ease";
  const img = document.createElement("img");
  img.alt = "";
  img.decoding = "async";
  img.style.cssText = "display:block;width:min(66vw,44vh,340px);height:auto;opacity:0;transform:scale(.86);" +
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "transition:opacity .2s ease" : "transition:opacity .28s ease,transform .55s cubic-bezier(.2,1.5,.4,1)");
  el.appendChild(img);
  const load = document.createElement("div");
  load.textContent = "LOADING THE ARENA";
  load.style.cssText = "font:bold 12px/1 " + HUD_FONT.replace(/"/g, "'") + ";letter-spacing:.2em;color:#3ff0ff;text-shadow:0 0 8px #3ff0ff";
  el.appendChild(load);
  document.body.appendChild(el);
  return { el: el, img: img, load: load };
}
function splashFail(splash, lines) {
  const el = splash.el;
  splash.img.style.width = "min(40vw,26vh,180px)";
  splash.load.style.display = "none";
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
function splashGone(splash) {
  splash.el.style.opacity = "0";
  splash.el.style.pointerEvents = "none";
  setTimeout(function () { if (splash.el.parentNode) splash.el.parentNode.removeChild(splash.el); }, 420);
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
  if (crt) crt.style.display = "none";                       // a glossy arena, no scanlines
  R.lastT = performance.now();
  layout();
}

function logoImg(maxH) {
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
  im.style.cssText = "display:block;width:clamp(64px," + maxH + ",108px);height:auto;margin:0 auto 6px";
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_URL;
  return im;
}

function startGame() {
  Shell.init({
    slug: "clutch-ball-4000",
    title: "CLUTCH BALL 4000",
    accent: "#3ff0ff",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "Sixty seconds of neon hoops in real 3D. Hold anywhere to charge the meter, let go in the green to shoot. Once the hoop starts sliding, drag sideways while you hold to lead it.",
    keys: "Keys: hold Space to charge, release to shoot. Left and right lead the hoop, down re-centers. P pause, M mute, N music, R restart.",
    tip: "Makes in a row build up to x4. Sink all five spots in a lap, zap the drone, and make 20 for overtime.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { if (paused) return; idleT += dt; updateFx(dt); },
    onPause: function () { paused = true; keys = {}; S.ptr = null; S.charging = false; S.queued = false; },
    onResume: function () { paused = false; }
  });
  attach();
  // Sound. Nothing is made until the first tap, click or key press; the band starts with the game.
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Snd.unlock, true); });
  Shell.onStart(Snd.newGame); Shell.onRestart(Snd.newGame); Shell.onResume(Snd.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));   // not while initials are being typed
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Snd.toggleMusic();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) { Snd.button(titleCard, titleCard.querySelector(".np-tip")); titleCard.insertBefore(logoImg("16vh"), titleCard.firstChild); }
  if (pauseActions) Snd.button(pauseActions, pauseActions.querySelector("a"));
  Snd.iconButton(document.querySelector(".np-bar"), document.getElementById("np-mute"));
  // The studio logo heads the score card too.
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) card.insertBefore(logoImg("14vh"), card.firstChild);
}

// Hook for automated checks (no effect on play)
window.__clutch = { S: function () { return S; }, shoot: shoot, zone: zone, plan: plan, relPoint: relPoint, spotXZ: spotXZ, stepBall: stepBall,
                    gfx: function () { return R; }, led: function () { return LED; }, snd: Snd, startMusic: startMusic, view: function () { return V; },
                    setQuality: function (q) { if (R) { R.qLock = true; setQuality(q); } },
                    poses: { SET: P_SET, LOAD: P_LOAD, REL: P_REL, FOLLOW: P_FOLLOW, LAND: P_LAND, EMPTY: P_EMPTY, DASH: P_DASH, DRIB: P_DRIB, BALL_SET: BALL_SET, BALL_LOAD: BALL_LOAD },
                    tick: function (sec) { for (let t = 0; t < sec && Shell.state() === "playing"; t += 1 / 60) update(1 / 60); } };

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
      splashGone(splash);
    })
    .catch(function (e) {
      console.error(e);
      splashFail(splash, e && e.npStage === "three"
        ? "Clutch Ball 4000 could not load its 3D engine (" + THREE_URL + ")."
        : "Clutch Ball 4000 needs WebGL for its 3D arena, and this browser has it switched off or does not support it.");
    });
})();
