/* RINK RAT SHOOTOUT (3D): you vs The Shelf Guardian. Three 30-second periods.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js), drawn on a
   WebGL canvas that sits directly under the shell's 2D canvas. The shell canvas stays in
   charge of input, scaling and the title / pause / game over flow, and carries the HUD.

   The rules, the scoring, the timing, the controls, the trophies and the batch 3 extras are the
   2D game's, unchanged: the same code decides every shot. Only the picture is new.
   Goal plane units are feet: x across (-3..3 is the net), y up (0..4 is the net). In three.js
   space the goal line runs along z = 0, the net sits behind it (z < 0) and the shooter skates in
   the slot in front of it (z > 0), so a goal-plane point (x, y) is simply (x, y, 0). */

const W = 360, H = 540, TAU = Math.PI * 2;
const NET_W = 3, NET_H = 4, POST = 0.16;
const PERIODS = 3, PERIOD_LEN = 30;
const REACT = [0.24, 0.17, 0.12], GSPEED = [8.5, 10.5, 12.5], GREACH = 1.6;
const POKE_AFTER = 2.2, SLOT = 1;
const SAVES = ["Is it on the shelf? Not yours.", "Already in his collection.", "Denied. Mint condition.", "Not for sale."];

/* ---------------- Rink layout (feet) ---------------- */
const SHOOT_Z = 12, SLIDE_X = 3;                          // the shooter's skates: SLIDE_X feet across for every 1 of S.px
const GOALIE_Z = 0.42;                                    // the goalie plays deep, right on top of the goal plane the rules use
const NET_D = 3.6, END_Z = -11, BOARD_H = 3.5, GLASS_H = 8;
const LED_Y0 = 0.95, LED_HT = 2.15;                       // the LED ribbon along the dasher boards behind the net
const CAM = { x: 0, y: 24, z: 47, tx: 0, ty: 0.8, tz: 0, fov: 19.5 };   // high behind the shooter, like the 2D layout
const PUCK_R = 0.19, PUCK_T = 0.11;                       // drawn a touch over size so it reads on a phone

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash, title card and score card
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every decal inside the arena
const THREE_URL = "../shared/three.module.min.js";
const FALLBACK_URL = "game-2d.js";                        // optional: the classic 2D game, used if 3D cannot start
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';

let S = {}, keys = {}, idleT = 0, parts = [];
let THREE = null, R = null, TV = null;                    // R holds everything the renderer owns
const X = window.NPX && window.NPX.on ? window.NPX : null; // batch 3 extras (shared/extras.js)
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// V is how things are being shown (poses, the puck after the whistle, lamps, the camera). It never feeds the rules.
const V = { shot: null, lastShot: null, zone: "", res: "", resT: 0, celebrate: 0, sad: 0, pokeT: -1, lamp: 0, cheer: 0, ooh: 0,
            netHit: 0, netX: 0, netY: 0, glove: 0, gloveX: 0, gloveY: 0, block: 0, blockX: 0, blockY: 0, snap: 0, drop: 0,
            pk: null, breakT: -1, load: 0, slideV: 0, lastPx: 0, stride: 0, fever: false, hatShown: -1, lastPhase: "", poked: 0 };

function reset() {
  S = { t: 0, pt: 0, period: 0, clock: PERIOD_LEN, phase: "ready", px: 0, g: 0, gy: 0, aimY: 1.2, kb: false,
        drag: null, shot: null, goals: 0, points: 0, tops: 0, posts: 0, saves: 0, shots: 0, streak: 0, bestStreak: 0,
        per: [0, 0, 0], frontT: 0, pokes: 0, net: 0, saveIdx: 0 };
  parts.length = 0;
  if (X) S.x = { sc: X.scenery(), fever: new X.Fever(15), sched: new X.Scheduler(18, 30, 2), rare: null, rares: 0, intro: false, fast: false, distract: false, bonusNext: 0 };
  V.shot = V.lastShot = V.pk = null; V.res = ""; V.celebrate = V.sad = V.lamp = V.cheer = V.ooh = V.netHit = V.glove = V.block = V.snap = V.drop = 0;
  V.pokeT = -1; V.breakT = -1; V.load = 0; V.slideV = 0; V.lastPx = 0; V.fever = false; V.hatShown = -1; V.poked = 0;
  ledClear();
  if (R) applyScenery();
}

function period() { return Math.min(PERIODS - 1, S.period); }
function goalieHome() { return clamp(S.px * 0.85, -1.2, 1.2); }

// Is the point (x, y) on the goal plane covered by a goalie centered at g?
function covered(x, y, g, drop) {
  const d = x - g;
  if (Math.abs(d) < 0.85 && y < 3.3) return "body";
  if (Math.abs(d) < 0.55 && y < 3.9) return "mask";
  if (y < (drop ? 1.0 : 0.6) && Math.abs(d) < (drop ? 2.1 : 1.3)) return "pads";
  if (d < -0.85 && d > -1.85 && y > 1.4 && y < 3.05) return "glove";
  if (d > 0.85 && d < 1.85 && y > 0.9 && y < 2.55) return "blocker";
  return "";
}

/* ---------------- Shooting (the 2D game's, untouched) ---------------- */
function canShoot() { return S.phase === "ready" && S.pt > 0.15; }

function shoot(ax, ay, len) {
  if (!canShoot()) return;
  let T = 0.42 - clamp(len, 0, 1) * 0.12;
  if (S.x) { if (S.x.sc.id === "rain") T += 0.04; if (S.x.fast) { T -= 0.06; S.x.fast = false; } }
  S.shot = { x: ax, y: ay, T: T, t: 0, fromX: S.px, res: null, gStart: S.g, distract: !!(S.x && S.x.distract) };
  if (S.x) S.x.distract = false;
  S.shots++;
  S.phase = "shot"; S.pt = 0; S.frontT = 0;
  S.drag = null;
  Shell.sfx("whoosh"); Shell.noise(0.05, 0.5, 2600, 1);
  Juke.sfx("snap");
}

function resolve() {
  const sh = S.shot, x = sh.x, y = sh.y, ax = Math.abs(x);
  let res, zone = "";
  const drop = y < 1.3;
  if ((Math.abs(ax - NET_W) < POST && y < NET_H + POST) || (ax < NET_W + POST && Math.abs(y - NET_H) < POST)) res = "post";
  else if (ax > NET_W || y > NET_H) res = "wide";
  else if ((zone = covered(x, y, S.g, drop))) res = "save";
  else res = "goal";
  sh.res = res;
  const p = period();
  let top = false;
  if (res === "goal") {
    top = ax > 2.0 && y > 2.85;
    let pts = top ? 2 : 1;
    if (S.x && S.x.bonusNext) { pts += S.x.bonusNext; S.x.bonusNext = 0; }
    S.goals++; S.points += pts; S.per[p]++; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak);
    if (top) S.tops++;
    S.net = 1;
    Shell.flash(top ? "TOP SHELF!" : "GOAL!", top ? "Top corner counts 2." : "+1", top ? "#ffd23f" : "#3ff0ff", 900);
    Shell.sfx("score"); Shell.sfx("crowd"); Shell.tone(330, 0.5, "sawtooth", 0.12);
    burst(x, y, top ? 30 : 14);
    if (window.Trophies) {
      Trophies.unlock("rrs-goal");
      if (top) Trophies.unlock("rrs-top");
      if (S.per[p] >= 3) Trophies.unlock("rrs-hat");
      if (top && p === 2) Trophies.unlock("rrs-late");
      if (S.streak >= 5) Trophies.unlock("rrs-streak");
    }
    if (window.NPRewards && S.streak >= 2) NPRewards.streak(S.streak);   // goals in a row (shared/rewards.js)
    if (S.x) { S.x.fever.hit("The goalie is a step slow"); extrasRare(x, y); }
  } else {
    S.streak = 0;
    if (S.x) S.x.fever.miss();
    if (res === "post") { S.posts++; Shell.sfx("ding"); Shell.flash("DING!", "Off the iron. 0 points.", "#eceae2", 800); if (window.Trophies) Trophies.unlock("rrs-ding"); }
    else if (res === "save") { S.saves++; Shell.sfx("hit"); Shell.flash("SAVE", SAVES[S.saveIdx++ % SAVES.length], "#ff3fa4", 900); }
    else { Shell.sfx("miss"); Shell.flash(y > NET_H ? "OVER THE BAR" : "WIDE", "", "#8e93a2", 700); }
  }
  present(res, top, zone);
}

/* ---------------- Update (the 2D game's, untouched) ---------------- */
function update(dt) {
  if (X && X.eventActive()) { X.eventTick(dt); return; }
  S.t += dt; S.pt += dt;
  let i;
  const p = period();
  for (i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 200 * dt; if (q.life <= 0) parts.splice(i, 1); }
  if (S.net > 0) S.net = Math.max(0, S.net - dt * 2);

  if (S.x) extrasTick(dt);
  if (S.phase === "break") {
    if (S.pt > 1.4) { S.phase = "ready"; S.pt = 0; S.clock = PERIOD_LEN; }
    return;
  }
  S.clock -= dt * (S.x && (S.x.sc.id === "sun") ? 1.1 : 1);
  if (S.clock <= 0 && S.phase !== "shot") {
    S.clock = 0;
    Shell.sfx("buzzer");
    S.period++;
    if (S.period >= PERIODS) { finish(); return; }
    S.phase = "break"; S.pt = 0; S.drag = null;
    Shell.flash("PERIOD " + (S.period + 1), S.period === 2 ? "He reads you faster now. Don't park in front." : "The Shelf Guardian is warming up.", "#3ff0ff", 1300);
    presentPeriod();
    return;
  }

  const mv = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
  if (mv && S.phase === "ready") { S.px = clamp(S.px + mv * 1.6 * (S.x && S.x.fever.active() ? 2 : 1) * dt, -SLOT, SLOT); S.kb = true; }
  const up = (keys.ArrowUp ? 1 : 0) + (keys.ArrowDown ? -1 : 0);
  if (up) { S.aimY = clamp(S.aimY + up * 3.2 * dt, 0.2, 3.9); S.kb = true; }

  // goalie: squares up to the puck, then reacts to the shot after a short delay
  let target = goalieHome();
  const react = REACT[p] + (S.x && S.x.fever.active() ? 0.08 : 0) + (S.shot && S.shot.distract ? 0.2 : 0);
  if (S.phase === "shot" && S.shot.t > react) target = clamp(S.shot.x * 0.9, -GREACH, GREACH);
  const gv = GSPEED[p] * (S.phase === "shot" ? 1 : 0.5) * (S.x ? (S.x.sc.id === "golden" ? 0.9 : S.x.sc.id === "suburbs" ? 1.1 : 1) : 1);
  S.g += clamp(target - S.g, -gv * dt, gv * dt);

  if (S.phase === "ready") {
    // period 3: park in the middle too long and he poke checks you
    if (p === 2 && Math.abs(S.px) < 0.35) {
      S.frontT += dt;
      if (S.frontT > POKE_AFTER) {
        S.frontT = 0; S.pokes++; S.drag = null;
        S.phase = "poked"; S.pt = 0;
        Shell.flash("POKE CHECK", "He took the puck. Keep moving.", "#ff3fa4", 900);
        Shell.sfx("hit");
        if (window.Trophies) Trophies.unlock("rrs-poke");
        presentPoke();
      }
    } else S.frontT = Math.max(0, S.frontT - dt * 2);
    return;
  }
  if (S.phase === "poked") { if (S.pt > 0.9) { S.phase = "ready"; S.pt = 0; } return; }
  if (S.phase === "shot") {
    const sh = S.shot;
    sh.t += dt;
    if (!sh.res && sh.t >= sh.T) resolve();
    if (sh.t > sh.T + 0.55) { S.shot = null; S.phase = "ready"; S.pt = 0; }
  }
}

/* ---------------- Batch 3 extras (the 2D game's, untouched) ---------------- */
const EVENTS = [
  { title: "Coffee Spill", text: "A fan leans over the glass with a hot cocoa and bumps your elbow.",
    a: { label: "Dodge", run: function () { if (X.coin(0.7)) return "Clean dodge. Your streak is safe."; S.streak = 0; S.x.fever.miss(); return "Splash. Your scoring streak resets."; } },
    b: { label: "Ignore it", run: function () { S.clock = Math.max(1, S.clock - 2); return "Cocoa on the glove. 2 seconds wiping it off."; } } },
  { title: "Mint Myth", text: "The ref swears this scuffed puck is in mint condition.",
    a: { label: "Argue", run: function () { if (X.coin(0.5)) { S.x.fast = true; return "He swaps in a fresh puck. Your next shot is faster."; } S.clock = Math.max(1, S.clock - 3); return "You lose 3 seconds arguing."; } },
    b: { label: "Shrug", run: function () { return "A puck is a puck."; } } },
  { title: "Early Bird", text: "The ice cleaner rolls out early. Knock on the glass?",
    a: { label: "Knock", run: function () { if (X.coin(0.5)) { S.x.distract = true; return "The goalie turns to look. He's slow on your next shot."; } S.clock = Math.max(1, S.clock - 3); return "Slush spray. 3 seconds lost."; } },
    b: { label: "Wait", run: function () { return "You wait it out."; } } },
  { title: "Rental Sticker", text: "Your stick still has a stubborn old rental sticker on it.",
    a: { label: "Peel it", run: function () { if (X.coin(0.5)) { S.x.bonusNext = 1; return "Clean peel. Your next goal is worth one extra point."; } return "It rips. The label art is ruined."; } },
    b: { label: "Leave it", run: function () { return "Character, you call it."; } } },
  { title: "Floor Find", text: "Something is under the team bench. Looks like a cartridge.",
    a: { label: "Grab it", run: function () { return rareNow(); } },
    b: { label: "Leave it", run: function () { return "Somebody else's lucky day."; } } }
];
function rareMult() { const sc = S.x.sc.id; return (sc === "suburbs" ? 3 : sc === "fog" ? 1.5 : 1) * (S.x.fever.active() ? 2 : 1); }
function rareNow() {
  const it = X.rollRare(rareMult()), fake = S.x.sc.id === "twilight" && X.coin(0.35);
  X.collect(it, fake);
  if (fake) return "Thin shell, wrong screws. A reproduction.";
  S.x.rares++; return it.n + " (" + X.TIER[it.t].word + ").";
}
function extrasRare(x, y) {   // a goal that goes in near the taped-on cartridge collects it
  const r = S.x.rare;
  if (r && Math.hypot(x - r.x, y - r.y) < 0.8) { S.x.rare = null; const it = X.rollRare(rareMult()), fake = S.x.sc.id === "twilight" && X.coin(0.35); X.collect(it, fake); if (!fake) { S.x.rares++; S.points += 1; } }
}
function extrasTick(dt) {
  const x = S.x;
  if (!x.intro) { x.intro = true; Shell.flash(x.sc.name, x.sc.line, "#9bff3f", 1500); }
  x.fever.tick(dt);
  if (S.phase === "ready" && !S.drag && S.pt > 0.3 && x.sched.due(S.t)) X.startEvent(X.pick(EVENTS), { noSpace: true });   // Space shoots here, so it never picks a choice
  if (S.phase === "ready" && !x.rare && S.pt > 0.2 && Math.random() < dt * 0.06 * rareMult()) {
    const side = Math.random() < 0.5 ? -1 : 1;
    x.rare = { x: side * (1.9 + Math.random() * 0.8), y: 0.5 + Math.random() * 3.0, life: 9 };
  }
  if (x.rare && (x.rare.life -= dt) <= 0) x.rare = null;
}

function finish() {
  const extra = S.x ? row("Scenery", S.x.sc.name) + row("Rare finds", S.x.rares + " this run, " + X.foundCount() + " of " + X.RARES.length + " found") + row("Hot Streaks", S.x.fever.count) : "";
  ledFinal(S.points);
  Shell.gameOver(S.points, { title: "FINAL HORN", html:
    row("Goals", S.goals + " of " + S.shots + " shots") + row("Top corners", S.tops) + row("Posts", S.posts) +
    row("By period", S.per.join("  /  ")) + row("Longest scoring streak", S.bestStreak) + extra,
    stats: { points: S.points, goals: S.goals, tops: S.tops, posts: S.posts, shots: S.shots, per: S.per.slice(), bestStreak: S.bestStreak, pokes: S.pokes } });
}
function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }
// Confetti over the spot on the goal plane where the puck went in (drawn on the HUD, placed through the 3D camera).
function burst(gx, gy, n) {
  const p = toScreen(gx, gy, 0), cols = ["#3ff0ff", "#ffd23f", "#ff3fa4", "#eceae2"];
  if (Shell.reduced) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 40 + Math.random() * 120; parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.9, c: cols[i % 4] }); }
}

/* ---------------- Input (the 2D game's, untouched) ---------------- */
// One gesture: slide sideways to move across the slot, then flick up to shoot.
function pointer(type, x, y) {
  if (X && X.eventActive()) { X.eventPointer(type, x, y); return; }
  if (type === "down") {
    if (!canShoot()) return;
    S.drag = { sx: x, sy: y, ox: x, oy: y, px0: S.px, mode: "slide", x: x, y: y }; S.kb = false;
  } else if (type === "move" && S.drag) {
    const d = S.drag; d.x = x; d.y = y;
    if (d.mode === "slide") {
      if (y > d.oy) { d.oy = y; d.ox = x; }
      if (d.oy - y > 16) d.mode = "flick";
      else S.px = clamp(d.px0 + (x - d.sx) / 110, -SLOT, SLOT);
    }
  } else if ((type === "up" || type === "cancel") && S.drag) {
    const dd = S.drag; S.drag = null;
    if (type === "cancel" || dd.mode !== "flick") return;
    const f = flick(dd);
    if (f) shoot(f.x, f.y, f.len);
  }
}
function flick(d) {
  const dy = d.oy - d.y, dx = d.x - d.ox;
  if (dy < 24) return null;
  const len = Math.hypot(dx, dy);
  return { x: S.px * 1.3 + clamp(dx / dy, -1.2, 1.2) * 3.4, y: clamp((len - 40) / 170 * 4.4, 0, 4.6), len: clamp(len / 240, 0, 1) };
}
function key(type, code, e) {
  if (X && X.eventActive()) { keys = {}; X.eventKey(type, code); return; }
  const act = code === "Space" || code === "Enter" || code === "NumpadEnter";
  if (type === "down") {
    keys[code] = true;
    if (act && !e.repeat && canShoot()) { S.kb = true; shoot(S.px * 2.85, S.aimY, 0.7); }
  } else keys[code] = false;
}

/* ---------------- Presentation hooks: called by the rules, they only start pictures and sounds ---------------- */
function present(res, top, zone) {
  V.res = res; V.zone = zone; V.resT = 0;
  const p = period();
  if (res === "goal") {
    V.celebrate = 1; V.lamp = 1; V.cheer = 1; V.netHit = 1; V.netX = S.shot.x; V.netY = S.shot.y;
    camShake(0.35, 0.3);
    Juke.sfx("horn", top); Juke.sfx("roar");
    const board = [ledMsg("flash", top ? "TOP SHELF!" : "GOAL!", 1.6)];
    if (S.per[p] === 3 && V.hatShown !== p) { V.hatShown = p; board.push(ledMsg("cycle", "HAT TRICK!", 1.8, { keep: true })); Juke.sfx("organ", 1, 0.9); }
    board.push(ledMsg("count", "POINTS", 1.8, { from: Math.max(0, LEDV.last), value: S.points, keep: true }));
    LEDV.last = S.points;
    ledPlay(board);
  } else if (res === "save") {
    V.sad = 1; V.ooh = 1;
    if (zone === "glove") { V.glove = 1; V.gloveX = S.shot.x; V.gloveY = S.shot.y; Juke.sfx("pop"); }
    else if (zone === "blocker") { V.block = 1; V.blockX = S.shot.x; V.blockY = S.shot.y; Juke.sfx("thud"); }
    else Juke.sfx("thud");
    Juke.sfx("ooh");
    ledPlay([ledMsg("blink", zone === "glove" ? "GLOVE SAVE" : "SAVE", 1.6, { color: "pink" })]);
  } else if (res === "post") {
    V.sad = 0.6; V.ooh = 1;
    Juke.sfx("clang"); Juke.sfx("ooh", 0, 0.1);
    ledPlay([ledMsg("blink", "DING!", 1.4, { color: "cyan" })]);
  } else {
    V.sad = 0.5;
    Juke.sfx("glass");
    ledPlay([ledMsg("blink", S.shot.y > NET_H ? "OVER" : "WIDE", 1.2, { color: "violet" })]);
  }
  V.pk = puckAfter(res, zone);
}
function presentPeriod() {
  V.breakT = 0;
  Juke.sfx("organ", 0, 0.25);
  ledPlay([ledMsg("slide", "PERIOD " + (S.period + 1), 1.6, { color: "cyan" }), ledMsg("slide", S.period === 2 ? "MOVE OR GET POKED" : "THE SHELF GUARDIAN", 1.8, { color: S.period === 2 ? "pink" : "violet" })]);
}
function presentPoke() {
  V.pokeT = 0; V.poked = 1;
  Juke.sfx("swipe");
  ledPlay([ledMsg("blink", "POKE CHECK", 1.4, { color: "pink" })]);
}

/* ---------------- Music: one self-contained station ----------------
   startMusic(ctx, dest) plays an original looping arcade/synth track (D minor, 138 BPM, sixteen bars: a hockey
   organ stab on the off-beats, octave bass, a square-wave lead with an echo, a triangle arpeggio, four-on-the-floor
   drums). Everything it needs lives inside it and it knows nothing about the game, so it can be lifted as is onto a
   shared arcade radio. It schedules itself a little ahead on its own timer and returns stop(), which fades it out
   and lets go of everything. Nothing here runs until the game calls it after the first tap or key press. */
function startMusic(ctx, dest) {
  const BPM = 138, STEP = 60 / BPM / 4, BARS = 16, STEPS = BARS * 16, AHEAD = 0.45;
  const CH = { Dm: [38, 62, 65, 69], Bb: [34, 62, 65, 70], C: [36, 60, 64, 67], Am: [33, 60, 64, 69],
               Gm: [31, 62, 67, 70], A: [33, 61, 64, 69], F: [41, 60, 65, 69] };
  const PROG = "Dm Bb C Am Dm Bb Gm A F C Dm Bb F C Bb A".split(" ");
  const LEAD = [
    "0A4-2 2D5-2 4F5-3 7E5-1 8D5-2 10A4-2 12C5-4",
    "0D5-2 2F5-2 4A5-3 7G5-1 8F5-2 10D5-2 12Bb4-4",
    "0E5-2 2G5-2 4C6-3 7Bb5-1 8A5-2 10G5-2 12E5-4",
    "0A5-3 3G5-1 4E5-2 6C5-2 8D5-2 10E5-6",
    "0A4-1 1A4-1 2D5-2 4F5-2 6A5-2 8G5-2 10F5-2 12E5-2 14F5-2",
    "0D5-4 4F5-2 6Bb5-2 8A5-4 12F5-4",
    "0G5-2 2Bb5-2 4D6-3 7C6-1 8Bb5-2 10A5-2 12G5-4",
    "0E5-2 2A5-2 4C#6-4 8E6-6 14C#6-2",
    "0C6-3 3A5-1 4F5-2 6A5-2 8C6-2 10D6-2 12C6-4",
    "0G5-3 3E5-1 4C5-2 6E5-2 8G5-2 10A5-2 12G5-4",
    "0F5-2 2A5-2 4D6-4 8C6-2 10A5-2 12F5-4",
    "0F5-2 2Bb5-2 4D6-2 6F6-2 8E6-4 12D6-4",
    "0A5-2 2C6-2 4F6-4 8E6-2 10D6-2 12C6-4",
    "0E6-2 2D6-2 4C6-2 6G5-2 8E5-4 12G5-4",
    "0Bb5-2 2A5-2 4G5-2 6F5-2 8D5-4 12F5-4",
    "0E5-2 2A5-2 4C#6-2 6E6-2 8A6-4 12G6-1 13F6-1 14E6-1 15C#6-1"
  ];
  const notes = new Array(STEPS).fill(null), semi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  LEAD.forEach(function (bar, b) {
    bar.split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])(b|#)?(\d)-(\d+)$/.exec(tok);
      if (m) notes[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + semi[m[2]] + (m[3] === "b" ? -1 : m[3] === "#" ? 1 : 0), Number(m[5])];
    });
  });
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // the mixing desk
  const out = ctx.createGain(); out.gain.value = 0; out.connect(dest);
  out.gain.setTargetAtTime(1, ctx.currentTime, 0.04);
  function filt(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const lead = filt("lowpass", 3400, 0.6, out), bass = filt("lowpass", 820, 1.1, out), organ = filt("lowpass", 2300, 0.5, out);
  const send = ctx.createGain(), echo = ctx.createDelay(1), back = ctx.createGain(), wet = filt("lowpass", 2000, 0.7, out);
  send.gain.value = 0.28; echo.delayTime.value = STEP * 3; back.gain.value = 0.3;
  lead.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(wet);
  const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  function tone(to, type, f0, t, dur, vol, f1, hold, det) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.01, dur * (hold == null ? 0.6 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t); if (det) o.detune.value = det;
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(t, dur, vol, type, f, q) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nb; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  function play(i, t) {
    const bar = i >> 4, s = i & 15, ch = CH[PROG[bar]], B = bar >= 8, n = notes[i];
    if (n) { tone(lead, "square", hz(n[0]), t, n[1] * STEP * 0.92, 0.12, 0, 0.6); tone(lead, "square", hz(n[0]), t, n[1] * STEP * 0.92, 0.05, 0, 0.6, 9); }
    if (!(s & 1)) tone(bass, "sawtooth", hz(ch[0] + ((s >> 1) & 1 ? 12 : 0)), t, STEP * 1.7, 0.22);               // octave bass on the eighths
    if (s % 4 === 2) for (let k = 1; k < 4; k++) {                                                              // the organ, on the off-beats
      tone(organ, "square", hz(ch[k]), t, STEP * 1.6, 0.038, 0, 0.7); tone(organ, "sine", hz(ch[k] + 12), t, STEP * 1.6, 0.03, 0, 0.7);
    }
    if (B || bar % 4 >= 2) tone(out, "triangle", hz(ch[1 + (s % 3)] + 12), t, STEP * 0.9, 0.05, 0, 0.4);         // arpeggio sparkle
    if (s % 4 === 0) tone(out, "sine", 140, t, 0.17, 0.55, 42, 0.08);                                            // kick
    const fill = (bar === 7 || bar === 15) && s >= 12;
    if (s === 4 || s === 12 || fill) { hiss(t, 0.13, fill ? 0.18 + 0.03 * (s - 12) : 0.26, "bandpass", 1800, 0.6); tone(out, "triangle", 210, t, 0.06, 0.12, 140, 0.1); }
    if (B && (s === 4 || s === 12)) hiss(t + 0.012, 0.09, 0.16, "bandpass", 1300, 1.4);                         // a clap on top in the B half
    if (s % 2 === 0) hiss(t, s % 4 === 2 ? 0.08 : 0.03, s % 4 === 2 ? 0.09 : 0.05, "highpass", 7600, 0.7);       // hats
  }

  let step = 0, nextT = ctx.currentTime + 0.06, stopped = false;
  function pump() {
    if (stopped) return;
    const now = ctx.currentTime;
    if (nextT < now) nextT = now + 0.03;                                                                         // after a stall, pick up the beat
    while (nextT < now + AHEAD) { play(step, nextT); step = (step + 1) % STEPS; nextT += STEP; }
  }
  pump();
  const timer = setInterval(pump, 60);
  return function stop() {
    if (stopped) return;
    stopped = true; clearInterval(timer);
    const t = ctx.currentTime;
    out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(function () { try { out.disconnect(); } catch (e) { /* already gone */ } }, 500);
  };
}

/* ---------------- Sound: the music station and the arena's own stingers ----------------
   The shell still plays every sound effect the 2D game had, exactly when it did. On top of that the game brings
   the music (startMusic above) and the arena: the goal horn, the crowd, the glove pop, the post, the organ. All of
   it is made in code with the Web Audio API, no audio files. Nothing is created until the first tap, click or key
   press; it follows the shell's mute button (the same "npArcade.muted" setting) and has its own remembered music
   switch ("npArcade.music"). */
const MUSIC_VOL = 0.2, SFX_VOL = 0.22;
const MUSIC_KEY = "npArcade.music";

const Juke = (function () {
  let A = null, dead = false, muted = false, stopMusic = null, timer = 0, fresh = true;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  const buttons = [];

  function rig(c) {
    const a = { c: c };
    a.out = c.createGain();                                  // follows the mute button
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    a.out.connect(comp); comp.connect(c.destination);
    a.music = c.createGain(); a.music.gain.value = MUSIC_VOL;
    a.duck = c.createGain();                                 // the band steps back while the horn blows
    a.music.connect(a.duck); a.duck.connect(a.out);
    a.sfx = c.createGain(); a.sfx.gain.value = SFX_VOL; a.sfx.connect(a.out);
    const len = Math.floor(c.sampleRate * 2);
    a.noise = c.createBuffer(1, len, c.sampleRate);
    const d = a.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return a;
  }
  function osc(a, type, f0, t, dur, vol, f1, hold, det) {
    const o = a.c.createOscillator(), g = a.c.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.55 : hold));
    o.type = type; o.frequency.setValueAtTime(f0, t); if (det) o.detune.value = det;
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.sfx); o.start(t); o.stop(t + dur + 0.03);
    return o;
  }
  function hiss(a, t, dur, vol, type, f0, q, f1, atk) {
    const s = a.c.createBufferSource(), f = a.c.createBiquadFilter(), g = a.c.createGain();
    s.buffer = a.noise; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 0.7;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(a.sfx); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  function duck(a, t, secs) {
    a.duck.gain.cancelScheduledValues(t);
    a.duck.gain.setTargetAtTime(0.35, t, 0.03);
    a.duck.gain.setTargetAtTime(1, t + secs, 0.3);
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  // The stingers. x is a detail of the moment (a top corner, the hat trick riff).
  function cue(a, name, t, x) {
    if (name === "snap") {                                   // stick on puck
      hiss(a, t, 0.05, 0.6, "highpass", 2400, 0.8); osc(a, "sine", 150, t, 0.07, 0.5, 60, 0.1);
    } else if (name === "horn") {                            // the goal horn: a low, brassy chord with a wobble
      const len = x ? 2.4 : 1.8;
      [[138.6, 0], [174.6, 6], [207.7, -5], [277.2, 3]].forEach(function (f, i) {
        const o = osc(a, "sawtooth", f[0], t, len, i === 3 ? 0.07 : 0.13, 0, 0.88, f[1]);
        const lfo = a.c.createOscillator(), lg = a.c.createGain(); lfo.frequency.value = 5.5; lg.gain.value = 2.2;
        lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + len);
      });
      hiss(a, t, len, 0.08, "bandpass", 600, 0.8, 0, 0.05);
      duck(a, t, len + 0.4);
    } else if (name === "roar") {                            // the crowd comes up out of its seats
      hiss(a, t, 2.6, 0.9, "bandpass", 900, 0.45, 1400, 0.25);
      hiss(a, t + 0.1, 2.2, 0.35, "highpass", 3000, 0.6, 0, 0.3);
      for (let i = 0; i < 22; i++) hiss(a, t + 0.2 + Math.random() * 1.6, 0.03, 0.22 + Math.random() * 0.2, "bandpass", 1800 + Math.random() * 2200, 2.5);
    } else if (name === "ooh") {                             // a near miss: the crowd goes "ohh"
      hiss(a, t, 1.1, 0.5, "bandpass", 520, 3.5, 780, 0.18); hiss(a, t, 1.0, 0.3, "bandpass", 1100, 4, 1400, 0.2);
    } else if (name === "pop") {                             // caught in the glove
      osc(a, "sine", 180, t, 0.12, 0.8, 55, 0.05); hiss(a, t, 0.06, 0.5, "lowpass", 1600, 0.7);
    } else if (name === "thud") {                            // off the pads or the blocker
      osc(a, "sine", 110, t, 0.14, 0.8, 40, 0.05); hiss(a, t, 0.08, 0.4, "lowpass", 900, 0.7);
    } else if (name === "clang") {                           // the post, ringing
      [1, 1.52, 2.21, 2.83].forEach(function (k, i) { osc(a, "sine", 1180 * k, t, 0.9 - i * 0.15, 0.22 / (i + 1), 0, 0.03); });
    } else if (name === "glass") {                           // high and wide, into the glass
      osc(a, "sine", 90, t + 0.25, 0.18, 0.7, 45, 0.05); hiss(a, t + 0.25, 0.25, 0.35, "bandpass", 1400, 1.2); hiss(a, t + 0.3, 0.4, 0.12, "highpass", 5000, 0.8);
    } else if (name === "swipe") {                           // the poke check
      hiss(a, t, 0.25, 0.45, "bandpass", 2600, 1.5, 700); osc(a, "sine", 130, t + 0.1, 0.1, 0.5, 60, 0.1);
    } else if (name === "organ") {                           // the arena organ: a period riff, or a hat trick flourish
      const tune = x ? [74, 77, 81, 86, 81, 86, 89] : [62, 65, 69, 74, 72, 74];
      const lens = x ? [0.1, 0.1, 0.1, 0.18, 0.1, 0.1, 0.5] : [0.11, 0.11, 0.11, 0.22, 0.11, 0.45];
      let tt = t;
      tune.forEach(function (m, i) {
        osc(a, "square", mtof(m), tt, lens[i] * 1.1, 0.09, 0, 0.8); osc(a, "sine", mtof(m + 12), tt, lens[i] * 1.1, 0.07, 0, 0.8);
        osc(a, "triangle", mtof(m - 12), tt, lens[i] * 1.1, 0.08, 0, 0.8);
        tt += lens[i];
      });
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
      if (!A) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        A = rig(new AC());
        muted = shellMuted();
        A.out.gain.value = muted ? 0 : 1;
        if (!timer) timer = setInterval(pump, 150);
      }
      if (A.c.state !== "running") { const p = A.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { A = null; dead = true; }
  }
  // Called every frame (and on a timer): follow the mute button, and run the station only while a game is on.
  function pump() {
    if (!A || !window.Shell) return;
    const c = A.c, now = c.currentTime, m = shellMuted();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, now, 0.02); }
    const want = musicOn && !muted && c.state === "running" && Shell.state() === "playing";
    if (want && !stopMusic) {
      if (fresh) { fresh = false; const at = now + 0.4; A.music.gain.setValueAtTime(0, now); A.music.gain.setValueAtTime(MUSIC_VOL, at); }  // the shell's start jingle goes first
      else A.music.gain.setValueAtTime(MUSIC_VOL, now);
      try { stopMusic = startMusic(c, A.music); } catch (e) { stopMusic = null; musicOn = false; }
    } else if (!want && stopMusic) { stopMusic(); stopMusic = null; }
  }
  function sfx(name, x, delay) {
    if (!A || muted || A.c.state !== "running") return;
    try { cue(A, name, A.c.currentTime + 0.01 + (delay || 0), x); } catch (e) { /* sound is never worth a crash */ }
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
    newGame: function () { unlock(); fresh = true; if (stopMusic) { stopMusic(); stopMusic = null; } pump(); },
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    // for checks: what the engine is doing right now
    peek: function () { return { made: !!A, state: A ? A.c.state : "none", playing: !!stopMusic, muted: muted, musicOn: musicOn }; },
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
const BLOCK = '"Arial Black", "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
// Outlined block lettering (jersey numbers, names, signs). Shrinks to fit maxW.
function blockText(g, str, x, y, size, fill, line, lw, maxW, line2, lw2) {
  g.font = "900 " + size + "px " + BLOCK;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + BLOCK; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  if (line2) { g.lineWidth = (lw + lw2) * 2; g.strokeStyle = line2; g.strokeText(str, x, y); }
  if (line) { g.lineWidth = lw * 2; g.strokeStyle = line; g.strokeText(str, x, y); }
  g.fillStyle = fill; g.fillText(str, x, y);
  return size;
}
function candyText(g, str, x, y, size, maxW) {
  g.font = "900 " + size + "px " + BLOCK;
  const w = g.measureText(str).width;
  if (maxW && w > maxW) { size = Math.floor(size * maxW / w); g.font = "900 " + size + "px " + BLOCK; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = size * 0.36; g.strokeStyle = "#08205f"; g.strokeText(str, x, y + size * 0.06);
  g.lineWidth = size * 0.17; g.strokeStyle = "#ffffff"; g.strokeText(str, x, y);
  const gr = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  gr.addColorStop(0, "#fff06a"); gr.addColorStop(0.55, "#ffc21a"); gr.addColorStop(1, "#ff7a0f");
  g.fillStyle = gr; g.fillText(str, x, y);
  g.fillStyle = "rgba(255,255,255,.45)";
  g.save(); g.beginPath(); g.rect(x - 600, y - size * 0.5, 1200, size * 0.36); g.clip(); g.fillText(str, x, y); g.restore();
}

/* ---------------- Painted textures (all drawn here, no image files besides the two logos) ---------------- */

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every decal inside the arena uses this
// (the full logo with the mascot is kept for the splash, the title card and the score card).
// If the PNG is missing, plain lettering stands in.
function scriptCanvas(img) {
  if (img && img.naturalWidth > 0) {
    const k = Math.min(1, 1024 / img.naturalWidth);
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = mkCanvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
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

// The Rink Rats crest: a scrappy cartoon rat in a red helmet over two crossed sticks. Original artwork, drawn here.
function ratLogo(size) {
  const c = mkCanvas(size, size), g = c.getContext("2d"), s = size / 256;
  g.save(); g.scale(s, s);
  g.lineJoin = "round"; g.lineCap = "round";
  // badge
  g.beginPath(); g.arc(128, 128, 122, 0, TAU); g.fillStyle = "#12224f"; g.fill();
  g.lineWidth = 8; g.strokeStyle = "#f6e8c8"; g.stroke();
  g.beginPath(); g.arc(128, 128, 108, 0, TAU); g.fillStyle = "#e8392e"; g.fill();
  // crossed sticks
  [[1, "#d9a05a"], [-1, "#d9a05a"]].forEach(function (k) {
    g.save(); g.translate(128, 150); g.rotate(k[0] * 0.62);
    g.fillStyle = "#3a2410"; g.fillRect(-9, -112, 18, 190); g.fillStyle = k[1]; g.fillRect(-6, -110, 12, 186);
    g.fillStyle = "#16171d"; rrectPath(g, k[0] > 0 ? -6 : -34, 66, 40, 18, 7); g.fill();
    g.restore();
  });
  // ears
  [[-1], [1]].forEach(function (k) {
    g.beginPath(); g.ellipse(128 + k[0] * 56, 72, 30, 32, 0, 0, TAU); g.fillStyle = "#8d8f9e"; g.fill(); g.lineWidth = 5; g.strokeStyle = "#16171d"; g.stroke();
    g.beginPath(); g.ellipse(128 + k[0] * 56, 74, 17, 19, 0, 0, TAU); g.fillStyle = "#ff8fb8"; g.fill();
  });
  // head and snout
  g.beginPath(); g.ellipse(128, 120, 58, 52, 0, 0, TAU); g.fillStyle = "#a3a6b4"; g.fill(); g.lineWidth = 6; g.strokeStyle = "#16171d"; g.stroke();
  g.beginPath(); g.ellipse(128, 150, 38, 30, 0, 0, TAU); g.fillStyle = "#c9cbd6"; g.fill(); g.lineWidth = 5; g.stroke();
  // helmet
  g.beginPath(); g.ellipse(128, 96, 58, 34, 0, Math.PI, TAU); g.lineTo(186, 104); g.lineTo(70, 104); g.closePath();
  g.fillStyle = "#e8392e"; g.fill(); g.lineWidth = 6; g.stroke();
  g.fillStyle = "#f6e8c8"; g.fillRect(122, 63, 12, 38);
  // eyes and brows (determined)
  [[-1], [1]].forEach(function (k) {
    g.beginPath(); g.ellipse(128 + k[0] * 22, 120, 12, 14, 0, 0, TAU); g.fillStyle = "#ffffff"; g.fill(); g.lineWidth = 4; g.stroke();
    g.beginPath(); g.arc(128 + k[0] * 19, 123, 6, 0, TAU); g.fillStyle = "#16171d"; g.fill();
    g.lineWidth = 7; g.beginPath(); g.moveTo(128 + k[0] * 36, 103); g.lineTo(128 + k[0] * 10, 110); g.stroke();
  });
  // nose, grin, buck teeth, whiskers
  g.beginPath(); g.ellipse(128, 140, 11, 8, 0, 0, TAU); g.fillStyle = "#ff5f8f"; g.fill(); g.lineWidth = 4; g.stroke();
  g.beginPath(); g.moveTo(102, 158); g.quadraticCurveTo(128, 178, 154, 158); g.lineWidth = 5; g.stroke();
  g.fillStyle = "#ffffff"; g.fillRect(119, 163, 9, 13); g.fillRect(129, 163, 9, 13); g.lineWidth = 3; g.strokeRect(119, 163, 9, 13); g.strokeRect(129, 163, 9, 13);
  g.lineWidth = 3; g.strokeStyle = "#16171d";
  [[-1, -6], [-1, 4], [1, -6], [1, 4]].forEach(function (w) { g.beginPath(); g.moveTo(128 + w[0] * 30, 148 + w[1]); g.lineTo(128 + w[0] * 66, 140 + w[1] * 2); g.stroke(); });
  // banner
  g.fillStyle = "#12224f"; rrectPath(g, 30, 186, 196, 46, 12); g.fill(); g.lineWidth = 5; g.strokeStyle = "#f6e8c8"; g.stroke();
  blockText(g, "RINK RATS", 128, 210, 34, "#f6e8c8", "#e8392e", 2.5, 180);
  g.restore();
  return c;
}

// The Shelf Guardians crest: a shield holding a shelf of three cartridges. Original artwork, drawn here.
function guardCrest(size) {
  const c = mkCanvas(size, size), g = c.getContext("2d"), s = size / 256;
  g.save(); g.scale(s, s); g.lineJoin = "round";
  function shield(inset) {
    g.beginPath(); g.moveTo(128, 8 + inset); g.lineTo(236 - inset, 40 + inset * 0.6); g.lineTo(226 - inset, 150);
    g.quadraticCurveTo(206 - inset * 0.6, 214 - inset * 0.4, 128, 250 - inset * 1.2); g.quadraticCurveTo(50 + inset * 0.6, 214 - inset * 0.4, 30 + inset, 150);
    g.lineTo(20 + inset, 40 + inset * 0.6); g.closePath();
  }
  shield(0); g.fillStyle = "#ffd23f"; g.fill();
  shield(12); g.fillStyle = "#2f3b7a"; g.fill();
  shield(22); g.lineWidth = 4; g.strokeStyle = "#a77bff"; g.stroke();
  // the shelf and its three cartridges
  const cols = ["#ff4b3e", "#3ff0ff", "#9bff3f"];
  for (let i = 0; i < 3; i++) {
    const x = 70 + i * 42;
    g.fillStyle = "#c2c5d0"; rrectPath(g, x, 52, 34, 46, 5); g.fill();
    g.fillStyle = cols[i]; g.fillRect(x + 5, 62, 24, 26);
    g.fillStyle = "#6c7080"; g.fillRect(x + 4, 55, 26, 3);
  }
  g.fillStyle = "#d9a05a"; g.fillRect(56, 98, 144, 9); g.fillStyle = "#3a2410"; g.fillRect(56, 105, 144, 3);
  blockText(g, "SG", 128, 160, 84, "#ffd23f", "#12224f", 6, 150);
  g.restore();
  return c;
}

// The ice behind the net, the crease and the slot: 42 x 42 feet, x -21..21, z -15..27. Markings sit under the ice.
const ICE = { x0: -21, z0: -15, size: 42 };
function iceCanvas(script) {
  const N = 2048, k = N / ICE.size, c = mkCanvas(N, N), g = c.getContext("2d"), rnd = rng(7);
  const X = function (x) { return (x - ICE.x0) * k; }, Z = function (z) { return (z - ICE.z0) * k; };
  const bg = g.createRadialGradient(X(0), Z(4), 50, X(0), Z(4), N * 0.75);
  bg.addColorStop(0, "#f4f9fc"); bg.addColorStop(1, "#dfeaf3");
  g.fillStyle = bg; g.fillRect(0, 0, N, N);
  // the crease: light blue paint, red outline, the little marks at four feet
  g.save();
  g.beginPath(); g.moveTo(X(-4), Z(0)); g.lineTo(X(-4), Z(4.47));
  g.arc(X(0), Z(0), 6 * k, Math.PI - Math.asin(4.47 / 6), Math.asin(4.47 / 6), true);
  g.lineTo(X(4), Z(0)); g.closePath();
  g.fillStyle = "rgba(74,150,232,.62)"; g.fill();
  g.lineWidth = 0.17 * k; g.strokeStyle = "#d8262f"; g.stroke();
  g.restore();
  g.fillStyle = "#d8262f";
  g.fillRect(X(-4) + 0.08 * k, Z(4) - 0.08 * k, 0.42 * k, 0.17 * k); g.fillRect(X(4) - 0.5 * k, Z(4) - 0.08 * k, 0.42 * k, 0.17 * k);
  // goal line and the trapezoid behind the net
  g.fillRect(0, Z(0) - 0.085 * k, N, 0.17 * k);
  g.lineWidth = 0.17 * k; g.strokeStyle = "#d8262f";
  [-1, 1].forEach(function (sg) { g.beginPath(); g.moveTo(X(sg * 11), Z(0)); g.lineTo(X(sg * 14), Z(-11)); g.stroke(); });
  // the wordmark under the ice in the slot, a little washed out
  g.save(); g.globalAlpha = 0.36;
  drawScript(g, script, X(0), Z(8.4), 8.4 * k, 3.7 * k);
  g.restore();
  // the ice itself over the paint: frost, skate cuts, snow along the crease
  g.fillStyle = "rgba(255,255,255,.1)"; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 2400; i++) {
    const x = rnd() * N, y = rnd() * N, len = 20 + rnd() * 140, a = (rnd() - 0.5) * 1.2 + (rnd() < 0.5 ? 0 : Math.PI / 2), bend = (rnd() - 0.5) * 60;
    g.strokeStyle = rnd() < 0.7 ? "rgba(150,170,190," + (0.05 + rnd() * 0.12) + ")" : "rgba(255,255,255," + (0.3 + rnd() * 0.4) + ")";
    g.lineWidth = 0.6 + rnd() * 1.4;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * len / 2 + bend, y + Math.sin(a) * len / 2 - bend, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  for (let i = 0; i < 260; i++) {                           // snow scraped up around the crease and the posts
    const a = rnd() * Math.PI, r = 5.4 + rnd() * 2.6, x = X(Math.cos(a) * r), y = Z(Math.sin(a) * r * 0.9 + 0.2), s = (0.12 + rnd() * 0.35) * k;
    const gr = g.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2);
  }
  return c;
}
// Plain ice for everywhere else on the sheet: one tile is 20 feet.
function iceTileCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(8);
  g.fillStyle = "#e6eff6"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * 256, y = rnd() * 256, a = rnd() * TAU, l = 6 + rnd() * 30;
    g.strokeStyle = rnd() < 0.6 ? "rgba(150,170,190,.12)" : "rgba(255,255,255,.5)"; g.lineWidth = 0.6;
    for (let ox = -256; ox <= 256; ox += 256) for (let oy = -256; oy <= 256; oy += 256) { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke(); }
  }
  return c;
}

// One stretch of dasher board: 1024 x 128, four ad panels.
function boardAdCanvas(script) {
  const c = mkCanvas(1024, 128), g = c.getContext("2d");
  g.fillStyle = "#f7f8fb"; g.fillRect(0, 0, 1024, 128);
  const ads = [["script"], ["PAWN  SWAP  TRADE", "#e8392e"], ["script"], ["BUY  SELL  COLLECT", "#2f3b7a"]];
  for (let i = 0; i < 4; i++) {
    const x = i * 256;
    g.fillStyle = "rgba(10,20,60,.08)"; g.fillRect(x, 0, 2, 128);
    if (ads[i][0] === "script") drawScript(g, script, x + 128, 62, 220, 92);
    else { rrectPath(g, x + 14, 26, 228, 76, 10); g.fillStyle = ads[i][1]; g.fill(); blockText(g, ads[i][0], x + 128, 64, 30, "#ffffff", null, 0, 206); }
  }
  return c;
}

// Glass: almost clear, with smudges and a few long reflections.
function glassCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d"), rnd = rng(31);
  g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 256, y = 120 + rnd() * 136, r = 6 + rnd() * 22, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,255,255,.22)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.fillStyle = "rgba(255,255,255,.12)";
  g.beginPath(); g.moveTo(40, 0); g.lineTo(70, 0); g.lineTo(130, 256); g.lineTo(100, 256); g.fill();
  g.beginPath(); g.moveTo(150, 0); g.lineTo(160, 0); g.lineTo(220, 256); g.lineTo(210, 256); g.fill();
  return c;
}

// The signs the front row holds up against the glass.
function signCanvases(script) {
  const out = [];
  let c = mkCanvas(256, 160), g = c.getContext("2d");
  g.fillStyle = "#ffffff"; rrectPath(g, 4, 4, 248, 152, 10); g.fill(); g.lineWidth = 6; g.strokeStyle = "#12224f"; g.stroke();
  drawScript(g, script, 128, 80, 220, 130); out.push(c);
  c = mkCanvas(256, 160); g = c.getContext("2d");
  g.fillStyle = "#ffe45c"; rrectPath(g, 4, 4, 248, 152, 10); g.fill(); g.lineWidth = 6; g.strokeStyle = "#e8392e"; g.stroke();
  blockText(g, "TOP", 128, 52, 64, "#e8392e", "#ffffff", 4, 220); blockText(g, "SHELF!", 128, 112, 58, "#12224f", "#ffffff", 4, 230); out.push(c);
  c = mkCanvas(256, 160); g = c.getContext("2d");
  g.fillStyle = "#ff4fc0"; rrectPath(g, 4, 4, 248, 152, 10); g.fill(); g.lineWidth = 6; g.strokeStyle = "#ffffff"; g.stroke();
  blockText(g, "IS IT ON", 128, 50, 44, "#ffffff", "#12224f", 4, 220); blockText(g, "THE SHELF?", 128, 108, 44, "#ffffff", "#12224f", 4, 230); out.push(c);
  c = mkCanvas(256, 160); g = c.getContext("2d");
  g.fillStyle = "#12224f"; rrectPath(g, 4, 4, 248, 152, 10); g.fill(); g.lineWidth = 6; g.strokeStyle = "#ffd23f"; g.stroke();
  g.drawImage(ratLogo(128), 10, 16, 128, 128);
  blockText(g, "GO", 194, 56, 50, "#ffd23f", null, 0, 100); blockText(g, "RATS!", 194, 108, 40, "#ffffff", null, 0, 108); out.push(c);
  return out;
}

// One bay of seats, a row tall: lower half the riser, upper half the step. Fans in them are 3D.
function seatCanvas() {
  const c = mkCanvas(256, 128), g = c.getContext("2d"), rnd = rng(29);
  g.fillStyle = "#151d4a"; g.fillRect(0, 0, 256, 64);
  speckle(g, 256, 64, 500, rnd, "rgba(255,255,255,.05)", "rgba(0,0,0,.12)");
  g.fillStyle = "#0c1438"; g.fillRect(0, 64, 256, 64);
  for (let i = 0; i < 6; i++) {
    const x = i * 42.7 + 4;
    rrectPath(g, x, 74, 34, 50, 8); g.fillStyle = i % 2 ? "#c2262e" : "#e8392e"; g.fill();
    g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(x + 4, 78, 26, 5);
  }
  return c;
}
// The upper deck seen from below: dim seats, a few hundred faces lit by the ribbon.
function upperCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(41);
  g.fillStyle = "#0b1238"; g.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 16) { g.fillStyle = "rgba(255,255,255,.04)"; g.fillRect(0, y, 512, 2); }
  const cols = ["#ff4b3e", "#16b9e8", "#ff3fa4", "#58c322", "#ffb81f", "#8a5cff", "#ffffff", "#ff9214"];
  for (let i = 0; i < 900; i++) {
    const x = rnd() * 512, y = rnd() * 256;
    g.fillStyle = cols[Math.floor(rnd() * cols.length)]; g.globalAlpha = 0.55; g.fillRect(x, y + 4, 5, 6);
    g.fillStyle = "#e0b090"; g.fillRect(x + 1, y, 3, 4);
  }
  g.globalAlpha = 1;
  return c;
}

// A jersey, wrapped once around the body: u = 0 is the back, u = .5 the chest. Folds are painted in as soft shading.
function jerseyCanvas(o) {
  const c = mkCanvas(1024, 512), g = c.getContext("2d"), rnd = rng(o.seed || 3);
  g.fillStyle = o.base; g.fillRect(0, 0, 1024, 512);
  if (o.yoke) { g.fillStyle = o.yoke; g.fillRect(0, 0, 1024, 70); }
  // hem stripes
  if (o.hem) o.hem.forEach(function (s) { g.fillStyle = s[0]; g.fillRect(0, 512 - s[1] - s[2], 1024, s[2]); });
  if (o.chest) { g.fillStyle = o.chest[0]; g.fillRect(0, o.chest[1], 1024, o.chest[2]); }
  // folds: long soft creases down the body and a few across the waist where the jersey bunches
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 1024, w = 14 + rnd() * 36, top = 80 + rnd() * 160;
    const gr = g.createLinearGradient(x - w, 0, x + w, 0);
    gr.addColorStop(0, "rgba(0,0,30,0)"); gr.addColorStop(0.45, "rgba(0,0,30," + (0.08 + rnd() * 0.1) + ")"); gr.addColorStop(0.55, "rgba(255,255,255," + (0.04 + rnd() * 0.05) + ")"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(x - w, top, w * 2, 512 - top);
  }
  for (let i = 0; i < 16; i++) {
    const y = 380 + rnd() * 90, x = rnd() * 1024, w = 80 + rnd() * 160;
    g.strokeStyle = "rgba(0,0,30," + (0.1 + rnd() * 0.1) + ")"; g.lineWidth = 4 + rnd() * 5;
    g.beginPath(); g.moveTo(x - w / 2, y); g.quadraticCurveTo(x, y + 12 + rnd() * 12, x + w / 2, y); g.stroke();
  }
  if (o.back) o.back(g);
  if (o.front) o.front(g);
  const sh = g.createLinearGradient(0, 0, 0, 512);
  sh.addColorStop(0, "rgba(255,255,255,.10)"); sh.addColorStop(0.7, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,40,.18)");
  g.fillStyle = sh; g.fillRect(0, 0, 1024, 512);
  return c;
}
// A sleeve, upper arm: v = 0 at the shoulder, 1 at the elbow. Stripes near the elbow, a number on the shoulder.
function sleeveCanvas(o) {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(o.seed || 5);
  g.fillStyle = o.base; g.fillRect(0, 0, 512, 256);
  if (o.yoke) { g.fillStyle = o.yoke; g.fillRect(0, 210, 512, 46); }
  (o.stripes || []).forEach(function (s) { g.fillStyle = s[0]; g.fillRect(0, 256 - s[1], 512, s[2]); });
  if (o.num) [128, 384].forEach(function (x) { g.save(); g.translate(x, 150); g.rotate(Math.PI); blockText(g, o.num, 0, 0, 74, o.numFill, o.numLine, 4, 150); g.restore(); });   // v runs shoulder to elbow, so upside down here
  for (let i = 0; i < 12; i++) {
    const x = rnd() * 512, w = 10 + rnd() * 26, gr = g.createLinearGradient(x - w, 0, x + w, 0);
    gr.addColorStop(0, "rgba(0,0,30,0)"); gr.addColorStop(0.5, "rgba(0,0,30,.13)"); gr.addColorStop(1, "rgba(0,0,30,0)");
    g.fillStyle = gr; g.fillRect(x - w, 0, w * 2, 256);
  }
  return c;
}
// Hockey socks: v = 0 at the knee.
function sockCanvas(base, stripes) {
  const c = mkCanvas(128, 256), g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  stripes.forEach(function (s) { g.fillStyle = s[0]; g.fillRect(0, s[1], 128, s[2]); });
  for (let x = 0; x < 128; x += 4) { g.fillStyle = "rgba(0,0,0,.05)"; g.fillRect(x, 0, 1, 256); }
  return c;
}
// Goalie leg pad face: white, three knee rolls in red, the wordmark low on the pad. v = 0 at the top of the pad.
function padCanvas(script) {
  const c = mkCanvas(256, 512), g = c.getContext("2d");
  g.fillStyle = "#f6f4ee"; g.fillRect(0, 0, 256, 512);
  for (let x = 0; x < 256; x += 64) { g.fillStyle = "rgba(0,0,30,.07)"; g.fillRect(x + 30, 0, 4, 512); }
  [[60, "#ff4b3e"], [104, "#2f3b7a"], [148, "#ff4b3e"]].forEach(function (b) { g.fillStyle = b[1]; g.fillRect(0, b[0], 256, 26); g.fillStyle = "rgba(255,255,255,.3)"; g.fillRect(0, b[0] + 3, 256, 5); });
  g.fillStyle = "#a77bff"; g.fillRect(0, 0, 256, 18);
  g.save(); g.translate(128, 330); g.rotate(-Math.PI / 2); drawScript(g, script, 0, 0, 230, 110); g.restore();
  g.fillStyle = "#2f3b7a"; g.fillRect(0, 470, 256, 42);
  g.lineWidth = 6; g.strokeStyle = "#2f3b7a"; g.strokeRect(3, 3, 250, 506);
  return c;
}
// The blocker's board: the wordmark across it.
function blockerCanvas(script) {
  const c = mkCanvas(256, 384), g = c.getContext("2d");
  g.fillStyle = "#a77bff"; g.fillRect(0, 0, 256, 384);
  rrectPath(g, 14, 14, 228, 356, 20); g.fillStyle = "#f6f4ee"; g.fill(); g.lineWidth = 6; g.strokeStyle = "#2f3b7a"; g.stroke();
  g.save(); g.translate(128, 192); g.rotate(-Math.PI / 2); drawScript(g, script, 0, 0, 330, 200); g.restore();
  return c;
}
// The catch glove's pocket and cuff.
function mittCanvas() {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 140);
  gr.addColorStop(0, "#d9c6ff"); gr.addColorStop(0.55, "#a77bff"); gr.addColorStop(1, "#6b45c8");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "#2f3b7a"; g.lineWidth = 6;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(40 + i * 44, 20); g.lineTo(40 + i * 44, 236); g.stroke(); }
  g.fillStyle = "#ffd23f"; g.fillRect(0, 118, 256, 20);
  return c;
}
// The goalie's helmet: white with purple stripes, his initials on each side and a gold star on top.
function goalieHelmetCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  g.fillStyle = "#f6f4ee"; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#a77bff"; g.fillRect(0, 150, 512, 24); g.fillStyle = "#ffd23f"; g.fillRect(0, 176, 512, 10);
  [0, 256, 512].forEach(function (x) { blockText(g, "SG", x, 96, 70, "#2f3b7a", "#ffd23f", 4, 120); });   // u = 0 and .5 are the sides
  return c;
}
// The skater's helmet: navy, a cream stripe over the top, his number on the back.
function skaterHelmetCanvas(num) {
  const c = mkCanvas(512, 256), g = c.getContext("2d");
  g.fillStyle = "#12224f"; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#f6e8c8"; g.fillRect(0, 30, 512, 14); g.fillStyle = "#e8392e"; g.fillRect(0, 46, 512, 6);
  blockText(g, num, 128, 140, 64, "#f6e8c8", "#e8392e", 3, 100);                // u = .25 is the back of the head
  return c;
}
// Netting: a fine diamond mesh on clear.
function netCanvas() {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(255,255,255,.95)"; g.lineWidth = 2.2;
  for (let i = -128; i <= 256; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(i, 128); g.lineTo(i + 128, 0); g.stroke();
  }
  return c;
}
// The top of a puck: black rubber, the wordmark in the middle.
function puckCanvas(script) {
  const c = mkCanvas(256, 256), g = c.getContext("2d");
  g.fillStyle = "#121318"; g.fillRect(0, 0, 256, 256);
  g.beginPath(); g.arc(128, 128, 112, 0, TAU); g.lineWidth = 6; g.strokeStyle = "#2a2c36"; g.stroke();
  drawScript(g, script, 128, 128, 190, 110);
  return c;
}
// The rare cartridge taped to the net.
function cartCanvas(script) {
  const c = mkCanvas(256, 224), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 224);
  bg.addColorStop(0, "#c2c5d0"); bg.addColorStop(1, "#8f93a2");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 224);
  for (let y = 12; y < 48; y += 9) { g.fillStyle = "#6c7080"; g.fillRect(18, y, 220, 4); g.fillStyle = "#dfe2ea"; g.fillRect(18, y + 4, 220, 1.5); }
  rrectPath(g, 22, 58, 212, 148, 12); g.fillStyle = "#16171d"; g.fill();
  rrectPath(g, 28, 64, 200, 136, 9);
  const lb = g.createLinearGradient(0, 64, 0, 200);
  lb.addColorStop(0, "#ffe45c"); lb.addColorStop(1, "#ff9214");
  g.fillStyle = lb; g.fill();
  drawScript(g, script, 128, 132, 184, 110);
  return c;
}
// The banner hung over the upper deck behind the net.
function bannerCanvas(script) {
  const c = mkCanvas(1024, 256), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 256);
  g.lineWidth = 14; g.strokeStyle = "#ff9214"; g.strokeRect(7, 7, 1010, 242);
  g.lineWidth = 4; g.strokeStyle = "#ffe45c"; g.strokeRect(17, 17, 990, 222);
  drawScript(g, script, 300, 128, 500, 200);
  candyText(g, "SWAP MEET", 760, 88, 66, 420); candyText(g, "ICE BARN", 760, 168, 58, 420);
  return c;
}
function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(10,20,40,.75)"); gr.addColorStop(0.55, "rgba(10,20,40,.35)"); gr.addColorStop(1, "rgba(10,20,40,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function glowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.5)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
// A tiny painted arena for the glossy highlights on helmets, the posts, the puck and the pads.
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.18, "#dcebff"); gr.addColorStop(0.32, "#2f5ad0");
    gr.addColorStop(0.5, "#141e5a"); gr.addColorStop(0.52, "#e6f0f8"); gr.addColorStop(1, "#ffffff");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#101a4a"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(6, 6, 16, 16); tg.fillRect(42, 6, 16, 16); tg.fillRect(6, 42, 16, 16); tg.fillRect(42, 42, 16, 16);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#eef4f8"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* ---------------- LED ribbon board: the dasher boards behind the net, and the ribbon on the upper fascia ----------------
   The board is a real dot matrix. Everything on it is painted into a small canvas, one pixel per LED, and a small
   shader turns each pixel into a glowing dot. It scrolls its programme right to left, and cuts to big animated
   messages when the game calls for one (goals, saves, the post, a poke check, a new period, the final horn).
   The ribbon on the fascia over the end stands shows the same board twice over. */
const LED_ROWS = 20, LED_HALF = 12;                        // the board behind the net: 24 feet of it, LED_HT tall
const LED_COLS = Math.round(LED_HALF * 2 / (LED_HT / LED_ROWS));
const LED_SAFE = 128;                                      // widest message that stays in view behind the net
const LED_SPEED = 30;                                      // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));   // the largest text size that fits (5 x 7 font, in LEDs per font pixel)
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
// Short messages between the plugs. The wordmark leads each group.
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["IS IT ON THE SHELF?", "pink"], ["MAKE SOME NOISE!", "cyan"], ["NO QUARTERS REQUIRED", "lime"]];
// Plugs for the rest of the arcade: [game, one-line tag]. Edit freely, the board lays itself out.
const LED_PLUGS = [
  ["TAPE PIN LANES", "3D BOWLING"],
  ["SHELF LINKS", "MINI GOLF"],
  ["BLEACHER CARTS", "HOME RUN DERBY"],
  ["BARGAIN BIN BUCKETS", "HOOPS"],
  ["TICKET ROLL ALLEY", "ROLL FOR TICKETS"],
  ["PAWN SHOP POOL", "RACK 'EM UP"],
  ["FOURTH AND COLLECT", "SPLIT THE UPRIGHTS"],
  ["POWDER DAY HAUL", "HIT THE SLOPES"],
  ["TABLE RINK RUMBLE", "AIR HOCKEY"],
  ["FLEA FORTRESS FLYBY", "PLAY IT FREE"],
  ["CREATURE FEATURE KO", "VHS BOSS RUSH"]
];
let LED = null;
const LEDV = { last: 0 };                                  // the last score the board counted up to

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
  // The wordmark at board resolution. At this size the thin script strokes come out half lit, so the cream lettering
  // is pushed to full LED brightness, the red edge is kept as a dimmer rim and the navy outline falls back to dark.
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
  if (!list.some(function (m) { return m.keep; })) {
    // a save or a miss cuts in, but a running total that has not had its turn yet still gets it afterwards
    const old = (L.msg && L.msg.keep ? [L.msg] : []).concat(L.queue.filter(function (m) { return m.keep; }));
    if (old.length) { old[0].t = 0; list = list.concat(old); }
  }
  L.msg = list[0]; L.msg.t = 0;
  L.queue = list.slice(1);
  L.frame = -1;
}
function ledClear() {
  LEDV.last = 0;
  if (!LED) return;
  LED.msg = null; LED.queue = []; LED.pos = -1;
}
function ledFinal(score) {
  if (!LED) return;
  ledPlay([ledMsg("count", "FINAL", 8, { from: Math.min(LEDV.last, score), value: score, suffix: " PTS", final: true, wait: 0.4 })], true);
  LEDV.last = score;
}

// The message, centered on the board.
function ledDrawMsg(g, m) {
  const WW = LED_COLS, HH = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(WW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.amber;
  function fit(str) { let sx = big; while (sx > 1 && ledTextW(str, sx) > LED_SAFE) sx--; return sx; }
  function chase(color, dir) {                              // running lights along the top and bottom edges
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < WW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(WW - x - 3, HH - 1, 3, 1); }
  }
  function yFor(sx) { return Math.floor((HH - 7 * sx) / 2); }
  if (m.kind === "count") {                                 // counts up to the new number
    const k = calm ? 1 : Math.min(1, t / 0.7), v = Math.round(m.from + (m.value - m.from) * k);
    const label = m.text ? m.text + " " : "", suffix = m.suffix || "", sxc = fit(label + m.value + suffix), y = yFor(sxc);
    const x = Math.round((WW - ledTextW(label + m.value + suffix, sxc)) / 2);
    const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
    let xn = ledText(g, label, x, y, sxc, sxc, LED_C.amber);
    xn = ledText(g, String(v), xn, y, sxc, sxc, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
    ledText(g, suffix, xn, y, sxc, sxc, LED_C.amber);
    if (!calm && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(WW * m.t / 0.3), 0, WW, HH); }   // wipe in
    chase(LED_C.amber, 1);
    return;
  }
  const sx = fit(m.text), w = ledTextW(m.text, sx), x0 = Math.round((WW - w) / 2), y0 = yFor(sx);
  if (m.kind === "flash") {
    if (!calm && t < 0.6 && Math.floor(t * 12) % 2 === 0) {                        // strobe: the whole board flips
      g.fillStyle = LED_C.yellow; g.fillRect(0, 0, WW, HH);
      ledText(g, m.text, x0, y0, sx, sx, "#000000");
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
    ledText(g, m.text, x0, y0, sx, sx, calm ? LED_C.yellow : cyc[Math.floor(t * 8) % 3]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 18; i++) g.fillRect((Math.random() * WW) | 0, (Math.random() * HH) | 0, 1, 1); }
    chase(LED_C.amber, 1);
    return;
  }
  if (m.kind === "slide") {                                 // slides in from the right, then a white glint sweeps across it
    const k = calm ? 1 : Math.min(1, t / 0.45), e = 1 - Math.pow(1 - k, 3);
    const x = Math.round(x0 + (1 - e) * WW);
    ledText(g, m.text, x, y0, sx, sx, col);
    if (!calm && k >= 1) {
      const bx = Math.floor(((t - 0.45) * 150) % (WW + 80)) - 40;
      g.save(); g.beginPath(); g.rect(bx, 0, 12, HH); g.clip();
      ledText(g, m.text, x, y0, sx, sx, "#ffffff");
      g.restore();
    }
    chase(col, -1);
    return;
  }
  if (m.kind === "cycle") {                                 // every letter takes its turn through the colors
    const cyc = [LED_C.yellow, LED_C.pink, LED_C.cyan, LED_C.lime, LED_C.orange];
    let x = x0;
    for (let i = 0; i < m.text.length; i++) x = ledText(g, m.text[i], x, y0, sx, sx, cyc[(i + (calm ? 0 : Math.floor(t * 9))) % cyc.length]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 12; i++) g.fillRect((Math.random() * WW) | 0, (Math.random() * HH) | 0, 1, 1); }
    chase(LED_C.yellow, 1);
    return;
  }
  // blink: a few flashes, then it holds between two solid bars
  if (calm || t > 1.0 || Math.floor(t * 6) % 2 === 0) ledText(g, m.text, x0, y0, sx, sx, col);
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
function roundBox(T, w, h, d, r, s) {
  s = s || 4;
  const per = (s + 1) * (s + 1), half = 0.5 / s;
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
// A body part turned on a lathe: prof is [radius, height] pairs from the bottom up. v follows the height (0 bottom, 1 top).
// wob(angle, height) can push the surface in and out (folds in cloth, the curve of a muscle).
function lathe(T, prof, segs, wob) {
  const pts = prof.map(function (p) { return new T.Vector2(Math.max(0, p[0]), p[1]); });
  const g = new T.LatheGeometry(pts, segs || 18);
  const pos = g.attributes.position, uv = g.attributes.uv;
  const y0 = prof[0][1], y1 = prof[prof.length - 1][1];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    uv.setY(i, (y - y0) / ((y1 - y0) || 1));
    if (wob) {
      const r = Math.hypot(x, z);
      if (r > 1e-4) { const k = 1 + wob(Math.atan2(x, z), y); pos.setX(i, x * k); pos.setZ(i, z * k); }
    }
  }
  if (wob) g.computeVertexNormals();
  return g;
}
// Translate, rotate (XYZ, radians) and scale, as one matrix.
function mx(T, x, y, z, rx, ry, rz, sx, sy, sz) {
  const m = new T.Matrix4(), q = new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0));
  return m.compose(new T.Vector3(x, y, z), q, new T.Vector3(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
}
// Bake a list of { g: geometry, m: material, M: matrix } into one mesh (one draw call per material).
function merged(T, list) {
  const mats = [];
  list.forEach(function (p) { if (mats.indexOf(p.m) < 0) mats.push(p.m); });
  const pos = [], nor = [], uv = [], geo = new T.BufferGeometry();
  let start = 0;
  for (let k = 0; k < mats.length; k++) {
    let cnt = 0;
    list.forEach(function (p) {
      if (p.m !== mats[k]) return;
      const g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
      if (p.M) g.applyMatrix4(p.M);
      const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv ? g.attributes.uv.array : null, n = P.length / 3;
      for (let i = 0; i < P.length; i++) { pos.push(P[i]); nor.push(N[i]); }
      for (let i = 0; i < n; i++) uv.push(U ? U[i * 2] : 0, U ? U[i * 2 + 1] : 0);
      cnt += n; g.dispose();
    });
    geo.addGroup(start, cnt, k); start += cnt;
  }
  geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return new T.Mesh(geo, mats.length === 1 ? mats[0] : mats);
}

/* ---------------- Players: sculpted, jointed figures posed from a short list of numbers ----------------
   Every figure is built facing -z, his right hand toward +x, standing on the ice at y = 0, in feet.
   A pose gives the pelvis, how far the chest leans and twists, where the head looks, where both hands and both
   skates are, and where the stick blade goes. Elbows and knees are solved from where the hands and skates are,
   so a stick held in two hands stays in both hands and a skate on the ice stays on the ice. */
const POSE_KEYS = ["pel", "pelYaw", "pelRoll", "lean", "twist", "side", "headYaw", "headPitch", "hR", "aim", "grip", "hL", "free",
                   "fL", "fR", "yawL", "yawR", "rootYaw", "brow", "smile", "open", "kneeIn"];
function pose(o) {
  const p = { pel: [0, 2.7, 0], pelYaw: 0, pelRoll: 0, lean: 0, twist: 0, side: 0, headYaw: 0, headPitch: 0, hR: [0.5, 3, -0.5], aim: [0, 0, -3],
              grip: 1, hL: [-0.5, 3, -0.5], free: 0, fL: [-0.5, 0.5, 0], fR: [0.5, 0.5, 0], yawL: 0, yawR: 0, rootYaw: 0, brow: 0, smile: 0, open: 0, kneeIn: 0 };
  for (const k in o) p[k] = Array.isArray(o[k]) ? o[k].slice() : o[k];
  return p;
}
function copyPose(out, a) { for (let i = 0; i < POSE_KEYS.length; i++) { const k = POSE_KEYS[i], v = a[k]; if (Array.isArray(v)) { out[k][0] = v[0]; out[k][1] = v[1]; out[k][2] = v[2]; } else out[k] = v; } return out; }
function mixPose(out, b, u) {                              // out += (b - out) * u
  if (u <= 0) return out;
  if (u > 1) u = 1;
  for (let i = 0; i < POSE_KEYS.length; i++) {
    const k = POSE_KEYS[i], v = b[k];
    if (Array.isArray(v)) { const o = out[k]; o[0] += (v[0] - o[0]) * u; o[1] += (v[1] - o[1]) * u; o[2] += (v[2] - o[2]) * u; }
    else out[k] += (v - out[k]) * u;
  }
  return out;
}
function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }

// The skater: built to these lengths. The goalie uses his own.
const DIM_SKATER = { hipW: 0.3, hipY: -0.12, thigh: 1.45, shin: 1.4, ankle: 0.52, waist: 0.22, shW: 0.64, shY: 1.3, headY: 1.98, upper: 1.0, fore: 1.0, stick: 4.15 };
const DIM_GOALIE = { hipW: 0.34, hipY: -0.1, thigh: 1.4, shin: 1.38, ankle: 0.46, waist: 0.2, shW: 0.68, shY: 1.16, headY: 1.7, upper: 0.96, fore: 0.94, stick: 2.35 };

// A head with a face: cranium, jaw and chin, cheeks, nose, ears, eyes that look around, brows and a mouth that move.
function makeHead(T, G, o) {
  const head = new T.Group(), skin = o.skin, L = [];
  L.push({ g: G.sph, m: skin, M: mx(T, 0, 0.03, 0.01, 0, 0, 0, 0.25, 0.3, 0.285) });           // cranium
  L.push({ g: G.sph, m: skin, M: mx(T, 0, -0.14, -0.045, 0, 0, 0, 0.215, 0.17, 0.225) });      // jaw
  L.push({ g: G.sph, m: skin, M: mx(T, 0, -0.255, -0.15, 0, 0, 0, 0.1, 0.085, 0.09) });        // chin
  [-1, 1].forEach(function (s) {
    L.push({ g: G.sphLo, m: skin, M: mx(T, s * 0.13, -0.07, -0.19, 0, 0, 0, 0.09, 0.075, 0.075) });  // cheeks
    L.push({ g: G.sphLo, m: skin, M: mx(T, s * 0.25, -0.01, 0.01, 0, 0, 0, 0.035, 0.085, 0.065) });  // ears
    L.push({ g: G.sphLo, m: skin, M: mx(T, s * 0.095, 0.075, -0.235, 0, 0, 0, 0.08, 0.035, 0.05) });  // brow ridge
    L.push({ g: G.sphLo, m: o.white, M: mx(T, s * 0.092, 0.02, -0.238, 0, 0, 0, 0.052, 0.044, 0.032) }); // eyeballs
  });
  L.push({ g: G.sphLo, m: skin, M: mx(T, 0, -0.03, -0.275, -0.35, 0, 0, 0.042, 0.085, 0.055) });   // nose bridge
  L.push({ g: G.sphLo, m: skin, M: mx(T, 0, -0.1, -0.305, 0, 0, 0, 0.052, 0.04, 0.048) });         // nose tip
  L.push({ g: G.sphLo, m: o.lip, M: mx(T, 0, -0.18, -0.248, 0, 0, 0, 0.07, 0.022, 0.03) });        // lower lip
  head.add(merged(T, L));
  const pupils = [-1, 1].map(function (s) { const m = new T.Mesh(G.sphLo, o.pupil); m.scale.set(0.024, 0.027, 0.012); m.position.set(s * 0.092, 0.02, -0.268); head.add(m); return m; });
  const brows = [-1, 1].map(function (s) { const m = new T.Mesh(G.sphLo, o.hair); m.scale.set(0.072, 0.019, 0.024); m.position.set(s * 0.095, 0.098, -0.262); head.add(m); return m; });
  const smile = new T.Mesh(G.smile, o.mouth); smile.position.set(0, -0.155, -0.262); head.add(smile);
  const open = new T.Mesh(G.sphLo, o.mouth); open.position.set(0, -0.165, -0.252); head.add(open);
  const teeth = new T.Mesh(G.sphLo, o.white); teeth.scale.set(0.045, 0.012, 0.012); teeth.position.set(0, -0.142, -0.268); head.add(teeth);
  return { head: head, pupils: pupils, brows: brows, smile: smile, open: open, teeth: teeth };
}
// brow: -1 angry .. 1 surprised. smile: -1 frown .. 1 grin. open: 0 .. 1. lx, ly: where the eyes look (-1 .. 1).
function setFace(F, brow, smile, open, lx, ly) {
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1, b = F.brows[i];
    b.rotation.z = s * -brow * 0.42;
    b.position.y = 0.098 + Math.max(0, brow) * 0.03 - Math.max(0, -brow) * 0.008;
    F.pupils[i].position.x = s * 0.092 + (lx || 0) * 0.018;
    F.pupils[i].position.y = 0.02 + (ly || 0) * 0.014;
  }
  const o = clamp(open, 0, 1);
  F.open.visible = o > 0.08;
  F.open.scale.set(0.058 + o * 0.012, 0.012 + o * 0.05, 0.022);
  F.teeth.visible = o > 0.25;
  F.smile.visible = o < 0.5;
  F.smile.rotation.z = smile >= 0 ? Math.PI : 0;
  F.smile.scale.set(1, 0.25 + Math.abs(smile) * 0.9, 1);
  F.smile.position.y = smile >= 0 ? -0.15 : -0.178;
}

// One glove: the back of the hand padded in three rolls, four thick rolled fingers curled forward, a thumb, a leather palm.
// Built along +y from the wrist, knuckles toward +z.
function gloveParts(T, G, mat, roll, palm, s) {
  const L = [];
  L.push({ g: G.box(0.3, 0.26, 0.24, 0.1), m: mat, M: mx(T, 0, 0.13, 0.0) });
  [0.06, 0.13, 0.2].forEach(function (y) { L.push({ g: G.box(0.31, 0.06, 0.2, 0.03), m: roll, M: mx(T, 0, y, 0.035) }); });
  for (let i = 0; i < 4; i++) {
    const x = -0.105 + i * 0.07;
    L.push({ g: G.sphLo, m: mat, M: mx(T, x, 0.3, 0.02, 0.35, 0, 0, 0.045, 0.085, 0.06) });
    L.push({ g: G.sphLo, m: mat, M: mx(T, x, 0.38, -0.05, 1.2, 0, 0, 0.042, 0.07, 0.055) });
  }
  L.push({ g: G.sph, m: mat, M: mx(T, s * 0.16, 0.14, -0.05, 0.4, 0, s * 0.55, 0.06, 0.12, 0.065) });
  L.push({ g: G.sph, m: palm, M: mx(T, 0, 0.16, -0.1, 0, 0, 0, 0.13, 0.15, 0.05) });
  return L;
}
// A skate: boot, tongue and toe cap, the white holder and the steel. Ankle at the origin; the steel sits `ankle` below it.
function skateMesh(T, G, boot, holder, steel, ankle, wide) {
  const k = wide ? 1.15 : 1, L = [];
  L.push({ g: G.box(0.34 * k, 0.42, 0.78, 0.13), m: boot, M: mx(T, 0, -ankle + 0.38, -0.1) });
  L.push({ g: G.sph, m: boot, M: mx(T, 0, -ankle + 0.27, -0.44, 0, 0, 0, 0.17 * k, 0.13, 0.17) });
  L.push({ g: G.box(0.22, 0.24, 0.1, 0.04), m: boot, M: mx(T, 0, -ankle + 0.6, -0.28, -0.35, 0, 0) });
  L.push({ g: G.sph, m: boot, M: mx(T, 0, -ankle + 0.5, 0.06, 0, 0, 0, 0.19 * k, 0.16, 0.2) });
  L.push({ g: G.box(0.13 * k, 0.12, 0.86, 0.05), m: holder, M: mx(T, 0, -ankle + 0.13, -0.1) });
  L.push({ g: G.box(0.03, 0.09, 0.98, 0.015), m: steel, M: mx(T, 0, -ankle + 0.045, -0.1) });
  return merged(T, L);
}

function makePlayer(T, G, o) {
  const D = o.dims, root = new T.Group();
  const pelvis = new T.Group(), chest = new T.Group(), headG = new T.Group();
  root.add(pelvis); pelvis.add(chest); chest.add(headG);
  chest.position.y = D.waist;
  headG.position.y = D.headY;
  const P = { root: root, pelvis: pelvis, chest: chest, headG: headG, D: D, o: o, meshes: [] };

  // pelvis: the pants
  const pants = new T.Mesh(o.pantsGeo, o.pants); pelvis.add(pants);
  // chest: the jersey over the pads, the shoulders, the neck and collar, baked into one mesh
  const C = [{ g: o.torsoGeo, m: o.jersey, M: mx(T, 0, 0, 0, 0, 0, 0, 1, 1, o.torsoDepth) }, { g: G.neck, m: o.skin, M: mx(T, 0, D.headY - 0.52, 0) }];
  [-1, 1].forEach(function (s) { C.push({ g: G.sph, m: o.shoulder, M: mx(T, s * (D.shW - 0.04), D.shY + 0.02, 0, 0, 0, 0, o.capR, o.capR * 0.9, o.capR * 0.95) }); });
  if (o.collar) C.push({ g: G.collar, m: o.collar, M: mx(T, 0, D.headY - 0.5, 0) });
  chest.add(merged(T, C));
  const face = makeHead(T, G, o);
  headG.add(face.head);
  if (o.helmet) headG.add(o.helmet);
  P.face = face;

  // arms: upper arm, an elbow, the forearm with its cuff, the hand
  P.arm = [0, 1].map(function (s) {
    const up = o.upper(s), lo = o.fore(s), el = new T.Mesh(G.sph, o.elbow);
    el.scale.setScalar(o.elbowR);
    root.add(up); root.add(lo); root.add(el);
    const hand = new T.Group(); root.add(hand);
    hand.add(s ? o.handR() : o.handL());
    return { up: up, lo: lo, el: el, hand: hand };
  });
  // legs: thigh (pants), knee, shin (sock or pad), skate
  P.leg = [0, 1].map(function (s) {
    const up = new T.Group(), lo = new T.Group(), kn = new T.Mesh(G.sph, o.knee);
    up.add(o.thigh(s)); lo.add(o.shin(s));
    if (o.pad) lo.add(o.pad(s));
    kn.scale.setScalar(o.kneeR);
    root.add(up); root.add(lo); root.add(kn);
    const sk = o.skate(); root.add(sk);
    return { up: up, lo: lo, kn: kn, skate: sk };
  });
  // the stick: the shaft follows the hands, the blade lies flat
  P.shaft = o.shaft; P.blade = o.blade; root.add(o.shaft); root.add(o.blade);
  root.traverse(function (m) { if (m.isMesh) { m.castShadow = true; P.meshes.push(m); } });
  return P;
}

// Elbow or knee: the joint between A and B for bones l1 and l2, bent toward "pole".
function bend(A, B, pole, l1, l2, out, end) {
  const t = TV;
  t.d.subVectors(B, A);
  let d = t.d.length();
  if (d < 1e-4) { t.d.set(0, -1, 0); d = 1e-4; } else t.d.multiplyScalar(1 / d);
  const dm = Math.min(d, (l1 + l2) * 0.999), a = (l1 * l1 - l2 * l2 + dm * dm) / (2 * dm), hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  t.q.copy(pole).addScaledVector(t.d, -pole.dot(t.d));
  if (t.q.lengthSq() < 1e-6) t.q.set(0, 0, 1);
  t.q.normalize();
  out.copy(A).addScaledVector(t.d, a).addScaledVector(t.q, hgt);
  end.copy(A).addScaledVector(t.d, dm);                    // where the hand or foot really gets to
}
// Stand a part built along +y between A and B, with its +z turned toward `hint`.
function orient(obj, A, B, hint) {
  const t = TV;
  t.y.subVectors(B, A).normalize();
  t.z.copy(hint).addScaledVector(t.y, -hint.dot(t.y));
  if (t.z.lengthSq() < 1e-6) t.z.set(1, 0, 0).addScaledVector(t.y, -t.y.x);
  t.z.normalize();
  t.x.crossVectors(t.y, t.z);
  t.m.makeBasis(t.x, t.y, t.z);
  obj.quaternion.setFromRotationMatrix(t.m);
  obj.position.copy(A);
}

// Put a player into a pose (all in his own space).
function applyPose(P, v) {
  const t = TV, D = P.D;
  P.root.rotation.y = (P.baseYaw || 0) + v.rootYaw;
  P.pelvis.position.set(v.pel[0], v.pel[1], v.pel[2]);
  P.pelvis.rotation.set(0, v.pelYaw, v.pelRoll, "YXZ");
  P.chest.rotation.set(-v.lean, v.twist, v.side, "YXZ");
  P.headG.rotation.set(v.headPitch, v.headYaw, 0, "YXZ");
  P.pelvis.updateMatrix(); P.chest.updateMatrix();
  t.cm.multiplyMatrices(P.pelvis.matrix, P.chest.matrix);
  setFace(P.face, v.brow, v.smile, v.open, -Math.sin(v.headYaw) * 0.6, 0);

  // stick first: the top (right) hand holds the end, the shaft points at the blade target
  const arm = P.arm, leg = P.leg;
  t.fwd.set(0, 0, -1);
  // right arm (the top hand on the stick, or the catching glove)
  t.a.set(D.shW, D.shY, 0).applyMatrix4(t.cm);
  t.b.set(v.hR[0], v.hR[1], v.hR[2]);
  t.p.set(0.75, -0.5, 0.55);
  bend(t.a, t.b, t.p, D.upper, D.fore, t.e, t.h1);
  orient(arm[1].up, t.a, t.e, t.fwd); orient(arm[1].lo, t.e, t.h1, t.fwd); arm[1].el.position.copy(t.e);
  orient(arm[1].hand, t.h1, t.c.copy(t.h1).add(t.d2.subVectors(t.h1, t.e)), P.handHint ? P.handHint[1] : t.fwd);
  // stick
  if (P.stickHand === "L") {
    // the goalie: the stick lives in the left (blocker) hand; work that arm out first
    t.a.set(-D.shW, D.shY, 0).applyMatrix4(t.cm);
    t.b.set(v.hL[0], v.hL[1], v.hL[2]);
    t.p.set(-0.75, -0.5, 0.55);
    bend(t.a, t.b, t.p, D.upper, D.fore, t.e, t.h2);
    orient(arm[0].up, t.a, t.e, t.fwd); orient(arm[0].lo, t.e, t.h2, t.fwd); arm[0].el.position.copy(t.e);
    orient(arm[0].hand, t.h2, t.c.copy(t.h2).add(t.d2.subVectors(t.h2, t.e)), P.handHint ? P.handHint[0] : t.fwd);
    placeStick(P, t.h2, v.aim);
  } else {
    placeStick(P, t.h1, v.aim);
    // left arm: the bottom hand slides down the shaft, or lets go of it (a fist pump)
    t.b.copy(t.h1).addScaledVector(t.sd, v.grip);
    if (v.free > 0) { t.c.set(v.hL[0], v.hL[1], v.hL[2]); t.b.lerp(t.c, v.free); }
    t.a.set(-D.shW, D.shY, 0).applyMatrix4(t.cm);
    t.p.set(-0.75, -0.5, 0.55);
    bend(t.a, t.b, t.p, D.upper, D.fore, t.e, t.h2);
    orient(arm[0].up, t.a, t.e, t.fwd); orient(arm[0].lo, t.e, t.h2, t.fwd); arm[0].el.position.copy(t.e);
    orient(arm[0].hand, t.h2, t.c.copy(t.h2).add(t.d2.subVectors(t.h2, t.e)), t.fwd);
  }
  // legs: knees point where the hips face (or pinch in, for the goalie)
  const ch = Math.cos(v.pelYaw), sh = Math.sin(v.pelYaw);
  for (let s = 0; s < 2; s++) {
    const sg = s ? 1 : -1, f = s ? v.fR : v.fL, yaw = s ? v.yawR : v.yawL;
    t.a.set(sg * D.hipW, D.hipY, 0).applyMatrix4(P.pelvis.matrix);
    t.b.set(f[0], f[1], f[2]);
    t.p.set(-sh + sg * (0.25 - v.kneeIn), 0.15 - v.kneeIn * 0.9, -ch - sg * 0.25 * sh);
    bend(t.a, t.b, t.p, D.thigh, D.shin, t.e, t.h1);
    orient(leg[s].up, t.a, t.e, t.fwd); orient(leg[s].lo, t.e, t.h1, t.fwd); leg[s].kn.position.copy(t.e);
    leg[s].skate.position.set(t.h1.x, t.h1.y - D.ankle, t.h1.z);
    leg[s].skate.rotation.set(0, yaw, 0);
  }
}
// The blade goes to the target and the shaft runs back up from it through the hand to its end, so the stick always
// reaches the ice where the pose puts the blade. The blade lies flat, toe out across the body.
function placeStick(P, hand, aim) {
  const t = TV, L = P.shaftLen, reach = L - P.buttOver;
  t.sd.set(aim[0] - hand.x, aim[1] - hand.y, aim[2] - hand.z);
  let dist = t.sd.length();
  if (dist < 1e-4) { t.sd.set(0, -1, -1); dist = 1; }
  t.sd.multiplyScalar(1 / dist);
  t.d2.copy(hand).addScaledVector(t.sd, Math.min(dist, reach));    // the heel of the blade
  t.c.copy(t.d2).addScaledVector(t.sd, -L);                        // the butt end, past the hand
  orient(P.shaft, t.c, t.d2, t.fwd);
  // toe direction: across the body, flat on the ice
  t.x.set(t.sd.x, 0, t.sd.z);
  if (t.x.lengthSq() < 1e-4) t.x.set(P.toeSide, 0, 0); else t.x.normalize();
  const a = P.toeTurn, cx = Math.cos(a), sx = Math.sin(a), x0 = t.x.x;
  t.x.set(x0 * cx + t.x.z * sx, 0, -x0 * sx + t.x.z * cx);
  t.y.set(0, 1, 0); t.z.crossVectors(t.x, t.y);
  t.m.makeBasis(t.x, t.y, t.z);
  P.blade.quaternion.setFromRotationMatrix(t.m);
  P.blade.position.copy(t.d2);
  if (!P.heel) { P.heel = t.d2.clone(); P.toe = t.x.clone(); }
  P.heel.copy(t.d2); P.toe.copy(t.x);
}

// Copy every transform from a player onto his reflection in the ice.
function syncTwin(a, b) {
  b.position.copy(a.position); b.quaternion.copy(a.quaternion); b.scale.copy(a.scale); b.visible = a.visible;
  const ca = a.children, cb = b.children;
  for (let i = 0; i < ca.length && i < cb.length; i++) syncTwin(ca[i], cb[i]);
}

/* ---------------- The rink's shape ---------------- */
// The line of the boards, from far up the left side, around the corner, behind the net, and back up the right side.
// Each point carries the way into the rink (nx, nz) and how far along the boards it is (len).
function boardPath() {
  const p = [], R0 = 28, HX = 42.5, cz = END_Z + R0, sx = HX - R0;
  function add(x, z, nx, nz) { p.push({ x: x, z: z, nx: nx, nz: nz, len: 0 }); }
  add(-HX, 70, 1, 0); add(-HX, cz, 1, 0);
  for (let i = 1; i < 16; i++) { const a = Math.PI + i / 16 * Math.PI / 2; add(-sx + Math.cos(a) * R0, cz + Math.sin(a) * R0, -Math.cos(a), -Math.sin(a)); }
  for (let x = -sx; x <= sx + 0.001; x += sx / 6) add(x, END_Z, 0, 1);
  for (let i = 1; i < 16; i++) { const a = -Math.PI / 2 + i / 16 * Math.PI / 2; add(sx + Math.cos(a) * R0, cz + Math.sin(a) * R0, -Math.cos(a), -Math.sin(a)); }
  add(HX, cz, -1, 0); add(HX, 70, -1, 0);
  let len = 0;
  for (let i = 1; i < p.length; i++) { len += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); p[i].len = len; }
  return p;
}
// Bands swept along the board line. segs: [k0, y0, v0, k1, y1, v1], k = feet back from the line (into the stands), y = height.
function sweep(T, path, segs, uOf) {
  const pos = [], nor = [], uv = [], idx = [], n = path.length;
  for (let j = 0; j < segs.length; j++) {
    const s = segs[j], dk = s[3] - s[0], dy = s[4] - s[1], l = Math.hypot(dk, dy) || 1, nk = dy / l, ny = -dk / l, base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const q = path[i], u = uOf ? uOf(q) : 0;
      pos.push(q.x - q.nx * s[0], s[1], q.z - q.nz * s[0], q.x - q.nx * s[3], s[4], q.z - q.nz * s[3]);
      nor.push(q.nx * nk, ny, q.nz * nk, q.nx * nk, ny, q.nz * nk);
      uv.push(u, s[2], u, s[5]);
    }
    for (let i = 0; i < n - 1; i++) { const o = base + i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x070b22, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = (parseInt(T.REVISION, 10) || 0) >= 182 ? T.PCFShadowMap : T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(CAM.fov, W / H, 1, 900);
  const caps = renderer.capabilities;
  const aniso = Math.min(8, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);
  TV = { a: new T.Vector3(), b: new T.Vector3(), c: new T.Vector3(), d: new T.Vector3(), d2: new T.Vector3(), e: new T.Vector3(), p: new T.Vector3(),
         q: new T.Vector3(), x: new T.Vector3(), y: new T.Vector3(), z: new T.Vector3(), h1: new T.Vector3(), h2: new T.Vector3(), sd: new T.Vector3(),
         fwd: new T.Vector3(0, 0, -1), up: new T.Vector3(0, 1, 0), m: new T.Matrix4(), cm: new T.Matrix4() };

  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = aniso;
    return t;
  }
  function phong(o) { return new T.MeshPhongMaterial(o); }
  function lam(c) { return new T.MeshLambertMaterial({ color: c }); }

  const script = scriptCanvas(scriptImg);
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;
  const tShadow = tex(shadowCanvas()), tGlow = tex(glowCanvas());

  // The players, the net and the puck each have a twin in "mirror", flipped through the ice. The ice is a little
  // see-through, so the twins read as its reflection.
  const world = new T.Group(), mirror = new T.Group();
  mirror.scale.y = -1;
  scene.add(world); scene.add(mirror);
  function decal(mat, order) { mat.transparent = true; mat.depthWrite = false; mat._order = order; return mat; }

  /* lights: the arena's banks of lamps overhead, and the white of the ice throwing light back up */
  const hemi = new T.HemisphereLight(0xf2f6ff, 0xc8d6ea, 1.45); scene.add(hemi);
  const key = new T.DirectionalLight(0xffffff, 2.2);
  key.position.set(-12, 42, 26); key.target.position.set(0, 0, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 10; sc.far = 100;
  sc.updateProjectionMatrix();
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03; key.shadow.radius = 2;
  scene.add(key); scene.add(key.target);
  const rim = new T.DirectionalLight(0xbcd2ff, 0.9);           // from behind the net: a cool edge on the goalie's gear
  rim.position.set(6, 22, -30); scene.add(rim);
  const fill = new T.DirectionalLight(0xfff0dc, 0.5);         // warm, from behind the shooter
  fill.position.set(10, 14, 40); scene.add(fill);

  /* the ice */
  const iceMain = new T.MeshPhongMaterial({ map: tex(iceCanvas(script)), color: 0xe4ebf2, specular: 0x9fb4cc, shininess: 120, transparent: true, opacity: 0.88, depthWrite: false });
  const tTile = tex(iceTileCanvas(), true);
  const iceSide = new T.MeshPhongMaterial({ map: tTile, color: 0xe4ebf2, specular: 0x9fb4cc, shininess: 120, transparent: true, opacity: 0.88, depthWrite: false });
  function flat(x1, x2, z1, z2, y, mat, tile) {
    const g = new T.PlaneGeometry(x2 - x1, z2 - z1); g.rotateX(-Math.PI / 2);
    if (tile) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x2 - x1) / tile, uv.getY(i) * (z2 - z1) / tile); }
    const m = new T.Mesh(g, mat); m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); m.receiveShadow = true; m.renderOrder = 1;
    world.add(m); return m;
  }
  const iceA = flat(ICE.x0, ICE.x0 + ICE.size, ICE.z0, ICE.z0 + ICE.size, 0, iceMain);
  flat(-44, ICE.x0, ICE.z0, 80, 0, iceSide, 20); flat(ICE.x0 + ICE.size, 44, ICE.z0, 80, 0, iceSide, 20);
  flat(ICE.x0, ICE.x0 + ICE.size, ICE.z0 + ICE.size, 80, 0, iceSide, 20);
  const unit = new T.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
  // what is under the ice, seen through it where nothing is reflected: a cold white slab
  const under = new T.Mesh(new T.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), lam(0xcfdcea)); under.position.y = -12; scene.add(under);

  /* the boards, the LED ribbon on them, the glass */
  const bp = boardPath();
  const uLen = function (q) { return q.len / 24; };
  const tAds = tex(boardAdCanvas(script), true);
  const boardMat = phong({ map: tAds, specular: 0x666666, shininess: 50 });
  const kickMat = phong({ color: 0xffd21f, specular: 0x555555, shininess: 40 });
  const capMat = phong({ color: 0xf4f6fb, specular: 0x999999, shininess: 60 });
  const boardsGroup = new T.Group();
  boardsGroup.add(new T.Mesh(sweep(T, bp, [[0, 0, 0, 0, 0.85, 1]]), kickMat));
  boardsGroup.add(new T.Mesh(sweep(T, bp, [[0, 0.85, 0, 0, BOARD_H - 0.25, 1]], uLen), boardMat));
  boardsGroup.add(new T.Mesh(sweep(T, bp, [[0, BOARD_H - 0.25, 0, 0, BOARD_H, 1], [0, BOARD_H, 0, 0.6, BOARD_H, 1]]), capMat));
  boardsGroup.traverse(function (m) { if (m.isMesh) m.receiveShadow = true; });
  world.add(boardsGroup);
  // LED face on the end boards behind the net, in a black housing
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);             // one texel per LED, never smoothed
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  tLed.wrapS = T.RepeatWrapping;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas());
  tDot.wrapS = tDot.wrapT = T.RepeatWrapping; tDot.anisotropy = aniso;
  const csChunk = T.ShaderChunk && T.ShaderChunk.colorspace_fragment ? "colorspace_fragment" : "encodings_fragment";
  function ledMat(level, cols) {
    return new T.ShaderMaterial({
      uniforms: { tLed: { value: tLed }, tDot: { value: tDot }, grid: { value: new T.Vector2(cols || LED_COLS, LED_ROWS) }, cols: { value: LED_COLS }, level: { value: level } },
      vertexShader: "varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
      fragmentShader: [
        "uniform sampler2D tLed;", "uniform sampler2D tDot;", "uniform vec2 grid;", "uniform float cols;", "uniform float level;", "varying vec2 vUv;",
        "void main() {",
        "  vec2 cell = vUv * grid;",
        "  vec2 px = vec2(1.0 / cols, 1.0 / grid.y);",
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
        "  gl_FragColor = vec4(col * level, 1.0);",
        "  #include <" + csChunk + ">",
        "}"
      ].join("\n")
    });
  }
  const ledG = new T.Group();
  const house = new T.Mesh(roundBox(T, LED_HALF * 2 + 0.6, LED_HT + 0.5, 0.3, 0.08), lam(0x05070d));
  house.position.set(0, LED_Y0 + LED_HT / 2, END_Z + 0.05); ledG.add(house);
  const ledFace = new T.Mesh(new T.PlaneGeometry(LED_HALF * 2, LED_HT), ledMat(1));
  ledFace.position.set(0, LED_Y0 + LED_HT / 2, END_Z + 0.22); ledG.add(ledFace);
  world.add(ledG);
  // the glass, on stanchions, and two goal lamps on the rail behind the net
  const glassMat = new T.MeshPhongMaterial({ map: tex(glassCanvas(), true), color: 0xd8ecff, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.32, depthWrite: false, side: T.DoubleSide });
  const glass = new T.Mesh(sweep(T, bp, [[0.25, BOARD_H, 0, 0.25, BOARD_H + GLASS_H, 1]], function (q) { return q.len / 6; }), glassMat);
  glass.renderOrder = 3; world.add(glass);
  const stanchMat = phong({ color: 0x1b2a6a, specular: 0x8899cc, shininess: 60 });
  const stGeo = new T.BoxGeometry(0.22, GLASS_H, 0.22);
  for (let i = 0; i < bp.length; i++) {
    const q = bp[i];
    if (Math.abs(q.z) > 64) continue;
    if (i % 2 === 0) continue;
    const m = new T.Mesh(stGeo, stanchMat); m.position.set(q.x - q.nx * 0.25, BOARD_H + GLASS_H / 2, q.z - q.nz * 0.25); world.add(m);
  }
  const lampMat = new T.MeshPhongMaterial({ color: 0x701010, emissive: 0x000000, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.9 });
  const lamps = [];
  [-6.4, 6.4].forEach(function (x) {
    const base = new T.Mesh(new T.CylinderGeometry(0.28, 0.32, 0.22, 16), lam(0x1b1d26)); base.position.set(x, BOARD_H + 0.11, END_Z - 0.3); world.add(base);
    const dome = new T.Mesh(new T.SphereGeometry(0.26, 16, 10, 0, TAU, 0, Math.PI / 2), lampMat); dome.position.set(x, BOARD_H + 0.22, END_Z - 0.3); world.add(dome);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: 0xff2a1a, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    glow.scale.set(3.2, 3.2, 1); glow.position.set(x, BOARD_H + 0.35, END_Z - 0.1); world.add(glow);
    lamps.push(glow);
  });

  /* the end stands behind the glass: rows of seats, a 3D crowd, the ribbon on the fascia, the upper deck */
  const ROWS = 9, TREAD = 2.7, RISE = 1.3, Z0 = END_Z - 1.3, Y0 = 0.25, SW = 90;
  const seatTex = tex(seatCanvas(), true);
  const seatMat = new T.MeshLambertMaterial({ map: seatTex });
  const stands = new T.BufferGeometry();
  (function () {
    const pos = [], nor = [], uv = [], idx = [];
    function quad(a, b, c, d, n, u1, v0, v1) {
      const o = pos.length / 3;
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
      for (let i = 0; i < 4; i++) nor.push(n[0], n[1], n[2]);
      uv.push(0, v0, u1, v0, u1, v1, 0, v1);
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    quad([-SW / 2, 0, Z0 + 0.4], [SW / 2, 0, Z0 + 0.4], [SW / 2, Y0, Z0 + 0.4], [-SW / 2, Y0, Z0 + 0.4], [0, 0, 1], SW / 12, 0, 0.5);
    for (let r = 0; r < ROWS; r++) {
      const z = Z0 - r * TREAD, y = Y0 + r * RISE;
      quad([-SW / 2, y, z], [SW / 2, y, z], [SW / 2, y, z - TREAD], [-SW / 2, y, z - TREAD], [0, 1, 0], SW / 12, 0.5, 1);
      quad([-SW / 2, y, z - TREAD], [SW / 2, y, z - TREAD], [SW / 2, y + RISE, z - TREAD], [-SW / 2, y + RISE, z - TREAD], [0, 0, 1], SW / 12, 0, 0.5);
    }
    stands.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    stands.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
    stands.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    stands.setIndex(idx);
  })();
  world.add(new T.Mesh(stands, seatMat));
  const backZ = Z0 - ROWS * TREAD, topY = Y0 + ROWS * RISE;
  // the fascia with the ribbon board along it
  const fascia = new T.Mesh(new T.BoxGeometry(SW, 4.6, 1), lam(0x05070d)); fascia.position.set(0, topY + 2.3, backZ - 0.2); world.add(fascia);
  const ribbon = new T.Mesh(new T.PlaneGeometry(SW - 4, 3.2), ledMat(1, LED_COLS * 3));
  (function () { const uv = ribbon.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 3); })();
  ribbon.position.set(0, topY + 2.3, backZ + 0.32); world.add(ribbon);
  const trim = new T.Mesh(new T.BoxGeometry(SW, 0.3, 1.2), lam(0xff9214)); trim.position.set(0, topY + 4.7, backZ - 0.1); world.add(trim);
  const upper = new T.Mesh(new T.PlaneGeometry(SW, 40), new T.MeshBasicMaterial({ map: tex(upperCanvas(), true), color: 0x9aa6d8 }));
  (function () { const uv = upper.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 3); })();
  upper.rotation.x = -0.62; upper.position.set(0, topY + 4.8 + 20 * Math.sin(0.62), backZ - 1 - 20 * Math.cos(0.62)); world.add(upper);
  const banner = new T.Mesh(new T.PlaneGeometry(36, 9), new T.MeshBasicMaterial({ map: tex(bannerCanvas(script)) }));
  banner.position.set(0, topY + 34, backZ - 22); world.add(banner);
  // the side stands, simpler: seats and faces painted on, under the same fascia line
  [-1, 1].forEach(function (s) {
    const m = new T.Mesh(new T.PlaneGeometry(90, 26), new T.MeshLambertMaterial({ map: tex(upperCanvas(), true), color: 0xb8c2ee }));
    const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5, uv.getY(i) * 1.5);
    m.rotation.y = -s * Math.PI / 2; m.rotation.x = 0; m.position.set(s * 49, 13, 22);
    m.rotateX(0.55); world.add(m);
  });

  // The crowd: instanced, one draw call per part. Bodies are turned on a lathe (shoulders, chest, a waist), heads have eyes
  // and hair or a cap, arms hang from the shoulder and go up when the place erupts (the shader lifts them).
  const crowdU = { uTime: { value: 0 }, uCheer: { value: 0 }, uOoh: { value: 0 } };
  function cheering(mat, arms) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = crowdU.uTime; sh.uniforms.uCheer = crowdU.uCheer; sh.uniforms.uOoh = crowdU.uOoh;
      sh.vertexShader = "uniform float uTime;\nuniform float uCheer;\nuniform float uOoh;\n" + sh.vertexShader.replace("#include <begin_vertex>",
        "#include <begin_vertex>\n#ifdef USE_INSTANCING\n" +
        "  float npPh = instanceMatrix[3].x * 0.71 + instanceMatrix[3].z * 0.37;\n" +
        (arms ? "  float npA = -(uCheer * (2.5 + 0.35 * sin(uTime * 9.0 + npPh)) + uOoh * 1.1 + 0.05 * sin(uTime * 1.3 + npPh));\n" +
                "  float npC = cos(npA), npS = sin(npA);\n" +
                "  transformed = vec3(transformed.x, transformed.y * npC - transformed.z * npS, transformed.y * npS + transformed.z * npC);\n" : "") +
        "  transformed.y += uCheer * (0.15 + 0.55 * abs(sin(uTime * 7.0 + npPh))) + 0.03 * sin(uTime * 1.7 + npPh);\n#endif");
    };
    mat.customProgramCacheKey = function () { return arms ? "np-crowd-arms" : "np-crowd-body"; };   // the two shaders differ: keep them apart
    return mat;
  }
  const fanBody = (function () {
    const torso = lathe(T, [[0.34, 0], [0.37, 0.25], [0.31, 0.8], [0.37, 1.05], [0.44, 1.28], [0.5, 1.43], [0.46, 1.55], [0.3, 1.65], [0, 1.73]], 10,
      function (a, y) { return y < 1.1 ? 0.03 * Math.sin(a * 5 + y * 4) : 0; });
    torso.scale(1, 1, 0.6);
    const L = [{ g: torso, m: 0 }];
    [-1, 1].forEach(function (sg) {
      L.push({ g: new T.SphereGeometry(1, 7, 5), m: 0, M: mx(T, sg * 0.43, 1.42, 0, 0, 0, 0, 0.17, 0.15, 0.17) });            // shoulders
      const th = lathe(T, [[0.17, 0], [0.18, 0.3], [0.14, 0.85], [0, 0.92]], 6); th.rotateX(Math.PI / 2); th.translate(sg * 0.17, 0.12, 0);
      L.push({ g: th, m: 0 });                                                                                             // thighs, seated
    });
    return merged(T, L).geometry;
  })();
  const fanHead = (function () {
    const L = [];
    L.push({ g: lathe(T, [[0.12, 1.6], [0.11, 1.82], [0.12, 1.95]], 6), m: 0 });
    L.push({ g: new T.SphereGeometry(1, 10, 8), m: 0, M: mx(T, 0, 2.06, 0, 0, 0, 0, 0.235, 0.28, 0.26) });
    L.push({ g: new T.SphereGeometry(1, 8, 5), m: 0, M: mx(T, 0, 1.93, 0.05, 0, 0, 0, 0.19, 0.15, 0.2) });
    L.push({ g: new T.SphereGeometry(1, 5, 4), m: 0, M: mx(T, 0, 1.99, 0.255, 0.3, 0, 0, 0.042, 0.07, 0.055) });
    [-1, 1].forEach(function (sg) { L.push({ g: new T.SphereGeometry(1, 5, 3), m: 0, M: mx(T, sg * 0.23, 2.03, 0, 0, 0, 0, 0.035, 0.07, 0.05) }); });
    return merged(T, L).geometry;
  })();
  const fanHair = new T.SphereGeometry(1, 10, 4, 0, TAU, 0, Math.PI * 0.5); fanHair.scale(0.25, 0.3, 0.28); fanHair.translate(0, 2.1, -0.02);
  const fanEyes = (function () {
    const L = [];
    [-1, 1].forEach(function (sg) {
      L.push({ g: new T.SphereGeometry(1, 4, 3), m: 0, M: mx(T, sg * 0.085, 2.08, 0.23, 0, 0, 0, 0.033, 0.04, 0.025) });
      L.push({ g: new T.SphereGeometry(1, 4, 2), m: 0, M: mx(T, sg * 0.088, 2.155, 0.235, 0, 0, sg * -0.15, 0.055, 0.013, 0.02) });
    });
    L.push({ g: new T.SphereGeometry(1, 5, 2), m: 0, M: mx(T, 0, 1.885, 0.235, 0, 0, 0, 0.065, 0.017, 0.02) });
    return merged(T, L).geometry;
  })();
  // an arm hangs from the shoulder: upper arm down, a bent elbow, the forearm out toward the knee
  const fanArm = (function () {
    const up = lathe(T, [[0.12, 0], [0.13, 0.1], [0.1, 0.72]], 6);
    up.rotateX(Math.PI); up.rotateX(0.25);
    const ex = 0, ey = -0.72 * Math.cos(0.25), ez = 0.72 * Math.sin(0.25);
    const lo = lathe(T, [[0.1, 0], [0.08, 0.6]], 6);
    lo.rotateX(Math.PI / 2 + 0.45); lo.translate(ex, ey, ez);
    const el = new T.SphereGeometry(0.1, 6, 4); el.translate(ex, ey, ez);
    return merged(T, [{ g: up, m: 0 }, { g: lo, m: 0 }, { g: el, m: 0 }]).geometry;
  })();
  const fanHand = (function () {
    const g = new T.SphereGeometry(1, 6, 4); g.scale(0.085, 0.075, 0.11);
    const ey = -0.72 * Math.cos(0.25), ez = 0.72 * Math.sin(0.25);
    g.translate(0, ey - 0.62 * Math.sin(0.45) - 0.02, ez + 0.62 * Math.cos(0.45) + 0.05);
    return g;
  })();
  const FAN_COLS = ["#e8392e", "#e8392e", "#12224f", "#16b9e8", "#ffd23f", "#ff3fa4", "#ffffff", "#58c322", "#ff9214", "#8a5cff"];
  const SKIN = ["#f1c7a0", "#d9a273", "#a8703f", "#f6d7b8", "#7b4f2c", "#c98a5a"];
  const HAIR = ["#2a1a10", "#4a2a14", "#c99a4a", "#111111", "#7a3a1a", "#e8392e", "#12224f", "#ffd23f"];
  const seats = [], rnd = rng(77);
  const SIGN_AT = [[-5.2, 0], [-0.6, 2], [3.4, 1], [6.8, 3]];
  for (let r = 0; r < ROWS; r++) {
    const z = Z0 - r * TREAD - TREAD * 0.62, y = Y0 + r * RISE + 1.0;
    for (let x = -22; x < 22; x += 2.0) {
      if (rnd() > (r === 0 ? 0.97 : 0.86)) continue;
      let sign = -1;
      if (r === 0) for (let k = 0; k < SIGN_AT.length; k++) if (Math.abs(x + 0.4 - SIGN_AT[k][0]) < 0.98) sign = SIGN_AT[k][1];
      seats.push({ x: x + (rnd() - 0.5) * 0.3, y: y, z: z, s: 0.95 + rnd() * 0.12, sign: sign });
    }
  }
  const nF = seats.length;
  const bodyMat = cheering(new T.MeshLambertMaterial({ color: 0xffffff }), false), headMat = cheering(new T.MeshLambertMaterial({ color: 0xffffff }), false);
  const hairMat = cheering(new T.MeshLambertMaterial({ color: 0xffffff }), false), eyeMat = cheering(new T.MeshBasicMaterial({ color: 0x16171d }), false);
  const armMat = cheering(new T.MeshLambertMaterial({ color: 0xffffff }), true);
  const iBody = new T.InstancedMesh(fanBody, bodyMat, nF), iHead = new T.InstancedMesh(fanHead, headMat, nF), iHair = new T.InstancedMesh(fanHair, hairMat, nF), iEyes = new T.InstancedMesh(fanEyes, eyeMat, nF);
  const iArm = new T.InstancedMesh(fanArm, armMat, nF * 2), handMat = cheering(new T.MeshLambertMaterial({ color: 0xffffff }), true), iHand = new T.InstancedMesh(fanHand, handMat, nF * 2);
  (function () {
    const m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), sc2 = new T.Vector3(), v = new T.Vector3(), col = new T.Color(), skinC = new T.Color();
    for (let i = 0; i < nF; i++) {
      const f = seats[i];
      e.set(0, (rnd() - 0.5) * 0.3, 0); q.setFromEuler(e); sc2.setScalar(f.s);
      m.compose(v.set(f.x, f.y, f.z), q, sc2);
      iBody.setMatrixAt(i, m); iHead.setMatrixAt(i, m); iHair.setMatrixAt(i, m); iEyes.setMatrixAt(i, m);
      const shirt = FAN_COLS[Math.floor(rnd() * FAN_COLS.length)];
      iBody.setColorAt(i, col.set(shirt));
      skinC.set(SKIN[Math.floor(rnd() * SKIN.length)]);
      iHead.setColorAt(i, skinC);
      iHair.setColorAt(i, col.set(HAIR[Math.floor(rnd() * HAIR.length)]));
      for (let s = 0; s < 2; s++) {
        const sg = s ? 1 : -1;
        e.set(f.sign >= 0 ? -2.05 : 0, 0, sg * (f.sign >= 0 ? 0.2 : 0.1)); q.setFromEuler(e);
        m.compose(v.set(f.x + sg * 0.47 * f.s, f.y + 1.42 * f.s, f.z), q, sc2);
        iArm.setMatrixAt(i * 2 + s, m); iArm.setColorAt(i * 2 + s, col.set(shirt));
        iHand.setMatrixAt(i * 2 + s, m); iHand.setColorAt(i * 2 + s, skinC);
      }
    }
    [iBody, iHead, iHair, iEyes, iArm, iHand].forEach(function (im) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.frustumCulled = false; world.add(im); });
  })();
  // the signs in the front row
  const signs = [];
  signCanvases(script).forEach(function (cv, i) {
    const at = SIGN_AT.filter(function (s) { return s[1] === i; })[0];
    const m = new T.Mesh(new T.PlaneGeometry(1.9, 1.2), new T.MeshLambertMaterial({ map: tex(cv), side: T.DoubleSide }));
    m.position.set(at[0], Y0 + 1.0 + 2.85, Z0 - TREAD * 0.62 + 0.75); m.rotation.x = -0.12;
    world.add(m); signs.push({ m: m, y: m.position.y, ph: i * 1.7 });
  });

  /* the net */
  const net = new T.Group();
  const red = phong({ color: 0xd8262f, specular: 0xffffff, shininess: 110, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12 });
  const frame = new T.CurvePath(), cr = 0.28, pr = 0.105;
  frame.add(new T.LineCurve3(new T.Vector3(-NET_W, 0, 0), new T.Vector3(-NET_W, NET_H - cr, 0)));
  frame.add(new T.QuadraticBezierCurve3(new T.Vector3(-NET_W, NET_H - cr, 0), new T.Vector3(-NET_W, NET_H, 0), new T.Vector3(-NET_W + cr, NET_H, 0)));
  frame.add(new T.LineCurve3(new T.Vector3(-NET_W + cr, NET_H, 0), new T.Vector3(NET_W - cr, NET_H, 0)));
  frame.add(new T.QuadraticBezierCurve3(new T.Vector3(NET_W - cr, NET_H, 0), new T.Vector3(NET_W, NET_H, 0), new T.Vector3(NET_W, NET_H - cr, 0)));
  frame.add(new T.LineCurve3(new T.Vector3(NET_W, NET_H - cr, 0), new T.Vector3(NET_W, 0, 0)));
  const posts = new T.Mesh(new T.TubeGeometry(frame, 120, pr, 12, false), red); posts.castShadow = true; net.add(posts);
  const baseCurve = new T.CatmullRomCurve3([[-NET_W, 0.07, 0], [-3.28, 0.07, -1.3], [-2.5, 0.07, -2.95], [0, 0.07, -NET_D], [2.5, 0.07, -2.95], [3.28, 0.07, -1.3], [NET_W, 0.07, 0]].map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }));
  const topCurve = new T.CatmullRomCurve3([[-NET_W, NET_H, -0.05], [-3.0, 3.9, -0.8], [-2.55, 3.55, -1.35], [0, 3.42, -1.62], [2.55, 3.55, -1.35], [3.0, 3.9, -0.8], [NET_W, NET_H, -0.05]].map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }));
  const white = phong({ color: 0xf6f6f2, specular: 0x777777, shininess: 50 });
  const baseTube = new T.Mesh(new T.TubeGeometry(baseCurve, 80, 0.07, 8, false), red); baseTube.castShadow = true; net.add(baseTube);
  net.add(new T.Mesh(new T.TubeGeometry(topCurve, 80, 0.04, 6, false), white));
  // netting: a ruled surface from the base frame up to the top frame, plus the roof back from the crossbar
  const NU = 48, NV = 14, netTex = tex(netCanvas(), true);
  const netMat = new T.MeshLambertMaterial({ map: netTex, transparent: true, depthWrite: false, side: T.DoubleSide, opacity: 0.95 });
  function netSurface(fn, nu, nv, su, sv) {
    const g = new T.PlaneGeometry(1, 1, nu, nv), pos = g.attributes.position, uv = g.attributes.uv, v3 = new T.Vector3();
    for (let i = 0; i < pos.count; i++) { const u = uv.getX(i), v = uv.getY(i); fn(u, v, v3); pos.setXYZ(i, v3.x, v3.y, v3.z); uv.setXY(i, u * su, v * sv); }
    g.computeVertexNormals();
    return g;
  }
  const bA = new T.Vector3(), tA = new T.Vector3();
  const sideGeo = netSurface(function (u, v, out) { baseCurve.getPoint(u, bA); topCurve.getPoint(u, tA); out.lerpVectors(bA, tA, v); out.x *= 1 + 0.03 * Math.sin(v * Math.PI); out.z *= 1 + 0.03 * Math.sin(v * Math.PI); }, NU, NV, 13, 3);
  const roofGeo = netSurface(function (u, v, out) { topCurve.getPoint(u, tA); out.set(tA.x, NET_H + (tA.y - NET_H) * v, -0.05 + (tA.z + 0.05) * v); out.y -= 0.06 * Math.sin(v * Math.PI); }, NU, 6, 13, 1.2);
  const netSide = new T.Mesh(sideGeo, netMat), netRoof = new T.Mesh(roofGeo, netMat);
  netSide.renderOrder = 4; netRoof.renderOrder = 4;
  net.add(netSide); net.add(netRoof);
  const skirtGeo = netSurface(function (u, v, out) { baseCurve.getPoint(u, bA); out.set(bA.x * (1 - 0.04 * v), 0.02 + v * 0.42, bA.z * (1 - 0.04 * v)); }, NU, 1, 1, 1);
  const skirt = new T.Mesh(skirtGeo, new T.MeshLambertMaterial({ color: 0xf2f2ee, side: T.DoubleSide })); net.add(skirt);
  const netBase = Float32Array.from(sideGeo.attributes.position.array);
  world.add(net);
  const netTwin = net.clone(); mirror.add(netTwin);

  /* the puck */
  const puckTop = phong({ map: tex(puckCanvas(script)), specular: 0x555555, shininess: 40 });
  const puckSide = phong({ color: 0x15161c, specular: 0x333333, shininess: 20 });
  const puck = new T.Mesh(new T.CylinderGeometry(PUCK_R, PUCK_R, PUCK_T, 28), [puckSide, puckTop, puckTop]);
  puck.castShadow = true;
  const puckInk = new T.Mesh(new T.CylinderGeometry(PUCK_R * 1.18, PUCK_R * 1.18, PUCK_T * 1.4, 20), new T.MeshBasicMaterial({ color: 0x08205f, side: T.BackSide }));
  puck.add(puckInk);
  world.add(puck);
  const puckTwin = puck.clone(); mirror.add(puckTwin);

  /* the rare cartridge (batch 3 extras), hovering in the goal mouth with a glow behind it */
  const cartSide = phong({ color: 0x9a9eac, specular: 0xaaaaaa, shininess: 60 });
  const cartFace = phong({ map: tex(cartCanvas(script)), specular: 0xaaaaaa, shininess: 70, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.1, emissive: 0x222222 });
  const cart = new T.Mesh(roundBox(T, 0.66, 0.58, 0.12, 0.04), [cartSide, cartSide, cartSide, cartSide, cartFace, cartFace]);
  const cartGlow = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color: 0xffd23f, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
  cartGlow.scale.set(1.6, 1.6, 1); cartGlow.position.z = -0.2; cart.add(cartGlow);
  cart.visible = false; world.add(cart);

  /* blob shadows, for when the shadow maps are switched off */
  const blobMat = decal(new T.MeshBasicMaterial({ map: tShadow, opacity: 0.55 }), 5);
  function blob(w, d) { const m = new T.Mesh(unit, blobMat); m.scale.set(w, 1, d); m.renderOrder = 5; m.position.y = 0.03; m.visible = false; world.add(m); return m; }
  const blobs = { shooter: blob(3.2, 2.6), goalie: blob(4, 2.6), puck: blob(0.6, 0.6) };

  /* the players */
  const G = { sph: new T.SphereGeometry(1, 16, 11), sphLo: new T.SphereGeometry(1, 9, 6), env: tEnv };
  G.smile = new T.TorusGeometry(0.06, 0.013, 6, 14, Math.PI);
  G.neck = lathe(T, [[0.15, 0], [0.135, 0.2], [0.125, 0.36], [0.13, 0.42]], 14);
  G.collar = lathe(T, [[0.2, 0], [0.22, 0.06], [0.18, 0.13], [0, 0.14]], 16);
  const boxCache = {};
  G.box = function (w, h, d, r) { const k = [w, h, d, r].join(","); return boxCache[k] || (boxCache[k] = roundBox(T, w, h, d, r)); };
  G.dome = new T.SphereGeometry(1, 22, 10, 0, TAU, 0, Math.PI * 0.43);                       // the crown, clear of the brows
  G.shell = new T.SphereGeometry(1, 18, 8, Math.PI * 1.5 + 0.95, TAU - 1.9, Math.PI * 0.43, Math.PI * 0.33);   // back and sides, open over the face
  const white2 = lam(0xffffff), pupil = new T.MeshBasicMaterial({ color: 0x1a1410 }), mouth = lam(0x5a1418);
  function skinMat(c) { return phong({ color: c, specular: 0x2a2018, shininess: 14 }); }
  function cloth(c, map) { return phong({ color: c, map: map || null, specular: 0x222222, shininess: 12 }); }
  function plastic(c, map, refl) { return phong({ color: c, map: map || null, specular: 0xcccccc, shininess: 80, envMap: tEnv, combine: T.AddOperation, reflectivity: refl == null ? 0.05 : refl }); }
  function leather(c) { return phong({ color: c, specular: 0x333333, shininess: 24 }); }
  const steel = phong({ color: 0xaab3c2, specular: 0xffffff, shininess: 140, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.25 });
  const cageMat = phong({ color: 0x8c95a6, specular: 0xffffff, shininess: 120 });
  const tape = lam(0x16171d);

  // The shooter: number 12 of the Rink Rats, red and navy, left shot.
  const S_SKIN = skinMat(0xe0a070);
  const sJersey = cloth(0xffffff, tex(jerseyCanvas({
    base: "#e8392e", yoke: "#12224f", seed: 3,
    hem: [["#12224f", 20, 26], ["#f6e8c8", 50, 14], ["#12224f", 68, 14]],
    back: function (g) {
      [0, 1024].forEach(function (x) {
        blockText(g, "RINK RAT", x, 118, 62, "#f6e8c8", "#12224f", 5, 330);
        blockText(g, "12", x, 268, 190, "#f6e8c8", "#12224f", 9, 300, "#ffd23f", 4);
      });
    },
    front: function (g) { g.drawImage(ratLogo(250), 512 - 125, 120, 250, 250); }
  })));
  const sSleeve = cloth(0xffffff, tex(sleeveCanvas({ base: "#e8392e", yoke: "#12224f", stripes: [["#12224f", 214, 22], ["#f6e8c8", 190, 12], ["#12224f", 176, 12]], num: "12", numFill: "#f6e8c8", numLine: "#12224f", seed: 9 })));
  const sRed = cloth(0xe8392e), sNavy = cloth(0x12224f), sGlove = leather(0x16285e), sRoll = leather(0xe8392e), sPalm = cloth(0x9a7a56);
  const sSock = cloth(0xffffff, tex(sockCanvas("#e8392e", [["#12224f", 20, 20], ["#f6e8c8", 44, 10], ["#12224f", 58, 10]])));
  const sBoot = plastic(0x16171d), sHolder = plastic(0xf2f2f2);
  const sHelmet = (function () {
    const g = new T.Group(), hm = plastic(0xffffff, tex(skaterHelmetCanvas("12")), 0.08), navy = plastic(0x12224f);
    const L = [{ g: G.dome, m: hm, M: mx(T, 0, 0.04, 0.02, 0, 0, 0, 0.29, 0.34, 0.32) }, { g: G.shell, m: hm, M: mx(T, 0, 0.04, 0.02, 0, 0, 0, 0.29, 0.34, 0.32) },
               { g: G.box(0.62, 0.035, 0.05, 0.015), m: plastic(0x16171d), M: mx(T, 0, 0.115, -0.22, 0.2, 0, 0) }];
    [-1, 1].forEach(function (s) { L.push({ g: G.sph, m: navy, M: mx(T, s * 0.27, -0.02, 0.02, 0, 0, 0, 0.05, 0.12, 0.1) }); });
    g.add(merged(T, L));
    const visor = new T.Mesh(new T.CylinderGeometry(0.315, 0.3, 0.15, 18, 1, true, Math.PI - 1.05, 2.1),
      new T.MeshPhongMaterial({ color: 0xbfe3ff, specular: 0xffffff, shininess: 160, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }));
    visor.position.set(0, 0.04, 0.0); g.add(visor);
    return g;
  })();
  const shooterShaft = merged(T, [
    { g: G.box(0.085, 4.3, 0.12, 0.03), m: leather(0x1b1d26), M: mx(T, 0, 2.15, 0) },
    { g: G.box(0.09, 0.9, 0.125, 0.03), m: leather(0xe8392e), M: mx(T, 0, 2.2, 0) },
    { g: G.box(0.1, 0.32, 0.135, 0.035), m: cloth(0xf2f2f2), M: mx(T, 0, 0.12, 0) }
  ]);
  function bladeGeo(len, ht, th, curve) {
    const g = roundBox(T, len, ht, th, 0.025);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + len / 2; p.setX(i, x); p.setY(i, p.getY(i) + ht / 2); p.setZ(i, p.getZ(i) - curve * (x / len) * (x / len)); }
    g.computeVertexNormals(); return g;
  }
  const shooterBlade = merged(T, [{ g: bladeGeo(0.95, 0.24, 0.05, 0.12), m: tape }, { g: G.box(0.12, 0.26, 0.06, 0.02), m: cloth(0xf2f2f2), M: mx(T, 0.06, 0.13, 0) }]);
  const shooter = makePlayer(T, G, {
    dims: DIM_SKATER, skin: S_SKIN, white: white2, pupil: pupil, mouth: mouth, lip: skinMat(0xc97a5a), hair: cloth(0x3a2212),
    jersey: sJersey, sleeve: sSleeve, shoulder: sNavy, elbow: sRed, knee: sRed, capR: 0.27, elbowR: 0.19, kneeR: 0.21, torsoDepth: 0.68,
    collar: sNavy, helmet: sHelmet,
    pantsGeo: (function () { const g = lathe(T, [[0.42, -0.58], [0.5, -0.42], [0.53, -0.15], [0.5, 0.08], [0.45, 0.2], [0.3, 0.27], [0, 0.28]], 18, function (a, y) { return y < -0.2 ? 0.03 * Math.sin(a * 6) : 0; }); g.scale(1, 1, 0.78); return g; })(),
    pants: sNavy,
    torsoGeo: lathe(T, [[0.47, -0.18], [0.5, -0.06], [0.47, 0.15], [0.45, 0.35], [0.5, 0.7], [0.58, 1.0], [0.66, 1.2], [0.66, 1.34], [0.52, 1.48], [0.3, 1.56], [0.17, 1.6], [0, 1.61]], 24,
      function (a, y) { return y < 1.0 ? (0.035 * Math.sin(a * 7 + y * 3) + 0.02 * Math.sin(a * 13)) * (1 - y) : 0; }),
    upper: function () { return new T.Mesh(lathe(T, [[0.2, -0.05], [0.22, 0.08], [0.21, 0.45], [0.19, 0.8], [0.19, 0.95], [0.1, 1.02], [0, 1.03]], 14, function (a, y) { return 0.03 * Math.sin(a * 5 + y * 4); }), sSleeve); },
    fore: function () {
      return merged(T, [
        { g: lathe(T, [[0.19, -0.04], [0.18, 0.2], [0.16, 0.46]], 12), m: sRed },
        { g: lathe(T, [[0.12, 0.38], [0.22, 0.42], [0.21, 0.62], [0.17, 0.92], [0.12, 0.97], [0, 0.98]], 14), m: sGlove }
      ]);
    },
    handR: function () { return merged(T, gloveParts(T, G, sGlove, sRoll, sPalm, 1)); },
    handL: function () { return merged(T, gloveParts(T, G, sGlove, sRoll, sPalm, -1)); },
    thigh: function () {
      return merged(T, [
        { g: lathe(T, [[0.28, -0.05], [0.33, 0.18], [0.32, 0.7], [0.29, 1.02], [0.27, 1.1], [0.2, 1.13], [0, 1.14]], 14, function (a) { return 0.025 * Math.sin(a * 4); }), m: sNavy },
        { g: lathe(T, [[0.2, 1.0], [0.21, 1.25], [0.2, 1.45]], 12), m: sRed }
      ]);
    },
    shin: function () { return new T.Mesh(lathe(T, [[0.215, 0], [0.24, 0.22], [0.235, 0.45], [0.2, 0.85], [0.165, 1.15], [0.15, 1.4]], 14), sSock); },
    skate: function () { return skateMesh(T, G, sBoot, sHolder, steel, DIM_SKATER.ankle, false); },
    shaft: shooterShaft, blade: shooterBlade
  });
  shooter.shaftLen = 4.3; shooter.buttOver = 0.12; shooter.toeSide = -1; shooter.toeTurn = 1.05; shooter.stickHand = "R";
  world.add(shooter.root);

  // The goalie: number 30 of the Shelf Guardians, navy and gold, catches with his right hand (your left).
  const G_SKIN = skinMat(0xc98a5a);
  const gJersey = cloth(0xffffff, tex(jerseyCanvas({
    base: "#2f3b7a", seed: 11, chest: ["#ffd23f", 150, 28],
    hem: [["#ffd23f", 24, 22], ["#a77bff", 52, 10]],
    back: function (g) { [0, 1024].forEach(function (x) { blockText(g, "30", x, 270, 170, "#ffd23f", "#12224f", 8, 280); }); },
    front: function (g) { g.fillStyle = "#2f3b7a"; g.fillRect(512 - 140, 140, 280, 40); g.drawImage(guardCrest(270), 512 - 135, 112, 270, 270); }
  })));
  const gSleeve = cloth(0xffffff, tex(sleeveCanvas({ base: "#2f3b7a", stripes: [["#ffd23f", 214, 24], ["#a77bff", 186, 10]], num: "30", numFill: "#ffd23f", numLine: "#12224f", seed: 13 })));
  const gNavy = cloth(0x2f3b7a), gPurple = plastic(0xa77bff), gWhite = plastic(0xf6f4ee), gRed = plastic(0xff4b3e);
  const gPadFace = plastic(0xffffff, tex(padCanvas(script)));
  const gHelmet = (function () {
    const g = new T.Group(), hm = plastic(0xffffff, tex(goalieHelmetCanvas()), 0.08);
    const L = [{ g: G.dome, m: hm, M: mx(T, 0, 0.03, 0.03, 0, 0, 0, 0.31, 0.37, 0.34) }, { g: G.shell, m: hm, M: mx(T, 0, 0.03, 0.03, 0, 0, 0, 0.31, 0.37, 0.34) },
               { g: G.sph, m: gPurple, M: mx(T, 0, -0.12, 0.25, 0, 0, 0, 0.24, 0.22, 0.12) }];
    [-1, 1].forEach(function (s) { L.push({ g: G.sph, m: gWhite, M: mx(T, s * 0.28, -0.06, 0.0, 0, 0, 0, 0.06, 0.17, 0.15) }); });
    // the cage: steel bars over the face, so the face shows through
    const arc = 2.3;
    [0.1, 0.0, -0.1, -0.2, -0.29].forEach(function (y, i) {
      const r = 0.34 - (i > 2 ? (i - 2) * 0.03 : 0), tg = new T.TorusGeometry(r, 0.0075, 4, 18, arc);
      tg.rotateZ(-Math.PI / 2 - arc / 2); tg.rotateX(Math.PI / 2); tg.translate(0, y, 0.02);
      L.push({ g: tg, m: cageMat });
    });
    [-0.75, -0.42, -0.14, 0.14, 0.42, 0.75].forEach(function (a) {
      const cg = new T.CylinderGeometry(0.0075, 0.0075, 0.44, 4); cg.translate(Math.sin(a) * 0.33, -0.09, 0.02 - Math.cos(a) * 0.33);
      L.push({ g: cg, m: cageMat });
    });
    L.push({ g: G.sph, m: gPurple, M: mx(T, 0, -0.33, -0.2, 0, 0, 0, 0.12, 0.07, 0.09) });       // chin cup
    g.add(merged(T, L));
    return g;
  })();
  function padMesh() {
    const body = roundBox(T, 0.92, 2.25, 0.4, 0.13); body.rotateZ(Math.PI); body.translate(0, 0.5, 0.16);
    const face = new T.PlaneGeometry(0.84, 2.12); face.rotateZ(Math.PI); face.translate(0, 0.5, 0.364);   // canvas top at the knee
    const L = [{ g: body, m: gWhite }, { g: face, m: gPadFace }];
    [-0.36, -0.15, 0.06].forEach(function (y) { const c = new T.CylinderGeometry(0.04, 0.04, 0.84, 10); c.rotateZ(Math.PI / 2); c.translate(0, y, 0.37); L.push({ g: c, m: gRed }); });
    L.push({ g: G.box(0.7, 0.5, 0.3, 0.1), m: gWhite, M: mx(T, 0, 1.45, 0.05) });              // the boot strap over the skate
    return merged(T, L);
  }
  function catcher() {
    return merged(T, [
      { g: G.box(0.36, 0.38, 0.32, 0.1), m: gPurple, M: mx(T, 0, 0.04, -0.03) },
      { g: G.sph, m: gPurple, M: mx(T, 0.06, 0.45, -0.02, 0, 0, 0, 0.5, 0.56, 0.16) },
      { g: G.sph, m: cloth(0xffffff, tex(mittCanvas())), M: mx(T, 0.06, 0.45, 0.1, 0, 0, 0, 0.42, 0.48, 0.07) },
      { g: G.box(0.1, 0.5, 0.05, 0.02), m: gNavy, M: mx(T, 0.06, 0.78, 0.15) },
      { g: G.box(0.4, 0.07, 0.05, 0.02), m: gNavy, M: mx(T, 0.06, 0.62, 0.15) },
      { g: G.sph, m: gPurple, M: mx(T, -0.36, 0.3, 0.04, 0, 0, 0.3, 0.14, 0.3, 0.12) }
    ]);
  }
  function blocker() {
    const board = roundBox(T, 0.64, 0.98, 0.12, 0.05);
    const faceG = new T.PlaneGeometry(0.6, 0.94);
    return merged(T, [
      { g: board, m: gWhite, M: mx(T, 0.04, 0.3, 0.13) },
      { g: faceG, m: plastic(0xffffff, tex(blockerCanvas(script))), M: mx(T, 0.04, 0.3, 0.195) },
      { g: G.box(0.3, 0.32, 0.28, 0.09), m: gPurple, M: mx(T, 0, 0.05, -0.02) },
      { g: G.sph, m: gPurple, M: mx(T, 0, 0.22, -0.12, 0, 0, 0, 0.14, 0.18, 0.12) }
    ]);
  }
  const goalieShaft = merged(T, [
    { g: G.box(0.085, 0.95, 0.11, 0.03), m: leather(0x1b1d26), M: mx(T, 0, 0.47, 0) },
    { g: G.box(0.1, 0.25, 0.12, 0.03), m: cloth(0xf2f2f2), M: mx(T, 0, 0.12, 0) },
    { g: G.box(0.29, 1.95, 0.09, 0.03), m: gWhite, M: mx(T, 0, 1.88, 0) },
    { g: G.box(0.3, 0.5, 0.095, 0.03), m: gPurple, M: mx(T, 0, 1.3, 0) }
  ]);
  const goalieBlade = merged(T, [{ g: bladeGeo(1.25, 0.3, 0.07, 0.05), m: gWhite }, { g: G.box(0.7, 0.24, 0.08, 0.02), m: tape, M: mx(T, 0.82, 0.14, 0) }]);
  const goalie = makePlayer(T, G, {
    dims: DIM_GOALIE, skin: G_SKIN, white: white2, pupil: pupil, mouth: mouth, lip: skinMat(0xa86a48), hair: cloth(0x1a120c),
    jersey: gJersey, sleeve: gSleeve, shoulder: gNavy, elbow: gNavy, knee: gWhite, capR: 0.35, elbowR: 0.23, kneeR: 0.24, torsoDepth: 0.8,
    collar: gPurple, helmet: gHelmet,
    pantsGeo: (function () { const g = lathe(T, [[0.5, -0.6], [0.6, -0.42], [0.62, -0.15], [0.58, 0.08], [0.5, 0.2], [0.34, 0.26], [0, 0.27]], 18, function (a, y) { return y < -0.2 ? 0.03 * Math.sin(a * 6) : 0; }); g.scale(1, 1, 0.82); return g; })(),
    pants: gNavy,
    torsoGeo: lathe(T, [[0.56, -0.18], [0.6, -0.04], [0.62, 0.3], [0.68, 0.68], [0.76, 0.98], [0.8, 1.13], [0.72, 1.26], [0.45, 1.36], [0.2, 1.42], [0, 1.43]], 24,
      function (a, y) { return y < 0.9 ? (0.03 * Math.sin(a * 6 + y * 2) + 0.02 * Math.sin(a * 11)) * (1 - y * 0.8) : 0; }),
    upper: function () { return new T.Mesh(lathe(T, [[0.25, -0.05], [0.27, 0.1], [0.26, 0.5], [0.24, 0.85], [0.14, 0.97], [0, 0.98]], 14, function (a, y) { return 0.04 * Math.sin(a * 4 + y * 5); }), gSleeve); },
    fore: function () {
      return merged(T, [
        { g: lathe(T, [[0.24, -0.04], [0.23, 0.3], [0.21, 0.6]], 12), m: gNavy },
        { g: lathe(T, [[0.14, 0.5], [0.22, 0.56], [0.2, 0.86], [0.12, 0.93], [0, 0.94]], 12), m: gPurple }
      ]);
    },
    handR: catcher, handL: blocker,
    thigh: function () {
      return merged(T, [
        { g: lathe(T, [[0.32, -0.05], [0.38, 0.2], [0.37, 0.7], [0.33, 1.05], [0.3, 1.2], [0, 1.22]], 14, function (a) { return 0.03 * Math.sin(a * 4); }), m: gNavy },
        { g: lathe(T, [[0.22, 1.05], [0.23, 1.25], [0.21, 1.4]], 12), m: gWhite }
      ]);
    },
    shin: function () { return new T.Mesh(lathe(T, [[0.22, 0], [0.23, 0.3], [0.2, 0.9], [0.17, 1.38]], 12), gNavy); },
    pad: function () { return padMesh(); },
    skate: function () { return skateMesh(T, G, plastic(0x16171d), gWhite, steel, DIM_GOALIE.ankle, true); },
    shaft: goalieShaft, blade: goalieBlade
  });
  goalie.shaftLen = 2.85; goalie.buttOver = 0.5; goalie.toeSide = 1; goalie.toeTurn = -0.5; goalie.stickHand = "L"; goalie.baseYaw = Math.PI;
  world.add(goalie.root);

  // their reflections in the ice
  const shooterTwin = shooter.root.clone(), goalieTwin = goalie.root.clone();
  mirror.add(shooterTwin); mirror.add(goalieTwin);
  shooterTwin.traverse(function (m) { m.castShadow = false; }); goalieTwin.traverse(function (m) { m.castShadow = false; });

  /* the nets cast shadows, the ice catches them */
  iceA.receiveShadow = true;
  mirror.traverse(function (m) { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, script: script, key: key, rim: rim, fill: fill, hemi: hemi,
    world: world, mirror: mirror, iceMats: [iceMain, iceSide], shooter: shooter, goalie: goalie, shooterTwin: shooterTwin, goalieTwin: goalieTwin,
    puck: puck, puckTwin: puckTwin, cart: cart, lamps: lamps, lampMat: lampMat, signs: signs, crowdU: crowdU, fans: [iBody, iHead, iHair, iEyes, iArm, iHand],
    netSide: netSide, netBase: netBase, netTwin: netTwin, blobs: blobs,
    camPos: new T.Vector3(CAM.x, CAM.y, CAM.z), camTgt: new T.Vector3(CAM.tx, CAM.ty, CAM.tz), camFov: CAM.fov,
    v: new T.Vector3(), v2: new T.Vector3(), v3: new T.Vector3(), pq: new T.Quaternion(), pAxis: new T.Vector3(),
    poseS: pose({}), poseG: pose({}), tmpPose: pose({}),
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0,
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, shadowsOn: true, mirrorOn: true, shadowSize: 2048, slowSum: 0, slowN: 0, slowHits: 0, warm: 0
  };
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
// pr = pixel ratio cap, sh = shadow map size (0 = no shadow maps: soft painted shadows stand in), mirror = reflections in the ice
const QUALITY = [{ pr: 2, sh: 2048, mirror: true }, { pr: 1.5, sh: 1024, mirror: true }, { pr: 1.2, sh: 1024, mirror: false }, { pr: 1, sh: 0, mirror: false }];

function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  const Q = QUALITY[R.quality], on = Q.sh > 0;
  if (on && Q.sh !== R.shadowSize) {
    R.shadowSize = Q.sh;
    R.key.shadow.mapSize.set(Q.sh, Q.sh);
    if (R.key.shadow.map) { R.key.shadow.map.dispose(); R.key.shadow.map = null; }
  }
  if (on !== R.shadowsOn) { R.shadowsOn = on; R.key.castShadow = on; }
  if (Q.mirror !== R.mirrorOn) {
    R.mirrorOn = Q.mirror; R.mirror.visible = Q.mirror;
    R.iceMats.forEach(function (m) { m.opacity = Q.mirror ? 0.88 : 1; m.needsUpdate = true; });
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
    if (++R.slowHits >= 2) { R.slowHits = 0; setQuality(R.quality + 1); }   // two slow seconds in a row, not one hiccup
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
// Rink point (feet) -> HUD pixels. A goal-plane point (x, y) is (x, y, 0).
function toScreen(x, y, z) {
  if (!R) return { x: W / 2 + x * 31, y: 252 - y * 31, ok: true };
  R.v.set(x, y, z).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1 };
}

// The weather of the extras (batch 3) also changes the arena lights a little.
function applyScenery() {
  const id = S.x ? S.x.sc.id : "", sc = R.scene;
  R.key.color.set(id === "golden" ? 0xffd9a8 : id === "twilight" ? 0xc8c0ff : 0xffffff);
  R.key.intensity = id === "twilight" ? 1.6 : id === "sun" ? 2.6 : 2.2;
  R.fill.color.set(id === "golden" ? 0xffb066 : 0xfff0dc);
  sc.fog = id === "fog" ? new R.T.Fog(0xdfe8f2, 28, 120) : null;
  R.dirty = true;
}

/* ---------------- Poses ---------------- */
// The shooter, left shot: top (right) hand on the end of the stick, blade out front on his left.
const SK = {
  stance: pose({ pel: [0, 2.72, 0.12], pelYaw: 0.12, lean: 0.8, twist: -0.08, headPitch: 0.72, hR: [0.2, 2.95, -1.0], aim: [-1.2, 0.02, -3.6], grip: 1.0,
                 fL: [-0.62, 0.52, 0.25], fR: [0.6, 0.52, 0.4], yawL: 0.35, yawR: -0.3, brow: -0.45, smile: 0.05 }),
  load: pose({ pel: [0.05, 2.6, 0.22], pelYaw: 0.32, lean: 0.86, twist: 0.42, headPitch: 0.8, hR: [0.02, 3.05, -0.55], aim: [-2.05, 0.02, -1.9], grip: 1.05,
               fL: [-0.72, 0.52, 0.1], fR: [0.55, 0.52, 0.62], yawL: 0.45, yawR: -0.2, brow: -0.7, smile: -0.1 }),
  sweep: pose({ pel: [0, 2.66, 0.05], pelYaw: 0.0, lean: 0.78, twist: -0.18, headPitch: 0.75, hR: [0.3, 3.0, -0.85], aim: [-0.65, 0.05, -3.4], grip: 1.05,
                fL: [-0.6, 0.52, 0.0], fR: [0.65, 0.52, 0.55], yawL: 0.3, yawR: -0.35, brow: -0.8, smile: -0.1, open: 0.2 }),
  follow: pose({ pel: [-0.1, 2.82, 0.0], pelYaw: -0.25, lean: 0.55, twist: -0.5, headPitch: 0.5, hR: [0.45, 3.45, -0.5], aim: [-0.3, 1.6, -4.3], grip: 1.1,
                 fL: [-0.55, 0.52, -0.25], fR: [0.72, 0.66, 0.6], yawL: 0.2, yawR: -0.55, brow: -0.6, smile: 0, open: 0.25 }),
  celebrate: pose({ pel: [0, 3.1, 0.1], lean: 0.1, twist: 0.12, headPitch: 0.4, hR: [0.62, 5.55, -0.35], aim: [1.35, 9.4, -0.9], grip: 1.1,
                    hL: [-0.88, 5.35, -0.45], free: 1, fL: [-0.55, 0.52, 0.0], fR: [0.55, 0.52, 0.35], yawL: 0.25, yawR: -0.25, rootYaw: 2.6, brow: 0.75, smile: 1, open: 0.9 }),
  sad: pose({ pel: [0, 2.82, 0.15], pelYaw: 0.05, lean: 0.92, twist: 0.05, headPitch: 0.15, hR: [0.25, 2.75, -1.05], aim: [-1.0, 0.55, -3.3], grip: 1.0,
              fL: [-0.6, 0.52, 0.2], fR: [0.6, 0.52, 0.35], yawL: 0.3, yawR: -0.3, brow: -0.9, smile: -0.85 }),
  stumble: pose({ pel: [0, 3.0, 0.6], lean: 0.25, twist: 0.3, side: 0.15, headPitch: 0.2, hR: [0.6, 3.6, -0.4], aim: [0.3, 1.1, -3.4], grip: 1.0,
                  fL: [-0.7, 0.62, 0.75], fR: [0.6, 0.52, 0.1], yawL: 0.5, yawR: -0.3, brow: 1, smile: -0.3, open: 0.7 })
};
// The goalie, catching right: glove on his right (your left), blocker and stick on his left. Built facing -z, turned around.
const GK = {
  stance: pose({ pel: [0, 2.3, 0.3], lean: 0.9, headPitch: 0.78, hR: [1.42, 2.55, -0.95], hL: [-1.25, 1.85, -0.95], aim: [-0.2, 0.02, -1.4],
                 fL: [-1.0, 0.46, -0.15], fR: [1.0, 0.46, -0.15], yawL: 0.45, yawR: -0.45, kneeIn: 0.45, brow: -0.6, smile: -0.25 }),
  fly: pose({ pel: [0, 1.62, 0.35], lean: 0.35, headPitch: 0.3, hR: [1.5, 2.45, -0.8], hL: [-1.4, 1.7, -0.85], aim: [-0.12, 0.02, -1.25],
              fL: [-2.0, 0.34, 0.45], fR: [2.0, 0.34, 0.45], yawL: 1.4, yawR: -1.4, kneeIn: 1.05, brow: -0.2, smile: -0.2 }),
  beaten: pose({ pel: [0, 2.1, 0.35], lean: 1.0, headYaw: 0.9, headPitch: -0.1, hR: [1.0, 1.6, -0.6], hL: [-1.0, 1.4, -0.7], aim: [-0.2, 0.02, -1.2],
                 fL: [-0.95, 0.46, -0.1], fR: [0.95, 0.46, -0.1], yawL: 0.45, yawR: -0.45, kneeIn: 0.4, rootYaw: 0.35, brow: 0.8, smile: -0.7, open: 0.65 }),
  poke: pose({ pel: [0, 1.9, -0.2], lean: 1.15, headPitch: 1.0, hR: [1.0, 2.0, -0.9], hL: [-0.45, 0.95, -2.4], aim: [-0.1, 0.02, -4.7],
               fL: [-0.9, 0.46, 0.3], fR: [1.0, 0.46, 0.7], yawL: 0.3, yawR: -0.3, kneeIn: 0.3, brow: -0.9, smile: 0.4 }),
  smug: pose({ pel: [0, 2.35, 0.3], lean: 0.8, headPitch: 0.62, hR: [1.25, 3.05, -0.9], hL: [-1.2, 1.85, -0.9], aim: [-0.2, 0.02, -1.4],
               fL: [-1.0, 0.46, -0.15], fR: [1.0, 0.46, -0.15], yawL: 0.45, yawR: -0.45, kneeIn: 0.45, brow: -0.7, smile: 0.7 })
};

function smooth(rate, dt) { return 1 - Math.exp(-rate * dt); }

// The skater's pose this frame.
function poseShooter(state, fdt) {
  const P = R.tmpPose, idle = state === "title" || state === "over", t = R.clock, calm = Shell.reduced;
  copyPose(P, SK.stance);
  // stickhandling while he waits
  if (!calm) {
    const sw = Math.sin(t * 4.2);
    P.aim[0] += sw * 0.42; P.aim[2] += Math.cos(t * 4.2) * 0.12; P.hR[0] += sw * 0.1; P.twist += sw * 0.05;
    P.pel[1] += Math.sin(t * 2.1) * 0.02; P.headYaw = Math.sin(t * 0.7) * 0.08;
  }
  if (idle) return P;
  // skating across the slot
  const amp = clamp(Math.abs(V.slideV) / 4, 0, 1), sgn = Math.sign(V.slideV);
  if (amp > 0.01 && !calm) {
    V.stride += Math.abs(V.slideV) * fdt * 1.4;
    const s = Math.sin(V.stride);
    P.fL[2] += s * 0.35 * amp; P.fR[2] -= s * 0.35 * amp;
    P.fL[1] += Math.max(0, s) * 0.14 * amp; P.fR[1] += Math.max(0, -s) * 0.14 * amp;
    P.fL[0] += sgn * 0.15 * amp; P.fR[0] += sgn * 0.15 * amp;
    P.side = -sgn * 0.12 * amp; P.pelRoll = -sgn * 0.08 * amp; P.pel[0] += sgn * 0.12 * amp;
  }
  // the wind-up while a flick is being drawn
  if (V.load > 0) mixPose(P, SK.load, V.load);
  // the shot: a snap through the puck, then the follow-through toward where it went
  const sh = S.shot;
  if (sh) {
    const st = sh.t;
    if (!V.loadAt) V.loadAt = pose({});
    if (V.shotFresh) { copyPose(V.loadAt, R.poseS); V.shotFresh = false; }
    const fol = R.tmpPose2 || (R.tmpPose2 = pose({}));
    copyPose(fol, SK.follow);
    fol.aim[0] += (sh.x - S.px * SLIDE_X) * 0.22; fol.aim[1] = 0.35 + clamp(sh.y, 0, 4.6) * 0.5;
    if (st < 0.06) { copyPose(P, V.loadAt); mixPose(P, SK.sweep, ease(st / 0.06)); }
    else if (st < 0.24) { copyPose(P, SK.sweep); mixPose(P, fol, ease((st - 0.06) / 0.18)); }
    else copyPose(P, fol);
  }
  // after the whistle
  if (V.celebrate > 0) {
    const w = Math.min(ease((1 - V.celebrate) * 4), V.celebrate / 0.3);
    mixPose(P, SK.celebrate, clamp(w, 0, 1));
    if (!calm) { P.hL[1] -= Math.abs(Math.sin(t * 8)) * 0.6 * w; P.hR[1] -= Math.abs(Math.sin(t * 8 + 1.2)) * 0.25 * w; P.pel[1] += Math.abs(Math.sin(t * 8)) * 0.05 * w; }
  } else if (V.sad > 0) {
    const w = Math.min(ease((1 - V.sad) * 5), V.sad / 0.3);
    mixPose(P, SK.sad, clamp(w, 0, 1));
    if (!calm) P.aim[1] = Math.max(0.02, P.aim[1] + Math.sin(t * 14) * 0.3 * w);
  }
  if (V.poked > 0) mixPose(P, SK.stumble, Math.min(1, V.poked * 1.6));
  return P;
}

// The goalie's pose this frame.
function poseGoalie(state, fdt) {
  const P = R.tmpPose, idle = state === "title" || state === "over", t = R.clock, calm = Shell.reduced;
  copyPose(P, GK.stance);
  if (!calm) { P.pel[1] += Math.sin(t * 2.4) * 0.025; P.hR[1] += Math.sin(t * 2.4 + 1) * 0.04; }
  if (idle) { mixPose(P, GK.smug, 0.5 + 0.5 * Math.sin(idleT * 0.6)); return P; }
  // eyes on the puck
  const pk = R.puck.position, dx = pk.x - S.g, dz = Math.max(1, pk.z - GOALIE_Z);
  P.headYaw = clamp(-Math.atan2(dx, dz), -0.7, 0.7) * 0.8;
  P.headPitch += -clamp((pk.y - 3) / dz, -0.4, 0.4);
  // sliding across the crease: lean into it and push off the far skate
  const vg = V.goalieV || 0, amp = clamp(Math.abs(vg) / 6, 0, 1), sg = Math.sign(vg);
  if (amp > 0.02) { P.side = sg * 0.1 * amp; P.pel[0] -= sg * 0.15 * amp; if (sg > 0) P.fR[0] += 0.3 * amp; else P.fL[0] -= 0.3 * amp; }
  // the butterfly
  if (V.drop > 0) mixPose(P, GK.fly, ease(V.drop));
  // the glove and the blocker go to the puck
  const sh = S.shot;
  if (V.gloveW > 0 && sh) { P.hR[0] += ((S.g - sh.x) - P.hR[0]) * V.gloveW; P.hR[1] += ((sh.y + 0.4) - P.hR[1]) * V.gloveW; P.hR[2] += (-1.0 - P.hR[2]) * V.gloveW; }
  if (V.blockW > 0 && sh) { P.hL[0] += ((S.g - sh.x) - P.hL[0]) * V.blockW; P.hL[1] += ((sh.y + 0.2) - P.hL[1]) * V.blockW; P.hL[2] += (-1.0 - P.hL[2]) * V.blockW; }
  if (V.res === "save" && V.zone === "mask" && V.resT < 0.5) P.headPitch += Math.sin(V.resT / 0.5 * Math.PI) * 0.6;
  if (V.res === "save") { P.smile += (0.75 - P.smile) * clamp(V.resT * 3, 0, 1); P.brow = -0.3; }
  if (V.res === "goal" && sh) mixPose(P, GK.beaten, ease(V.resT * 2.5));
  if (V.pokeT >= 0) mixPose(P, GK.poke, Math.sin(Math.PI * clamp(V.pokeT / 0.85, 0, 1)));
  if (S.phase === "break") mixPose(P, GK.smug, ease(S.pt * 3));
  return P;
}

/* ---------------- The puck ---------------- */
function netBackZ(x, y) {
  const d = 3.45 - 1.9 * clamp(y / 3.5, 0, 1);
  return -d * Math.sqrt(Math.max(0.08, 1 - (x / 3.35) * (x / 3.35)));
}
// After the whistle the puck is on its own: into the twine, off the iron, into the glass, or out of the goalie's gear.
function puckAfter(res, zone) {
  if (!R) return null;
  const sh = S.shot, T = sh.T, p0 = V.shot0 || R.v3.set(0, 0, SHOOT_Z);
  const p = R.puck.position.clone(), v = new R.T.Vector3((sh.x - p0.x) / T, (Math.max(sh.y, PUCK_T / 2) - p0.y) / T, -p0.z / T);
  const o = { p: p, v: v, mode: "fly", t: 0, hit: false };
  const r = Math.random;
  if (res === "goal") o.mode = "net";
  else if (res === "wide") o.mode = "glass";
  else if (res === "post") {
    const vert = Math.abs(Math.abs(sh.x) - NET_W) < POST && sh.y < NET_H - 0.1;
    if (vert) v.set(Math.sign(sh.x) * (5 + r() * 3), 2 + r() * 3, Math.abs(v.z) * 0.32);
    else v.set(v.x * 0.3, 11 + r() * 3, Math.abs(v.z) * 0.18);
  } else if (zone === "glove") o.mode = "held";
  else if (zone === "blocker") v.set((sh.x - S.g >= 0 ? 1 : -1) * (13 + r() * 5), 7, 9);
  else if (zone === "mask") v.set((r() - 0.5) * 6, 13, 5);
  else if (zone === "pads") v.set((r() - 0.5) * 12, 2.5, 15 + r() * 4);
  else v.set((r() - 0.5) * 3, 1.5, 4);
  return o;
}
function stepPuck(o, dt) {
  o.t += dt;
  const p = o.p, v = o.v;
  if (o.mode === "held") {
    const hand = R.goalie.arm[1].hand;
    hand.updateWorldMatrix(true, false);
    p.set(0.06, 0.48, 0.12).applyMatrix4(hand.matrixWorld);
    return;
  }
  v.y -= 32 * dt;
  p.addScaledVector(v, dt);
  if (o.mode === "net") {
    p.x = clamp(p.x, -NET_W + 0.25, NET_W - 0.25);
    p.y = Math.min(p.y, 3.4);
    const bz = netBackZ(p.x, p.y);
    if (p.z < bz) {
      p.z = bz;
      if (!o.hit) { o.hit = true; V.netHit = 1; V.netX = p.x; V.netY = p.y; }
      v.z = Math.abs(v.z) * 0.06; v.x *= 0.3; v.y = Math.min(v.y, 0) * 0.3;
    }
  } else if (o.mode === "glass" && p.z < END_Z + 0.5) {
    p.z = END_Z + 0.5; v.z = Math.abs(v.z) * 0.32; v.x *= 0.6;
  }
  if (p.y < PUCK_T / 2) {
    p.y = PUCK_T / 2;
    v.y = v.y < -4 ? -v.y * 0.3 : 0;
    const k = Math.max(0, 1 - 1.4 * dt); v.x *= k; v.z *= k;
  }
}

/* ---------------- Game state -> meshes ---------------- */
function syncScene(state, fdt) {
  const idle = state === "title" || state === "over", calm = Shell.reduced, T = R.T;
  R.clock += fdt;
  ledTick(fdt);
  let i;

  /* timers that only drive pictures */
  if (V.celebrate > 0) V.celebrate = Math.max(0, V.celebrate - fdt / (S.drag ? 0.3 : 1.6));
  if (V.sad > 0) V.sad = Math.max(0, V.sad - fdt / (S.drag ? 0.3 : 1.1));
  if (V.poked > 0) V.poked = Math.max(0, V.poked - fdt / 1.0);
  if (V.res) V.resT += fdt;
  if (V.pokeT >= 0) { V.pokeT += fdt; if (V.pokeT > 0.95) V.pokeT = -1; }
  V.lamp = Math.max(0, V.lamp - fdt / 3.2);
  V.cheer = Math.max(0, V.cheer - fdt / 3.0);
  V.ooh = Math.max(0, V.ooh - fdt / 1.2);
  V.netHit = Math.max(0, V.netHit - fdt / 1.1);
  if (S.phase !== "shot" && !S.shot) { V.res = ""; V.zone = ""; }
  if (X && S.x && !idle) {                                  // the board joins in when a hot streak starts
    const on = S.x.fever.active();
    if (on && !V.fever) ledPlay([ledMsg("cycle", "HOT STREAK!", 1.8, { keep: true })], true);
    V.fever = on;
  }

  /* the shooter */
  const shooter = R.shooter, gx = idle ? 4.2 : S.px * SLIDE_X;
  if (!idle) { V.slideV += ((S.px - V.lastPx) / Math.max(fdt, 1e-3) * SLIDE_X - V.slideV) * smooth(10, fdt); V.lastPx = S.px; }
  else V.slideV = 0;
  const wantLoad = !idle && S.drag && S.drag.mode === "flick" ? clamp((S.drag.oy - S.drag.y) / 110, 0, 1) : 0;
  V.load += (wantLoad - V.load) * smooth(wantLoad > V.load ? 16 : 10, fdt);
  if (S.shot && S.shot !== V.lastShot) { V.lastShot = S.shot; V.shotFresh = true; V.shot0 = R.puck.position.clone(); V.gloveW = V.blockW = 0; }
  const ps = poseShooter(state, fdt);
  mixPose(R.poseS, ps, S.shot && S.shot.t < 0.3 && !idle ? 1 : smooth(16, fdt));
  shooter.root.position.set(gx, 0, idle ? 7.5 : SHOOT_Z);
  shooter.baseYaw = idle ? 0.45 : 0;
  applyPose(shooter, R.poseS);

  /* the goalie */
  const goalie = R.goalie, g = idle ? 0 : S.g;
  V.goalieV = idle ? 0 : (V.goalieV || 0) + (((g - (V.lastG == null ? g : V.lastG)) / Math.max(fdt, 1e-3)) - (V.goalieV || 0)) * smooth(12, fdt);
  V.lastG = g;
  const sh = S.shot;
  // drop into the butterfly on a low shot once he has read it; reach with the glove or the blocker
  const dropNow = !idle && sh && sh.y < 1.3 && sh.t > REACT[period()];
  V.drop += ((dropNow ? 1 : 0) - V.drop) * smooth(dropNow ? 16 : 5, fdt);
  let gw = 0, bw = 0;
  if (!idle && sh && sh.t > REACT[period()] * 0.8) {
    const z = sh.res ? V.zone : covered(sh.x, sh.y, S.g, sh.y < 1.3);
    if (z === "glove") gw = 1; else if (z === "blocker") bw = 1;
  }
  V.gloveW = (V.gloveW || 0) + (gw - (V.gloveW || 0)) * smooth(gw ? 18 : 6, fdt);
  V.blockW = (V.blockW || 0) + (bw - (V.blockW || 0)) * smooth(bw ? 18 : 6, fdt);
  const pg = poseGoalie(state, fdt);
  mixPose(R.poseG, pg, smooth(20, fdt));
  const lunge = V.pokeT >= 0 ? Math.sin(Math.PI * clamp(V.pokeT / 0.85, 0, 1)) * 4.4 : 0;
  goalie.root.position.set(g, 0, GOALIE_Z + lunge);
  applyPose(goalie, R.poseG);

  /* the puck: on the blade, in flight, or loose after the whistle */
  const puck = R.puck, pp = puck.position;
  shooter.root.updateMatrixWorld(true);
  let showPuck = true;
  if (idle || S.phase === "ready" || S.phase === "break" || (S.phase === "poked" && V.pokeT >= 0 && V.pokeT < 0.42)) {
    pp.copy(shooter.heel).addScaledVector(shooter.toe, 0.45);
    R.v3.crossVectors(shooter.toe, TV.up); pp.addScaledVector(R.v3, 0.22);
    pp.y = PUCK_T / 2; pp.applyMatrix4(shooter.root.matrixWorld); pp.y = PUCK_T / 2;
    V.pk = null;
  } else if (S.phase === "poked") {
    if (!V.pk || V.pk.mode !== "poke") V.pk = { p: pp.clone(), v: new T.Vector3(-14 - Math.random() * 4, 0, -6), mode: "poke", t: 0 };
    stepPuck(V.pk, fdt); pp.copy(V.pk.p);
  } else if (sh) {
    if (!sh.res) {
      const k = clamp(sh.t / sh.T, 0, 1), p0 = V.shot0 || pp;
      pp.set(p0.x + (sh.x - p0.x) * k, p0.y + (Math.max(sh.y, PUCK_T / 2) - p0.y) * k + Math.sin(k * Math.PI) * (sh.y < 0.3 ? 0.05 : 0.35), p0.z * (1 - k));
      const zone = covered(sh.x, sh.y, S.g, sh.y < 1.3);
      const ax = Math.abs(sh.x), inMouth = ax < NET_W + POST && sh.y < NET_H + POST;
      if (zone && inMouth && !(Math.abs(ax - NET_W) < POST)) {
        const zStop = GOALIE_Z + (zone === "pads" ? 0.8 : zone === "glove" || zone === "blocker" ? 1.0 : 0.75);
        if (pp.z < zStop) pp.z = zStop;
      }
    } else if (V.pk) { stepPuck(V.pk, fdt); pp.copy(V.pk.p); }
  } else showPuck = false;
  puck.visible = showPuck;
  if (showPuck && !calm) { R.pAxis.set(0, 1, 0); R.pq.setFromAxisAngle(R.pAxis, fdt * (sh && !sh.res ? 30 : V.pk ? 8 : 0)); puck.quaternion.premultiply(R.pq); }
  if (V.pk && V.pk.mode === "held") puck.quaternion.setFromAxisAngle(R.pAxis.set(1, 0, 0), 1.2);
  else if (!(sh && sh.res)) { puck.quaternion.x = 0; puck.quaternion.z = 0; puck.quaternion.normalize(); }

  /* the net bulges where the puck hits it */
  const pos = R.netSide.geometry.attributes.position, base = R.netBase;
  if (V.netHit > 0 || R.netDirty) {
    const amp = calm ? 0.25 * V.netHit : 0.55 * V.netHit * (0.6 + 0.4 * Math.cos((1 - V.netHit) * 18));
    for (i = 0; i < pos.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
      const d2 = (bx - V.netX) * (bx - V.netX) + (by - V.netY) * (by - V.netY), k = amp * Math.exp(-d2 / 0.9) * (bz < -0.6 ? 1 : 0.3);
      pos.setXYZ(i, bx + Math.sign(bx) * k * 0.25, by - k * 0.1, bz - k);
    }
    pos.needsUpdate = true;
    R.netDirty = V.netHit > 0;
  }

  /* the rare cartridge (extras): hovering where the goal plane holds it */
  const rare = S.x && S.x.rare && !idle ? S.x.rare : null;
  R.cart.visible = !!rare;
  if (rare) {
    R.cart.position.set(rare.x, rare.y + (calm ? 0 : Math.sin(R.clock * 3) * 0.06), -0.12);
    R.cart.rotation.y = calm ? 0 : Math.sin(R.clock * 2) * 0.5;
  }

  /* goal lamps, the crowd, the signs */
  for (i = 0; i < R.lamps.length; i++) R.lamps[i].material.opacity = V.lamp > 0 ? V.lamp * (calm ? 0.8 : 0.55 + 0.45 * Math.abs(Math.sin(R.clock * 9 + i * 1.6))) : 0;
  R.lampMat.emissive.setRGB(V.lamp > 0 ? 0.9 * V.lamp : 0, 0, 0);
  R.crowdU.uTime.value = R.clock; R.crowdU.uCheer.value = calm ? 0 : V.cheer; R.crowdU.uOoh.value = calm ? 0 : V.ooh;
  for (i = 0; i < R.signs.length; i++) { const s = R.signs[i]; s.m.position.y = s.y + (calm ? 0 : V.cheer * Math.abs(Math.sin(R.clock * 8 + s.ph)) * 0.8 + Math.sin(R.clock * 1.5 + s.ph) * 0.05); }

  /* reflections and soft shadows */
  if (R.mirrorOn) { syncTwin(shooter.root, R.shooterTwin); syncTwin(goalie.root, R.goalieTwin); R.puckTwin.position.copy(pp); R.puckTwin.quaternion.copy(puck.quaternion); R.puckTwin.visible = puck.visible; }
  const bl = R.blobs, fake = !R.shadowsOn;
  bl.shooter.visible = bl.goalie.visible = fake; bl.puck.visible = fake && puck.visible && pp.y < 3;
  if (fake) { bl.shooter.position.set(gx, 0.03, shooter.root.position.z); bl.goalie.position.set(g, 0.03, goalie.root.position.z); bl.puck.position.set(pp.x, 0.03, pp.z); }

  /* camera: high behind the shooter while he lines up; in on the goalie between periods; drifting on the title card */
  let px = CAM.x, py = CAM.y, pz = CAM.z, tx = CAM.tx, ty = CAM.ty, tz = CAM.tz, fov = CAM.fov, rate = 6;
  if (idle) {
    const a = calm ? 0 : idleT * 0.2;
    px = Math.sin(a) * 7; py = 4.6 + (calm ? 0 : Math.sin(idleT * 0.13) * 0.6); pz = 15.5; tx = Math.sin(a) * 1.5; ty = 2.7; tz = -1.5; fov = 34; rate = 2.5;
  } else if (S.phase === "break") {
    px = g + 3.2; py = 4.4; pz = 10.5; tx = g + 0.2; ty = 3.05; tz = 0.3; fov = 24; rate = 5;
  } else if (S.phase === "shot" && sh) {
    const k = sh.res === "goal" && !calm ? 0.06 : 0.03;
    px += (tx - px) * k; py += (ty - py) * k; pz += (tz - pz) * k; rate = 3;
  }
  if (R.debugCam) { const d = R.debugCam; px = d[0]; py = d[1]; pz = d[2]; tx = d[3]; ty = d[4]; tz = d[5]; fov = d[6]; V.snap = true; }
  if (V.snap || !R.camReady) { R.camPos.set(px, py, pz); R.camTgt.set(tx, ty, tz); R.camFov = fov; V.snap = false; R.camReady = true; }
  else {
    const kk = smooth(rate, fdt);
    R.camPos.x += (px - R.camPos.x) * kk; R.camPos.y += (py - R.camPos.y) * kk; R.camPos.z += (pz - R.camPos.z) * kk;
    R.camTgt.x += (tx - R.camTgt.x) * kk; R.camTgt.y += (ty - R.camTgt.y) * kk; R.camTgt.z += (tz - R.camTgt.z) * kk;
    R.camFov += (fov - R.camFov) * kk;
  }
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (Math.random() * 2 - 1) * m; sy = (Math.random() * 2 - 1) * m;
  }
  if (Math.abs(R.camera.fov - R.camFov) > 1e-3) { R.camera.fov = R.camFov; R.camera.updateProjectionMatrix(); }
  R.camera.position.set(R.camPos.x + sx, R.camPos.y + sy, R.camPos.z);
  R.camera.lookAt(R.camTgt.x + sx * 0.5, R.camTgt.y + sy * 0.5, R.camTgt.z);
  R.camera.updateMatrixWorld();
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

// The aim reticle on the goal plane (the 2D game's, placed through the 3D camera), with a dotted line from the puck.
function drawAim(c) {
  const f = S.drag && S.drag.mode === "flick" ? flick(S.drag) : null;
  const x = f ? f.x : S.px * 2.85, y = f ? f.y : S.aimY;
  if (!f && !S.kb) return;
  const p = toScreen(clamp(x, -3.6, 3.6), clamp(y, 0, 4.6), 0), P = p.x, Q = p.y;
  const pk = R.puck.position, s0 = toScreen(pk.x, pk.y, pk.z);
  for (let k = 0.12; k < 0.92; k += 0.08) {
    const qx = s0.x + (P - s0.x) * k, qy = s0.y + (Q - s0.y) * k - Math.sin(k * Math.PI) * 10;
    c.fillStyle = "rgba(8,32,95,.5)"; c.beginPath(); c.arc(qx, qy, 2.4, 0, TAU); c.fill();
    c.fillStyle = "rgba(255,228,92,.9)"; c.beginPath(); c.arc(qx, qy, 1.5, 0, TAU); c.fill();
  }
  c.strokeStyle = "#08205f"; c.lineWidth = 4;
  c.beginPath(); c.arc(P, Q, 8, 0, TAU); c.stroke();
  c.strokeStyle = "#ffd23f"; c.lineWidth = 2;
  c.beginPath(); c.arc(P, Q, 8, 0, TAU); c.stroke();
  c.fillStyle = "#08205f"; c.fillRect(P - 2, Q - 13, 4, 8); c.fillRect(P - 2, Q + 5, 4, 8); c.fillRect(P - 13, Q - 2, 8, 4); c.fillRect(P + 5, Q - 2, 8, 4);
  c.fillStyle = "#ffd23f"; c.fillRect(P - 1, Q - 12, 2, 6); c.fillRect(P - 1, Q + 6, 2, 6); c.fillRect(P - 12, Q - 1, 6, 2); c.fillRect(P + 6, Q - 1, 6, 2);
}

// Things pinned to the 3D view: the puck's trail, the poke check warning.
function drawWorld(c) {
  const sh = S.shot;
  if (sh && !sh.res && V.shot0 && !Shell.reduced) {
    const k1 = clamp(sh.t / sh.T, 0, 1), p0 = V.shot0;
    for (let k = Math.max(0, k1 - 0.5); k < k1 - 0.02; k += 0.05) {
      const p = toScreen(p0.x + (sh.x - p0.x) * k, p0.y + (Math.max(sh.y, PUCK_T / 2) - p0.y) * k + Math.sin(k * Math.PI) * (sh.y < 0.3 ? 0.05 : 0.35), p0.z * (1 - k));
      const a = 1 - (k1 - k) / 0.5;
      c.fillStyle = "rgba(255,255,255," + (0.15 + 0.5 * a).toFixed(3) + ")";
      c.beginPath(); c.arc(p.x, p.y, 1 + 2 * a, 0, TAU); c.fill();
    }
  }
  if (R.debugZones) {                                       // checks only: the rules' zones on the goal plane, around the goalie
    const g = S.g, Z = [["body", -0.85, 0, 0.85, 3.3, "#ff0"], ["mask", -0.55, 3.3, 0.55, 3.9, "#f80"], ["pads", -1.3, 0, 1.3, 0.6, "#0f0"],
                        ["glove", -1.85, 1.4, -0.85, 3.05, "#f0f"], ["blocker", 0.85, 0.9, 1.85, 2.55, "#0ff"]];
    Z.forEach(function (z) { const a = toScreen(g + z[1], z[4], 0), b = toScreen(g + z[3], z[2], 0); c.strokeStyle = z[5]; c.lineWidth = 1; c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); });
  }
  if (period() === 2 && S.phase === "ready" && S.frontT > 0.8) {
    const p = toScreen(S.px * SLIDE_X, 6.6, SHOOT_Z);
    rrect(c, W / 2 - 78, p.y - 22, 156, 20, 6); c.fillStyle = "rgba(8,32,95,.82)"; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = "#ff3fa4"; c.stroke();
    txt(c, "MOVE OR GET POKED", W / 2, p.y - 17, 11, "#ff3fa4", "center");
  }
}

function drawHUD(c, state) {
  const bg = c.createLinearGradient(0, 0, 0, 56);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, 0, W, 56);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff9214"; c.fillRect(0, 56, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, 58, W, 1);
  txt(c, "POINTS", 10, 6, 9, "#a8ecff", "left", "#08205f");
  txt(c, String(S.points), 10, 18, 20, "#ffe45c", "left", "#08205f");
  txt(c, "GOALS", W - 10, 6, 9, "#a8ecff", "right", "#08205f");
  txt(c, S.goals + "/" + S.shots, W - 10, 18, 20, "#3ff0ff", "right", "#08205f");
  // the period clock, like the one over center ice
  rrect(c, W / 2 - 52, 4, 104, 40, 7); c.fillStyle = "#060a1c"; c.fill();
  c.lineWidth = 2; c.strokeStyle = "#ffe45c"; c.stroke();
  txt(c, "PERIOD " + Math.min(PERIODS, S.period + 1), W / 2, 8, 9, "#a8ecff", "center");
  const cl = Math.ceil(Math.max(0, S.clock));
  txt(c, "0:" + ("0" + cl).slice(-2), W / 2, 20, 19, cl <= 5 && state === "playing" ? "#ff4b3e" : "#ffc21a", "center");
  for (let i = 0; i < PERIODS; i++) {                        // goals by period, under the clock
    const x = W / 2 - 22 + i * 22, cur = i === period() && state !== "over";
    c.fillStyle = cur ? "#ffe45c" : "rgba(168,236,255,.55)";
    c.beginPath(); c.arc(x, 50, 3, 0, TAU); c.fill();
    if (S.per[i]) txt(c, String(S.per[i]), x + 5, 45, 8, "#ffffff");
  }
  if (S.streak > 1 && state === "playing") txt(c, "STREAK " + S.streak, 10, 42, 9, "#ffc1e0", "left", "#08205f");
  else txt(c, "vs THE SHELF GUARDIAN", 10, 42, 8, "#d6c4ff", "left", "#08205f");
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
  const fdt = state === "paused" || (state === "playing" && X && X.eventActive()) ? 0 : Math.min(ms, 50) / 1000;
  if (sized) {
    syncScene(state, fdt);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  if (state === "playing") drawWorld(c);
  for (let i = 0; i < parts.length; i++) { c.fillStyle = parts[i].c; c.fillRect(parts[i].x, parts[i].y, 3, 3); }
  if (S.x) {
    const area = { x: 0, y: 59, w: W, h: H - 59 }, t = (state === "title" || state === "over") ? idleT : S.t;
    X.drawScenery(c, S.x.sc, t, area);
    if (S.x.sc.id === "fog") {
      const a = toScreen(-NET_W, NET_H, 0), b = toScreen(NET_W, 0, 0);
      c.fillStyle = "rgba(225,232,240,.28)"; c.fillRect(a.x - 20, a.y - 20, b.x - a.x + 40, b.y - a.y + 30);
    }
    S.x.fever.draw(c, area, t);
  }
  drawHUD(c, state);
  if (state === "playing" && S.phase === "ready") drawAim(c);
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
  const bar = document.createElement("div");
  bar.style.cssText = "width:min(52vw,220px);height:6px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden";
  const fill = document.createElement("div");
  fill.style.cssText = "width:30%;height:100%;background:#ffe45c;border-radius:3px;transition:width .4s ease";
  bar.appendChild(fill); el.appendChild(bar);
  document.body.appendChild(el);
  return { el: el, img: img, fill: fill };
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
  if (crt) crt.style.display = "none";                       // glossy arena, no scanlines
  R.lastT = performance.now();
  layout();
}

function logoImg(cls) {
  const im = document.createElement("img");
  im.alt = "Nostalgia Pro Games"; im.width = 96; im.height = 96; im.className = cls;
  im.style.cssText = "display:block;width:clamp(64px,13vh,108px);height:auto;margin:0 auto 6px";
  im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
  im.src = LOGO_URL;
  return im;
}

function startGame() {
  Shell.init({
    slug: "rink-rat-shootout",
    title: "RINK RAT SHOOTOUT",
    accent: "#3ff0ff",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "You vs The Shelf Guardian in real 3D, three 30-second periods. Slide sideways to move, then flick up at the net. Angle the flick to aim, a longer flick goes higher.",
    keys: "Keys: left and right skate (and aim to that side), up and down aim high or low, Space shoots. P pause, M mute, N music, R restart.",
    tip: "Top corners count 2. In period 3, don't park in front of him.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { keys = {}; S.drag = null; }
  });
  attach();
  // Sound. Nothing is created until the first tap, click or key press; the music starts with the game.
  ["pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, Juke.unlock, true); });
  Shell.onStart(function () { V.snap = true; Juke.newGame(); }); Shell.onRestart(function () { V.snap = true; Juke.newGame(); }); Shell.onResume(Juke.unlock);
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));   // not while initials are being typed
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Juke.toggleMusic();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) { titleCard.insertBefore(logoImg("np-logo"), titleCard.firstChild); Juke.button(titleCard, titleCard.querySelector(".np-tip")); }
  if (pauseActions) Juke.button(pauseActions, pauseActions.querySelector("a"));
  // The studio logo heads the score card too.
  const card = document.querySelector("#np-ov-over .np-card");
  if (card) card.insertBefore(logoImg("np-logo"), card.firstChild);
}

// Hook for automated checks (no effect on play)
window.__rink = { S: function () { return S; }, update: update, shoot: shoot, covered: covered, gfx: function () { return R; }, led: function () { return LED; },
                  view: function () { return V; }, toScreen: toScreen, juke: Juke, startMusic: startMusic, setQuality: function (q) { if (R) { R.qLock = true; setQuality(q); } } };

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
      splash.fill.style.width = "70%";
      try { R = buildScene(THREE, res[2]); } catch (e) { e.npStage = "webgl"; throw e; }
      if (q) { R.qLock = true; setQuality(q[1] === "low" ? QUALITY.length - 1 : 0); }
      reset();
      try { syncScene("title", 0); R.renderer.compile(R.scene, R.camera); } catch (e) { /* warm-up only */ }
      splash.fill.style.width = "100%";
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
          ? "Rink Rat Shootout could not load its 3D engine (" + THREE_URL + ")."
          : "Rink Rat Shootout needs WebGL for its 3D arena, and this browser has it switched off or does not support it.");
      });
    });
})();
