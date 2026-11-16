/* POWDER DAY HAUL (3D): carve down Mount Backlog and grab the loose discs before the bottom.

   Real 3D on three.js 0.187.0 (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in charge of
   input, scaling and the title / pause / game over flow, and carries the HUD.

   The rules, the course builder, the speeds, the hit boxes, the spins, the scoring, the trophies and
   the batch 3 extras (shared/extras.js) are the 2D game's, unchanged: the same code decides every
   carve, every jump and every wipeout. Only the picture is new.

   The course is still laid out in the 2D game's units: x runs across the run (0 to 360, the rider is
   kept between 14 and 346) and d runs down the mountain (0 to LEN). In three.js space a course point
   (x, d) sits at (x - 180, ground height, -d): the camera rides behind the rider looking downhill.
   Mouse and touch steering read the pointer's left / right position through the 3D camera, at the
   rider's distance, so the rider still carves toward the pointer exactly as before. */

const W = 360, H = 540, TAU = Math.PI * 2, DEG = Math.PI / 180;
// Control tuning (easier pass): slower top speed, snappier grip, more forgiving spins and hit boxes.
const LEN = 15200, V0 = 132, V1 = 228, STEER = 215, CRASHES = 3;
const GRIP_ON = 11, GRIP_OFF = 18, GRIP_SLOW = 6;         // how fast the board reaches / drops its carve speed (1/s)
const FOLLOW = 5.5;                                        // mouse / touch: carve toward the pointer, this gain (1/s)
const AIR_STEER = 0.45, BRAKE = 0.68;                      // a little steering in the air; Up arrow digs in
const SPIN_RATE = 600, FINISH_RATE = 900, LAND_TOL = 55;   // let go and the board finishes its half turn by itself
const HIT_PAD = 2, GRAB_PAD = 15;                          // obstacle hit pad, disc / ramp grab pad
const BTN = { x: 130, y: 470, w: 100, h: 56 };             // SPIN button (touch)

const LOGO_URLS = ["np_games_logo.png", "np_games_logo_transparent.png"];   // the full studio logo: splash, title card, score card
const SCRIPT_URL = "np_games_script.png";                  // the script wordmark: every sign, banner and decal on the mountain
const THREE_URL = "../shared/three.module.min.js";
const FALLBACK_URL = "game-2d.js";                         // optional: the classic 2D game, used if 3D cannot start
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';

let S = {}, keys = {}, idleT = 0;
const X = window.NPX && window.NPX.on ? window.NPX : null;   // batch 3 extras (shared/extras.js)
let THREE = null, R = null, TV = null;                     // R holds everything the renderer owns
// V is how things are being shown (pose blends, particles, the carve track). It never feeds the rules.
const V = { parts: [], pops: [], trail: [], trailD: -1, lift: 0, crashSpin: 0, landT: 0, sketchy: 0, cheer: 0, hotWas: false,
            camY: null, lastDisc: 0, lastCrashes: 0, fall: 0 };
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* ---------------- Course (the 2D game's, untouched) ---------------- */
function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }
function build(seed) {
  // A clear corridor drifts gently down the mountain, so there is always a way through.
  var r = rng(seed), obs = [], d = 520, nextRamp = 1300, nextGate = LEN * 0.66, cx = 180;
  function free(x, y, rad) {
    for (var i = obs.length - 1; i >= 0 && obs[i].y > y - 140; i--) if (Math.abs(obs[i].y - y) < rad + obs[i].r + 26 && Math.abs(obs[i].x - x) < rad + obs[i].r + 26) return false;
    return true;
  }
  while (d < LEN - 300) {
    var k = d / LEN, gap = 118 - k * 34 + r() * 30;
    d += gap;
    cx = clamp(cx + (r() - 0.5) * 64, 70, 290);
    if (d > nextRamp) {
      obs.push({ t: "ramp", x: cx, y: d, r: 22 });
      for (var j = 1; j <= 5; j++) obs.push({ t: "disc", x: cx + Math.sin(j * 0.6) * 18, y: d + 60 + j * 34, r: 7 });
      nextRamp = d + 700 + r() * 500; d += 200; continue;
    }
    if (d > nextGate) {
      obs.push({ t: "gate", x: cx, y: d, r: 4, half: 46 });
      nextGate = d + 330 + r() * 120; continue;
    }
    var n = 1 + Math.floor(r() * (1.4 + k * 2)), half = 54 - k * 10;
    for (var m = 0; m < n; m++) {
      var x = 26 + r() * 308, typ = r(), o;
      if (Math.abs(x - cx) < half) continue;
      if (typ < 0.42) o = { t: "tree", x: x, y: d, r: 13 };
      else if (typ < 0.62) o = { t: "rock", x: x, y: d, r: 10 };
      else if (typ < 0.82) o = { t: "box", x: x, y: d, r: 13 };
      else o = { t: "cases", x: x, y: d, r: 12 };
      if (free(o.x, o.y, o.r)) obs.push(o);
    }
    if (r() < 0.5) { var dx = cx + (r() - 0.5) * 40; for (var q = 0; q < 3; q++) if (free(dx, d + 40 + q * 26, 6)) obs.push({ t: "disc", x: dx, y: d + 40 + q * 26, r: 7 }); }
    else if (r() < 0.35) { var ox = clamp(cx + (r() < 0.5 ? -1 : 1) * (80 + r() * 50), 24, 336); if (free(ox, d + 50, 6)) obs.push({ t: "disc", x: ox, y: d + 50, r: 7 }); }
  }
  obs.sort(function (a, b) { return a.y - b.y; });
  return obs;
}

function reset() {
  S = { t: 0, d: 0, x: 180, vx: 0, v: V0, obs: build(1 + Math.floor(Math.random() * 1e6)), phase: "ride", pt: 0,
        air: 0, airT: 0, spin: 0, spinning: false, crash: 0, inv: 0, crashes: 0, discs: 0, tricks: 0, bestSpin: 0, jumps: 0,
        gates: 0, gatesTotal: 0, score: 0, finished: false, ptrSteer: 0, mouseSteer: null, holdSpin: false, carve: 0, tx: null, ptrId: null, spinIds: {} };
  if (X) S.xt = { sc: X.scenery(), fever: new X.Fever(15), sched: new X.Scheduler(12, 24, 2), rares: 0, intro: false, slowSteer: 0, boostT: 0 };
  V.parts.length = 0; V.pops.length = 0; V.trail.length = 0; V.trailD = -1; V.lift = 0; V.crashSpin = 0; V.landT = 0; V.sketchy = 0;
  V.cheer = 0; V.hotWas = false; V.camY = null; V.lastCrashes = 0; V.fall = 0;
  if (R) placeCourseDressing();
  ledClear();
}

/* ---------------- Update (the 2D game's, untouched apart from the particles and the LED board) ---------------- */
// Returns the carve speed the rider wants (px/s). Keys carve at full speed; mouse and touch
// steer toward the pointer's x, easing off as the rider gets there, so there is no drifting.
function steerTarget() {
  var k = (keys.ArrowLeft || keys.KeyA ? -1 : 0) + (keys.ArrowRight || keys.KeyD ? 1 : 0);
  if (k) { S.tx = null; return k * STEER; }
  if (S.tx != null) return clamp((S.tx - S.x) * FOLLOW, -STEER, STEER);
  return 0;
}
function spinHeld() { if (keys.Space || keys.Enter || S.holdSpin) return true; for (var id in S.spinIds) return true; return false; }

function update(dt) {
  if (X && X.eventActive()) { X.eventTick(dt); return; }
  if (S.xt) { S.x0x = S.x; extrasTick(dt); }
  S.t += dt; S.pt += dt;
  var i, o;
  partsTick(dt);
  if (S.phase === "done") { if (S.pt > 1.2) finish(); return; }

  var k = clamp(S.d / LEN, 0, 1), target = (V0 + (V1 - V0) * k) * speedMult() * (keys.ArrowUp || keys.KeyW ? BRAKE : 1);
  if (S.crash > 0) {
    S.crash -= dt * (S.xt && S.xt.sc.id === "golden" ? 1.15 : 1); S.v = Math.max(40, S.v - 300 * dt);
    if (S.crash <= 0) { S.inv = 1.4; }
  } else {
    S.v += (target - S.v) * Math.min(1, dt * (S.v > target ? 2.2 : 0.8));
    if (S.inv > 0) S.inv -= dt;
    var want = steerTarget() * (S.air > 0 ? AIR_STEER : 1);
    var grip = S.xt && (S.xt.slowSteer > 0 || S.xt.sc.id === "rain") ? GRIP_SLOW : Math.abs(want) > Math.abs(S.vx) ? GRIP_ON : GRIP_OFF;
    S.vx += (want - S.vx) * Math.min(1, dt * grip);
    S.carve = clamp(S.vx / STEER, -1, 1);
  }
  S.x = clamp(S.x + S.vx * dt, 14, W - 14);
  S.d += S.v * dt;

  // air + spins
  if (S.air > 0) {
    S.airT += dt;
    if (spinHeld()) { S.spin += SPIN_RATE * dt; S.spinning = true; }
    else if (S.spinning && S.spin % 180 > 0.5) {         // let go: finish the half turn you started
      var to = Math.ceil(S.spin / 180 - 1e-6) * 180;
      S.spin = Math.min(to, S.spin + FINISH_RATE * dt);
    }
    if (S.airT >= S.air) land();
  }

  // things on the slope
  for (i = 0; i < S.obs.length; i++) {
    o = S.obs[i];
    if (o.y < S.d - 40) continue;
    if (o.y > S.d + 40) break;
    if (o.gone) continue;
    var dy = o.y - S.d, dx = o.x - S.x;
    if (o.t === "gate") {
      if (!o.done && dy < 0) {
        o.done = true; S.gatesTotal++;
        if (Math.abs(dx) < o.half + 2) { S.gates++; S.score += 100; Shell.flash("GATE", "+100", "#3ff0ff", 600); Shell.sfx("score"); if (S.xt) S.xt.fever.hit("Faster board, magnet discs"); ledGate(true); Snd.sfx("gate"); }
        else { Shell.flash("MISSED GATE", "", "#8e93a2", 600); if (S.xt) S.xt.fever.miss(); ledGate(false); }
      }
      continue;
    }
    if (Math.abs(dy) > o.r + GRAB_PAD || Math.abs(dx) > o.r + GRAB_PAD) continue;
    if (Math.hypot(dx, dy) > o.r + (o.t === "disc" || o.t === "ramp" || o.t === "rare" ? GRAB_PAD : HIT_PAD)) continue;
    if (o.t === "rare") { o.gone = true; extrasRare(o); continue; }
    if (o.t === "disc") {
      o.gone = true; S.discs++; S.score += 50;
      S.discRow = (S.discRow || 0) + 1;              // discs since the last wipeout, rewards.js pill every 10
      if (window.NPRewards && S.discRow % 10 === 0) NPRewards.streak(S.discRow, S.discRow + " DISCS, NO WIPEOUT");
      if (S.discRow % 10 === 0) ledPlay([ledMsg("cycle", S.discRow + " DISCS, NO WIPEOUT", 2.2)]);
      Shell.tone(1200 + (S.discs % 4) * 160, 0.06, "square", 0.18);
      sparkle(o.x, o.y);
      continue;
    }
    if (o.t === "ramp") {
      if (S.air <= 0 && S.crash <= 0) { o.gone = true; S.air = 0.8 + S.v / 450; S.airT = 0; S.spin = 0; S.spinning = false; S.jumps++; Shell.sfx("boost"); }
      continue;
    }
    if (S.air > 0 || S.crash > 0 || S.inv > 0) continue;
    crash(o);
  }

  if (S.d >= LEN && S.phase === "ride") {
    S.finished = true; S.phase = "done"; S.pt = 0;
    var bonus = Math.max(0, Math.round((106 - S.t) * 25));   // par moved with the lower speeds
    S.timeBonus = bonus; S.score += bonus;
    Shell.flash("BOTTOM OF MOUNT BACKLOG", "Time bonus +" + bonus, "#ffd23f", 1300);
    Shell.sfx("best"); Shell.sfx("crowd");
    ledPlay([ledMsg("flash", "BOTTOM OF MOUNT BACKLOG", 1.6), ledMsg("count", "TIME BONUS +", 1.4, { from: 0, value: bonus }),
             ledMsg("count", "SCORE", 2.4, { from: Math.max(0, S.score - bonus), value: S.score, keep: true })]);
    Snd.sfx("finish");
    if (window.Trophies) {
      Trophies.unlock("pdh-bottom");
      if (S.crashes === 0) Trophies.unlock("pdh-clean");
      if (S.gatesTotal > 0 && S.gates === S.gatesTotal) Trophies.unlock("pdh-gates");
    }
  }
}

function land() {
  var rot = S.spin % 360, off = Math.min(rot % 180, 180 - rot % 180);
  var halves = Math.round(S.spin / 180);
  S.air = 0;
  V.landT = 0.35;
  if (S.spin > 60 && off > LAND_TOL + 25) {
    crash(null, "Landed sideways. Should've bought the strategy guide.");
    return;
  }
  if (S.spin > 60 && off > LAND_TOL) {                  // sketchy: no points, loses speed, no wipeout
    S.v *= 0.6;
    Shell.flash("SKETCHY", "Barely stuck it. No trick points.", "#8e93a2", 800);
    if (S.xt) S.xt.fever.miss();
    Shell.noise(0.2, 0.4, 400, 0.8, 0, 0, "lowpass");
    if (window.Trophies) Trophies.unlock("pdh-air");
    V.sketchy = 0.8; ledPlay([ledMsg("blink", "SKETCHY", 1.6, { color: "violet" })]);
    landPuff(18);
    return;
  }
  var deg = halves * 180;
  if (deg >= 180) {
    var pts = halves * 150 + (halves >= 4 ? 300 : 0);
    S.tricks += pts; S.score += pts; S.bestSpin = Math.max(S.bestSpin, deg);
    Shell.flash(deg + "!", "+" + pts + " trick points", deg >= 720 ? "#ffd23f" : "#9bff3f", 900);
    Shell.sfx("score");
    if (window.Trophies) { if (deg >= 360) Trophies.unlock("pdh-360"); if (deg >= 720) Trophies.unlock("pdh-720"); }
    ledPlay([ledMsg(deg >= 720 ? "flash" : "slide", deg + "!", 1.5, { color: "lime" }), ledMsg("count", "SCORE", 1.8, { from: S.score - pts, value: S.score, keep: true })]);
    Snd.sfx(deg >= 720 ? "bigtrick" : "trick");
  } else {
    S.tricks += 25; S.score += 25;
    Shell.flash("AIR", "+25", "#3ff0ff", 600);
    ledPlay([ledMsg("slide", "AIR +25", 1.4, { color: "cyan" })]);
  }
  if (window.Trophies) Trophies.unlock("pdh-air");
  if (S.xt) S.xt.fever.hit("Faster board, magnet discs");
  Shell.noise(0.12, 0.3, 500, 0.8, 0, 0, "lowpass");
  landPuff(26);
}

function crash(o, line) {
  S.crashes++; S.crash = 1.0; S.vx = 0; S.air = 0; S.discRow = 0;
  if (S.xt) S.xt.fever.miss();
  if (o && (o.t === "box" || o.t === "cases")) { o.gone = true; debris(o); }
  Shell.flash("WIPEOUT", line || "Should've bought the strategy guide.", "#ff4b3e", 1000);
  Shell.sfx("hit"); Shell.noise(0.4, 0.5, 300, 0.6, 0, 120); Shell.shake(4, 0.3);
  if (window.Trophies) Trophies.unlock("pdh-guide");
  snowBurst(S.x, S.d, 26);
  camShake(6, 0.35); Snd.sfx("wipe");
  const left = CRASHES - S.crashes;
  ledPlay([ledMsg("blink", "WIPEOUT", 1.4, { color: "red" }),
           ledMsg("slide", left > 0 ? left + (left === 1 ? " BOARD LEFT" : " BOARDS LEFT") : "OUT OF BOARDS", 1.6, { color: left > 0 ? "amber" : "red" })]);
  if (S.crashes >= CRASHES) { S.phase = "done"; S.pt = 0; }
}

/* ---------------- Batch 3 extras (the 2D game's, untouched) ---------------- */
function speedMult() {
  if (!S.xt) return 1;
  var id = S.xt.sc.id, m = id === "sun" || id === "suburbs" ? 1.08 : id === "rain" ? 0.92 : id === "golden" ? 0.95 : 1;
  if (S.xt.fever.active()) m *= 1.25;
  if (S.xt.boostT > 0) m *= 1.3;
  return m;
}
function rareMult() { var sc = S.xt.sc.id; return (sc === "suburbs" ? 3 : sc === "fog" ? 1.5 : 1) * (S.xt.fever.active() ? 2 : 1); }
function addObj(o) { var i = 0; while (i < S.obs.length && S.obs[i].y < o.y) i++; S.obs.splice(i, 0, o); }
function freeX(y) { for (var tries = 0; tries < 20; tries++) { var x = 40 + Math.random() * 280, ok = true; for (var i = 0; i < S.obs.length; i++) { var o = S.obs[i]; if (Math.abs(o.y - y) < 40 && Math.abs(o.x - x) < 36) { ok = false; break; } } if (ok) return x; } return 180; }
function spawnRare(ahead) { var y = S.d + (ahead || 560); addObj({ t: "rare", x: freeX(y), y: y, r: 12, tier: X.rollRare(rareMult()) }); }
function extrasRare(o) {
  var fake = S.xt.sc.id === "twilight" && X.coin(0.35), pts = X.collect(o.tier, fake);
  if (!fake) { S.xt.rares++; S.score += pts * 100; ledPlay([ledMsg("cycle", "RARE FIND!", 1.8)]); Snd.sfx("rare"); }
  sparkle(o.x, o.y);
}
var EVENTS = [
  { title: "Wind Gust", text: "A ski rental tent is blowing over beside the trail.",
    a: { label: "Hold it up", run: function () { var it = X.RARES.filter(function (r) { return r.t === "uncommon"; }); it = X.pick(it); X.collect(it, false); S.xt.rares++; return "The owner thanks you with a bonus cart: " + it.n + "."; } },
    b: { label: "Keep riding", run: function () { return "Somebody else will get it."; } } },
  { title: "Sun Glare", text: "You can't read the trail sign through the glare.",
    a: { label: "Squint", run: function () { if (X.coin(0.5)) { spawnRare(500); return "It points to a stash. Something shiny is just ahead."; } S.xt.slowSteer = 4; return "Headache. Your steering is sluggish for a few seconds."; } },
    b: { label: "Ignore it", run: function () { return "Probably just says SLOW."; } } },
  { title: "Heavy Traffic", text: "A ski school parade is blocking the main run.",
    a: { label: "Take the side trail", run: function () { if (X.coin(0.5)) { S.d = Math.min(LEN - 200, S.d + 500); return "Shortcut! You skip ahead."; } S.v *= 0.5; return "Rough trail. You lose a lot of speed."; } },
    b: { label: "Wait", run: function () { return "The kids wave as they pass."; } } },
  { title: "Powder Dust", text: "A gust of powder hits you and you start sneezing.",
    a: { label: "Wipe your eyes", run: function () { S.v *= 0.6; var y = S.d + 420, x = freeX(y); for (var i = 0; i < 6; i++) addObj({ t: "disc", x: x, y: y + i * 30, r: 7 }); return "You slow down, but spot a hidden stack of discs ahead."; } },
    b: { label: "Push through", run: function () { return "Achoo. Onward."; } } },
  { title: "Cash Only", text: "The express lane attendant only takes cash. The machine is broken.",
    a: { label: "Run for cash", run: function () { S.v *= 0.7; S.xt.boostT = 4; return "You lose a step, then the express lane sends you flying."; } },
    b: { label: "Skip it", run: function () { return "Regular lane it is."; } } }
];
function extrasTick(dt) {
  var x = S.xt;
  if (!x.intro) { x.intro = true; Shell.flash(x.sc.name, x.sc.line, "#9bff3f", 1500); }
  x.fever.tick(dt);
  if (x.slowSteer > 0) x.slowSteer -= dt;
  if (x.boostT > 0) x.boostT -= dt;
  if (S.phase === "ride" && S.air <= 0 && S.crash <= 0 && S.d > 600 && S.d < LEN - 1200 && x.sched.due(S.t)) X.startEvent(X.pick(EVENTS));
  if (S.phase === "ride" && S.d < LEN - 900 && Math.random() < dt * 0.045 * rareMult()) spawnRare();
  if (x.fever.active()) {   // discs drift toward you
    for (var i = 0; i < S.obs.length; i++) { var o = S.obs[i]; if (o.y > S.d + 140) break; if (o.t === "disc" && !o.gone && o.y > S.d - 10 && Math.abs(o.x - S.x0x) < 90) o.x += (S.x0x - o.x) * Math.min(1, dt * 4); }
  }
  // presentation: the board calls out a fresh hot streak
  const hot = x.fever.active();
  if (hot && !V.hotWas) { ledPlay([ledMsg("cycle", "HOT STREAK", 2)]); Snd.sfx("hot"); }
  V.hotWas = hot;
}

function finish() {
  ledFinal(S.score);
  Shell.gameOver(S.score, { title: S.finished ? "MADE THE BOTTOM" : "WIPED OUT", html:
    row("Discs", S.discs + " x 50") + row("Trick points", S.tricks) + row("Gates", S.gates + " of " + S.gatesTotal) +
    row("Time bonus", S.finished ? S.timeBonus : "Finish to earn it") + row("Wipeouts", S.crashes + " of " + CRASHES) +
    (S.xt ? row("Scenery", S.xt.sc.name) + row("Rare finds", S.xt.rares + " this run, " + X.foundCount() + " of " + X.RARES.length + " found") + row("Hot Streaks", S.xt.fever.count) : ""),
    stats: { score: S.score, discs: S.discs, tricks: S.tricks, bestSpin: S.bestSpin, crashes: S.crashes, finished: S.finished, gates: S.gates, gatesTotal: S.gatesTotal, time: Math.round(S.t) } });
}
function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

/* ---------------- Input ---------------- */
// Mouse: the rider carves toward the cursor (no click needed). Touch: put a finger down anywhere and
// slide it; the rider follows the finger's left/right position. In the air, a press anywhere (or the
// SPIN button, or a second finger) spins. Letting go of the screen on touch stops steering.
// The 2D game read the pointer's x straight off the screen; here it is read through the 3D camera at
// the rider's distance (screenToCourseX), so the point under the finger is the point the rider heads for.
function inBtn(x, y) { return x >= BTN.x && x <= BTN.x + BTN.w && y >= BTN.y && y <= BTN.y + BTN.h; }
function pointer(type, sx, y, e) {
  if (X && X.eventActive()) { S.tx = null; S.holdSpin = false; S.spinIds = {}; X.eventPointer(type, sx, y); return; }
  var x = screenToCourseX(sx);
  var touch = e && e.pointerType && e.pointerType !== "mouse";
  if (type === "down") {
    S.ptrId = e ? e.pointerId : null;
    Snd.unlock();
    if (S.air > 0) { S.holdSpin = true; return; }   // in the air: press anywhere (SPIN button included) to spin
    S.tx = clamp(x, 14, W - 14); S.ptrSteer = 1;
  } else if (type === "move") {
    if (!touch || S.ptrSteer) S.tx = clamp(x, 14, W - 14);
  } else if (type === "up" || type === "cancel") {
    S.holdSpin = false; S.ptrSteer = 0; S.ptrId = null;
    if (touch) S.tx = null;
  }
}
// Extra fingers (the shell only tracks one pointer): a second finger held down spins.
function bindExtraTouch() {
  var cv = document.getElementById("np-canvas");
  if (!cv) return;
  cv.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse" || S.ptrId == null || e.pointerId === S.ptrId) return;
    if (Shell.state() !== "playing" || (X && X.eventActive())) return;
    S.spinIds[e.pointerId] = true;
  });
  function lift(e) { if (S.spinIds && S.spinIds[e.pointerId]) delete S.spinIds[e.pointerId]; }
  cv.addEventListener("pointerup", lift); cv.addEventListener("pointercancel", lift);
}
function key(type, code) {
  if (X && X.eventActive()) { for (var kk in keys) keys[kk] = false; X.eventKey(type, code); return; }
  keys[code] = type === "down";
  if (type === "down" && (code === "ArrowLeft" || code === "ArrowRight" || code === "KeyA" || code === "KeyD")) S.tx = null;
}
// True when starting another half turn would not finish before the landing.
function letGo() {
  var left = S.air - S.airT, part = S.spin % 180, need = (180 - part) / FINISH_RATE;
  return left < need + 180 / SPIN_RATE + 0.05;
}

/* ---------------- Particles: snow, sparkle, cardboard (presentation only, drawn on the HUD through the camera) ---------------- */
// Each particle lives on the mountain: x across the run, d down it, h above the snow.
function partsTick(dt) {
  const P = V.parts;
  for (let i = P.length - 1; i >= 0; i--) {
    const q = P[i];
    q.life -= dt; q.x += q.vx * dt; q.d += q.vd * dt; q.h += q.vh * dt; q.vh -= q.g * dt;
    if (q.h < 0) { q.h = 0; q.vh *= -0.25; q.vx *= 0.6; q.vd *= 0.6; }
    if (q.life <= 0) P.splice(i, 1);
  }
  for (let i = V.pops.length - 1; i >= 0; i--) { V.pops[i].t += dt; if (V.pops[i].t > 0.9) V.pops.splice(i, 1); }
}
function puff(x, d, h, n, spread, up, cols, life, g, size) {
  if (Shell.reduced) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = spread * (0.3 + Math.random() * 0.7);
    V.parts.push({ x: x, d: d, h: h, vx: Math.cos(a) * s, vd: Math.sin(a) * s + S.v * 0.6, vh: up * (0.4 + Math.random() * 0.8),
                   life: life * (0.6 + Math.random() * 0.6), max: life, g: g, c: cols[i % cols.length], s: size * (0.6 + Math.random() * 0.8) });
  }
}
function sparkle(x, d) {
  if (Shell.reduced) return;
  puff(x, d, 14, 10, 70, 60, ["#3ff0ff", "#ffd23f", "#ffffff", "#ff3fa4"], 0.45, 60, 3);
  V.pops.push({ x: x, d: d, t: 0, txt: "+50" });
}
function snowBurst(x, d, n) { puff(x, d, 6, n, 120, 150, ["#ffffff", "#eaf3ff", "#cfe2f7"], 0.8, 380, 4.5); }
function landPuff(n) { puff(S.x, S.d, 2, n, 90, 70, ["#ffffff", "#e3eefb"], 0.5, 260, 4); }
function debris(o) { puff(o.x, o.y, 10, 18, 110, 170, o.t === "box" ? ["#c08a52", "#e2c391", "#8a5a2e"] : ["#ffffff", "#2f6bff", "#ff3fa4", "#16171d"], 0.9, 420, 4); }

/* ---------------- Music ----------------
   All of the music lives in this one function. It is an original sixteen-bar loop in G (a bright lead, a bouncing
   bass, an arpeggio, sleigh-bell hats and drums), made entirely in code with the Web Audio API: no audio files.
   It knows nothing about the game. Give it an audio context and a node to play into, and it loops until the
   function it returns is called. */
function startMusic(ctx, dest) {
  const BPM = 138, STEP = 60 / BPM / 4, STEPS = 256, AHEAD = 0.5, VOL = 0.17;
  const NOTE = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
  // bass note, then the three notes the arpeggio walks (MIDI numbers)
  const CH = { G: [43, 55, 59, 62], D: [38, 50, 54, 57], Em: [40, 52, 55, 59], C: [36, 48, 52, 55], Am: [45, 57, 60, 64] };
  // one chord a bar
  const PROG = "G D Em C G D C D Em C G D Em C Am D".split(" ");
  // the tune, a bar a line: step in the bar, note, length in steps
  const BARS = [
    "0B4-2 2D5-2 4G5-3 7F#5-1 8G5-2 10A5-2 12B5-4",
    "0A5-2 2F#5-2 4D5-3 7E5-1 8F#5-2 10A5-2 12D6-4",
    "0B5-3 3A5-1 4G5-2 6E5-2 8G5-2 10B5-2 12E6-3 15D6-1",
    "0C6-2 2B5-2 4G5-2 6E5-2 8G5-4 12A5-4",
    "0B4-2 2D5-2 4G5-3 7A5-1 8B5-2 10D6-2 12B5-4",
    "0A5-2 2D6-2 4F#5-3 7A5-1 8D6-2 10E6-2 12F#6-4",
    "0E6-3 3D6-1 4C6-2 6B5-2 8G5-2 10E5-2 12G5-2 14C6-2",
    "0B5-2 2A5-2 4F#5-2 6D5-2 8A5-3 11F#5-1 12D5-4",
    "0E5-4 4G5-2 6B5-2 8E6-4 12D6-2 14B5-2",
    "0C6-4 4B5-2 6G5-2 8E5-4 12G5-4",
    "0D5-2 2G5-2 4B5-2 6D6-2 8G6-3 11F#6-1 12D6-4",
    "0F#6-2 2E6-2 4D6-2 6A5-2 8F#5-4 12A5-4",
    "0G5-2 2F#5-2 4E5-2 6G5-2 8B5-3 11A5-1 12G5-4",
    "0E5-2 2G5-2 4C6-4 8B5-2 10G5-2 12E5-4",
    "0A5-2 2C6-2 4E6-3 7D6-1 8C6-2 10B5-2 12A5-4",
    "0D6-2 3D6-1 4E6-2 6F#6-2 8A6-3 11F#6-1 12D6-2 14A5-2"
  ];
  const LEAD = new Array(STEPS).fill(null);
  BARS.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G]#?)(\d)-(\d+)$/.exec(tok);
      if (m) LEAD[b * 16 + Number(m[1])] = [12 * (Number(m[3]) + 1) + NOTE[m[2]], Number(m[4])];
    });
  });
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // the mixing desk: everything goes through one fader so stopping is a quick fade, never a click
  const out = ctx.createGain(); out.gain.value = 0; out.connect(dest);
  out.gain.setTargetAtTime(VOL, ctx.currentTime + 0.02, 0.05);
  function lp(f, q, to) { const n = ctx.createBiquadFilter(); n.type = "lowpass"; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const leadBus = lp(3600, 0.7, out), bassBus = lp(950, 1.1, out);
  const send = ctx.createGain(), echo = ctx.createDelay(1), back = ctx.createGain(), damp = lp(2600, 0.7, out);
  send.gain.value = 0.28; echo.delayTime.value = STEP * 3; back.gain.value = 0.3;   // a dotted-eighth echo on the lead
  leadBus.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(damp);
  const len = Math.floor(ctx.sampleRate * 1.5), noise = ctx.createBuffer(1, len, ctx.sampleRate), nd = noise.getChannelData(0);
  let seed = 0x1234567;
  for (let i = 0; i < len; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; nd[i] = ((seed >>> 0) / 4294967296) * 2 - 1; }

  function tone(to, type, f0, t, dur, vol, f1, hold, vib) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.01, dur * (hold == null ? 0.6 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (vib && dur > 0.25) {                                  // a little vibrato on long lead notes
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f0 * 0.012, t + dur * 0.6);
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(t, dur, vol, type, f, q) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true;
    fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out);
    s.start(t, (t * 7.31) % 1); s.stop(t + dur + 0.05);
  }
  function play(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[bar]], n = LEAD[i], b = bar >= 8;
    if (n) tone(leadBus, "square", hz(n[0]), t, n[1] * STEP * 0.95, 0.16, 0, 0.55, true);
    if (!(s & 1)) {                                           // eighths: octave-bounce bass, a walking arpeggio, sleigh-bell hats
      const k = s >> 1;
      tone(bassBus, "sawtooth", hz(ch[0] + (k & 1 ? 12 : 0) + (k === 7 ? 7 : 0)), t, STEP * 1.7, 0.24);
      tone(out, "triangle", hz(ch[1 + [0, 1, 2, 1][k & 3]] + 12 + (b ? 12 : 0)), t, STEP * 1.4, 0.07);
      hiss(t, s % 4 === 2 ? 0.09 : 0.035, s % 4 === 2 ? 0.09 : 0.045, "highpass", 7600, 0.7);
      if (s % 4 === 2) { hiss(t + STEP * 0.33, 0.03, 0.035, "bandpass", 9500, 3); hiss(t + STEP * 0.66, 0.03, 0.03, "bandpass", 9000, 3); }
    }
    const fill = bar === 7 ? s >= 12 : bar === 15 ? s >= 8 && (s % 2 === 0 || s >= 12) : false;
    if (fill || s === 4 || s === 12) {                        // snare, with a roll into each half
      const v = fill ? 0.55 + 0.45 * (s - 8) / 7 : 1;
      hiss(t, 0.14, 0.26 * v, "bandpass", 1800, 0.6);
      tone(out, "triangle", 210, t, 0.07, 0.16 * v, 140, 0.1);
    }
    if (s === 0 || s === 8 || (b ? s === 10 || s === 14 : s === 10)) tone(out, "sine", 150, t, 0.18, 0.55, 44, 0.08);   // kick
  }

  let step = 0, next = ctx.currentTime + 0.06, stopped = false;
  function pump() {
    if (stopped) return;
    const now = ctx.currentTime;
    if (next < now) next = now + 0.03;                        // after a stall: pick the beat back up, never a burst
    while (next < now + AHEAD) { play(step, next); step = (step + 1) % STEPS; next += STEP; }
  }
  pump();
  const timer = setInterval(pump, 90);
  return function stop() {
    if (stopped) return;
    stopped = true; clearInterval(timer);
    const now = ctx.currentTime;
    out.gain.cancelScheduledValues(now); out.gain.setTargetAtTime(0, now, 0.05);
    setTimeout(function () { try { out.disconnect(); } catch (e) { /* already gone */ } }, 600);
  };
}

/* ---------------- Sound: the music bus and a few stingers of the game's own ----------------
   The shell still plays every sound effect the 2D game had, exactly when it did. On top of that this adds a handful
   of stingers for the big moments and runs the music. Nothing is made until the first tap, click or key press. The
   shell's mute button (its "npArcade.muted" setting) silences all of it, and the MUSIC button (and the N key) turns
   the music on and off, remembered as "npArcade.music". */
const MUSIC_KEY = "npArcade.music", SFX_VOL = 0.22;
const Snd = (function () {
  let ctx = null, out = null, bus = null, sfxBus = null, dead = false, muted = false, stopMusic = null, startAt = 0;
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
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        ctx = new AC();
        out = ctx.createGain();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
        out.connect(comp); comp.connect(ctx.destination);
        bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
        sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_VOL; sfxBus.connect(out);
        muted = shellMuted(); out.gain.value = muted ? 0 : 1;
        setInterval(pump, 150);                               // keeps the music fed if the picture ever stalls
      }
      if (ctx.state !== "running") { const p = ctx.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { ctx = null; dead = true; }
  }
  // Called every frame: follow the mute button, and start or stop the music with the game.
  function pump() {
    if (!ctx || !window.Shell) return;
    const now = ctx.currentTime, m = shellMuted(), st = Shell.state();
    if (m !== muted) { muted = m; out.gain.setTargetAtTime(m ? 0 : 1, now, 0.02); }
    const want = musicOn && !muted && ctx.state === "running" && (st === "playing" || st === "paused") && now >= startAt;
    if (want && !stopMusic) stopMusic = startMusic(ctx, bus);
    else if (!want && stopMusic && now >= startAt) { stopMusic(); stopMusic = null; }
    if (stopMusic) bus.gain.setTargetAtTime(st === "playing" ? 1 : 0.25, now, 0.08);   // a paused game keeps it low
  }
  function note(type, f0, t, dur, vol, f1, hold) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, t + dur * (hold == null ? 0.4 : hold)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function cue(name, t) {
    if (name === "gate") { note("triangle", hz(88), t, 0.18, 0.3); note("triangle", hz(93), t + 0.07, 0.3, 0.26); }
    else if (name === "trick") { [79, 83, 86, 91].forEach(function (m, i) { note("square", hz(m), t + i * 0.06, 0.12, 0.2, 0, 0.5); }); }
    else if (name === "bigtrick") {
      [79, 83, 86, 91, 95, 98].forEach(function (m, i) { note("square", hz(m), t + i * 0.055, 0.12, 0.2, 0, 0.5); });
      [91, 95, 98].forEach(function (m) { note("triangle", hz(m), t + 0.36, 0.6, 0.16, 0, 0.3); });
    } else if (name === "finish") {
      [67, 71, 74, 79, 83, 86].forEach(function (m, i) { note("square", hz(m), t + i * 0.08, 0.14, 0.2, 0, 0.5); });
      [79, 83, 86, 91].forEach(function (m) { note("triangle", hz(m), t + 0.5, 0.9, 0.14, 0, 0.4); });
    } else if (name === "rare") { for (let i = 0; i < 6; i++) note("sine", hz(96 + (i % 3) * 3), t + i * 0.05, 0.12, 0.16, 0, 0.3); }
    else if (name === "hot") { note("square", 330, t, 0.35, 0.18, 1320, 0.85); note("square", 1320, t + 0.36, 0.14, 0.18, 0, 0.5); }
    else if (name === "wipe") { note("sine", 140, t, 0.3, 0.6, 45, 0.05); note("triangle", 300, t + 0.02, 0.4, 0.2, 90, 0.3); }
  }
  function sfx(name) {
    if (!ctx || muted || ctx.state !== "running") return;
    try { cue(name, ctx.currentTime + 0.01); } catch (e) { /* sound is never worth a crash */ }
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
  return {
    unlock: unlock, pump: pump, sfx: sfx, button: button,
    // a fresh run starts the loop from the top, just after the shell's start jingle
    newGame: function () { unlock(); if (stopMusic) { stopMusic(); stopMusic = null; } if (ctx) startAt = ctx.currentTime + 0.42; pump(); },
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    peek: function () { return { made: !!ctx, state: ctx ? ctx.state : "none", playing: !!stopMusic, muted: muted, musicOn: musicOn }; }
  };
})();

/* =====================================================================================
   3D presentation
   ===================================================================================== */

/* ---------------- Small helpers ---------------- */
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function prng(seed) {
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
function boldText(g, str, x, y, size, fill, stroke, sw, maxW, face) {
  face = face || '"Arial Black", "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
  g.font = "900 " + size + "px " + face;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + face; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  if (stroke) { g.lineWidth = sw || size * 0.2; g.strokeStyle = stroke; g.strokeText(str, x, y); }
  g.fillStyle = fill; g.fillText(str, x, y);
}

/* ---------------- Painted textures (all drawn here, no image files besides the two logos) ---------------- */

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every sign on the mountain uses this
// (the full logo with the mascot is kept for the loading screen, the title card and the score card).
// If the PNG is missing, plain lettering stands in.
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

// Groomed snow: corduroy ridges running across the run, a little sparkle. One tile is 96 x 96 course units.
function snowCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = prng(3);
  g.fillStyle = "#f2f6fb"; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) {
    g.fillStyle = "rgba(170,195,225,.30)"; g.fillRect(0, y, 256, 2);
    g.fillStyle = "rgba(255,255,255,.75)"; g.fillRect(0, y + 3, 256, 2);
  }
  speckle(g, 256, 256, 1800, rnd, "rgba(255,255,255,.9)", "rgba(150,180,215,.18)");
  for (let i = 0; i < 90; i++) { g.fillStyle = "rgba(140,220,255," + (0.35 + rnd() * 0.5) + ")"; g.fillRect(rnd() * 256, rnd() * 256, 1, 1); }
  return c;
}
// The sky, painted for the batch 3 scenery when there is one.
const SKIES = {
  day: ["#2a6fe0", "#5aa8ff", "#bfe2ff", "#eef8ff"], sun: ["#1f63e0", "#4fa3ff", "#bde4ff", "#fff6dc"],
  golden: ["#3a4fb8", "#e08a5a", "#ffc27a", "#ffe9c4"], twilight: ["#120c3c", "#46307e", "#c0569a", "#ffb08a"],
  fog: ["#9fb2c8", "#c3d0de", "#dfe6ee", "#eef2f6"], rain: ["#4c5d78", "#6f819c", "#a3b2c4", "#cfd7e1"],
  suburbs: ["#2a6fe0", "#5aa8ff", "#c6e6ff", "#f2fbff"]
};
function skyKey() { const id = S.xt && S.xt.sc ? S.xt.sc.id : "day"; return SKIES[id] ? id : "day"; }
function paintSky(g, id) {
  const k = SKIES[id] || SKIES.day, gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, k[0]); gr.addColorStop(0.42, k[1]); gr.addColorStop(0.5, k[2]); gr.addColorStop(0.56, k[3]); gr.addColorStop(1, k[3]);
  g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  if (id === "sun" || id === "day" || id === "suburbs" || id === "golden") {
    const sx = 330, sy = 70, sg = g.createRadialGradient(sx, sy, 0, sx, sy, 70);
    sg.addColorStop(0, "rgba(255,255,240,1)"); sg.addColorStop(0.15, "rgba(255,250,220,.95)"); sg.addColorStop(1, "rgba(255,250,220,0)");
    g.fillStyle = sg; g.fillRect(sx - 70, sy - 70, 140, 140);
  }
  if (id === "twilight") { const rnd = prng(9); for (let i = 0; i < 70; i++) { g.fillStyle = "rgba(255,255,255," + (0.3 + rnd() * 0.6) + ")"; g.fillRect(rnd() * 512, rnd() * 90, 1.2, 1.2); } }
}
// Far mountain ranges all the way round, three layers. Seamless left to right.
function rangesCanvas() {
  const Wc = 2048, Hc = 256, c = mkCanvas(Wc, Hc), g = c.getContext("2d");
  function tri(u) { const f = u - Math.floor(u); return 1 - Math.abs(f - 0.5) * 2; }   // a sharp peak every whole number
  function ridge(base, amp, fr, ph, col, capCol, capK) {
    const ys = [];
    for (let x = 0; x <= Wc; x += 4) {
      const u = x / Wc;
      ys.push(base - amp * (0.6 * Math.pow(tri(u * fr[0] + ph), 1.6) + 0.28 * tri(u * fr[1] + ph * 1.7) + 0.12 * tri(u * fr[2] + ph * 2.3)));
    }
    g.fillStyle = col; g.beginPath(); g.moveTo(0, Hc);
    for (let i = 0; i < ys.length; i++) g.lineTo(i * 4, ys[i]);
    g.lineTo(Wc, Hc); g.closePath(); g.fill();
    if (capCol) {                                            // snow on the high ground, with ragged edges
      g.save(); g.beginPath(); g.moveTo(0, Hc);
      for (let i = 0; i < ys.length; i++) g.lineTo(i * 4, ys[i]);
      g.lineTo(Wc, Hc); g.closePath(); g.clip();
      g.fillStyle = capCol; g.beginPath(); g.moveTo(0, Hc);
      const line = base - amp * capK;
      for (let i = 0; i < ys.length; i++) g.lineTo(i * 4, line + Math.sin(i * 1.7) * 5 + Math.sin(i * 0.31) * 9);
      g.lineTo(Wc, 0); g.lineTo(0, 0); g.closePath(); g.fill();
      g.restore();
    }
  }
  ridge(214, 170, [5, 13, 29], 0.13, "#7d95bd", "#f4f8ff", 0.5);
  ridge(232, 120, [7, 17, 37], 0.41, "#5d78a8", "#e6effb", 0.62);
  ridge(250, 70, [11, 23, 47], 0.77, "#3c5888", null, 0);
  return c;
}

// A long blue banner: the wordmark on the left, candy lettering on the right.
function bannerCanvas(script, words) {
  const c = mkCanvas(1024, 256), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 256);
  const gl = g.createLinearGradient(0, 0, 0, 120);
  gl.addColorStop(0, "rgba(255,255,255,.4)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.beginPath(); g.ellipse(512, -20, 620, 140, 0, 0, TAU); g.fill();
  g.lineWidth = 14; g.strokeStyle = "#ff9214"; g.strokeRect(7, 7, 1010, 242);
  g.lineWidth = 4; g.strokeStyle = "#ffe45c"; g.strokeRect(17, 17, 990, 222);
  drawScript(g, script, 270, 128, 450, 196);
  if (words.length === 1) candyText(g, words[0], 760, 128, 92, 440);
  else { candyText(g, words[0], 760, 88, 68, 440); candyText(g, words[1], 760, 172, 68, 440); }
  return c;
}
// A slalom panel: red or blue, the wordmark across it.
function panelCanvas(script, col, col2) {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, col); bg.addColorStop(1, col2);
  g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 256, 14); g.fillRect(0, 242, 256, 14);
  rrectPath(g, 16, 70, 224, 116, 18); g.fillStyle = "rgba(4,16,60,.55)"; g.fill();
  drawScript(g, script, 128, 128, 214, 104);
  return c;
}
// A cardboard lot box: kraft brown, packing tape, LOT stenciled on every side.
function boxCanvas(script) {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = prng(19);
  g.fillStyle = "#c4904f"; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 2400, rnd, "rgba(255,230,190,.12)", "rgba(90,50,15,.14)");
  for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(110,66,24,.10)"; g.fillRect(0, rnd() * 256, 256, 2 + rnd() * 3); }
  g.fillStyle = "rgba(235,210,160,.75)"; g.fillRect(104, 0, 48, 256);          // tape
  g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(108, 0, 8, 256);
  boldText(g, "LOT", 128, 118, 116, "#24140a", null, 0, 220, '"Courier New", Courier, monospace');
  g.fillStyle = "#24140a"; g.fillRect(36, 180, 184, 6);
  boldText(g, "MIXED GAMES", 128, 206, 24, "#24140a", null, 0, 200, '"Courier New", Courier, monospace');
  rrectPath(g, 156, 18, 86, 40, 8); g.fillStyle = "#f6e8c8"; g.fill();       // a wordmark sticker
  drawScript(g, script, 199, 38, 78, 34);
  return c;
}
// The cover of a game case. The game on it is made up for the mountain.
function caseCanvas(script) {
  const c = mkCanvas(256, 320), g = c.getContext("2d");
  g.fillStyle = "#101219"; g.fillRect(0, 0, 256, 320);
  const sk = g.createLinearGradient(0, 40, 0, 300);
  sk.addColorStop(0, "#ff4fa0"); sk.addColorStop(0.5, "#ffa13d"); sk.addColorStop(1, "#ffe45c");
  g.fillStyle = sk; g.fillRect(10, 40, 236, 270);
  g.fillStyle = "#ffffff"; g.beginPath(); g.arc(186, 120, 34, 0, TAU); g.fill();
  g.fillStyle = "#3b2a7a"; g.beginPath(); g.moveTo(10, 310); g.lineTo(90, 170); g.lineTo(140, 230); g.lineTo(190, 150); g.lineTo(246, 240); g.lineTo(246, 310); g.closePath(); g.fill();
  g.fillStyle = "#ffffff"; g.beginPath(); g.moveTo(70, 205); g.lineTo(90, 170); g.lineTo(108, 197); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(172, 178); g.lineTo(190, 150); g.lineTo(208, 180); g.closePath(); g.fill();
  g.fillStyle = "#2f6bff"; g.fillRect(0, 0, 256, 40);
  drawScript(g, script, 72, 20, 120, 34);
  boldText(g, "SNOW DAY", 128, 262, 44, "#ffffff", "#101219", 9, 224);
  boldText(g, "'94", 128, 296, 30, "#ffe45c", "#101219", 7, 120);
  return c;
}
// A loose disc: the shiny side, a rainbow sheen, the hub.
function discCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  g.fillStyle = "#cfd8e4"; g.beginPath(); g.arc(128, 128, 127, 0, TAU); g.fill();
  const cols = ["rgba(255,80,170,.55)", "rgba(255,200,60,.5)", "rgba(80,255,150,.45)", "rgba(60,200,255,.55)", "rgba(170,110,255,.5)"];
  for (let i = 0; i < 40; i++) {
    const a0 = i / 40 * TAU, a1 = (i + 1) / 40 * TAU;
    g.fillStyle = cols[i % cols.length]; g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 126, a0, a1); g.closePath(); g.fill();
  }
  const gl = g.createRadialGradient(100, 90, 4, 128, 128, 128);
  gl.addColorStop(0, "rgba(255,255,255,.75)"); gl.addColorStop(0.5, "rgba(255,255,255,.12)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.beginPath(); g.arc(128, 128, 127, 0, TAU); g.fill();
  g.fillStyle = "#eef3fa"; g.beginPath(); g.arc(128, 128, 44, 0, TAU); g.fill();
  g.strokeStyle = "rgba(120,140,170,.6)"; g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 44, 0, TAU); g.stroke();
  g.fillStyle = "#9aa6b8"; g.beginPath(); g.arc(128, 128, 15, 0, TAU); g.fill();
  g.strokeStyle = "#ffffff"; g.lineWidth = 4; g.beginPath(); g.arc(128, 128, 125, 0, TAU); g.stroke();
  return c;
}
// The face of a kicker: groomed snow, blue chevrons pointing down the hill, an orange lip.
function rampCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  g.fillStyle = "#e9f2fc"; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 6) { g.fillStyle = "rgba(160,190,225,.3)"; g.fillRect(0, y, 256, 2); }
  g.lineWidth = 14; g.strokeStyle = "#2f6bff"; g.lineJoin = "miter";
  for (let k = 0; k < 3; k++) { const y = 70 + k * 56; g.beginPath(); g.moveTo(54, y + 34); g.lineTo(128, y); g.lineTo(202, y + 34); g.stroke(); }
  g.fillStyle = "#ff9214"; g.fillRect(0, 0, 256, 22);
  g.fillStyle = "#ffe45c"; g.fillRect(0, 22, 256, 5);
  return c;
}

// A jacket, wrapped once around the body: u = 0 is the chest (the zipper), u = .5 is the back.
// o: { base, panel, trim, chest, back, backSub, badge, zigzag }
function jacketCanvas(script, o) {
  const c = mkCanvas(1024, 512), g = c.getContext("2d");
  g.fillStyle = o.base; g.fillRect(0, 0, 1024, 512);
  // color blocking across the shoulders (90s cut) and a zigzag band
  g.fillStyle = o.panel; g.fillRect(0, 0, 1024, 170);
  if (o.zigzag) {
    g.fillStyle = o.trim; g.beginPath(); g.moveTo(0, 170);
    for (let x = 0; x <= 1024; x += 32) g.lineTo(x, x % 64 ? 196 : 158);
    g.lineTo(1024, 210); g.lineTo(0, 210); g.closePath(); g.fill();
  } else { g.fillStyle = o.trim; g.fillRect(0, 168, 1024, 18); }
  // hem band
  g.fillStyle = o.trim; g.fillRect(0, 470, 1024, 42);
  // folds: soft creases pulling from the arms and gathering at the waist
  const rnd = prng(o.seed || 7);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * 1024, y = 210 + rnd() * 240, l = 30 + rnd() * 60, a = -0.7 + rnd() * 1.4;
    g.strokeStyle = "rgba(0,0,30," + (0.1 + rnd() * 0.1) + ")"; g.lineWidth = 3 + rnd() * 4; g.lineCap = "round";
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 10, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    g.strokeStyle = "rgba(255,255,255,.12)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x + 3, y - 3); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 13, y + Math.sin(a) * l * 0.5 - 3, x + Math.cos(a) * l + 3, y + Math.sin(a) * l - 3); g.stroke();
  }
  const sh = g.createLinearGradient(0, 0, 0, 512);
  sh.addColorStop(0, "rgba(255,255,255,.14)"); sh.addColorStop(0.6, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,40,.22)");
  g.fillStyle = sh; g.fillRect(0, 0, 1024, 512);
  // zipper down the front (u = 0 wraps to both edges)
  [0, 1024].forEach(function (x) {
    g.fillStyle = "#1a1c24"; g.fillRect(x - 7, 120, 14, 360);
    for (let y = 124; y < 476; y += 8) { g.fillStyle = "#c8ccd6"; g.fillRect(x - 5, y, 10, 3); }
  });
  // chest badge, either side of the zipper
  if (o.chest) {
    [100, 1024 - 100].forEach(function (x) {
      rrectPath(g, x - 62, 236, 124, 74, 14); g.fillStyle = o.badge || "#ffe45c"; g.fill();
      g.lineWidth = 5; g.strokeStyle = "#08205f"; g.stroke();
      boldText(g, o.chest, x, 274, 50, "#08205f", null, 0, 108);
    });
  }
  // the back: a big readable patch, then a line under it
  rrectPath(g, 512 - 170, 214, 340, 170, 26); g.fillStyle = o.badge || "#ffe45c"; g.fill();
  g.lineWidth = 9; g.strokeStyle = "#08205f"; g.stroke();
  boldText(g, o.back, 512, 284, 112, "#08205f", "#ffffff", 12, 300);
  if (o.backSub) boldText(g, o.backSub, 512, 356, 36, "#ff3fa4", "#08205f", 8, 300);
  if (o.script) { rrectPath(g, 512 - 150, 398, 300, 64, 14); g.fillStyle = "#08205f"; g.fill(); drawScript(g, script, 512, 430, 280, 56); }
  return c;
}
// A sleeve or a trouser leg: the lathe wraps it with v running from the joint (v = 0) to the far end.
function clothCanvas(base, stripe, cuff, seed) {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = prng(seed || 5);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  if (stripe) { g.fillStyle = stripe; g.fillRect(0, 0, 18, 256); g.fillRect(238, 0, 18, 256); g.fillRect(118, 0, 20, 256); }
  for (let i = 0; i < 26; i++) {                             // creases around the bend
    const y = 40 + rnd() * 180, x = rnd() * 256, l = 30 + rnd() * 50;
    g.strokeStyle = "rgba(0,0,30," + (0.12 + rnd() * 0.12) + ")"; g.lineWidth = 3 + rnd() * 3; g.lineCap = "round";
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l * 0.5, y + 10 - rnd() * 20, x + l, y + 4 - rnd() * 8); g.stroke();
  }
  if (cuff) { g.fillStyle = cuff; g.fillRect(0, 228, 256, 28); }
  const sh = g.createLinearGradient(0, 0, 0, 256);
  sh.addColorStop(0, "rgba(255,255,255,.1)"); sh.addColorStop(1, "rgba(0,0,30,.18)");
  g.fillStyle = sh; g.fillRect(0, 0, 256, 256);
  return c;
}
// The top of the board: a loud 90s graphic, the wordmark in the middle.
function boardCanvas(script) {
  const c = mkCanvas(1024, 256), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 1024, 0);
  bg.addColorStop(0, "#ff3fa4"); bg.addColorStop(0.5, "#7b3ff2"); bg.addColorStop(1, "#18c8ff");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = "rgba(255,255,255,.18)";
  for (let x = -256; x < 1024; x += 90) { g.beginPath(); g.moveTo(x, 256); g.lineTo(x + 256, 0); g.lineTo(x + 296, 0); g.lineTo(x + 40, 256); g.closePath(); g.fill(); }
  g.fillStyle = "#ffe45c";                                   // lightning bolts toward the tips
  [[130, 1], [894, -1]].forEach(function (b) {
    const x = b[0], s = b[1];
    g.beginPath(); g.moveTo(x - 30 * s, 40); g.lineTo(x + 20 * s, 40); g.lineTo(x, 112); g.lineTo(x + 40 * s, 112); g.lineTo(x - 26 * s, 216); g.lineTo(x - 6 * s, 136); g.lineTo(x - 44 * s, 136); g.closePath(); g.fill();
  });
  rrectPath(g, 300, 56, 424, 144, 30); g.fillStyle = "rgba(8,32,95,.85)"; g.fill();
  drawScript(g, script, 512, 128, 400, 128);
  g.fillStyle = "#101219"; g.fillRect(0, 0, 1024, 10); g.fillRect(0, 246, 1024, 10);
  return c;
}
// Wooden lettering board for the start hut and the lodge.
function woodSignCanvas(script, top, bottom) {
  const c = mkCanvas(1024, 384), g = c.getContext("2d"), rnd = prng(31);
  g.fillStyle = "#7a4a22"; g.fillRect(0, 0, 1024, 384);
  for (let y = 0; y < 384; y += 48) { g.fillStyle = "hsl(" + (24 + rnd() * 6) + ",50%," + (30 + rnd() * 8) + "%)"; g.fillRect(0, y, 1024, 46); }
  speckle(g, 1024, 384, 3000, rnd, "rgba(255,220,170,.08)", "rgba(40,20,5,.15)");
  g.lineWidth = 16; g.strokeStyle = "#3c220d"; g.strokeRect(8, 8, 1008, 368);
  drawScript(g, script, 512, 132, 640, 200);
  candyText(g, top, 512, 262, 74, 900);
  if (bottom) candyText(g, bottom, 512, 338, 46, 900);
  return c;
}
function finishCanvas(script) {
  const c = mkCanvas(1024, 256), g = c.getContext("2d");
  for (let y = 0; y < 2; y++) for (let x = 0; x < 32; x++) { g.fillStyle = (x + y) % 2 ? "#101219" : "#ffffff"; g.fillRect(x * 32, y * 32, 32, 32); g.fillRect(x * 32, 192 + y * 32, 32, 32); }
  const bg = g.createLinearGradient(0, 64, 0, 192);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fillRect(0, 64, 1024, 128);
  drawScript(g, script, 230, 128, 340, 116);
  candyText(g, "FINISH", 690, 128, 96, 560);
  return c;
}
function startCanvas(script) {
  const c = mkCanvas(1024, 256), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, "#ff6a2a"); bg.addColorStop(1, "#d0360f");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 256);
  g.lineWidth = 12; g.strokeStyle = "#ffe45c"; g.strokeRect(10, 10, 1004, 236);
  drawScript(g, script, 250, 128, 400, 190);
  candyText(g, "START", 712, 110, 104, 520);
  boldText(g, "MOUNT BACKLOG", 712, 196, 40, "#ffffff", "#08205f", 9, 500);
  return c;
}
function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(40,70,120,.7)"); gr.addColorStop(0.55, "rgba(40,70,120,.35)"); gr.addColorStop(1, "rgba(40,70,120,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
// Orange safety netting along the edges of the run.
function netCanvas() {
  const c = mkCanvas(128, 64), g = c.getContext("2d");
  g.clearRect(0, 0, 128, 64);
  g.strokeStyle = "#ff7a14"; g.lineWidth = 3;
  for (let x = -64; x < 192; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 32, 64); g.stroke(); g.beginPath(); g.moveTo(x + 32, 0); g.lineTo(x, 64); g.stroke(); }
  g.fillStyle = "#ff9a3c"; g.fillRect(0, 0, 128, 5); g.fillRect(0, 59, 128, 5);
  return c;
}
// A tiny painted mountain for the glossy highlights on goggles, boards, discs and signs.
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.2, "#cfe6ff"); gr.addColorStop(0.42, "#5aa8ff");
    gr.addColorStop(0.5, "#9db8da"); gr.addColorStop(0.55, "#f4f8ff"); gr.addColorStop(1, "#ffffff");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#4fa3ff"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.beginPath(); tg.arc(40, 24, 10, 0, TAU); tg.fill();
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#f2f6fb"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* ---------------- LED ribbon board: the strip across every gantry on the run ----------------
   The board is a real dot matrix. Everything on it is painted into a small canvas, one pixel per LED, and a small
   shader turns each pixel into a glowing dot. Every gantry on the mountain carries the same board, so whichever one
   is coming up shows it. It scrolls its programme right to left, and cuts to big animated messages when the run
   calls for one (gates, tricks, wipeouts, hot streaks, the finish). */
const LED_W = 420, LED_HT = 30;                            // course units: width and lit height of a board
const LED_ROWS = 26, LED_COLS = Math.round(LED_W / (LED_HT / LED_ROWS));
const LED_SAFE = LED_COLS - 20;                            // widest message, in LEDs
const LED_SPEED = 44;                                      // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));   // the largest text size that fits (5 x 7 font, in LEDs per font pixel)
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
// Short messages between the plugs. The wordmark leads each group.
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["WELCOME TO MOUNT BACKLOG", "cyan"], ["BE KIND, REWIND", "pink"], ["NO QUARTERS REQUIRED", "lime"]];
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
    // a quick call cuts in, but a running score that has not had its turn yet still gets it afterwards
    const old = (L.msg && L.msg.keep ? [L.msg] : []).concat(L.queue.filter(function (m) { return m.keep; }));
    if (old.length) { old[0].t = 0; list = list.concat(old.slice(-1)); }
  }
  L.msg = list[0]; L.msg.t = 0;
  L.queue = list.slice(1);
  L.frame = -1;
}
function ledClear() {
  if (!LED) return;
  LED.msg = null; LED.queue = []; LED.pos = -1;
}
function ledGate(hit) {
  ledPlay([hit ? ledMsg("slide", "GATE +100", 1.4, { color: "cyan" }) : ledMsg("blink", "MISSED GATE", 1.4, { color: "red" })]);
}
function ledFinal(score) {
  if (!LED) return;
  ledPlay([ledMsg("count", "FINAL", 8, { from: 0, value: score, final: true, wait: 0.3 })], true);
}

// One message, full width.
function ledDrawMsg(g, m) {
  const WW = LED_COLS, HH = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(WW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.amber;
  function fit(str) { let sx = big + 1; while (sx > 1 && ledTextW(str, sx) > LED_SAFE) sx--; return sx; }
  function chase(color, dir) {                              // running lights along the top and bottom edges
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < WW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(WW - x - 3, HH - 1, 3, 1); }
  }
  if (m.kind === "count") {                                 // counts up to the new number
    const k = calm ? 1 : Math.min(1, t / 0.7), v = Math.round(m.from + (m.value - m.from) * k);
    const label = m.text ? m.text + (/\+$/.test(m.text) ? "" : " ") : "", full = label + m.value;
    let sxc = big; while (sxc > 1 && ledTextW(full, sxc) > LED_SAFE) sxc--;
    const x = Math.round((WW - ledTextW(full, sxc)) / 2);
    const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
    const xn = ledText(g, label, x, yBig, sxc, big, LED_C.amber);
    ledText(g, String(v), xn, yBig, sxc, big, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
    if (!calm && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(WW * m.t / 0.3), 0, WW, HH); }   // wipe in
    chase(LED_C.amber, 1);
    return;
  }
  const sx = fit(m.text), sy = Math.min(sx, big), w = ledTextW(m.text, sx), x0 = Math.round((WW - w) / 2), y0 = Math.floor((HH - 7 * sy) / 2);
  if (m.kind === "flash") {
    if (!calm && t < 0.6 && Math.floor(t * 12) % 2 === 0) {                        // strobe: the whole board flips
      g.fillStyle = LED_C.yellow; g.fillRect(0, 0, WW, HH);
      ledText(g, m.text, x0, y0, sx, sy, "#000000");
      return;
    }
    const span = 6 * big + 5, ph = calm ? 0 : Math.floor((t * 46) % span);
    for (let k = 0; k < 12; k++) {                          // chevrons racing outward on both sides
      const off = Math.round(w / 2) + 9 + k * span + ph;
      if (off > mid + span) break;
      const cc = k % 2 ? LED_C.red : LED_C.orange;
      ledText(g, ">", mid + off, yBig, big, big, cc);
      ledText(g, "<", mid - off - 5 * big, yBig, big, big, cc);
    }
    const cyc = [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0, y0, sx, sy, calm ? LED_C.yellow : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 18; i++) g.fillRect((vrand() * WW) | 0, (vrand() * HH) | 0, 1, 1); }
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "slide") {                                 // slides in from the right, then a white glint sweeps across it
    const k = calm ? 1 : Math.min(1, t / 0.45), e = 1 - Math.pow(1 - k, 3);
    const x = Math.round(x0 + (1 - e) * WW);
    ledText(g, m.text, x, y0, sx, sy, col);
    if (!calm && k >= 1) {
      const bx = Math.floor(((t - 0.45) * 150) % (WW + 80)) - 40;
      g.save(); g.beginPath(); g.rect(bx, 0, 12, HH); g.clip();
      ledText(g, m.text, x, y0, sx, sy, "#ffffff");
      g.restore();
    }
    chase(col, -1);
    return;
  }
  if (m.kind === "cycle") {                                 // every letter takes its turn through the colors
    const cyc = [LED_C.yellow, LED_C.pink, LED_C.cyan, LED_C.lime, LED_C.orange];
    let x = x0;
    for (let i = 0; i < m.text.length; i++) x = ledText(g, m.text[i], x, y0, sx, sy, cyc[(i + (calm ? 0 : Math.floor(t * 9))) % cyc.length]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 12; i++) g.fillRect((vrand() * WW) | 0, (vrand() * HH) | 0, 1, 1); }
    chase(LED_C.yellow, 1);
    return;
  }
  // blink: a few flashes, then it holds over a solid bar
  if (calm || t > 1.1 || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, y0, sx, sy, col);
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

/* ---------------- People: sculpted, jointed figures ----------------
   Every person on the mountain is built here, life size in feet, then scaled up for the camera. Bodies are
   turned on a lathe (hips, waist, chest, shoulders, collar), limbs are tapered and puffed like insulated
   sleeves and trouser legs, elbows and knees are solved from where the hands and feet need to be, and each
   head is sculpted from merged shapes: cranium, jaw, chin, cheeks, nose, ears, lidded eyes with irises and
   catchlights, brows and a mouth that can grin or open. Hands are mittens with a thumb and curled fingers,
   feet are snowboard boots with soles and laces. Everything is original. */
const FS = 12;                                             // feet to course units: everyone is drawn about 70 units tall

// Merge shapes into one mesh with per-vertex colors. parts: [{ g: geometry, m: Matrix4, c: color }]
function mergeParts(T, parts) {
  let nv = 0, ni = 0;
  parts.forEach(function (p) { nv += p.g.attributes.position.count; ni += p.g.index ? p.g.index.count : p.g.attributes.position.count; });
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  const v = new T.Vector3(), nm = new T.Matrix3(), c = new T.Color();
  let ov = 0, oi = 0;
  parts.forEach(function (p) {
    const P = p.g.attributes.position, N = p.g.attributes.normal, n = P.count;
    nm.getNormalMatrix(p.m); c.set(p.c);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(p.m); pos.set([v.x, v.y, v.z], (ov + i) * 3);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (ov + i) * 3);
      col[(ov + i) * 3] = c.r; col[(ov + i) * 3 + 1] = c.g; col[(ov + i) * 3 + 2] = c.b;
    }
    if (p.g.index) { const I = p.g.index; for (let i = 0; i < I.count; i++) idx[oi + i] = I.getX(i) + ov; oi += I.count; }
    else { for (let i = 0; i < n; i++) idx[oi + i] = ov + i; oi += n; }
    ov += n;
  });
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(pos, 3));
  g.setAttribute("normal", new T.BufferAttribute(nor, 3));
  g.setAttribute("color", new T.BufferAttribute(col, 3));
  g.setIndex(new T.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
// A placement matrix: position, scale, and a rotation in degrees (x, y, z).
function place(T, x, y, z, sx, sy, sz, rx, ry, rz) {
  const m = new T.Matrix4(), q = new T.Quaternion().setFromEuler(new T.Euler((rx || 0) * DEG, (ry || 0) * DEG, (rz || 0) * DEG));
  return m.compose(new T.Vector3(x, y, z), q, new T.Vector3(sx, sy == null ? sx : sy, sz == null ? sx : sz));
}

// The shared shapes every figure is cut from.
function figureKit(T) {
  const K = { sphere: new T.SphereGeometry(1, 18, 14), ball: new T.SphereGeometry(1, 12, 9) };
  K.dome = new T.SphereGeometry(1, 18, 10, 0, TAU, 0, Math.PI * 0.55);
  K.ring = new T.CylinderGeometry(1, 1, 1, 22, 1, true);
  K.ring2 = new T.CylinderGeometry(1, 1, 1, 22, 1, false);
  function lathe(pts, seg) { return new T.LatheGeometry(pts.map(function (p) { return new T.Vector2(p[0], p[1]); }), seg); }
  // the torso: hips, a waist, a puffed chest, the slope of the shoulders, the collar
  K.torso = lathe([[0, -0.3], [0.5, -0.27], [0.57, -0.02], [0.56, 0.26], [0.53, 0.52], [0.57, 0.82], [0.65, 1.1], [0.71, 1.36],
                   [0.72, 1.52], [0.66, 1.7], [0.5, 1.84], [0.31, 1.94], [0.22, 1.98], [0, 2.0]], 22);
  // limbs, unit length along +y and unit radius at their widest: sleeves and trouser legs with a little puff
  K.upper = lathe([[0, 0], [0.8, 0.02], [0.97, 0.14], [1, 0.38], [0.93, 0.72], [0.84, 0.95], [0, 1]], 12);
  K.fore = lathe([[0, 0], [0.84, 0.02], [0.96, 0.2], [0.9, 0.56], [0.79, 0.8], [0.96, 0.85], [0.97, 0.99], [0, 1]], 12);
  K.thigh = lathe([[0, 0], [0.84, 0.02], [1, 0.18], [0.98, 0.56], [0.86, 0.93], [0, 1]], 12);
  K.shin = lathe([[0, 0], [0.82, 0.02], [0.86, 0.3], [0.87, 0.68], [1, 0.9], [1.03, 1], [0, 1]], 12);
  K.neck = new T.CylinderGeometry(0.155, 0.185, 0.42, 12);
  K.collar = new T.TorusGeometry(0.25, 0.075, 8, 20); K.collar.rotateX(Math.PI / 2);
  // a grin: a short arc, ends up
  K.smile = new T.TorusGeometry(0.085, 0.02, 6, 14, Math.PI); K.smile.rotateZ(Math.PI);
  return K;
}

// A head, sculpted from merged shapes, origin at the top of the neck, looking along +z.
// o: { skin, hair, eyes, hat, hatTrim, goggles, helmet, hairStyle }
function headGeo(T, K, o) {
  const P = [], sk = o.skin, s = K.sphere;
  const skin2 = new T.Color(sk).multiplyScalar(0.9).getHex(), blush = new T.Color(sk).lerp(new T.Color(0xff8a8a), 0.22).getHex();
  function add(g, c, x, y, z, sx, sy, sz, rx, ry, rz) { P.push({ g: g, c: c, m: place(T, x, y, z, sx, sy, sz, rx, ry, rz) }); }
  add(s, sk, 0, 0.43, -0.03, 0.4, 0.45, 0.43);                // cranium
  add(s, sk, 0, 0.25, 0.07, 0.33, 0.3, 0.33);                 // jaw and lower face
  add(s, sk, 0, 0.07, 0.21, 0.15, 0.11, 0.13);                // chin
  for (let sg = -1; sg <= 1; sg += 2) {
    add(s, blush, sg * 0.19, 0.27, 0.22, 0.14, 0.12, 0.12);   // cheeks
    add(s, skin2, sg * 0.41, 0.36, -0.01, 0.05, 0.11, 0.09);  // ears
    add(s, 0xffffff, sg * 0.145, 0.4, 0.352, 0.088, 0.07, 0.05);                  // eye whites
    add(s, o.eyes, sg * 0.145, 0.398, 0.392, 0.05, 0.052, 0.03);                  // irises
    add(K.ball, 0x0b0b10, sg * 0.145, 0.398, 0.416, 0.025, 0.027, 0.015);         // pupils
    add(K.ball, 0xffffff, sg * 0.131, 0.415, 0.424, 0.013, 0.013, 0.008);         // catchlights
    add(s, sk, sg * 0.145, 0.448, 0.348, 0.096, 0.036, 0.058, -8);                // upper lids
    add(s, skin2, sg * 0.145, 0.355, 0.352, 0.085, 0.022, 0.05);                  // lower lids
    add(s, skin2, sg * 0.055, 0.268, 0.398, 0.04, 0.035, 0.04);                   // nostril wings
    if (o.hairStyle !== "bald") add(s, o.hair, sg * 0.37, 0.36, 0.1, 0.05, 0.11, 0.05);   // sideburns
  }
  add(s, sk, 0, 0.37, 0.38, 0.062, 0.12, 0.07, -18);          // bridge of the nose
  add(s, skin2, 0, 0.29, 0.43, 0.074, 0.064, 0.07);           // tip of the nose
  add(s, sk, 0, 0.205, 0.37, 0.06, 0.025, 0.03);              // upper lip groove
  if (o.helmet) {                                              // a glossy helmet
    add(K.dome, o.hat, 0, 0.5, -0.03, 0.47, 0.46, 0.5);
    add(s, o.hat, 0, 0.47, -0.05, 0.47, 0.2, 0.5);
    add(K.ring2, 0x16171d, 0, 0.62, 0, 0.475, 0.06, 0.505);
  } else if (o.hat) {                                          // a beanie with a fold and a pompom
    add(s, o.hair, 0, 0.34, -0.12, 0.42, 0.26, 0.42);
    add(K.dome, o.hat, 0, 0.55, -0.03, 0.44, 0.42, 0.46);
    add(K.ring2, o.hatTrim, 0, 0.6, -0.03, 0.452, 0.15, 0.472);
    add(K.ball, o.hatTrim, 0, 0.99, -0.05, 0.13, 0.13, 0.13);
  } else if (o.hairStyle !== "bald") {                         // hair
    add(K.dome, o.hair, 0, 0.5, -0.05, 0.43, 0.4, 0.46);
    add(s, o.hair, 0, 0.36, -0.13, 0.42, 0.3, 0.4);
    add(s, o.hair, 0.12, 0.8, 0.18, 0.18, 0.1, 0.16, 20, 0, -20);   // a swoop of fringe
    if (o.hairStyle === "long") { add(s, o.hair, 0, 0.12, -0.24, 0.4, 0.42, 0.24); }
  }
  if (o.goggles) {                                             // goggles pushed up on the hat
    add(K.ring, 0x14161c, 0, 0.7, -0.03, 0.465, 0.06, 0.485);
    add(s, 0xffffff, 0, 0.72, 0.42, 0.31, 0.12, 0.07);
    add(s, o.goggles, 0, 0.72, 0.465, 0.27, 0.095, 0.04);
  }
  return mergeParts(T, P);
}
// A mitten, origin at the wrist, the hand reaching along +y, palm toward +z. sg = 1 left hand, -1 right.
function mittGeo(T, K, col, trim, sg) {
  const P = [], s = K.sphere;
  P.push({ g: s, c: trim, m: place(T, 0, 0.04, 0, 0.15, 0.08, 0.12) });                          // cuff
  P.push({ g: s, c: col, m: place(T, 0, 0.22, 0, 0.14, 0.21, 0.095) });                         // palm and back of the hand
  P.push({ g: s, c: col, m: place(T, 0, 0.4, 0.035, 0.125, 0.09, 0.1, 25) });                    // curled fingers
  P.push({ g: s, c: new T.Color(col).multiplyScalar(0.82).getHex(), m: place(T, 0, 0.36, 0.08, 0.11, 0.025, 0.04, 25) });  // knuckle seam
  P.push({ g: s, c: col, m: place(T, sg * 0.12, 0.2, 0.06, 0.05, 0.12, 0.055, 0, 0, sg * -35) }); // thumb
  return mergeParts(T, P);
}
// A snowboard boot, origin at the ankle, toe along +z.
function bootGeo(T, K, col, accent) {
  const P = [], s = K.sphere;
  P.push({ g: s, c: col, m: place(T, 0, 0.03, -0.02, 0.21, 0.3, 0.24) });                         // shaft
  P.push({ g: s, c: accent, m: place(T, 0, 0.28, -0.02, 0.225, 0.06, 0.255) });                  // padded collar
  P.push({ g: s, c: col, m: place(T, 0, -0.15, 0.14, 0.21, 0.15, 0.36) });                       // foot
  P.push({ g: s, c: accent, m: place(T, 0, -0.02, 0.19, 0.13, 0.11, 0.17, -25) });                // laces panel
  for (let k = 0; k < 3; k++) P.push({ g: s, c: 0xf2f2f2, m: place(T, 0, 0.05 - k * 0.07, 0.25 + k * 0.035, 0.1, 0.012, 0.02, -25) });
  P.push({ g: s, c: 0x14161c, m: place(T, 0, -0.27, 0.12, 0.23, 0.055, 0.42) });                 // sole
  return mergeParts(T, P);
}
// The snowboard and its bindings, lying along x, top at y = 0. The base and top carry the graphic.
function boardMeshes(T, K, mats) {
  const L = 2.62, w = 0.47, waist = 0.42, sh = new T.Shape();
  const n = 26;
  for (let i = 0; i <= n; i++) {                            // one long edge with a little sidecut...
    const x = -L + 0.47 + (2 * (L - 0.47)) * i / n, k = 1 - Math.pow(x / (L - 0.47), 2);
    const y = -(w - (w - waist) * k);
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  sh.absarc(L - 0.47, 0, 0.47, -Math.PI / 2, Math.PI / 2, false);   // ...a round nose...
  for (let i = n; i >= 0; i--) { const x = -L + 0.47 + (2 * (L - 0.47)) * i / n, k = 1 - Math.pow(x / (L - 0.47), 2); sh.lineTo(x, w - (w - waist) * k); }
  sh.absarc(-L + 0.47, 0, 0.47, Math.PI / 2, Math.PI * 1.5, false); // ...and a round tail
  const g = new T.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 10 });
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), ax = Math.abs(x);
    if (ax > 1.9) p.setY(i, p.getY(i) + Math.pow(ax - 1.9, 2) * 0.55);     // the nose and tail kick up
    uv.setXY(i, (x + L) / (2 * L), (p.getZ(i) + w) / (2 * w));
  }
  g.computeVertexNormals();
  const board = new T.Mesh(g, [mats.boardTop, mats.boardEdge]);
  // bindings: a base plate, a high back behind the heel, two straps over the boot
  const P = [], s = K.sphere;
  [0.95, -0.95].forEach(function (x, i) {
    const yaw = i ? -6 : 15;
    P.push({ g: s, c: 0x16171d, m: place(T, x, 0.03, 0, 0.27, 0.035, 0.42, 0, yaw) });
    P.push({ g: K.dome, c: 0x16171d, m: place(T, x - Math.sin(yaw * DEG) * 0.22, 0.05, -Math.cos(yaw * DEG) * 0.22, 0.25, 0.6, 0.12, 0, yaw) });
    P.push({ g: K.ring, c: 0xff3fa4, m: place(T, x, 0.42, 0.02, 0.24, 0.06, 0.27, 0, yaw) });
    P.push({ g: K.ring, c: 0xff3fa4, m: place(T, x + Math.sin(yaw * DEG) * 0.16, 0.22, Math.cos(yaw * DEG) * 0.16, 0.235, 0.05, 0.2, 0, yaw) });
  });
  const bind = new T.Mesh(mergeParts(T, P), mats.vc);
  return { board: board, bind: bind };
}

// Build one person. look: { jacket, sleeve, pants, skin, hair, eyes, hat, hatTrim, goggles, helmet, mitt, mittTrim, boot, bootAccent, shoulder, scale }
function makeFigure(T, K, look, mats) {
  const root = new T.Group(), body = new T.Group();
  root.add(body); body.scale.setScalar(FS * (look.scale || 1));
  const vc = mats.vc;
  const jacket = new T.MeshLambertMaterial({ map: look.jacket });
  const sleeve = new T.MeshLambertMaterial({ map: look.sleeve });
  const pants = new T.MeshLambertMaterial({ map: look.pants });
  const skinM = new T.MeshLambertMaterial({ color: look.skin });
  const shoulderM = new T.MeshLambertMaterial({ color: look.shoulder });
  const pantsSolid = new T.MeshLambertMaterial({ color: look.pantsColor });
  function m(g, mat, parent) { const x = new T.Mesh(g, mat); (parent || body).add(x); return x; }

  const hips = m(K.sphere, pantsSolid); hips.scale.set(0.6, 0.42, 0.45);
  const upper = new T.Group(); body.add(upper);
  const torso = m(K.torso, jacket, upper); torso.scale.z = 0.7;
  const neck = m(K.neck, skinM, upper); neck.position.y = 2.06;
  const collar = m(K.collar, shoulderM, upper); collar.position.y = 1.93; collar.scale.set(1, 1, 0.82);
  const head = new T.Group(); head.position.y = 2.24; upper.add(head);
  m(headGeo(T, K, look), mats.face, head);
  const browM = new T.MeshLambertMaterial({ color: look.hair });
  const brows = [-1, 1].map(function (sg) { const b = m(K.sphere, browM, head); b.position.set(sg * 0.15, 0.49, 0.375); b.scale.set(0.088, 0.022, 0.035); b.userData.sg = sg; return b; });
  const mouth = new T.Group(); mouth.position.set(0, 0.155, 0.378); head.add(mouth);
  const lipM = new T.MeshLambertMaterial({ color: 0xa8443f }), cavM = new T.MeshBasicMaterial({ color: 0x3a0c12 }), toothM = new T.MeshLambertMaterial({ color: 0xffffff });
  const smile = m(K.smile, lipM, mouth); smile.position.y = 0.06;
  const cavity = m(K.sphere, cavM, mouth); cavity.scale.set(0.08, 0.05, 0.03);
  const teeth = m(K.sphere, toothM, mouth); teeth.scale.set(0.065, 0.016, 0.02); teeth.position.set(0, 0.03, 0.015);

  function limb(g1, g2, m1, m2, r1, r2, jointMat, jr) {
    return { up: m(g1, m1), lo: m(g2, m2), j: m(K.sphere, jointMat), r1: r1, r2: r2, jr: jr };
  }
  const arm = [limb(K.upper, K.fore, sleeve, sleeve, 0.235, 0.205, sleeve, 0.19), limb(K.upper, K.fore, sleeve, sleeve, 0.235, 0.205, sleeve, 0.19)];
  const delts = [m(K.sphere, shoulderM), m(K.sphere, shoulderM)];
  const leg = [limb(K.thigh, K.shin, pants, pants, 0.33, 0.27, pantsSolid, 0.28), limb(K.thigh, K.shin, pants, pants, 0.33, 0.27, pantsSolid, 0.28)];
  const mitts = [m(mittGeo(T, K, look.mitt, look.mittTrim, 1), vc), m(mittGeo(T, K, look.mitt, look.mittTrim, -1), vc)];
  const bootG = bootGeo(T, K, look.boot, look.bootAccent);
  const boots = [m(bootG, vc), m(bootG, vc)];
  return { root: root, body: body, hips: hips, upper: upper, head: head, brows: brows, mouth: mouth, cavity: cavity, teeth: teeth, smile: smile,
           arm: arm, leg: leg, delts: delts, mitts: mitts, boots: boots, look: look };
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
function bone(mesh, A, B, r) {
  const t = TV;
  t.d.subVectors(B, A);
  const l = t.d.length() || 1e-4;
  mesh.position.copy(A);
  mesh.quaternion.setFromUnitVectors(t.up, t.d.multiplyScalar(1 / l));
  mesh.scale.set(r, l, r);
}
// Lay a limb from A toward B (clamped to its reach), bending toward pole; returns where its end landed in t.e2.
function setLimb(L, A, B, pole, l1, l2) {
  const t = TV;
  t.f.subVectors(B, A);
  const reach = (l1 + l2) * 0.995;
  if (t.f.length() > reach) t.f.setLength(reach);
  t.e2.copy(A).add(t.f);
  bend(A, t.e2, pole, l1, l2, t.e);
  bone(L.up, A, t.e, L.r1); bone(L.lo, t.e, t.e2, L.r2);
  L.j.position.copy(t.e); L.j.scale.setScalar(L.jr);
}

/* A pose is a list of numbers, all in the figure's own space (feet and degrees, +z the way the chest faces at rest):
   0-2 hips x y z, 3 hip turn, 4 chest turn, 5 lean forward, 6 lean sideways,
   7-9 left hand, 10-12 right hand, 13-15 left ankle, 16-18 right ankle,
   19 head turn, 20 head nod, 21 mouth open (0 to 1), 22 brows (-1 cross, 0 rest, 1 raised), 23 left foot turn, 24 right foot turn */
const POSE_N = 25;
function poseMix(a, b, u, out) { for (let i = 0; i < POSE_N; i++) out[i] = a[i] + (b[i] - a[i]) * u; return out; }
function poseAdd(out, a, u) { for (let i = 0; i < POSE_N; i++) out[i] += a[i] * u; return out; }

function applyPose(F, v) {
  const t = TV, hy = v[3] * DEG, ch = Math.cos(hy), sh = Math.sin(hy), uy = v[4] * DEG, cu = Math.cos(uy), su = Math.sin(uy);
  F.hips.position.set(v[0], v[1], v[2]); F.hips.rotation.set(0, hy, 0);
  F.upper.position.set(v[0], v[1] + 0.1, v[2]); F.upper.rotation.set(v[5] * DEG, uy, -v[6] * DEG, "YXZ");
  F.upper.updateMatrix();
  F.head.rotation.set(v[20] * DEG, (v[19] - v[4]) * DEG, 0, "YXZ");
  const open = clamp(v[21], 0, 1), brow = clamp(v[22], -1, 1);
  F.cavity.scale.set(0.075 + open * 0.02, 0.012 + open * 0.07, 0.03); F.cavity.position.y = -open * 0.035;
  F.teeth.visible = open > 0.15; F.smile.scale.set(1 + open * 0.15, 1 - open * 0.4, 1);
  for (let i = 0; i < 2; i++) { const b = F.brows[i]; b.position.y = 0.49 + brow * 0.04; b.rotation.z = b.userData.sg * (brow < 0 ? brow * 0.35 : brow * 0.12); }
  for (let s = 0; s < 2; s++) {                             // 0 = left, 1 = right
    const sg = s ? -1 : 1;
    // shoulder, out to the hand, elbow hanging down, out and a little back
    t.a.set(sg * 0.74, 1.66, -0.02).applyMatrix4(F.upper.matrix);
    F.delts[s].position.copy(t.a); F.delts[s].scale.set(0.27, 0.25, 0.26);
    t.b.set(v[7 + s * 3], v[8 + s * 3], v[9 + s * 3]);
    t.p.set(sg * 0.55 * cu - 0.45 * su, -0.8, -sg * 0.55 * su - 0.45 * cu);
    setLimb(F.arm[s], t.a, t.b, t.p, 1.05, 1.0);
    const mt = F.mitts[s];
    mt.position.copy(t.e2);
    t.d.subVectors(t.e2, t.e).normalize();
    mt.quaternion.setFromUnitVectors(t.up, t.d);
    mt.rotateY(sg * 0.6 + uy);
    // hip, down to the ankle, knee toward the way the hips face
    t.a.set(v[0] + sg * 0.33 * ch, v[1] - 0.12, v[2] - sg * 0.33 * sh);
    t.b.set(v[13 + s * 3], v[14 + s * 3] + 0.06, v[15 + s * 3]);
    t.p.set(sh + sg * 0.22 * ch, 0.15, ch - sg * 0.22 * sh);
    setLimb(F.leg[s], t.a, t.b, t.p, 1.45, 1.42);
    const bt = F.boots[s];
    bt.position.set(v[13 + s * 3], v[14 + s * 3], v[15 + s * 3]);
    bt.rotation.set(0, (v[23 + s] || 0) * DEG, 0);
  }
}

// The rider's poses (standing across the board, front foot toward +x, which the rig turns down the hill).
const RP = {
  ride:  [0, 2.5, -0.08, 14, 42, 15, 0, 1.55, 2.6, 0.55, -1.35, 2.35, 0.35, 0.95, 0.33, 0, -0.95, 0.33, 0, 86, 12, 0, 0, 15, -6],
  toe:   [0.05, 2.3, 0.34, 10, 28, 30, 0, 1.4, 1.95, 1.15, -1.25, 1.7, 0.95, 0.95, 0.33, 0, -0.95, 0.33, 0, 70, 20, 0.15, 0.2, 15, -6],
  heel:  [0, 2.22, -0.5, 20, 52, 0, 0, 1.6, 2.2, 0.95, -1.0, 2.15, 1.05, 0.95, 0.33, 0, -0.95, 0.33, 0, 82, 6, 0, 0.1, 15, -6],
  air:   [0, 2.12, 0.02, 14, 32, 26, 0, 1.6, 3.15, 0.35, -0.15, 0.6, 0.48, 0.95, 0.33, 0, -0.95, 0.33, 0, 62, 10, 0.55, 0.6, 15, -6],
  crash: [0, 1.55, 0.1, 30, 60, 48, 28, 2.05, 2.4, -0.4, -2.0, 2.6, 0.7, 0.95, 0.33, 0, -0.95, 0.33, 0, 40, -12, 1, 1, 15, -6],
  stand: [0, 2.92, 0, 0, 0, 4, 0, 0.95, 4.55, 0.55, -0.72, 2.75, 0.18, 0.95, 0.33, 0, -0.95, 0.33, 0, 0, 0, 0.12, 0.3, 15, -6],
  cheer: [0, 2.8, 0, 0, 0, -6, 0, 0.95, 5.0, 0.3, -0.95, 5.0, 0.3, 0.95, 0.33, 0, -0.95, 0.33, 0, 0, -16, 0.95, 0.9, 15, -6],
  slump: [0, 2.55, 0.1, 0, 0, 22, 0, 0.7, 1.95, 0.5, -0.7, 1.95, 0.5, 0.95, 0.33, 0, -0.95, 0.33, 0, 0, 26, 0, -0.7, 15, -6]
};
// The crowd's poses (standing on the snow, boots a little apart).
const CP = {
  idle:  [0, 3.1, 0, 0, 0, 3, 0, 0.82, 2.95, 0.22, -0.82, 2.95, 0.22, 0.42, 0.33, 0, -0.42, 0.33, 0, 0, 0, 0.1, 0.2, 10, -10],
  cheer: [0, 3.05, 0, 0, 0, -4, 0, 0.95, 6.1, 0.3, -0.95, 6.1, 0.3, 0.42, 0.33, 0, -0.42, 0.33, 0, 0, -10, 0.9, 0.9, 10, -10],
  clap:  [0, 3.08, 0, 0, 0, 6, 0, 0.13, 4.25, 0.75, -0.13, 4.25, 0.75, 0.42, 0.33, 0, -0.42, 0.33, 0, 0, 4, 0.6, 0.6, 10, -10],
  point: [0, 3.1, 0, 0, 10, 2, 0, 0.9, 5.15, 1.25, -0.82, 2.95, 0.22, 0.42, 0.33, 0, -0.42, 0.33, 0, 10, -6, 0.5, 0.7, 10, -10]
};

// The wardrobe. Jackets carry original patches only: the studio wordmark, NP, and jobs on the mountain.
function wardrobe(T, script, tex) {
  function look(o) {
    return {
      jacket: tex(jacketCanvas(script, o.j)), sleeve: tex(clothCanvas(o.j.base, o.j.trim, o.j.panel, o.seed)), pants: tex(clothCanvas(o.pants, o.pantStripe, null, o.seed + 3)),
      pantsColor: o.pants, shoulder: o.j.panel, skin: o.skin, hair: o.hair, eyes: o.eyes, hat: o.hat, hatTrim: o.hatTrim, goggles: o.goggles, helmet: o.helmet,
      hairStyle: o.hairStyle, mitt: o.mitt, mittTrim: o.mittTrim, boot: o.boot, bootAccent: o.bootAccent, scale: o.scale || 1, pose: o.pose || "idle"
    };
  }
  const rider = look({ seed: 11, j: { base: "#7b3ff2", panel: "#18c8ff", trim: "#ff3fa4", chest: "NP", back: "NP", backSub: "PRO RIDER", badge: "#ffe45c", zigzag: true, script: true, seed: 11 },
    pants: "#24315e", pantStripe: "#ffe45c", skin: 0xe8b48c, hair: 0x5a3214, eyes: 0x2f7a4a, hat: 0xff9214, hatTrim: 0xffe45c, goggles: 0xff6a2a,
    mitt: 0xff3fa4, mittTrim: 0x101219, boot: 0x2b2f3d, bootAccent: 0x18c8ff });
  const crowd = [
    look({ seed: 21, j: { base: "#d8262a", panel: "#16171d", trim: "#ffffff", chest: "SKI", back: "PATROL", backSub: "MT BACKLOG", badge: "#ffffff", seed: 21 },
      pants: "#16171d", skin: 0xc98a5a, hair: 0x2a1a10, eyes: 0x5a3a1a, helmet: true, hat: 0xd8262a, mitt: 0x16171d, mittTrim: 0xd8262a, boot: 0x16171d, bootAccent: 0xd8262a, pose: "point" }),
    look({ seed: 31, j: { base: "#ff8a1e", panel: "#16245e", trim: "#ffe45c", chest: "LIFT", back: "LIFT", backSub: "CREW", badge: "#ffffff", seed: 31 },
      pants: "#16245e", pantStripe: "#ff8a1e", skin: 0x8a5a36, hair: 0x14100c, eyes: 0x3a2412, hat: 0x16245e, hatTrim: 0xff8a1e, mitt: 0xffd21f, mittTrim: 0x16245e, boot: 0x5a3a20, bootAccent: 0x2b2f3d, pose: "clap" }),
    look({ seed: 41, j: { base: "#16b9e8", panel: "#ff3fa4", trim: "#ffffff", chest: "NP", back: "NP", backSub: "FAN CLUB", badge: "#ffe45c", zigzag: true, seed: 41 },
      pants: "#ffffff", pantStripe: "#16b9e8", skin: 0xf3d2b4, hair: 0xd8a040, eyes: 0x2a5ad8, hairStyle: "long", goggles: 0x3fe0ff, mitt: 0xffffff, mittTrim: 0xff3fa4, boot: 0xffffff, bootAccent: 0xff3fa4, pose: "cheer" }),
    look({ seed: 51, j: { base: "#2fae4a", panel: "#ffe45c", trim: "#16171d", chest: "RENT", back: "RENTALS", backSub: "BE KIND, REWIND", badge: "#ffffff", seed: 51 },
      pants: "#3a3e4c", skin: 0xd9a273, hair: 0x7a4a22, eyes: 0x3a6a3a, hat: 0x2fae4a, hatTrim: 0xffffff, mitt: 0x2fae4a, mittTrim: 0x16171d, boot: 0x3a3e4c, bootAccent: 0x2fae4a, pose: "clap" }),
    look({ seed: 61, scale: 0.74, j: { base: "#ff4fa0", panel: "#7b3ff2", trim: "#ffe45c", chest: "GO!", back: "GO!", backSub: "SHRED IT", badge: "#ffffff", zigzag: true, seed: 61 },
      pants: "#7b3ff2", skin: 0xf6d7b8, hair: 0x3a2412, eyes: 0x5a3a1a, hat: 0xffe45c, hatTrim: 0xff4fa0, mitt: 0xffe45c, mittTrim: 0x7b3ff2, boot: 0xff4fa0, bootAccent: 0xffffff, pose: "cheer" }),
    look({ seed: 71, j: { base: "#1b56cf", panel: "#ffffff", trim: "#ff9214", chest: "SKI", back: "SKI", backSub: "SCHOOL", badge: "#ffe45c", seed: 71 },
      pants: "#0b1f5e", pantStripe: "#ffffff", skin: 0xa8703f, hair: 0x101010, eyes: 0x2a1a0a, hairStyle: "bald", goggles: 0xffd21f, mitt: 0x0b1f5e, mittTrim: 0xff9214, boot: 0x0b1f5e, bootAccent: 0xff9214, pose: "point" })
  ];
  return { rider: rider, crowd: crowd };
}

/* ---------------- The mountain ---------------- */
const SLOPE = 0.2;                                         // the run drops 1 unit for every 5 it goes down the hill
const ROW = 40, ROWS_N = 84, BACK_ROWS = 14;               // the snow under the camera: rows of ROW units, BACK_ROWS of them behind the rider
const XS = [-1500, -1100, -820, -620, -470, -360, -280, -230, -206, -200, -150, -100, -50, 0, 50, 100, 150, 200, 206, 230, 280, 360, 470, 620, 820, 1100, 1500];
const FENCE_X = 206, VIEW = 2500;                          // the netting each side of the run; how far down the hill things are drawn
const CAM = { back: 405, up: 292, fov: 56, tilt: 13.5 };   // the chase camera: behind and above the rider, tipped up so the rider sits low
// Height of the run at d (the same right across it), and how steep it is there.
function gy(d) { return -d * SLOPE + Math.sin(d * 0.0021) * 16 + Math.sin(d * 0.0057 + 1.3) * 6; }
function gyd(d) { return -SLOPE + Math.cos(d * 0.0021) * 0.0336 + Math.cos(d * 0.0057 + 1.3) * 0.0342; }
// Height of the snow anywhere: off the run it banks up into the trees.
function ground(d, x3) { const ax = Math.abs(x3); let y = gy(d); if (ax > 200) { const k = ax - 200; y += k * 0.07 + k * k * 0.00028; } return y; }

// A kicker: groomed snow curving up to a lip, 46 wide, sitting with its lip toward the bottom of the hill (-z).
function rampGeo(T) {
  const pos = [], uv = [], idx = [], NA = 14, Wd = 23, A0 = 28, A1 = 14, HT = 15;
  function hgt(a) { const u = (a + A0) / (A0 + A1); return HT * u * u; }
  for (let i = 0; i <= NA; i++) {                            // the curved top
    const a = -A0 + (A0 + A1) * i / NA, y = hgt(a);
    pos.push(-Wd, y, -a, Wd, y, -a); uv.push(0, i / NA, 1, i / NA);
  }
  for (let i = 0; i < NA; i++) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  let b = pos.length / 3;                                    // the face of the lip
  pos.push(-Wd, HT, -A1, Wd, HT, -A1, -Wd, 0, -A1 - 3, Wd, 0, -A1 - 3); uv.push(0, 0.98, 1, 0.98, 0, 0.9, 1, 0.9);
  idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  for (let s = -1; s <= 1; s += 2) {                         // the two sides
    const base = pos.length / 3;
    for (let i = 0; i <= NA; i++) { const a = -A0 + (A0 + A1) * i / NA; pos.push(s * Wd, hgt(a), -a, s * Wd, 0, -a); uv.push(0.02, 0.5, 0.02, 0.5); }
    for (let i = 0; i < NA; i++) { const o = base + i * 2; if (s < 0) idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); else idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// A snowy pine, merged into one shape: trunk, three tiers of needles, snow on every tier.
function pineGeo(T, K, dark, snow) {
  const P = [], cone = new T.ConeGeometry(1, 1, 12, 1), cyl = new T.CylinderGeometry(1, 1, 1, 8);
  P.push({ g: cyl, c: 0x5a3a1e, m: place(T, 0, 6, 0, 2.6, 12, 2.6) });
  [[17, 9, 22], [13, 21, 19], [8.6, 32, 16]].forEach(function (t, i) {
    P.push({ g: cone, c: i === 1 ? new T.Color(dark).multiplyScalar(1.12).getHex() : dark, m: place(T, 0, t[1] + t[2] / 2, 0, t[0], t[2], t[0]) });
    P.push({ g: cone, c: snow, m: place(T, 0.4, t[1] + t[2] * 0.62, 0.3, t[0] * 0.62, t[2] * 0.5, t[0] * 0.62) });
  });
  P.push({ g: K.ball, c: snow, m: place(T, 0, 47.5, 0, 1.8) });
  return mergeParts(T, P);
}
function rockGeo(T) {
  const g = new T.IcosahedronGeometry(1, 1), p = g.attributes.position, rnd = prng(5);
  const snowCut = 0.25, col = new Float32Array(p.count * 3), c1 = new T.Color(0x6e7488), c2 = new T.Color(0xf4f8ff);
  for (let i = 0; i < p.count; i++) {
    const k = 0.82 + rnd() * 0.3;
    p.setXYZ(i, p.getX(i) * 12.5 * k, Math.max(-0.2, p.getY(i)) * 9 * k + 1.5, p.getZ(i) * 11 * k);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { const c = n.getY(i) > 0.55 && p.getY(i) > 4 + snowCut ? c2 : c1; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute("color", new T.BufferAttribute(col, 3));
  return g;
}

function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0xbfe2ff, 1);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(CAM.fov, W / H, 4, 9000);
  const caps = renderer.capabilities;
  const aniso = Math.min(4, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  TV = { a: new T.Vector3(), b: new T.Vector3(), d: new T.Vector3(), e: new T.Vector3(), e2: new T.Vector3(), f: new T.Vector3(),
         p: new T.Vector3(), q: new T.Vector3(), up: new T.Vector3(0, 1, 0) };

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
  const K = figureKit(T);
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
  function decal(mat, order) { mat.transparent = true; mat.depthWrite = false; mat._order = order; return mat; }

  /* lights: a bright morning on the mountain */
  const hemi = new T.HemisphereLight(0xdcecff, 0x9fb4d6, 1.5); scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff2dc, 2.2); scene.add(sun); scene.add(sun.target);
  const fill = new T.DirectionalLight(0xcfe0ff, 0.7); fill.position.set(300, 200, 600); scene.add(fill);
  scene.fog = new T.Fog(0xdfeaf6, 1400, 3300);

  /* sky and the ranges all round, carried with the camera */
  const cSky = mkCanvas(512, 256), tSky = tex(cSky);
  paintSky(cSky.getContext("2d"), "day");
  const sky = new T.Mesh(new T.SphereGeometry(6000, 24, 12), new T.MeshBasicMaterial({ map: tSky, side: T.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -3; scene.add(sky);
  const rangeGeo = new T.CylinderGeometry(5200, 5200, 1500, 48, 1, true);
  (function () { const uv = rangeGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 3); })();
  const tRanges = tex(rangesCanvas(), true); tRanges.wrapT = T.ClampToEdgeWrapping;
  const ranges = new T.Mesh(rangeGeo, new T.MeshBasicMaterial({ map: tRanges, side: T.BackSide, transparent: true, depthWrite: false, fog: false, alphaTest: 0.02 }));
  ranges.renderOrder = -2; scene.add(ranges);

  /* the snow: a strip of the hill around the camera, rebuilt as the rider goes down */
  const tSnow = tex(snowCanvas(), true);
  const snowGeo = new T.BufferGeometry();
  const nx = XS.length, nv = ROWS_N * nx;
  snowGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(nv * 3), 3));
  snowGeo.setAttribute("normal", new T.BufferAttribute(new Float32Array(nv * 3), 3));
  snowGeo.setAttribute("uv", new T.BufferAttribute(new Float32Array(nv * 2), 2));
  const sCol = new Float32Array(nv * 3);
  (function () {
    const idx = [];
    for (let r = 0; r < ROWS_N - 1; r++) for (let c = 0; c < nx - 1; c++) { const a = r * nx + c; idx.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx); }
    snowGeo.setIndex(idx);
    for (let r = 0; r < ROWS_N; r++) for (let c = 0; c < nx; c++) {
      const ax = Math.abs(XS[c]), i = (r * nx + c) * 3, k = ax <= 200 ? 1 : clamp(1 - (ax - 200) / 500, 0, 1);
      sCol[i] = 0.86 + 0.14 * k; sCol[i + 1] = 0.91 + 0.09 * k; sCol[i + 2] = 1;
    }
    snowGeo.setAttribute("color", new T.BufferAttribute(sCol, 3));
  })();
  const snow = new T.Mesh(snowGeo, new T.MeshLambertMaterial({ map: tSnow, vertexColors: true }));
  snow.frustumCulled = false; scene.add(snow);

  /* the netting each side, and its posts */
  const netGeo = new T.BufferGeometry();
  netGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(ROWS_N * 2 * 2 * 3), 3));
  netGeo.setAttribute("uv", new T.BufferAttribute(new Float32Array(ROWS_N * 2 * 2 * 2), 2));
  (function () { const idx = []; for (let s = 0; s < 2; s++) for (let r = 0; r < ROWS_N - 1; r++) { const a = s * ROWS_N * 2 + r * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } netGeo.setIndex(idx); })();
  const tNet = tex(netCanvas(), true);
  const net = new T.Mesh(netGeo, new T.MeshBasicMaterial({ map: tNet, transparent: true, alphaTest: 0.3, side: T.DoubleSide }));
  net.frustumCulled = false; scene.add(net);
  const postGeo = new T.CylinderGeometry(1.1, 1.1, 20, 6); postGeo.translate(0, 10, 0);
  const posts = new T.InstancedMesh(postGeo, new T.MeshLambertMaterial({ color: 0x2b2f3d }), 140);
  posts.frustumCulled = false; scene.add(posts);

  /* forest beyond the netting, and the course's own trees, rocks, boxes and cases */
  const vc = new T.MeshLambertMaterial({ vertexColors: true });
  const pine = pineGeo(T, K, 0x1f6b40, 0xf6faff), pine2 = pineGeo(T, K, 0x2a7a52, 0xffffff);
  const forest = new T.InstancedMesh(pine2, vc, 340); forest.frustumCulled = false; scene.add(forest);
  const trees = new T.InstancedMesh(pine, vc, 160); trees.frustumCulled = false; scene.add(trees);
  const rocks = new T.InstancedMesh(rockGeo(T), vc, 120); rocks.frustumCulled = false; scene.add(rocks);
  const shine = function (map) { return new T.MeshPhongMaterial({ map: map, specular: 0x666666, shininess: 50 }); };
  const boxes = new T.InstancedMesh(roundBox(T, 28, 18, 24, 1.6), new T.MeshLambertMaterial({ map: tex(boxCanvas(script)) }), 120);
  boxes.frustumCulled = false; scene.add(boxes);
  const caseTop = shine(tex(caseCanvas(script))), caseSide = new T.MeshPhongMaterial({ color: 0x16171d, specular: 0x777777, shininess: 60 });
  const cases = new T.InstancedMesh(roundBox(T, 20, 3.2, 26, 0.9), [caseSide, caseSide, caseTop, caseSide, caseSide, caseSide], 360);
  cases.frustumCulled = false; scene.add(cases);
  const discGeo = new T.CylinderGeometry(9.5, 9.5, 0.9, 30); discGeo.rotateX(Math.PI / 2);
  const tDisc = tex(discCanvas());
  const discMat = new T.MeshPhongMaterial({ map: tDisc, emissiveMap: tDisc, emissive: 0x6a6a6a, specular: 0xffffff, shininess: 120, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.18 });
  const discs = new T.InstancedMesh(discGeo, [new T.MeshPhongMaterial({ color: 0xdfe6f2, specular: 0xffffff, shininess: 120 }), discMat, discMat], 220);
  discs.frustumCulled = false; scene.add(discs);
  const tShadow = tex(shadowCanvas());
  const shadowMat = decal(new T.MeshBasicMaterial({ map: tShadow, opacity: 0.55 }), 2);
  const shadows = new T.InstancedMesh(unit, shadowMat, 420); shadows.frustumCulled = false; shadows.renderOrder = 2; scene.add(shadows);
  const tGlow = tex((function () { const c = mkCanvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,250,200,1)"); gr.addColorStop(0.35, "rgba(255,220,90,.55)"); gr.addColorStop(1, "rgba(255,220,90,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; })());
  const glows = [];
  for (let i = 0; i < 6; i++) { const sp = new T.Sprite(new T.SpriteMaterial({ map: tGlow, blending: T.AdditiveBlending, depthWrite: false, transparent: true })); sp.visible = false; scene.add(sp); glows.push(sp); }

  /* kickers */
  const rampMat = new T.MeshLambertMaterial({ map: tex(rampCanvas()) }), rampUsed = new T.MeshLambertMaterial({ map: rampMat.map, color: 0xc9d8ea });
  const rampG = rampGeo(T), flagPole = new T.CylinderGeometry(0.6, 0.6, 22, 6); flagPole.translate(0, 11, 0);
  const flagG = new T.PlaneGeometry(9, 6); flagG.translate(4.5, 18, 0);
  const orangeM = new T.MeshLambertMaterial({ color: 0xff7a14, side: T.DoubleSide }), poleM = new T.MeshLambertMaterial({ color: 0x2b2f3d });
  const ramps = [];
  for (let i = 0; i < 4; i++) {
    const g = new T.Group(), body = new T.Mesh(rampG, rampMat); g.add(body);
    [-1, 1].forEach(function (s) { const p = new T.Mesh(flagPole, poleM); p.position.set(s * 27, 0, -12); g.add(p); const f = new T.Mesh(flagG, orangeM); f.position.set(s * 27, 0, -12); f.scale.x = s; g.add(f); });
    g.visible = false; scene.add(g); ramps.push({ g: g, body: body });
  }

  /* slalom gates: red panel on the left, blue on the right, each on two poles */
  const panelRed = new T.MeshLambertMaterial({ map: tex(panelCanvas(script, "#ff4b3e", "#c4170f")), side: T.DoubleSide });
  const panelBlue = new T.MeshLambertMaterial({ map: tex(panelCanvas(script, "#3d7bff", "#123fb0")), side: T.DoubleSide });
  const gatePole = new T.CylinderGeometry(0.8, 0.8, 34, 6); gatePole.translate(0, 17, 0);
  const panelG = new T.PlaneGeometry(16, 16); panelG.translate(0, 22, 0);
  const gates = [];
  for (let i = 0; i < 8; i++) {
    const g = new T.Group(), mats = [panelRed.clone(), panelBlue.clone()], pm = new T.MeshLambertMaterial({ color: 0xf2f2f2 });
    [-1, 1].forEach(function (s, k) {
      const side = new T.Group(); side.position.x = s * 46;
      [-8, 8].forEach(function (dx) { const p = new T.Mesh(gatePole, pm); p.position.x = dx; side.add(p); });
      const pn = new T.Mesh(panelG, mats[k]); side.add(pn);
      side.rotation.y = s * 0.12; g.add(side);
    });
    g.visible = false; scene.add(g); gates.push({ g: g, mats: mats });
  }

  /* LED gantries across the run: two pylons, a truss, the ribbon board, a banner on top */
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);             // one texel per LED, never smoothed
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas());         // one LED lens, tiled; its mipmaps fade the dots out cleanly at a distance
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
      "  gl_FragColor = vec4(col, 1.0);",
      "  #include <" + csChunk + ">",
      "}"
    ].join("\n")
  });
  const LED_Y = 92;                                          // bottom of the board above the snow
  const navy = new T.MeshPhongMaterial({ color: 0x16245e, specular: 0x6677aa, shininess: 40 }), orange = new T.MeshPhongMaterial({ color: 0xff9214, specular: 0xffffff, shininess: 60 });
  const tBanner = tex(bannerCanvas(script, ["MOUNT BACKLOG"])), tStart = tex(startCanvas(script)), tFinish = tex(finishCanvas(script));
  const topMats = { run: new T.MeshBasicMaterial({ map: tBanner }), start: new T.MeshBasicMaterial({ map: tStart }), finish: new T.MeshBasicMaterial({ map: tFinish }) };
  const tPylon = tex((function () { const c = mkCanvas(256, 512), g = c.getContext("2d"), bg = g.createLinearGradient(0, 0, 256, 0);
    bg.addColorStop(0, "#0b3aa6"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6"); g.fillStyle = bg; g.fillRect(0, 0, 256, 512);
    g.fillStyle = "#ff9214"; g.fillRect(0, 0, 256, 16); g.fillRect(0, 496, 256, 16);
    g.save(); g.translate(128, 256); g.rotate(-Math.PI / 2); drawScript(g, script, 0, 0, 440, 200); g.restore(); return c; })());
  const pylonMat = new T.MeshPhongMaterial({ map: tPylon, specular: 0x555555, shininess: 30 });
  const pylonGeo = roundBox(T, 16, LED_Y + LED_HT + 22, 14, 3);
  const gantries = [];
  for (let i = 0; i < 3; i++) {
    const g = new T.Group();
    [-1, 1].forEach(function (s) { const p = new T.Mesh(pylonGeo, [pylonMat, pylonMat, navy, navy, pylonMat, pylonMat]); p.position.set(s * (LED_W / 2 + 10), (LED_Y + LED_HT + 22) / 2, 0); g.add(p); });
    const house = new T.Mesh(new T.BoxGeometry(LED_W + 6, LED_HT + 6, 5), navy); house.position.set(0, LED_Y + LED_HT / 2, -2.8); g.add(house);
    const face = new T.Mesh(new T.PlaneGeometry(LED_W, LED_HT), ledMat); face.position.set(0, LED_Y + LED_HT / 2, 0); g.add(face);
    const trim = new T.Mesh(new T.BoxGeometry(LED_W + 8, 3, 7), orange); trim.position.set(0, LED_Y - 1.5, -2.5); g.add(trim);
    const top = new T.Mesh(new T.PlaneGeometry(150, 37.5), topMats.run); top.position.set(0, LED_Y + LED_HT + 22, 0.2); g.add(top);
    const topBack = new T.Mesh(new T.BoxGeometry(154, 41, 4), navy); topBack.position.set(0, LED_Y + LED_HT + 22, -2.2); g.add(topBack);
    g.visible = false; scene.add(g); gantries.push({ g: g, top: top });
  }

  /* banners on the netting, angled toward the riders coming down */
  const bannerMats = [["MOUNT BACKLOG"], ["FREE PLAY"], ["NO QUARTERS", "REQUIRED"], ["POWDER", "DAY HAUL"], ["BE KIND,", "REWIND"]].map(function (w) {
    return new T.MeshBasicMaterial({ map: tex(bannerCanvas(script, w)) });
  });
  const banners = [];
  for (let i = 0; i < 6; i++) {
    const g = new T.Group(), b = new T.Mesh(new T.PlaneGeometry(96, 24), bannerMats[0]); b.position.y = 30; g.add(b);
    const back = new T.Mesh(new T.BoxGeometry(98, 26, 1.5), navy); back.position.set(0, 30, -1); g.add(back);
    [-44, 44].forEach(function (x) { const p = new T.Mesh(postGeo, poleM); p.scale.y = 1.5; p.position.x = x; g.add(p); });
    g.visible = false; scene.add(g); banners.push({ g: g, b: b });
  }

  /* the start hut and the lodge at the bottom */
  const woodM = new T.MeshLambertMaterial({ color: 0x8a5a2e }), roofM = new T.MeshLambertMaterial({ color: 0xb8352a }), snowM = new T.MeshLambertMaterial({ color: 0xf6faff });
  function cabin(w, h, d, signTex, sw, sh) {
    const g = new T.Group();
    const walls = new T.Mesh(roundBox(T, w, h, d, 2), woodM); walls.position.y = h / 2; g.add(walls);
    const ov = 8, rh = h * 0.5;                              // a gable roof, red under a blanket of snow
    const rs = new T.Shape([new T.Vector2(-w / 2 - ov, 0), new T.Vector2(w / 2 + ov, 0), new T.Vector2(0, rh)]);
    const roofG = new T.ExtrudeGeometry(rs, { depth: d + ov * 2, bevelEnabled: false }); roofG.translate(0, 0, -(d + ov * 2) / 2);
    const roof = new T.Mesh(roofG, roofM); roof.position.y = h; g.add(roof);
    const k = 0.6, cs = new T.Shape([new T.Vector2(-(w / 2 + ov) * k, rh * (1 - k)), new T.Vector2((w / 2 + ov) * k, rh * (1 - k)), new T.Vector2(0, rh + 2.5)]);
    const capG = new T.ExtrudeGeometry(cs, { depth: d + ov * 2 + 2, bevelEnabled: false }); capG.translate(0, 0.6, -(d + ov * 2 + 2) / 2);
    const cap = new T.Mesh(capG, snowM); cap.position.y = h; g.add(cap);
    const sign = new T.Mesh(new T.PlaneGeometry(sw, sh), new T.MeshBasicMaterial({ map: signTex })); sign.position.set(0, h * 0.62, d / 2 + 0.6); g.add(sign);
    const door = new T.Mesh(new T.PlaneGeometry(w * 0.16, h * 0.42), new T.MeshLambertMaterial({ color: 0x3c220d })); door.position.set(-w * 0.3, h * 0.21, d / 2 + 0.5); g.add(door);
    const win = new T.MeshBasicMaterial({ color: 0xffe9a0 });
    [w * 0.3].forEach(function (x) { const m = new T.Mesh(new T.PlaneGeometry(w * 0.16, h * 0.18), win); m.position.set(x, h * 0.26, d / 2 + 0.5); g.add(m); });
    scene.add(g);
    return g;
  }
  const hut = cabin(110, 64, 80, tex(woodSignCanvas(script, "START HUT", "RIDE AT YOUR OWN RISK")), 96, 36);
  const lodge = cabin(420, 150, 160, tex(woodSignCanvas(script, "MOUNT BACKLOG LODGE", "HOT COCOA AND FREE PLAY")), 300, 112);
  const finishLine = new T.Mesh(unit, decal(new T.MeshBasicMaterial({ map: tex((function () { const c = mkCanvas(256, 32), g = c.getContext("2d");
    for (let x = 0; x < 32; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? "#101219" : "#ffffff"; g.fillRect(x * 8, y * 8, 8, 8); } return c; })()) }), 1));
  finishLine.scale.set(400, 1, 16); finishLine.renderOrder = 1; scene.add(finishLine);

  /* the rider and the board */
  const mats = {
    vc: vc, face: new T.MeshPhongMaterial({ vertexColors: true, specular: 0x222222, shininess: 22 }),
    boardTop: new T.MeshPhongMaterial({ map: tex(boardCanvas(script)), specular: 0xffffff, shininess: 90, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12 }),
    boardEdge: new T.MeshPhongMaterial({ color: 0x1a1c24, specular: 0xaaaaaa, shininess: 80 })
  };
  const wardrobeSet = wardrobe(T, script, tex);
  const rider = makeFigure(T, K, wardrobeSet.rider, mats);
  const bm = boardMeshes(T, K, mats);
  rider.body.add(bm.board); rider.body.add(bm.bind);
  const rig = new T.Group(); rig.rotation.order = "XYZ";
  const edge = new T.Group(); rig.add(edge);
  const turn = new T.Group(); turn.rotation.y = Math.PI / 2; edge.add(turn);
  turn.add(rider.root);
  scene.add(rig);
  const riderShadow = new T.Mesh(unit, decal(new T.MeshBasicMaterial({ map: tShadow, opacity: 0.6 }), 3)); riderShadow.renderOrder = 3; scene.add(riderShadow);
  /* the crowd */
  const crowd = wardrobeSet.crowd.map(function (lk) { const f = makeFigure(T, K, lk, mats); f.root.visible = false; scene.add(f.root); f.pose = new Array(POSE_N).fill(0); return f; });

  /* the carve track behind the board */
  const TRAIL_N = 110;
  const trailGeo = new T.BufferGeometry();
  trailGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
  trailGeo.setAttribute("color", new T.BufferAttribute(new Float32Array(TRAIL_N * 2 * 4), 4));
  (function () { const idx = []; for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } trailGeo.setIndex(idx); })();
  const trail = new T.Mesh(trailGeo, decal(new T.MeshBasicMaterial({ vertexColors: true }), 1));
  trail.frustumCulled = false; trail.renderOrder = 1; scene.add(trail);

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, script: script, hemi: hemi, sun: sun, fill: fill,
    sky: sky, cSky: cSky, tSky: tSky, skyId: "", ranges: ranges,
    snow: snow, snowGeo: snowGeo, net: net, netGeo: netGeo, posts: posts, row0: null,
    forest: forest, trees: trees, rocks: rocks, boxes: boxes, cases: cases, discs: discs, shadows: shadows, glows: glows,
    ramps: ramps, rampMat: rampMat, rampUsed: rampUsed, gates: gates, gantries: gantries, topMats: topMats, banners: banners, bannerMats: bannerMats,
    hut: hut, lodge: lodge, finishLine: finishLine, gantryAt: [], bannerAt: [], spots: [],
    rider: rider, rig: rig, edge: edge, riderShadow: riderShadow, crowd: crowd, trail: trail, trailGeo: trailGeo, TRAIL_N: TRAIL_N,
    m4: new T.Matrix4(), q4: new T.Quaternion(), e4: new T.Euler(), v4: new T.Vector3(), s4: new T.Vector3(), c4: new T.Color(),
    v: new T.Vector3(), v2: new T.Vector3(), camObj: new T.PerspectiveCamera(), qa: new T.Quaternion(), qb: new T.Quaternion(),
    camPos: new T.Vector3(), camQ: new T.Quaternion(), blend: 0, camY: null, pose: new Array(POSE_N).fill(0), poseB: new Array(POSE_N).fill(0),
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0, map: { cx: W / 2, k: 1 }, ppu: 1,
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, crowdOn: true, forestN: 340, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
}

// A box with every edge and corner rounded. Each face keeps its own material slot (+x -x +y -y +z -z),
// and its texture is stretched corner to corner.
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

// Where the gantries, banners and onlookers stand on this run. Gantries keep clear of the kickers, so nobody jumps into a board.
function placeCourseDressing() {
  if (!R || !S.obs) return;
  const ramps = S.obs.filter(function (o) { return o.t === "ramp"; }).map(function (o) { return o.y; });
  function clear(d) { for (let i = 0; i < ramps.length; i++) if (d > ramps[i] - 140 && d < ramps[i] + 520) return false; return true; }
  const at = [{ d: 150, kind: "start" }];
  for (let d = 1500; d < LEN - 1200; d += 2400) {
    let k = d, n = 0;
    while (!clear(k) && n < 30) { k += 60; n++; }
    if (clear(k) && k < LEN - 900) at.push({ d: k, kind: "run" });
  }
  at.push({ d: LEN, kind: "finish" });
  R.gantryAt = at;
  const b = [];
  for (let d = 300, i = 0; d < LEN; d += 640, i++) b.push({ d: d + (i % 2) * 120, side: i % 2 ? 1 : -1, m: i % R.bannerMats.length });
  R.bannerAt = b;
  // onlookers: by the start, by every gantry, a few along the netting, a crowd at the finish
  const sp = [{ d: 30, x: -236, k: 0 }, { d: 60, x: 240, k: 2 }];
  at.forEach(function (g, i) { if (g.kind === "run") { sp.push({ d: g.d - 30, x: -(LED_W / 2 + 34), k: i }); sp.push({ d: g.d + 10, x: LED_W / 2 + 36, k: i + 3 }); } });
  for (let d = 900; d < LEN - 300; d += 1300) sp.push({ d: d, x: (d / 1300 | 0) % 2 ? 232 : -232, k: d / 1300 | 0 });
  [[-60, -250], [-40, 250], [10, -300], [30, 300], [80, -230], [90, 228]].forEach(function (p, i) { sp.push({ d: LEN + p[0], x: p[1], k: i }); });
  sp.sort(function (a, b2) { return a.d - b2.d; });
  R.spots = sp;
  R.spotFig = new Map();
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
// pr = pixel ratio cap, crowd = the onlookers along the run, forest = how many pines line it
const QUALITY = [{ pr: 2, crowd: true, forest: 340 }, { pr: 1.5, crowd: true, forest: 340 }, { pr: 1.15, crowd: true, forest: 220 }, { pr: 1, crowd: false, forest: 140 }];

function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  R.crowdOn = QUALITY[R.quality].crowd;
  R.forestN = QUALITY[R.quality].forest;
  R.row0 = null;                                            // re-plant the forest at the new density
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
    if (++R.slowHits >= 2) { R.slowHits = 0; setQuality(R.quality + 1); }   // two slow seconds in a row, not one hiccup
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

/* ---------------- Course <-> screen ---------------- */
// Screen x (HUD pixels) -> course x at the rider's distance. The chase camera never slides sideways, so this is a
// fixed straight line, recomputed every frame from the camera itself.
function screenToCourseX(sx) { return R ? W / 2 + (sx - R.map.cx) * R.map.k : sx; }
// Course point (x across, d down, h above the snow) -> HUD pixels, plus how many pixels one unit covers there.
function toScreen(x, d, h) {
  R.v.set(x - W / 2, gy(d) + (h || 0), -d);
  const dist = R.v.distanceTo(R.camera.position);
  R.v.project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1, k: H / (2 * Math.max(1, dist) * Math.tan(CAM.fov * DEG / 2)) };
}

/* ---------------- The hill around the camera ---------------- */
function rebuildHill(row0) {
  const nx = XS.length, P = R.snowGeo.attributes.position, U = R.snowGeo.attributes.uv;
  for (let r = 0; r < ROWS_N; r++) {
    const d = row0 + r * ROW;
    for (let c = 0; c < nx; c++) {
      const i = r * nx + c, x = XS[c];
      P.setXYZ(i, x, ground(d, x), -d); U.setXY(i, x / 96, d / 96);
    }
  }
  P.needsUpdate = U.needsUpdate = true;
  R.snowGeo.computeVertexNormals();
  R.snowGeo.computeBoundingSphere();
  const NP = R.netGeo.attributes.position, NU = R.netGeo.attributes.uv;
  for (let s = 0; s < 2; s++) {
    const x = s ? FENCE_X : -FENCE_X;
    for (let r = 0; r < ROWS_N; r++) {
      const d = row0 + r * ROW, y = ground(d, x), i = s * ROWS_N * 2 + r * 2;
      NP.setXYZ(i, x, y - 1, -d); NP.setXYZ(i + 1, x, y + 17, -d);
      NU.setXY(i, d / 32, 0); NU.setXY(i + 1, d / 32, 1);
    }
  }
  NP.needsUpdate = NU.needsUpdate = true;
  // posts along the netting
  const m = R.m4, q = R.q4, sc = R.s4.set(1, 1, 1), v = R.v4;
  let n = 0;
  for (let d = Math.ceil(row0 / 64) * 64; d < row0 + ROWS_N * ROW && n < 138; d += 64) {
    for (let s = -1; s <= 1; s += 2) { q.identity(); R.posts.setMatrixAt(n++, m.compose(v.set(s * FENCE_X, ground(d, s * FENCE_X) - 1, -d), q, sc)); }
  }
  R.posts.count = n; R.posts.instanceMatrix.needsUpdate = true;
  // the forest beyond the netting
  n = 0;
  const e = R.e4;
  for (let d = Math.ceil(row0 / 70) * 70; d < row0 + ROWS_N * ROW; d += 70) {
    for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 4 && n < R.forestN; k++) {
      const h1 = hash(d * 0.013 + k * 7.1 + s * 3.3), h2 = hash(d * 0.021 + k * 2.7 - s), x = s * (238 + k * 150 + h1 * 120);
      const z = 0.85 + h2 * 0.6;
      e.set(0, h1 * TAU, 0); q.setFromEuler(e);
      R.forest.setMatrixAt(n++, m.compose(v.set(x, ground(d + h2 * 40, x) - 2, -(d + h2 * 40)), q, R.s4.set(z, z * (0.9 + h1 * 0.4), z)));
    }
  }
  R.forest.count = n; R.forest.instanceMatrix.needsUpdate = true;
}

/* ---------------- Game state -> meshes ---------------- */
function firstAt(d) {                                       // first course object at or past d (the list is sorted)
  const a = S.obs; let lo = 0, hi = a.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid].y < d) lo = mid + 1; else hi = mid; }
  return lo;
}
function syncCourse(t, idle) {
  const m = R.m4, q = R.q4, e = R.e4, v = R.v4, sc = R.s4;
  let nt = 0, nr = 0, nb = 0, nc = 0, nd = 0, ns = 0, ng = 0, nrp = 0, ngt = 0;
  const shadow = function (x3, d, rad) {
    if (ns >= 420) return;
    e.set(Math.atan(gyd(d)), 0, 0); q.setFromEuler(e);
    R.shadows.setMatrixAt(ns++, m.compose(v.set(x3 + 3, gy(d) + 0.25, -d - 2), q, sc.set(rad * 2.8, 1, rad * 2.4)));
  };
  for (let i = firstAt(S.d - 460); i < S.obs.length; i++) {
    const o = S.obs[i];
    if (o.y > S.d + VIEW) break;
    const x3 = o.x - W / 2, gyy = gy(o.y), hh = hash(o.y * 0.37 + o.x * 0.11), pitch = Math.atan(gyd(o.y));
    if (o.t === "tree" && nt < 160) {
      const z = 0.92 + hh * 0.3; e.set(0, hh * TAU, 0); q.setFromEuler(e);
      R.trees.setMatrixAt(nt++, m.compose(v.set(x3, gyy - 1, -o.y), q, sc.set(z, z, z))); shadow(x3, o.y, 15);
    } else if (o.t === "rock" && nr < 120) {
      e.set(pitch, hh * TAU, 0); q.setFromEuler(e);
      R.rocks.setMatrixAt(nr++, m.compose(v.set(x3, gyy - 1.5, -o.y), q, sc.set(1, 1, 1))); shadow(x3, o.y, 12);
    } else if (o.t === "box" && !o.gone && nb < 120) {
      e.set(pitch, (hh - 0.5) * 0.7, 0, "XYZ"); q.setFromEuler(e);
      R.boxes.setMatrixAt(nb++, m.compose(v.set(x3, gyy + 8.5, -o.y), q, sc.set(1, 1, 1))); shadow(x3, o.y, 14);
    } else if (o.t === "cases" && !o.gone && nc < 357) {
      for (let k = 0; k < 3; k++) {
        e.set(pitch, (hash(o.y + k * 3.1) - 0.5) * 0.9, 0, "XYZ"); q.setFromEuler(e);
        R.cases.setMatrixAt(nc, m.compose(v.set(x3 + (k - 1) * 2, gyy + 1.4 + k * 3.3, -o.y + (k - 1) * 1.5), q, sc.set(1, 1, 1)));
        R.cases.setColorAt(nc++, R.c4.set(k === 0 ? 0xffffff : k === 1 ? 0xbfe6ff : 0xffc6e6));
      }
      shadow(x3, o.y, 13);
    } else if (o.t === "disc" && !o.gone && nd < 220) {
      e.set(0, Math.sin(t * 1.7 + hh * 9) * 0.55, t * 3 + hh * TAU, "XYZ"); q.setFromEuler(e);   // face up the hill, turning like a record
      R.discs.setMatrixAt(nd++, m.compose(v.set(x3, gyy + 13 + Math.sin(t * 3 + hh * 9) * 2, -o.y), q, sc.set(1, 1, 1)));
    } else if (o.t === "rare" && !o.gone && ng < R.glows.length) {
      const sp = R.glows[ng++]; sp.visible = true; sp.position.set(x3, gyy + 18, -o.y);
      const s = 46 + Math.sin(t * 6) * 6; sp.scale.set(s, s, 1);
    } else if (o.t === "ramp" && nrp < R.ramps.length) {
      const rp = R.ramps[nrp++]; rp.g.visible = true; rp.g.position.set(x3, gyy - 0.5, -o.y); rp.g.rotation.set(pitch, 0, 0);
      rp.body.material = o.gone ? R.rampUsed : R.rampMat;
    } else if (o.t === "gate" && ngt < R.gates.length) {
      const gt = R.gates[ngt++]; gt.g.visible = true; gt.g.position.set(x3, gyy - 0.5, -o.y);
      for (let k = 0; k < 2; k++) gt.mats[k].color.setScalar(o.done ? 0.45 : 1);
    }
  }
  R.trees.count = nt; R.rocks.count = nr; R.boxes.count = nb; R.cases.count = nc; R.discs.count = nd; R.shadows.count = ns;
  [R.trees, R.rocks, R.boxes, R.cases, R.discs, R.shadows].forEach(function (im) { im.instanceMatrix.needsUpdate = true; });
  if (R.cases.instanceColor) R.cases.instanceColor.needsUpdate = true;
  for (let i = ng; i < R.glows.length; i++) R.glows[i].visible = false;
  for (let i = nrp; i < R.ramps.length; i++) R.ramps[i].g.visible = false;
  for (let i = ngt; i < R.gates.length; i++) R.gates[i].g.visible = false;

  // gantries, banners, the start hut, the lodge, the finish line
  let k = 0;
  for (let i = 0; i < R.gantryAt.length && k < R.gantries.length; i++) {
    const ga = R.gantryAt[i];
    // a gantry the rider has gone under is between the camera and the rider: it is taken down
    if (ga.d < S.d + (idle ? -600 : 6) || ga.d > S.d + VIEW + 300) continue;
    const g = R.gantries[k++];
    g.g.visible = true; g.g.position.set(0, gy(ga.d) - 1, -ga.d);
    g.top.material = R.topMats[ga.kind];
  }
  for (; k < R.gantries.length; k++) R.gantries[k].g.visible = false;
  k = 0;
  for (let i = 0; i < R.bannerAt.length && k < R.banners.length; i++) {
    const ba = R.bannerAt[i];
    if (ba.d < S.d - 500 || ba.d > S.d + VIEW) continue;
    const b = R.banners[k++], x = ba.side * (FENCE_X + 44);
    b.g.visible = true; b.g.position.set(x, ground(ba.d, x) - 1, -ba.d); b.g.rotation.y = -ba.side * 0.55;
    b.b.material = R.bannerMats[ba.m];
  }
  for (; k < R.banners.length; k++) R.banners[k].g.visible = false;
  R.hut.position.set(-300, ground(140, -300) - 2, -140);
  R.lodge.position.set(0, gy(LEN + 420) - 3, -(LEN + 420));
  R.finishLine.position.set(0, gy(LEN) + 0.3, -LEN); R.finishLine.rotation.x = Math.atan(gyd(LEN));
}

// The onlookers: each stays with the spot it was given until that spot is well behind the camera.
function syncCrowd(t, idle) {
  const free = [], used = R.spotFig || (R.spotFig = new Map());
  const lo = S.d - 480, hi = S.d + 1900;
  used.forEach(function (fi, sp) { if (sp.d < lo || sp.d > hi || !R.crowdOn) used.delete(sp); });
  const taken = new Set(); used.forEach(function (fi) { taken.add(fi); });
  for (let i = 0; i < R.crowd.length; i++) if (!taken.has(i)) free.push(i);
  if (R.crowdOn) for (let i = 0; i < R.spots.length && free.length; i++) {
    const sp = R.spots[i];
    if (sp.d < lo || sp.d > hi || used.has(sp)) continue;
    used.set(sp, free.shift());
  }
  for (let i = 0; i < R.crowd.length; i++) R.crowd[i].root.visible = false;
  const rx = S.x - W / 2, rz = -S.d;
  used.forEach(function (fi, sp) {
    const F = R.crowd[fi], P = F.pose;
    F.root.visible = true;
    F.root.position.set(sp.x, ground(sp.d, sp.x) - 0.5, -sp.d);
    const fx = -Math.sign(sp.x), fz = 0.9, yaw = Math.atan2(fx, fz);    // facing the run and up the hill
    F.root.rotation.y = yaw;
    const near = !idle && Math.abs(S.d - sp.d) < 520, ph = fi * 1.7;
    const base = CP[near ? F.look.pose : "idle"];
    for (let n = 0; n < POSE_N; n++) P[n] += (base[n] - P[n]) * 0.12;
    const out = R.poseB; for (let n = 0; n < POSE_N; n++) out[n] = P[n];
    const calm = Shell.reduced ? 0 : 1;
    out[1] += Math.sin(t * 2 + ph) * 0.03 * calm;
    if (near && F.look.pose === "cheer") { out[7] += Math.sin(t * 7 + ph) * 0.45 * calm; out[10] -= Math.sin(t * 7 + ph) * 0.45 * calm; out[8] += Math.abs(Math.sin(t * 7 + ph)) * 0.3 * calm; out[1] += Math.abs(Math.sin(t * 7 + ph)) * 0.12 * calm; }
    if (near && F.look.pose === "clap") { const c = Math.abs(Math.sin(t * 8 + ph)) * 0.35 * calm; out[7] += c; out[10] -= c; }
    if (near && F.look.pose === "point") out[8] += Math.sin(t * 3 + ph) * 0.15 * calm;
    // eyes on the rider
    const dx = rx - sp.x, dz = rz - (-sp.d), look = (Math.atan2(dx, dz) - yaw) / DEG;
    let rel = ((look + 540) % 360) - 180;
    out[19] = clamp(rel, -75, 75); if (idle) out[19] = Math.sin(t * 0.4 + ph) * 30;
    applyPose(F, out);
  });
}

function syncRider(state, fdt, idle) {
  const Rd = R.rider, out = R.poseB, P = R.pose;
  let target, heading = 0, lift = 0, roll = 0;
  const calm = Shell.reduced;
  if (idle) {
    target = state === "over" ? (S.finished ? RP.cheer : RP.slump) : RP.stand;
  } else if (S.crash > 0) target = RP.crash;
  else if (S.phase === "done") target = S.finished ? RP.cheer : RP.slump;
  else if (S.air > 0) target = RP.air;
  else {
    const c = S.carve;
    poseMix(RP.ride, c >= 0 ? RP.toe : RP.heel, Math.min(1, Math.abs(c) * 1.15), out);
    target = out.slice();
  }
  const rate = S.crash > 0 || S.air > 0 ? 14 : 9;
  for (let n = 0; n < POSE_N; n++) P[n] += (target[n] - P[n]) * Math.min(1, fdt * rate);
  for (let n = 0; n < POSE_N; n++) out[n] = P[n];
  const t = R.clock;
  if (!calm) {
    out[1] += Math.sin(t * 2.4) * 0.03;
    if (idle && state === "title") { out[7] += Math.sin(t * 7) * 0.35; out[9] += Math.cos(t * 7) * 0.12; }
    if (target === RP.cheer) { const b = Math.abs(Math.sin(t * 6)); out[8] += b * 0.35; out[11] += b * 0.35; out[1] += b * 0.1; }
  }
  if (V.landT > 0) { V.landT = Math.max(0, V.landT - fdt); out[1] -= V.landT * 1.4; out[5] += V.landT * 18; }
  if (V.sketchy > 0) { V.sketchy = Math.max(0, V.sketchy - fdt); out[6] += Math.sin(t * 30) * 10 * V.sketchy; out[22] = 1; }

  if (idle) {
    // look at the camera
    const cp = R.camera.position, dx = cp.x - (S.x - W / 2), dz = cp.z - (-S.d);
    let rel = (Math.atan2(dx, dz) - Math.PI / 2) / DEG; rel = ((rel + 540) % 360) - 180;
    out[19] = clamp(rel, -80, 80); out[20] = -6;
    R.rig.rotation.set(Math.atan(gyd(S.d)), 0, 0);
    R.edge.rotation.z = 0;
    V.crashSpin = 0;
  } else {
    if (S.air > 0) lift = Math.sin(Math.PI * clamp(S.airT / S.air, 0, 1)) * 46;
    heading = Math.atan2(S.vx, Math.max(40, S.v));
    if (S.crash > 0) { V.crashSpin += fdt * (calm ? 3 : 12) * S.crash; V.fall = Math.min(1, V.fall + fdt * 5); }
    else { V.fall = Math.max(0, V.fall - fdt * 3); V.crashSpin *= Math.max(0, 1 - fdt * 6); }
    roll = -S.carve * 0.34 * (S.air > 0 ? 0.3 : 1) + V.fall * 1.15;
    R.edge.rotation.z += (roll - R.edge.rotation.z) * Math.min(1, fdt * 10);
    R.rig.rotation.set(Math.atan(gyd(S.d)) + (S.air > 0 && !calm ? Math.sin(S.airT * 5) * 0.08 : 0), -heading - S.spin * DEG - V.crashSpin, 0);
  }
  applyPose(Rd, out);
  R.rig.position.set(S.x - W / 2, gy(S.d) + 1.1 + lift, -S.d);
  V.lift = lift;
  const sk = clamp(1 - lift / 90, 0.35, 1);
  R.riderShadow.position.set(S.x - W / 2 + 4, gy(S.d) + 0.4, -S.d - 3);
  R.riderShadow.rotation.set(Math.atan(gyd(S.d)), -heading - S.spin * DEG, 0);
  R.riderShadow.scale.set(34 * sk, 1, 70 * sk);
}

function syncTrail(idle) {
  const tr = V.trail;
  if (!idle && S.phase === "ride") {
    const onSnow = S.air <= 0 && S.crash <= 0;
    if (S.d - V.trailD > 6) {
      V.trailD = S.d;
      tr.push({ x: S.x - W / 2, d: S.d, brk: !onSnow });
      if (tr.length > R.TRAIL_N) tr.shift();
    }
  }
  const P = R.trailGeo.attributes.position, C = R.trailGeo.attributes.color, n = tr.length;
  for (let i = 0; i < R.TRAIL_N; i++) {
    const a = tr[Math.min(i, n - 1)];
    if (!a || i >= n) { P.setXYZ(i * 2, 0, -1e4, 0); P.setXYZ(i * 2 + 1, 0, -1e4, 0); C.setXYZW(i * 2, 0, 0, 0, 0); C.setXYZW(i * 2 + 1, 0, 0, 0, 0); continue; }
    const b = tr[Math.min(n - 1, i + 1)], c0 = tr[Math.max(0, i - 1)];
    let dx = b.x - c0.x, dd = b.d - c0.d; const l = Math.hypot(dx, dd) || 1; dx /= l; dd /= l;
    const w = 3.4, y = gy(a.d) + 0.35;
    P.setXYZ(i * 2, a.x - dd * w, y, -a.d - dx * w); P.setXYZ(i * 2 + 1, a.x + dd * w, y, -a.d + dx * w);
    const al = a.brk || (b && b.brk) ? 0 : 0.42 * (i / n);
    C.setXYZW(i * 2, 0.62, 0.74, 0.9, al); C.setXYZW(i * 2 + 1, 0.62, 0.74, 0.9, al);
  }
  P.needsUpdate = C.needsUpdate = true;
}

function syncSky() {
  const id = skyKey();
  if (id === R.skyId) return;
  R.skyId = id;
  paintSky(R.cSky.getContext("2d"), id); R.tSky.needsUpdate = true;
  const k = SKIES[id], f = R.scene.fog;
  f.color.set(k[3]);
  f.near = id === "fog" ? 500 : id === "rain" ? 900 : 1400; f.far = id === "fog" ? 1500 : id === "rain" ? 2400 : 3300;
  R.renderer.setClearColor(k[3], 1);
  R.sun.intensity = id === "twilight" ? 0.9 : id === "fog" || id === "rain" ? 1.3 : 2.2;
  R.sun.color.set(id === "golden" ? 0xffc88a : id === "twilight" ? 0xffa0c0 : 0xfff2dc);
  R.hemi.intensity = id === "twilight" ? 1.0 : 1.5;
  R.hemi.color.set(id === "twilight" ? 0x8a7ac0 : 0xdcecff);
  R.ranges.material.color.set(id === "twilight" ? 0x6a5a9a : id === "fog" ? 0xd8e0ea : 0xffffff);
}

function syncCamera(state, fdt, idle) {
  const cam = R.camera, o = R.camObj, T = R.T;
  const rx = S.x - W / 2, ry = gy(S.d), rz = -S.d;
  // the chase camera
  const want = ry + CAM.up + V.lift * 0.35;
  if (R.camY == null || Math.abs(R.camY - want) > 400) R.camY = want;
  R.camY += (want - R.camY) * Math.min(1, fdt * 6);
  o.position.set(0, R.camY, rz + CAM.back);
  o.lookAt(0, ry + 20, rz); o.rotateX(CAM.tilt * DEG);
  // the pointer line at the rider's distance comes from this camera, before any blend or shake
  cam.position.copy(o.position); cam.quaternion.copy(o.quaternion); cam.updateMatrixWorld();
  R.v.set(-100, ry, rz).project(cam); const xa = (R.v.x * 0.5 + 0.5) * W;
  R.v.set(100, ry, rz).project(cam); const xb = (R.v.x * 0.5 + 0.5) * W;
  if (xb - xa > 1) { R.map.k = 200 / (xb - xa); R.map.cx = (xa + xb) / 2; }
  const chaseP = R.v2.copy(o.position), chaseQ = R.qa.copy(o.quaternion);
  // the showcase camera: swings round the front of the rider on the title card and the score card
  const a = Math.PI / 2 + (Shell.reduced ? 0.5 : Math.sin(idleT * 0.27) * 0.75 + 0.35), rad = 170;
  o.position.set(rx + Math.sin(a) * rad, ry + 62, rz + Math.cos(a) * rad);
  o.lookAt(rx, ry + 40, rz);
  R.blend += ((idle ? 0 : 1) - R.blend) * Math.min(1, fdt * 2.2);
  if (!idle && R.blend > 0.995) R.blend = 1;
  const b = R.blend * R.blend * (3 - 2 * R.blend);
  cam.position.lerpVectors(o.position, chaseP, b);
  cam.quaternion.copy(o.quaternion).slerp(chaseQ, b);
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    cam.position.x += (vrand() * 2 - 1) * m; cam.position.y += (vrand() * 2 - 1) * m;
  }
  cam.updateMatrixWorld();
  R.sky.position.copy(cam.position);
  R.ranges.position.set(cam.position.x, cam.position.y - 1000, cam.position.z);
  R.sun.position.set(rx - 500, ry + 900, rz + 260); R.sun.target.position.set(rx, ry, rz); R.sun.target.updateMatrixWorld();
}

function syncScene(state, fdt) {
  const idle = state === "title" || state === "over";
  R.clock += fdt;
  ledTick(fdt);
  syncSky();
  const row0 = Math.floor((S.d - BACK_ROWS * ROW) / ROW) * ROW;
  if (row0 !== R.row0) { R.row0 = row0; rebuildHill(row0); }
  syncRider(state, fdt, idle);
  syncCamera(state, fdt, idle);
  syncCourse(idle ? idleT : S.t, idle);
  syncCrowd(R.clock, idle);
  syncTrail(idle);
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

// Things pinned to the 3D view: the steering marker, rare carts, sparkle, snow spray, the spin read-out.
function drawWorld(c, state) {
  // snow spray off the tail on a hard carve
  if (state === "playing" && S.phase === "ride" && S.air <= 0 && S.crash <= 0 && Math.abs(S.carve) > 0.55 && !Shell.reduced && vrand() < 0.7) {
    V.parts.push({ x: S.x - Math.sign(S.carve) * 6, d: S.d - 10, h: 2, vx: -S.carve * (60 + vrand() * 60), vd: S.v * 0.5, vh: 40 + vrand() * 50,
                   life: 0.45, max: 0.45, g: 260, c: vrand() < 0.5 ? "#ffffff" : "#e3eefb", s: 3 + vrand() * 2.5 });
  }
  for (let i = 0; i < V.parts.length; i++) {
    const q = V.parts[i], p = toScreen(q.x, q.d, q.h);
    if (!p.ok) continue;
    c.globalAlpha = clamp(q.life / q.max * 1.6, 0, 1);
    const s = Math.max(1.2, q.s * p.k);
    c.fillStyle = q.c; c.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
  c.globalAlpha = 1;
  for (let i = 0; i < V.pops.length; i++) {
    const q = V.pops[i], p = toScreen(q.x, q.d, 22 + q.t * 40);
    if (!p.ok) continue;
    c.globalAlpha = clamp(1.4 - q.t * 1.6, 0, 1);
    txt(c, q.txt, p.x, p.y, 13, "#ffe45c", "center", "#08205f");
  }
  c.globalAlpha = 1;
  if (state !== "playing") return;
  // rare carts, drawn by the extras the same way the 2D game drew them
  if (X) {
    for (let i = firstAt(S.d - 30); i < S.obs.length; i++) {
      const o = S.obs[i];
      if (o.y > S.d + VIEW) break;
      if (o.t !== "rare" || o.gone) continue;
      const p = toScreen(o.x, o.y, 18);
      if (p.ok) X.drawCart(c, p.x, p.y, o.tier.t, S.t, clamp(p.k * 1.4, 0.35, 1.3));
    }
  }
  // where mouse / touch steering is heading
  if (S.tx != null && S.crash <= 0 && Math.abs(S.tx - S.x) >= 4) {
    const p = toScreen(S.tx, S.d, 0.5);
    c.fillStyle = "rgba(8,32,95,.6)";
    c.beginPath(); c.moveTo(p.x, p.y - 7); c.lineTo(p.x - 8, p.y + 6); c.lineTo(p.x + 8, p.y + 6); c.closePath(); c.fill();
    c.strokeStyle = "#ffffff"; c.lineWidth = 1.5; c.stroke();
  }
  // the spin read-out over the rider
  if (S.air > 0 && S.spin > 0) {
    const p = toScreen(S.x, S.d, V.lift + 92), goal = Math.ceil(S.spin / 180 - 1e-6) * 180;
    txt(c, goal + "", p.x, p.y, 16, goal >= 720 ? "#ffe45c" : "#ff3fa4", "center", "#08205f");
    if (spinHeld() && letGo()) txt(c, "LET GO", p.x, p.y - 17, 11, "#ff4b3e", "center", "#ffffff");
  }
}

function drawHUD(c, state) {
  const bg = c.createLinearGradient(0, 0, 0, 50);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, 0, W, 50);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff9214"; c.fillRect(0, 50, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, 52, W, 1);
  txt(c, "SCORE", 10, 5, 9, "#a8ecff", "left", "#08205f");
  txt(c, String(S.score), 10, 17, 17, "#ffe45c", "left", "#08205f");
  txt(c, "DISCS", W / 2, 5, 9, "#a8ecff", "center", "#08205f");
  txt(c, String(S.discs), W / 2, 17, 17, "#ffffff", "center", "#08205f");
  txt(c, "BOARDS", W - 10, 5, 9, "#a8ecff", "right", "#08205f");
  for (let i = 0; i < CRASHES; i++) {                       // a little board for every wipeout left
    const lost = i < S.crashes, x = W - 82 + i * 25, y = 24;
    rrect(c, x, y, 21, 7, 3.5); c.fillStyle = lost ? "#3a3e4c" : "#ff3fa4"; c.fill();
    c.lineWidth = 1; c.strokeStyle = "#08205f"; c.stroke();
    if (!lost) { c.fillStyle = "#ffe45c"; c.fillRect(x + 4, y + 2, 3, 3); c.fillRect(x + 14, y + 2, 3, 3); }
    else txt(c, "X", x + 10.5, y - 3, 10, "#ff4b3e", "center");
  }
  // how far down Mount Backlog
  const k = clamp(S.d / LEN, 0, 1);
  rrect(c, 10, 40, W - 20, 6, 3); c.fillStyle = "#0b1f5e"; c.fill();
  rrect(c, 10, 40, Math.max(6, (W - 20) * k), 6, 3); c.fillStyle = "#9bff3f"; c.fill();
  c.fillStyle = "#ffffff"; c.beginPath(); c.arc(10 + (W - 20) * k, 43, 4, 0, TAU); c.fill();
  // the SPIN button (touch)
  if (state === "playing") {
    const on = S.air > 0;
    rrect(c, BTN.x, BTN.y, BTN.w, BTN.h, 12);
    c.fillStyle = on ? "rgba(255,63,164,.92)" : "rgba(8,32,95,.5)"; c.fill();
    c.lineWidth = 2; c.strokeStyle = on ? "#ffe45c" : "rgba(255,255,255,.55)"; c.stroke();
    txt(c, "SPIN", BTN.x + BTN.w / 2, BTN.y + 10, 17, on ? "#101219" : "#ffffff", "center");
    txt(c, on ? "HOLD ANYWHERE" : "IN THE AIR ONLY", BTN.x + BTN.w / 2, BTN.y + 33, 8, on ? "#101219" : "#a8ecff", "center");
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
  const fdt = state === "paused" || (X && X.eventActive()) ? 0 : Math.min(ms, 50) / 1000;
  if (sized) {
    syncScene(state, fdt);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  drawWorld(c, state);
  if (S.xt) {
    c.textAlign = "left"; c.textBaseline = "alphabetic";       // the extras draw with their own settings
    const area = { x: 0, y: 53, w: W, h: H - 53 };
    X.drawScenery(c, S.xt.sc, S.t, area);
    S.xt.fever.draw(c, area, S.t);
  }
  drawHUD(c, state);
  if (S.xt) { c.textAlign = "left"; c.textBaseline = "alphabetic"; X.drawTag(c, S.xt.sc, 10, H - 12); X.drawEvent(c, W, H); }
}

/* ---------------- Splash, boot, shell hookup ---------------- */
let LOGO_SRC = LOGO_URLS[0];
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
  const load = document.createElement("p");
  load.textContent = "Grooming Mount Backlog...";
  load.style.cssText = "margin:0;font-size:13px;letter-spacing:.06em;color:#a8ecff";
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
// The full logo: tries each file name in turn; plain lettering holds the splash if none loads.
function loadLogo(splash) {
  return new Promise(function (resolve) {
    const img = splash.img;
    let n = 0, done = false;
    function fin(ok) {
      if (done) return; done = true;
      if (ok) { LOGO_SRC = img.src; img.style.opacity = "1"; img.style.transform = "scale(1)"; }
      else {
        img.style.display = "none"; LOGO_SRC = null;
        const t = document.createElement("div");
        t.textContent = "Nostalgia Pro Games";
        t.style.cssText = "font:italic 900 34px/1.2 Georgia,'Times New Roman',serif;color:#f6e8c8;text-shadow:0 3px 0 #12224f";
        splash.el.insertBefore(t, splash.el.firstChild);
      }
      resolve(ok ? img : null);
    }
    img.onload = function () { fin(true); };
    img.onerror = function () { if (++n < LOGO_URLS.length) img.src = LOGO_URLS[n]; else fin(false); };
    setTimeout(function () { fin(false); }, 6000);
    img.src = LOGO_URLS[0];
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
  // the shell canvas becomes a clear HUD layer over the 3D view
  hud.style.background = "transparent";
  if (getComputedStyle(hud).position === "static") hud.style.position = "relative";   // so it stacks above the WebGL canvas
  const crt = stage.querySelector(".np-crt");
  if (crt) crt.style.display = "none";                       // a clear mountain day, no scanlines
  R.lastT = performance.now();
  layout();
}
function logoImg(card, px) {
  if (!card || !LOGO_SRC) return;
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
  im.style.cssText = "display:block;width:clamp(64px," + px + "vh,112px);height:auto;margin:0 auto 6px";
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_SRC;
  card.insertBefore(im, card.firstChild);
}

function startGame() {
  Shell.init({
    slug: "powder-day-haul",
    title: "POWDER DAY HAUL",
    accent: "#a77bff",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "Carve down Mount Backlog in real 3D and grab the loose discs before the bottom. Touch: slide your finger left or right and the rider follows it. Hit a ramp, then hold anywhere in the air to spin. Let go and the board finishes the turn.",
    keys: "Keys: left and right (or A and D) carve, Up (or W) slows you down, hold Space in the air to spin. Mouse: the rider follows the cursor, click and hold in the air to spin. P pause, M mute, N music, R restart.",
    tip: "Three wipeouts and you're done. Let go of SPIN when LET GO shows up or you land sideways.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; partsTick(dt); },
    onPause: function () { for (var k in keys) keys[k] = false; S.ptrSteer = 0; S.holdSpin = false; S.spinIds = {}; if (S.ptrId != null) S.tx = null; }
  });
  attach();
  bindExtraTouch();
  // Sound. Nothing is created until the first tap, click or key press; the music starts with the run.
  ["pointerdown", "pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Snd.unlock, true); });
  Shell.onStart(Snd.newGame); Shell.onRestart(Snd.newGame); Shell.onResume(Snd.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));   // not while initials are being typed
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Snd.toggleMusic();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) Snd.button(titleCard, titleCard.querySelector(".np-tip"));
  if (pauseActions) Snd.button(pauseActions, pauseActions.querySelector("a"));
  // The studio logo heads the title card and the score card.
  logoImg(titleCard, 13);
  logoImg(document.querySelector("#np-ov-over .np-card"), 14);
}

// Hook for automated checks (no effect on play)
window.__powder = { S: function () { return S; }, update: update, keys: keys, LEN: LEN, pointer: pointer, gfx: function () { return R; }, led: function () { return LED; },
                    view: function () { return V; }, toCourseX: screenToCourseX, snd: Snd, startMusic: startMusic, setQuality: function (q) { if (R) { R.qLock = true; setQuality(q); } } };

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
      try { R = buildScene(THREE, res[2]); } catch (e) { e.npStage = "webgl"; throw e; }
      if (q) { R.qLock = true; setQuality(q[1] === "low" ? QUALITY.length - 1 : 0); }
      reset();
      try { R.renderer.compile(R.scene, R.camera); } catch (e) { /* warm-up only */ }
      // hold the logo for a beat, then hand over to the title card
      const hold = Math.max(0, 1300 - (performance.now() - t0));
      return new Promise(function (r) { setTimeout(r, hold); });
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
          ? "Powder Day Haul could not load its 3D engine (" + THREE_URL + ")."
          : "Powder Day Haul needs WebGL for its 3D mountain, and this browser has it switched off or does not support it.");
      });
    });
})();
