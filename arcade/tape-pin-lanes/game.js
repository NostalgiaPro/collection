/* TAPE PIN LANES: ten fast frames where the pins are stacked VHS tapes. Curve it, strike it.
   Units are inches and seconds. x runs across the lane (0 = center), y runs down it (0 = foul line). */
(function () {
  "use strict";
  var W = 360, H = 540, TAU = Math.PI * 2;
  var LW = 20.75, GUT = 9.25, KICK = LW + GUT;           // half lane, gutter, kickback walls
  var HEAD_Y = 720, DECK_END = 756, PIT_Y = 772;
  var BALL_R = 4.3, PIN_R = 2.4, PIN_H = 11, PIN_W = 5.2;
  var BALL_M = 16, PIN_M = 3.5;
  var V_MIN = 420, V_MAX = 660, HOOK = 135, OIL_GRIP = 0.12;
  var FALL_V = 28;                                         // a pin pushed faster than this goes down
  var START_Y = -14, POS_MAX = LW - BALL_R - 1;
  var F = 1000, CAMH = 40, HZ = 130, CAM0 = -150, CAM_MAX = 468;
  var BUMPER_FRAMES = 5;
  // Oil length per frame (inches). Shorter oil = earlier, bigger hook.
  var OIL = [470, 380, 560, 330, 500, 420, 300, 540, 360, 450];
  var SPOTS = [[0, 0], [-6, 10.39], [6, 10.39], [-12, 20.78], [0, 20.78], [12, 20.78], [-18, 31.18], [-6, 31.18], [6, 31.18], [18, 31.18]];

  var S = {}, keys = {}, idleT = 0, parts = [];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------------- Rack + scoring ---------------- */
  function makePin(i) {
    return { i: i, x: SPOTS[i][0], y: HEAD_Y + SPOTS[i][1], vx: 0, vy: 0, st: "up", tilt: 0, dir: 1, wob: 0, wobT: 0, drop: 0 };
  }
  function fullRack() { var a = []; for (var i = 0; i < 10; i++) a.push(makePin(i)); return a; }

  function reset() {
    S = { t: 0, phase: "aim", pt: 0, splitFrame: -1, frame: 0, ball: 0, frames: [[]], pins: fullRack(),
          pos: 0, spin: 0, power: 0, charging: false, chargeT: 0, drag: null, kb: false,
          b: null, camY: CAM0, strikesRow: 0, strikes: 0, spares: 0, splitMsg: "", lastClack: 0, rollSnd: 0,
          announcedBumpers: false, sweepFull: false, over: false };
    parts.length = 0;
  }

  function oilLen() { return OIL[S.frame % OIL.length]; }
  function bumpersUp() { return S.frame < BUMPER_FRAMES; }

  function standingCount() {
    var n = 0;
    for (var i = 0; i < S.pins.length; i++) if (S.pins[i].st === "up") n++;
    return n;
  }

  // Cumulative score per frame (null until it can be scored)
  function scores(frames) {
    var rolls = [], i, out = [];
    for (i = 0; i < frames.length; i++) rolls = rolls.concat(frames[i]);
    var r = 0, total = 0;
    for (var f = 0; f < 10; f++) {
      if (r >= rolls.length) { out.push(null); continue; }
      if (rolls[r] === 10) {
        if (rolls.length < r + 3) { out.push(null); r += 1; continue; }
        total += 10 + rolls[r + 1] + rolls[r + 2]; r += 1;
      } else {
        if (rolls.length < r + 2) { out.push(null); r += 2; continue; }
        if (rolls[r] + rolls[r + 1] === 10) {
          if (rolls.length < r + 3) { out.push(null); r += 2; continue; }
          total += 10 + rolls[r + 2];
        } else total += rolls[r] + rolls[r + 1];
        r += 2;
      }
      out.push(total);
    }
    return out;
  }
  function total() {
    var sc = scores(S.frames), t = 0;
    for (var i = 0; i < sc.length; i++) if (sc[i] != null) t = sc[i];
    return t;
  }
  function sym(n) { return n === 0 ? "-" : String(n); }
  function marks(fr, f) {
    var m = [];
    if (!fr.length) return m;
    if (f < 9) {
      if (fr[0] === 10) return ["X"];
      m.push(sym(fr[0]));
      if (fr.length > 1) m.push(fr[0] + fr[1] === 10 ? "/" : sym(fr[1]));
      return m;
    }
    m.push(fr[0] === 10 ? "X" : sym(fr[0]));
    if (fr.length > 1) {
      if (fr[0] === 10) m.push(fr[1] === 10 ? "X" : sym(fr[1]));
      else m.push(fr[0] + fr[1] === 10 ? "/" : sym(fr[1]));
    }
    if (fr.length > 2) {
      if (fr[0] === 10 && fr[1] !== 10) m.push(fr[1] + fr[2] === 10 ? "/" : sym(fr[2]));
      else m.push(fr[2] === 10 ? "X" : sym(fr[2]));
    }
    return m;
  }

  /* ---------------- Throw ---------------- */
  function canThrow() { return S.phase === "aim" && S.pt > 0.15; }

  function throwBall(p, spin) {
    if (!canThrow() || p < 0.05) return;
    var v = V_MIN + clamp(p, 0, 1) * (V_MAX - V_MIN);
    S.b = { x: S.pos, y: START_Y, vx: 0, vy: v, spin: clamp(spin, -1, 1), gutter: false, roll: 0, hitPins: false, atPinsT: 0 };
    S.phase = "roll"; S.pt = 0;
    S.drag = null; S.charging = false;
    Shell.sfx("whoosh");
  }

  /* ---------------- Physics ---------------- */
  function clack(speed) {
    if (speed < 40 || S.t - S.lastClack < 0.03) return;
    S.lastClack = S.t;
    var v = Math.min(0.45, 0.12 + speed / 1500);
    Shell.noise(0.05, v, 2400 + Math.random() * 1600, 1.5);
    Shell.tone(700 + Math.random() * 500, 0.04, "square", v * 0.5);
  }

  function knock(p, speed) {
    if (p.st === "up") {
      if (speed > FALL_V) { p.st = "falling"; p.dir = (p.vx >= 0 ? 1 : -1); }
      else if (speed > 4) { p.wob = Math.min(0.35, speed / 80); p.wobT = 0; }
    }
  }

  function collide(a, ar, am, b, br, bm, e) {
    var dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, rr = ar + br;
    if (d2 >= rr * rr || d2 < 1e-6) return 0;
    var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = rr - d;
    var tm = am + bm;
    a.x -= nx * pen * bm / tm; a.y -= ny * pen * bm / tm;
    b.x += nx * pen * am / tm; b.y += ny * pen * am / tm;
    var rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv >= 0) return 0;
    var j = -(1 + e) * rv / (1 / am + 1 / bm);
    a.vx -= j * nx / am; a.vy -= j * ny / am;
    b.vx += j * nx / bm; b.vy += j * ny / bm;
    return -rv;
  }

  function pinR(p) { return p.st === "up" ? PIN_R : PIN_R + 1.6; } // a toppled tape covers more deck

  function step(dt) {
    var b = S.b, i, j, p, q, imp;
    if (b && b.y < PIT_Y + 40) {
      // hook: almost nothing in the oil, full bite on the dry back end
      var grip = b.y > oilLen() ? 1 : OIL_GRIP;
      if (!b.gutter && b.y < HEAD_Y - 10) b.vx += b.spin * HOOK * grip * dt;
      b.vy = Math.max(200, b.vy - 18 * dt);
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.roll += b.vy * dt / BALL_R;
      if (!b.gutter && b.y < DECK_END) {
        var edge = LW - BALL_R + 2.2;
        if (bumpersUp()) {
          if (Math.abs(b.x) > edge) { b.x = Math.sign(b.x) * edge; b.vx = -b.vx * 0.55; Shell.sfx("click"); }
        } else if (Math.abs(b.x) > LW - 0.5) {
          b.gutter = true; b.vx = 0; b.side = Math.sign(b.x);
          Shell.noise(0.18, 0.35, 220, 0.8, 0, 0, "lowpass");
        }
      }
      if (b.gutter) b.x += (b.side * (LW + GUT / 2) - b.x) * Math.min(1, dt * 18);
      if (!b.gutter) {
        for (i = 0; i < S.pins.length; i++) {
          p = S.pins[i];
          if (p.st === "gone" || p.st === "down" && p.drop > 0) continue;
          imp = collide(b, BALL_R, BALL_M, p, pinR(p), PIN_M, 0.62);
          if (imp) { b.hitPins = true; clack(imp); knock(p, Math.hypot(p.vx, p.vy)); }
        }
      }
    }
    // pins
    for (i = 0; i < S.pins.length; i++) {
      p = S.pins[i];
      if (p.st === "gone") continue;
      var sp = Math.hypot(p.vx, p.vy);
      if (sp > 0) {
        var ns = Math.max(0, sp - (260 + sp * 1.4) * dt);
        p.vx *= ns / sp; p.vy *= ns / sp;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (Math.abs(p.x) > KICK - PIN_R) { p.x = Math.sign(p.x) * (KICK - PIN_R); p.vx = -p.vx * 0.5; clack(Math.abs(p.vx) * 2); }
      if (p.y > PIT_Y) { p.st = "gone"; continue; }
      if (p.y < HEAD_Y - 40) { p.vy = Math.abs(p.vy) * 0.3; }
      if (p.st === "up" && Math.hypot(p.x - (SPOTS[p.i][0]), p.y - (HEAD_Y + SPOTS[p.i][1])) > 2.5) { p.st = "falling"; p.dir = p.vx >= 0 ? 1 : -1; }
    }
    for (i = 0; i < S.pins.length; i++) {
      p = S.pins[i];
      if (p.st === "gone") continue;
      for (j = i + 1; j < S.pins.length; j++) {
        q = S.pins[j];
        if (q.st === "gone") continue;
        if (p.st === "up" && q.st === "up" && !p.vx && !p.vy && !q.vx && !q.vy) continue;
        imp = collide(p, pinR(p), PIN_M, q, pinR(q), PIN_M, 0.55);
        if (imp) {
          clack(imp);
          knock(p, Math.hypot(p.vx, p.vy)); knock(q, Math.hypot(q.vx, q.vy));
        }
      }
    }
  }

  function anyMoving() {
    for (var i = 0; i < S.pins.length; i++) {
      var p = S.pins[i];
      if (p.st !== "gone" && Math.hypot(p.vx, p.vy) > 4) return true;
    }
    return false;
  }

  /* ---------------- Flow ---------------- */
  function setPhase(ph) { S.phase = ph; S.pt = 0; }

  function update(dt) {
    S.t += dt; S.pt += dt;
    var i, p;
    // standing-pin wobble + toppling animation
    for (i = 0; i < S.pins.length; i++) {
      p = S.pins[i];
      if (p.st === "falling") { p.tilt = Math.min(Math.PI / 2, p.tilt + dt * 9); if (p.tilt >= Math.PI / 2) p.st = "down"; }
      if (p.wob > 0) { p.wobT += dt; p.wob = Math.max(0, p.wob - dt * 0.5); }
    }
    for (i = parts.length - 1; i >= 0; i--) {
      var q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 200 * dt;
      if (q.life <= 0) parts.splice(i, 1);
    }

    if (S.phase === "aim") {
      var mv = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
      if (mv) { S.pos = clamp(S.pos + mv * 22 * dt, -POS_MAX, POS_MAX); S.kb = true; }
      var hk = (keys.ArrowUp ? 1 : 0) + (keys.ArrowDown ? -1 : 0);
      if (hk) { S.spin = clamp(S.spin + hk * 1.1 * dt, -1, 1); S.kb = true; }
      if (S.charging) {
        S.chargeT += dt;
        var ph = (S.chargeT / 1.1) % 2;
        S.power = ph < 1 ? ph : 2 - ph;
      }
      S.camY += (CAM0 - S.camY) * Math.min(1, dt * 10);
      if (!S.announcedBumpers && S.frame === BUMPER_FRAMES && S.ball === 0) {
        S.announcedBumpers = true;
        Shell.flash("BUMPERS DOWN", "Gutters are live from here on.", "#ff3fa4", 1300);
      }
      return;
    }

    if (S.phase === "roll" || S.phase === "settle") {
      var b = S.b;
      var maxV = Math.max(Math.hypot(b.vx, b.vy), 1);
      for (i = 0; i < S.pins.length; i++) maxV = Math.max(maxV, Math.hypot(S.pins[i].vx, S.pins[i].vy));
      var n = clamp(Math.ceil(maxV * dt / 1.6), 2, 30);
      for (i = 0; i < n; i++) step(dt / n);
      // rolling rumble
      if (b.y < PIT_Y) {
        S.rollSnd -= dt;
        if (S.rollSnd <= 0) { S.rollSnd = 0.08; Shell.noise(0.1, b.gutter ? 0.1 : 0.16, b.gutter ? 260 : 140, 0.7, 0, 0, "lowpass", 0.02); }
      }
      var target = clamp(b.y - 150, CAM0, CAM_MAX);
      S.camY += (target - S.camY) * Math.min(1, dt * 6);
      if (S.phase === "roll" && b.y > HEAD_Y - 6) setPhase("settle");
      if (S.phase === "settle") {
        var done = (b.y > PIT_Y || b.gutter) && (!anyMoving() && S.pt > 0.35 || S.pt > 2.2);
        if (done) resolveBall();
      }
      return;
    }
    if (S.phase === "result") {
      if (S.pt > 0.55) startSweep();
      return;
    }
    if (S.phase === "sweep") {
      var k = S.pt / 0.38;
      S.camY += (CAM0 - S.camY) * Math.min(1, dt * 9);
      if (S.sweepFull) for (i = 0; i < S.pins.length; i++) S.pins[i].drop = Math.max(0, 1 - k);
      if (k >= 1) {
        for (i = 0; i < S.pins.length; i++) S.pins[i].drop = 0;
        S.b = null;
        if (S.over) { finishGame(); return; }
        setPhase("aim");
      }
    }
  }

  function resolveBall() {
    var b = S.b, i, p, down = 0;
    for (i = 0; i < S.pins.length; i++) {
      p = S.pins[i];
      if (p.st !== "up") { if (!p.counted) { p.counted = true; down++; } }
    }
    var fr = S.frames[S.frame];
    fr.push(down);
    var first = S.ball === 0, f = S.frame;
    var standing = standingCount();
    var strike = down === 10 && (first || (f === 9 && fr.length === 2 && fr[0] === 10) || (f === 9 && fr.length === 3 && (fr[1] === 10 || fr[0] + fr[1] === 10)));
    var spare = !strike && standing === 0 && !first;
    var title, sub = "", col = "#eceae2";

    if (strike) {
      S.strikes++; S.strikesRow++;
      if (S.strikesRow === 3) { title = "TURKEY!"; sub = "Three in a row. BE KIND, REWIND... ALL OF THEM."; col = "#ff4b3e"; burst(60); Shell.sfx("best"); }
      else { title = S.strikesRow > 3 ? S.strikesRow + " IN A ROW!" : "STRIKE!"; sub = "BE KIND, REWIND... ALL OF THEM."; col = "#ffd23f"; burst(30); }
      Shell.sfx("crowd"); Shell.sfx("score"); Shell.shake(4, 0.3);
      if (window.Trophies) { Trophies.unlock("tpl-strike"); if (S.strikesRow === 3) Trophies.unlock("tpl-turkey"); }
    } else {
      S.strikesRow = 0;
      if (spare) {
        S.spares++; title = "SPARE!"; sub = "Picked it clean."; col = "#3ff0ff"; Shell.sfx("score");
        if (window.Trophies) { Trophies.unlock("tpl-spare"); if (S.splitFrame === f) Trophies.unlock("tpl-split"); }
      }
      else if (down === 0 && b.gutter) {
        title = "LATE FEE."; sub = "Gutter ball."; col = "#ff3fa4"; Shell.sfx("miss");
        if (window.Trophies && f >= 5) Trophies.unlock("tpl-latefee");
      }
      else if (down === 0) { title = "MISS"; sub = "Not a scratch on them."; col = "#8e93a2"; Shell.sfx("miss"); }
      else {
        title = down + (down === 1 ? " PIN" : " PINS");
        if (first && isSplit()) { title = "SPLIT"; sub = down + " down. Good luck with the rest."; col = "#a77bff"; S.splitFrame = f; }
        else if (standing > 0) sub = standing + " left standing.";
        Shell.sfx("tap");
      }
    }
    Shell.flash(title, sub, col, 900);

    // advance frame / ball
    var reset = false;
    if (f < 9) {
      if (strike || !first) { S.frame++; S.ball = 0; S.frames.push([]); reset = true; }
      else S.ball = 1;
    } else {
      if (fr.length === 1) { S.ball = 1; reset = strike; }
      else if (fr.length === 2) {
        if (fr[0] === 10 || fr[0] + fr[1] === 10) { S.ball = 2; reset = strike || spare; }
        else S.over = true;
      } else S.over = true;
    }
    S.sweepFull = reset && !S.over;
    setPhase("result");
  }

  function startSweep() {
    var i, p;
    if (S.sweepFull) {
      S.pins = fullRack();
      for (i = 0; i < S.pins.length; i++) S.pins[i].drop = 1;
    } else {
      // clear the deadwood, leave standing tapes where they are
      var keep = [];
      for (i = 0; i < S.pins.length; i++) {
        p = S.pins[i];
        if (p.st === "up") { p.vx = p.vy = 0; p.wob = 0; keep.push(p); }
      }
      S.pins = keep;
    }
    Shell.noise(0.3, 0.12, 400, 0.6, 0, 900);
    setPhase("sweep");
  }

  function isSplit() {
    var up = [], i, j;
    for (i = 0; i < S.pins.length; i++) if (S.pins[i].st === "up") up.push(S.pins[i]);
    if (up.length < 2) return false;
    for (i = 0; i < up.length; i++) if (up[i].i === 0) return false; // headpin still up: not a split
    // group standing pins by neighbor distance; more than one group = split
    var group = up.map(function (_, k) { return k; });
    function find(k) { while (group[k] !== k) k = group[k]; return k; }
    for (i = 0; i < up.length; i++) for (j = i + 1; j < up.length; j++) {
      var a = SPOTS[up[i].i], c = SPOTS[up[j].i];
      if (Math.hypot(a[0] - c[0], a[1] - c[1]) < 12.5) group[find(i)] = find(j);
    }
    var roots = {};
    for (i = 0; i < up.length; i++) roots[find(i)] = 1;
    return Object.keys(roots).length > 1;
  }

  function finishGame() {
    var t = total();
    var title = t === 300 ? "PERFECT GAME!" : "TEN FRAMES DONE";
    Shell.gameOver(t, { title: title, html: cardHTML() +
      '<div class="np-row" style="margin-top:10px"><span>Strikes</span><b>' + S.strikes + '</b></div>' +
      '<div class="np-row"><span>Spares</span><b>' + S.spares + '</b></div>',
      stats: { total: t, strikes: S.strikes, spares: S.spares, frames: JSON.parse(JSON.stringify(S.frames)) } });
  }
  function cardHTML() {
    var sc = scores(S.frames), h = '<table aria-label="Scorecard"><tr>', i;
    for (i = 0; i < 10; i++) h += "<th>" + (i + 1) + "</th>";
    h += "</tr><tr>";
    for (i = 0; i < 10; i++) h += "<td>" + (S.frames[i] ? marks(S.frames[i], i).join(" ") : "") + "</td>";
    h += "</tr><tr>";
    for (i = 0; i < 10; i++) h += "<td>" + (sc[i] == null ? "" : sc[i]) + "</td>";
    return h + "</tr></table>";
  }

  function burst(n) {
    var cols = ["#ffd23f", "#3ff0ff", "#ff3fa4", "#9bff3f", "#a77bff"];
    if (Shell.reduced) n = Math.ceil(n / 3);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = 60 + Math.random() * 160;
      parts.push({ x: W / 2, y: 230, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 1.1, c: cols[i % cols.length] });
    }
  }

  /* ---------------- Input ---------------- */
  function pointer(type, x, y) {
    if (type === "down") {
      if (!canThrow()) return;
      S.drag = { sx: x, sy: y, ox: x, oy: y, mode: "slide", pos0: S.pos, x: x, y: y };
      S.kb = false; S.charging = false;
    } else if (type === "move" && S.drag) {
      var d = S.drag;
      d.x = x; d.y = y;
      if (d.mode === "slide") {
        if (y > d.oy) { d.oy = y; d.ox = x; }            // lowest point so far starts the flick
        if (d.oy - y > 16) d.mode = "flick";
        else S.pos = clamp(d.pos0 + (x - d.sx) * 0.15, -POS_MAX, POS_MAX);
      }
    } else if ((type === "up" || type === "cancel") && S.drag) {
      var dd = S.drag; S.drag = null;
      if (type === "cancel" || dd.mode !== "flick") return;
      var f = flick(dd);
      if (f) throwBall(f.p, f.spin);
    }
  }
  function flick(d) {
    var dy = d.oy - d.y, dx = d.x - d.ox;
    if (dy < 24) return null;
    return { p: clamp(dy / 210, 0, 1), spin: clamp(dx / Math.max(dy, 60) * 1.5, -1, 1) };
  }
  function key(type, code, e) {
    var act = code === "Space" || code === "Enter" || code === "NumpadEnter";
    if (type === "down") {
      keys[code] = true;
      if (act && !e.repeat && canThrow() && !S.charging) { S.charging = true; S.chargeT = 0; S.power = 0; S.kb = true; S.drag = null; }
    } else {
      keys[code] = false;
      if (act && S.charging) { S.charging = false; throwBall(S.power, S.spin); S.power = 0; }
    }
  }

  /* ---------------- Drawing ---------------- */
  function proj(x, y, z) {
    var d = Math.max(6, y - S.camY), s = F / d;
    return { x: W / 2 + x * s, y: HZ + (CAMH - z) * s, s: s };
  }
  function fr(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function quad(c, a, b, d, e, col) {
    c.fillStyle = col; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.lineTo(e.x, e.y); c.closePath(); c.fill();
  }
  function strip(c, x1, x2, y1, y2, col) {
    y1 = Math.max(y1, S.camY + 6);
    if (y2 <= y1) return;
    quad(c, proj(x1, y1, 0), proj(x2, y1, 0), proj(x2, y2, 0), proj(x1, y2, 0), col);
  }

  function drawAlley(c, t) {
    // back wall + masking unit above the pins
    fr(c, 0, 0, W, H, "#0d0f15");
    var top = proj(0, PIT_Y + 30, 60), base = proj(0, PIT_Y + 30, 0);
    fr(c, 0, 0, W, base.y, "#141726");
    var mL = proj(-KICK - 8, PIT_Y + 20, 46), mR = proj(KICK + 8, PIT_Y + 20, 22);
    fr(c, mL.x, mL.y, mR.x - mL.x, mR.y - mL.y, "#1d2029");
    fr(c, mL.x, mR.y - 2, mR.x - mL.x, 2, "#a77bff");
    var sz = Math.max(6, Math.min(Math.round((mR.y - mL.y) * 0.32), Math.floor((mR.x - mL.x) / 16)));
    Shell.text(c, "TAPE PIN LANES", (mL.x + mR.x) / 2, mL.y + (mR.y - mL.y) / 2 - sz / 2, sz, "#a77bff", "center", "#a77bff");
    // pit
    strip(c, -KICK, KICK, DECK_END, PIT_Y + 30, "#06070a");
    // kickbacks
    var kh = 12;
    quad(c, proj(-KICK, HEAD_Y - 30, 0), proj(-KICK, PIT_Y, 0), proj(-KICK, PIT_Y, kh), proj(-KICK, HEAD_Y - 30, kh), "#2a2236");
    quad(c, proj(KICK, HEAD_Y - 30, 0), proj(KICK, PIT_Y, 0), proj(KICK, PIT_Y, kh), proj(KICK, HEAD_Y - 30, kh), "#2a2236");
    // side floor
    strip(c, -KICK - 60, -KICK, START_Y - 40, PIT_Y, "#121420");
    strip(c, KICK, KICK + 60, START_Y - 40, PIT_Y, "#121420");
    // gutters
    strip(c, -KICK, -LW, 0, DECK_END, "#2b2f3c");
    strip(c, LW, KICK, 0, DECK_END, "#2b2f3c");
    strip(c, -KICK + 2, -LW - 2, 0, DECK_END, "#20232e");
    strip(c, LW + 2, KICK - 2, 0, DECK_END, "#20232e");
    // approach + lane + deck
    strip(c, -LW - 6, LW + 6, START_Y - 60, 0, "#5b3d22");
    strip(c, -LW, LW, 0, DECK_END, "#c99a5f");
    strip(c, -LW, LW, HEAD_Y - 14, DECK_END, "#d6ad74");
    var boardW = (LW * 2) / 39;
    c.lineWidth = 1;
    for (var bd = 1; bd < 39; bd++) {
      var bx = -LW + bd * boardW;
      var a = proj(bx, Math.max(0, S.camY + 6), 0), e = proj(bx, DECK_END, 0);
      c.strokeStyle = bd % 5 === 0 ? "rgba(90,55,25,.5)" : "rgba(120,80,40,.22)";
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(e.x, e.y); c.stroke();
    }
    // foul line
    strip(c, -LW - 6, LW + 6, 0, 1.5, "#ff4b3e");
    // approach dots + lane arrows
    for (var k = -3; k <= 3; k++) {
      var dp = proj(k * 5 * boardW, -8, 0);
      if (dp.y < H) fr(c, dp.x - 1.5, dp.y - 1, 3, 2, "#2c1a0c");
      var ay = 180 + (3 - Math.abs(k)) * 8, ax = k * 5 * boardW;
      var t1 = proj(ax, ay + 10, 0), t2 = proj(ax - 1.4, ay, 0), t3 = proj(ax + 1.4, ay, 0);
      c.fillStyle = "#3a2410"; c.beginPath(); c.moveTo(t1.x, t1.y); c.lineTo(t2.x, t2.y); c.lineTo(t3.x, t3.y); c.closePath(); c.fill();
    }
    // oil: a shiny stripe as long as this frame's pattern
    var oil = oilLen();
    strip(c, -LW + 3 * boardW, LW - 3 * boardW, 0, oil, "rgba(190,230,255,.13)");
    var sh = (t * 260) % (oil + 120) - 60;
    strip(c, -LW + 5 * boardW, LW - 5 * boardW, Math.max(0, sh), Math.min(oil, sh + 50), "rgba(255,255,255,.1)");
    strip(c, -LW + 3 * boardW, LW - 3 * boardW, oil - 4, oil, "rgba(63,240,255,.45)");
    // bumpers
    if (bumpersUp()) {
      strip(c, -LW - 3, -LW - 0.5, 0, DECK_END - 4, "#ffd23f");
      strip(c, LW + 0.5, LW + 3, 0, DECK_END - 4, "#ffd23f");
    }
  }

  function drawPin(c, p) {
    if (p.st === "gone") return;
    var lift = p.drop * 30;
    var base = proj(p.x, p.y, lift), s = base.s;
    var w = PIN_W * s, h = PIN_H * s;
    var ang = p.st === "up" ? Math.sin(p.wobT * 30) * p.wob : p.tilt * p.dir;
    c.save();
    c.translate(base.x, base.y);
    if (p.st === "up") { c.fillStyle = "rgba(0,0,0,.28)"; c.beginPath(); c.ellipse(0, 0, w * 0.7, w * 0.22, 0, 0, TAU); c.fill(); }
    c.rotate(ang);
    c.fillStyle = "#0b0c10"; c.fillRect(-w / 2 - 1, -h - 1, w + 2, h + 2);
    c.fillStyle = "#f2f0ea"; c.fillRect(-w / 2, -h, w, h);           // clamshell
    c.fillStyle = "#1a1b22"; c.fillRect(-w * 0.36, -h * 0.92, w * 0.72, h * 0.84); // tape
    c.fillStyle = "#eceae2"; c.fillRect(-w * 0.28, -h * 0.8, w * 0.56, h * 0.26);   // spine label
    c.fillStyle = ["#ff4b3e", "#3ff0ff", "#ff3fa4", "#9bff3f", "#ffd23f"][p.i % 5];
    c.fillRect(-w * 0.28, -h * 0.62, w * 0.56, Math.max(1, h * 0.06));
    if (w > 10) { c.fillStyle = "#3a3c48"; c.fillRect(-w * 0.2, -h * 0.4, w * 0.4, h * 0.14); }
    c.restore();
  }

  function drawBall(c, b) {
    var z = b.gutter ? BALL_R - 2.5 : BALL_R;
    var p = proj(b.x, b.y, z), r = BALL_R * p.s;
    if (b.y > PIT_Y + 5) return;
    var g = proj(b.x, b.y, b.gutter ? -2.5 : 0);
    c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(g.x, g.y, r * 0.95, r * 0.3, 0, 0, TAU); c.fill();
    c.fillStyle = "#4b2a8a"; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.fill();
    c.fillStyle = "#7a52d1"; c.beginPath(); c.arc(p.x - r * 0.15, p.y - r * 0.15, r * 0.78, 0, TAU); c.fill();
    c.fillStyle = "#a77bff"; c.beginPath(); c.arc(p.x - r * 0.35, p.y - r * 0.4, r * 0.28, 0, TAU); c.fill();
    var ry = Math.sin(b.roll || 0), vis = Math.cos(b.roll || 0) > -0.2;
    if (vis && r > 4) {
      c.fillStyle = "#14082a";
      var hy = p.y + ry * r * 0.45;
      c.beginPath(); c.arc(p.x - r * 0.22, hy, r * 0.12, 0, TAU); c.arc(p.x + r * 0.22, hy, r * 0.12, 0, TAU); c.fill();
      c.beginPath(); c.arc(p.x, hy + r * 0.32, r * 0.14, 0, TAU); c.fill();
    }
  }

  function drawAim(c) {
    var drag = S.drag, f = drag && drag.mode === "flick" ? flick(drag) : null;
    var spin = f ? f.spin : S.spin, pw = f ? f.p : (S.charging ? S.power : -1);
    if (!f && !S.kb && !drag) spin = S.spin;
    // straight guide through the oil (the ball barely bites there)
    var oil = oilLen();
    for (var y = 20; y < oil; y += 24) {
      var p = proj(S.pos, y, 0.3);
      fr(c, p.x - 1.5, p.y - 1, 3, 2, "rgba(236,234,226,.75)");
    }
    var e = proj(S.pos, oil, 0.3);
    fr(c, e.x - 2.5, e.y - 2, 5, 4, "#3ff0ff");
    // hook meter
    var cx = 300, cy = 470;
    fr(c, cx - 44, cy - 4, 88, 8, "#0b0c10");
    fr(c, cx - 42, cy - 2, 84, 4, "#2c3040");
    fr(c, cx - 1, cy - 6, 2, 12, "#8e93a2");
    var hx = cx + spin * 40;
    fr(c, hx - 4, cy - 7, 8, 14, Math.abs(spin) > 0.05 ? "#a77bff" : "#eceae2");
    Shell.uiText(c, Math.abs(spin) < 0.05 ? "HOOK: NONE" : "HOOK " + (spin < 0 ? "<" : ">") + " " + Math.round(Math.abs(spin) * 100) + "%", cx, cy + 10, 9, "#eceae2", "center");
    // power meter while charging or flicking
    if (pw >= 0) {
      var x = 16, top = 300, hgt = 150, pc = clamp(pw, 0, 1);
      fr(c, x - 2, top - 2, 16, hgt + 4, "#0b0c10");
      fr(c, x, top, 12, hgt, "#23252e");
      fr(c, x, top + hgt * (1 - pc), 12, hgt * pc, pc > 0.8 ? "#ff4b3e" : pc > 0.45 ? "#ffd23f" : "#3ff0ff");
      Shell.text(c, "PWR", x + 6, top + hgt + 6, 8, "#8e93a2", "center");
    }
  }

  function drawHUD(c) {
    fr(c, 0, 0, W, 74, "rgba(13,15,21,.94)");
    fr(c, 0, 74, W, 2, "#2c3040");
    var sc = scores(S.frames), x = 4, i;
    for (i = 0; i < 10; i++) {
      var w = i === 9 ? 51 : 32, cur = i === S.frame && !S.over;
      fr(c, x, 4, w - 1, 38, cur ? "#2a2240" : "#1d2029");
      c.strokeStyle = cur ? "#a77bff" : "#2c3040"; c.lineWidth = 1; c.strokeRect(x + 0.5, 4.5, w - 2, 37);
      Shell.uiText(c, String(i + 1), x + 3, 5, 8, "#8e93a2");
      var m = S.frames[i] ? marks(S.frames[i], i) : [];
      for (var k = 0; k < m.length; k++) {
        var mx = i === 9 ? x + 8 + k * 15 : x + 10 + k * 11;
        Shell.text(c, m[k], mx, 13, 8, m[k] === "X" ? "#ffd23f" : m[k] === "/" ? "#3ff0ff" : "#eceae2", "center");
      }
      if (sc[i] != null) Shell.text(c, String(sc[i]), x + w / 2, 28, 8, "#eceae2", "center");
      x += w + 1;
    }
    Shell.uiText(c, "FRAME " + Math.min(10, S.frame + 1) + "  BALL " + (S.ball + 1), 8, 48, 10, "#eceae2");
    Shell.uiText(c, "OIL " + Math.round(oilLen() / 12) + " FT", 8, 60, 10, "#3ff0ff");
    Shell.uiText(c, bumpersUp() ? "BUMPERS UP" : "GUTTERS LIVE", 82, 60, 10, bumpersUp() ? "#ffd23f" : "#ff3fa4");
    // pin diagram (standing pins solid, down pins hollow)
    for (i = 0; i < 10; i++) {
      var sp = SPOTS[i], px = 296 + sp[0] * 1.45, py = 68 - sp[1] * 0.72;
      var p = null;
      for (var j = 0; j < S.pins.length; j++) if (S.pins[j].i === i) p = S.pins[j];
      var up = p && p.st === "up";
      if (up) fr(c, px - 2.5, py - 2.5, 5, 5, "#eceae2");
      else { c.strokeStyle = "#5a5f70"; c.strokeRect(px - 2, py - 2, 4, 4); }
    }
    Shell.text(c, String(total()), 352, 50, 8, "#ffd23f", "right");
  }

  function draw(c, state) {
    var t = (state === "title" || state === "over") ? idleT : S.t;
    drawAlley(c, t);
    var objs = S.pins.slice();
    if (S.b) objs.push({ ball: true, y: S.b.y, b: S.b });
    else if (S.phase === "aim" || S.phase === "sweep") objs.push({ ball: true, y: START_Y, b: { x: S.pos, y: START_Y, roll: 0 } });
    objs.sort(function (a, b) { return b.y - a.y; });
    // sweep rake
    for (var i = 0; i < objs.length; i++) {
      if (objs[i].ball) drawBall(c, objs[i].b); else drawPin(c, objs[i]);
    }
    if (S.phase === "sweep") {
      var k = clamp(S.pt / 0.38, 0, 1), ry = HEAD_Y - 12 + k * 70;
      var a = proj(-KICK, ry, 14), b = proj(KICK, ry, 6);
      fr(c, a.x, a.y, b.x - a.x, Math.max(3, b.y - a.y), "rgba(29,32,41,.92)");
    }
    for (i = 0; i < parts.length; i++) fr(c, parts[i].x, parts[i].y, 3, 3, parts[i].c);
    drawHUD(c);
    if (state === "playing" && S.phase === "aim") drawAim(c);
  }

  // Hook for automated checks (no effect on play)
  window.__tapePins = { S: function () { return S; }, rack: fullRack, throwBall: throwBall, scores: scores, step: step, resolve: resolveBall };

  Shell.init({
    slug: "tape-pin-lanes",
    title: "TAPE PIN LANES",
    accent: "#a77bff",
    width: W, height: H,
    format: function (n) { return String(n); },
    howTo: "Ten frames, and the pins are stacked VHS tapes. Drag sideways to line up, then flick up to roll. Flick a little left or right to hook it.",
    keys: "Keys: left and right move, up and down set the hook, hold Space for power, release to roll. P pause, M mute, R restart.",
    tip: "Watch the shiny oil. The ball only hooks once it's past it.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { keys = {}; S.drag = null; S.charging = false; }
  });
})();
