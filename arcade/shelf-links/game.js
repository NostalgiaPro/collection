/* SHELF LINKS: nine holes of mini golf built from game boxes, shelves and tape decks. */
(function () {
  "use strict";
  var W = 360, H = 540, HUD = 48;
  var R = 5, CUP_R = 9, MAX_STROKES = 6, MAX_PULL = 110;
  var V_MIN = 30, V_MAX = 640, STOP = 4;
  var FR_C = 120, FR_K = 0.9;          // felt friction: constant + proportional
  var SAND_C = 520, SAND_K = 3.2;      // packing peanuts
  var BOOST = 1100, BOUNCE = 0.74;
  var TAU = Math.PI * 2;

  /* ---------------- Course ---------------- */
  function rc(x1, y1, x2, y2) { return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; }
  function frame(x1, y1, x2, y2) {
    var t = 10;
    return [rc(x1 - t, y1 - t, x2 + t, y1), rc(x1 - t, y2, x2 + t, y2 + t), rc(x1 - t, y1, x1, y2), rc(x2, y1, x2 + t, y2)];
  }
  function hole(o) {
    var d = { floor: [], walls: [], boxes: [], carts: [], gates: [], sand: [], water: [], boosts: [], sliders: [], rotors: [] };
    for (var k in o) d[k] = o[k];
    return d;
  }

  var HOLES = [
    hole({ name: "The Bargain Bin", par: 2, tee: [180, 470], cup: [180, 125],
      floor: [rc(120, 80, 240, 510)], walls: frame(120, 80, 240, 510) }),

    hole({ name: "Rewind Alley", par: 3, tee: [100, 440], cup: [262, 128],
      floor: [rc(50, 340, 310, 510), rc(210, 80, 310, 340)],
      walls: [rc(40, 340, 50, 520), rc(40, 510, 320, 520), rc(310, 70, 320, 520), rc(200, 70, 320, 80),
              rc(200, 70, 210, 340), rc(40, 330, 210, 340)] }),

    hole({ name: "Packing Peanut Pit", par: 3, tee: [180, 470], cup: [180, 120],
      floor: [rc(70, 80, 290, 510)], walls: frame(70, 80, 290, 510),
      sand: [rc(100, 270, 260, 330)], boxes: [rc(152, 188, 208, 214)] }),

    hole({ name: "Coin Slot Squeeze", par: 3, tee: [180, 470], cup: [180, 130],
      floor: [rc(100, 80, 260, 510)], walls: frame(100, 80, 260, 510),
      boxes: [rc(100, 290, 152, 312), rc(208, 290, 260, 312)],
      rotors: [{ x: 180, y: 301, len: 30, n: 3, speed: 1.7 }] }),

    hole({ name: "Sealed Copy Canyon", par: 3, tee: [180, 482], cup: [180, 118],
      floor: [rc(70, 80, 290, 510)], walls: frame(70, 80, 290, 510),
      sliders: [{ w: 90, h: 22, y: 360, x1: 70, x2: 200, speed: 1.3, phase: 0 },
                { w: 90, h: 22, y: 222, x1: 70, x2: 200, speed: 1.8, phase: 2.2 }] }),

    hole({ name: "Soda Spill Crossing", par: 3, tee: [180, 470], cup: [262, 128],
      floor: [rc(50, 80, 310, 510)], walls: frame(50, 80, 310, 510),
      water: [rc(50, 262, 92, 328), rc(140, 262, 310, 328)],
      boosts: [{ r: rc(96, 268, 136, 322), dx: 0, dy: -1 }],
      boxes: [rc(196, 172, 236, 200)] }),

    hole({ name: "The Cart Gate", par: 3, tee: [180, 470], cup: [180, 116],
      floor: [rc(60, 80, 300, 510)], walls: frame(60, 80, 300, 510),
      carts: [rc(60, 270, 110, 290), rc(150, 270, 210, 290), rc(250, 270, 300, 290)],
      gates: [{ r: rc(110, 272, 150, 288), dx: 0, dy: -1 }, { r: rc(210, 272, 250, 288), dx: 0, dy: -1 }],
      boxes: [rc(148, 156, 212, 178)],
      boosts: [{ r: rc(112, 330, 148, 384), dx: 0, dy: -1 }] }),

    hole({ name: "Swap Meet Shuffle", par: 4, tee: [80, 462], cup: [272, 124],
      floor: [rc(40, 80, 320, 510)], walls: frame(40, 80, 320, 510).concat([rc(40, 380, 250, 396), rc(110, 230, 320, 246)]),
      sliders: [{ w: 64, h: 20, y: 302, x1: 40, x2: 256, speed: 1.1, phase: 1 }],
      sand: [rc(200, 160, 320, 200)] }),

    hole({ name: "Mint Condition Gauntlet", par: 4, tee: [180, 492], cup: [180, 112],
      floor: [rc(70, 80, 290, 510)], walls: frame(70, 80, 290, 510),
      sliders: [{ w: 76, h: 20, y: 436, x1: 70, x2: 214, speed: 1.5, phase: 0.5 }],
      water: [rc(70, 350, 140, 392), rc(220, 350, 290, 392)],
      boxes: [rc(70, 252, 152, 272), rc(208, 252, 290, 272)],
      rotors: [{ x: 180, y: 262, len: 30, n: 3, speed: -1.9 }],
      carts: [rc(70, 168, 150, 184), rc(210, 168, 290, 184)],
      gates: [{ r: rc(150, 170, 210, 182), dx: 0, dy: -1 }] })
  ];
  var TOTAL_PAR = HOLES.reduce(function (s, h) { return s + h.par; }, 0);

  /* ---------------- Physics ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function inRect(x, y, r, pad) { pad = pad || 0; return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad; }

  function sliderRect(s, t) {
    var u = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
    var x = s.x1 + (s.x2 - s.x1) * u;
    var vx = (s.x2 - s.x1) * 0.5 * Math.cos(t * s.speed + s.phase) * s.speed;
    return { x: x, y: s.y, w: s.w, h: s.h, vx: vx, vy: 0 };
  }
  function rotorAngle(r, t) { return t * r.speed; }

  function hitRect(b, r, vx, vy) {
    var cx = clamp(b.x, r.x, r.x + r.w), cy = clamp(b.y, r.y, r.y + r.h);
    var dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return 0;
    var nx, ny, pen;
    if (d2 < 1e-8) {
      var l = b.x - r.x, rr = r.x + r.w - b.x, tp = b.y - r.y, bt = r.y + r.h - b.y;
      var m = Math.min(l, rr, tp, bt);
      if (m === l) { nx = -1; ny = 0; } else if (m === rr) { nx = 1; ny = 0; } else if (m === tp) { nx = 0; ny = -1; } else { nx = 0; ny = 1; }
      pen = R + m;
    } else {
      var d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = R - d;
    }
    return resolve(b, nx, ny, pen, vx || 0, vy || 0);
  }
  function hitSeg(b, ax, ay, bx, by, th, vfn) {
    var ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
    var u = l2 ? clamp(((b.x - ax) * ex + (b.y - ay) * ey) / l2, 0, 1) : 0;
    var px = ax + ex * u, py = ay + ey * u;
    var dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy, rr = R + th;
    if (d2 >= rr * rr) return 0;
    var d = Math.sqrt(d2) || 1e-4, nx = dx / d, ny = dy / d;
    var v = vfn ? vfn(px, py) : [0, 0];
    return resolve(b, nx, ny, rr - d, v[0], v[1]);
  }
  function hitCircle(b, cx, cy, cr) {
    var dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy, rr = R + cr;
    if (d2 >= rr * rr) return 0;
    var d = Math.sqrt(d2) || 1e-4;
    return resolve(b, dx / d, dy / d, rr - d, 0, 0);
  }
  function resolve(b, nx, ny, pen, vx, vy) {
    b.x += nx * pen; b.y += ny * pen;
    var rvx = b.vx - vx, rvy = b.vy - vy, vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      b.vx -= (1 + BOUNCE) * vn * nx; b.vy -= (1 + BOUNCE) * vn * ny;
      // a moving obstacle can never leave the ball slower than itself along the normal
      var push = vx * nx + vy * ny, now = b.vx * nx + b.vy * ny;
      if (push > 0 && now < push) { b.vx += (push - now) * nx; b.vy += (push - now) * ny; }
      return -vn;
    }
    return 0.001;
  }

  // One physics step. Returns an event string or "" ("water", "sunk").
  function step(h, b, t, dt) {
    var sp = Math.hypot(b.vx, b.vy), i, r;
    var c = FR_C, k = FR_K, ax = 0, ay = 0;
    for (i = 0; i < h.sand.length; i++) if (inRect(b.x, b.y, h.sand[i])) { c = SAND_C; k = SAND_K; b.sanded = true; break; }
    for (i = 0; i < h.boosts.length; i++) {
      var bo = h.boosts[i];
      if (inRect(b.x, b.y, bo.r)) { ax += bo.dx * BOOST; ay += bo.dy * BOOST; c = 40; k = 0.3; b.boosted = true; }
    }
    if (sp > 0) {
      var dec = (c + k * sp) * dt, ns = Math.max(0, sp - dec);
      b.vx *= ns / sp; b.vy *= ns / sp;
    }
    b.vx += ax * dt; b.vy += ay * dt;
    sp = Math.hypot(b.vx, b.vy);
    if (sp > V_MAX * 1.15) { b.vx *= V_MAX * 1.15 / sp; b.vy *= V_MAX * 1.15 / sp; }
    b.x += b.vx * dt; b.y += b.vy * dt;

    var imp = 0;
    var solids = [h.walls, h.boxes, h.carts];
    for (var s = 0; s < solids.length; s++) for (i = 0; i < solids[s].length; i++) imp = Math.max(imp, hitRect(b, solids[s][i]));
    for (i = 0; i < h.sliders.length; i++) {
      r = sliderRect(h.sliders[i], t);
      imp = Math.max(imp, hitRect(b, r, r.vx, 0));
    }
    for (i = 0; i < h.gates.length; i++) {
      var g = h.gates[i];
      if (b.vx * g.dx + b.vy * g.dy < 0) imp = Math.max(imp, hitRect(b, g.r));
    }
    for (i = 0; i < h.rotors.length; i++) {
      var ro = h.rotors[i], a0 = rotorAngle(ro, t);
      imp = Math.max(imp, hitCircle(b, ro.x, ro.y, 6));
      for (var n = 0; n < ro.n; n++) {
        var a = a0 + n * TAU / ro.n;
        imp = Math.max(imp, hitSeg(b, ro.x, ro.y, ro.x + Math.cos(a) * ro.len, ro.y + Math.sin(a) * ro.len, 3,
          function (px, py) { return [-ro.speed * (py - ro.y), ro.speed * (px - ro.x)]; }));
      }
    }
    // walls win over moving pieces: one more pass so nothing pushes the ball through a wall
    for (i = 0; i < h.walls.length; i++) hitRect(b, h.walls[i]);
    if (imp > 0.01) b.impact = Math.max(b.impact || 0, imp);

    for (i = 0; i < h.water.length; i++) {
      if (inRect(b.x, b.y, h.water[i]) && !onBoost(h, b)) return "water";
    }
    var cdx = h.cup[0] - b.x, cdy = h.cup[1] - b.y, cd = Math.hypot(cdx, cdy);
    if (cd < CUP_R) {
      b.vx += cdx / (cd || 1) * 2600 * dt * (1 - cd / CUP_R);
      b.vy += cdy / (cd || 1) * 2600 * dt * (1 - cd / CUP_R);
      if (Math.hypot(b.vx, b.vy) < 300 && cd < CUP_R - 2) return "sunk";
    }
    return "";
  }
  function onBoost(h, b) {
    for (var i = 0; i < h.boosts.length; i++) if (inRect(b.x, b.y, h.boosts[i].r)) return true;
    return false;
  }
  function onCourse(h, b) {
    for (var i = 0; i < h.floor.length; i++) if (inRect(b.x, b.y, h.floor[i], 1)) return true;
    return false;
  }
  // Advance the ball over dt with substeps sized to its speed.
  function advance(h, b, t, dt) {
    var sp = Math.hypot(b.vx, b.vy);
    var n = clamp(Math.ceil(sp * dt / 2), 2, 40), sdt = dt / n, ev = "";
    for (var i = 0; i < n && !ev; i++) ev = step(h, b, t + sdt * i, sdt);
    if (!ev && !onCourse(h, b)) ev = "lost";
    return ev;
  }

  /* ---------------- Game state ---------------- */
  var S = {};
  var keys = {};
  var conf = [];
  var bests = loadBests();

  function loadBests() {
    try { var a = JSON.parse(window.Shell ? Shell.load("holes") || "[]" : "[]"); if (Array.isArray(a)) return a; } catch (e) { /* ignore */ }
    return [];
  }

  var paused = false;
  function reset() {
    paused = false;
    S = { hole: 0, splashes: 0, strokes: 0, card: [], mode: "aim", t: 0, holeT: 0, timer: 0, slide: 0,
          ball: null, last: null, drag: null, aim: 0, power: 0, charging: false, chargeT: 0, kb: false,
          rest: 0, sinkT: 0, msgShown: false };
    conf.length = 0;
    bests = loadBests();
    setupHole(0);
  }
  function setupHole(i) {
    var h = HOLES[i];
    S.hole = i; S.strokes = 0; S.holeT = 0; S.mode = "aim"; S.rest = 1;
    S.ball = { x: h.tee[0], y: h.tee[1], vx: 0, vy: 0, z: 1 };
    S.last = { x: h.tee[0], y: h.tee[1] };
    aimAtCup();
  }
  function aimAtCup() {
    var h = HOLES[S.hole];
    S.aim = Math.atan2(h.cup[1] - S.ball.y, h.cup[0] - S.ball.x);
  }
  function canShoot() { return S.mode === "aim" && S.rest > 0.12; }

  function shoot(angle, power) {
    if (!canShoot() || power < 0.04) return;
    var v = V_MIN + power * (V_MAX - V_MIN);
    S.last = { x: S.ball.x, y: S.ball.y };
    S.ball.vx = Math.cos(angle) * v;
    S.ball.vy = Math.sin(angle) * v;
    S.strokes++;
    S.mode = "roll";
    S.rest = 0;
    Shell.sfx("hit");
  }

  function relLabel(d, strokes) {
    if (strokes === 1) return "ACE!";
    if (d <= -3) return "ALBATROSS!";
    if (d === -2) return "EAGLE!";
    if (d === -1) return "BIRDIE!";
    if (d === 0) return "PAR";
    if (d === 1) return "BOGEY";
    if (d === 2) return "DOUBLE BOGEY";
    return "+" + d;
  }

  function finishHole(sunk) {
    var h = HOLES[S.hole];
    S.card[S.hole] = S.strokes;
    var d = S.strokes - h.par;
    if (bests[S.hole] == null || S.strokes < bests[S.hole]) {
      bests[S.hole] = S.strokes;
      Shell.save("holes", JSON.stringify(bests));
    }
    if (!sunk) {
      Shell.flash("PICKED UP", "Max " + MAX_STROKES + " strokes. On to the next one.", "#8e93a2", 1300);
      Shell.sfx("miss");
    } else if (S.strokes === 1) {
      Shell.flash("ACE!", "Is it on the shelf? It is now.", "#ffd23f", 1800);
      if (window.Trophies) Trophies.unlock("sl-ace");
      Shell.sfx("best"); Shell.sfx("crowd");
      burst(h.cup[0], h.cup[1], Shell.reduced ? 30 : 90);
      Shell.shake(4, 0.35);
    } else {
      var col = d < 0 ? "#9bff3f" : d === 0 ? "#3ff0ff" : "#ff3fa4";
      Shell.flash(relLabel(d, S.strokes), S.strokes + (S.strokes === 1 ? " stroke" : " strokes"), col, 1200);
      if (d < 0) { Shell.sfx("score"); burst(h.cup[0], h.cup[1], Shell.reduced ? 10 : 30); }
    }
    if (window.Trophies && sunk) {
      if (S.hole === 2 && !S.ball.sanded) Trophies.unlock("sl-peanut");
      if (S.hole === 8 && S.strokes <= h.par) Trophies.unlock("sl-gauntlet");
    }
    S.mode = "done";
    S.timer = sunk && S.strokes === 1 ? 1.9 : 1.35;
  }

  function nextHole() {
    if (S.hole >= HOLES.length - 1) {
      var total = 0;
      for (var i = 0; i < S.card.length; i++) total += S.card[i];
      Shell.gameOver(total - TOTAL_PAR, { title: "ROUND OVER", html: scorecard(total),
        stats: { holes: S.card.length, total: total, rel: total - TOTAL_PAR, splashes: S.splashes, card: S.card.slice(), par: HOLES.map(function (x) { return x.par; }) } });
      return;
    }
    S.mode = "slide"; S.slide = 1;
    setupHole(S.hole + 1);
    S.mode = "slide";
    Shell.sfx("whoosh");
  }

  function scorecard(total) {
    var row = function (label, f) {
      var s = "<tr><th>" + label + "</th>";
      for (var i = 0; i < HOLES.length; i++) s += "<td>" + f(i) + "</td>";
      return s + "</tr>";
    };
    var html = '<table aria-label="Scorecard"><tr><th>H</th>';
    for (var i = 0; i < HOLES.length; i++) html += "<th>" + (i + 1) + "</th>";
    html += "</tr>" +
      row("Par", function (i) { return HOLES[i].par; }) +
      row("You", function (i) {
        var s = S.card[i], b = bests[i];
        return s === b ? "<b style='color:#ffd23f'>" + s + "</b>" : s;
      }) +
      row("Best", function (i) { return bests[i] == null ? "-" : bests[i]; }) +
      "</table>";
    html += '<div class="np-row" style="margin-top:10px"><span>Total strokes</span><b>' + total + ' (par ' + TOTAL_PAR + ')</b></div>';
    return html;
  }

  /* ---------------- Update ---------------- */
  function update(dt) {
    S.t += dt;
    S.holeT += dt;
    var h = HOLES[S.hole], b = S.ball;
    updateConfetti(dt);

    if (S.mode === "slide") {
      S.slide -= dt / (Shell.reduced ? 0.15 : 0.45);
      if (S.slide <= 0) { S.slide = 0; S.mode = "aim"; S.rest = 1; aimAtCup(); }
      return;
    }
    if (S.mode === "done") {
      if (b.z > 0) b.z = Math.max(0, b.z - dt * 4);
      S.timer -= dt;
      if (S.timer <= 0) nextHole();
      return;
    }

    // keyboard aim + charge
    if (S.mode === "aim") {
      var turn = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
      var fine = (keys.ArrowUp ? -1 : 0) + (keys.ArrowDown ? 1 : 0);
      if (turn || fine) { S.aim += (turn * 2.2 + fine * 0.45) * dt; S.kb = true; }
      if (S.charging) {
        S.chargeT += dt;
        var ph = (S.chargeT / 1.2) % 2;
        S.power = ph < 1 ? ph : 2 - ph;
      }
    }

    // physics runs even at rest so moving pieces can nudge the ball
    var ev = advance(h, b, S.holeT, dt);
    if (b.impact) {
      if (b.impact > 60) Shell.sfx("click");
      b.impact = 0;
    }
    if (b.boosted) { if (!S.boostSnd) { Shell.sfx("boost"); S.boostSnd = true; } b.boosted = false; }
    else S.boostSnd = false;

    if (ev === "sunk") {
      b.vx = b.vy = 0; b.x = h.cup[0]; b.y = h.cup[1];
      Shell.sfx("cup");
      finishHole(true);
      return;
    }
    if (ev === "water" || ev === "lost") {
      if (ev === "water") {
        S.strokes++;
        S.splashes++;
        Shell.sfx("splash");
        splash(b.x, b.y);
        Shell.flash("SPLASH", "Spilled soda. +1 stroke.", "#ff4b3e", 1000);
      }
      b.x = S.last.x; b.y = S.last.y; b.vx = b.vy = 0;
      if (S.strokes >= MAX_STROKES) { finishHole(false); return; }
      S.mode = "aim"; S.rest = 0;
      return;
    }

    var sp = Math.hypot(b.vx, b.vy);
    if (sp < STOP) {
      b.vx = b.vy = 0;
      S.rest += dt;
      if (S.mode === "roll" && S.rest > 0.12) {
        if (S.strokes >= MAX_STROKES) { finishHole(false); return; }
        S.mode = "aim";
        if (!S.kb) aimAtCup();
      }
    } else {
      S.rest = 0;
    }
  }

  /* ---------------- Particles ---------------- */
  var CONF_COLS = ["#3ff0ff", "#ff3fa4", "#9bff3f", "#ffd23f", "#a77bff", "#ff4b3e"];
  function burst(x, y, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = 60 + Math.random() * 220;
      conf.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 1.2 + Math.random() * 0.8,
        c: CONF_COLS[i % CONF_COLS.length], w: 2 + (i % 3) });
    }
  }
  function splash(x, y) {
    for (var i = 0; i < 16; i++) {
      var a = Math.random() * TAU, s = 40 + Math.random() * 90;
      conf.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, c: "#c98a5a", w: 2 });
    }
  }
  function updateConfetti(dt) {
    for (var i = conf.length - 1; i >= 0; i--) {
      var p = conf[i];
      p.life -= dt; p.vy += 260 * dt; p.vx *= 0.98;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) conf.splice(i, 1);
    }
  }

  /* ---------------- Input ---------------- */
  function pointer(type, x, y) {
    if (type === "down") {
      if (!canShoot()) return;
      S.drag = { sx: x, sy: y, x: x, y: y };
      S.kb = false;
      S.charging = false;
    } else if (type === "move" && S.drag) {
      S.drag.x = x; S.drag.y = y;
    } else if ((type === "up" || type === "cancel") && S.drag) {
      var d = S.drag; S.drag = null;
      if (type === "cancel") return;
      var dx = d.sx - d.x, dy = d.sy - d.y, len = Math.hypot(dx, dy);
      if (len < 6) return;
      shoot(Math.atan2(dy, dx), clamp(len / MAX_PULL, 0, 1));
    }
  }
  function dragShot() {
    if (!S.drag) return null;
    var dx = S.drag.sx - S.drag.x, dy = S.drag.sy - S.drag.y, len = Math.hypot(dx, dy);
    if (len < 6) return null;
    return { a: Math.atan2(dy, dx), p: clamp(len / MAX_PULL, 0, 1) };
  }
  function key(type, code, e) {
    if (type === "down") {
      keys[code] = true;
      if ((code === "Space" || code === "Enter" || code === "NumpadEnter") && !e.repeat && canShoot() && !S.charging) {
        S.charging = true; S.chargeT = 0; S.power = 0; S.kb = true; S.drag = null;
      }
    } else {
      keys[code] = false;
      if ((code === "Space" || code === "Enter" || code === "NumpadEnter") && S.charging) {
        S.charging = false;
        shoot(S.aim, S.power);
        S.power = 0;
      }
    }
  }

  /* ---------------- Drawing ---------------- */
  var BOX_COLS = ["#ff4b3e", "#3ff0ff", "#ff3fa4", "#9bff3f", "#ffd23f", "#a77bff"];
  var carpet = [];
  (function () {
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < 260; i++) carpet.push([rnd() * W, HUD + rnd() * (H - HUD), rnd() < 0.5 ? "#191c27" : "#141720"]);
  })();

  function fr(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }

  function drawWall(c, r) {
    fr(c, r.x, r.y, r.w, r.h, "#3e2614");
    fr(c, r.x + 1, r.y + 1, r.w - 2, r.h - 2, "#6b4426");
    if (r.w >= r.h) { fr(c, r.x + 1, r.y + 1, r.w - 2, 2, "#8a5a33"); for (var x = r.x + 14; x < r.x + r.w - 4; x += 26) fr(c, x, r.y + r.h / 2, 8, 1, "#553419"); }
    else { fr(c, r.x + 1, r.y + 1, 2, r.h - 2, "#8a5a33"); for (var y = r.y + 14; y < r.y + r.h - 4; y += 26) fr(c, r.x + r.w / 2, y, 1, 8, "#553419"); }
  }
  function drawBox(c, r, i) {
    var col = BOX_COLS[i % BOX_COLS.length];
    fr(c, r.x, r.y, r.w, r.h, "#0b0c10");
    fr(c, r.x + 1, r.y + 1, r.w - 2, r.h - 2, col);
    fr(c, r.x + 1, r.y + 1, r.w - 2, 2, "rgba(255,255,255,.35)");
    if (r.w > r.h) {
      fr(c, r.x + 4, r.y + 4, Math.max(6, r.w * 0.28), r.h - 8, "#101219");
      fr(c, r.x + 6, r.y + 6, Math.max(2, r.w * 0.28 - 4), Math.max(2, r.h - 12), "#eceae2");
      fr(c, r.x + r.w * 0.42, r.y + r.h / 2 - 2, r.w * 0.48, 3, "#101219");
    } else {
      fr(c, r.x + 3, r.y + 4, r.w - 6, Math.max(6, r.h * 0.3), "#101219");
      fr(c, r.x + r.w / 2 - 1, r.y + r.h * 0.45, 3, r.h * 0.45, "#101219");
    }
  }
  function drawCart(c, r) {
    fr(c, r.x, r.y, r.w, r.h, "#0b0c10");
    fr(c, r.x + 1, r.y + 1, r.w - 2, r.h - 2, "#8d8f99");
    for (var x = r.x + 4; x < r.x + r.w - 3; x += 5) fr(c, x, r.y + 2, 2, 3, "#6e7079");
    fr(c, r.x + 6, r.y + r.h - 9, r.w - 12, 6, "#ffd23f");
    fr(c, r.x + 8, r.y + r.h - 7, (r.w - 16) * 0.6, 2, "#101219");
  }
  function drawGate(c, g, t) {
    var r = g.r;
    fr(c, r.x, r.y, r.w, r.h, "rgba(155,255,63,.12)");
    c.strokeStyle = "#9bff3f"; c.lineWidth = 1;
    c.setLineDash([3, 3]); c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); c.setLineDash([]);
    // arrow shows the only way through
    var o = Shell.reduced ? 0 : Math.round(Math.sin(t * 5) * 1.5);
    var cx = r.x + r.w / 2 + g.dx * o, cy = r.y + r.h / 2 + g.dy * o, px = -g.dy, py = g.dx;
    c.fillStyle = "#9bff3f";
    c.beginPath();
    c.moveTo(cx + g.dx * 5, cy + g.dy * 5);
    c.lineTo(cx - g.dx * 4 + px * 6, cy - g.dy * 4 + py * 6);
    c.lineTo(cx - g.dx * 4 - px * 6, cy - g.dy * 4 - py * 6);
    c.closePath(); c.fill();
  }
  function drawSand(c, r) {
    fr(c, r.x, r.y, r.w, r.h, "#cfc3a2");
    var seed = (r.x * 7 + r.y * 13) | 0;
    for (var i = 0; i < (r.w * r.h) / 70; i++) {
      seed = (seed * 16807 + 11) % 2147483647;
      var px = r.x + 2 + (seed % (r.w - 6)), py = r.y + 2 + ((seed >> 8) % (r.h - 5));
      fr(c, px, py, 3, 2, "#f3eee0"); fr(c, px + 2, py + 1, 2, 2, "#f3eee0");
    }
    c.strokeStyle = "#a99c78"; c.lineWidth = 1; c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  }
  function drawWater(c, r, t) {
    fr(c, r.x, r.y, r.w, r.h, "#4a170c");
    fr(c, r.x + 2, r.y + 2, r.w - 4, r.h - 4, "#6a2412");
    for (var i = 0; i < r.w / 14; i++) {
      var bx = r.x + 6 + ((i * 37) % Math.max(1, r.w - 10));
      var by = r.y + r.h - 6 - ((t * 18 + i * 23) % (r.h - 8));
      fr(c, bx, by, 2, 2, "#c98a5a");
    }
    if (r.w > 60) Shell.text(c, "SODA", r.x + r.w / 2, r.y + r.h / 2 - 4, 8, "#e7b98c", "center");
  }
  function drawBoost(c, bo, t) {
    var r = bo.r;
    fr(c, r.x, r.y, r.w, r.h, "#0f3442");
    c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
    c.strokeStyle = "#3ff0ff"; c.lineWidth = 2;
    var off = (t * 40) % 14;
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    for (var k = -4; k <= 4; k++) {
      var s = k * 14 - off * (bo.dy || bo.dx ? 1 : 0);
      var px = cx + bo.dx * -s, py = cy + bo.dy * -s;
      c.beginPath();
      c.moveTo(px - bo.dy * 9 - bo.dx * 5, py - bo.dx * 9 - bo.dy * 5);
      c.lineTo(px + bo.dx * 2, py + bo.dy * 2);
      c.lineTo(px + bo.dy * 9 - bo.dx * 5, py + bo.dx * 9 - bo.dy * 5);
      c.stroke();
    }
    c.restore();
  }
  function drawRotor(c, ro, t) {
    var a0 = rotorAngle(ro, t);
    for (var n = 0; n < ro.n; n++) {
      var a = a0 + n * TAU / ro.n;
      c.save(); c.translate(ro.x, ro.y); c.rotate(a);
      fr(c, 4, -4, ro.len - 2, 8, "#0b0c10");
      fr(c, 5, -3, ro.len - 4, 6, "#23252e");
      fr(c, ro.len * 0.45, -2, ro.len * 0.4, 4, "#eceae2");
      c.restore();
    }
    c.fillStyle = "#0b0c10"; c.beginPath(); c.arc(ro.x, ro.y, 7, 0, TAU); c.fill();
    c.fillStyle = "#eceae2"; c.beginPath(); c.arc(ro.x, ro.y, 5, 0, TAU); c.fill();
    c.fillStyle = "#101219"; c.beginPath(); c.arc(ro.x, ro.y, 2, 0, TAU); c.fill();
  }
  function drawCup(c, h, t) {
    var x = h.cup[0], y = h.cup[1];
    c.fillStyle = "#0a2a1a"; c.beginPath(); c.arc(x, y, CUP_R + 2, 0, TAU); c.fill();
    c.fillStyle = "#050607"; c.beginPath(); c.arc(x, y, CUP_R, 0, TAU); c.fill();
    fr(c, x - 1, y - 30, 2, 30, "#d8d6cf");
    var wav = Math.sin(t * 4) * 1.5;
    c.fillStyle = "#ff4b3e";
    c.beginPath(); c.moveTo(x + 1, y - 30); c.lineTo(x + 17, y - 25 + wav); c.lineTo(x + 1, y - 20); c.closePath(); c.fill();
  }
  function drawBall(c, b) {
    var s = b.z == null ? 1 : b.z;
    if (s <= 0.02) return;
    c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.arc(b.x + 2, b.y + 2, R * s, 0, TAU); c.fill();
    c.fillStyle = "#f6f4ee"; c.beginPath(); c.arc(b.x, b.y, R * s, 0, TAU); c.fill();
    c.fillStyle = "#c8c5bb"; c.beginPath(); c.arc(b.x + 1.2 * s, b.y + 1.2 * s, R * 0.55 * s, 0, TAU); c.fill();
    fr(c, b.x - 2 * s, b.y - 3 * s, 2 * s, 2 * s, "#ffffff");
  }

  function drawHole(c, h, t, ball, showAim) {
    var i;
    for (i = 0; i < h.floor.length; i++) {
      var f = h.floor[i];
      fr(c, f.x, f.y, f.w, f.h, "#1d6a44");
      for (var y = f.y; y < f.y + f.h; y += 32) fr(c, f.x, y, f.w, 16, "#1f7149");
    }
    for (i = 0; i < h.sand.length; i++) drawSand(c, h.sand[i]);
    for (i = 0; i < h.water.length; i++) drawWater(c, h.water[i], t);
    for (i = 0; i < h.boosts.length; i++) drawBoost(c, h.boosts[i], t);
    // tee mat
    fr(c, h.tee[0] - 9, h.tee[1] - 9, 18, 18, "#16523a");
    fr(c, h.tee[0] - 8, h.tee[1] - 8, 16, 16, "#2a8a5c");
    drawCup(c, h, t);
    for (i = 0; i < h.gates.length; i++) drawGate(c, h.gates[i], t);
    for (i = 0; i < h.walls.length; i++) drawWall(c, h.walls[i]);
    for (i = 0; i < h.boxes.length; i++) drawBox(c, h.boxes[i], i + h.par);
    for (i = 0; i < h.carts.length; i++) drawCart(c, h.carts[i]);
    for (i = 0; i < h.sliders.length; i++) drawBox(c, sliderRect(h.sliders[i], t), i + 2);
    for (i = 0; i < h.rotors.length; i++) drawRotor(c, h.rotors[i], t);
    if (ball) {
      if (showAim) drawAim(c, ball);
      drawBall(c, ball);
    }
  }

  function powerColor(p) { return p < 0.45 ? "#3ff0ff" : p < 0.8 ? "#ffd23f" : "#ff4b3e"; }

  function drawAim(c, b) {
    var shot = dragShot(), a, p;
    if (shot) { a = shot.a; p = shot.p; }
    else if (S.kb && canShoot()) { a = S.aim; p = S.charging ? S.power : 0; }
    else return;
    var dx = Math.cos(a), dy = Math.sin(a);
    // pull band back toward the finger
    if (shot) {
      c.strokeStyle = "rgba(236,234,226,.35)"; c.lineWidth = 2;
      c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - dx * p * 60, b.y - dy * p * 60); c.stroke();
    }
    var len = 26 + p * 130, col = powerColor(p);
    for (var d = 10; d < len; d += 8) fr(c, b.x + dx * d - 1.5, b.y + dy * d - 1.5, 3, 3, d + 8 >= len ? col : "rgba(236,234,226,.85)");
    fr(c, b.x + dx * len - 2.5, b.y + dy * len - 2.5, 5, 5, col);
  }

  function drawHUD(c) {
    var h = HOLES[S.hole];
    fr(c, 0, 0, W, HUD, "#1d2029");
    fr(c, 0, HUD - 2, W, 2, "#2c3040");
    Shell.text(c, "HOLE " + (S.hole + 1) + "/9", 8, 8, 8, "#3ff0ff");
    Shell.text(c, "PAR " + h.par, 8, 22, 8, "#eceae2");
    Shell.uiText(c, h.name, 8, 34, 9, "#8e93a2");
    var used = 0, par = 0;
    for (var i = 0; i < S.card.length; i++) { used += S.card[i]; par += HOLES[i].par; }
    var rel = used - par;
    Shell.text(c, "TOTAL " + fmt(rel), W - 8, 8, 8, rel <= 0 ? "#9bff3f" : "#ff3fa4", "right");
    Shell.text(c, "STROKE " + S.strokes + "/" + MAX_STROKES, W - 8, 22, 8, "#eceae2", "right");
    var hb = bests[S.hole];
    Shell.uiText(c, "HOLE BEST " + (hb == null ? "-" : hb), W - 8, 34, 9, "#ffd23f", "right");
  }

  function drawPowerBar(c) {
    var shot = dragShot();
    var p = shot ? shot.p : (S.charging ? S.power : -1);
    if (p < 0) return;
    var x = W - 22, y = HUD + 40, hgt = 140;
    fr(c, x - 2, y - 2, 14, hgt + 4, "#0b0c10");
    fr(c, x, y, 10, hgt, "#23252e");
    fr(c, x, y + hgt * (1 - p), 10, hgt * p, powerColor(p));
    Shell.text(c, Math.round(p * 100) + "%", x + 10, y + hgt + 6, 8, "#eceae2", "right");
  }

  function draw(c) {
    fr(c, 0, 0, W, H, "#12141c");
    for (var i = 0; i < carpet.length; i++) fr(c, carpet[i][0], carpet[i][1], 2, 2, carpet[i][2]);
    var h = HOLES[S.hole];
    c.save();
    if (S.mode === "slide") {
      var e = S.slide * S.slide;
      // previous hole slides out to the left while the new one comes in
      if (S.hole > 0) {
        c.save(); c.translate(-W * (1 - e), 0);
        drawHole(c, HOLES[S.hole - 1], S.t, null, false);
        c.restore();
      }
      c.translate(W * e, 0);
    }
    drawHole(c, h, S.holeT, S.ball, true);
    c.restore();
    for (i = 0; i < conf.length; i++) fr(c, conf[i].x, conf[i].y, conf[i].w, conf[i].w, conf[i].c);
    drawHUD(c);
    drawPowerBar(c);
  }

  function fmt(n) { return n === 0 ? "E" : n > 0 ? "+" + n : String(n); }

  // Hook for automated course checks (no effect on play)
  window.__shelfLinks = { S: function () { return S; }, HOLES: HOLES, advance: advance, R: R, V_MIN: V_MIN, V_MAX: V_MAX, MAX_PULL: MAX_PULL, STOP: STOP };

  Shell.init({
    slug: "shelf-links",
    title: "SHELF LINKS",
    accent: "#9bff3f",
    width: W, height: H,
    lowerIsBetter: true,
    format: fmt,
    howTo: "Nine holes of mini golf built out of game boxes, shelves and tape decks. Drag back from anywhere, then let go to putt.",
    keys: "Keys: arrows aim, hold Space to charge, release to putt. P pause, M mute, R restart.",
    tip: "Max 6 strokes a hole. Spilled soda costs you one.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { if (paused) return; S.t += dt; S.holeT += dt; updateConfetti(dt); }, // QA fix: freeze rotors/sliders while paused
    onPause: function () { paused = true; keys = {}; S.drag = null; S.charging = false; },
    onResume: function () { paused = false; }
  });
})();
