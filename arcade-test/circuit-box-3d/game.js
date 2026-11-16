/* CIRCUIT BOX (3D): a wiring puzzle in a snap-together electronics kit. Plug it in, power it up.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of input, scaling and the title / pause / game over flow, and carries the HUD.

   The board is a grid of COLS x ROWS sockets. Every level puts a power source and one or more
   things that need power on the board, plus walls, spills and other fixed parts. The player drags
   parts out of a limited tray, then flips the breaker. Power is worked out by a small event
   simulation (simulate() below) that knows how electricity, light, wind, spinning gears and
   magnetism get from one part to the next, and when. The 3D board plays that out over time.
   A cell (c, r) sits in three.js space at x = (c - 3) * CELL, z = (r - 3.5) * CELL. North is -z. */

const W = 360, H = 540, TAU = Math.PI * 2;
const COLS = 7, ROWS = 8, CELL = 10;
const HUD_TOP = 58, TRAY_Y = 446;                         // the canvas HUD: a top band and the parts tray
const CAM_FOV = 30, CAM_PITCH = 57 * Math.PI / 180;
const SAFE = { x1: 4, x2: W - 4, y1: HUD_TOP + 3, y2: TRAY_Y - 4 };   // where the box and its lid have to fit on screen

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash and score card only
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every decal inside the box
const THREE_URL = "../shared/three.module.min.js";
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';
const CANDY_FONT = '"Arial Black", "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
const CONF_COLS = ["#ffd23f", "#3ff0ff", "#ff3fa4", "#9bff3f", "#ff9214", "#ffffff"];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function idx(c, r) { return r * COLS + c; }
function inGrid(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }
const DC = [0, 1, 0, -1], DR = [-1, 0, 1, 0];            // N E S W

/* SIM START */
/* ---------------- Parts ----------------
   cond   carries electricity on to its neighbors (wires, sources)
   src    makes electricity (plug, battery; solar, turbine and dynamo once they are fed light, wind or spin)
   cons   takes power from a live neighbor but does NOT pass it on (lamps, fans, motors, magnets, the things to switch on)
   beam   what a light beam does in this cell: pass, mirror, absorb (lit) or stop
   wind   what moving air does in this cell: pass, catch (a turbine) or stop
   rot    how many ways it can face (tap to turn) */
const PT = {
  wire:     { cond: 1, beam: "pass", wind: "pass", flat: 1 },
  plug:     { cond: 1, src: 1 },
  battery:  { cond: 1, src: 1 },
  sw:       { beam: "pass", wind: "pass", flat: 1, sw: 1 },
  reed:     { beam: "pass", wind: "pass", flat: 1, reed: 1 },
  solar:    { cond: 1, beam: "absorb" },
  turbine:  { cond: 1, wind: "catch" },
  dynamo:   { cond: 1, spinIn: 1 },
  lamp:     { cons: 1, rot: 4 },
  fan:      { cons: 1, rot: 4 },
  motor:    { cons: 1 },
  gear:     { spin: 1 },
  magnet:   { cons: 1 },
  mirror:   { rot: 2, beam: "mirror" },
  tv:       { cons: 1, target: "power" },
  boombox:  { cons: 1, target: "power" },
  arcade:   { cons: 1, target: "power" },
  lava:     { cons: 1, target: "power" },
  calc:     { target: "light", beam: "absorb" },
  turntable:{ target: "spin", spinIn: 1 },
  alarm:    { cons: 1, alarm: 1 },
  block:    { terrain: 1 },
  puddle:   { terrain: 1, beam: "pass", wind: "pass", flat: 1 },
  glass:    { terrain: 1, beam: "pass" },
  grate:    { terrain: 1, wind: "pass" }
};
// What the player can carry in the tray, in tray order.
const TOOLS = ["wire", "battery", "lamp", "mirror", "solar", "fan", "turbine", "motor", "gear", "dynamo", "magnet", "reed"];
const NAMES = { wire: "Wire", battery: "Battery", lamp: "Spotlight", mirror: "Mirror", solar: "Solar Panel", fan: "Box Fan", turbine: "Turbine",
  motor: "Motor", gear: "Gear", dynamo: "Dynamo", magnet: "Electromagnet", reed: "Reed Switch", plug: "Power Brick", sw: "Switch",
  tv: "TV", boombox: "Boombox", arcade: "Arcade Cabinet", lava: "Lava Lamp", calc: "Solar Calculator", turntable: "Record Player",
  alarm: "Alarm Clock", block: "Game Boxes", puddle: "Soda Spill", glass: "Glass Block", grate: "Air Vent" };

const FAN_RANGE = 4;
// Delays (seconds): how fast each kind of energy gets from one part to the next. Pure presentation pacing, but the
// order of events follows from them, so they live with the rules.
const DT = { wire: 0.045, cons: 0.06, lampWarm: 0.12, beam: 0.028, solar: 0.32, fanSpin: 0.42, wind: 0.09, turbine: 0.45,
  motor: 0.35, gear: 0.12, dynamo: 0.28, magnet: 0.16 };

/* ---------------- Levels ----------------
   Eight rows of seven cells, far row first. Tokens:
   .  empty socket          #  stacked game boxes (blocks everything)    ~  soda spill (no building; light and air cross it)
   g  glass block (light crosses, air does not)       =  air vent (air crosses, light does not)
   P  power brick   B  battery   w  wire   S  switch (on)   s  switch (off)   r  reed switch
   T  TV   X  boombox   A  arcade cabinet   L  lava lamp   C  solar calculator (needs light)   R  record player (needs spin)
   Z  alarm clock (must stay OFF)
   lamp / fan + facing:  l^ l> lv l<  f^ f> fv f<      mirror: m1 = /   m2 = \
   M motor   o gear   D dynamo   E electromagnet   U turbine   V solar panel
   Anything in the grid is bolted down; the tray (inv) is what the player gets. par = parts for three stars. */
const LEVELS = [
  { name: "Plug and Play", par: 5, inv: { wire: 6 },
    tip: "Drag wires from the tray to connect the power brick to the TV, then hit POWER.",
    grid: ["# . . . . . .",
           ". . . . . . .",
           ". . . . . . .",
           "P . . . . . T",
           ". . . . . . .",
           ". . ~ . . . .",
           ". . . . . . .",
           ". . . . . . #"] },
  { name: "Shelf Detour", par: 9, inv: { wire: 11 },
    tip: "Game boxes are in the way. Go around. Tip: pick a part, then drag across the board to lay a run.",
    grid: [". . . . . . .",
           ". P . . # . .",
           ". . . . # . .",
           "# # # . # . .",
           ". . . . # . .",
           ". # # # # T .",
           ". . . . . . .",
           "~ . . . . . ."] },
  { name: "Double Feature", par: 5, inv: { wire: 7 },
    tip: "One brick, two screens. A wire can branch any way it likes.",
    grid: [". . . . . . .",
           ". T . . . X .",
           ". . . . . . .",
           ". . . . . . .",
           ". . . P . . .",
           ". . . . . . .",
           ". # . ~ . # .",
           ". . . . . . ."] },
  { name: "Pocket Power", par: 2, inv: { battery: 2, wire: 6 },
    tip: "No power brick this time. Batteries are power you can carry.",
    grid: ["# # . . . . .",
           "# A . . . . .",
           "# . . . # # #",
           ". . . . # L #",
           ". . . . . . .",
           ". . ~ ~ . . .",
           ". . . . . . .",
           ". . . . . . #"] },
  { name: "Not a Power Strip", par: 5, inv: { wire: 7 },
    tip: "Gadgets take power but don't pass it along. Wire around the TV to reach the boombox.",
    grid: [". . . . . . .",
           ". . . . . . .",
           ". . . . . . .",
           "# # P T . . X",
           "# # # # # # #",
           ". ~ . . . ~ .",
           ". . . # . . .",
           ". . . . . . ."] },
  { name: "Spotlight", par: 6, inv: { wire: 6, lamp: 1, solar: 1 },
    tip: "You can't build in spilled soda. Shine a spotlight across it onto a solar panel. Tap a spotlight to turn it.",
    grid: [". . . . . . .",
           ". P . . . . .",
           ". . . . . . .",
           "~ ~ ~ ~ ~ ~ ~",
           "~ ~ ~ ~ ~ ~ ~",
           ". . . . . . .",
           ". . . . . T .",
           ". . . . . . ."] },
  { name: "Mirror, Mirror", par: 2, inv: { lamp: 1, mirror: 2, wire: 2 },
    tip: "The calculator runs on light. Bounce the beam off a mirror. Tap a mirror to flip it.",
    grid: ["# # # # # # #",
           "# . . . . C #",
           "# . # # # # #",
           "# . . . . . .",
           "P . . . . . .",
           ". . . . . . .",
           ". . ~ . . . .",
           ". . . . . . ."] },
  { name: "Box Fan", par: 3, inv: { fan: 1, turbine: 1, wire: 3 },
    tip: "A powered fan blows four cells. Wind spins a turbine, and a spinning turbine makes power.",
    grid: [". . . . . . .",
           ". . P . . . .",
           ". . . . . . .",
           "~ ~ ~ ~ ~ ~ ~",
           "~ ~ ~ ~ ~ ~ ~",
           ". . . . . . .",
           ". . . . . . .",
           ". X . . . . ."] },
  { name: "Gear Head", par: 5, inv: { motor: 1, gear: 4, wire: 2 },
    tip: "A powered motor turns the gears next to it. Gears turn gears. Spin the record.",
    grid: [". . . . . . .",
           ". P . . . . .",
           ". . # # # . .",
           ". . # R # . .",
           ". . . . # . .",
           ". . . . . . .",
           ". ~ . . . . .",
           ". . . . . . ."] },
  { name: "Clean Room", par: 7, inv: { motor: 1, dynamo: 1, wire: 6 },
    tip: "Only the bolted gear gets through the wall. A dynamo turns spin back into power.",
    grid: [". . . . . . .",
           ". P . . . . .",
           ". . . . . . .",
           "# # # o # # #",
           ". . . . . . .",
           ". . . . . . .",
           ". . . . . A .",
           ". . . . . . ."] },
  { name: "Magnet Relay", par: 5, inv: { magnet: 1, wire: 6 },
    tip: "The reed switch closes when a powered electromagnet sits next to it.",
    grid: [". . . . . . .",
           ". P . . . . .",
           ". . . . . . .",
           ". . . . . . .",
           "# # # . # # #",
           "# B w r w X #",
           "# # # # # # #",
           ". . ~ . . . ."] },
  { name: "Don't Wake Dad", par: 7, inv: { wire: 9 },
    tip: "If that alarm clock gets power, the whole house wakes up. Tap a switch to flip it.",
    grid: [". . . . . . .",
           ". . . . . . .",
           "P w S w w Z .",
           ". . . . . . .",
           ". . . . . . .",
           ". . . . . . .",
           ". . . . . T .",
           ". . . . . . ."] },
  { name: "Bank Shot", par: 3, inv: { lamp: 1, mirror: 3, wire: 4 },
    tip: "Light goes straight through glass. Two bounces should do it.",
    grid: ["# # # # # # #",
           "# C g . . . #",
           "# g # # # . #",
           "# # # . . . #",
           ". . # . # . .",
           ". . . . . . .",
           "P . . . . . .",
           ". . . . . . ."] },
  { name: "Wind Tunnel", par: 5, inv: { fan: 1, turbine: 1, lamp: 1, solar: 1, wire: 4 },
    tip: "Air goes through a vent but light doesn't. Light goes through glass but air doesn't.",
    grid: [". . P . . . .",
           ". . . . . . .",
           "= = = = = = =",
           ". . . . . . .",
           "g g g g g g g",
           ". . . . . . .",
           ". . . . . . .",
           ". . . . . T ."] },
  { name: "Night Shift", par: 6, inv: { magnet: 1, wire: 7 },
    tip: "Keep the alarm quiet, close the reed switch, and get the arcade running too.",
    grid: [". . . . . . .",
           "P w w S w Z .",
           ". . . . . . .",
           ". . . . . . A",
           "# # # . # # #",
           "# B w r w L #",
           "# # # # # # #",
           ". . . ~ . . ."] },
  { name: "Power Strip", par: 12, inv: { wire: 13, battery: 1 },
    tip: "Four corners, one brick, one battery. Make every wire count.",
    grid: ["T . . . . . X",
           ". . . . . . .",
           ". . # . # . .",
           ". . . P . . .",
           ". . # . # . .",
           ". . . . . . .",
           ". . . . . . .",
           "A . . . . . L"] },
  { name: "Rube Goldberg", par: 11, inv: { wire: 8, motor: 1, gear: 2, dynamo: 1, fan: 1, turbine: 1, lamp: 1, solar: 1, mirror: 1 },
    tip: "Power to spin, spin to power, power to wind, wind to power, power to light, light to power.",
    grid: ["P . . # . . .",
           ". . . o . . .",
           "# # # # . . .",
           ". . . g = = =",
           "A . . g . . .",
           ". . . g . . .",
           ". . . g . . .",
           ". . L g . . ."] },
  { name: "Lights Out, Game On", par: 10, inv: { wire: 4, motor: 1, gear: 4, dynamo: 1, magnet: 1, lamp: 1, mirror: 2 },
    tip: "Everything you've learned, and nobody can wake up. Good luck.",
    grid: ["P w S w Z # #",
           ". . . . . # #",
           "# # # o # # #",
           "R . . . # # #",
           ". . . . ~ # #",
           "g g g r w B #",
           "C . . T # # #",
           ". . . . # # #"] }
];

const TOKEN = { ".": null, "#": "block", "~": "puddle", "g": "glass", "=": "grate", "P": "plug", "B": "battery", "w": "wire",
  "S": "sw", "s": "sw", "r": "reed", "T": "tv", "X": "boombox", "A": "arcade", "L": "lava", "C": "calc", "R": "turntable", "Z": "alarm",
  "l": "lamp", "f": "fan", "m": "mirror", "M": "motor", "o": "gear", "D": "dynamo", "E": "magnet", "U": "turbine", "V": "solar" };
const DIRCH = { "^": 0, ">": 1, "v": 2, "<": 3, "1": 0, "2": 1 };

function parseLevel(L) {
  const cells = new Array(COLS * ROWS).fill(null);
  for (let r = 0; r < ROWS; r++) {
    const toks = L.grid[r].trim().split(/\s+/);
    for (let c = 0; c < COLS; c++) {
      const tk = toks[c] || ".", t = TOKEN[tk[0]];
      if (!t) continue;
      cells[idx(c, r)] = { t: t, d: tk.length > 1 ? DIRCH[tk[1]] || 0 : 0, on: tk[0] !== "s", fixed: true };
    }
  }
  return cells;
}

/* ---------------- The simulation ----------------
   Everything is worked out ahead of time as a list of moments: when each wire goes live, when each gadget gets
   power, when each beam front reaches each cell, and so on. Things only ever switch on (a reed switch closing can
   join two circuits, a solar panel starting up adds a source), so a simple time-ordered event queue finds the first
   moment each thing happens. The 3D board just plays the answer back. */
function conducts(cells, i, magT, t) {
  const o = cells[i];
  if (!o) return false;
  const p = PT[o.t];
  if (p.cond) return true;
  if (p.sw) return !!o.on;
  if (p.reed) return magT[i] != null && magT[i] <= t + 1e-9;
  return false;
}
function electric(o) {                                     // anything a wire would reach out and connect to
  if (!o) return false;
  const p = PT[o.t];
  return !!(p.cond || p.sw || p.reed || p.cons);
}

// Mirror turns: "/" (d = 0) sends N<->E and S<->W; "\" (d = 1) sends N<->W and S<->E.
function reflect(dir, m) {
  if (m === 0) return [1, 0, 3, 2][dir];
  return [3, 2, 1, 0][dir];
}

function traceBeam(cells, c, r, dir) {
  // Returns the cells the beam enters, in order, each with what it does there.
  const out = [];
  let x = c, y = r, d = dir;
  for (let n = 0; n < 80; n++) {
    x += DC[d]; y += DR[d];
    if (!inGrid(x, y)) { out.push({ c: x, r: y, k: "edge", d: d }); break; }
    const o = cells[idx(x, y)], b = o ? PT[o.t].beam || "stop" : "pass";
    if (b === "pass") { out.push({ c: x, r: y, k: "pass", d: d }); continue; }
    if (b === "mirror") { const nd = reflect(d, o.d); out.push({ c: x, r: y, k: "mirror", d: d, nd: nd }); d = nd; continue; }
    if (b === "absorb") { out.push({ c: x, r: y, k: "hit", d: d }); break; }
    out.push({ c: x, r: y, k: "stop", d: d }); break;
  }
  return out;
}
function traceWind(cells, c, r, dir) {
  const out = [];
  let x = c, y = r;
  for (let n = 1; n <= FAN_RANGE; n++) {
    x += DC[dir]; y += DR[dir];
    if (!inGrid(x, y)) { out.push({ c: x, r: y, k: "edge" }); break; }
    const o = cells[idx(x, y)], w = o ? PT[o.t].wind || "stop" : "pass";
    if (w === "pass") { out.push({ c: x, r: y, k: "pass" }); continue; }
    out.push({ c: x, r: y, k: w === "catch" ? "hit" : "stop" });
    break;
  }
  return out;
}

function simulate(cells) {
  const N = COLS * ROWS;
  const R = { eT: new Array(N).fill(null), pT: new Array(N).fill(null), litT: new Array(N).fill(null), spinT: new Array(N).fill(null),
              windT: new Array(N).fill(null), windFrom: new Array(N).fill(0), magT: new Array(N).fill(null), srcT: new Array(N).fill(null),
              beams: [], winds: [], end: 0, cues: [] };
  const q = [];
  function push(t, k, i, x) {
    let lo = 0, hi = q.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (q[m].t <= t) lo = m + 1; else hi = m; }
    q.splice(lo, 0, { t: t, k: k, i: i, x: x });
  }
  for (let i = 0; i < N; i++) { const o = cells[i]; if (o && PT[o.t].src) push(0, "src", i); }
  let guard = 0;
  while (q.length && guard++ < 20000) {
    const ev = q.shift(), t = ev.t, i = ev.i, o = cells[i], c = i % COLS, r = (i / COLS) | 0;
    if (ev.k === "src") {
      if (R.srcT[i] != null) continue;
      R.srcT[i] = t; push(t, "e", i);
    } else if (ev.k === "e") {
      if (R.eT[i] != null || !conducts(cells, i, R.magT, t)) continue;
      R.eT[i] = t;
      for (let d = 0; d < 4; d++) {
        const nc = c + DC[d], nr = r + DR[d];
        if (!inGrid(nc, nr)) continue;
        const n = idx(nc, nr), no = cells[n];
        if (!no) continue;
        const np = PT[no.t];
        if (np.cond || np.sw || np.reed) push(t + DT.wire, "e", n);
        else if (np.cons) push(t + DT.cons, "p", n);
      }
    } else if (ev.k === "mag") {
      if (R.magT[i] != null) continue;
      R.magT[i] = t;
      for (let d = 0; d < 4; d++) {                       // a live neighbor feeds the reed the moment it closes
        const nc = c + DC[d], nr = r + DR[d];
        if (inGrid(nc, nr) && R.eT[idx(nc, nr)] != null) { push(t + DT.wire, "e", i); break; }
      }
      R.cues.push({ t: t, k: "reed", i: i });
    } else if (ev.k === "p") {
      if (R.pT[i] != null) continue;
      R.pT[i] = t;
      const ty = o.t;
      if (ty === "lamp") {
        const path = traceBeam(cells, c, r, o.d), t0 = t + DT.lampWarm;
        path.forEach(function (s, k) {
          s.t = t0 + (k + 1) * DT.beam;
          if (s.k === "hit") push(s.t, "lit", idx(s.c, s.r));
        });
        R.beams.push({ i: i, t0: t0, path: path });
        R.cues.push({ t: t0, k: "beam", i: i });
      } else if (ty === "fan") {
        const path = traceWind(cells, c, r, o.d), t0 = t + DT.fanSpin;
        path.forEach(function (s, k) {
          s.t = t0 + (k + 1) * DT.wind;
          if (s.k === "hit") { const n = idx(s.c, s.r); R.windFrom[n] = (o.d + 2) % 4; push(s.t, "wind", n); }
        });
        R.winds.push({ i: i, t0: t0, path: path, d: o.d });
        R.cues.push({ t: t + 0.05, k: "fan", i: i });
      } else if (ty === "motor") {
        push(t + DT.motor, "spin", i);
      } else if (ty === "magnet") {
        for (let d = 0; d < 4; d++) {
          const nc = c + DC[d], nr = r + DR[d];
          if (!inGrid(nc, nr)) continue;
          const n = idx(nc, nr);
          if (cells[n] && PT[cells[n].t].reed) push(t + DT.magnet, "mag", n);
        }
        R.cues.push({ t: t, k: "magnet", i: i });
      } else if (PT[ty].target) R.cues.push({ t: t, k: "target", i: i });
      else if (ty === "alarm") R.cues.push({ t: t, k: "alarm", i: i });
    } else if (ev.k === "lit") {
      if (R.litT[i] != null) continue;
      R.litT[i] = t;
      if (o.t === "solar") { push(t + DT.solar, "src", i); R.cues.push({ t: t, k: "solar", i: i }); }
      else if (PT[o.t].target) R.cues.push({ t: t, k: "target", i: i });
    } else if (ev.k === "wind") {
      if (R.windT[i] != null) continue;
      R.windT[i] = t;
      push(t + DT.turbine, "src", i);
      R.cues.push({ t: t, k: "turbine", i: i });
    } else if (ev.k === "spin") {
      if (R.spinT[i] != null) continue;
      R.spinT[i] = t;
      if (o.t === "dynamo") { push(t + DT.dynamo, "src", i); R.cues.push({ t: t, k: "dynamo", i: i }); continue; }
      if (o.t === "turntable") { R.cues.push({ t: t, k: "target", i: i }); continue; }
      R.cues.push({ t: t, k: "gear", i: i });
      for (let d = 0; d < 4; d++) {                       // motors and gears turn the gears beside them
        const nc = c + DC[d], nr = r + DR[d];
        if (!inGrid(nc, nr)) continue;
        const n = idx(nc, nr), no = cells[n];
        if (no && (no.t === "gear" || PT[no.t].spinIn)) push(t + DT.gear, "spin", n);
      }
    }
    if (t > R.end) R.end = t;
  }
  R.targets = []; R.alarm = null;
  for (let i = 0; i < N; i++) {
    const o = cells[i];
    if (!o) continue;
    const p = PT[o.t];
    if (p.target) R.targets.push({ i: i, t: p.target === "power" ? R.pT[i] : p.target === "light" ? R.litT[i] : R.spinT[i] });
    if (p.alarm && R.pT[i] != null && (!R.alarm || R.pT[i] < R.alarm.t)) R.alarm = { i: i, t: R.pT[i] };
  }
  R.ok = !R.alarm && R.targets.length > 0 && R.targets.every(function (x) { return x.t != null; });
  R.cues.sort(function (a, b) { return a.t - b.t; });
  return R;
}
/* SIM END */

/* ---------------- Game state ---------------- */
let S = {}, keys = {}, idleT = 0, parts = [], paused = false;
let THREE = null, R = null;                              // R holds everything the renderer owns
let PROG = null;                                         // saved progress: best score, stars and clears per level
let pendingGo = null;                                    // level to open on the next reset (the score card's NEXT LEVEL)
let firstTryRow = 0;

const PROG_KEY = "npArcade.circuit-box.progress";        // the same key Shell.save("progress") would use
function loadProgress() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PROG_KEY) || "null"); } catch (e) { p = null; }
  if (!p || !Array.isArray(p.best) || !Array.isArray(p.stars)) p = { best: [], stars: [], last: 0 };
  for (let i = 0; i < LEVELS.length; i++) { if (typeof p.best[i] !== "number") p.best[i] = 0; if (typeof p.stars[i] !== "number") p.stars[i] = 0; }
  return p;
}
function saveProgress() { try { localStorage.setItem(PROG_KEY, JSON.stringify(PROG)); } catch (e) { /* private mode */ } }
function totalScore() { let s = 0; for (let i = 0; i < LEVELS.length; i++) s += PROG.best[i] || 0; return s; }
function totalStars() { let s = 0; for (let i = 0; i < LEVELS.length; i++) s += PROG.stars[i] || 0; return s; }
function cleared(i) { return (PROG.stars[i] || 0) > 0; }
function unlocked(i) { return i === 0 || cleared(i - 1) || cleared(i); }

function reset() {
  paused = false;
  if (!PROG) PROG = loadProgress();
  const go = pendingGo; pendingGo = null;
  const mid = S && S.level != null && (S.mode === "build" || S.mode === "run");
  if (go != null) openLevel(go);
  else if (mid) openLevel(S.level);                       // R (restart) in the middle of a level: start that level over
  else openSelect();
}

function openSelect() {
  const keep = S && S.level != null ? S.level : (PROG ? clamp(PROG.last || 0, 0, LEVELS.length - 1) : 0);
  S = { mode: "select", level: keep, cells: parseLevel(LEVELS[keep]), inv: {}, sel: null, pick: keep, t: 0, runT: 0, sim: null,
        runs: 0, result: null, drag: null, press: null, cursor: { c: 3, r: 4 }, kb: false, hover: -1, hoverOk: false, tray: [], hint: "" };
  parts.length = 0;
  if (R) sceneLevel();
  ledPlay([]);
}

function openLevel(n) {
  n = clamp(n, 0, LEVELS.length - 1);
  const L = LEVELS[n];
  S = { mode: "build", level: n, cells: parseLevel(L), inv: {}, sel: null, pick: n, t: 0, runT: 0, sim: null, runs: 0, result: null,
        drag: null, press: null, cursor: { c: 3, r: 4 }, kb: false, hover: -1, hoverOk: false, tray: [], hint: L.tip, clearT: 0, failT: 0,
        cueN: 0, lit: {}, stars: 0, score: 0, tipShown: 0 };
  for (const k in L.inv) S.inv[k] = L.inv[k];
  S.tray = TOOLS.filter(function (k) { return L.inv[k] > 0; });
  if (S.tray.length === 1) S.sel = S.tray[0];             // one kind of part: it is already in hand
  parts.length = 0;
  PROG.last = n; saveProgress();
  if (R) sceneLevel();
  ledPlay([ledMsg("slide", "LEVEL " + (n + 1), 1.4, { color: "cyan" }), ledMsg("slide", L.name.toUpperCase(), 2.6, { color: "yellow" })]);
  Sound.cue("open");
}

function usedParts() { let n = 0; for (let i = 0; i < S.cells.length; i++) if (S.cells[i] && !S.cells[i].fixed) n++; return n; }
function invTotal() { const L = LEVELS[S.level]; let n = 0; for (const k in L.inv) n += L.inv[k]; return n; }
function starsFor(used, par) { return used <= par ? 3 : used <= par + 2 ? 2 : 1; }

/* ---------------- Building ---------------- */
function canBuild(i) { return i >= 0 && i < S.cells.length && !S.cells[i]; }
function place(type, i, d) {
  if (!canBuild(i) || !(S.inv[type] > 0)) return false;
  S.cells[i] = { t: type, d: d != null ? d : defaultDir(type), on: true, fixed: false };
  S.inv[type]--;
  if (S.sel === type && S.inv[type] <= 0) S.sel = null;
  if (R) scenePart(i, true);
  Sound.cue("place", type);
  return true;
}
function defaultDir(type) {
  if (type === "lamp" || type === "fan") return S.lastDir && S.lastDir[type] != null ? S.lastDir[type] : 0;
  if (type === "mirror") return S.lastDir && S.lastDir.mirror != null ? S.lastDir.mirror : 0;
  return 0;
}
function takeBack(i) {
  const o = S.cells[i];
  if (!o || o.fixed) return false;
  S.cells[i] = null;
  S.inv[o.t] = (S.inv[o.t] || 0) + 1;
  if (R) scenePart(i, false);
  Sound.cue("pick");
  return true;
}
function move(from, to) {
  const o = S.cells[from];
  if (!o || o.fixed || from === to || !canBuild(to)) return false;
  S.cells[to] = o; S.cells[from] = null;
  if (R) { sceneMove(from, to); }
  Sound.cue("place", o.t);
  return true;
}
function rotate(i) {
  const o = S.cells[i];
  if (!o || o.fixed || !PT[o.t].rot) return false;
  o.d = (o.d + 1) % PT[o.t].rot;
  S.lastDir = S.lastDir || {}; S.lastDir[o.t] = o.d;
  if (R) sceneRotate(i);
  Sound.cue("rotate");
  return true;
}
function toggleSwitch(i) {
  const o = S.cells[i];
  if (!o || o.t !== "sw") return false;
  o.on = !o.on;
  Sound.cue("switch", o.on);
  if (S.mode === "run") restartRun();
  return true;
}
function clearBoard() {
  for (let i = 0; i < S.cells.length; i++) if (S.cells[i] && !S.cells[i].fixed) { S.inv[S.cells[i].t]++; S.cells[i] = null; if (R) scenePart(i, false); }
  Sound.cue("pick");
}

/* ---------------- Power ---------------- */
function powerOn() {
  if (S.mode !== "build") return;
  S.mode = "run"; S.runs++; S.tipShown = 1;
  restartRun();
  Sound.cue("breaker", true);
  ledPlay([ledMsg("flash", "POWER ON", 1.2)]);
}
function restartRun() {
  S.sim = simulate(S.cells); S.runT = 0; S.cueN = 0; S.result = null; S.failT = 0; S.lit = {};
}
function powerOff(quiet) {
  if (S.mode !== "run") return;
  S.mode = "build"; S.sim = null; S.result = null;
  if (!quiet) Sound.cue("breaker", false);
  ledPlay([]);
}

function targetName(i) { return NAMES[S.cells[i].t]; }

function runCue(cu) {
  const o = S.cells[cu.i];
  if (!o) return;
  if (cu.k === "target") {
    S.lit[cu.i] = 1;
    const p = cellToScreen(cu.i, 7);
    burst(p.x, p.y, Shell.reduced ? 8 : 22);
    Sound.cue("target", o.t);
    const on = S.sim.targets.filter(function (x) { return x.t != null && x.t <= S.runT + 1e-6; }).length;
    const label = { tv: "TV ON!", boombox: "PUMP IT UP!", arcade: "INSERT COIN!", lava: "GROOVY!", calc: "LIGHTS UP!", turntable: "NOW SPINNING!" }[o.t] || "ON!";
    ledPlay([ledMsg("slide", label, 1.1, { color: "lime" }), ledMsg("count", "ON", 1.4, { from: on - 1, value: on, suffix: "/" + S.sim.targets.length })]);
  } else if (cu.k === "alarm") {
    Sound.cue("alarm");
  } else Sound.cue(cu.k);
}

function updateRun(dt) {
  const sim = S.sim;
  S.runT += dt;
  while (S.cueN < sim.cues.length && sim.cues[S.cueN].t <= S.runT) runCue(sim.cues[S.cueN++]);
  if (S.result) {
    if (S.result === "fail") S.failT += dt;
    return;
  }
  if (sim.alarm && S.runT >= sim.alarm.t + 0.35) {
    S.result = "fail";
    S.fail = "alarm";
    firstTryRow = 0;
    Shell.flash("RIIING!", "The alarm clock got power and woke up the house. Tap POWER to switch off and rewire.", "#ff4b3e", 2200);
    Shell.shake(4, 0.4); camShake(0.9, 0.5);
    ledPlay([ledMsg("flash", "WAKE-UP CALL!", 1.6, { color: "red" }), ledMsg("blink", "SHHH!", 3, { color: "red" })]);
    return;
  }
  if (S.runT > sim.end + 0.55) {
    if (sim.ok) { startClear(); return; }
    S.result = "fail"; S.fail = "dark";
    firstTryRow = 0;
    const dark = sim.targets.filter(function (x) { return x.t == null; }).map(function (x) { return targetName(x.i); });
    const uniq = dark.filter(function (v, k) { return dark.indexOf(v) === k; });
    Shell.flash("STILL DARK", (uniq.length === 1 ? "The " + uniq[0] + " has" : uniq.length + " things have") + " no power. Tap POWER to switch off and rewire.", "#ff3fa4", 1800);
    Sound.cue("fail");
    ledPlay([ledMsg("blink", "NO JUICE", 2.4, { color: "pink" })]);
  }
}

/* ---------------- Clearing a level ---------------- */
function startClear() {
  const L = LEVELS[S.level], used = usedParts(), stars = starsFor(used, L.par), spare = invTotal() - used, first = S.runs === 1;
  const score = 300 + stars * 250 + spare * 20 + (first ? 200 : 0);
  S.mode = "clear"; S.clearT = 0; S.stars = stars; S.score = score; S.used = used; S.first = first; S.result = "ok";
  const wasNew = !cleared(S.level), prevBest = PROG.best[S.level] || 0;
  if (score > prevBest) PROG.best[S.level] = score;
  if (stars > (PROG.stars[S.level] || 0)) PROG.stars[S.level] = stars;
  saveProgress();
  S.levelBest = PROG.best[S.level]; S.newLevelBest = score > prevBest && prevBest > 0; S.wasNew = wasNew;
  if (first) firstTryRow++; else firstTryRow = 0;
  if (window.NPRewards && firstTryRow >= 2) window.NPRewards.streak(firstTryRow, firstTryRow === 2 ? "2 FIRST TRIES IN A ROW!" : "");
  if (window.Trophies) {
    const T = window.Trophies;
    T.unlock("cb-first");
    if (stars === 3) T.unlock("cb-stars");
    if (first && S.level >= 9) T.unlock("cb-firsttry");
    const has = function (t) { return S.cells.some(function (o) { return o && o.t === t; }); };
    if (S.sim.beams.some(function (b) { return b.path.some(function (s) { return s.k === "mirror"; }) && b.path[b.path.length - 1].k === "hit"; })) T.unlock("cb-bounce");
    if (has("turbine") && S.sim.windT.some(function (x) { return x != null; })) T.unlock("cb-wind");
    if (S.sim.spinT.filter(function (x, i) { return x != null && S.cells[i] && S.cells[i].t === "gear"; }).length >= 3) T.unlock("cb-gears");
    if (has("alarm")) T.unlock("cb-quiet");
    if (L.name === "Rube Goldberg") T.unlock("cb-goldberg");
    let all = true, perfect = true;
    for (let i = 0; i < LEVELS.length; i++) { if (!cleared(i)) all = false; if ((PROG.stars[i] || 0) < 3) perfect = false; }
    if (all) T.unlock("cb-all");
    if (perfect) T.unlock("cb-perfect");
  }
  Sound.cue("clear");
  Shell.shake(3, 0.3); camShake(0.8, 0.4);
  burst(W / 2, 200, Shell.reduced ? 30 : 90);
  ledPlay([ledMsg("flash", "LEVEL " + (S.level + 1) + " WIRED!", 1.6), ledMsg("cycle", stars + (stars === 1 ? " STAR" : " STARS"), 1.4),
           ledMsg("count", "SCORE", 2.2, { from: 0, value: score })]);
}

function finishClear() {
  const L = LEVELS[S.level], n = S.level;
  const starRow = '<div style="font-size:30px;letter-spacing:6px;color:#ffd23f;margin:2px 0 8px" aria-label="' + S.stars + ' of 3 stars">' +
    "★".repeat(S.stars) + '<span style="color:#3a3f58">' + "★".repeat(3 - S.stars) + "</span></div>";
  const html = starRow +
    row("Level", (n + 1) + ". " + L.name) +
    row("Parts used", S.used + " (par " + L.par + ")") +
    row("First try", S.first ? "Yes +200" : "No") +
    row("This level", S.score + " PTS" + (S.newLevelBest ? " (new best)" : "")) +
    row("Levels cleared", LEVELS.filter(function (_, i) { return cleared(i); }).length + " of " + LEVELS.length) +
    row("Stars", totalStars() + " of " + LEVELS.length * 3);
  const total = totalScore();
  Shell.gameOver(total, { title: "LEVEL " + (n + 1) + " WIRED!", html: html,
    stats: { level: n + 1, stars: S.stars, parts: S.used, par: L.par, firstTry: S.first, levelScore: S.score, total: total,
             levelsCleared: LEVELS.filter(function (_, i) { return cleared(i); }).length, totalStars: totalStars(), levels: LEVELS.length } });
  setNextButton(n + 1 < LEVELS.length ? n + 1 : null);
}
function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

/* ---------------- Update ---------------- */
function update(dt) {
  S.t += dt;
  updateParts(dt);
  if (S.mode === "run") updateRun(dt);
  else if (S.mode === "clear") {
    S.clearT += dt;
    if (S.sim) S.runT += dt;
    const k = Math.floor((S.clearT - 0.5) / 0.32);
    if (k >= 0 && k < S.stars && S.starCue !== k) { S.starCue = k; Sound.cue("star", k); }
    if (S.clearT > 2.9) finishClear();
  }
  // keyboard cursor moves
  if (S.kbMove) S.kbMove -= dt;
}

/* ---------------- Particles (drawn on the HUD layer) ---------------- */
function burst(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 60 + Math.random() * 200;
    parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 110, life: 1 + Math.random() * 0.7, g: 260,
      c: CONF_COLS[i % CONF_COLS.length], w: 2.2 + (i % 3), rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14, kind: i % 4 === 0 ? 1 : 0 });
  }
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt; p.vy += p.g * dt; p.vx *= 0.985; p.rot += p.vr * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0) parts.splice(i, 1);
  }
}

/* ---------------- Music ----------------
   An original sixteen-bar synth loop (A minor, 112 BPM): pumping bass, a sixteenth-note arpeggio, a soft pad that
   breathes with the kick, a lead with an echo, and drums. Made entirely in code with the Web Audio API.
   Self-contained on purpose: give it an audio context and somewhere to plug in, and it plays until the function it
   returns is called. It knows nothing about the game. */
function startMusic(ctx, dest) {
  const BPM = 112, STEP = 60 / BPM / 4, BAR = 16, BARS = 16, AHEAD = 0.3, VOL = 1;
  const CH = { Am: [45, 57, 60, 64], F: [41, 53, 57, 60], C: [48, 55, 60, 64], G: [43, 55, 59, 62], Dm: [38, 57, 62, 65],
               E: [40, 56, 59, 64], Em: [40, 55, 59, 64] };
  const PROG = ["Am", "F", "C", "G", "Am", "F", "Dm", "E", "F", "G", "Em", "Am", "Dm", "G", "C", "E"];
  // the tune, a bar at a time: [step, MIDI note, length in steps]
  const LEAD = [
    [[0, 69, 2], [2, 72, 2], [4, 76, 3], [7, 74, 1], [8, 72, 2], [10, 71, 2], [12, 69, 4]],
    [[0, 65, 2], [2, 69, 2], [4, 72, 2], [6, 77, 2], [8, 76, 3], [11, 72, 1], [12, 69, 4]],
    [[0, 67, 2], [2, 72, 2], [4, 76, 2], [6, 79, 2], [8, 77, 2], [10, 76, 2], [12, 74, 2], [14, 72, 2]],
    [[0, 74, 3], [3, 71, 1], [4, 67, 4], [8, 71, 2], [10, 74, 2], [12, 79, 4]],
    [[0, 76, 2], [2, 81, 2], [4, 79, 2], [6, 76, 2], [8, 72, 3], [11, 74, 1], [12, 76, 4]],
    [[0, 77, 2], [2, 76, 2], [4, 72, 2], [6, 69, 2], [8, 72, 4], [12, 77, 4]],
    [[0, 74, 2], [2, 77, 2], [4, 81, 3], [7, 79, 1], [8, 77, 2], [10, 76, 2], [12, 74, 4]],
    [[0, 76, 4], [4, 80, 4], [8, 83, 4], [12, 76, 2], [14, 74, 2]],
    [[0, 81, 3], [3, 79, 3], [6, 77, 2], [8, 76, 2], [10, 77, 2], [12, 72, 4]],
    [[0, 71, 3], [3, 74, 3], [6, 79, 2], [8, 77, 2], [10, 74, 2], [12, 71, 4]],
    [[0, 79, 3], [3, 76, 3], [6, 71, 2], [8, 76, 2], [10, 79, 2], [12, 83, 4]],
    [[0, 81, 6], [6, 76, 2], [8, 72, 2], [10, 76, 2], [12, 81, 4]],
    [[0, 77, 3], [3, 81, 3], [6, 86, 2], [8, 84, 2], [10, 81, 2], [12, 77, 4]],
    [[0, 79, 3], [3, 83, 3], [6, 86, 2], [8, 83, 2], [10, 79, 2], [12, 74, 4]],
    [[0, 76, 2], [2, 79, 2], [4, 84, 4], [8, 83, 2], [10, 79, 2], [12, 76, 4]],
    [[0, 80, 4], [4, 83, 4], [8, 88, 6]]
  ];
  const lead = new Array(BAR * BARS).fill(null);
  LEAD.forEach(function (bar, b) { bar.forEach(function (n) { lead[b * BAR + n[0]] = [n[1], n[2]]; }); });
  function f(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  const out = ctx.createGain(); out.gain.value = 0; out.connect(dest);
  out.gain.setTargetAtTime(VOL, ctx.currentTime + 0.05, 0.05);
  function filt(type, freq, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = freq; n.Q.value = q; n.connect(to); return n; }
  const padBus = ctx.createGain(); padBus.connect(out);               // the pad ducks under every kick
  const padF = filt("lowpass", 1300, 0.6, padBus);
  const bassF = filt("lowpass", 760, 2.2, out);
  const arpF = filt("lowpass", 2900, 0.8, out);
  const leadF = filt("lowpass", 3600, 0.7, out);
  const send = ctx.createGain(), echo = ctx.createDelay(1), back = ctx.createGain(), wet = filt("lowpass", 2200, 0.7, out);
  send.gain.value = 0.28; echo.delayTime.value = STEP * 3; back.gain.value = 0.34;
  leadF.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(wet);
  const len = Math.floor(ctx.sampleRate * 1.5), noise = ctx.createBuffer(1, len, ctx.sampleRate), nd = noise.getChannelData(0);
  let seed = 0x1234567;
  for (let i = 0; i < len; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; nd[i] = ((seed >>> 0) / 4294967296) * 2 - 1; }
  const live = [];

  function tone(to, type, freq, t, dur, vol, f1, hold, det) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.01, dur * (hold == null ? 0.6 : hold));
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (det) o.detune.value = det;
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.05);
    live.push(o); if (live.length > 160) live.shift();
  }
  function hiss(to, t, dur, vol, type, f0, q) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; fl.type = type; fl.frequency.value = f0; fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(to); s.start(t, (t * 7.31) % 1); s.stop(t + dur + 0.05);
    live.push(s); if (live.length > 160) live.shift();
  }
  function pad(chord, t) {
    const dur = STEP * BAR;
    for (let k = 1; k < 4; k++) for (let v = -1; v <= 1; v += 2) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = f(chord[k]); o.detune.value = v * 9;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.022, t + 0.35);
      g.gain.setValueAtTime(0.022, t + dur - 0.25); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1);
      o.connect(g); g.connect(padF); o.start(t); o.stop(t + dur + 0.2);
      live.push(o);
    }
  }
  function step(i, t) {
    const bar = (i / BAR) | 0, s = i % BAR, ch = CH[PROG[bar]], second = bar >= 8;
    if (s === 0) pad(ch, t);
    const n = lead[i];
    if (n) { tone(leadF, "square", f(n[0]), t, n[1] * STEP * 0.95, 0.075, 0, 0.7); tone(leadF, "triangle", f(n[0]), t, n[1] * STEP, 0.09, 0, 0.7, 6); }
    const arp = [1, 2, 3, 2, 1, 3, 2, 3][s % 8], up = (s >> 3) & 1 ? 12 : 0;
    tone(arpF, "square", f(ch[arp] + up), t, STEP * 0.8, 0.028, 0, 0.3);
    if (!(s & 1)) {
      const oct = (s >> 1) & 1 ? 12 : 0;
      tone(bassF, "sawtooth", f(ch[0] + oct), t, STEP * 1.8, 0.16, 0, 0.5);
      hiss(out, t, s % 4 === 2 ? 0.09 : 0.035, s % 4 === 2 ? 0.07 : 0.04, "highpass", 7600);
    }
    const kick = second ? s % 4 === 0 : s === 0 || s === 6 || s === 8 || s === 11;
    if (kick) {
      tone(out, "sine", 150, t, 0.2, 0.55, 42, 0.08);
      padBus.gain.cancelScheduledValues(t); padBus.gain.setValueAtTime(0.45, t); padBus.gain.setTargetAtTime(1, t + 0.04, 0.09);
    }
    const fill = (bar === 7 || bar === 15) && s >= 12;
    if (s === 4 || s === 12 || fill) { hiss(out, t, 0.14, fill ? 0.12 + 0.04 * (s - 12) : 0.2, "bandpass", 1800, 0.6); tone(out, "triangle", 190, t, 0.08, 0.1, 120, 0.1); }
  }

  let i = 0, nextT = ctx.currentTime + 0.08, dead = false;
  function pump() {
    if (dead) return;
    const now = ctx.currentTime;
    if (nextT < now - 0.2) nextT = now + 0.03;                     // after a long stall, pick the beat back up
    while (nextT < now + AHEAD) { step(i, nextT); i = (i + 1) % (BAR * BARS); nextT += STEP; }
  }
  pump();
  const timer = setInterval(pump, 40);
  return function stop() {
    if (dead) return;
    dead = true; clearInterval(timer);
    const now = ctx.currentTime;
    out.gain.cancelScheduledValues(now); out.gain.setTargetAtTime(0, now, 0.05);
    setTimeout(function () {
      for (let k = 0; k < live.length; k++) { try { live[k].stop(); } catch (e) { /* already done */ } }
      try { out.disconnect(); } catch (e) { /* gone */ }
    }, 400);
  };
}

/* ---------------- Sound effects and the music switch ----------------
   The shell's own sounds still play where the 2D games use them. This adds the game's stingers and the band. Nothing
   is created until the first tap, click or key press, it follows the shell's mute button (the same "npArcade.muted"
   setting), and music on / off is remembered under "npArcade.music". */
const MUSIC_KEY = "npArcade.music", MUSIC_VOL = 0.16, SFX_VOL = 0.24;
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
    const len = Math.floor(c.sampleRate * 1.5);
    a.noise = c.createBuffer(1, len, c.sampleRate);
    const d = a.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return a;
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
    const s = A.c.createBufferSource(), fl = A.c.createBiquadFilter(), g = A.c.createGain();
    s.buffer = A.noise; fl.type = type; fl.frequency.setValueAtTime(f0, t); fl.Q.value = q || 0.7;
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(A.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function m(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  const PLACE = { wire: 0, battery: -2, lamp: 3, mirror: 5, solar: 4, fan: 1, turbine: 2, motor: -3, gear: -1, dynamo: -4, magnet: -5, reed: 6 };

  function play(name, x, t) {
    if (name === "place") {                                  // a part snapping into its socket
      const k = Math.pow(2, (PLACE[x] || 0) / 12);
      osc("triangle", 330 * k, t, 0.07, 0.5, 160 * k, 0.2); hiss(t, 0.03, 0.4, "bandpass", 3200, 1.2);
    } else if (name === "pick") { osc("triangle", 260, t, 0.09, 0.4, 620, 0.3); }
    else if (name === "rotate") { osc("square", 1400, t, 0.025, 0.2); osc("square", 1900, t + 0.05, 0.025, 0.2); }
    else if (name === "select") { osc("square", 990, t, 0.04, 0.18); osc("square", 1320, t + 0.04, 0.05, 0.18); }
    else if (name === "deny") { osc("square", 150, t, 0.13, 0.25, 110, 0.7); }
    else if (name === "switch") { hiss(t, 0.02, 0.5, "highpass", 4000); osc("triangle", x ? 600 : 420, t, 0.08, 0.35, x ? 900 : 280, 0.3); }
    else if (name === "breaker") {                           // the big clunk, then the hum coming up (or going down)
      osc("sine", 90, t, 0.18, 0.9, 40, 0.1); hiss(t, 0.08, 0.6, "lowpass", 900);
      if (x) { osc("sawtooth", 55, t + 0.05, 0.7, 0.12, 110, 0.6); osc("sawtooth", 110, t + 0.05, 0.7, 0.06, 220, 0.6); }
      else osc("sawtooth", 110, t + 0.04, 0.45, 0.1, 40, 0.3);
    } else if (name === "target") {                          // a zap, and each gadget's own little hello
      hiss(t, 0.07, 0.5, "bandpass", 5200, 2);
      if (x === "tv") { osc("sine", 120, t + 0.02, 0.35, 0.6, 50, 0.2); osc("sine", 2600, t + 0.06, 0.28, 0.05, 0, 0.8); }
      else if (x === "boombox") { osc("sine", 80, t + 0.02, 0.18, 0.8, 45, 0.2); osc("sine", 80, t + 0.24, 0.18, 0.8, 45, 0.2); hiss(t + 0.14, 0.06, 0.35, "bandpass", 2400); }
      else if (x === "arcade") { [72, 76, 79, 84, 88].forEach(function (n, i) { osc("square", m(n), t + 0.03 + i * 0.05, 0.08, 0.2, 0, 0.6); }); }
      else if (x === "lava") { osc("sine", 300, t + 0.02, 0.5, 0.35, 700, 0.3); osc("sine", 450, t + 0.2, 0.4, 0.2, 260, 0.3); }
      else if (x === "calc") { osc("square", 2093, t + 0.02, 0.06, 0.18); osc("square", 2093, t + 0.12, 0.06, 0.18); }
      else if (x === "turntable") { hiss(t + 0.02, 0.22, 0.6, "bandpass", 700, 3, 2600); hiss(t + 0.26, 0.16, 0.5, "bandpass", 2400, 3, 900); }
      else osc("square", 880, t + 0.02, 0.1, 0.2);
    } else if (name === "beam") { osc("sine", 1200, t, 0.3, 0.16, 2400, 0.3); osc("triangle", 2400, t + 0.05, 0.25, 0.08, 3600, 0.3); }
    else if (name === "solar") { [84, 88, 91].forEach(function (n, i) { osc("triangle", m(n), t + i * 0.05, 0.16, 0.12, 0, 0.4); }); }
    else if (name === "fan") { hiss(t, 0.7, 0.35, "bandpass", 300, 0.8, 1300, 0.25); }
    else if (name === "turbine") { osc("sawtooth", 70, t, 0.6, 0.08, 190, 0.7); hiss(t, 0.5, 0.2, "bandpass", 900, 1.5, 2400, 0.2); }
    else if (name === "gear") { for (let i = 0; i < 4; i++) hiss(t + i * 0.045, 0.02, 0.28, "highpass", 3000 + i * 300); }
    else if (name === "dynamo") { osc("sawtooth", 60, t, 0.5, 0.1, 120, 0.6); osc("sine", 240, t + 0.1, 0.4, 0.12, 480, 0.6); }
    else if (name === "magnet") { osc("sawtooth", 60, t, 0.35, 0.12, 0, 0.8); osc("sawtooth", 61.5, t, 0.35, 0.1, 0, 0.8); }
    else if (name === "reed") { hiss(t, 0.015, 0.4, "highpass", 6000); osc("square", 2600, t, 0.02, 0.1); }
    else if (name === "alarm") {                              // brrring: a bell hammered between two notes
      for (let i = 0; i < 26; i++) { osc("square", i % 2 ? 1568 : 1319, t + i * 0.055, 0.05, 0.16, 0, 0.6); }
      hiss(t, 1.45, 0.12, "bandpass", 3000, 4);
    } else if (name === "fail") { osc("sawtooth", 220, t, 0.32, 0.22, 165, 0.6); osc("sawtooth", 165, t + 0.3, 0.5, 0.22, 98, 0.5); }
    else if (name === "clear") {
      [72, 76, 79, 84].forEach(function (n, i) { osc("square", m(n), t + i * 0.08, 0.12, 0.22, 0, 0.6); });
      [84, 88, 91, 96].forEach(function (n) { osc("triangle", m(n), t + 0.34, 0.8, 0.14, 0, 0.4); });
      osc("square", m(96), t + 0.34, 0.6, 0.08, 0, 0.3);
    } else if (name === "star") { const n = [84, 88, 91][x] || 91; osc("triangle", m(n), t, 0.4, 0.3, 0, 0.2); osc("sine", m(n + 12), t, 0.5, 0.14, 0, 0.2); }
    else if (name === "open") { hiss(t, 0.3, 0.25, "bandpass", 500, 0.9, 2600, 0.08); osc("square", 660, t + 0.12, 0.05, 0.15); osc("square", 990, t + 0.18, 0.08, 0.15); }
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
      if (A.c.state !== "running" && Shell.state() !== "paused") { const p = A.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { A = null; dead = true; }
  }
  // Every frame: follow the mute button, and keep the band playing while a game is on.
  function pump() {
    if (!A || !window.Shell) return;
    const c = A.c, now = c.currentTime, mm = shellMuted(), st = Shell.state();
    if (mm !== muted) { muted = mm; A.out.gain.setTargetAtTime(mm ? 0 : 1, now, 0.02); }
    if (st === "paused" && c.state === "running") { try { c.suspend(); } catch (e) { /* ignore */ } }
    const want = musicOn && !muted && st === "playing" && c.state === "running";
    if (want && !stopMusic) stopMusic = startMusic(c, A.music);
    else if (!want && stopMusic) { stopMusic(); stopMusic = null; }
  }
  function cue(name, x, delay) {
    if (!A || muted || A.c.state !== "running") return;
    try { play(name, x, A.c.currentTime + 0.01 + (delay || 0)); } catch (e) { /* sound is never worth a crash */ }
  }
  const NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 4l11-2v13.5a3 3 0 1 1-2-2.83V6.1l-7 1.3v10.1a3 3 0 1 1-2-2.83z"/></svg>';
  const NOTE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" opacity=".55" d="M9 4l11-2v13.5a3 3 0 1 1-2-2.83V6.1l-7 1.3v10.1a3 3 0 1 1-2-2.83z"/><path fill="none" stroke="currentColor" stroke-width="2.4" d="M3 3l18 18"/></svg>';
  function label() {
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      b.setAttribute("aria-pressed", musicOn ? "true" : "false");
      if (b.classList.contains("np-icon")) { b.innerHTML = musicOn ? NOTE : NOTE_OFF; b.setAttribute("aria-label", musicOn ? "Turn music off" : "Turn music on"); }
      else b.textContent = musicOn ? "MUSIC: ON" : "MUSIC: OFF";
    }
  }
  function setMusic(on) {
    musicOn = !!on;
    try { localStorage.setItem(MUSIC_KEY, musicOn ? "1" : "0"); } catch (e) { /* private mode */ }
    label(); pump();
  }
  // "MUSIC: ON / OFF" in the shell's button style (title and pause cards), or a note icon for the top bar.
  function button(parent, before, icon) {
    if (!parent) return;
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("data-np-music", "");
    if (icon) { b.className = "np-icon"; b.id = "np-music"; }
    else { b.className = "np-btn"; b.style.cssText = "width:100%;margin-top:8px"; }
    b.addEventListener("click", function (e) {
      e.stopPropagation(); unlock(); setMusic(!musicOn);
      if (icon && e.detail > 0 && Shell.state() === "playing") { try { document.getElementById("np-canvas").focus({ preventScroll: true }); } catch (er) { /* ignore */ } }
    });
    parent.insertBefore(b, before || null);
    buttons.push(b); label();
  }
  return {
    unlock: unlock, pump: pump, cue: cue, button: button,
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    resume: function () { unlock(); if (A && A.c.state !== "running") { const p = A.c.resume(); if (p && p.catch) p.catch(function () {}); } },
    peek: function () { return { made: !!A, state: A ? A.c.state : "none", music: !!stopMusic, musicOn: musicOn, muted: muted }; }
  };
})();

/* ---------------- LED ribbon board: the strip across the top of the open lid ----------------
   A real dot matrix: everything on it is painted into a small canvas, one pixel per LED, and a little shader turns
   each pixel into a glowing dot. It scrolls its programme right to left and cuts to big animated messages when
   something happens on the board (the breaker, a gadget coming on, a clear, a dud, the alarm). */
const LED_ROWS = 22, LED_W = 76, LED_H = 6.6;              // dots tall; lit width and height in board units
const LED_COLS = Math.round(LED_W / (LED_H / LED_ROWS));
const LED_SPEED = 40;                                      // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["SOME ASSEMBLY REQUIRED", "cyan"], ["BE KIND, REWIND", "pink"], ["NO QUARTERS REQUIRED", "lime"]];
// Plugs for the rest of the arcade: [game, one-line tag].
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
    "*": "00000 00100 01110 11111 01110 00100 00000", "#": "01010 11111 01010 01010 01010 11111 01010"
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
  // The wordmark at board resolution: the cream lettering pushed to full brightness, the red edge kept as a dimmer
  // rim and the navy outline dropped to dark, so the script reads as light on black.
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
  function plug(name, tag, color) {                        // an ad card: color bar, a FREE tab with the tag, the game's name under it
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
  const start = ((-(LED_COLS - strip.markW) / 2) % sw + sw) % sw;   // open with the wordmark centered
  return { canvas: c, g: g, strip: strip.canvas, scroll: start, pos: -1, msg: null, queue: [], frame: -1, tex: null, live: 0 };
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
// Cut to a list of messages (an empty list goes straight back to the scroll).
function ledPlay(list, append) {
  const L = LED;
  if (!L) return;
  if (append && L.msg) { for (let i = 0; i < list.length; i++) L.queue.push(list[i]); return; }
  L.msg = list[0] || null; if (L.msg) L.msg.t = 0;
  L.queue = list.slice(1);
  L.frame = -1; L.pos = -1;
}

function ledDrawMsg(g, m) {
  const WW = LED_COLS, HH = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(WW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.amber;
  function fit(str) { let sx = big + 1; if (ledTextW(str, sx) > WW - 40) sx = big; while (sx > 1 && ledTextW(str, sx) > WW - 10) sx--; return sx; }
  function chase(color, dir) {
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < WW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(WW - x - 3, HH - 1, 3, 1); }
  }
  if (m.kind === "count") {
    const k = calm ? 1 : Math.min(1, t / 0.7), v = Math.round(m.from + (m.value - m.from) * k);
    const label = m.text ? m.text + " " : "", suffix = m.suffix || "", sxc = Math.min(big, fit(label + m.value + suffix));
    const x = Math.round((WW - ledTextW(label + m.value + suffix, sxc)) / 2);
    let xn = ledText(g, label, x, yBig, sxc, big, LED_C.amber);
    xn = ledText(g, String(v), xn, yBig, sxc, big, k < 1 ? LED_C.yellow : LED_C.white);
    ledText(g, suffix, xn, yBig, sxc, big, LED_C.amber);
    if (!calm && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(WW * m.t / 0.3), 0, WW, HH); }
    chase(LED_C.amber, 1);
    return;
  }
  const sx = fit(m.text), sy = Math.min(sx, big), w = ledTextW(m.text, sx), x0 = Math.round((WW - w) / 2), yy = Math.floor((HH - 7 * sy) / 2);
  if (m.kind === "flash") {
    const base = m.color === "red" ? LED_C.red : LED_C.yellow;
    if (!calm && t < 0.6 && Math.floor(t * 12) % 2 === 0) { g.fillStyle = base; g.fillRect(0, 0, WW, HH); ledText(g, m.text, x0, yy, sx, sy, "#000000"); return; }
    const span = 6 * big + 5, ph = calm ? 0 : Math.floor((t * 46) % span);
    for (let k = 0; k < 14; k++) {
      const off = Math.round(w / 2) + 9 + k * span + ph;
      if (off > mid + span) break;
      const cc = k % 2 ? LED_C.red : LED_C.orange;
      ledText(g, ">", mid + off, yBig, big, big, cc);
      ledText(g, "<", mid - off - 5 * big, yBig, big, big, cc);
    }
    const cyc = m.color === "red" ? [LED_C.red, LED_C.white, LED_C.orange] : [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0, yy, sx, sy, calm ? base : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 14; i++) g.fillRect((Math.random() * WW) | 0, (Math.random() * HH) | 0, 1, 1); }
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "slide") {
    const k = calm ? 1 : Math.min(1, t / 0.4), e = 1 - Math.pow(1 - k, 3);
    const x = Math.round(x0 + (1 - e) * WW);
    ledText(g, m.text, x, yy, sx, sy, col);
    if (!calm && k >= 1) {
      const bx = Math.floor(((t - 0.4) * 160) % (WW + 80)) - 40;
      g.save(); g.beginPath(); g.rect(bx, 0, 12, HH); g.clip(); ledText(g, m.text, x, yy, sx, sy, "#ffffff"); g.restore();
    }
    chase(col, -1);
    return;
  }
  if (m.kind === "cycle") {
    const cyc = [LED_C.yellow, LED_C.pink, LED_C.cyan, LED_C.lime, LED_C.orange];
    let x = x0;
    for (let i = 0; i < m.text.length; i++) x = ledText(g, m.text[i], x, yy, sx, sy, cyc[(i + (calm ? 0 : Math.floor(t * 9))) % cyc.length]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 10; i++) g.fillRect((Math.random() * WW) | 0, (Math.random() * HH) | 0, 1, 1); }
    chase(LED_C.yellow, 1);
    return;
  }
  // blink: a few flashes, then it holds between two bars
  if (calm || t > 1.1 || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, yy, sx, sy, col);
  g.fillStyle = col; g.fillRect(0, HH - 1, WW, 1); g.fillRect(0, 0, WW, 1);
}

// While the breaker is on and nothing is being announced: a live meter of what has power.
function ledDrawLive(g) {
  const WW = LED_COLS, HH = LED_ROWS, sim = S.sim, calm = Shell.reduced;
  const on = sim.targets.filter(function (x) { return x.t != null && x.t <= S.runT; }).length, all = sim.targets.length;
  const txt = "POWER " + on + "/" + all, sx = LED_BIG, w = ledTextW(txt, sx), x = Math.round((WW - w) / 2), y = Math.floor((HH - 7 * sx) / 2);
  ledText(g, txt, x, y, sx, sx, on === all ? LED_C.lime : LED_C.cyan);
  const ph = calm ? 0 : Math.floor(S.runT * 30);                // a current running along both edges
  g.fillStyle = on === all ? LED_C.lime : LED_C.cyan;
  for (let k = 0; k < WW; k += 8) { const xx = (k + ph) % WW; g.fillRect(xx, 0, 4, 1); g.fillRect(WW - 1 - xx, HH - 1, 4, 1); }
}

function ledDraw() {
  const L = LED, g = L.g;
  g.fillStyle = "#000000"; g.fillRect(0, 0, LED_COLS, LED_ROWS);
  if (L.msg) { ledDrawMsg(g, L.msg); return; }
  if (L.live) { ledDrawLive(g); return; }
  const sw = L.strip.width;
  let sx = L.pos, dx = 0;
  while (dx < LED_COLS) { const n = Math.min(LED_COLS - dx, sw - sx); g.drawImage(L.strip, sx, 0, n, LED_ROWS, dx, 0, n, LED_ROWS); dx += n; sx = 0; }
}

// Advance the board. It only repaints (and re-uploads its small texture) when an LED actually changes.
function ledTick(dt) {
  const L = LED;
  if (!L) return;
  let redraw = false;
  const live = S.mode === "run" && S.sim ? 1 : 0;
  if (live !== L.live) { L.live = live; redraw = true; }
  if (L.msg) {
    L.msg.t += dt;
    if (L.msg.t >= L.msg.dur) { L.msg = L.queue.shift() || null; if (L.msg) L.msg.t = 0; L.frame = -1; redraw = true; }
  }
  if (L.msg || L.live) {
    const f = Math.floor((L.msg ? L.msg.t : S.runT) * 30);
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
const BT = 1.4;                                            // top of a part's snap-on base
const GEAR_Y = 5.2;                                        // every gear, motor gear, dynamo gear and platter rim turns at this height
const BEAM_Y = 5.0;                                        // spotlights shine at this height
const MARGIN = 4;                                          // circuit board showing around the sockets
const BX = COLS * CELL / 2 + MARGIN, BZ = ROWS * CELL / 2 + MARGIN;   // inner half-size of the box
const WALL_T = 4, WALL_TOP = 5, DESK_Y = -9;
const LID_H = 31, LID_LEAN = 0.27;
const CAT = { battery: "#ffc21a", lamp: "#ff5aa8", mirror: "#ff5aa8", solar: "#ff5aa8", fan: "#2fd0ff", turbine: "#2fd0ff",
              motor: "#ff8a1e", gear: "#ff8a1e", dynamo: "#ff8a1e", magnet: "#9a6bff", reed: "#9a6bff" };
const BOX_COLS = ["#ff4b3e", "#16b9e8", "#ff3fa4", "#58c322", "#ffb81f", "#8a5cff"];

function cx(c) { return (c - (COLS - 1) / 2) * CELL; }
function cz(r) { return (r - (ROWS - 1) / 2) * CELL; }

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
function drawScript(g, script, cx0, cy0, maxW, maxH) {
  let w = maxW, h = w * script.height / script.width;
  if (h > maxH) { h = maxH; w = h * script.width / script.height; }
  g.drawImage(script, cx0 - w / 2, cy0 - h / 2, w, h);
}
function candyText(g, str, x, y, size, maxW) {
  g.font = "900 " + size + "px " + CANDY_FONT;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + CANDY_FONT; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = size * 0.36; g.strokeStyle = "#08205f"; g.strokeText(str, x, y + size * 0.06);
  g.lineWidth = size * 0.17; g.strokeStyle = "#ffffff"; g.strokeText(str, x, y);
  const gr = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  gr.addColorStop(0, "#fff06a"); gr.addColorStop(0.55, "#ffc21a"); gr.addColorStop(1, "#ff7a0f");
  g.fillStyle = gr; g.fillText(str, x, y);
  g.fillStyle = "rgba(255,255,255,.45)";
  g.save(); g.beginPath(); g.rect(x - 900, y - size * 0.5, 1800, size * 0.36); g.clip(); g.fillText(str, x, y); g.restore();
}

/* ---------------- Painted textures (all drawn here, no image files besides the two logos) ---------------- */

// The script wordmark, trimmed to its ink. Every decal inside the box uses it (the full logo with the mascot is kept for
// the splash and the score card). If the PNG is missing, plain lettering stands in.
function scriptCanvas(img) {
  if (img && img.naturalWidth > 0) {
    const k = Math.min(1, 1024 / img.naturalWidth);
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = mkCanvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
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

// The circuit board the sockets sit in: green, gold pads at every socket corner, decorative traces, silkscreen.
function pcbCanvas(script) {
  const k = 8, w = (BX * 2) * k, h = (BZ * 2) * k, c = mkCanvas(w, h), g = c.getContext("2d"), rnd = rng(71);
  const X = function (x) { return (x + BX) * k; }, Y = function (z) { return (z + BZ) * k; };
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#0e7a43"); bg.addColorStop(1, "#0a5c33");
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.035)" : "rgba(0,30,10,.06)"; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
  // traces running along the socket seams
  g.lineCap = "round"; g.lineJoin = "round";
  for (let n = 0; n < 46; n++) {
    let px = Math.floor(rnd() * (COLS + 1)), pz = Math.floor(rnd() * (ROWS + 1));
    g.strokeStyle = "rgba(240,190,70," + (0.32 + rnd() * 0.25) + ")"; g.lineWidth = 2 + rnd() * 2;
    g.beginPath(); g.moveTo(X(cx(px) - CELL / 2), Y(cz(pz) - CELL / 2));
    for (let s = 0; s < 3; s++) {
      if (rnd() < 0.5) px = clamp(px + (rnd() < 0.5 ? -1 : 1), 0, COLS); else pz = clamp(pz + (rnd() < 0.5 ? -1 : 1), 0, ROWS);
      g.lineTo(X(cx(px) - CELL / 2), Y(cz(pz) - CELL / 2));
    }
    g.stroke();
  }
  for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
    const x = X(cx(cc)), y = Y(cz(r)), s = (CELL - 1.1) * k;
    rrectPath(g, x - s / 2, y - s / 2, s, s, 6); g.fillStyle = "rgba(0,40,18,.42)"; g.fill();       // the socket
    g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 2;
    const b = s / 2 - 3, l = 9;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {                                       // silkscreen corner brackets
      g.beginPath(); g.moveTo(x + q[0] * b, y + q[1] * (b - l)); g.lineTo(x + q[0] * b, y + q[1] * b); g.lineTo(x + q[0] * (b - l), y + q[1] * b); g.stroke();
    });
  }
  for (let r = 0; r <= ROWS; r++) for (let cc = 0; cc <= COLS; cc++) {                              // gold pads where four sockets meet
    const x = X(cx(cc) - CELL / 2), y = Y(cz(r) - CELL / 2);
    g.fillStyle = "#e9b949"; g.beginPath(); g.arc(x, y, 5.2, 0, TAU); g.fill();
    g.fillStyle = "#0a3d22"; g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill();
  }
  // silkscreen in the margins: column letters, row numbers, the board's name and the wordmark
  g.fillStyle = "rgba(255,255,255,.75)"; g.font = "bold 20px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle";
  for (let cc = 0; cc < COLS; cc++) g.fillText("ABCDEFG"[cc], X(cx(cc)), Y(-BZ + MARGIN / 2));
  for (let r = 0; r < ROWS; r++) { g.fillText(String(r + 1), X(-BX + MARGIN / 2), Y(cz(r))); g.fillText(String(r + 1), X(BX - MARGIN / 2), Y(cz(r))); }
  g.font = "bold 15px " + HUD_FONT; g.textAlign = "left";
  g.fillText("NP-07  CIRCUIT BOX  REV.B", X(-BX + MARGIN + 1), Y(BZ - MARGIN / 2));
  drawScript(g, script, X(BX - MARGIN - 8), Y(BZ - MARGIN / 2), 100, MARGIN * k - 6);
  return c;
}

function woodCanvas(seed, base) {
  const c = mkCanvas(512, 512), g = c.getContext("2d"), rnd = rng(seed || 11);
  const n = 6, bw = 512 / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = "hsl(" + (base || 28) + "," + (52 + rnd() * 12) + "%," + (40 + rnd() * 9) + "%)";
    g.fillRect(Math.floor(i * bw), 0, Math.ceil(bw) + 1, 512);
    for (let k = 0; k < 26; k++) { g.fillStyle = "rgba(60,25,5," + (0.05 + rnd() * 0.1) + ")"; g.fillRect(i * bw + rnd() * bw, 0, 1 + rnd() * 2, 512); }
    for (let k = 0; k < 5; k++) { g.fillStyle = "rgba(255,225,180," + (0.06 + rnd() * 0.08) + ")"; g.fillRect(i * bw + rnd() * bw, 0, 2, 512); }
  }
  for (let i = 0; i < n; i++) { g.fillStyle = "rgba(40,15,0,.55)"; g.fillRect(Math.round(i * bw), 0, 2, 512); }
  return c;
}
// Fake-wood vinyl for the TV cabinet (horizontal grain)
function grainCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(5);
  g.fillStyle = "#6b3d1c"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = "rgba(" + (rnd() < 0.5 ? "40,18,4" : "150,92,48") + "," + (0.12 + rnd() * 0.2) + ")"; g.lineWidth = 1 + rnd() * 3;
    const y = rnd() * 256, a = 2 + rnd() * 6;
    g.beginPath(); for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x / 40 + i) * a); g.stroke();
  }
  return c;
}

// The lid's inner face: candy sunburst, the wordmark on the left, the game on the right. The LED board hangs over the top.
function lidCanvas(script) {
  const c = mkCanvas(1024, 368), g = c.getContext("2d"), rnd = rng(23);
  const bg = g.createLinearGradient(0, 0, 0, 368);
  bg.addColorStop(0, "#143fae"); bg.addColorStop(0.5, "#2f7bf0"); bg.addColorStop(1, "#163fae");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 368);
  const cy0 = 250;
  for (let i = 0; i < 32; i += 2) {
    g.fillStyle = "rgba(255,255,255,.07)";
    g.beginPath(); g.moveTo(512, cy0); g.arc(512, cy0, 1200, i / 32 * TAU, (i + 1) / 32 * TAU); g.closePath(); g.fill();
  }
  const glow = g.createRadialGradient(330, cy0, 10, 330, cy0, 300);
  glow.addColorStop(0, "rgba(150,210,255,.5)"); glow.addColorStop(1, "rgba(150,210,255,0)");
  g.fillStyle = glow; g.fillRect(0, 0, 1024, 368);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 1024, y = 110 + rnd() * 250, r = 3 + rnd() * 9;
    g.lineWidth = 2; g.strokeStyle = "rgba(255,255,255," + (0.08 + rnd() * 0.1) + ")"; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  }
  g.fillStyle = "#05070d"; g.fillRect(0, 0, 1024, 104);                    // behind the LED board
  g.fillStyle = "#ff9214"; g.fillRect(0, 104, 1024, 12);
  g.fillStyle = "#ffe45c"; g.fillRect(0, 116, 1024, 4);
  drawScript(g, script, 300, 246, 440, 210);
  candyText(g, "CIRCUIT", 760, 200, 92, 420);
  candyText(g, "BOX", 760, 292, 104, 420);
  g.lineWidth = 16; g.strokeStyle = "#ff9214"; g.strokeRect(8, 8, 1008, 352);
  return c;
}

// A battery label, wrapped once around the can. Canvas x runs around the can (x = 0 faces the player), canvas y runs
// along it, left end at the top, so the lettering is painted turned a quarter turn.
function batteryCanvas(script) {
  const c = mkCanvas(256, 512), g = c.getContext("2d");
  g.fillStyle = "#14161e"; g.fillRect(0, 0, 256, 512);
  g.fillStyle = "#ffc21a"; g.fillRect(0, 0, 256, 120);
  g.fillStyle = "#c0c6d2"; g.fillRect(0, 488, 256, 24);
  g.save(); g.translate(56, 0); g.rotate(Math.PI / 2);                     // now +x runs down the canvas: along the can
  drawScript(g, script, 300, 2, 300, 96);
  g.fillStyle = "#14161e"; g.font = "900 46px " + CANDY_FONT; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("+", 60, 0);
  g.restore();
  g.save(); g.translate(0, 0);
  for (let x = -256; x <= 256; x += 256) {                                  // the yellow band's chevrons, wrapped
    g.fillStyle = "#14161e";
    for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(x + k * 44 + 10, 120); g.lineTo(x + k * 44 + 32, 100); g.lineTo(x + k * 44 + 54, 120); g.closePath(); g.fill(); }
  }
  g.restore();
  return c;
}

function plugCanvas() {
  const c = mkCanvas(256, 224), g = c.getContext("2d");
  g.fillStyle = "#23262f"; g.fillRect(0, 0, 256, 224);
  rrectPath(g, 18, 18, 220, 188, 22); g.fillStyle = "#ffc21a"; g.fill();
  g.lineWidth = 8; g.strokeStyle = "#14161e"; g.stroke();
  g.fillStyle = "#14161e"; g.beginPath();
  [[150, 36], [86, 118], [124, 118], [100, 190], [172, 98], [134, 98], [158, 36]].forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
  g.closePath(); g.fill();
  g.font = "900 22px " + CANDY_FONT; g.textAlign = "left"; g.fillText("12V", 34, 50);
  return c;
}

function solarCanvas() {
  const c = mkCanvas(256, 212), g = c.getContext("2d");
  g.fillStyle = "#c9d2e3"; g.fillRect(0, 0, 256, 212);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) {
    const px = 8 + x * 48.5, py = 8 + y * 49.5;
    const gr = g.createLinearGradient(px, py, px + 44, py + 44);
    gr.addColorStop(0, "#2a52b8"); gr.addColorStop(0.5, "#122a78"); gr.addColorStop(1, "#1e3f9a");
    g.fillStyle = gr; g.fillRect(px, py, 44, 45);
    g.strokeStyle = "rgba(200,220,255,.35)"; g.lineWidth = 1;
    for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(px + k * 11, py); g.lineTo(px + k * 11, py + 45); g.stroke(); }
  }
  return c;
}

function stripeCanvas() {                                 // the current running along a live wire
  const c = mkCanvas(64, 8), g = c.getContext("2d");
  g.fillStyle = "#3a2a00"; g.fillRect(0, 0, 64, 8);
  for (let i = 0; i < 2; i++) {
    const gr = g.createLinearGradient(i * 32, 0, i * 32 + 32, 0);
    gr.addColorStop(0, "#3a2a00"); gr.addColorStop(0.55, "#ffffff"); gr.addColorStop(0.75, "#fff3a0"); gr.addColorStop(1, "#3a2a00");
    g.fillStyle = gr; g.fillRect(i * 32, 0, 32, 8);
  }
  return c;
}

function boxCanvas(w, d, col, script, seed) {
  const k = 5, cw = Math.round(w * k), ch = Math.round(d * k);
  const c = mkCanvas(cw, ch), g = c.getContext("2d"), rnd = rng(seed * 7 + 3);
  const bg = g.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, shade(col, 0.22)); bg.addColorStop(1, shade(col, -0.12));
  g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
  g.save(); g.globalAlpha = 0.16; g.fillStyle = "#ffffff";
  for (let x = -ch; x < cw; x += 24) { g.beginPath(); g.moveTo(x, ch); g.lineTo(x + ch, 0); g.lineTo(x + ch + 9, 0); g.lineTo(x + 9, ch); g.closePath(); g.fill(); }
  g.restore();
  g.lineWidth = 4; g.strokeStyle = shade(col, -0.38); g.strokeRect(2, 2, cw - 4, ch - 4);
  const ph = ch * 0.5, pw = Math.min(cw * 0.86, ph * (script.width / script.height) * 1.12), px = (cw - pw) / 2, py = (ch - ph) / 2 + (rnd() - 0.5) * 4;
  rrectPath(g, px, py, pw, ph, ph * 0.22); g.fillStyle = "#0d1f5c"; g.fill();
  g.lineWidth = 2.5; g.strokeStyle = "#fff3cf"; g.stroke();
  drawScript(g, script, cw / 2, py + ph / 2, pw * 0.9, ph * 0.84);
  const gl = g.createLinearGradient(0, 0, 0, ch * 0.5);
  gl.addColorStop(0, "rgba(255,255,255,.34)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.fillRect(0, 0, cw, ch * 0.5);
  return c;
}

// Spilled cola, one blob per cell; neighbors overlap into one big glossy spill.
function sodaCanvas(seed) {
  const c = mkCanvas(128, 128), g = c.getContext("2d"), rnd = rng(seed);
  const pts = [];
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, r = 55 + rnd() * 8; pts.push([64 + Math.cos(a) * r, 64 + Math.sin(a) * r]); }
  function blob(grow) {                                   // a smooth closed curve through the midpoints
    const P = pts.map(function (p) { return [(p[0] - 64) * grow + 64, (p[1] - 64) * grow + 64]; }), n = P.length;
    const mid = function (a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    const m0 = mid(P[0], P[1]);
    g.beginPath(); g.moveTo(m0[0], m0[1]);
    for (let i = 1; i <= n; i++) { const p = P[i % n], m = mid(P[i % n], P[(i + 1) % n]); g.quadraticCurveTo(p[0], p[1], m[0], m[1]); }
    g.closePath();
  }
  blob(1.0);
  const gr = g.createRadialGradient(54, 50, 6, 64, 64, 66);
  gr.addColorStop(0, "rgba(140,52,20,.92)"); gr.addColorStop(0.6, "rgba(78,22,6,.94)"); gr.addColorStop(1, "rgba(52,12,2,.9)");
  g.fillStyle = gr; g.fill();
  g.lineWidth = 2.5; g.strokeStyle = "rgba(255,236,206,.55)"; g.stroke();
  for (let i = 0; i < 26; i++) {                          // fizz along the edge
    const p = pts[Math.floor(rnd() * pts.length)], k = 0.86 + rnd() * 0.1, r = 0.8 + rnd() * 1.6;
    g.fillStyle = "rgba(255,240,220," + (0.35 + rnd() * 0.4) + ")"; g.beginPath(); g.arc((p[0] - 64) * k + 64, (p[1] - 64) * k + 64, r, 0, TAU); g.fill();
  }
  g.fillStyle = "rgba(255,255,255,.28)"; g.beginPath(); g.ellipse(44, 38, 20, 6, -0.6, 0, TAU); g.fill();
  g.fillStyle = "rgba(255,255,255,.18)"; g.beginPath(); g.ellipse(78, 84, 10, 3, -0.6, 0, TAU); g.fill();
  return c;
}

// The louvres of an air vent: slats with gaps between (the gaps are cut out with alpha).
function ventCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = "#8d97ab"; g.fillRect(0, 0, 128, 10); g.fillRect(0, 118, 128, 10); g.fillRect(0, 0, 10, 128); g.fillRect(118, 0, 10, 128);
  for (let y = 16; y < 116; y += 14) {
    const gr = g.createLinearGradient(0, y, 0, y + 8);
    gr.addColorStop(0, "#e6ebf5"); gr.addColorStop(1, "#6d778c");
    g.fillStyle = gr; g.fillRect(10, y, 108, 8);
  }
  return c;
}

function clockCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.fillStyle = "#fbf7ea"; g.beginPath(); g.arc(64, 64, 62, 0, TAU); g.fill();
  g.fillStyle = "#14161e"; g.font = "bold 18px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle";
  [["12", 0], ["3", 3], ["6", 6], ["9", 9]].forEach(function (n) { const a = n[1] / 12 * TAU - Math.PI / 2; g.fillText(n[0], 64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); });
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.fillRect(64 + Math.cos(a) * 55 - 1.5, 64 + Math.sin(a) * 55 - 1.5, 3, 3); }
  g.lineCap = "round"; g.strokeStyle = "#14161e";
  g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 26 * Math.cos(-2.2), 64 + 26 * Math.sin(-2.2)); g.stroke();   // ten past ten... at night
  g.lineWidth = 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 40 * Math.cos(-0.9), 64 + 40 * Math.sin(-0.9)); g.stroke();
  g.strokeStyle = "#e3231a"; g.lineWidth = 2; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 34 * Math.cos(1.0), 64 + 34 * Math.sin(1.0)); g.stroke();
  return c;
}

function recordCanvas(script) {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  g.fillStyle = "#0c0d12"; g.beginPath(); g.arc(128, 128, 127, 0, TAU); g.fill();
  for (let r = 50; r < 124; r += 3) { g.strokeStyle = "rgba(255,255,255," + (r % 9 === 0 ? 0.08 : 0.035) + ")"; g.lineWidth = 1; g.beginPath(); g.arc(128, 128, r, 0, TAU); g.stroke(); }
  g.fillStyle = "rgba(255,255,255,.08)"; g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 124, -0.6, -0.25); g.closePath(); g.fill();
  g.fillStyle = "#ff9214"; g.beginPath(); g.arc(128, 128, 44, 0, TAU); g.fill();
  g.fillStyle = "#0d1f5c"; g.beginPath(); g.arc(128, 128, 40, 0, TAU); g.fill();
  drawScript(g, script, 128, 122, 70, 34);
  g.fillStyle = "#0c0d12"; g.beginPath(); g.arc(128, 128, 3.5, 0, TAU); g.fill();
  return c;
}

function boomCanvas() {                                    // the boombox's front panel between the speakers
  const c = mkCanvas(256, 128), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 128);
  bg.addColorStop(0, "#e2e6ee"); bg.addColorStop(1, "#9aa2b2");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  rrectPath(g, 70, 30, 116, 64, 8); g.fillStyle = "#1a1c24"; g.fill();      // cassette door
  rrectPath(g, 82, 42, 92, 40, 5); g.fillStyle = "#4c5466"; g.fill();
  g.fillStyle = "#f4efdf"; g.fillRect(90, 48, 76, 16); g.fillStyle = "#ff9214"; g.fillRect(90, 48, 76, 4);
  g.fillStyle = "#1a1c24"; g.beginPath(); g.arc(106, 72, 6, 0, TAU); g.fill(); g.beginPath(); g.arc(150, 72, 6, 0, TAU); g.fill();
  for (let i = 0; i < 6; i++) { rrectPath(g, 76 + i * 18, 102, 14, 14, 3); g.fillStyle = i === 1 ? "#e3231a" : "#2a2d36"; g.fill(); }
  g.fillStyle = "#1a1c24"; g.font = "bold 13px " + HUD_FONT; g.textAlign = "center"; g.fillText("STEREO  AM/FM", 128, 18);
  return c;
}

function calcCanvas() {                                    // a solar calculator from above: solar strip, LCD window, keys
  const c = mkCanvas(192, 248), g = c.getContext("2d");
  g.fillStyle = "#2c3038"; g.fillRect(0, 0, 192, 248);
  g.fillStyle = "#3d2a12"; g.fillRect(24, 10, 144, 20);
  for (let i = 0; i < 4; i++) { g.fillStyle = "#5a3c1a"; g.fillRect(28 + i * 35, 13, 32, 14); }
  g.fillStyle = "#9aa29a"; g.fillRect(16, 38, 160, 46);
  const keys = ["7", "8", "9", "/", "4", "5", "6", "x", "1", "2", "3", "-", "0", ".", "=", "+"];
  g.font = "bold 16px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle";
  for (let i = 0; i < 16; i++) {
    const x = 16 + (i % 4) * 41, y = 96 + Math.floor(i / 4) * 37;
    rrectPath(g, x, y, 36, 31, 6); g.fillStyle = i % 4 === 3 ? "#ff9214" : "#e6e8ee"; g.fill();
    g.fillStyle = i % 4 === 3 ? "#ffffff" : "#1a1c24"; g.fillText(keys[i], x + 18, y + 16);
  }
  return c;
}

function tvScreen(g, w, h, on, k, t, script) {             // k: 0 off .. 1 fully warmed up
  g.fillStyle = "#0b0f0e"; g.fillRect(0, 0, w, h);
  if (!on || k <= 0) {
    const gr = g.createRadialGradient(w * 0.35, h * 0.3, 2, w * 0.5, h * 0.5, w * 0.7);
    gr.addColorStop(0, "#38433f"); gr.addColorStop(1, "#141a18");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    return;
  }
  if (k < 1) {                                             // the line opening out into the picture
    const hh = Math.max(2, h * Math.max(0, (k - 0.35) / 0.65));
    g.fillStyle = "#e8f4ff"; g.fillRect(w * (0.5 - Math.min(1, k * 3) / 2), (h - hh) / 2, w * Math.min(1, k * 3), hh);
    return;
  }
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#2a6ff0"); bg.addColorStop(1, "#103a9e");
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  drawScript(g, script, w / 2, h * 0.5, w * 0.84, h * 0.6);
  g.fillStyle = "#7dff3a"; g.font = "bold 11px " + HUD_FONT; g.textAlign = "right"; g.textBaseline = "top"; g.fillText("CH 03", w - 6, 5);
  g.fillStyle = "rgba(0,0,0,.18)"; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  const bar = ((t * 0.35) % 1.4 - 0.2) * h;                // a slow rolling band
  g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(0, bar, w, h * 0.12);
}

function arcadeScreen(g, w, h, on, t) {
  g.fillStyle = "#05060a"; g.fillRect(0, 0, w, h);
  if (!on) { g.fillStyle = "rgba(90,110,120,.25)"; g.fillRect(4, 4, w * 0.4, h * 0.2); return; }
  const rnd = rng(9);
  for (let i = 0; i < 40; i++) { const y = (rnd() * h + t * (20 + rnd() * 40)) % h; g.fillStyle = rnd() < 0.3 ? "#9fe8ff" : "#ffffff"; g.fillRect(rnd() * w, y, 1.5, 1.5); }
  const sx = w / 2 + Math.sin(t * 1.7) * w * 0.3, sy = h - 22;              // a little ship of our own design
  g.fillStyle = "#3fe0ff"; g.fillRect(sx - 2, sy - 8, 4, 10); g.fillRect(sx - 8, sy, 16, 4); g.fillStyle = "#ff3fa4"; g.fillRect(sx - 8, sy + 4, 3, 3); g.fillRect(sx + 5, sy + 4, 3, 3);
  for (let i = 0; i < 6; i++) { const ex = 12 + i * (w - 24) / 5, ey = 26 + Math.sin(t * 2 + i) * 6; g.fillStyle = i % 2 ? "#ffd23f" : "#9bff3f"; g.fillRect(ex - 5, ey - 3, 10, 6); g.fillRect(ex - 7, ey + 3, 3, 3); g.fillRect(ex + 4, ey + 3, 3, 3); }
  if (Math.floor(t * 6) % 2) { g.fillStyle = "#ffffff"; g.fillRect(sx - 1, sy - 16 - (t * 120) % 60, 2, 6); }
  g.fillStyle = "#ffffff"; g.font = "bold 10px " + HUD_FONT; g.textAlign = "left"; g.textBaseline = "top"; g.fillText("1UP " + String(Math.floor(t * 50) * 10 % 100000).padStart(5, "0"), 4, 4);
}

function marqueeCanvas(script) {
  const c = mkCanvas(256, 80), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 80);
  bg.addColorStop(0, "#ff6cbb"); bg.addColorStop(1, "#c41f7a");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 80);
  drawScript(g, script, 128, 40, 220, 66);
  return c;
}
function sideArtCanvas() {
  const c = mkCanvas(128, 256), g = c.getContext("2d");
  g.fillStyle = "#4b1fb0"; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 7; i++) { g.fillStyle = ["#ff3fa4", "#3fe0ff", "#ffd23f"][i % 3]; g.save(); g.translate(64, 128); g.rotate(-0.6); g.fillRect(-120, -100 + i * 32, 240, 9); g.restore(); }
  return c;
}

function overlayCanvas() { return mkCanvas(COLS * 40, ROWS * 40); }

function glowCanvas(col) {
  const c = mkCanvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, col || "rgba(255,250,225,.95)"); gr.addColorStop(0.3, "rgba(255,240,190,.38)"); gr.addColorStop(1, "rgba(255,240,190,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}

// The bedroom wall far behind the box (only its lower edge ever shows, over the lid).
function wallCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(31);
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, "#1b2a6b"); bg.addColorStop(1, "#2c4cb0");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 40; i++) {
    const x = rnd() * 512, y = rnd() * 256, s = 4 + rnd() * 10;
    g.fillStyle = ["rgba(255,63,164,.35)", "rgba(63,224,255,.3)", "rgba(255,210,63,.3)"][i % 3];
    g.save(); g.translate(x, y); g.rotate(rnd() * TAU); g.fillRect(-s, -s / 4, s * 2, s / 2); g.restore();
  }
  return c;
}

function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.16, "#dcebff"); gr.addColorStop(0.3, "#3d8cff");
    gr.addColorStop(0.5, "#1648b8"); gr.addColorStop(0.52, "#6b4a2a"); gr.addColorStop(1, "#a4774a");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#2a55b8"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(8, 6, 14, 52); tg.fillRect(42, 6, 14, 52);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#8a5f34"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* ---------------- Geometry helpers ---------------- */
// A box with every edge and corner rounded; each face keeps its own material slot (+x -x +y -y +z -z) and its texture
// stretched corner to corner.
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
// A spur gear lying flat: 12 teeth, its top at y = 1 and its bottom at y = 0. Neighbors 10 apart mesh tooth into gap.
function gearGeo(T, rRoot, rTip, n, hole) {
  const sh = new T.Shape(), step = TAU / n;
  for (let k = 0; k < n; k++) {
    const a = k * step;
    const pts = [[rRoot, a - step * 0.5], [rRoot, a - step * 0.28], [rTip, a - step * 0.17], [rTip, a + step * 0.17], [rRoot, a + step * 0.28]];
    pts.forEach(function (p, j) { const x = Math.cos(p[1]) * p[0], y = Math.sin(p[1]) * p[0]; if (k === 0 && j === 0) sh.moveTo(x, y); else sh.lineTo(x, y); });
  }
  sh.closePath();
  if (hole) { const hp = new T.Path(); hp.absarc(0, 0, hole, 0, TAU, true); sh.holes.push(hp); }
  const g = new T.ExtrudeGeometry(sh, { depth: 0.8, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 1, curveSegments: 4 });
  g.rotateX(-Math.PI / 2); g.translate(0, 0.1, 0);
  return g;
}

let K = null;                                              // the parts kit: shared geometry, materials and textures

function makeKit(T, tex, tEnv, script, aniso) {
  const env = function (m, k) { m.envMap = tEnv; m.combine = T.AddOperation; m.reflectivity = k; return m; };
  const ph = function (col, spec, shin, refl) { const m = new T.MeshPhongMaterial({ color: col, specular: spec == null ? 0x999999 : spec, shininess: shin == null ? 60 : shin }); if (refl) env(m, refl); return m; };
  const tStripe = tex(stripeCanvas(), true);
  tStripe.repeat.set(2, 1);
  const mat = {
    gun: ph(0x3d4456, 0x777777, 50, 0.06), screw: ph(0xdfe4ee, 0xffffff, 90, 0.3), tile: ph(0x1c1f2b, 0x444444, 40),
    copper: ph(0xd88a3c, 0xffd8a0, 70, 0.12),
    hot: new T.MeshPhongMaterial({ color: 0xffd479, emissive: 0xffd25a, emissiveMap: tStripe, specular: 0xffffff, shininess: 90 }),
    chrome: ph(0xe4e9f2, 0xffffff, 120, 0.45), black: ph(0x1a1c24, 0x555555, 60, 0.05), charcoal: ph(0x2a2d36, 0x666666, 50, 0.06),
    white: ph(0xf2f4fa, 0xbbbbbb, 80, 0.1), red: ph(0xe3231a, 0xffffff, 90, 0.12), brass: ph(0xe1b24a, 0xfff0c0, 90, 0.15),
    steel: ph(0xa9b2c2, 0xffffff, 80, 0.25), blue: ph(0x1b56cf, 0xffffff, 80, 0.12), orange: ph(0xff8a1e, 0xffffff, 80, 0.1),
    silver: ph(0xc9ced8, 0xffffff, 90, 0.3), purple: ph(0x6a2bd9, 0xffffff, 80, 0.1),
    glass: new T.MeshPhongMaterial({ color: 0xcfeaff, specular: 0xffffff, shininess: 130, transparent: true, opacity: 0.26, depthWrite: false }),
    mirror: env(new T.MeshPhongMaterial({ color: 0x9fb8d8, specular: 0xffffff, shininess: 160 }), 0.95),
    grain: new T.MeshPhongMaterial({ map: tex(grainCanvas(), true), specular: 0x555555, shininess: 40 }),
    plugTop: new T.MeshPhongMaterial({ map: tex(plugCanvas()), specular: 0x888888, shininess: 60 }),
    battery: env(new T.MeshPhongMaterial({ map: tex(batteryCanvas(script)), specular: 0xffffff, shininess: 110 }), 0.08),
    solar: new T.MeshPhongMaterial({ map: tex(solarCanvas()), specular: 0xffffff, shininess: 140, emissive: 0x000000 }),
    boom: new T.MeshPhongMaterial({ map: tex(boomCanvas()), specular: 0xffffff, shininess: 80 }),
    calc: new T.MeshPhongMaterial({ map: tex(calcCanvas()), specular: 0x999999, shininess: 60 }),
    clock: new T.MeshBasicMaterial({ map: tex(clockCanvas()) }),
    record: new T.MeshPhongMaterial({ map: tex(recordCanvas(script)), specular: 0xffffff, shininess: 120 }),
    marquee: new T.MeshBasicMaterial({ map: tex(marqueeCanvas(script)) }),
    side: new T.MeshPhongMaterial({ map: (function () { const t = tex(sideArtCanvas(), true); t.repeat.set(1 / 6, 1 / 10); t.offset.set(0.5, 0); return t; })(), specular: 0x777777, shininess: 50 }),
    vent: new T.MeshPhongMaterial({ map: tex(ventCanvas()), alphaTest: 0.5, side: T.DoubleSide, specular: 0xffffff, shininess: 70 }),
    lavaGlass: new T.MeshPhongMaterial({ color: 0xff6a2a, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.4, depthWrite: false }),
    coil: ph(0xb9651f, 0xffc890, 60, 0.05)
  };
  const cat = {};
  for (const k in CAT) cat[k] = ph(new T.Color(CAT[k]), 0xdddddd, 90, 0.1);
  const geo = {
    base: roundBox(T, 9.2, BT, 9.2, 0.8), tile: roundBox(T, 9.2, 0.8, 9.2, 0.5),
    screw: new T.CylinderGeometry(0.42, 0.42, 0.16, 10), arm: new T.BoxGeometry(5, 0.55, 1.6).translate(2.5, 0, 0),
    pad: new T.CylinderGeometry(1.6, 1.6, 0.7, 18), cyl: new T.CylinderGeometry(1, 1, 1, 18), sph: new T.SphereGeometry(1, 18, 12),
    gear: gearGeo(T, 4.25, 5.1, 12, 0.7), pinion: gearGeo(T, 4.25, 5.1, 12, 0.7),
    blade: new T.SphereGeometry(1, 12, 8), unit: new T.PlaneGeometry(1, 1)
  };
  const tGlow = tex(glowCanvas());
  return { T: T, tex: tex, env: tEnv, script: script, aniso: aniso, mat: mat, cat: cat, geo: geo, tGlow: tGlow, rb: {},
           glowMat: new T.SpriteMaterial({ map: tGlow, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }) };
}
function rb(w, h, d, r) { const key = w + "," + h + "," + d + "," + r; return K.rb[key] || (K.rb[key] = roundBox(K.T, w, h, d, r)); }
function mesh(geo, mat, parent, x, y, z, cast) {
  const m = new K.T.Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = !!cast; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
function cyl(parent, r0, r1, h, mat, x, y, z, seg, cast) {
  const m = mesh(new K.T.CylinderGeometry(r0, r1, h, seg || 18), mat, parent, x, y, z, cast);
  return m;
}
function glowSprite(parent, y, s, col) {
  const m = K.glowMat.clone();
  if (col) m.color = new K.T.Color(col);
  const sp = new K.T.Sprite(m); sp.position.y = y; sp.scale.set(s, s, 1); parent.add(sp);
  return sp;
}
function dynTex(w, h) { const c = mkCanvas(w, h), t = K.tex(c); return { c: c, g: c.getContext("2d"), t: t, last: -1 }; }

/* ---------------- The parts ----------------
   Every part is a group at its cell's center. Facing parts keep their model in inst.f, which turns. Each part's upd()
   reads what the simulation says about its cell at the current moment and animates itself. */
function since(arr, i, now) { return arr && arr[i] != null && arr[i] <= now ? now - arr[i] : -1; }
function ramp(x, k) { return x < 0 ? 0 : Math.min(1, x / k); }

function makePart(o, i) {
  const T = K.T, M = K.mat, G = K.geo, t = o.t;
  const inst = { t: t, g: new T.Group(), f: new T.Group(), pop: 0, ang: 0, arms: null, upd: null, spinSign: ((i % COLS) + Math.floor(i / COLS)) % 2 ? -1 : 1 };
  inst.g.add(inst.f);
  const g = inst.g, p = PT[t];
  // the snap-on base: bolted parts get gunmetal and screws, the player's parts their family color
  if (!p.terrain) {
    const slim = t === "wire" || t === "sw" || t === "reed", top = slim ? 0.8 : BT;
    mesh(slim ? G.tile : G.base, o.fixed ? M.gun : slim ? M.tile : K.cat[t] || M.white, g, 0, top / 2, 0, false);
    if (o.fixed) [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { mesh(G.screw, M.screw, g, q[0] * 3.75, top + 0.06, q[1] * 3.75); });
    if (slim) {                                            // copper arms reaching out to whatever they connect to
      inst.arms = [];
      for (let d = 0; d < 4; d++) { const a = mesh(G.arm, M.copper, g, 0, 0.8 + 0.275, 0); a.rotation.y = (1 - d) * Math.PI / 2; a.visible = false; inst.arms.push(a); }
      inst.pad = mesh(G.pad, M.copper, g, 0, 0.8 + 0.35, 0);
    }
  }
  (BUILD[t] || BUILD.block)(inst, o, i);
  if (inst.f && p.rot) face(inst, o.d, true);
  g.position.set(cx(i % COLS), 0, cz(Math.floor(i / COLS)));
  g.traverse(function (m) { if (m.isMesh && m.castShadow === false && m.material && !m.material.transparent && m.geometry !== G.base && m.geometry !== G.tile) m.castShadow = true; });
  return inst;
}
function face(inst, d, snap) {
  const t = inst.t;
  inst.goal = t === "mirror" ? (d ? -Math.PI / 4 : Math.PI / 4) : -d * Math.PI / 2;
  if (snap || inst.f.rotation.y == null) inst.f.rotation.y = inst.goal;
}
function setArms(inst, mask) { if (!inst.arms) return; for (let d = 0; d < 4; d++) inst.arms[d].visible = !!(mask & (1 << d)); }
function setHot(inst, on) {
  if (!inst.arms || inst.hot === on) return;
  inst.hot = on;
  const m = on ? K.mat.hot : K.mat.copper;
  for (let d = 0; d < 4; d++) inst.arms[d].material = m;
  inst.pad.material = m;
}

const BUILD = {
  wire: function (inst) {
    inst.upd = function (s) { setHot(inst, since(s.eT, s.i, s.now) >= 0); };
  },
  sw: function (inst, o) {
    const M = K.mat, g = inst.g;
    mesh(rb(4.2, 1.6, 3.2, 0.5), M.black, g, 0, 0.8 + 0.8, 0, true);
    const piv = new K.T.Group(); piv.position.set(0, 2.4, 0); g.add(piv);
    const lever = mesh(K.geo.cyl, M.chrome, piv, 0, 1.4, 0, true); lever.scale.set(0.38, 2.8, 0.38);
    mesh(K.geo.sph, M.red, piv, 0, 2.9, 0, true).scale.setScalar(0.62);
    const led = new K.T.MeshBasicMaterial({ color: 0x40ff60 });
    mesh(K.geo.sph, led, g, 1.5, 2.45, 1.2).scale.setScalar(0.32);
    inst.lever = piv; inst.tilt = o.on ? -0.55 : 0.55;
    inst.upd = function (s) {
      const goal = s.o.on ? -0.55 : 0.55;
      inst.tilt += (goal - inst.tilt) * Math.min(1, s.dt * 18);
      piv.rotation.x = inst.tilt;
      led.color.setHex(s.o.on ? 0x40ff60 : 0xff3322);
      setHot(inst, since(s.eT, s.i, s.now) >= 0);
    };
  },
  reed: function (inst) {
    const M = K.mat, g = inst.g;
    const cap = new K.T.Mesh(new K.T.CapsuleGeometry(1.0, 4.2, 6, 14), M.glass); cap.rotation.z = Math.PI / 2; cap.position.y = 2.0; cap.renderOrder = 2; g.add(cap);
    const a = mesh(new K.T.BoxGeometry(2.5, 0.22, 0.35).translate(1.25, 0, 0), M.chrome, g, -3.2, 2.0, 0);
    const b = mesh(new K.T.BoxGeometry(2.5, 0.22, 0.35).translate(-1.25, 0, 0), M.chrome, g, 3.2, 2.0, 0);
    const glow = glowSprite(g, 2.2, 7, "#8fc8ff");
    inst.upd = function (s) {
      const m = ramp(since(s.magT, s.i, s.now), 0.12);
      a.rotation.z = -0.12 * (1 - m); b.rotation.z = 0.12 * (1 - m);
      glow.material.opacity = m * 0.7;
      setHot(inst, since(s.eT, s.i, s.now) >= 0);
    };
  },
  plug: function (inst) {
    const M = K.mat, g = inst.g;
    mesh(rb(7.8, 4.6, 7, 1.2), [M.charcoal, M.charcoal, M.plugTop, M.charcoal, M.charcoal, M.charcoal], g, 0, BT + 2.3, 0, true);
    const led = new K.T.MeshBasicMaterial({ color: 0xff3322 });
    mesh(K.geo.sph, led, g, 2.9, BT + 4.4, 2.9).scale.setScalar(0.45);
    const cord = new K.T.Mesh(new K.T.TorusGeometry(2.2, 0.45, 8, 16, Math.PI), M.black); cord.position.set(0, BT + 2.0, -3.6); cord.rotation.y = Math.PI / 2; cord.castShadow = true; g.add(cord);
    const glow = glowSprite(g, BT + 4.6, 5, "#ffe066");
    inst.upd = function (s) {
      const on = since(s.eT, s.i, s.now) >= 0;
      led.color.setHex(on ? 0x40ff60 : 0xff3322);
      glow.material.opacity = on ? 0.55 + 0.15 * Math.sin(s.clock * 6) : 0;
    };
  },
  battery: function (inst) {
    const M = K.mat, g = inst.g;
    mesh(rb(1.4, 1.6, 4.6, 0.4), M.black, g, -2.6, BT + 0.8, 0); mesh(rb(1.4, 1.6, 4.6, 0.4), M.black, g, 2.6, BT + 0.8, 0);
    const can = new K.T.CylinderGeometry(2.7, 2.7, 7.4, 28, 1); can.rotateZ(Math.PI / 2);
    mesh(can, [M.battery, M.silver, M.silver], g, -0.2, BT + 2.9, 0, true);
    const nub = new K.T.CylinderGeometry(0.9, 0.9, 0.8, 16); nub.rotateZ(Math.PI / 2);
    mesh(nub, M.chrome, g, -4.0, BT + 2.9, 0, true);
    const glow = glowSprite(g, BT + 3.4, 9, "#ffe066");
    inst.upd = function (s) { glow.material.opacity = since(s.eT, s.i, s.now) >= 0 ? 0.32 + 0.1 * Math.sin(s.clock * 5) : 0; };
  },
  lamp: function (inst) {
    const M = K.mat, f = inst.f;
    mesh(rb(1.2, 3.6, 1.2, 0.4), M.steel, f, -2.6, BT + 1.8, 0, true); mesh(rb(1.2, 3.6, 1.2, 0.4), M.steel, f, 2.6, BT + 1.8, 0, true);
    const house = new K.T.CylinderGeometry(2.3, 1.8, 5.2, 22); house.rotateX(Math.PI / 2);
    mesh(house, M.red, f, 0, BEAM_Y, 0.4, true);
    const ring = new K.T.Mesh(new K.T.TorusGeometry(2.3, 0.4, 8, 24), M.chrome); ring.position.set(0, BEAM_Y, -2.2); f.add(ring);
    const lensMat = new K.T.MeshBasicMaterial({ color: 0x8a8f9c });
    const lens = new K.T.Mesh(new K.T.CircleGeometry(2.05, 24), lensMat); lens.position.set(0, BEAM_Y, -2.25); lens.rotation.y = Math.PI; f.add(lens);
    const glow = glowSprite(f, BEAM_Y, 9, "#fff2a8"); glow.position.z = -3;
    inst.upd = function (s) {
      const k = ramp(since(s.pT, s.i, s.now), 0.12);
      lensMat.color.setRGB(0.54 + 0.46 * k, 0.56 + 0.44 * k, 0.61 + 0.27 * k);
      glow.material.opacity = k * (0.85 + 0.1 * Math.sin(s.clock * 9));
    };
  },
  mirror: function (inst) {
    const M = K.mat, f = inst.f;
    cyl(f, 0.6, 0.8, 2, M.steel, 0, BT + 1, 0);
    mesh(rb(8.6, 6.2, 0.8, 0.3), M.chrome, f, 0, BEAM_Y, 0, true);
    const face1 = mesh(K.geo.unit, M.mirror, f, 0, BEAM_Y, 0.42); face1.scale.set(7.6, 5.2, 1);
    const face2 = mesh(K.geo.unit, M.mirror, f, 0, BEAM_Y, -0.42); face2.scale.set(7.6, 5.2, 1); face2.rotation.y = Math.PI;
    const glow = glowSprite(inst.g, BEAM_Y, 8, "#fff6c8");
    inst.upd = function (s) {
      let hit = 0;
      if (s.sim) for (let b = 0; b < s.sim.beams.length; b++) { const P = s.sim.beams[b].path; for (let k = 0; k < P.length; k++) if (P[k].k === "mirror" && idx(P[k].c, P[k].r) === s.i && P[k].t <= s.now) hit = 1; }
      glow.material.opacity = hit * (0.7 + 0.2 * Math.sin(s.clock * 11));
    };
  },
  solar: function (inst) {
    const M = K.mat, g = inst.g;
    cyl(g, 0.5, 0.7, 2.4, M.steel, 0, BT + 1.2, 0);
    const mat = M.solar.clone();
    const panel = mesh(rb(8.4, 0.5, 7.2, 0.2), [M.silver, M.silver, mat, M.silver, M.silver, M.silver], g, 0, BT + 2.9, 0, true);
    panel.rotation.x = 0.36;
    const glow = glowSprite(g, BT + 3.6, 11, "#9fd8ff");
    inst.upd = function (s) {
      const k = ramp(since(s.litT, s.i, s.now), 0.3);
      mat.emissive.setRGB(0.1 * k, 0.25 * k, 0.55 * k * (0.8 + 0.2 * Math.sin(s.clock * 7)));
      glow.material.opacity = k * 0.45;
    };
  },
  fan: function (inst) {
    const M = K.mat, f = inst.f, Y = BT + 4.2;
    mesh(rb(1.6, 1.2, 4, 0.4), M.charcoal, f, -2.8, BT + 0.6, 0); mesh(rb(1.6, 1.2, 4, 0.4), M.charcoal, f, 2.8, BT + 0.6, 0);
    [[0, 3.75, 8.4, 0.9], [0, -3.75, 8.4, 0.9], [3.75, 0, 0.9, 8.4], [-3.75, 0, 0.9, 8.4]].forEach(function (b) { mesh(rb(b[2], b[3], 2.6, 0.35), M.white, f, b[0], Y + b[1], 0, true); });
    const ring = new K.T.Mesh(new K.T.TorusGeometry(3.3, 0.3, 8, 28), M.white); ring.position.set(0, Y, 0); f.add(ring);
    [2.3, 1.2].forEach(function (r) { const gr = new K.T.Mesh(new K.T.TorusGeometry(r, 0.09, 6, 24), M.steel); gr.position.set(0, Y, -1.1); f.add(gr); });
    for (let k = 0; k < 4; k++) { const sp = mesh(new K.T.BoxGeometry(6.6, 0.14, 0.14), M.steel, f, 0, Y, -1.1); sp.rotation.z = k * Math.PI / 4; }
    const rotor = new K.T.Group(); rotor.position.set(0, Y, 0.2); f.add(rotor);
    mesh(K.geo.sph, M.blue, rotor, 0, 0, 0).scale.set(0.9, 0.9, 0.6);
    for (let k = 0; k < 3; k++) { const bl = mesh(K.geo.blade, M.blue, rotor, 0, 0, 0, true); bl.scale.set(1.25, 2.9, 0.18); bl.position.set(Math.cos(k * TAU / 3 + Math.PI / 2) * 1.8, Math.sin(k * TAU / 3 + Math.PI / 2) * 1.8, 0); bl.rotation.z = k * TAU / 3; bl.rotation.y = 0.35; }
    inst.upd = function (s) {
      const k = ramp(since(s.pT, s.i, s.now), DT.fanSpin);
      inst.ang += s.dt * 22 * k * k; rotor.rotation.z = inst.ang;
    };
  },
  turbine: function (inst) {
    const M = K.mat, g = inst.g, Y = BT + 8;
    cyl(g, 0.3, 0.55, 8, M.white, 0, BT + 4, 0, 12, true);
    const head = new K.T.Group(); head.position.y = Y; g.add(head);
    const nac = new K.T.CapsuleGeometry(0.7, 1.6, 4, 10); nac.rotateX(Math.PI / 2);
    mesh(nac, M.white, head, 0, 0, 0.3, true);
    const rotor = new K.T.Group(); rotor.position.z = -0.9; head.add(rotor);
    mesh(K.geo.sph, M.orange, rotor, 0, 0, 0).scale.set(0.6, 0.6, 0.7);
    for (let k = 0; k < 3; k++) {
      const arm = new K.T.Group(); arm.rotation.z = k * TAU / 3; rotor.add(arm);
      const bl = mesh(K.geo.blade, M.white, arm, 0, 2.1, 0, true); bl.scale.set(0.42, 2.0, 0.12); bl.rotation.y = 0.3;
    }
    inst.head = head; inst.yaw = Math.PI;
    inst.upd = function (s) {
      const w = since(s.windT, s.i, s.now), k = ramp(w, DT.turbine);
      const goal = w >= 0 ? -s.sim.windFrom[s.i] * Math.PI / 2 : Math.PI;
      let dy = goal - inst.yaw; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
      inst.yaw += dy * Math.min(1, s.dt * 6); head.rotation.y = inst.yaw;
      inst.ang += s.dt * 16 * k * k; rotor.rotation.z = inst.ang;
    };
  },
  motor: function (inst) {
    const M = K.mat, g = inst.g;
    cyl(g, 3, 3, 3.6, M.silver, 0, BT + 1.8, 0, 26, true);
    cyl(g, 3.05, 3.05, 1.0, M.red, 0, BT + 1.2, 0, 26);
    cyl(g, 0.5, 0.5, 1.2, M.steel, 0, GEAR_Y - 0.2, 0);
    const gr = mesh(K.geo.gear, M.brass, g, 0, GEAR_Y, 0, true);
    inst.gear = gr;
    inst.upd = function (s) {
      const k = ramp(since(s.spinT, s.i, s.now), 0.3);
      inst.ang += s.dt * 2.6 * k * inst.spinSign; gr.rotation.y = inst.ang + (inst.spinSign < 0 ? Math.PI / 12 : 0);
    };
  },
  gear: function (inst) {
    const M = K.mat, g = inst.g;
    cyl(g, 0.7, 0.9, GEAR_Y - BT, M.steel, 0, (GEAR_Y + BT) / 2, 0, 12);
    const gr = mesh(K.geo.gear, M.brass, g, 0, GEAR_Y, 0, true);
    cyl(gr, 1.2, 1.2, 0.5, M.chrome, 0, 1.15, 0);
    inst.upd = function (s) {
      const k = ramp(since(s.spinT, s.i, s.now), 0.25);
      inst.ang += s.dt * 2.6 * k * inst.spinSign; gr.rotation.y = inst.ang + (inst.spinSign < 0 ? Math.PI / 12 : 0);
    };
  },
  dynamo: function (inst) {
    const M = K.mat, g = inst.g;
    cyl(g, 3, 3, 3.6, M.blue, 0, BT + 1.8, 0, 26, true);
    for (let k = 0; k < 4; k++) { const tr = new K.T.Mesh(new K.T.TorusGeometry(3.05, 0.22, 6, 26), M.coil); tr.rotation.x = Math.PI / 2; tr.position.y = BT + 1.0 + k * 0.48; g.add(tr); }
    const led = new K.T.MeshBasicMaterial({ color: 0x223355 });
    mesh(K.geo.sph, led, g, 0, BT + 2.6, 3.05).scale.setScalar(0.5);
    cyl(g, 0.5, 0.5, 1.2, M.steel, 0, GEAR_Y - 0.2, 0);
    const gr = mesh(K.geo.gear, M.brass, g, 0, GEAR_Y, 0, true);
    inst.upd = function (s) {
      const k = ramp(since(s.spinT, s.i, s.now), 0.3);
      inst.ang += s.dt * 2.6 * k * inst.spinSign; gr.rotation.y = inst.ang + (inst.spinSign < 0 ? Math.PI / 12 : 0);
      led.color.setHex(since(s.srcT, s.i, s.now) >= 0 ? 0x7dff3a : 0x223355);
    };
  },
  magnet: function (inst) {
    const M = K.mat, g = inst.g, Y = BT + 5.4;
    const arc = new K.T.Mesh(new K.T.TorusGeometry(2.2, 0.85, 10, 24, Math.PI), M.red); arc.position.y = Y; arc.castShadow = true; g.add(arc);
    [-2.2, 2.2].forEach(function (x) {
      cyl(g, 0.85, 0.85, Y - BT - 1.2, M.red, x, (Y + BT + 1.2) / 2, 0, 14, true);
      cyl(g, 0.9, 0.9, 1.2, M.chrome, x, BT + 0.6, 0, 14);
      for (let k = 0; k < 4; k++) { const tr = new K.T.Mesh(new K.T.TorusGeometry(1.0, 0.24, 6, 16), M.coil); tr.rotation.x = Math.PI / 2; tr.position.set(x, BT + 1.8 + k * 0.55, 0); g.add(tr); }
    });
    const ringMat = new K.T.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0, blending: K.T.AdditiveBlending, depthWrite: false });
    const rings = [0, 1, 2].map(function () { const r = new K.T.Mesh(new K.T.TorusGeometry(1, 0.08, 6, 32), ringMat.clone()); r.rotation.x = Math.PI / 2; r.position.y = BT + 0.6; g.add(r); return r; });
    inst.upd = function (s) {
      const on = since(s.pT, s.i, s.now) >= 0;
      for (let k = 0; k < 3; k++) {
        const u = ((s.clock * 0.9 + k / 3) % 1);
        rings[k].scale.setScalar(2.5 + u * 4.5); rings[k].position.y = BT + 0.6 + u * 3;
        rings[k].material.opacity = on ? (1 - u) * 0.8 : 0;
      }
    };
  },
  tv: function (inst) {
    const M = K.mat, g = inst.g, Y = BT + 3.8;
    mesh(rb(8.8, 6.6, 7.4, 0.9), M.grain, g, 0, Y, -0.2, true);
    mesh(rb(7.4, 5.6, 0.5, 0.4), M.black, g, -0.6, Y, 3.45);
    const scr = dynTex(128, 96), smat = new K.T.MeshBasicMaterial({ map: scr.t });
    const sp = mesh(K.geo.unit, smat, g, -1.0, Y, 3.74); sp.scale.set(5.2, 4.2, 1);
    [[2.75, Y + 1.0], [2.75, Y - 0.8]].forEach(function (k) { const kn = new K.T.CylinderGeometry(0.5, 0.5, 0.5, 12); kn.rotateX(Math.PI / 2); mesh(kn, M.chrome, g, k[0], k[1], 3.75); });
    [-1, 1].forEach(function (sg) {
      const ant = cyl(g, 0.1, 0.1, 6, M.chrome, sg * 1.4, Y + 3.3 + 2.6, -1, 6, true); ant.rotation.z = -sg * 0.5;
      mesh(K.geo.sph, M.chrome, g, sg * 2.9, Y + 3.3 + 5.2, -1).scale.setScalar(0.32);
    });
    mesh(K.geo.sph, M.black, g, 0, Y + 3.4, -1).scale.set(1.2, 0.5, 0.8);
    const glow = glowSprite(g, Y, 14, "#7fb8ff"); glow.position.z = 4;
    inst.upd = function (s) {
      const w = since(s.pT, s.i, s.now), k = w < 0 ? 0 : Math.min(1, w / 0.35);
      const frame = k <= 0 ? -2 : k < 1 ? Math.floor(k * 20) : 100 + Math.floor(s.clock * 10);
      if (frame !== scr.last) { scr.last = frame; tvScreen(scr.g, 128, 96, k > 0, k, s.clock, K.script); scr.t.needsUpdate = true; }
      glow.material.opacity = k >= 1 ? 0.45 : 0;
    };
  },
  boombox: function (inst) {
    const M = K.mat, g = inst.g, Y = BT + 2.6;
    mesh(rb(9.2, 4.8, 3.6, 0.8), [M.silver, M.silver, M.silver, M.silver, M.boom, M.silver], g, 0, Y, 0, true);
    const handle = new K.T.Mesh(new K.T.TorusGeometry(3.2, 0.3, 8, 20, Math.PI), M.chrome); handle.position.set(0, Y + 2.3, 0); handle.castShadow = true; g.add(handle);
    const cones = [];
    [-2.95, 2.95].forEach(function (x) {
      const ring = new K.T.Mesh(new K.T.TorusGeometry(1.75, 0.25, 8, 24), M.chrome); ring.position.set(x, Y, 1.85); g.add(ring);
      const cg = new K.T.CylinderGeometry(1.6, 0.5, 0.7, 22, 1, true); cg.rotateX(-Math.PI / 2);
      const cone = mesh(cg, M.black, g, x, Y, 1.55); cones.push(cone);
      mesh(K.geo.sph, M.charcoal, g, x, Y, 1.6).scale.set(0.5, 0.5, 0.3);
    });
    const eqMat = new K.T.MeshBasicMaterial({ color: 0x7dff3a });
    const eq = [];
    for (let k = 0; k < 5; k++) { const b = mesh(new K.T.BoxGeometry(0.42, 1, 0.1).translate(0, 0.5, 0), eqMat, g, -0.95 + k * 0.48, Y - 2.0, 1.86); b.scale.y = 0.05; eq.push(b); }
    const glow = glowSprite(g, Y, 12, "#ffb0ff");
    inst.upd = function (s) {
      const on = since(s.pT, s.i, s.now) >= 0, beat = on ? Math.pow(Math.max(0, Math.sin(s.clock * 12.3)), 6) : 0;
      for (let k = 0; k < 2; k++) cones[k].position.z = 1.55 + beat * 0.35;
      for (let k = 0; k < 5; k++) eq[k].scale.y = on ? 0.25 + 0.75 * Math.abs(Math.sin(s.clock * (5 + k * 1.7) + k)) : 0.05;
      glow.material.opacity = on ? 0.2 + beat * 0.3 : 0;
    };
  },
  arcade: function (inst) {
    const M = K.mat, g = inst.g, T = K.T;
    const sh = new T.Shape();
    [[-3, 0], [-3, 9.6], [1.4, 9.6], [2.2, 9.1], [2.2, 7.9], [0.9, 7.7], [1.7, 5.5], [2.9, 5.1], [2.9, 4.4], [2.1, 4.1], [2.1, 0]].forEach(function (p, k) { if (k) sh.lineTo(p[0], p[1]); else sh.moveTo(p[0], p[1]); });
    sh.closePath();
    const cab = new T.ExtrudeGeometry(sh, { depth: 6, bevelEnabled: false });
    cab.rotateY(-Math.PI / 2); cab.translate(3, 0, 0);
    mesh(cab, [M.side, M.black], g, 0, BT, -0.1, true);
    const mq = mesh(K.geo.unit, M.marquee.clone(), g, 0, BT + 8.5, 2.12); mq.scale.set(5.9, 1.15, 1);
    const scr = dynTex(96, 112), smat = new T.MeshBasicMaterial({ map: scr.t });
    const sp = mesh(K.geo.unit, smat, g, 0, BT + 6.6, 1.36); sp.scale.set(4.6, 2.25, 1); sp.rotation.x = -Math.atan2(0.8, 2.2);
    cyl(g, 0.12, 0.12, 0.9, M.black, -1.2, BT + 5.65, 2.4, 6);
    mesh(K.geo.sph, M.red, g, -1.2, BT + 6.15, 2.4).scale.setScalar(0.38);
    [[0.6, 0xffd23f], [1.5, 0x3fe0ff]].forEach(function (b) { cyl(g, 0.38, 0.38, 0.25, new T.MeshPhongMaterial({ color: b[1], specular: 0xffffff, shininess: 90 }), b[0], BT + 5.3, 2.3, 12); });
    const glow = glowSprite(g, BT + 7.5, 15, "#ff9be0"); glow.position.z = 3;
    inst.upd = function (s) {
      const on = since(s.pT, s.i, s.now) >= 0;
      const frame = on ? Math.floor(s.clock * 12) : -2;
      if (frame !== scr.last) { scr.last = frame; arcadeScreen(scr.g, 96, 112, on, s.clock); scr.t.needsUpdate = true; }
      mq.material.color.setScalar(on ? 1 + 0.15 * Math.sin(s.clock * 8) : 0.42);
      glow.material.opacity = on ? 0.4 : 0;
    };
  },
  lava: function (inst) {
    const M = K.mat, g = inst.g, T = K.T;
    cyl(g, 1.3, 2.6, 2.8, M.purple, 0, BT + 1.4, 0, 22, true);
    const prof = [[1.25, 0], [1.9, 1.5], [2.15, 3], [1.9, 4.6], [1.4, 6], [1.0, 6.4]].map(function (p) { return new T.Vector2(p[0], p[1]); });
    const gl = new T.Mesh(new T.LatheGeometry(prof, 22), M.lavaGlass.clone()); gl.position.y = BT + 2.8; gl.renderOrder = 3; g.add(gl);
    cyl(g, 1.0, 0.6, 1.4, M.purple, 0, BT + 2.8 + 6.9, 0, 18, true);
    const blobMat = new T.MeshPhongMaterial({ color: 0xffb21a, emissive: 0x000000, specular: 0xffffff, shininess: 80 });
    const blobs = [];
    for (let k = 0; k < 4; k++) blobs.push(mesh(K.geo.sph, blobMat, g, 0, 0, 0));
    const glow = glowSprite(g, BT + 5.5, 13, "#ff9a3a");
    inst.upd = function (s) {
      const k = ramp(since(s.pT, s.i, s.now), 0.6), tt = s.clock * (0.25 + k * 0.5);
      for (let n = 0; n < 4; n++) {
        const u = 0.5 + 0.45 * Math.sin(tt * (0.7 + n * 0.23) + n * 1.9);
        blobs[n].position.set(Math.sin(n * 2.1 + tt) * 0.5, BT + 3.3 + u * 4.6, Math.cos(n * 1.3 + tt) * 0.5);
        blobs[n].scale.set(0.75 - n * 0.08, 0.95 - n * 0.06 + 0.2 * Math.sin(tt * 2 + n), 0.75 - n * 0.08);
      }
      blobMat.emissive.setRGB(0.9 * k, 0.32 * k, 0.02 * k);
      gl.material.opacity = 0.32 + 0.22 * k;
      glow.material.opacity = k * 0.55;
    };
  },
  calc: function (inst) {
    const M = K.mat, g = inst.g, T = K.T;
    const body = new T.Group(); body.position.set(0, BT + 1.5, 0.3); body.rotation.x = 0.32; g.add(body);
    cyl(g, 0.6, 0.6, 2.4, M.steel, 0, BT + 0.8, -1.5, 10);
    mesh(rb(6.6, 1.1, 8.6, 0.5), [M.charcoal, M.charcoal, M.calc, M.charcoal, M.charcoal, M.charcoal], body, 0, 0, 0, true);
    const lcd = dynTex(96, 28), lmat = new T.MeshBasicMaterial({ map: lcd.t });
    const lp = mesh(K.geo.unit, lmat, body, 0, 0.57, -2.0); lp.rotation.x = -Math.PI / 2; lp.scale.set(5.2, 1.5, 1);
    const glow = glowSprite(g, BT + 3, 10, "#d8ffb0");
    inst.upd = function (s) {
      const k = since(s.litT, s.i, s.now), on = k >= 0, fr = on ? (k < 0.5 ? Math.floor(k * 12) : 99) : -1;
      if (fr !== lcd.last) {
        lcd.last = fr;
        const c = lcd.g;
        c.fillStyle = on ? "#b8c8a4" : "#8e968c"; c.fillRect(0, 0, 96, 28);
        if (on) { c.fillStyle = "#1a2416"; c.font = "bold 20px " + HUD_FONT; c.textAlign = "right"; c.textBaseline = "middle"; c.fillText(k < 0.5 ? String(Math.floor(k * 4000)) : "1989.", 90, 15); }
        lcd.t.needsUpdate = true;
      }
      glow.material.opacity = on ? 0.35 : 0;
    };
  },
  turntable: function (inst) {
    const M = K.mat, g = inst.g, T = K.T;
    mesh(rb(9.2, GEAR_Y - BT, 8.8, 0.6), M.charcoal, g, 0, (GEAR_Y + BT) / 2, 0, true);
    const plat = new T.Group(); plat.position.y = GEAR_Y; g.add(plat);
    mesh(K.geo.gear, M.chrome, plat, 0, 0, 0, true);
    const rec = new T.CylinderGeometry(4.0, 4.0, 0.2, 40);
    mesh(rec, [M.black, M.record, M.black], plat, 0, 1.1, 0, true);
    const arm = new T.Group(); arm.position.set(3.6, GEAR_Y + 1.6, -3.4); g.add(arm);
    cyl(g, 0.5, 0.6, 1.6, M.chrome, 3.6, GEAR_Y + 0.8, -3.4, 10);
    const bar = mesh(new T.BoxGeometry(0.28, 0.28, 5.6).translate(0, 0, 2.8), M.chrome, arm, 0, 0, 0, true); bar.rotation.y = -0.38;
    inst.arm = arm;
    const glow = glowSprite(g, GEAR_Y + 2, 12, "#ffe08a");
    inst.upd = function (s) {
      const k = ramp(since(s.spinT, s.i, s.now), 0.4);
      inst.ang += s.dt * 2.6 * k * inst.spinSign; plat.rotation.y = inst.ang + (inst.spinSign < 0 ? Math.PI / 12 : 0);
      arm.rotation.y = -0.3 * k;
      glow.material.opacity = k * 0.35;
    };
  },
  alarm: function (inst) {
    const M = K.mat, g = inst.g, T = K.T;
    const body = new T.Group(); body.position.y = BT + 3.6; g.add(body);
    const can = new T.CylinderGeometry(2.9, 2.9, 2.0, 30); can.rotateX(Math.PI / 2);
    mesh(can, [M.red, M.red, M.red], body, 0, 0, 0, true);
    const fc = new T.Mesh(new T.CircleGeometry(2.5, 30), M.clock); fc.position.z = 1.02; body.add(fc);
    const rim = new T.Mesh(new T.TorusGeometry(2.6, 0.25, 8, 30), M.chrome); rim.position.z = 1.0; body.add(rim);
    const bellGeo = new T.SphereGeometry(1.5, 16, 8, 0, TAU, 0, Math.PI / 2);
    [-1.7, 1.7].forEach(function (x) { const b = mesh(bellGeo, M.chrome, body, x, 2.6, 0, true); b.rotation.z = -Math.sign(x) * 0.5; });
    const ham = new T.Group(); ham.position.set(0, 2.4, 0); body.add(ham);
    cyl(ham, 0.12, 0.12, 1.6, M.chrome, 0, 0.8, 0, 6); mesh(K.geo.sph, M.chrome, ham, 0, 1.6, 0).scale.setScalar(0.4);
    [-1.6, 1.6].forEach(function (x) { mesh(K.geo.sph, M.chrome, g, x, BT + 0.6, 0.4).scale.setScalar(0.65); });
    const glow = glowSprite(g, BT + 4, 16, "#ff4030");
    inst.upd = function (s) {
      const on = since(s.pT, s.i, s.now) >= 0 && !Shell.reduced;
      body.rotation.z = on ? Math.sin(s.clock * 60) * 0.08 : 0;
      body.position.x = on ? Math.sin(s.clock * 47) * 0.25 : 0;
      ham.rotation.z = on ? Math.sin(s.clock * 70) * 0.7 : 0;
      glow.material.opacity = since(s.pT, s.i, s.now) >= 0 ? 0.5 + 0.4 * Math.sin(s.clock * 20) : 0;
    };
  },
  block: function (inst, o, i) {
    const M = K.mat, g = inst.g, rnd = rng(i * 13 + 5);
    let y = 0;
    for (let k = 0; k < 2; k++) {
      const w = 9.2 - k * 0.8 - rnd() * 0.4, d = 8.6 - k * 0.6 - rnd() * 0.4, h = 3.4 + rnd() * 0.6, ci = Math.floor(rnd() * BOX_COLS.length);
      const col = BOX_COLS[ci], side = new K.T.MeshPhongMaterial({ color: new K.T.Color(shade(col, -0.1)), specular: 0xaaaaaa, shininess: 70 });
      side.envMap = K.env; side.combine = K.T.AddOperation; side.reflectivity = 0.08;
      const lid = new K.T.MeshPhongMaterial({ map: K.tex(boxCanvas(w, d, col, K.script, i * 3 + k)), specular: 0xbbbbbb, shininess: 90 });
      const m = mesh(rb(w, h, d, 0.6), [side, side, lid, side, side, side], g, (rnd() - 0.5) * 0.6, y + h / 2, (rnd() - 0.5) * 0.6, true);
      m.rotation.y = (rnd() - 0.5) * 0.25;
      y += h;
    }
  },
  puddle: function (inst, o, i) {
    const mt = new K.T.MeshPhongMaterial({ map: K.tex(sodaCanvas(i * 7 + 1)), transparent: true, depthWrite: false, specular: 0xffffff, shininess: 140 });
    mt.envMap = K.env; mt.combine = K.T.AddOperation; mt.reflectivity = 0.12;
    const m = new K.T.Mesh(K.geo.unit, mt);
    m.rotation.x = -Math.PI / 2; m.position.y = 0.06 + (i % 3) * 0.004; m.scale.set(12.6, 12.6, 1); m.renderOrder = 1; m.receiveShadow = true;
    inst.g.add(m);
    inst.soda = m;
  },
  glass: function (inst) {
    const M = K.mat, g = inst.g;
    const m = mesh(rb(9.4, 8, 9.4, 0.9), M.glass, g, 0, 4, 0); m.renderOrder = 4; m.receiveShadow = false;
    const e = new K.T.LineSegments(new K.T.EdgesGeometry(new K.T.BoxGeometry(9.0, 7.6, 9.0)), new K.T.LineBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.55 }));
    e.position.y = 4; g.add(e);
  },
  grate: function (inst) {
    const M = K.mat, g = inst.g;
    mesh(new K.T.BoxGeometry(9.2, 7.6, 9.2), M.vent, g, 0, 3.8, 0, true);
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { mesh(rb(0.9, 7.8, 0.9, 0.3), M.steel, g, q[0] * 4.3, 3.9, q[1] * 4.3, true); });
  }
};

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x1b2a6b, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = (parseInt(T.REVISION, 10) || 0) >= 182 ? T.PCFShadowMap : T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(CAM_FOV, W / H, 20, 3000);
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
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;
  K = makeKit(T, tex, tEnv, script, aniso);
  const M = K.mat;

  /* lights: a desk lamp's worth from the upper left, a cool fill from the right */
  scene.add(new T.HemisphereLight(0xffffff, 0x9a8ad0, 1.25));
  const key = new T.DirectionalLight(0xfff4e0, 2.6);
  key.position.set(-70, 150, 80); key.target.position.set(0, 0, 0);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 85; sc.bottom = -85; sc.near = 40; sc.far = 400; sc.updateProjectionMatrix();
  key.shadow.bias = -0.0008; key.shadow.normalBias = 0.4;
  scene.add(key); scene.add(key.target);
  const fill = new T.DirectionalLight(0xdfeaff, 0.65); fill.position.set(90, 60, 120); scene.add(fill);

  /* the desk and the wall behind it */
  const tDesk = tex(woodCanvas(17, 26), true);
  const desk = new T.Mesh(new T.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new T.MeshPhongMaterial({ map: tDesk, specular: 0x444444, shininess: 30 }));
  (function () { const uv = desk.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 7, uv.getY(i) * 7); })();
  desk.position.set(0, DESK_Y, -150); desk.receiveShadow = true; scene.add(desk);
  const wall = new T.Mesh(new T.PlaneGeometry(900, 400), new T.MeshBasicMaterial({ map: tex(wallCanvas()) }));
  wall.position.set(0, DESK_Y + 200, -360); scene.add(wall);

  /* the box: navy plastic walls with an orange trim, the circuit board inside */
  const shellMat = new T.MeshPhongMaterial({ color: 0x1d44b8, specular: 0xffffff, shininess: 90 });
  shellMat.envMap = tEnv; shellMat.combine = T.AddOperation; shellMat.reflectivity = 0.12;
  const trim = M.orange, hH = WALL_TOP - DESK_Y, hy = (WALL_TOP + DESK_Y) / 2;
  const OX = BX + WALL_T, OZ = BZ + WALL_T;
  [[0, OZ - WALL_T / 2, OX * 2, WALL_T], [0, -OZ + WALL_T / 2, OX * 2, WALL_T], [OX - WALL_T / 2, 0, WALL_T, BZ * 2], [-OX + WALL_T / 2, 0, WALL_T, BZ * 2]].forEach(function (w) {
    const m = mesh(roundBox(T, w[2], hH, w[3], 1.1), shellMat, scene, w[0], hy, w[1], true); m.receiveShadow = true;
    mesh(roundBox(T, w[2] + (w[2] > w[3] ? 0 : 0.3), 0.9, w[3] + 0.3, 0.4), trim, scene, w[0], WALL_TOP + 0.2, w[1], false);
  });
  const pcb = new T.Mesh(new T.PlaneGeometry(BX * 2, BZ * 2).rotateX(-Math.PI / 2), new T.MeshPhongMaterial({ map: tex(pcbCanvas(script)), specular: 0x335544, shininess: 30 }));
  pcb.receiveShadow = true; scene.add(pcb);
  const under = new T.Mesh(new T.PlaneGeometry(BX * 2, BZ * 2).rotateX(-Math.PI / 2), M.black); under.position.y = -0.5; scene.add(under);
  // a wordmark plate on the front of the box, and chrome latches
  const cPlate = mkCanvas(512, 128), pg = cPlate.getContext("2d");
  rrectPath(pg, 4, 4, 504, 120, 26); pg.fillStyle = "#0d1f5c"; pg.fill(); pg.lineWidth = 6; pg.strokeStyle = "#ffe45c"; pg.stroke();
  drawScript(pg, script, 256, 64, 460, 104);
  const plate = mesh(new T.PlaneGeometry(34, 8.5), new T.MeshPhongMaterial({ map: tex(cPlate), specular: 0xffffff, shininess: 90 }), scene, 0, hy, OZ + 0.08);
  plate.receiveShadow = false;
  [-1, 1].forEach(function (s) { mesh(roundBox(T, 5, 3, 1.2, 0.5), M.chrome, scene, s * (OX - 9), WALL_TOP - 3, OZ + 0.3, true); });

  /* the lid, standing open behind the board, with the LED ribbon board across its top */
  const lid = new T.Group(); lid.position.set(0, WALL_TOP, -OZ); lid.rotation.x = -LID_LEAN; scene.add(lid);
  const lidFace = new T.MeshPhongMaterial({ map: tex(lidCanvas(script)), specular: 0x777777, shininess: 40 });
  mesh(roundBox(T, OX * 2, LID_H, 2.4, 0.9), [shellMat, shellMat, shellMat, shellMat, lidFace, shellMat], lid, 0, LID_H / 2, 1.2, true);
  [-1, 1].forEach(function (s) { const hg = new T.CylinderGeometry(0.9, 0.9, 10, 12); hg.rotateZ(Math.PI / 2); mesh(hg, M.chrome, lid, s * (OX - 12), 0.4, 0.4); });
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas()); tDot.wrapS = tDot.wrapT = T.RepeatWrapping; tDot.anisotropy = aniso;
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
  const ledY = LID_H - 4.6;
  mesh(new T.BoxGeometry(LED_W + 3, LED_H + 2.2, 0.7), new T.MeshBasicMaterial({ color: 0x05070d }), lid, 0, ledY, 2.6);
  const ledFace = new T.Mesh(new T.PlaneGeometry(LED_W, LED_H), ledMat); ledFace.position.set(0, ledY, 2.98); lid.add(ledFace);

  /* a few things lying on the desk */
  (function () {
    const rnd = rng(8);
    const can = new T.Group(); can.position.set(-OX - 16, DESK_Y, 30); scene.add(can);
    cyl(can, 3.3, 3.3, 12, new T.MeshPhongMaterial({ color: 0xe3231a, specular: 0xffffff, shininess: 110 }), 0, 6, 0, 22, true);
    cyl(can, 3.0, 3.3, 0.8, M.chrome, 0, 12.4, 0, 22, true);
    for (let k = 0; k < 3; k++) {
      const w = 13 + rnd() * 3, d = 11, h = 2.4, ci = Math.floor(rnd() * BOX_COLS.length);
      const lidM = new T.MeshPhongMaterial({ map: tex(boxCanvas(w, d, BOX_COLS[ci], script, 40 + k)), specular: 0xbbbbbb, shininess: 90 });
      const sideM = new T.MeshPhongMaterial({ color: new T.Color(shade(BOX_COLS[ci], -0.1)), specular: 0xaaaaaa, shininess: 70 });
      const m = mesh(roundBox(T, w, h, d, 0.5), [sideM, sideM, lidM, sideM, sideM, sideM], scene, OX + 16 + (rnd() - 0.5) * 3, DESK_Y + h / 2 + k * h, -10 + (rnd() - 0.5) * 3, true);
      m.rotation.y = (rnd() - 0.5) * 0.7;
    }
  })();

  /* the overlay on the sockets: build hints, the hover square, the keyboard cursor; and a second one for dark targets */
  function overlayPlane(y, order) {
    const c = overlayCanvas(), t = tex(c);
    const m = new T.Mesh(new T.PlaneGeometry(COLS * CELL, ROWS * CELL).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.position.y = y; m.renderOrder = order; scene.add(m);
    return { c: c, g: c.getContext("2d"), t: t, m: m, key: "" };
  }
  const over = overlayPlane(0.16, 5), fail = overlayPlane(0.18, 6);

  /* light beams: a pool of glowing rods, each a core and a soft sleeve */
  const beamCore = new T.MeshBasicMaterial({ color: 0xfff8d0, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false });
  const beamGlow = new T.MeshBasicMaterial({ color: 0xffd860, transparent: true, opacity: 0.3, blending: T.AdditiveBlending, depthWrite: false });
  const rodCore = new T.CylinderGeometry(0.42, 0.42, 1, 10, 1, true).translate(0, 0.5, 0), rodGlow = new T.CylinderGeometry(1.25, 1.25, 1, 12, 1, true).translate(0, 0.5, 0);
  const beams = [];
  for (let k = 0; k < 28; k++) {
    const gr = new T.Group(); gr.visible = false; scene.add(gr);
    const a = new T.Mesh(rodCore, beamCore), b = new T.Mesh(rodGlow, beamGlow);
    a.renderOrder = b.renderOrder = 8; gr.add(a); gr.add(b); beams.push(gr);
  }
  const spots = [];                                         // a hot spot where a beam lands or bounces
  for (let k = 0; k < 12; k++) { const sp = new T.Sprite(new T.SpriteMaterial({ map: K.tGlow, blending: T.AdditiveBlending, depthWrite: false, transparent: true, color: 0xfff0a0 })); sp.visible = false; sp.scale.set(7, 7, 1); scene.add(sp); spots.push(sp); }
  /* moving air: streaks drawn as one instanced mesh */
  const streak = new T.InstancedMesh(new T.BoxGeometry(3.2, 0.3, 0.3), new T.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.75, depthWrite: false }), 120);
  streak.count = 0; streak.frustumCulled = false; streak.renderOrder = 7; scene.add(streak);

  const partsRoot = new T.Group(); scene.add(partsRoot);
  // the keyboard cursor: a glowing square frame that rides around the base of whatever is in the socket
  const cursor = new T.Group(), curMat = new T.MeshBasicMaterial({ color: 0xffe838 });
  [[0, -4.9, 10.2, 0.5], [0, 4.9, 10.2, 0.5], [-4.9, 0, 0.5, 10.2], [4.9, 0, 0.5, 10.2]].forEach(function (b) { const m = new T.Mesh(new T.BoxGeometry(b[2], 0.6, b[3]), curMat); m.position.set(b[0], 0, b[1]); cursor.add(m); });
  cursor.visible = false; scene.add(cursor);

  /* frame the box: the closest camera that keeps the board, its walls and the lid on screen */
  const sinP = Math.sin(CAM_PITCH), cosP = Math.cos(CAM_PITCH), tanF = Math.tan(CAM_FOV * Math.PI / 360), v = new T.Vector3();
  lid.updateMatrixWorld(true);
  const pts = [[-OX, WALL_TOP, OZ], [OX, WALL_TOP, OZ], [-OX, DESK_Y + 3, OZ], [OX, DESK_Y + 3, OZ], [-OX, WALL_TOP, -OZ], [OX, WALL_TOP, -OZ]];
  [[-OX, LID_H], [OX, LID_H]].forEach(function (p) { const w = new T.Vector3(p[0], p[1], 2.4).applyMatrix4(lid.matrixWorld); pts.push([w.x, w.y, w.z]); });
  function bounds(tx, tz, d) {
    camera.position.set(tx, d * sinP, tz + d * cosP); camera.lookAt(tx, 0, tz); camera.updateMatrixWorld();
    let x1 = 1e9, x2 = -1e9, y1 = 1e9, y2 = -1e9;
    for (let i = 0; i < pts.length; i++) {
      v.set(pts[i][0], pts[i][1], pts[i][2]).project(camera);
      const px = (v.x * 0.5 + 0.5) * W, py = (-v.y * 0.5 + 0.5) * H;
      if (px < x1) x1 = px; if (px > x2) x2 = px; if (py < y1) y1 = py; if (py > y2) y2 = py;
    }
    return { x1: x1, x2: x2, y1: y1, y2: y2 };
  }
  function centered(d) {
    let tx = 0, tz = 0, bb = null;
    const ppu = H / (2 * d * tanF);
    for (let n = 0; n < 8; n++) {
      bb = bounds(tx, tz, d);
      tx += ((bb.x1 + bb.x2) / 2 - (SAFE.x1 + SAFE.x2) / 2) / ppu;
      tz += ((bb.y1 + bb.y2) / 2 - (SAFE.y1 + SAFE.y2) / 2) / (ppu * sinP);
    }
    return { tx: tx, tz: tz, d: d, bb: bounds(tx, tz, d) };
  }
  let lo = 80, hi = 2000, fit = null;
  for (let n = 0; n < 18; n++) {
    const mid = (lo + hi) / 2, c = centered(mid);
    if (c.bb.x2 - c.bb.x1 <= SAFE.x2 - SAFE.x1 && c.bb.y2 - c.bb.y1 <= SAFE.y2 - SAFE.y1) { fit = c; hi = mid; } else lo = mid;
  }
  fit = fit || centered(2000);

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) { R.dirty = true; R.icons = null; } });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, key: key, script: script, partsRoot: partsRoot, objs: new Array(COLS * ROWS).fill(null),
    over: over, fail: fail, cursor: cursor, beams: beams, spots: spots, streak: streak, fit: fit, sinP: sinP, cosP: cosP, lid: lid, ghost: null,
    camPos: new T.Vector3(), camTgt: new T.Vector3(), camReady: false, v: new T.Vector3(), v2: new T.Vector3(), m4: new T.Matrix4(), q: new T.Quaternion(), up: new T.Vector3(0, 1, 0),
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0, icons: null,
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
    R.dirty = true; R.icons = null;
  }
  if (left !== R.left || top !== R.top) { R.left = left; R.top = top; R.gl.style.left = left + "px"; R.gl.style.top = top + "px"; }
  return true;
}
function camShake(mag, dur) {
  if (!R || Shell.reduced) return;
  R.shakeMag = mag; R.shakeDur = R.shakeT = dur;
}

/* ---------------- Board <-> screen ---------------- */
function toScreen(x, y, z) {
  if (!R) return { x: W / 2, y: H / 2, ok: false };
  R.v.set(x, y, z).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1 };
}
function cellToScreen(i, h) { return toScreen(cx(i % COLS), h || 0, cz(Math.floor(i / COLS))); }
function screenToPlane(px, py, h) {
  if (!R || !R.camReady) return null;
  const cam = R.camera;
  R.v.set(px / W * 2 - 1, 1 - py / H * 2, 0.5).unproject(cam);
  R.v2.copy(R.v).sub(cam.position);
  if (R.v2.y > -1e-6) return null;
  const t = (h - cam.position.y) / R.v2.y;
  return { x: cam.position.x + R.v2.x * t, z: cam.position.z + R.v2.z * t };
}
function cellAt(p) {
  if (!p) return -1;
  const c = Math.round(p.x / CELL + (COLS - 1) / 2), r = Math.round(p.z / CELL + (ROWS - 1) / 2);
  return inGrid(c, r) ? idx(c, r) : -1;
}
// What is under the finger: a tall part is found by its middle, an empty socket by the board.
function pickCell(px, py) {
  const hi = cellAt(screenToPlane(px, py, 4.5));
  if (hi >= 0 && S.cells[hi] && !PT[S.cells[hi].t].flat) return hi;
  return cellAt(screenToPlane(px, py, 0.4));
}

/* ---------------- Parts in the scene ---------------- */
function disposeInst(inst) {
  inst.g.traverse(function (m) {
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    mats.forEach(function (mt) { if (mt.map && mt.map._own) mt.map.dispose(); if (mt._own) mt.dispose(); });
  });
  if (inst.g.parent) inst.g.parent.remove(inst.g);
}
function markOwn(inst) {
  const shared = new Set();
  for (const k in K.mat) shared.add(K.mat[k]);
  for (const k in K.cat) shared.add(K.cat[k]);
  inst.g.traverse(function (m) {
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    mats.forEach(function (mt) { if (!shared.has(mt)) { mt._own = true; if (mt.map && mt.map !== K.tGlow && !isKitMap(mt.map)) mt.map._own = true; } });
  });
}
function isKitMap(t) { for (const k in K.mat) if (K.mat[k].map === t) return true; return false; }

function sceneLevel() {
  for (let i = 0; i < R.objs.length; i++) if (R.objs[i]) { disposeInst(R.objs[i]); R.objs[i] = null; }
  if (R.ghost) { disposeInst(R.ghost.inst); R.ghost = null; }
  for (let i = 0; i < S.cells.length; i++) if (S.cells[i]) addInst(i);
  refreshArms();
  R.over.key = ""; R.fail.key = ""; R.dirty = true;
}
function addInst(i) {
  const inst = makePart(S.cells[i], i);
  markOwn(inst);
  R.partsRoot.add(inst.g);
  R.objs[i] = inst;
  return inst;
}
function scenePart(i, added) {
  if (R.objs[i]) { disposeInst(R.objs[i]); R.objs[i] = null; }
  if (added && S.cells[i]) { const inst = addInst(i); inst.pop = 1; }
  refreshArms();
}
function sceneMove(from, to) {
  const inst = R.objs[from];
  R.objs[from] = null; R.objs[to] = inst;
  if (inst) {
    inst.g.position.set(cx(to % COLS), 0, cz(Math.floor(to / COLS)));
    inst.spinSign = ((to % COLS) + Math.floor(to / COLS)) % 2 ? -1 : 1;
    inst.pop = 1;
  }
  refreshArms();
}
function sceneRotate(i) { const inst = R.objs[i]; if (inst) face(inst, S.cells[i].d, false); }
function refreshArms() {
  for (let i = 0; i < S.cells.length; i++) {
    const inst = R.objs[i];
    if (!inst || !inst.arms) continue;
    const c = i % COLS, r = Math.floor(i / COLS);
    let mask = 0;
    for (let d = 0; d < 4; d++) { const nc = c + DC[d], nr = r + DR[d]; if (inGrid(nc, nr) && electric(S.cells[idx(nc, nr)])) mask |= 1 << d; }
    setArms(inst, mask);
  }
}

/* ---------------- The tray's 3D icons: each part rendered once, straight off the main canvas ---------------- */
const ICON = 112;
function makeIcons() {
  const T = R.T, rr = R.renderer, buf = new T.Vector2();
  rr.getDrawingBufferSize(buf);
  if (buf.x < ICON || buf.y < ICON) return;
  const pr = rr.getPixelRatio(), scene = new T.Scene();
  scene.add(new T.HemisphereLight(0xffffff, 0x8899cc, 1.7));
  const dl = new T.DirectionalLight(0xffffff, 2.3); dl.position.set(-30, 60, 40); scene.add(dl);
  const cam = new T.PerspectiveCamera(28, 1, 1, 500);
  cam.position.set(0, 4 + Math.sin(0.72) * 40, Math.cos(0.72) * 40); cam.lookAt(0, 3.6, 0);
  const prevClear = rr.getClearColor(new T.Color()), prevA = rr.getClearAlpha(), shadow = rr.shadowMap.enabled;
  rr.setClearColor(0x15307a, 1); rr.shadowMap.enabled = false;
  rr.setScissorTest(true);
  const out = {}, list = TOOLS.concat(["plug", "tv", "boombox", "arcade", "lava", "calc", "turntable", "alarm"]);
  list.forEach(function (t) {
    const inst = makePart({ t: t, d: t === "lamp" ? 1 : t === "fan" ? 2 : 0, on: true, fixed: false }, 0);
    inst.g.position.set(0, 0, 0);
    if (inst.arms) setArms(inst, 10);
    scene.add(inst.g);
    rr.setViewport(0, 0, ICON / pr, ICON / pr); rr.setScissor(0, 0, ICON / pr, ICON / pr);
    rr.render(scene, cam);
    const c = mkCanvas(ICON, ICON);
    try { c.getContext("2d").drawImage(rr.domElement, 0, buf.y - ICON, ICON, ICON, 0, 0, ICON, ICON); } catch (e) { /* icon stays blank */ }
    out[t] = c;
    scene.remove(inst.g);
    markOwn(inst); disposeInst(inst);
  });
  rr.setScissorTest(false);
  rr.setViewport(0, 0, R.cw, R.ch);
  rr.setClearColor(prevClear, prevA); rr.shadowMap.enabled = shadow;
  R.icons = out;
}

/* ---------------- Game state -> meshes ---------------- */
const SIM_CTX = { i: 0, o: null, sim: null, now: -1, dt: 0, clock: 0, eT: null, pT: null, litT: null, spinT: null, windT: null, magT: null, srcT: null };
function syncScene(state, fdt) {
  const idle = state === "title" || state === "over";
  R.clock += fdt;
  ledTick(fdt);
  const sim = (S.mode === "run" || S.mode === "clear") ? S.sim : null, now = sim ? S.runT : -1;
  const s = SIM_CTX;
  s.sim = sim; s.now = now; s.dt = fdt; s.clock = R.clock;
  s.eT = sim && sim.eT; s.pT = sim && sim.pT; s.litT = sim && sim.litT; s.spinT = sim && sim.spinT; s.windT = sim && sim.windT; s.magT = sim && sim.magT; s.srcT = sim && sim.srcT;
  const dragI = S.drag && S.drag.kind === "board" && S.drag.moved ? S.drag.i : -1;
  for (let i = 0; i < R.objs.length; i++) {
    const inst = R.objs[i];
    if (!inst) continue;
    s.i = i; s.o = S.cells[i];
    if (inst.upd && s.o) inst.upd(s);
    if (inst.goal != null) {
      let d = inst.goal - inst.f.rotation.y; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      inst.f.rotation.y += d * Math.min(1, fdt * 16);
    }
    if (i === dragI) continue;
    const home = R.v.set(cx(i % COLS), 0, cz(Math.floor(i / COLS)));
    inst.g.position.x = home.x; inst.g.position.z = home.z;
    if (inst.pop > 0) {
      inst.pop = Math.max(0, inst.pop - fdt * 4);
      const k = inst.pop;
      inst.g.position.y = Shell.reduced ? 0 : Math.sin(k * Math.PI) * 2.2 * k;
      inst.g.scale.set(1 + 0.12 * Math.sin(k * Math.PI * 2) * k, 1 - 0.1 * Math.sin(k * Math.PI * 2) * k, 1 + 0.12 * Math.sin(k * Math.PI * 2) * k);
    } else { inst.g.position.y = 0; inst.g.scale.set(1, 1, 1); }
  }
  syncDrag();
  R.cursor.visible = state === "playing" && S.kb && (S.mode === "build" || S.mode === "run");
  if (R.cursor.visible) R.cursor.position.set(cx(S.cursor.c), 1.7 + (Shell.reduced ? 0 : Math.sin(R.clock * 5) * 0.3), cz(S.cursor.r));
  syncBeams(sim, now);
  syncWind(sim, now);
  drawOverlay(state);
  drawFail();

  /* camera: the whole box while building; a slow drift on the title and level cards; a nudge in on a clear */
  const f = R.fit;
  let tx = f.tx, tz = f.tz, dist = f.d;
  if ((idle || S.mode === "select") && !Shell.reduced) { tx += Math.sin(R.clock * 0.35) * 3; dist *= 1 + Math.sin(R.clock * 0.27) * 0.015; }
  if (S.mode === "clear") dist *= 1 - 0.03 * Math.min(1, S.clearT * 2);
  const gp = R.v.set(tx, dist * R.sinP, tz + dist * R.cosP);
  if (!R.camReady) { R.camPos.copy(gp); R.camTgt.set(tx, 0, tz); R.camReady = true; }
  else { const k = 1 - Math.exp(-4 * fdt); R.camPos.lerp(gp, k); R.camTgt.lerp(R.v2.set(tx, 0, tz), k); }
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

// The part being dragged: hovering over the socket it would land in, or riding along under the finger.
function syncDrag() {
  const d = S.drag;
  let inst = null;
  if (d && d.kind === "tray" && d.moved) {
    if (!R.ghost || R.ghost.t !== d.type) {
      if (R.ghost) disposeInst(R.ghost.inst);
      const gi = makePart({ t: d.type, d: defaultDir(d.type), on: true, fixed: false }, 0);
      markOwn(gi); if (gi.arms) setArms(gi, 10);
      R.partsRoot.add(gi.g); R.ghost = { t: d.type, inst: gi };
    }
    inst = R.ghost.inst;
  } else if (R.ghost) { disposeInst(R.ghost.inst); R.ghost = null; }
  if (d && d.kind === "board" && d.moved) inst = R.objs[d.i];
  if (!inst) return;
  const bob = Shell.reduced ? 0 : Math.sin(R.clock * 8) * 0.5;
  if (S.hover >= 0) {
    inst.g.position.set(cx(S.hover % COLS), 4 + bob, cz(Math.floor(S.hover / COLS)));
  } else {
    const p = screenToPlane(d.x, d.y - 26, 6);
    if (p) inst.g.position.set(p.x, 6 + bob, p.z);
  }
  inst.g.scale.set(1.06, 1.06, 1.06);
}

function beamVerts(b) {
  const lc = b.i % COLS, lr = Math.floor(b.i / COLS), o = S.cells[b.i];
  const out = [{ x: cx(lc) + DC[o.d] * 2.4, y: BEAM_Y, z: cz(lr) + DR[o.d] * 2.4, t: b.t0 }];
  const P = b.path;
  for (let k = 0; k < P.length; k++) {
    const s = P[k];
    if (s.k === "pass") continue;
    let x = cx(s.c), z = cz(s.r), y = BEAM_Y, t = s.t, kind = s.k;
    if (s.k === "stop" || s.k === "edge") {
      const back = s.k === "edge" ? 0.5 - MARGIN / CELL + 0.02 : 0.5;
      x -= DC[s.d] * CELL * back; z -= DR[s.d] * CELL * back; t -= DT.beam * 0.5;
    }
    if (s.k === "hit") { const ho = S.cells[idx(s.c, s.r)]; y = ho && ho.t === "calc" ? BT + 2.4 : BT + 3.2; }
    out.push({ x: x, y: y, z: z, t: t, kind: kind });
  }
  return out;
}
function syncBeams(sim, now) {
  let n = 0, ns = 0;
  if (sim) for (let b = 0; b < sim.beams.length; b++) {
    const B = sim.beams[b];
    if (now < B.t0 || !S.cells[B.i]) continue;
    const V = beamVerts(B);
    for (let k = 0; k + 1 < V.length && n < R.beams.length; k++) {
      const a = V[k], c = V[k + 1];
      if (now <= a.t) break;
      const u = c.t > a.t ? clamp((now - a.t) / (c.t - a.t), 0, 1) : 1;
      const gr = R.beams[n++], dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z, len = Math.hypot(dx, dy, dz) * u;
      gr.visible = len > 0.01;
      gr.position.set(a.x, a.y, a.z);
      R.v.set(dx, dy, dz).normalize();
      gr.quaternion.setFromUnitVectors(R.up, R.v);
      const flick = Shell.reduced ? 1 : 0.92 + 0.08 * Math.sin(R.clock * 40 + k);
      gr.scale.set(flick, Math.max(0.01, len), flick);
      if (u >= 1 && (c.kind === "mirror" || c.kind === "hit") && ns < R.spots.length) {
        const sp = R.spots[ns++]; sp.visible = true; sp.position.set(c.x, c.y, c.z);
        sp.scale.setScalar(c.kind === "hit" ? 9 + Math.sin(R.clock * 12) : 6);
      }
    }
  }
  for (; n < R.beams.length; n++) R.beams[n].visible = false;
  for (; ns < R.spots.length; ns++) R.spots[ns].visible = false;
}
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function syncWind(sim, now) {
  const st = R.streak, m4 = R.m4, q = R.q;
  let n = 0;
  if (sim && !Shell.reduced) for (let w = 0; w < sim.winds.length; w++) {
    const Wd = sim.winds[w], o = S.cells[Wd.i];
    if (!o || now < Wd.t0) continue;
    const fc = Wd.i % COLS, fr = Math.floor(Wd.i / COLS), d = Wd.d;
    let len = 0;
    for (let k = 0; k < Wd.path.length; k++) { const s = Wd.path[k]; len = (k + 1) * CELL - (s.k === "pass" ? 0 : s.k === "hit" ? CELL * 0.1 : CELL * 0.5); }
    len = Math.max(2, len - 3);
    const front = Math.min(len, (now - Wd.t0) / DT.wind * CELL);
    q.setFromAxisAngle(R.up, (1 - d) * Math.PI / 2);
    for (let k = 0; k < 22 && n < 120; k++) {
      const u = (R.clock * 0.9 + k / 22 + hash(k + w * 31)) % 1, dist = 3 + u * len;
      if (dist > front + 3) continue;
      const lat = (hash(k * 3.1 + w) - 0.5) * 7.5, y = 2.2 + hash(k * 7.7 + w) * 6;
      const x = cx(fc) + DC[d] * dist + (DC[d] ? 0 : lat), z = cz(fr) + DR[d] * dist + (DR[d] ? 0 : lat);
      const fade = Math.min(1, u * 5, (1 - u) * 5);
      m4.compose(R.v.set(x, y, z), q, R.v2.set(0.6 + fade, fade, fade));
      st.setMatrixAt(n++, m4);
    }
  }
  st.count = n;
  if (n) st.instanceMatrix.needsUpdate = true;
}

function drawOverlay(state) {
  const o = R.over, building = (S.mode === "build" || S.mode === "run") && state === "playing";
  const occ = S.cells.map(function (c) { return c ? 1 : 0; }).join("");
  const sel = building && S.mode === "build" && S.sel && S.inv[S.sel] > 0 ? S.sel : "";
  const showCur = building && S.kb;
  const key = [building ? 1 : 0, sel, S.hover, S.hoverOk ? 1 : 0, showCur ? S.cursor.c + "," + S.cursor.r : "", occ, S.drag ? S.drag.kind : ""].join("|");
  if (key === o.key) return;
  o.key = key;
  const g = o.g, P = 40;
  g.clearRect(0, 0, o.c.width, o.c.height);
  if (building) {
    if (sel) for (let i = 0; i < S.cells.length; i++) if (!S.cells[i]) {
      const x = (i % COLS) * P + P / 2, y = Math.floor(i / COLS) * P + P / 2;
      g.fillStyle = "rgba(180,255,120,.5)"; g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill();
    }
    if (S.hover >= 0 && S.drag) {
      const x = (S.hover % COLS) * P, y = Math.floor(S.hover / COLS) * P;
      rrectPath(g, x + 2, y + 2, P - 4, P - 4, 6);
      g.fillStyle = S.hoverOk ? "rgba(125,255,58,.28)" : "rgba(255,59,46,.28)"; g.fill();
      g.lineWidth = 3; g.strokeStyle = S.hoverOk ? "#7dff3a" : "#ff3b2e"; g.stroke();
    }
    if (showCur) {
      const x = S.cursor.c * P, y = S.cursor.r * P;
      g.setLineDash([6, 4]); rrectPath(g, x + 2, y + 2, P - 4, P - 4, 6); g.lineWidth = 3; g.strokeStyle = "#ffe838"; g.stroke(); g.setLineDash([]);
    }
  }
  o.t.needsUpdate = true;
}
function drawFail() {
  const f = R.fail, on = S.mode === "run" && S.result === "fail" && S.sim;
  const key = on ? S.fail + "|" + S.sim.targets.map(function (x) { return x.t == null ? 1 : 0; }).join("") : "";
  if (key !== f.key) {
    f.key = key;
    const g = f.g, P = 40;
    g.clearRect(0, 0, f.c.width, f.c.height);
    if (on) {
      const list = S.fail === "alarm" ? [S.sim.alarm.i] : S.sim.targets.filter(function (x) { return x.t == null; }).map(function (x) { return x.i; });
      list.forEach(function (i) {
        const x = (i % COLS) * P, y = Math.floor(i / COLS) * P;
        rrectPath(g, x + 1, y + 1, P - 2, P - 2, 7); g.lineWidth = 4; g.strokeStyle = "#ff3b2e"; g.stroke();
        g.fillStyle = "rgba(255,59,46,.22)"; g.fill();
      });
    }
    f.t.needsUpdate = true;
  }
  f.m.visible = !!on;
  if (on) f.m.material.opacity = Shell.reduced ? 0.9 : 0.55 + 0.45 * Math.abs(Math.sin(R.clock * 4));
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
function star(c, x, y, r, fill, stroke) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.46 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath();
  c.fillStyle = fill; c.fill();
  if (stroke) { c.lineWidth = Math.max(1, r * 0.16); c.strokeStyle = stroke; c.stroke(); }
}
function candy(c, s, x, y, size, maxW) {                  // the glossy title lettering, on the HUD
  c.font = "900 " + size + "px " + CANDY_FONT;
  const w = c.measureText(s).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); c.font = "900 " + size + "px " + CANDY_FONT; }
  c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round";
  c.lineWidth = size * 0.3; c.strokeStyle = "#08205f"; c.strokeText(s, x, y + size * 0.05);
  c.lineWidth = size * 0.14; c.strokeStyle = "#ffffff"; c.strokeText(s, x, y);
  const gr = c.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  gr.addColorStop(0, "#fff06a"); gr.addColorStop(0.55, "#ffc21a"); gr.addColorStop(1, "#ff7a0f");
  c.fillStyle = gr; c.fillText(s, x, y);
}
function bandBg(c, y0, h) {
  const bg = c.createLinearGradient(0, y0, 0, y0 + h);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, y0, W, h);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, y0, W, 2);
}

/* layout of the tappable bits */
const BTN = { levels: { x: 6, y: 36, w: 74, h: 19 }, reset: { x: 84, y: 36, w: 56, h: 19 } };
const POWER = { x: W - 46, y: TRAY_Y + 47, r: 34 };
const SHORT = { wire: "WIRE", battery: "BATTERY", lamp: "SPOTLIGHT", mirror: "MIRROR", solar: "SOLAR", fan: "FAN", turbine: "TURBINE",
                motor: "MOTOR", gear: "GEAR", dynamo: "DYNAMO", magnet: "MAGNET", reed: "REED" };
function inRect(x, y, b) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }
function traySlots() {
  const n = S.tray.length, x0 = 6, x1 = W - 92, out = [];
  if (!n) return out;
  const rows = n <= 4 ? 1 : 2, per = Math.ceil(n / rows), gap = 6;
  const w = Math.min(64, (x1 - x0 - (per - 1) * gap) / per), h = rows === 1 ? 80 : 41;
  const used = per * w + (per - 1) * gap, sx = x0 + Math.max(0, (x1 - x0 - used) / 2);
  for (let k = 0; k < n; k++) {
    const r = Math.floor(k / per), cc = k % per;
    out.push({ x: sx + cc * (w + gap), y: TRAY_Y + 6 + r * (h + 4), w: w, h: h, t: S.tray[k] });
  }
  return out;
}
const LV = { cols: 4, w: 78, h: 56, gap: 8, x0: 0, y0: 98 };
LV.x0 = (W - (LV.cols * LV.w + (LV.cols - 1) * LV.gap)) / 2;
function levelRect(k) { return { x: LV.x0 + (k % LV.cols) * (LV.w + LV.gap), y: LV.y0 + Math.floor(k / LV.cols) * (LV.h + LV.gap), w: LV.w, h: LV.h }; }
function levelAt(x, y) { for (let k = 0; k < LEVELS.length; k++) if (inRect(x, y, levelRect(k))) return k; return -1; }

function drawTop(c, state) {
  bandBg(c, 0, HUD_TOP - 4);
  c.fillStyle = "#ff9214"; c.fillRect(0, HUD_TOP - 4, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, HUD_TOP - 2, W, 1);
  if (state !== "playing" || S.mode === "select") {
    if (R && R.script) drawScript(c, R.script, W / 2 - 62, 27, 110, 44);
    txt(c, "CIRCUIT BOX", W / 2 + 64, 9, 15, "#ffe45c", "center", "#08205f");
    txt(c, totalScore().toLocaleString() + " PTS", W / 2 + 64, 30, 11, "#ffffff", "center", "#08205f");
    return;
  }
  const L = LEVELS[S.level], used = usedParts(), st = starsFor(used, L.par);
  txt(c, "LEVEL " + (S.level + 1) + " OF " + LEVELS.length, 8, 5, 9, "#a8ecff", "left", "#08205f");
  txt(c, L.name, 8, 17, 14, "#ffe45c", "left", "#08205f");
  for (let k = 0; k < 3; k++) star(c, W - 60 + k * 21, 14, 8.5, k < st ? "#ffd23f" : "rgba(8,32,95,.6)", "#08205f");
  txt(c, "PARTS " + used + "  PAR " + L.par, W - 8, 27, 10, used <= L.par ? "#b6ff4a" : "#ffc1e0", "right", "#08205f");
  [["levels", "< LEVELS"], ["reset", "RESET"]].forEach(function (b) {
    const r = BTN[b[0]], down = S.press && S.press.b === b[0];
    rrect(c, r.x, r.y, r.w, r.h, 9); c.fillStyle = down ? "#ffe45c" : "rgba(8,32,95,.75)"; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = "#ffe45c"; c.stroke();
    txt(c, b[1], r.x + r.w / 2, r.y + 4, 10, down ? "#08205f" : "#ffffff", "center");
  });
  const best = PROG.best[S.level] || 0;
  if (best) txt(c, "BEST " + best, W - 8, 41, 9, "#a8ecff", "right", "#08205f");
}

function drawTray(c, state) {
  const y0 = TRAY_Y;
  const bg = c.createLinearGradient(0, y0, 0, H);
  bg.addColorStop(0, "#0d3ca8"); bg.addColorStop(1, "#061f66");
  c.fillStyle = bg; c.fillRect(0, y0, W, H - y0);
  c.fillStyle = "#ff9214"; c.fillRect(0, y0, W, 2); c.fillStyle = "#ffe45c"; c.fillRect(0, y0 + 2, W, 1);
  if (state !== "playing" || S.mode === "select") {
    if (S.mode === "select" && state === "playing") {
      txt(c, "TOTAL " + totalScore().toLocaleString() + " PTS", 12, y0 + 16, 15, "#ffe45c", "left", "#08205f");
      star(c, 20, y0 + 58, 9, "#ffd23f", "#08205f");
      txt(c, totalStars() + " / " + LEVELS.length * 3, 34, y0 + 51, 14, "#ffffff", "left", "#08205f");
      txt(c, "Tap a level to start", W - 12, y0 + 53, 11, "#a8ecff", "right", "#08205f");
    }
    return;
  }
  const slots = traySlots(), icons = R && R.icons;
  for (let k = 0; k < slots.length; k++) {
    const s = slots[k], n = S.inv[s.t] || 0, sel = S.sel === s.t, big = s.h > 50;
    rrect(c, s.x, s.y, s.w, s.h, 8); c.fillStyle = "#15307a"; c.fill();
    c.save(); rrect(c, s.x, s.y, s.w, s.h, 8); c.clip();
    if (icons && icons[s.t]) {
      const isz = big ? Math.min(s.w, s.h - 14) * 1.12 : Math.min(s.w, s.h) * 1.12;
      c.globalAlpha = n > 0 ? 1 : 0.3;
      c.drawImage(icons[s.t], s.x + (s.w - isz) / 2, s.y + (big ? -3 : (s.h - isz) / 2), isz, isz);
      c.globalAlpha = 1;
    }
    const gl = c.createLinearGradient(0, s.y, 0, s.y + s.h * 0.5);
    gl.addColorStop(0, "rgba(255,255,255,.22)"); gl.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gl; c.fillRect(s.x, s.y, s.w, s.h * 0.5);
    c.restore();
    if (big) txt(c, SHORT[s.t] || NAMES[s.t].toUpperCase(), s.x + s.w / 2, s.y + s.h - 13, s.w < 56 ? 7 : 8, "#ffffff", "center", "#08205f");
    rrect(c, s.x + s.w - 21, s.y + 3, 18, 14, 7); c.fillStyle = n > 0 ? "#ffe45c" : "#5b6b96"; c.fill();
    txt(c, String(n), s.x + s.w - 12, s.y + 4.5, 10, "#08205f", "center");
    rrect(c, s.x, s.y, s.w, s.h, 8); c.lineWidth = sel ? 3 : 1.2; c.strokeStyle = sel ? "#ffe45c" : "rgba(255,255,255,.4)"; c.stroke();
  }
  // the breaker button
  const on = S.mode === "run" || S.mode === "clear", p = POWER, down = S.press && S.press.b === "power";
  const pulse = on && !Shell.reduced ? 0.5 + 0.5 * Math.sin(R ? R.clock * 6 : 0) : 0;
  if (on) { c.fillStyle = "rgba(125,255,58," + (0.18 + 0.2 * pulse).toFixed(3) + ")"; c.beginPath(); c.arc(p.x, p.y, p.r + 7, 0, TAU); c.fill(); }
  c.fillStyle = "#061a52"; c.beginPath(); c.arc(p.x, p.y + 3, p.r + 2, 0, TAU); c.fill();
  const gr = c.createRadialGradient(p.x - 10, p.y - 14, 4, p.x, p.y, p.r);
  if (on) { gr.addColorStop(0, "#d8ffb0"); gr.addColorStop(0.45, "#58e02a"); gr.addColorStop(1, "#1d8a10"); }
  else { gr.addColorStop(0, "#ffb3a8"); gr.addColorStop(0.45, "#ff3b2e"); gr.addColorStop(1, "#a8130c"); }
  c.fillStyle = gr; c.beginPath(); c.arc(p.x, p.y + (down ? 2 : 0), p.r, 0, TAU); c.fill();
  c.lineWidth = 3; c.strokeStyle = "#ffffff"; c.stroke();
  c.fillStyle = "rgba(255,255,255,.35)"; c.beginPath(); c.ellipse(p.x - 6, p.y - 16 + (down ? 2 : 0), 17, 8, -0.3, 0, TAU); c.fill();
  const yy = p.y + (down ? 2 : 0);
  c.strokeStyle = "#ffffff"; c.lineWidth = 3.4; c.lineCap = "round";                         // the power symbol
  c.beginPath(); c.arc(p.x, yy - 4, 10, -Math.PI / 2 + 0.75, -Math.PI / 2 - 0.75 + TAU); c.stroke();
  c.beginPath(); c.moveTo(p.x, yy - 17); c.lineTo(p.x, yy - 5); c.stroke();
  txt(c, on ? "ON" : "POWER", p.x, yy + 12, 9, "#ffffff", "center", "rgba(0,0,0,.35)");
}

function hintText() {
  if (S.note && S.note.t > 0) return S.note.s;
  if (S.mode === "run" && S.result === "fail") return "Tap POWER to switch off, then rewire.";
  if (S.mode === "build" && S.runs === 0 && usedParts() === 0) return S.hint;
  return "";
}
function note(s) { S.note = { s: s, t: 2.6 }; }
function wrapLines(c, s, maxW) {
  const words = s.split(" "), out = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const t = line ? line + " " + words[i] : words[i];
    if (c.measureText(t).width > maxW && line) { out.push(line); line = words[i]; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
function drawHint(c) {
  const s = hintText();
  if (!s || S.drag && S.drag.moved) return;
  c.font = "bold 11px " + HUD_FONT;
  const lines = wrapLines(c, s, W - 36).slice(0, 3), h = lines.length * 14 + 8, y = TRAY_Y - h - 6;
  let w = 0; for (let i = 0; i < lines.length; i++) w = Math.max(w, c.measureText(lines[i]).width);
  rrect(c, (W - w) / 2 - 9, y, w + 18, h, 8); c.fillStyle = "rgba(6,18,60,.82)"; c.fill();
  c.lineWidth = 1; c.strokeStyle = "rgba(255,228,92,.7)"; c.stroke();
  for (let i = 0; i < lines.length; i++) txt(c, lines[i], W / 2, y + 5 + i * 14, 11, "#ffffff", "center");
}

function drawSelect(c) {
  c.fillStyle = "rgba(4,10,40,.62)"; c.fillRect(0, HUD_TOP - 1, W, TRAY_Y - HUD_TOP + 1);
  candy(c, "PICK A CIRCUIT", W / 2, 78, 26, W - 40);
  for (let k = 0; k < LEVELS.length; k++) {
    const r = levelRect(k), open = unlocked(k), st = PROG.stars[k] || 0, sel = S.pick === k, down = S.press && S.press.kind === "level" && S.press.k === k;
    const gr = c.createLinearGradient(0, r.y, 0, r.y + r.h);
    if (open) { gr.addColorStop(0, st ? "#3d8cff" : "#ff9a3a"); gr.addColorStop(1, st ? "#0b3aa6" : "#d2560c"); }
    else { gr.addColorStop(0, "#3a4364"); gr.addColorStop(1, "#1e2440"); }
    rrect(c, r.x, r.y + (down ? 2 : 0), r.w, r.h, 10); c.fillStyle = gr; c.fill();
    c.lineWidth = sel ? 3 : 1.5; c.strokeStyle = sel ? "#ffe45c" : "rgba(255,255,255,.55)"; c.stroke();
    c.fillStyle = "rgba(255,255,255,.18)"; rrect(c, r.x + 3, r.y + 3 + (down ? 2 : 0), r.w - 6, r.h * 0.38, 7); c.fill();
    if (open) {
      txt(c, String(k + 1), r.x + r.w / 2, r.y + 7 + (down ? 2 : 0), 22, "#ffffff", "center", "#08205f");
      for (let s = 0; s < 3; s++) star(c, r.x + r.w / 2 - 17 + s * 17, r.y + r.h - 12 + (down ? 2 : 0), 6.5, s < st ? "#ffd23f" : "rgba(8,20,60,.55)", "#08205f");
    } else {                                                // a padlock
      const lx = r.x + r.w / 2, ly = r.y + r.h / 2 + 4;
      c.strokeStyle = "#9aa6c8"; c.lineWidth = 3; c.beginPath(); c.arc(lx, ly - 7, 6.5, Math.PI, 0); c.stroke();
      rrect(c, lx - 10, ly - 7, 20, 15, 3); c.fillStyle = "#9aa6c8"; c.fill();
    }
  }
  const L = LEVELS[S.pick];
  if (L) {
    const r = levelRect(LEVELS.length - 1), y = r.y + r.h + 14;
    txt(c, (S.pick + 1) + ". " + L.name, W / 2, y, 13, unlocked(S.pick) ? "#ffe45c" : "#9aa6c8", "center", "#08205f");
  }
}

function drawClear(c) {
  const t = S.clearT;
  c.fillStyle = "rgba(4,10,40," + Math.min(0.45, t * 0.8).toFixed(3) + ")"; c.fillRect(0, HUD_TOP - 1, W, TRAY_Y - HUD_TOP + 1);
  const pop = Math.min(1, t / 0.3);
  candy(c, "WIRED!", W / 2, 186, 44 * (0.6 + 0.4 * pop), W - 40);
  for (let k = 0; k < 3; k++) {
    const kt = t - 0.5 - k * 0.32, s = kt < 0 ? 0 : Math.min(1.15, kt / 0.18) - Math.max(0, Math.min(0.15, (kt - 0.18) / 0.4));
    const got = k < S.stars, x = W / 2 + (k - 1) * 66, y = 262 - (k === 1 ? 12 : 0);
    star(c, x, y, 28, "rgba(8,20,60,.6)", "#08205f");
    if (got && s > 0) star(c, x, y, 28 * s, "#ffd23f", "#ffffff");
  }
  if (t > 1.6) txt(c, S.score + " PTS", W / 2, 306, 16, "#ffffff", "center", "#08205f");
}

function draw(c, state) {
  Sound.pump();
  if (!R || !R.hud) return;
  const now = performance.now();
  let ms = now - R.lastT;
  R.lastT = now;
  if (!(ms > 0)) ms = 0;
  const sized = layout();
  if (state === "paused" && !R.dirty) return;
  if (state === "playing") watchFrameRate(ms);
  const fdt = state === "paused" ? 0 : Math.min(ms, 50) / 1000;
  if (S.note && S.note.t > 0) S.note.t -= fdt;
  if (sized) {
    if (!R.icons) makeIcons();
    syncScene(state, fdt);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  if (state === "playing" && S.mode === "select") drawSelect(c);
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    c.globalAlpha = clamp(q.life * 2.5, 0, 1); c.fillStyle = q.c;
    if (q.kind) { c.beginPath(); c.arc(q.x, q.y, q.w, 0, TAU); c.fill(); }
    else { c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.fillRect(-q.w, -q.w * 0.6, q.w * 2, q.w * 1.2); c.restore(); }
  }
  c.globalAlpha = 1;
  if (state === "playing" && S.mode === "clear") drawClear(c);
  drawTop(c, state);
  drawTray(c, state);
  if (state === "playing" && (S.mode === "build" || S.mode === "run")) {
    drawHint(c);
    const d = S.drag;
    if (d && d.moved && (d.kind === "tray" || d.kind === "board") && S.hover < 0 && R.icons && R.icons[d.type || (S.cells[d.i] && S.cells[d.i].t)]) {
      const ic = R.icons[d.type || S.cells[d.i].t];
      c.globalAlpha = 0.85; c.drawImage(ic, d.x - 26, d.y - 70, 52, 52); c.globalAlpha = 1;
      if (d.y > TRAY_Y) txt(c, d.kind === "board" ? "RETURN" : "", d.x, d.y - 86, 10, "#ffe45c", "center", "#08205f");
    }
  }
}

/* ---------------- Input ---------------- */
function trayAt(x, y) { const sl = traySlots(); for (let k = 0; k < sl.length; k++) if (inRect(x, y, sl[k])) return sl[k].t; return null; }
function buttonAt(x, y) {
  if (Math.hypot(x - POWER.x, y - POWER.y) <= POWER.r + 6) return "power";
  if (inRect(x, y, BTN.levels)) return "levels";
  if (inRect(x, y, BTN.reset)) return "reset";
  return null;
}
function edit() { if (S.mode === "run") powerOff(); }

function pointer(type, x, y) {
  if (type === "down") {
    S.kb = false;
    if (S.mode === "select") { const k = levelAt(x, y); S.press = { kind: "level", k: k }; if (k >= 0 && k !== S.pick) previewLevel(k); return; }
    if (S.mode === "clear") { if (S.clearT > 0.8) S.clearT = Math.max(S.clearT, 2.9); return; }
    const b = buttonAt(x, y);
    if (b) { S.press = { kind: "btn", b: b }; return; }
    const tt = trayAt(x, y);
    if (tt) { S.drag = { kind: "tray", type: tt, sx: x, sy: y, x: x, y: y, moved: false }; return; }
    if (y < HUD_TOP || y > TRAY_Y) return;
    const i = pickCell(x, y);
    if (i < 0) return;
    const o = S.cells[i];
    if (o && !o.fixed) S.drag = { kind: "board", i: i, type: o.t, sx: x, sy: y, x: x, y: y, moved: false };
    else if (o && o.t === "sw") S.drag = { kind: "switch", i: i, sx: x, sy: y, x: x, y: y, moved: false };
    else if (!o && S.sel && S.inv[S.sel] > 0) { edit(); place(S.sel, i); S.drag = { kind: "paint", last: i, sx: x, sy: y, x: x, y: y, moved: false }; }
    else if (!o) note(S.tray.length ? "Pick a part from the tray first, or drag one onto the board." : "Nothing to place here.");
    else note((o.t === "alarm" ? "Alarm clock: keep it OFF." : NAMES[o.t] + (PT[o.t].target ? ": give it " + (PT[o.t].target === "power" ? "power." : PT[o.t].target) + "." : ": bolted down.")));
    return;
  }
  const d = S.drag;
  if (type === "move") {
    if (!d) return;
    d.x = x; d.y = y;
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) > 7) {
      d.moved = true;
      if (d.kind === "board") edit();
    }
    if (!d.moved) return;
    if (d.kind === "tray" || d.kind === "board") {
      const over = y > TRAY_Y ? -1 : cellAt(screenToPlane(x, y, 0.4));
      S.hover = over;
      S.hoverOk = over >= 0 && (canBuild(over) || (d.kind === "board" && over === d.i)) && (d.kind === "board" || S.inv[d.type] > 0);
    } else if (d.kind === "paint") {
      const i = cellAt(screenToPlane(x, y, 0.4));
      if (i >= 0 && i !== d.last) { d.last = i; if (canBuild(i) && S.sel && S.inv[S.sel] > 0) place(S.sel, i); }
    }
    return;
  }
  // up / cancel
  const pr = S.press;
  S.press = null;
  if (pr && type === "up") {
    if (pr.kind === "level") {
      const k = levelAt(x, y);
      if (k >= 0 && k === pr.k) { if (unlocked(k)) openLevel(k); else { Sound.cue("deny"); } }
    } else if (pr.kind === "btn" && buttonAt(x, y) === pr.b) {
      if (pr.b === "power") { if (S.mode === "build") powerOn(); else if (S.mode === "run") powerOff(); }
      else if (pr.b === "levels") { powerOff(true); openSelect(); }
      else if (pr.b === "reset") { powerOff(true); clearBoard(); }
    }
  }
  S.drag = null;
  const hover = S.hover; S.hover = -1;
  if (!d || type === "cancel") return;
  if (d.kind === "tray") {
    if (!d.moved) {
      if (!(S.inv[d.type] > 0)) { Sound.cue("deny"); note("No " + NAMES[d.type].toLowerCase() + "s left. Tap a placed one to take it back."); return; }
      S.sel = S.sel === d.type ? null : d.type; Sound.cue("select");
      if (S.sel && !S.toldPaint) { S.toldPaint = 1; note("Tap or drag across the board to place. Tap a placed part to turn it or take it back."); }
    } else if (hover >= 0 && canBuild(hover) && S.inv[d.type] > 0) { edit(); place(d.type, hover); }
    else if (y < TRAY_Y) Sound.cue("deny");
  } else if (d.kind === "board") {
    if (!d.moved) { edit(); if (PT[d.type].rot) rotate(d.i); else takeBack(d.i); }
    else if (y > TRAY_Y) takeBack(d.i);
    else if (hover >= 0 && hover !== d.i && canBuild(hover)) move(d.i, hover);
    else if (R && R.objs[d.i]) R.objs[d.i].pop = 0.6;
  } else if (d.kind === "switch") {
    if (!d.moved) toggleSwitch(d.i);
  }
}

function previewLevel(k) {
  S.pick = k;
  S.cells = parseLevel(LEVELS[k]);
  if (R) sceneLevel();
}

function key(type, code, e) {
  if (type !== "down") { keys[code] = false; return; }
  keys[code] = true;
  if (S.mode === "select") {
    const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -LV.cols, ArrowDown: LV.cols }[code];
    if (mv) { const k = clamp(S.pick + mv, 0, LEVELS.length - 1); if (k !== S.pick) { previewLevel(k); Sound.cue("rotate"); } return; }
    if ((code === "Space" || code === "Enter" || code === "NumpadEnter") && !e.repeat) { if (unlocked(S.pick)) openLevel(S.pick); else Sound.cue("deny"); }
    return;
  }
  if (S.mode === "clear") { if ((code === "Space" || code === "Enter") && S.clearT > 0.8) S.clearT = Math.max(S.clearT, 2.9); return; }
  const cur = S.cursor, i = idx(cur.c, cur.r);
  const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[code];
  if (mv) { S.kb = true; cur.c = clamp(cur.c + mv[0], 0, COLS - 1); cur.r = clamp(cur.r + mv[1], 0, ROWS - 1); return; }
  if (/^Digit[1-9]$/.test(code) || /^Numpad[1-9]$/.test(code)) {
    const k = Number(code.slice(-1)) - 1;
    if (k < S.tray.length) { S.kb = true; S.sel = S.sel === S.tray[k] ? null : S.tray[k]; Sound.cue("select"); }
    return;
  }
  if (e.repeat) return;
  if (code === "Enter" || code === "NumpadEnter") { if (S.mode === "build") powerOn(); else if (S.mode === "run") powerOff(); return; }
  if (code === "KeyL") { powerOff(true); openSelect(); return; }
  if (code === "Space") {
    S.kb = true;
    const o = S.cells[i];
    if (!o) { if (S.sel && S.inv[S.sel] > 0) { edit(); place(S.sel, i); } else { Sound.cue("deny"); note("Pick a part with the number keys first."); } }
    else if (o.t === "sw") toggleSwitch(i);
    else if (!o.fixed) { edit(); if (PT[o.t].rot) rotate(i); else takeBack(i); }
    return;
  }
  if (code === "Backspace" || code === "Delete" || code === "KeyX") {
    if (e.preventDefault) e.preventDefault();
    S.kb = true;
    if (S.cells[i] && !S.cells[i].fixed) { edit(); takeBack(i); }
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
    "background:radial-gradient(circle at 50% 42%,#21429c 0%,#0f2057 52%,#070d28 100%);" +
    "font:bold 15px/1.5 " + HUD_FONT.replace(/"/g, "'") + ";color:#ffffff;opacity:1;transition:opacity .35s ease";
  const img = document.createElement("img");
  img.alt = ""; img.decoding = "async";
  img.style.cssText = "display:block;width:min(66vw,44vh,340px);height:auto;opacity:0;transform:scale(.86);" +
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "transition:opacity .2s ease" : "transition:opacity .28s ease,transform .55s cubic-bezier(.2,1.5,.4,1)");
  el.appendChild(img);
  const bar = document.createElement("div");                // a loading bar while the 3D engine comes in
  bar.style.cssText = "width:min(52vw,220px);height:8px;border-radius:4px;background:#0a1a4c;overflow:hidden;box-shadow:0 0 0 2px #ff9214";
  const fillEl = document.createElement("div");
  fillEl.style.cssText = "height:100%;width:8%;background:linear-gradient(90deg,#ffe45c,#ff9214);transition:width .3s ease";
  bar.appendChild(fillEl); el.appendChild(bar);
  document.body.appendChild(el);
  return { el: el, img: img, bar: bar, fill: fillEl };
}
function splashFail(splash, lines) {
  const el = splash.el;
  splash.img.style.width = "min(40vw,26vh,180px)";
  if (splash.bar) splash.bar.style.display = "none";
  el.setAttribute("role", "alert"); el.removeAttribute("aria-label");
  const p = document.createElement("p"); p.style.cssText = "margin:0;max-width:30em"; p.textContent = lines;
  const a = document.createElement("a"); a.href = "../"; a.textContent = "Back to the arcade"; a.style.cssText = "color:#ffe45c";
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

// The score card's NEXT LEVEL button (and its PLAY AGAIN becomes ALL LEVELS: that goes to the level select).
function setNextButton(n) {
  const acts = document.querySelector("#np-ov-over .np-actions");
  if (!acts) return;
  let b = document.getElementById("cb-next");
  if (!b) {
    b = document.createElement("button");
    b.id = "cb-next"; b.type = "button"; b.className = "np-btn np-primary";
    b.addEventListener("click", function (e) { e.stopPropagation(); const k = Number(b.getAttribute("data-level")); if (k >= 0) { pendingGo = k; Shell.restart(); } });
    acts.insertBefore(b, acts.firstChild);
  }
  b.hidden = n == null;
  b.setAttribute("data-level", n == null ? "-1" : String(n));
  b.textContent = n == null ? "" : "NEXT LEVEL: " + (n + 1);
  const again = acts.querySelector('[data-act="again"]');
  if (again) { again.textContent = "ALL LEVELS"; again.classList.toggle("np-primary", n == null); }
}

function startGame() {
  Shell.init({
    slug: "circuit-box",
    title: "CIRCUIT BOX",
    accent: "#ffd23f",
    width: W, height: H,
    format: function (n) { return Number(n).toLocaleString() + " PTS"; },
    howTo: "A wiring puzzle in real 3D. Drag parts from the tray onto the board, then hit POWER. Light up every gadget, and never the alarm clock.",
    keys: "Keys: arrows move, 1 to 9 pick a part, Space places or turns, Backspace takes back, Enter is POWER, L levels. P pause, M mute, N music, R restart.",
    tip: "Gadgets take power but don't pass it on. Fewer parts, more stars.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { if (paused) return; idleT += dt; updateParts(dt); },
    onPause: function () { paused = true; keys = {}; S.drag = null; S.press = null; S.hover = -1; },
    onResume: function () { paused = false; }
  });
  attach();
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Sound.unlock, true); });
  Shell.onStart(Sound.unlock); Shell.onRestart(Sound.unlock); Shell.onResume(Sound.resume);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Sound.toggleMusic();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) Sound.button(titleCard, titleCard.querySelector(".np-tip"));
  if (pauseActions) Sound.button(pauseActions, pauseActions.querySelector("a"));
  const mute = document.getElementById("np-mute");
  if (mute && mute.parentNode) Sound.button(mute.parentNode, mute, true);
  // the studio logo heads the score card; the title menu stays clean (the splash is its logo moment)
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

// Trophies this game unlocks (add them to shared/trophy-list.js under the slug "circuit-box").
const TROPHIES = [
  ["cb-first", "Plugged In", "Clear any circuit."],
  ["cb-stars", "Under Par", "Get three stars on a circuit."],
  ["cb-bounce", "Bank Shot", "Light up a target with a beam that bounced off a mirror."],
  ["cb-wind", "Second Wind", "Clear a circuit powered by a wind turbine."],
  ["cb-gears", "Gear Head", "Clear a circuit with at least three gears turning."],
  ["cb-quiet", "Don't Wake Dad", "Clear a circuit with an alarm clock on the board and keep it quiet."],
  ["cb-goldberg", "Contraption", "Clear Rube Goldberg."],
  ["cb-firsttry", "One and Done", "Clear circuit 10 or later on the first flip of the breaker."],
  ["cb-all", "Fully Wired", "Clear every circuit."],
  ["cb-perfect", "Mint in Box", "Three stars on every circuit."]
];

// Hook for automated checks (no effect on play)
window.__circuitBox = { S: function () { return S; }, LEVELS: LEVELS, simulate: simulate, parseLevel: parseLevel, place: place, rotate: rotate,
  toggle: toggleSwitch, powerOn: powerOn, powerOff: powerOff, openLevel: openLevel, openSelect: openSelect, gfx: function () { return R; },
  led: function () { return LED; }, sound: Sound, pickCell: pickCell, cellToScreen: cellToScreen, trophies: TROPHIES, idx: idx,
  progress: function () { return PROG; }, music: startMusic };

(function boot() {
  const splash = makeSplash();
  const t0 = performance.now();
  const q = /[?&]gfx=(high|low)/.exec(location.search);
  Promise.all([loadLogo(splash), import(THREE_URL).then(function (m) { splash.fill.style.width = "70%"; return m; }, function (e) { e.npStage = "three"; throw e; }), loadImage(SCRIPT_URL)])
    .then(function (res) {
      THREE = res[1];
      PROG = loadProgress();
      try { R = buildScene(THREE, res[2]); } catch (e) { e.npStage = "webgl"; throw e; }
      if (q) { R.qLock = true; setQuality(q[1] === "low" ? QUALITY.length - 1 : 0); }
      reset();
      splash.fill.style.width = "100%";
      try { R.renderer.compile(R.scene, R.camera); } catch (e) { /* warm-up only */ }
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
        ? "Circuit Box could not load its 3D engine (" + THREE_URL + ")."
        : "Circuit Box needs WebGL for its 3D board, and this browser has it switched off or does not support it.");
    });
})();
