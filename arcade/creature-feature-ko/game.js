/* CREATURE FEATURE KO (3D): a Halloween boss rush on late-night VHS.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of input, scaling and the title / pause / game over flow, and carries the HUD.

   The rules are the 2D game's, unchanged. The Nostalgia Pro collector (NP cap, NP tee) slides
   along the front of a late-night living room and auto-throws candy corn straight ahead. Seven
   monsters climb out of the TV one at a time, each with one attack pattern that speeds up as its
   HP drains. When a monster is worn out it glows OPEN: every hit is a CRIT for double damage.
   The same code, in the same 360 x 540 logical units, decides every hit; only the picture is new.
   A logical point (x, y) sits on the living room floor at three.js (x - 180, height, y - 300):
   x runs across the room, y runs from the TV (far end) to the collector (near end).

   Every character is original: public-domain monster archetypes with their own names, looks and
   colors, built here from simple shapes. Nothing is taken from any studio's designs.
   The music is an original loop made in code (startMusic below), no audio files. */

const W = 360, H = 540, TAU = Math.PI * 2, DEG = Math.PI / 180;
const FLOOR = 498, HERO_Y = 450, HERO_HW = 9, BOSS_Y = 132;
const HEARTS = 5, FIRE = 0.15, SHOT_V = 600, IFRAMES = 1.5;
const ORANGE = "#ff8a1f";

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash, title card and score card
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every sign inside the living room
const THREE_URL = "../shared/three.module.min.js";
const FALLBACK_URL = "game-2d.js";                        // optional: the classic 2D game, used if 3D cannot start
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';

/* Public-domain monster archetypes, original names and looks. led: how the name fits the ribbon board. */
const BOSSES = [
  { id: "pumpkin", name: "SIR GOURDSWORTH", sub: "The Pumpkin Knight", hp: 40, hw: 30, speed: 0.7, amp: 90, col: "#ff8a3d", par: 14, led: "SIR GOURDSWORTH" },
  { id: "count", name: "COUNT FANGWORTH", sub: "Up past his bedtime", hp: 50, hw: 26, speed: 0.9, amp: 110, col: "#b98cff", par: 20, led: "COUNT FANGWORTH" },
  { id: "wolf", name: "WOLFGANG HOWLBERT", sub: "Full moon, short fuse", hp: 60, hw: 30, speed: 1.1, amp: 120, col: "#e0a46a", par: 22, led: "WOLFGANG HOWLBERT" },
  { id: "mummy", name: "PHARAOH WRAPSODY", sub: "Four thousand years of bad mood", hp: 70, hw: 26, speed: 0.8, amp: 110, col: "#f2e6bd", par: 24, led: "PHARAOH WRAPSODY" },
  { id: "giant", name: "LUGNUT", sub: "The Patchwork Giant", hp: 80, hw: 32, speed: 0.75, amp: 100, col: "#8fc6e0", par: 26, led: "LUGNUT" },
  { id: "witch", name: "HAGATHA BREWSWORTH", sub: "Brews, flies, holds grudges", hp: 90, hw: 28, speed: 0.85, amp: 120, col: "#9bff3f", par: 28, led: "HAGATHA BREWSWORTH" },
  { id: "horse", name: "THE HEADLESS HAYRIDER", sub: "Final reel", hp: 100, hw: 34, speed: 1.1, amp: 130, col: ORANGE, par: 34, led: "HEADLESS HAYRIDER" }
];

let S = {}, keys = {}, idleT = 0, parts = [], floats = [];
let THREE = null, R = null;                              // R holds everything the renderer owns
const dbg = /[?&]debug=1/.test(location.search);
// V is how things are being shown (poses, the trip out of the TV and back in). It never feeds the rules.
const V = { cycle: 0, atkT: 9, hitT: 9, hurtT: 9, koFrom: null, koT: 0, introBoss: -1, lastPhase: "", idleBoss: -1, idleSwap: 0, deadT: 0 };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function comma(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function rw() { return window.NPRewards; }
function unlock(id) { if (window.Trophies) window.Trophies.unlock(id); }
function rnd(a, b) { return a + Math.random() * (b - a); }
// The picture rolls its own dice (sparkle, shake, flicker), so the rules see the same random numbers the 2D game would.
const vrand = (function () { let s = 0x2545F491; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; })();

/* =====================================================================================
   Rules (the 2D game's, untouched apart from the hooks marked "show:")
   ===================================================================================== */
function reset() {
  S = { t: 0, x: W / 2, tx: W / 2, vx: 0, hearts: HEARTS, inv: 0, fireT: 0, score: 0, bi: 0, phase: "intro", pt: 0,
        shots: [], foes: [], cols: [], bands: [], puddles: [], strikes: [], bt: 0, hitsThis: 0, noHitRun: 0, noHitBest: 0,
        beaten: 0, fastest: 99, clearTime: null, crits: 0, hitsTaken: 0, lastHp: 1, done: false, walk: 0, combo: 0 };
  parts.length = 0; floats.length = 0; keys = {};
  V.koFrom = null; V.deadT = 0; V.hurtT = 9; V.hitT = 9; V.atkT = 9; V.cycle = 0;
  ledClear();
  startBoss(0);
}
function startBoss(i) {
  const b = BOSSES[i];
  S.bi = i; S.phase = "intro"; S.pt = 0; S.bt = 0; S.hitsThis = 0;
  S.boss = { d: b, hp: b.hp, x: W / 2, y: -60, atkT: 1.2, open: 0, shield: 0, flash: 0, cycle: 0, hpShow: b.hp, dir: 1, ph: 0 };
  S.foes.length = 0; S.cols.length = 0; S.bands.length = 0; S.puddles.length = 0; S.strikes.length = 0; S.shots.length = 0;
  V.cycle = 0; V.koFrom = null;
  if (i > 0) bossIntroFX(i);                                // show: the first monster's intro plays from the start hooks
}
function rage() { const b = S.boss; return 1 - b.hp / b.d.hp; }   // 0 fresh, 1 nearly KO

/* ---------------- Attacks: one distinct pattern per monster ---------------- */
function attack() {
  const b = S.boss, id = b.d.id, r = rage();
  let i;
  b.cycle++;
  if (id === "pumpkin") {               // seed spread
    const n = r > 0.5 ? 5 : 3;
    for (i = 0; i < n; i++) { const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.32; S.foes.push({ k: "seed", x: b.x, y: b.y + 24, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, r: 6 }); }
    b.atkT = 1.5 - r * 0.4;
  } else if (id === "count") {          // bats aimed at you
    const nb = r > 0.55 ? 2 : 1;
    for (i = 0; i < nb; i++) { const tx = S.x + (i ? rnd(-60, 60) : 0), dx = tx - b.x, dy = HERO_Y - b.y, L = Math.sqrt(dx * dx + dy * dy), v = 170 + r * 60;
      S.foes.push({ k: "bat", x: b.x, y: b.y + 10, vx: dx / L * v, vy: dy / L * v, r: 8, p: Math.random() * 6 }); }
    b.atkT = 1.05 - r * 0.3;
    if (b.cycle % 4 === 0) b.shield = 1.4;   // cape up: candy bounces off
  } else if (id === "wolf") {           // claw columns, warned in red first
    const cw = 64, nc = r > 0.5 ? 2 : 1, used = [];
    for (i = 0; i < nc; i++) { const cx = i === 0 ? clamp(S.x + rnd(-20, 20), cw / 2, W - cw / 2) : clamp((S.x < W / 2 ? S.x + rnd(80, 150) : S.x - rnd(80, 150)), cw / 2, W - cw / 2);
      S.cols.push({ x: cx, w: cw, warn: 0.85 - r * 0.15, t: 0, hot: 0.25 }); used.push(cx); }
    b.atkT = 1.55 - r * 0.4;
  } else if (id === "mummy") {          // bandage wall with one gap
    const gw = 84 - r * 14, gx = clamp(rnd(gw / 2 + 6, W - gw / 2 - 6), gw / 2 + 6, W - gw / 2 - 6);
    S.bands.push({ y: b.y + 30, gx: gx, gw: gw, vy: 110 + r * 50 });
    b.atkT = 2.1 - r * 0.6;
  } else if (id === "giant") {          // lightning that chases where you were
    S.strikes.push({ x: S.x, t: 0, warn: 0.75 - r * 0.15, w: 34 });
    if (r > 0.6) S.foes.push({ k: "bolt", x: b.x, y: b.y + 26, vx: 0, vy: 200, r: 6 });
    b.atkT = 1.0 - r * 0.3;
  } else if (id === "witch") {          // potions lobbed at you, leave a puddle
    const land = clamp(S.x + rnd(-24, 24), 20, W - 20), tt = 1.3 - r * 0.2;
    S.foes.push({ k: "potion", x: b.x, y: b.y + 14, sx: b.x, sy: b.y + 14, lx: land, tt: tt, t: 0, r: 7 });
    b.atkT = 1.5 - r * 0.4;
  } else {                              // Hayrider: remix of everything, faster
    const m = b.cycle % 3;
    if (m === 0) { const hx = clamp(S.x, 32, W - 32); S.cols.push({ x: hx, w: 64, warn: 0.75 - r * 0.15, t: 0, hot: 0.25 }); }
    else if (m === 1) { for (i = 0; i < 3; i++) { const aa = Math.PI / 2 + (i - 1) * 0.36; S.foes.push({ k: "head", x: b.x, y: b.y + 20, vx: Math.cos(aa) * 135, vy: Math.sin(aa) * 135, r: 8 }); } }
    else { const ddx = S.x - b.x, ddy = HERO_Y - b.y, LL = Math.sqrt(ddx * ddx + ddy * ddy); S.foes.push({ k: "head", x: b.x, y: b.y + 20, vx: ddx / LL * 185, vy: ddy / LL * 185, r: 8 }); }
    b.atkT = 1.3 - r * 0.35;
  }
  // After every few attacks the monster runs out of steam: OPEN window (CRITs)
  if (b.cycle % 3 === 0) { b.open = 1.4; b.atkT += 1.2; openFX(); }
}

/* ---------------- Update ---------------- */
function update(dt) {
  S.t += dt; S.pt += dt;
  const k = (keys.ArrowLeft || keys.KeyA ? -1 : 0) + (keys.ArrowRight || keys.KeyD ? 1 : 0);
  if (k) S.tx = clamp(S.tx + k * 340 * dt, 14, W - 14);
  const mv = clamp(S.tx - S.x, -900 * dt, 900 * dt);
  S.x += mv; S.vx = mv / Math.max(dt, 1e-4); S.walk += Math.abs(mv) * 0.12;
  S.inv = Math.max(0, S.inv - dt);
  const b = S.boss;
  let i;
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
  if (S.fireT <= 0) { S.fireT = FIRE; S.shots.push({ x: S.x, y: HERO_Y - 18, r: 0 }); if (Math.random() < 0.35) Shell.tone(1400, 0.015, "square", 0.04); }
  for (i = S.shots.length - 1; i >= 0; i--) {
    const s = S.shots[i]; s.y -= SHOT_V * dt; s.r += dt * 14;
    if (s.y < b.y + 28 && s.y > b.y - 40 && Math.abs(s.x - b.x) < b.d.hw) { S.shots.splice(i, 1); hitBoss(s); if (S.phase !== "fight") return; continue; }
    if (s.y < 20) S.shots.splice(i, 1);
  }

  // monster attacks
  for (i = S.foes.length - 1; i >= 0; i--) {
    const f = S.foes[i];
    if (f.k === "potion") {
      f.t += dt; const q = Math.min(1, f.t / f.tt);
      f.x = f.sx + (f.lx - f.sx) * q; f.y = f.sy + (FLOOR - 6 - f.sy) * q - Math.sin(q * Math.PI) * 90;
      if (q >= 1) { S.foes.splice(i, 1); S.puddles.push({ x: f.lx, w: 46, t: 0, life: 1.4 }); sparkle(f.lx, HERO_Y, 6, 8, ["#9bff3f", "#5aff9a"]); Shell.noise(0.15, 0.2, 900, 1); continue; }
    } else {
      f.x += f.vx * dt; f.y += f.vy * dt; if (f.p != null) f.p += dt * 16;
    }
    if (f.y > H + 20 || f.x < -30 || f.x > W + 30) { S.foes.splice(i, 1); continue; }
    if (f.k !== "potion" && Math.abs(f.x - S.x) < HERO_HW + f.r * 0.7 && f.y > HERO_Y - 26 - f.r * 0.5 && f.y < FLOOR) { S.foes.splice(i, 1); hurt(); if (S.phase !== "fight") return; }
  }
  for (i = S.cols.length - 1; i >= 0; i--) {
    const c = S.cols[i]; c.t += dt;
    if (c.t > c.warn && !c.fired) { c.fired = true; Shell.noise(0.12, 0.35, 2400, 0.8); Shell.shake(3, 0.12); camShake(3, 0.15); }
    if (c.fired && c.t < c.warn + c.hot && Math.abs(S.x - c.x) < c.w / 2 + HERO_HW - 4) hurt();
    if (c.t > c.warn + c.hot + 0.15) S.cols.splice(i, 1);
    if (S.phase !== "fight") return;
  }
  for (i = S.bands.length - 1; i >= 0; i--) {
    const bd = S.bands[i]; bd.y += bd.vy * dt;
    if (bd.y > HERO_Y - 28 && bd.y < HERO_Y + 4 && !bd.hit && Math.abs(S.x - bd.gx) > bd.gw / 2 - HERO_HW + 2) { bd.hit = true; hurt(); if (S.phase !== "fight") return; }
    if (bd.y > H) S.bands.splice(i, 1);
  }
  for (i = S.strikes.length - 1; i >= 0; i--) {
    const st = S.strikes[i]; st.t += dt;
    if (st.t > st.warn && !st.fired) { st.fired = true; Shell.noise(0.2, 0.4, 3000, 0.5); Shell.tone(90, 0.2, "sawtooth", 0.2); camShake(4, 0.2); if (Math.abs(S.x - st.x) < st.w / 2 + HERO_HW - 3) { hurt(); if (S.phase !== "fight") return; } }
    if (st.t > st.warn + 0.25) S.strikes.splice(i, 1);
  }
  for (i = S.puddles.length - 1; i >= 0; i--) {
    const pd = S.puddles[i]; pd.t += dt;
    if (pd.t < 0.6 && Math.abs(S.x - pd.x) < pd.w / 2 + HERO_HW - 6) { hurt(); if (S.phase !== "fight") return; }
    if (pd.t > pd.life) S.puddles.splice(i, 1);
  }
  tick(dt);
}

function hitBoss(s) {
  const b = S.boss;
  if (b.shield > 0) { pop("BLOCKED", s.x, b.y, 70, "#c9cbd6"); Shell.tone(300, 0.03, "square", 0.08); return; }
  const crit = b.open > 0, dmg = crit ? 2 : 1;
  b.hp = Math.max(0, b.hp - dmg); b.flash = 0.08;
  S.score += crit ? 25 : 10;
  S.combo++;
  V.hitT = 0;                                               // show: the monster flinches
  if (crit) { S.crits++; pop("CRIT!", s.x + rnd(-10, 10), b.y, 96, "#ffd23f"); sparkle(s.x, b.y, 64, 5, ["#ffd23f", "#fff3b0"]); Shell.tone(1100, 0.04, "square", 0.14); }
  else { sparkle(s.x, b.y, 64, 2, [b.d.col, "#eceae2"]); if (Math.random() < 0.5) Shell.tone(620 + Math.random() * 80, 0.03, "triangle", 0.12); }
  if (S.combo === 10 || S.combo === 25 || S.combo === 50 || S.combo === 80) {
    if (rw()) rw().streak(S.combo, S.combo + " HIT COMBO", S.combo >= 50 ? "#ff4b3e" : S.combo >= 25 ? ORANGE : "#3ff0ff");
    comboFX(S.combo);                                       // show
  }
  if (b.hp <= 0) ko();
}

function ko() {
  const b = S.boss, t = S.bt, d = b.d;
  S.phase = "ko"; S.pt = 0; S.beaten++;
  S.foes.length = 0; S.cols.length = 0; S.bands.length = 0; S.strikes.length = 0; S.puddles.length = 0; S.shots.length = 0;
  const noHit = S.hitsThis === 0, timeB = Math.max(0, Math.round((d.par - t) * 25)), bonus = 250 * (S.bi + 1) + timeB + (noHit ? 400 : 0);
  S.score += bonus; S.lastKO = { t: t, noHit: noHit, bonus: bonus, timeB: timeB };
  if (t < S.fastest) S.fastest = t;
  if (noHit) { S.noHitRun++; S.noHitTotal = (S.noHitTotal || 0) + 1; if (S.noHitRun > S.noHitBest) S.noHitBest = S.noHitRun; } else S.noHitRun = 0;
  Shell.flash("K.O.!", d.name + (noHit ? " | NO HIT +400" : ""), noHit ? "#9bff3f" : "#ffd23f", 1700);
  Shell.sfx("best"); Shell.shake(8, 0.45); Shell.noise(0.5, 0.4, 700, 0.6);
  sparkle(b.x, b.y, 70, 40, [d.col, "#ffd23f", "#eceae2", ORANGE]);
  if (rw()) { rw().burst(null, null, 40); }
  unlock("cfk-" + d.id);
  if (noHit) unlock("cfk-nohit");
  if (S.noHitBest >= 3) unlock("cfk-nohit3");
  if (S.bi >= 1 && t < 15) unlock("cfk-fast");
  if (d.id === "horse") {
    S.clearTime = S.t;
    if (noHit) unlock("cfk-horse-clean");
    if (S.t < 165) unlock("cfk-rewind");
  }
  koFX(noHit, bonus);                                       // show
}

function hurt() {
  if (S.inv > 0 || S.phase !== "fight") return;
  S.hearts--; S.hitsThis++; S.hitsTaken++; S.inv = IFRAMES; S.combo = 0; S.noHitRun = 0;
  Shell.sfx("hit"); Shell.tone(160, 0.25, "sawtooth", 0.25, 70); Shell.shake(7, 0.3);
  sparkle(S.x, HERO_Y, 44, 12, ["#ff4b3e", "#eceae2"]);
  V.hurtT = 0;                                              // show
  if (S.hearts <= 0) {
    S.phase = "dead"; S.pt = 0; S.lastHp = S.boss.hp / S.boss.d.hp;
    Shell.flash("THE END?", "Rewind and try again", "#ff4b3e", 1300);
    Shell.sfx("over");
    hurtFX(true);
  } else { Shell.flash("OUCH", S.hearts + (S.hearts === 1 ? " candy bar left" : " candy bars left"), "#ff4b3e", 700); hurtFX(false); }
}

function tick(dt) {
  for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.t += dt; if (q.t >= q.life) { parts.splice(i, 1); continue; } q.vy += 260 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
  for (let i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; floats[i].y -= 30 * dt; if (floats[i].t > 0.7) floats.splice(i, 1); }
}
// Sparks and pop-up words start where things are in the room (x, y on the floor, h above it) and fly on the HUD layer.
function sparkle(x, y, h, n, cols) {
  if (Shell.reduced) n = Math.min(n, 4);
  const p = toScreen(x, y, h);
  for (let i = 0; i < n; i++) { const a = vrand() * TAU, v = 50 + vrand() * 170; parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, life: 0.4 + vrand() * 0.5, c: cols[i % cols.length], s: vrand() < 0.3 ? 3 : 2 }); }
}
function pop(s, x, y, h, c) { if (floats.length < 14) { const p = toScreen(x, y, h); floats.push({ s: s, x: p.x, y: p.y, c: c, t: 0 }); } }

function finish(cleared) {
  if (S.done) return;
  S.done = true;
  const b = S.boss, pct = Math.max(1, Math.round(b.hp / b.d.hp * 100));
  const stats = { score: S.score, beaten: S.beaten, cleared: cleared, clearTime: cleared ? Math.round(S.clearTime) : undefined, fastest: S.fastest,
                  noHitBest: S.noHitBest, hitsTaken: S.hitsTaken, crits: S.crits, lastBoss: b.d.id, lastHpPct: cleared ? 0 : pct };
  let html = "";
  if (!cleared && pct < 100) {
    const name = b.d.name.toLowerCase().replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); });
    html += '<p class="npr-close" style="color:#ff8a1f">' + (pct <= 25 ? "So close! " : "") + name + " had " + pct + "% HP left.</p>";
  }
  html += '<p class="np-extra">Monsters beaten ' + S.beaten + '/7 | crits ' + S.crits + (cleared ? ' | marathon ' + mmss(S.clearTime) : '') + '</p>';
  finishFX(cleared, S.score);                               // show
  Shell.gameOver(S.score, { title: cleared ? "MARATHON COMPLETE" : "THE END?", html: html, stats: stats });
}
function mmss(t) { t = Math.round(t); return Math.floor(t / 60) + ":" + ("0" + (t % 60)).slice(-2); }

/* ---------------- Input ---------------- */
// Drag or move anywhere: the collector slides to the spot on his own row of the floor that sits under your finger.
function pointer(type, x) { if (type === "down" || type === "move") S.tx = clamp(rowX(x), 14, W - 14); }
function key(type, code) { keys[code] = type === "down"; }

/* ---------------- Show: what the board, the band and the camera do at the big moments ---------------- */
function bossIntroFX(i) {
  const d = BOSSES[i];
  ledPlay([ledMsg("slide", "MONSTER " + (i + 1) + " OF 7", 1.1, { color: "white" }), ledMsg("cycle", d.led, 2.4)]);
  Juke.sfx("intro", i);
}
function openFX() { ledPlay([ledMsg("blink", "OPEN! CRITS X2", 1.4, { color: "yellow" })]); Juke.sfx("open"); }
function comboFX(n) { ledPlay([ledMsg("slide", n + " HIT COMBO", 1.4, { color: n >= 50 ? "red" : n >= 25 ? "orange" : "cyan" })]); Juke.sfx("combo", n); }
function hurtFX(dead) {
  ledPlay([ledMsg("blink", dead ? "THE END?" : "OUCH", dead ? 2.5 : 1.0, { color: "red" })]);
  Juke.sfx(dead ? "dead" : "hurt");
  camShake(dead ? 9 : 6, 0.3);
}
function koFX(noHit, bonus) {
  const list = [ledMsg("flash", "K.O.!", 1.4)];
  if (noHit) list.push(ledMsg("cycle", "NO HIT +400", 1.3));
  list.push(ledMsg("count", "SCORE", 1.8, { from: Math.max(0, S.score - bonus), value: S.score }));
  ledPlay(list);
  Juke.sfx("ko", noHit ? 1 : 0);
  camShake(7, 0.45);
  V.koFrom = null;
}
function finishFX(cleared, score) {
  if (cleared) { ledPlay([ledMsg("cycle", "MARATHON COMPLETE", 2.4)], true); Juke.sfx("clear"); }
  ledPlay([ledMsg("count", "FINAL", 7, { from: score, value: score, final: true, wait: 0.2 })], true);
}

/* =====================================================================================
   Sound: the late-show band, and a few stingers for the big moments
   =====================================================================================
   The shell still plays every sound effect the 2D game had, exactly when it did. On top of that the game
   brings its own small synth, all made in code with the Web Audio API (no audio files):

   startMusic(ctx, dest) is the band on its own: an original sixteen-bar loop in D minor (organ pad, square
   lead with an echo, bouncing bass, arpeggio, drums). Hand it any AudioContext and any node to play into
   and it starts; it returns a stop function. It knows nothing about the game, so it can be lifted out
   as it is (for a radio station later, say).

   Juke is the game's side of it: it makes the AudioContext only after the first tap, click or key press,
   starts and stops the band with the game (playing, paused, over), follows the shell's mute button,
   keeps the MUSIC: ON / OFF choice in localStorage, and plays the stingers. */

function startMusic(ctx, dest) {
  const BPM = 138, STEP = 60 / BPM / 4, STEPS = 256, AHEAD = 0.5;
  // bass note, then the three notes the arpeggio and the organ use (MIDI numbers)
  const CH = { Dm: [38, 62, 65, 69], Bb: [34, 58, 62, 65], C: [36, 60, 64, 67], Gm: [43, 58, 62, 67], A: [45, 57, 61, 64] };
  // one chord per half bar
  const PROG = ("Dm Dm Dm Dm Bb Bb C C Dm Dm Dm Dm Gm Gm A A " +
                "Gm Gm Dm Dm Bb Bb A A Gm Gm Dm Dm Bb A A A").split(" ");
  // the tune, a bar a line: step in the bar, note, length in sixteenth notes
  const BARS = [
    "0D5-2 2F5-2 4A5-3 7G5-1 8F5-2 10E5-2 12D5-4",
    "0A5-3 3G5-1 4F5-2 6E5-2 8D5-4 12A4-4",
    "0Bb4-2 2D5-2 4F5-3 7Bb5-1 8A5-2 10G5-2 12F5-4",
    "0E5-2 2G5-2 4C6-4 8Bb5-2 10A5-2 12G5-2 14E5-2",
    "0D5-2 2F5-2 4A5-3 7G5-1 8F5-2 10A5-2 12D6-4",
    "0C6-2 2A5-2 4F5-2 6A5-2 8D5-6 14E5-2",
    "0G5-2 2Bb5-2 4D6-3 7C6-1 8Bb5-2 10A5-2 12G5-4",
    "0A5-4 4C#6-2 6E6-2 8A5-2 10G5-2 12E5-2 14C#5-2",
    "0D6-6 6Bb5-2 8G5-4 12D5-4",
    "0F5-2 2A5-2 4D6-4 8C6-2 10A5-2 12F5-4",
    "0F5-2 2Bb5-2 4D6-2 6F6-2 8E6-2 10D6-2 12Bb5-4",
    "0C#6-4 4E6-2 6C#6-2 8A5-4 12E5-4",
    "0G5-1 1A5-1 2Bb5-2 4D6-2 6Bb5-2 8G5-2 10A5-2 12Bb5-4",
    "0A5-1 1Bb5-1 2A5-2 4F5-2 6D5-2 8F5-2 10A5-2 12D6-4",
    "0D6-2 2C6-2 4Bb5-2 6A5-2 8C#6-2 10E6-2 12A6-4",
    "0G6-2 2F6-2 4E6-2 6D6-2 8C#6-4 12A5-2 14E5-2"
  ];
  const lead = new Array(STEPS).fill(null), SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  BARS.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])([#b]?)(\d)-(\d+)$/.exec(tok);
      if (m) lead[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + SEMI[m[2]] + (m[3] === "#" ? 1 : m[3] === "b" ? -1 : 0), Number(m[5])];
    });
  });
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // the band's own little mixer
  const out = ctx.createGain(); out.gain.value = 0; out.connect(dest);
  function filt(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const leadBus = filt("lowpass", 2600, 0.7, out), bassBus = filt("lowpass", 720, 1.4, out), padBus = filt("lowpass", 950, 0.8, out);
  const send = ctx.createGain(), echo = ctx.createDelay(1), back = ctx.createGain(), damp = filt("lowpass", 2000, 0.7, out);
  send.gain.value = 0.28; echo.delayTime.value = STEP * 3; back.gain.value = 0.3;          // a dotted-eighth echo on the lead
  leadBus.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(damp);
  const lfo = ctx.createOscillator(), lfoAmt = ctx.createGain();                         // a slow wobble on the lead, for the late-show shiver
  lfo.frequency.value = 5.2; lfoAmt.gain.value = 9; lfo.connect(lfoAmt); lfo.start();
  let seed = 7;
  const len = Math.floor(ctx.sampleRate), noise = ctx.createBuffer(1, len, ctx.sampleRate), nd = noise.getChannelData(0);
  for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; nd[i] = seed / 1073741823.5 - 1; }

  function tone(to, type, f0, t, dur, vol, f1, hold, wob) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.55 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (wob) lfoAmt.connect(o.detune);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.03);
    o.onended = function () { try { if (wob) lfoAmt.disconnect(o.detune); g.disconnect(); } catch (e) { /* already gone */ } };
  }
  function hiss(t, dur, vol, type, f0, q) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true; f.type = type; f.frequency.value = f0; f.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, (t * 7.31) % 0.8); s.stop(t + dur + 0.05);
  }
  function organ(t, notes, dur) {                           // a spooky organ under each half bar: two saws a hair apart per note
    for (let i = 0; i < notes.length; i++) {
      [-6, 6].forEach(function (cents) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sawtooth"; o.frequency.value = hz(notes[i] - 12); o.detune.value = cents;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03, t + 0.12);
        g.gain.setValueAtTime(0.03, t + dur - 0.08); g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(padBus); o.start(t); o.stop(t + dur + 0.02);
      });
    }
  }

  function play(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[i >> 3]], second = bar >= 8, n = lead[i];
    if (s === 0 || s === 8) organ(t, ch.slice(1), STEP * 8);
    if (n) { tone(leadBus, "square", hz(n[0]), t, n[1] * STEP * 0.92, 0.17, 0, 0.6, true); tone(leadBus, "triangle", hz(n[0] - 12), t, n[1] * STEP * 0.9, 0.07, 0, 0.5); }
    if (!(s & 1)) {                                         // eighth notes: a bass that bounces octaves, then leans on the fifth
      const k = s >> 1, off = [0, 12, 0, 12, 7, 12, 10, 12][k];
      tone(bassBus, "sawtooth", hz(ch[0] + off), t, STEP * 1.6, 0.3, 0, 0.4);
      hiss(t, s === 14 ? 0.12 : 0.035, s % 4 === 2 ? 0.09 : 0.05, "highpass", 7600, 0.7);
    }
    const arpOn = second ? true : !(s & 1);                 // the arpeggio doubles up in the second half
    if (arpOn) tone(out, "triangle", hz(ch[1 + [0, 1, 2, 1][(s >> (second ? 0 : 1)) & 3]] + 12), t, STEP * 1.2, 0.06, 0, 0.3);
    const fill = bar === 7 ? s >= 12 : bar === 15 ? s >= 8 && (s % 2 === 0 || s >= 12) : false;
    if (fill || s === 4 || s === 12) {
      const v = fill ? 0.5 + 0.5 * (s - 8) / 7 : 1;
      hiss(t, 0.14, 0.3 * v, "bandpass", 1800, 0.6);
      tone(out, "triangle", fill ? 260 - (s - 8) * 14 : 190, t, 0.08, 0.2 * v, 120, 0.1);
    }
    if (s === 0 || s === 8 || (s === 10 && !second) || (second && s === 4 && bar % 2)) tone(out, "sine", 150, t, 0.16, 0.6, 42, 0.08);
    if (second && s === 0) tone(out, "sine", hz(ch[3] + 24), t, 1.1, 0.05, 0, 0.05);   // a little bell on each bar, second time round
  }

  let step = 0, nextT = ctx.currentTime + 0.06, alive = true;
  out.gain.setValueAtTime(0, ctx.currentTime); out.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 0.1);   // headroom: peaks stay under full scale
  function pump() {
    if (!alive) return;
    const now = ctx.currentTime;
    if (nextT < now) nextT = now + 0.03;                    // only after a stall longer than the queue
    while (nextT < now + AHEAD) { play(step, nextT); step = (step + 1) % STEPS; nextT += STEP; }
  }
  const timer = setInterval(pump, 50);
  pump();
  return function stop() {
    if (!alive) return;
    alive = false; clearInterval(timer);
    const t = ctx.currentTime;
    out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + 0.12);
    setTimeout(function () { try { lfo.stop(); out.disconnect(); } catch (e) { /* already gone */ } }, (AHEAD + 0.3) * 1000);
  };
}

const MUSIC_VOL = 0.22, SFX_VOL = 0.2;                     // turn the band or the stingers up and down here
const MUSIC_KEY = "npArcade.music";                         // the same MUSIC: ON / OFF setting the other 3D games remember

const Juke = (function () {
  let live = null, dead = false, muted = false, stopBand = null, waitT = 0, fresh = true;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  const buttons = [];

  function rig(c) {
    const A = { c: c };
    A.out = c.createGain();                                 // follows the mute button
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    A.out.connect(comp); comp.connect(c.destination);
    A.music = c.createGain(); A.music.gain.value = MUSIC_VOL;
    A.duck = c.createGain();                                // the band steps back for a second under a big stinger
    A.music.connect(A.duck); A.duck.connect(A.out);
    A.sfx = c.createGain(); A.sfx.gain.value = SFX_VOL; A.sfx.connect(A.out);
    const len = Math.floor(c.sampleRate);
    A.noise = c.createBuffer(1, len, c.sampleRate);
    const d = A.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = vrand() * 2 - 1;
    return A;
  }
  function osc(A, type, f0, t, dur, vol, f1, hold) {
    const o = A.c.createOscillator(), g = A.c.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.55 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.sfx); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(A, t, dur, vol, type, f0, q) {
    const s = A.c.createBufferSource(), f = A.c.createBiquadFilter(), g = A.c.createGain();
    s.buffer = A.noise; s.loop = true; f.type = type; f.frequency.value = f0; f.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(A.sfx); s.start(t, vrand() * 0.5); s.stop(t + dur + 0.05);
  }
  function mt(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function duck(A, t, secs) {
    A.duck.gain.cancelScheduledValues(t);
    A.duck.gain.setTargetAtTime(0.45, t, 0.03);
    A.duck.gain.setTargetAtTime(1, t + secs, 0.25);
  }
  // The stingers. x is a detail of the moment (which monster, a clean K.O., how long the combo is).
  function cue(A, name, t, x) {
    if (name === "intro") {                                 // the monster climbs out: a gong, an organ swell, a ghostly slide
      osc(A, "sine", 55, t, 1.8, 0.5, 0, 0.05); osc(A, "sine", 110.6, t, 1.4, 0.22, 0, 0.05);
      [50, 53, 56, 60].forEach(function (m) { osc(A, "sawtooth", mt(m + (x || 0) % 3), t + 0.05, 1.3, 0.06, 0, 0.6); });
      osc(A, "sine", 330, t + 0.2, 1.1, 0.12, 660, 0.7);
      duck(A, t, 1.3);
    } else if (name === "open") {                           // worn out: a chime up the scale
      [81, 85, 88, 93].forEach(function (m, i) { osc(A, "triangle", mt(m), t + i * 0.05, 0.22, 0.2, 0, 0.3); });
    } else if (name === "combo") {
      const top = x >= 50 ? 98 : x >= 25 ? 93 : 88;
      [top - 12, top - 8, top - 5, top].forEach(function (m, i) { osc(A, "square", mt(m), t + i * 0.045, 0.09, 0.16, 0, 0.5); });
    } else if (name === "hurt") {
      osc(A, "sawtooth", 230, t, 0.32, 0.18, 85, 0.3);
    } else if (name === "dead") {                           // the tape runs out: a slow slide down and a low organ
      osc(A, "sawtooth", 196, t, 1.2, 0.18, 55, 0.6);
      [38, 41, 44].forEach(function (m) { osc(A, "sawtooth", mt(m), t + 0.1, 1.4, 0.08, 0, 0.6); });
      duck(A, t, 1.6);
    } else if (name === "ko") {                             // K.O.: a bell, a run up the chord, a held one on top
      [1, 2.76, 5.4].forEach(function (k, i) { osc(A, "sine", 523 * k, t, 0.9 - i * 0.2, 0.22 / (i + 1), 0, 0.03); });
      const up = x ? [74, 78, 81, 86, 90, 93, 98] : [74, 78, 81, 86, 90], te = t + 0.12 + up.length * 0.06;
      up.forEach(function (m, i) { osc(A, "square", mt(m), t + 0.12 + i * 0.06, 0.1, 0.2, 0, 0.5); });
      [86, 90, 93].forEach(function (m) { osc(A, "triangle", mt(m + (x ? 12 : 0)), te, 0.6, 0.17, 0, 0.3); });
      hiss(A, t, 0.6, 0.35, "bandpass", 1200, 0.5);
      duck(A, t, 1.8);
    } else if (name === "clear") {                          // marathon complete: a fanfare
      [[74, 0], [78, 0.12], [81, 0.24], [86, 0.36], [81, 0.6], [86, 0.72], [90, 0.84]].forEach(function (n) { osc(A, "square", mt(n[0]), t + n[1], 0.2, 0.2, 0, 0.6); });
      [74, 78, 81, 86].forEach(function (m) { osc(A, "triangle", mt(m), t + 1.0, 1.2, 0.12, 0, 0.5); });
      duck(A, t, 2.4);
    }
  }

  function shellMuted() {
    const b = document.getElementById("np-mute");
    if (b) return b.getAttribute("aria-pressed") === "true";
    try { return localStorage.getItem("npArcade.muted") === "1"; } catch (e) { return false; }
  }
  // Browsers only let sound start from a tap, a click or a key press, so this is called from those and nowhere else.
  function unlock() {
    if (dead) return;
    try {
      if (!live) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        live = rig(new AC());
        muted = shellMuted();
        live.out.gain.value = muted ? 0 : 1;
      }
      if (live.c.state !== "running") { const p = live.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { live = null; dead = true; }
  }
  function halt() { if (stopBand) { stopBand(); stopBand = null; } waitT = 0; }
  // Called every frame: follow the mute button, and start or stop the band with the game.
  function pump() {
    const A = live;
    if (!A || !window.Shell) return;
    const c = A.c, m = shellMuted();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, c.currentTime, 0.02); }
    const want = musicOn && !muted && c.state === "running" && Shell.state() === "playing";
    if (!want) { halt(); return; }
    if (stopBand) return;
    const now = performance.now();
    if (!waitT) waitT = now + (fresh ? 450 : 60);           // a fresh game lets the shell's start jingle go first
    if (now >= waitT) { fresh = false; waitT = 0; try { stopBand = startMusic(c, A.music); } catch (e) { dead = true; } }
  }
  function sfx(name, x, delay) {
    const A = live;
    if (!A || muted || A.c.state !== "running") return;
    try { cue(A, name, A.c.currentTime + 0.01 + (delay || 0), x); } catch (e) { /* sound is never worth a crash */ }
  }
  function label() {
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      if (b.npIcon) { b.innerHTML = musicOn ? NOTE_ICON : NOTE_OFF_ICON; b.setAttribute("aria-label", musicOn ? "Turn music off" : "Turn music on"); }
      else b.textContent = musicOn ? "MUSIC: ON" : "MUSIC: OFF";
      b.setAttribute("aria-pressed", musicOn ? "true" : "false");
    }
  }
  function setMusic(on) {
    musicOn = !!on;
    try { localStorage.setItem(MUSIC_KEY, musicOn ? "1" : "0"); } catch (e) { /* private mode */ }
    label(); pump();
  }
  // A "MUSIC: ON / OFF" button in the shell's own button style (title and pause cards), or a note icon for the top bar.
  function button(parent, before, icon) {
    if (!parent) return;
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("data-np-music", "");
    if (icon) { b.className = "np-icon"; b.id = "np-music"; b.npIcon = true; }
    else { b.className = "np-btn"; b.style.cssText = "width:100%;margin-top:8px"; }
    b.addEventListener("click", function (e) {             // never a "tap to start", and hand the keys back to the game
      e.stopPropagation(); unlock(); setMusic(!musicOn);
      if (icon && e.detail > 0 && Shell.state() === "playing") { const cv = document.getElementById("np-canvas"); if (cv) try { cv.focus({ preventScroll: true }); } catch (er) { cv.focus(); } }
    });
    parent.insertBefore(b, before || null);
    buttons.push(b); label();
  }
  return {
    unlock: unlock, pump: pump, sfx: sfx, button: button,
    newGame: function () { unlock(); halt(); fresh = true; pump(); },
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    peek: function () { return { made: !!live, state: live ? live.c.state : "none", playing: !!stopBand, muted: muted, musicOn: musicOn }; }
  };
})();
const NOTE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 4l11-2v13.2a3.3 3.3 0 1 1-2-3V6.3L11 7.6v9.6a3.3 3.3 0 1 1-2-3z"/></svg>';
const NOTE_OFF_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" opacity=".45" d="M9 4l11-2v13.2a3.3 3.3 0 1 1-2-3V6.3L11 7.6v9.6a3.3 3.3 0 1 1-2-3z"/><path fill="none" stroke="currentColor" stroke-width="2.4" d="M3 3l18 18"/></svg>';

/* =====================================================================================
   3D presentation
   ===================================================================================== */

// The living room, in logical units. A logical point (x, y) is three.js (x - 180, height, y - 300).
const CX = 180, CZ = 300;
const ROOM_X = 212, BACK_Z = -392, FRONT_Z = 300, ROOM_H = 300;
const TV_Z = -306, TV_W = 168, TV_H = 92, CAB_H = 30, SCREEN_Y = CAB_H + 45;  // the console TV the monsters climb out of
const LED_H = 54, LED_Y = 169, LED_ROWS = 18;                                     // ribbon board on the back wall: lit height, center height
const HERO_K = 13;                                                              // the collector: units per foot (drawn a little over life size so he reads on a phone)
const CAM = { y: 780, z: 720, ty: 0, tz: -210, fov: 32 };
function X(x) { return x - CX; }
function Z(y) { return y - CZ; }

function rng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mkCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function shade(hex, k) {                                   // k > 0 toward white, k < 0 toward black
  const n = parseInt(hex.slice(1), 16), t = k < 0 ? 0 : 255, a = Math.abs(k);
  const r = Math.round(((n >> 16) & 255) * (1 - a) + t * a), g = Math.round(((n >> 8) & 255) * (1 - a) + t * a), b = Math.round((n & 255) * (1 - a) + t * a);
  return "rgb(" + r + "," + g + "," + b + ")";
}
function rrectPath(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// Draw the wordmark as large as fits inside a box, centered.
function drawScript(g, script, cx, cy, maxW, maxH) {
  let w = maxW, h = w * script.height / script.width;
  if (h > maxH) { h = maxH; w = h * script.width / script.height; }
  g.drawImage(script, cx - w / 2, cy - h / 2, w, h);
}
function speckle(g, w, h, n, rnd, light, dark, s) {
  for (let i = 0; i < n; i++) { g.fillStyle = rnd() < 0.5 ? light : dark; g.fillRect(rnd() * w, rnd() * h, (s || 1) + rnd() * 1.5, (s || 1) + rnd() * 1.5); }
}

/* ---------------- Painted textures (all drawn here, no image files besides the two logos) ---------------- */

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every sign in the room uses this
// (the full logo with the mascot is kept for the splash, the title card and the score card).
// If the PNG is missing, plain lettering stands in.
function scriptCanvas(img) {
  if (img && img.naturalWidth > 0) {
    const k = Math.min(1, 1024 / img.naturalWidth);
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = mkCanvas(w, h), g = c.getContext("2d");
    g.drawImage(img, 0, 0, w, h);
    try {                                                    // crop any transparent margin so sizes below mean the ink itself
      const d = g.getImageData(0, 0, w, h).data;
      let x0 = w, x1 = -1, y0 = h, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 > x0 && y1 > y0 && (x0 > 0 || y0 > 0 || x1 < w - 1 || y1 < h - 1)) {
        const t = mkCanvas(x1 - x0 + 1, y1 - y0 + 1);
        t.getContext("2d").drawImage(c, x0, y0, t.width, t.height, 0, 0, t.width, t.height);
        return t;
      }
    } catch (e) { /* keep the untrimmed image */ }
    return c;
  }
  const c = mkCanvas(900, 300), g = c.getContext("2d");
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.font = 'italic 900 150px Georgia, "Times New Roman", serif';
  g.lineWidth = 30; g.strokeStyle = "#b3202a"; g.strokeText("Nostalgia Pro", 450, 118);
  g.lineWidth = 20; g.strokeStyle = "#12224f"; g.strokeText("Nostalgia Pro", 450, 118);
  g.fillStyle = "#f6e8c8"; g.fillText("Nostalgia Pro", 450, 118);
  g.font = "900 54px " + HUD_FONT;
  g.lineWidth = 10; g.strokeStyle = "#f6e8c8"; g.strokeText("GAMES", 450, 250);
  g.fillStyle = "#12224f"; g.fillText("GAMES", 450, 250);
  return c;
}

// Glossy candy lettering (the arcade's house style), in the late show's orange and purple.
function candyText(g, str, x, y, size, maxW, cols) {
  const face = '"Arial Black", "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
  g.font = "900 " + size + "px " + face;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + face; }
  cols = cols || ["#fff06a", "#ffc21a", "#ff7a0f"];
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = size * 0.36; g.strokeStyle = "#1e0a3c"; g.strokeText(str, x, y + size * 0.06);
  g.lineWidth = size * 0.17; g.strokeStyle = "#ffffff"; g.strokeText(str, x, y);
  const gr = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  gr.addColorStop(0, cols[0]); gr.addColorStop(0.55, cols[1]); gr.addColorStop(1, cols[2]);
  g.fillStyle = gr; g.fillText(str, x, y);
  g.fillStyle = "rgba(255,255,255,.45)";
  g.save(); g.beginPath(); g.rect(x - 900, y - size * 0.5, 1800, size * 0.36); g.clip(); g.fillText(str, x, y); g.restore();
  return size;
}

// Hardwood floor: warm planks, one tile is 160 x 160 units.
function floorCanvas() {
  const c = mkCanvas(512, 512), g = c.getContext("2d"), rnd = rng(5), pw = 512 / 8;
  for (let i = 0; i < 8; i++) {
    let y = -rnd() * 300;
    while (y < 512) {
      const l = 180 + rnd() * 220;
      g.fillStyle = "hsl(" + (22 + rnd() * 8) + "," + (48 + rnd() * 14) + "%," + (28 + rnd() * 9) + "%)";
      g.fillRect(i * pw, y, pw, l);
      for (let k = 0; k < 7; k++) { g.fillStyle = "rgba(40,18,6," + (0.06 + rnd() * 0.1) + ")"; g.fillRect(i * pw + rnd() * pw, y, 1 + rnd(), l); }
      g.fillStyle = "rgba(20,8,2,.55)"; g.fillRect(i * pw, y + l - 2, pw, 2);
      y += l;
    }
    g.fillStyle = "rgba(20,8,2,.6)"; g.fillRect(i * pw, 0, 2, 512);
  }
  g.fillStyle = "rgba(255,220,180,.06)"; g.fillRect(0, 0, 512, 512);
  return c;
}

// The area rug the fight happens on: deep purple, an orange border, little bats and pumpkins, the wordmark in the middle.
// 340 x 420 units, its top edge toward the TV.
function rugCanvas(script) {
  const c = mkCanvas(680, 840), g = c.getContext("2d"), rnd = rng(13);
  rrectPath(g, 0, 0, 680, 840, 60); g.fillStyle = "#ff8a1f"; g.fill();
  rrectPath(g, 14, 14, 652, 812, 50); g.fillStyle = "#3a1470"; g.fill();
  rrectPath(g, 30, 30, 620, 780, 40); g.lineWidth = 6; g.strokeStyle = "#ffd23f"; g.stroke();
  rrectPath(g, 48, 48, 584, 744, 30);
  const bg = g.createRadialGradient(340, 420, 40, 340, 420, 520);
  bg.addColorStop(0, "#5a24a8"); bg.addColorStop(1, "#2c0f5a");
  g.fillStyle = bg; g.fill();
  speckle(g, 680, 840, 9000, rnd, "rgba(255,255,255,.035)", "rgba(10,0,30,.08)", 1.5);
  g.save(); rrectPath(g, 48, 48, 584, 744, 30); g.clip();
  for (let i = 0; i < 26; i++) {                           // the pattern: little pumpkins and bats
    const x = 70 + rnd() * 540, y = 70 + rnd() * 700;
    if (Math.abs(x - 340) < 230 && Math.abs(y - 420) < 110) continue;
    g.save(); g.translate(x, y); g.rotate((rnd() - 0.5) * 0.6); g.globalAlpha = 0.5;
    if (i % 2) {
      g.fillStyle = "#ff8a1f"; g.beginPath(); g.ellipse(0, 0, 15, 12, 0, 0, TAU); g.fill();
      g.fillStyle = "#3d8a2a"; g.fillRect(-2, -16, 4, 6);
    } else {
      g.fillStyle = "#14082a"; g.beginPath(); g.moveTo(-22, -4); g.quadraticCurveTo(-12, -14, -4, -2); g.lineTo(0, -8); g.lineTo(4, -2);
      g.quadraticCurveTo(12, -14, 22, -4); g.quadraticCurveTo(10, 0, 0, 8); g.quadraticCurveTo(-10, 0, -22, -4); g.fill();
    }
    g.restore();
  }
  g.restore();
  rrectPath(g, 120, 330, 440, 180, 40); g.fillStyle = "rgba(14,4,36,.55)"; g.fill();
  g.lineWidth = 4; g.strokeStyle = "rgba(255,210,63,.65)"; g.stroke();
  drawScript(g, script, 340, 420, 400, 160);
  return c;
}

// The walls: wood paneling to waist height, plum wallpaper above with a small damask dot. One tile is 120 x 300 units.
function wallCanvas() {
  const c = mkCanvas(256, 640), g = c.getContext("2d"), rnd = rng(17), k = 640 / ROOM_H;
  const top = 640 - 96 * k;
  const wp = g.createLinearGradient(0, 0, 0, top);
  wp.addColorStop(0, "#2a1340"); wp.addColorStop(1, "#4a2366");
  g.fillStyle = wp; g.fillRect(0, 0, 256, top);
  for (let y = 18; y < top - 10; y += 46) for (let x = (y / 46 % 2) * 32 + 16; x < 256; x += 64) {
    g.fillStyle = "rgba(255,170,90,.16)"; g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 6, y); g.lineTo(x, y + 9); g.lineTo(x - 6, y); g.closePath(); g.fill();
  }
  g.fillStyle = "#6b3a1c"; g.fillRect(0, top, 256, 640 - top);
  for (let i = 0; i < 4; i++) {
    const x = i * 64;
    g.fillStyle = "hsl(" + (24 + rnd() * 5) + ",52%," + (30 + rnd() * 6) + "%)"; g.fillRect(x + 2, top + 8, 60, 640 - top - 8);
    for (let n = 0; n < 9; n++) { g.fillStyle = "rgba(40,16,4,.18)"; g.fillRect(x + 4 + rnd() * 56, top + 8, 1.5, 640 - top); }
    g.fillStyle = "rgba(20,8,2,.7)"; g.fillRect(x, top, 2, 640 - top);
  }
  g.fillStyle = "#3a1d0c"; g.fillRect(0, top - 4, 256, 12);
  g.fillStyle = "#e8a25a"; g.fillRect(0, top - 4, 256, 2);
  g.fillStyle = "#2a1408"; g.fillRect(0, 640 - 18, 256, 18);
  return c;
}

// The night outside the window: a big moon, a bare tree, a few stars.
function windowCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(23);
  const sk = g.createLinearGradient(0, 0, 0, 256);
  sk.addColorStop(0, "#0a0c2e"); sk.addColorStop(1, "#2b2a6e");
  g.fillStyle = sk; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(255,255,255," + (0.3 + rnd() * 0.6) + ")"; g.fillRect(rnd() * 256, rnd() * 160, 1.5, 1.5); }
  const mg = g.createRadialGradient(168, 86, 10, 168, 86, 90);
  mg.addColorStop(0, "rgba(255,240,190,.5)"); mg.addColorStop(1, "rgba(255,240,190,0)");
  g.fillStyle = mg; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#fff2c4"; g.beginPath(); g.arc(168, 86, 40, 0, TAU); g.fill();
  g.fillStyle = "rgba(200,180,120,.35)"; g.beginPath(); g.arc(155, 74, 8, 0, TAU); g.fill(); g.beginPath(); g.arc(182, 100, 6, 0, TAU); g.fill();
  g.strokeStyle = "#0b0716"; g.lineCap = "round";
  function br(x, y, a, l, w) { if (w < 1) return; const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); br(x2, y2, a - 0.45, l * 0.72, w * 0.66); br(x2, y2, a + 0.38, l * 0.7, w * 0.66); }
  br(60, 256, -Math.PI / 2 - 0.15, 70, 12);
  g.fillStyle = "#0b0716"; g.fillRect(0, 236, 256, 20);
  return c;
}

// A movie poster for the late show: wordmark up top, the title in candy letters, a pumpkin moon.
function posterCanvas(script) {
  const c = mkCanvas(256, 360), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 360);
  bg.addColorStop(0, "#14062e"); bg.addColorStop(1, "#5a1a70");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 360);
  g.fillStyle = "#ff8a1f"; g.beginPath(); g.arc(128, 170, 70, 0, TAU); g.fill();
  g.fillStyle = "#14062e";
  g.beginPath(); g.moveTo(98, 150); g.lineTo(118, 150); g.lineTo(108, 132); g.fill();
  g.beginPath(); g.moveTo(138, 150); g.lineTo(158, 150); g.lineTo(148, 132); g.fill();
  g.beginPath(); g.moveTo(92, 182); for (let i = 0; i <= 8; i++) g.lineTo(92 + i * 9, 182 + (i % 2 ? 12 : 0)); g.lineTo(164, 200); g.lineTo(92, 200); g.fill();
  drawScript(g, script, 128, 46, 210, 70);
  candyText(g, "CREATURE", 128, 268, 40, 226);
  candyText(g, "FEATURE KO", 128, 312, 36, 226);
  g.lineWidth = 8; g.strokeStyle = "#ffd23f"; g.strokeRect(4, 4, 248, 352);
  return c;
}

// The black NP tee: the badge on the chest, the script wordmark big across the back. u = 0 is the chest, u = .5 the back.
function teeCanvas(script) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  g.fillStyle = "#1b1b22"; g.fillRect(0, 0, 512, 256);
  const sh = g.createLinearGradient(0, 0, 0, 256);
  sh.addColorStop(0, "rgba(255,255,255,.07)"); sh.addColorStop(1, "rgba(0,0,0,.2)");
  g.fillStyle = sh; g.fillRect(0, 0, 512, 256);
  [0, 512].forEach(function (cx) {                         // chest badge: cream and red checks over a cyan stripe, like the pixel shirt
    for (let j = 0; j < 2; j++) for (let i = -2; i < 2; i++) { g.fillStyle = (i + j) % 2 ? "#e4343e" : "#fff1d6"; g.fillRect(cx + i * 12, 70 + j * 12, 12, 12); }
    g.fillStyle = "#29d3e8"; g.fillRect(cx - 24, 96, 48, 7);
  });
  drawScript(g, script, 256, 108, 230, 96);
  g.fillStyle = "#101016"; g.fillRect(0, 248, 512, 8);
  return c;
}
// The NP cap: navy crown, the cream and red badge on the front panel (u = .25 faces forward on a sphere).
function capCanvas() {
  const c = mkCanvas(256, 128), g = c.getContext("2d");
  g.fillStyle = "#1d2b53"; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(i * 256 / 6, 0, 2, 128); }
  for (let j = 0; j < 2; j++) for (let i = -2; i < 2; i++) { g.fillStyle = (i + j) % 2 ? "#e4343e" : "#fff1d6"; g.fillRect(64 + i * 9, 54 + j * 9, 9, 9); }
  return c;
}

function denimCanvas(base) {
  const c = mkCanvas(128, 128), g = c.getContext("2d"), rnd = rng(31);
  g.fillStyle = base || "#3b5a96"; g.fillRect(0, 0, 128, 128);
  for (let i = -128; i < 128; i += 3) { g.strokeStyle = "rgba(255,255,255,.06)"; g.lineWidth = 1; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); }
  speckle(g, 128, 128, 500, rnd, "rgba(255,255,255,.05)", "rgba(0,0,30,.1)");
  return c;
}

// Pumpkin skin with a carved face. The face is cut through to a glow: it goes in the emissive map too.
// On a sphere, u = .25 faces forward.
function pumpkinCanvas(face, glowOnly) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  if (!glowOnly) {
    const bg = g.createLinearGradient(0, 0, 0, 256);
    bg.addColorStop(0, "#c8541a"); bg.addColorStop(0.5, "#ff8a2a"); bg.addColorStop(1, "#b0440f");
    g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 10; i++) {
      const x = i * 51.2, gr = g.createLinearGradient(x, 0, x + 51.2, 0);
      gr.addColorStop(0, "rgba(90,30,0,.35)"); gr.addColorStop(0.5, "rgba(255,200,120,.12)"); gr.addColorStop(1, "rgba(90,30,0,.35)");
      g.fillStyle = gr; g.fillRect(x, 0, 51.2, 256);
    }
  } else { g.fillStyle = "#000"; g.fillRect(0, 0, 512, 256); }
  if (face) {
    g.save(); g.translate(128, 128);
    g.fillStyle = glowOnly ? "#ffd75a" : "#3a1200";
    if (face === "knight") {                               // narrow slanted eyes, a gap-toothed grin
      g.beginPath(); g.moveTo(-36, -24); g.lineTo(-10, -12); g.lineTo(-30, -2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(36, -24); g.lineTo(10, -12); g.lineTo(30, -2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-44, 18); for (let i = 0; i <= 11; i++) g.lineTo(-44 + i * 8, 18 + (i % 2 ? 9 : 0) + Math.sin(i / 11 * Math.PI) * 12);
      g.lineTo(44, 36); for (let i = 11; i >= 0; i--) g.lineTo(-44 + i * 8, 36 + Math.sin(i / 11 * Math.PI) * 14 - (i % 3 === 0 ? 7 : 0)); g.closePath(); g.fill();
    } else {                                               // round eyes, a triangle nose, a wide happy mouth
      g.beginPath(); g.arc(-24, -14, 12, 0, TAU); g.fill(); g.beginPath(); g.arc(24, -14, 12, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(0, -2); g.lineTo(-8, 10); g.lineTo(8, 10); g.fill();
      g.beginPath(); g.moveTo(-40, 18); g.quadraticCurveTo(0, 54, 40, 18); g.quadraticCurveTo(0, 34, -40, 18); g.fill();
    }
    g.restore();
  }
  return c;
}

// Brushed steel with rivets, a pumpkin crest on the chest (u = 0 is the chest on the body).
function plateCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(41);
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, "#e6e9f2"); bg.addColorStop(0.5, "#a9afc0"); bg.addColorStop(1, "#6d7488");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 400; i++) { g.fillStyle = "rgba(255,255,255," + rnd() * 0.12 + ")"; g.fillRect(rnd() * 512, rnd() * 256, 30 + rnd() * 40, 1); }
  g.fillStyle = "#3b4256"; g.fillRect(0, 196, 512, 6); g.fillRect(0, 60, 512, 4);
  for (let x = 8; x < 512; x += 32) { g.fillStyle = "#4b5266"; g.beginPath(); g.arc(x, 199, 3, 0, TAU); g.fill(); }
  [0, 512].forEach(function (cx) {
    g.fillStyle = "#ff7a1a"; g.beginPath(); g.ellipse(cx, 128, 34, 28, 0, 0, TAU); g.fill();
    g.fillStyle = "#3d8a2a"; g.fillRect(cx - 4, 94, 8, 10);
    g.fillStyle = "#ffd23f"; g.beginPath(); g.moveTo(cx - 16, 124); g.lineTo(cx - 6, 124); g.lineTo(cx - 11, 114); g.fill();
    g.beginPath(); g.moveTo(cx + 6, 124); g.lineTo(cx + 16, 124); g.lineTo(cx + 11, 114); g.fill();
    g.fillRect(cx - 14, 136, 28, 5);
  });
  return c;
}
// Purple velvet jacket: gold buttons, wide lapels over a white shirt front (u = 0 is the chest).
function velvetCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(43);
  g.fillStyle = "#4b1a7a"; g.fillRect(0, 0, 512, 256);
  speckle(g, 512, 256, 3000, rnd, "rgba(255,200,255,.05)", "rgba(10,0,30,.12)");
  [0, 512].forEach(function (cx) {
    g.fillStyle = "#f2eef8"; g.beginPath(); g.moveTo(cx - 34, 0); g.lineTo(cx + 34, 0); g.lineTo(cx + 10, 150); g.lineTo(cx - 10, 150); g.fill();
    g.fillStyle = "#a01428"; g.beginPath(); g.moveTo(cx - 10, 4); g.lineTo(cx + 10, 4); g.lineTo(cx, 40); g.fill();     // a cravat
    g.fillStyle = "#2a0c48"; g.beginPath(); g.moveTo(cx - 34, 0); g.lineTo(cx - 52, 0); g.lineTo(cx - 12, 160); g.fill();
    g.beginPath(); g.moveTo(cx + 34, 0); g.lineTo(cx + 52, 0); g.lineTo(cx + 12, 160); g.fill();
    for (let k = 0; k < 3; k++) { g.fillStyle = "#ffd23f"; g.beginPath(); g.arc(cx + (cx ? -22 : 22), 170 + k * 26, 5, 0, TAU); g.fill(); }
  });
  return c;
}
// Blue plaid flannel, torn along the bottom where the fur shows through.
function flannelCanvas(fur) {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  g.fillStyle = "#2a5c9e"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 32) {
    g.fillStyle = "rgba(10,20,50,.45)"; g.fillRect(i, 0, 12, 256); g.fillRect(0, i, 256, 12);
    g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(i + 20, 0, 2, 256); g.fillRect(0, i + 20, 256, 2);
    g.fillStyle = "rgba(220,40,40,.3)"; g.fillRect(i + 26, 0, 3, 256); g.fillRect(0, i + 26, 256, 3);
  }
  if (fur) {
    g.fillStyle = fur; g.beginPath(); g.moveTo(0, 256);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, 214 + (x / 16 % 2 ? 26 : 0) + Math.sin(x) * 6);
    g.lineTo(256, 256); g.fill();
    [0, 256].forEach(function (cx) {                       // the shirt is open at the collar: a V of chest fur
      g.beginPath(); g.moveTo(cx - 44, 0); g.lineTo(cx + 44, 0); g.lineTo(cx, 96); g.closePath(); g.fill();
      g.strokeStyle = "rgba(255,230,190,.25)"; g.lineWidth = 2;
      for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(cx - 20 + k * 5, 10 + k * 3); g.lineTo(cx - 18 + k * 5, 24 + k * 3); g.stroke(); }
    });
  }
  return c;
}
function furCanvas(base) {
  const c = mkCanvas(128, 128), g = c.getContext("2d"), rnd = rng(47);
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i++) { g.strokeStyle = rnd() < 0.5 ? "rgba(255,230,190,.12)" : "rgba(30,10,0,.18)"; g.lineWidth = 1.2; const x = rnd() * 128, y = rnd() * 128; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 4, y + 6 + rnd() * 6); g.stroke(); }
  return c;
}
// Linen wraps, laid on at a slant, a few loose ends.
function wrapCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(53);
  g.fillStyle = "#d9cca0"; g.fillRect(0, 0, 256, 256);
  for (let y = -256; y < 512; y += 22) {
    g.fillStyle = "hsl(" + (44 + rnd() * 6) + "," + (40 + rnd() * 14) + "%," + (74 + rnd() * 10) + "%)";
    g.beginPath(); g.moveTo(0, y); g.lineTo(256, y + 60); g.lineTo(256, y + 78); g.lineTo(0, y + 18); g.closePath(); g.fill();
    g.strokeStyle = "rgba(120,96,50,.45)"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y + 18); g.lineTo(256, y + 78); g.stroke();
  }
  speckle(g, 256, 256, 900, rnd, "rgba(255,255,255,.1)", "rgba(90,70,30,.12)");
  return c;
}
// The pharaoh's striped headcloth: gold and lapis.
function nemesCanvas() {
  const c = mkCanvas(64, 256), g = c.getContext("2d");
  for (let y = 0; y < 256; y += 32) { g.fillStyle = "#ffcf3a"; g.fillRect(0, y, 64, 16); g.fillStyle = "#2a50c8"; g.fillRect(0, y + 16, 64, 16); }
  return c;
}
// The giant's patchwork skin: blue-grey with stitched patches in other shades. Tiles.
function patchCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(59);
  g.fillStyle = "#86a8bc"; g.fillRect(0, 0, 256, 256);
  const tones = ["#9cbccc", "#7392a8", "#a6b0c2", "#8fb4a6", "#b0a2b8"];
  for (let i = 0; i < 9; i++) {
    const x = rnd() * 220, y = rnd() * 220, w = 40 + rnd() * 60, h = 40 + rnd() * 60;
    g.fillStyle = tones[i % tones.length]; g.fillRect(x, y, w, h);
    g.strokeStyle = "#2a2d38"; g.lineWidth = 2; g.setLineDash([5, 4]); g.strokeRect(x, y, w, h); g.setLineDash([]);
    g.lineWidth = 1.5;
    for (let s = x + 4; s < x + w; s += 9) { g.beginPath(); g.moveTo(s, y - 4); g.lineTo(s + 3, y + 4); g.stroke(); }
  }
  return c;
}
// The giant's overalls bib over a patched shirt (u = 0 is the chest).
function overallCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  g.drawImage(denimCanvas("#33456e"), 0, 0, 512, 256);
  g.fillStyle = "#c2683a"; g.fillRect(0, 0, 512, 90);
  for (let x = 0; x < 512; x += 24) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x, 0, 2, 90); }
  [0, 512].forEach(function (cx) {
    g.drawImage(denimCanvas("#33456e"), cx - 60, 40, 120, 120);
    g.fillStyle = "#ffd23f"; g.beginPath(); g.arc(cx - 46, 56, 6, 0, TAU); g.fill(); g.beginPath(); g.arc(cx + 46, 56, 6, 0, TAU); g.fill();
    g.fillStyle = "#26365a"; g.fillRect(cx - 30, 92, 60, 36);
  });
  g.fillStyle = "#33456e"; g.fillRect(200, 0, 26, 100); g.fillRect(286, 0, 26, 100);      // straps over the back
  return c;
}
// The witch's dress: deep purple with two orange patches and a stitched hem.
function dressCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(61);
  g.fillStyle = "#3a1458"; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 1500, rnd, "rgba(255,200,255,.05)", "rgba(10,0,20,.15)");
  [[60, 120], [180, 60]].forEach(function (p) { g.fillStyle = "#e8742a"; g.fillRect(p[0], p[1], 34, 30); g.strokeStyle = "#1a0828"; g.setLineDash([4, 3]); g.lineWidth = 2; g.strokeRect(p[0], p[1], 34, 30); g.setLineDash([]); });
  g.fillStyle = "#1a0828"; g.fillRect(0, 240, 256, 16);
  return c;
}
function stripeCanvas(a, b, n) {
  const c = mkCanvas(32, 128), g = c.getContext("2d");
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(0, i * 128 / n, 32, 128 / n + 1); }
  return c;
}
// Up-and-down stripes for things wrapped around (a nightcap): stripes run around the u direction.
function vstripeCanvas(a, b, n) {
  const c = mkCanvas(128, 32), g = c.getContext("2d");
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 128 / n, 0, 128 / n + 1, 32); }
  return c;
}
// Straw for the hay horse: tan with golden strokes and a twine band.
function strawCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(67);
  g.fillStyle = "#c79a3e"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.strokeStyle = ["rgba(255,226,140,.5)", "rgba(120,80,20,.4)", "rgba(240,200,90,.45)"][i % 3]; g.lineWidth = 1 + rnd() * 1.5;
    const x = rnd() * 256, y = rnd() * 256, a = (rnd() - 0.5) * 0.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * 30, y + Math.cos(a) * 30); g.stroke();
  }
  g.fillStyle = "#5a2a14"; g.fillRect(0, 120, 256, 10); g.fillStyle = "rgba(255,255,255,.15)"; g.fillRect(0, 121, 256, 2);
  return c;
}
// The rider's long coat: midnight purple, a row of brass buttons, orange piping (u = 0 is the chest).
function coatCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(71);
  g.fillStyle = "#2a1838"; g.fillRect(0, 0, 512, 256);
  speckle(g, 512, 256, 2500, rnd, "rgba(255,200,255,.04)", "rgba(0,0,0,.15)");
  [0, 512].forEach(function (cx) {
    g.fillStyle = "#ff8a1f"; g.fillRect(cx - 3, 0, 6, 256);
    for (let k = 0; k < 5; k++) { g.fillStyle = "#e0b04a"; g.beginPath(); g.arc(cx - 16, 40 + k * 42, 5, 0, TAU); g.fill(); g.beginPath(); g.arc(cx + 16, 40 + k * 42, 5, 0, TAU); g.fill(); }
  });
  g.fillStyle = "#1a0e24"; g.fillRect(0, 236, 512, 20);
  return c;
}
// Candy corn: yellow base, orange middle, white tip. v runs base to tip.
function cornCanvas() {
  const c = mkCanvas(16, 64), g = c.getContext("2d");
  g.fillStyle = "#ffd23f"; g.fillRect(0, 40, 16, 24);
  g.fillStyle = "#ff8a1f"; g.fillRect(0, 18, 16, 22);
  g.fillStyle = "#fbf7ec"; g.fillRect(0, 0, 16, 18);
  return c;
}
// The round shield and the knight's crest.
function shieldCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  g.fillStyle = "#2a1458"; g.beginPath(); g.arc(128, 128, 126, 0, TAU); g.fill();
  g.lineWidth = 16; g.strokeStyle = "#c9ccd8"; g.stroke();
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.fillStyle = "#e6e9f2"; g.beginPath(); g.arc(128 + Math.cos(a) * 110, 128 + Math.sin(a) * 110, 6, 0, TAU); g.fill(); }
  g.fillStyle = "#ff7a1a"; g.beginPath(); g.ellipse(128, 136, 62, 52, 0, 0, TAU); g.fill();
  g.fillStyle = "#3d8a2a"; g.fillRect(122, 72, 12, 18);
  g.fillStyle = "#ffd23f"; g.beginPath(); g.moveTo(96, 130); g.lineTo(116, 130); g.lineTo(106, 112); g.fill();
  g.beginPath(); g.moveTo(140, 130); g.lineTo(160, 130); g.lineTo(150, 112); g.fill();
  g.fillRect(100, 150, 56, 8);
  return c;
}
// Spines of a shelf full of tapes and game boxes.
function shelfCanvas(script) {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(73);
  g.fillStyle = "#24120a"; g.fillRect(0, 0, 256, 256);
  const cols = ["#ff4b3e", "#16b9e8", "#ff3fa4", "#58c322", "#ffb81f", "#8a5cff", "#f4efdf", "#1b1d26", "#ff8a1f"];
  for (let r = 0; r < 3; r++) {
    const y0 = 12 + r * 82;
    let x = 8;
    while (x < 248) {
      const w = 9 + rnd() * 9, h = 52 + rnd() * 16, col = cols[Math.floor(rnd() * cols.length)];
      g.fillStyle = col; g.fillRect(x, y0 + 66 - h, w - 1, h);
      g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(x + 1, y0 + 70 - h, w - 3, 5);
      g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(x + w - 3, y0 + 66 - h, 2, h);
      x += w;
    }
    g.fillStyle = "#6b3a1c"; g.fillRect(0, y0 + 66, 256, 10);
  }
  return c;
}
// A game box lid: loud color, the wordmark on a navy plate.
function boxCanvas(col, script) {
  const c = mkCanvas(128, 176), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 176);
  bg.addColorStop(0, shade(col, 0.22)); bg.addColorStop(1, shade(col, -0.15));
  g.fillStyle = bg; g.fillRect(0, 0, 128, 176);
  rrectPath(g, 10, 54, 108, 64, 12); g.fillStyle = "#0d1f5c"; g.fill(); g.lineWidth = 3; g.strokeStyle = "#fff3cf"; g.stroke();
  drawScript(g, script, 64, 86, 96, 52);
  g.fillStyle = "rgba(255,255,255,.3)"; g.fillRect(0, 0, 128, 40);
  return c;
}
function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(10,0,20,.8)"); gr.addColorStop(0.55, "rgba(10,0,20,.42)"); gr.addColorStop(1, "rgba(10,0,20,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function glowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.45)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function ringCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.lineWidth = 9; g.strokeStyle = "#ffffff"; g.beginPath(); g.arc(64, 64, 56, 0, TAU); g.stroke();
  g.lineWidth = 3; g.globalAlpha = 0.5; g.beginPath(); g.arc(64, 64, 42, 0, TAU); g.stroke();
  return c;
}
// Claw scratches gouged into the rug: three ragged lines, faded at the ends.
function scratchCanvas() {
  const c = mkCanvas(64, 256), g = c.getContext("2d");
  for (let k = 0; k < 3; k++) {
    const x = 12 + k * 20;
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.2, "rgba(255,255,255,1)"); gr.addColorStop(0.85, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - 1, 0); g.lineTo(x + 1, 0); g.lineTo(x + 4, 128); g.lineTo(x + 1, 256); g.lineTo(x - 1, 256); g.lineTo(x - 4, 128); g.closePath(); g.fill();
  }
  return c;
}
// A tiny painted room for the glossy highlights.
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.15, "#e8d8ff"); gr.addColorStop(0.3, "#7a4ad8");
    gr.addColorStop(0.5, "#2a1458"); gr.addColorStop(0.52, "#5a2a14"); gr.addColorStop(1, "#ff8a1f");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#3a1d6a"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(8, 6, 14, 52); tg.fillRect(42, 6, 14, 52);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#5a2a14"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

// The top part of a carved pumpkin head (the sphere from its crown down to 0.64 of the way): eyes, a nose and brows
// cut through to the glow. The mouth is the gap above its hinged jaw.
function carvedCanvas(kind, glowOnly) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  if (glowOnly) { g.fillStyle = "#000"; g.fillRect(0, 0, 512, 256); }
  else {
    const bg = g.createLinearGradient(0, 0, 0, 256);
    bg.addColorStop(0, "#b0440f"); bg.addColorStop(0.6, "#ff8a2a"); bg.addColorStop(1, "#e06a1e");
    g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 10; i++) {
      const x = i * 51.2, gr = g.createLinearGradient(x, 0, x + 51.2, 0);
      gr.addColorStop(0, "rgba(90,30,0,.35)"); gr.addColorStop(0.5, "rgba(255,200,120,.12)"); gr.addColorStop(1, "rgba(90,30,0,.35)");
      g.fillStyle = gr; g.fillRect(x, 0, 51.2, 256);
    }
  }
  g.save(); g.translate(128, 0);
  g.fillStyle = glowOnly ? "#ffd75a" : "#3a1200";
  if (kind === "knight") {                                 // narrow eyes under hard slashed brows
    [-1, 1].forEach(function (s) {
      g.beginPath(); g.moveTo(s * 40, 150); g.lineTo(s * 10, 166); g.lineTo(s * 34, 182); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(s * 46, 122); g.lineTo(s * 8, 140); g.lineTo(s * 10, 148); g.lineTo(s * 48, 132); g.closePath(); g.fill();
    });
    g.beginPath(); g.moveTo(0, 196); g.lineTo(-9, 214); g.lineTo(9, 214); g.closePath(); g.fill();
  } else {                                                 // round eyes under arched brows, a heart-shaped nose
    [-1, 1].forEach(function (s) {
      g.beginPath(); g.ellipse(s * 26, 168, 14, 17, 0, 0, TAU); g.fill();
      g.beginPath(); g.arc(s * 26, 158, 26, Math.PI * 1.15, Math.PI * 1.85); g.lineWidth = 7; g.strokeStyle = g.fillStyle; g.stroke();
    });
    g.beginPath(); g.moveTo(0, 214); g.lineTo(-10, 198); g.lineTo(10, 198); g.closePath(); g.fill();
  }
  g.restore();
  return c;
}

/* ---------------- The TV screen: a title card for the late show, static while a monster climbs through ---------------- */
function tvPaint(g, script, mode, t, boss) {
  const w = 256, h = 192;
  if (mode === "static") {
    const im = g.createImageData(w, h), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const v = (vrand() * 255) | 0; d[i] = v * 0.9; d[i + 1] = v * 0.9; d[i + 2] = v; d[i + 3] = 255; }
    g.putImageData(im, 0, 0);
    g.fillStyle = "rgba(120,60,200,.25)"; g.fillRect(0, 0, w, h);
    return;
  }
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#14063a"); bg.addColorStop(1, "#3a0f6a");
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (mode === "title") {
    drawScript(g, script, w / 2, 50, 190, 64);
    candyText(g, "CREATURE", w / 2, 112, 30, 220);
    candyText(g, "FEATURE KO", w / 2, 146, 28, 220);
  } else {                                                  // during a fight: who is on tonight
    g.fillStyle = boss ? boss.col : "#ff8a1f";
    g.font = "bold 15px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("TONIGHT ON THE LATE SHOW", w / 2, 44);
    candyText(g, boss ? boss.name : "", w / 2, 92, 26, 228);
    drawScript(g, script, w / 2, 148, 120, 40);
  }
  for (let y = 0; y < h; y += 3) { g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(0, y, w, 1); }
  const roll = (t * 40) % (h + 40) - 20;
  g.fillStyle = "rgba(255,255,255,.06)"; g.fillRect(0, roll, w, 14);
  g.fillStyle = (Math.floor(t * 2) % 2) ? "#ff3322" : "rgba(255,51,34,.25)";
  g.beginPath(); g.arc(18, 18, 6, 0, TAU); g.fill();
  g.font = "bold 12px " + HUD_FONT; g.textAlign = "left"; g.fillStyle = "#ffffff"; g.fillText("PLAY", 30, 19);
}

/* ---------------- LED ribbon board: the full-width strip across the top of the back wall, over the TV ----------------
   The board is a real dot matrix. Everything on it is painted into a tiny canvas, one pixel per LED, and a small
   shader turns each pixel into a glowing dot. It scrolls its programme right to left, and cuts to big animated
   messages when the game calls for one (the monster's name as it climbs out, OPEN!, combos, K.O.!, the score). */
const LED_COLS = Math.round(ROOM_X * 2 / (LED_H / LED_ROWS));
const LED_SPEED = 30;                                      // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));   // the largest text size that fits (5 x 7 font, in LEDs per font pixel)
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
// Short messages between the plugs. The wordmark leads each group.
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["BE KIND, REWIND", "pink"], ["NO QUARTERS REQUIRED", "lime"]];
// Plugs for the rest of the arcade: [game, one-line tag]. Edit freely, the board lays itself out.
const LED_PLUGS = [
  ["TAPE PIN LANES", "3D BOWLING"],
  ["SHELF LINKS", "MINI GOLF"],
  ["BARGAIN BIN BUCKETS", "HOOPS"],
  ["BLEACHER CARTS", "HOME RUN DERBY"],
  ["TICKET ROLL ALLEY", "ROLL FOR TICKETS"],
  ["PAWN SHOP POOL", "RACK 'EM UP"],
  ["RINK RAT SHOOTOUT", "HOCKEY SHOOTOUT"],
  ["FOURTH AND COLLECT", "SPLIT THE UPRIGHTS"],
  ["POWDER DAY HAUL", "HIT THE SLOPES"],
  ["TABLE RINK RUMBLE", "AIR HOCKEY"],
  ["FLEA FORTRESS FLYBY", "PLAY IT FREE"]
];
let LED = null;

// 5 x 7 dot-matrix font, seven rows of five per character
const LED_FONT = (function () {
  const src = {
    A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110",
    C: "01110 10001 10000 10000 10000 10001 01110", D: "11110 10001 10001 10001 10001 10001 11110",
    E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
    G: "01110 10001 10000 10111 10001 10001 01111", H: "10001 10001 10001 11111 10001 10001 10001",
    I: "01110 00100 00100 00100 00100 00100 01110", J: "00111 00010 00010 00010 00010 10010 01100",
    K: "10001 10010 10100 11000 10100 10010 10001", L: "10000 10000 10000 10000 10000 10000 11111",
    M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 11001 10101 10011 10001 10001 10001",
    O: "01110 10001 10001 10001 10001 10001 01110", P: "11110 10001 10001 11110 10000 10000 10000",
    Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
    S: "01111 10000 10000 01110 00001 00001 11110", T: "11111 00100 00100 00100 00100 00100 00100",
    U: "10001 10001 10001 10001 10001 10001 01110", V: "10001 10001 10001 10001 10001 01010 00100",
    W: "10001 10001 10001 10101 10101 11011 10001", X: "10001 10001 01010 00100 01010 10001 10001",
    Y: "10001 10001 01010 00100 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
    "0": "01110 10001 10011 10101 11001 10001 01110", "1": "00100 01100 00100 00100 00100 00100 01110",
    "2": "01110 10001 00001 00010 00100 01000 11111", "3": "11110 00001 00001 01110 00001 00001 11110",
    "4": "00010 00110 01010 10010 11111 00010 00010", "5": "11111 10000 11110 00001 00001 10001 01110",
    "6": "00110 01000 10000 11110 10001 10001 01110", "7": "11111 00001 00010 00100 01000 01000 01000",
    "8": "01110 10001 10001 01110 10001 10001 01110", "9": "01110 10001 10001 01111 00001 00010 01100",
    "!": "00100 00100 00100 00100 00100 00000 00100", ".": "00000 00000 00000 00000 00000 01100 01100",
    ",": "00000 00000 00000 00000 01100 00100 01000", "'": "00100 00100 01000 00000 00000 00000 00000",
    "-": "00000 00000 00000 11111 00000 00000 00000", ":": "00000 01100 01100 00000 01100 01100 00000",
    "/": "00001 00001 00010 00100 01000 10000 10000", "&": "01100 10010 10100 01000 10101 10010 01101",
    "?": "01110 10001 00001 00010 00100 00000 00100", "+": "00000 00100 00100 11111 00100 00100 00000",
    ">": "10000 01000 00100 00010 00100 01000 10000", "<": "00001 00010 00100 01000 00100 00010 00001",
    "*": "00000 00100 01110 11111 01110 00100 00000"
  };
  const out = {};
  for (const ch in src) out[ch] = src[ch].split(" ");
  return out;
})();
function ledTextW(str, sx) {
  let w = 0;
  for (let i = 0; i < str.length; i++) w += (str[i] === " " ? 4 : 6) * sx;
  return Math.max(0, w - sx);
}
// Paints str with its top-left LED at (x, y); each font pixel is sx by sy LEDs. Returns the x after the last character.
function ledText(g, str, x, y, sx, sy, color) {
  g.fillStyle = color;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === " ") { x += 4 * sx; continue; }
    const rows = LED_FONT[ch] || LED_FONT["?"];
    for (let r = 0; r < 7; r++) {
      const rw2 = rows[r];
      for (let c = 0; c < 5; c++) if (rw2.charCodeAt(c) === 49) g.fillRect(x + c * sx, y + r * sy, sx, sy);
    }
    x += 6 * sx;
  }
  return x;
}

// The whole scrolling programme, painted once into one long strip (LED_ROWS tall).
function ledStrip(script) {
  const HH = LED_ROWS, big = LED_BIG, yBig = Math.floor((HH - 7 * big) / 2), GAP = 11, items = [];
  // The wordmark at board resolution, prepared once. At this size the thin script strokes come out half
  // lit, so the cream lettering is pushed to full LED brightness, the red edge is kept as a dimmer rim
  // and the navy outline falls back to dark: the script reads as light on black.
  const markW = Math.max(8, Math.round(HH * script.width / script.height));
  const markC = mkCanvas(markW, HH), mg = markC.getContext("2d", { willReadFrequently: true });
  mg.imageSmoothingEnabled = true; mg.imageSmoothingQuality = "high";
  mg.drawImage(script, 0, 0, markW, HH);
  try {
    const im = mg.getImageData(0, 0, markW, HH), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const m = Math.max(d[i], d[i + 1], d[i + 2]);
      if (m < 6) continue;
      const warm = d[i] >= d[i + 2], cream = warm && d[i + 1] > 0.55 * d[i];
      let k = cream ? (m > 70 ? 255 / m : 0.2) : warm ? 0.6 : 0.1;
      k = Math.min(k, 255 / m);
      d[i] = d[i] * k; d[i + 1] = d[i + 1] * k; d[i + 2] = d[i + 2] * k;
    }
    mg.putImageData(im, 0, 0);
  } catch (e) { /* leave it as drawn */ }
  function mark() { items.push({ w: markW, draw: function (g, x) { g.drawImage(markC, x, 0); } }); }
  function line(str, color) { items.push({ w: ledTextW(str, big), draw: function (g, x) { ledText(g, str, x, yBig, big, big, color); } }); }
  // an ad card: a color bar, a little "FREE" tab with the tag beside it, and the game's name underneath
  function plug(name, tag, color) {
    const ns = Math.max(1, big - 1), ts = 1, pad = 6, tab = ledTextW("FREE", ts) + 4;
    const top = Math.max(1, Math.floor((HH - (7 * ts + 3 + 7 * ns)) / 2));
    const w = pad + Math.max(ledTextW(name, ns), tab + 4 + ledTextW(tag, ts));
    items.push({ w: w, draw: function (g, x) {
      g.fillStyle = color; g.fillRect(x, 1, 2, HH - 2);
      g.fillStyle = LED_C.yellow; g.fillRect(x + pad, top - 1, tab, 7 * ts + 2);
      ledText(g, "FREE", x + pad + 2, top, ts, ts, "#000000");
      ledText(g, tag, x + pad + tab + 4, top, ts, ts, LED_C.white);
      ledText(g, name, x + pad, top + 7 * ts + 3, ns, ns, color);
    } });
  }
  const tints = [LED_C.orange, LED_C.lime, LED_C.cyan, LED_C.pink, LED_C.yellow];
  const per = Math.ceil(LED_PLUGS.length / LED_LINES.length);
  let n = 0;
  for (let k = 0; k < LED_LINES.length; k++) {
    mark();
    line(LED_LINES[k][0], LED_C[LED_LINES[k][1]] || LED_C.amber);
    for (let j = 0; j < per && n < LED_PLUGS.length; j++, n++) plug(LED_PLUGS[n][0], LED_PLUGS[n][1], tints[n % tints.length]);
  }
  let total = 0;
  for (let i = 0; i < items.length; i++) total += items[i].w + GAP * 2 + 7;
  const c = mkCanvas(total, HH), g = c.getContext("2d");
  g.fillStyle = "#000000"; g.fillRect(0, 0, total, HH);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  let x = 0;
  for (let i = 0; i < items.length; i++) {
    items[i].draw(g, x);
    x += items[i].w + GAP;
    ledText(g, "*", x, Math.floor((HH - 7) / 2), 1, 1, LED_C.orange);     // a small separator between items
    x += 7 + GAP;
  }
  return { canvas: c, markW: items[0].w };
}

function ledCreate(script) {
  const c = mkCanvas(LED_COLS, LED_ROWS), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  const strip = ledStrip(script), sw = strip.canvas.width;
  // open with the wordmark sitting in the middle of the board
  const start = ((-(LED_COLS - strip.markW) / 2) % sw + sw) % sw;
  return { canvas: c, g: g, strip: strip.canvas, scroll: start, pos: -1, msg: null, queue: [], frame: -1, tex: null };
}

// One LED cell for the shader: a round lens, bright in the middle, dark between neighbors.
function ledDotCanvas() {
  const c = mkCanvas(32, 32), g = c.getContext("2d");
  g.fillStyle = "#000000"; g.fillRect(0, 0, 32, 32);
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.45, "#f4f4f4"); gr.addColorStop(0.8, "#585858"); gr.addColorStop(1, "#000000");
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return c;
}

// kind: "flash" (strobe and chevrons), "slide", "cycle", "blink" or "count" (label and a number that counts up)
function ledMsg(kind, text, dur, more) {
  const m = { kind: kind, text: text, dur: dur, t: 0, wait: 0, color: "amber" };
  if (more) for (const k in more) m[k] = more[k];
  return m;
}
// Cut to a list of messages (or add them after whatever is showing), then return to the scroll.
function ledPlay(list, append) {
  const L = LED;
  if (!L || !list.length) return;
  if (append && L.msg) { for (let i = 0; i < list.length; i++) L.queue.push(list[i]); return; }
  L.msg = list[0]; L.msg.t = 0;
  L.queue = list.slice(1);
  L.frame = -1;
}
function ledClear() {
  if (!LED) return;
  LED.msg = null; LED.queue = []; LED.pos = -1;
}

function ledDrawMsg(g, m) {
  const WW = LED_COLS, HH = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(WW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.amber;
  function fit(str) { let sx = big; while (sx > 1 && ledTextW(str, sx) > WW - 10) sx--; return sx; }
  function chase(color, dir) {                              // running lights along the top and bottom edges
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < WW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(WW - x - 3, HH - 1, 3, 1); }
  }
  if (m.kind === "count") {                                 // counts up to the new number
    const k = calm ? 1 : Math.min(1, t / 0.7), v = Math.round(m.from + (m.value - m.from) * k);
    const label = m.text ? m.text + " " : "", full = label + comma(m.value), sxc = fit(full);
    const x = Math.round((WW - ledTextW(full, sxc)) / 2), yc = Math.floor((HH - 7 * sxc) / 2);
    const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
    const xn = ledText(g, label, x, yc, sxc, sxc, LED_C.amber);
    ledText(g, comma(v), xn, yc, sxc, sxc, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
    if (!calm && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(WW * m.t / 0.3), 0, WW, HH); }   // wipe in
    chase(LED_C.amber, 1);
    return;
  }
  const sx = fit(m.text), w = ledTextW(m.text, sx), x0 = Math.round((WW - w) / 2), ys = Math.floor((HH - 7 * sx) / 2);
  if (m.kind === "flash") {
    if (!calm && t < 0.6 && Math.floor(t * 12) % 2 === 0) {                        // strobe: the whole board flips
      g.fillStyle = LED_C.yellow; g.fillRect(0, 0, WW, HH);
      ledText(g, m.text, x0, ys, sx, sx, "#000000");
      return;
    }
    const span = 6 * big + 5, ph = calm ? 0 : Math.floor((t * 46) % span);
    for (let k = 0; k < 12; k++) {                          // chevrons racing outward on both sides
      const off = Math.round(w / 2) + 7 + k * span + ph;
      if (off > mid + span) break;
      const cc = k % 2 ? LED_C.red : LED_C.orange;
      ledText(g, ">", mid + off, yBig, big, big, cc);
      ledText(g, "<", mid - off - 5 * big, yBig, big, big, cc);
    }
    const cyc = [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0, ys, sx, sx, calm ? LED_C.yellow : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 10; i++) g.fillRect((vrand() * WW) | 0, (vrand() * HH) | 0, 1, 1); }
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "slide") {                                 // slides in from the right, then a white glint sweeps across it
    const k = calm ? 1 : Math.min(1, t / 0.4), e = 1 - Math.pow(1 - k, 3);
    const x = Math.round(x0 + (1 - e) * WW);
    ledText(g, m.text, x, ys, sx, sx, col);
    if (!calm && k >= 1) {
      const bx = Math.floor(((t - 0.4) * 150) % (WW + 60)) - 30;
      g.save(); g.beginPath(); g.rect(bx, 0, 10, HH); g.clip();
      ledText(g, m.text, x, ys, sx, sx, "#ffffff");
      g.restore();
    }
    chase(col, -1);
    return;
  }
  if (m.kind === "cycle") {                                 // every letter takes its turn through the colors
    const cyc = [LED_C.orange, LED_C.violet, LED_C.lime, LED_C.yellow, LED_C.pink];
    let x = x0;
    for (let i = 0; i < m.text.length; i++) x = ledText(g, m.text[i], x, ys, sx, sx, cyc[(i + (calm ? 0 : Math.floor(t * 9))) % cyc.length]);
    chase(LED_C.orange, 1);
    return;
  }
  // blink: a few flashes, then it holds between two solid bars
  if (calm || t > 1.0 || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, ys, sx, sx, col);
  g.fillStyle = col; g.fillRect(0, HH - 1, WW, 1); g.fillRect(0, 0, WW, 1);
}

function ledDraw() {
  const L = LED, g = L.g, HH = LED_ROWS;
  g.fillStyle = "#000000"; g.fillRect(0, 0, LED_COLS, HH);
  if (L.msg) { ledDrawMsg(g, L.msg); return; }
  const sw = L.strip.width;
  let sx = L.pos, dx = 0;
  while (dx < LED_COLS) {                                   // the strip wraps around
    const n = Math.min(LED_COLS - dx, sw - sx);
    g.drawImage(L.strip, sx, 0, n, HH, dx, 0, n, HH);
    dx += n; sx = 0;
  }
}

// Advance the board. It only repaints (and re-uploads its tiny texture) when an LED actually changes.
function ledTick(dt) {
  const L = LED;
  if (!L) return;
  let redraw = false;
  if (L.msg) {
    L.msg.t += dt;
    if (L.msg.t >= L.msg.dur) { L.msg = L.queue.shift() || null; if (L.msg) L.msg.t = 0; L.frame = -1; redraw = true; }
  }
  if (L.msg) {
    const f = Math.floor(L.msg.t * 30);
    if (f !== L.frame) { L.frame = f; redraw = true; }
  } else {
    const sw = L.strip.width;
    L.scroll = (L.scroll + dt * (Shell.reduced ? LED_SPEED * 0.5 : LED_SPEED)) % sw;
    const p = Math.floor(L.scroll);
    if (p !== L.pos) { L.pos = p; redraw = true; }
  }
  if (redraw) { ledDraw(); if (L.tex) L.tex.needsUpdate = true; }
}

/* ---------------- Geometry helpers ---------------- */

// A box with every edge and corner rounded. Each face keeps its own material slot (+x -x +y -y +z -z),
// and its texture is stretched corner to corner.
function roundBox(T, w, h, d, r) {
  const s = 4, per = (s + 1) * (s + 1), half = 0.5 / s;
  r = Math.min(r, w / 2, h / 2, d / 2);
  const g = new T.BoxGeometry(1, 1, 1, s, s, s);
  const pos = g.attributes.position, nor = g.attributes.normal, tuv = g.attributes.uv;
  const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    let nx = px - Math.sign(px) * half, ny = py - Math.sign(py) * half, nz = pz - Math.sign(pz) * half;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const x = bx * Math.sign(px) + nx * r, y = by * Math.sign(py) + ny * r, z = bz * Math.sign(pz) + nz * r;
    pos.setXYZ(i, x, y, z); nor.setXYZ(i, nx, ny, nz);
    const side = Math.floor(i / per);
    if (side < 2) tuv.setXY(i, 0.5 + (side ? z : -z) / d, 0.5 + y / h);
    else if (side < 4) tuv.setXY(i, 0.5 + x / w, 0.5 - z / d);
    else tuv.setXY(i, 0.5 + (side === 4 ? x : -x) / w, 0.5 + y / h);
  }
  pos.needsUpdate = nor.needsUpdate = tuv.needsUpdate = true;
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
// A pumpkin: a sphere pinched into ten ribs, a little squashed. th0 / thL cut out a band (a lid or a jaw).
function pumpkinGeo(T, r, ribs, squash, th0, thL) {
  const g = new T.SphereGeometry(r, 40, 20, 0, TAU, th0 || 0, thL || Math.PI), p = g.attributes.position, v = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), k = 1 - 0.07 * Math.pow(Math.abs(Math.cos(a * ribs / 2)), 0.6) + 0.035;
    const pole = 1 - 0.25 * Math.pow(Math.abs(v.y) / r, 4);
    p.setXYZ(i, v.x * k * pole, v.y * squash, v.z * k * pole);
  }
  g.computeVertexNormals();
  return g;
}
// A lumpy head (the giant's): a sphere pushed in and out by a few smooth bumps.
function lumpyGeo(T, r, seed) {
  const g = new T.SphereGeometry(r, 28, 20), p = g.attributes.position, v = new T.Vector3(), rr = rng(seed);
  const bumps = [];
  for (let i = 0; i < 7; i++) bumps.push([rr() * 2 - 1, rr() * 2 - 1, rr() * 2 - 1, (rr() - 0.4) * 0.16]);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let k = 1;
    for (let b = 0; b < bumps.length; b++) { const d = v.x * bumps[b][0] + v.y * bumps[b][1] + v.z * bumps[b][2]; k += bumps[b][3] * Math.max(0, d) * Math.max(0, d); }
    p.setXYZ(i, v.x * r * k * 1.04, v.y * r * k * 0.98, v.z * r * k);
  }
  g.computeVertexNormals();
  return g;
}

/* ---------------- Sculpted body parts ----------------
   Nobody in this game is built from plain tubes. Limbs are turned on a lathe with real muscle shapes (a biceps
   swell, a forearm that thickens below the elbow and thins to the wrist, a thigh and a calf), the torso has a chest,
   a waist and shoulder blades, and hands, feet and heads are sculpted out of spheres, boxes and capsules and
   merged into one mesh each, so a whole hand is still a single draw. Sizes are in feet. */
let TMP = null;
const poseA = [], poseB = [];
function lerpPose(a, b, u, out) { for (let n = 0; n < a.length; n++) out[n] = a[n] + (b[n] - a[n]) * u; return out; }
function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
function gauss(v, w) { return Math.exp(-(v * v) / (w * w)); }

function lathe(T, prof, seg) { return new T.LatheGeometry(prof.map(function (p) { return new T.Vector2(p[0], p[1]); }), seg || 16); }
// A copy of geo moved, turned (Euler or a quaternion) and scaled.
function placed(T, geo, p, r, s) {
  const g = geo.clone(), m = new T.Matrix4(), q = r && r.isQuaternion ? r : new T.Quaternion().setFromEuler(new T.Euler(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0));
  m.compose(new T.Vector3(p[0], p[1], p[2]), q, new T.Vector3(s ? s[0] : 1, s ? s[1] : 1, s ? s[2] : 1));
  g.applyMatrix4(m);
  return g;
}
// Merge several pieces into one geometry. parts: [geometry, material slot]. Slots become groups (for material arrays).
function mergeGeos(T, parts) {
  const pos = [], nor = [], uv = [], idx = [], groups = [];
  let base = 0;
  parts.forEach(function (pt) {
    const g = pt[0], p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); }
    const start = idx.length;
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(i + base);
    groups.push([start, idx.length - start, pt[1] || 0]);
    base += p.count;
  });
  const out = new T.BufferGeometry();
  out.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  out.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  groups.forEach(function (gr) { out.addGroup(gr[0], gr[1], gr[2]); });
  out.computeBoundingSphere();
  return out;
}
// A capsule from point a to point b (radius r0 at a, r1 at b).
function segment(T, a, b, r0, r1) {
  const A = new T.Vector3(a[0], a[1], a[2]), B = new T.Vector3(b[0], b[1], b[2]), d = B.clone().sub(A), l = d.length();
  const g = lathe(T, [[0, -r0], [r0 * 0.7, -r0 * 0.7], [r0, 0], [r1, l], [r1 * 0.7, l + r1 * 0.7], [0, l + r1]], 10);
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
  return placed(T, g, a, q);
}

/* Limbs: radius profiles along a bone of length 1 (radius 1 = the limb's nominal thickness) */
const PROF = {
  upArm: [[0, -0.06], [0.62, -0.03], [0.92, 0.06], [1.0, 0.2], [1.1, 0.42], [1.05, 0.58], [0.88, 0.78], [0.74, 0.94], [0.62, 1.02], [0, 1.06]],
  foreArm: [[0, -0.05], [0.72, -0.02], [1.0, 0.08], [1.1, 0.22], [1.0, 0.4], [0.8, 0.66], [0.62, 0.9], [0.6, 1.0], [0, 1.04]],
  thigh: [[0, -0.05], [0.76, -0.02], [1.0, 0.1], [1.08, 0.3], [1.02, 0.52], [0.86, 0.76], [0.72, 0.94], [0.68, 1.0], [0, 1.04]],
  shin: [[0, -0.04], [0.8, -0.02], [0.98, 0.1], [1.14, 0.26], [1.0, 0.44], [0.74, 0.7], [0.56, 0.9], [0.54, 1.0], [0, 1.03]],
  neck: [[0, 0], [1.28, 0], [1.12, 0.22], [0.95, 0.55], [0.9, 1.0], [0, 1.0]]
};

// The torso: chest, waist, wide shoulders, shoulder blades. u = 0 is the chest (for printed shirts and armor).
function torsoGeo(T) {
  const g = lathe(T, [[0, -0.16], [0.46, -0.14], [0.57, 0.05], [0.56, 0.35], [0.52, 0.62], [0.58, 0.95], [0.68, 1.3], [0.74, 1.6], [0.75, 1.8], [0.66, 1.98], [0.42, 2.1], [0.22, 2.18], [0, 2.2]], 28);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i) * 0.72;
    x *= 1 + 0.13 * ease((y - 1.35) / 0.5) * (y < 2.05 ? 1 : 0.4);            // shoulders
    if (z > 0) {
      const pec = gauss(y - 1.55, 0.24) * (1 - Math.min(1, Math.abs(x) / 0.78));
      z += pec * 0.1 - 0.03 * gauss(x, 0.07) * pec;                            // a chest, with the line down the middle
      z += 0.025 * gauss(y - 0.7, 0.25) * gauss(x, 0.35);                      // a little belly
    } else z -= 0.06 * gauss(y - 1.55, 0.3) * (1 - gauss(x, 0.12) * 0.6);       // shoulder blades
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

// A head: a skull with a brow ridge, eye sockets, cheekbones, a jaw that narrows to a chin. Unit size: scale it.
function headGeo(T, o) {
  o = o || {};
  const g = new T.SphereGeometry(1, 32, 24), p = g.attributes.position, jaw = o.jaw == null ? 0.32 : o.jaw, chin = o.chin == null ? 0.06 : o.chin;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i) * 1.12, z = p.getZ(i);
    if (y < -0.1) { const k = (-0.1 - y) / 1.02; x *= 1 - jaw * k; z *= z > 0 ? 1 - 0.1 * k : 1 - 0.38 * k; }
    if (z < 0 && y > -0.25) z *= 1.08;                                         // the back of the skull
    if (z > 0) {
      z += (o.brow == null ? 0.08 : o.brow) * gauss(y - 0.32, 0.12) * gauss(x, 0.62);
      z -= 0.07 * (gauss(x - 0.36, 0.17) + gauss(x + 0.36, 0.17)) * gauss(y - 0.12, 0.13);
      z += 0.05 * gauss(Math.abs(x) - 0.52, 0.17) * gauss(y + 0.02, 0.15);
      z += chin * gauss(x, 0.26) * gauss(y + 0.95, 0.2);
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/* Hands: wrist at the origin, fingers toward +y, palm toward -x, thumb toward +z (a right hand; the left is mirrored).
   o: fr finger radius, fl finger length, curl (0 open, 1 a loose fist), claw (claw tips in slot 1), wide (palm width). */
function handGeo(T, o) {
  o = o || {};
  const fr = o.fr || 0.034, fl = o.fl || 1, curl = o.curl == null ? 0.35 : o.curl, wd = o.wide || 1, parts = [];
  parts.push([placed(T, roundBox(T, 0.11 * (o.thick || 1), 0.3, 0.27 * wd, 0.05), [0, 0.17, 0]), 0]);
  parts.push([placed(T, new T.SphereGeometry(1, 10, 8), [-0.01, 0.27, 0], null, [0.065, 0.06, 0.15 * wd]), 0]);   // knuckles
  [[-0.095, 0.82], [-0.032, 1.0], [0.032, 0.96], [0.095, 0.74]].forEach(function (f) {
    const L = 0.15 * f[1] * fl, z = f[0] * wd;
    let a = [0, 0.3, z], ang = 0.25 + curl * 0.6;
    for (let k = 0; k < 2; k++) {
      const l = k ? L * 0.8 : L, b = [a[0] - Math.sin(ang) * l, a[1] + Math.cos(ang) * l, z];
      parts.push([segment(T, a, b, fr * (k ? 0.88 : 1), fr * (k ? 0.78 : 0.9)), 0]);
      a = b; ang += 0.35 + curl * 1.0;
    }
    if (o.claw) parts.push([placed(T, new T.ConeGeometry(fr * 0.8, 0.13, 8), [a[0] - Math.sin(ang) * 0.05, a[1] + Math.cos(ang) * 0.05, z], [0, 0, ang]), 1]);
  });
  const t0 = [-0.02, 0.09, 0.12 * wd], t1 = [-0.07, 0.2, 0.2 * wd], t2 = [-0.11 - curl * 0.04, 0.29, 0.2 * wd - curl * 0.05];
  parts.push([segment(T, t0, t1, fr * 1.25, fr * 1.05), 0]);
  parts.push([segment(T, t1, t2, fr * 1.05, fr * 0.9), 0]);
  if (o.claw) parts.push([placed(T, new T.ConeGeometry(fr * 0.8, 0.12, 8), [t2[0] - 0.03, t2[1] + 0.04, t2[2]], [0, 0, 0.6]), 1]);
  return mergeGeos(T, parts);
}

/* Feet: the ankle at the origin, the toe toward +z, the sole at y = -0.2. Slot 0 is the upper, slot 1 the sole or trim.
   kind: shoe, boot, pointy, slipper, paw, bare, sabaton */
function footGeo(T, kind) {
  const g = new T.SphereGeometry(1, 22, 14), p = g.attributes.position, pointy = kind === "pointy";
  for (let i = 0; i < p.count; i++) {
    const x0 = p.getX(i), y0 = p.getY(i), z0 = p.getZ(i);
    const z = z0 * (pointy ? 0.62 : 0.5) + (pointy ? 0.38 : 0.28), u = clamp((z + 0.22) / 1.0, 0, 1);
    let w = 0.12 + 0.055 * Math.sin(u * Math.PI * 0.95) + (kind === "paw" ? 0.04 : 0);
    if (pointy) w *= 1 - 0.75 * ease((z - 0.45) / 0.55);
    const top = (kind === "slipper" ? 0.3 : 0.26) - 0.13 * ease((z - 0.15) / 0.55);
    let y = y0 >= 0 ? -0.12 + y0 * top : -0.12 + y0 * 0.08;
    if (pointy) y += 0.9 * Math.pow(Math.max(0, z - 0.55), 2);                 // the toe curls up
    p.setXYZ(i, x0 * w, y, z);
  }
  g.computeVertexNormals();
  const parts = [[g, 0]];
  if (kind === "shoe" || kind === "boot" || kind === "sabaton") parts.push([placed(T, roundBox(T, 0.34, 0.07, 1.04, 0.035), [0, -0.175, 0.28]), 1]);
  if (kind === "boot") parts.push([placed(T, lathe(T, [[0, 0], [0.19, 0], [0.2, 0.25], [0.21, 0.55], [0, 0.55]], 16), [0, -0.05, 0.02]), 0]);
  if (kind === "slipper") parts.push([placed(T, new T.SphereGeometry(0.1, 10, 8), [0, 0.03, 0.62]), 1]);
  if (kind === "paw") [-0.12, -0.04, 0.04, 0.12].forEach(function (x) {
    parts.push([placed(T, new T.SphereGeometry(1, 10, 8), [x, -0.13, 0.72], null, [0.07, 0.07, 0.1]), 0]);
    parts.push([placed(T, new T.ConeGeometry(0.03, 0.1, 6), [x, -0.15, 0.83], [Math.PI / 2, 0, 0]), 1]);
  });
  if (kind === "sabaton") for (let k = 0; k < 3; k++) parts.push([placed(T, roundBox(T, 0.3, 0.04, 0.14, 0.02), [0, 0.02 - k * 0.04, 0.38 + k * 0.12]), 1]);
  return mergeGeos(T, parts);
}

// Everything the rig shares, made once.
function sculptKit(T, G) {
  G.upArm = lathe(T, PROF.upArm, 14); G.foreArm = lathe(T, PROF.foreArm, 14);
  G.thigh = lathe(T, PROF.thigh, 14); G.shin = lathe(T, PROF.shin, 14); G.neck = lathe(T, PROF.neck, 14);
  G.torso = torsoGeo(T);
  G.head = headGeo(T);
  G.hand = handGeo(T); G.fist = handGeo(T, { curl: 1 });
  G.shoe = footGeo(T, "shoe"); G.boot = footGeo(T, "boot");
}

/* ---------------- People and monsters: jointed figures posed from a short list of numbers ----------------
   The ballplayers' rig, everyone in real human proportions. A pose is: hips x y z, hips turn, shoulders turn, lean,
   left wrist x y z, right wrist x y z, left ankle x y z, right ankle x y z, head turn (the figure's own space, feet
   and degrees, facing +z). Elbows and knees are solved from where the wrists and ankles are; the hands follow the
   forearms. Bigger monsters are the same skeleton drawn larger, with extra bulk. */
function makeFigure(T, G, o) {
  const root = new T.Group(), body = new T.Group();
  root.add(body); body.scale.setScalar(o.scale);
  const mats = [];
  function keep(m) { if (Array.isArray(m)) { m.forEach(keep); return m; } if (m && mats.indexOf(m) < 0) mats.push(m); return m; }
  const bulk = o.bulk || 1, ab = o.armBulk || bulk, lb = o.legBulk || bulk;
  function ball(mat, sx, sy, sz, parent) { const m = new T.Mesh(G.sphere, keep(mat)); m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); (parent || body).add(m); return m; }
  const hips = ball(o.hips || o.thigh, 0.6 * bulk, 0.42, 0.46 * bulk);
  const glutes = [-1, 1].map(function (s) { return ball(o.hips || o.thigh, 0.3 * bulk, 0.32, 0.28 * bulk, hips); });
  glutes.forEach(function (gl, i) { gl.scale.set(0.42, 0.62, 0.45); gl.position.set((i ? 1 : -1) * 0.4, -0.15, -0.5); });
  const upper = new T.Group(); body.add(upper);
  const torso = new T.Mesh(G.torso, keep(o.torso)); torso.scale.set(bulk, 1, bulk); upper.add(torso);
  const trap = ball(o.trap || o.torso, 0.56 * bulk, 0.2, 0.34 * bulk, upper); trap.position.set(0, 1.94, -0.06);
  if (o.belt) { const belt = new T.Mesh(G.belt, keep(o.belt)); belt.scale.set(0.56 * bulk, 0.17, 0.42 * bulk); belt.position.y = 0.04; upper.add(belt); }
  if (o.neck !== false) { const neck = new T.Mesh(G.neck, keep(o.neck || o.skin)); neck.scale.set(0.2 * bulk, 0.5, 0.19 * bulk); neck.position.set(0, 1.98, 0.02); upper.add(neck); }
  const head = new T.Group(); head.position.y = 2.72; upper.add(head);
  function limb(m1, m2, r1, r2, endMat, endR, g1, g2, kneeMat, jk) {
    const L = { up: new T.Mesh(g1, keep(m1)), lo: new T.Mesh(g2, keep(m2)), j0: ball(m1, r1), j1: ball(kneeMat || m2, r2 * jk), end: ball(endMat, endR), r1: r1, r2: r2 };   // joints sized to blend, not to bulge
    body.add(L.up); body.add(L.lo);
    return L;
  }
  const arm = [0, 1].map(function () { return limb(o.sleeve, o.fore || o.skin, 0.2 * ab, 0.16 * ab, o.wrist || o.fore || o.skin, 0.1 * ab, G.upArm, G.foreArm, null, 0.8); });
  arm.forEach(function (L) { L.j0.scale.set(0.27 * ab, 0.3 * ab, 0.27 * ab); L.delt = true; });  // a deltoid cap on every shoulder
  const leg = [0, 1].map(function () { return limb(o.thigh, o.shin || o.thigh, 0.3 * lb, 0.22 * lb, o.ankle || o.shin || o.thigh, 0.13 * lb, G.thigh, G.shin, o.knee, 0.95); });
  const hg = o.handGeo || G.hand, hk = (o.handK || 1) * ab;
  const hand = [0, 1].map(function (s) {
    const m = new T.Mesh(Array.isArray(hg) ? hg[s] : hg, keep(o.hand || o.skin));
    m.scale.set(hk * (s ? 1 : -1), hk, hk);                // the left hand is the right one mirrored
    body.add(m); return m;
  });
  const fk = (o.shoeK || 1) * lb;
  const shoe = [0, 1].map(function () { const m = new T.Mesh(o.footGeo || G.shoe, keep(o.shoe)); m.scale.setScalar(fk); body.add(m); return m; });
  const F = { root: root, body: body, hips: hips, upper: upper, head: head, torso: torso, arm: arm, leg: leg, hand: hand, shoe: shoe, mats: mats, bulk: bulk, keep: keep, ball: ball };
  if (o.headFn) o.headFn(F);
  return F;
}

// Elbow or knee: the joint between A and B for bones l1 and l2, bent toward "pole".
function bend(A, B, pole, l1, l2, out) {
  const t = TMP;
  t.d.subVectors(B, A);
  let d = t.d.length();
  if (d < 1e-4) { t.d.set(0, -1, 0); d = 1e-4; } else t.d.multiplyScalar(1 / d);
  const dm = Math.min(d, (l1 + l2) * 0.999), a = (l1 * l1 - l2 * l2 + dm * dm) / (2 * dm), hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  t.q.copy(pole).addScaledVector(t.d, -pole.dot(t.d));
  if (t.q.lengthSq() < 1e-6) t.q.set(0, 0, 1);
  t.q.normalize();
  out.copy(A).addScaledVector(t.d, a).addScaledVector(t.q, hgt);
}
function bone(mesh, A, B, r) {
  const t = TMP;
  t.d.subVectors(B, A);
  const l = t.d.length() || 1e-4;
  mesh.position.copy(A);
  mesh.quaternion.setFromUnitVectors(t.up, t.d.multiplyScalar(1 / l));
  mesh.scale.set(r, l, r);
}
function setLimb(L, A, B, pole, l1, l2) {
  const t = TMP;
  bend(A, B, pole, l1, l2, t.e);
  bone(L.up, A, t.e, L.r1); bone(L.lo, t.e, B, L.r2);
  L.j0.position.copy(A); L.j1.position.copy(t.e); L.end.position.copy(B);
  if (L.delt) { L.j0.quaternion.copy(L.up.quaternion); L.j0.position.addScaledVector(t.d.subVectors(t.e, A).normalize(), 0.08); }
}
// Turn a hand to follow its forearm: fingers along the forearm, the back of the hand outward, the thumb forward.
function placeHand(P, s) {
  const L = P.arm[s], t = TMP, h = P.hand[s];
  t.d.subVectors(L.end.position, L.j1.position).normalize();
  t.f.set(0, 0.7 * Math.max(0, t.d.z), 1).normalize();
  t.x.crossVectors(t.d, t.f);
  if (t.x.lengthSq() < 1e-6) t.x.set(-1, 0, 0);
  t.x.normalize(); t.z.crossVectors(t.x, t.d);
  t.m.makeBasis(t.x, t.d, t.z);
  h.quaternion.setFromRotationMatrix(t.m);
  h.position.copy(L.end.position);
}
function applyPose(P, v) {
  const t = TMP, hy = v[3] * DEG, uy = v[4] * DEG, ch = Math.cos(hy), sh = Math.sin(hy), cu = Math.cos(uy), su = Math.sin(uy), bk = P.bulk;
  P.hips.position.set(v[0], v[1], v[2]); P.hips.rotation.y = hy;
  P.upper.position.set(v[0], v[1], v[2]); P.upper.rotation.set(v[5] * DEG, uy, 0, "YXZ");
  P.upper.updateMatrix();
  P.head.rotation.y = (v[18] - v[4]) * DEG;
  for (let s = 0; s < 2; s++) {                             // 0 = left, 1 = right
    const sg = s ? -1 : 1, px = sg * 0.5, pz = -0.5;
    t.a.set(sg * 0.82 * bk, 1.86, 0).applyMatrix4(P.upper.matrix);
    t.b.set(v[6 + s * 3], v[7 + s * 3], v[8 + s * 3]);
    t.p.set(px * cu + pz * su, -0.8, -px * su + pz * cu);   // elbows hang down, out and a little back
    setLimb(P.arm[s], t.a, t.b, t.p, 1.15, 1.12);
    placeHand(P, s);
    t.a.set(v[0] + sg * 0.4 * bk * ch, v[1] - 0.08, v[2] - sg * 0.4 * bk * sh);
    t.b.set(v[12 + s * 3], v[13 + s * 3] + 0.14, v[14 + s * 3]);
    t.p.set(sh + sg * 0.25 * ch, 0.2, ch - sg * 0.25 * sh); // knees point where the hips face
    setLimb(P.leg[s], t.a, t.b, t.p, 1.5, 1.48);
    P.shoe[s].position.set(t.b.x, v[13 + s * 3] + 0.02, t.b.z);
    P.shoe[s].rotation.y = hy * 0.6;
  }
}
// Put a prop in a hand (sword, potion), pointing along the forearm, a little way into the palm.
function holdAlong(P, s, mesh, push) {
  const L = P.arm[s], t = TMP;
  t.d.subVectors(L.end.position, L.j1.position).normalize();
  mesh.position.copy(L.end.position).addScaledVector(t.d, push == null ? 0.2 : push);
  mesh.quaternion.setFromUnitVectors(t.up, t.d);
}

/* ---------------- Faces ----------------
   face(F, h, o) puts a face on a head group built on G.head scaled to HS: eyes (whites and irises, or a glow),
   brows, a nose, a mouth (a smile, a grim line, or open with teeth) and ears. Pieces share a few materials. */
const HS = [0.44, 0.47, 0.46];
function face(T, G, F, h, o) {
  const M = { lam: function (c, e) { return F.keep(new T.MeshLambertMaterial(Object.assign({ color: c }, e || {}))); } };
  const skin = o.skin, out = {};
  const fg = new T.Group(); fg.scale.set(o.w || 1, o.h || 1, o.d || 1); h.add(fg); out.fg = fg; h = fg;   // a wider or taller head carries its features with it
  const hm = new T.Mesh(o.geo || G.head, F.keep(skin)); hm.scale.set(HS[0], HS[1], HS[2]); h.add(hm); out.head = hm;
  const ey = o.eyeY == null ? 0.06 : o.eyeY, ex = o.eyeX || 0.155;
  out.eyes = [-1, 1].map(function (s) {
    const g = new T.Group(); g.position.set(s * ex, ey, 0.355); h.add(g);
    if (o.glow) { const e = new T.Mesh(G.sphere, new T.MeshBasicMaterial({ color: o.glow })); e.scale.set(0.068, 0.05, 0.04); e.position.z = 0.03; g.add(e); }
    else {
      const w = new T.Mesh(G.sphere, o.white || (o.white = F.keep(new T.MeshPhongMaterial({ color: 0xfbf8f0, specular: 0xffffff, shininess: 80 })))); w.scale.set(0.072, 0.06, 0.05); g.add(w);
      const ir = new T.Mesh(G.sphere, o.irisM || (o.irisM = F.keep(new T.MeshPhongMaterial({ color: o.iris || 0x3a2414, specular: 0xffffff, shininess: 120 })))); ir.scale.set(0.038, 0.04, 0.03); ir.position.z = 0.032; g.add(ir);
      if (o.pupil) { const pp = new T.Mesh(G.sphere, new T.MeshBasicMaterial({ color: o.pupil })); pp.scale.set(0.02, 0.03, 0.02); pp.position.z = 0.05; g.add(pp); }
    }
    const lid = new T.Mesh(G.sphere, F.keep(skin)); lid.scale.set(0.082, 0.035, 0.06); lid.position.set(0, 0.045, 0.004); g.add(lid);
    return g;
  });
  const bm = M.lam(o.brow || 0x2a1a10);
  out.brows = [-1, 1].map(function (s) {
    const b = new T.Mesh(roundBox(T, 0.16, o.browH || 0.035, 0.05, 0.016), bm); b.position.set(s * (ex + 0.01), ey + 0.11, 0.405);
    b.rotation.set(-0.2, s * 0.25, s * (o.browTilt || 0.12)); h.add(b); return b;
  });
  if (o.nose !== false) {
    const n = new T.Mesh(o.noseGeo || G.nose, F.keep(o.noseM || skin)); n.position.set(0, ey - 0.08, 0.42); n.scale.setScalar(o.noseK || 1); h.add(n); out.nose = n;
  }
  const my = o.mouthY == null ? -0.22 : o.mouthY;
  const mouth = new T.Group(); mouth.position.set(0, my, 0.39); h.add(mouth); out.mouth = mouth;
  const lips = M.lam(o.lips || 0x8a3a30);
  if (o.mouth === "open" || o.mouth === "fangs" || o.mouth === "grin") {
    const hole = new T.Mesh(G.sphere, M.lam(0x2a0a10)); hole.scale.set(o.mouth === "grin" ? 0.13 : 0.095, 0.045, 0.03); mouth.add(hole); out.hole = hole;
    const lip = new T.Mesh(new T.TorusGeometry(o.mouth === "grin" ? 0.12 : 0.09, 0.016, 6, 18), lips); lip.scale.set(1, 0.45, 0.6); mouth.add(lip);
    const teethM = M.lam(0xfbf6e8);
    if (o.mouth === "fangs") [-1, 1].forEach(function (s) { const f = new T.Mesh(G.cone, teethM); f.scale.set(0.022, 0.07, 0.02); f.rotation.x = Math.PI; f.position.set(s * 0.05, 0.03, 0.015); mouth.add(f); });
    else { const tb = new T.Mesh(roundBox(T, o.mouth === "grin" ? 0.2 : 0.14, 0.03, 0.02, 0.01), teethM); tb.position.set(0, 0.022, 0.012); mouth.add(tb); }
  } else {
    const arc = new T.Mesh(new T.TorusGeometry(0.085, 0.017, 6, 18, Math.PI * 0.7), lips);
    arc.rotation.z = o.mouth === "frown" ? Math.PI * 0.15 : -Math.PI * 0.85; arc.position.y = o.mouth === "frown" ? -0.045 : 0.06; arc.scale.set(1, o.mouth === "flat" ? 0.25 : 0.55, 0.6);
    mouth.add(arc);
  }
  out.white = o.white;
  if (o.ears !== false) out.ears = [-1, 1].map(function (s) {
    const e = new T.Mesh(o.earGeo || G.ear, F.keep(o.earM || skin)); e.position.set(s * 0.43, 0.02, -0.02); e.scale.set(s, 1, 1); h.add(e); return e;
  });
  return out;
}
// The shared face pieces: a nose with a bridge, nostrils and a tip; an ear with a rim.
function faceKit(T, G) {
  G.nose = mergeGeos(T, [
    [segment(T, [0, 0.09, -0.02], [0, -0.02, 0.06], 0.03, 0.045), 0],
    [placed(T, new T.SphereGeometry(1, 10, 8), [0, -0.035, 0.06], null, [0.05, 0.04, 0.04]), 0],
    [placed(T, new T.SphereGeometry(1, 8, 6), [0.04, -0.05, 0.035], null, [0.03, 0.025, 0.03]), 0],
    [placed(T, new T.SphereGeometry(1, 8, 6), [-0.04, -0.05, 0.035], null, [0.03, 0.025, 0.03]), 0]]);
  G.ear = mergeGeos(T, [
    [placed(T, new T.SphereGeometry(1, 12, 10), [0.02, 0, 0], [0, 0.35, 0], [0.04, 0.11, 0.07]), 0],
    [placed(T, new T.TorusGeometry(0.06, 0.016, 6, 14, Math.PI * 1.4), [0.04, 0.01, 0], [0, Math.PI / 2 + 0.35, Math.PI * 0.8], [1, 1.5, 1]), 0]]);
}

/* ---------------- The cast ----------------
   K is the kit buildScene hands over: three.js, shared geometry, the texture maker, the env map, the wordmark.
   Every character here is an original design built for this game. */

function kitMats(K) {
  const T = K.T;
  return {
    lam: function (c, o) { return new T.MeshLambertMaterial(Object.assign({ color: c }, o || {})); },
    pho: function (c, spec, shin, o) { return new T.MeshPhongMaterial(Object.assign({ color: c, specular: spec == null ? 0x444444 : spec, shininess: shin == null ? 30 : shin }, o || {})); },
    shiny: function (c, refl, o) { return new T.MeshPhongMaterial(Object.assign({ color: c, specular: 0xffffff, shininess: 90, envMap: K.env, combine: T.AddOperation, reflectivity: refl == null ? 0.2 : refl }, o || {})); },
    glow: function (c) { return new T.MeshBasicMaterial({ color: c }); }
  };
}
// A tapered, muscled part between two points (a horse's leg, a nightcap), from a lathe profile.
function limbGeo(T, prof, a, b, r) {
  const A = new T.Vector3(a[0], a[1], a[2]), d = new T.Vector3(b[0], b[1], b[2]).sub(A), l = d.length();
  const g = lathe(T, prof.map(function (p) { return [p[0] * r, p[1] * l]; }), 14);
  return placed(T, g, a, new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()));
}
// A snout or a muzzle: a sphere drawn out forward (+z), narrowing to the tip, flat underneath. Its back sits at the origin.
function snoutGeo(T, len, w, h) {
  const g = new T.SphereGeometry(1, 20, 14), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = Math.max(0, z);
    p.setXYZ(i, x * w * (1 - 0.35 * f), (y < 0 ? y * 0.6 : y) * h * (1 - 0.25 * f), z * len + len * 0.9);
  }
  g.computeVertexNormals();
  return g;
}
// A carved pumpkin head with a hinged jaw: the lid and face up top, a glow inside, a toothy jaw that drops open.
function jackHead(K, F, r, kind, keep) {
  const T = K.T, M = kitMats(K), g = new T.Group();
  const skin = keep(M.lam(0xffffff, { map: K.tex(carvedCanvas(kind)), emissive: 0xffa21a, emissiveMap: K.tex(carvedCanvas(kind, true)), side: T.DoubleSide }));
  const plain = keep(M.lam(0xffffff, { map: K.tex(pumpkinCanvas(null)), side: T.DoubleSide }));
  const top = new T.Mesh(pumpkinGeo(T, r, 10, 0.86, 0, Math.PI * 0.64), skin); g.add(top);
  const inside = new T.Mesh(K.G.sphere, M.glow(0xffb43a)); inside.scale.setScalar(r * 0.8); inside.position.y = -r * 0.1; g.add(inside);
  const rimY = Math.cos(Math.PI * 0.64) * r * 0.86;
  const hinge = new T.Group(); hinge.position.set(0, rimY, -r * 0.55); g.add(hinge);
  const jaw = new T.Mesh(pumpkinGeo(T, r * 0.98, 10, 0.86, Math.PI * 0.62, Math.PI * 0.38), plain); jaw.position.set(0, -rimY, r * 0.55); hinge.add(jaw);
  const tooth = keep(M.lam(0xffd9a0, { emissive: 0x6a3000 }));
  [-0.55, -0.18, 0.2, 0.56].forEach(function (a, i) {
    const t = new T.Mesh(K.G.cone, tooth); t.scale.set(r * 0.07, r * (i % 2 ? 0.16 : 0.2), r * 0.06);
    t.position.set(Math.sin(a) * r * 0.82, -0.005, Math.cos(a) * r * 0.82 + r * 0.55); hinge.add(t);
  });
  const stem = new T.Mesh(K.G.cyl, keep(M.lam(0x3d6b2a))); stem.scale.set(r * 0.12, r * 0.32, r * 0.12); stem.position.y = r * 0.78; stem.rotation.z = 0.2; g.add(stem);
  return { g: g, hinge: hinge };
}

/* The collector: the Nostalgia Pro look from the main game. NP cap, black NP tee, jeans, sneakers. */
function buildHero(K) {
  const T = K.T, G = K.G, M = kitMats(K);
  const skin = M.lam(0xf1c28e), hair = M.lam(0x4a2f1c);
  const tee = M.pho(0xffffff, 0x222222, 8, { map: K.tex(teeCanvas(K.script)) });
  const jeans = M.lam(0xffffff, { map: K.tex(denimCanvas(), true) });
  const cap = M.pho(0xffffff, 0x333333, 20, { map: K.tex(capCanvas()) });
  const F = makeFigure(T, G, {
    scale: HERO_K, torso: tee, trap: M.lam(0x1b1b22), sleeve: M.lam(0x1b1b22), skin: skin, hips: jeans, thigh: jeans, shin: jeans, ankle: M.lam(0xf2f0e8),
    shoe: [M.pho(0x2b2422, 0x666666, 40), M.lam(0xf4f1e8)], belt: M.pho(0x3a2414, 0x444444, 30), handGeo: K.G.handHero,
    headFn: function (F) {
      const h = F.head;
      face(T, G, F, h, { skin: skin, iris: 0x4a2a14, brow: 0x4a2f1c, browTilt: -0.04, mouth: "smile", lips: 0xb0625a });
      const crown = new T.Mesh(G.dome, F.keep(cap)); crown.scale.set(0.5, 0.5, 0.52); crown.position.y = 0.15; h.add(crown);
      const brim = F.ball(M.pho(0x141e3a, 0x333333, 20), 0.4, 0.045, 0.42, h); brim.position.set(0, 0.21, 0.47);
      const back = F.ball(hair, 0.45, 0.3, 0.4, h); back.position.set(0, -0.06, -0.16);
      [-1, 1].forEach(function (s) { const sb = F.ball(hair, 0.06, 0.13, 0.08, h); sb.position.set(s * 0.41, -0.04, 0.12); });
      const strap = F.ball(M.lam(0x0b1022), 0.16, 0.07, 0.05, h); strap.position.set(0, 0.08, -0.5);
    }
  });
  const corn = new T.Mesh(G.corn, K.cornMat); corn.scale.setScalar(0.62); F.body.add(corn);
  const holder = new T.Group(); holder.add(F.root);
  F.root.rotation.y = Math.PI;                              // he faces the TV, so the camera sees the wordmark on his back
  return { holder: holder, F: F, corn: corn };
}

/* Monster poses: [idle, wind-up, strike]. The attack plays wind-up then strike then back to idle. */
function attackPose(set, a, out) {
  if (a < 0.16) return lerpPose(set[0], set[1], ease(a / 0.16), out);
  if (a < 0.36) return lerpPose(set[1], set[2], ease((a - 0.16) / 0.2), out);
  if (a < 0.9) return lerpPose(set[2], set[0], ease((a - 0.36) / 0.54), out);
  for (let i = 0; i < set[0].length; i++) out[i] = set[0][i];
  return out;
}
function mouthOpen(a) { return a < 0.12 ? ease(a / 0.12) : a < 0.5 ? 1 : 1 - ease((a - 0.5) / 0.3); }
// The little extras every monster does: breathing, flinching when hit.
function liven(v, c, breathe) {
  v[1] += Math.sin(c.t * (breathe || 2.6)) * 0.04;
  v[5] += Math.sin(c.t * (breathe || 2.6) + 1) * 1.5;
  if (c.hit < 0.14) { const k = 1 - c.hit / 0.14; v[5] -= 7 * k; v[2] -= 0.15 * k; }
  return v;
}

function buildMonsters(K) {
  const T = K.T, G = K.G, M = kitMats(K), list = {};

  /* ---- SIR GOURDSWORTH, the Pumpkin Knight: a jack-o'-lantern head with vine brows and a jaw that drops open to
          spit seeds, a kettle helm with a red plume, plate armor, gauntlets, a sword and a round shield ---- */
  (function () {
    const steel = M.shiny(0xc9ccd8, 0.25), dark = M.pho(0x4b5266, 0x888888, 50), chain = M.pho(0x6d7488, 0x999999, 60);
    const tunic = M.lam(0xd8641e);
    let jaw = null;
    const F = makeFigure(T, G, {
      scale: 25, bulk: 1.15, torso: M.shiny(0xffffff, 0.18, { map: K.tex(plateCanvas()) }), trap: steel, sleeve: chain, fore: steel, hand: steel, handK: 1.1,
      handGeo: [K.G.gauntlet, K.G.gauntletFist], hips: tunic, thigh: chain, shin: steel, knee: steel, ankle: steel, shoe: [steel, dark], footGeo: footGeo(T, "sabaton"), shoeK: 1.1, neck: dark,
      headFn: function (F) {
        const h = F.head, jh = jackHead(K, F, 0.62, "knight", F.keep); h.add(jh.g); jaw = jh.hinge;
        const vine = F.keep(M.lam(0x2f5a1e));
        [-1, 1].forEach(function (s) { const b = new T.Mesh(roundBox(T, 0.3, 0.06, 0.07, 0.03), vine); b.position.set(s * 0.2, 0.17, 0.5); b.rotation.set(-0.35, s * 0.3, s * 0.38); h.add(b); });
        const helm = new T.Mesh(G.dome, F.keep(steel)); helm.scale.set(0.6, 0.5, 0.6); helm.position.y = 0.3; h.add(helm);
        const brim = new T.Mesh(new T.CylinderGeometry(0.84, 0.88, 0.07, 28), F.keep(steel)); brim.position.y = 0.32; h.add(brim);
        const band = new T.Mesh(new T.CylinderGeometry(0.61, 0.61, 0.09, 24, 1, true), F.keep(M.pho(0x8a1420, 0x553333, 20, { side: T.DoubleSide }))); band.position.y = 0.38; h.add(band);
        const plume = new T.Group(); plume.position.set(0, 0.76, -0.05); h.add(plume);
        const red = F.keep(M.lam(0xe4343e));
        for (let i = 0; i < 4; i++) {
          const f = new T.Mesh(G.cone, red); f.scale.set(0.12, 0.9 - i * 0.12, 0.12);
          f.rotation.x = -0.5 - i * 0.28; f.position.set((i - 1.5) * 0.04, 0, -i * 0.08); plume.add(f);
        }
      }
    });
    [-1, 1].forEach(function (s) {                          // pauldrons
      const pd = new T.Mesh(G.dome, F.keep(steel)); pd.scale.set(0.52, 0.44, 0.54); pd.position.set(s * 0.98, 1.86, 0); pd.rotation.z = -s * 0.35; F.upper.add(pd);
    });
    const sword = new T.Group();
    const blade = new T.Mesh(roundBox(T, 0.16, 3.0, 0.05, 0.02), F.keep(M.shiny(0xe8ecf6, 0.35))); blade.position.y = 1.75; sword.add(blade);
    const guard = new T.Mesh(roundBox(T, 0.86, 0.12, 0.14, 0.05), F.keep(M.shiny(0xffcf3a, 0.3))); guard.position.y = 0.22; sword.add(guard);
    const grip = new T.Mesh(G.cyl, F.keep(M.lam(0x3a1d0c))); grip.scale.set(0.06, 0.5, 0.06); grip.position.y = -0.25; sword.add(grip);
    const pommel = new T.Mesh(G.sphere, F.keep(M.shiny(0xffcf3a, 0.3))); pommel.scale.setScalar(0.09); pommel.position.y = -0.3; sword.add(pommel);
    F.body.add(sword);
    const shield = new T.Mesh(new T.CylinderGeometry(0.95, 0.95, 0.12, 28), [F.keep(steel), F.keep(M.pho(0xffffff, 0x666666, 40, { map: K.tex(shieldCanvas()) })), F.keep(steel)]);
    shield.rotation.x = Math.PI / 2; F.body.add(shield);
    const POSES = [
      [0, 2.95, 0, 0, 0, 4, 0.85, 3.9, 0.95, -1.05, 3.3, 0.7, 0.6, 0.2, 0.1, -0.6, 0.2, -0.1, 0],
      [0, 2.9, -0.05, -10, -25, -6, 0.9, 3.9, 0.9, -0.7, 6.8, -0.2, 0.6, 0.2, 0.1, -0.6, 0.2, -0.2, 0],
      [0, 2.75, 0.2, 10, 20, 18, 0.9, 3.7, 1.0, -0.3, 3.4, 2.1, 0.6, 0.2, 0.3, -0.6, 0.2, -0.3, 0]
    ];
    list.pumpkin = { F: F, lift: 0, update: function (c) {
      attackPose(POSES, c.atk, poseA); liven(poseA, c, 2.2);
      applyPose(F, poseA);
      holdAlong(F, 1, sword, 0.24);
      const L = F.arm[0];
      shield.position.lerpVectors(L.j1.position, L.end.position, 0.55); shield.position.z += 0.3;
      jaw.rotation.x = mouthOpen(c.atk) * 0.55 + (Shell.reduced ? 0 : Math.max(0, Math.sin(c.t * 3)) * 0.05);
    } };
  })();

  /* ---- COUNT FANGWORTH, up past his bedtime: a gaunt night owl in a striped nightcap, a velvet smoking jacket, a cape,
          a monocle and slippers; red eyes, arched brows, a waxed moustache and two small fangs ---- */
  (function () {
    const skin = M.lam(0xd9cfee), velvet = M.pho(0xffffff, 0x553366, 25, { map: K.tex(velvetCanvas()) }), velvetPlain = M.pho(0x4b1a7a, 0x553366, 25);
    const black = M.pho(0x1c1424, 0x2a2232, 18), glove = M.lam(0xf2eef8), lining = M.lam(0xb0182e, { side: T.BackSide }), outside = M.pho(0x1a0f22, 0x553366, 30);
    const capStripe = M.lam(0xffffff, { map: K.tex(stripeCanvas("#7a3ad8", "#f4ead0", 8), true) });
    let fc = null;
    const F = makeFigure(T, G, {
      scale: 26, bulk: 0.88, torso: velvet, trap: velvetPlain, sleeve: velvetPlain, fore: velvetPlain, hand: glove, skin: skin, hips: black, thigh: black, shin: black,
      shoe: [M.lam(0x6a2aa8), M.lam(0xffd23f)], footGeo: footGeo(T, "slipper"), shoeK: 1.05,
      headFn: function (F) {
        const h = F.head;
        fc = face(T, G, F, h, { geo: headGeo(T, { jaw: 0.42, chin: 0.12, brow: 0.1 }), h: 1.07, skin: skin, iris: 0xd81e2e, pupil: 0x000000, brow: 0x1a1024, browTilt: 0.32,
                                mouth: "fangs", lips: 0x5a1020, earGeo: K.G.earPoint, noseK: 1.15 });
        [-1, 1].forEach(function (s) {
          const st = F.ball(M.lam(0x1a1024), 0.1, 0.02, 0.025, h); st.position.set(s * 0.09, -0.155, 0.45); st.rotation.z = s * 0.3;   // a thin waxed moustache
          const tip = F.ball(M.lam(0x1a1024), 0.045, 0.016, 0.016, h); tip.position.set(s * 0.19, -0.12, 0.42); tip.rotation.z = s * 1.0;
          const burn = F.ball(M.lam(0x1a1024), 0.05, 0.12, 0.07, h); burn.position.set(s * 0.4, 0.05, 0.08);
        });
        const mon = new T.Mesh(new T.TorusGeometry(0.085, 0.014, 6, 16), F.keep(M.shiny(0xffcf3a, 0.3))); mon.position.set(-0.155, 0.06, 0.46); fc.fg.add(mon);
        // the nightcap: a striped cuff, then a long floppy cone that bends over the back, a pompom on the end
        const cuff = new T.Mesh(new T.CylinderGeometry(0.47, 0.49, 0.15, 24), F.keep(M.lam(0xf4ead0))); cuff.position.y = 0.33; h.add(cuff);
        const NC = [[0, 1.1], [1, 1], [0.7, 0], [0, 0]];
        const capG = mergeGeos(T, [
          [limbGeo(T, [[0, -0.02], [1, 0], [0.82, 0.5], [0.62, 1.0], [0, 1.02]], [0, 0.36, 0], [0.04, 0.82, -0.12], 0.46), 0],
          [limbGeo(T, [[0, -0.05], [1, 0], [0.7, 0.6], [0.5, 1.0], [0, 1.03]], [0.04, 0.8, -0.12], [0.26, 1.02, -0.42], 0.3), 0],
          [limbGeo(T, [[0, -0.05], [1, 0], [0.6, 0.6], [0.3, 1.0], [0, 1.05]], [0.25, 1.0, -0.42], [0.5, 0.86, -0.66], 0.17), 0]]);
        void NC;
        const capM = new T.Mesh(capG, F.keep(capStripe)); h.add(capM);
        const pom = F.ball(M.lam(0xffd23f), 0.11, 0.11, 0.11, h); pom.position.set(0.53, 0.82, -0.7);
        const collar = new T.Group(); collar.position.set(0, -0.55, -0.08); h.add(collar);
        const cg = new T.CylinderGeometry(0.78, 0.5, 1.0, 18, 1, true, Math.PI - 1.35, 2.7);
        collar.add(new T.Mesh(cg, F.keep(outside)), new T.Mesh(cg, F.keep(lining)));
      }
    });
    // The cape: open behind him, or wrapped all the way round when it is up.
    const openGeo = new T.CylinderGeometry(0.95, 2.15, 4.6, 26, 4, true, Math.PI - 1.8, 3.6);
    const shutGeo = new T.CylinderGeometry(0.95, 1.55, 4.6, 26, 4, true, 0.32, TAU - 0.64);
    const cape = new T.Group(); cape.position.y = 2.75; F.body.add(cape);
    const capeOut = new T.Mesh(openGeo, F.keep(outside)), capeIn = new T.Mesh(openGeo, F.keep(lining));
    cape.add(capeOut, capeIn);
    const POSES = [
      [0, 3.1, 0, 0, 0, 0, 1.4, 3.7, 0.4, -1.4, 3.7, 0.4, 0.32, 0.25, 0, -0.32, 0.25, 0, 0],
      [0, 3.1, 0, 0, -15, -4, 1.3, 3.8, 0.4, -1.0, 6.4, 0.6, 0.32, 0.25, 0, -0.32, 0.25, 0, 0],
      [0, 3.05, 0.1, 0, 15, 8, 1.3, 3.8, 0.5, -0.5, 4.9, 2.1, 0.32, 0.25, 0.05, -0.32, 0.25, -0.05, 0]
    ];
    const SHUT = [0, 3.05, 0, 0, 0, 4, -0.35, 4.7, 0.78, 0.35, 4.75, 0.84, 0.3, 0.25, 0, -0.3, 0.25, 0, 0];
    let shut = 0;
    list.count = { F: F, lift: 10, update: function (c) {
      attackPose(POSES, c.atk, poseA); liven(poseA, c, 1.6);
      shut += ((c.shield > 0 ? 1 : 0) - shut) * Math.min(1, c.dt * 14);
      lerpPose(poseA, SHUT, ease(shut), poseB);
      applyPose(F, poseB);
      const g = shut > 0.5 ? shutGeo : openGeo;
      if (capeOut.geometry !== g) { capeOut.geometry = g; capeIn.geometry = g; }
      cape.scale.set(1 + Math.sin(c.t * 2.3) * 0.03, 1, 1 + Math.sin(c.t * 2.3) * 0.03);
      fc.mouth.scale.y = 1 + mouthOpen(c.atk) * 0.8;
    } };
  })();

  /* ---- WOLFGANG HOWLBERT: a hunched wolf-man in a torn blue flannel and an orange bandana; a long muzzle with a
          jaw that snaps open, heavy brows, yellow eyes, clawed hands and paws, a big tail ---- */
  (function () {
    const furC = "#7a5434", fur = M.lam(0xffffff, { map: K.tex(furCanvas(furC), true) }), light = M.lam(0xd8b48a), claw = M.pho(0xf4efdf, 0xffffff, 60);
    const flannel = M.lam(0xffffff, { map: K.tex(flannelCanvas(furC)) }), sleeve = M.lam(0xffffff, { map: K.tex(flannelCanvas(null), true) });
    const jeans = M.lam(0xffffff, { map: K.tex(denimCanvas("#2c3f66"), true) });
    let jaw = null;
    const F = makeFigure(T, G, {
      scale: 26, bulk: 1.25, armBulk: 1.2, torso: flannel, trap: fur, sleeve: sleeve, fore: fur, hand: [fur, claw], handGeo: K.G.clawHand, skin: fur,
      hips: jeans, thigh: jeans, shin: fur, knee: jeans, ankle: fur, shoe: [fur, claw], footGeo: footGeo(T, "paw"), shoeK: 1.15,
      headFn: function (F) {
        const h = F.head;
        const skull = new T.Mesh(headGeo(T, { jaw: 0.18, brow: 0.14, chin: 0 }), F.keep(fur)); skull.scale.set(0.5, 0.45, 0.47); h.add(skull);
        const muz = new T.Mesh(snoutGeo(T, 0.3, 0.2, 0.15), F.keep(light)); muz.position.set(0, -0.08, 0.2); h.add(muz);
        const bridge = new T.Mesh(snoutGeo(T, 0.27, 0.13, 0.08), F.keep(fur)); bridge.position.set(0, 0.0, 0.22); h.add(bridge);
        const nose = F.ball(M.pho(0x101014, 0xffffff, 90), 0.085, 0.06, 0.07, h); nose.position.set(0, -0.02, 0.76);
        const teeth = F.keep(M.pho(0xfbf6e8, 0xffffff, 60));
        [-0.08, -0.03, 0.03, 0.08].forEach(function (x, i) { const t = new T.Mesh(G.cone, teeth); t.scale.set(0.025, i % 3 ? 0.06 : 0.1, 0.025); t.rotation.x = Math.PI; t.position.set(x, -0.15, 0.62 - Math.abs(x) * 0.8); h.add(t); });
        jaw = new T.Group(); jaw.position.set(0, -0.2, 0.2); h.add(jaw);
        const jm = new T.Mesh(snoutGeo(T, 0.26, 0.16, 0.07), F.keep(light)); jm.scale.y = -1; jaw.add(jm);
        const tongue = F.ball(M.lam(0xd8506a), 0.1, 0.02, 0.2, jaw); tongue.position.set(0, 0.02, 0.32);
        [-0.07, 0.07].forEach(function (x) { const t = new T.Mesh(G.cone, teeth); t.scale.set(0.024, 0.08, 0.024); t.position.set(x, 0.0, 0.48); jaw.add(t); });
        [-1, 1].forEach(function (s) {
          const eg = new T.Group(); eg.position.set(s * 0.17, 0.08, 0.38); h.add(eg);
          const ew = new T.Mesh(G.sphere, F.keep(M.pho(0xffd23f, 0xffffff, 90, { emissive: 0x5a3a00 }))); ew.scale.set(0.07, 0.055, 0.045); eg.add(ew);
          const pp = new T.Mesh(G.sphere, M.glow(0x0a0a0a)); pp.scale.set(0.02, 0.045, 0.02); pp.position.z = 0.04; eg.add(pp);
          const brow = new T.Mesh(roundBox(T, 0.22, 0.07, 0.1, 0.03), F.keep(M.lam(0x4a321e))); brow.position.set(s * 0.17, 0.2, 0.41); brow.rotation.set(-0.3, s * 0.2, s * 0.42); h.add(brow);
          const ear = new T.Mesh(G.cone, F.keep(fur)); ear.scale.set(0.15, 0.42, 0.09); ear.position.set(s * 0.3, 0.38, -0.06); ear.rotation.z = -s * 0.25; h.add(ear);
          const inner = new T.Mesh(G.cone, F.keep(M.lam(0xc87a7a))); inner.scale.set(0.08, 0.3, 0.04); inner.position.set(s * 0.3, 0.4, -0.01); inner.rotation.z = -s * 0.25; h.add(inner);
          const tuft = new T.Mesh(G.cone, F.keep(fur)); tuft.scale.set(0.14, 0.32, 0.1); tuft.position.set(s * 0.44, -0.18, 0.06); tuft.rotation.z = -s * 2.2; h.add(tuft);
        });
      }
    });
    const band = new T.Mesh(new T.TorusGeometry(0.36, 0.08, 8, 20), F.keep(M.lam(0xff8a1f))); band.rotation.x = Math.PI / 2 - 0.1; band.scale.set(1.15, 1.15, 1); band.position.set(0, 1.97, 0.02); F.upper.add(band);   // the bandana
    const knot = new T.Mesh(G.cone, F.keep(M.lam(0xff8a1f))); knot.scale.set(0.2, 0.42, 0.06); knot.rotation.x = Math.PI + 0.35; knot.position.set(0, 1.95, 0.44); F.upper.add(knot);
    const tail = new T.Mesh(limbGeo(T, [[0, 0], [0.8, 0.02], [1, 0.3], [0.8, 0.7], [0.3, 0.95], [0, 1]], [0, 0, 0], [0, 1.6, 0], 0.32), F.keep(fur)); F.body.add(tail);
    const POSES = [
      [0, 2.75, -0.1, 0, 0, 24, 1.25, 3.3, 1.3, -1.25, 3.3, 1.3, 0.62, 0.2, 0.25, -0.62, 0.2, -0.25, 0],
      [0, 2.85, -0.2, 0, 0, -4, 1.5, 6.3, 0.2, -1.5, 6.3, 0.2, 0.62, 0.2, 0.2, -0.62, 0.2, -0.2, 0],
      [0, 2.5, 0.3, 0, 0, 38, 0.75, 2.4, 2.3, -0.75, 2.4, 2.3, 0.62, 0.2, 0.4, -0.62, 0.2, -0.2, 0]
    ];
    list.wolf = { F: F, lift: 0, update: function (c) {
      attackPose(POSES, c.atk, poseA); liven(poseA, c, 3.4);
      poseA[18] = Math.sin(c.t * 1.3) * 12;
      applyPose(F, poseA);
      tail.position.set(0, poseA[1] - 0.1, poseA[2] - 0.6);
      tail.rotation.set(-2.2, 0, Math.sin(c.t * 7) * 0.35);
      jaw.rotation.x = mouthOpen(c.atk) * 0.6 + (Shell.reduced ? 0 : 0.06 + 0.06 * Math.sin(c.t * 5));
    } };
  })();

  /* ---- PHARAOH WRAPSODY: wrapped head to toe, a striped gold and lapis headcloth, glowing eyes in dark sockets,
          a scowl, wrapped fingers, loose ends trailing from the wrists ---- */
  (function () {
    const tw = K.tex(wrapCanvas(), true);
    const wrap = M.lam(0xffffff, { map: tw }), gold = M.shiny(0xffcf3a, 0.3), nemes = M.pho(0xffffff, 0x666666, 40, { map: K.tex(nemesCanvas(), true) });
    let fc = null;
    const F = makeFigure(T, G, {
      scale: 25, torso: wrap, sleeve: wrap, fore: wrap, hand: wrap, handGeo: K.G.mummyHand, skin: wrap, hips: wrap, thigh: wrap, shin: wrap, shoe: [wrap, wrap], footGeo: footGeo(T, "bare"),
      headFn: function (F) {
        const h = F.head;
        [-1, 1].forEach(function (s) { const sk = F.ball(M.lam(0x1b140c), 0.1, 0.075, 0.05, h); sk.position.set(s * 0.155, 0.06, 0.37); });
        fc = face(T, G, F, h, { skin: wrap, glow: 0x3ff0ff, brow: 0xa8966a, browH: 0.05, browTilt: 0.3, mouth: "open", lips: 0x6a5a3a, ears: false, noseK: 0.9 });
        [-1, 1].forEach(function (s) {
          const flap = new T.Mesh(roundBox(T, 0.24, 1.0, 0.16, 0.05), F.keep(nemes)); flap.position.set(s * 0.44, -0.5, 0.16); h.add(flap);
        });
        // the headcloth: a cap over the crown and down to the brow, then falling to the shoulders at the sides and back, open at the face
        const hoodG = mergeGeos(T, [[new T.SphereGeometry(1, 20, 6, 0, TAU, 0, Math.PI * 0.3), 0],
                                    [new T.SphereGeometry(1, 20, 6, Math.PI / 2 + 0.95, TAU - 1.9, Math.PI * 0.3, Math.PI * 0.34), 0]]);
        const hood = new T.Mesh(hoodG, F.keep(M.pho(0xffffff, 0x666666, 40, { map: K.tex(nemesCanvas(), true), side: T.DoubleSide }))); hood.scale.set(0.5, 0.62, 0.53); hood.position.set(0, 0.02, -0.02); h.add(hood);
        const browBand = new T.Mesh(new T.TorusGeometry(0.47, 0.035, 6, 28, Math.PI * 0.7), F.keep(gold)); browBand.rotation.set(Math.PI / 2, 0, Math.PI * 0.15); browBand.position.y = 0.2; browBand.scale.set(1, 1.04, 1); h.add(browBand);
        const back = new T.Mesh(roundBox(T, 0.9, 0.9, 0.3, 0.12), F.keep(nemes)); back.position.set(0, -0.35, -0.38); h.add(back);
        const crown = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.09, 24, 1, true), F.keep(M.shiny(0xffcf3a, 0.3, { side: T.DoubleSide }))); crown.position.y = 0.3; crown.scale.set(0.98, 1, 1.03); h.add(crown);
        const gem = F.ball(M.glow(0x3ff0ff), 0.05, 0.05, 0.03, h); gem.position.set(0, 0.24, 0.48);
      }
    });
    const collar = new T.Mesh(new T.CylinderGeometry(0.42, 0.95, 0.4, 24, 1, true), F.keep(M.shiny(0x2a50c8, 0.2, { side: T.DoubleSide }))); collar.position.y = 1.86; F.upper.add(collar);
    const collarRim = new T.Mesh(new T.TorusGeometry(0.95, 0.06, 6, 24), F.keep(gold)); collarRim.rotation.x = Math.PI / 2; collarRim.position.y = 1.66; F.upper.add(collarRim);
    const endGeo = new T.PlaneGeometry(0.14, 0.85, 1, 4); endGeo.translate(0, -0.42, 0);
    const ends = [0, 1].map(function () { const m = new T.Mesh(endGeo, F.keep(M.lam(0xffffff, { map: tw, side: T.DoubleSide }))); F.body.add(m); return m; });
    const POSES = [
      [0, 3.0, 0, 0, 0, 8, 0.7, 4.7, 1.95, -0.7, 4.7, 1.95, 0.42, 0.2, 0.15, -0.42, 0.2, -0.15, 0],
      [0, 3.0, 0, 0, 0, -4, 0.55, 5.6, 1.2, -0.55, 5.6, 1.2, 0.42, 0.2, 0.1, -0.42, 0.2, -0.1, 0],
      [0, 2.9, 0.1, 0, 0, 14, 2.05, 4.6, 0.7, -2.05, 4.6, 0.7, 0.42, 0.2, 0.2, -0.42, 0.2, -0.2, 0]
    ];
    list.mummy = { F: F, lift: 0, update: function (c) {
      attackPose(POSES, c.atk, poseA); liven(poseA, c, 1.4);
      const sh = Math.sin(c.t * 3.2);                       // the shuffle
      poseA[14] += sh * 0.25; poseA[17] -= sh * 0.25; poseA[13] += Math.max(0, sh) * 0.15; poseA[16] += Math.max(0, -sh) * 0.15;
      poseA[3] = sh * 6;
      applyPose(F, poseA);
      for (let s = 0; s < 2; s++) { const L = F.arm[s]; ends[s].position.copy(L.end.position); ends[s].rotation.set(Math.sin(c.t * 5 + s) * 0.4 - 0.2, 0, Math.sin(c.t * 4 + s * 2) * 0.5); }
      fc.mouth.scale.set(1, 0.7 + mouthOpen(c.atk) * 0.9, 1);
    } };
  })();

  /* ---- LUGNUT, the Patchwork Giant: stitched patches of skin, overalls, a big jutting jaw with an underbite and two
          tusks, heavy brows, brass goggles pushed up, an orange tuft, huge hands, a lightning rod on his back ---- */
  (function () {
    const skin = M.lam(0xffffff, { map: K.tex(patchCanvas(), true) });
    const denim = M.lam(0xffffff, { map: K.tex(denimCanvas("#33456e"), true) }), bootM = M.pho(0x15161c, 0x666666, 30);
    let fc = null;
    const F = makeFigure(T, G, {
      scale: 26, bulk: 1.5, armBulk: 1.45, legBulk: 1.35, torso: M.lam(0xffffff, { map: K.tex(overallCanvas()) }), trap: M.lam(0xc2683a),
      sleeve: M.lam(0xc2683a), fore: skin, hand: skin, handGeo: K.G.bigHand, handK: 1.1, skin: skin, hips: denim, thigh: denim, shin: denim, ankle: bootM, shoe: [bootM, M.lam(0x3a2414)], footGeo: K.G.boot, shoeK: 1.1,
      headFn: function (F) {
        const h = F.head;
        fc = face(T, G, F, h, { geo: headGeo(T, { jaw: 0.02, chin: 0.2, brow: 0.18 }), w: 1.25, h: 1.08, d: 1.12, skin: skin, iris: 0x2a2d38, brow: 0x3a1d10, browH: 0.065, browTilt: 0.22,
                                mouth: "open", lips: 0x4a5a6a, noseK: 1.4, eyeX: 0.16 });
        fc.white.color.set(0xf0e6c0);
        const tusk = F.keep(M.pho(0xf4ead0, 0xffffff, 60));
        [-1, 1].forEach(function (s) { const t = new T.Mesh(G.cone, tusk); t.scale.set(0.03, 0.09, 0.03); t.position.set(s * 0.065, -0.02, 0.02); fc.mouth.add(t); });
        const brass = F.keep(M.shiny(0xe0a050, 0.3)), lens = F.keep(M.pho(0x3ff0ff, 0xffffff, 120, { emissive: 0x0a4a55 }));
        const fg = new T.Group(); fg.scale.set(1.25, 1.08, 1.12); h.add(fg);
        const strap = new T.Mesh(new T.TorusGeometry(0.47, 0.035, 6, 28), F.keep(M.lam(0x3a2414))); strap.rotation.x = Math.PI / 2 - 0.35; strap.position.y = 0.42; fg.add(strap);
        [-1, 1].forEach(function (s) {
          const rim = new T.Mesh(new T.TorusGeometry(0.11, 0.035, 8, 16), brass); rim.position.set(s * 0.15, 0.47, 0.3); rim.rotation.x = -1.0; fg.add(rim);
          const gl = new T.Mesh(new T.CircleGeometry(0.1, 16), lens); gl.position.set(s * 0.15, 0.475, 0.31); gl.rotation.x = -1.0; fg.add(gl);
        });
        const seam = new T.Mesh(roundBox(T, 0.025, 0.28, 0.025, 0.01), F.keep(M.lam(0x2a2d38))); seam.position.set(0.28, -0.12, 0.4); seam.rotation.z = 0.35; fg.add(seam);
        for (let k = 0; k < 4; k++) { const st = new T.Mesh(roundBox(T, 0.08, 0.02, 0.025, 0.01), F.keep(M.lam(0x2a2d38))); st.position.set(0.28 - (k - 1.5) * 0.034, -0.12 + (k - 1.5) * 0.065, 0.41); st.rotation.z = 0.35; fg.add(st); }
        for (let k = 0; k < 6; k++) { const tf = new T.Mesh(G.cone, F.keep(M.lam(0xff7a2a))); tf.scale.set(0.09, 0.28, 0.09); tf.position.set((k - 2.5) * 0.08, 0.5, -0.05 + (k % 2) * 0.1); tf.rotation.z = (k - 2.5) * 0.18; fg.add(tf); }
      }
    });
    const pack = new T.Mesh(roundBox(T, 1.4, 1.3, 0.7, 0.2), F.keep(M.pho(0x3a3e4a, 0x888888, 40))); pack.position.set(0, 1.3, -0.9); F.upper.add(pack);
    const rod = new T.Mesh(G.cyl, F.keep(M.shiny(0xc98a3a, 0.3))); rod.scale.set(0.06, 3.3, 0.06); rod.position.set(0.3, 1.6, -1.0); F.upper.add(rod);
    for (let k = 0; k < 4; k++) { const coil = new T.Mesh(new T.TorusGeometry(0.17, 0.045, 6, 14), F.keep(M.shiny(0xe0a050, 0.3))); coil.rotation.x = Math.PI / 2; coil.position.set(0.3, 2.3 + k * 0.22, -1.0); F.upper.add(coil); }
    const tip = new T.Mesh(G.sphere, M.glow(0x9ff6ff)); tip.scale.setScalar(0.14); tip.position.set(0.3, 4.95, -1.0); F.upper.add(tip);
    const spark = new T.Sprite(new T.SpriteMaterial({ map: K.glowTex, color: 0x3ff0ff, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
    spark.scale.set(2.2, 2.2, 1); spark.position.copy(tip.position); F.upper.add(spark);
    const POSES = [
      [0, 2.9, 0, 0, 0, 8, 1.75, 3.0, 0.6, -1.75, 3.0, 0.6, 0.72, 0.2, 0, -0.72, 0.2, 0, 0],
      [0, 2.95, 0, 0, 0, -6, 0.75, 7.3, 0.35, -0.75, 7.3, 0.35, 0.72, 0.2, 0, -0.72, 0.2, 0, 0],
      [0, 2.6, 0.2, 0, 0, 26, 0.6, 2.9, 2.0, -0.6, 2.9, 2.0, 0.72, 0.2, 0.2, -0.72, 0.2, -0.2, 0]
    ];
    list.giant = { F: F, lift: 0, update: function (c) {
      attackPose(POSES, c.atk, poseA); liven(poseA, c, 1.8);
      const st = Math.sin(c.t * 2.4);                       // a heavy sway from foot to foot
      poseA[0] += st * 0.12; poseA[3] = st * 5;
      applyPose(F, poseA);
      const zap = c.atk < 0.5 ? 1 : 0.35 + 0.25 * Math.sin(c.t * 9);
      spark.material.opacity = Shell.reduced ? 0.6 : zap * (0.6 + 0.4 * Math.sin(c.t * 37));
      spark.scale.setScalar(1.6 + zap * 1.6);
      fc.mouth.scale.set(1, 0.8 + mouthOpen(c.atk) * 0.9, 1);
    } };
  })();

  /* ---- HAGATHA BREWSWORTH: a lilac-skinned witch riding side-saddle on her broom; a hooked nose, a pointed chin,
          a crooked grin, yellow eyes, wild orange hair, a patched hat, long fingers, striped stockings ---- */
  (function () {
    const skin = M.lam(0xb9a7dc), dress = M.lam(0xffffff, { map: K.tex(dressCanvas(), true) }), hat = M.pho(0x1a0f26, 0x553366, 30);
    const hairM = M.lam(0xe0521e), stock = M.lam(0xffffff, { map: K.tex(stripeCanvas("#ff8a1f", "#1a0f26", 10), true) });
    let fc = null;
    const F = makeFigure(T, G, {
      scale: 22, bulk: 0.95, torso: dress, sleeve: dress, fore: skin, hand: skin, handGeo: [K.G.longHand, K.G.longFist], skin: skin, hips: dress, thigh: dress, shin: stock, ankle: stock,
      shoe: [M.pho(0x0c0a10, 0x666666, 50), M.lam(0xffd23f)], footGeo: footGeo(T, "pointy"), shoeK: 1.05,
      headFn: function (F) {
        const h = F.head;
        fc = face(T, G, F, h, { geo: headGeo(T, { jaw: 0.45, chin: 0.24 }), h: 1.05, skin: skin, iris: 0xffd23f, pupil: 0x000000, brow: 0x9a3a14, browTilt: 0.34,
                                mouth: "grin", lips: 0x5a2a6a, noseGeo: K.G.hookNose, ears: false });
        const wart = F.ball(M.lam(0x8a6ab8), 0.035, 0.035, 0.035, h); wart.position.set(0.05, -0.05, 0.6);
        [-1, 1].forEach(function (s) {
          for (let k = 0; k < 4; k++) { const lock = new T.Mesh(G.cone, F.keep(hairM)); lock.scale.set(0.13, 0.6, 0.13); lock.position.set(s * (0.36 + k * 0.05), -0.3 - k * 0.04, -0.08 - k * 0.1); lock.rotation.set(0.2 * k, 0, Math.PI - s * (0.25 + k * 0.12)); h.add(lock); }
        });
        const back = F.ball(hairM, 0.46, 0.42, 0.42, h); back.position.set(0, -0.04, -0.16);
        const hatG = new T.Group(); hatG.position.set(0, 0.32, -0.04); hatG.rotation.x = -0.2; h.add(hatG);
        const brim = new T.Mesh(new T.CylinderGeometry(1.05, 1.05, 0.05, 30), F.keep(hat)); hatG.add(brim);
        const cone1 = new T.Mesh(new T.CylinderGeometry(0.3, 0.52, 0.9, 20), F.keep(hat)); cone1.position.y = 0.45; hatG.add(cone1);
        const cone2 = new T.Mesh(new T.CylinderGeometry(0.02, 0.3, 0.9, 16), F.keep(hat)); cone2.position.set(0, 1.25, -0.16); cone2.rotation.x = -0.45; hatG.add(cone2);
        const bandG = new T.Mesh(new T.CylinderGeometry(0.51, 0.53, 0.14, 20, 1, true), F.keep(M.lam(0xff8a1f, { side: T.DoubleSide }))); bandG.position.y = 0.1; hatG.add(bandG);
        const patch = new T.Mesh(roundBox(T, 0.22, 0.2, 0.04, 0.02), F.keep(M.lam(0x58c322))); patch.position.set(0.18, 0.55, 0.38); patch.rotation.x = -0.2; hatG.add(patch);
      }
    });
    const skirt = new T.Mesh(new T.CylinderGeometry(0.62, 1.3, 1.8, 22, 1, true), F.keep(M.lam(0xffffff, { map: K.tex(dressCanvas(), true), side: T.DoubleSide })));
    F.body.add(skirt);
    const broom = new T.Group(); broom.position.set(0, 2.78, -0.05); F.body.add(broom);
    const handle = new T.Mesh(G.cyl, F.keep(M.pho(0x8a5a2b, 0x553311, 30))); handle.scale.set(0.075, 6.4, 0.075); handle.rotation.z = Math.PI / 2; handle.position.x = 3.6; broom.add(handle);
    const bristle = new T.Mesh(new T.CylinderGeometry(0.15, 0.46, 1.4, 14, 1, false), F.keep(M.lam(0xc9a26a))); bristle.rotation.z = Math.PI / 2; bristle.position.x = -3.5; broom.add(bristle);
    const tie = new T.Mesh(new T.TorusGeometry(0.2, 0.06, 6, 14), F.keep(M.lam(0xff8a1f))); tie.rotation.y = Math.PI / 2; tie.position.x = -2.85; broom.add(tie);
    const potion = new T.Group(); F.body.add(potion);
    const flask = new T.Mesh(G.sphere, F.keep(M.pho(0x5aff9a, 0xffffff, 90, { emissive: 0x1a8a3a }))); flask.scale.setScalar(0.3); potion.add(flask);
    const neckP = new T.Mesh(G.cyl, F.keep(M.pho(0x9fffc4, 0xffffff, 90))); neckP.scale.set(0.09, 0.3, 0.09); neckP.position.y = 0.2; potion.add(neckP);
    const cork = F.ball(M.lam(0x8a5a2b), 0.08, 0.06, 0.08, potion); cork.position.y = 0.52;
    const POSES = [
      [0, 3.05, 0, 0, 0, -4, 1.0, 2.95, 0.12, -1.05, 4.1, 0.85, 0.36, 1.3, 1.6, -0.36, 1.25, 1.55, 0],
      [0, 3.05, 0, 0, -22, -8, 1.0, 2.95, 0.12, -1.25, 5.6, -0.7, 0.36, 1.3, 1.6, -0.36, 1.25, 1.55, 0],
      [0, 3.05, 0.05, 0, 20, 10, 1.0, 2.95, 0.12, -0.6, 4.8, 2.0, 0.36, 1.3, 1.6, -0.36, 1.25, 1.55, 0]
    ];
    list.witch = { F: F, lift: 34, bob: 6, update: function (c) {
      attackPose(POSES, c.atk, poseA); liven(poseA, c, 2.0);
      const kick = Math.sin(c.t * 2.2) * 0.25; poseA[14] += kick; poseA[17] -= kick;
      applyPose(F, poseA);
      skirt.position.set(poseA[0], poseA[1] - 0.55, poseA[2] + 0.35); skirt.rotation.x = 0.55;
      broom.rotation.z = Math.sin(c.t * 1.7) * 0.04;
      potion.visible = !(c.atk > 0.3 && c.atk < 0.75);
      holdAlong(F, 1, potion, 0.3); potion.quaternion.identity();
      fc.mouth.scale.set(1, 1 + mouthOpen(c.atk) * 0.6, 1);
    } };
  })();

  /* ---- THE HEADLESS HAYRIDER: a rider with nothing above the collar who carries his face in his hand (a jack-o'-lantern
          with arched brows and a jaw that cackles), riding a galloping horse made of hay with ember eyes and a jaw of its own ---- */
  (function () {
    const K16 = 19, straw = M.lam(0xffffff, { map: K.tex(strawCanvas(), true) }), strawD = M.lam(0xb07a2a), strawL = M.lam(0xe0b860);
    const coat = M.lam(0xffffff, { map: K.tex(coatCanvas()) }), coatP = M.lam(0x2a1838), boots = M.pho(0x2a160c, 0x886644, 50), glove = M.lam(0x1a0e14);
    const all = new T.Group(); all.scale.setScalar(K16);
    const mats = [];
    function keep(m) { if (Array.isArray(m)) { m.forEach(keep); return m; } if (mats.indexOf(m) < 0) mats.push(m); return m; }
    const horse = new T.Group(); all.add(horse);
    // the barrel: a chest in front, a round rump behind
    const barrelG = lathe(T, [[0, -2.4], [0.7, -2.28], [1.12, -1.75], [1.22, -0.9], [1.1, 0.1], [1.18, 1.1], [1.05, 1.85], [0.6, 2.3], [0, 2.4]], 22);
    barrelG.rotateX(Math.PI / 2); barrelG.scale(0.9, 1.05, 1);
    const barrel = new T.Mesh(barrelG, keep(straw)); barrel.position.y = 4.3; horse.add(barrel);
    const neck = new T.Mesh(limbGeo(T, [[0, -0.1], [1, 0], [0.9, 0.4], [0.72, 0.8], [0.66, 1.0], [0, 1.1]], [0, 4.7, 1.6], [0, 6.55, 2.85], 0.78), keep(straw)); horse.add(neck);
    const headH = new T.Group(); headH.position.set(0, 6.55, 3.0); horse.add(headH);
    const skullG = snoutGeo(T, 0.85, 0.42, 0.42); skullG.rotateX(0.75);
    const skull = new T.Mesh(skullG, keep(straw)); skull.position.set(0, 0.1, -0.35); headH.add(skull);
    const jawH = new T.Group(); jawH.position.set(0, -0.35, 0.05); headH.add(jawH);
    const jawG = snoutGeo(T, 0.62, 0.3, 0.18); jawG.rotateX(0.75);
    const jawM = new T.Mesh(jawG, keep(strawL)); jawM.position.set(0, 0, -0.1); jawH.add(jawM);
    [-1, 1].forEach(function (s) {
      const ember = new T.Mesh(G.sphere, M.glow(0xff7a1a)); ember.scale.set(0.12, 0.1, 0.1); ember.position.set(s * 0.37, 0.22, 0.05); headH.add(ember);
      const brow = new T.Mesh(roundBox(T, 0.3, 0.08, 0.14, 0.04), keep(strawD)); brow.position.set(s * 0.33, 0.36, 0.06); brow.rotation.set(0, s * 0.3, s * 0.3); headH.add(brow);
      const ear = new T.Mesh(G.cone, keep(strawD)); ear.scale.set(0.14, 0.42, 0.1); ear.position.set(s * 0.24, 0.5, -0.18); ear.rotation.z = -s * 0.2; headH.add(ear);
      const nost = new T.Mesh(G.sphere, keep(M.lam(0x3a1a08))); nost.scale.set(0.06, 0.08, 0.04); nost.position.set(s * 0.14, -0.5, 0.92); nost.rotation.x = 0.75; headH.add(nost);
    });
    for (let k = 0; k < 7; k++) { const mn = new T.Mesh(G.cone, keep(M.lam(0x7a3a12))); mn.scale.set(0.16, 0.7, 0.12); mn.position.set(0, 6.4 - k * 0.32, 2.45 - k * 0.3); mn.rotation.x = -0.9; horse.add(mn); }
    const LEG_UP = [[0, -0.06], [0.85, -0.02], [1.0, 0.12], [1.05, 0.3], [0.8, 0.62], [0.55, 0.92], [0.5, 1.0], [0, 1.05]];
    const LEG_LO = [[0, -0.05], [0.9, -0.02], [1.0, 0.08], [0.7, 0.25], [0.62, 0.7], [0.9, 0.86], [0.85, 0.96], [0, 1.0]];
    const upG = lathe(T, LEG_UP, 12), loG = lathe(T, LEG_LO, 12);
    const legs = [];
    [[0.6, 1.6, 0], [-0.6, 1.6, Math.PI], [0.6, -1.6, Math.PI * 0.5], [-0.6, -1.6, Math.PI * 1.5]].forEach(function (p) {
      const hip = new T.Group(); hip.position.set(p[0], 3.9, p[1]); horse.add(hip);
      const up = new T.Mesh(upG, keep(straw)); up.scale.set(0.4, 2.0, 0.4); up.rotation.x = Math.PI; hip.add(up);
      const knee = new T.Group(); knee.position.y = -2.0; hip.add(knee);
      const lo = new T.Mesh(loG, keep(straw)); lo.scale.set(0.24, 1.75, 0.24); lo.rotation.x = Math.PI; knee.add(lo);
      const hoof = new T.Mesh(new T.CylinderGeometry(0.24, 0.32, 0.3, 12), keep(M.pho(0x1a1014, 0x666666, 40))); hoof.position.y = -1.85; knee.add(hoof);
      legs.push({ hip: hip, knee: knee, ph: p[2] });
    });
    const tail = new T.Group(); tail.position.set(0, 4.7, -2.35); horse.add(tail);
    for (let k = 0; k < 5; k++) { const st = new T.Mesh(G.cone, keep(strawD)); st.scale.set(0.12, 1.6, 0.12); st.rotation.x = Math.PI - 0.5 - k * 0.08; st.rotation.z = (k - 2) * 0.12; st.position.y = -0.2; tail.add(st); }
    const saddle = new T.Mesh(roundBox(T, 1.6, 0.35, 1.7, 0.15), keep(M.pho(0x4b1a7a, 0x553366, 30))); saddle.position.set(0, 5.45, 0); horse.add(saddle);
    const blanket = new T.Mesh(roundBox(T, 2.5, 0.12, 1.4, 0.06), keep(M.lam(0xff8a1f))); blanket.position.set(0, 5.3, 0); horse.add(blanket);
    // the rider
    const F = makeFigure(T, G, {
      scale: 1, torso: coat, trap: coatP, sleeve: coatP, fore: coatP, hand: glove, handGeo: K.G.fist, hips: coatP, thigh: M.lam(0x1a1420), shin: boots, ankle: boots, shoe: [boots, M.lam(0x1a0e08)], footGeo: K.G.boot, neck: false,
      headFn: function (F) {
        const h = F.head;
        const cg = new T.CylinderGeometry(0.5, 0.38, 0.7, 14, 1, true);
        const jag = cg.attributes.position;
        for (let i = 0; i < jag.count; i++) if (jag.getY(i) > 0) jag.setY(i, jag.getY(i) + ((i % 3) - 1) * 0.12);
        const collar = new T.Mesh(cg, F.keep(M.lam(0x2a1838, { side: T.DoubleSide }))); collar.position.y = -0.65; h.add(collar);
        const stump = new T.Mesh(new T.CircleGeometry(0.34, 14), M.glow(0x14081c)); stump.rotation.x = -Math.PI / 2; stump.position.y = -0.62; h.add(stump);
      }
    });
    keep(F.mats);
    F.root.position.y = 2.5; all.add(F.root);
    const wisp = new T.Sprite(new T.SpriteMaterial({ map: K.glowTex, color: 0xa77bff, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
    wisp.scale.set(1.3, 1.8, 1); F.head.add(wisp); wisp.position.y = -0.1;
    const tails = new T.Mesh(new T.CylinderGeometry(0.62, 1.45, 2.0, 20, 1, true, Math.PI - 1.9, 3.8), keep(M.lam(0x2a1838, { side: T.DoubleSide })));
    F.body.add(tails);
    const cape = new T.Mesh(new T.CylinderGeometry(0.9, 1.8, 3.2, 20, 3, true, Math.PI - 1.4, 2.8), keep(M.lam(0x5a1030, { side: T.DoubleSide })));
    F.upper.add(cape); cape.position.set(0, 0.35, -0.05);
    // his face, carried in his hand
    const lantern = new T.Group(); F.body.add(lantern);
    const jh = jackHead(K, F, 0.48, "lantern", keep); jh.g.position.y = 0.5; lantern.add(jh.g);
    const lglow = new T.Sprite(new T.SpriteMaterial({ map: K.glowTex, color: 0xff9a2a, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
    lglow.scale.set(2.4, 2.4, 1); lglow.position.y = 0.5; lantern.add(lglow);
    const POSES = [
      [0, 3.05, 0, 0, 0, 6, 0.45, 3.75, 1.2, -1.0, 6.3, 0.5, 1.3, 1.05, 0.3, -1.3, 1.05, 0.3, 0],
      [0, 3.05, 0, 0, -20, -6, 0.45, 3.75, 1.2, -1.1, 6.4, -0.6, 1.3, 1.05, 0.3, -1.3, 1.05, 0.3, 0],
      [0, 3.05, 0.1, 0, 22, 14, 0.45, 3.75, 1.2, -0.5, 4.9, 2.2, 1.3, 1.05, 0.3, -1.3, 1.05, 0.3, 0]
    ];
    list.horse = { F: F, root: all, mats: mats, faceAt: jh.g, lift: 0, update: function (c) {
      const gal = Shell.reduced ? 0 : c.t * 11;
      horse.position.y = Math.abs(Math.sin(gal)) * 0.25;
      for (let i = 0; i < legs.length; i++) { const l = legs[i], a = Math.sin(gal + l.ph); l.hip.rotation.x = a * 0.55; l.knee.rotation.x = -Math.max(0, Math.cos(gal + l.ph)) * 0.9; }
      headH.rotation.x = Math.sin(gal * 2) * 0.08; tail.rotation.x = 0.3 + Math.sin(gal) * 0.2;
      jawH.rotation.x = 0.12 + (Shell.reduced ? 0 : Math.max(0, Math.sin(gal * 0.5)) * 0.25);
      attackPose(POSES, c.atk, poseA); liven(poseA, c, 3.0);
      poseA[1] += horse.position.y;
      applyPose(F, poseA);
      tails.position.set(0, poseA[1] - 0.75, poseA[2]);
      cape.rotation.x = -0.1 - Math.abs(Math.sin(gal)) * 0.12;
      lantern.visible = !(c.atk > 0.3 && c.atk < 0.7);
      holdAlong(F, 1, lantern, 0.25); lantern.quaternion.identity();
      jh.hinge.rotation.x = Shell.reduced ? 0.15 : 0.1 + Math.abs(Math.sin(c.t * 9)) * 0.35;   // cackling
      lglow.material.opacity = 0.65 + 0.2 * Math.sin(c.t * 13);
    } };
  })();

  // Wrap each one in a group the scene can move about, and collect the materials the hit flash lights up.
  BOSSES.forEach(function (d) {
    const m = list[d.id];
    m.id = d.id;
    m.group = new T.Group();
    m.group.add(m.root || m.F.root);
    const mats = m.mats || m.F.mats;
    m.flashMats = mats.filter(function (x) { return x.emissive; });
    m.flashMats.forEach(function (x) { x.userData.e0 = x.emissive.clone(); });
  });
  return list;
}

// The hands and faces the cast shares, made once.
function castKit(T, G) {
  G.handHero = handGeo(T, { curl: 0.45 });
  G.gauntlet = handGeo(T, { fr: 0.045, thick: 1.35, wide: 1.1, curl: 0.35 });
  G.gauntletFist = handGeo(T, { fr: 0.045, thick: 1.35, wide: 1.1, curl: 1 });
  G.clawHand = handGeo(T, { fr: 0.045, wide: 1.15, claw: true, curl: 0.55 });
  G.mummyHand = handGeo(T, { fr: 0.032, curl: 0.25 });
  G.bigHand = handGeo(T, { fr: 0.056, wide: 1.25, thick: 1.3, curl: 0.5 });
  G.longHand = handGeo(T, { fr: 0.027, fl: 1.35, curl: 0.5 });
  G.longFist = handGeo(T, { fr: 0.027, fl: 1.35, curl: 0.95 });
  G.earPoint = mergeGeos(T, [[placed(T, new T.ConeGeometry(1, 1, 10), [0.04, 0.1, -0.03], [0, 0.35, -0.55], [0.05, 0.3, 0.09]), 0],
                             [placed(T, new T.SphereGeometry(1, 10, 8), [0.02, -0.02, 0], [0, 0.35, 0], [0.04, 0.1, 0.08]), 0]]);
  G.hookNose = mergeGeos(T, [[segment(T, [0, 0.1, -0.02], [0, 0.0, 0.12], 0.035, 0.045), 0], [segment(T, [0, 0.0, 0.12], [0, -0.1, 0.24], 0.045, 0.03), 0],
                             [segment(T, [0, -0.1, 0.24], [0, -0.16, 0.2], 0.03, 0.018), 0]]);
}

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x0b0716, 1);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(CAM.fov, W / H, 40, 4000);
  const caps = renderer.capabilities;
  const aniso = Math.min(4, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  TMP = { a: new T.Vector3(), b: new T.Vector3(), d: new T.Vector3(), e: new T.Vector3(), p: new T.Vector3(), q: new T.Vector3(), f: new T.Vector3(), x: new T.Vector3(), z: new T.Vector3(), m: new T.Matrix4(), up: new T.Vector3(0, 1, 0) };

  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = aniso;
    return t;
  }
  function decal(mat, order) { mat.transparent = true; mat.depthWrite = false; mat._order = order; return mat; }
  function add(mesh, parent) { if (mesh.material && mesh.material._order) mesh.renderOrder = mesh.material._order; (parent || scene).add(mesh); return mesh; }
  // A flat rectangle on the floor at height y, centered at (x, z). Texture "up" points toward the TV.
  function flat(w, d, x, y, z, mat, su, sv) {
    const g = new T.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    if (su) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }
    const m = new T.Mesh(g, mat);
    m.position.set(x, y, z);
    return add(m);
  }

  const script = scriptCanvas(scriptImg);
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;
  const tGlow = tex(glowCanvas()), tShadow = tex(shadowCanvas()), tRing = tex(ringCanvas());
  const G = { sphere: new T.SphereGeometry(1, 16, 12) };
  G.cyl = new T.CylinderGeometry(0.86, 1, 1, 10, 1, true); G.cyl.translate(0, 0.5, 0);
  G.belt = new T.CylinderGeometry(1, 0.98, 1, 16);
  G.dome = new T.SphereGeometry(1, 18, 9, 0, TAU, 0, Math.PI * 0.56);
  G.cone = new T.ConeGeometry(1, 1, 10); G.cone.translate(0, 0.5, 0);
  sculptKit(T, G); faceKit(T, G); castKit(T, G);           // muscles, hands, feet, heads and faces
  G.corn = new T.LatheGeometry([[0, 0], [0.5, 0], [0.55, 0.12], [0.46, 0.5], [0.3, 0.85], [0.13, 1.1], [0, 1.18]].map(function (p) { return new T.Vector2(p[0], p[1]); }), 12);
  G.corn.scale(1, 1, 0.55); G.corn.translate(0, -0.55, 0);
  const cornMat = new T.MeshPhongMaterial({ map: tex(cornCanvas()), specular: 0xffffff, shininess: 70 });
  const K = { T: T, G: G, tex: tex, env: tEnv, script: script, glowTex: tGlow, cornMat: cornMat };

  /* lights: a late-night living room, lit by the lamp on one side and the TV's blue glow from the far end */
  scene.add(new T.HemisphereLight(0xc8b8ff, 0x3b2418, 1.35));
  const key = new T.DirectionalLight(0xffe2bc, 2.1); key.position.set(160, 420, 380); scene.add(key);
  const rim = new T.DirectionalLight(0x6fb8ff, 1.3); rim.position.set(-120, 220, -520); scene.add(rim);

  /* the room */
  const floorT = tex(floorCanvas(), true);
  flat(ROOM_X * 2 + 40, FRONT_Z - BACK_Z + 40, 0, 0, (FRONT_Z + BACK_Z) / 2, new T.MeshLambertMaterial({ map: floorT }), (ROOM_X * 2 + 40) / 160, (FRONT_Z - BACK_Z + 40) / 160);
  const rugMat = decal(new T.MeshLambertMaterial({ map: tex(rugCanvas(script)) }), 1);
  flat(340, 420, 0, 0.3, Z(300), rugMat);
  const wallT = tex(wallCanvas(), true);
  function wall(w, x, z, ry) {
    const g = new T.PlaneGeometry(w, ROOM_H);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * w / 120);
    const m = new T.Mesh(g, new T.MeshLambertMaterial({ map: wallT }));
    m.position.set(x, ROOM_H / 2, z); m.rotation.y = ry; scene.add(m);
    return m;
  }
  wall(ROOM_X * 2, 0, BACK_Z, 0);
  wall(FRONT_Z - BACK_Z, -ROOM_X, (FRONT_Z + BACK_Z) / 2, Math.PI / 2);
  wall(FRONT_Z - BACK_Z, ROOM_X, (FRONT_Z + BACK_Z) / 2, -Math.PI / 2);
  // a window with the moon on the left wall, the late show's poster on the right
  const win = new T.Group(); win.position.set(-ROOM_X + 1, 150, -170); win.rotation.y = Math.PI / 2; scene.add(win);
  win.add(new T.Mesh(new T.PlaneGeometry(120, 100), new T.MeshBasicMaterial({ map: tex(windowCanvas()) })));
  const trim = new T.MeshLambertMaterial({ color: 0xe8d8c0 });
  [[0, 52, 130, 6], [0, -52, 130, 6], [-62, 0, 6, 108], [62, 0, 6, 108], [0, 0, 4, 100], [0, 0, 120, 4]].forEach(function (b) { const m = new T.Mesh(new T.BoxGeometry(b[2], b[3], 4), trim); m.position.set(b[0], b[1], 1); win.add(m); });
  const poster = new T.Mesh(new T.PlaneGeometry(76, 107), new T.MeshLambertMaterial({ map: tex(posterCanvas(script)) }));
  poster.position.set(ROOM_X - 1, 160, -200); poster.rotation.y = -Math.PI / 2; scene.add(poster);

  /* the console TV the monsters climb out of */
  const woodMat = new T.MeshPhongMaterial({ color: 0x6b3a1c, specular: 0x553322, shininess: 40 });
  const tvG = new T.Group(); tvG.position.set(0, 0, TV_Z); scene.add(tvG);
  const cab = new T.Mesh(roundBox(T, 230, CAB_H, 66, 4), woodMat); cab.position.set(0, CAB_H / 2, -30); tvG.add(cab);
  const crt = new T.Mesh(roundBox(T, TV_W, TV_H, 76, 10), new T.MeshPhongMaterial({ color: 0x2a2232, specular: 0x666688, shininess: 60, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.06 }));
  crt.position.set(0, CAB_H + TV_H / 2, -34); tvG.add(crt);
  const tvC = mkCanvas(256, 192), tvTex = tex(tvC);
  const screen = new T.Mesh(new T.PlaneGeometry(TV_W - 34, TV_H - 22), new T.MeshBasicMaterial({ map: tvTex }));
  screen.position.set(-8, SCREEN_Y, 4.5); tvG.add(screen);
  const knobs = new T.MeshPhongMaterial({ color: 0xd8d0c0, specular: 0xffffff, shininess: 80 });
  for (let k = 0; k < 3; k++) { const kb = new T.Mesh(new T.CylinderGeometry(4, 4, 4, 12), knobs); kb.rotation.x = Math.PI / 2; kb.position.set(TV_W / 2 - 12, SCREEN_Y + 28 - k * 16, 5); tvG.add(kb); }
  const tvGlow = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: 0x7a5aff, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 }));
  tvGlow.scale.set(260, 190, 1); tvGlow.position.set(-8, SCREEN_Y, 12); tvG.add(tvGlow);
  // the wordmark plate on the cabinet, and a stack of tapes on top of the set
  const plate = new T.Mesh(new T.PlaneGeometry(90, 22), decal(new T.MeshBasicMaterial({ map: tex(script) }), 2));
  plate.position.set(0, CAB_H / 2, 3.2); add(plate, tvG);
  const tapeMats = ["#ff4b3e", "#16b9e8", "#ffb81f"].map(function (c) { return [new T.MeshLambertMaterial({ color: 0x1b1d26 }), new T.MeshLambertMaterial({ color: 0x1b1d26 }), new T.MeshLambertMaterial({ color: c }), new T.MeshLambertMaterial({ color: 0x1b1d26 }), new T.MeshLambertMaterial({ color: c }), new T.MeshLambertMaterial({ color: 0x1b1d26 })]; });
  for (let k = 0; k < 3; k++) { const tp = new T.Mesh(roundBox(T, 22, 5, 40, 1.2), tapeMats[k]); tp.position.set(100 + (k - 1) * 2, CAB_H + 2.5 + k * 5, -26 + k * 2); tp.rotation.y = (k - 1) * 0.15; tvG.add(tp); }

  /* shelves either side of the TV, full of tapes and game boxes */
  const shelfT = tex(shelfCanvas(script), true);
  [-1, 1].forEach(function (s) {
    const sh = new T.Group(); sh.position.set(s * 160, 0, BACK_Z + 22); scene.add(sh);
    const casing = new T.Mesh(roundBox(T, 92, 108, 40, 3), woodMat); casing.position.y = 54; sh.add(casing);
    const front = new T.Mesh(new T.PlaneGeometry(82, 98), new T.MeshLambertMaterial({ map: shelfT })); front.position.set(0, 54, 20.5); sh.add(front);
    const cols = s < 0 ? ["#ff3fa4", "#16b9e8"] : ["#58c322", "#ffb81f"];
    cols.forEach(function (c, k) {
      const box = new T.Mesh(roundBox(T, 20, 27, 5, 1.5), [new T.MeshLambertMaterial({ color: c }), new T.MeshLambertMaterial({ color: c }), new T.MeshLambertMaterial({ color: c }), new T.MeshLambertMaterial({ color: c }), new T.MeshPhongMaterial({ map: tex(boxCanvas(c, script)), specular: 0x999999, shininess: 60 }), new T.MeshLambertMaterial({ color: c })]);
      box.position.set(-16 + k * 32, 108 + 13.5, 4); box.rotation.y = (k - 0.5) * 0.25; sh.add(box);
    });
  });
  /* a lamp with an orange shade, and jack-o'-lanterns around the room */
  const lamp = new T.Group(); lamp.position.set(-ROOM_X + 34, 0, BACK_Z + 70); scene.add(lamp);
  const lampPole = new T.Mesh(new T.CylinderGeometry(2, 3, 110, 8), new T.MeshPhongMaterial({ color: 0xc9a050, specular: 0xffffff, shininess: 80 })); lampPole.position.y = 55; lamp.add(lampPole);
  const shadeM = new T.Mesh(new T.CylinderGeometry(16, 26, 26, 18, 1, true), new T.MeshBasicMaterial({ color: 0xffa040, side: T.DoubleSide })); shadeM.position.y = 118; lamp.add(shadeM);
  const lampGlow = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: 0xffa040, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
  lampGlow.scale.set(150, 150, 1); lampGlow.position.y = 118; lamp.add(lampGlow);
  const jackMat = new T.MeshLambertMaterial({ map: tex(pumpkinCanvas("happy")), emissive: 0xffb02a, emissiveMap: tex(pumpkinCanvas("happy", true)) });
  const jackGeo = pumpkinGeo(T, 13, 10, 0.82);
  const jacks = [];
  [[-ROOM_X + 22, 220, 0.6], [ROOM_X - 22, 220, -0.6], [-108, BACK_Z + 34, 0.2], [108, BACK_Z + 34, -0.2], [ROOM_X - 30, BACK_Z + 80, -0.5]].forEach(function (p) {
    const j = new T.Mesh(jackGeo, jackMat); j.position.set(p[0], 11, p[1]); j.rotation.y = p[2]; scene.add(j);
    const stem = new T.Mesh(new T.CylinderGeometry(1.4, 2, 6, 6), new T.MeshLambertMaterial({ color: 0x3d6b2a })); stem.position.set(p[0], 24, p[1]); scene.add(stem);
    const gw = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: 0xff8a2a, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.45 }));
    gw.scale.set(70, 70, 1); gw.position.set(p[0], 14, p[1] + 6); scene.add(gw); jacks.push(gw);
  });
  /* string lights along the top of the side walls */
  const bulbGeo = new T.SphereGeometry(2.4, 8, 6), bulbCols = [0xff8a1f, 0xb98cff, 0x9bff3f];
  const bulbs = [];
  [-1, 1].forEach(function (s) {
    for (let k = 0; k < 13; k++) {
      const z = BACK_Z + 30 + k * 46, sag = Math.abs(Math.sin(k * 0.5 * Math.PI)) * 8;
      const b = new T.Mesh(bulbGeo, new T.MeshBasicMaterial({ color: bulbCols[(k + (s > 0 ? 1 : 0)) % 3] }));
      b.position.set(s * (ROOM_X - 6), 240 - sag, z); scene.add(b); bulbs.push(b);
    }
  });

  /* LED ribbon board across the top of the back wall */
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);             // one texel per LED, never smoothed
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas());         // one LED lens, tiled; its mipmaps fade the dots out cleanly at a distance
  tDot.wrapS = tDot.wrapT = T.RepeatWrapping; tDot.anisotropy = aniso;
  const csChunk = T.ShaderChunk && T.ShaderChunk.colorspace_fragment ? "colorspace_fragment" : "encodings_fragment";
  const ledMat = new T.ShaderMaterial({
    uniforms: { tLed: { value: tLed }, tDot: { value: tDot }, grid: { value: new T.Vector2(LED_COLS, LED_ROWS) } },
    vertexShader: "varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
    fragmentShader: [
      "uniform sampler2D tLed;", "uniform sampler2D tDot;", "uniform vec2 grid;", "varying vec2 vUv;",
      "void main() {",
      "  vec2 cell = vUv * grid;",
      "  vec2 px = 1.0 / grid;",
      "  vec2 c0 = (floor(cell) + 0.5) * px;",                                   // every fragment of a cell reads that cell's one LED
      "  vec3 led = texture2D(tLed, c0).rgb;",
      "  vec3 halo = led;",                                                      // light bleeding from the neighbors: the glow
      "  halo += texture2D(tLed, c0 + px * vec2( 1.5,  1.5)).rgb + texture2D(tLed, c0 + px * vec2(-1.5,  1.5)).rgb;",
      "  halo += texture2D(tLed, c0 + px * vec2( 1.5, -1.5)).rgb + texture2D(tLed, c0 + px * vec2(-1.5, -1.5)).rgb;",
      "  halo += texture2D(tLed, c0 + px * vec2( 3.0,  0.0)).rgb + texture2D(tLed, c0 + px * vec2(-3.0,  0.0)).rgb;",
      "  halo += texture2D(tLed, c0 + px * vec2( 0.0,  3.0)).rgb + texture2D(tLed, c0 + px * vec2( 0.0, -3.0)).rgb;",
      "  halo /= 9.0;",
      "  float lens = texture2D(tDot, cell).r;",
      "  vec3 col = led * lens * 1.38 + halo * 0.34 + vec3(0.030, 0.034, 0.046) * lens + vec3(0.005, 0.006, 0.010);",
      "  gl_FragColor = vec4(col, 1.0);",
      "  #include <" + csChunk + ">",
      "}"
    ].join("\n")
  });
  const ledHouse = new T.Mesh(new T.BoxGeometry(ROOM_X * 2, LED_H + 10, 6), new T.MeshLambertMaterial({ color: 0x07050c }));
  ledHouse.position.set(0, LED_Y + 1, BACK_Z + 3); scene.add(ledHouse);
  const ledFace = new T.Mesh(new T.PlaneGeometry(ROOM_X * 2 - 4, LED_H), ledMat);
  ledFace.position.set(0, LED_Y, BACK_Z + 6.2); scene.add(ledFace);
  const ledTrim = new T.Mesh(new T.BoxGeometry(ROOM_X * 2, 3, 8), new T.MeshLambertMaterial({ color: 0xff8a1f }));
  ledTrim.position.set(0, LED_Y - LED_H / 2 - 6, BACK_Z + 4); scene.add(ledTrim);

  /* the cast */
  const hero = buildHero(K); scene.add(hero.holder);
  const mons = buildMonsters(K);
  BOSSES.forEach(function (d) { const m = mons[d.id]; m.group.visible = false; scene.add(m.group); });

  /* what the monsters throw, and what they leave on the floor: pools, shown and hidden as the rules need them */
  const shadowMat = decal(new T.MeshBasicMaterial({ map: tShadow, opacity: 0.55 }), 3);
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
  function blob(sz) { const m = add(new T.Mesh(unit, shadowMat)); m.scale.set(sz, 1, sz); m.visible = false; return m; }
  function glowSprite(col, sz, op) { const s = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: col, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: op == null ? 0.7 : op })); s.scale.set(sz, sz, 1); return s; }
  function pool(n, make) { const a = []; for (let i = 0; i < n; i++) { const o = make(i); o.g.visible = false; scene.add(o.g); a.push(o); } return a; }

  const shots = pool(24, function () {
    const g = new T.Group(), m = new T.Mesh(G.corn, cornMat); m.scale.setScalar(11); g.add(m);
    const gw = glowSprite(0xffa040, 26, 0.35); g.add(gw);
    return { g: g, m: m, sh: blob(10) };
  });
  const seedMat = new T.MeshPhongMaterial({ color: 0xf6e6b0, specular: 0xffffff, shininess: 60 });
  const seeds = pool(20, function () { const g = new T.Group(), m = new T.Mesh(G.sphere, seedMat); m.scale.set(5, 2.4, 8); g.add(m); g.add(glowSprite(0xffe6a0, 22, 0.35)); return { g: g, m: m, sh: blob(14) }; });
  const batBody = new T.MeshLambertMaterial({ color: 0x2a1840 }), wingMat = new T.MeshLambertMaterial({ color: 0x3a2458, emissive: 0x1a0a30, side: T.DoubleSide });
  const wingShape = new T.Shape(); wingShape.moveTo(0, 0); wingShape.quadraticCurveTo(8, 7, 18, 4); wingShape.lineTo(15, -1); wingShape.lineTo(12, 1); wingShape.lineTo(9, -2); wingShape.lineTo(6, 0); wingShape.lineTo(3, -2); wingShape.closePath();
  const wingGeo = new T.ShapeGeometry(wingShape); wingGeo.rotateX(-Math.PI / 2);
  const bats = pool(10, function () {
    const g = new T.Group(), b = new T.Mesh(G.sphere, batBody); b.scale.set(4, 4, 5); g.add(b);
    const w = [1, -1].map(function (s) { const p = new T.Group(); p.scale.x = s; const m = new T.Mesh(wingGeo, wingMat); p.add(m); g.add(p); return p; });
    [-1, 1].forEach(function (s) { const e = new T.Mesh(G.sphere, new T.MeshBasicMaterial({ color: 0xff3322 })); e.scale.setScalar(0.9); e.position.set(s * 1.5, 1.5, 4); g.add(e); });
    g.add(glowSprite(0xe0b8ff, 30, 0.6));
    g.scale.setScalar(1.6);                                 // big enough to read against the rug
    return { g: g, w: w, sh: blob(24) };
  });
  const boltShape = new T.Shape(); [[-3, 10], [4, 2], [0, 1], [3, -10], [-4, -1], [0, 0]].forEach(function (p, i) { if (i) boltShape.lineTo(p[0], p[1]); else boltShape.moveTo(p[0], p[1]); });
  const boltGeo = new T.ExtrudeGeometry(boltShape, { depth: 2, bevelEnabled: false }); boltGeo.translate(0, 0, -1);
  const bolts = pool(8, function () { const g = new T.Group(), m = new T.Mesh(boltGeo, new T.MeshBasicMaterial({ color: 0x9ff6ff })); m.scale.setScalar(1.3); g.add(m); g.add(glowSprite(0x3ff0ff, 46, 0.7)); return { g: g, m: m, sh: blob(14) }; });
  const flaskMat = new T.MeshPhongMaterial({ color: 0x5aff9a, specular: 0xffffff, shininess: 90, emissive: 0x1a8a3a });
  const potions = pool(6, function () {
    const g = new T.Group(), f = new T.Mesh(G.sphere, flaskMat); f.scale.setScalar(6.5); g.add(f);
    const n = new T.Mesh(G.cyl, flaskMat); n.scale.set(2, 6, 2); n.position.y = 4; g.add(n);
    const ck = new T.Mesh(G.sphere, new T.MeshLambertMaterial({ color: 0x8a5a2b })); ck.scale.set(2, 1.5, 2); ck.position.y = 10.5; g.add(ck);
    g.add(glowSprite(0x5aff9a, 34, 0.5));
    const ring = add(new T.Mesh(unit, decal(new T.MeshBasicMaterial({ map: tRing, color: 0x5aff9a, opacity: 0.7 }), 4))); ring.visible = false;
    return { g: g, sh: blob(16), ring: ring };
  });
  const headGeo = pumpkinGeo(T, 8.5, 10, 0.85);
  const heads = pool(10, function () { const g = new T.Group(), m = new T.Mesh(headGeo, jackMat); g.add(m); g.add(glowSprite(0xff8a2a, 44, 0.6)); return { g: g, m: m, sh: blob(18) }; });

  // claw lanes: a red warning stripe, then three claws racing down the lane, then scratches on the rug
  const warnMat = new T.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.3, depthWrite: false, blending: T.AdditiveBlending });
  const edgeMat = new T.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.9, depthWrite: false });
  const bladeMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
  const scratchMat = new T.MeshBasicMaterial({ map: tex(scratchCanvas()), color: 0xff6a5a, transparent: true, opacity: 0.8, depthWrite: false });
  const LANE_Y0 = 180, LANE_L = FLOOR - LANE_Y0;
  const bladeShape = new T.Shape(); bladeShape.moveTo(0, 0); bladeShape.quadraticCurveTo(14, 30, 4, 74); bladeShape.quadraticCurveTo(9, 34, -2, 2); bladeShape.closePath();
  const bladeGeo = new T.ShapeGeometry(bladeShape);
  const cols = pool(4, function () {
    const g = new T.Group();
    const warn = new T.Mesh(unit, warnMat); warn.position.y = 0.6; warn.renderOrder = 4; g.add(warn);
    const edges = [-1, 1].map(function () { const e = new T.Mesh(unit, edgeMat); e.position.y = 0.7; e.renderOrder = 4; g.add(e); return e; });
    const scratch = new T.Mesh(unit, scratchMat); scratch.position.y = 0.8; scratch.renderOrder = 4; g.add(scratch);
    const blades = [-1, 0, 1].map(function (k) { const b = new T.Mesh(bladeGeo, bladeMat); b.rotation.y = Math.PI / 2; b.position.x = k * 16; g.add(b); return b; });
    return { g: g, warn: warn, edges: edges, scratch: scratch, blades: blades };
  });
  // bandage walls: two runs of wrapped linen with a gap between them
  const tWrap = tex(wrapCanvas(), true);
  const bandMats = [0, 1].map(function () { const t = tWrap.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = T.RepeatWrapping; return new T.MeshLambertMaterial({ map: t }); });
  const bands = pool(4, function () {
    const g = new T.Group();
    const segs = [0, 1].map(function (k) { const m = new T.Mesh(new T.BoxGeometry(1, 40, 10), bandMats[k]); m.position.y = 22; g.add(m); return m; });
    const posts = [0, 1].map(function () { const p = new T.Mesh(new T.CylinderGeometry(3, 3, 52, 8), new T.MeshPhongMaterial({ color: 0xffcf3a, specular: 0xffffff, shininess: 80 })); p.position.y = 26; g.add(p); return p; });
    const gap = glowSprite(0x9bff3f, 60, 0.35); gap.position.y = 20; g.add(gap);
    return { g: g, segs: segs, posts: posts, gap: gap };
  });
  // lightning: a ring on the floor that closes in, then a bolt from the ceiling and a scorch
  const strikeRingMat = new T.MeshBasicMaterial({ map: tRing, color: 0x3ff0ff, transparent: true, opacity: 0.9, depthWrite: false });
  const strikes = pool(4, function () {
    const g = new T.Group();
    const ring = new T.Mesh(unit, strikeRingMat); ring.position.y = 0.9; ring.renderOrder = 5; g.add(ring);
    const ring2 = new T.Mesh(unit, strikeRingMat); ring2.position.y = 0.9; ring2.renderOrder = 5; g.add(ring2);
    const boltG = new T.BufferGeometry(); boltG.setAttribute("position", new T.Float32BufferAttribute(new Float32Array(16 * 2 * 3), 3));
    const idx = []; for (let i = 0; i < 15; i++) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); } boltG.setIndex(idx);
    const bolt = new T.Mesh(boltG, new T.MeshBasicMaterial({ color: 0xe9fdff, side: T.DoubleSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    bolt.frustumCulled = false; g.add(bolt);
    const flare = glowSprite(0x3ff0ff, 120, 0.9); flare.position.y = 8; g.add(flare);
    return { g: g, ring: ring, ring2: ring2, bolt: bolt, flare: flare, seed: 0 };
  });
  // potion puddles
  const puddleMat = new T.MeshBasicMaterial({ map: tGlow, color: 0x5aff9a, transparent: true, depthWrite: false });
  const puddles = pool(4, function () {
    const g = new T.Group(), m = new T.Mesh(unit, puddleMat); m.position.y = 1; m.renderOrder = 5; g.add(m);
    const bub = [0, 1, 2].map(function () { const b = new T.Mesh(G.sphere, new T.MeshBasicMaterial({ color: 0x9bff3f })); g.add(b); return b; });
    return { g: g, m: m, bub: bub };
  });

  /* under the monster: a soft shadow, a ring in its color (line it up), and the OPEN glow */
  const bossShadow = blob(90);
  const bossRing = add(new T.Mesh(unit, decal(new T.MeshBasicMaterial({ map: tRing, color: 0xffffff, opacity: 0.5 }), 4)));
  const openGlow = glowSprite(0xffd23f, 220, 0.0); scene.add(openGlow);
  const openRing = add(new T.Mesh(unit, decal(new T.MeshBasicMaterial({ map: tRing, color: 0xffd23f, opacity: 0.0, blending: T.AdditiveBlending }), 5)));
  const heroShadow = blob(40);
  const heroRing = add(new T.Mesh(unit, decal(new T.MeshBasicMaterial({ map: tRing, color: 0xff8a1f, opacity: 0.55 }), 4)));

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, script: script,
    hero: hero, mons: mons, shots: shots, seeds: seeds, bats: bats, bolts: bolts, potions: potions, heads: heads,
    cols: cols, bands: bands, strikes: strikes, puddles: puddles, LANE_Y0: LANE_Y0, LANE_L: LANE_L, bandMats: bandMats,
    bossShadow: bossShadow, bossRing: bossRing, openGlow: openGlow, openRing: openRing, heroShadow: heroShadow, heroRing: heroRing,
    tvC: tvC, tvG: tvC.getContext("2d"), tvTex: tvTex, tvGlow: tvGlow, tvMode: "", tvT: 0, tvBoss: null, jacks: jacks, bulbs: bulbs, lampGlow: lampGlow,
    camPos: new T.Vector3(0, CAM.y, CAM.z), camTgt: new T.Vector3(0, CAM.ty, CAM.tz), v: new T.Vector3(), v2: new T.Vector3(),
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0, debugCam: null,
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
const QUALITY = [{ pr: 2, fx: true }, { pr: 1.5, fx: true }, { pr: 1.15, fx: true }, { pr: 1, fx: false }];
function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  const fx = QUALITY[R.quality].fx;
  R.jacks.forEach(function (j) { j.visible = fx; });
  R.lampGlow.visible = fx;
  R.dirty = true;
}
function pixelRatio() { return Math.min(window.devicePixelRatio || 1, QUALITY[R.quality].pr); }
function watchFrameRate(ms) {
  if (R.qLock || R.quality >= QUALITY.length - 1 || ms > 250) return;
  if (R.warm < 45) { R.warm++; return; }                    // let shaders compile first
  R.slowSum += ms; R.slowN++;
  if (R.slowN < 60) return;
  const avg = R.slowSum / R.slowN;
  R.slowSum = 0; R.slowN = 0;
  if (avg > 24) {
    if (++R.slowHits >= 2) {                                // two slow seconds in a row, not one hiccup
      R.slowHits = 0;
      const before = pixelRatio();
      let q = R.quality + 1;
      while (q < QUALITY.length - 1 && Math.min(window.devicePixelRatio || 1, QUALITY[q].pr) === before) q++;
      setQuality(q);
    }
  } else R.slowHits = 0;
}

/* ---------------- Keep the WebGL canvas exactly under the shell's canvas ---------------- */
function layout() {
  const hud = R.hud, st = R.stage;
  const cw = hud.clientWidth, ch = hud.clientHeight;
  if (!cw || !ch) return false;
  const hr = hud.getBoundingClientRect(), sr = st.getBoundingClientRect();
  const left = Math.round((hr.left - sr.left - st.clientLeft + hud.clientLeft + st.scrollLeft) * 100) / 100;
  const top = Math.round((hr.top - sr.top - st.clientTop + hud.clientTop + st.scrollTop) * 100) / 100;
  const pr = pixelRatio();
  if (cw !== R.cw || ch !== R.ch || pr !== R.pr) {
    R.cw = cw; R.ch = ch; R.pr = pr;
    R.renderer.setPixelRatio(pr);
    R.renderer.setSize(cw, ch, false);
    R.gl.style.width = cw + "px"; R.gl.style.height = ch + "px";
    R.dirty = true;
  }
  if (left !== R.left || top !== R.top) {
    R.left = left; R.top = top;
    R.gl.style.left = left + "px"; R.gl.style.top = top + "px";
  }
  return true;
}
function camShake(mag, dur) {
  if (!R || Shell.reduced) return;
  R.shakeMag = Math.max(mag * 0.6, R.shakeT > 0 ? R.shakeMag : 0); R.shakeDur = R.shakeT = dur;
}

/* ---------------- Room <-> screen, through the 3D camera ---------------- */
// Logical floor point (x, y) at a height h -> HUD pixels.
function toScreen(x, y, h) {
  if (!R) return { x: x, y: y, ok: true };
  R.v.set(X(x), h || 0, Z(y)).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1 };
}
// A HUD x -> the logical x on the collector's own row of the floor (the row is a straight line across the screen).
function rowX(px) {
  if (!R || !R.camReady) return px;
  const cam = R.camera, sy = toScreen(CX, HERO_Y, 0).y;
  R.v.set(px / W * 2 - 1, 1 - sy / H * 2, 0.5).unproject(cam);
  R.v2.copy(R.v).sub(cam.position);
  if (R.v2.y > -1e-6) return px;
  const t = -cam.position.y / R.v2.y;
  return cam.position.x + R.v2.x * t + CX;
}

/* ---------------- Game state -> meshes ---------------- */
const HERO_STAND = [0, 3.02, 0, 0, 0, 6, 0.9, 3.0, 0.25, -0.9, 3.0, 0.25, 0.45, 0.2, 0, -0.45, 0.2, 0, 0];
const hp3 = function (a, b, u, o, i) { o[i] = a[0] + (b[0] - a[0]) * u; o[i + 1] = a[1] + (b[1] - a[1]) * u; o[i + 2] = a[2] + (b[2] - a[2]) * u; };

function heroPose(state, fdt) {
  const H0 = R.hero, F = H0.F, v = poseB, idle = state === "title" || state === "over";
  for (let i = 0; i < HERO_STAND.length; i++) v[i] = HERO_STAND[i];
  const t = idle ? idleT : S.t, calm = Shell.reduced;
  const fighting = !idle && S.phase === "fight";
  // Candy corn leaves a hand every FIRE seconds, left and right in turn: cock it by the ear, snap it forward, back to ready.
  let cornHand = -1;
  for (let h = 0; h < 2; h++) {
    const sg = h ? -1 : 1, i = 6 + h * 3;
    const cock = [sg * 0.72, 5.35, -0.15], rel = [sg * 0.38, 5.45, 1.55], rest = [sg * 0.88, 4.2, 0.65];
    if (!fighting) { if (!idle && S.phase !== "dead") hp3([sg * 0.9, 3.0, 0.25], rest, 0.6, v, i); continue; }
    const u = ((t / FIRE + h) % 2 + 2) % 2;
    if (u < 0.35) hp3(cock, rel, ease(u / 0.35), v, i);
    else if (u < 1) hp3(rel, rest, ease((u - 0.35) / 0.65), v, i);
    else { hp3(rest, cock, ease(u - 1), v, i); if (u > 1.25) cornHand = h; }
  }
  if (fighting) { v[4] = Math.sin(t / FIRE * Math.PI) * 8; v[5] = 10; }
  // sliding: a quick side-step, feet lifting in turn, leaning into it
  const vx = idle ? 0 : S.vx, moving = Math.abs(vx) > 20;
  if (moving && !calm) {
    const p = S.walk * 0.42, dir = vx > 0 ? -1 : 1;           // the rig faces the TV, so screen right is its left
    v[13] += Math.max(0, Math.sin(p)) * 0.5; v[16] += Math.max(0, -Math.sin(p)) * 0.5;
    v[12] += dir * 0.12 * Math.cos(p); v[15] += dir * 0.12 * Math.cos(p);
    v[0] = dir * 0.08; v[1] -= 0.06;
  } else if (!calm) v[1] += Math.sin(t * 2.4) * 0.02;
  // stung: a flinch back; K.O.: arms up
  if (!idle && V.hurtT < 0.35) { const k = 1 - V.hurtT / 0.35; v[5] -= 22 * k; v[2] -= 0.25 * k; }
  if (!idle && S.phase === "ko") { const k = ease(S.pt / 0.3); hp3([v[6], v[7], v[8]], [0.75, 7.0, 0.35], k, v, 6); hp3([v[9], v[10], v[11]], [-0.75, 7.0, 0.35], k, v, 9); v[1] += Math.abs(Math.sin(S.pt * 9)) * 0.25 * k; }
  if (!idle && S.phase === "intro") v[5] = 2;
  applyPose(F, v);
  H0.corn.visible = cornHand >= 0;
  if (cornHand >= 0) { const e = F.arm[cornHand].end.position; H0.corn.position.set(e.x, e.y + 0.3, e.z); H0.corn.rotation.set(0.3, t * 3, 0); }
  // place him on his row
  const hx = idle ? CX : S.x;
  H0.holder.position.set(X(hx), 0, Z(HERO_Y));
  H0.holder.rotation.z = calm ? 0 : -clamp(vx / 900, -1, 1) * 0.1;
  const dead = !idle && S.phase === "dead";
  H0.holder.rotation.x = dead ? ease(S.pt / 0.55) * 1.4 : 0;
  H0.holder.visible = idle || !(S.inv > 0 && Math.sin(S.t * 40) > 0) || dead;
  R.heroShadow.position.set(X(hx), 0.5, Z(HERO_Y)); R.heroShadow.visible = true;
  R.heroRing.position.set(X(hx), 0.6, Z(HERO_Y)); R.heroRing.scale.set(30, 1, 22); R.heroRing.visible = !idle && !dead;
}

function bossShow(state, fdt) {
  const idle = state === "title" || state === "over";
  let d, bx, by, b = S.boss;
  if (idle) {
    const k = Math.floor(idleT / 2.5) % BOSSES.length;
    if (k !== V.idleBoss) { V.idleBoss = k; V.idleSwap = 0; }
    V.idleSwap += fdt;
    d = BOSSES[k]; bx = W / 2 + Math.sin(idleT) * 60; by = 150;
  } else { d = b.d; bx = b.x; by = b.y; }
  const m = R.mons[d.id];
  for (const id in R.mons) R.mons[id].group.visible = R.mons[id] === m;
  if (!idle && b.cycle !== V.cycle) { V.cycle = b.cycle; V.atkT = 0; }
  V.atkT += fdt; V.hitT += fdt; V.hurtT += fdt;
  const c = { t: idle ? idleT : S.t, atk: idle ? (idleT % 2.5 > 1.2 ? idleT % 2.5 - 1.2 : 9) : V.atkT, hit: idle ? 9 : V.hitT,
              open: idle ? 0 : b.open, shield: idle ? 0 : b.shield, dt: fdt };
  m.update(c);
  const g = m.group, lift = m.lift + (m.bob && !Shell.reduced ? Math.sin(c.t * 2.2) * m.bob : 0) + (m.lift && !Shell.reduced ? Math.sin(c.t * 1.7) * 3 : 0);
  let px = X(bx), py = lift, pz = Z(by), sc = 1, spin = 0;
  const sx = -8, sy = SCREEN_Y - 30, sz = TV_Z + 6;           // the TV screen, where every monster comes from and goes back to
  if (idle) {
    const e = ease(V.idleSwap / 0.45); sc = 0.3 + 0.7 * e;
    px = sx + (px - sx) * e; py = sy + (py - sy) * e; pz = sz + (pz - sz) * e;
  } else if (S.phase === "intro") {
    const e = ease(S.pt / 0.95); sc = 0.22 + 0.78 * e;
    px = sx + (X(bx) - sx) * e; py = sy + (lift - sy) * e; pz = sz + (Z(BOSS_Y) - sz) * e;
  } else if (S.phase === "ko") {
    if (!V.koFrom) V.koFrom = [px, py, pz];
    const wob = S.pt < 0.6 && !Shell.reduced ? Math.sin(S.pt * 30) * 0.12 * (1 - S.pt / 0.6) : 0;
    const k = ease((S.pt - 0.55) / 1.1);
    px = V.koFrom[0] + (sx - V.koFrom[0]) * k; py = V.koFrom[1] + (sy - V.koFrom[1]) * k + Math.sin(k * Math.PI) * 60; pz = V.koFrom[2] + (sz - V.koFrom[2]) * k;
    sc = 1 - 0.85 * k; spin = k * TAU * 1.5; g.rotation.z = wob;
    g.visible = k < 0.98;
  }
  if (S.phase !== "ko" || idle) g.rotation.z = 0;
  g.position.set(px, py, pz); g.scale.setScalar(sc);
  const face = idle ? 0 : Math.atan2(X(S.x) - px, Z(HERO_Y) - pz) * 0.5;
  g.rotation.y = face + spin;
  // the hit flash
  const fl = !idle && V.hitT < 0.09 ? 1 - V.hitT / 0.09 : 0;
  for (let i = 0; i < m.flashMats.length; i++) { const mt = m.flashMats[i]; mt.emissive.copy(mt.userData.e0); if (fl > 0) mt.emissive.lerp(R.white || (R.white = new R.T.Color(1, 1, 1)), fl * 0.75); }
  // shadow, the ring that shows how wide it is (stand anywhere inside it to hit), and the OPEN glow
  const onFloor = !idle && (S.phase === "fight" || (S.phase === "intro" && S.pt > 0.6));
  const hw = d.hw;
  R.bossShadow.visible = g.visible && (onFloor || idle);
  R.bossShadow.position.set(px, 0.5, pz); R.bossShadow.scale.set(hw * 3.2 * sc, 1, hw * 2.2 * sc);
  R.bossRing.visible = onFloor;
  R.bossRing.position.set(X(bx), 0.7, Z(by)); R.bossRing.scale.set(hw * 2, 1, hw * 1.2);
  R.bossRing.material.color.set(d.col);
  const open = !idle && b.open > 0 && S.phase === "fight";
  const pulse = Shell.reduced ? 1 : 0.75 + 0.25 * Math.sin(S.t * 18);
  R.openGlow.material.opacity = open ? 0.55 * pulse : 0; R.openGlow.position.set(px, py + 75, pz + 10);
  R.openRing.material.opacity = open ? 0.9 * pulse : 0; R.openRing.position.set(X(bx), 0.9, Z(by)); R.openRing.scale.set(hw * 2.6 * (open ? 1 + 0.08 * Math.sin(S.t * 14) : 1), 1, hw * 1.6);
  return { d: d, px: px, py: py, pz: pz, m: m };
}

function foeH(y) { return clamp(34 + (HERO_Y - y) / (HERO_Y - BOSS_Y) * 50, 30, 90); }
function syncScene(state, fdt) {
  const idle = state === "title" || state === "over", calm = Shell.reduced;
  R.clock += fdt;
  ledTick(fdt);
  heroPose(state, fdt);
  const bs = bossShow(state, fdt);
  let i, n;

  /* the TV */
  const mode = idle ? "title" : (S.phase === "intro" && S.pt < 1.0) || (S.phase === "ko" && S.pt > 0.5) ? "static" : "show";
  R.tvT += fdt;
  if (mode !== R.tvMode || R.tvBoss !== bs.d || R.tvT > (mode === "static" ? 0.06 : 0.12)) {
    tvPaint(R.tvG, R.script, calm && mode === "static" ? "show" : mode, R.clock, bs.d);
    R.tvTex.needsUpdate = true; R.tvT = 0; R.tvMode = mode; R.tvBoss = bs.d;
  }
  R.tvGlow.material.opacity = mode === "static" ? 0.75 + (calm ? 0 : vrand() * 0.2) : 0.45 + (calm ? 0 : Math.sin(R.clock * 3) * 0.05);

  /* candy corn in flight */
  const shots = idle ? [] : S.shots;
  for (i = 0; i < R.shots.length; i++) {
    const o = R.shots[i], s = shots[i];
    o.g.visible = o.sh.visible = !!s;
    if (!s) continue;
    const k = clamp((HERO_Y - 18 - s.y) / (HERO_Y - 18 - BOSS_Y), 0, 1);
    o.g.position.set(X(s.x), 62 + k * 10, Z(s.y));
    o.m.rotation.set(-Math.PI / 2 + Math.sin(s.r) * 0.35, s.r, 0);
    o.sh.position.set(X(s.x), 0.4, Z(s.y));
  }

  /* what the monsters throw */
  const used = { seed: 0, bat: 0, bolt: 0, potion: 0, head: 0 }, pools = { seed: R.seeds, bat: R.bats, bolt: R.bolts, potion: R.potions, head: R.heads };
  const foes = idle ? [] : S.foes;
  for (i = 0; i < foes.length; i++) {
    const f = foes[i], pl = pools[f.k], o = pl && pl[used[f.k]];
    if (!o) continue;
    used[f.k]++;
    o.g.visible = o.sh.visible = true;
    let x = X(f.x), z = Z(f.y), h = foeH(f.y);
    if (f.k === "potion") {
      const q = Math.min(1, f.t / f.tt);
      z = Z(f.sy) + (Z(HERO_Y) - Z(f.sy)) * q; h = 80 + (6 - 80) * q + Math.sin(q * Math.PI) * 110;
      o.g.rotation.set(q * 9, 0, q * 5);
      o.ring.visible = true; o.ring.position.set(X(f.lx), 1.1, Z(HERO_Y)); o.ring.scale.set(46 * (1.15 - 0.15 * q), 1, 30 * (1.15 - 0.15 * q));
      o.ring.material.opacity = 0.35 + 0.5 * q;
    } else if (f.k === "bat") {
      o.g.rotation.set(0, Math.atan2(f.vx, f.vy), 0);
      const flap = calm ? 0.2 : Math.sin(f.p) * 0.75;
      o.w[0].rotation.z = flap; o.w[1].rotation.z = flap;
    } else if (f.k === "seed") {
      o.m.rotation.set(R.clock * 9, Math.atan2(f.vx, f.vy), 0);
    } else if (f.k === "bolt") {
      o.m.rotation.set(0, R.clock * 12, 0);
    } else if (f.k === "head") {
      o.m.rotation.set(R.clock * 6, R.clock * 4, 0);
    }
    o.g.position.set(x, h, z);
    o.sh.position.set(x, 0.45, z);
    const sk = clamp(1 - h / 200, 0.4, 1); o.sh.scale.set(18 * sk, 1, 18 * sk);
  }
  for (const k in pools) for (n = used[k]; n < pools[k].length; n++) { const o = pools[k][n]; o.g.visible = o.sh.visible = false; if (o.ring) o.ring.visible = false; }

  /* claw lanes */
  const cols = idle ? [] : S.cols;
  for (i = 0; i < R.cols.length; i++) {
    const o = R.cols[i], cl = cols[i];
    o.g.visible = !!cl;
    if (!cl) continue;
    o.g.position.set(X(cl.x), 0, Z(R.LANE_Y0 + R.LANE_L / 2));
    o.warn.scale.set(cl.w, 1, R.LANE_L);
    for (n = 0; n < 2; n++) { o.edges[n].scale.set(2.5, 1, R.LANE_L); o.edges[n].position.x = (n ? 1 : -1) * cl.w / 2; }
    if (!cl.fired) {
      const u = cl.t / cl.warn;
      o.warn.material.opacity = (0.12 + 0.3 * u) * (calm ? 1 : 0.75 + 0.25 * Math.sin(R.clock * 30));
      o.warn.visible = true; o.edges[0].visible = o.edges[1].visible = true; o.scratch.visible = false;
      for (n = 0; n < 3; n++) o.blades[n].visible = false;
    } else {
      const k = (cl.t - cl.warn) / cl.hot;
      o.warn.visible = false; o.edges[0].visible = o.edges[1].visible = false;
      o.scratch.visible = true; o.scratch.scale.set(cl.w * 0.9, 1, R.LANE_L * Math.min(1, k * 1.2));
      o.scratch.position.z = R.LANE_L / 2 * (1 - Math.min(1, k * 1.2)) * -1;
      for (n = 0; n < 3; n++) {
        const bl = o.blades[n];
        bl.visible = k < 1.4;
        bl.position.z = -R.LANE_L / 2 + clamp(k, 0, 1) * R.LANE_L + n * 6;
        bl.scale.set(1, 1 - Math.max(0, k - 1) * 2, 1);
      }
    }
  }
  /* bandage walls */
  const bands = idle ? [] : S.bands;
  for (i = 0; i < R.bands.length; i++) {
    const o = R.bands[i], bd = bands[i];
    o.g.visible = !!bd;
    if (!bd) continue;
    const gl = bd.gx - bd.gw / 2, gr = bd.gx + bd.gw / 2;
    o.g.position.set(0, 0, Z(bd.y));
    o.segs[0].scale.x = Math.max(1, gl + 30); o.segs[0].position.x = X((gl - 30) / 2);
    o.segs[1].scale.x = Math.max(1, W - gr + 30); o.segs[1].position.x = X((gr + W + 30) / 2);
    o.posts[0].position.x = X(gl); o.posts[1].position.x = X(gr);
    o.gap.position.x = X(bd.gx); o.gap.material.opacity = calm ? 0.35 : 0.25 + 0.15 * Math.sin(R.clock * 10);
    o.segs[0].position.y = o.segs[1].position.y = 22 + (calm ? 0 : Math.sin(R.clock * 6 + i) * 1.5);
  }
  R.bandMats[0].map.repeat.set(5, 1); R.bandMats[1].map.repeat.set(5, 1);
  /* lightning */
  const strikes = idle ? [] : S.strikes;
  for (i = 0; i < R.strikes.length; i++) {
    const o = R.strikes[i], st = strikes[i];
    o.g.visible = !!st;
    if (!st) continue;
    o.g.position.set(X(st.x), 0, Z(HERO_Y));
    if (!st.fired) {
      const u = st.t / st.warn, r = st.w * (1 + (1 - u) * 1.6);
      o.ring.visible = o.ring2.visible = true; o.ring.scale.set(r, 1, r * 0.66); o.ring2.scale.set(st.w, 1, st.w * 0.66);
      o.ring.material.opacity = 0.4 + 0.5 * u;
      o.bolt.visible = o.flare.visible = false;
    } else {
      const k = (st.t - st.warn) / 0.25;
      o.ring.visible = false; o.ring2.visible = true; o.ring2.scale.set(st.w * 1.2, 1, st.w * 0.8);
      if (o.seed !== st) {                                   // a fresh zigzag for every strike
        o.seed = st;
        const p = o.bolt.geometry.attributes.position;
        let x = 0;
        for (n = 0; n < 16; n++) {
          const y = 430 * (1 - n / 15), wdt = 5 * (1 - n / 20);
          if (n && n < 15) x = (vrand() * 2 - 1) * 16; else x = 0;
          p.setXYZ(n * 2, x - wdt, y, 0); p.setXYZ(n * 2 + 1, x + wdt, y, 0);
        }
        p.needsUpdate = true; o.bolt.geometry.computeBoundingSphere();
      }
      o.bolt.visible = k < 1; o.bolt.material.opacity = 1 - k * 0.7;
      o.bolt.rotation.y = -R.camera.rotation.y;
      o.flare.visible = true; o.flare.material.opacity = Math.max(0, 1 - k);
    }
  }
  /* potion puddles */
  const pds = idle ? [] : S.puddles;
  for (i = 0; i < R.puddles.length; i++) {
    const o = R.puddles[i], pd = pds[i];
    o.g.visible = !!pd;
    if (!pd) continue;
    o.g.position.set(X(pd.x), 0, Z(HERO_Y));
    o.m.scale.set(pd.w * 1.5, 1, 40);
    o.m.material.opacity = (pd.t < 0.6 ? 1 : 0.45) * Math.min(1, (pd.life - pd.t) * 2);
    for (n = 0; n < 3; n++) { const bb = o.bub[n], ph = (pd.t * 2.2 + n * 0.33) % 1; bb.position.set((n - 1) * 12, 2 + ph * 12, (n % 2) * 6 - 3); bb.scale.setScalar(2.5 * (1 - ph) + 0.5); bb.visible = pd.t < 0.9; }
  }

  /* camera: a high seat behind the collector, the whole room in view, a little sway on the title card */
  const sway = idle && !calm ? Math.sin(idleT * 0.4) * 14 : 0;
  R.camPos.set(sway, CAM.y, CAM.z); R.camTgt.set(sway * 0.3, CAM.ty, CAM.tz);
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const mg = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (vrand() * 2 - 1) * mg; sy = (vrand() * 2 - 1) * mg;
  }
  R.camera.position.set(R.camPos.x + sx, R.camPos.y + sy, R.camPos.z);
  R.camera.lookAt(R.camTgt.x + sx, R.camTgt.y + sy, R.camTgt.z);
  if (R.debugCam) {                                         // checks and the cover shot only: [x, y, z, look x, y, z, fov]
    const dc = R.debugCam;
    R.camera.position.set(dc[0], dc[1], dc[2]); R.camera.lookAt(dc[3], dc[4], dc[5]);
    if (R.camera.fov !== dc[6]) { R.camera.fov = dc[6]; R.camera.updateProjectionMatrix(); }
  }
  R.camera.updateMatrixWorld();
  R.camReady = !R.debugCam;
  R.boss = bs;
}

/* ---------------- HUD (2D canvas on top) ---------------- */
function txt(c, s, x, y, size, color, align, shadow) {
  c.font = "bold " + size + "px " + HUD_FONT;
  c.textAlign = align || "left"; c.textBaseline = "top";
  if (shadow) { c.fillStyle = shadow; c.fillText(s, x + 1, y + 1); }
  c.fillStyle = color; c.fillText(s, x, y);
}
function rrect(c, x, y, w, h, r) { rrectPath(c, x, y, w, h, r); }

function candyBar(c, x, y, ok) {
  rrect(c, x - 6, y, 12, 15, 3);
  c.fillStyle = ok ? "#ff8a1f" : "#3a2e4a"; c.fill();
  c.fillStyle = ok ? "#5a3418" : "#2a2238"; c.fillRect(x - 6, y + 4, 12, 7);
  if (ok) { c.fillStyle = "rgba(255,255,255,.45)"; c.fillRect(x - 5, y + 1, 10, 2); c.fillStyle = "#ffd23f"; c.fillRect(x - 3, y + 6, 6, 3); }
  c.lineWidth = 1; c.strokeStyle = "#1e0a3c"; rrect(c, x - 6, y, 12, 15, 3); c.stroke();
}

function hud(c, t) {
  const b = S.boss, d = b.d;
  const bg = c.createLinearGradient(0, 0, 0, 56);
  bg.addColorStop(0, "#6a3ae0"); bg.addColorStop(0.5, "#4a1fb8"); bg.addColorStop(1, "#2a0f78");
  c.fillStyle = bg; c.fillRect(0, 0, W, 56);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff8a1f"; c.fillRect(0, 56, W, 2);
  c.fillStyle = "#ffd23f"; c.fillRect(0, 58, W, 1);
  txt(c, comma(S.score), 8, 4, 15, "#ffe45c", "left", "#1e0a3c");
  txt(c, "MONSTER " + (S.bi + 1) + "/7", W / 2 + 6, 6, 10, "#e8dcff", "center", "#1e0a3c");
  for (let i = 0; i < HEARTS; i++) candyBar(c, W - 12 - i * 15, 4, i < S.hearts);
  const nm = d.name, fs = nm.length > 18 ? 10 : 11;
  txt(c, nm, 8, 22, fs, d.col, "left", "#1e0a3c");
  if (Math.sin(t * 4) > -0.2) { c.fillStyle = "#ff3322"; c.beginPath(); c.arc(W - 76, 28, 3, 0, TAU); c.fill(); }
  txt(c, "LATE SHOW", W - 8, 23, 9, "#e8dcff", "right", "#1e0a3c");
  // HP bar with drain trail
  const bw = W - 16, k = b.hp / d.hp, ks = b.hpShow / d.hp;
  rrect(c, 7, 36, bw + 2, 14, 5); c.fillStyle = "#1e0a3c"; c.fill();
  c.save(); rrect(c, 8, 37, bw, 12, 4); c.clip();
  c.fillStyle = "#2a2238"; c.fillRect(8, 37, bw, 12);
  c.fillStyle = "#ffffff"; c.fillRect(8, 37, bw * ks, 12);
  c.fillStyle = k < 0.25 ? "#ff4b3e" : k < 0.5 ? "#ffd23f" : "#9bff3f"; c.fillRect(8, 37, bw * k, 12);
  c.fillStyle = "rgba(255,255,255,.4)"; c.fillRect(8, 37, bw * k, 4);
  c.restore();
  txt(c, Math.ceil(k * 100) + "%", W - 12, 38, 9, "#1e0a3c", "right");
}

// Words pinned to things in the room: OPEN over the monster, CAPE UP, the combo over the collector, warnings on the floor.
function drawWorld(c, t) {
  const b = S.boss, bs = R.boss;
  if (!bs) return;
  if (S.phase === "fight" && b.open > 0) {
    const p = toScreen(b.x, b.y, 168);
    const sz = 16 + (Shell.reduced ? 0 : Math.sin(t * 16) * 1.5);
    c.save(); candyText(c, "OPEN! CRITS x2", clamp(p.x, 90, W - 90), Math.max(78, p.y), sz, 190); c.restore();
  }
  if (S.phase === "fight" && b.shield > 0) {
    const p = toScreen(b.x, b.y, 160);
    txt(c, "CAPE UP", clamp(p.x, 40, W - 40), Math.max(70, p.y), 12, "#e3c8ff", "center", "#1e0a3c");
  }
  for (let i = 0; i < S.cols.length; i++) {
    const cl = S.cols[i];
    if (cl.fired) continue;
    const p = toScreen(cl.x, HERO_Y - 70, 0);
    c.save(); candyText(c, "!", p.x, p.y, 24, 0, ["#ffb0a8", "#ff4b3e", "#c21a10"]); c.restore();
  }
  if (S.combo >= 5 && S.phase === "fight") {
    const p = toScreen(S.x, HERO_Y, 92);
    txt(c, S.combo + " HITS", p.x, p.y - 14, 11, S.combo >= 25 ? "#ff8a1f" : "#3ff0ff", "center", "#1e0a3c");
  }
}

function drawBanner(c) {
  if (S.phase === "intro") {
    const a = clamp(S.pt / 0.2, 0, 1) * clamp((1.7 - S.pt) / 0.25, 0, 1);
    c.save(); c.globalAlpha = a;
    const y0 = 312, gr = c.createLinearGradient(0, y0, 0, y0 + 92);
    gr.addColorStop(0, "rgba(30,10,60,.88)"); gr.addColorStop(1, "rgba(60,20,110,.88)");
    c.fillStyle = gr; c.fillRect(0, y0, W, 92);
    c.fillStyle = "#ff8a1f"; c.fillRect(0, y0, W, 2); c.fillRect(0, y0 + 90, W, 2);
    txt(c, "MONSTER " + (S.bi + 1) + " OF 7", W / 2, y0 + 8, 10, "#e8dcff", "center");
    candyText(c, S.boss.d.name, W / 2, y0 + 44, 26, 330);
    txt(c, S.boss.d.sub, W / 2, y0 + 68, 11, "#ffffff", "center", "#1e0a3c");
    c.restore();
  }
  if (S.phase === "ko" && S.pt < 1.7) {
    const sc = 1 + Math.max(0, 0.5 - S.pt) * 2.2;
    c.save(); c.translate(W / 2, 330); c.scale(sc, sc); candyText(c, "K.O.!", 0, 0, 56, 0); c.restore();
    if (S.lastKO) txt(c, "+" + comma(S.lastKO.bonus) + (S.lastKO.noHit ? "  NO HIT!" : "") + "   " + S.lastKO.t.toFixed(1) + "s", W / 2, 368, 12, S.lastKO.noHit ? "#9bff3f" : "#ffffff", "center", "#1e0a3c");
  }
}

function draw(c, state) {
  Juke.pump();
  if (!R || !R.hud) return;
  const now = performance.now();
  let ms = now - R.lastT;
  R.lastT = now;
  if (!(ms > 0)) ms = 0;
  const sized = layout();
  if (state === "paused" && !R.dirty) return;              // nothing moves while paused: leave the last frame up
  if (state === "playing") watchFrameRate(ms);
  const fdt = state === "paused" ? 0 : Math.min(ms, 50) / 1000;
  if (sized) {
    syncScene(state, fdt);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  const play = state === "playing" || state === "paused";
  if (play) drawWorld(c, S.t);
  for (let i = 0; i < parts.length; i++) { const q = parts[i]; c.globalAlpha = Math.max(0, 1 - q.t / q.life); c.fillStyle = q.c; c.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s); }
  c.globalAlpha = 1;
  for (let i = 0; i < floats.length; i++) { const f = floats[i]; c.globalAlpha = Math.max(0, 1 - f.t / 0.7); txt(c, f.s, f.x, f.y, 11, f.c, "center", "#1e0a3c"); }
  c.globalAlpha = 1;
  if (play) { hud(c, S.t); drawBanner(c); }
}

/* ---------------- Splash, boot, shell hookup ---------------- */
function makeSplash() {
  const el = document.createElement("div");
  el.id = "npg-splash";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Nostalgia Pro Games");
  el.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;z-index:9999;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;gap:18px;padding:24px;box-sizing:border-box;text-align:center;" +
    "background:radial-gradient(circle at 50% 42%,#4a1fb8 0%,#200a52 52%,#0b0716 100%);" +
    "font:bold 15px/1.5 " + HUD_FONT.replace(/"/g, "'") + ";color:#ffffff;opacity:1;transition:opacity .35s ease";
  const img = document.createElement("img");
  img.alt = "";
  img.decoding = "async";
  img.style.cssText = "display:block;width:min(66vw,44vh,340px);height:auto;opacity:0;transform:scale(.86);" +
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "transition:opacity .2s ease" : "transition:opacity .28s ease,transform .55s cubic-bezier(.2,1.5,.4,1)");
  el.appendChild(img);
  document.body.appendChild(el);
  return { el: el, img: img };
}
function splashFail(splash, lines) {
  const el = splash.el;
  splash.img.style.width = "min(40vw,26vh,180px)";
  el.setAttribute("role", "alert");
  el.removeAttribute("aria-label");
  const p = document.createElement("p");
  p.style.cssText = "margin:0;max-width:30em";
  p.textContent = lines;
  const a = document.createElement("a");
  a.href = "../"; a.textContent = "Back to the arcade";
  a.style.cssText = "color:#ff8a1f";
  el.appendChild(p); el.appendChild(a);
}
function splashGone(splash) {
  splash.el.style.opacity = "0";
  splash.el.style.pointerEvents = "none";
  setTimeout(function () { if (splash.el.parentNode) splash.el.parentNode.removeChild(splash.el); }, 420);
}
function loadLogo(splash) {
  return new Promise(function (resolve) {
    const img = splash.img;
    let done = false;
    function fin(ok) {
      if (done) return; done = true;
      if (ok) { img.style.opacity = "1"; img.style.transform = "scale(1)"; }
      else {                                                // no logo file: plain lettering holds the splash
        img.style.display = "none";
        const t = document.createElement("div");
        t.textContent = "Nostalgia Pro Games";
        t.style.cssText = "font:italic 900 34px/1.2 Georgia,'Times New Roman',serif;color:#f6e8c8;text-shadow:0 3px 0 #12224f";
        splash.el.insertBefore(t, splash.el.firstChild);
      }
      resolve(ok ? img : null);
    }
    img.onload = function () { fin(true); };
    img.onerror = function () { fin(false); };
    setTimeout(function () { fin(false); }, 6000);
    img.src = LOGO_URL;
  });
}
function loadImage(url) {
  return new Promise(function (resolve) {
    const img = new Image();
    let done = false;
    function fin(ok) { if (done) return; done = true; resolve(ok ? img : null); }
    img.onload = function () { fin(true); };
    img.onerror = function () { fin(false); };
    setTimeout(function () { fin(false); }, 6000);
    img.src = url;
  });
}
// No WebGL, or the 3D engine did not load: hand the page to the classic 2D game if it is on the server.
function loadClassic() {
  return new Promise(function (resolve, reject) {
    const s = document.createElement("script");
    s.src = FALLBACK_URL;
    s.onload = function () { if (window.Shell && Shell.state && Shell.state() !== "boot") resolve(); else reject(new Error("classic game did not start")); };
    s.onerror = function () { reject(new Error("no classic game")); };
    document.body.appendChild(s);
  });
}

function attach() {
  const hudC = document.getElementById("np-canvas"), stage = document.getElementById("np-stage");
  R.hud = hudC; R.stage = stage;
  if (getComputedStyle(stage).position === "static") stage.style.position = "relative";
  const gl = R.gl;
  gl.style.cssText = "position:absolute;left:0;top:0;z-index:0;display:block;margin:0;padding:0;border:0;box-shadow:none;" +
    "max-width:none;max-height:none;transform:none;image-rendering:auto;pointer-events:none;touch-action:none;" +
    "border-radius:" + getComputedStyle(hudC).borderRadius;
  stage.insertBefore(gl, hudC);
  // the shell canvas becomes a clear HUD layer over the 3D view
  hudC.style.background = "transparent";
  if (getComputedStyle(hudC).position === "static") hudC.style.position = "relative";   // so it stacks above the WebGL canvas
  const crt = stage.querySelector(".np-crt");
  if (crt) crt.style.display = "none";                       // glossy living room, no scanlines (the TV has its own)
  R.lastT = performance.now();
  layout();
}
function logoImg(maxH) {
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
  im.style.cssText = "display:block;width:clamp(56px," + maxH + ",104px);height:auto;margin:0 auto 6px";
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_URL;
  return im;
}

function startGame() {
  Shell.init({
    slug: "creature-feature-ko",
    title: "CREATURE FEATURE KO",
    accent: ORANGE,
    width: W, height: H,
    format: function (n) { return comma(n) + " PTS"; },
    howTo: "It's the late show and the monsters are climbing out of the TV, now in real 3D. Slide left and right: you throw candy corn straight ahead automatically. Line up with the monster to hit it, slide away from its attacks. When it glows OPEN, every hit is a CRIT. Seven monsters, five candy bars of health.",
    keys: "Drag or move the mouse anywhere. Keys: left and right arrows (or A and D). P pause, M mute, N music, R restart.",
    tip: "Red lanes slash, blue rings zap, green puddles burn. You get a candy bar back after every K.O.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; tick(dt); },
    onPause: function () { keys = {}; }
  });
  attach();
  // Sound. Nothing is created until the first tap, click or key press; the band starts with the game.
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Juke.unlock, true); });
  function fresh() { Juke.newGame(); bossIntroFX(0); }
  Shell.onStart(fresh); Shell.onRestart(fresh); Shell.onResume(Juke.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));   // not while initials are being typed
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Juke.toggleMusic();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) { Juke.button(titleCard, titleCard.querySelector(".np-tip")); titleCard.insertBefore(logoImg("12vh"), titleCard.firstChild); }
  if (pauseActions) Juke.button(pauseActions, pauseActions.querySelector("a"));
  const mute = document.getElementById("np-mute");
  if (mute && mute.parentNode) Juke.button(mute.parentNode, mute, true);
  // The studio logo heads the score card too.
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) card.insertBefore(logoImg("14vh"), card.firstChild);
}

if (dbg) window.CFK_DEBUG = { state: function () { return S; }, bosses: BOSSES, skipTo: function (i) { startBoss(i); }, hurt: hurt };
// Hook for automated checks (no effect on play)
window.__cfk = { S: function () { return S; }, gfx: function () { return R; }, led: function () { return LED; }, view: V, juke: Juke,
                 startMusic: startMusic, rowX: rowX, toScreen: toScreen, startBoss: startBoss, attack: attack, BOSSES: BOSSES };

(function boot() {
  const splash = makeSplash();
  const t0 = performance.now();
  const q = /[?&]gfx=(high|low|2d)/.exec(location.search);
  let started = false;
  Promise.all([loadLogo(splash),
               q && q[1] === "2d" ? Promise.reject(Object.assign(new Error("2D asked for"), { npStage: "webgl" }))
                                  : import(THREE_URL).then(null, function (e) { e.npStage = "three"; throw e; }),
               loadImage(SCRIPT_URL)])
    .then(function (res) {
      THREE = res[1];
      try { R = buildScene(THREE, res[2]); } catch (e) { e.npStage = "webgl"; throw e; }
      if (q) { R.qLock = true; setQuality(q[1] === "low" ? QUALITY.length - 1 : 0); }
      reset();
      try { R.renderer.compile(R.scene, R.camera); } catch (e) { /* warm-up only */ }
      // hold the logo for a beat, then hand over to the title card
      const hold = Math.max(0, 1300 - (performance.now() - t0));
      return new Promise(function (r) { setTimeout(r, hold); });
    })
    .then(function () {
      started = true;
      startGame();
      splashGone(splash);
    })
    .catch(function (e) {
      console.error(e);
      if (started) return;
      R = null;
      loadClassic().then(function () { splashGone(splash); }, function () {
        splashFail(splash, e && e.npStage === "three"
          ? "Creature Feature KO could not load its 3D engine (" + THREE_URL + ")."
          : "Creature Feature KO needs WebGL for its 3D living room, and this browser has it switched off or does not support it.");
      });
    });
})();
