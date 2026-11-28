
import * as THREE from "../shared/three.module.min.js";
import { createCast } from "./figures.js";
import { createHouse } from "./house.js";

const FALLBACK_URL = "game-2d.js";
const CAST_MODE = /[?&]cast=(?:1|hero)(?:&|$)/.test(location.search);

function loadClassic() {
  return new Promise(function (resolve, reject) {
    const s = document.createElement("script");
    s.src = FALLBACK_URL;
    s.onload = function () { resolve(); };
    s.onerror = function () { reject(new Error("no classic game")); };
    document.body.appendChild(s);
  });
}

async function main() {
  if (/[?&]gfx=2d(?:&|$)/.test(location.search)) { await loadClassic(); return; }
  let House;
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



  let Cast;
  try {
    Cast = createCast(THREE);
    House = createHouse(THREE, Cast, ROOMS, FLOOR);
  } catch (err) {
    console.error(err);
    await loadClassic();
    return;
  }

function draw(c, state) {
  const t = (state === "playing" || state === "paused") && S && S.phase !== "dead" ? S.t : idleT;
  if (House) {
    layout();
    House.sync(state, t, S);
    House.renderer.render(House.scene, House.cam);
  }
  c.clearRect(0, 0, W, H);
  if (!CAST_MODE && S && (state === "playing" || state === "paused" || state === "over")) {
    if (state !== "over") {
      drawHud(c, t);
      if (showTouch()) drawButtons(c);
      drawMeter(c);
    }
    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      c.globalAlpha = Math.max(0, 1 - f.t / f.life);
      if (f.kind !== "bit") Sh.text(c, f.text, f.x, f.y, 7, f.col, "center");
    }
    c.globalAlpha = 1;
  }
}
function layout() {
  const hud = document.getElementById("np-canvas");
  const stage = document.getElementById("np-stage");
  if (!hud || !stage || !House) return;
  const hr = hud.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  const pr = Math.min(2, window.devicePixelRatio || 1);
  House.renderer.setPixelRatio(pr);
  House.renderer.setSize(Math.max(2, hr.width), Math.max(2, hr.height), false);
  House.gl.style.width = hr.width + "px";
  House.gl.style.height = hr.height + "px";
  House.cam.aspect = hr.width / Math.max(1, hr.height);
  House.cam.updateProjectionMatrix();
  House.gl.style.left = (hr.left - sr.left) + "px";
  House.gl.style.top = (hr.top - sr.top) + "px";
}
function attach() {
  const hud = document.getElementById("np-canvas");
  const stage = document.getElementById("np-stage");
  if (!hud || !stage || !House) return;
  if (getComputedStyle(stage).position === "static") stage.style.position = "relative";
  const gl = House.gl;
  gl.style.cssText = "position:absolute;left:0;top:0;z-index:0;display:block;margin:0;padding:0;border:0;box-shadow:none;" +
    "max-width:none;max-height:none;transform:none;image-rendering:auto;pointer-events:none;touch-action:none;border-radius:" +
    getComputedStyle(hud).borderRadius;
  stage.insertBefore(gl, hud);
  hud.style.background = "transparent";
  if (getComputedStyle(hud).position === "static") hud.style.position = "relative";
  const crt = stage.querySelector(".np-crt");
  if (crt) crt.style.display = "none";
  layout();
  if (CAST_MODE) {
    const ov = document.getElementById("np-ov-title");
    if (ov) ov.style.display = "none";
    const bar = document.querySelector(".np-bar");
    if (bar) bar.style.display = "none";
  }
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
  if (S.phase === "finale") return "HAPPY 2000";
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
  if (!S || S.phase !== "play") return;
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
        clear: roomClear(), done: jobsDone(), aim: S.aimT || 0, goal: nextGoal(),
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
calm: function () { S.glitches = []; S.drops = []; S.bars = []; },
    at: function (i, x) {
      S.kLeft = S.kRight = S.kJump = false;
      S.tLeft = S.tRight = S.tJump = false;
      goRoom(i, true);
      S.x = x; S.y = FLOOR; S.vx = 0; S.vy = 0; S.ground = true;
    },
    almost: function () {
        S.kLeft = S.kRight = S.kJump = false;
        S.tLeft = S.tRight = S.tJump = false;
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

attach();
}
main().catch(function (err) { console.error(err); loadClassic(); });
