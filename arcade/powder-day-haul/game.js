/* POWDER DAY HAUL: carve down Mount Backlog and grab the loose discs before the bottom.
   World distance d runs down the mountain. The rider sits at screen y = PY; the world scrolls up. */
(function () {
  "use strict";
  var W = 360, H = 540, TAU = Math.PI * 2, PY = 160;
  var LEN = 15200, V0 = 150, V1 = 265, STEER = 230, CRASHES = 3;
  var SPIN_RATE = 720, LAND_TOL = 42;
  var BTN = { x: 130, y: 470, w: 100, h: 56 };          // SPIN button (touch)

  var S = {}, keys = {}, idleT = 0, parts = [];
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
          gates: 0, gatesTotal: 0, score: 0, finished: false, ptrSteer: 0, mouseSteer: null, holdSpin: false, carve: 0 };
    parts.length = 0;
  }

  /* ---------------- Update ---------------- */
  function steerInput() {
    var k = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
    if (k) return k;
    if (S.ptrSteer) return S.ptrSteer;
    if (S.mouseSteer != null) return S.mouseSteer;
    return 0;
  }
  function spinHeld() { return keys.Space || keys.Enter || S.holdSpin; }

  function update(dt) {
    S.t += dt; S.pt += dt;
    var i, o;
    for (i = parts.length - 1; i >= 0; i--) { var q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.life <= 0) parts.splice(i, 1); }
    if (S.phase === "done") { if (S.pt > 1.2) finish(); return; }

    var k = clamp(S.d / LEN, 0, 1), target = V0 + (V1 - V0) * k;
    if (S.crash > 0) {
      S.crash -= dt; S.v = Math.max(40, S.v - 300 * dt);
      if (S.crash <= 0) { S.inv = 1.4; }
    } else {
      S.v += (target - S.v) * Math.min(1, dt * 0.8);
      if (S.inv > 0) S.inv -= dt;
      var st = S.air > 0 ? 0 : steerInput();
      S.vx += (st * STEER - S.vx) * Math.min(1, dt * 7);
      S.carve = st;
      if (S.air > 0) { S.vx *= 1 - dt * 0.3; }
    }
    S.x = clamp(S.x + S.vx * dt, 14, W - 14);
    S.d += S.v * dt;

    // air + spins
    if (S.air > 0) {
      S.airT += dt;
      if (spinHeld()) { S.spin += SPIN_RATE * dt; S.spinning = true; }
      if (S.airT >= S.air) land();
    }

    // things on the slope
    for (i = 0; i < S.obs.length; i++) {
      o = S.obs[i];
      if (o.y < S.d - 40) continue;
      if (o.y > S.d + 30) break;
      if (o.gone) continue;
      var dy = o.y - S.d, dx = o.x - S.x;
      if (o.t === "gate") {
        if (!o.done && dy < 0) {
          o.done = true; S.gatesTotal++;
          if (Math.abs(dx) < o.half - 6) { S.gates++; S.score += 100; Shell.flash("GATE", "+100", "#3ff0ff", 600); Shell.sfx("score"); }
          else { Shell.flash("MISSED GATE", "", "#8e93a2", 600); }
        }
        continue;
      }
      if (Math.abs(dy) > o.r + 9 || Math.abs(dx) > o.r + 9) continue;
      if (Math.hypot(dx, dy) > o.r + (o.t === "disc" || o.t === "ramp" ? 9 : 6)) continue;
      if (o.t === "disc") {
        o.gone = true; S.discs++; S.score += 50;
        S.discRow = (S.discRow || 0) + 1;              // discs since the last wipeout, rewards.js pill every 10
        if (window.NPRewards && S.discRow % 10 === 0) NPRewards.streak(S.discRow, S.discRow + " DISCS, NO WIPEOUT");
        Shell.tone(1200 + (S.discs % 4) * 160, 0.06, "square", 0.18);
        sparkle(o.x, PY + dy);
        continue;
      }
      if (o.t === "ramp") {
        if (S.air <= 0 && S.crash <= 0) { o.gone = true; S.air = 0.7 + S.v / 520; S.airT = 0; S.spin = 0; S.spinning = false; S.jumps++; Shell.sfx("boost"); }
        continue;
      }
      if (S.air > 0 || S.crash > 0 || S.inv > 0) continue;
      crash(o);
    }

    if (S.d >= LEN && S.phase === "ride") {
      S.finished = true; S.phase = "done"; S.pt = 0;
      var bonus = Math.max(0, Math.round((95 - S.t) * 25));
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
    Shell.noise(0.12, 0.3, 500, 0.8, 0, 0, "lowpass");
  }

  function crash(o, line) {
    S.crashes++; S.crash = 1.0; S.vx = 0; S.air = 0; S.discRow = 0;
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

  function finish() {
    Shell.gameOver(S.score, { title: S.finished ? "MADE THE BOTTOM" : "WIPED OUT", html:
      row("Discs", S.discs + " x 50") + row("Trick points", S.tricks) + row("Gates", S.gates + " of " + S.gatesTotal) +
      row("Time bonus", S.finished ? S.timeBonus : "Finish to earn it") + row("Wipeouts", S.crashes + " of " + CRASHES),
      stats: { score: S.score, discs: S.discs, tricks: S.tricks, bestSpin: S.bestSpin, crashes: S.crashes, finished: S.finished, gates: S.gates, gatesTotal: S.gatesTotal, time: Math.round(S.t) } });
  }
  function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

  /* ---------------- Input ---------------- */
  function inBtn(x, y) { return x >= BTN.x && x <= BTN.x + BTN.w && y >= BTN.y && y <= BTN.y + BTN.h; }
  function pointer(type, x, y, e) {
    var touch = e && e.pointerType !== "mouse";
    if (type === "down") {
      if (inBtn(x, y)) { S.holdSpin = true; return; }
      if (touch) S.ptrSteer = x < W / 2 ? -1 : 1;
      else S.mouseSteer = clamp((x - W / 2) / 90, -1, 1);
    } else if (type === "move") {
      if (!touch) S.mouseSteer = clamp((x - W / 2) / 90, -1, 1);
      else if (S.ptrSteer) S.ptrSteer = x < W / 2 ? -1 : 1;
    } else if (type === "up" || type === "cancel") {
      S.holdSpin = false; S.ptrSteer = 0;
    }
  }
  function key(type, code) {
    keys[code] = type === "down";
    if (type === "down" && (code === "ArrowLeft" || code === "ArrowRight")) S.mouseSteer = null;
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
      case "gate":
        var col = o.done ? "#b9cde0" : "#ff4b3e", col2 = o.done ? "#b9cde0" : "#2f6bff";
        fr(c, x - o.half - 1, y - 18, 2, 18, "#3a3e4c"); fr(c, x - o.half + 1, y - 18, 10, 8, col);
        fr(c, x + o.half - 1, y - 18, 2, 18, "#3a3e4c"); fr(c, x + o.half - 11, y - 18, 10, 8, col2);
        break;
    }
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
      Shell.uiText(c, on ? "HOLD IN THE AIR" : "IN THE AIR ONLY", BTN.x + BTN.w / 2, BTN.y + 34, 8, on ? "#101219" : "#8e93a2", "center");
    }
    if (S.air > 0 && S.spin > 0) Shell.text(c, Math.floor(S.spin / 180) * 180 + "", S.x, PY - 60, 10, "#ff3fa4", "center");
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
    drawRider(c);
    for (i = 0; i < parts.length; i++) fr(c, parts[i].x, parts[i].y, 3, 3, parts[i].c);
    drawHUD(c, state);
  }

  // Hook for automated checks (no effect on play)
  window.__powder = { S: function () { return S; }, update: update, keys: keys, LEN: LEN };

  Shell.init({
    slug: "powder-day-haul",
    title: "POWDER DAY HAUL",
    accent: "#a77bff",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "Carve down Mount Backlog and grab the loose discs before the bottom. Hold the left or right side to carve. Hit a ramp, then hold SPIN in the air and land straight.",
    keys: "Keys: left and right carve, hold Space in the air to spin. Mouse: steer left or right of center. P pause, M mute, R restart.",
    tip: "Three wipeouts and you're done. Land spins straight or it counts as a wipeout.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { for (var k in keys) keys[k] = false; S.ptrSteer = 0; S.holdSpin = false; }
  });
})();
