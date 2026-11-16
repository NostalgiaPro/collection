/* GEM SHOP (3D): a match-three gem puzzle in a jeweler's shop you build up between levels.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a WebGL canvas that
   sits directly under the shell's 2D canvas. The shell canvas stays in charge of input, scaling and the
   title / pause / game over flow, and carries the HUD, the shop menu and the score popups.

   The board is 8 x 8. Swap two neighbors to line up three or more of a kind. Four in a row makes a line gem,
   an L or a T makes a bomb, five in a row makes a prism. Cascades multiply the score. Every gem you clear
   puts coins in the till, and between levels the coins buy display cases, a mine, a workshop, a better sign
   and a vault, each built in 3D and each with a bonus. Levels alternate between move limits and the clock.
   Fail a level and you can buy more moves or time with coins, or cash out.

   Everything here (code, art, music, names) is original to the Nostalgia Pro Arcade. */

const W = 360, H = 540, TAU = Math.PI * 2, N = 8, NCOL = 6;
const HUD_H = 68;
const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash, title card, score card
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every in-world sign and decal
const THREE_URL = "../shared/three.module.min.js";
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';

// gem kinds: 0 diamond, 1 sapphire, 2 ruby, 3 emerald, 4 topaz, 5 amethyst. Each has its own cut, so color is never the only clue.
const GEM_NAMES = ["DIAMOND", "SAPPHIRE", "RUBY", "EMERALD", "TOPAZ", "AMETHYST"];
const GEM_PLURAL = ["DIAMONDS", "SAPPHIRES", "RUBIES", "EMERALDS", "TOPAZES", "AMETHYSTS"];
const GEM_HEX = ["#e9f6ff", "#2f7bff", "#ff2448", "#17d46a", "#ffb31a", "#b65cff"];
// special kinds
const SP_ROW = 1, SP_COL = 2, SP_BOMB = 3, SP_PRISM = 4;

/* ---------------- Levels ---------------- */
// goals: score (level score), collect (gems of one kind), ore (break every rock slab), make (special gems created)
const LEVELS = [
  { name: "Opening Day", moves: 20, goals: [{ k: "score", n: 1500 }] },
  { name: "Ruby Rush", moves: 22, goals: [{ k: "collect", t: 2, n: 20 }] },
  { name: "First Dig", moves: 25, goals: [{ k: "ore" }],
    ore: ["........", "........", "..1111..", "..1111..", "..1111..", "..1111..", "........", "........"] },
  { name: "Lunch Rush", time: 60, goals: [{ k: "score", n: 8500 }] },
  { name: "Line Work", moves: 24, goals: [{ k: "make", sp: "line", n: 3 }] },
  { name: "Deep Vein", moves: 27, goals: [{ k: "ore" }],
    ore: ["........", "..1111..", ".1....1.", ".1.22.1.", ".1.22.1.", ".1....1.", "..1111..", "........"] },
  { name: "Blue and Gold", moves: 24, goals: [{ k: "collect", t: 1, n: 20 }, { k: "collect", t: 4, n: 20 }] },
  { name: "Weekend Crowd", time: 70, goals: [{ k: "score", n: 15000 }] },
  { name: "Bomb Squad", moves: 25, goals: [{ k: "make", sp: "bomb", n: 2 }] },
  { name: "Mother Lode", moves: 30, goals: [{ k: "ore" }],
    ore: ["........", ".111111.", ".1.22.1.", ".12..21.", ".12..21.", ".1.22.1.", ".111111.", "........"] },
  { name: "Holiday Sale", time: 75, goals: [{ k: "score", n: 21000 }] },
  { name: "Crown Jewels", moves: 30, goals: [{ k: "make", sp: "prism", n: 1 }, { k: "score", n: 12000 }] }
];
const ORE_LOOP = [LEVELS[2].ore, LEVELS[5].ore, LEVELS[9].ore,
  ["........", ".2....2.", "..1111..", "..1221..", "..1221..", "..1111..", ".2....2.", "........"]];
const LOOP_NAMES = ["Encore", "Night Shift", "Grand Reopening", "Collector's Row", "Big Spender", "Last Call"];

// Past the twelfth level the shop keeps going: the same four kinds of level, a little harder each lap.
function levelDef(i) {
  if (i < LEVELS.length) return LEVELS[i];
  const lap = i - LEVELS.length, k = Math.floor(lap / 4) + 1, kind = lap % 4;
  const name = LOOP_NAMES[lap % LOOP_NAMES.length] + " " + (k + 1);
  if (kind === 0) return { name: name, moves: 22, goals: [{ k: "score", n: 12000 + k * 3000 }] };
  if (kind === 1) return { name: name, time: 75, goals: [{ k: "score", n: 20000 + k * 4000 }] };
  if (kind === 2) return { name: name, moves: 24, goals: [{ k: "ore" }], ore: ORE_LOOP[(lap >> 2) % ORE_LOOP.length] };
  const a = lap % NCOL, b = (lap + 3) % NCOL;
  return { name: name, moves: 24, goals: [{ k: "collect", t: a, n: 20 + k * 4 }, { k: "collect", t: b, n: 20 + k * 4 }] };
}

/* ---------------- The shop (between levels) ---------------- */
// Five buildings, three tiers each. The bonuses are what the shop is for; the 3D is what they look like.
const BUILD = [
  { id: "cases", name: "DISPLAY CASES", cost: [50, 120, 240], col: "#3fe0ff",
    fx: ["+15% score", "+30% score", "+45% score"] },
  { id: "mine", name: "THE MINE", cost: [70, 150, 280], col: "#ffb31a",
    fx: ["Start with a line gem", "+ a bomb, ore pays 2", "+ a 2nd line, ore pays 3"] },
  { id: "work", name: "WORKSHOP", cost: [60, 140, 260], col: "#9bff3f",
    fx: ["+2 moves / +8 sec", "+4 moves / +16 sec", "+6 moves / +24 sec"] },
  { id: "sign", name: "STOREFRONT SIGN", cost: [40, 110, 220], col: "#ff4fc0",
    fx: ["+25% coins", "+50% coins", "+75% coins"] },
  { id: "vault", name: "THE VAULT", cost: [80, 170, 300], col: "#b68cff",
    fx: ["10% interest", "20% interest", "30% interest"] }
];
const CONT_COST = [40, 80, 140];                           // buying more moves or time after a fail, per level

/* ---------------- Game state ---------------- */
let S = {}, grid = [], ore = [], uid = 1, idleT = 0, paused = false, keys = {};
let THREE = null, R = null;                                // R holds everything the renderer owns
const pops = [];                                           // score popups on the HUD layer

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function ri(n) { return Math.floor(Math.random() * n); }
function tier(id) { return S.build ? S.build[id] || 0 : 0; }
function scoreMult() { return 1 + 0.15 * tier("cases"); }
function coinMult() { return 1 + 0.25 * tier("sign"); }
function commas(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

function reset() {
  paused = false;
  S = { t: 0, level: 0, score: 0, coins: 0, coinFrac: 0, coinsEarned: 0, build: { cases: 0, mine: 0, work: 0, sign: 0, vault: 0 },
        mode: "intro", modeT: 0, lvScore: 0, moves: 0, time: 0, timed: false, goals: [], prog: [], chain: 0, bestChain: 0,
        made: 0, bombs: 0, prisms: 0, combos: 0, cleared: 0, levelsCleared: 0, sel: null, cur: { r: 4, c: 3 }, kb: false,
        drag: null, swap: null, idle: 0, hint: null, conts: 0, fail: null, shop: null, bellTaps: 0, warnT: 0, lastTick: -1,
        stars: 0, lvCoins: 0, interest: 0, endT: 0 };
  pops.length = 0;
  startLevel(0, true);
}

function startLevel(i, first) {
  const d = levelDef(i);
  S.level = i; S.def = d; S.lvScore = 0; S.conts = 0; S.chain = 0; S.sel = null; S.hint = null; S.idle = 0; S.fail = null;
  S.timed = !!d.time;
  const w = tier("work");
  S.moves = d.moves ? d.moves + w * 2 : 0;
  S.time = d.time ? d.time + w * 8 : 0;
  S.goals = d.goals; S.prog = d.goals.map(function () { return 0; });
  S.lvCoins = 0; S.lvGems = 0; S.lastTick = -1;
  ore = [];
  for (let r = 0; r < N; r++) { ore.push([]); for (let c = 0; c < N; c++) ore[r].push(d.ore ? Number(d.ore[r][c]) || 0 : 0); }
  S.oreTotal = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) S.oreTotal += ore[r][c];
  newBoard(first);
  S.mode = "intro"; S.modeT = 0;
  if (R) { syncOre(); camTo("board", first); }
  ledLevel(i, d);
}

/* ---------------- Board ---------------- */
function newGem(t, sp, r, c) {
  return { id: uid++, t: t, sp: sp || 0, r: r, c: c, x: c, z: r, y: 0, vz: 0, s: 1, dying: false, die: 0, delay: 0, fired: false,
           spin: Math.random() * TAU, born: 0, mesh: null, land: 0 };
}
function at(r, c) { return r >= 0 && r < N && c >= 0 && c < N ? grid[r][c] : null; }
function kind(r, c) { const g = at(r, c); return g && !g.dying && g.sp !== SP_PRISM ? g.t : -9; }

// A fresh board with nothing lined up and at least one move. Old gems drop off the front edge, new ones fall in from the back.
function newBoard(first) {
  if (!first) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r] && grid[r][c]) dropOff(grid[r][c]);
  if (first && R) {                                        // a new run: clear every piece the last one left on the tray
    while (R.gemRoot.children.length) R.gemRoot.remove(R.gemRoot.children[0]);
    R.leaving.length = 0;
    for (let i = R.fx.length - 1; i >= 0; i--) { const f = R.fx[i]; if (f.m) f.m.parent.remove(f.m); if (f.w) f.w.parent.remove(f.w); }
    R.fx.length = 0;
  }
  for (let tries = 0; tries < 60; tries++) {
    grid = [];
    for (let r = 0; r < N; r++) {
      grid.push([]);
      for (let c = 0; c < N; c++) {
        let t, n = 0;
        do { t = ri(NCOL); n++; } while (n < 30 && ((c >= 2 && kind(r, c - 1) === t && kind(r, c - 2) === t) || (r >= 2 && grid[r - 1][c].t === t && grid[r - 2][c].t === t)));
        grid[r].push(newGem(t, 0, r, c));
      }
    }
    if (findMove()) break;
  }
  // the mine's head start: special gems already on the board
  const m = tier("mine"), gifts = m >= 3 ? [SP_ROW, SP_BOMB, SP_COL] : m === 2 ? [SP_ROW, SP_BOMB] : m === 1 ? [SP_COL] : [];
  for (let k = 0; k < gifts.length; k++) {
    const r = 2 + ri(4), c = 1 + ri(6), g = grid[r][c];
    if (!g.sp) g.sp = gifts[k];
  }
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const g = grid[r][c];
    g.z = r - N - 1.2 - (N - 1 - r) * 0.18 - c * 0.04;       // stacked up behind the board, they pour in row by row
    g.vz = 0;
    if (R) addGemMesh(g);
  }
}

// Every horizontal and vertical run of three or more, joined into groups where runs share a gem (L and T shapes).
function findGroups() {
  const runs = [];
  for (let r = 0; r < N; r++) {
    let c = 0;
    while (c < N) {
      const t = kind(r, c);
      let e = c;
      if (t >= 0) while (e + 1 < N && kind(r, e + 1) === t) e++;
      if (t >= 0 && e - c >= 2) { const cells = []; for (let k = c; k <= e; k++) cells.push([r, k]); runs.push({ h: true, t: t, cells: cells }); }
      c = e + 1;
    }
  }
  for (let c = 0; c < N; c++) {
    let r = 0;
    while (r < N) {
      const t = kind(r, c);
      let e = r;
      if (t >= 0) while (e + 1 < N && kind(e + 1, c) === t) e++;
      if (t >= 0 && e - r >= 2) { const cells = []; for (let k = r; k <= e; k++) cells.push([k, c]); runs.push({ h: false, t: t, cells: cells }); }
      r = e + 1;
    }
  }
  // union runs that share a cell
  const parent = runs.map(function (_, i) { return i; });
  function root(i) { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; }
  const owner = {};
  runs.forEach(function (run, i) {
    run.cells.forEach(function (p) {
      const k = p[0] * N + p[1];
      if (owner[k] != null) parent[root(i)] = root(owner[k]); else owner[k] = i;
    });
  });
  const by = {};
  runs.forEach(function (run, i) { const k = root(i); (by[k] = by[k] || []).push(run); });
  const groups = [];
  for (const k in by) {
    const rs = by[k], cells = {}, g = { t: rs[0].t, runs: rs, cells: [], maxH: 0, maxV: 0, cross: null };
    rs.forEach(function (run) {
      if (run.h) g.maxH = Math.max(g.maxH, run.cells.length); else g.maxV = Math.max(g.maxV, run.cells.length);
      run.cells.forEach(function (p) { const key = p[0] * N + p[1]; if (cells[key]) g.cross = p; cells[key] = p; });
    });
    for (const q in cells) g.cells.push(cells[q]);
    groups.push(g);
  }
  return groups;
}

// What special (if any) a group makes.
function groupSpecial(g) {
  if (Math.max(g.maxH, g.maxV) >= 5) return SP_PRISM;
  if (g.maxH >= 3 && g.maxV >= 3) return SP_BOMB;
  if (g.maxH === 4) return SP_ROW;
  if (g.maxV === 4) return SP_COL;
  return 0;
}

// Would swapping these two make anything happen?
function swapWorks(r1, c1, r2, c2) {
  const a = grid[r1][c1], b = grid[r2][c2];
  if (!a || !b) return false;
  if (a.sp === SP_PRISM || b.sp === SP_PRISM) return true;
  if (a.sp && b.sp) return true;
  grid[r1][c1] = b; grid[r2][c2] = a;
  const ok = lineAt(r1, c1) || lineAt(r2, c2);
  grid[r1][c1] = a; grid[r2][c2] = b;
  return ok;
}
function lineAt(r, c) {
  const t = kind(r, c);
  if (t < 0) return false;
  let h = 1, v = 1;
  for (let k = c - 1; k >= 0 && kind(r, k) === t; k--) h++;
  for (let k = c + 1; k < N && kind(r, k) === t; k++) h++;
  for (let k = r - 1; k >= 0 && kind(k, c) === t; k--) v++;
  for (let k = r + 1; k < N && kind(k, c) === t; k++) v++;
  return h >= 3 || v >= 3;
}
// A move that works, picked at random among all of them (so the hint is not always top left).
function findMove() {
  const list = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (c + 1 < N && swapWorks(r, c, r, c + 1)) list.push([r, c, r, c + 1]);
    if (r + 1 < N && swapWorks(r, c, r + 1, c)) list.push([r, c, r + 1, c]);
  }
  return list.length ? list[ri(list.length)] : null;
}

/* ---------------- Moves ---------------- */
function canMove() { return S.mode === "play" && !paused; }

function trySwap(r1, c1, r2, c2) {
  if (!canMove()) return;
  if (r2 < 0 || r2 >= N || c2 < 0 || c2 >= N || Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return;
  const a = grid[r1][c1], b = grid[r2][c2];
  if (!a || !b) return;
  S.sel = null; S.hint = null; S.idle = 0;
  grid[r1][c1] = b; grid[r2][c2] = a;
  a.r = r2; a.c = c2; b.r = r1; b.c = c1;
  S.swap = { a: a, b: b, t: 0, back: false };
  S.mode = "swap"; S.modeT = 0;
  Juke.sfx("swap");
}

function swapLanded() {
  const sw = S.swap, a = sw.a, b = sw.b;
  if (sw.back) { S.swap = null; S.mode = "play"; return; }
  // special swaps go off whether or not anything lines up
  const prism = a.sp === SP_PRISM ? a : b.sp === SP_PRISM ? b : null;
  if (prism || (a.sp && b.sp)) {
    useMove();
    S.chain = 1;
    S.swap = null;
    specialSwap(a, b);
    return;
  }
  const groups = findGroups();
  if (!groups.length) {                                     // nothing: swap back
    grid[a.r][a.c] = b; grid[b.r][b.c] = a;
    const ar = a.r, ac = a.c; a.r = b.r; a.c = b.c; b.r = ar; b.c = ac;
    sw.back = true; sw.t = 0; S.mode = "swap";
    Juke.sfx("bad");
    return;
  }
  useMove();
  S.chain = 1;
  S.swap = null;
  beginClear(groups, [a, b]);
}
function useMove() { if (!S.timed) S.moves = Math.max(0, S.moves - 1); }

/* ---------------- Clearing ---------------- */
// kill: gem id -> delay. Specials hit by the blast go off in turn, each once.
let K = null;
function killCell(r, c, d) {
  const g = at(r, c);
  if (!g || g.dying) return;
  if (K.map[g.id] != null && K.map[g.id] <= d) return;
  K.map[g.id] = d; K.gems[g.id] = g;
  if (g.sp && !g.fired && !K.keep[g.id]) { g.fired = true; K.fire.push({ g: g, d: d + 0.06 }); }
}
function fireSpecial(g, d) {
  const r = g.r, c = g.c;
  K.specials++;
  if (g.sp === SP_ROW || g.sp === SP_COL) {
    for (let k = 0; k < N; k++) {
      if (g.sp === SP_ROW) killCell(r, k, d + Math.abs(k - c) * 0.035); else killCell(k, c, d + Math.abs(k - r) * 0.035);
    }
    fxBeam(r, c, g.sp === SP_ROW, d, g.t);
    Juke.sfx("line", 0, d);
  } else if (g.sp === SP_BOMB) {
    const big = g.big || 1;
    for (let dr = -big; dr <= big; dr++) for (let dc = -big; dc <= big; dc++) killCell(r + dr, c + dc, d + 0.05 + (Math.abs(dr) + Math.abs(dc)) * 0.03);
    fxRing(r, c, d, 1.4 + big);
    Juke.sfx("bomb", big, d);
    S.bombs++;
    if (window.Trophies) Trophies.unlock("gs-bomb");
    camShake(0.18 * big, 0.3);
  } else if (g.sp === SP_PRISM) {                            // set off by a blast: takes the most common color with it
    const t = commonKind();
    zapKind(g, t, d);
  }
}
function commonKind() {
  const n = [0, 0, 0, 0, 0, 0];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const t = kind(r, c); if (t >= 0) n[t]++; }
  let b = 0;
  for (let i = 1; i < NCOL; i++) if (n[i] > n[b]) b = i;
  return b;
}
function zapKind(src, t, d, turnInto) {
  const hits = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const g = grid[r][c];
    if (g && !g.dying && g !== src && g.t === t && g.sp !== SP_PRISM) hits.push(g);
  }
  hits.forEach(function (g, i) {
    const dd = d + 0.12 + i * 0.025;
    if (turnInto && !g.sp) { g.sp = turnInto === SP_ROW ? (Math.random() < 0.5 ? SP_ROW : SP_COL) : turnInto; if (R) dressGem(g); }
    killCell(g.r, g.c, dd);
  });
  killCell(src.r, src.c, d);
  fxBolts(src, hits, d);
  Juke.sfx("prism", 0, d);
}

function newK() { return { map: {}, gems: {}, fire: [], keep: {}, creates: [], specials: 0, groups: 0, bonus: 0 }; }
function runFires() {
  for (let i = 0; i < K.fire.length; i++) fireSpecial(K.fire[i].g, K.fire[i].d);
}

// Groups found on the board: score them, decide the specials they make, then let everything go off.
function beginClear(groups, swapped) {
  K = newK();
  groups.forEach(function (g) {
    const sp = groupSpecial(g), len = g.cells.length;
    K.bonus += len >= 6 ? 220 : len === 5 ? 150 : len === 4 ? 60 : 20;
    K.groups++;
    let spawn = null;
    if (sp) {
      if (swapped) for (let i = 0; i < swapped.length; i++) {
        const s = swapped[i];
        if (g.cells.some(function (p) { return p[0] === s.r && p[1] === s.c; })) { spawn = [s.r, s.c]; break; }
      }
      if (!spawn) spawn = sp === SP_BOMB && g.cross ? g.cross : longestMid(g);
      K.creates.push({ r: spawn[0], c: spawn[1], t: g.t, sp: sp });
    }
    g.cells.forEach(function (p) { killCell(p[0], p[1], 0); });
  });
  runFires();
  startClearAnim();
}
function longestMid(g) {
  let best = g.runs[0];
  g.runs.forEach(function (r) { if (r.cells.length > best.cells.length) best = r; });
  return best.cells[Math.floor(best.cells.length / 2)];
}

// Swapping a prism, or two specials into each other.
function specialSwap(a, b) {
  K = newK();
  S.combos++;
  if (a.sp && b.sp && window.Trophies) Trophies.unlock("gs-combo");
  const pa = a.sp === SP_PRISM, pb = b.sp === SP_PRISM;
  if (pa && pb) {                                            // two prisms: the whole tray
    a.fired = b.fired = true;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) killCell(r, c, 0.1 + (Math.abs(r - b.r) + Math.abs(c - b.c)) * 0.04);
    fxRing(b.r, b.c, 0, 9); fxBolts(b, allGems(), 0);
    Juke.sfx("prism", 1); Juke.sfx("bomb", 3, 0.2);
    camShake(0.5, 0.6);
    if (window.Trophies) Trophies.unlock("gs-wipe");
    ledShow("wipe", "CLEAN SWEEP!");
  } else if (pa || pb) {
    const p = pa ? a : b, o = pa ? b : a;
    p.fired = true;
    if (o.sp) { o.fired = true; zapKind(p, o.t, 0, o.sp === SP_COL ? SP_ROW : o.sp); killCell(o.r, o.c, 0.05); }
    else zapKind(p, o.t, 0);
    ledShow("special", "PRISM!");
  } else {
    a.fired = b.fired = true;
    const line = function (g) { return g.sp === SP_ROW || g.sp === SP_COL; };
    const r = b.r, c = b.c;
    if (line(a) && line(b)) {                                // a cross
      K.specials += 2;
      for (let k = 0; k < N; k++) { killCell(r, k, Math.abs(k - c) * 0.035); killCell(k, c, Math.abs(k - r) * 0.035); }
      fxBeam(r, c, true, 0, a.t); fxBeam(r, c, false, 0, b.t);
      Juke.sfx("line", 1);
    } else if (a.sp === SP_BOMB && b.sp === SP_BOMB) {       // a 5 x 5 blast
      b.big = 2; a.fired = true; b.fired = false;
      killCell(a.r, a.c, 0); killCell(r, c, 0.02);
    } else {                                                 // line + bomb: three rows and three columns
      K.specials += 2;
      for (let o = -1; o <= 1; o++) for (let k = 0; k < N; k++) {
        killCell(r + o, k, 0.05 + Math.abs(k - c) * 0.035); killCell(k, c + o, 0.05 + Math.abs(k - r) * 0.035);
      }
      for (let o = -1; o <= 1; o++) { fxBeam(r + o, c, true, 0.05, a.t); fxBeam(r, c + o, false, 0.05, b.t); }
      fxRing(r, c, 0, 2.5);
      Juke.sfx("line", 1); Juke.sfx("bomb", 1, 0.05);
      camShake(0.3, 0.4);
    }
    ledShow("combo", "COMBO!");
  }
  runFires();
  startClearAnim();
}
function allGems() {
  const out = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c]) out.push(grid[r][c]);
  return out;
}

function startClearAnim() {
  let n = 0, maxD = 0, gems = 0;
  for (const id in K.gems) {
    const g = K.gems[id];
    g.dying = true; g.delay = K.map[id]; g.die = 0;
    maxD = Math.max(maxD, g.delay);
    n++;
    if (g.sp !== SP_PRISM) gems++;
    // goals and money
    if (g.t >= 0 && g.sp !== SP_PRISM) S.goals.forEach(function (gl, i) { if (gl.k === "collect" && gl.t === g.t) S.prog[i]++; });
    if (ore[g.r][g.c] > 0) {
      ore[g.r][g.c]--;
      S.oreHit = (S.oreHit || 0) + 1;
      const m = tier("mine");
      addCoins(m >= 3 ? 3 : m === 2 ? 2 : 0);
      if (R) oreCrack(g.r, g.c, g.delay);
    }
  }
  S.cleared += gems; S.lvGems += gems;
  addCoins(gems / 3);
  const mult = 1 + 0.5 * (S.chain - 1);
  const pts = Math.round((gems * 10 + K.bonus + K.specials * 60) * mult * scoreMult());
  addScore(pts, K);
  // specials made by this clear
  K.creates.forEach(function (cr) {
    S.made++;
    S.goals.forEach(function (gl, i) {
      if (gl.k !== "make") return;
      if (gl.sp === "any" || (gl.sp === "line" && (cr.sp === SP_ROW || cr.sp === SP_COL)) || (gl.sp === "bomb" && cr.sp === SP_BOMB) || (gl.sp === "prism" && cr.sp === SP_PRISM)) S.prog[i]++;
    });
    if (cr.sp === SP_PRISM) { S.prisms++; if (window.Trophies) Trophies.unlock("gs-prism"); }
  });
  if (K.creates.length) {
    const sp = K.creates[K.creates.length - 1].sp;
    ledShow("special", sp === SP_PRISM ? "PRISM GEM!" : sp === SP_BOMB ? "BOMB GEM!" : "LINE GEM!");
    Juke.sfx("made", sp);
  }
  Juke.sfx("match", S.chain);
  if (S.chain >= 2) {
    pops.push({ txt: S.chain + "X CASCADE", col: "#ffe45c", x: W / 2, y: 300, t: 0, big: true });
    if (S.chain >= 3) ledShow("combo", S.chain + "X CASCADE!");
    if (window.NPRewards && (S.chain === 3 || S.chain === 5 || S.chain === 8)) NPRewards.streak(S.chain, S.chain + "X CASCADE!");
  }
  if (S.chain > S.bestChain) S.bestChain = S.chain;
  if (S.chain >= 5 && window.Trophies) Trophies.unlock("gs-chain5");
  S.mode = "clear"; S.modeT = 0; S.clearEnd = maxD + 0.3;
  sparkleClear();
}
function addScore(pts, k) {
  S.score += pts; S.lvScore += pts;
  // a popup over the middle of what was cleared
  let x = 0, z = 0, n = 0;
  for (const id in k.gems) { x += k.gems[id].c; z += k.gems[id].r; n++; }
  if (n) {
    const p = cellToScreen(z / n, x / n, 0.6);
    pops.push({ txt: "+" + commas(pts), col: "#ffffff", x: p.x, y: p.y, t: 0 });
  }
  S.goals.forEach(function (gl, i) { if (gl.k === "score") S.prog[i] = S.lvScore; });
}
function addCoins(n) {
  if (!n) return;
  S.coinFrac += n * coinMult();
  const whole = Math.floor(S.coinFrac);
  if (whole > 0) { S.coinFrac -= whole; S.coins += whole; S.coinsEarned += whole; S.lvCoins += whole; }
}

// The clear animation has played: take the gems away, put the new specials down, let everything fall.
function finishClear() {
  for (const id in K.gems) {
    const g = K.gems[id];
    if (grid[g.r][g.c] === g) grid[g.r][g.c] = null;
    removeGemMesh(g);
  }
  K.creates.forEach(function (cr) {
    const g = newGem(cr.sp === SP_PRISM ? -1 : cr.t, cr.sp, cr.r, cr.c);
    g.born = 1;
    grid[cr.r][cr.c] = g;
    if (R) addGemMesh(g);
  });
  if (R) syncOre();
  K = null;
  collapse();
  S.mode = "fall"; S.modeT = 0;
}

// Gravity runs toward the player (the front of the tray). New gems pour in from the back edge.
function collapse() {
  for (let c = 0; c < N; c++) {
    let w = N - 1;
    for (let r = N - 1; r >= 0; r--) {
      const g = grid[r][c];
      if (g) { if (r !== w) { grid[w][c] = g; grid[r][c] = null; g.r = w; } w--; }
    }
    for (let k = w; k >= 0; k--) {
      const g = newGem(ri(NCOL), 0, k, c);
      g.z = k - (w + 1) - 0.35 - (w - k) * 0.12;
      grid[k][c] = g;
      if (R) addGemMesh(g);
    }
  }
}

function settle() {
  const groups = findGroups();
  if (groups.length) { S.chain++; beginClear(groups, null); return; }
  S.chain = 0;
  if (goalsMet()) { levelWon(); return; }
  if (!S.timed && S.moves <= 0) { levelFailed("OUT OF MOVES"); return; }
  if (S.timed && S.time <= 0) { levelFailed("TIME'S UP"); return; }
  if (!findMove()) { shuffle(); return; }
  S.mode = "play"; S.modeT = 0; S.idle = 0;
}

function goalsMet() {
  for (let i = 0; i < S.goals.length; i++) {
    const g = S.goals[i];
    if (g.k === "ore") { if (oreLeft() > 0) return false; }
    else if (S.prog[i] < g.n) return false;
  }
  return true;
}
function oreLeft() { let n = 0; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) n += ore[r][c]; return n; }
function goalFrac() {
  let f = 0;
  S.goals.forEach(function (g, i) { f += g.k === "ore" ? 1 - oreLeft() / Math.max(1, S.oreTotal) : Math.min(1, S.prog[i] / g.n); });
  return f / S.goals.length;
}

/* ---------------- No moves: shuffle ---------------- */
function shuffle() {
  const list = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const g = grid[r][c]; if (g && !g.sp) list.push([r, c]); }
  for (let tries = 0; tries < 200; tries++) {
    const ts = list.map(function (p) { return grid[p[0]][p[1]].t; });
    for (let i = ts.length - 1; i > 0; i--) { const j = ri(i + 1), x = ts[i]; ts[i] = ts[j]; ts[j] = x; }
    list.forEach(function (p, i) { grid[p[0]][p[1]].t = ts[i]; });
    if (!findGroups().length && findMove()) break;
    if (tries > 150) list.forEach(function (p) { grid[p[0]][p[1]].t = ri(NCOL); });
  }
  list.forEach(function (p) { const g = grid[p[0]][p[1]]; if (R) retypeGem(g); g.shuf = 1; });
  S.mode = "shuffle"; S.modeT = 0;
  Shell.flash("NO MOVES", "Shuffling the tray.", "#3ff0ff", 1000);
  ledShow("shuffle", "SHUFFLE");
  Juke.sfx("shuffle");
}

/* ---------------- Level end ---------------- */
function levelWon() {
  const left = S.timed ? Math.ceil(S.time) : S.moves;
  const bonusPts = Math.round((S.timed ? left * 40 : left * 150) * scoreMult());
  S.score += bonusPts; S.lvScore += bonusPts;
  const res = S.timed ? left / Math.max(1, S.def.time) : left / Math.max(1, S.def.moves);
  S.stars = res >= 0.3 ? 3 : res >= 0.12 ? 2 : 1;
  const before = S.coins;
  addCoins(20 + S.level * 3 + (S.timed ? left : left * 3) + S.stars * 5);
  const v = tier("vault");
  S.interest = v ? Math.min(60 * v, Math.floor(S.coins * 0.1 * v)) : 0;
  S.coins += S.interest; S.coinsEarned += S.interest;
  S.lvCoins = S.coins - before + S.lvCoins;
  S.levelsCleared++;
  S.mode = "won"; S.modeT = 0; S.sel = null; S.hint = null;
  if (window.Trophies) {
    if (S.level === 0) Trophies.unlock("gs-open");
    if (S.level === 9) Trophies.unlock("gs-level10");
  }
  if (window.NPRewards && S.levelsCleared >= 2) NPRewards.streak(S.levelsCleared, S.levelsCleared + " LEVELS CLEARED!");
  Shell.flash("LEVEL CLEAR!", (bonusPts ? "+" + commas(bonusPts) + " for " + left + (S.timed ? " seconds" : " moves") + " left. " : "") + "Off to the shop.", "#9bff3f", 1800);
  ledShow("clear", "LEVEL CLEAR!");
  Juke.sfx("clear");
  keeperDo("cheer");
  fireworks();
}

function levelFailed(why) {
  S.mode = "fail"; S.modeT = 0; S.sel = null; S.hint = null;
  const cost = CONT_COST[Math.min(S.conts, CONT_COST.length - 1)];
  S.fail = { why: why, cost: cost, can: S.conts < CONT_COST.length && S.coins >= cost, pick: 0 };
  if (!S.fail.can) S.fail.pick = 1;
  ledShow("fail", why);
  Juke.sfx("fail");
}
function buyContinue() {
  const f = S.fail;
  if (!f || !f.can) return;
  S.coins -= f.cost; S.conts++;
  if (S.timed) S.time += 20; else S.moves += 5;
  S.fail = null;
  Juke.sfx("buy");
  Shell.flash(S.timed ? "+20 SECONDS" : "+5 MOVES", "Back to work.", "#ffd23f", 900);
  S.mode = "play"; S.idle = 0;
  if (!findMove()) shuffle();
}
function cashOut() {
  if (S.mode === "over") return;
  S.mode = "over"; S.fail = null;
  ledFinal(S.score);
  const built = BUILD.reduce(function (s, b) { return s + tier(b.id); }, 0);
  const row = function (a, b) { return '<div class="np-row"><span>' + a + "</span><b>" + b + "</b></div>"; };
  Shell.gameOver(S.score, { title: "SHOP CLOSED", html:
    row("Levels cleared", S.levelsCleared) +
    row("Reached", "Level " + (S.level + 1) + ": " + S.def.name) +
    row("Gems cleared", commas(S.cleared)) +
    row("Specials made", S.made) +
    row("Longest cascade", S.bestChain ? S.bestChain + "x" : "-") +
    row("Coins earned", commas(S.coinsEarned)) +
    row("Shop upgrades", built + " of 15"),
    stats: { level: S.level + 1, levelsCleared: S.levelsCleared, score: S.score, gems: S.cleared, made: S.made, bombs: S.bombs,
             prisms: S.prisms, combos: S.combos, bestChain: S.bestChain, coins: S.coinsEarned, built: built } });
}

/* ---------------- Shop ---------------- */
function openShop() {
  S.mode = "shop"; S.modeT = 0;
  S.shop = { pick: 0, flash: null };
  camTo("shop");
  ledShow("score", "SCORE", { value: S.score });
}
function buy(i) {
  const b = BUILD[i], t = tier(b.id);
  if (t >= 3) { Juke.sfx("bad"); return; }
  const cost = b.cost[t];
  if (S.coins < cost) { Juke.sfx("bad"); S.shop.flash = { i: i, t: 0 }; return; }
  S.coins -= cost;
  S.build[b.id] = t + 1;
  Juke.sfx("buy");
  ledShow("special", t === 0 ? "NEW " + b.name.replace(/^THE /, "") + "!" : b.name.replace(/^THE /, "") + " UPGRADE!");
  buildUp(b.id, t + 1);
  keeperDo("wave");
  if (window.Trophies) {
    if (b.id === "mine") Trophies.unlock("gs-mine");
    if (BUILD.every(function (x) { return tier(x.id) >= 3; })) Trophies.unlock("gs-tycoon");
  }
}
function nextLevel() {
  S.shop = null;
  startLevel(S.level + 1, false);
}

/* ---------------- LED ribbon board ----------------
   The same kind of board as Tape Pin Lanes: a real dot matrix painted into a tiny canvas, one pixel per LED, and a
   small shader that turns each pixel into a glowing dot. One board stands on the counter behind the tray, and a
   second copy of it runs across the back wall of the shop. It scrolls its programme right to left and cuts to big
   animated messages for cascades, special gems, shuffles, level clears and the score. */
const LED_ROWS = 18, LED_COLS = 160;
const LED_SPEED = 30;                                      // LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["GEMS BOUGHT AND SOLD", "cyan"], ["BE KIND, REWIND", "pink"],
                   ["NO QUARTERS REQUIRED", "lime"]];
const LED_PLUGS = [
  ["TAPE PIN LANES", "BOWLING"],
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
    "*": "00000 00100 01110 11111 01110 00100 00000", "#": "01010 01010 11111 01010 11111 01010 01010"
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
      const row = rows[r];
      for (let c = 0; c < 5; c++) if (row.charCodeAt(c) === 49) g.fillRect(x + c * sx, y + r * sy, sx, sy);
    }
    x += 6 * sx;
  }
  return x;
}
// a little cut gem in dots, for between the items
function ledGem(g, x, y, col) {
  const rows = ["01110", "11111", "11111", "01110", "00100"];
  g.fillStyle = col;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (rows[r][c] === "1") g.fillRect(x + c, y + r, 1, 1);
  g.fillStyle = "#ffffff"; g.fillRect(x + 1, y + 1, 1, 1);
}

function ledStrip(script) {
  const HH = LED_ROWS, big = LED_BIG, yBig = Math.floor((HH - 7 * big) / 2), GAP = 12, items = [];
  // The wordmark at board resolution: cream pushed to full brightness, red kept as a dim rim, navy dropped to dark.
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
    const ns = 1, ts = 1, pad = 6, tab = ledTextW("FREE", ts) + 4;
    const top = Math.max(1, Math.floor((HH - (7 * ts + 3 + 7 * ns)) / 2));
    const w = pad + Math.max(ledTextW(name, ns), tab + 4 + ledTextW(tag, ts));
    items.push({ w: w, draw: function (g, x) {
      g.fillStyle = color; g.fillRect(x, 1, 2, HH - 2);
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
    line(k === 1 ? "GEM SHOP" : LED_LINES[k][0], k === 1 ? LED_C.yellow : LED_C[LED_LINES[k][1]]);
    if (k === 1) line(LED_LINES[1][0], LED_C.cyan);
    for (let j = 0; j < per && n < LED_PLUGS.length; j++, n++) plug(LED_PLUGS[n][0], LED_PLUGS[n][1], tints[n % tints.length]);
  }
  const gemCols = ["#e9f6ff", "#2f7bff", "#ff2448", "#17d46a", "#ffb31a", "#b65cff"];
  let total = 0;
  for (let i = 0; i < items.length; i++) total += items[i].w + GAP * 2 + 5;
  const c = mkCanvas(total, HH), g = c.getContext("2d");
  g.fillStyle = "#000000"; g.fillRect(0, 0, total, HH);
  let x = 0;
  for (let i = 0; i < items.length; i++) {
    items[i].draw(g, x);
    x += items[i].w + GAP;
    ledGem(g, x, Math.floor((HH - 5) / 2), gemCols[i % gemCols.length]);
    x += 5 + GAP;
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
function ledMsg(kind, text, dur, more) {
  const m = { kind: kind, text: text, dur: dur, t: 0, wait: 0 };
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
// The game calls this for every moment worth a cut. Small news never interrupts bigger news already showing.
const LED_RANK = { special: 1, shuffle: 2, combo: 2, fail: 3, wipe: 4, clear: 4, level: 3, score: 1 };
function ledShow(kind, text, more) {
  const L = LED;
  if (!L) return;
  const durs = { special: 2.2, shuffle: 2.4, combo: 2.4, fail: 3.2, wipe: 3.4, clear: 3.4, score: 3.2, level: 3 };
  const m = ledMsg(kind, text, durs[kind] || 2.4, more);
  if (kind === "score") { m.from = Math.min(L.lastScore, m.value); L.lastScore = m.value; }
  if (L.msg && (LED_RANK[L.msg.kind] || 0) > (LED_RANK[kind] || 0) && L.msg.t < L.msg.dur * 0.6) { L.queue.push(m); if (L.queue.length > 3) L.queue.shift(); return; }
  ledPlay([m]);
}
function ledLevel(i, d) {
  if (!LED) return;
  const g = d.goals[0];
  let goal = g.k === "score" ? "SCORE " + commas(g.n) : g.k === "ore" ? "BREAK THE ORE" : g.k === "make" ? "MAKE " + g.n + " " + g.sp.toUpperCase() + (g.n > 1 ? "S" : "")
    : "COLLECT " + g.n + " " + (g.n > 1 ? GEM_PLURAL[g.t] : GEM_NAMES[g.t]);
  if (d.goals.length > 1) goal += " +";
  ledPlay([ledMsg("level", "LEVEL " + (i + 1), 1.8), ledMsg("special", goal, 2.8)]);
}
function ledFinal(score) {
  if (!LED) return;
  ledPlay([ledMsg("score", "FINAL", 6, { from: Math.min(LED.lastScore, score), value: score, final: true, wait: 0.4 })]);
  LED.lastScore = score;
}

function ledDrawMsg(g, m) {
  const W2 = LED_COLS, H2 = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((H2 - 7 * big) / 2), mid = Math.round(W2 / 2);
  const step = calm ? 0 : Math.floor(m.t * 24);
  function fit(str) { let sx = big; while (sx > 1 && ledTextW(str, sx) > W2 - 8) sx--; return sx; }
  function chase(color, dir) {
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < W2; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(W2 - x - 3, H2 - 1, 3, 1); }
  }
  const sx = fit(m.text), w = ledTextW(m.text, sx), x0 = Math.round((W2 - w) / 2), y0 = Math.floor((H2 - 7 * sx) / 2);

  if (m.kind === "combo" || m.kind === "wipe" || m.kind === "clear") {
    const flip = m.kind === "clear" ? LED_C.lime : m.kind === "wipe" ? LED_C.cyan : LED_C.yellow;
    if (!calm && t < 0.6 && Math.floor(t * 12) % 2 === 0) {              // strobe: the whole board flips
      g.fillStyle = flip; g.fillRect(0, 0, W2, H2);
      ledText(g, m.text, x0, y0, sx, sx, "#000000");
      return;
    }
    const span = 6 * sx + 4, ph = calm ? 0 : Math.floor((t * 40) % span);
    for (let k = 0; k < 10; k++) {                                         // chevrons racing outward
      const off = Math.round(w / 2) + 6 + k * span + ph;
      if (off > mid + span) break;
      const col = k % 2 ? LED_C.red : LED_C.orange;
      ledText(g, ">", mid + off, y0, sx, sx, col);
      ledText(g, "<", mid - off - 5 * sx, y0, sx, sx, col);
    }
    const cyc = m.kind === "clear" ? [LED_C.lime, LED_C.white, LED_C.yellow] : [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0, y0, sx, sx, calm ? cyc[0] : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 14; i++) g.fillRect((Math.random() * W2) | 0, (Math.random() * H2) | 0, 1, 1); }
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "special" || m.kind === "level") {                     // slides in, then a white glint sweeps across
    const col = m.kind === "level" ? LED_C.yellow : LED_C.cyan;
    const k = calm ? 1 : Math.min(1, t / 0.4), e = 1 - Math.pow(1 - k, 3);
    const x = Math.round(x0 + (1 - e) * W2);
    ledText(g, m.text, x, y0, sx, sx, col);
    if (!calm && k >= 1) {
      const bx = Math.floor(((t - 0.4) * 130) % (W2 + 60)) - 30;
      g.save(); g.beginPath(); g.rect(bx, 0, 10, H2); g.clip();
      ledText(g, m.text, x, y0, sx, sx, "#ffffff");
      g.restore();
    }
    chase(col, -1);
    return;
  }
  if (m.kind === "shuffle") {                                            // the letters hop around
    let x = x0;
    for (let i = 0; i < m.text.length; i++) {
      const dy = calm ? 0 : Math.round(Math.sin(t * 9 + i * 1.3) * 2);
      x = ledText(g, m.text[i], x, y0 + dy, sx, sx, [LED_C.violet, LED_C.cyan, LED_C.pink][i % 3]);
    }
    chase(LED_C.violet, 1);
    return;
  }
  if (m.kind === "fail") {                                               // blinks
    if (calm || t > 1.2 || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, y0, sx, sx, LED_C.pink);
    g.fillStyle = LED_C.red; g.fillRect(0, H2 - 1, W2, 1);
    return;
  }
  // score: counts up to the new total
  const k = calm ? 1 : Math.min(1, t / 0.7), v = Math.round(m.from + (m.value - m.from) * k);
  const label = m.text + " ", val = commas(v), full = ledTextW(label + commas(m.value), big);
  const s2 = full > W2 - 8 ? 1 : big, x = Math.round((W2 - ledTextW(label + commas(m.value), s2)) / 2), yy = Math.floor((H2 - 7 * s2) / 2);
  const xn = ledText(g, label, x, yy, s2, s2, LED_C.amber);
  const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
  ledText(g, val, xn, yy, s2, s2, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
  chase(LED_C.amber, 1);
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
    if (L.msg.t >= L.msg.dur) { L.msg = L.queue.shift() || null; if (L.msg) L.msg.t = 0; L.frame = -1; redraw = true; }
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

/* ---------------- Music ----------------
   An original looping synth tune for the shop, written for this game: sixteen bars in A minor at 118 BPM, a bell
   lead with an echo, a bouncing saw bass, a sparkly sixteenth-note arpeggio and a drum kit, all made with Web Audio.
   startMusic stands entirely on its own: hand it an AudioContext and a node to play into and it plays the loop
   until the function it returns is called. It knows nothing about the game. */
function startMusic(ctx, dest) {
  const BPM = 118, STEP = 60 / BPM / 4, BARS = 16, STEPS = BARS * 16, AHEAD = 0.35;
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  // one chord a bar: bass note, then the three chord tones the arpeggio walks
  const CH = { Am: [45, 57, 60, 64], F: [41, 57, 60, 65], C: [48, 55, 60, 64], G: [43, 55, 59, 62], Dm: [38, 57, 62, 65], E: [40, 56, 59, 64] };
  const PROG = "Am Am F F C C G G Am Am F F Dm E Am Am".split(" ");
  // the tune, a bar a line: step in the bar, note, length in steps
  const BARS_SRC = [
    "0A4-2 2C5-2 4E5-2 6A5-4 10G5-2 12E5-4",
    "0D5-2 2E5-2 4C5-4 8A4-4 12B4-2 14C5-2",
    "0F5-3 3E5-1 4C5-2 6A4-2 8C5-2 10F5-2 12A5-4",
    "0G5-2 2F5-2 4E5-2 6D5-2 8C5-4 12E5-4",
    "0E5-2 2G5-2 4C6-4 8B5-2 10G5-2 12E5-4",
    "0D5-2 2E5-2 4G5-6 10E5-2 12C5-4",
    "0B4-2 2D5-2 4G5-2 6B5-2 8A5-3 11G5-1 12D5-4",
    "0G5-4 4F5-2 6E5-2 8D5-4 12B4-4",
    "0A5-3 3G5-1 4E5-2 6A5-2 8C6-4 12B5-2 14A5-2",
    "0G5-2 2E5-2 4D5-2 6E5-2 8A4-6 14C5-2",
    "0F5-2 2A5-2 4C6-3 7A5-1 8G5-2 10F5-2 12E5-4",
    "0F5-2 2E5-2 4D5-2 6C5-2 8D5-4 12A4-4",
    "0D5-2 2F5-2 4A5-4 8G5-2 10F5-2 12D5-4",
    "0E5-2 2G#5-2 4B5-4 8D6-2 10B5-2 12G#5-4",
    "0A5-4 4E5-2 6C5-2 8B4-2 10C5-2 12E5-4",
    "0A4-4 4C5-2 6E5-2 8A5-6 14E5-2"
  ];
  const LEAD = new Array(STEPS).fill(null);
  BARS_SRC.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(#?)(\d)-(\d+)$/.exec(tok);
      if (m) LEAD[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + SEMI[m[2]] + (m[3] ? 1 : 0), Number(m[5])];
    });
  });

  // the rig: everything between the instruments and dest
  const master = ctx.createGain(); master.gain.value = 0; master.connect(dest);
  master.gain.setTargetAtTime(1, ctx.currentTime + 0.05, 0.08);
  function filt(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const leadBus = filt("lowpass", 4200, 0.7, master), bassBus = filt("lowpass", 760, 1.3, master), arpBus = filt("highpass", 900, 0.7, master);
  const send = ctx.createGain(), echo = ctx.createDelay(1), back = ctx.createGain(), damp = filt("lowpass", 2600, 0.7, master);
  send.gain.value = 0.28; echo.delayTime.value = STEP * 3; back.gain.value = 0.3;
  leadBus.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(damp);
  const len = Math.floor(ctx.sampleRate * 1.5), noise = ctx.createBuffer(1, len, ctx.sampleRate), nd = noise.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; nd[i] = seed / 1073741823.5 - 1; }

  function osc(to, type, f0, t, dur, vol, f1, hold) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.5 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(to, t, dur, vol, type, f, q) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(to); s.start(t, (t * 3.7) % 1); s.stop(t + dur + 0.05);
  }
  function play(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[bar]], b2 = bar >= 8, n = LEAD[i];
    if (n) {                                               // the bell lead: a triangle with a sine an octave and a fifth up
      const f = mtof(n[0]), d = n[1] * STEP * 0.95;
      osc(leadBus, "triangle", f, t, d, 0.22, 0, 0.35);
      osc(leadBus, "sine", f * 3, t, Math.min(d, 0.35), 0.05, 0, 0.1);
    }
    // sparkle arpeggio: chord tones up two octaves, every sixteenth, quiet
    osc(arpBus, "square", mtof(ch[1 + [0, 1, 2, 1][s & 3]] + 12 + (s >= 8 && b2 ? 12 : 0)), t, STEP * 0.9, 0.035, 0, 0.2);
    if (!(s & 1)) {                                        // eighth-note bass, octave bounce
      const k = s >> 1;
      osc(bassBus, "sawtooth", mtof(ch[0] - 12 + (k & 1 ? 12 : 0) + (k === 7 ? 7 : 0)), t, STEP * 1.7, 0.26);
      hiss(master, t, s % 4 === 2 ? 0.09 : 0.035, s % 4 === 2 ? 0.08 : 0.045, "highpass", 7500);
    }
    if (b2 ? s % 4 === 0 : s === 0 || s === 6 || s === 8) osc(master, "sine", 140, t, 0.17, 0.6, 40, 0.08);   // kick
    const fill = (bar === 7 || bar === 15) && s >= 12;
    if (s === 4 || s === 12 || fill) {                     // snare
      const v = fill ? 0.55 + 0.1 * (s - 12) : 1;
      hiss(master, t, 0.14, 0.26 * v, "bandpass", 2100, 0.6);
      osc(master, "triangle", 210, t, 0.07, 0.16 * v, 140, 0.1);
    }
    if (s === 0 && bar % 2 === 0) {                        // a glass chime every other bar
      osc(master, "sine", mtof(ch[3] + 24), t, 1.2, 0.05, 0, 0.02);
      osc(master, "sine", mtof(ch[3] + 31), t + 0.02, 0.9, 0.03, 0, 0.02);
    }
  }

  let step = 0, nextT = ctx.currentTime + 0.08, live = true;
  function pump() {
    if (!live) return;
    const now = ctx.currentTime;
    if (nextT < now) nextT = now + 0.02;                   // after a long stall, pick up on the beat from here
    while (nextT < now + AHEAD) { play(step, nextT); step = (step + 1) % STEPS; nextT += STEP; }
  }
  pump();
  const timer = setInterval(pump, 40);
  return function stop() {
    if (!live) return;
    live = false;
    clearInterval(timer);
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(0, now, 0.05);
    setTimeout(function () { try { master.disconnect(); } catch (e) { /* already gone */ } }, 600);
  };
}

/* ---------------- Sound effects and the jukebox ----------------
   Nothing is created until the first tap, click or key press. Mute follows the shell's own mute button (the same
   "npArcade.muted" setting the whole arcade shares). The music switch is remembered in "npArcade.music". */
const MUSIC_KEY = "npArcade.music", MUSIC_VOL = 0.16, SFX_VOL = 0.22;
const Juke = (function () {
  let ctx = null, dead = false, out = null, mbus = null, sbus = null, stop = null, muted = false, timer = 0;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  let lastLand = 0, noise = null;
  const buttons = [];

  function shellMuted() {
    const b = document.getElementById("np-mute");
    if (b) return b.getAttribute("aria-pressed") === "true";
    try { return localStorage.getItem("npArcade.muted") === "1"; } catch (e) { return false; }
  }
  function unlock() {
    if (dead) return;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        ctx = new AC();
        out = ctx.createGain();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
        out.connect(comp); comp.connect(ctx.destination);
        mbus = ctx.createGain(); mbus.gain.value = MUSIC_VOL; mbus.connect(out);
        sbus = ctx.createGain(); sbus.gain.value = SFX_VOL; sbus.connect(out);
        const len = Math.floor(ctx.sampleRate);
        noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        muted = shellMuted();
        out.gain.value = muted ? 0 : 1;
        if (!timer) timer = setInterval(pump, 150);
      }
      if (ctx.state !== "running") { const p = ctx.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { ctx = null; dead = true; }
  }
  // Every frame: follow the mute button, and keep the music playing only while a game is on.
  function pump() {
    if (!ctx || !window.Shell) return;
    const m = shellMuted();
    if (m !== muted) { muted = m; out.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02); }
    const want = musicOn && !muted && ctx.state === "running" && Shell.state() === "playing";
    if (want && !stop) stop = startMusic(ctx, mbus);
    else if (!want && stop) { stop(); stop = null; }
  }
  function osc(type, f0, t, dur, vol, f1, hold) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.006, dur * (hold == null ? 0.4 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sbus); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(t, dur, vol, type, f0, q, f1) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true; fl.type = type; fl.frequency.setValueAtTime(f0, t); fl.Q.value = q || 0.7;
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(sbus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  function cue(name, x, t) {
    if (name === "swap") { osc("triangle", 520, t, 0.08, 0.22, 780); hiss(t, 0.09, 0.12, "bandpass", 2400, 1.4, 4200); }
    else if (name === "bad") { osc("square", 180, t, 0.09, 0.16, 150); osc("square", 150, t + 0.1, 0.12, 0.16, 120); }
    else if (name === "match") {                           // glass chimes, climbing with the cascade
      const k = Math.min(PENTA.length - 3, (x || 1) - 1), base = 76;
      osc("sine", mtof(base + PENTA[k]), t, 0.5, 0.32, 0, 0.05);
      osc("sine", mtof(base + PENTA[k + 2]), t + 0.05, 0.45, 0.24, 0, 0.05);
      osc("triangle", mtof(base + 12 + PENTA[k + 1]), t + 0.09, 0.35, 0.12, 0, 0.05);
      hiss(t, 0.05, 0.18, "highpass", 6000, 0.7);
    } else if (name === "made") {
      const up = x === SP_PRISM ? [72, 76, 79, 84, 88, 91] : x === SP_BOMB ? [60, 67, 72, 79] : [67, 74, 79];
      up.forEach(function (m, i) { osc("square", mtof(m), t + i * 0.05, 0.09, 0.14, 0, 0.5); });
    } else if (name === "line") { osc("sawtooth", 1800, t, 0.32, 0.18, 220, 0.2); hiss(t, 0.3, 0.3, "bandpass", 3000, 1.2, 600); }
    else if (name === "bomb") {
      const big = x || 1;
      osc("sine", 110, t, 0.5 + big * 0.15, 0.9, 32, 0.05);
      hiss(t, 0.5 + big * 0.2, 0.7, "lowpass", 1400, 0.7, 120);
    } else if (name === "prism") {
      for (let i = 0; i < 10; i++) osc("sine", mtof(84 + PENTA[i % PENTA.length]), t + i * 0.035, 0.3, 0.12, 0, 0.1);
      osc("sawtooth", 300, t, 0.6, 0.1, 2400, 0.4);
    } else if (name === "land") { osc("triangle", 1400 + Math.random() * 500, t, 0.04, 0.08, 0, 0.2); }
    else if (name === "shuffle") { for (let i = 0; i < 12; i++) { hiss(t + i * 0.045, 0.03, 0.22, "bandpass", 2000 + Math.random() * 3000, 3); osc("triangle", 900 + Math.random() * 900, t + i * 0.045, 0.03, 0.06); } }
    else if (name === "clear") {
      const up = [72, 76, 79, 84, 79, 84, 88, 91];
      up.forEach(function (m, i) { osc("square", mtof(m), t + i * 0.08, 0.12, 0.2, 0, 0.6); });
      [84, 88, 91, 96].forEach(function (m) { osc("triangle", mtof(m), t + 0.66, 0.9, 0.16, 0, 0.3); });
    } else if (name === "fail") { [67, 64, 60, 55].forEach(function (m, i) { osc("triangle", mtof(m), t + i * 0.14, 0.2, 0.26, 0, 0.6); }); }
    else if (name === "buy") {                             // cash register: drawer slam and a bell
      hiss(t, 0.08, 0.5, "bandpass", 900, 0.8);
      osc("square", 90, t, 0.08, 0.3, 60, 0.2);
      osc("sine", 2093, t + 0.08, 0.7, 0.3, 0, 0.03); osc("sine", 2637, t + 0.1, 0.6, 0.2, 0, 0.03);
    } else if (name === "bell") { [1, 2.52, 4.1].forEach(function (k, i) { osc("sine", 1320 * k, t, 1.2 - i * 0.3, 0.3 / (i + 1), 0, 0.02); }); }
    else if (name === "tick") { osc("square", 1000, t, 0.04, 0.14, 0, 0.3); }
    else if (name === "select") { osc("triangle", 980, t, 0.05, 0.14, 1250, 0.3); }
    else if (name === "level") { [64, 67, 72].forEach(function (m, i) { osc("triangle", mtof(m), t + i * 0.09, 0.2, 0.22, 0, 0.5); }); }
  }
  function sfx(name, x, delay) {
    if (!ctx || muted || ctx.state !== "running") return;
    if (name === "land") { const n = performance.now(); if (n - lastLand < 70) return; lastLand = n; }
    try { cue(name, x, ctx.currentTime + 0.01 + (delay || 0)); } catch (e) { /* sound is never worth a crash */ }
  }
  function label() {
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      if (b.dataset.icon) { b.innerHTML = musicOn ? ICON_NOTE : ICON_NOTE_OFF; b.setAttribute("aria-label", musicOn ? "Turn music off" : "Turn music on"); }
      else b.textContent = musicOn ? "MUSIC: ON" : "MUSIC: OFF";
      b.setAttribute("aria-pressed", musicOn ? "true" : "false");
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
  // a note icon in the top bar, next to the shell's mute button
  function barButton() {
    const mute = document.getElementById("np-mute");
    if (!mute || !mute.parentNode) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-icon"; b.id = "gs-music"; b.dataset.icon = "1";
    b.addEventListener("click", function (e) {
      e.stopPropagation(); unlock(); setMusic(!musicOn);
      if (e.detail > 0 && Shell.state() === "playing") { const cv = document.getElementById("np-canvas"); if (cv) try { cv.focus({ preventScroll: true }); } catch (er) { /* ignore */ } }
    });
    mute.parentNode.insertBefore(b, mute);
    buttons.push(b); label();
  }
  return {
    unlock: unlock, pump: pump, sfx: sfx, button: button, barButton: barButton,
    newGame: function () { unlock(); if (stop) { stop(); stop = null; } pump(); },
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    peek: function () { return { made: !!ctx, state: ctx ? ctx.state : "none", playing: !!stop, muted: muted, musicOn: musicOn }; }
  };
})();
const ICON_NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 4l11-2v13.5a3 3 0 1 1-2-2.8V6.3L11 7.6v10.9a3 3 0 1 1-2-2.8z"/></svg>';
const ICON_NOTE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" opacity=".45" d="M9 4l11-2v13.5a3 3 0 1 1-2-2.8V6.3L11 7.6v10.9a3 3 0 1 1-2-2.8z"/><path fill="none" stroke="currentColor" stroke-width="2.4" d="M3 3l18 18"/></svg>';

/* =====================================================================================
   3D presentation
   World units: one gem cell is one unit (about 5 cm). The tray sits on the jewelry counter at the origin, the
   counter top is just under y = 0, and the shop floor is 20 units (a meter) below it. The jeweler is 35 units
   tall, a 175 cm man, built to those proportions.
   ===================================================================================== */
const GEM_Y = 0.3, ORE_LIFT = 0.16, FLOOR_Y = -20, TOP_Y = -0.36;
const BOARD_PITCH = 57 * Math.PI / 180, BOARD_FOV = 30;
const SHOP_CAM = { pos: [0, 95, 125], tgt: [0, 2, -70], fov: 78, off: 108 };
const QUALITY = [{ pr: 2, sh: 2048 }, { pr: 1.5, sh: 1024 }, { pr: 1.15, sh: 1024 }, { pr: 1, sh: 0 }];

function rng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Many copies of one mesh in one draw call. Each entry: [x, y, z, rx, ry, rz, sx, sy, sz] (scale may be one number).
function inst(T, par, geo, mat, list) {
  const im = new T.InstancedMesh(geo, mat, list.length), mt = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), p = new T.Vector3(), sc = new T.Vector3();
  list.forEach(function (a, i) {
    p.set(a[0], a[1], a[2]); e.set(a[3] || 0, a[4] || 0, a[5] || 0); q.setFromEuler(e);
    if (a.length > 7) sc.set(a[6], a[7], a[8]); else sc.setScalar(a[6] == null ? 1 : a[6]);
    im.setMatrixAt(i, mt.compose(p, q, sc));
  });
  im.instanceMatrix.needsUpdate = true;
  par.add(im);
  return im;
}
function put(par, m) { par.add(m); return m; }      // Object3D.add returns the parent, this returns the child
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
// The script wordmark trimmed to its ink. Plain lettering stands in if the PNG is missing.
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
function candyText(g, str, x, y, size, maxW, top, bot) {
  const face = '"Arial Black", "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
  g.font = "900 " + size + "px " + face;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + face; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = size * 0.36; g.strokeStyle = "#2a0838"; g.strokeText(str, x, y + size * 0.06);
  g.lineWidth = size * 0.17; g.strokeStyle = "#ffffff"; g.strokeText(str, x, y);
  const gr = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  gr.addColorStop(0, top || "#fff06a"); gr.addColorStop(0.55, "#ffc21a"); gr.addColorStop(1, bot || "#ff7a0f");
  g.fillStyle = gr; g.fillText(str, x, y);
  g.fillStyle = "rgba(255,255,255,.45)";
  g.save(); g.beginPath(); g.rect(x - 900, y - size * 0.5, 1800, size * 0.36); g.clip(); g.fillText(str, x, y); g.restore();
}

/* ---------------- Painted textures ---------------- */
// The tray: an 8 x 8 velvet checker with gold piping, one texel block a cell.
function trayCanvas() {
  const S2 = 512, c = mkCanvas(S2, S2), g = c.getContext("2d"), rnd = rng(5), k = S2 / N;
  for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) {
    const gr = g.createRadialGradient(q * k + k / 2, r * k + k / 2, 4, q * k + k / 2, r * k + k / 2, k * 0.75);
    if ((r + q) % 2) { gr.addColorStop(0, "#3b1f6e"); gr.addColorStop(1, "#22104a"); }
    else { gr.addColorStop(0, "#2a2f86"); gr.addColorStop(1, "#171a58"); }
    g.fillStyle = gr; g.fillRect(q * k, r * k, k, k);
  }
  for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.08)"; g.fillRect(rnd() * S2, rnd() * S2, 1, 2); }
  g.strokeStyle = "rgba(255,200,80,.45)"; g.lineWidth = 2;
  for (let i = 1; i < N; i++) { g.beginPath(); g.moveTo(i * k, 0); g.lineTo(i * k, S2); g.stroke(); g.beginPath(); g.moveTo(0, i * k); g.lineTo(S2, i * k); g.stroke(); }
  return c;
}
function rockCanvas(hp) {
  const c = mkCanvas(128, 128), g = c.getContext("2d"), rnd = rng(hp * 13);
  g.fillStyle = hp === 2 ? "#6e5a4a" : "#b09276"; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 128, y = rnd() * 128, r = 4 + rnd() * 14;
    g.fillStyle = "rgba(" + (rnd() < 0.5 ? "255,230,200," : "20,10,0,") + (0.05 + rnd() * 0.12) + ")";
    g.beginPath(); g.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, TAU); g.fill();
  }
  for (let i = 0; i < 22; i++) { g.fillStyle = "rgba(255,214,90," + (0.4 + rnd() * 0.5) + ")"; g.fillRect(rnd() * 128, rnd() * 128, 2, 2); }
  if (hp === 1) {                                          // cracked through
    g.strokeStyle = "rgba(25,12,4,.85)"; g.lineWidth = 3; g.lineJoin = "round";
    [[64, 64, 6], [64, 64, 5]].forEach(function (s, j) {
      for (let a = 0; a < s[2]; a++) {
        let x = s[0], y = s[1], ang = a / s[2] * TAU + j;
        g.beginPath(); g.moveTo(x, y);
        for (let k2 = 0; k2 < 4; k2++) { ang += (rnd() - 0.5) * 0.9; x += Math.cos(ang) * 16; y += Math.sin(ang) * 16; g.lineTo(x, y); }
        g.stroke();
      }
    });
  }
  g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,.35)"; g.strokeRect(3, 3, 122, 122);
  return c;
}
function velvetCanvas(col) {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(17);
  g.fillStyle = col; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.1)"; g.fillRect(rnd() * 256, rnd() * 256, 1, 2); }
  return c;
}
function woodCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(11), n = 4, bw = 256 / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = "hsl(" + (18 + rnd() * 6) + "," + (55 + rnd() * 10) + "%," + (30 + rnd() * 6) + "%)";
    g.fillRect(Math.floor(i * bw), 0, Math.ceil(bw) + 1, 256);
    for (let k = 0; k < 16; k++) { g.fillStyle = "rgba(40,14,4," + (0.06 + rnd() * 0.1) + ")"; g.fillRect(i * bw + rnd() * bw, 0, 1 + rnd() * 1.5, 256); }
    for (let k = 0; k < 3; k++) { g.fillStyle = "rgba(255,200,150," + (0.06 + rnd() * 0.08) + ")"; g.fillRect(i * bw + rnd() * bw, 0, 2, 256); }
  }
  for (let i = 0; i < n; i++) { g.fillStyle = "rgba(30,10,2,.5)"; g.fillRect(Math.round(i * bw), 0, 1, 256); }
  return c;
}
// Polished checker floor
function floorCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(3);
  for (let r = 0; r < 2; r++) for (let q = 0; q < 2; q++) { g.fillStyle = (r + q) % 2 ? "#5a1235" : "#f3e4c6"; g.fillRect(q * 128, r * 128, 128, 128); }
  for (let i = 0; i < 2500; i++) { g.fillStyle = "rgba(0,0,0," + (rnd() * 0.05) + ")"; g.fillRect(rnd() * 256, rnd() * 256, 2, 2); }
  g.strokeStyle = "rgba(255,210,120,.5)"; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256); g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  return c;
}
// Teal wallpaper with gold diamonds.
function wallCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, "#0d5e6e"); bg.addColorStop(1, "#0a4a5a");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(255,206,90,.55)"; g.lineWidth = 3;
  for (let i = -1; i < 3; i++) {
    g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128 + 256, 256); g.stroke();
    g.beginPath(); g.moveTo(i * 128 + 256, 0); g.lineTo(i * 128, 256); g.stroke();
  }
  g.fillStyle = "rgba(255,230,140,.75)";
  [[64, 0], [192, 0], [0, 128], [128, 128], [256, 128], [64, 256], [192, 256]].forEach(function (p) {
    g.beginPath(); g.moveTo(p[0], p[1] - 10); g.lineTo(p[0] + 7, p[1]); g.lineTo(p[0], p[1] + 10); g.lineTo(p[0] - 7, p[1]); g.closePath(); g.fill();
  });
  return c;
}
// Plaques, signs and the cart side: the script wordmark on a colored panel.
function plaqueCanvas(script, w, h, bg1, bg2, rim, words) {
  const c = mkCanvas(w, h), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, bg1); bg.addColorStop(1, bg2);
  rrectPath(g, 2, 2, w - 4, h - 4, h * 0.12); g.fillStyle = bg; g.fill();
  g.lineWidth = Math.max(4, h * 0.05); g.strokeStyle = rim; g.stroke();
  const gl = g.createLinearGradient(0, 0, 0, h * 0.5);
  gl.addColorStop(0, "rgba(255,255,255,.35)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.fillRect(6, 6, w - 12, h * 0.45);
  if (words) {
    drawScript(g, script, w * 0.34, h / 2, w * 0.56, h * 0.8);
    candyText(g, words, w * 0.79, h / 2, h * 0.36, w * 0.36);
  } else drawScript(g, script, w / 2, h / 2, w * 0.88, h * 0.8);
  return c;
}
// The cardboard sign the shop starts with.
function cardboardCanvas() {
  const c = mkCanvas(512, 160), g = c.getContext("2d"), rnd = rng(2);
  g.fillStyle = "#c79a5c"; g.fillRect(0, 0, 512, 160);
  for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(90,60,20,.12)"; g.fillRect(0, rnd() * 160, 512, 1); }
  g.fillStyle = "#1b1b1b"; g.font = "bold 76px 'Comic Sans MS', 'Trebuchet MS', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.save(); g.translate(256, 70); g.rotate(-0.04); g.fillText("GEM SHOP", 0, 0); g.restore();
  g.font = "bold 22px 'Trebuchet MS', sans-serif"; g.fillStyle = "#7a1010"; g.fillText("(open-ish)", 256, 134);
  g.fillStyle = "rgba(220,220,190,.8)"; g.fillRect(14, 8, 46, 18); g.fillRect(452, 6, 46, 18);
  return c;
}
// The wooden sign: wordmark and the shop name, carved and painted.
function signCanvas(script, lit) {
  const c = mkCanvas(1024, 256), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 256);
  if (lit) { bg.addColorStop(0, "#3a0f5a"); bg.addColorStop(1, "#16052a"); } else { bg.addColorStop(0, "#6b3a1c"); bg.addColorStop(1, "#40200c"); }
  rrectPath(g, 4, 4, 1016, 248, 30); g.fillStyle = bg; g.fill();
  g.lineWidth = 12; g.strokeStyle = lit ? "#ff4fc0" : "#e0a640"; g.stroke();
  g.lineWidth = 3; g.strokeStyle = lit ? "#3fe0ff" : "#ffe7a0"; rrectPath(g, 18, 18, 988, 220, 22); g.stroke();
  drawScript(g, script, 300, 128, 470, 200);
  candyText(g, "GEM SHOP", 740, 128, 112, 460, lit ? "#ffffff" : null, lit ? "#ff4fc0" : null);
  return c;
}
function glowCanvas(soft) {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 31);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(soft ? 0.25 : 0.12, "rgba(255,255,255,.7)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function starCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 12);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.fillStyle = "rgba(255,255,255,.9)";
  g.beginPath(); g.moveTo(32, 0); g.lineTo(35, 29); g.lineTo(64, 32); g.lineTo(35, 35); g.lineTo(32, 64); g.lineTo(29, 35); g.lineTo(0, 32); g.lineTo(29, 29); g.closePath(); g.fill();
  return c;
}
function frameCanvas(col) {                               // a glowing rounded square: selection, cursor, hint
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.shadowColor = col; g.shadowBlur = 16; g.lineWidth = 9; g.strokeStyle = col;
  rrectPath(g, 14, 14, 100, 100, 18); g.stroke();
  g.shadowBlur = 0; g.lineWidth = 3; g.strokeStyle = "#ffffff"; g.stroke();
  return c;
}
function shadowBlob() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(10,0,20,.75)"); gr.addColorStop(0.55, "rgba(10,0,20,.35)"); gr.addColorStop(1, "rgba(10,0,20,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
// A small painted room for the sparkle in the gems: dark, with bright windows and colored strips.
function envFaces() {
  const face = function (seed) {
    const c = mkCanvas(64, 64), g = c.getContext("2d"), rnd = rng(seed);
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#5a6a90"); gr.addColorStop(0.5, "#141a2c"); gr.addColorStop(1, "#2a1238");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? "#ffffff" : "#fff2d0"; g.fillRect(rnd() * 56, rnd() * 40, 3 + rnd() * 8, 6 + rnd() * 14); }
    g.fillStyle = ["#ff4fc0", "#3fe0ff", "#ffd23f"][seed % 3]; g.fillRect(0, 44 + rnd() * 8, 64, 2);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#30385a"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(10, 8, 12, 48); tg.fillRect(42, 8, 12, 48);
  const bot = mkCanvas(64, 64), bg = bot.getContext("2d");
  bg.fillStyle = "#1a0e2a"; bg.fillRect(0, 0, 64, 64);
  return [face(1), face(2), top, bot, face(4), face(5)];
}

/* ---------------- Geometry helpers ---------------- */
function roundBox(T, w, h, d, r) {
  const s = 4, half = 0.5 / s;
  r = Math.min(r, w / 2, h / 2, d / 2);
  const g = new T.BoxGeometry(1, 1, 1, s, s, s);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    let nx = px - Math.sign(px) * half, ny = py - Math.sign(py) * half, nz = pz - Math.sign(pz) * half;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    pos.setXYZ(i, bx * Math.sign(px) + nx * r, by * Math.sign(py) + ny * r, bz * Math.sign(pz) + nz * r);
    nor.setXYZ(i, nx, ny, nz);
  }
  pos.needsUpdate = nor.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}
// A lathe from [y, radius] pairs (top to bottom or bottom to top), closed at both ends.
function latheGeo(T, prof, segs, zs) {
  const pts = [];
  pts.push(new T.Vector2(0.0001, prof[0][0]));
  for (let i = 0; i < prof.length; i++) pts.push(new T.Vector2(Math.max(0.0001, prof[i][1]), prof[i][0]));
  pts.push(new T.Vector2(0.0001, prof[prof.length - 1][0]));
  if (pts[0].y > pts[pts.length - 1].y) pts.reverse();
  const g = new T.LatheGeometry(pts, segs || 18);
  if (zs) g.scale(1, 1, zs);
  g.computeVertexNormals();
  return g;
}

/* ---------------- Gem cuts ---------------- */
// Six cuts, one per kind, each about 0.84 across, table up: round brilliant, oval, heart, emerald cut, trillion, princess.
function gemGeos(T) {
  function brilliant(n, girdle, table, crown, pav, phi) {
    const pts = [new T.Vector2(0.0001, -pav), new T.Vector2(girdle, 0), new T.Vector2(girdle, 0.05), new T.Vector2(table, crown), new T.Vector2(0.0001, crown)];
    return new T.LatheGeometry(pts, n, phi || 0);
  }
  function cut(shape, depth, bev) {
    const g = new T.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 2, curveSegments: 5, steps: 1 });
    g.center(); g.rotateX(-Math.PI / 2);
    return g;
  }
  const out = [];
  out.push(brilliant(16, 0.43, 0.25, 0.17, 0.27));                         // diamond: round brilliant
  const ov = brilliant(12, 0.42, 0.24, 0.15, 0.25); ov.scale(1.1, 1, 0.8); out.push(ov);   // sapphire: oval
  const heart = new T.Shape(), hs = 0.5;
  heart.moveTo(0, -0.42 * hs * 2);
  heart.bezierCurveTo(-0.15, -0.6, -0.86, -0.22, -0.82, 0.12);
  heart.bezierCurveTo(-0.78, 0.46, -0.3, 0.6, 0, 0.3);
  heart.bezierCurveTo(0.3, 0.6, 0.78, 0.46, 0.82, 0.12);
  heart.bezierCurveTo(0.86, -0.22, 0.15, -0.6, 0, -0.42 * hs * 2);
  const hg = cut(heart, 0.16, 0.14); hg.scale(0.5, 1, 0.5); hg.scale(1.0, 1.25, 1.0); out.push(hg);  // ruby: heart
  const oc = new T.Shape(), ex = 0.36, ez = 0.29, cc = 0.11;
  oc.moveTo(-ex + cc, -ez); oc.lineTo(ex - cc, -ez); oc.lineTo(ex, -ez + cc); oc.lineTo(ex, ez - cc); oc.lineTo(ex - cc, ez);
  oc.lineTo(-ex + cc, ez); oc.lineTo(-ex, ez - cc); oc.lineTo(-ex, -ez + cc); oc.closePath();
  out.push(cut(oc, 0.18, 0.12));                                           // emerald: step cut
  const tr = new T.Shape(), R0 = 0.44, cut0 = 0.13;
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + i * TAU / 3, a2 = a + TAU / 3;
    const p = [Math.cos(a) * R0, Math.sin(a) * R0], q = [Math.cos(a2) * R0, Math.sin(a2) * R0];
    const ux = (q[0] - p[0]), uy = (q[1] - p[1]), L = Math.hypot(ux, uy);
    const A = [p[0] + ux / L * cut0, p[1] + uy / L * cut0], B = [q[0] - ux / L * cut0, q[1] - uy / L * cut0];
    if (i === 0) tr.moveTo(A[0], A[1]); else tr.lineTo(A[0], A[1]);
    tr.lineTo(B[0], B[1]);
  }
  tr.closePath();
  const tg = cut(tr, 0.16, 0.12); tg.rotateY(Math.PI); out.push(tg);       // topaz: trillion
  out.push(brilliant(4, 0.5, 0.3, 0.16, 0.26, Math.PI / 4));               // amethyst: princess
  out.forEach(function (g) { g.computeBoundingBox(); const b = g.boundingBox; g.translate(0, -(b.max.y + b.min.y) / 2, 0); g.computeVertexNormals(); });
  return out;
}

/* ---------------- The jeweler ----------------
   A 35-unit (175 cm) man with adult proportions: head a bit under one seventh of his height, shoulders about
   two head-widths and a half, arms reaching mid-thigh, tapered and shaped limbs, hands with five fingers. */
function buildKeeper(T, envMap) {
  const M = function (c, sh, spec) { return new T.MeshPhongMaterial({ color: c, shininess: sh || 18, specular: spec == null ? 0x222222 : spec }); };
  const skin = M(0xe0a47a, 14, 0x2a1d14), shirt = M(0xf6f3ec, 10), vest = M(0x6e1d44, 30, 0x442233), pants = M(0x262a3e, 10);
  const shoe = new T.MeshPhongMaterial({ color: 0x2a160c, shininess: 90, specular: 0x886655 }), hair = M(0x4a3524, 20);
  const white = M(0xffffff, 60, 0x666666), iris = M(0x3b6a8a, 80, 0x999999), pupil = M(0x0a0a0a, 90, 0xaaaaaa), lips = M(0xb35a50, 20);
  const gold = new T.MeshPhongMaterial({ color: 0xffc23a, specular: 0xffffff, shininess: 120, envMap: envMap, combine: T.AddOperation, reflectivity: 0.25 });
  const black = M(0x111111, 80, 0x666666), tie = M(0xd12030, 40);
  const root = new T.Group(), body = new T.Group();
  root.add(body);
  function add(par, geo, mat, x, y, z) { const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); par.add(m); return m; }
  const P = {};

  // legs: hip joints at 16.8, thigh 8.4, shin 8.0
  P.legs = [];
  [-1, 1].forEach(function (s) {
    const hip = new T.Group(); hip.position.set(s * 1.9, 16.8, 0); body.add(hip);
    add(hip, latheGeo(T, [[0.6, 1.9], [-0.8, 2.05], [-3.5, 1.85], [-6.5, 1.4], [-8.4, 1.2]], 16, 0.95), pants);
    const knee = new T.Group(); knee.position.y = -8.4; hip.add(knee);
    add(knee, latheGeo(T, [[0.4, 1.25], [-1.0, 1.32], [-2.6, 1.38], [-5.5, 0.95], [-8.0, 0.78]], 16, 0.95), pants);
    const ankle = new T.Group(); ankle.position.y = -8.0; knee.add(ankle);
    add(ankle, roundBox(T, 2.2, 1.5, 5.4, 0.6), shoe, 0, -0.55, 1.3);
    P.legs.push({ hip: hip, knee: knee });
  });
  // hips and torso: oval cross sections
  add(body, latheGeo(T, [[15.4, 0.4], [15.8, 2.7], [17, 3.5], [19, 3.55], [20.6, 3.25]], 20, 0.66), pants);
  const belt = add(body, new T.CylinderGeometry(3.3, 3.3, 0.7, 20, 1, true), black, 0, 20.4, 0); belt.scale.z = 0.67;
  add(body, new T.BoxGeometry(0.9, 0.6, 0.2), gold, 0, 20.4, 2.25);
  const chest = new T.Group(); body.add(chest);
  add(chest, latheGeo(T, [[20.2, 3.2], [21.6, 3.12], [23.6, 3.5], [25.6, 3.95], [27.3, 4.1], [28.4, 3.7], [29.2, 2.6], [29.8, 1.3], [30.0, 0.3]], 22, 0.6), shirt);
  const vestG = new T.LatheGeometry([[19.7, 3.38], [21.6, 3.3], [23.6, 3.66], [25.6, 4.1], [27.0, 4.24], [27.9, 4.0]].map(function (p) { return new T.Vector2(p[1], p[0]); }), 22);
  vestG.scale(1, 1, 0.63); vestG.computeVertexNormals();
  const vm = vest.clone(); vm.side = T.DoubleSide;
  add(chest, vestG, vm);
  const vg = new T.BufferGeometry();
  vg.setAttribute("position", new T.Float32BufferAttribute([-1.35, 27.9, 2.62, 1.35, 27.9, 2.62, 0, 23.6, 2.36], 3));
  vg.computeVertexNormals();
  add(chest, vg, new T.MeshPhongMaterial({ color: 0xf6f3ec, shininess: 10, side: T.DoubleSide }));
  [22.8, 21.6, 20.5].forEach(function (y) { add(chest, new T.SphereGeometry(0.2, 8, 6), gold, 0, y, 2.36 - (23 - y) * 0.03); });
  add(chest, new T.SphereGeometry(0.28, 8, 6), tie, 0, 28.5, 2.25);                     // bow tie knot and wings
  [-1, 1].forEach(function (s) { const w = add(chest, new T.ConeGeometry(0.5, 1.0, 4), tie, s * 0.62, 28.5, 2.15); w.rotation.z = s * Math.PI / 2; w.scale.set(1, 1, 0.5); });
  const collar = add(chest, new T.TorusGeometry(1.2, 0.28, 6, 16), shirt, 0, 29.3, 0.15); collar.rotation.x = Math.PI / 2 - 0.25; collar.scale.y = 0.85;
  // neck and head
  add(chest, latheGeo(T, [[29.0, 1.2], [30.2, 1.08], [31.0, 1.1]], 14, 0.95), skin);
  const head = new T.Group(); head.position.set(0, 32.75, 0.2); head.scale.setScalar(1.1); chest.add(head);
  const hg = new T.SphereGeometry(1, 30, 22), hp = hg.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    let x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    if (y < 0) { const k = 1 - 0.3 * y * y; x *= k; z *= 1 - 0.1 * y * y; if (z > 0) z += 0.06 * -y; }   // jaw narrows to the chin
    if (z < 0) z *= 1.05;
    hp.setXYZ(i, x * 1.5, y * 2.3, z * 1.85);
  }
  hg.computeVertexNormals();
  add(head, hg, skin);
  [-1, 1].forEach(function (s) {
    add(head, new T.SphereGeometry(0.3, 12, 10), white, s * 0.56, 0.25, 1.52);
    add(head, new T.SphereGeometry(0.17, 10, 8), iris, s * 0.56, 0.25, 1.77);
    add(head, new T.SphereGeometry(0.09, 8, 6), pupil, s * 0.56, 0.25, 1.89);
    const lid = add(head, new T.SphereGeometry(0.32, 12, 8, 0, TAU, 0, Math.PI * 0.42), skin, s * 0.56, 0.27, 1.5); lid.rotation.x = 0.35;
    const brow = add(head, roundBox(T, 0.78, 0.17, 0.26, 0.07), hair, s * 0.58, 0.74, 1.62); brow.rotation.z = -s * 0.12;
    const ear = add(head, new T.SphereGeometry(1, 10, 8), skin, s * 1.46, 0.1, 0.05); ear.scale.set(0.2, 0.55, 0.36);
    const mus = add(head, new T.SphereGeometry(1, 10, 8), hair, s * 0.34, -0.62, 1.78); mus.scale.set(0.5, 0.17, 0.24); mus.rotation.z = s * 0.28;
  });
  const nose = add(head, new T.CylinderGeometry(0.1, 0.23, 0.78, 8), skin, 0, -0.08, 1.86); nose.rotation.x = -0.4;
  add(head, new T.SphereGeometry(0.2, 10, 8), skin, 0, -0.4, 1.98);
  const smile = add(head, new T.TorusGeometry(0.34, 0.055, 6, 14, Math.PI), lips, 0, -0.82, 1.6); smile.rotation.z = Math.PI; smile.rotation.x = -0.2;
  const cap = new T.SphereGeometry(1, 22, 12, 0, TAU, 0, Math.PI * 0.5); cap.scale(1.56, 1.9, 1.95);
  const hc = add(head, cap, hair, 0, 0.5, -0.2); hc.rotation.x = -0.22;
  const band = add(head, new T.TorusGeometry(1, 0.07, 6, 28), black, 0, 1.0, 0.0); band.scale.set(1.56, 1.92, 1); band.rotation.x = Math.PI / 2 - 0.25;
  const loupe = new T.Group(); loupe.position.set(0.56, 1.3, 1.62); loupe.rotation.x = -0.9; head.add(loupe);
  add(loupe, new T.CylinderGeometry(0.33, 0.38, 0.7, 14), black).rotation.x = Math.PI / 2;
  const lr = add(loupe, new T.TorusGeometry(0.34, 0.06, 6, 16), gold, 0, 0, 0.36);
  lr.rotation.y = 0;
  P.head = head; P.chest = chest;

  // arms: shoulder joints at 28.2, upper arm 6.0, forearm 5.2, hand about 3.6
  P.arms = [];
  [-1, 1].forEach(function (s) {
    const sh = new T.Group(); sh.position.set(s * 4.05, 28.1, 0); chest.add(sh);
    add(sh, new T.SphereGeometry(1.32, 14, 10), shirt);
    add(sh, latheGeo(T, [[0.3, 1.2], [-1.0, 1.28], [-3.0, 1.13], [-5.0, 0.95], [-6.0, 0.9]], 14, 0.92), shirt);
    const el = new T.Group(); el.position.y = -6.0; sh.add(el);
    const cuff = add(el, new T.TorusGeometry(0.88, 0.26, 6, 14), shirt, 0, 0.1, 0); cuff.rotation.x = Math.PI / 2;
    add(el, latheGeo(T, [[0.2, 0.84], [-1.3, 0.96], [-3.5, 0.68], [-5.2, 0.56]], 14, 0.85), skin);
    const wr = new T.Group(); wr.position.y = -5.2; el.add(wr);
    const hand = new T.Group(); hand.rotation.y = -s * Math.PI / 2; wr.add(hand);
    add(hand, roundBox(T, 1.75, 1.95, 0.78, 0.32), skin, 0, -0.95, 0);
    const fingers = [];
    [[-0.62, 0.92, 0.7], [-0.2, 1.02, 0.76], [0.22, 0.96, 0.72], [0.62, 0.74, 0.56]].forEach(function (f) {
      const x = -s * f[0];
      const f1 = new T.Group(); f1.position.set(x, -1.9, 0); hand.add(f1);
      add(f1, new T.CylinderGeometry(0.2, 0.19, f[1], 8), skin, 0, -f[1] / 2, 0);
      const f2 = new T.Group(); f2.position.y = -f[1]; f1.add(f2);
      add(f2, new T.CylinderGeometry(0.18, 0.16, f[2], 8), skin, 0, -f[2] / 2, 0);
      add(f2, new T.SphereGeometry(0.16, 8, 6), skin, 0, -f[2], 0);
      fingers.push({ a: f1, b: f2 });
    });
    const th = new T.Group(); th.position.set(-s * -0.85, -0.7, 0.25); th.rotation.z = s * -0.5; hand.add(th);
    add(th, new T.CylinderGeometry(0.24, 0.2, 0.9, 8), skin, 0, -0.45, 0);
    const th2 = new T.Group(); th2.position.y = -0.9; th.add(th2);
    add(th2, new T.CylinderGeometry(0.2, 0.17, 0.75, 8), skin, 0, -0.37, 0);
    add(th2, new T.SphereGeometry(0.17, 8, 6), skin, 0, -0.75, 0);
    P.arms.push({ s: s, sh: sh, el: el, wr: wr, hand: hand, fingers: fingers, th: th });
  });
  root.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { root: root, body: body, P: P, act: null, actT: 0 };
}

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x0a2a35, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = (parseInt(T.REVISION, 10) || 0) >= 182 ? T.PCFShadowMap : T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.fog = new T.Fog(0x0a2a35, 260, 520);
  const camera = new T.PerspectiveCamera(BOARD_FOV, W / H, 1, 1200);
  const caps = renderer.capabilities, aniso = Math.min(4, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = aniso;
    return t;
  }
  const script = scriptCanvas(scriptImg);
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;
  const tGlow = tex(glowCanvas(false)), tSoft = tex(glowCanvas(true)), tStar = tex(starCanvas()), tBlob = tex(shadowBlob());

  /* lights */
  scene.add(new T.HemisphereLight(0xfff4e6, 0x3a2a5a, 1.25));
  const key = new T.DirectionalLight(0xfff2dc, 2.6);
  key.position.set(-6, 22, 10); key.target.position.set(0, 0, 0);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera; sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 5; sc.far = 50; sc.updateProjectionMatrix();
  key.shadow.bias = -0.0008; key.shadow.normalBias = 0.02;
  scene.add(key); scene.add(key.target);
  const fill = new T.DirectionalLight(0xc8e0ff, 0.7); fill.position.set(30, 40, 60); scene.add(fill);

  function phong(c, sh, extra) { const m = new T.MeshPhongMaterial({ color: c, shininess: sh || 30, specular: 0x444444 }); if (extra) for (const k in extra) m[k] = extra[k]; return m; }
  const goldMat = new T.MeshPhongMaterial({ color: 0xffbf2e, specular: 0xffffff, shininess: 110, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.3 });
  const woodMat = new T.MeshPhongMaterial({ map: tex(woodCanvas(), true), specular: 0x664433, shininess: 60 });
  const glassMat = new T.MeshPhongMaterial({ color: 0xbfe8ff, specular: 0xffffff, shininess: 160, transparent: true, opacity: 0.18, depthWrite: false, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.25 });
  const blobMat = new T.MeshBasicMaterial({ map: tBlob, transparent: true, depthWrite: false });
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
  function blob(par, x, y, z, w, d) { const m = new T.Mesh(unit, blobMat); m.position.set(x, y + 0.05, z); m.scale.set(w, 1, d); m.renderOrder = 2; par.add(m); return m; }
  function glow(par, x, y, z, size, col, op) {
    const m = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: col, transparent: true, opacity: op == null ? 0.8 : op, depthWrite: false, blending: T.AdditiveBlending }));
    m.position.set(x, y, z); m.scale.set(size, size, 1); par.add(m); return m;
  }

  /* ---------------- the tray ---------------- */
  const tray = new T.Group(); scene.add(tray);
  const trayTex = tex(trayCanvas());
  const bed = new T.Mesh(new T.PlaneGeometry(N, N).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ map: trayTex }));
  bed.receiveShadow = true; tray.add(bed);
  const FR = 0.55, half = N / 2;
  [[0, -half - FR / 2, N + FR * 2, FR], [0, half + FR / 2, N + FR * 2, FR], [-half - FR / 2, 0, FR, N], [half + FR / 2, 0, FR, N]].forEach(function (f) {
    const m = new T.Mesh(roundBox(T, f[2], 0.5, f[3], 0.18), goldMat);
    m.position.set(f[0], 0.12, f[1]); m.castShadow = true; m.receiveShadow = true; tray.add(m);
  });
  const base = new T.Mesh(roundBox(T, N + FR * 2 + 0.3, 0.5, N + FR * 2 + 0.3, 0.2), woodMat);
  base.position.y = -0.32; tray.add(base);
  // the wordmark plaque on the front rail of the tray
  const plq = new T.Mesh(new T.PlaneGeometry(3.2, 3.2 * 0.24), new T.MeshBasicMaterial({ map: tex(plaqueCanvas(script, 512, 124, "#2a0b4a", "#120326", "#ffbf2e")), transparent: true }));
  plq.rotation.x = -0.45; plq.position.set(0, 0.42, half + FR + 0.18); tray.add(plq);
  // ore slabs, one per cell, shown when the level has ore there
  const rockMats = [null, new T.MeshLambertMaterial({ map: tex(rockCanvas(1)) }), new T.MeshLambertMaterial({ map: tex(rockCanvas(2)) })];
  const rockGeo = roundBox(T, 0.96, 0.3, 0.96, 0.1);
  const rocks = [];
  for (let r = 0; r < N; r++) { rocks.push([]); for (let c = 0; c < N; c++) { const m = new T.Mesh(rockGeo, rockMats[1]); m.position.set(c - 3.5, 0.1, r - 3.5); m.visible = false; m.receiveShadow = true; tray.add(m); rocks[r].push(m); } }
  // selection, keyboard cursor and hint frames
  function frameMesh(col) { const m = new T.Mesh(unit, new T.MeshBasicMaterial({ map: tex(frameCanvas(col)), transparent: true, depthWrite: false, blending: T.AdditiveBlending })); m.position.y = 0.03; m.visible = false; m.renderOrder = 3; tray.add(m); return m; }
  const selMesh = frameMesh("#ffd23f"), curMesh = frameMesh("#3ff0ff"), hintA = frameMesh("#9bff3f"), hintB = frameMesh("#9bff3f");

  /* ---------------- the counter ---------------- */
  const counter = new T.Group(); scene.add(counter);
  const CX1 = -30, CX2 = 30, CZ1 = -12, CZ2 = 8;
  const cw = CX2 - CX1, cd = CZ2 - CZ1;
  const body = new T.Mesh(roundBox(T, cw, 17, cd, 0.6), woodMat); body.position.set(0, FLOOR_Y + 8.5, (CZ1 + CZ2) / 2); counter.add(body);
  const vel = new T.Mesh(new T.PlaneGeometry(cw - 1.4, cd - 1.4).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ map: tex(velvetCanvas("#3a0a2c"), true) }));
  vel.position.set(0, FLOOR_Y + 17.05, (CZ1 + CZ2) / 2); counter.add(vel);
  const cgl = new T.Mesh(roundBox(T, cw, 3.0, cd, 0.3), glassMat); cgl.position.set(0, TOP_Y - 1.5, (CZ1 + CZ2) / 2); cgl.renderOrder = 5; counter.add(cgl);
  [[0, CZ2 - 0.2, cw, 0.4], [0, CZ1 + 0.2, cw, 0.4], [CX1 + 0.2, (CZ1 + CZ2) / 2, 0.4, cd], [CX2 - 0.2, (CZ1 + CZ2) / 2, 0.4, cd]].forEach(function (f) {
    const m = new T.Mesh(new T.BoxGeometry(f[2], 0.5, f[3]), goldMat); m.position.set(f[0], TOP_Y + 0.05, f[1]); counter.add(m);
  });
  // jewelry under the glass: a scatter of small cut gems
  const geos = gemGeos(T);
  const gemMats = GEM_HEX.map(function (h, i) {
    const col = new T.Color(h);
    return new T.MeshPhongMaterial({ color: col, emissive: col.clone().multiplyScalar(i === 0 ? 0.12 : 0.2), specular: 0xffffff, shininess: 200,
      flatShading: true, envMap: tEnv, combine: T.AddOperation, reflectivity: i === 0 ? 0.55 : 0.32 });
  });
  (function () {
    const rnd = rng(31), mt = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), p = new T.Vector3(), s = new T.Vector3();
    for (let k = 0; k < NCOL; k++) {
      const n = 26, im = new T.InstancedMesh(geos[k], gemMats[k], n);
      let i = 0;
      while (i < n) {
        const x = CX1 + 2 + rnd() * (cw - 4), z = CZ1 + 2 + rnd() * (cd - 4);
        if (Math.abs(x) < 5.6 && z > -6.8 && z < 5.6) continue;          // not under the tray
        p.set(x, FLOOR_Y + 17.3, z); e.set(0, rnd() * TAU, 0); q.setFromEuler(e); s.setScalar(0.5 + rnd() * 0.4);
        im.setMatrixAt(i++, mt.compose(p, q, s));
      }
      counter.add(im);
    }
  })();
  // the front panel plaque
  const cpl = new T.Mesh(new T.PlaneGeometry(24, 6), new T.MeshBasicMaterial({ map: tex(plaqueCanvas(script, 1024, 256, "#3a0f5a", "#16052a", "#ffbf2e", "GEM SHOP")) }));
  cpl.position.set(0, FLOOR_Y + 9, CZ2 + 0.05); counter.add(cpl);
  // service bell (tap it in the shop) and a cash register
  const bell = new T.Group(); bell.position.set(12, TOP_Y, -6.5); counter.add(bell);
  put(bell, new T.Mesh(new T.CylinderGeometry(1.1, 1.2, 0.3, 20), woodMat)).position.y = 0.15;
  const dome = new T.Mesh(new T.SphereGeometry(0.9, 18, 10, 0, TAU, 0, Math.PI / 2), goldMat); dome.position.y = 0.3; bell.add(dome);
  put(bell, new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.4, 8), goldMat)).position.y = 1.35;
  put(bell, new T.Mesh(new T.SphereGeometry(0.18, 10, 8), goldMat)).position.y = 1.55;
  const reg = new T.Group(); reg.position.set(-20, TOP_Y, -7); reg.rotation.y = 0.25; counter.add(reg);
  const regBody = new T.MeshPhongMaterial({ color: 0xc8a050, specular: 0xffffff, shininess: 90, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.2 });
  put(reg, new T.Mesh(roundBox(T, 6, 2.2, 5, 0.3), regBody)).position.set(0, 1.1, 0);
  const regTop = new T.Mesh(roundBox(T, 6, 2.6, 2.4, 0.3), regBody); regTop.position.set(0, 3.3, -1.1); regTop.rotation.x = -0.3; reg.add(regTop);
  for (let i = 0; i < 12; i++) put(reg, new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 0.3, 10), phong(0xf4efe0, 40))).position.set(-1.9 + (i % 4) * 1.25, 2.35, 0.2 + Math.floor(i / 4) * 0.9);
  const regDisp = new T.Mesh(new T.BoxGeometry(3.2, 1.0, 0.3), new T.MeshBasicMaterial({ color: 0x42ff7a })); regDisp.position.set(0, 4.9, -1.6); regDisp.rotation.x = -0.3; reg.add(regDisp);
  const drawer = new T.Mesh(roundBox(T, 5.4, 0.9, 4.6, 0.2), regBody); drawer.position.set(0, 0.5, 0.3); reg.add(drawer);

  /* ---------------- LED boards ---------------- */
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas()); tDot.wrapS = tDot.wrapT = T.RepeatWrapping; tDot.anisotropy = aniso;
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
  const housing = new T.MeshPhongMaterial({ color: 0x0b0c14, specular: 0x555555, shininess: 60 });
  // the counter ticker, standing behind the tray and leaning back toward the player
  const LW = 9.4, LH = LW * LED_ROWS / LED_COLS;
  const tick = new T.Group(); tick.position.set(0, 0.05, -half - FR - 0.9); tick.rotation.x = -0.62; tray.add(tick);
  put(tick, new T.Mesh(roundBox(T, LW + 0.5, LH + 0.5, 0.35, 0.12), housing)).position.set(0, LH / 2 + 0.25, -0.2);
  const tFace = new T.Mesh(new T.PlaneGeometry(LW, LH), ledMat(1)); tFace.position.set(0, LH / 2 + 0.25, 0); tick.add(tFace);
  [-1, 1].forEach(function (s) { const leg = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 1.2, 8), goldMat); leg.position.set(s * (LW / 2 - 0.4), 0, -0.3); tick.add(leg); });
  // the big one across the back wall
  const BW = 76, BH = BW * LED_ROWS / LED_COLS;
  const big = new T.Group(); big.position.set(0, FLOOR_Y + 72, -129); scene.add(big);
  big.add(new T.Mesh(new T.BoxGeometry(BW + 2, BH + 2.4, 1), housing));
  const bFace = new T.Mesh(new T.PlaneGeometry(BW, BH), ledMat(1)); bFace.position.z = 0.55; big.add(bFace);

  /* ---------------- the shop room ---------------- */
  const room = new T.Group(); scene.add(room);
  const tFloor = tex(floorCanvas(), true); tFloor.repeat.set(16, 16);
  const floor = new T.Mesh(new T.PlaneGeometry(160, 170).rotateX(-Math.PI / 2), new T.MeshPhongMaterial({ map: tFloor, specular: 0x444444, shininess: 80 }));
  floor.position.set(0, FLOOR_Y, -45); room.add(floor);
  const tWall = tex(wallCanvas(), true);
  function wall(w, h, x, z, ry) {
    const t = tWall.clone(); t.needsUpdate = true; t.repeat.set(w / 16, h / 16);
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshLambertMaterial({ map: t }));
    m.position.set(x, FLOOR_Y + h / 2, z); m.rotation.y = ry; room.add(m);
    const trim = new T.Mesh(new T.BoxGeometry(w, 2.2, 0.8), woodMat); trim.position.set(x, FLOOR_Y + 1.1, z); trim.rotation.y = ry; room.add(trim);
    const crown = new T.Mesh(new T.BoxGeometry(w, 1.2, 1.0), goldMat); crown.position.set(x, FLOOR_Y + h - 0.6, z); crown.rotation.y = ry; room.add(crown);
    return m;
  }
  wall(160, 110, 0, -130, 0); wall(170, 110, -80, -45, Math.PI / 2); wall(170, 110, 80, -45, -Math.PI / 2);
  // wordmark decals on the side walls
  const decal = new T.MeshBasicMaterial({ map: tex(plaqueCanvas(script, 1024, 420, "#2a0b4a", "#120326", "#ffbf2e")), transparent: true });
  [[-79.4, Math.PI / 2], [79.4, -Math.PI / 2]].forEach(function (d) { const m = new T.Mesh(new T.PlaneGeometry(30, 12.3), decal); m.position.set(d[0], FLOOR_Y + 60, -95); m.rotation.y = d[1]; room.add(m); });
  // pendant lamps
  for (let i = -1; i <= 1; i++) {
    const lamp = new T.Group(); lamp.position.set(i * 40, FLOOR_Y + 92, -60); room.add(lamp);
    put(lamp, new T.Mesh(new T.CylinderGeometry(0.15, 0.15, 18, 6), housing)).position.y = 9;
    const sh = new T.Mesh(new T.ConeGeometry(4, 3.5, 18, 1, true), new T.MeshPhongMaterial({ color: 0x0d6e6e, side: T.DoubleSide, specular: 0xffffff, shininess: 80 })); lamp.add(sh);
    const bulb = new T.Mesh(new T.SphereGeometry(1.4, 12, 8), new T.MeshBasicMaterial({ color: 0xfff1c8 })); bulb.position.y = -1.6; lamp.add(bulb);
    glow(lamp, 0, -2, 0, 16, 0xffe0a0, 0.45);
  }

  /* ---------------- buildings (each tier is its own group, shown when bought) ---------------- */
  const B = {};
  function site(id, x, z, ry) {
    const g = new T.Group(); g.position.set(x, FLOOR_Y, z); g.rotation.y = ry || 0; room.add(g);
    const tiers = [new T.Group(), new T.Group(), new T.Group(), new T.Group()];
    tiers.forEach(function (t) { g.add(t); });
    B[id] = { g: g, tiers: tiers, pop: [0, 0, 0, 0], spin: [] };
    return tiers;
  }
  const leaseMat = new T.MeshBasicMaterial({ map: tex((function () {
    const c = mkCanvas(256, 128), g = c.getContext("2d");
    g.fillStyle = "#ffd23f"; g.fillRect(0, 0, 256, 128);
    g.fillStyle = "#1b1b1b"; for (let x = -128; x < 256; x += 32) { g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 16, 128); g.lineTo(x + 144, 0); g.lineTo(x + 128, 0); g.fill(); }
    g.fillStyle = "#1b1b1b"; g.fillRect(24, 34, 208, 60); g.fillStyle = "#ffd23f"; g.font = "bold 40px Arial Black, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("COMING SOON", 128, 64);
    return c;
  })()) });
  function placeholder(tier0, w, d) {                       // tape on the floor and a little sawhorse sign
    const f = new T.Mesh(new T.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.18, depthWrite: false }));
    f.position.y = 0.08; tier0.add(f);
    const s = new T.Mesh(new T.PlaneGeometry(10, 5), leaseMat); s.position.set(0, 6, 0); tier0.add(s);
    [-1, 1].forEach(function (k) { const leg = new T.Mesh(new T.BoxGeometry(0.5, 7, 0.5), woodMat); leg.position.set(k * 4, 3.5, -0.4); tier0.add(leg); });
  }
  const gemPile = function (par, n, cx, cy, cz, rx, rz, sc, seed) {
    const rnd = rng(seed), mt = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), p = new T.Vector3(), s = new T.Vector3();
    for (let k = 0; k < NCOL; k++) {
      const im = new T.InstancedMesh(geos[k], gemMats[k], n);
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, rr = Math.sqrt(rnd());
        p.set(cx + Math.cos(a) * rr * rx, cy + (1 - rr) * sc * 1.6 + rnd() * sc * 0.6, cz + Math.sin(a) * rr * rz);
        e.set((rnd() - 0.5) * 1.4, rnd() * TAU, (rnd() - 0.5) * 1.4); q.setFromEuler(e); s.setScalar(sc * (0.8 + rnd() * 0.4));
        im.setMatrixAt(i, mt.compose(p, q, s));
      }
      par.add(im);
    }
  };

  // DISPLAY CASES: along the left wall, one more case each tier, spotlights on the third
  (function () {
    const t = site("cases", -56, -34, Math.PI / 2);
    placeholder(t[0], 60, 16);
    for (let k = 1; k <= 3; k++) {
      const g = t[k], z = (k - 2) * 22;
      const ped = new T.Mesh(roundBox(T, 18, 12, 11, 0.5), woodMat); ped.position.set(z, 6, 0); g.add(ped);
      const v = new T.Mesh(new T.PlaneGeometry(17, 10).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ map: tex(velvetCanvas(["#0d3a7a", "#5a0d3a", "#0d5a3a"][k - 1])) }));
      v.position.set(z, 12.1, 0); g.add(v);
      gemPile(g, 4, z, 12.4, 0, 7, 3.5, 1.3, k * 7);
      const box = new T.Mesh(roundBox(T, 18, 8, 11, 0.4), glassMat); box.position.set(z, 16.1, 0); box.renderOrder = 5; g.add(box);
      const trim = new T.Mesh(new T.BoxGeometry(18.4, 0.6, 11.4), goldMat); trim.position.set(z, 20.2, 0); g.add(trim);
      blob(g, z, 0, 0, 22, 14);
      if (k === 3) for (let j = -1; j <= 1; j++) { const sp = new T.Mesh(new T.CylinderGeometry(0.8, 1.6, 2.4, 12), housing); sp.position.set(j * 22, 34, -2); g.add(sp); glow(g, j * 22, 22, 0, 18, 0xbfe8ff, 0.5); }
    }
  })();
  // THE MINE: a cave mouth in the back left, then rails and a cart, then lanterns and glowing veins
  (function () {
    const t = site("mine", -50, -126, 0);
    placeholder(t[0], 34, 14);
    const rockMat = new T.MeshLambertMaterial({ map: tex(rockCanvas(2)), flatShading: true });
    const g1 = t[1], rnd = rng(9), rk = new T.DodecahedronGeometry(1, 0);
    const dark = new T.Mesh(new T.PlaneGeometry(18, 24), new T.MeshBasicMaterial({ color: 0x050302 })); dark.position.set(0, 12, -1.4); g1.add(dark);
    const rl = [];
    for (let i = 0; i < 26; i++) {
      const a = i / 25 * Math.PI, rx = 12.5, ry = 16;
      rl.push([Math.cos(a) * rx + (rnd() - 0.5), i === 0 || i === 25 ? 2 : Math.sin(a) * ry + 4 + (rnd() - 0.5), 0, rnd() * 3, rnd() * 3, rnd() * 3, 3.2 + rnd() * 1.8]);
    }
    for (let i = 0; i < 6; i++) rl.push([-12 + (i % 2) * 24 + (rnd() - 0.5) * 2, 3 + i * 3.6, 0.5, rnd() * 3, rnd() * 3, 0, 3 + rnd()]);
    inst(T, g1, rk, rockMat, rl);
    [-1, 1].forEach(function (s) { const p = new T.Mesh(new T.BoxGeometry(1.6, 22, 1.6), woodMat); p.position.set(s * 8.5, 11, 1); g1.add(p); });
    const lin = new T.Mesh(new T.BoxGeometry(20, 1.8, 2), woodMat); lin.position.set(0, 22.5, 1); g1.add(lin);
    const ms = new T.Mesh(new T.PlaneGeometry(14, 4.2), new T.MeshBasicMaterial({ map: tex(plaqueCanvas(script, 512, 154, "#6b3a1c", "#40200c", "#e0a640")) })); ms.position.set(0, 26, 1.6); g1.add(ms);
    const g2 = t[2];
    [-1.6, 1.6].forEach(function (x) { const rl = new T.Mesh(new T.BoxGeometry(0.4, 0.5, 42), new T.MeshPhongMaterial({ color: 0x8a8f9a, specular: 0xffffff, shininess: 90 })); rl.position.set(x, 0.6, 20); g2.add(rl); });
    const ties = []; for (let z = 0; z < 40; z += 3) ties.push([0, 0.2, z + 1]);
    inst(T, g2, new T.BoxGeometry(5, 0.4, 1), woodMat, ties);
    function cart(par, z) {
      const c = new T.Group(); c.position.set(0, 0, z); par.add(c);
      const cb = new T.Mesh(new T.CylinderGeometry(3.8, 2.8, 4, 4, 1, true), new T.MeshPhongMaterial({ color: 0x5a6070, specular: 0x999999, shininess: 50, side: T.DoubleSide }));
      cb.rotation.y = Math.PI / 4; cb.scale.set(1, 1, 1.25); cb.position.y = 3.6; c.add(cb);
      const fl = new T.Mesh(new T.BoxGeometry(4, 0.3, 5), housing); fl.position.y = 1.7; c.add(fl);
      [[-1.9, -1.8], [1.9, -1.8], [-1.9, 1.8], [1.9, 1.8]].forEach(function (w) { const wh = new T.Mesh(new T.CylinderGeometry(0.9, 0.9, 0.5, 12), housing); wh.rotation.z = Math.PI / 2; wh.position.set(w[0], 1.0, w[1]); c.add(wh); });
      gemPile(c, 5, 0, 4.4, 0, 2.4, 2.9, 1.0, z | 0);
      const side = new T.Mesh(new T.PlaneGeometry(4.4, 1.6), new T.MeshBasicMaterial({ map: tex(plaqueCanvas(script, 256, 92, "#2a0b4a", "#120326", "#ffbf2e")) }));
      side.position.set(0, 3.6, 3.62); side.rotation.x = -0.24; c.add(side);
      return c;
    }
    cart(g2, 24);
    const g3 = t[3];
    [-7, 7].forEach(function (x) { const l = new T.Mesh(new T.CylinderGeometry(0.6, 0.6, 1.6, 8), new T.MeshBasicMaterial({ color: 0xffd27a })); l.position.set(x, 19, 2.6); g3.add(l); glow(g3, x, 19, 3, 9, 0xffb040, 0.8); });
    const crys = new T.OctahedronGeometry(1, 0);
    for (let i = 0; i < 9; i++) {
      const m = new T.Mesh(crys, new T.MeshBasicMaterial({ color: new T.Color(GEM_HEX[i % NCOL]) }));
      const a = 0.25 + i / 8 * (Math.PI - 0.5); m.position.set(Math.cos(a) * 14.5, Math.sin(a) * 18 + 3, 2.5); m.scale.set(0.8, 1.7, 0.8); m.rotation.z = (i - 4) * 0.2; g3.add(m);
      glow(g3, m.position.x, m.position.y, 3, 5, new T.Color(GEM_HEX[i % NCOL]), 0.7);
    }
    cart(g3, 36).rotation.y = 0.1;
  })();
  // WORKSHOP: a bench with a spinning polishing wheel, then a grinder and a lamp, then an anvil and a shelf of jars
  (function () {
    const t = site("work", 50, -112, -0.25);
    placeholder(t[0], 34, 16);
    const g1 = t[1];
    const top = new T.Mesh(roundBox(T, 30, 1.4, 12, 0.3), woodMat); top.position.y = 17; g1.add(top);
    [[-13.5, -4.5], [13.5, -4.5], [-13.5, 4.5], [13.5, 4.5]].forEach(function (p) { const l = new T.Mesh(new T.BoxGeometry(1.4, 16.4, 1.4), woodMat); l.position.set(p[0], 8.2, p[1]); g1.add(l); });
    const shelf = new T.Mesh(new T.BoxGeometry(28, 0.8, 10), woodMat); shelf.position.y = 5; g1.add(shelf);
    const steel = new T.MeshPhongMaterial({ color: 0x9aa0ae, specular: 0xffffff, shininess: 100, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.2 });
    const motor = new T.Mesh(new T.CylinderGeometry(1.6, 1.6, 4, 16), steel); motor.rotation.z = Math.PI / 2; motor.position.set(-8, 19.6, 0); g1.add(motor);
    const wheel = new T.Mesh(new T.CylinderGeometry(2.6, 2.6, 0.8, 24), new T.MeshPhongMaterial({ color: 0xf2efe6, shininess: 10 })); wheel.rotation.z = Math.PI / 2; wheel.position.set(-5.4, 19.6, 0); g1.add(wheel);
    B.work.spin.push({ m: wheel, axis: "x", speed: 14 });
    const vise = new T.Mesh(roundBox(T, 3, 2.4, 3, 0.3), new T.MeshPhongMaterial({ color: 0x2a5aa8, shininess: 60 })); vise.position.set(6, 19, 2); g1.add(vise);
    gemPile(g1, 2, 10, 18.2, -2, 2.5, 2, 1.2, 4);
    const g2 = t[2];
    const grinder = new T.Mesh(new T.CylinderGeometry(4, 4, 1.1, 28), new T.MeshPhongMaterial({ color: 0x6a5a4a, shininess: 10 })); grinder.rotation.x = Math.PI / 2; grinder.position.set(-20, 12, 0); g2.add(grinder);
    const stand = new T.Mesh(new T.BoxGeometry(3, 8, 3), steel); stand.position.set(-20, 4, 0); g2.add(stand);
    B.work.spin.push({ m: grinder, axis: "y", speed: 9 });
    const arm = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 10, 8), steel); arm.position.set(10, 22.5, -4); arm.rotation.z = -0.6; g2.add(arm);
    const shade2 = new T.Mesh(new T.ConeGeometry(2.2, 2.6, 16, 1, true), new T.MeshPhongMaterial({ color: 0x0d6e6e, side: T.DoubleSide })); shade2.position.set(13.5, 26.5, -4); shade2.rotation.z = 0.5; g2.add(shade2);
    glow(g2, 12.5, 24, -3, 12, 0xffe2a0, 0.6);
    const g3 = t[3];
    const anvil = new T.Group(); anvil.position.set(22, 0, 8); g3.add(anvil);
    put(anvil, new T.Mesh(new T.BoxGeometry(4, 6, 4), housing)).position.y = 3;
    put(anvil, new T.Mesh(roundBox(T, 8, 2.4, 3.4, 0.4), new T.MeshPhongMaterial({ color: 0x2a2d36, specular: 0xffffff, shininess: 90 }))).position.y = 7.2;
    const hshelf = new T.Mesh(new T.BoxGeometry(26, 0.8, 4), woodMat); hshelf.position.set(0, 30, -6); g3.add(hshelf);
    for (let i = 0; i < 6; i++) {
      const jar = new T.Mesh(new T.CylinderGeometry(1.1, 1.1, 3, 12), glassMat); jar.position.set(-10 + i * 4, 32, -6); jar.renderOrder = 5; g3.add(jar);
      const fillG = new T.Mesh(new T.CylinderGeometry(0.95, 0.95, 1.8, 10), new T.MeshBasicMaterial({ color: new T.Color(GEM_HEX[i]) })); fillG.position.set(-10 + i * 4, 31.4, -6); g3.add(fillG);
    }
    blob(t[1], 0, 0, 0, 36, 18);
  })();
  // STOREFRONT SIGN: cardboard to start, then a carved sign, then neon, then a marquee with a spinning diamond
  (function () {
    const t = site("sign", 0, -129.2, 0);
    const cb = new T.Mesh(new T.PlaneGeometry(26, 8.1), new T.MeshLambertMaterial({ map: tex(cardboardCanvas()) })); cb.position.set(0, 46, 0.5); cb.rotation.z = 0.03; t[0].add(cb);
    const wood = new T.Mesh(new T.PlaneGeometry(56, 14), new T.MeshLambertMaterial({ map: tex(signCanvas(script, false)) })); wood.position.set(0, 46, 0.7); t[1].add(wood);
    put(t[1], new T.Mesh(new T.BoxGeometry(57, 15, 0.6), woodMat)).position.set(0, 46, 0.3);
    const neon = new T.Mesh(new T.PlaneGeometry(56, 14), new T.MeshBasicMaterial({ map: tex(signCanvas(script, true)) })); neon.position.set(0, 46, 1.0); t[2].add(neon);
    glow(t[2], -18, 46, 2, 30, 0xff4fc0, 0.45); glow(t[2], 18, 46, 2, 30, 0x3fe0ff, 0.45);
    const bulbPos = [];
    for (let i = 0; i < 36; i++) {
      const u = i / 36, per = 2 * (60 + 18);
      let d = u * per, x, y;
      if (d < 60) { x = -30 + d; y = 55; } else if ((d -= 60) < 18) { x = 30; y = 55 - d; } else if ((d -= 18) < 60) { x = 30 - d; y = 37; } else { d -= 60; x = -30; y = 37 + d; }
      bulbPos.push([x, y, 1.4]);
    }
    const bulbs = inst(T, t[3], new T.SphereGeometry(0.7, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff }), bulbPos);
    const bc = new T.Color(0xffb020);
    for (let i = 0; i < bulbPos.length; i++) bulbs.setColorAt(i, bc);
    B.sign.bulbs = bulbs; B.sign.bulbN = bulbPos.length;
    const dia = new T.Mesh(geos[0], gemMats[0]); dia.scale.setScalar(9); dia.position.set(0, 64, 3); t[3].add(dia);
    B.sign.spin.push({ m: dia, axis: "y", speed: 1.2 });
    glow(t[3], 0, 64, 4, 20, 0xffffff, 0.5);
  })();
  // THE VAULT: a round safe door on the right wall, then it swings open on gold, then gold stacked out front
  (function () {
    const t = site("vault", 79, -62, -Math.PI / 2);
    placeholder(t[0], 30, 14);
    const steel = new T.MeshPhongMaterial({ color: 0x8a92a4, specular: 0xffffff, shininess: 120, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.25 });
    const g1 = t[1];
    const fr = new T.Mesh(roundBox(T, 30, 30, 2, 0.8), new T.MeshPhongMaterial({ color: 0x3a3f4c, shininess: 60, specular: 0x888888 })); fr.position.set(0, 18, 0.6); g1.add(fr);
    const hole = new T.Mesh(new T.CircleGeometry(11.5, 32), new T.MeshBasicMaterial({ color: 0x0a0806 })); hole.position.set(0, 18, 1.7); g1.add(hole);
    const gb = new T.MeshPhongMaterial({ color: 0xffbf2e, specular: 0xffffff, shininess: 110, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.35 });
    const barG = roundBox(T, 3.4, 1.2, 1.7, 0.2);
    const bars1 = []; for (let i = 0; i < 14; i++) bars1.push([-6 + (i % 5) * 3.2, 9 + Math.floor(i / 5) * 1.3, 1.8]);
    inst(T, g1, barG, gb, bars1);
    const hinge = new T.Group(); hinge.position.set(-11.5, 18, 2.2); g1.add(hinge);
    const door = new T.Mesh(new T.CylinderGeometry(11.6, 11.6, 2.4, 40), steel); door.rotation.x = Math.PI / 2; door.position.set(11.5, 0, 0.9); hinge.add(door);
    const wheel = new T.Group(); wheel.position.set(11.5, 0, 2.4); hinge.add(wheel);
    wheel.add(new T.Mesh(new T.TorusGeometry(3.4, 0.35, 8, 24), goldMat));
    for (let k = 0; k < 3; k++) { const sp = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 8.6, 8), goldMat); sp.rotation.z = k * Math.PI / 3; wheel.add(sp); }
    const vp = new T.Mesh(new T.PlaneGeometry(10, 2.6), new T.MeshBasicMaterial({ map: tex(plaqueCanvas(script, 512, 133, "#2a0b4a", "#120326", "#ffbf2e")) })); vp.position.set(11.5, -6.5, 2.2); hinge.add(vp);
    B.vault.hinge = hinge; B.vault.wheel = wheel;
    const g3 = t[3];
    const bars3 = []; for (let i = 0; i < 18; i++) { const lay = Math.floor(i / 6), k = i % 6; bars3.push([-8 + k * 3.4 + lay * 1.7, 0.6 + lay * 1.2, 8 + (lay % 2) * 0.4]); }
    inst(T, g3, barG, gb, bars3);
    const rnd = rng(77), coins = [];
    for (let i = 0; i < 40; i++) coins.push([6 + rnd() * 10, 0.15 + Math.floor(i / 10) * 0.26, 6 + rnd() * 5, 0, rnd() * 3, 0]);
    inst(T, g3, new T.CylinderGeometry(0.8, 0.8, 0.25, 14), gb, coins);
    glow(g3, 4, 4, 9, 18, 0xffbf2e, 0.35);
  })();

  /* ---------------- the jeweler ---------------- */
  const keeper = buildKeeper(T, tEnv);
  keeper.root.position.set(21, FLOOR_Y, -17.5); keeper.root.rotation.y = -0.32;
  scene.add(keeper.root);
  blob(scene, 21, FLOOR_Y, -17.5, 12, 8);

  /* ---------------- live pieces: gems, fx, particles ---------------- */
  const gemRoot = new T.Group(); tray.add(gemRoot);
  const prismGeo = (function () {
    const ico = new T.IcosahedronGeometry(0.46, 0), g = ico.index ? ico.toNonIndexed() : ico, n = g.attributes.position.count, col = [];
    const pal = GEM_HEX.concat(["#ffffff", "#ff8a1e"]).map(function (h) { return new T.Color(h); });
    for (let f = 0; f < n / 3; f++) { const c = pal[f % pal.length]; for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b); }
    g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    return g;
  })();
  const prismMat = new T.MeshPhongMaterial({ vertexColors: true, emissive: 0x2a2a2a, specular: 0xffffff, shininess: 200, flatShading: true, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.35 });
  const barGeo = new T.BoxGeometry(0.98, 0.05, 0.08);
  const barMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false });
  const ringGeo = new T.TorusGeometry(0.46, 0.045, 6, 28);
  const fxGeo = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const ringFx = new T.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2);

  // sparkle particles
  const PN = 420, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3);
  const pGeo = new T.BufferGeometry();
  pGeo.setAttribute("position", new T.BufferAttribute(pPos, 3)); pGeo.setAttribute("color", new T.BufferAttribute(pCol, 3));
  const pts = new T.Points(pGeo, new T.PointsMaterial({ size: 0.42, map: tStar, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true }));
  pts.frustumCulled = false; tray.add(pts);
  const plist = [];
  for (let i = 0; i < PN; i++) plist.push({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, max: 1, grav: 6 });
  // twinkles that land on random gems now and then
  const twinkles = [];
  for (let i = 0; i < 5; i++) { const sp = new T.Sprite(new T.SpriteMaterial({ map: tStar, color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); sp.visible = false; tray.add(sp); twinkles.push({ sp: sp, t: Math.random() * 3, g: null }); }

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, key: key, tray: tray, gemRoot: gemRoot, geos: geos, gemMats: gemMats,
    prismGeo: prismGeo, prismMat: prismMat, barGeo: barGeo, barMat: barMat, ringGeo: ringGeo, goldMat: goldMat, tGlow: tGlow, tSoft: tSoft,
    fxGeo: fxGeo, ringFx: ringFx, fx: [], rocks: rocks, rockMats: rockMats, selMesh: selMesh, curMesh: curMesh, hintA: hintA, hintB: hintB,
    room: room, bigLed: big, pts: pts, pGeo: pGeo, pPos: pPos, pCol: pCol, plist: plist, pNext: 0, twinkles: twinkles, leaving: [], B: B, keeper: keeper, bell: bell, drawer: drawer, dome: dome,
    view: "board", cam: null, camFrom: null, camT: 1, boardCam: null, shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0,
    v: new T.Vector3(), v2: new T.Vector3(),
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, shadowsOn: true, shadowSize: 2048, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  const sh = QUALITY[R.quality].sh, on = sh > 0;
  if (on && sh !== R.shadowSize) {
    R.shadowSize = sh; R.key.shadow.mapSize.set(sh, sh);
    if (R.key.shadow.map) { R.key.shadow.map.dispose(); R.key.shadow.map = null; }
  }
  if (on !== R.shadowsOn) { R.shadowsOn = on; R.key.castShadow = on; }
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
function camShake(mag, dur) { if (!R || Shell.reduced) return; R.shakeMag = Math.max(R.shakeT > 0 ? R.shakeMag : 0, mag); R.shakeDur = R.shakeT = dur; }

/* ---------------- Camera ---------------- */
function camState(pos, tgt, fov, off) { return { pos: new R.T.Vector3(pos[0], pos[1], pos[2]), tgt: new R.T.Vector3(tgt[0], tgt[1], tgt[2]), fov: fov, off: off }; }
function applyCam(cs) {
  const cam = R.camera;
  cam.fov = cs.fov;
  if (cs.off > 0.5) { cam.aspect = W / (H + 2 * cs.off); cam.setViewOffset(W, H + 2 * cs.off, 0, 2 * cs.off, W, H); }
  else { cam.aspect = W / H; cam.clearViewOffset(); }
  cam.position.copy(cs.pos); cam.lookAt(cs.tgt);
  cam.updateProjectionMatrix(); cam.updateMatrixWorld();
}
// The closest camera at the tray pitch that keeps the tray, its plaque and the ticker inside the space under the HUD.
function boardFit() {
  const T = R.T, sinP = Math.sin(BOARD_PITCH), cosP = Math.cos(BOARD_PITCH), v = new T.Vector3();
  const pts = [[-5.05, 0.45, 5.6], [5.05, 0.45, 5.6], [-5.05, 0.4, -4.8], [5.05, 0.4, -4.8], [-4.95, 1.35, -6.35], [4.95, 1.35, -6.35]];
  const SAFE = { x1: 4, x2: W - 4, y1: HUD_H + 4, y2: H - 6 };
  function bounds(tx, tz, d) {
    applyCam({ pos: new T.Vector3(tx, d * sinP, tz + d * cosP), tgt: new T.Vector3(tx, 0, tz), fov: BOARD_FOV, off: 0 });
    let x1 = 1e9, x2 = -1e9, y1 = 1e9, y2 = -1e9;
    for (let i = 0; i < pts.length; i++) {
      v.set(pts[i][0], pts[i][1], pts[i][2]).project(R.camera);
      const px = (v.x * 0.5 + 0.5) * W, py = (-v.y * 0.5 + 0.5) * H;
      x1 = Math.min(x1, px); x2 = Math.max(x2, px); y1 = Math.min(y1, py); y2 = Math.max(y2, py);
    }
    return { x1: x1, x2: x2, y1: y1, y2: y2 };
  }
  function centered(d) {
    let tx = 0, tz = 0, bb = null;
    const ppu = H / (2 * d * Math.tan(BOARD_FOV * Math.PI / 360));
    for (let n = 0; n < 8; n++) {
      bb = bounds(tx, tz, d);
      tx += ((bb.x1 + bb.x2) / 2 - (SAFE.x1 + SAFE.x2) / 2) / ppu;
      tz += ((bb.y1 + bb.y2) / 2 - (SAFE.y1 + SAFE.y2) / 2) / (ppu * sinP);
    }
    return { tx: tx, tz: tz, d: d, bb: bounds(tx, tz, d) };
  }
  let lo = 8, hi = 120, best = null;
  for (let n = 0; n < 18; n++) {
    const mid = (lo + hi) / 2, c = centered(mid);
    if (c.bb.x2 - c.bb.x1 <= SAFE.x2 - SAFE.x1 && c.bb.y2 - c.bb.y1 <= SAFE.y2 - SAFE.y1) { best = c; hi = mid; } else lo = mid;
  }
  best = best || centered(120);
  return camState([best.tx, best.d * sinP, best.tz + best.d * cosP], [best.tx, 0, best.tz], BOARD_FOV, 0);
}
function viewGoal(v) {
  if (v === "board") return R.boardCam;
  if (v === "shop") return R.shopCam;
  return R.titleCam;
}
function camTo(v) {
  if (!R) return;
  if (!R.cam) { R.view = v; R.cam = cloneCam(viewGoal(v)); R.camT = 1; return; }
  R.camFrom = cloneCam(R.cam); R.view = v; R.camT = 0;
}
function cloneCam(c) { return { pos: c.pos.clone(), tgt: c.tgt.clone(), fov: c.fov, off: c.off }; }
function cellToScreen(r, c, h) {
  if (!R) return { x: W / 2, y: H / 2 };
  R.v.set(c - 3.5, GEM_Y + (h || 0), r - 3.5).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H };
}
function worldToScreen(x, y, z) {
  R.v.set(x, y, z).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z < 1 };
}
// HUD pixel -> board cell (null off the tray)
function screenToCell(px, py) {
  if (!R) return null;
  const cam = R.camera;
  R.v.set(px / W * 2 - 1, 1 - py / H * 2, 0.5).unproject(cam);
  R.v2.copy(R.v).sub(cam.position);
  if (R.v2.y > -1e-6) return null;
  const t = (GEM_Y - cam.position.y) / R.v2.y, x = cam.position.x + R.v2.x * t, z = cam.position.z + R.v2.z * t;
  const c = Math.floor(x + 4), r = Math.floor(z + 4);
  if (r < 0 || r >= N || c < 0 || c >= N) return null;
  return { r: r, c: c };
}

/* ---------------- Gem meshes ---------------- */
function addGemMesh(g) {
  const T = R.T, grp = new T.Group();
  const m = new T.Mesh(g.sp === SP_PRISM ? R.prismGeo : R.geos[g.t], g.sp === SP_PRISM ? R.prismMat : R.gemMats[g.t]);
  m.castShadow = true;
  grp.add(m); grp.userData.gem = m;
  g.mesh = grp;
  dressGem(g);
  R.gemRoot.add(grp);
  placeGem(g, 0);
}
function removeGemMesh(g) { if (g.mesh && g.mesh.parent) g.mesh.parent.remove(g.mesh); }
function dressGem(g) {
  const T = R.T, grp = g.mesh;
  if (!grp) return;
  if (grp.userData.deco) { grp.remove(grp.userData.deco); grp.userData.deco = null; }
  if (!g.sp) return;
  const d = new T.Group();
  if (g.sp === SP_ROW || g.sp === SP_COL) {
    [-0.13, 0.13].forEach(function (o) { const b = new T.Mesh(R.barGeo, R.barMat); b.position.set(0, 0.27, o); d.add(b); });
    if (g.sp === SP_COL) d.rotation.y = Math.PI / 2;
    const gl = new T.Sprite(new T.SpriteMaterial({ map: R.tGlow, color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false, blending: T.AdditiveBlending }));
    gl.scale.set(1.3, 1.3, 1); d.add(gl);
  } else if (g.sp === SP_BOMB) {
    const ring = new T.Mesh(R.ringGeo, R.goldMat); ring.rotation.x = Math.PI / 2 - 0.4; d.add(ring); d.userData.ring = ring;
    const gl = new T.Sprite(new T.SpriteMaterial({ map: R.tGlow, color: 0xff8a1e, transparent: true, opacity: 0.7, depthWrite: false, blending: T.AdditiveBlending }));
    gl.scale.set(1.5, 1.5, 1); d.add(gl); d.userData.glow = gl;
  } else if (g.sp === SP_PRISM) {
    const gl = new T.Sprite(new T.SpriteMaterial({ map: R.tGlow, color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, blending: T.AdditiveBlending }));
    gl.scale.set(1.6, 1.6, 1); d.add(gl); d.userData.glow = gl;
  }
  grp.add(d); grp.userData.deco = d;
}
function retypeGem(g) { g.retype = true; }
function applyRetype(g) {
  const m = g.mesh && g.mesh.userData.gem;
  if (!m) return;
  m.geometry = g.sp === SP_PRISM ? R.prismGeo : R.geos[g.t];
  m.material = g.sp === SP_PRISM ? R.prismMat : R.gemMats[g.t];
  g.retype = false;
}
function dropOff(g) { if (R && g.mesh) R.leaving.push({ g: g, vy: 2 + Math.random() * 3, vz: 3 + Math.random() * 3, t: 0, spin: (Math.random() - 0.5) * 12 }); }
function placeGem(g, lift) {
  const m = g.mesh;
  m.position.set(g.x - 3.5, GEM_Y + g.y + (lift || 0), g.z - 3.5);
}
function syncOre() {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const m = R.rocks[r][c], hp = ore[r] ? ore[r][c] : 0;
    m.visible = hp > 0;
    if (hp > 0) m.material = R.rockMats[Math.min(2, hp)];
  }
}
function oreCrack(r, c, delay) { R.fx.push({ kind: "chips", r: r, c: c, t: -delay, life: 0.1 }); }

/* ---------------- Effects ---------------- */
function fxMesh(geo, col, op) {
  const T = R.T, m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: op || 0.9, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
  m.renderOrder = 6; m.visible = false; R.tray.add(m); return m;
}
function fxBeam(r, c, row, delay, t) {
  if (!R) return;
  const m = fxMesh(R.fxGeo, t >= 0 ? GEM_HEX[t] : "#ffffff", 0.95), w = fxMesh(R.fxGeo, "#ffffff", 0.9);
  [m, w].forEach(function (x, i) {
    if (row) x.position.set(0, GEM_Y + 0.35 + i * 0.01, r - 3.5); else { x.position.set(c - 3.5, GEM_Y + 0.35 + i * 0.01, 0); x.rotation.y = Math.PI / 2; }
  });
  R.fx.push({ kind: "beam", m: m, w: w, t: -delay, life: 0.45 });
}
function fxRing(r, c, delay, size) {
  if (!R) return;
  const m = fxMesh(R.ringFx, "#ffb040", 0.9);
  m.position.set(c - 3.5, GEM_Y + 0.3, r - 3.5);
  R.fx.push({ kind: "ring", m: m, t: -delay, life: 0.55, size: size });
}
function fxBolts(src, hits, delay) {
  if (!R) return;
  hits.forEach(function (h, i) {
    const dx = h.c - src.c, dz = h.r - src.r, L = Math.hypot(dx, dz);
    if (L < 0.1) return;
    const m = fxMesh(R.fxGeo, i % 2 ? "#3ff0ff" : "#ffffff", 0.95);
    m.position.set(src.c - 3.5 + dx / 2, GEM_Y + 0.5, src.r - 3.5 + dz / 2);
    m.rotation.y = Math.atan2(-dz, dx); m.scale.set(L, 1, 0.09);
    R.fx.push({ kind: "bolt", m: m, t: -(delay + 0.05 + i * 0.025), life: 0.4 });
  });
}
function emit(x, y, z, hex, n, sp, up, grav) {
  if (!R) return;
  const col = new R.T.Color(hex);
  for (let i = 0; i < n; i++) {
    const p = R.plist[R.pNext]; R.pNext = (R.pNext + 1) % R.plist.length;
    const a = Math.random() * TAU, s = sp * (0.3 + Math.random() * 0.7);
    p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = (up || 2) * (0.4 + Math.random());
    p.max = p.life = 0.5 + Math.random() * 0.5; p.grav = grav == null ? 7 : grav;
    const w = Math.random() < 0.3 ? 1 : 0;
    p.r = w ? 1 : col.r; p.g = w ? 1 : col.g; p.b = w ? 1 : col.b;
  }
}
function sparkleClear() { /* each gem bursts as its own clear begins (see syncGems) */ }
function fireworks() {
  if (!R || Shell.reduced) return;
  for (let k = 0; k < 6; k++) {
    const x = (Math.random() - 0.5) * 7, z = (Math.random() - 0.5) * 7;
    R.fx.push({ kind: "burst", x: x, z: z, t: -k * 0.28, life: 0.1, col: GEM_HEX[k % NCOL] });
  }
}
function keeperDo(act) { if (R) { R.keeper.act = act; R.keeper.actT = 0; } }
function buildUp(id, t) {
  if (!R) return;
  const b = R.B[id];
  b.pop[t] = 0.001;
  R.poof = { id: id, t: 0 };
}

/* ---------------- State -> meshes, every frame ---------------- */
function smooth(e) { return e * e * (3 - 2 * e); }
function syncScene(state, fdt) {
  const T = R.T, clock = (R.clock += fdt);
  ledTick(fdt);
  /* camera */
  const view = state === "title" ? "title" : state === "over" ? "titleOver" : R.view;
  let goal = viewGoal(view === "titleOver" ? "title" : view);
  if (view === "title" || view === "titleOver") {
    goal = cloneCam(goal);
    if (!Shell.reduced) { goal.pos.x += Math.sin(idleT * 0.22) * 22; goal.tgt.x += Math.sin(idleT * 0.22) * 6; }
  }
  if (R.camT < 1 && R.camFrom && state !== "title") {
    R.camT = Math.min(1, R.camT + fdt / (Shell.reduced ? 0.2 : 1.15));
    const e = smooth(R.camT), arc = Math.sin(Math.PI * e) * (Shell.reduced ? 0 : 1);
    R.cam.pos.lerpVectors(R.camFrom.pos, goal.pos, e); R.cam.tgt.lerpVectors(R.camFrom.tgt, goal.tgt, e);
    R.cam.pos.y += arc * 18;
    R.cam.fov = R.camFrom.fov + (goal.fov - R.camFrom.fov) * e; R.cam.off = R.camFrom.off + (goal.off - R.camFrom.off) * e;
  } else {
    const k = 1 - Math.exp(-4 * fdt);
    R.cam.pos.lerp(goal.pos, k); R.cam.tgt.lerp(goal.tgt, k);
    R.cam.fov += (goal.fov - R.cam.fov) * k; R.cam.off += (goal.off - R.cam.off) * k;
  }
  const cs = cloneCam(R.cam);
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    cs.pos.x += (Math.random() * 2 - 1) * m; cs.pos.y += (Math.random() * 2 - 1) * m; cs.tgt.x += (Math.random() * 2 - 1) * m * 0.5;
  }
  applyCam(cs);

  syncGems(state, fdt, clock);
  syncFx(fdt);
  syncParticles(fdt);
  syncShop(state, fdt, clock);
  syncKeeper(fdt, clock);
}

function syncGems(state, dt, clock) {
  const live = state === "playing";
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const g = grid[r] && grid[r][c];
    if (!g || !g.mesh) continue;
    const m = g.mesh, gm = m.userData.gem;
    let s = 1, lift = ore[g.r] && ore[g.r][g.c] > 0 && Math.abs(g.z - g.r) < 0.05 ? ORE_LIFT : 0, rot = g.spin + Math.sin(clock * 0.8 + g.spin) * 0.35;
    if (g.z < -0.2) s *= clamp((g.z + 1.2) / 1.0, 0, 1);                      // pouring in over the back rail
    if (g.dying && live) {
      const t = (S.modeT - g.delay) / 0.24;
      if (t > 0) {
        if (!g.burst) {
          g.burst = true;
          emit(g.c - 3.5, GEM_Y + 0.3, g.r - 3.5, g.sp === SP_PRISM ? "#ffffff" : GEM_HEX[g.t], Shell.reduced ? 4 : 9, 3.2, 3);
          if (S.chain >= 1 && Math.random() < 0.35) Juke.sfx("land");
        }
        s *= t < 0.35 ? 1 + t * 1.1 : Math.max(0, 1.38 * (1 - (t - 0.35) / 0.65));
        rot += t * 6;
      }
    }
    if (g.born > 0) { g.born = Math.max(0, g.born - dt * 2.6); s *= 1 + Math.sin((1 - g.born) * Math.PI) * 0.5; }
    if (g.land > 0) g.land = Math.max(0, g.land - dt * 5);
    if (g.shuf && S.mode === "shuffle") {
      const u = clamp(S.modeT / 0.8, 0, 1);
      g.y = Math.sin(u * Math.PI) * 1.4; rot += u * TAU * 2;
      if (u > 0.5 && g.retype) applyRetype(g);
      if (u >= 1) { g.shuf = 0; g.y = 0; }
    } else if (g.retype) applyRetype(g);
    let bob = 0, ox = 0, oz = 0;
    if (S.sel && S.sel.r === g.r && S.sel.c === g.c && live) { bob = 0.16 + Math.sin(clock * 7) * 0.05; rot = clock * 2.2; }
    if (S.hint && live && S.mode === "play") {
      const hn = S.hint;
      if ((hn[0] === g.r && hn[1] === g.c) || (hn[2] === g.r && hn[3] === g.c)) {
        const other = hn[0] === g.r && hn[1] === g.c ? [hn[2], hn[3]] : [hn[0], hn[1]];
        const w = Math.max(0, Math.sin(clock * 9)) * 0.12;
        ox = (other[1] - g.c) * w; oz = (other[0] - g.r) * w; bob += w * 0.6;
      }
    }
    if (g.sp === SP_PRISM) rot = clock * 1.6 + g.spin;
    m.position.set(g.x - 3.5 + ox, GEM_Y + g.y + lift + bob, g.z - 3.5 + oz);
    m.scale.set(s, s * (1 - 0.28 * g.land), s);
    gm.rotation.y = rot;
    if (g.sp === SP_PRISM) gm.rotation.x = clock * 0.9;
    const d = m.userData.deco;
    if (d) {
      if (d.userData.ring) d.userData.ring.rotation.z = clock * 2.4;
      if (d.userData.glow) d.userData.glow.material.opacity = 0.45 + 0.3 * Math.sin(clock * 6 + g.spin);
      if (g.sp === SP_ROW || g.sp === SP_COL) R.barMat.opacity = 0.65 + 0.35 * Math.sin(clock * 8);
    }
  }
  // the last level's gems sliding off the front of the tray
  for (let i = R.leaving.length - 1; i >= 0; i--) {
    const L = R.leaving[i], m = L.g.mesh;
    L.t += dt; L.vy -= 22 * dt;
    m.position.y += L.vy * dt; m.position.z += L.vz * dt; m.rotation.x += L.spin * dt;
    if (L.t > 1.4) { removeGemMesh(L.g); R.leaving.splice(i, 1); }
  }
  // selection, cursor and hint frames
  const sel = live && S.sel && S.mode === "play";
  R.selMesh.visible = !!sel;
  if (sel) { R.selMesh.position.set(S.sel.c - 3.5, 0.03 + (ore[S.sel.r][S.sel.c] ? 0.2 : 0), S.sel.r - 3.5); R.selMesh.scale.setScalar(1 + Math.sin(clock * 8) * 0.04); }
  R.curMesh.visible = live && S.kb && S.mode === "play";
  if (R.curMesh.visible) R.curMesh.position.set(S.cur.c - 3.5, 0.04 + (ore[S.cur.r][S.cur.c] ? 0.2 : 0), S.cur.r - 3.5);
  const hn = live && S.hint && S.mode === "play" ? S.hint : null;
  R.hintA.visible = R.hintB.visible = !!hn;
  if (hn) {
    const op = 0.4 + 0.4 * Math.sin(clock * 6);
    R.hintA.position.set(hn[1] - 3.5, 0.03 + (ore[hn[0]][hn[1]] ? 0.2 : 0), hn[0] - 3.5); R.hintB.position.set(hn[3] - 3.5, 0.03 + (ore[hn[2]][hn[3]] ? 0.2 : 0), hn[2] - 3.5);
    R.hintA.material.opacity = R.hintB.material.opacity = op;
  }
  // a twinkle hopping from gem to gem
  for (let i = 0; i < R.twinkles.length; i++) {
    const tw = R.twinkles[i];
    tw.t -= dt;
    if (tw.t <= 0) {
      tw.t = 0.9 + Math.random() * 1.6;
      const r = ri(N), c = ri(N), g = grid[r] && grid[r][c];
      tw.g = g && !g.dying ? g : null; tw.age = 0;
      tw.dx = (Math.random() - 0.5) * 0.3; tw.dz = (Math.random() - 0.5) * 0.3;
    }
    tw.age = (tw.age || 0) + dt;
    const g = tw.g, on = g && g.mesh && !Shell.reduced;
    tw.sp.visible = !!on;
    if (on) {
      const k = Math.sin(clamp(tw.age / 0.6, 0, 1) * Math.PI);
      tw.sp.position.set(g.mesh.position.x + tw.dx, g.mesh.position.y + 0.22, g.mesh.position.z + tw.dz);
      tw.sp.scale.setScalar(0.55 * k); tw.sp.material.rotation = clock * 2;
    }
  }
}

function syncFx(dt) {
  for (let i = R.fx.length - 1; i >= 0; i--) {
    const f = R.fx[i];
    f.t += dt;
    if (f.t < 0) continue;
    const u = f.t / f.life;
    if (f.kind === "beam") {
      f.m.visible = f.w.visible = true;
      const k = Math.sin(Math.min(1, u) * Math.PI);
      f.m.scale.set(9.6, 1, 0.9 * k); f.w.scale.set(9.6, 1, 0.28 * k);
      f.m.material.opacity = 0.9 * (1 - u); f.w.material.opacity = 1 - u;
    } else if (f.kind === "ring") {
      f.m.visible = true; f.m.scale.setScalar(0.3 + u * f.size); f.m.material.opacity = 0.9 * (1 - u);
    } else if (f.kind === "bolt") {
      f.m.visible = true; f.m.material.opacity = (1 - u) * (0.6 + 0.4 * Math.random()); f.m.scale.z = 0.05 + Math.random() * 0.08;
    } else if (f.kind === "chips") {
      if (!f.done) { f.done = true; emit(f.c - 3.5, 0.3, f.r - 3.5, "#a07a50", 10, 2.6, 3, 10); Juke.sfx("land"); }
    } else if (f.kind === "burst") {
      if (!f.done) { f.done = true; emit(f.x, 2.5, f.z, f.col, 26, 4.5, 2.5, 3); }
    }
    if (u >= 1) {
      if (f.m) { f.m.parent.remove(f.m); f.m.material.dispose(); }
      if (f.w) { f.w.parent.remove(f.w); f.w.material.dispose(); }
      R.fx.splice(i, 1);
    }
  }
}
function syncParticles(dt) {
  const P = R.plist, pos = R.pPos, col = R.pCol;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    if (p.life > 0) {
      p.life -= dt; p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 0.97; p.vz *= 0.97;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; }
    }
    const k = p.life > 0 ? clamp(p.life / p.max, 0, 1) : 0;
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.life > 0 ? p.y : -99; pos[i * 3 + 2] = p.z;
    col[i * 3] = p.r * k; col[i * 3 + 1] = p.g * k; col[i * 3 + 2] = p.b * k;
  }
  R.pGeo.attributes.position.needsUpdate = true; R.pGeo.attributes.color.needsUpdate = true;
}

function syncShop(state, dt, clock) {
  const showAll = state === "title";
  const onTray = state !== "title" && state !== "over" && R.view === "board" && R.camT >= 1;
  for (const id in R.B) R.B[id].g.visible = !onTray;
  R.keeper.root.visible = !onTray; R.bigLed.visible = !onTray;
  for (let k = 0; k < BUILD.length; k++) {
    const id = BUILD[k].id, b = R.B[id], t = showAll ? 3 : tier(id);
    for (let j = 0; j <= 3; j++) {
      const on = j === 0 ? t === 0 : t >= j;
      const grp = b.tiers[j];
      grp.visible = on;
      if (on && b.pop[j] > 0) {
        b.pop[j] = Math.min(1, b.pop[j] + dt * 1.8);
        const e = b.pop[j], s = e < 1 ? 1 + Math.sin(e * Math.PI) * 0.25 - (1 - e) * 0.6 : 1;
        grp.scale.setScalar(Math.max(0.01, s));
        if (e >= 1) { b.pop[j] = 0; grp.scale.setScalar(1); }
      }
    }
    for (let i = 0; i < b.spin.length; i++) {
      const sp = b.spin[i];
      sp.m.rotation[sp.axis] += sp.speed * dt;
    }
  }
  const vt = showAll ? 3 : tier("vault"), vb = R.B.vault;
  const goalA = vt >= 2 ? -1.75 : 0;
  vb.hinge.rotation.y += (goalA - vb.hinge.rotation.y) * Math.min(1, dt * 2.5);
  vb.wheel.rotation.z = clock * (vt >= 2 ? 0 : 0.4);
  const bl = R.B.sign.bulbs, step = Math.floor(clock * 6);
  if (bl.visible !== false && step !== R.bulbStep) {
    R.bulbStep = step;
    if (!R.cOn) { R.cOn = new R.T.Color(0xffffff); R.cOff = new R.T.Color(0xffb020); }
    for (let i = 0; i < R.B.sign.bulbN; i++) bl.setColorAt(i, ((i + step) % 3 === 0) && !Shell.reduced ? R.cOn : R.cOff);
    bl.instanceColor.needsUpdate = true;
  }
  // the bell on the counter, and the till drawer popping on a purchase
  R.dome.position.y = 0.3 - Math.max(0, R.bellT || 0) * 0.25;
  if (R.bellT > 0) R.bellT -= dt * 4;
  R.drawer.position.z = 0.3 + Math.max(0, R.drawerT || 0) * 2.4;
  if (R.drawerT > 0) R.drawerT -= dt * 0.8;
}

// The jeweler leans on the counter, breathes, looks around; waves when you buy, throws two thumbs up on a clear.
function syncKeeper(dt, clock) {
  const K2 = R.keeper, P = K2.P;
  K2.actT += dt;
  let w = 0, act = K2.act;
  if (act) {
    const dur = act === "wave" ? 2.0 : 2.2;
    w = Math.min(1, K2.actT / 0.25) * Math.min(1, Math.max(0, (dur - K2.actT) / 0.35));
    if (K2.actT > dur) { K2.act = null; w = 0; }
    if (act === "wave" && K2.actT < dt * 1.5) R.drawerT = 1;
  }
  const br = Math.sin(clock * 1.7) * 0.012;
  P.chest.scale.set(1 + br, 1, 1 + br * 1.5);
  P.head.rotation.y = Math.sin(clock * 0.37) * 0.35 + (act ? 0.25 * w : 0);
  P.head.rotation.x = 0.12 + Math.sin(clock * 0.53) * 0.05 - (act === "cheer" ? 0.2 * w : 0);
  K2.body.rotation.x = 0.06 * (1 - w);
  K2.body.position.y = act === "cheer" ? Math.abs(Math.sin(K2.actT * 9)) * 0.6 * w : 0;
  P.arms.forEach(function (a) {
    const s = a.s;
    // leaning on the counter
    let shX = -0.2, shZ = s * 0.16, elX = -1.18, elZ = 0, wrX = -0.3, curl = 0.25, thumb = 0;
    const raise = (act === "cheer") || (act === "wave" && s === -1);
    if (raise && w > 0) {
      const up = act === "cheer" ? { shX: -0.25, shZ: s * 2.55, elX: -0.25, elZ: s * 0.35, wrX: 0, curl: 1.45, thumb: 1 }
                                 : { shX: -0.2, shZ: s * 2.3, elX: -0.15, elZ: s * (0.25 + 0.38 * Math.sin(K2.actT * 11)), wrX: 0, curl: 0, thumb: 0 };
      shX += (up.shX - shX) * w; shZ += (up.shZ - shZ) * w; elX += (up.elX - elX) * w; elZ += (up.elZ - elZ) * w; wrX += (up.wrX - wrX) * w;
      curl += (up.curl - curl) * w; thumb = up.thumb * w;
    }
    a.sh.rotation.set(shX, 0, shZ);
    a.el.rotation.set(elX, 0, elZ);
    a.wr.rotation.set(wrX, 0, 0);
    a.fingers.forEach(function (f) { f.a.rotation.x = curl; f.b.rotation.x = curl * 0.9; });
    a.th.rotation.x = -thumb * 1.2;
  });
}

/* ---------------- Update (game logic, only while playing) ---------------- */
function stepFall(dt) {
  let moving = false;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const g = grid[r][c];
    if (!g) continue;
    g.x = g.c;
    if (g.z < g.r - 1e-4) {
      g.vz += 44 * dt; g.z += g.vz * dt;
      if (g.z >= g.r) { g.z = g.r; g.vz = 0; g.land = 1; Juke.sfx("land"); }
      else moving = true;
    } else { g.z = g.r; g.vz = 0; }
  }
  return moving;
}
function update(dt) {
  S.t += dt; S.modeT += dt;
  const clockOn = S.timed && (S.mode === "play" || S.mode === "swap" || S.mode === "clear" || S.mode === "fall" || S.mode === "shuffle");
  if (clockOn && S.time > 0) {
    S.time = Math.max(0, S.time - dt);
    const sec = Math.ceil(S.time);
    if (sec <= 10 && sec !== S.lastTick && sec > 0) { S.lastTick = sec; Juke.sfx("tick"); }
  }
  if (S.mode === "intro") {
    if (!S.introShown) {
      S.introShown = true;
      const g = S.goals[0];
      const what = g.k === "score" ? "Score " + commas(g.n) : g.k === "ore" ? "Break every rock slab" : g.k === "make" ? "Make " + g.n + " " + g.sp + " gem" + (g.n > 1 ? "s" : "")
        : "Collect " + g.n + " " + GEM_PLURAL[g.t].toLowerCase();
      const more = S.goals.length > 1 ? " and more" : "";
      Shell.flash("LEVEL " + (S.level + 1) + ": " + S.def.name.toUpperCase(), what + more + (S.timed ? " in " + S.time + " seconds." : " in " + S.moves + " moves."), "#ffd23f", 1700);
      Juke.sfx("level");
    }
    const moving = stepFall(dt);
    if (!moving && S.modeT > 1.1) { S.mode = "play"; S.modeT = 0; S.idle = 0; S.introShown = false; }
  } else if (S.mode === "play") {
    S.idle += dt;
    if (S.idle > 5 && !S.hint) S.hint = findMove();
    if (S.timed && S.time <= 0) settle();
  } else if (S.mode === "swap") {
    const sw = S.swap;
    sw.t += dt / 0.17;
    const e = smooth(Math.min(1, sw.t));
    [sw.a, sw.b].forEach(function (g, i) {
      const fr = i === 0 ? sw.b : sw.a;                      // each gem moves from the other's cell to its own
      const fx = fr.c, fz = fr.r;
      g.x = fx + (g.c - fx) * e; g.z = fz + (g.r - fz) * e;
      g.y = Math.sin(e * Math.PI) * (i === 0 ? 0.35 : 0.08);
    });
    if (sw.t >= 1) { sw.a.x = sw.a.c; sw.a.z = sw.a.r; sw.b.x = sw.b.c; sw.b.z = sw.b.r; sw.a.y = sw.b.y = 0; swapLanded(); }
  } else if (S.mode === "clear") {
    if (S.modeT >= S.clearEnd) finishClear();
  } else if (S.mode === "fall") {
    if (!stepFall(dt) && S.modeT > 0.05) settle();
  } else if (S.mode === "shuffle") {
    if (S.modeT > 0.85) { S.mode = "play"; S.modeT = 0; S.idle = 0; }
  } else if (S.mode === "won") {
    if (S.modeT > 2.7) openShop();
  }
  for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += dt; if (pops[i].t > 1.1) pops.splice(i, 1); }
  if (S.shop && S.shop.flash) { S.shop.flash.t += dt; if (S.shop.flash.t > 0.6) S.shop.flash = null; }
}

/* ---------------- Input ---------------- */
let hits = [];                                             // HUD buttons drawn this frame: { x, y, w, h, fn }
function hitTest(x, y) {
  for (let i = hits.length - 1; i >= 0; i--) { const b = hits[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b; }
  return null;
}
function pointer(type, x, y) {
  if (type === "down") {
    Juke.unlock();
    S.kbShop = false;
    const b = hitTest(x, y);
    if (b) { S.drag = null; b.fn(); return; }
    if (S.mode === "shop" && R) {                            // ring the bell on the counter
      const p = worldToScreen(12, TOP_Y + 1, -6.5);
      if (Math.hypot(p.x - x, p.y - y) < 18) {
        R.bellT = 1; Juke.sfx("bell");
        if (++S.bellTaps >= 5 && window.Trophies) Trophies.unlock("gs-bell");
      }
      return;
    }
    if (S.mode !== "play") return;
    const cell = screenToCell(x, y);
    S.kb = false;
    if (!cell) { S.sel = null; return; }
    S.drag = { r: cell.r, c: cell.c, x: x, y: y, moved: false };
    S.idle = 0;
  } else if (type === "move" && S.drag && !S.drag.moved) {
    const dx = x - S.drag.x, dy = y - S.drag.y;
    if (Math.hypot(dx, dy) > 16) {
      S.drag.moved = true;
      const d = S.drag;
      if (Math.abs(dx) > Math.abs(dy)) trySwap(d.r, d.c, d.r, d.c + (dx > 0 ? 1 : -1));
      else trySwap(d.r, d.c, d.r + (dy > 0 ? 1 : -1), d.c);
    }
  } else if ((type === "up" || type === "cancel") && S.drag) {
    const d = S.drag; S.drag = null;
    if (type === "cancel" || d.moved || S.mode !== "play") return;
    tapCell(d.r, d.c);
  }
}
function tapCell(r, c) {
  const s = S.sel;
  if (s && s.r === r && s.c === c) { S.sel = null; return; }
  if (s && Math.abs(s.r - r) + Math.abs(s.c - c) === 1) { trySwap(s.r, s.c, r, c); return; }
  S.sel = { r: r, c: c }; S.idle = 0;
  Juke.sfx("select");
}
function key(type, code, e) {
  if (type !== "down") { keys[code] = false; return; }
  keys[code] = true;
  if (e.repeat && (code === "Space" || code === "Enter" || code === "NumpadEnter")) return;
  const act = code === "Space" || code === "Enter" || code === "NumpadEnter";
  const dir = code === "ArrowUp" ? [-1, 0] : code === "ArrowDown" ? [1, 0] : code === "ArrowLeft" ? [0, -1] : code === "ArrowRight" ? [0, 1] : null;
  if (S.mode === "shop") {
    S.kbShop = true;
    if (dir && dir[0]) S.shop.pick = (S.shop.pick + dir[0] + BUILD.length + 1) % (BUILD.length + 1);
    if (act) { if (S.shop.pick < BUILD.length) buy(S.shop.pick); else nextLevel(); }
    return;
  }
  if (S.mode === "fail") {
    S.kb = true;
    if (dir && dir[1] && S.fail.can) S.fail.pick = S.fail.pick ? 0 : 1;
    if (act) { if (S.fail.pick === 0) buyContinue(); else cashOut(); }
    return;
  }
  if (S.mode !== "play") return;
  S.kb = true; S.idle = 0;
  if (dir) {
    if (S.sel && S.sel.r === S.cur.r && S.sel.c === S.cur.c) {
      const r2 = S.sel.r + dir[0], c2 = S.sel.c + dir[1];
      if (r2 >= 0 && r2 < N && c2 >= 0 && c2 < N) { S.cur = { r: r2, c: c2 }; trySwap(S.sel.r, S.sel.c, r2, c2); }
      return;
    }
    S.cur = { r: clamp(S.cur.r + dir[0], 0, N - 1), c: clamp(S.cur.c + dir[1], 0, N - 1) };
  }
  if (act) tapCell(S.cur.r, S.cur.c);
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
// The six cuts as flat icons, so goals read at a glance.
function gemIcon(c, t, x, y, r) {
  c.save(); c.translate(x, y);
  c.beginPath();
  if (t === 0) c.arc(0, 0, r, 0, TAU);
  else if (t === 1) c.ellipse(0, 0, r * 1.05, r * 0.8, 0, 0, TAU);
  else if (t === 2) { c.moveTo(0, r * 0.95); c.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.7, -r * 1.25, 0, -r * 0.45); c.bezierCurveTo(r * 0.7, -r * 1.25, r * 1.4, -r * 0.1, 0, r * 0.95); }
  else if (t === 3) { const a = r * 0.95, b = r * 0.75, k = r * 0.3; c.moveTo(-a + k, -b); c.lineTo(a - k, -b); c.lineTo(a, -b + k); c.lineTo(a, b - k); c.lineTo(a - k, b); c.lineTo(-a + k, b); c.lineTo(-a, b - k); c.lineTo(-a, -b + k); }
  else if (t === 4) { c.moveTo(0, -r); c.lineTo(r * 0.95, r * 0.7); c.lineTo(-r * 0.95, r * 0.7); }
  else { c.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); }
  c.closePath();
  const gr = c.createLinearGradient(0, -r, 0, r);
  gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.35, GEM_HEX[t]); gr.addColorStop(1, shade(GEM_HEX[t], -0.45));
  c.fillStyle = gr; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = "rgba(20,0,40,.8)"; c.stroke();
  c.restore();
}
function coinIcon(c, x, y, r) {
  const gr = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
  gr.addColorStop(0, "#fff6b0"); gr.addColorStop(0.6, "#ffc22a"); gr.addColorStop(1, "#c07a0a");
  c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.lineWidth = 1.2; c.strokeStyle = "#7a4a00"; c.stroke();
  c.fillStyle = "#a86a00"; c.font = "bold " + Math.round(r * 1.2) + "px " + HUD_FONT; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("$", x, y + 0.5);
}
function bar(c, x, y, w, h, f, col) {
  rrect(c, x, y, w, h, h / 2); c.fillStyle = "rgba(10,0,30,.7)"; c.fill();
  if (f > 0) { rrect(c, x, y, Math.max(h, w * clamp(f, 0, 1)), h, h / 2); c.fillStyle = col; c.fill(); }
}
function goalLabel(g, i) {
  if (g.k === "score") return commas(Math.min(S.prog[i], g.n)) + "/" + commas(g.n);
  if (g.k === "ore") return (S.oreTotal - oreLeft()) + "/" + S.oreTotal;
  return Math.min(S.prog[i], g.n) + "/" + g.n;
}
function drawGoal(c, g, i, x, y, w) {
  let f;
  if (g.k === "collect") gemIcon(c, g.t, x + 9, y + 9, 7.5);
  else if (g.k === "ore") { rrect(c, x + 2, y + 2, 15, 15, 3); c.fillStyle = "#7a5a3e"; c.fill(); c.strokeStyle = "#2a1404"; c.lineWidth = 1.5; c.stroke(); c.fillStyle = "#ffd65a"; c.fillRect(x + 6, y + 7, 2, 2); c.fillRect(x + 11, y + 11, 2, 2); }
  else if (g.k === "make") {
    if (g.sp === "prism") { const gr = c.createLinearGradient(x, y, x + 18, y + 18); gr.addColorStop(0, "#ff4fc0"); gr.addColorStop(0.5, "#3fe0ff"); gr.addColorStop(1, "#ffd23f"); c.fillStyle = gr; c.beginPath(); c.moveTo(x + 9, y); c.lineTo(x + 18, y + 9); c.lineTo(x + 9, y + 18); c.lineTo(x, y + 9); c.fill(); }
    else if (g.sp === "bomb") { c.fillStyle = "#ff8a1e"; c.beginPath(); c.arc(x + 9, y + 10, 7, 0, TAU); c.fill(); c.strokeStyle = "#ffd23f"; c.lineWidth = 2; c.stroke(); }
    else { c.fillStyle = "#3ff0ff"; c.fillRect(x + 1, y + 5, 17, 3); c.fillRect(x + 1, y + 11, 17, 3); }
  } else { txt(c, "PTS", x, y + 4, 8, "#ffe45c"); }
  f = g.k === "ore" ? 1 - oreLeft() / Math.max(1, S.oreTotal) : S.prog[i] / g.n;
  const done = f >= 1;
  txt(c, done ? "DONE" : goalLabel(g, i), x + 21, y + 1, g.k === "score" ? 9 : 11, done ? "#9bff3f" : "#ffffff", "left", "#1a0030");
  bar(c, x + 21, y + 14, w - 23, 5, f, done ? "#9bff3f" : "#ffd23f");
}
function drawHUD(c, state) {
  const bg = c.createLinearGradient(0, 0, 0, HUD_H);
  bg.addColorStop(0, "#a02ad0"); bg.addColorStop(0.55, "#6a14a8"); bg.addColorStop(1, "#3a0a6a");
  c.fillStyle = bg; c.fillRect(0, 0, W, HUD_H);
  c.fillStyle = "rgba(255,255,255,.18)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ffbf2e"; c.fillRect(0, HUD_H, W, 2);
  c.fillStyle = "#ff4fc0"; c.fillRect(0, HUD_H + 2, W, 1);
  // level
  rrect(c, 5, 5, 96, 40, 6); c.fillStyle = "rgba(20,0,45,.55)"; c.fill();
  txt(c, "LEVEL " + (S.level + 1), 11, 9, 11, "#ffe45c", "left", "#1a0030");
  let nm = S.def ? S.def.name : "";
  c.font = "bold 9px " + HUD_FONT;
  while (nm.length > 4 && c.measureText(nm).width > 84) nm = nm.slice(0, -2) + ".";
  txt(c, nm, 11, 26, 9, "#ffffff", "left", "#1a0030");
  // goals
  rrect(c, 105, 5, 152, 40, 6); c.fillStyle = "rgba(20,0,45,.55)"; c.fill();
  if (S.goals) {
    const gs = S.goals;
    if (gs.length === 1) drawGoal(c, gs[0], 0, 111, 15, 140);
    else gs.forEach(function (g, i) { drawGoal(c, g, i, 111 + i * 74, 15, 68); });
    txt(c, "GOAL", 181, 6, 7, "#d9b6ff", "center");
  }
  // moves / time
  rrect(c, 261, 5, 94, 40, 6); c.fillStyle = "rgba(20,0,45,.55)"; c.fill();
  if (S.timed) {
    const tt = Math.ceil(S.time), low = tt <= 10 && state === "playing";
    txt(c, "TIME", 308, 7, 8, "#d9b6ff", "center");
    const flash = low && Math.floor(S.t * 4) % 2 === 0;
    txt(c, Math.floor(tt / 60) + ":" + ("0" + (tt % 60)).slice(-2), 308, 18, 22, flash ? "#ff4b3e" : low ? "#ffb0a8" : "#ffffff", "center", "#1a0030");
  } else {
    txt(c, "MOVES", 308, 7, 8, "#d9b6ff", "center");
    txt(c, String(S.moves), 308, 18, 22, S.moves <= 3 && state === "playing" ? "#ff8a7a" : "#ffffff", "center", "#1a0030");
  }
  // score and coins
  txt(c, "SCORE", 8, 51, 8, "#d9b6ff");
  txt(c, commas(S.score || 0), 46, 49, 12, "#ffffff", "left", "#1a0030");
  coinIcon(c, 280, 56, 6.5);
  txt(c, commas(S.coins || 0), 290, 49, 12, "#ffe45c", "left", "#1a0030");
  if (S.chain >= 2 && (S.mode === "clear" || S.mode === "fall")) txt(c, S.chain + "X", 200, 49, 12, "#3ff0ff", "center", "#1a0030");
}
function drawPops(c) {
  for (let i = 0; i < pops.length; i++) {
    const p = pops[i], u = p.t / 1.1;
    c.globalAlpha = Math.max(0, 1 - u * u);
    const size = p.big ? 22 : 14, y = p.y - u * 34;
    c.font = "900 " + size + "px " + HUD_FONT; c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round";
    c.lineWidth = 4; c.strokeStyle = "#2a0838"; c.strokeText(p.txt, p.x, y);
    c.fillStyle = p.col; c.fillText(p.txt, p.x, y);
  }
  c.globalAlpha = 1;
}
function button(c, x, y, w, h, label, col, on, fn, sub) {
  rrect(c, x, y, w, h, 7);
  const gr = c.createLinearGradient(0, y, 0, y + h);
  if (on) { gr.addColorStop(0, shade(col, 0.35)); gr.addColorStop(1, shade(col, -0.25)); } else { gr.addColorStop(0, "#4a4458"); gr.addColorStop(1, "#2a2436"); }
  c.fillStyle = gr; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = on ? "#ffffff" : "#6a6478"; c.stroke();
  txt(c, label, x + w / 2, y + (sub ? 4 : h / 2 - 6), 11, on ? "#1a0030" : "#a8a2b6", "center");
  if (sub) txt(c, sub, x + w / 2, y + h - 14, 9, on ? "#2a0838" : "#8a8498", "center");
  hits.push({ x: x, y: y, w: w, h: h, fn: fn });
}
function drawShop(c) {
  const x0 = 8, y0 = 292, w = W - 16, h = H - y0 - 6;
  rrect(c, x0, y0, w, h, 12); c.fillStyle = "rgba(24,6,48,.93)"; c.fill();
  c.lineWidth = 2; c.strokeStyle = "#ffbf2e"; c.stroke();
  txt(c, "LEVEL " + (S.level + 1) + " CLEAR!", x0 + 12, y0 + 7, 13, "#9bff3f", "left", "#000");
  for (let i = 0; i < 3; i++) {
    const sx = x0 + 186 + i * 20, sy = y0 + 15, on = i < S.stars;
    c.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 3.6 : 8.5; c.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); }
    c.closePath(); c.fillStyle = on ? "#ffd23f" : "#3a3048"; c.fill();
  }
  txt(c, "+" + S.lvCoins + " coins" + (S.interest ? " (" + S.interest + " interest)" : ""), x0 + 12, y0 + 25, 9, "#d9b6ff");
  coinIcon(c, x0 + w - 70, y0 + 17, 8);
  txt(c, commas(S.coins), x0 + w - 58, y0 + 10, 14, "#ffe45c", "left", "#000");
  txt(c, "UPGRADE THE SHOP", x0 + w / 2, y0 + 38, 9, "#ffbf2e", "center");
  const rowH = 30;
  BUILD.forEach(function (b, i) {
    const y = y0 + 50 + i * rowH, t = tier(b.id), max = t >= 3, cost = max ? 0 : b.cost[t], can = !max && S.coins >= cost;
    const pick = S.shop && S.shop.pick === i && S.kbShop;
    rrect(c, x0 + 6, y, w - 12, rowH - 4, 6); c.fillStyle = pick ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.05)"; c.fill();
    if (S.shop && S.shop.flash && S.shop.flash.i === i) { c.fillStyle = "rgba(255,60,60," + (0.5 * (1 - S.shop.flash.t / 0.6)) + ")"; c.fill(); }
    c.fillStyle = b.col; rrect(c, x0 + 11, y + 5, 6, rowH - 14, 3); c.fill();
    txt(c, b.name, x0 + 23, y + 3, 10, "#ffffff");
    for (let k = 0; k < 3; k++) { c.fillStyle = k < t ? b.col : "#3a3048"; c.beginPath(); c.arc(x0 + 27 + k * 10, y + 20, 3.4, 0, TAU); c.fill(); }
    txt(c, max ? "Fully built" : "Next: " + b.fx[t], x0 + 60, y + 16, 8, "#c8b8e0", "left", null, "normal");
    if (max) txt(c, "MAX", x0 + w - 44, y + 8, 11, b.col, "center");
    else button(c, x0 + w - 82, y + 3, 74, rowH - 8, String(cost), can ? "#ffd23f" : "#555", can, (function (k) { return function () { buy(k); }; })(i));
    if (!max) coinIcon(c, x0 + w - 70, y + 3 + (rowH - 8) / 2, 5);
  });
  const by = y0 + 50 + BUILD.length * rowH + 3;
  button(c, x0 + 6, by, w - 12, H - 10 - by, "OPEN LEVEL " + (S.level + 2) + " >", "#9bff3f", true, nextLevel);
  if (S.shop && S.kbShop && S.shop.pick === BUILD.length) { rrect(c, x0 + 4, by - 2, w - 8, H - 6 - by, 8); c.strokeStyle = "#ffffff"; c.lineWidth = 2; c.stroke(); }
}
function drawFail(c) {
  const f = S.fail, x0 = 24, y0 = 214, w = W - 48, h = 150;
  rrect(c, x0, y0, w, h, 12); c.fillStyle = "rgba(24,6,48,.95)"; c.fill();
  c.lineWidth = 2; c.strokeStyle = "#ff4b3e"; c.stroke();
  txt(c, f.why, W / 2, y0 + 14, 17, "#ff8a7a", "center", "#000");
  const what = S.timed ? "20 more seconds" : "5 more moves";
  txt(c, f.can ? "Buy " + what + " for " + f.cost + " coins?" : S.conts >= CONT_COST.length ? "No more extensions on this level." : "Not enough coins for " + what + ".", W / 2, y0 + 44, 10, "#ffffff", "center");
  txt(c, "Goal: " + Math.round(goalFrac() * 100) + "% done.  Coins: " + S.coins, W / 2, y0 + 62, 9, "#c8b8e0", "center", null, "normal");
  if (f.can) button(c, x0 + 12, y0 + 88, w / 2 - 18, 46, S.timed ? "+20 SEC" : "+5 MOVES", "#ffd23f", true, buyContinue, f.cost + " coins");
  button(c, f.can ? x0 + w / 2 + 6 : x0 + 40, y0 + 88, f.can ? w / 2 - 18 : w - 80, 46, "CASH OUT", "#ff4fc0", true, cashOut, "End the run");
  if (S.kb) {
    const bx = f.pick === 0 ? x0 + 12 : (f.can ? x0 + w / 2 + 6 : x0 + 40), bw = f.can ? w / 2 - 18 : w - 80;
    rrect(c, bx - 3, y0 + 85, bw + 6, 52, 9); c.strokeStyle = "#ffffff"; c.lineWidth = 2; c.stroke();
  }
}
function draw(c, state) {
  if (!R || !R.hud) return;
  const now = performance.now();
  let ms = now - R.lastT;
  R.lastT = now;
  if (!(ms > 0)) ms = 0;
  const sized = layout();
  Juke.pump();
  if (state === "paused" && !R.dirty) return;
  if (state === "playing") watchFrameRate(ms);
  if (sized) {
    syncScene(state, state === "paused" ? 0 : Math.min(ms, 50) / 1000);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  hits = [];
  c.clearRect(-24, -24, W + 48, H + 48);
  if (state === "playing" || state === "paused") {
    drawPops(c);
    drawHUD(c, state);
    if (S.mode === "shop") drawShop(c);
    if (S.mode === "fail" && S.fail) drawFail(c);
  }
}

/* ---------------- Splash, boot, shell hookup ---------------- */
function makeSplash() {
  const el = document.createElement("div");
  el.id = "npg-splash";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Nostalgia Pro Games");
  el.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;z-index:9999;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;gap:18px;padding:24px;box-sizing:border-box;text-align:center;" +
    "background:radial-gradient(circle at 50% 42%,#7a1fa8 0%,#3a0a6a 52%,#12032a 100%);" +
    "font:bold 15px/1.5 " + HUD_FONT.replace(/"/g, "'") + ";color:#ffffff;opacity:1;transition:opacity .35s ease";
  const img = document.createElement("img");
  img.alt = "";
  img.decoding = "async";
  img.style.cssText = "display:block;width:min(66vw,44vh,340px);height:auto;opacity:0;transform:scale(.86);" +
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "transition:opacity .2s ease" : "transition:opacity .28s ease,transform .55s cubic-bezier(.2,1.5,.4,1)");
  el.appendChild(img);
  const cap = document.createElement("div");
  cap.textContent = "GEM SHOP";
  cap.style.cssText = "font:900 22px/1 " + HUD_FONT.replace(/"/g, "'") + ";letter-spacing:4px;color:#ffe45c;text-shadow:0 3px 0 #2a0838";
  el.appendChild(cap);
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
  if (crt) crt.style.display = "none";                       // glossy shop, no scanlines
  R.lastT = performance.now();
  layout();
}
function logoImg(maxW) {
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
  im.style.cssText = "display:block;width:" + maxW + ";height:auto;margin:0 auto 6px";
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_URL;
  return im;
}
function startGame() {
  Shell.init({
    slug: "gem-shop",
    title: "GEM SHOP",
    accent: "#ff4fc0",
    width: W, height: H,
    format: function (n) { return commas(n) + " PTS"; },
    howTo: "A match-three in real 3D. Swipe a gem into its neighbor, or tap one then the other, to line up three or more. Clear each level's goal, then spend your coins building up the shop.",
    keys: "Keys: arrows move, Space picks a gem, then an arrow swaps it. P pause, M mute, N music, R restart.",
    tip: "Four in a row makes a line gem, an L or T makes a bomb, five makes a prism.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { if (paused) return; idleT += dt; },
    onPause: function () { paused = true; keys = {}; S.drag = null; },
    onResume: function () { paused = false; }
  });
  attach();
  // Sound: nothing is created until the first tap, click or key press; the music starts with the game.
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Juke.unlock, true); });
  Shell.onStart(Juke.newGame); Shell.onRestart(Juke.newGame); Shell.onResume(Juke.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Juke.toggleMusic();
  });
  Juke.barButton();
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) {
    Juke.button(titleCard, titleCard.querySelector(".np-tip"));
    titleCard.insertBefore(logoImg("clamp(72px,16vh,120px)"), titleCard.firstChild);  // the full logo heads the title card
  }
  if (pauseActions) Juke.button(pauseActions, pauseActions.querySelector("a"));
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) card.insertBefore(logoImg("clamp(64px,14vh,104px)"), card.firstChild);   // and the score card
}

// Hook for automated checks (no effect on play)
window.__gemShop = { S: function () { return S; }, grid: function () { return grid; }, ore: function () { return ore; }, findGroups: findGroups, findMove: findMove,
  trySwap: trySwap, gfx: function () { return R; }, led: function () { return LED; }, juke: Juke, levelDef: levelDef, BUILD: BUILD,
  openShop: openShop, buy: buy, levelWon: levelWon, levelFailed: levelFailed, startLevel: startLevel, startMusic: startMusic,
  setGem: function (r, c, t, sp) { const g = grid[r][c]; g.t = t; g.sp = sp || 0; if (R) { applyRetype(g); dressGem(g); } } };

(function boot() {
  const splash = makeSplash();
  const t0 = performance.now();
  const q = /[?&]gfx=(high|low)/.exec(location.search);
  Promise.all([loadLogo(splash), import(THREE_URL).then(null, function (e) { e.npStage = "three"; throw e; }), loadImage(SCRIPT_URL)])
    .then(function (res) {
      THREE = res[1];
      try {
        R = buildScene(THREE, res[2]);
        R.boardCam = boardFit();
        R.shopCam = camState(SHOP_CAM.pos, SHOP_CAM.tgt, SHOP_CAM.fov, SHOP_CAM.off);
        R.titleCam = camState([0, 58, 150], [0, 4, -58], 50, 0);
      } catch (e) { e.npStage = "webgl"; throw e; }
      if (q) { R.qLock = true; setQuality(q[1] === "low" ? QUALITY.length - 1 : 0); }
      reset();
      R.cam = cloneCam(R.titleCam); R.camT = 1;
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
        ? "Gem Shop could not load its 3D engine (" + THREE_URL + ")."
        : "Gem Shop needs WebGL for its 3D shop, and this browser has it switched off or does not support it.");
    });
})();
