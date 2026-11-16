/* PAWN SHOP POOL (3D): clear the back-room table before the shop closes. Solo speed rack, 3 racks.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of input, scaling and the title / pause / game over flow, and carries the HUD.

   The rules, the clock, the scoring, the controls, the trophies, the batch 3 extras and the ball
   physics are the 2D game's, unchanged: the table is still laid out in the same 360 x 540 units and
   every ball is still stepped by the same code. Only the picture is new. A table point (x, y) sits in
   three.js space at (x - 180, height, y - 299). A pool ball is 16 units across (2.25 inches), so the
   back room, the furniture and the shopkeeper are all built to that same scale. */

const W = 360, H = 540, TAU = Math.PI * 2, DEG = Math.PI / 180;

/* ---------------- The 2D game's table and rules (unchanged) ---------------- */
const X0 = 30, X1 = 330, Y0 = 82, Y1 = 516;           // cloth
const R = 8, MAX_V = 900, MAX_PULL = 120;
const FR_C = 70, FR_K = 0.55, E_BALL = 0.95, E_RAIL = 0.78;
const POCKETS = [
  { x: X0 + 2, y: Y0 + 2, r: 18 }, { x: X1 - 2, y: Y0 + 2, r: 18 },
  { x: X0 - 2, y: (Y0 + Y1) / 2, r: 16 }, { x: X1 + 2, y: (Y0 + Y1) / 2, r: 16 },
  { x: X0 + 2, y: Y1 - 2, r: 18 }, { x: X1 - 2, y: Y1 - 2, r: 18 }
];
const MOUTH = 28;
const HEAD = { x: 180, y: 430 }, FOOT = { x: 180, y: 196 };
const RACKS = 3, CLOSE_AT = 300, SCRATCH_SEC = 10, COMBO_SEC = 3, LEFT_SEC = 20;
const COLORS = ["#ffd23f", "#2f6bff", "#ff4b3e", "#a77bff", "#ff8a2a", "#2fbf5a", "#9a2f3a", "#1b1c22", "#ffd23f"];
const GBTN = { x: 80, y: 9, w: 52, h: 36 };             // GUIDE on/off button in the top bar

/* ---------------- The back room (table units: 7.1 to the inch) ---------------- */
const CX = 180, CZ = (Y0 + Y1) / 2;                     // table point that sits on the three.js origin
const IN = 2 * R / 2.25, FT = IN * 12;
const CUSH = 12, CUSH_H = 11, RAIL_W = 34, RAIL_H = 12.6, APRON = 64;
const FLOOR_Y = -Math.round(30 * IN);                    // the cloth is 30 inches off the floor
const CEIL_Y = 780;
const OUT = { x0: X0 - CUSH - RAIL_W, x1: X1 + CUSH + RAIL_W, y0: Y0 - CUSH - RAIL_W, y1: Y1 + CUSH + RAIL_W };
const ROOM = { x0: -600, x1: 600, z0: -400, z1: 720 };  // the walls, in three.js space
const LAMP_Y = 430;
const CAM_FOV = 36, CAM_PITCH = 60 * DEG;
const HUD_H = 56, WALL_BAND = 40;                        // the top bar, and the strip of back wall kept in view over the table
const SAFE = { x1: 4, x2: W - 4, y1: HUD_H + WALL_BAND, y2: H - 4 };

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash, title card and score card
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every sign and decal in the back room
const THREE_URL = "../shared/three.module.min.js";
const FALLBACK_URL = "game-2d.js";                        // optional: the classic 2D game, used if 3D cannot start
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';
const CONF_COLS = ["#ffd23f", "#3ff0ff", "#ff3fa4", "#9bff3f", "#ff9214", "#ffffff"];
const BOX_COLS = ["#ff4b3e", "#16b9e8", "#ff3fa4", "#58c322", "#ffb81f", "#8a5cff"];

let S = {}, keys = {}, idleT = 0, parts = [], guideOn = null;
const X = window.NPX && window.NPX.on ? window.NPX : null;   // batch 3 extras (shared/extras.js)
let THREE = null, RD = null, TV = null;                  // RD holds everything the renderer owns
// V is how things are being shown (ball drops, the cue's follow-through, the shopkeeper). It never feeds the rules.
const V = { strike: null, mood: "", moodT: 0, nextWatch: 0, closed: false, warned: 0, fever: false, pose: null, cueWas: false, guide: null };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* ---------------- Rack (the 2D game's) ---------------- */
function rackBalls() {
  const b = [], rows = [1, 2, 3, 2, 1], order = [1, 3, 4, 6, 9, 5, 7, 8, 2], dy = R * 1.75, dx = R * 2 + 0.6;
  let k = 0;
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r]; c++) {
    const n = order[k++];
    b.push({ n: n, x: FOOT.x + (c - (rows[r] - 1) / 2) * dx, y: FOOT.y + 2 * dy - r * dy, vx: 0, vy: 0, in: false, sink: 0 });
  }
  return b;
}

function reset() {
  S = { t: 0, time: 0, penalty: 0, bonus: 0, rack: 1, phase: "aim", pt: 0, balls: rackBalls(),
        cue: { n: 0, x: HEAD.x, y: HEAD.y, vx: 0, vy: 0, in: false, sink: 0 },
        aim: -Math.PI / 2, power: 0, charging: false, chargeT: 0, drag: null, kb: false,
        shot: null, shots: 0, scratches: 0, combos: 0, bestCombo: 0, potted: 0, breakPots: 0, rackShots: 0, over: false };
  parts.length = 0;
  if (X) S.x = { sc: X.scenery(), fever: new X.Fever(15), sched: new X.Scheduler(25, 55, 2), rare: null, rares: 0, events: 0, intro: false };
  V.strike = null; V.mood = ""; V.moodT = 0; V.nextWatch = 0; V.closed = false; V.warned = 0; V.fever = false; V.guide = null;
  ledClear();
  if (RD) RD.fresh = true;
}
function clock() { return S.time + S.penalty - S.bonus; }
function ballsLeft() { let n = 0; for (let i = 0; i < S.balls.length; i++) if (!S.balls[i].in) n++; return n + (RACKS - S.rack) * 9; }

/* ---------------- Physics (the 2D game's, untouched) ---------------- */
function all() { return [S.cue].concat(S.balls); }
function moving() {
  const a = all();
  for (let i = 0; i < a.length; i++) if (!a[i].in && (a[i].vx || a[i].vy)) return true;
  return false;
}
function nearPocket(b) {
  for (let i = 0; i < POCKETS.length; i++) if (Math.hypot(b.x - POCKETS[i].x, b.y - POCKETS[i].y) < MOUTH) return true;
  return false;
}
function step(dt) {
  const a = all();
  let i, j, b, c;
  for (i = 0; i < a.length; i++) {
    b = a[i]; if (b.in) continue;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
      const ns = Math.max(0, sp - (FR_C + FR_K * sp) * (S.x && S.x.sc.id === "rain" ? 1.2 : 1) * dt);
      if (ns < 3) { b.vx = b.vy = 0; } else { b.vx *= ns / sp; b.vy *= ns / sp; }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    // rails, except at the pocket mouths
    if (!nearPocket(b)) {
      if (b.x < X0 + R) { b.x = X0 + R; b.vx = Math.abs(b.vx) * E_RAIL; rail(); }
      if (b.x > X1 - R) { b.x = X1 - R; b.vx = -Math.abs(b.vx) * E_RAIL; rail(); }
      if (b.y < Y0 + R) { b.y = Y0 + R; b.vy = Math.abs(b.vy) * E_RAIL; rail(); }
      if (b.y > Y1 - R) { b.y = Y1 - R; b.vy = -Math.abs(b.vy) * E_RAIL; rail(); }
    }
    for (j = 0; j < POCKETS.length; j++) {
      if (Math.hypot(b.x - POCKETS[j].x, b.y - POCKETS[j].y) < POCKETS[j].r) { pocket(b, POCKETS[j]); break; }
    }
    // anything that sneaks past a mouth goes down the nearest pocket
    if (!b.in && (b.x < X0 - 6 || b.x > X1 + 6 || b.y < Y0 - 6 || b.y > Y1 + 6)) {
      let best = POCKETS[0];
      for (j = 1; j < POCKETS.length; j++) if (Math.hypot(b.x - POCKETS[j].x, b.y - POCKETS[j].y) < Math.hypot(b.x - best.x, b.y - best.y)) best = POCKETS[j];
      pocket(b, best);
    }
  }
  for (i = 0; i < a.length; i++) {
    b = a[i]; if (b.in) continue;
    for (j = i + 1; j < a.length; j++) {
      c = a[j]; if (c.in) continue;
      const dx = c.x - b.x, dy = c.y - b.y, d2 = dx * dx + dy * dy;
      if (d2 >= 4 * R * R || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = 2 * R - d;
      b.x -= nx * pen / 2; b.y -= ny * pen / 2; c.x += nx * pen / 2; c.y += ny * pen / 2;
      const rv = (c.vx - b.vx) * nx + (c.vy - b.vy) * ny;
      if (rv < 0) {
        const jj = -(1 + E_BALL) * rv / 2;
        b.vx -= jj * nx; b.vy -= jj * ny; c.vx += jj * nx; c.vy += jj * ny;
        if (S.shot && !S.shot.first && (b.n === 0 || c.n === 0)) S.shot.first = true;
        click(-rv);
      }
    }
  }
}
let lastClick = 0;
function click(v) {
  if (v < 30 || S.t - lastClick < 0.025) return;
  lastClick = S.t;
  Shell.tone(1500 + Math.random() * 500, 0.03, "square", Math.min(0.3, 0.08 + v / 2500));
}
function rail() { if (S.t - lastClick > 0.04) { lastClick = S.t; Shell.tone(180, 0.05, "triangle", 0.15); } }

function pocket(b, p) {
  b.in = true; b.vx = b.vy = 0; b.px = p.x; b.py = p.y; b.sink = 1;
  Shell.sfx("cup");
  Juke.sfx("drop", b.n === 0 ? 1 : 0, 0.07);
  if (!S.shot) return;
  if (b.n === 0) S.shot.scratch = true;
  else { S.shot.pots++; S.potted++; if (S.x && S.x.rare && POCKETS[S.x.rare.p] === p) S.shot.rarePot = true; }
}

/* ---------------- Shooting (the 2D game's) ---------------- */
function canShoot() { return S.phase === "aim" && S.pt > 0.12; }
function shoot(ang, p) {
  if (!canShoot() || p < 0.04) return;
  const v = 60 + clamp(p, 0, 1) * (MAX_V - 60);
  S.cue.vx = Math.cos(ang) * v; S.cue.vy = Math.sin(ang) * v;
  S.shot = { pots: 0, scratch: false, first: false, isBreak: S.rackShots === 0 };
  S.shots++; S.rackShots++;
  S.phase = "roll"; S.pt = 0;
  S.drag = null; S.charging = false;
  Shell.sfx("hit");
  // presentation only: the cue follows through from where it was drawn back to
  V.strike = { a: ang, p: clamp(p, 0, 1), t: 0, x0: S.cue.x, y0: S.cue.y };
  Juke.sfx(S.shot.isBreak ? "break" : "strike", clamp(p, 0, 1));
  if (S.shot.isBreak && p > 0.55) camShake(2.2 * p, 0.25);
}

function endShot() {
  const sh = S.shot, board = [];
  let msg = null;
  S.shot = null;
  if (S.x) extrasShot(sh);
  if (sh.isBreak && sh.pots > 0) {
    S.breakPots++; if (window.Trophies) Trophies.unlock("psp-break");
    board.push(ledMsg("flash", "BREAK!", 1.4));
  }
  if (sh.pots >= 2) {
    S.bonus += COMBO_SEC; S.combos++; S.bestCombo = Math.max(S.bestCombo, sh.pots);
    msg = [sh.pots >= 3 ? "BULK LOT DEAL" : "TWO FOR ONE", sh.pots + " balls, one shot. -" + COMBO_SEC + " SEC", "#9bff3f"];
    Shell.sfx("score");
    if (window.Trophies) { Trophies.unlock("psp-combo"); if (sh.pots >= 3) Trophies.unlock("psp-three"); }
    board.push(ledMsg("cycle", sh.pots >= 3 ? "BULK LOT DEAL" : "TWO FOR ONE", 1.8), ledMsg("slide", "-" + COMBO_SEC + " SEC", 1.4, { color: "lime" }));
    Juke.sfx("combo", sh.pots >= 3 ? 1 : 0, 0.15);
    mood("clap", 1.4); burstAt(W / 2, 220, sh.pots >= 3 ? 46 : 26); camShake(1.2, 0.2);
  } else if (sh.pots === 1 && !sh.scratch) board.push(ledMsg("slide", "SOLD!", 1.2, { color: "yellow" }));
  if (sh.scratch) {
    S.penalty += SCRATCH_SEC; S.scratches++;
    msg = ["SCRATCH", "That cue ball was not for sale. +" + SCRATCH_SEC + " SEC", "#ff4b3e"];
    Shell.sfx("miss");
    if (window.Trophies) Trophies.unlock("psp-scratch");
    respot();
    board.length = 0;
    board.push(ledMsg("blink", "SCRATCH +" + SCRATCH_SEC + " SEC", 2, { color: "red" }));
    Juke.sfx("scratch", 0, 0.12);
    mood("shake", 1.3);
  }
  // balls-in-a-row streak pill (shared/rewards.js): consecutive shots that pot a ball without a scratch
  if (sh.pots > 0 && !sh.scratch) { S.potRow = (S.potRow || 0) + 1; if (window.NPRewards && S.potRow >= 2) NPRewards.streak(S.potRow); }
  else S.potRow = 0;
  let left = 0;
  for (let i = 0; i < S.balls.length; i++) if (!S.balls[i].in) left++;
  if (left === 0) {
    if (window.Trophies) Trophies.unlock("psp-rack");
    if (S.rack >= RACKS) { finish(true); return; }
    S.rack++;
    S.balls = rackBalls(); S.rackShots = 0;
    if (!sh.scratch) { S.cue.x = HEAD.x; S.cue.y = HEAD.y; }
    respot();
    msg = ["RACK " + S.rack, S.rack === 2 ? "Fresh rack. The clock keeps running." : "Last rack before closing.", "#ffd23f"];
    Shell.sfx("best");
    board.length = 0;
    board.push(ledMsg("flash", "RACK " + S.rack + (S.rack === RACKS ? " LAST ONE" : ""), 1.8), ledMsg("count", "CLOCK", 1.8, { value: Math.round(clock()), fmt: fmt }));
    Juke.sfx("rack", 0, 0.1);
    mood("clap", 1.2); burstAt(W / 2, 200, 40);
  }
  if (msg) Shell.flash(msg[0], msg[1], msg[2], 1100);
  if (board.length) ledPlay(board);
  S.phase = "aim"; S.pt = 0;
}

function respot() {
  const c = S.cue, y = HEAD.y;
  c.in = false; c.sink = 0; c.vx = c.vy = 0;
  for (let tries = 0; tries < 40; tries++) {
    const x = HEAD.x + ((tries % 2) ? 1 : -1) * Math.ceil(tries / 2) * 6;
    let ok = true;
    for (let i = 0; i < S.balls.length; i++) { const b = S.balls[i]; if (!b.in && Math.hypot(b.x - x, b.y - y) < 2 * R + 1) { ok = false; break; } }
    if (ok) { c.x = x; c.y = y; return; }
  }
  c.x = HEAD.x; c.y = HEAD.y;
}

/* ---------------- Batch 3 extras (the 2D game's) ---------------- */
const EVENTS = [
  { title: "Trunk Deal", text: "A guy in a faded muscle car offers a milk crate of carts. Pay 10 seconds, sight unseen?",
    a: { label: "Pay 10 sec", run: function () { S.penalty += 10; if (X.coin(0.45)) return rareNow("Under the football carts: "); return "A crate of worthless football carts. Plus 10 seconds."; } },
    b: { label: "Pass", run: function () { return "He drives off. Probably nothing in there."; } } },
  { title: "Price Swap", text: "Someone swapped a $50 tag with a $2 tag on the cue rack.",
    a: { label: "Be honest", run: function () { S.bonus += 5; return "The owner appreciates it. 5 seconds off the clock."; } },
    b: { label: "Pay $2", run: function () { if (X.coin(0.5)) { S.bonus += 5; return "Nobody noticed. 5 seconds off."; } S.penalty += 10; return "Caught at the register. Plus 10 seconds."; } } },
  { title: "Guard Dog", text: "A grumpy bulldog is napping on the rail next to a corner pocket.",
    a: { label: "Pet him", run: function () { if (X.coin(0.5)) return "He licks your hand and waddles off."; S.penalty += 6; return "He bites. Plus 6 seconds."; } },
    b: { label: "Bribe him", run: function () { S.penalty += 2; return "A snack costs 2 seconds. He leaves happy."; } } },
  { title: "Pawn Lowball", text: "The broker offers a heavy box of sports carts for one dollar.",
    a: { label: "Take it", run: function () { S.penalty += 4; if (X.coin(0.3)) return rareNow("At the very bottom: "); return "Thirty copies of the same baseball game. Plus 4 seconds."; } },
    b: { label: "Pass", run: function () { return "You keep your shelf space."; } } },
  { title: "The Stand-Off", text: "The owner says he might close early. Call his bluff?",
    a: { label: "Walk away", run: function () { if (X.coin(0.5)) { S.bonus += 5; return "He calls you back. 5 seconds off."; } S.penalty += 5; return "He lets you walk. Plus 5 seconds."; } },
    b: { label: "Keep playing", run: function () { return "You chalk up and keep shooting."; } } }
];
function rareMult() { const sc = S.x.sc.id; return (sc === "suburbs" ? 3 : sc === "fog" ? 1.5 : 1) * (S.x.fever.active() ? 2 : 1); }
function rareNow(prefix) {
  const it = X.rollRare(rareMult()), fake = S.x.sc.id === "twilight" && X.coin(0.35);
  const pts = X.collect(it, fake);
  if (!fake) { S.x.rares++; S.bonus += pts; rareShow(); return (prefix || "") + it.n + " (" + X.TIER[it.t].word + "). " + pts + " seconds off."; }
  return "It was a reproduction cartridge. Nothing gained.";
}
function extrasShot(sh) {
  const x = S.x;
  // a clean pot keeps the streak going; three in a row starts the Hot Streak
  if (sh.pots > 0 && !sh.scratch) x.fever.hit("Clock runs at half speed"); else x.fever.miss();
  if (sh.rarePot && x.rare) {
    x.rare = null;
    const it = X.rollRare(rareMult()), fake = S.x.sc.id === "twilight" && X.coin(0.35), pts = X.collect(it, fake);
    if (!fake) { x.rares++; S.bonus += pts; rareShow(); }
  }
  else if (x.rare && --x.rare.shots <= 0) x.rare = null;
  if (!x.rare && Math.random() < 0.16 * rareMult()) x.rare = { p: Math.floor(Math.random() * POCKETS.length), shots: 3 };
}
function extrasTick(dt) {
  const x = S.x;
  if (!x.intro) { x.intro = true; Shell.flash(x.sc.name, x.sc.line, "#9bff3f", 1500); }
  x.fever.tick(dt);
  if (S.phase === "aim" && !S.charging && !S.drag && x.sched.due(clock())) { x.events++; X.startEvent(X.pick(EVENTS)); }
}
function clockRate() {
  if (!S.x) return 1;
  const r = S.x.sc.id === "sun" || S.x.sc.id === "suburbs" ? 1.1 : S.x.sc.id === "golden" ? 0.9 : 1;
  return S.x.fever.active() ? r * 0.5 : r;
}
// presentation only: a rare find lights up the board
function rareShow() { ledPlay([ledMsg("flash", "RARE FIND!", 1.6)], !!(LED && LED.msg)); Juke.sfx("rare", 0, 0.1); }

function finish(cleared) {
  if (S.over) return;
  S.over = true;
  const left = ballsLeft(), score = Math.round(clock()) + (cleared ? 0 : left * LEFT_SEC);
  let html = row("Shot clock", fmt(Math.round(clock()))) + row("Shots", S.shots) + row("Scratches", S.scratches + " (+" + S.scratches * SCRATCH_SEC + " sec)") +
    row("Two for one shots", S.combos + " (-" + S.combos * COMBO_SEC + " sec)");
  if (!cleared) html += row("Balls left at closing", left + " (+" + left * LEFT_SEC + " sec)");
  if (S.x) html += row("Scenery", S.x.sc.name) + row("Rare finds", S.x.rares + " this run, " + X.foundCount() + " of " + X.RARES.length + " found") + row("Hot Streaks", S.x.fever.count);
  // presentation: the board and the band take the final moment
  if (cleared) { ledPlay([ledMsg("flash", "CLEARED OUT!", 2.2)]); Juke.sfx("cleared"); mood("clap", 3); burstAt(W / 2, 230, 70); }
  else { V.closed = true; ledPlay([ledMsg("blink", "SORRY WE'RE CLOSED", 2.4, { color: "red" })]); Juke.sfx("closed"); }
  ledFinal(score);
  Shell.gameOver(score, { title: cleared ? "CLEARED OUT" : "CLOSED", html: html,
    stats: { cleared: cleared, time: score, racks: cleared ? RACKS : S.rack - 1, shots: S.shots, scratches: S.scratches, combos: S.combos, bestCombo: S.bestCombo, potted: S.potted } });
}
function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }
function fmt(n) { n = Math.max(0, Math.round(n)); return Math.floor(n / 60) + ":" + ("0" + (n % 60)).slice(-2); }

/* ---------------- Update (the 2D game's, plus presentation timers) ---------------- */
function update(dt) {
  if (X && X.eventActive()) { X.eventTick(dt); return; }
  S.t += dt; S.pt += dt; S.time += dt * clockRate();
  if (S.x) extrasTick(dt);
  let i;
  for (i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 200 * dt; q.rot += q.vr * dt; if (q.life <= 0) parts.splice(i, 1); }
  const a = all();
  for (i = 0; i < a.length; i++) if (a[i].sink > 0) a[i].sink = Math.max(0, a[i].sink - dt * 4);
  if (clock() >= CLOSE_AT && !S.over) {
    Shell.flash("CLOSED", "The shopkeeper flipped the sign.", "#ff4b3e", 1200);
    Shell.sfx("buzzer");
    finish(false);
    return;
  }
  presentationTick();
  if (S.phase === "aim") {
    const turn = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0), fine = (keys.ArrowUp ? -1 : 0) + (keys.ArrowDown ? 1 : 0);
    if (turn || fine) { S.holdT = (S.holdT || 0) + dt; S.aim += (turn * (S.holdT > 0.5 ? 1.8 : 0.7) + fine * 0.18) * dt; S.kb = true; }
    else S.holdT = 0;
    if (S.charging) { S.chargeT += dt; const ph = (S.chargeT / 1.2) % 2; S.power = ph < 1 ? ph : 2 - ph; }
    return;
  }
  if (S.phase === "roll") {
    let mx = 1;
    for (i = 0; i < a.length; i++) if (!a[i].in) mx = Math.max(mx, Math.hypot(a[i].vx, a[i].vy));
    const n = clamp(Math.ceil(mx * dt / 3), 1, 40);
    for (i = 0; i < n; i++) step(dt / n);
    if (!moving() && S.pt > 0.15) endShot();
  }
}
// Closing-time warnings and the Hot Streak announcement. Reads the clock, never changes it.
function presentationTick() {
  const left = CLOSE_AT - clock();
  if (V.warned < 1 && left <= 60) { V.warned = 1; ledPlay([ledMsg("blink", "1 MINUTE TO CLOSING", 2.4, { color: "orange" })]); Juke.sfx("warn"); }
  if (V.warned < 2 && left <= 30) { V.warned = 2; ledPlay([ledMsg("blink", "30 SEC TO CLOSING", 2.4, { color: "red" })]); Juke.sfx("warn", 1); }
  const fv = !!(S.x && S.x.fever.active());
  if (fv && !V.fever) { ledPlay([ledMsg("cycle", "HOT STREAK", 2)], !!(LED && LED.msg)); Juke.sfx("fever"); }
  V.fever = fv;
}

/* ---------------- Input (the 2D game's; the drag is read through the 3D camera) ---------------- */
/* Aim guide: optional, on by default, remembered on this device (npArcade.pawn-shop-pool.guide). */
function guide() { if (guideOn === null) guideOn = Shell.load("guide") !== "0"; return guideOn; }
function toggleGuide() {
  guideOn = !guide();
  Shell.save("guide", guideOn ? "1" : "0");
  Shell.flash(guideOn ? "GUIDE ON" : "GUIDE OFF", guideOn ? "Aim line, first bounce and contact shown." : "Eyeball it. Press G to bring it back.", guideOn ? "#3ff0ff" : "#8e93a2", 800);
  Shell.tone(guideOn ? 880 : 440, 0.06, "square", 0.15);
}
function inGuideBtn(x, y) { return x >= GBTN.x - 4 && x <= GBTN.x + GBTN.w + 4 && y >= 0 && y <= 54; }
function pointer(type, x, y) {
  if (X && X.eventActive()) { X.eventPointer(type, x, y); return; }
  if (type === "down") {
    if (inGuideBtn(x, y)) { toggleGuide(); return; }
    if (!canShoot()) return;
    S.drag = { sx: x, sy: y, x: x, y: y }; S.kb = false; S.charging = false;
  } else if (type === "move" && S.drag) {
    S.drag.x = x; S.drag.y = y;
    const dx = S.drag.sx - x, dy = S.drag.sy - y, l = Math.hypot(dx, dy);
    if (l > 6) S.aim = aimFromScreen(dx / l, dy / l);
  } else if ((type === "up" || type === "cancel") && S.drag) {
    const d = S.drag; S.drag = null;
    if (type === "cancel") return;
    const len = Math.hypot(d.sx - d.x, d.sy - d.y);
    if (len < 8) return;
    shoot(aimFromScreen((d.sx - d.x) / len, (d.sy - d.y) / len), clamp(len / MAX_PULL, 0, 1));
  }
}
// The pull is measured on screen exactly as before (MAX_PULL px for full power). Its direction is read
// through the camera, so the cue ball leaves along the line the pull draws on screen even though the
// table is now seen at an angle.
function aimFromScreen(ux, uy) {
  if (RD && RD.camReady) {
    const b = S.cue, p0 = tableToScreen(b.x, b.y, R);
    const g = screenToTable(p0.x + ux * 24, p0.y + uy * 24, R);
    if (g) {
      const ax = g.x - b.x, ay = g.y - b.y;
      if (ax * ax + ay * ay > 1e-6) return Math.atan2(ay, ax);
    }
  }
  return Math.atan2(uy, ux);
}
function key(type, code, e) {
  if (X && X.eventActive()) { keys = {}; X.eventKey(type, code); return; }
  const act = code === "Space" || code === "Enter" || code === "NumpadEnter";
  if (type === "down") {
    keys[code] = true;
    if (code === "KeyG" && !e.repeat) { toggleGuide(); return; }
    if (act && !e.repeat && canShoot() && !S.charging) { S.charging = true; S.chargeT = 0; S.power = 0; S.kb = true; S.drag = null; }
  } else {
    keys[code] = false;
    if (act && S.charging) { S.charging = false; shoot(S.aim, S.power); S.power = 0; }
  }
}
function currentShot() {
  if (S.drag) {
    const len = Math.hypot(S.drag.sx - S.drag.x, S.drag.sy - S.drag.y);
    if (len < 6) return { a: S.aim, p: 0 };
    return { a: S.aim, p: clamp(len / MAX_PULL, 0, 1) };
  }
  return { a: S.aim, p: S.charging ? S.power : 0 };
}

/* ---------------- Guide rays (the 2D game's) ---------------- */
// Ray from the cue ball to the first thing it touches.
function cast(ang) {
  const dx = Math.cos(ang), dy = Math.sin(ang), cx = S.cue.x, cy = S.cue.y;
  let best = 9999, hit = null;
  for (let i = 0; i < S.balls.length; i++) {
    const b = S.balls[i]; if (b.in) continue;
    const fx = b.x - cx, fy = b.y - cy, tproj = fx * dx + fy * dy;
    if (tproj <= 0) continue;
    const perp2 = fx * fx + fy * fy - tproj * tproj, rr = 4 * R * R;
    if (perp2 > rr) continue;
    const tt = tproj - Math.sqrt(rr - perp2);
    if (tt < best) { best = tt; hit = b; }
  }
  let tw = 9999;
  if (dx > 0) tw = Math.min(tw, (X1 - R - cx) / dx); if (dx < 0) tw = Math.min(tw, (X0 + R - cx) / dx);
  if (dy > 0) tw = Math.min(tw, (Y1 - R - cy) / dy); if (dy < 0) tw = Math.min(tw, (Y0 + R - cy) / dy);
  if (tw < best) { best = tw; hit = null; }
  return { d: best, ball: hit, x: cx + dx * best, y: cy + dy * best };
}
// Ray from any point along (dx, dy): first ball (ghost-ball contact) or rail it reaches.
function castFrom(cx, cy, dx, dy) {
  let best = 9999, hit = null, wall = null;
  for (let i = 0; i < S.balls.length; i++) {
    const b = S.balls[i]; if (b.in) continue;
    const fx = b.x - cx, fy = b.y - cy, tproj = fx * dx + fy * dy;
    if (tproj <= 0) continue;
    const perp2 = fx * fx + fy * fy - tproj * tproj, rr = 4 * R * R;
    if (perp2 > rr) continue;
    const tt = tproj - Math.sqrt(rr - perp2);
    if (tt < best) { best = Math.max(0, tt); hit = b; }
  }
  let tw = 9999, tx;
  if (dx > 1e-6) { tx = (X1 - R - cx) / dx; if (tx < tw) { tw = tx; wall = "x"; } }
  if (dx < -1e-6) { tx = (X0 + R - cx) / dx; if (tx < tw) { tw = tx; wall = "x"; } }
  if (dy > 1e-6) { tx = (Y1 - R - cy) / dy; if (tx < tw) { tw = tx; wall = "y"; } }
  if (dy < -1e-6) { tx = (Y0 + R - cy) / dy; if (tx < tw) { tw = tx; wall = "y"; } }
  if (tw < best) { best = Math.max(0, tw); hit = null; } else wall = null;
  const px = cx + dx * best, py = cy + dy * best;
  let pk = null;
  if (!hit) for (let j = 0; j < POCKETS.length; j++) if (Math.hypot(px - POCKETS[j].x, py - POCKETS[j].y) < MOUTH) { pk = POCKETS[j]; break; }
  return { d: best, ball: hit, wall: wall, pocket: pk, x: px, y: py };
}
// What the guide shows for a shot angle: the first contact, and the first bounce after a rail.
function guideFor(a) {
  const dx = Math.cos(a), dy = Math.sin(a), h = castFrom(S.cue.x, S.cue.y, dx, dy), g = { a: a, dx: dx, dy: dy, h: h, h2: null, rx: 0, ry: 0 };
  if (!h.ball && !h.pocket) {
    g.rx = h.wall === "x" ? -dx : dx; g.ry = h.wall === "y" ? -dy : dy;
    g.h2 = castFrom(h.x, h.y, g.rx, g.ry);
  }
  return g;
}

/* ---------------- Particles (HUD layer) ---------------- */
function burstAt(x, y, n) {
  if (Shell.reduced) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 50 + Math.random() * 160;
    parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 70, life: 1.1, c: CONF_COLS[i % CONF_COLS.length], rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14, w: 2.5 });
  }
}
function chalkPuff(x, y) {
  if (Shell.reduced) return;
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * TAU, s = 10 + Math.random() * 40;
    parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0.45, c: i % 2 ? "#7fb7ff" : "#cfe3ff", rot: 0, vr: 0, w: 1.4, dot: true });
  }
}

/* ---------------- The shopkeeper's mood (presentation only) ---------------- */
function mood(m, secs) { V.mood = m; V.moodT = secs; }

/* ---------------- Sound: the house band and the stingers ----------------
   The shell still plays every sound effect the 2D game had, exactly when it did. On top of that the game brings
   its own music and stingers for the big moments, all made in code with the Web Audio API, no audio files.
   The music is one self-contained function, startMusic() below: it reads nothing from the game, so it can be
   lifted out as-is and used as a station somewhere else. Juke is the game's side of it: it creates the audio
   context after the first tap, click or key press, follows the shell's mute button (the same "npArcade.muted"
   setting), keeps the band's own on / off ("npArcade.music"), starts and stops the station with the game, and
   plays the stingers. Neither rolls the game's dice. */
const MUSIC_VOL = 0.16, SFX_VOL = 0.2;                     // turn the band or the stingers up and down here
const MUSIC_KEY = "npArcade.music";
function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
const vrand = (function () { let s = 0x2545F491; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; })();

/* "Back Room Groove": an original sixteen-bar loop in A minor at 108 BPM (about thirty-five seconds): a filtered saw
   lead with an echo, a syncopated bass, electric piano stabs, a shimmer in the second half, and drums.
   startMusic(ctx, dest, opts) plays it into any AudioNode of any AudioContext and returns stop().
     opts.volume    output level (default 0.16)
     opts.delay     seconds before the first note (default 0.05)
     opts.fromStep  sixteenth note to start on, 0 to 255 (default 0), for example what an earlier stop() returned
     opts.ahead     seconds of music kept queued (default 0.6)
     opts.offline   true for an OfflineAudioContext: queues opts.ahead seconds at once, no timer
   stop(fade) fades out over about "fade" seconds (default 0.06), stops scheduling, lets go of its nodes and returns the
   step it had reached. stop.t0 (the context time of step 0) and stop.stepSec give its beat grid.
   Self-contained on purpose: no game state, no outside variables, its own random numbers. */
function startMusic(ctx, dest, opts) {
  opts = opts || {};
  const VOL = opts.volume == null ? 0.16 : opts.volume, AHEAD = opts.ahead || 0.6;
  const BPM = 108, STEP = 60 / BPM / 4, STEPS = 256;
  // bass note, then the three notes the piano and the shimmer use (MIDI numbers)
  const CHORDS = { Am: [33, 57, 60, 64], F: [41, 57, 60, 65], C: [36, 55, 60, 64], G: [43, 55, 59, 62], Dm: [38, 57, 62, 65], E: [40, 56, 59, 64], Em: [40, 55, 59, 64] };
  // one chord per half bar
  const PROG = "Am Am F F C C G G Am Am F F Dm Dm E E F F G G Em Em Am Am F F G G E E E E".split(" ");
  // the tune, a bar a line: step in the bar, note, length in steps
  const BARS = [
    "0A4-2 2C5-2 4E5-3 7D5-1 8C5-2 10A4-2 12E5-4",
    "0F5-3 3E5-1 4C5-2 6A4-2 8C5-3 11D5-1 12C5-4",
    "0E5-2 2G5-2 4C6-3 7B5-1 8G5-2 10E5-2 12G5-4",
    "0D5-2 2G5-2 4B5-2 6D6-2 8B5-3 11A5-1 12G5-4",
    "0A5-3 3G5-1 4E5-2 6C5-2 8E5-2 10G5-2 12A5-4",
    "0C6-3 3A5-1 4F5-2 6A5-2 8C6-2 10A5-2 12F5-4",
    "0D5-2 2F5-2 4A5-3 7G5-1 8F5-2 10D5-2 12F5-2 14A5-2",
    "0G#5-3 3B5-1 4E6-4 8D6-2 10B5-2 12G#5-4",
    "0A5-2 2C6-2 4A5-2 6F5-2 8G5-3 11F5-1 12E5-4",
    "0D5-2 2G5-2 4B5-2 6D6-2 8C6-3 11B5-1 12G5-4",
    "0E5-2 2G5-2 4B5-3 7A5-1 8G5-2 10E5-2 12B4-4",
    "0C5-2 2E5-2 4A5-4 8G5-2 10E5-2 12A5-4",
    "0F5-1 1A5-1 2C6-2 4A5-2 6F5-2 8E5-2 10F5-2 12A5-4",
    "0B5-2 2D6-2 4G5-2 6B5-2 8D6-3 11C6-1 12B5-4",
    "0E6-3 3D6-1 4B5-2 6G#5-2 8E5-2 10G#5-2 12B5-4",
    "0E5-1 2G#5-1 4B5-1 6E6-2 8D6-1 10B5-1 12G#5-2 14B5-2"
  ];
  const BASS = { 0: 0, 3: 0, 6: 12, 8: 0, 11: 7, 12: 0, 14: 12 };   // step in the bar: interval above the root
  const hz = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  const LEAD = new Array(STEPS).fill(null), semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  BARS.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(#?)(\d)-(\d+)$/.exec(tok);
      if (m) LEAD[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + semis[m[2]] + (m[3] ? 1 : 0), Number(m[5])];
    });
  });
  let seed = 0x1F2E3D4C;
  function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }

  // the mixing desk: everything ends in "out", the only node connected to dest
  const out = ctx.createGain(); out.gain.value = 0; out.connect(dest);
  const mix = ctx.createGain(); mix.connect(out);
  function filter(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const lead = filter("lowpass", 2300, 1.4, mix), bass = filter("lowpass", 700, 2.2, mix), keys = filter("lowpass", 3400, 0.7, mix);
  const send = ctx.createGain(), echo = ctx.createDelay(1), back = ctx.createGain(), damp = filter("lowpass", 1900, 0.7, mix);
  send.gain.value = 0.32; echo.delayTime.value = STEP * 3; back.gain.value = 0.34;   // a dotted-eighth echo on the lead
  lead.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(damp);
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate), nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;

  // One note: a quick attack, held for part of its length, then it dies away. f1 slides the pitch.
  function osc(to, type, f0, t, dur, vol, f1, hold, detune) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.55 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.03);
  }
  // A burst of filtered noise: hats, shaker, snare.
  function hiss(t, dur, vol, type, f0, q) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(mix); s.start(t, rnd() * 1.5); s.stop(t + dur + 0.05);
  }
  // Everything that sounds on sixteenth note i of the loop, starting at time t.
  function playStep(i, t) {
    const bar = i >> 4, s = i & 15, ch = CHORDS[PROG[i >> 3]], second = bar >= 8, n = LEAD[i];
    if (n) {                                                // two detuned saws through the filter, a triangle underneath
      osc(lead, "sawtooth", hz(n[0]), t, n[1] * STEP * 0.92, 0.075, 0, 0.6, -7);
      osc(lead, "sawtooth", hz(n[0]), t, n[1] * STEP * 0.92, 0.075, 0, 0.6, 7);
      osc(mix, "triangle", hz(n[0] - 12), t, n[1] * STEP * 0.9, 0.06, 0, 0.6);
    }
    if (s in BASS) osc(bass, "sawtooth", hz(ch[0] + BASS[s]), t, STEP * 1.7, 0.36, 0, 0.5);
    if (s === 4 || s === 12 || (second && s === 10)) {      // electric piano stabs on the off-beats
      for (let k = 1; k < 4; k++) { osc(keys, "triangle", hz(ch[k] + 12), t, 0.22, 0.05, 0, 0.25); osc(keys, "sine", hz(ch[k] + 24), t, 0.14, 0.022, 0, 0.15); }
    }
    if (second && (s & 1)) osc(mix, "triangle", hz(ch[1 + ((s >> 1) % 3)] + 24), t, STEP * 0.9, 0.028, 0, 0.3);   // shimmer
    if (!(s & 1)) hiss(t, s === 14 ? 0.16 : 0.035, s % 4 === 2 ? 0.085 : 0.05, "highpass", 7600, 0.7);
    else hiss(t, 0.025, 0.022, "highpass", 9000, 0.7);                                                           // shaker
    const fill = bar === 7 ? s >= 12 : bar === 15 ? s >= 8 && (s % 2 === 0 || s >= 12) : false;
    if (fill || s === 4 || s === 12) {
      const v = fill ? 0.55 + 0.45 * (s - 8) / 7 : 1;
      hiss(t, 0.14, 0.3 * v, "bandpass", 1700, 0.6);
      osc(mix, "triangle", 210, t, 0.07, 0.18 * v, 140, 0.1);
    }
    if (s === 0 || s === 8 || (second && (s === 6 || s === 14)) || (!second && s === 10)) osc(mix, "sine", 140, t, 0.17, 0.6, 40, 0.08);
  }

  let step = ((opts.fromStep | 0) % STEPS + STEPS) % STEPS, alive = true;
  let nextT = ctx.currentTime + (opts.delay == null ? 0.05 : opts.delay);
  out.gain.setValueAtTime(0, ctx.currentTime);
  out.gain.setTargetAtTime(VOL, Math.max(ctx.currentTime, nextT - 0.04), 0.012);
  function pump() {
    if (!alive || (ctx.state !== "running" && !opts.offline)) return;
    const now = ctx.currentTime;
    if (nextT < now) { nextT = now + 0.03; stop.t0 = nextT - step * STEP; }   // only after a stall longer than the queue
    while (nextT < now + AHEAD) { playStep(step, nextT); step = (step + 1) % STEPS; nextT += STEP; }
  }
  const timer = opts.offline ? 0 : setInterval(pump, 50);
  function stop(fade) {
    if (!alive) return step;
    alive = false;
    if (timer) clearInterval(timer);
    const now = ctx.currentTime;
    out.gain.cancelScheduledValues(now); out.gain.setTargetAtTime(0, now, fade == null ? 0.06 : fade);
    setTimeout(function () { try { out.disconnect(); } catch (e) { /* already gone */ } }, 1500);
    return step;
  }
  stop.t0 = nextT - step * STEP; stop.stepSec = STEP;
  pump();
  return stop;
}

const Juke = (function () {
  let live = null, dead = false, muted = false, going = false, fresh = true, step = 0, timer = 0, hurry = false, band = null, tickT = 0;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  const buttons = [];

  // Everything between the sounds and the speaker. The station plays into "duck", the stingers into "sfx".
  function rig(c) {
    const A = { c: c };
    A.out = c.createGain();                                 // follows the mute button
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    A.out.connect(comp); comp.connect(c.destination);
    A.duck = c.createGain();                                // the band steps back for the big stingers
    A.duck.connect(A.out);
    A.sfx = c.createGain(); A.sfx.gain.value = SFX_VOL; A.sfx.connect(A.out);
    const len = Math.floor(c.sampleRate * 2);
    A.noise = c.createBuffer(1, len, c.sampleRate);
    const d = A.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = vrand() * 2 - 1;
    return A;
  }
  // One note: a quick attack, held for part of its length, then it dies away. f1 slides the pitch.
  function osc(A, dest, type, f0, t, dur, vol, f1, hold, detune) {
    const o = A.c.createOscillator(), g = A.c.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.55 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.03);
  }
  // A burst of filtered noise: the crack of the break, the register drawer.
  function hiss(A, dest, t, dur, vol, type, f0, q, f1, atk) {
    const s = A.c.createBufferSource(), f = A.c.createBiquadFilter(), g = A.c.createGain();
    s.buffer = A.noise; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, vrand() * 1.5); s.stop(t + dur + 0.05);
  }

  function duck(A, t, secs) {
    A.duck.gain.cancelScheduledValues(t);
    A.duck.gain.setTargetAtTime(0.45, t, 0.03);
    A.duck.gain.setTargetAtTime(1, t + secs, 0.25);
  }
  // The stingers. x is a detail of the moment (how hard the shot was, a three-ball deal, the last warning).
  function cue(A, name, t, x) {
    const d = A.sfx;
    if (name === "strike") {                                // leather tip on the cue ball
      osc(A, d, "sine", 900 + 500 * x, t, 0.05, 0.5 + 0.4 * x, 420, 0.1);
      hiss(A, d, t, 0.03, 0.25 + 0.3 * x, "bandpass", 3200, 1.2);
    } else if (name === "break") {                          // the break: a crack and a thump through the slate
      hiss(A, d, t, 0.09, 0.9, "highpass", 2800, 0.7);
      osc(A, d, "sine", 160, t, 0.25, 0.9, 50, 0.05);
      hiss(A, d, t + 0.02, 0.4, 0.35, "bandpass", 1300, 0.8, 600);
    } else if (name === "drop") {                           // a ball down the pocket: a thunk and a short rattle
      osc(A, d, "sine", x ? 120 : 150, t, 0.16, 0.55, 60, 0.1);
      for (let i = 0; i < 3; i++) osc(A, d, "triangle", 900 + vrand() * 500, t + 0.06 + i * 0.045, 0.03, 0.12 - i * 0.03, 0, 0.3);
    } else if (name === "combo") {                          // two for one: the register rings it up
      hiss(A, d, t, 0.08, 0.4, "bandpass", 2600, 2);
      [1568, 2093, 2637].forEach(function (f, i) { osc(A, d, "sine", f, t + 0.06 + i * 0.07, 0.6, 0.22, 0, 0.1); osc(A, d, "triangle", f * 2, t + 0.06 + i * 0.07, 0.3, 0.06, 0, 0.1); });
      if (x) for (let i = 0; i < 6; i++) osc(A, d, "square", mtof(i % 2 ? 91 : 88), t + 0.32 + i * 0.05, 0.05, 0.15, 0, 0.6);
      duck(A, t, 0.9);
    } else if (name === "scratch") {                        // scratch: a sad three-step slide down
      [[392, 0], [370, 0.17], [349, 0.34]].forEach(function (p) { osc(A, d, "sawtooth", p[0] / 2, t + p[1], 0.2, 0.16, 0, 0.6); });
      osc(A, d, "sawtooth", 165, t + 0.51, 0.55, 0.18, 120, 0.4);
      duck(A, t, 1.1);
    } else if (name === "rack") {                           // fresh rack: up the chord and a held one on top
      [69, 72, 76, 81, 84].forEach(function (m, i) { osc(A, d, "square", mtof(m), t + i * 0.065, 0.11, 0.2, 0, 0.5); });
      [81, 84, 88].forEach(function (m) { osc(A, d, "triangle", mtof(m), t + 0.33, 0.6, 0.16, 0, 0.3); });
      duck(A, t, 1.2);
    } else if (name === "cleared") {                        // cleared out: a fanfare
      [72, 76, 79, 84, 79, 84, 88, 91].forEach(function (m, i) { osc(A, d, "square", mtof(m), t + i * 0.08, 0.13, 0.2, 0, 0.5); });
      [84, 88, 91, 96].forEach(function (m) { osc(A, d, "triangle", mtof(m), t + 0.66, 1.0, 0.14, 0, 0.4); });
      duck(A, t, 2.2);
    } else if (name === "closed") {                         // the bell over the shop door
      [0, 0.32].forEach(function (o) { osc(A, d, "sine", 2349, t + o, 0.7, 0.2, 0, 0.02); osc(A, d, "sine", 3520, t + o + 0.01, 0.5, 0.1, 0, 0.02); });
      duck(A, t, 1.6);
    } else if (name === "warn") {                           // closing soon: two pips (three on the last warning)
      for (let i = 0; i < (x ? 3 : 2); i++) osc(A, d, "square", 1046, t + i * 0.16, 0.09, 0.2, 0, 0.6);
    } else if (name === "rare") {                           // a rare find: a sparkle up the scale
      [84, 88, 91, 96, 100].forEach(function (m, i) { osc(A, d, "sine", mtof(m), t + i * 0.05, 0.3, 0.16, 0, 0.1); });
    } else if (name === "fever") {                          // the Hot Streak: a power-up slide and two blips
      osc(A, d, "square", 330, t, 0.3, 0.2, 1320, 0.8);
      osc(A, d, "square", 1320, t + 0.32, 0.07, 0.22, 0, 0.5); osc(A, d, "square", 1760, t + 0.4, 0.16, 0.22, 0, 0.5);
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
        if (!timer) timer = setInterval(pump, 120);         // keeps following the game if the picture ever stalls
      }
      if (live.c.state !== "running") { const p = live.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { live = null; dead = true; }
  }
  // Called every frame: follow the mute button, and start or stop the station with the game.
  function pump() {
    const A = live;
    if (!A || !window.Shell) return;
    const c = A.c, now = c.currentTime, m = shellMuted();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, now, 0.02); }
    const want = musicOn && !muted && c.state === "running" && Shell.state() === "playing";
    if (want && !going) {                                   // a fresh game lets the shell's start jingle go first
      going = true;
      band = startMusic(c, A.duck, { volume: MUSIC_VOL, delay: fresh ? 0.42 : 0.08, fromStep: step });
      fresh = false; tickT = 0;
    } else if (!want && going) {                            // after a pause it picks up where it left off
      going = false;
      step = band ? band() : 0; band = null;
    }
    // closing time: a clock ticks along on the band's beat. That is the game's layer, kept out of the station.
    if (going && hurry && band) {
      const g = band.stepSec * 4;
      if (tickT < now) tickT = band.t0 + Math.ceil((now + 0.02 - band.t0) / g) * g;
      while (tickT < now + 0.6) { osc(A, A.duck, "sine", Math.round((tickT - band.t0) / g) % 2 ? 1500 : 1900, tickT, 0.04, 0.02, 0, 0.2); tickT += g; }
    }
  }
  function sfx(name, x, delay) {
    const A = live;
    if (!A || muted || A.c.state !== "running") return;
    try { cue(A, name, A.c.currentTime + 0.01 + (delay || 0), x || 0); } catch (e) { /* sound is never worth a crash */ }
  }
  function label() {
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].textContent = musicOn ? "MUSIC: ON" : "MUSIC: OFF";
      buttons[i].setAttribute("aria-pressed", musicOn ? "true" : "false");
    }
  }
  function setMusic(on) {
    musicOn = !!on;
    try { localStorage.setItem(MUSIC_KEY, musicOn ? "1" : "0"); } catch (e) { /* private mode */ }
    label(); pump();
  }
  // A "MUSIC: ON / OFF" button in the shell's own button style, for the title card and the pause card.
  function button(parent, before) {
    if (!parent) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-btn"; b.setAttribute("data-np-music", "");
    b.style.cssText = "width:100%;margin-top:8px";
    b.addEventListener("click", function (e) { e.stopPropagation(); unlock(); setMusic(!musicOn); });   // never a "tap to start"
    parent.insertBefore(b, before || null);
    buttons.push(b); label();
  }
  return {
    unlock: unlock, pump: pump, sfx: sfx, button: button,
    setHurry: function (on) { hurry = !!on; },
    newGame: function () { unlock(); if (band) band(0.03); band = null; step = 0; fresh = true; going = false; hurry = false; pump(); },
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    // for checks: what the engine is doing right now
    peek: function () { return { made: !!live, state: live ? live.c.state : "none", going: going, step: step, muted: muted, musicOn: musicOn, hurry: hurry }; },
    cue: cue
  };
})();

/* =====================================================================================
   3D presentation
   ===================================================================================== */

/* ---------------- Small helpers ---------------- */
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
function speckle(g, w, h, n, rnd, light, dark) {
  for (let i = 0; i < n; i++) { g.fillStyle = rnd() < 0.5 ? light : dark; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
}
function candyText(g, str, x, y, size, maxW) {
  const face = '"Arial Black", "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
  g.font = "900 " + size + "px " + face;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + face; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = size * 0.36; g.strokeStyle = "#08205f"; g.strokeText(str, x, y + size * 0.06);
  g.lineWidth = size * 0.17; g.strokeStyle = "#ffffff"; g.strokeText(str, x, y);
  const gr = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  gr.addColorStop(0, "#fff06a"); gr.addColorStop(0.55, "#ffc21a"); gr.addColorStop(1, "#ff7a0f");
  g.fillStyle = gr; g.fillText(str, x, y);
  g.fillStyle = "rgba(255,255,255,.45)";
  g.save(); g.beginPath(); g.rect(x - 600, y - size * 0.5, 1200, size * 0.36); g.clip(); g.fillText(str, x, y); g.restore();
}
// Paint a flat picture onto a sphere's wrap-around texture so it lands undistorted: every row is widened by 1 / cos(latitude).
function wrapOnto(g, src, cx, cy, w, h, CH) {
  const rowH = src.height / h;
  for (let r = 0; r < h; r++) {
    const y = Math.round(cy - h / 2 + r), lat = (0.5 - (y + 0.5) / CH) * Math.PI, ww = w / Math.max(0.35, Math.cos(lat));
    g.drawImage(src, 0, r * rowH, src.width, rowH, cx - ww / 2, y, ww, 1);
  }
}

/* ---------------- Painted textures (all drawn here, no image files besides the two logos) ---------------- */

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every sign and decal in the back room uses this
// (the full logo with the mascot is kept for the splash, the title card and the score card). If the PNG is missing,
// plain lettering stands in.
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

// Billiard cloth: a fine nap. One tile is 64 x 64 table units.
function clothCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(3);
  g.fillStyle = "#17924a"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.045)" : "rgba(0,40,10,.07)";
    g.fillRect(rnd() * 256, rnd() * 256, 1, 1 + rnd() * 2);
  }
  return c;
}
// The light pool the lamp throws on the cloth, and the falloff toward the rails.
function poolCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 150);
  gr.addColorStop(0, "rgba(255,250,214,.22)"); gr.addColorStop(0.55, "rgba(255,250,214,.08)"); gr.addColorStop(1, "rgba(255,250,214,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return c;
}
// The wordmark as a felt maker would print it: the same lettering in cloth greens, so the balls still show over it.
function feltMarkCanvas(script) {
  const c = mkCanvas(1024, 512), g = c.getContext("2d", { willReadFrequently: true });
  drawScript(g, script, 512, 256, 1000, 490);
  try {
    const im = g.getImageData(0, 0, 1024, 512), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const L = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
      d[i] = 10 + 120 * L; d[i + 1] = 96 + 130 * L; d[i + 2] = 44 + 110 * L;
    }
    g.putImageData(im, 0, 0);
  } catch (e) { /* leave it in its own colors */ }
  return c;
}
// Lacquered cherry for the rails, the apron and the legs. One tile is 60 x 60 units.
function woodCanvas(base) {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(11);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const y = rnd() * 256, a = 0.05 + rnd() * 0.12;
    g.strokeStyle = rnd() < 0.5 ? "rgba(40,10,0," + a + ")" : "rgba(255,190,140," + a * 0.6 + ")";
    g.lineWidth = 0.6 + rnd() * 2;
    g.beginPath();
    for (let x = -8; x <= 264; x += 16) g.lineTo(x, y + Math.sin(x / 40 + i) * 3 + Math.sin(x / 13 + i * 2) * 1.2);
    g.stroke();
  }
  return c;
}
// One numbered ball, wrapped around a sphere. The number sits at the front and the back.
function ballCanvas(n, script) {
  const CW = 512, CH = 256, c = mkCanvas(CW, CH), g = c.getContext("2d");
  const ivory = "#f7f3e8", col = n ? COLORS[n - 1] : ivory;
  g.fillStyle = n === 9 ? ivory : col; g.fillRect(0, 0, CW, CH);
  if (n === 9) { g.fillStyle = col; g.fillRect(0, CH / 2 - 54, CW, 108); }
  // a soft sheen band so the solids read as glossy even before the light hits them
  const sh = g.createLinearGradient(0, 0, 0, CH);
  sh.addColorStop(0, "rgba(255,255,255,.12)"); sh.addColorStop(0.5, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(0,0,0,.12)");
  g.fillStyle = sh; g.fillRect(0, 0, CW, CH);
  if (!n) {                                                  // the cue ball wears the wordmark, once on each side
    const SW = 150, SH = Math.round(SW * script.height / script.width);
    [128, 384].forEach(function (cx) { wrapOnto(g, script, cx, CH / 2, SW, SH, CH); });
    return c;
  }
  const disc = mkCanvas(80, 80), dg = disc.getContext("2d");
  dg.fillStyle = ivory; dg.beginPath(); dg.arc(40, 40, 39, 0, TAU); dg.fill();
  dg.fillStyle = "#121318"; dg.font = '900 50px "Arial Black", Arial, sans-serif'; dg.textAlign = "center"; dg.textBaseline = "middle";
  dg.fillText(String(n), 40, 43);
  if (n === 6 || n === 9) { dg.fillRect(25, 66, 30, 4); }   // so a 6 is never read as a 9
  [128, 384].forEach(function (cx) { wrapOnto(g, disc, cx, CH / 2, 64, 64, CH); });
  return c;
}
// The cue, painted down its length (v = 0 is the tip): blue chalk, white ferrule, maple shaft, steel joint,
// a forearm with inlaid points, the wrap with the wordmark, the butt sleeve and the rubber bumper.
function cueCanvas(script) {
  const c = mkCanvas(64, 1024), g = c.getContext("2d");
  const Y = function (u) { return u * 1024; };
  const sh = g.createLinearGradient(0, 0, 0, 1024);
  sh.addColorStop(0, "#f1dcb2"); sh.addColorStop(0.49, "#e2bf84"); g.fillStyle = sh; g.fillRect(0, 0, 64, Y(0.5));
  g.fillStyle = "#2f7bf0"; g.fillRect(0, 0, 64, Y(0.006));
  g.fillStyle = "#f6f3ea"; g.fillRect(0, Y(0.006), 64, Y(0.025));
  g.fillStyle = "#c7ccd8"; g.fillRect(0, Y(0.5), 64, Y(0.012)); g.fillStyle = "#5b6070"; g.fillRect(0, Y(0.506), 64, 2);
  g.fillStyle = "#3a1608"; g.fillRect(0, Y(0.512), 64, Y(0.488));
  for (let k = 0; k < 4; k++) {                               // the points of the forearm
    const x = k * 16 + 8;
    g.fillStyle = k % 2 ? "#ff9214" : "#1b56cf";
    g.beginPath(); g.moveTo(x - 7, Y(0.66)); g.lineTo(x, Y(0.53)); g.lineTo(x + 7, Y(0.66)); g.closePath(); g.fill();
  }
  g.fillStyle = "#f2e6c8"; g.fillRect(0, Y(0.66), 64, Y(0.006));
  g.fillStyle = "#101a3e"; g.fillRect(0, Y(0.666), 64, Y(0.2));                 // the wrap
  for (let y = Y(0.666); y < Y(0.866); y += 3) { g.fillStyle = "rgba(255,255,255,.06)"; g.fillRect(0, y, 64, 1); }
  g.save(); g.translate(32, Y(0.766)); g.rotate(Math.PI / 2);
  drawScript(g, script, 0, 0, Y(0.17), 54); g.restore();
  g.fillStyle = "#f2e6c8"; g.fillRect(0, Y(0.866), 64, Y(0.006));
  g.fillStyle = "#4a1c0a"; g.fillRect(0, Y(0.872), 64, Y(0.11));
  g.fillStyle = "#111216"; g.fillRect(0, Y(0.982), 64, Y(0.018));
  return c;
}
// Black and cream floor tiles. One tile of the canvas is two by two tiles, a foot each.
function floorCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(31);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? "#1b1d26" : "#d8cdb4"; g.fillRect(x * 128, y * 128, 128, 128); }
  speckle(g, 256, 256, 2400, rnd, "rgba(255,255,255,.06)", "rgba(0,0,0,.08)");
  for (let i = 0; i < 14; i++) { g.strokeStyle = "rgba(0,0,0,.1)"; g.lineWidth = 1 + rnd() * 2; g.beginPath(); const x = rnd() * 256, y = rnd() * 256; g.moveTo(x, y); g.quadraticCurveTo(x + 30, y + rnd() * 30, x + 50 + rnd() * 40, y + rnd() * 20); g.stroke(); }
  g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128); g.strokeRect(128, 128, 128, 128);
  return c;
}
// Pegboard over dark paneling: the back wall. One tile is 128 x 128 units; the paneling is its own texture.
function pegCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(5);
  g.fillStyle = "#c9a671"; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 1800, rnd, "rgba(255,240,210,.12)", "rgba(90,50,10,.12)");
  for (let y = 8; y < 256; y += 16) for (let x = 8; x < 256; x += 16) {
    g.fillStyle = "#3a2410"; g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill();
  }
  return c;
}
function panelCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(9);
  g.fillStyle = "#5a3418"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    const x = i * 32;
    g.fillStyle = i % 2 ? "#633a1b" : "#55301a"; g.fillRect(x, 0, 32, 256);
    g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(x, 0, 2, 256);
    for (let k = 0; k < 6; k++) { g.fillStyle = "rgba(30,10,0," + (0.06 + rnd() * 0.1) + ")"; g.fillRect(x + 3 + rnd() * 26, 0, 1, 256); }
  }
  return c;
}
function ceilCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d"), rnd = rng(13);
  g.fillStyle = "#cfc8b6"; g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 900, rnd, "rgba(255,255,255,.2)", "rgba(80,70,50,.18)");
  g.fillStyle = "#8b8574"; g.fillRect(0, 0, 128, 3); g.fillRect(0, 0, 3, 128);
  return c;
}
// The face of the apron at either end of the table: the wordmark on a brass plate, trim lines either side.
function apronCanvas(script) {
  const c = mkCanvas(1024, 128), g = c.getContext("2d");
  g.drawImage(woodCanvas("#6b1d12"), 0, 0, 1024, 128);
  g.fillStyle = "#ffcf5a"; g.fillRect(0, 10, 1024, 3); g.fillRect(0, 115, 1024, 3);
  rrectPath(g, 352, 16, 320, 96, 14);
  const br = g.createLinearGradient(0, 16, 0, 112); br.addColorStop(0, "#ffe9a8"); br.addColorStop(0.5, "#d9a441"); br.addColorStop(1, "#a8731f");
  g.fillStyle = br; g.fill(); g.lineWidth = 3; g.strokeStyle = "#5b3a0a"; g.stroke();
  rrectPath(g, 362, 24, 300, 80, 10); g.fillStyle = "#0d1f5c"; g.fill();
  drawScript(g, script, 512, 64, 280, 70);
  return c;
}
// The lid of a game box on the shelves: loud color, wordmark plate in the middle.
function boxCanvas(col, script, seed) {
  const cw = 160, ch = 220, c = mkCanvas(cw, ch), g = c.getContext("2d"), rnd = rng(seed * 7 + 3);
  const bg = g.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, shade(col, 0.22)); bg.addColorStop(1, shade(col, -0.18));
  g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
  g.save(); g.globalAlpha = 0.16; g.fillStyle = "#ffffff";
  for (let x = -ch; x < cw; x += 30) { g.beginPath(); g.moveTo(x, ch); g.lineTo(x + ch, 0); g.lineTo(x + ch + 11, 0); g.lineTo(x + 11, ch); g.closePath(); g.fill(); }
  g.restore();
  g.fillStyle = "#0d1f5c"; g.fillRect(0, 0, cw, 30);
  g.fillStyle = "#ffffff"; g.font = "bold 15px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(["GAME", "PLAYER", "DELUXE", "TURBO", "SUPER"][Math.floor(rnd() * 5)], cw / 2, 16);
  rrectPath(g, 12, 128, cw - 24, 66, 12); g.fillStyle = "#0d1f5c"; g.fill();
  drawScript(g, script, cw / 2, 161, cw - 40, 56);
  g.lineWidth = 6; g.strokeStyle = shade(col, -0.4); g.strokeRect(3, 3, cw - 6, ch - 6);
  return c;
}
// A cartridge seen from the front: grey shell, grip ridges, a label with the wordmark. gold = the rare one.
function cartCanvas(script, gold) {
  const c = mkCanvas(256, 224), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 224);
  bg.addColorStop(0, gold ? "#fff0a0" : "#c2c5d0"); bg.addColorStop(1, gold ? "#d99a1a" : "#8f93a2");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 224);
  for (let y = 12; y < 48; y += 9) { g.fillStyle = gold ? "#a8701a" : "#6c7080"; g.fillRect(18, y, 220, 4); g.fillStyle = "rgba(255,255,255,.6)"; g.fillRect(18, y + 4, 220, 1.5); }
  rrectPath(g, 22, 58, 212, 148, 12); g.fillStyle = "#16171d"; g.fill();
  rrectPath(g, 28, 64, 200, 136, 9);
  const lb = g.createLinearGradient(0, 64, 0, 200);
  lb.addColorStop(0, gold ? "#ff5cc0" : "#ffe45c"); lb.addColorStop(1, gold ? "#7a2cff" : "#ff9214");
  g.fillStyle = lb; g.fill();
  drawScript(g, script, 128, 132, 184, 110);
  return c;
}
// A CRT on the shelf showing a blue menu screen with the wordmark.
function tvCanvas(script, hue) {
  const c = mkCanvas(256, 192), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 192);
  bg.addColorStop(0, hue); bg.addColorStop(1, "#08154a");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 192);
  drawScript(g, script, 128, 84, 210, 110);
  g.fillStyle = "#ffffff"; g.font = "bold 16px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("PRESS START", 128, 160);
  for (let y = 0; y < 192; y += 3) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, y, 256, 1); }
  return c;
}
// The lightbox over the counter: the wordmark, and what the shop does.
function signCanvas(script) {
  const c = mkCanvas(1024, 384), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 384);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 384);
  const gl = g.createLinearGradient(0, 0, 0, 170);
  gl.addColorStop(0, "rgba(255,255,255,.42)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.beginPath(); g.ellipse(512, -20, 620, 190, 0, 0, TAU); g.fill();
  g.lineWidth = 16; g.strokeStyle = "#ff9214"; g.strokeRect(8, 8, 1008, 368);
  g.lineWidth = 4; g.strokeStyle = "#ffe45c"; g.strokeRect(19, 19, 986, 346);
  drawScript(g, script, 512, 158, 820, 236);
  candyText(g, "BUY  *  SELL  *  TRADE", 512, 318, 52, 820);
  return c;
}
// The neon sign in the corner: OPEN in blue and red, or CLOSED in red.
function neonCanvas(closed) {
  const c = mkCanvas(512, 200), g = c.getContext("2d");
  g.fillStyle = "#06070c"; rrectPath(g, 4, 4, 504, 192, 26); g.fill();
  g.lineWidth = 3; g.strokeStyle = "#2a2e3c"; g.stroke();
  g.font = '900 108px "Arial Black", Arial, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
  const word = closed ? "CLOSED" : "OPEN", col = closed ? "#ff2b3d" : "#ff3b6b";
  if (closed) g.font = '900 88px "Arial Black", Arial, sans-serif';
  g.shadowColor = col; g.shadowBlur = 28; g.lineWidth = 8; g.strokeStyle = col; g.strokeText(word, 256, 104);
  g.shadowBlur = 12; g.lineWidth = 3; g.strokeStyle = "#ffe0e8"; g.strokeText(word, 256, 104);
  g.shadowBlur = 0;
  if (!closed) { g.shadowColor = "#2fe6ff"; g.shadowBlur = 20; g.lineWidth = 6; g.strokeStyle = "#2fe6ff"; rrectPath(g, 26, 22, 460, 160, 22); g.stroke(); g.shadowBlur = 0; }
  return c;
}
// The wall clock: a white face with a red wedge where closing time is.
function clockCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  g.fillStyle = "#1d2029"; g.beginPath(); g.arc(128, 128, 127, 0, TAU); g.fill();
  g.fillStyle = "#f6f1e2"; g.beginPath(); g.arc(128, 128, 112, 0, TAU); g.fill();
  g.fillStyle = "#ff4b3e"; g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 104, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.01); g.closePath(); g.fill();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU - Math.PI / 2;
    g.fillStyle = "#1d2029"; g.fillRect(128 + Math.cos(a) * 92 - 3, 128 + Math.sin(a) * 92 - 3, 6, 6);
  }
  g.fillStyle = "#1d2029"; g.font = "bold 22px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("CLOSED", 128, 60);
  return c;
}
function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(0,12,4,.8)"); gr.addColorStop(0.55, "rgba(0,12,4,.4)"); gr.addColorStop(1, "rgba(0,12,4,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function glowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,248,220,.95)"); gr.addColorStop(0.3, "rgba(255,240,190,.35)"); gr.addColorStop(1, "rgba(255,240,190,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
// A shirt, wrapped once around the shopkeeper: u = 0 is the chest, u = .5 the back. The wordmark is stitched on the chest.
function shirtCanvas(script) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  g.fillStyle = "#1b56cf"; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#f2e6c8"; g.fillRect(150, 0, 212, 256);              // a bowling-shirt panel across the back
  g.fillStyle = "#ff9214"; g.fillRect(146, 0, 6, 256); g.fillRect(360, 0, 6, 256);
  const sh = g.createLinearGradient(0, 0, 0, 256);
  sh.addColorStop(0, "rgba(255,255,255,.1)"); sh.addColorStop(1, "rgba(0,0,40,.18)");
  g.fillStyle = sh; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#f6f3ea"; for (let y = 70; y < 250; y += 36) { g.beginPath(); g.arc(4, y, 4, 0, TAU); g.fill(); g.beginPath(); g.arc(508, y, 4, 0, TAU); g.fill(); }
  drawScript(g, script, 64, 96, 70, 40);                            // over the heart
  drawScript(g, script, 256, 110, 180, 90);                         // and big across the back
  return c;
}
// A tiny painted room for the glossy highlights on the balls, the rails and the gold.
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#fff7dc"); gr.addColorStop(0.18, "#d9c08a"); gr.addColorStop(0.32, "#6b4a2a");
    gr.addColorStop(0.5, "#2a1c14"); gr.addColorStop(0.52, "#15602f"); gr.addColorStop(1, "#1e8a45");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#3a3024"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(10, 26, 44, 12);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#1e8a45"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* ---------------- LED ribbon board: the full-width strip on the back wall, over the shelves ----------------
   The board is a real dot matrix. Everything on it is painted into a small canvas, one pixel per LED, and a small
   shader turns each pixel into a glowing dot. It scrolls its programme right to left, and cuts to big animated
   messages when the game calls for one (ledPlay below). */
const LED_W = 1100, LED_H = 46;                            // table units: the lit face
const LED_ROWS = 26, LED_COLS = Math.round(LED_W / (LED_H / LED_ROWS));
const LED_SPEED = 44;                                      // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));   // the largest text size that fits (5 x 7 font, in LEDs per font pixel)
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
// Short messages between the plugs. The wordmark leads each group.
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["WE BUY CARTS", "pink"], ["NO QUARTERS REQUIRED", "cyan"]];
// Plugs for the rest of the arcade: [game, one-line tag]. Edit freely, the board lays itself out.
const LED_PLUGS = [
  ["TAPE PIN LANES", "3D BOWLING"],
  ["SHELF LINKS", "MINI GOLF"],
  ["BARGAIN BIN BUCKETS", "HOOPS"],
  ["BLEACHER CARTS", "HOME RUN DERBY"],
  ["TICKET ROLL ALLEY", "ROLL FOR TICKETS"],
  ["RINK RAT SHOOTOUT", "HOCKEY SHOOTOUT"],
  ["FOURTH AND COLLECT", "SPLIT THE UPRIGHTS"],
  ["POWDER DAY HAUL", "HIT THE SLOPES"],
  ["TABLE RINK RUMBLE", "AIR HOCKEY"],
  ["FLEA FORTRESS FLYBY", "PLAY IT FREE"],
  ["CREATURE FEATURE KO", "VHS BOSS RUSH"]
];
let LED = null, LED_SAFE = LED_COLS - 16;                  // LED_SAFE: the widest message that stays in the play camera's view

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
    "*": "00000 00100 01110 11111 01110 00100 00000", "$": "00100 01111 10100 01110 00101 11110 00100"
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
      const rw = rows[r];
      for (let c = 0; c < 5; c++) if (rw.charCodeAt(c) === 49) g.fillRect(x + c * sx, y + r * sy, sx, sy);
    }
    x += 6 * sx;
  }
  return x;
}

// The whole scrolling programme, painted once into one long strip (LED_ROWS tall).
function ledStrip(script) {
  const HH = LED_ROWS, big = LED_BIG, yBig = Math.floor((HH - 7 * big) / 2), GAP = 13, items = [];
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
    const ns = Math.max(1, big - 1), ts = 1, pad = 7, tab = ledTextW("FREE", ts) + 4;
    const top = Math.max(1, Math.floor((HH - (7 * ts + 3 + 7 * ns)) / 2));
    const w = pad + Math.max(ledTextW(name, ns), tab + 4 + ledTextW(tag, ts));
    items.push({ w: w, draw: function (g, x) {
      g.fillStyle = color; g.fillRect(x, 1, 3, HH - 2);
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
    ledText(g, "*", x, Math.floor((HH - 7) / 2), 1, 1, LED_C.blue);       // a small separator between items
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

// kind: "flash" (strobe and chevrons), "slide", "cycle", "blink" or "count" (a label, a number that counts up, in fmt)
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
function ledFinal(score) {
  if (!LED) return;
  ledPlay([ledMsg("count", "FINAL", 8, { value: score, fmt: fmt, final: true, wait: 0.3 })], true);
}

function ledDrawMsg(g, m) {
  const WW = LED_COLS, HH = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(WW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.amber;
  function fit(str) { let sx = big + 1; if (ledTextW(str, sx) > LED_SAFE - 40) sx = big; while (sx > 1 && ledTextW(str, sx) > LED_SAFE) sx--; return sx; }
  function chase(color, dir) {                              // running lights along the top and bottom edges
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < WW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(WW - x - 3, HH - 1, 3, 1); }
  }
  if (m.kind === "count") {                                 // a label and a number that counts up to its value
    const k = calm ? 1 : Math.min(1, t / 0.7), v = Math.round((m.from || 0) + (m.value - (m.from || 0)) * k);
    const label = m.text ? m.text + " " : "", shown = m.fmt ? m.fmt(v) : String(v), full = m.fmt ? m.fmt(m.value) : String(m.value);
    const sc = fit(label + full), x = Math.round((WW - ledTextW(label + full, sc)) / 2);
    const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
    const xn = ledText(g, label, x, yBig, sc, big, LED_C.amber);
    ledText(g, shown, xn, yBig, sc, big, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
    if (!calm && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(WW * m.t / 0.3), 0, WW, HH); }   // wipe in
    chase(LED_C.amber, 1);
    return;
  }
  const sx = fit(m.text), w = ledTextW(m.text, sx), x0 = Math.round((WW - w) / 2), sy = Math.min(sx, big);
  const yT = Math.floor((HH - 7 * sy) / 2);
  if (m.kind === "flash") {
    if (!calm && t < 0.6 && Math.floor(t * 12) % 2 === 0) {                        // strobe: the whole board flips
      g.fillStyle = LED_C.yellow; g.fillRect(0, 0, WW, HH);
      ledText(g, m.text, x0, yT, sx, sy, "#000000");
      return;
    }
    const span = 6 * big + 5, ph = calm ? 0 : Math.floor((t * 46) % span);
    for (let k = 0; k < 16; k++) {                          // chevrons racing outward on both sides
      const off = Math.round(w / 2) + 9 + k * span + ph;
      if (off > mid + span) break;
      const cc = k % 2 ? LED_C.red : LED_C.orange;
      ledText(g, ">", mid + off, yBig, big, big, cc);
      ledText(g, "<", mid - off - 5 * big, yBig, big, big, cc);
    }
    const cyc = [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0, yT, sx, sy, calm ? LED_C.yellow : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 18; i++) g.fillRect((vrand() * WW) | 0, (vrand() * HH) | 0, 1, 1); }
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "slide") {                                 // slides in from the right, then a white glint sweeps across it
    const k = calm ? 1 : Math.min(1, t / 0.45), e = 1 - Math.pow(1 - k, 3);
    const x = Math.round(x0 + (1 - e) * WW);
    ledText(g, m.text, x, yT, sx, sy, col);
    if (!calm && k >= 1) {
      const bx = Math.floor(((t - 0.45) * 150) % (WW + 80)) - 40;
      g.save(); g.beginPath(); g.rect(bx, 0, 12, HH); g.clip();
      ledText(g, m.text, x, yT, sx, sy, "#ffffff");
      g.restore();
    }
    chase(col, -1);
    return;
  }
  if (m.kind === "cycle") {                                 // every letter takes its turn through the colors
    const cyc = [LED_C.yellow, LED_C.pink, LED_C.cyan, LED_C.lime, LED_C.orange];
    let x = x0;
    for (let i = 0; i < m.text.length; i++) x = ledText(g, m.text[i], x, yT, sx, sy, cyc[(i + (calm ? 0 : Math.floor(t * 9))) % cyc.length]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 12; i++) g.fillRect((vrand() * WW) | 0, (vrand() * HH) | 0, 1, 1); }
    chase(LED_C.yellow, 1);
    return;
  }
  // blink: a few flashes, then it holds over a solid bar
  if (calm || t > 1.1 || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, yT, sx, sy, col);
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

// Advance the board. It only repaints (and re-uploads its small texture) when an LED actually changes.
function ledTick(dt) {
  const L = LED;
  if (!L) return;
  let redraw = false;
  if (L.msg) {
    L.msg.t += dt;
    if (L.msg.t >= L.msg.dur) { L.msg = L.queue.shift() || null; L.frame = -1; redraw = true; }
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

// A box with every edge and corner rounded. Each face keeps its own material slot (+x -x +y -y +z -z)
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

// Outlines in table coordinates (x, y), walked clockwise on screen.
function V2(T, x, y) { return new T.Vector2(x, y); }
// The arc of a circle from point a to point b, going round the side that faces direction "via" (an angle).
function arcPts(T, cx, cy, r, ax, ay, bx, by, via, n) {
  const a1 = Math.atan2(ay - cy, ax - cx);
  let a2 = Math.atan2(by - cy, bx - cx), sweep = a2 - a1;
  while (sweep <= 0) sweep += TAU;
  const mid = a1 + sweep / 2, other = mid + Math.PI;
  const dv = function (a) { let d = Math.abs(((a - via) % TAU + TAU) % TAU); return Math.min(d, TAU - d); };
  if (dv(other) < dv(mid)) sweep -= TAU;                    // the short way round faces the wrong side
  const out = [];
  for (let i = 1; i < n; i++) { const a = a1 + sweep * i / n; out.push(V2(T, cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
  return out;
}
// The rectangle (L, Tp, Rt, B) with every pocket circle taken out of it (inward) or added onto it (outward).
// Each circle must cover its corner of the rectangle (corner pockets) or cross its side (side pockets).
function pocketOutline(T, L, Tp, Rt, B, grow, outward) {
  const pts = [], cx0 = (X0 + X1) / 2, cy0 = (Y0 + Y1) / 2;
  function rr(p) { return p.r + grow; }
  function via(p) { const a = Math.atan2(p.y - cy0, p.x - cx0); return outward ? a : a + Math.PI; }
  function onH(p, ey, sx) { const r = rr(p); return V2(T, p.x + sx * Math.sqrt(Math.max(0, r * r - (ey - p.y) * (ey - p.y))), ey); }
  function onV(p, ex, sy) { const r = rr(p); return V2(T, ex, p.y + sy * Math.sqrt(Math.max(0, r * r - (ex - p.x) * (ex - p.x)))); }
  function sideVia(p, dir) { return outward ? dir : dir + Math.PI; }
  function arc(p, a, b, v) { pts.push(a); arcPts(T, p.x, p.y, rr(p), a.x, a.y, b.x, b.y, v, 14).forEach(function (q) { pts.push(q); }); pts.push(b); }
  const P = POCKETS;
  arc(P[0], onV(P[0], L, 1), onH(P[0], Tp, 1), via(P[0]));          // top left
  arc(P[1], onH(P[1], Tp, -1), onV(P[1], Rt, 1), via(P[1]));        // top right
  arc(P[3], onV(P[3], Rt, -1), onV(P[3], Rt, 1), sideVia(P[3], 0)); // right side
  arc(P[5], onV(P[5], Rt, -1), onH(P[5], B, -1), via(P[5]));        // bottom right
  arc(P[4], onH(P[4], B, 1), onV(P[4], L, -1), via(P[4]));          // bottom left
  arc(P[2], onV(P[2], L, 1), onV(P[2], L, -1), sideVia(P[2], Math.PI)); // left side
  return pts;
}
// A flat piece at height y, outlined in table coordinates, facing up. Texture tiles at k per unit.
function flatGeo(T, pts, holes, y, k) {
  holes = holes || [];
  const all2 = pts.slice();
  holes.forEach(function (hl) { for (let i = 0; i < hl.length; i++) all2.push(hl[i]); });
  const tris = T.ShapeUtils.triangulateShape(pts, holes);
  const pos = [], nor = [], uv = [], idx = [];
  all2.forEach(function (p) { pos.push(p.x - CX, y, p.y - CZ); nor.push(0, 1, 0); uv.push(p.x * k, -p.y * k); });
  tris.forEach(function (t) {
    const a = all2[t[0]], b = all2[t[1]], c = all2[t[2]];
    const up = (b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y);
    if (up >= 0) idx.push(t[0], t[1], t[2]); else idx.push(t[0], t[2], t[1]);
  });
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// A solid with rounded top edges, outlined in table coordinates, from height y0 up to y1.
function slab(T, pts, holes, y0, y1, bev) {
  const sh = new T.Shape(pts.map(function (p) { return V2(T, p.x - CX, -(p.y - CZ)); }));
  (holes || []).forEach(function (hl) { sh.holes.push(new T.Path(hl.map(function (p) { return V2(T, p.x - CX, -(p.y - CZ)); }))); });
  const g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.1, y1 - y0 - 2 * bev), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 3, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bev, 0);
  return g;
}

/* ---------------- The shopkeeper: a jointed figure posed from a short list of numbers ----------------
   A pose is: hips x y z, hips turn, shoulders turn, lean, left hand x y z, right hand x y z,
   left foot x y z, right foot x y z, head turn (all in his own space, in feet and degrees; he faces +z).
   Elbows and knees are solved from where the hands and feet are. Built to a real 5 foot 11 frame. */
const POSE = {
  lean:   [0, 3.0, 0, 0, 0, 7, 0.62, 3.18, 1.08, -0.62, 3.18, 1.08, 0.36, 0.2, 0.02, -0.36, 0.2, -0.04, 0],
  cross:  [0, 3.04, 0, 0, 0, 1, -0.36, 4.02, 0.62, 0.36, 3.94, 0.58, 0.36, 0.2, 0, -0.36, 0.2, 0, 0],
  watch:  [0, 3.02, 0, 0, -12, 4, 0.08, 4.4, 0.86, -0.62, 3.18, 1.08, 0.36, 0.2, 0.02, -0.36, 0.2, -0.04, 12],
  clapA:  [0, 3.04, 0, 0, 0, 2, 0.07, 4.3, 0.98, -0.07, 4.3, 0.98, 0.36, 0.2, 0, -0.36, 0.2, 0, 0],
  clapB:  [0, 3.04, 0, 0, 0, 2, 0.5, 4.34, 0.92, -0.5, 4.34, 0.92, 0.36, 0.2, 0, -0.36, 0.2, 0, 0],
  point:  [0, 3.04, 0, -18, -30, -2, 0.55, 2.7, 0.3, -1.65, 5.35, 0.95, 0.36, 0.2, 0, -0.36, 0.2, 0, -45]
};

function makePerson(T, G, o) {
  const root = new T.Group();
  root.scale.setScalar(FT);
  const skin = new T.MeshLambertMaterial({ color: o.skin });
  const shirt = new T.MeshPhongMaterial({ map: o.shirt, specular: 0x222222, shininess: 14 });
  const sleeve = new T.MeshLambertMaterial({ color: o.sleeve });
  const pants = new T.MeshLambertMaterial({ color: o.pants });
  const shoeM = new T.MeshPhongMaterial({ color: 0x1a120c, specular: 0x555555, shininess: 40 });
  const hairM = new T.MeshLambertMaterial({ color: o.hair });
  const darkM = new T.MeshBasicMaterial({ color: 0x15100c });
  function ball(mat, sx, sy, sz, parent) { const m = new T.Mesh(G.sphere, mat); m.scale.set(sx, sy || sx, sz || sx); (parent || root).add(m); return m; }

  const hips = ball(pants, 0.55, 0.38, 0.4);
  const upper = new T.Group(); root.add(upper);
  const torso = new T.Mesh(G.torso, shirt); torso.scale.z = 0.66; upper.add(torso);
  const belt = new T.Mesh(G.belt, new T.MeshPhongMaterial({ color: 0x2a1a10, specular: 0x444444, shininess: 30 }));
  belt.scale.set(0.53, 0.14, 0.37); belt.position.y = 0.03; upper.add(belt);
  const buckle = new T.Mesh(G.box, new T.MeshPhongMaterial({ color: 0xffcf5a, specular: 0xffffff, shininess: 90 }));
  buckle.scale.set(0.16, 0.11, 0.03); buckle.position.set(0, 0.03, 0.37); upper.add(buckle);
  const neck = new T.Mesh(G.cyl, skin); neck.scale.set(0.17, 0.32, 0.17); neck.position.y = 1.98; upper.add(neck);
  const collar = new T.Mesh(G.cyl, sleeve); collar.scale.set(0.24, 0.1, 0.22); collar.position.y = 1.97; upper.add(collar);
  const head = new T.Group(); head.position.y = 2.5; upper.add(head);
  ball(skin, 0.33, 0.42, 0.37, head);                                   // about nine inches chin to crown
  const jaw = ball(skin, 0.28, 0.2, 0.3, head); jaw.position.set(0, -0.22, 0.05);
  const hair = new T.Mesh(G.dome, hairM); hair.scale.set(0.355, 0.4, 0.4); hair.position.set(0, 0.06, -0.03); head.add(hair);
  [-1, 1].forEach(function (s) {
    const ear = ball(skin, 0.05, 0.1, 0.07, head); ear.position.set(s * 0.33, -0.02, -0.02);
    const eye = ball(darkM, 0.04, 0.035, 0.03, head); eye.position.set(s * 0.12, 0.05, 0.34);
    const brow = ball(hairM, 0.08, 0.02, 0.03, head); brow.position.set(s * 0.12, 0.12, 0.345);
  });
  const nose = ball(skin, 0.055, 0.075, 0.07, head); nose.position.set(0, -0.03, 0.38);
  const stache = ball(hairM, 0.15, 0.04, 0.05, head); stache.position.set(0, -0.15, 0.34);

  function limb(m1, m2, r1, r2, endMat, endR) {
    const L = { up: new T.Mesh(G.cyl, m1), lo: new T.Mesh(G.cyl, m2), j0: ball(m1, r1 * 1.06), j1: ball(m2, r2 * 1.08), end: ball(endMat, endR), r1: r1, r2: r2 };
    root.add(L.up); root.add(L.lo);
    return L;
  }
  const arm = [limb(sleeve, skin, 0.17, 0.13, skin, 0.15), limb(sleeve, skin, 0.17, 0.13, skin, 0.15)];
  const leg = [limb(pants, pants, 0.27, 0.2, pants, 0.17), limb(pants, pants, 0.27, 0.2, pants, 0.17)];
  const shoe = [ball(shoeM, 0.21, 0.16, 0.46), ball(shoeM, 0.21, 0.16, 0.46)];
  const watch = ball(new T.MeshPhongMaterial({ color: 0xffcf5a, specular: 0xffffff, shininess: 90 }), 0.09, 0.05, 0.09);
  return { root: root, hips: hips, upper: upper, head: head, arm: arm, leg: leg, shoe: shoe, watch: watch };
}

// Elbow or knee: the joint between A and B for bones l1 and l2, bent toward "pole".
function bend(A, B, pole, l1, l2, out) {
  const t = TV;
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
  const t = TV;
  t.d.subVectors(B, A);
  const l = t.d.length() || 1e-4;
  mesh.position.copy(A);
  mesh.quaternion.setFromUnitVectors(t.up, t.d.multiplyScalar(1 / l));
  mesh.scale.set(r, l, r);
}
function setLimb(L, A, B, pole, l1, l2) {
  const t = TV;
  bend(A, B, pole, l1, l2, t.e);
  bone(L.up, A, t.e, L.r1); bone(L.lo, t.e, B, L.r2);
  L.j0.position.copy(A); L.j1.position.copy(t.e); L.end.position.copy(B);
}
function applyPose(P, v) {
  const t = TV, hy = v[3] * DEG, uy = v[4] * DEG, ch = Math.cos(hy), sh = Math.sin(hy), cu = Math.cos(uy), su = Math.sin(uy);
  P.hips.position.set(v[0], v[1], v[2]); P.hips.rotation.y = hy;
  P.upper.position.set(v[0], v[1], v[2]); P.upper.rotation.set(v[5] * DEG, uy, 0, "YXZ");
  P.upper.updateMatrix();
  P.head.rotation.y = (v[18] - v[4]) * DEG;
  for (let s = 0; s < 2; s++) {                             // 0 = left, 1 = right
    const sg = s ? -1 : 1, px = sg * 0.5, pz = -0.5;
    t.a.set(sg * 0.66, 1.8, 0).applyMatrix4(P.upper.matrix);
    t.b.set(v[6 + s * 3], v[7 + s * 3], v[8 + s * 3]);
    t.p.set(px * cu + pz * su, -0.8, -px * su + pz * cu);   // elbows hang down, out and a little back
    setLimb(P.arm[s], t.a, t.b, t.p, 1.08, 1.04);
    if (s === 0) { P.watch.position.copy(t.b).addScaledVector(TV.d.subVectors(t.e, t.b).normalize(), 0.2); }
    t.a.set(v[0] + sg * 0.36 * ch, v[1] - 0.08, v[2] - sg * 0.36 * sh);
    t.b.set(v[12 + s * 3], v[13 + s * 3] + 0.14, v[14 + s * 3]);
    t.p.set(sh + sg * 0.2 * ch, 0.2, ch - sg * 0.2 * sh);   // knees point where the hips face
    setLimb(P.leg[s], t.a, t.b, t.p, 1.47, 1.45);
    P.shoe[s].position.set(t.b.x + sh * 0.24, v[13 + s * 3], t.b.z + ch * 0.24);
    P.shoe[s].rotation.y = hy * 0.6;
  }
}

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x120c08, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = (parseInt(T.REVISION, 10) || 0) >= 182 ? T.PCFShadowMap : T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(CAM_FOV, W / H, 20, 6000);
  const caps = renderer.capabilities;
  const aniso = Math.min(4, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  TV = { a: new T.Vector3(), b: new T.Vector3(), d: new T.Vector3(), e: new T.Vector3(), p: new T.Vector3(), q: new T.Vector3(), up: new T.Vector3(0, 1, 0) };

  function tex(canvas, repeat, k) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; if (k) t.repeat.set(k, k); }
    t.anisotropy = aniso;
    return t;
  }
  function lit(mesh, cast, recv) { mesh.castShadow = !!cast; mesh.receiveShadow = !!recv; return mesh; }
  function decal(mat, order) { mat.transparent = true; mat.depthWrite = false; mat._order = order; return mat; }
  function add(mesh, parent) { if (mesh.material && mesh.material._order) mesh.renderOrder = mesh.material._order; (parent || scene).add(mesh); return mesh; }
  // A flat rectangle at height y over table coordinates. Texture "up" points toward the far end.
  function ground(x1, y1, x2, y2, y, mat) {
    const g = new T.PlaneGeometry(x2 - x1, y2 - y1);
    g.rotateX(-Math.PI / 2);
    const m = new T.Mesh(g, mat);
    m.position.set((x1 + x2) / 2 - CX, y, (y1 + y2) / 2 - CZ);
    return add(m);
  }

  const script = scriptCanvas(scriptImg);
  const cScript = mkCanvas(1024, 512);                       // the wordmark as a decal: a clear rim so its edges never smear
  drawScript(cScript.getContext("2d"), script, 512, 256, 1004, 492);
  const tScript = tex(cScript);
  const tCloth = tex(clothCanvas(), true), tPool = tex(poolCanvas()), tFeltMark = tex(feltMarkCanvas(script));
  const tRail = tex(woodCanvas("#5e1a0e"), true), tFloor = tex(floorCanvas(), true), tPeg = tex(pegCanvas(), true), tPanel = tex(panelCanvas(), true);
  const tCeil = tex(ceilCanvas(), true), tShadow = tex(shadowCanvas()), tGlow = tex(glowCanvas()), tApron = tex(apronCanvas(script));
  const tCue = tex(cueCanvas(script)), tNeonOpen = tex(neonCanvas(false)), tNeonClosed = tex(neonCanvas(true)), tClock = tex(clockCanvas());
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;

  /* lights: the lamp over the table does the work, the room sits in its warm spill */
  const hemi = new T.HemisphereLight(0xfff1d6, 0x6a5444, 1.25);
  scene.add(hemi);
  const key = new T.DirectionalLight(0xfff4dc, 2.6);        // straight down from the lamp, a touch from the left: short, crisp ball shadows
  key.position.set(-70, 700, 60); key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -360; sc.right = 360; sc.top = 420; sc.bottom = -420; sc.near = 200; sc.far = 1200;
  sc.updateProjectionMatrix();
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.5; key.shadow.radius = 2.2;
  scene.add(key); scene.add(key.target);
  const fill = new T.DirectionalLight(0xd8e4ff, 0.55);      // from behind the camera, so the faces toward you never go flat
  fill.position.set(80, 300, 700); scene.add(fill);

  /* the room */
  const roomW = ROOM.x1 - ROOM.x0, roomD = ROOM.z1 - ROOM.z0, wallH = CEIL_Y - FLOOR_Y;
  const floorGeo = new T.PlaneGeometry(roomW, roomD).rotateX(-Math.PI / 2);
  (function () { const p = floorGeo.attributes.position, uv = floorGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / (2 * FT), -p.getZ(i) / (2 * FT)); })();
  const floor = lit(new T.Mesh(floorGeo, new T.MeshLambertMaterial({ map: tFloor })), false, true);
  floor.position.set((ROOM.x0 + ROOM.x1) / 2, FLOOR_Y, (ROOM.z0 + ROOM.z1) / 2); scene.add(floor);
  const ceilGeo = new T.PlaneGeometry(roomW, roomD).rotateX(Math.PI / 2);
  (function () { const p = ceilGeo.attributes.position, uv = ceilGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / (2 * FT), p.getZ(i) / (2 * FT)); })();
  const ceil = new T.Mesh(ceilGeo, new T.MeshLambertMaterial({ map: tCeil, color: 0x9a8f7a }));
  ceil.position.set((ROOM.x0 + ROOM.x1) / 2, CEIL_Y, (ROOM.z0 + ROOM.z1) / 2); scene.add(ceil);
  // walls: dark paneling to waist height, pegboard above (the back wall), paneling all the way up elsewhere
  function wall(len, x, z, ry, upperMat) {
    const g = new T.Group(); g.position.set(x, FLOOR_Y, z); g.rotation.y = ry;
    const lowH = 3.4 * FT;
    const low = new T.PlaneGeometry(len, lowH); low.translate(0, lowH / 2, 0);
    (function () { const uv = low.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 200, uv.getY(i) * lowH / 200); })();
    g.add(lit(new T.Mesh(low, new T.MeshLambertMaterial({ map: tPanel })), false, true));
    const hi = new T.PlaneGeometry(len, wallH - lowH); hi.translate(0, lowH + (wallH - lowH) / 2, 0);
    (function () { const uv = hi.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 128, uv.getY(i) * (wallH - lowH) / 128); })();
    g.add(lit(new T.Mesh(hi, upperMat), false, true));
    const rail = new T.Mesh(new T.BoxGeometry(len, 9, 5), new T.MeshLambertMaterial({ color: 0x3a1e0c })); rail.position.set(0, lowH, 2.5); g.add(rail);
    scene.add(g);
    return g;
  }
  const pegMat = new T.MeshLambertMaterial({ map: tPeg }), panelHi = new T.MeshLambertMaterial({ map: tPanel, color: 0xc8b8a8 });
  wall(roomW, (ROOM.x0 + ROOM.x1) / 2, ROOM.z0, 0, pegMat);
  wall(roomD, ROOM.x0, (ROOM.z0 + ROOM.z1) / 2, Math.PI / 2, panelHi);
  wall(roomD, ROOM.x1, (ROOM.z0 + ROOM.z1) / 2, -Math.PI / 2, pegMat);
  wall(roomW, (ROOM.x0 + ROOM.x1) / 2, ROOM.z1, Math.PI, panelHi);

  /* the table */
  const clothMat = new T.MeshLambertMaterial({ map: tCloth });
  tCloth.repeat.set(1, 1);
  const cushMat = new T.MeshLambertMaterial({ map: tCloth, color: 0xd8e8dc });
  const railMat = new T.MeshPhongMaterial({ map: tRail, color: 0xd6b8a8, specular: 0x6a4c3c, shininess: 70, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.04 });
  tRail.repeat.set(1 / 60, 1 / 60);
  const blackMat = new T.MeshBasicMaterial({ color: 0x050403 });
  // the bed: one slab of cloth, with a hole cut for every pocket
  const clothPts = pocketOutline(T, X0 - 10, Y0 - 10, X1 + 10, Y1 + 10, 2, false);
  scene.add(lit(new T.Mesh(flatGeo(T, clothPts, [], 0, 1 / 64), clothMat), false, true));
  const deckPts = [V2(T, OUT.x0 + 4, OUT.y0 + 4), V2(T, OUT.x1 - 4, OUT.y0 + 4), V2(T, OUT.x1 - 4, OUT.y1 - 4), V2(T, OUT.x0 + 4, OUT.y1 - 4)];
  const holeCircles = POCKETS.map(function (p) { const c = []; for (let i = 0; i < 24; i++) { const a = -i / 24 * TAU; c.push(V2(T, p.x + Math.cos(a) * (p.r + 4), p.y + Math.sin(a) * (p.r + 4))); } return c; });
  scene.add(new T.Mesh(flatGeo(T, deckPts, holeCircles, -0.9, 1), blackMat));
  // lamp light pooled on the cloth, the head string, the foot spot and the wordmark printed on the felt
  const pool = ground(X0 - 10, Y0 - 10, X1 + 10, Y1 + 10, 0.05, decal(new T.MeshBasicMaterial({ map: tPool, blending: T.AdditiveBlending }), 1));
  pool.scale.set(1.1, 1, 1);
  ground(X0, HEAD.y - 0.6, X1, HEAD.y + 0.6, 0.08, decal(new T.MeshBasicMaterial({ color: 0xeceae2, opacity: 0.22 }), 2));
  const spot = add(new T.Mesh(new T.CircleGeometry(2.4, 16).rotateX(-Math.PI / 2), decal(new T.MeshBasicMaterial({ color: 0xeceae2, opacity: 0.5 }), 2)));
  spot.position.set(FOOT.x - CX, 0.09, FOOT.y + 2 * R * 1.75 - CZ);
  const fmW = 150, fmH = fmW * 512 / 1024;
  lit(ground(180 - fmW / 2, 338 - fmH / 2, 180 + fmW / 2, 338 + fmH / 2, 0.07, decal(new T.MeshLambertMaterial({ map: tFeltMark, opacity: 0.75 }), 2)), false, true);

  // cushions: cloth-covered rubber with the jaws cut back into each pocket
  const cushions = [
    [V2(T, X0 + 29, Y0), V2(T, X1 - 29, Y0), V2(T, X1 - 17, Y0 - CUSH), V2(T, X0 + 17, Y0 - CUSH)],
    [V2(T, X1 - 29, Y1), V2(T, X0 + 29, Y1), V2(T, X0 + 17, Y1 + CUSH), V2(T, X1 - 17, Y1 + CUSH)],
    [V2(T, X0, Y1 - 29), V2(T, X0, CZ + 26), V2(T, X0 - CUSH, CZ + 15), V2(T, X0 - CUSH, Y1 - 17)],
    [V2(T, X0, CZ - 26), V2(T, X0, Y0 + 29), V2(T, X0 - CUSH, Y0 + 17), V2(T, X0 - CUSH, CZ - 15)],
    [V2(T, X1, Y0 + 29), V2(T, X1, CZ - 26), V2(T, X1 + CUSH, CZ - 15), V2(T, X1 + CUSH, Y0 + 17)],
    [V2(T, X1, CZ + 26), V2(T, X1, Y1 - 29), V2(T, X1 + CUSH, Y1 - 17), V2(T, X1 + CUSH, CZ + 15)]
  ];
  cushions.forEach(function (c) { scene.add(lit(new T.Mesh(slab(T, c, null, -0.5, CUSH_H, 2.6), cushMat), true, true)); });
  // the wood rail, one piece, with every pocket cut out of it
  const railOuter = [V2(T, OUT.x0, OUT.y0), V2(T, OUT.x0, OUT.y1), V2(T, OUT.x1, OUT.y1), V2(T, OUT.x1, OUT.y0)];
  const railHole = pocketOutline(T, X0 - CUSH, Y0 - CUSH, X1 + CUSH, Y1 + CUSH, 4, true);
  const railGeo = slab(T, railOuter, [railHole.slice().reverse()], -0.9, RAIL_H, 3.2);
  scene.add(lit(new T.Mesh(railGeo, railMat), true, true));
  // the sights: mother-of-pearl diamonds down the middle of the rail
  const pearl = new T.MeshPhongMaterial({ color: 0xfff6e6, specular: 0xffffff, shininess: 100, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.25 });
  const dia = new T.CircleGeometry(3.4, 4).rotateX(-Math.PI / 2);
  const mid = CUSH + RAIL_W / 2;
  function sight(x, y) { const m = new T.Mesh(dia, pearl); m.position.set(x - CX, RAIL_H + 0.15, y - CZ); m.scale.set(0.75, 1, 1.25); scene.add(m); }
  for (let i = 1; i < 4; i++) { sight(X0 + (X1 - X0) * i / 4, Y0 - mid); sight(X0 + (X1 - X0) * i / 4, Y1 + mid); }
  for (let i = 1; i < 8; i++) if (i !== 4) { sight(X0 - mid, Y0 + (Y1 - Y0) * i / 8); sight(X1 + mid, Y0 + (Y1 - Y0) * i / 8); }
  // pockets: leather cups under every hole, a fringe on the rail
  const cupMat = new T.MeshBasicMaterial({ color: 0x0a0705, side: T.BackSide });
  const leather = new T.MeshPhongMaterial({ color: 0x140c07, specular: 0x5a4030, shininess: 40 });
  const brass = new T.MeshPhongMaterial({ color: 0xb8862e, specular: 0xffe0a0, shininess: 70, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.1 });
  POCKETS.forEach(function (p, i) {
    const r = p.r + 4, out = Math.atan2(p.y - (Y0 + Y1) / 2, p.x - (X0 + X1) / 2), side = i === 2 || i === 3;
    const dirA = side ? (p.x < CX ? Math.PI : 0) : out;
    const cup = new T.Mesh(new T.CylinderGeometry(r, r * 0.8, 44, 22, 1, true), cupMat);
    cup.position.set(p.x - CX, -22.5, p.y - CZ); scene.add(cup);
    const bottom = new T.Mesh(new T.CircleGeometry(r * 0.8, 20).rotateX(-Math.PI / 2), blackMat);
    bottom.position.set(p.x - CX, -44, p.y - CZ); scene.add(bottom);
    const span = side ? 2.3 : 3.0;                            // the fringe covers the part of the circle that sits in the rail
    const fr = new T.RingGeometry(r - 0.5, r + 6, 24, 1, -(dirA + span / 2), span); fr.rotateX(-Math.PI / 2);
    const fringe = lit(new T.Mesh(fr, leather), false, true); fringe.position.set(p.x - CX, RAIL_H + 0.3, p.y - CZ); scene.add(fringe);
    const br = new T.RingGeometry(r + 5.4, r + 6.8, 24, 1, -(dirA + span / 2), span); br.rotateX(-Math.PI / 2);
    const rim = new T.Mesh(br, brass); rim.position.set(p.x - CX, RAIL_H + 0.4, p.y - CZ); scene.add(rim);
  });
  // the body: apron, wordmark plates at both ends, turned legs
  const apronW = OUT.x1 - OUT.x0 - 10, apronD = OUT.y1 - OUT.y0 - 10;
  const apronSide = new T.MeshPhongMaterial({ map: tex(woodCanvas("#6b1d12"), true), specular: 0x6a4a3a, shininess: 50, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.05 });
  const apronEnd = new T.MeshPhongMaterial({ map: tApron, specular: 0x6a4a3a, shininess: 50 });
  const noTop = new T.MeshBasicMaterial({ visible: false });                    // open on top, so the pockets read black all the way down
  const apron = lit(new T.Mesh(roundBox(T, apronW, APRON, apronD, 5), [apronSide, apronSide, noTop, apronSide, apronEnd, apronEnd]), true, true);
  apron.position.set(0, -APRON / 2 - 1, 0); scene.add(apron);
  const legGeo = new T.LatheGeometry([[0, 0], [20, 0], [22, 6], [16, 14], [13, 40], [17, 64], [11, 92], [13, 120], [18, 138], [18, 150], [0, 150]].map(function (p) { return V2(T, p[0], p[1]); }), 16);
  const legH = -APRON + 1 - FLOOR_Y;
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) {
    const m = lit(new T.Mesh(legGeo, apronSide), true, true); m.scale.y = legH / 150;
    m.position.set(s[0] * (apronW / 2 - 34), FLOOR_Y, s[1] * (apronD / 2 - 40)); scene.add(m);
  });
  const shadowMat = decal(new T.MeshBasicMaterial({ map: tShadow, opacity: 0.6 }), 4);
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
  const tableShadow = add(new T.Mesh(unit, shadowMat.clone())); tableShadow.material._order = 1; tableShadow.renderOrder = 1;
  tableShadow.scale.set(apronW * 1.35, 1, apronD * 1.25); tableShadow.position.set(0, FLOOR_Y + 0.5, 0); tableShadow.material.opacity = 0.75;

  /* the balls */
  const ballGeo = new T.SphereGeometry(R, 32, 20);
  function ballMesh(n) {
    const t = tex(ballCanvas(n, script), true); t.wrapT = T.ClampToEdgeWrapping;
    const m = lit(new T.Mesh(ballGeo, new T.MeshPhongMaterial({ map: t, specular: 0xffffff, shininess: 140, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12 })), true, false);
    scene.add(m);
    const sh = add(new T.Mesh(unit, shadowMat)); sh.scale.set(R * 2.6, 1, R * 2.6); sh.visible = false;
    return { mesh: m, shadow: sh, q: new T.Quaternion(), obj: null, px: 0, py: 0, h: 0, vh: 0, delay: 0, wasIn: false };
  }
  const balls = [];
  for (let n = 1; n <= 9; n++) balls.push(ballMesh(n));
  const cueBall = ballMesh(0);
  // the ghost balls of the aim guide
  const ghostMat = decal(new T.MeshBasicMaterial({ color: 0xffffff, opacity: 0.3 }), 7);
  const ghosts = [add(new T.Mesh(ballGeo, ghostMat)), add(new T.Mesh(ballGeo, ghostMat.clone()))];
  ghosts[1].material._order = 7; ghosts[1].renderOrder = 7;
  ghosts.forEach(function (g) { g.visible = false; });

  /* the cue */
  const CUE_L = 58 * IN;
  const cueProf = [[0, 0], [1.75, 0], [1.85, 0.4], [1.85, 9], [2.0, 12], [2.9, CUE_L * 0.5], [3.1, CUE_L * 0.505], [3.2, CUE_L * 0.66], [3.35, CUE_L * 0.87], [4.3, CUE_L * 0.98], [4.0, CUE_L], [0, CUE_L]];
  const cueGeo = new T.LatheGeometry(cueProf.map(function (p) { return V2(T, p[0], p[1]); }), 14);
  (function () { const p = cueGeo.attributes.position, uv = cueGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - p.getY(i) / CUE_L); })();
  const cue = lit(new T.Mesh(cueGeo, new T.MeshPhongMaterial({ map: tCue, specular: 0xbbbbbb, shininess: 70, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.06 })), true, false);
  cue.visible = false; scene.add(cue);

  /* the rare cart that waits by a pocket (batch 3 extras) */
  const cartFace = new T.MeshPhongMaterial({ map: tex(cartCanvas(script, true)), specular: 0xffffff, shininess: 80, emissive: 0x332200 });
  const cartSide = new T.MeshPhongMaterial({ color: 0xd9a441, specular: 0xffffff, shininess: 80, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.25 });
  const rareCart = new T.Mesh(roundBox(T, 26, 22, 6, 1.6), [cartSide, cartSide, cartSide, cartSide, cartFace, cartFace]);
  rareCart.visible = false; scene.add(rareCart);
  const rareGlow = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: 0xffd23f, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
  rareGlow.scale.set(70, 70, 1); rareGlow.visible = false; scene.add(rareGlow);

  /* the lamp: three green shades on a bar, the wordmark on its sides */
  const lamp = new T.Group(); lamp.position.set(0, LAMP_Y, 0); scene.add(lamp);
  const barC = mkCanvas(1024, 96), bg2 = barC.getContext("2d");
  bg2.fillStyle = "#0f3a22"; bg2.fillRect(0, 0, 1024, 96);
  bg2.fillStyle = "#ffcf5a"; bg2.fillRect(0, 6, 1024, 4); bg2.fillRect(0, 86, 1024, 4);
  drawScript(bg2, script, 512, 48, 420, 74);
  const barSide = new T.MeshPhongMaterial({ map: tex(barC), specular: 0x888888, shininess: 60 });
  const barPlain = new T.MeshPhongMaterial({ color: 0x0f3a22, specular: 0x888888, shininess: 60 });
  lamp.add(new T.Mesh(roundBox(T, 330, 28, 34, 6), [barPlain, barPlain, barPlain, barPlain, barSide, barSide]));
  const shadeMat = new T.MeshPhongMaterial({ color: 0x1d7a3c, specular: 0xffffff, shininess: 90, side: T.DoubleSide, emissive: 0x0a2a14 });
  const shadeIn = new T.MeshBasicMaterial({ color: 0xfff1c6, side: T.BackSide });
  const bulbMat = new T.MeshBasicMaterial({ color: 0xfffbe8 });
  const glowMat = new T.SpriteMaterial({ map: tGlow, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });
  const lampGlows = [];
  [-105, 0, 105].forEach(function (x) {
    const g = new T.Group(); g.position.set(x, -14, 0); lamp.add(g);
    const sh = new T.Mesh(new T.CylinderGeometry(13, 44, 40, 24, 1, true), shadeMat); sh.position.y = -20; g.add(sh);
    const inner = new T.Mesh(new T.CylinderGeometry(12.5, 43, 39, 24, 1, true), shadeIn); inner.position.y = -20; g.add(inner);
    const cap = new T.Mesh(new T.SphereGeometry(13, 16, 8, 0, TAU, 0, Math.PI / 2), shadeMat); g.add(cap);
    const bulb = new T.Mesh(new T.SphereGeometry(9, 14, 10), bulbMat); bulb.position.y = -26; g.add(bulb);
    const glow = new T.Sprite(glowMat); glow.scale.set(150, 110, 1); glow.position.y = -44; g.add(glow); lampGlows.push(glow);
  });
  [-130, 130].forEach(function (x) { const rod = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, CEIL_Y - LAMP_Y, 6), brass); rod.position.set(x, (CEIL_Y - LAMP_Y) / 2, 0); lamp.add(rod); });

  /* the back wall: shelves of games, a TV, the pawn balls, the clock, the neon, the lightbox, the LED ribbon */
  const BZ = ROOM.z0;
  const wallMat = function (c) { return new T.MeshLambertMaterial({ map: tex(c) }); };
  const shelfMat = new T.MeshLambertMaterial({ color: 0x4a2a14 }), bracket = new T.MeshLambertMaterial({ color: 0x2a2e3c });
  const rnd = rng(77);
  function shelf(x0, x1, y, depth) {
    const m = lit(new T.Mesh(new T.BoxGeometry(x1 - x0, 5, depth), shelfMat), true, true); m.position.set((x0 + x1) / 2, y, BZ + depth / 2); scene.add(m);
    for (let x = x0 + 20; x < x1; x += 160) { const b = new T.Mesh(new T.BoxGeometry(4, 22, depth - 4), bracket); b.position.set(x, y - 13, BZ + depth / 2); scene.add(b); }
  }
  const boxMats = BOX_COLS.map(function (col, i) { return new T.MeshPhongMaterial({ map: tex(boxCanvas(col, script, i)), specular: 0x999999, shininess: 60 }); });
  const boxSide = BOX_COLS.map(function (col) { return new T.MeshLambertMaterial({ color: new T.Color(shade(col, -0.25)) }); });
  const boxGeo = roundBox(T, 38, 52, 10, 1.2);
  function games(x0, x1, y) {                                // a run of game boxes standing on a shelf, spines out with a few faced out
    let x = x0;
    while (x < x1 - 12) {
      const ci = Math.floor(rnd() * BOX_COLS.length), faced = rnd() < 0.42;
      const m = new T.Mesh(boxGeo, faced ? [boxSide[ci], boxSide[ci], boxSide[ci], boxSide[ci], boxMats[ci], boxSide[ci]] : [boxMats[ci], boxSide[ci], boxSide[ci], boxSide[ci], boxSide[ci], boxSide[ci]]);
      if (faced) { m.position.set(x + 19, y + 26 + 2.5, BZ + 14); m.rotation.x = -0.08; x += 41; }
      else { m.rotation.y = Math.PI / 2; m.position.set(x + 5.5, y + 26 + 2.5, BZ + 22); x += 11.5; }
      scene.add(lit(m, true, true));
    }
  }
  const SHELF_X0 = ROOM.x0 + 30, SHELF_X1 = -150;
  [FLOOR_Y + 4.5 * FT].forEach(function (y) { shelf(SHELF_X0, SHELF_X1, y, 44); games(SHELF_X0 + 6, SHELF_X1 - 4, y); });
  // the CRT on the top shelf, showing the wordmark
  const tvBody = new T.MeshPhongMaterial({ color: 0x22242c, specular: 0x666666, shininess: 50 });
  const tvScreen = new T.MeshBasicMaterial({ map: tex(tvCanvas(script, "#2f6bff")) });
  [[-470, 0.9, "#2f6bff"], [-285, 0.75, "#9a2fcf"]].forEach(function (tv, i) {
    const s = tv[1], y = FLOOR_Y + 6.2 * FT;
    const body = lit(new T.Mesh(roundBox(T, 120 * s, 96 * s, 90 * s, 10 * s), tvBody), true, true); body.position.set(tv[0], y + 48 * s + 2.5, BZ + 50 * s); scene.add(body);
    const scr = new T.Mesh(new T.PlaneGeometry(96 * s, 72 * s), i ? new T.MeshBasicMaterial({ map: tex(tvCanvas(script, tv[2])) }) : tvScreen);
    scr.position.set(tv[0] - 6 * s, y + 50 * s + 2.5, BZ + 95.5 * s); scene.add(scr);
  });
  shelf(SHELF_X0, SHELF_X1, FLOOR_Y + 6.2 * FT, 100);
  // the three gold balls of a pawnbroker, hung from a bracket
  const gold = new T.MeshPhongMaterial({ color: 0xffcf3a, specular: 0xffffff, shininess: 120, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.35 });
  const pawn = new T.Group(); pawn.position.set(-60, FLOOR_Y + 8.2 * FT, BZ + 60); scene.add(pawn);
  const arm = new T.Mesh(new T.BoxGeometry(6, 6, 64), bracket); arm.position.set(0, 0, -30); pawn.add(arm);
  [[-18, -48], [18, -48], [0, -78]].forEach(function (b) {
    const s = lit(new T.Mesh(new T.SphereGeometry(14, 20, 14), gold), true, false); s.position.set(b[0], b[1], 0); pawn.add(s);
    const ch = new T.Mesh(new T.CylinderGeometry(0.7, 0.7, -b[1] - 14, 4), bracket); ch.position.set(b[0] * 0.5, b[1] / 2 - 4, 0); ch.rotation.z = Math.atan2(b[0], -b[1]) * 0.5; pawn.add(ch);
  });
  // the wall clock: its hand sweeps toward closing time, like the one in the top bar
  const clockG = new T.Group(); clockG.position.set(60, FLOOR_Y + 8.0 * FT, BZ + 3); scene.add(clockG);
  clockG.add(new T.Mesh(new T.CircleGeometry(46, 32), new T.MeshBasicMaterial({ map: tClock })));
  const handGeo = new T.BoxGeometry(3, 36, 1.5); handGeo.translate(0, 16, 0);
  const clockHand = new T.Mesh(handGeo, new T.MeshBasicMaterial({ color: 0xff9214 })); clockHand.position.z = 1.5; clockG.add(clockHand);
  const minHand = new T.Mesh(handGeo, new T.MeshBasicMaterial({ color: 0x1d2029 })); minHand.position.z = 1.2; minHand.scale.set(1.3, 0.75, 1); clockG.add(minHand);
  // the neon: OPEN, until the shopkeeper flips it to CLOSED
  const neonMat = new T.MeshBasicMaterial({ map: tNeonOpen, transparent: true });
  const neon = new T.Mesh(new T.PlaneGeometry(150, 58), neonMat); neon.position.set(220, FLOOR_Y + 7.9 * FT, BZ + 4); scene.add(neon);
  const neonGlow = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: 0xff3b6b, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
  neonGlow.scale.set(260, 150, 1); neonGlow.position.set(220, FLOOR_Y + 7.9 * FT, BZ + 10); scene.add(neonGlow);
  // the lightbox over the counter
  const signFace = new T.MeshBasicMaterial({ map: tex(signCanvas(script)) }), signSide = new T.MeshPhongMaterial({ color: 0x1b4fc0, specular: 0x777777, shininess: 40 });
  const signBox = new T.Mesh(roundBox(T, 300, 112, 14, 4), [signSide, signSide, signSide, signSide, signFace, signSide]);
  signBox.position.set(ROOM.x1 - 8, FLOOR_Y + 8.3 * FT, -120); signBox.rotation.y = -Math.PI / 2; scene.add(signBox);
  // guitars on the pegboard to the right
  const gBody = new T.Shape(); (function () {
    gBody.moveTo(0, -30); gBody.bezierCurveTo(22, -30, 28, -14, 20, 0); gBody.bezierCurveTo(16, 6, 16, 10, 18, 16);
    gBody.bezierCurveTo(22, 28, 12, 36, 0, 32); gBody.bezierCurveTo(-12, 36, -22, 28, -18, 16);
    gBody.bezierCurveTo(-16, 10, -16, 6, -20, 0); gBody.bezierCurveTo(-28, -14, -22, -30, 0, -30);
  })();
  const gGeo = new T.ExtrudeGeometry(gBody, { depth: 6, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 2, curveSegments: 10 });
  [[330, "#ff4b3e"], [400, "#1b56cf"], [470, "#f2e6c8"], [540, "#ffb81f"]].forEach(function (gt, i) {
    const g = new T.Group(); g.position.set(gt[0], FLOOR_Y + 5.4 * FT, BZ + 8); g.rotation.z = (i - 1.5) * 0.06; scene.add(g);
    const body = lit(new T.Mesh(gGeo, new T.MeshPhongMaterial({ color: gt[1], specular: 0xffffff, shininess: 100, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12 })), true, false);
    body.scale.setScalar(1.3); g.add(body);
    const neck = new T.Mesh(new T.BoxGeometry(7, 80, 4), new T.MeshLambertMaterial({ color: 0x5a3418 })); neck.position.set(0, 82, 6); g.add(neck);
    const head = new T.Mesh(new T.BoxGeometry(10, 20, 4), new T.MeshLambertMaterial({ color: 0x1d2029 })); head.position.set(0, 130, 6); g.add(head);
    const hole = new T.Mesh(new T.CircleGeometry(6, 16), blackMat); hole.position.set(0, 12, 10.5); g.add(hole);
  });

  /* LED ribbon board: a dark housing across the back wall with the dot matrix on its face */
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
  // its height is set below, once the play camera is known, so it sits in the strip of wall just under the top bar
  const LED_TILT = 38 * DEG;                                 // leaned out from the wall at the top, so it faces up at the camera
  const ledG = new T.Group(); ledG.position.set(0, 0, BZ + 20); ledG.rotation.x = -LED_TILT; scene.add(ledG);
  const ledHouse = new T.Mesh(roundBox(T, LED_W + 14, LED_H + 12, 8, 3), new T.MeshPhongMaterial({ color: 0x07080d, specular: 0x333333, shininess: 30 }));
  ledHouse.position.set(0, 1, -4.2); ledG.add(ledHouse);
  const ledFace = new T.Mesh(new T.PlaneGeometry(LED_W, LED_H), ledMat); ledG.add(ledFace);
  const ledBack = new T.Mesh(new T.BoxGeometry(LED_W + 14, 6, 30), bracket); ledBack.position.set(0, -LED_H / 2 - 5, -14); ledG.add(ledBack);   // the bracket shelf it sits on

  /* the counter, the register, and the shopkeeper behind it */
  // the counter stands along the right-hand wall; its front faces the table
  const CTR = { x: ROOM.x1 - 1.0 * FT - 48 - 30, z: -120, w: 300, d: 96, h: 38 * IN };
  const ctr = new T.Group(); ctr.position.set(CTR.x, FLOOR_Y, CTR.z); ctr.rotation.y = -Math.PI / 2; scene.add(ctr);
  const frameM = new T.MeshPhongMaterial({ color: 0x1d2029, specular: 0x888888, shininess: 60 });
  const glass = new T.MeshPhongMaterial({ color: 0xbfe6ff, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.22, depthWrite: false, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.2 });
  const base = lit(new T.Mesh(roundBox(T, CTR.w, 0.42 * CTR.h, CTR.d, 3), frameM), true, true); base.position.y = 0.21 * CTR.h; ctr.add(base);
  const glassBox = new T.Mesh(new T.BoxGeometry(CTR.w - 6, 0.56 * CTR.h, CTR.d - 6), glass); glassBox.position.y = 0.42 * CTR.h + 0.28 * CTR.h; glassBox.renderOrder = 8; ctr.add(glassBox);
  const top = lit(new T.Mesh(roundBox(T, CTR.w + 6, 4, CTR.d + 6, 1.5), frameM), true, true); top.position.y = CTR.h; ctr.add(top);
  for (let i = 0; i < 6; i++) {                             // a few carts on display inside the glass
    const c = new T.Mesh(roundBox(T, 26, 22, 6, 1.5), [cartSide, cartSide, cartSide, cartSide, new T.MeshPhongMaterial({ map: tex(cartCanvas(script, i === 2)), specular: 0x999999, shininess: 60 }), cartSide]);
    c.position.set(-110 + i * 44, 0.42 * CTR.h + 14, 18); c.rotation.x = -0.3; ctr.add(c);
  }
  const reg = new T.Group(); reg.position.set(90, CTR.h + 2, 0); ctr.add(reg);
  const regM = new T.MeshPhongMaterial({ color: 0xb8bcc8, specular: 0xffffff, shininess: 80, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.2 });
  const regBase = lit(new T.Mesh(roundBox(T, 64, 22, 56, 4), regM), true, false); regBase.position.y = 11; reg.add(regBase);
  const regHead = lit(new T.Mesh(roundBox(T, 54, 26, 30, 4), regM), true, false); regHead.position.set(0, 34, -8); regHead.rotation.x = -0.3; reg.add(regHead);
  const regDisp = new T.Mesh(new T.PlaneGeometry(34, 10), new T.MeshBasicMaterial({ color: 0x7dff3a })); regDisp.position.set(0, 44, -2); regDisp.rotation.x = -0.3; reg.add(regDisp);
  const G = { sphere: new T.SphereGeometry(1, 16, 12), box: new T.BoxGeometry(1, 1, 1) };
  G.cyl = new T.CylinderGeometry(0.86, 1, 1, 10, 1, true); G.cyl.translate(0, 0.5, 0);
  G.torso = new T.LatheGeometry([[0.48, -0.1], [0.52, 0.2], [0.55, 0.75], [0.62, 1.3], [0.68, 1.68], [0.58, 1.92], [0.28, 2.02], [0.18, 2.1]].map(function (p) { return V2(T, p[0], p[1]); }), 18);
  G.belt = new T.CylinderGeometry(1, 0.98, 1, 16);
  G.dome = new T.SphereGeometry(1, 18, 9, 0, TAU, 0, Math.PI * 0.55);
  const keeper = makePerson(T, G, { shirt: tex(shirtCanvas(script)), sleeve: 0x1b56cf, pants: 0x3b3328, skin: 0xd59a6a, hair: 0x3a2412 });
  keeper.root.position.set(CTR.x + CTR.d / 2 + 0.95 * FT, FLOOR_Y, CTR.z - 30); keeper.root.rotation.y = -Math.PI / 2;
  keeper.root.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
  scene.add(keeper.root);

  /* the camera that frames the table for play: the closest one that keeps the whole table, plus a strip of the back wall, on screen */
  const sinP = Math.sin(CAM_PITCH), cosP = Math.cos(CAM_PITCH), tanF = Math.tan(CAM_FOV * DEG / 2), v = new T.Vector3();
  const fitPts = [];
  [[OUT.x0, OUT.y0], [OUT.x1, OUT.y0], [OUT.x0, OUT.y1], [OUT.x1, OUT.y1]].forEach(function (p) { fitPts.push([p[0] - CX, RAIL_H, p[1] - CZ]); });
  function bounds(tx, tz, d) {
    camera.position.set(tx, d * sinP, tz + d * cosP); camera.lookAt(tx, 0, tz); camera.updateMatrixWorld();
    let x1 = 1e9, x2 = -1e9, y1 = 1e9, y2 = -1e9;
    for (let i = 0; i < fitPts.length; i++) {
      v.set(fitPts[i][0], fitPts[i][1], fitPts[i][2]).project(camera);
      const px = (v.x * 0.5 + 0.5) * W, py = (-v.y * 0.5 + 0.5) * H;
      if (px < x1) x1 = px; if (px > x2) x2 = px; if (py < y1) y1 = py; if (py > y2) y2 = py;
    }
    return { x1: x1, x2: x2, y1: y1, y2: y2 };
  }
  function centered(d) {
    let tx = 0, tz = 0, bb = null;
    const ppu = H / (2 * d * tanF);
    for (let n = 0; n < 8; n++) {
      bb = bounds(tx, tz, d);
      tx += ((bb.x1 + bb.x2) / 2 - (SAFE.x1 + SAFE.x2) / 2) / ppu;
      tz += ((bb.y1 + bb.y2) / 2 - (SAFE.y1 + SAFE.y2) / 2) / (ppu * sinP);
    }
    return { tx: tx, tz: tz, d: d, bb: bounds(tx, tz, d) };
  }
  let lo = 300, hi = 4000, best = null;
  for (let n = 0; n < 18; n++) {
    const midD = (lo + hi) / 2, c = centered(midD);
    if (c.bb.x2 - c.bb.x1 <= SAFE.x2 - SAFE.x1 && c.bb.y2 - c.bb.y1 <= SAFE.y2 - SAFE.y1) { best = c; hi = midD; } else lo = midD;
  }
  const fit = best || centered(4000);
  const playPos = new T.Vector3(fit.tx, fit.d * sinP, fit.tz + fit.d * cosP), playTgt = new T.Vector3(fit.tx, 0, fit.tz);
  // the LED ribbon: as high on the back wall as it can go and still sit fully in view just under the top bar
  camera.position.copy(playPos); camera.lookAt(playTgt); camera.updateMatrixWorld();
  const topEdge = (LED_H / 2 + 8);
  function rowAt(y) { v.set(0, y + topEdge * Math.cos(LED_TILT), BZ + 20 - topEdge * Math.sin(LED_TILT)).project(camera); return (-v.y * 0.5 + 0.5) * H; }
  let yl = FLOOR_Y + 30, yh = 600;
  for (let n = 0; n < 30; n++) { const ym = (yl + yh) / 2; if (rowAt(ym) > HUD_H + 3) yl = ym; else yh = ym; }
  const LED_Y = Math.max(FLOOR_Y + 1.6 * FT, yl);
  ledG.position.y = LED_Y;
  let xl = 0, xh = LED_W / 2;                               // how much of the board the play camera sees
  for (let n = 0; n < 30; n++) { const xm = (xl + xh) / 2; v.set(xm, LED_Y, BZ + 20).project(camera); if ((v.x * 0.5 + 0.5) * W < W - 10) xl = xm; else xh = xm; }
  LED_SAFE = Math.max(60, Math.floor(2 * xl / LED_W * LED_COLS) - 6);
  const lampHide = LAMP_Y + 60;                             // the lamp is over the camera's head in play: it shows in the room shots only

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (RD) RD.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, key: key, hemi: hemi, script: script,
    balls: balls, cueBall: cueBall, ghosts: ghosts, cue: cue, CUE_L: CUE_L, rareCart: rareCart, rareGlow: rareGlow,
    lamp: lamp, lampHide: lampHide, lampGlows: lampGlows, shadeMat: shadeMat, bulbMat: bulbMat, clockHand: clockHand, minHand: minHand, neon: neon, neonMat: neonMat, neonGlow: neonGlow,
    tNeonOpen: tNeonOpen, tNeonClosed: tNeonClosed, keeper: keeper, regDisp: regDisp, fit: fit, playPos: playPos, playTgt: playTgt,
    camPos: playPos.clone(), camTgt: playTgt.clone(), goalPos: new T.Vector3(), goalTgt: new T.Vector3(), camReady: false, fresh: true,
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0, debugCam: null, tint: "",
    qa: new T.Quaternion(), qb: new T.Quaternion(), restQ: new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, 0)),
    axis: new T.Vector3(), up: new T.Vector3(0, 1, 0), v: new T.Vector3(), v2: new T.Vector3(), dir: new T.Vector3(),
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, shadowsOn: true, shadowSize: 2048, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
// pr = pixel ratio cap, sh = shadow map size (0 = no shadow maps: soft painted shadows stand in)
const QUALITY = [{ pr: 2, sh: 2048 }, { pr: 1.5, sh: 1024 }, { pr: 1.15, sh: 1024 }, { pr: 1, sh: 0 }];

function setQuality(q) {
  RD.quality = clamp(q, 0, QUALITY.length - 1);
  const sh = QUALITY[RD.quality].sh, on = sh > 0;
  if (on && sh !== RD.shadowSize) {
    RD.shadowSize = sh;
    RD.key.shadow.mapSize.set(sh, sh);
    if (RD.key.shadow.map) { RD.key.shadow.map.dispose(); RD.key.shadow.map = null; }
  }
  if (on !== RD.shadowsOn) { RD.shadowsOn = on; RD.key.castShadow = on; }
  RD.dirty = true;
}
function pixelRatio() { return Math.min(window.devicePixelRatio || 1, QUALITY[RD.quality].pr); }

function watchFrameRate(ms) {
  if (RD.qLock || RD.quality >= QUALITY.length - 1 || ms > 250) return;
  if (RD.warm < 45) { RD.warm++; return; }                  // let shaders compile first
  RD.slowSum += ms; RD.slowN++;
  if (RD.slowN < 60) return;
  const avg = RD.slowSum / RD.slowN;
  RD.slowSum = 0; RD.slowN = 0;
  if (avg > 24) {
    if (++RD.slowHits >= 2) {                               // two slow seconds in a row, not one hiccup
      RD.slowHits = 0;
      const before = pixelRatio();
      let q = RD.quality + 1;
      while (q < QUALITY.length - 1 && Math.min(window.devicePixelRatio || 1, QUALITY[q].pr) === before && QUALITY[q].sh === QUALITY[RD.quality].sh) q++;
      setQuality(q);
    }
  } else RD.slowHits = 0;
}

/* ---------------- Keep the WebGL canvas exactly under the shell's canvas ---------------- */
function layout() {
  const hud = RD.hud, st = RD.stage;
  const cw = hud.clientWidth, ch = hud.clientHeight;
  if (!cw || !ch) return false;
  const hr = hud.getBoundingClientRect(), sr = st.getBoundingClientRect();
  const left = Math.round((hr.left - sr.left - st.clientLeft + hud.clientLeft + st.scrollLeft) * 100) / 100;
  const top = Math.round((hr.top - sr.top - st.clientTop + hud.clientTop + st.scrollTop) * 100) / 100;
  const pr = pixelRatio();
  if (cw !== RD.cw || ch !== RD.ch || pr !== RD.pr) {
    RD.cw = cw; RD.ch = ch; RD.pr = pr;
    RD.renderer.setPixelRatio(pr);
    RD.renderer.setSize(cw, ch, false);
    RD.gl.style.width = cw + "px"; RD.gl.style.height = ch + "px";
    RD.dirty = true;
  }
  if (left !== RD.left || top !== RD.top) {
    RD.left = left; RD.top = top;
    RD.gl.style.left = left + "px"; RD.gl.style.top = top + "px";
  }
  return true;
}

function camShake(mag, dur) {
  if (!RD || Shell.reduced) return;
  RD.shakeMag = mag; RD.shakeDur = RD.shakeT = dur;
}

/* ---------------- Table <-> screen, through the 3D camera ---------------- */
function tableToScreen(x, y, hgt) {
  if (!RD) return { x: x, y: y, ok: true };
  RD.v.set(x - CX, hgt || 0, y - CZ).project(RD.camera);
  return { x: (RD.v.x * 0.5 + 0.5) * W, y: (-RD.v.y * 0.5 + 0.5) * H, ok: RD.v.z > -1 && RD.v.z < 1 };
}
// HUD pixel -> the point of the plane at height hgt under it (null above the horizon).
function screenToTable(px, py, hgt) {
  const cam = RD.camera;
  RD.v.set(px / W * 2 - 1, 1 - py / H * 2, 0.5).unproject(cam);
  RD.v2.copy(RD.v).sub(cam.position);
  const h = hgt || 0;
  if (RD.v2.y > -1e-6) return null;
  const t = (h - cam.position.y) / RD.v2.y;
  return { x: cam.position.x + RD.v2.x * t + CX, y: cam.position.z + RD.v2.z * t + CZ };
}

/* ---------------- Game state -> meshes ---------------- */
const poseT = [];
function placeBall(o, b, fdt, idx) {
  const m = o.mesh;
  if (o.obj !== b) {                                         // a new ball (a fresh rack): dropped in from a little way up
    o.obj = b; o.px = b.x; o.py = b.y; o.wasIn = b.in;
    o.q.copy(RD.restQ); RD.qa.setFromAxisAngle(RD.up, (vrand() - 0.5) * 0.6); o.q.premultiply(RD.qa);
    if (!RD.fresh && !Shell.reduced) { o.h = 34; o.vh = 0; o.delay = idx * 0.045; } else { o.h = 0; o.vh = 0; o.delay = 0; }
  }
  if (b.in) {
    o.wasIn = true;
    if (b.sink > 0) {                                        // rolling over the lip and down into the cup
      const k = 1 - b.sink, e = Math.min(1, k * 1.8);
      m.visible = true;
      m.position.set(b.x + (b.px - b.x) * e - CX, R - k * k * 40, b.y + (b.py - b.y) * e - CZ);
    } else m.visible = false;
    o.shadow.visible = false;
    return;
  }
  if (o.wasIn) { o.wasIn = false; o.px = b.x; o.py = b.y; if (!Shell.reduced) { o.h = 26; o.vh = 0; o.delay = 0.05; } }   // set back down on the spot
  const dx = b.x - o.px, dy = b.y - o.py, d = Math.hypot(dx, dy);
  if (d > 1e-4 && d < 60) {                                  // roll without slipping
    RD.axis.set(dy / d, 0, -dx / d);
    RD.qa.setFromAxisAngle(RD.axis, d / R);
    o.q.premultiply(RD.qa);
  }
  o.px = b.x; o.py = b.y;
  if (o.delay > 0) o.delay -= fdt;
  else if (o.h > 0 || o.vh !== 0) {
    o.vh -= 900 * fdt; o.h += o.vh * fdt;
    if (o.h <= 0) { o.h = 0; o.vh = o.vh < -90 ? -o.vh * 0.3 : 0; }
  }
  m.visible = true;
  m.position.set(b.x - CX, R + o.h, b.y - CZ);
  m.quaternion.copy(o.q);
  o.shadow.visible = !RD.shadowsOn;
  if (o.shadow.visible) { const k = clamp(1 - o.h / 40, 0.4, 1); o.shadow.position.set(b.x - CX + 2, 0.2, b.y - CZ - 1); o.shadow.scale.set(R * 2.7 * k, 1, R * 2.7 * k); }
}

function syncScene(state, fdt) {
  const idle = state === "title" || state === "over", calm = Shell.reduced;
  const t = idle ? idleT : S.t;
  RD.clock += fdt;
  ledTick(fdt);

  /* balls */
  placeBall(RD.cueBall, S.cue, fdt, 0);
  for (let i = 0; i < RD.balls.length; i++) { RD.balls[i].mesh.visible = false; RD.balls[i].shadow.visible = false; }
  for (let i = 0; i < S.balls.length; i++) placeBall(RD.balls[S.balls[i].n - 1], S.balls[i], fdt, i + 1);
  RD.fresh = false;

  /* the cue: drawn back by the power while aiming, then through the ball on the shot */
  const evt = !!(X && X.eventActive());
  let show = false, ang = 0, back = 0;
  if (state === "playing" && S.phase === "aim" && !evt && !S.cue.in) {
    const sh = currentShot();
    show = true; ang = sh.a; back = R + 3 + sh.p * 62;
    if (!calm && sh.p === 0) back += Math.sin(RD.clock * 3.2) * 1.5;     // a little waggle while you line it up
    V.cueWas = true;
  } else if (V.strike) {
    V.strike.t += fdt;
    const k = V.strike.t;
    if (k < 0.32) {
      show = true; ang = V.strike.a;
      const from = R + 3 + V.strike.p * 62;
      back = k < 0.07 ? from + (R - 6 - from) * (k / 0.07) : R - 6 + Math.min(1, (k - 0.07) / 0.25) * 8;
      if (k < 0.07 && k + fdt >= 0.07) { const p = tableToScreen(S.cue.x, S.cue.y, R); chalkPuff(p.x, p.y); }
    } else V.strike = null;
  }
  RD.cue.visible = show;
  if (show) {
    const el = 7 * DEG, dx = Math.cos(ang), dy = Math.sin(ang), c = Math.cos(el), s = Math.sin(el);
    const ox = V.strike ? V.strike.x0 : S.cue.x, oy = V.strike ? V.strike.y0 : S.cue.y;   // the follow-through stays where the ball was hit
    RD.dir.set(-dx * c, s, -dy * c);                         // from the tip toward the butt
    RD.cue.position.set(ox - CX - dx * back * c, R + 1 + back * s, oy - CZ - dy * back * c);
    RD.cue.quaternion.setFromUnitVectors(RD.up, RD.dir);
  }

  /* the aim guide: ghost balls in 3D, the lines on the HUD */
  V.guide = null;
  RD.ghosts[0].visible = RD.ghosts[1].visible = false;
  if (state === "playing" && S.phase === "aim" && !evt && !S.cue.in && guide()) {
    const g = V.guide = guideFor(currentShot().a), h = g.h;
    if (h.ball) { RD.ghosts[0].visible = true; RD.ghosts[0].position.set(h.x - CX, R, h.y - CZ); RD.ghosts[0].material.opacity = 0.32; }
    else if (!h.pocket) {
      RD.ghosts[0].visible = true; RD.ghosts[0].position.set(h.x - CX, R, h.y - CZ); RD.ghosts[0].material.opacity = 0.22;
      if (g.h2 && g.h2.ball && g.h2.d <= 200) { RD.ghosts[1].visible = true; RD.ghosts[1].position.set(g.h2.x - CX, R, g.h2.y - CZ); RD.ghosts[1].material.opacity = 0.2; }
    }
  }

  /* the rare cart waiting on the rail by a pocket */
  const rare = !idle && S.x && S.x.rare;
  RD.rareCart.visible = RD.rareGlow.visible = !!rare;
  if (rare) {
    const p = POCKETS[rare.p], a = Math.atan2(p.y - CZ, p.x - CX), side = rare.p === 2 || rare.p === 3, dA = side ? (p.x < CX ? Math.PI : 0) : a;
    const px = p.x + Math.cos(dA) * (p.r + 22) - CX, pz = p.y + Math.sin(dA) * (p.r + 22) - CZ, bob = calm ? 0 : Math.sin(RD.clock * 3) * 2;
    RD.rareCart.position.set(px, RAIL_H + 16 + bob, pz); RD.rareCart.rotation.set(-0.5, calm ? 0 : RD.clock * 1.6, 0);
    RD.rareGlow.position.set(px, RAIL_H + 16, pz); RD.rareGlow.material.opacity = 0.55 + (calm ? 0 : Math.sin(RD.clock * 6) * 0.2);
  }

  /* the lamp: a buzzing tube now and then, warmer on a Hot Streak, and the scenery's light */
  const flick = calm ? 1 : (Math.sin(t * 61) > 0.97 ? 0.7 : 1);
  const hot = !idle && S.x && S.x.fever.active();
  RD.key.intensity = 2.6 * flick * (hot ? 1.08 : 1);
  RD.key.color.setHex(hot ? 0xffcc99 : 0xfff4dc);
  for (let i = 0; i < RD.lampGlows.length; i++) RD.lampGlows[i].material.opacity = 0.9 * flick;
  const tint = S.x ? S.x.sc.id : "";
  if (tint !== RD.tint) {
    RD.tint = tint;
    const sky = { rain: 0xc8d4ff, fog: 0xe6e6ee, sun: 0xfff0c8, golden: 0xffd9a0, twilight: 0xe0c8ff, suburbs: 0xfff1d6 }[tint] || 0xfff1d6;
    RD.hemi.color.setHex(sky);
    RD.scene.fog = tint === "fog" ? new RD.T.Fog(0x8a8478, 900, 2600) : null;
  }

  /* the wall clock and the neon */
  const k = clamp(clock() / CLOSE_AT, 0, 1);
  RD.clockHand.rotation.z = -k * TAU;
  RD.minHand.rotation.z = -k * TAU * 12;
  const closed = V.closed && !(state === "title");
  RD.neonMat.map = closed ? RD.tNeonClosed : RD.tNeonOpen;
  RD.neonGlow.material.color.setHex(closed ? 0xff2b3d : 0xff3b6b);
  RD.neonGlow.material.opacity = 0.5 + (calm ? 0 : (Math.sin(RD.clock * 37) > 0.94 ? -0.25 : 0));
  RD.regDisp.material.color.setHex(hot ? 0xff9214 : 0x7dff3a);

  /* the shopkeeper */
  keeperPose(state, fdt, t);

  /* camera: the room on the title and score cards, the table for play */
  const gp = RD.goalPos, gt = RD.goalTgt;
  let rate = 4.2;
  if (RD.debugCam) { gp.fromArray(RD.debugCam, 0); gt.fromArray(RD.debugCam, 3); rate = 1000; }
  else if (idle) {
    // from the front corner of the room toward the counter: the table, the lamp, the shopkeeper and the board in one shot
    const sw = calm ? 0 : Math.sin(idleT * 0.16), bob = calm ? 0 : Math.sin(idleT * 0.23);
    gp.set(-320 + sw * 70, 290 + bob * 22, 615 - sw * 25);
    gt.set(190 + sw * 30, 70, -190);
    rate = state === "over" ? 1.6 : 3;
    if (!RD.camReady) { RD.camPos.copy(gp); RD.camTgt.copy(gt); RD.camera.fov = 58; RD.camera.updateProjectionMatrix(); }
  } else { gp.copy(RD.playPos); gt.copy(RD.playTgt); rate = 4.5; }
  if (!RD.camReady) RD.camReady = true;
  const kk = 1 - Math.exp(-rate * fdt), fovGoal = RD.debugCam ? (RD.debugCam[6] || CAM_FOV) : idle ? 58 : CAM_FOV;
  RD.camPos.lerp(gp, kk); RD.camTgt.lerp(gt, kk);
  let fov = RD.camera.fov + (fovGoal - RD.camera.fov) * kk;
  if (state === "playing" && RD.camPos.distanceToSquared(gp) < 0.5) { RD.camPos.copy(gp); RD.camTgt.copy(gt); fov = fovGoal; }
  if (Math.abs(fov - RD.camera.fov) > 1e-4) { RD.camera.fov = fov; RD.camera.updateProjectionMatrix(); }
  let sx = 0, sy = 0;
  if (RD.shakeT > 0) {
    RD.shakeT -= fdt;
    const m = RD.shakeMag * Math.max(0, RD.shakeT / RD.shakeDur);
    sx = (vrand() * 2 - 1) * m; sy = (vrand() * 2 - 1) * m;
  }
  RD.camera.position.set(RD.camPos.x + sx, RD.camPos.y + sy, RD.camPos.z);
  RD.camera.lookAt(RD.camTgt.x + sx, RD.camTgt.y + sy, RD.camTgt.z);
  RD.camera.updateMatrixWorld();
  RD.lamp.visible = RD.camera.position.y < RD.lampHide;
}

// The shopkeeper leans on the counter, folds his arms, checks his watch as closing gets near, claps a good shot,
// shakes his head at a scratch, and flips the sign when time is up. Looks only.
function keeperPose(state, fdt, t) {
  const P = RD.keeper, calm = Shell.reduced;
  if (!V.pose) V.pose = POSE.lean.slice();
  if (V.moodT > 0) { V.moodT -= fdt; if (V.moodT <= 0) V.mood = ""; }
  let goal = POSE.lean;
  const playing = state === "playing" || state === "paused";
  if (V.closed && state !== "title") goal = POSE.point;
  else if (V.mood === "clap" && !calm) goal = Math.sin(RD.clock * 15) > 0 ? POSE.clapA : POSE.clapB;
  else if (V.mood === "clap") goal = POSE.clapA;
  else if (playing && CLOSE_AT - clock() < 60 && (RD.clock % 7) < 1.8) goal = POSE.watch;
  else goal = (Math.floor(RD.clock / 9) % 2) ? POSE.cross : POSE.lean;
  for (let i = 0; i < 19; i++) poseT[i] = goal[i];
  if (V.mood === "shake" && !calm) poseT[18] = Math.sin(RD.clock * 13) * 28;
  if (!calm) { poseT[1] += Math.sin(RD.clock * 1.6) * 0.012; poseT[18] += Math.sin(RD.clock * 0.37) * 8; }
  const k = 1 - Math.exp(-(V.mood === "clap" ? 22 : 7) * fdt);
  for (let i = 0; i < 19; i++) V.pose[i] += (poseT[i] - V.pose[i]) * (fdt > 0 ? k : 1);
  applyPose(P, V.pose);
}

/* ---------------- HUD (2D canvas on top) ---------------- */
function txt(c, s, x, y, size, color, align, shadow) {
  c.font = "bold " + size + "px " + HUD_FONT;
  c.textAlign = align || "left"; c.textBaseline = "top";
  if (shadow) { c.fillStyle = shadow; c.fillText(s, x + 1, y + 1); }
  c.fillStyle = color; c.fillText(s, x, y);
}
function rrect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function circ(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
// A dotted line across the cloth, from distance "from" to "to" along (dx, dy).
function dots(c, x0, y0, dx, dy, from, to, col, alpha) {
  for (let d = from; d < to; d += 8) {
    const p = tableToScreen(x0 + dx * d, y0 + dy * d, 0.8);
    c.fillStyle = "rgba(8,32,95," + (0.5 * alpha).toFixed(3) + ")"; c.beginPath(); c.arc(p.x, p.y, 2.2, 0, TAU); c.fill();
    c.fillStyle = col; c.beginPath(); c.arc(p.x, p.y, 1.4, 0, TAU); c.fill();
  }
}
// A circle lying on the table (the equator of a ball, or the mouth of a pocket), drawn through the camera.
function ring(c, x, y, r, hgt, col, lw) {
  c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
  for (let i = 0; i <= 28; i++) { const a = i / 28 * TAU, p = tableToScreen(x + Math.cos(a) * r, y + Math.sin(a) * r, hgt); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }
  c.stroke();
}
function arrow(c, x, y, dx, dy, len, col) {
  const a = tableToScreen(x, y, R), b = tableToScreen(x + dx * len, y + dy * len, R);
  const ex = b.x - a.x, ey = b.y - a.y, l = Math.hypot(ex, ey) || 1, ux = ex / l, uy = ey / l;
  c.lineCap = "round";
  c.strokeStyle = "rgba(8,32,95,.6)"; c.lineWidth = 4.5; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  c.strokeStyle = col; c.lineWidth = 2.4; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  c.fillStyle = col; c.beginPath();
  c.moveTo(b.x + ux * 7, b.y + uy * 7); c.lineTo(b.x - uy * 5, b.y + ux * 5); c.lineTo(b.x + uy * 5, b.y - ux * 5); c.closePath(); c.fill();
}
// Where the object ball heads and where the cue ball glances off (the 2D game's ghost-ball geometry).
function drawContact(c, h, dx, dy, alpha) {
  const b = h.ball;
  let nx = b.x - h.x, ny = b.y - h.y;
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl; ny /= nl;
  ring(c, h.x, h.y, R, R, "rgba(255,255,255," + (0.85 * alpha) + ")", 1.3);
  const cut = clamp(dx * nx + dy * ny, 0, 1);                       // 1 = straight on, 0 = thin cut
  arrow(c, b.x + nx * (R + 2), b.y + ny * (R + 2), nx, ny, 22 + 60 * cut, "rgba(255,210,63," + (0.95 * alpha) + ")");
  const tx = dx - cut * nx, ty = dy - cut * ny, tl = Math.hypot(tx, ty);
  if (tl > 0.08) dots(c, h.x, h.y, tx / tl, ty / tl, R + 3, R + 3 + 40 * tl, "rgba(63,240,255," + (0.85 * alpha) + ")", alpha);
}
function drawGuide(c) {
  const g = V.guide;
  if (!g) return;
  const h = g.h, cx = S.cue.x, cy = S.cue.y;
  dots(c, cx, cy, g.dx, g.dy, R + 4, h.d, "rgba(255,255,255,.95)", 1);
  if (h.ball) { drawContact(c, h, g.dx, g.dy, 1); return; }
  if (h.pocket) { ring(c, h.pocket.x, h.pocket.y, h.pocket.r + 3, 0.5, "rgba(155,255,63,.95)", 2.4); return; }
  ring(c, h.x, h.y, R, R, "rgba(255,255,255,.7)", 1.2);              // first bounce off the rail
  const h2 = g.h2, lim = Math.min(h2.d, 200);
  dots(c, h.x, h.y, g.rx, g.ry, R + 2, lim, "rgba(255,255,255,.6)", 0.6);
  if (h2.ball && h2.d <= 200) drawContact(c, h2, g.rx, g.ry, 0.6);
  else if (h2.pocket && h2.d <= 200) ring(c, h2.pocket.x, h2.pocket.y, h2.pocket.r + 3, 0.5, "rgba(155,255,63,.7)", 2);
}
function drawPower(c) {
  const sh = currentShot();
  if (!(S.drag || S.charging)) return;
  const x = 8, top = 190, hgt = 190, pc = clamp(sh.p, 0, 1), col = pc > 0.8 ? "#ff3b2e" : pc > 0.45 ? "#ffd21f" : "#3fe0ff";
  rrect(c, x - 3, top - 3, 20, hgt + 6, 6); c.fillStyle = "rgba(8,32,95,.82)"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = "#ffffff"; c.stroke();
  c.save(); rrect(c, x, top, 14, hgt, 4); c.clip();
  c.fillStyle = "#12296e"; c.fillRect(x, top, 14, hgt);
  c.fillStyle = col; c.fillRect(x, top + hgt * (1 - pc), 14, hgt * pc);
  c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(x + 2, top, 3, hgt);
  c.restore();
  txt(c, Math.round(pc * 100) + "%", x + 7, top + hgt + 6, 9, "#ffffff", "center", "#08205f");
}
function drawGuideBtn(c) {
  const on = guide();
  rrect(c, GBTN.x, GBTN.y, GBTN.w, GBTN.h, 7);
  c.fillStyle = on ? "rgba(63,240,255,.22)" : "rgba(8,20,60,.55)"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = on ? "#3ff0ff" : "#8ea3d6"; c.stroke();
  txt(c, "GUIDE (G)", GBTN.x + GBTN.w / 2, GBTN.y + 6, 8, "#d8e6ff", "center");
  txt(c, on ? "ON" : "OFF", GBTN.x + GBTN.w / 2, GBTN.y + 18, 12, on ? "#3ff0ff" : "#c0c8dc", "center", "#08205f");
}
function drawHUD(c, state) {
  const bg = c.createLinearGradient(0, 0, 0, 54);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, 0, W, 54);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff9214"; c.fillRect(0, 54, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, 56, W, 1);
  const late = clock() > CLOSE_AT - 30;
  txt(c, "CLOCK", 10, 7, 9, "#a8ecff", "left", "#08205f");
  txt(c, fmt(clock()), 10, 20, 18, late && Math.floor(S.t * 4) % 2 && !Shell.reduced ? "#ffffff" : late ? "#ff6a5a" : "#ffe45c", "left", "#08205f");
  drawGuideBtn(c);
  const cx0 = 196;
  txt(c, "RACK " + S.rack + "/" + RACKS, cx0, 6, 9, "#ffffff", "center", "#08205f");
  let left = 0;
  for (let i = 0; i < S.balls.length; i++) if (!S.balls[i].in) left++;
  for (let i = 0; i < 9; i++) {
    const bx = cx0 - 44 + i * 11, on = S.balls.some(function (b) { return b.n === i + 1 && !b.in; });
    if (on) {
      circ(c, bx, 27, 4.6, "#08205f"); circ(c, bx, 27, 3.9, COLORS[i]);
      if (i === 8) { circ(c, bx, 27, 3.9, "#f7f3e8"); c.fillStyle = COLORS[i]; c.fillRect(bx - 3.9, 25.3, 7.8, 3.4); }
      circ(c, bx - 1.2, 25.8, 1.1, "rgba(255,255,255,.75)");
    } else { c.strokeStyle = "rgba(255,255,255,.45)"; c.lineWidth = 1; c.beginPath(); c.arc(bx, 27, 3.6, 0, TAU); c.stroke(); }
  }
  txt(c, left + " LEFT", cx0, 37, 9, "#a8ecff", "center", "#08205f");
  // the shopkeeper's clock: the hand sweeps toward CLOSED
  const dcx = W - 28, dcy = 25, k = clamp(clock() / CLOSE_AT, 0, 1);
  circ(c, dcx, dcy, 19, "#08205f"); circ(c, dcx, dcy, 17.5, "#f6f1e2");
  c.fillStyle = "#ff4b3e"; c.beginPath(); c.moveTo(dcx, dcy); c.arc(dcx, dcy, 16, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.01); c.closePath(); c.fill();
  const ha = -Math.PI / 2 + k * TAU;
  c.strokeStyle = "#0b1f5c"; c.lineWidth = 2.4; c.lineCap = "round"; c.beginPath(); c.moveTo(dcx, dcy); c.lineTo(dcx + Math.cos(ha) * 13, dcy + Math.sin(ha) * 13); c.stroke();
  circ(c, dcx, dcy, 2.2, "#ff9214");
  txt(c, "CLOSED AT " + fmt(CLOSE_AT), W - 54, 40, 8, "#d8e6ff", "right", "#08205f");
}

function draw(c, state) {
  Juke.pump();
  if (!RD || !RD.hud) return;
  const now = performance.now();
  let ms = now - RD.lastT;
  RD.lastT = now;
  if (!(ms > 0)) ms = 0;
  const sized = layout();
  if (state === "paused" && !RD.dirty) return;             // nothing moves while paused: leave the last frame up
  if (state === "playing") watchFrameRate(ms);
  const fdt = state === "paused" ? 0 : Math.min(ms, 50) / 1000;
  Juke.setHurry(state === "playing" && CLOSE_AT - clock() < 30);
  if (sized) {
    syncScene(state, fdt);
    RD.renderer.render(RD.scene, RD.camera);
    RD.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  if (state === "playing" && S.phase === "aim") drawGuide(c);
  const playing = state !== "title";
  if (S.x && playing) {
    c.textAlign = "center"; c.textBaseline = "top";
    const a = tableToScreen(OUT.x0, OUT.y0, RAIL_H), b = tableToScreen(OUT.x1, OUT.y1, RAIL_H);
    const area = { x: Math.min(a.x, b.x), y: a.y, w: Math.abs(b.x - a.x), h: b.y - a.y };
    X.drawScenery(c, S.x.sc, idleT + S.t, area);
    if (S.x.rare) { const rp = POCKETS[S.x.rare.p], p = tableToScreen(rp.x, rp.y, RAIL_H); rareTag(c, p.x + (rp.x < 180 ? 18 : -18), p.y + (rp.y < 200 ? 16 : rp.y > 400 ? -16 : 0)); }
    S.x.fever.draw(c, area, S.t);
  }
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    c.globalAlpha = clamp(q.life * 2, 0, 1);
    c.fillStyle = q.c;
    if (q.dot) { c.beginPath(); c.arc(q.x, q.y, q.w, 0, TAU); c.fill(); }
    else { c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.fillRect(-q.w, -1.5, q.w * 2, 3); c.restore(); }
  }
  c.globalAlpha = 1;
  drawHUD(c, state);
  if (state === "playing" && S.phase === "aim") drawPower(c);
  if (S.x) { c.textAlign = "center"; c.textBaseline = "top"; X.drawTag(c, S.x.sc, 10, 62); X.drawEvent(c, W, H); }   // tag sits just under the top bar, not on it
}
// A little "RARE" call-out by the pocket the rare cart is waiting at.
function rareTag(c, x, y) {
  const s = Shell.reduced ? 1 : 1 + Math.sin(S.t * 6) * 0.06;
  c.save(); c.translate(x, y); c.scale(s, s);
  rrect(c, -18, -8, 36, 15, 6); c.fillStyle = "#ffd23f"; c.fill(); c.lineWidth = 1.5; c.strokeStyle = "#08205f"; c.stroke();
  txt(c, "RARE", 0, -5, 9, "#08205f", "center");
  c.restore();
}

/* ---------------- Splash, boot, shell hookup ---------------- */
function makeSplash() {
  const el = document.createElement("div");
  el.id = "npg-splash";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Nostalgia Pro Games");
  el.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;z-index:9999;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;gap:18px;padding:24px;box-sizing:border-box;text-align:center;" +
    "background:radial-gradient(circle at 50% 42%,#21429c 0%,#0f2057 52%,#070d28 100%);" +
    "font:bold 15px/1.5 " + HUD_FONT.replace(/"/g, "'") + ";color:#ffffff;opacity:1;transition:opacity .35s ease";
  const img = document.createElement("img");
  img.alt = "";
  img.decoding = "async";
  img.style.cssText = "display:block;width:min(66vw,44vh,340px);height:auto;opacity:0;transform:scale(.86);" +
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "transition:opacity .2s ease" : "transition:opacity .28s ease,transform .55s cubic-bezier(.2,1.5,.4,1)");
  el.appendChild(img);
  const bar = document.createElement("div");                // a loading bar under the logo while the back room is built
  bar.style.cssText = "width:min(52vw,220px);height:6px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden";
  const fillEl = document.createElement("div");
  fillEl.style.cssText = "width:8%;height:100%;border-radius:3px;background:linear-gradient(90deg,#ff9214,#ffe45c);transition:width .4s ease";
  bar.appendChild(fillEl); el.appendChild(bar);
  document.body.appendChild(el);
  return { el: el, img: img, fill: fillEl, bar: bar };
}
function splashProgress(splash, k) { if (splash.fill) splash.fill.style.width = Math.round(clamp(k, 0, 1) * 100) + "%"; }

function splashFail(splash, lines) {
  const el = splash.el;
  splash.img.style.width = "min(40vw,26vh,180px)";
  if (splash.bar) splash.bar.style.display = "none";
  el.setAttribute("role", "alert");
  el.removeAttribute("aria-label");
  const p = document.createElement("p");
  p.style.cssText = "margin:0;max-width:30em";
  p.textContent = lines;
  const a = document.createElement("a");
  a.href = "../"; a.textContent = "Back to the arcade";
  a.style.cssText = "color:#ffe45c";
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
  const hud = document.getElementById("np-canvas"), stage = document.getElementById("np-stage");
  RD.hud = hud; RD.stage = stage;
  if (getComputedStyle(stage).position === "static") stage.style.position = "relative";
  const gl = RD.gl;
  gl.style.cssText = "position:absolute;left:0;top:0;z-index:0;display:block;margin:0;padding:0;border:0;box-shadow:none;" +
    "max-width:none;max-height:none;transform:none;image-rendering:auto;pointer-events:none;touch-action:none;" +
    "border-radius:" + getComputedStyle(hud).borderRadius;
  stage.insertBefore(gl, hud);
  // the shell canvas becomes a clear HUD layer over the 3D view
  hud.style.background = "transparent";
  hud.style.touchAction = "none";                            // a drag to aim never scrolls or zooms the page on a phone
  if (getComputedStyle(hud).position === "static") hud.style.position = "relative";   // so it stacks above the WebGL canvas
  const crt = stage.querySelector(".np-crt");
  if (crt) crt.style.display = "none";                       // glossy back room, no scanlines
  RD.lastT = performance.now();
  layout();
}

function logoImg(width) {
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
  im.style.cssText = "display:block;width:" + width + ";height:auto;margin:0 auto 6px";
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_URL;
  return im;
}

function startGame() {
  Shell.init({
    slug: "pawn-shop-pool",
    title: "PAWN SHOP POOL",
    accent: "#ff4b3e",
    width: W, height: H,
    lowerIsBetter: true,
    format: fmt,
    howTo: "Clear three racks in the back room before the shop closes, now in real 3D. Drag back from anywhere to aim and set power, then let go. Tap GUIDE at the top to turn the aim line on or off.",
    keys: "Keys: left and right aim (up and down fine tune), hold Space for power, release to shoot, G turns the aim guide on or off. P pause, M mute, N music, R restart.",
    tip: "A scratch costs 10 seconds. Two balls in one shot takes 3 off.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { keys = {}; S.drag = null; S.charging = false; }
  });
  attach();
  // Sound. Nothing is created until the first tap, click or key press; the band starts with the game.
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Juke.unlock, true); });
  Shell.onStart(Juke.newGame); Shell.onRestart(Juke.newGame); Shell.onResume(Juke.unlock);
  Shell.onStart(introBoard); Shell.onRestart(introBoard);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));   // not while initials are being typed
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Juke.toggleMusic();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) { Juke.button(titleCard, titleCard.querySelector(".np-tip")); titleCard.insertBefore(logoImg("clamp(56px,12vh,96px)"), titleCard.firstChild); }
  if (pauseActions) Juke.button(pauseActions, pauseActions.querySelector("a"));
  // The full studio logo heads the score card too.
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) card.insertBefore(logoImg("clamp(64px,14vh,104px)"), card.firstChild);
}
function introBoard() { ledPlay([ledMsg("slide", "RACK 1 OF " + RACKS, 2, { color: "yellow" }), ledMsg("blink", "CLOSES AT " + fmt(CLOSE_AT), 2, { color: "cyan" })]); }

// Hook for automated checks (no effect on play)
window.__pool = { S: function () { return S; }, update: update, shoot: shoot, step: step, cast: cast, castFrom: castFrom, guide: function () { return guide(); }, moving: moving, POCKETS: POCKETS, R: R,
                  gfx: function () { return RD; }, led: function () { return LED; }, view: function () { return V; }, juke: Juke, toScreen: tableToScreen, toTable: screenToTable,
                  setCam: function (a) { if (RD) RD.debugCam = a; }, startMusic: startMusic };

(function boot() {
  const splash = makeSplash();
  const t0 = performance.now();
  const q = /[?&]gfx=(high|low|2d)/.exec(location.search);
  let started = false;
  Promise.all([loadLogo(splash).then(function (v) { splashProgress(splash, 0.35); return v; }),
               q && q[1] === "2d" ? Promise.reject(Object.assign(new Error("2D asked for"), { npStage: "webgl" }))
                                  : import(THREE_URL).then(function (m) { splashProgress(splash, 0.6); return m; }, function (e) { e.npStage = "three"; throw e; }),
               loadImage(SCRIPT_URL)])
    .then(function (res) {
      THREE = res[1];
      try { RD = buildScene(THREE, res[2]); } catch (e) { e.npStage = "webgl"; throw e; }
      splashProgress(splash, 0.85);
      if (q) { RD.qLock = true; setQuality(q[1] === "low" ? QUALITY.length - 1 : 0); }
      reset();
      try { RD.renderer.compile(RD.scene, RD.camera); } catch (e) { /* warm-up only */ }
      splashProgress(splash, 1);
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
      RD = null;
      loadClassic().then(function () { splashGone(splash); }, function () {
        splashFail(splash, e && e.npStage === "three"
          ? "Pawn Shop Pool could not load its 3D engine (" + THREE_URL + ")."
          : "Pawn Shop Pool needs WebGL for its 3D back room, and this browser has it switched off or does not support it.");
      });
    });
})();
