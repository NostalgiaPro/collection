/* PAWN SHOP POOL: clear the back-room table before the shop closes. Solo speed rack, 3 racks. */
(function () {
  "use strict";
  var W = 360, H = 540, TAU = Math.PI * 2;
  var X0 = 30, X1 = 330, Y0 = 82, Y1 = 516;           // cloth
  var R = 8, MAX_V = 900, MAX_PULL = 120;
  var FR_C = 70, FR_K = 0.55, E_BALL = 0.95, E_RAIL = 0.78;
  var POCKETS = [
    { x: X0 + 2, y: Y0 + 2, r: 18 }, { x: X1 - 2, y: Y0 + 2, r: 18 },
    { x: X0 - 2, y: (Y0 + Y1) / 2, r: 16 }, { x: X1 + 2, y: (Y0 + Y1) / 2, r: 16 },
    { x: X0 + 2, y: Y1 - 2, r: 18 }, { x: X1 - 2, y: Y1 - 2, r: 18 }
  ];
  var MOUTH = 28;
  var HEAD = { x: 180, y: 430 }, FOOT = { x: 180, y: 196 };
  var RACKS = 3, CLOSE_AT = 300, SCRATCH_SEC = 10, COMBO_SEC = 3, LEFT_SEC = 20;
  var COLORS = ["#ffd23f", "#2f6bff", "#ff4b3e", "#a77bff", "#ff8a2a", "#2fbf5a", "#9a2f3a", "#1b1c22", "#ffd23f"];

  var GBTN = { x: 80, y: 9, w: 52, h: 36 };             // GUIDE on/off button in the top bar
  var S = {}, keys = {}, idleT = 0, parts = [], guideOn = null;
  var X = window.NPX && window.NPX.on ? window.NPX : null;   // test-only extras (shared/extras.js)

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function rackBalls() {
    var b = [], rows = [1, 2, 3, 2, 1], order = [1, 3, 4, 6, 9, 5, 7, 8, 2], k = 0, dy = R * 1.75, dx = R * 2 + 0.6;
    for (var r = 0; r < rows.length; r++) for (var c = 0; c < rows[r]; c++) {
      var n = order[k++];
      b.push({ n: n, x: FOOT.x + (c - (rows[r] - 1) / 2) * dx, y: FOOT.y + 2 * dy - r * dy, vx: 0, vy: 0, in: false, sink: 0 });
    }
    return b;
  }

  function reset() {
    S = { t: 0, time: 0, penalty: 0, bonus: 0, rack: 1, phase: "aim", pt: 0, balls: rackBalls(),
          cue: { n: 0, x: HEAD.x, y: HEAD.y, vx: 0, vy: 0, in: false, sink: 0 },
          aim: -Math.PI / 2, power: 0, charging: false, chargeT: 0, drag: null, kb: false,
          shot: null, shots: 0, scratches: 0, combos: 0, bestCombo: 0, potted: 0, breakPots: 0, rackShots: 0, over: false };
    parts.length = 0;
    if (X) S.x = { sc: X.scenery(), fever: new X.Fever(15), sched: new X.Scheduler(25, 55, 2), rare: null, rares: 0, events: 0, intro: false };
  }
  function clock() { return S.time + S.penalty - S.bonus; }
  function ballsLeft() { var n = 0; for (var i = 0; i < S.balls.length; i++) if (!S.balls[i].in) n++; return n + (RACKS - S.rack) * 9; }

  /* ---------------- Physics ---------------- */
  function all() { return [S.cue].concat(S.balls); }
  function moving() {
    var a = all();
    for (var i = 0; i < a.length; i++) if (!a[i].in && (a[i].vx || a[i].vy)) return true;
    return false;
  }
  function nearPocket(b) {
    for (var i = 0; i < POCKETS.length; i++) if (Math.hypot(b.x - POCKETS[i].x, b.y - POCKETS[i].y) < MOUTH) return true;
    return false;
  }
  function step(dt) {
    var a = all(), i, j, b, c;
    for (i = 0; i < a.length; i++) {
      b = a[i]; if (b.in) continue;
      var sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) {
        var ns = Math.max(0, sp - (FR_C + FR_K * sp) * (S.x && S.x.sc.id === "rain" ? 1.2 : 1) * dt);
        if (ns < 3) { b.vx = b.vy = 0; } else { b.vx *= ns / sp; b.vy *= ns / sp; }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      // rails, except at the pocket mouths
      if (!nearPocket(b)) {
        if (b.x < X0 + R) { b.x = X0 + R; b.vx = Math.abs(b.vx) * E_RAIL; rail(); }
        if (b.x > X1 - R) { b.x = X1 - R; b.vx = -Math.abs(b.vx) * E_RAIL; rail(); }
        if (b.y < Y0 + R) { b.y = Y0 + R; b.vy = Math.abs(b.vy) * E_RAIL; rail(); }
        if (b.y > Y1 - R) { b.y = Y1 - R; b.vy = -Math.abs(b.vy) * E_RAIL; rail(); }
      }
      for (j = 0; j < POCKETS.length; j++) {
        if (Math.hypot(b.x - POCKETS[j].x, b.y - POCKETS[j].y) < POCKETS[j].r) { pocket(b, POCKETS[j]); break; }
      }
      // anything that sneaks past a mouth goes down the nearest pocket
      if (!b.in && (b.x < X0 - 6 || b.x > X1 + 6 || b.y < Y0 - 6 || b.y > Y1 + 6)) {
        var best = POCKETS[0];
        for (j = 1; j < POCKETS.length; j++) if (Math.hypot(b.x - POCKETS[j].x, b.y - POCKETS[j].y) < Math.hypot(b.x - best.x, b.y - best.y)) best = POCKETS[j];
        pocket(b, best);
      }
    }
    for (i = 0; i < a.length; i++) {
      b = a[i]; if (b.in) continue;
      for (j = i + 1; j < a.length; j++) {
        c = a[j]; if (c.in) continue;
        var dx = c.x - b.x, dy = c.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 < 1e-6) continue;
        var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = 2 * R - d;
        b.x -= nx * pen / 2; b.y -= ny * pen / 2; c.x += nx * pen / 2; c.y += ny * pen / 2;
        var rv = (c.vx - b.vx) * nx + (c.vy - b.vy) * ny;
        if (rv < 0) {
          var jj = -(1 + E_BALL) * rv / 2;
          b.vx -= jj * nx; b.vy -= jj * ny; c.vx += jj * nx; c.vy += jj * ny;
          if (S.shot && !S.shot.first && (b.n === 0 || c.n === 0)) S.shot.first = true;
          click(-rv);
        }
      }
    }
  }
  var lastClick = 0;
  function click(v) {
    if (v < 30 || S.t - lastClick < 0.025) return;
    lastClick = S.t;
    Shell.tone(1500 + Math.random() * 500, 0.03, "square", Math.min(0.3, 0.08 + v / 2500));
  }
  function rail() { if (S.t - lastClick > 0.04) { lastClick = S.t; Shell.tone(180, 0.05, "triangle", 0.15); } }

  function pocket(b, p) {
    b.in = true; b.vx = b.vy = 0; b.px = p.x; b.py = p.y; b.sink = 1;
    Shell.sfx("cup");
    if (!S.shot) return;
    if (b.n === 0) S.shot.scratch = true;
    else { S.shot.pots++; S.potted++; if (S.x && S.x.rare && POCKETS[S.x.rare.p] === p) S.shot.rarePot = true; }
  }

  /* ---------------- Shooting ---------------- */
  function canShoot() { return S.phase === "aim" && S.pt > 0.12; }
  function shoot(ang, p) {
    if (!canShoot() || p < 0.04) return;
    var v = 60 + clamp(p, 0, 1) * (MAX_V - 60);
    S.cue.vx = Math.cos(ang) * v; S.cue.vy = Math.sin(ang) * v;
    S.shot = { pots: 0, scratch: false, first: false, isBreak: S.rackShots === 0 };
    S.shots++; S.rackShots++;
    S.phase = "roll"; S.pt = 0;
    S.drag = null; S.charging = false;
    Shell.sfx("hit");
  }

  function endShot() {
    var sh = S.shot, msg = null;
    S.shot = null;
    if (S.x) extrasShot(sh);
    if (sh.isBreak && sh.pots > 0) { S.breakPots++; if (window.Trophies) Trophies.unlock("psp-break"); }
    if (sh.pots >= 2) {
      S.bonus += COMBO_SEC; S.combos++; S.bestCombo = Math.max(S.bestCombo, sh.pots);
      msg = [sh.pots >= 3 ? "BULK LOT DEAL" : "TWO FOR ONE", sh.pots + " balls, one shot. -" + COMBO_SEC + " SEC", "#9bff3f"];
      Shell.sfx("score");
      if (window.Trophies) { Trophies.unlock("psp-combo"); if (sh.pots >= 3) Trophies.unlock("psp-three"); }
    }
    if (sh.scratch) {
      S.penalty += SCRATCH_SEC; S.scratches++;
      msg = ["SCRATCH", "That cue ball was not for sale. +" + SCRATCH_SEC + " SEC", "#ff4b3e"];
      Shell.sfx("miss");
      if (window.Trophies) Trophies.unlock("psp-scratch");
      respot();
    }
    // balls-in-a-row streak pill (shared/rewards.js): consecutive shots that pot a ball without a scratch
    if (sh.pots > 0 && !sh.scratch) { S.potRow = (S.potRow || 0) + 1; if (window.NPRewards && S.potRow >= 2) NPRewards.streak(S.potRow); }
    else S.potRow = 0;
    var left = 0;
    for (var i = 0; i < S.balls.length; i++) if (!S.balls[i].in) left++;
    if (left === 0) {
      if (window.Trophies) Trophies.unlock("psp-rack");
      if (S.rack >= RACKS) { finish(true); return; }
      S.rack++;
      S.balls = rackBalls(); S.rackShots = 0;
      if (!sh.scratch) { S.cue.x = HEAD.x; S.cue.y = HEAD.y; }
      respot();
      msg = ["RACK " + S.rack, S.rack === 2 ? "Fresh rack. The clock keeps running." : "Last rack before closing.", "#ffd23f"];
      Shell.sfx("best");
    }
    if (msg) Shell.flash(msg[0], msg[1], msg[2], 1100);
    S.phase = "aim"; S.pt = 0;
  }

  function respot() {
    var c = S.cue, y = HEAD.y;
    c.in = false; c.sink = 0; c.vx = c.vy = 0;
    for (var tries = 0; tries < 40; tries++) {
      var x = HEAD.x + ((tries % 2) ? 1 : -1) * Math.ceil(tries / 2) * 6, ok = true;
      for (var i = 0; i < S.balls.length; i++) { var b = S.balls[i]; if (!b.in && Math.hypot(b.x - x, b.y - y) < 2 * R + 1) { ok = false; break; } }
      if (ok) { c.x = x; c.y = y; return; }
    }
    c.x = HEAD.x; c.y = HEAD.y;
  }

  /* ---------------- Test-only extras ---------------- */
  var EVENTS = [
    { title: "Trunk Deal", text: "A guy in a faded muscle car offers a milk crate of carts. Pay 10 seconds, sight unseen?",
      a: { label: "Pay 10 sec", run: function () { S.penalty += 10; if (X.coin(0.45)) return rareNow("Under the football carts: "); return "A crate of worthless football carts. Plus 10 seconds."; } },
      b: { label: "Pass", run: function () { return "He drives off. Probably nothing in there."; } } },
    { title: "Price Swap", text: "Someone swapped a $50 tag with a $2 tag on the cue rack.",
      a: { label: "Be honest", run: function () { S.bonus += 5; return "The owner appreciates it. 5 seconds off the clock."; } },
      b: { label: "Pay $2", run: function () { if (X.coin(0.5)) { S.bonus += 5; return "Nobody noticed. 5 seconds off."; } S.penalty += 10; return "Caught at the register. Plus 10 seconds."; } } },
    { title: "Guard Dog", text: "A grumpy bulldog is napping on the rail next to a corner pocket.",
      a: { label: "Pet him", run: function () { if (X.coin(0.5)) return "He licks your hand and waddles off."; S.penalty += 6; return "He bites. Plus 6 seconds."; } },
      b: { label: "Bribe him", run: function () { S.penalty += 2; return "A snack costs 2 seconds. He leaves happy."; } } },
    { title: "Pawn Lowball", text: "The broker offers a heavy box of sports carts for one dollar.",
      a: { label: "Take it", run: function () { S.penalty += 4; if (X.coin(0.3)) return rareNow("At the very bottom: "); return "Thirty copies of the same baseball game. Plus 4 seconds."; } },
      b: { label: "Pass", run: function () { return "You keep your shelf space."; } } },
    { title: "The Stand-Off", text: "The owner says he might close early. Call his bluff?",
      a: { label: "Walk away", run: function () { if (X.coin(0.5)) { S.bonus += 5; return "He calls you back. 5 seconds off."; } S.penalty += 5; return "He lets you walk. Plus 5 seconds."; } },
      b: { label: "Keep playing", run: function () { return "You chalk up and keep shooting."; } } }
  ];
  function rareMult() { var sc = S.x.sc.id; return (sc === "suburbs" ? 3 : sc === "fog" ? 1.5 : 1) * (S.x.fever.active() ? 2 : 1); }
  function rareNow(prefix) {
    var it = X.rollRare(rareMult()), fake = S.x.sc.id === "twilight" && X.coin(0.35);
    var pts = X.collect(it, fake);
    if (!fake) { S.x.rares++; S.bonus += pts; return (prefix || "") + it.n + " (" + X.TIER[it.t].word + "). " + pts + " seconds off."; }
    return "It was a reproduction cartridge. Nothing gained.";
  }
  function extrasShot(sh) {
    var x = S.x;
    // a clean pot keeps the streak going; three in a row starts the Hot Streak
    if (sh.pots > 0 && !sh.scratch) x.fever.hit("Clock runs at half speed"); else x.fever.miss();
    if (sh.rarePot && x.rare) { x.rare = null; var it = X.rollRare(rareMult()), fake = S.x.sc.id === "twilight" && X.coin(0.35), pts = X.collect(it, fake); if (!fake) { x.rares++; S.bonus += pts; } }
    else if (x.rare && --x.rare.shots <= 0) x.rare = null;
    if (!x.rare && Math.random() < 0.16 * rareMult()) x.rare = { p: Math.floor(Math.random() * POCKETS.length), shots: 3 };
  }
  function extrasTick(dt) {
    var x = S.x;
    if (!x.intro) { x.intro = true; Shell.flash(x.sc.name, x.sc.line, "#9bff3f", 1500); }
    x.fever.tick(dt);
    if (S.phase === "aim" && !S.charging && !S.drag && x.sched.due(clock())) { x.events++; X.startEvent(X.pick(EVENTS)); }
  }
  function clockRate() {
    if (!S.x) return 1;
    var r = S.x.sc.id === "sun" || S.x.sc.id === "suburbs" ? 1.1 : S.x.sc.id === "golden" ? 0.9 : 1;
    return S.x.fever.active() ? r * 0.5 : r;
  }

  function finish(cleared) {
    if (S.over) return;
    S.over = true;
    var left = ballsLeft(), score = Math.round(clock()) + (cleared ? 0 : left * LEFT_SEC);
    var html = row("Shot clock", fmt(Math.round(clock()))) + row("Shots", S.shots) + row("Scratches", S.scratches + " (+" + S.scratches * SCRATCH_SEC + " sec)") +
      row("Two for one shots", S.combos + " (-" + S.combos * COMBO_SEC + " sec)");
    if (!cleared) html += row("Balls left at closing", left + " (+" + left * LEFT_SEC + " sec)");
    if (S.x) html += row("Scenery (test)", S.x.sc.name) + row("Rare finds (test)", S.x.rares + " this run, " + X.foundCount() + " of " + X.RARES.length + " found") + row("Hot Streaks (test)", S.x.fever.count);
    Shell.gameOver(score, { title: cleared ? "CLEARED OUT" : "CLOSED", html: html,
      stats: { cleared: cleared, time: score, racks: cleared ? RACKS : S.rack - 1, shots: S.shots, scratches: S.scratches, combos: S.combos, bestCombo: S.bestCombo, potted: S.potted } });
  }
  function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }
  function fmt(n) { n = Math.max(0, Math.round(n)); return Math.floor(n / 60) + ":" + ("0" + (n % 60)).slice(-2); }

  /* ---------------- Update ---------------- */
  function update(dt) {
    if (X && X.eventActive()) { X.eventTick(dt); return; }
    S.t += dt; S.pt += dt; S.time += dt * clockRate();
    if (S.x) extrasTick(dt);
    var i;
    for (i = parts.length - 1; i >= 0; i--) { var q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.life <= 0) parts.splice(i, 1); }
    var a = all();
    for (i = 0; i < a.length; i++) if (a[i].sink > 0) a[i].sink = Math.max(0, a[i].sink - dt * 4);
    if (clock() >= CLOSE_AT && !S.over) {
      Shell.flash("CLOSED", "The shopkeeper flipped the sign.", "#ff4b3e", 1200);
      Shell.sfx("buzzer");
      finish(false);
      return;
    }
    if (S.phase === "aim") {
      var turn = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0), fine = (keys.ArrowUp ? -1 : 0) + (keys.ArrowDown ? 1 : 0);
      if (turn || fine) { S.holdT = (S.holdT || 0) + dt; S.aim += (turn * (S.holdT > 0.5 ? 1.8 : 0.7) + fine * 0.18) * dt; S.kb = true; }
      else S.holdT = 0;
      if (S.charging) { S.chargeT += dt; var ph = (S.chargeT / 1.2) % 2; S.power = ph < 1 ? ph : 2 - ph; }
      return;
    }
    if (S.phase === "roll") {
      var mx = 1;
      for (i = 0; i < a.length; i++) if (!a[i].in) mx = Math.max(mx, Math.hypot(a[i].vx, a[i].vy));
      var n = clamp(Math.ceil(mx * dt / 3), 1, 40);
      for (i = 0; i < n; i++) step(dt / n);
      if (!moving() && S.pt > 0.15) endShot();
    }
  }

  /* ---------------- Input ---------------- */
  /* Aim guide: optional, on by default, remembered on this device (npArcade.pawn-shop-pool.guide). */
  function guide() { if (guideOn === null) guideOn = Shell.load("guide") !== "0"; return guideOn; }
  function toggleGuide() {
    guideOn = !guide();
    Shell.save("guide", guideOn ? "1" : "0");
    Shell.flash(guideOn ? "GUIDE ON" : "GUIDE OFF", guideOn ? "Aim line, first bounce and contact shown." : "Eyeball it. Press G to bring it back.", guideOn ? "#3ff0ff" : "#8e93a2", 800);
    Shell.tone(guideOn ? 880 : 440, 0.06, "square", 0.15);
  }
  function inGuideBtn(x, y) { return x >= GBTN.x - 4 && x <= GBTN.x + GBTN.w + 4 && y >= 0 && y <= 54; }
  function pointer(type, x, y) {
    if (X && X.eventActive()) { X.eventPointer(type, x, y); return; }
    if (type === "down") {
      if (inGuideBtn(x, y)) { toggleGuide(); return; }
      if (!canShoot()) return;
      S.drag = { sx: x, sy: y, x: x, y: y }; S.kb = false; S.charging = false;
    } else if (type === "move" && S.drag) {
      S.drag.x = x; S.drag.y = y;
      var dx = S.drag.sx - x, dy = S.drag.sy - y;
      if (Math.hypot(dx, dy) > 6) S.aim = Math.atan2(dy, dx);
    } else if ((type === "up" || type === "cancel") && S.drag) {
      var d = S.drag; S.drag = null;
      if (type === "cancel") return;
      var len = Math.hypot(d.sx - d.x, d.sy - d.y);
      if (len < 8) return;
      shoot(Math.atan2(d.sy - d.y, d.sx - d.x), clamp(len / MAX_PULL, 0, 1));
    }
  }
  function key(type, code, e) {
    if (X && X.eventActive()) { keys = {}; X.eventKey(type, code); return; }
    var act = code === "Space" || code === "Enter" || code === "NumpadEnter";
    if (type === "down") {
      keys[code] = true;
      if (code === "KeyG" && !e.repeat) { toggleGuide(); return; }
      if (act && !e.repeat && canShoot() && !S.charging) { S.charging = true; S.chargeT = 0; S.power = 0; S.kb = true; S.drag = null; }
    } else {
      keys[code] = false;
      if (act && S.charging) { S.charging = false; shoot(S.aim, S.power); S.power = 0; }
    }
  }

  /* ---------------- Drawing ---------------- */
  function fr(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function circ(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }

  function drawRoom(c, t) {
    fr(c, 0, 0, W, H, "#0e0f14");
    // back-room wall with a pegboard
    for (var y = 60; y < H; y += 12) for (var x = 6; x < W; x += 12) fr(c, x, y, 2, 2, "#1a1c24");
  }
  function drawTable(c, t) {
    fr(c, X0 - 20, Y0 - 20, X1 - X0 + 40, Y1 - Y0 + 40, "#2a170b");
    fr(c, X0 - 16, Y0 - 16, X1 - X0 + 32, Y1 - Y0 + 32, "#5a3519");
    fr(c, X0 - 6, Y0 - 6, X1 - X0 + 12, Y1 - Y0 + 12, "#1e5a36");
    fr(c, X0, Y0, X1 - X0, Y1 - Y0, "#1f6b40");
    // diamonds on the rails
    for (var i = 1; i < 4; i++) { fr(c, X0 + (X1 - X0) * i / 4 - 1.5, Y0 - 12, 3, 3, "#e8d9a8"); fr(c, X0 + (X1 - X0) * i / 4 - 1.5, Y1 + 9, 3, 3, "#e8d9a8"); }
    for (i = 1; i < 8; i++) if (i !== 4) { fr(c, X0 - 12, Y0 + (Y1 - Y0) * i / 8 - 1.5, 3, 3, "#e8d9a8"); fr(c, X1 + 9, Y0 + (Y1 - Y0) * i / 8 - 1.5, 3, 3, "#e8d9a8"); }
    // head string + foot spot
    fr(c, X0, HEAD.y, X1 - X0, 1, "rgba(236,234,226,.12)");
    circ(c, FOOT.x, FOOT.y + 2 * R * 1.75, 2, "rgba(236,234,226,.3)");
    for (i = 0; i < POCKETS.length; i++) { circ(c, POCKETS[i].x, POCKETS[i].y, POCKETS[i].r + 2, "#0b0c10"); circ(c, POCKETS[i].x, POCKETS[i].y, POCKETS[i].r - 2, "#050607"); }
    // buzzing shop light
    var flick = Shell.reduced ? 1 : (Math.sin(t * 61) > 0.97 ? 0.55 : 1);
    var g = c.createRadialGradient(180, 300, 20, 180, 300, 260);
    g.addColorStop(0, "rgba(255,240,190," + (0.12 * flick) + ")"); g.addColorStop(1, "rgba(255,240,190,0)");
    c.fillStyle = g; c.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
  }
  function drawBall(c, b) {
    var x = b.in ? b.px : b.x, y = b.in ? b.py : b.y, r = b.in ? R * b.sink : R;
    if (r <= 0.2) return;
    circ(c, x + 1.5, y + 2, r, "rgba(0,0,0,.35)");
    if (b.n === 0) { circ(c, x, y, r, "#f4f1e8"); circ(c, x - r * 0.3, y - r * 0.3, r * 0.3, "#ffffff"); return; }
    var col = COLORS[b.n - 1];
    if (b.n === 9) { circ(c, x, y, r, "#f4f1e8"); c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip(); fr(c, x - r, y - r * 0.5, r * 2, r, col); c.restore(); }
    else circ(c, x, y, r, col);
    if (r > 5) {
      circ(c, x, y, r * 0.48, "#f4f1e8");
      c.fillStyle = "#101219"; c.font = '7px "Silkscreen", monospace'; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(String(b.n), x, y + 0.5);
    }
  }

  // Ray from the cue ball to the first thing it touches.
  function cast(ang) {
    var dx = Math.cos(ang), dy = Math.sin(ang), cx = S.cue.x, cy = S.cue.y, best = 9999, hit = null;
    for (var i = 0; i < S.balls.length; i++) {
      var b = S.balls[i]; if (b.in) continue;
      var fx = b.x - cx, fy = b.y - cy, tproj = fx * dx + fy * dy;
      if (tproj <= 0) continue;
      var perp2 = fx * fx + fy * fy - tproj * tproj, rr = 4 * R * R;
      if (perp2 > rr) continue;
      var tt = tproj - Math.sqrt(rr - perp2);
      if (tt < best) { best = tt; hit = b; }
    }
    var tw = 9999;
    if (dx > 0) tw = Math.min(tw, (X1 - R - cx) / dx); if (dx < 0) tw = Math.min(tw, (X0 + R - cx) / dx);
    if (dy > 0) tw = Math.min(tw, (Y1 - R - cy) / dy); if (dy < 0) tw = Math.min(tw, (Y0 + R - cy) / dy);
    if (tw < best) { best = tw; hit = null; }
    return { d: best, ball: hit, x: cx + dx * best, y: cy + dy * best };
  }

  // Ray from any point along (dx, dy): first ball (ghost-ball contact) or rail it reaches.
  function castFrom(cx, cy, dx, dy) {
    var best = 9999, hit = null, wall = null;
    for (var i = 0; i < S.balls.length; i++) {
      var b = S.balls[i]; if (b.in) continue;
      var fx = b.x - cx, fy = b.y - cy, tproj = fx * dx + fy * dy;
      if (tproj <= 0) continue;
      var perp2 = fx * fx + fy * fy - tproj * tproj, rr = 4 * R * R;
      if (perp2 > rr) continue;
      var tt = tproj - Math.sqrt(rr - perp2);
      if (tt < best) { best = Math.max(0, tt); hit = b; }
    }
    var tw = 9999, tx;
    if (dx > 1e-6) { tx = (X1 - R - cx) / dx; if (tx < tw) { tw = tx; wall = "x"; } }
    if (dx < -1e-6) { tx = (X0 + R - cx) / dx; if (tx < tw) { tw = tx; wall = "x"; } }
    if (dy > 1e-6) { tx = (Y1 - R - cy) / dy; if (tx < tw) { tw = tx; wall = "y"; } }
    if (dy < -1e-6) { tx = (Y0 + R - cy) / dy; if (tx < tw) { tw = tx; wall = "y"; } }
    if (tw < best) { best = Math.max(0, tw); hit = null; } else wall = null;
    var px = cx + dx * best, py = cy + dy * best, pk = null;
    if (!hit) for (var j = 0; j < POCKETS.length; j++) if (Math.hypot(px - POCKETS[j].x, py - POCKETS[j].y) < MOUTH) { pk = POCKETS[j]; break; }
    return { d: best, ball: hit, wall: wall, pocket: pk, x: px, y: py };
  }
  function dots(c, x0, y0, dx, dy, from, to, col) {
    for (var d = from; d < to; d += 7) fr(c, x0 + dx * d - 1, y0 + dy * d - 1, 2, 2, col);
  }
  function arrowLine(c, x, y, dx, dy, len, col) {
    var ex = x + dx * len, ey = y + dy * len;
    c.strokeStyle = col; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
    c.fillStyle = col; c.beginPath();
    c.moveTo(ex + dx * 6, ey + dy * 6); c.lineTo(ex - dy * 4, ey + dx * 4); c.lineTo(ex + dy * 4, ey - dx * 4); c.closePath(); c.fill();
  }
  // Ghost ball where the cue meets the first ball, plus where that ball heads and where the cue glances off.
  function drawContact(c, h, dx, dy, alpha) {
    var b = h.ball, nx = b.x - h.x, ny = b.y - h.y, nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    c.strokeStyle = "rgba(236,234,226," + (0.85 * alpha) + ")"; c.lineWidth = 1;
    c.beginPath(); c.arc(h.x, h.y, R, 0, TAU); c.stroke();
    var cut = clamp(dx * nx + dy * ny, 0, 1);                       // 1 = straight on, 0 = thin cut
    arrowLine(c, b.x + nx * (R + 2), b.y + ny * (R + 2), nx, ny, 22 + 60 * cut, "rgba(255,210,63," + (0.9 * alpha) + ")");
    var tx = dx - cut * nx, ty = dy - cut * ny, tl = Math.hypot(tx, ty);
    if (tl > 0.08) dots(c, h.x, h.y, tx / tl, ty / tl, R + 3, R + 3 + 40 * tl, "rgba(63,240,255," + (0.7 * alpha) + ")");
  }
  function drawGuide(c, a) {
    var dx = Math.cos(a), dy = Math.sin(a), cx = S.cue.x, cy = S.cue.y;
    var h = castFrom(cx, cy, dx, dy);
    dots(c, cx, cy, dx, dy, R + 4, h.d, "rgba(236,234,226,.85)");
    if (h.ball) { drawContact(c, h, dx, dy, 1); return; }
    if (h.pocket) { c.strokeStyle = "rgba(155,255,63,.85)"; c.lineWidth = 2; c.beginPath(); c.arc(h.pocket.x, h.pocket.y, h.pocket.r + 3, 0, TAU); c.stroke(); return; }
    // first bounce off the rail
    c.strokeStyle = "rgba(236,234,226,.6)"; c.lineWidth = 1; c.beginPath(); c.arc(h.x, h.y, R, 0, TAU); c.stroke();
    var rx = h.wall === "x" ? -dx : dx, ry = h.wall === "y" ? -dy : dy;
    var h2 = castFrom(h.x, h.y, rx, ry), lim = Math.min(h2.d, 200);
    dots(c, h.x, h.y, rx, ry, R + 2, lim, "rgba(236,234,226,.45)");
    if (h2.ball && h2.d <= 200) drawContact(c, h2, rx, ry, 0.6);
    else if (h2.pocket && h2.d <= 200) { c.strokeStyle = "rgba(155,255,63,.6)"; c.lineWidth = 2; c.beginPath(); c.arc(h2.pocket.x, h2.pocket.y, h2.pocket.r + 3, 0, TAU); c.stroke(); }
  }
  function drawGuideBtn(c) {
    var on = guide();
    fr(c, GBTN.x, GBTN.y, GBTN.w, GBTN.h, on ? "rgba(63,240,255,.18)" : "rgba(29,32,41,.9)");
    c.strokeStyle = on ? "#3ff0ff" : "#3a3e4c"; c.lineWidth = 1; c.strokeRect(GBTN.x + 0.5, GBTN.y + 0.5, GBTN.w - 1, GBTN.h - 1);
    Shell.uiText(c, "GUIDE (G)", GBTN.x + GBTN.w / 2, GBTN.y + 5, 8, "#8e93a2", "center");
    Shell.text(c, on ? "ON" : "OFF", GBTN.x + GBTN.w / 2, GBTN.y + 20, 8, on ? "#3ff0ff" : "#8e93a2", "center");
  }

  function currentShot() {
    if (S.drag) {
      var len = Math.hypot(S.drag.sx - S.drag.x, S.drag.sy - S.drag.y);
      if (len < 6) return { a: S.aim, p: 0 };
      return { a: Math.atan2(S.drag.sy - S.drag.y, S.drag.sx - S.drag.x), p: clamp(len / MAX_PULL, 0, 1) };
    }
    return { a: S.aim, p: S.charging ? S.power : 0 };
  }

  function drawAim(c) {
    var sh = currentShot(), dx = Math.cos(sh.a), dy = Math.sin(sh.a), cx = S.cue.x, cy = S.cue.y;
    if (guide()) drawGuide(c, sh.a);
    // the cue stick, pulled back by the power
    var back = R + 6 + sh.p * 40, len = 150;
    c.save(); c.lineCap = "round";
    c.strokeStyle = "#3a2410"; c.lineWidth = 5;
    c.beginPath(); c.moveTo(cx - dx * back, cy - dy * back); c.lineTo(cx - dx * (back + len), cy - dy * (back + len)); c.stroke();
    c.strokeStyle = "#c99a5f"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx - dx * back, cy - dy * back); c.lineTo(cx - dx * (back + len), cy - dy * (back + len)); c.stroke();
    c.strokeStyle = "#eceae2"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx - dx * back, cy - dy * back); c.lineTo(cx - dx * (back + 6), cy - dy * (back + 6)); c.stroke();
    c.restore();
    if (S.drag || S.charging) {
      var x = 4, top = 160, hgt = 200;
      fr(c, x, top, 8, hgt, "#23252e");
      fr(c, x, top + hgt * (1 - sh.p), 8, hgt * sh.p, sh.p > 0.8 ? "#ff4b3e" : sh.p > 0.45 ? "#ffd23f" : "#3ff0ff");
    }
  }

  function drawHUD(c, t) {
    fr(c, 0, 0, W, 54, "rgba(13,15,21,.95)");
    fr(c, 0, 54, W, 2, "#2c3040");
    Shell.text(c, "CLOCK", 10, 7, 8, "#8e93a2");
    Shell.text(c, fmt(clock()), 10, 21, 16, clock() > CLOSE_AT - 30 ? "#ff4b3e" : "#ffd23f");
    Shell.text(c, "RACK " + S.rack + "/" + RACKS, W / 2, 7, 8, "#eceae2", "center");
    var left = 0; for (var i = 0; i < S.balls.length; i++) if (!S.balls[i].in) left++;
    for (i = 0; i < 9; i++) {
      var bx = W / 2 - 40 + i * 10, on = S.balls.some(function (b) { return b.n === i + 1 && !b.in; });
      circ(c, bx, 28, 4, on ? COLORS[i] : "#23252e");
      if (!on) { c.strokeStyle = "#3a3e4c"; c.beginPath(); c.arc(bx, 28, 4, 0, TAU); c.stroke(); }
    }
    Shell.uiText(c, left + " LEFT", W / 2, 38, 9, "#8e93a2", "center");
    // shopkeeper clock: the hand sweeps toward CLOSED
    var cx = W - 30, cy = 27, k = clamp(clock() / CLOSE_AT, 0, 1);
    circ(c, cx, cy, 19, "#eceae2"); circ(c, cx, cy, 17, "#1d2029");
    c.fillStyle = "#ff4b3e"; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, 17, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.01); c.closePath(); c.fill();
    var ha = -Math.PI / 2 + k * TAU;
    c.strokeStyle = "#ffd23f"; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ha) * 14, cy + Math.sin(ha) * 14); c.stroke();
    Shell.uiText(c, "CLOSED AT " + fmt(CLOSE_AT), W - 54, 44, 8, "#8e93a2", "right");
    drawGuideBtn(c);
  }

  function draw(c, state) {
    var t = (state === "title" || state === "over") ? idleT : S.t;
    drawRoom(c, t);
    drawTable(c, t);
    var a = all();
    for (var i = 0; i < a.length; i++) drawBall(c, a[i]);
    if (state === "playing" && S.phase === "aim") drawAim(c);
    for (i = 0; i < parts.length; i++) fr(c, parts[i].x, parts[i].y, 3, 3, parts[i].c);
    if (S.x) {
      var area = { x: X0 - 20, y: Y0 - 20, w: X1 - X0 + 40, h: Y1 - Y0 + 40 };
      X.drawScenery(c, S.x.sc, t, area);
      if (S.x.rare) { var rp = POCKETS[S.x.rare.p]; X.drawCart(c, rp.x + (rp.x < 180 ? 16 : -16), rp.y + (rp.y < 200 ? 20 : rp.y > 400 ? -20 : 0), "rare", t, 0.8); }
      S.x.fever.draw(c, area, t);
    }
    drawHUD(c, t);
    if (S.x) { X.drawTag(c, S.x.sc, 10, 58); X.drawEvent(c, W, H); }   // tag sits just under the top status bar, not on it
  }

  // Hook for automated checks (no effect on play)
  window.__pool = { S: function () { return S; }, update: update, shoot: shoot, step: step, cast: cast, castFrom: castFrom, guide: function () { return guide(); }, moving: moving, POCKETS: POCKETS, R: R };

  Shell.init({
    slug: "pawn-shop-pool",
    title: "PAWN SHOP POOL",
    accent: "#ff4b3e",
    width: W, height: H,
    lowerIsBetter: true,
    format: fmt,
    howTo: "Clear three racks in the back room before the shop closes. Drag back from anywhere to aim and set power, then let go. Tap GUIDE at the top to turn the aim line on or off.",
    keys: "Keys: left and right aim (up and down fine tune), hold Space for power, release to shoot, G turns the aim guide on or off. P pause, M mute, R restart.",
    tip: "A scratch costs 10 seconds. Two balls in one shot takes 3 off.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { keys = {}; S.drag = null; S.charging = false; }
  });
})();
