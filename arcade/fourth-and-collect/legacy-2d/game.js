/* FOURTH AND COLLECT: split the uprights from farther and farther back. Watch the wind flag.
   Units are yards and seconds. x across the field, y downfield from the ball, z up. */
(function () {
  "use strict";
  var W = 360, H = 540, TAU = Math.PI * 2;
  var G = 10.7, ELEV = 40 * Math.PI / 180, CROSSBAR = 3.33, POST_TOP = 13.3, BALL_R = 0.15;
  var START_D = 20, STEP_D = 5, STRIKES = 3;
  var F = 380, CAMB = 3.5, CAMH = 1.6, HZ = 268;
  var P_MAX = 1.2;

  var S = {}, keys = {}, idleT = 0, parts = [], crowd = [];
  (function () {
    var seed = 5;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var cols = ["#ff4b3e", "#3ff0ff", "#ffd23f", "#9bff3f", "#ff3fa4", "#a77bff", "#eceae2"];
    for (var r = 0; r < 6; r++) for (var x = 2; x < W; x += 6) if (rnd() < 0.8) crowd.push({ x: x + (rnd() * 3 | 0), y: 196 + r * 9, c: cols[(rnd() * cols.length) | 0], p: rnd() * TAU });
  })();

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function speedOf(p) { return 13 + clamp(p, 0, P_MAX) * 17; }
  function halfWidth(D) { return D <= 50 ? 3.08 : Math.max(2.4, 3.08 - (D - 50) * 0.025); }

  function reset() {
    S = { t: 0, phase: "aim", pt: 0, D: START_D, makes: 0, strikes: 0, total: 0, longest: 0, attempts: 0,
          aim: 0, power: 0, charging: false, chargeT: 0, drag: null, kb: false, ball: null, result: null, legT: -1 };
    parts.length = 0;
    newWind();
  }

  function newWind() {
    var lvl = S.makes;
    var max = Math.min(4 + lvl * 2.2, 24);
    var sign = Math.random() < 0.5 ? -1 : 1;
    S.wind = { base: sign * max * (0.35 + Math.random() * 0.65), gust: Math.min(lvl * 0.7, 7), ph: Math.random() * TAU };
  }
  function windAt(t) {
    var w = S.wind;
    return w.base + w.gust * Math.sin(t * 1.6 + w.ph) + w.gust * 0.45 * Math.sin(t * 3.7 + w.ph * 2);
  }

  // Power needed to just clear the bar with no wind (for the meter marker)
  function neededPower(D) {
    for (var p = 0; p <= P_MAX; p += 0.01) {
      var v = speedOf(p), vy = v * Math.cos(ELEV), vz = v * Math.sin(ELEV), t = D / vy;
      if (vz * t - 0.5 * G * t * t > CROSSBAR + 0.3) return p;
    }
    return P_MAX;
  }

  /* ---------------- Kicking ---------------- */
  function canKick() { return S.phase === "aim" && S.pt > 0.2; }

  function kick(p, phi) {
    if (!canKick() || p < 0.05) return;
    p = clamp(p, 0, P_MAX);
    var v = speedOf(p);
    phi = clamp(phi, -0.25, 0.25);
    var hook = p > 1 ? (p - 1) * 16 * (phi >= 0 ? 1 : -1) : 0;   // overkicked: it hooks off line
    S.ball = { x: 0, y: 0, z: BALL_R, vx: v * Math.cos(ELEV) * Math.sin(phi), vy: v * Math.cos(ELEV) * Math.cos(phi), vz: v * Math.sin(ELEV),
               hook: hook, spin: 0, crossed: false, done: false, t: 0 };
    S.overkick = p > 1;
    S.attempts++;
    S.phase = "flight"; S.pt = 0; S.legT = 0;
    S.drag = null; S.charging = false;
    Shell.sfx("hit"); Shell.sfx("whoosh");
  }

  function stepBall(b, dt) {
    var py = b.y, px = b.x, pz = b.z;
    b.vx += (windAt(S.t) * 0.1 + b.hook) * dt;
    b.vz -= G * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.spin += dt * 9;
    b.t += dt;
    var D = S.D, hw = halfWidth(D);
    if (!b.crossed && py < D && b.y >= D) {
      b.crossed = true;
      var k = (D - py) / (b.y - py), cx = px + (b.x - px) * k, cz = pz + (b.z - pz) * k;
      var ax = Math.abs(cx);
      if (cz < 0.2) { decide("SHORT", false); return; }
      // the posts
      if (Math.abs(ax - hw) < 0.22 && cz > CROSSBAR - 0.1 && cz < POST_TOP) {
        Shell.sfx("ding");
        var inside = ax < hw;
        b.vy = -Math.abs(b.vy) * 0.25; b.vx = (inside ? -1 : 1) * Math.sign(cx || 1) * 3;
        b.y = D - 0.05;
        decide(inside ? "DOINK IN" : "DOINK OUT", inside);
        return;
      }
      // the crossbar
      if (ax < hw && Math.abs(cz - CROSSBAR) < 0.22) {
        Shell.sfx("ding");
        var over = cz > CROSSBAR;
        if (over) { b.vz = Math.abs(b.vz) * 0.4 + 1; b.vy *= 0.3; }
        else { b.vy = -Math.abs(b.vy) * 0.3; b.y = D - 0.05; }
        decide(over ? "BAR OVER" : "BAR UNDER", over);
        return;
      }
      if (ax < hw && cz > CROSSBAR) { decide("GOOD", true); return; }
      if (ax >= hw) { decide(cx < 0 ? "WIDE LEFT" : "WIDE RIGHT", false); return; }
      decide("UNDER", false);
    }
    if (b.z <= BALL_R) {
      b.z = BALL_R;
      if (!b.crossed) { b.crossed = true; decide("SHORT", false); }
      b.vz = Math.abs(b.vz) * 0.3; b.vx *= 0.6; b.vy *= 0.5;
    }
  }

  function decide(kind, good) {
    S.result = { kind: kind, good: good, D: S.D };
  }

  /* ---------------- Flow ---------------- */
  function update(dt) {
    S.t += dt; S.pt += dt;
    var i;
    for (i = parts.length - 1; i >= 0; i--) {
      var q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 160 * dt;
      if (q.life <= 0) parts.splice(i, 1);
    }
    if (S.legT >= 0) { S.legT += dt; if (S.legT > 0.35) S.legT = -1; }

    if (S.phase === "aim") {
      var turn = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
      if (turn) { S.aim = clamp(S.aim + turn * 0.22 * dt, -0.25, 0.25); S.kb = true; }
      if (S.charging) {
        S.chargeT += dt;
        var ph = (S.chargeT / 1.0) % 2;
        S.power = (ph < 1 ? ph : 2 - ph) * P_MAX;
      }
      return;
    }
    if (S.phase === "flight") {
      var b = S.ball;
      for (i = 0; i < 6; i++) stepBall(b, dt / 6);
      if (S.result && !S.shown) {
        S.shown = true; S.after = 0;
        announce();
      }
      if (S.shown) S.after += dt;
      if ((S.shown && S.after > 1.15) || S.pt > 6) next();
    }
  }

  function announce() {
    var r = S.result, title, sub = "", col;
    if (r.good) {
      S.makes++; S.total += r.D; S.longest = Math.max(S.longest, r.D);
      S.row = (S.row || 0) + 1;
      if (window.NPRewards && S.row >= 2) NPRewards.streak(S.row);
      title = r.kind === "GOOD" ? "IT'S GOOD!" : "DOINK... GOOD!";
      sub = r.D >= 50 ? "Mint condition. " + r.D + " yards." : r.D + " yards. Back 5.";
      col = "#9bff3f";
      Shell.sfx("crowd"); Shell.sfx("score");
      if (r.D >= 50) { burst(50); Shell.sfx("best"); Shell.shake(3, 0.3); } else burst(18);
      if (window.Trophies) {
        Trophies.unlock("fac-good");
        if (r.kind !== "GOOD") Trophies.unlock("fac-doink");
        if (r.D >= 50) Trophies.unlock("fac-50");
        if (r.D >= 50 && S.strikes === 0) Trophies.unlock("fac-clean50");
        if (r.D >= 60) Trophies.unlock("fac-60");
        if (r.D >= 70) Trophies.unlock("fac-70");
      }
    } else {
      S.strikes++; S.row = 0;
      col = "#ff4b3e";
      if (r.kind === "SHORT") { title = "SHORT"; sub = "Needs more leg."; }
      else if (r.kind === "UNDER" || r.kind === "BAR UNDER") { title = r.kind === "BAR UNDER" ? "DOINK!" : "NO GOOD"; sub = "Under the crossbar."; }
      else if (r.kind === "DOINK OUT") { title = "DOINK!"; sub = "Off the upright and out."; }
      else {
        title = r.kind; sub = S.overkick ? "Overkicked it. It hooked." : "Check the wind flag.";
        if (S.overkick && window.Trophies) Trophies.unlock("fac-hook");
      }
      sub += "  Strike " + S.strikes + " of " + STRIKES + ".";
      Shell.sfx("miss");
    }
    Shell.flash(title, sub, col, 1100);
  }

  function next() {
    var good = S.result && S.result.good;
    S.ball = null; S.result = null; S.shown = false;
    if (S.strikes >= STRIKES) {
      Shell.gameOver(S.total, { title: "THREE STRIKES", html:
        row("Kicks made", S.makes + " of " + S.attempts) +
        row("Longest kick", S.longest ? S.longest + " YDS" : "None") +
        row("Last attempt from", S.D + " YDS"),
        stats: { total: S.total, makes: S.makes, attempts: S.attempts, longest: S.longest, strikes: S.strikes, lastD: S.D } });
      return;
    }
    if (good) S.D += STEP_D;
    newWind();
    S.phase = "aim"; S.pt = 0;
    if (good && S.D === 55) Shell.flash("UPRIGHTS NARROW", "Past 50 they start closing in.", "#ffd23f", 1300);
  }
  function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

  function burst(n) {
    var cols = ["#9bff3f", "#ffd23f", "#3ff0ff", "#ff3fa4"];
    if (Shell.reduced) n = Math.ceil(n / 3);
    var p = proj(0, S.D, POST_TOP * 0.6);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = 40 + Math.random() * 120;
      parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 1.1, c: cols[i % 4] });
    }
  }

  /* ---------------- Input ---------------- */
  function pointer(type, x, y) {
    if (type === "down") {
      if (!canKick()) return;
      S.drag = { sx: x, sy: y, x: x, y: y };
      S.kb = false; S.charging = false;
    } else if (type === "move" && S.drag) {
      S.drag.x = x; S.drag.y = y;
    } else if ((type === "up" || type === "cancel") && S.drag) {
      var d = S.drag; S.drag = null;
      if (type === "cancel") return;
      var s = swipe(d);
      if (s) kick(s.p, s.a);
    }
  }
  function swipe(d) {
    var dy = d.sy - d.y, dx = d.x - d.sx;
    if (dy < 16) return null;
    return { p: clamp(dy / 220, 0, P_MAX), a: clamp(Math.atan2(dx, dy) * 0.35, -0.25, 0.25) };
  }
  function key(type, code, e) {
    var act = code === "Space" || code === "Enter" || code === "NumpadEnter";
    if (type === "down") {
      keys[code] = true;
      if (act && !e.repeat && canKick() && !S.charging) { S.charging = true; S.chargeT = 0; S.power = 0; S.kb = true; S.drag = null; }
    } else {
      keys[code] = false;
      if (act && S.charging) { S.charging = false; kick(S.power, S.aim); S.power = 0; }
    }
  }

  /* ---------------- Drawing ---------------- */
  function proj(x, y, z) {
    var d = Math.max(0.6, y + CAMB), s = F / d;
    return { x: W / 2 + x * s, y: HZ + (CAMH - z) * s, s: s };
  }
  function fr(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function quad(c, a, b, d, e, col) {
    c.fillStyle = col; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.lineTo(e.x, e.y); c.closePath(); c.fill();
  }
  function band(c, y1, y2, col) {
    var x = 60;
    quad(c, proj(-x, y1, 0), proj(x, y1, 0), proj(x, y2, 0), proj(-x, y2, 0), col);
  }

  function drawStadium(c, t) {
    var g = c.createLinearGradient(0, 0, 0, HZ);
    g.addColorStop(0, "#060914"); g.addColorStop(1, "#1a2140");
    c.fillStyle = g; c.fillRect(0, 0, W, HZ + 2);
    // light towers
    for (var s = 0; s < 2; s++) {
      var lx = s ? 328 : 12;
      fr(c, lx + 8, 92, 4, 100, "#2c3040");
      fr(c, lx, 82, 20, 12, "#2c3040");
      for (var k = 0; k < 6; k++) fr(c, lx + 2 + (k % 3) * 6, 84 + ((k / 3) | 0) * 5, 4, 3, "#fff6c8");
    }
    // stands + crowd
    fr(c, 0, 190, W, HZ - 190, "#171a28");
    var cheer = S.result && S.result.good && !Shell.reduced;
    for (var i = 0; i < crowd.length; i++) {
      var p = crowd[i], bob = cheer ? Math.round(Math.sin(t * 13 + p.p) * 1.5) : 0;
      fr(c, p.x, p.y + bob, 3, 3, p.c);
    }
    fr(c, 0, HZ - 6, W, 6, "#0f2a1a");
    // scoreboard with the sponsor panel
    fr(c, 14, 94, 136, 82, "#0b0c10");
    fr(c, 17, 97, 130, 44, "#14301e");
    Shell.uiText(c, "MADE", 23, 100, 9, "#9bff3f"); Shell.text(c, String(S.makes), 141, 101, 8, "#eceae2", "right");
    Shell.uiText(c, "LONG", 23, 112, 9, "#9bff3f"); Shell.text(c, S.longest ? String(S.longest) : "--", 141, 113, 8, "#eceae2", "right");
    Shell.uiText(c, "STRIKES", 23, 124, 9, "#9bff3f");
    for (var st = 0; st < STRIKES; st++) {
      var on = st < S.strikes;
      fr(c, 112 + st * 11, 125, 8, 8, on ? "#ff4b3e" : "#23252e");
      if (on) Shell.text(c, "X", 116 + st * 11, 125, 8, "#101219", "center");
    }
    fr(c, 17, 144, 130, 29, "#ffd23f");
    Shell.uiText(c, "SATURDAY MORNING", 82, 146, 9, "#101219", "center");
    Shell.uiText(c, "SWAP MEET", 82, 157, 9, "#101219", "center");
  }

  function drawField(c) {
    fr(c, 0, HZ, W, H - HZ, "#1b5c32");
    var D = S.D, goal = D - 10;
    for (var y = -4; y < D + 14; y += 5) band(c, y, y + 2.5, "#1f6838");
    band(c, goal, D, "#4a1c22");                       // end zone
    for (var yl = Math.ceil((-4) / 5) * 5; yl <= goal; yl += 5) band(c, yl - 0.08, yl + 0.08, "rgba(236,234,226,.75)");
    band(c, goal - 0.1, goal + 0.1, "#eceae2");
    band(c, D - 0.1, D + 0.1, "#eceae2");
    // hash marks
    for (var h = -2; h <= goal; h += 1) {
      var a = proj(-3.1, h, 0), b = proj(3.1, h, 0);
      if (a.y > H) continue;
      fr(c, a.x - 1, a.y, Math.max(1, 0.6 * a.s), 1, "rgba(236,234,226,.6)");
      fr(c, b.x - 1, b.y, Math.max(1, 0.6 * b.s), 1, "rgba(236,234,226,.6)");
    }
    var ez = proj(0, goal + 5, 0);
    Shell.text(c, "COLLECT", ez.x, ez.y - 3, Math.max(6, Math.round(ez.s * 0.9)), "rgba(236,234,226,.55)", "center");
  }

  function drawPosts(c, t) {
    var D = S.D, hw = halfWidth(D);
    var base = proj(0, D + 1.2, 0), cb = proj(0, D, CROSSBAR), l = proj(-hw, D, CROSSBAR), r = proj(hw, D, CROSSBAR);
    var lt = proj(-hw, D, POST_TOP), rt = proj(hw, D, POST_TOP);
    var w = Math.max(2, Math.round(0.12 * cb.s));
    fr(c, base.x - w, cb.y, w * 2, base.y - cb.y, "#ffd23f");
    fr(c, l.x - w / 2, cb.y - w / 2, r.x - l.x + w, w, "#ffd23f");
    fr(c, l.x - w / 2, lt.y, w, l.y - lt.y, "#ffd23f");
    fr(c, r.x - w / 2, rt.y, w, r.y - rt.y, "#ffd23f");
    // streamers on top of each upright show the wind
    var wind = windAt(t), len = 6 + Math.abs(wind) * 1.2, dir = wind >= 0 ? 1 : -1;
    for (var s = 0; s < 2; s++) {
      var px = s ? rt.x : lt.x, py = rt.y;
      var flap = Shell.reduced ? 0 : Math.sin(t * (6 + Math.abs(wind) * 0.3) + s) * 2;
      c.fillStyle = "#ff4b3e";
      c.beginPath(); c.moveTo(px, py); c.lineTo(px + dir * len, py + 3 + flap); c.lineTo(px, py + 6); c.closePath(); c.fill();
    }
  }

  function drawBall(c, b, onTee) {
    var p = proj(b.x, b.y, b.z), g = proj(b.x, b.y, 0);
    var r = Math.max(1.5, 0.17 * p.s);
    var sh = Math.max(0.15, 1 - b.z / 12);
    c.fillStyle = "rgba(0,0,0," + (0.35 * sh) + ")";
    c.beginPath(); c.ellipse(g.x, g.y, r * 0.9, r * 0.28, 0, 0, TAU); c.fill();
    c.save(); c.translate(p.x, p.y); c.rotate(onTee ? -Math.PI / 2 + 0.25 : b.spin);
    c.fillStyle = "#7a3f1c"; c.beginPath(); c.ellipse(0, 0, r, r * 0.6, 0, 0, TAU); c.fill();
    c.fillStyle = "#9a5428"; c.beginPath(); c.ellipse(-r * 0.15, -r * 0.12, r * 0.7, r * 0.35, 0, 0, TAU); c.fill();
    if (r > 4) {
      c.fillStyle = "#eceae2";
      c.fillRect(-r * 0.35, -r * 0.08, r * 0.7, Math.max(1, r * 0.1));
      for (var i = -2; i <= 2; i++) c.fillRect(i * r * 0.13 - 0.5, -r * 0.18, 1, r * 0.28);
      c.fillRect(-r * 0.92, -r * 0.3, Math.max(1, r * 0.08), r * 0.6);
      c.fillRect(r * 0.84, -r * 0.3, Math.max(1, r * 0.08), r * 0.6);
    }
    c.restore();
  }

  function drawTee(c) {
    var t = proj(0, 0, 0);
    c.fillStyle = "#ff6a2a";
    c.beginPath(); c.moveTo(t.x - 10, t.y + 2); c.lineTo(t.x + 10, t.y + 2); c.lineTo(t.x + 4, t.y - 12); c.lineTo(t.x - 4, t.y - 12); c.closePath(); c.fill();
  }
  function drawLeg(c) {
    var t = proj(0, 0, 0);
    if (S.legT >= 0) {
      var k = clamp(S.legT / 0.15, 0, 1), ly = H + 20 - k * (H + 20 - t.y + 6) + (S.legT > 0.15 ? (S.legT - 0.15) * 300 : 0);
      fr(c, t.x - 14, ly, 28, 60, "#eceae2");
      fr(c, t.x - 16, ly - 10, 32, 16, "#101219");
      fr(c, t.x - 16, ly - 2, 32, 3, "#ff4b3e");
    }
  }

  function drawAim(c) {
    var s = S.drag ? swipe(S.drag) : null;
    var a = s ? s.a : S.aim, pw = s ? s.p : (S.charging ? S.power : -1);
    for (var y = 2; y < S.D; y += 2) {
      var p = proj(Math.sin(a) * y, y, 0.05);
      var sz = Math.max(1.5, Math.min(4, p.s * 0.08));
      fr(c, p.x - sz / 2, p.y - sz / 2, sz, sz, y + 2 >= S.D ? "#ffd23f" : "rgba(236,234,226,.8)");
    }
    var x = 16, top = 300, hgt = 160;
    fr(c, x - 2, top - 2, 16, hgt + 4, "#0b0c10");
    fr(c, x, top, 12, hgt, "#23252e");
    var redTop = top, redH = hgt * (P_MAX - 1) / P_MAX;
    fr(c, x, redTop, 12, redH, "rgba(255,75,62,.35)");
    var need = neededPower(S.D) / P_MAX;
    fr(c, x - 4, top + hgt * (1 - need) - 1, 20, 2, "#9bff3f");
    if (pw >= 0) {
      var pc = clamp(pw, 0, P_MAX) / P_MAX;
      fr(c, x, top + hgt * (1 - pc), 12, hgt * pc, pw > 1 ? "#ff4b3e" : pw >= neededPower(S.D) ? "#9bff3f" : "#ffd23f");
    }
    Shell.text(c, "PWR", x + 6, top + hgt + 6, 8, "#8e93a2", "center");
  }

  function drawHUD(c, t) {
    fr(c, 0, 0, W, 56, "rgba(13,15,21,.94)");
    fr(c, 0, 56, W, 2, "#2c3040");
    Shell.text(c, "SCORE", 10, 8, 8, "#8e93a2");
    Shell.text(c, S.total + " YDS", 10, 22, 12, "#ffd23f");
    Shell.text(c, "KICK FROM", W / 2, 8, 8, "#8e93a2", "center");
    Shell.text(c, S.D + " YDS", W / 2, 22, 12, "#eceae2", "center");
    // wind flag widget
    var wind = windAt(t), mph = Math.round(Math.abs(wind)), dir = wind >= 0 ? 1 : -1;
    var fx = W - 46, fy = 10;
    fr(c, fx, fy, 2, 34, "#8e93a2");
    var len = 8 + Math.min(30, Math.abs(wind) * 1.4), flap = Shell.reduced ? 0 : Math.sin(t * 7) * 2;
    c.fillStyle = "#ff4b3e";
    c.beginPath(); c.moveTo(fx + 1, fy); c.lineTo(fx + 1 + dir * len, fy + 5 + flap); c.lineTo(fx + 1, fy + 11); c.closePath(); c.fill();
    Shell.uiText(c, "WIND " + (mph === 0 ? "CALM" : (dir > 0 ? "> " : "< ") + mph + " MPH"), W - 8, 44, 9, "#eceae2", "right");
    if (S.wind.gust > 0.5) Shell.uiText(c, "GUSTY", W - 104, 44, 9, "#ff3fa4", "right");
  }

  function draw(c, state) {
    var t = (state === "title" || state === "over") ? idleT : S.t;
    drawStadium(c, t);
    drawField(c);
    var b = S.ball;
    var behind = b && b.y > S.D;
    if (behind) drawBall(c, b, false);
    drawPosts(c, t);
    drawTee(c);
    if (!b) drawBall(c, { x: 0, y: 0, z: 0.28, spin: 0 }, true);
    drawLeg(c);
    if (b && !behind) drawBall(c, b, false);
    for (var i = 0; i < parts.length; i++) fr(c, parts[i].x, parts[i].y, 3, 3, parts[i].c);
    drawHUD(c, t);
    if (state === "playing" && S.phase === "aim") drawAim(c);
  }

  // Hook for automated checks (no effect on play)
  window.__fourth = { S: function () { return S; }, kick: kick, stepBall: stepBall, windAt: windAt, neededPower: neededPower };

  Shell.init({
    slug: "fourth-and-collect",
    title: "FOURTH AND COLLECT",
    accent: "#9bff3f",
    width: W, height: H,
    format: function (n) { return n + " YDS"; },
    howTo: "Split the uprights from farther and farther back. Swipe up through the ball: a longer swipe kicks harder, the angle aims. Watch the wind flag.",
    keys: "Keys: left and right aim, hold Space for power, release to kick. P pause, M mute, R restart.",
    tip: "The green notch on the power bar clears the bar on a calm day. Red means you overkicked it.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { keys = {}; S.drag = null; S.charging = false; }
  });
})();
