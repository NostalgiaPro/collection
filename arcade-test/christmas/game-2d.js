/* MALL SANTA DASH '94: LAYAWAY BLITZ (seasonal: christmas)
   Christmas Eve, 1994, 5:58 PM at the Mistletoe Mile Mall. Run the concourse and reach the toy store
   gate before the security gates come down, grab the last Ultra-Bot action figure, and print the receipt.

   Three lanes, pseudo 3D. World distance z runs down the concourse; the runner stays at z = S.z.
   Bumps never end the run. They cost 3 seconds off the 90 second closing clock and break the streak.
   Tuned easy: the food court is slow and roomy, the speed-up is gentle, low things can be jumped,
   and a clean run reaches the gate with about 35 seconds to spare (about 11 bumps of slack). */
(function () {
  "use strict";
  var W = 360, H = 540, TAU = Math.PI * 2;
  var HY = 150, BY = 470, D = 300, LANE = 100, CX = 180, EDGE = 168;   // projection
  var LEN = 19600, V0 = 290, V1 = 420, CLOCK = 90, BUMP = 3, INV = 1.0;
  var LANE_T = 0.12, JUMP_T = 0.6, JUMP_H = 72, LOW_CLEAR = 20, AIR_GRAB = 38;
  var P1 = 0.32, P2 = 0.62;                        // phase boundaries (fraction of the course)
  var ESC = { z: LEN * 0.585, len: 1150 }, FOUNTAIN_Z = LEN * 0.83;
  var TIME_BONUS = 400;                            // points per second left on the clock at the gate
  var CALLOUTS = ["BARGAIN HUNTER!", "BLACK BELT SHOPPER!", "MAXIMUM ALLOWANCE!", "DOORBUSTER DYNAMO!", "LAYAWAY LEGEND!"];
  var BUMP_LINES = ["Excuse me, ma'am!", "Watch the bags!", "Sorry, sir!", "Pardon the elbows!", "Coming through!"];
  var COMBO = ["ULTRA-BOT", "JET PACK", "LASER ARM", "BATTLE BASE", "BATTERIES"];
  var PTS = { coin: 50, sample: 75, bag: 100, slip: 150, box: 250, piece: 500, token: 2500 };
  var SHOES = [
    { id: "plain", name: "Plain Sneakers", how: "Ready to go." },
    { id: "strap", name: "Strap High Tops", how: "Reach the toy store gate once." },
    { id: "lightup", name: "Light-Up Sneakers", how: "Grab 300 items across all your runs." },
    { id: "skates", name: "Neon Inline Skates", how: "Reach the gate with 25 or more seconds left." }
  ];

  var S = {}, keys = {}, parts = [], idleT = 0, gear = { u: { plain: 1 }, on: "plain", items: 0 }, ptr = null;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function award(id) { if (window.Trophies) Trophies.unlock(id); }

  /* ---------------- Projection ---------------- */
  function sp(z) { return D / (D + Math.max(z, -D * 0.7)); }
  function sy(z) { return HY + (BY - HY) * sp(z); }
  function sx(lane, z) { return CX + (lane - 1) * LANE * sp(z); }

  /* ---------------- Course ---------------- */
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }
  // kind: tall things must be dodged, low things can be jumped
  var KIND = {
    table: { low: false, dep: 26 }, janitor: { low: false, dep: 18 }, sign: { low: true, dep: 14 },
    walker: { low: false, dep: 16 }, stroller: { low: true, dep: 18 }, bin: { low: true, dep: 22 },
    clerk: { low: false, dep: 22 }, mist: { low: false, dep: 34 }, rope: { low: false, dep: 10 },
    cart: { low: false, dep: 24 }, fountain: { low: true, dep: 30 }
  };
  function build(seed) {
    var r = rng(seed), O = [], I = [], z = 900, lastRope = -1;
    function pick(a) { return a[Math.floor(r() * a.length)]; }
    function ob(t, lane, zz, extra) {
      var o = { t: t, lane: lane, lp: lane, z: zz, low: KIND[t].low, dep: KIND[t].dep, span: 0 };
      if (extra) for (var k in extra) o[k] = extra[k];
      O.push(o); return o;
    }
    function covers(o, lane) { return Math.abs(o.lp - lane) < 0.5 || (o.span && Math.abs(o.lp + 1 - lane) < 0.5); }
    function free(lane, zz, rad) {
      for (var k = O.length - 1; k >= 0; k--) { var o = O[k]; if (Math.abs(o.z - zz) < rad + o.dep && covers(o, lane)) return false; }
      return true;
    }
    function line(t, lane, z0, n, step, air) {
      for (var k = 0; k < n; k++) { var zz = z0 + k * step; if (free(lane, zz, 30)) I.push({ t: t, lane: lane, z: zz, air: !!air }); }
    }
    function walkers(lane, zz) {                       // the mall walking club: three in a row in one lane
      for (var w = 0; w < 3; w++) ob("walker", lane, zz + w * 48);
    }
    function inEsc(zz) { return zz > ESC.z - 250 && zz < ESC.z + ESC.len + 350; }

    while (z < LEN - 700) {
      var k = z / LEN, ph = k < P1 ? 0 : k < P2 ? 1 : 2, gap;
      // the escalator stretch: the center lane is the handrail ride, edges get a few easy things
      if (inEsc(z)) {
        if (z < ESC.z + ESC.len) { ob(pick(["walker", "bin", "stroller"]), r() < 0.5 ? 0 : 2, z); line("coin", 1, z + 40, 3, 60); }
        z += 330; continue;
      }
      // the center court fountain: jump through the spray for the hidden token
      if (Math.abs(z - FOUNTAIN_Z) < 200) {
        ob("fountain", 1, FOUNTAIN_Z); I.push({ t: "token", lane: 1, z: FOUNTAIN_Z, air: true });
        line("coin", 0, FOUNTAIN_Z - 60, 3, 60); line("coin", 2, FOUNTAIN_Z - 60, 3, 60);
        z = FOUNTAIN_Z + 380; continue;
      }
      var a = Math.floor(r() * 3), b = (a + 1 + Math.floor(r() * 2)) % 3, c = 3 - a - b, roll = r();
      if (ph === 0) {                                  // THE FOOD COURT: slow, wide, one thing at a time
        gap = 430 + r() * 70;
        if (roll < 0.22) ob("table", a, z);
        else if (roll < 0.38) ob("janitor", a, z);
        else if (roll < 0.54) ob("sign", a, z);
        else if (roll < 0.80) walkers(a, z);
        else { ob("walker", a, z); ob("walker", b, z + 14); }
        if (r() < 0.65) line("sample", b, z + 110, 3, 55); else line("coin", b, z + 100, 4, 55);
        if (r() < 0.35) line("coin", c, z + 200, 3, 55);
      } else if (ph === 1) {                           // DEPARTMENT STORE CUT-THROUGH
        gap = 340 + r() * 60;
        if (roll < 0.5) {
          var edge = r() < 0.5 ? 0 : 2, safe = 2 - edge;     // the clerk sprays her lane and the middle one
          ob("clerk", edge, z); ob("mist", Math.min(edge, 1), z, { span: 1 });
          line(pick(["bag", "coin", "coin"]), safe, z - 40, 3, 55);
        } else if (roll < 0.62) { ob("walker", a, z); ob("walker", b, z + 10); line("coin", c, z + 90, 4, 55); }
        else if (roll < 0.76) { walkers(a, z); line("coin", b, z + 40, 3, 55); gap += 60; }
        else if (roll < 0.88) { ob("bin", a, z); if (r() < 0.5) I.push({ t: "slip", lane: a, z: z, air: true }); line("coin", b, z + 80, 3, 55); }
        else { ob("stroller", a, z); ob("walker", b, z + 6); line(pick(["bag", "coin"]), c, z + 60, 3, 55); }
        if (r() < 0.25) I.push({ t: "box", lane: c, z: z + 200, air: false });
      } else {                                         // CENTER COURT SANTA LINE
        gap = 280 + r() * 50;
        if (roll < 0.08) {                             // one last perfume counter by the center court
          var e2 = r() < 0.5 ? 0 : 2; ob("clerk", e2, z); ob("mist", Math.min(e2, 1), z, { span: 1 }); line("coin", 2 - e2, z - 40, 3, 55);
        } else if (roll < 0.36) {                      // velvet rope weave: 3 or 4 rows, the gap hops one lane at a time
          var gp = lastRope >= 0 ? lastRope : Math.floor(r() * 3), rows = 3 + Math.floor(r() * 2);
          for (var q = 0; q < rows; q++) {
            var zz = z + q * 235;
            if (gp === 0) ob("rope", 1, zz, { span: 1 }); else if (gp === 2) ob("rope", 0, zz, { span: 1 });
            else { ob("rope", 0, zz); ob("rope", 2, zz); }
            I.push({ t: "coin", lane: gp, z: zz, air: false });
            gp = gp === 1 ? (r() < 0.5 ? 0 : 2) : 1;
          }
          lastRope = -1; gap = rows * 235 + 140;
        } else if (roll < 0.52) { ob("cart", a, z, { shifted: false }); line("coin", a, z + 200, 3, 55); gap += 80; }
        else if (roll < 0.64) { ob("walker", a, z); ob("stroller", b, z + 8); line(pick(["bag", "box"]), c, z + 60, 2, 70); }
        else if (roll < 0.76) { walkers(a, z); line("coin", b, z + 40, 3, 55); gap += 60; }
        else { ob(pick(["bin", "stroller"]), a, z); I.push({ t: "slip", lane: a, z: z, air: true }); ob("walker", b, z + 120); line("coin", c, z + 40, 4, 55); }
      }
      z += gap;
    }
    // the five pieces of the catalog combo, one per stretch, in a lane that is clear around it
    var fr = [0.13, 0.31, 0.47, 0.71, 0.92];
    for (var p = 0; p < 5; p++) {
      var pz = LEN * fr[p], placed = false;
      for (var tries = 0; tries < 30 && !placed; tries++) {
        var ln = Math.floor(r() * 3), zz2 = pz + tries * 37;
        if (inEsc(zz2) && ln === 1) continue;
        if (free(ln, zz2, 90)) { I.push({ t: "piece", lane: ln, z: zz2, air: false, idx: p }); placed = true; }
      }
    }
    O.sort(function (x, y) { return x.z - y.z; }); I.sort(function (x, y) { return x.z - y.z; });
    return { O: O, I: I };
  }

  /* ---------------- State ---------------- */
  function reset() {
    var c = build(1 + Math.floor(Math.random() * 2147483000));
    S = { t: 0, z: 0, v: V0, lane: 1, lp: 1, swT: -9, swFrom: 1, jumpT: -1, inv: 0, pen: 0, phase: "run", pt: 0, ph: -1,
          O: c.O, I: c.I, score: 0, items: 0, streak: 0, mult: 1, bumps: 0, samples: 0, pieces: [0, 0, 0, 0, 0],
          walkChain: 0, walkMax: 0, scentMax: 0, walkPassed: 0, nearZ: -999, scentChain: 0, clerks: 0, misted: 0, near: 0, token: false, escRide: 0, esc: false, escDone: false,
          gate: false, left: CLOCK, bonus: 0, tag: null, rec: 0, recLine: "", stepT: 0, stepN: 0, callN: 0, newShoes: [] };
    parts.length = 0;
  }
  function clockLeft() { return Math.max(0, CLOCK - S.t - S.pen); }

  /* ---------------- Update ---------------- */
  function update(dt) {
    S.pt += dt;
    for (var i = parts.length - 1; i >= 0; i--) { var q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 300 * dt; if (q.life <= 0) parts.splice(i, 1); }
    if (S.tag) { S.tag.life -= dt; if (S.tag.life <= 0) S.tag = null; }
    if (S.rec > 0) S.rec -= dt;
    if (S.phase === "receipt") { if (S.pt > 4.4) finish(); return; }
    if (S.phase === "end") { if (S.pt > 1.6) { S.phase = "receipt"; S.pt = 0; } return; }

    S.t += dt;
    var k = clamp(S.z / LEN, 0, 1), ph = k < P1 ? 0 : k < P2 ? 1 : 2;
    if (ph !== S.ph) {
      S.ph = ph;
      if (ph === 0) Shell.flash("THE FOOD COURT", "Gates close at 6:00. Run!", "#ffd23f", 1300);
      else if (ph === 1) Shell.flash("DEPARTMENT STORE", "Perfume counters ahead. Find the clear lane.", "#ff3fa4", 1300);
      else Shell.flash("CENTER COURT", "Santa line. Weave through the ropes.", "#9bff3f", 1300);
    }
    // gentle speed-up, plus the handrail ride
    var onEsc = S.z > ESC.z && S.z < ESC.z + ESC.len && Math.abs(S.lp - 1) < 0.3 && !airborne();
    var target = (V0 + (V1 - V0) * k) * (onEsc ? 2 : 1);
    S.v += (target - S.v) * Math.min(1, dt * (onEsc ? 3 : 1.5));
    escalator(onEsc, dt);
    S.z += S.v * dt;
    if (S.inv > 0) S.inv -= dt;
    if (S.lp !== S.lane) { var st = dt / LANE_T, d = S.lane - S.lp; S.lp = Math.abs(d) <= st ? S.lane : S.lp + Math.sign(d) * st; }
    if (S.jumpT >= 0) { S.jumpT += dt; if (S.jumpT >= JUMP_T) { S.jumpT = -1; step(true); } }
    footsteps(dt);

    // obstacles
    var h = jumpH();
    for (i = 0; i < S.O.length; i++) {
      var o = S.O[i], dz = o.z - S.z;
      if (dz < -60) continue;
      if (dz > 1400) break;
      if (o.t === "cart") cartAI(o, dz, dt);
      if (o.t === "mist") o.on = dz < 640;
      if (!o.passed && dz < -o.dep) passed(o);
      if (o.hit || Math.abs(dz) > o.dep) continue;
      if (!touches(o, S.lp)) continue;
      if (o.low && h > LOW_CLEAR) continue;
      if (o.t === "mist" && !o.on) continue;
      bump(o);
    }
    // items
    for (i = 0; i < S.I.length; i++) {
      var it = S.I[i], iz = it.z - S.z;
      if (iz < -40) continue;
      if (iz > 60) break;
      if (it.got || Math.abs(iz) > 26 || Math.abs(S.lp - it.lane) > 0.45) continue;
      if (it.air ? h < AIR_GRAB : h > 50) continue;
      grab(it);
    }
    S.left = clockLeft();
    if (S.z >= LEN) arrive();
    else if (S.left <= 0) closed();
  }
  function airborne() { return S.jumpT >= 0; }
  function jumpH() { return S.jumpT >= 0 ? Math.sin(Math.PI * S.jumpT / JUMP_T) * JUMP_H : 0; }
  function touches(o, lane) { return Math.abs(o.lp - lane) < 0.5 || (o.span && Math.abs(o.lp + 1 - lane) < 0.5); }

  function cartAI(o, dz, dt) {
    // mall security drifts one lane toward you, once, with the light flashing first
    if (!o.shifted && dz < 620 && dz > 200 && o.lane !== S.lane) {
      o.shifted = true; o.to = o.lane + Math.sign(S.lane - o.lane);
      Shell.tone(1400, 0.07, "square", 0.12); Shell.tone(1400, 0.07, "square", 0.12, 0, 0.14);
    }
    if (o.to != null && o.lp !== o.to) { var d = o.to - o.lp, st = dt / 0.7; o.lp = Math.abs(d) <= st ? o.to : o.lp + Math.sign(d) * st; }
  }
  function escalator(on, dt) {
    if (on && !S.esc) { S.esc = true; Shell.flash("HANDRAIL RIDE!", "Double speed. Stay in the middle.", "#3ff0ff", 900); Shell.sfx("whoosh"); }
    if (on) S.escRide += S.v * dt;
    if (!on && S.esc) {
      S.esc = false;
      if (!S.escDone && S.escRide > ESC.len * 0.8) { S.escDone = true; award("msd-escalator"); }
    }
  }
  function passed(o) {
    o.passed = true;
    if (o.t === "walker") { S.walkPassed++; if (!o.hit) { S.walkChain++; S.walkMax = Math.max(S.walkMax, S.walkChain); if (S.walkChain >= 25) award("msd-walkers"); } }
    if (o.t === "mist") {                  // each perfume counter is judged once its mist is behind you
      S.clerks++;
      if (!o.hit) { S.scentChain++; S.scentMax = Math.max(S.scentMax, S.scentChain); if (S.scentChain >= 5) award("msd-scent"); }
    }
    // near miss: you left this lane a split second before it would have caught you
    if (!o.hit && !o.low && o.t !== "mist" && touches(o, S.swFrom) && !touches(o, S.lane) && S.t - S.swT <= 0.25 && Math.abs(o.z - S.nearZ) > 40) {
      S.near++; add(250, true);
      S.tag = { text: S.near % 2 ? "PRICE CHECK DODGE!" : "CLOSE SHAVE!", life: 0.9 };
      S.nearZ = o.z;
      Shell.tone(1568, 0.05, "square", 0.16); Shell.tone(2093, 0.08, "square", 0.16, 0, 0.05);
    }
  }
  function bump(o) {
    o.hit = true;
    if (o.t === "mist") { S.misted++; S.scentChain = 0; }
    if (o.t === "walker") S.walkChain = 0;
    if (S.inv > 0) return;
    S.bumps++; S.pen += BUMP; S.inv = INV; S.streak = 0; S.mult = 1;
    var line = o.t === "mist" ? "Misted! Smells like a department store." : o.t === "fountain" ? "Splash! Shoes are soaked." : o.t === "cart" ? "Mall security says slow down." : BUMP_LINES[S.bumps % BUMP_LINES.length];
    Shell.flash("BUMP! -" + BUMP + " SEC", line, "#ff4b3e", 800);
    Shell.sfx("hit"); Shell.shake(4, 0.25);
    if (o.t === "mist") Shell.noise(0.5, 0.25, 3000, 0.6, 0, 1200);
  }
  function add(pts, flat) { S.score += flat ? pts : pts * S.mult; }
  function grab(it) {
    it.got = true; S.items++; S.streak++;
    add(PTS[it.t] || 50);
    var x = sx(it.lane, it.z - S.z), y = sy(it.z - S.z) - (it.air ? 60 : 16);
    sparkle(x, y, it.t === "token" ? "#3ff0ff" : "#ffd23f");
    if (it.t === "sample") { S.samples++; if (S.samples >= 10) award("msd-samples"); }
    if (it.t === "token") { S.token = true; award("msd-fountain"); Shell.flash("FOUNTAIN WISH!", "Found the lucky token. +" + PTS.token * S.mult, "#3ff0ff", 1100); Shell.sfx("score"); }
    if (it.t === "piece") {
      S.pieces[it.idx] = 1;
      var n = S.pieces.reduce(function (a, b) { return a + b; }, 0);
      Shell.flash(COMBO[it.idx] + "!", "Catalog combo " + n + " of 5", "#a77bff", 900);
      Shell.sfx("score");
      if (n === 5) award("msd-catalog");
    } else Shell.tone(880 + (S.streak % 5) * 140, 0.05, "square", 0.14);
    if (S.streak % 10 === 0) {
      S.mult = Math.min(5, 1 + S.streak / 10);
      S.recLine = CALLOUTS[S.callN % CALLOUTS.length]; S.callN++; S.rec = 1.4;
      Shell.flash(S.recLine, "Streak " + S.streak + ". Points x" + S.mult, "#ff3fa4", 1100);
      Shell.tone(523, 0.06, "square", 0.18); Shell.tone(784, 0.06, "square", 0.18, 0, 0.07); Shell.tone(1047, 0.12, "square", 0.18, 0, 0.14);
    }
  }
  function arrive() {
    S.gate = true; S.phase = "end"; S.pt = 0; S.z = LEN;
    S.left = clockLeft(); S.bonus = Math.round(S.left) * TIME_BONUS; S.score += S.bonus;
    Shell.flash("MADE THE TOY STORE!", "The last Ultra-Bot is yours. Time bonus +" + S.bonus, "#ffd23f", 1500);
    Shell.sfx("best"); Shell.sfx("crowd");
    award("msd-gate");
    if (S.bumps === 0) award("msd-clean");
    if (S.score >= 50000 && S.left > 30) award("msd-doorbuster");
    unlockShoes();
  }
  function closed() {
    S.phase = "end"; S.pt = 0; S.left = 0;
    Shell.flash("GATES ARE DOWN", "The mall is closed. There's always layaway.", "#ff4b3e", 1500);
    Shell.sfx("miss"); Shell.noise(1.0, 0.35, 200, 0.7, 0, 90, "lowpass");
    unlockShoes();
  }
  function unlockShoes() {
    gear.items += S.items;
    var want = { strap: S.gate, lightup: gear.items >= 300, skates: S.gate && S.left >= 25 };
    for (var id in want) if (want[id] && !gear.u[id]) { gear.u[id] = 1; S.newShoes.push(shoeName(id)); }
    saveGear(); paintPicker();
  }

  /* ---------------- Footwear ---------------- */
  function loadGear() {
    var g = null;
    try { g = JSON.parse(Shell.load("gear") || "null"); } catch (e) { g = null; }
    if (!g || typeof g !== "object") g = {};
    if (!g.u || typeof g.u !== "object") g.u = {};
    g.u.plain = 1; g.items = Number(g.items) > 0 ? Number(g.items) : 0;
    if (!g.on || !g.u[g.on]) g.on = "plain";
    return g;
  }
  function saveGear() { Shell.save("gear", JSON.stringify(gear)); }
  function shoeName(id) { for (var i = 0; i < SHOES.length; i++) if (SHOES[i].id === id) return SHOES[i].name; return id; }
  function step(land) {
    var s = gear.on;
    if (s === "plain") Shell.noise(0.04, land ? 0.12 : 0.05, 900, 1.2);
    else if (s === "strap") { Shell.noise(0.06, land ? 0.14 : 0.07, 2600, 2); }
    else if (s === "lightup") { Shell.tone(land ? 660 : (S.stepN % 2 ? 1320 : 1760), 0.03, "square", land ? 0.1 : 0.05); }
    else Shell.noise(0.16, land ? 0.12 : 0.05, 420, 0.8, 0, 700);
  }
  function footsteps(dt) {
    if (airborne()) return;
    S.stepT += dt;
    var per = gear.on === "skates" ? 0.42 : clamp(70 / S.v, 0.14, 0.26);
    if (S.stepT >= per) { S.stepT = 0; S.stepN++; step(false); }
  }

  /* ---------------- End of run ---------------- */
  function money(n) { return "$" + (n / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function mmss(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function finish() {
    var got = S.pieces.reduce(function (a, b) { return a + b; }, 0);
    Shell.gameOver(S.score, { title: S.gate ? "MADE THE TOY STORE" : "GATES ARE DOWN", html:
      row("Items grabbed", S.items) + row("Catalog combo", got + " of 5") + row("Bumps", S.bumps) +
      row("Time left", S.gate ? mmss(S.left) : "0:00") + row("Time bonus", S.gate ? S.bonus : "Reach the gate to earn it") +
      (S.newShoes.length ? row("New shoes", S.newShoes.join(", ")) : ""),
      stats: { score: S.score, gate: S.gate, bumps: S.bumps, left: Math.round(S.left), items: S.items, samples: S.samples,
               pieces: got, walkers: S.walkPassed, near: S.near, token: S.token } });
  }
  function row(a, b) { return '<div class="np-row"><span>' + a + "</span><b>" + b + "</b></div>"; }

  /* ---------------- Input ---------------- */
  function move(dir) {
    if (S.phase !== "run") return;
    var to = clamp(S.lane + dir, 0, 2);
    if (to === S.lane) return;
    S.swFrom = S.lane; S.swT = S.t; S.lane = to;
    Shell.tone(520 + to * 90, 0.03, "triangle", 0.1);
  }
  function jump() {
    if (S.phase !== "run" || airborne()) return;
    S.jumpT = 0; Shell.tone(330, 0.12, "square", 0.12, 660);
  }
  function skipReceipt() { if (S.phase === "receipt" && S.pt > 0.8) finish(); }
  function pointer(type, x, y) {
    if (type === "down") { ptr = { x: x, y: y, done: false }; skipReceipt(); return; }
    if (!ptr) return;
    var dx = x - ptr.x, dy = y - ptr.y;
    if (type === "move" && !ptr.done) {
      if (dy < -28 && Math.abs(dy) > Math.abs(dx)) { ptr.done = true; jump(); }
      else if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy)) { ptr.done = true; move(dx < 0 ? -1 : 1); }
    } else if (type === "up") {
      if (!ptr.done) move(ptr.x < W / 2 ? -1 : 1);       // a tap: left or right half of the screen
      ptr = null;
    } else if (type === "cancel") ptr = null;
  }
  function key(type, code, e) {
    keys[code] = type === "down";
    if (type !== "down" || (e && e.repeat)) return;
    if (code === "ArrowLeft" || code === "KeyA") move(-1);
    else if (code === "ArrowRight" || code === "KeyD") move(1);
    else if (code === "Space" || code === "ArrowUp" || code === "KeyW") { if (S.phase === "receipt") skipReceipt(); else jump(); }
    else if (code === "Enter") skipReceipt();
  }

  /* ---------------- Drawing helpers ---------------- */
  function fr(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function circ(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function poly(c, pts, col) { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); }
  function edgeX(side, z) { return CX + side * EDGE * sp(z); }
  function wallY(z, h) { return sy(z) - h * sp(z); }
  function sparkle(x, y, col) {
    if (Shell.reduced) return;
    for (var i = 0; i < 8; i++) { var a = i / 8 * TAU; parts.push({ x: x, y: y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70 - 40, life: 0.35, c: i % 2 ? col : "#ffffff" }); }
  }
  // draw text on a wall panel: map a local w x h box onto the wall between z0 and z1
  function wallText(c, side, z0, z1, h0, h1, str, col, size) {
    if (side > 0) { var tmp = z0; z0 = z1; z1 = tmp; }   // on the right wall the text reads from the far end toward you
    var x0 = edgeX(side, z0), x1 = edgeX(side, z1), lw = 200, lh = 30;
    var ax = (x1 - x0) / lw, ay = (wallY(z1, h1) - wallY(z0, h1)) / lw, cx = 0, cy = (wallY(z0, h0) - wallY(z0, h1)) / lh;
    c.save(); c.transform(ax, ay, cx, cy, x0, wallY(z0, h1));
    c.font = size + 'px "Press Start 2P", monospace'; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = col; c.fillText(str, lw / 2, lh / 2 + 1);
    c.restore();
  }

  var STORES = [
    { name: "TOYS AND GAMES", wall: "#2b1d4a", sign: "#ff3fa4", win: "#ffd23f" },
    { name: "PRETZEL STAND", wall: "#3b2416", sign: "#ffd23f", win: "#ff9b3f" },
    { name: "VIDEO ARCADE", wall: "#121a3a", sign: "#3ff0ff", win: "#a77bff" },
    { name: "VIDEO TAPES", wall: "#2a1420", sign: "#9bff3f", win: "#ff4b3e" }
  ];
  var SEG = 420;
  function floorCol(z, alt) {
    var k = z / LEN;
    if (k < P1) return alt ? "#d8cfb4" : "#2f8f86";
    if (k < P2) return alt ? "#efe6ee" : "#c9b8cf";
    return alt ? "#7a1f2b" : "#1f5a3a";
  }

  function drawMall(c, z0) {
    // ceiling and the far end of the concourse
    var g = c.createLinearGradient(0, 0, 0, HY); g.addColorStop(0, "#0b0c18"); g.addColorStop(1, "#231a3c");
    fr(c, 0, 0, W, H, "#231a3c");           // repaint the whole frame so nothing builds up between frames
    fr(c, 0, 0, W, HY + 2, g);
    for (var sk = 0; sk < 8; sk++) { var lx = 30 + sk * 44; fr(c, lx, 56 + (sk % 2) * 6, 3, 3, sk % 3 ? "#ffd23f" : "#ff3fa4"); }
    fr(c, CX - 30, HY - 34, 60, 34, "#120f22"); fr(c, CX - 26, HY - 30, 52, 8, "#ff3fa4");
    // floor, in bands of tiles that scroll toward you
    poly(c, [edgeX(-1, 4000), HY, edgeX(1, 4000), HY, edgeX(1, -60), H + 40, edgeX(-1, -60), H + 40], floorCol(z0 + 2000, false));
    var T = 90, first = Math.floor(z0 / T) * T, COLS = 6;
    for (var tz = first + 30 * T; tz >= first; tz -= T) {
      var za = tz - z0, zb = za + T;
      if (zb < -60) continue;
      var rowN = Math.round(tz / T);
      for (var cI = 0; cI < COLS; cI++) {
        if ((rowN + cI) % 2) continue;
        var u0 = -1 + cI * 2 / COLS, u1 = u0 + 2 / COLS;
        poly(c, [CX + u0 * EDGE * sp(za), sy(za), CX + u1 * EDGE * sp(za), sy(za), CX + u1 * EDGE * sp(zb), sy(zb), CX + u0 * EDGE * sp(zb), sy(zb)], floorCol(tz, true));
      }
    }
    // lane seams
    c.strokeStyle = "rgba(255,255,255,.10)"; c.lineWidth = 1;
    for (var s = -0.5; s <= 0.5; s += 1) { c.beginPath(); c.moveTo(CX + s * LANE * sp(3000), sy(3000)); c.lineTo(CX + s * LANE * sp(-40), sy(-40)); c.stroke(); }
    // the escalator strip down the middle lane
    var e0 = ESC.z - z0, e1 = e0 + ESC.len;
    if (e1 > -60 && e0 < 3000) {
      var a0 = Math.max(e0, -60), a1 = Math.min(e1, 3000);
      poly(c, [sx(0.55, a0), sy(a0), sx(1.45, a0), sy(a0), sx(1.45, a1), sy(a1), sx(0.55, a1), sy(a1)], "#30343f");
      c.strokeStyle = "#8e93a2"; c.lineWidth = 1;
      for (var st = Math.ceil((a0 + (S.t * 160) % 30) / 30) * 30 - (S.t * 160) % 30; st < a1; st += 30) {
        c.beginPath(); c.moveTo(sx(0.57, st), sy(st)); c.lineTo(sx(1.43, st), sy(st)); c.stroke();
      }
      c.strokeStyle = "#101219"; c.lineWidth = 3;
      for (var hs = 0.55; hs <= 1.45; hs += 0.9) { c.beginPath(); c.moveTo(sx(hs, a0), sy(a0) - 10 * sp(a0)); c.lineTo(sx(hs, a1), sy(a1) - 10 * sp(a1)); c.stroke(); }
    }
    // storefront walls, far to near, both sides
    var sFirst = Math.floor(z0 / SEG);
    for (var n = sFirst + 9; n >= sFirst; n--) {
      for (var side = -1; side <= 1; side += 2) {
        var w0 = n * SEG - z0, w1 = w0 + SEG;
        if (w1 < -80) continue;
        var st2 = STORES[(n * 2 + (side > 0 ? 1 : 0) + 4000) % 4], top = 300, near = w0 < -40 ? -40 : w0;
        poly(c, [edgeX(side, near), sy(near), edgeX(side, w1), sy(w1), edgeX(side, w1), wallY(w1, top), edgeX(side, near), wallY(near, top)], st2.wall);
        // window glow
        var q0 = Math.max(near, w0 + 40), q1 = w1 - 40;
        if (q1 > q0) poly(c, [edgeX(side, q0), wallY(q0, 20), edgeX(side, q1), wallY(q1, 20), edgeX(side, q1), wallY(q1, 120), edgeX(side, q0), wallY(q0, 120)], st2.win + "55");
        // sign band and neon text
        poly(c, [edgeX(side, q0), wallY(q0, 150), edgeX(side, q1), wallY(q1, 150), edgeX(side, q1), wallY(q1, 185), edgeX(side, q0), wallY(q0, 185)], "#0d0f16");
        if (w0 < 1400 && w0 > -10) wallText(c, side, w0 + 40, w1 - 40, 150, 185, st2.name, st2.sign, 12);
        // pillar between stores
        poly(c, [edgeX(side, w0), sy(w0), edgeX(side, w0 + 18), sy(w0 + 18), edgeX(side, w0 + 18), wallY(w0 + 18, top), edgeX(side, w0), wallY(w0, top)], "#3a3e4c");
      }
    }
    // tinsel garland along both walls, with bulbs
    var gFirst = Math.floor(z0 / 60) * 60;
    for (side = -1; side <= 1; side += 2) {
      c.strokeStyle = "#9bff3f"; c.lineWidth = 2; c.beginPath();
      for (var gz = gFirst + 2400; gz >= gFirst; gz -= 60) {
        var gzz = gz - z0, gx = edgeX(side, gzz), gy = wallY(gzz, (gz / 60) % 2 ? 210 : 232);
        if (gz === gFirst + 2400) c.moveTo(gx, gy); else c.lineTo(gx, gy);
        if ((gz / 60) % 2 && gzz < 1600) circ(c, gx, gy + 2, Math.max(1, 3 * sp(gzz)), (gz / 120) % 3 < 1 ? "#ff4b3e" : (gz / 120) % 3 < 2 ? "#ffd23f" : "#3ff0ff");
      }
      c.stroke();
    }
    // holiday banners hung across the concourse
    var bFirst = Math.ceil(z0 / 1100) * 1100;
    for (var bz = bFirst + 4 * 1100; bz >= bFirst; bz -= 1100) {
      var zz = bz - z0, l = edgeX(-1, zz) + 30 * sp(zz), rr = edgeX(1, zz) - 30 * sp(zz), y0 = wallY(zz, 290), y1 = wallY(zz, 262);
      if (zz < 10) continue;
      fr(c, l, y0, rr - l, y1 - y0, (bz / 1100) % 2 ? "#ff4b3e" : "#1f6b40");
      if (sp(zz) > 0.3) {
        c.font = Math.max(6, Math.round(12 * sp(zz))) + 'px "Press Start 2P", monospace'; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillStyle = "#ffffff"; c.fillText((bz / 1100) % 2 ? "HAPPY HOLIDAYS" : "OPEN TILL 6 PM", CX, (y0 + y1) / 2 + 1);
      }
    }
    // the toy store gate at the end
    var gzz = LEN - z0;
    if (gzz < 3000) drawGate(c, gzz);
  }
  function drawGate(c, z) {
    var s = sp(z), l = edgeX(-1, z), r = edgeX(1, z), base = sy(z), top = wallY(z, 300);
    fr(c, l, top, r - l, base - top, "#1b1430");
    var dl = CX - 120 * s, dr = CX + 120 * s, dt = wallY(z, 170);
    fr(c, dl, dt, dr - dl, base - dt, "#3a2a10");
    // shelves of toys glowing inside
    for (var i = 0; i < 4; i++) fr(c, dl + 8 * s, dt + (24 + i * 34) * s, dr - dl - 16 * s, 6 * s, "#ffd23f");
    // the security gate, coming down as the clock runs out
    var drop = clamp(1 - S.left / CLOCK, 0, 1) * 0.55 + (S.phase === "end" && !S.gate ? 0.45 * clamp(S.pt / 0.8, 0, 1) : 0);
    c.fillStyle = "rgba(160,170,190,.55)";
    for (var y = dt; y < dt + (base - dt) * drop; y += 6 * s) c.fillRect(dl, y, dr - dl, Math.max(1, 2 * s));
    fr(c, dl - 6 * s, wallY(z, 225), dr - dl + 12 * s, 40 * s, "#0d0f16");
    if (s > 0.12) {
      c.font = Math.max(6, Math.round(22 * s)) + 'px "Press Start 2P", monospace'; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillStyle = "#ff3fa4"; c.fillText("TOY STORE", CX, wallY(z, 205));
    }
  }

  /* ---------------- Sprites (drawn at base x, y with scale s) ---------------- */
  function person(c, x, y, s, shirt, pants, hair, walk) {
    var leg = Math.sin(walk) * 5 * s;
    fr(c, x - 8 * s, y - 26 * s, 6 * s, 26 * s + leg, pants); fr(c, x + 2 * s, y - 26 * s, 6 * s, 26 * s - leg, pants);
    fr(c, x - 11 * s, y - 52 * s, 22 * s, 28 * s, shirt);
    fr(c, x - 15 * s, y - 50 * s + leg, 5 * s, 18 * s, shirt); fr(c, x + 10 * s, y - 50 * s - leg, 5 * s, 18 * s, shirt);
    circ(c, x, y - 60 * s, 8 * s, "#e0a070"); fr(c, x - 8 * s, y - 69 * s, 16 * s, 6 * s, hair);
  }
  function drawOb(c, o, z) {
    var s = sp(z), x = sx(o.lp, z), y = sy(z), t = S.t;
    switch (o.t) {
      case "table":
        fr(c, x - 4 * s, y - 34 * s, 8 * s, 34 * s, "#6e7079");
        c.fillStyle = "#e9e3d0"; c.beginPath(); c.ellipse(x, y - 36 * s, 38 * s, 10 * s, 0, 0, TAU); c.fill();
        fr(c, x - 30 * s, y - 52 * s, 8 * s, 16 * s, "#ff4b3e"); fr(c, x + 18 * s, y - 50 * s, 10 * s, 14 * s, "#ffd23f");
        fr(c, x - 40 * s, y - 24 * s, 12 * s, 24 * s, "#ff9b3f"); fr(c, x + 28 * s, y - 24 * s, 12 * s, 24 * s, "#ff9b3f");
        break;
      case "janitor":
        person(c, x, y, s, "#4b5d7a", "#2f3b55", "#6e7079", t * 3);
        fr(c, x + 14 * s, y - 50 * s, 3 * s, 50 * s, "#b98a55"); fr(c, x + 8 * s + Math.sin(t * 5) * 6 * s, y - 4 * s, 16 * s, 5 * s, "#d8d8d8");
        fr(c, x - 30 * s, y - 16 * s, 16 * s, 16 * s, "#ffd23f");
        break;
      case "sign":
        poly(c, [x - 14 * s, y, x + 14 * s, y, x + 4 * s, y - 34 * s, x - 4 * s, y - 34 * s], "#ffd23f");
        fr(c, x - 9 * s, y - 20 * s, 18 * s, 4 * s, "#101219"); fr(c, x - 2 * s, y - 30 * s, 4 * s, 7 * s, "#101219");
        break;
      case "walker":
        person(c, x, y, s, o.lane % 2 ? "#7a3fd0" : "#1fa0a0", o.lane % 2 ? "#3f1f80" : "#106060", "#eceae2", t * 7 + o.z);
        fr(c, x - 8 * s, y - 66 * s, 16 * s, 3 * s, "#ff3fa4");
        break;
      case "stroller":
        circ(c, x - 12 * s, y - 4 * s, 5 * s, "#101219"); circ(c, x + 12 * s, y - 4 * s, 5 * s, "#101219");
        fr(c, x - 16 * s, y - 22 * s, 32 * s, 14 * s, "#5a8fd0");
        c.fillStyle = "#ff8fc8"; c.beginPath(); c.arc(x + 4 * s, y - 22 * s, 14 * s, Math.PI, TAU); c.fill();
        break;
      case "bin":
        fr(c, x - 26 * s, y - 28 * s, 52 * s, 28 * s, "#8d8f99");
        c.strokeStyle = "#3a3e4c"; c.lineWidth = Math.max(1, s);
        for (var gx = -22; gx <= 22; gx += 8) { c.beginPath(); c.moveTo(x + gx * s, y - 28 * s); c.lineTo(x + gx * s, y); c.stroke(); }
        fr(c, x - 14 * s, y - 44 * s, 28 * s, 14 * s, "#ff4b3e");
        if (s > 0.4) Shell.uiText(c, "SALE", x, y - 43 * s, Math.max(6, Math.round(10 * s)), "#ffffff", "center");
        fr(c, x - 20 * s, y - 34 * s, 10 * s, 7 * s, "#3ff0ff"); fr(c, x + 6 * s, y - 33 * s, 12 * s, 6 * s, "#ffd23f");
        break;
      case "clerk":
        fr(c, x - 26 * s, y - 34 * s, 52 * s, 34 * s, "#efe6ee"); fr(c, x - 26 * s, y - 38 * s, 52 * s, 5 * s, "#a77bff");
        person(c, x, y - 18 * s, s * 0.8, "#101219", "#101219", "#5a3a1e", 0);
        fr(c, x - 22 * s, y - 50 * s, 6 * s, 10 * s, "#ff8fc8");
        break;
      case "mist":
        if (!o.on) break;
        var x0 = sx(o.lp, z), x1 = sx(o.lp + 1, z), pulse = 0.5 + 0.2 * Math.sin(t * 10);
        c.fillStyle = "rgba(255,143,200," + (0.32 + 0.1 * pulse).toFixed(2) + ")";
        for (var m = 0; m < 6; m++) { c.beginPath(); c.arc(x0 + (x1 - x0) * (m / 5), y - (30 + 10 * Math.sin(t * 4 + m)) * s, (26 + 6 * pulse) * s, 0, TAU); c.fill(); }
        break;
      case "rope":
        var l0 = sx(o.lp - 0.48, z), l1 = sx(o.lp + (o.span ? 1.48 : 0.48), z);
        fr(c, l0 - 3 * s, y - 40 * s, 6 * s, 40 * s, "#ffd23f"); fr(c, l1 - 3 * s, y - 40 * s, 6 * s, 40 * s, "#ffd23f");
        if (o.span) fr(c, (l0 + l1) / 2 - 3 * s, y - 40 * s, 6 * s, 40 * s, "#ffd23f");
        c.strokeStyle = "#c0142b"; c.lineWidth = Math.max(1.5, 5 * s); c.beginPath();
        c.moveTo(l0, y - 34 * s); c.quadraticCurveTo((l0 + l1) / 2, y - 18 * s, l1, y - 34 * s); c.stroke();
        break;
      case "cart":
        circ(c, x, y - 4 * s, 6 * s, "#101219"); circ(c, x - 16 * s, y - 4 * s, 6 * s, "#101219"); circ(c, x + 16 * s, y - 4 * s, 6 * s, "#101219");
        fr(c, x - 22 * s, y - 30 * s, 44 * s, 24 * s, "#eceae2"); fr(c, x - 22 * s, y - 20 * s, 44 * s, 5 * s, "#2f6bff");
        person(c, x, y - 26 * s, s * 0.7, "#2f3b7a", "#2f3b7a", "#101219", 0);
        fr(c, x - 3 * s, y - 84 * s, 6 * s, 20 * s, "#3a3e4c");
        circ(c, x, y - 88 * s, 5 * s, Math.floor(t * 6) % 2 ? "#ff4b3e" : "#2f6bff");
        break;
      case "fountain":
        c.fillStyle = "#3a6fa0"; c.beginPath(); c.ellipse(x, y - 6 * s, 44 * s, 12 * s, 0, 0, TAU); c.fill();
        c.fillStyle = "#9fd8ff"; c.beginPath(); c.ellipse(x, y - 8 * s, 36 * s, 8 * s, 0, 0, TAU); c.fill();
        c.fillStyle = "rgba(190,235,255,.6)";
        for (var f = 0; f < 5; f++) { var fx = x + (f - 2) * 10 * s, fh = (50 + 10 * Math.sin(t * 6 + f)) * s; fr(c, fx - 2 * s, y - 8 * s - fh, 4 * s, fh, "rgba(190,235,255,.55)"); }
        break;
    }
  }
  function drawItem(c, it, z) {
    var s = sp(z), x = sx(it.lane, z), y = sy(z) - (it.air ? 62 : 16) * s, bob = Math.sin(S.t * 5 + it.z) * 3 * s;
    y += bob;
    switch (it.t) {
      case "coin": circ(c, x, y, 8 * s, "#c9952a"); circ(c, x, y, 6 * s, "#ffd23f"); fr(c, x - 1 * s, y - 4 * s, 2 * s, 8 * s, "#fff4b0"); break;
      case "sample":
        c.fillStyle = "#ffffff"; c.beginPath(); c.ellipse(x, y + 5 * s, 10 * s, 3 * s, 0, 0, TAU); c.fill();
        circ(c, x, y, 5 * s, "#b5651d"); fr(c, x - 0.5 * s, y - 12 * s, 1.5 * s, 10 * s, "#e9d8a6");
        break;
      case "bag":
        fr(c, x - 9 * s, y - 8 * s, 18 * s, 18 * s, "#ff4b3e"); fr(c, x - 9 * s, y - 2 * s, 18 * s, 3 * s, "#1f6b40");
        c.strokeStyle = "#101219"; c.lineWidth = Math.max(1, 1.5 * s); c.beginPath(); c.arc(x, y - 8 * s, 5 * s, Math.PI, TAU); c.stroke();
        break;
      case "slip": fr(c, x - 10 * s, y - 6 * s, 20 * s, 13 * s, "#f4f1e4"); fr(c, x - 7 * s, y - 3 * s, 14 * s, 2 * s, "#3ff0ff"); fr(c, x - 7 * s, y + 1 * s, 10 * s, 2 * s, "#8e93a2"); break;
      case "box": fr(c, x - 11 * s, y - 12 * s, 22 * s, 24 * s, "#2f6bff"); fr(c, x - 7 * s, y - 8 * s, 14 * s, 12 * s, "#9fd8ff"); fr(c, x - 11 * s, y + 7 * s, 22 * s, 4 * s, "#ffd23f"); break;
      case "piece":
        var glow = 0.5 + 0.5 * Math.sin(S.t * 8);
        circ(c, x, y, (13 + glow * 3) * s, "rgba(167,123,255,.35)");
        fr(c, x - 10 * s, y - 13 * s, 20 * s, 26 * s, "#a77bff"); fr(c, x - 7 * s, y - 10 * s, 14 * s, 14 * s, "#eceae2");
        circ(c, x, y - 4 * s, 4 * s, "#ff4b3e");
        break;
      case "token":   // hidden in the spray: just a glint until you are close
        var a = z < 260 ? 1 : 0.35 + 0.35 * Math.sin(S.t * 9);
        c.fillStyle = "rgba(63,240,255," + a.toFixed(2) + ")"; c.beginPath(); c.arc(x, y, 7 * s, 0, TAU); c.fill();
        fr(c, x - 12 * s, y - 1 * s, 24 * s, 2 * s, "rgba(255,255,255," + a.toFixed(2) + ")"); fr(c, x - 1 * s, y - 12 * s, 2 * s, 24 * s, "rgba(255,255,255," + a.toFixed(2) + ")");
        break;
    }
  }
  function drawRunner(c, state) {
    var x = sx(S.lp, 0), y = BY, h = jumpH(), run = S.phase === "run" && state === "playing";
    c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(x, y + 2, 22 - h * 0.1, 6, 0, 0, TAU); c.fill();
    if (S.inv > 0 && Math.floor(S.t * 12) % 2 === 0) return;
    y -= h;
    var ph = run ? S.t * (gear.on === "skates" ? 7 : 16) : 0, leg = airborne() ? 4 : Math.sin(ph) * 7;
    // legs and shoes
    fr(c, x - 12, y - 30 + leg, 9, 26, "#c0142b"); fr(c, x + 3, y - 30 - leg, 9, 26, "#c0142b");
    var shoe = gear.on, sc = shoe === "strap" ? "#eceae2" : shoe === "lightup" ? "#2f3b7a" : shoe === "skates" ? "#3ff0ff" : "#3a3e4c";
    fr(c, x - 13, y - 6 + leg, 11, 7, sc); fr(c, x + 2, y - 6 - leg, 11, 7, sc);
    if (shoe === "strap") { fr(c, x - 12, y - 4 + leg, 9, 2, "#ff4b3e"); fr(c, x + 3, y - 4 - leg, 9, 2, "#ff4b3e"); }
    if (shoe === "lightup" && run && Math.floor(S.t * 8) % 2 === 0) { fr(c, x - 13, y + leg, 11, 2, "#ff3fa4"); fr(c, x + 2, y - leg, 11, 2, "#9bff3f"); }
    if (shoe === "skates") { for (var w = 0; w < 3; w++) { circ(c, x - 11 + w * 4, y + 3 + leg, 2, "#ff3fa4"); circ(c, x + 4 + w * 4, y + 3 - leg, 2, "#ff3fa4"); } }
    // red suit with white trim, seen from behind
    fr(c, x - 16, y - 58, 32, 32, "#ff4b3e"); fr(c, x - 16, y - 32, 32, 6, "#ffffff"); fr(c, x - 3, y - 58, 6, 26, "#d0323a");
    fr(c, x - 22, y - 56 - leg, 7, 22, "#ff4b3e"); fr(c, x + 15, y - 56 + leg, 7, 22, "#ff4b3e");
    fr(c, x - 22, y - 36 - leg, 7, 4, "#ffffff"); fr(c, x + 15, y - 36 + leg, 7, 4, "#ffffff");
    circ(c, x, y - 66, 10, "#e0a070");
    fr(c, x - 11, y - 76, 22, 8, "#ff4b3e"); fr(c, x - 12, y - 70, 24, 4, "#ffffff");
    circ(c, x + 10, y - 82, 4, "#ffffff");
  }
  function drawHUD(c, state) {
    fr(c, 0, 0, W, 52, "rgba(13,15,21,.94)");
    Shell.text(c, "SCORE", 10, 7, 8, "#8e93a2");
    Shell.text(c, String(S.score), 10, 20, 12, "#ffd23f");
    var low = S.left <= 15, blink = low && Math.floor(S.t * 4) % 2 === 0;
    Shell.text(c, "MALL CLOSES IN", W / 2, 7, 8, "#8e93a2", "center");
    Shell.text(c, mmss(S.left), W / 2, 19, 16, blink ? "#ffffff" : low ? "#ff4b3e" : "#9bff3f", "center");
    Shell.text(c, "STREAK", W - 10, 7, 8, "#8e93a2", "right");
    Shell.text(c, "x" + S.mult, W - 10, 20, 12, S.mult > 1 ? "#ff3fa4" : "#eceae2", "right");
    // catalog combo slots
    for (var i = 0; i < 5; i++) fr(c, W - 64 + i * 11, 37, 8, 8, S.pieces[i] ? "#a77bff" : "#2c3040");
    // progress to the toy store
    var k = clamp(S.z / LEN, 0, 1);
    fr(c, 10, 40, W - 90, 4, "#2c3040"); fr(c, 10, 40, (W - 90) * k, 4, "#ff3fa4");
    fr(c, 10 + (W - 90) * P1, 38, 1, 8, "#8e93a2"); fr(c, 10 + (W - 90) * P2, 38, 1, 8, "#8e93a2");
    // camcorder overlay for streak callouts
    if (S.rec > 0 && state === "playing") {
      c.strokeStyle = "rgba(236,234,226,.85)"; c.lineWidth = 2;
      var bx = 14, by = 62, bw = W - 28, bh = H - 130, L2 = 18;
      [[bx, by, 1, 1], [bx + bw, by, -1, 1], [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]].forEach(function (p) {
        c.beginPath(); c.moveTo(p[0], p[1] + L2 * p[3]); c.lineTo(p[0], p[1]); c.lineTo(p[0] + L2 * p[2], p[1]); c.stroke();
      });
      if (Math.floor(S.t * 3) % 2 === 0) circ(c, bx + 14, by + 16, 5, "#ff4b3e");
      Shell.text(c, "REC", bx + 24, by + 12, 8, "#eceae2");
      Shell.text(c, "DEC 24 1994", bx + 8, by + bh - 20, 8, "#eceae2");
      Shell.text(c, "5:59 PM", bx + bw - 8, by + bh - 20, 8, "#eceae2", "right");
    }
    // near miss price tag
    if (S.tag) {
      var tx = sx(S.lp, 0), ty = BY - 120 - (0.9 - S.tag.life) * 30, on = Math.floor(S.t * 10) % 2 === 0;
      c.font = '8px "Press Start 2P", monospace'; var tw = c.measureText(S.tag.text).width + 18;
      var lx = clamp(tx - tw / 2, 6, W - tw - 6);
      poly(c, [lx, ty, lx + tw - 8, ty, lx + tw, ty + 11, lx + tw - 8, ty + 22, lx, ty + 22], on ? "#ffd23f" : "#ff3fa4");
      circ(c, lx + tw - 9, ty + 11, 2, "#101219");
      Shell.text(c, S.tag.text, lx + 6, ty + 3, 8, "#101219");
      Shell.text(c, "+250", lx + 6, ty + 13, 8, "#101219");
    }
  }
  function drawReceipt(c) {
    var lines = [
      ["MISTLETOE MILE MALL", ""], ["DEC 24 1994", "5:59 PM"], ["", ""],
      ["ITEMS GRABBED", String(S.items)],
      ["MALL MILES WALKED", (S.z / 63360).toFixed(2)],
      ["BUMPS", String(S.bumps)],
      ["TIME LEFT", S.gate ? mmss(S.left) : "0:00"],
      ["TOTAL SAVINGS", money(S.score)], ["", ""],
      [S.gate ? "ULTRA-BOT x1  PAID" : "TOY STORE CLOSED", ""],
      [S.gate ? "THANK YOU, COME AGAIN" : "TRY LAYAWAY", ""]
    ];
    var shown = Math.min(lines.length, Math.floor(S.pt / 0.26) + 1), lh = 18, ph = 40 + lines.length * lh;
    var top = H - Math.min(ph, 40 + shown * lh) - 30, x0 = 46, w = W - 92;
    fr(c, 0, 0, W, H, "rgba(5,6,10,.55)");
    fr(c, x0, top, w, H - top, "#f4f1e4");
    for (var hx = x0 + 6; hx < x0 + w; hx += 12) circ(c, hx, top + 8, 2, "#c9c4b0");
    for (var i = 0; i < shown; i++) {
      var y = top + 24 + i * lh, L = lines[i], last = i === shown - 1 && S.pt < lines.length * 0.26;
      var val = L[1];
      if (last && /^\d+$/.test(val)) val = String(Math.floor(Number(val) * clamp((S.pt % 0.26) / 0.2, 0, 1)));
      Shell.uiText(c, L[0], x0 + 12, y, 10, "#2a2620");
      if (val) Shell.uiText(c, val, x0 + w - 12, y, 10, "#2a2620", "right");
    }
    if (S.pt > 0.8) Shell.uiText(c, "TAP TO CONTINUE", W / 2, H - 22, 10, "#eceae2", "center");
  }

  function draw(c, state) {
    var z0 = S.z + (state === "title" ? idleT * 120 : 0);
    drawMall(c, z0);
    var list = [], i;
    if (state !== "title") for (i = 0; i < S.O.length; i++) { var o = S.O[i], dz = o.z - z0; if (dz > -22 && dz < 2600 && !(o.hit && o.t === "mist")) list.push({ z: dz, o: o }); }
    if (state !== "title") for (i = 0; i < S.I.length; i++) { var it = S.I[i], iz = it.z - z0; if (!it.got && iz > -30 && iz < 2000) list.push({ z: iz, it: it }); }
    list.sort(function (a, b) { return b.z - a.z; });
    for (i = 0; i < list.length; i++) { if (list[i].z < 0) continue; if (list[i].o) drawOb(c, list[i].o, list[i].z); else drawItem(c, list[i].it, list[i].z); }
    drawRunner(c, state);
    for (i = 0; i < list.length; i++) { if (list[i].z >= 0) continue; if (list[i].o) drawOb(c, list[i].o, list[i].z); }
    // speed lines on the handrail ride
    if (S.esc && !Shell.reduced) { c.strokeStyle = "rgba(63,240,255,.5)"; c.lineWidth = 2; for (i = 0; i < 6; i++) { var a = (i / 6) * TAU + S.t; c.beginPath(); c.moveTo(CX + Math.cos(a) * 60, 300 + Math.sin(a) * 40); c.lineTo(CX + Math.cos(a) * 170, 300 + Math.sin(a) * 140); c.stroke(); } }
    for (i = 0; i < parts.length; i++) fr(c, parts[i].x, parts[i].y, 3, 3, parts[i].c);
    drawHUD(c, state);
    if (S.phase === "receipt") drawReceipt(c);
  }

  /* ---------------- Shoe picker on the title card ---------------- */
  var pickers = [];
  function buildPicker() {
    var st = document.createElement("style");
    st.textContent = ".msd-shoes{margin:10px 0 12px;text-align:left}.msd-shoes p{margin:0 0 6px;font:700 12px/1.2 Silkscreen,monospace;color:#8e93a2}" +
      ".msd-shoes div{display:grid;grid-template-columns:1fr 1fr;gap:6px}.msd-shoe{min-height:44px;padding:6px 8px;border:2px solid #2c3040;border-radius:8px;background:#1d2029;color:#eceae2;font:700 11px/1.2 Silkscreen,monospace;text-align:left;cursor:pointer}" +
      ".msd-shoe[aria-pressed=true]{border-color:#ff4b3e;background:#2a1418}.msd-shoe:disabled{opacity:.55;cursor:default}.msd-shoe small{display:block;font-weight:400;font-size:10px;color:#8e93a2}" +
      ".msd-shoe:focus-visible{outline:3px solid #ffd23f;outline-offset:2px}.msd-compact{margin:4px 0 10px}.msd-compact div{grid-template-columns:1fr}.msd-cycle{text-align:center}";
    document.head.appendChild(st);
    // on the title card and on the game over card, just above the main button
    [["#np-ov-title .np-card", "[data-act=start]", false], ["#np-ov-over .np-card", ".np-actions", true]].forEach(function (sel) {
      var card = document.querySelector(sel[0]), before = card && card.querySelector(sel[1]);
      if (!card || !before) return;
      var el = document.createElement("div"); el.className = "msd-shoes" + (sel[2] ? " msd-compact" : "");
      el.innerHTML = sel[2] ? "<div></div>" : "<p>SHOES (CHANGES YOUR FOOTSTEPS)</p><div></div>";
      card.insertBefore(el, before);
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        var b = e.target.closest ? e.target.closest("button[data-shoe]") : null;
        if (!b || b.disabled) return;
        if (b.hasAttribute("data-cycle")) {               // the game over card has one button that steps through your shoes
          var open = SHOES.filter(function (x) { return gear.u[x.id]; }), at = 0;
          for (var i = 0; i < open.length; i++) if (open[i].id === gear.on) at = i;
          gear.on = open[(at + 1) % open.length].id;
        } else gear.on = b.getAttribute("data-shoe");
        saveGear(); paintPicker();
        step(false);
      });
      pickers.push(el);
    });
    paintPicker();
  }
  function paintPicker() {
    var h = "";
    for (var i = 0; i < SHOES.length; i++) {
      var sh = SHOES[i], open = !!gear.u[sh.id];
      h += '<button type="button" class="msd-shoe" data-shoe="' + sh.id + '" aria-pressed="' + (gear.on === sh.id) + '"' + (open ? "" : " disabled") + ">" +
        sh.name + "<small>" + (open ? (gear.on === sh.id ? "Wearing" : "Tap to wear") : "Locked: " + sh.how) + "</small></button>";
    }
    var nOpen = SHOES.filter(function (x) { return gear.u[x.id]; }).length;
    var one = '<button type="button" class="msd-shoe msd-cycle" data-shoe="' + gear.on + '" data-cycle' + (nOpen > 1 ? "" : " disabled") + ">SHOES: " + shoeName(gear.on) +
      "<small>" + (nOpen > 1 ? "Tap to switch (" + nOpen + " pairs unlocked)" : "More pairs unlock as you play") + "</small></button>";
    for (var p = 0; p < pickers.length; p++) pickers[p].querySelector("div").innerHTML = pickers[p].classList.contains("msd-compact") ? one : h;
  }

  // Hook for automated checks (no effect on play)
  window.__santa = { S: function () { return S; }, update: update, move: move, jump: jump, LEN: LEN, gear: function () { return gear; },
    jumpH: jumpH, consts: { V0: V0, V1: V1, CLOCK: CLOCK, BUMP: BUMP, JUMP_T: JUMP_T, LANE_T: LANE_T, LOW_CLEAR: LOW_CLEAR, ESC: ESC } };

  /* ---------------- Arcade setup (the only part tied to the shared shell) ---------------- */
  Shell.init({
    slug: "mall-santa-dash",
    title: "MALL SANTA DASH '94",
    accent: "#ff4b3e",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "Christmas Eve, 5:58 PM. Dash down the mall and reach the toy store before the gates come down. Grab bags, coins and toys. Bumping a shopper costs 3 seconds.",
    keys: "Tap the left or right side to change lanes. Swipe up to jump. Keys: left and right (or A and D) change lanes, Space or up jumps. P pause, M mute, R restart.",
    tip: "Low things like wet floor signs, strollers and sale bins can be jumped. Shoppers and ropes can't.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { for (var k in keys) keys[k] = false; ptr = null; }
  });
  gear = loadGear();
  buildPicker();
  marginTaps();

  // Landscape phones show the game narrow with empty space beside it: taps and swipes there steer too.
  function marginTaps() {
    var stage = document.getElementById("np-stage"), cv = document.getElementById("np-canvas"), id = null;
    if (!stage || !cv) return;
    function local(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / (r.width / W), y: (e.clientY - r.top) / (r.height / H) }; }
    stage.addEventListener("pointerdown", function (e) {
      if (e.target !== stage || Shell.state() !== "playing" || id !== null) return;
      e.preventDefault(); id = e.pointerId;
      try { stage.setPointerCapture(id); } catch (err) { /* ignore */ }
      var q = local(e); pointer("down", q.x, q.y);
    });
    stage.addEventListener("pointermove", function (e) { if (e.pointerId === id && Shell.state() === "playing") { var q = local(e); pointer("move", q.x, q.y); } });
    function end(type) { return function (e) { if (e.pointerId !== id) return; id = null; if (Shell.state() === "playing") { var q = local(e); pointer(type, q.x, q.y); } }; }
    stage.addEventListener("pointerup", end("up"));
    stage.addEventListener("pointercancel", end("cancel"));
  }
})();
