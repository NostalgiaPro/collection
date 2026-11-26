/* BEFORE THE BALL (classic 2D fallback)
   December 31, 1999. Mom is on the cordless. The VCR blinks 12:00, the camcorder
   tape is not rewound, and the computer is still dialing. Run the house, finish
   five party jobs, and reach the living room window before the ball drops.
   Jump the Y2K glitches. Logical canvas 360 x 540. Seconds and logical pixels.
   Tune: Auld Lang Syne, traditional, public domain, played as chiptune. */
(function () {
  "use strict";

  var W = 360, H = 540, FLOOR = 430;
  var TOTAL = 180, VCR_NEED = 7, DIAL_NEED = 18, TAPE_NEED = 6, AIM_NEED = 8, HEARTS = 4;
  var JUMP_V = -560, GRAV = 1020, SPEED = 108;
  var Sh = window.Shell;
  var reduced = !!(Sh && Sh.reduced);

  var COLS = ["#ffd23f", "#ff3fa4", "#3ff0ff", "#9bff3f", "#ff4b3e"];
  var BTN = {
    L: { x: 8, y: 468, w: 100, h: 62 },
    R: { x: 116, y: 468, w: 100, h: 62 },
    J: { x: 232, y: 460, w: 120, h: 70 }
  };

  var ROOMS = [
    {
      id: "kitchen", name: "KITCHEN", tip: "Three horns. Then the door.",
      platforms: [
        { x: 16, y: 358, w: 112, look: "wood" },
        { x: 156, y: 296, w: 70, look: "wood" },
        { x: 250, y: 362, w: 92, look: "wood" }
      ],
      items: [
        { kind: "horn", x: 62, y: 336 },
        { kind: "horn", x: 176, y: 408 },
        { kind: "horn", x: 292, y: 340 }
      ],
      bits: [{ x: 100, y: 326 }, { x: 188, y: 268 }, { x: 312, y: 330 }],
      zeros: [
        { x: 110, vx: 46, min: 40, max: 145 },
        { x: 260, vx: -40, min: 214, max: 318 }
      ],
      door: true
    },
    {
      id: "den", name: "THE DEN", tip: "Stand on the set and hold the clock.",
      platforms: [
        { x: 10, y: 368, w: 108, look: "couch" },
        { x: 150, y: 310, w: 118, look: "stand" },
        { x: 286, y: 370, w: 58, look: "wood" }
      ],
      items: [],
      bits: [{ x: 52, y: 340 }, { x: 206, y: 278 }, { x: 308, y: 342 }],
      zeros: [{ x: 90, vx: 42, min: 36, max: 210 }],
      vcr: { x: 186, y: 310, w: 72 },
      drops: true, door: true
    },
    {
      id: "hall", name: "THE HALL", tip: "Mom has the cordless. Dial from the desk.",
      platforms: [
        { x: 8, y: 342, w: 78, look: "shelf" },
        { x: 112, y: 290, w: 68, look: "shelf" },
        { x: 188, y: 334, w: 70, look: "shelf" },
        { x: 236, y: 362, w: 112, look: "desk" }
      ],
      items: [],
      bits: [{ x: 42, y: 312 }, { x: 142, y: 258 }, { x: 300, y: 332 }],
      zeros: [],
      mom: { x: 150, vx: 26, min: 118, max: 188 },
      pc: { x: 248, y: 362, w: 90 },
      bars: true, door: true
    },
    {
      id: "stairs", name: "THE STAIRS", tip: "Climb to the landing. The door is up there.",
      platforms: [
        { x: 8, y: 390, w: 72, look: "wood" },
        { x: 108, y: 340, w: 72, look: "wood" },
        { x: 200, y: 292, w: 70, look: "wood" },
        { x: 248, y: 250, w: 104, look: "wood" }
      ],
      items: [],
      bits: [{ x: 40, y: 360 }, { x: 140, y: 310 }, { x: 290, y: 220 }],
      zeros: [{ x: 200, vx: 42, min: 50, max: 300 }],
      door: true
    },
    {
      id: "living", name: "LIVING ROOM", tip: "Rewind, popper, then jump the string lights.",
      platforms: [
        { x: 12, y: 370, w: 100, look: "table" },
        { x: 148, y: 302, w: 76, look: "shelf" },
        { x: 250, y: 366, w: 96, look: "wood" }
      ],
      items: [{ kind: "popper", x: 186, y: 278 }],
      bits: [{ x: 54, y: 342 }, { x: 186, y: 250 }, { x: 300, y: 336 }],
      zeros: [],
      tape: { x: 18, y: 370, w: 84 },
      bulbs: [{ x: 58, y: 342 }, { x: 186, y: 274 }, { x: 286, y: 338 }, { x: 324, y: 338 }],
      drops: false, door: false, windowX: 300
    }
  ];

  var S = null, ptrs = {}, fx = [], idleT = 0, holdT = 0, holdGot = false;
  var DEBUG = /[?&]debug=1(?:&|$)/.test(location.search);

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function comma(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function unlock(id) { if (window.Trophies) window.Trophies.unlock(id); }
  function room() { return ROOMS[S.room]; }
  function showTouch() {
    try { if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true; } catch (e) {}
    return window.innerWidth <= 900;
  }

  function clockParts(left) {
    var s = Math.max(0, Math.ceil(left));
    var tot = 12 * 3600 - s;
    if (tot < 0) tot = 0;
    return {
      hh: Math.floor(tot / 3600),
      mm: Math.floor((tot % 3600) / 60),
      ss: tot % 60
    };
  }
  function z2(n) { return (n < 10 ? "0" : "") + n; }
  function clockText(left, t, blink) {
    var p = clockParts(left);
    var c = !blink || Math.floor((t || 0) * 2) % 2 ? ":" : " ";
    return p.hh + c + z2(p.mm) + c + z2(p.ss);
  }
  function clockShort(left) {
    var s = Math.max(0, Math.ceil(left));
    return Math.floor(s / 60) + ":" + z2(s % 60);
  }

  function jobsDone() {
    return S.jobs.noise >= 3 && S.jobs.vcr && S.jobs.pc && S.jobs.tape && S.jobs.popper;
  }
  function roomClear() {
    var id = room().id;
    if (id === "kitchen") return S.jobs.noise >= 3;
    if (id === "den") return !!S.jobs.vcr;
    if (id === "hall") return !!S.jobs.pc;
    if (id === "stairs") return !!(S.ground && S.y <= 280);
    return false;
  }
  function missing() {
    var a = [];
    if (S.jobs.noise < 3) a.push("the noisemakers");
    if (!S.jobs.vcr) a.push("the VCR");
    if (!S.jobs.pc) a.push("the computer");
    if (!S.jobs.tape) a.push("the camcorder");
    if (!S.jobs.popper) a.push("the popper");
    return a;
  }
  function stats() {
    return {
      noise: S.jobs.noise,
      vcr: S.jobs.vcr ? 1 : 0,
      pc: S.jobs.pc ? 1 : 0,
      tape: S.jobs.tape ? 1 : 0,
      popper: S.jobs.popper ? 1 : 0,
      won: S.won ? 1 : 0,
      hits: S.hits,
      left: Math.max(0, S.left),
      momBump: S.momBump ? 1 : 0,
      passedMom: S.passedMom ? 1 : 0,
      bitsGot: S.bitsGot,
      bitsAll: S.bitsAll,
      score: Math.round(S.score)
    };
  }

  function reset() {
    S = {
      t: 0, x: 28, y: FLOOR, vx: 0, vy: 0, face: 1, ground: true, coyote: 0, jumpBuf: 0,
      kLeft: false, kRight: false, kJump: false, tLeft: false, tRight: false, tJump: false,
      walk: 0, knockT: 0, knockV: 0, inv: 0, enterT: 0,
      phase: "play", finT: 0, downT: 0, ended: 0, won: 0, reason: "",
      left: TOTAL, score: 0, hearts: HEARTS, hits: 0, roomHits: 0, room: 0,
      jobs: { noise: 0, vcr: 0, vcrT: 0, pc: 0, pcOn: 0, pcT: 0, tape: 0, tapeT: 0, popper: 0, bulbs: 0 },
      momBump: 0, passedMom: 0, bitsGot: 0, bitsAll: 0,
      items: [], bits: [], glitches: [], drops: [], bars: [],
      mom: null, dropT: 1.4, barT: 1, barN: 0, intro: 0, live: 0, greeted: 0
    };
    fx.length = 0;
    ptrs = {};
    goRoom(0, true);
    S.live = 1;
  }

  function goRoom(i, silent) {
    var leaving = S.live && !silent && S.room !== i;
    if (leaving && S.roomHits === 0) unlock("nye-clean");
    var R = ROOMS[i];
    S.room = i;
    S.x = 28;
    S.y = FLOOR;
    S.vx = 0;
    S.vy = 0;
    S.ground = true;
    S.knockT = 0;
    S.roomHits = 0;
    S.enterT = 0;
    S.glitches = [];
    S.drops = [];
    S.bars = [];
    S.dropT = 1.3;
    S.barT = 0.9;
    S.items = [];
    S.bits = [];
    S.bulbs = [];
    var n, src;
    for (n = 0; n < R.zeros.length; n++) {
      src = R.zeros[n];
      S.glitches.push({ x: src.x, y: FLOOR, vx: src.vx, min: src.min, max: src.max });
    }
    for (n = 0; n < (R.items || []).length; n++) {
      src = R.items[n];
      S.items.push({ kind: src.kind, x: src.x, y: src.y, got: 0 });
    }
    for (n = 0; n < R.bits.length; n++) {
      src = R.bits[n];
      S.bits.push({ x: src.x, y: src.y, hue: n + i * 3, got: 0 });
      S.bitsAll++;
    }
    for (n = 0; n < (R.bulbs || []).length; n++) {
      src = R.bulbs[n];
      S.bulbs.push({ x: src.x, y: src.y, got: 0 });
    }
    S.mom = R.mom ? { x: R.mom.x, vx: Math.abs(R.mom.vx), min: R.mom.min, max: R.mom.max } : null;
    if (!silent && S.live) Sh.flash(R.name, R.tip, "#ffd23f", 1300);
  }

  function addScore(n, x, y, col) {
    S.score += n;
    fx.push({ kind: "float", x: x, y: y, t: 0, life: 0.7, text: "+" + n, col: col || "#ffd23f" });
  }

  function playerBox() {
    return { l: S.x - 9, r: S.x + 9, t: S.y - 46, b: S.y - 8 };
  }
  function overlap(a, b) {
    return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  }
  function near(x, y, r) {
    var dx = S.x - x, dy = (S.y - 28) - y;
    return dx * dx + dy * dy < r * r;
  }
  function onZone(z) {
    if (!z || !S.ground) return false;
    return Math.abs(S.y - z.y) <= 12 && S.x >= z.x && S.x <= z.x + z.w;
  }

  function damage(fromX, mom, tag) {
    if (S.phase !== "play" || S.ended || S.inv > 0 || S.enterT < 0.55) return;
    S.lastHit = tag || (mom ? "mom" : "hit");
    S.inv = 1.25;
    S.hearts -= 1;
    S.hits += 1;
    S.roomHits += 1;
    if (mom) S.momBump = 1;
    var dir = S.x < fromX ? -1 : 1;
    S.knockV = dir * 60;
    S.knockT = 0.1;
    S.vy = -160;
    S.ground = false;
    if (!S.jobs.vcr) S.jobs.vcrT = Math.max(0, S.jobs.vcrT - 1.1);
    if (S.jobs.pcOn && !S.jobs.pc) S.jobs.pcT = Math.max(0, S.jobs.pcT - 1.4);
    if (!S.jobs.tape) S.jobs.tapeT = Math.max(0, S.jobs.tapeT - 1.1);
    Sh.sfx("hit");
    Sh.shake(5, 0.22);
    if (S.hearts <= 0) {
      S.phase = "down";
      S.downT = 0.6;
      Sh.flash("GLITCHED", "The party just crashed.", "#ff4b3e", 900);
    } else if (mom) {
      Sh.flash("I'M ON THE PHONE", S.hearts === 1 ? "1 heart left" : S.hearts + " hearts left", "#ff3fa4", 900);
    } else {
      Sh.flash("Y2K GLITCH", S.hearts === 1 ? "1 heart left" : S.hearts + " hearts left", "#ff4b3e", 800);
    }
  }

  function finishJob(id) {
    if (id === "vcr") {
      S.jobs.vcr = 1;
      addScore(1000, S.x, S.y - 70, "#9bff3f");
      Sh.sfx("ding");
      Sh.flash("CLOCK IS SET", "No more blinking.", "#9bff3f", 1000);
    } else if (id === "pc") {
      S.jobs.pc = 1;
      addScore(1000, S.x, S.y - 70, "#3ff0ff");
      Sh.sfx("ding");
      Sh.tone(660, 0.08, "square", 0.08);
      Sh.tone(990, 0.12, "square", 0.08, 0, 0.08);
      Sh.flash("HANDSHAKE OK", "The page is up.", "#3ff0ff", 1000);
    } else if (id === "tape") {
      S.jobs.tape = 1;
      addScore(800, S.x, S.y - 70, "#ffd23f");
      Sh.sfx("score");
      Sh.flash("TAPE READY", "Rewound to the start.", "#ffd23f", 1000);
    }
  }

  function startFinale() {
    if (S.phase !== "play" || S.ended) return;
    S.phase = "finale";
    S.finT = 0;
    S.glitches = [];
    S.drops = [];
    S.bars = [];
    if (S.roomHits === 0) unlock("nye-clean");
    var bonus = Math.ceil(Math.max(0, S.left)) * 20 + (S.hits === 0 ? 2000 : 0) + S.hearts * 300;
    S.score += bonus;
    Sh.sfx("crowd");
    Sh.flash("THE BALL DROPS", "Happy 2000.", "#ffd23f", 1500);
  }

  function endCopy(won, reason) {
    if (won) return "The ball drops. The camcorder is rolling, and Mom is still on the phone.";
    if (reason === "time") {
      var m = missing();
      if (!m.length) return "Midnight. The jobs were done, but the window was empty.";
      return "Midnight. Still missing " + m.join(", ") + ".";
    }
    return "The glitches ate the party. The VCR is still blinking.";
  }
  function summary(line) {
    function row(k, v) { return '<div class="np-row"><span>' + k + '</span><b>' + v + '</b></div>'; }
    var jobs = (S.jobs.noise >= 3 ? 1 : 0) + (S.jobs.vcr ? 1 : 0) + (S.jobs.pc ? 1 : 0) + (S.jobs.tape ? 1 : 0) + (S.jobs.popper ? 1 : 0);
    return "<p>" + line + "</p>" +
      row("Party jobs", jobs + " / 5") +
      row("Time left", clockShort(S.left)) +
      row("Glitch hits", String(S.hits)) +
      row("Confetti scraps", S.bitsGot + " / " + S.bitsAll);
  }
  function endRun(won, reason) {
    if (S.ended) return;
    S.ended = 1;
    S.won = won ? 1 : 0;
    S.reason = reason || "";
    if (!won) S.phase = "dead";
    var title = won ? "THE BALL DROPS" : (reason === "time" ? "MIDNIGHT" : "GLITCHED OUT");
    Sh.gameOver(Math.round(S.score), { title: title, html: summary(endCopy(won, reason)), stats: stats() });
  }

  function physics(dt, allowInput) {
    var left = allowInput && (S.kLeft || S.tLeft);
    var right = allowInput && (S.kRight || S.tRight);
    var dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (S.knockT > 0) {
      S.knockT -= dt;
      S.vx = S.knockV;
    } else {
      S.vx = dir * SPEED;
      if (dir) S.face = dir;
    }
    if (allowInput && S.jumpBuf > 0 && (S.ground || S.coyote > 0)) {
      S.vy = JUMP_V;
      S.ground = false;
      S.coyote = 0;
      S.jumpBuf = 0;
      S.walk = 0;
      Sh.tone(210, 0.05, "square", 0.05, 460);
    } else if (S.jumpBuf > 0) S.jumpBuf -= dt;

    var prev = S.y;
    S.x += S.vx * dt;
    var R = room();
    var maxX = 346;
    if (R.door && !roomClear()) maxX = 322;
    S.x = clamp(S.x, 16, maxX);
    S.vy = Math.min(720, S.vy + GRAV * dt);
    S.y += S.vy * dt;
    S.ground = false;
    if (S.vy >= 0) {
      var land = null;
      var plats = R.platforms;
      for (var i = 0; i < plats.length; i++) {
        var p = plats[i];
        if (S.x > p.x - 2 && S.x < p.x + p.w + 2 && prev <= p.y && S.y >= p.y) {
          if (land === null || p.y < land) land = p.y;
        }
      }
      if (prev <= FLOOR && S.y >= FLOOR && (land === null || FLOOR < land)) land = FLOOR;
      if (land !== null && land >= prev - 0.01) {
        S.y = land;
        S.vy = 0;
        S.ground = true;
      }
    }
    if (S.y > FLOOR) { S.y = FLOOR; S.vy = 0; S.ground = true; }
    if (S.y < 150) { S.y = 150; if (S.vy < 0) S.vy = 0; }
    if (S.ground) S.coyote = 0.12; else S.coyote -= dt;
    if (dir && S.ground) S.walk += dt * 10;
  }

  function update(dt) {
    if (!S || S.ended) return;
    S.t += dt;
    S.enterT += dt;
    S.inv = Math.max(0, S.inv - dt);
    tickFx(dt);

    if (S.phase === "finale") {
      S.finT += dt;
      S.x += (308 - S.x) * Math.min(1, dt * 3);
      S.y += (FLOOR - S.y) * Math.min(1, dt * 8);
      S.face = 1;
      if (!reduced || Math.random() < 0.4) {
        fx.push({
          kind: "bit", x: Math.random() * W, y: 30,
          vx: (Math.random() - 0.5) * 50, vy: 28 + Math.random() * 40,
          life: 2.4, t: 0, col: COLS[(Math.random() * COLS.length) | 0], s: 2 + Math.random() * 2
        });
      }
      if (S.finT > 4.1) endRun(true);
      return;
    }

    if (S.phase === "down") {
      physics(dt, false);
      S.downT -= dt;
      if (S.downT <= 0) endRun(false, "hearts");
      return;
    }

    if (!S.intro) {
      S.intro = 1;
      Sh.flash(room().name, room().tip, "#ffd23f", 1400);
    }

    physics(dt, true);
    var R = room();
    var i;

    if (S.mom) {
      S.mom.x += S.mom.vx * dt;
      if (S.mom.x < S.mom.min) { S.mom.x = S.mom.min; S.mom.vx = Math.abs(S.mom.vx); }
      if (S.mom.x > S.mom.max) { S.mom.x = S.mom.max; S.mom.vx = -Math.abs(S.mom.vx); }
      if (S.x > S.mom.x + 12) S.passedMom = 1;
      var mb = { l: S.mom.x - 11, r: S.mom.x + 11, t: FLOOR - 58, b: FLOOR - 4 };
      if (overlap(playerBox(), mb)) damage(S.mom.x, true, "mom");
    }

    for (i = S.glitches.length - 1; i >= 0; i--) {
      var g = S.glitches[i];
      g.x += g.vx * dt;
      if (g.x < g.min) { g.x = g.min; g.vx = Math.abs(g.vx); }
      if (g.x > g.max) { g.x = g.max; g.vx = -Math.abs(g.vx); }
      var gb = { l: g.x - 11, r: g.x + 11, t: g.y - 22, b: g.y - 2 };
      if (overlap(playerBox(), gb)) damage(g.x, false, "zero");
    }

    if (R.drops) {
      S.dropT -= dt;
      if (S.dropT <= 0 && S.drops.length < 2) {
        S.dropT = room().id === "living" ? 3.1 : 2.15;
        var dx = 24, tries = 0, ok = false;
        while (tries < 8) {
          dx = 20 + Math.random() * 300;
          var onStand = R.vcr && dx + 36 > R.vcr.x - 16 && dx < R.vcr.x + R.vcr.w + 16;
          if (!onStand && Math.abs(dx + 18 - S.x) > 70) { ok = true; break; }
          tries++;
        }
        if (ok) S.drops.push({ x: dx, y: 48, vy: 0, warn: 0.7, splat: 0 });
      }
    }
    for (i = S.drops.length - 1; i >= 0; i--) {
      var d = S.drops[i];
      if (d.warn > 0) {
        d.warn -= dt;
        if (d.warn <= 0) d.vy = 250;
      } else if (!d.splat) {
        d.y += d.vy * dt;
        var db = { l: d.x, r: d.x + 36, t: d.y, b: d.y + 24 };
        if (overlap(playerBox(), db)) damage(d.x + 18, false, "drop");
        if (d.y > FLOOR - 26) { d.y = FLOOR - 26; d.splat = 0.2; }
      } else {
        d.splat -= dt;
        if (d.splat <= 0) S.drops.splice(i, 1);
      }
    }

    if (R.bars && S.jobs.pcOn && !S.jobs.pc) {
      S.barT -= dt;
      if (S.barT <= 0) {
        S.barT = 1.42;
        var high = (S.barN++ % 2) === 1;
        S.bars.push({ y: high ? 322 : 396, t: 0, warn: 0.48, life: 0.95, beep: 0 });
      }
    }
    for (i = S.bars.length - 1; i >= 0; i--) {
      var b = S.bars[i];
      b.t += dt;
      var solid = b.t > b.warn && b.t < b.life;
      if (solid && !b.beep) {
        b.beep = 1;
        Sh.tone(420, 0.09, "sawtooth", 0.04, 980);
        Sh.noise(0.1, 0.05, 2200, 0.5);
      }
      if (solid) {
        var bb = { l: 0, r: W, t: b.y, b: b.y + 16 };
        if (overlap(playerBox(), bb)) damage(S.x, false, "bar");
      }
      if (b.t > b.life) S.bars.splice(i, 1);
    }
    if (S.phase !== "play") return;

    for (i = S.items.length - 1; i >= 0; i--) {
      var it = S.items[i];
      if (it.got || !near(it.x, it.y, 22)) continue;
      it.got = 1;
      if (it.kind === "horn") {
        if (S.jobs.noise < 3) {
          S.jobs.noise++;
          addScore(300, it.x, it.y - 16);
          Sh.sfx("score");
          if (S.jobs.noise >= 3) Sh.flash("HORNS READY", "The door is open.", "#ffd23f", 1000);
        }
      } else if (it.kind === "popper" && !S.jobs.popper) {
        S.jobs.popper = 1;
        addScore(800, it.x, it.y - 16, "#ff3fa4");
        Sh.sfx("ding");
        Sh.flash("POPPER", "Confetti is armed.", "#ff3fa4", 900);
      }
    }
    for (i = 0; i < S.bits.length; i++) {
      var bit = S.bits[i];
      if (bit.got || !near(bit.x, bit.y, 20)) continue;
      bit.got = 1;
      S.bitsGot++;
      addScore(50, bit.x, bit.y - 10, COLS[bit.hue % COLS.length]);
      Sh.tone(880, 0.04, "square", 0.05);
    }
    if (S.bulbs) {
      for (i = 0; i < S.bulbs.length; i++) {
        var bulb = S.bulbs[i];
        if (bulb.got || !near(bulb.x, bulb.y, 22)) continue;
        bulb.got = 1;
        S.jobs.bulbs++;
        addScore(150, bulb.x, bulb.y - 12, "#fff6c8");
        Sh.sfx("score");
        if (S.jobs.bulbs >= S.bulbs.length) Sh.flash("LIGHTS UP", "Now the window.", "#ffd23f", 900);
      }
    }

    if (R.vcr && !S.jobs.vcr && onZone(R.vcr)) {
      S.jobs.vcrT += dt;
      if (S.jobs.vcrT >= VCR_NEED) finishJob("vcr");
    }
    if (R.pc && !S.jobs.pc && onZone(R.pc)) S.jobs.pcOn = 1;
    if (S.jobs.pcOn && !S.jobs.pc) {
      S.jobs.pcT += dt;
      if (S.jobs.pcT >= DIAL_NEED) finishJob("pc");
    }
    if (R.tape && !S.jobs.tape && onZone(R.tape)) {
      S.jobs.tapeT += dt;
      if (S.jobs.tapeT >= TAPE_NEED) finishJob("tape");
    }

    if (R.door && roomClear() && S.x > 330) goRoom(S.room + 1);
    var lightsReady = !S.bulbs || !S.bulbs.length || S.jobs.bulbs >= S.bulbs.length;
    if (R.id === "living" && jobsDone() && lightsReady && S.ground && S.x > R.windowX) {
      S.aimT = (S.aimT || 0) + dt;
      if (S.aimT >= AIM_NEED) startFinale();
    } else S.aimT = Math.max(0, (S.aimT || 0) - dt * 0.5);

    if (S.phase === "play") {
      S.left -= dt;
      if (S.left <= 0) { S.left = 0; endRun(false, "time"); }
    }
  }

  function tickFx(dt) {
    for (var i = fx.length - 1; i >= 0; i--) {
      var f = fx[i];
      f.t += dt;
      if (f.kind === "bit") {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vy += 36 * dt;
      } else f.y -= 26 * dt;
      if (f.t > f.life) fx.splice(i, 1);
    }
    if (fx.length > 100) fx.splice(0, fx.length - 100);
  }

  /* ---------- pixel people, same 16x24 recipe as the arcade cast ---------- */
  var FW = 16, FH = 24, OUT = "#0b1022";
  var figCache = {};

  function shade(hex, f) {
    var n = parseInt(String(hex).slice(1), 16);
    if (!isFinite(n)) return hex;
    f = f == null ? 0.72 : f;
    return "rgb(" + Math.round(((n >> 16) & 255) * f) + "," + Math.round(((n >> 8) & 255) * f) + "," + Math.round((n & 255) * f) + ")";
  }
  function mk() { return { p: new Array(FW * FH) }; }
  function px(b, x, y, c) { if (c && x >= 0 && x < FW && y >= 0 && y < FH) b.p[y * FW + x] = c; }
  function rc(b, x, y, w, h, c) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) px(b, x + i, y + j, typeof c === "function" ? c(x + i, y + j) : c);
  }
  function outline(b) {
    var add = [];
    for (var y = 0; y < FH; y++) for (var x = 0; x < FW; x++) {
      if (b.p[y * FW + x]) continue;
      if ((x > 0 && b.p[y * FW + x - 1]) || (x < FW - 1 && b.p[y * FW + x + 1]) ||
          (y > 0 && b.p[(y - 1) * FW + x]) || (y < FH - 1 && b.p[(y + 1) * FW + x])) add.push(y * FW + x);
    }
    for (var i = 0; i < add.length; i++) b.p[add[i]] = OUT;
  }
  function kidShirt(x, y) {
    if (y === 13 && (x === 6 || x === 8)) return "#ffd23f";
    if (y === 14 && x === 7) return "#ff3fa4";
    if (y === 15 && x >= 5 && x <= 9) return "#3ff0ff";
    return "#1d2b53";
  }
  function momShirt(x, y) {
    if (y === 14 && x >= 6 && x <= 8) return "#ffd23f";
    return ((x + y) % 5) === 0 ? "#1d5c32" : "#2f8a4e";
  }
  function partyHat(b, view) {
    if (view === "front") {
      rc(b, 7, 0, 2, 1, "#fff1d6");
      rc(b, 6, 1, 4, 1, "#ffd23f");
      rc(b, 5, 2, 6, 1, "#ff3fa4");
      rc(b, 4, 3, 8, 1, "#ffd23f");
      rc(b, 3, 4, 10, 1, "#ff3fa4");
    } else {
      rc(b, 6, 0, 2, 1, "#fff1d6");
      rc(b, 5, 1, 3, 1, "#ffd23f");
      rc(b, 4, 2, 5, 1, "#ff3fa4");
      rc(b, 3, 3, 6, 1, "#ffd23f");
      rc(b, 2, 4, 8, 1, "#ff3fa4");
    }
  }
  function hair(b, style, col, view) {
    var d = shade(col, 0.75);
    if (view === "front") {
      rc(b, 4, 2, 8, 3, col);
      px(b, 4, 5, col); px(b, 11, 5, col);
      px(b, 6, 4, d); px(b, 9, 4, d);
      if (style === "long") {
        rc(b, 3, 4, 1, 9, col);
        rc(b, 12, 4, 1, 9, col);
        px(b, 4, 6, col); px(b, 11, 6, col);
      }
      if (style === "spiky") { px(b, 4, 1, col); px(b, 6, 1, col); px(b, 8, 1, col); px(b, 10, 1, col); }
    } else {
      rc(b, 4, 2, 7, 3, col);
      rc(b, 8, 5, 3, 4, col);
      px(b, 9, 6, d);
      if (style === "long") rc(b, 8, 5, 4, 9, col);
      if (style === "spiky") { px(b, 5, 1, col); px(b, 7, 1, col); px(b, 9, 1, col); }
    }
  }
  function phone(b) {
    rc(b, 11, 5, 1, 1, "#9aa0aa");
    rc(b, 10, 6, 3, 5, "#d7dae2");
    rc(b, 11, 7, 1, 2, "#2a2d38");
    px(b, 11, 10, "#3fd07a");
  }
  var CAST = {
    kid: { skin: "#f1c28e", nose: "#c19a72", hair: "#4a2f1c", style: "short", shirt: kidShirt, pants: "#2a3a62", shoe: "#f3f0ea", hat: 1 },
    mom: { skin: "#f1c28e", nose: "#c19a72", hair: "#6b3418", style: "long", shirt: momShirt, pants: "#1b3044", shoe: "#b8894e", hat: 0, phone: 1 },
    guestA: { skin: "#f1c28e", nose: "#c19a72", hair: "#c4a15a", style: "long", shirt: "#ff3fa4", pants: "#7a2458", shoe: "#f3f0ea", hat: 1 },
    guestB: { skin: "#c68642", nose: "#8d5a30", hair: "#1b1b22", style: "spiky", shirt: "#3ec8e0", pants: "#243456", shoe: "#eceae2", hat: 1 }
  };
  function buildFigure(who, view, step) {
    var key = who + "|" + view + "|" + step;
    if (figCache[key]) return figCache[key];
    var spec = CAST[who], b = mk();
    var shirt = spec.shirt, pants = spec.pants, shoe = spec.shoe, skin = spec.skin;
    if (view === "front") {
      var lUp = step === 1 ? 1 : 0, rUp = step === 2 ? 1 : 0;
      rc(b, 4, 18, 8, 2, pants);
      rc(b, 4, 20, 3, 2 - lUp, pants);
      rc(b, 9, 20, 3, 2 - rUp, pants);
      rc(b, 4, 22 - lUp, 3, 2, shoe);
      rc(b, 9, 22 - rUp, 3, 2, shoe);
      px(b, 5, 22 - lUp, "#ffd23f");
      px(b, 10, 22 - rUp, "#ffd23f");
      rc(b, 4, 11, 8, 7, shirt);
      rc(b, 3, 11, 1, 3, shirt);
      rc(b, 12, 11, 1, 3, shirt);
      rc(b, 3, 14, 1, 3 - rUp, skin);
      rc(b, 12, 14, 1, 3 - lUp, skin);
      rc(b, 4, 3, 8, 8, skin);
      px(b, 6, 7, "#1b1b28"); px(b, 6, 8, "#1b1b28");
      px(b, 9, 7, "#1b1b28"); px(b, 9, 8, "#1b1b28");
      px(b, 7, 10, spec.nose); px(b, 8, 10, spec.nose);
    } else {
      if (step === 0) {
        rc(b, 6, 18, 4, 4, pants);
        rc(b, 5, 22, 5, 2, shoe);
        px(b, 6, 22, "#ffd23f");
      } else {
        var nearC = step === 1 ? pants : shade(pants, 0.78);
        var farC = step === 1 ? shade(pants, 0.78) : pants;
        rc(b, 8, 18, 3, 3, farC);
        rc(b, 9, 21, 3, 2, shoe);
        rc(b, 4, 18, 3, 4, nearC);
        rc(b, 3, 22, 4, 2, shoe);
        rc(b, 6, 18, 3, 1, pants);
        px(b, 4, 22, "#ffd23f");
      }
      rc(b, 5, 11, 6, 7, shirt);
      if (step === 0) rc(b, 7, 15, 2, 2, skin);
      else if (step === 1) { rc(b, 4, 12, 1, 2, shirt); rc(b, 4, 14, 1, 2, skin); }
      else { rc(b, 11, 12, 1, 2, shirt); rc(b, 11, 14, 1, 2, skin); }
      rc(b, 4, 3, 7, 8, skin);
      px(b, 3, 8, skin);
      px(b, 5, 7, "#1b1b28");
      px(b, 5, 8, "#1b1b28");
    }
    hair(b, spec.style, spec.hair, view);
    if (spec.hat) partyHat(b, view);
    if (spec.phone && view === "side") phone(b);
    outline(b);
    var cv = document.createElement("canvas");
    cv.width = FW; cv.height = FH;
    var g = cv.getContext("2d");
    for (var y = 0; y < FH; y++) for (var x = 0; x < FW; x++) {
      var col = b.p[y * FW + x];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
    figCache[key] = cv;
    return cv;
  }
  function drawFigure(c, who, view, step, x, feet, face) {
    var spr = buildFigure(who, view, step || 0);
    var w = FW * 3, h = FH * 3;
    c.imageSmoothingEnabled = false;
    c.save();
    if (view === "side" && face > 0) {
      c.translate(Math.round(x + w / 2), Math.round(feet - h));
      c.scale(-1, 1);
      c.drawImage(spr, 0, 0, w, h);
    } else {
      c.drawImage(spr, Math.round(x - w / 2), Math.round(feet - h), w, h);
    }
    c.restore();
  }
  function shadow(c, x, y) {
    c.fillStyle = "rgba(0,0,0,.35)";
    c.beginPath();
    c.ellipse(x, y, 14, 4, 0, 0, Math.PI * 2);
    c.fill();
  }
  function stepOf(moving, walk) {
    if (!moving) return 0;
    return [1, 0, 2, 0][Math.floor(walk) % 4];
  }

  /* ---------- props ---------- */
  function drawHorn(c, x, y, t) {
    var px0 = Math.round(x), py = Math.round(y + Math.sin(t * 4 + x) * 2);
    c.fillStyle = "#fff1d6";
    c.fillRect(px0 - 12, py - 2, 8, 6);
    c.fillStyle = "#ffd23f";
    c.fillRect(px0 - 6, py - 5, 10, 10);
    c.fillStyle = "#ff4b3e";
    c.fillRect(px0 - 2, py - 3, 3, 6);
    c.fillStyle = "#ff3fa4";
    c.fillRect(px0 + 4, py - 9, 10, 16);
    c.fillStyle = "#ffd23f";
    c.fillRect(px0 + 6, py - 6, 6, 3);
    c.fillRect(px0 + 6, py + 1, 6, 3);
  }
  function drawPopper(c, x, y, t) {
    var px0 = Math.round(x), py = Math.round(y + Math.sin(t * 5) * 2);
    c.fillStyle = "#ffd23f";
    c.fillRect(px0 - 3, py - 2, 6, 16);
    c.fillStyle = "#ff3fa4";
    c.fillRect(px0 - 5, py + 8, 10, 4);
    c.fillStyle = "#3ff0ff";
    c.fillRect(px0 - 1, py - 8, 2, 7);
    for (var i = 0; i < 4; i++) {
      c.fillStyle = COLS[i];
      c.fillRect(px0 - 7 + i * 4, py - 14 - ((i + Math.floor(t * 6)) % 3) * 2, 2, 2);
    }
  }
  function drawCam(c, x, y, ready, t) {
    c.fillStyle = "#2a2d38";
    c.fillRect(x, y, 30, 16);
    c.fillStyle = "#1b1b22";
    c.fillRect(x + 16, y + 3, 12, 10);
    c.fillStyle = "#8d93a3";
    c.fillRect(x + 26, y + 6, 6, 4);
    c.fillStyle = "#c9c4b8";
    c.fillRect(x + 8, y + 16, 2, 5);
    var blink = ready || Math.floor(t * 3) % 2 === 0;
    c.fillStyle = blink ? (ready ? "#9bff3f" : "#ff4b3e") : "#3a2020";
    c.fillRect(x + 4, y + 4, 4, 4);
  }
  function drawCRT(c, x, y, w, h, t, ballY) {
    c.fillStyle = "#241c16";
    c.fillRect(x, y, w, h);
    c.fillStyle = "#3a3128";
    c.fillRect(x, y, w, 4);
    c.fillStyle = "#071018";
    c.fillRect(x + 5, y + 8, w - 10, h - 16);
    c.fillStyle = "#102033";
    c.fillRect(x + 8, y + h - 22, w - 16, 8);
    if (ballY != null) {
      c.fillStyle = "#9aa0aa";
      c.fillRect(x + w / 2, y + 12, 1, h - 28);
      c.fillStyle = "#ffd23f";
      c.beginPath();
      c.arc(x + w / 2, y + 18 + (ballY || 0), 5, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "rgba(255,255,255,.14)";
    c.fillRect(x + 7, y + 10, 3, h - 24);
    c.fillStyle = Math.floor(t * 2) % 2 ? "#9bff3f" : "#245c32";
    c.fillRect(x + w - 8, y + h - 6, 3, 3);
  }
  function drawVCR(c, x, y, t, set, left) {
    c.fillStyle = "#16161c";
    c.fillRect(x, y, 62, 20);
    c.fillStyle = "#0c0c12";
    c.fillRect(x + 4, y + 4, 22, 12);
    c.fillStyle = "#2a2d38";
    c.fillRect(x + 6, y + 7, 18, 3);
    var show = set || Math.floor(t * 2) % 2 === 0;
    if (show) Sh.text(c, set ? clockText(left, t, false).slice(0, 5) : "12:00", x + 30, y + 6, 6, "#ff4b3e");
  }
  function drawTower(c, x, y, on, t) {
    c.fillStyle = "#d9d3c6";
    c.fillRect(x, y, 22, 36);
    c.fillStyle = "#1b1b22";
    c.fillRect(x + 4, y + 6, 14, 8);
    c.fillStyle = on ? (Math.floor(t * 8) % 2 ? "#ffd23f" : "#3ff0ff") : "#5a5044";
    c.fillRect(x + 6, y + 18, 3, 3);
    c.fillStyle = "#8d93a3";
    c.fillRect(x + 4, y + 26, 14, 3);
  }
  function drawMonitor(c, x, y, label, t) {
    c.fillStyle = "#cfc6b4";
    c.fillRect(x, y, 46, 34);
    c.fillStyle = "#1a1408";
    c.fillRect(x + 4, y + 4, 38, 22);
    c.fillStyle = "#e6a23c";
    Sh.uiText(c, label, x + 23, y + 10, 11, "#e6a23c", "center");
    c.fillStyle = "#8a8172";
    c.fillRect(x + 18, y + 34, 10, 4);
    c.fillRect(x + 12, y + 38, 22, 3);
  }
  function lights(c, y, t) {
    c.fillStyle = "#241c18";
    c.fillRect(0, y, W, 2);
    for (var x = 6; x < W; x += 16) {
      var on = reduced || Math.sin(t * 3 + x * 0.2) > -0.15;
      c.fillStyle = on ? COLS[(x / 16) % COLS.length] : "#2a2d38";
      c.fillRect(x, y + 3, 5, 5);
    }
  }
  function skyline(c, x, y, w, h, t) {
    c.fillStyle = "#070b18";
    c.fillRect(x, y, w, h);
    var cursor = x + 4;
    var i = 0;
    while (cursor < x + w - 8) {
      var bw = 16 + (i % 3) * 6;
      var bh = 18 + ((i * 17) % Math.max(20, h - 16));
      c.fillStyle = i % 2 ? "#14182c" : "#101426";
      c.fillRect(cursor, y + h - bh, bw, bh);
      for (var wy = y + h - bh + 4; wy < y + h - 4; wy += 7) {
        c.fillStyle = ((cursor + wy + i) % 9 > 4) ? (Math.sin(t + wy) > 0 ? "#ffe08a" : "#b79a58") : "#1a2034";
        c.fillRect(cursor + 3, wy, 2, 3);
      }
      cursor += bw + 3;
      i++;
    }
  }
  function drawBall(c, x, y, r) {
    c.fillStyle = "#b7bdc9";
    c.fillRect(x - 1, y, 2, 70);
    c.fillStyle = "#ffd23f";
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#fff6c8";
    c.fillRect(x - r + 2, y - r + 2, 3, 3);
    c.strokeStyle = "#e0a820";
    c.lineWidth = 1;
    c.beginPath();
    c.arc(x, y, Math.max(2, r - 3), 0, Math.PI * 2);
    c.stroke();
  }
  function firework(c, x, y, t, phase) {
    var u = (t * 0.45 + phase) % 1;
    if (u < 0.45) return;
    var k = (u - 0.45) / 0.55;
    var rad = 4 + k * 26;
    c.globalAlpha = 1 - k;
    for (var i = 0; i < 8; i++) {
      var a = i / 8 * Math.PI * 2 + phase;
      c.fillStyle = COLS[i % COLS.length];
      c.fillRect(x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.7, 2, 2);
    }
    c.globalAlpha = 1;
  }
  function drawPlatform(c, p) {
    var body = "#6a452c", top = "#c4a574";
    if (p.look === "couch") { body = "#6e2438"; top = "#c45a78"; }
    else if (p.look === "stand") { body = "#2a241c"; top = "#5a5044"; }
    else if (p.look === "shelf") { body = "#3a2a22"; top = "#8d6844"; }
    else if (p.look === "desk") { body = "#cbbfa6"; top = "#efe6d4"; }
    else if (p.look === "table") { body = "#5c3b28"; top = "#b48458"; }
    c.fillStyle = body;
    c.fillRect(p.x, p.y, p.w, 10);
    c.fillStyle = top;
    c.fillRect(p.x, p.y, p.w, 3);
  }
  function bubble(c, x, y, text) {
    var w = text.length * 7 + 14;
    c.fillStyle = "#f6f3ea";
    c.fillRect(x - w / 2, y, w, 16);
    c.fillRect(x - 3, y + 14, 6, 5);
    Sh.uiText(c, text, x, y + 2, 11, "#1b1020", "center");
  }

  function drawRoom(c, id, t, left, finale) {
    var ballDrop = finale ? Math.min(1, (S.finT || 0) / 2.3) : 0;
    if (id === "kitchen") {
      var g = c.createLinearGradient(0, 0, 0, FLOOR);
      g.addColorStop(0, "#2a1c38"); g.addColorStop(1, "#4a3450");
      c.fillStyle = g; c.fillRect(0, 0, W, FLOOR);
      c.fillStyle = "rgba(255,255,255,.04)";
      for (var s = 0; s < W; s += 14) c.fillRect(s, 40, 6, FLOOR - 40);
      c.fillStyle = "#5a4030";
      c.fillRect(0, 48, W, 28);
      c.fillStyle = "#3d2a22";
      for (var k = 8; k < W; k += 36) c.fillRect(k, 54, 28, 16);
      c.fillStyle = "#9fd7ff";
      c.fillRect(168, 100, 64, 40);
      c.fillStyle = "#0c1428";
      c.fillRect(172, 104, 56, 32);
      c.fillStyle = "#f4f1ea";
      c.fillRect(292, 250, 40, FLOOR - 250);
      c.fillStyle = "#d0cbc0";
      c.fillRect(296, 258, 32, 46);
      c.fillStyle = "#ffd23f";
      c.fillRect(300, 270, 6, 8);
      c.fillStyle = "#ff3fa4";
      c.fillRect(312, 284, 8, 6);
      drawFloor(c, "#6a4a32");
    } else if (id === "den") {
      c.fillStyle = "#3a2618"; c.fillRect(0, 0, W, FLOOR);
      for (var p = 0; p < 8; p++) {
        c.fillStyle = p % 2 ? "#4a3120" : "#342214";
        c.fillRect(p * 46, 36, 46, FLOOR - 36);
      }
      c.fillStyle = "#1b140e";
      c.fillRect(16, 120, 54, 70);
      for (var tape = 0; tape < 8; tape++) {
        c.fillStyle = COLS[tape % COLS.length];
        c.fillRect(20 + (tape % 4) * 12, 126 + Math.floor(tape / 4) * 28, 8, 22);
      }
      drawCRT(c, 154, 228, 70, 58, t, 8);
      drawVCR(c, 158, 290, t, S && S.jobs && S.jobs.vcr, left);
      c.fillStyle = "#e6d2a2";
      c.beginPath(); c.arc(318, 150, 16, 0, Math.PI * 2); c.fill();
      c.fillStyle = "rgba(255, 214, 140, .18)";
      c.beginPath(); c.arc(318, 180, 70, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#6b5030";
      c.fillRect(314, 166, 8, 40);
      drawFloor(c, "#2e2438");
    } else if (id === "hall") {
      var hg = c.createLinearGradient(0, 0, 0, FLOOR);
      hg.addColorStop(0, "#241c30"); hg.addColorStop(1, "#3a3450");
      c.fillStyle = hg; c.fillRect(0, 0, W, FLOOR);
      for (var fr = 0; fr < 3; fr++) {
        c.fillStyle = "#e6dcc4";
        c.fillRect(24 + fr * 28, 78, 22, 18);
        c.fillStyle = COLS[fr];
        c.fillRect(27 + fr * 28, 81, 16, 12);
      }
      drawMonitor(c, 268, 300, (S && S.jobs && S.jobs.pc) ? "OK!" : (S && S.jobs && S.jobs.pcOn ? "DIAL" : "OFF"), t);
      drawTower(c, 318, 324, !!(S && S.jobs && S.jobs.pcOn), t);
      c.fillStyle = "#8d93a3";
      c.fillRect(328, 358, 2, FLOOR - 358);
      drawFloor(c, "#4a4038");
    } else if (id === "stairs") {
      c.fillStyle = "#2a1a12";
      c.fillRect(0, 0, W, FLOOR);
      for (var st = 0; st < 6; st++) {
        c.fillStyle = st % 2 ? "#3d2918" : "#2c1c10";
        c.fillRect(0, 60 + st * 56, W, 28);
      }
      c.fillStyle = "#9fd7ff";
      c.fillRect(246, 86, 78, 40);
      c.fillStyle = "#0c1428";
      c.fillRect(250, 90, 70, 32);
      drawFloor(c, "#4a3428");
    } else {
      var lg = c.createLinearGradient(0, 0, 0, FLOOR);
      lg.addColorStop(0, "#14102a"); lg.addColorStop(1, "#2a2040");
      c.fillStyle = lg; c.fillRect(0, 0, W, FLOOR);
      c.fillStyle = "#0c1020";
      c.fillRect(18, 48, 324, 150);
      c.strokeStyle = "#cbb892";
      c.lineWidth = 4;
      c.strokeRect(18, 48, 324, 150);
      skyline(c, 24, 56, 312, 134, t);
      drawBall(c, 180, 78 + ballDrop * 78, 10);
      if (!reduced) {
        firework(c, 70, 80, t, 0.1);
        firework(c, 280, 70, t, 0.55);
      }
      lights(c, 210, t);
      drawBanner(c, 136, 214);
      drawCRT(c, 16, 300, 52, 44, t, ballDrop * 10);
      drawFloor(c, "#3a2a24");
    }
    if (id !== "living" && id !== "den") lights(c, id === "kitchen" ? 40 : 46, t);
  }
  function drawFloor(c, tint) {
    c.fillStyle = tint;
    c.fillRect(0, FLOOR, W, H - FLOOR);
    c.fillStyle = "rgba(0,0,0,.16)";
    for (var x = 0; x < W; x += 18) c.fillRect(x, FLOOR, 2, 40);
    c.fillStyle = "rgba(255,255,255,.12)";
    c.fillRect(0, FLOOR, W, 3);
  }
  function drawBanner(c, x, y) {
    var nums = ["2", "0", "0", "0"];
    for (var i = 0; i < 4; i++) {
      c.fillStyle = i % 2 ? "#ff3fa4" : "#ffd23f";
      c.fillRect(x + i * 22, y, 18, 20);
      Sh.text(c, nums[i], x + i * 22 + 9, y + 6, 8, "#101219", "center");
    }
  }
  function drawZero(c, g, t) {
    var x = Math.round(g.x), y = Math.round(g.y);
    var jx = Math.sin(t * 24 + g.x) * 2;
    c.fillStyle = "#1a0a18";
    c.fillRect(x - 14, y - 26, 28, 22);
    c.strokeStyle = "#ff4b3e";
    c.lineWidth = 2;
    c.strokeRect(x - 10, y - 22, 8, 12);
    c.strokeRect(x + 2, y - 22, 8, 12);
    c.fillStyle = "#3ff0ff";
    c.fillRect(x - 16 + jx, y - 28, 3, 2);
    c.fillStyle = "#ff3fa4";
    c.fillRect(x + 12 - jx, y - 10, 4, 2);
    c.fillStyle = "#ffd23f";
    c.fillRect(x - 4, y - 8, 2, 2);
  }
  function drawDrop(c, d) {
    if (d.warn > 0) {
      var a = 0.35 + 0.4 * (1 - d.warn / 0.62);
      c.fillStyle = "rgba(255,75,62," + a + ")";
      c.fillRect(d.x, FLOOR - 4, 36, 4);
      c.globalAlpha = 0.45;
    }
    c.fillStyle = "#1c3c8a";
    c.fillRect(d.x, d.y, 36, 24);
    c.fillStyle = "#9ec0ff";
    c.fillRect(d.x, d.y, 36, 5);
    c.fillStyle = "#e8eeff";
    c.fillRect(d.x + 8, d.y + 10, 3, 3);
    c.fillRect(d.x + 24, d.y + 10, 3, 3);
    c.fillRect(d.x + 10, d.y + 17, 16, 2);
    c.globalAlpha = 1;
  }
  function drawBar(c, b, t) {
    var solid = b.t > b.warn;
    c.globalAlpha = solid ? 0.9 : 0.35;
    for (var x = 0; x < W; x += 7) {
      var h = 3 + ((x + Math.floor(t * 40)) % 9);
      c.fillStyle = (x / 7) % 3 ? "#d8fff8" : "#3ff0ff";
      c.fillRect(x, b.y + (x % 5), 4, h);
    }
    c.globalAlpha = 1;
  }
  function drawDoor(c, open, t) {
    if (open) {
      c.fillStyle = "#14101c";
      c.fillRect(328, 300, 32, FLOOR - 300);
      c.fillStyle = "rgba(255,210,63," + (0.25 + 0.15 * Math.sin(t * 6)) + ")";
      c.fillRect(332, 308, 24, FLOOR - 316);
      Sh.text(c, "GO", 344, 340, 8, "#ffd23f", "center");
    } else {
      c.fillStyle = "#4a301c";
      c.fillRect(326, 300, 34, FLOOR - 300);
      c.fillStyle = "#2a1c10";
      c.fillRect(334, 330, 16, 28);
      c.fillStyle = "#ffd23f";
      c.fillRect(346, 360, 3, 3);
    }
  }
  function drawBit(c, b, t) {
    c.save();
    c.translate(Math.round(b.x), Math.round(b.y + Math.sin(t * 3 + b.x) * 2));
    c.fillStyle = COLS[b.hue % COLS.length];
    c.rotate(0.4);
    c.fillRect(-3, -2, 6, 3);
    c.restore();
  }
  function drawHeart(c, x, y, on) {
    var col = on ? "#ff4b3e" : "#2c3040";
    c.fillStyle = col;
    c.fillRect(x, y + 2, 3, 3);
    c.fillRect(x + 4, y + 2, 3, 3);
    c.fillRect(x, y + 4, 7, 3);
    c.fillRect(x + 1, y + 7, 5, 2);
    c.fillRect(x + 2, y + 9, 3, 1);
    if (on) { c.fillStyle = "#ffd0cc"; c.fillRect(x + 1, y + 3, 1, 1); }
  }
  function objective() {
    var id = room().id;
    if (id === "kitchen") return "HORNS " + S.jobs.noise + "/3";
    if (id === "den") return S.jobs.vcr ? "CLOCK SET" : "SET THE VCR";
    if (id === "hall") {
      if (S.jobs.pc) return "ONLINE";
      if (S.jobs.pcOn) return "DIALING " + Math.min(99, Math.floor(S.jobs.pcT / DIAL_NEED * 100)) + "%";
      return "START THE DIAL";
    }
    if (id === "stairs") return S.y <= 280 ? "LANDING" : "CLIMB";
    if (!S.jobs.tape) return "REWIND THE TAPE";
    if (!S.jobs.popper) return "GET THE POPPER";
    if (S.bulbs && S.bulbs.length && S.jobs.bulbs < S.bulbs.length) return "LIGHTS " + S.jobs.bulbs + "/" + S.bulbs.length;
    return "AIM AT THE WINDOW";
  }
  function drawHud(c, t) {
    c.fillStyle = "rgba(8,10,18,.84)";
    c.fillRect(0, 0, W, 36);
    Sh.text(c, comma(S.score), 8, 6, 8, "#ffd23f");
    var urgent = S.left < 20;
    var col = urgent && Math.floor(t * 4) % 2 ? "#fff1d6" : "#ff4b3e";
    Sh.text(c, clockText(S.left, t, true), W / 2, 5, 8, col, "center");
    for (var i = 0; i < HEARTS; i++) drawHeart(c, W - 14 - (HEARTS - i) * 14, 8, i < S.hearts);
    Sh.uiText(c, objective(), W / 2, 20, 11, "#eceae2", "center");
  }
  function drawMeter(c) {
    var k = -1, label = "";
    if (room().id === "den" && !S.jobs.vcr && onZone(room().vcr)) { k = S.jobs.vcrT / VCR_NEED; label = "SET"; }
    else if (room().id === "hall" && S.jobs.pcOn && !S.jobs.pc) { k = S.jobs.pcT / DIAL_NEED; label = "DIAL"; }
    else if (room().id === "living" && !S.jobs.tape && onZone(room().tape)) { k = S.jobs.tapeT / TAPE_NEED; label = "REW"; }
    else if (room().id === "living" && jobsDone() && (!S.bulbs.length || S.jobs.bulbs >= S.bulbs.length) && S.x > (room().windowX || 999)) { k = (S.aimT || 0) / AIM_NEED; label = "AIM"; }
    if (k < 0) return;
    var x = S.x - 24, y = S.y - 86;
    c.fillStyle = "#0b0c10";
    c.fillRect(x, y, 48, 6);
    c.fillStyle = "#9bff3f";
    c.fillRect(x, y, Math.max(0, Math.min(48, Math.round(48 * k))), 6);
    Sh.uiText(c, label, x, y - 12, 10, "#eceae2");
  }
  function drawButtons(c) {
    drawBtn(c, BTN.L, S.tLeft, "left");
    drawBtn(c, BTN.R, S.tRight, "right");
    drawBtn(c, BTN.J, S.tJump, "jump");
  }
  function drawBtn(c, b, on, kind) {
    c.fillStyle = on ? "rgba(255,210,63,.92)" : "rgba(12,14,22,.8)";
    c.fillRect(b.x, b.y, b.w, b.h);
    c.strokeStyle = on ? "#fff6c8" : "#ffd23f";
    c.lineWidth = 2;
    c.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    if (kind === "jump") {
      Sh.text(c, "JUMP", b.x + b.w / 2, b.y + 24, 10, on ? "#101219" : "#ffd23f", "center");
      return;
    }
    c.fillStyle = on ? "#101219" : "#ffd23f";
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    c.beginPath();
    if (kind === "left") { c.moveTo(cx + 12, cy - 12); c.lineTo(cx - 12, cy); c.lineTo(cx + 12, cy + 12); }
    else { c.moveTo(cx - 12, cy - 12); c.lineTo(cx + 12, cy); c.lineTo(cx - 12, cy + 12); }
    c.fill();
  }

  function drawWorld(c, t, state) {
    var finale = S.phase === "finale" || (S.won && state !== "playing" && state !== "paused");
    drawRoom(c, room().id, t, S.left, finale);
    var R = room();
    var i;
    for (i = 0; i < R.platforms.length; i++) drawPlatform(c, R.platforms[i]);
    if (R.tape) drawCam(c, 36, 348, !!S.jobs.tape, t);
    for (i = 0; i < S.bits.length; i++) if (!S.bits[i].got) drawBit(c, S.bits[i], t);
    if (S.bulbs) {
      for (i = 0; i < S.bulbs.length; i++) {
        var lb = S.bulbs[i];
        if (lb.got) continue;
        c.fillStyle = COLS[i % COLS.length];
        c.fillRect(lb.x - 3, lb.y - 3, 6, 6);
        c.fillStyle = "#fff6c8";
        c.fillRect(lb.x - 1, lb.y - 1, 2, 2);
      }
    }
    for (i = 0; i < S.items.length; i++) {
      var it = S.items[i];
      if (it.got) continue;
      if (it.kind === "horn") drawHorn(c, it.x, it.y, t);
      else drawPopper(c, it.x, it.y, t);
    }
    for (i = 0; i < S.drops.length; i++) drawDrop(c, S.drops[i]);
    for (i = 0; i < S.bars.length; i++) drawBar(c, S.bars[i], t);
    for (i = 0; i < S.glitches.length; i++) drawZero(c, S.glitches[i], t);
    if (S.mom && S.phase !== "finale") {
      shadow(c, S.mom.x, FLOOR);
      var mstep = stepOf(true, S.t * 6);
      drawFigure(c, "mom", "side", mstep, S.mom.x, FLOOR, S.mom.vx >= 0 ? 1 : -1);
      bubble(c, S.mom.x, FLOOR - 84, "ON THE PHONE");
    }
    if (room().id === "living") {
      var bob = (S.phase === "finale") ? Math.abs(Math.sin(t * 8)) * 8 : Math.abs(Math.sin(t * 2)) * 2;
      shadow(c, 292, FLOOR);
      shadow(c, 336, FLOOR);
      drawFigure(c, "guestA", "front", 0, 292, FLOOR - bob, 1);
      drawFigure(c, "guestB", "front", 0, 336, FLOOR - bob * 0.6, 1);
      if (jobsDone() && S.phase === "play") {
        c.fillStyle = "rgba(255,210,63," + (0.08 + 0.06 * Math.sin(t * 6)) + ")";
        c.fillRect(270, 48, 90, FLOOR - 48);
      }
    }
    if (R.door && S.phase === "play") drawDoor(c, roomClear(), t);
    if (!(S.inv > 0 && Math.sin(t * 40) > 0)) {
      var feet = S.y;
      if (S.phase === "finale") feet = FLOOR - Math.abs(Math.sin(S.finT * 8)) * 6;
      shadow(c, S.x, Math.min(feet, FLOOR));
      var moving = Math.abs(S.vx) > 20 && S.ground && S.phase === "play";
      drawFigure(c, "kid", "side", stepOf(moving, S.walk), S.x, feet, S.face);
    }
    drawMeter(c);
    for (i = 0; i < fx.length; i++) {
      var f = fx[i];
      c.globalAlpha = Math.max(0, 1 - f.t / f.life);
      if (f.kind === "bit") {
        c.fillStyle = f.col;
        c.fillRect(f.x, f.y, f.s || 3, f.s || 2);
      } else Sh.text(c, f.text, f.x, f.y, 7, f.col, "center");
    }
    c.globalAlpha = 1;
    if (S.phase === "finale" && S.finT > 1.6) {
      Sh.text(c, "2000", W / 2, 150, 20, Math.floor(S.finT * 4) % 2 ? "#ffd23f" : "#fff6c8", "center", "#ffd23f");
    }
  }

  function drawDiorama(c, t) {
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#090c1c"); g.addColorStop(0.45, "#1a1440"); g.addColorStop(1, "#2a2044");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = "#f4e7b0";
    c.beginPath(); c.arc(300, 48, 12, 0, Math.PI * 2); c.fill();
    if (!reduced) {
      firework(c, 60, 40, t, 0.2);
      firework(c, 180, 28, t, 0.62);
      firework(c, 250, 60, t, 0.05);
    }
    c.fillStyle = "#0c1020";
    c.fillRect(28, 70, 304, 120);
    c.strokeStyle = "#cbb892";
    c.lineWidth = 4;
    c.strokeRect(28, 70, 304, 120);
    skyline(c, 34, 78, 292, 104, t);
    drawBall(c, 180, 92 + Math.sin(t) * 3, 9);
    lights(c, 200, t);
    drawBanner(c, 136, 214);
    drawFloor(c, "#3a2a24");
    drawCRT(c, 16, 360, 58, 46, t, 4);
    drawVCR(c, 18, 410, t, false, TOTAL);
    shadow(c, 170, FLOOR);
    shadow(c, 286, FLOOR);
    var bob = Math.abs(Math.sin(t * 2)) * 2;
    drawFigure(c, "kid", "front", 0, 170, FLOOR - bob, 1);
    drawHorn(c, 196, FLOOR - 40, t);
    drawFigure(c, "mom", "side", 0, 286, FLOOR, -1);
    bubble(c, 286, FLOOR - 86, "ON THE PHONE");
    for (var i = 0; i < 16; i++) {
      var y = (t * 28 + i * 53) % (H - 20);
      c.fillStyle = COLS[i % COLS.length];
      c.fillRect((i * 47) % W, y, 3, 2);
    }
  }

  function draw(c, state) {
    var t = (state === "playing" || state === "paused") && S && S.phase !== "dead" ? S.t : idleT;
    if (!S || state === "title") {
      drawDiorama(c, idleT);
      return;
    }
    drawWorld(c, t, state);
    if (state === "playing" || state === "paused") {
      drawHud(c, t);
      if (showTouch()) drawButtons(c);
    }
  }

  function idle(dt) {
    idleT += dt;
    if (Sh.state && Sh.state() === "title") {
      holdT += dt;
      if (!holdGot && holdT >= 45) { holdGot = true; unlock("nye-hold"); }
    }
  }

  function inBtn(p, b) { return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; }
  function applyPtrs() {
    var L = false, R = false, J = false, id;
    for (id in ptrs) {
      if (!Object.prototype.hasOwnProperty.call(ptrs, id)) continue;
      var p = ptrs[id];
      if (inBtn(p, BTN.L)) L = true;
      if (inBtn(p, BTN.R)) R = true;
      if (inBtn(p, BTN.J)) J = true;
    }
    S.tLeft = L;
    S.tRight = R;
    if (J && !S.tJump) S.jumpBuf = Math.max(S.jumpBuf, 0.16);
    S.tJump = J;
  }
  function pointer(type, x, y, e) {
    if (!S) return;
    var id = e && e.pointerId != null ? e.pointerId : 0;
    if (!showTouch()) {
      if (type === "down") S.jumpBuf = Math.max(S.jumpBuf, 0.16);
      return;
    }
    if (type === "down") ptrs[id] = { x: x, y: y };
    else if (type === "move") { if (ptrs[id]) ptrs[id] = { x: x, y: y }; }
    else delete ptrs[id];
    if (type === "down" && y < BTN.L.y) S.jumpBuf = Math.max(S.jumpBuf, 0.16);
    applyPtrs();
  }
  function key(type, code) {
    if (!S) return;
    var down = type === "down";
    if (code === "ArrowLeft" || code === "KeyA") S.kLeft = down;
    else if (code === "ArrowRight" || code === "KeyD") S.kRight = down;
    else if (code === "ArrowUp" || code === "KeyW" || code === "Space") {
      if (down && !S.kJump) S.jumpBuf = Math.max(S.jumpBuf, 0.16);
      S.kJump = down;
    }
  }
  function clearHeld() {
    if (!S) return;
    S.kLeft = S.kRight = S.kJump = false;
    S.tLeft = S.tRight = S.tJump = false;
    ptrs = {};
  }

  /* ---------- chiptune: Auld Lang Syne (traditional, public domain) ---------- */
  var MUSIC_KEY = "npArcade.music";
  var MELODY = [
    [55, 2], [60, 2], [59, 2], [60, 2], [64, 2], [62, 2], [60, 4],
    [62, 2], [67, 2], [64, 2], [62, 2], [60, 4],
    [60, 2], [62, 2], [64, 2], [60, 2], [62, 2], [64, 2], [67, 4],
    [64, 2], [62, 2], [60, 2], [59, 2], [57, 2], [55, 4],
    [0, 2],
    [60, 2], [64, 2], [67, 2], [69, 2], [67, 2], [64, 2],
    [62, 2], [60, 2], [62, 2], [64, 2], [60, 4],
    [55, 2], [60, 2], [64, 2], [67, 2], [64, 2], [62, 2], [60, 2],
    [62, 2], [60, 2], [59, 2], [57, 2], [55, 6]
  ];
  var BASS = [43, 48, 43, 50, 43, 47, 45, 43];
  var tune = (function () {
    var notes = [], at = 0, i;
    for (i = 0; i < MELODY.length; i++) {
      if (MELODY[i][0]) notes.push({ at: at, m: MELODY[i][0], len: MELODY[i][1] });
      at += MELODY[i][1];
    }
    return { notes: notes, total: at };
  })();

  var juke = { ctx: null, master: null, music: null, stop: null, at: 0, timer: 0, on: true, dead: false };
  try { juke.on = localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { juke.on = true; }

  function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function jukeUnlock() {
    if (juke.dead) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { juke.dead = true; return; }
      if (!juke.ctx) {
        juke.ctx = new AC();
        juke.master = juke.ctx.createGain();
        juke.master.gain.value = 0.9;
        juke.master.connect(juke.ctx.destination);
        juke.music = juke.ctx.createGain();
        juke.music.gain.value = 0.22;
        juke.music.connect(juke.master);
      }
      if (juke.ctx.state === "suspended") juke.ctx.resume();
    } catch (e) { juke.dead = true; }
  }
  function jukeMuted() {
    var b = document.getElementById("np-mute");
    return !!(b && b.getAttribute("aria-pressed") === "true");
  }
  function playLead(when, m, beats) {
    var o = juke.ctx.createOscillator(), g = juke.ctx.createGain();
    var dur = Math.max(0.08, beats * 0.22);
    o.type = "square";
    o.frequency.setValueAtTime(midi(m), when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.07, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(juke.music);
    o.start(when); o.stop(when + dur + 0.02);
    var o2 = juke.ctx.createOscillator(), g2 = juke.ctx.createGain();
    o2.type = "triangle";
    o2.frequency.setValueAtTime(midi(m - 12), when);
    g2.gain.setValueAtTime(0.0001, when);
    g2.gain.linearRampToValueAtTime(0.05, when + 0.02);
    g2.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o2.connect(g2); g2.connect(juke.music);
    o2.start(when); o2.stop(when + dur + 0.02);
  }
  function startTune(delay) {
    if (!juke.ctx || juke.stop) return;
    try {
      juke.music.gain.cancelScheduledValues(juke.ctx.currentTime);
      juke.music.gain.setValueAtTime(0.22, juke.ctx.currentTime);
    } catch (e) {}
    var step = 0.23;
    var dest = juke.music;
    var next = ((juke.at % tune.total) + tune.total) % tune.total;
    var nextT = juke.ctx.currentTime + (delay || 0.06);
    var stopped = false;
    function tick() {
      if (stopped || !juke.ctx) return;
      var now = juke.ctx.currentTime;
      if (nextT < now) nextT = now + 0.02;
      while (nextT < now + 0.55) {
        var q = next % tune.total;
        for (var i = 0; i < tune.notes.length; i++) {
          if (tune.notes[i].at === q) playLead(nextT, tune.notes[i].m, tune.notes[i].len);
        }
        if (q % 8 === 0) playLead(nextT, BASS[(Math.floor(q / 8)) % BASS.length] , 4);
        next++;
        nextT += step;
      }
    }
    tick();
    var timer = setInterval(tick, 140);
    juke.stop = function () {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      juke.at = next;
      try {
        var now = juke.ctx.currentTime;
        dest.gain.cancelScheduledValues(now);
        dest.gain.setValueAtTime(dest.gain.value, now);
        dest.gain.linearRampToValueAtTime(0.0001, now + 0.08);
        setTimeout(function () { try { dest.gain.setValueAtTime(0.22, juke.ctx.currentTime); } catch (e) {} }, 200);
      } catch (e) {}
      juke.stop = null;
    };
  }
  function jukePump() {
    if (!juke.ctx || !Sh || !Sh.state) return;
    var muted = jukeMuted();
    var st = Sh.state();
    var want = juke.on && !muted && juke.ctx.state === "running" && st === "playing";
    try { juke.master.gain.setTargetAtTime(muted ? 0 : 0.9, juke.ctx.currentTime, 0.03); } catch (e) {}
    if (want && !juke.stop) startTune(0.05);
    else if (!want && juke.stop) juke.stop();
  }
  function setMusic(on) {
    juke.on = !!on;
    try { localStorage.setItem(MUSIC_KEY, juke.on ? "1" : "0"); } catch (e) {}
    var buttons = document.querySelectorAll("[data-nye-music]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].textContent = juke.on ? "MUSIC: ON" : "MUSIC: OFF";
      buttons[i].setAttribute("aria-pressed", juke.on ? "true" : "false");
    }
    jukePump();
  }
  function mountChrome() {
    var card = document.querySelector("#np-ov-title .np-card");
    if (card && !document.getElementById("nye-vcr")) {
      var h2 = card.querySelector(".np-h");
      var vcr = document.createElement("p");
      vcr.id = "nye-vcr";
      vcr.innerHTML = 'VCR 12<span class="nye-colon">:</span>00';
      if (h2 && h2.parentNode) h2.parentNode.insertBefore(vcr, h2.nextSibling);
    }
    function addMusic(parent, before) {
      if (!parent || parent.querySelector("[data-nye-music]")) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "np-btn";
      b.setAttribute("data-nye-music", "");
      b.style.cssText = "width:100%;margin-top:8px";
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        e.preventDefault();
        jukeUnlock();
        setMusic(!juke.on);
        Sh.sfx("tap");
      });
      parent.insertBefore(b, before || null);
    }
    var title = document.querySelector("#np-ov-title .np-card");
    if (title) addMusic(title, title.querySelector(".np-tip"));
    var pause = document.querySelector("#np-ov-pause .np-actions");
    if (pause) addMusic(pause, pause.querySelector("a"));
    setMusic(juke.on);
    document.addEventListener("keydown", function (e) {
      if (e.code !== "KeyN" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      var el = document.activeElement;
      var typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));
      if (typing) return;
      jukeUnlock();
      setMusic(!juke.on);
    });
    ["pointerdown", "keydown", "touchend"].forEach(function (ev) {
      document.addEventListener(ev, jukeUnlock, true);
    });
    if (Sh.onStart) Sh.onStart(function () { jukeUnlock(); juke.at = 0; jukePump(); });
    if (Sh.onRestart) Sh.onRestart(function () { jukeUnlock(); juke.at = 0; jukePump(); });
    if (!juke.timer) juke.timer = setInterval(jukePump, 200);
  }

  function nextGoal() {
    var R = room();
    var i;
    for (i = 0; i < S.bits.length; i++) if (!S.bits[i].got) return { x: S.bits[i].x, y: S.bits[i].y + 30, kind: "bit" };
    if (R.id === "kitchen") {
      for (i = 0; i < S.items.length; i++) if (!S.items[i].got) return { x: S.items[i].x, y: S.items[i].y + 22, kind: "item" };
      return { x: 400, y: FLOOR, kind: "door" };
    }
    if (R.id === "den") {
      if (!S.jobs.vcr) return { x: R.vcr.x + 24, y: R.vcr.y, kind: "hold" };
      return { x: 400, y: FLOOR, kind: "door" };
    }
    if (R.id === "hall") {
      if (!S.jobs.pc) return { x: R.pc.x + 24, y: R.pc.y, kind: "hold" };
      return { x: 400, y: FLOOR, kind: "door" };
    }
    if (R.id === "stairs") return { x: 400, y: 250, kind: "door" };
    if (!S.jobs.tape) return { x: R.tape.x + 30, y: R.tape.y, kind: "hold" };
    if (!S.jobs.popper) {
      for (i = 0; i < S.items.length; i++) if (!S.items[i].got) return { x: S.items[i].x, y: 302, kind: "item" };
    }
    if (S.bulbs) {
      for (i = 0; i < S.bulbs.length; i++) if (!S.bulbs[i].got) return { x: S.bulbs[i].x, y: S.bulbs[i].y + 28, kind: "bulb" };
    }
    return { x: 340, y: FLOOR, kind: "window" };
  }

  if (DEBUG) {
    window.NYE = {
      snap: function () {
        return {
          x: S.x, y: S.y, vy: S.vy, vx: S.vx, room: S.room, phase: S.phase, ground: S.ground,
          hearts: S.hearts, left: S.left, score: Math.round(S.score), jobs: S.jobs,
          won: S.won, hits: S.hits, momBump: S.momBump, passedMom: S.passedMom,
          bitsGot: S.bitsGot, bitsAll: S.bitsAll, ended: S.ended, reason: S.reason,
          clear: roomClear(), done: jobsDone(), goal: nextGoal(),
          mom: S.mom ? { x: S.mom.x, y: FLOOR } : null,
          lastHit: S.lastHit || "",
          hazards: S.glitches.map(function (g) { return { x: g.x, y: g.y, k: "zero" }; })
            .concat(S.drops.filter(function (d) { return !d.splat; }).map(function (d) { return { x: d.x + 18, y: d.warn > 0 ? FLOOR : d.y + 12, k: d.warn > 0 ? "warn" : "drop" }; }))
            .concat(S.bars.filter(function (b) { return b.t < b.life; }).map(function (b) { return { x: S.x, y: b.y + 8, k: "bar", top: b.y }; })),
          plats: room().platforms.map(function (p) { return { x: p.x, y: p.y, w: p.w }; }),
          floor: FLOOR
        };
      },
      hold: function (dir, jump) {
        S.kLeft = dir < 0;
        S.kRight = dir > 0;
        if (jump) S.jumpBuf = 0.16;
        S.kJump = !!jump;
      },
      almost: function () {
        S.jobs.noise = 3; S.jobs.vcr = 1; S.jobs.pc = 1; S.jobs.tape = 1; S.jobs.popper = 1;
        S.left = 48; S.hearts = 3; S.phase = "play"; S.ended = 0;
        goRoom(4, true);
        S.jobs.bulbs = S.bulbs.length;
        for (var bi = 0; bi < S.bulbs.length; bi++) S.bulbs[bi].got = 1;
        S.x = 330; S.y = FLOOR;
      },
      primeHold: function () { holdT = 44.95; },
      pop: function () { if (S.hearts > 0) damage(S.x + 20, false); },
      kill: function () { S.inv = 0; S.enterT = 1; S.hearts = 1; damage(S.x + 30, false); },
      doom: function () { S.phase = "play"; S.ended = 0; S.left = 0.2; }
    };
  }

  Sh.init({
    slug: "before-the-ball",
    title: "BEFORE THE BALL",
    accent: "#ffd23f",
    width: W,
    height: H,
    format: function (n) { return comma(n) + " PTS"; },
    howTo: "December 31, 1999. Mom is on the cordless. Finish five party jobs and reach the window before the ball drops. Jump the Y2K glitches.",
    keys: "Move: arrows or A and D. Jump: up, W, or Space. On a phone, use the buttons or tap the screen to jump. P pauses, M mutes, N toggles music, R restarts.",
    tip: "Four hearts. The clock runs from 11:57 to midnight.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: idle,
    onPause: clearHeld
  });
  mountChrome();
})();
