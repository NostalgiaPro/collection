/* POWDER DAY HAUL: carve down Mount Backlog and grab the loose discs before the bottom.
   World distance d runs down the mountain. The rider sits at screen y = PY; the world scrolls up. */
(function () {
  "use strict";
  var W = 360, H = 540, TAU = Math.PI * 2, PY = 160;
  // Control tuning (easier pass): slower top speed, snappier grip, more forgiving spins and hit boxes.
  var LEN = 15200, V0 = 132, V1 = 228, STEER = 215, CRASHES = 3;
  var GRIP_ON = 11, GRIP_OFF = 18, GRIP_SLOW = 6;         // how fast the board reaches / drops its carve speed (1/s)
  var FOLLOW = 5.5;                                        // mouse / touch: carve toward the pointer, this gain (1/s)
  var AIR_STEER = 0.45, BRAKE = 0.68;                      // a little steering in the air; Up arrow digs in
  var SPIN_RATE = 600, FINISH_RATE = 900, LAND_TOL = 55;   // let go and the board finishes its half turn by itself
  var HIT_PAD = 2, GRAB_PAD = 15;                          // obstacle hit pad (was 6), disc / ramp grab pad (was 9)
  var BTN = { x: 130, y: 470, w: 100, h: 56 };          // SPIN button (touch)

  var S = {}, keys = {}, idleT = 0, parts = [];
  var X = window.NPX && window.NPX.on ? window.NPX : null;   // batch 3 extras (shared/extras.js)
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------------- Course ---------------- */
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
    parts.length = 0;
    if (X) S.xt = { sc: X.scenery(), fever: new X.Fever(15), sched: new X.Scheduler(12, 24, 2), rares: 0, intro: false, slowSteer: 0, boostT: 0 };
  }

  /* ---------------- Update ---------------- */
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
    for (i = parts.length - 1; i >= 0; i--) { var q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.life <= 0) parts.splice(i, 1); }
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
          if (Math.abs(dx) < o.half + 2) { S.gates++; S.score += 100; Shell.flash("GATE", "+100", "#3ff0ff", 600); Shell.sfx("score"); if (S.xt) S.xt.fever.hit("Faster board, magnet discs"); }
          else { Shell.flash("MISSED GATE", "", "#8e93a2", 600); if (S.xt) S.xt.fever.miss(); }
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
        Shell.tone(1200 + (S.discs % 4) * 160, 0.06, "square", 0.18);
        sparkle(o.x, PY + dy);
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
      return;
    }
    var deg = halves * 180;
    if (deg >= 180) {
      var pts = halves * 150 + (halves >= 4 ? 300 : 0);
      S.tricks += pts; S.score += pts; S.bestSpin = Math.max(S.bestSpin, deg);
      Shell.flash(deg + "!", "+" + pts + " trick points", deg >= 720 ? "#ffd23f" : "#9bff3f", 900);
      Shell.sfx("score");
      if (window.Trophies) { if (deg >= 360) Trophies.unlock("pdh-360"); if (deg >= 720) Trophies.unlock("pdh-720"); }
    } else {
      S.tricks += 25; S.score += 25;
      Shell.flash("AIR", "+25", "#3ff0ff", 600);
    }
    if (window.Trophies) Trophies.unlock("pdh-air");
    if (S.xt) S.xt.fever.hit("Faster board, magnet discs");
    Shell.noise(0.12, 0.3, 500, 0.8, 0, 0, "lowpass");
  }

  function crash(o, line) {
    S.crashes++; S.crash = 1.0; S.vx = 0; S.air = 0; S.discRow = 0;
    if (S.xt) S.xt.fever.miss();
    if (o && (o.t === "box" || o.t === "cases")) o.gone = true;
    Shell.flash("WIPEOUT", line || "Should've bought the strategy guide.", "#ff4b3e", 1000);
    Shell.sfx("hit"); Shell.noise(0.4, 0.5, 300, 0.6, 0, 120); Shell.shake(4, 0.3);
    if (window.Trophies) Trophies.unlock("pdh-guide");
    for (var i = 0; i < 16; i++) { var a = Math.random() * TAU, s = 40 + Math.random() * 100; parts.push({ x: S.x, y: PY, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, c: "#ffffff" }); }
    if (S.crashes >= CRASHES) { S.phase = "done"; S.pt = 0; }
  }
  function sparkle(x, y) {
    if (Shell.reduced) return;
    for (var i = 0; i < 6; i++) { var a = i / 6 * TAU; parts.push({ x: x, y: y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 0.3, c: i % 2 ? "#3ff0ff" : "#ffd23f" }); }
  }

  /* ---------------- Batch 3 extras ---------------- */
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
    if (!fake) { S.xt.rares++; S.score += pts * 100; }
    sparkle(o.x, PY);
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
  }

  function finish() {
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
  function inBtn(x, y) { return x >= BTN.x && x <= BTN.x + BTN.w && y >= BTN.y && y <= BTN.y + BTN.h; }
  function pointer(type, x, y, e) {
    if (X && X.eventActive()) { S.tx = null; S.holdSpin = false; S.spinIds = {}; X.eventPointer(type, x, y); return; }
    var touch = e && e.pointerType && e.pointerType !== "mouse";
    if (type === "down") {
      S.ptrId = e ? e.pointerId : null;
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

  /* ---------------- Drawing ---------------- */
  function fr(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function circ(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }

  function drawSnow(c) {
    fr(c, 0, 0, W, H, "#e9f0f6");
    var off = S.d % 40;
    c.strokeStyle = "rgba(160,185,210,.35)"; c.lineWidth = 1;
    for (var y = -off; y < H; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y + 12); c.stroke(); }
    // groomed edges
    fr(c, 0, 0, 8, H, "#c9d8e4"); fr(c, W - 8, 0, 8, H, "#c9d8e4");
  }
  function drawObj(c, o, y) {
    var x = o.x;
    if (o.gone && o.t !== "ramp") return;
    switch (o.t) {
      case "tree":
        fr(c, x - 2, y + 4, 4, 8, "#5a3a1e");
        c.fillStyle = "#1f6b40"; c.beginPath(); c.moveTo(x, y - 18); c.lineTo(x + 14, y + 6); c.lineTo(x - 14, y + 6); c.closePath(); c.fill();
        c.fillStyle = "#ffffff"; c.beginPath(); c.moveTo(x, y - 18); c.lineTo(x + 6, y - 8); c.lineTo(x - 6, y - 8); c.closePath(); c.fill();
        break;
      case "rock": circ(c, x, y, 10, "#6e7079"); circ(c, x - 3, y - 3, 5, "#8d8f99"); fr(c, x - 6, y - 10, 10, 3, "#ffffff"); break;
      case "box":
        fr(c, x - 14, y - 9, 28, 18, "#0b0c10"); fr(c, x - 13, y - 8, 26, 16, "#b98a55");
        fr(c, x - 13, y - 1, 26, 3, "#d9c38f"); Shell.uiText(c, "LOT", x, y - 7, 7, "#3e2614", "center");
        break;
      case "cases":
        for (var k = 0; k < 3; k++) { fr(c, x - 12 + k * 2, y - 8 + k * 5, 22, 5, "#0b0c10"); fr(c, x - 11 + k * 2, y - 7 + k * 5, 20, 3, "#ffffff"); }
        break;
      case "ramp":
        c.fillStyle = o.gone ? "#b9cde0" : "#9fc8ef"; c.beginPath(); c.moveTo(x - 22, y + 10); c.lineTo(x + 22, y + 10); c.lineTo(x + 16, y - 12); c.lineTo(x - 16, y - 12); c.closePath(); c.fill();
        c.strokeStyle = "#3f7fd0"; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 6, y + 4); c.lineTo(x, y - 6); c.lineTo(x + 6, y + 4); c.stroke();
        break;
      case "disc":
        circ(c, x, y, 7, "#b8c2cf"); circ(c, x - 1, y - 1, 5, "#e4ecf4");
        c.fillStyle = "rgba(255,63,164,.5)"; c.beginPath(); c.arc(x, y, 6, -0.3, 0.9); c.lineTo(x, y); c.fill();
        circ(c, x, y, 2, "#e9f0f6");
        break;
      case "rare": if (!o.gone) X.drawCart(c, x, y, o.tier.t, S.t, 0.8); break;
      case "gate":
        var col = o.done ? "#b9cde0" : "#ff4b3e", col2 = o.done ? "#b9cde0" : "#2f6bff";
        fr(c, x - o.half - 1, y - 18, 2, 18, "#3a3e4c"); fr(c, x - o.half + 1, y - 18, 10, 8, col);
        fr(c, x + o.half - 1, y - 18, 2, 18, "#3a3e4c"); fr(c, x + o.half - 11, y - 18, 10, 8, col2);
        break;
    }
  }
  function drawTarget(c) {   // small marker where mouse / touch steering is heading
    if (S.tx == null || S.crash > 0 || Math.abs(S.tx - S.x) < 4) return;
    c.fillStyle = "rgba(47,59,122,.45)";
    c.beginPath(); c.moveTo(S.tx, PY + 22); c.lineTo(S.tx - 6, PY + 31); c.lineTo(S.tx + 6, PY + 31); c.closePath(); c.fill();
  }
  function drawRider(c) {
    var air = S.air > 0 ? Math.sin(Math.PI * clamp(S.airT / S.air, 0, 1)) : 0;
    var lift = air * 26, sc = 1 + air * 0.25;
    c.fillStyle = "rgba(60,80,110,.25)"; c.beginPath(); c.ellipse(S.x + air * 8, PY + 6, 16, 5, 0, 0, TAU); c.fill();
    c.save(); c.translate(S.x, PY - lift); c.scale(sc, sc);
    var ang = S.crash > 0 ? S.t * 12 : (S.spin * Math.PI / 180) + S.carve * 0.35;
    c.rotate(ang);
    fr(c, -16, -3, 32, 6, "#ff3fa4"); fr(c, -16, -3, 4, 6, "#ffd23f"); fr(c, 12, -3, 4, 6, "#ffd23f");
    fr(c, -6, -7, 12, 12, "#2f3b7a");
    circ(c, 0, -1, 4, "#e0a070");
    fr(c, -4, -5, 8, 3, "#101219");
    c.restore();
    if (S.inv > 0 && Math.floor(S.t * 10) % 2 === 0) { c.strokeStyle = "#3ff0ff"; c.lineWidth = 1; c.beginPath(); c.arc(S.x, PY, 18, 0, TAU); c.stroke(); }
  }
  function drawHUD(c, state) {
    fr(c, 0, 0, W, 50, "rgba(13,15,21,.92)");
    Shell.text(c, "SCORE", 10, 7, 8, "#8e93a2");
    Shell.text(c, String(S.score), 10, 21, 14, "#ffd23f");
    Shell.text(c, "DISCS", W / 2, 7, 8, "#8e93a2", "center");
    Shell.text(c, String(S.discs), W / 2, 21, 14, "#3ff0ff", "center");
    for (var i = 0; i < CRASHES; i++) {
      var lost = i < S.crashes;
      fr(c, W - 70 + i * 22, 20, 18, 6, lost ? "#3a3e4c" : "#ff3fa4");
      if (lost) Shell.text(c, "X", W - 61 + i * 22, 17, 8, "#ff4b3e", "center");
    }
    Shell.text(c, "BOARDS", W - 10, 7, 8, "#8e93a2", "right");
    // mountain progress
    var k = clamp(S.d / LEN, 0, 1);
    fr(c, 10, 40, W - 20, 4, "#2c3040"); fr(c, 10, 40, (W - 20) * k, 4, "#9bff3f");
    // spin button (touch)
    if (state === "playing") {
      var on = S.air > 0;
      fr(c, BTN.x, BTN.y, BTN.w, BTN.h, on ? "rgba(255,63,164,.9)" : "rgba(29,32,41,.55)");
      c.strokeStyle = on ? "#ffd23f" : "rgba(142,147,162,.6)"; c.lineWidth = 2; c.strokeRect(BTN.x + 1, BTN.y + 1, BTN.w - 2, BTN.h - 2);
      Shell.text(c, "SPIN", BTN.x + BTN.w / 2, BTN.y + 16, 10, on ? "#101219" : "#8e93a2", "center");
      Shell.uiText(c, on ? "HOLD ANYWHERE" : "IN THE AIR ONLY", BTN.x + BTN.w / 2, BTN.y + 34, 8, on ? "#101219" : "#8e93a2", "center");
    }
    if (S.air > 0 && S.spin > 0) {
      var done = Math.floor(S.spin / 180 + 1e-6) * 180, goal = Math.ceil(S.spin / 180 - 1e-6) * 180;
      Shell.text(c, goal + "", S.x, PY - 60, 10, "#ff3fa4", "center");
      if (spinHeld() && letGo()) Shell.text(c, "LET GO", S.x, PY - 76, 8, "#ff4b3e", "center");
    }
  }

  // True when starting another half turn would not finish before the landing.
  function letGo() {
    var left = S.air - S.airT, part = S.spin % 180, need = (180 - part) / FINISH_RATE;
    return left < need + 180 / SPIN_RATE + 0.05;
  }
  function draw(c, state) {
    drawSnow(c);
    // finish line
    var fy = PY + (LEN - S.d);
    if (fy < H + 20 && fy > -20) {
      for (var x = 8; x < W - 8; x += 16) fr(c, x, fy, 8, 8, (x / 16) % 2 ? "#101219" : "#ffffff");
      Shell.text(c, "BOTTOM OF MOUNT BACKLOG", W / 2, fy + 12, 8, "#2f3b7a", "center");
    }
    for (var i = 0; i < S.obs.length; i++) {
      var o = S.obs[i], y = PY + (o.y - S.d);
      if (y < -30) continue;
      if (y > H + 30) break;
      drawObj(c, o, y);
    }
    if (state === "playing") drawTarget(c);
    drawRider(c);
    for (i = 0; i < parts.length; i++) fr(c, parts[i].x, parts[i].y, 3, 3, parts[i].c);
    if (S.xt) {
      var area = { x: 0, y: 50, w: W, h: H - 50 };
      if (S.xt.sc.id === "fog") {   // the slope ahead (below you) fades into the fog
        var fg = c.createLinearGradient(0, PY + 60, 0, H);
        fg.addColorStop(0, "rgba(225,232,240,0)"); fg.addColorStop(1, "rgba(225,232,240,.85)");
        c.fillStyle = fg; c.fillRect(0, PY + 60, W, H - PY - 60);
      }
      X.drawScenery(c, S.xt.sc, S.t, area);
      S.xt.fever.draw(c, area, S.t);
    }
    drawHUD(c, state);
    if (S.xt) { X.drawTag(c, S.xt.sc, 10, H - 12); X.drawEvent(c, W, H); }
  }

  // Hook for automated checks (no effect on play)
  window.__powder = { S: function () { return S; }, update: update, keys: keys, LEN: LEN, pointer: pointer };

  Shell.init({
    slug: "powder-day-haul",
    title: "POWDER DAY HAUL",
    accent: "#a77bff",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "Carve down Mount Backlog and grab the loose discs before the bottom. Touch: slide your finger left or right and the rider follows it. Hit a ramp, then hold anywhere in the air to spin. Let go and the board finishes the turn.",
    keys: "Keys: left and right (or A and D) carve, Up (or W) slows you down, hold Space in the air to spin. Mouse: the rider follows the cursor, click and hold in the air to spin. P pause, M mute, R restart.",
    tip: "Three wipeouts and you're done. Let go of SPIN when LET GO shows up or you land sideways.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { for (var k in keys) keys[k] = false; S.ptrSteer = 0; S.holdSpin = false; S.spinIds = {}; if (S.ptrId != null) S.tx = null; }
  });
  bindExtraTouch();
})();
