/* MALL SANTA DASH '94: LAYAWAY BLITZ (3D cabinet edition, seasonal: christmas, HIDDEN TEST PAGE)
   Christmas Eve, 1994, 5:58 PM at the Mistletoe Mile Mall. Run four stretches of the concourse in 3D
   and reach the toy store before the security grille comes down. Every checkpoint banner adds time,
   arcade style. Bumps never end the run; they cost 3 seconds and break the streak.

   Same slug as the 2D test game (mall-santa-dash), so the trophies (slots 118-126), the high score table
   and the shoe unlocks are shared with it. If WebGL or three.js is missing, the 2D game (game-2d.js) runs.
   Units are meters. Distance S.z runs down the concourse; in the 3D world it is -z. */
import { createCast } from "./figures.js";
const W = 360, H = 540, TAU = Math.PI * 2, SLUG = "mall-santa-dash";
const Sh = window.Shell;
const THREE_URL = "../shared/three.module.min.js";
const FALLBACK_URL = "game-2d.js";
const HUD_FONT = '"Press Start 2P", monospace', UI_FONT = '"Silkscreen", monospace';

/* ---------------- Tuning ---------------- */
const LX = 1.7;                                   // lane spacing
const ZB = [0, 470, 1040, 1620, 2250], LEN = ZB[4];
const ZONES = [
  { name: "THE FOOD COURT", sub: "Gates close at 6:00. Run!", col: "#ffd23f", v0: 9.2, v1: 10.6, ext: 0,
    fog: 0x2a1c3a, floorA: "#2f8f86", floorB: "#e6dcc0", wall: "#efe2c8", trim: "#c2304a", neon: "#ffd23f" },
  { name: "DEPARTMENT STORE", sub: "Perfume counters ahead. Find the clear lane.", col: "#ff3fa4", v0: 10.6, v1: 12.2, ext: 54,
    fog: 0x34183a, floorA: "#c9b8cf", floorB: "#f4eef6", wall: "#f3e8f0", trim: "#7a2a6a", neon: "#ff3fa4" },
  { name: "GRAND ESCALATOR", sub: "Ride the center handrail. Find the fountain.", col: "#3ff0ff", v0: 12.2, v1: 13.4, ext: 50,
    fog: 0x142a3e, floorA: "#2c5a8a", floorB: "#dfe8ef", wall: "#e6eef2", trim: "#1d4f7a", neon: "#3ff0ff" },
  { name: "CENTER COURT", sub: "Santa line. Weave through the ropes.", col: "#9bff3f", v0: 13.4, v1: 15.2, ext: 46,
    fog: 0x1a2a1c, floorA: "#1f5a3a", floorB: "#8a2030", wall: "#f2e9d6", trim: "#1f5a3a", neon: "#9bff3f" }
];
const CLOCK0 = 60, BUMP = 3, INV = 1.0;
const JUMP_T = 0.62, JUMP_H = 1.35, LOW_CLEAR = 0.5, AIR_GRAB = 0.95, LANE_T = 0.12;
const ESC = { z0: 1080, z1: 1190 }, FOUNTAIN_Z = 1430;
const TURBO_T = 2.6, TURBO_K = 1.55;
const TIME_BONUS = 400;
const PTS = { coin: 20, sample: 30, bag: 50, slip: 75, box: 100, piece: 500, token: 2500, cane: 100 };
const STREAK_STEP = 15, MULT_MAX = 4;
const CALLOUTS = ["BARGAIN HUNTER!", "BLACK BELT SHOPPER!", "MAXIMUM ALLOWANCE!", "DOORBUSTER DYNAMO!", "LAYAWAY LEGEND!"];
const BUMP_LINES = ["Excuse me, ma'am!", "Watch the bags!", "Sorry, sir!", "Pardon the elbows!", "Coming through!"];
const COMBO = ["ULTRA-BOT", "JET PACK", "LASER ARM", "BATTLE BASE", "BATTERIES"];
const SHOES = [
  { id: "plain", name: "Plain Sneakers", how: "Ready to go.", col: "#eceae2" },
  { id: "strap", name: "Strap High Tops", how: "Reach the toy store gate once.", col: "#ff3fa4" },
  { id: "lightup", name: "Light-Up Sneakers", how: "Grab 300 items across all your runs.", col: "#3ff0ff" },
  { id: "skates", name: "Neon Inline Skates", how: "Reach the gate with 25 or more seconds left.", col: "#9bff3f" }
];
// made-up stores only (no real brands)
const STORES = [
  ["PRETZEL TWIST", "SODA FOUNTAIN", "TACO HUT 2000", "CORN DOG CORNER", "COOKIE KILN", "EGG ROLL EXPRESS", "SMOOTHIE STOP"],
  ["PERFUME", "MENSWEAR", "HOUSEWARES", "SHOES", "JEWELRY", "LINENS", "COSMETICS"],
  ["VIDEO ARCADE", "TAPE DECK VIDEO", "SOUND WAVE MUSIC", "CARD SHOP", "CANDLE NOOK", "CALENDAR CART", "PHOTO IN 1 HOUR"],
  ["TOYS AND GAMES", "PHOTOS WITH SANTA", "GIFT WRAP", "HOBBY SHOP", "COMIC VAULT", "SWEATER BARN", "FUDGE FACTORY"]
];

let THREE = null, K = null, S = {}, idleT = 0, ptr = null, keys = {};
const CAST = /[?&]cast=(1|hero|santa)/.test(location.search);
const CAST_HERO = /[?&]cast=hero/.test(location.search);
const CAST_SANTA = /[?&]cast=santa/.test(location.search);
let gear = { u: { plain: 1 }, on: "plain", items: 0 };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, k) { return a + (b - a) * k; }
function comma(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function award(id) { if (window.Trophies) window.Trophies.unlock(id); }
function zoneAt(z) { return z < ZB[1] ? 0 : z < ZB[2] ? 1 : z < ZB[3] ? 2 : 3; }
function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }

/* ---------------- Course ---------------- */
const KIND = {
  table: { low: false, dep: 0.75 }, janitor: { low: false, dep: 0.45 }, sign: { low: true, dep: 0.35 },
  walker: { low: false, dep: 0.35, walk: 1.0 }, stroller: { low: true, dep: 0.5 }, bin: { low: true, dep: 0.6 },
  clerk: { low: false, dep: 0.45 }, mist: { low: false, dep: 0.9 }, rope: { low: false, dep: 0.2 },
  cart: { low: false, dep: 0.85, walk: 2.0 }, fountain: { low: true, dep: 1.05 }
};
function build(seed) {
  const r = rng(seed), O = [], I = [];
  let z = 34, lastRope = -1;
  function pick(a) { return a[Math.floor(r() * a.length)]; }
  function ob(t, lane, zz, extra) {
    const o = { t: t, lane: lane, lp: lane, z: zz, z0: zz, low: KIND[t].low, dep: KIND[t].dep, span: 0, walk: KIND[t].walk || 0, seed: r() };
    if (extra) for (const k in extra) o[k] = extra[k];
    O.push(o); return o;
  }
  function covers(o, lane) { return Math.abs(o.lp - lane) < 0.5 || (o.span && Math.abs(o.lp + 1 - lane) < 0.5); }
  function free(lane, zz, rad) {
    for (let k = O.length - 1; k >= 0; k--) { const o = O[k]; if (Math.abs(o.z - zz) < rad + o.dep + (o.walk ? 6 : 0) && covers(o, lane)) return false; }
    return true;
  }
  function line(t, lane, z0, n, step, air) {
    for (let k = 0; k < n; k++) { const zz = z0 + k * step; if (free(lane, zz, 1.0)) I.push({ t: t, lane: lane, z: zz, air: !!air, seed: r() }); }
  }
  function walkers(lane, zz) { for (let w = 0; w < 3; w++) ob("walker", lane, zz + w * 2.0, { club: w }); }
  function inEsc(zz) { return zz > ESC.z0 - 10 && zz < ESC.z1 + 14; }

  while (z < LEN - 30) {
    const ph = zoneAt(z);
    let gap;
    if (inEsc(z)) {                                   // the escalator: center lane is the handrail ride, edges get a few easy things
      if (z < ESC.z1) { ob(pick(["walker", "bin", "stroller"]), r() < 0.5 ? 0 : 2, z); line("coin", 1, z + 1.5, 4, 2.2); }
      z += 13; continue;
    }
    if (Math.abs(z - FOUNTAIN_Z) < 9) {               // center court fountain: jump through the spray for the hidden token
      ob("fountain", 1, FOUNTAIN_Z); I.push({ t: "token", lane: 1, z: FOUNTAIN_Z, air: true, seed: r() });
      line("coin", 0, FOUNTAIN_Z - 3, 3, 2.2); line("coin", 2, FOUNTAIN_Z - 3, 3, 2.2);
      z = FOUNTAIN_Z + 16; continue;
    }
    const a = Math.floor(r() * 3), b = (a + 1 + Math.floor(r() * 2)) % 3, c = 3 - a - b, roll = r();
    if (ph === 0) {                                   // THE FOOD COURT: roomy, one thing at a time
      gap = 15 + r() * 3;
      if (roll < 0.22) ob("table", a, z);
      else if (roll < 0.38) ob("janitor", a, z);
      else if (roll < 0.54) ob("sign", a, z);
      else if (roll < 0.80) walkers(a, z);
      else { ob("walker", a, z); ob("walker", b, z + 0.6); }
      if (r() < 0.6) line("sample", b, z + 4, 3, 2.2); else line("coin", b, z + 4, 4, 2.2);
      if (r() < 0.35) line("coin", c, z + 8, 3, 2.2);
    } else if (ph === 1) {                            // DEPARTMENT STORE CUT-THROUGH
      gap = 12.5 + r() * 2.5;
      if (roll < 0.46) {
        const edge = r() < 0.5 ? 0 : 2, safe = 2 - edge;   // the clerk sprays her lane and the middle one
        ob("clerk", edge, z); ob("mist", Math.min(edge, 1), z, { span: 1, side: edge });
        line(pick(["bag", "coin", "coin"]), safe, z - 2, 3, 2.2);
      } else if (roll < 0.6) { ob("walker", a, z); ob("walker", b, z + 0.5); line("coin", c, z + 3.5, 4, 2.2); }
      else if (roll < 0.74) { walkers(a, z); line("coin", b, z + 1.5, 3, 2.2); gap += 2.5; }
      else if (roll < 0.87) { ob("bin", a, z); if (r() < 0.6) I.push({ t: "slip", lane: a, z: z, air: true, seed: r() }); line("coin", b, z + 3, 3, 2.2); }
      else { ob("stroller", a, z); ob("walker", b, z + 0.3); line(pick(["bag", "coin"]), c, z + 2.5, 3, 2.2); }
      if (r() < 0.25) I.push({ t: "box", lane: c, z: z + 8, air: false, seed: r() });
    } else if (ph === 2) {                            // UPPER CONCOURSE: a bit of everything, faster
      gap = 11.5 + r() * 2.2;
      if (roll < 0.25) { const e = r() < 0.5 ? 0 : 2; ob("clerk", e, z); ob("mist", Math.min(e, 1), z, { span: 1, side: e }); line("coin", 2 - e, z - 2, 3, 2.2); }
      else if (roll < 0.45) { ob("cart", a, z, { shifted: false }); line("coin", a, z + 8, 3, 2.2); gap += 3; }
      else if (roll < 0.62) { walkers(a, z); line("bag", b, z + 1.5, 2, 2.6); gap += 2.5; }
      else if (roll < 0.8) { ob(pick(["bin", "stroller", "sign"]), a, z); I.push({ t: "slip", lane: a, z: z, air: true, seed: r() }); ob("walker", b, z + 4); line("coin", c, z + 1.5, 4, 2.2); }
      else { ob("table", a, z); ob("sign", b, z + 0.2); line("coin", c, z - 1, 4, 2.2); if (r() < 0.5) I.push({ t: "box", lane: c, z: z + 8, air: false, seed: r() }); }
    } else {                                          // CENTER COURT SANTA LINE
      gap = 10.5 + r() * 2;
      if (roll < 0.08) { const e2 = r() < 0.5 ? 0 : 2; ob("clerk", e2, z); ob("mist", Math.min(e2, 1), z, { span: 1, side: e2 }); line("coin", 2 - e2, z - 2, 3, 2.2); }
      else if (roll < 0.38) {                        // velvet rope weave: the gap hops one lane at a time
        let gp = lastRope >= 0 ? lastRope : Math.floor(r() * 3);
        const rows = 3 + Math.floor(r() * 2);
        for (let q = 0; q < rows; q++) {
          const zz = z + q * 9;
          if (gp === 0) ob("rope", 1, zz, { span: 1 }); else if (gp === 2) ob("rope", 0, zz, { span: 1 });
          else { ob("rope", 0, zz); ob("rope", 2, zz); }
          I.push({ t: "coin", lane: gp, z: zz, air: false, seed: r() });
          gp = gp === 1 ? (r() < 0.5 ? 0 : 2) : 1;
        }
        lastRope = -1; gap = rows * 9 + 6;
      } else if (roll < 0.54) { ob("cart", a, z, { shifted: false }); line("coin", a, z + 8, 3, 2.2); gap += 3; }
      else if (roll < 0.66) { ob("walker", a, z); ob("stroller", b, z + 0.3); line(pick(["bag", "box"]), c, z + 2.5, 2, 2.8); }
      else if (roll < 0.78) { walkers(a, z); line("coin", b, z + 1.5, 3, 2.2); gap += 2.5; }
      else { ob(pick(["bin", "stroller"]), a, z); I.push({ t: "slip", lane: a, z: z, air: true, seed: r() }); ob("walker", b, z + 4.5); line("coin", c, z + 1.5, 4, 2.2); }
    }
    z += gap;
  }
  function place(t, zz0, extra) {
    for (let tries = 0; tries < 40; tries++) {
      const ln = Math.floor(r() * 3), zz = zz0 + tries * 1.5;
      if (inEsc(zz) && ln === 1) continue;
      if (Math.abs(zz - FOUNTAIN_Z) < 14) continue;
      if (free(ln, zz, 3.5)) { const it = { t: t, lane: ln, z: zz, air: false, seed: r() }; if (extra) for (const k in extra) it[k] = extra[k]; I.push(it); return; }
    }
  }
  const fr = [0.1, 0.3, 0.52, 0.72, 0.9];
  for (let p = 0; p < 5; p++) place("piece", LEN * fr[p], { idx: p });
  // peppermint rush canes: a short burst of speed, two per stretch
  for (let zi = 0; zi < 4; zi++) for (let q = 0; q < 2; q++) place("cane", lerp(ZB[zi], ZB[zi + 1], q ? 0.7 : 0.3));
  O.sort(function (x, y) { return x.z - y.z; }); I.sort(function (x, y) { return x.z - y.z; });
  return { O: O, I: I };
}

/* ---------------- State ---------------- */
function reset() {
  const c = build(1 + Math.floor(Math.random() * 2147483000));
  S = { t: 0, z: 0, v: 0, lane: 1, lp: 1, swT: -9, swFrom: 1, jumpT: -1, inv: 0, turbo: 0, phase: "count", pt: 0, zone: 0, cn: -1,
        O: c.O, I: c.I, score: 0, items: 0, streak: 0, mult: 1, bumps: 0, samples: 0, pieces: [0, 0, 0, 0, 0],
        walkChain: 0, walkMax: 0, walkPassed: 0, scentChain: 0, clerks: 0, misted: 0, near: 0, nearZ: -999, token: false,
        escRide: 0, esc: false, escDone: false, canes: 0, gate: false, left: CLOCK0, bonus: 0, tag: null, rec: 0, recLine: "",
        stepT: 0, stepN: 0, callN: 0, newShoes: [], ext: [], extT: 9, hitT: 9, grabT: 9, done: false, rcptN: 0, timeWarn: 0, runPh: 0 };
  if (K) K.clearWorld();
}

/* ---------------- Update ---------------- */
function update(dt) {
  S.pt += dt; S.extT += dt; S.hitT += dt; S.grabT += dt;
  if (S.tag) { S.tag.life -= dt; if (S.tag.life <= 0) S.tag = null; }
  if (S.rec > 0) S.rec -= dt;
  if (S.phase === "count") {
    const n = Math.floor(S.pt / 0.6);
    if (n !== S.cn && n <= 3) { S.cn = n; if (n < 3) Sh.tone(440, 0.12, "square", 0.2); else Sh.tone(880, 0.3, "square", 0.22); }
    if (S.pt >= 1.8) { S.phase = "run"; S.pt = 0; S.zone = -1; }
    return;
  }
  if (S.phase === "receipt") {
    const rows = Math.min(10, Math.floor(S.pt / 0.32));
    if (rows > S.rcptN) { S.rcptN = rows; Sh.noise(0.12, 0.18, 3800, 3); Sh.tone(1900 + rows * 40, 0.03, "square", 0.05); }
    if (S.pt > 5) finish();
    return;
  }
  if (S.phase === "gate" || S.phase === "closed") {
    if (S.phase === "gate") { S.v = Math.max(0, S.v - 26 * dt); S.z += S.v * dt; S.lp += (1 - S.lp) * Math.min(1, dt * 3); }
    else { S.v = Math.max(0, S.v - 16 * dt); S.z += S.v * dt; }
    anim(dt);
    if (S.pt > (S.phase === "gate" ? 2.6 : 2.2)) { S.phase = "receipt"; S.pt = 0; S.rcptN = 0; }
    return;
  }

  S.t += dt;
  const zi = zoneAt(S.z);
  if (zi !== S.zone) {
    if (zi > 0) {
      const ad = ZONES[zi].ext; S.left += ad; S.ext.push(ad); S.extT = 0;
      Sh.flash("TIME EXTENDED +" + ad, ZONES[zi].name + ". " + ZONES[zi].sub, ZONES[zi].col, 1600);
      Juke.sfx("extend");
      S.score += 1000 * zi;
    } else Sh.flash(ZONES[0].name, ZONES[0].sub, ZONES[0].col, 1400);
    S.zone = zi;
  }
  const zk = clamp((S.z - ZB[zi]) / (ZB[zi + 1] - ZB[zi]), 0, 1);
  const onEsc = S.z > ESC.z0 && S.z < ESC.z1 && Math.abs(S.lp - 1) < 0.3 && !airborne();
  const target = lerp(ZONES[zi].v0, ZONES[zi].v1, zk) * (onEsc ? 1.9 : 1) * (S.turbo > 0 ? TURBO_K : 1);
  S.v += (target - S.v) * Math.min(1, dt * (onEsc || S.turbo > 0 ? 3 : 1.6));
  escalator(onEsc, dt);
  S.z += S.v * dt;
  if (S.inv > 0) S.inv -= dt;
  if (S.turbo > 0) { S.turbo -= dt; if (S.turbo <= 0) Sh.tone(500, 0.2, "triangle", 0.12, 250); }
  if (S.lp !== S.lane) { const st = dt / LANE_T, d = S.lane - S.lp; S.lp = Math.abs(d) <= st ? S.lane : S.lp + Math.sign(d) * st; }
  if (S.jumpT >= 0) { S.jumpT += dt * (S.drop ? 2.4 : 1); if (S.jumpT >= JUMP_T) { S.jumpT = -1; S.drop = false; step(true); } }
  footsteps(dt);
  anim(dt);

  const h = jumpH();
  for (let i = 0; i < S.O.length; i++) {
    const o = S.O[i];
    if (o.walk && !o.hit) { const dz0 = o.z - S.z; if (dz0 < 70 && dz0 > -3) o.z -= o.walk * dt; }
    const dz = o.z - S.z;
    if (dz < -4) continue;
    if (dz > 90) break;
    if (o.t === "cart") cartAI(o, dz, dt);
    if (o.t === "mist") o.on = dz < 22;
    if (!o.passed && dz < -o.dep - 0.3) passed(o);
    if (o.hit || o.passed || Math.abs(dz) > o.dep + 0.3) continue;
    if (!touches(o, S.lp)) continue;
    if (o.low && h > LOW_CLEAR) continue;
    if (o.t === "mist" && !o.on) continue;
    bump(o);
  }
  for (let i = 0; i < S.I.length; i++) {
    const it = S.I[i], iz = it.z - S.z;
    if (iz < -2) continue;
    if (iz > 3) break;
    if (it.got || Math.abs(iz) > 0.9 || Math.abs(S.lp - it.lane) > 0.45) continue;
    if (it.air ? h < AIR_GRAB : h > 1.0) continue;
    grab(it);
  }
  S.left = Math.max(0, S.left - dt);
  if (S.left < 10 && Math.ceil(S.left) !== S.timeWarn) { S.timeWarn = Math.ceil(S.left); if (S.left > 0) Sh.tone(1320, 0.06, "square", 0.12); }
  if (S.z >= LEN) arrive();
  else if (S.left <= 0) closed();
}
function airborne() { return S.jumpT >= 0; }
function jumpH() { return S.jumpT >= 0 ? Math.sin(Math.PI * clamp(S.jumpT / JUMP_T, 0, 1)) * JUMP_H : 0; }
function touches(o, lane) { return Math.abs(o.lp - lane) < 0.5 || (o.span && Math.abs(o.lp + 1 - lane) < 0.5); }

function cartAI(o, dz, dt) {
  if (!o.shifted && dz < 30 && dz > 9 && o.lane !== S.lane) {
    o.shifted = true; o.to = o.lane + Math.sign(S.lane - o.lane);
    Sh.tone(1400, 0.07, "square", 0.12); Sh.tone(1400, 0.07, "square", 0.12, 0, 0.14);
  }
  if (o.to != null && o.lp !== o.to) { const d = o.to - o.lp, st = dt / 0.7; o.lp = Math.abs(d) <= st ? o.to : o.lp + Math.sign(d) * st; }
}
function escalator(on, dt) {
  if (on && !S.esc) { S.esc = true; Sh.flash("HANDRAIL RIDE!", "Double speed. Stay in the middle.", "#3ff0ff", 900); Sh.sfx("whoosh"); }
  if (on) S.escRide += S.v * dt;
  if (!on && S.esc) {
    S.esc = false;
    if (!S.escDone && S.escRide > (ESC.z1 - ESC.z0) * 0.8) { S.escDone = true; award("msd-escalator"); }
  }
}
function passed(o) {
  o.passed = true;
  if (o.t === "walker") { S.walkPassed++; if (!o.hit) { S.walkChain++; S.walkMax = Math.max(S.walkMax, S.walkChain); if (S.walkChain >= 25) award("msd-walkers"); } }
  if (o.t === "mist") {
    S.clerks++;
    if (!o.hit) { S.scentChain++; if (S.scentChain >= 5) award("msd-scent"); }
  }
  if (!o.hit && !o.low && o.t !== "mist" && touches(o, S.swFrom) && !touches(o, S.lane) && S.t - S.swT <= 0.3 && Math.abs(o.z - S.nearZ) > 2) {
    S.near++; add(250, true);
    S.tag = { text: S.near % 2 ? "PRICE CHECK DODGE!" : "CLOSE SHAVE!", life: 0.9, pts: 1 };
    S.nearZ = o.z;
    Sh.tone(1568, 0.05, "square", 0.16); Sh.tone(2093, 0.08, "square", 0.16, 0, 0.05);
  }
}
function bump(o) {
  o.hit = true;
  if (S.turbo > 0) { o.knock = 1e-3; o.kdir = o.lp < S.lp ? -1 : 1; Sh.sfx("whoosh"); add(100, true); S.tag = { text: "EXCUSE ME!", life: 0.6 }; return; }
  if (o.t === "mist") { S.misted++; S.scentChain = 0; }
  if (o.t === "walker") S.walkChain = 0;
  if (S.inv > 0) return;
  if (o.t !== "mist") { o.knock = 1e-3; o.kdir = o.lp < S.lp ? -1 : 1; }
  S.bumps++; S.left = Math.max(0, S.left - BUMP); S.inv = INV; S.streak = 0; S.mult = 1; S.hitT = 0; S.v *= 0.55;
  const ln = o.t === "mist" ? "Misted! Smells like a department store." : o.t === "fountain" ? "Splash! Shoes are soaked." : o.t === "cart" ? "Mall security says slow down." : BUMP_LINES[S.bumps % BUMP_LINES.length];
  Sh.flash("BUMP! -" + BUMP + " SEC", ln, "#ff4b3e", 800);
  Sh.sfx("hit"); Sh.shake(5, 0.25);
  if (o.t === "mist") Sh.noise(0.5, 0.25, 3000, 0.6, 0, 1200);
  if (o.t === "fountain") Sh.sfx("splash");
}
function add(pts, flat) { S.score += flat ? pts : pts * S.mult; }
function grab(it) {
  it.got = true; it.gotT = 0; S.items++; S.streak++; S.grabT = 0;
  add(PTS[it.t] || 50);
  if (it.t === "sample") { S.samples++; if (S.samples >= 10) award("msd-samples"); }
  if (it.t === "token") { S.token = true; award("msd-fountain"); Sh.flash("FOUNTAIN WISH!", "Found the lucky token. +" + comma(PTS.token * S.mult), "#3ff0ff", 1100); Sh.sfx("score"); }
  if (it.t === "cane") { S.canes++; S.turbo = TURBO_T; Sh.flash("PEPPERMINT RUSH!", "Full speed. Shoppers jump out of your way.", "#ff4b3e", 900); Sh.tone(400, 0.3, "square", 0.16, 1600); }
  if (it.t === "piece") {
    S.pieces[it.idx] = 1;
    const n = piecesGot();
    Sh.flash(COMBO[it.idx] + "!", "Catalog combo " + n + " of 5", "#a77bff", 900);
    Sh.sfx("score");
    if (n === 5) { award("msd-catalog"); add(5000, true); Sh.flash("CATALOG COMBO COMPLETE!", "All 5 pieces. +5,000", "#a77bff", 1300); Juke.sfx("extend"); }
  } else if (it.t !== "token" && it.t !== "cane") Sh.tone(880 + (S.streak % 5) * 140, 0.05, "square", 0.14);
  if (S.streak % STREAK_STEP === 0) {
    S.mult = Math.min(MULT_MAX, 1 + S.streak / STREAK_STEP);
    S.recLine = CALLOUTS[S.callN % CALLOUTS.length]; S.callN++; S.rec = 1.4;
    Sh.flash(S.recLine, "Streak " + S.streak + ". Points x" + S.mult, "#ff3fa4", 1100);
    Sh.tone(523, 0.06, "square", 0.18); Sh.tone(784, 0.06, "square", 0.18, 0, 0.07); Sh.tone(1047, 0.12, "square", 0.18, 0, 0.14);
  }
}
function arrive() {
  S.gate = true; S.phase = "gate"; S.pt = 0;
  S.bonus = Math.round(S.left) * TIME_BONUS; S.score += S.bonus;
  Juke.sfx("gate"); Sh.sfx("crowd");
  award("msd-gate");
  if (S.bumps === 0) award("msd-clean");
  if (S.score >= 50000 && S.left > 30) award("msd-doorbuster");
  unlockShoes();
}
function closed() {
  S.phase = "closed"; S.pt = 0; S.left = 0;
  Sh.sfx("miss"); Sh.noise(1.0, 0.35, 200, 0.7, 0, 90, "lowpass");
  unlockShoes();
}
function unlockShoes() {
  gear.items += S.items;
  const want = { strap: S.gate, lightup: gear.items >= 300, skates: S.gate && S.left >= 25 };
  for (const id in want) if (want[id] && !gear.u[id]) { gear.u[id] = 1; S.newShoes.push(shoeName(id)); }
  saveGear(); paintPicker();
}

/* ---------------- Footwear ---------------- */
function loadGear() {
  let g = null;
  try { g = JSON.parse(Sh.load("gear") || "null"); } catch (e) { g = null; }
  if (!g || typeof g !== "object") g = {};
  if (!g.u || typeof g.u !== "object") g.u = {};
  g.u.plain = 1; g.items = Number(g.items) > 0 ? Number(g.items) : 0;
  if (!g.on || !g.u[g.on]) g.on = "plain";
  return g;
}
function saveGear() { Sh.save("gear", JSON.stringify(gear)); }
function shoeName(id) { for (let i = 0; i < SHOES.length; i++) if (SHOES[i].id === id) return SHOES[i].name; return id; }
function step(land) {
  const s = gear.on;
  if (s === "plain") Sh.noise(0.04, land ? 0.12 : 0.05, 900, 1.2);
  else if (s === "strap") Sh.noise(0.06, land ? 0.14 : 0.07, 2600, 2);
  else if (s === "lightup") Sh.tone(land ? 660 : (S.stepN % 2 ? 1320 : 1760), 0.03, "square", land ? 0.1 : 0.05);
  else Sh.noise(0.16, land ? 0.12 : 0.05, 420, 0.8, 0, 700);
}
function footsteps(dt) {
  if (airborne()) return;
  S.stepT += dt;
  const per = gear.on === "skates" ? 0.42 : clamp(3.2 / Math.max(1, S.v), 0.15, 0.3);
  if (S.stepT >= per) { S.stepT = 0; S.stepN++; step(false); }
}
let picker = null;
function buildPicker() {
  const card = document.querySelector("#np-ov-title .np-card");
  if (!card) return;
  picker = document.createElement("div");
  picker.className = "msd3-shoes";
  picker.setAttribute("role", "group"); picker.setAttribute("aria-label", "Pick your shoes");
  card.insertBefore(picker, card.querySelector("[data-act=start]"));
  picker.addEventListener("click", function (e) {
    e.stopPropagation();
    const b = e.target.closest ? e.target.closest("button[data-shoe]") : null;
    if (!b || b.disabled) return;
    gear.on = b.getAttribute("data-shoe"); saveGear(); paintPicker(); if (K) K.dressHero();
    step(true);
  });
  paintPicker();
}
function paintPicker() {
  if (!picker) return;
  let h = '<p class="msd3-shoes-h">SHOES</p>';
  for (let i = 0; i < SHOES.length; i++) {
    const s = SHOES[i], got = !!gear.u[s.id];
    h += '<button type="button" data-shoe="' + s.id + '"' + (got ? "" : " disabled") + ' aria-pressed="' + (gear.on === s.id) + '" title="' + (got ? s.name : "Locked: " + s.how) + '">' +
      '<i style="background:' + (got ? s.col : "#3a3e4a") + '"></i>' + (got ? s.name : "LOCKED") + "</button>";
  }
  picker.innerHTML = h;
}

/* ---------------- End of run ---------------- */
function mmss(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
function piecesGot() { return S.pieces.reduce(function (a, b) { return a + b; }, 0); }
function finish() {
  if (S.done) return;
  S.done = true;
  const got = piecesGot();
  Sh.gameOver(S.score, { title: S.gate ? "MADE THE TOY STORE" : "GATES ARE DOWN", html:
    row("Reached", S.gate ? "The toy store" : ZONES[zoneAt(S.z)].name.replace(/^THE /, "") + " (" + Math.max(0, Math.round(LEN - S.z)) + " m short)") +
    row("Items grabbed", S.items) + row("Catalog combo", got + " of 5") + row("Close shaves", S.near) + row("Bumps", S.bumps) +
    row("Time left", S.gate ? mmss(S.left) : "0:00") + row("Time bonus", S.gate ? comma(S.bonus) : "Reach the gate to earn it") +
    (S.newShoes.length ? row("New shoes", S.newShoes.join(", ")) : ""),
    stats: { score: S.score, gate: S.gate, bumps: S.bumps, left: Math.round(S.left), items: S.items, samples: S.samples,
             pieces: got, walkers: S.walkPassed, near: S.near, token: S.token, zone: zoneAt(S.z), dist: Math.round(S.z) } });
}
function row(a, b) { return '<div class="np-row"><span>' + a + "</span><b>" + b + "</b></div>"; }

/* ---------------- Input ---------------- */
function move(dir) {
  if (S.phase !== "run") return;
  const to = clamp(S.lane + dir, 0, 2);
  if (to === S.lane) return;
  S.swFrom = S.lane; S.swT = S.t; S.lane = to;
  Sh.tone(520 + to * 90, 0.03, "triangle", 0.1);
}
function jump() {
  if (S.phase !== "run" || airborne()) return;
  S.jumpT = 0; S.drop = false; Sh.tone(330, 0.12, "square", 0.12, 660);
}
function drop() { if (S.phase === "run" && airborne() && S.jumpT > 0.05) S.drop = true; }
function skipReceipt() { if (S.phase === "receipt" && S.pt > 0.8) finish(); }
let touchUI = false;
const PAD = { y: 466, h: 62 };
function padHit(x, y) { if (!touchUI || y < PAD.y || y > PAD.y + PAD.h + 10) return null; return x < 104 ? "L" : x > 256 ? "R" : "J"; }
function pointer(type, x, y, e) {
  if (e && e.pointerType === "touch") touchUI = true;
  if (type === "down") {
    if (S.phase === "receipt") { skipReceipt(); return; }
    const p = padHit(x, y);
    if (p) { if (K) K.pad = { k: p, t: 0 }; if (p === "L") move(-1); else if (p === "R") move(1); else jump(); ptr = null; return; }
    ptr = { x: x, y: y, done: false }; return;
  }
  if (!ptr) return;
  const dx = x - ptr.x, dy = y - ptr.y;
  if (type === "move" && !ptr.done) {
    if (dy < -26 && Math.abs(dy) > Math.abs(dx)) { ptr.done = true; jump(); }
    else if (dy > 30 && Math.abs(dy) > Math.abs(dx)) { ptr.done = true; drop(); }
    else if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) { ptr.done = true; move(dx < 0 ? -1 : 1); }
  } else if (type === "up") {
    if (!ptr.done) move(ptr.x < W / 2 ? -1 : 1);
    ptr = null;
  } else if (type === "cancel") ptr = null;
}
function key(type, code, e) {
  keys[code] = type === "down";
  if (type !== "down" || (e && e.repeat)) return;
  if (code === "ArrowLeft" || code === "KeyA") move(-1);
  else if (code === "ArrowRight" || code === "KeyD") move(1);
  else if (code === "Space" || code === "ArrowUp" || code === "KeyW") { if (S.phase === "receipt") skipReceipt(); else jump(); }
  else if (code === "ArrowDown" || code === "KeyS") drop();
  else if (code === "Enter") skipReceipt();
}

/* ---------------- Music: Jingle Bells (public domain, 1857) as a chip tune ----------------
   Speeds up a notch at every checkpoint, like a real cabinet. Music on/off is remembered (N key). */
const MUSIC_KEY = "npArcade.music";
const SONG = (function () {
  const V = ["D4-2 B4-2 A4-2 G4-2", "D4-6 D4-1 D4-1", "D4-2 B4-2 A4-2 G4-2", "E4-8", "E4-2 C5-2 B4-2 A4-2", "Fs4-8", "D5-2 D5-2 C5-2 A4-2", "B4-8",
    "D4-2 B4-2 A4-2 G4-2", "D4-8", "D4-2 B4-2 A4-2 G4-2", "E4-6 E4-2", "E4-2 C5-2 B4-2 A4-2", "D5-2 D5-2 D5-2 D5-2", "E5-2 D5-2 C5-2 A4-2", "G4-4 D5-4"];
  const C = ["B4-2 B4-2 B4-4", "B4-2 B4-2 B4-4", "B4-2 D5-2 G4-3 A4-1", "B4-8", "C5-2 C5-2 C5-3 C5-1", "C5-2 B4-2 B4-2 B4-1 B4-1", "B4-2 A4-2 A4-2 B4-2", "A4-4 D5-4",
    "B4-2 B4-2 B4-4", "B4-2 B4-2 B4-4", "B4-2 D5-2 G4-3 A4-1", "B4-8", "C5-2 C5-2 C5-3 C5-1", "C5-2 B4-2 B4-2 B4-1 B4-1", "D5-2 D5-2 C5-2 A4-2", "G4-8"];
  const CH = "G G G C C D D G G G G C C D D G G G G G C G A D G G G G C G D G".split(" ");
  const ROOT = { G: 43, C: 48, D: 50, A: 45 }, TRI = { G: [55, 59, 62], C: [55, 60, 64], D: [54, 57, 62], A: [55, 57, 61] };
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const lead = new Array(256).fill(null);
  V.concat(C).forEach(function (bar, b) {
    let s = 0;
    bar.split(" ").forEach(function (tok) {
      const m = /^([A-G])(s?)(\d)-(\d)$/.exec(tok);
      if (m) { lead[b * 8 + s] = [12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] ? 1 : 0), Number(m[4])]; s += Number(m[4]); }
    });
  });
  return { lead: lead, ch: CH, root: ROOT, tri: TRI };
})();
const Juke = (function () {
  let A = null, dead = false, muted = false, playing = false, nextT = 0, stepI = 0;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  const buttons = [];
  function shellMuted() {
    const b = document.getElementById("np-mute");
    if (b) return b.getAttribute("aria-pressed") === "true";
    try { return localStorage.getItem("npArcade.muted") === "1"; } catch (e) { return false; }
  }
  function unlock() {
    if (dead) return;
    try {
      if (!A) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        const c = new AC();
        A = { c: c, out: c.createGain(), music: c.createGain(), sting: c.createGain() };
        const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
        A.out.connect(comp); comp.connect(c.destination);
        A.music.gain.value = 0.13; A.music.connect(A.out);
        A.sting.gain.value = 0.2; A.sting.connect(A.out);
        const len = Math.floor(c.sampleRate * 0.5); A.nb = c.createBuffer(1, len, c.sampleRate);
        const d = A.nb.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        muted = shellMuted(); A.out.gain.value = muted ? 0 : 1;
        setInterval(pump, 90);
      }
      if (A.c.state !== "running") { const p = A.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { A = null; dead = true; }
  }
  function o(dest, f, t, dur, vol, type, f1) {
    const os = A.c.createOscillator(), g = A.c.createGain();
    os.type = type || "square"; os.frequency.setValueAtTime(f, t); if (f1) os.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.setValueAtTime(vol, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    os.connect(g); g.connect(dest); os.start(t); os.stop(t + dur + 0.03);
  }
  function hiss(t, dur, vol, f, type, q) {
    const s = A.c.createBufferSource(), fl = A.c.createBiquadFilter(), g = A.c.createGain();
    s.buffer = A.nb; fl.type = type || "highpass"; fl.frequency.value = f; fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(A.music); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.05);
  }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function tempo() { const z = S && S.zone > 0 ? S.zone : 0; return 0.205 / (1 + z * 0.06); }
  function playStep(i, t, st) {
    const s = i & 7, bar = i >> 3, ch = SONG.ch[bar], n = SONG.lead[i];
    if (n) { o(A.music, hz(n[0] + 12), t, st * n[1] * 0.95, 0.22, "square"); o(A.music, hz(n[0] + 12) * 1.004, t, st * n[1] * 0.9, 0.08, "square"); }
    if (s % 2 === 0) o(A.music, hz(SONG.root[ch] + (s === 2 || s === 6 ? 7 : 0)), t, st * 1.8, 0.3, "triangle");
    if (s % 2 === 1) { const tri = SONG.tri[ch]; for (let k = 0; k < 3; k++) o(A.music, hz(tri[k]), t, st * 0.5, 0.035, "square"); }
    if (s === 0 || s === 4) o(A.music, 150, t, 0.12, 0.5, "sine", 45);
    if (s === 2 || s === 6) hiss(t, 0.12, 0.22, 1800, "bandpass", 0.8);
    for (let k = 0; k < 2; k++) hiss(t + k * 0.012, 0.06, 0.06, 7000 + k * 1500, "bandpass", 8);   // sleigh bells
  }
  function pump() {
    if (!A || !window.Shell) return;
    const m = shellMuted();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, A.c.currentTime, 0.02); }
    const st = Shell.state();
    const want = musicOn && !muted && A.c.state === "running" && st === "playing" && S && S.phase !== "receipt" && S.phase !== "closed";
    if (want && !playing) { playing = true; stepI = 0; nextT = A.c.currentTime + 0.05; }
    if (!want) { playing = false; return; }
    try {
      while (nextT < A.c.currentTime + 0.35) { const sl = tempo(); playStep(stepI % 256, nextT, sl); nextT += sl; stepI++; }
    } catch (e) { /* sound is never worth a crash */ }
  }
  function sfx(name) {
    if (!A || muted || A.c.state !== "running") return;
    const t = A.c.currentTime + 0.01;
    try {
      if (name === "extend") { [72, 76, 79, 84].forEach(function (mm, i) { o(A.sting, hz(mm), t + i * 0.08, 0.14, 0.24); }); o(A.sting, hz(88), t + 0.34, 0.5, 0.16, "triangle"); }
      else if (name === "gate") { [67, 72, 76, 79, 84, 79, 84, 88].forEach(function (mm, i) { o(A.sting, hz(mm), t + i * 0.1, 0.18, 0.22); }); o(A.sting, hz(91), t + 0.85, 0.9, 0.18, "triangle"); }
    } catch (e) { /* ignore */ }
  }
  function label() { for (let i = 0; i < buttons.length; i++) { buttons[i].textContent = musicOn ? "MUSIC: ON" : "MUSIC: OFF"; buttons[i].setAttribute("aria-pressed", musicOn ? "true" : "false"); } }
  function setMusic(on) { musicOn = !!on; try { localStorage.setItem(MUSIC_KEY, musicOn ? "1" : "0"); } catch (e) { /* private mode */ } label(); pump(); }
  function button(parent, before) {
    if (!parent) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-btn"; b.setAttribute("data-np-music", "");
    b.style.cssText = "width:100%;margin-top:8px";
    b.addEventListener("click", function (e) { e.stopPropagation(); unlock(); setMusic(!musicOn); });
    parent.insertBefore(b, before || null);
    buttons.push(b); label();
  }
  return { unlock: unlock, pump: pump, sfx: sfx, button: button,
    newGame: function () { unlock(); playing = false; pump(); },
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    peek: function () { return { made: !!A, state: A ? A.c.state : "none", playing: playing, muted: muted, musicOn: musicOn }; } };
})();

/* ---------------- Canvas textures ---------------- */
function mkCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function bold(px) { return "900 " + px + 'px "Arial Black", "Arial Bold", Verdana, sans-serif'; }
function floorCanvas(a, b) { return window.MSDPix.floorTile(a, b); }
function wallCanvas(zn) { return window.MSDPix.wallTile(zn); }
function ceilCanvas() { return window.MSDPix.ceilTile(); }
function signCanvas(name, bg, fg) { return window.MSDPix.signCard(name, bg, fg); }
function bannerCanvas(top, mid) { return window.MSDPix.bannerCard(top, mid); }
function textPanel(lines, bg, fg) { return window.MSDPix.panel(lines, bg, fg); }
function teeCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.fillStyle = "#f4f1ea"; g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#c2304a"; g.font = bold(40); g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("NP", 64, 60);
  g.fillStyle = "#1f5a3a"; g.fillRect(30, 86, 68, 6);
  return c;
}
function stripeCanvas(a, b, n) {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  g.fillStyle = a; g.fillRect(0, 0, 64, 64); g.fillStyle = b;
  for (let i = -64; i < 128; i += 64 / n) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32 / n, 0); g.lineTo(i + 32 / n + 32, 64); g.lineTo(i + 32, 64); g.closePath(); g.fill(); }
  return c;
}
function boxArtCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.fillStyle = "#2a1d6a"; g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#ffd23f"; g.fillRect(6, 6, 116, 22); g.fillStyle = "#c2304a"; g.font = bold(15); g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("ULTRA-BOT", 64, 18);
  g.fillStyle = "#9aa6c0"; g.fillRect(48, 40, 32, 30); g.fillRect(40, 72, 48, 34); g.fillStyle = "#3ff0ff"; g.fillRect(54, 50, 8, 6); g.fillRect(66, 50, 8, 6);
  g.fillStyle = "#ff4b3e"; g.fillRect(28, 76, 10, 26); g.fillRect(90, 76, 10, 26);
  g.fillStyle = "#ffffff"; g.font = bold(10); g.fillText("ACTION FIGURE", 64, 116);
  return c;
}

/* ---------------- The 3D kit ---------------- */
function buildKit(T) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: false, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: /[?&]shots=1/.test(location.search) });
  renderer.setClearColor(0x120e22, 1);
  function tex(canvas, rx, ry) {
    const t = new T.CanvasTexture(canvas); t.colorSpace = T.SRGBColorSpace;
    t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.generateMipmaps = false;
    if (rx) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry || rx); }
    return t;
  }
  const scene = new T.Scene();
  scene.fog = new T.Fog(ZONES[0].fog, 34, 92);
  scene.background = new T.Color(ZONES[0].fog);
  const cam = new T.PerspectiveCamera(66, W / H, 0.1, 140);
  const hemi = new T.HemisphereLight(0xfff4e4, 0x3a2848, 0.85); scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff6ea, 1.15); sun.position.set(-4, 10, -6); scene.add(sun); scene.add(sun.target);
  const fill = new T.DirectionalLight(0xffe7c4, 0.9); scene.add(fill); scene.add(fill.target);
  const rim = new T.DirectionalLight(0xffb7d0, 0.28); rim.position.set(6, 4, 2); scene.add(rim);
  const Cast = createCast(T);

  const G = { box: new T.BoxGeometry(1, 1, 1), cyl: new T.CylinderGeometry(1, 1, 1, 10), cyl6: new T.CylinderGeometry(1, 1, 1, 6),
    cone: new T.ConeGeometry(1, 1, 8), sph: new T.SphereGeometry(1, 10, 7), ico: new T.IcosahedronGeometry(1, 0),
    plane: new T.PlaneGeometry(1, 1), tor: new T.TorusGeometry(1, 0.18, 6, 14, Math.PI), coin: new T.CylinderGeometry(1, 1, 0.16, 12),
    oct: new T.CylinderGeometry(1, 1.05, 1, 8) };
  const mats = {};
  function M(col, o) {
    const key = col + JSON.stringify(o || {});
    if (mats[key]) return mats[key];
    const m = new T.MeshBasicMaterial({
      color: new T.Color(col),
      transparent: !!(o && o.transparent),
      opacity: o && o.opacity != null ? o.opacity : 1,
      depthWrite: !(o && o.depthWrite === false)
    });
    mats[key] = m; return m;
  }
  function part(parent, geo, mat, sx, sy, sz, x, y, z) {
    const m = new T.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x || 0, y || 0, z || 0); parent.add(m); return m;
  }
  function grp(parent, x, y, z) { const g = new T.Group(); g.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(g); return g; }

  /* people: the same sculpted rig as the live arcade figures */
  const SKIN = ["#f1c28e", "#c98a5a", "#8a5a3a", "#f6d5b0", "#b07850"];
  const person = Cast.person, pose = Cast.pose;

  /* hero: cream NP tee, cargo shorts, Christmas beanie, seen from behind */
  const heroRoot = grp(scene, 0, 0, 0);
  const hero = person({ view: "back", tee: true, pants: "#9a8a5a", shorts: true, sleeves: "short", hat: "beanie", hatc: "#c2304a", skin: "#f1c28e", hair: "#5a3a20", hairStyle: "short", pockets: true, wheels: true, shoes: "#eceae2", sole: "#c2304a" });
  heroRoot.add(hero.g);
  const shadow = new T.Mesh(new T.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2), M("#000000", { basic: 1, transparent: true, opacity: 0.4, depthWrite: false }));
  shadow.position.y = 0.012; scene.add(shadow);
  function dressHero() {
    hero.setShoes(gear.on);
    if (gear.on === "lightup") hero.shoeL.material[0].emissive.setHex(0x2fd0ff);
    if (hero.wheels) for (let i = 0; i < hero.wheels.length; i++) hero.wheels[i].visible = gear.on === "skates";
  }

  /* Mall Santa, seated in center court, off the lanes so he never collides */
  const santa = person({ shirt: "#c2304a", pants: "#8e1c2c", coat: true, fur: true, belly: true, mittens: "#fff6ee", sleeves: "long", hat: "santa", boots: true, belt: 0x1a120c, beard: true, hairStyle: "bald", skin: "#f1c28e", bulk: 1.05, scale: 1.05, mouth: "smile", browTilt: 0.15, shoes: "#1a120c", sole: "#e8e0d0" });
  const throne = grp(scene, -3.45, 0, -(ZB[3] + 70));
  santa.g.position.set(0, 0, 0.05);
  throne.add(santa.g);
  const GIFT = ["#3f7fd0", "#c2304a", "#1f6a3a", "#ffd23f"];
  for (let k = 0; k < 4; k++) {
    const gift = Cast.billboard(window.MSDPix.prop("gift", { col: GIFT[k] }), 0.42);
    gift.position.set(-0.7 + (k % 2) * 1.4, 0, 0.55 + Math.floor(k / 2) * 0.28);
    throne.add(gift);
  }

  /* corridor segments (12 m each, recycled ahead of the runner) */
  const SEGL = 12, NSEG = 10;
  const floorMats = ZONES.map(function (z) { return new T.MeshBasicMaterial({ map: tex(floorCanvas(z.floorA, z.floorB), 8, 10) }); });
  const wallMats = ZONES.map(function (z) { return new T.MeshBasicMaterial({ map: tex(wallCanvas(z)) }); });
  const ceilMat = new T.MeshBasicMaterial({ map: tex(ceilCanvas(), 4, 4) });
  const signMats = STORES.map(function (list, zi) {
    const pal = [["#120f22", ZONES[zi].neon], ["#1d2b53", "#ffffff"], ["#7a1f2b", "#ffd23f"], ["#1f5a3a", "#ffffff"]];
    return list.map(function (n, i) { const p = pal[i % pal.length]; return new T.MeshBasicMaterial({ map: tex(signCanvas(n, p[0], p[1])) }); });
  });
  const floorGeo = new T.PlaneGeometry(10, SEGL).rotateX(-Math.PI / 2);
  const wallGeo = new T.PlaneGeometry(SEGL, 7);
  const ceilGeo = new T.PlaneGeometry(10, SEGL).rotateX(Math.PI / 2);
  const signGeo = new T.PlaneGeometry(5, 0.9);
  const segs = [];
  const ORN = ["#ff4b3e", "#ffd23f", "#3ff0ff", "#9bff3f", "#ff3fa4", "#ffffff"];
  for (let i = 0; i < NSEG; i++) {
    const g = grp(scene);
    const f = new T.Mesh(floorGeo, floorMats[0]); g.add(f);
    const wl = new T.Mesh(wallGeo, wallMats[0]); wl.position.set(-5, 3.5, 0); wl.rotation.y = Math.PI / 2; g.add(wl);
    const wr = new T.Mesh(wallGeo, wallMats[0]); wr.position.set(5, 3.5, 0); wr.rotation.y = -Math.PI / 2; g.add(wr);
    const ce = new T.Mesh(ceilGeo, ceilMat); ce.position.y = 7; g.add(ce);
    const sl = new T.Mesh(signGeo, signMats[0][0]); sl.position.set(-4.88, 3.45, 0); sl.rotation.y = Math.PI / 2; g.add(sl);
    const sr = new T.Mesh(signGeo, signMats[0][1]); sr.position.set(4.88, 3.45, 0); sr.rotation.y = -Math.PI / 2; g.add(sr);
    const orn = [];
    for (let k = 0; k < 3; k++) {
      const b = Cast.billboard(window.MSDPix.prop("bauble", { col: ORN[(k + i) % 6] }), 0.38, "mid");
      b.position.set(-2.6 + k * 2.6, 6.15 - (k % 2) * 0.25, -3 + k * 3);
      g.add(b);
      orn.push(b);
    }
    for (let s = -1; s <= 1; s += 2) {
      const wr = Cast.billboard(window.MSDPix.prop("wreath"), 0.95, "mid");
      wr.position.set(s * 4.72, 4.45, 0);
      g.add(wr);
    }
    const tree = Cast.billboard(window.MSDPix.prop("tree"), 2.4);
    tree.position.set(4.35, 0, 5); g.add(tree);
    const big = Cast.billboard(window.MSDPix.prop("bigTree"), 5.2);
    big.position.set(-3.7, 0, 0); big.visible = false; g.add(big);
    segs.push({ g: g, f: f, wl: wl, wr: wr, sl: sl, sr: sr, orn: orn, big: big, tree: tree, k: -999 });
  }

  /* set pieces: checkpoint banners, the escalator, the toy store */
  for (let zi = 1; zi < 4; zi++) {
    const b = grp(scene, 0, 0, -ZB[zi]);
    const pm = new T.MeshBasicMaterial({ map: tex(bannerCanvas("TIME EXTENDED", ZONES[zi].name, ZONES[zi].col)), side: T.DoubleSide });
    part(b, G.plane, pm, 7.4, 2.3, 1, 0, 5.2, 0);
    part(b, G.box, M("#ffd23f"), 0.12, 7, 0.12, -3.8, 3.5, 0); part(b, G.box, M("#ffd23f"), 0.12, 7, 0.12, 3.8, 3.5, 0);
    for (let k = 0; k < 9; k++) {
    const bulb = Cast.billboard(window.MSDPix.prop("bauble", { col: ORN[k % 6] }), 0.28, "mid");
    bulb.position.set(-3.6 + k * 0.9, 3.95, 0.1);
    b.add(bulb);
  }
  }
  const escL = ESC.z1 - ESC.z0;
  const esc = grp(scene, 0, 0, -(ESC.z0 + ESC.z1) / 2);
  const stepTex = tex(stripeCanvas("#3a3e4a", "#5a5f70", 2), 1, escL / 0.8);
  const escTread = part(esc, G.box, new T.MeshBasicMaterial({ map: stepTex }), 1.3, 0.06, escL, 0, 0.03, 0);
  for (let s = -1; s <= 1; s += 2) {
    part(esc, G.box, M("#20232c"), 0.14, 0.9, escL, s * 0.78, 0.45, 0);
    part(esc, G.box, M("#111111"), 0.18, 0.08, escL, s * 0.78, 0.94, 0);
    part(esc, G.box, M("#3ff0ff", { emissive: "#106070" }), 0.05, 0.05, escL, s * 0.86, 0.15, 0);
  }
  const escSign = grp(scene, 0, 0, -ESC.z0 + 3);
  part(escSign, G.plane, new T.MeshBasicMaterial({ map: tex(bannerCanvas("CENTER LANE", "HANDRAIL RIDE", "#3ff0ff")), side: T.DoubleSide }), 4.6, 1.45, 1, 0, 5.3, 0);
  const store = grp(scene, 0, 0, -LEN - 1.1);          // the toy store: grille line at LEN + 1, shop floor behind it
  part(store, G.box, M("#2b1d4a"), 10, 3, 0.4, 0, 5.5, 0.3);
  part(store, G.box, new T.MeshBasicMaterial({ map: tex(signCanvas("TOYS AND GAMES", "#120f22", "#ff3fa4")) }), 8, 1.4, 0.2, 0, 5.4, 0.55);
  part(store, G.box, M("#ffe9a0", { basic: 1 }), 10, 7, 0.2, 0, 3.5, -10);
  const boxArt = new T.MeshBasicMaterial({ map: tex(boxArtCanvas()) });
  for (let k = 0; k < 7; k++) part(store, G.box, k === 3 ? boxArt : M(ORN[k % 6]), k === 3 ? 1.2 : 0.7, k === 3 ? 1.5 : 0.8 + (k % 3) * 0.2, 0.4, -3.3 + k * 1.1, k === 3 ? 0.9 : 0.5, -9.4);
  for (let s = -1; s <= 1; s += 2) for (let q = 0; q < 3; q++) { part(store, G.box, M("#5a3a20"), 0.6, 0.08, 6, s * 4.4, 0.8 + q * 0.9, -5); for (let k = 0; k < 6; k++) part(store, G.box, M(ORN[(k + q) % 6]), 0.4, 0.5, 0.5, s * 4.4, 1.1 + q * 0.9, -7.5 + k * 1.0); }
  const grille = grp(store, 0, 0, 0);
  for (let k = 0; k < 14; k++) part(grille, G.box, M("#9aa0aa"), 9.6, 0.1, 0.06, 0, 0.2 + k * 0.28, 0.1);
  for (let k = 0; k < 12; k++) part(grille, G.box, M("#6a7080"), 0.05, 3.9, 0.08, -4.6 + k * 0.84, 2.0, 0.1);
  grille.position.y = 3.8;

  /* snow drifting down from the skylights */
  const NSNOW = 240, snowPos = new Float32Array(NSNOW * 3);
  for (let i = 0; i < NSNOW; i++) { snowPos[i * 3] = (Math.random() - 0.5) * 9; snowPos[i * 3 + 1] = Math.random() * 7; snowPos[i * 3 + 2] = -Math.random() * 60; }
  const snowGeo = new T.BufferGeometry(); snowGeo.setAttribute("position", new T.BufferAttribute(snowPos, 3));
  const snow = new T.Points(snowGeo, new T.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.8, depthWrite: false }));
  snow.frustumCulled = false;
  scene.add(snow);

  K = { T: T, gl: gl, renderer: renderer, scene: scene, cam: cam, tex: tex, G: G, M: M, part: part, grp: grp, person: person, pose: pose, SKIN: SKIN, ORN: ORN, billboard: Cast.billboard,
    hero: hero, heroRoot: heroRoot, shadow: shadow, segs: segs, SEGL: SEGL, segFloor: floorMats, segWall: wallMats, signs: signMats,
    store: store, grille: grille, snow: snow, sun: sun, fill: fill, santa: santa, escTread: escTread, live: new Map(), dressHero: dressHero, pad: null, curZone: 0, fogTarget: null, rb: Cast.rb, chunk: Cast.chunk };
  K.signTex = tex(textPanel([["CAUTION", 30, 30], ["WET", 44, 72], ["FLOOR", 30, 108]], "#ffd23f", "#1b1b22", 128, 128));
  K.saleTex = tex(textPanel([["SALE 50% OFF", 40, 48]], "#c2304a", "#ffffff", 256, 96));
  K.caneTex = tex(stripeCanvas("#ffffff", "#e02030", 3), 1, 3);
  K.clearWorld = function () { K.live.forEach(function (m) { scene.remove(m); }); K.live.clear(); };
  dressHero();
  return K;
}

/* ---------------- Obstacle and item meshes ---------------- */
const TRACK = ["#7a3fd0", "#2fb0a0", "#ff3fa4", "#3f7fd0", "#e0662a"];
function makeOb(o) {
  const T = K.T, G = K.G, M = K.M, part = K.part, grp = K.grp, SKIN = K.SKIN, ORN = K.ORN;
  const g = new T.Group(), r = o.seed;
  let P = null;
  if (o.t === "table") {
    g.add(K.billboard(window.MSDPix.prop("table"), 1.05));
  } else if (o.t === "janitor") {
    P = K.person({ shirt: "#5a6670", pants: "#2a3140", hair: "#3a2a1a", hairStyle: "short", hat: "cap", capc: "#3a4250", skin: SKIN[Math.floor(r * 5)], sleeves: "short", shoes: "#2a2a2a", sole: "#111111" });
    g.add(P.g);
    const bucket = K.billboard(window.MSDPix.prop("bucket"), 0.42);
    bucket.position.set(0.55, 0, 0.15); g.add(bucket);
    g.userData.kind = "mop";
  } else if (o.t === "sign") {
    g.add(K.billboard(window.MSDPix.prop("sign"), 1.15));
  } else if (o.t === "walker") {
    const tc = TRACK[Math.floor(r * TRACK.length)];
    P = K.person({ shirt: tc, pants: "#243044", coat: true, scarf: r < 0.5 ? "#fff6ee" : "#ffd23f", hair: r < 0.5 ? "#4a3728" : "#6a5a48", hairStyle: r < 0.35 ? "bob" : "short", hat: "beanie", hatc: tc, skin: SKIN[Math.floor(r * 7) % 5], shoes: "#f7f4ee", sole: "#1a1a1a", sleeves: "long" });
    g.add(P.g);
    g.userData.kind = "walk";
  } else if (o.t === "stroller") {
    const sc = r < 0.5 ? ["#3f7fd0", "#2a5a9a"] : ["#c2304a", "#8a1f30"];
    const st = K.billboard(window.MSDPix.prop("stroller", { col: sc[0], dark: sc[1] }), 0.9);
    g.add(st);
    P = K.person({ scale: 0.5, shirt: "#f7d6e4", pants: "#e8b8cc", hat: "beanie", hatc: sc[0], skin: SKIN[Math.floor(r * 5)], sleeves: "short", hairStyle: "bald", pose: "sit", shoes: "#f4f1ea" });
    P.g.position.set(0, 0.22, 0.08);
    g.add(P.g);
    g.userData.kind = "sit";
  } else if (o.t === "bin") {
    g.add(K.billboard(window.MSDPix.prop("bin"), 0.95));
  } else if (o.t === "clerk") {
    P = K.person({ shirt: "#1b1b22", pants: "#14141c", hair: r < 0.5 ? "#2a1a12" : "#c89a40", hairStyle: r < 0.5 ? "bun" : "bob", skin: SKIN[Math.floor(r * 5)], sleeves: "long", vest: "#f6e6ee", shoes: "#1b1b22", sole: "#2a2a2a", scale: 0.97 });
    g.add(P.g);
    const counter = K.billboard(window.MSDPix.prop("counter"), 1.05);
    counter.position.set(o.lane === 0 ? -0.15 : 0.15, 0, -0.35);
    g.add(counter);
    g.userData.kind = "spray";
  } else if (o.t === "mist") {
    const puff = K.billboard(window.MSDPix.prop("spray"), 1.4, "mid");
    puff.position.y = 0.9;
    g.add(puff);
    g.scale.setScalar(0.15);
  } else if (o.t === "rope") {
    const xs = o.span ? [-LX - 0.3, 0, LX + 0.3] : [-0.6, 0.6];
    for (let k = 0; k < xs.length; k++) { const x = xs[k]; part(g, G.cyl, M("#d8b040", { emissive: "#3a2a00" }), 0.05, 1.0, 0.05, x, 0.5, 0); part(g, G.sph, M("#ffd23f"), 0.08, 0.08, 0.08, x, 1.02, 0); part(g, G.cyl, M("#d8b040"), 0.18, 0.04, 0.18, x, 0.02, 0); }
    for (let k = 0; k < xs.length - 1; k++) { const a = xs[k], b = xs[k + 1]; part(g, G.box, M("#a01830"), b - a, 0.07, 0.07, (a + b) / 2, 0.84, 0); }
  } else if (o.t === "cart") {
    g.add(K.billboard(window.MSDPix.prop("cart"), 1.15));
    P = K.person({ shirt: "#1d2b53", pants: "#12182e", hat: "cap", capc: "#1d2b53", hair: "#2a2418", hairStyle: "short", skin: SKIN[Math.floor(r * 5)], sleeves: "long", shoes: "#1a1a1a", sole: "#0a0a0a", pose: "sit", scale: 0.72 });
    P.g.position.set(0, 0.35, 0.02); g.add(P.g);
    g.userData.kind = "sit";
    g.userData.lr = part(g, G.box, M("#ff2020"), 0.16, 0.1, 0.08, -0.12, 1.35, 0.02);
    g.userData.lb = part(g, G.box, M("#2040ff"), 0.16, 0.1, 0.08, 0.12, 1.35, 0.02);
  } else if (o.t === "fountain") {
    g.add(K.billboard(window.MSDPix.prop("fountain"), 1.35));
    g.userData.spray = part(g, G.box, M("#bfe8ff", { transparent: true, opacity: 0.55, depthWrite: false }), 0.12, 1.1, 0.12, 0, 1.5, 0);
  }
  g.userData.P = P;
  return g;
}
function makeItem(it) {
  const T = K.T, G = K.G, M = K.M, part = K.part;
  const g = new T.Group();
  if (it.t === "coin" || it.t === "token") {
    const tk = it.t === "token";
    const c = part(g, G.coin, M(tk ? "#3ff0ff" : "#ffd23f", { emissive: tk ? "#106070" : "#5a3c00" }), tk ? 0.36 : 0.24, tk ? 0.6 : 0.5, tk ? 0.36 : 0.24, 0, 0, 0);
    c.rotation.x = Math.PI / 2; g.userData.spin = 1.2;
    if (tk) g.add(new T.Mesh(G.sph, M("#bff8ff", { basic: 1, transparent: true, opacity: 0.25, depthWrite: false }))).scale.setScalar(0.55);
  } else if (it.t === "sample") {
    part(g, G.cyl, M("#ffffff"), 0.18, 0.02, 0.18, 0, -0.12, 0); part(g, G.box, M("#a8642a"), 0.15, 0.13, 0.15, 0, 0.0, 0); part(g, G.cyl, M("#e0c890"), 0.012, 0.32, 0.012, 0, 0.12, 0);
    g.userData.spin = 0.6;
  } else if (it.t === "bag") {
    part(g, G.box, M(it.seed < 0.5 ? "#c2304a" : "#1f6a3a"), 0.36, 0.42, 0.18, 0, 0, 0); part(g, G.tor, M("#ffd23f"), 0.11, 0.11, 0.11, 0, 0.21, 0);
    g.userData.spin = 0.8;
  } else if (it.t === "slip") {
    part(g, G.box, M("#fff8e0", { emissive: "#303020" }), 0.46, 0.28, 0.02, 0, 0, 0); part(g, G.box, M("#ff4b3e"), 0.38, 0.05, 0.025, 0, 0.07, 0);
    g.userData.spin = 2;
  } else if (it.t === "box") {
    part(g, G.box, M(it.seed < 0.5 ? "#3f7fd0" : "#a77bff"), 0.42, 0.42, 0.42, 0, 0, 0);
    part(g, G.box, M("#ffd23f"), 0.44, 0.44, 0.08, 0, 0, 0); part(g, G.box, M("#ffd23f"), 0.08, 0.44, 0.44, 0, 0, 0);
    g.userData.spin = 0.9;
  } else if (it.t === "piece") {
    part(g, G.box, M("#a77bff", { emissive: "#40207a" }), 0.5, 0.6, 0.3, 0, 0, 0);
    part(g, G.ico, M("#ffd23f", { emissive: "#806010" }), 0.16, 0.16, 0.16, 0, 0.45, 0);
    g.add(new T.Mesh(G.sph, M("#d8b8ff", { basic: 1, transparent: true, opacity: 0.18, depthWrite: false }))).scale.setScalar(0.62);
    g.userData.spin = 1.4;
  } else if (it.t === "cane") {
    const cm = new T.MeshLambertMaterial({ map: K.caneTex });
    part(g, G.cyl, cm, 0.07, 0.7, 0.07, 0, 0, 0);
    part(g, G.tor, cm, 0.16, 0.16, 0.3, 0.16, 0.35, 0);
    g.add(new T.Mesh(G.sph, M("#ff9b9b", { basic: 1, transparent: true, opacity: 0.22, depthWrite: false }))).scale.setScalar(0.55);
    g.userData.spin = 1.6;
  }
  return g;
}

/* ---------------- Per-frame scene sync ---------------- */
function frameSanta(t) {
  const throne = K.santa.g.parent;
  K.pose(K.santa, "throne", t, t);
  K.heroRoot.visible = false;
  const cam = K.cam;
  cam.position.set(throne.position.x + 2.15, 1.55, throne.position.z + 3.15);
  cam.lookAt(throne.position.x, 1.15, throne.position.z);
  if (Math.abs(cam.fov - 40) > 0.1) { cam.fov = 40; cam.updateProjectionMatrix(); }
}
function frameCast(t, z, heroOnly) {
  if (!K.lineup) {
    const g = K.grp(K.scene, 0, 0, 0), folks = [];
    function add(p, x, rot) { p.g.position.x = x; p.g.rotation.y = rot || 0; g.add(p.g); folks.push(p); }
    add(K.person({ tee: true, pants: "#9a8a5a", shorts: true, sleeves: "short", hat: "beanie", hatc: "#c2304a", skin: "#f1c28e", hair: "#5a3a20", hairStyle: "short", pockets: true, shoes: "#f7f4ee", sole: "#c2304a" }), -0.78, 0.4);
    add(K.person({ shirt: "#7a3fd0", pants: "#243044", coat: true, scarf: "#fff6ee", hair: "#4a3728", hairStyle: "short", hat: "beanie", hatc: "#7a3fd0", skin: "#c98a5a", shoes: "#f7f4ee", sole: "#1a1a1a", sleeves: "long" }), -0.24, 0.35);
    add(K.person({ shirt: "#1b1b22", pants: "#14141c", hair: "#c89a40", hairStyle: "bun", vest: "#f6e6ee", sleeves: "long", skin: "#f6d5b0", shoes: "#1b1b22", scale: 0.97 }), 0.28, -0.4);
    add(K.person({ shirt: "#c2304a", pants: "#8e1c2c", coat: true, fur: true, belly: true, mittens: "#fff6ee", sleeves: "long", hat: "santa", boots: true, belt: 0x1a120c, beard: true, hairStyle: "bald", bulk: 1.05, skin: "#f1c28e", shoes: "#1a120c" }), 0.8, 0.25);
    K.lineup = g; K.lineupFolks = folks;
  }
  K.lineup.position.set(0, 0, -z - 1.15);
  const kinds = ["stand", "stand", "stand", "stand"];
  const gap = 0.2;
  const widths = K.lineupFolks.map(function (p) { return (p.sprite && p.sprite.scale.x) || 0.9; });
  const xs = [];
  let cursor = 0;
  for (let i = 0; i < K.lineupFolks.length; i++) {
    if (i) cursor += widths[i - 1] / 2 + gap + widths[i] / 2;
    xs.push(cursor);
    K.lineupFolks[i].g.position.x = 0;
    K.pose(K.lineupFolks[i], kinds[i], t * 1.2 + i, t);
  }
  const mid = (xs[0] + xs[xs.length - 1]) / 2;
  for (let i = 0; i < K.lineupFolks.length; i++) K.lineupFolks[i].g.position.x = xs[i] - mid;
  K.heroRoot.visible = false;
  const cam = K.cam;
  if (heroOnly) {
    for (let i = 0; i < K.lineupFolks.length; i++) K.lineupFolks[i].g.visible = i === 0;
    K.lineupFolks[0].g.position.set(0, 0, 0);
    K.lineupFolks[0].g.rotation.y = 0;
    K.pose(K.lineupFolks[0], "stand", t, t);
    cam.position.set(0, 1.05, -z + 2.15);
    cam.lookAt(0, 0.95, -z - 1.15);
    if (Math.abs(cam.fov - 34) > 0.1) { cam.fov = 34; cam.updateProjectionMatrix(); }
    return;
  }
  const span = (xs[xs.length - 1] - xs[0]) + widths[0] / 2 + widths[widths.length - 1] / 2 + 0.4;
  const aspect = Math.max(0.42, cam.aspect || 0.6);
  const fov = aspect < 0.72 ? 42 : 32;
  const half = fov * Math.PI / 360;
  const dist = (span / 2) / (Math.tan(half) * aspect);
  cam.position.set(0.0, 1.15, -z - 1.15 + dist);
  cam.lookAt(0, 1.0, -z - 1.15);
  if (Math.abs(cam.fov - fov) > 0.1) { cam.fov = fov; cam.updateProjectionMatrix(); }
}
function lx(lane) { return (lane - 1) * LX; }
function anim(dt) { S.runPh = (S.runPh || 0) + dt * (gear.on === "skates" ? 5 : clamp(S.v, 0, 20) * 1.15); }
function syncWorld(dt, state, t) {
  const T = K.T, scene = K.scene;
  const playing = state === "playing" || state === "paused" || (state === "over" && S.done);
  const z = S.z || 0;
  const k0 = Math.floor(z / K.SEGL) - 1;
  for (let i = 0; i < K.segs.length; i++) {
    const sg = K.segs[i], k = k0 + i;
    if (sg.k !== k) {
      sg.k = k;
      const zc = k * K.SEGL + K.SEGL / 2, zi = zoneAt(clamp(zc, 0, LEN - 1));
      sg.g.position.z = -zc;
      sg.f.material = K.segFloor[zi];
      sg.wl.material = sg.wr.material = K.segWall[zi];
      const list = K.signs[zi];
      sg.sl.material = list[Math.floor(hash(k + 1000) * list.length) % list.length]; sg.sr.material = list[Math.floor(hash(k + 3000) * list.length) % list.length];
      sg.big.visible = zi === 3 && ((k % 4) + 4) % 4 === 0;
      sg.tree.visible = !sg.big.visible && k % 2 === 0;
      sg.g.visible = zc < LEN + 14;
    }
    for (let q = 0; q < sg.orn.length; q++) sg.orn[q].rotation.y = t * (0.6 + q * 0.2);
  }
  const zi = zoneAt(clamp(z + 20, 0, LEN - 1));
  if (zi !== K.curZone) { K.curZone = zi; K.fogTarget = new T.Color(ZONES[zi].fog); }
  if (K.fogTarget) { scene.fog.color.lerp(K.fogTarget, Math.min(1, dt * 1.5)); scene.background.copy(scene.fog.color); }
  if (K.escTread.material.map) K.escTread.material.map.offset.y = (t * 1.5) % 1;

  const near = z - 6, far = z + 92, seen = K.seen || (K.seen = new Set());
  seen.clear();
  if (S.O) for (let i = 0; i < S.O.length; i++) {
    const o = S.O[i];
    if (o.z < near) continue; if (o.z > far) break;
    seen.add(o);
    let m = K.live.get(o);
    if (!m) { m = makeOb(o); K.live.set(o, m); scene.add(m); }
    m.position.set(lx(o.lp) + (o.span ? LX / 2 : 0), 0, -o.z);
    const P = m.userData.P;
    if (P && P.applyView && o._zPrev != null && o.z !== o._zPrev) P.applyView(o.z > o._zPrev ? "back" : "front");
    o._zPrev = o.z;
    if (P && m.userData.kind) K.pose(P, m.userData.kind, t * (m.userData.kind === "walk" ? 7 : 3) + o.seed * 6, t);
    if (P && P.prop) {
      const h = P.F.hand[1], sc = P.F.body.scale.x;
      P.prop.position.set(h.position.x * sc, h.position.y * sc, h.position.z * sc);
      P.prop.quaternion.copy(h.quaternion);
    }
    if (o.t === "cart") { const on = Math.floor(t * 8) % 2; m.userData.lr.visible = !!on; m.userData.lb.visible = !on; m.rotation.y = (o.to != null && o.lp !== o.to) ? Math.sign(o.to - o.lp) * 0.3 : 0; }
    else if (o.t === "mist") { const sc = o.on ? 1 + Math.sin(t * 5) * 0.06 : 0.15; m.scale.setScalar(m.scale.x + (sc - m.scale.x) * Math.min(1, dt * 6)); m.rotation.y = Math.sin(t) * 0.2; }
    else if (o.t === "fountain") { const sp = m.userData.spray; sp.scale.y = 2.4 + Math.sin(t * 9) * 0.25; }
    if (o.knock) { o.knock += dt; const kk = Math.min(1, o.knock * 3); m.rotation.z = -o.kdir * kk * 0.9; m.position.x += o.kdir * kk * 1.2; m.position.y = Math.sin(kk * Math.PI) * 0.4; }
  }
  if (S.I) for (let i = 0; i < S.I.length; i++) {
    const it = S.I[i];
    if (it.z < near) continue; if (it.z > far) break;
    if (it.got && it.gotT > 0.35) continue;
    seen.add(it);
    let m = K.live.get(it);
    if (!m) { m = makeItem(it); K.live.set(it, m); scene.add(m); }
    m.position.set(lx(it.lane), (it.air ? 1.75 : 0.65) + Math.sin(t * 3 + it.seed * 6) * 0.08, -it.z);
    m.rotation.y = t * (m.userData.spin || 1) * 2;
    if (it.got) { it.gotT += dt; m.position.y += it.gotT * 5; m.scale.setScalar(Math.max(0.01, 1 - it.gotT * 2.6)); }
  }
  K.live.forEach(function (m, key) { if (!seen.has(key)) { scene.remove(m); K.live.delete(key); } });

  // hero
  const hr = K.heroRoot, hx = lx(S.lp == null ? 1 : S.lp), hy = S.jumpT >= 0 ? jumpH() : 0;
  hr.position.set(hx, hy, -z);
  hr.rotation.z = (S.lane - S.lp) * 0.35;
  K.shadow.position.set(hx, 0.012, -z); K.shadow.scale.setScalar(1 - hy * 0.3);
  const P = K.hero;
  let heroKind = "idle";
  if (!playing) heroKind = "idle";
  else if (S.phase === "count") heroKind = "start";
  else if (S.phase === "run" && S.jumpT >= 0) heroKind = "jump";
  else if (S.phase === "run") heroKind = gear.on === "skates" ? "skate" : "run";
  else if (S.phase === "gate" || (S.gate && S.phase === "receipt")) heroKind = S.v < 1.2 ? "cheer" : (gear.on === "skates" ? "skate" : "run");
  else heroKind = "slump";
  K.pose(P, heroKind, S.runPh || t, t);
  if (heroKind === "cheer") hr.position.y = Math.abs(Math.sin(t * 8)) * 0.12;
  hr.visible = !(S.inv > 0 && Math.floor(S.inv * 14) % 2 === 0);
  if (gear.on === "lightup" && P.shoeL.material[0] && P.shoeL.material[0].emissive) P.shoeL.material[0].emissive.setHex(Math.floor(t * 10) % 2 ? 0x2fd0ff : 0xff3fa4);

  // the toy store grille drops as the clock runs low
  let gy;
  if (S.phase === "gate") gy = S.pt < 0.5 ? 3.8 : 0;
  else if (S.phase === "closed" || S.phase === "receipt") gy = 0;
  else gy = clamp((S.left == null ? CLOCK0 : S.left) / 20, 0, 1) * 3.8;
  K.grille.position.y += (gy - K.grille.position.y) * Math.min(1, dt * (S.phase === "closed" ? 6 : 3));

  // snow
  const sp = K.snow.geometry.attributes.position, arr = sp.array;
  for (let i = 0; i < arr.length; i += 3) {
    arr[i + 1] -= dt * (0.5 + (i % 7) * 0.08); arr[i] += Math.sin(t + i) * dt * 0.1;
    if (arr[i + 1] < 0 || arr[i + 2] > -z + 8 || arr[i + 2] < -z - 70) { arr[i + 1] = 1 + Math.random() * 6; arr[i + 2] = -z - 2 - Math.random() * 60; arr[i] = (Math.random() - 0.5) * 9; }
  }
  sp.needsUpdate = true;

  // camera
  const cam = K.cam;
  if (!playing) {
    const a = t * 0.25;
    cam.position.set(Math.sin(a) * 3.6, 1.9 + Math.sin(t * 0.4) * 0.3, -z - 1 + Math.cos(a) * 3.6);
    cam.lookAt(0, 1.2, -z - 1);
    if (Math.abs(cam.fov - 60) > 0.05) { cam.fov = 60; cam.updateProjectionMatrix(); }
  } else {
    const gate = S.gate && (S.phase === "gate" || S.phase === "receipt");
    const back = gate ? 5.6 + Math.min(3.4, S.pt * 1.6) : 5.6, up = gate ? 3.0 + Math.min(1, S.pt * 0.4) : 3.0;
    cam.position.x += (hx * 0.55 - cam.position.x) * Math.min(1, dt * 6);
    cam.position.y += (up + hy * 0.25 - cam.position.y) * Math.min(1, dt * 6);
    cam.position.z = -z + back;
    const fov = 66 + (S.turbo > 0 ? 9 : 0) + (S.esc ? 6 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
    cam.lookAt(hx * 0.75, 1.0, -z - 10);
    if (S.hitT < 0.25 && state === "playing") { cam.position.x += (Math.random() - 0.5) * 0.15; cam.position.y += (Math.random() - 0.5) * 0.1; }
  }
  if (K.santa) K.pose(K.santa, "throne", t, t);
  K.sun.position.set(cam.position.x - 3, 9, cam.position.z - 8); K.sun.target.position.set(hx, 1.2, -z - 6);
  if (K.fill) { K.fill.position.set(cam.position.x, cam.position.y + 1.2, cam.position.z); K.fill.target.position.set(hx, 1.1, -z - 4); }
  if (CAST_SANTA) frameSanta(t);
  else if (CAST) frameCast(t, z, CAST_HERO);
}

/* ---------------- HUD (2D canvas on top of the 3D view) ---------------- */
function txt(c, s, x, y, size, col, align, glow) {
  c.font = size + "px " + HUD_FONT; c.textAlign = align || "left"; c.textBaseline = "top";
  c.fillStyle = "rgba(0,0,0,.9)"; c.fillText(s, x + 2, y + 2);
  if (glow) { c.shadowColor = glow; c.shadowBlur = 8; }
  c.fillStyle = col || "#eceae2"; c.fillText(s, x, y); c.shadowBlur = 0;
}
function ui(c, s, x, y, size, col, align) { c.font = "700 " + size + "px " + UI_FONT; c.textAlign = align || "left"; c.textBaseline = "top"; c.fillStyle = "rgba(0,0,0,.85)"; c.fillText(s, x + 1, y + 1); c.fillStyle = col || "#eceae2"; c.fillText(s, x, y); }
function rr(c, x, y, w, h, r, col) { c.fillStyle = col; c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); c.fill(); }
function drawHUD(c, state, t) {
  if (state === "title" || (state !== "playing" && state !== "paused" && !S.done)) {
    txt(c, "MALL SANTA DASH '94", W / 2, 22, 14, "#ffd23f", "center", "#c2304a");
    if (Math.sin(t * 5) > -0.2) ui(c, "FREE PLAY  -  PRESS START", W / 2, 46, 11, "#ffffff", "center");
    return;
  }
  c.fillStyle = "rgba(8,9,14,.84)"; c.fillRect(0, 0, W, 48);
  c.fillStyle = ZONES[zoneAt(clamp(S.z || 0, 0, LEN - 1))].col; c.fillRect(0, 48, W, 3);
  txt(c, "1UP", 10, 6, 8, "#ff4b3e"); txt(c, comma(S.score), 10, 18, 11, "#ffffff");
  const best = Math.max(Sh.best() || 0, S.score);
  txt(c, "HI", W - 10, 8, 9, "#ff4b3e", "right"); txt(c, comma(best), W - 10, 22, 11, "#ffffff", "right");
  const low = S.left < 10 && S.phase === "run";
  txt(c, "TIME", W / 2, 6, 8, "#ffd23f", "center");
  if (!low || Math.floor(t * 6) % 2 === 0) txt(c, String(Math.max(0, Math.ceil(S.left))).padStart(2, "0"), W / 2, 18, 24, low ? "#ff4b3e" : "#ffffff", "center", low ? "#ff0000" : null);
  if (S.extT < 1.4 && S.ext.length) txt(c, "+" + S.ext[S.ext.length - 1], W / 2 + 34, 18 - (S.extT / 1.4) * 14, 12, "#9bff3f", "left");
  const px = 40, pw = W - 92, py = 52;                    // progress to the toy store
  rr(c, px, py, pw, 6, 3, "rgba(0,0,0,.6)");
  const pk = clamp(S.z / LEN, 0, 1);
  rr(c, px, py, Math.max(6, pw * pk), 6, 3, ZONES[zoneAt(clamp(S.z, 0, LEN - 1))].col);
  for (let i = 1; i < 4; i++) { c.fillStyle = ZONES[i].col; c.fillRect(px + pw * ZB[i] / LEN - 1, py - 2, 2, 10); }
  c.fillStyle = "#ffffff"; c.fillRect(px + pw * pk - 2, py - 3, 4, 12);
  ui(c, "TOYS", px + pw + 5, py - 2, 9, "#ff3fa4");
  if (S.mult > 1) txt(c, "x" + S.mult, 10, 66, 12, "#ff3fa4", "left", "#ff3fa4");
  ui(c, "STREAK " + S.streak, 10, S.mult > 1 ? 84 : 68, 9, "#eceae2");
  for (let i = 0; i < 5; i++) { const on = S.pieces[i]; rr(c, W - 92 + i * 17, 66, 13, 13, 2, on ? "#a77bff" : "rgba(0,0,0,.5)"); if (on) { c.fillStyle = "#ffd23f"; c.fillRect(W - 88 + i * 17, 70, 5, 5); } }
  ui(c, "COMBO", W - 92, 82, 8, "#a77bff");
  if (S.turbo > 0) { rr(c, W / 2 - 60, 92, 120 * S.turbo / TURBO_T, 5, 2, "#ff4b3e"); ui(c, "PEPPERMINT RUSH", W / 2, 100, 9, "#ffffff", "center"); }
  if (S.tag) {
    const a = clamp(S.tag.life / 0.3, 0, 1), yy = 300 - (0.9 - S.tag.life) * 30;
    c.globalAlpha = a; rr(c, W / 2 - 96, yy, 192, 26, 4, "#ffd23f");
    txt(c, S.tag.text + (S.tag.pts ? " +250" : ""), W / 2, yy + 9, 8, "#c2304a", "center"); c.globalAlpha = 1;
  }
  if (S.hitT < 0.3) { c.fillStyle = "rgba(255,40,40," + (0.3 - S.hitT) + ")"; c.fillRect(0, 0, W, H); }
  if (S.turbo > 0 && !Sh.reduced) {
    c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + i, r0 = 150 + ((t * 600 + i * 47) % 140); c.beginPath(); c.moveTo(W / 2 + Math.cos(a) * r0, 290 + Math.sin(a) * r0); c.lineTo(W / 2 + Math.cos(a) * (r0 + 30), 290 + Math.sin(a) * (r0 + 30)); c.stroke(); }
  }
  if (S.phase === "count") {
    const n = Math.floor(S.pt / 0.6), k = (S.pt % 0.6) / 0.6;
    c.save(); c.translate(W / 2, 220); c.scale(1.6 - k * 0.5, 1.6 - k * 0.5); txt(c, String(3 - Math.min(2, n)), 0, -16, 30, "#ffd23f", "center", "#c2304a"); c.restore();
    ui(c, "MISTLETOE MILE MALL  -  DEC 24, 5:58 PM", W / 2, 280, 9, "#ffffff", "center");
    ui(c, "REACH THE TOY STORE BEFORE 6:00", W / 2, 296, 9, "#ffd23f", "center");
  } else if (S.phase === "run" && S.t < 0.9) { const k = S.t / 0.9; c.globalAlpha = 1 - k; txt(c, "GO!", W / 2, 204 - k * 30, 30, "#9bff3f", "center", "#c2304a"); c.globalAlpha = 1; }
  if (S.phase === "closed") { const k = clamp(S.pt / 0.4, 0, 1); c.fillStyle = "rgba(0,0,0," + 0.5 * k + ")"; c.fillRect(0, 0, W, H); txt(c, "TIME UP", W / 2, 200, 28, "#ff4b3e", "center", "#ff0000"); ui(c, "THE GATES ARE DOWN", W / 2, 244, 12, "#ffffff", "center"); ui(c, "THERE'S ALWAYS LAYAWAY", W / 2, 264, 10, "#ffd23f", "center"); }
  if (S.phase === "gate" && S.pt > 0.2) {
    txt(c, S.left < 5 ? "JUST MADE IT!" : "MADE THE TOY STORE!", W / 2, 140, S.left < 5 ? 20 : 15, "#ffd23f", "center", "#c2304a");
    ui(c, "THE LAST ULTRA-BOT IS YOURS", W / 2, 172, 11, "#ffffff", "center");
    if (S.pt > 0.9) ui(c, "TIME BONUS  " + Math.round(S.left) + " SEC x " + TIME_BONUS + " = " + comma(S.bonus), W / 2, 192, 10, "#9bff3f", "center");
  }
  if (S.phase === "receipt") receipt(c, t);
  if (touchUI && (S.phase === "run" || S.phase === "count") && state === "playing") {
    if (K.pad) K.pad.t += 1 / 60;
    const pr = K.pad && K.pad.t < 0.12 ? K.pad.k : null;
    padBtn(c, 10, PAD.y, 86, PAD.h, "<", pr === "L", "#3ff0ff");
    padBtn(c, 114, PAD.y, 132, PAD.h, "JUMP", pr === "J", "#ff4b3e");
    padBtn(c, 264, PAD.y, 86, PAD.h, ">", pr === "R", "#3ff0ff");
  }
}
function padBtn(c, x, y, w, h, label, down, col) {
  const o = down ? 3 : 0;
  c.globalAlpha = down ? 0.8 : 0.45;
  rr(c, x, y + o, w, h - 3, 12, "#000"); rr(c, x + 3, y + 3 + o, w - 6, h - 9, 10, col);
  c.globalAlpha = 1;
  txt(c, label, x + w / 2, y + h / 2 - 8 + o, label.length > 1 ? 11 : 16, "#ffffff", "center");
}
function receipt(c, t) {
  c.fillStyle = "rgba(0,0,0,.55)"; c.fillRect(0, 0, W, H);
  const rows = [["MISTLETOE MILE MALL", ""], ["DEC 24 1994   6:00 PM", ""], ["--------------------", ""],
    ["ITEMS GRABBED", String(S.items)], ["CATALOG COMBO", piecesGot() + "/5"], ["CLOSE SHAVES", String(S.near)],
    ["BUMPS", String(S.bumps)], ["MALL MILES", (S.z / 1609).toFixed(2)], [S.gate ? "TIME BONUS" : "LAYAWAY", S.gate ? comma(S.bonus) : "PENDING"], ["TOTAL", comma(S.score)]];
  const n = Math.min(rows.length, 1 + Math.floor(S.pt / 0.32)), ph = 30 + n * 22;
  const x = 50, y = 90;
  c.fillStyle = "#fbf7ea"; c.fillRect(x, y, W - 100, ph);
  c.fillStyle = "#e3dcc2"; for (let k = 6; k < ph - 4; k += 14) { c.fillRect(x + 4, y + k, 4, 4); c.fillRect(W - x - 8, y + k, 4, 4); }
  c.fillStyle = "#fbf7ea"; for (let i = 0; i < W - 100; i += 10) { c.beginPath(); c.moveTo(x + i, y + ph); c.lineTo(x + i + 5, y + ph + 6); c.lineTo(x + i + 10, y + ph); c.fill(); }
  for (let i = 0; i < n; i++) {
    const r = rows[i], yy = y + 14 + i * 22, last = i === rows.length - 1;
    c.font = "700 " + (last ? 13 : 10) + "px " + UI_FONT; c.textBaseline = "top"; c.fillStyle = last ? "#c2304a" : "#2a2a3a";
    if (!r[1]) { c.textAlign = "center"; c.fillText(r[0], W / 2, yy); }
    else { c.textAlign = "left"; c.fillText(r[0], x + 16, yy); c.textAlign = "right"; c.fillText(r[1], W - x - 16, yy); }
  }
  if (S.pt > 0.8 && Math.sin(t * 6) > 0) ui(c, "TAP TO CONTINUE", W / 2, y + ph + 24, 10, "#ffffff", "center");
}

/* ---------------- Frame ---------------- */
const QUALITY = [1.75, 1.4, 1.1, 1];
const Q = { q: 0, warm: 0, sum: 0, n: 0, hits: 0, cw: 0, ch: 0, pr: 0, left: null, top: null, hud: null, stage: null, lastT: 0, lock: false };
function watchFrameRate(ms) {
  if (Q.lock || Q.q >= QUALITY.length - 1 || ms > 250) return;
  if (Q.warm < 45) { Q.warm++; return; }
  Q.sum += ms; Q.n++;
  if (Q.n < 60) return;
  const avg = Q.sum / Q.n; Q.sum = 0; Q.n = 0;
  if (avg > 24) { if (++Q.hits >= 2) { Q.hits = 0; Q.q++; } } else Q.hits = 0;
}
function layout() {
  const hud = Q.hud, st = Q.stage;
  const cw = hud.clientWidth, ch = hud.clientHeight;
  if (!cw || !ch) return false;
  const hr = hud.getBoundingClientRect(), sr = st.getBoundingClientRect();
  const left = Math.round((hr.left - sr.left - st.clientLeft + hud.clientLeft + st.scrollLeft) * 100) / 100;
  const top = Math.round((hr.top - sr.top - st.clientTop + hud.clientTop + st.scrollTop) * 100) / 100;
  const pr = Math.min(window.devicePixelRatio || 1, QUALITY[Q.q]);
  if (cw !== Q.cw || ch !== Q.ch || pr !== Q.pr) {
    Q.cw = cw; Q.ch = ch; Q.pr = pr;
    K.renderer.setPixelRatio(pr); K.renderer.setSize(cw, ch, false);
    K.gl.style.width = cw + "px"; K.gl.style.height = ch + "px";
    K.cam.aspect = cw / ch; K.cam.updateProjectionMatrix();
  }
  if (left !== Q.left || top !== Q.top) { Q.left = left; Q.top = top; K.gl.style.left = left + "px"; K.gl.style.top = top + "px"; }
  return true;
}
function draw(c, state) {
  Juke.pump();
  if (!K || !Q.hud) return;
  const now = performance.now();
  let ms = now - Q.lastT; Q.lastT = now;
  if (!(ms > 0)) ms = 16;
  const dt = state === "paused" ? 0 : Math.min(0.05, ms / 1000);
  watchFrameRate(ms);
  idleT += dt;
  if (!layout()) return;
  syncWorld(dt, state, idleT);
  K.renderer.render(K.scene, K.cam);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, c.canvas.width, c.canvas.height); c.restore();
  drawHUD(c, state, idleT);
}

/* ---------------- Boot ---------------- */
function loadClassic() {
  return new Promise(function (resolve, reject) {
    const s = document.createElement("script"); s.src = FALLBACK_URL;
    s.onload = function () { if (window.Shell && Shell.state && Shell.state() !== "boot") resolve(); else reject(new Error("classic game did not start")); };
    s.onerror = function () { reject(new Error("no classic game")); };
    document.body.appendChild(s);
  });
}
function attach() {
  const hud = document.getElementById("np-canvas"), stage = document.getElementById("np-stage");
  Q.hud = hud; Q.stage = stage;
  if (getComputedStyle(stage).position === "static") stage.style.position = "relative";
  const gl = K.gl;
  gl.style.cssText = "position:absolute;left:0;top:0;z-index:0;display:block;margin:0;padding:0;border:0;box-shadow:none;" +
    "max-width:none;max-height:none;transform:none;image-rendering:pixelated;pointer-events:none;touch-action:none;border-radius:" + getComputedStyle(hud).borderRadius;
  stage.insertBefore(gl, hud);
  hud.style.background = "transparent";
  if (getComputedStyle(hud).position === "static") hud.style.position = "relative";
  Q.lastT = performance.now();
  layout();
}
function marginTaps() {
  // Taps and swipes in the empty space around the game screen steer too (tall phones, landscape phones).
  const stage = document.getElementById("np-stage"), cv = document.getElementById("np-canvas");
  let id = null;
  if (!stage || !cv) return;
  function local(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / (r.width / W), y: (e.clientY - r.top) / (r.height / H) }; }
  stage.addEventListener("pointerdown", function (e) {
    if (e.target !== stage || Sh.state() !== "playing" || id !== null) return;
    e.preventDefault(); id = e.pointerId;
    try { stage.setPointerCapture(id); } catch (err) { /* ignore */ }
    const q = local(e); pointer("down", clamp(q.x, 0, W), Math.min(q.y, PAD.y - 1), e);
  });
  stage.addEventListener("pointermove", function (e) { if (e.pointerId === id && Sh.state() === "playing") { const q = local(e); pointer("move", q.x, q.y, e); } });
  function end(type) { return function (e) { if (e.pointerId !== id) return; id = null; if (Sh.state() === "playing") { const q = local(e); pointer(type, q.x, q.y, e); } }; }
  stage.addEventListener("pointerup", end("up"));
  stage.addEventListener("pointercancel", end("cancel"));
}
function startGame() {
  gear = loadGear();
  Sh.init({
    slug: SLUG,
    title: "MALL SANTA DASH '94",
    accent: "#3fd07a",
    width: W, height: H,
    format: function (n) { return comma(n) + " PTS"; },
    howTo: "Christmas Eve, 5:58 PM. Run four stretches of the Mistletoe Mile Mall and reach the toy store before the grille comes down. Every checkpoint banner adds time. Grab coins, bags and toys, jump the low stuff, dodge the shoppers. A bump costs 3 seconds.",
    keys: "Phone: tap the < and > pads or swipe to change lanes, tap JUMP or swipe up to jump. Keyboard: Left/Right or A/D, Space or Up to jump, Down to drop. P pause, M mute, N music, R restart.",
    tip: "Wet floor signs, strollers, sale bins and the fountain can be jumped. Shoppers, ropes and security carts can't. Peppermint canes give a speed rush.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function () { },
    onPause: function () { for (const k in keys) keys[k] = false; ptr = null; }
  });
  attach();
  marginTaps();
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) touchUI = true;
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Juke.unlock, true); });
  Sh.onStart(Juke.newGame); Sh.onRestart(Juke.newGame); Sh.onResume(Juke.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Juke.toggleMusic();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) Juke.button(titleCard, titleCard.querySelector(".np-tip"));
  if (pauseActions) Juke.button(pauseActions, pauseActions.querySelector("a"));
  buildPicker();
  K.dressHero();
}

// Hook for automated checks (no effect on play)
window.__msd = { S: function () { return S; }, step: function (sec) { for (let i = 0; i < sec * 60; i++) { if (Sh.state() !== "playing" || S.done) break; update(1 / 60); } },
  move: move, jump: jump, drop: drop, finish: finish, kit: function () { return K; }, juke: Juke, Q: Q, LEN: LEN, ZB: ZB, LX: LX, zoneAt: zoneAt, build: build, jumpH: jumpH };

function loadArt() {
  const names = ["hero-front", "hero-back", "shopper-front", "shopper-back", "shopper-teal", "shopper-pink", "shopper-blue", "shopper-orange", "shopper-back-teal", "shopper-back-pink", "shopper-back-blue", "shopper-back-orange", "clerk-front", "clerk-back", "santa-front", "santa-back"];
  return Promise.all(names.map(function (name) {
    return new Promise(function (res, rej) {
      const img = new Image();
      img.onload = function () { res([name, img]); };
      img.onerror = function () { rej(new Error(name)); };
      img.src = "sprites/" + name + ".png";
    });
  })).then(function (list) {
    const art = {};
    for (let i = 0; i < list.length; i++) art[list[i][0]] = list[i][1];
    window.XmasArt = art;
  });
}
(function boot() {
  const q = /[?&]gfx=(high|low|2d)/.exec(location.search);
  let started = false;
  const artP = loadArt();
  const p = q && q[1] === "2d" ? Promise.reject(Object.assign(new Error("2D asked for"), { npStage: "webgl" }))
    : import(THREE_URL).then(null, function (e) { e.npStage = "three"; throw e; });
  p.then(function (T) {
    return artP.then(function () {
    THREE = T;
    try { buildKit(THREE); } catch (e) { e.npStage = "webgl"; throw e; }
    if (q) { Q.lock = true; Q.q = q[1] === "low" ? QUALITY.length - 1 : 0; }
    reset();
    started = true; startGame();
    });
  }).catch(function (e) {
    console.error(e);
    if (started) return;
    K = null;
    loadClassic().catch(function () {
      const d = document.createElement("p");
      d.style.cssText = "padding:24px;font-family:monospace;color:#eceae2;background:#101219";
      d.textContent = "Mall Santa Dash needs WebGL for its 3D mall, and this browser has it switched off.";
      document.body.appendChild(d);
    });
  });
})();
