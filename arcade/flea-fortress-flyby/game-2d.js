/* FLEA FORTRESS FLYBY
   A giant floating swap meet drifts through space: parking lot stalls, walls of stacked game boxes,
   VHS shelving and tracking-static force fields. Fly the Bargain Hunter through it diagonally, shoot the
   price gun turrets, blast fuel tanks to top off, and haggle the Haggletron down to zero at the far end.

   World axes: f runs forward along the fortress, s runs across it (+s is toward the viewer, down-right
   on screen), z is altitude. The screen is a fixed isometric projection of (f - camera, s, z).
   The ship always sits at f = camera; its shadow on the floor and the altimeter on the left show height.
   Updates run at a fixed 60 steps per second (accumulator), so 120 Hz screens play at normal speed. */
(function () {
  "use strict";
  var W = 360, H = 540, TAU = Math.PI * 2, STEP = 1 / 60;
  // projection
  var OX = 118, OY = 392, FX = 0.56, FY = -0.74, SX = 0.78, SY = 0.42, ZK = 1.0;
  // world
  var HW = 70, ZT = 124, ZMIN = 6, ZMAX = 100, SMAX = 60, THICK = 12;
  var V0 = 80, LAT = 82, VERT = 72, FUEL_MAX = 100, DRAIN = 2.0;
  var SEG = { f1a: 0, f1b: 2500, sp: 2500, f2a: 3700, boss: 6550 };
  var PTS = { turret: 200, tank: 300, ears: 1000, disc: 150, missile: 50, bossHit: 100, boss: 5000 };
  var SIGNS = ["NO REFUNDS", "CASH ONLY", "ALL TAPES $1", "AS IS", "MAKE AN OFFER", "NO HAGGLING", "LOOSE CARTS", "BOXED ONLY"];

  var S = {}, keys = {}, pad = { ax: 0, ay: 0, fire: false }, idleT = 0, acc = 0;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function award(id) { if (window.Trophies) Trophies.unlock(id); }
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }
  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  /* ---------------- Projection ---------------- */
  function PX(f, s) { return OX + (f - S.cam) * FX + s * SX; }
  function PY(f, s, z) { return OY + (f - S.cam) * FY + s * SY - z * ZK; }
  function poly(c, pts, col) {   // pts: flat list of f,s,z triples
    c.fillStyle = col; c.beginPath();
    for (var i = 0; i < pts.length; i += 3) { var x = PX(pts[i], pts[i + 1]), y = PY(pts[i], pts[i + 1], pts[i + 2]); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.closePath(); c.fill();
  }
  function fr(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  // an axis aligned box; visible faces are the top, the front (f0) and the near side (s1)
  function box(c, f0, f1, s0, s1, z0, z1, top, front, side) {
    if (side) poly(c, [f0, s1, z0, f1, s1, z0, f1, s1, z1, f0, s1, z1], side);
    if (front) poly(c, [f0, s0, z0, f0, s1, z0, f0, s1, z1, f0, s0, z1], front);
    if (top) poly(c, [f0, s0, z1, f0, s1, z1, f1, s1, z1, f1, s0, z1], top);
  }
  // draw in the plane of a front face: local x runs along +s, local y runs down (-z), 1 unit = 1 world unit
  function facePlane(c, f, s0, ztop) { c.save(); c.transform(SX, SY, 0, ZK, PX(f, s0), PY(f, s0, ztop)); }

  /* ---------------- Level ---------------- */
  function buildLevel(loop, base) {
    var r = rng(9173 + loop * 7919), L = { base: base, obs: [], ents: [], waves: [], spans: [] };
    var hard = Math.min(loop, 3);
    L.spans.push([base + SEG.f1a, base + SEG.f1b]);
    L.spans.push([base + SEG.f2a, Infinity]);
    L.bossF = base + SEG.boss;
    // the entry gate: a wide arch with the fortress name painted over it
    L.obs.push({ t: "gate", f: base + 240, a: -38, b: 38, gh: 54, sign: "FLEA FORTRESS", look: 0 });
    var lastTank = base + 240;
    function ents(f0, f1, n) {
      for (var k = 0; k < n; k++) {
        var f = f0 + (f1 - f0) * (k + 0.5 + (r() - 0.5) * 0.5) / n, s = -56 + r() * 112, roll = r(), t;
        if (f - lastTank > 330) t = "tank"; else t = roll < 0.48 ? "turret" : roll < 0.8 ? "tank" : "ears";
        if (t === "tank") lastTank = f;
        L.ents.push({ t: t, f: f, s: s, h: t === "tank" ? 17 : t === "ears" ? 12 : 9, cool: 1.2 + r() * 1.5, dead: false });
      }
    }
    function run(f0, f1) {
      var f = f0, last = "";
      while (f < f1) {
        var roll = r(), o;
        if (roll < 0.26 && last !== "wall") o = { t: "wall", h: 18 + Math.round(r() * (26 + hard * 4)) };
        else if (roll < 0.4) o = { t: "zap", z0: 0, z1: 28 + Math.round(r() * 22) };
        else if (roll < 0.56) o = { t: "zap", z0: 36 + Math.round(r() * 22), z1: ZT };
        else if (roll < 0.76) { var h = 16 + Math.round(r() * 14); o = { t: "wallzap", h: h, z0: h + 36 - hard * 2 }; }
        else { var wdt = 62 - hard * 4 + Math.round(r() * 16), mid = -30 + r() * 60; o = { t: "gate", a: mid - wdt / 2, b: mid + wdt / 2, gh: 34 + Math.round(r() * 12) }; }
        o.f = f; o.look = Math.floor(r() * 3); o.sign = r() < 0.45 ? SIGNS[Math.floor(r() * SIGNS.length)] : "";
        L.obs.push(o); last = o.t;
        var gap = 190 + r() * 70 - hard * 12;
        ents(f + THICK + 34, f + gap - 30, 2 + (r() < 0.45 ? 1 : 0));
        f += gap;
      }
    }
    ents(base + 40, base + 210, 2);
    run(base + 470, base + SEG.f1b - 160);
    ents(base + SEG.f1b - 150, base + SEG.f1b - 20, 2);
    // open space: flying disc squadrons
    for (var w = 0; w < 6; w++) L.waves.push({ f: base + SEG.sp + 140 + w * 175, z: 22 + Math.round(r() * 60), s: -40 + r() * 80, n: 4 + (w % 2), kind: w % 3, done: false });
    L.obs.push({ t: "gate", f: base + SEG.f2a + 120, a: -44, b: 44, gh: 50, sign: "BACK LOT", look: 1 });
    run(base + SEG.f2a + 330, base + SEG.boss - 260);
    for (w = 0; w < 3; w++) L.waves.push({ f: base + SEG.f2a + 700 + w * 820, z: 30 + Math.round(r() * 40), s: -30 + r() * 60, n: 3, kind: 1, done: false });
    ents(base + SEG.boss - 240, base + SEG.boss - 40, 3);
    return L;
  }

  /* ---------------- State ---------------- */
  function reset() {
    S = { t: 0, loop: 0, cam: -260, v: V0, s: 0, z: 46, bank: 0, fuel: FUEL_MAX, lives: 3, score: 0, nextLife: 20000,
      L: buildLevel(0, 0), bullets: [], shots: [], discs: [], parts: [], rings: [], fireT: 0, inv: 0, dead: 0,
      falling: false, boss: null, phase: "fly", lowBeep: 0, msgT: 0, zone: "",
      tanks: 0, ears: 0, discsHit: 0, turrets: 0, beaten: 0, unders: 0, lostLoop: 0, cleanBeat: 0, ticks: 0 };
    acc = 0; pad.ax = pad.ay = 0; pad.fire = false;
  }

  function onFloor(f) { var sp = S.L.spans; for (var i = 0; i < sp.length; i++) if (f >= sp[i][0] && f <= sp[i][1]) return true; return false; }

  /* ---------------- Sound ---------------- */
  var SND = {
    shoot: function () { Shell.tone(1500, 0.05, "square", 0.07, 620); },
    boom: function (big) { Shell.noise(big ? 0.7 : 0.34, big ? 0.6 : 0.45, 1100, 0.6, 0, 90, "lowpass"); Shell.tone(big ? 150 : 210, big ? 0.5 : 0.22, "sawtooth", 0.16, 40); },
    fuel: function () { var n = [523, 659, 784, 1047, 1319]; for (var i = 0; i < n.length; i++) Shell.tone(n[i], 0.07, "square", 0.13, 0, 0.05 + i * 0.045); },
    ears: function () { Shell.tone(1568, 0.09, "square", 0.14); Shell.tone(2093, 0.16, "square", 0.12, 0, 0.08); },
    disc: function () { Shell.noise(0.14, 0.3, 2600, 1.5, 0, 700); Shell.tone(700, 0.1, "triangle", 0.2, 1400); },
    ping: function () { Shell.tone(1900, 0.04, "triangle", 0.12, 1500); },
    bossHit: function () { Shell.tone(196, 0.1, "square", 0.24, 392); Shell.noise(0.06, 0.3, 3200, 2); },
    turret: function () { Shell.tone(320, 0.07, "square", 0.06, 160); },
    missile: function () { Shell.tone(520, 0.22, "sawtooth", 0.08, 170); },
    die: function () { Shell.noise(1.0, 0.6, 1400, 0.5, 0, 60, "lowpass"); Shell.tone(420, 0.9, "sawtooth", 0.22, 36); Shell.tone(311, 0.7, "square", 0.1, 30, 0.1); },
    low: function () { Shell.tone(880, 0.07, "square", 0.11); Shell.tone(880, 0.07, "square", 0.11, 0, 0.14); },
    whoosh: function () { Shell.noise(0.3, 0.2, 500, 1.2, 0, 3200); },
    zap: function () { Shell.noise(0.05, 0.05, 5200, 3); },
    life: function () { var n = [784, 988, 1175, 1568]; for (var i = 0; i < n.length; i++) Shell.tone(n[i], 0.09, "square", 0.14, 0, i * 0.08); },
    win: function () { var n = [523, 659, 784, 1047, 784, 1047, 1319, 1568]; for (var i = 0; i < n.length; i++) Shell.tone(n[i], 0.11, "square", 0.15, 0, i * 0.09); }
  };

  /* ---------------- Effects ---------------- */
  function boom(f, s, z, n, cols, spd) {
    if (Shell.reduced) n = Math.ceil(n / 2);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, e = Math.random() * 2 - 0.3, sp = (spd || 60) * (0.4 + Math.random());
      S.parts.push({ f: f, s: s, z: z, vf: Math.cos(a) * sp + S.v * 0.6, vs: Math.sin(a) * sp, vz: e * sp, life: 0.5 + Math.random() * 0.6, max: 1.1, c: cols[i % cols.length], sz: 2 + (Math.random() * 3 | 0) });
    }
    S.rings.push({ f: f, s: s, z: z, t: 0, max: 0.35, r: n > 30 ? 34 : 20, c: cols[0] });
  }
  function addScore(n) {
    S.score += n;
    if (S.score >= S.nextLife) { S.nextLife += 40000; if (S.lives < 5) { S.lives++; SND.life(); Shell.flash("EXTRA SHIP", "Another one for the shelf", "#9bff3f", 1300); } }
  }

  /* ---------------- Input ---------------- */
  function inputAxes() {
    var ax = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0) + pad.ax;
    var ay = (keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0) + pad.ay;
    return { ax: clamp(ax, -1, 1), ay: clamp(ay, -1, 1), fire: !!(keys.Space || keys.KeyJ || keys.KeyK || keys.KeyZ || keys.KeyX || keys.Enter || pad.fire) };
  }
  function key(type, code) { keys[code] = type === "down"; }

  /* ---------------- Simulation ---------------- */
  function update(dt) {
    acc += dt;
    var n = 0;
    while (acc >= STEP && n < 6) { tick(STEP); acc -= STEP; n++; }
    if (n >= 6) acc = 0;
  }

  function die(why) {
    if (S.dead || S.inv > 0) return;
    S.dead = 0.0001; S.lives--; S.lostLoop++;
    boom(S.cam, S.s, S.z, 46, ["#ffd23f", "#ff4b3e", "#eceae2", "#ff9b3f"], 90);
    SND.die(); Shell.shake(7, 0.5);
    Shell.flash(why || "SHIP DOWN", S.lives > 0 ? S.lives + (S.lives === 1 ? " SHIP LEFT" : " SHIPS LEFT") : "", "#ff4b3e", 1300);
    S.shots.length = 0;
  }

  function tick(dt) {
    S.t += dt; S.ticks++;
    var i, j, o, e, b;
    // particles always move
    for (i = S.parts.length - 1; i >= 0; i--) { var p = S.parts[i]; p.f += p.vf * dt; p.s += p.vs * dt; p.z += p.vz * dt; p.vz -= 90 * dt; p.life -= dt; if (p.life <= 0) S.parts.splice(i, 1); }
    for (i = S.rings.length - 1; i >= 0; i--) { S.rings[i].t += dt; if (S.rings[i].t > S.rings[i].max) S.rings.splice(i, 1); }

    if (S.dead) {
      S.dead += dt;
      if (S.dead > 1.6) {
        if (S.lives <= 0) { finish(); return; }
        S.dead = 0; S.inv = 2.6; S.z = 46; S.s = 0; S.fuel = FUEL_MAX; S.falling = false;
        Shell.flash("READY", "Find the gap", "#3ff0ff", 900);
      }
      stepBoss(dt, true); moveShots(dt);
      return;
    }
    if (S.inv > 0) S.inv -= dt;

    var I = inputAxes();
    // fuel
    var drain = DRAIN * (S.phase === "boss" ? 0.6 : 1) * (1 + S.loop * 0.08);
    S.fuel = Math.max(0, S.fuel - drain * dt);
    if (S.fuel < 25 && S.fuel > 0) { S.lowBeep -= dt; if (S.lowBeep <= 0) { S.lowBeep = 1.1; SND.low(); } }
    if (S.fuel <= 0 && !S.falling) { S.falling = true; Shell.flash("OUT OF FUEL", "Should have shot the tanks", "#ff4b3e", 1300); }

    // ship
    S.s = clamp(S.s + I.ax * LAT * dt, -SMAX, SMAX);
    S.bank += (I.ax - S.bank) * Math.min(1, dt * 10);
    if (S.falling) S.z -= 46 * dt; else S.z = clamp(S.z + I.ay * VERT * dt, ZMIN, ZMAX);
    S.cam += S.v * dt;
    var floor = onFloor(S.cam);
    if (S.falling && (S.z <= (floor ? 3 : -40))) { die("OUT OF FUEL"); return; }

    // zone callouts
    var rel = S.cam - S.L.base, zone = rel < SEG.f1b ? "a" : rel < SEG.f2a ? "sp" : rel < SEG.boss ? "b" : "boss";
    if (zone !== S.zone) {
      if (zone === "sp" && S.zone) Shell.flash("OPEN SPACE", "Flying discs incoming", "#3ff0ff", 1200);
      if (zone === "b") Shell.flash("BACK LOT", "Mind the force fields", "#ff9b3f", 1200);
      if (zone === "boss") startBoss();
      S.zone = zone;
    }

    // firing
    S.fireT -= dt;
    if (I.fire && S.fireT <= 0 && S.bullets.length < 7) {
      S.fireT = 0.15;
      S.bullets.push({ f: S.cam + 14, s: S.s, z: S.z, life: 1.1 });
      SND.shoot();
    }

    // obstacles: collisions and passes
    var obs = S.L.obs;
    for (i = 0; i < obs.length; i++) {
      o = obs[i];
      if (o.passed) continue;
      if (S.cam > o.f + THICK + 6) {
        o.passed = true;
        if ((o.t === "zap" && o.z0 > 0) || o.t === "wallzap") { S.unders++; if (S.unders === 1) award("fff-under"); }
        if (o.t === "gate" || (o.t === "zap" && o.z0 > 0)) SND.whoosh();
        continue;
      }
      if (S.cam < o.f - 7 || S.inv > 0) continue;
      var lo = S.z - 3, hi = S.z + 3, hit = false;
      if (o.t === "wall") hit = lo < o.h;
      else if (o.t === "zap") hit = S.cam > o.f + 2 && S.cam < o.f + 8 && hi > o.z0 && lo < o.z1;
      else if (o.t === "wallzap") hit = lo < o.h || (S.cam > o.f + 2 && S.cam < o.f + 8 && hi > o.z0);
      else if (o.t === "gate") hit = !(S.s - 7 >= o.a && S.s + 7 <= o.b && hi < o.gh);
      if (hit) { die(o.t === "zap" ? "ZAPPED" : o.t === "wallzap" && hi > o.z0 && lo >= o.h ? "ZAPPED" : "HIT THE STACK"); return; }
    }
    // near a force field: a soft crackle
    for (i = 0; i < obs.length; i++) { o = obs[i]; if ((o.t === "zap" || o.t === "wallzap") && o.f - S.cam > 0 && o.f - S.cam < 120 && S.ticks % 9 === 0) { SND.zap(); break; } }

    // ground things
    var ents = S.L.ents;
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      if (e.dead) continue;
      var d = e.f - S.cam;
      if (d < -200) continue;
      if (S.inv <= 0 && Math.abs(d) < 10 && Math.abs(e.s - S.s) < 12 && S.z - 3 < e.h) { die("CRASHED"); return; }
      if (e.t === "turret" && d > 50 && d < 380) {
        e.cool -= dt;
        if (e.cool <= 0) { e.cool = Math.max(1.4, 2.6 - S.loop * 0.3) + Math.random() * 1.2; fireAt(e.f, e.s, e.h + 3, 92, "tag", 7); SND.turret(); }
      }
    }

    // flying discs: spawn waves as they come into view
    var waves = S.L.waves;
    for (i = 0; i < waves.length; i++) {
      var wv = waves[i];
      if (wv.done || wv.f - S.cam > 540) continue;
      wv.done = true;
      for (j = 0; j < wv.n; j++) S.discs.push({ f: wv.f + j * 34, s0: wv.s, s: wv.s, z0: wv.z, z: wv.z, ph: j * 0.9, kind: wv.kind, t: 0, cool: 1 + Math.random() * 2, spin: Math.random() * TAU });
    }
    for (i = S.discs.length - 1; i >= 0; i--) {
      var dc = S.discs[i];
      dc.t += dt; dc.spin += dt * 9; dc.f -= (46 + S.loop * 6) * dt;
      if (dc.kind === 0) dc.s = clamp(dc.s0 + Math.sin(dc.t * 1.6 + dc.ph) * 34, -66, 66);
      else if (dc.kind === 1) { dc.s = clamp(dc.s0 + Math.sin(dc.t * 1.2 + dc.ph) * 22, -66, 66); dc.z = clamp(dc.z0 + Math.sin(dc.t * 2 + dc.ph) * 18, 10, 96); }
      else { dc.s += (S.s - dc.s) * Math.min(1, dt * 0.6); dc.z += (S.z - dc.z) * Math.min(1, dt * 0.5); }
      var dd = dc.f - S.cam;
      if (dd > 80 && dd < 420) { dc.cool -= dt; if (dc.cool <= 0) { dc.cool = 3 + Math.random() * 2.5; fireAt(dc.f, dc.s, dc.z, 90, "tag", 6); } }
      if (S.inv <= 0 && Math.abs(dd) < 9 && Math.abs(dc.s - S.s) < 12 && Math.abs(dc.z - S.z) < 8) { S.discs.splice(i, 1); die("DISC COLLISION"); return; }
      if (dd < -220) S.discs.splice(i, 1);
    }

    // bullets
    for (i = S.bullets.length - 1; i >= 0; i--) {
      b = S.bullets[i];
      var f0 = b.f; b.f += (S.v + 380) * dt; b.life -= dt;
      var gone = b.life <= 0;
      // walls stop bullets
      for (j = 0; j < obs.length && !gone; j++) {
        o = obs[j];
        if (o.f > b.f || o.f + THICK < f0) continue;
        if ((o.t === "wall" || o.t === "wallzap") && b.z < o.h) gone = true;
        if (o.t === "gate" && !(b.s >= o.a && b.s <= o.b && b.z < o.gh)) gone = true;
        if (gone) boom(o.f, b.s, b.z, 4, ["#eceae2", "#ffd23f"], 30);
      }
      for (j = 0; j < ents.length && !gone; j++) {
        e = ents[j];
        if (e.dead || e.f + 7 < f0 || e.f - 7 > b.f) continue;
        if (Math.abs(e.s - b.s) < 11 && b.z < e.h + 4) { gone = true; hitEnt(e); }
      }
      for (j = S.discs.length - 1; j >= 0 && !gone; j--) {
        var q = S.discs[j];
        if (q.f + 8 < f0 || q.f - 8 > b.f) continue;
        if (Math.abs(q.s - b.s) < 11 && Math.abs(q.z - b.z) < 10) {
          gone = true; S.discs.splice(j, 1); S.discsHit++; addScore(PTS.disc);
          boom(q.f, q.s, q.z, 14, ["#3ff0ff", "#eceae2", "#a77bff"], 60); SND.disc();
        }
      }
      for (j = S.shots.length - 1; j >= 0 && !gone; j--) {
        var m = S.shots[j];
        if (m.kind !== "missile" || m.f + 8 < f0 || m.f - 8 > b.f) continue;
        if (Math.abs(m.s - b.s) < 10 && Math.abs(m.z - b.z) < 10) { gone = true; S.shots.splice(j, 1); addScore(PTS.missile); boom(m.f, m.s, m.z, 10, ["#ff3fa4", "#ffd23f"], 50); SND.disc(); }
      }
      if (!gone && S.boss && !S.boss.dead && b.f >= S.boss.f - 14) {
        gone = true;
        var bs = S.boss;
        if (Math.abs(b.s - bs.s) < 25 && b.z > 38 && b.z < 78) {
          bs.hp--; bs.flash = 0.12; addScore(PTS.bossHit); SND.bossHit();
          boom(bs.f - 14, b.s, b.z, 8, ["#9bff3f", "#eceae2"], 50);
          if (bs.hp <= 0) bossDown();
        } else if (Math.abs(b.s - bs.s) < 44 && b.z < 110) { SND.ping(); boom(bs.f - 14, b.s, b.z, 3, ["#8e93a2"], 30); }
        else gone = false;
      }
      if (gone) S.bullets.splice(i, 1);
    }

    moveShots(dt);
    stepBoss(dt, false);
  }

  function hitEnt(e) {
    e.dead = true;
    if (e.t === "tank") {
      S.tanks++; addScore(PTS.tank); S.fuel = Math.min(FUEL_MAX, S.fuel + 30);
      boom(e.f, e.s, 10, 36, ["#ff4b3e", "#ffd23f", "#eceae2", "#ff9b3f"], 80); SND.boom(true); SND.fuel(); Shell.shake(4, 0.25);
    } else if (e.t === "ears") {
      S.ears++; addScore(PTS.ears);
      boom(e.f, e.s, 8, 22, ["#3ff0ff", "#eceae2", "#a77bff"], 60); SND.boom(false); SND.ears();
      Shell.flash("1000", "Rabbit ears, no reception", "#3ff0ff", 800);
    } else {
      S.turrets++; addScore(PTS.turret);
      boom(e.f, e.s, 6, 18, ["#ff9b3f", "#ffd23f", "#8e93a2"], 55); SND.boom(false);
    }
  }

  function fireAt(f, s, z, spd, kind, spread) {
    // aim roughly where the ship will be (it moves forward at S.v), with a little spread so it can be dodged
    var sp = spread || 0;
    var df = S.cam - f, ds = S.s - s + (Math.random() - 0.5) * 2 * sp, dz = S.z - z + (Math.random() - 0.5) * 2 * sp, dist = Math.sqrt(df * df + ds * ds + dz * dz) || 1;
    var tt = dist / spd;
    df += S.v * tt * 0.6; dist = Math.sqrt(df * df + ds * ds + dz * dz) || 1;
    S.shots.push({ f: f, s: s, z: z, vf: df / dist * spd, vs: ds / dist * spd, vz: dz / dist * spd, life: 4, kind: kind || "tag" });
  }
  function moveShots(dt) {
    for (var i = S.shots.length - 1; i >= 0; i--) {
      var m = S.shots[i];
      m.f += m.vf * dt; m.s += m.vs * dt; m.z += m.vz * dt; m.life -= dt;
      if (m.kind === "missile" && m.life > 2) { m.vs += clamp(S.s - m.s, -1, 1) * 30 * dt; m.vz += clamp(S.z - m.z, -1, 1) * 22 * dt; }
      if (!S.dead && S.inv <= 0 && Math.abs(m.f - S.cam) < 7 && Math.abs(m.s - S.s) < 8 && Math.abs(m.z - S.z) < 6) { S.shots.splice(i, 1); die(m.kind === "missile" ? "MARKED DOWN" : "PRICE TAGGED"); return; }
      if (m.life <= 0 || m.z < -60 || m.f < S.cam - 260) S.shots.splice(i, 1);
    }
  }

  /* ---------------- Boss: the Haggletron ---------------- */
  function startBoss() {
    S.phase = "boss";
    S.boss = { f: S.cam + 215, s: 0, hp: 22 + S.loop * 4, max: 22 + S.loop * 4, t: 0, fire: 1.6, volley: 4.5, flash: 0, dead: 0, step: 0 };
    S.bossLost = S.lostLoop;
    Shell.flash("THE HAGGLETRON", "Shoot the price screen", "#9bff3f", 1600);
    Shell.tone(98, 0.6, "sawtooth", 0.2, 196); Shell.tone(147, 0.6, "square", 0.12, 98, 0.3);
  }
  function stepBoss(dt, frozen) {
    var B = S.boss;
    if (!B) return;
    B.t += dt; B.flash = Math.max(0, B.flash - dt);
    B.f = S.cam + 215;
    if (B.dead) {
      B.dead += dt;
      if (Math.random() < dt * 14) { boom(B.f, B.s + (Math.random() - 0.5) * 60, 10 + Math.random() * 90, 16, ["#ffd23f", "#ff4b3e", "#9bff3f", "#eceae2"], 70); SND.boom(Math.random() < 0.3); }
      if (B.dead > 1.9) nextLoop();
      return;
    }
    B.s = Math.sin(B.t * 0.85) * 40 + Math.sin(B.t * 2.3) * 6;
    if (frozen) return;
    B.fire -= dt; B.volley -= dt;
    if (B.fire <= 0) { B.fire = Math.max(0.8, 1.5 - S.loop * 0.2) + Math.random() * 0.5; fireAt(B.f - 14, B.s, 58, 100, "missile"); SND.missile(); }
    if (B.volley <= 0) {
      B.volley = 4.2;
      for (var k = -1; k <= 1; k++) { fireAt(B.f - 14, B.s + k * 18, 92, 92, "tag"); var m = S.shots[S.shots.length - 1]; m.vs += k * 16; }
      SND.turret();
    }
  }
  function bossDown() {
    var B = S.boss;
    B.dead = 0.0001; S.beaten++;
    addScore(PTS.boss + Math.round(S.fuel) * 20);
    var clean = S.lostLoop === 0;
    if (clean) S.cleanBeat++;
    if (S.fuel < 20) award("fff-fumes");
    if (clean) award("fff-clean");
    Shell.flash("HAGGLE OVER!", "+" + (PTS.boss + Math.round(S.fuel) * 20) + " incl. fuel bonus", "#9bff3f", 1800);
    Shell.shake(8, 0.8); SND.boom(true); SND.win();
    S.shots.length = 0;
  }
  function nextLoop() {
    S.loop++; S.lostLoop = 0;
    var base = S.cam + 420;
    S.L.spans[S.L.spans.length - 1][1] = base - 120;
    var keep = S.L.spans.slice();
    S.L = buildLevel(S.loop, base);
    S.L.spans = keep.concat(S.L.spans);
    S.v = V0 + Math.min(3, S.loop) * 10;
    S.boss = null; S.phase = "fly"; S.zone = "";
    Shell.flash("FORTRESS " + (S.loop + 1), "Faster stalls, meaner prices", "#ff9b3f", 1600);
  }

  /* ---------------- End of run ---------------- */
  function row(a, b) { return '<div class="np-row"><span>' + a + "</span><b>" + b + "</b></div>"; }
  function padsOff(on) { if (document.body.classList.contains("fff-touch")) { document.body.classList.toggle("fff-over", on); window.dispatchEvent(new Event("resize")); } }
  function finish() {
    if (window.__fffPads) window.__fffPads.clear();
    var reached = S.beaten > 0 ? "Fortress " + (S.loop + 1) : (S.cam - S.L.base > SEG.f2a ? "The Back Lot" : S.cam - S.L.base > SEG.sp ? "Open space" : "The Front Lot");
    Shell.gameOver(S.score, { title: S.beaten ? "HAGGLE OVER" : "SHIPS ALL GONE", html:
      row("Reached", reached) + row("Haggletrons beaten", S.beaten) + row("Fuel tanks shot", S.tanks) +
      row("Turrets shot", S.turrets) + row("Flying discs", S.discsHit) + row("Rabbit ears", S.ears),
      stats: { score: S.score, tanks: S.tanks, ears: S.ears, discs: S.discsHit, turrets: S.turrets, beaten: S.beaten, clean: S.cleanBeat, unders: S.unders, loop: S.loop } });
    padsOff(true);   // the game over card gets the full height on phones
  }

  /* ---------------- Drawing ---------------- */
  var STARS = [];
  (function () { var r = rng(4242); for (var i = 0; i < 90; i++) STARS.push({ x: r() * W, y: r() * H, d: 0.15 + r() * 0.6, c: r() < 0.15 ? "#ffd23f" : r() < 0.3 ? "#3ff0ff" : "#eceae2" }); })();

  function drawSpace(c) {
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0b0820"); g.addColorStop(1, "#151030");
    fr(c, 0, 0, W, H, g);
    var cam = S.cam;
    // a giant record drifting far away
    var rx = ((280 - cam * 0.02) % 520 + 520) % 520 - 80, ry = 110 + ((cam * 0.026) % 600 + 600) % 600 - 300;
    c.fillStyle = "#1b1636"; c.beginPath(); c.ellipse(rx, ry, 74, 30, -0.5, 0, TAU); c.fill();
    c.strokeStyle = "#251f48"; c.lineWidth = 1; for (var k = 1; k < 5; k++) { c.beginPath(); c.ellipse(rx, ry, 74 - k * 11, 30 - k * 4.5, -0.5, 0, TAU); c.stroke(); }
    c.fillStyle = "#5a2a4e"; c.beginPath(); c.ellipse(rx, ry, 16, 6.5, -0.5, 0, TAU); c.fill();
    for (var i = 0; i < STARS.length; i++) {
      var st = STARS[i], x = ((st.x - cam * FX * st.d) % W + W) % W, y = ((st.y - cam * FY * st.d) % H + H) % H;
      fr(c, x | 0, y | 0, st.d > 0.5 ? 2 : 1, st.d > 0.5 ? 2 : 1, st.c);
    }
  }

  var DECAL = ["#a33a3a", "#2d6a8f", "#7a5a2a", "#4d7a3a", "#6a3a7a"];
  function drawFloor(c, a, b) {
    var lo = Math.max(a, S.cam - 280), hi = Math.min(b, S.cam + 620);
    if (hi <= lo) return;
    // underside: the near edge and the front edge of the floating lot
    poly(c, [lo, HW, 0, hi, HW, 0, hi, HW, -26, lo, HW, -26], "#1e2130");
    if (a >= lo) { poly(c, [a, -HW, 0, a, HW, 0, a, HW, -26, a, -HW, -26], "#2a2e40"); }
    for (var u = Math.ceil(lo / 60) * 60; u < hi; u += 60) poly(c, [u, HW, -2, u + 4, HW, -2, u + 4, HW, -26, u, HW, -26], "#151826");
    poly(c, [lo, -HW, 0, lo, HW, 0, hi, HW, 0, hi, -HW, 0], "#3a3f55");
    // stall blankets with junk on them
    for (var f = Math.floor(lo / 60) * 60; f < hi; f += 60) {
      for (var k = 0; k < 4; k++) {
        var hsh = hash(Math.round(f / 60), k);
        if (hsh > 0.42) continue;
        var s0 = -HW + 6 + k * 35, f0 = f + 10, f1 = f + 42;
        if (f0 < lo || f1 > hi) continue;
        poly(c, [f0, s0, 0, f0, s0 + 24, 0, f1, s0 + 24, 0, f1, s0, 0], DECAL[(hsh * 50 | 0) % DECAL.length]);
        for (var it = 0; it < 3; it++) { var ff = f0 + 6 + it * 9, ss = s0 + 4 + ((hsh * 1000 + it * 7) % 14); box(c, ff, ff + 5, ss, ss + 5, 0, 3, ["#ffd23f", "#eceae2", "#3ff0ff", "#ff3fa4"][(it + k) % 4], "#1c1f2c", "#2a2e40"); }
      }
      // painted stall lines
      if (f >= lo) poly(c, [f, -HW, 0, f, HW, 0, f + 2, HW, 0, f + 2, -HW, 0], "#d9b23a");
    }
    // edge stripe
    poly(c, [lo, HW - 3, 0, hi, HW - 3, 0, hi, HW, 0, lo, HW, 0], "#ff9b3f");
    // far side: a long VHS shelf
    var sh = 22;
    poly(c, [lo, -HW, 0, hi, -HW, 0, hi, -HW, sh, lo, -HW, sh], "#4a2e1e");
    for (var v = Math.ceil(lo / 7) * 7; v < hi - 6; v += 7) {
      var hv = hash(v, 3);
      poly(c, [v, -HW, 3, v + 6, -HW, 3, v + 6, -HW, 10, v, -HW, 10], hv < 0.5 ? "#111" : "#1d1d26");
      poly(c, [v, -HW, 12, v + 6, -HW, 12, v + 6, -HW, 19, v, -HW, 19], hv > 0.7 ? "#1d1d26" : "#111");
      poly(c, [v + 1, -HW, 5, v + 5, -HW, 5, v + 5, -HW, 8, v + 1, -HW, 8], hv < 0.3 ? "#ff3fa4" : hv < 0.6 ? "#eceae2" : "#ffd23f");
    }
    poly(c, [lo, -HW, sh, hi, -HW, sh, hi, -HW + 6, sh, lo, -HW + 6, sh], "#6b4430");
  }

  var BOXC = [["#c8322d", "#eceae2"], ["#2a5fb0", "#ffd23f"], ["#e0a52a", "#1a1a22"], ["#2f8f5a", "#eceae2"], ["#7a3fa8", "#ffd23f"], ["#d9d4c4", "#c8322d"]];
  // the front face of a wall made of stacked game boxes (look 0) or VHS spines (look 1) or crates (look 2)
  function wallFace(c, o, z0, z1) {
    var f = o.f, rowsH = o.look === 1 ? 14 : 11, cw = o.look === 1 ? 7 : 17;
    poly(c, [f, -HW, z0, f, HW, z0, f, HW, z1, f, -HW, z1], o.look === 1 ? "#3a2418" : "#20222e");
    var r = 0;
    for (var z = z0; z < z1 - 1; z += rowsH, r++) {
      var zt = Math.min(z1, z + rowsH) - 1;
      for (var s = -HW + ((r % 2) ? cw / 2 : 0) - (r % 2 ? cw : 0); s < HW; s += cw) {
        var sa = Math.max(-HW, s + 0.8), sb = Math.min(HW, s + cw - 0.8);
        if (sb <= sa) continue;
        var hh = hash(Math.round(s * 3) + r * 31, Math.round(o.f));
        if (o.look === 1) {
          poly(c, [f, sa, z + 1, f, sb, z + 1, f, sb, zt, f, sa, zt], hh < 0.5 ? "#121216" : "#1f1f2a");
          poly(c, [f, sa + 1, z + 4, f, sb - 1, z + 4, f, sb - 1, zt - 3, f, sa + 1, zt - 3], hh < 0.33 ? "#eceae2" : hh < 0.66 ? "#ffd23f" : "#ff3fa4");
        } else if (o.look === 2) {
          poly(c, [f, sa, z + 0.5, f, sb, z + 0.5, f, sb, zt, f, sa, zt], hh < 0.5 ? "#9a6a3a" : "#8a5a30");
          poly(c, [f, sa, z + rowsH / 2 - 1, f, sb, z + rowsH / 2 - 1, f, sb, z + rowsH / 2, f, sa, z + rowsH / 2], "#5e3c1c");
        } else {
          var bc = BOXC[(hh * 60 | 0) % BOXC.length];
          poly(c, [f, sa, z + 0.5, f, sb, z + 0.5, f, sb, zt, f, sa, zt], bc[0]);
          poly(c, [f, sa + 2, zt - 4, f, sb - 2, zt - 4, f, sb - 2, zt - 2, f, sa + 2, zt - 2], bc[1]);
        }
      }
    }
  }
  function signOn(c, o, ztop, text, col) {
    if (!text) return;
    facePlane(c, o.f, -HW, ztop);
    c.font = '7px "Press Start 2P", monospace'; c.textAlign = "center"; c.textBaseline = "middle";
    var w = c.measureText(text).width + 8;
    c.fillStyle = "#101219"; c.fillRect(HW - w / 2, 2, w, 11);
    c.fillStyle = col || "#ffd23f"; c.fillText(text, HW, 8);
    c.restore();
  }
  function drawWall(c, o) {
    var h = o.h, f = o.f;
    poly(c, [f, HW, 0, f + THICK, HW, 0, f + THICK, HW, h, f, HW, h], "#151722");
    wallFace(c, o, 0, h);
    poly(c, [f, -HW, h, f, HW, h, f + THICK, HW, h, f + THICK, -HW, h], o.look === 1 ? "#6b4430" : "#454a62");
    if (h >= 26) signOn(c, o, h - 2, o.sign);
  }
  function drawPylons(c, o) {
    box(c, o.f, o.f + 6, -HW - 8, -HW - 2, 0, ZT, "#8e93a2", "#3a3f55", "#2c3040");
    box(c, o.f, o.f + 6, HW + 2, HW + 8, -26, ZT, "#8e93a2", "#3a3f55", "#2c3040");
  }
  function drawZap(c, o, z0, z1) {
    var f = o.f + 3, t = S.t;
    c.globalAlpha = 0.18 + 0.08 * Math.sin(t * 30);
    poly(c, [f, -HW - 2, z0, f, HW + 2, z0, f, HW + 2, z1, f, -HW - 2, z1], "#3ff0ff");
    c.globalAlpha = 1;
    c.lineWidth = 1.2;
    var n = Math.max(3, Math.round((z1 - z0) / 7));
    for (var k = 0; k <= n; k++) {
      var z = z0 + (z1 - z0) * k / n;
      c.strokeStyle = (k + Math.floor(t * 20)) % 3 ? "#9ff8ff" : "#ff3fa4";
      c.beginPath();
      for (var sI = 0; sI <= 14; sI++) {
        var s = -HW - 2 + (2 * HW + 4) * sI / 14, j = (sI === 0 || sI === 14) ? 0 : (hash(sI + k * 17, Math.floor(t * 24)) - 0.5) * 5;
        var x = PX(f, s), y = PY(f, s, z + j);
        if (sI) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
    }
    // emitters
    c.fillStyle = "#eceae2"; c.fillRect(PX(f, -HW - 5) - 2, PY(f, -HW - 5, z0) - 2, 4, 4); c.fillRect(PX(f, HW + 5) - 2, PY(f, HW + 5, Math.min(z1, ZT)) - 2, 4, 4);
  }
  function drawGateBack(c, o) {
    // inside of the opening: the far wall of the tunnel and its floor
    var f = o.f;
    poly(c, [f, o.a, 0, f + THICK, o.a, 0, f + THICK, o.a, o.gh, f, o.a, o.gh], "#0d0e16");
    poly(c, [f, o.a, 0, f, o.b, 0, f + THICK, o.b, 0, f + THICK, o.a, 0], "#262a3a");
  }
  function drawGate(c, o) {
    var f = o.f;
    poly(c, [f, HW, 0, f + THICK, HW, 0, f + THICK, HW, ZT, f, HW, ZT], "#151722");
    c.save();
    c.beginPath();
    var pts = [[-HW, 0], [HW, 0], [HW, ZT], [-HW, ZT]], hole = [[o.a, 0], [o.a, o.gh], [o.b, o.gh], [o.b, 0]], i;
    for (i = 0; i < 4; i++) { var x = PX(f, pts[i][0]), y = PY(f, pts[i][0], pts[i][1]); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.closePath();
    for (i = 0; i < 4; i++) { x = PX(f, hole[i][0]); y = PY(f, hole[i][0], hole[i][1]); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.closePath();
    c.clip("evenodd");
    wallFace(c, o, 0, ZT);
    c.restore();
    // lintel trim around the opening
    poly(c, [f, o.a - 3, o.gh, f, o.b + 3, o.gh, f, o.b + 3, o.gh + 3, f, o.a - 3, o.gh + 3], "#ff9b3f");
    poly(c, [f, o.a - 3, 0, f, o.a, 0, f, o.a, o.gh, f, o.a - 3, o.gh], "#ff9b3f");
    poly(c, [f, o.b, 0, f, o.b + 3, 0, f, o.b + 3, o.gh, f, o.b, o.gh], "#ff9b3f");
    poly(c, [f, -HW, ZT, f, HW, ZT, f + THICK, HW, ZT, f + THICK, -HW, ZT], "#454a62");
    signOn(c, o, ZT - 6, o.sign, o.sign === "FLEA FORTRESS" ? "#ff9b3f" : "#ffd23f");
  }

  function drawEnt(c, e) {
    var x = PX(e.f, e.s), y = PY(e.f, e.s, 0);
    if (e.t === "tank") {
      c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(x + 3, y + 1, 10, 4.5, 0, 0, TAU); c.fill();
      var top = y - 17;
      c.fillStyle = "#c8322d"; c.fillRect(x - 8, top, 16, 17);
      c.fillStyle = "#eceae2"; c.fillRect(x - 8, top + 5, 16, 6);
      c.fillStyle = "#8a1f1c"; c.fillRect(x + 3, top, 5, 17);
      c.fillStyle = "#c8322d"; c.beginPath(); c.ellipse(x, y, 8, 3.5, 0, 0, Math.PI); c.fill();
      c.fillStyle = "#e85a50"; c.beginPath(); c.ellipse(x, top, 8, 3.5, 0, 0, TAU); c.fill();
      c.fillStyle = "#3a3f55"; c.fillRect(x - 2, top - 4, 4, 3);
      c.font = '5px "Press Start 2P", monospace'; c.textAlign = "center"; c.textBaseline = "top"; c.fillStyle = "#c8322d"; c.fillText("FUEL", x - 1, top + 6);
    } else if (e.t === "ears") {
      box(c, e.f - 7, e.f + 7, e.s - 8, e.s + 8, 0, 12, "#6b4430", "#4a2e1e", "#3a2418");
      poly(c, [e.f - 7, e.s - 6, 2, e.f - 7, e.s + 4, 2, e.f - 7, e.s + 4, 10, e.f - 7, e.s - 6, 10], (S.ticks >> 2) % 2 ? "#9ff8ff" : "#6fd0e0");
      var tx = PX(e.f, e.s), ty = PY(e.f, e.s, 12), wob = Math.sin(S.t * 3 + e.f) * 2;
      c.strokeStyle = "#c2ccd4"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx - 9 + wob, ty - 15); c.moveTo(tx, ty); c.lineTo(tx + 8 - wob, ty - 16); c.stroke();
      fr(c, tx - 10 + wob, ty - 17, 3, 3, "#eceae2"); fr(c, tx + 7 - wob, ty - 18, 3, 3, "#eceae2");
    } else {
      box(c, e.f - 6, e.f + 6, e.s - 6, e.s + 6, 0, 6, "#5a6078", "#3a3f55", "#2c3040");
      var cx = PX(e.f, e.s), cy = PY(e.f, e.s, 7);
      c.fillStyle = "#ff9b3f"; c.beginPath(); c.arc(cx, cy, 5, Math.PI, 0); c.fill();
      var ax = PX(S.cam, S.s) - cx, ay = PY(S.cam, S.s, S.z) - cy, al = Math.sqrt(ax * ax + ay * ay) || 1;
      c.strokeStyle = "#1a1a22"; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy - 1); c.lineTo(cx + ax / al * 9, cy - 1 + ay / al * 9); c.stroke();
      c.fillStyle = e.cool < 0.25 && (S.ticks >> 1) % 2 ? "#ff4b3e" : "#ffd23f"; c.fillRect(cx - 1, cy - 4, 2, 2);
    }
  }

  function drawDisc(c, d) {
    var x = PX(d.f, d.s), y = PY(d.f, d.s, d.z);
    if (onFloor(d.f)) { c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(PX(d.f, d.s), PY(d.f, d.s, 0), 8, 3.5, 0, 0, TAU); c.fill(); }
    var sq = 0.35 + 0.65 * Math.abs(Math.cos(d.spin));
    c.fillStyle = "#0d0d12"; c.beginPath(); c.ellipse(x, y, 10, 10 * sq * 0.5 + 1, -0.35, 0, TAU); c.fill();
    c.strokeStyle = "#3a3f55"; c.lineWidth = 1; c.beginPath(); c.ellipse(x, y, 7, 7 * sq * 0.5 + 0.5, -0.35, 0, TAU); c.stroke();
    c.fillStyle = d.kind === 2 ? "#ff3fa4" : d.kind === 1 ? "#ffd23f" : "#3ff0ff"; c.beginPath(); c.ellipse(x, y, 3.5, 3.5 * sq * 0.5 + 0.5, -0.35, 0, TAU); c.fill();
  }

  function drawBoss(c, B) {
    var f = B.f, s = B.s, fl = B.flash > 0, st = Math.sin(B.t * 5) * 3, KS = 1.5, KZ = 1.25;
    var dead = B.dead ? Math.min(1, B.dead / 1.6) : 0, sink = dead * 40;
    // model space: df/ds scaled by KS, z by KZ, sinking when beaten
    function bx(f0, f1, s0, s1, z0, z1, t, fr2, sd) { box(c, f + f0 * KS, f + f1 * KS, s + s0 * KS, s + s1 * KS, z0 * KZ - sink, z1 * KZ - sink, t, fr2, sd); }
    function fq(df, s0, s1, z0, z1, col) { poly(c, [f + df * KS, s + s0 * KS, z0 * KZ - sink, f + df * KS, s + s1 * KS, z0 * KZ - sink, f + df * KS, s + s1 * KS, z1 * KZ - sink, f + df * KS, s + s0 * KS, z1 * KZ - sink], col); }
    c.fillStyle = "rgba(0,0,0,.4)"; c.beginPath(); c.ellipse(PX(f, s) + 6, PY(f, s, 0), 50, 19, -0.2, 0, TAU); c.fill();
    // legs (the far leg first)
    bx(-6 + st, 6 + st, -16, -6, 0, 8, "#5a6078", "#3a3f55", "#2c3040");
    bx(-4, 4, -14, -8, 8, 30, "#8e93a2", "#5a6078", "#3a3f55");
    bx(-6 - st, 6 - st, 6, 16, 0, 8, "#5a6078", "#3a3f55", "#2c3040");
    bx(-4, 4, 8, 14, 8, 30, "#8e93a2", "#5a6078", "#3a3f55");
    bx(-5, 5, -28, -19, 36, 58, "#b8ad90", "#8a8068", "#6b634e");
    // torso: a cash register
    bx(-9, 9, -19, 19, 30, 62, fl ? "#ffffff" : "#e2d8bb", fl ? "#ffffff" : "#c9bd9a", fl ? "#dddddd" : "#9a8e6c");
    // price screen (the weak spot)
    fq(-9, -15, 15, 40, 58, fl ? "#3a6a40" : "#0b1a10");
    c.save(); c.transform(SX * KS, SY * KS, 0, ZK * KZ, PX(f - 9 * KS, s - 15 * KS), PY(f - 9 * KS, s - 15 * KS, 58 * KZ - sink));
    c.font = '8px "Press Start 2P", monospace'; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = fl ? "#eceae2" : "#9bff3f"; c.fillText("$" + Math.max(0, B.hp * 25), 15, 9.5);
    c.restore();
    fq(-9, -17, 17, 32, 37, "#8a8068");
    fq(-9, -2, 2, 33.5, 35.5, "#ffd23f");
    for (var k = 0; k < 4; k++) bx(-9, -5, -14 + k * 8, -9 + k * 8, 62, 64, ["#ff4b3e", "#ffd23f", "#3ff0ff", "#eceae2"][k], null, null);
    // head: an old TV
    bx(-7, 7, -13, 13, 64, 86, "#7a5a3a", "#5e4430", "#4a3424");
    fq(-7, -10, 7, 67, 83, B.dead ? "#202020" : "#2a3a40");
    if (!B.dead) {
      fq(-7, -7, -3, 76, 79, "#ff4b3e"); fq(-7, 1, 5, 76, 79, "#ff4b3e");
      poly(c, [f - 7 * KS, s - 8 * KS, 81 * KZ, f - 7 * KS, s - 3 * KS, 79.5 * KZ, f - 7 * KS, s - 3 * KS, 80.5 * KZ, f - 7 * KS, s - 8 * KS, 82 * KZ], "#ff4b3e");
      poly(c, [f - 7 * KS, s + 1 * KS, 80.5 * KZ, f - 7 * KS, s + 6 * KS, 82 * KZ, f - 7 * KS, s + 6 * KS, 81 * KZ, f - 7 * KS, s + 1 * KS, 79.5 * KZ], "#ff4b3e");
      fq(-7, -6, 4, 70, 71.5, "#ff4b3e");
    }
    var hx = PX(f, s), hy = PY(f, s, 86 * KZ - sink);
    c.strokeStyle = "#c2ccd4"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx - 18, hy - 28); c.moveTo(hx, hy); c.lineTo(hx + 20, hy - 25); c.stroke();
    fr(c, hx - 21, hy - 31, 5, 5, "#ff4b3e"); fr(c, hx + 18, hy - 28, 5, 5, "#ff4b3e");
    // near arm with the price gun
    bx(-5, 5, 19, 28, 36, 58, "#b8ad90", "#8a8068", "#6b634e");
    bx(-14, -5, 21, 27, 40, 47, "#ff9b3f", "#c26a20", "#9a5418");
  }

  function drawShip(c) {
    if (S.dead) return;
    if (S.inv > 0 && (S.ticks >> 2) % 2) return;
    var f = S.cam, s = S.s, z = S.z, b = S.bank * 3;
    // shadow on the floor or on a wall top
    var gz = onFloor(f) ? 0 : null, o, i;
    for (i = 0; i < S.L.obs.length; i++) { o = S.L.obs[i]; if (f >= o.f && f <= o.f + THICK) { if (o.t === "wall" || o.t === "wallzap") gz = o.h; else if (o.t === "gate") gz = (s >= o.a && s <= o.b) ? 0 : ZT; } }
    if (gz !== null && gz < z) {
      poly(c, [f + 16, s, gz, f - 6, s - 13, gz, f - 9, s, gz, f - 6, s + 13, gz], "rgba(0,0,0,.5)");
      // drop line, so height is easy to read
      c.strokeStyle = "rgba(255,210,63,.35)"; c.lineWidth = 1; c.setLineDash([2, 3]);
      c.beginPath(); c.moveTo(PX(f, s), PY(f, s, gz)); c.lineTo(PX(f, s), PY(f, s, z - 2)); c.stroke(); c.setLineDash([]);
    }
    // body (drawn 1.3x around its own point so it reads well on phones)
    var ox = PX(f, s), oy = PY(f, s, z);
    c.save(); c.translate(ox, oy); c.scale(1.3, 1.3); c.translate(-ox, -oy);
    poly(c, [f + 16, s, z + 1, f - 6, s - 13, z - b, f - 9, s, z], "#eceae2");
    poly(c, [f + 16, s, z + 1, f - 9, s, z, f - 6, s + 13, z + b], "#b9b4a6");
    poly(c, [f + 10, s - 1, z + 1, f - 3, s - 8, z - b * 0.6, f - 3, s - 5, z - b * 0.4], "#ff4b3e");
    poly(c, [f + 10, s + 1, z + 1, f - 3, s + 5, z + b * 0.4, f - 3, s + 8, z + b * 0.6], "#c8322d");
    poly(c, [f - 8, s, z, f - 2, s, z + 1, f - 8, s, z + 9], "#ff4b3e");
    poly(c, [f + 9, s - 1.5, z + 1.5, f + 2, s - 2.5, z + 2.5, f + 2, s + 2.5, z + 2.5, f + 9, s + 1.5, z + 1.5], "#3ff0ff");
    var gx = PX(f - 10, s), gy = PY(f - 10, s, z);
    fr(c, gx - 2, gy - 1, 3, 3, (S.ticks >> 1) % 2 ? "#ffd23f" : "#ff9b3f");
    c.restore();
  }

  function drawBullet(c, b) {
    var x = PX(b.f, b.s), y = PY(b.f, b.s, b.z);
    if (onFloor(b.f)) fr(c, PX(b.f, b.s) - 1, PY(b.f, b.s, 0) - 1, 3, 2, "rgba(0,0,0,.45)");
    c.strokeStyle = "#ffd23f"; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x - FX * 12, y - FY * 12); c.stroke();
    fr(c, x - 1, y - 1, 3, 3, "#ffffff");
  }
  function drawShot(c, m) {
    var x = PX(m.f, m.s), y = PY(m.f, m.s, m.z);
    if (onFloor(m.f)) fr(c, PX(m.f, m.s) - 2, PY(m.f, m.s, 0) - 1, 4, 2, "rgba(0,0,0,.4)");
    if (m.kind === "missile") {
      c.fillStyle = "#ff9b3f"; c.beginPath(); c.arc(x + FX * 6, y + FY * 6, 2.5, 0, TAU); c.fill();
      c.fillStyle = "#eceae2"; c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x, y - 4); c.lineTo(x + 6, y); c.lineTo(x, y + 4); c.closePath(); c.fill();
      fr(c, x - 1, y - 1, 2, 2, "#c8322d");
    } else {
      var p = (S.ticks >> 2) % 2;
      c.fillStyle = p ? "#ff3fa4" : "#ffd0e8";
      c.beginPath(); c.moveTo(x - 4, y - 2); c.lineTo(x + 2, y - 4); c.lineTo(x + 4, y + 1); c.lineTo(x - 2, y + 3); c.closePath(); c.fill();
      fr(c, x - 2, y - 1, 2, 2, "#101219");
    }
  }

  function aimed() {
    // is something lined up with the nose? (drives the reticle color)
    var i, e, best = null, bd = 1e9;
    for (i = 0; i < S.L.ents.length; i++) { e = S.L.ents[i]; var d = e.f - S.cam; if (!e.dead && d > 20 && d < 360 && Math.abs(e.s - S.s) < 11 && S.z < e.h + 4 && d < bd) { bd = d; best = [e.f, e.s, e.h * 0.6]; } }
    for (i = 0; i < S.discs.length; i++) { e = S.discs[i]; d = e.f - S.cam; if (d > 20 && d < 360 && Math.abs(e.s - S.s) < 11 && Math.abs(e.z - S.z) < 10 && d < bd) { bd = d; best = [e.f, e.s, e.z]; } }
    var B = S.boss; if (B && !B.dead && Math.abs(B.s - S.s) < 25 && S.z > 38 && S.z < 78) best = [B.f - 14, B.s, S.z];
    return best;
  }

  function drawHUD(c, state) {
    // top strip
    fr(c, 0, 0, W, 24, "rgba(16,18,25,.82)");
    Shell.text(c, "SCORE", 8, 4, 6, "#8e93a2");
    Shell.text(c, String(S.score), 8, 13, 8, "#eceae2");
    var hi = Math.max(Shell.best() || 0, S.score);
    Shell.text(c, "HIGH", W / 2, 4, 6, "#8e93a2", "center");
    Shell.text(c, String(hi), W / 2, 13, 8, "#ffd23f", "center");
    for (var l = 0; l < S.lives; l++) {
      var lx = W - 14 - l * 15;
      c.fillStyle = "#eceae2"; c.beginPath(); c.moveTo(lx, 7); c.lineTo(lx + 6, 18); c.lineTo(lx, 15); c.lineTo(lx - 6, 18); c.closePath(); c.fill();
      fr(c, lx - 1, 10, 2, 3, "#ff4b3e");
    }
    // progress to the Haggletron
    var prog = clamp((S.cam - S.L.base) / SEG.boss, 0, 1);
    fr(c, 0, 24, W, 3, "#1d2029"); fr(c, 0, 24, W * prog, 3, S.phase === "boss" ? "#9bff3f" : "#ff9b3f");
    if (state === "title") return;

    // altimeter
    var ax = 8, at = 120, ab = 400, ah = ab - at;
    fr(c, ax - 3, at - 14, 22, ah + 30, "rgba(16,18,25,.75)");
    Shell.text(c, "ALT", ax - 1, at - 11, 5, "#8e93a2");
    fr(c, ax + 4, at, 6, ah, "#2c3040");
    // the next obstacle's blocked heights in red, the open band in green
    var nx = null;
    for (var i = 0; i < S.L.obs.length; i++) { var o = S.L.obs[i]; if (!o.passed && o.f + THICK - S.cam > -4 && o.f - S.cam < 300) { nx = o; break; } }
    function band(z0, z1, col) { z0 = clamp(z0, 0, ZMAX + 4); z1 = clamp(z1, 0, ZMAX + 4); if (z1 <= z0) return; var y0 = ab - z1 / (ZMAX + 4) * ah, y1 = ab - z0 / (ZMAX + 4) * ah; fr(c, ax + 4, y0, 6, y1 - y0, col); }
    if (nx) {
      var red = "rgba(255,75,62,.85)", grn = "rgba(155,255,63,.6)";
      if (nx.t === "wall") { band(0, nx.h, red); band(nx.h, ZMAX + 4, grn); }
      else if (nx.t === "zap") { band(nx.z0, nx.z1, red); band(0, nx.z0, grn); band(nx.z1, ZMAX + 4, grn); }
      else if (nx.t === "wallzap") { band(0, nx.h, red); band(nx.h, nx.z0, grn); band(nx.z0, ZMAX + 4, red); }
      else if (nx.t === "gate") { band(0, nx.gh, grn); band(nx.gh, ZMAX + 4, red); }
    }
    for (var tk = 0; tk <= 100; tk += 20) { var ty = ab - tk / (ZMAX + 4) * ah; fr(c, ax, ty, 3, 1, "#8e93a2"); }
    var sy = ab - clamp(S.z, 0, ZMAX) / (ZMAX + 4) * ah;
    c.fillStyle = S.falling ? "#ff4b3e" : "#ffd23f"; c.beginPath(); c.moveTo(ax + 1, sy); c.lineTo(ax + 15, sy - 5); c.lineTo(ax + 15, sy + 5); c.closePath(); c.fill();
    Shell.text(c, String(Math.round(S.z)), ax - 1, ab + 4, 5, "#eceae2");

    // fuel gauge
    var fw = 150, fx = W - fw - 10, fy = H - 20, fu = S.fuel / FUEL_MAX, low = S.fuel < 25;
    fr(c, fx - 44, fy - 5, fw + 50, 18, "rgba(16,18,25,.8)");
    Shell.text(c, "FUEL", fx - 40, fy, 6, low && (S.ticks >> 4) % 2 ? "#ff4b3e" : "#8e93a2");
    fr(c, fx, fy - 1, fw, 9, "#2c3040");
    fr(c, fx, fy - 1, fw * fu, 9, fu > 0.5 ? "#9bff3f" : fu > 0.25 ? "#ffd23f" : "#ff4b3e");
    for (var q = 1; q < 4; q++) fr(c, fx + fw * q / 4, fy - 1, 1, 9, "rgba(16,18,25,.7)");
    if (low && S.fuel > 0 && (S.ticks >> 4) % 2) Shell.text(c, "LOW FUEL", W / 2, H - 46, 8, "#ff4b3e", "center");

    // boss meter
    var B = S.boss;
    if (B && !B.dead) {
      Shell.text(c, "HAGGLETRON", W / 2, 34, 6, "#9bff3f", "center");
      fr(c, W / 2 - 70, 44, 140, 6, "#2c3040"); fr(c, W / 2 - 70, 44, 140 * B.hp / B.max, 6, "#9bff3f");
    }
  }

  function draw(c, state) {
    if (state === "title") S.cam = -260 + (idleT * 70) % 2600;
    drawSpace(c);
    var i, sp = S.L.spans;
    for (i = 0; i < sp.length; i++) drawFloor(c, sp[i][0], sp[i][1]);
    var list = [], lo = S.cam - 280, hi = S.cam + 640, o;
    for (i = 0; i < S.L.obs.length; i++) {
      o = S.L.obs[i];
      if (o.f + THICK < lo || o.f > hi) continue;
      if (o.t === "gate") { list.push({ k: o.f + THICK, d: drawGateBack, o: o }); list.push({ k: o.f, d: drawGate, o: o }); }
      else if (o.t === "wall") list.push({ k: o.f + THICK, d: drawWall, o: o });
      else if (o.t === "zap") { list.push({ k: o.f + 6, d: drawPylons, o: o }); list.push({ k: o.f + 3, d: function (c2, oo) { drawZap(c2, oo, oo.z0, Math.min(oo.z1, ZT)); }, o: o }); }
      else if (o.t === "wallzap") { list.push({ k: o.f + THICK, d: function (c2, oo) { drawPylons(c2, oo); drawWall(c2, oo); }, o: o }); list.push({ k: o.f + 3, d: function (c2, oo) { drawZap(c2, oo, oo.z0, ZT); }, o: o }); }
    }
    for (i = 0; i < S.L.ents.length; i++) { o = S.L.ents[i]; if (!o.dead && o.f > lo && o.f < hi) list.push({ k: o.f, d: drawEnt, o: o }); }
    if (state !== "title") {
      for (i = 0; i < S.discs.length; i++) list.push({ k: S.discs[i].f, d: drawDisc, o: S.discs[i] });
      for (i = 0; i < S.shots.length; i++) list.push({ k: S.shots[i].f, d: drawShot, o: S.shots[i] });
      for (i = 0; i < S.bullets.length; i++) list.push({ k: S.bullets[i].f, d: drawBullet, o: S.bullets[i] });
      if (S.boss) list.push({ k: S.boss.f, d: drawBoss, o: S.boss });
      list.push({ k: S.cam + 0.5, d: drawShip, o: null });
    }
    list.sort(function (a, b) { return b.k - a.k; });
    for (i = 0; i < list.length; i++) list[i].d(c, list[i].o);
    // particles and rings on top
    for (i = 0; i < S.parts.length; i++) { var p = S.parts[i]; c.globalAlpha = clamp(p.life * 2, 0, 1); fr(c, PX(p.f, p.s) - p.sz / 2, PY(p.f, p.s, p.z) - p.sz / 2, p.sz, p.sz, p.c); }
    c.globalAlpha = 1;
    for (i = 0; i < S.rings.length; i++) {
      var r = S.rings[i], k = r.t / r.max;
      c.globalAlpha = 1 - k; c.strokeStyle = r.c; c.lineWidth = 3;
      c.beginPath(); c.ellipse(PX(r.f, r.s), PY(r.f, r.s, r.z), r.r * (0.3 + k), r.r * (0.3 + k) * 0.6, 0, 0, TAU); c.stroke();
    }
    c.globalAlpha = 1;
    // aim reticle ahead of the nose
    if (state !== "title" && !S.dead) {
      var am = aimed(), rf = S.cam + 90, rx = PX(rf, S.s), ry = PY(rf, S.s, S.z);
      if (am) { rx = PX(am[0], am[1]); ry = PY(am[0], am[1], am[2]); }
      c.strokeStyle = am ? "#9bff3f" : "rgba(236,234,226,.35)"; c.lineWidth = 1;
      c.strokeRect(rx - 5, ry - 5, 10, 10); fr(c, rx - 1, ry - 1, 2, 2, am ? "#9bff3f" : "rgba(236,234,226,.5)");
    }
    drawHUD(c, state);
    if (state === "title") {
      Shell.text(c, "FLEA FORTRESS", W / 2, 70, 14, "#ff9b3f", "center", "#ff9b3f");
      Shell.text(c, "FLYBY", W / 2, 92, 14, "#ffd23f", "center", "#ffd23f");
    }
  }

  /* ---------------- Thumb controls (touch) ---------------- */
  function buildPads() {
    var st = document.createElement("style");
    st.textContent =
      ".fff-main{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);grid-template-areas:'st'}" +
      ".fff-main>.np-stage{grid-area:st;min-width:0;min-height:0}" +
      ".fff-pad{display:none;align-items:center;justify-content:center;padding:8px 12px calc(10px + env(safe-area-inset-bottom,0px));background:#0b0c12;touch-action:none;user-select:none;-webkit-user-select:none}" +
      "body.fff-touch .fff-main{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;grid-template-areas:'st st' 'pl pr'}" +
      "body.fff-touch .fff-pad{display:flex}body.fff-touch.fff-over .fff-pad{display:none}body.fff-touch.fff-over .fff-main{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);grid-template-areas:'st'}.fff-l{grid-area:pl;justify-content:flex-start}.fff-r{grid-area:pr;justify-content:flex-end;gap:10px}" +
      ".fff-stick{position:relative;width:150px;height:150px;border-radius:50%;border:2px solid #2c3040;background:radial-gradient(circle,#1d2029 0 55%,#151722 56%);touch-action:none}" +
      ".fff-stick i{position:absolute;font:700 11px/1 Silkscreen,monospace;color:#8e93a2;font-style:normal;pointer-events:none}" +
      ".fff-stick .u{top:9px;left:50%;transform:translateX(-50%);color:#ffd23f}.fff-stick .d{bottom:9px;left:50%;transform:translateX(-50%);color:#ffd23f}.fff-stick .l{left:9px;top:50%;transform:translateY(-50%)}.fff-stick .r{right:9px;top:50%;transform:translateY(-50%)}" +
      ".fff-knob{position:absolute;left:50%;top:50%;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;background:#2c3040;border:2px solid #ff9b3f;box-shadow:0 0 14px rgba(255,155,63,.35);pointer-events:none}" +
      ".fff-fire{width:112px;height:112px;border-radius:50%;border:3px solid #ff4b3e;background:#2a1418;color:#ffd23f;font:400 14px/1 'Press Start 2P',monospace;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}" +
      ".fff-fire.on{background:#ff4b3e;color:#101219}" +
      "@media (orientation:landscape){body.fff-touch .fff-main{grid-template-columns:auto minmax(0,1fr) auto;grid-template-rows:minmax(0,1fr);grid-template-areas:'pl st pr'}" +
      ".fff-pad{padding:6px 10px calc(6px + env(safe-area-inset-bottom,0px))}.fff-stick{width:132px;height:132px}.fff-knob{width:54px;height:54px;margin:-27px 0 0 -27px}.fff-fire{width:96px;height:96px}}" +
      "@media (orientation:portrait) and (max-height:700px){.fff-stick{width:128px;height:128px}.fff-fire{width:96px;height:96px}}";
    document.head.appendChild(st);
    var stage = document.getElementById("np-stage"), main = document.createElement("div");
    main.className = "fff-main";
    stage.parentNode.insertBefore(main, stage);
    main.appendChild(stage);
    var L = document.createElement("div"), R = document.createElement("div");
    L.className = "fff-pad fff-l"; R.className = "fff-pad fff-r";
    L.innerHTML = '<div class="fff-stick" role="group" aria-label="Steer and altitude"><i class="u">UP</i><i class="d">DOWN</i><i class="l">&lt;</i><i class="r">&gt;</i><div class="fff-knob"></div></div>';
    R.innerHTML = '<button class="fff-fire" type="button" aria-label="Fire">FIRE</button>';
    main.appendChild(L); main.appendChild(R);
    var stick = L.querySelector(".fff-stick"), knob = L.querySelector(".fff-knob"), fire = R.querySelector(".fff-fire"), sid = null, fid = null;
    function setStick(ev) {
      var r = stick.getBoundingClientRect(), rad = r.width / 2;
      var dx = (ev.clientX - r.left - rad) / (rad * 0.62), dy = (ev.clientY - r.top - rad) / (rad * 0.62);
      var m = Math.sqrt(dx * dx + dy * dy); if (m > 1) { dx /= m; dy /= m; }
      pad.ax = Math.abs(dx) < 0.18 ? 0 : dx; pad.ay = Math.abs(dy) < 0.18 ? 0 : -dy;
      knob.style.transform = "translate(" + (dx * rad * 0.55) + "px," + (dy * rad * 0.55) + "px)";
    }
    function clearStick() { sid = null; pad.ax = pad.ay = 0; knob.style.transform = ""; }
    stick.addEventListener("pointerdown", function (ev) {
      ev.preventDefault(); if (Shell.state() !== "playing") return;
      sid = ev.pointerId; try { stick.setPointerCapture(sid); } catch (er) { } setStick(ev);
    });
    stick.addEventListener("pointermove", function (ev) { if (ev.pointerId === sid) setStick(ev); });
    stick.addEventListener("pointerup", function (ev) { if (ev.pointerId === sid) clearStick(); });
    stick.addEventListener("pointercancel", function (ev) { if (ev.pointerId === sid) clearStick(); });
    fire.addEventListener("pointerdown", function (ev) {
      ev.preventDefault(); if (Shell.state() !== "playing") return;
      fid = ev.pointerId; try { fire.setPointerCapture(fid); } catch (er) { } pad.fire = true; fire.classList.add("on");
    });
    function fireUp(ev) { if (ev.pointerId === fid) { fid = null; pad.fire = false; fire.classList.remove("on"); } }
    fire.addEventListener("pointerup", fireUp); fire.addEventListener("pointercancel", fireUp);
    fire.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
    stick.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
    var q = /[?&]pads=([01])/.exec(location.search);
    var touch = q ? q[1] === "1" : !!(window.matchMedia && (matchMedia("(pointer: coarse)").matches || matchMedia("(hover: none)").matches));
    function setTouch(on) { document.body.classList.toggle("fff-touch", on); window.dispatchEvent(new Event("resize")); }
    setTouch(touch);
    if (!q) window.addEventListener("pointerdown", function (ev) { if (ev.pointerType === "touch" && !document.body.classList.contains("fff-touch")) setTouch(true); }, true);
    window.__fffPads = { clear: function () { clearStick(); pad.fire = false; fid = null; fire.classList.remove("on"); } };
  }

  // Hook for automated checks (no effect on play)
  window.__fff = { S: function () { return S; }, tick: tick, update: update, pad: pad, keys: keys, buildLevel: buildLevel,
    consts: { STEP: STEP, V0: V0, ZMAX: ZMAX, ZMIN: ZMIN, HW: HW, SEG: SEG, FUEL_MAX: FUEL_MAX, DRAIN: DRAIN, THICK: THICK } };

  /* ---------------- Arcade setup (the only part tied to the shared shell) ---------------- */
  Shell.init({
    slug: "flea-fortress-flyby",
    title: "FLEA FORTRESS FLYBY",
    accent: "#ff9b3f",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "A swap meet the size of a moon is floating by. Fly the Bargain Hunter through it: climb over box walls, slip under force fields, shoot price gun turrets and blast fuel tanks to top off. The Haggletron waits at the far end.",
    keys: "Phone: left thumb steers (up climbs, down dives), right thumb holds FIRE. Keys: arrows or WASD to steer and climb, Space or J to fire. P pause, M mute, R restart.",
    tip: "Watch your shadow and the ALT meter. Green on the meter is the safe height for the next wall.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: function () {},
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { for (var k in keys) keys[k] = false; if (window.__fffPads) window.__fffPads.clear(); }
  });
  buildPads();
  Shell.onRestart(function () { padsOff(false); });
})();
