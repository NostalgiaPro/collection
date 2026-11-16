/* VECTOR SIEGE (3D): neon tower defense on a glowing grid. Thirty waves, three grids, five towers.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a WebGL
   canvas that sits directly under the shell's 2D canvas. The shell canvas stays in charge of input,
   scaling and the title / pause / game over flow, and carries the HUD, the build dock and the beams.

   The board is a grid of COLS x ROWS cells, one unit each, lying on the ground (y = 0). Cell (c, r)
   has its center at x = c - (COLS - 1) / 2, z = r - (ROWS - 1) / 2: row 0 is the far edge by the
   back wall, the last row is nearest the camera. Enemies come out of a portal in the back wall and
   walk the path to the master tape. Every rule runs on that grid in units and seconds; the picture
   only reads from it. */

const W = 360, H = 540, TAU = Math.PI * 2, DEG = Math.PI / 180;
const COLS = 9, ROWS = 12;
const HUD_H = 44, DOCK_Y = 466;
const START_LIVES = 20, START_CREDITS = 150, WAVES = 30;
const FIRST_GAP = 22, WAVE_GAP = 12, SEND_LOCK = 1.0;    // seconds before wave 1, between waves, between two sends
const SPEEDS = [1, 2, 3];
const SELL_BACK = 0.7, BOSS_LEAK = 5;
const CAM_FOV = 34, CAM_PITCH = 57 * DEG;
const SAFE = { x1: 8, x2: W - 8, y1: HUD_H + 22, y2: DOCK_Y - 10 };   // where the board and its back wall have to fit on screen
const FLOOR_M = 0.4;                                      // the lit floor runs this far past the grid on every side
// The back wall: a dark base with the portal, the LED ribbon board, then the marquee sign. Heights in cells, leaning back.
const WALL = { z: -ROWS / 2 - 0.16, lean: 38 * DEG, w: COLS + 0.8, base: 0.7, led0: 0.76, ledH: 0.58, sign0: 1.42, signH: 1.08 };

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash, title card and score card
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every sign and decal on the board
const THREE_URL = "../shared/three.module.min.js";
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';

const NEON = { magenta: "#ff3fd0", cyan: "#2ff3ff", lime: "#9bff3a", yellow: "#ffe838", orange: "#ff8a1e", ice: "#bff3ff",
               blue: "#4a8dff", violet: "#a77bff", red: "#ff3b4a", white: "#ffffff" };
// The three enemy colors. Chroma towers pick one of them.
const HUES = ["magenta", "cyan", "lime"];
const HUE_HEX = [NEON.magenta, NEON.cyan, NEON.lime];

/* ---------------- The grids ---------------- */
// pts: the path as cell corners it turns at, walked in order. The first point sits one row behind the
// back wall (inside the portal); the last is the cell the master tape stands on.
const MAPS = [
  { name: "CASSETTE COIL", tag: "EASY", mult: 1, hp: 1, pts: [[0, -1], [0, 1], [7, 1], [7, 10], [1, 10], [1, 4], [5, 4], [5, 7], [3, 7]] },
  { name: "SUNSET STRIP", tag: "MEDIUM", mult: 1.25, hp: 1.1, pts: [[1, -1], [1, 2], [7, 2], [7, 5], [1, 5], [1, 8], [7, 8], [7, 11]] },
  { name: "DIAL-UP DASH", tag: "HARD", mult: 1.5, hp: 1.2, pts: [[4, -1], [4, 3], [1, 3], [1, 6], [7, 6], [7, 9], [4, 9], [4, 11]] }
];

/* ---------------- Towers ---------------- */
// Four levels each. cost[0] builds it, cost[1..3] are the upgrades. Range in cells, rate in shots a second.
const TOWERS = [
  { id: "strobe", name: "STROBE", short: "STROBE", role: "Rapid laser", color: NEON.blue,
    cost: [45, 60, 110, 190], dmg: [7, 14, 27, 52], rate: [3.4, 3.6, 3.9, 4.3], range: [2.1, 2.3, 2.5, 2.8] },
  { id: "boombox", name: "BOOMBOX", short: "BOOMBOX", role: "Splash blast", color: NEON.orange,
    cost: [70, 80, 140, 240], dmg: [15, 30, 56, 104], rate: [0.8, 0.85, 0.9, 1.0], range: [2.3, 2.5, 2.7, 3.0], splash: [0.95, 1.05, 1.15, 1.3] },
  { id: "freeze", name: "FREEZE FRAME", short: "FREEZE", role: "Slows them down", color: NEON.ice,
    cost: [60, 60, 110, 180], dmg: [2, 4, 8, 15], rate: [1, 1, 1.1, 1.2], range: [1.7, 2.0, 2.3, 2.6], slow: [0.55, 0.45, 0.36, 0.28], slowT: 1.3 },
  { id: "longplay", name: "LONG PLAY", short: "LONG PLAY", role: "Long range", color: NEON.yellow,
    cost: [90, 100, 170, 280], dmg: [48, 100, 200, 390], rate: [0.5, 0.52, 0.55, 0.6], range: [4.0, 4.6, 5.2, 5.9] },
  { id: "chroma", name: "CHROMA", short: "CHROMA", role: "Color match x3", color: NEON.magenta,
    cost: [75, 80, 140, 240], dmg: [10, 20, 38, 74], rate: [2.2, 2.3, 2.5, 2.7], range: [2.4, 2.6, 2.8, 3.1], match: 3, off: 0.5 }
];
const TI = {}; TOWERS.forEach(function (t, i) { TI[t.id] = i; });

/* ---------------- Enemies ---------------- */
// hp is a multiple of the wave's base strength, spd is cells a second, bounty a multiple of the wave's base pay.
const FOES = {
  blip:   { name: "BLIPS",  hp: 1,    spd: 1.0,  bounty: 1,   size: 0.28 },
  zip:    { name: "ZIPS",   hp: 0.6,  spd: 1.75, bounty: 1,   size: 0.26 },
  brick:  { name: "BRICKS", hp: 2.6,  spd: 0.62, bounty: 2,   size: 0.34 },
  pixel:  { name: "PIXELS", hp: 0.32, spd: 1.25, bounty: 0.5, size: 0.17 },
  static: { name: "STATIC", hp: 1.2,  spd: 1.05,  bounty: 2,   size: 0.3, noSlow: true },
  boss:   { name: "BOSS",   hp: 1,    spd: 0.5,  bounty: 0,   size: 0.6 }
};
const BOSSES = [
  { name: "TRACKING ERROR", shape: "torus", hp: 11, spd: 0.55 },
  { name: "BIT CRUSHER", shape: "dodeca", hp: 19, spd: 0.5 },
  { name: "DEGAUSSER", shape: "knot", hp: 22, spd: 0.5 },
  { name: "BLUE SCREEN", shape: "slab", hp: 25, spd: 0.47 },
  { name: "MAGNETRON", shape: "rings", hp: 28, spd: 0.46 },
  { name: "FINAL REWIND", shape: "reel", hp: 34, spd: 0.42 }
];
// What each wave sends. "B" is a boss wave (every fifth). Two or more kinds take turns.
const PLAN = [
  "blip", "blip", "zip", "pixel", "B",
  "brick", "blip zip", "static", "pixel", "B",
  "zip", "brick", "static blip", "pixel", "B",
  "brick zip", "static", "zip", "pixel brick", "B",
  "brick static", "zip", "pixel", "brick", "B",
  "static", "zip pixel", "brick", "blip zip brick static", "B"
];
const COUNT = { blip: 12, zip: 14, brick: 8, pixel: 26, static: 9 };
const GAPS = { blip: 0.72, zip: 0.46, brick: 1.05, pixel: 0.2, static: 0.7 };

function waveHP(n) { const k = n - 1; return 20 * (1 + 0.4 * k + 0.05 * k * k); }
function waveHue(n) { return n % 5 === 0 ? (n / 5) % 3 : (n - 1) % 3; }
function waveBounty(n) { return 2 + 0.3 * n; }
function waveList(n) {
  const out = [], p = PLAN[n - 1];
  if (p === "B") {
    for (let i = 0; i < 6; i++) out.push({ k: "blip", at: i * 0.6 });
    out.push({ k: "boss", at: 4.4, boss: n / 5 - 1 });
    return out;
  }
  const kinds = p.split(" "), grow = 1 + (n - 1) * 0.012;
  if (kinds.length === 1) {
    const k = kinds[0], m = Math.round(COUNT[k] * grow);
    for (let i = 0, t = 0; i < m; i++, t += GAPS[k]) out.push({ k: k, at: t });
    return out;
  }
  const left = kinds.map(function (k) { return Math.round(COUNT[k] * grow * 1.3 / kinds.length); });
  let t = 0, more = true;
  while (more) {
    more = false;
    for (let j = 0; j < kinds.length; j++) if (left[j] > 0) { out.push({ k: kinds[j], at: t }); t += GAPS[kinds[j]]; left[j]--; more = true; }
  }
  return out;
}
function waveLabel(n) {
  if (n > WAVES) return "";
  const p = PLAN[n - 1];
  if (p === "B") return BOSSES[n / 5 - 1].name;
  const kinds = p.split(" ");
  if (kinds.length > 2) return "MIXED BAG";
  return kinds.map(function (k) { return FOES[k].name; }).join(" + ");
}

/* ---------------- Small helpers ---------------- */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function cellX(c) { return c - (COLS - 1) / 2; }
function cellZ(r) { return r - (ROWS - 1) / 2; }
function inGrid(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }

// The path of a map: world points, cumulative lengths, and the cells it covers.
function buildPath(mi) {
  const m = MAPS[mi], pts = [], cum = [0], cells = {};
  for (let i = 0; i < m.pts.length; i++) pts.push({ x: cellX(m.pts[i][0]), z: cellZ(m.pts[i][1]) });
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  for (let i = 1; i < m.pts.length; i++) {
    let c = m.pts[i - 1][0], r = m.pts[i - 1][1];
    const c1 = m.pts[i][0], r1 = m.pts[i][1], dc = Math.sign(c1 - c), dr = Math.sign(r1 - r);
    for (;;) { cells[c + "," + r] = 1; if (c === c1 && r === r1) break; c += dc; r += dr; }
  }
  const end = m.pts[m.pts.length - 1];
  return { pts: pts, cum: cum, len: cum[cum.length - 1], cells: cells, core: { c: end[0], r: end[1] }, start: m.pts[0] };
}
function pathAt(P, d, out) {
  d = clamp(d, 0, P.len);
  let i = 1;
  while (i < P.cum.length - 1 && P.cum[i] < d) i++;
  const a = P.pts[i - 1], b = P.pts[i], l = P.cum[i] - P.cum[i - 1], u = l > 0 ? (d - P.cum[i - 1]) / l : 0;
  out.x = a.x + (b.x - a.x) * u; out.z = a.z + (b.z - a.z) * u;
  out.hx = l > 0 ? (b.x - a.x) / l : 0; out.hz = l > 0 ? (b.z - a.z) / l : 1;
  return out;
}

/* ---------------- Game state ---------------- */
let S = {}, keys = {}, idleT = 0, parts = [], floats = [];
let THREE = null, R = null;                               // R holds everything the renderer owns
// V is how things are being shown (beams, blasts, flashes). It never feeds the rules.
const V = { beams: [], rings: [], coreHit: 0, portal: 0, shake: 0, hold: false, bare: false };   // hold / bare: for capturing stills
let PATH = null, mapPick = loadMap();
const tmpP = { x: 0, z: 0, hx: 0, hz: 1 };

function loadMap() {
  try { const v = Number(localStorage.getItem("npArcade.vector-siege.map")); return v >= 0 && v < MAPS.length ? v : 0; } catch (e) { return 0; }
}
function saveMap(i) { try { localStorage.setItem("npArcade.vector-siege.map", String(i)); } catch (e) { /* private mode */ } }
function loadSpeed() { try { const v = Number(localStorage.getItem("npArcade.vector-siege.speed")); return v >= 0 && v < SPEEDS.length ? v : 0; } catch (e) { return 0; } }

function reset() {
  PATH = buildPath(mapPick);
  const grid = [];
  for (let r = 0; r < ROWS; r++) { grid.push([]); for (let c = 0; c < COLS; c++) grid[r].push(null); }
  S = { t: 0, mapI: mapPick, grid: grid, towers: [], enemies: [], shots: [], spawns: [], nextId: 1, towerVer: 1,
        credits: START_CREDITS, lives: START_LIVES, score: 0, wave: 0, nextIn: FIRST_GAP, sendLock: 0,
        waveLeft: {}, waveLeak: {}, waveSpawned: {}, cleared: 0, clean: 0, bestClean: 0, flawless: true,
        kills: 0, bossKills: 0, built: 0, maxLvl: 0, early: 0, chromaKills: 0, combo: 0, comboT: 0, bestCombo: 0,
        speed: loadSpeed(), build: -1, ghost: null, ghostOk: false, sel: null, cur: { c: 4, r: 6 }, kbCur: false, press: null, hover: null,
        ending: false, endT: 0, win: false, demo: false, demoT: 0, demoN: 0, lowWarned: false };
  parts.length = 0; floats.length = 0; V.beams.length = 0; V.rings.length = 0; V.coreHit = 0;
  ledClear();
}

/* ---------------- Waves ---------------- */
function startWave() {
  if (S.wave >= WAVES) return;
  const n = ++S.wave, list = waveList(n);
  S.waveLeft[n] = list.length; S.waveSpawned[n] = 0; S.waveLeak[n] = false;
  for (let i = 0; i < list.length; i++) S.spawns.push({ n: n, k: list[i].k, boss: list[i].boss, at: S.t + list[i].at, last: i === list.length - 1 });
  S.nextIn = -1;                                          // the next countdown starts once this wave is all out
  if (S.demo) return;
  V.portal = 1;
  const boss = PLAN[n - 1] === "B";
  if (boss) {
    const b = BOSSES[n / 5 - 1];
    ledPlay([ledMsg("slide", "WAVE " + n, 1.1, { color: "pink" }), ledMsg("flash", "BOSS: " + b.name, 2.6, { keep: true })]);
    Shell.flash("BOSS INCOMING", b.name, NEON.magenta, 1500);
    Juke.sfx("boss");
  } else {
    ledPlay([ledMsg("slide", "WAVE " + n + "  " + waveLabel(n), 2.2, { color: HUES[waveHue(n)] === "lime" ? "lime" : HUES[waveHue(n)] === "cyan" ? "cyan" : "pink" })], !!(LED && LED.msg && LED.msg.keep));
    Juke.sfx("wave");
  }
}

// Send the next wave now. The time left on the countdown pays out as credits.
function sendWave() {
  if (S.ending || S.demo || S.wave >= WAVES || S.sendLock > 0) { if (S.wave < WAVES && !S.ending) Juke.sfx("deny"); return; }
  const bonus = earlyBonus();
  if (bonus > 0) {
    S.credits += bonus; S.score += Math.round(bonus * 5 * MAPS[S.mapI].mult); S.early++;
    floatText("EARLY +" + bonus, W / 2, DOCK_Y - 34, NEON.lime);
    ledPlay([ledMsg("slide", "EARLY BONUS +" + bonus, 1.4, { color: "lime" })]);
    Juke.sfx("early");
    if (S.early >= 5 && window.Trophies) Trophies.unlock("vs-early");
  }
  S.sendLock = SEND_LOCK;
  startWave();
}

// What sending the next wave right now pays: the seconds left on the countdown (none while a wave is still coming out).
function earlyBonus() {
  if (!(S.nextIn > 0) || S.wave >= WAVES) return 0;
  return Math.ceil(S.nextIn) * (S.wave === 0 ? 1 : 1 + Math.floor((S.wave + 1) / 6));
}

function waveCleared(n) {
  if (S.demo) return;
  S.cleared = Math.max(S.cleared, n);
  const pay = 8 + 2 * n, pts = Math.round(25 * n * MAPS[S.mapI].mult);
  S.credits += pay; S.score += pts;
  if (!S.waveLeak[n]) {
    S.clean++; S.bestClean = Math.max(S.bestClean, S.clean);
    if (window.NPRewards && (S.clean === 2 || (S.clean >= 5 && S.clean % 5 === 0))) NPRewards.streak(S.clean, S.clean === 2 ? "" : S.clean + " CLEAN WAVES!");
  } else S.clean = 0;
  if (window.Trophies) {
    if (n >= 10) Trophies.unlock("vs-wave10");
    if (n >= 15 && S.flawless) Trophies.unlock("vs-flawless");
  }
  ledPlay([ledMsg("count", "WAVE " + n + " CLEAR +", 2.0, { from: 0, value: pay, color: "lime" })], true);
  floatText("WAVE " + n + " CLEAR  +" + pay, W / 2, 250, NEON.lime, true);
  Juke.sfx("clear");
}

/* ---------------- Enemies ---------------- */
function spawn(sp) {
  const n = sp.n, f = FOES[sp.k], base = waveHP(n) * (S.demo ? 0.55 : MAPS[S.mapI].hp);
  const e = { id: S.nextId++, k: sp.k, n: n, hue: waveHue(n), d: 0, x: PATH.pts[0].x, z: PATH.pts[0].z, hx: 0, hz: 1,
              hp: 0, max: 0, spd: f.spd, bounty: Math.max(1, Math.round(f.bounty * waveBounty(n))), slowT: 0, slowK: 1,
              hitT: 0, age: 0, boss: -1, size: f.size, noSlow: !!f.noSlow };
  if (sp.k === "boss") {
    const b = BOSSES[sp.boss];
    e.boss = sp.boss; e.hp = b.hp * waveHP(n) * (S.demo ? 0.25 : MAPS[S.mapI].hp); e.spd = b.spd; e.bounty = 40 + 8 * n; e.size = 0.6;
  } else e.hp = f.hp * base;
  e.max = e.hp;
  S.enemies.push(e);
  S.waveSpawned[n] = (S.waveSpawned[n] || 0) + 1;
}

function hit(e, dmg, tw) {
  if (e.hp <= 0) return;
  e.hp -= dmg; e.hitT = 0.07;
  if (tw) tw.dealt += Math.min(dmg, e.hp + dmg);
  if (e.hp <= 0) kill(e, tw);
}

function kill(e, tw) {
  e.dead = true;
  if (tw) tw.kills++;
  removeFoe(e);
  boom(e.x, 0.4, e.z, e.boss >= 0 ? 60 : e.k === "pixel" ? 6 : 12, HUE_HEX[e.hue], e.boss >= 0 ? 1.6 : 1);
  if (S.demo) return;
  const mult = MAPS[S.mapI].mult;
  S.credits += e.bounty;
  S.score += Math.round(e.bounty * 10 * mult);
  S.kills++;
  if (tw && TOWERS[tw.type].id === "chroma" && tw.hue === e.hue) { S.chromaKills++; if (S.chromaKills >= 50 && window.Trophies) Trophies.unlock("vs-chroma"); }
  S.combo = S.comboT > 0 ? S.combo + 1 : 1; S.comboT = 1.6; S.bestCombo = Math.max(S.bestCombo, S.combo);
  if (S.combo === 10 || S.combo === 25 || S.combo === 50 || (S.combo >= 100 && S.combo % 50 === 0)) {
    ledPlay([ledMsg("cycle", "COMBO X" + S.combo, 1.5)], !!(LED && LED.msg && LED.msg.keep));
    Juke.sfx("combo");
  }
  floatText("+" + e.bounty, null, null, NEON.yellow, false, e.x, e.z);
  if (e.boss >= 0) {
    S.bossKills++;
    if (window.Trophies) Trophies.unlock("vs-boss");
    ledPlay([ledMsg("flash", "BOSS DOWN!", 1.8), ledMsg("count", BOSSES[e.boss].name + " +", 1.8, { from: 0, value: e.bounty })]);
    Shell.flash("BOSS DOWN!", BOSSES[e.boss].name + "  +" + e.bounty + " credits", NEON.yellow, 1400);
    Shell.shake(4, 0.35); camShake(0.22, 0.4);
    Juke.sfx("bossdown");
    burst(e.x, e.z, 70);
  } else Juke.sfx("pop");
}

function leak(e) {
  e.dead = true;
  removeFoe(e);
  if (S.demo) return;
  const loss = e.boss >= 0 ? BOSS_LEAK : 1;
  S.lives = Math.max(0, S.lives - loss);
  S.waveLeak[e.n] = true; S.flawless = false; S.clean = 0;
  V.coreHit = 1;
  camShake(e.boss >= 0 ? 0.3 : 0.12, 0.3);
  Juke.sfx("leak");
  if (S.lives <= 0) { endGame(false); return; }
  if (S.lives <= 5 && !S.lowWarned) {
    S.lowWarned = true;
    ledPlay([ledMsg("blink", "LAST CHANCE  LIVES " + S.lives, 2.4, { color: "red" })]);
    Shell.flash("LAST CHANCE", S.lives + " lives left on the tape.", NEON.red, 1300);
  } else ledPlay([ledMsg("blink", (e.boss >= 0 ? "BOSS LEAK!  LIVES " : "LEAK!  LIVES ") + S.lives, 1.4, { color: "red" })], !!(LED && LED.msg && LED.msg.keep));
}

function removeFoe(e) {
  const i = S.enemies.indexOf(e);
  if (i >= 0) S.enemies.splice(i, 1);
  const n = e.n;
  if (S.waveLeft[n] != null) {
    S.waveLeft[n]--;
    if (S.waveLeft[n] <= 0) { delete S.waveLeft[n]; if (!S.ending) waveCleared(n); }
  }
}

/* ---------------- Towers ---------------- */
function towerAt(c, r) { return inGrid(c, r) ? S.grid[r][c] : null; }
function canBuildAt(c, r) { return inGrid(c, r) && !PATH.cells[c + "," + r] && !S.grid[r][c] && !(PATH.core.c === c && PATH.core.r === r); }
function stat(tw, key) { return TOWERS[tw.type][key][tw.lvl]; }

function buildAt(type, c, r, free) {
  const def = TOWERS[type];
  if (!canBuildAt(c, r)) return null;
  if (!free && S.credits < def.cost[0]) { Juke.sfx("deny"); floatText("NEED " + def.cost[0], W / 2, DOCK_Y - 34, NEON.red); return null; }
  if (!free) S.credits -= def.cost[0];
  const nh = S.wave < WAVES ? waveHue(S.wave + 1) : 0;
  const tw = { id: S.nextId++, type: type, c: c, r: r, x: cellX(c), z: cellZ(r), lvl: 0, spent: free ? 0 : def.cost[0], cd: 0.2,
               aim: Math.PI, kills: 0, dealt: 0, hue: def.id === "chroma" ? nh : 0, fx: 0 };
  S.grid[r][c] = tw; S.towers.push(tw); S.towerVer++;
  if (!S.demo && !free) { S.built++; Juke.sfx("build"); }
  return tw;
}
function upgrade(tw) {
  if (!tw || S.ending) return false;
  const def = TOWERS[tw.type];
  if (tw.lvl >= 3) { Juke.sfx("deny"); return false; }
  const cost = def.cost[tw.lvl + 1];
  if (S.credits < cost) { Juke.sfx("deny"); floatText("NEED " + cost, W / 2, DOCK_Y - 34, NEON.red); return false; }
  S.credits -= cost; tw.spent += cost; tw.lvl++; S.towerVer++;
  S.maxLvl = Math.max(S.maxLvl, tw.lvl + 1);
  Juke.sfx("upgrade");
  if (tw.lvl === 3) {
    if (window.Trophies && !S.maxTro) { S.maxTro = true; Trophies.unlock("vs-max"); }
    ledPlay([ledMsg("cycle", def.name + " MAXED", 1.4)], true);
  }
  return true;
}
function sell(tw) {
  if (!tw || S.ending) return;
  const back = Math.round(tw.spent * SELL_BACK);
  S.credits += back;
  S.grid[tw.r][tw.c] = null;
  S.towers.splice(S.towers.indexOf(tw), 1);
  S.towerVer++;
  if (S.sel === tw) S.sel = null;
  floatText("+" + back, null, null, NEON.yellow, false, tw.x, tw.z);
  Juke.sfx("sell");
}
function cycleHue(tw) {
  if (!tw || TOWERS[tw.type].id !== "chroma") return;
  tw.hue = (tw.hue + 1) % 3; tw.cd = Math.max(tw.cd, 0.5); S.towerVer++;
  Juke.sfx("click");
}

// The enemy a tower would shoot: furthest along the path (Long Play: the toughest) inside its range.
function pickTarget(tw, range, strong) {
  let best = null, bv = -1;
  const r2 = range * range;
  for (let i = 0; i < S.enemies.length; i++) {
    const e = S.enemies[i];
    if (e.d < 0.55) continue;                               // still inside the portal
    const dx = e.x - tw.x, dz = e.z - tw.z;
    if (dx * dx + dz * dz > r2) continue;
    const v = strong ? e.hp * 1000 + e.d : e.d;
    if (v > bv) { bv = v; best = e; }
  }
  return best;
}

function fire(tw, h) {
  const def = TOWERS[tw.type], range = stat(tw, "range");
  if (def.id === "freeze") {
    let any = false;
    const r2 = range * range, slow = stat(tw, "slow"), dmg = stat(tw, "dmg");
    for (let i = S.enemies.length - 1; i >= 0; i--) {
      const e = S.enemies[i];
      if (e.d < 0.55) continue;
      const dx = e.x - tw.x, dz = e.z - tw.z;
      if (dx * dx + dz * dz > r2) continue;
      any = true;
      if (!e.noSlow) {
        const k = e.boss >= 0 ? 1 - (1 - slow) * 0.5 : slow;
        if (e.slowT <= 0 || k <= e.slowK) e.slowK = k;
        e.slowT = def.slowT;
      }
      hit(e, dmg, tw);
    }
    if (any) {
      tw.cd = 1 / stat(tw, "rate"); tw.fx++;
      V.rings.push({ x: tw.x, z: tw.z, r0: 0.3, r1: range, t: 0, life: 0.5, col: NEON.ice, w: 2 });
      sfxDemo("freeze");
    }
    return;
  }
  const e = pickTarget(tw, range, def.id === "longplay");
  if (!e) return;
  tw.aim = Math.atan2(e.x - tw.x, e.z - tw.z);
  tw.cd = 1 / stat(tw, "rate"); tw.fx++;
  const top = 0.42 + tw.lvl * 0.03;
  if (def.id === "boombox") {
    S.shots.push({ x: tw.x, z: tw.z, sx: tw.x, sz: tw.z, tgt: e, tx: e.x, tz: e.z, sp: 5.5, dmg: stat(tw, "dmg"), rad: stat(tw, "splash"), tw: tw, u: 0, dist: 0 });
    sfxDemo("lob");
    return;
  }
  let dmg = stat(tw, "dmg"), col = def.color, w = 1.6, life = 0.09;
  if (def.id === "chroma") { dmg *= e.hue === tw.hue ? def.match : def.off; col = HUE_HEX[tw.hue]; w = e.hue === tw.hue ? 2.6 : 1.4; sfxDemo("chroma"); }
  else if (def.id === "longplay") { w = 2.8; life = 0.22; sfxDemo("snipe"); }
  else sfxDemo("zap");
  V.beams.push({ x0: tw.x, y0: top + (def.id === "longplay" ? 0.25 : 0), z0: tw.z, x1: e.x, y1: 0.4, z1: e.z, col: col, w: w, t: 0, life: life });
  hit(e, dmg, tw);
}
function sfxDemo(name) { if (!S.demo) Juke.sfx(name); }

/* ---------------- One simulation step ---------------- */
function step(h) {
  S.t += h;
  if (S.sendLock > 0) S.sendLock -= h;
  if (S.comboT > 0) S.comboT -= h;
  let i;

  if (S.demo) {
    S.demoT -= h;
    if (S.demoT <= 0 && S.enemies.length < 14) { S.demoT = 7; S.demoN = S.demoN % 10 + 1; S.wave = S.demoN - 1; startWave(); }
  } else if (S.nextIn > 0 && S.wave < WAVES) {
    S.nextIn -= h;
    if (S.nextIn <= 0) { S.nextIn = 0; startWave(); }
  }

  // spawns
  for (i = S.spawns.length - 1; i >= 0; i--) {
    const sp = S.spawns[i];
    if (sp.at > S.t) continue;
    S.spawns.splice(i, 1);
    spawn(sp);
    if (!S.demo && !S.spawns.some(function (q) { return q.n === sp.n; }) && sp.n === S.wave && S.wave < WAVES) S.nextIn = WAVE_GAP;
  }

  // enemies walk
  for (i = S.enemies.length - 1; i >= 0; i--) {
    const e = S.enemies[i];
    e.age += h;
    if (e.hitT > 0) e.hitT -= h;
    let k = 1;
    if (e.slowT > 0) { e.slowT -= h; k = e.slowK; if (e.slowT <= 0) e.slowK = 1; }
    e.d += e.spd * k * h;
    if (e.d >= PATH.len) { leak(e); if (S.ending && !S.demo) return; continue; }
    pathAt(PATH, e.d, tmpP);
    e.x = tmpP.x; e.z = tmpP.z; e.hx = tmpP.hx; e.hz = tmpP.hz;
  }

  // towers
  for (i = 0; i < S.towers.length; i++) {
    const tw = S.towers[i];
    tw.cd -= h;
    if (tw.cd <= 0) { tw.cd = 0; fire(tw, h); }
  }

  // boombox blasts in flight
  for (i = S.shots.length - 1; i >= 0; i--) {
    const s = S.shots[i];
    if (s.tgt && !s.tgt.dead) { s.tx = s.tgt.x; s.tz = s.tgt.z; }
    const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz), mv = s.sp * h;
    s.dist += mv;
    if (d <= mv) {
      S.shots.splice(i, 1);
      const r2 = s.rad * s.rad;
      for (let j = S.enemies.length - 1; j >= 0; j--) {
        const e = S.enemies[j], ex = e.x - s.tx, ez = e.z - s.tz;
        if (ex * ex + ez * ez <= r2) hit(e, s.dmg, s.tw);
      }
      V.rings.push({ x: s.tx, z: s.tz, r0: 0.1, r1: s.rad, t: 0, life: 0.35, col: NEON.orange, w: 3, fill: true });
      boom(s.tx, 0.25, s.tz, 8, NEON.orange, 0.8);
      sfxDemo("boom");
      continue;
    }
    s.x += dx / d * mv; s.z += dz / d * mv;
    const total = s.dist + d;
    s.u = total > 0 ? s.dist / total : 1;
  }

  if (S.demo) return;
  // the last wave is out and the board is empty: that's the siege broken
  if (!S.ending && S.wave >= WAVES && !S.spawns.length && !S.enemies.length) endGame(true);
}

function endGame(win) {
  if (S.ending) return;
  S.ending = true; S.endT = 0; S.win = win;
  S.build = -1; S.sel = null; S.ghost = null; S.press = null;
  const mult = MAPS[S.mapI].mult;
  if (win) {
    const bonus = Math.round(S.lives * 250 * mult);
    S.score += bonus;
    if (window.Trophies) { Trophies.unlock("vs-victory"); if (S.mapI === 2) Trophies.unlock("vs-hard"); }
    Shell.flash("SIEGE BROKEN!", "All " + WAVES + " waves cleared. Tape bonus +" + bonus, NEON.lime, 2000);
    ledPlay([ledMsg("flash", "VICTORY!", 1.8)]);
    Juke.sfx("victory");
    burst(PATH.pts[PATH.pts.length - 1].x, PATH.pts[PATH.pts.length - 1].z, 90);
  } else {
    Shell.flash("TAPE ERASED", "The siege got through on wave " + S.wave + ".", NEON.red, 1700);
    ledPlay([ledMsg("blink", "TAPE ERASED", 1.8, { color: "red" })]);
    Juke.sfx("erased");
    camShake(0.35, 0.6);
  }
  ledFinal(S.score);
}

/* ---------------- Update (shell hook) ---------------- */
function update(dt) {
  if (V.hold) return;
  if (S.ending) {
    S.endT += dt;
    updateFx(dt);
    if (S.endT > 1.8) finish();
    return;
  }
  let left = dt * SPEEDS[S.speed];
  while (left > 1e-6 && !S.ending) { const h = Math.min(left, 1 / 60); step(h); left -= h; }
  updateFx(dt);
}

function finish() {
  const map = MAPS[S.mapI];
  Shell.gameOver(S.score, { title: S.win ? "SIEGE BROKEN!" : "SIEGE OVER", html:
    row("Grid", map.name + " (" + map.tag + ")") +
    row("Waves cleared", S.cleared + " of " + WAVES) +
    row("Enemies destroyed", S.kills) +
    row("Bosses destroyed", S.bossKills + " of " + BOSSES.length) +
    row("Lives left", S.lives) +
    row("Best combo", S.bestCombo),
    stats: { score: S.score, win: S.win, map: map.name, mapIndex: S.mapI, wave: S.wave, cleared: S.cleared, lives: S.lives,
             kills: S.kills, bossKills: S.bossKills, built: S.built, maxLevel: S.maxLvl, early: S.early, chromaKills: S.chromaKills,
             bestCombo: S.bestCombo, cleanStreak: S.bestClean, flawless: S.flawless } });
}
function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

/* ---------------- Particles + float text (drawn on the HUD layer, placed through the 3D camera) ---------------- */
function boom(x, y, z, n, col, big) {
  if (!R) return;
  const p = toScreen(x, y, z);
  if (!p.ok) return;
  if (Shell.reduced) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = (40 + Math.random() * 120) * (big || 1);
    parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0.45 + Math.random() * 0.35, c: i % 3 ? col : "#ffffff", len: 3 + Math.random() * 4, g: 60 });
  }
}
function burst(x, z, n) {
  if (!R) return;
  const p = toScreen(x, 0.5, z), cols = [NEON.magenta, NEON.cyan, NEON.lime, NEON.yellow, NEON.orange, "#ffffff"];
  if (Shell.reduced) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 60 + Math.random() * 200;
    parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 90, life: 1 + Math.random() * 0.6, c: cols[i % cols.length], len: 5, g: 200 });
  }
}
function floatText(txt, x, y, col, big, wx, wz) {
  if (S.demo) return;
  floats.push({ txt: txt, x: x, y: y, wx: wx, wz: wz, col: col, big: !!big, t: 0 });
  if (floats.length > 24) floats.shift();
}
function updateFx(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i]; q.life -= dt; q.vy += q.g * dt; q.vx *= 0.97; q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.life <= 0) parts.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; if (floats[i].t > 1.1) floats.splice(i, 1); }
}

/* ---------------- Input ---------------- */
// The dock along the bottom. Buttons are laid out from the state, so drawing and tapping always agree.
function dockButtons() {
  const b = [], y0 = DOCK_Y + 5, hh = 64;
  if (S.sel) {
    const tw = S.sel, chroma = TOWERS[tw.type].id === "chroma";
    b.push({ act: "close", x: 112, y: y0, w: 22, h: 20 });
    if (chroma) b.push({ act: "hue", x: 8, y: y0 + 44, w: 74, h: 20 });
    b.push({ act: "upgrade", x: 138, y: y0, w: 62, h: hh });
    b.push({ act: "sell", x: 204, y: y0, w: 60, h: hh });
  } else {
    for (let i = 0; i < TOWERS.length; i++) b.push({ act: "tower", i: i, x: 4 + i * 52, y: y0, w: 50, h: hh });
  }
  b.push({ act: "send", x: 268, y: y0, w: 88, h: 36 });
  b.push({ act: "speed", x: 268, y: y0 + 39, w: 88, h: 25 });
  return b;
}
function buttonAt(x, y) {
  const list = dockButtons();
  for (let i = 0; i < list.length; i++) { const q = list[i]; if (x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h) return q; }
  return null;
}
function press(q) {
  if (!q || S.ending) return;
  if (q.act === "tower") {
    S.sel = null;
    if (S.build === q.i) { S.build = -1; S.ghost = null; }
    else { S.build = q.i; S.ghost = null; Juke.sfx("click"); }
  } else if (q.act === "close") { S.sel = null; Juke.sfx("click"); }
  else if (q.act === "upgrade") upgrade(S.sel);
  else if (q.act === "sell") sell(S.sel);
  else if (q.act === "hue") cycleHue(S.sel);
  else if (q.act === "send") sendWave();
  else if (q.act === "speed") setSpeed((S.speed + 1) % SPEEDS.length);
}
function setSpeed(i) {
  S.speed = i;
  try { localStorage.setItem("npArcade.vector-siege.speed", String(i)); } catch (e) { /* private mode */ }
  Juke.sfx("click");
}

// The cell under a point of the screen. A tower is picked by its body first, so tapping the top of a tall
// one never lands on the square behind it.
function pickCell(px, py) {
  if (!R || !R.camReady) return null;
  const g = screenToGround(px, py);
  let c = -1, r = -1;
  if (g) { c = Math.floor(g.x + COLS / 2); r = Math.floor(g.z + ROWS / 2); }
  if (inGrid(c, r) && S.grid[r][c]) return { c: c, r: r };
  for (let i = 0; i < S.towers.length; i++) {
    const tw = S.towers[i], b = toScreen(tw.x, 0, tw.z), t = toScreen(tw.x, 0.8, tw.z);
    if (Math.abs(px - b.x) < 13 && py <= b.y + 4 && py >= t.y - 4) return { c: tw.c, r: tw.r };
  }
  return inGrid(c, r) ? { c: c, r: r } : null;
}

function tapCell(cell, mouse) {
  if (!cell) { S.sel = null; S.ghost = null; return; }
  const tw = towerAt(cell.c, cell.r);
  if (tw) {
    S.build = -1; S.ghost = null;
    S.sel = S.sel === tw ? null : tw;
    Juke.sfx("click");
    return;
  }
  if (S.build >= 0) {
    if (!canBuildAt(cell.c, cell.r)) {
      S.ghost = { c: cell.c, r: cell.r };
      Juke.sfx("deny");
      return;
    }
    // Touch: the first tap shows where it would go, a second tap on the same square builds it. A mouse click builds.
    if (mouse || (S.ghost && S.ghost.c === cell.c && S.ghost.r === cell.r)) {
      const t = buildAt(S.build, cell.c, cell.r);
      if (t) { S.ghost = null; if (S.credits < TOWERS[S.build].cost[0]) S.build = -1; }
    } else { S.ghost = { c: cell.c, r: cell.r }; Juke.sfx("click"); }
    return;
  }
  S.sel = null;
}

function pointer(type, x, y, e) {
  if (S.ending) return;
  const mouse = !!(e && e.pointerType === "mouse");
  S.mouse = mouse;
  if (type === "down") {
    S.kbCur = false;
    S.press = { x: x, y: y, sx: x, sy: y, btn: y >= DOCK_Y ? buttonAt(x, y) : null, dock: y >= DOCK_Y, drag: false };
  } else if (type === "move") {
    if (mouse && !S.press) {
      S.hover = y < DOCK_Y ? pickCell(x, y) : null;
      if (S.build >= 0) S.ghost = S.hover && !towerAt(S.hover.c, S.hover.r) ? { c: S.hover.c, r: S.hover.r } : null;   // the ghost follows the mouse
      return;
    }
    if (!S.press) return;
    S.press.x = x; S.press.y = y;
    if (Math.hypot(x - S.press.sx, y - S.press.sy) > 10) S.press.drag = true;
    // dragging a finger over the board moves the ghost with it
    if (!S.press.dock && S.build >= 0 && S.press.drag) {
      const cell = pickCell(x, y);
      if (cell && !towerAt(cell.c, cell.r)) S.ghost = { c: cell.c, r: cell.r };
    }
  } else if (type === "up" || type === "cancel") {
    const p = S.press; S.press = null;
    if (!p || type === "cancel") return;
    if (p.dock) { const q = buttonAt(x, y); if (q && p.btn && q.act === p.btn.act && q.i === p.btn.i) press(q); return; }
    if (y >= DOCK_Y) return;
    const cell = pickCell(x, y);
    if (p.drag && S.build >= 0 && !mouse) return;          // a drag only moves the ghost; tap it to build
    tapCell(cell, mouse);
  }
}

function key(type, code, e) {
  if (type !== "down") { keys[code] = false; return; }
  keys[code] = true;
  if (S.ending) return;
  const dig = /^(Digit|Numpad)([1-5])$/.exec(code);
  if (dig) { press({ act: "tower", i: Number(dig[2]) - 1 }); if (S.build >= 0) { S.kbCur = true; S.ghost = { c: S.cur.c, r: S.cur.r }; } return; }
  const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[code];
  if (mv) {
    S.kbCur = true;
    S.cur.c = clamp(S.cur.c + mv[0], 0, COLS - 1); S.cur.r = clamp(S.cur.r + mv[1], 0, ROWS - 1);
    if (S.build >= 0) S.ghost = { c: S.cur.c, r: S.cur.r };
    return;
  }
  if ((code === "Space" || code === "Enter" || code === "NumpadEnter") && !e.repeat) {
    S.kbCur = true;
    tapCell({ c: S.cur.c, r: S.cur.r }, true);
    return;
  }
  if (e.repeat) return;
  if (code === "KeyU") upgrade(S.sel);
  else if (code === "KeyX" || code === "Delete" || code === "Backspace") { if (S.sel) sell(S.sel); }
  else if (code === "KeyC") cycleHue(S.sel);
  else if (code === "KeyW") sendWave();
  else if (code === "KeyF") setSpeed((S.speed + 1) % SPEEDS.length);
}

/* ---------------- Sound: the synth band and the stingers ----------------
   The music is an original sixteen-bar synthwave loop in A minor (bass, arpeggio, pads, lead, drums), made in
   code with the Web Audio API. startMusic knows nothing about the game: give it an AudioContext and a node to
   play into and it plays until the stop function it returns is called. The game's own stingers ride on the same
   context. Nothing is created until the first tap or key press; the mute button (the shell's "npArcade.muted")
   and the music button ("npArcade.music") are both remembered. */
const MUSIC_VOL = 0.15, SFX_VOL = 0.22, MUSIC_KEY = "npArcade.music";

function startMusic(ctx, dest) {
  const BPM = 116, STEP = 60 / BPM / 4, STEPS = 256, AHEAD = 0.5;
  const CH = { Am: [45, 57, 60, 64], F: [41, 57, 60, 65], C: [48, 55, 60, 64], G: [43, 55, 59, 62], Dm: [38, 57, 62, 65],
               E: [40, 56, 59, 64], Em: [40, 55, 59, 64] };
  const PROG = "Am F C G Am F Dm E F G Em Am F G E E".split(" ");          // one chord a bar
  const BARS = [
    "0E5-2 2A5-2 4C6-3 7B5-1 8A5-4 12E5-2 14G5-2", "0A5-3 3G5-1 4F5-2 6E5-2 8F5-4 12C5-4",
    "0E5-2 2G5-2 4C6-2 6D6-2 8E6-4 12D6-2 14C6-2", "0B5-3 3A5-1 4G5-2 6D5-2 8G5-6 14A5-2",
    "0C6-2 2B5-2 4A5-2 6E5-2 8A5-3 11B5-1 12C6-4", "0D6-2 2C6-2 4A5-2 6F5-2 8A5-4 12C6-2 14A5-2",
    "0F5-2 2A5-2 4D6-4 8C6-2 10A5-2 12F5-4", "0E5-4 4G#5-4 8B5-4 12E6-4",
    "0C6-6 6A5-2 8F5-4 12A5-4", "0D6-6 6B5-2 8G5-4 12B5-4",
    "0E6-3 3D6-1 4B5-2 6G5-2 8E5-4 12G5-2 14B5-2", "0A5-2 2C6-2 4E6-4 8D6-2 10C6-2 12B5-2 14A5-2",
    "0A5-2 2C6-2 4F6-3 7E6-1 8C6-4 12A5-4", "0B5-2 2D6-2 4G6-3 7F6-1 8D6-4 12B5-4",
    "0G#5-2 2B5-2 4E6-4 8D6-2 10B5-2 12G#5-4", "0E6-8 8B5-2 10G#5-2 12E5-4"
  ];
  const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const LEAD = new Array(STEPS).fill(null);
  BARS.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(#?)(\d)-(\d+)$/.exec(tok);
      if (m) LEAD[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + semis[m[2]] + (m[3] ? 1 : 0), Number(m[5])];
    });
  });
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  const out = ctx.createGain(); out.gain.value = 0; out.connect(dest);
  out.gain.setTargetAtTime(1, ctx.currentTime, 0.06);
  function filt(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const lead = filt("lowpass", 3400, 0.6, out), bass = filt("lowpass", 700, 2.2, out), pad = filt("lowpass", 1300, 0.5, out);
  const send = ctx.createGain(), echo = ctx.createDelay(1), back = ctx.createGain(), damp = filt("lowpass", 2200, 0.7, out);
  send.gain.value = 0.32; echo.delayTime.value = STEP * 3; back.gain.value = 0.36;          // a dotted-eighth echo on the lead and arp
  lead.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(damp);
  const arp = filt("lowpass", 2600, 0.9, out); arp.connect(send);
  const len = Math.floor(ctx.sampleRate * 1.5), noise = ctx.createBuffer(1, len, ctx.sampleRate), nd = noise.getChannelData(0);
  let seed = 0x1f2e3d4c;
  for (let i = 0; i < len; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; nd[i] = (seed >>> 0) / 2147483648 - 1; }

  function osc(to, type, f0, t, dur, vol, f1, hold, det) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.01, dur * (hold == null ? 0.55 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (det) o.detune.value = det;
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.03);
  }
  function padNote(f, t, dur, vol) {                         // slow swell, two detuned saws
    [-9, 9].forEach(function (det) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = f; o.detune.value = det;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
      g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(pad); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  function hiss(t, dur, vol, type, f0, q) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = type; f.frequency.value = f0; f.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, (t * 0.37) % 1); s.stop(t + dur + 0.05);
  }
  function play(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[bar]], second = bar >= 8;
    if (s === 0) for (let k = 1; k < 4; k++) padNote(mtof(ch[k]), t, STEP * 16, 0.035);
    const n = LEAD[i];
    if (n) { osc(lead, "square", mtof(n[0]), t, n[1] * STEP * 0.95, 0.12, 0, 0.6); osc(lead, "sawtooth", mtof(n[0]), t, n[1] * STEP * 0.95, 0.05, 0, 0.6, 7); }
    if (!(s & 1)) osc(bass, "sawtooth", mtof(ch[0] + ((s >> 1) & 1 ? 12 : 0)), t, STEP * 1.8, 0.32, 0, 0.5);
    osc(arp, "square", mtof(ch[1 + [0, 1, 2, 1][s & 3]] + 12 + (second ? 12 : 0)), t, STEP * 0.9, 0.04, 0, 0.3);
    if (second ? s % 4 === 0 : s === 0 || s === 8 || s === 10) osc(out, "sine", 150, t, 0.18, 0.75, 40, 0.06);
    if (s === 4 || s === 12) { hiss(t, 0.22, 0.28, "bandpass", 1700, 0.5); osc(out, "triangle", 210, t, 0.08, 0.18, 120, 0.1); }
    if (bar % 4 === 3 && s >= 12 && s % 2 === 0) hiss(t, 0.1, 0.16 + (s - 12) * 0.04, "bandpass", 2400, 0.6);
    if (!(s & 1)) hiss(t, s % 4 === 2 ? 0.08 : 0.035, s % 4 === 2 ? 0.09 : 0.05, "highpass", 7600, 0.7);
  }
  let step = 0, nextT = ctx.currentTime + 0.12;
  function pump() {
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.03;
    while (nextT < ctx.currentTime + AHEAD) { play(step, nextT); step = (step + 1) % STEPS; nextT += STEP; }
  }
  pump();
  const timer = setInterval(pump, 60);
  return function stop() {
    clearInterval(timer);
    const t = ctx.currentTime;
    out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(function () { try { out.disconnect(); } catch (e) { /* already gone */ } }, 700);
  };
}

const Juke = (function () {
  let live = null, dead = false, muted = false, stopMusic = null;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  const buttons = [], lastAt = {};
  const GAP = { zap: 0.05, chroma: 0.05, snipe: 0.06, pop: 0.035, boom: 0.07, lob: 0.06, freeze: 0.12, deny: 0.12, click: 0.03 };

  function rig(c) {
    const A = { c: c };
    A.out = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    A.out.connect(comp); comp.connect(c.destination);
    A.music = c.createGain(); A.music.gain.value = MUSIC_VOL; A.music.connect(A.out);
    A.sfx = c.createGain(); A.sfx.gain.value = SFX_VOL; A.sfx.connect(A.out);
    const len = Math.floor(c.sampleRate * 1.2);
    A.noise = c.createBuffer(1, len, c.sampleRate);
    const d = A.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return A;
  }
  function osc(A, type, f0, t, dur, vol, f1, hold) {
    const o = A.c.createOscillator(), g = A.c.createGain(), h = t + Math.max(0.006, dur * (hold == null ? 0.4 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.sfx); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(A, t, dur, vol, type, f0, q, f1) {
    const s = A.c.createBufferSource(), f = A.c.createBiquadFilter(), g = A.c.createGain();
    s.buffer = A.noise; f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(A.sfx); s.start(t, Math.random() * 0.6); s.stop(t + dur + 0.05);
  }
  function notes(A, list, t, step, type, vol) { list.forEach(function (m, i) { osc(A, type || "square", 440 * Math.pow(2, (m - 69) / 12), t + i * step, step * 1.5, vol || 0.2, 0, 0.5); }); }
  function cue(A, name, t) {
    switch (name) {
      case "zap": osc(A, "square", 1500, t, 0.05, 0.05, 520, 0.2); break;
      case "chroma": osc(A, "triangle", 900, t, 0.07, 0.12, 1700, 0.3); break;
      case "snipe": hiss(A, t, 0.05, 0.35, "highpass", 3000, 0.7); osc(A, "square", 2400, t, 0.16, 0.08, 260, 0.2); break;
      case "lob": osc(A, "square", 280, t, 0.09, 0.07, 560, 0.3); break;
      case "boom": hiss(A, t, 0.34, 0.45, "lowpass", 1100, 0.8, 120); osc(A, "sine", 110, t, 0.24, 0.5, 38, 0.1); break;
      case "freeze": osc(A, "sine", 1760, t, 0.32, 0.05, 1320, 0.2); osc(A, "sine", 2637, t + 0.02, 0.3, 0.035, 1980, 0.2); hiss(A, t, 0.2, 0.06, "highpass", 6000, 0.7); break;
      case "pop": osc(A, "square", 620, t, 0.06, 0.07, 1250, 0.3); hiss(A, t, 0.05, 0.08, "bandpass", 2600, 1.4); break;
      case "build": notes(A, [64, 71, 76], t, 0.05, "square", 0.14); break;
      case "upgrade": notes(A, [67, 71, 74, 79, 83], t, 0.045, "square", 0.14); break;
      case "sell": notes(A, [84, 79, 72], t, 0.05, "triangle", 0.2); break;
      case "deny": osc(A, "square", 150, t, 0.16, 0.14, 110, 0.6); break;
      case "click": osc(A, "square", 1300, t, 0.025, 0.06, 0, 0.3); break;
      case "leak": osc(A, "sawtooth", 260, t, 0.22, 0.2, 120, 0.4); osc(A, "sawtooth", 250, t + 0.22, 0.28, 0.2, 90, 0.4); break;
      case "wave": notes(A, [57, 64, 69], t, 0.07, "square", 0.13); hiss(A, t, 0.4, 0.12, "bandpass", 600, 0.8, 4000); break;
      case "boss": for (let k = 0; k < 2; k++) { osc(A, "sawtooth", 180, t + k * 0.7, 0.35, 0.18, 360, 0.9); osc(A, "sawtooth", 360, t + k * 0.7 + 0.35, 0.35, 0.18, 180, 0.9); } break;
      case "bossdown": hiss(A, t, 1.1, 0.6, "lowpass", 1400, 0.7, 90); osc(A, "sine", 90, t, 0.6, 0.6, 30, 0.1); notes(A, [69, 72, 76, 81, 84], t + 0.3, 0.07, "square", 0.16); break;
      case "clear": notes(A, [72, 76, 79, 84], t, 0.06, "triangle", 0.2); break;
      case "early": osc(A, "square", 330, t, 0.28, 0.14, 1320, 0.8); osc(A, "square", 1320, t + 0.3, 0.12, 0.14, 0, 0.5); break;
      case "combo": notes(A, [79, 83, 86, 91], t, 0.04, "square", 0.12); break;
      case "victory": notes(A, [69, 72, 76, 81, 76, 81, 84, 88], t, 0.1, "square", 0.17); break;
      case "erased": osc(A, "sawtooth", 330, t, 1.1, 0.22, 55, 0.7); hiss(A, t, 0.9, 0.25, "lowpass", 900, 0.7, 100); break;
    }
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
      if (!live) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        live = rig(new AC());
        muted = shellMuted();
        live.out.gain.value = muted ? 0 : 1;
      }
      if (live.c.state !== "running") { const p = live.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { live = null; dead = true; }
  }
  // Called every frame: follow the mute button, and start or stop the band with the game.
  function pump() {
    const A = live;
    if (!A || !window.Shell || !Shell.state) return;
    const m = shellMuted(), now = A.c.currentTime;
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, now, 0.02); }
    const want = musicOn && !muted && A.c.state === "running" && Shell.state() === "playing";
    if (want && !stopMusic) { try { stopMusic = startMusic(A.c, A.music); } catch (e) { stopMusic = null; } }
    else if (!want && stopMusic) { stopMusic(); stopMusic = null; }
  }
  function sfx(name) {
    const A = live;
    if (!A || muted || A.c.state !== "running") return;
    const now = A.c.currentTime;
    if (GAP[name] && lastAt[name] != null && now - lastAt[name] < GAP[name]) return;
    lastAt[name] = now;
    try { cue(A, name, now + 0.01); } catch (e) { /* sound is never worth a crash */ }
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
    peek: function () { return { made: !!live, state: live ? live.c.state : "none", playing: !!stopMusic, muted: muted, musicOn: musicOn }; }
  };
})();

/* ---------------- LED ribbon board: the strip across the back wall, under the marquee ----------------
   The board is a real dot matrix. Everything on it is painted into a small canvas, one pixel per LED, and a small
   shader turns each pixel into a glowing dot. It scrolls its programme right to left, and cuts to big animated
   messages when the game calls for one (waves, bosses, combos, leaks, the final score). */
const LED_ROWS = 26, LED_COLS = Math.round(LED_ROWS * WALL.w / WALL.ledH);
const LED_SAFE = LED_COLS - 24;
const LED_SPEED = 44;
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["DEFEND THE MASTER TAPE", "pink"], ["NO QUARTERS REQUIRED", "cyan"]];
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
  // The wordmark at board resolution: the cream lettering pushed to full LED brightness, the red edge kept as a
  // dimmer rim, the navy outline dropped to dark, so the script reads as light on black.
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
  const start = ((-(LED_COLS - strip.markW) / 2) % sw + sw) % sw;   // open with the wordmark in the middle of the board
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
// kind: "flash" (strobe and chevrons), "slide", "cycle", "blink" or "count" (label, a number that counts up, suffix)
function ledMsg(kind, text, dur, more) {
  const m = { kind: kind, text: text, dur: dur, t: 0, wait: 0, color: "amber" };
  if (more) for (const k in more) m[k] = more[k];
  return m;
}
// Cut to a list of messages (or add them after whatever is showing), then return to the scroll.
function ledPlay(list, append) {
  const L = LED;
  if (!L || !list.length || S.demo) return;
  if (append && L.msg) { for (let i = 0; i < list.length; i++) L.queue.push(list[i]); if (L.queue.length > 6) L.queue.splice(0, L.queue.length - 6); return; }
  if (!list.some(function (m) { return m.keep; })) {
    // a leak or a combo cuts in, but a boss warning that has not had its turn yet still gets it afterwards
    const old = (L.msg && L.msg.keep ? [L.msg] : []).concat(L.queue.filter(function (m) { return m.keep; }));
    if (old.length) { old[0].t = 0; list = list.concat(old); }
  }
  L.msg = list[0]; L.msg.t = 0;
  L.queue = list.slice(1);
  L.frame = -1;
}
function ledClear() { if (!LED) return; LED.msg = null; LED.queue = []; LED.pos = -1; }
function ledFinal(score) {
  if (!LED) return;
  ledPlay([ledMsg("count", "FINAL", 8, { from: 0, value: score, final: true, wait: 0.6 })], true);
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
    const k = calm ? 1 : Math.min(1, t / 0.7), v = Math.round(m.from + (m.value - m.from) * k);
    const label = m.text ? m.text + (m.text.slice(-1) === "+" ? "" : " ") : "", suffix = m.suffix || "", sxc = fit(label + m.value + suffix);
    const x = Math.round((WW - ledTextW(label + m.value + suffix, sxc)) / 2);
    const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
    let xn = ledText(g, label, x, yBig, sxc, big, LED_C[m.color] || LED_C.amber);
    xn = ledText(g, String(v), xn, yBig, sxc, big, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
    ledText(g, suffix, xn, yBig, sxc, big, LED_C.amber);
    if (!calm && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(WW * m.t / 0.3), 0, WW, HH); }
    chase(LED_C[m.color] || LED_C.amber, 1);
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
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. If the PNG is missing, plain lettering stands in.
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

// Neon lettering: a soft colored glow, a bright tube, a white-hot core.
function neonText(g, str, x, y, size, col, maxW, font) {
  g.font = (font || "900 ") + size + 'px "Arial Black", "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = (font || "900 ") + size + 'px "Arial Black", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif'; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.save();
  g.shadowColor = col; g.shadowBlur = size * 0.5;
  g.lineWidth = size * 0.16; g.strokeStyle = col; g.strokeText(str, x, y);
  g.shadowBlur = size * 0.25; g.strokeText(str, x, y);
  g.restore();
  g.fillStyle = "#ffffff"; g.fillText(str, x, y);
}

/* ---------------- Painted textures (all drawn here, no image files besides the two logos) ---------------- */
// The board floor for one map: 64 pixels a cell, FLOOR_M of margin all round. Canvas top is the far edge.
const FPX = 64;
function paintFloor(g, mi) {
  const P = buildPath(mi), Wc = g.canvas.width, Hc = g.canvas.height;
  const X = function (c) { return (c + FLOOR_M) * FPX; }, Y = function (r) { return (r + FLOOR_M) * FPX; };
  g.clearRect(0, 0, Wc, Hc);
  const bg = g.createLinearGradient(0, 0, 0, Hc);
  bg.addColorStop(0, "#090b22"); bg.addColorStop(1, "#05071a");
  g.fillStyle = bg; g.fillRect(0, 0, Wc, Hc);
  // the build squares
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (P.cells[c + "," + r] || (P.core.c === c && P.core.r === r)) continue;
    const x = X(c), y = Y(r);
    rrectPath(g, x + 5, y + 5, FPX - 10, FPX - 10, 7);
    g.fillStyle = "rgba(47,243,255,.045)"; g.fill();
    g.lineWidth = 1.6; g.strokeStyle = "rgba(47,243,255,.42)"; g.stroke();
    g.fillStyle = "rgba(47,243,255,.35)";
    [[x + 12, y + 12], [x + FPX - 14, y + 12], [x + 12, y + FPX - 14], [x + FPX - 14, y + FPX - 14]].forEach(function (p) { g.fillRect(p[0], p[1], 2, 2); });
  }
  // grid lines
  g.strokeStyle = "rgba(120,90,255,.28)"; g.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) { g.beginPath(); g.moveTo(X(c), Y(0)); g.lineTo(X(c), Y(ROWS)); g.stroke(); }
  for (let r = 0; r <= ROWS; r++) { g.beginPath(); g.moveTo(X(0), Y(r)); g.lineTo(X(COLS), Y(r)); g.stroke(); }
  // the path: a dark lane with glowing magenta rails
  const m = MAPS[mi].pts;
  function lane() { g.beginPath(); for (let i = 0; i < m.length; i++) { const px = X(m[i][0] + 0.5), py = Y(m[i][1] + 0.5); if (i) g.lineTo(px, py); else g.moveTo(px, py); } }
  g.lineJoin = "miter"; g.lineCap = "square";
  g.save(); g.shadowColor = NEON.magenta; g.shadowBlur = 18;
  lane(); g.lineWidth = FPX * 0.9; g.strokeStyle = "rgba(255,63,208,.95)"; g.stroke();
  g.restore();
  lane(); g.lineWidth = FPX * 0.78; g.strokeStyle = "#12061f"; g.stroke();
  lane(); g.lineWidth = FPX * 0.62; g.strokeStyle = "#1a0a2c"; g.stroke();
  g.setLineDash([10, 14]); lane(); g.lineWidth = 2; g.strokeStyle = "rgba(255,63,208,.4)"; g.stroke(); g.setLineDash([]);
  // the master tape's pad
  const cx = X(P.core.c + 0.5), cy = Y(P.core.r + 0.5);
  g.save(); g.shadowColor = NEON.cyan; g.shadowBlur = 16;
  g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; g.lineTo(cx + Math.cos(a) * FPX * 0.5, cy + Math.sin(a) * FPX * 0.5); }
  g.closePath(); g.fillStyle = "#081a2c"; g.fill(); g.lineWidth = 3; g.strokeStyle = NEON.cyan; g.stroke();
  g.restore();
  // the frame round the whole board
  g.save(); g.shadowColor = NEON.cyan; g.shadowBlur = 14;
  g.lineWidth = 3; g.strokeStyle = "rgba(47,243,255,.9)"; g.strokeRect(X(0) - 6, Y(0) - 6, COLS * FPX + 12, ROWS * FPX + 12);
  g.restore();
}
// The endless synthwave floor around the board, one tile = 2 units.
function outerCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.fillStyle = "#04040f"; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(167,123,255,.55)"; g.lineWidth = 2;
  g.strokeRect(1, 1, 126, 126);
  g.strokeStyle = "rgba(167,123,255,.16)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
  return c;
}
function glowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.22, "rgba(255,255,255,.55)"); gr.addColorStop(0.55, "rgba(255,255,255,.14)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function swirlCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,.95)"); gr.addColorStop(0.3, "rgba(255,120,230,.6)"); gr.addColorStop(0.75, "rgba(120,40,255,.35)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(255,255,255,.5)"; g.lineWidth = 3;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    for (let i = 0; i < 60; i++) { const a = k * TAU / 3 + i * 0.12, r = i * 1.0; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    g.stroke();
  }
  return c;
}
// The marquee over the LED board: the wordmark and the game's name in neon.
function signCanvas(script) {
  const CW = 2048, CH = Math.round(CW * WALL.signH / WALL.w), c = mkCanvas(CW, CH), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, "#160a3a"); bg.addColorStop(0.55, "#0b0726"); bg.addColorStop(1, "#05041a");
  g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
  // sunset stripes behind the lettering
  const cxs = CW * 0.5, sun = g.createLinearGradient(0, CH * 0.12, 0, CH * 0.92);
  sun.addColorStop(0, "#ffe838"); sun.addColorStop(0.5, "#ff6a3a"); sun.addColorStop(1, "#ff2fa8");
  g.save(); g.globalAlpha = 0.28; g.fillStyle = sun;
  g.beginPath(); g.arc(cxs, CH * 0.98, CH * 0.85, Math.PI, TAU); g.fill();
  g.globalAlpha = 1; g.fillStyle = "#0b0726";
  for (let i = 0; i < 6; i++) g.fillRect(0, CH * (0.55 + i * 0.075), CW, 4 + i * 2);
  g.restore();
  g.save(); g.shadowColor = NEON.magenta; g.shadowBlur = 24;
  g.lineWidth = 10; g.strokeStyle = NEON.magenta; g.strokeRect(10, 10, CW - 20, CH - 20);
  g.shadowColor = NEON.cyan; g.lineWidth = 4; g.strokeStyle = NEON.cyan; g.strokeRect(26, 26, CW - 52, CH - 52);
  g.restore();
  const mh = CH * 0.78;
  drawScript(g, script, CW * 0.25, CH / 2, CW * 0.36, mh);
  neonText(g, "VECTOR SIEGE", CW * 0.67, CH * 0.52, Math.round(CH * 0.5), NEON.cyan, CW * 0.56);
  return c;
}
// The master tape's front: a VHS shell with two reel windows and the wordmark on its label.
function tapeCanvas(script) {
  const c = mkCanvas(512, 320), g = c.getContext("2d");
  g.fillStyle = "#0d0f1c"; g.fillRect(0, 0, 512, 320);
  rrectPath(g, 26, 22, 460, 170, 14); g.fillStyle = "#f4efdf"; g.fill();
  g.fillStyle = NEON.magenta; g.fillRect(26, 22, 460, 22);
  g.fillStyle = NEON.cyan; g.fillRect(26, 170, 460, 10);
  drawScript(g, script, 256, 106, 400, 110);
  rrectPath(g, 120, 206, 272, 92, 12); g.fillStyle = "#05060c"; g.fill();
  g.lineWidth = 3; g.strokeStyle = "#3b3f58"; g.stroke();
  [196, 316].forEach(function (x) {
    g.fillStyle = "#e9e3d0"; g.beginPath(); g.arc(x, 252, 30, 0, TAU); g.fill();
    g.fillStyle = "#05060c"; g.beginPath(); g.arc(x, 252, 12, 0, TAU); g.fill();
    g.fillStyle = "#e9e3d0"; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.fillRect(x + Math.cos(a) * 12 - 2, 252 + Math.sin(a) * 12 - 2, 4, 4); }
  });
  g.font = "bold 22px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#ff3fd0";
  g.fillText("MASTER", 66, 252); g.fillText("COPY", 446, 252);
  return c;
}
// The Blue Screen boss's face.
function screenCanvas() {
  const c = mkCanvas(256, 160), g = c.getContext("2d");
  g.fillStyle = "#1838d8"; g.fillRect(0, 0, 256, 160);
  g.fillStyle = "rgba(255,255,255,.08)"; for (let y = 0; y < 160; y += 4) g.fillRect(0, y, 256, 2);
  g.font = "bold 30px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#ffffff";
  g.fillText("SIGNAL", 128, 60); g.fillText("LOST", 128, 100);
  return c;
}
function recordCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.fillStyle = "#07070c"; g.beginPath(); g.arc(64, 64, 63, 0, TAU); g.fill();
  g.strokeStyle = "rgba(255,232,56,.18)"; g.lineWidth = 1;
  for (let r = 24; r < 62; r += 4) { g.beginPath(); g.arc(64, 64, r, 0, TAU); g.stroke(); }
  g.fillStyle = NEON.yellow; g.beginPath(); g.arc(64, 64, 18, 0, TAU); g.fill();
  g.fillStyle = "#07070c"; g.beginPath(); g.arc(64, 64, 3, 0, TAU); g.fill();
  g.fillStyle = "#ff3fd0"; g.fillRect(52, 54, 24, 4);
  return c;
}

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: /[?&]capture=1/.test(location.search) });
  renderer.setClearColor(0x03030b, 1);
  const scene = new T.Scene();
  scene.fog = new T.Fog(0x03030b, 18, 40);
  const camera = new T.PerspectiveCamera(CAM_FOV, W / H, 0.5, 120);
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
  const tGlow = tex(glowCanvas()), tSwirl = tex(swirlCanvas()), tOuter = tex(outerCanvas(), true);
  const cFloor = mkCanvas(Math.round((COLS + FLOOR_M * 2) * FPX), Math.round((ROWS + FLOOR_M * 2) * FPX)), tFloor = tex(cFloor);

  /* lights: the bodies are lit a little, but nearly everything here makes its own light */
  scene.add(new T.HemisphereLight(0x9fb4ff, 0x140c2a, 1.1));
  const key = new T.DirectionalLight(0xffffff, 1.4); key.position.set(-4, 10, 6); scene.add(key);

  /* materials, shared and cached by color */
  const cache = {};
  function lineMat(col, op) { const k = "l" + col + (op || 1); return cache[k] || (cache[k] = new T.LineBasicMaterial({ color: col, transparent: op != null && op < 1, opacity: op || 1 })); }
  function fillMat(col, k) { const id = "f" + col + k; return cache[id] || (cache[id] = new T.MeshLambertMaterial({ color: 0x141838, emissive: new T.Color(col), emissiveIntensity: k })); }
  function basicMat(col, op, add) { const id = "b" + col + op + !!add; return cache[id] || (cache[id] = new T.MeshBasicMaterial({ color: col, transparent: op < 1 || !!add, opacity: op, blending: add ? T.AdditiveBlending : T.NormalBlending, depthWrite: !add && op >= 1 })); }
  function glowMat(col, op) { const id = "g" + col + op; return cache[id] || (cache[id] = new T.SpriteMaterial({ map: tGlow, color: col, transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false })); }
  const edgeCache = new Map();
  function edges(geo) { let e = edgeCache.get(geo); if (!e) { e = new T.EdgesGeometry(geo, 24); edgeCache.set(geo, e); } return e; }
  // A body: dark glass with a faint inner glow and bright neon edges.
  function light(col, k) { const c = new T.Color(col); c.lerp(new T.Color(0xffffff), k); return "#" + c.getHexString(); }
  function neon(geo, col, k, parent, edgeCol) {
    const g = new T.Group();
    const m = new T.Mesh(geo, fillMat(col, k == null ? 0.22 : k));
    const l = new T.LineSegments(edges(geo), lineMat(edgeCol || col)); l.scale.setScalar(1.004);
    g.add(m); g.add(l); g.userData.lines = l; g.userData.fill = m;
    if (parent) parent.add(g);
    return g;
  }
  function glow(col, size, op, parent, y, own) {
    const m = own ? new T.SpriteMaterial({ map: tGlow, color: col, transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false }) : glowMat(col, op);
    const s = new T.Sprite(m); s.scale.set(size, size, 1); s.position.y = y || 0; if (parent) parent.add(s); return s;
  }
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);

  /* the world around the board */
  const outerGeo = new T.PlaneGeometry(90, 90); outerGeo.rotateX(-Math.PI / 2);
  (function () { const uv = outerGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 45, uv.getY(i) * 45); })();
  const outer = new T.Mesh(outerGeo, new T.MeshBasicMaterial({ map: tOuter }));
  outer.position.y = -0.04; scene.add(outer);
  const floorGeo = new T.PlaneGeometry(COLS + FLOOR_M * 2, ROWS + FLOOR_M * 2); floorGeo.rotateX(-Math.PI / 2);
  const floor = new T.Mesh(floorGeo, new T.MeshBasicMaterial({ map: tFloor }));
  scene.add(floor);
  // the board is a slab: dark sides so it reads as raised off the endless floor
  const slab = new T.Mesh(new T.BoxGeometry(COLS + FLOOR_M * 2, 0.3, ROWS + FLOOR_M * 2), new T.MeshBasicMaterial({ color: 0x0a0b20 }));
  slab.position.y = -0.155; scene.add(slab);
  const slabLines = new T.LineSegments(new T.EdgesGeometry(slab.geometry), lineMat(NEON.violet, 0.8)); slabLines.position.copy(slab.position); scene.add(slabLines);

  /* the back wall: base with the portal, the LED ribbon, the marquee */
  const wall = new T.Group(); wall.position.set(0, 0, WALL.z); wall.rotation.x = -WALL.lean; scene.add(wall);
  const wallDark = new T.MeshBasicMaterial({ color: 0x07061a });
  const wallBox = new T.Mesh(new T.BoxGeometry(WALL.w, WALL.sign0 + WALL.signH + 0.08, 0.22), wallDark);
  wallBox.position.set(0, (WALL.sign0 + WALL.signH + 0.08) / 2, -0.12); wall.add(wallBox);
  [0.02, WALL.base, WALL.led0 - 0.03, WALL.led0 + WALL.ledH + 0.03, WALL.sign0 + WALL.signH + 0.06].forEach(function (y, i) {
    const bar = new T.Mesh(new T.BoxGeometry(WALL.w, 0.035, 0.04), basicMat(i % 2 ? NEON.magenta : NEON.cyan, 1));
    bar.position.set(0, y, 0.01); wall.add(bar);
  });
  // chevrons on the base, pointing the way in
  const chevMat = basicMat(NEON.violet, 0.55, true);
  for (let i = -4; i <= 4; i++) {
    const ch = new T.Mesh(new T.PlaneGeometry(0.28, 0.06), chevMat);
    ch.position.set(i * 1.0, WALL.base * 0.55, 0.012); wall.add(ch);
  }
  const signFace = new T.Mesh(new T.PlaneGeometry(WALL.w - 0.06, WALL.signH), new T.MeshBasicMaterial({ map: tex(signCanvas(script)) }));
  signFace.position.set(0, WALL.sign0 + WALL.signH / 2, 0.012); wall.add(signFace);

  /* LED ribbon board */
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
      "  vec3 col = led * lens * 1.38 + halo * 0.34 + vec3(0.030, 0.034, 0.046) * lens + vec3(0.005, 0.006, 0.010);",
      "  gl_FragColor = vec4(col, 1.0);",
      "  #include <" + csChunk + ">",
      "}"
    ].join("\n")
  });
  const ledFace = new T.Mesh(new T.PlaneGeometry(WALL.w - 0.06, WALL.ledH), ledMat);
  ledFace.position.set(0, WALL.led0 + WALL.ledH / 2, 0.014); wall.add(ledFace);

  /* the portal in the base of the wall */
  const portal = new T.Group(); scene.add(portal);
  const ring = new T.Mesh(new T.TorusGeometry(0.4, 0.045, 8, 32), basicMat(NEON.magenta, 1)); ring.position.y = 0.42; portal.add(ring);
  const ring2 = new T.Mesh(new T.TorusGeometry(0.47, 0.012, 6, 32), basicMat(NEON.cyan, 1)); ring2.position.y = 0.42; portal.add(ring2);
  const swirl = new T.Mesh(new T.CircleGeometry(0.4, 32), new T.MeshBasicMaterial({ map: tSwirl, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
  swirl.position.y = 0.42; portal.add(swirl);
  glow(NEON.magenta, 1.8, 0.55, portal, 0.42);

  /* the master tape: what the enemies are after */
  const core = new T.Group(); scene.add(core);
  const tapeBody = new T.Group(); core.add(tapeBody);
  const tapeGeo = new T.BoxGeometry(0.92, 0.57, 0.16);
  const tapeFront = new T.MeshBasicMaterial({ map: tex(tapeCanvas(script)) });
  const tapeSide = new T.MeshLambertMaterial({ color: 0x0d0f1c, emissive: new T.Color(NEON.cyan), emissiveIntensity: 0.15 });
  const tape = new T.Mesh(tapeGeo, [tapeSide, tapeSide, tapeSide, tapeSide, tapeFront, tapeFront]);
  tapeBody.add(tape);
  const tapeLines = new T.LineSegments(new T.EdgesGeometry(tapeGeo), lineMat(NEON.cyan)); tapeLines.scale.setScalar(1.01); tapeBody.add(tapeLines);
  tapeBody.position.y = 0.62;
  const shield = new T.Mesh(new T.TorusGeometry(0.56, 0.025, 6, 40), basicMat("#ffffff", 1));
  shield.rotation.x = Math.PI / 2; shield.position.y = 0.08; core.add(shield);
  const shieldGlow = glow(NEON.cyan, 2.2, 0.4, core, 0.55, true);

  /* data pulses running down the path */
  const pulses = [];
  for (let i = 0; i < 16; i++) { const s = new T.Sprite(glowMat(NEON.magenta, 0.9)); s.scale.set(0.3, 0.3, 1); scene.add(s); pulses.push(s); }

  /* shared shapes */
  const G = {
    base: new T.BoxGeometry(0.8, 0.14, 0.8), pip: new T.BoxGeometry(0.1, 0.05, 0.1),
    post: new T.CylinderGeometry(0.15, 0.2, 0.2, 8), head: new T.BoxGeometry(0.3, 0.15, 0.3), barrel: new T.BoxGeometry(0.05, 0.05, 0.4),
    boomBody: new T.BoxGeometry(0.62, 0.34, 0.24), speaker: new T.CylinderGeometry(0.11, 0.11, 0.04, 14).rotateX(Math.PI / 2),
    cone: new T.CylinderGeometry(0.045, 0.045, 0.05, 10).rotateX(Math.PI / 2), handle: new T.TorusGeometry(0.2, 0.025, 5, 12, Math.PI), deck: new T.BoxGeometry(0.14, 0.08, 0.03),
    crystal: new T.OctahedronGeometry(0.22).scale(1, 1.55, 1), iceRing: new T.TorusGeometry(0.3, 0.02, 5, 24).rotateX(Math.PI / 2), pauseBar: new T.BoxGeometry(0.05, 0.16, 0.05),
    mast: new T.CylinderGeometry(0.05, 0.08, 0.5, 6), sniper: new T.BoxGeometry(0.07, 0.07, 0.66), disc: new T.CylinderGeometry(0.25, 0.25, 0.025, 28),
    prism: new T.CylinderGeometry(0.27, 0.27, 0.5, 3), emitter: new T.OctahedronGeometry(0.08),
    blip: new T.OctahedronGeometry(0.28), zip: new T.ConeGeometry(0.2, 0.52, 3).rotateX(Math.PI / 2), brick: new T.BoxGeometry(0.44, 0.44, 0.44),
    pixel: new T.BoxGeometry(0.17, 0.17, 0.17), static: new T.IcosahedronGeometry(0.3, 0),
    torus: new T.TorusGeometry(0.42, 0.13, 8, 22), dodeca: new T.DodecahedronGeometry(0.5), knot: new T.TorusKnotGeometry(0.34, 0.1, 64, 8),
    slab: new T.BoxGeometry(0.95, 0.62, 0.16), ringBig: new T.TorusGeometry(0.5, 0.05, 6, 30), core: new T.SphereGeometry(0.2, 12, 8),
    reelRim: new T.TorusGeometry(0.5, 0.06, 6, 28), reelHub: new T.CylinderGeometry(0.14, 0.14, 0.2, 12).rotateX(Math.PI / 2), spoke: new T.BoxGeometry(0.08, 0.4, 0.08),
    orbit: new T.TorusGeometry(0.78, 0.015, 4, 40).rotateX(Math.PI / 2), mini: new T.BoxGeometry(0.1, 0.1, 0.1)
  };
  const discMats = [new T.MeshBasicMaterial({ color: 0x07070c }), new T.MeshBasicMaterial({ map: tex(recordCanvas()) }), new T.MeshBasicMaterial({ map: tex(recordCanvas()) })];
  const screenMat = new T.MeshBasicMaterial({ map: tex(screenCanvas()) });

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  const out = {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, script: script, G: G, light: light,
    neon: neon, glow: glow, lineMat: lineMat, fillMat: fillMat, basicMat: basicMat, glowMat: glowMat, edges: edges, unit: unit, discMats: discMats, screenMat: screenMat,
    cFloor: cFloor, tFloor: tFloor, mapI: -1, wall: wall, portal: portal, swirl: swirl, ring: ring, core: core, tapeBody: tapeBody, shield: shield, shieldGlow: shieldGlow, tapeLines: tapeLines,
    pulses: pulses, towerVis: new Map(), towerVer: -1, foeVis: new Map(), pool: {}, ghosts: [],
    camPos: new T.Vector3(), camTgt: new T.Vector3(), fit: null, camReady: false, v: new T.Vector3(), v2: new T.Vector3(),
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0,
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, glowOn: true, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
  // see-through copies of every tower, for placing
  for (let i = 0; i < TOWERS.length; i++) {
    const gh = makeTowerVis(out, { type: i, lvl: 0, hue: 0, aim: Math.PI });
    gh.root.traverse(function (o) {
      if (o.isLineSegments) o.material = new T.LineBasicMaterial({ color: TOWERS[i].color, transparent: true, opacity: 0.75 });
      else if (o.isMesh) o.material = new T.MeshBasicMaterial({ color: TOWERS[i].color, transparent: true, opacity: 0.18, depthWrite: false });
      else if (o.isSprite) o.visible = false;
    });
    gh.root.visible = false; scene.add(gh.root); out.ghosts.push(gh);
  }
  fitCamera(out);
  return out;
}

// The closest camera that keeps the whole board and the top of the back wall inside SAFE.
function fitCamera(o) {
  const T = o.T, cam = o.camera, v = new T.Vector3();
  const top = WALL.sign0 + WALL.signH + 0.1, tz = WALL.z - Math.sin(WALL.lean) * top, ty = Math.cos(WALL.lean) * top;
  const hx = COLS / 2 + FLOOR_M, hz = ROWS / 2 + FLOOR_M;
  const pts = [[-hx, 0, hz], [hx, 0, hz], [-hx, -0.3, hz], [hx, -0.3, hz], [-WALL.w / 2, ty, tz], [WALL.w / 2, ty, tz], [-hx, 0, -hz], [hx, 0, -hz]];
  const sinP = Math.sin(CAM_PITCH), cosP = Math.cos(CAM_PITCH), tanF = Math.tan(CAM_FOV * Math.PI / 360);
  function bounds(tz0, d) {
    cam.position.set(0, d * sinP, tz0 + d * cosP); cam.lookAt(0, 0, tz0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    let y1 = 1e9, y2 = -1e9, x1 = 1e9, x2 = -1e9;
    for (let i = 0; i < pts.length; i++) {
      v.set(pts[i][0], pts[i][1], pts[i][2]).project(cam);
      const px = (v.x * 0.5 + 0.5) * W, py = (-v.y * 0.5 + 0.5) * H;
      x1 = Math.min(x1, px); x2 = Math.max(x2, px); y1 = Math.min(y1, py); y2 = Math.max(y2, py);
    }
    return { x1: x1, x2: x2, y1: y1, y2: y2 };
  }
  function centered(d) {
    let tz0 = 0, bb = null;
    const ppu = H / (2 * d * tanF);
    for (let n = 0; n < 8; n++) { bb = bounds(tz0, d); tz0 += ((bb.y1 + bb.y2) / 2 - (SAFE.y1 + SAFE.y2) / 2) / (ppu * sinP); }
    return { tz: tz0, d: d, bb: bounds(tz0, d) };
  }
  let lo = 5, hi = 80, best = null;
  for (let n = 0; n < 18; n++) {
    const mid = (lo + hi) / 2, c = centered(mid);
    if (c.bb.x2 - c.bb.x1 <= SAFE.x2 - SAFE.x1 && c.bb.y2 - c.bb.y1 <= SAFE.y2 - SAFE.y1) { best = c; hi = mid; } else lo = mid;
  }
  o.fit = best || centered(80);
  o.scene.fog.near = o.fit.d + 8; o.scene.fog.far = o.fit.d + 40;     // the fog starts past the board, so only the endless floor fades
  o.camPos.set(0, o.fit.d * sinP, o.fit.tz + o.fit.d * cosP); o.camTgt.set(0, 0, o.fit.tz);
  cam.position.copy(o.camPos); cam.lookAt(o.camTgt); cam.updateMatrixWorld();
  o.camReady = true;
}

// Put the chosen map on the board: floor paint, portal, master tape.
function applyMap(mi) {
  paintFloor(R.cFloor.getContext("2d"), mi);
  R.tFloor.needsUpdate = true;
  const P = buildPath(mi);
  R.portal.position.set(cellX(P.start[0]), 0, WALL.z + 0.18);
  R.core.position.set(cellX(P.core.c), 0, cellZ(P.core.r));
  R.mapI = mi; R.dirty = true;
}

/* ---------------- Towers in 3D ---------------- */
function makeTowerVis(o, tw) {
  const T = o.T, G = o.G, def = TOWERS[tw.type], col = def.id === "chroma" ? HUE_HEX[tw.hue] : def.color;
  const root = new T.Group(), body = new T.Group(); root.add(body);
  const v = { root: root, body: body, yaw: null, spin: null, flash: null, lvl: tw.lvl, hue: tw.hue, fx: tw.fx || 0, kick: 0, yawNow: tw.aim };
  const base = o.neon(G.base, col, 0.1, body); base.position.y = 0.07;
  for (let i = 0; i <= tw.lvl; i++) { const p = new T.Mesh(G.pip, o.basicMat(col, 1)); p.position.set(-0.27 + i * 0.18, 0.165, 0.33); body.add(p); }
  if (def.id !== "freeze") v.baseGlow = o.glow(col, 1.4, 0.22, body, 0.05);
  if (def.id === "strobe") {
    o.neon(G.post, col, 0.2, body).position.y = 0.24;
    const yaw = new T.Group(); yaw.position.y = 0.4; body.add(yaw); v.yaw = yaw;
    o.neon(G.head, col, 0.3, yaw);
    [-0.07, 0.07].forEach(function (x) { const b = o.neon(G.barrel, col, 0.4, yaw); b.position.set(x, 0.02, 0.22); });
    v.flash = o.glow("#ffffff", 0.5, 0, yaw, 0.02, true); v.flash.position.z = 0.44;
  } else if (def.id === "boombox") {
    const yaw = new T.Group(); yaw.position.y = 0.14; body.add(yaw); v.yaw = yaw;
    o.neon(G.boomBody, col, 0.18, yaw).position.y = 0.19;
    [-0.17, 0.17].forEach(function (x) {
      const s = o.neon(G.speaker, col, 0.35, yaw); s.position.set(x, 0.19, 0.125);
      const cn = new T.Mesh(G.cone, o.basicMat(col, 1)); cn.position.set(x, 0.19, 0.15); yaw.add(cn);
    });
    o.neon(G.deck, NEON.white, 0.2, yaw).position.set(0, 0.22, 0.125);
    const hd = o.neon(G.handle, col, 0.3, yaw); hd.position.y = 0.36;
    v.flash = o.glow(col, 0.9, 0, yaw, 0.2, true); v.flash.position.z = 0.25;
  } else if (def.id === "freeze") {
    const spin = new T.Group(); spin.position.y = 0.52; body.add(spin); v.spin = spin;
    o.neon(G.crystal, col, 0.45, spin);
    o.neon(G.iceRing, col, 0.5, body).position.y = 0.26;
    [-0.05, 0.05].forEach(function (x) { const b = new T.Mesh(G.pauseBar, o.basicMat(col, 1)); b.position.set(x, 0.95, 0); body.add(b); });
    o.glow(col, 1.6, 0.3, body, 0.5);
    v.flash = o.glow(col, 2.4, 0, body, 0.3, true);
  } else if (def.id === "longplay") {
    o.neon(G.mast, col, 0.25, body).position.y = 0.38;
    const yaw = new T.Group(); yaw.position.y = 0.6; body.add(yaw); v.yaw = yaw;
    const s = o.neon(G.sniper, col, 0.45, yaw); s.position.z = 0.18;
    const spin = new T.Group(); spin.position.y = 0.66; body.add(spin); v.spin = spin;
    const disc = new T.Mesh(G.disc, o.discMats); spin.add(disc);
    const rim = new T.LineSegments(o.edges(G.disc), o.lineMat(col)); spin.add(rim);
    v.flash = o.glow("#ffffff", 0.7, 0, yaw, 0, true); v.flash.position.z = 0.52;
  } else {
    const spin = new T.Group(); spin.position.y = 0.44; body.add(spin); v.spin = spin;
    o.neon(G.prism, col, 0.35, spin);
    const em = new T.Mesh(G.emitter, o.basicMat("#ffffff", 1)); em.position.y = 0.36; spin.add(em);
    o.glow(col, 1.1, 0.5, body, 0.44);
    v.flash = o.glow(col, 1.1, 0, body, 0.8, true);
  }
  const k = 1 + tw.lvl * 0.07;
  body.scale.set(k, k, k);
  return v;
}

/* ---------------- Enemies in 3D ---------------- */
// Shown a third bigger than the rules' size, glowing in their wave's color with near-white edges, so they read on a phone.
const FOE_SHOW = 1.32;
function makeFoeVis(o, e) {
  const T = o.T, G = o.G, col = HUE_HEX[e.hue], edge = o.light(col, 0.55), root = new T.Group(), spin = new T.Group(); root.add(spin);
  const v = { root: root, spin: spin, key: e.boss >= 0 ? "" : e.k + e.hue, parts: [], col: col, edge: edge, mode: -1 };
  function body(geo, k, parent) { const b = o.neon(geo, col, k, parent || spin, edge); v.parts.push(b); return b; }
  if (e.boss >= 0) {
    const shape = BOSSES[e.boss].shape;
    if (shape === "torus") body(G.torus, 0.55);
    else if (shape === "dodeca") {
      body(G.dodeca, 0.5);
      for (let i = 0; i < 6; i++) body(G.mini, 0.9, root).userData.orb = i;
    } else if (shape === "knot") body(G.knot, 0.55);
    else if (shape === "slab") {
      const f = o.fillMat(col, 0.45), s = new T.Mesh(G.slab, [f, f, f, f, o.screenMat, o.screenMat]);
      spin.add(s);
      const l = new T.LineSegments(o.edges(G.slab), o.lineMat(edge)); l.scale.setScalar(1.01); spin.add(l);
      const g = new T.Group(); g.userData.lines = l; v.parts.push(g);
    } else if (shape === "rings") {
      body(G.ringBig, 0.8); body(G.ringBig, 0.8).rotation.y = Math.PI / 2;
      const c = o.neon(G.core, "#ffffff", 0.8, spin); v.parts.push(c);
    } else {
      body(G.reelRim, 0.7); body(G.reelHub, 0.7);
      for (let i = 0; i < 3; i++) { const sp = body(G.spoke, 0.7); sp.rotation.z = -i * TAU / 3; sp.position.set(Math.sin(i * TAU / 3) * 0.24, Math.cos(i * TAU / 3) * 0.24, 0); }
    }
    const orbit = new T.Mesh(G.orbit, o.basicMat(col, 0.8, true)); root.add(orbit); v.orbit = orbit;
    v.halo = o.glow(col, 3.4, 0.6, root, 0);
    root.scale.setScalar(1.15);
  } else {
    body(G[e.k], e.k === "pixel" ? 0.95 : 0.62);
    v.halo = o.glow(col, e.size * 4.6, 0.55, root, 0);
    root.scale.setScalar(FOE_SHOW);
  }
  return v;
}
function foeLines(o, v, mode) {           // 0 = own color, 1 = frozen, 2 = hit flash
  const col = mode === 2 ? "#ffffff" : mode === 1 ? NEON.ice : v.edge;
  for (let i = 0; i < v.parts.length; i++) { const l = v.parts[i].userData.lines; if (l) l.material = o.lineMat(col); }
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
const QUALITY = [{ pr: 2, glow: true }, { pr: 1.5, glow: true }, { pr: 1.15, glow: true }, { pr: 1, glow: false }];
function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  R.glowOn = QUALITY[R.quality].glow;
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

/* ---------------- World <-> screen, through the 3D camera ---------------- */
function toScreen(x, y, z) {
  if (!R) return { x: W / 2, y: H / 2, ok: false };
  R.v.set(x, y, z).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1 };
}
function screenToGround(px, py) {
  const cam = R.camera;
  R.v.set(px / W * 2 - 1, 1 - py / H * 2, 0.5).unproject(cam);
  R.v2.copy(R.v).sub(cam.position);
  if (R.v2.y > -1e-6) return null;
  const t = -cam.position.y / R.v2.y;
  return { x: cam.position.x + R.v2.x * t, z: cam.position.z + R.v2.z * t };
}

/* ---------------- Game state -> meshes ---------------- */
function syncScene(state, fdt) {
  const idle = state === "title" || state === "over", calm = Shell.reduced;
  R.clock += fdt;
  ledTick(fdt);
  if (R.mapI !== S.mapI) applyMap(S.mapI);
  const t = R.clock;

  /* towers */
  if (R.towerVer !== S.towerVer) {
    R.towerVer = S.towerVer;
    const keep = new Set();
    for (let i = 0; i < S.towers.length; i++) {
      const tw = S.towers[i];
      keep.add(tw.id);
      let v = R.towerVis.get(tw.id);
      if (v && (v.lvl !== tw.lvl || v.hue !== tw.hue)) { R.scene.remove(v.root); v = null; }
      if (!v) { v = makeTowerVis(R, tw); v.root.position.set(tw.x, 0, tw.z); R.scene.add(v.root); R.towerVis.set(tw.id, v); v.pop = 1; }
    }
    R.towerVis.forEach(function (v, id) { if (!keep.has(id)) { R.scene.remove(v.root); R.towerVis.delete(id); } });
  }
  for (let i = 0; i < S.towers.length; i++) {
    const tw = S.towers[i], v = R.towerVis.get(tw.id);
    if (!v) continue;
    if (v.yaw) {
      let d = tw.aim - v.yawNow;
      while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      v.yawNow += d * Math.min(1, fdt * 14);
      v.yaw.rotation.y = v.yawNow;
    }
    if (v.spin) v.spin.rotation.y += fdt * (TOWERS[tw.type].id === "longplay" ? 3.5 : 0.9);
    if (tw.fx !== v.fx) { v.fx = tw.fx; v.kick = 1; }
    v.kick = Math.max(0, v.kick - fdt * 8);
    if (v.flash) v.flash.material.opacity = R.glowOn ? v.kick * 0.95 : 0;
    if (v.pop > 0) { v.pop = Math.max(0, v.pop - fdt * 4); const k = 1 - v.pop; v.root.scale.setScalar(calm ? 1 : 0.6 + 0.4 * k + Math.sin(k * Math.PI) * 0.12); }
    if (v.baseGlow) v.baseGlow.visible = R.glowOn;
  }

  /* ghost tower while placing */
  for (let i = 0; i < R.ghosts.length; i++) R.ghosts[i].root.visible = false;
  const gc = S.ghost;
  if (!idle && !S.ending && S.build >= 0 && gc && inGrid(gc.c, gc.r) && canBuildAt(gc.c, gc.r)) {
    const gh = R.ghosts[S.build];
    gh.root.visible = true; gh.root.position.set(cellX(gc.c), 0.02 + (calm ? 0 : Math.sin(t * 5) * 0.03), cellZ(gc.r));
  }

  /* enemies */
  const seen = new Set();
  for (let i = 0; i < S.enemies.length; i++) {
    const e = S.enemies[i];
    seen.add(e.id);
    let v = R.foeVis.get(e.id);
    if (!v) {
      const key = e.boss >= 0 ? "" : e.k + e.hue, pool = key && R.pool[key];
      v = pool && pool.length ? pool.pop() : makeFoeVis(R, e);
      v.root.visible = true; R.scene.add(v.root); R.foeVis.set(e.id, v);
      v.mode = 0; foeLines(R, v, 0);
    }
    const bob = calm ? 0 : Math.sin(e.age * 5 + e.id) * 0.05;
    const y = (e.boss >= 0 ? 0.85 : e.size * FOE_SHOW + 0.1) + bob;
    let jx = 0;
    if (e.boss >= 0 && BOSSES[e.boss].shape === "torus" && !calm && Math.sin(e.age * 13) > 0.8) jx = (Math.random() - 0.5) * 0.18;   // tracking glitch
    v.root.position.set(e.x + jx, y, e.z);
    const head = Math.atan2(e.hx, e.hz);
    if (e.k === "zip") v.spin.rotation.set(0, head, 0);
    else if (e.boss >= 0) {
      const sh = BOSSES[e.boss].shape;
      if (sh === "slab") v.spin.rotation.set(Math.sin(e.age * 2) * 0.15, Math.atan2(R.camera.position.x - e.x, R.camera.position.z - e.z), 0);
      else if (sh === "reel") { v.spin.rotation.set(-0.5, Math.atan2(R.camera.position.x - e.x, R.camera.position.z - e.z), 0); v.spin.rotateZ(-e.age * 2.4); }
      else v.spin.rotation.set(e.age * 0.7, e.age * 1.3, 0);
      if (v.orbit) { v.orbit.rotation.y = e.age * 1.5; v.orbit.rotation.x = Math.sin(e.age) * 0.3; }
      for (let k = 0; k < v.parts.length; k++) {
        const p = v.parts[k];
        if (p.userData.orb != null) { const a = e.age * 2 + p.userData.orb * TAU / 6; p.position.set(Math.cos(a) * 0.8, Math.sin(a * 2) * 0.15, Math.sin(a) * 0.8); p.rotation.set(a, a, 0); }
      }
    } else v.spin.rotation.set(e.age * 1.2, e.age * 1.9, 0);
    if (e.k === "static" && !calm) v.root.visible = Math.sin(e.age * 31 + e.id) > -0.7;
    const mode = e.hitT > 0 ? 2 : e.slowT > 0 ? 1 : 0;
    if (mode !== v.mode) { v.mode = mode; foeLines(R, v, mode); }
    if (v.halo) v.halo.visible = R.glowOn;
  }
  R.foeVis.forEach(function (v, id) {
    if (seen.has(id)) return;
    R.scene.remove(v.root); R.foeVis.delete(id);
    if (v.key) { (R.pool[v.key] || (R.pool[v.key] = [])).push(v); }
  });

  /* portal, master tape, pulses */
  V.portal = Math.max(0, V.portal - fdt * 1.5);
  R.swirl.rotation.z = -t * 2.4;
  R.ring.scale.setScalar(1 + V.portal * 0.25 + (calm ? 0 : Math.sin(t * 4) * 0.03));
  V.coreHit = Math.max(0, V.coreHit - fdt * 1.6);
  const life = idle && !S.ending ? 1 : clamp(S.lives / START_LIVES, 0, 1);
  const hc = life > 0.6 ? NEON.cyan : life > 0.3 ? NEON.yellow : NEON.red;
  R.shield.material = R.basicMat(V.coreHit > 0.5 && Math.floor(t * 20) % 2 ? NEON.red : hc, 1);
  R.shieldGlow.material.color.set(V.coreHit > 0 ? NEON.red : hc); R.shieldGlow.material.opacity = 0.4 + V.coreHit * 0.4;
  R.tapeLines.material = R.lineMat(V.coreHit > 0.3 ? NEON.red : NEON.cyan);
  R.tapeBody.position.y = 0.62 + (calm ? 0 : Math.sin(t * 1.6) * 0.05);
  R.tapeBody.rotation.y = calm ? 0 : Math.sin(t * 0.7) * 0.35 + (V.coreHit > 0 ? Math.sin(t * 60) * 0.12 * V.coreHit : 0);
  R.shield.scale.setScalar(1 + V.coreHit * 0.3);
  const P = PATH;
  for (let i = 0; i < R.pulses.length; i++) {
    const d = ((calm ? 0 : t * 1.4) + i * P.len / R.pulses.length) % P.len;
    pathAt(P, d, tmpP);
    R.pulses[i].position.set(tmpP.x, 0.06, tmpP.z);
    R.pulses[i].visible = R.glowOn && d > 0.6;
  }

  /* camera: the fitted view, a slow sway on the title, a kick when something hits the tape */
  const cp = R.camPos, ct = R.camTgt, f = R.fit, sinP = Math.sin(CAM_PITCH), cosP = Math.cos(CAM_PITCH);
  const sway = idle && !calm ? Math.sin(idleT * 0.35) * 0.35 : 0;
  cp.set(sway, f.d * sinP, f.tz + f.d * cosP); ct.set(sway * 0.4, 0, f.tz);
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (Math.random() * 2 - 1) * m; sy = (Math.random() * 2 - 1) * m;
  }
  R.camera.position.set(cp.x + sx, cp.y + sy, cp.z);
  R.camera.lookAt(ct.x + sx, ct.y + sy, ct.z);
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
// A circle on the ground, seen through the camera.
function groundRing(c, x, z, r, n) {
  n = n || 48;
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = i / n * TAU, p = toScreen(x + Math.cos(a) * r, 0.03, z + Math.sin(a) * r);
    if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y);
  }
}
function cellQuad(c, cc, rr, inset) {
  const x0 = cellX(cc) - 0.5 + inset, x1 = cellX(cc) + 0.5 - inset, z0 = cellZ(rr) - 0.5 + inset, z1 = cellZ(rr) + 0.5 - inset;
  const a = toScreen(x0, 0.02, z0), b = toScreen(x1, 0.02, z0), d = toScreen(x1, 0.02, z1), e = toScreen(x0, 0.02, z1);
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.lineTo(e.x, e.y); c.closePath();
}

function drawWorld(c, state, fdt) {
  const play = state === "playing" && !S.ending;
  // range ring of the selected tower, or of the one being placed
  let ringAt = null, ringR = 0, ringCol = NEON.cyan;
  if (play && S.sel) { ringAt = S.sel; ringR = stat(S.sel, "range"); ringCol = TOWERS[S.sel.type].id === "chroma" ? HUE_HEX[S.sel.hue] : TOWERS[S.sel.type].color; }
  else if (play && S.build >= 0 && S.ghost) { ringAt = { x: cellX(S.ghost.c), z: cellZ(S.ghost.r) }; ringR = TOWERS[S.build].range[0]; ringCol = TOWERS[S.build].color; }
  if (play && S.build >= 0 && S.ghost) {
    const ok = canBuildAt(S.ghost.c, S.ghost.r) && S.credits >= TOWERS[S.build].cost[0];
    cellQuad(c, S.ghost.c, S.ghost.r, 0.06);
    c.fillStyle = ok ? "rgba(155,255,58,.22)" : "rgba(255,59,74,.28)"; c.fill();
    c.lineWidth = 2; c.strokeStyle = ok ? NEON.lime : NEON.red; c.stroke();
    if (!ok) ringAt = null;
  }
  if (play && S.kbCur) {
    cellQuad(c, S.cur.c, S.cur.r, 0.02);
    c.lineWidth = 2; c.setLineDash([4, 3]); c.strokeStyle = "#ffffff"; c.stroke(); c.setLineDash([]);
  } else if (play && S.hover && S.build < 0) {
    const tw = towerAt(S.hover.c, S.hover.r);
    if (tw && tw !== S.sel) { cellQuad(c, tw.c, tw.r, 0.04); c.lineWidth = 1.5; c.strokeStyle = "rgba(255,255,255,.6)"; c.stroke(); }
  }
  if (ringAt) {
    groundRing(c, ringAt.x, ringAt.z, ringR);
    c.fillStyle = rgba(ringCol, 0.08); c.fill();
    c.lineWidth = 1.6; c.setLineDash([6, 4]); c.strokeStyle = rgba(ringCol, 0.9); c.stroke(); c.setLineDash([]);
  }

  c.save(); c.globalCompositeOperation = "lighter";
  // freeze pulses and blasts
  for (let i = V.rings.length - 1; i >= 0; i--) {
    const q = V.rings[i];
    q.t += fdt;
    if (q.t >= q.life) { V.rings.splice(i, 1); continue; }
    const u = q.t / q.life, r = q.r0 + (q.r1 - q.r0) * (1 - Math.pow(1 - u, 2));
    groundRing(c, q.x, q.z, r, 36);
    if (q.fill) { c.fillStyle = rgba(q.col, 0.28 * (1 - u)); c.fill(); }
    c.lineWidth = q.w * (1 - u * 0.5); c.strokeStyle = rgba(q.col, 0.9 * (1 - u)); c.stroke();
  }
  // beams
  for (let i = V.beams.length - 1; i >= 0; i--) {
    const b = V.beams[i];
    b.t += fdt;
    if (b.t >= b.life) { V.beams.splice(i, 1); continue; }
    const a = toScreen(b.x0, b.y0, b.z0), e = toScreen(b.x1, b.y1, b.z1), k = 1 - b.t / b.life;
    c.lineCap = "round";
    c.strokeStyle = rgba(b.col, 0.35 * k); c.lineWidth = b.w * 3.2;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(e.x, e.y); c.stroke();
    c.strokeStyle = rgba("#ffffff", 0.9 * k); c.lineWidth = b.w * 0.8;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(e.x, e.y); c.stroke();
    c.fillStyle = rgba(b.col, 0.7 * k); c.beginPath(); c.arc(e.x, e.y, 3 + b.w, 0, TAU); c.fill();
  }
  // boombox blasts in the air
  for (let i = 0; i < S.shots.length; i++) {
    const s = S.shots[i], y = 0.4 + Math.sin(s.u * Math.PI) * 0.9, p = toScreen(s.x, y, s.z);
    const gr = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9);
    gr.addColorStop(0, "rgba(255,255,255,.95)"); gr.addColorStop(0.35, rgba(NEON.orange, 0.8)); gr.addColorStop(1, rgba(NEON.orange, 0));
    c.fillStyle = gr; c.fillRect(p.x - 9, p.y - 9, 18, 18);
  }
  // sparks
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i], sp = Math.hypot(q.vx, q.vy) || 1;
    c.globalAlpha = clamp(q.life * 2.5, 0, 1);
    c.strokeStyle = q.c; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(q.x - q.vx / sp * q.len, q.y - q.vy / sp * q.len); c.stroke();
  }
  c.globalAlpha = 1;
  c.restore();

  // health bars, and the boss's name
  for (let i = 0; i < S.enemies.length; i++) {
    const e = S.enemies[i];
    if (e.d < 0.4) continue;
    const boss = e.boss >= 0;
    if (!boss && e.hp >= e.max) continue;
    const p = toScreen(e.x, (boss ? 1.75 : e.size * 2 * FOE_SHOW + 0.3), e.z), w = boss ? 46 : 18, k = clamp(e.hp / e.max, 0, 1);
    c.fillStyle = "rgba(3,3,12,.85)"; c.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, boss ? 6 : 4);
    c.fillStyle = k > 0.5 ? NEON.lime : k > 0.25 ? NEON.yellow : NEON.red; c.fillRect(p.x - w / 2, p.y, w * k, boss ? 4 : 2);
    if (boss) txt(c, BOSSES[e.boss].name, p.x, p.y - 13, 9, HUE_HEX[e.hue], "center", "#000000");
  }
  // floating numbers
  for (let i = 0; i < floats.length; i++) {
    const f = floats[i];
    let x = f.x, y = f.y;
    if (f.wx != null) { const p = toScreen(f.wx, 0.9, f.wz); x = p.x; y = p.y; }
    c.globalAlpha = Math.max(0, 1 - f.t / 1.1);
    txt(c, f.txt, x, y - f.t * 26, f.big ? 13 : 10, f.col, "center", "#000000");
  }
  c.globalAlpha = 1;
}

function drawTowerIcon(c, id, x, y, s, col) {
  c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.6; c.lineJoin = "round";
  if (id === "strobe") {
    c.strokeRect(-s * 0.35, -s * 0.1, s * 0.5, s * 0.45);
    c.beginPath(); c.moveTo(s * 0.15, s * 0.0); c.lineTo(s * 0.62, -s * 0.36); c.moveTo(s * 0.15, s * 0.2); c.lineTo(s * 0.66, -s * 0.18); c.stroke();
  } else if (id === "boombox") {
    c.strokeRect(-s * 0.6, -s * 0.28, s * 1.2, s * 0.62);
    c.beginPath(); c.arc(-s * 0.32, s * 0.04, s * 0.18, 0, TAU); c.moveTo(s * 0.5, s * 0.04); c.arc(s * 0.32, s * 0.04, s * 0.18, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(-s * 0.35, -s * 0.28); c.lineTo(-s * 0.25, -s * 0.5); c.lineTo(s * 0.25, -s * 0.5); c.lineTo(s * 0.35, -s * 0.28); c.stroke();
  } else if (id === "freeze") {
    c.beginPath(); c.moveTo(0, -s * 0.6); c.lineTo(s * 0.36, 0); c.lineTo(0, s * 0.6); c.lineTo(-s * 0.36, 0); c.closePath(); c.stroke();
    c.fillRect(-s * 0.13, -s * 0.18, s * 0.08, s * 0.36); c.fillRect(s * 0.05, -s * 0.18, s * 0.08, s * 0.36);
  } else if (id === "longplay") {
    c.beginPath(); c.arc(0, 0, s * 0.52, 0, TAU); c.stroke();
    c.beginPath(); c.arc(0, 0, s * 0.32, 0, TAU); c.globalAlpha = 0.5; c.stroke(); c.globalAlpha = 1;
    c.beginPath(); c.arc(0, 0, s * 0.12, 0, TAU); c.fill();
  } else {
    const tri = function (r) { c.beginPath(); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); };
    tri(s * 0.6); c.stroke();
    c.strokeStyle = NEON.cyan; tri(s * 0.36); c.stroke();
    c.fillStyle = NEON.lime; c.beginPath(); c.arc(0, s * 0.02, s * 0.1, 0, TAU); c.fill();
  }
  c.restore();
}

function drawHUD(c, state) {
  const bg = c.createLinearGradient(0, 0, 0, HUD_H);
  bg.addColorStop(0, "#1a1550"); bg.addColorStop(0.55, "#0d0b30"); bg.addColorStop(1, "#070620");
  c.fillStyle = bg; c.fillRect(0, 0, W, HUD_H);
  c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(0, 0, W, 1);
  c.fillStyle = NEON.magenta; c.fillRect(0, HUD_H, W, 2);
  c.fillStyle = NEON.cyan; c.fillRect(0, HUD_H + 2, W, 1);
  const lowL = S.lives <= 5 && Math.floor(R.clock * 3) % 2 === 0 && state === "playing";
  txt(c, "LIVES", 10, 6, 8, "#9fb4ff");
  txt(c, String(S.lives), 10, 18, 17, lowL ? NEON.red : "#ffffff", "left", "#000000");
  txt(c, "CREDITS", 74, 6, 8, "#9fb4ff");
  txt(c, String(S.credits), 74, 18, 17, NEON.yellow, "left", "#000000");
  txt(c, "WAVE", 176, 6, 8, "#9fb4ff", "center");
  txt(c, S.wave + "/" + WAVES, 176, 18, 17, NEON.cyan, "center", "#000000");
  txt(c, "SCORE", W - 10, 6, 8, "#9fb4ff", "right");
  txt(c, String(S.score), W - 10, 18, 17, NEON.lime, "right", "#000000");

  // what's coming next
  if (S.wave < WAVES) {
    const n = S.wave + 1, boss = PLAN[n - 1] === "B", hue = HUE_HEX[waveHue(n)], label = "NEXT " + n + ": " + waveLabel(n);
    c.font = "bold 9px " + HUD_FONT;
    const w = c.measureText(label).width + 30;
    rrect(c, 6, HUD_H + 6, w, 15, 7); c.fillStyle = "rgba(4,4,16,.78)"; c.fill();
    c.lineWidth = 1; c.strokeStyle = boss ? NEON.magenta : "rgba(159,180,255,.5)"; c.stroke();
    c.fillStyle = hue; c.beginPath(); c.arc(16, HUD_H + 13.5, 4, 0, TAU); c.fill();
    txt(c, label, 25, HUD_H + 9, 9, boss ? NEON.magenta : "#ffffff");
  } else if (state === "playing") {
    txt(c, "FINAL WAVE: HOLD THE LINE", 8, HUD_H + 8, 9, NEON.magenta, "left", "#000000");
  }
  if (S.combo >= 5 && S.comboT > 0 && state === "playing") txt(c, "COMBO X" + S.combo, W - 8, HUD_H + 8, 10, NEON.yellow, "right", "#000000");
}

function btnBox(c, q, on, col, pressed) {
  rrect(c, q.x, q.y, q.w, q.h, 7);
  const g = c.createLinearGradient(0, q.y, 0, q.y + q.h);
  g.addColorStop(0, pressed ? "#2a2470" : "#1b1850"); g.addColorStop(1, pressed ? "#141040" : "#0a0926");
  c.fillStyle = g; c.fill();
  c.lineWidth = on ? 2 : 1; c.strokeStyle = on ? col : "rgba(159,180,255,.35)"; c.stroke();
}

function drawDock(c, state) {
  const bg = c.createLinearGradient(0, DOCK_Y, 0, H);
  bg.addColorStop(0, "#120f3c"); bg.addColorStop(1, "#05041a");
  c.fillStyle = bg; c.fillRect(0, DOCK_Y, W, H - DOCK_Y);
  c.fillStyle = NEON.cyan; c.fillRect(0, DOCK_Y, W, 1);
  c.fillStyle = NEON.magenta; c.fillRect(0, DOCK_Y + 1, W, 1);
  const list = dockButtons(), pr = S.press && S.press.btn;
  // a hint over the dock while placing
  if (state === "playing" && !S.ending && S.build >= 0) {
    const def = TOWERS[S.build], msg = S.kbCur ? "SPACE BUILDS " + def.short : S.mouse ? "CLICK A GLOWING SQUARE TO BUILD" : S.ghost && canBuildAt(S.ghost.c, S.ghost.r) ? "TAP AGAIN TO BUILD " + def.short : "TAP A GLOWING SQUARE FOR " + def.short;
    c.font = "bold 10px " + HUD_FONT;
    const w = c.measureText(msg).width + 20;
    rrect(c, W / 2 - w / 2, DOCK_Y - 22, w, 17, 8); c.fillStyle = "rgba(4,4,16,.82)"; c.fill();
    c.lineWidth = 1; c.strokeStyle = def.color; c.stroke();
    txt(c, msg, W / 2, DOCK_Y - 19, 10, "#ffffff", "center");
  }
  for (let i = 0; i < list.length; i++) {
    const q = list[i], down = pr && pr.act === q.act && pr.i === q.i;
    if (q.act === "tower") {
      const def = TOWERS[q.i], can = S.credits >= def.cost[0], on = S.build === q.i;
      btnBox(c, q, on, def.color, down);
      c.globalAlpha = can ? 1 : 0.45;
      drawTowerIcon(c, def.id, q.x + q.w / 2, q.y + 20, 15, def.id === "chroma" ? NEON.magenta : def.color);
      txt(c, def.short === "LONG PLAY" ? "LONG PLAY" : def.short, q.x + q.w / 2, q.y + 37, def.short.length > 7 ? 7 : 8, "#ffffff", "center");
      c.globalAlpha = 1;
      txt(c, String(def.cost[0]), q.x + q.w / 2, q.y + 48, 11, can ? NEON.yellow : NEON.red, "center");
      txt(c, String(q.i + 1), q.x + 5, q.y + 4, 7, "rgba(159,180,255,.6)");
    } else if (q.act === "send") {
      const boss = S.wave < WAVES && PLAN[S.wave] === "B", col = boss ? NEON.magenta : NEON.lime;
      btnBox(c, q, S.wave < WAVES, col, down);
      if (S.wave >= WAVES) { txt(c, "ALL WAVES", q.x + q.w / 2, q.y + 7, 9, "#9fb4ff", "center"); txt(c, "SENT", q.x + q.w / 2, q.y + 19, 10, "#ffffff", "center"); }
      else {
        txt(c, (S.wave === 0 ? "START" : "SEND") + " WAVE " + (S.wave + 1), q.x + q.w / 2, q.y + 5, 9, col, "center");
        const secs = S.nextIn > 0 ? Math.ceil(S.nextIn) + "s" : "NOW", eb = earlyBonus(), bonus = eb > 0 ? "+" + eb : "";
        txt(c, secs + (bonus ? "  " + bonus : ""), q.x + q.w / 2, q.y + 19, 11, "#ffffff", "center");
      }
    } else if (q.act === "speed") {
      btnBox(c, q, S.speed > 0, NEON.cyan, down);
      const sp = SPEEDS[S.speed];
      c.fillStyle = S.speed > 0 ? NEON.cyan : "#9fb4ff";
      txt(c, "SPEED", q.x + 9, q.y + 8, 9, "#ffffff");
      for (let k = 0; k < 3; k++) {
        const x = q.x + 54 + k * 9;
        c.globalAlpha = k < sp ? 1 : 0.22;
        c.beginPath(); c.moveTo(x, q.y + 7); c.lineTo(x + 8, q.y + 12.5); c.lineTo(x, q.y + 18); c.closePath(); c.fill();
      }
      c.globalAlpha = 1;
    } else if (q.act === "upgrade") {
      const tw = S.sel, def = TOWERS[tw.type], max = tw.lvl >= 3, cost = max ? 0 : def.cost[tw.lvl + 1], can = !max && S.credits >= cost;
      btnBox(c, q, can, NEON.lime, down);
      txt(c, max ? "MAXED" : "UPGRADE", q.x + q.w / 2, q.y + 10, 9, max ? "#9fb4ff" : NEON.lime, "center");
      if (!max) {
        txt(c, "TO LV " + (tw.lvl + 2), q.x + q.w / 2, q.y + 24, 8, "#ffffff", "center");
        txt(c, String(cost), q.x + q.w / 2, q.y + 40, 13, can ? NEON.yellow : NEON.red, "center");
      } else txt(c, "LV 4", q.x + q.w / 2, q.y + 30, 13, NEON.yellow, "center");
    } else if (q.act === "sell") {
      const tw = S.sel;
      btnBox(c, q, true, NEON.orange, down);
      txt(c, "SELL", q.x + q.w / 2, q.y + 10, 9, NEON.orange, "center");
      txt(c, "+" + Math.round(tw.spent * SELL_BACK), q.x + q.w / 2, q.y + 30, 13, NEON.yellow, "center");
    } else if (q.act === "close") {
      c.strokeStyle = "#9fb4ff"; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(q.x + 7, q.y + 5); c.lineTo(q.x + 15, q.y + 13); c.moveTo(q.x + 15, q.y + 5); c.lineTo(q.x + 7, q.y + 13); c.stroke();
    } else if (q.act === "hue") {
      const tw = S.sel;
      btnBox(c, q, true, HUE_HEX[tw.hue], down);
      c.fillStyle = HUE_HEX[tw.hue]; c.beginPath(); c.arc(q.x + 11, q.y + q.h / 2, 5, 0, TAU); c.fill();
      txt(c, "COLOR: " + HUES[tw.hue].toUpperCase(), q.x + 19, q.y + 6, 8, "#ffffff");
    }
  }
  // the selected tower's card
  if (S.sel) {
    const tw = S.sel, def = TOWERS[tw.type], col = def.id === "chroma" ? HUE_HEX[tw.hue] : def.color, y0 = DOCK_Y + 6;
    txt(c, def.name, 8, y0, 11, col, "left", "#000000");
    for (let i = 0; i < 4; i++) { c.fillStyle = i <= tw.lvl ? col : "rgba(159,180,255,.25)"; c.fillRect(8 + i * 12, y0 + 16, 9, 4); }
    txt(c, "LV " + (tw.lvl + 1), 60, y0 + 13, 8, "#ffffff");
    let line = "DMG " + def.dmg[tw.lvl] + "  RNG " + def.range[tw.lvl];
    let line2 = def.id === "freeze" ? "SLOW " + Math.round((1 - def.slow[tw.lvl]) * 100) + "%  KILLS " + tw.kills : def.rate[tw.lvl] + "/S  KILLS " + tw.kills;
    if (def.id === "boombox") line2 = "BLAST " + def.splash[tw.lvl] + "  KILLS " + tw.kills;
    txt(c, line, 8, y0 + 25, 8, "#cfd8ff");
    txt(c, def.id === "chroma" ? "X3 ON MATCHING COLOR" : line2, 8, y0 + 36, 8, "#cfd8ff");
    if (def.id !== "chroma") txt(c, def.role.toUpperCase(), 8, y0 + 48, 8, col);
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
  if (state === "paused" && !R.dirty) return;
  if (state === "playing") watchFrameRate(ms);
  const fdt = state === "paused" || V.hold ? 0 : Math.min(ms, 50) / 1000;
  if (sized) {
    syncScene(state, fdt);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  drawWorld(c, state, fdt);
  if (V.bare) return;
  drawHUD(c, state);
  drawDock(c, state);
}

/* ---------------- The title card's attract mode: a few towers and some traffic on the chosen grid ---------------- */
function startDemo() {
  reset();
  S.demo = true; S.demoT = 0.6;
  const picks = bestCells(6), kinds = [0, 1, 2, 3, 4, 0];
  for (let i = 0; i < picks.length; i++) { const tw = buildAt(kinds[i], picks[i].c, picks[i].r, true); if (tw) tw.lvl = i % 2; }
  S.towerVer++;
}
// Build squares ranked by how much path they can reach, spread out a little.
function bestCells(n, range) {
  range = range || 2.3;
  const all = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!canBuildAt(c, r)) continue;
    let cover = 0;
    for (let d = 0; d < PATH.len; d += 0.25) { pathAt(PATH, d, tmpP); if (Math.hypot(tmpP.x - cellX(c), tmpP.z - cellZ(r)) <= range) cover++; }
    all.push({ c: c, r: r, v: cover });
  }
  all.sort(function (a, b) { return b.v - a.v; });
  const out = [];
  for (let i = 0; i < all.length && out.length < n; i++) {
    if (out.some(function (o) { return Math.abs(o.c - all[i].c) + Math.abs(o.r - all[i].r) < 2; })) continue;
    out.push(all[i]);
  }
  return out;
}

/* ---------------- Splash, boot, shell hookup ---------------- */
function makeSplash() {
  const el = document.createElement("div");
  el.id = "npg-splash";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Nostalgia Pro Games");
  el.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;z-index:9999;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;gap:18px;padding:24px;box-sizing:border-box;text-align:center;" +
    "background:radial-gradient(circle at 50% 42%,#2a1670 0%,#110a3c 52%,#04030f 100%);" +
    "font:bold 15px/1.5 " + HUD_FONT.replace(/"/g, "'") + ";color:#ffffff;opacity:1;transition:opacity .35s ease";
  const img = document.createElement("img");
  img.alt = "";
  img.decoding = "async";
  img.style.cssText = "display:block;width:min(66vw,44vh,340px);height:auto;opacity:0;transform:scale(.86);" +
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "transition:opacity .2s ease" : "transition:opacity .28s ease,transform .55s cubic-bezier(.2,1.5,.4,1)");
  el.appendChild(img);
  const load = document.createElement("div");
  load.textContent = "LOADING VECTOR SIEGE";
  load.style.cssText = "font:bold 12px/1 " + HUD_FONT.replace(/"/g, "'") + ";letter-spacing:.18em;color:#2ff3ff;text-shadow:0 0 8px #2ff3ff";
  el.appendChild(load);
  document.body.appendChild(el);
  return { el: el, img: img, load: load };
}
function splashFail(splash, lines) {
  const el = splash.el;
  splash.img.style.width = "min(40vw,26vh,180px)";
  if (splash.load) splash.load.style.display = "none";
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

// The map picker on the title card: three buttons, the choice is remembered.
function mapPicker(card, before) {
  if (!card) return;
  const box = document.createElement("div");
  box.setAttribute("role", "group"); box.setAttribute("aria-label", "Choose a grid");
  box.style.cssText = "display:flex;gap:6px;margin:8px 0 10px;width:100%";
  const btns = MAPS.map(function (m, i) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-btn";
    b.style.cssText = "flex:1 1 0;min-width:0;padding:6px 2px;font-size:10px;line-height:1.25;white-space:normal";
    b.innerHTML = m.name + "<br><span style='opacity:.75;font-size:9px'>" + m.tag + (m.mult > 1 ? " x" + m.mult + " PTS" : "") + "</span>";
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      Juke.unlock();
      if (mapPick === i) return;
      mapPick = i; saveMap(i); mark();
      if (Shell.state() === "title") startDemo();
      Juke.sfx("click");
    });
    box.appendChild(b);
    return b;
  });
  function mark() {
    btns.forEach(function (b, i) {
      const on = i === mapPick;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.style.boxShadow = on ? "0 0 0 2px #2ff3ff inset, 0 0 12px rgba(47,243,255,.5)" : "none";
      b.style.color = on ? "#2ff3ff" : "";
    });
  }
  mark();
  card.insertBefore(box, before || null);
}

function logoImg(width, cls) {
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
  im.style.cssText = "display:block;width:" + width + ";height:auto;margin:0 auto 4px";
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_URL;
  return im;
}

function startGame() {
  Shell.init({
    slug: "vector-siege",
    title: "VECTOR SIEGE",
    accent: "#2ff3ff",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "Thirty waves of vector raiders are marching on your master tape. Pick a tower in the dock, tap a glowing square, tap again to build. Tap a tower to upgrade or sell it.",
    keys: "Keys: 1 to 5 pick a tower, arrows move, Space builds or selects, U upgrade, X sell, C color, W next wave, F speed, N music. P pause, M mute, R restart.",
    tip: "Chroma hits three times harder on its own color. Send waves early for bonus credits.",
    reset: function () { reset(); },
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) {
      idleT += dt;
      if (Shell.state() === "title") {
        if (!S.demo) startDemo();
        let left = dt;
        while (left > 1e-6) { const h = Math.min(left, 1 / 30); step(h); left -= h; }
        updateFx(dt);
      } else updateFx(dt);
    },
    onPause: function () { keys = {}; S.press = null; }
  });
  attach();
  // Sound. Nothing is created until the first tap, click or key press; the band starts with the game.
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Juke.unlock, true); });
  Shell.onStart(Juke.newGame); Shell.onRestart(Juke.newGame); Shell.onResume(Juke.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Juke.toggleMusic();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) {
    titleCard.insertBefore(logoImg("clamp(54px,10vh,88px)"), titleCard.firstChild);
    mapPicker(titleCard, titleCard.querySelector(".np-best"));
    Juke.button(titleCard, titleCard.querySelector(".np-tip"));
  }
  if (pauseActions) Juke.button(pauseActions, pauseActions.querySelector("a"));
  // The studio logo heads the score card as well.
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) card.insertBefore(logoImg("clamp(64px,14vh,104px)"), card.firstChild);
}

// Hook for automated checks (no effect on play)
window.__vectorSiege = {
  S: function () { return S; }, step: step, update: update, build: buildAt, upgrade: upgrade, sell: sell, send: sendWave, cycleHue: cycleHue,
  setSpeed: setSpeed, startWave: startWave, bestCells: bestCells, waveList: waveList, waveHP: waveHP, canBuildAt: canBuildAt,
  gfx: function () { return R; }, led: function () { return LED; }, juke: Juke, toScreen: toScreen, toGround: function (x, y) { return screenToGround(x, y); },
  pickCell: pickCell, dockButtons: dockButtons, MAPS: MAPS, TOWERS: TOWERS, PLAN: PLAN, BOSSES: BOSSES,
  view: function () { return V; }, clearFx: function () { parts.length = 0; floats.length = 0; }, path: function () { return PATH; }, setMap: function (i) { mapPick = i; saveMap(i); }, startMusic: startMusic
};

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
      try { applyMap(S.mapI); R.renderer.compile(R.scene, R.camera); } catch (e) { /* warm-up only */ }
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
        ? "Vector Siege could not load its 3D engine (" + THREE_URL + ")."
        : "Vector Siege needs WebGL for its 3D grid, and this browser has it switched off or does not support it.");
    });
})();
