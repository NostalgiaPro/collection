/* CREATURE FEATURE KO: a Halloween boss rush on late-night VHS.
   The Nostalgia Pro collector (same pixel look as the main game: NP cap, NP tee) slides along the floor
   and auto-throws candy corn straight up. Stand under the monster to hit it, slide away to dodge.
   When a monster is worn out it glows OPEN: every hit is a CRIT for double damage.
   Seven monsters, each with one attack pattern that speeds up as its HP drains.
   Logical canvas 360 x 540. Seconds and logical pixels. */
(function () {
  "use strict";
  var W = 360, H = 540, TAU = Math.PI * 2;
  var FLOOR = 498, HERO_Y = 450, HERO_HW = 9, BOSS_Y = 132;
  var HEARTS = 5, FIRE = 0.15, SHOT_V = 600, IFRAMES = 1.5;
  var ORANGE = "#ff8a1f";
  var Sh = window.Shell;

  /* Public-domain monsters, original parody names and looks. */
  var BOSSES = [
    { id: "pumpkin", name: "SIR GOURDSWORTH", sub: "The Pumpkin Knight", hp: 40, hw: 30, speed: 0.7, amp: 90, col: "#e0662a", par: 14 },
    { id: "count", name: "COUNT FANGWORTH", sub: "Up past his bedtime", hp: 50, hw: 26, speed: 0.9, amp: 110, col: "#a77bff", par: 20 },
    { id: "wolf", name: "WOLFGANG HOWLBERT", sub: "Full moon, short fuse", hp: 60, hw: 30, speed: 1.1, amp: 120, col: "#8a6a4a", par: 22 },
    { id: "mummy", name: "PHARAOH WRAPSODY", sub: "Four thousand years of bad mood", hp: 70, hw: 26, speed: 0.8, amp: 110, col: "#e8dcb0", par: 24 },
    { id: "giant", name: "LUGNUT", sub: "The Patchwork Giant", hp: 80, hw: 32, speed: 0.75, amp: 100, col: "#7f9fb0", par: 26 },
    { id: "witch", name: "HAGATHA BREWSWORTH", sub: "Brews, flies, holds grudges", hp: 90, hw: 28, speed: 0.85, amp: 120, col: "#9bff3f", par: 28 },
    { id: "horse", name: "THE HEADLESS HAYRIDER", sub: "Final reel", hp: 100, hw: 34, speed: 1.1, amp: 130, col: ORANGE, par: 34 }
  ];

  var S = {}, keys = {}, idleT = 0, parts = [], floats = [], stars = [];
  var dbg = /[?&]debug=1/.test(location.search);
  (function () { var seed = 11; function r() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; } for (var i = 0; i < 40; i++) stars.push({ x: r() * W, y: 26 + r() * 150, p: r() * TAU }); })();

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function comma(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function R() { return window.NPRewards; }
  function unlock(id) { if (window.Trophies) window.Trophies.unlock(id); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function reset() {
    S = { t: 0, x: W / 2, tx: W / 2, vx: 0, hearts: HEARTS, inv: 0, fireT: 0, score: 0, bi: 0, phase: "intro", pt: 0,
          shots: [], foes: [], cols: [], bands: [], puddles: [], strikes: [], bt: 0, hitsThis: 0, noHitRun: 0, noHitBest: 0,
          beaten: 0, fastest: 99, clearTime: null, crits: 0, hitsTaken: 0, lastHp: 1, done: false, walk: 0, combo: 0 };
    parts.length = 0; floats.length = 0; keys = {};
    startBoss(0);
  }
  function startBoss(i) {
    var b = BOSSES[i];
    S.bi = i; S.phase = "intro"; S.pt = 0; S.bt = 0; S.hitsThis = 0;
    S.boss = { d: b, hp: b.hp, x: W / 2, y: -60, atkT: 1.2, open: 0, shield: 0, flash: 0, cycle: 0, hpShow: b.hp, dir: 1, ph: 0 };
    S.foes.length = 0; S.cols.length = 0; S.bands.length = 0; S.puddles.length = 0; S.strikes.length = 0; S.shots.length = 0;
  }
  function rage() { var b = S.boss; return 1 - b.hp / b.d.hp; }   // 0 fresh, 1 nearly KO

  /* ---------------- Attacks: one distinct pattern per monster ---------------- */
  function attack() {
    var b = S.boss, id = b.d.id, r = rage();
    b.cycle++;
    if (id === "pumpkin") {               // seed spread
      var n = r > 0.5 ? 5 : 3;
      for (var i = 0; i < n; i++) { var a = Math.PI / 2 + (i - (n - 1) / 2) * 0.32; S.foes.push({ k: "seed", x: b.x, y: b.y + 24, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, r: 6 }); }
      b.atkT = 1.5 - r * 0.4;
    } else if (id === "count") {          // bats aimed at you
      var nb = r > 0.55 ? 2 : 1;
      for (i = 0; i < nb; i++) { var tx = S.x + (i ? rnd(-60, 60) : 0), dx = tx - b.x, dy = HERO_Y - b.y, L = Math.sqrt(dx * dx + dy * dy), v = 170 + r * 60;
        S.foes.push({ k: "bat", x: b.x, y: b.y + 10, vx: dx / L * v, vy: dy / L * v, r: 8, p: Math.random() * 6 }); }
      b.atkT = 1.05 - r * 0.3;
      if (b.cycle % 4 === 0) b.shield = 1.4;   // cape up: candy bounces off
    } else if (id === "wolf") {           // claw columns, warned in red first
      var cw = 64, nc = r > 0.5 ? 2 : 1, used = [];
      for (i = 0; i < nc; i++) { var cx = i === 0 ? clamp(S.x + rnd(-20, 20), cw / 2, W - cw / 2) : clamp((S.x < W / 2 ? S.x + rnd(80, 150) : S.x - rnd(80, 150)), cw / 2, W - cw / 2);
        S.cols.push({ x: cx, w: cw, warn: 0.85 - r * 0.15, t: 0, hot: 0.25 }); used.push(cx); }
      b.atkT = 1.55 - r * 0.4;
    } else if (id === "mummy") {          // bandage wall with one gap
      var gw = 84 - r * 14, gx = clamp(rnd(gw / 2 + 6, W - gw / 2 - 6), gw / 2 + 6, W - gw / 2 - 6);
      S.bands.push({ y: b.y + 30, gx: gx, gw: gw, vy: 110 + r * 50 });
      b.atkT = 2.1 - r * 0.6;
    } else if (id === "giant") {          // lightning that chases where you were
      S.strikes.push({ x: S.x, t: 0, warn: 0.75 - r * 0.15, w: 34 });
      if (r > 0.6) S.foes.push({ k: "bolt", x: b.x, y: b.y + 26, vx: 0, vy: 200, r: 6 });
      b.atkT = 1.0 - r * 0.3;
    } else if (id === "witch") {          // potions lobbed at you, leave a puddle
      var land = clamp(S.x + rnd(-24, 24), 20, W - 20), tt = 1.3 - r * 0.2;
      S.foes.push({ k: "potion", x: b.x, y: b.y + 14, sx: b.x, sy: b.y + 14, lx: land, tt: tt, t: 0, r: 7 });
      b.atkT = 1.5 - r * 0.4;
    } else {                              // Hayrider: remix of everything, faster
      var m = b.cycle % 3;
      if (m === 0) { var hx = clamp(S.x, 32, W - 32); S.cols.push({ x: hx, w: 64, warn: 0.75 - r * 0.15, t: 0, hot: 0.25 }); }
      else if (m === 1) { for (i = 0; i < 3; i++) { var aa = Math.PI / 2 + (i - 1) * 0.36; S.foes.push({ k: "head", x: b.x, y: b.y + 20, vx: Math.cos(aa) * 135, vy: Math.sin(aa) * 135, r: 8 }); } }
      else { var ddx = S.x - b.x, ddy = HERO_Y - b.y, LL = Math.sqrt(ddx * ddx + ddy * ddy); S.foes.push({ k: "head", x: b.x, y: b.y + 20, vx: ddx / LL * 185, vy: ddy / LL * 185, r: 8 }); }
      b.atkT = 1.3 - r * 0.35;
    }
    // After every few attacks the monster runs out of steam: OPEN window (CRITs)
    if (b.cycle % 3 === 0) { b.open = 1.4; b.atkT += 1.2; }
  }

  /* ---------------- Update ---------------- */
  function update(dt) {
    S.t += dt; S.pt += dt;
    var k = (keys.ArrowLeft || keys.KeyA ? -1 : 0) + (keys.ArrowRight || keys.KeyD ? 1 : 0);
    if (k) S.tx = clamp(S.tx + k * 340 * dt, 14, W - 14);
    var mv = clamp(S.tx - S.x, -900 * dt, 900 * dt);
    S.x += mv; S.vx = mv / Math.max(dt, 1e-4); S.walk += Math.abs(mv) * 0.12;
    S.inv = Math.max(0, S.inv - dt);
    var b = S.boss;
    b.flash = Math.max(0, b.flash - dt);
    b.hpShow += (b.hp - b.hpShow) * Math.min(1, dt * 6);

    if (S.phase === "intro") {
      b.y += (BOSS_Y - b.y) * Math.min(1, dt * 5);
      if (S.pt > 1.7) { S.phase = "fight"; S.pt = 0; }
      tick(dt); return;
    }
    if (S.phase === "ko") {
      b.y += 160 * dt; tick(dt);
      if (S.pt > 2.0) {
        if (S.bi + 1 < BOSSES.length) { S.hearts = Math.min(HEARTS, S.hearts + 1); startBoss(S.bi + 1); }
        else finish(true);
      }
      return;
    }
    if (S.phase === "dead") { tick(dt); if (S.pt > 1.4) finish(false); return; }

    // fight
    S.bt += dt;
    b.ph += dt * b.d.speed * (1 + rage() * 0.6);
    if (b.open <= 0) b.x = W / 2 + Math.sin(b.ph) * b.d.amp * (b.d.id === "horse" ? 1 : 0.95);
    b.open = Math.max(0, b.open - dt); b.shield = Math.max(0, b.shield - dt);
    b.atkT -= dt;
    if (b.atkT <= 0 && b.open <= 0) attack();

    // auto-throw candy corn
    S.fireT -= dt;
    if (S.fireT <= 0) { S.fireT = FIRE; S.shots.push({ x: S.x, y: HERO_Y - 18, r: 0 }); if (Math.random() < 0.35) Sh.tone(1400, 0.015, "square", 0.04); }
    for (var i = S.shots.length - 1; i >= 0; i--) {
      var s = S.shots[i]; s.y -= SHOT_V * dt; s.r += dt * 14;
      if (s.y < b.y + 28 && s.y > b.y - 40 && Math.abs(s.x - b.x) < b.d.hw) { S.shots.splice(i, 1); hitBoss(s); if (S.phase !== "fight") return; continue; }
      if (s.y < 20) S.shots.splice(i, 1);
    }

    // monster attacks
    for (i = S.foes.length - 1; i >= 0; i--) {
      var f = S.foes[i];
      if (f.k === "potion") {
        f.t += dt; var q = Math.min(1, f.t / f.tt);
        f.x = f.sx + (f.lx - f.sx) * q; f.y = f.sy + (FLOOR - 6 - f.sy) * q - Math.sin(q * Math.PI) * 90;
        if (q >= 1) { S.foes.splice(i, 1); S.puddles.push({ x: f.lx, w: 46, t: 0, life: 1.4 }); sparkle(f.lx, FLOOR - 6, 8, ["#9bff3f", "#5aff9a"]); Sh.noise(0.15, 0.2, 900, 1); continue; }
      } else {
        f.x += f.vx * dt; f.y += f.vy * dt; if (f.p != null) f.p += dt * 16;
      }
      if (f.y > H + 20 || f.x < -30 || f.x > W + 30) { S.foes.splice(i, 1); continue; }
      if (f.k !== "potion" && Math.abs(f.x - S.x) < HERO_HW + f.r * 0.7 && f.y > HERO_Y - 26 - f.r * 0.5 && f.y < FLOOR) { S.foes.splice(i, 1); hurt(); if (S.phase !== "fight") return; }
    }
    for (i = S.cols.length - 1; i >= 0; i--) {
      var c = S.cols[i]; c.t += dt;
      if (c.t > c.warn && !c.fired) { c.fired = true; Sh.noise(0.12, 0.35, 2400, 0.8); Sh.shake(3, 0.12); }
      if (c.fired && c.t < c.warn + c.hot && Math.abs(S.x - c.x) < c.w / 2 + HERO_HW - 4) hurt();
      if (c.t > c.warn + c.hot + 0.15) S.cols.splice(i, 1);
      if (S.phase !== "fight") return;
    }
    for (i = S.bands.length - 1; i >= 0; i--) {
      var bd = S.bands[i]; bd.y += bd.vy * dt;
      if (bd.y > HERO_Y - 28 && bd.y < HERO_Y + 4 && !bd.hit && Math.abs(S.x - bd.gx) > bd.gw / 2 - HERO_HW + 2) { bd.hit = true; hurt(); if (S.phase !== "fight") return; }
      if (bd.y > H) S.bands.splice(i, 1);
    }
    for (i = S.strikes.length - 1; i >= 0; i--) {
      var st = S.strikes[i]; st.t += dt;
      if (st.t > st.warn && !st.fired) { st.fired = true; Sh.noise(0.2, 0.4, 3000, 0.5); Sh.tone(90, 0.2, "sawtooth", 0.2); if (Math.abs(S.x - st.x) < st.w / 2 + HERO_HW - 3) { hurt(); if (S.phase !== "fight") return; } }
      if (st.t > st.warn + 0.25) S.strikes.splice(i, 1);
    }
    for (i = S.puddles.length - 1; i >= 0; i--) {
      var pd = S.puddles[i]; pd.t += dt;
      if (pd.t < 0.6 && Math.abs(S.x - pd.x) < pd.w / 2 + HERO_HW - 6) { hurt(); if (S.phase !== "fight") return; }
      if (pd.t > pd.life) S.puddles.splice(i, 1);
    }
    tick(dt);
  }

  function hitBoss(s) {
    var b = S.boss;
    if (b.shield > 0) { pop("BLOCKED", s.x, b.y + 30, "#8e93a2"); Sh.tone(300, 0.03, "square", 0.08); return; }
    var crit = b.open > 0, dmg = crit ? 2 : 1;
    b.hp = Math.max(0, b.hp - dmg); b.flash = 0.08;
    S.score += crit ? 25 : 10;
    S.combo++;
    if (crit) { S.crits++; pop("CRIT!", s.x + rnd(-10, 10), b.y + 34, "#ffd23f"); sparkle(s.x, b.y + 24, 5, ["#ffd23f", "#fff3b0"]); Sh.tone(1100, 0.04, "square", 0.14); }
    else { sparkle(s.x, b.y + 24, 2, [b.d.col, "#eceae2"]); if (Math.random() < 0.5) Sh.tone(620 + Math.random() * 80, 0.03, "triangle", 0.12); }
    if (S.combo === 10 || S.combo === 25 || S.combo === 50 || S.combo === 80) { if (R()) R().streak(S.combo, S.combo + " HIT COMBO", S.combo >= 50 ? "#ff4b3e" : S.combo >= 25 ? ORANGE : "#3ff0ff"); }
    if (b.hp <= 0) ko();
  }

  function ko() {
    var b = S.boss, t = S.bt, d = b.d;
    S.phase = "ko"; S.pt = 0; S.beaten++;
    S.foes.length = 0; S.cols.length = 0; S.bands.length = 0; S.strikes.length = 0; S.puddles.length = 0; S.shots.length = 0;
    var noHit = S.hitsThis === 0, timeB = Math.max(0, Math.round((d.par - t) * 25)), bonus = 250 * (S.bi + 1) + timeB + (noHit ? 400 : 0);
    S.score += bonus; S.lastKO = { t: t, noHit: noHit, bonus: bonus, timeB: timeB };
    if (t < S.fastest) S.fastest = t;
    if (noHit) { S.noHitRun++; S.noHitTotal = (S.noHitTotal || 0) + 1; if (S.noHitRun > S.noHitBest) S.noHitBest = S.noHitRun; } else S.noHitRun = 0;
    Sh.flash("K.O.!", d.name + (noHit ? " | NO HIT +400" : ""), noHit ? "#9bff3f" : "#ffd23f", 1700);
    Sh.sfx("best"); Sh.shake(8, 0.45); Sh.noise(0.5, 0.4, 700, 0.6);
    sparkle(b.x, b.y, 40, [d.col, "#ffd23f", "#eceae2", ORANGE]);
    if (R()) { R().burst(null, null, 40); }
    unlock("cfk-" + d.id);
    if (noHit) unlock("cfk-nohit");
    if (S.noHitBest >= 3) unlock("cfk-nohit3");
    if (S.bi >= 1 && t < 15) unlock("cfk-fast");
    if (d.id === "horse") {
      S.clearTime = S.t;
      if (noHit) unlock("cfk-horse-clean");
      if (S.t < 165) unlock("cfk-rewind");
    }
  }

  function hurt() {
    if (S.inv > 0 || S.phase !== "fight") return;
    S.hearts--; S.hitsThis++; S.hitsTaken++; S.inv = IFRAMES; S.combo = 0; S.noHitRun = 0;
    Sh.sfx("hit"); Sh.tone(160, 0.25, "sawtooth", 0.25, 70); Sh.shake(7, 0.3);
    sparkle(S.x, HERO_Y - 10, 12, ["#ff4b3e", "#eceae2"]);
    if (S.hearts <= 0) {
      S.phase = "dead"; S.pt = 0; S.lastHp = S.boss.hp / S.boss.d.hp;
      Sh.flash("THE END?", "Rewind and try again", "#ff4b3e", 1300);
      Sh.sfx("over");
    } else Sh.flash("OUCH", S.hearts + (S.hearts === 1 ? " candy bar left" : " candy bars left"), "#ff4b3e", 700);
  }

  function tick(dt) {
    for (var i = parts.length - 1; i >= 0; i--) { var q = parts[i]; q.t += dt; if (q.t >= q.life) { parts.splice(i, 1); continue; } q.vy += 260 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    for (i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; floats[i].y -= 30 * dt; if (floats[i].t > 0.7) floats.splice(i, 1); }
  }
  function sparkle(x, y, n, cols) {
    if (Sh.reduced) n = Math.min(n, 4);
    for (var i = 0; i < n; i++) { var a = Math.random() * TAU, v = 50 + Math.random() * 170; parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, life: 0.4 + Math.random() * 0.5, c: cols[i % cols.length], s: Math.random() < 0.3 ? 3 : 2 }); }
  }
  function pop(s, x, y, c) { if (floats.length < 14) floats.push({ s: s, x: x, y: y, c: c, t: 0 }); }

  function finish(cleared) {
    if (S.done) return;
    S.done = true;
    var b = S.boss, pct = Math.max(1, Math.round(b.hp / b.d.hp * 100));
    var stats = { score: S.score, beaten: S.beaten, cleared: cleared, clearTime: cleared ? Math.round(S.clearTime) : undefined, fastest: S.fastest,
                  noHitBest: S.noHitBest, hitsTaken: S.hitsTaken, crits: S.crits, lastBoss: b.d.id, lastHpPct: cleared ? 0 : pct };
    var html = "";
    if (!cleared && pct < 100) {
      var name = b.d.name.toLowerCase().replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); });
      html += '<p class="npr-close" style="color:#ff8a1f">' + (pct <= 25 ? "So close! " : "") + name + " had " + pct + "% HP left.</p>";
    }
    html += '<p class="np-extra">Monsters beaten ' + S.beaten + '/7 | crits ' + S.crits + (cleared ? ' | marathon ' + mmss(S.clearTime) : '') + '</p>';
    Sh.gameOver(S.score, { title: cleared ? "MARATHON COMPLETE" : "THE END?", html: html, stats: stats });
  }
  function mmss(t) { t = Math.round(t); return Math.floor(t / 60) + ":" + ("0" + (t % 60)).slice(-2); }

  /* ---------------- Input ---------------- */
  function pointer(type, x) { if (type === "down" || type === "move") S.tx = clamp(x, 14, W - 14); }
  function key(type, code) { keys[code] = type === "down"; }

  /* ---------------- Drawing ---------------- */
  function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }
  function circ(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }

  /* The Nostalgia Pro collector, same 16x24 pixel recipe as the main game's character.js
     (default look: short brown hair, Nostalgia Pro cap, Nostalgia Pro tee). */
  var heroCache = {};
  function heroSprite(step) {
    if (heroCache[step]) return heroCache[step];
    var FW = 16, FH = 24, p = new Array(FW * FH), SK = "#f1c28e", HC = "#4a2f1c";
    function px(x, y, col) { if (x >= 0 && x < FW && y >= 0 && y < FH) p[y * FW + x] = col; }
    function rc(x, y, w, h, col) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) px(x + i, y + j, typeof col === "function" ? col(x + i, y + j) : col); }
    var lUp = step === 1 ? 1 : 0, rUp = step === 2 ? 1 : 0;
    rc(4, 18, 8, 2, "#3b5a96"); rc(4, 20, 3, 2 - lUp, "#3b5a96"); rc(9, 20, 3, 2 - rUp, "#3b5a96");
    rc(4, 22 - lUp, 3, 2, "#2b2422"); rc(9, 22 - rUp, 3, 2, "#2b2422");
    var tee = function (x, y) { if (y >= 13 && y <= 14 && x >= 6 && x <= 9) return ((x + y) % 3 === 0) ? "#e4343e" : "#fff1d6"; if (y === 15 && x >= 6 && x <= 9) return "#29d3e8"; return "#1b1b22"; };
    rc(4, 11, 8, 7, tee); rc(3, 11, 1, 3, tee); rc(12, 11, 1, 3, tee);
    rc(3, 14, 1, 3 - rUp, SK); rc(12, 14, 1, 3 - lUp, SK);
    rc(4, 3, 8, 8, SK);
    px(6, 7, "#1b1b28"); px(6, 8, "#1b1b28"); px(9, 7, "#1b1b28"); px(9, 8, "#1b1b28"); px(7, 10, "#c19a72"); px(8, 10, "#c19a72");
    rc(4, 2, 8, 3, HC); px(4, 5, HC); px(11, 5, HC);
    rc(4, 1, 8, 4, "#1d2b53"); rc(3, 5, 10, 1, "#141e3a");
    px(6, 2, "#fff1d6"); px(7, 2, "#e4343e"); px(8, 2, "#fff1d6"); px(9, 2, "#fff1d6"); px(6, 3, "#fff1d6"); px(7, 3, "#fff1d6"); px(8, 3, "#e4343e"); px(9, 3, "#fff1d6");
    var out = [];
    for (var y = 0; y < FH; y++) for (var x = 0; x < FW; x++) if (!p[y * FW + x] && ((x > 0 && p[y * FW + x - 1]) || (x < FW - 1 && p[y * FW + x + 1]) || (y > 0 && p[(y - 1) * FW + x]) || (y < FH - 1 && p[(y + 1) * FW + x]))) out.push(y * FW + x);
    for (var o = 0; o < out.length; o++) p[out[o]] = "#0b1022";
    var cv = document.createElement("canvas"); cv.width = FW; cv.height = FH;
    var g = cv.getContext("2d");
    for (y = 0; y < FH; y++) for (x = 0; x < FW; x++) if (p[y * FW + x]) { g.fillStyle = p[y * FW + x]; g.fillRect(x, y, 1, 1); }
    heroCache[step] = cv;
    return cv;
  }
  function drawHero(c, x, t, moving) {
    if (S.inv > 0 && Math.sin(t * 40) > 0) return;
    var step = moving ? [1, 0, 2, 0][Math.floor(S.walk / 6) % 4] : 0;
    c.fillStyle = "rgba(0,0,0,.4)"; c.beginPath(); c.ellipse(x, FLOOR - 1, 16, 4, 0, 0, TAU); c.fill();
    c.imageSmoothingEnabled = false;
    c.drawImage(heroSprite(step), Math.round(x - 24), FLOOR - 72, 48, 72);
    // candy corn in the raised hand
    if (Math.floor(t / FIRE) % 2 === 0) { candyCorn(c, x + 20, FLOOR - 66, 0); }
  }
  function candyCorn(c, x, y, rot) {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.fillStyle = "#f6f4ee"; c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(-5, 6); c.fill();
    c.fillStyle = ORANGE; c.beginPath(); c.moveTo(-3, 0); c.lineTo(3, 0); c.lineTo(5, 6); c.lineTo(-5, 6); c.fill();
    c.fillStyle = "#ffd23f"; c.fillRect(-5, 4, 10, 2);
    c.restore();
  }

  function drawRoom(c, t) {
    // Late-night living room: window with the moon, wood paneling, a CRT glow
    var g = c.createLinearGradient(0, 0, 0, FLOOR);
    g.addColorStop(0, "#0b0a1c"); g.addColorStop(1, "#24142e");
    c.fillStyle = g; c.fillRect(0, 0, W, FLOOR);
    for (var i = 0; i < stars.length; i++) if (Math.sin(t * 2 + stars[i].p) > -0.2) rect(c, stars[i].x, stars[i].y, 1, 1, "#cfd3e6");
    circ(c, 318, 104, 16, "#f4e7b8"); circ(c, 313, 100, 3, "#e0d098");
    for (i = 0; i < 8; i++) rect(c, i * 48, 300, 2, FLOOR - 300, "rgba(0,0,0,.18)");
    rect(c, 0, 296, W, 4, "#3a2616");
    c.fillStyle = "rgba(90,60,40,.35)"; c.fillRect(0, 300, W, FLOOR - 300);
    // floor
    rect(c, 0, FLOOR, W, H - FLOOR, "#3a2a22");
    for (i = 0; i < W; i += 40) rect(c, i, FLOOR, 2, H - FLOOR, "#2a1d18");
    rect(c, 0, FLOOR, W, 2, "#5a3e30");
    // side props: pumpkin and a VHS stack
    pumpkin(c, 22, FLOOR - 9, 10, t);
    rect(c, 318, FLOOR - 18, 34, 6, "#1b1b22"); rect(c, 320, FLOOR - 12, 30, 6, "#2a2d38"); rect(c, 318, FLOOR - 6, 34, 6, "#1b1b22");
    rect(c, 324, FLOOR - 17, 12, 4, "#ff4b3e"); rect(c, 326, FLOOR - 11, 10, 4, "#3ff0ff"); rect(c, 324, FLOOR - 5, 14, 4, "#ffd23f");
  }
  function pumpkin(c, x, y, r, t) {
    c.fillStyle = "#e0662a"; c.beginPath(); c.ellipse(x, y, r * 1.25, r, 0, 0, TAU); c.fill();
    rect(c, x - 1, y - r - 3, 3, 4, "#3d6b2a");
    var gl = Math.sin(t * 9) > -0.5 ? "#ffd23f" : "#ffb02a";
    rect(c, x - r * 0.6, y - 3, 3, 3, gl); rect(c, x + r * 0.6 - 3, y - 3, 3, 3, gl); rect(c, x - r * 0.5, y + 2, r, 2, gl);
  }

  /* Monsters. Original looks built from rectangles; nothing from any studio's designs. */
  function drawBoss(c, b, t) {
    var x = Math.round(b.x), y = Math.round(b.y), id = b.d.id, hit = b.flash > 0;
    c.save();
    if (b.open > 0) { c.fillStyle = "rgba(255,210,63," + (0.18 + 0.12 * Math.sin(t * 20)) + ")"; c.beginPath(); c.arc(x, y, 50, 0, TAU); c.fill(); }
    if (id === "pumpkin") {
      circ(c, x, y + 4, 30, hit ? "#fff" : "#e0662a"); circ(c, x - 14, y + 4, 22, hit ? "#fff" : "#d0561e"); circ(c, x + 14, y + 4, 22, hit ? "#fff" : "#d0561e"); circ(c, x, y + 4, 22, hit ? "#fff" : "#e8702e");
      rect(c, x - 3, y - 32, 6, 10, "#3d6b2a"); rect(c, x - 22, y - 38, 44, 6, "#8d8f99"); rect(c, x - 16, y - 46, 32, 9, "#a8aab4"); rect(c, x - 2, y - 52, 4, 6, "#ff4b3e");
      var gl = "#ffd23f"; c.fillStyle = gl; c.beginPath(); c.moveTo(x - 16, y - 4); c.lineTo(x - 6, y - 4); c.lineTo(x - 11, y - 12); c.fill(); c.beginPath(); c.moveTo(x + 6, y - 4); c.lineTo(x + 16, y - 4); c.lineTo(x + 11, y - 12); c.fill();
      rect(c, x - 14, y + 10, 28, 5, gl); rect(c, x - 10, y + 10, 4, 3, "#d0561e"); rect(c, x + 4, y + 10, 4, 3, "#d0561e");
    } else if (id === "count") {
      var cape = b.shield > 0;
      c.fillStyle = "#1a0f22"; c.beginPath(); c.moveTo(x - (cape ? 34 : 40), y - 18); c.lineTo(x + (cape ? 34 : 40), y - 18); c.lineTo(x + 30, y + 38); c.lineTo(x - 30, y + 38); c.fill();
      c.fillStyle = "#a11a2a"; c.fillRect(x - 18, y - 14, 36, 50);
      if (!cape) { rect(c, x - 12, y - 30, 24, 26, hit ? "#fff" : "#d9d4e8"); rect(c, x - 12, y - 32, 24, 6, "#14101e"); rect(c, x - 3, y - 30, 6, 4, "#14101e");
        rect(c, x - 8, y - 22, 4, 3, "#ff4b3e"); rect(c, x + 4, y - 22, 4, 3, "#ff4b3e"); rect(c, x - 5, y - 12, 10, 2, "#5a1020"); rect(c, x - 4, y - 10, 2, 3, "#fff"); rect(c, x + 2, y - 10, 2, 3, "#fff");
        rect(c, x - 16, y - 6, 32, 4, "#eceae2"); }
      else { c.fillStyle = "#1a0f22"; c.fillRect(x - 30, y - 34, 60, 70); Sh.uiText(c, "CAPE UP", x, y - 4, 9, "#a77bff", "center"); }
    } else if (id === "wolf") {
      rect(c, x - 26, y - 10, 52, 44, hit ? "#fff" : "#6a4e36"); rect(c, x - 18, y - 2, 36, 30, "#8a6a4a");
      rect(c, x - 20, y - 36, 40, 28, hit ? "#fff" : "#6a4e36"); rect(c, x - 22, y - 46, 10, 14, "#6a4e36"); rect(c, x + 12, y - 46, 10, 14, "#6a4e36");
      rect(c, x - 10, y - 18, 20, 12, "#8a6a4a"); rect(c, x - 3, y - 18, 6, 4, "#1b1b22");
      rect(c, x - 13, y - 28, 6, 4, "#ffd23f"); rect(c, x + 7, y - 28, 6, 4, "#ffd23f");
      rect(c, x - 8, y - 8, 3, 4, "#fff"); rect(c, x + 5, y - 8, 3, 4, "#fff");
      for (var k = 0; k < 3; k++) { rect(c, x - 36 + k * 4, y + 28, 2, 8, "#eceae2"); rect(c, x + 28 + k * 4, y + 28, 2, 8, "#eceae2"); }
      rect(c, x - 26, y + 8, 52, 6, "#4a7ab0");  // torn flannel scrap
    } else if (id === "mummy") {
      rect(c, x - 20, y - 36, 40, 74, hit ? "#fff" : "#e8dcb0");
      for (k = 0; k < 9; k++) rect(c, x - 20, y - 34 + k * 8, 40, 2, "#bfb08a");
      rect(c, x - 12, y - 24, 24, 6, "#1b1b22"); rect(c, x - 9, y - 23, 4, 3, "#3ff0ff"); rect(c, x + 5, y - 23, 4, 3, "#3ff0ff");
      rect(c, x - 34, y - 6, 14, 8, "#e8dcb0"); rect(c, x + 20, y - 6, 14, 8, "#e8dcb0");
      rect(c, x - 24, y - 44, 48, 10, "#ffd23f"); rect(c, x - 24, y - 44, 48, 3, "#3f6fd0"); rect(c, x + 20, y + 30, 14, 3, "#e8dcb0");
    } else if (id === "giant") {
      rect(c, x - 30, y - 6, 60, 44, "#3a3e4a"); rect(c, x - 4, y - 6, 8, 44, "#2a2d38");
      rect(c, x - 18, y - 40, 36, 34, hit ? "#fff" : "#7f9fb0"); rect(c, x - 18, y - 40, 36, 4, "#eceae2"); rect(c, x - 20, y - 46, 8, 8, "#eceae2"); rect(c, x - 6, y - 48, 10, 8, "#eceae2"); rect(c, x + 8, y - 46, 10, 8, "#eceae2");
      rect(c, x - 26, y - 26, 8, 6, "#d8d6cf"); rect(c, x + 18, y - 26, 8, 6, "#d8d6cf");
      rect(c, x - 10, y - 28, 6, 5, "#ffd23f"); rect(c, x + 4, y - 28, 6, 5, "#ffd23f");
      c.strokeStyle = "#2a2d38"; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 16, y - 18); c.lineTo(x + 2, y - 14); for (k = 0; k < 4; k++) { c.moveTo(x - 12 + k * 4, y - 20); c.lineTo(x - 12 + k * 4, y - 13); } c.stroke();
      rect(c, x - 8, y - 12, 16, 3, "#2a2d38");
      if (Math.sin(t * 13) > 0.6) { c.strokeStyle = "#3ff0ff"; c.beginPath(); c.moveTo(x - 30, y - 24); c.lineTo(x - 38, y - 32); c.lineTo(x - 34, y - 34); c.lineTo(x - 42, y - 44); c.stroke(); }
    } else if (id === "witch") {
      var bob = Math.sin(t * 4) * 4;
      rect(c, x - 40, y + 22 + bob, 80, 4, "#8a5a2b"); for (k = 0; k < 6; k++) rect(c, x + 36 + k * 2, y + 16 + bob + k, 2, 14 - k * 2, "#c9a26a");
      c.fillStyle = "#2a1a3a"; c.beginPath(); c.moveTo(x - 20, y + 24 + bob); c.lineTo(x + 20, y + 24 + bob); c.lineTo(x + 10, y - 10 + bob); c.lineTo(x - 10, y - 10 + bob); c.fill();
      rect(c, x - 11, y - 28 + bob, 22, 20, hit ? "#fff" : "#8fd07a"); rect(c, x - 7, y - 22 + bob, 4, 4, "#ffd23f"); rect(c, x + 3, y - 22 + bob, 4, 4, "#ffd23f"); rect(c, x - 2, y - 18 + bob, 4, 7, "#6fb05a"); rect(c, x - 4, y - 12 + bob, 8, 2, "#2a1a3a");
      rect(c, x - 22, y - 32 + bob, 44, 5, "#1b1024"); c.fillStyle = "#1b1024"; c.beginPath(); c.moveTo(x - 12, y - 32 + bob); c.lineTo(x + 12, y - 32 + bob); c.lineTo(x + 8, y - 60 + bob); c.fill();
      rect(c, x - 12, y - 36 + bob, 24, 4, "#ff8a1f"); rect(c, x - 18, y - 26 + bob, 6, 18, "#c2452d"); rect(c, x + 12, y - 26 + bob, 6, 18, "#c2452d");
    } else {
      // The Headless Hayrider: dark horse, rider with no head, a lit jack-o-lantern held high
      var gal = Math.sin(t * 14) * 3;
      rect(c, x - 40, y + 2, 66, 22, "#1a1420"); rect(c, x + 22, y - 12, 14, 22, "#1a1420"); rect(c, x + 28, y - 18, 16, 10, "#1a1420"); rect(c, x + 38, y - 14, 3, 3, "#ff4b3e");
      for (k = 0; k < 4; k++) rect(c, x - 36 + k * 18, y + 24, 6, 14 + (k % 2 ? gal : -gal), "#1a1420");
      rect(c, x - 44, y - 2, 8, 18, "#2a1d2e");
      rect(c, x - 16, y - 30, 26, 34, hit ? "#fff" : "#3a2a4a"); rect(c, x - 18, y - 32, 30, 6, "#4a3a5a"); rect(c, x - 6, y - 34, 6, 4, "#a11a2a");
      c.fillStyle = "#5a1020"; c.beginPath(); c.moveTo(x - 16, y - 28); c.lineTo(x - 48, y + 4 + gal); c.lineTo(x - 16, y + 2); c.fill();
      rect(c, x + 10, y - 44, 4, 18, "#3a2a4a");
      pumpkin(c, x + 12, y - 52, 10, t * 2);
    }
    c.restore();
  }

  function drawHazards(c, t) {
    var i;
    for (i = 0; i < S.cols.length; i++) {
      var cl = S.cols[i];
      if (!cl.fired) { c.fillStyle = "rgba(255,75,62," + (0.12 + 0.18 * (cl.t / cl.warn)) + ")"; c.fillRect(cl.x - cl.w / 2, 180, cl.w, FLOOR - 180); rect(c, cl.x - cl.w / 2, FLOOR - 4, cl.w, 4, "#ff4b3e"); Sh.uiText(c, "!", cl.x, FLOOR - 40, 16, "#ff4b3e", "center"); }
      else { c.fillStyle = "rgba(236,234,226,.85)"; for (var k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(cl.x + k * 18 - 6, 170); c.lineTo(cl.x + k * 18 + 6, 170); c.lineTo(cl.x + k * 18 + 2, FLOOR); c.lineTo(cl.x + k * 18 - 2, FLOOR); c.fill(); } }
    }
    for (i = 0; i < S.bands.length; i++) {
      var b = S.bands[i], gl = b.gx - b.gw / 2, gr = b.gx + b.gw / 2;
      rect(c, 0, b.y, gl, 12, "#e8dcb0"); rect(c, gr, b.y, W - gr, 12, "#e8dcb0");
      for (var x = 4; x < W; x += 16) if (x < gl - 4 || x > gr) rect(c, x, b.y + 4, 8, 2, "#bfb08a");
      rect(c, gl - 4, b.y - 2, 4, 16, "#bfb08a"); rect(c, gr, b.y - 2, 4, 16, "#bfb08a");
    }
    for (i = 0; i < S.strikes.length; i++) {
      var st = S.strikes[i];
      if (!st.fired) { c.strokeStyle = "rgba(63,240,255," + (0.3 + 0.5 * (st.t / st.warn)) + ")"; c.lineWidth = 2; c.strokeRect(st.x - st.w / 2, FLOOR - 8, st.w, 8); c.beginPath(); c.arc(st.x, FLOOR - 4, st.w / 2 * (1 - st.t / st.warn) + 4, 0, TAU); c.stroke(); }
      else { c.strokeStyle = "#e9fdff"; c.lineWidth = 4; c.beginPath(); c.moveTo(st.x, 160); for (var yy = 160; yy < FLOOR; yy += 34) c.lineTo(st.x + (Math.random() * 2 - 1) * 12, yy); c.lineTo(st.x, FLOOR); c.stroke(); c.strokeStyle = "#3ff0ff"; c.lineWidth = 2; c.stroke(); }
    }
    for (i = 0; i < S.puddles.length; i++) { var p = S.puddles[i], a = Math.min(1, (p.life - p.t) * 2); c.globalAlpha = a * (p.t < 0.6 ? 1 : 0.35); c.fillStyle = "#5aff9a"; c.beginPath(); c.ellipse(p.x, FLOOR - 2, p.w / 2, 6, 0, 0, TAU); c.fill(); if (Math.sin(t * 9 + i) > 0.4) circ(c, p.x + Math.sin(t * 5 + i) * 14, FLOOR - 10, 3, "#9bff3f"); c.globalAlpha = 1; }
    for (i = 0; i < S.foes.length; i++) {
      var f = S.foes[i];
      if (f.k === "seed") { c.fillStyle = "#f6e6b0"; c.beginPath(); c.ellipse(f.x, f.y, 4, 6, Math.atan2(f.vy, f.vx) + Math.PI / 2, 0, TAU); c.fill(); }
      else if (f.k === "bat") { var fl = Math.sin(f.p) > 0 ? -6 : 3; c.fillStyle = "#14101e"; c.beginPath(); c.moveTo(f.x - 12, f.y + fl); c.lineTo(f.x, f.y + 3); c.lineTo(f.x + 12, f.y + fl); c.lineTo(f.x, f.y - 3); c.fill(); rect(c, f.x - 2, f.y - 1, 1, 1, "#ff4b3e"); rect(c, f.x + 1, f.y - 1, 1, 1, "#ff4b3e"); c.strokeStyle = "#a77bff"; c.lineWidth = 1; c.beginPath(); c.arc(f.x, f.y, 10, 0, TAU); c.stroke(); }
      else if (f.k === "bolt") { c.fillStyle = "#3ff0ff"; c.beginPath(); c.moveTo(f.x - 3, f.y - 10); c.lineTo(f.x + 4, f.y - 2); c.lineTo(f.x, f.y - 1); c.lineTo(f.x + 3, f.y + 10); c.lineTo(f.x - 4, f.y + 1); c.lineTo(f.x, f.y); c.fill(); }
      else if (f.k === "potion") { circ(c, f.x, f.y + 2, 7, "#5aff9a"); rect(c, f.x - 2, f.y - 9, 4, 5, "#8a5a2b"); circ(c, f.x - 2, f.y, 2, "#eaffd0"); c.strokeStyle = "rgba(90,255,154,.4)"; c.beginPath(); c.ellipse(f.lx, FLOOR - 2, 27, 5, 0, 0, TAU); c.stroke(); }
      else if (f.k === "head") { c.fillStyle = "rgba(255,138,31,.35)"; c.beginPath(); c.arc(f.x, f.y, 14, 0, TAU); c.fill(); pumpkin(c, f.x, f.y, 8, t * 3); }
    }
  }

  function hud(c, t) {
    var b = S.boss, d = b.d;
    rect(c, 0, 0, W, 56, "rgba(5,5,12,.78)");
    Sh.text(c, comma(S.score), 8, 6, 9, "#ffd23f");
    Sh.uiText(c, "MONSTER " + (S.bi + 1) + "/7", W / 2, 5, 9, "#8e93a2", "center");
    for (var i = 0; i < HEARTS; i++) { var x = W - 12 - i * 14, ok = i < S.hearts; rect(c, x - 5, 4, 10, 12, ok ? "#5a3418" : "#2a2d38"); rect(c, x - 5, 4, 10, 4, ok ? "#ff4b3e" : "#3a3e4a"); }
    Sh.text(c, d.name, 8, 22, d.name.length > 18 ? 7 : 8, d.col);
    // HP bar with drain trail
    var bw = W - 16, k = b.hp / d.hp, ks = b.hpShow / d.hp;
    rect(c, 8, 36, bw, 12, "#2a2d38"); rect(c, 8, 36, bw * ks, 12, "#ffffff"); rect(c, 8, 36, bw * k, 12, k < 0.25 ? "#ff4b3e" : k < 0.5 ? "#ffd23f" : "#9bff3f");
    rect(c, 8, 36, bw * k, 3, "rgba(255,255,255,.35)");
    Sh.uiText(c, Math.ceil(k * 100) + "%", W - 10, 37, 9, "#101219", "right");
    if (b.open > 0) Sh.text(c, "OPEN! CRITS x2", W / 2, 62, 8, Math.sin(t * 16) > 0 ? "#ffd23f" : "#ff8a1f", "center");
    if (S.combo >= 5) Sh.text(c, S.combo + " HITS", S.x, HERO_Y - 96, 7, S.combo >= 25 ? ORANGE : "#3ff0ff", "center");
    if (Math.sin(t * 4) > -0.2) circ(c, W - 14, 66, 3, "#ff4b3e");
    Sh.uiText(c, "LATE SHOW", W - 20, 61, 8, "#eceae2", "right");
  }

  function draw(c, state) {
    var t = state === "playing" || state === "paused" ? S.t : idleT;
    drawRoom(c, t);
    if (state === "playing" || state === "paused") {
      drawHazards(c, t);
      drawBoss(c, S.boss, t);
      for (var i = 0; i < S.shots.length; i++) candyCorn(c, S.shots[i].x, S.shots[i].y, S.shots[i].r);
      drawHero(c, S.x, t, Math.abs(S.vx) > 20);
      for (i = 0; i < parts.length; i++) { var q = parts[i]; c.globalAlpha = Math.max(0, 1 - q.t / q.life); rect(c, q.x, q.y, q.s, q.s, q.c); }
      c.globalAlpha = 1;
      for (i = 0; i < floats.length; i++) { var f = floats[i]; c.globalAlpha = Math.max(0, 1 - f.t / 0.7); Sh.text(c, f.s, f.x, f.y, 7, f.c, "center"); }
      c.globalAlpha = 1;
      hud(c, t);
      if (S.phase === "intro") {
        c.fillStyle = "rgba(0,0,0,.45)"; c.fillRect(0, 210, W, 90);
        Sh.text(c, "MONSTER " + (S.bi + 1) + " OF 7", W / 2, 222, 8, "#8e93a2", "center");
        Sh.text(c, S.boss.d.name, W / 2, 242, S.boss.d.name.length > 16 ? 10 : 13, S.boss.d.col, "center");
        Sh.uiText(c, S.boss.d.sub, W / 2, 268, 11, "#eceae2", "center");
        if (S.pt < 0.3 || Math.random() < 0.15) rect(c, 0, 200 + Math.random() * 200, W, 2, "rgba(255,255,255,.15)");
      }
      if (S.phase === "ko" && S.pt < 1.6) {
        var sc = 1 + Math.max(0, 0.6 - S.pt) * 2;
        c.save(); c.translate(W / 2, 250); c.scale(sc, sc); Sh.text(c, "K.O.!", 0, -14, 28, "#ffd23f", "center", ORANGE); c.restore();
        if (S.lastKO) Sh.uiText(c, "+" + comma(S.lastKO.bonus) + (S.lastKO.noHit ? "  NO HIT!" : "") + "   " + S.lastKO.t.toFixed(1) + "s", W / 2, 296, 11, S.lastKO.noHit ? "#9bff3f" : "#eceae2", "center");
      }
    } else {
      // Title / over backdrop: the collector facing down the lineup
      var sx = S.x; S.x = W / 2;
      if (S.boss) drawBoss(c, { d: BOSSES[Math.floor(idleT / 2.5) % BOSSES.length], x: W / 2 + Math.sin(idleT) * 60, y: 150, flash: 0, open: 0, shield: 0 }, idleT);
      drawHero(c, W / 2, idleT, false); S.x = sx;
    }
  }

  if (dbg) window.CFK_DEBUG = { state: function () { return S; }, bosses: BOSSES, skipTo: function (i) { startBoss(i); }, hurt: hurt };

  Sh.init({
    slug: "creature-feature-ko",
    title: "CREATURE FEATURE KO",
    accent: ORANGE,
    width: W, height: H,
    format: function (n) { return comma(n) + " PTS"; },
    howTo: "It's the late show and the monsters climbed out of the tapes. Slide left and right: you throw candy corn straight up automatically. Stand under the monster to hit it, slide away from its attacks. When it glows OPEN, every hit is a CRIT. Seven monsters, five candy bars of health.",
    keys: "Drag or move the mouse anywhere. Keys: left and right arrows (or A and D). P pause, M mute, R restart.",
    tip: "Red columns slash, blue rings zap, green puddles burn. You get a candy bar back after every K.O.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; tick(dt); },
    onPause: function () { keys = {}; }
  });
})();
