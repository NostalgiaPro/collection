/* GRAVY OR BUST! THREE RIDES TO DINNER (3D): a Thanksgiving travel dash.

   Real 3D on three.js 0.187.0 (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in charge of
   input, scaling and the title / pause / game over flow, and carries the HUD.

   The rules are the 2D game's, unchanged: the same Dinner Clock, the same timing windows, the same
   ramps, the same scoring, the same one-thumb controls and the same trophies (ids gob-*), so nobody
   loses progress. SKY: tap when the ring meets NOD. RAILS: hold to lean right, let go to drift left.
   MOTEL: tap to kick the ice machine quiet. ROAD: tap a side of the screen to hop lanes.
   Only the picture is new: a plane cabin, a train car, a roadside motel at night, a highway in the
   fall, and the front door at home. Everything is drawn in code; the only image files are the
   Nostalgia Pro Games logo and its script wordmark. */

const W = 360, H = 540, TAU = Math.PI * 2, DEG = Math.PI / 180, SLUG = "gravy-or-bust";
const Sh = window.Shell;
const INK = { pumpkin: "#ff8a1f", cran: "#c2304a", gold: "#ffd23f", cream: "#fff1d6", navy: "#1d2b53", dark: "#101219", lime: "#9bdc3a", sage: "#7fae6a" };
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';
const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash, title card and score card
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every sign and decal in the world
const THREE_URL = "../shared/three.module.min.js";

const CONFIG = {
  startMin: 720, dinnerMin: 1080,           // 12:00 PM start, 6:00 PM dinner
  intro: 4.6, howto: 2.0, exit: 2.6, home: 9,
  sky: { dur: 45.5, travel: 112, miss: 2, perfect: 0.07, good: 0.14, early: 0.3, pts: 10,
    p1: { from: 2.2, to: 15, step: 1.45, appr: 1.25 },
    p2: { from: 15.8, to: 30, step: 1.0, appr: 1.0 },
    p3: { groups: [31, 33.4, 35.8, 38.2, 40.6], gap: 0.42, appr: 0.92 },
    giant: { t: 43.6, appr: 1.4, x: 5 } },
  rails: { dur: 45, travel: 96, drop: 3, push: 3.0, drift: 2.6, damp: 2.6, zones: [0.46, 0.39, 0.33], red: 1.2,
    stations: [15, 30], sway: [0.45, 0.6, 0.75], curve: 1.0, curveEvery: 6.5, jolt: 1.25, joltFrom: 30, joltEvery: 3.4, tick: 0.5, pts: 10 },
  motel: { dur: 8, travel: 30, kicks: 6 },
  road: { dur: 50, travel: 88, hit: 2, speed: 235, fast: 1.3, fastAt: 20, snowAt: 35, gap: [0.95, 0.82, 0.92], iframes: 1.0,
    coffeeP: 0.2, pieAt: [12, 27, 41], view: 250, dodgePts: 5, coffeePts: 5 },
  bonus: { spare: 25, pie: 300, part: 100 }
};

const PARTS = ["HUBCAP", "SIDE MIRROR", "BUMPER", "HOOD", "LEFT DOOR", "RIGHT DOOR"];
const LANES = [120, 180, 240], CAR_Y = 440;
const LEGS = [
  { key: "sky", n: "LEG 1 OF 3", title: "THE SKY", sub: "SEAT 34B", how: "TAP WHEN THE RING HITS NOD", col: "#3ff0ff" },
  { key: "rails", n: "LEG 2 OF 3", title: "THE RAILS", sub: "STANDING ROOM ONLY", how: "HOLD TO LEAN RIGHT. LET GO TO DRIFT LEFT. STAY IN THE GREEN", col: "#9bff3f" },
  { key: "road", n: "LEG 3 OF 3", title: "THE ROAD", sub: "THE LAST CAR ON THE LOT", how: "TAP LEFT OR RIGHT SIDE TO HOP LANES", col: INK.pumpkin }
];
const TOPICS = ["cat", "lawn", "foot", "photos", "fish", "cloud", "mower", "cat"];

let S = {}, idleT = 0, parts = [], floats = [];
let THREE = null, R = null;                              // R holds everything the renderer owns
// V is how things are being shown (poses, flying car parts, falling boxes). It never feeds the rules.
const V = { kickT: 9, dropT: 9, dropN: 0, nodT: 9, talk: 0, fly: [], boxFall: [], pieGrab: 9, hop: 0, hopDir: 0, hitT: 9, camShake: 0 };
const dbg = /[?&]debug=1/.test(location.search);

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function comma(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function rnd(a, b) { return a + Math.random() * (b - a); }
function NR() { return window.NPRewards; }
function unlock(id) { if (window.Trophies) window.Trophies.unlock(id); }
function clockStr(m) { m = Math.round(m); const h = Math.floor(m / 60) % 24, mm = m % 60, ap = h >= 12 ? "PM" : "AM", hh = h % 12 || 12; return hh + ":" + ("0" + mm).slice(-2) + " " + ap; }
function sfx(n) { Sh.sfx(n); }
function tone(f, d, t, v, fe, dl) { Sh.tone(f, d, t, v, fe, dl); }

/* ---------------- Saved extras: cosmetics, best arrival, runs (same keys as the 2D game) ---------------- */
function loadJ(k, d) { let v = null; try { v = JSON.parse(Sh.load(k) || "null"); } catch (e) { v = null; } return v && typeof v === "object" ? v : d; }
function extras() { const x = loadJ("extras", null) || {}; x.runs = x.runs || 0; x.got = x.got || {}; x.wear = x.wear || {}; return x; }
function saveExtras(x) { Sh.save("extras", JSON.stringify(x)); }
const UNLOCKS = [
  { id: "earmuffs", name: "Earmuffs", how: "Finish 1 run" },
  { id: "scarf", name: "Plaid knit scarf", how: "Arrive on time once" },
  { id: "hat", name: "Paper turkey hat", how: "Deliver all 3 pies" },
  { id: "pumpkin", name: "Pumpkin orange paint", how: "Finish 3 runs", paint: "#ff8a1f" },
  { id: "cran", name: "Cranberry red paint", how: "Earn 5 trophies", paint: "#c2304a" },
  { id: "gold", name: "Gold pie box", how: "Earn every trophy" }
];
let X = null;
function wear(id) { return !!(X && X.got[id] && X.wear[id] !== false); }
function paint() { if (X && X.paint && X.got[X.paint]) return X.paint === "pumpkin" ? "#ff8a1f" : "#c2304a"; return INK.lime; }

/* ---------------- Run state ---------------- */
function reset() {
  X = extras();
  S = { t: 0, phase: "intro", pt: 0, leg: 0, hold: false, delay: 0, base: CONFIG.startMin, score: 0,
    pts: { sky: 0, rails: 0, road: 0 }, pies: 3, grades: [], done: false,
    beats: [], bubbles: [], streak: 0, streakBest: 0, perfects: 0, goods: 0, misses: 0, nod: 0, verdict: null, skyDone: false,
    th: 0, tv: 0, redT: 0, greenT: 0, tickT: 0, drops: 0, curve: null, jolt: null, nextCurve: 4, nextJolt: 31, station: 0, green: 0, total: 0, steadyBest: 0, piesMotel: 3,
    kicks: 0, quiet: false, bolt: 0,
    lane: 1, cx: LANES[1], obs: [], rowT: 0.8, lost: 0, hits: 0, inv: 0, coffee: 0, clean: 0, cleanBest: 0, dodges: 0, scroll: 0, pieIdx: 0, rowN: 0, lastFree: 1,
    arrival: 0 };
  parts.length = 0; floats.length = 0;
  V.kickT = 9; V.dropT = 9; V.nodT = 9; V.fly.length = 0; V.boxFall.length = 0; V.pieGrab = 9; V.hitT = 9;
  buildBeats();
  ledClear();
  if (K) dressAll();
}
function buildBeats() {
  const c = CONFIG.sky, b = S.beats;
  let t, k = 0;
  for (t = c.p1.from; t <= c.p1.to; t += c.p1.step) b.push({ t: t, appr: c.p1.appr, topic: TOPICS[k++ % TOPICS.length] });
  for (t = c.p2.from; t <= c.p2.to; t += c.p2.step) b.push({ t: t, appr: c.p2.appr, topic: TOPICS[k++ % TOPICS.length], turb: true });
  for (let g = 0; g < c.p3.groups.length; g++) for (let j = 0; j < 3; j++) b.push({ t: c.p3.groups[g] + j * c.p3.gap, appr: c.p3.appr, topic: "photos", slide: true, turb: true });
  b.push({ t: c.giant.t, appr: c.giant.appr, topic: "photos", giant: true });
}
function clock() {
  let add = 0;
  const ph = S.phase;
  if (ph === "home") return S.arrival;
  if (ph === "sky" || ph === "rails" || ph === "motel" || ph === "road") add = CONFIG[ph].travel * clamp(S.pt / CONFIG[ph].dur, 0, 1);
  return S.base + add + S.delay;
}
// travel minutes still ahead (so the clock can turn orange when dinner is at risk)
function remainingTravel() {
  const order = ["sky", "rails", "motel", "road"], ph = S.phase;
  let i;
  if (ph === "intro") i = 0;
  else if (ph === "howto") i = S.leg === 2 ? 3 : S.leg;
  else if (ph === "exit") i = S.leg === 0 ? 1 : S.leg === 1 ? 2 : 4;
  else if (ph === "home") i = 4;
  else i = order.indexOf(ph);
  let sum = 0;
  for (let j = i; j < 4; j++) sum += CONFIG[order[j]].travel;
  if (order[i] === ph) sum -= CONFIG[ph].travel * clamp(S.pt / CONFIG[ph].dur, 0, 1);
  return sum;
}
function addDelay(min, x, y) {
  S.delay += min;
  pop("+" + min + " MIN", x == null ? W - 50 : x, y == null ? 50 : y, "#ff4b3e", 1.1);
}
function go(ph) { S.phase = ph; S.pt = 0; }

/* ---------------- Update ---------------- */
function update(dt) {
  S.t += dt; S.pt += dt;
  const p = S.phase;
  if (p === "intro") { if (S.pt > CONFIG.intro) { go("howto"); S.leg = 0; } }
  else if (p === "howto") { if (S.pt > CONFIG.howto) startLeg(); }
  else if (p === "sky") updSky(dt);
  else if (p === "rails") updRails(dt);
  else if (p === "motel") updMotel(dt);
  else if (p === "road") updRoad(dt);
  else if (p === "exit") { if (S.pt > CONFIG.exit) afterExit(); }
  else if (p === "home") updHome(dt);
  tick(dt);
}
function startLeg() {
  const k = LEGS[S.leg].key;
  go(k); if (k === "road") S.cx = LANES[S.lane];
  sfx("start");
  if (k === "rails") ledPlay([ledMsg("slide", "NOW BOARDING: COACH CAR 3", 2.4, { color: "lime" })]);
}
function endLeg(grade, title, sub) {
  const leg = LEGS[S.leg];
  S.base += CONFIG[leg.key].travel;
  S.grades[S.leg] = grade;
  S.exitInfo = { grade: grade, title: title, sub: sub };
  S.hold = false;
  go("exit");
  sfx("ding"); tone(523, 0.08, "square", 0.2, 0, 0.3); tone(784, 0.16, "square", 0.2, 0, 0.4);
  Sh.shake(4, 0.2);
  Juke.sfx("grade", grade === "A" ? 1 : 0, 0.45);
  if (leg.key === "rails") ledPlay([ledMsg("blink", "END OF LINE (TONIGHT)", 2.6, { color: "red" })]);
}
function afterExit() {
  if (S.leg === 0) { S.leg = 1; go("howto"); }
  else if (S.leg === 1) { S.piesMotel = S.pies; if (S.pies >= 2) unlock("gob-courier"); go("motel"); ledPlay([ledMsg("cycle", "VACANCY! WELCOME TRAVELERS", 3, {})]); }
  else { S.arrival = S.base + S.delay; go("home"); S.homeSfx = 0; }
}

/* ---- SKY ---- */
function updSky(dt) {
  const c = CONFIG.sky, t = S.pt;
  let i, b;
  S.nod = Math.max(0, S.nod - dt * 4);
  for (i = 0; i < S.beats.length; i++) {
    b = S.beats[i];
    if (!b.spawned && t >= b.t - b.appr) { b.spawned = true; S.bubbles.push({ topic: b.topic, giant: b.giant, t: 0, x: rnd(-14, 14), y: 0 }); if (!b.slide || Math.random() < 0.5) tone(300 + Math.random() * 200, 0.05, "triangle", 0.08); V.talk = 0.6; }
    if (!b.done && t > b.t + c.good) { b.done = true; judge(b, "MISS"); }
  }
  for (i = S.bubbles.length - 1; i >= 0; i--) { b = S.bubbles[i]; b.t += dt; b.y -= dt * 14; if (b.t > 1.8) S.bubbles.splice(i, 1); }
  if (t > c.dur) {
    S.skyDone = true; unlock("gob-wheels"); if (S.misses === 0) unlock("gob-saint");
    const acc = (S.perfects + 0.6 * S.goods) / S.beats.length;
    endLeg(acc >= 0.85 ? "A" : acc >= 0.65 ? "B" : acc >= 0.45 ? "C" : "D", "WEATHER DIVERSION", "Landed at the wrong airport. Off to the train.");
  }
}
function nodTap() {
  const c = CONFIG.sky, t = S.pt;
  let best = null;
  for (let i = 0; i < S.beats.length; i++) { const b = S.beats[i]; if (b.done) continue; if (Math.abs(t - b.t) <= c.early) { best = b; break; } if (b.t - t > c.early) break; }
  S.nod = 1; V.nodT = 0;
  if (!best) { tone(240, 0.03, "square", 0.06); return; }
  best.done = true;
  const d = Math.abs(t - best.t);
  judge(best, d <= c.perfect ? "PERFECT" : d <= c.good ? "GOOD" : "MISS");
}
function mult() { return S.streak >= 20 ? 4 : S.streak >= 10 ? 3 : S.streak >= 5 ? 2 : 1; }
function judge(b, v) {
  const c = CONFIG.sky, gx = b.giant ? c.giant.x : 1;
  S.verdict = { v: v, t: 0 };
  if (v === "MISS") {
    S.misses++; if (S.streak >= 5) pop("STREAK LOST", 180, 360, "#8e93a2");
    S.streak = 0; addDelay(c.miss, 180, 470);
    sfx("miss"); Sh.shake(3, 0.15);
    return;
  }
  if (v === "PERFECT") { S.perfects++; S.streak++; } else S.goods++;
  if (S.streak > S.streakBest) S.streakBest = S.streak;
  const pts = (v === "PERFECT" ? c.pts : c.pts / 2) * mult() * gx;
  S.pts.sky += pts; S.score += pts;
  pop("+" + pts, 180 + rnd(-30, 30), 380, v === "PERFECT" ? INK.gold : "#3ff0ff");
  if (v === "PERFECT") { tone(1046 + Math.min(S.streak, 20) * 20, 0.06, "square", 0.14); tone(1568, 0.08, "triangle", 0.1, 0, 0.04); }
  else tone(784, 0.05, "triangle", 0.14);
  sparkle(180, 430, v === "PERFECT" ? 10 : 5, [INK.gold, INK.cream, INK.pumpkin]);
  if (b.giant) { Sh.flash("HE FINALLY STOPPED", "Giant nod x" + gx, INK.gold, 1100); if (NR()) NR().burst(null, null, 30); Juke.sfx("fanfare"); }
  if (S.streak === 5) streakPill("NODDING ALONG", "#3ff0ff");
  if (S.streak === 10) { streakPill("WORLD'S BEST LISTENER", INK.gold); unlock("gob-nod"); }
  if (S.streak === 20) streakPill("SAINTLY PATIENCE", INK.pumpkin);
}
function streakPill(label, col) { if (NR()) NR().streak(5, label, col); else Sh.flash(label, "", col, 900); Juke.sfx("streak"); }

/* ---- RAILS ---- */
function zone() { return CONFIG.rails.zones[S.station]; }
function updRails(dt) {
  const c = CONFIG.rails, t = S.pt, lvl = S.station;
  if (S.station < 2 && t >= c.stations[S.station]) {
    S.station++; Sh.flash("STATION STOP", "One more box on the tower", "#9bff3f", 1000); sfx("ding");
    S.redT = 0;
    ledPlay([ledMsg("flash", "STATION STOP", 1.4), ledMsg("slide", "ONE MORE BOX ON THE TOWER", 2.2, { color: "lime" })]);
  }
  // sway: train rocking plus telegraphed curves and brake jolts
  let sway = c.sway[lvl] * (Math.sin(t * 1.3) * 0.8 + Math.sin(t * 2.7 + 1.3) * 0.5 + Math.sin(t * 0.55 + 2) * 0.4);
  if (!S.curve && t >= S.nextCurve && t < c.dur - 2) { S.curve = { t: 0, dir: Math.random() < 0.5 ? -1 : 1 }; S.nextCurve = t + c.curveEvery + rnd(-1, 1.2); }
  if (S.curve) { S.curve.t += dt; if (S.curve.t > 1) sway += S.curve.dir * c.curve * (1 + lvl * 0.15); if (S.curve.t > 2.8) S.curve = null; }
  if (!S.jolt && t >= S.nextJolt && t >= c.joltFrom && t < c.dur - 1) { S.jolt = { t: 0, dir: Math.random() < 0.5 ? -1 : 1, hit: false }; S.nextJolt = t + c.joltEvery + rnd(-0.6, 0.8); tone(330, 0.3, "square", 0.12); tone(277, 0.3, "square", 0.12, 0, 0.32); }
  if (S.jolt) { S.jolt.t += dt; if (S.jolt.t > 0.85 && !S.jolt.hit) { S.jolt.hit = true; S.tv += S.jolt.dir * c.jolt; Sh.shake(6, 0.25); camShake(0.08, 0.3); Sh.noise(0.25, 0.4, 300, 0.7); } if (S.jolt.t > 1.4) S.jolt = null; }
  S.sway = sway;
  const acc = (S.hold ? c.push : -c.drift) + sway - c.damp * S.tv;
  S.tv += acc * dt; S.th += S.tv * dt;
  if (S.th > 1.15) { S.th = 1.15; S.tv = Math.min(0, S.tv); } if (S.th < -1.15) { S.th = -1.15; S.tv = Math.max(0, S.tv); }
  S.total += dt;
  if (Math.abs(S.th) <= zone()) {
    S.redT = 0; S.green += dt; S.greenT += dt; S.tickT += dt;
    if (S.greenT > S.steadyBest) S.steadyBest = S.greenT;
    if (S.tickT >= c.tick) { S.tickT -= c.tick; const pts = c.pts + Math.min(10, Math.floor(S.greenT / 2)); S.pts.rails += pts; S.score += pts; if (Math.random() < 0.5) tone(1200 + Math.min(S.greenT, 20) * 30, 0.02, "square", 0.05); }
    if (S.greenT >= 10 && !S.steady10) { S.steady10 = true; streakPill("STEADY HANDS", "#9bff3f"); }
    if (S.greenT >= 20 && !S.steady20) { S.steady20 = true; streakPill("ROCK STEADY", INK.gold); }
  } else {
    S.greenT = 0; S.steady10 = false; S.steady20 = false; S.redT += dt;
    if (S.redT >= c.red) dropBox();
  }
  if (t > c.dur) {
    const f = S.green / Math.max(1, S.total);
    endLeg(f >= 0.85 && S.drops === 0 ? "A" : f >= 0.7 ? "B" : f >= 0.5 ? "C" : "D", "END OF LINE (TONIGHT)", "The train stopped at a nameless platform. Motel ahead.");
  }
}
function dropBox() {
  const c = CONFIG.rails;
  const dir = S.th >= 0 ? 1 : -1;
  S.redT = 0; S.drops++; S.th *= 0.3; S.tv = 0;
  addDelay(c.drop, 180, 300);
  if (S.pies > 1) {
    V.boxFall.push({ t: 0, dir: dir, n: S.pies + S.station - 1 });
    S.pies--;
    Sh.flash("PIE OVERBOARD", "-1 pie, +" + c.drop + " min", "#ff4b3e", 900);
    ledPlay([ledMsg("blink", "PIE OVERBOARD", 1.6, { color: "red" })]);
    for (let i = 0; i < 16; i++) parts.push({ x: 180 + dir * 40, y: 200, vx: rnd(-160, 160), vy: rnd(-200, -60), t: 0, life: 0.9, c: i % 2 ? "#e0a13a" : INK.cream, s: 3 });
  } else { Sh.flash("CAUGHT IT!", "Last pie saved, +" + c.drop + " min", INK.gold, 900); V.dropT = 0; }
  sfx("miss"); Sh.noise(0.3, 0.5, 600, 0.6); Sh.shake(5, 0.2);
}

/* ---- MOTEL ---- */
function updMotel() {
  if (S.pt > CONFIG.motel.dur) { S.base += CONFIG.motel.travel; S.leg = 2; go("howto"); }
}
function kick() {
  if (S.quiet || S.pt < 0.3) return;
  S.kicks++; V.kickT = 0; Sh.shake(4, 0.12); Sh.noise(0.12, 0.5, 900, 0.8); tone(140, 0.08, "square", 0.2);
  sparkle(262, 330, 6, ["#cfe9f2", "#ffffff"]);
  if (S.kicks >= CONFIG.motel.kicks) {
    S.quiet = true; S.bolt = 1; unlock("gob-ice");
    Sh.flash("GOOD NIGHT'S SLEEP", "Well, a good nap. The car starts one hit sturdier", INK.gold, 1400); sfx("best");
    ledPlay([ledMsg("cycle", "AHHH. QUIET.", 2.2, {}), ledMsg("slide", "EXTRA BOLT EARNED", 2.4, { color: "yellow" })]);
  }
}

/* ---- ROAD ---- */
function roadPhase(t) { const c = CONFIG.road; return t < c.fastAt ? 0 : t < c.snowAt ? 1 : 2; }
function speed(t) { return CONFIG.road.speed * (roadPhase(t) > 0 ? CONFIG.road.fast : 1); }
const OBS = { cone: { hw: 11, h: 22 }, hole: { hw: 15, h: 18 }, leaves: { hw: 18, h: 22 }, mattress: { hw: 21, h: 34 }, turkey: { hw: 22, h: 40 }, coffee: { hw: 10, h: 14, good: 1 }, pie: { hw: 16, h: 22, good: 1 } };
function spawnRow() {
  const t = S.pt, ph = roadPhase(t), c = CONFIG.road, kinds = ["cone", "hole", "leaves", "mattress"];
  S.rowN++;
  let free = Math.floor(Math.random() * 3);
  // pairs mode: the open lane moves at most one lane per row, so it is always reachable
  if (ph === 2 && Math.abs(free - S.lastFree) > 1) free = 1;
  if (ph >= 1 && Math.random() < 0.16 && !S.turkeyOn) {
    const from = Math.random() < 0.5 ? 0 : 2;
    S.obs.push({ k: "turkey", x: LANES[from], y: -40, vx: (from === 0 ? 1 : -1) * 34, ph: Math.random() * TAU, id: S.rowN * 4 });
    S.turkeyOn = true; free = 2 - from;
  } else if (ph === 2) {
    for (let i = 0; i < 3; i++) if (i !== free) S.obs.push({ k: kinds[Math.floor(Math.random() * kinds.length)], x: LANES[i], y: -30, id: S.rowN * 4 + i });
  } else {
    const blk = Math.floor(Math.random() * 3);
    S.obs.push({ k: kinds[Math.floor(Math.random() * kinds.length)], x: LANES[blk], y: -30, id: S.rowN * 4 });
    free = (blk + 1 + Math.floor(Math.random() * 2)) % 3;
  }
  S.lastFree = free;
  const pieDue = S.pieIdx < c.pieAt.length && t >= c.pieAt[S.pieIdx];
  if (pieDue) { S.pieIdx++; if (S.pies < 3) S.obs.push({ k: "pie", x: LANES[free], y: -110, id: S.rowN * 4 + 3 }); }
  else if (Math.random() < c.coffeeP) S.obs.push({ k: "coffee", x: LANES[free], y: -110, id: S.rowN * 4 + 3 });
  S.rowT = c.gap[ph] + rnd(-0.08, 0.1);
}
function updRoad(dt) {
  const c = CONFIG.road, t = S.pt, v = speed(t);
  S.scroll += v * dt; S.inv = Math.max(0, S.inv - dt);
  S.cx += clamp(LANES[S.lane] - S.cx, -dt * 60 / 0.11, dt * 60 / 0.11);
  if (t < c.dur - 1.6) { S.rowT -= dt; if (S.rowT <= 0) spawnRow(); }
  if (S.phaseShown !== roadPhase(t)) {
    S.phaseShown = roadPhase(t);
    if (S.phaseShown === 1) Sh.flash("OPEN ROAD", "Speeding up", INK.pumpkin, 900);
    if (S.phaseShown === 2) Sh.flash("SNOW!", "Watch the headlights", "#cfe9f2", 1000);
  }
  for (let i = S.obs.length - 1; i >= 0; i--) {
    const o = S.obs[i], d = OBS[o.k];
    o.y += v * dt;
    if (o.k === "turkey") { o.x += o.vx * dt; o.ph += dt * 3; if (o.x < LANES[0] || o.x > LANES[2]) { o.x = clamp(o.x, LANES[0], LANES[2]); o.vx = -o.vx; } }
    if (!o.done && Math.abs(o.x - S.cx) < d.hw + 13 && Math.abs(o.y - CAR_Y) < d.h / 2 + 24) {
      o.done = true;
      if (d.good) { grab(o); S.obs.splice(i, 1); continue; }
      roadHit(o);
    }
    if (!o.done && !d.good && o.y > CAR_Y + 46) {
      o.done = true; S.dodges++; S.clean++; if (S.clean > S.cleanBest) S.cleanBest = S.clean;
      const pts = c.dodgePts * (1 + Math.floor(S.clean / 8)); S.pts.road += pts; S.score += pts;
      if (S.clean === 8) streakPill("SMOOTH DRIVING", INK.pumpkin);
      if (S.clean === 20) streakPill("SUNDAY DRIVER", INK.gold);
    }
    if (o.y > H + 50) { if (o.k === "turkey") S.turkeyOn = false; S.obs.splice(i, 1); }
  }
  if (t > c.dur) {
    endLeg(S.hits === 0 ? "A" : S.hits <= 2 ? "B" : S.hits <= 4 ? "C" : "D", "HOME: NEXT EXIT", S.lost >= 6 ? "What is left of the car is still rolling." : "Almost there. Smell that?");
  }
}
function hop(dir) {
  const n = clamp(S.lane + dir, 0, 2);
  if (n === S.lane) { tone(200, 0.03, "square", 0.06); return; }
  S.lane = n; V.hopDir = dir; V.hop = 1; tone(520 + n * 80, 0.04, "square", 0.1); Sh.noise(0.08, 0.12, 2000, 1);
}
function grab(o) {
  if (o.k === "coffee") {
    S.coffee++; const cp = CONFIG.road.coffeePts * Math.min(S.coffee, 10); S.pts.road += cp; S.score += cp;
    pop("COFFEE x" + S.coffee, 180, 300, "#e0a13a"); tone(988, 0.05, "square", 0.14); tone(1319, 0.08, "square", 0.12, 0, 0.05);
    if (S.coffee === 8) { streakPill("COFFEE RUN", "#e0a13a"); unlock("gob-coffee"); }
  } else {
    S.pies = Math.min(3, S.pies + 1); V.pieGrab = 0; Sh.flash("PIE STAND!", "Pie restored (" + S.pies + "/3)", INK.gold, 900); sfx("score");
    sparkle(180, 330, 14, [INK.gold, "#e0a13a", INK.cream]);
  }
}
function roadHit() {
  if (S.inv > 0) return;
  S.inv = CONFIG.road.iframes; S.hits++; S.clean = 0; V.hitT = 0;
  Sh.shake(7, 0.3); camShake(0.25, 0.3); sfx("hit");
  if (S.bolt > 0) { S.bolt--; Sh.flash("BOLT HELD", "The extra bolt took that one", INK.gold, 800); tone(1500, 0.06, "square", 0.12); return; }
  addDelay(CONFIG.road.hit, 180, 300);
  if (S.lost < 6) {
    const name = PARTS[S.lost];
    V.fly.push({ part: S.lost, t: 0, vx: rnd(-5, 5), vy: rnd(6, 9), vz: rnd(4, 9), spin: rnd(-12, 12) });
    S.lost++;
    Sh.flash("CLANK!", "Lost the " + name.toLowerCase(), "#ff4b3e", 800);
    tone(180, 0.12, "square", 0.22, 90); Sh.noise(0.2, 0.5, 2600, 1.5);
    if (S.lost === 6) setTimeout(function () { if (S.phase === "road") Sh.flash("JUST THE SEAT", "Still rolling", INK.gold, 900); }, 850);
  } else Sh.flash("BONK", "Nothing left to lose", "#ff4b3e", 600);
}

/* ---- HOME ---- */
function onTime() { return S.arrival <= CONFIG.dinnerMin; }
function updHome() {
  const t = S.pt;
  if (t > 2.4 && S.homeSfx === 0) { S.homeSfx = 1; Sh.noise(0.5, 0.5, 1500, 0.6); tone(220, 0.1, "square", 0.2, 110); tone(160, 0.1, "square", 0.2, 80, 0.15); }
  if (t > 5 && S.homeSfx === 1) {
    S.homeSfx = 2;
    if (onTime()) { sfx("crowd"); sfx("best"); Juke.sfx("fanfare"); }
    else { tone(392, 0.2, "triangle", 0.2); tone(330, 0.3, "triangle", 0.2, 0, 0.22); }
  }
  if (t > CONFIG.home) finish();
}

function tick(dt) {
  for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.t += dt; if (q.t >= q.life) { parts.splice(i, 1); continue; } q.vy += 420 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
  for (let i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; floats[i].y -= 26 * dt; if (floats[i].t > floats[i].life) floats.splice(i, 1); }
  if (S.verdict) S.verdict.t += dt;
}
function sparkle(x, y, n, cols) {
  if (Sh.reduced) n = Math.min(n, 4);
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = 50 + Math.random() * 150; parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, life: 0.35 + Math.random() * 0.4, c: cols[i % cols.length], s: Math.random() < 0.3 ? 3 : 2 }); }
}
function pop(s, x, y, c, life) { if (floats.length < 12) floats.push({ s: s, x: x, y: y, c: c, t: 0, life: life || 0.8 }); }

/* ---------------- Finish + results (same card, stats and unlocks as the 2D game) ---------------- */
function finish() {
  if (S.done) return;
  S.done = true;
  const B = CONFIG.bonus, spare = Math.round(CONFIG.dinnerMin - S.arrival), ok = spare >= 0;
  const bSpare = ok ? spare * B.spare : 0, bPie = S.pies * B.pie, bPart = (6 - S.lost) * B.part;
  const total = Math.round(S.pts.sky + S.pts.rails + S.pts.road + bSpare + bPie + bPart);
  const prevBest = Sh.best(), prevStreak = Number(Sh.load("bestStreak")) || 0, prevArr = Number(Sh.load("bestArrival")) || null;
  if (!prevArr || S.arrival < prevArr) Sh.save("bestArrival", Math.round(S.arrival));
  if (S.streakBest > prevStreak) Sh.save("bestStreak", S.streakBest);
  const stats = { score: total, skyDone: S.skyDone, streakBest: S.streakBest, skyMisses: S.misses, piesMotel: S.piesMotel, iceQuiet: S.quiet,
    arrived: true, arrival: Math.round(S.arrival), spare: spare, onTime: ok, railsDrops: S.drops, partsLeft: 6 - S.lost, coffee: S.coffee, roadHits: S.hits, pies: S.pies, grades: S.grades.join("") };
  if (window.GOB_LOG) window.GOB_LOG.push(stats);

  // so-close lines, picked from what almost happened
  const close = [];
  if (!ok && -spare <= 15) close.push((-spare) + (-spare === 1 ? " minute" : " minutes") + " from beating the gravy to the table.");
  if (ok && spare < 30 && spare >= 18 && S.pies === 3 && S.hits === 0) close.push((30 - spare) + " minutes from Before the Gravy.");
  if (S.misses > 0 && S.misses <= 2) close.push(S.misses === 1 ? "One miss from Saintly Patience." : "Two misses from Saintly Patience.");
  if (prevStreak && S.streakBest === prevStreak - 1) close.push("One more perfect nod for your best streak.");
  if (prevBest != null && total < prevBest && prevBest - total <= Math.max(150, prevBest * 0.08)) close.push(comma(prevBest - total) + " points from a new personal best.");
  if (S.hits === 1) close.push("Your car was one hubcap away from showroom clean.");
  if (S.pies === 2) close.push("One pie short of a full table.");

  const stamp = "ARRIVED " + clockStr(S.arrival) + ". " + (ok ? spare + (spare === 1 ? " MINUTE" : " MINUTES") + " TO SPARE." : (-spare) + ((-spare) === 1 ? " MINUTE" : " MINUTES") + " LATE.");
  const rows = [["Sky <i>grade " + (S.grades[0] || "-") + "</i>", S.pts.sky], ["Rails <i>grade " + (S.grades[1] || "-") + "</i>", S.pts.rails], ["Road <i>grade " + (S.grades[2] || "-") + "</i>", S.pts.road],
    ["Time to spare <i>" + (ok ? spare + " min" : "late") + "</i>", bSpare], ["Pies <i>" + S.pies + "/3</i>", bPie], ["Car parts <i>" + (6 - S.lost) + "/6</i>", bPart]];
  let html = '<div class="gob-stamp" style="--sc:' + (ok ? "#9bff3f" : "#ff8a1f") + '">' + stamp + '</div><div class="gob-rows">';
  for (let i = 0; i < rows.length; i++) html += '<div class="gob-row" data-v="' + Math.round(rows[i][1]) + '"><span>' + rows[i][0] + '</span><b>0</b></div>';
  html += '<div class="gob-total"><span>TOTAL</span><b>' + comma(total) + '</b></div></div>';
  ledFinal(total, ok);
  Sh.gameOver(total, { title: ok ? "HOME FOR DINNER" : "LEFTOVERS", html: html, stats: stats });

  // small unlocks (after the trophy run-end so the trophy count is fresh)
  X = extras(); X.runs++;
  const got = [], tc = window.Trophies ? window.Trophies.count(SLUG) : { got: 0, total: 11 };
  function give(id) { if (!X.got[id]) { X.got[id] = 1; got.push(id); if (id === "pumpkin" || id === "cran") X.paint = id; } }
  give("earmuffs"); if (ok) give("scarf"); if (S.pies === 3) give("hat"); if (X.runs >= 3) give("pumpkin"); if (tc.got >= 5) give("cran"); if (tc.total && tc.got >= tc.total) give("gold");
  saveExtras(X); if (K) dressAll();
  let after = document.getElementById("gob-after");
  if (!after) { after = document.createElement("div"); after.id = "gob-after"; const card = document.querySelector("#np-ov-over .np-card"); if (card) card.appendChild(after); }
  let ah = "";
  for (let i = 0; i < Math.min(2, close.length); i++) ah += '<p class="gob-close">' + close[i] + '</p>';
  for (let i = 0; i < got.length; i++) { const u = UNLOCKS.filter(function (z) { return z.id === got[i]; })[0]; ah += '<p class="gob-unl">UNLOCKED: ' + u.name + '</p>'; }
  const ba = Number(Sh.load("bestArrival"));
  if (ba) ah += '<p class="np-extra">Best arrival ' + clockStr(ba) + ' | nod streak ' + S.streakBest + ' | coffee ' + S.coffee + '</p>';
  after.innerHTML = ah;
  countRows();
  refreshTitle();
}
function countRows() {
  const rows = document.querySelectorAll("#np-over-extra .gob-row"), tot = document.querySelector("#np-over-extra .gob-total");
  let k = 0;
  if (Sh.reduced || !rows.length) { for (let i = 0; i < rows.length; i++) { rows[i].classList.add("on"); rows[i].querySelector("b").textContent = comma(rows[i].getAttribute("data-v")); } if (tot) tot.classList.add("on"); return; }
  function nextRow() {
    if (Sh.state() !== "over") return;
    if (k >= rows.length) { if (tot) { tot.classList.add("on"); tone(196, 0.12, "square", 0.25); Sh.noise(0.15, 0.5, 400, 0.6); } return; }
    const r = rows[k++], b = r.querySelector("b"), v = Number(r.getAttribute("data-v")), t0 = performance.now(), dur = v ? 320 : 60;
    let last = -1;
    r.classList.add("on");
    (function step(now) {
      if (Sh.state() !== "over") return;
      const f = Math.min(1, (now - t0) / dur), n = Math.round(v * f);
      if (n !== last) { last = n; b.textContent = comma(n); if (v) tone(900 + 700 * f + k * 60, 0.015, "square", 0.04); }
      if (f < 1) requestAnimationFrame(step); else setTimeout(nextRow, 90);
    })(t0);
  }
  setTimeout(nextRow, 350);
}

/* ---------------- Input: one tap or hold everywhere (the 2D game's, untouched) ---------------- */
function press(down, x) {
  const p = S.phase;
  S.hold = down;
  if (!down) return;
  if (p === "intro") { if (S.pt > 0.5) { go("howto"); S.leg = 0; } }
  else if (p === "howto") { if (S.pt > 0.45) startLeg(); }
  else if (p === "sky") nodTap();
  else if (p === "motel") kick();
  else if (p === "road") hop(x < W / 2 ? -1 : 1);
  else if (p === "exit") { if (S.pt > 0.9) afterExit(); }
  else if (p === "home") { if (S.pt > 2.5 && S.pt < 6) S.pt = 6; else if (S.pt > 6.6) finish(); }
}
function pointer(type, x) {
  if (type === "down") press(true, x);
  else if (type === "up" || type === "cancel") press(false, x);
}
let keyHeld = {};
function key(type, code) {
  const down = type === "down";
  if (down && keyHeld[code]) return;   // ignore key repeat
  keyHeld[code] = down;
  if (S.phase === "road") {
    if (down && (code === "ArrowLeft" || code === "KeyA")) return hop(-1);
    if (down && (code === "ArrowRight" || code === "KeyD")) return hop(1);
    if (code !== "Space" && code !== "Enter") return;
  }
  if (code === "Space" || code === "Enter" || code === "ArrowUp" || code === "ArrowLeft" || code === "ArrowRight" || code === "KeyA" || code === "KeyD") {
    if (S.phase === "road") return;
    press(down, W / 2);
  }
}

/* ---------------- Music: "Gravy Train Shuffle", an original loop made in code ----------------
   startMusic(ctx, dest) plays a sixteen-bar holiday loop in F major on any AudioContext into any node, and
   returns a stop function. It knows nothing about the game: no state, no globals, its own scheduler. Lead on a
   soft square, a bell counter-line, walking bass, a plucked arpeggio, a warm pad, a kick and snare, and jingle
   bells on the off-beats. About 34 seconds a pass at 112 BPM. */
function startMusic(ctx, dest) {
  const BPM = 112, STEP = 60 / BPM / 4, STEPS = 256, AHEAD = 0.9;
  const CH = { F: [41, 57, 60, 65], Am: [45, 57, 60, 64], Bb: [46, 58, 62, 65], C: [48, 55, 60, 64], Dm: [38, 57, 62, 65], Gm: [43, 55, 58, 62] };
  const PROG = "F Am Bb C F Dm Gm C Bb C Am Dm Gm C F F".split(" ");
  const BARS = [
    "0A4-2 2C5-2 4F5-3 7E5-1 8F5-2 10A5-2 12G5-4",
    "0E5-2 2A4-2 4C5-3 7E5-1 8A5-4 12G5-2 14E5-2",
    "0F5-2 2D5-2 4Bb4-3 7D5-1 8F5-2 10Bb5-2 12A5-2 14F5-2",
    "0G5-3 3E5-1 4C5-2 6E5-2 8G5-4 12A5-1 13G5-1 14F5-1 15E5-1",
    "0F5-2 2A5-2 4C6-3 7A5-1 8F5-2 10C5-2 12F5-4",
    "0D5-2 2F5-2 4A5-3 7G5-1 8F5-2 10E5-2 12D5-4",
    "0Bb4-2 2D5-2 4G5-3 7F5-1 8D5-2 10G5-2 12Bb5-4",
    "0C6-4 4Bb5-2 6A5-2 8G5-4 12E5-2 14C5-2",
    "0D5-2 2F5-2 4Bb5-4 8A5-2 10F5-2 12D5-4",
    "0E5-2 2G5-2 4C6-4 8Bb5-2 10G5-2 12E5-4",
    "0C5-2 2E5-2 4A5-4 8G5-2 10E5-2 12C5-4",
    "0D5-2 2F5-2 4A5-3 7Bb5-1 8A5-2 10F5-2 12D5-4",
    "0G4-2 2Bb4-2 4D5-2 6G5-2 8F5-2 10D5-2 12Bb4-4",
    "0C5-2 2E5-2 4G5-2 6Bb5-2 8C6-3 11Bb5-1 12A5-2 14G5-2",
    "0F5-6 6E5-2 8F5-2 10A5-2 12C6-4",
    "0A5-4 4G5-2 6E5-2 8F5-8"
  ];
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const LEAD = new Array(STEPS).fill(null);
  BARS.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(b?)(\d)-(\d+)$/.exec(tok);
      if (m) LEAD[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + SEMI[m[2]] - (m[3] ? 1 : 0), Number(m[5])];
    });
  });
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  const out = ctx.createGain(); out.gain.value = 1; out.connect(dest);
  const lead = ctx.createBiquadFilter(); lead.type = "lowpass"; lead.frequency.value = 2600; lead.Q.value = 0.8; lead.connect(out);
  const echo = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
  echo.delayTime.value = STEP * 3; fb.gain.value = 0.28; wet.gain.value = 0.22;
  lead.connect(echo); echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(out);
  const low = ctx.createBiquadFilter(); low.type = "lowpass"; low.frequency.value = 800; low.connect(out);
  const padF = ctx.createBiquadFilter(); padF.type = "lowpass"; padF.frequency.value = 1100; padF.Q.value = 0.5; padF.connect(out);
  const len = Math.floor(ctx.sampleRate * 1.5), nb = ctx.createBuffer(1, len, ctx.sampleRate), nd = nb.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; nd[i] = seed / 1073741823.5 - 1; }

  function note(d, type, f, t, dur, vol, f1, hold) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.01, dur * (hold == null ? 0.6 : hold));
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(d); o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(d, t, dur, vol, type, f, q) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nb; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(d); s.start(t, (t * 7.3) % 1); s.stop(t + dur + 0.05);
  }
  function jingle(t, v) {                                   // a little bunch of bells: three bright pings a hair apart
    for (let k = 0; k < 3; k++) hiss(out, t + k * 0.011, 0.07, v * (1 - k * 0.25), "bandpass", 7200 + k * 1300, 9);
  }
  function play(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[bar]], n = LEAD[i], second = bar >= 8;
    if (n) { note(lead, "square", hz(n[0]), t, n[1] * STEP * 0.95, 0.15); note(lead, "triangle", hz(n[0] + 12), t, n[1] * STEP * 0.8, 0.05); }
    if (s === 0) {                                          // the pad: the bar's chord, held, a little detuned
      for (let k = 1; k < 4; k++) { note(padF, "sawtooth", hz(ch[k]) * 0.997, t, STEP * 16, 0.028, 0, 0.85); note(padF, "sawtooth", hz(ch[k]) * 1.003, t, STEP * 16, 0.028, 0, 0.85); }
      if (bar % 2 === 1) note(out, "sine", hz(ch[3] + 24), t, 1.2, 0.07, 0, 0.05);   // sleigh-bell glock on every other bar
    }
    if (!(s & 1)) {
      const k = s >> 1;
      if (k % 2 === 0) note(low, "triangle", hz(ch[0] + (k === 2 || k === 6 ? 7 : 0)), t, STEP * 3.6, 0.42, 0, 0.7);   // root, fifth
      note(out, "triangle", hz(ch[1 + [0, 1, 2, 1][k & 3]] + (second ? 12 : 0)), t, STEP * 1.4, 0.06);                  // the pluck
    }
    if (s === 2 || s === 6 || s === 10 || s === 14) jingle(t, second ? 0.16 : 0.12);
    if (s % 4 === 0) hiss(out, t, 0.03, 0.04, "highpass", 8000);
    if (s === 4 || s === 12) { hiss(out, t, 0.14, 0.22, "bandpass", 1700, 0.6); note(out, "triangle", 190, t, 0.08, 0.12, 120, 0.1); }
    if (s === 0 || s === 8 || (s === 10 && bar % 4 === 3)) note(out, "sine", 140, t, 0.17, 0.55, 40, 0.06);
    if (bar % 8 === 7 && s >= 12) hiss(out, t, 0.08, 0.1 + (s - 12) * 0.04, "bandpass", 1900, 0.8);   // a little fill
  }
  let step = 0, nextT = ctx.currentTime + 0.12, live = true;
  function pump() {
    if (!live) return;
    const now = ctx.currentTime;
    if (nextT < now) nextT = now + 0.03;
    while (nextT < now + AHEAD) { play(step, nextT); step = (step + 1) % STEPS; nextT += STEP; }
  }
  pump();
  const timer = setInterval(pump, 80);
  return function stop() {
    if (!live) return;
    live = false; clearInterval(timer);
    const now = ctx.currentTime;
    out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(out.gain.value, now); out.gain.linearRampToValueAtTime(0, now + 0.15);
    setTimeout(function () { try { out.disconnect(); } catch (e) { /* gone already */ } }, 400);
  };
}

/* ---------------- Sound manager: music on/off (remembered), the shell's mute, a few stingers ----------------
   The shell still plays every sound effect the 2D game had. Nothing here is created until the first tap,
   click or key press, and the music only plays while a run is on. */
const MUSIC_VOL = 0.16, STING_VOL = 0.2, MUSIC_KEY = "npArcade.music";
const Juke = (function () {
  let A = null, dead = false, muted = false, stopFn = null;
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
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
        A.out.connect(comp); comp.connect(c.destination);
        A.music.gain.value = MUSIC_VOL; A.music.connect(A.out);
        A.sting.gain.value = STING_VOL; A.sting.connect(A.out);
        muted = shellMuted(); A.out.gain.value = muted ? 0 : 1;
        setInterval(pump, 150);
      }
      if (A.c.state !== "running") { const p = A.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { A = null; dead = true; }
  }
  function pump() {
    if (!A || !window.Shell) return;
    const m = shellMuted();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, A.c.currentTime, 0.02); }
    const want = musicOn && !muted && A.c.state === "running" && Shell.state() === "playing";
    if (want && !stopFn) stopFn = startMusic(A.c, A.music);
    else if (!want && stopFn) { stopFn(); stopFn = null; }
  }
  function o(f, t, dur, vol, type, f1) {
    const os = A.c.createOscillator(), g = A.c.createGain();
    os.type = type || "square"; os.frequency.setValueAtTime(f, t); if (f1) os.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    os.connect(g); g.connect(A.sting); os.start(t); os.stop(t + dur + 0.03);
  }
  function sfx(name, x, delay) {
    if (!A || muted || A.c.state !== "running") return;
    const t = A.c.currentTime + 0.01 + (delay || 0);
    try {
      if (name === "fanfare") { [65, 69, 72, 77].forEach(function (m, i) { o(440 * Math.pow(2, (m - 57) / 12), t + i * 0.09, 0.16, 0.24); }); [77, 81, 84].forEach(function (m) { o(440 * Math.pow(2, (m - 57) / 12), t + 0.4, 0.7, 0.14, "triangle"); }); }
      else if (name === "streak") { o(1046, t, 0.07, 0.2); o(1568, t + 0.07, 0.12, 0.2); o(2093, t + 0.15, 0.2, 0.14, "triangle"); }
      else if (name === "grade") { if (x) { o(1319, t, 0.1, 0.2); o(1760, t + 0.1, 0.3, 0.2, "triangle"); } else o(659, t, 0.2, 0.18, "triangle"); }
    } catch (e) { /* sound is never worth a crash */ }
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
  return {
    unlock: unlock, pump: pump, sfx: sfx, button: button,
    newGame: function () { unlock(); if (stopFn) { stopFn(); stopFn = null; } pump(); },
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    peek: function () { return { made: !!A, state: A ? A.c.state : "none", playing: !!stopFn, muted: muted, musicOn: musicOn }; }
  };
})();

/* ---------------- Small helpers ---------------- */
function rng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const vrand = (function () { let s = 0x2545F491; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; })();
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
function speckle(g, w, h, n, rnd, light, dark) {
  for (let i = 0; i < n; i++) { g.fillStyle = rnd() < 0.5 ? light : dark; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
}
function bold(size) { return "900 " + size + 'px "Arial Black", "Arial Bold", Verdana, sans-serif'; }

/* ---------------- Painted textures (all drawn here, no image files besides the wordmark) ---------------- */

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
function candyText(g, str, x, y, size, maxW, top, bot) {
  g.font = bold(size);
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = bold(size); }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = size * 0.36; g.strokeStyle = "#2a1408"; g.strokeText(str, x, y + size * 0.06);
  g.lineWidth = size * 0.17; g.strokeStyle = "#fff1d6"; g.strokeText(str, x, y);
  const gr = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  gr.addColorStop(0, top || "#ffe27a"); gr.addColorStop(0.55, "#ffb23a"); gr.addColorStop(1, bot || "#e0601a");
  g.fillStyle = gr; g.fillText(str, x, y);
}
// Fabric: a base color, a weave, and soft darker creases so clothes read as cloth with folds.
function clothCanvas(base, crease, seed, opt) {
  opt = opt || {};
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(seed || 5);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 2600, rnd, "rgba(255,255,255,.05)", "rgba(0,0,0,.08)");
  if (opt.denim) { g.strokeStyle = "rgba(255,255,255,.06)"; g.lineWidth = 1; for (let i = -256; i < 256; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke(); } }
  g.lineCap = "round";
  for (let i = 0; i < (opt.folds || 14); i++) {                   // folds: soft dark crease with a light edge beside it
    const x = rnd() * 256, y = rnd() * 256, l = 30 + rnd() * 50, a = (rnd() - 0.5) * 0.9 + (opt.vertical ? Math.PI / 2 : 0);
    const dx = Math.cos(a) * l, dy = Math.sin(a) * l;
    g.strokeStyle = crease; g.lineWidth = 3 + rnd() * 3;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + dx * 0.5 + 8, y + dy * 0.5 - 6, x + dx, y + dy); g.stroke();
    g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x + 3, y + 3); g.quadraticCurveTo(x + dx * 0.5 + 11, y + dy * 0.5 - 3, x + dx + 3, y + dy + 3); g.stroke();
  }
  if (opt.seam) { g.strokeStyle = opt.seam; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(0, 6); g.lineTo(256, 6); g.moveTo(0, 250); g.lineTo(256, 250); g.stroke(); g.setLineDash([]); }
  return c;
}
// The mascot's tee: black cotton with folds, the script wordmark on the chest (u = 0.25 faces front on the lathe).
function teeCanvas(script) {
  const c = clothCanvas("#1b1b22", "rgba(0,0,0,.45)", 11, { folds: 18 }), g = c.getContext("2d");
  g.fillStyle = "rgba(255,255,255,.04)"; g.fillRect(0, 0, 256, 256);
  drawScript(g, script, 0, 104, 74, 36); drawScript(g, script, 256, 104, 74, 36);
  drawScript(g, script, 128, 96, 40, 20);
  g.strokeStyle = "rgba(255,255,255,.14)"; g.lineWidth = 2; g.setLineDash([5, 4]);
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 256); g.moveTo(192, 0); g.lineTo(192, 256); g.moveTo(0, 246); g.lineTo(256, 246); g.stroke(); g.setLineDash([]);
  return c;
}
// A loud souvenir sweater: knit rows, a cream band of little pine trees, snowflake dots.
function sweaterCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(21);
  g.fillStyle = "#2e8b57"; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 6) for (let x = (y / 6) % 2 * 3; x < 256; x += 6) { g.fillStyle = "rgba(0,0,0,.1)"; g.fillRect(x, y, 3, 3); }
  g.fillStyle = "#fff1d6"; g.fillRect(0, 96, 256, 54);
  g.fillStyle = "#c2304a"; g.fillRect(0, 90, 256, 6); g.fillRect(0, 150, 256, 6);
  for (let i = 0; i < 8; i++) { const x = i * 32 + 16; g.fillStyle = "#1f5a3a"; g.beginPath(); g.moveTo(x, 102); g.lineTo(x + 11, 140); g.lineTo(x - 11, 140); g.fill(); g.fillStyle = "#6a4a2a"; g.fillRect(x - 2, 140, 4, 6); }
  for (let i = 0; i < 40; i++) { g.fillStyle = "#fff1d6"; g.fillRect(rnd() * 256, rnd() < 0.5 ? rnd() * 80 : 166 + rnd() * 80, 3, 3); }
  g.strokeStyle = "rgba(0,0,0,.22)"; g.lineWidth = 4; g.lineCap = "round";
  for (let i = 0; i < 10; i++) { const x = rnd() * 256, y = rnd() * 256; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 20, y + 10, x + 40, y + 4); g.stroke(); }
  return c;
}
function plaidCanvas(a, b, line) {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.fillStyle = a; g.fillRect(0, 0, 128, 128);
  g.fillStyle = b; g.globalAlpha = 0.6;
  for (let i = 0; i < 128; i += 32) { g.fillRect(i, 0, 14, 128); g.fillRect(0, i, 128, 14); }
  g.globalAlpha = 1; g.fillStyle = line || "#ffd23f";
  for (let i = 20; i < 128; i += 32) { g.fillRect(i, 0, 2, 128); g.fillRect(0, i, 128, 2); }
  return c;
}
// A pie box lid and sides: bakery cream, a cranberry band, the script wordmark, a little window of crust.
function pieBoxCanvas(script, gold) {
  const c = mkCanvas(256, 128), g = c.getContext("2d");
  g.fillStyle = gold ? "#ffd23f" : "#f6efe0"; g.fillRect(0, 0, 256, 128);
  speckle(g, 256, 128, 900, rng(8), "rgba(255,255,255,.12)", "rgba(120,80,30,.07)");
  g.fillStyle = gold ? "#e0a13a" : "#c2304a"; g.fillRect(0, 50, 256, 26);
  g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(0, 50, 256, 3);
  drawScript(g, script, 128, 63, 140, 34);
  g.strokeStyle = gold ? "#b26a1c" : "#d9cdb3"; g.lineWidth = 6; g.strokeRect(3, 3, 250, 122);
  return c;
}
function giftCanvas(base, ribbon) {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  g.fillStyle = "rgba(255,255,255,.18)"; for (let i = 0; i < 128; i += 16) for (let j = (i / 16) % 2 * 8; j < 128; j += 16) g.fillRect(j, i, 5, 5);
  g.fillStyle = ribbon; g.fillRect(56, 0, 16, 128);
  return c;
}
function pieTopCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, "#e0952e"); gr.addColorStop(0.75, "#c9781c"); gr.addColorStop(1, "#f0c27a");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "#f6d59a"; g.lineWidth = 7;
  for (let i = 16; i < 128; i += 24) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
  return c;
}
// Blue sky with clouds, for the airplane windows (scrolled by offset).
function cloudsCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(3);
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "#3d7fd6"); gr.addColorStop(0.6, "#9ccaf2"); gr.addColorStop(1, "#e8f3ff");
  g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 512, y = 60 + rnd() * 170, r = 14 + rnd() * 26;
    g.fillStyle = "rgba(255,255,255," + (0.6 + rnd() * 0.4) + ")";
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + k * r * 0.6 - r, y + Math.sin(k) * 6, r * (0.6 + rnd() * 0.5), 0, TAU); g.fill(); g.beginPath(); g.arc(x + k * r * 0.6 - r + 512, y, r * 0.7, 0, TAU); g.fill(); }
  }
  return c;
}
// Farmland and fall trees going by a train window (scrolled by offset).
function landCanvas() {
  const c = mkCanvas(1024, 256), g = c.getContext("2d"), rnd = rng(31);
  const gr = g.createLinearGradient(0, 0, 0, 140); gr.addColorStop(0, "#f2a65a"); gr.addColorStop(1, "#ffe0a8");
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = "#b56a3a"; for (let x = -100; x < 1124; x += 180) { g.beginPath(); g.ellipse(x + rnd() * 60, 150, 140, 40, 0, 0, TAU); g.fill(); }
  g.fillStyle = "#c9a14a"; g.fillRect(0, 150, 1024, 106);
  g.fillStyle = "#a8812e"; for (let y = 160; y < 256; y += 12) g.fillRect(0, y, 1024, 3);
  const cols = ["#c2304a", "#e0662a", "#e0a13a", "#d8b23a", "#8a5a2b", "#a33a2a"];
  for (let i = 0; i < 46; i++) {
    const x = rnd() * 1024, y = 150 + rnd() * 30, r = 14 + rnd() * 18;
    g.fillStyle = "#4a2a1c"; g.fillRect(x - 2, y - 6, 4, 22);
    g.fillStyle = cols[i % cols.length];
    g.beginPath(); g.arc(x, y - r, r, 0, TAU); g.arc(x - r * 0.6, y - r * 0.6, r * 0.7, 0, TAU); g.arc(x + r * 0.6, y - r * 0.7, r * 0.7, 0, TAU); g.fill();
    if (x < 60) { g.beginPath(); g.arc(x + 1024, y - r, r, 0, TAU); g.fill(); }
  }
  for (let x = 0; x < 1024; x += 64) { g.fillStyle = "#3a2616"; g.fillRect(x, 196, 4, 60); }
  g.fillStyle = "#3a2616"; g.fillRect(0, 204, 1024, 3);
  return c;
}
function carpetCanvas(a, b, seed) {
  const c = mkCanvas(128, 128), g = c.getContext("2d"), rnd = rng(seed || 7);
  g.fillStyle = a; g.fillRect(0, 0, 128, 128);
  g.fillStyle = b;
  for (let y = 0; y < 128; y += 16) for (let x = (y / 16) % 2 * 8; x < 128; x += 16) { g.beginPath(); g.arc(x + 4, y + 4, 3, 0, TAU); g.fill(); }
  speckle(g, 128, 128, 1400, rnd, "rgba(255,255,255,.05)", "rgba(0,0,0,.1)");
  return c;
}
function woodCanvas(base, dark, seed) {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(seed || 13);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, y, 256, 2); }
  g.strokeStyle = dark; g.lineWidth = 1;
  for (let i = 0; i < 70; i++) { const y = rnd() * 256; g.globalAlpha = 0.2 + rnd() * 0.3; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x * 0.04 + i) * 2); g.stroke(); }
  g.globalAlpha = 1;
  return c;
}
function sidingCanvas(base) {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) { g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(0, y + 13, 128, 3); g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(0, y, 128, 3); }
  return c;
}
function brickCanvas(base) {
  const c = mkCanvas(128, 128), g = c.getContext("2d"), rnd = rng(19);
  g.fillStyle = "#4a3a34"; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) for (let x = (y / 16) % 2 * -16; x < 128; x += 32) {
    g.fillStyle = base; g.globalAlpha = 0.75 + rnd() * 0.25; g.fillRect(x + 1, y + 1, 30, 14);
  }
  g.globalAlpha = 1;
  return c;
}
// The road: asphalt with yellow dashes between three lanes, scrolled by offset.
function roadCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(23);
  g.fillStyle = "#3a3d45"; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 5000, rnd, "rgba(255,255,255,.07)", "rgba(0,0,0,.18)");
  g.fillStyle = "#eceae2"; g.fillRect(4, 0, 6, 256); g.fillRect(246, 0, 6, 256);
  g.fillStyle = "#ffd23f"; g.fillRect(84, 0, 5, 128); g.fillRect(167, 0, 5, 128);
  g.fillStyle = "rgba(0,0,0,.25)"; for (let i = 0; i < 6; i++) g.fillRect(40 + i * 37, 0, 10, 256);
  return c;
}
function grassCanvas(base, leafy) {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(29);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 6000, rnd, "rgba(255,255,255,.06)", "rgba(0,0,0,.1)");
  if (leafy) { const cols = ["#c2304a", "#e0662a", "#e0a13a", "#8a5a2b"]; for (let i = 0; i < 160; i++) { g.fillStyle = cols[i % 4]; g.save(); g.translate(rnd() * 256, rnd() * 256); g.rotate(rnd() * TAU); g.beginPath(); g.ellipse(0, 0, 5, 2.5, 0, 0, TAU); g.fill(); g.restore(); } }
  return c;
}
function leafCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.beginPath(); g.moveTo(32, 4);
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i / 10 * TAU, r = i % 2 ? 14 : 28; g.lineTo(32 + Math.cos(a) * r, 34 + Math.sin(a) * r); }
  g.fill();
  g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 2; g.beginPath(); g.moveTo(32, 60); g.lineTo(32, 14); g.stroke();
  return c;
}
function glowCanvas(col) {
  const c = mkCanvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.2, col || "rgba(255,230,170,.7)"); gr.addColorStop(1, "rgba(255,230,170,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(0,0,0,.75)"); gr.addColorStop(0.55, "rgba(0,0,0,.35)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
// A sign: a colored panel with a border, the wordmark and up to two lines of type.
function signCanvas(script, w, h, bg, border, lines, opts) {
  opts = opts || {};
  const c = mkCanvas(w, h), g = c.getContext("2d");
  rrectPath(g, 4, 4, w - 8, h - 8, Math.min(w, h) * 0.08); g.fillStyle = bg; g.fill();
  g.lineWidth = Math.max(4, h * 0.035); g.strokeStyle = border; g.stroke();
  let y = h * 0.5;
  if (opts.logo) { drawScript(g, script, w / 2, h * (lines.length ? 0.32 : 0.5), w * 0.8, h * (lines.length ? 0.42 : 0.8)); y = h * 0.72; }
  g.textAlign = "center"; g.textBaseline = "middle";
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i], size = L[2] || h * 0.18;
    g.font = bold(size);
    let tw = g.measureText(L[0]).width;
    if (tw > w * 0.86) g.font = bold(Math.floor(size * w * 0.86 / tw));
    g.fillStyle = L[1]; g.fillText(L[0], w / 2, (opts.logo ? y : h * (lines.length === 1 ? 0.5 : 0.33 + i * 0.36)) + (opts.logo ? i * size * 1.1 : 0));
  }
  return c;
}
// The motel's neon: a dark box, tubes of pink and gold, one letter burned out.
function neonCanvas(dead) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  g.fillStyle = "#14101e"; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = "#ff3fa4"; g.lineWidth = 5; g.shadowColor = "#ff3fa4"; g.shadowBlur = 14; g.strokeRect(14, 14, 484, 228); g.shadowBlur = 0;
  const L = ["V", "A", "C", "A", "N", "C", "Y"];
  g.font = bold(70); g.textAlign = "center"; g.textBaseline = "middle";
  for (let i = 0; i < L.length; i++) {
    const off = dead && i === 3;
    g.shadowColor = off ? "transparent" : "#ff3fa4"; g.shadowBlur = off ? 0 : 18;
    g.fillStyle = off ? "#3a2440" : "#ffd0ec"; g.fillText(L[i], 70 + i * 62, 96);
    if (!off) { g.lineWidth = 3; g.strokeStyle = "#ff3fa4"; g.strokeText(L[i], 70 + i * 62, 96); }
  }
  g.shadowColor = "#ffd23f"; g.shadowBlur = 16; g.fillStyle = "#ffe27a"; g.font = bold(48); g.fillText("MOTOR INN", 256, 190); g.shadowBlur = 0;
  return c;
}
function doorCanvas(n, col) {
  const c = mkCanvas(128, 256), g = c.getContext("2d");
  g.fillStyle = col; g.fillRect(0, 0, 128, 256);
  g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(14, 18, 100, 90); g.fillRect(14, 128, 100, 110);
  g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(14, 18, 100, 4); g.fillRect(14, 128, 100, 4);
  g.fillStyle = "#ffd23f"; g.beginPath(); g.arc(104, 130, 7, 0, TAU); g.fill();
  if (n) { rrectPath(g, 40, 40, 48, 34, 6); g.fillStyle = "#fff1d6"; g.fill(); g.font = bold(26); g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#3a2616"; g.fillText(String(n), 64, 58); }
  return c;
}
// The airport departures board, repainted while the flight flips through its statuses.
const DEP_ROWS = [["NP 12", "UP NORTH", "ON TIME", "#9bff3f"], ["NP 27", "OUT WEST", "CANCELLED", "#ff4b3e"], ["NP 34", "HOME (MOM'S)", "", ""], ["NP 41", "BACK EAST", "DELAYED", "#ff8a1f"], ["NP 58", "DOWN SOUTH", "ON TIME", "#9bff3f"]];
function paintBoard(g, t) {
  const w = 512, h = 256;
  g.fillStyle = "#08090d"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#14161f"; g.fillRect(0, 0, w, 40);
  g.font = bold(22); g.textBaseline = "middle"; g.textAlign = "left"; g.fillStyle = "#ffd23f"; g.fillText("DEPARTURES", 16, 21);
  g.textAlign = "right"; g.fillStyle = "#8e93a2"; g.fillText("GATE 9", w - 16, 21);
  const st = ["ON TIME", "DELAYED", "DELAYED AGAIN", "BOARDING NOW"], si = Math.min(3, Math.floor(t / 1.05)), flip = (t % 1.05) < 0.18;
  g.font = bold(19);
  for (let i = 0; i < DEP_ROWS.length; i++) {
    const y = 64 + i * 40, mine = i === 2;
    if (mine) { g.fillStyle = "rgba(255,210,63,.16)"; g.fillRect(6, y - 18, w - 12, 36); }
    g.textAlign = "left"; g.fillStyle = "#eceae2"; g.fillText(DEP_ROWS[i][0], 16, y);
    g.fillStyle = mine ? "#ffd23f" : "#eceae2"; g.fillText(DEP_ROWS[i][1], 98, y);
    const s = mine ? st[si] : DEP_ROWS[i][2], col = mine ? (si === 1 ? "#ff8a1f" : si === 2 ? "#ff4b3e" : "#9bff3f") : DEP_ROWS[i][3];
    if (mine && flip && si > 0) { for (let k = 0; k < 9; k++) { g.fillStyle = "#2a2d38"; g.fillRect(316 + k * 20, y - 14, 16, 28); } }
    else { g.fillStyle = col; g.fillText(s, 316, y); }
    g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(6, y + 19, w - 12, 1);
  }
}
function noteCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.fillStyle = "#ffe46a"; g.fillRect(0, 0, 128, 128);
  g.fillStyle = "rgba(0,0,0,.06)"; g.fillRect(0, 0, 128, 16);
  g.fillStyle = "#3a2616"; g.font = 'bold 26px "Comic Sans MS", "Marker Felt", Verdana, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("SAVED", 64, 50); g.fillText("YOU SOME.", 64, 84);
  return c;
}
function phoneCanvas() {
  const c = mkCanvas(64, 128), g = c.getContext("2d");
  g.fillStyle = "#6fa8dc"; g.fillRect(0, 0, 64, 128);
  g.fillStyle = "#7fae6a"; g.fillRect(0, 70, 64, 58);
  g.fillStyle = "#eceae2"; g.beginPath(); g.moveTo(8, 72); g.lineTo(26, 36); g.lineTo(44, 72); g.fill();
  g.fillStyle = "#ffd23f"; g.beginPath(); g.arc(48, 22, 8, 0, TAU); g.fill();
  g.fillStyle = "#e8b88a"; g.fillRect(28, 88, 8, 22); g.beginPath(); g.arc(32, 84, 6, 0, TAU); g.fill();
  return c;
}
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.2, "#ffe0b8"); gr.addColorStop(0.45, "#e07a4a"); gr.addColorStop(0.55, "#4a2a1c"); gr.addColorStop(1, "#2a1a10");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#fff4e0"; tg.fillRect(0, 0, 64, 64);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#2a1a10"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* ---------------- LED ribbon board ----------------
   A real dot matrix, as in Tape Pin Lanes and Bleacher Carts: everything on it is painted into a small canvas, one
   pixel per LED, and a small shader turns each pixel into a glowing dot. The same board hangs over the gate, at
   the end of the train car and under the motel's neon. The programme scrolls right to left; big moments cut in. */
const LED_COLS = 240, LED_ROWS = 26;
const LED_SAFE = 222;
const LED_SPEED = 40;
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
const LED_LINES = [["HAPPY THANKSGIVING", "orange"], ["FREE AT THENOSTALGIAPRO.COM", "amber"], ["NEXT STOP: HOME (EVENTUALLY)", "lime"], ["NO QUARTERS REQUIRED", "cyan"]];
const LED_PLUGS = [
  ["BLEACHER CARTS", "HOME RUN DERBY"],
  ["TAPE PIN LANES", "3D BOWLING"],
  ["SHELF LINKS", "MINI GOLF"],
  ["BARGAIN BIN BUCKETS", "HOOPS"],
  ["TICKET ROLL ALLEY", "ROLL FOR TICKETS"],
  ["PAWN SHOP POOL", "RACK 'EM UP"],
  ["RINK RAT SHOOTOUT", "HOCKEY SHOOTOUT"],
  ["FOURTH AND COLLECT", "SPLIT THE UPRIGHTS"]
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
    "*": "00000 00100 01110 11111 01110 00100 00000", "(": "00010 00100 01000 01000 01000 00100 00010",
    ")": "01000 00100 00010 00010 00010 00100 01000"
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
function ledStrip(script) {
  const HH = LED_ROWS, big = LED_BIG, yBig = Math.floor((HH - 7 * big) / 2), GAP = 13, items = [];
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
  let x = 0;
  for (let i = 0; i < items.length; i++) {
    items[i].draw(g, x);
    x += items[i].w + GAP;
    ledText(g, "*", x, Math.floor((HH - 7) / 2), 1, 1, LED_C.orange);
    x += 7 + GAP;
  }
  return { canvas: c, markW: items[0].w };
}
function ledCreate(script) {
  const c = mkCanvas(LED_COLS, LED_ROWS), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  const strip = ledStrip(script), sw = strip.canvas.width;
  const start = ((-(LED_COLS - strip.markW) / 2) % sw + sw) % sw;
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
function ledMsg(kind, text, dur, more) {
  const m = { kind: kind, text: text, dur: dur, t: 0, wait: 0, color: "amber" };
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
function ledClear() { if (!LED) return; LED.msg = null; LED.queue = []; LED.pos = -1; }
function ledFinal(score, ok) {
  if (!LED) return;
  ledPlay([ledMsg("flash", ok ? "HOME FOR DINNER!" : "SAVED YOU SOME", 1.6), ledMsg("count", "", 6, { from: 0, value: score, suffix: " PTS", final: true })]);
}
function ledDrawMsg(g, m) {
  const WW = LED_COLS, HH = LED_ROWS, big = LED_BIG, calm = Sh.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(WW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.amber;
  function fit(str) { let sx = big; while (sx > 1 && ledTextW(str, sx) > LED_SAFE) sx--; return sx; }
  function chase(color, dir) {
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < WW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(WW - x - 3, HH - 1, 3, 1); }
  }
  if (m.kind === "count") {
    const k = calm ? 1 : Math.min(1, t / 0.9), v = Math.round(m.from + (m.value - m.from) * k);
    const label = m.text ? m.text + " " : "", suffix = m.suffix || "", full = label + comma(m.value) + suffix, sxc = fit(full);
    const x = Math.round((WW - ledTextW(full, sxc)) / 2), done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
    let xn = ledText(g, label, x, yBig, sxc, big, LED_C.amber);
    xn = ledText(g, comma(v), xn, yBig, sxc, big, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
    ledText(g, suffix, xn, yBig, sxc, big, LED_C.amber);
    chase(LED_C.amber, 1);
    return;
  }
  const sx = fit(m.text), w = ledTextW(m.text, sx), x0 = Math.round((WW - w) / 2);
  if (m.kind === "flash") {
    if (!calm && t < 0.6 && Math.floor(t * 12) % 2 === 0) { g.fillStyle = LED_C.yellow; g.fillRect(0, 0, WW, HH); ledText(g, m.text, x0, yBig, sx, big, "#000000"); return; }
    const span = 6 * big + 5, ph = calm ? 0 : Math.floor((t * 46) % span);
    for (let k = 0; k < 6; k++) {
      const off = Math.round(w / 2) + 9 + k * span + ph;
      if (off > mid + span) break;
      const cc = k % 2 ? LED_C.red : LED_C.orange;
      ledText(g, ">", mid + off, yBig, big, big, cc); ledText(g, "<", mid - off - 5 * big, yBig, big, big, cc);
    }
    const cyc = [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0, yBig, sx, big, calm ? LED_C.yellow : cyc[Math.floor(t * 8) % 3]);
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "slide") {
    const k = calm ? 1 : Math.min(1, t / 0.45), e = 1 - Math.pow(1 - k, 3), x = Math.round(x0 + (1 - e) * WW);
    ledText(g, m.text, x, yBig, sx, big, col);
    if (!calm && k >= 1) {
      const bx = Math.floor(((t - 0.45) * 150) % (WW + 80)) - 40;
      g.save(); g.beginPath(); g.rect(bx, 0, 12, HH); g.clip(); ledText(g, m.text, x, yBig, sx, big, "#ffffff"); g.restore();
    }
    chase(col, -1);
    return;
  }
  if (m.kind === "cycle") {
    const cyc = [LED_C.yellow, LED_C.orange, LED_C.red, LED_C.lime, LED_C.pink];
    let x = x0;
    for (let i = 0; i < m.text.length; i++) x = ledText(g, m.text[i], x, yBig, sx, big, cyc[(i + (calm ? 0 : Math.floor(t * 9))) % cyc.length]);
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
  while (dx < LED_COLS) { const n = Math.min(LED_COLS - dx, sw - sx); g.drawImage(L.strip, sx, 0, n, HH, dx, 0, n, HH); dx += n; sx = 0; }
}
function ledTick(dt) {
  const L = LED;
  if (!L) return;
  let redraw = false;
  if (L.msg) { L.msg.t += dt; if (L.msg.t >= L.msg.dur) { L.msg = L.queue.shift() || null; L.frame = -1; redraw = true; } }
  if (L.msg) { const f = Math.floor(L.msg.t * 30); if (f !== L.frame) { L.frame = f; redraw = true; } }
  else {
    const sw = L.strip.width;
    L.scroll = (L.scroll + dt * (Sh.reduced ? LED_SPEED * 0.5 : LED_SPEED)) % sw;
    const p = Math.floor(L.scroll);
    if (p !== L.pos) { L.pos = p; redraw = true; }
  }
  if (redraw) { ledDraw(); if (L.tex) L.tex.needsUpdate = true; }
}

/* ---------------- People: sculpted, jointed characters ----------------
   Every person is a rig of groups (pelvis, spine, neck, head; shoulder, elbow, wrist; hip, knee, ankle), facing +Z,
   standing on y = 0, sized in meters with adult proportions (about seven and a half heads tall).
   Bodies are sculpted, not tubes: each torso and limb is a lathed profile that is then pushed out of round, so a chest
   and belly sit forward, shoulder blades and a seat sit back, an upper arm has a biceps in front and a triceps behind,
   a forearm swells below the elbow and narrows to the wrist, a thigh has its quads and a calf bulges behind the shin.
   Clothes are separate shells over the body: sleeves and pant legs overlap the elbow and knee so a bend never shows a
   seam, flare a little at the cuff and the hem, and carry painted folds, seams and stitching. Hands have a palm, four
   fingers and a thumb; shoes have an upper, a toe box, a heel, laces and a real sole. Faces have a skull, jaw, chin,
   cheekbones, nose, ears, eyes that blink, brows that move and a mouth that opens and smiles.
   For phones, every bone's static pieces are merged into one mesh per material and materials are shared by color. */
const HIP_H = 0.93;
let PG = null;                                             // shared person geometry
const PMAT = {};                                           // shared person materials, by kind and color

function pmat(kind, key, make) { const k = kind + ":" + key; if (!PMAT[k]) PMAT[k] = make(); return PMAT[k]; }
function hexOf(n) { return typeof n === "string" ? n : "#" + ("000000" + (n >>> 0).toString(16)).slice(-6); }
function bump(y, at, w) { const d = (y - at) / w; return Math.exp(-d * d); }

// A lathed profile pushed out of round. prof: [radius, y] from the bottom up. f(x, y, z) -> [x, y, z].
function sculpt(prof, segs, f, open) {
  const T = THREE, pts = prof.map(function (p) { return new T.Vector2(Math.max(0.0005, p[0]), p[1]); });
  const g = new T.LatheGeometry(pts, segs || 18);
  if (f) {
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) { const r = f(pa.getX(i), pa.getY(i), pa.getZ(i)); pa.setXYZ(i, r[0], r[1], r[2]); }
    g.computeVertexNormals();
  }
  return g;
}
// limb profiles hang from the joint (y = 0) down to y = -len; cap = round the ends
function capProf(list, topCap, botCap) {
  const out = [];
  if (botCap) { const r = list[0][0], y = list[0][1]; for (let i = 0; i <= 3; i++) { const a = i / 3 * Math.PI / 2; out.push([Math.sin(a) * r, y - Math.cos(a) * r * 0.8]); } }
  list.forEach(function (p) { out.push(p); });
  if (topCap) { const r = list[list.length - 1][0], y = list[list.length - 1][1]; for (let i = 2; i >= 0; i--) { const a = i / 3 * Math.PI / 2; out.push([Math.sin(a) * r, y + Math.cos(a) * r * 0.7]); } }
  return out;
}

function personGeo() {
  if (PG) return PG;
  const T = THREE;
  PG = {
    sph: new T.SphereGeometry(1, 18, 12),
    lo: new T.SphereGeometry(1, 12, 8),
    half: new T.SphereGeometry(1, 20, 9, 0, TAU, 0, Math.PI * 0.55),
    box: new T.BoxGeometry(1, 1, 1),
    spike: new T.ConeGeometry(0.03, 0.1, 6),
    ring: new T.TorusGeometry(1, 0.16, 6, 22).rotateX(Math.PI / 2),
    brow: new T.CapsuleGeometry(0.0095, 0.045, 3, 6).rotateZ(Math.PI / 2),
    lip: new T.TorusGeometry(0.034, 0.0075, 6, 14, Math.PI).rotateZ(Math.PI),
    fing: new T.CapsuleGeometry(0.0125, 0.045, 3, 7).translate(0, -0.034, 0),
    tip: new T.CapsuleGeometry(0.0115, 0.022, 3, 7).translate(0, -0.02, 0),
    thumb: new T.CapsuleGeometry(0.0145, 0.036, 3, 7).translate(0, -0.028, 0),
    neck: sculpt([[0.058, -0.02], [0.052, 0.04], [0.05, 0.08], [0.056, 0.12]], 14, function (x, y, z) { return [x, y, z * 0.95 + (z < 0 ? 0.004 : 0)]; }),
    // skin limbs
    upArm: sculpt(capProf([[0.04, -0.29], [0.043, -0.24], [0.05, -0.16], [0.054, -0.1], [0.058, -0.04], [0.06, 0.0]], true, true), 16,
      function (x, y, z) { return [x * 0.92, y, z + (z > 0 ? 0.012 * bump(y, -0.13, 0.07) : -0.01 * bump(y, -0.09, 0.08))]; }),
    foreArm: sculpt(capProf([[0.028, -0.245], [0.031, -0.21], [0.038, -0.15], [0.047, -0.07], [0.05, -0.03], [0.044, 0.01]], true, true), 16,
      function (x, y, z) { return [x * 1.12 + (x > 0 ? 0.004 * bump(y, -0.05, 0.05) : 0), y, z * 0.86]; }),
    calf: sculpt(capProf([[0.03, -0.43], [0.033, -0.38], [0.042, -0.28], [0.054, -0.17], [0.057, -0.11], [0.05, -0.04], [0.047, 0.01]], true, true), 16,
      function (x, y, z) { return [x * 0.95, y, z < 0 ? z - 0.018 * bump(y, -0.13, 0.08) : z * 0.9]; }),
    thighSkin: sculpt(capProf([[0.05, -0.44], [0.062, -0.36], [0.08, -0.22], [0.095, -0.1], [0.1, 0.0]], true, true), 16,
      function (x, y, z) { return [x, y, z > 0 ? z + 0.012 * bump(y, -0.16, 0.1) : z]; }),
    // garments
    pantsThigh: sculpt([[0.077, -0.47], [0.079, -0.42], [0.086, -0.33], [0.098, -0.2], [0.11, -0.09], [0.118, 0.0], [0.116, 0.05]], 18,
      function (x, y, z) { return [x, y, z > 0 ? z + 0.012 * bump(y, -0.18, 0.12) : z - 0.008 * bump(y, -0.05, 0.08)]; }),
    pantsShin: sculpt([[0.08, -0.43], [0.076, -0.41], [0.069, -0.33], [0.066, -0.22], [0.07, -0.1], [0.078, -0.01], [0.079, 0.04]], 18,
      function (x, y, z) { return [x, y, z < 0 ? z - 0.006 * bump(y, -0.12, 0.08) : z]; }),
    sleeveShort: sculpt([[0.072, -0.15], [0.069, -0.13], [0.07, -0.07], [0.074, -0.02], [0.074, 0.02], [0.05, 0.065]], 18),
    sleeveUp: sculpt([[0.06, -0.31], [0.063, -0.22], [0.068, -0.12], [0.074, -0.03], [0.075, 0.02], [0.05, 0.065]], 18,
      function (x, y, z) { return [x * 0.96, y, z]; }),
    sleeveLow: sculpt([[0.058, -0.235], [0.053, -0.215], [0.05, -0.17], [0.055, -0.08], [0.062, -0.01], [0.064, 0.03]], 18,
      function (x, y, z) { return [x * 1.08, y, z * 0.92]; }),
    hem: new T.TorusGeometry(1, 0.11, 5, 22).rotateX(Math.PI / 2),
    sole: roundBox(0.11, 0.028, 0.29, 0.012, 2)
  };
  return PG;
}

// The torso, shaped: a waist, the ribcage, chest (or bust) and belly forward, shoulder blades and a flatter back.
function torsoGeo(belly, chest, bust) {
  const b = belly || 0, c = chest || 0, w = bust ? 1 : 0;
  const P = [[0.01, -0.07], [0.125, -0.05], [0.148, 0.0], [0.142 + b * 0.02, 0.08], [0.148 + b * 0.04, 0.16], [0.16 + b * 0.04 + c * 0.01, 0.25],
    [0.175 + b * 0.02 + c * 0.015, 0.33], [0.186 + c * 0.012, 0.4], [0.19, 0.445], [0.176, 0.485], [0.13, 0.52], [0.07, 0.542], [0.01, 0.552]];
  return sculpt(P, 24, function (x, y, z) {
    let zz = z * 0.7;
    if (z > 0) zz += 0.045 * b * bump(y, 0.15, 0.1) + (0.018 + 0.012 * c + 0.03 * w) * bump(y, 0.36, 0.07) * (1 - Math.abs(x) * 2.5);
    else zz = zz * 0.86 - 0.012 * bump(y, 0.38, 0.06) * (Math.abs(x) > 0.05 ? 1 : 0.4);
    const xx = x * (1 + 0.05 * bump(y, 0.45, 0.05));
    return [xx, y, zz];
  });
}
function hipsGeo(wide) {
  const k = wide ? 1.08 : 1;
  return sculpt([[0.04, -0.15], [0.1 * k, -0.14], [0.15 * k, -0.09], [0.165 * k, -0.03], [0.158, 0.03], [0.15, 0.07], [0.01, 0.085]], 22,
    function (x, y, z) { return [x, y, z < 0 ? z * 0.8 - 0.03 * bump(y, -0.07, 0.05) : z * 0.72]; });
}

// Clothing texture: woven base, soft folds, side seams and stitching at the hems. Cached by look.
const CLOTH = {};
function clothTex(base, opt) {
  opt = opt || {};
  const key = base + JSON.stringify(opt);
  if (CLOTH[key]) return CLOTH[key];
  const c = clothCanvas(base, "rgba(0,0,0,.32)", base.length * 7 + (opt.seed || 1), { folds: 16, denim: opt.denim, vertical: opt.vertical });
  const g = c.getContext("2d");
  g.strokeStyle = opt.stitch || "rgba(255,255,255,.22)"; g.lineWidth = 2; g.setLineDash([5, 4]);
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 256); g.moveTo(192, 0); g.lineTo(192, 256); g.stroke();      // side seams
  g.beginPath(); g.moveTo(0, 246); g.lineTo(256, 246); g.moveTo(0, 240); g.lineTo(256, 240); g.stroke();    // hem stitching
  g.setLineDash([]);
  g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(62, 0, 1, 256); g.fillRect(190, 0, 1, 256);
  return (CLOTH[key] = K.tex(c, true));
}

// o: skin, shirtMap | shirt, pantsMap | pants, shoe, sole, hair, hairStyle, sleeves ("short"|"long"|"none"), belly, chest, bust,
//    glasses ("shades"|"round"|null), hat ("earflap"|null), mustache, beard, eye, lip, scale, apron, skirt, collar ("crew"|"shirt"|"turtle")
function makePerson(o) {
  const T = THREE, G = personGeo();
  const root = new T.Group();
  const skinH = hexOf(o.skin), lam = function (k, c, extra) { return pmat(k, hexOf(c), function () { return new T.MeshLambertMaterial(Object.assign({ color: c }, extra || {})); }); };
  const M = {
    skin: pmat("skin", skinH, function () { return new T.MeshPhongMaterial({ color: o.skin, shininess: 14, specular: 0x2a1a10 }); }),
    shirt: o.shirtMap ? pmat("map", o.shirtMap.uuid, function () { return new T.MeshLambertMaterial({ map: o.shirtMap, side: T.DoubleSide }); })
                      : pmat("cloth", hexOf(o.shirt || 0x888888), function () { return new T.MeshLambertMaterial({ map: clothTex(hexOf(o.shirt || 0x888888)), side: T.DoubleSide }); }),
    trim: lam("lam", o.trim || 0x111116),
    sleeve: null,
    pants: o.pantsMap ? pmat("map", o.pantsMap.uuid, function () { return new T.MeshLambertMaterial({ map: o.pantsMap, side: T.DoubleSide }); })
                      : pmat("cloth", hexOf(o.pants || 0x334466) + "v", function () { return new T.MeshLambertMaterial({ map: clothTex(hexOf(o.pants || 0x334466), { vertical: true, seed: 3 }), side: T.DoubleSide }); }),
    shoe: pmat("phong", hexOf(o.shoe || 0xc2304a), function () { return new T.MeshPhongMaterial({ color: o.shoe || 0xc2304a, shininess: 30, specular: 0x333333 }); }),
    sole: lam("lam", o.sole || 0xf2efe6),
    sock: lam("lam", o.sock || 0xeceae2),
    hair: lam("lam", o.hair || 0x4a2f1c),
    white: pmat("eye", "w", function () { return new T.MeshPhongMaterial({ color: 0xfbfaf4, shininess: 60 }); }),
    dark: pmat("iris", hexOf(o.eye || 0x2a1a10), function () { return new T.MeshPhongMaterial({ color: o.eye || 0x2a1a10, shininess: 90, specular: 0xffffff }); }),
    mouth: lam("lam", 0x5a1418),
    lip: pmat("phong", hexOf(o.lip || 0x6a1e1c), function () { return new T.MeshPhongMaterial({ color: o.lip || 0x6a1e1c, shininess: 20 }); }),
    brow: lam("lam", o.brow || o.hair || 0x3a2414),
    belt: pmat("phong", hexOf(o.belt || 0x3a2616), function () { return new T.MeshPhongMaterial({ color: o.belt || 0x3a2616, shininess: 30 }); }),
    buckle: pmat("phong", "buckle", function () { return new T.MeshPhongMaterial({ color: 0xd8c27a, shininess: 90, specular: 0xffffff }); })
  };
  M.sleeve = o.sleeveMap ? pmat("map", o.sleeveMap.uuid, function () { return new T.MeshLambertMaterial({ map: o.sleeveMap, side: T.DoubleSide }); }) : M.shirt;
  function mesh(geo, mat, parent, x, y, z, sx, sy, sz, keep) { const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (sx != null) m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); if (keep) m.userData.keep = true; parent.add(m); return m; }
  function grp(parent, x, y, z) { const g = new T.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; }
  const skirt = !!o.skirt;

  // hips and seat
  const pelvis = grp(root, 0, HIP_H, 0);
  mesh(hipsGeo(o.bust), M.pants, pelvis, 0, 0, 0);
  [-1, 1].forEach(function (s) { mesh(G.lo, M.pants, pelvis, s * 0.07, -0.06, -0.055, 0.085, 0.09, 0.07); });           // seat
  mesh(G.ring, M.belt, pelvis, 0, 0.06, 0, 0.152, 0.22, 0.112);
  mesh(G.box, M.buckle, pelvis, 0, 0.06, 0.115, 0.05, 0.036, 0.01);
  if (skirt) mesh(sculpt([[0.25, -0.46], [0.24, -0.4], [0.2, -0.2], [0.17, -0.02], [0.16, 0.07]], 22, function (x, y, z) { return [x + Math.sin(Math.atan2(z, x) * 8) * 0.008 * (-y), y, z * 0.85]; }),
    lam("cloth2", o.skirt, { side: T.DoubleSide }), pelvis, 0, 0, 0);

  // torso, with a shirt hem, a collar and a little yoke at the neck
  const spine = grp(pelvis, 0, 0.05, 0);
  mesh(torsoGeo(o.belly, o.chest, o.bust), M.shirt, spine, 0, 0, 0);
  mesh(G.hem, M.shirt, spine, 0, -0.035, 0, 0.152 + (o.belly || 0) * 0.012, 0.3, 0.112 + (o.belly || 0) * 0.02);
  mesh(G.lo, M.shirt, spine, 0, 0.49, -0.02, 0.13, 0.05, 0.08);                                         // trapezius
  const col = o.collar || (o.sleeves === "long" ? "shirt" : "crew");
  if (col === "turtle") mesh(G.ring, M.shirt, spine, 0, 0.57, 0, 0.072, 0.55, 0.068);
  else mesh(G.ring, M.trim, spine, 0, 0.535, 0.006, 0.072, 0.22, 0.064);
  if (col === "shirt") [-1, 1].forEach(function (s) { const f = mesh(G.box, M.shirt, spine, s * 0.04, 0.52, 0.06, 0.06, 0.008, 0.07); f.rotation.set(-0.5, s * 0.5, s * 0.3); });
  if (o.apron) { const ap = mesh(new T.PlaneGeometry(0.3, 0.62), lam("lam2", o.apron, { side: T.DoubleSide }), spine, 0, 0.02, 0.135); ap.rotation.x = -0.12; mesh(G.ring, lam("lam", o.apron), spine, 0, 0.12, 0, 0.152, 0.08, 0.135); }

  // neck and head
  const neck = grp(spine, 0, 0.52, 0);
  mesh(G.neck, M.skin, neck, 0, 0.0, 0.005);
  const head = grp(neck, 0, 0.1, 0.008); head.scale.setScalar(0.9);
  mesh(G.sph, M.skin, head, 0, 0.17, -0.012, 0.15, 0.165, 0.158);       // skull
  mesh(G.sph, M.skin, head, 0, 0.09, 0.024, 0.122, 0.1, 0.118);         // jaw
  const chin = mesh(G.lo, M.skin, head, 0, 0.042, 0.088, 0.05, 0.04, 0.044, 0, 0, true);
  [-1, 1].forEach(function (s) {
    mesh(G.lo, M.skin, head, s * 0.074, 0.115, 0.098, 0.042, 0.03, 0.03);                // cheekbones
    mesh(G.lo, M.skin, head, s * 0.15, 0.14, -0.012, 0.024, 0.044, 0.034);              // ears
    mesh(G.lo, M.skin, head, s * 0.148, 0.135, 0.0, 0.012, 0.024, 0.016);
  });
  mesh(G.lo, M.skin, head, 0, 0.13, 0.152, 0.024, 0.036, 0.03);         // nose bridge
  mesh(G.lo, M.skin, head, 0, 0.113, 0.164, 0.021, 0.017, 0.02);        // nose tip
  [-1, 1].forEach(function (s) { mesh(G.lo, M.skin, head, s * 0.015, 0.107, 0.155, 0.012, 0.01, 0.012); });
  mesh(G.lo, M.skin, head, 0, 0.205, 0.128, 0.1, 0.022, 0.03);          // brow ridge
  const eyes = [], brows = [];
  [-1, 1].forEach(function (s) {
    const e = grp(head, s * 0.056, 0.168, 0.128);
    mesh(G.lo, M.white, e, 0, 0, 0, 0.03, 0.034, 0.02);
    mesh(G.lo, M.dark, e, 0, -0.002, 0.016, 0.016, 0.018, 0.01);
    mesh(G.lo, M.white, e, s * -0.005, 0.008, 0.024, 0.005, 0.005, 0.004);
    e.rotation.y = s * 0.28;
    eyes.push(e);
    const b = mesh(G.brow, M.brow, head, s * 0.058, 0.22, 0.145, 1, 1, 1, true);
    b.rotation.y = s * 0.3;
    brows.push(b);
  });
  const mouth = grp(head, 0, 0.078, 0.137);
  const inner = mesh(G.lo, M.mouth, mouth, 0, 0, 0, 0.034, 0.01, 0.014, true);
  const lips = mesh(G.lip, M.lip, mouth, 0, 0.004, 0.004, 1, 1, 1, true);
  if (o.mustache) mesh(G.lo, M.hair, head, 0, 0.1, 0.155, 0.058, 0.017, 0.022);
  if (o.beard) { mesh(G.sph, M.hair, head, 0, 0.06, 0.06, 0.125, 0.085, 0.1); mesh(G.lo, M.hair, head, 0, 0.03, 0.1, 0.06, 0.05, 0.04); }

  // hair
  const hairG = grp(head, 0, 0, 0), spikes = grp(hairG, 0, 0, 0);
  if (o.hairStyle !== "bald") mesh(G.half, M.hair, hairG, 0, 0.17, -0.018, 0.16, 0.172, 0.168);
  if (o.hairStyle === "spiky") {
    for (let i = 0; i < 11; i++) { const a = -1.1 + i * 0.22, sp = mesh(G.spike, M.hair, spikes, Math.sin(a) * 0.1, 0.3 + Math.cos(a * 1.4) * 0.03, 0.02 + Math.cos(a) * 0.05, 1, 1.1 + (i % 3) * 0.25, 1); sp.rotation.set(0.5 + (i % 2) * 0.2, 0, -a * 0.7); }
    for (let i = 0; i < 5; i++) { const sp = mesh(G.spike, M.hair, spikes, -0.08 + i * 0.04, 0.29, -0.08, 1, 1.2, 1); sp.rotation.set(-0.6, 0, (i - 2) * 0.3); }
    mesh(G.lo, M.hair, spikes, 0, 0.26, 0.09, 0.11, 0.045, 0.05);
    [-1, 1].forEach(function (s) { mesh(G.lo, M.hair, spikes, s * 0.142, 0.18, 0.02, 0.022, 0.05, 0.04); });     // sideburns
  } else if (o.hairStyle === "bob") {
    mesh(G.sph, M.hair, hairG, 0, 0.13, -0.035, 0.172, 0.17, 0.165);
    mesh(G.lo, M.hair, hairG, 0, 0.27, 0.06, 0.13, 0.05, 0.08);
  } else if (o.hairStyle === "bun") {
    mesh(G.lo, M.hair, hairG, 0, 0.3, -0.1, 0.07, 0.065, 0.07);
  } else if (o.hairStyle === "short") {
    mesh(G.lo, M.hair, hairG, 0, 0.27, 0.07, 0.12, 0.045, 0.06);
  } else if (o.hairStyle === "bald") {
    [-1, 1].forEach(function (s) { mesh(G.lo, M.hair, hairG, s * 0.135, 0.17, -0.06, 0.04, 0.06, 0.08); });
  }
  if (o.glasses === "shades") {
    const gm = pmat("phong", "shades", function () { return new T.MeshPhongMaterial({ color: 0x0c0c12, shininess: 120, specular: 0xffffff }); });
    [-1, 1].forEach(function (s) { mesh(G.lo, gm, head, s * 0.058, 0.172, 0.15, 0.054, 0.036, 0.016); const tm = mesh(G.box, gm, head, s * 0.128, 0.18, 0.07, 0.008, 0.01, 0.15); tm.rotation.y = s * 0.15; });
    mesh(G.box, gm, head, 0, 0.18, 0.162, 0.03, 0.01, 0.01);
    eyes.forEach(function (e) { e.visible = false; });
  } else if (o.glasses === "round") {
    const gm = pmat("phong", "gold", function () { return new T.MeshPhongMaterial({ color: 0xc9a14a, shininess: 90 }); });
    [-1, 1].forEach(function (s) { const r = mesh(new T.TorusGeometry(0.036, 0.0045, 5, 16), gm, head, s * 0.058, 0.168, 0.158); r.rotation.y = s * 0.2; mesh(G.box, gm, head, s * 0.115, 0.17, 0.08, 0.005, 0.006, 0.15); });
    mesh(G.box, gm, head, 0, 0.172, 0.165, 0.04, 0.005, 0.005);
  }
  if (o.hat === "earflap") {
    const hm = lam("lam", 0xd94a2a), cream = lam("lam", 0xfff1d6);
    mesh(G.half, hm, head, 0, 0.18, -0.012, 0.17, 0.17, 0.175);
    [-1, 1].forEach(function (s) { const f = mesh(G.lo, hm, head, s * 0.152, 0.11, -0.012, 0.03, 0.085, 0.06); f.rotation.z = s * 0.12; });
    mesh(G.ring, cream, head, 0, 0.2, -0.012, 0.17, 0.32, 0.175);
    mesh(G.lo, cream, head, 0, 0.36, -0.012, 0.042);
  }

  // arms: shoulder (deltoid), upper arm, elbow, forearm, wrist and the hand
  function arm(s) {
    const sh = grp(spine, s * 0.2, 0.44, -0.005);
    const sleeve = o.sleeves === "none" ? null : o.sleeves === "long" ? "long" : "short";
    mesh(G.lo, sleeve ? M.sleeve : M.skin, sh, s * 0.012, 0.008, 0, 0.074, 0.072, 0.07);                // deltoid
    if (sleeve !== "long") mesh(G.upArm, M.skin, sh, 0, -0.01, 0);
    if (sleeve === "short") { mesh(G.sleeveShort, M.sleeve, sh, 0, -0.005, 0); mesh(G.hem, M.sleeve, sh, 0, -0.152, 0, 0.074, 0.22, 0.074); }
    if (sleeve === "long") mesh(G.sleeveUp, M.sleeve, sh, 0, 0, 0);
    const el = grp(sh, 0, -0.29, 0);
    if (sleeve === "long") {
      mesh(G.lo, M.sleeve, el, 0, 0, 0, 0.06, 0.06, 0.058);
      mesh(G.sleeveLow, M.sleeve, el, 0, 0, 0);
      mesh(G.hem, M.trim, el, 0, -0.232, 0, 0.061, 0.25, 0.056);                    // the cuff
      mesh(new T.CylinderGeometry(0.03, 0.033, 0.04, 12), M.skin, el, 0, -0.245, 0);
    } else mesh(G.foreArm, M.skin, el, 0, 0, 0);
    const wr = grp(el, 0, -0.255, 0);
    const hand = grp(wr, 0, 0, 0); hand.rotation.y = s * -Math.PI / 2; hand.scale.setScalar(1.18);
    mesh(G.sph, M.skin, hand, 0, -0.044, 0.0, 0.045, 0.052, 0.022);                    // palm
    mesh(G.lo, M.skin, hand, s * 0.024, -0.035, 0.012, 0.024, 0.032, 0.016);             // the thumb's heel
    mesh(G.lo, M.skin, hand, 0, -0.08, 0.002, 0.042, 0.014, 0.02);                      // knuckles
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const f = grp(hand, s * (-0.03 + i * 0.02), -0.088 + Math.abs(i - 1.5) * 0.005, 0.003);
      const L = i === 0 ? 0.8 : i === 3 ? 0.85 : 1;
      mesh(G.fing, M.skin, f, 0, 0, 0, 1, L, 1);
      const tipG = grp(f, 0, -0.062 * L, 0); tipG.rotation.x = -0.25;
      mesh(G.tip, M.skin, tipG, 0, 0, 0, 0.95, L, 0.95);
      f.userData.tip = tipG;
      fingers.push(f);
    }
    const th = grp(hand, s * 0.042, -0.028, 0.014); th.rotation.set(-0.5, 0, s * 0.75);
    mesh(G.thumb, M.skin, th, 0, 0, 0);
    return { sh: sh, el: el, wr: wr, hand: hand, fingers: fingers, thumb: th };
  }
  const L = arm(1), Rr = arm(-1);

  // legs: hip, thigh, knee, shin, ankle; pant legs (or bare legs under a skirt), socks and shoes
  function leg(s) {
    const hp = grp(pelvis, s * 0.088, -0.05, 0);
    if (skirt) { mesh(G.thighSkin, M.skin, hp, 0, 0, 0); }
    else mesh(G.pantsThigh, M.pants, hp, 0, 0, 0);
    const kn = grp(hp, 0, -0.44, 0);
    if (skirt) { mesh(G.lo, M.skin, kn, 0, 0, 0.004, 0.052, 0.055, 0.052); mesh(G.calf, M.skin, kn, 0, 0, 0); }
    else {
      mesh(G.lo, M.pants, kn, 0, 0, 0.004, 0.079, 0.082, 0.08);
      mesh(G.pantsShin, M.pants, kn, 0, 0, 0);
      mesh(G.hem, M.pants, kn, 0, -0.425, 0, 0.08, 0.24, 0.08);
      mesh(new T.CylinderGeometry(0.034, 0.038, 0.08, 12), M.sock, kn, 0, -0.42, 0);
    }
    const an = grp(kn, 0, -0.44, 0);
    mesh(G.sph, M.shoe, an, 0, -0.03, 0.038, 0.066, 0.056, 0.128);         // upper
    mesh(G.lo, M.shoe, an, 0, -0.045, 0.13, 0.058, 0.04, 0.062);           // toe box
    mesh(G.lo, M.shoe, an, 0, -0.03, -0.055, 0.056, 0.05, 0.05);           // heel counter
    mesh(G.sole, M.sole, an, 0, -0.072, 0.04, 1.12, 1, 1);                 // sole
    mesh(G.lo, M.sole, an, 0, -0.06, 0.15, 0.058, 0.028, 0.05);            // toe cap
    for (let i = 0; i < 3; i++) mesh(G.box, M.sole, an, 0, 0.012 - i * 0.012, 0.055 + i * 0.024, 0.05, 0.006, 0.008);   // laces
    mesh(G.lo, M.shoe, an, 0, 0.012, 0.03, 0.04, 0.03, 0.05);              // tongue
    return { hp: hp, kn: kn, an: an };
  }
  const LL = leg(1), RL = leg(-1);

  root.scale.setScalar(o.scale || 1);
  mergeStatic(root);
  return { root: root, pelvis: pelvis, spine: spine, neck: neck, head: head, la: L, ra: Rr, ll: LL, rl: RL,
    eyes: eyes, brows: brows, mouth: mouth, inner: inner, lips: lips, chin: chin, hairG: hairG, spikes: spikes, M: M, acc: {},
    blink: Math.random() * 3, phase: Math.random() * 10, pose: {} };
}

// Merge every group's static meshes into one mesh per material (moving parts are left alone).
function mergeStatic(node) {
  const T = THREE, kids = node.children.slice(), buckets = new Map();
  kids.forEach(function (c) { if (c.isMesh && !c.userData.keep && !c.geometry.morphAttributes.position) { const k = c.material.uuid; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(c); } else if (!c.isMesh) mergeStatic(c); });
  buckets.forEach(function (list) {
    if (list.length < 2) return;
    let nPos = 0, nIdx = 0;
    const geos = list.map(function (m) { m.updateMatrix(); let g = m.geometry.clone().applyMatrix4(m.matrix); if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); nPos += g.attributes.position.count; nIdx += g.index.count; return g; });
    const pos = new Float32Array(nPos * 3), nor = new Float32Array(nPos * 3), uv = new Float32Array(nPos * 2), idx = new Uint32Array(nIdx);
    let vp = 0, ip = 0;
    geos.forEach(function (g) {
      const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv;
      for (let i = 0; i < pa.count; i++) { pos[(vp + i) * 3] = pa.getX(i); pos[(vp + i) * 3 + 1] = pa.getY(i); pos[(vp + i) * 3 + 2] = pa.getZ(i);
        nor[(vp + i) * 3] = na.getX(i); nor[(vp + i) * 3 + 1] = na.getY(i); nor[(vp + i) * 3 + 2] = na.getZ(i);
        uv[(vp + i) * 2] = ua ? ua.getX(i) : 0; uv[(vp + i) * 2 + 1] = ua ? ua.getY(i) : 0; }
      for (let i = 0; i < g.index.count; i++) idx[ip + i] = g.index.getX(i) + vp;
      vp += pa.count; ip += g.index.count; g.dispose();
    });
    const mg = new T.BufferGeometry();
    mg.setAttribute("position", new T.BufferAttribute(pos, 3)); mg.setAttribute("normal", new T.BufferAttribute(nor, 3)); mg.setAttribute("uv", new T.BufferAttribute(uv, 2));
    mg.setIndex(new T.BufferAttribute(idx, 1)); mg.computeBoundingSphere();
    const mm = new T.Mesh(mg, list[0].material);
    list.forEach(function (m) { node.remove(m); });
    node.add(mm);
  });
}

// Pose: every key defaults to 0. hy pelvis height offset; hx/hry/hz pelvis; sx/sy/sz spine; nx/ny/nz head;
// l/r: s(x,y,z) shoulder, e elbow, w wrist; h(x,z) hip, k knee, a ankle. Right side values are mirrored so the same
// number means the same move on both sides (z = out from the body). curl fingers 0..1, smile -1..1, jaw 0..1, brow -1..1.
const PK = ["hy", "hx", "hry", "hz", "sx", "sy", "sz", "nx", "ny", "nz", "lsx", "lsy", "lsz", "lex", "lwx", "lwz", "rsx", "rsy", "rsz", "rex", "rwx", "rwz",
  "lhx", "lhz", "lkx", "lax", "rhx", "rhz", "rkx", "rax", "curl", "smile", "jaw", "brow", "frown"];
const POSES = {
  stand: { hy: -0.012, lsz: 0.1, rsz: 0.1, lsx: 0.05, rsx: 0.02, lex: -0.32, rex: -0.26, lkx: 0.07, rkx: 0.04, lhx: -0.04, rhx: -0.02, lax: -0.03, curl: 0.45, smile: 0.5 },
  sit: { hy: -0.42, sx: -0.06, lhx: -1.52, rhx: -1.52, lkx: 1.45, rkx: 1.45, lax: 0.05, rax: 0.05, lhz: 0.06, rhz: 0.06,
    lsx: -0.5, rsx: -0.5, lsz: 0.1, rsz: 0.1, lex: -0.85, rex: -0.85, curl: 0.45, smile: 0.4 },
  hold: { lsx: -2.95, rsx: -2.95, lsz: 0.1, rsz: 0.1, lsy: 0.15, rsy: 0.15, lex: -0.42, rex: -0.42, lwx: -0.4, rwx: -0.4, lkx: 0.18, rkx: 0.18, lhx: -0.1, rhx: -0.1, lax: -0.08, rax: -0.08, lhz: 0.07, rhz: 0.07, hy: -0.02, curl: 0.15, nx: -0.25, smile: 0.1, brow: 0.4 },
  kick: { sx: -0.18, rhx: -1.35, rkx: 0.35, rax: -0.3, lkx: 0.2, lhx: 0.08, lax: -0.1, hy: -0.02, lsx: -0.7, lsz: 0.75, rsx: 0.5, rsz: 0.35, lex: -0.7, rex: -0.9, curl: 0.9, jaw: 0.5, smile: -0.3, brow: -0.6, frown: 1 },
  drive: { hy: -0.5, sx: -0.12, lhx: -1.35, rhx: -1.35, lkx: 1.2, rkx: 1.2, lax: 0.15, rax: 0.15, lhz: 0.08, rhz: 0.08,
    lsx: -1.05, rsx: -1.05, lsz: 0.18, rsz: 0.18, lex: -0.75, rex: -0.75, lwx: 0.3, rwx: 0.3, curl: 0.85, smile: 0.6 },
  cheer: { lsx: -2.45, rsx: -2.45, lsz: 0.6, rsz: 0.6, lex: -0.6, rex: -0.6, lkx: 0.1, rkx: 0.1, lhx: -0.05, rhx: -0.05, curl: 0.2, smile: 1, jaw: 0.8, brow: 0.8 },
  carry: { lsx: -0.45, rsx: -0.45, lsz: -0.02, rsz: -0.02, lex: -1.3, rex: -1.3, lwx: 0.4, rwx: 0.4, lkx: 0.06, rkx: 0.06, curl: 0.25, smile: 0.7 },
  talk: { hy: -0.42, sx: -0.04, lhx: -1.52, rhx: -1.52, lkx: 1.45, rkx: 1.45, lhz: 0.08, rhz: 0.08, lsx: -0.5, lsz: 0.1, lex: -0.9,
    rsx: -0.9, rsz: 0.25, rex: -1.5, curl: 0.2, smile: 0.9, brow: 0.5 },
  phone: { hy: -0.42, sx: -0.02, lhx: -1.52, rhx: -1.52, lkx: 1.45, rkx: 1.45, lhz: 0.08, rhz: 0.08, lsx: -0.5, lsz: 0.1, lex: -0.9,
    rsx: -1.25, rsz: -0.15, rex: -1.25, rsy: 0.5, curl: 0.5, smile: 1, brow: 0.6, ny: -0.3 },
  sleep: { hy: -0.42, sx: -0.12, lhx: -1.5, rhx: -1.5, lkx: 1.45, rkx: 1.45, lsx: -0.45, rsx: -0.45, lex: -0.9, rex: -0.9, nz: 0.42, nx: 0.25, curl: 0.5, smile: 0.1, jaw: 0.25 },
  read: { hy: -0.42, lhx: -1.5, rhx: -1.5, lkx: 1.45, rkx: 1.45, lsx: -0.95, rsx: -0.95, lsz: -0.12, rsz: -0.12, lex: -1.15, rex: -1.15, nx: 0.3, curl: 0.7, smile: 0 },
  seatRide: { hy: -0.38, sx: -0.1, lhx: -1.45, rhx: -1.45, lkx: 1.35, rkx: 1.35, lsx: -0.35, rsx: -0.35, lsz: 0.3, rsz: 0.3, lex: -0.6, rex: -0.6, curl: 0.8, smile: 0.8, brow: 0.4 },
  wave: { hy: -0.012, lsz: 0.1, lex: -0.3, lkx: 0.06, rkx: 0.03, rsx: -0.3, rsz: 1.9, rex: -1.2, curl: 0.15, smile: 0.9, brow: 0.4 }
};
function mixPose(a, b, u, out) {
  out = out || {};
  for (let i = 0; i < PK.length; i++) { const k = PK[i], va = a[k] || 0, vb = b[k] || 0; out[k] = va + (vb - va) * u; }
  return out;
}
function addPose(a, d, k) { for (const key in d) a[key] = (a[key] || 0) + d[key] * (k == null ? 1 : k); return a; }
// A walk cycle laid over any pose: ph advances about 2 pi per stride. Knees bend through the swing, the heel
// strikes with a straight-ish knee, arms swing against the legs with soft elbows, the hips sway and bob.
function walkPose(p, ph, k, armsFree) {
  const s = Math.sin(ph), c = Math.cos(ph);
  p.lhx = (p.lhx || 0) - 0.48 * s * k; p.rhx = (p.rhx || 0) + 0.48 * s * k;
  p.lkx = (p.lkx || 0) + (0.12 + 0.85 * Math.max(0, c)) * k; p.rkx = (p.rkx || 0) + (0.12 + 0.85 * Math.max(0, -c)) * k;
  p.lax = (p.lax || 0) + (-0.25 * Math.max(0, c) + 0.2 * s) * k; p.rax = (p.rax || 0) + (-0.25 * Math.max(0, -c) - 0.2 * s) * k;
  p.hy = (p.hy || 0) - (0.03 - 0.025 * Math.abs(s)) * k;
  p.hry = (p.hry || 0) + 0.09 * s * k; p.sy = (p.sy || 0) - 0.12 * s * k; p.hz = (p.hz || 0) + 0.03 * c * k;
  p.sx = (p.sx || 0) + 0.05 * k;
  if (armsFree) { p.lsx = (p.lsx || 0) + 0.42 * s * k; p.rsx = (p.rsx || 0) - 0.42 * s * k; p.lex = (p.lex || 0) - 0.25 * Math.max(0, -s) * k; p.rex = (p.rex || 0) - 0.25 * Math.max(0, s) * k; }
  return p;
}
// A cheer that bounces: knees load before each hop, elbows pump
function cheerExtra(t, i) {
  const j = Math.sin(t * 8 + i), up = Math.max(0, j);
  return { hy: up * 0.06 - Math.max(0, -j) * 0.05, lkx: Math.max(0, -j) * 0.5, rkx: Math.max(0, -j) * 0.5, lhx: -Math.max(0, -j) * 0.3, rhx: -Math.max(0, -j) * 0.3, lax: -Math.max(0, -j) * 0.2, rax: -Math.max(0, -j) * 0.2,
    lsx: Math.sin(t * 7 + i) * 0.3, rsx: Math.cos(t * 7 + i) * 0.3, lex: -Math.abs(Math.sin(t * 7 + i)) * 0.5, rex: -Math.abs(Math.cos(t * 7 + i)) * 0.5, sx: -0.06 };
}

function applyPose(P, p, t) {
  const g = function (k) { return p[k] || 0; };
  P.pelvis.position.y = HIP_H + g("hy");
  P.pelvis.rotation.set(g("hx"), g("hry"), g("hz"));
  P.spine.rotation.set(g("sx"), g("sy"), g("sz"));
  P.neck.rotation.set(g("nx") * 0.35, g("ny") * 0.35, g("nz") * 0.35);
  P.head.rotation.set(g("nx") * 0.65, g("ny") * 0.65, g("nz") * 0.65);
  P.la.sh.rotation.set(g("lsx"), g("lsy"), g("lsz"));
  P.ra.sh.rotation.set(g("rsx"), -g("rsy"), -g("rsz"));
  P.la.el.rotation.x = Math.min(-0.08, g("lex")); P.ra.el.rotation.x = Math.min(-0.08, g("rex"));      // elbows never lock straight
  P.la.wr.rotation.set(g("lwx"), 0, g("lwz")); P.ra.wr.rotation.set(g("rwx"), 0, -g("rwz"));
  P.ll.hp.rotation.set(g("lhx"), 0, g("lhz")); P.rl.hp.rotation.set(g("rhx"), 0, -g("rhz"));
  P.ll.kn.rotation.x = Math.max(0.02, g("lkx")); P.rl.kn.rotation.x = Math.max(0.02, g("rkx"));
  P.ll.an.rotation.x = g("lax"); P.rl.an.rotation.x = g("rax");
  const curl = clamp(g("curl"), 0, 1);
  [P.la, P.ra].forEach(function (A) { for (let i = 0; i < 4; i++) { A.fingers[i].rotation.x = -curl * (1.0 + i * 0.08); A.fingers[i].userData.tip.rotation.x = -0.2 - curl * 1.1; } A.thumb.rotation.x = -0.5 - curl * 0.6; });
  const jaw = clamp(g("jaw"), 0, 1), smile = clamp(g("smile"), -1, 1);
  P.inner.scale.set(0.03 + smile * 0.006, 0.002 + jaw * 0.03, 0.014);
  P.inner.position.y = -0.008 - jaw * 0.012;
  P.lips.scale.set(1 + smile * 0.12, Math.abs(smile) < 0.08 ? 0.08 : smile * 0.55, 1);
  P.lips.position.y = 0.004 - jaw * 0.02 + (smile < 0 ? -0.012 : 0);
  P.chin.position.y = 0.042 - jaw * 0.016;
  const br = clamp(g("brow"), -1, 1), fr = clamp(g("frown"), 0, 1);
  P.brows.forEach(function (b, i) { const s = i ? 1 : -1; b.position.y = 0.22 + br * 0.014; b.rotation.z = s * (fr * 0.35 - br * 0.12); });
  P.blink -= (t || 0);
  let lid = 1;
  if (P.blink < 0.12) lid = Math.abs(P.blink - 0.06) / 0.06;
  if (P.blink < 0) P.blink = 2 + Math.random() * 3.5;
  P.eyes.forEach(function (e) { e.scale.y = Math.max(0.1, lid); });
}
// A little life on top of any pose: breathing, a slow weight shift, glances. k scales it (0 = still).
function lifePose(p, P, time, k) {
  const ph = P.phase + time;
  p.sx = (p.sx || 0) + Math.sin(ph * 1.7) * 0.015 * k;
  p.lsz = (p.lsz || 0) + Math.sin(ph * 1.7) * 0.02 * k; p.rsz = (p.rsz || 0) + Math.sin(ph * 1.7) * 0.02 * k;
  p.lex = (p.lex || 0) + Math.sin(ph * 0.9) * 0.05 * k; p.rex = (p.rex || 0) + Math.sin(ph * 0.9 + 1) * 0.05 * k;
  p.ny = (p.ny || 0) + Math.sin(ph * 0.43) * 0.18 * k;
  p.nx = (p.nx || 0) + Math.sin(ph * 0.61 + 1) * 0.04 * k;
  p.hz = (p.hz || 0) + Math.sin(ph * 0.5) * 0.015 * k;
  return p;
}
function posePerson(P, name, dt, time, extra, life) {
  const p = mixPose(POSES[name] || POSES.stand, POSES[name] || POSES.stand, 0, P.pose);
  if (extra) addPose(p, extra);
  if (name === "stand" || name === "wave") { const w = Math.sin((P.phase + time) * 0.5) * (life == null ? 1 : life); p.lkx += Math.max(0, w) * 0.12; p.rkx += Math.max(0, -w) * 0.12; p.hz += w * 0.02; }   // weight shift
  lifePose(p, P, time, life == null ? 1 : life);
  applyPose(P, p, dt);
}

/* The mascot's extras, bought with play: earmuffs, a plaid scarf, a paper turkey hat */
function dressMascot(P, maps) {
  const T = THREE, G = personGeo();
  if (!P.acc.built) {
    P.acc.built = true;
    const muff = new T.MeshLambertMaterial({ color: 0xff77a8 }), band = new T.MeshPhongMaterial({ color: 0x8e93a2, shininess: 60 });
    const em = new T.Group(); P.head.add(em);
    [-1, 1].forEach(function (s) { const m = new T.Mesh(G.sph, muff); m.position.set(s * 0.158, 0.15, 0); m.scale.set(0.04, 0.062, 0.062); em.add(m); });
    const arc = new T.Mesh(new T.TorusGeometry(0.168, 0.009, 6, 20, Math.PI), band); arc.position.set(0, 0.15, -0.01); em.add(arc);
    P.acc.muffs = em;
    const plaid = new T.MeshLambertMaterial({ map: maps.plaid });
    const sc = new T.Group(); P.spine.add(sc);
    const wrap = new T.Mesh(G.ring, plaid); wrap.position.set(0, 0.53, 0.01); wrap.scale.set(0.088, 0.55, 0.08); sc.add(wrap);
    const tail = new T.Group(); tail.position.set(0.05, 0.5, 0.085); sc.add(tail);
    const tm = new T.Mesh(G.box, plaid); tm.scale.set(0.06, 0.24, 0.018); tm.position.y = -0.12; tail.add(tm);
    const tail2 = new T.Group(); tail2.position.set(-0.03, 0.5, 0.08); sc.add(tail2);
    const tm2 = new T.Mesh(G.box, plaid); tm2.scale.set(0.06, 0.2, 0.018); tm2.position.y = -0.1; tail2.add(tm2);
    P.acc.scarf = sc; P.acc.tail = tail; P.acc.tail2 = tail2;
    const hat = new T.Group(); hat.position.set(0, 0.28, -0.02); P.head.add(hat);
    const hb = new T.Mesh(new T.CylinderGeometry(0.16, 0.165, 0.06, 20, 1, true), new T.MeshLambertMaterial({ color: 0x8a5a2b, side: T.DoubleSide })); hat.add(hb);
    const fc = [0xe4343e, 0xff8a1f, 0xffd23f, 0xff8a1f, 0xe4343e, 0x9bdc3a, 0xffd23f];
    for (let i = 0; i < 7; i++) { const f = new T.Mesh(G.sph, new T.MeshLambertMaterial({ color: fc[i] })); const a = (i - 3) * 0.32; f.position.set(Math.sin(a) * 0.08, 0.1 + Math.cos(a) * 0.04, -0.09); f.scale.set(0.035, 0.11, 0.012); f.rotation.z = -a; hat.add(f); }
    const tk = new T.Mesh(G.sph, new T.MeshLambertMaterial({ color: 0x8a5a2b })); tk.position.set(0, 0.06, 0.12); tk.scale.set(0.045, 0.05, 0.03); hat.add(tk);
    const bk = new T.Mesh(G.sph, new T.MeshLambertMaterial({ color: 0xffd23f })); bk.position.set(0, 0.07, 0.15); bk.scale.set(0.012, 0.008, 0.02); hat.add(bk);
    P.acc.hat = hat;
  }
  P.acc.muffs.visible = wear("earmuffs");
  P.acc.scarf.visible = wear("scarf");
  P.acc.hat.visible = wear("hat");
  P.spikes.visible = !wear("hat");
}

/* =====================================================================================
   3D presentation
   ===================================================================================== */

// A box with every edge and corner rounded (as in the other 3D arcade games).
function roundBox(w, h, d, r, s) {
  const T = THREE;
  s = s || 3;
  const per = (s + 1) * (s + 1), half = 0.5 / s;
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

// The kit every scene draws from. K is filled in by buildKit().
let K = null;
function buildKit(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: /[?&]shots=1/.test(location.search) });
  renderer.setClearColor(0x101219, 1);
  const caps = renderer.capabilities, aniso = Math.min(4, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    t.colorSpace = T.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = aniso;
    return t;
  }
  const script = scriptCanvas(scriptImg);
  K = { T: T, gl: gl, renderer: renderer, tex: tex, script: script, geo: {}, maps: {}, mats: {} };
  const G = K.geo, MP = K.maps, MT = K.mats;
  G.sph = new T.SphereGeometry(1, 20, 14); G.box = new T.BoxGeometry(1, 1, 1); G.cyl = new T.CylinderGeometry(1, 1, 1, 18);
  G.cone = new T.ConeGeometry(1, 1, 18); G.plane = new T.PlaneGeometry(1, 1); G.ring = new T.TorusGeometry(1, 0.12, 8, 28);
  G.ground = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  MP.tee = tex(teeCanvas(script)); MP.teeSleeve = tex(clothCanvas("#1b1b22", "rgba(0,0,0,.45)", 12, { folds: 12, seam: "rgba(255,255,255,.14)" }), true); MP.jeans = tex(clothCanvas("#3b5a96", "rgba(10,20,50,.45)", 4, { denim: true, vertical: true, seam: "rgba(255,200,120,.5)" }), true);
  MP.sweater = tex(sweaterCanvas()); MP.plaid = tex(plaidCanvas("#c2304a", "#2f6b3a"), true); MP.plaidCloth = tex(plaidCanvas("#c2304a", "#fff1d6", "#8a1f30"), true);
  MP.pieBox = tex(pieBoxCanvas(script, false)); MP.pieBoxGold = tex(pieBoxCanvas(script, true)); MP.pieTop = tex(pieTopCanvas());
  MP.giftA = tex(giftCanvas("#5a7bb5", "#ffd23f")); MP.giftB = tex(giftCanvas("#8a5a9a", "#ffd23f"));
  MP.leaf = tex(leafCanvas()); MP.glow = tex(glowCanvas()); MP.shadow = tex(shadowCanvas());
  MT.pieBox = new T.MeshLambertMaterial({ map: MP.pieBox }); MT.pieBoxGold = new T.MeshPhongMaterial({ map: MP.pieBoxGold, shininess: 80, specular: 0x886622 });
  MT.giftA = new T.MeshLambertMaterial({ map: MP.giftA }); MT.giftB = new T.MeshLambertMaterial({ map: MP.giftB });
  MT.shadow = new T.MeshBasicMaterial({ map: MP.shadow, transparent: true, depthWrite: false, opacity: 0.6 });
  MT.crust = new T.MeshLambertMaterial({ color: 0xc9842e }); MT.filling = new T.MeshLambertMaterial({ map: MP.pieTop });
  G.pieBox = roundBox(0.38, 0.13, 0.38, 0.015, 2);

  /* the mascot: the Nostalgia Pro collector (spiky brown hair, shades, the NP tee, jeans, red sneakers) */
  K.hero = makePerson({ skin: 0xf0a862, shirtMap: MP.tee, sleeveMap: MP.teeSleeve, trim: 0x101016, pantsMap: MP.jeans, shoe: 0xd8283a, sole: 0xf6f2e8, hair: 0x5a3418,
    hairStyle: "spiky", glasses: "shades", sleeves: "short", brow: 0x3a2010, belt: 0x2a1a10 });
  K.hero.root.traverse(function (o) { o.frustumCulled = true; });
  dressMascot(K.hero, MP);
  K.car = makeCar(T);
  K.ledMat = null;
  return K;
}
function dressAll() { X = X || extras(); dressMascot(K.hero, K.maps); paintCar(); for (let i = 0; i < K.pieMats.length; i++) K.pieMats[i].material = wear("gold") ? K.mats.pieBoxGold : K.mats.pieBox; }

// Move a shared object (the mascot, the car) into whatever scene is on screen.
function place(obj, parent, x, y, z, ry) {
  if (obj.parent !== parent) parent.add(obj);
  obj.position.set(x || 0, y || 0, z || 0);
  obj.rotation.set(0, ry || 0, 0);
}
// helpers for building
function M_(o) { return o instanceof THREE.Material ? o : new THREE.MeshLambertMaterial(typeof o === "number" || typeof o === "string" ? { color: o } : o); }
function add(parent, geo, mat, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(geo, M_(mat));
  m.position.set(x || 0, y || 0, z || 0);
  if (sx != null) m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
  parent.add(m); return m;
}
function grp(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(g); return g; }
function glowSprite(parent, x, y, z, s, col, op) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.maps.glow, color: col || 0xffe0a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op == null ? 0.8 : op }));
  sp.position.set(x, y, z); sp.scale.set(s, s, 1); parent.add(sp); return sp;
}
// A pie box that follows the gold pie box unlock
function pieBox(parent, x, y, z, ry) {
  const m = new THREE.Mesh(K.geo.pieBox, wear("gold") ? K.mats.pieBoxGold : K.mats.pieBox);
  m.position.set(x, y, z); m.rotation.y = ry || 0; parent.add(m);
  (K.pieMats = K.pieMats || []).push(m);
  return m;
}
// A pumpkin pie in its tin
function pie(parent, x, y, z, r) {
  const g = grp(parent, x, y, z); r = r || 0.15;
  add(g, new THREE.CylinderGeometry(r, r * 0.82, r * 0.28, 24), 0x9aa0aa, 0, 0, 0);
  add(g, new THREE.TorusGeometry(r * 0.93, r * 0.12, 8, 24).rotateX(Math.PI / 2), K.mats.crust, 0, r * 0.14, 0);
  add(g, new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.01, 24), K.mats.filling, 0, r * 0.15, 0);
  return g;
}
// String lights: bulbs hung in a sagging line between points
function stringLights(parent, pts, per, sag, colors) {
  const T = THREE, n = (pts.length - 1) * per;
  const bulb = new T.InstancedMesh(new T.SphereGeometry(0.045, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff }), n);
  const wire = [], m = new T.Matrix4(), c = new T.Color();
  let k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    for (let j = 0; j < per; j++) {
      const u = (j + 0.5) / per, x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * sag, z = a[2] + (b[2] - a[2]) * u;
      m.makeTranslation(x, y - 0.05, z); bulb.setMatrixAt(k, m); bulb.setColorAt(k, c.set(colors[k % colors.length])); k++;
    }
    for (let j = 0; j <= 10; j++) { const u = j / 10; wire.push(new T.Vector3(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * sag, a[2] + (b[2] - a[2]) * u)); }
  }
  bulb.instanceMatrix.needsUpdate = true; bulb.instanceColor.needsUpdate = true;
  parent.add(bulb);
  const line = new T.Line(new T.BufferGeometry().setFromPoints(wire), new T.LineBasicMaterial({ color: 0x1b1b22 }));
  parent.add(line);
  bulb.userData.colors = colors;
  return bulb;
}
function twinkle(bulbs, t) {
  if (!bulbs || Sh.reduced) return;
  const c = new THREE.Color(), cols = bulbs.userData.colors, n = bulbs.count, f = Math.floor(t * 2.5);
  if (bulbs.userData.f === f) return;
  bulbs.userData.f = f;
  for (let i = 0; i < n; i++) { const on = ((i * 7 + f) % 9) !== 0; c.set(cols[i % cols.length]); if (!on) c.multiplyScalar(0.35); bulbs.setColorAt(i, c); }
  bulbs.instanceColor.needsUpdate = true;
}
// Falling fall leaves inside a box: [x0, x1], [y0, y1], [z0, z1]
const LEAF_COLS = ["#c2304a", "#e0662a", "#e0a13a", "#d8b23a", "#a33a2a", "#8a5a2b"];
function leafFall(parent, n, bx, by, bz, size) {
  const T = THREE, mesh = new T.InstancedMesh(new T.PlaneGeometry(size || 0.14, size || 0.14),
    new T.MeshLambertMaterial({ map: K.maps.leaf, alphaTest: 0.5, side: T.DoubleSide }), n);
  const L = [], c = new T.Color(), rnd = rng(n * 7 + 3);
  for (let i = 0; i < n; i++) { L.push({ x: bx[0] + rnd() * (bx[1] - bx[0]), y: by[0] + rnd() * (by[1] - by[0]), z: bz[0] + rnd() * (bz[1] - bz[0]), p: rnd() * TAU, v: 0.4 + rnd() * 0.5 }); mesh.setColorAt(i, c.set(LEAF_COLS[i % LEAF_COLS.length])); }
  mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  parent.add(mesh);
  const q = new T.Quaternion(), e = new T.Euler(), m = new T.Matrix4(), p = new T.Vector3(), s = new T.Vector3(1, 1, 1);
  return { mesh: mesh, tick: function (dt, t, wind, dz) {
    for (let i = 0; i < n; i++) {
      const l = L[i];
      l.y -= l.v * dt; l.x += (Math.sin(t * 1.3 + l.p) * 0.4 + (wind || 0)) * dt; l.z += (dz || 0) * dt;
      if (l.y < by[0]) { l.y = by[1]; l.x = bx[0] + Math.random() * (bx[1] - bx[0]); }
      if (l.z > bz[1]) l.z -= bz[1] - bz[0];
      if (l.x > bx[1]) l.x -= bx[1] - bx[0]; if (l.x < bx[0]) l.x += bx[1] - bx[0];
      e.set(t * 2 + l.p, t * 1.3 + l.p * 2, Math.sin(t * 3 + l.p)); q.setFromEuler(e);
      m.compose(p.set(l.x, l.y, l.z), q, s); mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  } };
}
// A fall tree: a trunk with three or four leafy crowns
function tree(parent, x, z, s, col, rnd) {
  const g = grp(parent, x, 0, z);
  add(g, K.geo.cyl, 0x4a2a1c, 0, 1.1 * s, 0, 0.16 * s, 2.2 * s, 0.16 * s);
  const n = 3 + Math.floor(rnd() * 2), mat = new THREE.MeshLambertMaterial({ color: col });
  for (let i = 0; i < n; i++) add(g, K.geo.sph, mat, (rnd() - 0.5) * 1.4 * s, (2.4 + rnd() * 1.2) * s, (rnd() - 0.5) * 1.2 * s, (0.9 + rnd() * 0.5) * s);
  return g;
}

/* ---------------- The Pickle: the last car on the lot ----------------
   A tiny hatchback, nose toward -Z. Six parts come off in order: hubcaps, side mirrors, bumpers, hood, left door,
   right door (with the roof and hatch). What's left is a frame, four wheels, a seat and a steering wheel. */
function makeCar(T) {
  const car = new T.Group(), paintM = new T.MeshPhongMaterial({ color: 0x9bdc3a, shininess: 70, specular: 0x666666 });
  const chrome = new T.MeshPhongMaterial({ color: 0xdfe4ea, shininess: 120, specular: 0xffffff });
  const glass = new T.MeshPhongMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.45, shininess: 120, specular: 0xffffff, side: T.DoubleSide });
  const dark = new T.MeshLambertMaterial({ color: 0x23252c }), tire = new T.MeshLambertMaterial({ color: 0x15161a });
  const seatM = new T.MeshLambertMaterial({ color: 0x7a4a2a });
  const parts = [new T.Group(), new T.Group(), new T.Group(), new T.Group(), new T.Group(), new T.Group()];
  parts.forEach(function (p) { car.add(p); });
  add(car, roundBox(1.4, 0.16, 3.1, 0.06), dark, 0, 0.42, 0);                       // the frame
  const wheels = [];
  [[-0.72, -1.05], [0.72, -1.05], [-0.72, 1.05], [0.72, 1.05]].forEach(function (w) {
    const wg = grp(car, w[0], 0.33, w[1]); const sp = grp(wg, 0, 0, 0);
    add(sp, new T.CylinderGeometry(0.33, 0.33, 0.24, 20).rotateZ(Math.PI / 2), tire, 0, 0, 0);
    add(sp, new T.CylinderGeometry(0.17, 0.17, 0.25, 12).rotateZ(Math.PI / 2), 0x6a6e78, 0, 0, 0);
    for (let k = 0; k < 4; k++) { const b = add(sp, K.geo.box, 0x2a2c33, 0, 0, 0, 0.255, 0.05, 0.3); b.rotation.x = k * Math.PI / 4; }
    const hc = add(parts[0], new T.CylinderGeometry(0.2, 0.2, 0.04, 20).rotateZ(Math.PI / 2), chrome, w[0] + Math.sign(w[0]) * 0.13, 0.33, w[1]);
    hc.userData.spin = true;
    wheels.push(sp);
  });
  // the seat and the steering wheel stay no matter what
  add(car, roundBox(0.62, 0.16, 0.6, 0.06), seatM, -0.32, 0.58, 0.25);
  const back = add(car, roundBox(0.62, 0.72, 0.16, 0.06), seatM, -0.32, 0.95, 0.58); back.rotation.x = 0.18;
  add(car, roundBox(0.36, 0.2, 0.12, 0.05), seatM, -0.32, 1.38, 0.66);
  add(car, roundBox(0.62, 0.16, 0.6, 0.06), seatM, 0.36, 0.58, 0.25);
  const back2 = add(car, roundBox(0.62, 0.72, 0.16, 0.06), seatM, 0.36, 0.95, 0.58); back2.rotation.x = 0.18;
  const col = add(car, K.geo.cyl, dark, -0.32, 0.86, -0.42, 0.03, 0.6, 0.03); col.rotation.x = 0.9;
  const wheelS = add(car, new T.TorusGeometry(0.17, 0.025, 8, 20), dark, -0.32, 1.07, -0.25); wheelS.rotation.x = -0.6;
  add(car, roundBox(1.3, 0.5, 0.25, 0.05), dark, 0, 0.75, -0.62);                     // dash
  // lamps live on the frame so the car always has eyes
  const lampM = new T.MeshBasicMaterial({ color: 0xfff6d0 }), tailM = new T.MeshBasicMaterial({ color: 0xff3322 });
  [-0.5, 0.5].forEach(function (x) { add(car, K.geo.sph, lampM, x, 0.62, -1.62, 0.13, 0.11, 0.05); add(car, K.geo.sph, tailM, x, 0.62, 1.6, 0.12, 0.08, 0.04); });
  // 1 side mirrors
  [-1, 1].forEach(function (s) { const mg = grp(parts[1], s * 0.84, 1.02, -0.52); add(mg, K.geo.box, dark, -s * 0.06, -0.02, 0, 0.12, 0.05, 0.05); add(mg, roundBox(0.1, 0.13, 0.18, 0.04), paintM, s * 0.02, 0.04, 0); });
  // 2 bumpers
  add(parts[2], roundBox(1.5, 0.2, 0.2, 0.08), chrome, 0, 0.45, -1.68); add(parts[2], roundBox(1.5, 0.2, 0.2, 0.08), chrome, 0, 0.45, 1.66);
  // 3 hood, front fenders and the windshield
  add(parts[3], roundBox(1.56, 0.42, 1.0, 0.16), paintM, 0, 0.7, -1.12);
  add(parts[3], roundBox(1.1, 0.06, 0.25, 0.03), dark, 0, 0.58, -1.62);                // grille
  const ws = add(parts[3], roundBox(1.4, 0.6, 0.05, 0.02), glass, 0, 1.18, -0.6); ws.rotation.x = -0.5;
  // 4 left door, 5 right door with the roof, rear quarters and hatch
  function door(s, p) {
    add(p, roundBox(0.1, 0.5, 1.15, 0.05), paintM, s * 0.76, 0.75, -0.02);
    const win = add(p, roundBox(0.05, 0.38, 0.9, 0.04), glass, s * 0.74, 1.2, 0.05);
    add(p, roundBox(0.08, 0.04, 0.95, 0.02), paintM, s * 0.75, 1.0, 0.04);
    add(p, K.geo.box, chrome, s * 0.82, 0.88, 0.3, 0.03, 0.03, 0.12);
    return win;
  }
  door(-1, parts[4]); door(1, parts[5]);
  add(parts[5], roundBox(1.5, 0.08, 1.4, 0.05), paintM, 0, 1.44, 0.45);                 // roof
  [-1, 1].forEach(function (s) { add(parts[5], roundBox(0.1, 0.9, 0.85, 0.06), paintM, s * 0.76, 0.98, 1.08); add(parts[5], K.geo.box, paintM, s * 0.73, 1.22, -0.45, 0.05, 0.5, 0.06); });
  const hatch = add(parts[5], roundBox(1.5, 0.95, 0.12, 0.06), paintM, 0, 0.98, 1.56);
  add(parts[5], roundBox(1.1, 0.4, 0.04, 0.03), glass, 0, 1.18, 1.63);
  const plate = new T.Mesh(new T.PlaneGeometry(0.42, 0.18), new T.MeshBasicMaterial({ map: K.tex(signCanvas(K.script, 256, 110, "#fff1d6", "#1d2b53", [["PICKLE", "#1d2b53", 56]])) }));
  plate.position.set(0, 0.72, 1.63); parts[5].add(plate);
  [-0.55, 0.55].forEach(function (x) { add(parts[5], K.geo.box, tailM, x, 0.8, 1.63, 0.22, 0.12, 0.02); });
  hatch.userData.paint = true;
  car.userData = { parts: parts, wheels: wheels, paint: paintM, flyers: [], scarf: null };
  return car;
}
function paintCar() { if (K && K.car) K.car.userData.paint.color.set(paint()); }
function carParts(lost) { const p = K.car.userData.parts; for (let i = 0; i < 6; i++) p[i].visible = i >= lost; }
function spinWheels(dist) { const w = K.car.userData.wheels; for (let i = 0; i < 4; i++) w[i].rotation.x = -dist / 0.33; K.car.userData.parts[0].children.forEach(function (h) { h.rotation.x = -dist / 0.33; }); }
// The mascot in the driver's seat, scarf flying if the doors are gone
function heroDrive(dt, t, life) {
  const P = K.hero;
  place(P.root, K.car, -0.32, 0.21, 0.32, Math.PI);
  posePerson(P, "drive", dt, t, { ny: Math.sin(t * 0.7) * 0.15 }, life == null ? 0.4 : life);
  if (P.acc.tail) { P.acc.tail.rotation.x = 1.1 + Math.sin(t * 22) * 0.25; P.acc.tail2.rotation.x = 0.9 + Math.sin(t * 19 + 1) * 0.25; }
}
function heroUnflap() { const P = K.hero; if (P.acc.tail) { P.acc.tail.rotation.x = 0; P.acc.tail2.rotation.x = 0; } }

/* ---------------- LED board mesh (shared texture, one per place it hangs) ---------------- */
function ledMesh(parent, w, h, x, y, z, ry) {
  const T = THREE;
  if (!K.ledMat) {
    LED = ledCreate(K.script);
    const tLed = new T.CanvasTexture(LED.canvas);
    tLed.colorSpace = T.SRGBColorSpace; tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
    LED.tex = tLed;
    const tDot = new T.CanvasTexture(ledDotCanvas()); tDot.wrapS = tDot.wrapT = T.RepeatWrapping;
    K.ledMat = new T.ShaderMaterial({
      uniforms: { tLed: { value: tLed }, tDot: { value: tDot }, grid: { value: new T.Vector2(LED_COLS, LED_ROWS) } },
      vertexShader: "varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
      fragmentShader: [
        "uniform sampler2D tLed;", "uniform sampler2D tDot;", "uniform vec2 grid;", "varying vec2 vUv;",
        "void main() {",
        "  vec2 cell = vUv * grid;", "  vec2 px = 1.0 / grid;", "  vec2 c0 = (floor(cell) + 0.5) * px;",
        "  vec3 led = texture2D(tLed, c0).rgb;", "  vec3 halo = led;",
        "  halo += texture2D(tLed, c0 + px * vec2( 1.5,  1.5)).rgb + texture2D(tLed, c0 + px * vec2(-1.5,  1.5)).rgb;",
        "  halo += texture2D(tLed, c0 + px * vec2( 1.5, -1.5)).rgb + texture2D(tLed, c0 + px * vec2(-1.5, -1.5)).rgb;",
        "  halo += texture2D(tLed, c0 + px * vec2( 3.0,  0.0)).rgb + texture2D(tLed, c0 + px * vec2(-3.0,  0.0)).rgb;",
        "  halo += texture2D(tLed, c0 + px * vec2( 0.0,  3.0)).rgb + texture2D(tLed, c0 + px * vec2( 0.0, -3.0)).rgb;",
        "  halo /= 9.0;", "  float lens = texture2D(tDot, cell).r;",
        "  vec3 col = led * lens * 1.38 + halo * 0.34 + vec3(0.030, 0.034, 0.046) * lens + vec3(0.005, 0.006, 0.010);",
        "  gl_FragColor = vec4(col, 1.0);", "  #include <colorspace_fragment>", "}"
      ].join("\n")
    });
    ledDraw(); tLed.needsUpdate = true;
  }
  const g = grp(parent, x, y, z); g.rotation.y = ry || 0;
  add(g, roundBox(w + 0.12, h + 0.12, 0.1, 0.03), 0x14161f, 0, 0, -0.06);
  const m = new T.Mesh(new T.PlaneGeometry(w, h), K.ledMat); g.add(m);
  return g;
}
function lights(scene, sky, ground, hemiI, keyCol, keyI, kx, ky, kz) {
  scene.add(new THREE.HemisphereLight(sky, ground, hemiI));
  const k = new THREE.DirectionalLight(keyCol, keyI); k.position.set(kx, ky, kz); scene.add(k);
  return k;
}
function skyDome(scene, top, mid, bot, r) {
  const c = mkCanvas(16, 256), g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top); gr.addColorStop(0.5, mid); gr.addColorStop(1, bot);
  g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
  const m = new THREE.Mesh(new THREE.SphereGeometry(r || 200, 24, 16), new THREE.MeshBasicMaterial({ map: K.tex(c), side: THREE.BackSide, depthWrite: false, fog: false }));
  m.renderOrder = -2; scene.add(m); return m;
}

/* ---------------- INTRO: Gate 9, the day before Thanksgiving ---------------- */
function buildIntro() {
  const T = THREE, scene = new T.Scene(), cam = new T.PerspectiveCamera(52, W / H, 0.1, 400);
  scene.background = new T.Color(0x14161f);
  lights(scene, 0xfff2e0, 0x5a4a40, 1.5, 0xfff0dc, 1.6, 2, 5, 6);
  const floorM = new T.MeshLambertMaterial({ map: K.tex(carpetCanvas("#2a3f7a", "#3b5299", 41), true) });
  floorM.map.repeat.set(8, 8);
  add(scene, K.geo.ground, floorM, 0, 0, 0, 30, 1, 30);
  // the back wall: a big window onto the apron, with a plane at the gate
  const wallM = new T.MeshLambertMaterial({ color: 0x5a5e6a });
  add(scene, K.geo.box, wallM, 0, 3.6, -4, 14, 1.6, 0.3); add(scene, K.geo.box, wallM, 0, 0.25, -4, 14, 0.5, 0.3);
  for (let i = -3; i <= 3; i++) add(scene, K.geo.box, 0x1b1d26, i * 1.6, 1.9, -3.95, 0.12, 2.8, 0.2);
  const out = new T.Group(); scene.add(out);
  skyDome(scene, "#4f7fc0", "#a9c3de", "#f3d9b0", 120);
  add(out, K.geo.ground, 0x7d8798, 0, -0.02, -30, 120, 1, 50);
  for (let i = 0; i < 8; i++) add(out, K.geo.box, 0xeceae2, -10 + i * 4, 0.0, -14, 1.6, 0.03, 0.2);
  // the plane: fuselage, wings, a tail with the wordmark
  const plane = grp(out, 1.5, 0, -16);
  const body = new T.MeshPhongMaterial({ color: 0xf4f2ec, shininess: 60 }), stripe = new T.MeshLambertMaterial({ color: 0xc2304a });
  const fus = add(plane, new T.CapsuleGeometry(1.4, 12, 8, 20), body, 0, 2.6, 0); fus.rotation.z = Math.PI / 2;
  const st = add(plane, new T.CylinderGeometry(1.42, 1.42, 11, 20, 1, true), stripe, 0, 2.6, 0, 1, 1, 1); st.rotation.z = Math.PI / 2; st.scale.set(1, 1, 1); st.material.side = T.DoubleSide;
  st.scale.set(1.002, 1, 0.25); st.position.z = 0.2;
  add(plane, roundBox(5, 0.25, 14, 0.1), body, -1, 2.0, 2);
  const tailFin = add(plane, roundBox(2.8, 3.4, 0.2, 0.1), body, 6.2, 4.8, 0); tailFin.rotation.z = -0.35;
  const tailMark = new T.Mesh(new T.PlaneGeometry(2.4, 1.0), new T.MeshBasicMaterial({ map: K.tex(K.script), transparent: true }));
  tailMark.position.set(6.2, 4.9, 0.12); tailMark.rotation.z = -0.35; plane.add(tailMark);
  for (let i = 0; i < 14; i++) add(plane, K.geo.sph, 0x2a3f7a, -5 + i * 0.75, 3.0, 1.38, 0.14, 0.18, 0.04);
  add(plane, K.geo.box, 0x8e93a2, -3.5, 2.3, 4, 1.2, 2.2, 6);                         // the jet bridge
  // departures board on a pillar, the LED ribbon over the window, the gate sign
  const cb = mkCanvas(512, 256), tb = K.tex(cb); paintBoard(cb.getContext("2d"), 0);
  const brd = grp(scene, -0.42, 2.62, -1.6); brd.rotation.y = 0.14;
  add(brd, roundBox(1.9, 1.05, 0.14, 0.04), 0x0b0c12, 0, 0, -0.08);
  add(brd, K.geo.plane, new T.MeshBasicMaterial({ map: tb }), 0, 0, 0, 1.76, 0.88, 1);
  add(scene, K.geo.cyl, 0x2a2d38, -0.42, 3.5, -1.65, 0.04, 1.2, 0.04);
  add(scene, K.geo.box, new T.MeshBasicMaterial({ color: 0x3e424e }), 0, 4.4, 0, 14, 0.1, 12);
  for (let i = 0; i < 6; i++) add(scene, K.geo.box, new T.MeshBasicMaterial({ color: 0xfff4dc }), -2.5 + (i % 3) * 2.5, 4.34, -2.5 + Math.floor(i / 3) * 3, 0.9, 0.02, 0.22);
  ledMesh(scene, 3.4, 0.37, 0.6, 3.15, -3.8, 0);
  const gs = grp(scene, 1.45, 2.2, -2.0);
  add(gs, K.geo.box, 0x1b1d26, 0, 0.45, 0, 0.04, 0.5, 0.04);
  add(gs, K.geo.plane, new T.MeshBasicMaterial({ map: K.tex(signCanvas(K.script, 256, 128, "#08090d", "#ffd23f", [["GATE 9", "#ffd23f", 54]])) }), 0, 0, 0, 1.0, 0.5, 1);
  // a wall sign with the wordmark
  add(scene, K.geo.plane, new T.MeshBasicMaterial({ map: K.tex(signCanvas(K.script, 512, 256, "#1d2b53", "#ff8a1f", [["HAPPY THANKSGIVING", "#ffd23f", 34]], { logo: true })) }), -2.9, 2.6, -3.84, 1.6, 0.8, 1);
  // gate seats: rows of joined chairs
  const seatM = new T.MeshLambertMaterial({ color: 0x2b3566 }), legM = new T.MeshPhongMaterial({ color: 0x9aa0aa, shininess: 60 });
  [[-1.9, 1.6], [2.2, 1.9], [-2.1, -0.6]].forEach(function (r) {
    const row = grp(scene, r[0], 0, r[1]);
    add(row, K.geo.box, legM, 0, 0.32, 0, 2.1, 0.06, 0.08);
    for (let i = 0; i < 4; i++) { add(row, roundBox(0.48, 0.1, 0.48, 0.04), seatM, -0.75 + i * 0.5, 0.45, 0); const bk = add(row, roundBox(0.48, 0.5, 0.08, 0.04), seatM, -0.75 + i * 0.5, 0.72, 0.25); bk.rotation.x = 0.12; }
    [-0.9, 0.9].forEach(function (x) { add(row, K.geo.box, legM, x, 0.16, 0, 0.06, 0.32, 0.4); });
  });
  // fall touches: potted mums, a paper turkey, a leaf garland, string lights over the window
  [[-3.2, -3.4], [3.3, -3.4], [-0.4, -3.3]].forEach(function (p, i) {
    const pot = grp(scene, p[0], 0, p[1]);
    add(pot, new T.CylinderGeometry(0.26, 0.2, 0.36, 14), 0x8a5a2b, 0, 0.18, 0);
    add(pot, K.geo.sph, [0xffb81f, 0xe0662a, 0xc2304a][i], 0, 0.5, 0, 0.36, 0.26, 0.36);
  });
  const tk = grp(scene, -3.0, 1.2, -3.82);
  [0xc2304a, 0xff8a1f, 0xffd23f, 0xff8a1f, 0xc2304a].forEach(function (c, i) { const f = add(tk, K.geo.sph, c, (i - 2) * 0.14, 0.25 + (2 - Math.abs(i - 2)) * 0.05, 0, 0.09, 0.28, 0.02); f.rotation.z = -(i - 2) * 0.35; });
  add(tk, K.geo.sph, 0x8a5a2b, 0, 0.05, 0.02, 0.22, 0.24, 0.03); add(tk, K.geo.sph, 0xa0703a, 0, 0.3, 0.03, 0.1, 0.11, 0.03);
  const bulbs = stringLights(scene, [[-6, 3.0, -3.75], [-2, 3.0, -3.75], [2, 3.0, -3.75], [6, 3.0, -3.75]], 12, 0.22, ["#ff8a1f", "#ffd23f", "#c2304a", "#9bdc3a", "#fff1d6"]);
  // the hero and three pie boxes
  const boxes = grp(scene, 0, 0, 0);
  for (let i = 0; i < 3; i++) pieBox(boxes, 0, 0.0 + i * 0.135, 0, (i - 1) * 0.08);
  const leaves = leafFall(scene, 40, [-4, 4], [0.1, 3.4], [-3.6, -3.3], 0.12);
  return { scene: scene, cam: cam, sync: function (state, dt, t) {
    const pt = S.phase === "intro" ? S.pt : 5;
    paintBoard(cb.getContext("2d"), pt); tb.needsUpdate = true;
    const P = K.hero;
    const wk = clamp(pt / 2.4, 0, 1), ease = 1 - Math.pow(1 - wk, 1.6), walking = 1 - clamp((pt - 2.1) / 0.5, 0, 1);
    const turn = clamp((pt - 2.0) / 0.7, 0, 1);
    place(P.root, scene, 2.6 - ease * 2.05, 0, 0.6, -Math.PI / 2 * (1 - turn) - 0.25 * turn);
    const pz = mixPose(POSES.carry, POSES.carry, 0, P.pose);
    addPose(pz, { ny: (Math.sin(t * 0.8) * 0.2 - 0.35) * turn - 0.1 * (1 - turn), nx: -0.12 });
    walkPose(pz, pt * 4.6, walking, false);
    lifePose(pz, P, t, 0.7 * turn); applyPose(P, pz, dt);
    P.root.updateMatrixWorld(true);
    const hv = new T.Vector3(); P.la.hand.getWorldPosition(hv); const hr = new T.Vector3(); P.ra.hand.getWorldPosition(hr);
    boxes.position.set((hv.x + hr.x) / 2, (hv.y + hr.y) / 2 - 0.02, (hv.z + hr.z) / 2); boxes.rotation.y = -0.25;
    twinkle(bulbs, t); leaves.tick(dt, t);
    const k = Math.min(1, pt / 4.6);
    cam.position.set(0.55 - k * 0.4, 1.5, 4.6 - k * 0.6); cam.lookAt(0.25, 1.62, -1.6);
  } };
}

/* ---------------- SKY: Seat 34B ---------------- */
function buildSky() {
  const T = THREE, scene = new T.Scene(), cam = new T.PerspectiveCamera(48, W / H, 0.05, 200);
  scene.background = new T.Color(0x9ccaf2);
  lights(scene, 0xfff6e8, 0x6a6456, 1.7, 0xfff4e0, 1.3, 1, 4, -3);
  const fill = new T.DirectionalLight(0xdde8ff, 0.7); fill.position.set(-2, 2, -2); scene.add(fill);
  const cabin = grp(scene, 0, 0, 0);
  const wallM = new T.MeshLambertMaterial({ color: 0xd9d3c4 }), binM = new T.MeshLambertMaterial({ color: 0xe6e0d2 });
  const fab = K.tex(carpetCanvas("#2a3f7a", "#3b5299", 51), true); fab.repeat.set(2, 2);
  const seatM = new T.MeshLambertMaterial({ map: fab }), armM = new T.MeshLambertMaterial({ color: 0x8a8372 });
  const carpetM = new T.MeshLambertMaterial({ map: K.tex(carpetCanvas("#4a4f5e", "#5a5f6e", 52), true) }); carpetM.map.repeat.set(4, 12);
  add(cabin, K.geo.ground, carpetM, 0, 0, 0, 5, 1, 16);
  // the curved side wall with its windows, and the window view going by
  const wallG = new T.CylinderGeometry(2.0, 2.0, 16, 24, 1, true, Math.PI * 1.15, Math.PI * 0.55); wallG.rotateX(Math.PI / 2);
  const wall = add(cabin, wallG, new T.MeshLambertMaterial({ color: 0xe8e2d4, side: T.BackSide }), 0.35, 1.35, 0);
  const view = K.tex(cloudsCanvas(), true);
  const viewM = new T.MeshBasicMaterial({ map: view });
  const winFrame = new T.MeshLambertMaterial({ color: 0xb8b1a0 });
  for (let i = -3; i <= 3; i++) {
    const wg = grp(cabin, -1.52, 1.22, i * 0.95); wg.rotation.y = Math.PI / 2 + 0.0; wg.rotation.x = 0;
    wg.rotation.set(0, Math.PI / 2, -0.12);
    add(wg, roundBox(0.38, 0.52, 0.04, 0.16), winFrame, 0, 0, -0.01);
    const v = add(wg, roundBox(0.3, 0.42, 0.02, 0.13), viewM, 0, 0, 0.012);
    const sh = add(wg, roundBox(0.32, 0.16, 0.025, 0.04), 0xcfc8b7, 0, 0.19, 0.02);
  }
  // the overhead bins with string lights and a paper leaf garland
  add(cabin, roundBox(1.2, 0.42, 16, 0.08), binM, -0.95, 2.12, 0); add(cabin, K.geo.box, 0xb8b1a0, -0.38, 1.92, 0, 0.04, 0.04, 16);
  add(cabin, roundBox(1.2, 0.42, 16, 0.08), binM, 2.05, 2.12, 0);
  add(cabin, K.geo.box, 0xf2eee4, 0.55, 2.42, 0, 2.6, 0.05, 16);
  for (let i = -3; i <= 3; i++) { add(cabin, K.geo.box, 0xb8b1a0, -0.95, 2.12, i * 1.6 + 0.8, 1.22, 0.42, 0.02); }
  const bulbs = stringLights(cabin, [[-0.36, 1.9, -6], [-0.36, 1.9, -2], [-0.36, 1.9, 2], [-0.36, 1.9, 6]], 14, 0.06, ["#ff8a1f", "#ffd23f", "#c2304a", "#9bdc3a"]);
  const lg = grp(cabin, -0.37, 1.8, 0);
  for (let i = 0; i < 30; i++) { const l = add(lg, K.geo.plane, new T.MeshLambertMaterial({ map: K.maps.leaf, alphaTest: 0.5, side: T.DoubleSide, color: LEAF_COLS[i % 6] }), 0, Math.sin(i * 0.8) * 0.04, -4 + i * 0.27, 0.14, 0.14, 1); l.rotation.y = Math.PI / 2; l.rotation.x = i * 0.7; }
  // FASTEN SEATBELT panel
  const sbc = mkCanvas(256, 64), sbg = sbc.getContext("2d");
  function paintBelt(on) { sbg.fillStyle = "#1b1b22"; sbg.fillRect(0, 0, 256, 64); sbg.font = bold(26); sbg.textAlign = "center"; sbg.textBaseline = "middle"; sbg.fillStyle = on ? "#ff5a3a" : "#5a5650"; sbg.fillText("FASTEN SEATBELT", 128, 33); }
  paintBelt(false); const sbt = K.tex(sbc);
  const sb = add(cabin, K.geo.plane, new T.MeshBasicMaterial({ map: sbt }), -0.66, 1.88, -0.7, 0.5, 0.125, 1); sb.rotation.x = -0.9;
  // seats: row 34 (A empty with a pillow, B the hero, C the seatmate) and the rows behind, across the aisle too
  const headM = new T.MeshLambertMaterial({ map: K.tex(signCanvas(K.script, 256, 160, "#fff1d6", "#fff1d6", [], { logo: true })) });
  function seat(parent, x, z) {
    const s = grp(parent, x, 0, z);
    add(s, roundBox(0.5, 0.16, 0.5, 0.06), seatM, 0, 0.44, 0);
    const back = grp(s, 0, 0.5, 0.24); back.rotation.x = 0.12;
    add(back, roundBox(0.5, 0.78, 0.14, 0.06), seatM, 0, 0.36, 0);
    add(back, roundBox(0.42, 0.22, 0.02, 0.02), headM, 0, 0.6, -0.075);
    add(s, K.geo.box, armM, 0.27, 0.62, 0.02, 0.05, 0.05, 0.46);
    add(s, K.geo.box, 0x3a3e4a, 0, 0.18, 0, 0.42, 0.36, 0.06);
    return s;
  }
  const rowZ = 0;
  const sA = seat(cabin, -1.05, rowZ), sB = seat(cabin, -0.5, rowZ), sC = seat(cabin, 0.05, rowZ);
  add(sA, roundBox(0.3, 0.12, 0.22, 0.05), 0xfff1d6, 0.02, 0.62, 0.05);
  for (let r = 1; r < 6; r++) { seat(cabin, -1.05, rowZ + r * 0.9); seat(cabin, -0.5, rowZ + r * 0.9); seat(cabin, 0.05, rowZ + r * 0.9); seat(cabin, 1.25, rowZ + (r - 1) * 0.9); seat(cabin, 1.8, rowZ + (r - 1) * 0.9); }
  const rowSign = add(cabin, K.geo.plane, new T.MeshBasicMaterial({ map: K.tex(signCanvas(K.script, 256, 96, "#1d2b53", "#ffd23f", [["ROW 34", "#fff1d6", 48]])) }), -0.38, 1.84, 0.3, 0.32, 0.12, 1);
  rowSign.rotation.y = Math.PI / 2;
  // the seatmate: a cheerful stranger in a red earflap hat and a loud souvenir sweater
  const mate = makePerson({ skin: 0xe8b88a, shirtMap: K.maps.sweater, trim: 0x1f5a3a, pants: 0x6b5a48, shoe: 0x5a3a22, sole: 0x3a2616, hair: 0x9a8a7a, hairStyle: "bald",
    hat: "earflap", mustache: true, belly: 1, chest: 0.6, sleeves: "long", glasses: "round", brow: 0x8a7a6a, scale: 1.02 });
  mate.root.rotation.y = Math.PI; mate.root.position.set(0.05, 0.08, rowZ + 0.03);
  cabin.add(mate.root);
  const phone = grp(null, 0, 0, 0);
  add(phone, roundBox(0.085, 0.16, 0.012, 0.012), 0x1b1b22, 0, 0, 0);
  add(phone, K.geo.plane, new T.MeshBasicMaterial({ map: K.tex(phoneCanvas()) }), 0, 0, 0.007, 0.072, 0.14, 1);
  mate.ra.hand.add(phone); phone.position.set(0, -0.08, 0.04); phone.rotation.set(0, Math.PI / 2, 0);
  // the hero's three pie boxes on his lap
  const lap = grp(cabin, 0, 0, 0);
  for (let i = 0; i < 3; i++) pieBox(lap, 0, i * 0.135, 0, (i - 1) * 0.06);
  const leaves = null;
  let beltOn = false;
  return { scene: scene, cam: cam, mate: mate, sync: function (state, dt, t) {
    const live = S.phase === "sky", pt = live ? S.pt : 0;
    view.offset.x = (t * 0.03) % 1;
    const turb = live && pt > 15 ? Math.sin(t * 23) * 0.006 + Math.sin(t * 37) * 0.004 : 0;
    cabin.rotation.z = turb; cabin.position.y = turb * 2;
    const on = live && pt > 15 && Math.sin(t * 8) > 0;
    if (on !== beltOn) { beltOn = on; paintBelt(on); sbt.needsUpdate = true; }
    twinkle(bulbs, t);
    // the hero, nodding along
    const P = K.hero;
    place(P.root, cabin, -0.5, 0.08, rowZ + 0.03, Math.PI);
    const nod = V.nodT < 0.35 ? Math.sin(V.nodT / 0.35 * Math.PI) : 0;
    V.nodT += dt;
    const sad = S.verdict && S.verdict.v === "MISS" && S.verdict.t < 0.6 && live;
    posePerson(P, "sit", dt, t, { nx: 0.05 + nod * 0.4, ny: 0.35, lsx: -0.25, rsx: -0.25, lex: -0.9, rex: -0.9, lsz: 0.0, rsz: 0.0, smile: sad ? -0.6 : nod * 0.4, brow: sad ? -0.4 : 0.2, frown: sad ? 0.6 : 0 }, 0.5);
    lap.position.set(-0.5, 0.75, rowZ - 0.25); lap.rotation.y = 0.04;
    // the seatmate: talking with his hands, then the photo phone
    V.talk = Math.max(0, V.talk - dt);
    const talking = live && (V.talk > 0 || S.bubbles.length > 0);
    const slide = live && pt > 30;
    const jaw = talking ? (Math.sin(t * 17) * 0.5 + 0.5) * 0.7 : 0.05;
    if (slide) posePerson(mate, "phone", dt, t, { jaw: jaw, ny: -0.55, rsx: Math.sin(t * 2) * 0.05 }, 0.6);
    else posePerson(mate, "talk", dt, t, { jaw: jaw, ny: -0.6 + Math.sin(t * 0.9) * 0.15, rsx: Math.sin(t * 4.3) * 0.25, rsz: Math.sin(t * 3.1) * 0.15, rex: Math.sin(t * 5) * 0.2 }, 0.8);
    phone.visible = slide;
    // camera: from the aisle a row ahead, looking back at the two of them
    const sh = V.camShake > 0 ? (vrand() - 0.5) * V.camShake : 0;
    cam.position.set(0.5 + sh, 1.3 + turb * 3, rowZ - 2.75); cam.lookAt(-0.28, 0.98 + turb * 2, rowZ + 0.2);
  } };
}

/* ---------------- RAILS: Standing Room Only ---------------- */
function buildRails() {
  const T = THREE, scene = new T.Scene(), cam = new T.PerspectiveCamera(56, W / H, 0.05, 200);
  scene.background = new T.Color(0x3d3a34);
  lights(scene, 0xfff0d8, 0x4a443a, 1.55, 0xffe6c0, 1.2, 3, 6, 4);
  const coach = grp(scene, 0, 0, 0);
  const wallM = new T.MeshLambertMaterial({ color: 0x8a7a5a }), trimM = new T.MeshLambertMaterial({ color: 0x5a4a34 });
  const floorM = new T.MeshLambertMaterial({ map: K.tex(woodCanvas("#6a5236", "#3a2616", 61), true) }); floorM.map.repeat.set(2, 10);
  add(coach, K.geo.ground, floorM, 0, 0, -6, 3.0, 1, 24);
  add(coach, K.geo.box, 0xe8dcc0, 0, 2.95, -6, 3.0, 0.08, 24);
  // walls: a dado, a long window band with the country going by, a luggage rack
  const land = K.tex(landCanvas(), true), landM = new T.MeshBasicMaterial({ map: land });
  [-1, 1].forEach(function (s) {
    add(coach, K.geo.box, wallM, s * 1.5, 0.55, -6, 0.08, 1.1, 24);
    add(coach, K.geo.box, wallM, s * 1.5, 2.55, -6, 0.08, 0.8, 24);
    const win = add(coach, K.geo.plane, landM, s * 1.53, 1.55, -6, 24, 1.2, 1); win.rotation.y = -s * Math.PI / 2;
    for (let i = 0; i < 9; i++) add(coach, K.geo.box, trimM, s * 1.48, 1.55, 4 - i * 2.6, 0.08, 1.2, 0.14);
    add(coach, K.geo.box, trimM, s * 1.47, 0.98, -6, 0.1, 0.06, 24); add(coach, K.geo.box, trimM, s * 1.47, 2.14, -6, 0.1, 0.06, 24);
    add(coach, K.geo.box, 0xb8a888, s * 1.25, 2.4, -6, 0.5, 0.04, 24);
    for (let i = 0; i < 8; i++) add(coach, K.geo.box, 0x9a8a6a, s * 1.25, 2.47, 3 - i * 2.6, 0.5, 0.12, 0.03);
  });
  const bulbs = stringLights(coach, [[-1.0, 2.38, 4], [-1.0, 2.38, -4], [-1.0, 2.38, -14]], 18, 0.08, ["#ff8a1f", "#ffd23f", "#c2304a", "#9bdc3a"]);
  const bulbs2 = stringLights(coach, [[1.0, 2.38, 4], [1.0, 2.38, -4], [1.0, 2.38, -14]], 18, 0.08, ["#ffd23f", "#c2304a", "#9bdc3a", "#ff8a1f"]);
  // the end wall: a door, the LED board above it, a poster
  add(coach, K.geo.box, 0x7a6a4a, 0, 1.45, -16, 3.0, 2.9, 0.1);
  add(coach, roundBox(0.9, 2.0, 0.08, 0.04), 0x4a3a2a, 0, 1.0, -15.92);
  add(coach, K.geo.box, 0x9fd4ff, 0, 1.45, -15.87, 0.5, 0.6, 0.02);
  ledMesh(coach, 2.3, 0.25, 0, 2.42, -15.85, 0);
  add(coach, K.geo.plane, new T.MeshBasicMaterial({ map: K.tex(signCanvas(K.script, 256, 320, "#c2304a", "#ffd23f", [["SEE THE", "#fff1d6", 30], ["FALL COLORS", "#ffd23f", 30]], { logo: true })) }), -1.0, 1.4, -15.88, 0.5, 0.62, 1);
  add(coach, K.geo.plane, new T.MeshBasicMaterial({ map: K.tex(signCanvas(K.script, 256, 160, "#1d2b53", "#fff1d6", [["COACH CAR 3", "#fff1d6", 34]])) }), 1.0, 1.65, -15.88, 0.46, 0.29, 1);
  // seats in pairs on both sides, facing forward, with passengers
  const seatM = new T.MeshLambertMaterial({ color: 0x7a2a2a }), seatTop = new T.MeshLambertMaterial({ color: 0x8a3a3a });
  function bench(x, z) {
    const b = grp(coach, x, 0, z);
    add(b, roundBox(0.95, 0.16, 0.5, 0.06), seatM, 0, 0.45, 0);
    const bk = add(b, roundBox(0.95, 0.85, 0.14, 0.07), seatM, 0, 0.88, 0.26); bk.rotation.x = 0.1;
    add(b, roundBox(0.95, 0.12, 0.18, 0.06), seatTop, 0, 1.3, 0.3);
    add(b, K.geo.box, 0x2a2420, 0, 0.18, 0, 0.8, 0.36, 0.1);
    return b;
  }
  for (let i = 0; i < 9; i++) { bench(-0.95, 2.6 - i * 1.6); bench(0.95, 2.6 - i * 1.6); }
  const people = [];
  const P1 = makePerson({ skin: 0x9a6a44, shirt: 0x2e6b8a, pants: 0x3a3a44, shoe: 0x1b1b22, hair: 0x1b1410, hairStyle: "short", sleeves: "long", beard: true, trim: 0x1d4a60 });
  const P2 = makePerson({ skin: 0xf1c7a0, shirt: 0xd8b23a, pants: 0x4a3a5a, shoe: 0x6a3a2a, hair: 0xc8c2b8, hairStyle: "bun", sleeves: "long", glasses: "round", skirt: 0x5a4a6a, trim: 0xb8922a });
  const P3 = makePerson({ skin: 0xd9a273, shirtMap: K.tex(plaidCanvas("#2f6b3a", "#1d2b53", "#c2304a"), true), pants: 0x3b5a96, shoe: 0x8a5a2b, hair: 0x2a1a10, hairStyle: "short", sleeves: "long", trim: 0x1d2b53 });
  [[P1, -0.72, -1.6, "read"], [P2, 0.7, -0.0, "sleep"], [P3, 1.18, -3.2, "sit"]].forEach(function (q) { q[0].root.position.set(q[1], 0.06, q[2] + 0.03); q[0].root.rotation.y = Math.PI; coach.add(q[0].root); people.push(q); });
  const paper = add(P1.root, K.geo.plane, new T.MeshLambertMaterial({ map: K.tex(signCanvas(K.script, 256, 192, "#f4efe2", "#cfc6b0", [["HARVEST FAIR", "#3a2616", 30], ["THIS WEEKEND", "#c2304a", 26]])), side: T.DoubleSide }), 0, 1.15, 0.42, 0.5, 0.38, 1);
  paper.rotation.x = -0.2;
  // the tower: the hero holds it overhead. Station boxes (gifts) go on the bottom, pie boxes on top.
  const pivot = grp(scene, 0, 0, 0.0);
  const tower = grp(pivot, 0, 0, 0);
  const slots = [];
  for (let i = 0; i < 5; i++) { const m = new T.Mesh(K.geo.pieBox, K.mats.pieBox); tower.add(m); slots.push(m); }
  const falling = [];
  for (let i = 0; i < 3; i++) { const m = new T.Mesh(K.geo.pieBox, K.mats.pieBox); m.visible = false; scene.add(m); falling.push(m); }
  return { scene: scene, cam: cam, sync: function (state, dt, t) {
    const live = S.phase === "rails", th = live ? S.th : 0, sway = live ? (S.sway || 0) : Math.sin(t * 1.3) * 0.3;
    land.offset.x = (land.offset.x + dt * (live ? 0.06 : 0.03)) % 1;
    coach.rotation.z = sway * 0.012; coach.position.x = sway * 0.02;
    twinkle(bulbs, t); twinkle(bulbs2, t + 0.4);
    people.forEach(function (q, i) { posePerson(q[0], q[3], dt, t + i, { nz: (q[3] === "sleep" ? 0.42 : 0) + sway * 0.05 }, 0.6); });
    // the hero leans with the tilt needle (hold leans right)
    const P = K.hero, lean = -th * 0.2;
    pivot.rotation.z = lean; pivot.position.x = sway * 0.02;
    place(P.root, pivot, 0, 0, 0, Math.PI);
    posePerson(P, "hold", dt, t, { sz: th * 0.12, hz: -th * 0.05, lsx: -th * 0.08, rsx: th * 0.08, ny: -th * 0.3, brow: S.redT > 0.15 ? 0.9 : 0.3, jaw: S.redT > 0.15 ? 0.6 : 0, frown: S.redT > 0.15 ? 0.3 : 0, smile: S.redT > 0.15 ? -0.4 : 0.2 }, 0.3);
    P.root.updateMatrixWorld(true);
    // the tower sits between the hands and leans further than the body
    const n = live || S.phase === "howto" || S.phase === "exit" ? S.pies + S.station : 3;
    const ha = new T.Vector3(), hb = new T.Vector3(); P.la.hand.getWorldPosition(ha); P.ra.hand.getWorldPosition(hb);
    ha.add(hb).multiplyScalar(0.5); pivot.worldToLocal(ha);
    tower.position.set(ha.x, ha.y - 0.02, ha.z); tower.rotation.z = -th * 0.16;
    for (let i = 0; i < 5; i++) {
      const m = slots[i]; m.visible = i < n;
      const wob = Sh.reduced ? 0 : Math.sin(t * 3 + i) * i * 0.004;
      m.position.set(wob + th * i * 0.03, 0.07 + i * 0.132, 0); m.rotation.set(0, (i % 2 ? 0.08 : -0.05), 0);
      m.material = i < S.station ? (i % 2 ? K.mats.giftB : K.mats.giftA) : (wear("gold") ? K.mats.pieBoxGold : K.mats.pieBox);
    }
    // a box going overboard
    for (let i = 0; i < falling.length; i++) falling[i].visible = false;
    for (let i = V.boxFall.length - 1; i >= 0; i--) {
      const f = V.boxFall[i]; f.t += dt;
      if (f.t > 1.4) { V.boxFall.splice(i, 1); continue; }
      const m = falling[i % falling.length]; m.visible = true; m.material = wear("gold") ? K.mats.pieBoxGold : K.mats.pieBox;
      const y0 = 2.13 + f.n * 0.132;
      m.position.set(f.dir * (0.3 + f.t * 1.4), Math.max(0.07, y0 + 1.5 * f.t - 5.5 * f.t * f.t), 0.1 + f.t * 0.3);
      m.rotation.set(f.t * 3, 0, -f.dir * f.t * 6);
    }
    // camera: behind the hero, a little low, so the whole tower and the car ahead are in the picture
    const sh = V.camShake > 0 ? (vrand() - 0.5) * V.camShake : 0;
    cam.position.set(0.3 + sh + sway * 0.01, 1.45, 3.7); cam.lookAt(0.05, 1.8, -3);
  } };
}

/* ---------------- MOTEL: one night at the motor inn ---------------- */
function buildMotel() {
  const T = THREE, scene = new T.Scene(), cam = new T.PerspectiveCamera(54, W / H, 0.1, 300);
  scene.background = new T.Color(0x0b0a1c);
  scene.add(new T.HemisphereLight(0x5a5aa0, 0x1a1420, 1.1));
  const moonL = new T.DirectionalLight(0xb8c4ff, 0.9); moonL.position.set(-6, 10, 4); scene.add(moonL);
  const warm = new T.PointLight(0xffc070, 6, 9, 1.6); warm.position.set(0.8, 2.6, -2.6); scene.add(warm);
  const pink = new T.PointLight(0xff3fa4, 5, 8, 1.8); pink.position.set(-2.4, 3.6, -1.5); scene.add(pink);
  skyDome(scene, "#05051a", "#1a1640", "#3a2a50", 120);
  const stars = new T.BufferGeometry(), sp = [], rnd = rng(71);
  for (let i = 0; i < 260; i++) { const a = rnd() * TAU, e = 0.15 + rnd() * 1.2, r = 100; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
  stars.setAttribute("position", new T.Float32BufferAttribute(sp, 3));
  scene.add(new T.Points(stars, new T.PointsMaterial({ color: 0xdfe4ff, size: 0.5, sizeAttenuation: true, fog: false })));
  add(scene, K.geo.sph, new T.MeshBasicMaterial({ color: 0xf4e7b8, fog: false }), 22, 30, -70, 4);
  glowSprite(scene, 22, 30, -69, 26, 0xf4e7b8, 0.5);
  // the lot and the grass
  add(scene, K.geo.ground, new T.MeshLambertMaterial({ map: K.tex(grassCanvas("#2a3a24", true), true) }), 0, -0.01, 0, 80, 1, 80).material.map.repeat.set(20, 20);
  const lotM = new T.MeshLambertMaterial({ map: K.tex(roadCanvas(), true) }); lotM.map.repeat.set(3, 3);
  add(scene, K.geo.ground, lotM, 0, 0, 0.5, 16, 1, 9);
  for (let i = 0; i < 6; i++) add(scene, K.geo.box, 0xeceae2, -6 + i * 2.6, 0.01, -1.6, 0.08, 0.01, 2);
  // the motel: a long low building, a walkway roof on posts, numbered doors, warm windows
  const bld = grp(scene, 0, 0, -5.2);
  add(bld, K.geo.box, new T.MeshLambertMaterial({ map: K.tex(brickCanvas("#8a5a3a"), true) }), 0, 1.5, 0, 18, 3, 3).material.map.repeat.set(9, 2);
  add(bld, K.geo.box, 0x3a2616, 0, 3.15, 0.5, 18.4, 0.3, 4.2);
  add(bld, K.geo.box, 0xff8a1f, 0, 3.0, 2.62, 18.4, 0.12, 0.04);
  add(bld, K.geo.box, 0x5a5e6c, 0, 0.08, 2.0, 18, 0.16, 1.2);
  for (let i = -4; i <= 4; i++) add(bld, K.geo.cyl, 0xd9d3c4, i * 2.1 + 1.05, 1.5, 2.5, 0.07, 3, 0.07);
  const dcols = ["#2a6b8a", "#c2304a", "#2f6b3a", "#8a5a9a", "#d8b23a"];
  const winLit = new T.MeshBasicMaterial({ color: 0xffd27a }), winDim = new T.MeshBasicMaterial({ color: 0x3a3450 });
  for (let i = 0; i < 7; i++) {
    const x = -6.3 + i * 2.1;
    if (i !== 3) add(bld, K.geo.plane, new T.MeshLambertMaterial({ map: K.tex(doorCanvas(i < 3 ? 4 - i : i - 2 + 1, dcols[i % 5])) }), x - 0.35, 1.05, 1.52, 0.8, 2.0, 1);
    add(bld, K.geo.plane, i % 3 === 1 ? winDim : winLit, x + 0.55, 1.5, 1.52, 0.8, 0.7, 1);
    add(bld, K.geo.box, 0x2a1a10, x + 0.55, 1.5, 1.51, 0.9, 0.8, 0.02);
  }
  // room 1, door open: the bed folds down over the sink
  const room = grp(bld, -0.05 - 0.35, 0, 1.5);
  add(room, K.geo.box, new T.MeshBasicMaterial({ color: 0xf0dca0 }), 0, 1.05, -0.6, 0.8, 2.0, 0.02);
  add(room, K.geo.box, new T.MeshBasicMaterial({ color: 0xe8d0a0 }), 0, 0.02, -0.3, 0.8, 0.02, 0.6);
  add(room, K.geo.box, 0xeceae2, -0.15, 0.85, -0.5, 0.36, 0.08, 0.2); add(room, K.geo.box, 0x8e93a2, -0.15, 0.95, -0.56, 0.04, 0.12, 0.04);
  const bed = grp(room, 0.36, 0.55, -0.55);
  add(bed, K.geo.box, new T.MeshLambertMaterial({ map: K.maps.plaid }), -0.35, 0, 0, 0.7, 0.12, 0.36);
  add(bed, K.geo.box, 0xfff1d6, -0.62, 0.08, 0, 0.14, 0.06, 0.3);
  const openDoor = grp(room, -0.4, 0, 0); openDoor.rotation.y = -1.9;
  add(openDoor, K.geo.plane, new T.MeshLambertMaterial({ map: K.tex(doorCanvas(1, "#c2304a")), side: T.DoubleSide }), 0.4, 1.05, 0, 0.8, 2.0, 1);
  glowSprite(bld, -0.4, 1.2, 2.0, 2.2, 0xffd27a, 0.45);
  const bulbs = stringLights(bld, [[-9, 2.92, 2.66], [-4.5, 2.92, 2.66], [0, 2.92, 2.66], [4.5, 2.92, 2.66], [9, 2.92, 2.66]], 10, 0.18, ["#ff8a1f", "#ffd23f", "#c2304a", "#9bdc3a", "#3ff0ff"]);
  // the sign: neon VACANCY with a dead letter, the LED board beneath
  const sign = grp(scene, -1.7, 0, -3.4);
  add(sign, K.geo.cyl, 0x3a3e4a, 0, 2.2, 0, 0.1, 4.4, 0.1);
  add(sign, K.geo.box, 0x14101e, 0, 4.4, 0, 2.3, 1.15, 0.2);
  const neonA = K.tex(neonCanvas(false)), neonB = K.tex(neonCanvas(true));
  const neon = add(sign, K.geo.plane, new T.MeshBasicMaterial({ map: neonB }), 0, 4.4, 0.105, 2.2, 1.08, 1);
  glowSprite(sign, 0, 4.4, 0.3, 4, 0xff3fa4, 0.35);
  ledMesh(sign, 2.0, 0.22, 0, 3.55, 0.06, 0);
  add(sign, K.geo.plane, new T.MeshBasicMaterial({ map: K.tex(signCanvas(K.script, 512, 160, "#1d2b53", "#ffd23f", [["COLOR TV. ICE.", "#fff1d6", 46]])) }), 0, 3.12, 0.06, 1.6, 0.5, 1);
  // a billboard in the field
  const bb = grp(scene, 6, 0, -14);
  add(bb, K.geo.box, 0x3a2616, -2, 2, 0, 0.2, 4, 0.2); add(bb, K.geo.box, 0x3a2616, 2, 2, 0, 0.2, 4, 0.2);
  add(bb, K.geo.plane, new T.MeshLambertMaterial({ map: K.tex(signCanvas(K.script, 512, 256, "#fff1d6", "#c2304a", [["FREE ARCADE GAMES", "#1d2b53", 40]], { logo: true })), emissive: 0x332a20 }), 0, 4.6, 0.12, 6, 3, 1);
  // trees, silhouettes against the sky
  const tr = rng(77);
  for (let i = 0; i < 14; i++) tree(scene, -14 + i * 2.2 + tr() * 1.4, -11 - tr() * 6, 1.1 + tr() * 0.6, ["#5a2a2a", "#6a3a1a", "#4a3a1a"][i % 3], tr);
  // the ice machine, rattling
  const ice = grp(scene, 1.75, 0, -2.6);
  const iceBody = grp(ice, 0, 0, 0);
  add(iceBody, roundBox(0.95, 1.55, 0.75, 0.06), new T.MeshPhongMaterial({ color: 0xb9c6d0, shininess: 60 }), 0, 0.78, 0);
  add(iceBody, K.geo.plane, new T.MeshBasicMaterial({ map: K.tex(signCanvas(K.script, 256, 128, "#2a3f7a", "#eceae2", [["ICE", "#eceae2", 70]])) }), 0, 1.25, 0.38, 0.72, 0.36, 1);
  add(iceBody, roundBox(0.6, 0.42, 0.04, 0.03), 0x8e9ba6, 0, 0.55, 0.38);
  add(iceBody, K.geo.box, 0x5a6670, 0, 0.62, 0.4, 0.4, 0.05, 0.03);
  const iceLamp = add(iceBody, K.geo.sph, new T.MeshBasicMaterial({ color: 0x9bff3f }), 0.36, 1.48, 0.38, 0.03);
  const P0 = K.hero;
  const clerk = makePerson({ skin: 0xc98a5a, shirt: 0xb8862a, trim: 0x8a6420, pants: 0x4a4a52, shoe: 0x2a1a10, sole: 0x1b1410, hair: 0x9a9a9a, hairStyle: "bald",
    sleeves: "long", collar: "shirt", glasses: "round", mustache: true, belly: 0.5, brow: 0x8a8a8a });
  clerk.root.position.set(-1.55, 0.16, -3.2); scene.add(clerk.root);
  const fob = grp(clerk.la.hand, 0, -0.1, 0.02); add(fob, K.geo.box, 0xc2304a, 0, -0.05, 0, 0.04, 0.09, 0.012); add(fob, K.geo.ring, 0xd8c27a, 0, 0.01, 0, 0.02, 0.02, 0.02);
  const leaves = leafFall(scene, 50, [-5, 5], [0.1, 4.5], [-4, 2], 0.14);
  return { scene: scene, cam: cam, sync: function (state, dt, t) {
    const live = S.phase === "motel", pt = live ? S.pt : 9;
    neon.material.map = (Math.floor(t * 3) % 7 === 0) ? neonA : neonB;
    twinkle(bulbs, t);
    leaves.tick(dt, t, 0.3);
    // the bed folds down over the sink during the first second
    const fold = live ? clamp((pt - 1.0) / 1.0, 0, 1) : 1;
    bed.rotation.z = -Math.PI / 2 * (1 - fold);
    const rattle = S.quiet || !live ? 0 : Math.sin(t * 60) * 0.02;
    iceBody.position.x = rattle; iceBody.rotation.z = rattle * 0.5;
    iceLamp.material.color.set(S.quiet ? 0x9bff3f : (Math.sin(t * 12) > 0 ? 0xff4b3e : 0x5a1a1a));
    // the hero squares up to the machine and kicks on every tap
    place(P0.root, scene, 0.55, 0, -2.25, Math.PI / 2 - 0.25);
    V.kickT += dt;
    const k = V.kickT < 0.4 ? Math.sin(Math.min(1, V.kickT / 0.4) * Math.PI) : 0;
    const base = mixPose(POSES.stand, POSES.kick, k, {});
    if (S.quiet && live) addPose(base, { smile: 1, brow: 0.6, lsx: -0.4, lsz: 0.4, lex: -1.6 });
    else addPose(base, { brow: -0.2, frown: 0.3, smile: 0.0 });
    lifePose(base, P0, t, 0.6);
    applyPose(P0, base, dt);
    posePerson(clerk, "wave", dt, t, { rsz: Math.sin(t * 6) * 0.35, rex: Math.sin(t * 6 + 1) * 0.2, ny: 0.35, lsx: -0.6, lex: -1.1, lsz: -0.1 }, 0.6);
    clerk.root.rotation.y = 0.35;
    // the car, parked
    place(K.car, scene, -3.2, 0, -1.6, 0.75);
    carParts(0); heroUnflap();
    const sh = V.camShake > 0 ? (vrand() - 0.5) * V.camShake : 0;
    cam.position.set(0.35 + sh, 1.95, 5.6); cam.lookAt(-0.05, 2.1, -3.2);
  } };
}

/* ---------------- ROAD: The Last Car on the Lot ----------------
   The 2D road maps onto the ground: x = (lane px - 180) * 0.06 m, z = (y px - CAR_Y) * 0.1 m. */
const RX = 0.06, RZ = 0.1;
function buildRoad() {
  const T = THREE, scene = new T.Scene(), cam = new T.PerspectiveCamera(58, W / H, 0.1, 400);
  const dayBg = new T.Color(0xf2b06a), snowBg = new T.Color(0x232a40), bg = new T.Color();
  scene.background = bg;
  scene.fog = new T.Fog(0xf2b06a, 40, 110);
  const hemi = new T.HemisphereLight(0xfff0d8, 0x6a5030, 1.6); scene.add(hemi);
  const sun = new T.DirectionalLight(0xffe0b0, 2.0); sun.position.set(-8, 12, 6); scene.add(sun);
  const sky = skyDome(scene, "#5a86c6", "#f2b06a", "#ffd9a0", 150);
  // the road and the shoulders, scrolled
  const road = K.tex(roadCanvas(), true); road.repeat.set(1, 18);
  const roadM = new T.MeshLambertMaterial({ map: road });
  add(scene, K.geo.ground, roadM, 0, 0.01, -60, 11.4, 1, 180);
  const grass = K.tex(grassCanvas("#7a8a3a", true), true); grass.repeat.set(12, 36);
  add(scene, K.geo.ground, new T.MeshLambertMaterial({ map: grass }), 0, 0, -60, 60, 1, 180);
  [-1, 1].forEach(function (s) { add(scene, K.geo.box, 0x9a9a8a, s * 6.0, 0.25, -60, 0.08, 0.06, 180); });
  // scenery that rolls by: trees, fence posts, hay bales, billboards, a mileage sign
  const props = [], rnd = rng(91), cols = ["#c2304a", "#e0662a", "#e0a13a", "#d8b23a", "#a33a2a", "#b8742a"];
  for (let i = 0; i < 34; i++) { const s = i % 2 ? 1 : -1; props.push({ o: tree(scene, s * (8 + rnd() * 9), -i * 4.2, 1 + rnd() * 0.5, cols[i % cols.length], rnd), span: 142 }); }
  for (let i = 0; i < 24; i++) { const s = i % 2 ? 1 : -1, g = grp(scene, s * 6.6, 0, -i * 6); add(g, K.geo.box, 0x6a4a2a, 0, 0.5, 0, 0.12, 1.0, 0.12); add(g, K.geo.box, 0x8a6a4a, 0, 0.75, 3, 0.06, 0.1, 6); props.push({ o: g, span: 144 }); }
  for (let i = 0; i < 5; i++) { const g = grp(scene, (i % 2 ? 1 : -1) * (11 + i), 0, -i * 28 - 10); add(g, new T.CylinderGeometry(0.8, 0.8, 1.3, 16).rotateZ(Math.PI / 2), 0xd8b23a, 0, 0.8, 0); add(g, K.geo.sph, 0xff8a1f, 1.2, 0.35, 0.6, 0.35, 0.3, 0.35); add(g, K.geo.sph, 0xff8a1f, -0.9, 0.3, 0.9, 0.3, 0.26, 0.3); props.push({ o: g, span: 140 }); }
  const bbM = new T.MeshLambertMaterial({ map: K.tex(signCanvas(K.script, 512, 256, "#fff1d6", "#c2304a", [["HAPPY THANKSGIVING", "#c2304a", 38]], { logo: true })) });
  const bbM2 = new T.MeshLambertMaterial({ map: K.tex(signCanvas(K.script, 512, 256, "#1d2b53", "#ffd23f", [["IS IT ON THE SHELF?", "#ffd23f", 38]], { logo: true })) });
  [[10, -40, bbM], [-10.5, -110, bbM2]].forEach(function (b) {
    const g = grp(scene, b[0], 0, b[1]); g.rotation.y = -Math.sign(b[0]) * 0.35;
    add(g, K.geo.box, 0x3a2616, -2, 2.4, 0, 0.25, 4.8, 0.25); add(g, K.geo.box, 0x3a2616, 2, 2.4, 0, 0.25, 4.8, 0.25);
    add(g, K.geo.box, 0x2a2a2a, 0, 5.4, -0.08, 6.4, 3.3, 0.12); add(g, K.geo.plane, b[2], 0, 5.4, 0.0, 6, 3, 1);
    props.push({ o: g, span: 140 });
  });
  const milesC = mkCanvas(256, 160), milesT = K.tex(milesC);
  function paintMiles(n) { const g = milesC.getContext("2d"); rrectPath(g, 4, 4, 248, 152, 14); g.fillStyle = "#2f6b3a"; g.fill(); g.lineWidth = 6; g.strokeStyle = "#fff"; g.stroke(); g.fillStyle = "#fff"; g.font = bold(46); g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("HOME", 128, 56); g.fillText(n + " MI", 128, 112); milesT.needsUpdate = true; }
  paintMiles(100);
  const ms = grp(scene, 7, 0, -70); add(ms, K.geo.box, 0x8e93a2, 0, 1.5, 0, 0.12, 3, 0.12); add(ms, K.geo.plane, new T.MeshBasicMaterial({ map: milesT }), 0, 3.3, 0.07, 1.8, 1.12, 1);
  props.push({ o: ms, span: 140, miles: true });
  // obstacle pools: cones, potholes, leaf piles, mattresses, the runaway parade turkey, coffee, pie stands
  const pools = {}, used = new Map();
  const coneM = new T.MeshLambertMaterial({ color: 0xff7a1a }), whiteM = new T.MeshLambertMaterial({ color: 0xffffff });
  function make(kind) {
    const g = new T.Group();
    if (kind === "cone") { add(g, new T.ConeGeometry(0.28, 0.72, 16), coneM, 0, 0.42, 0); add(g, new T.CylinderGeometry(0.17, 0.2, 0.1, 16), whiteM, 0, 0.45, 0); add(g, K.geo.box, 0x1b1b22, 0, 0.03, 0, 0.62, 0.06, 0.62); }
    else if (kind === "hole") { add(g, new T.CircleGeometry(0.85, 20).rotateX(-Math.PI / 2), 0x0c0d10, 0, 0.03, 0, 1, 1, 0.75); add(g, new T.TorusGeometry(0.85, 0.07, 6, 20).rotateX(Math.PI / 2), 0x55585f, 0, 0.03, 0, 1, 1, 0.75); for (let i = 0; i < 5; i++) add(g, K.geo.box, 0x4a4d55, Math.cos(i * 1.3) * 1.0, 0.04, Math.sin(i * 1.3) * 0.75, 0.15, 0.06, 0.12); }
    else if (kind === "leaves") { for (let i = 0; i < 14; i++) add(g, K.geo.sph, new T.MeshLambertMaterial({ color: LEAF_COLS[i % 6] }), Math.cos(i * 2.1) * 0.55, 0.12 + (i % 3) * 0.08, Math.sin(i * 1.7) * 0.45, 0.35, 0.18, 0.32); }
    else if (kind === "mattress") { const m = add(g, roundBox(1.25, 0.28, 1.9, 0.1), 0xeceae2, 0, 0.2, 0); m.rotation.y = 0.3; for (let i = 0; i < 6; i++) add(m, K.geo.sph, 0xa8b8c8, -0.35 + (i % 3) * 0.35, 0.15, -0.5 + Math.floor(i / 3), 0.05, 0.02, 0.05); add(m, new T.TorusGeometry(0.95, 0.03, 4, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4), 0x7f9fb0, 0, 0.0, 0, 0.66, 1, 1); }
    else if (kind === "turkey") {
      const b = grp(g, 0, 1.6, 0); g.userData.bob = b;
      const fc = [0xc2304a, 0xff8a1f, 0xffd23f, 0x8a5a2b, 0xff8a1f, 0xc2304a, 0xffd23f];
      for (let i = 0; i < 7; i++) { const f = add(b, K.geo.sph, fc[i], (i - 3) * 0.34, 0.4 + (3 - Math.abs(i - 3)) * 0.14, 0.35, 0.25, 0.85, 0.1); f.rotation.z = -(i - 3) * 0.3; }
      add(b, K.geo.sph, new T.MeshPhongMaterial({ color: 0x8a5a2b, shininess: 70 }), 0, 0, 0, 0.85, 0.8, 0.8);
      add(b, K.geo.sph, new T.MeshPhongMaterial({ color: 0xa0703a, shininess: 70 }), 0, 0.75, -0.55, 0.38);
      add(b, K.geo.cone, 0xffd23f, 0, 0.72, -0.95, 0.09, 0.22, 0.09).rotation.x = -Math.PI / 2;
      add(b, K.geo.sph, 0xc2304a, 0.0, 0.55, -0.88, 0.07, 0.16, 0.07);
      [-1, 1].forEach(function (s) { add(b, K.geo.sph, 0xffffff, s * 0.14, 0.88, -0.86, 0.08); add(b, K.geo.sph, 0x1b1b22, s * 0.14, 0.88, -0.93, 0.04); add(b, K.geo.sph, new T.MeshPhongMaterial({ color: 0x8a5a2b, shininess: 70 }), s * 0.75, 0.05, -0.1, 0.18, 0.45, 0.3); });
      [-1, 1].forEach(function (s) { add(b, K.geo.cyl, 0xffd23f, s * 0.3, -0.85, 0, 0.06, 0.5, 0.06); });
      const rope = add(g, K.geo.cyl, 0xeceae2, 0, 0.5, 0, 0.015, 1.0, 0.015); rope.rotation.x = 0.3;
    }
    else if (kind === "coffee") {
      const b = grp(g, 0, 0.9, 0); g.userData.bob = b;
      add(b, new T.CylinderGeometry(0.2, 0.15, 0.48, 16), 0xfff1d6, 0, 0, 0);
      add(b, new T.CylinderGeometry(0.19, 0.17, 0.16, 16), 0xc2304a, 0, -0.02, 0);
      add(b, new T.CylinderGeometry(0.22, 0.21, 0.07, 16), 0x6a4a2a, 0, 0.26, 0);
      glowSprite(b, 0, 0, 0, 1.4, 0xffc070, 0.6);
    }
    else if (kind === "pie") {
      const wood = 0x8a5a2b;
      add(g, roundBox(1.5, 0.9, 0.7, 0.04), wood, 0, 0.45, 0);
      [-0.7, 0.7].forEach(function (x) { add(g, K.geo.box, wood, x, 1.25, 0.3, 0.07, 1.6, 0.07); });
      for (let i = 0; i < 6; i++) add(g, K.geo.box, i % 2 ? 0xfff1d6 : 0xc2304a, -0.625 + i * 0.25, 2.05, 0.1, 0.25, 0.06, 1.0).rotation.x = -0.25;
      pie(g, -0.35, 0.92, 0, 0.2); pie(g, 0.35, 0.92, 0, 0.2);
      add(g, K.geo.plane, new T.MeshBasicMaterial({ map: K.tex(signCanvas(K.script, 256, 96, "#fff1d6", "#c2304a", [["PIES", "#c2304a", 64]])) }), 0, 0.55, 0.36, 0.9, 0.34, 1);
      glowSprite(g, 0, 1.0, 0.4, 3.2, 0xffd23f, 0.5);
    }
    scene.add(g); return g;
  }
  function getMesh(kind) { const p = pools[kind] = pools[kind] || []; for (let i = 0; i < p.length; i++) if (!p[i].userData.busy) { p[i].userData.busy = true; p[i].visible = true; return p[i]; } const m = make(kind); m.userData.busy = true; p.push(m); return m; }
  // snow and the headlights for the last stretch
  const snowG = new T.BufferGeometry(), sv = [], srnd = rng(5);
  for (let i = 0; i < 500; i++) sv.push((srnd() - 0.5) * 30, srnd() * 14, -srnd() * 40 + 8);
  snowG.setAttribute("position", new T.Float32BufferAttribute(sv, 3));
  const snow = new T.Points(snowG, new T.PointsMaterial({ color: 0xffffff, map: K.maps.glow, size: 0.22, transparent: true, opacity: 0.95, depthWrite: false }));
  snow.visible = false; scene.add(snow);
  const head = new T.SpotLight(0xfff2d0, 0, 45, 0.5, 0.6, 1.2); scene.add(head); scene.add(head.target);
  const dash = new T.PointLight(0xffd8a0, 0, 4, 1.5); scene.add(dash);
  const carShadow = add(scene, K.geo.ground, K.mats.shadow, 0, 0.03, 0, 2.6, 1, 4.6);
  const flyers = [];
  let dist = 0, lastMiles = -1;
  return { scene: scene, cam: cam, sync: function (state, dt, t, title) {
    const live = S.phase === "road", pt = live ? S.pt : (S.phase === "exit" ? CONFIG.road.dur : 0);
    const v = live ? speed(pt) * RZ : 22;
    const move = state === "paused" ? 0 : v * dt;
    dist += move;
    road.offset.y = (road.offset.y + move / 10) % 1;
    grass.offset.y = (grass.offset.y + move / 5) % 1;
    for (let i = 0; i < props.length; i++) { const p = props[i]; p.o.position.z += move; if (p.o.position.z > 14) { p.o.position.z -= p.span; if (p.miles) { const n = Math.max(1, Math.round(100 * (1 - pt / CONFIG.road.dur))); if (n !== lastMiles) { lastMiles = n; paintMiles(n); } } } }
    // light: golden afternoon, then snow and the dark closing in
    const snowK = live ? clamp((pt - CONFIG.road.snowAt) / 2, 0, 1) : 0;
    bg.copy(dayBg).lerp(snowBg, snowK);
    scene.fog.color.copy(bg); scene.fog.near = 40 - 32 * snowK; scene.fog.far = 110 - 78 * snowK;
    hemi.intensity = 1.6 - 0.85 * snowK; sun.intensity = 2.0 * (1 - snowK) + 0.25 * snowK; hemi.color.setRGB(1, 0.94 - 0.1 * snowK, 0.85 + 0.15 * snowK);
    sky.visible = snowK < 0.99; sky.material.opacity = 1;
    snow.visible = snowK > 0;
    if (snow.visible) {
      const pa = snowG.attributes.position;
      for (let i = 0; i < pa.count; i++) { let y = pa.getY(i) - dt * (2.4 + (i % 5) * 0.4), z = pa.getZ(i) + move * 0.6; if (y < 0) y += 14; if (z > 8) z -= 40; pa.setY(i, y); pa.setZ(i, z); pa.setX(i, pa.getX(i) + Math.sin(t + i) * dt * 0.6); }
      pa.needsUpdate = true;
    }
    // the car: S.cx is the rules' own lane position
    const cx = live ? (S.cx - 180) * RX : (S.phase === "exit" ? (S.cx - 180) * RX : 0);
    V.hop = Math.max(0, V.hop - dt * 4);
    place(K.car, scene, cx, 0, 0, 0);
    K.car.rotation.z = V.hopDir * V.hop * 0.08; K.car.rotation.y = -V.hopDir * V.hop * 0.12;
    if (live && S.inv > 0 && !Sh.reduced) K.car.visible = Math.sin(t * 40) > -0.4; else K.car.visible = true;
    K.car.position.y = live ? Math.abs(Math.sin(t * 11)) * 0.02 : 0;
    carParts(live || S.phase === "exit" || S.phase === "howto" ? S.lost : 0);
    spinWheels(dist);
    carShadow.position.x = cx;
    heroDrive(dt, t);
    if (K.hero.acc.tail && S.lost < 5 && live) { K.hero.acc.tail.rotation.x *= 0.3; K.hero.acc.tail2.rotation.x *= 0.3; }
    head.intensity = snowK * 60; dash.intensity = snowK * 5; dash.position.set(cx - 0.3, 1.6, -0.6); head.position.set(cx, 1.0, -1.7); head.target.position.set(cx, 0, -20);
    // obstacles from the rules' list
    for (const kind in pools) pools[kind].forEach(function (m) { m.userData.busy = false; });
    if (live) {
      for (let i = 0; i < S.obs.length; i++) { const m0 = used.get(S.obs[i]); if (m0) m0.userData.busy = true; }
      for (let i = 0; i < S.obs.length; i++) {
        const o = S.obs[i];
        let m = used.get(o);
        if (!m || m.userData.kind !== o.k) { m = getMesh(o.k); m.userData.kind = o.k; used.set(o, m); }
        m.userData.busy = true; m.visible = true;
        m.position.set((o.x - 180) * RX, 0, (o.y - CAR_Y) * RZ);
        m.rotation.y = o.k === "turkey" ? Math.sin(o.ph) * 0.3 + (o.vx > 0 ? -0.5 : 0.5) : o.k === "coffee" ? t * 2 : 0;
        if (m.userData.bob) m.userData.bob.position.y = (o.k === "turkey" ? 1.7 : 0.9) + Math.sin(t * 3 + o.x) * (o.k === "turkey" ? 0.25 : 0.1);
        if (o.done && OBS[o.k] && !OBS[o.k].good && Math.abs(o.y - CAR_Y) < 60) { m.rotation.z = Math.min(1.2, (m.rotation.z || 0) + dt * 6); m.position.y = Math.max(0, 0.6 - Math.abs(o.y - CAR_Y) * 0.01); }
        else m.rotation.z = 0;
      }
    }
    used.forEach(function (m, o) { if (!m.userData.busy || S.obs.indexOf(o) < 0) used.delete(o); });
    for (const kind in pools) pools[kind].forEach(function (m) { if (!m.userData.busy) m.visible = false; });
    // parts that just came off, tumbling away
    for (let i = V.fly.length - 1; i >= 0; i--) {
      const f = V.fly[i];
      if (!f.mesh) { const src = K.car.userData.parts[f.part]; f.mesh = src.clone(); f.mesh.visible = true; scene.add(f.mesh); f.mesh.position.set(cx, 0, 0); f.y = 0; }
      f.t += dt; f.vy -= 22 * dt;
      f.mesh.position.x += f.vx * dt; f.mesh.position.y = Math.max(-0.5, f.mesh.position.y + f.vy * dt); f.mesh.position.z += (f.vz + v) * dt;
      f.mesh.rotation.x += f.spin * dt; f.mesh.rotation.z += f.spin * 0.6 * dt;
      if (f.t > 1.6 || state === "title") { scene.remove(f.mesh); V.fly.splice(i, 1); }
    }
    // camera: behind and above, sliding a little with the car
    const sh = V.camShake > 0 ? (vrand() - 0.5) * V.camShake : 0;
    if (title) { const a = Math.sin(t * 0.25) * 0.7; cam.position.set(Math.sin(a) * 6.5, 2.2, Math.cos(a) * 6.5 - 0.5); cam.lookAt(0, 1.0, -0.4); }
    else { cam.position.set(cx * 0.45 + sh, 5.0, 7.4); cam.lookAt(cx * 0.45, 0.4, -14); }
  } };
}

/* ---------------- HOME: the driveway, the front door, the table ---------------- */
function buildHome() {
  const T = THREE, scene = new T.Scene(), cam = new T.PerspectiveCamera(52, W / H, 0.1, 300);
  const bgOn = new T.Color(0x2a2a5a), bgLate = new T.Color(0x0e0f24);
  scene.background = bgOn.clone();
  const hemi = new T.HemisphereLight(0xffc8a0, 0x302030, 1.2); scene.add(hemi);
  const sunL = new T.DirectionalLight(0xff9a60, 1.4); sunL.position.set(-10, 6, 8); scene.add(sunL);
  const skyOn = skyDome(scene, "#2a2a5a", "#c05a5a", "#ffb070", 140), skyLate = skyDome(scene, "#05051a", "#141434", "#2a2a4a", 139);
  add(scene, K.geo.ground, new T.MeshLambertMaterial({ map: K.tex(grassCanvas("#4a6a2a", true), true) }), 0, 0, 0, 80, 1, 80).material.map.repeat.set(16, 16);
  add(scene, K.geo.ground, 0x8e93a2, 0.2, 0.01, 2, 3.2, 1, 20);
  add(scene, K.geo.ground, 0x3a3d45, 0, 0.005, 12, 80, 1, 7);
  // the house: siding, a gabled roof, a porch, warm windows, a wreath on a red door
  const house = grp(scene, 0, 0, -8);
  add(house, K.geo.box, new T.MeshLambertMaterial({ map: K.tex(sidingCanvas("#c9b48a"), true) }), 0, 2.1, 0, 10, 4.2, 6).material.map.repeat.set(5, 3);
  const roofM = new T.MeshLambertMaterial({ color: 0x4a2a1c });
  [-1, 1].forEach(function (s) { const r = add(house, K.geo.box, roofM, s * 2.6, 5.3, 0, 5.9, 0.22, 6.8); r.rotation.z = s * -0.55; });
  const gable = new T.Shape([new T.Vector2(-5, 0), new T.Vector2(5, 0), new T.Vector2(0, 2.8)]);
  add(house, new T.ShapeGeometry(gable), new T.MeshLambertMaterial({ color: 0xb8a47a, side: T.DoubleSide }), 0, 4.2, 3.01);
  add(house, K.geo.box, 0x5a3a2a, 2.8, 5.6, -1, 0.6, 2, 0.6);
  add(house, K.geo.box, 0xd9d3c4, 0, 0.12, 3.6, 5, 0.24, 1.6);
  for (let i = 0; i < 3; i++) add(house, K.geo.box, 0xbfb8a8, 0, 0.06 + i * 0.0, 4.6 + i * 0.3, 2.0, 0.12 + (2 - i) * 0.0, 0.3);
  add(house, K.geo.box, 0x5a4a3a, 0, 2.8, 4.1, 5.2, 0.15, 1.6);
  [-2.4, 2.4].forEach(function (x) { add(house, K.geo.cyl, 0xeceae2, x, 1.4, 4.3, 0.08, 2.6, 0.08); });
  const winM = new T.MeshBasicMaterial({ color: 0xffd27a });
  [-3.3, 3.3].forEach(function (x) { add(house, K.geo.plane, winM, x, 2.0, 3.02, 1.6, 1.3, 1); add(house, K.geo.box, 0xfff1d6, x, 2.0, 3.03, 0.08, 1.3, 0.02); add(house, K.geo.box, 0xfff1d6, x, 2.0, 3.03, 1.6, 0.08, 0.02); add(house, K.geo.box, 0x2f6b3a, x - 1.0, 2.0, 3.02, 0.35, 1.4, 0.05); add(house, K.geo.box, 0x2f6b3a, x + 1.0, 2.0, 3.02, 0.35, 1.4, 0.05); });
  const doorWay = add(house, K.geo.plane, new T.MeshBasicMaterial({ color: 0xfff1c0 }), 0, 1.1, 3.01, 1.1, 2.2, 1);
  const doorPiv = grp(house, -0.55, 0, 3.05);
  const door = add(doorPiv, roundBox(1.1, 2.2, 0.08, 0.03), 0xc2304a, 0.55, 1.1, 0);
  const wreath = grp(doorPiv, 0.55, 1.55, 0.07);
  for (let i = 0; i < 14; i++) add(wreath, K.geo.sph, LEAF_COLS[i % 6], Math.cos(i / 14 * TAU) * 0.22, Math.sin(i / 14 * TAU) * 0.22, 0, 0.07);
  add(wreath, K.geo.sph, 0xffd23f, 0.95 - 0.55 - 0.1, -0.5, 0, 0.03);
  const mat = add(house, K.geo.ground, new T.MeshLambertMaterial({ map: K.tex(signCanvas(K.script, 256, 128, "#8a5a2b", "#5a3a1a", [], { logo: true })) }), 0, 0.26, 3.6, 1.2, 1, 0.6);
  // family in the windows when the house is waiting on you
  const sil = [];
  [-3.6, -3.0, 3.1, 3.7].forEach(function (x, i) { const s = grp(house, x, 1.55, 2.95); add(s, K.geo.sph, 0x3a2216, 0, 0.5, 0, 0.16); add(s, K.geo.sph, 0x3a2216, 0, 0.0, 0, 0.24, 0.4, 0.1); sil.push(s); });
  const bulbs = stringLights(house, [[-5, 4.15, 3.05], [-2.5, 4.15, 3.05], [0, 4.15, 3.05], [2.5, 4.15, 3.05], [5, 4.15, 3.05]], 10, 0.15, ["#ff8a1f", "#ffd23f", "#c2304a", "#9bdc3a", "#fff1d6"]);
  // pumpkins, mums, leaf piles, trees
  [[-1.5, 4.0], [1.5, 4.0], [1.9, 4.4]].forEach(function (p, i) { const g = grp(house, p[0], 0.25, p[1]); add(g, K.geo.sph, 0xff8a1f, 0, 0.18, 0, 0.26 - i * 0.04, 0.2, 0.26); add(g, K.geo.cyl, 0x2f6b3a, 0, 0.4, 0, 0.03, 0.12, 0.03); });
  [[-3.5, 5], [4.2, 5.4], [-5, 8]].forEach(function (p) { const g = grp(scene, p[0], 0, p[1] - 8); for (let i = 0; i < 9; i++) add(g, K.geo.sph, LEAF_COLS[i % 6], Math.cos(i * 2) * 0.5, 0.15 + (i % 3) * 0.08, Math.sin(i * 1.6) * 0.4, 0.4, 0.2, 0.35); });
  const tr = rng(55);
  [[-7, -4], [7.5, -3], [-9, 4], [9, 6]].forEach(function (p, i) { tree(scene, p[0], p[1], 1.4, LEAF_COLS[i], tr); });
  // the seat the hero rides to the door on, once the car has given up the rest
  const seatRide = grp(scene, 0, 0, 0);
  add(seatRide, roundBox(0.62, 0.16, 0.6, 0.06), 0x7a4a2a, 0, 0.3, 0); const sb = add(seatRide, roundBox(0.62, 0.72, 0.16, 0.06), 0x7a4a2a, 0, 0.67, 0.33); sb.rotation.x = 0.18;
  // the family: three at the door, cheering
  const fam = [
    makePerson({ skin: 0xc98a5a, shirt: 0x8a3a5a, pants: 0x3a3a44, shoe: 0x2a1a10, hair: 0x2a1a10, hairStyle: "bob", sleeves: "long", apron: 0xfff1d6, skirt: 0x8a3a5a, trim: 0x6a2a4a }),
    makePerson({ skin: 0xe8b88a, shirtMap: K.tex(clothCanvas("#5a6a3a", "rgba(0,0,0,.35)", 31)), pants: 0x6b5a48, shoe: 0x3a2616, hair: 0x9a9a9a, hairStyle: "short", sleeves: "long", beard: true, glasses: "round", belly: 0.6, trim: 0x3a4a2a }),
    makePerson({ skin: 0xf1c7a0, shirt: 0xd8b23a, pants: 0x4a3a5a, shoe: 0x6a3a2a, hair: 0xd8d2c8, hairStyle: "bun", sleeves: "long", glasses: "round", skirt: 0x5a3a6a, trim: 0xb8922a, scale: 0.92 })
  ];
  fam.forEach(function (p) { scene.add(p.root); });
  // inside: the dining room, set up 40 m to the side so the camera can cut to it
  const room = grp(scene, 40, 0, 0);
  const wallP = new T.MeshLambertMaterial({ map: K.tex(sidingCanvas("#8a5a3a"), true) });
  add(room, K.geo.ground, new T.MeshLambertMaterial({ map: K.tex(woodCanvas("#8a5a3a", "#4a2a1c", 81), true) }), 0, 0, 0, 10, 1, 10);
  add(room, K.geo.box, new T.MeshLambertMaterial({ color: 0xc9a47a }), 0, 1.6, -3, 10, 3.2, 0.1);
  add(room, K.geo.box, 0x5a3a2a, 0, 0.5, -2.94, 10, 1.0, 0.04);
  add(room, K.geo.box, new T.MeshLambertMaterial({ color: 0xb8946a }), -3.5, 1.6, 0, 0.1, 3.2, 8);
  add(room, K.geo.box, new T.MeshLambertMaterial({ color: 0xb8946a }), 4.5, 1.6, 0, 0.1, 3.2, 8);
  add(room, K.geo.box, 0x5a3a2a, 4.44, 0.5, 0, 0.04, 1.0, 8);
  add(room, K.geo.plane, new T.MeshBasicMaterial({ map: K.tex(signCanvas(K.script, 512, 300, "#1d2b53", "#ffd23f", [["GIVE THANKS", "#ffd23f", 44]], { logo: true })) }), 0.4, 2.2, -2.92, 1.4, 0.82, 1);
  const roomLight = new T.PointLight(0xffd8a0, 0, 10, 1.4); roomLight.position.set(40, 2.6, 0.5); scene.add(roomLight);
  const tbl = grp(room, 0, 0, -0.6);
  add(tbl, K.geo.box, new T.MeshLambertMaterial({ map: K.maps.plaidCloth }), 0, 0.76, 0, 2.6, 0.06, 1.2);
  add(tbl, K.geo.box, new T.MeshLambertMaterial({ map: K.maps.plaidCloth }), 0, 0.55, 0.6, 2.6, 0.42, 0.02);
  [[-1.2, -0.5], [1.2, -0.5], [-1.2, 0.5], [1.2, 0.5]].forEach(function (p) { add(tbl, K.geo.box, 0x4a2a1c, p[0], 0.37, p[1], 0.08, 0.74, 0.08); });
  const feast = grp(tbl, 0, 0.8, 0);
  add(feast, new T.CylinderGeometry(0.42, 0.38, 0.04, 24), 0xeceae2, 0, 0, -0.1);
  add(feast, K.geo.sph, new T.MeshPhongMaterial({ color: 0xb8692a, shininess: 50 }), 0, 0.17, -0.1, 0.32, 0.2, 0.25);
  [-1, 1].forEach(function (s) { const d = add(feast, K.geo.sph, new T.MeshPhongMaterial({ color: 0xa8592a, shininess: 50 }), s * 0.2, 0.18, 0.1, 0.07, 0.07, 0.15); d.rotation.x = -0.6; add(feast, K.geo.sph, 0xfff1d6, s * 0.22, 0.26, 0.2, 0.03); });
  [[-0.8, 0.1, 0xffd23f], [0.8, 0.1, 0x7fae6a], [-0.55, -0.35, 0xc2304a], [0.6, -0.35, 0xeceae2]].forEach(function (b) { add(feast, new T.CylinderGeometry(0.14, 0.1, 0.1, 16), 0xf4f2ec, b[0], 0.04, b[1]); add(feast, K.geo.sph, b[2], b[0], 0.08, b[1], 0.11, 0.04, 0.11); });
  const candles = [];
  [-0.35, 0.35].forEach(function (x) { add(feast, K.geo.cyl, 0xfff1d6, x, 0.15, -0.42, 0.03, 0.3, 0.03); candles.push(glowSprite(feast, x, 0.34, -0.42, 0.25, 0xffc070, 0.9)); });
  const piesOn = [];
  for (let i = 0; i < 3; i++) piesOn.push(pie(feast, -0.6 + i * 0.6, 0.0, 0.38, 0.17));
  // the late table: one plate under foil, a sticky note
  const late = grp(room, 0, 0, -0.6);
  add(late, new T.CylinderGeometry(0.2, 0.16, 0.02, 20), 0xeceae2, 0.1, 0.8, 0.2);
  add(late, new T.SphereGeometry(0.19, 20, 10, 0, TAU, 0, Math.PI / 2), new T.MeshPhongMaterial({ color: 0xc8cdd4, shininess: 120, specular: 0xffffff }), 0.1, 0.81, 0.2, 1, 0.55, 1);
  const note = add(late, K.geo.plane, new T.MeshLambertMaterial({ map: K.tex(noteCanvas()) }), 0.55, 0.81, 0.25, 0.22, 0.22, 1); note.rotation.x = -Math.PI / 2; note.rotation.z = 0.15;
  const lampG = grp(late, -0.9, 0.8, -0.3); add(lampG, K.geo.cyl, 0x8a5a2b, 0, 0.2, 0, 0.03, 0.4, 0.03); add(lampG, new T.ConeGeometry(0.18, 0.2, 16, 1, true), new T.MeshBasicMaterial({ color: 0xffd27a, side: T.DoubleSide }), 0, 0.45, 0);
  // the card table in the corner
  const card = grp(room, 1.1, 0, 1.3);
  add(card, K.geo.box, 0x2a2a30, 0, 0.62, 0, 0.8, 0.04, 0.8);
  [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.33, 0.35]].forEach(function (p, i) { add(card, K.geo.box, 0x8e93a2, p[0], 0.3, p[1], 0.03, i === 3 ? 0.52 : 0.6, 0.03); });
  add(card, K.geo.plane, new T.MeshBasicMaterial({ map: K.tex(signCanvas(K.script, 256, 96, "#fff1d6", "#c2304a", [["KIDS TABLE", "#c2304a", 44]])) }), 0, 0.5, 0.41, 0.4, 0.15, 1);
  const chair = grp(card, 0, 0, -0.55); chair.rotation.y = Math.PI; add(chair, roundBox(0.4, 0.05, 0.4, 0.02), 0x8e93a2, 0, 0.42, 0); add(chair, roundBox(0.4, 0.4, 0.04, 0.02), 0x8e93a2, 0, 0.66, 0.2);
  const P0 = K.hero, car = K.car;
  const confettiG = new T.BufferGeometry(), cv = [], cc = [];
  for (let i = 0; i < 120; i++) { cv.push(0, -10, 0); const c = new T.Color([INK.pumpkin, INK.cran, INK.gold][i % 3]); cc.push(c.r, c.g, c.b); }
  confettiG.setAttribute("position", new T.Float32BufferAttribute(cv, 3)); confettiG.setAttribute("color", new T.Float32BufferAttribute(cc, 3));
  const confetti = new T.Points(confettiG, new T.PointsMaterial({ size: 0.06, vertexColors: true })); scene.add(confetti);
  const cvel = []; for (let i = 0; i < 120; i++) cvel.push([rnd(-1.5, 1.5), rnd(2, 4.5), rnd(-1, 1)]);
  return { scene: scene, cam: cam, sync: function (state, dt, t) {
    const T0 = S.phase === "home" ? S.pt : (state === "over" ? 9 + idleT : 0), on = onTime();
    scene.background.copy(on ? bgOn : bgLate); skyOn.visible = on; skyLate.visible = !on;
    hemi.intensity = on ? 1.2 : 0.7; sunL.intensity = on ? 1.4 : 0.2;
    winM.color.set(on ? 0xffd27a : 0x4a3e3a);
    sil.forEach(function (s, i) { s.visible = on && T0 < 5; s.position.y = 1.55 + Math.abs(Math.sin(t * 5 + i)) * 0.06; });
    twinkle(bulbs, t);
    const open = clamp((T0 - 5) / 0.6, 0, 1);
    doorPiv.rotation.y = -open * 1.7;
    doorWay.material.color.set(on ? 0xfff1c0 : 0x2a2420);
    // the car coasts in, sheds what is left at the curb, the hero rides the seat to the door
    const k = clamp(T0 / 2.4, 0, 1), e = 1 - Math.pow(1 - k, 2);
    car.visible = T0 < 3.4;
    place(car, scene, 0.2, 0, 14 - e * 15, 0);
    spinWheels(e * 15);
    carParts(T0 > 2.4 ? 6 : S.lost);
    seatRide.visible = T0 >= 3.4 && T0 < 6;
    for (let i = V.fly.length - 1; i >= 0; i--) { if (V.fly[i].mesh && V.fly[i].mesh.parent) V.fly[i].mesh.parent.remove(V.fly[i].mesh); V.fly.splice(i, 1); }
    if (!this.shed) this.shed = [];
    if (T0 > 2.4 && T0 < 4.6) {
      if (!this.shedDone) { this.shedDone = true; for (let i = S.lost; i < 6; i++) { const m = car.userData.parts[i].clone(); m.visible = true; scene.add(m); this.shed.push({ m: m, vx: (i - 3) * 1.4, vy: 3 + i * 0.4, s: rnd(-6, 6) }); } }
      const q = T0 - 2.4;
      this.shed.forEach(function (p) { p.m.position.set(0.2 + p.vx * q, Math.max(-0.3, p.vy * q - 7 * q * q), -1 + q * 0.8); p.m.rotation.set(p.s * q, 0, p.s * 0.5 * q); });
    } else if (this.shed.length && (T0 >= 4.6 || T0 < 2.4)) { this.shed.forEach(function (p) { scene.remove(p.m); }); this.shed = []; if (T0 < 2.4) this.shedDone = false; }
    if (T0 < 3.4) heroDrive(dt, t, 0.4);
    else if (T0 < 6) {
      const gk = clamp((T0 - 3.4) / 1.5, 0, 1);
      seatRide.position.set(0.2 * (1 - gk), 0, -1 - gk * 3.6);
      seatRide.rotation.y = Math.PI;
      place(P0.root, scene, seatRide.position.x, 0.02, seatRide.position.z + 0.1, Math.PI);
      posePerson(P0, "seatRide", dt, t, { ny: 0.2 }, 0.6);
    }
    // the family greets at the door
    fam.forEach(function (p, i) {
      p.root.visible = on && T0 > 5 && T0 < 6;
      place(p.root, scene, [-1.5, -0.95, 1.2][i], 0.25, -4.45, [0.3, 0.2, -0.3][i]);
      posePerson(p, "cheer", dt, t + i, cheerExtra(t, i), 0.5);
    });
    // cut inside after the door opens
    const inside = T0 > 6;
    roomLight.intensity = inside ? (on ? 14 : 4) : 0;
    feast.visible = on; late.visible = !on;
    candles.forEach(function (c) { c.scale.setScalar(0.25 + Math.sin(t * 13) * 0.02); });
    for (let i = 0; i < 3; i++) { const land = clamp((T0 - 6 - i * 0.3) / 0.3, 0, 1); piesOn[i].visible = on && i < S.pies && T0 > 6 + i * 0.3; piesOn[i].position.y = (1 - land) * 0.5; }
    if (inside) {
      if (on) {
        place(P0.root, room, 1.1, 0.0, 0.72, 0);
        const wob = Math.sin(t * 9) * 0.04;
        card.rotation.z = wob; chair.rotation.z = wob * 0.5;
        posePerson(P0, "sit", dt, t, { lsx: -0.75, rsx: -0.75, lex: -0.7, rex: -0.7, smile: 0.9, jaw: 0.25, ny: -0.3, hz: wob }, 0.6);
        P0.root.rotation.y = -0.2;
        fam.forEach(function (p, i) {
          p.root.visible = true;
          place(p.root, room, -0.9 + i * 0.9, 0, -1.55, 0);
          posePerson(p, "cheer", dt, t + i, cheerExtra(t * 0.85, i), 0.5);
        });
      } else {
        const wk = clamp((T0 - 6) / 2.4, 0, 1), walking = 1 - clamp((T0 - 8.2) / 0.4, 0, 1), turn = clamp((T0 - 8.0) / 0.6, 0, 1);
        place(P0.root, room, 2.2 - wk * 2.65, 0, 2.6 - wk * 1.65, -2.13 * (1 - turn) + 0.4 * turn);
        const pz = mixPose(POSES.stand, POSES.stand, 0, P0.pose);
        addPose(pz, { nx: 0.45 * turn + 0.1, ny: 0.5 * turn, smile: -0.2, brow: 0.6 * turn, rsx: -0.5 * turn, rex: -1.3 * turn, rsz: 0.3 * turn, lsx: 0.1 });
        walkPose(pz, (T0 - 6) * 5.4, walking, true);
        lifePose(pz, P0, t, 0.5 * turn); applyPose(P0, pz, dt);
      }
    }
    // confetti on time
    const cp = confettiG.attributes.position;
    if (on && T0 > 5 && T0 < 8.5) {
      const q = T0 - 5;
      for (let i = 0; i < 120; i++) { const v = cvel[i]; cp.setXYZ(i, (inside ? 40 : 0) + v[0] * q, (inside ? 1.4 : 2.2) + v[1] * q - 3 * q * q, (inside ? -0.4 : -5) + v[2] * q); }
      confetti.visible = true; cp.needsUpdate = true;
    } else confetti.visible = false;
    // camera
    if (!inside) { cam.position.set(2.2, 1.9, 6.8); cam.lookAt(0.0, 1.2, -4.5); }
    else { cam.position.set(40.75, 1.8, 4.6); cam.lookAt(40.4, 0.95, -0.2); }
  } };
}

/* ---------------- Scenes on screen ---------------- */
let SC = null;
function buildScenes() {
  SC = { intro: buildIntro(), sky: buildSky(), rails: buildRails(), motel: buildMotel(), road: buildRoad(), home: buildHome() };
}
function viewName(state) {
  if (state === "title") return "title";
  if (state === "over") return "home";
  const p = S.phase;
  if (p === "howto" || p === "exit") return LEGS[S.leg].key;
  return p;
}
function camShake(mag, dur) { if (Sh.reduced) return; V.camShake = mag; V.camShakeT = dur; V.camShakeD = dur; }
const PV = { v: null };
function toScreen(cam, v) { PV.v = PV.v || new THREE.Vector3(); PV.v.copy(v).project(cam); return { x: (PV.v.x * 0.5 + 0.5) * W, y: (-PV.v.y * 0.5 + 0.5) * H }; }

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
const QUALITY = [{ pr: 2 }, { pr: 1.5 }, { pr: 1.15 }, { pr: 1 }];
const Q = { q: 0, lock: false, warm: 0, sum: 0, n: 0, hits: 0, cw: 0, ch: 0, pr: 0, left: null, top: null, hud: null, stage: null, lastT: 0 };
function pixelRatio() { return Math.min(window.devicePixelRatio || 1, QUALITY[Q.q].pr); }
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
  const pr = pixelRatio();
  if (cw !== Q.cw || ch !== Q.ch || pr !== Q.pr) {
    Q.cw = cw; Q.ch = ch; Q.pr = pr;
    K.renderer.setPixelRatio(pr); K.renderer.setSize(cw, ch, false);
    K.gl.style.width = cw + "px"; K.gl.style.height = ch + "px";
  }
  if (left !== Q.left || top !== Q.top) { Q.left = left; Q.top = top; K.gl.style.left = left + "px"; K.gl.style.top = top + "px"; }
  return true;
}

/* ---------------- HUD text and shapes (2D canvas on top) ---------------- */
function txt(c, s, x, y, size, col, align, glow) {
  c.font = "bold " + size + "px " + HUD_FONT; c.textAlign = align || "left"; c.textBaseline = "top";
  if (glow) { c.shadowColor = glow; c.shadowBlur = 8; }
  c.fillStyle = "rgba(0,0,0,.85)"; c.fillText(s, x + 1.5, y + 1.5);
  c.fillStyle = col || "#eceae2"; c.fillText(s, x, y);
  c.shadowBlur = 0;
}
function ui(c, s, x, y, size, col, align) { c.font = "bold " + size + "px " + HUD_FONT; c.textAlign = align || "left"; c.textBaseline = "top"; c.fillStyle = col || "#eceae2"; c.fillText(s, x, y); }
function wrapUi(c, s, x, y, size, col, maxW, lh) {
  c.font = "bold " + size + "px " + HUD_FONT; const words = s.split(" "); let line = "", yy = y;
  for (let i = 0; i < words.length; i++) { const test = line ? line + " " + words[i] : words[i]; if (c.measureText(test).width > maxW && line) { ui(c, line, x, yy, size, col, "center"); line = words[i]; yy += lh; } else line = test; }
  if (line) ui(c, line, x, yy, size, col, "center");
}
function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function circ(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
function rr(c, x, y, w, h, r, col) { rrectPath(c, x, y, w, h, r); c.fillStyle = col; c.fill(); }
function pieIcon(c, x, y, r) {
  c.fillStyle = "#b26a1c"; c.beginPath(); c.ellipse(x, y, r, r * 0.45, 0, 0, TAU); c.fill();
  c.fillStyle = "#e0a13a"; c.beginPath(); c.ellipse(x, y - 1, r * 0.85, r * 0.35, 0, 0, TAU); c.fill();
  c.strokeStyle = "#ffd88a"; c.lineWidth = 1; c.beginPath(); c.moveTo(x - r * 0.5, y - 1); c.lineTo(x + r * 0.5, y - 1); c.stroke();
}

/* the Dinner Clock, score and pies, always on top */
function hud(c) {
  const g = c.createLinearGradient(0, 0, 0, 44); g.addColorStop(0, "rgba(28,18,12,.92)"); g.addColorStop(1, "rgba(14,10,8,.88)");
  c.fillStyle = g; c.fillRect(0, 0, W, 44); rect(c, 0, 44, W, 2, INK.pumpkin); rect(c, 0, 46, W, 1, INK.gold);
  txt(c, comma(S.score), 8, 5, 15, INK.gold);
  for (let i = 0; i < 3; i++) { c.globalAlpha = i < S.pies ? 1 : 0.25; pieIcon(c, 14 + i * 20, 33, 8); c.globalAlpha = 1; }
  const leg = S.phase === "motel" ? "THE MOTEL" : S.phase === "home" ? "HOME" : LEGS[S.leg].title;
  ui(c, leg, W / 2 - 22, 6, 12, "#eceae2", "center");
  const m = clock(), risk = m + remainingTravel() > CONFIG.dinnerMin, col = m > CONFIG.dinnerMin ? "#ff4b3e" : risk ? INK.pumpkin : "#9bff3f";
  rr(c, W - 106, 4, 100, 36, 6, "#0b0d14"); c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(W - 105, 5, 98, 34);
  txt(c, clockStr(m), W - 56, 7, 14, col, "center");
  ui(c, "DINNER 6:00 PM", W - 56, 25, 9, "#8e93a2", "center");
  if (S.phase === "sky" && S.streak >= 2) ui(c, "STREAK " + S.streak + " x" + mult(), W / 2 - 22, 24, 11, S.streak >= 10 ? INK.gold : "#3ff0ff", "center");
  if (S.phase === "road" && S.bolt > 0) ui(c, "EXTRA BOLT", W / 2 - 22, 24, 11, INK.gold, "center");
  else if (S.phase === "road" && S.coffee) ui(c, "COFFEE " + S.coffee, W / 2 - 22, 24, 11, "#e0a13a", "center");
}

/* SKY overlay: speech bubbles over the seatmate, the NOD marker and the shrinking rings */
function icon(c, k, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, s);
  if (k === "cat") { rect(c, -10, -4, 20, 14, "#e08a3a"); c.fillStyle = "#e08a3a"; c.beginPath(); c.moveTo(-10, -4); c.lineTo(-7, -12); c.lineTo(-3, -4); c.moveTo(10, -4); c.lineTo(7, -12); c.lineTo(3, -4); c.fill(); rect(c, -6, 0, 3, 3, "#1b1b28"); rect(c, 3, 0, 3, 3, "#1b1b28"); rect(c, 10, 4, 8, 3, "#e08a3a"); }
  else if (k === "lawn") { rect(c, -16, 4, 32, 8, "#4caf50"); for (let i = -14; i < 16; i += 4) rect(c, i, 0, 2, 5, "#2e7d32"); circ(c, 8, -6, 5, "#ffd23f"); }
  else if (k === "foot") { rr(c, -12, -2, 24, 12, 5, "#e8b88a"); rect(c, -12, -12, 9, 12, "#e8b88a"); circ(c, 9, 0, 4, "#ff6b6b"); }
  else if (k === "photos") { rect(c, -14, -10, 22, 16, "#cfc8b7"); rect(c, -8, -6, 22, 16, "#1b1b28"); rect(c, -6, -4, 18, 12, "#6fa8dc"); c.fillStyle = "#4caf50"; c.beginPath(); c.moveTo(-6, 8); c.lineTo(2, -2); c.lineTo(12, 8); c.fill(); }
  else if (k === "fish") { c.fillStyle = "#5b9bd5"; c.beginPath(); c.ellipse(-2, 0, 12, 6, 0, 0, TAU); c.fill(); c.beginPath(); c.moveTo(9, 0); c.lineTo(16, -6); c.lineTo(16, 6); c.fill(); rect(c, -9, -2, 2, 2, "#1b1b28"); }
  else if (k === "cloud") { circ(c, -6, 2, 7, "#9aa4b2"); circ(c, 4, -1, 9, "#9aa4b2"); circ(c, 12, 3, 6, "#9aa4b2"); for (let i = -6; i < 12; i += 6) rect(c, i, 10, 2, 5, "#3f7fd0"); }
  else if (k === "mower") { rect(c, -12, -2, 20, 8, "#c2304a"); circ(c, -8, 8, 4, "#1b1b22"); circ(c, 6, 8, 4, "#1b1b22"); rect(c, 6, -12, 2, 12, "#5a5e6c"); rect(c, 6, -12, 10, 2, "#5a5e6c"); }
  c.restore();
}
function bubble(c, b, hx, hy) {
  const s = b.giant ? 1.8 : 1, a = clamp(2 - b.t * 1.1, 0, 1), w = 64 * s, h = 46 * s;
  const x = clamp(hx + b.x - w / 2 + (b.giant ? -40 : 0), 4, W - w - 4), y = Math.max(54, hy + b.y - h - 18);
  c.globalAlpha = a;
  c.shadowColor = "rgba(0,0,0,.35)"; c.shadowBlur = 6;
  rr(c, x, y, w, h, 10, "#ffffff"); c.shadowBlur = 0;
  c.fillStyle = "#ffffff"; c.beginPath(); c.moveTo(x + w * 0.6, y + h - 1); c.lineTo(x + w * 0.72, y + h + 12); c.lineTo(x + w * 0.8, y + h - 1); c.fill();
  icon(c, b.topic, x + w / 2, y + h / 2 - (b.giant ? 6 : 0), s);
  if (b.giant) ui(c, "400 PHOTOS", x + w / 2, y + h - 18, 10, INK.cran, "center");
  c.globalAlpha = 1;
}
const HV = { v: null };
function skyOverlay(c, t) {
  const sc = SC.sky, P = sc.mate;
  HV.v = HV.v || new THREE.Vector3();
  P.head.getWorldPosition(HV.v); HV.v.y += 0.3;
  const hp = toScreen(sc.cam, HV.v);
  for (let i = 0; i < S.bubbles.length; i++) bubble(c, S.bubbles[i], hp.x, hp.y);
  const turb = S.pt > 15 && S.pt < 99 ? Math.sin(t * 23) * 2 + Math.sin(t * 37) : 0;
  const mx = 180 + turb * 1.5, my = 452;
  circ(c, mx, my, 38, "rgba(0,0,0,.45)"); circ(c, mx, my, 29, INK.navy);
  c.strokeStyle = INK.gold; c.lineWidth = 3; c.beginPath(); c.arc(mx, my, 29, 0, TAU); c.stroke();
  txt(c, "NOD", mx, my - 8, 14, INK.cream, "center");
  for (let i = 0; i < S.beats.length; i++) {
    const b = S.beats[i]; if (b.done || !b.spawned) continue;
    const k = (b.t - S.pt) / b.appr, r = 29 + Math.max(0, k) * (b.giant ? 140 : 92);
    c.strokeStyle = b.giant ? INK.pumpkin : Math.abs(b.t - S.pt) < CONFIG.sky.good ? INK.gold : "#3ff0ff"; c.lineWidth = b.giant ? 6 : 4;
    c.globalAlpha = clamp(1.2 - k * 0.5, 0.3, 1);
    c.beginPath(); c.arc(mx + (b.turb ? Math.sin(t * 19 + i) * 3 : 0), my, r, 0, TAU); c.stroke();
    c.globalAlpha = 1;
  }
  if (S.verdict && S.verdict.t < 0.5) {
    const v = S.verdict.v, vc = v === "PERFECT" ? INK.gold : v === "GOOD" ? "#3ff0ff" : "#ff4b3e", s = 1 + Math.max(0, 0.15 - S.verdict.t) * 3;
    c.save(); c.translate(180, 384); c.scale(s, s); txt(c, v, 0, -10, 20, vc, "center"); c.restore();
  }
  if (S.pt > 30 && S.pt < 43) txt(c, "SLIDESHOW MODE", W / 2, 360, 13, Math.sin(t * 10) > 0 ? INK.pumpkin : INK.gold, "center");
}
/* RAILS overlay: the tilt gauge, curve and brake warnings */
function gauge(c, x, y, z, th, small) {
  const r = small ? 60 : 64, a0 = Math.PI * 1.15, a1 = Math.PI * 1.85, span = a1 - a0, mid = (a0 + a1) / 2;
  function A(v) { return mid + clamp(v, -1.15, 1.15) / 1.15 * span / 2; }
  rr(c, x - r - 14, y - r - 12, (r + 14) * 2, r + 22, 10, "rgba(8,9,14,.8)");
  c.lineWidth = 12; c.strokeStyle = "#7a1f1f"; c.beginPath(); c.arc(x, y, r, a0, a1); c.stroke();
  c.strokeStyle = "#2f9e44"; c.beginPath(); c.arc(x, y, r, A(-z), A(z)); c.stroke();
  const na = A(th); c.strokeStyle = "#ffffff"; c.lineWidth = 4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(na) * (r + 8), y + Math.sin(na) * (r + 8)); c.stroke();
  circ(c, x, y, 6, INK.gold);
  ui(c, "L", x - r - 7, y - 18, 11, "#8e93a2", "center"); ui(c, "R", x + r + 7, y - 18, 11, "#8e93a2", "center");
}
function railsOverlay(c, t) {
  if (S.curve && S.curve.t < 2.8) { const cd = S.curve.dir; rr(c, 10, 54, 80, 44, 6, "rgba(8,9,14,.85)"); c.strokeStyle = INK.gold; c.lineWidth = 4; c.beginPath(); c.moveTo(50 - 16 * cd, 86); c.quadraticCurveTo(50 - 16 * cd, 64, 50 + 18 * cd, 64); c.stroke(); ui(c, "CURVE " + (cd > 0 ? "R" : "L"), 50, 84, 10, INK.gold, "center"); }
  if (S.jolt && S.jolt.t < 1 && Math.sin(t * 30) > 0) { rr(c, W - 102, 54, 92, 44, 6, "#ff4b3e"); txt(c, "BRAKES!", W - 56, 60, 12, "#ffffff", "center"); ui(c, "HORN", W - 56, 80, 10, "#ffffff", "center"); }
  gauge(c, W / 2, 132, zone(), S.th, false);
  if (S.redT > 0.15) { txt(c, "SLIPPING!", W / 2, 140, 15, Math.sin(t * 20) > 0 ? "#ff4b3e" : INK.gold, "center"); rect(c, W / 2 - 40, 160, 80 * (S.redT / CONFIG.rails.red), 4, "#ff4b3e"); }
  else if (S.greenT >= 3) txt(c, "STEADY " + Math.floor(S.greenT) + "s", W / 2, 142, 12, S.greenT >= 10 ? INK.gold : "#9bff3f", "center");
  if (S.hold) { circ(c, 320, 500, 22, "rgba(255,210,63,.35)"); ui(c, "LEAN", 320, 494, 10, INK.gold, "center"); }
}
/* MOTEL overlay */
function motelOverlay(c) {
  rr(c, 14, 452, 332, 76, 8, "rgba(8,9,14,.85)");
  txt(c, "THE MOTEL", W / 2, 458, 13, INK.pumpkin, "center");
  ui(c, S.quiet ? "GOOD NIGHT'S SLEEP. EXTRA BOLT EARNED" : "BONUS: TAP 6 TIMES TO KICK THE ICE MACHINE", W / 2, 478, 10, S.quiet ? INK.gold : "#eceae2", "center");
  for (let i = 0; i < CONFIG.motel.kicks; i++) rr(c, 132 + i * 17, 494, 13, 9, 2, i < S.kicks ? INK.gold : "#5a6670");
  const left = Math.max(0, CONFIG.motel.dur - S.pt);
  rect(c, 40, 508, 280 * (left / CONFIG.motel.dur), 6, INK.pumpkin); ui(c, "30 MINUTE NAP", W / 2, 516, 9, "#8e93a2", "center");
}
/* INTRO overlay: the title over the gate */
function introOverlay(c, t) {
  const g = c.createLinearGradient(0, 380, 0, H); g.addColorStop(0, "rgba(10,8,6,0)"); g.addColorStop(0.35, "rgba(10,8,6,.82)"); g.addColorStop(1, "rgba(10,8,6,.95)");
  c.fillStyle = g; c.fillRect(0, 380, W, H - 380);
  if (K.scriptImgOK) { const s = K.script, w = 150, h = w * s.height / s.width; c.drawImage(s, W / 2 - w / 2, 404, w, h); }
  txt(c, "GRAVY OR BUST!", W / 2, 470, 24, INK.pumpkin, "center", INK.cran);
  ui(c, "THREE RIDES TO DINNER", W / 2, 498, 12, INK.gold, "center");
  ui(c, "900 MILES. 3 PIES. DINNER AT 6:00 PM.", W / 2, 514, 10, INK.cream, "center");
  if (Math.sin(t * 6) > -0.3) ui(c, "TAP TO BOARD", W / 2, 60, 12, "#ffffff", "center");
}
function finger(c, x, y, down) {
  const o = down ? 4 : 0;
  rr(c, x - 7, y - 18 + o, 14, 30, 6, "#f1c28e"); rr(c, x - 10, y + 4 + o, 20, 20, 6, "#f1c28e");
  if (down) { c.strokeStyle = INK.gold; c.lineWidth = 2; c.beginPath(); c.arc(x, y - 20, 11, 0, TAU); c.stroke(); }
}
function carIcon(c, x, y) {
  rr(c, x - 14, y - 26, 28, 52, 6, paint()); rect(c, x - 10, y - 14, 20, 4, "#6fa8dc"); rect(c, x - 10, y + 14, 20, 4, "#6fa8dc");
  for (let i = 0; i < 4; i++) rect(c, (i % 2 ? x + 13 : x - 19), (i < 2 ? y - 20 : y + 10), 6, 12, "#1b1b22");
}
function howtoOverlay(c, t) {
  const L = LEGS[S.leg];
  c.fillStyle = "rgba(8,9,14,.66)"; c.fillRect(0, 0, W, H);
  rr(c, 28, 110, 304, 300, 10, "rgba(29,32,41,.96)"); c.strokeStyle = L.col; c.lineWidth = 3; c.strokeRect(30, 112, 300, 296);
  ui(c, L.n, W / 2, 124, 11, "#8e93a2", "center");
  txt(c, L.title, W / 2, 142, 22, L.col, "center");
  ui(c, L.sub, W / 2, 172, 11, INK.cream, "center");
  const cx = W / 2, cy = 262, tt = (t * 1.2) % 1;
  if (L.key === "sky") {
    circ(c, cx, cy, 26, INK.navy); c.strokeStyle = INK.gold; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, 26, 0, TAU); c.stroke(); txt(c, "NOD", cx, cy - 7, 12, INK.cream, "center");
    c.strokeStyle = "#3ff0ff"; c.beginPath(); c.arc(cx, cy, 26 + (1 - tt) * 56, 0, TAU); c.stroke();
    finger(c, cx + 56, cy + 34, tt > 0.85);
  } else if (L.key === "rails") {
    gauge(c, cx, cy + 24, 0.32, Math.sin(t * 2.4) * 0.28, true);
    finger(c, cx + 84, cy + 30, Math.sin(t * 2.4) < 0);
    ui(c, "HOLD", cx + 84, cy - 14, 10, INK.gold, "center");
  } else {
    rect(c, cx - 66, cy - 44, 132, 92, "#3a3d45"); for (let i = 1; i < 3; i++) rect(c, cx - 66 + i * 44, cy - 44, 2, 92, "#ffd23f");
    carIcon(c, cx + (tt < 0.5 ? -44 : 0), cy + 2);
    finger(c, cx - 104, cy + 30, tt < 0.5); finger(c, cx + 104, cy + 30, tt >= 0.5);
  }
  wrapUi(c, L.how, W / 2, 330, 12, "#eceae2", 270, 17);
  if (Math.sin(t * 6) > 0) ui(c, "TAP TO GO", W / 2, 386, 10, "#8e93a2", "center");
}
function exitOverlay(c) {
  const e = S.exitInfo || { grade: "C", title: "", sub: "" }, k = clamp(S.pt / 0.3, 0, 1);
  c.fillStyle = "rgba(8,9,14," + (0.6 * k) + ")"; c.fillRect(0, 0, W, H);
  const y = -120 + k * 230;
  rect(c, 80, y - 140, 4, 140, "#8e93a2"); rect(c, 276, y - 140, 4, 140, "#8e93a2");
  rr(c, 30, y, 300, 80, 6, S.leg === 2 ? "#2f6b3a" : "#14161f"); c.strokeStyle = "#eceae2"; c.lineWidth = 2; c.strokeRect(36, y + 6, 288, 68);
  txt(c, e.title, W / 2, y + 16, e.title.length > 17 ? 15 : 18, S.leg === 2 ? "#ffffff" : INK.gold, "center");
  ui(c, S.leg === 0 ? "FLIGHT NP 34 ARRIVED (SOMEWHERE)" : S.leg === 1 ? "ALL PASSENGERS OFF" : "KEEP RIGHT", W / 2, y + 50, 10, S.leg === 2 ? "#cfe9f2" : "#8e93a2", "center");
  wrapUi(c, e.sub, W / 2, 236, 12, INK.cream, 280, 16);
  if (S.pt > 0.45) {
    const gs = 1 + Math.max(0, 0.7 - S.pt) * 4, gc = { A: "#9bff3f", B: "#3ff0ff", C: INK.gold, D: "#ff4b3e" }[e.grade];
    c.save(); c.translate(W / 2, 340); c.scale(gs, gs); c.rotate(-0.08);
    rr(c, -50, -44, 100, 88, 10, "rgba(0,0,0,.6)"); c.strokeStyle = gc; c.lineWidth = 5; c.strokeRect(-46, -40, 92, 80);
    txt(c, e.grade, 0, -26, 50, gc, "center"); c.restore();
    ui(c, "LEG GRADE", W / 2, 394, 11, "#8e93a2", "center");
  }
  txt(c, "DINNER CLOCK " + clockStr(clock()), W / 2, 418, 13, "#eceae2", "center");
}
function homeOverlay(c, t) {
  const T0 = S.pt, on = onTime();
  if (T0 > 5.2) {
    const sc = 1 + Math.max(0, 5.5 - T0) * 2;
    c.save(); c.translate(W / 2, 70); c.scale(sc, sc);
    txt(c, on ? "HOME FOR DINNER!" : "LEFTOVERS", 0, -14, on ? 24 : 28, on ? INK.gold : INK.pumpkin, "center", on ? INK.cran : null); c.restore();
    txt(c, "ARRIVED " + clockStr(S.arrival), W / 2, 92, 13, INK.cream, "center");
  }
  if (T0 > 6.3) {
    rr(c, 40, 452, 280, 52, 8, "rgba(8,9,14,.78)");
    if (on) { ui(c, S.pies === 3 ? "ALL THREE PIES MADE IT" : S.pies + (S.pies === 1 ? " PIE" : " PIES") + " MADE IT", W / 2, 462, 12, INK.gold, "center"); ui(c, "YOUR SEAT: THE KIDS TABLE", W / 2, 482, 11, INK.cream, "center"); }
    else { ui(c, "A PLATE UNDER FOIL", W / 2, 462, 12, "#cfd3e6", "center"); ui(c, "AND A NOTE: SAVED YOU SOME.", W / 2, 482, 11, INK.cream, "center"); }
  }
  if (T0 > 6.6 && S.done !== true && Math.sin(t * 6) > 0) { rr(c, W / 2 - 70, 113, 140, 20, 10, "rgba(8,9,14,.75)"); ui(c, "TAP FOR RESULTS", W / 2, 117, 11, "#ffffff", "center"); }
}

/* ---------------- The frame ---------------- */
function draw(c, state) {
  Juke.pump();
  if (!K || !Q.hud) return;
  const now = performance.now();
  let ms = now - Q.lastT; Q.lastT = now;
  if (!(ms > 0)) ms = 0;
  const sized = layout();
  if (state === "playing") watchFrameRate(ms);
  const fdt = state === "paused" ? 0 : Math.min(ms, 50) / 1000;
  if (V.camShakeT > 0) { V.camShakeT -= fdt; if (V.camShakeT <= 0) V.camShake = 0; else V.camShake = V.camShake * 0.92; }
  ledTick(fdt);
  const vn = viewName(state), t = state === "title" ? idleT : S.t + (state === "over" ? idleT : 0);
  const sc = vn === "title" ? SC.road : SC[vn];
  if (sized && sc) {
    sc.sync(state, fdt, t, vn === "title");
    K.renderer.render(sc.scene, sc.cam);
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  if (state === "title") return;
  const p = S.phase;
  if (state === "playing" || state === "paused") {
    if (p === "sky") skyOverlay(c, t);
    else if (p === "rails") railsOverlay(c, t);
    else if (p === "motel") motelOverlay(c);
    else if (p === "road" && S.pt < 2.5) txt(c, "TAP LEFT  |  TAP RIGHT", W / 2, 500, 13, "#ffffff", "center");
    else if (p === "intro") introOverlay(c, S.pt);
    else if (p === "howto") howtoOverlay(c, t);
    else if (p === "exit") exitOverlay(c);
    else if (p === "home") homeOverlay(c, t);
  }
  for (let i = 0; i < parts.length; i++) { const q = parts[i]; c.globalAlpha = Math.max(0, 1 - q.t / q.life); rect(c, q.x, q.y, q.s, q.s, q.c); }
  c.globalAlpha = 1;
  for (let i = 0; i < floats.length; i++) { const f = floats[i]; c.globalAlpha = Math.max(0, 1 - f.t / f.life); txt(c, f.s, f.x, f.y, 13, f.c, "center"); }
  c.globalAlpha = 1;
  if (p !== "intro" && state !== "over") hud(c);
}

/* ---------------- Title card extras: logo, pie-tin trophy shelf, closet, best arrival ---------------- */
function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; }); }
function refreshTitle() {
  const card = document.querySelector("#np-ov-title .np-card"); if (!card) return;
  let box = document.getElementById("gob-title");
  if (!box) { box = document.createElement("div"); box.id = "gob-title"; card.insertBefore(box, card.querySelector("[data-act=start]")); }
  X = extras();
  let html = "", g = null;
  const Tr = window.Trophies;
  if (Tr && Tr.list && Tr.list.games) for (let i = 0; i < Tr.list.games.length; i++) if (Tr.list.games[i].slug === SLUG) g = Tr.list.games[i];
  if (g) {
    html += '<p class="gob-shelf-h">PIE TIN SHELF</p><ul class="gob-shelf">';
    for (let i = 0; i < g.trophies.length; i++) { const tr = g.trophies[i], on = Tr.has(tr.id); html += '<li class="gob-tin' + (on ? " on t-" + tr.tier : "") + '" title="' + esc(tr.name + (on ? "" : ": " + tr.how)) + '" aria-label="' + esc(tr.name + (on ? ", earned" : ", locked")) + '"></li>'; }
    html += "</ul>";
  }
  const ba = Number(Sh.load("bestArrival"));
  if (ba) html += '<p class="gob-arr">BEST ARRIVAL <b>' + clockStr(ba) + '</b></p>';
  let cl = "";
  for (let i = 0; i < UNLOCKS.length; i++) {
    const u = UNLOCKS[i]; if (!X.got[u.id] || u.id === "gold") continue;
    const pressed = u.paint ? X.paint === u.id : X.wear[u.id] !== false;
    cl += '<button type="button" data-gob="' + u.id + '" aria-pressed="' + pressed + '">' + esc(u.name.replace(" paint", "").replace("Plaid knit ", "")) + '</button>';
  }
  if (cl) html += '<p class="gob-shelf-h">CLOSET</p><div class="gob-closet">' + cl + "</div>";
  box.innerHTML = html;
}
document.addEventListener("click", function (e) {
  const b = e.target.closest ? e.target.closest("[data-gob]") : null; if (!b) return;
  e.stopPropagation(); X = extras(); const id = b.getAttribute("data-gob");
  if (id === "pumpkin" || id === "cran") X.paint = X.paint === id ? null : id; else X.wear[id] = X.wear[id] === false;
  saveExtras(X); if (K) dressAll(); refreshTitle();
}, true);

/* ---------------- Splash, boot, shell hookup ---------------- */
function makeSplash() {
  const el = document.createElement("div");
  el.id = "npg-splash"; el.setAttribute("role", "img"); el.setAttribute("aria-label", "Nostalgia Pro Games");
  el.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;z-index:9999;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;gap:18px;padding:24px;box-sizing:border-box;text-align:center;" +
    "background:radial-gradient(circle at 50% 42%,#6a2a1a 0%,#2a1410 52%,#100806 100%);" +
    "font:bold 15px/1.5 Verdana,Geneva,Tahoma,sans-serif;color:#ffffff;opacity:1;transition:opacity .35s ease";
  const img = document.createElement("img");
  img.alt = ""; img.decoding = "async";
  img.style.cssText = "display:block;width:min(66vw,44vh,340px);height:auto;opacity:0;transform:scale(.86);" +
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "transition:opacity .2s ease" : "transition:opacity .28s ease,transform .55s cubic-bezier(.2,1.5,.4,1)");
  const cap = document.createElement("p");
  cap.textContent = "GRAVY OR BUST!"; cap.style.cssText = "margin:0;color:#ff8a1f;letter-spacing:2px;text-shadow:0 2px 0 #000";
  el.appendChild(img); el.appendChild(cap);
  document.body.appendChild(el);
  return { el: el, img: img };
}
function splashFail(splash, line) {
  const el = splash.el;
  splash.img.style.width = "min(40vw,26vh,180px)";
  el.setAttribute("role", "alert"); el.removeAttribute("aria-label");
  const p = document.createElement("p"); p.style.cssText = "margin:0;max-width:30em"; p.textContent = line;
  const a = document.createElement("a"); a.href = "../"; a.textContent = "Back to the arcade"; a.style.cssText = "color:#ffd23f";
  el.appendChild(p); el.appendChild(a);
}
function splashGone(splash) {
  splash.el.style.opacity = "0"; splash.el.style.pointerEvents = "none";
  setTimeout(function () { if (splash.el.parentNode) splash.el.parentNode.removeChild(splash.el); }, 420);
}
function loadLogo(splash) {
  return new Promise(function (resolve) {
    const img = splash.img; let done = false;
    function fin(ok) {
      if (done) return; done = true;
      if (ok) { img.style.opacity = "1"; img.style.transform = "scale(1)"; }
      else { img.style.display = "none"; const t = document.createElement("div"); t.textContent = "Nostalgia Pro Games"; t.style.cssText = "font:italic 900 34px/1.2 Georgia,'Times New Roman',serif;color:#f6e8c8;text-shadow:0 3px 0 #12224f"; splash.el.insertBefore(t, splash.el.firstChild); }
      resolve(ok ? img : null);
    }
    img.onload = function () { fin(true); }; img.onerror = function () { fin(false); };
    setTimeout(function () { fin(false); }, 6000);
    img.src = LOGO_URL;
  });
}
function loadImage(url) {
  return new Promise(function (resolve) {
    const img = new Image(); let done = false;
    function fin(ok) { if (done) return; done = true; resolve(ok ? img : null); }
    img.onload = function () { fin(true); }; img.onerror = function () { fin(false); };
    setTimeout(function () { fin(false); }, 6000);
    img.src = url;
  });
}
// No WebGL, or three.js would not load: hand the page to the classic 2D game, if it is kept on the server as game-2d.js.
const FALLBACK_URL = "game-2d.js";
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
    "max-width:none;max-height:none;transform:none;image-rendering:auto;pointer-events:none;touch-action:none;border-radius:" + getComputedStyle(hud).borderRadius;
  stage.insertBefore(gl, hud);
  hud.style.background = "transparent";
  if (getComputedStyle(hud).position === "static") hud.style.position = "relative";
  const crt = stage.querySelector(".np-crt"); if (crt) crt.style.display = "none";
  Q.lastT = performance.now();
  layout();
}
function logoImg(px) {
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
  im.style.cssText = "display:block;width:clamp(64px," + px + ",110px);height:auto;margin:0 auto 6px";
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_URL;
  return im;
}
function startGame() {
  Sh.init({
    slug: SLUG,
    title: "GRAVY OR BUST!",
    accent: INK.pumpkin,
    width: W, height: H,
    format: function (n) { return comma(n) + " PTS"; },
    howTo: "The day before Thanksgiving, in real 3D. You are 900 miles from Mom's table with three pies, and dinner is at 6:00 PM. Three rides, one thumb: tap to nod along on the plane, hold to balance on the train, tap a side to hop lanes in the last car on the lot. Every slip costs minutes. Every run makes it to the front door.",
    keys: "Tap or hold anywhere (Space works too). On the road tap the left or right side, or use the arrow keys. P pause, M mute, N music, R restart.",
    tip: "Arrive by 6:00 PM for the warm ending. 30 minutes early with every pie and a spotless car is the big one.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; tick(dt); },
    onPause: function () { S.hold = false; keyHeld = {}; }
  });
  attach();
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Juke.unlock, true); });
  Sh.onStart(Juke.newGame); Sh.onRestart(Juke.newGame); Sh.onResume(Juke.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Juke.toggleMusic();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) { titleCard.insertBefore(logoImg("13vh"), titleCard.firstChild); Juke.button(titleCard, titleCard.querySelector(".np-tip")); }
  if (pauseActions) Juke.button(pauseActions, pauseActions.querySelector("a"));
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) card.insertBefore(logoImg("12vh"), card.firstChild);
  X = extras();
  refreshTitle();
}

// Hook for automated checks (no effect on play)
window.__gob = { S: function () { return S; }, V: V, press: press, go: go, finish: finish, hop: hop, kit: function () { return K; }, scenes: function () { return SC; },
  juke: Juke, music: startMusic, step: function (sec) { for (let i = 0; i < sec * 60; i++) update(1 / 60); }, Q: Q, CONFIG: CONFIG, LANES: LANES, CAR_Y: CAR_Y, OBS: OBS, endLeg: endLeg, afterExit: afterExit };

// ?debug=1 only: a promo still from the game's own road scene, with the logo and the name over it
if (dbg) window.__gob.cover = function (w, h) {
  const T = THREE, c = mkCanvas(w, h), g = c.getContext("2d"), sc = SC.road;
  const was = S.phase; S.phase = "road"; S.pt = 12; S.lost = 0; S.cx = 180; S.inv = 0;
  S.obs = [{ k: "turkey", x: 125, y: 520, vx: 0, ph: 1.2 }, { k: "cone", x: 240, y: 470 }, { k: "leaves", x: 125, y: 400 }];
  sc.sync("playing", 0.016, 3.2, false);
  posePerson(K.hero, "drive", 0, 3.2, { ny: -0.75, nx: -0.05, smile: 1, jaw: 0.35, brow: 0.5, rsx: -2.4, rsz: 0.5, rex: -0.4, curl: 0.1 }, 0);
  const roof = grp(K.car, 0, 1.53, 0.45); for (let i = 0; i < 3; i++) pieBox(roof, 0, 0.065 + i * 0.132, 0, (i - 1) * 0.12);
  const cam = new T.PerspectiveCamera(36, w / h, 0.1, 400); cam.position.set(5.6, 1.3, -6.5); cam.lookAt(0.05, 1.1, 0.7);
  const r = K.renderer, old = new T.Vector2(); r.getSize(old); const pr = r.getPixelRatio();
  r.setPixelRatio(1); r.setSize(w, h, false); r.render(sc.scene, cam); g.drawImage(K.gl, 0, 0, w, h); r.setPixelRatio(pr); r.setSize(old.x, old.y, false);
  let gr = g.createLinearGradient(0, 0, 0, h * 0.3); gr.addColorStop(0, "rgba(20,10,6,.75)"); gr.addColorStop(1, "rgba(20,10,6,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h * 0.3);
  gr = g.createLinearGradient(0, h * 0.62, 0, h); gr.addColorStop(0, "rgba(20,10,6,0)"); gr.addColorStop(0.5, "rgba(20,10,6,.8)"); gr.addColorStop(1, "rgba(20,10,6,.95)"); g.fillStyle = gr; g.fillRect(0, h * 0.62, w, h * 0.38);
  drawScript(g, K.script, w / 2, h * 0.115, w * 0.62, h * 0.2);
  candyText(g, "GRAVY OR BUST!", w / 2, h * 0.835, w * 0.13, w * 0.9);
  g.font = bold(w * 0.05); g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#fff1d6"; g.fillText("THREE RIDES TO DINNER", w / 2, h * 0.925);
  K.car.remove(roof); S.phase = was; S.obs = [];
  return c.toDataURL("image/png");
};

(function boot() {
  const splash = makeSplash();
  const t0 = performance.now();
  const q = /[?&]gfx=(high|low|2d)/.exec(location.search);
  let started = false;
  Promise.all([loadLogo(splash),
               q && q[1] === "2d" ? Promise.reject(Object.assign(new Error("2D asked for"), { npStage: "webgl" }))
                                  : import(THREE_URL).then(null, function (e) { e.npStage = "three"; throw e; }),
               loadImage(SCRIPT_URL)])
    .then(function (res) {
      THREE = res[1];
      try { buildKit(THREE, res[2]); K.scriptImgOK = !!res[2]; K.pieMats = K.pieMats || []; buildScenes(); } catch (e) { e.npStage = "webgl"; throw e; }
      if (q) { Q.lock = true; Q.q = q[1] === "low" ? QUALITY.length - 1 : 0; }
      X = extras(); reset();
      try { for (const k in SC) K.renderer.compile(SC[k].scene, SC[k].cam); } catch (e) { /* warm-up only */ }
      const hold = Math.max(0, 1300 - (performance.now() - t0));
      return new Promise(function (r) { setTimeout(r, hold); });
    })
    .then(function () { started = true; startGame(); splashGone(splash); })
    .catch(function (e) {
      console.error(e);
      if (started) return;
      K = null;
      loadClassic().then(function () { splashGone(splash); }, function () {
        splashFail(splash, e && e.npStage === "three"
          ? "Gravy or Bust! could not load its 3D engine (" + THREE_URL + ")."
          : "Gravy or Bust! needs WebGL for its 3D world, and this browser has it switched off or does not support it.");
      });
    });
})();
