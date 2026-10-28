/* PILLOWCASE PANIC: trick-or-treat until the 9:00 PM curfew.
   Slide the kid along the sidewalk, catch the candy, dodge the duds.
   Logical canvas 360 x 540. Seconds and logical pixels. */
(function () {
  "use strict";
  var W = 360, H = 540, TAU = Math.PI * 2;
  var NIGHT = 80;                 // seconds from 7:30 PM to 9:00 PM curfew
  var RIPS = 3;                   // duds the pillowcase can take
  var CATCH_Y = 446, GROUND_Y = 500, KID_Y = 452;
  var HOUSES = [45, 135, 225, 315], DOOR_Y = 150;
  var PTS = { chew: 10, corn: 10, pop: 15, mini: 20, full: 100 };
  var DUD = { brush: "DENTIST HOUSE", penny: "A PENNY?", raisin: "RAISINS. AGAIN.", tp: "TP'D!" };
  var WRAP = ["#ff3fa4", "#3ff0ff", "#9bff3f", "#a77bff", "#ffd23f", "#ff4b3e"];
  var ORANGE = "#ff8a1f";
  var Sh = window.Shell;

  var S = {}, keys = {}, idleT = 0, parts = [], floats = [], stars = [], bats = [];
  var dbg = /[?&]debug=1/.test(location.search);
  (function () {
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < 46; i++) stars.push({ x: rnd() * W, y: 26 + rnd() * 70, p: rnd() * TAU, s: rnd() < 0.2 ? 2 : 1 });
  })();

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function comma(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function mult(c) { return Math.min(5, 1 + Math.floor(c / 8)); }
  function R() { return window.NPRewards; }
  function T() { return window.Trophies; }
  function unlock(id) { if (T()) T().unlock(id); }

  function reset() {
    S = { t: 0, x: W / 2, tx: W / 2, vx: 0, score: 0, pieces: 0, full: 0, combo: 0, bestCombo: 0, rips: 0,
          duds: 0, glowT: 0, glows: 0, pins: 0, spawnT: 0.9, items: [], lights: [1, 1, 1, 1], lightT: [6, 9, 13, 17],
          doorT: [0, 0, 0, 0], ended: false, endT: 0, curfew: false, lastMult: 1, warned: false, ripT: 0, wob: 0 };
    parts.length = 0; floats.length = 0; bats.length = 0; keys = {};
  }

  /* ---------------- Spawning ---------------- */
  function prog() { return clamp(S.t / NIGHT, 0, 1); }
  function pickType() {
    var p = prog(), r = Math.random();
    if (S.glowT <= 0 && S.t > 8 && r < 0.014) return "glow";
    r = Math.random();
    if (S.rips > 0 && r < 0.03) return "pin";
    r = Math.random();
    if (r < 0.03) return "full";
    if (Math.random() < lerp(0.13, 0.27, p)) { var d = ["brush", "penny", "raisin", "tp"]; return d[(Math.random() * d.length) | 0]; }
    r = Math.random();
    return r < 0.36 ? "chew" : r < 0.6 ? "corn" : r < 0.82 ? "pop" : "mini";
  }
  function spawn() {
    var open = [];
    for (var i = 0; i < 4; i++) if (S.lights[i]) open.push(i);
    if (!open.length) open = [0, 1, 2, 3];
    var h = open[(Math.random() * open.length) | 0], type = pickType(), p = prog();
    var x0 = HOUSES[h] + (Math.random() * 2 - 1) * 8;
    var tx = clamp(x0 + (Math.random() * 2 - 1) * lerp(70, 130, p), 22, W - 22);
    var g = lerp(120, 210, p) * (type === "full" ? 0.8 : type === "tp" ? 0.9 : 1);
    var fall = CATCH_Y - DOOR_Y, tt = Math.sqrt(2 * fall / g) * 0.9;
    S.items.push({ type: type, x: x0, y: DOOR_Y, vx: (tx - x0) / tt, vy: -30 - Math.random() * 30, g: g, rot: Math.random() * TAU,
                   vr: (Math.random() * 2 - 1) * 5, c: WRAP[(Math.random() * WRAP.length) | 0], r: type === "full" ? 14 : 9, py: DOOR_Y, dud: !!DUD[type] });
    S.doorT[h] = 0.25;
  }

  /* ---------------- Update ---------------- */
  function catchW() { return S.glowT > 0 ? 86 : 50; }

  function update(dt) {
    S.t += dt;
    var p = prog();
    if (S.ended) { S.endT += dt; tick(dt); if (S.endT > 1.1) finish(); return; }

    // Movement: follow the finger (or mouse), arrows for keys
    var k = (keys.ArrowLeft || keys.KeyA ? -1 : 0) + (keys.ArrowRight || keys.KeyD ? 1 : 0);
    if (k) S.tx = clamp(S.tx + k * 380 * dt, 24, W - 24);
    var dx = S.tx - S.x, mv = clamp(dx, -1500 * dt, 1500 * dt);
    S.x += mv; S.vx = mv / Math.max(dt, 1e-4);
    S.wob += Math.abs(mv) * 0.08;

    // Porch lights: a house goes dark for a few seconds now and then
    for (var i = 0; i < 4; i++) {
      S.lightT[i] -= dt; S.doorT[i] = Math.max(0, S.doorT[i] - dt);
      if (S.lightT[i] <= 0) {
        var lit = 0; for (var q = 0; q < 4; q++) lit += S.lights[q];
        if (S.lights[i] && lit > 2) { S.lights[i] = 0; S.lightT[i] = 2.5 + Math.random() * 2.5; }
        else { S.lights[i] = 1; S.lightT[i] = 7 + Math.random() * 9; }
      }
    }

    S.spawnT -= dt;
    if (S.spawnT <= 0) {
      spawn();
      if (p > 0.55 && Math.random() < lerp(0, 0.35, (p - 0.55) / 0.45)) spawn();
      S.spawnT = lerp(0.78, 0.4, p) * (0.75 + Math.random() * 0.5);
    }
    S.glowT = Math.max(0, S.glowT - dt);
    S.ripT = Math.max(0, S.ripT - dt);

    var cw = catchW() / 2;
    for (i = S.items.length - 1; i >= 0; i--) {
      var it = S.items[i];
      it.py = it.y;
      it.vy += it.g * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.rot += it.vr * dt;
      if (it.x < 10) { it.x = 10; it.vx = Math.abs(it.vx); } else if (it.x > W - 10) { it.x = W - 10; it.vx = -Math.abs(it.vx); }
      // Glow stick: candy drifts toward the bag
      if (S.glowT > 0 && !it.dud && it.y > 300) it.x += clamp(S.x - it.x, -1, 1) * 70 * dt;
      if (it.py < CATCH_Y && it.y >= CATCH_Y && Math.abs(it.x - S.x) <= cw + it.r * 0.5) { S.items.splice(i, 1); got(it); if (S.ended) break; continue; }
      if (it.y > GROUND_Y) { S.items.splice(i, 1); missed(it); }
    }
    tick(dt);

    // Bats now and then
    if (Math.random() < dt * 0.12) bats.push({ x: -20, y: 30 + Math.random() * 60, v: 60 + Math.random() * 50, p: 0 });

    var left = NIGHT - S.t;
    if (!S.warned && left <= 10) { S.warned = true; Sh.flash("10 MINUTES TO CURFEW", "Streetlights are on", "#ffd23f", 1200); Sh.tone(660, 0.12, "square", 0.2); Sh.tone(660, 0.12, "square", 0.2, 0, 0.2); }
    if (left <= 0) { S.curfew = true; endNight(); }
  }

  function tick(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var q = parts[i]; q.t += dt;
      if (q.t >= q.life) { parts.splice(i, 1); continue; }
      q.vy += 260 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
    }
    for (i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; floats[i].y -= 34 * dt; if (floats[i].t > 0.9) floats.splice(i, 1); }
    for (i = bats.length - 1; i >= 0; i--) { bats[i].x += bats[i].v * dt; bats[i].p += dt * 14; if (bats[i].x > W + 20) bats.splice(i, 1); }
  }

  function sparkle(x, y, n, cols) {
    if (Sh.reduced) n = Math.min(n, 4);
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = 60 + Math.random() * 150;
      parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.5 + Math.random() * 0.4, c: cols[i % cols.length], s: Math.random() < 0.3 ? 3 : 2 });
    }
  }
  function pop(text, x, y, c, big) { floats.push({ s: text, x: x, y: y, c: c, t: 0, big: !!big }); }

  function got(it) {
    var t = it.type;
    if (it.dud) return dud(it);
    if (t === "glow") {
      S.glowT = 7; S.glows++;
      Sh.flash("GLOW STICK!", "Bigger bag for 7 seconds", "#9bff3f", 1000);
      Sh.tone(520, 0.3, "sine", 0.22, 1400);
      sparkle(S.x, CATCH_Y, 18, ["#9bff3f", "#eceae2"]);
      unlock("pp-glow");
      return;
    }
    if (t === "pin") {
      S.pins++;
      if (S.rips > 0) S.rips--;
      Sh.flash("SAFETY PIN", "Mom patched the rip", "#eceae2", 1000);
      Sh.tone(1200, 0.06, "square", 0.18); Sh.tone(1600, 0.1, "square", 0.18, 0, 0.06);
      sparkle(S.x, CATCH_Y, 12, ["#d8d6cf", "#eceae2"]);
      unlock("pp-pin");
      return;
    }
    S.combo++; S.pieces++;
    if (S.combo > S.bestCombo) S.bestCombo = S.combo;
    var m = mult(S.combo), pts = PTS[t] * m;
    S.score += pts;
    if (t === "full") {
      S.full++;
      Sh.flash("FULL SIZE!", S.full > 1 ? S.full + " full size bars tonight" : "Best house on the block", "#ffd23f", 1100);
      Sh.sfx("best"); Sh.shake(3, 0.2);
      sparkle(S.x, CATCH_Y, 26, ["#ffd23f", "#fff3b0", ORANGE]);
      pop("+" + pts, S.x, CATCH_Y - 26, "#ffd23f", true);
      unlock("pp-full");
      if (S.full >= 4) unlock("pp-full4");
    } else {
      var f = 700 + Math.min(S.combo, 40) * 18;
      Sh.tone(f, 0.05, "square", 0.16); Sh.tone(f * 1.5, 0.07, "triangle", 0.12, 0, 0.04);
      sparkle(S.x, CATCH_Y, 6, [it.c, "#eceae2"]);
      pop("+" + pts, S.x + (Math.random() * 16 - 8), CATCH_Y - 20, m >= 4 ? ORANGE : m >= 2 ? "#3ff0ff" : "#eceae2");
    }
    if (m > S.lastMult) {
      S.lastMult = m;
      var lab = ["", "", "SUGAR RUSH x2", "SUGAR HIGH x3", "SUGAR STORM x4", "SUGAR COMET x5"][m];
      if (R()) R().streak(m + 1, lab, m >= 5 ? "#ff4b3e" : m >= 4 ? ORANGE : m >= 3 ? "#ffd23f" : "#3ff0ff");
      Sh.sfx("boost");
    }
    if (S.combo === 25 || S.combo === 40 || S.combo === 60 || S.combo === 80) { if (R()) R().streak(S.combo, S.combo + " IN A ROW!", "#ff3fa4"); }
    if (S.combo >= 12) unlock("pp-combo12");
    if (S.combo >= 50) unlock("pp-combo50");
  }

  function dud(it) {
    S.rips++; S.duds++; S.ripT = 0.6;
    var lost = S.combo; S.combo = 0; S.lastMult = 1;
    Sh.flash(DUD[it.type], S.rips >= RIPS ? "The pillowcase gave out" : (RIPS - S.rips) + (RIPS - S.rips === 1 ? " rip left" : " rips left"), "#ff4b3e", 1000);
    Sh.sfx("buzzer"); Sh.shake(6, 0.3);
    sparkle(S.x, CATCH_Y, 10, ["#8e93a2", "#ff4b3e"]);
    if (lost >= 8) pop("COMBO LOST", S.x, CATCH_Y - 34, "#ff4b3e");
    if (S.rips >= RIPS) { S.curfew = false; endNight(); }
  }

  function missed(it) {
    if (it.dud) { pop("DODGED", it.x, GROUND_Y - 14, "#8e93a2"); return; }
    if (it.type === "glow" || it.type === "pin") return;
    if (S.combo >= 8) { pop("DROPPED", it.x, GROUND_Y - 14, "#ff4b3e"); Sh.sfx("miss"); }
    else Sh.tone(240, 0.08, "triangle", 0.12, 160);
    S.combo = 0; S.lastMult = 1;
  }

  function endNight() {
    if (S.ended) return;
    S.ended = true; S.endT = 0; S.items.length = 0;
    if (S.curfew) {
      var bonus = 300 + (RIPS - S.rips) * 200;
      S.bonus = bonus; S.score += bonus;
      Sh.flash("HOME BY CURFEW", "+" + comma(bonus) + " curfew bonus", "#9bff3f", 1200);
      Sh.sfx("crowd");
    } else {
      S.bonus = 0;
      Sh.sfx("over");
    }
  }

  function finish() {
    if (S.done) return;
    S.done = true;
    var stats = { score: S.score, pieces: S.pieces, full: S.full, bestCombo: S.bestCombo, rips: S.rips, duds: S.duds, curfew: S.curfew, glows: S.glows, pins: S.pins };
    var html = '<p class="np-extra">' + S.pieces + ' pieces | best combo ' + S.bestCombo + ' | full size ' + S.full +
      (S.curfew ? ' | curfew bonus +' + comma(S.bonus) : '') + '</p>';
    Sh.gameOver(S.score, { title: S.curfew ? "HOME BY CURFEW" : "PILLOWCASE BUSTED", html: html, stats: stats });
  }

  /* ---------------- Input ---------------- */
  function pointer(type, x) {
    if (type === "down" || type === "move") S.tx = clamp(x, 24, W - 24);
  }
  function key(type, code) { keys[code] = type === "down"; }

  /* ---------------- Drawing ---------------- */
  function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }

  function drawScene(c, t, lights, doorT) {
    // Sky
    var g = c.createLinearGradient(0, 0, 0, 170);
    g.addColorStop(0, "#0a0a1e"); g.addColorStop(1, "#2a1640");
    c.fillStyle = g; c.fillRect(0, 0, W, 170);
    for (var i = 0; i < stars.length; i++) { var s = stars[i]; if (Math.sin(t * 2 + s.p) > -0.3) rect(c, s.x, s.y, s.s, s.s, "#cfd3e6"); }
    // Moon
    c.fillStyle = "#f4e7b8"; c.beginPath(); c.arc(300, 50, 20, 0, TAU); c.fill();
    c.fillStyle = "#e0d098"; c.beginPath(); c.arc(293, 45, 4, 0, TAU); c.arc(306, 58, 3, 0, TAU); c.fill();
    // Bats
    for (i = 0; i < bats.length; i++) { var b = bats[i], f = Math.sin(b.p) > 0 ? -3 : 2; c.fillStyle = "#06060f"; c.beginPath(); c.moveTo(b.x - 7, b.y + f); c.lineTo(b.x, b.y + 2); c.lineTo(b.x + 7, b.y + f); c.lineTo(b.x, b.y - 1); c.fill(); }
    // Far trees
    c.fillStyle = "#140d22";
    for (i = 0; i < 9; i++) { c.beginPath(); c.arc(i * 44 + 10, 120, 26, 0, TAU); c.fill(); }
    // Houses
    var roof = ["#4a2a3a", "#2f3a4a", "#4a3a26", "#2a4436"], wall = ["#6b3f52", "#43566b", "#6b5636", "#3d6350"];
    for (i = 0; i < 4; i++) {
      var hx = HOUSES[i], on = lights ? lights[i] : 1;
      rect(c, hx - 36, 104, 72, 58, wall[i]);
      c.fillStyle = roof[i]; c.beginPath(); c.moveTo(hx - 42, 106); c.lineTo(hx, 74); c.lineTo(hx + 42, 106); c.fill();
      // windows
      var wc = on ? "#ffcf5a" : "#1b1626";
      rect(c, hx - 28, 114, 14, 12, wc); rect(c, hx + 14, 114, 14, 12, wc);
      rect(c, hx - 22, 114, 2, 12, wall[i]); rect(c, hx + 20, 114, 2, 12, wall[i]);
      // door
      var open = doorT && doorT[i] > 0;
      rect(c, hx - 8, 132, 16, 30, open ? "#ffe39a" : "#2a1a12");
      if (!open) rect(c, hx + 3, 146, 2, 2, "#ffd23f");
      // porch light
      if (on) {
        c.fillStyle = "rgba(255,207,90,.16)"; c.beginPath(); c.arc(hx + 14, 136, 16, 0, TAU); c.fill();
        rect(c, hx + 12, 133, 4, 5, "#fff1b0");
      } else rect(c, hx + 12, 133, 4, 5, "#3a3346");
      // jack-o-lantern on the step
      drawPumpkin(c, hx - 22, 156, 7, on, t + i);
      // Porch dad silhouette when the light goes out
      if (!on) { rect(c, hx - 5, 138, 10, 24, "#0d0a14"); rect(c, hx - 4, 133, 8, 7, "#0d0a14"); }
    }
    // Lawn
    var lg = c.createLinearGradient(0, 162, 0, 470);
    lg.addColorStop(0, "#14301f"); lg.addColorStop(1, "#0e2216");
    c.fillStyle = lg; c.fillRect(0, 162, W, 308);
    // Front walks
    for (i = 0; i < 4; i++) { c.fillStyle = "#2b2f38"; c.beginPath(); c.moveTo(HOUSES[i] - 8, 162); c.lineTo(HOUSES[i] + 8, 162); c.lineTo(HOUSES[i] + 22, 470); c.lineTo(HOUSES[i] - 22, 470); c.fill(); }
    // TP'd tree on the left lawn and a fence on the right, purely for looks
    rect(c, 4, 210, 6, 70, "#3a2616");
    c.fillStyle = "#0f2a18"; c.beginPath(); c.arc(7, 205, 26, 0, TAU); c.fill();
    c.strokeStyle = "#e9e6dc"; c.lineWidth = 2; c.beginPath(); c.moveTo(-10, 196); c.quadraticCurveTo(10, 240, 22, 214); c.moveTo(0, 186); c.quadraticCurveTo(26, 230, 30, 200); c.stroke();
    for (i = 0; i < 4; i++) rect(c, 336 + i * 7, 232, 4, 24, "#d8d6cf");
    rect(c, 334, 238, 26, 3, "#d8d6cf");
    // Sidewalk + curb
    rect(c, 0, 470, W, 70, "#3a3e4a");
    for (i = 0; i < W; i += 60) rect(c, i, 470, 2, 70, "#2c3040");
    rect(c, 0, 470, W, 3, "#555a68");
  }

  function drawPumpkin(c, x, y, r, lit, t) {
    c.fillStyle = "#e0662a"; c.beginPath(); c.ellipse(x, y, r * 1.2, r, 0, 0, TAU); c.fill();
    rect(c, x - 1, y - r - 3, 2, 4, "#3d6b2a");
    var glow = lit ? (Math.sin(t * 9) > -0.6 ? "#ffd23f" : "#ffb02a") : "#5a2a10";
    rect(c, x - r * 0.6, y - 2, 3, 3, glow); rect(c, x + r * 0.6 - 3, y - 2, 3, 3, glow);
    rect(c, x - r * 0.5, y + 2, r, 2, glow);
  }

  function drawItem(c, it) {
    c.save(); c.translate(it.x, it.y);
    var t = it.type;
    if (t !== "full") c.scale(1.3, 1.3);   // reads better on a 360 px phone
    if (t !== "full" && t !== "glow") c.rotate(it.rot);
    if (t === "chew") {
      rect(c, -6, -4, 12, 8, it.c); rect(c, -6, -4, 12, 2, "rgba(255,255,255,.35)");
      c.fillStyle = it.c; c.beginPath(); c.moveTo(-6, 0); c.lineTo(-11, -4); c.lineTo(-11, 4); c.fill(); c.beginPath(); c.moveTo(6, 0); c.lineTo(11, -4); c.lineTo(11, 4); c.fill();
    } else if (t === "corn") {
      c.fillStyle = "#f6f4ee"; c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(-6, 7); c.fill();
      c.fillStyle = ORANGE; c.beginPath(); c.moveTo(-4, 1); c.lineTo(4, 1); c.lineTo(6, 7); c.lineTo(-6, 7); c.fill();
      rect(c, -6, 5, 12, 3, "#ffd23f");
    } else if (t === "pop") {
      rect(c, -1, 2, 2, 10, "#eceae2");
      c.fillStyle = it.c; c.beginPath(); c.arc(0, -2, 7, 0, TAU); c.fill();
      c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = 1.5; c.beginPath(); c.arc(0, -2, 3.5, 0.5, 4); c.stroke();
    } else if (t === "mini") {
      rect(c, -8, -5, 16, 10, "#5a3418"); rect(c, -8, -5, 16, 4, it.c); rect(c, -3, -1, 6, 2, "#f6f4ee");
    } else if (t === "full") {
      var gl = 0.5 + 0.5 * Math.sin(S.t * 10);
      c.fillStyle = "rgba(255,210,63," + (0.18 + gl * 0.2) + ")"; c.beginPath(); c.arc(0, 0, 22, 0, TAU); c.fill();
      c.rotate(Math.sin(it.rot) * 0.3);
      rect(c, -16, -8, 32, 16, "#ffd23f"); rect(c, -16, -8, 32, 3, "#fff3b0"); rect(c, -16, 5, 32, 3, "#c79a1c");
      rect(c, -10, -3, 20, 6, "#5a3418");
      c.font = '5px "Press Start 2P", monospace'; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#ffd23f"; c.fillText("FULL", 0, 0.5);
    } else if (t === "brush") {
      rect(c, -12, -2, 20, 4, "#eceae2"); rect(c, 6, -5, 7, 3, "#3ff0ff"); rect(c, 6, -2, 7, 1, "#9bdcff");
    } else if (t === "penny") {
      c.fillStyle = "#b8642a"; c.beginPath(); c.arc(0, 0, 7, 0, TAU); c.fill();
      c.strokeStyle = "#e09a5a"; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 4.5, 0, TAU); c.stroke();
    } else if (t === "raisin") {
      rect(c, -6, -8, 12, 16, "#c0262a"); rect(c, -4, -5, 8, 6, "#f0d080");
      rect(c, -2, -3, 2, 2, "#5a2a5a"); rect(c, 1, -2, 2, 2, "#5a2a5a");
    } else if (t === "tp") {
      rect(c, -7, -7, 14, 14, "#f6f4ee"); rect(c, -2, -2, 4, 4, "#8e93a2");
      c.strokeStyle = "#f6f4ee"; c.lineWidth = 2; c.beginPath(); c.moveTo(7, 4); c.quadraticCurveTo(16, 12, 10, 22); c.stroke();
    } else if (t === "glow") {
      c.rotate(0.6);
      c.fillStyle = "rgba(155,255,63,.3)"; c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.fill();
      rect(c, -3, -11, 6, 22, "#9bff3f"); rect(c, -1, -9, 2, 18, "#eaffd0");
    } else if (t === "pin") {
      c.strokeStyle = "#d8d6cf"; c.lineWidth = 2; c.beginPath(); c.moveTo(-8, 3); c.lineTo(8, 3); c.moveTo(-8, -1); c.lineTo(7, -1); c.stroke();
      rect(c, 7, -3, 4, 8, "#ffd23f"); c.beginPath(); c.arc(-8, 1, 2, 0, TAU); c.stroke();
    }
    c.restore();
    if (it.dud && it.y > DOOR_Y + 10) { // small red tag so duds read on a phone
      c.fillStyle = "rgba(255,75,62,.85)"; c.font = '6px "Press Start 2P", monospace'; c.textAlign = "center"; c.textBaseline = "bottom"; c.fillText("X", it.x, it.y - 11); }
  }

  function drawKid(c, x, t, moving) {
    var bob = moving ? Math.round(Math.sin(S.wob) * 1.5) : 0, y = KID_Y + bob;
    // shadow
    c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(x, 500, 22, 5, 0, 0, TAU); c.fill();
    // sneakers
    rect(c, x - 11, 494, 8, 5, "#ff4b3e"); rect(c, x + 3, 494, 8, 5, "#ff4b3e");
    rect(c, x - 11, 497, 8, 2, "#eceae2"); rect(c, x + 3, 497, 8, 2, "#eceae2");
    // sheet ghost costume
    c.fillStyle = "#eceae2";
    c.beginPath(); c.moveTo(x - 16, 494); c.lineTo(x - 15, y + 4); c.quadraticCurveTo(x - 15, y - 22, x, y - 24); c.quadraticCurveTo(x + 15, y - 22, x + 15, y + 4); c.lineTo(x + 16, 494);
    for (var k = 3; k >= -3; k--) c.lineTo(x + k * 5 + (k % 2 ? 0 : 2), k % 2 ? 490 : 495);
    c.fill();
    rect(c, x - 7, y - 14, 4, 5, "#101219"); rect(c, x + 3, y - 14, 4, 5, "#101219");
    // pillowcase (open top = catch line)
    var cw = catchW(), half = cw / 2, rip = S.ripT > 0 && Math.sin(t * 60) > 0;
    var bag = S.glowT > 0 ? "#d6ffd0" : "#f3efe2";
    rect(c, x - half, CATCH_Y, cw, 34, rip ? "#ff8a80" : bag);
    for (var s = 0; s < cw; s += 8) rect(c, x - half + s, CATCH_Y + 6, 4, 26, S.glowT > 0 ? "#b5f5a0" : "#e1dccb");
    rect(c, x - half - 2, CATCH_Y - 2, cw + 4, 4, "#ffffff");
    rect(c, x - half + 4, CATCH_Y - 1, cw - 8, 2, "#2a2d38");
    // candy peeking out once it is a good haul
    if (S.pieces > 10) { rect(c, x - 6, CATCH_Y - 4, 5, 3, "#ff3fa4"); rect(c, x + 2, CATCH_Y - 5, 5, 4, "#ffd23f"); }
    if (S.pieces > 40) { rect(c, x - 14, CATCH_Y - 4, 6, 3, "#3ff0ff"); rect(c, x + 9, CATCH_Y - 4, 4, 3, "#9bff3f"); }
    // rips
    for (var r = 0; r < S.rips; r++) { var rx = x - half + 8 + r * (cw - 16) / 2; c.strokeStyle = "#101219"; c.lineWidth = 2; c.beginPath(); c.moveTo(rx, CATCH_Y + 14); c.lineTo(rx + 4, CATCH_Y + 20); c.lineTo(rx - 2, CATCH_Y + 25); c.stroke(); }
    if (S.glowT > 0) { c.strokeStyle = "rgba(155,255,63," + (0.4 + 0.3 * Math.sin(t * 12)) + ")"; c.lineWidth = 2; c.strokeRect(x - half - 4, CATCH_Y - 4, cw + 8, 40); }
  }

  function clock(t) {
    var mins = Math.min(90, Math.floor(t / NIGHT * 90)), h = 7 + Math.floor((30 + mins) / 60), m = (30 + mins) % 60;
    return h + ":" + (m < 10 ? "0" : "") + m + " PM";
  }

  function hud(c, t) {
    rect(c, 0, 0, W, 22, "rgba(5,5,12,.7)");
    Sh.text(c, comma(S.score), 8, 7, 10, "#ffd23f");
    var left = NIGHT - S.t;
    Sh.text(c, clock(S.t), W / 2, 7, 8, left < 10 && Math.sin(t * 10) > 0 ? "#ff4b3e" : "#eceae2", "center");
    for (var i = 0; i < RIPS; i++) {
      var ok = i < RIPS - S.rips, x = W - 14 - i * 14;
      rect(c, x - 5, 5, 10, 12, ok ? "#f3efe2" : "#3a3e4a"); rect(c, x - 5, 5, 10, 2, ok ? "#ffffff" : "#2c3040");
      if (!ok) { c.strokeStyle = "#ff4b3e"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - 4, 7); c.lineTo(x + 4, 16); c.stroke(); }
    }
    // VHS overlay
    if (Math.sin(t * 4) > -0.2) { c.fillStyle = "#ff4b3e"; c.beginPath(); c.arc(12, 32, 3, 0, TAU); c.fill(); }
    Sh.uiText(c, "REC", 19, 27, 8, "#eceae2");
    Sh.uiText(c, "OCT 31", W - 8, 27, 8, "#eceae2", "right");
    var m = mult(S.combo);
    if (S.combo >= 2) Sh.text(c, "x" + m + "  " + S.combo, S.x, 418, 8, m >= 4 ? ORANGE : m >= 2 ? "#3ff0ff" : "#eceae2", "center");
    // combo meter toward next multiplier
    if (m < 5) { var k = (S.combo % 8) / 8; rect(c, S.x - 20, 430, 40, 3, "#2c3040"); rect(c, S.x - 20, 430, 40 * k, 3, m >= 3 ? ORANGE : "#3ff0ff"); }
  }

  function draw(c, state) {
    var t = state === "playing" ? S.t : idleT;
    drawScene(c, t, state === "playing" || state === "paused" || state === "over" ? S.lights : null, S.doorT);
    if (state === "playing" || state === "paused") {
      for (var i = 0; i < S.items.length; i++) drawItem(c, S.items[i]);
      drawKid(c, S.x, t, Math.abs(S.vx) > 20);
      for (i = 0; i < parts.length; i++) { var q = parts[i]; c.globalAlpha = Math.max(0, 1 - q.t / q.life); rect(c, q.x, q.y, q.s, q.s, q.c); }
      c.globalAlpha = 1;
      for (i = 0; i < floats.length; i++) { var f = floats[i]; c.globalAlpha = Math.max(0, 1 - f.t / 0.9); Sh.text(c, f.s, f.x, f.y, f.big ? 12 : 8, f.c, "center"); }
      c.globalAlpha = 1;
      hud(c, t);
      if (S.t < 1.6) { Sh.text(c, "PLAY >", 14, 44, 10, "#eceae2"); if (Math.random() < 0.5) rect(c, 0, 200 + Math.random() * 200, W, 2, "rgba(255,255,255,.12)"); }
      if (S.ended && S.curfew) { c.fillStyle = "rgba(255,210,63," + Math.min(0.25, S.endT * 0.3) + ")"; c.fillRect(0, 0, W, H); }
    } else {
      // Title / game over backdrop: a few treats drifting down, kid in the middle
      for (i = 0; i < 6; i++) {
        var yy = ((idleT * 40 + i * 83) % 300) + 160, it = { type: ["chew", "corn", "pop", "mini", "full", "corn"][i], x: 40 + i * 56, y: yy, rot: idleT * 2 + i, c: WRAP[i], r: 9 };
        drawItem(c, it);
      }
      var sx = S.x; S.x = W / 2; drawKid(c, W / 2, idleT, false); S.x = sx;
    }
  }

  if (dbg) window.PP_DEBUG = { state: function () { return S; }, setT: function (t) { S.t = t; } };

  Sh.init({
    slug: "pillowcase-panic",
    title: "PILLOWCASE PANIC",
    accent: ORANGE,
    width: W, height: H,
    format: function (n) { return comma(n) + " PTS"; },
    howTo: "It's Halloween night and curfew is 9:00 PM. Slide your ghost left and right to catch candy in the pillowcase. Dodge the duds: toothbrushes, pennies, raisins and TP. Three duds and the pillowcase rips open.",
    keys: "Drag or move the mouse anywhere. Keys: left and right arrows (or A and D). P pause, M mute, R restart.",
    tip: "Catch 8 in a row for x2, all the way up to x5. FULL SIZE bars are worth 100.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; tick(dt); },
    onPause: function () { keys = {}; }
  });
})();
