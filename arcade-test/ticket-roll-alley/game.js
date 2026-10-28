/* TICKET ROLL ALLEY: nine balls, one ramp, and the 100-point cup in the corner. */
(function () {
  "use strict";
  var W = 360, H = 540, TAU = Math.PI * 2;
  var BALLS = 9, HUMP = 100, LANE = 10, BALL_R = 1.6, A = 300;
  var BW = 10, BOARD_TOP = 44, GAP = 6;
  var C = { u: 0, w: 13 }, RINGS = [3.5, 7, 10.5];             // 40 / 30 / 20, anything else on the board is 10
  var CUPS = [{ u: 0, w: 27, r: 2.6, pts: 50 }, { u: -7.6, w: 37, r: 2.2, pts: 100 }, { u: 7.6, w: 37, r: 2.2, pts: 100 }];
  var LIP = 1.4, WARMUP_GAMES = 3;
  var PRIZES = [
    ["Rubber band for a cart box", 10],
    ["Cracked jewel case", 25],
    ["1 loose disc, no case", 40],
    ["Strategy guide, missing the map", 150],
    ["Controller with a sticky A button", 300],
    ["Mystery box lot", 900],
    ["Complete in box copy", 5000],
    ["Sealed copy", 999999]
  ];

  var S = {}, keys = {}, idleT = 0, parts = [];
  var gamesPlayed = 0;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }

  function reset() {
    gamesPlayed = num(Shell.load("games"), 0);
    S = { t: 0, phase: "aim", pt: 0, ball: 0, score: 0, tickets: 0, shown: 0, spoolT: 0,
          aim: 0, power: 0, charging: false, chargeT: 0, drag: null, kb: false,
          b: null, log: [], bumperOn: gamesPlayed >= WARMUP_GAMES, hundreds: 0, msg: null, counted: false };
    parts.length = 0;
  }

  function bumperActive() { return S.bumperOn && S.ball >= 3; }
  function bumperU(t) { return Math.sin(t * (S.ball >= 6 ? 2.4 : 1.6)) * 7.5; }
  var BUMP_W = 24, BUMP_HALF = 2.4;

  /* ---------------- Rolling ---------------- */
  function canRoll() { return S.phase === "aim" && S.pt > 0.15; }

  function roll(p, ang) {
    if (!canRoll() || p < 0.04) return;
    var vy = Math.sqrt(2 * A * HUMP * (clamp(p, 0, 1.1) / 0.25));
    S.b = { x: 0, y: 0, vy: vy, vx: vy * Math.tan(clamp(ang, -0.13, 0.13)), bounces: 0, spin: 0 };
    S.phase = "lane"; S.pt = 0;
    S.drag = null; S.charging = false;
    Shell.sfx("whoosh");
  }

  // Where the ball lands on the board once it leaves the hump.
  function landing(b) {
    var vh = b.vy;
    var w = vh * vh / (2 * A * HUMP) * 16 - 2;   // energy left after the hump sets how high it flies
    var ratio = clamp(b.vx / Math.max(vh, 60), -0.4, 0.4);
    var u = b.x + ratio * (GAP + Math.max(0, w) * 0.5);
    var note = "";
    if (Math.abs(u) > BW - BALL_R) { var e = BW - BALL_R; u = Math.sign(u) * (e - (Math.abs(u) - e)); u = clamp(u, -e, e); }
    if (w > BOARD_TOP) { w = BOARD_TOP - (w - BOARD_TOP) * 1.5 - 2; note = "net"; }
    w = Math.max(0.5, w);
    return { u: u, w: w, note: note };
  }

  function hash(a, b) { var s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); }

  // Score a landing spot. Returns { pts, u, w (where it settles), lip: "in" | "out" | "", rattle }
  function settle(u, w) {
    var i, c, d;
    for (i = 0; i < CUPS.length; i++) {
      c = CUPS[i]; d = Math.hypot(u - c.u, w - c.w);
      if (d < c.r) return { pts: c.pts, u: c.u, w: c.w, lip: "" };
      if (d < c.r + LIP) {
        if (hash(u, w) < 0.42) return { pts: c.pts, u: c.u, w: c.w, lip: "in", cup: c };
        var r = ring(u, w - 6);
        return { pts: r.pts, u: r.u, w: r.w, lip: "out", cup: c };
      }
    }
    return ring(u, w);
  }
  function ring(u, w) {
    var d = Math.hypot(u - C.u, w - C.w), k;
    for (k = 0; k < RINGS.length; k++) {
      if (d < RINGS[k]) {
        if (RINGS[k] - d < 0.8 && hash(w, u) < 0.5) continue; // rattles out to the next ring
        var mid = k === 0 ? 0 : (RINGS[k - 1] + RINGS[k]) / 2, dd = d || 1;
        return { pts: 40 - k * 10, u: C.u + (u - C.u) / dd * mid, w: C.w + (w - C.w) / dd * mid, lip: "" };
      }
    }
    return { pts: 10, u: clamp(u * 0.4, -6, 6), w: 0.8, lip: "" };
  }

  /* ---------------- Update ---------------- */
  function update(dt) {
    S.t += dt; S.pt += dt;
    var i;
    for (i = parts.length - 1; i >= 0; i--) {
      var q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 220 * dt;
      if (q.life <= 0) parts.splice(i, 1);
    }
    // ticket spool: one ticket at a time
    if (S.shown < S.tickets) {
      S.spoolT -= dt;
      if (S.spoolT <= 0) { S.shown++; S.spoolT = 0.045; Shell.tone(1500 + (S.shown % 2) * 300, 0.025, "square", 0.12); }
    }

    if (S.phase === "aim") {
      var turn = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
      if (turn) { S.aim = clamp(S.aim + turn * 0.09 * dt, -0.13, 0.13); S.kb = true; }
      if (S.charging) {
        S.chargeT += dt;
        var ph = (S.chargeT / 1.2) % 2;
        S.power = ph < 1 ? ph : 2 - ph;
      }
      return;
    }
    var b = S.b;
    if (S.phase === "lane") {
      var n = 4, sdt = dt / n;
      for (i = 0; i < n; i++) {
        b.vy -= A * sdt;
        b.y += b.vy * sdt; b.x += b.vx * sdt;
        b.spin += b.vy * sdt;
        var e = LANE - BALL_R;
        if (Math.abs(b.x) > e) { b.x = Math.sign(b.x) * e; b.vx = -b.vx * 0.7; b.vy *= 0.93; b.bounces++; Shell.sfx("click"); }
        if (b.y >= HUMP) { launch(); return; }
        if (b.vy <= 0 && b.y < HUMP) { S.phase = "back"; S.pt = 0; Shell.flash("SHORT", "Didn't clear the hump. 0 points.", "#8e93a2", 1000); Shell.sfx("miss"); return; }
      }
      if (S.pt % 0.08 < dt) Shell.noise(0.08, 0.1, 160, 0.7, 0, 0, "lowpass", 0.02);
      return;
    }
    if (S.phase === "back") {
      b.vy -= A * dt; b.y += b.vy * dt;
      if (b.y <= 0) { b.y = 0; score({ pts: 0, u: 0, w: 0, lip: "" }, true); }
      return;
    }
    if (S.phase === "fly") {
      var k = S.pt / S.flyT;
      // the sliding bumper can knock the ball down on its way past
      if (S.bumpCheck && k >= S.bumpK) {
        S.bumpCheck = false;
        var bu = bumperU(S.t);
        if (Math.abs(S.bumpAtU - bu) < BUMP_HALF + BALL_R) {
          S.land = { u: S.bumpAtU, w: 3 + hash(S.t, bu) * 4, note: "bump" };
          S.fromK = { u: S.bumpAtU, w: BUMP_W };
          S.pt = 0; S.flyT = 0.25;
          Shell.sfx("hit"); Shell.shake(2, 0.15);
          S.bumped = true;
          return;
        }
      }
      if (k >= 1) {
        S.res = settle(S.land.u, S.land.w);
        S.phase = "settle"; S.pt = 0;
        Shell.sfx(S.res.lip ? "rim" : "cup");
      }
      return;
    }
    if (S.phase === "settle") {
      var dur = S.res.lip ? 0.75 : 0.4;
      if (S.pt >= dur) score(S.res, false);
      return;
    }
    if (S.phase === "post") {
      if (S.pt > 0.55 && !S.advanced) {
        S.advanced = true;
        S.ball++;
        S.b = null;
        if (S.ball < BALLS) {
          S.phase = "aim"; S.pt = 0;
          if (S.ball === 3 && bumperActive()) Shell.flash("BUMPER ON", "It slides across the rings now. Time it.", "#ff3fa4", 1300);
          return;
        }
      }
      if (S.advanced && S.ball >= BALLS && (S.shown >= S.tickets || S.pt > 3)) finish();
    }
  }

  function launch() {
    var b = S.b;
    S.land = landing(b);
    S.hump = { x: b.x };
    S.fromK = null;
    S.bumped = false;
    S.flyT = 0.42 + S.land.w * 0.004;
    S.phase = "fly"; S.pt = 0;
    S.bumpCheck = false;
    if (bumperActive() && S.land.w > BUMP_W && S.land.note !== "net") {
      S.bumpCheck = true;
      S.bumpK = (BUMP_W + 4) / (S.land.w + 4);
      S.bumpAtU = b.x + (S.land.u - b.x) * S.bumpK;
    }
    Shell.tone(260, 0.1, "triangle", 0.25, 520);
  }

  function score(r, short) {
    var pts = r.pts;
    S.score += pts;
    S.log.push(pts);
    S.tickets += Math.floor(pts / 10);
    if (pts === 0) S.zeros = (S.zeros || 0) + 1;
    S.hot = pts >= 50 ? (S.hot || 0) + 1 : 0;
    if (window.NPRewards && S.hot >= 2 && !short) NPRewards.streak(S.hot, S.hot === 2 ? "2 BIG ROLLS!" : "");
    if (pts === 100) {
      if (r.u < 0) S.cupL = (S.cupL || 0) + 1; else S.cupR = (S.cupR || 0) + 1;
      if (window.Trophies) { Trophies.unlock("tra-cup"); if (r.lip === "in") Trophies.unlock("tra-rattle"); }
    }
    var col = pts >= 100 ? "#ffd23f" : pts >= 50 ? "#ff3fa4" : pts >= 30 ? "#3ff0ff" : "#eceae2";
    if (!short) {
      var title = "+" + pts, sub = "";
      if (r.lip === "out") { title = "LIPPED OUT"; sub = "Rolled down for " + pts + "."; col = "#ff3fa4"; Shell.sfx("miss"); }
      else if (r.lip === "in") { title = "RATTLED IN! +" + pts; sub = "Took the long way."; }
      else if (S.bumped) { title = "BUMPED! +" + pts; sub = "Knocked off line."; col = "#a77bff"; }
      else if (S.land && S.land.note === "net") { sub = "Off the back net."; }
      if (pts === 100 && r.lip !== "out") { title = "100!"; sub = r.lip === "in" ? "Rattled in. It counts." : "Corner cup. Spool those tickets."; S.hundreds++; burst(60); Shell.sfx("best"); Shell.shake(3, 0.25); }
      else if (pts === 50 && r.lip !== "out") { title = r.lip === "in" ? "RATTLED IN! 50" : "50!"; burst(25); Shell.sfx("score"); }
      else if (r.lip !== "out") Shell.sfx("score");
      Shell.flash(title, sub, col, 850);
    }
    S.phase = "post"; S.pt = 0; S.advanced = false;
  }

  function finish() {
    if (S.counted) return;
    S.counted = true;
    var jar = num(Shell.load("jar"), 0) + S.tickets;
    Shell.save("jar", jar);
    Shell.save("games", gamesPlayed + 1);
    var html = row("Tickets this game", S.tickets) + row("Ticket jar (all games)", jar.toLocaleString("en-US")) + row("Corner cups", S.hundreds);
    // prize counter: the best thing the jar covers, the next one up, and the dream
    var got = null, nxt = null, i;
    for (i = 0; i < PRIZES.length; i++) { if (jar >= PRIZES[i][1]) got = PRIZES[i]; else if (!nxt) nxt = PRIZES[i]; }
    html += '<p class="np-kicker" style="margin:12px 0 6px">Prize counter</p>';
    html += row("In reach", got ? got[0] + " (" + got[1] + ")" : "Nothing yet");
    if (nxt && nxt !== PRIZES[PRIZES.length - 1]) html += row("Next up", nxt[0] + " (" + (nxt[1] - jar).toLocaleString("en-US") + " more)");
    html += row("The dream", PRIZES[PRIZES.length - 1][0] + " (999,999)");
    Shell.gameOver(S.score, { title: "OUT OF BALLS", html: html,
      stats: { score: S.score, balls: S.log.length, hundreds: S.hundreds, cupL: S.cupL || 0, cupR: S.cupR || 0, zeroBalls: S.zeros || 0, tickets: S.tickets, jar: jar } });
  }
  function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

  function burst(n) {
    var cols = ["#ffd23f", "#3ff0ff", "#ff3fa4", "#9bff3f"];
    if (Shell.reduced) n = Math.ceil(n / 3);
    var p = boardProj(S.land ? S.land.u : 0, S.land ? S.land.w : 20);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = 50 + Math.random() * 150;
      parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 90, life: 1, c: cols[i % 4] });
    }
  }

  /* ---------------- Input ---------------- */
  function pointer(type, x, y) {
    if (type === "down") {
      if (!canRoll()) return;
      S.drag = { sx: x, sy: y, x: x, y: y };
      S.kb = false; S.charging = false;
    } else if (type === "move" && S.drag) {
      S.drag.x = x; S.drag.y = y;
    } else if ((type === "up" || type === "cancel") && S.drag) {
      var d = S.drag; S.drag = null;
      if (type === "cancel") return;
      var f = flick(d);
      if (f) roll(f.p, f.a);
    }
  }
  function flick(d) {
    var dy = d.sy - d.y, dx = d.x - d.sx;
    if (dy < 14) return null;
    return { p: clamp(dy / 230, 0, 1.1), a: clamp(Math.atan2(dx, dy) * 0.25, -0.13, 0.13) };
  }
  function key(type, code, e) {
    var act = code === "Space" || code === "Enter" || code === "NumpadEnter";
    if (type === "down") {
      keys[code] = true;
      if (act && !e.repeat && canRoll() && !S.charging) { S.charging = true; S.chargeT = 0; S.power = 0; S.kb = true; S.drag = null; }
    } else {
      keys[code] = false;
      if (act && S.charging) { S.charging = false; roll(S.power, S.aim); S.power = 0; }
    }
  }

  /* ---------------- Drawing ---------------- */
  var LANE_BOTTOM = 486, HUMP_Y = 282, BOARD_Y = 272;
  function laneProj(x, y) {
    var d = 1 + y * 0.0083, dH = 1 + HUMP * 0.0083;
    var s = 15 / d;
    var k = (1 - 1 / d) / (1 - 1 / dH);
    return { x: W / 2 + x * s, y: LANE_BOTTOM - k * (LANE_BOTTOM - HUMP_Y), s: s };
  }
  function boardProj(u, w) {
    var s = 8.2 / (1 + w * 0.008);
    return { x: W / 2 + u * s, y: BOARD_Y - w * 4.3 / (1 + w * 0.004), s: s };
  }
  function fr(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function poly(c, pts, col, stroke, lw) {
    c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.closePath();
    if (col) { c.fillStyle = col; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
  }
  function circlePts(u, w, r) {
    var pts = [];
    for (var i = 0; i < 28; i++) { var a = i / 28 * TAU; pts.push(boardProj(u + Math.cos(a) * r, w + Math.sin(a) * r)); }
    return pts;
  }

  function drawCabinet(c, t) {
    fr(c, 0, 0, W, H, "#0d0f15");
    // cage sides
    var tl = boardProj(-BW - 1.2, BOARD_TOP + 4), tr = boardProj(BW + 1.2, BOARD_TOP + 4);
    var bl = laneProj(-LANE - 1.5, -6), br = laneProj(LANE + 1.5, -6);
    poly(c, [tl, tr, br, bl], "#161927");
    // marquee
    fr(c, 52, 62, 256, 24, "#1d2029");
    fr(c, 52, 84, 256, 2, "#3ff0ff");
    Shell.text(c, "TICKET ROLL ALLEY", W / 2, 69, 10, "#3ff0ff", "center", "#3ff0ff");
    for (var i = 0; i < 16; i++) {
      var lit = !Shell.reduced && ((i + Math.floor(t * 5)) % 4 === 0);
      fr(c, 56 + i * 16, 88, 5, 3, lit ? "#ffd23f" : "#4a3f1a");
    }
  }

  function drawBoard(c, t) {
    // backboard
    poly(c, [boardProj(-BW, 0), boardProj(BW, 0), boardProj(BW, BOARD_TOP), boardProj(-BW, BOARD_TOP)], "#17233a", "#2c3040", 2);
    // back net
    var nt = boardProj(-BW, BOARD_TOP), nr = boardProj(BW, BOARD_TOP);
    c.strokeStyle = "rgba(142,147,162,.35)"; c.lineWidth = 1;
    for (var k = 0; k < 7; k++) { c.beginPath(); c.moveTo(nt.x + k * (nr.x - nt.x) / 6, nt.y); c.lineTo(nt.x + k * (nr.x - nt.x) / 6, nt.y - 12); c.stroke(); }
    c.beginPath(); c.moveTo(nt.x, nt.y - 6); c.lineTo(nr.x, nr.y - 6); c.stroke();
    // 10 trough along the bottom
    poly(c, [boardProj(-6.5, 0), boardProj(6.5, 0), boardProj(6.5, 1.8), boardProj(-6.5, 1.8)], "#050608");
    // rings, outer to inner
    var ringCols = ["#2a4d7a", "#2f6a73", "#5a3f8a"];
    for (var r = RINGS.length - 1; r >= 0; r--) {
      poly(c, circlePts(C.u, C.w, RINGS[r] + 0.6), "#c9c4b4");
      poly(c, circlePts(C.u, C.w, RINGS[r]), r === 0 ? "#050608" : ringCols[r]);
    }
    poly(c, circlePts(C.u, C.w, 2.2), "#050608");
    // ring numbers
    var lab = [[40, C.w + 0.4], [30, C.w - 5.25], [20, C.w - 8.75], [10, 0.9]];
    for (var j = 0; j < lab.length; j++) {
      var lp = boardProj(0, lab[j][1]);
      Shell.text(c, String(lab[j][0]), lp.x, lp.y - 4, 7, "#eceae2", "center");
    }
    // cups
    for (var q = 0; q < CUPS.length; q++) {
      var cp = CUPS[q];
      poly(c, circlePts(cp.u, cp.w, cp.r + 0.7), cp.pts === 100 ? "#ffd23f" : "#ff3fa4");
      poly(c, circlePts(cp.u, cp.w, cp.r), "#050608");
      var tp = boardProj(cp.u, cp.w + cp.r + 2.6);
      Shell.text(c, String(cp.pts), tp.x, tp.y - 4, 7, cp.pts === 100 ? "#ffd23f" : "#ff3fa4", "center");
    }
    // sliding bumper
    if (bumperActive()) {
      var bu = bumperU(t), a = boardProj(bu - BUMP_HALF, BUMP_W + 1), b = boardProj(bu + BUMP_HALF, BUMP_W - 1);
      fr(c, a.x, a.y, b.x - a.x, b.y - a.y, "#0b0c10");
      fr(c, a.x + 1, a.y + 1, b.x - a.x - 2, b.y - a.y - 2, "#ff3fa4");
    }
  }

  function drawLane(c) {
    // ramp
    poly(c, [laneProj(-LANE, 0), laneProj(LANE, 0), laneProj(LANE, HUMP), laneProj(-LANE, HUMP)], "#26414a");
    for (var y = 10; y < HUMP; y += 10) {
      var a = laneProj(-LANE, y), b = laneProj(LANE, y);
      c.strokeStyle = "rgba(14,30,36,.6)"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
    // hump
    poly(c, [laneProj(-LANE, HUMP - 4), laneProj(LANE, HUMP - 4), laneProj(LANE, HUMP), laneProj(-LANE, HUMP)], "#4f8a8a");
    poly(c, [laneProj(-LANE, HUMP - 1.2), laneProj(LANE, HUMP - 1.2), laneProj(LANE, HUMP), laneProj(-LANE, HUMP)], "#9fe7e0");
    // rails
    poly(c, [laneProj(-LANE - 1.5, -6), laneProj(-LANE, -6), laneProj(-LANE, HUMP), laneProj(-LANE - 1.5, HUMP)], "#3ff0ff");
    poly(c, [laneProj(LANE, -6), laneProj(LANE + 1.5, -6), laneProj(LANE + 1.5, HUMP), laneProj(LANE, HUMP)], "#3ff0ff");
    // launch mat
    poly(c, [laneProj(-LANE, -6), laneProj(LANE, -6), laneProj(LANE, 0), laneProj(-LANE, 0)], "#1d2029");
  }

  function drawBall(c, x, y, r, spin) {
    c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(x + r * 0.2, y + r * 0.8, r, r * 0.35, 0, 0, TAU); c.fill();
    c.fillStyle = "#c9762b"; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.fillStyle = "#e89a4a"; c.beginPath(); c.arc(x - r * 0.2, y - r * 0.2, r * 0.7, 0, TAU); c.fill();
    c.fillStyle = "#ffe0b0"; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.4, r * 0.22, 0, TAU); c.fill();
    if (r > 6) { c.strokeStyle = "rgba(90,40,10,.5)"; c.lineWidth = 1; c.beginPath(); c.arc(x, y, r * 0.75, spin, spin + 1.6); c.stroke(); }
  }

  function ballScreen() {
    var b = S.b, p, r;
    if (!b) { p = laneProj(0, 0); return { x: p.x, y: p.y - BALL_R * p.s, r: BALL_R * p.s, spin: 0 }; }
    if (S.phase === "lane" || S.phase === "back") {
      p = laneProj(b.x, b.y); return { x: p.x, y: p.y - BALL_R * p.s, r: BALL_R * p.s, spin: b.spin * 0.3 };
    }
    var from = S.fromK ? boardProj(S.fromK.u, S.fromK.w) : laneProj(S.hump.x, HUMP);
    var fromR = S.fromK ? BALL_R * from.s : BALL_R * laneProj(0, HUMP).s;
    if (S.phase === "fly") {
      var k = clamp(S.pt / S.flyT, 0, 1), to = boardProj(S.land.u, S.land.w);
      var arc = Math.sin(k * Math.PI) * (S.fromK ? 6 : 18 + S.land.w * 0.5);
      return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k - arc - BALL_R * to.s, r: fromR + (BALL_R * to.s - fromR) * k, spin: k * 8 };
    }
    if (S.phase === "settle") {
      var res = S.res, land = boardProj(S.land.u, S.land.w), dur = res.lip ? 0.75 : 0.4, kk = clamp(S.pt / dur, 0, 1);
      var x = land.x, y = land.y, rr = BALL_R * land.s;
      if (res.lip) {
        var cp = boardProj(res.cup.u, res.cup.w), lk = clamp(kk / 0.55, 0, 1);
        var ang = lk * TAU * 1.3, rad = res.cup.r * cp.s * 0.9;
        x = cp.x + Math.cos(ang) * rad; y = cp.y + Math.sin(ang) * rad * 0.7;
        if (kk > 0.55) {
          var end = boardProj(res.u, res.w), m = (kk - 0.55) / 0.45;
          if (res.lip === "in") { x = cp.x; y = cp.y; rr *= 1 - m; }
          else { x = x + (end.x - x) * m; y = y + (end.y - y) * m; if (m > 0.8) rr *= (1 - m) * 5; }
        }
      } else {
        var e = boardProj(res.u, res.w);
        x = land.x + (e.x - land.x) * kk; y = land.y + (e.y - land.y) * kk;
        if (kk > 0.6) rr *= 1 - (kk - 0.6) / 0.4;
      }
      return { x: x, y: y - rr, r: Math.max(0, rr), spin: kk * 6 };
    }
    return null;
  }

  function drawAim(c) {
    var f = S.drag ? flick(S.drag) : null;
    var a = f ? f.a : S.aim, pw = f ? f.p : (S.charging ? S.power : -1);
    var x = 0, y = 0, vx = Math.tan(a), e = LANE - BALL_R;
    for (var i = 0; i < 18; i++) {
      y += 5; x += vx * 5;
      if (Math.abs(x) > e) { x = Math.sign(x) * e; vx = -vx; }
      var p = laneProj(x, y);
      fr(c, p.x - 1.5, p.y - 1, 3, 2, i === 17 ? "#ffd23f" : "rgba(236,234,226,.8)");
    }
    if (pw >= 0) {
      var mx = 18, top = 300, hgt = 150, pc = clamp(pw, 0, 1.1) / 1.1;
      fr(c, mx - 2, top - 2, 16, hgt + 4, "#0b0c10");
      fr(c, mx, top, 12, hgt, "#23252e");
      var hump = 0.25 / 1.1;
      fr(c, mx - 4, top + hgt * (1 - hump), 20, 2, "#8e93a2");
      fr(c, mx, top + hgt * (1 - pc), 12, hgt * pc, pc < hump ? "#8e93a2" : "#3ff0ff");
      Shell.text(c, "PWR", mx + 6, top + hgt + 6, 8, "#8e93a2", "center");
    }
  }

  function drawHUD(c) {
    fr(c, 0, 0, W, 56, "rgba(13,15,21,.94)");
    fr(c, 0, 56, W, 2, "#2c3040");
    Shell.text(c, "SCORE", 10, 8, 8, "#8e93a2");
    Shell.text(c, String(S.score), 10, 22, 16, "#ffd23f");
    Shell.text(c, "BALL", W / 2, 8, 8, "#8e93a2", "center");
    Shell.text(c, Math.min(BALLS, S.ball + 1) + "/" + BALLS, W / 2, 22, 12, "#eceae2", "center");
    Shell.text(c, "TICKETS", W - 10, 8, 8, "#8e93a2", "right");
    var led = ("0000" + S.shown).slice(-4);
    fr(c, W - 76, 20, 66, 24, "#140606");
    Shell.text(c, led, W - 14, 25, 12, "#ff4b3e", "right");
    var note = !S.bumperOn ? "WARMUP GAME " + Math.min(WARMUP_GAMES, gamesPlayed + 1) + "/" + WARMUP_GAMES : bumperActive() ? "BUMPER ACTIVE" : "BUMPER FROM BALL 4";
    Shell.uiText(c, note, W / 2, 42, 9, bumperActive() ? "#ff3fa4" : "#8e93a2", "center");
  }

  function drawTray(c) {
    // balls left in the return tray
    fr(c, 60, 500, 240, 26, "#1d2029");
    fr(c, 60, 500, 240, 2, "#2c3040");
    var left = BALLS - S.ball - (S.b ? 1 : 0);
    for (var i = 0; i < left; i++) drawBall(c, 76 + i * 23, 513, 8, 0);
    // ticket spool
    fr(c, 306, 492, 46, 40, "#1d2029");
    fr(c, 314, 498, 30, 3, "#050608");
    var n = Math.min(20, S.shown);
    for (var k = 0; k < n; k++) {
      var ty = 501 + k * 4, tx = 316 + Math.sin(k * 0.9) * 2;
      if (ty > H - 2) break;
      fr(c, tx, ty, 26, 3, k % 2 ? "#ff9a3e" : "#ffb85e");
    }
  }

  function draw(c, state) {
    var t = (state === "title" || state === "over") ? idleT : S.t;
    drawCabinet(c, t);
    drawBoard(c, t);
    drawLane(c);
    var bs = (state === "title" || S.phase !== "post") ? ballScreen() : null;
    if (bs && bs.r > 0.3) drawBall(c, bs.x, bs.y, bs.r, bs.spin);
    for (var i = 0; i < parts.length; i++) fr(c, parts[i].x, parts[i].y, 3, 3, parts[i].c);
    drawTray(c);
    drawHUD(c);
    if (state === "playing" && S.phase === "aim") drawAim(c);
  }

  // Hook for automated checks (no effect on play)
  window.__ticketRoll = { S: function () { return S; }, roll: roll, landing: landing, settle: settle };

  Shell.init({
    slug: "ticket-roll-alley",
    title: "TICKET ROLL ALLEY",
    accent: "#3ff0ff",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "Nine balls, one ramp, and the 100-point cup in the corner. Flick up to roll: a longer flick rolls harder. Angle the flick to aim.",
    keys: "Keys: left and right aim, hold Space for power, release to roll. P pause, M mute, R restart.",
    tip: "Every 10 points spools a ticket. Tickets pile up in your jar between games.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { keys = {}; S.drag = null; S.charging = false; }
  });
})();
