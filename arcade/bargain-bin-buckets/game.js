/* BARGAIN BIN BUCKETS: 60 seconds, a rack of balls, and a hoop that keeps backing up. */
(function () {
  "use strict";
  var W = 360, H = 540;
  var GRAV = 11, BALL_R = 0.12, RIM_R = 0.23, RIM_Y = 3.05, TUBE = 0.02;
  var CAM_Z = -1.0, CAM_Y = 1.7, HORIZON = 262, F = 360;
  var HAND = { x: 0, y: 0.95, z: 0.3 };
  var LEVELS = [3.2, 4.4, 5.5];
  var LAUNCH = 64 * Math.PI / 180;
  var AIM_DEEP = 0.12; // aim a touch past the rim center so the front rim stays clear
  var ROUND_TIME = 60, BONUS_TIME = 15, BONUS_NEED = 20, DRIFT_AT = 20;
  var MAX_DRAG = 240, TAU = Math.PI * 2;

  var S = {}, keys = {}, titleT = 0;
  var parts = [];
  var idleT = 0;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function proj(x, y, z) {
    var d = Math.max(0.25, z - CAM_Z), s = F / d;
    return { x: W / 2 + x * s, y: HORIZON - (y - CAM_Y) * s, s: s };
  }

  function reset() {
    S = { t: 0, time: ROUND_TIME, round: "main", score: 0, makes: 0, shots: 0, swishes: 0,
          streak: 0, bestStreak: 0, fire: false, level: 0, hoopZ: LEVELS[0], hoopX: 0, driftT: 0,
          balls: [], ready: 0.2, drag: null, aim: 0, power: 0, charging: false, chargeT: 0, kb: false,
          ending: false, endT: 0, netT: 0, missCount: 0, lastQuip: -10, bonusDone: false };
    parts.length = 0;
  }

  /* ---------------- Shooting ---------------- */
  // Launch speed that carries the ball a horizontal distance R up a height h at the fixed launch angle.
  function speedFor(R, h) {
    var c = Math.cos(LAUNCH), tn = Math.tan(LAUNCH), den = 2 * c * c * (R * tn - h);
    if (den <= 0.01) return 14;
    return Math.sqrt(GRAV * R * R / den);
  }
  function hoopAt(tAhead) {
    var hx = S.hoopX;
    if (driftOn()) hx = driftX(S.driftT + tAhead);
    return { x: hx, z: S.hoopZ };
  }
  function driftOn() { return S.round === "bonus" || (S.round === "main" && S.time <= DRIFT_AT); }
  function driftX(t) { return 0.55 * Math.sin(t * 1.5); }

  function idealP() {
    var hp = hoopAt(0.9), Ri = Math.hypot(hp.x - HAND.x, hp.z - HAND.z) + AIM_DEEP;
    return (Ri - 0.8) / 7.0;
  }

  function shoot(p, phi) {
    if (S.ready > 0 || S.ending) return;
    var Rt = 0.8 + clamp(p, 0, 1.15) * 7.0;
    // rough flight time to look ahead at a drifting hoop
    var v0 = speedFor(Rt, RIM_Y - HAND.y), T = Rt / (v0 * Math.cos(LAUNCH));
    var hp = hoopAt(T);
    var Ri = Math.hypot(hp.x - HAND.x, hp.z - HAND.z) + AIM_DEEP, phiI = Math.atan2(hp.x - HAND.x, hp.z - HAND.z);
    var eR = Rt - Ri, eL = (phi - phiI) * Ri;
    // Friendly arcade assist: close shots get pulled most of the way in, wild ones do not.
    if (Math.abs(eR) < 0.75 && Math.abs(eL) < 0.55) {
      Rt = Ri + eR * 0.25;
      phi = phiI + (eL * 0.3) / Ri;
    }
    var v = speedFor(Rt, RIM_Y - HAND.y);
    var vh = v * Math.cos(LAUNCH);
    S.balls.push({ x: HAND.x, y: HAND.y, z: HAND.z, vx: Math.sin(phi) * vh, vy: v * Math.sin(LAUNCH), vz: Math.cos(phi) * vh,
                   touched: false, scored: false, missed: false, t: 0, spin: 0, bounces: 0, fire: S.fire });
    S.shots++;
    S.ready = 0.32;
    Shell.sfx("whoosh");
  }

  /* ---------------- Physics ---------------- */
  function stepBall(b, dt) {
    var hx = S.hoopX, hz = S.hoopZ, bz = hz + RIM_R + 0.15;
    var py = b.y;
    b.vy -= GRAV * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.spin += dt * 8;

    // rim: a ring of points
    for (var i = 0; i < 18; i++) {
      var a = i / 18 * TAU;
      var px = hx + Math.cos(a) * RIM_R, pz = hz + Math.sin(a) * RIM_R;
      var dx = b.x - px, dy = b.y - RIM_Y, dz = b.z - pz, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var rr = BALL_R + TUBE;
      if (d < rr && d > 1e-5) {
        var nx = dx / d, ny = dy / d, nz = dz / d, pen = rr - d;
        b.x += nx * pen; b.y += ny * pen; b.z += nz * pen;
        var vn = b.vx * nx + b.vy * ny + b.vz * nz;
        if (vn < 0) {
          b.vx -= 1.55 * vn * nx; b.vy -= 1.55 * vn * ny; b.vz -= 1.55 * vn * nz;
          if (-vn > 0.6) { Shell.sfx("rim"); }
          b.touched = true;
        }
      }
    }
    // backboard
    if (b.vz > 0 && b.z + BALL_R > bz && b.z < bz + 0.15 && Math.abs(b.x - hx) < 0.75 && b.y > 2.8 && b.y < 4.0) {
      b.z = bz - BALL_R; b.vz = -b.vz * 0.55; b.vx *= 0.9;
      b.touched = true;
      Shell.sfx("hit");
    }
    // cage walls and back net
    if (Math.abs(b.x) > 1.8 - BALL_R) { b.x = clamp(b.x, -1.8 + BALL_R, 1.8 - BALL_R); b.vx = -b.vx * 0.5; }
    if (b.z > hz + 1.3) { b.z = hz + 1.3; b.vz = -Math.abs(b.vz) * 0.3; }
    if (b.z < 0.05) { b.z = 0.05; b.vz = Math.abs(b.vz) * 0.4; }

    // through the hoop
    if (!b.scored && !b.missed && py > RIM_Y && b.y <= RIM_Y && b.vy < 0 && Math.hypot(b.x - hx, b.z - hz) < RIM_R - BALL_R * 0.35) {
      b.scored = true;
      made(b);
    }
    // floor
    if (b.y < BALL_R) {
      b.y = BALL_R;
      if (b.vy < 0) { b.vy = -b.vy * 0.5; b.vx *= 0.8; b.vz *= 0.8; b.bounces++; }
      if (!b.scored && !b.missed) { b.missed = true; missed(); }
    }
  }

  function made(b) {
    S.makes++;
    S.streak++;
    S.bestStreak = Math.max(S.bestStreak, S.streak);
    if (window.Trophies && S.streak >= 10) Trophies.unlock("bbb-streak10");
    var pts = S.level === 0 ? 2 : 3;
    var swish = !b.touched;
    if (swish) { pts += 1; S.swishes++; if (window.Trophies) Trophies.unlock("bbb-swish"); }
    if (S.fire) pts *= 2;
    S.score += pts;
    S.netT = 1;
    Shell.sfx(swish ? "swish" : "score");
    if (swish) Shell.sfx("score");
    var label = swish ? "SWISH! +" + pts : "+" + pts;
    if (S.streak === 3 && !S.fire) {
      S.fire = true;
      Shell.flash("ON FIRE!", "Double points until you miss.", "#ff4b3e", 1300);
      if (window.Trophies) Trophies.unlock("bbb-fire");
      Shell.sfx("boost");
      Shell.shake(3, 0.3);
    } else {
      floatText(label, swish ? "#9bff3f" : "#eceae2");
    }
    if (window.NPRewards && (S.streak === 2 || (S.streak >= 5 && S.streak % 5 === 0))) NPRewards.streak(S.streak, S.streak === 2 ? "" : S.streak + " STRAIGHT!");
    var lvl = Math.min(LEVELS.length - 1, Math.floor(S.makes / 10));
    if (lvl > S.level) {
      S.level = lvl;
      Shell.flash("HOOP BACKS UP", lvl === 1 ? "Every bucket is worth 3 now." : "Farthest it goes. Make it count.", "#3ff0ff", 1300);
      Shell.sfx("boost");
    }
    var hp = proj(S.hoopX, RIM_Y, S.hoopZ);
    burst(hp.x, hp.y, S.fire ? 18 : 8, S.fire ? "#ff4b3e" : "#ffd23f");
  }
  function missed() {
    if (S.fire) Shell.flash("FIRE'S OUT", "", "#8e93a2", 700);
    S.streak = 0;
    S.fire = false;
    S.missCount++;
    if (S.t - S.lastQuip > 5 && S.missCount % 3 === 0) {
      S.lastQuip = S.t;
      floatText("Brick. Still 25 cents.", "#8e93a2", true);
    }
    Shell.sfx("miss");
  }

  /* ---------------- Particles + float text ---------------- */
  function burst(x, y, n, col) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = 30 + Math.random() * 90;
      parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.7, c: i % 2 ? col : "#eceae2" });
    }
  }
  var floats = [];
  function floatText(txt, col, small) {
    floats.push({ txt: txt, col: col, small: !!small, t: 0 });
  }

  /* ---------------- Update ---------------- */
  function update(dt) {
    S.t += dt;
    if (!S.ending) S.time -= dt;
    if (S.netT > 0) S.netT = Math.max(0, S.netT - dt * 2.5);
    if (S.ready > 0) S.ready -= dt;

    // hoop slides back toward its level and drifts late in the game
    var tz = LEVELS[S.level];
    S.hoopZ += (tz - S.hoopZ) * Math.min(1, dt * 3);
    if (driftOn()) {
      S.driftT += dt;
      S.hoopX = driftX(S.driftT);
    } else {
      S.hoopX += (0 - S.hoopX) * Math.min(1, dt * 4);
    }

    if (S.charging) {
      S.chargeT += dt;
      var ph = (S.chargeT / 1.1) % 2;
      S.power = ph < 1 ? ph : 2 - ph;
    }
    var turn = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
    if (turn) { S.aim = clamp(S.aim + turn * 0.6 * dt, -0.5, 0.5); S.kb = true; }

    for (var i = S.balls.length - 1; i >= 0; i--) {
      var b = S.balls[i];
      b.t += dt;
      for (var k = 0; k < 4; k++) stepBall(b, dt / 4);
      if (b.fire && Math.random() < 0.6) {
        var p = proj(b.x, b.y, b.z);
        parts.push({ x: p.x + (Math.random() - 0.5) * 6, y: p.y, vx: 0, vy: -20, life: 0.35, c: Math.random() < 0.5 ? "#ff4b3e" : "#ffd23f" });
      }
      if (b.t > 4.5 || b.bounces > 3) {
        if (!b.scored && !b.missed) { b.missed = true; missed(); }
        S.balls.splice(i, 1);
      }
    }
    for (i = parts.length - 1; i >= 0; i--) {
      var q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 120 * dt;
      if (q.life <= 0) parts.splice(i, 1);
    }
    for (i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; if (floats[i].t > 1.1) floats.splice(i, 1); }

    // clock
    if (!S.ending && S.time <= 0) {
      S.time = 0;
      if (S.round === "main" && S.makes >= BONUS_NEED && !S.bonusDone) {
        S.round = "bonus"; S.bonusDone = true; S.time = BONUS_TIME;
        Shell.flash("BONUS ROUND!", "15 more seconds. Keep it going.", "#ffd23f", 1500);
        if (window.Trophies) Trophies.unlock("bbb-bonus");
        Shell.sfx("best");
      } else {
        S.ending = true; S.endT = 0;
        S.charging = false; S.drag = null;
        Shell.sfx("buzzer");
        Shell.flash("TIME!", S.round === "main" && S.makes < BONUS_NEED ? "Make " + BONUS_NEED + " to unlock the bonus round." : "", "#ff4b3e", 1200);
      }
    }
    if (S.ending) {
      S.endT += dt;
      var flying = S.balls.some(function (b) { return !b.scored && !b.missed; });
      if (S.endT > 1.4 && (!flying || S.endT > 3)) {
        var pct = S.shots ? Math.round(S.makes / S.shots * 100) : 0;
        Shell.gameOver(S.score, { title: "FINAL BUZZER", html:
          row("Buckets", S.makes + " of " + S.shots + " (" + pct + "%)") +
          row("Swishes", S.swishes) +
          row("Longest streak", S.bestStreak) +
          row("Bonus round", S.bonusDone ? "Unlocked" : "Make " + BONUS_NEED),
          stats: { makes: S.makes, shots: S.shots, swishes: S.swishes, bestStreak: S.bestStreak, score: S.score, bonus: S.bonusDone } });
      }
    }
  }
  function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

  /* ---------------- Input ---------------- */
  function pointer(type, x, y) {
    if (type === "down") {
      if (S.ending) return;
      S.drag = { sx: x, sy: y, x: x, y: y };
      S.kb = false; S.charging = false;
    } else if (type === "move" && S.drag) {
      S.drag.x = x; S.drag.y = y;
    } else if ((type === "up" || type === "cancel") && S.drag) {
      var d = S.drag; S.drag = null;
      if (type === "cancel") return;
      var dy = d.sy - d.y, dx = d.x - d.sx;
      if (dy < 12) return; // must swipe upward
      shoot(dy / MAX_DRAG, clamp(Math.atan2(dx, dy) * 0.9, -0.6, 0.6));
    }
  }
  function dragShot() {
    if (!S.drag) return null;
    var dy = S.drag.sy - S.drag.y, dx = S.drag.x - S.drag.sx;
    if (dy < 4) return null;
    return { p: clamp(dy / MAX_DRAG, 0, 1.15), a: clamp(Math.atan2(dx, dy) * 0.9, -0.6, 0.6) };
  }
  function key(type, code, e) {
    var act = code === "Space" || code === "Enter" || code === "NumpadEnter";
    if (type === "down") {
      keys[code] = true;
      if (act && !e.repeat && !S.charging && !S.ending) { S.charging = true; S.chargeT = 0; S.power = 0; S.kb = true; S.drag = null; }
    } else {
      keys[code] = false;
      if (act && S.charging) { S.charging = false; shoot(S.power, S.aim); }
    }
  }

  /* ---------------- Drawing ---------------- */
  function fr(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function poly(c, pts, col) {
    c.fillStyle = col; c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.closePath(); c.fill();
  }

  var SEG = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg" };
  function digit(c, ch, x, y, on, off) {
    var w = 12, h = 22, t = 3, segs = SEG[ch] || "";
    var map = { a: [t, 0, w - 2 * t, t], b: [w - t, t, t, h / 2 - t], c: [w - t, h / 2, t, h / 2 - t], d: [t, h - t, w - 2 * t, t],
                e: [0, h / 2, t, h / 2 - t], f: [0, t, t, h / 2 - t], g: [t, h / 2 - 1, w - 2 * t, t] };
    for (var k in map) { var m = map[k]; fr(c, x + m[0], y + m[1], m[2], m[3], segs.indexOf(k) >= 0 ? on : off); }
  }
  function vcr(c, txt, blinkOff) {
    var x = W / 2 - 54, y = 8;
    fr(c, x - 4, y - 4, 116, 46, "#0b0c10");
    fr(c, x - 2, y - 2, 112, 42, "#23252e");
    fr(c, x, y, 108, 30, "#06120a");
    var on = "#5dff7a", off = "#10261a", cx = x + 10;
    for (var i = 0; i < txt.length; i++) {
      var ch = txt[i];
      if (ch === ":") { if (!blinkOff) { fr(c, cx + 1, y + 9, 3, 3, on); fr(c, cx + 1, y + 18, 3, 3, on); } cx += 8; continue; }
      digit(c, ch, cx, y + 4, blinkOff ? off : on, off);
      cx += 17;
    }
    Shell.uiText(c, "VCR  CH 3", x + 54, y + 31, 8, "#8e93a2", "center");
  }

  function drawRoom(c) {
    fr(c, 0, 0, W, H, "#0d0f15");
    // back wall
    fr(c, 0, 0, W, HORIZON + 30, "#151826");
    // floor lane in perspective
    var a = proj(-1.8, 0, 0.0), b = proj(1.8, 0, 0.0), d = proj(1.8, 0, 7.2), e = proj(-1.8, 0, 7.2);
    poly(c, [a, b, d, e], "#3a2616");
    c.strokeStyle = "#4a321d"; c.lineWidth = 1;
    for (var z = 0.5; z < 7.2; z += 0.7) {
      var l = proj(-1.8, 0, z), r = proj(1.8, 0, z);
      c.beginPath(); c.moveTo(l.x, l.y); c.lineTo(r.x, r.y); c.stroke();
    }
    for (var x = -1.8; x <= 1.81; x += 0.6) {
      var n = proj(x, 0, 0.2), f = proj(x, 0, 7.2);
      c.beginPath(); c.moveTo(n.x, n.y); c.lineTo(f.x, f.y); c.stroke();
    }
    // side cages
    c.strokeStyle = "rgba(63,240,255,.18)";
    for (var s = -1; s <= 1; s += 2) {
      for (var y = 0; y <= 4.2; y += 0.5) {
        var p1 = proj(s * 1.8, y, 0.3), p2 = proj(s * 1.8, y, 7.2);
        c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke();
      }
      for (var zz = 0.3; zz <= 7.2; zz += 0.6) {
        var q1 = proj(s * 1.8, 0, zz), q2 = proj(s * 1.8, 4.2, zz);
        c.beginPath(); c.moveTo(q1.x, q1.y); c.lineTo(q2.x, q2.y); c.stroke();
      }
    }
    // marquee lights along the top of the cage
    var t = (S.t || idleT);
    for (var i = 0; i < 12; i++) {
      var lp = proj(-1.8 + i * 3.6 / 11, 4.2, 7.0);
      var lit = ((i + Math.floor(t * 4)) % 3) === 0 && !Shell.reduced;
      fr(c, lp.x - 2, lp.y - 2, 4, 4, lit ? "#ffd23f" : "#5a4a1a");
    }
  }

  function drawHoop(c, front) {
    var hx = S.hoopX, hz = S.hoopZ, bz = hz + RIM_R + 0.15, i, p;
    if (!front) {
      // pole + backboard
      var pb = proj(hx, 0, bz + 0.25), pt = proj(hx, 2.9, bz + 0.25);
      fr(c, pb.x - 3, pt.y, 6, pb.y - pt.y, "#2c3040");
      var tl = proj(hx - 0.75, 3.95, bz), br = proj(hx + 0.75, 2.85, bz);
      fr(c, tl.x - 2, tl.y - 2, br.x - tl.x + 4, br.y - tl.y + 4, "#0b0c10");
      fr(c, tl.x, tl.y, br.x - tl.x, br.y - tl.y, "#d9dde6");
      var it = proj(hx - 0.3, 3.5, bz), ib = proj(hx + 0.3, 3.08, bz);
      c.strokeStyle = "#ff4b3e"; c.lineWidth = Math.max(1, tl.s * 0.03);
      c.strokeRect(it.x, it.y, ib.x - it.x, ib.y - it.y);
      Shell.text(c, "NP", (tl.x + br.x) / 2, tl.y + 3, Math.max(6, Math.round(tl.s * 0.1)), "#101219", "center");
      // bracket
      var r0 = proj(hx, RIM_Y, hz + RIM_R), r1 = proj(hx, RIM_Y, bz);
      fr(c, r0.x - 2, r1.y, 4, r0.y - r1.y + 2, "#9aa0ad");
    }
    // rim: back half when !front, front half when front
    var pts = [];
    for (i = 0; i <= 24; i++) {
      var a = i / 24 * TAU;
      pts.push({ a: a, p: proj(hx + Math.cos(a) * RIM_R, RIM_Y, hz + Math.sin(a) * RIM_R) });
    }
    c.lineWidth = Math.max(2, pts[0].p.s * 0.035);
    c.strokeStyle = "#ff6a2a";
    c.beginPath();
    var started = false;
    for (i = 0; i <= 24; i++) {
      var isFront = Math.sin(pts[i].a) < 0;
      if (isFront === front) { if (!started) { c.moveTo(pts[i].p.x, pts[i].p.y); started = true; } else c.lineTo(pts[i].p.x, pts[i].p.y); }
      else started = false;
    }
    c.stroke();
    if (front) {
      // net
      var sway = S.netT * 0.06;
      c.strokeStyle = "rgba(236,234,226,.8)"; c.lineWidth = 1;
      for (i = 0; i < 12; i++) {
        var aa = i / 12 * TAU;
        var top = proj(hx + Math.cos(aa) * RIM_R, RIM_Y, hz + Math.sin(aa) * RIM_R);
        var bot = proj(hx + Math.cos(aa) * RIM_R * 0.55, RIM_Y - 0.42 + sway, hz + Math.sin(aa) * RIM_R * 0.55);
        c.beginPath(); c.moveTo(top.x, top.y); c.lineTo(bot.x, bot.y); c.stroke();
      }
      for (var ring = 1; ring <= 2; ring++) {
        var k = ring / 3, rr = RIM_R * (1 - 0.45 * k), yy = RIM_Y - 0.42 * k + sway * k;
        c.beginPath();
        for (i = 0; i <= 16; i++) {
          var ab = i / 16 * TAU;
          p = proj(hx + Math.cos(ab) * rr, yy, hz + Math.sin(ab) * rr);
          if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
        }
        c.stroke();
      }
    }
  }

  function drawBall(c, x, y, z, spin) {
    var p = proj(x, y, z), r = BALL_R * p.s;
    var sh = proj(x, 0, z);
    c.fillStyle = "rgba(0,0,0,.35)";
    c.beginPath(); c.ellipse(sh.x, sh.y, r * 0.9, r * 0.3, 0, 0, TAU); c.fill();
    c.fillStyle = "#e0662a"; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.fill();
    c.fillStyle = "#b34a1c"; c.beginPath(); c.arc(p.x + r * 0.25, p.y + r * 0.25, r * 0.75, 0, TAU); c.fill();
    c.fillStyle = "#e0662a"; c.beginPath(); c.arc(p.x - r * 0.1, p.y - r * 0.1, r * 0.75, 0, TAU); c.fill();
    c.save(); c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.clip();
    c.strokeStyle = "#3a1608"; c.lineWidth = Math.max(1, r * 0.08);
    var o = Math.sin(spin) * r * 0.5;
    c.beginPath(); c.moveTo(p.x - r, p.y + o * 0.3); c.quadraticCurveTo(p.x, p.y + o, p.x + r, p.y + o * 0.3); c.stroke();
    c.beginPath(); c.moveTo(p.x + o, p.y - r); c.quadraticCurveTo(p.x + o * 0.4, p.y, p.x + o, p.y + r); c.stroke();
    // masking tape price sticker
    if (r > 7) {
      var sw = r * 0.95, shh = r * 0.5, sx = p.x - r * 0.65 + o * 0.3, sy = p.y - r * 0.55;
      fr(c, sx, sy, sw, shh, "#e8d9a8");
      if (r > 18) Shell.text(c, "25¢", sx + sw / 2, sy + shh / 2 - 3, 8, "#b0281c", "center");
      else fr(c, sx + sw * 0.2, sy + shh * 0.4, sw * 0.6, Math.max(1, shh * 0.2), "#b0281c");
    }
    c.restore();
  }

  function drawRack(c) {
    // ball return chute in the lower right
    fr(c, 296, 470, 64, 70, "#1d2029");
    fr(c, 296, 470, 64, 3, "#2c3040");
    for (var i = 0; i < 3; i++) {
      c.fillStyle = "#c0571f"; c.beginPath(); c.arc(312 + i * 18, 512, 9, 0, TAU); c.fill();
      fr(c, 307 + i * 18, 506, 7, 4, "#e8d9a8");
    }
  }

  function drawHUD(c, state) {
    fr(c, 0, 0, W, 56, "rgba(13,15,21,.85)");
    var t = Math.ceil(Math.max(0, S.time || 0));
    var idle = state !== "playing";
    if (idle) vcr(c, "12:00", Math.floor(idleT * 2) % 2 === 1);
    else vcr(c, Math.floor(t / 60) + ":" + ("0" + (t % 60)).slice(-2), false);
    Shell.text(c, "SCORE", 10, 10, 8, "#8e93a2");
    Shell.text(c, String(S.score), 10, 24, 16, "#ffd23f");
    Shell.text(c, S.round === "bonus" ? "BONUS" : "MAKES", W - 10, 10, 8, S.round === "bonus" ? "#ffd23f" : "#8e93a2", "right");
    Shell.text(c, String(S.makes), W - 10, 24, 16, "#3ff0ff", "right");
    var lvlTxt = S.level < LEVELS.length - 1 ? "HOOP MOVES IN " + (10 - S.makes % 10) : "MAX DISTANCE";
    Shell.uiText(c, (S.level === 0 ? "2 PT  " : "3 PT  ") + lvlTxt, W / 2, 60, 9, "#8e93a2", "center");
    if (S.fire) {
      var flick = Shell.reduced ? 1 : 0.7 + 0.3 * Math.sin(S.t * 18);
      c.globalAlpha = flick;
      Shell.text(c, "ON FIRE x2", W / 2, 74, 10, "#ff4b3e", "center", "#ff4b3e");
      c.globalAlpha = 1;
    }
    if (driftOn() && state === "playing" && !S.ending) Shell.uiText(c, "HOOP ON THE MOVE", W / 2, S.fire ? 88 : 74, 9, "#ff3fa4", "center");
  }

  function drawAim(c) {
    var shot = dragShot(), p, a, showBand = false;
    if (shot) { p = shot.p; a = shot.a; }
    else if (S.kb && !S.ending) { p = S.charging ? S.power : 0; a = S.aim; showBand = true; }
    else return;
    var base = proj(HAND.x, HAND.y, HAND.z);
    var len = 24 + clamp(p, 0, 1.15) * 120, dx = Math.sin(a), dy = -Math.cos(a), oy = base.y - BALL_R * base.s - 8;
    for (var d = 0; d < len; d += 9) fr(c, base.x + dx * d - 1.5, oy + dy * d - 1.5, 3, 3, d + 9 >= len ? "#ffd23f" : "rgba(236,234,226,.85)");
    // meter
    var x = 18, y = 300, hgt = 150;
    fr(c, x - 2, y - 2, 16, hgt + 4, "#0b0c10");
    fr(c, x, y, 12, hgt, "#23252e");
    if (showBand) {
      var ip = clamp(idealP(), 0, 1);
      fr(c, x - 4, y + hgt * (1 - ip) - 5, 20, 10, "rgba(155,255,63,.35)");
    }
    var pc = clamp(p, 0, 1);
    fr(c, x, y + hgt * (1 - pc), 12, hgt * pc, p > 1 ? "#ff4b3e" : "#ffd23f");
    Shell.text(c, "PWR", x + 6, y + hgt + 6, 8, "#8e93a2", "center");
  }

  function draw(c, state) {
    drawRoom(c);
    var hz = S.hoopZ;
    var behind = [], front = [];
    for (var i = 0; i < S.balls.length; i++) (S.balls[i].z > hz ? behind : front).push(S.balls[i]);
    behind.sort(function (a, b) { return b.z - a.z; });
    front.sort(function (a, b) { return b.z - a.z; });
    drawHoop(c, false);
    for (i = 0; i < behind.length; i++) drawBall(c, behind[i].x, behind[i].y, behind[i].z, behind[i].spin);
    drawHoop(c, true);
    for (i = 0; i < front.length; i++) drawBall(c, front[i].x, front[i].y, front[i].z, front[i].spin);
    drawRack(c);
    // ball in hand rolling in from the chute
    if (!S.ending) {
      var k = S.ready > 0 ? clamp(S.ready / 0.32, 0, 1) : 0;
      drawBall(c, HAND.x + k * 1.0, HAND.y - k * 0.4, HAND.z, k * 6);
    }
    for (i = 0; i < parts.length; i++) fr(c, parts[i].x, parts[i].y, 3, 3, parts[i].c);
    for (i = 0; i < floats.length; i++) {
      var f = floats[i], yy = 230 - f.t * 40;
      c.globalAlpha = Math.max(0, 1 - f.t / 1.1);
      if (f.small) Shell.uiText(c, f.txt, W / 2, yy, 14, f.col, "center");
      else Shell.text(c, f.txt, W / 2, yy, 14, f.col, "center");
      c.globalAlpha = 1;
    }
    drawHUD(c, state);
    if (state === "playing") drawAim(c);
  }

  // Hook for automated checks (no effect on play)
  window.__buckets = { S: function () { return S; }, shoot: shoot, idealP: idealP };

  Shell.init({
    slug: "bargain-bin-buckets",
    title: "BARGAIN BIN BUCKETS",
    accent: "#ff3fa4",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "60 seconds, a rack of balls, and a hoop that keeps backing up. Swipe up to shoot: longer swipe, more power. Angle the swipe to aim.",
    keys: "Keys: left and right aim, hold Space for power, release to shoot. P pause, M mute, R restart.",
    tip: "Hit 3 in a row to catch fire. Make 20 for a bonus round.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) {
      idleT += dt;
      // secret: leave the title card alone while the VCR clock blinks 12:00
      if (Shell.state() === "title" && !document.hidden) { titleT += dt; if (titleT >= 60 && window.Trophies) Trophies.unlock("bbb-clock"); }
    },
    onPause: function () { keys = {}; S.drag = null; S.charging = false; }
  });
})();
