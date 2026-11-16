/* FLEA FORTRESS FLYBY (3D): fly the Bargain Hunter through a floating swap meet, shoot fuel tanks to stay
   in the air, and haggle the Haggletron down to zero.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of input, scaling and the title / pause / game over flow, and carries the HUD.

   The level layout, the rules, the scoring, the fuel, the Haggletron, the controls and the trophies are
   the 2D game's, unchanged: the same code builds every fortress and steps every frame at 60 steps a second.
   Only the picture is new. World axes are the 2D game's: f runs forward along the fortress, s runs across
   it, z is altitude. In three.js space a point (f, s, z) sits at (s, z, -f): the ship flies toward -z and
   the chase camera rides behind it. */

const W = 360, H = 540, TAU = Math.PI * 2, STEP = 1 / 60;
// world (the 2D game's numbers)
const HW = 70, ZT = 124, ZMIN = 6, ZMAX = 100, SMAX = 60, THICK = 12;
const V0 = 80, LAT = 82, VERT = 72, FUEL_MAX = 100, DRAIN = 2.0;
const SEG = { f1a: 0, f1b: 2500, sp: 2500, f2a: 3700, boss: 6550 };
const PTS = { turret: 200, tank: 300, ears: 1000, disc: 150, missile: 50, bossHit: 100, boss: 5000 };
const SIGNS = ["NO REFUNDS", "CASH ONLY", "ALL TAPES $1", "AS IS", "MAKE AN OFFER", "NO HAGGLING", "LOOSE CARTS", "BOXED ONLY"];

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash, title and score card
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every sign and decal in the fortress
const THREE_URL = "../shared/three.module.min.js";
const FALLBACK_URL = "game-2d.js";                        // optional: the classic 2D game, used if 3D cannot start
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';

let S = {}, keys = {}, idleT = 0, acc = 0;
const pad = { ax: 0, ay: 0, fire: false };
let THREE = null, R = null;                                // R holds everything the renderer owns
// V is how things are being shown (poses, flashes, the attract-mode flight). It never feeds the rules.
const V = { ts: 0, tz: 46, lastZ: 46, climb: 0, pump: 0, cheer: 0, cheerF: -1e9, muzzle: 0, jaw: 0, flinch: 0, drawer: 0,
            rise: 0, lowShown: false, lastLives: 3, firing: 0 };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function award(id) { if (window.Trophies) Trophies.unlock(id); }
function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }
function hash(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

/* ---------------- Level (the 2D game's, untouched) ---------------- */
function buildLevel(loop, base) {
  const r = rng(9173 + loop * 7919), L = { base: base, obs: [], ents: [], waves: [], spans: [] };
  const hard = Math.min(loop, 3);
  L.spans.push([base + SEG.f1a, base + SEG.f1b]);
  L.spans.push([base + SEG.f2a, Infinity]);
  L.bossF = base + SEG.boss;
  // the entry gate: a wide arch with the fortress name painted over it
  L.obs.push({ t: "gate", f: base + 240, a: -38, b: 38, gh: 54, sign: "FLEA FORTRESS", look: 0 });
  let lastTank = base + 240;
  function ents(f0, f1, n) {
    for (let k = 0; k < n; k++) {
      const f = f0 + (f1 - f0) * (k + 0.5 + (r() - 0.5) * 0.5) / n, s = -56 + r() * 112, roll = r();
      let t;
      if (f - lastTank > 330) t = "tank"; else t = roll < 0.48 ? "turret" : roll < 0.8 ? "tank" : "ears";
      if (t === "tank") lastTank = f;
      L.ents.push({ t: t, f: f, s: s, h: t === "tank" ? 17 : t === "ears" ? 12 : 9, cool: 1.2 + r() * 1.5, dead: false });
    }
  }
  function run(f0, f1) {
    let f = f0, last = "";
    while (f < f1) {
      const roll = r();
      let o;
      if (roll < 0.26 && last !== "wall") o = { t: "wall", h: 18 + Math.round(r() * (26 + hard * 4)) };
      else if (roll < 0.4) o = { t: "zap", z0: 0, z1: 28 + Math.round(r() * 22) };
      else if (roll < 0.56) o = { t: "zap", z0: 36 + Math.round(r() * 22), z1: ZT };
      else if (roll < 0.76) { const h = 16 + Math.round(r() * 14); o = { t: "wallzap", h: h, z0: h + 36 - hard * 2 }; }
      else { const wdt = 62 - hard * 4 + Math.round(r() * 16), mid = -30 + r() * 60; o = { t: "gate", a: mid - wdt / 2, b: mid + wdt / 2, gh: 34 + Math.round(r() * 12) }; }
      o.f = f; o.look = Math.floor(r() * 3); o.sign = r() < 0.45 ? SIGNS[Math.floor(r() * SIGNS.length)] : "";
      L.obs.push(o); last = o.t;
      const gap = 190 + r() * 70 - hard * 12;
      ents(f + THICK + 34, f + gap - 30, 2 + (r() < 0.45 ? 1 : 0));
      f += gap;
    }
  }
  ents(base + 40, base + 210, 2);
  run(base + 470, base + SEG.f1b - 160);
  ents(base + SEG.f1b - 150, base + SEG.f1b - 20, 2);
  // open space: flying disc squadrons
  for (let w = 0; w < 6; w++) L.waves.push({ f: base + SEG.sp + 140 + w * 175, z: 22 + Math.round(r() * 60), s: -40 + r() * 80, n: 4 + (w % 2), kind: w % 3, done: false });
  L.obs.push({ t: "gate", f: base + SEG.f2a + 120, a: -44, b: 44, gh: 50, sign: "BACK LOT", look: 1 });
  run(base + SEG.f2a + 330, base + SEG.boss - 260);
  for (let w = 0; w < 3; w++) L.waves.push({ f: base + SEG.f2a + 700 + w * 820, z: 30 + Math.round(r() * 40), s: -30 + r() * 60, n: 3, kind: 1, done: false });
  ents(base + SEG.boss - 240, base + SEG.boss - 40, 3);
  return L;
}

/* ---------------- State ---------------- */
function reset() {
  S = { t: 0, loop: 0, cam: -260, v: V0, s: 0, z: 46, bank: 0, fuel: FUEL_MAX, lives: 3, score: 0, nextLife: 20000,
    L: buildLevel(0, 0), bullets: [], shots: [], discs: [], parts: [], rings: [], fireT: 0, inv: 0, dead: 0,
    falling: false, boss: null, phase: "fly", lowBeep: 0, msgT: 0, zone: "",
    tanks: 0, ears: 0, discsHit: 0, turrets: 0, beaten: 0, unders: 0, lostLoop: 0, cleanBeat: 0, ticks: 0 };
  acc = 0; pad.ax = pad.ay = 0; pad.fire = false;
  V.ts = 0; V.tz = 46; V.lastZ = 46; V.climb = 0; V.pump = 0; V.cheer = 0; V.muzzle = 0; V.jaw = 0; V.flinch = 0; V.drawer = 0;
  V.rise = 0; V.lowShown = false; V.lastLives = 3; V.firing = 0;
  ledClear();
}

function onFloor(f) { const sp = S.L.spans; for (let i = 0; i < sp.length; i++) if (f >= sp[i][0] && f <= sp[i][1]) return true; return false; }

/* ---------------- Sound (the 2D game's effects, through the shell) ---------------- */
const SND = {
  shoot: function () { Shell.tone(1500, 0.05, "square", 0.07, 620); },
  boom: function (big) { Shell.noise(big ? 0.7 : 0.34, big ? 0.6 : 0.45, 1100, 0.6, 0, 90, "lowpass"); Shell.tone(big ? 150 : 210, big ? 0.5 : 0.22, "sawtooth", 0.16, 40); },
  fuel: function () { const n = [523, 659, 784, 1047, 1319]; for (let i = 0; i < n.length; i++) Shell.tone(n[i], 0.07, "square", 0.13, 0, 0.05 + i * 0.045); },
  ears: function () { Shell.tone(1568, 0.09, "square", 0.14); Shell.tone(2093, 0.16, "square", 0.12, 0, 0.08); },
  disc: function () { Shell.noise(0.14, 0.3, 2600, 1.5, 0, 700); Shell.tone(700, 0.1, "triangle", 0.2, 1400); },
  ping: function () { Shell.tone(1900, 0.04, "triangle", 0.12, 1500); },
  bossHit: function () { Shell.tone(196, 0.1, "square", 0.24, 392); Shell.noise(0.06, 0.3, 3200, 2); },
  turret: function () { Shell.tone(320, 0.07, "square", 0.06, 160); },
  missile: function () { Shell.tone(520, 0.22, "sawtooth", 0.08, 170); },
  die: function () { Shell.noise(1.0, 0.6, 1400, 0.5, 0, 60, "lowpass"); Shell.tone(420, 0.9, "sawtooth", 0.22, 36); Shell.tone(311, 0.7, "square", 0.1, 30, 0.1); },
  low: function () { Shell.tone(880, 0.07, "square", 0.11); Shell.tone(880, 0.07, "square", 0.11, 0, 0.14); },
  whoosh: function () { Shell.noise(0.3, 0.2, 500, 1.2, 0, 3200); },
  zap: function () { Shell.noise(0.05, 0.05, 5200, 3); },
  life: function () { const n = [784, 988, 1175, 1568]; for (let i = 0; i < n.length; i++) Shell.tone(n[i], 0.09, "square", 0.14, 0, i * 0.08); },
  win: function () { const n = [523, 659, 784, 1047, 784, 1047, 1319, 1568]; for (let i = 0; i < n.length; i++) Shell.tone(n[i], 0.11, "square", 0.15, 0, i * 0.09); }
};

// Presentation hook: the LED board, the extra stingers and the characters react here. Never touches a rule.
function fx(name, a) {
  try {
    if (name === "tank") {
      V.cheer = 1.3; V.cheerF = a.f;
      ledPlay([ledMsg("slide", "FUEL +30", 1.5, { color: "lime" })]);
      Juke.sfx("tank");
    } else if (name === "ears") {
      ledPlay([ledMsg("flash", "+1000", 1.6)]);
    } else if (name === "life") {
      V.pump = 1.4;
      ledPlay([ledMsg("cycle", "EXTRA SHIP", 2)]);
    } else if (name === "die") {
      ledPlay([ledMsg("blink", a || "SHIP DOWN", 2, { color: "red" })]);
      Juke.sfx("die");
    } else if (name === "boss") {
      V.rise = 0.0001;
      ledPlay([ledMsg("flash", "THE HAGGLETRON", 2.2), ledMsg("blink", "NO REFUNDS", 1.6, { color: "pink" })]);
      Juke.sfx("boss");
    } else if (name === "bossHit") {
      V.flinch = 1; V.drawer = 1;
    } else if (name === "bossDown") {
      ledPlay([ledMsg("flash", "HAGGLE OVER!", 2), ledMsg("cycle", "SOLD!", 1.6), ledMsg("count", "SCORE", 2.6, { from: Math.max(0, S.score - a), value: S.score })]);
    } else if (name === "fortress") {
      ledPlay([ledMsg("slide", "FORTRESS " + (S.loop + 1), 2, { color: "orange" })]);
    } else if (name === "zone") {
      if (a === "sp") ledPlay([ledMsg("slide", "OPEN SPACE", 1.8, { color: "cyan" })]);
      else if (a === "b") ledPlay([ledMsg("slide", "BACK LOT", 1.8, { color: "orange" })]);
    } else if (name === "low") {
      ledPlay([ledMsg("blink", "LOW FUEL", 2, { color: "red" })]);
    } else if (name === "missile") {
      V.muzzle = 0.18;
    } else if (name === "volley") {
      V.jaw = 1; V.muzzle = 0.18;
      if (vrand() < 0.5) ledPlay([ledMsg("blink", ["NO DEAL!", "FINAL OFFER", "PRICE GOES UP", "AS IS!"][Math.floor(vrand() * 4)], 1.4, { color: "pink" })]);
    }
  } catch (e) { /* the picture is never worth a crash */ }
}

/* ---------------- Effects ---------------- */
function boom(f, s, z, n, cols, spd) {
  if (Shell.reduced) n = Math.ceil(n / 2);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, e = Math.random() * 2 - 0.3, sp = (spd || 60) * (0.4 + Math.random());
    S.parts.push({ f: f, s: s, z: z, vf: Math.cos(a) * sp + S.v * 0.6, vs: Math.sin(a) * sp, vz: e * sp, life: 0.5 + Math.random() * 0.6, max: 1.1, c: cols[i % cols.length], sz: 2 + (Math.random() * 3 | 0) });
  }
  S.rings.push({ f: f, s: s, z: z, t: 0, max: 0.35, r: n > 30 ? 34 : 20, c: cols[0] });
}
function addScore(n) {
  S.score += n;
  if (S.score >= S.nextLife) { S.nextLife += 40000; if (S.lives < 5) { S.lives++; SND.life(); Shell.flash("EXTRA SHIP", "Another one for the shelf", "#9bff3f", 1300); fx("life"); } }
}

/* ---------------- Input ---------------- */
function inputAxes() {
  const ax = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0) + pad.ax;
  const ay = (keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0) + pad.ay;
  return { ax: clamp(ax, -1, 1), ay: clamp(ay, -1, 1), fire: !!(keys.Space || keys.KeyJ || keys.KeyK || keys.KeyZ || keys.KeyX || keys.Enter || pad.fire) };
}
function key(type, code) { keys[code] = type === "down"; }

/* ---------------- Simulation (the 2D game's, untouched apart from the fx() calls) ---------------- */
function update(dt) {
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 6) { tick(STEP); acc -= STEP; n++; }
  if (n >= 6) acc = 0;
}

function die(why) {
  if (S.dead || S.inv > 0) return;
  S.dead = 0.0001; S.lives--; S.lostLoop++;
  boom(S.cam, S.s, S.z, 46, ["#ffd23f", "#ff4b3e", "#eceae2", "#ff9b3f"], 90);
  SND.die(); Shell.shake(7, 0.5); camShake(5, 0.5);
  Shell.flash(why || "SHIP DOWN", S.lives > 0 ? S.lives + (S.lives === 1 ? " SHIP LEFT" : " SHIPS LEFT") : "", "#ff4b3e", 1300);
  S.shots.length = 0;
  fx("die", why);
}

function tick(dt) {
  S.t += dt; S.ticks++;
  let i, j, o, e, b;
  // particles always move
  for (i = S.parts.length - 1; i >= 0; i--) { const p = S.parts[i]; p.f += p.vf * dt; p.s += p.vs * dt; p.z += p.vz * dt; p.vz -= 90 * dt; p.life -= dt; if (p.life <= 0) S.parts.splice(i, 1); }
  for (i = S.rings.length - 1; i >= 0; i--) { S.rings[i].t += dt; if (S.rings[i].t > S.rings[i].max) S.rings.splice(i, 1); }

  if (S.dead) {
    S.dead += dt;
    if (S.dead > 1.6) {
      if (S.lives <= 0) { finish(); return; }
      S.dead = 0; S.inv = 2.6; S.z = 46; S.s = 0; S.fuel = FUEL_MAX; S.falling = false;
      Shell.flash("READY", "Find the gap", "#3ff0ff", 900);
    }
    stepBoss(dt, true); moveShots(dt);
    return;
  }
  if (S.inv > 0) S.inv -= dt;

  const I = inputAxes();
  // fuel
  const drain = DRAIN * (S.phase === "boss" ? 0.6 : 1) * (1 + S.loop * 0.08);
  S.fuel = Math.max(0, S.fuel - drain * dt);
  if (S.fuel < 25 && S.fuel > 0) { S.lowBeep -= dt; if (S.lowBeep <= 0) { S.lowBeep = 1.1; SND.low(); } }
  if (S.fuel <= 0 && !S.falling) { S.falling = true; Shell.flash("OUT OF FUEL", "Should have shot the tanks", "#ff4b3e", 1300); }

  // ship
  S.s = clamp(S.s + I.ax * LAT * dt, -SMAX, SMAX);
  S.bank += (I.ax - S.bank) * Math.min(1, dt * 10);
  if (S.falling) S.z -= 46 * dt; else S.z = clamp(S.z + I.ay * VERT * dt, ZMIN, ZMAX);
  S.cam += S.v * dt;
  const floor = onFloor(S.cam);
  if (S.falling && (S.z <= (floor ? 3 : -40))) { die("OUT OF FUEL"); return; }

  // zone callouts
  const rel = S.cam - S.L.base, zone = rel < SEG.f1b ? "a" : rel < SEG.f2a ? "sp" : rel < SEG.boss ? "b" : "boss";
  if (zone !== S.zone) {
    if (zone === "sp" && S.zone) Shell.flash("OPEN SPACE", "Flying discs incoming", "#3ff0ff", 1200);
    if (zone === "b") Shell.flash("BACK LOT", "Mind the force fields", "#ff9b3f", 1200);
    if (zone === "boss") startBoss();
    if (S.zone) fx("zone", zone);
    S.zone = zone;
  }

  // firing
  S.fireT -= dt;
  if (I.fire && S.fireT <= 0 && S.bullets.length < 7) {
    S.fireT = 0.15;
    S.bullets.push({ f: S.cam + 14, s: S.s, z: S.z, life: 1.1 });
    SND.shoot();
    V.firing = 0.25;
  }

  // obstacles: collisions and passes
  const obs = S.L.obs;
  for (i = 0; i < obs.length; i++) {
    o = obs[i];
    if (o.passed) continue;
    if (S.cam > o.f + THICK + 6) {
      o.passed = true;
      if ((o.t === "zap" && o.z0 > 0) || o.t === "wallzap") { S.unders++; if (S.unders === 1) award("fff-under"); }
      if (o.t === "gate" || (o.t === "zap" && o.z0 > 0)) SND.whoosh();
      continue;
    }
    if (S.cam < o.f - 7 || S.inv > 0) continue;
    const lo = S.z - 3, hi = S.z + 3;
    let hit = false;
    if (o.t === "wall") hit = lo < o.h;
    else if (o.t === "zap") hit = S.cam > o.f + 2 && S.cam < o.f + 8 && hi > o.z0 && lo < o.z1;
    else if (o.t === "wallzap") hit = lo < o.h || (S.cam > o.f + 2 && S.cam < o.f + 8 && hi > o.z0);
    else if (o.t === "gate") hit = !(S.s - 7 >= o.a && S.s + 7 <= o.b && hi < o.gh);
    if (hit) { die(o.t === "zap" ? "ZAPPED" : o.t === "wallzap" && hi > o.z0 && lo >= o.h ? "ZAPPED" : "HIT THE STACK"); return; }
  }
  // near a force field: a soft crackle
  for (i = 0; i < obs.length; i++) { o = obs[i]; if ((o.t === "zap" || o.t === "wallzap") && o.f - S.cam > 0 && o.f - S.cam < 120 && S.ticks % 9 === 0) { SND.zap(); break; } }

  // ground things
  const ents = S.L.ents;
  for (i = 0; i < ents.length; i++) {
    e = ents[i];
    if (e.dead) continue;
    const d = e.f - S.cam;
    if (d < -200) continue;
    if (S.inv <= 0 && Math.abs(d) < 10 && Math.abs(e.s - S.s) < 12 && S.z - 3 < e.h) { die("CRASHED"); return; }
    if (e.t === "turret" && d > 50 && d < 380) {
      e.cool -= dt;
      if (e.cool <= 0) { e.cool = Math.max(1.4, 2.6 - S.loop * 0.3) + Math.random() * 1.2; fireAt(e.f, e.s, e.h + 3, 92, "tag", 7); SND.turret(); e.recoil = 0.2; }
    }
  }

  // flying discs: spawn waves as they come into view
  const waves = S.L.waves;
  for (i = 0; i < waves.length; i++) {
    const wv = waves[i];
    if (wv.done || wv.f - S.cam > 540) continue;
    wv.done = true;
    for (j = 0; j < wv.n; j++) S.discs.push({ f: wv.f + j * 34, s0: wv.s, s: wv.s, z0: wv.z, z: wv.z, ph: j * 0.9, kind: wv.kind, t: 0, cool: 1 + Math.random() * 2, spin: Math.random() * TAU });
  }
  for (i = S.discs.length - 1; i >= 0; i--) {
    const dc = S.discs[i];
    dc.t += dt; dc.spin += dt * 9; dc.f -= (46 + S.loop * 6) * dt;
    if (dc.kind === 0) dc.s = clamp(dc.s0 + Math.sin(dc.t * 1.6 + dc.ph) * 34, -66, 66);
    else if (dc.kind === 1) { dc.s = clamp(dc.s0 + Math.sin(dc.t * 1.2 + dc.ph) * 22, -66, 66); dc.z = clamp(dc.z0 + Math.sin(dc.t * 2 + dc.ph) * 18, 10, 96); }
    else { dc.s += (S.s - dc.s) * Math.min(1, dt * 0.6); dc.z += (S.z - dc.z) * Math.min(1, dt * 0.5); }
    const dd = dc.f - S.cam;
    if (dd > 80 && dd < 420) { dc.cool -= dt; if (dc.cool <= 0) { dc.cool = 3 + Math.random() * 2.5; fireAt(dc.f, dc.s, dc.z, 90, "tag", 6); } }
    if (S.inv <= 0 && Math.abs(dd) < 9 && Math.abs(dc.s - S.s) < 12 && Math.abs(dc.z - S.z) < 8) { S.discs.splice(i, 1); die("DISC COLLISION"); return; }
    if (dd < -220) S.discs.splice(i, 1);
  }

  // bullets
  for (i = S.bullets.length - 1; i >= 0; i--) {
    b = S.bullets[i];
    const f0 = b.f; b.f += (S.v + 380) * dt; b.life -= dt;
    let gone = b.life <= 0;
    // walls stop bullets
    for (j = 0; j < obs.length && !gone; j++) {
      o = obs[j];
      if (o.f > b.f || o.f + THICK < f0) continue;
      if ((o.t === "wall" || o.t === "wallzap") && b.z < o.h) gone = true;
      if (o.t === "gate" && !(b.s >= o.a && b.s <= o.b && b.z < o.gh)) gone = true;
      if (gone) boom(o.f, b.s, b.z, 4, ["#eceae2", "#ffd23f"], 30);
    }
    for (j = 0; j < ents.length && !gone; j++) {
      e = ents[j];
      if (e.dead || e.f + 7 < f0 || e.f - 7 > b.f) continue;
      if (Math.abs(e.s - b.s) < 11 && b.z < e.h + 4) { gone = true; hitEnt(e); }
    }
    for (j = S.discs.length - 1; j >= 0 && !gone; j--) {
      const q = S.discs[j];
      if (q.f + 8 < f0 || q.f - 8 > b.f) continue;
      if (Math.abs(q.s - b.s) < 11 && Math.abs(q.z - b.z) < 10) {
        gone = true; S.discs.splice(j, 1); S.discsHit++; addScore(PTS.disc);
        boom(q.f, q.s, q.z, 14, ["#3ff0ff", "#eceae2", "#a77bff"], 60); SND.disc();
      }
    }
    for (j = S.shots.length - 1; j >= 0 && !gone; j--) {
      const m = S.shots[j];
      if (m.kind !== "missile" || m.f + 8 < f0 || m.f - 8 > b.f) continue;
      if (Math.abs(m.s - b.s) < 10 && Math.abs(m.z - b.z) < 10) { gone = true; S.shots.splice(j, 1); addScore(PTS.missile); boom(m.f, m.s, m.z, 10, ["#ff3fa4", "#ffd23f"], 50); SND.disc(); }
    }
    if (!gone && S.boss && !S.boss.dead && b.f >= S.boss.f - 14) {
      gone = true;
      const bs = S.boss;
      if (Math.abs(b.s - bs.s) < 25 && b.z > 38 && b.z < 78) {
        bs.hp--; bs.flash = 0.12; addScore(PTS.bossHit); SND.bossHit(); fx("bossHit");
        boom(bs.f - 14, b.s, b.z, 8, ["#9bff3f", "#eceae2"], 50);
        if (bs.hp <= 0) bossDown();
      } else if (Math.abs(b.s - bs.s) < 44 && b.z < 110) { SND.ping(); boom(bs.f - 14, b.s, b.z, 3, ["#8e93a2"], 30); }
      else gone = false;
    }
    if (gone) S.bullets.splice(i, 1);
  }

  moveShots(dt);
  stepBoss(dt, false);
}

function hitEnt(e) {
  e.dead = true;
  if (e.t === "tank") {
    S.tanks++; addScore(PTS.tank); S.fuel = Math.min(FUEL_MAX, S.fuel + 30);
    boom(e.f, e.s, 10, 36, ["#ff4b3e", "#ffd23f", "#eceae2", "#ff9b3f"], 80); SND.boom(true); SND.fuel(); Shell.shake(4, 0.25); camShake(2.2, 0.3);
    fx("tank", e);
  } else if (e.t === "ears") {
    S.ears++; addScore(PTS.ears);
    boom(e.f, e.s, 8, 22, ["#3ff0ff", "#eceae2", "#a77bff"], 60); SND.boom(false); SND.ears();
    Shell.flash("1000", "Rabbit ears, no reception", "#3ff0ff", 800);
    fx("ears", e);
  } else {
    S.turrets++; addScore(PTS.turret);
    boom(e.f, e.s, 6, 18, ["#ff9b3f", "#ffd23f", "#8e93a2"], 55); SND.boom(false);
  }
}

function fireAt(f, s, z, spd, kind, spread) {
  // aim roughly where the ship will be (it moves forward at S.v), with a little spread so it can be dodged
  const sp = spread || 0;
  let df = S.cam - f, dist;
  const ds = S.s - s + (Math.random() - 0.5) * 2 * sp, dz = S.z - z + (Math.random() - 0.5) * 2 * sp;
  dist = Math.sqrt(df * df + ds * ds + dz * dz) || 1;
  const tt = dist / spd;
  df += S.v * tt * 0.6; dist = Math.sqrt(df * df + ds * ds + dz * dz) || 1;
  S.shots.push({ f: f, s: s, z: z, vf: df / dist * spd, vs: ds / dist * spd, vz: dz / dist * spd, life: 4, kind: kind || "tag" });
}
function moveShots(dt) {
  for (let i = S.shots.length - 1; i >= 0; i--) {
    const m = S.shots[i];
    m.f += m.vf * dt; m.s += m.vs * dt; m.z += m.vz * dt; m.life -= dt;
    if (m.kind === "missile" && m.life > 2) { m.vs += clamp(S.s - m.s, -1, 1) * 30 * dt; m.vz += clamp(S.z - m.z, -1, 1) * 22 * dt; }
    if (!S.dead && S.inv <= 0 && Math.abs(m.f - S.cam) < 7 && Math.abs(m.s - S.s) < 8 && Math.abs(m.z - S.z) < 6) { S.shots.splice(i, 1); die(m.kind === "missile" ? "MARKED DOWN" : "PRICE TAGGED"); return; }
    if (m.life <= 0 || m.z < -60 || m.f < S.cam - 260) S.shots.splice(i, 1);
  }
}

/* ---------------- Boss: the Haggletron ---------------- */
function startBoss() {
  S.phase = "boss";
  S.boss = { f: S.cam + 215, s: 0, hp: 22 + S.loop * 4, max: 22 + S.loop * 4, t: 0, fire: 1.6, volley: 4.5, flash: 0, dead: 0, step: 0 };
  S.bossLost = S.lostLoop;
  Shell.flash("THE HAGGLETRON", "Shoot the price screen", "#9bff3f", 1600);
  Shell.tone(98, 0.6, "sawtooth", 0.2, 196); Shell.tone(147, 0.6, "square", 0.12, 98, 0.3);
  fx("boss");
}
function stepBoss(dt, frozen) {
  const B = S.boss;
  if (!B) return;
  B.t += dt; B.flash = Math.max(0, B.flash - dt);
  B.f = S.cam + 215;
  if (B.dead) {
    B.dead += dt;
    if (Math.random() < dt * 14) { boom(B.f, B.s + (Math.random() - 0.5) * 60, 10 + Math.random() * 90, 16, ["#ffd23f", "#ff4b3e", "#9bff3f", "#eceae2"], 70); SND.boom(Math.random() < 0.3); }
    if (B.dead > 1.9) nextLoop();
    return;
  }
  B.s = Math.sin(B.t * 0.85) * 40 + Math.sin(B.t * 2.3) * 6;
  if (frozen) return;
  B.fire -= dt; B.volley -= dt;
  if (B.fire <= 0) { B.fire = Math.max(0.8, 1.5 - S.loop * 0.2) + Math.random() * 0.5; fireAt(B.f - 14, B.s, 58, 100, "missile"); SND.missile(); fx("missile"); }
  if (B.volley <= 0) {
    B.volley = 4.2;
    for (let k = -1; k <= 1; k++) { fireAt(B.f - 14, B.s + k * 18, 92, 92, "tag"); const m = S.shots[S.shots.length - 1]; m.vs += k * 16; }
    SND.turret(); fx("volley");
  }
}
function bossDown() {
  const B = S.boss;
  B.dead = 0.0001; S.beaten++;
  const bonus = PTS.boss + Math.round(S.fuel) * 20;
  addScore(bonus);
  const clean = S.lostLoop === 0;
  if (clean) S.cleanBeat++;
  if (S.fuel < 20) award("fff-fumes");
  if (clean) award("fff-clean");
  Shell.flash("HAGGLE OVER!", "+" + bonus + " incl. fuel bonus", "#9bff3f", 1800);
  Shell.shake(8, 0.8); camShake(4, 0.8); SND.boom(true); SND.win();
  S.shots.length = 0;
  fx("bossDown", bonus);
}
function nextLoop() {
  S.loop++; S.lostLoop = 0;
  const base = S.cam + 420;
  S.L.spans[S.L.spans.length - 1][1] = base - 120;
  const keep = S.L.spans.slice();
  S.L = buildLevel(S.loop, base);
  S.L.spans = keep.concat(S.L.spans);
  S.v = V0 + Math.min(3, S.loop) * 10;
  S.boss = null; S.phase = "fly"; S.zone = "";
  Shell.flash("FORTRESS " + (S.loop + 1), "Faster stalls, meaner prices", "#ff9b3f", 1600);
  fx("fortress");
}

/* ---------------- End of run ---------------- */
function row(a, b) { return '<div class="np-row"><span>' + a + "</span><b>" + b + "</b></div>"; }
function padsOff(on) { if (document.body.classList.contains("fff-touch")) { document.body.classList.toggle("fff-over", on); window.dispatchEvent(new Event("resize")); } }
function finish() {
  if (window.__fffPads) window.__fffPads.clear();
  const reached = S.beaten > 0 ? "Fortress " + (S.loop + 1) : (S.cam - S.L.base > SEG.f2a ? "The Back Lot" : S.cam - S.L.base > SEG.sp ? "Open space" : "The Front Lot");
  ledFinal(S.score);
  Shell.gameOver(S.score, { title: S.beaten ? "HAGGLE OVER" : "SHIPS ALL GONE", html:
    row("Reached", reached) + row("Haggletrons beaten", S.beaten) + row("Fuel tanks shot", S.tanks) +
    row("Turrets shot", S.turrets) + row("Flying discs", S.discsHit) + row("Rabbit ears", S.ears),
    stats: { score: S.score, tanks: S.tanks, ears: S.ears, discs: S.discsHit, turrets: S.turrets, beaten: S.beaten, clean: S.cleanBeat, unders: S.unders, loop: S.loop } });
  padsOff(true);   // the game over card gets the full height on phones
}

// Is something lined up with the nose? (drives the reticle color) Same test as the 2D game.
function aimed() {
  let best = null, bd = 1e9, i, e, d;
  for (i = 0; i < S.L.ents.length; i++) { e = S.L.ents[i]; d = e.f - S.cam; if (!e.dead && d > 20 && d < 360 && Math.abs(e.s - S.s) < 11 && S.z < e.h + 4 && d < bd) { bd = d; best = [e.f, e.s, e.h * 0.6]; } }
  for (i = 0; i < S.discs.length; i++) { e = S.discs[i]; d = e.f - S.cam; if (d > 20 && d < 360 && Math.abs(e.s - S.s) < 11 && Math.abs(e.z - S.z) < 10 && d < bd) { bd = d; best = [e.f, e.s, e.z]; } }
  const B = S.boss; if (B && !B.dead && Math.abs(B.s - S.s) < 25 && S.z > 38 && S.z < 78) best = [B.f - 14, B.s, S.z];
  return best;
}

/* ---------------- Music: an original synth loop, self-contained ----------------
   startMusic(ctx, dest, opts) plays "Swap Meet Skyline", a sixteen-bar loop in E minor at 138 BPM (bass, arpeggio,
   pad, lead, drums), made entirely in code with the Web Audio API. It knows nothing about the game: give it any
   AudioContext and any destination node and it plays until the function it returns is called. That stop function
   fades the loop out and returns the sixteenth-note step it stopped on, so a later startMusic(ctx, dest, { step })
   can carry on from there. opts: { step: 0-255, volume: 0-1 (default 0.5), delay: seconds before the first note }. */
function startMusic(ctx, dest, opts) {
  opts = opts || {};
  const BPM = 138, SPB = 60 / BPM / 4, LEN = 256, AHEAD = 0.3;
  const vol = opts.volume == null ? 0.5 : opts.volume;
  const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  // one chord per bar: bass note, then the three notes the arpeggio and the pad use (MIDI numbers)
  const CH = { Em: [40, 64, 67, 71], C: [36, 60, 64, 67], G: [43, 62, 67, 71], D: [38, 62, 66, 69], Am: [45, 60, 64, 69], B: [47, 63, 66, 71] };
  const PROG = "Em C G D Em C Am B C D G Em C D B B".split(" ");
  // the tune, a bar a line: step in the bar, note (with # for sharp), octave, length in steps
  const BARS = [
    "0E5-2 2G5-2 4B5-3 7A5-1 8G5-2 10F#5-2 12E5-4",
    "0G5-2 2E5-2 4C5-2 6E5-2 8G5-4 12A5-2 14G5-2",
    "0D5-2 2G5-2 4B5-4 8D6-3 11B5-1 12A5-4",
    "0F#5-2 2A5-2 4D6-2 6A5-2 8F#5-4 12D5-2 14E5-2",
    "0E5-1 1E5-1 2G5-2 4B5-2 6E6-2 8D6-2 10B5-2 12G5-4",
    "0C6-3 3B5-1 4G5-2 6E5-2 8G5-2 10A5-2 12B5-4",
    "0A5-2 2C6-2 4E6-4 8D6-2 10C6-2 12A5-4",
    "0B5-4 4A5-2 6F#5-2 8D#5-4 12F#5-2 14A5-2",
    "0G5-6 6E5-2 8C5-2 10E5-2 12G5-2 14A5-2",
    "0A5-6 6F#5-2 8D5-2 10F#5-2 12A5-2 14B5-2",
    "0B5-4 4D6-4 8G6-3 11F#6-1 12D6-4",
    "0E6-4 4B5-2 6G5-2 8E5-4 12G5-2 14B5-2",
    "0C6-2 2B5-2 4G5-2 6E5-2 8C6-2 10B5-2 12G5-2 14E5-2",
    "0D6-2 2A5-2 4F#5-2 6D5-2 8D6-2 10E6-2 12F#6-4",
    "0F#6-3 3E6-1 4D#6-2 6B5-2 8F#5-2 10A5-2 12B5-4",
    "0B5-2 2D#6-2 4F#6-2 6A6-2 8B6-6 14F#6-2"
  ];
  const LEAD = new Array(LEN).fill(null);
  BARS.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(#?)(\d)-(\d+)$/.exec(tok);
      if (m) LEAD[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + semis[m[2]] + (m[3] ? 1 : 0), Number(m[5])];
    });
  });

  // the mixing desk: everything goes through one gain (for the fade) and a gentle compressor
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.gain.setTargetAtTime(vol, ctx.currentTime + 0.02, 0.06);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.18;
  comp.connect(out); out.connect(dest);
  function filt(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const leadBus = filt("lowpass", 3600, 0.7, comp), bassBus = filt("lowpass", 820, 1.4, comp), padBus = filt("lowpass", 1500, 0.5, comp);
  const arpBus = filt("highpass", 300, 0.7, comp), drumBus = ctx.createGain(); drumBus.connect(comp);
  // a dotted-eighth echo on the lead and the arpeggio
  const send = ctx.createGain(), echo = ctx.createDelay(1), back = ctx.createGain(), damp = filt("lowpass", 2200, 0.7, comp);
  send.gain.value = 0.28; echo.delayTime.value = SPB * 3; back.gain.value = 0.3;
  leadBus.connect(send); arpBus.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(damp);
  const nlen = Math.floor(ctx.sampleRate);
  const noise = ctx.createBuffer(1, nlen, ctx.sampleRate), nd = noise.getChannelData(0);
  let seed = 0x1F2E3D4C;
  for (let i = 0; i < nlen; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; nd[i] = ((seed >>> 0) / 4294967296) * 2 - 1; }

  function tone(to, type, f0, t, dur, v, f1, hold, detune) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.01, dur * (hold == null ? 0.6 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.006);
    g.gain.setValueAtTime(v, h);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(to, t, dur, v, type, f0, q, f1) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(to);
    s.start(t, (t * 7.31) % 0.9); s.stop(t + dur + 0.05);
  }
  function pad(t, notes) {                                  // a soft two-oscillator chord held for the whole bar
    for (let i = 0; i < notes.length; i++) {
      [-9, 9].forEach(function (dt) {
        const o = ctx.createOscillator(), g = ctx.createGain(), len = SPB * 16;
        o.type = "sawtooth"; o.frequency.setValueAtTime(mtof(notes[i]), t); o.detune.setValueAtTime(dt, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.02, t + SPB * 3);
        g.gain.setValueAtTime(0.02, t + len - SPB * 2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.05);
        o.connect(g); g.connect(padBus); o.start(t); o.stop(t + len + 0.1);
      });
    }
  }
  // everything that sounds on sixteenth-note i of the loop, starting at time t
  function play(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[bar]], second = bar >= 8, n = LEAD[i];
    if (s === 0) pad(t, ch.slice(1));
    if (n) { tone(leadBus, "square", mtof(n[0]), t, n[1] * SPB * 0.95, 0.15); tone(leadBus, "square", mtof(n[0]), t, n[1] * SPB * 0.95, 0.05, 0, 0.6, 12); }
    // arpeggio: sixteenths up and down the chord, an octave up in the second half
    const arp = [1, 2, 3, 2][s & 3] + 0, up = (s >> 2) & 1 ? 12 : 0;
    tone(arpBus, "square", mtof(ch[arp] + up + (second ? 12 : 0)), t, SPB * 0.8, 0.035, 0, 0.3);
    if (!(s & 1)) {                                         // bass: driving octave eighths
      const k = s >> 1;
      tone(bassBus, "sawtooth", mtof(ch[0] + (k & 1 ? 12 : 0)), t, SPB * 1.8, 0.22, 0, 0.5);
      tone(bassBus, "square", mtof(ch[0] - 12 + (k & 1 ? 12 : 0)), t, SPB * 1.8, 0.1, 0, 0.5);
    }
    // drums
    const fill = (bar === 7 || bar === 15) && s >= 12;
    const kick = second ? s % 4 === 0 : s === 0 || s === 6 || s === 8 || s === 11;
    if (kick && !fill) tone(drumBus, "sine", 160, t, 0.18, 0.75, 40, 0.06);
    if (s === 4 || s === 12 || fill) {
      const v = fill ? 0.45 + 0.4 * (s - 12) / 3 : 1;
      hiss(drumBus, t, 0.14, 0.3 * v, "bandpass", 1800, 0.6);
      tone(drumBus, "triangle", 220, t, 0.08, 0.18 * v, 140, 0.1);
    }
    if (!(s & 1) || second) hiss(drumBus, t, s % 4 === 2 ? 0.12 : 0.035, s % 4 === 2 ? 0.07 : 0.045, "highpass", 7600, 0.7);
  }

  let step = ((opts.step | 0) % LEN + LEN) % LEN, nextT = ctx.currentTime + (opts.delay == null ? 0.08 : opts.delay), alive = true;
  function schedule() {
    if (!alive) return;
    const now = ctx.currentTime;
    if (nextT < now - 0.25) nextT = now + 0.03;             // after a long stall, pick up again instead of rushing
    while (nextT < now + AHEAD) { try { play(step, nextT); } catch (e) { /* skip a note rather than stop the band */ } step = (step + 1) % LEN; nextT += SPB; }
  }
  const timer = setInterval(schedule, 40);
  schedule();
  return function stop() {
    if (!alive) return step;
    alive = false;
    clearInterval(timer);
    const now = ctx.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setTargetAtTime(0.0001, now, 0.05);
    setTimeout(function () { try { out.disconnect(); } catch (e) { /* already gone */ } }, 700);
    return step;
  };
}

/* ---------------- Sound manager: the music, its toggle, and a few extra stingers ----------------
   The shell still plays every sound effect the 2D game had, exactly when it did. This adds the music and a few
   stingers on their own audio context, created on the first tap, click or key press and never before. The shell's
   mute button (its "npArcade.muted" setting) silences all of it; the music toggle ("npArcade.music") is remembered
   on its own. */
const MUSIC_VOL = 0.42, SFX_VOL = 0.22, MUSIC_KEY = "npArcade.music";
const Juke = (function () {
  let ac = null, out = null, musicBus = null, sfxBus = null, dead = false, muted = false, stopFn = null, step = 0, fresh = true;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  const buttons = [];
  function shellMuted() {
    const b = document.getElementById("np-mute");
    if (b) return b.getAttribute("aria-pressed") === "true";
    try { return localStorage.getItem("npArcade.muted") === "1"; } catch (e) { return false; }
  }
  // Browsers only let sound start from a tap, a click or a key press, so this is called from those and nowhere else.
  function unlock() {
    if (dead) return;
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        ac = new AC();
        out = ac.createGain(); out.connect(ac.destination);
        musicBus = ac.createGain(); musicBus.gain.value = 1; musicBus.connect(out);
        sfxBus = ac.createGain(); sfxBus.gain.value = SFX_VOL; sfxBus.connect(out);
        muted = shellMuted();
        out.gain.value = muted ? 0 : 1;
      }
      if (ac.state !== "running") { const p = ac.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { ac = null; dead = true; }
  }
  // Called every frame: follow the mute button, and keep the band playing only while a game is on.
  function pump() {
    if (!ac || !window.Shell) return;
    const m = shellMuted();
    if (m !== muted) { muted = m; out.gain.setTargetAtTime(m ? 0 : 1, ac.currentTime, 0.02); }
    const want = musicOn && !muted && ac.state === "running" && Shell.state() === "playing";
    if (want && !stopFn) { stopFn = startMusic(ac, musicBus, { step: step, volume: MUSIC_VOL, delay: fresh ? 0.45 : 0.06 }); fresh = false; }
    else if (!want && stopFn) { step = stopFn(); stopFn = null; }
  }
  function osc(type, f0, t, dur, v, f1, hold) {
    const o = ac.createOscillator(), g = ac.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.5 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.006);
    g.gain.setValueAtTime(v, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.03);
  }
  function cue(name, t) {
    if (name === "tank") {                                  // the tank goes up: a deep thump and a gulp
      osc("sine", 120, t, 0.35, 0.9, 38, 0.1); osc("square", 260, t + 0.05, 0.18, 0.12, 620, 0.6);
    } else if (name === "boss") {                           // the Haggletron rolls in: a rising alarm, twice
      for (let i = 0; i < 2; i++) { osc("sawtooth", 220, t + i * 0.5, 0.42, 0.16, 660, 0.8); osc("square", 110, t + i * 0.5, 0.42, 0.08, 330, 0.8); }
    } else if (name === "die") {                            // a low sad slide
      osc("triangle", 196, t + 0.15, 0.5, 0.25, 70, 0.5);
    }
  }
  function sfx(name) {
    if (!ac || muted || ac.state !== "running") return;
    try { cue(name, ac.currentTime + 0.01); } catch (e) { /* sound is never worth a crash */ }
  }
  const NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 4v11.2A3.5 3.5 0 1 0 11 18V8.6l8-1.8v6.4A3.5 3.5 0 1 0 21 16V2z"/></svg>';
  const NOTE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" opacity=".45" d="M9 4v11.2A3.5 3.5 0 1 0 11 18V8.6l8-1.8v6.4A3.5 3.5 0 1 0 21 16V2z"/><path fill="none" stroke="currentColor" stroke-width="2.4" d="M3 3l18 18"/></svg>';
  function label() {
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      b.setAttribute("aria-pressed", musicOn ? "true" : "false");
      if (b.classList.contains("np-icon")) { b.innerHTML = musicOn ? NOTE : NOTE_OFF; b.setAttribute("aria-label", musicOn ? "Music on, turn it off" : "Music off, turn it on"); }
      else b.textContent = musicOn ? "MUSIC: ON" : "MUSIC: OFF";
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
  // A note icon in the top bar, beside the shell's mute button.
  function barButton() {
    const mute = document.getElementById("np-mute");
    if (!mute || !mute.parentNode) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-icon"; b.id = "np-music";
    b.addEventListener("click", function (e) {
      e.stopPropagation(); unlock(); setMusic(!musicOn);
      if (e.detail > 0 && Shell.state() === "playing") { const c = document.getElementById("np-canvas"); try { c.focus({ preventScroll: true }); } catch (er) { c.focus(); } }
    });
    mute.parentNode.insertBefore(b, mute);
    buttons.push(b); label();
  }
  return {
    unlock: unlock, pump: pump, sfx: sfx, button: button, barButton: barButton,
    newGame: function () { unlock(); if (stopFn) { stopFn(); stopFn = null; } step = 0; fresh = true; pump(); },
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    peek: function () { return { made: !!ac, state: ac ? ac.state : "none", playing: !!stopFn, step: step, muted: muted, musicOn: musicOn }; }
  };
})();

/* =====================================================================================
   3D presentation
   ===================================================================================== */

function vrng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// The picture rolls its own dice (shake, sparkle), so the rules see exactly the random numbers the 2D game would.
const vrand = (function () { let s = 0x2545F491; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; })();
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
function speckle(g, w, h, n, rnd, light, dark) {
  for (let i = 0; i < n; i++) { g.fillStyle = rnd() < 0.5 ? light : dark; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
}

/* ---------------- Painted textures (all drawn here, no image files besides the two logos) ---------------- */

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every sign and decal in the fortress uses this
// (the full logo with the mascot is kept for the splash, the title and the score card). If the PNG is missing,
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

function candyText(g, str, x, y, size, maxW, palette) {
  const face = '"Arial Black", "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
  g.font = "900 " + size + "px " + face;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + face; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = size * 0.36; g.strokeStyle = "#08205f"; g.strokeText(str, x, y + size * 0.06);
  g.lineWidth = size * 0.17; g.strokeStyle = "#ffffff"; g.strokeText(str, x, y);
  const p = palette || ["#fff06a", "#ffc21a", "#ff7a0f"];
  const gr = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  gr.addColorStop(0, p[0]); gr.addColorStop(0.55, p[1]); gr.addColorStop(1, p[2]);
  g.fillStyle = gr; g.fillText(str, x, y);
  g.fillStyle = "rgba(255,255,255,.45)";
  g.save(); g.beginPath(); g.rect(x - 900, y - size * 0.5, 1800, size * 0.36); g.clip(); g.fillText(str, x, y); g.restore();
}

// Deep space, wrapped on the inside of a sphere around the camera: violet and indigo, two nebulae, a lot of stars.
function skyCanvas() {
  const c = mkCanvas(1024, 512), g = c.getContext("2d"), rnd = vrng(7);
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, "#07051a"); gr.addColorStop(0.42, "#1a1050"); gr.addColorStop(0.55, "#2a1466"); gr.addColorStop(0.7, "#120a3a"); gr.addColorStop(1, "#05030f");
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  [[220, 210, 190, "rgba(255,63,164,.22)"], [700, 250, 240, "rgba(63,180,255,.18)"], [480, 160, 130, "rgba(167,123,255,.2)"], [930, 330, 160, "rgba(255,155,63,.12)"]].forEach(function (n) {
    for (let k = -1; k <= 1; k++) {
      const x = n[0] + k * 1024, rg = g.createRadialGradient(x, n[1], 0, x, n[1], n[2]);
      rg.addColorStop(0, n[3]); rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg; g.fillRect(x - n[2], n[1] - n[2], n[2] * 2, n[2] * 2);
    }
  });
  for (let i = 0; i < 900; i++) {
    const y = rnd() * 512, s = rnd() < 0.08 ? 2 : 1, a = 0.35 + rnd() * 0.65;
    g.fillStyle = rnd() < 0.12 ? "rgba(255,210,63," + a + ")" : rnd() < 0.2 ? "rgba(63,240,255," + a + ")" : "rgba(236,234,226," + a + ")";
    g.fillRect(rnd() * 1024, y, s, s);
  }
  return c;
}
// The giant record drifting in space: grooves, a shine, and the wordmark on its label.
function recordCanvas(script) {
  const c = mkCanvas(512, 512), g = c.getContext("2d");
  g.fillStyle = "#0d0c14"; g.beginPath(); g.arc(256, 256, 254, 0, TAU); g.fill();
  for (let r = 250; r > 90; r -= 3) { g.strokeStyle = r % 9 === 0 ? "#22203a" : "#16151f"; g.lineWidth = 1.2; g.beginPath(); g.arc(256, 256, r, 0, TAU); g.stroke(); }
  g.save(); g.globalCompositeOperation = "lighter";
  [[-0.5, 0.25], [2.64, 0.25]].forEach(function (a) {
    const sh = g.createRadialGradient(256, 256, 90, 256, 256, 250);
    sh.addColorStop(0, "rgba(140,120,255,0)"); sh.addColorStop(0.6, "rgba(140,120,255,.22)"); sh.addColorStop(1, "rgba(140,120,255,0)");
    g.fillStyle = sh; g.beginPath(); g.moveTo(256, 256); g.arc(256, 256, 250, a[0], a[0] + a[1]); g.closePath(); g.fill();
  });
  g.restore();
  const lb = g.createRadialGradient(256, 236, 10, 256, 256, 92);
  lb.addColorStop(0, "#ff9b3f"); lb.addColorStop(1, "#e2551a");
  g.fillStyle = lb; g.beginPath(); g.arc(256, 256, 88, 0, TAU); g.fill();
  drawScript(g, script, 256, 238, 150, 64);
  g.fillStyle = "#101219"; g.font = "bold 15px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("SIDE A  33 1/3", 256, 300);
  g.fillStyle = "#05040a"; g.beginPath(); g.arc(256, 256, 7, 0, TAU); g.fill();
  return c;
}
function planetCanvas() {
  const c = mkCanvas(256, 128), g = c.getContext("2d"), rnd = vrng(31);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, "#ff7ac6"); gr.addColorStop(0.5, "#a24bd6"); gr.addColorStop(1, "#3a1f8a");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 9; i++) { g.fillStyle = "rgba(255,255,255," + (0.05 + rnd() * 0.1) + ")"; g.fillRect(0, rnd() * 128, 256, 3 + rnd() * 9); }
  return c;
}

// The parking lot the stalls are set out on: one tile is 60 units along the fortress by its full 140 width.
// u runs across (s = -70 at the left), v runs along (a painted stall line at v = 0).
function floorCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = vrng(3);
  g.fillStyle = "#3b4160"; g.fillRect(0, 0, 512, 256);
  speckle(g, 512, 256, 9000, rnd, "rgba(255,255,255,.05)", "rgba(10,12,30,.12)");
  for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(20,24,46,.18)"; g.beginPath(); g.ellipse(rnd() * 512, rnd() * 256, 20 + rnd() * 50, 8 + rnd() * 20, rnd() * 3, 0, TAU); g.fill(); }   // oil stains
  g.fillStyle = "#e8bf3a"; g.fillRect(0, 248, 512, 8);                                  // the stall line (f = 0..2)
  g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(0, 248, 512, 2);
  for (let k = 1; k < 4; k++) { g.fillStyle = "rgba(232,191,58,.55)"; for (let y = 0; y < 248; y += 22) g.fillRect(k * 128 - 1.5, y, 3, 12); }   // dashed lanes
  g.fillStyle = "#ff9b3f"; g.fillRect(501, 0, 11, 256);                                // the orange edge stripe (s = 67..70)
  g.fillStyle = "#ffd23f"; g.fillRect(499, 0, 2, 256);
  return c;
}
// A blanket for a stall: a white plaid the instance color tints.
function blanketCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 128, 128);
  g.fillStyle = "rgba(0,0,0,.18)"; for (let i = 8; i < 128; i += 32) { g.fillRect(i, 0, 12, 128); g.fillRect(0, i, 128, 12); }
  g.fillStyle = "rgba(255,255,255,.5)"; for (let i = 26; i < 128; i += 32) { g.fillRect(i, 0, 2, 128); g.fillRect(0, i, 128, 2); }
  g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 6; g.strokeRect(3, 3, 122, 122);
  return c;
}
// The junk on the blankets: little boxes with a band and a sticker, tinted per item.
function itemCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 64, 64);
  g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(0, 44, 64, 20);
  g.fillStyle = "#f6f2e4"; g.fillRect(0, 8, 64, 10);
  g.fillStyle = "#ff3fa4"; g.beginPath(); g.arc(48, 32, 7, 0, TAU); g.fill();
  return c;
}
// The VHS shelf along the left edge: two rows of tape spines, one tile is 70 units long and 22 tall.
function shelfCanvas() {
  const c = mkCanvas(512, 160), g = c.getContext("2d"), rnd = vrng(13);
  g.fillStyle = "#5a3522"; g.fillRect(0, 0, 512, 160);
  const ky = 160 / 22, kx = 512 / 70;
  [[3, 10], [12, 19]].forEach(function (rw) {
    const y0 = 160 - rw[1] * ky, y1 = 160 - rw[0] * ky;
    g.fillStyle = "#2a160c"; g.fillRect(0, y0 - 2, 512, y1 - y0 + 4);
    for (let i = 0; i < 10; i++) {
      const x = i * 7 * kx + 1;
      g.fillStyle = rnd() < 0.5 ? "#121216" : "#1f1f2a"; g.fillRect(x, y0, 7 * kx - 2, y1 - y0);
      const lc = ["#eceae2", "#ffd23f", "#ff3fa4", "#3ff0ff", "#9bff3f"][Math.floor(rnd() * 5)];
      g.fillStyle = lc; g.fillRect(x + 6, y0 + 8, 7 * kx - 14, y1 - y0 - 18);
      g.fillStyle = "rgba(0,0,0,.55)"; for (let k = 0; k < 3; k++) g.fillRect(x + 10 + rnd() * 8, y0 + 14 + k * 9, 14 + rnd() * 10, 3);
    }
  });
  g.fillStyle = "#7b4c30"; g.fillRect(0, 0, 512, 8); g.fillRect(0, 150, 512, 10);
  g.fillStyle = "rgba(255,230,190,.25)"; g.fillRect(0, 0, 512, 2);
  return c;
}
// The edge of the floating lot: steel girders and rivets, a warning stripe along the top. One tile is 60 x 26.
function underCanvas() {
  const c = mkCanvas(256, 128), g = c.getContext("2d");
  g.fillStyle = "#1e2236"; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = "#2c3150"; g.lineWidth = 7;
  g.beginPath(); g.moveTo(0, 20); g.lineTo(128, 120); g.lineTo(256, 20); g.stroke();
  g.fillStyle = "#151827"; for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 6, 128);
  g.fillStyle = "#7a7f99"; for (let x = 12; x < 256; x += 24) { g.beginPath(); g.arc(x, 24, 2.2, 0, TAU); g.fill(); }
  g.fillStyle = "#ffd23f"; g.fillRect(0, 0, 256, 14);
  g.fillStyle = "#101219"; for (let x = -16; x < 256; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 12, 0); g.lineTo(x + 24, 14); g.lineTo(x + 12, 14); g.fill(); }
  return c;
}

/* The faces of the walls. Each canvas tiles in world units (tw wide, th tall). */
const BOXC = [["#c8322d", "#eceae2"], ["#2a5fb0", "#ffd23f"], ["#e0a52a", "#1a1a22"], ["#2f8f5a", "#eceae2"], ["#7a3fa8", "#ffd23f"], ["#d9d4c4", "#c8322d"], ["#16b9e8", "#ffffff"], ["#ff3fa4", "#fff3cf"]];
// Look 0: stacked game boxes, 17 x 11 each, bricked. One tile is 68 x 44.
function wallBoxesCanvas(script) {
  const c = mkCanvas(512, 332), g = c.getContext("2d"), rnd = vrng(17), kx = 512 / 68, ky = 332 / 44;
  g.fillStyle = "#1a1c28"; g.fillRect(0, 0, 512, 332);
  for (let r = 0; r < 4; r++) {
    const y = 332 - (r + 1) * 11 * ky, off = r % 2 ? -8.5 : 0;
    for (let k = 0; k < 4; k++) {
      const x = (k * 17 + off) * kx, w = 17 * kx, h = 11 * ky, bc = BOXC[Math.floor(rnd() * BOXC.length)];
      for (const ox of [0, 512]) {                           // drawn twice so a box cut by the tile edge wraps round
        const xx = x + ox;
        g.save(); g.beginPath(); g.rect(xx + 2, y + 2, w - 4, h - 4); g.clip();
        const bg = g.createLinearGradient(0, y, 0, y + h); bg.addColorStop(0, shade(bc[0], 0.18)); bg.addColorStop(1, shade(bc[0], -0.15));
        g.fillStyle = bg; g.fillRect(xx, y, w, h);
        g.fillStyle = bc[1]; g.fillRect(xx, y + 8, w, 13);                         // the title band
        g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(xx + 10, y + 12, w * 0.45, 4);
        rrectPath(g, xx + w * 0.3, y + h * 0.42, w * 0.4, h * 0.42, 8); g.fillStyle = "#0d1f5c"; g.fill();   // a little logo plate
        drawScript(g, script, xx + w / 2, y + h * 0.63, w * 0.36, h * 0.34);
        g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(xx, y, w, 4);
        g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(xx + w - 6, y, 6, h);
        g.restore();
      }
    }
  }
  return c;
}
// Look 1: VHS tapes on end, 7 x 14 each. One tile is 70 x 42.
function wallTapesCanvas() {
  const c = mkCanvas(512, 308), g = c.getContext("2d"), rnd = vrng(21), kx = 512 / 70, ky = 308 / 42;
  g.fillStyle = "#3a2418"; g.fillRect(0, 0, 512, 308);
  for (let r = 0; r < 3; r++) {
    const y = 308 - (r + 1) * 14 * ky;
    for (let k = 0; k < 10; k++) {
      const x = k * 7 * kx, w = 7 * kx, h = 14 * ky;
      g.fillStyle = rnd() < 0.5 ? "#121216" : "#1f1f2a"; g.fillRect(x + 2, y + 3, w - 4, h - 4);
      const lc = ["#eceae2", "#ffd23f", "#ff3fa4", "#3ff0ff"][Math.floor(rnd() * 4)];
      g.fillStyle = lc; g.fillRect(x + 8, y + 26, w - 16, h - 52);
      g.fillStyle = "rgba(0,0,0,.6)";
      g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(-Math.PI / 2);
      g.font = "bold 13px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(["BE KIND REWIND", "RENTAL COPY", "TAPE 2 OF 2", "SP  T-120", "STAFF PICK"][Math.floor(rnd() * 5)], 0, 0);
      g.restore();
      g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(x + 2, y + 3, 3, h - 4);
    }
  }
  return c;
}
// Look 2: shipping crates, 17 x 11 each. One tile is 68 x 44.
function wallCratesCanvas() {
  const c = mkCanvas(512, 332), g = c.getContext("2d"), rnd = vrng(23), kx = 512 / 68, ky = 332 / 44;
  g.fillStyle = "#2a1a0e"; g.fillRect(0, 0, 512, 332);
  for (let r = 0; r < 4; r++) {
    const y = 332 - (r + 1) * 11 * ky;
    for (let k = 0; k < 4; k++) {
      const x = k * 17 * kx, w = 17 * kx, h = 11 * ky;
      g.fillStyle = rnd() < 0.5 ? "#a8743f" : "#97663a"; g.fillRect(x + 2, y + 2, w - 4, h - 4);
      for (let s = 0; s < 4; s++) { g.fillStyle = "rgba(90,55,25,.35)"; g.fillRect(x + 4, y + 6 + s * (h / 4), w - 8, 2); }
      g.strokeStyle = "#5e3c1c"; g.lineWidth = 5; g.strokeRect(x + 5, y + 5, w - 10, h - 10);
      g.beginPath(); g.moveTo(x + 7, y + 7); g.lineTo(x + w - 7, y + h - 7); g.stroke();
      g.fillStyle = "rgba(40,20,8,.55)"; g.font = "900 15px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(["FRAGILE", "THIS SIDE UP", "MINT IN BOX", "LOT #" + (10 + Math.floor(rnd() * 89)), "AS IS"][Math.floor(rnd() * 5)], x + w / 2, y + h / 2 + 12);
    }
  }
  return c;
}
// A painted board for the stall signs ("NO REFUNDS" and the rest).
function signCanvas(text, col) {
  const c = mkCanvas(512, 112), g = c.getContext("2d");
  rrectPath(g, 3, 3, 506, 106, 18); g.fillStyle = "#0d1f5c"; g.fill();
  g.lineWidth = 7; g.strokeStyle = col || "#ff9214"; g.stroke();
  g.lineWidth = 2; g.strokeStyle = "#ffe45c"; rrectPath(g, 13, 13, 486, 86, 12); g.stroke();
  candyText(g, text, 256, 58, 60, 452);
  return c;
}
// The big marquee over the named gates: the wordmark, and the gate's name under it.
function marqueeCanvas(script, title) {
  const c = mkCanvas(1024, 420), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 420);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 420);
  for (let i = 0; i < 28; i += 2) { g.fillStyle = "rgba(255,255,255,.07)"; g.beginPath(); g.moveTo(512, 170); g.arc(512, 170, 1200, i / 28 * TAU, (i + 1) / 28 * TAU); g.closePath(); g.fill(); }
  const gl = g.createRadialGradient(512, 160, 10, 512, 160, 360); gl.addColorStop(0, "rgba(160,210,255,.5)"); gl.addColorStop(1, "rgba(160,210,255,0)");
  g.fillStyle = gl; g.fillRect(0, 0, 1024, 420);
  g.lineWidth = 18; g.strokeStyle = "#ff9214"; g.strokeRect(9, 9, 1006, 402);
  g.lineWidth = 5; g.strokeStyle = "#ffe45c"; g.strokeRect(22, 22, 980, 376);
  for (let i = 0; i < 26; i++) { g.fillStyle = i % 2 ? "#fff6c8" : "#ffd21f"; g.beginPath(); g.arc(50 + i * 37, 40, 8, 0, TAU); g.fill(); g.beginPath(); g.arc(50 + i * 37, 380, 8, 0, TAU); g.fill(); }
  drawScript(g, script, 512, 170, 780, 230);
  candyText(g, title, 512, 322, 74, 860);
  return c;
}
// A fuel tank's skin, wrapped once around: red, a white band with FUEL on it twice, hazard stripes and the wordmark.
function tankCanvas(script) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 512, 0);
  bg.addColorStop(0, "#e2392f"); bg.addColorStop(0.5, "#b8261f"); bg.addColorStop(1, "#e2392f");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#f4efdf"; g.fillRect(0, 86, 512, 84);
  for (let x = -20; x < 512; x += 28) { g.fillStyle = "#101219"; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 14, 0); g.lineTo(x + 28, 22); g.lineTo(x + 14, 22); g.fill(); g.fillStyle = "#ffd23f"; g.beginPath(); g.moveTo(x + 14, 0); g.lineTo(x + 28, 0); g.lineTo(x + 42, 22); g.lineTo(x + 28, 22); g.fill(); }
  [0, 256, 512].forEach(function (x) { candyText(g, "FUEL", x, 128, 62, 210, ["#ff6a5a", "#e2231a", "#a8140f"]); });
  [128, 384].forEach(function (x) { drawScript(g, script, x, 212, 150, 50); });
  g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(0, 30, 512, 6);
  return c;
}
// A pink price tag (the turrets' and the discs' shots).
function tagCanvas() {
  const c = mkCanvas(128, 64), g = c.getContext("2d");
  g.fillStyle = "#ff3fa4"; g.beginPath(); g.moveTo(28, 4); g.lineTo(124, 4); g.lineTo(124, 60); g.lineTo(28, 60); g.lineTo(4, 32); g.closePath(); g.fill();
  g.lineWidth = 4; g.strokeStyle = "#ffd0e8"; g.stroke();
  g.fillStyle = "#101219"; g.beginPath(); g.arc(22, 32, 6, 0, TAU); g.fill();
  g.fillStyle = "#ffffff"; g.font = "900 34px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("$1", 80, 34);
  return c;
}
// A record seen from above: grooves, a label in the squadron's color, the wordmark on it.
function discCanvas(col, script) {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  g.fillStyle = "#0d0d12"; g.beginPath(); g.arc(128, 128, 127, 0, TAU); g.fill();
  for (let r = 124; r > 50; r -= 3) { g.strokeStyle = r % 9 === 1 ? "#2a2a3a" : "#18181f"; g.lineWidth = 1.2; g.beginPath(); g.arc(128, 128, r, 0, TAU); g.stroke(); }
  g.fillStyle = "rgba(255,255,255,.14)"; g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 124, -0.9, -0.5); g.fill(); g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 124, 2.24, 2.64); g.fill();
  g.fillStyle = col; g.beginPath(); g.arc(128, 128, 46, 0, TAU); g.fill();
  drawScript(g, script, 128, 122, 80, 34);
  g.fillStyle = "#101219"; g.beginPath(); g.arc(128, 128, 4, 0, TAU); g.fill();
  return c;
}
// The ship's hull: white, a red racing stripe along the spine, panel lines. Lathe wrap, u = 0 on top.
function hullCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 256, 0);
  bg.addColorStop(0, "#f6f4ec"); bg.addColorStop(0.5, "#c9c5b8"); bg.addColorStop(1, "#f6f4ec");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#ff4b3e"; g.fillRect(0, 0, 18, 256); g.fillRect(238, 0, 18, 256);
  g.fillStyle = "#ffd23f"; g.fillRect(18, 0, 4, 256); g.fillRect(234, 0, 4, 256);
  g.fillStyle = "rgba(60,60,80,.35)"; for (let y = 40; y < 256; y += 52) g.fillRect(0, y, 256, 1.5);
  g.fillStyle = "#2a3150"; g.fillRect(118, 0, 20, 256);                               // the belly
  return c;
}
// The wings, seen from above. Canvas bottom is the nose, so the lettering is drawn mirrored top to bottom and
// reads the right way round from the chase camera behind the ship.
function wingCanvas(script) {
  const c = mkCanvas(1024, 640), g = c.getContext("2d");
  const X = function (x) { return (x + 13) / 26 * 1024; }, Y = function (y) { return 640 - (y + 6) / 16 * 640; };
  g.fillStyle = "#ff4b3e"; g.fillRect(0, 0, 1024, 640);
  g.lineJoin = "round";
  g.strokeStyle = "#f6f4ec"; g.lineWidth = 30; g.beginPath(); g.moveTo(X(-9.6), Y(5.9)); g.lineTo(X(0), Y(-5.6)); g.lineTo(X(9.6), Y(5.9)); g.stroke();
  g.strokeStyle = "#ffd23f"; g.lineWidth = 7; g.beginPath(); g.moveTo(X(-9.6), Y(7.2)); g.lineTo(X(0), Y(-4.0)); g.lineTo(X(9.6), Y(7.2)); g.stroke();
  g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, Y(10), 1024, Y(7.8) - Y(10));
  g.save(); g.translate(X(5.9), Y(5.5)); g.scale(1, -1); drawScript(g, script, 0, 0, 196, 96); g.restore();
  g.save(); g.translate(X(-5.9), Y(5.5)); g.scale(1, -1); candyText(g, "BARGAIN", 0, -24, 46, 196); candyText(g, "HUNTER", 0, 24, 46, 196); g.restore();
  return c;
}
// A soft round shadow.
function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(4,4,16,.85)"); gr.addColorStop(0.55, "rgba(4,4,16,.42)"); gr.addColorStop(1, "rgba(4,4,16,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
// The ship's shadow, shaped like the ship.
function shipShadowCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.filter = "blur(3px)";
  g.fillStyle = "rgba(4,4,16,.8)";
  g.beginPath(); g.moveTo(64, 6); g.lineTo(122, 108); g.lineTo(64, 92); g.lineTo(6, 108); g.closePath(); g.fill();
  g.filter = "none";
  return c;
}
function glowCanvas(col) {
  const c = mkCanvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, col); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function dashCanvas() {
  const c = mkCanvas(8, 32), g = c.getContext("2d");
  g.fillStyle = "rgba(255,210,63,0)"; g.fillRect(0, 0, 8, 32);
  g.fillStyle = "rgba(255,210,63,.75)"; g.fillRect(0, 0, 8, 14);
  return c;
}
// A vendor booth's awning: candy stripes and a scalloped hem.
function awningCanvas() {
  const c = mkCanvas(512, 128), g = c.getContext("2d");
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? "#ffffff" : "#ff4b3e"; g.fillRect(i * 32, 0, 32, 100); }
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? "#ffffff" : "#ff4b3e"; g.beginPath(); g.arc(i * 32 + 16, 100, 16, 0, Math.PI); g.fill(); }
  g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(0, 0, 512, 10);
  return c;
}
// A tiny painted sky for the glossy highlights on the ship, the tanks and the Haggletron.
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.18, "#d6c9ff"); gr.addColorStop(0.35, "#5a3fc0");
    gr.addColorStop(0.5, "#1a1050"); gr.addColorStop(0.52, "#3b4160"); gr.addColorStop(1, "#262a40");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#2a1466"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(10, 8, 12, 48); tg.fillRect(42, 8, 12, 48);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#3b4160"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* ---------------- LED ribbon board ----------------
   A real dot matrix: everything on it is painted into a small canvas, one pixel per LED, and a small shader turns
   each pixel into a glowing dot. One board texture runs across the top of every gate and across the Haggletron's
   stall. It scrolls its programme right to left, and cuts to big animated messages when the game calls for one. */
const LED_H = 20, LED_ROWS = 26, LED_W = 140, LED_COLS = Math.round(LED_W / (LED_H / LED_ROWS));
const LED_SAFE = LED_COLS - 14;                           // widest message that still has a margin
const LED_SPEED = 44;                                     // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));   // the largest text size that fits (5 x 7 font, in LEDs per font pixel)
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
// Short messages between the plugs. The wordmark leads each group.
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["SHOOT THE TANKS. KEEP FLYING.", "lime"], ["NO REFUNDS. ALL SALES FINAL.", "pink"], ["NO QUARTERS REQUIRED", "cyan"]];
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
    "*": "00000 00100 01110 11111 01110 00100 00000", "$": "00100 01111 10100 01110 00101 11110 00100"
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
  // The wordmark at board resolution: the cream lettering is pushed to full LED brightness, the red edge is kept
  // as a dimmer rim and the navy outline falls back to dark, so the script reads as light on black.
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
  function line(str, color) {
    let sx = big;
    while (sx > 1 && ledTextW(str, sx) > LED_COLS * 1.6) sx--;
    items.push({ w: ledTextW(str, sx), draw: function (g, x) { ledText(g, str, x, Math.floor((HH - 7 * sx) / 2), sx, sx, color); } });
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

// kind: "flash" (strobe and chevrons), "slide", "cycle", "blink" or "count" (label and a number that counts up)
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
  ledPlay([ledMsg("count", "FINAL", 7, { from: 0, value: score, final: true, wait: 0.5 })], true);
}

function ledDrawMsg(g, m) {
  const WW = LED_COLS, HH = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(WW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.amber;
  function fit(str) { let sx = big; while (sx > 1 && ledTextW(str, sx) > LED_SAFE) sx--; return sx; }
  function chase(color, dir) {                              // running lights along the top and bottom edges
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < WW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(WW - x - 3, HH - 1, 3, 1); }
  }
  if (m.kind === "count") {                                 // counts up to the new number
    const k = calm ? 1 : Math.min(1, t / 0.8), v = Math.round(m.from + (m.value - m.from) * k);
    const label = m.text ? m.text + " " : "", sxc = fit(label + m.value), y = Math.floor((HH - 7 * sxc) / 2);
    const x = Math.round((WW - ledTextW(label + m.value, sxc)) / 2);
    const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
    const xn = ledText(g, label, x, y, sxc, sxc, LED_C.amber);
    ledText(g, String(v), xn, y, sxc, sxc, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
    if (!calm && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(WW * m.t / 0.3), 0, WW, HH); }   // wipe in
    chase(LED_C.amber, 1);
    return;
  }
  const sx = fit(m.text), w = ledTextW(m.text, sx), x0 = Math.round((WW - w) / 2), yT = Math.floor((HH - 7 * sx) / 2);
  if (m.kind === "flash") {
    if (!calm && t < 0.6 && Math.floor(t * 12) % 2 === 0) {                        // strobe: the whole board flips
      g.fillStyle = LED_C.yellow; g.fillRect(0, 0, WW, HH);
      ledText(g, m.text, x0, yT, sx, sx, "#000000");
      return;
    }
    const span = 6 * sx + 5, ph = calm ? 0 : Math.floor((t * 46) % span);
    for (let k = 0; k < 12; k++) {                          // chevrons racing outward on both sides
      const off = Math.round(w / 2) + 9 + k * span + ph;
      if (off > mid + span) break;
      const cc = k % 2 ? LED_C.red : LED_C.orange;
      ledText(g, ">", mid + off, yT, sx, sx, cc);
      ledText(g, "<", mid - off - 5 * sx, yT, sx, sx, cc);
    }
    const cyc = [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0, yT, sx, sx, calm ? LED_C.yellow : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 14; i++) g.fillRect((vrand() * WW) | 0, (vrand() * HH) | 0, 1, 1); }
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "slide") {                                 // slides in from the right, then a white glint sweeps across it
    const k = calm ? 1 : Math.min(1, t / 0.45), e = 1 - Math.pow(1 - k, 3);
    const x = Math.round(x0 + (1 - e) * WW);
    ledText(g, m.text, x, yT, sx, sx, col);
    if (!calm && k >= 1) {
      const bx = Math.floor(((t - 0.45) * 150) % (WW + 80)) - 40;
      g.save(); g.beginPath(); g.rect(bx, 0, 12, HH); g.clip();
      ledText(g, m.text, x, yT, sx, sx, "#ffffff");
      g.restore();
    }
    chase(col, -1);
    return;
  }
  if (m.kind === "cycle") {                                 // every letter takes its turn through the colors
    const cyc = [LED_C.yellow, LED_C.pink, LED_C.cyan, LED_C.lime, LED_C.orange];
    let x = x0;
    for (let i = 0; i < m.text.length; i++) x = ledText(g, m.text[i], x, yT, sx, sx, cyc[(i + (calm ? 0 : Math.floor(t * 9))) % cyc.length]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 10; i++) g.fillRect((vrand() * WW) | 0, (vrand() * HH) | 0, 1, 1); }
    chase(LED_C.yellow, 1);
    return;
  }
  // blink: a few flashes, then it holds over a solid bar
  if (calm || t > 1.1 || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, yT, sx, sx, col);
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

/* ---------------- Geometry helpers ---------------- */

// A box with every edge and corner rounded. Each face keeps its own material slot (+x -x +y -y +z -z),
// and its texture is stretched corner to corner.
function roundBox(T, w, h, d, r, segs) {
  const s = segs || 4, per = (s + 1) * (s + 1), half = 0.5 / s;
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

// Give the +z face of a box world-anchored UVs (so neighboring boxes of a wall line up), in tiles of tw x th.
function frontUV(geo, x0, y0, tw, th) {
  const pos = geo.attributes.position, uv = geo.attributes.uv, nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    if (nor.getZ(i) > 0.9) uv.setXY(i, (pos.getX(i) + x0) / tw, (pos.getY(i) + y0) / th);
  }
  uv.needsUpdate = true;
  return geo;
}

/* ---------------- Characters: sculpted, jointed figures ----------------
   Every character (the pilot, the vendors, the Haggletron) is built from rounded pieces: lathed torsos with a
   waist, a chest and shoulders, tapered limbs that bulge where the muscle is, hands with fingers and a thumb,
   shoes, necks, and faces with a hinged jaw, a nose, brows, eyelids and eyes. The pieces that move together are
   merged into one mesh per bone, all sharing one material per character: vertex colors for skin, hair and plastic,
   and a painted canvas (the "atlas") for the clothes, with folds, seams and readable logos. Joints are plain
   groups, so a pose is just a handful of rotations; elbows and knees always keep a bend. Figures face +z. */

const ATLAS = 512;
const REG = {                                              // atlas regions in canvas pixels: x0, y0, x1, y1
  torso: [0, 0, 512, 176], apron: [0, 176, 176, 512], sleeve: [176, 176, 512, 344], pants: [176, 344, 480, 512]
};
const WHITE_UV = [(ATLAS - 10) / ATLAS, 10 / ATLAS];        // a white corner the plain-colored parts sample

let FG = null;                                            // shared unit shapes, built once
function figShapes(T) {
  if (FG) return FG;
  FG = {
    sph: new T.SphereGeometry(1, 20, 14),
    sphLo: new T.SphereGeometry(1, 10, 8),
    lid: new T.SphereGeometry(1, 16, 6, 0, TAU, 0, 1.15),
    cyl: new T.CylinderGeometry(1, 1, 1, 16, 1),
    ring: new T.TorusGeometry(1, 0.12, 8, 28).rotateX(Math.PI / 2),
    back: new T.SphereGeometry(1, 18, 10, Math.PI * 1.05, Math.PI * 0.9, 0.3, 1.55)    // the back of a head, for hair
  };
  return FG;
}
function MX(T, x, y, z, rx, ry, rz, sx, sy, sz) {
  const s = sx == null ? 1 : sx;
  return new T.Matrix4().compose(new T.Vector3(x || 0, y || 0, z || 0),
    new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0)),
    new T.Vector3(s, sy == null ? s : sy, sz == null ? s : sz));
}
// A limb: a rounded taper from radius r1 at the joint (y = 0) down to r2 at y = -len, with a muscle bulge.
function taper(T, r1, r2, len, bulge, segs) {
  const pts = [], n = 6, b = 1 + (bulge || 0);
  for (let i = 0; i <= n; i++) { const a = Math.PI / 2 * i / n; pts.push(new T.Vector2(r2 * Math.sin(a), -len - r2 * Math.cos(a))); }
  pts.push(new T.Vector2((r2 + (r1 - r2) * 0.45) * b, -len * 0.62));
  pts.push(new T.Vector2((r1 + (r2 - r1) * 0.2) * b, -len * 0.28));
  for (let i = 0; i <= n; i++) { const a = Math.PI / 2 * i / n; pts.push(new T.Vector2(r1 * Math.cos(a), r1 * Math.sin(a))); }
  return new T.LatheGeometry(pts, segs || 14);
}
function lathe(T, prof, segs) { return new T.LatheGeometry(prof.map(function (p) { return new T.Vector2(p[0], p[1]); }), segs || 24); }

// Merge pieces into one geometry. Each piece: { g: geometry, m: Matrix4, c: color, r: atlas region or null }.
function mergeParts(T, parts) {
  let n = 0, ni = 0;
  parts.forEach(function (p) { n += p.g.attributes.position.count; ni += p.g.index ? p.g.index.count : p.g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const idx = n > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const v = new T.Vector3(), nm = new T.Matrix3(), c = new T.Color();
  let o = 0, io = 0;
  parts.forEach(function (p) {
    const g = p.g, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, m = p.m;
    nm.getNormalMatrix(m); c.set(p.c);
    const r = p.r;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m); pos.set([v.x, v.y, v.z], (o + i) * 3);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (o + i) * 3);
      col.set([c.r, c.g, c.b], (o + i) * 3);
      if (r && U) {
        const u0 = r[0] / ATLAS, u1 = r[2] / ATLAS, v0 = 1 - r[3] / ATLAS, v1 = 1 - r[1] / ATLAS;
        uv[(o + i) * 2] = u0 + clamp(U.getX(i), 0, 1) * (u1 - u0); uv[(o + i) * 2 + 1] = v0 + clamp(U.getY(i), 0, 1) * (v1 - v0);
      } else { uv[(o + i) * 2] = WHITE_UV[0]; uv[(o + i) * 2 + 1] = WHITE_UV[1]; }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + o;
    else for (let i = 0; i < P.count; i++) idx[io++] = i + o;
    o += P.count;
  });
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new T.BufferAttribute(nor, 3));
  geo.setAttribute("color", new T.BufferAttribute(col, 3));
  geo.setAttribute("uv", new T.BufferAttribute(uv, 2));
  geo.setIndex(new T.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

// Collects pieces per bone, then turns each bone's pile into one mesh.
function rig(T, mat) {
  const piles = new Map();
  return {
    add: function (bone, g, m, c, r) { if (!piles.has(bone)) piles.set(bone, []); piles.get(bone).push({ g: g, m: m, c: c, r: r || null }); },
    build: function () {
      piles.forEach(function (parts, bone) { const mesh = new T.Mesh(mergeParts(T, parts), bone.userData.mat || mat); bone.add(mesh); bone.userData.mesh = mesh; });
    }
  };
}

// A hand on the wrist joint: fingers hang down (-y), the thumb points forward (+z), the palm faces "inward"
// (inward = -1 for a hand on the figure's left side, which is +x). k scales it; mitt gives three thick fingers.
function addHand(T, rg, bone, k, inward, colr, mitt) {
  const F = figShapes(T);
  rg.add(bone, F.sphLo, MX(T, 0, -0.62 * k, 0.02 * k, 0, 0, 0, 0.24 * k * (mitt ? 1.25 : 1), 0.62 * k, 0.5 * k * (mitt ? 1.15 : 1)), colr);
  rg.add(bone, F.sphLo, MX(T, 0, -1.05 * k, 0, 0, 0, 0, 0.27 * k * (mitt ? 1.2 : 1), 0.22 * k, 0.52 * k * (mitt ? 1.12 : 1)), colr);
  const fz = mitt ? [0.34, 0, -0.34] : [0.34, 0.12, -0.1, -0.31], fl = mitt ? [0.62, 0.66, 0.56] : [0.56, 0.62, 0.58, 0.46];
  const fr = mitt ? 0.19 : 0.12;
  for (let i = 0; i < fz.length; i++) {
    const l1 = fl[i] * k, l2 = fl[i] * 0.78 * k;
    const m1 = MX(T, 0, -1.12 * k, fz[i] * k, 0, 0, 0.42 * inward);
    rg.add(bone, taper(T, fr * k, fr * 0.88 * k, l1, 0, 8), m1, colr);
    const m2 = m1.clone().multiply(MX(T, 0, -l1, 0, 0, 0, 0.75 * inward));
    rg.add(bone, taper(T, fr * 0.88 * k, fr * 0.78 * k, l2, 0, 8), m2, colr);
  }
  const t1 = MX(T, inward * 0.1 * k, -0.42 * k, 0.4 * k, -0.75, 0, 0.35 * inward);
  rg.add(bone, taper(T, 0.16 * k * (mitt ? 1.3 : 1), 0.13 * k * (mitt ? 1.3 : 1), 0.5 * k, 0, 8), t1, colr);
  const t2 = t1.clone().multiply(MX(T, 0, -0.5 * k, 0, -0.35, 0, 0.5 * inward));
  rg.add(bone, taper(T, 0.13 * k * (mitt ? 1.3 : 1), 0.11 * k * (mitt ? 1.3 : 1), 0.4 * k, 0, 8), t2, colr);
}

/* A person. spec: skin, lip, eye, hair, brow, shirt atlas canvas, shoe colors, hat, sleeve ("long" / "short"),
   apron, legs (false for the seated pilot), mustache, build { sh: shoulder width, belly }. ~21 units tall. */
function makePerson(T, spec, atlasTex) {
  const F = figShapes(T);
  const mat = new T.MeshPhongMaterial({ map: atlasTex, vertexColors: true, specular: 0x2a2a2a, shininess: 26 });
  const rg = rig(T, mat);
  const sh = spec.build && spec.build.sh || 1, belly = spec.build && spec.build.belly || 1;
  const J = { root: new T.Group(), pelvis: new T.Group(), spine: new T.Group(), head: new T.Group(), jaw: new T.Group(), brows: new T.Group(),
              sh: [new T.Group(), new T.Group()], el: [new T.Group(), new T.Group()], wr: [new T.Group(), new T.Group()],
              hip: [new T.Group(), new T.Group()], kn: [new T.Group(), new T.Group()], an: [new T.Group(), new T.Group()] };
  J.root.add(J.pelvis); J.pelvis.position.y = PERSON_HIP;
  J.pelvis.add(J.spine); J.spine.position.y = 0.3;
  J.spine.add(J.head); J.head.position.y = 5.2;
  J.head.add(J.jaw); J.jaw.position.set(0, 1.92, 0.1);
  J.head.add(J.brows); J.brows.position.set(0, 2.86, 1.2);
  J.head.scale.setScalar(spec.headScale || 1.14);           // cartoon proportions: a slightly big head reads from far off
  const skin = spec.skin, cloth = "#ffffff";

  // pelvis, belt
  rg.add(J.pelvis, F.sph, MX(T, 0, -0.1, 0, 0, 0, 0, 2.02 * sh * Math.max(1, belly * 0.95), 1.3, 1.36 * belly), cloth, REG.pants);
  rg.add(J.pelvis, F.ring, MX(T, 0, 0.42, 0, 0, 0, 0, 1.8 * sh * Math.max(1, belly * 0.95), 1.4, 1.32 * belly), spec.belt || "#3a2414");
  rg.add(J.pelvis, roundBox(T, 0.6, 0.42, 0.2, 0.08), MX(T, 0, 0.42, 1.34 * belly), "#ffd23f");
  // torso: a lathe with a waist, a chest and shoulders, flattened front to back
  const tp = [[0, -0.6], [1.55, -0.5], [1.75, 0], [1.66 * belly, 0.8], [1.85 * belly, 1.8], [2.12, 2.9], [2.3, 3.8], [2.25, 4.5], [1.95, 4.95], [1.35, 5.25], [0.72, 5.45], [0, 5.52]];
  rg.add(J.spine, lathe(T, tp, 28), MX(T, 0, 0, 0, 0, 0, 0, sh, 1, 0.66 * Math.max(1, belly * 0.9)), cloth, REG.torso);
  rg.add(J.spine, F.sph, MX(T, 2.2 * sh, 4.55, 0, 0, 0, 0, 0.84, 0.8, 0.78), cloth, REG.sleeve);    // deltoids
  rg.add(J.spine, F.sph, MX(T, -2.2 * sh, 4.55, 0, 0, 0, 0, 0.84, 0.8, 0.78), cloth, REG.sleeve);
  rg.add(J.spine, F.ring, MX(T, 0, 5.18, 0, 0, 0, 0, 0.82, 1.6, 0.72), spec.collar || "#eceae2");   // collar
  if (spec.apron) {                                       // an apron wrapped round the front, down to mid-thigh
    const ap = new T.CylinderGeometry(2.2, 2.45, 8.4, 20, 1, true, -1.05, 2.1);
    rg.add(J.spine, ap, MX(T, 0, -0.2, 0, 0, 0, 0, sh * 1.02, 1, 0.7 * Math.max(1, belly * 0.95)), cloth, REG.apron);
    rg.add(J.spine, F.ring, MX(T, 0, 0.65, 0, 0, 0, 0, 1.78 * sh, 0.9, 1.26 * belly), spec.apronTie || "#eceae2");
  }
  // head: neck, skull, cheeks, nose, eyes with lids, ears, mouth; the jaw and the brows move on their own
  const H = J.head;
  rg.add(H, F.cyl, MX(T, 0, 0.7, 0, 0, 0, 0, 0.6, 1.5, 0.6), skin);
  rg.add(H, F.sph, MX(T, 0, 2.28, 0.02, 0, 0, 0, 1.3, 1.52, 1.42), skin);
  rg.add(H, F.sph, MX(T, 0.7, 1.86, 0.8, 0, 0, 0, 0.56, 0.52, 0.52), skin);
  rg.add(H, F.sph, MX(T, -0.7, 1.86, 0.8, 0, 0, 0, 0.56, 0.52, 0.52), skin);
  const ns = spec.nose || 1;
  rg.add(H, F.sph, MX(T, 0, 2.02, 1.38, -0.2, 0, 0, 0.25 * ns, 0.38 * ns, 0.3 * ns), skin);
  rg.add(H, F.sph, MX(T, 0, 1.86, 1.58 + 0.05 * (ns - 1), 0, 0, 0, 0.19 * ns, 0.17 * ns, 0.17 * ns), skin);
  rg.add(H, F.sphLo, MX(T, 0.12 * ns, 1.78, 1.56, 0, 0, 0, 0.07, 0.05, 0.06), "#5a2a1a");
  rg.add(H, F.sphLo, MX(T, -0.12 * ns, 1.78, 1.56, 0, 0, 0, 0.07, 0.05, 0.06), "#5a2a1a");
  [1, -1].forEach(function (s) {
    rg.add(H, F.sph, MX(T, s * 0.5, 2.38, 1.13, 0, 0, 0, 0.3, 0.3, 0.3), "#fbfaf4");
    rg.add(H, F.sphLo, MX(T, s * 0.5, 2.38, 1.36, 0, 0, 0, 0.17, 0.18, 0.1), spec.eye || "#3a6a2a");
    rg.add(H, F.sphLo, MX(T, s * 0.5, 2.38, 1.44, 0, 0, 0, 0.085, 0.09, 0.05), "#0b0b10");
    rg.add(H, F.sphLo, MX(T, s * 0.45, 2.46, 1.47, 0, 0, 0, 0.035, 0.035, 0.03), "#ffffff");
    rg.add(H, F.lid, MX(T, s * 0.5, 2.38, 1.13, spec.lid == null ? 0.55 : spec.lid, 0, 0, 0.335, 0.335, 0.335), spec.lidCol || skin);
    rg.add(H, F.sphLo, MX(T, s * 1.28, 2.24, -0.02, 0, 0, s * 0.1, 0.2, 0.42, 0.3), skin);          // ears
  });
  rg.add(H, F.sphLo, MX(T, 0, 1.47, 1.12, 0, 0, 0, 0.42, 0.15, 0.24), "#4a1414");                    // inside of the mouth
  rg.add(H, F.sphLo, MX(T, 0, 1.53, 1.26, 0, 0, 0, 0.3, 0.06, 0.08), "#f4f2ea");                     // top teeth
  rg.add(H, F.sphLo, MX(T, 0, 1.6, 1.3, 0, 0, 0, 0.4, 0.1, 0.13), spec.lip || "#b55a4a");             // upper lip
  if (spec.mustache) {
    rg.add(H, F.sphLo, MX(T, 0.22, 1.72, 1.4, 0, 0, -0.3, 0.36, 0.13, 0.16), spec.hair);
    rg.add(H, F.sphLo, MX(T, -0.22, 1.72, 1.4, 0, 0, 0.3, 0.36, 0.13, 0.16), spec.hair);
  }
  // hair or a hat
  if (spec.hat === "cap" || spec.hat === "helmet") {
    rg.add(H, new T.SphereGeometry(1, 22, 10, 0, TAU, 0, 1.45), MX(T, 0, 2.5, -0.05, -0.12, 0, 0, 1.42, 1.42, 1.5), spec.hatCol);
    rg.add(H, F.sph, MX(T, 0, 3.0, 1.35, 0.22, 0, 0, 1.0, 0.09, 0.72), spec.hatCol2 || spec.hatCol);
    rg.add(H, F.sphLo, MX(T, 0, 3.88, -0.1, 0, 0, 0, 0.16, 0.12, 0.16), spec.hatCol2 || spec.hatCol);
    rg.add(H, FG.back, MX(T, 0, 2.26, 0.02, 0, 0, 0, 1.37, 1.57, 1.48), spec.hair);                // hair under the cap, round the back of the head
    if (spec.hat === "helmet") {                            // flying goggles pushed up on the cap
      rg.add(H, F.ring, MX(T, 0, 3.02, 0.02, -0.12, 0, 0, 1.44, 1.4, 1.5), "#3a2414");
      [1, -1].forEach(function (s) {
        rg.add(H, F.cyl, MX(T, s * 0.52, 3.12, 1.32, Math.PI / 2 - 0.3, 0, 0, 0.38, 0.22, 0.38), "#c9a24a");
        rg.add(H, F.sph, MX(T, s * 0.52, 3.16, 1.46, -0.3, 0, 0, 0.32, 0.32, 0.12), "#4fd8ff");
      });
    }
  } else if (spec.hat === "bucket") {
    rg.add(H, lathe(T, [[0, 0], [2.3, 0], [2.3, 0.14], [1.48, 0.3], [1.38, 1.3], [1.0, 1.55], [0, 1.6]], 22), MX(T, 0, 2.75, -0.05, -0.1), spec.hatCol);
    rg.add(H, F.ring, MX(T, 0, 3.15, -0.05, -0.1, 0, 0, 1.44, 1.2, 1.44), spec.hatCol2 || "#101219");
    rg.add(H, FG.back, MX(T, 0, 2.26, 0.02, 0, 0, 0, 1.37, 1.57, 1.48), spec.hair);
  } else {
    rg.add(H, new T.SphereGeometry(1, 22, 10, 0, TAU, 0, 1.25), MX(T, 0, 2.35, -0.12, -0.4, 0, 0, 1.4, 1.5, 1.5), spec.hair);
  }
  // jaw: the chin and the lower lip, on a hinge below the ears
  rg.add(J.jaw, F.sph, MX(T, 0, -0.32, 0.32, 0, 0, 0, 1.08, 0.66, 1.02), skin);
  rg.add(J.jaw, F.sph, MX(T, 0, -0.62, 0.98, 0, 0, 0, 0.5, 0.36, 0.42), skin);
  rg.add(J.jaw, F.sphLo, MX(T, 0, -0.38, 1.22, 0, 0, 0, 0.36, 0.1, 0.13), spec.lip || "#b55a4a");
  if (spec.beard) rg.add(J.jaw, F.sph, MX(T, 0, -0.62, 0.9, 0, 0, 0, 0.62, 0.45, 0.5), spec.hair);
  // brows
  const bt = spec.browTilt == null ? -0.12 : spec.browTilt;
  rg.add(J.brows, F.sphLo, MX(T, 0.5, 0, 0.04, 0, 0.2, bt, 0.4, 0.1, 0.13), spec.brow || spec.hair);
  rg.add(J.brows, F.sphLo, MX(T, -0.5, 0, 0.04, 0, -0.2, -bt, 0.4, 0.1, 0.13), spec.brow || spec.hair);

  // arms: 0 = the figure's left (+x), 1 = its right (-x)
  for (let s = 0; s < 2; s++) {
    const sg = s ? -1 : 1;
    J.spine.add(J.sh[s]); J.sh[s].position.set(sg * 2.28 * sh, 4.5, 0);
    J.sh[s].add(J.el[s]); J.el[s].position.y = -3.5;
    J.el[s].add(J.wr[s]); J.wr[s].position.y = -3.15;
    if (spec.sleeve === "short") {
      rg.add(J.sh[s], taper(T, 0.84, 0.74, 1.9, 0.04), MX(T, 0, 0, 0), cloth, REG.sleeve);
      rg.add(J.sh[s], taper(T, 0.72, 0.56, 3.5, 0.1), MX(T, 0, 0, 0), skin);
      rg.add(J.el[s], taper(T, 0.58, 0.42, 3.15, 0.12), MX(T, 0, 0, 0), skin);
    } else {
      rg.add(J.sh[s], taper(T, 0.78, 0.62, 3.5, 0.08), MX(T, 0, 0, 0), cloth, REG.sleeve);
      rg.add(J.el[s], taper(T, 0.62, 0.48, 3.15, 0.08), MX(T, 0, 0, 0), cloth, REG.sleeve);
      rg.add(J.el[s], F.ring, MX(T, 0, -2.9, 0, 0, 0, 0, 0.46, 1.4, 0.46), spec.cuff || "#eceae2");
    }
    addHand(T, rg, J.wr[s], 1.14, -sg, spec.glove || skin, false);
  }
  // legs
  if (spec.legs !== false) {
    for (let s = 0; s < 2; s++) {
      const sg = s ? -1 : 1;
      J.pelvis.add(J.hip[s]); J.hip[s].position.set(sg * 1.2 * sh, -0.25, 0);
      J.hip[s].add(J.kn[s]); J.kn[s].position.y = -5.1;
      J.kn[s].add(J.an[s]); J.an[s].position.y = -4.9;
      rg.add(J.hip[s], taper(T, 1.2, 0.86, 5.1, 0.08), MX(T, 0, 0, 0), cloth, REG.pants);
      rg.add(J.kn[s], taper(T, 0.87, 0.6, 4.9, 0.12), MX(T, 0, 0, 0), cloth, REG.pants);
      rg.add(J.kn[s], F.cyl, MX(T, 0, -4.72, 0, 0, 0, 0, 0.68, 0.5, 0.7), spec.hem || cloth, spec.hem ? null : REG.pants);
      J.an[s].scale.setScalar(1.12);
      const A = J.an[s], sc = spec.shoe || "#ffffff", so = spec.sole || "#2a2c36";
      rg.add(A, F.cyl, MX(T, 0, -0.1, 0, 0, 0, 0, 0.55, 0.5, 0.58), spec.sock || "#eceae2");
      rg.add(A, F.sph, MX(T, 0, -0.62, -0.18, 0, 0, 0, 0.56, 0.58, 0.64), sc);
      rg.add(A, F.sph, MX(T, 0, -0.8, 1.0, 0, 0, 0, 0.6, 0.45, 1.02), sc);
      rg.add(A, F.sph, MX(T, 0, -0.36, 0.56, 0.35, 0, 0, 0.42, 0.32, 0.64), spec.lace || "#eceae2");
      rg.add(A, F.sphLo, MX(T, sg * 0.5, -0.72, 0.45, 0, 0, 0, 0.12, 0.26, 0.8), spec.shoeStripe || "#ff4b3e");
      rg.add(A, roundBox(T, 1.3, 0.34, 3.0, 0.15), MX(T, 0, -1.07, 0.42), so);
    }
  }
  rg.build();
  J.mat = mat;
  return J;
}

// Bend the knees by a (left) and b (right), keeping the feet flat; returns how far the hips drop (legs of length len).
function crouch(J, a, b, len) {
  J.hip[0].rotation.x = -a; J.kn[0].rotation.x = 2 * a; J.an[0].rotation.x = -a;
  J.hip[1].rotation.x = -b; J.kn[1].rotation.x = 2 * b; J.an[1].rotation.x = -b;
  return len * (1 - Math.cos(Math.max(a, b)));
}
const PERSON_HIP = 11.64, PERSON_LEG = 10, BOSS_HIP = 40.3, BOSS_LEG = 29;
// One arm: shoulder pitch (forward +), shoulder roll (out +), elbow bend (always some), wrist turn.
function arm(J, s, fwd, out, elbow, twist, wrist) {
  const sg = s ? -1 : 1;
  J.sh[s].rotation.set(-fwd, twist || 0, sg * out, "YXZ");
  J.el[s].rotation.set(-Math.max(0.15, elbow), 0, 0);
  J.wr[s].rotation.set(0, wrist || 0, 0);
}

/* ---------------- The clothes, painted ---------------- */
// Fold shading: soft darker strokes and a light edge beside each, the way cloth creases.
function folds(g, x0, y0, w, h, n, rnd, dir) {
  g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * w, y = y0 + rnd() * h, l = 18 + rnd() * 40, a = (dir || 0) + (rnd() - 0.5) * 0.9;
    const dx = Math.cos(a) * l, dy = Math.sin(a) * l;
    g.lineCap = "round";
    g.strokeStyle = "rgba(0,0,0,.16)"; g.lineWidth = 4 + rnd() * 4;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + dx * 0.5 + 6, y + dy * 0.5 - 4, x + dx, y + dy); g.stroke();
    g.strokeStyle = "rgba(255,255,255,.1)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x + 4, y + 3); g.quadraticCurveTo(x + dx * 0.5 + 10, y + dy * 0.5, x + dx + 4, y + dy + 3); g.stroke();
  }
  g.restore();
}
function shadeBand(g, r, top, bottom) {
  const gr = g.createLinearGradient(0, r[1], 0, r[3]);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
}
function denim(g, r, col, rnd) {
  g.fillStyle = col; g.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
  for (let i = 0; i < 1600; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.07)" : "rgba(0,0,30,.1)"; g.fillRect(r[0] + rnd() * (r[2] - r[0]), r[1] + rnd() * (r[3] - r[1]), 2, 1); }
}
// o: { shirt, shirt2 (stripes), front (fn: draws the chest logo at x), back (fn), sleeve, pants, pantsDenim, apron, apronDraw }
function paintAtlas(o, seed) {
  const c = mkCanvas(ATLAS, ATLAS), g = c.getContext("2d"), rnd = vrng(seed);
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, ATLAS, ATLAS);
  const T = REG.torso, A = REG.apron, Sl = REG.sleeve, P = REG.pants;
  // torso wrap: u = 0 (and 1) is the chest, u = .5 the back; the top edge is the collar, the bottom the waist
  g.fillStyle = o.shirt; g.fillRect(T[0], T[1], T[2] - T[0], T[3] - T[1]);
  if (o.shirt2) { g.fillStyle = o.shirt2; for (let y = T[1] + 8; y < T[3]; y += 22) g.fillRect(T[0], y, T[2] - T[0], 8); }
  if (o.vest) {                                              // a vest: its own color everywhere but a band down the chest
    g.fillStyle = o.vest; g.fillRect(T[0] + 40, T[1], T[2] - 80, T[3] - T[1]);
    g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(T[0] + 38, T[1], 4, T[3] - T[1]); g.fillRect(T[2] - 42, T[1], 4, T[3] - T[1]);
    g.fillStyle = "#e8d8a8"; for (let y = T[1] + 10; y < T[3]; y += 10) { g.fillRect(T[0] + 46, y, 2, 5); g.fillRect(T[2] - 48, y, 2, 5); }   // stitching
  }
  folds(g, T[0], T[1] + 30, T[2] - T[0], T[3] - T[1] - 30, 26, rnd, 1.1);
  g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(T[0], T[3] - 10, T[2] - T[0], 10);             // the hem
  g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(T[0] + 126, T[1], 3, T[3] - T[1]); g.fillRect(T[0] + 382, T[1], 3, T[3] - T[1]);   // side seams
  if (o.front) { o.front(g, 0, 86); o.front(g, 512, 86); }
  if (o.back) o.back(g, 256, 84);
  // sleeves: creases ring the arm near the elbow
  g.fillStyle = o.sleeve || o.shirt; g.fillRect(Sl[0], Sl[1], Sl[2] - Sl[0], Sl[3] - Sl[1]);
  if (o.shirt2 && !o.sleeve) { g.fillStyle = o.shirt2; for (let y = Sl[1] + 8; y < Sl[3]; y += 22) g.fillRect(Sl[0], y, Sl[2] - Sl[0], 8); }
  folds(g, Sl[0], Sl[1], Sl[2] - Sl[0], Sl[3] - Sl[1], 22, rnd, 0.15);
  g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(Sl[0], Sl[1] + 4, Sl[2] - Sl[0], 3);
  // pants
  if (o.pantsDenim) denim(g, P, o.pants, rnd); else { g.fillStyle = o.pants; g.fillRect(P[0], P[1], P[2] - P[0], P[3] - P[1]); }
  folds(g, P[0], P[1], P[2] - P[0], P[3] - P[1], 24, rnd, 0.3);
  g.fillStyle = o.seam || "rgba(255,200,90,.6)"; for (let y = P[1]; y < P[3]; y += 9) g.fillRect(P[0] + 74, y, 2, 5);
  // apron
  if (o.apron) {
    g.fillStyle = o.apron; g.fillRect(A[0], A[1], A[2] - A[0], A[3] - A[1]);
    folds(g, A[0], A[1], A[2] - A[0], A[3] - A[1], 12, rnd, Math.PI / 2);
    g.strokeStyle = "rgba(255,255,255,.55)"; g.setLineDash([6, 5]); g.lineWidth = 2.5; g.strokeRect(A[0] + 7, A[1] + 7, A[2] - A[0] - 14, A[3] - A[1] - 14); g.setLineDash([]);
    if (o.apronDraw) o.apronDraw(g, A);
  }
  g.fillStyle = "#ffffff"; g.fillRect(ATLAS - 24, ATLAS - 24, 24, 24);
  return c;
}
// A patch: a rounded badge with the wordmark (or lettering) on it, centered at x, y.
function patch(g, script, x, y, w, h, bg, rim, text) {
  rrectPath(g, x - w / 2, y - h / 2, w, h, Math.min(w, h) * 0.3); g.fillStyle = bg; g.fill();
  g.lineWidth = 3; g.strokeStyle = rim; g.stroke();
  if (text) candyText(g, text, x, y + 1, h * 0.5, w * 0.86);
  else drawScript(g, script, x, y, w * 0.88, h * 0.82);
}

/* ---------------- The cast ---------------- */
function pilotSpec(script) {
  return {
    spec: { skin: "#f0c49b", lip: "#c0675a", eye: "#2f6fb0", hair: "#6b3a1c", brow: "#4a2812", hat: "helmet", hatCol: "#2a5fb0", hatCol2: "#ffd23f",
            sleeve: "long", legs: false, glove: "#6b4226", collar: "#f4e3c0", cuff: "#f4e3c0", browTilt: 0.06, lid: 0.7, nose: 0.92 },
    atlas: paintAtlas({ shirt: "#ff8a1e", sleeve: "#ff8a1e", pants: "#3a3f55",
      front: function (g, x, y) { patch(g, script, x, y - 6, 96, 44, "#0d1f5c", "#ffe45c"); },
      back: function (g, x, y) { patch(g, script, x, y - 34, 150, 62, "#0d1f5c", "#ffe45c"); candyText(g, "BARGAIN HUNTER", x, y + 30, 26, 200); } }, 41)
  };
}
function vendorSpecs(script) {
  const sal = {
    spec: { skin: "#c98a5a", lip: "#9a4a3a", eye: "#5a3a1a", hair: "#2a1a10", hat: "cap", hatCol: "#c8322d", hatCol2: "#eceae2", sleeve: "short",
            apron: true, apronTie: "#ff9b3f", mustache: true, build: { sh: 1.1, belly: 1.18 }, shoe: "#f4f2ea", shoeStripe: "#2a5fb0", sole: "#c8322d",
            browTilt: 0.18, collar: "#16b9e8", nose: 1.15, hem: "#1c3a7a", sock: "#ffffff" },
    atlas: paintAtlas({ shirt: "#16b9e8", sleeve: "#16b9e8", pants: "#2a4f9a", pantsDenim: true, apron: "#ff9b3f",
      front: function (g, x, y) { patch(g, script, x, y - 26, 70, 30, "#0d1f5c", "#ffe45c"); },
      back: function (g, x, y) { candyText(g, "SWAP MEET", x, y - 10, 30, 210); candyText(g, "STAFF", x, y + 26, 24, 150); },
      apronDraw: function (g, A) {
        const cx = (A[0] + A[2]) / 2;
        rrectPath(g, A[0] + 16, A[1] + 26, A[2] - A[0] - 32, 84, 14); g.fillStyle = "#0d1f5c"; g.fill();
        drawScript(g, script, cx, A[1] + 68, A[2] - A[0] - 44, 70);
        candyText(g, "MAKE AN", cx, A[1] + 150, 26, 140); candyText(g, "OFFER", cx, A[1] + 182, 30, 140);
        g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(A[0] + 26, A[1] + 230, A[2] - A[0] - 52, 64);            // the pocket
        g.fillStyle = "#ffd23f"; g.fillRect(A[0] + 50, A[1] + 220, 6, 22); g.fillStyle = "#ff3fa4"; g.fillRect(A[0] + 62, A[1] + 216, 6, 26);
      } }, 51)
  };
  const dee = {
    spec: { skin: "#7b4f2c", lip: "#5a2a22", eye: "#2a1a10", hair: "#101014", hat: "bucket", hatCol: "#ffd23f", hatCol2: "#ff3fa4", sleeve: "long",
            build: { sh: 0.95, belly: 0.95 }, shoe: "#c8322d", shoeStripe: "#ffffff", sole: "#f4f2ea", lace: "#ffffff", browTilt: -0.08,
            collar: "#eceae2", cuff: "#eceae2", lid: 0.45, beard: true, hem: "#8a7a52" },
    atlas: paintAtlas({ shirt: "#eceae2", shirt2: "#7a3fa8", pants: "#b8a77a", vest: "#3a6fc0",
      front: function (g, x, y) { patch(g, script, x, y - 10, 92, 50, "#ffe45c", "#0d1f5c", "NO REFUNDS"); },
      back: function (g, x, y) { patch(g, script, x, y - 20, 160, 70, "#0d1f5c", "#ff3fa4"); candyText(g, "AS IS", x, y + 42, 28, 120); } }, 61)
  };
  return [sal, dee];
}

/* The Haggletron: a cash register that learned to walk and never takes the first offer. Barrel register body with
   the price screen (its weak spot) on the chest, a TV for a head with the face on its screen, a channel-dial nose,
   a register-key jaw that drops when it shouts prices, rabbit-ear antennas, a vendor's apron, mitts, sneakers.
   Built in world units: about 115 tall, the price screen 44 wide from 50 to 72 up, as the 2D game's hit test has it. */
function makeHaggletron(T, script, env) {
  const F = figShapes(T);
  const atlas = paintBossAtlas(script);
  const tex = new T.CanvasTexture(atlas);
  if ("colorSpace" in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
  const mat = new T.MeshPhongMaterial({ map: tex, vertexColors: true, specular: 0x666666, shininess: 55, envMap: env, combine: T.AddOperation, reflectivity: 0.07 });
  const faceMat = new T.MeshBasicMaterial({ vertexColors: true });     // the face on the screen glows
  const rg = rig(T, mat);
  const J = { root: new T.Group(), body: new T.Group(), pelvis: new T.Group(), spine: new T.Group(), head: new T.Group(), jaw: new T.Group(), face: new T.Group(),
              brows: new T.Group(), drawer: new T.Group(), ant: new T.Group(),
              sh: [new T.Group(), new T.Group()], el: [new T.Group(), new T.Group()], wr: [new T.Group(), new T.Group()],
              hip: [new T.Group(), new T.Group()], kn: [new T.Group(), new T.Group()], an: [new T.Group(), new T.Group()], gun: new T.Group() };
  J.root.add(J.body);
  J.body.add(J.pelvis); J.pelvis.position.y = 40.3;
  J.pelvis.add(J.spine); J.spine.position.y = 3;
  J.spine.add(J.head); J.head.position.y = 38;
  J.head.add(J.jaw); J.jaw.position.set(0, 14, 6);
  J.head.add(J.face); J.face.userData.mat = faceMat;
  J.head.add(J.brows); J.brows.userData.mat = faceMat; J.brows.position.set(0, 27.6, 16.2);
  J.head.add(J.ant); J.ant.position.set(0, 33.5, -2);
  J.spine.add(J.drawer); J.drawer.position.set(0, 3, 13);
  const CREAM = "#e8dcbc", METAL = "#9aa0b4", DARK = "#4a5068", ORANGE = "#ff9b3f", WOOD = "#ffffff";

  // pelvis, belt, apron
  rg.add(J.pelvis, F.sph, MX(T, 0, 0, 0, 0, 0, 0, 17, 9, 12.5), DARK);
  rg.add(J.pelvis, F.ring, MX(T, 0, 3.5, 0, 0, 0, 0, 16.6, 20, 12.4), "#2a2c36");
  rg.add(J.pelvis, roundBox(T, 7, 4, 2, 0.8), MX(T, 0, 3.5, 12.6), "#ffd23f");
  rg.add(J.pelvis, new T.CylinderGeometry(16.4, 19, 24, 24, 1, true, -1.05, 2.1), MX(T, 0, -8.5, 0.6, 0, 0, 0, 1, 1, 0.84), "#ffffff", REG.apron);
  // torso: the register housing, waist to shoulders
  const tp = [[0, -4], [14, -3], [15.5, 1], [17, 5], [21, 12], [25, 19], [26.5, 25], [25.5, 30], [21, 34], [13, 37], [7, 38.5], [0, 39]];
  rg.add(J.spine, lathe(T, tp, 32), MX(T, 0, 0, 0, 0, 0, 0, 1, 1, 0.74), "#ffffff", REG.torso);
  rg.add(J.spine, roundBox(T, 49, 27, 4, 2.4), MX(T, 0, 18, 20.2, -0.05), "#1a1c28");                  // the screen's bezel
  ["#ff4b3e", "#ffd23f", "#3ff0ff", "#eceae2"].forEach(function (c, i) {                               // register keys
    rg.add(J.spine, roundBox(T, 5.4, 3, 3.2, 1), MX(T, -10.5 + i * 7, 33.2, 13.6, -0.5), c);
  });
  [1, -1].forEach(function (s) { rg.add(J.spine, F.sph, MX(T, s * 26, 29, 0, 0, 0, 0, 10.5, 9.5, 9.5), METAL); });   // shoulders
  rg.add(J.drawer, roundBox(T, 30, 7, 7, 1.6), MX(T, 0, 0, 0), CREAM);                                // the cash drawer
  rg.add(J.drawer, roundBox(T, 10, 1.6, 1.8, 0.7), MX(T, 0, 0, 3.9), "#ffd23f");
  // head: neck rings, the TV, the dial nose, teeth; the jaw, the face and the antennas are their own pieces
  const H = J.head;
  rg.add(H, F.cyl, MX(T, 0, 4.5, 0, 0, 0, 0, 6, 9, 6), METAL);
  [1.5, 4.5, 7.5].forEach(function (y) { rg.add(H, F.ring, MX(T, 0, y, 0, 0, 0, 0, 6.6, 10, 6.6), DARK); });
  rg.add(H, roundBox(T, 36, 26, 28, 4.5), MX(T, 0, 21, 0), WOOD, REG.sleeve);                        // the cabinet, in wood grain
  rg.add(H, roundBox(T, 31, 21.5, 2, 3), MX(T, 0, 21.5, 13.6), "#20222e");
  rg.add(H, roundBox(T, 27.5, 18.5, 1.4, 3.2), MX(T, 0, 21.5, 14.4), "#163a40");                    // the glass
  rg.add(H, F.cyl, MX(T, 0, 19.4, 15.8, Math.PI / 2, 0, 0, 2.9, 3.4, 2.9), CREAM);                   // the dial nose
  rg.add(H, F.cyl, MX(T, 0, 19.4, 17.6, Math.PI / 2, 0, 0, 2.2, 0.6, 2.2), "#c9bd9a");
  rg.add(H, roundBox(T, 0.9, 3.6, 1.2, 0.3), MX(T, 0, 20.4, 18), "#1a1c28");
  rg.add(H, roundBox(T, 20, 6, 3, 1.5), MX(T, 0, 12.6, 13.2), "#3a0e14");                            // inside of the mouth
  for (let i = 0; i < 6; i++) rg.add(H, roundBox(T, 2.7, 2.2, 1.6, 0.5), MX(T, -7.5 + i * 3, 14.4, 14.6), "#fbfaf4");
  [1, -1].forEach(function (s) {                                                                     // speaker grilles for ears
    rg.add(H, F.cyl, MX(T, s * 18.3, 21, 0, 0, 0, Math.PI / 2, 5, 1.2, 5), "#2a2c36");
    rg.add(H, F.cyl, MX(T, s * 18.9, 21, 0, 0, 0, Math.PI / 2, 3.2, 1, 3.2), "#5a6078");
  });
  // jaw: a register-key chin with the bottom teeth
  rg.add(J.jaw, roundBox(T, 24, 6.5, 16, 2.6), MX(T, 0, -3.2, 5.4), CREAM);
  rg.add(J.jaw, roundBox(T, 18, 2, 3, 0.8), MX(T, 0, -3.2, 13.6), ORANGE);
  for (let i = 0; i < 6; i++) rg.add(J.jaw, roundBox(T, 2.7, 2.2, 1.6, 0.5), MX(T, -7.5 + i * 3, 0.4, 11.4), "#fbfaf4");
  // the face on the screen: eyes with red irises, and heavy brows on their own so they can lift
  [1, -1].forEach(function (s) {
    rg.add(J.face, F.sph, MX(T, s * 6.6, 24, 15.1, 0, 0, 0, 4.2, 3.7, 1.7), "#fbfaf4");
    rg.add(J.face, F.sph, MX(T, s * 6.3, 23.6, 16.3, 0, 0, 0, 2.5, 2.5, 0.9), "#ff2a1a");
    rg.add(J.face, F.sph, MX(T, s * 6.3, 23.6, 17.0, 0, 0, 0, 1.1, 1.35, 0.5), "#0b0b10");
    rg.add(J.face, F.sph, MX(T, s * 5.6, 24.6, 17.3, 0, 0, 0, 0.5, 0.5, 0.3), "#ffffff");
    rg.add(J.face, F.lid, MX(T, s * 6.6, 24, 15.1, 0.9, 0, 0, 4.4, 3.9, 1.9), "#163a40");          // a scowl: the top of each eye in shadow
    rg.add(J.brows, F.sph, MX(T, s * 6.8, 0, 0, 0, 0, s * 0.36, 5.4, 1.35, 1.3), "#0b0b10");
  });
  // antennas, with a little wobble of their own
  [1, -1].forEach(function (s) {
    const m = MX(T, s * 4, 0, 0, 0, 0, -s * 0.5);
    rg.add(J.ant, taper(T, 0.8, 0.45, 20, 0, 8), m.clone().multiply(MX(T, 0, 0, 0, Math.PI)), "#c2ccd4");
    rg.add(J.ant, F.sph, m.clone().multiply(MX(T, 0, 20.5, 0, 0, 0, 0, 2.4)), "#ff4b3e");
  });
  rg.add(J.ant, F.sph, MX(T, 0, -0.5, 0, 0, 0, 0, 5, 2.2, 4), DARK);

  // arms
  for (let s = 0; s < 2; s++) {
    const sg = s ? -1 : 1;
    J.spine.add(J.sh[s]); J.sh[s].position.set(sg * 28, 28, 0);
    J.sh[s].add(J.el[s]); J.el[s].position.y = -17;
    J.el[s].add(J.wr[s]); J.wr[s].position.y = -15;
    rg.add(J.sh[s], taper(T, 6.4, 5.2, 17, 0.1, 18), MX(T, 0, 0, 0), METAL);
    rg.add(J.sh[s], F.ring, MX(T, 0, -8, 0, 0, 0, 0, 6.1, 14, 6.1), DARK);
    rg.add(J.el[s], F.sph, MX(T, 0, 0, 0, 0, 0, 0, 5.8), ORANGE);
    rg.add(J.el[s], taper(T, 5.3, 4.2, 15, 0.12, 18), MX(T, 0, 0, 0), METAL);
    rg.add(J.el[s], F.ring, MX(T, 0, -13.6, 0, 0, 0, 0, 4.9, 18, 4.9), ORANGE);
    addHand(T, rg, J.wr[s], 6.2, -sg, CREAM, true);
  }
  // the price gun in its right hand, pointing forward
  J.wr[1].add(J.gun); J.gun.position.set(0, -7, 1); J.gun.rotation.x = Math.PI / 2;
  rg.add(J.gun, roundBox(T, 6, 8, 18, 2.2), MX(T, 0, 0, 5), ORANGE);
  rg.add(J.gun, roundBox(T, 5, 11, 5, 2), MX(T, 0, -6, 0, -0.3), "#c26a20");
  rg.add(J.gun, F.cyl, MX(T, 0, 1.2, 15.5, Math.PI / 2, 0, 0, 1.8, 5, 1.8), "#2a2c36");
  rg.add(J.gun, F.cyl, MX(T, 0, 6.5, 3, 0, 0, Math.PI / 2, 3.4, 5, 3.4), "#fbfaf4");                // a roll of price tags
  rg.add(J.gun, F.cyl, MX(T, 0, 6.5, 3, 0, 0, Math.PI / 2, 1.2, 5.4, 1.2), "#ff3fa4");
  // legs and sneakers
  for (let s = 0; s < 2; s++) {
    const sg = s ? -1 : 1;
    J.pelvis.add(J.hip[s]); J.hip[s].position.set(sg * 12, -3, 0);
    J.hip[s].add(J.kn[s]); J.kn[s].position.y = -15;
    J.kn[s].add(J.an[s]); J.an[s].position.y = -14;
    rg.add(J.hip[s], taper(T, 7, 5.6, 15, 0.12, 18), MX(T, 0, 0, 0), DARK);
    rg.add(J.kn[s], F.sph, MX(T, 0, 0.4, 1.5, 0, 0, 0, 5.8), ORANGE);
    rg.add(J.kn[s], taper(T, 5.5, 4.3, 14, 0.14, 18), MX(T, 0, 0, 0), METAL);
    const A = J.an[s];
    rg.add(A, F.cyl, MX(T, 0, -0.5, 0, 0, 0, 0, 4.8, 3, 5), "#fbfaf4");
    rg.add(A, F.sph, MX(T, 0, -3.4, -2, 0, 0, 0, 5.6, 4.8, 6.4), ORANGE);
    rg.add(A, F.sph, MX(T, 0, -4.6, 7.4, 0, 0, 0, 6.2, 3.9, 8.6), ORANGE);
    rg.add(A, F.sph, MX(T, 0, -1.9, 4.6, 0.3, 0, 0, 4, 2.8, 5.2), "#fbfaf4");
    rg.add(A, F.sph, MX(T, sg * 5.2, -4.4, 2.6, 0, 0, 0, 1.0, 2.4, 6.4), "#0d1f5c");
    rg.add(A, roundBox(T, 11.4, 3.2, 21, 1.5), MX(T, 0, -6.7, 3.6), "#fbfaf4");
  }
  rg.build();
  // the price screen: its own canvas, repainted when the price changes
  const sc = mkCanvas(256, 128), st = new T.CanvasTexture(sc);
  if ("colorSpace" in st && T.SRGBColorSpace) st.colorSpace = T.SRGBColorSpace;
  const screenMat = new T.MeshBasicMaterial({ map: st });
  const screen = new T.Mesh(roundBox(T, 44, 22, 2, 2), [screenMat, screenMat, screenMat, screenMat, screenMat, screenMat]);
  screen.position.set(0, 18, 21.6); screen.rotation.x = -0.05; J.spine.add(screen);
  J.screen = { canvas: sc, tex: st, mat: screenMat, key: "" };
  J.mat = mat; J.faceMat = faceMat;
  return J;
}
function paintBossAtlas(script) {
  const c = mkCanvas(ATLAS, ATLAS), g = c.getContext("2d"), rnd = vrng(71);
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, ATLAS, ATLAS);
  const T = REG.torso, A = REG.apron, Sl = REG.sleeve, P = REG.pants;
  // the register housing: cream, a keypad down each side, the wordmark on the back
  shadeBand(g, T, "#efe4c6", "#cbbd96");
  g.fillStyle = "rgba(120,100,60,.25)"; for (let x = 0; x < 512; x += 64) g.fillRect(x, T[1], 2, T[3] - T[1]);
  [128, 384].forEach(function (x) {
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) {
      rrectPath(g, x - 30 + k * 21, 60 + r * 22, 17, 17, 4); g.fillStyle = ["#fbfaf4", "#ffd23f", "#ff9b3f"][(r + k) % 3]; g.fill();
      g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 1.5; g.stroke();
    }
  });
  patch(g, script, 256, 66, 170, 74, "#0d1f5c", "#ffe45c");
  candyText(g, "NO REFUNDS", 256, 136, 26, 190);
  g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(T[0], T[3] - 8, T[2] - T[0], 8);
  // the apron
  g.fillStyle = "#c8322d"; g.fillRect(A[0], A[1], A[2] - A[0], A[3] - A[1]);
  folds(g, A[0], A[1], A[2] - A[0], A[3] - A[1], 14, rnd, Math.PI / 2);
  g.strokeStyle = "rgba(255,255,255,.6)"; g.setLineDash([6, 5]); g.lineWidth = 2.5; g.strokeRect(A[0] + 7, A[1] + 7, A[2] - A[0] - 14, A[3] - A[1] - 14); g.setLineDash([]);
  const cx = (A[0] + A[2]) / 2;
  rrectPath(g, A[0] + 14, A[1] + 30, A[2] - A[0] - 28, 92, 14); g.fillStyle = "#0d1f5c"; g.fill();
  g.lineWidth = 3; g.strokeStyle = "#ffe45c"; g.stroke();
  drawScript(g, script, cx, A[1] + 76, A[2] - A[0] - 40, 78);
  candyText(g, "HAGGLE", cx, A[1] + 166, 32, 150); candyText(g, "TRON", cx, A[1] + 204, 40, 150);
  g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(A[0] + 22, A[1] + 250, A[2] - A[0] - 44, 56);
  // the TV cabinet, wood grain
  g.fillStyle = "#7a5a3a"; g.fillRect(Sl[0], Sl[1], Sl[2] - Sl[0], Sl[3] - Sl[1]);
  for (let i = 0; i < 60; i++) {
    const y = Sl[1] + rnd() * (Sl[3] - Sl[1]);
    g.strokeStyle = "rgba(" + (rnd() < 0.5 ? "60,36,18" : "150,110,70") + ",.4)"; g.lineWidth = 1 + rnd() * 2.5;
    g.beginPath(); g.moveTo(Sl[0], y); g.bezierCurveTo(Sl[0] + 110, y + (rnd() - 0.5) * 16, Sl[0] + 220, y + (rnd() - 0.5) * 16, Sl[2], y + (rnd() - 0.5) * 8); g.stroke();
  }
  g.fillStyle = "#ffffff"; g.fillRect(ATLAS - 24, ATLAS - 24, 24, 24);
  return c;
}
function paintBossScreen(J, hp, flash, dead) {
  const sc = J.screen, key = hp + "|" + (flash ? 1 : 0) + "|" + (dead ? 1 : 0);
  if (key === sc.key) return;
  sc.key = key;
  const g = sc.canvas.getContext("2d");
  g.fillStyle = flash ? "#3a6a40" : dead ? "#0b0b0b" : "#071a0c"; g.fillRect(0, 0, 256, 128);
  g.fillStyle = "rgba(155,255,63,.06)"; for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 256, 2);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.font = "900 64px " + HUD_FONT;
  g.shadowColor = "#9bff3f"; g.shadowBlur = flash ? 4 : 18;
  g.fillStyle = flash ? "#eceae2" : dead ? "#ff4b3e" : "#9bff3f";
  g.fillText(dead ? "SOLD!" : "$" + Math.max(0, hp * 25), 128, 66);
  g.shadowBlur = 0;
  g.font = "bold 14px " + HUD_FONT; g.fillStyle = "rgba(155,255,63,.6)";
  g.fillText(dead ? "" : "ASKING PRICE", 128, 18);
  sc.tex.needsUpdate = true;
}

/* ---------------- Scene ---------------- */
const VIEW_BACK = 260, VIEW_AHEAD = 1150;                  // how much of the fortress is built around the camera
const SHELF_H = 22, LOT_D = 26;                            // the VHS shelf on the left edge, the depth of the floating lot
const BOOTH_PITCH = 620, BOOTH_S = 98;                     // vendor booths float off the right edge
const DECAL = ["#c8322d", "#2a5fb0", "#c98a2a", "#3f8f4a", "#7a3fa8"];
const ITEMC = ["#ffd23f", "#eceae2", "#3ff0ff", "#ff3fa4"];

function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x0b0820, 1);
  const scene = new T.Scene();
  scene.fog = new T.Fog(0x170d40, 560, 1240);
  const camera = new T.PerspectiveCamera(60, W / H, 1.5, 3200);
  const caps = renderer.capabilities;
  const aniso = Math.min(4, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  const tmp = { v: new T.Vector3(), v2: new T.Vector3(), q: new T.Quaternion(), m: new T.Matrix4(), e: new T.Euler(), c: new T.Color(), s: new T.Vector3() };

  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = aniso;
    return t;
  }
  function decal(mat, order) { mat.transparent = true; mat.depthWrite = false; mat._order = order; return mat; }
  function add(mesh, parent) { if (mesh.material && mesh.material._order) mesh.renderOrder = mesh.material._order; (parent || scene).add(mesh); return mesh; }

  const script = scriptCanvas(scriptImg), sAspect = script.width / script.height;
  const cScript = mkCanvas(1024, 512);
  cScript.getContext("2d").drawImage(script, 8, 8, 1008, 496);
  const tScript = tex(cScript);
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;
  const tShadow = tex(shadowCanvas());
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);   // a flat unit square, facing up
  const shadowMat = decal(new T.MeshBasicMaterial({ map: tShadow, opacity: 0.55, fog: false }), 3);

  /* lights: bright and candy-colored, a swap meet lit for a night sale */
  scene.add(new T.HemisphereLight(0xe2dcff, 0x40306a, 1.35));
  const key = new T.DirectionalLight(0xfff2dc, 2.1);
  scene.add(key); scene.add(key.target);
  const rim = new T.DirectionalLight(0x8fd8ff, 0.7);
  scene.add(rim); scene.add(rim.target);

  /* space: a star sphere and a few things drifting far off, all riding along with the camera */
  const sky = new T.Group(); scene.add(sky);
  const skyBall = new T.Mesh(new T.SphereGeometry(2800, 32, 16), new T.MeshBasicMaterial({ map: tex(skyCanvas()), side: T.BackSide, depthWrite: false, fog: false }));
  skyBall.renderOrder = -3; sky.add(skyBall);
  const record = new T.Mesh(new T.CircleGeometry(340, 64), new T.MeshBasicMaterial({ map: tex(recordCanvas(script)), transparent: true, depthWrite: false, fog: false }));
  record.position.set(-760, 330, -2100); record.rotation.set(0.15, 0.32, 0); record.renderOrder = -2; sky.add(record);
  const planet = new T.Mesh(new T.SphereGeometry(150, 32, 20), new T.MeshBasicMaterial({ map: tex(planetCanvas()), fog: false, depthWrite: false }));
  planet.position.set(980, 520, -2200); planet.renderOrder = -2; sky.add(planet);
  const pring = new T.Mesh(new T.RingGeometry(190, 300, 64), new T.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.45, side: T.DoubleSide, fog: false, depthWrite: false }));
  pring.position.copy(planet.position); pring.rotation.set(1.2, 0.2, 0.3); pring.renderOrder = -2; sky.add(pring);

  /* the floating lot: one set of pieces per stretch of floor that is in view */
  const tFloor = tex(floorCanvas(), true), tUnder = tex(underCanvas(), true), tShelf = tex(shelfCanvas(), true);
  const floorMat = new T.MeshLambertMaterial({ map: tFloor });
  const underMat = new T.MeshLambertMaterial({ map: tUnder });
  const shelfMat = new T.MeshLambertMaterial({ map: tShelf });
  const woodMat = new T.MeshLambertMaterial({ color: 0x7b4c30 });
  function quad(mat) {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute("normal", new T.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute("uv", new T.BufferAttribute(new Float32Array(8), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new T.Mesh(g, mat); m.frustumCulled = false; scene.add(m);
    return m;
  }
  // p: four corners [x, y, z] counter-clockwise seen from the front; uv: four [u, v]
  function setQuad(m, p, uv, n) {
    const P = m.geometry.attributes.position, N = m.geometry.attributes.normal, U = m.geometry.attributes.uv;
    for (let i = 0; i < 4; i++) { P.setXYZ(i, p[i][0], p[i][1], p[i][2]); N.setXYZ(i, n[0], n[1], n[2]); U.setXY(i, uv[i][0], uv[i][1]); }
    P.needsUpdate = N.needsUpdate = U.needsUpdate = true;
    m.visible = true;
  }
  const spanSets = [];
  for (let i = 0; i < 3; i++) spanSets.push({ top: quad(floorMat), edge: quad(underMat), front: quad(underMat), shelf: quad(shelfMat), shelfTop: quad(woodMat), shelfBack: quad(woodMat) });

  // blankets and the junk on them: one draw call each
  const blanketGeo = new T.BoxGeometry(24, 0.5, 32); blanketGeo.translate(0, 0.25, 0);
  const blankets = new T.InstancedMesh(blanketGeo, new T.MeshLambertMaterial({ map: tex(blanketCanvas(), true) }), 140);
  blankets.count = 0; blankets.frustumCulled = false; scene.add(blankets); blankets.setColorAt(0, new T.Color(1, 1, 1));
  const itemGeo = roundBox(T, 5, 3.2, 5, 0.7); itemGeo.translate(0, 1.6 + 0.5, 0);
  const items = new T.InstancedMesh(itemGeo, new T.MeshPhongMaterial({ map: tex(itemCanvas()), specular: 0x444444, shininess: 50 }), 420);
  items.count = 0; items.frustumCulled = false; scene.add(items); items.setColorAt(0, new T.Color(1, 1, 1));
  // the wordmark painted on the lot, every so often
  const markMat = decal(new T.MeshLambertMaterial({ map: tScript, opacity: 0.85 }), 2);
  const floorMarks = [];
  for (let i = 0; i < 3; i++) { const m = add(new T.Mesh(unit, markMat)); m.scale.set(84, 1, 84 / sAspect); m.visible = false; floorMarks.push(m); }

  /* obstacle materials */
  const looks = [
    { mat: new T.MeshLambertMaterial({ map: tex(wallBoxesCanvas(script), true) }), tw: 68, th: 44 },
    { mat: new T.MeshLambertMaterial({ map: tex(wallTapesCanvas(), true) }), tw: 70, th: 42 },
    { mat: new T.MeshLambertMaterial({ map: tex(wallCratesCanvas(), true) }), tw: 68, th: 44 }
  ];
  const wallSide = new T.MeshLambertMaterial({ color: 0x151722 });
  const wallTops = [new T.MeshLambertMaterial({ color: 0x454a62 }), new T.MeshLambertMaterial({ color: 0x6b4430 }), new T.MeshLambertMaterial({ color: 0x8a5a30 })];
  const trimMat = new T.MeshPhongMaterial({ color: 0xff9b3f, specular: 0xffffff, shininess: 80 });
  const trim2Mat = new T.MeshPhongMaterial({ color: 0xffd23f, specular: 0xffffff, shininess: 80 });
  const pylonMat = new T.MeshPhongMaterial({ color: 0x8e93a2, specular: 0xaaaaaa, shininess: 60, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.1 });
  const darkMat = new T.MeshBasicMaterial({ color: 0x05070d });
  const signTex = {}, marqueeTex = {};
  function signMat(text) { if (!signTex[text]) signTex[text] = new T.MeshBasicMaterial({ map: tex(signCanvas(text)) }); return signTex[text]; }
  function marqueeMat(text) { if (!marqueeTex[text]) marqueeTex[text] = new T.MeshBasicMaterial({ map: tex(marqueeCanvas(script, text)) }); return marqueeTex[text]; }
  const zapTime = { value: 0 };
  const csChunk = T.ShaderChunk && T.ShaderChunk.colorspace_fragment ? "colorspace_fragment" : "encodings_fragment";
  function zapMat(h) {
    return new T.ShaderMaterial({
      uniforms: { uTime: zapTime, uH: { value: h } },
      vertexShader: "varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
      fragmentShader: [
        "uniform float uTime;", "uniform float uH;", "varying vec2 vUv;",
        "float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
        "void main() {",
        "  float t = floor(uTime * 24.0);",
        "  float n = max(3.0, floor(uH / 7.0));",
        "  float fy = vUv.y * n;",
        "  float k = floor(fy + 0.5);",
        "  float xs = vUv.x * 14.0, xi = floor(xs), xf = fract(xs);",
        "  float j = mix(hh(vec2(xi, k * 17.0 + t)), hh(vec2(xi + 1.0, k * 17.0 + t)), xf) - 0.5;",
        "  float edge = smoothstep(0.0, 0.04, vUv.x) * smoothstep(0.0, 0.04, 1.0 - vUv.x);",
        "  j *= edge;",
        "  float d = abs(fy - k - j * 5.0 / (uH / n)) * (uH / n);",
        "  float line = 1.0 - smoothstep(0.35, 1.2, d);",
        "  vec3 lc = mod(k + t, 3.0) < 1.0 ? vec3(1.0, 0.25, 0.64) : vec3(0.62, 0.97, 1.0);",
        "  float base = 0.12 + 0.05 * sin(uTime * 30.0);",
        "  vec3 col = vec3(0.25, 0.94, 1.0) * base + lc * line * 0.8;",
        "  gl_FragColor = vec4(col, 1.0);",
        "  #include <" + csChunk + ">",
        "}"
      ].join("\n"),
      transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
    });
  }
  const emitMat = new T.MeshBasicMaterial({ color: 0xbffaff });
  const glowTex = tex(glowCanvas("rgba(63,240,255,.6)"));
  const glowMat = new T.SpriteMaterial({ map: glowTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false });

  /* LED ribbon board: one texture, shown on every gate and on the Haggletron's stall */
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);             // one texel per LED, never smoothed
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas());
  tDot.wrapS = tDot.wrapT = T.RepeatWrapping; tDot.anisotropy = aniso;
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
  const ledGeo = new T.PlaneGeometry(LED_W, LED_H);

  /* obstacles: built when they come into view, thrown away once they are behind */
  function box(w, h, d, mats, x, y, z, grp) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mats); m.position.set(x, y, z); grp.add(m); return m; }
  function faceBox(w, h, cx, cy, look, top, grp) {           // a block of wall with its face tiled in world units
    const L = looks[look], geo = frontUV(new T.BoxGeometry(w, h, THICK), cx + HW, cy, L.tw, L.th);
    const m = new T.Mesh(geo, [wallSide, wallSide, top, wallSide, L.mat, wallSide]);
    m.position.set(cx, cy, -THICK / 2); grp.add(m); return m;
  }
  function pylons(o, grp) {
    box(6, ZT + LOT_D, 6, pylonMat, -HW - 5, (ZT - LOT_D) / 2, -3, grp);
    box(6, ZT + LOT_D, 6, pylonMat, HW + 5, (ZT - LOT_D) / 2, -3, grp);
    box(8, 3, 8, trimMat, -HW - 5, ZT + 1.5, -3, grp); box(8, 3, 8, trimMat, HW + 5, ZT + 1.5, -3, grp);
  }
  function field(z0, z1, grp) {
    const h = z1 - z0, m = new T.Mesh(new T.PlaneGeometry(2 * HW + 4, h), zapMat(h));
    m.position.set(0, (z0 + z1) / 2, -3); m.renderOrder = 8; grp.add(m);
    [-1, 1].forEach(function (s) {
      [z0, z1].forEach(function (z) {
        const e = new T.Mesh(new T.SphereGeometry(2.2, 12, 8), emitMat); e.position.set(s * (HW + 2), Math.max(z, 1.5), -3); grp.add(e);
        const sp = new T.Sprite(glowMat); sp.scale.set(18, 18, 1); sp.position.copy(e.position); sp.renderOrder = 9; grp.add(sp);
      });
    });
  }
  function ledBoard(grp, y, z, w) {
    const k = (w || LED_W) / LED_W;
    const house = new T.Mesh(new T.BoxGeometry(LED_W * k + 3, LED_H * k + 4, 1.4), darkMat); house.position.set(0, y + 0.6 * k, z - 0.3); grp.add(house);
    const face = new T.Mesh(ledGeo, ledMat); face.scale.setScalar(k); face.position.set(0, y, z + 0.5); grp.add(face);
    return face;
  }
  function buildObstacle(o) {
    const grp = new T.Group(), look = o.look || 0, top = wallTops[look];
    grp.position.z = -o.f;
    if (o.t === "wall" || o.t === "wallzap") {
      faceBox(2 * HW, o.h, 0, o.h / 2, look, top, grp);
      box(2 * HW + 2, 1.8, 1.8, trimMat, 0, o.h - 0.4, 0.4, grp);
      if (o.h >= 26 && o.sign) { const s = new T.Mesh(new T.PlaneGeometry(50, 10.9), signMat(o.sign)); s.position.set(0, o.h - 7.5, 0.7); grp.add(s); }
    }
    if (o.t === "zap" || o.t === "wallzap") {
      pylons(o, grp);
      field(o.t === "zap" ? o.z0 : o.z0, o.t === "zap" ? Math.min(o.z1, ZT) : ZT, grp);
    }
    if (o.t === "gate") {
      const a = o.a, b = o.b;
      if (a > -HW + 0.5) faceBox(a + HW, ZT, (a - HW) / 2, ZT / 2, look, top, grp);
      if (b < HW - 0.5) faceBox(HW - b, ZT, (b + HW) / 2, ZT / 2, look, top, grp);
      faceBox(b - a, ZT - o.gh, (a + b) / 2, (o.gh + ZT) / 2, look, top, grp);
      box(3, o.gh + 3, 3, trimMat, a - 1.5, (o.gh + 3) / 2, 0.6, grp);
      box(3, o.gh + 3, 3, trimMat, b + 1.5, (o.gh + 3) / 2, 0.6, grp);
      box(b - a + 6, 3, 3, trimMat, (a + b) / 2, o.gh + 1.5, 0.6, grp);
      box(2 * HW + 2, 2, 2, trim2Mat, 0, ZT, 0.4, grp);
      ledBoard(grp, ZT - 25, 0.8);
      const named = o.sign === "FLEA FORTRESS" || o.sign === "BACK LOT";
      if (named) {
        const room = ZT - 25 - LED_H / 2 - 4 - o.gh - 5, mh = Math.min(room, 44), mw = mh * 1024 / 420;
        const mq = new T.Mesh(new T.PlaneGeometry(mw, mh), marqueeMat(o.sign)); mq.position.set((a + b) / 2, o.gh + 4 + mh / 2, 0.9); grp.add(mq);
        box(mw + 3, mh + 3, 1, trimMat, (a + b) / 2, o.gh + 4 + mh / 2, 0.3, grp);
      } else if (o.sign) {
        const s = new T.Mesh(new T.PlaneGeometry(48, 10.5), signMat(o.sign)); s.position.set(0, ZT - 7.5, 0.9); grp.add(s);
      }
    }
    scene.add(grp);
    return grp;
  }
  function freeObstacle(grp) {
    scene.remove(grp);
    grp.traverse(function (n) { if (n.isMesh && n.geometry !== ledGeo && n.geometry) n.geometry.dispose(); if (n.isMesh && n.material && n.material.type === "ShaderMaterial" && n.material !== ledMat) n.material.dispose(); });
  }

  /* things on the floor: fuel tanks, price gun turrets, rabbit-ear TVs (pooled) */
  const tankMat = new T.MeshPhongMaterial({ map: tex(tankCanvas(script)), specular: 0xffffff, shininess: 90, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12 });
  const tankGeo = lathe(T, [[0, 0], [6.6, 0], [7.8, 1.2], [8, 3], [8, 13.5], [7.4, 15.6], [5.4, 16.8], [2.2, 17.2], [0, 17.2]], 28);
  (function () { const p = tankGeo.attributes.position, uv = tankGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, clamp(p.getY(i) / 17.2, 0, 1)); })();
  const steelMat = new T.MeshPhongMaterial({ color: 0x5a6078, specular: 0x999999, shininess: 60 });
  const darkSteel = new T.MeshPhongMaterial({ color: 0x2c3040, specular: 0x666666, shininess: 40 });
  const orangeMat = new T.MeshPhongMaterial({ color: 0xff9b3f, specular: 0xffffff, shininess: 110, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12 });
  const woodTv = new T.MeshPhongMaterial({ color: 0x7a5a3a, specular: 0x553322, shininess: 30 });
  const tvC = mkCanvas(64, 48), tvTex = tex(tvC); tvTex.minFilter = T.LinearFilter; tvTex.generateMipmaps = false;
  const tvMat = new T.MeshBasicMaterial({ map: tvTex });
  const antMat = new T.MeshPhongMaterial({ color: 0xc2ccd4, specular: 0xffffff, shininess: 90 });
  const ballMat = new T.MeshPhongMaterial({ color: 0xeceae2, specular: 0xffffff, shininess: 90 });
  const warnMat = new T.MeshBasicMaterial({ color: 0xffd23f });
  const pools = { tank: [], turret: [], ears: [] };
  function makeEnt(t) {
    const g = new T.Group();
    const sh = new T.Mesh(unit, shadowMat); sh.renderOrder = 3; sh.position.y = 0.2; g.add(sh);
    if (t === "tank") {
      sh.scale.set(22, 1, 22);
      const body = new T.Mesh(tankGeo, tankMat); g.add(body); g.userData.body = body;
      const cap = new T.Mesh(new T.CylinderGeometry(2.2, 2.6, 3, 14), darkSteel); cap.position.y = 18.4; g.add(cap);
      const valve = new T.Mesh(new T.TorusGeometry(2.4, 0.5, 6, 16).rotateX(Math.PI / 2), new T.MeshPhongMaterial({ color: 0xff4b3e, shininess: 60 })); valve.position.y = 20.2; g.add(valve);
      [0, 1, 2].forEach(function (k) { const a = k / 3 * TAU; const f = new T.Mesh(new T.BoxGeometry(2, 1.5, 4), darkSteel); f.position.set(Math.cos(a) * 7.4, 0.75, Math.sin(a) * 7.4); f.rotation.y = -a; g.add(f); });
    } else if (t === "turret") {
      sh.scale.set(20, 1, 20);
      const base = new T.Mesh(roundBox(T, 12, 6, 12, 1.2), steelMat); base.position.y = 3; g.add(base);
      const stripe = new T.Mesh(new T.BoxGeometry(12.4, 1.2, 12.4), warnMat); stripe.position.y = 4.8; g.add(stripe);
      const dome = new T.Mesh(new T.SphereGeometry(5.6, 20, 10, 0, TAU, 0, Math.PI / 2), orangeMat); dome.position.y = 6; g.add(dome);
      const aim = new T.Group(); aim.position.y = 7.6; g.add(aim); g.userData.aim = aim;
      const gun = new T.Mesh(roundBox(T, 3.6, 4.4, 10, 1.2), orangeMat); gun.position.z = 4.5; aim.add(gun);   // a price gun on a swivel
      const brl = new T.Mesh(new T.CylinderGeometry(1.1, 1.1, 5, 10).rotateX(Math.PI / 2), darkSteel); brl.position.z = 10.5; aim.add(brl);
      const roll = new T.Mesh(new T.CylinderGeometry(2, 2, 3.2, 14).rotateZ(Math.PI / 2), ballMat); roll.position.set(0, 3, 2.5); aim.add(roll);
      const lamp = new T.Mesh(new T.SphereGeometry(1.1, 10, 8), new T.MeshBasicMaterial({ color: 0xffd23f })); lamp.position.set(0, 2.5, 6.5); aim.add(lamp); g.userData.lamp = lamp;
    } else {
      sh.scale.set(22, 1, 22);
      const cab = new T.Mesh(roundBox(T, 16, 12, 14, 2), woodTv); cab.position.y = 6; g.add(cab);
      const bez = new T.Mesh(roundBox(T, 12.5, 9.5, 1, 1.4), darkSteel); bez.position.set(-1, 6.2, 7); g.add(bez);
      const scr = new T.Mesh(new T.PlaneGeometry(10.4, 7.6), tvMat); scr.position.set(-1, 6.2, 7.6); g.add(scr);
      [5.6, 7.4].forEach(function (y) { const k = new T.Mesh(new T.CylinderGeometry(0.8, 0.8, 1, 10).rotateX(Math.PI / 2), ballMat); k.position.set(6.4, y, 7.2); g.add(k); });
      const ant = new T.Group(); ant.position.y = 12; g.add(ant); g.userData.ant = ant;
      [-1, 1].forEach(function (s) {
        const rod = new T.Mesh(new T.CylinderGeometry(0.28, 0.4, 16, 6), antMat); rod.position.set(s * 4.4, 7.4, 0); rod.rotation.z = -s * 0.55; ant.add(rod);
        const tip = new T.Mesh(new T.SphereGeometry(0.9, 8, 6), ballMat); tip.position.set(s * 8.8, 14.2, 0); ant.add(tip);
      });
      const base = new T.Mesh(new T.SphereGeometry(2, 12, 6, 0, TAU, 0, Math.PI / 2), darkSteel); ant.add(base);
    }
    scene.add(g);
    return g;
  }

  /* flying discs, shots, bullets */
  const discMats = ["#3ff0ff", "#ffd23f", "#ff3fa4"].map(function (c) { return new T.MeshPhongMaterial({ map: tex(discCanvas(c, script)), specular: 0xffffff, shininess: 120, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.1 }); });
  const discEdge = new T.MeshPhongMaterial({ color: 0x14141c, specular: 0x666666, shininess: 60 });
  const discGeo = new T.CylinderGeometry(10, 10, 0.9, 40);
  const discPool = [];
  function makeDisc(kind) {
    const g = new T.Group();
    const d = new T.Mesh(discGeo, [discEdge, discMats[kind], discMats[kind]]); g.add(d); g.userData.d = d;
    const sh = add(new T.Mesh(unit, shadowMat)); sh.scale.set(18, 1, 18); g.userData.sh = sh;
    scene.add(g); g.userData.kind = kind;
    return g;
  }
  const tagMat = new T.MeshBasicMaterial({ map: tex(tagCanvas()), side: T.DoubleSide, transparent: true, alphaTest: 0.3 });
  const tagGeo = new T.PlaneGeometry(10, 5);
  const tagPool = [], misPool = [];
  const flameMat = new T.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false });
  function makeMissile() {
    const g = new T.Group();
    const body = new T.Mesh(new T.CylinderGeometry(1.4, 1.4, 8, 12).rotateX(Math.PI / 2), ballMat); g.add(body);
    const nose = new T.Mesh(new T.ConeGeometry(1.4, 3.6, 12).rotateX(-Math.PI / 2), new T.MeshPhongMaterial({ color: 0xff3fa4, shininess: 80 })); nose.position.z = -5.8; g.add(nose);
    [0, 1, 2, 3].forEach(function (k) { const f = new T.Mesh(new T.BoxGeometry(0.4, 3.4, 2.6), orangeMat); f.rotation.z = k * Math.PI / 2; f.position.set(Math.cos(k * Math.PI / 2 + Math.PI / 2) * 1.8, Math.sin(k * Math.PI / 2 + Math.PI / 2) * 1.8, 3); g.add(f); });
    const fl = new T.Mesh(new T.ConeGeometry(1.2, 6, 10).rotateX(Math.PI / 2), flameMat); fl.position.z = 7; g.add(fl); g.userData.fl = fl;
    scene.add(g);
    return g;
  }
  const boltGeo = new T.CylinderGeometry(0.75, 0.75, 13, 8).rotateX(Math.PI / 2);
  const bolts = new T.InstancedMesh(boltGeo, new T.MeshBasicMaterial({ color: 0xffe066, fog: false }), 10);
  bolts.count = 0; bolts.frustumCulled = false; scene.add(bolts);
  const boltGlowMat = new T.SpriteMaterial({ map: tex(glowCanvas("rgba(255,210,63,.7)")), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  const boltGlows = [];
  for (let i = 0; i < 10; i++) { const s = new T.Sprite(boltGlowMat); s.scale.set(9, 9, 1); s.visible = false; scene.add(s); boltGlows.push(s); }

  /* explosions: cubes (one draw call) and rings */
  const MAXP = 600;
  const sparks = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: 0xffffff, fog: false }), MAXP);
  sparks.count = 0; sparks.frustumCulled = false; scene.add(sparks);
  sparks.setColorAt(0, new T.Color(1, 1, 1));
  const rings = [];
  for (let i = 0; i < 10; i++) {
    const m = new T.Mesh(new T.RingGeometry(0.78, 1, 36), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: T.AdditiveBlending, side: T.DoubleSide, depthWrite: false, fog: false }));
    m.visible = false; m.renderOrder = 9; scene.add(m); rings.push(m);
  }

  /* the Bargain Hunter, and its pilot */
  const ship = new T.Group(); scene.add(ship);
  const hull = new T.Group(); ship.add(hull);                // banks and pitches inside the ship group
  const hullTex = tex(hullCanvas(), true);
  const shipWhite = new T.MeshPhongMaterial({ map: hullTex, specular: 0xffffff, shininess: 110, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12 });
  const fus = lathe(T, [[0, -11.5], [1.9, -11], [2.7, -9], [3.2, -5], [3.4, 0], [3.2, 4], [2.6, 8], [1.6, 11.5], [0.7, 13.2], [0, 14]], 26);
  fus.rotateX(-Math.PI / 2); fus.scale(1, 0.8, 1);
  hull.add(new T.Mesh(fus, shipWhite));
  const wingShape = new T.Shape([new T.Vector2(0, -6), new T.Vector2(9.6, 5.6), new T.Vector2(9.6, 8.2), new T.Vector2(0, 7.6), new T.Vector2(-9.6, 8.2), new T.Vector2(-9.6, 5.6)]);
  const wingGeo = new T.ExtrudeGeometry(wingShape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.35, bevelSegments: 2 });
  wingGeo.rotateX(Math.PI / 2); wingGeo.translate(0, 0.2, 0);
  const tWing = tex(wingCanvas(script));
  tWing.repeat.set(1 / 26, 1 / 16); tWing.offset.set(0.5, 6 / 16);
  const wingMat = new T.MeshPhongMaterial({ map: tWing, specular: 0xffffff, shininess: 100, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.1 });
  hull.add(new T.Mesh(wingGeo, wingMat));
  const finShape = new T.Shape([new T.Vector2(0, 0), new T.Vector2(5.4, 0), new T.Vector2(6.4, 6), new T.Vector2(4.4, 6.2)]);
  const finGeo = new T.ExtrudeGeometry(finShape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 1 });
  finGeo.rotateY(-Math.PI / 2); finGeo.translate(0.25, 1.6, 4.6);
  const redMat = new T.MeshPhongMaterial({ color: 0xff4b3e, specular: 0xffffff, shininess: 100, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.1 });
  hull.add(new T.Mesh(finGeo, redMat));
  const engMat = new T.MeshPhongMaterial({ color: 0x8e93a2, specular: 0xffffff, shininess: 90, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.15 });
  const engGeo = lathe(T, [[0, -4.5], [1.5, -4.4], [1.8, -2], [1.8, 3], [1.5, 4.6], [1.2, 4.8], [0, 4.8]], 16); engGeo.rotateX(Math.PI / 2);
  const glowNoz = new T.MeshBasicMaterial({ color: 0xffb040, fog: false });
  const flames = [];
  [-1, 1].forEach(function (s) {
    const e = new T.Mesh(engGeo, engMat); e.position.set(s * 4.2, 0.3, 7.6); hull.add(e);
    const n = new T.Mesh(new T.CircleGeometry(1.25, 16), glowNoz); n.position.set(s * 4.2, 0.3, 12.45); hull.add(n);
    const f = new T.Mesh(new T.ConeGeometry(0.95, 4.4, 12).rotateX(Math.PI / 2), flameMat); f.position.set(s * 4.2, 0.3, 14.7); hull.add(f); flames.push(f);
    const c = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 5, 8).rotateX(Math.PI / 2), darkSteel); c.position.set(s * 6.6, -0.4, -0.5); hull.add(c);   // the cannons
  });
  const engineGlowMat = new T.SpriteMaterial({ map: tex(glowCanvas("rgba(255,160,64,.7)")), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  const shipGlowMat = engineGlowMat.clone(); const engineGlow = new T.Sprite(shipGlowMat); engineGlow.scale.set(11, 6, 1); engineGlow.position.set(0, 0.3, 13.2); hull.add(engineGlow);
  const noseLamp = new T.Mesh(new T.SphereGeometry(0.7, 10, 8), new T.MeshBasicMaterial({ color: 0xff3322 })); noseLamp.position.set(0, 0, -13.9); hull.add(noseLamp);
  // the open cockpit: a rim, a windscreen, the pilot sitting in it
  const rimGeo = new T.TorusGeometry(2.4, 0.42, 8, 24); rimGeo.rotateX(Math.PI / 2); rimGeo.scale(1, 1, 1.5);
  const cockRim = new T.Mesh(rimGeo, darkSteel); cockRim.position.set(0, 2.45, -0.8); hull.add(cockRim);
  const pit = new T.Mesh(new T.CircleGeometry(2.3, 20).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x101219 })); pit.scale.set(1, 1, 1.5); pit.position.set(0, 2.3, -0.8); hull.add(pit);
  const glass = new T.Mesh(new T.SphereGeometry(2.7, 18, 10, 0, Math.PI, 0, Math.PI / 2), new T.MeshPhongMaterial({ color: 0x3ff0ff, transparent: true, opacity: 0.4, specular: 0xffffff, shininess: 140, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.4, depthWrite: false }));
  glass.rotation.y = Math.PI; glass.scale.set(1, 0.85, 0.75); glass.position.set(0, 2.4, -3.6); glass.renderOrder = 7; hull.add(glass);
  const pil = pilotSpec(script);
  const pilotTex = tex(pil.atlas);
  const pilot = makePerson(T, pil.spec, pilotTex);
  pilot.root.scale.setScalar(0.44); pilot.root.rotation.y = Math.PI; pilot.root.position.set(0, -3.2, -0.3);
  hull.add(pilot.root);
  const shipShadow = add(new T.Mesh(unit, decal(new T.MeshBasicMaterial({ map: tex(shipShadowCanvas()), opacity: 0.6, fog: false }), 3)));
  shipShadow.scale.set(21, 1, 26);
  const dropMat = new T.MeshBasicMaterial({ map: tex(dashCanvas(), true), transparent: true, depthWrite: false, fog: false });
  const drop = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 1, 6, 1, true), dropMat); drop.renderOrder = 4; scene.add(drop);

  /* the Haggletron and its stall */
  const boss = makeHaggletron(T, script, tEnv);
  scene.add(boss.root);
  const bossShadow = add(new T.Mesh(unit, shadowMat)); bossShadow.scale.set(90, 1, 50);
  const muzzle = new T.Sprite(new T.SpriteMaterial({ map: tex(glowCanvas("rgba(255,120,200,.8)")), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  muzzle.scale.set(20, 20, 1); muzzle.visible = false; scene.add(muzzle);
  const stall = new T.Group(); scene.add(stall);
  (function () {
    const awn = new T.Mesh(new T.CylinderGeometry(18, 18, 236, 28, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), new T.MeshLambertMaterial({ map: tex(awningCanvas(), true), side: T.DoubleSide }));
    awn.material.map.repeat.set(1, 5); awn.position.set(0, 236, 2); awn.scale.set(1, 0.6, 1); stall.add(awn);
    const back = new T.Mesh(new T.BoxGeometry(236, 240, 4), new T.MeshLambertMaterial({ color: 0x2a1a5e })); back.position.set(0, 120, -16); stall.add(back);
    [-114, 114].forEach(function (x) { const p = new T.Mesh(new T.CylinderGeometry(3.2, 3.6, 236, 12), new T.MeshPhongMaterial({ color: 0xff9b3f, shininess: 80 })); p.position.set(x, 118, 4); stall.add(p); });
    const mh = 64, mw = mh * 1024 / 420;
    const mq = new T.Mesh(new T.PlaneGeometry(mw, mh), marqueeMat("HAGGLETRON'S DEALS")); mq.position.set(0, 180, -13); stall.add(mq);
    const fr = new T.Mesh(new T.BoxGeometry(mw + 5, mh + 5, 1.5), trimMat); fr.position.set(0, 180, -14); stall.add(fr);
    ledBoard(stall, 138, -12, 168);
    const rnd = vrng(99);
    [-1, 1].forEach(function (s) {                          // piles of stock either side
      let y = 0;
      for (let k = 0; k < 7; k++) {
        const w = 26 + rnd() * 14, h = 9 + rnd() * 6, c = BOXC[Math.floor(rnd() * BOXC.length)][0];
        const m = new T.Mesh(roundBox(T, w, h, 22, 1.6), new T.MeshPhongMaterial({ color: c, shininess: 60 }));
        m.position.set(s * (84 + (rnd() - 0.5) * 10), y + h / 2, -2 + (rnd() - 0.5) * 6); m.rotation.y = (rnd() - 0.5) * 0.5; stall.add(m); y += h;
      }
    });
  })();
  stall.visible = false;

  /* vendor booths floating off the right edge, each with a vendor */
  const vSpecs = vendorSpecs(script);
  const awnTex = tex(awningCanvas(), true);
  const booths = [];
  for (let i = 0; i < 3; i++) {
    const vs = vSpecs[i % 2];
    const g = new T.Group(); scene.add(g);
    const plat = new T.Mesh(new T.CylinderGeometry(17, 13, 5, 28), new T.MeshPhongMaterial({ color: 0x2a5fb0, specular: 0x8899cc, shininess: 70 })); plat.position.y = -2.5; g.add(plat);
    const rimM = new T.Mesh(new T.TorusGeometry(17, 0.9, 8, 32).rotateX(Math.PI / 2), trimMat); g.add(rimM);
    const thr = new T.Sprite(engineGlowMat); thr.scale.set(26, 16, 1); thr.position.y = -8; g.add(thr);
    const counter = new T.Mesh(roundBox(T, 9, 9, 18, 1.4), new T.MeshPhongMaterial({ color: 0xffd23f, shininess: 60 })); counter.position.set(-6, 4.5, -10); g.add(counter);
    for (let k = 0; k < 3; k++) { const m = new T.Mesh(roundBox(T, 5, 3.4, 5, 0.7), new T.MeshPhongMaterial({ color: new T.Color(BOXC[(i * 3 + k) % BOXC.length][0]), shininess: 60 })); m.position.set(-6 + (k - 1) * 0.6, 10.7, -10 + (k - 1) * 5.5); g.add(m); }
    [[-12, -12], [-12, 12], [12, -12], [12, 12]].forEach(function (p) { const m = new T.Mesh(new T.CylinderGeometry(0.7, 0.7, 54, 8), antMat); m.position.set(p[0], 27, p[1]); g.add(m); });
    const awn = new T.Mesh(new T.CylinderGeometry(15, 15, 30, 20, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), new T.MeshLambertMaterial({ map: awnTex, side: T.DoubleSide }));
    awn.scale.set(1, 0.45, 1); awn.position.set(0, 54, 0); g.add(awn);
    // the booth sign, hung toward the lane so it reads on the way in
    const sg = new T.Group(); sg.position.set(-15, 45, -2); sg.rotation.y = -Math.PI / 2 + 0.35; g.add(sg);
    const sb = new T.Mesh(roundBox(T, 30, 15, 1.6, 1.2), [trimMat, trimMat, trimMat, trimMat, new T.MeshBasicMaterial({ map: tScript, transparent: true }), trimMat]); sg.add(sb);
    const sbBack = new T.Mesh(new T.PlaneGeometry(29, 14), new T.MeshBasicMaterial({ color: 0x0d1f5c })); sbBack.position.z = 0.7; sbBack.renderOrder = -1; sg.add(sbBack);
    const vt = tex(vs.atlas);
    const fig = makePerson(T, vs.spec, vt);
    fig.root.scale.setScalar(1.45); fig.root.position.set(3, 0, 4); fig.root.rotation.y = -Math.PI / 2 + 0.55;
    g.add(fig.root);
    const fsh = new T.Mesh(unit, shadowMat); fsh.scale.set(16, 1, 16); fsh.position.set(3, 0.2, 4); fsh.renderOrder = 3; g.add(fsh);
    g.visible = false;
    booths.push({ g: g, fig: fig, n: null, seed: i * 1.7 });
  }

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, key: key, rim: rim, script: script, tmp: tmp,
    sky: sky, record: record, spanSets: spanSets, blankets: blankets, items: items, floorMarks: floorMarks, floorKey: "",
    obsMap: new Map(), buildObstacle: buildObstacle, freeObstacle: freeObstacle, zapTime: zapTime,
    pools: pools, makeEnt: makeEnt, tvC: tvC, tvTex: tvTex, discPool: discPool, makeDisc: makeDisc,
    tagPool: tagPool, tagGeo: tagGeo, tagMat: tagMat, misPool: misPool, makeMissile: makeMissile, bolts: bolts, boltGlows: boltGlows,
    sparks: sparks, rings: rings, MAXP: MAXP,
    ship: ship, hull: hull, flames: flames, engineGlow: engineGlow, pilot: pilot, shipShadow: shipShadow, drop: drop,
    boss: boss, bossShadow: bossShadow, muzzle: muzzle, stall: stall, booths: booths, setQuad: setQuad,
    camPos: new T.Vector3(0, 61, 306), camTgt: new T.Vector3(0, 35, 110), camF: -306, camReady: false,
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0, debugCam: null, noHud: false,
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, fx: 2, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
// pr = pixel ratio cap, fx = extras: 2 everything, 1 fewer sparks, 0 no vendors and the fewest sparks
const QUALITY = [{ pr: 2, fx: 2 }, { pr: 1.5, fx: 2 }, { pr: 1.15, fx: 1 }, { pr: 1, fx: 0 }];
function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  R.fx = QUALITY[R.quality].fx;
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
      while (q < QUALITY.length - 1 && Math.min(window.devicePixelRatio || 1, QUALITY[q].pr) === before && QUALITY[q].fx === R.fx) q++;
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
  R.shakeMag = Math.max(mag, R.shakeT > 0 ? R.shakeMag : 0); R.shakeDur = R.shakeT = dur;
}
// World point (f, s, z) -> HUD pixels.
function toScreen(f, s, z) {
  R.tmp.v.set(s, z, -f).project(R.camera);
  return { x: (R.tmp.v.x * 0.5 + 0.5) * W, y: (-R.tmp.v.y * 0.5 + 0.5) * H, ok: R.tmp.v.z > -1 && R.tmp.v.z < 1 };
}

/* ---------------- The attract mode: on the title card the ship flies itself through the front lot ---------------- */
function autopilot(dt) {
  const prev = S.cam;
  S.cam = -260 + (idleT * 70) % 2600;                       // the 2D game's title scroll
  if (S.cam < prev - 100) { R.camReady = false; V.ts = 0; V.tz = 46; }
  let gz = 46, gs = V.ts * 0.98;
  for (let i = 0; i < S.L.obs.length; i++) {
    const o = S.L.obs[i], d = o.f - S.cam;
    if (d < -THICK - 8 || d > 260) continue;
    if (o.t === "wall") gz = o.h + 16;
    else if (o.t === "zap") gz = o.z0 > 0 ? Math.max(ZMIN + 4, o.z0 * 0.5) : o.z1 + 14;
    else if (o.t === "wallzap") gz = (o.h + o.z0) / 2;
    else if (o.t === "gate") { gz = Math.min(36, o.gh * 0.55); gs = (o.a + o.b) / 2; }
    break;
  }
  const k = Math.min(1, dt * 2.6);
  V.ts += (clamp(gs, -SMAX, SMAX) - V.ts) * k; V.tz += (clamp(gz, ZMIN, ZMAX) - V.tz) * k;
}

/* ---------------- Game state -> meshes ---------------- */
function inSpan(a, b) { const sp = S.L.spans; for (let i = 0; i < sp.length; i++) if (a >= sp[i][0] && b <= sp[i][1]) return true; return false; }

function syncFloor(cam) {
  const lo = cam - VIEW_BACK, hi = cam + VIEW_AHEAD;
  let k = 0;
  const sp = S.L.spans;
  for (let i = 0; i < sp.length && k < R.spanSets.length; i++) {
    const a = Math.max(sp[i][0], lo), b = Math.min(sp[i][1], hi);
    if (b <= a) continue;
    const set = R.spanSets[k++], fa = -a, fb = -b, x0 = -HW, x1 = HW, xs = -HW - 5;
    R.setQuad(set.top, [[x0, 0, fa], [x1, 0, fa], [x1, 0, fb], [x0, 0, fb]], [[0, a / 60], [1, a / 60], [1, b / 60], [0, b / 60]], [0, 1, 0]);
    R.setQuad(set.edge, [[x1, 0, fa], [x1, -LOT_D, fa], [x1, -LOT_D, fb], [x1, 0, fb]], [[a / 60, 1], [a / 60, 0], [b / 60, 0], [b / 60, 1]], [1, 0, 0]);
    R.setQuad(set.shelf, [[x0, SHELF_H, fa], [x0, 0, fa], [x0, 0, fb], [x0, SHELF_H, fb]], [[a / 70, 1], [a / 70, 0], [b / 70, 0], [b / 70, 1]], [1, 0, 0]);
    R.setQuad(set.shelfTop, [[xs, SHELF_H, fa], [x0, SHELF_H, fa], [x0, SHELF_H, fb], [xs, SHELF_H, fb]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0]);
    R.setQuad(set.shelfBack, [[xs, SHELF_H, fb], [xs, -LOT_D, fb], [xs, -LOT_D, fa], [xs, SHELF_H, fa]], [[0, 0], [1, 0], [1, 1], [0, 1]], [-1, 0, 0]);
    if (sp[i][0] >= lo) R.setQuad(set.front, [[xs, 0, fa], [xs, -LOT_D, fa], [x1, -LOT_D, fa], [x1, 0, fa]], [[0, 1], [0, 0], [(x1 - xs) / 60, 0], [(x1 - xs) / 60, 1]], [0, 0, 1]);
    else set.front.visible = false;
    if (sp[i][0] >= lo) { /* the shelf ends where the lot does */ }
  }
  for (; k < R.spanSets.length; k++) { const s = R.spanSets[k]; s.top.visible = s.edge.visible = s.front.visible = s.shelf.visible = s.shelfTop.visible = s.shelfBack.visible = false; }

  // blankets and junk, laid out exactly as the 2D game drew them; repainted only when the rows in view change
  const r0 = Math.floor(lo / 60), key = r0 + "|" + sp.length + "|" + sp[sp.length - 1][1];
  if (key !== R.floorKey) {
    R.floorKey = key;
    const T = R.T, m = R.tmp.m, q = R.tmp.q, e = R.tmp.e, p = R.tmp.v, sc = R.tmp.s, c = R.tmp.c;
    let nb = 0, ni = 0;
    for (let f = r0 * 60; f < hi; f += 60) {
      for (let kk = 0; kk < 4; kk++) {
        const hsh = hash(Math.round(f / 60), kk);
        if (hsh > 0.42) continue;
        const s0 = -HW + 6 + kk * 35, f0 = f + 10, f1 = f + 42;
        if (!inSpan(f0, f1) || nb >= R.blankets.instanceMatrix.count) continue;
        q.setFromEuler(e.set(0, (hsh - 0.21) * 0.25, 0)); sc.set(1, 1, 1);
        R.blankets.setMatrixAt(nb, m.compose(p.set(s0 + 12, 0, -(f0 + 16)), q, sc));
        R.blankets.setColorAt(nb, c.set(DECAL[(hsh * 50 | 0) % DECAL.length]));
        nb++;
        for (let it = 0; it < 3 && ni < R.items.instanceMatrix.count; it++) {
          const ff = f0 + 6 + it * 9, ss = s0 + 4 + ((hsh * 1000 + it * 7) % 14);
          q.setFromEuler(e.set(0, hsh * 40 + it, 0)); sc.set(1, 0.6 + ((hsh * 777 + it) % 1) * 0.9, 1);
          R.items.setMatrixAt(ni, m.compose(p.set(ss + 2.5, 0, -(ff + 2.5)), q, sc));
          R.items.setColorAt(ni, c.set(ITEMC[(it + kk) % 4]));
          ni++;
        }
      }
    }
    R.blankets.count = nb; R.items.count = ni;
    R.blankets.instanceMatrix.needsUpdate = R.items.instanceMatrix.needsUpdate = true;
    if (R.blankets.instanceColor) R.blankets.instanceColor.needsUpdate = true;
    if (R.items.instanceColor) R.items.instanceColor.needsUpdate = true;
  }
  // the wordmark painted on the lot every 600 units
  let mk = 0;
  for (let n = Math.ceil((lo - 300) / 600); n * 600 + 300 < hi && mk < R.floorMarks.length; n++) {
    const f = n * 600 + 300;
    if (!inSpan(f - 30, f + 30)) continue;
    const m = R.floorMarks[mk++]; m.visible = true; m.position.set(-4, 0.08, -f);
  }
  for (; mk < R.floorMarks.length; mk++) R.floorMarks[mk].visible = false;
}

function syncObstacles(cam) {
  const lo = cam - VIEW_BACK, hi = cam + VIEW_AHEAD, obs = S.L.obs, keep = new Set();
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (o.f + THICK < lo || o.f > hi) continue;
    keep.add(o);
    if (!R.obsMap.has(o)) R.obsMap.set(o, R.buildObstacle(o));
  }
  R.obsMap.forEach(function (g, o) { if (!keep.has(o)) { R.freeObstacle(g); R.obsMap.delete(o); } });
}

function paintTV() {
  const g = R.tvC.getContext("2d"), im = g.createImageData(64, 48), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const v = vrand() * 200 + 30; d[i] = v * 0.55; d[i + 1] = v; d[i + 2] = v * 1.05; d[i + 3] = 255; }
  g.putImageData(im, 0, 0);
  const y = (R.clock * 40) % 48;
  g.fillStyle = "rgba(63,240,255,.35)"; g.fillRect(0, y, 64, 5);
  R.tvTex.needsUpdate = true;
}

function syncThings(cam, ss, sz, fdt) {
  const lo = cam - VIEW_BACK, hi = cam + VIEW_AHEAD, used = { tank: 0, turret: 0, ears: 0 }, t = R.clock;
  const ents = S.L.ents, shipP = R.tmp.v2.set(ss, sz, -cam);
  let anyTV = false;
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (e.dead || e.f < lo || e.f > hi) continue;
    const pool = R.pools[e.t];
    let g = pool[used[e.t]];
    if (!g) { g = R.makeEnt(e.t); pool.push(g); }
    used[e.t]++;
    g.visible = true; g.position.set(e.s, 0, -e.f);
    if (e.t === "tank") g.rotation.y = e.s * 0.13;
    else if (e.t === "turret") {
      const aim = g.userData.aim;
      aim.lookAt(shipP);
      if (e.recoil > 0) e.recoil -= fdt;
      aim.children[0].position.z = 4.5 - Math.max(0, e.recoil || 0) * 9;
      g.userData.lamp.material.color.set(e.cool < 0.25 && (S.ticks >> 1) % 2 ? 0xff4b3e : 0xffd23f);
    } else { g.userData.ant.rotation.z = Math.sin(t * 3 + e.f) * 0.12; anyTV = true; }
  }
  for (const k in R.pools) for (let i = used[k]; i < R.pools[k].length; i++) R.pools[k][i].visible = false;
  if (anyTV && (S.ticks + Math.floor(t * 60)) % 3 === 0) paintTV();

  /* flying discs */
  const dUsed = [0, 0, 0];
  if (!R.discPool.length) R.discPool.push([], [], []);
  for (let i = 0; i < S.discs.length; i++) {
    const dc = S.discs[i], P = R.discPool[dc.kind];
    let g = P[dUsed[dc.kind]];
    if (!g) { g = R.makeDisc(dc.kind); P.push(g); }
    dUsed[dc.kind]++;
    g.visible = true; g.position.set(dc.s, dc.z, -dc.f);
    g.rotation.set(0.42 + Math.sin(dc.t * 2 + dc.ph) * 0.12, 0, Math.sin(dc.t * 1.3 + dc.ph) * 0.2);
    g.userData.d.rotation.y = dc.spin;
    const sh = g.userData.sh;
    sh.visible = onFloor(dc.f);
    if (sh.visible) { const k = clamp(1 - dc.z / 140, 0.35, 1); sh.position.set(dc.s, 0.22, -dc.f); sh.scale.set(20 * k, 1, 20 * k); }
  }
  for (let k = 0; k < 3; k++) for (let i = dUsed[k]; i < R.discPool[k].length; i++) { R.discPool[k][i].visible = false; R.discPool[k][i].userData.sh.visible = false; }

  /* shots: price tags spin, missiles fly nose first (they leave from the Haggletron's price gun) */
  let nt = 0, nm = 0;
  for (let i = 0; i < S.shots.length; i++) {
    const m = S.shots[i];
    if (m.kind === "missile") {
      let g = R.misPool[nm]; if (!g) { g = R.makeMissile(); R.misPool.push(g); } nm++;
      g.visible = true;
      const age = 4 - m.life;
      g.position.set(m.s, m.z, -m.f);
      if (age < 0.3 && R.gunTip) g.position.lerp(R.gunTip, 1 - age / 0.3);
      R.tmp.v.set(m.s - m.vs, m.z - m.vz, -(m.f - m.vf));
      g.lookAt(R.tmp.v);
      g.userData.fl.scale.set(1, 1, 0.7 + vrand() * 0.6);
    } else {
      let g = R.tagPool[nt]; if (!g) { g = new R.T.Mesh(R.tagGeo, R.tagMat); R.scene.add(g); R.tagPool.push(g); } nt++;
      g.visible = true; g.position.set(m.s, m.z, -m.f);
      const sp = (m.f * 0.37 + m.s * 1.3) % TAU;
      g.rotation.set(0.3, t * 7 + sp, Math.sin(t * 5 + sp) * 0.4);
    }
  }
  for (let i = nt; i < R.tagPool.length; i++) R.tagPool[i].visible = false;
  for (let i = nm; i < R.misPool.length; i++) R.misPool[i].visible = false;

  /* the ship's bolts */
  const nbz = Math.min(S.bullets.length, R.bolts.instanceMatrix.count), mtx = R.tmp.m;
  for (let i = 0; i < nbz; i++) {
    const b = S.bullets[i];
    mtx.makeTranslation(b.s, b.z, -b.f - 4);
    R.bolts.setMatrixAt(i, mtx);
    R.boltGlows[i].visible = true; R.boltGlows[i].position.set(b.s, b.z, -b.f - 9);
  }
  R.bolts.count = nbz; R.bolts.instanceMatrix.needsUpdate = true;
  for (let i = nbz; i < R.boltGlows.length; i++) R.boltGlows[i].visible = false;

  /* sparks and rings */
  const cap = R.fx >= 2 ? R.MAXP : R.fx === 1 ? 320 : 180, np = Math.min(S.parts.length, cap);
  const q = R.tmp.q, e = R.tmp.e, p = R.tmp.v, sc = R.tmp.s, c = R.tmp.c;
  for (let i = 0; i < np; i++) {
    const pt = S.parts[S.parts.length - np + i], k = clamp(pt.life * 2, 0, 1) * pt.sz * 0.8;
    q.setFromEuler(e.set(i * 1.3 + t * 3, i * 0.7, i * 2.1));
    R.sparks.setMatrixAt(i, mtx.compose(p.set(pt.s, pt.z, -pt.f), q, sc.set(k, k, k)));
    R.sparks.setColorAt(i, c.set(pt.c));
  }
  R.sparks.count = np; R.sparks.instanceMatrix.needsUpdate = true;
  if (R.sparks.instanceColor) R.sparks.instanceColor.needsUpdate = true;
  for (let i = 0; i < R.rings.length; i++) {
    const rg = R.rings[i], r = S.rings[i];
    if (!r) { rg.visible = false; continue; }
    const k = r.t / r.max, rad = Math.min(r.r * (0.3 + k) * 0.85, 30);
    rg.visible = true; rg.position.set(r.s, r.z, -r.f); rg.quaternion.copy(R.camera.quaternion);
    rg.scale.set(rad, rad, rad); rg.material.opacity = 1 - k; rg.material.color.set(r.c);
  }
}

/* ---------------- Character poses ---------------- */
function animPilot(J, t, bank, firing, title, pump, falling) {
  J.spine.rotation.set(0.12 + firing * 0.5 - (falling ? 0.25 : 0), Math.sin(t * 0.7) * 0.06, bank * 0.32);
  J.head.rotation.set(-0.08 + Math.sin(t * 1.3) * 0.04 + (falling ? 0.35 : 0), Math.sin(t * 0.55) * 0.35 - bank * 0.35 + (title ? Math.sin(t * 0.4) * 0.5 : 0), 0);
  J.jaw.rotation.x = falling ? 0.45 : pump > 0 ? 0.35 : Math.max(0, Math.sin(t * 2.4)) * 0.04;
  J.brows.position.y = 2.86 + (falling || pump > 0 ? 0.14 : 0);
  arm(J, 0, 0.95, 0.12, 1.25, 0, 0);
  arm(J, 1, 0.95, 0.12, 1.25, 0, 0);
  if (title) arm(J, 1, 0.35, 2.5 + Math.sin(t * 7) * 0.3, 0.65);
  if (pump > 0) arm(J, 0, 0.25, 2.85, 0.5 + Math.sin(t * 14) * 0.2);
  if (falling) { arm(J, 0, 0.4, 2.2 + Math.sin(t * 11) * 0.3, 0.7); arm(J, 1, 0.4, 2.2 + Math.cos(t * 11) * 0.3, 0.7); }
}
function animVendor(J, t, mode, look) {
  const sw = Math.sin(t * 1.7);
  let drop, jaw, bounce = 0;
  if (mode === "cheer") {
    bounce = Math.abs(Math.sin(t * 9));
    drop = crouch(J, 0.22 + bounce * 0.18, 0.22 + bounce * 0.18, PERSON_LEG);
    arm(J, 0, 0.3, 2.55 + Math.sin(t * 9) * 0.2, 0.55); arm(J, 1, 0.3, 2.55 + Math.sin(t * 9 + 1) * 0.2, 0.55);
    jaw = 0.5;
  } else if (mode === "wave") {
    drop = crouch(J, 0.12, 0.2, PERSON_LEG);
    arm(J, 1, 0.35, 2.5 + Math.sin(t * 8) * 0.35, 0.7, 0, 0);
    arm(J, 0, 0.3, 0.3, 1.1);
    jaw = 0.25 + Math.max(0, Math.sin(t * 10)) * 0.2;
  } else {                                                  // haggling: one hand out, palm up, talking
    drop = crouch(J, 0.1 + sw * 0.05, 0.17 - sw * 0.05, PERSON_LEG);
    arm(J, 0, 0.78 + Math.sin(t * 2.3) * 0.22, 0.32, 1.35 + Math.sin(t * 2.3) * 0.2, 0, 0.9);
    arm(J, 1, 0.12, 0.2, 0.55 + Math.sin(t * 1.1) * 0.1);
    jaw = Math.max(0, Math.sin(t * 8.5)) * (Math.sin(t * 0.9) > 0 ? 0.28 : 0.04);
  }
  J.pelvis.position.y = PERSON_HIP - drop + bounce * 0.7;
  J.pelvis.rotation.z = sw * 0.035;
  J.spine.rotation.set(0.04, Math.sin(t * 0.8) * 0.14, -sw * 0.05);
  let hy = look - J.spine.rotation.y;
  while (hy > Math.PI) hy -= TAU; while (hy < -Math.PI) hy += TAU;
  J.head.rotation.set(-0.06 + (mode === "cheer" ? -0.2 : 0), clamp(hy, -0.95, 0.95), Math.sin(t * 1.1) * 0.06);
  J.jaw.rotation.x = jaw;
  J.brows.position.y = 2.86 + (mode === "idle" ? 0 : 0.14);
}
function animBoss(J, B, t, shipS, shipZ, cam, fdt) {
  const dead = B.dead ? Math.min(1, B.dead / 1.6) : 0;
  const st = Math.sin(t * 5) * (1 - dead), up0 = Math.max(0, st), up1 = Math.max(0, -st);
  const dz = B.f - cam, yaw = Math.atan2(shipS - B.s, dz);
  const pitch = Math.atan2(shipZ - 70, dz);
  const k = 0.22 + dead * 0.85;
  const drop = crouch(J, k, k, BOSS_LEG);
  J.hip[0].rotation.x -= up0 * 0.3; J.kn[0].rotation.x += up0 * 0.55;
  J.hip[1].rotation.x -= up1 * 0.3; J.kn[1].rotation.x += up1 * 0.55;
  J.pelvis.position.y = BOSS_HIP - drop + Math.abs(st) * 1.4;
  J.pelvis.rotation.set(0, yaw * 0.15, st * 0.05);
  J.spine.rotation.set(-0.2 * V.flinch + dead * 0.55, yaw * 0.35, -st * 0.04);
  J.head.rotation.set(dead ? dead * 0.5 : clamp(-pitch * 0.6, -0.25, 0.3), dead ? 0 : yaw * 0.5, Math.sin(t * 1.7) * 0.05 * (1 - dead));
  J.jaw.rotation.x = dead ? 0.55 : clamp(V.jaw * 0.6 + (Math.sin(t * 13) > 0.7 ? 0.08 : 0), 0, 0.6);
  J.brows.position.y = 27.6 + V.flinch * 2.6 + dead * 2;
  J.ant.rotation.z = Math.sin(t * 3.1) * 0.12 + st * 0.06; J.ant.rotation.x = Math.sin(t * 2.3) * 0.08 + V.flinch * 0.3;
  J.drawer.position.z = 13 + V.drawer * 8;
  if (dead) {
    arm(J, 0, 0.25 - dead * 0.1, 0.22, 0.4); arm(J, 1, 0.25 - dead * 0.1, 0.22, 0.4);
  } else {
    if (V.jaw > 0.4) arm(J, 0, 1.4, 0.75, 1.7);             // a fist in the air when it shouts a price
    else arm(J, 0, 0.6 + Math.sin(t * 2.2) * 0.15, 0.38, 1.25 + Math.sin(t * 2.2) * 0.2, 0, 0.7);
    const kick = V.muzzle > 0 ? V.muzzle / 0.18 : 0;
    arm(J, 1, 0.55 + clamp(pitch, -0.4, 0.4) * 0.5 + kick * 0.25, 0.3, 0.95 + kick * 0.2, clamp(-yaw * 0.6, -0.5, 0.5), 0);
  }
  J.faceMat.color.setScalar(1 - dead * 0.8);
  paintBossScreen(J, B.hp, B.flash > 0, !!B.dead);
}

/* ---------------- The ship, the Haggletron, the booths, the camera ---------------- */
function syncScene(state, fdt) {
  const idle = state === "title" || state === "over";
  R.clock += fdt;
  const t = R.clock;
  ledTick(fdt);
  R.zapTime.value = t;
  if (state === "title") autopilot(fdt);
  const cam = S.cam, title = state === "title";
  const ss = title ? V.ts : S.s, sz = title ? V.tz : S.z;
  V.jaw = Math.max(0, V.jaw - fdt * 1.4); V.muzzle = Math.max(0, V.muzzle - fdt); V.flinch = Math.max(0, V.flinch - fdt * 4);
  V.drawer = Math.max(0, V.drawer - fdt * 2.2); V.cheer = Math.max(0, V.cheer - fdt); V.pump = Math.max(0, V.pump - fdt); V.firing = Math.max(0, V.firing - fdt);

  syncFloor(cam);
  syncObstacles(cam);
  syncThings(cam, ss, sz, fdt);

  /* the ship */
  const showShip = title || (state !== "over" && !S.dead && !(S.inv > 0 && (S.ticks >> 2) % 2));
  R.ship.visible = showShip;
  R.ship.position.set(ss, sz, -cam);
  const climb = fdt > 0 ? (sz - V.lastZ) / fdt : 0;
  V.lastZ = sz;
  V.climb += (clamp(climb / 72, -1, 1) - V.climb) * Math.min(1, fdt * 8);
  const bank = title ? clamp((V.ts - (R.lastTs == null ? V.ts : R.lastTs)) / Math.max(fdt, 1e-3) / 60, -1, 1) : S.bank;
  R.lastTs = V.ts;
  const sput = S.falling && !title;
  R.hull.rotation.set(V.climb * 0.25 + (sput ? -0.3 + Math.sin(t * 9) * 0.06 : 0), 0, -bank * 0.5 + (sput ? Math.sin(t * 6) * 0.15 : 0));
  for (let i = 0; i < R.flames.length; i++) { const f = R.flames[i]; f.visible = !sput || Math.sin(t * 23 + i) > 0.4; f.scale.set(1, 1, 0.75 + vrand() * 0.5 + (V.firing > 0 ? 0.2 : 0)); }
  R.engineGlow.material.opacity = sput ? 0.2 : 0.6;
  animPilot(R.pilot, t, bank, V.firing > 0 ? 1 : 0, title, V.pump, sput);
  // its shadow on the floor (or on a wall top), and the dashed drop line, so height is easy to read
  let gz = onFloor(cam) ? 0 : null;
  for (let i = 0; i < S.L.obs.length; i++) {
    const o = S.L.obs[i];
    if (cam >= o.f && cam <= o.f + THICK) { if (o.t === "wall" || o.t === "wallzap") gz = o.h; else if (o.t === "gate") gz = (ss >= o.a && ss <= o.b) ? 0 : ZT; }
  }
  const shd = showShip && gz !== null && gz < sz;
  R.shipShadow.visible = R.drop.visible = shd;
  if (shd) {
    const k = clamp(1 - (sz - gz) / 160, 0.45, 1);
    R.shipShadow.position.set(ss + 2, gz + 0.3, -cam - 1); R.shipShadow.scale.set(21 * k * Math.cos(bank * 0.5), 1, 26 * k);
    R.shipShadow.material.opacity = 0.62 * k;
    const len = Math.max(0.01, sz - 2.4 - gz);
    R.drop.position.set(ss, gz + len / 2, -cam); R.drop.scale.set(1, len, 1);
    R.drop.material.map.repeat.set(1, len / 4);
  }

  /* the Haggletron, and its stall rising behind it */
  const B = S.boss;
  if (B && !title) {
    V.rise = Math.min(1, V.rise + fdt / 1.3);
    const u = V.rise, ease = 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2);   // a little overshoot
    const sink = B.dead ? Math.min(1, B.dead / 1.6) * 40 : 0;
    R.boss.root.visible = true;
    R.boss.root.position.set(B.s, -(1 - ease) * 150 - sink, -B.f);
    R.boss.root.rotation.y = 0;
    animBoss(R.boss, B, B.t, ss, sz, cam, fdt);
    R.bossShadow.visible = V.rise > 0.6; R.bossShadow.position.set(B.s, 0.25, -B.f); R.bossShadow.material.opacity = 0.55 * (1 - (B.dead ? Math.min(1, B.dead / 1.6) : 0));
    R.stall.visible = true; R.stall.position.set(0, -(1 - ease) * 260 - (B.dead ? Math.min(1, B.dead / 1.9) * 120 : 0), -(B.f + 85));
    R.boss.gun.updateWorldMatrix(true, false);
    R.gunTip = R.boss.gun.localToWorld(R.tmp.v.set(0, 1.2, 19)).clone();
    R.muzzle.visible = V.muzzle > 0;
    if (R.muzzle.visible) { R.muzzle.position.copy(R.gunTip); const s2 = 10 + 26 * V.muzzle / 0.18; R.muzzle.scale.set(s2, s2, 1); }
  } else {
    R.boss.root.visible = R.bossShadow.visible = R.stall.visible = R.muzzle.visible = false;
    R.gunTip = null;
  }

  /* vendor booths off the right edge */
  const lo = cam - 60, hi = cam + VIEW_AHEAD - 180, want = [];
  for (let n = Math.ceil((lo - BOOTH_PITCH / 2) / BOOTH_PITCH); n * BOOTH_PITCH + BOOTH_PITCH / 2 < hi && want.length < R.booths.length; n++) {
    const f = n * BOOTH_PITCH + BOOTH_PITCH / 2;
    if (f > lo && inSpan(f - 30, f + 30)) want.push(n);
  }
  R.booths.forEach(function (b) { if (want.indexOf(b.n) < 0) b.n = null; });
  want.forEach(function (n) {
    if (R.booths.some(function (b) { return b.n === n; })) return;
    const free = R.booths.find(function (b) { return b.n === null; });
    if (free) free.n = n;
  });
  R.booths.forEach(function (b) {
    const on = b.n !== null;
    b.g.visible = on;
    if (!on) return;
    const f = b.n * BOOTH_PITCH + BOOTH_PITCH / 2, d = f - cam;
    b.g.position.set(BOOTH_S, Math.sin(t * 1.3 + b.n) * 1.5, -f);
    b.fig.root.visible = R.fx > 0;
    if (!b.fig.root.visible) return;
    const mode = (V.cheer > 0 && Math.abs(f - V.cheerF) < 300) ? "cheer" : (!idle && d > -40 && d < 190) ? "wave" : "idle";
    const look = Math.atan2(ss - BOOTH_S, d) - b.fig.root.rotation.y;
    animVendor(b.fig, t + b.seed, mode, look);
  });

  /* the camera */
  syncCamera(state, ss, sz, fdt);
  R.sky.position.copy(R.camera.position);
  R.record.rotation.z += fdt * 0.04;
  R.key.position.set(R.camTgt.x + 90, R.camTgt.y + 170, R.camTgt.z + 120); R.key.target.position.copy(R.camTgt); R.key.target.updateMatrixWorld();
  R.rim.position.set(R.camTgt.x - 140, R.camTgt.y + 50, R.camTgt.z - 220); R.rim.target.position.copy(R.camTgt); R.rim.target.updateMatrixWorld();
}

function syncCamera(state, ss, sz, fdt) {
  const cp = R.camPos, ct = R.camTgt, cam = S.cam;
  if (R.debugCam) {
    cp.fromArray(R.debugCam, 0); ct.fromArray(R.debugCam, 3);
  } else if (state === "over") {
    const a = R.clock * 0.18;
    const gx = Math.sin(a) * 110, gy = 150, gzz = -cam + Math.cos(a) * 110 + 40;
    const k = 1 - Math.exp(-1.5 * fdt);
    cp.lerp(R.tmp.v.set(gx, gy, gzz), k); ct.lerp(R.tmp.v.set(S.s * 0.5, 30, -cam - 80), k);
  } else {
    // the chase camera: behind and a little above the ship, a touch to its right, looking down the fortress
    let cx = ss * 0.72 + 7, cy = sz + 17;
    const cf = cam - 64;
    const obs = S.L.obs;
    function fit(o, x, y) {                                 // the camera may not sit inside a wall it is passing
      if (o.t === "gate") return [clamp(x, o.a + 5, o.b - 5), Math.min(y, o.gh - 5)];
      if (o.t === "wallzap") return [x, clamp(y, o.h + 4, Math.max(o.h + 4, o.z0 - 3))];
      if (o.t === "wall") return [x, Math.max(y, o.h + 4)];
      return [x, y];
    }
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (o.f + THICK < cf - 4 || o.f > cf + 70) continue;
      const r = fit(o, cx, cy); cx = r[0]; cy = r[1];
    }
    if (state === "title" && !Shell.reduced) cx += Math.sin(R.clock * 0.4) * 6;
    const k = !R.camReady ? 1 : 1 - Math.exp(-6 * fdt);
    cp.x += (cx - cp.x) * k; cp.y += (cy - cp.y) * k; cp.z = -cf;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (cf < o.f - 3 || cf > o.f + THICK + 3) continue;
      const r = fit(o, cp.x, cp.y); cp.x = r[0]; cp.y = r[1];
    }
    const tx = ss * 0.62 + 1, ty = sz * 0.55 + 10, tz = -(cam + 170);
    if (!R.camReady) ct.set(tx, ty, tz);
    else { ct.x += (tx - ct.x) * k; ct.y += (ty - ct.y) * k; ct.z = tz; }
    R.camReady = true;
  }
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (vrand() * 2 - 1) * m; sy = (vrand() * 2 - 1) * m;
  }
  R.camera.position.set(cp.x + sx, cp.y + sy, cp.z);
  R.camera.lookAt(ct.x + sx * 0.5, ct.y + sy * 0.5, ct.z);
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
function panel(c, x, y, w, h) {
  rrect(c, x, y, w, h, 7); c.fillStyle = "rgba(8,32,95,.8)"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = "rgba(255,255,255,.85)"; c.stroke();
}
function shipIcon(c, x, y, k) {
  c.fillStyle = "#08205f"; c.beginPath(); c.moveTo(x, y - 7 * k); c.lineTo(x + 7 * k, y + 6 * k); c.lineTo(x, y + 3 * k); c.lineTo(x - 7 * k, y + 6 * k); c.closePath(); c.fill();
  c.fillStyle = "#ffffff"; c.beginPath(); c.moveTo(x, y - 5.5 * k); c.lineTo(x + 5.5 * k, y + 4.5 * k); c.lineTo(x, y + 2 * k); c.lineTo(x - 5.5 * k, y + 4.5 * k); c.closePath(); c.fill();
  c.fillStyle = "#ff4b3e"; c.fillRect(x - 1, y - 1, 2, 3);
}

function drawHUD(c, state) {
  // top bar: score, the wordmark, the high score
  const bg = c.createLinearGradient(0, 0, 0, 44);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, 0, W, 44);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff9214"; c.fillRect(0, 44, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, 46, W, 1);
  txt(c, "SCORE", 10, 5, 9, "#a8ecff", "left", "#08205f");
  txt(c, String(S.score), 10, 18, 17, "#ffffff", "left", "#08205f");
  const hi = Math.max(Shell.best() || 0, S.score);
  txt(c, "HIGH", W - 10, 5, 9, "#a8ecff", "right", "#08205f");
  txt(c, String(hi), W - 10, 18, 17, "#ffe45c", "right", "#08205f");
  drawScript(c, R.script, W / 2, 22, 112, 36);
  if (state === "title") return;
  // progress to the Haggletron, and the ships left
  const prog = clamp((S.cam - S.L.base) / SEG.boss, 0, 1);
  c.fillStyle = "rgba(8,32,95,.85)"; c.fillRect(0, 47, W, 5);
  c.fillStyle = S.phase === "boss" ? "#9bff3f" : "#ff9214"; c.fillRect(0, 47, W * prog, 5);
  for (let l = 0; l < S.lives; l++) shipIcon(c, 16 + l * 18, 64, 1);
  txt(c, "FORTRESS " + (S.loop + 1), W - 10, 57, 9, "#ffffff", "right", "#08205f");

  // altimeter: the next obstacle's blocked heights in red, the safe band in green, the ship's height as an arrow
  const ax = 8, at = 136, ab = 400, ah = ab - at;
  panel(c, ax - 4, at - 20, 30, ah + 40);
  txt(c, "ALT", ax + 11, at - 15, 9, "#a8ecff", "center");
  c.fillStyle = "#12296e"; c.fillRect(ax + 4, at, 8, ah);
  let nx = null;
  for (let i = 0; i < S.L.obs.length; i++) { const o = S.L.obs[i]; if (!o.passed && o.f + THICK - S.cam > -4 && o.f - S.cam < 300) { nx = o; break; } }
  function band(z0, z1, col) { z0 = clamp(z0, 0, ZMAX + 4); z1 = clamp(z1, 0, ZMAX + 4); if (z1 <= z0) return; const y0 = ab - z1 / (ZMAX + 4) * ah, y1 = ab - z0 / (ZMAX + 4) * ah; c.fillStyle = col; c.fillRect(ax + 4, y0, 8, y1 - y0); }
  if (nx) {
    const red = "rgba(255,59,46,.95)", grn = "rgba(155,255,63,.8)";
    if (nx.t === "wall") { band(0, nx.h, red); band(nx.h, ZMAX + 4, grn); }
    else if (nx.t === "zap") { band(nx.z0, nx.z1, red); band(0, nx.z0, grn); band(nx.z1, ZMAX + 4, grn); }
    else if (nx.t === "wallzap") { band(0, nx.h, red); band(nx.h, nx.z0, grn); band(nx.z0, ZMAX + 4, red); }
    else if (nx.t === "gate") { band(0, nx.gh, grn); band(nx.gh, ZMAX + 4, red); }
  }
  c.fillStyle = "rgba(255,255,255,.6)";
  for (let tk = 0; tk <= 100; tk += 20) { const ty = ab - tk / (ZMAX + 4) * ah; c.fillRect(ax, ty, 3, 1); }
  const sy = ab - clamp(S.z, 0, ZMAX) / (ZMAX + 4) * ah;
  c.fillStyle = "#08205f"; c.beginPath(); c.moveTo(ax - 1, sy); c.lineTo(ax + 17, sy - 6.5); c.lineTo(ax + 17, sy + 6.5); c.closePath(); c.fill();
  c.fillStyle = S.falling ? "#ff3b2e" : "#ffe45c"; c.beginPath(); c.moveTo(ax + 1, sy); c.lineTo(ax + 15, sy - 5); c.lineTo(ax + 15, sy + 5); c.closePath(); c.fill();
  txt(c, String(Math.round(S.z)), ax + 11, ab + 5, 9, "#ffffff", "center");

  // fuel gauge
  const fw = 196, fx = W - fw - 14, fy = H - 24, fu = S.fuel / FUEL_MAX, low = S.fuel < 25;
  panel(c, fx - 52, fy - 8, fw + 60, 24);
  txt(c, "FUEL", fx - 44, fy - 2, 11, low && (S.ticks >> 4) % 2 ? "#ff3b2e" : "#a8ecff");
  c.save(); rrect(c, fx, fy - 2, fw, 12, 5); c.clip();
  c.fillStyle = "#12296e"; c.fillRect(fx, fy - 2, fw, 12);
  c.fillStyle = fu > 0.5 ? "#9bff3f" : fu > 0.25 ? "#ffd21f" : "#ff3b2e"; c.fillRect(fx, fy - 2, fw * fu, 12);
  c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(fx, fy - 1, fw * fu, 3);
  c.fillStyle = "rgba(8,32,95,.7)"; for (let q = 1; q < 4; q++) c.fillRect(fx + fw * q / 4, fy - 2, 1.5, 12);
  c.restore();
  if (low && S.fuel > 0 && (S.ticks >> 4) % 2) txt(c, "LOW FUEL", W / 2, H - 54, 14, "#ff3b2e", "center", "#08205f");

  // the Haggletron's price
  const B = S.boss;
  if (B && !B.dead) {
    panel(c, W / 2 - 86, 74, 172, 30);
    txt(c, "HAGGLETRON  $" + Math.max(0, B.hp * 25), W / 2, 78, 10, "#9bff3f", "center");
    c.fillStyle = "#12296e"; c.fillRect(W / 2 - 76, 92, 152, 7);
    c.fillStyle = "#9bff3f"; c.fillRect(W / 2 - 76, 92, 152 * B.hp / B.max, 7);
  }

  // aim reticle ahead of the nose: green when something is lined up
  if (state !== "over" && !S.dead) {
    const am = aimed(), p = am ? toScreen(am[0], am[1], am[2]) : toScreen(S.cam + 110, S.s, S.z);
    // red when the next wall or field is at the ship's height (the same test the ALT meter paints)
    let warn = false;
    if (!am && nx && nx.f - S.cam < 200) {
      const lo = S.z - 3, hi2 = S.z + 3;
      if (nx.t === "wall") warn = lo < nx.h;
      else if (nx.t === "zap") warn = hi2 > nx.z0 && lo < nx.z1;
      else if (nx.t === "wallzap") warn = lo < nx.h || hi2 > nx.z0;
      else if (nx.t === "gate") warn = !(S.s - 7 >= nx.a && S.s + 7 <= nx.b && hi2 < nx.gh);
    }
    if (p.ok) {
      const r = am ? 8 : 6, col = am ? "#9bff3f" : warn ? "#ff3b2e" : "rgba(255,255,255,.55)";
      if (warn) { c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(p.x - 3.5, p.y - 3.5); c.lineTo(p.x + 3.5, p.y + 3.5); c.moveTo(p.x + 3.5, p.y - 3.5); c.lineTo(p.x - 3.5, p.y + 3.5); c.stroke(); }
      c.lineWidth = 2; c.strokeStyle = "rgba(8,32,95,.6)";
      c.beginPath(); c.arc(p.x, p.y, r + 1, 0, TAU); c.stroke();
      c.strokeStyle = col; c.lineWidth = 1.6;
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; c.beginPath(); c.arc(p.x, p.y, r, a - 0.45, a + 0.45); c.stroke(); }
      c.fillStyle = col; c.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
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
  if (!R.noHud) drawHUD(c, state);
}

/* ---------------- Thumb controls (touch): the 2D game's, in candy colors ---------------- */
function buildPads() {
  const st = document.createElement("style");
  st.textContent =
    ".fff-main{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);grid-template-areas:'st'}" +
    ".fff-main>.np-stage{grid-area:st;min-width:0;min-height:0}" +
    ".fff-pad{display:none;align-items:center;justify-content:center;padding:8px 12px calc(10px + env(safe-area-inset-bottom,0px));background:linear-gradient(#0b1a4a,#070d28);touch-action:none;user-select:none;-webkit-user-select:none}" +
    "body.fff-touch .fff-main{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;grid-template-areas:'st st' 'pl pr'}" +
    "body.fff-touch .fff-pad{display:flex}body.fff-touch.fff-over .fff-pad{display:none}body.fff-touch.fff-over .fff-main{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);grid-template-areas:'st'}.fff-l{grid-area:pl;justify-content:flex-start}.fff-r{grid-area:pr;justify-content:flex-end;gap:10px}" +
    ".fff-stick{position:relative;width:150px;height:150px;border-radius:50%;border:3px solid #ffe45c;background:radial-gradient(circle at 50% 40%,#2f7bf0 0,#1b56cf 45%,#0b3aa6 70%,#08205f 100%);box-shadow:inset 0 6px 14px rgba(255,255,255,.18),0 4px 0 #050a22;touch-action:none}" +
    ".fff-stick i{position:absolute;font:900 11px/1 Verdana,Arial,sans-serif;color:#ffffff;font-style:normal;pointer-events:none;text-shadow:0 1px 0 #08205f}" +
    ".fff-stick .u{top:10px;left:50%;transform:translateX(-50%);color:#ffe45c}.fff-stick .d{bottom:10px;left:50%;transform:translateX(-50%);color:#ffe45c}.fff-stick .l{left:10px;top:50%;transform:translateY(-50%)}.fff-stick .r{right:10px;top:50%;transform:translateY(-50%)}" +
    ".fff-knob{position:absolute;left:50%;top:50%;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#ffffff 0,#ffd23f 30%,#ff9214 75%,#c25a0a 100%);border:2px solid #08205f;box-shadow:0 4px 10px rgba(0,0,0,.45);pointer-events:none}" +
    ".fff-fire{width:112px;height:112px;border-radius:50%;border:3px solid #ffe45c;background:radial-gradient(circle at 45% 35%,#ff8a7a 0,#ff3b2e 45%,#b8160f 100%);color:#ffffff;font:900 18px/1 Verdana,Arial,sans-serif;text-shadow:0 2px 0 #6a0a06;box-shadow:inset 0 6px 12px rgba(255,255,255,.3),0 5px 0 #5a0a06;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}" +
    ".fff-fire.on{transform:translateY(3px);box-shadow:inset 0 6px 12px rgba(0,0,0,.3),0 2px 0 #5a0a06;background:radial-gradient(circle at 45% 35%,#ffe45c 0,#ff9214 60%,#c25a0a 100%)}" +
    "@media (orientation:landscape){body.fff-touch .fff-main{grid-template-columns:auto minmax(0,1fr) auto;grid-template-rows:minmax(0,1fr);grid-template-areas:'pl st pr'}" +
    ".fff-pad{padding:6px 10px calc(6px + env(safe-area-inset-bottom,0px))}.fff-stick{width:132px;height:132px}.fff-knob{width:54px;height:54px;margin:-27px 0 0 -27px}.fff-fire{width:96px;height:96px}}" +
    "@media (orientation:portrait) and (max-height:700px){.fff-stick{width:128px;height:128px}.fff-fire{width:96px;height:96px}}";
  document.head.appendChild(st);
  const stage = document.getElementById("np-stage"), main = document.createElement("div");
  main.className = "fff-main";
  stage.parentNode.insertBefore(main, stage);
  main.appendChild(stage);
  const L = document.createElement("div"), Rp = document.createElement("div");
  L.className = "fff-pad fff-l"; Rp.className = "fff-pad fff-r";
  L.innerHTML = '<div class="fff-stick" role="group" aria-label="Steer and altitude"><i class="u">UP</i><i class="d">DOWN</i><i class="l">&lt;</i><i class="r">&gt;</i><div class="fff-knob"></div></div>';
  Rp.innerHTML = '<button class="fff-fire" type="button" aria-label="Fire">FIRE</button>';
  main.appendChild(L); main.appendChild(Rp);
  const stick = L.querySelector(".fff-stick"), knob = L.querySelector(".fff-knob"), fire = Rp.querySelector(".fff-fire");
  let sid = null, fid = null;
  function setStick(ev) {
    const r = stick.getBoundingClientRect(), rad = r.width / 2;
    let dx = (ev.clientX - r.left - rad) / (rad * 0.62), dy = (ev.clientY - r.top - rad) / (rad * 0.62);
    const m = Math.sqrt(dx * dx + dy * dy); if (m > 1) { dx /= m; dy /= m; }
    pad.ax = Math.abs(dx) < 0.18 ? 0 : dx; pad.ay = Math.abs(dy) < 0.18 ? 0 : -dy;
    knob.style.transform = "translate(" + (dx * rad * 0.55) + "px," + (dy * rad * 0.55) + "px)";
  }
  function clearStick() { sid = null; pad.ax = pad.ay = 0; knob.style.transform = ""; }
  stick.addEventListener("pointerdown", function (ev) {
    ev.preventDefault(); if (Shell.state() !== "playing") return;
    sid = ev.pointerId; try { stick.setPointerCapture(sid); } catch (er) { /* ignore */ } setStick(ev);
  });
  stick.addEventListener("pointermove", function (ev) { if (ev.pointerId === sid) setStick(ev); });
  stick.addEventListener("pointerup", function (ev) { if (ev.pointerId === sid) clearStick(); });
  stick.addEventListener("pointercancel", function (ev) { if (ev.pointerId === sid) clearStick(); });
  fire.addEventListener("pointerdown", function (ev) {
    ev.preventDefault(); if (Shell.state() !== "playing") return;
    fid = ev.pointerId; try { fire.setPointerCapture(fid); } catch (er) { /* ignore */ } pad.fire = true; fire.classList.add("on");
  });
  function fireUp(ev) { if (ev.pointerId === fid) { fid = null; pad.fire = false; fire.classList.remove("on"); } }
  fire.addEventListener("pointerup", fireUp); fire.addEventListener("pointercancel", fireUp);
  fire.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
  stick.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
  const q = /[?&]pads=([01])/.exec(location.search);
  const touch = q ? q[1] === "1" : !!(window.matchMedia && (matchMedia("(pointer: coarse)").matches || matchMedia("(hover: none)").matches));
  function setTouch(on) { document.body.classList.toggle("fff-touch", on); window.dispatchEvent(new Event("resize")); }
  setTouch(touch);
  if (!q) window.addEventListener("pointerdown", function (ev) { if (ev.pointerType === "touch" && !document.body.classList.contains("fff-touch")) setTouch(true); }, true);
  window.__fffPads = { clear: function () { clearStick(); pad.fire = false; fid = null; fire.classList.remove("on"); } };
}

/* ---------------- Splash, boot, shell hookup ---------------- */
function makeSplash() {
  const el = document.createElement("div");
  el.id = "npg-splash";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Nostalgia Pro Games");
  el.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;z-index:9999;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;gap:18px;padding:24px;box-sizing:border-box;text-align:center;" +
    "background:radial-gradient(circle at 50% 42%,#3a2a9c 0%,#170d40 52%,#07051a 100%);" +
    "font:bold 15px/1.5 " + HUD_FONT.replace(/"/g, "'") + ";color:#ffffff;opacity:1;transition:opacity .35s ease";
  const img = document.createElement("img");
  img.alt = "";
  img.decoding = "async";
  img.style.cssText = "display:block;width:min(66vw,44vh,340px);height:auto;opacity:0;transform:scale(.86);" +
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "transition:opacity .2s ease" : "transition:opacity .28s ease,transform .55s cubic-bezier(.2,1.5,.4,1)");
  el.appendChild(img);
  const bar = document.createElement("div");
  bar.style.cssText = "width:min(52vw,220px);height:8px;border-radius:4px;background:#0b1a4a;border:2px solid #ffe45c;overflow:hidden";
  const fill = document.createElement("div");
  fill.style.cssText = "width:8%;height:100%;background:linear-gradient(90deg,#ff9214,#ffe45c);transition:width .4s ease";
  bar.appendChild(fill); el.appendChild(bar);
  document.body.appendChild(el);
  return { el: el, img: img, bar: bar, fill: fill };
}
function splashFail(splash, lines) {
  const el = splash.el;
  splash.img.style.width = "min(40vw,26vh,180px)";
  splash.bar.style.display = "none";
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
// No WebGL, or the 3D engine did not load: hand the page to the classic 2D game if it is on the server.
function loadClassic() {
  return new Promise(function (resolve, reject) {
    const s = document.createElement("script");
    s.src = FALLBACK_URL;
    s.onload = function () { if (window.Shell && Shell.state && Shell.state() !== "boot") resolve(); else reject(new Error("classic game did not start")); };
    s.onerror = function () { reject(new Error("no classic game")); };
    document.body.appendChild(s);
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
  hud.style.background = "transparent";                      // the shell canvas becomes a clear HUD layer over the 3D view
  if (getComputedStyle(hud).position === "static") hud.style.position = "relative";
  const crt = stage.querySelector(".np-crt");
  if (crt) crt.style.display = "none";                       // glossy 3D, no scanlines
  R.lastT = performance.now();
  layout();
}
function logoImg(maxH) {
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
  im.style.cssText = "display:block;width:auto;height:" + maxH + ";max-width:70%;margin:0 auto 6px";
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_URL;
  return im;
}

function startGame() {
  Shell.init({
    slug: "flea-fortress-flyby",
    title: "FLEA FORTRESS FLYBY",
    accent: "#ff9b3f",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "A swap meet the size of a moon is floating by, now in real 3D. Fly the Bargain Hunter through it: climb over box walls, slip under force fields, shoot price gun turrets and blast fuel tanks to top off. The Haggletron waits at the far end.",
    keys: "Phone: left thumb steers (up climbs, down dives), right thumb holds FIRE. Keys: arrows or WASD to steer and climb, Space or J to fire. P pause, M mute, N music, R restart.",
    tip: "Watch your shadow and the ALT meter. Green on the meter is the safe height for the next wall.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: function () {},
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { for (const k in keys) keys[k] = false; if (window.__fffPads) window.__fffPads.clear(); }
  });
  attach();
  buildPads();
  Shell.onRestart(function () { padsOff(false); });
  // Sound. Nothing is created until the first tap, click or key press; the band starts with the game.
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Juke.unlock, true); });
  Shell.onStart(Juke.newGame); Shell.onRestart(Juke.newGame); Shell.onResume(Juke.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));   // not while initials are being typed
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Juke.toggleMusic();
  });
  Juke.barButton();
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) { Juke.button(titleCard, titleCard.querySelector(".np-tip")); titleCard.insertBefore(logoImg("clamp(56px,13vh,108px)"), titleCard.firstChild); }
  if (pauseActions) Juke.button(pauseActions, pauseActions.querySelector("a"));
  // the studio logo heads the score card
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) card.insertBefore(logoImg("clamp(64px,14vh,104px)"), card.firstChild);
}

// Hook for automated checks (no effect on play)
window.__fff = { S: function () { return S; }, tick: tick, update: update, pad: pad, keys: keys, buildLevel: buildLevel, aimed: aimed,
  consts: { STEP: STEP, V0: V0, ZMAX: ZMAX, ZMIN: ZMIN, HW: HW, SEG: SEG, FUEL_MAX: FUEL_MAX, DRAIN: DRAIN, THICK: THICK },
  gfx: function () { return R; }, led: function () { return LED; }, view: function () { return V; }, juke: Juke, startMusic: startMusic, toScreen: toScreen,
  internals: { die: die, startBoss: startBoss, bossDown: bossDown, boom: boom, hitEnt: hitEnt },
  frame: function (st, dt) { syncScene(st, dt); R.renderer.render(R.scene, R.camera); }, quality: function (q) { R.qLock = true; setQuality(q); } };

(function boot() {
  const splash = makeSplash();
  const t0 = performance.now();
  const q = /[?&]gfx=(high|low|2d)/.exec(location.search);
  let started = false;
  const step = function (p) { splash.fill.style.width = p + "%"; };
  Promise.all([loadLogo(splash).then(function (r) { step(35); return r; }),
               q && q[1] === "2d" ? Promise.reject(Object.assign(new Error("2D asked for"), { npStage: "webgl" }))
                                  : import(THREE_URL).then(function (m) { step(70); return m; }, function (e) { e.npStage = "three"; throw e; }),
               loadImage(SCRIPT_URL)])
    .then(function (res) {
      THREE = res[1];
      try { R = buildScene(THREE, res[2]); } catch (e) { e.npStage = "webgl"; throw e; }
      if (q) { R.qLock = true; setQuality(q[1] === "low" ? QUALITY.length - 1 : 0); }
      reset();
      step(92);
      try { R.renderer.compile(R.scene, R.camera); } catch (e) { /* warm-up only */ }
      // hold the logo for a beat, then hand over to the title card
      const hold = Math.max(0, 1300 - (performance.now() - t0));
      return new Promise(function (r) { setTimeout(function () { step(100); r(); }, hold); });
    })
    .then(function () {
      started = true;
      startGame();
      splashGone(splash);
    })
    .catch(function (e) {
      console.error(e);
      if (started) return;
      R = null;
      loadClassic().then(function () { splashGone(splash); }, function () {
        splashFail(splash, e && e.npStage === "three"
          ? "Flea Fortress Flyby could not load its 3D engine (" + THREE_URL + ")."
          : "Flea Fortress Flyby needs WebGL for its 3D fortress, and this browser has it switched off or does not support it.");
      });
    });
})();
