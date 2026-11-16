/* TABLE RINK RUMBLE (3D): first to 7 on the rec room table. Beat one collector, the next one sits down.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of input, scaling and the title / pause / game over flow, and carries the HUD.

   The rules, the five collectors, the scoring, the controls, the extras (scenery, events, rare finds,
   Hot Streak) and the puck and mallet physics are the 2D game's, unchanged: the table is still laid
   out in the same 360 x 540 units and the puck is still stepped by the same code. Only the picture
   is new, plus a soundtrack on top of the shell's sound effects.
   A table point (x, y) sits in three.js space at (x - 180, height, y - 298): the playing surface is
   y = 0, you play from the +z end and the collector stands across the table at the -z end.
   One foot is 70 table units (a seven-foot table), so the table and the man across it keep real proportions. */

const W = 360, H = 540, TAU = Math.PI * 2, DEG = Math.PI / 180;
const X0 = 24, X1 = 336, Y0 = 68, Y1 = 528, MID = (Y0 + Y1) / 2, GOAL = 66;   // GOAL is half the goal mouth
const PR = 22, KR = 13, TO_WIN = 7;
const OPP = [
  { name: "The Box Lot Guy", speed: 230, reach: 0.38, jitter: 34, think: 0.24, track: 0.3 },
  { name: "The Reseller", speed: 290, reach: 0.48, jitter: 24, think: 0.19, track: 0.45 },
  { name: "The Mint Sealed Purist", speed: 350, reach: 0.58, jitter: 16, think: 0.15, track: 0.6 },
  { name: "The Flea Market Shark", speed: 410, reach: 0.66, jitter: 11, think: 0.12, track: 0.7 },
  { name: "The Estate Sale Early Bird", speed: 460, reach: 0.72, jitter: 8, think: 0.1, track: 0.8 }
];

/* ---------------- The rec room (table units) ---------------- */
const CX = 180, CZ = MID;                                  // table point that sits on the origin
const FT = 70;                                            // table units per foot (a full-size seven-foot table)
const TABLE_H = Math.round(2.35 * FT);                    // playing surface above the carpet
const RAIL_T = 10, RAIL_H = 15, APRON = 64;               // rail thickness (the 2D frame) and height, skirt under the surface
const PUCK_T = 5, GRIP_Y = 34;                            // puck thickness; where the collector's fist sits on his mallet
const BOARD = { w: X1 - X0 + RAIL_T * 2, house: 38, face: 30, depth: 6, z: Y0 - RAIL_T - CZ + 3, lean: -0.62 };   // the LED dasher board on the far rail, leaning back to face you
const OPP_Z = Y0 - RAIL_T - CZ - 0.95 * FT;              // where the collector stands
const HIP_Y = 3.02;                                       // his hips, feet above the carpet
const ARM = 1.08 + 1.04;                                  // his arm, shoulder to wrist, feet
const WALL_Z = -560;
const CAM_FOV = 36, CAM_PITCH = 48 * DEG;
const HUD_H = 50;
const LIGHT = { hemi: 1.42, key: 1.85, fill: 1.3 };   // the room's lights; the overhead key is kept below the point where darker skin tones wash out
const SAFE = { x1: 3, x2: W - 3, y1: HUD_H + 2, y2: H - 3 };   // where the table and the collector have to fit on screen

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash and score card only
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every decal in the rec room
const THREE_URL = "../shared/three.module.min.js";
const FALLBACK_URL = "game-2d.js";                        // optional: the classic 2D game, used if 3D cannot start
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';

let S = {}, keys = {}, idleT = 0, parts = [];
let THREE = null, R = null, TV = null;                    // R holds everything the renderer owns
const X = window.NPX && window.NPX.on ? window.NPX : null;   // batch 3 extras (shared/extras.js)
// V is how things are being shown (the collector's body, the puck dropping into a goal, the goal lights).
// It never feeds back into the rules.
const V = { drop: null, react: 0, reactKind: "", oppX: 0, lean: 18, uy: 8, yaw: 0, flash: [0, 0], fever: false, rares: 0, look: -1, matchShown: -1, wasPhase: "" };
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* =====================================================================================
   The 2D game's rules, untouched (only the marked presentation hooks are new)
   ===================================================================================== */

function opp() {
  var i = S.match, o = OPP[Math.min(i, OPP.length - 1)], extra = Math.max(0, i - (OPP.length - 1));
  return { name: o.name + (extra ? " (Round " + (extra + 1) + ")" : ""), speed: o.speed + extra * 30, reach: Math.min(0.8, o.reach + extra * 0.03), jitter: o.jitter, think: o.think, track: Math.min(0.9, o.track + extra * 0.02) };
}

function reset() {
  S = { t: 0, pt: 0, match: 0, wins: 0, bestMargin: 0, me: 0, cpu: 0, phase: "face", serveTo: 1, matchT: 0, maxBehind: 0,
        p: { x: 180, y: Y1 - 70, vx: 0, vy: 0, tx: 180, ty: Y1 - 70 }, c: { x: 180, y: Y0 + 60, vx: 0, vy: 0, tx: 180, ty: Y0 + 60, nt: 0 },
        k: { x: 180, y: MID + 60, vx: 0, vy: 0 }, last: null, pinT: 0, pinGap: 0, ghost: null, back: 0, snd: { me: 0, cpu: 0 }, boost: 0, goals: 0, conceded: 0, fastest: 0 };
  parts.length = 0;
  if (X) S.x = { sc: X.scenery(), fever: new X.Fever(15), sched: new X.Scheduler(20, 35, 2), rare: null, rares: 0, intro: false, dark: 0, sticky: 0,
                 puddles: [{ x: 110 + Math.random() * 40, y: Y0 + 90 + Math.random() * 60, r: 34 }, { x: 210 + Math.random() * 40, y: MID + 60 + Math.random() * 80, r: 34 }] };
  faceoff(1);
  // presentation only
  V.drop = null; V.react = 0; V.reactKind = ""; V.fever = false; V.rares = 0; V.matchShown = -1; V.flash[0] = V.flash[1] = 0;
  ledClear();
}
function faceoff(side) {   // side 1: puck on your half, -1: on the CPU's half
  S.phase = "face"; S.pt = 0; S.last = null;
  S.k.x = 180; S.k.y = MID + side * 70; S.k.vx = S.k.vy = 0;
  S.pinT = 0; S.pinGap = 0; S.ghost = null; S.back = 0;
}
function maxPuck() { return 640 + Math.min(260, (S.me + S.cpu) * 18 + S.match * 25); }

/* ---------------- Physics ---------------- */
function movePaddle(pd, dt, maxV, yMin, yMax) {
  var dx = pd.tx - pd.x, dy = pd.ty - pd.y, d = Math.hypot(dx, dy), step = maxV * dt;
  var ox = pd.x, oy = pd.y;
  if (d > step) { pd.x += dx / d * step; pd.y += dy / d * step; } else { pd.x = pd.tx; pd.y = pd.ty; }
  pd.x = clamp(pd.x, X0 + PR, X1 - PR); pd.y = clamp(pd.y, yMin, yMax);
  pd.vx = (pd.x - ox) / dt; pd.vy = (pd.y - oy) / dt;
}
function hit(pd, who) {
  if (S.ghost && S.ghost.who === who) return;          // just nudged loose from this mallet: let it slide away
  var k = S.k, dx = k.x - pd.x, dy = k.y - pd.y, d = Math.hypot(dx, dy), rr = PR + KR;
  if (d >= rr || d < 1e-4) return;
  var nx = dx / d, ny = dy / d;
  k.x = pd.x + nx * rr; k.y = pd.y + ny * rr;
  // never shove the puck through a rail: keep it on the table and back the paddle off instead
  var inMouth = Math.abs(k.x - 180) < GOAL - 4;
  var cx = clamp(k.x, X0 + KR, X1 - KR), cy = inMouth ? k.y : clamp(k.y, Y0 + KR, Y1 - KR);
  if (cx !== k.x || cy !== k.y) {
    if (cx !== k.x) k.vx = -Math.sign(k.x - cx) * Math.abs(k.vx) * 0.5;
    if (cy !== k.y) k.vy = -Math.sign(k.y - cy) * Math.abs(k.vy) * 0.5;
    k.x = cx; k.y = cy; pd.x = k.x - nx * rr; pd.y = k.y - ny * rr;
  }
  var rvx = k.vx - pd.vx, rvy = k.vy - pd.vy, vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    k.vx -= 1.9 * vn * nx; k.vy -= 1.9 * vn * ny;
    var sp = Math.hypot(k.vx, k.vy), mx = maxPuck();
    if (sp > mx) { k.vx *= mx / sp; k.vy *= mx / sp; }
    S.last = who;
    // one click per real hit: nothing while the puck is pinned, and at most one per mallet every 0.15 s
    if (-vn > 60 && S.pinT <= 0 && S.t - S.snd[who] > 0.15) { S.snd[who] = S.t; Shell.tone(who === "me" ? 520 : 400, 0.05, "square", Math.min(0.3, 0.1 - vn / 3000)); Shell.noise(0.04, 0.3, 2000, 1); }
  }
}
function block(pd) {
  var dx = pd.x - S.k.x, dy = pd.y - S.k.y, d = Math.hypot(dx, dy), rr = PR + KR;
  if (d < rr && d > 1e-4) { pd.x = S.k.x + dx / d * rr; pd.y = S.k.y + dy / d * rr; pd.vx = pd.vy = 0; }
}
function stepPuck(dt) {
  var k = S.k;
  var sp = Math.hypot(k.vx, k.vy);
  var drag = 1;
  if (S.x && S.x.sc.id === "rain") for (var pi = 0; pi < S.x.puddles.length; pi++) if (Math.hypot(k.x - S.x.puddles[pi].x, k.y - S.x.puddles[pi].y) < S.x.puddles[pi].r) drag = 3;
  if (sp > 0) { var ns = Math.max(0, sp - (8 + sp * 0.18) * drag * dt); k.vx *= ns / sp; k.vy *= ns / sp; }
  k.x += k.vx * dt; k.y += k.vy * dt;
  if (k.x < X0 + KR) { k.x = X0 + KR; k.vx = Math.abs(k.vx) * 0.92; wall(); }
  if (k.x > X1 - KR) { k.x = X1 - KR; k.vx = -Math.abs(k.vx) * 0.92; wall(); }
  var inMouth = Math.abs(k.x - 180) < GOAL - 4;
  if (k.y < Y0 + KR && !inMouth) { k.y = Y0 + KR; k.vy = Math.abs(k.vy) * 0.92; wall(); }
  if (k.y > Y1 - KR && !inMouth) { k.y = Y1 - KR; k.vy = -Math.abs(k.vy) * 0.92; wall(); }
  if (k.y < Y0 - KR) goal("me");
  else if (k.y > Y1 + KR) goal("cpu");
}
/* Pinned or stuck puck: a mallet pressing it into a rail or corner, or a dead puck in a corner.
   After 0.25 s it gets a nudge toward the middle of the table and the pinning mallet is ignored for a moment. */
function unstick(dt) {
  var k = S.k, rr = PR + KR, e = 1.5;
  if (S.ghost) { S.ghost.t -= dt; if (S.ghost.t <= 0) S.ghost = null; }
  var inMouth = Math.abs(k.x - 180) < GOAL - 4;
  var sideRail = k.x <= X0 + KR + e || k.x >= X1 - KR - e;
  var endRail = !inMouth && (k.y <= Y0 + KR + e || k.y >= Y1 - KR - e);
  var dP = Math.hypot(k.x - S.p.x, k.y - S.p.y), dC = Math.hypot(k.x - S.c.x, k.y - S.c.y);
  var byP = dP < rr + 2, byC = dC < rr + 2;
  var corner = (k.x < X0 + KR + 26 || k.x > X1 - KR - 26) && (k.y < Y0 + KR + 26 || k.y > Y1 - KR - 26);
  var slow = Math.hypot(k.vx, k.vy) < 40;
  var pinned = (sideRail || endRail) && (byP || byC);
  if (pinned || (corner && slow)) {
    S.pinT += dt; S.pinGap = 0;
    if (byC && k.y < MID) S.back = Math.max(S.back, 0.6);     // the CPU backs off a puck it is pinning
  } else if (S.pinT > 0) {
    S.pinGap += dt;
    if (S.pinGap > 0.12) { S.pinT = 0; S.pinGap = 0; }
  }
  if (S.pinT >= 0.25) {
    var dx = 180 - k.x, dy = (MID - k.y) * 0.6, L = Math.hypot(dx, dy) || 1, v = 240;
    k.vx = dx / L * v; k.vy = dy / L * v;
    k.x = clamp(k.x + dx / L * 3, X0 + KR, X1 - KR);
    S.ghost = { who: byC && !byP ? "cpu" : byP && !byC ? "me" : "both", t: 0.3 };
    if (S.ghost.who === "both") { S.ghost = { who: "me", t: 0.3 }; S.back = Math.max(S.back, 0.6); }
    S.pinT = 0; S.pinGap = 0; S.anchor = null;
  }
}
var lastWall = 0;
function wall() { if (S.pinT <= 0 && S.t - lastWall > 0.05) { lastWall = S.t; Shell.tone(220, 0.04, "triangle", 0.12); } }

function goal(who) {
  var o = opp();
  seeGoal(who);                                          // presentation hook: the puck drops into the slot (no effect on play)
  if (who === "me") {
    S.me++; S.goals++;
    Shell.flash("GOAL!", "Bagged and tagged. " + S.me + " to " + S.cpu, "#3ff0ff", 900);
    Shell.sfx("score"); Shell.sfx("crowd");
    burst(180, Y0 + 10, 24, "#3ff0ff");
    if (window.Trophies) Trophies.unlock("trr-goal");
    S.row = (S.row || 0) + 1;                         // goals in a row, for the rewards.js streak pill only
    if (window.NPRewards && S.row >= 2) NPRewards.streak(S.row);
    if (S.x) S.x.fever.hit("He slows down, you speed up");
    S.boost += 0.06;                                  // he gets a little faster every time you score
  } else {
    S.cpu++; S.conceded++; S.row = 0;
    if (S.x) S.x.fever.miss();
    var own = S.last === "me" && S.k.vy > 0;
    Shell.flash(own ? "OWN GOAL" : "HE SCORES", own ? "Restocking fee. " + S.me + " to " + S.cpu : o.name + " scores. " + S.me + " to " + S.cpu, "#ff3fa4", 900);
    Shell.sfx("miss");
    burst(180, Y1 - 10, 18, "#ff3fa4");
    if (own && window.Trophies) Trophies.unlock("trr-own");
    seeAgainst(own);                                   // presentation hook (no effect on play)
  }
  if (who === "me") seeFor();                           // presentation hook (no effect on play)
  S.maxBehind = Math.max(S.maxBehind, S.cpu - S.me);
  if (S.me >= TO_WIN || S.cpu >= TO_WIN) { endMatch(); return; }
  faceoff(who === "me" ? -1 : 1);
}

function endMatch() {
  var won = S.me > S.cpu, margin = S.me - S.cpu, n = S.match;
  if (!won) {
    S.phase = "lost"; S.pt = 0;
    Shell.flash("MATCH OVER", opp().name + " wins " + S.cpu + " to " + S.me + ".", "#ff4b3e", 1200);
    Shell.sfx("buzzer");
    seeMatch(false);                                   // presentation hook (no effect on play)
    return;
  }
  S.wins++; S.bestMargin = Math.max(S.bestMargin, margin);
  if (S.fastest === 0 || S.matchT < S.fastest) S.fastest = S.matchT;
  if (window.Trophies) {
    if (n === 0) Trophies.unlock("trr-boxlot");
    if (n === 1) Trophies.unlock("trr-reseller");
    if (n === 2) Trophies.unlock("trr-purist");
    if (S.cpu === 0) Trophies.unlock("trr-shutout");
    if (S.maxBehind >= 3) Trophies.unlock("trr-comeback");
    if (S.matchT <= 60) Trophies.unlock("trr-fast");
    if (S.wins >= 5) Trophies.unlock("trr-streak5");
  }
  S.match++;
  S.phase = "next"; S.pt = 0;
  Shell.flash("YOU WIN " + S.me + " TO " + S.cpu, "Next opponent: " + opp().name, "#ffd23f", 1500);
  Shell.sfx("best");
  seeMatch(true);                                      // presentation hook (no effect on play)
}

/* ---------------- Batch 3 extras ---------------- */
var EVENTS = [
  { title: "Wrong Case", text: "The puck in the slot came out of the wrong case. Complain to the owner?",
    a: { label: "Complain", run: function () { if (X.coin(0.5)) { faceoff(1); return "He gives you the serve to make it right."; } faceoff(-1); return "He takes it back and serves from his side."; } },
    b: { label: "Play on", run: function () { return "A puck is a puck."; } } },
  { title: "Nostalgia Blindness", text: "Your childhood favorite is on the snack bar shelf. It is not good. You loved it.",
    a: { label: "Buy it", run: function () { S.x.fever.hit("He slows down, you speed up"); return "Pure joy. One step closer to a Hot Streak."; } },
    b: { label: "Resist", run: function () { return "You keep your margin. And your dignity."; } } },
  { title: "Floor Find", text: "There's a dropped cartridge under the table.",
    a: { label: "Grab it", run: function () { return rareNow(); } },
    b: { label: "Leave it", run: function () { return "Somebody else's lucky day."; } } },
  { title: "Battery Dead", text: "The table lights flicker out mid-match.",
    a: { label: "Plug it in", run: function () { faceoff(-1); return "Lights back on. He gets the serve."; } },
    b: { label: "Play dark", run: function () { S.x.dark = 10; return "The table goes dim for a while."; } } },
  { title: "Coffee Spill", text: "Somebody's soda tips over on the rail next to you.",
    a: { label: "Dodge", run: function () { if (X.coin(0.6)) return "Saved your sleeve."; S.x.sticky = 5; return "Sticky paddle. You move slower for 5 seconds."; } },
    b: { label: "Wipe it up", run: function () { faceoff(-1); return "All clean. He serves."; } } }
];
function rareMult() { var sc = S.x.sc.id; return (sc === "suburbs" ? 3 : sc === "fog" ? 1.5 : 1) * (S.x.fever.active() ? 2 : 1); }
function rareNow() {
  var it = X.rollRare(rareMult()), fake = S.x.sc.id === "twilight" && X.coin(0.35);
  X.collect(it, fake);
  if (fake) return "Thin shell, wrong screws. A reproduction.";
  S.x.rares++; return it.n + " (" + X.TIER[it.t].word + ").";
}
function cpuMult() {
  if (!S.x) return 1;
  var id = S.x.sc.id, m = id === "sun" ? 1.08 : id === "suburbs" ? 1.1 : id === "golden" ? 0.9 : 1;
  return S.x.fever.active() ? m * 0.7 : m;
}
function extrasTick(dt) {
  var x = S.x;
  if (!x.intro) { x.intro = true; Shell.flash(x.sc.name, x.sc.line, "#9bff3f", 1500); }
  x.fever.tick(dt);
  if (x.dark > 0) x.dark -= dt;
  if (x.sticky > 0) x.sticky -= dt;
  // an event is due at this faceoff: hold the serve while a goal message or trophy popup is still up, then open the card
  if (S.phase === "face" && S.pt < 0.05 && x.sched.ready(S.t)) {
    if (X.busy() && (x.hold = (x.hold || 0) + dt) < 4) S.pt = 0;
    else { x.hold = 0; if (x.sched.due(S.t)) X.startEvent(X.pick(EVENTS)); }
  }
  if (S.phase === "play" && !x.rare && Math.random() < dt * 0.05 * rareMult()) x.rare = { x: X0 + 50 + Math.random() * (X1 - X0 - 100), y: Y0 + 50 + Math.random() * (MID - Y0 - 90), life: 10, tier: X.rollRare(rareMult()) };
  if (x.rare) {
    x.rare.life -= dt;
    if (S.last === "me" && Math.hypot(S.k.x - x.rare.x, S.k.y - x.rare.y) < KR + 10) {   // knock the puck through it
      var fake = x.sc.id === "twilight" && X.coin(0.35); X.collect(x.rare.tier, fake); if (!fake) x.rares++; x.rare = null;
    } else if (x.rare.life <= 0) x.rare = null;
  }
}

function finish() {
  var score = S.wins * 10 + S.bestMargin;
  ledFinal();                                          // presentation hook (no effect on play)
  Shell.gameOver(score, { title: "TABLE CLOSED", html:
    row("Matches won in a row", S.wins) + row("Best winning margin", S.bestMargin ? "+" + S.bestMargin : "None") +
    row("Lost to", opp().name) + row("Goals for / against", S.goals + " / " + S.conceded) +
    (S.x ? row("Scenery", S.x.sc.name) + row("Rare finds", S.x.rares + " this run, " + X.foundCount() + " of " + X.RARES.length + " found") + row("Hot Streaks", S.x.fever.count) : ""),
    stats: { wins: S.wins, bestMargin: S.bestMargin, goals: S.goals, conceded: S.conceded, fastest: S.fastest ? Math.round(S.fastest) : undefined,   // undefined until a win, so rewards.js skips it (0 would look like a record)
    lastOpponent: S.match } });
}
function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }
// Confetti on the HUD layer, launched from where the table point sits on screen.
function burst(x, y, n, col) {
  if (Shell.reduced) n = Math.ceil(n / 3);
  var p = toScreen(x, y, 8);
  for (var i = 0; i < n; i++) { var a = Math.random() * TAU, s = 40 + Math.random() * 140; parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7, c: i % 2 ? col : "#eceae2" }); }
}

/* ---------------- CPU ---------------- */
function cpuThink(dt) {
  var c = S.c, k = S.k, o = opp();
  if (S.back > 0) {                                     // backing off: head for the goal crease, away from the puck
    S.back -= dt;
    c.tx = 180 + clamp(180 - k.x, -60, 60) * 0.5; c.ty = Y0 + PR + 4; c.nt = 0;
    return;
  }
  var topCorner = k.y < Y0 + KR + 34 && (k.x < X0 + KR + 34 || k.x > X1 - KR - 34) && Math.hypot(k.vx, k.vy) < 160;
  if (topCorner) { c.tx = 180 + (k.x < 180 ? -50 : 50); c.ty = Y0 + 58; c.nt = 0; return; }   // don't dig in a corner; the nudge frees it
  c.nt -= dt;
  if (c.nt > 0) return;
  c.nt = o.think;
  var j = (Math.random() - 0.5) * 2 * o.jitter;
  var limit = Y0 + PR + (MID - Y0 - PR) * o.reach;
  var slow = Math.hypot(k.vx, k.vy) < 160;
  if (k.y < MID + 10 && (k.y < limit + 50 || (slow && k.y < MID - KR))) {
    // line up behind the puck (relative to your goal), then swing through it
    var dx = k.x - (180 + j * 2), dy = k.y - (Y1 + 20), L = Math.hypot(dx, dy) || 1;
    var bx = k.x + dx / L * 32, by = k.y + dy / L * 32;
    if (c.y < k.y - 8 && Math.hypot(c.x - bx, c.y - by) < 28) { c.tx = k.x - dx / L * 44; c.ty = k.y - dy / L * 44; }
    else { c.tx = bx + j * 0.3; c.ty = by; }
  } else {
    c.tx = 180 + (k.x - 180) * o.track + j; c.ty = Y0 + 58;
  }
}

/* ---------------- Update ---------------- */
function update(dt) {
  if (X && X.eventActive()) { X.eventTick(dt); return; }
  S.t += dt; S.pt += dt;
  if (S.x) extrasTick(dt);
  if (X && X.eventActive()) return;
  var i;
  for (i = parts.length - 1; i >= 0; i--) { var q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.life <= 0) parts.splice(i, 1); }
  if (S.phase === "lost") { if (S.pt > 1.3) finish(); return; }
  if (S.phase === "next") {
    if (S.pt > 1.6) { S.me = S.cpu = 0; S.matchT = 0; S.maxBehind = 0; S.boost = 0; faceoff(1); }
    return;
  }
  var mv = { x: (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0), y: (keys.ArrowUp ? -1 : 0) + (keys.ArrowDown ? 1 : 0) };
  if (mv.x || mv.y) { S.p.tx = S.p.x + mv.x * 40; S.p.ty = S.p.y + mv.y * 40; }
  // Fast pointer or touch moves get more physics substeps (about 10 units of mallet travel each) so the puck can't slip through
  var pMax = (mv.x || mv.y) ? 380 : P_FAST, pTravel = Math.min(Math.hypot(S.p.tx - S.p.x, S.p.ty - S.p.y), pMax * dt);
  var o = opp(), n = clamp(Math.ceil(pTravel / 10), 3, 16), sdt = dt / n;
  if (S.phase === "face") { if (S.pt > 0.7) { S.phase = "play"; S.pt = 0; } }
  else {
    S.matchT += dt;
    // a puck that hasn't really gone anywhere for 3 seconds (stuck or pinned) gets a new faceoff
    if (!S.anchor || Math.hypot(S.k.x - S.anchor.x, S.k.y - S.anchor.y) > 40) S.anchor = { x: S.k.x, y: S.k.y, t: 0 };
    S.anchor.t += dt;
    if (S.anchor.t > 3) { S.anchor = null; faceoff(S.k.y > MID ? 1 : -1); }
  }
  cpuThink(dt);
  for (i = 0; i < n; i++) {
    var mine = pMax * (S.x ? (S.x.fever.active() && (mv.x || mv.y) ? 2 : 1) * (S.x.sticky > 0 ? 0.6 : 1) : 1);   // batch 3 extras: Hot Streak, sticky paddle
    movePaddle(S.p, sdt, mine, MID + PR, Y1 - PR);
    movePaddle(S.c, sdt, o.speed * (1 + S.boost) * cpuMult(), Y0 + PR, MID - PR);
    if (S.phase === "play") { stepPuck(sdt); hit(S.p, "me"); hit(S.c, "cpu"); unstick(sdt); }
    else { block(S.p); block(S.c); }   // during the faceoff a paddle can't slide through the waiting puck
    if (S.phase !== "play") break;
  }
}

/* ---------------- Input ----------------
   Same controls as the 2D game. Mouse and pen: the mallet goes straight to the point of the table under
   the pointer, no offset. Touch: relative drag. The mallet moves by the finger's movement from wherever the
   touch starts (x1.2), so the finger can rest low on the screen, below the rink, and never covers the mallet.
   The finger's movement on screen is read through the camera, so the mallet slides along the table the way
   the finger moves over it. */
const P_FAST = 7000, TOUCH_GAIN = 1.2;
let drag = null;
function clampHalfX(x) { return clamp(x, X0 + PR, X1 - PR); }
function clampHalfY(y) { return clamp(y, MID + PR, Y1 - PR); }
function dragTarget(d, x, y) {
  const lx = d.mx + (x - d.fx) * TOUCH_GAIN, ly = d.my + (y - d.fy) * TOUCH_GAIN;
  if (!R || !R.camReady) return { x: lx, y: ly };
  const p = toScreen(d.mx, d.my, 0);
  return toTable(p.x + (x - d.fx) * TOUCH_GAIN, p.y + (y - d.fy) * TOUCH_GAIN, 0) || { x: lx, y: ly };
}
function pointer(type, x, y, e) {
  if (X && X.eventActive()) { drag = null; X.eventPointer(type, x, y); return; }
  const touch = e && e.pointerType === "touch";
  if (!touch) {
    drag = null;
    if (type === "down" || type === "move") {
      const q = R && R.camReady ? toTable(x, y, 10) : { x: x, y: y };
      if (q) { S.p.tx = clampHalfX(q.x); S.p.ty = clampHalfY(q.y); }
    }
    return;
  }
  if (type === "down") { drag = { fx: x, fy: y, mx: S.p.x, my: S.p.y }; return; }
  if (type === "move" && drag) {
    const q = dragTarget(drag, x, y), cx = clampHalfX(q.x), cy = clampHalfY(q.y);
    // re-anchor at the rails so turning back responds at once instead of after the "dead" distance
    if (cx !== q.x || cy !== q.y) { drag.fx = x; drag.fy = y; drag.mx = cx; drag.my = cy; }
    S.p.tx = cx; S.p.ty = cy;
    return;
  }
  if (type === "up" || type === "cancel") drag = null;
}
/* Rink sits at the top of the stage; the empty space under it is a touch pad that drives the mallet too. */
function bindTouchPad() {
  const cv = document.getElementById("np-canvas"), stage = cv && cv.parentElement;
  if (!stage) return;
  stage.style.alignItems = "flex-start";
  stage.style.paddingTop = "4px";
  stage.style.touchAction = "none";
  let pid = null;
  function local(ev) { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) / (r.width / W), y: (ev.clientY - r.top) / (r.height / H) }; }
  function mine(ev) { return ev.target === stage || (ev.target && ev.target.classList && ev.target.classList.contains("np-crt")); }
  stage.addEventListener("pointerdown", function (ev) {
    if (!mine(ev) || ev.pointerType !== "touch" || pid !== null || Shell.state() !== "playing") return;
    ev.preventDefault(); pid = ev.pointerId;
    try { stage.setPointerCapture(ev.pointerId); } catch (er) { /* ignore */ }
    const q = local(ev); pointer("down", q.x, q.y, ev);
  });
  stage.addEventListener("pointermove", function (ev) {
    if (ev.pointerId !== pid) return;
    if (Shell.state() !== "playing") { pid = null; drag = null; return; }
    const q = local(ev); pointer("move", q.x, q.y, ev);
  });
  function end(ev) { if (ev.pointerId !== pid) return; pid = null; pointer("up", 0, 0, ev); }
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);
}
function key(type, code) {
  if (X && X.eventActive()) { for (const kk in keys) keys[kk] = false; X.eventKey(type, code); return; }
  keys[code] = type === "down";
}

/* ---------------- Presentation hooks (called from the rules above; they never change a rule) ---------------- */
function seeGoal(who) {
  const k = S.k;
  V.drop = { x: k.x, y: k.y, vx: k.vx, vy: k.vy, t: 0, far: who === "me", yaw: V.yaw };
  V.flash[who === "me" ? 0 : 1] = 1;
}
function seeFor() {
  V.react = 1.3; V.reactKind = "slump";
  camShake(3, 0.3);
  ledPlay([ledMsg("flash", "GOAL!", 1.5), ledScore("me")]);
  Juke.sfx("goal");
}
function seeAgainst(own) {
  V.react = 1.4; V.reactKind = "cheer";
  ledPlay([ledMsg("blink", own ? "OWN GOAL" : "HE SCORES", 1.5, { color: own ? "violet" : "pink" }), ledScore("cpu")]);
  Juke.sfx(own ? "own" : "against");
}
function seeMatch(won) {
  if (won) {
    ledPlay([ledMsg("cycle", "YOU WIN " + S.me + "-" + S.cpu, 2.2, { keep: true })]);
    Juke.sfx("win");
  } else {
    ledPlay([ledMsg("blink", "MATCH OVER", 2.4, { color: "red", keep: true })]);
    Juke.sfx("lose");
  }
}

/* ---------------- Music: the house band, on its own ----------------
   startMusic(ctx, dest) plays the game's original loop: sixteen bars in A minor at 136 BPM (square lead with a
   dotted-eighth echo, bouncing saw bass, a triangle arpeggio, chord stabs in the second half, drums), all made in
   code with the Web Audio API, no audio files. It schedules into any AudioContext you hand it (an
   OfflineAudioContext gets the whole loop at once) and plays into "dest", any AudioNode. It knows nothing about
   the game, so the arcade radio can call it as it is. It returns stop(fadeSeconds), which fades it out and lets go
   of every node it made. */
function startMusic(ctx, dest) {
  const BPM = 136, STEP = 60 / BPM / 4, STEPS = 256, VOL = 0.16, AHEAD = 0.8;
  // bass note, then the three notes the arpeggio walks (MIDI numbers)
  const CHORDS = { Am: [33, 57, 60, 64], F: [41, 57, 60, 65], C: [36, 55, 60, 64], G: [43, 55, 59, 62], E: [40, 56, 59, 64], Em: [40, 55, 59, 64] };
  // one chord per half bar
  const PROG = "Am Am F F C C G G Am Am F F C C E E F F G G Em Em Am Am F F G G Am F E E".split(" ");
  // the tune, a bar a line: step in the bar, note, length in steps
  const BARS = [
    "0A4-2 2C5-2 4E5-3 7D5-1 8E5-2 10A5-4 14G5-2", "0F5-3 3E5-1 4C5-2 6A4-2 8C5-4 12F5-2 14E5-2",
    "0E5-2 2G5-2 4C6-3 7B5-1 8G5-2 10E5-2 12G5-4", "0D5-3 3B4-1 4D5-2 6G5-2 8B5-6 14A5-2",
    "0A5-2 2E5-2 4A5-2 6C6-2 8B5-2 10A5-2 12E5-4", "0F5-2 2A5-2 4C6-4 8A5-2 10F5-2 12C5-4",
    "0E5-2 2G5-2 4E5-2 6C5-2 8D5-2 10E5-2 12G5-4", "0G#5-4 4B5-4 8E5-3 11G#5-1 12B5-4",
    "0C6-3 3A5-1 4F5-2 6A5-2 8C6-4 12D6-4", "0B5-3 3G5-1 4D5-2 6G5-2 8B5-4 12D6-4",
    "0E6-4 4B5-2 6G5-2 8E5-4 12G5-2 14B5-2", "0A5-6 6G5-1 7E5-1 8C5-4 12E5-4",
    "0A5-2 2C6-2 4A5-2 6F5-2 8A5-2 10C6-2 12F6-4", "0G5-2 2B5-2 4D6-2 6B5-2 8G5-2 10D6-2 12G6-4",
    "0E6-3 3C6-1 4A5-4 8F5-2 10A5-2 12C6-4", "0B5-2 2G#5-2 4E5-2 6G#5-2 8B5-4 12E6-2 14D6-2"
  ];
  const LEAD = new Array(STEPS).fill(null), semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  BARS.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(#?)(\d)-(\d+)$/.exec(tok);
      if (m) LEAD[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + semis[m[2]] + (m[3] ? 1 : 0), Number(m[5])];
    });
  });
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  let seed = 0x1F2E3D4C;
  function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }

  // the band's own little mixer: everything it makes hangs off "bus", so stop() only has to fade and drop that
  const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(dest);
  function filter(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const lead = filter("lowpass", 3400, 0.7, bus), bass = filter("lowpass", 820, 1.3, bus), stab = filter("bandpass", 1500, 0.9, bus);
  const send = ctx.createGain(), echo = ctx.createDelay(1), back = ctx.createGain(), damp = filter("lowpass", 2400, 0.7, bus);
  send.gain.value = 0.28; echo.delayTime.value = STEP * 3; back.gain.value = 0.3;      // a dotted-eighth echo on the lead
  lead.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(damp);
  const len = Math.floor(ctx.sampleRate * 2), noise = ctx.createBuffer(1, len, ctx.sampleRate), nd = noise.getChannelData(0);
  for (let i = 0; i < len; i++) nd[i] = rnd() * 2 - 1;

  function osc(to, type, f0, t, dur, vol, f1, hold) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.55 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(to, t, dur, vol, type, f0, q) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(to); s.start(t, rnd() * 1.5); s.stop(t + dur + 0.05);
  }
  // everything that sounds on sixteenth-note i of the loop, starting at time t
  function playStep(i, t) {
    const bar = i >> 4, s = i & 15, ch = CHORDS[PROG[i >> 3]], second = bar >= 8, n = LEAD[i];
    if (n) osc(lead, "square", mtof(n[0]), t, n[1] * STEP * 0.92, 0.19);
    if (!(s & 1)) {
      const k = s >> 1;                                     // eighth notes: bouncing octave bass, a walking arpeggio, hats
      osc(bass, "sawtooth", mtof(ch[0] + (k & 1 ? 12 : 0)), t, STEP * 1.7, 0.3);
      osc(bus, "triangle", mtof(ch[1 + [0, 1, 2, 1][k & 3]] + 12), t, STEP * 1.4, 0.07);
      hiss(bus, t, s === 14 ? 0.14 : 0.04, s % 4 === 2 ? 0.1 : 0.055, "highpass", 7200, 0.7);
    }
    if (second && (s === 2 || s === 6 || s === 10 || s === 14)) for (let j = 1; j < 4; j++) osc(stab, "square", mtof(ch[j]), t, STEP * 0.9, 0.045, 0, 0.3);
    const fill = bar === 7 ? s >= 12 : bar === 15 ? s >= 8 && (s % 2 === 0 || s >= 12) : false;
    if (fill || s === 4 || s === 12) {
      const v = fill ? 0.55 + 0.45 * (s - 8) / 7 : 1;
      hiss(bus, t, 0.13, 0.32 * v, "bandpass", 2000, 0.6);
      osc(bus, "triangle", 210, t, 0.07, 0.2 * v, 140, 0.1);
    }
    if (second ? s % 4 === 0 : s === 0 || s === 8 || s === 11) osc(bus, "sine", 150, t, 0.16, 0.62, 42, 0.08);
  }

  let step = 0, nextT = ctx.currentTime + 0.06, timer = 0, stopped = false;
  const offline = typeof OfflineAudioContext !== "undefined" && ctx instanceof OfflineAudioContext;
  if (offline) {                                            // a render: lay the whole loop down at once
    bus.gain.value = VOL;
    for (let i = 0; i < STEPS; i++) playStep(i, nextT + i * STEP);
  } else {
    bus.gain.setValueAtTime(0, ctx.currentTime);
    bus.gain.setTargetAtTime(VOL, nextT - 0.02, 0.015);
    const feed = function () {
      if (stopped) return;
      const now = ctx.currentTime;
      if (nextT < now) nextT = now + 0.03;                  // only after a stall longer than the queue
      while (nextT < now + AHEAD) { playStep(step, nextT); step = (step + 1) % STEPS; nextT += STEP; }
    };
    feed();
    timer = setInterval(feed, 100);
  }
  return function stop(fade) {
    if (stopped) return;
    stopped = true;
    if (timer) clearInterval(timer);
    const now = ctx.currentTime, f = Math.max(0.01, fade == null ? 0.12 : fade);
    try { bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(bus.gain.value, now); bus.gain.linearRampToValueAtTime(0, now + f); } catch (e) { /* closed context */ }
    setTimeout(function () { try { bus.disconnect(); } catch (e) { /* already gone */ } }, (f + AHEAD + 0.3) * 1000);
  };
}

/* ---------------- Sound: the stingers, the mute button and the music switch ----------------
   The shell still plays every sound effect the 2D game had, exactly when it did. On top of that the game brings a
   handful of stingers for goals and matches, and runs the house band (startMusic above) while a game is on.
   Nothing is created until the first tap, click or key press. Everything goes quiet with the shell's mute button
   (the same "npArcade.muted" setting), and the band has its own MUSIC: ON / OFF button (remembered as
   "npArcade.music"). It rolls none of the game's dice. */
const SFX_VOL = 0.2;                                       // turn the stingers up and down here (the band's level is in startMusic)
const MUSIC_KEY = "npArcade.music";
function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
// The picture's own dice (sparkle on the board, the hiss in the stingers), so the rules see the random numbers the 2D game would.
const vrand = (function () { let s = 0x2545F491; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; })();

const Juke = (function () {
  let live = null, dead = false, muted = false, stopBand = null, waitBand = 0, fresh = true;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  const buttons = [];

  // Everything between the stingers (and the band) and the speaker.
  function rig(c) {
    const A = { c: c };
    A.out = c.createGain();                                 // follows the mute button
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    A.out.connect(comp); comp.connect(c.destination);
    A.duck = c.createGain();                                // the band plays into this; it steps back under the big stingers
    A.duck.connect(A.out);
    A.sfx = c.createGain(); A.sfx.gain.value = SFX_VOL; A.sfx.connect(A.out);
    const len = Math.floor(c.sampleRate * 2);
    A.noise = c.createBuffer(1, len, c.sampleRate);
    const d = A.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = vrand() * 2 - 1;
    return A;
  }
  // One note: a quick attack, held for part of its length, then it dies away. f1 slides the pitch.
  function osc(A, dest, type, f0, t, dur, vol, f1, hold) {
    const o = A.c.createOscillator(), g = A.c.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.55 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.03);
  }
  // A burst of filtered noise: the slap of the puck into the slot.
  function hiss(A, dest, t, dur, vol, type, f0, q) {
    const s = A.c.createBufferSource(), f = A.c.createBiquadFilter(), g = A.c.createGain();
    s.buffer = A.noise; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, vrand() * 1.5); s.stop(t + dur + 0.05);
  }
  function duck(A, t, secs) {
    A.duck.gain.cancelScheduledValues(t);
    A.duck.gain.setTargetAtTime(0.45, t, 0.03);
    A.duck.gain.setTargetAtTime(1, t + secs, 0.25);
  }
  // The stingers.
  function cue(A, name, t) {
    const d = A.sfx;
    if (name === "goal") {                                  // your goal: the slap into the slot, a goal horn, a run up the chord
      hiss(A, d, t, 0.09, 0.5, "bandpass", 900, 0.8);
      [45, 49, 52].forEach(function (m) { osc(A, d, "sawtooth", mtof(m), t + 0.05, 1.0, 0.13, 0, 0.75); osc(A, d, "sawtooth", mtof(m) * 1.006, t + 0.05, 1.0, 0.08, 0, 0.75); });
      [69, 73, 76, 81, 85, 88].forEach(function (m, i) { osc(A, d, "square", mtof(m), t + 0.12 + i * 0.06, 0.1, 0.2, 0, 0.5); });
      osc(A, d, "triangle", mtof(88), t + 0.5, 0.6, 0.2, 0, 0.3);
      duck(A, t, 1.3);
    } else if (name === "against") {                        // his goal: the slap, then a sad slide
      hiss(A, d, t, 0.09, 0.45, "bandpass", 700, 0.8);
      osc(A, d, "triangle", 330, t + 0.06, 0.45, 0.32, 110, 0.4);
    } else if (name === "own") {                            // own goal: two drooping notes
      osc(A, d, "square", 392, t, 0.22, 0.2, 360, 0.6); osc(A, d, "square", 311, t + 0.24, 0.42, 0.2, 262, 0.6);
    } else if (name === "win") {                            // match won: a fanfare and a held chord
      [57, 61, 64, 69, 64, 69, 73].forEach(function (m, i) { osc(A, d, "square", mtof(m + 12), t + i * 0.08, 0.12, 0.22, 0, 0.5); });
      [69, 73, 76].forEach(function (m) { osc(A, d, "triangle", mtof(m + 12), t + 0.58, 0.9, 0.18, 0, 0.4); });
      duck(A, t, 1.6);
    } else if (name === "lose") {                           // match lost: down the minor scale and a low buzz
      [76, 72, 69, 64].forEach(function (m, i) { osc(A, d, "triangle", mtof(m), t + i * 0.12, 0.2, 0.26, 0, 0.5); });
      osc(A, d, "sawtooth", 82, t + 0.5, 0.7, 0.18, 70, 0.6);
      duck(A, t, 1.4);
    } else if (name === "hot") {                            // Hot Streak: a power-up slide and two blips
      osc(A, d, "square", 330, t, 0.3, 0.2, 1320, 0.8);
      osc(A, d, "square", 1320, t + 0.32, 0.07, 0.22, 0, 0.5); osc(A, d, "square", 1760, t + 0.4, 0.16, 0.22, 0, 0.5);
    } else if (name === "rare") {                           // rare find: a little bell
      osc(A, d, "sine", 1568, t, 0.5, 0.22, 0, 0.05); osc(A, d, "sine", 2349, t + 0.06, 0.6, 0.16, 0, 0.05);
    } else if (name === "face") {                           // a new collector steps up: two quick whistle chirps
      osc(A, d, "sine", 2300, t, 0.09, 0.14, 2500, 0.6); osc(A, d, "sine", 2300, t + 0.13, 0.2, 0.14, 2600, 0.6);
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
        setInterval(pump, 150);                             // follows the mute button even while the picture is paused
      }
      if (live.c.state !== "running") { const p = live.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { live = null; dead = true; }
  }
  // Called every frame: follow the mute button, and keep the band playing exactly while a game is on.
  function pump() {
    const A = live;
    if (!A || !window.Shell) return;
    const c = A.c, now = c.currentTime, m = shellMuted();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, now, 0.02); }
    const want = musicOn && !muted && c.state === "running" && Shell.state() === "playing";
    if (want && !stopBand && !waitBand) {
      // a fresh game lets the shell's start jingle go first
      const go = function () { waitBand = 0; if (!stopBand && musicOn && !muted && Shell.state() === "playing") stopBand = startMusic(c, A.duck); };
      if (fresh) waitBand = setTimeout(go, 360); else go();
      fresh = false;
    } else if (!want) {
      if (waitBand) { clearTimeout(waitBand); waitBand = 0; }
      if (stopBand) { stopBand(0.15); stopBand = null; }
    }
  }
  function sfx(name, delay) {
    const A = live;
    if (!A || muted || A.c.state !== "running") return;
    try { cue(A, name, A.c.currentTime + 0.01 + (delay || 0)); } catch (e) { /* sound is never worth a crash */ }
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
    newGame: function () { unlock(); fresh = true; if (stopBand) { stopBand(0.05); stopBand = null; } if (waitBand) { clearTimeout(waitBand); waitBand = 0; } pump(); },
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    // for checks: what the engine is doing right now, and the stingers played into any audio context
    peek: function () { return { made: !!live, state: live ? live.c.state : "none", band: !!stopBand, muted: muted, musicOn: musicOn }; },
    cueInto: function (c, name, t) { const A = rig(c); cue(A, name, t); return A; }
  };
})();

/* =====================================================================================
   3D presentation
   ===================================================================================== */

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

/* ---------------- Painted textures (all drawn here, no image files besides the wordmark) ---------------- */

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every decal in the rec room uses this
// (the full logo with the mascot is kept for the splash and the score card). If the PNG is missing,
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

// The playing surface, painted once corner to corner: bright ice with rink markings, the wordmark printed
// under the lacquer on each half, and a grid of air holes over everything. Canvas x runs across the table,
// canvas y runs from your opponent's end (top) to yours (bottom).
function iceCanvas(script) {
  const k = 1024 / (X1 - X0), CW = 1024, CH = Math.round((Y1 - Y0) * k);
  const c = mkCanvas(CW, CH), g = c.getContext("2d"), rnd = rng(5);
  const PX = function (x) { return (x - X0) * k; }, PY = function (y) { return (y - Y0) * k; };
  const bg = g.createLinearGradient(0, 0, CW, 0);
  bg.addColorStop(0, "#d6e6fb"); bg.addColorStop(0.5, "#f6faff"); bg.addColorStop(1, "#d6e6fb");
  g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
  for (let i = 0; i < 900; i++) {                           // skate scuffs, very faint
    const x = rnd() * CW, y = rnd() * CH, a = rnd() * TAU, l = 6 + rnd() * 26;
    g.strokeStyle = "rgba(120,160,215," + (0.05 + rnd() * 0.06) + ")"; g.lineWidth = 1 + rnd();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // the wordmark under the ice, once on each half, facing you
  g.save(); g.globalAlpha = 0.62;
  drawScript(g, script, PX(180), PY(MID - 132), 196 * k, 84 * k);
  drawScript(g, script, PX(180), PY(MID + 136), 196 * k, 84 * k);
  g.restore();
  // goal creases
  [[Y0, "#ff3fa4", 0, Math.PI], [Y1, "#18c8e8", Math.PI, TAU]].forEach(function (cz) {
    g.beginPath(); g.moveTo(PX(180 - 70), PY(cz[0])); g.arc(PX(180), PY(cz[0]), 70 * k, cz[2], cz[3]); g.closePath();
    g.fillStyle = cz[1] === "#ff3fa4" ? "rgba(255,63,164,.16)" : "rgba(24,200,232,.18)"; g.fill();
    g.beginPath(); g.arc(PX(180), PY(cz[0]), 70 * k, cz[2], cz[3]);
    g.lineWidth = 2.6 * k; g.strokeStyle = cz[1]; g.stroke();
  });
  // blue lines
  g.fillStyle = "rgba(34,96,224,.85)";
  [MID - 112, MID + 112].forEach(function (y) { g.fillRect(0, PY(y) - 3 * k, CW, 6 * k); });
  // faceoff circles where the puck is served, and the center
  g.lineWidth = 1.6 * k; g.strokeStyle = "#e3231a";
  [MID - 70, MID + 70].forEach(function (y) {
    g.beginPath(); g.arc(PX(180), PY(y), 28 * k, 0, TAU); g.stroke();
    g.fillStyle = "#e3231a"; g.beginPath(); g.arc(PX(180), PY(y), 5 * k, 0, TAU); g.fill();
  });
  g.fillStyle = "#e3231a"; g.fillRect(0, PY(MID) - 2.4 * k, CW, 4.8 * k);
  g.fillStyle = "rgba(255,255,255,.55)";
  for (let x = 6; x < X1 - X0; x += 18) g.fillRect(x * k, PY(MID) - 0.8 * k, 8 * k, 1.6 * k);
  g.lineWidth = 2.4 * k; g.strokeStyle = "#e3231a"; g.beginPath(); g.arc(PX(180), PY(MID), 42 * k, 0, TAU); g.stroke();
  g.fillStyle = "#2260e0"; g.beginPath(); g.arc(PX(180), PY(MID), 5 * k, 0, TAU); g.fill();
  // air holes
  for (let y = 6; y < Y1 - Y0; y += 12) for (let x = 6; x < X1 - X0; x += 12) {
    g.fillStyle = "rgba(40,70,120,.42)"; g.beginPath(); g.arc(x * k, y * k, 0.95 * k, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,.7)"; g.beginPath(); g.arc(x * k + 0.6 * k, y * k + 0.7 * k, 0.5 * k, 0, TAU); g.fill();
  }
  return c;
}

// The top of the puck: a red disc with a cream ring and the wordmark in the middle.
function puckCanvas(script) {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  g.fillStyle = "#f4efdf"; g.fillRect(0, 0, 256, 256);
  const gr = g.createRadialGradient(110, 100, 10, 128, 128, 112);
  gr.addColorStop(0, "#ff5a48"); gr.addColorStop(1, "#c4170e");
  g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 104, 0, TAU); g.fill();
  g.lineWidth = 8; g.strokeStyle = "#ffe45c"; g.beginPath(); g.arc(128, 128, 88, 0, TAU); g.stroke();
  drawScript(g, script, 128, 128, 150, 70);
  return c;
}

/* ---------------- The collector's clothes, painted ----------------
   Every piece wraps around a lathe-turned body part: u runs around it with the front at u = .5 (canvas middle),
   v runs up it. Folds are painted as soft dark and light creases on top of the shapes the geometry already has. */
// A soft crease: one path laid down wide and faint, then narrower and stronger.
function crease(g, pts, w, col, alpha) {
  g.save(); g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = col;
  for (let k = 3; k >= 1; k--) {
    g.globalAlpha = alpha * (0.3 + (3 - k) * 0.35); g.lineWidth = w * k;
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let i = 2; i + 3 < pts.length; i += 4) g.quadraticCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
    g.stroke();
  }
  g.restore();
}
function clothBase(g, w, h, L, rnd) {
  g.fillStyle = L.shirt; g.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h / 90; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.05)"; g.fillRect(rnd() * w, rnd() * h, 2, 2); }   // the knit
  if (L.kind === "polo") { g.fillStyle = "rgba(20,40,110,.16)"; for (let y = 8; y < h; y += h / 14) g.fillRect(0, y, w, h / 40); }
  if (L.kind === "aloha") {                                // a loud flea market print
    const n = Math.round(w * h / 3600);
    for (let i = 0; i < n; i++) {
      const x = rnd() * w, y = rnd() * h, r = (7 + rnd() * 9) * w / 512, col = ["#ffe45c", "#ff7ac6", "#ffffff", "#ff9214"][i % 4];
      g.fillStyle = "rgba(10,90,60,.55)"; g.beginPath(); g.ellipse(x + r, y + r * 0.6, r * 0.9, r * 0.3, 0.6, 0, TAU); g.fill();
      for (let p = 0; p < 5; p++) { const a = p / 5 * TAU; g.fillStyle = col; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.5, r * 0.32, a, 0, TAU); g.fill(); }
      g.fillStyle = "#7a3a12"; g.beginPath(); g.arc(x, y, r * 0.22, 0, TAU); g.fill();
    }
  }
}
// Where height y (feet) sits on a lathe's v, as a canvas row.
function profileRow(prof, y, h) {
  for (let i = 1; i < prof.length; i++) if (y <= prof[i][1]) { const f = (y - prof[i - 1][1]) / (prof[i][1] - prof[i - 1][1]); return (1 - (i - 1 + f) / (prof.length - 1)) * h; }
  return 0;
}
// The shirt body. The wordmark sits big on the chest so it reads at phone size, smaller across the back.
function shirtCanvas(script, L) {
  const w = 1024, h = 512, c = mkCanvas(w, h), g = c.getContext("2d"), rnd = rng(L.shirt.length * 7 + L.kind.length);
  clothBase(g, w, h, L, rnd);
  const dark = L.shirt === "#23252f" ? "#000000" : "#000000", light = "#ffffff";
  const chest = profileRow(BODY.torso, 1.42, h), waist = profileRow(BODY.torso, 0.35, h), pit = profileRow(BODY.torso, 1.66, h);
  // folds: from under each arm down and in toward the belt, front and back
  [256, 768].forEach(function (side, k) {
    const sg = k ? 1 : -1;
    for (let j = 0; j < 3; j++) {
      const off = j * 26;
      crease(g, [side + sg * (8 + off), pit + off * 0.6, side - sg * (40 - off), (pit + waist) / 2, side - sg * (120 - off * 0.5), waist + 20 + off], 5, dark, 0.13);
      crease(g, [side + sg * (18 + off), pit + off * 0.6 - 4, side - sg * (30 - off), (pit + waist) / 2 - 6, side - sg * (110 - off * 0.5), waist + 12 + off], 3, light, 0.08);
    }
  });
  // the hem bunches up over the belt
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w, y = h - 20 - rnd() * 70, l = 30 + rnd() * 60;
    crease(g, [x, y, x + l * 0.5, y - 10 - rnd() * 10, x + l, y + 4], 4, dark, 0.12);
    crease(g, [x + 4, y - 6, x + l * 0.5 + 4, y - 16, x + l + 4, y - 2], 2, light, 0.08);
  }
  // collar: ribbed band round the neck (a placket and buttons on the polo)
  g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, 0, w, 22);
  g.fillStyle = "rgba(255,255,255,.12)"; for (let x = 0; x < w; x += 6) g.fillRect(x, 0, 2, 22);
  if (L.kind === "polo") {
    g.fillStyle = "rgba(20,40,110,.35)"; g.fillRect(500, 18, 4, 90); g.fillRect(520, 18, 4, 90);
    g.fillStyle = "#fbfaf4"; [44, 76].forEach(function (y) { g.beginPath(); g.arc(512, y, 6, 0, TAU); g.fill(); });
  }
  // light from above, a little shade toward the hem
  const sh = g.createLinearGradient(0, 0, 0, h);
  sh.addColorStop(0, "rgba(255,255,255,.1)"); sh.addColorStop(0.6, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,40,.18)");
  g.fillStyle = sh; g.fillRect(0, 0, w, h);
  // the logo: a navy plate keeps it readable on any shirt color or print
  g.fillStyle = "rgba(8,32,95,.82)"; rrectPath(g, 512 - 214, chest - 92, 428, 172, 34); g.fill();
  g.lineWidth = 5; g.strokeStyle = "rgba(255,228,92,.9)"; g.stroke();
  drawScript(g, script, 512, chest - 6, 392, 152);
  [0, 1024].forEach(function (x) { drawScript(g, script, x, chest - 20, 260, 100); });
  return c;
}
// A short sleeve: same cloth, radial folds, a stitched hem.
function sleeveCanvas(L) {
  const w = 256, h = 256, c = mkCanvas(w, h), g = c.getContext("2d"), rnd = rng(L.shirt.length * 3 + 1);
  clothBase(g, w, h, L, rnd);
  for (let i = 0; i < 9; i++) { const x = i * 29 + rnd() * 10; crease(g, [x, 30, x + 8, 120, x - 6, 240], 4, "#000000", 0.12); crease(g, [x + 7, 30, x + 15, 120, x + 1, 240], 2, "#ffffff", 0.08); }
  g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(0, 0, w, 26);
  g.fillStyle = "rgba(255,255,255,.4)"; for (let x = 0; x < w; x += 10) g.fillRect(x, 30, 6, 2);
  return c;
}
// Trousers: denim (weave, fading down the front of each leg, orange side seams) or plain twill, with creases where the knee bends and where the hem breaks over the shoe.
function pantsCanvas(L) {
  const w = 256, h = 512, c = mkCanvas(w, h), g = c.getContext("2d"), rnd = rng(L.pants.length * 11);
  g.fillStyle = L.pants; g.fillRect(0, 0, w, h);
  if (L.jeans) {
    for (let y = -w; y < h; y += 3) { g.strokeStyle = "rgba(255,255,255,.05)"; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w * 0.5); g.stroke(); }
    const f = g.createLinearGradient(0, 0, w, 0);
    f.addColorStop(0.25, "rgba(255,255,255,0)"); f.addColorStop(0.5, "rgba(200,220,255,.2)"); f.addColorStop(0.75, "rgba(255,255,255,0)");
    g.fillStyle = f; g.fillRect(0, 0, w, h);
  } else for (let i = 0; i < 1500; i++) { g.fillStyle = "rgba(0,0,0,.05)"; g.fillRect(rnd() * w, rnd() * h, 3, 1); }
  [64, 192].forEach(function (x) {
    g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(x - 2, 0, 4, h);
    if (L.jeans) { g.fillStyle = "#e0902a"; for (let y = 0; y < h; y += 12) g.fillRect(x + 3, y, 2, 7); }
  });
  for (let i = 0; i < 7; i++) {                            // knee creases (top and bottom of the canvas are the knee on thigh and shin)
    const x = 70 + rnd() * 116, y = 14 + rnd() * 50;
    crease(g, [x - 30, y, x, y + 10, x + 30, y - 2], 4, "#000000", 0.18); crease(g, [x - 26, y - 6, x + 2, y + 2, x + 30, y - 8], 2, "#ffffff", 0.1);
    const y2 = h - 14 - rnd() * 50;
    crease(g, [x - 30, y2, x, y2 - 10, x + 30, y2 + 2], 4, "#000000", 0.16);
  }
  return c;
}
// The cap crown: six panels and a two-letter monogram on the front.
function capCanvas(L) {
  const w = 512, h = 256, c = mkCanvas(w, h), g = c.getContext("2d");
  g.fillStyle = L.cap || "#333"; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 6; k++) { g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(k * w / 6 + w / 12 - 2, 0, 4, h); }
  const sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0, "rgba(255,255,255,.2)"); sh.addColorStop(1, "rgba(0,0,0,.15)");
  g.fillStyle = sh; g.fillRect(0, 0, w, h);
  g.font = "900 92px " + HUD_FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = 14; g.strokeStyle = "#08205f"; g.strokeText("NP", 128, 168);
  g.fillStyle = L.capInk || "#ffffff"; g.fillText("NP", 128, 168);
  return c;
}
// A sneaker upper: laces up the front, a star and a stripe on each side, a heel tab. An original design.
function shoeCanvas(L) {
  const w = 256, h = 128, c = mkCanvas(w, h), g = c.getContext("2d");
  g.fillStyle = L.shoe; g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(0,0,0,.1)"; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
  g.fillStyle = "#f4f4f4"; g.fillRect(44, 22, 40, 44);                       // tongue and laces at the front (u = .25)
  g.strokeStyle = "#9aa0aa"; g.lineWidth = 3;
  for (let y = 26; y < 64; y += 9) { g.beginPath(); g.moveTo(46, y); g.lineTo(82, y + 6); g.moveTo(82, y); g.lineTo(46, y + 6); g.stroke(); }
  [0, 128, 256].forEach(function (x) {                                      // the sides (u = 0 and .5)
    g.fillStyle = L.shoeInk; g.fillRect(x - 40, 70, 80, 9);
    g.save(); g.translate(x, 50); g.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 16, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fillStyle = L.shoeInk; g.fill(); g.lineWidth = 2; g.strokeStyle = "rgba(0,0,0,.35)"; g.stroke(); g.restore();
  });
  g.fillStyle = L.shoeInk; g.fillRect(184, 20, 16, 40);                      // heel tab (u = .75)
  return c;
}

// The game room carpet: bright blue with the kind of confetti every arcade floor had. One tile is 220 units.
function carpetCanvas() {
  const S2 = 512, c = mkCanvas(S2, S2), g = c.getContext("2d"), rnd = rng(41);
  g.fillStyle = "#1a48b6"; g.fillRect(0, 0, S2, S2);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.035)" : "rgba(0,10,60,.06)";
    g.fillRect(rnd() * S2, rnd() * S2, 2, 2);
  }
  const cols = ["#ff9214", "#ffd21f", "#ff5aa8", "#3fe0ff", "#8a6bff", "#58d94a"];
  g.lineCap = "round"; g.lineJoin = "round";
  for (let i = 0; i < 34; i++) {
    const x = rnd() * S2, y = rnd() * S2, a = rnd() * TAU, kind = i % 4, col = cols[i % cols.length], sz = 12 + rnd() * 12;
    for (let ox = -S2; ox <= S2; ox += S2) for (let oy = -S2; oy <= S2; oy += S2) {   // wrapped, so the tile repeats cleanly
      g.save(); g.translate(x + ox, y + oy); g.rotate(a);
      g.globalAlpha = 0.62; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 4;
      if (kind === 0) {
        g.beginPath(); g.moveTo(-sz * 1.6, 0);
        for (let k = 0; k < 4; k++) g.quadraticCurveTo(-sz * 1.6 + (k + 0.5) * sz * 0.8, k % 2 ? sz * 0.6 : -sz * 0.6, -sz * 1.6 + (k + 1) * sz * 0.8, 0);
        g.stroke();
      } else if (kind === 1) {
        g.beginPath(); g.moveTo(0, -sz * 0.7); g.lineTo(sz * 0.65, sz * 0.5); g.lineTo(-sz * 0.65, sz * 0.5); g.closePath(); g.stroke();
      } else if (kind === 2) {
        g.beginPath(); g.arc(0, 0, sz * 0.3, 0, TAU); g.fill();
      } else {
        g.beginPath(); g.moveTo(-sz, sz * 0.3); g.lineTo(-sz * 0.5, -sz * 0.3); g.lineTo(0, sz * 0.3); g.lineTo(sz * 0.5, -sz * 0.3); g.lineTo(sz, sz * 0.3); g.stroke();
      }
      g.restore();
    }
  }
  return c;
}

// Basement wood paneling: one tile is four grooved boards.
function panelCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(13);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = "hsl(" + (24 + rnd() * 6) + "," + (42 + rnd() * 10) + "%," + (26 + rnd() * 6) + "%)";
    g.fillRect(i * 64, 0, 64, 256);
    for (let k = 0; k < 14; k++) { g.fillStyle = "rgba(20,8,0," + (0.08 + rnd() * 0.12) + ")"; g.fillRect(i * 64 + rnd() * 64, 0, 1 + rnd() * 2, 256); }
    for (let k = 0; k < 4; k++) { g.fillStyle = "rgba(255,210,160," + (0.05 + rnd() * 0.06) + ")"; g.fillRect(i * 64 + rnd() * 64, 0, 2, 256); }
    g.fillStyle = "rgba(10,4,0,.7)"; g.fillRect(i * 64, 0, 3, 256);
  }
  return c;
}

// The marquee sign on the wall: wordmark on the left, the game on the right. Same marquee as the lanes.
function signCanvas(script) {
  const c = mkCanvas(1024, 300), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 300);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 300);
  const gl = g.createLinearGradient(0, 0, 0, 140);
  gl.addColorStop(0, "rgba(255,255,255,.42)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.beginPath(); g.ellipse(512, -20, 620, 160, 0, 0, TAU); g.fill();
  g.lineWidth = 16; g.strokeStyle = "#ff9214"; g.strokeRect(8, 8, 1008, 284);
  g.lineWidth = 4; g.strokeStyle = "#ffe45c"; g.strokeRect(19, 19, 986, 262);
  drawScript(g, script, 330, 150, 560, 232);
  candyText(g, "TABLE RINK", 806, 112, 76, 340);
  candyText(g, "RUMBLE", 806, 204, 92, 340);
  return c;
}

// A game box lid for the shelf on the wall: loud color, wordmark plate in the middle.
function boxCanvas(col, script) {
  const cw = 200, ch = 280, c = mkCanvas(cw, ch), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, shade(col, 0.22)); bg.addColorStop(1, shade(col, -0.18));
  g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
  g.save(); g.globalAlpha = 0.16; g.fillStyle = "#ffffff";
  for (let x = -ch; x < cw; x += 30) { g.beginPath(); g.moveTo(x, ch); g.lineTo(x + ch, 0); g.lineTo(x + ch + 12, 0); g.lineTo(x + 12, ch); g.closePath(); g.fill(); }
  g.restore();
  g.lineWidth = 6; g.strokeStyle = shade(col, -0.4); g.strokeRect(3, 3, cw - 6, ch - 6);
  rrectPath(g, 18, 92, cw - 36, 96, 18); g.fillStyle = "#0d1f5c"; g.fill();
  g.lineWidth = 3; g.strokeStyle = "#fff3cf"; g.stroke();
  drawScript(g, script, cw / 2, 140, cw - 56, 80);
  return c;
}

// The side of a cardboard box lot, priced in marker.
function crateCanvas() {
  const c = mkCanvas(256, 160), g = c.getContext("2d"), rnd = rng(29);
  g.fillStyle = "#c79a5e"; g.fillRect(0, 0, 256, 160);
  for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(120,80,30," + (0.05 + rnd() * 0.08) + ")"; g.fillRect(0, rnd() * 160, 256, 1 + rnd() * 2); }
  g.fillStyle = "rgba(255,240,200,.25)"; g.fillRect(0, 70, 256, 18);
  g.fillStyle = "#d8b07a"; g.fillRect(0, 74, 256, 10);
  g.save(); g.translate(128, 82); g.rotate(-0.06);
  g.font = 'bold 44px "Comic Sans MS", "Marker Felt", "Trebuchet MS", sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#16171d"; g.fillText("BOX LOT $5", 0, 0);
  g.restore();
  return c;
}

function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(10,20,50,.8)"); gr.addColorStop(0.55, "rgba(10,20,50,.4)"); gr.addColorStop(1, "rgba(10,20,50,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function glowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.3, "rgba(255,255,255,.5)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}

// A tiny painted room for the glossy highlights on the mallets, the puck, the rails and the ice.
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.16, "#ffe9c8"); gr.addColorStop(0.32, "#6b3f1f");
    gr.addColorStop(0.5, "#3a2412"); gr.addColorStop(0.52, "#1a48b6"); gr.addColorStop(1, "#2a5ad0");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#2a3050"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(8, 22, 48, 20);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#1a48b6"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* ---------------- LED ribbon board: the dasher board standing on the far rail, facing you ----------------
   The board is a real dot matrix. Everything on it is painted into a small canvas, one pixel per LED, and a small
   shader turns each pixel into a glowing dot. It scrolls its programme right to left, and cuts to big animated
   messages for goals, matches and the final count (ledPlay below). */
const LED_ROWS = 20, LED_COLS = Math.round(BOARD.w / (BOARD.face / LED_ROWS));
const LED_SPEED = 34;                                      // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));   // the largest text size that fits (5 x 7 font, in LEDs per font pixel)
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
// Short messages between the plugs. The wordmark leads each group.
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["FIRST TO 7", "cyan"], ["BE KIND, REWIND", "pink"]];
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
  ["FLEA FORTRESS FLYBY", "PLAY IT FREE"],
  ["CREATURE FEATURE KO", "VHS BOSS RUSH"]
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
    "*": "00000 00100 01110 11111 01110 00100 00000", "(": "00010 00100 01000 01000 01000 00100 00010",
    ")": "01000 00100 00010 00010 00010 00100 01000"
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
  return { canvas: c, g: g, strip: strip.canvas, scroll: start, start: start, pos: -1, msg: null, queue: [], frame: -1, tex: null };
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

// kind: "flash" (strobe and chevrons), "slide", "cycle", "blink", "crawl" (scrolls across once),
// "score" (YOU n - n HIM) or "count" (a label and a number that counts up)
function ledMsg(kind, text, dur, more) {
  const m = { kind: kind, text: text, dur: dur, t: 0, wait: 0, color: "amber" };
  if (more) for (const k in more) m[k] = more[k];
  return m;
}
function ledCrawl(text, color, more) {
  const m = ledMsg("crawl", text, (LED_COLS + ledTextW(text, LED_BIG)) / (LED_SPEED * 2.2), more);
  m.color = color || "amber";
  return m;
}
function ledScore(hl) { return ledMsg("score", "", 2.4, { me: S.me, cpu: S.cpu, hl: hl, keep: true }); }
// Cut to a list of messages (or add them after whatever is showing), then return to the scroll.
function ledPlay(list, append) {
  const L = LED;
  if (!L || !list.length) return;
  if (append && L.msg) { for (let i = 0; i < list.length; i++) L.queue.push(list[i]); return; }
  if (!list.some(function (m) { return m.keep; })) {
    // a quick reaction cuts in, but a score or a result that has not had its turn yet still gets it afterwards
    const old = (L.msg && L.msg.keep ? [L.msg] : []).concat(L.queue.filter(function (m) { return m.keep; }));
    if (old.length) { old[0].t = 0; list = list.concat(old); }
  }
  L.msg = list[0]; L.msg.t = 0;
  L.queue = list.slice(1);
  L.frame = -1;
}
function ledClear() {
  if (!LED) return;
  LED.msg = null; LED.queue = []; LED.pos = -1;
}
function ledFinal() {
  if (!LED) return;
  ledPlay([ledCrawl("TABLE CLOSED", "pink"), ledMsg("count", "WINS", 6, { from: 0, value: S.wins, final: true })], true);
}

// One frame of a message, across the whole board.
function ledDrawMsg(g, m) {
  const WW = LED_COLS, HH = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(WW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.amber;
  function fit(str) { let sx = big; while (sx > 1 && ledTextW(str, sx) > WW - 10) sx--; return sx; }
  function chase(color, dir) {                              // running lights along the top and bottom edges
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < WW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(WW - x - 3, HH - 1, 3, 1); }
  }
  if (m.kind === "score") {                                 // YOU 3 - 2 HIM, the number that just changed blinking
    const seg = [["YOU ", LED_C.cyan], [String(m.me), "me"], [" - ", LED_C.amber], [String(m.cpu), "cpu"], [" HIM", LED_C.pink]];
    const str = seg.map(function (s) { return s[0]; }).join(""), sx = fit(str);
    let x = Math.round((WW - ledTextW(str, sx)) / 2);
    for (let i = 0; i < seg.length; i++) {
      let c = seg[i][1];
      if (c === "me" || c === "cpu") c = m.hl === c && !calm && t < 1.4 && Math.floor(t * 6) % 2 === 0 ? LED_C.yellow : LED_C.white;
      x = ledText(g, seg[i][0], x, yBig, sx, big, c);
    }
    if (!calm && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(WW * m.t / 0.3), 0, WW, HH); }   // wipe in
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "count") {                                 // counts up to the number
    const k = calm ? 1 : Math.min(1, t / 0.7), v = Math.round(m.from + (m.value - m.from) * k);
    const label = m.text ? m.text + " " : "", sxc = fit(label + m.value);
    const x = Math.round((WW - ledTextW(label + m.value, sxc)) / 2);
    const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
    const xn = ledText(g, label, x, yBig, sxc, big, LED_C.amber);
    ledText(g, String(v), xn, yBig, sxc, big, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "crawl") {                                 // runs across once, right to left (held still when motion is reduced)
    if (calm) { const sx = fit(m.text); ledText(g, m.text, Math.round((WW - ledTextW(m.text, sx)) / 2), yBig, sx, big, col); }
    else ledText(g, m.text, Math.round(WW - t * (WW + ledTextW(m.text, big)) / m.dur), yBig, big, big, col);
    g.fillStyle = col; g.fillRect(0, 0, WW, 1); g.fillRect(0, HH - 1, WW, 1);
    return;
  }
  const sx = fit(m.text), w = ledTextW(m.text, sx), x0 = Math.round((WW - w) / 2);
  if (m.kind === "flash") {
    if (!calm && t < 0.6 && Math.floor(t * 12) % 2 === 0) {                        // strobe: the whole board flips
      g.fillStyle = LED_C.yellow; g.fillRect(0, 0, WW, HH);
      ledText(g, m.text, x0, yBig, sx, big, "#000000");
      return;
    }
    const span = 6 * big + 5, ph = calm ? 0 : Math.floor((t * 46) % span);
    for (let k = 0; k < 12; k++) {                          // chevrons racing outward on both sides
      const off = Math.round(w / 2) + 9 + k * span + ph;
      if (off > mid + span) break;
      const cc = k % 2 ? LED_C.red : LED_C.orange;
      ledText(g, ">", mid + off, yBig, big, big, cc);
      ledText(g, "<", mid - off - 5 * big, yBig, big, big, cc);
    }
    const cyc = [LED_C.yellow, LED_C.white, LED_C.orange];
    ledText(g, m.text, x0, yBig, sx, big, calm ? LED_C.yellow : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 12; i++) g.fillRect((vrand() * WW) | 0, (vrand() * HH) | 0, 1, 1); }
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "slide") {                                 // slides in from the right, then a white glint sweeps across it
    const k = calm ? 1 : Math.min(1, t / 0.45), e = 1 - Math.pow(1 - k, 3);
    const x = Math.round(x0 + (1 - e) * WW);
    ledText(g, m.text, x, yBig, sx, big, col);
    if (!calm && k >= 1) {
      const bx = Math.floor(((t - 0.45) * 150) % (WW + 80)) - 40;
      g.save(); g.beginPath(); g.rect(bx, 0, 12, HH); g.clip();
      ledText(g, m.text, x, yBig, sx, big, "#ffffff");
      g.restore();
    }
    chase(col, -1);
    return;
  }
  if (m.kind === "cycle") {                                 // every letter takes its turn through the colors
    const cyc = [LED_C.yellow, LED_C.pink, LED_C.cyan, LED_C.lime, LED_C.orange];
    let x = x0;
    for (let i = 0; i < m.text.length; i++) x = ledText(g, m.text[i], x, yBig, sx, big, cyc[(i + (calm ? 0 : Math.floor(t * 9))) % cyc.length]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 10; i++) g.fillRect((vrand() * WW) | 0, (vrand() * HH) | 0, 1, 1); }
    chase(LED_C.yellow, 1);
    return;
  }
  // blink: a few flashes, then it holds over a solid bar
  if (calm || t > 1.1 || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, yBig, sx, big, col);
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

/* ---------------- The collector: a sculpted, jointed figure ----------------
   Life-size in feet, facing +z. The body is turned on a lathe (hips, waist, ribs, chest and shoulder blades, the
   trapezius sloping into a neck) and the limbs are tapered and muscled (shoulder, bicep and forearm; thigh, knee
   and shin), so nothing is a tube. He has a neck, a jaw and chin, cheeks, a nose, ears, eyes with lids, irises and
   a glint, brows that move, and a mouth that changes shape. His hands have a palm, four two-jointed fingers and a
   thumb that curl to grip, rest flat or make a fist, and he wears sneakers. His clothes carry folds in the shape
   itself (the shirt bunches at the belt, the sleeves ripple at the hem, the jeans break over the shoes) and in the
   painted cloth, with the wordmark big on his chest.
   A pose is: hips x y z, hips turn, shoulders turn, lean, left wrist x y z, right wrist x y z, left foot x y z,
   right foot x y z, head turn, head tilt. Elbows and knees are solved from where the wrists and feet are; the
   hands and the face are set on top (HANDS, FACE). Five collectors, five original looks. */
const LOOKS = [
  { shirt: "#e8402f", kind: "tee", pants: "#2d4a86", jeans: true, skin: 0xe0a070, hair: 0x4a2a14, style: "short", cap: "#1d2a5a", capInk: "#ffe45c", capBack: true, glasses: false, face: "", shoe: "#f2f2f2", shoeInk: "#e8402f", iris: 0x5a3a1a },      // The Box Lot Guy
  { shirt: "#23252f", kind: "tee", pants: "#3a3f52", jeans: true, skin: 0xb07a4c, hair: 0x15100c, style: "buzz", cap: "", glasses: false, face: "beard", shoe: "#1b1d26", shoeInk: "#ffffff", iris: 0x2a1a0e },                                     // The Reseller
  { shirt: "#f4f1e6", kind: "polo", pants: "#b8a77a", jeans: false, skin: 0xf1c7a0, hair: 0xb08a4a, style: "part", cap: "", glasses: true, face: "", shoe: "#8a5a32", shoeInk: "#f4f1e6", iris: 0x3a6a9a },                                      // The Mint Sealed Purist
  { shirt: "#14a6a0", kind: "aloha", pants: "#e3d8bc", jeans: false, skin: 0x7b4f2c, hair: 0x111111, style: "short", cap: "#f4f4f4", capInk: "#0f7c78", capBack: false, glasses: false, face: "goatee", shoe: "#ffffff", shoeInk: "#14a6a0", iris: 0x1e120a }, // The Flea Market Shark
  { shirt: "#ffb81f", kind: "tee", pants: "#2d4a86", jeans: true, skin: 0xd9a273, hair: 0xa8a8a8, style: "short", cap: "#2b7a3a", capInk: "#ffffff", capBack: false, glasses: true, face: "mustache", shoe: "#c9ccd4", shoeInk: "#2b7a3a", iris: 0x4a5a3a }  // The Estate Sale Early Bird
];
// Lathe profiles: [radius, height]. The torso and hips are in feet; limbs are one unit long (stretched to the bone)
// with radius 1 meaning the limb's own thickness.
const BODY = {
  torso: [[0.5, -0.2], [0.55, -0.02], [0.52, 0.3], [0.5, 0.55], [0.56, 0.9], [0.65, 1.22], [0.72, 1.5], [0.74, 1.7], [0.67, 1.88], [0.46, 2.02], [0.25, 2.1]],
  pelvis: [[0.1, -0.68], [0.34, -0.62], [0.52, -0.44], [0.58, -0.2], [0.57, 0.02], [0.53, 0.12]],
  upperArm: [[0.92, 0], [1.04, 0.1], [1.1, 0.32], [1.02, 0.6], [0.84, 0.88], [0.74, 1]],
  foreArm: [[0.86, 0], [1.0, 0.14], [1.02, 0.3], [0.86, 0.62], [0.64, 0.92], [0.6, 1]],
  thigh: [[1, 0], [1.03, 0.18], [0.96, 0.5], [0.82, 0.84], [0.74, 1]],
  calf: [[0.76, 0], [0.8, 0.3], [0.78, 0.65], [0.8, 0.92], [0.86, 1]],
  sleeve: [[0, -0.06], [0.95, -0.04], [1.16, 0], [1.24, 0.25], [1.3, 0.5], [1.36, 0.58]],
  neck: [[0.22, 0], [0.19, 0.22], [0.2, 0.4], [0.25, 0.5]]
};
const ARM_R = [0.205, 0.17], LEG_R = [0.29, 0.2];
const ARM_L = [1.08, 1.04], SHOULDER_X = 0.7, SHOULDER_Y = 1.84;   // upper arm and forearm (feet), where the shoulder joints sit in the torso
function bump(y, a, b) { return y <= a || y >= b ? 0 : Math.sin(Math.PI * (y - a) / (b - a)); }

// Turn a profile on the lathe (the seam at the back), then let "shape" push each point in or out: shape(r, y, phi, front) -> r.
function turned(T, prof, segs, shape) {
  const g = new T.LatheGeometry(prof.map(function (p) { return new T.Vector2(p[0], p[1]); }), segs, Math.PI);
  if (shape) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), r = Math.hypot(x, z);
      if (r < 1e-6) continue;
      const phi = Math.atan2(x, z), k = shape(r, y, phi, z / r) / r;
      pos.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
  }
  return g;
}
function figureGeometry(T) {
  const G = {};
  G.sphere = new T.SphereGeometry(1, 20, 14);
  G.torso = turned(T, BODY.torso, 28, function (r, y, phi, front) {
    let k = 1 + 0.15 * bump(y, 0.95, 1.8) * Math.max(0, front)            // chest
               + 0.07 * bump(y, 1.1, 1.85) * Math.max(0, -front)           // shoulder blades
               - 0.05 * bump(y, 0.2, 0.9) * (1 - Math.abs(front));         // a waist from the side
    if (y < 0.45) k *= 1 + 0.03 * Math.sin(phi * 9 + y * 6) * (0.45 - y) / 0.65;   // the shirt bunches above the belt
    if (y > 1.4 && y < 1.85) k *= 1 + 0.015 * Math.sin(y * 34) * (1 - Math.abs(front));   // pull lines under the arms
    return r * k;
  });
  G.pelvis = turned(T, BODY.pelvis, 22, function (r, y, phi, front) { return r * (1 + 0.06 * bump(y, -0.5, 0.05) * Math.max(0, -front)); });
  G.upperArm = turned(T, BODY.upperArm, 14, function (r, y, phi, front) { return r * (1 + 0.08 * bump(y, 0.15, 0.6) * Math.max(0, front)); });
  G.foreArm = turned(T, BODY.foreArm, 14, function (r, y, phi, front) { return r * (1 + 0.07 * bump(y, 0.05, 0.5) * Math.max(0, -front)); });
  G.thigh = turned(T, BODY.thigh, 16, function (r, y, phi) { return r * (1 + (y > 0.82 ? 0.03 * Math.sin(phi * 6) * (y - 0.82) / 0.18 : 0)); });
  G.calf = turned(T, BODY.calf, 16, function (r, y, phi) {
    return r * (1 + (y > 0.78 ? 0.05 * Math.sin(phi * 5 + y * 18) * (y - 0.78) / 0.22 : 0) + (y < 0.15 ? 0.025 * Math.sin(phi * 7) * (0.15 - y) / 0.15 : 0));
  });
  G.sleeve = turned(T, BODY.sleeve, 16, function (r, y, phi) { return r * (1 + (y > 0.2 ? 0.05 * Math.sin(phi * 6) * (y - 0.2) / 0.38 : 0)); });
  G.neck = turned(T, BODY.neck, 14);
  G.dome = new T.SphereGeometry(1, 20, 9, 0, TAU, 0, Math.PI * 0.44);           // a head of hair
  G.crown = new T.SphereGeometry(1, 20, 9, 0, TAU, 0, Math.PI * 0.5);           // a cap crown
  G.lid = new T.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI * 0.5);             // an eyelid: the top half of a ball that rolls down over the eye
  G.beard = new T.SphereGeometry(1, 18, 8, 0, TAU, Math.PI * 0.5, Math.PI * 0.5);
  G.brim = new T.CylinderGeometry(1, 1, 1, 20, 1, false, -Math.PI / 2, Math.PI);
  G.smile = new T.TorusGeometry(0.075, 0.016, 6, 14, Math.PI * 0.7);
  G.rim = new T.TorusGeometry(0.075, 0.011, 6, 18);
  function cap(r, l) { return new T.CapsuleGeometry(r, l, 3, 8).translate(0, l / 2, 0); }
  G.fingerA = cap(0.036, 0.1); G.fingerB = cap(0.032, 0.07);
  G.thumbA = cap(0.042, 0.08); G.thumbB = cap(0.037, 0.06);
  G.bar = cap(0.016, 1);                                                       // a thin rod: lips, glasses arms
  G.sole = roundBox(T, 0.36, 0.09, 0.98, 0.04);
  G.belt = new T.CylinderGeometry(1, 1, 1, 22, 1, true);
  G.buckle = roundBox(T, 0.16, 0.12, 0.04, 0.02);
  return G;
}

function makeHand(T, G, M, sg) {
  const g = new T.Group(), fingers = [];
  const palm = new T.Mesh(G.sphere, M.skin); palm.scale.set(0.15, 0.17, 0.068); palm.position.y = 0.15; g.add(palm);
  const knuck = new T.Mesh(G.sphere, M.skin); knuck.scale.set(0.15, 0.06, 0.07); knuck.position.set(0, 0.28, 0.006); g.add(knuck);
  const len = [0.84, 0.97, 1.06, 1];                                           // pinky to index
  for (let i = 0; i < 4; i++) {
    const a = new T.Group(); a.position.set((-0.105 + i * 0.07) * sg, 0.29, 0); g.add(a);
    const p = new T.Mesh(G.fingerA, M.skin); p.scale.y = len[i]; a.add(p);
    const b = new T.Group(); b.position.y = 0.12 * len[i]; a.add(b);
    const d = new T.Mesh(G.fingerB, M.skin); d.scale.y = len[i]; b.add(d);
    fingers.push({ a: a, b: b });
  }
  const ta = new T.Group(); ta.position.set(0.12 * sg, 0.07, -0.03); g.add(ta);
  ta.add(new T.Mesh(G.thumbA, M.skin));
  const tb = new T.Group(); tb.position.y = 0.1; ta.add(tb);
  tb.add(new T.Mesh(G.thumbB, M.skin));
  return { g: g, fingers: fingers, ta: ta, tb: tb, sg: sg };
}
// c1, c2: how far the knuckles and the finger tips curl (radians); th: the thumb, 0 out to 1 across.
function curlHand(H, c1, c2, th) {
  for (let i = 0; i < 4; i++) { H.fingers[i].a.rotation.set(-c1, 0, (i - 1.5) * 0.06 * H.sg * (1 - c1 / 1.8)); H.fingers[i].b.rotation.x = -c2; }
  H.ta.rotation.set(-0.3 - th * 0.7, 0, -H.sg * (0.75 - th * 0.55));
  H.tb.rotation.x = -th * 0.9;
}

function makeShoe(T, G, M) {
  const g = new T.Group();
  const sole = new T.Mesh(G.sole, M.sole); sole.position.set(0, 0.045, 0.1); g.add(sole);
  const up = new T.Mesh(G.sphere, M.shoeUp); up.scale.set(0.17, 0.16, 0.42); up.position.set(0, 0.17, 0.06); g.add(up);
  const toe = new T.Mesh(G.sphere, M.sole); toe.scale.set(0.165, 0.1, 0.17); toe.position.set(0, 0.12, 0.4); g.add(toe);
  const heel = new T.Mesh(G.sphere, M.shoeUp); heel.scale.set(0.16, 0.15, 0.14); heel.position.set(0, 0.18, -0.24); g.add(heel);
  const collar = new T.Mesh(G.sphere, M.shoeIn); collar.scale.set(0.15, 0.04, 0.17); collar.position.set(0, 0.31, -0.1); g.add(collar);
  return g;
}

function makePerson(T, G, LT) {
  const root = new T.Group();
  root.scale.setScalar(FT);
  const env = { envMap: LT.env, combine: T.AddOperation };
  const M = {
    skin: new T.MeshPhongMaterial({ color: 0xe0a070, specular: 0x2a2018, shininess: 16 }),
    lip: new T.MeshPhongMaterial({ color: 0xb0604a, specular: 0x332222, shininess: 30 }),
    shirt: new T.MeshLambertMaterial({ map: LT.looks[0].shirt }),
    sleeve: new T.MeshLambertMaterial({ map: LT.looks[0].sleeve, side: T.DoubleSide }),
    shoulder: new T.MeshLambertMaterial({ color: 0xe8402f }),
    pants: new T.MeshLambertMaterial({ map: LT.looks[0].pants }),
    shoeUp: new T.MeshPhongMaterial({ map: LT.looks[0].shoe, specular: 0x555555, shininess: 30 }),
    sole: new T.MeshPhongMaterial({ color: 0xf6f6f2, specular: 0x666666, shininess: 30 }),
    shoeIn: new T.MeshLambertMaterial({ color: 0x1b1d26 }),
    hair: new T.MeshPhongMaterial({ color: 0x4a2a14, specular: 0x333333, shininess: 22 }),
    crown: new T.MeshPhongMaterial(Object.assign({ map: LT.looks[0].cap, specular: 0x333333, shininess: 30, reflectivity: 0.03 }, env)),
    cap: new T.MeshPhongMaterial({ color: 0x1d2a5a, specular: 0x333333, shininess: 30 }),
    white: new T.MeshPhongMaterial({ color: 0xfbfaf6, specular: 0xffffff, shininess: 90 }),
    iris: new T.MeshPhongMaterial({ color: 0x5a3a1a, specular: 0xffffff, shininess: 90 }),
    pupil: new T.MeshBasicMaterial({ color: 0x0a0806 }),
    glint: new T.MeshBasicMaterial({ color: 0xffffff }),
    mouth: new T.MeshBasicMaterial({ color: 0x3a0e0c }),
    tongue: new T.MeshLambertMaterial({ color: 0xc8505a }),
    frame: new T.MeshPhongMaterial({ color: 0x15161c, specular: 0xffffff, shininess: 80 }),
    lens: new T.MeshPhongMaterial({ color: 0x9fc4ff, specular: 0xffffff, shininess: 140, transparent: true, opacity: 0.22, depthWrite: false }),
    belt: new T.MeshPhongMaterial({ color: 0x24160c, specular: 0x333333, shininess: 30 }),
    metal: new T.MeshPhongMaterial({ color: 0xc9b46a, specular: 0xffffff, shininess: 90 })
  };
  function mesh(geo, mat, parent, x, y, z, sx, sy, sz) {
    const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0);
    m.scale.set(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz);
    (parent || root).add(m); return m;
  }

  /* hips (they turn with the legs) and the body above them */
  const hips = new T.Group(); root.add(hips);
  mesh(G.pelvis, M.pants, hips, 0, 0, 0, 1, 1, 0.72);
  mesh(G.belt, M.belt, hips, 0, 0.05, 0, 0.555, 0.12, 0.41);
  mesh(G.buckle, M.metal, hips, 0, 0.05, 0.41);
  const upper = new T.Group(); root.add(upper);
  const chest = new T.Group(); upper.add(chest);
  mesh(G.torso, M.shirt, chest, 0, 0, 0, 0.9, 1, 0.62);
  mesh(G.sphere, M.shoulder, chest, SHOULDER_X - 0.03, SHOULDER_Y + 0.02, 0, 0.26, 0.24, 0.27);   // shoulders under the shirt
  mesh(G.sphere, M.shoulder, chest, -SHOULDER_X + 0.03, SHOULDER_Y + 0.02, 0, 0.26, 0.24, 0.27);
  mesh(G.neck, M.skin, upper, 0, 1.92, 0.02, 1, 1, 0.92);
  mesh(G.sphere, M.skin, upper, 0, 2.02, 0.12, 0.13, 0.07, 0.08);              // the Adam's apple and the throat

  /* the head */
  const head = new T.Group(); head.position.set(0, 2.44, 0.03); head.scale.setScalar(1.08); upper.add(head);
  mesh(G.sphere, M.skin, head, 0, 0.12, -0.02, 0.39, 0.43, 0.44);               // cranium
  mesh(G.sphere, M.skin, head, 0, -0.12, 0.05, 0.33, 0.27, 0.36);               // jaw
  mesh(G.sphere, M.skin, head, 0, -0.3, 0.27, 0.13, 0.1, 0.11);                 // chin
  mesh(G.sphere, M.skin, head, 0.18, -0.04, 0.24, 0.11, 0.09, 0.11);            // cheeks
  mesh(G.sphere, M.skin, head, -0.18, -0.04, 0.24, 0.11, 0.09, 0.11);
  const bridge = mesh(G.sphere, M.skin, head, 0, 0.04, 0.4, 0.055, 0.12, 0.06); bridge.rotation.x = -0.28;   // nose
  mesh(G.sphere, M.skin, head, 0, -0.06, 0.46, 0.075, 0.07, 0.075);
  mesh(G.sphere, M.skin, head, 0.055, -0.08, 0.42, 0.045, 0.04, 0.04);
  mesh(G.sphere, M.skin, head, -0.055, -0.08, 0.42, 0.045, 0.04, 0.04);
  mesh(G.sphere, M.skin, head, 0.385, 0.05, -0.02, 0.06, 0.12, 0.09);           // ears
  mesh(G.sphere, M.skin, head, -0.385, 0.05, -0.02, 0.06, 0.12, 0.09);
  const eyes = [], brows = [];
  [1, -1].forEach(function (sg) {
    const e = new T.Group(); e.position.set(sg * 0.15, 0.09, 0.36); head.add(e);
    mesh(G.sphere, M.white, e, 0, 0, 0, 0.075, 0.06, 0.05);
    const look = new T.Group(); e.add(look);
    mesh(G.sphere, M.iris, look, 0, 0, 0.045, 0.036, 0.036, 0.012);
    mesh(G.sphere, M.pupil, look, 0, 0, 0.053, 0.018, 0.018, 0.008);
    mesh(G.sphere, M.glint, look, 0.012, 0.013, 0.058, 0.007, 0.007, 0.004);
    const lid = mesh(G.lid, M.skin, e, 0, 0, 0, 0.082, 0.068, 0.06);
    eyes.push({ look: look, lid: lid });
    brows.push(mesh(G.sphere, M.hair, head, sg * 0.15, 0.2, 0.39, 0.1, 0.026, 0.035));
  });
  // the mouth: a closed line, a smile, a frown, an open grin with teeth and tongue, gritted teeth
  const mouth = new T.Group(); mouth.position.set(0, -0.2, 0.395); head.add(mouth);
  const lowerLip = mesh(G.sphere, M.lip, mouth, 0, -0.03, -0.005, 0.07, 0.022, 0.025);
  const mLine = mesh(G.bar, M.lip, mouth, -0.075, 0, 0.012, 1, 0.15, 1); mLine.rotation.z = -Math.PI / 2;
  const mSmile = mesh(G.smile, M.lip, mouth, 0, 0.055, 0.004); mSmile.rotation.z = -Math.PI / 2 - Math.PI * 0.35;
  const mFrown = mesh(G.smile, M.lip, mouth, 0, -0.07, 0.004); mFrown.rotation.z = Math.PI / 2 - Math.PI * 0.35;
  const mOpen = new T.Group(); mouth.add(mOpen);
  mesh(G.sphere, M.mouth, mOpen, 0, -0.02, 0, 0.1, 0.065, 0.03);
  mesh(G.sphere, M.white, mOpen, 0, 0.022, 0.012, 0.085, 0.022, 0.02);
  mesh(G.sphere, M.tongue, mOpen, 0, -0.06, 0.01, 0.06, 0.022, 0.02);
  const mGrit = new T.Group(); mouth.add(mGrit);
  mesh(G.sphere, M.white, mGrit, 0, 0, 0.006, 0.1, 0.034, 0.022);
  const gl = mesh(G.bar, M.mouth, mGrit, -0.09, 0, 0.026, 0.5, 0.18, 0.5); gl.rotation.z = -Math.PI / 2;
  const moods = { line: [mLine, lowerLip], smile: [mSmile, lowerLip], frown: [mFrown, lowerLip], grin: [mOpen], grit: [mGrit] };
  // hair: a full head, a buzz or a side part, with sideburns and the back of the head; a beard, a goatee or a mustache
  const hair = { top: mesh(G.dome, M.hair, head, 0, 0.12, -0.03, 0.41, 0.46, 0.47), back: mesh(G.sphere, M.hair, head, 0, 0.06, -0.15, 0.38, 0.36, 0.33) };
  hair.part = mesh(G.sphere, M.hair, head, -0.1, 0.49, 0.1, 0.24, 0.08, 0.3); hair.part.rotation.z = 0.25;
  hair.burns = [mesh(G.sphere, M.hair, head, 0.365, 0.03, 0.08, 0.025, 0.08, 0.045), mesh(G.sphere, M.hair, head, -0.365, 0.03, 0.08, 0.025, 0.08, 0.045)];
  const beard = mesh(G.beard, M.hair, head, 0, -0.1, 0.05, 0.35, 0.3, 0.385);
  const goatee = mesh(G.sphere, M.hair, head, 0, -0.31, 0.31, 0.08, 0.08, 0.06);
  const stache = new T.Group(); head.add(stache);
  [1, -1].forEach(function (sg) { const m = mesh(G.sphere, M.hair, stache, sg * 0.055, -0.135, 0.43, 0.075, 0.026, 0.03); m.rotation.z = -sg * 0.22; });
  // the cap: a paneled crown with the monogram, a button and a brim
  const cap = new T.Group(); cap.position.set(0, 0.15, -0.02); head.add(cap);
  mesh(G.crown, M.crown, cap, 0, 0, 0, 0.415, 0.42, 0.465);
  mesh(G.sphere, M.cap, cap, 0, 0.42, 0, 0.05, 0.03, 0.05);
  const brim = mesh(G.brim, M.cap, cap, 0, 0.0, 0.36, 0.34, 0.025, 0.3); brim.rotation.x = 0.14;
  // glasses
  const glasses = new T.Group(); head.add(glasses);
  [1, -1].forEach(function (sg) {
    mesh(G.rim, M.frame, glasses, sg * 0.15, 0.09, 0.43);
    const ln = mesh(G.sphere, M.lens, glasses, sg * 0.15, 0.09, 0.428, 0.072, 0.072, 0.01); ln.renderOrder = 9;
    const arm = mesh(G.bar, M.frame, glasses, sg * 0.225, 0.1, 0.43, 0.7, 0.42, 0.7); arm.rotation.set(-Math.PI / 2, 0, 0); arm.rotation.y = sg * 0.3;
  });
  const nb = mesh(G.bar, M.frame, glasses, -0.04, 0.1, 0.44, 0.7, 0.08, 0.7); nb.rotation.z = -Math.PI / 2;

  /* arms, hands, legs and shoes */
  function limb(geoUp, geoLo, matUp, matLo, r1, r2, sleeve) {
    const L = { up: mesh(geoUp, matUp), lo: mesh(geoLo, matLo), j1: mesh(G.sphere, matLo, root, 0, 0, 0, r1 * 0.75), r1: r1, r2: r2 };
    if (sleeve) L.sl = mesh(G.sleeve, sleeve);
    return L;
  }
  const arm = [limb(G.upperArm, G.foreArm, M.skin, M.skin, ARM_R[0], ARM_R[1], M.sleeve), limb(G.upperArm, G.foreArm, M.skin, M.skin, ARM_R[0], ARM_R[1], M.sleeve)];
  const hand = [makeHand(T, G, M, 1), makeHand(T, G, M, -1)];
  root.add(hand[0].g); root.add(hand[1].g);
  const leg = [limb(G.thigh, G.calf, M.pants, M.pants, LEG_R[0], LEG_R[1]), limb(G.thigh, G.calf, M.pants, M.pants, LEG_R[0], LEG_R[1])];
  const shoe = [makeShoe(T, G, M), makeShoe(T, G, M)];
  root.add(shoe[0]); root.add(shoe[1]);
  root.traverse(function (o) { if (o.isMesh) o.castShadow = o.material !== M.lens; });
  return { root: root, hips: hips, upper: upper, chest: chest, head: head, arm: arm, hand: hand, leg: leg, shoe: shoe, M: M, LT: LT,
           eyes: eyes, brows: brows, moods: moods, hair: hair, beard: beard, goatee: goatee, stache: stache, cap: cap, glasses: glasses };
}

function setLook(P, i) {
  const L = LOOKS[i], T = P.LT.looks[i], M = P.M;
  M.shirt.map = T.shirt; M.sleeve.map = T.sleeve; M.pants.map = T.pants; M.shoeUp.map = T.shoe; M.crown.map = T.cap;
  M.skin.color.setHex(L.skin); M.skin.emissive.setHex(L.skin).multiplyScalar(0.1); M.hair.color.setHex(L.hair); M.iris.color.setHex(L.iris);
  M.lip.color.setHex(L.skin).lerp(new P.LT.Color(0xa0303a), 0.35).multiplyScalar(0.82);
  if (L.cap) M.cap.color.set(L.cap);
  M.shoulder.color.set(L.kind === "aloha" ? "#18958f" : L.shirt);
  P.cap.visible = !!L.cap;
  P.cap.rotation.y = L.capBack ? Math.PI : 0;
  P.hair.top.visible = !L.cap;
  P.hair.part.visible = !L.cap && L.style === "part";
  const buzz = L.style === "buzz" ? 0.97 : 1;
  P.hair.top.scale.set(0.41 * buzz, 0.46 * buzz, 0.47 * buzz); P.hair.back.scale.set(0.38 * buzz, 0.36 * buzz, 0.33 * buzz);
  P.beard.visible = L.face === "beard"; P.goatee.visible = L.face === "goatee"; P.stache.visible = L.face === "beard" || L.face === "goatee" || L.face === "mustache";
  P.glasses.visible = !!L.glasses;
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
// Stretch a one-unit limb piece from A to B.
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
  if (L.sl) {                                               // the sleeve covers the top of the upper arm, starting just above the shoulder
    t.d.subVectors(t.e, A);
    t.q.copy(A).addScaledVector(t.d, 0.02); t.p.copy(A).addScaledVector(t.d, 0.46);
    bone(L.sl, t.q, t.p, L.r1);
  }
  L.j1.position.copy(t.e);
}
// Point a hand: wrist at B, fingers along Y (or straight on from the forearm), the back of the hand toward N.
function setHand(H, B, Y, N, spec) {
  const t = TV;
  t.y.copy(Y).normalize();
  t.z.copy(N).addScaledVector(t.y, -N.dot(t.y));
  if (t.z.lengthSq() < 1e-6) t.z.set(0, 0, 1);
  t.z.normalize();
  t.x.crossVectors(t.y, t.z);
  t.m.makeBasis(t.x, t.y, t.z);
  H.g.quaternion.setFromRotationMatrix(t.m);
  H.g.position.copy(B);
  curlHand(H, spec.c1, spec.c2, spec.th);
}
// HANDS[s]: Y (null = carry on from the forearm), N (back of the hand), c1 c2 th (curl)
function applyPose(P, v) {
  const t = TV, hy = v[3] * DEG, uy = v[4] * DEG, ch = Math.cos(hy), sh = Math.sin(hy), cu = Math.cos(uy), su = Math.sin(uy);
  P.hips.position.set(v[0], v[1], v[2]); P.hips.rotation.y = hy;
  P.upper.position.set(v[0], v[1], v[2]); P.upper.rotation.set(v[5] * DEG, uy, 0, "YXZ");
  P.upper.updateMatrix();
  P.head.rotation.set((v[19] || 0) * DEG, (v[18] - v[4]) * DEG, FACE.roll * DEG, "YXZ");
  for (let s = 0; s < 2; s++) {                             // 0 = left, 1 = right
    const sg = s ? -1 : 1, px = sg * 0.5, pz = -0.5, hs = HANDS[s];
    t.a.set(sg * SHOULDER_X, SHOULDER_Y, 0).applyMatrix4(P.upper.matrix);
    t.b.set(v[6 + s * 3], v[7 + s * 3], v[8 + s * 3]);
    t.p.set(px * cu + pz * su, -0.8, -px * su + pz * cu);   // elbows hang down, out and a little back
    setLimb(P.arm[s], t.a, t.b, t.p, ARM_L[0], ARM_L[1]);
    if (hs.Y) t.f.copy(hs.Y); else t.f.subVectors(t.b, t.e);
    setHand(P.hand[s], t.b, t.f, hs.N, hs);
    t.a.set(v[0] + sg * 0.33 * ch, v[1] - 0.12, v[2] - sg * 0.33 * sh);
    t.b.set(v[12 + s * 3], v[13 + s * 3] + 0.34, v[14 + s * 3]);
    t.p.set(sh + sg * 0.22 * ch, 0.15, ch - sg * 0.22 * sh); // knees point where the hips face
    setLimb(P.leg[s], t.a, t.b, t.p, 1.5, 1.48);
    P.shoe[s].position.set(t.b.x, v[13 + s * 3], t.b.z - 0.06);
    P.shoe[s].rotation.y = hy * 0.6 + sg * 0.14;
  }
  // the face
  P.brows.forEach(function (b, i) {
    const sg = i ? -1 : 1;
    b.rotation.z = sg * FACE.brow * 0.4;
    b.position.y = 0.2 + FACE.browUp * 0.045 - Math.max(0, FACE.brow) * 0.012;
  });
  const lid = Math.max(FACE.lid, FACE.blink);
  P.eyes.forEach(function (e) { e.lid.rotation.x = -0.6 + lid * 2.15; e.look.position.set(FACE.lookX * 0.02, FACE.lookY * 0.014, 0); });
  for (const k in P.moods) { const on = k === FACE.mouth; P.moods[k].forEach(function (m) { m.visible = on || (m === P.moods.line[1] && (FACE.mouth === "smile" || FACE.mouth === "frown" || FACE.mouth === "line")); }); }
  P.chest.scale.set(1 + FACE.breath * 0.6, 1 + FACE.breath, 1 + FACE.breath * 1.2);
}
// How far his right shoulder is from his right wrist for a given lean and shoulder turn (feet).
function shoulderGap(L, U, hx, hy, hz, hip) {
  const l = L * DEG, u = U * DEG, y1 = SHOULDER_Y * Math.cos(l), z1 = SHOULDER_Y * Math.sin(l), x1 = -SHOULDER_X;
  const sx = x1 * Math.cos(u) + z1 * Math.sin(u), sz = -x1 * Math.sin(u) + z1 * Math.cos(u);
  return Math.hypot(hx - sx, hy - (hip + y1), hz - sz);
}

/* Pose him for this frame. In play: knees bent in a ready stance, right hand gripping his mallet, left hand flat on
   top of the dasher board, leaning as far over the table as his mallet needs, eyes on the puck, jaw set. When he
   hits the puck hard he snaps into it and grits his teeth. When he scores: a fist pump and an open grin. When you
   score: a slump, a head shake and a worried frown. When you take the match: a facepalm. Behind the title and score
   cards: an idle, breathing, shifting his weight, blinking, glancing around with a smirk. */
const POSE = new Array(20).fill(0);
const FACE = { brow: 0, browUp: 0, lid: 0, blink: 0, mouth: "line", lookX: 0, lookY: 0, roll: 0, breath: 0 };
const HANDS = [{ Y: null, N: null, c1: 0, c2: 0, th: 0 }, { Y: null, N: null, c1: 0, c2: 0, th: 0 }];
function poseOpponent(fdt, idle) {
  const P = R.opp, c = S.c, k = S.k, calm = Shell.reduced, v = POSE, t = R.clock, X3 = R.T.Vector3;
  if (!HANDS[0].N) for (let i = 0; i < 2; i++) { HANDS[i].N = new X3(0, 1, 0); HANDS[i].Yv = new X3(); }
  const want = clamp((c.x - CX) * 0.55, -92, 92);
  V.oppX += (want - V.oppX) * Math.min(1, fdt * 5 || 1);
  P.root.position.x = V.oppX;
  // where his right hand has to be: on top of his mallet's knob
  const hx = (c.x - CX - V.oppX) / FT, kyTop = (TABLE_H + 27) / FT, hz = (c.y - CZ - OPP_Z) / FT;
  const reach = clamp((hz - 1.0) / 2.0, 0, 1);
  const fx = hx + 0.55, fzz = hz - 0.8, fl = Math.hypot(fx, fzz) || 1;            // roughly the way his forearm points, seen from above
  const wx = hx - fx / fl * 0.17, wy = kyTop + 0.15, wz = hz - fzz / fl * 0.17;
  const uyBase = clamp(6 + reach * 24 - hx * 8, -12, 38);
  // what he is doing
  if (!idle && S.snd && S.snd.cpu !== V.lastHit) { if (V.lastHit != null) V.strike = 0.4; V.lastHit = S.snd.cpu; }
  V.strike = Math.max(0, (V.strike || 0) - fdt);
  let kind = V.reactKind, amt = clamp(V.react, 0, 1);
  if (!idle && S.phase === "lost") { kind = "cheer"; amt = 1; }
  else if (!idle && S.phase === "next") { kind = "facepalm"; amt = 1; }
  const st = calm ? 0 : V.strike / 0.4;
  const uy = uyBase + 12 * st;
  let hip = HIP_Y - 0.1 - 0.12 * reach - (idle || calm ? 0 : 0.02 * Math.sin(t * 6)), lean = 8;
  for (let L = 6; L <= 66; L += 2) { lean = L; if (shoulderGap(L, uy, wx, wy, wz, hip) <= ARM * 0.97) break; }
  lean = Math.max(lean, 12 + 18 * reach) + 7 * st;
  if (kind === "slump") lean += 10 * amt;
  if (kind === "facepalm") lean += 6;
  const r = Math.min(1, fdt * 9 || 1);
  V.lean += (lean - V.lean) * r; V.uy += (uy - V.uy) * r;
  // idle life: breathing, a slow weight shift, blinking, glances
  const breath = calm ? 0 : Math.sin(t * 2.2);
  const shift = idle && !calm ? Math.sin(t * 0.8) : 0;
  V.blinkT = (V.blinkT == null ? 2 : V.blinkT) - fdt;
  if (V.blinkT <= 0) { V.blinkT = 2 + vrand() * 3.5; V.blinkOn = 0.15; }
  V.blinkOn = Math.max(0, (V.blinkOn || 0) - fdt);
  FACE.blink = calm ? 0 : V.blinkOn > 0 ? 1 : 0;
  FACE.breath = breath * 0.012;
  v[0] = shift * 0.06; v[1] = hip + breath * 0.012; v[2] = 0;
  v[3] = V.uy * 0.45 + shift * 5; v[4] = V.uy; v[5] = V.lean;
  // right hand: fingers wrapped over the front of the knob
  const h1 = HANDS[1];
  h1.Yv.set(fx / fl * 0.7, -0.75, fzz / fl * 0.7); h1.Y = h1.Yv; h1.N.set(0, 1, 0.25); h1.c1 = 1.25; h1.c2 = 1.05; h1.th = 0.85;
  v[9] = wx; v[10] = wy; v[11] = wz;
  // left hand: flat on top of the board, fingers draped over its front edge
  const h0 = HANDS[0];
  const bx = clamp(1.0, (-BOARD.w / 2 + 16 - V.oppX) / FT, (BOARD.w / 2 - 16 - V.oppX) / FT);
  v[6] = bx; v[7] = R.boardTop.y + 0.05; v[8] = R.boardTop.z - 0.2;
  h0.Yv.set(-0.15, -0.25, 1); h0.Y = h0.Yv; h0.N.set(0, 1, 0); h0.c1 = 0.3; h0.c2 = 0.55; h0.th = 0.15;
  if (kind === "cheer" && amt > 0) {                        // the fist goes up and pumps
    const pump = calm ? 0 : Math.abs(Math.sin(t * 11)) * 0.32, u = Math.min(1, amt * 2.5);
    v[6] += (0.8 - v[6]) * u; v[7] += (HIP_Y + 2.6 + pump - v[7]) * u; v[8] += (0.3 - v[8]) * u;
    if (u > 0.5) { h0.Y = null; h0.N.set(0, 0, 1); h0.c1 = 1.65; h0.c2 = 1.7; h0.th = 1; }
  } else if (kind === "facepalm") {                         // palm over his eyes
    const e = R.eul; e.set(v[5] * DEG, v[4] * DEG, 0, "YXZ");
    TV.g.set(0, 2.62, 0.48).applyEuler(e); TV.g.x += v[0]; TV.g.y += v[1]; TV.g.z += v[2];
    h0.Yv.set(-0.55, 0.8, 0.15).normalize(); h0.Y = h0.Yv; h0.N.set(0, 0.1, 1);
    v[6] = TV.g.x - h0.Yv.x * 0.2; v[7] = TV.g.y - h0.Yv.y * 0.2; v[8] = TV.g.z - h0.Yv.z * 0.2 + 0.04;
    h0.c1 = 0.15; h0.c2 = 0.15; h0.th = 0.2;
  }
  // feet planted a little wider than his hips, knees bent
  v[12] = 0.5; v[13] = 0; v[14] = 0.05 - reach * 0.15;
  v[15] = -0.5; v[16] = 0; v[17] = -0.3;
  // head and eyes: on the puck in play, wandering when idle
  const px = (k.x - CX - V.oppX) / FT, pz = (k.y - CZ - OPP_Z) / FT;
  let yaw = clamp(Math.atan2(px, Math.max(0.5, pz)) / DEG, -45, 45), tilt = clamp(-8 - V.lean * 1.05, -60, 10);
  if (idle && !calm) { yaw = 18 * Math.sin(t * 0.37) + 8 * Math.sin(t * 1.1); tilt = -V.lean - 14 + 5 * Math.sin(t * 0.5); }
  FACE.roll = 0; FACE.lookX = clamp(yaw / 40, -1, 1) * 0.6; FACE.lookY = idle ? 0.6 : -0.5;
  // the face for the moment
  if (kind === "cheer" && amt > 0) { FACE.mouth = "grin"; FACE.brow = -0.15; FACE.browUp = 1; FACE.lid = 0; tilt -= 14 * amt; FACE.roll = calm ? 0 : 6 * Math.sin(t * 5); }
  else if (kind === "slump" && amt > 0) { FACE.mouth = "frown"; FACE.brow = -0.8; FACE.browUp = 0.6; FACE.lid = 0.15; tilt += 24 * amt; if (!calm) yaw += 16 * Math.sin(t * 13) * Math.min(1, amt * 1.6); }
  else if (kind === "facepalm") { FACE.mouth = "frown"; FACE.brow = -0.6; FACE.browUp = 0.3; FACE.lid = 0.7; tilt += 18; yaw *= 0.3; }
  else if (st > 0) { FACE.mouth = "grit"; FACE.brow = 1; FACE.browUp = 0; FACE.lid = 0.3; }
  else if (idle) { FACE.mouth = "smile"; FACE.brow = 0.05; FACE.browUp = 0.25; FACE.lid = 0.05; }
  else { FACE.mouth = "line"; FACE.brow = 0.6; FACE.browUp = 0; FACE.lid = 0.2; }
  v[18] = yaw; v[19] = tilt;
  applyPose(P, v);
}

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x2a1a10, 1);
  renderer.shadowMap.enabled = true;
  // newer three.js builds fold the soft filter into PCFShadowMap and warn about the old name
  renderer.shadowMap.type = (parseInt(T.REVISION, 10) || 0) >= 182 ? T.PCFShadowMap : T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(CAM_FOV, W / H, 20, 6000);
  const caps = renderer.capabilities;
  const aniso = Math.min(4, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  TV = { a: new T.Vector3(), b: new T.Vector3(), d: new T.Vector3(), e: new T.Vector3(), p: new T.Vector3(), q: new T.Vector3(), up: new T.Vector3(0, 1, 0),
        f: new T.Vector3(), g: new T.Vector3(), x: new T.Vector3(), y: new T.Vector3(), z: new T.Vector3(), m: new T.Matrix4() };

  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = aniso;
    return t;
  }
  function decal(mat, order) { mat.transparent = true; mat.depthWrite = false; mat._order = order; return mat; }
  function add(mesh, parent) { if (mesh.material && mesh.material._order) mesh.renderOrder = mesh.material._order; (parent || scene).add(mesh); return mesh; }
  function lit(mesh, cast, recv) { mesh.castShadow = !!cast; mesh.receiveShadow = !!recv; return mesh; }

  const script = scriptCanvas(scriptImg);
  const tIce = tex(iceCanvas(script)), tPuck = tex(puckCanvas(script)), tCarpet = tex(carpetCanvas(), true), tPanel = tex(panelCanvas(), true);
  const tShadow = tex(shadowCanvas()), tGlow = tex(glowCanvas()), tSign = tex(signCanvas(script));
  // the collectors' clothes, one set per look
  const lookTex = LOOKS.map(function (L) { return { shirt: tex(shirtCanvas(script, L)), sleeve: tex(sleeveCanvas(L)), pants: tex(pantsCanvas(L)), cap: tex(capCanvas(L)), shoe: tex(shoeCanvas(L)) }; });
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;

  /* lights: a warm rec room, a light over the table from his side so his arm throws a shadow on the ice */
  const hemi = new T.HemisphereLight(0xfff6ea, 0x6a5a8a, LIGHT.hemi); scene.add(hemi);
  const key = new T.DirectionalLight(0xfff2dc, LIGHT.key);
  key.position.set(-150, 1150, -330); key.target.position.set(0, 0, -70);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const sc = key.shadow.camera;
  sc.left = -320; sc.right = 320; sc.top = 470; sc.bottom = -470; sc.near = 300; sc.far = 2000;
  sc.updateProjectionMatrix();
  key.shadow.bias = -0.0008; key.shadow.normalBias = 0.8; key.shadow.radius = 2.5;
  scene.add(key); scene.add(key.target);
  const fill = new T.DirectionalLight(0xe6eeff, LIGHT.fill);      // from your side, so his face and shirt never go flat
  fill.position.set(160, 520, 760); scene.add(fill);

  /* the room */
  const carpet = lit(new T.Mesh(new T.PlaneGeometry(3200, 3200).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ map: tCarpet })), false, true);
  (function () { const uv = carpet.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3200 / 220, uv.getY(i) * 3200 / 220); })();
  carpet.position.set(0, -TABLE_H, -300); scene.add(carpet);
  const wallGeo = new T.PlaneGeometry(3200, 1300);
  (function () { const uv = wallGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3200 / 230, uv.getY(i) * 1300 / 230); })();
  const wall = new T.Mesh(wallGeo, new T.MeshLambertMaterial({ map: tPanel }));
  wall.position.set(0, -TABLE_H + 650, WALL_Z); scene.add(wall);
  const base = new T.Mesh(new T.BoxGeometry(3200, 26, 8), new T.MeshLambertMaterial({ color: 0x1b1008 }));
  base.position.set(0, -TABLE_H + 13, WALL_Z + 4); scene.add(base);
  // the marquee sign on the wall to his left (your right), a shelf of game boxes on the other side, a box lot on the floor
  const sign = new T.Mesh(new T.PlaneGeometry(172, 50), new T.MeshBasicMaterial({ map: tSign }));
  sign.position.set(188, -20, WALL_Z + 2); scene.add(sign);
  const signGlow = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: 0x6fa8ff, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4 }));
  signGlow.scale.set(300, 120, 1); signGlow.position.set(188, -20, WALL_Z + 4); scene.add(signGlow);
  const shelfMat = new T.MeshPhongMaterial({ color: 0x7a4a24, specular: 0x333333, shininess: 30 });
  const boxCols = ["#ff4b3e", "#16b9e8", "#ff3fa4", "#58c322", "#ffb81f", "#8a5cff"];
  const boxMats = boxCols.map(function (col) { return new T.MeshPhongMaterial({ map: tex(boxCanvas(col, script)), specular: 0x999999, shininess: 60 }); });
  const boxSide = new T.MeshLambertMaterial({ color: 0x1b1d26 });
  const boxGeo = roundBox(T, 30, 42, 8, 1.2);
  const rndB = rng(91), SX = -222, SW = 200, SD = 30, SZ = WALL_Z + SD / 2 + 1, SH = 150;
  [-1, 1].forEach(function (sg) { const m = new T.Mesh(roundBox(T, 6, SH, SD, 1.5), shelfMat); m.position.set(SX + sg * (SW / 2 - 3), -TABLE_H + SH / 2, SZ); scene.add(m); });
  for (let row = 0; row < 3; row++) {
    const y = -TABLE_H + 4 + row * 70;
    const board = new T.Mesh(roundBox(T, SW, 5, SD, 1.5), shelfMat); board.position.set(SX, y, SZ); scene.add(board);
    if (row === 2) break;
    for (let i = 0; i < 5; i++) {
      const m = new T.Mesh(boxGeo, [boxSide, boxSide, boxSide, boxSide, boxMats[Math.floor(rndB() * boxMats.length)], boxSide]);
      m.position.set(SX - 72 + i * 36, y + 24, SZ + 4); m.rotation.y = (rndB() - 0.5) * 0.12; m.rotation.z = (rndB() - 0.5) * 0.06; scene.add(m);
    }
  }
  const crate = new T.Mesh(roundBox(T, 92, 56, 62, 2), [0, 1, 2, 3, 4, 5].map(function (i) { return new T.MeshLambertMaterial({ map: i === 4 ? tex(crateCanvas()) : null, color: i === 4 ? 0xffffff : 0xb98a52 }); }));
  crate.position.set(176, -TABLE_H + 28, WALL_Z + 62); crate.rotation.y = -0.12; scene.add(crate);
  for (let i = 0; i < 4; i++) {
    const m = new T.Mesh(boxGeo, [boxSide, boxSide, boxSide, boxSide, boxMats[(i * 2 + 1) % boxMats.length], boxSide]);
    m.position.set(150 + i * 17, -TABLE_H + 62, WALL_Z + 60 - i * 3); m.rotation.set(-0.25 + i * 0.05, -0.12 + (i - 1.5) * 0.12, (i - 1.5) * 0.1); scene.add(m);
  }

  /* the table */
  const railMat = new T.MeshPhongMaterial({ color: 0x1b5fe0, specular: 0xffffff, shininess: 90, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12 });
  const trimMat = new T.MeshPhongMaterial({ color: 0xff9214, specular: 0xffffff, shininess: 80 });
  const rubberMat = new T.MeshPhongMaterial({ color: 0x101830, specular: 0x666688, shininess: 40 });
  const apronMat = new T.MeshPhongMaterial({ color: 0x0b3aa6, specular: 0x8899cc, shininess: 60, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.08 });
  const legMat = new T.MeshPhongMaterial({ color: 0x1b1d26, specular: 0x888888, shininess: 60 });
  const OX = X1 - X0 + RAIL_T * 2, OZ = Y1 - Y0 + RAIL_T * 2;      // outside of the rails
  function rail(x1, z1, x2, z2) {                           // in table coordinates
    const w = x2 - x1, d = z2 - z1, hh = RAIL_H + 8;
    const m = lit(new T.Mesh(roundBox(T, w, hh, d, 3), railMat), false, true);
    m.position.set((x1 + x2) / 2 - CX, hh / 2 - 8, (z1 + z2) / 2 - CZ); scene.add(m);
    const tr = new T.Mesh(roundBox(T, w - 2, 3, Math.min(d, w) * 0.5, 1.2), trimMat);
    tr.position.set(m.position.x, RAIL_H + 0.6, m.position.z); scene.add(tr);
  }
  rail(X0 - RAIL_T, Y0 - RAIL_T, X0, Y1 + RAIL_T); rail(X1, Y0 - RAIL_T, X1 + RAIL_T, Y1 + RAIL_T);
  rail(X0, Y0 - RAIL_T, 180 - GOAL, Y0); rail(180 + GOAL, Y0 - RAIL_T, X1, Y0);
  rail(X0, Y1, 180 - GOAL, Y1 + RAIL_T); rail(180 + GOAL, Y1, X1, Y1 + RAIL_T);
  // the rubber strip the puck bounces off, along the inside of every rail
  function strip(x1, z1, x2, z2) {
    const m = new T.Mesh(new T.BoxGeometry(x2 - x1, 8, z2 - z1), rubberMat);
    m.position.set((x1 + x2) / 2 - CX, 6, (z1 + z2) / 2 - CZ); scene.add(m);
  }
  strip(X0 - 2.5, Y0, X0, Y1); strip(X1, Y0, X1 + 2.5, Y1);
  strip(X0, Y0 - 2.5, 180 - GOAL, Y0); strip(180 + GOAL, Y0 - 2.5, X1, Y0);
  strip(X0, Y1, 180 - GOAL, Y1 + 2.5); strip(180 + GOAL, Y1, X1, Y1 + 2.5);
  // the goal slots: open boxes the puck drops into
  const slotMat = new T.MeshBasicMaterial({ color: 0x05070d, side: T.BackSide });
  [Y0 - RAIL_T / 2, Y1 + RAIL_T / 2].forEach(function (z) {
    const m = new T.Mesh(new T.BoxGeometry(GOAL * 2, 46, RAIL_T + 0.5), slotMat);
    m.position.set(0, -23, z - CZ); scene.add(m);
  });
  // goal lights on the posts either side of each slot: pink his end, cyan yours
  const lights = [[], []];
  [[Y0 - RAIL_T / 2, 0xff3fa4, 1], [Y1 + RAIL_T / 2, 0x3ff0ff, 0]].forEach(function (gs) {
    [-1, 1].forEach(function (sg) {
      const post = new T.Mesh(roundBox(T, 12, RAIL_H + 12, RAIL_T + 2, 3), railMat);
      post.position.set(sg * (GOAL + 6), (RAIL_H + 12) / 2 - 8, gs[0] - CZ); scene.add(post);
      const bulb = new T.Mesh(new T.SphereGeometry(4.2, 14, 10), new T.MeshBasicMaterial({ color: gs[1] }));
      bulb.position.set(sg * (GOAL + 6), RAIL_H + 5, gs[0] - CZ); scene.add(bulb);
      const glow = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: gs[1], blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 }));
      glow.scale.set(26, 26, 1); glow.position.copy(bulb.position); scene.add(glow);
      lights[gs[2]].push({ bulb: bulb, glow: glow });
    });
  });
  // the skirt under the surface (open on top, so the ice can show what it reflects), legs, and its shadow on the carpet
  [[0, -CZ + Y0 - RAIL_T, OX, 6], [0, Y1 + RAIL_T - CZ, OX, 6], [X0 - RAIL_T - CX, 0, 6, OZ], [X1 + RAIL_T - CX, 0, 6, OZ]].forEach(function (a) {
    const m = new T.Mesh(roundBox(T, a[2], APRON, a[3], 2.5), apronMat);
    m.position.set(a[0], -8 - APRON / 2, a[1] + (a[3] === 6 ? (a[1] < 0 ? 3 : -3) : 0)); scene.add(m);
  });
  const under = new T.Mesh(new T.PlaneGeometry(X1 - X0 + 4, Y1 - Y0 + 4).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xc2d2ea }));
  under.position.set(0, -44, 0); scene.add(under);
  const legGeo = roundBox(T, 26, TABLE_H - APRON - 8, 26, 5);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
    const m = lit(new T.Mesh(legGeo, legMat), true, false);
    m.position.set(p[0] * (OX / 2 - 26), -TABLE_H + (TABLE_H - APRON - 8) / 2, p[1] * (OZ / 2 - 40)); scene.add(m);
  });
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
  const floorShadow = add(new T.Mesh(unit, decal(new T.MeshBasicMaterial({ map: tShadow, opacity: 0.55 }), 2)));
  floorShadow.scale.set(OX * 1.25, 1, OZ * 1.15); floorShadow.position.set(0, -TABLE_H + 0.5, 0);

  /* the ice: glossy and a touch see-through, so the mallets and the puck show a soft reflection */
  const iceMat = new T.MeshPhongMaterial({ map: tIce, specular: 0x5a6070, shininess: 160, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.035,
                                            transparent: true, opacity: 0.86, depthWrite: false });
  const ice = lit(new T.Mesh(new T.PlaneGeometry(X1 - X0, Y1 - Y0).rotateX(-Math.PI / 2), iceMat), false, true);
  ice.position.set((X0 + X1) / 2 - CX, 0, (Y0 + Y1) / 2 - CZ); ice.renderOrder = 1; scene.add(ice);
  const mirror = new T.Group(); mirror.scale.y = -1; scene.add(mirror);

  /* puddles and fog for the scenery (shown only when the scenery calls for them) */
  const puddleMat = decal(new T.MeshBasicMaterial({ color: 0x5f9cff, opacity: 0.32 }), 3);
  const puddles = [0, 1].map(function () { const m = add(new T.Mesh(new T.CircleGeometry(1, 28).rotateX(-Math.PI / 2), puddleMat)); m.visible = false; return m; });
  const fog = add(new T.Mesh(new T.PlaneGeometry(X1 - X0, MID - Y0 - 30).rotateX(-Math.PI / 2),
    decal(new T.MeshBasicMaterial({ color: 0xe6ecf4, opacity: 0.52 }), 8)));
  fog.position.set((X0 + X1) / 2 - CX, 30, (Y0 + MID - 30) / 2 - CZ); fog.visible = false;   // the 2D game's fog: his half, short of the center line

  /* mallets and the puck, each with a twin under the ice and a soft shadow */
  const malGeo = new T.LatheGeometry([[0, 0], [PR - 1, 0], [PR, 1.5], [PR, 5], [PR - 1.6, 6.6], [13, 7.6], [8.2, 10], [6.4, 13], [6.6, 15.5], [8.4, 18.5], [9, 21.5], [8.2, 24.4], [5.4, 26.4], [0, 27]].map(function (p) { return new T.Vector2(p[0], p[1]); }), 30);
  function malletMat(col) { return new T.MeshPhongMaterial({ color: col, specular: 0xffffff, shininess: 110, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.16 }); }
  const shadowMat = decal(new T.MeshBasicMaterial({ map: tShadow, opacity: 0.6 }), 4);
  function piece(geo, mat, dimMat) {
    const m = new T.Mesh(geo, mat); scene.add(m);
    const tw = new T.Mesh(geo, dimMat); mirror.add(tw);
    const sh = add(new T.Mesh(unit, shadowMat));
    return { mesh: m, twin: tw, shadow: sh };
  }
  const mals = [piece(malGeo, malletMat(0x18d6f0), malletMat(0x149bb0)), piece(malGeo, malletMat(0xff3fa4), malletMat(0xb02a72))];
  const puckSide = new T.MeshPhongMaterial({ color: 0xf4efdf, specular: 0xffffff, shininess: 80 });
  const puckTop = new T.MeshPhongMaterial({ map: tPuck, specular: 0x444444, shininess: 60, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.05 });
  const puckGeo = new T.CylinderGeometry(KR, KR, PUCK_T, 36);
  const puck = piece(puckGeo, [puckSide, puckTop, puckSide], [puckSide, puckTop, puckSide]);
  const drop = new T.Mesh(puckGeo, [puckSide, puckTop, puckSide]); drop.visible = false; scene.add(drop);

  /* LED ribbon board: a dark housing standing on the far rail, the dot matrix on its face, leaning back toward you */
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
  const board = new T.Group(); board.position.set(0, RAIL_H - 1, BOARD.z); board.rotation.x = BOARD.lean; scene.add(board);
  const houseMat = new T.MeshPhongMaterial({ color: 0x0c1430, specular: 0x8899cc, shininess: 70, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.08 });
  const house = lit(new T.Mesh(roundBox(T, BOARD.w + 6, BOARD.house, BOARD.depth, 2.5), houseMat), true, false);
  house.position.y = BOARD.house / 2; board.add(house);
  const houseTrim = new T.Mesh(roundBox(T, BOARD.w + 7, 3, BOARD.depth + 1, 1.2), trimMat); houseTrim.position.y = BOARD.house - 1; board.add(houseTrim);
  const ledFace = new T.Mesh(new T.PlaneGeometry(BOARD.w, BOARD.face), ledMat);
  ledFace.position.set(0, (BOARD.house - 3) / 2 + 0.5, BOARD.depth / 2 + 0.2); board.add(ledFace);
  board.updateMatrixWorld(true);
  const topW = new T.Vector3(0, BOARD.house + 0.5, -BOARD.depth / 2 + 2).applyMatrix4(board.matrixWorld);

  /* the collector */
  const person = makePerson(T, figureGeometry(T), { looks: lookTex, env: tEnv, Color: T.Color });
  person.root.position.set(0, -TABLE_H, OPP_Z); scene.add(person.root);
  const personShadow = add(new T.Mesh(unit, decal(new T.MeshBasicMaterial({ map: tShadow, opacity: 0.5 }), 2)));
  personShadow.scale.set(170, 1, 120); personShadow.position.set(0, -TABLE_H + 0.6, OPP_Z);

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  const out = {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, script: script, eul: new T.Euler(),
    hemi: hemi, key: key, fill: fill, iceMat: iceMat, mirror: mirror, mals: mals, puck: puck, drop: drop, lights: lights,
    puddles: puddles, fog: fog, opp: person, personShadow: personShadow,
    boardTop: { y: (topW.y + TABLE_H) / FT, z: (topW.z - OPP_Z) / FT },
    camPos: new T.Vector3(), camTgt: new T.Vector3(), camReady: false, fit: null,
    v: new T.Vector3(), v2: new T.Vector3(), v3: new T.Vector3(),
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0,
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, shadowsOn: true, mirrorOn: true, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };

  /* frame the table: the closest camera, at a fixed pitch, that keeps the rails, the board and the collector's head on screen */
  R = out;
  S = S.k ? S : { c: { x: 180, y: Y0 + 60 }, k: { x: 180, y: MID }, phase: "face" };
  V.oppX = 0;
  poseOpponent(0, true);
  person.root.updateMatrixWorld(true);
  const hp = new T.Vector3(); person.head.getWorldPosition(hp);
  const pts = [[-OX / 2, RAIL_H, OZ / 2], [OX / 2, RAIL_H, OZ / 2], [-OX / 2, RAIL_H, -OZ / 2], [OX / 2, RAIL_H, -OZ / 2],
               [-OX / 2 - 3, topW.y, topW.z], [OX / 2 + 3, topW.y, topW.z], [-60, hp.y + 0.62 * FT, hp.z], [60, hp.y + 0.62 * FT, hp.z]];
  const sinP = Math.sin(CAM_PITCH), cosP = Math.cos(CAM_PITCH), tanF = Math.tan(CAM_FOV * Math.PI / 360);
  function bounds(tx, tz, d) {
    camera.position.set(tx, d * sinP, tz + d * cosP); camera.lookAt(tx, 0, tz); camera.updateMatrixWorld();
    let x1 = 1e9, x2 = -1e9, y1 = 1e9, y2 = -1e9;
    for (let i = 0; i < pts.length; i++) {
      out.v.set(pts[i][0], pts[i][1], pts[i][2]).project(camera);
      const px = (out.v.x * 0.5 + 0.5) * W, py = (-out.v.y * 0.5 + 0.5) * H;
      if (px < x1) x1 = px; if (px > x2) x2 = px; if (py < y1) y1 = py; if (py > y2) y2 = py;
    }
    return { x1: x1, x2: x2, y1: y1, y2: y2 };
  }
  function centered(d) {
    let tz = 0, bb = null;
    const ppu = H / (2 * d * tanF);
    for (let n = 0; n < 8; n++) {
      bb = bounds(0, tz, d);
      tz += ((bb.y1 + bb.y2) / 2 - (SAFE.y1 + SAFE.y2) / 2) / (ppu * sinP);
    }
    return { tz: tz, d: d, bb: bounds(0, tz, d) };
  }
  let lo = 300, hi = 5000, best = null;
  for (let n = 0; n < 18; n++) {
    const mid = (lo + hi) / 2, c = centered(mid);
    if (c.bb.x1 >= SAFE.x1 && c.bb.x2 <= SAFE.x2 && c.bb.y2 - c.bb.y1 <= SAFE.y2 - SAFE.y1) { best = c; hi = mid; } else lo = mid;
  }
  out.fit = best || centered(5000);
  out.sinP = sinP; out.cosP = cosP;
  return out;
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
// pr = pixel ratio cap, sh = his shadow on the ice, mirror = reflections in the ice
const QUALITY = [{ pr: 2, sh: true, mirror: true }, { pr: 1.5, sh: true, mirror: true }, { pr: 1.15, sh: false, mirror: true }, { pr: 1, sh: false, mirror: false }];

function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  const Q = QUALITY[R.quality];
  if (Q.sh !== R.shadowsOn) { R.shadowsOn = Q.sh; R.key.castShadow = Q.sh; }
  if (Q.mirror !== R.mirrorOn) {
    R.mirrorOn = Q.mirror;
    R.mirror.visible = Q.mirror;
    R.iceMat.transparent = Q.mirror; R.iceMat.opacity = Q.mirror ? 0.86 : 1; R.iceMat.depthWrite = !Q.mirror;
    R.iceMat.needsUpdate = true;
  }
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
      const before = pixelRatio(), Q0 = QUALITY[R.quality];
      let q = R.quality + 1;
      while (q < QUALITY.length - 1 && Math.min(window.devicePixelRatio || 1, QUALITY[q].pr) === before && QUALITY[q].sh === Q0.sh && QUALITY[q].mirror === Q0.mirror) q++;
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
  R.shakeMag = mag; R.shakeDur = R.shakeT = dur;
}

/* ---------------- Table <-> screen, through the 3D camera ---------------- */
// Table point at a height above the surface -> HUD pixels.
function toScreen(x, y, h) {
  if (!R || !R.camReady) return { x: x, y: y, ok: true };
  R.v3.set(x - CX, h || 0, y - CZ).project(R.camera);
  return { x: (R.v3.x * 0.5 + 0.5) * W, y: (-R.v3.y * 0.5 + 0.5) * H, ok: R.v3.z > -1 && R.v3.z < 1 };
}
// HUD pixel -> the table point under it at height h (null above the horizon).
function toTable(px, py, h) {
  const cam = R.camera;
  R.v3.set(px / W * 2 - 1, 1 - py / H * 2, 0.5).unproject(cam);
  R.v3.sub(cam.position);
  if (R.v3.y > -1e-6) return null;
  const t = ((h || 0) - cam.position.y) / R.v3.y;
  return { x: cam.position.x + R.v3.x * t + CX, y: cam.position.z + R.v3.z * t + CZ };
}

/* ---------------- Game state -> meshes ---------------- */
function placePiece(o, x, y, h, yaw, tilt, show) {
  o.mesh.visible = show;
  o.mesh.position.set(x - CX, h, y - CZ);
  o.mesh.rotation.set(tilt ? tilt.x : 0, yaw || 0, tilt ? tilt.z : 0);
  o.twin.visible = show && R.mirrorOn;
  if (o.twin.visible) { o.twin.position.copy(o.mesh.position); o.twin.quaternion.copy(o.mesh.quaternion); }
  o.shadow.visible = show;
}

function syncScene(state, fdt) {
  const idle = state === "title" || state === "over", calm = Shell.reduced;
  R.clock += fdt;
  ledTick(fdt);

  /* what the board and the band react to that the rules do not announce */
  if (state === "playing") {
    if (S.phase === "face" && V.matchShown !== S.match) {
      V.matchShown = S.match;
      ledPlay([ledCrawl("NOW AT THE TABLE: " + opp().name.toUpperCase(), "cyan")]);
      Juke.sfx("face");
    }
    if (S.x) {
      const fa = S.x.fever.active();
      if (fa && !V.fever) { ledPlay([ledMsg("cycle", "HOT STREAK", 2.2)]); Juke.sfx("hot"); }
      V.fever = fa;
      if (S.x.rares > V.rares) { ledPlay([ledMsg("slide", "RARE FIND!", 2, { color: "lime" })]); Juke.sfx("rare"); }
      V.rares = S.x.rares;
    }
  }
  if (V.react > 0) V.react = Math.max(0, V.react - fdt);
  if (V.react <= 0) V.reactKind = "";

  /* his look changes with each new collector */
  const li = Math.min(S.match, LOOKS.length - 1);
  if (li !== V.look && S.phase !== "next") { V.look = li; setLook(R.opp, li); }

  /* puck */
  const k = S.k, showPuck = S.phase === "face" || S.phase === "play";
  const sp = Math.hypot(k.vx, k.vy);
  if (!calm) V.yaw += fdt * clamp(k.vx / 55, -12, 12);
  placePiece(R.puck, k.x, k.y, PUCK_T / 2 + 0.2, V.yaw, null, showPuck);
  R.puck.shadow.position.set(k.x - CX + 1.5, 0.12, k.y - CZ + 1);
  R.puck.shadow.scale.set(KR * 2.9, 1, KR * 2.9);
  // a goal: the puck carries on into the slot and drops out of sight
  const dr = V.drop;
  R.drop.visible = false;
  if (dr) {
    dr.t += fdt;
    const u = dr.t, endY = dr.far ? Y0 - RAIL_T / 2 : Y1 + RAIL_T / 2, dirY = dr.far ? -1 : 1;
    const yy = dr.y + clamp(Math.abs(dr.vy) * u, 0, Math.abs(endY - dr.y)) * dirY;
    const xx = clamp(dr.x + dr.vx * u * 0.3, 180 - GOAL + KR, 180 + GOAL - KR);
    const fall = Math.max(0, u - 0.03) * Math.max(0, u - 0.03) * 900;
    R.drop.visible = fall < 44 && u < 0.6;
    R.drop.position.set(xx - CX, PUCK_T / 2 + 0.2 - fall, yy - CZ);
    R.drop.rotation.set(dirY * Math.min(1, fall / 20) * 0.9, dr.yaw, 0);
    if (u > 0.6) V.drop = null;
  }

  /* mallets: a slight tilt into the direction they are moving */
  const mm = [S.p, S.c];
  for (let i = 0; i < 2; i++) {
    const m = mm[i], tk = calm ? 0 : 0.0006;
    const tl = { x: clamp(m.vy || 0, -900, 900) * tk, z: -clamp(m.vx || 0, -900, 900) * tk };
    placePiece(R.mals[i], m.x, m.y, 0, 0, tl, true);
    R.mals[i].shadow.position.set(m.x - CX + 2, 0.1, m.y - CZ + 1.5);
    R.mals[i].shadow.scale.set(PR * 2.7, 1, PR * 2.7);
  }

  /* goal lights: pulse after a goal */
  for (let g = 0; g < 2; g++) {
    V.flash[g] = Math.max(0, V.flash[g] - fdt * 0.7);
    const f = V.flash[g], on = f > 0 && !calm ? (Math.sin(R.clock * 30) > 0 ? 1 : 0.35) * f : f;
    for (let i = 0; i < R.lights[g].length; i++) {
      const L = R.lights[g][i];
      L.glow.material.opacity = 0.45 + 0.55 * on;
      L.glow.scale.setScalar(26 + 60 * on);
    }
  }

  /* scenery: puddles in the rain, fog over his half, the lights out */
  const sc = S.x ? S.x.sc.id : "";
  for (let i = 0; i < 2; i++) {
    const p = S.x && S.x.puddles[i], show = sc === "rain" && !!p;
    R.puddles[i].visible = show;
    if (show) { R.puddles[i].position.set(p.x - CX, 0.3, p.y - CZ); R.puddles[i].scale.set(p.r, 1, p.r * 0.7); }
  }
  R.fog.visible = sc === "fog";
  const dark = S.x && S.x.dark > 0 ? 0.32 : 1;
  R.hemi.intensity = LIGHT.hemi * dark; R.key.intensity = LIGHT.key * dark; R.fill.intensity = LIGHT.fill * dark;

  /* the collector */
  poseOpponent(fdt, idle);
  R.personShadow.position.x = V.oppX;

  /* camera: framed once to fit the table; a slow drift behind the title and score cards */
  const f = R.fit;
  let tx = 0, tz = f.tz, dist = f.d;
  if (idle && !calm) { tx = Math.sin(idleT * 0.4) * 14; dist *= 1 + Math.sin(idleT * 0.27) * 0.012; }
  R.camTgt.set(tx, 0, tz); R.camPos.set(tx, dist * R.sinP, tz + dist * R.cosP);
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (vrand() * 2 - 1) * m; sy = (vrand() * 2 - 1) * m;
  }
  R.camera.position.set(R.camPos.x + sx, R.camPos.y + sy, R.camPos.z);
  R.camera.lookAt(R.camTgt.x + sx, R.camTgt.y + sy, R.camTgt.z);
  R.camera.updateMatrixWorld();
  R.camReady = true;
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
// The table's outline on screen, for the extras that draw over the table.
function tableArea() {
  const a = toScreen(X0 - RAIL_T, Y0 - RAIL_T, RAIL_H), b = toScreen(X1 + RAIL_T, Y0 - RAIL_T, RAIL_H);
  const c = toScreen(X0 - RAIL_T, Y1 + RAIL_T, RAIL_H), d = toScreen(X1 + RAIL_T, Y1 + RAIL_T, RAIL_H);
  const x1 = Math.min(a.x, c.x), x2 = Math.max(b.x, d.x), y1 = Math.min(a.y, b.y), y2 = Math.max(c.y, d.y);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function drawWorld(c, state) {
  // a ring under your mallet before the first serve, so it is easy to find
  if (state === "playing" && S.phase === "face" && S.match === 0 && S.me + S.cpu === 0 && !Shell.reduced) {
    const p = toScreen(S.p.x, S.p.y, 0), q = toScreen(S.p.x + PR, S.p.y, 0), r = Math.abs(q.x - p.x), u = (S.t * 1.1) % 1;
    c.lineWidth = 2; c.strokeStyle = "rgba(63,240,255," + (0.9 * (1 - u)).toFixed(3) + ")";
    c.beginPath(); c.ellipse(p.x, p.y, r * (1.3 + u * 0.9), r * (1.3 + u * 0.9) * R.sinP, 0, 0, TAU); c.stroke();
    txt(c, "YOU", p.x, p.y + r * 0.9 + 6, 10, "#ffffff", "center", "#08205f");
  }
  if (!S.x) return;
  const area = tableArea();
  if (S.x.rare) {                                           // a rare cart sitting on his half: knock the puck through it
    const p = toScreen(S.x.rare.x, S.x.rare.y, 10), q = toScreen(S.x.rare.x + 20, S.x.rare.y, 10);
    X.drawCart(c, p.x, p.y, S.x.rare.tier.t, S.t, clamp(Math.abs(q.x - p.x) / 20, 0.4, 1.2) * 0.8);
  }
  X.drawScenery(c, S.x.sc, S.t, area);
  S.x.fever.draw(c, area, S.t);
}

function drawHUD(c, state) {
  const bg = c.createLinearGradient(0, 0, 0, HUD_H - 3);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, 0, W, HUD_H - 3);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff9214"; c.fillRect(0, HUD_H - 3, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, HUD_H - 1, W, 1);
  const o = opp();
  txt(c, "MATCH " + (S.match + 1) + "  VS", 10, 5, 9, "#a8ecff", "left", "#08205f");
  let size = 13;
  c.font = "bold " + size + "px " + HUD_FONT;
  while (size > 9 && c.measureText(o.name).width > 232) { size--; c.font = "bold " + size + "px " + HUD_FONT; }
  txt(c, o.name, 10, 17, size, "#ffe45c", "left", "#08205f");
  txt(c, "FIRST TO " + TO_WIN + "    STREAK " + S.wins, 10, 34, 9, "#ffffff", "left", "#08205f");
  // the score: his on the left, yours on the right
  [["HIM", S.cpu, "#ff3fa4", W - 106], ["YOU", S.me, "#3ff0ff", W - 54]].forEach(function (b) {
    rrect(c, b[3], 4, 48, 40, 5); c.fillStyle = "#08205f"; c.fill();
    c.lineWidth = 2; c.strokeStyle = b[2]; c.stroke();
    txt(c, b[0], b[3] + 24, 7, 8, b[2], "center");
    txt(c, String(b[1]), b[3] + 24, 18, 20, "#ffffff", "center");
  });
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
  const fdt = state === "paused" || (X && X.eventActive()) ? 0 : Math.min(ms, 50) / 1000;
  if (sized) {
    syncScene(state, fdt);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  drawWorld(c, state);
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    c.globalAlpha = clamp(q.life * 2, 0, 1);
    c.fillStyle = q.c; c.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
  }
  c.globalAlpha = 1;
  drawHUD(c, state);
  if (S.x) { X.drawTag(c, S.x.sc, 10, H - 12); X.drawEvent(c, W, H); }
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
  R.hud = hud; R.stage = stage;
  if (getComputedStyle(stage).position === "static") stage.style.position = "relative";
  const gl = R.gl;
  gl.style.cssText = "position:absolute;left:0;top:0;z-index:0;display:block;margin:0;padding:0;border:0;box-shadow:none;" +
    "max-width:none;max-height:none;transform:none;image-rendering:auto;pointer-events:none;touch-action:none;" +
    "border-radius:" + getComputedStyle(hud).borderRadius;
  stage.insertBefore(gl, hud);
  // the shell canvas becomes a clear HUD layer over the 3D view
  hud.style.background = "transparent";
  if (getComputedStyle(hud).position === "static") hud.style.position = "relative";   // so it stacks above the WebGL canvas
  const crt = stage.querySelector(".np-crt");
  if (crt) crt.style.display = "none";                       // glossy rec room, no scanlines
  R.lastT = performance.now();
  layout();
}

function startGame() {
  Shell.init({
    slug: "table-rink-rumble",
    title: "TABLE RINK RUMBLE",
    accent: "#ff3fa4",
    width: W, height: H,
    format: function (n) { var w = Math.floor(n / 10), m = n % 10; return w + "W" + (m ? " +" + m : ""); },
    howTo: "First to 7 on the rec room table, in real 3D. Drag anywhere, even below the table, and your paddle moves with your finger. Beat one collector and the next one sits down.",
    keys: "Keys: arrows move the paddle. Mouse: just move it. P pause, M mute, N music, R restart.",
    tip: "Best score is your win streak, plus your biggest winning margin.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { for (const k in keys) keys[k] = false; drag = null; }
  });
  attach();
  bindTouchPad();
  // Sound. Nothing is created until the first tap, click or key press; the band starts with the game.
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Juke.unlock, true); });
  Shell.onStart(Juke.newGame); Shell.onRestart(Juke.newGame); Shell.onResume(Juke.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));   // not while initials are being typed
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Juke.toggleMusic();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) Juke.button(titleCard, titleCard.querySelector(".np-tip"));
  if (pauseActions) Juke.button(pauseActions, pauseActions.querySelector("a"));
  // The studio logo heads the score card. The title menu stays clean: the splash is its logo moment,
  // and the wordmark is all over the room behind the title card.
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) {
    const im = document.createElement("img");
    im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96;
    im.style.cssText = "display:block;width:clamp(64px,14vh,104px);height:auto;margin:0 auto 6px";
    im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
    im.src = LOGO_URL;
    card.insertBefore(im, card.firstChild);
  }
}

// Hook for automated checks (no effect on play)
window.__table = { S: function () { return S; }, update: update, OPP: OPP, gfx: function () { return R; }, led: function () { return LED; },
                   view: function () { return V; }, toScreen: toScreen, toTable: toTable, pointer: pointer, juke: Juke, startMusic: startMusic };

// The house band, for the arcade radio (or anything else that wants it): import { startMusic } from this module.
export { startMusic };

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
          ? "Table Rink Rumble could not load its 3D engine (" + THREE_URL + ")."
          : "Table Rink Rumble needs WebGL for its 3D table, and this browser has it switched off or does not support it.");
      });
    });
})();
