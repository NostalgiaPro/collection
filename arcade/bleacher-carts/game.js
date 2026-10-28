/* BLEACHER CARTS: 20 pitches. Time your swing and knock carts into the cheap seats. */
(function () {
  "use strict";
  var W = 360, H = 540, TAU = Math.PI * 2;
  var BASE_PITCHES = 20;
  var REL = { x: 180, y: 286 }, PLATE = { x: 180, y: 446 };
  var PERFECT = 0.026, GOOD = 0.056, WEAK = 0.09, TIP = 0.12;
  var GROUND_Y = 432, FT = 1.15; // flight view: ground line and pixels per foot

  var S = {}, keys = {}, idleT = 0;
  var parts = [];
  var crowd = [], stars = [];

  (function () {
    var seed = 11;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var cols = ["#ff4b3e", "#3ff0ff", "#ff3fa4", "#9bff3f", "#ffd23f", "#a77bff", "#eceae2", "#e0a070"];
    for (var row = 0; row < 7; row++) for (var x = 4; x < W; x += 7) {
      if (rnd() < 0.86) crowd.push({ x: x + (rnd() * 3 | 0), y: 128 + row * 10, c: cols[(rnd() * cols.length) | 0], p: rnd() * TAU });
    }
    for (var i = 0; i < 40; i++) stars.push([rnd() * W, rnd() * 70, rnd() < 0.3 ? 2 : 1]);
  })();

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function fence(theta) { return 330 + 70 * (1 - Math.abs(theta) / 45); }
  function zone(theta) {
    var a = Math.abs(theta);
    if (a < 8) return "dead center";
    var side = theta < 0 ? "left" : "right";
    if (a < 24) return side + " center";
    return side + " field";
  }
  function billboardAngle(t) { return 28 * Math.sin(t * 0.45); }

  function reset() {
    S = { t: 0, phase: "ready", pt: 0, left: BASE_PITCHES, thrown: 0, total: 0, longest: 0, hrs: 0,
          streak: 0, features: 0, bonusEarned: 0, stance: 0, drag: null,
          pitch: null, swing: -1, swingAt: 0, hit: null, result: null, msg: "" };
    parts.length = 0;
  }

  /* ---------------- Pitching ---------------- */
  function newPitch() {
    var n = S.thrown;
    var T = clamp(0.8 - n * 0.016, 0.5, 0.8);
    var type = "fastball", brk = 0;
    if (n >= 8) {
      var r = Math.random();
      if (r < 0.3) { type = "changeup"; T *= 1.35; }
      else if (r < 0.55) { type = "curveball"; T *= 1.12; brk = (Math.random() < 0.5 ? -1 : 1) * rand(14, 22); }
    }
    S.pitch = { T: T, type: type, brk: brk, t: 0, done: false };
    S.thrown++;
    S.left--;
  }
  function pitchPos(p, u) {
    var s0 = 1 / 7, s = 1 / (1 + (1 - u) * 6), k = (s - s0) / (1 - s0);
    return { x: REL.x + p.brk * u * u * u, y: REL.y + (PLATE.y - REL.y) * k, r: 1.5 + 5.5 * k };
  }

  function swing() {
    if (S.phase !== "pitch" || S.swing >= 0) return;
    S.swing = 0;
    var p = S.pitch, e = p.t - p.T;
    S.swingAt = e;
    Shell.sfx("whoosh");
    var a = Math.abs(e);
    if (a > TIP) { S.result = { kind: "whiff", e: e }; return; }
    contact(e);
  }

  function contact(e) {
    var a = Math.abs(e), d, launch, perfect = false, label;
    var theta = clamp(e / TIP * 52 + S.stance * 12 + rand(-4, 4), -70, 70);
    if (a <= PERFECT) { d = rand(412, 482); launch = rand(24, 32); perfect = true; label = "PERFECT"; }
    else if (a <= GOOD) { d = 340 + (GOOD - a) / (GOOD - PERFECT) * 75 + rand(-10, 20); launch = rand(22, 36); label = e < 0 ? "EARLY" : "LATE"; }
    else if (a <= WEAK) { d = rand(200, 330); launch = Math.random() < 0.6 ? rand(45, 62) : rand(8, 16); label = e < 0 ? "WAY EARLY" : "WAY LATE"; }
    else { d = rand(60, 150); launch = rand(-4, 8); label = "TOPPED IT"; theta = clamp(theta * 1.3, -80, 80); }
    if (S.pitch.type === "changeup" && !perfect) d -= 12;
    var foul = Math.abs(theta) > 45;
    var fd = fence(theta);
    var hr = !foul && d >= fd;
    var target = null;
    if (hr) {
      var bb = billboardAngle(S.t + 0.6);
      if (Math.abs(theta) < 9 && d >= 452) target = "scoreboard";
      else if (Math.abs(theta - bb) < 7 && d >= fd + 18 && d <= fd + 75) target = "billboard";
      else if (d >= fd + 85) target = "clear";
    }
    var peak = launch < 10 ? 4 : Math.tan(launch * Math.PI / 180) * d * 0.42;
    S.hit = { d: Math.round(d), theta: theta, launch: launch, perfect: perfect, foul: foul, hr: hr, fence: fd,
              target: target, peak: peak, label: label, u: 0 };
    S.result = { kind: "hit" };
    Shell.sfx("crack");
    if (perfect) Shell.shake(4, 0.25);
  }

  /* ---------------- Flow ---------------- */
  function setPhase(ph) { S.phase = ph; S.pt = 0; }

  function finishHit() {
    var h = S.hit, title, sub, col = "#eceae2", bonus = [];
    if (h.hr) {
      S.hrs++; S.streak++;
      S.total += h.d;
      S.longest = Math.max(S.longest, h.d);
      title = h.d >= 470 ? "MOONSHOT!" : "HOME RUN!";
      if (window.Trophies) {
        Trophies.unlock("bc-hr");
        if (h.d >= 470) Trophies.unlock("bc-moon");
        if (h.target === "billboard") Trophies.unlock("bc-sign");
        if (h.target === "scoreboard") Trophies.unlock("bc-board");
      }
      sub = h.d + " FT to " + zone(h.theta);
      col = "#ffd23f";
      if (h.target === "scoreboard") bonus.push("Off the scoreboard! Bonus pitch.");
      if (h.target === "billboard") bonus.push("Hit the shelf sign! Bonus pitch.");
      if (h.target === "clear") bonus.push("Cleared the bleachers! Bonus pitch.");
      if (h.target) { S.left++; S.bonusEarned++; }
      if (S.streak % 3 === 0) {
        S.total += 500; S.features++;
        if (window.Trophies) Trophies.unlock("bc-feature");
        bonus.push("BLEACHER FEATURE +500 FT");
      }
      Shell.sfx("crowd"); Shell.sfx("score");
      if (h.perfect) burstAt(W / 2, 140, 40);
      if (window.NPRewards && S.streak >= 2) NPRewards.streak(S.streak);
    } else {
      S.streak = 0;
      if (h.foul) { title = "FOUL BALL"; sub = h.d > 200 ? "Long strike, wrong side of the pole." : "Into the seats behind the dugout."; }
      else if (h.launch < 10) { title = "GROUNDER"; sub = "Beat into the dirt. 0 FT."; }
      else if (h.d >= h.fence - 25) { title = "AT THE WALL"; sub = "Caught on the warning track. " + h.d + " FT."; col = "#ff3fa4"; }
      else if (h.launch > 44) { title = "POP UP"; sub = "Straight up. 0 FT."; }
      else { title = "FLY OUT"; sub = h.d + " FT, but in the park."; }
      Shell.sfx("miss");
    }
    if (bonus.length) sub += "  " + bonus.join("  ");
    Shell.flash(title, sub, col, bonus.length ? 1700 : 1150);
    setPhase("post");
    S.postLen = bonus.length ? 1.25 : 0.85;
  }

  function strike(swung) {
    S.streak = 0;
    Shell.flash("STRIKE", swung ? (S.swingAt < 0 ? "Way out in front." : "Too late on it.") : "Gotta swing to send it.", "#ff4b3e", 900);
    Shell.noise(0.09, 0.6, 300, 0.7, 0, 0, "lowpass");
    setPhase("post");
    S.postLen = 0.7;
  }

  function nextPitch() {
    S.pitch = null; S.swing = -1; S.hit = null; S.result = null;
    if (S.left <= 0) {
      Shell.gameOver(S.total, { title: "DERBY OVER", html:
        row("Home runs", S.hrs + " of " + S.thrown) +
        row("Longest blast", S.longest ? S.longest + " FT" : "None") +
        row("Bonus pitches", S.bonusEarned) +
        row("Bleacher features", S.features),
        stats: { total: S.total, hrs: S.hrs, thrown: S.thrown, longest: S.longest, bonusEarned: S.bonusEarned, features: S.features } });
      return;
    }
    setPhase("ready");
  }
  function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

  function update(dt) {
    S.t += dt; S.pt += dt;
    var sd = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
    if (sd && (S.phase === "ready" || S.phase === "windup")) S.stance = clamp(S.stance + sd * 2.2 * dt, -1, 1);
    if (S.swing >= 0) S.swing += dt;

    if (S.phase === "ready") {
      if (S.pt > 0.4) { newPitch(); setPhase("windup"); }
    } else if (S.phase === "windup") {
      if (S.pt > 0.8) { setPhase("pitch"); Shell.tone(180, 0.12, "triangle", 0.15, 90); }
    } else if (S.phase === "pitch") {
      var p = S.pitch;
      p.t += dt;
      if (S.result && S.result.kind === "hit") { setPhase("contact"); return; }
      if (p.t > p.T + 0.14) {
        Shell.noise(0.06, 0.7, 500, 0.8, 0, 0, "lowpass"); // into the mitt
        strike(S.swing >= 0);
      }
    } else if (S.phase === "contact") {
      if (S.pt > 0.3) setPhase("flight");
    } else if (S.phase === "flight") {
      var h = S.hit, dur = h.hr ? 1.45 : 1.0;
      if (h.launch < 10) dur = 0.6;
      h.u = Math.min(1, S.pt / dur);
      if (h.u >= 1) finishHit();
    } else if (S.phase === "post") {
      if (S.pt > S.postLen) nextPitch();
    }
    for (var i = parts.length - 1; i >= 0; i--) {
      var q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 160 * dt;
      if (q.life <= 0) parts.splice(i, 1);
    }
  }

  function burstAt(x, y, n) {
    var cols = ["#ffd23f", "#3ff0ff", "#ff3fa4", "#9bff3f"];
    for (var i = 0; i < (Shell.reduced ? n / 3 : n); i++) {
      var a = Math.random() * TAU, s = 40 + Math.random() * 140;
      parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 1, c: cols[i % 4] });
    }
  }

  /* ---------------- Input ---------------- */
  function pointer(type, x, y) {
    if (type === "down") {
      if (S.phase === "flight" && S.pt > 0.25) { S.pt = 99; return; } // tap to skip the replay
      if (S.phase === "pitch") { swing(); return; }
      if (S.phase === "ready" || S.phase === "windup") S.drag = { sx: x, st: S.stance };
    } else if (type === "move" && S.drag) {
      S.stance = clamp(S.drag.st + (x - S.drag.sx) / 70, -1, 1);
    } else if (type === "up" || type === "cancel") {
      S.drag = null;
    }
  }
  function key(type, code, e) {
    if (type === "down") {
      keys[code] = true;
      if ((code === "Space" || code === "Enter" || code === "NumpadEnter") && !e.repeat) {
        if (S.phase === "flight" && S.pt > 0.25) S.pt = 99;
        else swing();
      }
    } else keys[code] = false;
  }

  /* ---------------- Drawing: plate view ---------------- */
  function fr(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function poly(c, pts, col) {
    c.fillStyle = col; c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath(); c.fill();
  }

  function drawSky(c, t) {
    var g = c.createLinearGradient(0, 0, 0, 130);
    g.addColorStop(0, "#070a14"); g.addColorStop(1, "#18203a");
    c.fillStyle = g; c.fillRect(0, 0, W, 130);
    for (var i = 0; i < stars.length; i++) fr(c, stars[i][0], stars[i][1], stars[i][2], stars[i][2], "#5a6285");
    // light towers
    for (var s = 0; s < 2; s++) {
      var x = s ? 320 : 18;
      fr(c, x + 8, 30, 4, 100, "#2c3040");
      fr(c, x, 20, 22, 14, "#2c3040");
      for (var k = 0; k < 6; k++) fr(c, x + 2 + (k % 3) * 6, 22 + ((k / 3) | 0) * 6, 4, 4, "#fff6c8");
      c.fillStyle = "rgba(255,246,200,.06)";
      c.beginPath(); c.moveTo(x + 11, 30); c.lineTo(s ? 120 : 240, 300); c.lineTo(s ? 200 : 160, 300); c.closePath(); c.fill();
    }
  }

  function drawScoreboard(c) {
    fr(c, 112, 70, 136, 52, "#0b0c10");
    fr(c, 115, 73, 130, 46, "#14301e");
    Shell.text(c, "BLEACHER CARTS", 180, 77, 8, "#ffd23f", "center");
    Shell.uiText(c, "PITCH", 122, 88, 9, "#9bff3f");
    Shell.uiText(c, "HR", 122, 98, 9, "#9bff3f");
    Shell.uiText(c, "LONG", 122, 108, 9, "#9bff3f");
    Shell.text(c, S.thrown + "/" + (S.thrown + S.left), 238, 89, 8, "#eceae2", "right");
    Shell.text(c, String(S.hrs), 238, 99, 8, "#eceae2", "right");
    Shell.text(c, S.longest ? String(S.longest) : "--", 238, 109, 8, "#eceae2", "right");
  }

  function drawBillboard(c, t) {
    var a = billboardAngle(t);
    var x = 180 + a * 4.2, y = 54 + Math.sin(t * 1.3) * 2;
    c.font = '9px "Silkscreen", monospace';
    var w = Math.ceil(c.measureText("IS IT ON THE SHELF?").width) + 12;
    fr(c, x - w / 2 - 2, y - 9, w + 4, 20, "#0b0c10");
    fr(c, x - w / 2, y - 7, w, 16, "#ff3fa4");
    Shell.uiText(c, "IS IT ON THE SHELF?", x, y - 4, 9, "#101219", "center");
  }

  function drawStands(c, t) {
    fr(c, 0, 120, W, 80, "#1a1d2b");
    for (var r = 0; r < 7; r++) fr(c, 0, 126 + r * 10, W, 2, "#232738");
    var cheer = S.phase === "post" && S.hit && S.hit.hr;
    for (var i = 0; i < crowd.length; i++) {
      var p = crowd[i], bob = cheer && !Shell.reduced ? Math.round(Math.sin(t * 14 + p.p) * 1.5) : 0;
      fr(c, p.x, p.y - 4 + bob, 4, 4, p.c);
      fr(c, p.x, p.y + bob, 4, 3, "#2a2e40");
    }
    sign(c, 58, 150, "FREE PLAY", t, 0);
    sign(c, 286, 160, "MINT IN BOX", t, 1.7);
  }
  function sign(c, x, y, txt, t, ph) {
    var lift = (S.phase === "post" && S.hit && S.hit.hr && !Shell.reduced) ? Math.round(Math.sin(t * 9 + ph) * 3) - 3 : 0;
    c.font = '10px "Silkscreen", monospace';
    var w = c.measureText(txt).width + 8;
    fr(c, x - w / 2 - 1, y - 1 + lift, w + 2, 15, "#0b0c10");
    fr(c, x - w / 2, y + lift, w, 13, "#eceae2");
    Shell.uiText(c, txt, x, y + 2 + lift, 10, "#101219", "center");
  }

  function drawField(c) {
    // wall
    fr(c, 0, 198, W, 12, "#1d5a3a");
    fr(c, 0, 198, W, 2, "#ffd23f");
    Shell.text(c, "330", 24, 201, 8, "#eceae2"); Shell.text(c, "400", 180, 201, 8, "#eceae2", "center"); Shell.text(c, "330", 336, 201, 8, "#eceae2", "right");
    // grass with mowing stripes
    fr(c, 0, 210, W, 330, "#1c5e33");
    for (var i = 0; i < 9; i++) fr(c, 0, 210 + i * i * 4, W, 2 + i, "#206a3a");
    // infield dirt
    poly(c, [180, 236, 318, 352, 180, 492, 42, 352], "#7a5434");
    poly(c, [180, 262, 270, 348, 180, 440, 90, 348], "#1f6638");
    // mound + rubber
    c.fillStyle = "#7a5434"; c.beginPath(); c.ellipse(180, 306, 22, 9, 0, 0, TAU); c.fill();
    fr(c, 174, 304, 12, 2, "#eceae2");
    // bases
    fr(c, 266, 345, 7, 5, "#eceae2"); fr(c, 87, 345, 7, 5, "#eceae2"); fr(c, 177, 258, 7, 5, "#eceae2");
    // batter's boxes + plate
    c.strokeStyle = "rgba(236,234,226,.7)"; c.lineWidth = 1;
    c.strokeRect(118.5, 428.5, 44, 54); c.strokeRect(197.5, 428.5, 44, 54);
    poly(c, [170, 446, 190, 446, 190, 452, 180, 458, 170, 452], "#eceae2");
  }

  function drawPitcher(c) {
    var x = 180, y = 300, ph = S.phase, k = 0;
    if (ph === "windup") k = S.pt / 0.8;
    else if (ph === "pitch") k = 1 + Math.min(1, S.pitch.t / 0.2);
    var lift = ph === "windup" ? Math.sin(k * Math.PI) * 6 : 0;
    // legs
    fr(c, x - 4, y - 8, 3, 8, "#d8d6cf");
    fr(c, x + 1, y - 8 - lift, 3, 8 - lift * 0.3, "#d8d6cf");
    // body
    fr(c, x - 5, y - 20, 10, 12, "#eceae2");
    fr(c, x - 5, y - 15, 10, 2, "#ff4b3e");
    // head + cap
    fr(c, x - 3, y - 26, 6, 6, "#e0a070");
    fr(c, x - 4, y - 28, 8, 3, "#1d2a5a");
    // throwing arm
    if (ph === "windup" && k > 0.5) fr(c, x + 5, y - 30, 3, 10, "#eceae2");
    else if (ph === "pitch" && k < 1.5) fr(c, x - 9, y - 20, 4, 3, "#eceae2");
    else fr(c, x + 5, y - 19, 3, 8, "#eceae2");
    fr(c, x - 9, y - 17, 4, 4, "#8a5a33"); // glove
  }

  function drawBatter(c) {
    var bx = 132 + S.stance * 10, by = 470;
    // shadow
    c.fillStyle = "rgba(0,0,0,.3)"; c.beginPath(); c.ellipse(bx, by + 2, 22, 5, 0, 0, TAU); c.fill();
    // legs
    fr(c, bx - 12, by - 34, 9, 34, "#b9bcc6"); fr(c, bx + 4, by - 34, 9, 34, "#b9bcc6");
    fr(c, bx - 13, by - 4, 11, 5, "#101219"); fr(c, bx + 3, by - 4, 11, 5, "#101219");
    // body
    fr(c, bx - 14, by - 66, 28, 34, "#eceae2");
    for (var i = 0; i < 4; i++) fr(c, bx - 12 + i * 7, by - 66, 1, 34, "#c9cdd8");
    fr(c, bx - 14, by - 36, 28, 4, "#1d2a5a");
    Shell.text(c, "NP", bx, by - 58, 8, "#ff4b3e", "center");
    // head + helmet
    fr(c, bx - 8, by - 82, 16, 16, "#e0a070");
    fr(c, bx - 10, by - 88, 20, 10, "#1d2a5a");
    fr(c, bx + 6, by - 80, 7, 4, "#1d2a5a");
    // bat
    var a;
    if (S.swing < 0) a = -2.2 + Math.sin(S.t * 3) * 0.05;
    else a = -2.2 + Math.min(1, S.swing / 0.13) * 3.6;
    var hx = bx + 10, hy = by - 50;
    c.save(); c.translate(hx, hy); c.rotate(a);
    fr(c, 0, -3, 46, 6, "#c08a50"); fr(c, 30, -4, 18, 8, "#c08a50"); fr(c, 0, -2, 10, 4, "#101219");
    c.restore();
    fr(c, hx - 5, hy - 5, 10, 10, "#e0a070");
    // stance arrow
    if (S.phase === "ready" || S.phase === "windup") {
      Shell.uiText(c, S.stance < -0.3 ? "< PULL" : S.stance > 0.3 ? "OPPO >" : "", bx, by + 8, 9, "#8e93a2", "center");
    }
  }

  function drawPitch(c) {
    var p = S.pitch;
    if (!p || S.phase !== "pitch") return;
    if (S.result && S.result.kind === "hit") return;
    var u = Math.min(1.12, p.t / p.T);
    var q = pitchPos(p, Math.min(1, u));
    if (u > 1) { q.y += (u - 1) * 120; q.r += 1; }
    c.fillStyle = "rgba(0,0,0,.3)"; c.beginPath(); c.ellipse(q.x, q.y + 16 * (q.r / 7), q.r, q.r * 0.35, 0, 0, TAU); c.fill();
    c.fillStyle = "#f6f4ee"; c.beginPath(); c.arc(q.x, q.y, q.r, 0, TAU); c.fill();
    if (q.r > 4) { fr(c, q.x - q.r * 0.5, q.y - 1, q.r, 1, "#ff4b3e"); }
  }

  function drawContactBall(c) {
    if (S.phase !== "contact" || !S.hit) return;
    var h = S.hit, k = S.pt / 0.3;
    var x = PLATE.x + Math.sin(h.theta * Math.PI / 180) * 260 * k, y = PLATE.y - (h.launch < 10 ? 120 : 330) * k;
    drawBall(c, x, y, 6 - 4 * k, h.perfect);
  }

  function drawBall(c, x, y, r, cart) {
    if (cart) {
      var w = r * 2.4, hh = r * 2;
      fr(c, x - w / 2 - 1, y - hh / 2 - 1, w + 2, hh + 2, "#0b0c10");
      fr(c, x - w / 2, y - hh / 2, w, hh, "#8d8f99");
      fr(c, x - w / 2 + 1, y - hh / 2 + 1, w - 2, Math.max(1, hh * 0.18), "#6e7079");
      fr(c, x - w * 0.3, y, w * 0.6, hh * 0.35, "#ffd23f");
    } else {
      c.fillStyle = "#f6f4ee"; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      if (r > 3) fr(c, x - r * 0.5, y - 1, r, 1, "#ff4b3e");
    }
  }

  function drawHUD(c) {
    fr(c, 0, 0, W, 40, "rgba(13,15,21,.88)");
    fr(c, 0, 40, W, 2, "#2c3040");
    Shell.text(c, "TOTAL", 10, 7, 8, "#8e93a2");
    Shell.text(c, S.total + " FT", 10, 21, 12, "#ffd23f");
    Shell.text(c, "PITCHES", W - 10, 7, 8, "#8e93a2", "right");
    Shell.text(c, String(Math.max(0, S.left)), W - 10, 21, 12, "#3ff0ff", "right");
    if (S.streak > 0) Shell.uiText(c, "STREAK " + S.streak + (S.streak % 3 === 2 ? "  ONE MORE FOR +500" : ""), W / 2, 26, 9, "#ff3fa4", "center");
  }

  /* ---------------- Drawing: flight view ---------------- */
  function drawFlight(c, t) {
    var h = S.hit, u = h.u, i;
    var travel = h.target === "scoreboard" ? Math.min(h.d, 462) : h.d;
    var bx = travel * u, by = 4 * h.peak * u * (1 - u);
    if (h.target === "scoreboard" && u > 0.85) by = Math.max(by, 40);
    var camX = clamp(bx * FT - W * 0.55, 0, 560 * FT - W);
    var sx = function (ft) { return ft * FT - camX; };
    var sy = function (ft) { return GROUND_Y - ft * FT * 0.75; };
    // sky
    var g = c.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, "#070a14"); g.addColorStop(1, "#1f2846");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (i = 0; i < stars.length; i++) fr(c, (stars[i][0] - camX * 0.2 + W * 4) % W, stars[i][1] + 50, stars[i][2], stars[i][2], "#5a6285");
    // far skyline
    for (i = 0; i < 18; i++) {
      var bxs = ((i * 61 - camX * 0.35) % (W + 80) + W + 80) % (W + 80) - 40;
      var bh = 40 + (i * 37) % 70;
      fr(c, bxs, GROUND_Y - 120 - bh, 34, bh + 120, "#121828");
      for (var w = 0; w < 4; w++) fr(c, bxs + 6 + (w % 2) * 14, GROUND_Y - 110 - bh + ((w / 2) | 0) * 14, 4, 4, (i + w) % 3 ? "#2a3150" : "#ffd23f");
    }
    // grass, warning track, wall
    var fx = sx(h.fence);
    fr(c, 0, GROUND_Y, W, H - GROUND_Y, "#1c5e33");
    for (var m = 0; m < 600; m += 30) fr(c, sx(m), GROUND_Y, 15 * FT, H - GROUND_Y, "#206a3a");
    fr(c, sx(h.fence - 15), GROUND_Y, 15 * FT, H - GROUND_Y, "#7a5434");
    for (m = 100; m < h.fence - 10; m += 50) Shell.text(c, String(m), sx(m), GROUND_Y + 14, 8, "rgba(236,234,226,.6)", "center");
    // bleachers rising behind the wall
    var bEnd = h.fence + 85;
    poly(c, [fx, GROUND_Y - 12 * FT, sx(bEnd), sy(70), sx(bEnd), GROUND_Y, fx, GROUND_Y], "#1a1d2b");
    for (var r = 0; r < 8; r++) {
      var ft = h.fence + 6 + r * 10;
      fr(c, sx(ft), sy(10 + r * 7.5) - 2, 10 * FT, 2, "#2c3040");
      for (var k = 0; k < 3; k++) fr(c, sx(ft) + 1 + k * 4, sy(10 + r * 7.5) - 6, 3, 4, ["#ff4b3e", "#3ff0ff", "#ffd23f", "#ff3fa4", "#9bff3f"][(r + k) % 5]);
    }
    fr(c, fx - 2, GROUND_Y - 12 * FT, 4, 12 * FT, "#1d5a3a");
    fr(c, fx - 2, GROUND_Y - 12 * FT, 4, 2, "#ffd23f");
    Shell.text(c, String(Math.round(h.fence)), fx, GROUND_Y - 12 * FT - 12, 8, "#ffd23f", "center");
    // scoreboard (center field only) and the shelf billboard (when it is in that direction)
    if (Math.abs(h.theta) < 9) {
      var sbx = sx(470);
      fr(c, sbx - 2, sy(95), 30, sy(0) - sy(95), "#0b0c10");
      fr(c, sbx + 2, sy(92), 22, sy(62) - sy(92), "#14301e");
      Shell.uiText(c, "HR", sbx + 13, sy(86), 8, "#9bff3f", "center");
    }
    if (h.target === "billboard" || Math.abs(h.theta - billboardAngle(S.t)) < 7) {
      var bbx = sx(h.fence + 40);
      fr(c, bbx + 20, sy(60), 2, sy(30) - sy(60), "#2c3040");
      c.font = '8px "Silkscreen", monospace';
      var bw = Math.ceil(c.measureText("IS IT ON THE SHELF?").width) + 10;
      fr(c, bbx + 21 - bw / 2 - 2, sy(78), bw + 4, 22, "#0b0c10");
      fr(c, bbx + 21 - bw / 2, sy(78) + 2, bw, 18, "#ff3fa4");
      Shell.uiText(c, "IS IT ON THE SHELF?", bbx + 21, sy(78) + 6, 8, "#101219", "center");
    }
    // trail + ball
    c.fillStyle = "rgba(236,234,226,.25)";
    for (var tu = 0; tu < u; tu += 0.04) {
      var tx = travel * tu, ty = 4 * h.peak * tu * (1 - tu);
      fr(c, sx(tx) - 1, sy(ty) - 1, 2, 2, "rgba(236,234,226,.3)");
    }
    drawBall(c, sx(bx), sy(by), 4, h.perfect);
    // live distance
    fr(c, 0, 0, W, 40, "rgba(13,15,21,.88)");
    Shell.text(c, Math.round(bx) + " FT", W / 2, 12, 16, h.hr && bx >= h.fence ? "#ffd23f" : "#eceae2", "center");
    Shell.uiText(c, (h.foul ? "FOUL TERRITORY" : zone(h.theta).toUpperCase()) + "   " + h.label, W / 2, 46, 10, "#8e93a2", "center");
  }

  function draw(c, state) {
    var t = state === "playing" ? S.t : idleT;
    if (S.phase === "flight" && S.hit) {
      drawFlight(c, t);
    } else {
      drawSky(c, t);
      drawScoreboard(c);
      drawStands(c, t);
      drawBillboard(c, t);
      drawField(c);
      drawPitcher(c);
      drawPitch(c);
      drawBatter(c);
      drawContactBall(c);
      drawHUD(c);
    }
    for (var i = 0; i < parts.length; i++) fr(c, parts[i].x, parts[i].y, 3, 3, parts[i].c);
  }

  // Hook for automated checks (no effect on play)
  window.__bleacher = { S: function () { return S; }, swing: swing, fence: fence };

  Shell.init({
    slug: "bleacher-carts",
    title: "BLEACHER CARTS",
    accent: "#ffd23f",
    width: W, height: H,
    format: function (n) { return n + " FT"; },
    howTo: "20 pitches. Tap anywhere to swing. Early pulls it, late goes the other way, right on time sends it. Only home runs count.",
    keys: "Keys: Space swings. Left and right shift your stance before the pitch. P pause, M mute, R restart.",
    tip: "Hit the scoreboard, the shelf sign, or clear the bleachers for a bonus pitch.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { keys = {}; S.drag = null; }
  });
})();
