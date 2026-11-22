/* GRAVY OR BUST! THREE RIDES TO DINNER: a Thanksgiving travel dash.
   The Nostalgia Pro collector (same 16x24 pixel recipe as play-test/js/character.js: NP cap, NP tee)
   is 900 miles from Mom's table with three pies. One input everywhere: tap or hold.
   SKY: tap when the ring meets NOD. RAILS: hold to lean right, let go to drift left.
   MOTEL: tap to kick the ice machine quiet. ROAD: tap a side of the screen to hop lanes.
   The Dinner Clock starts at 12:00 PM; mistakes add minutes. Every run reaches the front door.
   Logical canvas 360 x 540. Seconds and logical pixels. All tuning lives in CONFIG. */
(function () {
  "use strict";
  var W = 360, H = 540, TAU = Math.PI * 2, SLUG = "gravy-or-bust";
  var Sh = window.Shell;
  var INK = { pumpkin: "#ff8a1f", cran: "#c2304a", gold: "#ffd23f", cream: "#fff1d6", navy: "#1d2b53", dark: "#101219", lime: "#9bdc3a", sage: "#7fae6a" };

  var CONFIG = {
    startMin: 720, dinnerMin: 1080,           // 12:00 PM start, 6:00 PM dinner
    intro: 4.6, howto: 2.0, exit: 2.6, home: 9,
    sky: { dur: 45.5, travel: 112, miss: 2, perfect: 0.07, good: 0.14, early: 0.3, pts: 10,
      p1: { from: 2.2, to: 15, step: 1.45, appr: 1.25 },
      p2: { from: 15.8, to: 30, step: 1.0, appr: 1.0 },
      p3: { groups: [31, 33.4, 35.8, 38.2, 40.6], gap: 0.42, appr: 0.92 },
      giant: { t: 43.6, appr: 1.4, x: 5 } },
    rails: { dur: 45, travel: 96, drop: 3, push: 3.0, drift: 2.6, damp: 2.6, zones: [0.46, 0.39, 0.33], red: 1.2,
      stations: [15, 30], sway: [0.45, 0.6, 0.75], curve: 1.0, curveEvery: 6.5, jolt: 1.25, joltFrom: 30, joltEvery: 3.4, tick: 0.5, pts: 10 },
    motel: { dur: 8, travel: 30, kicks: 6 },
    road: { dur: 50, travel: 88, hit: 2, speed: 235, fast: 1.3, fastAt: 20, snowAt: 35, gap: [0.95, 0.82, 0.92], iframes: 1.0,
      coffeeP: 0.2, pieAt: [12, 27, 41], view: 250, dodgePts: 5, coffeePts: 5 },
    bonus: { spare: 25, pie: 300, part: 100 }
  };

  var PARTS = ["HUBCAP", "SIDE MIRROR", "BUMPER", "HOOD", "LEFT DOOR", "RIGHT DOOR"];
  var LANES = [120, 180, 240], CAR_Y = 440;
  var LEGS = [
    { key: "sky", n: "LEG 1 OF 3", title: "THE SKY", sub: "SEAT 34B", how: "TAP WHEN THE RING HITS NOD", col: "#3ff0ff" },
    { key: "rails", n: "LEG 2 OF 3", title: "THE RAILS", sub: "STANDING ROOM ONLY", how: "HOLD TO LEAN RIGHT. LET GO TO DRIFT LEFT. STAY IN THE GREEN", col: "#9bff3f" },
    { key: "road", n: "LEG 3 OF 3", title: "THE ROAD", sub: "THE LAST CAR ON THE LOT", how: "TAP LEFT OR RIGHT SIDE TO HOP LANES", col: INK.pumpkin }
  ];
  var TOPICS = ["cat", "lawn", "foot", "photos", "fish", "cloud", "mower", "cat"];

  var S = {}, idleT = 0, parts = [], floats = [], confetti = [], snow = [], stars = [];
  var dbg = /[?&]debug=1/.test(location.search);
  (function () { var seed = 7; function r() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < 70; i++) snow.push({ x: r() * W, y: r() * H, s: 1 + r() * 2, v: 40 + r() * 70, p: r() * TAU });
    for (i = 0; i < 30; i++) stars.push({ x: r() * W, y: r() * 200, p: r() * TAU }); })();

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function comma(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function R() { return window.NPRewards; }
  function unlock(id) { if (window.Trophies) window.Trophies.unlock(id); }
  function clockStr(m) { m = Math.round(m); var h = Math.floor(m / 60) % 24, mm = m % 60, ap = h >= 12 ? "PM" : "AM", hh = h % 12 || 12; return hh + ":" + ("0" + mm).slice(-2) + " " + ap; }
  function sfx(n) { Sh.sfx(n); }
  function tone(f, d, t, v, fe, dl) { Sh.tone(f, d, t, v, fe, dl); }

  /* ---------------- Saved extras: cosmetics, best arrival, runs ---------------- */
  function loadJ(k, d) { var v = null; try { v = JSON.parse(Sh.load(k) || "null"); } catch (e) { v = null; } return v && typeof v === "object" ? v : d; }
  function extras() { var x = loadJ("extras", null) || {}; x.runs = x.runs || 0; x.got = x.got || {}; x.wear = x.wear || {}; return x; }
  function saveExtras(x) { Sh.save("extras", JSON.stringify(x)); }
  var UNLOCKS = [
    { id: "earmuffs", name: "Earmuffs", how: "Finish 1 run" },
    { id: "scarf", name: "Plaid knit scarf", how: "Arrive on time once" },
    { id: "hat", name: "Paper turkey hat", how: "Deliver all 3 pies" },
    { id: "pumpkin", name: "Pumpkin orange paint", how: "Finish 3 runs", paint: "#ff8a1f" },
    { id: "cran", name: "Cranberry red paint", how: "Earn 5 trophies", paint: "#c2304a" },
    { id: "gold", name: "Gold pie box", how: "Earn every trophy" }
  ];
  var X = null;
  function wear(id) { return !!(X && X.got[id] && X.wear[id] !== false); }
  function paint() { if (X && X.paint && X.got[X.paint]) return X.paint === "pumpkin" ? "#ff8a1f" : "#c2304a"; return INK.lime; }

  /* ---------------- Run state ---------------- */
  function reset() {
    X = extras();
    S = { t: 0, phase: "intro", pt: 0, leg: 0, hold: false, delay: 0, base: CONFIG.startMin, score: 0,
      pts: { sky: 0, rails: 0, road: 0 }, pies: 3, grades: [], done: false,
      beats: [], bubbles: [], streak: 0, streakBest: 0, perfects: 0, goods: 0, misses: 0, nod: 0, verdict: null, skyDone: false,
      th: 0, tv: 0, redT: 0, greenT: 0, tickT: 0, drops: 0, curve: null, jolt: null, nextCurve: 4, nextJolt: 31, station: 0, green: 0, total: 0, steadyBest: 0, piesMotel: 3,
      kicks: 0, quiet: false, bolt: 0,
      lane: 1, cx: LANES[1], obs: [], rowT: 0.8, lost: 0, hits: 0, inv: 0, coffee: 0, clean: 0, cleanBest: 0, dodges: 0, scroll: 0, pieIdx: 0, rowN: 0, lastFree: 1,
      arrival: 0 };
    parts.length = 0; floats.length = 0; confetti.length = 0;
    buildBeats();
  }
  function buildBeats() {
    var c = CONFIG.sky, b = S.beats, t, k = 0;
    for (t = c.p1.from; t <= c.p1.to; t += c.p1.step) b.push({ t: t, appr: c.p1.appr, topic: TOPICS[k++ % TOPICS.length] });
    for (t = c.p2.from; t <= c.p2.to; t += c.p2.step) b.push({ t: t, appr: c.p2.appr, topic: TOPICS[k++ % TOPICS.length], turb: true });
    for (var g = 0; g < c.p3.groups.length; g++) for (var j = 0; j < 3; j++) b.push({ t: c.p3.groups[g] + j * c.p3.gap, appr: c.p3.appr, topic: "photos", slide: true, turb: true });
    b.push({ t: c.giant.t, appr: c.giant.appr, topic: "photos", giant: true });
  }
  function clock() {
    var add = 0, ph = S.phase;
    if (ph === "home") return S.arrival;
    if (ph === "sky" || ph === "rails" || ph === "motel" || ph === "road") add = CONFIG[ph].travel * clamp(S.pt / CONFIG[ph].dur, 0, 1);
    return S.base + add + S.delay;
  }
  // travel minutes still ahead (so the clock can turn orange when dinner is at risk)
  function remainingTravel() {
    var order = ["sky", "rails", "motel", "road"], ph = S.phase, i;
    if (ph === "intro") i = 0;
    else if (ph === "howto") i = S.leg === 2 ? 3 : S.leg;
    else if (ph === "exit") i = S.leg === 0 ? 1 : S.leg === 1 ? 2 : 4;
    else if (ph === "home") i = 4;
    else i = order.indexOf(ph);
    var sum = 0;
    for (var j = i; j < 4; j++) sum += CONFIG[order[j]].travel;
    if (order[i] === ph) sum -= CONFIG[ph].travel * clamp(S.pt / CONFIG[ph].dur, 0, 1);
    return sum;
  }
  function addDelay(min, x, y) {
    S.delay += min;
    pop("+" + min + " MIN", x == null ? W - 50 : x, y == null ? 44 : y, "#ff4b3e", 1.1);
  }
  function go(ph) { S.phase = ph; S.pt = 0; }

  /* ---------------- Update ---------------- */
  function update(dt) {
    S.t += dt; S.pt += dt;
    var p = S.phase;
    if (p === "intro") { if (S.pt > CONFIG.intro) { go("howto"); S.leg = 0; } }
    else if (p === "howto") { if (S.pt > CONFIG.howto) startLeg(); }
    else if (p === "sky") updSky(dt);
    else if (p === "rails") updRails(dt);
    else if (p === "motel") updMotel(dt);
    else if (p === "road") updRoad(dt);
    else if (p === "exit") { if (S.pt > CONFIG.exit) afterExit(); }
    else if (p === "home") updHome(dt);
    tick(dt);
  }
  function startLeg() { var k = LEGS[S.leg].key; go(k); if (k === "road") S.cx = LANES[S.lane]; sfx("start"); }
  function endLeg(grade, title, sub) {
    var leg = LEGS[S.leg];
    S.base += CONFIG[leg.key].travel;
    S.grades[S.leg] = grade;
    S.exitInfo = { grade: grade, title: title, sub: sub };
    S.hold = false;
    go("exit");
    sfx("ding"); tone(523, 0.08, "square", 0.2, 0, 0.3); tone(784, 0.16, "square", 0.2, 0, 0.4);
    Sh.shake(4, 0.2);
  }
  function afterExit() {
    if (S.leg === 0) { S.leg = 1; go("howto"); }
    else if (S.leg === 1) { S.piesMotel = S.pies; if (S.pies >= 2) unlock("gob-courier"); go("motel"); }
    else { S.arrival = S.base + S.delay; go("home"); S.homeSfx = 0; }
  }

  /* ---- SKY ---- */
  function updSky(dt) {
    var c = CONFIG.sky, t = S.pt, i, b;
    S.nod = Math.max(0, S.nod - dt * 4);
    for (i = 0; i < S.beats.length; i++) {
      b = S.beats[i];
      if (!b.spawned && t >= b.t - b.appr) { b.spawned = true; S.bubbles.push({ topic: b.topic, giant: b.giant, t: 0, x: 232 + rnd(-24, 24), y: 150 }); if (!b.slide || Math.random() < 0.5) tone(300 + Math.random() * 200, 0.05, "triangle", 0.08); }
      if (!b.done && t > b.t + c.good) { b.done = true; judge(b, "MISS"); }
    }
    for (i = S.bubbles.length - 1; i >= 0; i--) { b = S.bubbles[i]; b.t += dt; b.y -= dt * 14; if (b.t > 1.8) S.bubbles.splice(i, 1); }
    if (t > c.dur) {
      S.skyDone = true; unlock("gob-wheels"); if (S.misses === 0) unlock("gob-saint");
      var acc = (S.perfects + 0.6 * S.goods) / S.beats.length;
      endLeg(acc >= 0.85 ? "A" : acc >= 0.65 ? "B" : acc >= 0.45 ? "C" : "D", "WEATHER DIVERSION", "Landed at the wrong airport. Off to the train.");
    }
  }
  function nodTap() {
    var c = CONFIG.sky, t = S.pt, best = null;
    for (var i = 0; i < S.beats.length; i++) { var b = S.beats[i]; if (b.done) continue; if (Math.abs(t - b.t) <= c.early) { best = b; break; } if (b.t - t > c.early) break; }
    S.nod = 1;
    if (!best) { tone(240, 0.03, "square", 0.06); return; }
    best.done = true;
    var d = Math.abs(t - best.t);
    judge(best, d <= c.perfect ? "PERFECT" : d <= c.good ? "GOOD" : "MISS");
  }
  function mult() { return S.streak >= 20 ? 4 : S.streak >= 10 ? 3 : S.streak >= 5 ? 2 : 1; }
  function judge(b, v) {
    var c = CONFIG.sky, gx = b.giant ? c.giant.x : 1;
    S.verdict = { v: v, t: 0 };
    if (v === "MISS") {
      S.misses++; if (S.streak >= 5) pop("STREAK LOST", 180, 360, "#8e93a2");
      S.streak = 0; addDelay(c.miss, 180, 470);
      sfx("miss"); Sh.shake(3, 0.15);
      return;
    }
    if (v === "PERFECT") { S.perfects++; S.streak++; } else S.goods++;
    if (S.streak > S.streakBest) S.streakBest = S.streak;
    var pts = (v === "PERFECT" ? c.pts : c.pts / 2) * mult() * gx;
    S.pts.sky += pts; S.score += pts;
    pop("+" + pts, 180 + rnd(-30, 30), 380, v === "PERFECT" ? INK.gold : "#3ff0ff");
    if (v === "PERFECT") { tone(1046 + Math.min(S.streak, 20) * 20, 0.06, "square", 0.14); tone(1568, 0.08, "triangle", 0.1, 0, 0.04); }
    else tone(784, 0.05, "triangle", 0.14);
    sparkle(180, 430, v === "PERFECT" ? 10 : 5, [INK.gold, INK.cream, INK.pumpkin]);
    if (b.giant) { Sh.flash("HE FINALLY STOPPED", "Giant nod x" + gx, INK.gold, 1100); if (R()) R().burst(null, null, 30); }
    if (S.streak === 5) streakPill("NODDING ALONG", "#3ff0ff");
    if (S.streak === 10) { streakPill("WORLD'S BEST LISTENER", INK.gold); unlock("gob-nod"); }
    if (S.streak === 20) streakPill("SAINTLY PATIENCE", INK.pumpkin);
  }
  function streakPill(label, col) { if (R()) R().streak(5, label, col); else Sh.flash(label, "", col, 900); }

  /* ---- RAILS ---- */
  function zone() { return CONFIG.rails.zones[S.station]; }
  function updRails(dt) {
    var c = CONFIG.rails, t = S.pt, lvl = S.station;
    if (S.station < 2 && t >= c.stations[S.station]) {
      S.station++; Sh.flash("STATION STOP", "One more box on the tower", "#9bff3f", 1000); sfx("ding");
      S.redT = 0;
    }
    // sway: train rocking plus telegraphed curves and brake jolts
    var sway = c.sway[lvl] * (Math.sin(t * 1.3) * 0.8 + Math.sin(t * 2.7 + 1.3) * 0.5 + Math.sin(t * 0.55 + 2) * 0.4);
    if (!S.curve && t >= S.nextCurve && t < c.dur - 2) { S.curve = { t: 0, dir: Math.random() < 0.5 ? -1 : 1 }; S.nextCurve = t + c.curveEvery + rnd(-1, 1.2); }
    if (S.curve) { S.curve.t += dt; if (S.curve.t > 1) sway += S.curve.dir * c.curve * (1 + lvl * 0.15); if (S.curve.t > 2.8) S.curve = null; }
    if (!S.jolt && t >= S.nextJolt && t >= c.joltFrom && t < c.dur - 1) { S.jolt = { t: 0, dir: Math.random() < 0.5 ? -1 : 1, hit: false }; S.nextJolt = t + c.joltEvery + rnd(-0.6, 0.8); tone(330, 0.3, "square", 0.12); tone(277, 0.3, "square", 0.12, 0, 0.32); }
    if (S.jolt) { S.jolt.t += dt; if (S.jolt.t > 0.85 && !S.jolt.hit) { S.jolt.hit = true; S.tv += S.jolt.dir * c.jolt; Sh.shake(6, 0.25); Sh.noise(0.25, 0.4, 300, 0.7); } if (S.jolt.t > 1.4) S.jolt = null; }
    S.sway = sway;
    var acc = (S.hold ? c.push : -c.drift) + sway - c.damp * S.tv;
    S.tv += acc * dt; S.th += S.tv * dt;
    if (S.th > 1.15) { S.th = 1.15; S.tv = Math.min(0, S.tv); } if (S.th < -1.15) { S.th = -1.15; S.tv = Math.max(0, S.tv); }
    S.total += dt;
    if (Math.abs(S.th) <= zone()) {
      S.redT = 0; S.green += dt; S.greenT += dt; S.tickT += dt;
      if (S.greenT > S.steadyBest) S.steadyBest = S.greenT;
      if (S.tickT >= c.tick) { S.tickT -= c.tick; var pts = c.pts + Math.min(10, Math.floor(S.greenT / 2)); S.pts.rails += pts; S.score += pts; if (Math.random() < 0.5) tone(1200 + Math.min(S.greenT, 20) * 30, 0.02, "square", 0.05); }
      if (S.greenT >= 10 && !S.steady10) { S.steady10 = true; streakPill("STEADY HANDS", "#9bff3f"); }
      if (S.greenT >= 20 && !S.steady20) { S.steady20 = true; streakPill("ROCK STEADY", INK.gold); }
    } else {
      S.greenT = 0; S.steady10 = false; S.steady20 = false; S.redT += dt;
      if (S.redT >= c.red) dropBox();
    }
    if (t > c.dur) {
      var f = S.green / Math.max(1, S.total);
      endLeg(f >= 0.85 && S.drops === 0 ? "A" : f >= 0.7 ? "B" : f >= 0.5 ? "C" : "D", "END OF LINE (TONIGHT)", "The train stopped at a nameless platform. Motel ahead.");
    }
  }
  function dropBox() {
    var c = CONFIG.rails;
    S.redT = 0; S.drops++; S.th *= 0.3; S.tv = 0;
    addDelay(c.drop, 180, 300);
    if (S.pies > 1) {
      S.pies--;
      Sh.flash("PIE OVERBOARD", "-1 pie, +" + c.drop + " min", "#ff4b3e", 900);
      for (var i = 0; i < 16; i++) parts.push({ x: 180 + S.th * 60, y: 160, vx: rnd(-160, 160), vy: rnd(-200, -60), t: 0, life: 0.9, c: i % 2 ? "#e0a13a" : INK.cream, s: 3 });
    } else Sh.flash("CAUGHT IT!", "Last pie saved, +" + c.drop + " min", INK.gold, 900);
    sfx("miss"); Sh.noise(0.3, 0.5, 600, 0.6); Sh.shake(5, 0.2);
  }

  /* ---- MOTEL ---- */
  function updMotel() {
    if (S.pt > CONFIG.motel.dur) { S.base += CONFIG.motel.travel; S.leg = 2; go("howto"); }
  }
  function kick() {
    if (S.quiet || S.pt < 0.3) return;
    S.kicks++; Sh.shake(4, 0.12); Sh.noise(0.12, 0.5, 900, 0.8); tone(140, 0.08, "square", 0.2);
    sparkle(286, 380, 6, ["#cfe9f2", "#ffffff"]);
    if (S.kicks >= CONFIG.motel.kicks) {
      S.quiet = true; S.bolt = 1; unlock("gob-ice");
      Sh.flash("GOOD NIGHT'S SLEEP", "Well, a good nap. The car starts one hit sturdier", INK.gold, 1400); sfx("best");
    }
  }

  /* ---- ROAD ---- */
  function roadPhase(t) { var c = CONFIG.road; return t < c.fastAt ? 0 : t < c.snowAt ? 1 : 2; }
  function speed(t) { return CONFIG.road.speed * (roadPhase(t) > 0 ? CONFIG.road.fast : 1); }
  var OBS = { cone: { hw: 11, h: 22 }, hole: { hw: 15, h: 18 }, leaves: { hw: 18, h: 22 }, mattress: { hw: 21, h: 34 }, turkey: { hw: 22, h: 40 }, coffee: { hw: 10, h: 14, good: 1 }, pie: { hw: 16, h: 22, good: 1 } };
  function spawnRow() {
    var t = S.pt, ph = roadPhase(t), c = CONFIG.road, kinds = ["cone", "hole", "leaves", "mattress"], i;
    S.rowN++;
    var free = Math.floor(Math.random() * 3);
    // pairs mode: the open lane moves at most one lane per row, so it is always reachable
    if (ph === 2 && Math.abs(free - S.lastFree) > 1) free = 1;
    if (ph >= 1 && Math.random() < 0.16 && !S.turkeyOn) {
      var from = Math.random() < 0.5 ? 0 : 2;
      S.obs.push({ k: "turkey", x: LANES[from], y: -40, vx: (from === 0 ? 1 : -1) * 34, ph: Math.random() * TAU });
      S.turkeyOn = true; free = 2 - from;
    } else if (ph === 2) {
      for (i = 0; i < 3; i++) if (i !== free) S.obs.push({ k: kinds[Math.floor(Math.random() * kinds.length)], x: LANES[i], y: -30 });
    } else {
      var blk = Math.floor(Math.random() * 3);
      S.obs.push({ k: kinds[Math.floor(Math.random() * kinds.length)], x: LANES[blk], y: -30 });
      free = (blk + 1 + Math.floor(Math.random() * 2)) % 3;
    }
    S.lastFree = free;
    var pieDue = S.pieIdx < c.pieAt.length && t >= c.pieAt[S.pieIdx];
    if (pieDue) { S.pieIdx++; if (S.pies < 3) S.obs.push({ k: "pie", x: LANES[free], y: -110 }); }
    else if (Math.random() < c.coffeeP) S.obs.push({ k: "coffee", x: LANES[free], y: -110 });
    S.rowT = c.gap[ph] + rnd(-0.08, 0.1);
  }
  function updRoad(dt) {
    var c = CONFIG.road, t = S.pt, v = speed(t), i;
    S.scroll += v * dt; S.inv = Math.max(0, S.inv - dt);
    S.cx += clamp(LANES[S.lane] - S.cx, -dt * 60 / 0.11, dt * 60 / 0.11);
    if (t < c.dur - 1.6) { S.rowT -= dt; if (S.rowT <= 0) spawnRow(); }
    if (S.phaseShown !== roadPhase(t)) {
      S.phaseShown = roadPhase(t);
      if (S.phaseShown === 1) Sh.flash("OPEN ROAD", "Speeding up", INK.pumpkin, 900);
      if (S.phaseShown === 2) Sh.flash("SNOW!", "Watch the headlights", "#cfe9f2", 1000);
    }
    for (i = S.obs.length - 1; i >= 0; i--) {
      var o = S.obs[i], d = OBS[o.k];
      o.y += v * dt;
      if (o.k === "turkey") { o.x += o.vx * dt; o.ph += dt * 3; if (o.x < LANES[0] || o.x > LANES[2]) { o.x = clamp(o.x, LANES[0], LANES[2]); o.vx = -o.vx; } }
      if (!o.done && Math.abs(o.x - S.cx) < d.hw + 13 && Math.abs(o.y - CAR_Y) < d.h / 2 + 24) {
        o.done = true;
        if (d.good) { grab(o); S.obs.splice(i, 1); continue; }
        roadHit(o);
      }
      if (!o.done && !d.good && o.y > CAR_Y + 46) {
        o.done = true; S.dodges++; S.clean++; if (S.clean > S.cleanBest) S.cleanBest = S.clean;
        var pts = c.dodgePts * (1 + Math.floor(S.clean / 8)); S.pts.road += pts; S.score += pts;
        if (S.clean === 8) streakPill("SMOOTH DRIVING", INK.pumpkin);
        if (S.clean === 20) streakPill("SUNDAY DRIVER", INK.gold);
      }
      if (o.y > H + 50) { if (o.k === "turkey") S.turkeyOn = false; S.obs.splice(i, 1); }
    }
    if (t > c.dur) {
      endLeg(S.hits === 0 ? "A" : S.hits <= 2 ? "B" : S.hits <= 4 ? "C" : "D", "HOME: NEXT EXIT", S.lost >= 6 ? "What is left of the car is still rolling." : "Almost there. Smell that?");
    }
  }
  function hop(dir) {
    var n = clamp(S.lane + dir, 0, 2);
    if (n === S.lane) { tone(200, 0.03, "square", 0.06); return; }
    S.lane = n; tone(520 + n * 80, 0.04, "square", 0.1); Sh.noise(0.08, 0.12, 2000, 1);
  }
  function grab(o) {
    if (o.k === "coffee") {
      S.coffee++; var cp = CONFIG.road.coffeePts * Math.min(S.coffee, 10); S.pts.road += cp; S.score += cp;
      pop("COFFEE x" + S.coffee, o.x, CAR_Y - 40, "#e0a13a"); tone(988, 0.05, "square", 0.14); tone(1319, 0.08, "square", 0.12, 0, 0.05);
      if (S.coffee === 8) { streakPill("COFFEE RUN", "#e0a13a"); unlock("gob-coffee"); }
    } else {
      S.pies = Math.min(3, S.pies + 1); Sh.flash("PIE STAND!", "Pie restored (" + S.pies + "/3)", INK.gold, 900); sfx("score");
      sparkle(o.x, CAR_Y - 20, 14, [INK.gold, "#e0a13a", INK.cream]);
    }
  }
  function roadHit() {
    if (S.inv > 0) return;
    S.inv = CONFIG.road.iframes; S.hits++; S.clean = 0;
    Sh.shake(7, 0.3); sfx("hit");
    if (S.bolt > 0) { S.bolt--; Sh.flash("BOLT HELD", "The extra bolt took that one", INK.gold, 800); tone(1500, 0.06, "square", 0.12); return; }
    addDelay(CONFIG.road.hit, S.cx, CAR_Y - 60);
    if (S.lost < 6) {
      var name = PARTS[S.lost]; S.lost++;
      Sh.flash("CLANK!", "Lost the " + name.toLowerCase(), "#ff4b3e", 800);
      tone(180, 0.12, "square", 0.22, 90); Sh.noise(0.2, 0.5, 2600, 1.5);
      parts.push({ x: S.cx, y: CAR_Y, vx: rnd(-140, 140), vy: rnd(-220, -120), t: 0, life: 1.1, c: paint(), s: 7, spin: 1 });
      if (S.lost === 6) setTimeout(function () { if (S.phase === "road") Sh.flash("JUST THE SEAT", "Still rolling", INK.gold, 900); }, 850);
    } else Sh.flash("BONK", "Nothing left to lose", "#ff4b3e", 600);
  }

  /* ---- HOME ---- */
  function onTime() { return S.arrival <= CONFIG.dinnerMin; }
  function updHome(dt) {
    var t = S.pt;
    if (t > 2.4 && S.homeSfx === 0) { S.homeSfx = 1; Sh.noise(0.5, 0.5, 1500, 0.6); tone(220, 0.1, "square", 0.2, 110); tone(160, 0.1, "square", 0.2, 80, 0.15); }
    if (t > 5 && S.homeSfx === 1) {
      S.homeSfx = 2;
      if (onTime()) { sfx("crowd"); sfx("best"); for (var i = 0; i < 70; i++) confetti.push({ x: 180 + rnd(-40, 40), y: 250, vx: rnd(-160, 160), vy: rnd(-280, -80), t: 0, life: 2.2, c: [INK.pumpkin, INK.cran, INK.gold][i % 3], r: Math.random() * 6 }); }
      else { tone(392, 0.2, "triangle", 0.2); tone(330, 0.3, "triangle", 0.2, 0, 0.22); }
    }
    for (var j = confetti.length - 1; j >= 0; j--) { var q = confetti[j]; q.t += dt; q.vy += 300 * dt; q.vx *= 0.99; q.x += q.vx * dt; q.y += q.vy * dt; q.r += dt * 7; if (q.t > q.life) confetti.splice(j, 1); }
    if (t > CONFIG.home) finish();
  }

  function tick(dt) {
    for (var i = parts.length - 1; i >= 0; i--) { var q = parts[i]; q.t += dt; if (q.t >= q.life) { parts.splice(i, 1); continue; } q.vy += 420 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    for (i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; floats[i].y -= 26 * dt; if (floats[i].t > floats[i].life) floats.splice(i, 1); }
    if (S.verdict) S.verdict.t += dt;
  }
  function sparkle(x, y, n, cols) {
    if (Sh.reduced) n = Math.min(n, 4);
    for (var i = 0; i < n; i++) { var a = Math.random() * TAU, v = 50 + Math.random() * 150; parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, life: 0.35 + Math.random() * 0.4, c: cols[i % cols.length], s: Math.random() < 0.3 ? 3 : 2 }); }
  }
  function pop(s, x, y, c, life) { if (floats.length < 12) floats.push({ s: s, x: x, y: y, c: c, t: 0, life: life || 0.8 }); }

  /* ---------------- Finish + results ---------------- */
  function finish() {
    if (S.done) return;
    S.done = true;
    var B = CONFIG.bonus, spare = Math.round(CONFIG.dinnerMin - S.arrival), ok = spare >= 0, i;
    var bSpare = ok ? spare * B.spare : 0, bPie = S.pies * B.pie, bPart = (6 - S.lost) * B.part;
    var total = Math.round(S.pts.sky + S.pts.rails + S.pts.road + bSpare + bPie + bPart);
    var prevBest = Sh.best(), prevArr = Number(Sh.load("bestArrival")) || null, prevStreak = Number(Sh.load("bestStreak")) || 0;
    if (!prevArr || S.arrival < prevArr) Sh.save("bestArrival", Math.round(S.arrival));
    if (S.streakBest > prevStreak) Sh.save("bestStreak", S.streakBest);
    var stats = { score: total, skyDone: S.skyDone, streakBest: S.streakBest, skyMisses: S.misses, piesMotel: S.piesMotel, iceQuiet: S.quiet,
      arrived: true, arrival: Math.round(S.arrival), spare: spare, onTime: ok, railsDrops: S.drops, partsLeft: 6 - S.lost, coffee: S.coffee, roadHits: S.hits, pies: S.pies, grades: S.grades.join("") };
    if (window.GOB_LOG) window.GOB_LOG.push(stats);

    // so-close lines, picked from what almost happened
    var close = [];
    if (!ok && -spare <= 15) close.push((-spare) + (-spare === 1 ? " minute" : " minutes") + " from beating the gravy to the table.");
    if (ok && spare < 30 && spare >= 18 && S.pies === 3 && S.hits === 0) close.push((30 - spare) + " minutes from Before the Gravy.");
    if (S.misses > 0 && S.misses <= 2) close.push(S.misses === 1 ? "One miss from Saintly Patience." : "Two misses from Saintly Patience.");
    if (prevStreak && S.streakBest === prevStreak - 1) close.push("One more perfect nod for your best streak.");
    if (prevBest != null && total < prevBest && prevBest - total <= Math.max(150, prevBest * 0.08)) close.push(comma(prevBest - total) + " points from a new personal best.");
    if (S.hits === 1) close.push("Your car was one hubcap away from showroom clean.");
    if (S.pies === 2) close.push("One pie short of a full table.");

    var stamp = "ARRIVED " + clockStr(S.arrival) + ". " + (ok ? spare + (spare === 1 ? " MINUTE" : " MINUTES") + " TO SPARE." : (-spare) + ((-spare) === 1 ? " MINUTE" : " MINUTES") + " LATE.");
    var rows = [["Sky <i>grade " + (S.grades[0] || "-") + "</i>", S.pts.sky], ["Rails <i>grade " + (S.grades[1] || "-") + "</i>", S.pts.rails], ["Road <i>grade " + (S.grades[2] || "-") + "</i>", S.pts.road],
      ["Time to spare <i>" + (ok ? spare + " min" : "late") + "</i>", bSpare], ["Pies <i>" + S.pies + "/3</i>", bPie], ["Car parts <i>" + (6 - S.lost) + "/6</i>", bPart]];
    var html = '<div class="gob-stamp" style="--sc:' + (ok ? "#9bff3f" : "#ff8a1f") + '">' + stamp + '</div><div class="gob-rows">';
    for (i = 0; i < rows.length; i++) html += '<div class="gob-row" data-v="' + Math.round(rows[i][1]) + '"><span>' + rows[i][0] + '</span><b>0</b></div>';
    html += '<div class="gob-total"><span>TOTAL</span><b>' + comma(total) + '</b></div></div>';
    Sh.gameOver(total, { title: ok ? "HOME FOR DINNER" : "LEFTOVERS", html: html, stats: stats });

    // small unlocks (after the trophy run-end so the trophy count is fresh)
    X = extras(); X.runs++;
    var got = [], tc = window.Trophies ? window.Trophies.count(SLUG) : { got: 0, total: 11 };
    function give(id) { if (!X.got[id]) { X.got[id] = 1; got.push(id); if (id === "pumpkin" || id === "cran") X.paint = id; } }
    give("earmuffs"); if (ok) give("scarf"); if (S.pies === 3) give("hat"); if (X.runs >= 3) give("pumpkin"); if (tc.got >= 5) give("cran"); if (tc.total && tc.got >= tc.total) give("gold");
    saveExtras(X); heroCache = {};
    var after = document.getElementById("gob-after");
    if (!after) { after = document.createElement("div"); after.id = "gob-after"; var card = document.querySelector("#np-ov-over .np-card"); if (card) card.appendChild(after); }
    var ah = "";
    for (i = 0; i < Math.min(2, close.length); i++) ah += '<p class="gob-close">' + close[i] + '</p>';
    for (i = 0; i < got.length; i++) { var u = UNLOCKS.filter(function (z) { return z.id === got[i]; })[0]; ah += '<p class="gob-unl">UNLOCKED: ' + u.name + '</p>'; }
    var ba = Number(Sh.load("bestArrival"));
    if (ba) ah += '<p class="np-extra">Best arrival ' + clockStr(ba) + ' | nod streak ' + S.streakBest + ' | coffee ' + S.coffee + '</p>';
    after.innerHTML = ah;
    countRows();
    refreshTitle();
  }
  function countRows() {
    var rows = document.querySelectorAll("#np-over-extra .gob-row"), tot = document.querySelector("#np-over-extra .gob-total"), k = 0, i;
    if (Sh.reduced || !rows.length) { for (i = 0; i < rows.length; i++) { rows[i].classList.add("on"); rows[i].querySelector("b").textContent = comma(rows[i].getAttribute("data-v")); } if (tot) tot.classList.add("on"); return; }
    function nextRow() {
      if (Sh.state() !== "over") return;
      if (k >= rows.length) { if (tot) { tot.classList.add("on"); tone(196, 0.12, "square", 0.25); Sh.noise(0.15, 0.5, 400, 0.6); } return; }
      var r = rows[k++], b = r.querySelector("b"), v = Number(r.getAttribute("data-v")), t0 = performance.now(), dur = v ? 320 : 60, last = -1;
      r.classList.add("on");
      (function step(now) {
        if (Sh.state() !== "over") return;
        var f = Math.min(1, (now - t0) / dur), n = Math.round(v * f);
        if (n !== last) { last = n; b.textContent = comma(n); if (v) tone(900 + 700 * f + k * 60, 0.015, "square", 0.04); }
        if (f < 1) requestAnimationFrame(step); else setTimeout(nextRow, 90);
      })(t0);
    }
    setTimeout(nextRow, 350);
  }

  /* ---------------- Input: one tap or hold everywhere ---------------- */
  function press(down, x) {
    var p = S.phase;
    S.hold = down;
    if (!down) return;
    if (p === "intro") { if (S.pt > 0.5) { go("howto"); S.leg = 0; } }
    else if (p === "howto") { if (S.pt > 0.45) startLeg(); }
    else if (p === "sky") nodTap();
    else if (p === "motel") kick();
    else if (p === "road") hop(x < W / 2 ? -1 : 1);
    else if (p === "exit") { if (S.pt > 0.9) afterExit(); }
    else if (p === "home") { if (S.pt > 2.5 && S.pt < 6) S.pt = 6; else if (S.pt > 6.6) finish(); }
  }
  function pointer(type, x) {
    if (type === "down") press(true, x);
    else if (type === "up" || type === "cancel") press(false, x);
  }
  var keyHeld = {};
  function key(type, code) {
    var down = type === "down";
    if (down && keyHeld[code]) return;   // ignore key repeat
    keyHeld[code] = down;
    if (S.phase === "road") {
      if (down && (code === "ArrowLeft" || code === "KeyA")) return hop(-1);
      if (down && (code === "ArrowRight" || code === "KeyD")) return hop(1);
      if (code !== "Space" && code !== "Enter") return;
    }
    if (code === "Space" || code === "Enter" || code === "ArrowUp" || code === "ArrowLeft" || code === "ArrowRight" || code === "KeyA" || code === "KeyD") {
      if (S.phase === "road") return;
      press(down, W / 2);
    }
  }

  /* ---------------- Drawing helpers ---------------- */
  function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function circ(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function rr(c, x, y, w, h, r, col) { c.fillStyle = col; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); c.fill(); }
  function txt(c, s, x, y, size, col, align, glow) { Sh.text(c, s, x, y, size, col, align, glow); }
  function ui(c, s, x, y, size, col, align) { Sh.uiText(c, s, x, y, size, col, align); }
  function wrapUi(c, s, x, y, size, col, maxW, lh) {
    c.font = size + 'px "Silkscreen", monospace'; var words = s.split(" "), line = "", yy = y;
    for (var i = 0; i < words.length; i++) { var test = line ? line + " " + words[i] : words[i]; if (c.measureText(test).width > maxW && line) { ui(c, line, x, yy, size, col, "center"); line = words[i]; yy += lh; } else line = test; }
    if (line) ui(c, line, x, yy, size, col, "center");
  }

  /* The Nostalgia Pro collector, same 16x24 pixel recipe as play-test/js/character.js
     (short brown hair, Nostalgia Pro cap, Nostalgia Pro tee). Poses: stand, hold (arms up), sit. */
  var heroCache = {};
  function heroSprite(pose, step) {
    var key = pose + step + (wear("earmuffs") ? "e" : "") + (wear("scarf") ? "s" : "") + (wear("hat") ? "h" : "");
    if (heroCache[key]) return heroCache[key];
    var FW = 16, FH = 24, p = new Array(FW * FH), SK = "#f1c28e", HC = "#4a2f1c";
    function px(x, y, col) { if (x >= 0 && x < FW && y >= 0 && y < FH) p[y * FW + x] = col; }
    function rc(x, y, w, h, col) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) px(x + i, y + j, typeof col === "function" ? col(x + i, y + j) : col); }
    var lUp = step === 1 ? 1 : 0, rUp = step === 2 ? 1 : 0;
    rc(4, 18, 8, 2, "#3b5a96");
    if (pose !== "sit") { rc(4, 20, 3, 2 - lUp, "#3b5a96"); rc(9, 20, 3, 2 - rUp, "#3b5a96"); rc(4, 22 - lUp, 3, 2, "#2b2422"); rc(9, 22 - rUp, 3, 2, "#2b2422"); }
    var tee = function (x, y) { if (y >= 13 && y <= 14 && x >= 6 && x <= 9) return ((x + y) % 3 === 0) ? "#e4343e" : "#fff1d6"; if (y === 15 && x >= 6 && x <= 9) return "#29d3e8"; return "#1b1b22"; };
    rc(4, 11, 8, 7, tee);
    if (pose === "hold") { rc(3, 5, 1, 7, tee); rc(12, 5, 1, 7, tee); rc(3, 2, 1, 3, SK); rc(12, 2, 1, 3, SK); }
    else { rc(3, 11, 1, 3, tee); rc(12, 11, 1, 3, tee); rc(3, 14, 1, 3, SK); rc(12, 14, 1, 3, SK); }
    rc(4, 3, 8, 8, SK);
    px(6, 7, "#1b1b28"); px(6, 8, "#1b1b28"); px(9, 7, "#1b1b28"); px(9, 8, "#1b1b28"); px(7, 10, "#c19a72"); px(8, 10, "#c19a72");
    rc(4, 2, 8, 3, HC); px(4, 5, HC); px(11, 5, HC);
    if (wear("hat")) {
      rc(3, 0, 2, 3, "#e4343e"); rc(5, 0, 2, 2, "#ff8a1f"); rc(7, 0, 2, 1, "#ffd23f"); rc(9, 0, 2, 2, "#ff8a1f"); rc(11, 0, 2, 3, "#e4343e");
      rc(4, 3, 8, 2, "#8a5a2b"); rc(7, 2, 2, 1, "#8a5a2b");
    } else {
      rc(4, 1, 8, 4, "#1d2b53"); rc(3, 5, 10, 1, "#141e3a");
      px(6, 2, "#fff1d6"); px(7, 2, "#e4343e"); px(8, 2, "#fff1d6"); px(9, 2, "#fff1d6"); px(6, 3, "#fff1d6"); px(7, 3, "#fff1d6"); px(8, 3, "#e4343e"); px(9, 3, "#fff1d6");
    }
    if (wear("earmuffs")) { rc(2, 6, 2, 3, "#ff77a8"); rc(12, 6, 2, 3, "#ff77a8"); }
    if (wear("scarf")) { rc(4, 10, 8, 2, function (x) { return x % 2 ? "#c2304a" : "#2f6b3a"; }); rc(9, 12, 2, 3, function (x, y) { return y % 2 ? "#c2304a" : "#2f6b3a"; }); }
    var out = [], x, y;
    for (y = 0; y < FH; y++) for (x = 0; x < FW; x++) if (!p[y * FW + x] && ((x > 0 && p[y * FW + x - 1]) || (x < FW - 1 && p[y * FW + x + 1]) || (y > 0 && p[(y - 1) * FW + x]) || (y < FH - 1 && p[(y + 1) * FW + x]))) out.push(y * FW + x);
    for (var o = 0; o < out.length; o++) p[out[o]] = "#0b1022";
    var cv = document.createElement("canvas"); cv.width = FW; cv.height = FH;
    var g = cv.getContext("2d");
    for (y = 0; y < FH; y++) for (x = 0; x < FW; x++) if (p[y * FW + x]) { g.fillStyle = p[y * FW + x]; g.fillRect(x, y, 1, 1); }
    heroCache[key] = cv;
    return cv;
  }
  function drawHero(c, pose, x, y, sc, step, rot) {
    var spr = heroSprite(pose, step || 0);
    c.save(); c.translate(Math.round(x), Math.round(y)); if (rot) c.rotate(rot);
    c.imageSmoothingEnabled = false;
    c.drawImage(spr, -8 * sc, -24 * sc, 16 * sc, 24 * sc);
    c.restore();
  }
  function pieBox(c, x, y, w, h, gold) {
    rect(c, x, y, w, h, gold ? "#ffd23f" : "#f6efe0"); rect(c, x, y, w, 3, gold ? "#e0a13a" : "#d9cdb3");
    rect(c, x + w / 2 - 6, y + h / 2 - 3, 12, 6, INK.cran); rect(c, x + w / 2 - 4, y + h / 2 - 1, 8, 2, INK.cream);
    c.strokeStyle = "#3a2616"; c.lineWidth = 1; c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
  }
  function pie(c, x, y, r) {
    c.fillStyle = "#b26a1c"; c.beginPath(); c.ellipse(x, y, r, r * 0.45, 0, 0, TAU); c.fill();
    c.fillStyle = "#e0a13a"; c.beginPath(); c.ellipse(x, y - 1, r * 0.85, r * 0.35, 0, 0, TAU); c.fill();
    c.strokeStyle = "#ffd88a"; c.lineWidth = 1; c.beginPath(); c.moveTo(x - r * 0.5, y - 1); c.lineTo(x + r * 0.5, y - 1); c.stroke();
  }

  /* ---------------- HUD: score, pies, leg, the Dinner Clock ---------------- */
  function hud(c) {
    rect(c, 0, 0, W, 40, "rgba(8,9,14,.82)"); rect(c, 0, 40, W, 2, INK.pumpkin);
    txt(c, comma(S.score), 8, 6, 9, INK.gold);
    for (var i = 0; i < 3; i++) { c.globalAlpha = i < S.pies ? 1 : 0.25; pie(c, 14 + i * 20, 28, 8); c.globalAlpha = 1; }
    var leg = S.phase === "motel" ? "THE MOTEL" : S.phase === "home" ? "HOME" : LEGS[S.leg].title;
    ui(c, leg, W / 2 - 22, 6, 10, "#eceae2", "center");
    var m = clock(), risk = m + remainingTravel() > CONFIG.dinnerMin, col = m > CONFIG.dinnerMin ? "#ff4b3e" : risk ? INK.pumpkin : "#9bff3f";
    rr(c, W - 106, 4, 100, 32, 5, "#0b0d14"); c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(W - 105, 5, 98, 30);
    txt(c, clockStr(m), W - 56, 9, 9, col, "center");
    ui(c, "DINNER 6:00 PM", W - 56, 22, 8, "#8e93a2", "center");
    if (S.phase === "sky" && S.streak >= 2) ui(c, "STREAK " + S.streak + " x" + mult(), W / 2 - 22, 22, 9, S.streak >= 10 ? INK.gold : "#3ff0ff", "center");
    if (S.phase === "road" && S.bolt > 0) ui(c, "EXTRA BOLT", W / 2 - 22, 22, 9, INK.gold, "center");
    else if (S.phase === "road" && S.coffee) ui(c, "COFFEE " + S.coffee, W / 2 - 22, 22, 9, "#e0a13a", "center");
  }

  /* ---------------- Scenes ---------------- */
  function drawIntro(c, t) {
    var i;
    rect(c, 0, 0, W, H, "#14161f");
    rect(c, 0, 380, W, H - 380, "#2a2d38"); for (i = 0; i < W; i += 30) rect(c, i, 380, 1, H - 380, "#232631");
    var g = c.createLinearGradient(0, 30, 0, 300); g.addColorStop(0, "#5c6a86"); g.addColorStop(1, "#a9b3c4");
    c.fillStyle = g; c.fillRect(0, 30, W, 260);
    for (i = 0; i < 5; i++) rect(c, i * 90 - 2, 30, 4, 260, "#1b1d26");
    rect(c, 0, 250, W, 40, "#7d8798"); rect(c, 30, 262, 120, 10, "#eceae2"); rect(c, 140, 256, 30, 6, "#eceae2"); rect(c, 60, 252, 10, 12, "#c2304a");
    // departure board, generic labels only
    rr(c, 20, 50, 320, 160, 6, "#08090d");
    txt(c, "DEPARTURES", 34, 62, 9, INK.gold); ui(c, "GATE 9", 326, 62, 10, "#8e93a2", "right");
    var rows = [["NP 12", "UP NORTH", "ON TIME", "#9bff3f"], ["NP 27", "OUT WEST", "CANCELLED", "#ff4b3e"], ["NP 34", "HOME (MOM'S)", "", ""], ["NP 41", "BACK EAST", "DELAYED", INK.pumpkin], ["NP 58", "DOWN SOUTH", "ON TIME", "#9bff3f"]];
    var st = ["ON TIME", "DELAYED", "DELAYED AGAIN", "BOARDING NOW"], si = Math.min(3, Math.floor(t / 1.05)), flip = (t % 1.05) < 0.18;
    for (i = 0; i < rows.length; i++) {
      var y = 88 + i * 23, mine = i === 2;
      if (mine) rect(c, 24, y - 4, 312, 20, "rgba(255,210,63,.14)");
      ui(c, rows[i][0], 32, y, 10, "#eceae2"); ui(c, rows[i][1], 88, y, 10, mine ? INK.gold : "#eceae2");
      var s = mine ? st[si] : rows[i][2], col = mine ? (si === 1 ? INK.pumpkin : si === 2 ? "#ff4b3e" : "#9bff3f") : rows[i][3];
      if (mine && flip && si > 0) { for (var k = 0; k < 8; k++) rect(c, 214 + k * 14, y - 1, 11, 13, "#2a2d38"); }
      else ui(c, s, 214, y, 10, col);
    }
    drawHero(c, "stand", 110, 384, 4, 0);
    for (i = 0; i < 3; i++) pieBox(c, 150, 384 - (i + 1) * 16, 44, 16, wear("gold"));
    rect(c, 236, 316, 80, 64, "#3a3e4a"); rect(c, 242, 322, 68, 20, "#08090d"); ui(c, "GATE 9", 276, 326, 10, INK.gold, "center"); rect(c, 250, 348, 52, 4, "#5a5e6c");
    txt(c, "GRAVY OR BUST!", W / 2, 410, 16, INK.pumpkin, "center", INK.cran);
    ui(c, "THREE RIDES TO DINNER", W / 2, 436, 11, INK.gold, "center");
    ui(c, "900 MILES. 3 PIES. DINNER AT 6:00 PM.", W / 2, 458, 10, INK.cream, "center");
    if (Math.sin(t * 6) > -0.3) ui(c, "TAP TO BOARD", W / 2, 496, 11, "#8e93a2", "center");
  }

  function drawHowto(c, t) {
    var L = LEGS[S.leg], p = S.phase, pt = S.pt;
    S.phase = L.key; S.pt = 0; drawLeg(c, t); S.phase = p; S.pt = pt;
    c.fillStyle = "rgba(8,9,14,.8)"; c.fillRect(0, 0, W, H);
    rr(c, 28, 110, 304, 300, 10, "#1d2029"); c.strokeStyle = L.col; c.lineWidth = 3; c.strokeRect(30, 112, 300, 296);
    ui(c, L.n, W / 2, 126, 10, "#8e93a2", "center");
    txt(c, L.title, W / 2, 144, 16, L.col, "center");
    ui(c, L.sub, W / 2, 170, 10, INK.cream, "center");
    var cx = W / 2, cy = 260, tt = (t * 1.2) % 1;
    if (L.key === "sky") {
      circ(c, cx, cy, 26, INK.navy); c.strokeStyle = INK.gold; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, 26, 0, TAU); c.stroke(); txt(c, "NOD", cx, cy - 4, 8, INK.cream, "center");
      c.strokeStyle = "#3ff0ff"; c.beginPath(); c.arc(cx, cy, 26 + (1 - tt) * 56, 0, TAU); c.stroke();
      finger(c, cx + 56, cy + 34, tt > 0.85);
    } else if (L.key === "rails") {
      gauge(c, cx, cy + 24, 0.32, Math.sin(t * 2.4) * 0.28, true);
      finger(c, cx + 84, cy + 30, Math.sin(t * 2.4) < 0);
      ui(c, "HOLD", cx + 84, cy - 14, 9, INK.gold, "center");
    } else {
      rect(c, cx - 66, cy - 44, 132, 92, "#3a3d45"); for (var i = 1; i < 3; i++) rect(c, cx - 66 + i * 44, cy - 44, 2, 92, "#ffd23f");
      carTop(c, cx + (tt < 0.5 ? -44 : 0), cy + 10, 0, 0.8);
      finger(c, cx - 104, cy + 30, tt < 0.5); finger(c, cx + 104, cy + 30, tt >= 0.5);
    }
    wrapUi(c, L.how, W / 2, 334, 11, "#eceae2", 270, 16);
    if (Math.sin(t * 6) > 0) ui(c, "TAP TO GO", W / 2, 386, 9, "#8e93a2", "center");
  }
  function finger(c, x, y, down) {
    var o = down ? 4 : 0;
    rr(c, x - 7, y - 18 + o, 14, 30, 6, "#f1c28e"); rr(c, x - 10, y + 4 + o, 20, 20, 6, "#f1c28e");
    if (down) { c.strokeStyle = INK.gold; c.lineWidth = 2; c.beginPath(); c.arc(x, y - 20, 11, 0, TAU); c.stroke(); }
  }

  function drawLeg(c, t) {
    var p = S.phase;
    if (p === "sky") drawSky(c, t);
    else if (p === "rails") drawRails(c, t);
    else if (p === "motel") drawMotel(c, t);
    else if (p === "road") drawRoad(c, t);
  }

  /* ---- SKY scene: Seat 34B ---- */
  function drawSky(c, t) {
    var live = S.phase === "sky" && S.pt > 15 && S.pt < 99, turb = live ? Math.sin(t * 23) * 2 + Math.sin(t * 37) : 0, i;
    c.save(); c.translate(0, turb);
    rect(c, 0, -4, W, H + 8, "#d9d3c4");
    var g = c.createLinearGradient(0, 40, 0, 320); g.addColorStop(0, "#c9c2b2"); g.addColorStop(1, "#e6e0d2"); c.fillStyle = g; c.fillRect(0, 40, W, 280);
    rect(c, 0, 40, W, 46, "#b8b1a0"); rect(c, 0, 82, W, 6, "#9c9584"); for (i = 0; i < 3; i++) { rect(c, i * 120 + 6, 46, 108, 32, "#cfc8b7"); rect(c, i * 120 + 50, 70, 20, 4, "#8a8372"); }
    ui(c, "ROW 34", 60, 92, 9, "#6a6456", "center"); ui(c, "FASTEN SEATBELT", W / 2 + 40, 92, 8, live && Math.sin(t * 8) > 0 ? "#c2304a" : "#6a6456", "center");
    rr(c, 14, 110, 70, 104, 30, "#8a8372");
    c.save(); c.beginPath(); c.ellipse(49, 162, 28, 45, 0, 0, TAU); c.clip();
    var sg = c.createLinearGradient(0, 116, 0, 208); sg.addColorStop(0, "#4f86c6"); sg.addColorStop(1, "#bfe0ff"); c.fillStyle = sg; c.fillRect(20, 116, 58, 92);
    for (i = 0; i < 4; i++) { var cxp = ((i * 47 - t * 40) % 140 + 140) % 140 - 30; circ(c, cxp, 140 + i * 18, 10, "#fff"); circ(c, cxp + 10, 136 + i * 18, 12, "#fff"); circ(c, cxp + 22, 142 + i * 18, 9, "#fff"); }
    c.restore();
    var nodY = S.nod > 0 ? Math.sin(S.nod * Math.PI) * 6 : 0;
    seat(c, 126); seat(c, 246);
    drawHero(c, "sit", 126, 268 + nodY, 4, 0);
    rect(c, 90, 250, 72, 70, "#2a3f7a"); rect(c, 90, 250, 72, 6, "#3b5299");
    seatmate(c, 246, 268, t);
    rect(c, 210, 250, 72, 70, "#2a3f7a"); rect(c, 210, 250, 72, 6, "#3b5299");
    rect(c, 172, 236, 28, 6, "#8a8372");
    rect(c, 0, 320, W, H - 320, "#4a4f5e"); for (i = 0; i < W; i += 24) rect(c, i, 320, 12, H - 320, "rgba(0,0,0,.08)");
    c.restore();
    for (i = 0; i < S.bubbles.length; i++) bubble(c, S.bubbles[i]);
    // NOD marker and the shrinking rings
    var mx = 180 + turb * 1.5, my = 430;
    circ(c, mx, my, 36, "rgba(0,0,0,.35)"); circ(c, mx, my, 28, INK.navy);
    c.strokeStyle = INK.gold; c.lineWidth = 3; c.beginPath(); c.arc(mx, my, 28, 0, TAU); c.stroke();
    txt(c, "NOD", mx, my - 4, 9, INK.cream, "center");
    if (S.phase === "sky") for (i = 0; i < S.beats.length; i++) {
      var b = S.beats[i]; if (b.done || !b.spawned) continue;
      var k = (b.t - S.pt) / b.appr, r = 28 + Math.max(0, k) * (b.giant ? 140 : 92);
      c.strokeStyle = b.giant ? INK.pumpkin : Math.abs(b.t - S.pt) < CONFIG.sky.good ? INK.gold : "#3ff0ff"; c.lineWidth = b.giant ? 6 : 4;
      c.globalAlpha = clamp(1.2 - k * 0.5, 0.3, 1);
      c.beginPath(); c.arc(mx + (b.turb ? Math.sin(t * 19 + i) * 3 : 0), my, r, 0, TAU); c.stroke();
      c.globalAlpha = 1;
    }
    if (S.phase === "sky" && S.verdict && S.verdict.t < 0.5) {
      var v = S.verdict.v, vc = v === "PERFECT" ? INK.gold : v === "GOOD" ? "#3ff0ff" : "#ff4b3e", sc = 1 + Math.max(0, 0.15 - S.verdict.t) * 3;
      c.save(); c.translate(180, 362); c.scale(sc, sc); txt(c, v, 0, -6, 12, vc, "center"); c.restore();
    }
    if (S.phase === "sky" && S.pt > 30 && S.pt < 43) ui(c, "SLIDESHOW MODE", W / 2, 334, 10, Math.sin(t * 10) > 0 ? INK.pumpkin : INK.gold, "center");
  }
  function seat(c, x) { rr(c, x - 40, 150, 80, 110, 12, "#2a3f7a"); rr(c, x - 34, 156, 68, 20, 8, "#eceae2"); rect(c, x - 40, 176, 80, 4, "#22346a"); }
  function seatmate(c, x, y, t) {
    // a cheerful stranger: round face, earflap hat, loud souvenir sweater with a pine tree
    var talk = Math.sin(t * 14) > 0 ? 3 : 0, bob = Math.sin(t * 3), i;
    rr(c, x - 26, y - 58 + bob, 52, 60, 10, "#2e8b57");
    for (i = 0; i < 5; i++) rect(c, x - 26 + i * 11, y - 50 + bob, 6, 4, "#fff1d6");
    c.fillStyle = "#1f5a3a"; c.beginPath(); c.moveTo(x, y - 40 + bob); c.lineTo(x - 12, y - 12 + bob); c.lineTo(x + 12, y - 12 + bob); c.fill(); rect(c, x - 2, y - 12 + bob, 4, 6, "#6a4a2a");
    circ(c, x, y - 82 + bob, 22, "#e8b88a");
    rr(c, x - 24, y - 108 + bob, 48, 20, 8, "#d94a2a"); rect(c, x - 26, y - 92 + bob, 8, 18, "#d94a2a"); rect(c, x + 18, y - 92 + bob, 8, 18, "#d94a2a"); circ(c, x, y - 110 + bob, 5, "#fff1d6");
    rect(c, x - 10, y - 86 + bob, 4, 4, "#1b1b28"); rect(c, x + 6, y - 86 + bob, 4, 4, "#1b1b28");
    circ(c, x - 13, y - 76 + bob, 4, "#f29a8a"); circ(c, x + 13, y - 76 + bob, 4, "#f29a8a");
    rect(c, x - 7, y - 72 + bob, 14, 3 + talk, "#5a1a1a");
    if (S.phase === "sky" && S.pt > 30) { rr(c, x - 44, y - 50, 22, 34, 3, "#1b1b22"); rect(c, x - 41, y - 46, 16, 24, "#6fa8dc"); rect(c, x - 41, y - 32, 16, 10, "#7fae6a"); c.fillStyle = "#eceae2"; c.beginPath(); c.moveTo(x - 38, y - 32); c.lineTo(x - 33, y - 40); c.lineTo(x - 28, y - 32); c.fill(); }
  }
  function bubble(c, b) {
    var s = b.giant ? 1.8 : 1, a = clamp(2 - b.t * 1.1, 0, 1), w = 64 * s, h = 46 * s, x = clamp(b.x - w / 2 + (b.giant ? -40 : 0), 4, W - w - 4), y = b.y - h;
    c.globalAlpha = a;
    rr(c, x, y, w, h, 10, "#ffffff"); c.fillStyle = "#ffffff"; c.beginPath(); c.moveTo(x + w * 0.6, y + h - 1); c.lineTo(x + w * 0.7, y + h + 12); c.lineTo(x + w * 0.78, y + h - 1); c.fill();
    icon(c, b.topic, x + w / 2, y + h / 2 - (b.giant ? 6 : 0), s);
    if (b.giant) ui(c, "400 PHOTOS", x + w / 2, y + h - 16, 9, INK.cran, "center");
    c.globalAlpha = 1;
  }
  function icon(c, k, x, y, s) {
    var i;
    c.save(); c.translate(x, y); c.scale(s, s);
    if (k === "cat") { rect(c, -10, -4, 20, 14, "#e08a3a"); c.fillStyle = "#e08a3a"; c.beginPath(); c.moveTo(-10, -4); c.lineTo(-7, -12); c.lineTo(-3, -4); c.moveTo(10, -4); c.lineTo(7, -12); c.lineTo(3, -4); c.fill(); rect(c, -6, 0, 3, 3, "#1b1b28"); rect(c, 3, 0, 3, 3, "#1b1b28"); rect(c, 10, 4, 8, 3, "#e08a3a"); }
    else if (k === "lawn") { rect(c, -16, 4, 32, 8, "#4caf50"); for (i = -14; i < 16; i += 4) rect(c, i, 0, 2, 5, "#2e7d32"); circ(c, 8, -6, 5, "#ffd23f"); }
    else if (k === "foot") { rr(c, -12, -2, 24, 12, 5, "#e8b88a"); rect(c, -12, -12, 9, 12, "#e8b88a"); circ(c, 9, 0, 4, "#ff6b6b"); }
    else if (k === "photos") { rect(c, -14, -10, 22, 16, "#cfc8b7"); rect(c, -8, -6, 22, 16, "#1b1b28"); rect(c, -6, -4, 18, 12, "#6fa8dc"); c.fillStyle = "#4caf50"; c.beginPath(); c.moveTo(-6, 8); c.lineTo(2, -2); c.lineTo(12, 8); c.fill(); }
    else if (k === "fish") { c.fillStyle = "#5b9bd5"; c.beginPath(); c.ellipse(-2, 0, 12, 6, 0, 0, TAU); c.fill(); c.beginPath(); c.moveTo(9, 0); c.lineTo(16, -6); c.lineTo(16, 6); c.fill(); rect(c, -9, -2, 2, 2, "#1b1b28"); }
    else if (k === "cloud") { circ(c, -6, 2, 7, "#9aa4b2"); circ(c, 4, -1, 9, "#9aa4b2"); circ(c, 12, 3, 6, "#9aa4b2"); for (i = -6; i < 12; i += 6) rect(c, i, 10, 2, 5, "#3f7fd0"); }
    else if (k === "mower") { rect(c, -12, -2, 20, 8, "#c2304a"); circ(c, -8, 8, 4, "#1b1b22"); circ(c, 6, 8, 4, "#1b1b22"); rect(c, 6, -12, 2, 12, "#5a5e6c"); rect(c, 6, -12, 10, 2, "#5a5e6c"); }
    c.restore();
  }

  /* ---- RAILS scene: Standing Room Only ---- */
  function drawRails(c, t) {
    var i, w, h, live = S.phase === "rails" && S.pt < 99;
    rect(c, 0, 0, W, H, "#3d3a34");
    for (w = 0; w < 3; w++) {
      var wx = 14 + w * 118, wy = 70;
      rr(c, wx, wy, 96, 80, 8, "#1b1b22");
      c.save(); c.beginPath(); c.rect(wx + 4, wy + 4, 88, 72); c.clip();
      var g = c.createLinearGradient(0, wy, 0, wy + 80); g.addColorStop(0, "#f2a65a"); g.addColorStop(1, "#ffd9a0"); c.fillStyle = g; c.fillRect(wx, wy, 96, 80);
      var off = t * 120;
      for (h = -1; h < 4; h++) { var hx = wx + ((h * 130 - off * 0.3) % 260 + 260) % 260 - 60; c.fillStyle = "#b56a3a"; c.beginPath(); c.ellipse(hx, wy + 72, 70, 22, 0, 0, TAU); c.fill(); }
      rect(c, wx, wy + 60, 96, 20, "#8a5a2b");
      for (h = 0; h < 3; h++) { var px2 = wx + ((h * 60 - off * 2) % 180 + 180) % 180 - 20; rect(c, px2, wy + 20, 3, 50, "#3a2616"); rect(c, px2 - 8, wy + 22, 19, 2, "#3a2616"); }
      c.restore();
    }
    for (var s = 0; s < 4; s++) { var sx = 20 + s * 96; rr(c, sx, 200, 60, 90, 10, "#7a2a2a"); circ(c, sx + 30, 196, 14, "#2a2420"); rr(c, sx + 12, 208, 36, 40, 8, "#2a2420"); }
    rect(c, 0, 290, W, 10, "#2a2620");
    var fg = c.createLinearGradient(0, 300, 0, H); fg.addColorStop(0, "#4a443a"); fg.addColorStop(1, "#2a2620"); c.fillStyle = fg; c.fillRect(0, 300, W, H - 300);
    for (i = 0; i < 8; i++) rect(c, 0, 320 + i * 28, W, 1, "rgba(0,0,0,.25)");
    rect(c, 0, 52, W, 10, "#6a655c"); for (i = 0; i < 6; i++) { rect(c, 20 + i * 60, 52, 4, 30, "#8e8a80"); rect(c, 14 + i * 60, 80, 16, 6, "#8e8a80"); }
    ui(c, "COACH CAR 3", 330, 40 + 4, 8, "#8e8a80", "right");
    // the collector, arms up, balancing the tower
    var ang = (live ? S.th : 0) * 0.32, n = S.pies + S.station;
    c.save(); c.translate(180, 520); c.rotate(ang * 0.4);
    c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(0, 0, 30, 6, 0, 0, TAU); c.fill();
    drawHero(c, "hold", 0, 0, 5, 0);
    c.translate(0, -112); c.rotate(ang * 0.9);
    for (i = 0; i < n; i++) {
      var bw = 64 - (i % 2) * 4, bh = 18, by = -i * bh - bh, bx = -bw / 2 + Math.sin(t * 3 + i) * i * 0.6 + ang * i * 6;
      if (i < S.station) { rect(c, bx, by, bw, bh, ["#5a7bb5", "#8a5a9a"][i % 2]); rect(c, bx + bw / 2 - 2, by, 4, bh, INK.gold); rect(c, bx, by + bh / 2 - 2, bw, 4, INK.gold); }
      else pieBox(c, bx, by, bw, bh, wear("gold"));
    }
    c.restore();
    if (!live) return;
    if (S.curve && S.curve.t < 2.8) { var cd = S.curve.dir; rr(c, 12, 48, 76, 40, 6, "rgba(8,9,14,.85)"); c.strokeStyle = INK.gold; c.lineWidth = 4; c.beginPath(); c.moveTo(50 - 16 * cd, 78); c.quadraticCurveTo(50 - 16 * cd, 58, 50 + 18 * cd, 58); c.stroke(); ui(c, "CURVE " + (cd > 0 ? "R" : "L"), 50, 76, 8, INK.gold, "center"); }
    if (S.jolt && S.jolt.t < 1 && Math.sin(t * 30) > 0) { rr(c, W - 102, 48, 90, 40, 6, "#ff4b3e"); txt(c, "BRAKES!", W - 57, 56, 8, "#ffffff", "center"); ui(c, "HORN", W - 57, 72, 8, "#ffffff", "center"); }
    gauge(c, W / 2, 196, zone(), S.th, false);
    if (S.redT > 0.15) { ui(c, "SLIPPING!", W / 2, 206, 12, Math.sin(t * 20) > 0 ? "#ff4b3e" : INK.gold, "center"); rect(c, W / 2 - 40, 222, 80 * (S.redT / CONFIG.rails.red), 4, "#ff4b3e"); }
    else if (S.greenT >= 3) ui(c, "STEADY " + Math.floor(S.greenT) + "s", W / 2, 206, 10, S.greenT >= 10 ? INK.gold : "#9bff3f", "center");
    if (S.hold) { circ(c, 320, 500, 20, "rgba(255,210,63,.35)"); ui(c, "LEAN", 320, 495, 8, INK.gold, "center"); }
  }
  function gauge(c, x, y, z, th, small) {
    var r = small ? 60 : 70, a0 = Math.PI * 1.15, a1 = Math.PI * 1.85, span = a1 - a0, mid = (a0 + a1) / 2;
    function A(v) { return mid + clamp(v, -1.15, 1.15) / 1.15 * span / 2; }
    rr(c, x - r - 14, y - r - 12, (r + 14) * 2, r + 22, 10, "rgba(8,9,14,.8)");
    c.lineWidth = 12; c.strokeStyle = "#7a1f1f"; c.beginPath(); c.arc(x, y, r, a0, a1); c.stroke();
    c.strokeStyle = "#2f9e44"; c.beginPath(); c.arc(x, y, r, A(-z), A(z)); c.stroke();
    var na = A(th); c.strokeStyle = "#ffffff"; c.lineWidth = 4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(na) * (r + 8), y + Math.sin(na) * (r + 8)); c.stroke();
    circ(c, x, y, 6, INK.gold);
    ui(c, "L", x - r - 6, y - 18, 9, "#8e93a2", "center"); ui(c, "R", x + r + 6, y - 18, 9, "#8e93a2", "center");
  }

  /* ---- MOTEL scene ---- */
  function drawMotel(c, t) {
    var i, live = S.phase === "motel" && S.pt < 99;
    var g = c.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, "#0b0a1c"); g.addColorStop(1, "#2a2140"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (i = 0; i < stars.length; i++) if (Math.sin(t * 2 + stars[i].p) > -0.3) rect(c, stars[i].x, stars[i].y + 40, 1, 1, "#cfd3e6");
    circ(c, 300, 90, 14, "#f4e7b8");
    rect(c, 0, 230, W, 200, "#6b4f3a"); rect(c, 0, 226, W, 8, "#3a2616");
    rect(c, 0, 430, W, H - 430, "#2a2d38");
    // the sign: VAC NCY, one dead letter
    rect(c, 70, 80, 4, 150, "#3a3e4a"); rr(c, 20, 100, 170, 60, 8, "#14101e"); c.strokeStyle = "#ff3fa4"; c.lineWidth = 2; c.strokeRect(24, 104, 162, 52);
    var L = ["V", "A", "C", "A", "N", "C", "Y"];
    for (i = 0; i < L.length; i++) { var dead = i === 3; txt(c, L[i], 38 + i * 22, 120, 16, dead ? "#3a2440" : "#ff3fa4", "center", dead ? null : "#ff3fa4"); }
    ui(c, "MOTEL", 105, 166, 11, "#ffd23f", "center");
    // the tiny room: the bed folds down over the sink
    rect(c, 24, 260, 150, 150, "#e8d9b0"); rect(c, 24, 260, 150, 6, "#c9b88e"); ui(c, "ROOM 1", 99, 270, 9, "#6a4f3a", "center");
    rect(c, 40, 350, 50, 24, "#eceae2"); rect(c, 60, 336, 6, 14, "#8e93a2");
    var fold = live ? clamp((S.pt - 1.0) / 1.0, 0, 1) : 1;
    c.save(); c.translate(160, 388); c.rotate(-Math.PI / 2 * (1 - fold));
    rect(c, -128, -18, 128, 18, "#c2304a"); rect(c, -128, -24, 30, 8, "#eceae2"); c.restore();
    if (fold >= 1) { drawHero(c, "sit", 76, 372, 2, 0, -Math.PI / 2); ui(c, "Z z z", 120, 310 - (t * 10 % 20), 10, "#3a2616"); }
    // the ice machine, rattling
    var rattle = S.quiet || !live ? 0 : Math.sin(t * 60) * 2.5;
    c.save(); c.translate(286 + rattle, 0);
    rr(c, -44, 290, 88, 140, 6, "#b9c6d0"); rect(c, -36, 300, 72, 40, "#2a3f7a"); txt(c, "ICE", 0, 312, 12, "#eceae2", "center");
    rect(c, -30, 356, 60, 46, "#8e9ba6"); rect(c, -20, 370, 40, 6, "#5a6670");
    for (i = 0; i < CONFIG.motel.kicks; i++) rect(c, -33 + i * 11.5, 412, 9, 8, i < S.kicks ? INK.gold : "#5a6670");
    c.restore();
    if (!live) return;
    if (!S.quiet) { for (i = 0; i < 3; i++) { var a = (t * 6 + i) % 3; c.strokeStyle = "rgba(255,255,255," + (0.6 - a * 0.2) + ")"; c.lineWidth = 2; c.beginPath(); c.arc(286, 360, 52 + a * 12, -0.6, 0.6); c.stroke(); c.beginPath(); c.arc(286, 360, 52 + a * 12, Math.PI - 0.6, Math.PI + 0.6); c.stroke(); } ui(c, "RATTLE RATTLE", 286, 272, 10, "#cfe9f2", "center"); }
    else ui(c, "AHHH. QUIET.", 286, 272, 10, INK.gold, "center");
    rr(c, 14, 448, 332, 76, 8, "rgba(8,9,14,.88)");
    txt(c, "THE MOTEL", W / 2, 456, 9, INK.pumpkin, "center");
    ui(c, S.quiet ? "GOOD NIGHT'S SLEEP. EXTRA BOLT EARNED" : "BONUS: TAP 6 TIMES TO KICK THE ICE MACHINE", W / 2, 474, 9, S.quiet ? INK.gold : "#eceae2", "center");
    var left = Math.max(0, CONFIG.motel.dur - S.pt);
    rect(c, 40, 494, 280 * (left / CONFIG.motel.dur), 8, INK.pumpkin); ui(c, "30 MINUTE NAP", W / 2, 506, 8, "#8e93a2", "center");
  }

  /* ---- ROAD scene: The Last Car on the Lot ---- */
  function carTop(c, x, y, lost, sc) {
    c.save(); c.translate(x, y); c.scale(sc || 1, sc || 1);
    var P = paint(), i;
    for (i = 0; i < 4; i++) { var wx = i % 2 ? 14 : -20, wy = i < 2 ? -20 : 12; rect(c, wx, wy, 6, 12, "#1b1b22"); if (lost < 1) rect(c, wx + 1, wy + 4, 4, 4, "#cfd3e6"); }
    rect(c, -14, -26, 28, 52, "#3a3e4a");
    rr(c, -6, -2, 12, 12, 3, "#5a3418");
    circ(c, 0, -10, 4, "#1b1b22"); rect(c, -5, -11, 10, 2, "#1b1b22");
    if (lost < 3) rect(c, -15, -30, 30, 5, "#cfd3e6");
    if (lost < 4) { rr(c, -14, -27, 28, 14, 4, P); rect(c, -10, -14, 20, 3, "#6fa8dc"); }
    if (lost < 5) rect(c, -16, -12, 4, 26, P);
    if (lost < 6) { rect(c, 12, -12, 4, 26, P); rr(c, -12, 12, 24, 14, 3, P); rect(c, -10, 14, 20, 4, "#6fa8dc"); }
    if (lost < 2) { rect(c, -20, -10, 4, 4, P); rect(c, 16, -10, 4, 4, P); }
    circ(c, 0, 2, 6, wear("hat") ? "#8a5a2b" : "#1d2b53"); rect(c, -3, -5, 6, 3, "#141e3a");
    if (lost >= 6) rect(c, 2, 6, 3, 10 + Math.sin(idleT * 20 + (S.t || 0) * 20) * 3, wear("scarf") ? "#c2304a" : "#3b5a96");
    c.restore();
  }
  function drawObs(c, o, t) {
    var x = o.x, y = o.y, i;
    if (o.k === "cone") { c.fillStyle = INK.pumpkin; c.beginPath(); c.moveTo(x, y - 12); c.lineTo(x + 9, y + 9); c.lineTo(x - 9, y + 9); c.fill(); rect(c, x - 5, y - 2, 10, 3, "#ffffff"); rect(c, x - 11, y + 8, 22, 4, "#c25a10"); }
    else if (o.k === "hole") { c.fillStyle = "#14151a"; c.beginPath(); c.ellipse(x, y, 15, 9, 0, 0, TAU); c.fill(); c.strokeStyle = "#5a5e6c"; c.lineWidth = 2; c.stroke(); }
    else if (o.k === "leaves") { var cols = ["#c2304a", INK.pumpkin, "#e0a13a", "#8a5a2b"]; for (i = 0; i < 9; i++) circ(c, x + Math.cos(i * 2.1) * 12, y + Math.sin(i * 1.7) * 8, 6, cols[i % 4]); }
    else if (o.k === "mattress") { rr(c, x - 21, y - 17, 42, 34, 6, "#eceae2"); for (var j = 0; j < 3; j++) for (var k = 0; k < 2; k++) circ(c, x - 12 + j * 12, y - 7 + k * 14, 2, "#b0b8c4"); c.strokeStyle = "#7f9fb0"; c.lineWidth = 2; c.strokeRect(x - 19, y - 15, 38, 30); }
    else if (o.k === "turkey") {
      var b = Math.sin(o.ph) * 3, fc = ["#c2304a", INK.pumpkin, INK.gold, "#8a5a2b", INK.pumpkin, "#c2304a"];
      c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(x + 10, y + 22, 18, 6, 0, 0, TAU); c.fill();
      for (i = 0; i < 6; i++) { c.fillStyle = fc[i]; c.beginPath(); c.ellipse(x - 15 + i * 6, y - 16 + b + Math.abs(i - 2.5) * 3, 5, 14, (i - 2.5) * 0.3, 0, TAU); c.fill(); }
      circ(c, x, y + b, 16, "#8a5a2b"); circ(c, x, y - 12 + b, 8, "#a0703a"); rect(c, x - 2, y - 12 + b, 4, 3, INK.gold); rect(c, x + 2, y - 9 + b, 3, 6, "#c2304a"); rect(c, x - 4, y - 15 + b, 2, 2, "#1b1b28");
      c.strokeStyle = "#eceae2"; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y + 16 + b); c.lineTo(x + 6, y + 30); c.stroke();
    }
    else if (o.k === "coffee") { var g2 = Math.sin(t * 8) * 2; circ(c, x, y, 13, "rgba(224,161,58,.3)"); rect(c, x - 7, y - 8, 14, 17, INK.cream); rect(c, x - 8, y - 10, 16, 4, "#6a4a2a"); rect(c, x - 7, y - 1, 14, 5, "#c2304a"); rect(c, x - 2, y - 16 + g2, 2, 4, "rgba(255,255,255,.6)"); rect(c, x + 2, y - 18 - g2, 2, 4, "rgba(255,255,255,.6)"); }
    else if (o.k === "pie") { circ(c, x, y, 24, "rgba(255,210,63,.25)"); rr(c, x - 18, y - 14, 36, 28, 4, "#8a5a2b"); rect(c, x - 20, y - 18, 40, 6, "#c2304a"); for (i = 0; i < 5; i++) rect(c, x - 20 + i * 8, y - 18, 4, 6, "#fff1d6"); pie(c, x, y + 2, 11); ui(c, "PIES", x, y - 32, 8, INK.gold, "center"); }
  }
  function drawRoad(c, t) {
    var live = S.phase === "road" && S.pt < 99, sc = live ? S.scroll : t * 200, snowy = live && roadPhase(S.pt) === 2, i;
    rect(c, 0, 0, W, H, snowy ? "#cfd8dc" : "#6b8e3a");
    for (i = 0; i < 12; i++) {
      var ty = ((i * 90 + sc) % 1080) - 60, side = i % 2 ? 40 : 320, col = snowy ? "#eceff1" : ["#c2304a", "#e0662a", "#e0a13a"][i % 3];
      if (ty < -60 || ty > H + 60) continue;
      rect(c, side - 3, ty + 8, 6, 14, "#5a3418"); circ(c, side, ty, 22, col); circ(c, side - 10, ty + 6, 14, col); circ(c, side + 6, ty - 8, 10, "rgba(255,255,255,.14)");
    }
    rect(c, 88, 0, 184, H, snowy ? "#5a5e66" : "#3a3d45"); rect(c, 88, 0, 4, H, "#eceae2"); rect(c, 268, 0, 4, H, "#eceae2");
    for (var l = 0; l < 2; l++) for (var y = (sc % 60) - 60; y < H; y += 60) rect(c, 148 + l * 60, y, 4, 30, "#ffd23f");
    var sy = ((sc + 300) % 1600) - 100;
    if (sy > -80 && sy < H + 40) { rect(c, 302, sy, 4, 60, "#8e93a2"); rr(c, 278, sy - 34, 66, 36, 4, "#2f6b3a"); ui(c, "HOME", 311, sy - 30, 9, "#ffffff", "center"); ui(c, Math.max(1, Math.round(100 * (1 - (live ? S.pt : CONFIG.road.dur) / CONFIG.road.dur))) + " MI", 311, sy - 18, 9, "#ffffff", "center"); }
    if (live) for (i = 0; i < S.obs.length; i++) drawObs(c, S.obs[i], t);
    var cx = live ? S.cx : LANES[S.lane];
    if (!(live && S.inv > 0 && Math.sin(t * 40) > 0)) carTop(c, cx, CAR_Y, S.lost, 1);
    if (live && S.pt < 2.5) ui(c, "TAP LEFT  |  TAP RIGHT", W / 2, 500, 10, "#ffffff", "center");
    if (snowy) {
      var k = clamp((S.pt - CONFIG.road.snowAt) / 2, 0, 1), V = CONFIG.road.view;
      c.save(); c.fillStyle = "rgba(8,10,20," + (0.74 * k) + ")"; c.beginPath(); c.rect(0, 0, W, H);
      c.moveTo(cx - 14, CAR_Y - 20); c.lineTo(cx - 100, CAR_Y - V); c.lineTo(cx + 100, CAR_Y - V); c.lineTo(cx + 14, CAR_Y - 20); c.lineTo(cx + 40, CAR_Y + 50); c.lineTo(cx - 40, CAR_Y + 50); c.closePath();
      c.fill("evenodd"); c.restore();
      for (i = 0; i < snow.length; i++) { var f = snow[i], fy = (f.y + t * f.v) % H, fx = ((f.x + Math.sin(t + f.p) * 10) % W + W) % W; rect(c, fx, fy, f.s, f.s, "#ffffff"); }
    }
  }

  /* ---- Side-view car (finale and title) ---- */
  function carSide(c, x, y, lost, t, bounce) {
    var P = paint(), b = bounce ? Math.sin(t * 18) : 0;
    c.save(); c.translate(x, y + b);
    rect(c, -44, -10, 88, 6, "#3a3e4a");
    rect(c, -6, -28, 18, 18, "#5a3418"); rect(c, -6, -40, 6, 14, "#5a3418");
    drawHero(c, "sit", 6, -14, 2, 0);
    c.strokeStyle = "#1b1b22"; c.lineWidth = 3; c.beginPath(); c.moveTo(18, -12); c.lineTo(26, -26); c.stroke(); circ(c, 26, -28, 5, "#1b1b22");
    if (lost < 6) { rect(c, -48, -36, 18, 26, P); rect(c, -46, -40, 16, 6, P); }
    if (lost < 5) { rect(c, -30, -36, 26, 26, P); rect(c, -27, -33, 20, 10, "#6fa8dc"); }
    if (lost < 4) { rect(c, 16, -24, 32, 14, P); rect(c, 12, -40, 6, 16, "#6fa8dc"); }
    if (lost < 3) rect(c, 46, -16, 6, 7, "#cfd3e6");
    if (lost < 2) rect(c, 10, -34, 7, 5, P);
    for (var i = 0; i < 2; i++) { var wx = i ? 30 : -30; circ(c, wx, -4, 9, "#1b1b22"); circ(c, wx, -4, lost < 1 ? 5 : 2, lost < 1 ? "#cfd3e6" : "#5a5e6c"); }
    c.restore();
  }

  /* ---- HOME finale ---- */
  function drawHome(c, t) {
    var T = S.pt, on = onTime(), i;
    var g = c.createLinearGradient(0, 0, 0, 340); g.addColorStop(0, on ? "#2a2a5a" : "#0e0f24"); g.addColorStop(1, on ? "#e07a4a" : "#3a2a4a"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (i = 0; i < stars.length; i++) if (stars[i].y < 120) rect(c, stars[i].x, stars[i].y + 44, 1, 1, "#cfd3e6");
    rect(c, 60, 170, 240, 170, "#7a4a32"); c.fillStyle = "#4a2a1c"; c.beginPath(); c.moveTo(40, 176); c.lineTo(180, 96); c.lineTo(320, 176); c.fill();
    rect(c, 240, 110, 20, 40, "#5a3a2a");
    var open = clamp((T - 5) / 0.6, 0, 1);
    for (i = 0; i < 2; i++) { var wx = i ? 230 : 80; rect(c, wx, 200, 50, 44, on ? "#ffd27a" : "#4a3e3a"); rect(c, wx + 23, 200, 4, 44, "#4a2a1c"); rect(c, wx, 220, 50, 4, "#4a2a1c"); }
    if (on) for (i = 0; i < 4; i++) { var bob = Math.sin(t * 6 + i) * 2 * open; circ(c, (i < 2 ? 92 : 242) + (i % 2) * 18, 232 + bob, 6, "rgba(40,20,10,.75)"); }
    rect(c, 156, 250, 48, 90, on ? "#fff1c0" : "#5a4a3a");
    if (open > 0) {
      if (on) { c.fillStyle = "rgba(255,220,140,.35)"; c.beginPath(); c.moveTo(156, 340); c.lineTo(204, 340); c.lineTo(250, 420); c.lineTo(110, 420); c.fill();
        for (i = 0; i < 3; i++) { var jump = Math.abs(Math.sin(t * 8 + i)) * 6 * open; circ(c, 168 + i * 12, 284 - jump, 6, "#3a2216"); rect(c, 162 + i * 12, 290 - jump, 12, 26, "#3a2216"); }
      } else { rect(c, 160, 310, 40, 6, "#8a5a2b"); rr(c, 168, 300, 24, 10, 4, "#cfd3e6"); }
    }
    c.save(); c.translate(156, 250); c.scale(Math.max(0.15, 1 - open * 0.85), 1); rect(c, 0, 0, 48, 90, INK.cran); rect(c, 6, 46, 36, 34, "#9a2038"); circ(c, 40, 50, 3, INK.gold);
    for (i = 0; i < 12; i++) circ(c, 24 + Math.cos(i / 12 * TAU) * 12, 24 + Math.sin(i / 12 * TAU) * 12, 4, [INK.pumpkin, "#e0a13a", "#8a5a2b"][i % 3]);
    c.restore();
    rect(c, 140, 340, 80, 8, "#5a5e6c");
    rect(c, 0, 340, W, H - 340, on ? "#5a7a3a" : "#2f3f2a");
    c.fillStyle = "#6a6e78"; c.beginPath(); c.moveTo(150, 348); c.lineTo(210, 348); c.lineTo(300, H); c.lineTo(60, H); c.fill();
    // what is left of the car coasts in, sheds its parts at the curb, the seat glides to the door
    var k = clamp(T / 2.4, 0, 1), carY = 520 - k * 130, scale = 1.5 - k * 0.6;
    if (T < 3.4) { c.save(); c.translate(180, carY); c.scale(scale, scale); carSide(c, 0, 0, T > 2.4 ? 6 : S.lost, t, T < 2.4); c.restore(); }
    if (T > 2.4 && T < 4.4) for (i = S.lost; i < 6; i++) { var q = T - 2.4; rect(c, 150 + (i - S.lost) * 12 + q * (i - 3) * 40, 380 - q * 70 + q * q * 90, 12, 7, paint()); }
    if (T >= 3.4) { var gk = clamp((T - 3.4) / 1.5, 0, 1), sy = 392 - gk * 48; rect(c, 168, sy - 4, 26, 10, "#5a3418"); drawHero(c, "sit", 181, sy - 2, 2.6 - gk * 0.8, 0); }
    if (T > 6) {
      rr(c, 20, 420, 320, 104, 10, "rgba(8,9,14,.85)");
      if (on) {
        rect(c, 40, 474, 150, 8, "#8a5a2b"); rect(c, 50, 482, 4, 28, "#8a5a2b"); rect(c, 176, 482, 4, 28, "#8a5a2b");
        for (i = 0; i < S.pies; i++) { var land = clamp((T - 6 - i * 0.3) / 0.3, 0, 1); pie(c, 70 + i * 44, 466 - (1 - land) * 40, 15); }
        ui(c, "THE PIES MADE IT", 114, 430, 10, INK.gold, "center");
        var wob = Math.sin(t * 9) * 0.07; c.save(); c.translate(272, 490); c.rotate(wob); rect(c, -38, -6, 76, 6, "#c9b48a"); rect(c, -32, 0, 3, 22, "#8e93a2"); rect(c, 28, 0, 3, 18, "#8e93a2"); c.restore();
        ui(c, "YOUR SEAT:", 272, 444, 9, "#8e93a2", "center"); ui(c, "THE CARD TABLE", 272, 456, 9, INK.cream, "center");
      } else {
        rect(c, 50, 484, 260, 8, "#8a5a2b"); rr(c, 120, 458, 90, 26, 12, "#cfd3e6"); c.fillStyle = "rgba(255,255,255,.55)"; c.fillRect(128, 462, 60, 4);
        c.save(); c.translate(226, 446); c.rotate(0.08); rect(c, 0, 0, 74, 36, "#ffe46a"); ui(c, "SAVED", 37, 7, 10, "#3a2616", "center"); ui(c, "YOU SOME.", 37, 20, 10, "#3a2616", "center"); c.restore();
        ui(c, "A PLATE UNDER FOIL", 110, 432, 9, "#cfd3e6", "center");
      }
    }
    for (i = 0; i < confetti.length; i++) { var cf = confetti[i]; c.globalAlpha = Math.max(0, 1 - cf.t / cf.life); c.fillStyle = cf.c; c.fillRect(cf.x, cf.y, 5, 5 * Math.abs(Math.sin(cf.r)) + 1); }
    c.globalAlpha = 1;
    if (T > 5.2) {
      var sc = 1 + Math.max(0, 5.5 - T) * 2;
      c.save(); c.translate(W / 2, 62); c.scale(sc, sc);
      txt(c, on ? "HOME FOR DINNER!" : "LEFTOVERS", 0, -8, on ? 14 : 18, on ? INK.gold : INK.pumpkin, "center", on ? INK.cran : null); c.restore();
      ui(c, "ARRIVED " + clockStr(S.arrival), W / 2, 84, 11, INK.cream, "center");
    }
    if (T > 6.6 && S.done !== true && Math.sin(t * 6) > 0) ui(c, "TAP FOR RESULTS", W / 2, 110, 9, "#cfd3e6", "center");
  }

  /* ---- Exit cards between legs ---- */
  function drawExit(c, t) {
    var e = S.exitInfo || { grade: "C", title: "", sub: "" }, k = clamp(S.pt / 0.3, 0, 1), p = S.phase, pt = S.pt;
    S.phase = LEGS[S.leg].key; S.pt = 999; drawLeg(c, t); S.phase = p; S.pt = pt;
    c.fillStyle = "rgba(8,9,14," + (0.72 * k) + ")"; c.fillRect(0, 0, W, H);
    var y = -120 + k * 230;
    rect(c, 80, y - 140, 4, 140, "#8e93a2"); rect(c, 276, y - 140, 4, 140, "#8e93a2");
    rr(c, 30, y, 300, 80, 6, S.leg === 2 ? "#2f6b3a" : "#14161f"); c.strokeStyle = "#eceae2"; c.lineWidth = 2; c.strokeRect(36, y + 6, 288, 68);
    txt(c, e.title, W / 2, y + 22, e.title.length > 17 ? 10 : 12, S.leg === 2 ? "#ffffff" : INK.gold, "center");
    ui(c, S.leg === 0 ? "FLIGHT NP 34 ARRIVED (SOMEWHERE)" : S.leg === 1 ? "ALL PASSENGERS OFF" : "KEEP RIGHT", W / 2, y + 50, 9, S.leg === 2 ? "#cfe9f2" : "#8e93a2", "center");
    wrapUi(c, e.sub, W / 2, 236, 11, INK.cream, 280, 15);
    if (S.pt > 0.45) {
      var gs = 1 + Math.max(0, 0.7 - S.pt) * 4, gc = { A: "#9bff3f", B: "#3ff0ff", C: INK.gold, D: "#ff4b3e" }[e.grade];
      c.save(); c.translate(W / 2, 340); c.scale(gs, gs); c.rotate(-0.08);
      rr(c, -50, -44, 100, 88, 10, "rgba(0,0,0,.5)"); c.strokeStyle = gc; c.lineWidth = 5; c.strokeRect(-46, -40, 92, 80);
      txt(c, e.grade, 0, -20, 36, gc, "center"); c.restore();
      ui(c, "LEG GRADE", W / 2, 394, 10, "#8e93a2", "center");
    }
    ui(c, "DINNER CLOCK " + clockStr(clock()), W / 2, 420, 11, "#eceae2", "center");
  }

  /* ---- Title backdrop ---- */
  function drawTitle(c, t) {
    var g = c.createLinearGradient(0, 0, 0, 380), i, x;
    g.addColorStop(0, "#2a1a3a"); g.addColorStop(0.6, "#c2304a"); g.addColorStop(1, "#ff8a1f"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    circ(c, 270, 300, 40, "#ffd27a");
    c.fillStyle = "#4a2a1c"; c.beginPath(); c.moveTo(0, 360); for (x = 0; x <= W; x += 30) c.lineTo(x, 330 + Math.sin(x * 0.03) * 16); c.lineTo(W, 360); c.fill();
    rect(c, 0, 360, W, H - 360, "#3a3d45"); for (x = ((-t * 160) % 60) - 60; x < W; x += 60) rect(c, x, 470, 30, 4, "#ffd23f");
    carSide(c, 180, 456, 0, t, true);
    for (i = 0; i < 3; i++) pieBox(c, 136 + i * 2, 418 - i * 12, 36, 12, wear("gold"));
    for (i = 0; i < 14; i++) { var lx = (i * 53 + t * 30) % (W + 40) - 20, ly = (i * 37 + t * 50) % 360; c.fillStyle = [INK.pumpkin, "#e0a13a", "#c2304a"][i % 3]; c.beginPath(); c.ellipse(lx, ly, 5, 3, t + i, 0, TAU); c.fill(); }
  }

  function draw(c, state) {
    var t = state === "title" ? idleT : S.t, p = S.phase, i;
    if (state === "title") { drawTitle(c, idleT); return; }
    if (p === "intro") drawIntro(c, S.pt);
    else if (p === "howto") drawHowto(c, t);
    else if (p === "exit") drawExit(c, t);
    else if (p === "home") drawHome(c, state === "over" ? 9 + idleT : t);
    else drawLeg(c, t);
    for (i = 0; i < parts.length; i++) { var q = parts[i]; c.globalAlpha = Math.max(0, 1 - q.t / q.life); rect(c, q.x, q.y, q.s, q.s * (q.spin ? 0.6 : 1), q.c); }
    c.globalAlpha = 1;
    for (i = 0; i < floats.length; i++) { var f = floats[i]; c.globalAlpha = Math.max(0, 1 - f.t / f.life); txt(c, f.s, f.x, f.y, 8, f.c, "center"); }
    c.globalAlpha = 1;
    if (p !== "intro") hud(c);
  }

  /* ---------------- Title card extras: pie-tin trophy shelf, closet, best arrival ---------------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; }); }
  function refreshTitle() {
    var card = document.querySelector("#np-ov-title .np-card"); if (!card) return;
    var box = document.getElementById("gob-title");
    if (!box) { box = document.createElement("div"); box.id = "gob-title"; card.insertBefore(box, card.querySelector("[data-act=start]")); }
    X = extras();
    var html = "", T = window.Trophies, g = null, i;
    if (T) for (i = 0; i < T.list.games.length; i++) if (T.list.games[i].slug === SLUG) g = T.list.games[i];
    if (g) {
      html += '<p class="gob-shelf-h">PIE TIN SHELF</p><ul class="gob-shelf">';
      for (i = 0; i < g.trophies.length; i++) { var tr = g.trophies[i], on = T.has(tr.id); html += '<li class="gob-tin' + (on ? " on t-" + tr.tier : "") + '" title="' + esc(tr.name + (on ? "" : ": " + tr.how)) + '" aria-label="' + esc(tr.name + (on ? ", earned" : ", locked")) + '"></li>'; }
      html += "</ul>";
    }
    var ba = Number(Sh.load("bestArrival"));
    if (ba) html += '<p class="gob-arr">BEST ARRIVAL <b>' + clockStr(ba) + '</b></p>';
    var cl = "";
    for (i = 0; i < UNLOCKS.length; i++) { var u = UNLOCKS[i]; if (!X.got[u.id] || u.id === "gold") continue;
      var pressed = u.paint ? X.paint === u.id : X.wear[u.id] !== false;
      cl += '<button type="button" data-gob="' + u.id + '" aria-pressed="' + pressed + '">' + esc(u.name.replace(" paint", "").replace("Plaid knit ", "")) + '</button>'; }
    if (cl) html += '<p class="gob-shelf-h">CLOSET</p><div class="gob-closet">' + cl + "</div>";
    box.innerHTML = html;
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-gob]") : null; if (!b) return;
    e.stopPropagation(); X = extras(); var id = b.getAttribute("data-gob");
    if (id === "pumpkin" || id === "cran") X.paint = X.paint === id ? null : id; else X.wear[id] = X.wear[id] === false;
    saveExtras(X); heroCache = {}; refreshTitle();
  }, true);

  if (dbg) window.GOB_DEBUG = { S: function () { return S; }, CONFIG: CONFIG, press: press, hop: hop, finish: finish, go: go, LANES: LANES, CAR_Y: CAR_Y, OBS: OBS, speed: speed, roadPhase: roadPhase, zone: zone };

  Sh.init({
    slug: SLUG,
    title: "GRAVY OR BUST!",
    accent: INK.pumpkin,
    width: W, height: H,
    format: function (n) { return comma(n) + " PTS"; },
    howTo: "The day before Thanksgiving. You are 900 miles from Mom's table with three pies, and dinner is at 6:00 PM. Three rides, one thumb: tap to nod along on the plane, hold to balance on the train, tap a side to hop lanes in the last car on the lot. Every slip costs minutes. Every run makes it to the front door.",
    keys: "Tap or hold anywhere (Space works too). On the road tap the left or right side, or use the arrow keys. P pause, M mute, R restart.",
    tip: "Arrive by 6:00 PM for the warm ending. 30 minutes early with every pie and a spotless car is the big one.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; tick(dt); },
    onPause: function () { S.hold = false; keyHeld = {}; }
  });
  X = extras();
  refreshTitle();
})();
