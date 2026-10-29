/* SCROOGE'S HAUNT: SPIRIT RUSH 1843. A Christmas boss rush built on the Creature Feature KO engine.
   Source: Charles Dickens, "A Christmas Carol" (1843), public domain. All art is drawn here in code.
   The Nostalgia Pro collector (same pixel recipe as the main game, plus a winter scarf) slides along
   the cobblestones. Slide to dodge. Stand still to throw spirit tokens straight up (the counter-attack):
   stand under a spirit to hit it, and tokens also smash falling ledgers in the last fight.
   Four spirits, one midnight clock. Out of hearts? Spend another credit, but the clock keeps running.
   Logical canvas 360 x 540. Seconds and logical pixels.
   Testing: ?stage=2 (1-4) starts at that spirit as PRACTICE (full-run trophies stay locked),
   ?debug=1 exposes window.SH_DEBUG. */
(function () {
  "use strict";
  var W = 360, H = 540, TAU = Math.PI * 2;
  var FLOOR = 498, HERO_Y = 450, HERO_HW = 9, BOSS_Y = 166;
  var HEARTS = 5, FIRE = 0.15, SHOT_V = 620, IFRAMES = 1.4, RUN = 210, CLOSE = 0.15, LANE = 90;
  var GREEN = "#3fd07a", GOLD = "#ffd23f", RED = "#e4343e", SLUG = "scrooges-haunt";
  var Sh = window.Shell;

  /* Dickens' four visitors. Looks follow the 1843 text only; every shape below is original. */
  var BOSSES = [
    { id: "past", name: "GHOST OF CHRISTMAS PAST", sub: "A flame for a crown, a cap to snuff it", hp: 85, hw: 24, speed: 0.8, amp: 105, col: "#fff3b0", par: 36,
      intro: "\"Look upon what was, collector!\"", ko: "\"The candle dims to ash!\"", pickup: "watch" },
    { id: "present", name: "GHOST OF CHRISTMAS PRESENT", sub: "Green robe, holly crown, a torch of plenty", hp: 130, hw: 34, speed: 0.55, amp: 85, col: GREEN, par: 44,
      intro: "\"Feast your eyes on the now!\"", ko: "\"My time on this earth is done!\"", pickup: "plum" },
    { id: "future", name: "GHOST OF CHRISTMAS YET TO COME", sub: "Silent. Hooded. Pointing.", hp: 150, hw: 22, speed: 0.7, amp: 120, col: "#a8aab4", par: 52,
      intro: "\"...\"", ko: "\"The shroud collapses!\"", pickup: "lily" },
    { id: "marley", name: "MARLEY'S SPECTER", sub: "Fused to The Greed Manifest, a Victorian safe", hp: 190, hw: 36, speed: 0.6, amp: 85, col: "#c9a26a", par: 60,
      intro: "\"You forged this chain link by link!\"", ko: "\"The heavy links shatter forever!\"", pickup: "key" }
  ];
  var PICK = {
    watch: { name: "POCKET WATCH", sub: "+10 seconds, quick feet", col: GOLD },
    plum: { name: "SUGAR PLUM", sub: "Double damage for 5 seconds", col: "#a77bff" },
    lily: { name: "WHITE LILY", sub: "Every hazard cleared", col: "#f6f4ee" },
    key: { name: "GOLDEN KEY", sub: "Shield down, Marley stunned", col: GOLD }
  };

  var S = {}, keys = {}, idleT = 0, parts = [], floats = [], snow = [], roofs = [];
  var q = location.search, dbg = /[?&]debug=1/.test(q);
  var stageQ = /[?&]stage=([1-4])/.exec(q), START = stageQ ? Number(stageQ[1]) - 1 : 0;
  (function () {
    var seed = 18, i; function r() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (i = 0; i < 70; i++) snow.push({ x: r() * W, y: r() * H, v: 14 + r() * 26, s: r() < 0.25 ? 2 : 1, p: r() * TAU });
    var x = 0; while (x < W) { var w = 30 + r() * 46; roofs.push({ x: x, w: w, h: 40 + r() * 70, ch: r() < 0.7 ? 6 + r() * (w - 18) : -1, lit: r() < 0.5 }); x += w; }
  })();

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function comma(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function R() { return window.NPRewards; }
  function unlock(id) { if (window.Trophies) window.Trophies.unlock(id); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function tone(f, d, t, v, fe, dl) { Sh.tone(f, d, t, v, fe, dl); }
  function bell(n, gap, d0) { for (var i = 0; i < n; i++) { tone(392, 0.9, "triangle", 0.22, 0, (d0 || 0) + i * gap); tone(784, 0.5, "sine", 0.08, 0, (d0 || 0) + i * gap); } }

  function reset() {
    S = { t: 0, x: W / 2, tx: W / 2, vx: 0, hearts: HEARTS, inv: 0, fireT: 0, stillT: 0, score: 0, bi: 0, phase: "intro", pt: 0,
          clock: RUN, credits: 1, practice: START > 0, startStage: START,
          shots: [], foes: [], cols: [], sweeps: [], strikes: [], waxes: [], pits: [], shades: [], cups: [], pickups: [], pend: null,
          bt: 0, hitsThis: 0, hitsTaken: 0, combo: 0, crits: 0, beaten: 0, ko: {}, times: {}, ledgers: 0, nutHits: 0,
          underT: 0, underBest: 0, slateDone: false, cleanToMarley: false, boost: 0, plum: 0, slowT: 0, walk: 0,
          ending: null, done: false, lastKO: null, hintT: 0, lastTick: -1 };
    parts.length = 0; floats.length = 0; keys = {};
    startBoss(START);
  }
  function clearField() {
    S.foes.length = 0; S.cols.length = 0; S.sweeps.length = 0; S.strikes.length = 0; S.waxes.length = 0;
    S.pits.length = 0; S.shades.length = 0; S.cups.length = 0; S.pend = null;
  }
  function startBoss(i) {
    var b = BOSSES[i];
    S.bi = i; S.phase = "intro"; S.pt = 0; S.bt = 0; S.hitsThis = 0; S.underT = 0;
    S.boss = { d: b, hp: b.hp, x: W / 2, y: -70, atkT: 1.3, open: 0, shield: 0, stun: 0, flash: 0, cycle: 0, hpShow: b.hp, ph: 0,
               alt: 0, haz: 2.5, pickT: 7, rain: 0, rainT: 0, spin: 0, burst: 0, burstN: 0, capOff: 0, soilT: 10 };
    clearField(); S.shots.length = 0; S.pickups.length = 0;
    if (i === 3 && S.hitsTaken === 0 && !S.practice) { S.cleanToMarley = true; unlock("sh-untouch"); }
    if (b.id === "future") { tone(55, 2.4, "sawtooth", 0.07); tone(82.4, 2.4, "sawtooth", 0.05); tone(110, 2.2, "triangle", 0.06, 0, 0.2); }
    else tone(196, 0.4, "triangle", 0.16, 0, 0.1);
  }
  function rage() { var b = S.boss; return 1 - b.hp / b.d.hp; }
  function laneOf(x) { return clamp(Math.floor(x / LANE), 0, 3); }

  /* ---------------- Attacks ---------------- */
  function attack() {
    var b = S.boss, id = b.d.id, r = rage(), i, m;
    b.cycle++;
    if (id === "past") {
      if (b.cycle % 3 !== 0) {                      // Candle Flare: wax sparklers in a spread
        var n = r > 0.5 ? 5 : 3;
        for (i = 0; i < n; i++) { var a = Math.PI / 2 + (i - (n - 1) / 2) * 0.3; S.foes.push({ k: "spark", x: b.x, y: b.y - 34, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, r: 6 }); }
        tone(900, 0.08, "square", 0.08, 1500);
        b.atkT = 1.45 - r * 0.4;
      } else {                                      // Extinguisher Drop: center lane first, then on you
        var cx = r < 0.4 ? W / 2 : clamp(S.x, 40, W - 40);
        S.cols.push({ k: "cap", x: cx, w: 76, warn: 0.95 - r * 0.15, hot: 0.3, t: 0 });
        b.capOff = 1.6; b.atkT = 1.6 - r * 0.3;
      }
    } else if (id === "present") {
      m = b.cycle % 3;
      if (m === 1) {                                // Feast Barrage: alternating lanes
        b.alt = 1 - b.alt;
        for (i = b.alt; i < 4; i += 2) {
          var lx = i * LANE + LANE / 2 + rnd(-14, 14), nut = Math.random() < 0.6;
          S.foes.push(nut ? { k: "nut", x: lx, y: b.y + 10, vx: 0, vy: 190 + r * 50, r: 7, p: 0 } : { k: "plate", x: lx, y: b.y + 10, vx: 0, vy: 160 + r * 40, r: 11 });
          if (r > 0.5) S.foes.push({ k: "nut", x: lx + rnd(-10, 10), y: b.y - 40, vx: 0, vy: 190 + r * 50, r: 7, p: 0 });
        }
        b.atkT = 1.4 - r * 0.35;
      } else if (m === 2) {                         // Torch of Plenty: two whole lanes of gold sparkles
        var L = laneOf(S.x), st = L === 3 ? 2 : L === 0 ? 0 : (Math.random() < 0.5 ? L - 1 : L);
        S.cols.push({ k: "torch", x: (st + 1) * LANE, w: LANE * 2, warn: 0.95 - r * 0.15, hot: 0.6, t: 0 });
        b.atkT = 1.7 - r * 0.35;
      } else {                                      // Holly Sweep: from your side, low along the floor
        S.sweeps.push({ side: S.x < W / 2 ? -1 : 1, t: 0, warn: 1.0 - r * 0.15, dur: 0.45, hold: 0.25, reach: W * 0.7 });
        b.atkT = 1.9 - r * 0.35;
      }
    } else if (id === "future") {
      if (b.cycle % 2) {                            // Phantom Finger: a strike right where you stand
        S.strikes.push({ x: S.x, t: 0, warn: 0.8 - r * 0.15, w: 36 });
        if (r > 0.5) S.strikes.push({ x: clamp(S.x + (Math.random() < 0.5 ? -80 : 80), 20, W - 20), t: -0.35, warn: 0.8, w: 36 });
        b.atkT = 1.15 - r * 0.3;
      } else {                                      // Shadow Waves: tall cloth shapes march down
        var ns = r > 0.5 ? 3 : 2, off = rnd(-30, 30);
        for (i = 0; i < ns; i++) S.shades.push({ x: clamp(b.x + off + (i - (ns - 1) / 2) * 110, 16, W - 16), y: b.y - 20, vy: 95 + r * 45, w: 26, h: 74, d: i * 0.25 });
        b.atkT = 1.9 - r * 0.4;
      }
    } else {
      m = b.cycle % 3;
      if (m === 1) {                                // Chain Whip: lashes the middle, run to an edge
        S.cols.push({ k: "chain", x: W / 2, w: W * 0.54, warn: 0.95 - r * 0.15, hot: 0.35, t: 0 });
        b.atkT = 1.6 - r * 0.3;
      } else if (m === 2) {                         // Ledger Rain: smash them with tokens
        b.rain = r > 0.5 ? 8 : 6; b.rainT = 0;
        b.atkT = 2.3 - r * 0.4;
      } else {                                      // Coin Burst: the door spins, then pennies spiral out
        b.spin = 0.9; b.burst = 0; b.burstN = 0;
        tone(140, 0.7, "sawtooth", 0.1, 260);
        b.atkT = 2.4 - r * 0.4;
      }
      if (b.cycle % 4 === 0 && b.stun <= 0 && b.open <= 0) b.shield = 2.6 + r * 1.4;   // ledgers and padlocks close up: tokens bounce off
    }
    if (b.cycle % 3 === 0 && id !== "marley") { b.open = 1.4; b.atkT += 1.1; }
    if (id === "marley" && b.cycle % 5 === 0 && b.shield <= 0) { b.open = 1.3; b.atkT += 1.0; }
  }

  /* ---------------- Update ---------------- */
  function update(dt) {
    S.t += dt; S.pt += dt;
    var b = S.boss;
    b.flash = Math.max(0, b.flash - dt);
    b.hpShow += (b.hp - b.hpShow) * Math.min(1, dt * 6);
    tick(dt);
    if (S.phase === "ending") { if (S.pt > 6.5) finish(); return; }

    // the midnight clock runs in the fight and while the CONTINUE prompt is up
    if (S.phase === "fight" || S.phase === "dead") {
      S.clock -= dt;
      var whole = Math.ceil(S.clock);
      if (whole <= 10 && whole !== S.lastTick && S.clock > 0) { S.lastTick = whole; tone(1800, 0.02, "square", 0.08); }
      if (S.clock <= 0) { S.clock = 0; midnight(); return; }
    }
    move(dt);

    if (S.phase === "intro") {
      b.y += (BOSS_Y - b.y) * Math.min(1, dt * 5);
      if (S.pt > 2.0) { S.phase = "fight"; S.pt = 0; S.hintT = S.bi === S.startStage ? 3 : 0; }
      return;
    }
    if (S.phase === "ko") {
      b.y += 150 * dt;
      if (S.pt > 2.2) {
        if (S.bi + 1 < BOSSES.length) { S.hearts = Math.min(HEARTS, S.hearts + 1); startBoss(S.bi + 1); }
        else startEnding("win");
      }
      return;
    }
    if (S.phase === "dead") { if (S.pt > 6) startEnding("humbug"); return; }

    // fight
    S.bt += dt; S.hintT = Math.max(0, S.hintT - dt);
    S.boost = Math.max(0, S.boost - dt); S.plum = Math.max(0, S.plum - dt);
    b.open = Math.max(0, b.open - dt); b.shield = Math.max(0, b.shield - dt); b.stun = Math.max(0, b.stun - dt); b.capOff = Math.max(0, b.capOff - dt);
    var still = b.open > 0 || b.stun > 0;
    if (!still) { b.ph += dt * b.d.speed * (1 + rage() * 0.5); b.x = W / 2 + Math.sin(b.ph) * b.d.amp; }
    b.atkT -= dt;
    if (b.atkT <= 0 && !still) attack();
    hazards(dt, b);
    if (S.phase !== "fight") return;
    pickups(dt, b);

    // Cold Slate: stand right under the silent spirit
    if (b.d.id === "future") {
      if (Math.abs(S.x - b.x) < b.d.hw + 4) { S.underT += dt; if (S.underT > S.underBest) S.underBest = S.underT; } else S.underT = 0;
      if (S.underT >= 10 && !S.slateDone) { S.slateDone = true; unlock("sh-slate"); pop("COLD SLATE", S.x, HERO_Y - 110, "#cfe9f2"); }
    }

    // standing counter-attack: only while you stand still
    S.fireT -= dt;
    if (S.stillT > 0.06 && S.fireT <= 0) { S.fireT = FIRE; S.shots.push({ x: S.x, y: HERO_Y - 26, r: 0 }); if (Math.random() < 0.3) tone(1500, 0.015, "square", 0.04); }
    for (var i = S.shots.length - 1; i >= 0; i--) {
      var s = S.shots[i]; s.y -= SHOT_V * dt; s.r += dt * 10;
      var gone = false;
      for (var j = S.foes.length - 1; j >= 0; j--) {
        var f = S.foes[j];
        if (f.k === "ledger" && Math.abs(f.x - s.x) < 14 && Math.abs(f.y - s.y) < 16) {
          f.hp--; gone = true; f.fl = 0.08;
          if (f.hp <= 0) { S.foes.splice(j, 1); smashLedger(f); }
          break;
        }
      }
      if (gone) { S.shots.splice(i, 1); continue; }
      if (s.y < b.y + 30 && s.y > b.y - 46 && Math.abs(s.x - b.x) < b.d.hw) { S.shots.splice(i, 1); hitBoss(s); if (S.phase !== "fight") return; continue; }
      if (s.y < 60) S.shots.splice(i, 1);
    }
  }
  function smashLedger(f) {
    S.ledgers++; S.score += 15; pop("+15", f.x, f.y, "#c9a26a");
    sparkle(f.x, f.y, 8, ["#7a3a1c", "#f6f4ee", GOLD]); tone(260, 0.06, "square", 0.12, 120);
    if (S.ledgers === 10) unlock("sh-ledgers");
  }

  function move(dt) {
    S.inv = Math.max(0, S.inv - dt);
    if (S.phase === "dead" || S.phase === "ending") { S.vx = 0; S.stillT = 0; return; }
    var slow = 1;
    for (var i = 0; i < S.waxes.length; i++) if (Math.abs(S.x - S.waxes[i].x) < S.waxes[i].w / 2 + 2) slow = 0.45;
    var sp = (S.boost > 0 ? 1.5 : 1) * slow;
    var k = (keys.ArrowLeft || keys.KeyA ? -1 : 0) + (keys.ArrowRight || keys.KeyD ? 1 : 0);
    if (k) S.tx = clamp(S.tx + k * 330 * sp * dt, 14, W - 14);
    var mv = clamp(S.tx - S.x, -800 * sp * dt, 800 * sp * dt);
    S.x += mv; S.vx = mv / Math.max(dt, 1e-4); S.walk += Math.abs(mv) * 0.12;
    S.stillT = Math.abs(mv) < 0.4 ? S.stillT + dt : 0;
  }

  function hit(f) { return Math.abs(f.x - S.x) < HERO_HW + f.r * 0.7 && f.y > HERO_Y - 26 - f.r * 0.5 && f.y < FLOOR + 2; }

  function hazards(dt, b) {
    var i, r = rage(), id = b.d.id;
    b.haz -= dt;
    if (id === "past" && b.haz <= 0) { b.haz = 1.7 - r * 0.5; S.foes.push({ k: "wax", x: rnd(16, W - 16), y: 190, vx: 0, vy: 150, r: 4 }); }
    if (id === "present" && b.haz <= 0) {
      b.haz = 4.6 - r * 1.2;
      if (S.cups.length < 2) { var fromL = Math.random() < 0.5; S.cups.push({ x: fromL ? 10 : W - 10, y: 250, vx: (fromL ? 1 : -1) * rnd(95, 130), vy: -60, r: 8, life: 8 }); }
    }
    if (id === "future") {
      b.soilT -= dt;
      if (b.soilT <= 0) { b.soilT = 10; S.pits.push({ x: clamp(b.x, 34, W - 34), w: 64, t: 0, warn: 1.2, life: 6 }); tone(70, 0.6, "sawtooth", 0.12); }
    }
    if (id === "marley") {
      if (b.rain > 0) { b.rainT -= dt; if (b.rainT <= 0) { b.rain--; b.rainT = 0.22 - r * 0.06; S.foes.push({ k: "ledger", x: rnd(18, W - 18), y: b.y + 10, vx: 0, vy: 200 + rnd(0, 70) + r * 40, r: 10, hp: 2, rot: rnd(-0.3, 0.3) }); } }
      if (b.spin > 0) {
        b.spin -= dt;
        if (b.spin <= 0) { b.burst = 0.75; b.burstN = 0; }
      } else if (b.burst > 0) {
        b.burst -= dt;
        var want = Math.floor((0.75 - b.burst) / 0.25) + 1;
        while (b.burstN < Math.min(3, want)) {
          var k0 = b.burstN * 0.26, cnt = r > 0.5 ? 12 : 10;
          for (var c = 0; c < cnt; c++) { var a = k0 + c * TAU / cnt, v = 150 + r * 40; S.foes.push({ k: "penny", x: b.x, y: b.y + 18, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 4 }); }
          b.burstN++; tone(1200 + b.burstN * 200, 0.05, "square", 0.08);
        }
      }
      // the brass pendulum: swings for a while, then rests; its pivot creeps after you
      if (S.bt > 7 && !S.pend) S.pend = { px: S.x < W / 2 ? W - 40 : 40, ph: 0, on: 0, rest: 0, cycle: 7, bx: 0 };
      if (S.pend) {
        var p = S.pend;
        if (p.rest > 0) { p.rest -= dt; p.on = Math.max(0, p.on - dt * 2); if (p.rest <= 0) p.cycle = 7; }
        else { p.on = Math.min(1, p.on + dt * 1.5); p.cycle -= dt; if (p.cycle <= 0) p.rest = 4.5; }
        p.ph += dt * 1.7;
        p.px += clamp(S.x - p.px, -34 * dt, 34 * dt);
        p.bx = p.px + Math.sin(p.ph) * 62;
        if (p.on > 0.95 && Math.abs(p.bx - S.x) < 12 + HERO_HW - 2) { hurt("pend"); if (S.phase !== "fight") return; }
      }
    }

    for (i = S.foes.length - 1; i >= 0; i--) {
      var f = S.foes[i];
      f.x += f.vx * dt; f.y += f.vy * dt; if (f.p != null) f.p += dt * 10; if (f.fl) f.fl = Math.max(0, f.fl - dt);
      if (f.k === "wax" && f.y >= FLOOR - 4) { S.foes.splice(i, 1); S.waxes.push({ x: f.x, w: 34, t: 0, life: 3 }); continue; }
      if (f.k === "plate" && f.y >= FLOOR - 9 && !f.roll) { f.roll = true; f.y = FLOOR - 9; f.vy = 0; f.vx = Math.random() < 0.5 ? -150 : 150; tone(700, 0.08, "triangle", 0.08); }
      if (f.y > H + 20 || f.y < -20 || f.x < -30 || f.x > W + 30) { S.foes.splice(i, 1); continue; }
      if (f.k !== "wax" && hit(f)) { S.foes.splice(i, 1); hurt(f.k); if (S.phase !== "fight") return; }
    }
    for (i = S.waxes.length - 1; i >= 0; i--) { S.waxes[i].t += dt; if (S.waxes[i].t > S.waxes[i].life) S.waxes.splice(i, 1); }
    for (i = S.cols.length - 1; i >= 0; i--) {
      var cl = S.cols[i]; cl.t += dt;
      if (cl.t > cl.warn && !cl.fired) { cl.fired = true; Sh.noise(0.14, 0.35, cl.k === "torch" ? 3200 : 900, 0.8); Sh.shake(cl.k === "torch" ? 2 : 5, 0.15); }
      if (cl.fired && cl.t < cl.warn + cl.hot && Math.abs(S.x - cl.x) < cl.w / 2 + HERO_HW - 4) { hurt(cl.k); if (S.phase !== "fight") return; }
      if (cl.t > cl.warn + cl.hot + 0.2) S.cols.splice(i, 1);
    }
    for (i = S.sweeps.length - 1; i >= 0; i--) {
      var sw = S.sweeps[i]; sw.t += dt;
      var tip = sweepTip(sw);
      if (tip > 0 && (sw.side < 0 ? S.x - HERO_HW + 3 < tip : S.x + HERO_HW - 3 > W - tip)) { hurt("holly"); if (S.phase !== "fight") return; }
      if (sw.t > sw.warn + sw.dur * 2 + sw.hold) S.sweeps.splice(i, 1);
    }
    for (i = S.cups.length - 1; i >= 0; i--) {
      var cu = S.cups[i]; cu.life -= dt;
      cu.vy += 420 * dt; cu.x += cu.vx * dt; cu.y += cu.vy * dt;
      if (cu.y > FLOOR - cu.r) { cu.y = FLOOR - cu.r; cu.vy = -Math.max(330, Math.abs(cu.vy) * 0.9); tone(1900, 0.03, "triangle", 0.06); }
      if ((cu.x < cu.r && cu.vx < 0) || (cu.x > W - cu.r && cu.vx > 0)) { if (cu.life > 1) cu.vx = -cu.vx; }
      if (cu.life <= 0 && (cu.x < -20 || cu.x > W + 20)) { S.cups.splice(i, 1); continue; }
      if (hit(cu)) { S.cups.splice(i, 1); hurt("cup"); if (S.phase !== "fight") return; }
    }
    for (i = S.strikes.length - 1; i >= 0; i--) {
      var st = S.strikes[i]; st.t += dt;
      if (st.t > st.warn && !st.fired) { st.fired = true; Sh.noise(0.2, 0.4, 3000, 0.5); tone(80, 0.25, "sawtooth", 0.18); if (Math.abs(S.x - st.x) < st.w / 2 + HERO_HW - 3) { hurt("finger"); if (S.phase !== "fight") return; } }
      if (st.t > st.warn + 0.25) S.strikes.splice(i, 1);
    }
    for (i = S.shades.length - 1; i >= 0; i--) {
      var sd = S.shades[i];
      if (sd.d > 0) { sd.d -= dt; continue; }
      sd.y += sd.vy * dt;
      if (Math.abs(S.x - sd.x) < sd.w / 2 + HERO_HW - 3 && sd.y + sd.h > HERO_Y - 24 && sd.y < FLOOR - 4) { S.shades.splice(i, 1); hurt("shade"); if (S.phase !== "fight") return; continue; }
      if (sd.y > FLOOR) S.shades.splice(i, 1);
    }
    for (i = S.pits.length - 1; i >= 0; i--) {
      var pt = S.pits[i]; pt.t += dt;
      if (pt.t > pt.warn && pt.t < pt.warn + pt.life && Math.abs(S.x - pt.x) < pt.w / 2 - 3) { hurt("soil"); if (S.phase !== "fight") return; }
      if (pt.t > pt.warn + pt.life) S.pits.splice(i, 1);
    }
  }
  function sweepTip(sw) {
    var a = sw.t - sw.warn;
    if (a < 0) return 0;
    if (a < sw.dur) return sw.reach * (a / sw.dur);
    if (a < sw.dur + sw.hold) return sw.reach;
    return Math.max(0, sw.reach * (1 - (a - sw.dur - sw.hold) / sw.dur));
  }

  function pickups(dt, b) {
    b.pickT -= dt;
    if (b.pickT <= 0) {
      b.pickT = 13;
      var px = S.x + (Math.random() < 0.5 ? -1 : 1) * rnd(70, 150);
      if (px < 20 || px > W - 20) px = clamp(2 * S.x - px, 20, W - 20);
      S.pickups.push({ k: b.d.pickup, x: px, y: 180, vy: 120, t: 0, life: 6.5 });
    }
    for (var i = S.pickups.length - 1; i >= 0; i--) {
      var p = S.pickups[i]; p.t += dt;
      if (p.y < FLOOR - 14) p.y = Math.min(FLOOR - 14, p.y + p.vy * dt);
      if (p.t > p.life) { S.pickups.splice(i, 1); continue; }
      if (Math.abs(p.x - S.x) < 20 && p.y > HERO_Y - 40) { S.pickups.splice(i, 1); grab(p); }
    }
  }
  function grab(p) {
    var P = PICK[p.k], b = S.boss;
    Sh.flash(P.name, P.sub, P.col, 1100);
    tone(988, 0.07, "triangle", 0.2); tone(1319, 0.12, "triangle", 0.2, 0, 0.07); tone(1760, 0.14, "triangle", 0.16, 0, 0.14);
    sparkle(p.x, p.y, 14, [P.col, "#fff1d6"]);
    S.score += 50;
    if (p.k === "watch") { S.clock += 10; S.boost = 4; pop("+10 SEC", p.x, p.y - 20, GOLD); }
    else if (p.k === "plum") S.plum = 5;
    else if (p.k === "lily") { clearField(); b.soilT = 10; sparkle(W / 2, FLOOR - 40, 24, ["#f6f4ee", "#cfe9f2"]); }
    else if (p.k === "key") { b.shield = 0; b.stun = 3; b.open = 3; b.spin = 0; b.burst = 0; b.rain = 0; }
  }

  function hitBoss(s) {
    var b = S.boss;
    if (b.shield > 0) { pop("LOCKED", s.x, b.y + 34, "#8e93a2"); tone(300, 0.03, "square", 0.08); return; }
    var crit = b.open > 0, dmg = (crit ? 2 : 1) * (S.plum > 0 ? 2 : 1);
    b.hp = Math.max(0, b.hp - dmg); b.flash = 0.08;
    S.score += (crit ? 25 : 10) * (S.plum > 0 ? 2 : 1);
    S.combo++;
    if (crit) { S.crits++; pop("CRIT!", s.x + rnd(-10, 10), b.y + 38, GOLD); sparkle(s.x, b.y + 24, 5, [GOLD, "#fff3b0"]); tone(1100, 0.04, "square", 0.14); }
    else { sparkle(s.x, b.y + 24, 2, [b.d.col, "#eceae2"]); if (Math.random() < 0.5) tone(620 + Math.random() * 80, 0.03, "triangle", 0.12); }
    if (S.combo === 10 || S.combo === 25 || S.combo === 50 || S.combo === 80) { if (R()) R().streak(S.combo, S.combo + " HIT COMBO", S.combo >= 50 ? "#ff4b3e" : S.combo >= 25 ? GOLD : "#3ff0ff"); }
    if (b.hp <= 0) ko();
  }

  function ko() {
    var b = S.boss, t = S.bt, d = b.d, spinning = d.id === "marley" && (b.spin > 0 || b.burst > 0);
    S.phase = "ko"; S.pt = 0; S.beaten++; S.ko[d.id] = true; S.times[d.id] = t;
    clearField(); S.shots.length = 0; S.pickups.length = 0;
    var noHit = S.hitsThis === 0, timeB = Math.max(0, Math.round((d.par - t) * 25)), bonus = 300 * (S.bi + 1) + timeB + (noHit ? 400 : 0);
    S.score += bonus; S.lastKO = { t: t, noHit: noHit, bonus: bonus, spin: spinning };
    Sh.sfx("best"); Sh.shake(8, 0.45); Sh.noise(0.5, 0.4, 700, 0.6);
    sparkle(b.x, b.y, 40, [d.col, GOLD, "#eceae2", GREEN]);
    if (R()) R().burst(null, null, 40);
    if (d.id !== "marley") unlock("sh-" + d.id);
    if (d.id === "past" && t < 25) unlock("sh-swift");
    if (d.id === "present" && S.nutHits === 0) unlock("sh-feast");
    if (d.id === "marley") {
      if (spinning) { unlock("sh-chain"); pop("CHAIN BREAKER", b.x, b.y + 50, GOLD); }
      if (!S.practice) {
        unlock("sh-marley");
        if (S.clock > 45) unlock("sh-clock");
        if (S.hitsTaken === 0 && S.credits === 1) unlock("sh-master");
      }
    }
  }

  function hurt(src) {
    if (S.inv > 0 || S.phase !== "fight" || S.god) return;
    S.hearts--; S.hitsThis++; S.hitsTaken++; S.inv = IFRAMES; S.combo = 0;
    if (src === "nut" && S.boss.d.id === "present") S.nutHits++;
    Sh.sfx("hit"); tone(160, 0.25, "sawtooth", 0.25, 70); Sh.shake(7, 0.3);
    sparkle(S.x, HERO_Y - 10, 12, ["#ff4b3e", "#eceae2"]);
    if (S.hearts <= 0) {
      S.phase = "dead"; S.pt = 0; S.shots.length = 0;
      Sh.flash("OUT OF PUDDINGS", "Spend a credit? The clock keeps running.", "#ff4b3e", 1600);
      Sh.sfx("over");
    } else Sh.flash("OUCH", S.hearts + (S.hearts === 1 ? " pudding left" : " puddings left"), "#ff4b3e", 700);
  }
  function continueRun() {
    if (S.phase !== "dead" || S.pt < 0.7) return;
    S.credits++; S.hearts = HEARTS; S.inv = 2; S.phase = "fight"; S.pt = 0; S.combo = 0;
    clearField();
    Sh.flash("CREDIT " + S.credits, "Back to it. Midnight is coming.", GREEN, 1100);
    tone(523, 0.08, "square", 0.2); tone(784, 0.12, "square", 0.2, 0, 0.08);
  }

  function midnight() {
    var b = S.boss;
    if (S.bi === 3 && b.hp / b.d.hp < CLOSE) startEnding("close");
    else startEnding("late");
  }
  function startEnding(kind) {
    if (S.ending) return;
    S.ending = kind; S.phase = "ending"; S.pt = 0;
    clearField(); S.shots.length = 0; S.pickups.length = 0;
    S.endHp = S.boss.hp / S.boss.d.hp;
    if (kind === "win") {
      S.timeLeft = Math.floor(S.clock);
      S.score += S.timeLeft * 20;
      bell(6, 0.45, 0.2); tone(1047, 0.5, "triangle", 0.12, 0, 0.1);
    } else if (kind === "close" || kind === "late") {
      bell(12, 0.32, 0.1);
    } else tone(220, 0.6, "triangle", 0.18, 110);
  }

  function tick(dt) {
    for (var i = parts.length - 1; i >= 0; i--) { var p = parts[i]; p.t += dt; if (p.t >= p.life) { parts.splice(i, 1); continue; } p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    for (i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; floats[i].y -= 30 * dt; if (floats[i].t > 0.8) floats.splice(i, 1); }
    for (i = 0; i < snow.length; i++) { var s = snow[i]; s.y += s.v * dt; s.x += Math.sin(s.p + s.y * 0.02) * 8 * dt; if (s.y > FLOOR) { s.y = 20; s.x = Math.random() * W; } }
  }
  function sparkle(x, y, n, cols) {
    if (Sh.reduced) n = Math.min(n, 4);
    for (var i = 0; i < n; i++) { var a = Math.random() * TAU, v = 50 + Math.random() * 170; parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, life: 0.4 + Math.random() * 0.5, c: cols[i % cols.length], s: Math.random() < 0.3 ? 3 : 2 }); }
  }
  function pop(s, x, y, c) { if (floats.length < 14) floats.push({ s: s, x: x, y: y, c: c, t: 0 }); }

  var ENDINGS = {
    win: { title: "MERRY CHRISTMAS", col: GREEN, head: "CHRISTMAS MORNING",
      text: "The heavy fog clears over the London cobblestones as the church bells ring. Scrooge buys the prize turkey, Tiny Tim waves from the window, and the collector tips his cap with a full pouch of spirit tokens." },
    close: { title: "SO CLOSE", col: GOLD, head: "THE CLOCK STRIKES TWELVE",
      text: "The clock tower strikes twelve with a deafening chime. Marley's vault door slams shut, locking your score inside the dark counting-house until Christmas morning." },
    late: { title: "MIDNIGHT", col: "#a77bff", head: "THE CLOCK STRIKES TWELVE",
      text: "The bells toll twelve before the spirits are done with you. The fog stays thick over London. Wind the watch and try again." },
    humbug: { title: "HUMBUG!", col: "#ff4b3e", head: "OUT OF PUDDINGS",
      text: "No credit spent, no second chance. Scrooge says the word you would expect. Have another go before midnight." }
  };
  function finish() {
    if (S.done) return;
    S.done = true;
    var e = ENDINGS[S.ending] || ENDINGS.late, b = S.boss, cleared = S.ending === "win";
    var pct = Math.max(1, Math.ceil(S.endHp * 100));
    var stats = { score: S.score, beaten: S.beaten, cleared: cleared, practice: S.practice, ending: S.ending,
                  kPast: !!S.ko.past, kPresent: !!S.ko.present, kFuture: !!S.ko.future, kMarley: !!S.ko.marley,
                  pastTime: S.ko.past ? Math.round(S.times.past * 10) / 10 : undefined, ledgers: S.ledgers, underBest: Math.floor(S.underBest),
                  timeLeft: cleared ? S.timeLeft : 0, hitsTaken: S.hitsTaken, credits: S.credits, cleanToMarley: S.cleanToMarley };
    var html = '<div class="sh-end" style="--sc:' + e.col + '"><b>' + e.head + '</b>' + e.text + '</div>';
    if (S.ending === "close") html += '<p class="sh-close">Marley had only ' + pct + '% left when the clock struck.</p>';
    else if (!cleared && pct < 100) {
      var nm = b.d.name.toLowerCase().replace(/(^|\s)([a-z])/g, function (m) { return m.toUpperCase(); });
      html += '<p class="sh-close">' + nm + ' had ' + pct + '% left.</p>';
    }
    html += '<p class="sh-rows">Spirits <b>' + S.beaten + '/4</b> | credits <b>' + S.credits + '</b> | ledgers <b>' + S.ledgers + '</b>' +
      (cleared ? ' | <b>' + mmss(S.timeLeft) + '</b> to spare' : '') + (S.practice ? ' | practice from spirit ' + (S.startStage + 1) : '') + '</p>';
    Sh.gameOver(S.score, { title: e.title, html: html, stats: stats });
  }
  function mmss(t) { t = Math.max(0, Math.round(t)); return Math.floor(t / 60) + ":" + ("0" + (t % 60)).slice(-2); }
  function clockText(sec) {
    var left = Math.max(0, Math.ceil(sec)), now = (24 * 3600 - left) % (24 * 3600), h = Math.floor(now / 3600), m = Math.floor(now / 60) % 60, s = now % 60;
    if (left === 0) return "12:00:00 AM";
    return (h % 12 || 12) + ":" + ("0" + m).slice(-2) + ":" + ("0" + s).slice(-2) + (h >= 12 ? " PM" : " AM");
  }

  /* ---------------- Input ---------------- */
  function pointer(type, x) {
    if (type === "down") { if (S.phase === "dead") { continueRun(); return; } if (S.phase === "ending") { if (S.pt > 1.5) finish(); return; } }
    if ((type === "down" || type === "move") && S.phase !== "dead" && S.phase !== "ending") S.tx = clamp(x, 14, W - 14);
  }
  function key(type, code) {
    keys[code] = type === "down";
    if (type === "down" && (code === "Space" || code === "Enter" || code === "NumpadEnter")) {
      if (S.phase === "dead") continueRun(); else if (S.phase === "ending" && S.pt > 1.5) finish();
    }
  }

  /* ---------------- Drawing ---------------- */
  function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }
  function circ(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function poly(c, pts, col) { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); }

  /* The Nostalgia Pro collector, same 16x24 recipe as the main game (NP cap, NP tee) plus a winter scarf. */
  var heroCache = {};
  function heroSprite(step, arm) {
    var ck = step + "-" + arm;
    if (heroCache[ck]) return heroCache[ck];
    var FW = 16, FH = 24, p = new Array(FW * FH), SK = "#f1c28e", HC = "#4a2f1c";
    function px(x, y, col) { if (x >= 0 && x < FW && y >= 0 && y < FH) p[y * FW + x] = col; }
    function rc(x, y, w, h, col) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) px(x + i, y + j, typeof col === "function" ? col(x + i, y + j) : col); }
    var lUp = step === 1 ? 1 : 0, rUp = step === 2 ? 1 : 0;
    rc(4, 18, 8, 2, "#3b5a96"); rc(4, 20, 3, 2 - lUp, "#3b5a96"); rc(9, 20, 3, 2 - rUp, "#3b5a96");
    rc(4, 22 - lUp, 3, 2, "#2b2422"); rc(9, 22 - rUp, 3, 2, "#2b2422");
    var tee = function (x, y) { if (y >= 13 && y <= 14 && x >= 6 && x <= 9) return ((x + y) % 3 === 0) ? "#e4343e" : "#fff1d6"; if (y === 15 && x >= 6 && x <= 9) return "#29d3e8"; return "#1b1b22"; };
    rc(4, 11, 8, 7, tee); rc(3, 11, 1, 3, tee);
    if (arm) { rc(12, 8, 1, 5, tee); rc(12, 6, 1, 2, SK); rc(3, 14, 1, 3, SK); }
    else { rc(12, 11, 1, 3, tee); rc(3, 14, 1, 3 - rUp, SK); rc(12, 14, 1, 3 - lUp, SK); }
    rc(4, 3, 8, 8, SK);
    px(6, 7, "#1b1b28"); px(6, 8, "#1b1b28"); px(9, 7, "#1b1b28"); px(9, 8, "#1b1b28"); px(7, 10, "#c19a72"); px(8, 10, "#c19a72");
    rc(4, 2, 8, 3, HC); px(4, 5, HC); px(11, 5, HC);
    rc(4, 1, 8, 4, "#1d2b53"); rc(3, 5, 10, 1, "#141e3a");
    px(6, 2, "#fff1d6"); px(7, 2, "#e4343e"); px(8, 2, "#fff1d6"); px(9, 2, "#fff1d6"); px(6, 3, "#fff1d6"); px(7, 3, "#fff1d6"); px(8, 3, "#e4343e"); px(9, 3, "#fff1d6");
    // winter scarf: holly green with red stripes, one tail hanging
    rc(4, 11, 8, 1, function (x) { return x % 3 === 0 ? "#e4343e" : "#2f9e5a"; }); rc(9, 12, 2, 3, function (x, y) { return y === 13 ? "#e4343e" : "#2f9e5a"; });
    var out = [];
    for (var y = 0; y < FH; y++) for (var x = 0; x < FW; x++) if (!p[y * FW + x] && ((x > 0 && p[y * FW + x - 1]) || (x < FW - 1 && p[y * FW + x + 1]) || (y > 0 && p[(y - 1) * FW + x]) || (y < FH - 1 && p[(y + 1) * FW + x]))) out.push(y * FW + x);
    for (var o = 0; o < out.length; o++) p[out[o]] = "#0b1022";
    var cv = document.createElement("canvas"); cv.width = FW; cv.height = FH;
    var g = cv.getContext("2d");
    for (y = 0; y < FH; y++) for (x = 0; x < FW; x++) if (p[y * FW + x]) { g.fillStyle = p[y * FW + x]; g.fillRect(x, y, 1, 1); }
    heroCache[ck] = cv;
    return cv;
  }
  function drawHero(c, x, t, moving, firing) {
    if (S.inv > 0 && Math.sin(t * 40) > 0 && S.phase !== "ending") return;
    var step = moving ? [1, 0, 2, 0][Math.floor(S.walk / 6) % 4] : 0;
    c.fillStyle = "rgba(0,0,0,.4)"; c.beginPath(); c.ellipse(x, FLOOR - 1, 16, 4, 0, 0, TAU); c.fill();
    if (S.plum > 0) { c.fillStyle = "rgba(167,123,255," + (0.22 + 0.1 * Math.sin(t * 12)) + ")"; c.beginPath(); c.arc(x, FLOOR - 36, 34, 0, TAU); c.fill(); }
    if (S.boost > 0 && moving) for (var k = 1; k < 4; k++) rect(c, x - (S.vx > 0 ? 1 : -1) * (18 + k * 6), FLOOR - 50 + k * 10, 10, 2, "rgba(255,210,63,.5)");
    c.imageSmoothingEnabled = false;
    c.drawImage(heroSprite(step, firing ? 1 : 0), Math.round(x - 24), FLOOR - 72, 48, 72);
    if (firing && Math.floor(t / FIRE) % 2 === 0) token(c, x + 14, FLOOR - 76, t * 8);
  }
  function token(c, x, y, rot) {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.fillStyle = "rgba(160,240,255,.35)"; c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.fill();
    c.fillStyle = "#e9fdff"; c.beginPath();
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4, r = i % 2 ? 2 : 6; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.fill(); c.restore();
  }

  function drawStreet(c, t, dawn) {
    var g = c.createLinearGradient(0, 0, 0, FLOOR), i;
    if (dawn) { g.addColorStop(0, "#5a7ab8"); g.addColorStop(0.6, "#e8b0a0"); g.addColorStop(1, "#f6d6a0"); }
    else { g.addColorStop(0, "#070a18"); g.addColorStop(1, "#1a2140"); }
    c.fillStyle = g; c.fillRect(0, 0, W, FLOOR);
    if (!dawn) { circ(c, 52, 106, 15, "#e8e4cf"); c.fillStyle = "rgba(26,33,64,.6)"; c.fillRect(20, 106, 70, 10); }
    // church clock tower: the hands show the real time left
    var tx = 292, tw = dawn ? "#6a6070" : "#141a2e", tr = dawn ? "#5a5060" : "#10152a";
    rect(c, tx - 22, 200, 44, 130, tw); poly(c, [tx - 26, 200, tx + 26, 200, tx, 150], tr); rect(c, tx - 1, 138, 2, 14, tr);
    circ(c, tx, 230, 15, dawn ? "#fff8e0" : "#e8dca8"); c.strokeStyle = "#2a2430"; c.lineWidth = 2; c.beginPath(); c.arc(tx, 230, 15, 0, TAU); c.stroke();
    var left = Math.max(0, S.clock == null ? RUN : S.clock), mins = 60 - left / 60, hrs = 11 + mins / 60;
    if (dawn) { mins = 15; hrs = 7.25; }
    var ma = mins / 60 * TAU - Math.PI / 2, ha = (hrs % 12) / 12 * TAU - Math.PI / 2;
    c.strokeStyle = "#1b1b28"; c.beginPath(); c.moveTo(tx, 230); c.lineTo(tx + Math.cos(ma) * 12, 230 + Math.sin(ma) * 12); c.moveTo(tx, 230); c.lineTo(tx + Math.cos(ha) * 8, 230 + Math.sin(ha) * 8); c.stroke();
    // rooftops and chimneys with a few lit windows
    for (i = 0; i < roofs.length; i++) {
      var r = roofs[i], top = 330 - r.h;
      if (r.x + r.w > tx - 24 && r.x < tx + 24) top = Math.max(top, 300);
      rect(c, r.x, top, r.w + 1, FLOOR - top, dawn ? "#4a3e48" : "#0d1124");
      if (r.ch > 0) rect(c, r.x + r.ch, top - 14, 9, 14, dawn ? "#4a3e48" : "#0d1124");
      for (var wy = top + 12; wy < 322; wy += 22) for (var wx = r.x + 6; wx < r.x + r.w - 10; wx += 16) if (((wx * 7 + wy * 3) | 0) % 5 < (r.lit ? 2 : 1)) rect(c, wx, wy, 6, 8, dawn ? "#f6d6a0" : "#ffd27a");
    }
    // wall of the counting-house and a gas lamp
    rect(c, 0, 330, W, FLOOR - 330, dawn ? "#5a4a50" : "#191d33");
    for (i = 0; i < W; i += 30) for (var yy = 338; yy < FLOOR; yy += 14) rect(c, i + ((yy / 14) % 2 ? 15 : 0), yy, 28, 1, dawn ? "#4a3a40" : "#12152a");
    rect(c, 24, 360, 4, FLOOR - 360, "#1b1b22"); rect(c, 16, 346, 20, 16, "#2a2d38"); rect(c, 19, 349, 14, 10, dawn ? "#c8b080" : (Math.sin(t * 7) > -0.7 ? "#ffd27a" : "#e8b860"));
    if (!dawn) { c.fillStyle = "rgba(255,210,122,.08)"; c.beginPath(); c.arc(26, 356, 46, 0, TAU); c.fill(); }
    // snowy cobblestones
    rect(c, 0, FLOOR, W, H - FLOOR, "#2e3040");
    for (i = 0; i < W; i += 18) { rect(c, i + ((i / 18) % 2 ? 9 : 0), FLOOR + 10, 14, 7, "#3a3e52"); rect(c, i, FLOOR + 24, 14, 7, "#3a3e52"); }
    rect(c, 0, FLOOR, W, 3, "#eef2f8");
    for (i = 0; i < snow.length; i++) { var s = snow[i]; rect(c, s.x, s.y, s.s, s.s, dawn ? "rgba(255,255,255,.8)" : "#dfe6f2"); }
    if (!dawn) { c.fillStyle = "rgba(170,180,210,.06)"; for (i = 0; i < 3; i++) { var fx = ((t * (8 + i * 5) + i * 140) % (W + 200)) - 100; c.beginPath(); c.ellipse(fx, 440 + i * 18, 110, 16, 0, 0, TAU); c.fill(); } }
  }

  /* The four visitors, drawn from Dickens' descriptions with rectangles and paths. */
  function drawBoss(c, b, t) {
    var x = Math.round(b.x), y = Math.round(b.y), id = b.d.id, hit = b.flash > 0, k;
    c.save();
    if (b.open > 0) { c.fillStyle = "rgba(255,210,63," + (0.18 + 0.12 * Math.sin(t * 20)) + ")"; c.beginPath(); c.arc(x, y, 54, 0, TAU); c.fill(); }
    if (id === "past") {
      y += Math.round(Math.sin(t * 3) * 4);
      c.fillStyle = "rgba(255,243,176,.12)"; c.beginPath(); c.arc(x, y - 40, 36 + Math.sin(t * 9) * 3, 0, TAU); c.fill();
      var fl = Math.sin(t * 17) * 2;   // the bright clear jet of light from the crown of the head
      poly(c, [x - 7, y - 38, x + 7, y - 38, x + fl, y - 66], GOLD); poly(c, [x - 3, y - 38, x + 3, y - 38, x + fl * 0.5, y - 56], "#fffbe0");
      poly(c, [x - 14, y - 16, x + 14, y - 16, x + 20, y + 30, x + 12, y + 26, x + 6, y + 32, x, y + 27, x - 6, y + 32, x - 12, y + 26, x - 20, y + 30], hit ? "#fff" : "#eef0f6");
      rect(c, x - 14, y + 2, 28, 3, GOLD);
      rect(c, x - 10, y - 36, 20, 20, hit ? "#fff" : "#fbe8d4"); rect(c, x - 12, y - 38, 24, 6, "#f6f4ee"); rect(c, x - 13, y - 34, 4, 18, "#f6f4ee"); rect(c, x + 9, y - 34, 4, 18, "#f6f4ee");
      rect(c, x - 6, y - 28, 3, 3, "#3a6fd0"); rect(c, x + 3, y - 28, 3, 3, "#3a6fd0"); rect(c, x - 3, y - 21, 6, 2, "#d07a7a");
      rect(c, x - 22, y - 8, 4, 12, "#fbe8d4"); poly(c, [x - 28, y - 14, x - 18, y - 18, x - 22, y - 8], "#2f9e5a"); circ(c, x - 22, y - 15, 2, RED);
      if (!(b.capOff > 0)) { poly(c, [x + 14, y + 8, x + 34, y + 8, x + 24, y - 14], "#c9a24a"); rect(c, x + 13, y + 7, 22, 3, "#8a6a2a"); rect(c, x + 23, y - 17, 2, 4, "#8a6a2a"); }
    } else if (id === "present") {
      // a throne of feast dishes: pudding, roast, chestnuts, a pie
      rect(c, x - 46, y + 8, 92, 32, "#5a3418"); rect(c, x - 46, y + 8, 92, 4, "#7a4a24");
      circ(c, x - 32, y + 6, 11, "#6a3a1c"); rect(c, x - 40, y - 4, 16, 4, "#f6f4ee"); circ(c, x - 32, y - 6, 2, RED);
      c.fillStyle = "#c2702a"; c.beginPath(); c.ellipse(x + 32, y + 6, 14, 9, 0, 0, TAU); c.fill(); rect(c, x + 22, y + 2, 20, 2, "#e8a050");
      for (k = 0; k < 5; k++) circ(c, x - 38 + k * 5, y + 26, 3, "#7a3a1c");
      rect(c, x + 18, y + 22, 26, 5, "#a8aab4"); rect(c, x + 20, y + 18, 22, 4, "#d8b070");
      // green robe bordered with white fur, open at the chest
      poly(c, [x - 26, y - 22, x + 26, y - 22, x + 36, y + 22, x - 36, y + 22], hit ? "#fff" : "#2f8a4a");
      rect(c, x - 36, y + 18, 72, 5, "#f6f4ee"); rect(c, x - 4, y - 22, 8, 40, "#f6f4ee"); rect(c, x - 3, y - 18, 6, 10, "#f1c28e");
      // genial face, dark brown curls and beard, holly wreath set with icicles
      rect(c, x - 13, y - 48, 26, 26, hit ? "#fff" : "#f1c28e"); rect(c, x - 16, y - 52, 32, 8, "#4a2f1c"); rect(c, x - 17, y - 46, 5, 18, "#4a2f1c"); rect(c, x + 12, y - 46, 5, 18, "#4a2f1c");
      rect(c, x - 12, y - 30, 24, 12, "#4a2f1c"); rect(c, x - 5, y - 28, 10, 2, "#c24a3a");
      rect(c, x - 8, y - 40, 4, 3, "#1b1b28"); rect(c, x + 4, y - 40, 4, 3, "#1b1b28");
      for (k = 0; k < 6; k++) { poly(c, [x - 17 + k * 6, y - 52, x - 13 + k * 6, y - 58, x - 9 + k * 6, y - 52], "#2f9e5a"); if (k % 2) rect(c, x - 14 + k * 6, y - 52, 2, 6, "#cfe9f2"); }
      circ(c, x - 6, y - 55, 2, RED); circ(c, x + 8, y - 55, 2, RED);
      // the glowing torch, shaped like a horn of plenty
      poly(c, [x + 30, y - 4, x + 40, y - 6, x + 50, y - 34, x + 40, y - 34], "#d8a03a"); rect(c, x + 26, y - 8, 8, 8, "#f1c28e");
      circ(c, x + 45, y - 38, 6 + Math.sin(t * 15) * 1.5, GOLD); circ(c, x + 45, y - 39, 3, "#fffbe0");
    } else if (id === "future") {
      var sway = Math.sin(t * 1.3) * 3, pt = Math.sin(t * 2) * 2;
      if (S.phase === "fight" && Math.abs(S.x - b.x) < b.d.hw + 4) { c.fillStyle = "rgba(207,233,242," + Math.min(0.3, S.underT / 25) + ")"; c.fillRect(x - 24, y + 36, 48, FLOOR - y - 36); }
      c.fillStyle = "rgba(167,123,255,.16)"; c.beginPath(); c.ellipse(x, y - 14, 40, 58, 0, 0, TAU); c.fill();
      poly(c, [x + sway, y - 64, x + 18 + sway, y - 50, x + 26, y + 34, x - 26, y + 34, x - 18 + sway, y - 50], hit ? "#5a5a6a" : "#08080c");
      poly(c, [x + sway, y - 60, x + 13 + sway, y - 46, x + 10 + sway, y - 26, x - 10 + sway, y - 26, x - 13 + sway, y - 46], "#000");
      c.strokeStyle = "#1e1e2a"; c.lineWidth = 1; c.beginPath(); for (k = -2; k <= 2; k++) { c.moveTo(x + k * 7, y - 20); c.lineTo(x + k * 9, y + 32); } c.stroke();
      c.strokeStyle = "rgba(190,170,255,.7)"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + sway, y - 64); c.lineTo(x + 18 + sway, y - 50); c.lineTo(x + 26, y + 34); c.lineTo(x - 26, y + 34); c.lineTo(x - 18 + sway, y - 50); c.closePath(); c.stroke();
      // one outstretched pale hand, pointing down
      poly(c, [x + 16, y - 20, x + 34, y - 6, x + 30, y, x + 14, y - 12], "#08080c");
      rect(c, x + 30, y - 4 + pt, 7, 6, hit ? "#fff" : "#d8d6cf"); rect(c, x + 32, y + 2 + pt, 2, 12, "#d8d6cf"); rect(c, x + 35, y + 2 + pt, 1, 5, "#c8c6bf"); rect(c, x + 29, y + 2 + pt, 1, 5, "#c8c6bf");
    } else {
      // The Greed Manifest: an iron wall safe. Marley's specter rises out of it, wrapped in his chain.
      var spin = b.spin > 0 || b.burst > 0;
      c.globalAlpha = 0.85;
      rect(c, x - 18, y - 60, 36, 30, hit ? "#fff" : "#9fb4c8"); rect(c, x - 20, y - 64, 40, 8, "#7a8ca0");
      rect(c, x - 14, y - 52, 6, 4, "#1b1b28"); rect(c, x + 8, y - 52, 6, 4, "#1b1b28");
      rect(c, x - 22, y - 62, 44, 4, "#e8eef4"); rect(c, x - 4, y - 66, 8, 30, "#e8eef4");   // the kerchief bound round his head and jaw
      rect(c, x + 16, y - 56, 6, 10, "#4a4a5a");                                               // pigtail
      rect(c, x - 22, y - 30, 44, 18, "#5a6a80"); rect(c, x - 6, y - 30, 12, 18, "#7a8ca0");
      c.globalAlpha = 1;
      rect(c, x - 40, y - 14, 80, 50, hit ? "#fff" : "#2e3a34"); rect(c, x - 40, y - 14, 80, 4, "#c9a24a"); rect(c, x - 40, y + 32, 80, 4, "#c9a24a");
      rect(c, x - 44, y + 36, 10, 6, "#1b1b22"); rect(c, x + 34, y + 36, 10, 6, "#1b1b22");
      var dw = spin ? Math.abs(Math.cos(t * 14)) : 1;
      c.fillStyle = spin ? "#1b1b22" : "#3a4a42"; c.fillRect(x - 24 * dw, y - 6, 48 * dw, 36);
      c.strokeStyle = "#c9a24a"; c.lineWidth = 2; c.strokeRect(x - 24 * dw, y - 6, 48 * dw, 36);
      if (spin) { circ(c, x, y + 12, 6, "#b8642a"); circ(c, x, y + 12, 3, "#e8a050"); }
      else { circ(c, x, y + 12, 9, "#c9a24a"); c.strokeStyle = "#5a4a1a"; c.beginPath(); c.moveTo(x, y + 12); c.lineTo(x + Math.cos(t * 2) * 8, y + 12 + Math.sin(t * 2) * 8); c.stroke(); }
      // the chain he forged: cash-boxes, keys, padlocks, ledgers, deeds and purses
      c.strokeStyle = "#8d8f99"; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 46, y - 24); c.quadraticCurveTo(x, y + 4 + Math.sin(t * 3) * 4, x + 46, y - 24); c.stroke();
      rect(c, x - 48, y - 30, 12, 9, "#5a5c66"); rect(c, x - 46, y - 28, 8, 2, "#c9a24a");
      rect(c, x + 36, y - 30, 12, 9, "#7a3a1c"); rect(c, x + 37, y - 29, 2, 7, "#c9a24a");
      circ(c, x - 30, y - 34, 4, "#5a5c66"); rect(c, x - 32, y - 32, 4, 5, "#c9a24a");
      circ(c, x + 28, y - 34, 4, "#5a5c66"); rect(c, x + 26, y - 32, 4, 5, "#c9a24a");
      rect(c, x - 14, y - 8, 8, 5, "#e8dcb0"); rect(c, x + 8, y - 10, 6, 6, "#8a5a2b");
      if (b.shield > 0) {
        c.strokeStyle = "rgba(201,162,74," + (0.6 + 0.3 * Math.sin(t * 10)) + ")"; c.lineWidth = 3; c.strokeRect(x - 50, y - 70, 100, 116);
        for (k = 0; k < 5; k++) rect(c, x - 50 + k * 24, y - 70, 6, 116, "rgba(141,143,153,.55)");
        Sh.uiText(c, "LOCKED", x, y + 40, 9, GOLD, "center");
      }
      if (b.stun > 0) Sh.uiText(c, "STUNNED", x, y - 86, 9, GOLD, "center");
    }
    c.restore();
  }

  function drawHazards(c, t) {
    var i, k;
    for (i = 0; i < S.waxes.length; i++) { var wx = S.waxes[i]; c.globalAlpha = Math.min(1, (wx.life - wx.t) * 2); c.fillStyle = "#f6e6b0"; c.beginPath(); c.ellipse(wx.x, FLOOR - 1, wx.w / 2, 4, 0, 0, TAU); c.fill(); rect(c, wx.x - 6, FLOOR - 4, 12, 2, "#fffbe0"); c.globalAlpha = 1; }
    for (i = 0; i < S.pits.length; i++) {
      var p = S.pits[i];
      if (p.t < p.warn) { for (k = 0; k < 5; k++) rect(c, p.x - p.w / 2 + k * 13 + 2, FLOOR - 2 + (k % 2) * 3, 8, 2, "#7a5a3a"); if (Math.sin(t * 20) > 0) Sh.uiText(c, "!", p.x, FLOOR - 30, 14, "#c9a26a", "center"); }
      else { rect(c, p.x - p.w / 2, FLOOR - 2, p.w, H - FLOOR + 2, "#050508"); rect(c, p.x - p.w / 2 - 3, FLOOR - 4, 6, 6, "#5a3e28"); rect(c, p.x + p.w / 2 - 3, FLOOR - 4, 6, 6, "#5a3e28"); }
    }
    for (i = 0; i < S.cols.length; i++) {
      var cl = S.cols[i], l = cl.x - cl.w / 2;
      if (!cl.fired) {
        var wc = cl.k === "torch" ? "255,210,63" : cl.k === "chain" ? "168,170,180" : "255,75,62";
        c.fillStyle = "rgba(" + wc + "," + (0.1 + 0.2 * (cl.t / cl.warn)) + ")"; c.fillRect(l, 190, cl.w, FLOOR - 190);
        rect(c, l, FLOOR - 4, cl.w, 4, "rgb(" + wc + ")"); Sh.uiText(c, "!", cl.x, FLOOR - 44, 16, "rgb(" + wc + ")", "center");
      } else if (cl.k === "cap") {
        var cy = Math.min(FLOOR - 40, 190 + (cl.t - cl.warn) * 3000);
        poly(c, [cl.x - 34, cy + 40, cl.x + 34, cy + 40, cl.x, cy - 20], "#c9a24a"); rect(c, cl.x - 36, cy + 36, 72, 5, "#8a6a2a");
      } else if (cl.k === "torch") {
        c.fillStyle = "rgba(255,210,63,.22)"; c.fillRect(l, 190, cl.w, FLOOR - 190);
        for (k = 0; k < 26; k++) rect(c, l + ((k * 37 + t * 400) % cl.w), 200 + ((k * 53 + t * 700) % (FLOOR - 200)), 3, 3, k % 3 ? GOLD : "#fffbe0");
      } else {
        c.strokeStyle = "#a8aab4"; c.lineWidth = 5; c.beginPath(); c.moveTo(l - 10, FLOOR - 30); for (k = 0; k <= 10; k++) c.lineTo(l + k * cl.w / 10, FLOOR - 30 + (k % 2 ? -8 : 8)); c.stroke();
        c.strokeStyle = "#5a5c66"; c.lineWidth = 2; c.stroke();
      }
    }
    for (i = 0; i < S.sweeps.length; i++) {
      var sw = S.sweeps[i], tip = sweepTip(sw);
      if (sw.t < sw.warn) {
        c.fillStyle = "rgba(47,158,90," + (0.08 + 0.18 * sw.t / sw.warn) + ")"; c.fillRect(sw.side < 0 ? 0 : W - sw.reach, 420, sw.reach, FLOOR - 420);
        Sh.uiText(c, sw.side < 0 ? "HOLLY >>" : "<< HOLLY", sw.side < 0 ? 44 : W - 44, 404, 9, "#9bff3f", "center");
      } else if (tip > 0) {
        var x0 = sw.side < 0 ? 0 : W - tip;
        rect(c, x0, FLOOR - 26, tip, 6, "#5a3418");
        for (k = 0; k < tip; k += 12) { var lx = x0 + k; poly(c, [lx, FLOOR - 24, lx + 8, FLOOR - 40, lx + 12, FLOOR - 24], "#2f9e5a"); poly(c, [lx + 2, FLOOR - 22, lx + 10, FLOOR - 8, lx + 12, FLOOR - 22], "#237a46"); if (k % 36 === 0) circ(c, lx + 6, FLOOR - 26, 3, RED); }
      }
    }
    for (i = 0; i < S.strikes.length; i++) {
      var st = S.strikes[i];
      if (st.t < 0) continue;
      if (!st.fired) { c.strokeStyle = "rgba(207,233,242," + (0.3 + 0.5 * (st.t / st.warn)) + ")"; c.lineWidth = 2; c.strokeRect(st.x - st.w / 2, FLOOR - 8, st.w, 8); c.beginPath(); c.arc(st.x, FLOOR - 4, st.w / 2 * (1 - st.t / st.warn) + 4, 0, TAU); c.stroke(); }
      else { c.strokeStyle = "#f6f4ee"; c.lineWidth = 4; c.beginPath(); c.moveTo(st.x, 170); for (var yy = 170; yy < FLOOR; yy += 34) c.lineTo(st.x + (Math.random() * 2 - 1) * 12, yy); c.lineTo(st.x, FLOOR); c.stroke(); c.strokeStyle = "#a77bff"; c.lineWidth = 2; c.stroke(); }
    }
    for (i = 0; i < S.shades.length; i++) {
      var sd = S.shades[i]; if (sd.d > 0) continue;
      var wv = Math.sin(t * 6 + i) * 3;
      poly(c, [sd.x - sd.w / 2 + wv, sd.y, sd.x + sd.w / 2 + wv, sd.y, sd.x + sd.w / 2 + 4, sd.y + sd.h, sd.x + 4, sd.y + sd.h - 8, sd.x - 4, sd.y + sd.h, sd.x - sd.w / 2 - 4, sd.y + sd.h - 6], "rgba(4,4,8,.92)");
      c.strokeStyle = "rgba(167,123,255,.5)"; c.lineWidth = 1; c.strokeRect(sd.x - sd.w / 2 + wv, sd.y, sd.w, sd.h - 4);
    }
    for (i = 0; i < S.cups.length; i++) {
      var cu = S.cups[i];
      c.fillStyle = "rgba(207,233,242,.8)"; c.beginPath(); c.moveTo(cu.x - 7, cu.y - 7); c.lineTo(cu.x + 7, cu.y - 7); c.lineTo(cu.x + 5, cu.y + 7); c.lineTo(cu.x - 5, cu.y + 7); c.fill();
      rect(c, cu.x - 5, cu.y - 2, 10, 7, "#c2304a"); rect(c, cu.x + 7, cu.y - 4, 3, 6, "rgba(207,233,242,.8)");
    }
    if (S.pend && S.pend.on > 0) {
      var pd = S.pend, by = FLOOR - 32 - (1 - pd.on) * 300;
      c.strokeStyle = "#8a6a2a"; c.lineWidth = 2; c.beginPath(); c.moveTo(pd.px, 76); c.lineTo(pd.bx, by); c.stroke();
      circ(c, pd.bx, by, 13, "#c9a24a"); circ(c, pd.bx - 4, by - 4, 4, "#ffe6a0"); rect(c, pd.px - 6, 72, 12, 6, "#8a6a2a");
    }
    for (i = 0; i < S.foes.length; i++) {
      var f = S.foes[i];
      if (f.k === "spark") { circ(c, f.x, f.y, 5, "rgba(255,210,63,.5)"); rect(c, f.x - 2, f.y - 2, 4, 4, "#fffbe0"); rect(c, f.x - 6, f.y, 12, 1, GOLD); rect(c, f.x, f.y - 6, 1, 12, GOLD); }
      else if (f.k === "wax") { c.fillStyle = "#f6e6b0"; c.beginPath(); c.ellipse(f.x, f.y, 3, 5, 0, 0, TAU); c.fill(); }
      else if (f.k === "nut") { circ(c, f.x, f.y, 7, "#7a3a1c"); rect(c, f.x - 3, f.y - 5, 6, 3, "#c28a5a"); rect(c, f.x - 1, f.y - 8, 2, 3, "#5a2a10"); }
      else if (f.k === "plate") { c.fillStyle = "#cfd3e6"; c.beginPath(); c.ellipse(f.x, f.y, 13, f.roll ? 9 : 5, 0, 0, TAU); c.fill(); c.strokeStyle = "#8e93a2"; c.lineWidth = 1; c.stroke(); if (f.roll) rect(c, f.x - 1 + Math.sin(f.x * 0.2) * 6, f.y - 1, 2, 2, "#8e93a2"); }
      else if (f.k === "ledger") {
        c.save(); c.translate(f.x, f.y); c.rotate(f.rot + Math.sin(f.y * 0.05) * 0.2);
        rect(c, -9, -12, 18, 24, f.fl ? "#fff" : (f.hp < 2 ? "#8a3a1c" : "#6a2a14")); rect(c, -9, -12, 4, 24, "#4a1a0a"); rect(c, -2, -6, 9, 2, "#c9a24a"); rect(c, -2, 2, 9, 1, "#c9a24a"); rect(c, 9, -10, 2, 20, "#f6f4ee");
        c.restore();
      }
      else if (f.k === "penny") { circ(c, f.x, f.y, 4, "#b8642a"); rect(c, f.x - 1, f.y - 2, 2, 2, "#e8a050"); }
    }
    for (i = 0; i < S.pickups.length; i++) {
      var pk = S.pickups[i];
      if (pk.life - pk.t < 1.5 && Math.sin(t * 24) > 0) continue;
      c.fillStyle = "rgba(255,255,255," + (0.12 + 0.08 * Math.sin(t * 8)) + ")"; c.beginPath(); c.arc(pk.x, pk.y, 16, 0, TAU); c.fill();
      drawPickup(c, pk.k, pk.x, pk.y, t);
    }
  }
  function drawPickup(c, k, x, y, t) {
    if (k === "watch") { circ(c, x, y, 9, "#c9a24a"); circ(c, x, y, 7, "#fff8e0"); rect(c, x - 1, y - 13, 3, 4, "#c9a24a"); c.strokeStyle = "#1b1b28"; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 5); c.moveTo(x, y); c.lineTo(x + 4, y); c.stroke(); }
    else if (k === "plum") { circ(c, x, y + 1, 8, "#6a3a9a"); circ(c, x - 3, y - 2, 2, "#c9a0ff"); for (var i = 0; i < 6; i++) rect(c, x - 7 + i * 3, y - 6 + (i % 2) * 9, 1, 1, "#fff"); rect(c, x, y - 10, 2, 4, "#3d6b2a"); }
    else if (k === "lily") { for (var j = 0; j < 5; j++) { var a = j / 5 * TAU + t; poly(c, [x, y, x + Math.cos(a - 0.3) * 6, y + Math.sin(a - 0.3) * 6, x + Math.cos(a) * 11, y + Math.sin(a) * 11, x + Math.cos(a + 0.3) * 6, y + Math.sin(a + 0.3) * 6], "#f6f4ee"); } circ(c, x, y, 3, GOLD); }
    else { circ(c, x - 5, y, 6, GOLD); circ(c, x - 5, y, 3, "#5a4a1a"); rect(c, x, y - 2, 12, 4, GOLD); rect(c, x + 8, y + 2, 2, 4, GOLD); rect(c, x + 4, y + 2, 2, 3, GOLD); }
  }

  function pudding(c, x, y, ok) {
    circ(c, x, y + 2, 6, ok ? "#5a2a14" : "#2a2d38");
    if (ok) { rect(c, x - 5, y - 3, 10, 3, "#f6f4ee"); circ(c, x - 1, y - 4, 1.6, RED); rect(c, x + 1, y - 6, 3, 2, "#2f9e5a"); }
  }
  function hud(c, t) {
    var b = S.boss, d = b.d;
    rect(c, 0, 0, W, 58, "rgba(5,6,16,.82)");
    Sh.text(c, comma(S.score), 8, 6, 9, GOLD);
    for (var i = 0; i < HEARTS; i++) pudding(c, W - 12 - i * 15, 9, i < S.hearts);
    Sh.uiText(c, "SPIRIT " + (S.bi + 1) + "/4", 196, 5, 9, "#8e93a2", "center");
    Sh.text(c, d.name, 8, 22, d.name.length > 26 ? 6 : d.name.length > 18 ? 7 : 8, d.col);
    var bw = W - 16, k = b.hp / d.hp, ks = b.hpShow / d.hp;
    rect(c, 8, 36, bw, 11, "#2a2d38"); rect(c, 8, 36, bw * ks, 11, "#ffffff"); rect(c, 8, 36, bw * k, 11, k < 0.25 ? "#ff4b3e" : k < 0.5 ? GOLD : GREEN);
    rect(c, 8, 36, bw * k, 3, "rgba(255,255,255,.35)");
    if (d.id === "marley") rect(c, 8 + bw * CLOSE, 34, 2, 15, "#fff1d6");
    Sh.uiText(c, Math.ceil(k * 100) + "%", W - 10, 36, 9, "#101219", "right");
    // the midnight clock
    var low = S.clock <= 30, cc = low ? (Math.sin(t * 10) > 0 ? "#ff4b3e" : "#fff1d6") : "#cfe9f2";
    rect(c, 0, 58, W, 15, "rgba(5,6,16,.6)");
    circ(c, 12, 65, 5, cc); c.strokeStyle = "#101219"; c.lineWidth = 1; c.beginPath(); c.moveTo(12, 65); c.lineTo(12, 61); c.moveTo(12, 65); c.lineTo(15, 65); c.stroke();
    Sh.uiText(c, clockText(S.clock) + "  " + mmss(S.clock) + " TO MIDNIGHT", 22, 60, 9, cc);
    Sh.uiText(c, "CREDIT " + S.credits + (S.practice ? " PRACTICE" : ""), W - 8, 60, 9, "#8e93a2", "right");
    if (b.open > 0) Sh.text(c, "OPEN! CRITS x2", W / 2, 80, 8, Math.sin(t * 16) > 0 ? GOLD : "#ff8a1f", "center");
    if (S.plum > 0) Sh.uiText(c, "SUGAR PLUM x2 " + S.plum.toFixed(1), 8, 94, 9, "#c9a0ff");
    if (S.boost > 0) Sh.uiText(c, "QUICK FEET", W - 8, 94, 9, GOLD, "right");
    if (S.combo >= 5) Sh.text(c, S.combo + " HITS", clamp(S.x, 44, W - 44), HERO_Y - 98, 7, S.combo >= 25 ? GOLD : "#3ff0ff", "center");
    if (d.id === "future" && S.underT > 1 && !S.slateDone) Sh.uiText(c, "STILL BENEATH " + S.underT.toFixed(1) + "s", W / 2, 108, 9, "#cfe9f2", "center");
    if (S.hintT > 0) Sh.uiText(c, "STAND STILL TO THROW. SLIDE TO DODGE.", W / 2, 386, 9, "#fff1d6", "center");
  }

  function drawEnding(c, t) {
    var e = S.ending, p = S.pt, i;
    if (e === "win") {
      drawStreet(c, t, true);
      c.fillStyle = "rgba(220,226,240," + Math.max(0, 0.8 - p * 0.25) + ")"; c.fillRect(0, 0, W, FLOOR);   // the fog lifts
      // the poulterer's and the prize turkey
      rect(c, 180, 380, 120, 80, "#6a3a24"); rect(c, 186, 392, 108, 46, "#f6d6a0"); rect(c, 180, 372, 120, 14, "#3a2a1a");
      Sh.uiText(c, "POULTERER", 240, 374, 8, GOLD, "center");
      c.fillStyle = "#c2702a"; c.beginPath(); c.ellipse(240, 420, 22, 14, 0, 0, TAU); c.fill(); rect(c, 222, 428, 4, 8, "#f6f4ee"); rect(c, 254, 428, 4, 8, "#f6f4ee");
      Sh.uiText(c, "PRIZE", 240, 397, 7, "#7a3a1c", "center");
      // Tiny Tim waving from an upstairs window
      rect(c, 96, 352, 40, 36, "#3a2a1a"); rect(c, 100, 356, 32, 28, "#ffd27a");
      rect(c, 110, 364, 12, 12, "#f1c28e"); rect(c, 110, 376, 12, 8, "#3b5a96"); rect(c, 109, 362, 14, 3, "#5a3a1c");
      rect(c, 113, 368, 2, 2, "#1b1b28"); rect(c, 117, 368, 2, 2, "#1b1b28");
      rect(c, 124, 358 + Math.sin(t * 8) * 3, 3, 10, "#f1c28e");
      // Scrooge, old and lean in a tall hat, paying for the bird
      var sx = 166; rect(c, sx - 7, 412, 14, 46, "#1b1b22"); rect(c, sx - 6, 398, 12, 14, "#e8d4c0"); rect(c, sx - 8, 382, 16, 16, "#101014"); rect(c, sx - 11, 396, 22, 3, "#101014");
      rect(c, sx - 3, 404, 2, 2, "#1b1b28"); rect(c, sx + 2, 404, 2, 2, "#1b1b28"); rect(c, sx - 2, 408, 5, 1, "#7a3a3a");
      rect(c, sx - 7, 412, 14, 3, RED); rect(c, sx + 7, 422, 10, 3, "#e8d4c0"); circ(c, sx + 19, 423, 3, GOLD);
      rect(c, sx - 6, 458, 5, 6, "#101014"); rect(c, sx + 1, 458, 5, 6, "#101014");
      // the collector tips his cap, a full pouch of spirit tokens at his side
      var hx = 70, tipUp = Math.max(0, Math.sin(Math.min(p, 3.1) * 2)) * 10;
      c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(hx, FLOOR - 1, 16, 4, 0, 0, TAU); c.fill();
      c.imageSmoothingEnabled = false; c.drawImage(heroSprite(0, tipUp > 2 ? 1 : 0), hx - 24, FLOOR - 72, 48, 72);
      if (tipUp > 2) { rect(c, hx - 12, FLOOR - 72 - tipUp, 24, 12, "#1d2b53"); rect(c, hx - 14, FLOOR - 61 - tipUp, 28, 3, "#141e3a"); rect(c, hx - 12, FLOOR - 72, 24, 4, "#4a2f1c"); }
      circ(c, hx + 22, FLOOR - 26, 8, "#7a5a3a"); rect(c, hx + 18, FLOOR - 36, 8, 3, "#5a3a1c");
      for (i = 0; i < 3; i++) token(c, hx + 16 + i * 6, FLOOR - 40 - Math.abs(Math.sin(t * 3 + i)) * 5, t);
      if (Math.floor(t * 2) % 2 === 0) { Sh.uiText(c, "DONG", 252, 172, 8, "#fff1d6", "center"); Sh.uiText(c, "DONG", 330, 196, 8, "#fff1d6", "center"); }
    } else {
      drawStreet(c, t, false);
      c.fillStyle = "rgba(0,0,0," + Math.min(0.55, p * 0.15) + ")"; c.fillRect(0, 0, W, H);
      if (e === "close" || e === "late") {
        var n = Math.min(12, Math.floor(p / 0.32) + 1);
        Sh.text(c, String(n), 292, 182, 14, "#fff1d6", "center");
        if (Math.floor(p / 0.32) < 12 && (p % 0.32) < 0.12) { c.strokeStyle = "rgba(255,241,214,.6)"; c.lineWidth = 2; c.beginPath(); c.arc(292, 230, 22 + (p % 0.32) * 120, 0, TAU); c.stroke(); }
      }
      if (e === "close") {
        // the dark counting-house; Marley's vault door slams shut on your score
        var sw = Math.min(1, Math.max(0, (p - 3.9) / 0.5));
        rect(c, 100, 250, 160, 200, "#0a0c10"); rect(c, 96, 246, 168, 4, "#c9a24a");
        Sh.uiText(c, "YOUR SCORE", 180, 322, 9, "#8e93a2", "center");
        Sh.text(c, comma(S.score), 180, 340, 12, GOLD, "center");
        var dw = 160 * sw; rect(c, 260 - dw, 250, dw, 200, "#2e3a34"); c.strokeStyle = "#c9a24a"; c.lineWidth = 3; c.strokeRect(260 - dw, 250, Math.max(1, dw), 200);
        if (sw >= 1) { circ(c, 180, 350, 18, "#c9a24a"); circ(c, 180, 350, 10, "#5a4a1a"); if (p < 4.6) Sh.shake(8, 0.3); }
      }
      if (e === "humbug") Sh.text(c, "BAH!", W / 2, 280, 28, "#ff4b3e", "center");
    }
    var E = ENDINGS[e];
    rect(c, 0, 92, W, 54, "rgba(5,6,16,.72)");
    Sh.text(c, E.title, W / 2, 104, E.title.length > 12 ? 13 : 16, E.col, "center");
    Sh.uiText(c, E.head, W / 2, 128, 9, "#eceae2", "center");
    if (p > 1.5) Sh.uiText(c, "TAP TO CONTINUE", W / 2, 520, 9, Math.sin(t * 6) > 0 ? "#fff1d6" : "#8e93a2", "center");
  }

  function draw(c, state) {
    var t = state === "playing" || state === "paused" ? S.t : idleT, i;
    if ((state === "playing" || state === "paused") && S.phase === "ending") { drawEnding(c, t); return; }
    drawStreet(c, t, false);
    if (state === "playing" || state === "paused") {
      drawHazards(c, t);
      drawBoss(c, S.boss, t);
      for (i = 0; i < S.shots.length; i++) token(c, S.shots[i].x, S.shots[i].y, S.shots[i].r);
      if (S.phase !== "dead") drawHero(c, S.x, t, Math.abs(S.vx) > 20, S.phase === "fight" && S.stillT > 0.06);
      else { c.globalAlpha = 0.5; drawHero(c, S.x, t, false, false); c.globalAlpha = 1; }
      for (i = 0; i < parts.length; i++) { var q2 = parts[i]; c.globalAlpha = Math.max(0, 1 - q2.t / q2.life); rect(c, q2.x, q2.y, q2.s, q2.s, q2.c); }
      c.globalAlpha = 1;
      for (i = 0; i < floats.length; i++) { var f = floats[i]; c.globalAlpha = Math.max(0, 1 - f.t / 0.8); Sh.text(c, f.s, f.x, f.y, 7, f.c, "center"); }
      c.globalAlpha = 1;
      hud(c, t);
      if (S.phase === "intro") {
        c.fillStyle = "rgba(0,0,0,.6)"; c.fillRect(0, 214, W, 108);
        Sh.text(c, "SPIRIT " + (S.bi + 1) + " OF 4", W / 2, 224, 8, "#8e93a2", "center");
        var nm = S.boss.d.name;
        Sh.text(c, nm, W / 2, 244, nm.length > 26 ? 8 : nm.length > 18 ? 9 : 12, S.boss.d.col, "center");
        Sh.uiText(c, S.boss.d.sub, W / 2, 268, 10, "#eceae2", "center");
        Sh.uiText(c, S.boss.d.intro, W / 2, 292, 11, "#fff1d6", "center");
      }
      if (S.phase === "ko" && S.pt < 2.1) {
        var sc = 1 + Math.max(0, 0.6 - S.pt) * 2;
        c.save(); c.translate(W / 2, 250); c.scale(sc, sc); Sh.text(c, "K.O.!", 0, -14, 28, GOLD, "center", GREEN); c.restore();
        if (S.lastKO) Sh.uiText(c, "+" + comma(S.lastKO.bonus) + (S.lastKO.noHit ? "  NO HIT!" : "") + "   " + S.lastKO.t.toFixed(1) + "s", W / 2, 296, 11, S.lastKO.noHit ? "#9bff3f" : "#eceae2", "center");
        Sh.uiText(c, S.boss.d.ko, W / 2, 316, 10, "#fff1d6", "center");
      }
      if (S.phase === "dead") {
        c.fillStyle = "rgba(0,0,0,.65)"; c.fillRect(0, 210, W, 120);
        Sh.text(c, "CONTINUE?", W / 2, 226, 16, "#ff4b3e", "center");
        Sh.text(c, String(Math.max(0, Math.ceil(6 - S.pt))), W / 2, 254, 18, "#fff1d6", "center");
        Sh.uiText(c, S.pt > 0.7 ? "TAP (OR SPACE) TO SPEND A CREDIT" : "...", W / 2, 286, 9, "#eceae2", "center");
        Sh.uiText(c, "THE CLOCK KEEPS RUNNING", W / 2, 304, 9, GOLD, "center");
      }
    } else {
      // Title / over backdrop: the collector faces the four visitors in turn
      var sv = { x: S.x, inv: S.inv, plum: S.plum, boost: S.boost, ph: S.phase }; S.inv = 0; S.plum = 0; S.boost = 0; S.phase = "title";
      drawBoss(c, { d: BOSSES[Math.floor(idleT / 2.5) % BOSSES.length], x: W / 2 + Math.sin(idleT) * 60, y: 170, flash: 0, open: 0, shield: 0, stun: 0, spin: 0, burst: 0, capOff: 0 }, idleT);
      drawHero(c, W / 2, idleT, false, false);
      S.x = sv.x; S.inv = sv.inv; S.plum = sv.plum; S.boost = sv.boost; S.phase = sv.ph;
    }
  }

  if (dbg) window.SH_DEBUG = {
    state: function () { return S; }, bosses: BOSSES,
    skipTo: function (i) { startBoss(i); },
    ko: function () { if (S.phase === "fight") { S.boss.hp = 1; S.boss.shield = 0; hitBoss({ x: S.boss.x, y: S.boss.y }); } },
    setHp: function (f) { S.boss.hp = Math.max(1, Math.round(S.boss.d.hp * f)); },
    setClock: function (s) { S.clock = s; },
    hurt: function (src) { S.inv = 0; hurt(src); },
    god: function (on) { S.god = on; },
    pickup: function (k) { grab({ k: k || S.boss.d.pickup, x: S.x, y: HERO_Y }); },
    spin: function () { S.boss.spin = 0.9; S.boss.burst = 0; },
    ledgers: function (n) { for (var i = 0; i < (n || 1); i++) smashLedger({ x: S.x, y: 300 }); },
    under: function (sec) { S.underT = sec; S.underBest = Math.max(S.underBest, sec); }
  };

  Sh.init({
    slug: SLUG,
    title: "SCROOGE'S HAUNT",
    accent: GREEN,
    width: W, height: H,
    format: function (n) { return comma(n) + " PTS"; },
    howTo: "Christmas Eve, 1843. Four spirits walk the streets of London and midnight is coming fast. Slide left and right to dodge. Stand still to throw spirit tokens straight up: stand under a spirit to hit it, and smash Marley's falling ledgers. When a spirit glows OPEN, every hit is a CRIT. Beat all four before the clock strikes twelve.",
    keys: "Drag or move the mouse to slide, hold still to throw. Keys: left and right arrows (or A and D). Space spends a credit. P pause, M mute, R restart.",
    tip: "Pickups: pocket watch (+10 seconds), sugar plum, white lily, golden key. Out of puddings? Spend a credit, but the clock keeps running.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; tick(dt); },
    onPause: function () { keys = {}; }
  });
})();
