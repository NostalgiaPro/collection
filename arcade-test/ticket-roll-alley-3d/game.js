/* TICKET ROLL ALLEY (3D): nine balls, one ramp, and the 100-point cup in the corner.

   Real 3D on three.js (self-hosted, imported from ../shared/three.module.min.js, which loads
   ../shared/three.core.min.js), drawn on a WebGL canvas that sits directly under the shell's 2D
   canvas. The shell canvas stays in charge of input, scaling and the title / pause / game over
   flow, and carries the HUD.

   The rules, the controls, the scoring, the ticket jar and the prize counter are the 2D game's,
   with one tuning change: power reaches further (REACH and MAX_POWER below), so a full-power roll
   carries to the 100 cups instead of overshooting into the back net. The lane and the board keep the 2D game's own units:
     lane  (x, y): x across (-10..10), y up the ramp (0 = launch, 100 = the hump)
     board (u, w): u across (-10..10), w up the board (0 = the 10 trough, 44 = the back net)
   lanePos() and boardPos() below turn those into three.js space. */

const W = 360, H = 540, TAU = Math.PI * 2, DEG = Math.PI / 180;

/* ================= Rules (the 2D game's, untouched apart from the fx() calls that drive the picture) ================= */
const BALLS = 9, HUMP = 100, LANE = 10, BALL_R = 1.6, A = 300;
const BW = 10, BOARD_TOP = 44, GAP = 6;
const C = { u: 0, w: 13 }, RINGS = [3.5, 7, 10.5];             // 40 / 30 / 20, anything else on the board is 10
const CUPS = [{ u: 0, w: 27, r: 2.6, pts: 50 }, { u: -7.6, w: 37, r: 2.2, pts: 100 }, { u: 7.6, w: 37, r: 2.2, pts: 100 }];
const LIP = 1.4, WARMUP_GAMES = 3;
// Power tuning. REACH sets how far up the board the energy left after the hump carries the ball: a full-power
// roll (MAX_POWER) lands in the 100 row instead of sailing into the back net. The 2D game used 16 here.
// MAX_POWER is the top of the power meter for both the flick and the held key (the key used to stop at 1.0).
const REACH = 11.76, MAX_POWER = 1.1;
const PRIZES = [
  ["Rubber band for a cart box", 10],
  ["Cracked jewel case", 25],
  ["1 loose disc, no case", 40],
  ["Strategy guide, missing the map", 150],
  ["Controller with a sticky A button", 300],
  ["Mystery box lot", 900],
  ["Complete in box copy", 5000],
  ["Sealed copy", 999999]
];

let S = {}, keys = {}, idleT = 0, parts = [];
let gamesPlayed = 0;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }

function reset() {
  gamesPlayed = num(Shell.load("games"), 0);
  S = { t: 0, phase: "aim", pt: 0, ball: 0, score: 0, tickets: 0, shown: 0, spoolT: 0,
        aim: 0, power: 0, charging: false, chargeT: 0, drag: null, kb: false,
        b: null, log: [], bumperOn: gamesPlayed >= WARMUP_GAMES, hundreds: 0, msg: null, counted: false };
  parts.length = 0;
  resetView();
}

function bumperActive() { return S.bumperOn && S.ball >= 3; }
function bumperU(t) { return Math.sin(t * (S.ball >= 6 ? 2.4 : 1.6)) * 7.5; }
const BUMP_W = 24, BUMP_HALF = 2.4;

/* ---------------- Rolling ---------------- */
function canRoll() { return S.phase === "aim" && S.pt > 0.15; }

function roll(p, ang) {
  if (!canRoll() || p < 0.04) return;
  var vy = Math.sqrt(2 * A * HUMP * (clamp(p, 0, 1.1) / 0.25));
  S.b = { x: 0, y: 0, vy: vy, vx: vy * Math.tan(clamp(ang, -0.13, 0.13)), bounces: 0, spin: 0 };
  S.phase = "lane"; S.pt = 0;
  S.drag = null; S.charging = false;
  Shell.sfx("whoosh");
}

// Where the ball lands on the board once it leaves the hump.
function landing(b) {
  var vh = b.vy;
  var w = vh * vh / (2 * A * HUMP) * REACH - 2;   // energy left after the hump sets how high it flies
  var ratio = clamp(b.vx / Math.max(vh, 60), -0.4, 0.4);
  var u = b.x + ratio * (GAP + Math.max(0, w) * 0.5);
  var note = "";
  if (Math.abs(u) > BW - BALL_R) { var e = BW - BALL_R; u = Math.sign(u) * (e - (Math.abs(u) - e)); u = clamp(u, -e, e); }
  if (w > BOARD_TOP) { w = BOARD_TOP - (w - BOARD_TOP) * 1.5 - 2; note = "net"; }
  w = Math.max(0.5, w);
  return { u: u, w: w, note: note };
}

function hash(a, b) { var s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); }

// Score a landing spot. Returns { pts, u, w (where it settles), lip: "in" | "out" | "", rattle }
function settle(u, w) {
  var i, c, d;
  for (i = 0; i < CUPS.length; i++) {
    c = CUPS[i]; d = Math.hypot(u - c.u, w - c.w);
    if (d < c.r) return { pts: c.pts, u: c.u, w: c.w, lip: "" };
    if (d < c.r + LIP) {
      if (hash(u, w) < 0.42) return { pts: c.pts, u: c.u, w: c.w, lip: "in", cup: c };
      var r = ring(u, w - 6);
      return { pts: r.pts, u: r.u, w: r.w, lip: "out", cup: c };
    }
  }
  return ring(u, w);
}
function ring(u, w) {
  var d = Math.hypot(u - C.u, w - C.w), k;
  for (k = 0; k < RINGS.length; k++) {
    if (d < RINGS[k]) {
      if (RINGS[k] - d < 0.8 && hash(w, u) < 0.5) continue; // rattles out to the next ring
      var mid = k === 0 ? 0 : (RINGS[k - 1] + RINGS[k]) / 2, dd = d || 1;
      return { pts: 40 - k * 10, u: C.u + (u - C.u) / dd * mid, w: C.w + (w - C.w) / dd * mid, lip: "" };
    }
  }
  return { pts: 10, u: clamp(u * 0.4, -6, 6), w: 0.8, lip: "" };
}

/* ---------------- Update ---------------- */
function update(dt) {
  S.t += dt; S.pt += dt;
  var i;
  for (i = parts.length - 1; i >= 0; i--) {
    var q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 220 * dt;
    if (q.life <= 0) parts.splice(i, 1);
  }
  // ticket spool: one ticket at a time
  if (S.shown < S.tickets) {
    S.spoolT -= dt;
    if (S.spoolT <= 0) { S.shown++; S.spoolT = 0.045; Shell.tone(1500 + (S.shown % 2) * 300, 0.025, "square", 0.12); }
  }

  if (S.phase === "aim") {
    var turn = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
    if (turn) { S.aim = clamp(S.aim + turn * 0.09 * dt, -0.13, 0.13); S.kb = true; }
    if (S.charging) {
      S.chargeT += dt;
      var ph = (S.chargeT / 1.2) % 2;
      S.power = (ph < 1 ? ph : 2 - ph) * MAX_POWER;
    }
    return;
  }
  var b = S.b;
  if (S.phase === "lane") {
    var n = 4, sdt = dt / n;
    for (i = 0; i < n; i++) {
      b.vy -= A * sdt;
      b.y += b.vy * sdt; b.x += b.vx * sdt;
      b.spin += b.vy * sdt;
      var e = LANE - BALL_R;
      if (Math.abs(b.x) > e) { b.x = Math.sign(b.x) * e; b.vx = -b.vx * 0.7; b.vy *= 0.93; b.bounces++; Shell.sfx("click"); }
      if (b.y >= HUMP) { launch(); return; }
      if (b.vy <= 0 && b.y < HUMP) { S.phase = "back"; S.pt = 0; Shell.flash("SHORT", "Didn't clear the hump. 0 points.", "#8e93a2", 1000); Shell.sfx("miss"); fx("short"); return; }
    }
    if (S.pt % 0.08 < dt) Shell.noise(0.08, 0.1, 160, 0.7, 0, 0, "lowpass", 0.02);
    return;
  }
  if (S.phase === "back") {
    b.vy -= A * dt; b.y += b.vy * dt;
    if (b.y <= 0) { b.y = 0; score({ pts: 0, u: 0, w: 0, lip: "" }, true); }
    return;
  }
  if (S.phase === "fly") {
    var k = S.pt / S.flyT;
    // the sliding bumper can knock the ball down on its way past
    if (S.bumpCheck && k >= S.bumpK) {
      S.bumpCheck = false;
      var bu = bumperU(S.t);
      if (Math.abs(S.bumpAtU - bu) < BUMP_HALF + BALL_R) {
        S.land = { u: S.bumpAtU, w: 3 + hash(S.t, bu) * 4, note: "bump" };
        S.fromK = { u: S.bumpAtU, w: BUMP_W };
        S.pt = 0; S.flyT = 0.25;
        Shell.sfx("hit"); Shell.shake(2, 0.15);
        S.bumped = true;
        fx("bump");
        return;
      }
    }
    if (k >= 1) {
      S.res = settle(S.land.u, S.land.w);
      S.phase = "settle"; S.pt = 0;
      Shell.sfx(S.res.lip ? "rim" : "cup");
      fx("settle");
    }
    return;
  }
  if (S.phase === "settle") {
    var dur = S.res.lip ? 0.75 : 0.4;
    if (S.pt >= dur) score(S.res, false);
    return;
  }
  if (S.phase === "post") {
    if (S.pt > 0.55 && !S.advanced) {
      S.advanced = true;
      S.ball++;
      S.b = null;
      if (S.ball < BALLS) {
        S.phase = "aim"; S.pt = 0;
        if (S.ball === 3 && bumperActive()) { Shell.flash("BUMPER ON", "It slides across the rings now. Time it.", "#ff3fa4", 1300); fx("bumperOn"); }
        return;
      }
    }
    if (S.advanced && S.ball >= BALLS && (S.shown >= S.tickets || S.pt > 3)) finish();
  }
}

function launch() {
  var b = S.b;
  S.land = landing(b);
  S.hump = { x: b.x };
  S.fromK = null;
  S.bumped = false;
  S.flyT = 0.42 + S.land.w * 0.004;
  S.phase = "fly"; S.pt = 0;
  S.bumpCheck = false;
  if (bumperActive() && S.land.w > BUMP_W && S.land.note !== "net") {
    S.bumpCheck = true;
    S.bumpK = (BUMP_W + 4) / (S.land.w + 4);
    S.bumpAtU = b.x + (S.land.u - b.x) * S.bumpK;
  }
  Shell.tone(260, 0.1, "triangle", 0.25, 520);
  fx("launch");
}

function score(r, short) {
  var pts = r.pts;
  S.score += pts;
  S.log.push(pts);
  S.tickets += Math.floor(pts / 10);
  if (pts === 0) S.zeros = (S.zeros || 0) + 1;
  S.hot = pts >= 50 ? (S.hot || 0) + 1 : 0;
  if (window.NPRewards && S.hot >= 2 && !short) NPRewards.streak(S.hot, S.hot === 2 ? "2 BIG ROLLS!" : "");
  if (pts === 100) {
    if (r.u < 0) S.cupL = (S.cupL || 0) + 1; else S.cupR = (S.cupR || 0) + 1;
    if (window.Trophies) { Trophies.unlock("tra-cup"); if (r.lip === "in") Trophies.unlock("tra-rattle"); }
  }
  var col = pts >= 100 ? "#ffd23f" : pts >= 50 ? "#ff3fa4" : pts >= 30 ? "#3ff0ff" : "#eceae2";
  if (!short) {
    var title = "+" + pts, sub = "";
    if (r.lip === "out") { title = "LIPPED OUT"; sub = "Rolled down for " + pts + "."; col = "#ff3fa4"; Shell.sfx("miss"); }
    else if (r.lip === "in") { title = "RATTLED IN! +" + pts; sub = "Took the long way."; }
    else if (S.bumped) { title = "BUMPED! +" + pts; sub = "Knocked off line."; col = "#a77bff"; }
    else if (S.land && S.land.note === "net") { sub = "Off the back net."; }
    if (pts === 100 && r.lip !== "out") { title = "100!"; sub = r.lip === "in" ? "Rattled in. It counts." : "Corner cup. Spool those tickets."; S.hundreds++; burst(60); Shell.sfx("best"); Shell.shake(3, 0.25); }
    else if (pts === 50 && r.lip !== "out") { title = r.lip === "in" ? "RATTLED IN! 50" : "50!"; burst(25); Shell.sfx("score"); }
    else if (r.lip !== "out") Shell.sfx("score");
    Shell.flash(title, sub, col, 850);
  }
  fx("scored", r, short);
  S.phase = "post"; S.pt = 0; S.advanced = false;
}

function finish() {
  if (S.counted) return;
  S.counted = true;
  var jar = num(Shell.load("jar"), 0) + S.tickets;
  Shell.save("jar", jar);
  Shell.save("games", gamesPlayed + 1);
  var html = row("Tickets this game", S.tickets) + row("Ticket jar (all games)", jar.toLocaleString("en-US")) + row("Corner cups", S.hundreds);
  // prize counter: the best thing the jar covers, the next one up, and the dream
  var got = null, nxt = null, i;
  for (i = 0; i < PRIZES.length; i++) { if (jar >= PRIZES[i][1]) got = PRIZES[i]; else if (!nxt) nxt = PRIZES[i]; }
  html += '<p class="np-kicker" style="margin:12px 0 6px">Prize counter</p>';
  html += row("In reach", got ? got[0] + " (" + got[1] + ")" : "Nothing yet");
  if (nxt && nxt !== PRIZES[PRIZES.length - 1]) html += row("Next up", nxt[0] + " (" + (nxt[1] - jar).toLocaleString("en-US") + " more)");
  html += row("The dream", PRIZES[PRIZES.length - 1][0] + " (999,999)");
  ledFinal(S.score, S.tickets);
  Shell.gameOver(S.score, { title: "OUT OF BALLS", html: html,
    stats: { score: S.score, balls: S.log.length, hundreds: S.hundreds, cupL: S.cupL || 0, cupR: S.cupR || 0, zeroBalls: S.zeros || 0, tickets: S.tickets, jar: jar } });
}
function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }

// Confetti over the spot the ball landed on (presentation only).
function burst(n) {
  var cols = ["#ffd23f", "#3ff0ff", "#ff3fa4", "#9bff3f"];
  if (Shell.reduced) n = Math.ceil(n / 3);
  var p = R ? boardScreen(S.land ? S.land.u : 0, S.land ? S.land.w : 20) : { x: W / 2, y: 200 };
  for (var i = 0; i < n; i++) {
    var a = Math.random() * TAU, s = 50 + Math.random() * 150;
    parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 90, life: 1, c: cols[i % 4] });
  }
}

/* ---------------- Input (the 2D game's, untouched) ---------------- */
function pointer(type, x, y) {
  if (type === "down") {
    if (!canRoll()) return;
    S.drag = { sx: x, sy: y, x: x, y: y };
    S.kb = false; S.charging = false;
  } else if (type === "move" && S.drag) {
    S.drag.x = x; S.drag.y = y;
  } else if ((type === "up" || type === "cancel") && S.drag) {
    var d = S.drag; S.drag = null;
    if (type === "cancel") return;
    var f = flick(d);
    if (f) roll(f.p, f.a);
  }
}
function flick(d) {
  var dy = d.sy - d.y, dx = d.x - d.sx;
  if (dy < 14) return null;
  return { p: clamp(dy / 230, 0, 1.1), a: clamp(Math.atan2(dx, dy) * 0.25, -0.13, 0.13) };
}
function key(type, code, e) {
  var act = code === "Space" || code === "Enter" || code === "NumpadEnter";
  if (type === "down") {
    keys[code] = true;
    if (act && !e.repeat && canRoll() && !S.charging) { S.charging = true; S.chargeT = 0; S.power = 0; S.kb = true; S.drag = null; }
  } else {
    keys[code] = false;
    if (act && S.charging) { S.charging = false; roll(S.power, S.aim); S.power = 0; }
  }
}

/* =====================================================================================
   Presentation. Nothing below changes a score, a landing or a ticket.
   ===================================================================================== */

const LOGO_URL = "np_games_logo.png";                     // the full studio logo: splash and score card only
const SCRIPT_URL = "np_games_script.png";                 // the script wordmark: every decal inside the arcade
const THREE_URL = "../shared/three.module.min.js";
const FALLBACK_URL = "game-2d.js";                        // the classic 2D game, used if 3D cannot start
const HUD_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';

let THREE = null, R = null;                               // R holds everything the renderer owns
// V is how things are being shown. It never feeds the rules.
const V = { lastScore: 0, near: false, lit: null, litT: 0, bumpHit: 0, ballQ: null, lastBP: null, tray: -1 };
const vrand = (function () { let s = 0x2545F491; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; })();

function resetView() {
  V.lastScore = 0; V.near = false; V.lit = null; V.litT = 0; V.bumpHit = 0; V.tray = -1;
  ledClear();
}

/* ---------------- Where things are ---------------- */
const LS = 0.55, SLOPE = 0.17;                             // lane: world length per lane unit, and how steeply it climbs
const BOARD_ANG = 48 * DEG, BS = Math.sin(BOARD_ANG), BC = Math.cos(BOARD_ANG);
function humpLift(y) { return y > 88 ? 2.6 * Math.pow((Math.min(y, HUMP) - 88) / 12, 2) : 0; }
function laneH(y) { return y * LS * SLOPE + humpLift(y); }
const BY0 = laneH(HUMP) - 3, BZ0 = -(HUMP * LS + 5);      // where board point (0, 0) sits
const PITCH = 30;                                          // center to center of neighboring machines

// lane point -> center of a ball resting there
function lanePos(x, y, out) { return out.set(x, laneH(y) + BALL_R, -y * LS); }
// board point, lifted off the board face by lift -> three.js space
function boardPos(u, w, lift, out) { return out.set(u, BY0 + w * BS + lift * BC, BZ0 - w * BC + lift * BS); }
function boardScreen(u, w) { boardPos(u, w, BALL_R, R.v); return toScreen(R.v.x, R.v.y, R.v.z); }

/* ---------------- Presentation hooks the rules call ---------------- */
function fx(what, r, short) {
  if (!R) return;
  if (what === "launch") { V.near = true; Juke.sfx("hop"); return; }
  if (what === "bump") { V.bumpHit = 1; camShake(0.45, 0.22); Juke.sfx("bump"); return; }
  if (what === "short") { V.near = false; Juke.sfx("short"); ledPlay([ledMsg("blink", "SHORT", 1.6, { color: "red" })]); return; }
  if (what === "bumperOn") { Juke.sfx("alarm"); ledPlay([ledMsg("cycle", "BUMPER ON", 2.4)]); return; }
  if (what === "settle") { if (S.res && S.res.lip) Juke.sfx("rattle"); return; }
  if (what !== "scored") return;
  const pts = r.pts, list = [];
  if (!short) {
    if (r.lip === "out") { list.push(ledMsg("blink", "LIPPED OUT", 1.7, { color: "pink" })); Juke.sfx("lipout"); }
    else if (pts === 100) {
      list.push(ledMsg("flash", r.lip === "in" ? "RATTLED IN" : "100!", 2.0));
      list.push(ledMsg("slide", "+10 TICKETS", 1.5, { color: "lime" }));
      Juke.sfx("cup100"); camShake(0.6, 0.3);
    } else if (pts === 50) { list.push(ledMsg("flash", r.lip === "in" ? "RATTLED IN" : "50!", 1.6)); Juke.sfx("cup50"); }
    else if (S.bumped) { list.push(ledMsg("blink", "BUMPED!", 1.5, { color: "violet" })); Juke.sfx("ring", pts); }
    else { list.push(ledMsg("slide", "+" + pts, 1.1, { color: pts >= 30 ? "cyan" : "white" })); Juke.sfx("ring", pts); }
    if (S.hot >= 2) list.push(ledMsg("cycle", S.hot + " BIG ROLLS", 1.6));
    // light up whatever the ball dropped into
    if (r.lip !== "out" && (pts === 100 || pts === 50)) { let ci = 0; for (let i = 0; i < CUPS.length; i++) if (CUPS[i].u === r.u && CUPS[i].w === r.w) ci = i; V.lit = { kind: "cup", i: ci }; }
    else if (pts >= 20 && pts <= 40) V.lit = { kind: "ring", i: (40 - pts) / 10 };
    else if (pts === 10) V.lit = { kind: "trough", i: 0 };
    V.litT = 1;
  }
  if (pts > 0) list.push(ledMsg("count", "SCORE", 2.4, { from: Math.min(V.lastScore, S.score), value: S.score, keep: true }));
  V.lastScore = S.score;
  if (list.length) ledPlay(list);
}

/* ---------------- Sound: the house tune and the stingers ----------------
   The shell still plays every sound effect the 2D game had, exactly when it did. On top of that the game brings
   its own small synth: an original looping tune (startMusic below) and a handful of stingers for the big moments.
   All of it is made in code with the Web Audio API, no audio files. It starts only after the first tap or key press,
   goes quiet with the shell's mute button (the same "npArcade.muted" setting), has its own remembered MUSIC ON / OFF
   switch, and rolls none of the game's dice. */
const MUSIC_VOL = 0.16, SFX_VOL = 0.2;
const MUSIC_KEY = "npArcade.music";
function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

/* The house tune: "Ticket Rush", an original chiptune loop in F major at 144 BPM. A two-bar fanfare plays once,
   then a 32-bar loop (about 53 seconds) runs through four sections so it never sits on one phrase for long:
     A    the hook on a 25% pulse lead, a bouncing octave bass, a running arpeggio and a backbeat
     A2   the hook again, then it turns off through Gm and Am and climbs to a half cadence
     B    the lift: four on the floor, claps, sixteenth hats, the lead doubled an octave up, a soft pad, an Eb turn
     R    the breakdown: half-time drums, long lead notes with vibrato over a triangle arpeggio, then a riser and a
          snare roll that throw it back to the top
   Self-contained: it knows nothing about the game, so it can be lifted out whole (an arcade radio, a jukebox).
   startMusic(ctx, dest) starts it on any audio context, into any node, and returns stop(). stop() fades it out and
   returns the step it got to; pass that back as opts.step to pick the tune up where it left off. opts.delay holds the
   first note back that many seconds. opts.ahead (seconds) schedules that much in one go and nothing after it, for
   rendering offline. */
function startMusic(ctx, dest, opts) {
  opts = opts || {};
  const BPM = 144, STEP = 60 / BPM / 4, AHEAD = opts.ahead || 0.5;
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  // bass root, then the three chord notes the arpeggio and the pad use (MIDI numbers)
  const CH = { F: [41, 65, 69, 72], C: [36, 64, 67, 72], Dm: [38, 62, 65, 69], Bb: [34, 62, 65, 70],
               Gm: [43, 62, 67, 70], Am: [45, 64, 69, 72], Eb: [39, 63, 67, 70] };
  // The song, a bar a line: section, chord (two names = half a bar each), and the lead (step in the bar, note
  // with b for flat, length in steps). Section I plays once; the loop runs from the first A bar to the end.
  const SONG = [
    ["I", "F",    "0C5-2 2F5-2 4A5-2 6C6-2 8F6-6"],
    ["I", "C",    "0E6-2 2D6-2 4C6-2 6Bb5-2 8G5-2 10A5-2 12Bb5-2 14B5-2"],
    ["A", "F",    "0C6-2 2A5-1 3C6-3 6D6-2 8C6-2 10A5-2 12F5-4"],
    ["A", "C",    "0G5-2 2E5-1 3G5-3 6A5-2 8G5-2 10E5-2 12C5-4"],
    ["A", "Dm",   "0D5-2 2F5-1 3A5-3 6D6-2 8C6-2 10A5-2 12F5-2 14A5-2"],
    ["A", "Bb",   "0Bb5-3 3A5-3 6G5-2 8F5-2 10D5-2 12F5-4"],
    ["A", "F",    "0C6-2 2A5-1 3C6-3 6D6-2 8F6-3 11E6-1 12C6-4"],
    ["A", "C",    "0E6-2 2D6-1 3C6-3 6G5-2 8C6-2 10D6-2 12E6-4"],
    ["A", "Bb C", "0D6-2 2C6-2 4Bb5-2 6A5-2 8G5-2 10A5-2 12Bb5-2 14E5-2"],
    ["A", "F",    "0F5-6 6E5-1 7F5-1 8A5-2 10C6-2 12F6-2"],
    ["A2", "F",   "0C6-2 2A5-1 3C6-3 6D6-2 8C6-2 10A5-2 12F5-4"],
    ["A2", "C",   "0G5-2 2E5-1 3G5-3 6A5-2 8G5-2 10E5-2 12C5-4"],
    ["A2", "Dm",  "0D5-2 2F5-1 3A5-3 6D6-2 8C6-2 10A5-2 12F5-2 14A5-2"],
    ["A2", "Bb",  "0Bb5-3 3A5-3 6G5-2 8F5-2 10D5-2 12F5-2 14G5-2"],
    ["A2", "Gm",  "0G5-2 2Bb5-1 3D6-3 6G6-2 8F6-2 10D6-2 12Bb5-4"],
    ["A2", "Am",  "0A5-2 2C6-1 3E6-3 6A6-2 8G6-2 10E6-2 12C6-4"],
    ["A2", "Bb",  "0D6-3 3C6-3 6Bb5-2 8A5-2 10Bb5-2 12C6-2 14D6-2"],
    ["A2", "C",   "0E6-4 4G6-4 8E6-2 10C6-2 12D6-2 14E6-2"],
    ["B", "Bb",   "0F6-1 1F6-1 2D6-2 4F6-2 6G6-2 8F6-3 11D6-1 12Bb5-4"],
    ["B", "C",    "0E6-1 1E6-1 2C6-2 4E6-2 6G6-2 8E6-3 11C6-1 12G5-4"],
    ["B", "Am",   "0E6-2 2C6-2 4A5-2 6C6-2 8E6-2 10A6-2 12G6-2 14E6-2"],
    ["B", "Dm",   "0F6-4 4E6-2 6D6-2 8A5-4 12D6-2 14E6-2"],
    ["B", "Bb",   "0F6-1 1F6-1 2D6-2 4F6-2 6G6-2 8A6-3 11G6-1 12F6-4"],
    ["B", "C",    "0G6-1 1G6-1 2E6-2 4G6-2 6Bb6-2 8A6-2 10G6-2 12E6-4"],
    ["B", "Eb",   "0G6-2 2Eb6-2 4Bb5-2 6Eb6-2 8G6-2 10Bb6-2 12G6-2 14Eb6-2"],
    ["B", "C",    "0E6-2 2F6-2 4G6-6 10E6-2 12C6-2 14Bb5-2"],
    ["R", "Dm",   "0A5-6 6F5-2 8D6-8"],
    ["R", "Bb",   "0D6-4 4C6-4 8Bb5-6 14A5-2"],
    ["R", "F",    "0A5-6 6C6-2 8F6-8"],
    ["R", "C",    "0E6-6 6D6-2 8C6-4 12G5-4"],
    ["R", "Dm",   "0A5-4 4D6-4 8F6-4 12E6-4"],
    ["R", "Bb",   "0D6-6 6F6-2 8Bb6-8"],
    ["R", "Gm",   "0A6-4 4G6-4 8F6-4 12D6-4"],
    ["R", "C",    "0E6-2 2E6-2 4F6-2 6F6-2 8G6-2 10G6-2 12A6-1 13Bb6-1 14B6-1 15C7-1"]
  ];
  const N = SONG.length * 16, LOOP = 2 * 16;
  const LEAD = new Array(N).fill(null), POS = [];             // POS: which bar of its section each bar is
  SONG.forEach(function (row, b) {
    POS.push(b && SONG[b - 1][0] === row[0] ? POS[b - 1] + 1 : 0);
    row[2].split(" ").forEach(function (tok) {
      const m = /^(\d+)([A-G])([#b]?)(\d)-(\d+)$/.exec(tok);
      if (m) LEAD[b * 16 + Number(m[1])] = [12 * (Number(m[4]) + 1) + SEMI[m[2]] + (m[3] === "#" ? 1 : m[3] === "b" ? -1 : 0), Number(m[5])];
    });
  });
  const GROOVE = { 0: 0, 3: 12, 6: 0, 8: 0, 10: 12, 12: 7, 14: 12 };   // the bouncing bass: step in the bar -> semitones up
  const ARP_A = [0, 1, 2, 1], ARP_B = [0, 1, 2, 3], ARP_R = [0, 2, 1, 3, 2, 1, 3, 2];   // 3 = the bottom note an octave up

  // the rig: every voice ends up in out, which is all stop() has to fade
  const out = ctx.createGain(); out.connect(dest);
  function filt(type, f, q, to) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; }
  const leadBus = filt("lowpass", 4200, 0.7, out), bassBus = filt("lowpass", 950, 1.4, out);
  const arpBus = filt("lowpass", 2600, 0.7, out), padBus = filt("lowpass", 1500, 0.8, out);
  const send = ctx.createGain(), echo = ctx.createDelay(1), back = ctx.createGain(), wet = filt("lowpass", 2200, 0.7, out);
  send.gain.value = 0.24; echo.delayTime.value = STEP * 3; back.gain.value = 0.3;    // a dotted-eighth echo
  leadBus.connect(send); arpBus.connect(send); send.connect(echo); echo.connect(back); back.connect(echo); echo.connect(wet);
  // chip pulse waves (the 50% one is the plain square)
  function pulse(duty) {
    const re = new Float32Array(32), im = new Float32Array(32);
    for (let k = 1; k < 32; k++) re[k] = 2 * Math.sin(Math.PI * k * duty) / (Math.PI * k);
    return ctx.createPeriodicWave(re, im);
  }
  const P25 = pulse(0.25), P12 = pulse(0.125);
  let seed = 0x5EEDC0DE;
  function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
  const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate), ctx.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;

  // One note: a quick attack, held for part of its length, then it dies away. det detunes in cents, vib adds a
  // vibrato that eases in (depth in cents), f1 slides the pitch.
  function tone(to, wave, f, t, dur, vol, hold, det, vib, f1) {
    const o = ctx.createOscillator(), g = ctx.createGain(), h = t + Math.max(0.008, dur * (hold == null ? 0.5 : hold));
    if (typeof wave === "string") o.type = wave; else o.setPeriodicWave(wave);
    o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (det) o.detune.setValueAtTime(det, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, h); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.03);
    if (vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = 5.6;
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(vib, t + Math.min(0.3, dur * 0.6));
      l.connect(lg); lg.connect(o.detune); l.start(t); l.stop(t + dur + 0.03);
    }
  }
  // A soft chord note for the pad: two saws a few cents apart, slow in and slow out.
  function pad(f, t, dur, vol) {
    [-7, 7].forEach(function (det) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(f, t); o.detune.setValueAtTime(det, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.09);
      g.gain.setValueAtTime(vol, t + Math.max(0.1, dur - 0.12)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(padBus); o.start(t); o.stop(t + dur + 0.03);
    });
  }
  // A burst of filtered noise. f1 sweeps the filter, atk is how long it takes to swell.
  function noise(t, dur, vol, type, f, q, f1, atk) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nb; s.loop = true;
    fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q || 0.7;
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t, rnd() * 0.5); s.stop(t + dur + 0.02);
  }
  // the kit
  function kick(t, v) { tone(out, "sine", 160, t, 0.2, 0.62 * v, 0.06, 0, 0, 42); noise(t, 0.012, 0.07 * v, "highpass", 3000); }
  function snare(t, v) { noise(t, 0.14, 0.28 * v, "bandpass", 2000, 0.6); tone(out, "triangle", 220, t, 0.07, 0.17 * v, 0.1, 0, 0, 140); }
  function clap(t) { [0, 0.011, 0.022].forEach(function (o) { noise(t + o, o < 0.02 ? 0.02 : 0.12, 0.13, "bandpass", 1300, 1.4); }); }
  function hat(t, v, open) { noise(t, open ? 0.11 : 0.03, (open ? 0.08 : 0.045) * v, "highpass", open ? 6500 : 8500); }
  function crash(t) { noise(t, 1.1, 0.11, "highpass", 5200, 0.5); noise(t, 0.8, 0.05, "bandpass", 3200, 0.4); }
  function tom(t, f) { tone(out, "sine", f, t, 0.18, 0.42, 0.1, 0, 0, f * 0.55); }

  // everything that sounds on sixteenth-note i of the song, starting at time t
  function playStep(i, t) {
    const bar = i >> 4, s = i & 15, row = SONG[bar], sec = row[0], k = POS[bar];
    const names = row[1].split(" "), ch = CH[names.length > 1 && s >= 8 ? names[1] : names[0]];
    const change = s === 0 || (names.length > 1 && s === 8), last = sec === "I" ? k === 1 : k === 7;
    // lead
    const n = LEAD[i];
    if (n) {
      const f = mtof(n[0]), d = n[1] * STEP * 0.92, vib = n[1] >= 4 ? 16 : 0;
      if (sec === "B") { tone(leadBus, P25, f, t, d, 0.12, 0.7, 0, vib); tone(leadBus, P12, f * 2, t, d, 0.035, 0.5); }
      else if (sec === "R") { tone(leadBus, "square", f, t, d, 0.075, 0.8, 0, vib); tone(leadBus, "triangle", f / 2, t, d, 0.1, 0.8); }
      else { tone(leadBus, P25, f, t, d, 0.12, 0.7, 0, vib); tone(leadBus, P25, f, t, d, 0.055, 0.7, 9); }
    }
    // bass
    const root = ch[0] + 12;
    let bn = null, bl = 1.6;
    if (sec === "I") { if (k === 0 ? s % 4 === 0 : !(s & 1)) bn = root + (k === 1 && (s >> 1) & 1 ? 12 : 0); }
    else if (sec === "B" || (sec === "R" && k >= 6)) { if (!(s & 1)) bn = root + ((s >> 1) & 1 ? 12 : 0); }
    else if (sec === "R" && k < 4) {
      if (s === 0) { bn = root; bl = 7.5; } else if (s === 8) { bn = root; bl = 5.5; } else if (s === 14) { bn = root + 12; bl = 2; }
    } else if (s in GROOVE) bn = root + GROOVE[s];
    if (bn != null) { const f = mtof(bn), d = STEP * bl; tone(bassBus, "square", f, t, d, 0.1, 0.6); tone(bassBus, "triangle", f, t, d, 0.14, 0.6); }
    // arpeggio
    if (sec !== "I" || k === 1) {
      let ai, oct = 0, vol = 0.026, wave = "square";
      if (sec === "B") { ai = ARP_B[s & 3]; oct = 12; vol = 0.022; }
      else if (sec === "R") { ai = ARP_R[s & 7]; wave = "triangle"; vol = 0.065; oct = k >= 4 ? 12 : 0; }
      else { ai = ARP_A[s & 3]; oct = sec === "A2" && s >= 8 ? 12 : 0; }
      tone(arpBus, wave, mtof((ai === 3 ? ch[1] + 12 : ch[1 + ai]) + oct), t, STEP * 0.85, vol, 0.3);
    }
    // pad, under the lift and the breakdown
    if ((sec === "B" || sec === "R") && change) {
      const dur = (names.length > 1 ? 8 : 16) * STEP;
      for (let j = 1; j < 4; j++) pad(mtof(ch[j]), t, dur, sec === "R" ? 0.022 : 0.016);
    }
    // drums
    if (s === 0 && k === 0 && sec !== "I") crash(t);
    if (sec === "I") {
      if (s % 4 === 0) kick(t, k === 0 ? 0.8 : 1);
      if (!(s & 1)) hat(t, 0.6, false);
      if (k === 1 && s >= 8) snare(t, 0.35 + 0.08 * (s - 8));
    } else if (sec === "R" && k < 4) {                       // half time
      if (s === 0) kick(t, 1);
      if (s === 8) snare(t, 0.7);
      if (s % 4 === 2) hat(t, 0.5, false);
    } else if (sec === "R" && k === 7) {                     // the roll back to the top
      if (s % 4 === 0) kick(t, 1);
      snare(t, 0.3 + 0.045 * s);
    } else {
      const four = sec === "B" || sec === "R" && k === 6;
      if (four ? s % 4 === 0 : s === 0 || s === 8 || (k & 1 && s === 11) || (sec === "A2" && s === 6)) kick(t, 1);
      if ((s === 4 || s === 12) && !(last && s === 12)) { snare(t, 1); if (sec === "B") clap(t); }
      if (sec === "B") hat(t, s % 4 === 2 ? 1 : 0.55, s % 4 === 2);
      else if (!(s & 1)) hat(t, 0.8, s === 14);
      if (last && s >= 12) tom(t, [220, 185, 156, 131][s - 12]);
    }
    if (sec === "R" && k === 6 && s === 0) noise(t, STEP * 32, 0.07, "bandpass", 300, 1.2, 7000, STEP * 30);   // the riser
  }

  // The scheduler: keep the next half second queued. pos counts every step played; song() maps it into the song,
  // where the fanfare plays once and the rest loops.
  function song(p) { return p < N ? p : LOOP + (p - LOOP) % (N - LOOP); }
  const start = opts.step >= 0 && opts.step < N ? opts.step | 0 : 0;
  let pos = start, nextT = ctx.currentTime + (opts.delay == null ? 0.05 : opts.delay), stopped = false;
  function tick() {
    if (stopped) return;
    const now = ctx.currentTime;
    if (nextT < now) nextT = now + 0.03;                    // only after a stall longer than the queue
    while (nextT < now + AHEAD) { playStep(song(pos), nextT); pos++; nextT += STEP; }
  }
  tick();
  const timer = opts.ahead ? 0 : setInterval(tick, 90);
  let at = start;
  return function stop() {
    if (stopped) return at;
    stopped = true; clearInterval(timer);
    const now = ctx.currentTime;
    at = song(Math.max(start, pos - Math.max(0, Math.ceil((nextT - now) / STEP))));   // the step that was sounding
    out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(out.gain.value, now); out.gain.linearRampToValueAtTime(0, now + 0.12);
    setTimeout(function () { try { out.disconnect(); } catch (e) { /* already gone */ } }, 600);
    return at;
  };
}

const Juke = (function () {
  let live = null, dead = false, muted = false, going = false, fresh = true, timer = 0, stopMusic = null, songAt = 0;
  let musicOn = (function () { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch (e) { return true; } })();
  const buttons = [];

  function rig(c) {
    const A = { c: c };
    A.out = c.createGain();                                 // follows the mute button
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    A.out.connect(comp); comp.connect(c.destination);
    A.music = c.createGain(); A.music.gain.value = 0;       // the tune plays into this; the fades in and out live here
    A.duck = c.createGain();                                // the band steps back for a jackpot
    A.music.connect(A.duck); A.duck.connect(A.out);
    A.sfx = c.createGain(); A.sfx.gain.value = SFX_VOL; A.sfx.connect(A.out);
    const len = Math.floor(c.sampleRate * 2);
    A.noise = c.createBuffer(1, len, c.sampleRate);
    const d = A.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = vrand() * 2 - 1;
    return A;
  }
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
  // The stingers. x is a detail of the moment (the points).
  function cue(A, name, t, x) {
    const d = A.sfx;
    if (name === "hop") {                                   // the ball pops off the hump
      osc(A, d, "triangle", 330, t, 0.16, 0.32, 760, 0.5);
    } else if (name === "bump") {                           // off the sliding bumper: a thud and a boing
      osc(A, d, "sine", 150, t, 0.16, 0.8, 60, 0.05);
      osc(A, d, "triangle", 420, t + 0.02, 0.28, 0.26, 210, 0.4);
    } else if (name === "rattle") {                         // around the rim of a cup
      for (let i = 0; i < 5; i++) osc(A, d, "sine", 2400 + vrand() * 900, t + i * 0.085, 0.05, 0.18 - i * 0.025, 0, 0.2);
    } else if (name === "ring") {                           // dropped into a ring: a blip pitched by the points
      const m = 72 + ((x || 10) / 10 - 1) * 4;
      osc(A, d, "square", mtof(m), t, 0.08, 0.2, 0, 0.5); osc(A, d, "square", mtof(m + 7), t + 0.07, 0.12, 0.2, 0, 0.5);
    } else if (name === "cup50") {                          // the 50 cup: a run up and a bell
      [72, 76, 79, 84].forEach(function (m, i) { osc(A, d, "square", mtof(m), t + i * 0.055, 0.1, 0.22, 0, 0.5); });
      osc(A, d, "triangle", mtof(88), t + 0.24, 0.6, 0.22, 0, 0.2); osc(A, d, "sine", mtof(100), t + 0.24, 0.5, 0.1, 0, 0.1);
      duck(A, t, 0.8);
    } else if (name === "cup100") {                         // the corner cup: jackpot run, a big bell, and a shower of coins
      [65, 69, 72, 77, 81, 84, 89, 93].forEach(function (m, i) { osc(A, d, "square", mtof(m), t + i * 0.05, 0.1, 0.24, 0, 0.5); });
      const te = t + 0.42;
      [89, 93, 96].forEach(function (m) { osc(A, d, "triangle", mtof(m), te, 0.9, 0.18, 0, 0.25); });
      osc(A, d, "sine", mtof(101), te, 1.0, 0.12, 0, 0.1);
      for (let i = 0; i < 14; i++) osc(A, d, "sine", 2600 + vrand() * 2200, te + 0.05 + vrand() * 1.1, 0.06, 0.12, 0, 0.2);
      duck(A, t, 1.6);
    } else if (name === "lipout") {                         // so close: a wah down
      osc(A, d, "triangle", 620, t, 0.22, 0.3, 300, 0.6); osc(A, d, "triangle", 470, t + 0.22, 0.38, 0.3, 190, 0.6);
    } else if (name === "short") {                          // never cleared the hump
      osc(A, d, "triangle", 240, t, 0.3, 0.32, 110, 0.5);
    } else if (name === "alarm") {                          // the bumper switches on
      for (let i = 0; i < 4; i++) osc(A, d, "square", i % 2 ? 660 : 880, t + i * 0.12, 0.1, 0.16, 0, 0.7);
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
        if (!timer) timer = setInterval(pump, 120);         // keeps the switches followed if the picture ever stalls
      }
      if (live.c.state !== "running") { const p = live.c.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { live = null; dead = true; }
  }
  // Stop the tune (if it is playing) and remember where it got to, so a resume picks it up from there.
  function halt() {
    if (!stopMusic) return;
    try { songAt = stopMusic(); } catch (e) { /* sound is never worth a crash */ }
    stopMusic = null;
  }
  // Called every frame: follow the mute button, and start or stop the tune with the game.
  function pump() {
    const A = live;
    if (!A || !window.Shell) return;
    const c = A.c, now = c.currentTime, m = shellMuted();
    if (m !== muted) { muted = m; A.out.gain.setTargetAtTime(m ? 0 : 1, now, 0.02); }
    const want = musicOn && !muted && c.state === "running" && Shell.state() === "playing";
    if (want && !going) {
      going = true;
      const delay = fresh ? 0.42 : 0.08;                    // a fresh game lets the shell's start jingle go first
      A.music.gain.cancelScheduledValues(now);
      if (fresh) { A.music.gain.setValueAtTime(0, now); A.music.gain.setTargetAtTime(MUSIC_VOL, now + delay - 0.04, 0.012); }
      else A.music.gain.setTargetAtTime(MUSIC_VOL, now, 0.03);
      halt();
      try { stopMusic = startMusic(c, A.music, { step: fresh ? 0 : songAt, delay: delay }); } catch (e) { stopMusic = null; }
      fresh = false;
    } else if (!want && going) {
      going = false;
      A.music.gain.cancelScheduledValues(now); A.music.gain.setTargetAtTime(0, now, 0.06);
      halt();
    }
  }
  function sfx(name, x, delay) {
    const A = live;
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
    newGame: function () {
      unlock(); halt(); songAt = 0; fresh = true; going = false;
      if (live) live.music.gain.setTargetAtTime(0, live.c.currentTime, 0.03);
      pump();
    },
    toggleMusic: function () { unlock(); setMusic(!musicOn); },
    peek: function () { return { made: !!live, state: live ? live.c.state : "none", going: going, playing: !!stopMusic, songAt: songAt, muted: muted, musicOn: musicOn }; },
    // for checks: the tune on any context (an OfflineAudioContext, say), secs seconds of it queued in one go
    render: function (c, secs, t0) { const A = rig(c); A.music.gain.value = MUSIC_VOL; A.stopMusic = startMusic(c, A.music, { delay: t0 == null ? 0.05 : t0, ahead: secs || 30 }); return A; },
    cue: cue
  };
})();

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
  g.save(); g.beginPath(); g.rect(x - 900, y - size * 0.5, 1800, size * 0.36); g.clip(); g.fillText(str, x, y); g.restore();
}
function plainText(g, str, x, y, size, fill, stroke) {
  g.font = '900 ' + size + 'px "Arial Black", Arial, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  if (stroke) { g.lineWidth = size * 0.22; g.strokeStyle = stroke; g.strokeText(str, x, y); }
  g.fillStyle = fill; g.fillText(str, x, y);
}
function star(g, x, y, r1, r2, n) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? r2 : r1; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  g.closePath();
}

/* ---------------- Painted textures (all drawn here, no image files besides the two logos) ---------------- */

// The "Nostalgia Pro Games" script wordmark, trimmed to its ink. Every decal inside the arcade uses this
// (the full logo with the mascot is kept for the splash and the score card). If the PNG is missing,
// plain lettering stands in.
function scriptCanvas(img) {
  if (img && img.naturalWidth > 0) {
    const k = Math.min(1, 1024 / img.naturalWidth);
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = mkCanvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    try {
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

// The ramp, launch mat to hump. x -10..10 across, y -6..100 up the lane; the canvas top is the hump.
const LANE_Y0 = -6;
function laneCanvas(script) {
  const CW = 256, CH = 1024, kx = CW / 20, ky = CH / (HUMP - LANE_Y0), rnd = rng(7);
  const c = mkCanvas(CW, CH), g = c.getContext("2d");
  const X = function (x) { return (x + 10) * kx; }, Y = function (y) { return (HUMP - y) * ky; };
  for (let i = 0; i < 10; i++) {                              // glossy vinyl planks
    g.fillStyle = i % 2 ? "#1747b8" : "#1a52cc"; g.fillRect(Math.floor(X(-10 + i * 2)), 0, Math.ceil(2 * kx) + 1, CH);
    g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(X(-10 + i * 2) + 3, 0, 3, CH);
    g.fillStyle = "rgba(4,16,60,.45)"; g.fillRect(Math.round(X(-10 + i * 2)), 0, 1, CH);
  }
  speckle(g, CW, CH, 2400, rnd, "rgba(255,255,255,.05)", "rgba(0,0,40,.08)");
  const sheen = g.createLinearGradient(0, 0, CW, 0);
  sheen.addColorStop(0, "rgba(255,255,255,0)"); sheen.addColorStop(0.42, "rgba(255,255,255,.10)"); sheen.addColorStop(0.5, "rgba(255,255,255,.16)"); sheen.addColorStop(0.58, "rgba(255,255,255,.10)"); sheen.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = sheen; g.fillRect(0, 0, CW, CH);
  // neon edge lines
  g.fillStyle = "#3ff0ff"; g.fillRect(X(-9.75), 0, 3, CH); g.fillRect(X(9.75) - 3, 0, 3, CH);
  // launch mat
  g.fillStyle = "#14182a"; g.fillRect(0, Y(0), CW, CH - Y(0));
  g.fillStyle = "#ffd21f"; g.fillRect(0, Y(0) - 4, CW, 4);
  candyText(g, "ROLL!", CW / 2, (Y(0) + CH) / 2, 34, 150);
  // chevrons up the lane
  for (let k = 0; k < 4; k++) {
    const y = Y(8 + k * 5.5);
    g.fillStyle = k % 2 ? "#ffd21f" : "#ff9214";
    g.beginPath(); g.moveTo(X(0), y - 26); g.lineTo(X(4.2), y + 6); g.lineTo(X(2.6), y + 12); g.lineTo(X(0), y - 8); g.lineTo(X(-2.6), y + 12); g.lineTo(X(-4.2), y + 6); g.closePath(); g.fill();
  }
  // the wordmark printed under the lacquer, stretched up the lane so it reads from the launch mat
  g.save(); g.globalAlpha = 0.92;
  g.drawImage(script, X(-8.4), Y(70), 16.8 * kx, Y(36) - Y(70));
  g.restore();
  // the hump: a yellow kicker with the wordmark on its face
  const h0 = Y(HUMP), h1 = Y(88);
  const hg = g.createLinearGradient(0, h0, 0, h1);
  hg.addColorStop(0, "#fff06a"); hg.addColorStop(0.5, "#ffc21a"); hg.addColorStop(1, "#ff9214");
  g.fillStyle = hg; g.fillRect(0, h0, CW, h1 - h0);
  g.fillStyle = "#08205f"; g.fillRect(0, h1, CW, 4); g.fillRect(0, h0, CW, 3);
  drawScript(g, script, CW / 2, (h0 + h1) / 2 + 2, 150, h1 - h0 - 12);
  return c;
}

// The target board face, u -11.5..11.5 across and w -1..45 up. Rings, cups, numbers and the wordmark.
const BOARD_U = 11.5, BOARD_W0 = -1, BOARD_W1 = 45;
function boardCanvas(script) {
  const CW = 512, K = CW / (BOARD_U * 2), CH = Math.round(K * (BOARD_W1 - BOARD_W0)), rnd = rng(19);
  const c = mkCanvas(CW, CH), g = c.getContext("2d");
  const X = function (u) { return (u + BOARD_U) * K; }, Y = function (w) { return (BOARD_W1 - w) * K; };
  const bg = g.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, "#2a1a78"); bg.addColorStop(0.5, "#16206e"); bg.addColorStop(1, "#0b1246");
  g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
  g.save(); g.translate(X(C.u), Y(C.w));                       // a sunburst behind the rings
  for (let i = 0; i < 24; i += 2) { g.fillStyle = "rgba(255,255,255,.05)"; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 900, i / 24 * TAU, (i + 1) / 24 * TAU); g.closePath(); g.fill(); }
  g.restore();
  for (let i = 0; i < 60; i++) { g.fillStyle = "rgba(255,255,255," + (0.15 + rnd() * 0.5) + ")"; star(g, rnd() * CW, rnd() * CH, 2 + rnd() * 4, 1, 4); g.fill(); }
  // side gutters beyond the playing field
  g.fillStyle = "#070a1e"; g.fillRect(0, 0, X(-10), CH); g.fillRect(X(10), 0, CW - X(10), CH);
  g.fillStyle = "#3ff0ff"; g.fillRect(X(-10) - 2, 0, 3, CH); g.fillRect(X(10) - 1, 0, 3, CH);
  // the slot the bumper rides in
  g.fillStyle = "rgba(4,6,20,.8)"; g.fillRect(X(-10), Y(BUMP_W) - 5, X(10) - X(-10), 10);
  g.fillStyle = "rgba(255,63,164,.55)"; g.fillRect(X(-10), Y(BUMP_W) - 6, X(10) - X(-10), 2); g.fillRect(X(-10), Y(BUMP_W) + 4, X(10) - X(-10), 2);
  // the 10 trough along the bottom
  rrectPath(g, X(-6.5), Y(1.8), X(6.5) - X(-6.5), Y(0) - Y(1.8), 10);
  const tg = g.createLinearGradient(0, Y(1.8), 0, Y(0));
  tg.addColorStop(0, "#000"); tg.addColorStop(1, "#1a1f38");
  g.fillStyle = tg; g.fill();
  g.lineWidth = 4; g.strokeStyle = "#f6e8c8"; g.stroke();
  plainText(g, "10", X(0), Y(0.9) + 2, 26, "#eceae2", "#000");
  // the rings, outer to inner, each shaded darker toward its inside like a bowl
  const ringCol = [["#c58cff", "#5a1fc0"], ["#5cf0de", "#0c7d74"], ["#6fb2ff", "#1a49c4"]];
  for (let k = RINGS.length - 1; k >= 0; k--) {
    const r = RINGS[k] * K, r0 = (k ? RINGS[k - 1] : 0) * K;
    const gr = g.createRadialGradient(X(C.u), Y(C.w), r0, X(C.u), Y(C.w), r);
    gr.addColorStop(0, ringCol[k][1]); gr.addColorStop(1, ringCol[k][0]);
    g.fillStyle = gr; g.beginPath(); g.arc(X(C.u), Y(C.w), r, 0, TAU); g.fill();
  }
  const hg = g.createRadialGradient(X(C.u), Y(C.w), 0, X(C.u), Y(C.w), 2.2 * K);
  hg.addColorStop(0, "#000"); hg.addColorStop(0.75, "#05040e"); hg.addColorStop(1, "#24123f");
  g.fillStyle = hg; g.beginPath(); g.arc(X(C.u), Y(C.w), 2.2 * K, 0, TAU); g.fill();
  plainText(g, "40", X(C.u), Y(C.w), 30, "#ffffff", "#2a0e5a");
  plainText(g, "30", X(C.u), Y(C.w - 5.25), 30, "#ffffff", "#064a44");
  plainText(g, "20", X(C.u), Y(C.w - 8.75), 30, "#ffffff", "#0c2a7a");
  // the cups: dark holes, labels above
  for (let i = 0; i < CUPS.length; i++) {
    const cp = CUPS[i], gold = cp.pts === 100;
    const cg = g.createRadialGradient(X(cp.u), Y(cp.w), 0, X(cp.u), Y(cp.w), cp.r * K);
    cg.addColorStop(0, "#000"); cg.addColorStop(0.8, "#050408"); cg.addColorStop(1, gold ? "#4a3200" : "#4a0a2c");
    g.fillStyle = cg; g.beginPath(); g.arc(X(cp.u), Y(cp.w), cp.r * K, 0, TAU); g.fill();
    if (gold) { g.fillStyle = "rgba(255,210,63,.18)"; star(g, X(cp.u), Y(cp.w), (cp.r + 2.4) * K, (cp.r + 1.1) * K, 10); g.fill(); }
    plainText(g, String(cp.pts), X(cp.u), Y(cp.w + cp.r + 2.4), gold ? 42 : 38, gold ? "#ffd23f" : "#ff6cc4", "#14062e");
  }
  // the wordmark between the two corner cups
  drawScript(g, script, X(0), Y(40.6), 9.6 * K, 4.4 * K);
  return c;
}

// Cabinet side panels. a = distance up the machine (-z), y = height. Both faces of both walls share one layout.
const SIDE_A0 = -8.5, SIDE_A1 = 96, SIDE_Y0 = -34, SIDE_Y1 = 56;
function sideOuterCanvas(script) {
  const CW = 1024, CH = 880, ka = CW / (SIDE_A1 - SIDE_A0), ky = CH / (SIDE_Y1 - SIDE_Y0), rnd = rng(31);
  const c = mkCanvas(CW, CH), g = c.getContext("2d");
  const X = function (a) { return (a - SIDE_A0) * ka; }, Y = function (y) { return (SIDE_Y1 - y) * ky; };
  const bg = g.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, "#7d3ff2"); bg.addColorStop(0.45, "#3d8cff"); bg.addColorStop(0.8, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
  g.save(); g.translate(X(66), Y(14));
  for (let i = 0; i < 28; i += 2) { g.fillStyle = "rgba(255,255,255,.08)"; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 1600, i / 28 * TAU, (i + 1) / 28 * TAU); g.closePath(); g.fill(); }
  g.restore();
  for (let i = 0; i < 70; i++) { const x = rnd() * CW, y = rnd() * CH, r = 3 + rnd() * 9; g.lineWidth = 2; g.strokeStyle = "rgba(255,255,255," + (0.08 + rnd() * 0.12) + ")"; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
  g.fillStyle = "#ff9214"; g.fillRect(0, Y(-30), CW, Y(-33) - Y(-30)); g.fillStyle = "#ffe45c"; g.fillRect(0, Y(-30) - 4, CW, 4);
  drawScript(g, script, X(20), Y(-12), 46 * ka, 22 * ky);
  candyText(g, "TICKET ROLL", X(66), Y(-6), 64, 36 * ka);
  candyText(g, "ALLEY", X(66), Y(-17), 84, 30 * ka);
  g.fillStyle = "#ffd21f"; star(g, X(70), Y(18), 8 * ka, 4.4 * ka, 10); g.fill();
  g.lineWidth = 6; g.strokeStyle = "#08205f"; g.stroke();
  plainText(g, "100", X(70), Y(18), 54, "#e3231a", "#ffffff");
  return c;
}
function sideInnerCanvas(script) {
  const CW = 1024, CH = 880, ka = CW / (SIDE_A1 - SIDE_A0), ky = CH / (SIDE_Y1 - SIDE_Y0);
  const c = mkCanvas(CW, CH), g = c.getContext("2d");
  const X = function (a) { return (a - SIDE_A0) * ka; }, Y = function (y) { return (SIDE_Y1 - y) * ky; };
  const bg = g.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, "#1b2a8a"); bg.addColorStop(1, "#0a1040");
  g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
  for (let a = -6; a < SIDE_A1; a += 6) { g.fillStyle = "rgba(255,255,255,.04)"; g.fillRect(X(a), 0, 3 * ka, CH); }
  // a neon pin-stripe that climbs with the lane, a hand above it
  g.strokeStyle = "#ff3fa4"; g.lineWidth = 5; g.beginPath();
  for (let a = SIDE_A0; a <= SIDE_A1; a += 2) { const y = a < 60 ? laneH(Math.max(0, a) / LS) + 3.2 : BY0 + (a - 60) / BC * BS + 4; g.lineTo(X(a), Y(Math.min(y, 46))); }
  g.stroke();
  drawScript(g, script, X(78), Y(38.5), 22 * ka, 9 * ky);
  return c;
}
function frontCanvas(script) {
  const c = mkCanvas(512, 512), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 512);
  g.fillStyle = "#ff9214"; g.fillRect(0, 0, 512, 14); g.fillStyle = "#ffe45c"; g.fillRect(0, 14, 512, 4);
  drawScript(g, script, 256, 130, 400, 170);
  rrectPath(g, 156, 260, 200, 150, 14); g.fillStyle = "#0b1f5e"; g.fill(); g.lineWidth = 5; g.strokeStyle = "#ffe45c"; g.stroke();
  candyText(g, "FREE", 256, 310, 56, 180); candyText(g, "PLAY", 256, 366, 56, 180);
  return c;
}
// The marquee on top of the machine: 26 x 9 units, bulbs round the edge.
function marqueeCanvas(script) {
  const c = mkCanvas(1024, 354), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 354);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 354);
  const gl = g.createLinearGradient(0, 0, 0, 160);
  gl.addColorStop(0, "rgba(255,255,255,.42)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.beginPath(); g.ellipse(512, -20, 620, 170, 0, 0, TAU); g.fill();
  g.lineWidth = 16; g.strokeStyle = "#ff9214"; g.strokeRect(8, 8, 1008, 338);
  g.lineWidth = 4; g.strokeStyle = "#ffe45c"; g.strokeRect(36, 36, 952, 282);
  for (let i = 0; i < 26; i++) {                             // bulbs: lit by the chase lights in the scene
    const x = 22 + i * 39.2;
    g.fillStyle = "#fff6c8"; g.beginPath(); g.arc(x, 22, 6.5, 0, TAU); g.fill(); g.beginPath(); g.arc(x, 332, 6.5, 0, TAU); g.fill();
  }
  drawScript(g, script, 300, 180, 470, 230);
  candyText(g, "TICKET ROLL", 760, 136, 68, 400);
  candyText(g, "ALLEY", 760, 230, 104, 400);
  return c;
}
// Behind the board and its net.
function backCanvas() {
  const c = mkCanvas(512, 384), g = c.getContext("2d"), rnd = rng(41);
  const bg = g.createRadialGradient(256, 200, 10, 256, 200, 380);
  bg.addColorStop(0, "#ff3fa4"); bg.addColorStop(0.5, "#7d1fb8"); bg.addColorStop(1, "#1a0a4a");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 384);
  g.save(); g.translate(256, 200);
  for (let i = 0; i < 24; i += 2) { g.fillStyle = "rgba(255,255,255,.08)"; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 700, i / 24 * TAU, (i + 1) / 24 * TAU); g.closePath(); g.fill(); }
  g.restore();
  for (let i = 0; i < 30; i++) { g.fillStyle = "rgba(255,246,200," + (0.3 + rnd() * 0.6) + ")"; star(g, rnd() * 512, rnd() * 384, 3 + rnd() * 6, 1.4, 4); g.fill(); }
  candyText(g, "WIN TICKETS!", 256, 74, 64, 440);
  return c;
}
// 90s arcade carpet: neon squiggles, triangles and rings on black. One tile is 40 x 40 units.
function carpetCanvas() {
  const c = mkCanvas(512, 512), g = c.getContext("2d"), rnd = rng(59);
  g.fillStyle = "#0a0b1e"; g.fillRect(0, 0, 512, 512);
  const cols = ["#ff3fa4", "#3ff0ff", "#ffd21f", "#9bff3f", "#a77bff", "#ff9214"];
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 512, y = rnd() * 512, col = cols[Math.floor(rnd() * cols.length)], s = 10 + rnd() * 18, kind = Math.floor(rnd() * 4);
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3.5; g.lineCap = "round";
    for (let ox = -512; ox <= 512; ox += 512) for (let oy = -512; oy <= 512; oy += 512) {
      if (x + ox < -40 || x + ox > 552 || y + oy < -40 || y + oy > 552) continue;
      g.save(); g.translate(x + ox, y + oy); g.rotate(rnd() * TAU);
      if (kind === 0) { g.beginPath(); for (let k = 0; k <= 16; k++) g.lineTo(-s + k * s / 8, Math.sin(k * 0.9) * s * 0.3); g.stroke(); }
      else if (kind === 1) { g.beginPath(); g.moveTo(0, -s * 0.7); g.lineTo(s * 0.6, s * 0.5); g.lineTo(-s * 0.6, s * 0.5); g.closePath(); g.stroke(); }
      else if (kind === 2) { g.beginPath(); g.arc(0, 0, s * 0.45, 0, TAU); g.stroke(); }
      else { g.beginPath(); g.moveTo(-s, 0); for (let k = 1; k <= 4; k++) g.lineTo(-s + k * s / 2, k % 2 ? -s * 0.35 : s * 0.35); g.stroke(); }
      g.restore();
    }
  }
  for (let i = 0; i < 220; i++) { g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.55; g.fillRect(rnd() * 512, rnd() * 512, 3, 3); }
  g.globalAlpha = 1;
  return c;
}
function wallCanvas() {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(61);
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, "#05061a"); bg.addColorStop(0.6, "#120a3a"); bg.addColorStop(1, "#1d0f52");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 70; i++) { g.fillStyle = "rgba(255,255,255," + (0.15 + rnd() * 0.4) + ")"; g.fillRect(rnd() * 512, rnd() * 160, 1.5, 1.5); }
  [["#ff3fa4", 186], ["#3ff0ff", 206]].forEach(function (n) {
    g.shadowColor = n[0]; g.shadowBlur = 14; g.fillStyle = n[0]; g.fillRect(0, n[1], 512, 4); g.shadowBlur = 0;
    g.fillStyle = "rgba(255,255,255,.8)"; g.fillRect(0, n[1] + 1, 512, 1.5);
  });
  return c;
}
function netCanvas() {
  const c = mkCanvas(256, 128), g = c.getContext("2d");
  g.strokeStyle = "rgba(220,230,255,.55)"; g.lineWidth = 2;
  for (let x = 0; x <= 256; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  for (let y = 0; y <= 128; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.fillStyle = "#ffd21f"; g.fillRect(0, 0, 256, 5);
  return c;
}
// A skee ball: glossy orange with dark swirls, the script wordmark once on each side.
function ballCanvas(script) {
  const c = mkCanvas(512, 256), g = c.getContext("2d"), rnd = rng(5);
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, "#f2a24e"); bg.addColorStop(0.5, "#d47a2a"); bg.addColorStop(1, "#9c4f14");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 512, y = 30 + rnd() * 196, r = 14 + rnd() * 40, a0 = rnd() * TAU;
    g.lineWidth = 2 + rnd() * 6; g.strokeStyle = i % 2 ? "rgba(255,220,170,.22)" : "rgba(90,40,10,.28)";
    for (let k = -1; k <= 1; k++) { g.beginPath(); g.arc(x + k * 512, y, r, a0, a0 + 1 + rnd() * 2); g.stroke(); }
  }
  const SW = 150, SH = Math.round(SW * script.height / script.width), rowH = script.height / SH;
  [128, 384].forEach(function (cx) {                        // widened by 1 / cos(latitude) so it lands on the sphere undistorted
    for (let r = 0; r < SH; r++) {
      const y = 128 - Math.round(SH / 2) + r, lat = (0.5 - (y + 0.5) / 256) * Math.PI, w = SW / Math.max(0.4, Math.cos(lat));
      g.drawImage(script, 0, r * rowH, script.width, rowH, cx - w / 2, y, w, 1);
    }
  });
  return c;
}
function shadowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(0,0,20,.8)"); gr.addColorStop(0.55, "rgba(0,0,20,.4)"); gr.addColorStop(1, "rgba(0,0,20,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function glowCanvas() {
  const c = mkCanvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,.95)"); gr.addColorStop(0.3, "rgba(255,255,255,.4)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function envFaces() {
  const side = function () {
    const c = mkCanvas(64, 64), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.14, "#ffd6f0"); gr.addColorStop(0.3, "#7d3ff2");
    gr.addColorStop(0.5, "#1b2a8a"); gr.addColorStop(0.52, "#0a0b1e"); gr.addColorStop(1, "#1a1440");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const top = mkCanvas(64, 64), tg = top.getContext("2d");
  tg.fillStyle = "#14104a"; tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#ffffff"; tg.fillRect(6, 10, 52, 8); tg.fillRect(6, 46, 52, 8);
  const bot = mkCanvas(64, 64), bgx = bot.getContext("2d");
  bgx.fillStyle = "#0a0b1e"; bgx.fillRect(0, 0, 64, 64);
  return [side(), side(), top, bot, side(), side()];
}

/* ---------------- LED ribbon board: a thin strip across the row of machines, under the marquees ----------------
   The board is a real dot matrix. Everything on it is painted into a small canvas, one pixel per LED, and a small
   shader turns each pixel into a glowing dot. It runs across three machines in three sections: the programme scrolls
   right to left through all three, and big moments (ledPlay below) cut in on every section at once. */
const LED_ROWS = 18, LED_SEG = 168, LED_SEGS = 3, LED_COLS = LED_SEG * LED_SEGS;
const LED_HT = 3.0;                                        // lit height, world units (one section is PITCH wide)
const LED_SAFE = 156;                                      // widest message that fits one section with a margin
const LED_SPEED = 40;                                      // scroll speed, LEDs per second
const LED_BIG = Math.max(1, Math.floor((LED_ROWS - 4) / 7));
const LED_C = { amber: "#ffb000", yellow: "#ffe838", white: "#ffffff", red: "#ff3322", pink: "#ff4fc0", cyan: "#2fe6ff",
                lime: "#7dff3a", violet: "#b68cff", orange: "#ff8a1e", blue: "#4a7dff" };
const LED_LINES = [["FREE AT THENOSTALGIAPRO.COM", "amber"], ["AIM FOR THE CORNER CUP", "pink"], ["NO QUARTERS REQUIRED", "cyan"]];
// Plugs for the rest of the arcade: [game, one-line tag]. Edit freely, the board lays itself out.
const LED_PLUGS = [
  ["TAPE PIN LANES", "3D BOWLING"],
  ["SHELF LINKS", "MINI GOLF"],
  ["BLEACHER CARTS", "HOME RUN DERBY"],
  ["BARGAIN BIN BUCKETS", "HOOPS"],
  ["PAWN SHOP POOL", "RACK 'EM UP"],
  ["RINK RAT SHOOTOUT", "HOCKEY SHOOTOUT"],
  ["FOURTH AND COLLECT", "SPLIT THE UPRIGHTS"],
  ["POWDER DAY HAUL", "HIT THE SLOPES"],
  ["TABLE RINK RUMBLE", "AIR HOCKEY"],
  ["FLEA FORTRESS FLYBY", "PLAY IT FREE"],
  ["CREATURE FEATURE KO", "VHS BOSS RUSH"]
];
let LED = null;

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
  // The wordmark at board resolution: the cream lettering pushed to full brightness, the red edge kept as a
  // dimmer rim, the navy outline dropped to dark, so the script reads as light on black.
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
    ledText(g, "*", x, Math.floor((HH - 7) / 2), 1, 1, LED_C.blue);
    x += 7 + GAP;
  }
  return { canvas: c, markW: items[0].w };
}
function ledCreate(script) {
  const c = mkCanvas(LED_COLS, LED_ROWS), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  const strip = ledStrip(script), sw = strip.canvas.width;
  const start = ((-(LED_COLS - strip.markW) / 2) % sw + sw) % sw;   // open with the wordmark in the middle section
  return { canvas: c, g: g, strip: strip.canvas, scroll: start, pos: -1, msg: null, queue: [], frame: -1, tex: null };
}
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
function ledPlay(list, append) {
  const L = LED;
  if (!L || !list.length) return;
  if (append && L.msg) { for (let i = 0; i < list.length; i++) L.queue.push(list[i]); return; }
  if (!list.some(function (m) { return m.keep; })) {
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
function ledFinal(score, tickets) {
  if (!LED) return;
  ledPlay([ledMsg("count", "FINAL", 4.5, { from: Math.min(V.lastScore, score), value: score, suffix: " PTS", final: true, wait: 0.4 }),
           ledMsg("slide", tickets + " TICKETS", 3, { color: "lime" })], true);
}
function ledDrawMsg(g, m) {
  const WW = LED_SEG, HH = LED_ROWS, big = LED_BIG, calm = Shell.reduced;
  const t = Math.max(0, m.t - m.wait), yBig = Math.floor((HH - 7 * big) / 2), mid = Math.round(WW / 2);
  const step = calm ? 0 : Math.floor(m.t * 24), col = LED_C[m.color] || LED_C.amber;
  function fit(str) { let sx = big; while (sx > 1 && ledTextW(str, sx) > LED_SAFE) sx--; return sx; }
  function chase(color, dir) {
    g.fillStyle = color;
    for (let x = ((step * dir) % 6 + 6) % 6 - 6; x < WW; x += 6) { g.fillRect(x, 0, 3, 1); g.fillRect(WW - x - 3, HH - 1, 3, 1); }
  }
  if (m.kind === "count") {
    const k = calm ? 1 : Math.min(1, t / 0.7), v = Math.round(m.from + (m.value - m.from) * k);
    const label = m.text ? m.text + " " : "", suffix = m.suffix || "", sxc = fit(label + m.value + suffix);
    const x = Math.round((WW - ledTextW(label + m.value + suffix, sxc)) / 2);
    const done = k >= 1, blink = m.final && done && !calm && Math.floor(m.t * 3) % 2 === 1;
    let xn = ledText(g, label, x, yBig, sxc, big, LED_C.amber);
    xn = ledText(g, String(v), xn, yBig, sxc, big, !done ? LED_C.yellow : blink ? LED_C.amber : LED_C.white);
    ledText(g, suffix, xn, yBig, sxc, big, LED_C.amber);
    if (!calm && m.t < 0.3) { g.fillStyle = "#000000"; g.fillRect(Math.round(WW * m.t / 0.3), 0, WW, HH); }
    chase(LED_C.amber, 1);
    return;
  }
  const sx = fit(m.text), w = ledTextW(m.text, sx), x0 = Math.round((WW - w) / 2);
  if (m.kind === "flash") {
    if (!calm && t < 0.6 && Math.floor(t * 12) % 2 === 0) {
      g.fillStyle = LED_C.yellow; g.fillRect(0, 0, WW, HH);
      ledText(g, m.text, x0, yBig, sx, big, "#000000");
      return;
    }
    const span = 6 * big + 5, ph = calm ? 0 : Math.floor((t * 46) % span);
    for (let k = 0; k < 12; k++) {
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
  if (m.kind === "slide") {
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
  if (m.kind === "cycle") {
    const cyc = [LED_C.yellow, LED_C.pink, LED_C.cyan, LED_C.lime, LED_C.orange];
    let x = x0;
    for (let i = 0; i < m.text.length; i++) x = ledText(g, m.text[i], x, yBig, sx, big, cyc[(i + (calm ? 0 : Math.floor(t * 9))) % cyc.length]);
    if (!calm) { g.fillStyle = "#ffffff"; for (let i = 0; i < 8; i++) g.fillRect((vrand() * WW) | 0, (vrand() * HH) | 0, 1, 1); }
    chase(LED_C.yellow, 1);
    return;
  }
  if (calm || t > 1.1 || Math.floor(t * 5) % 2 === 0) ledText(g, m.text, x0, yBig, sx, big, col);
  g.fillStyle = col; g.fillRect(0, HH - 1, WW, 1); g.fillRect(0, 0, WW, 1);
}
function ledDraw() {
  const L = LED, g = L.g, HH = LED_ROWS;
  g.fillStyle = "#000000"; g.fillRect(0, 0, LED_COLS, HH);
  if (L.msg) {
    for (let s = 0; s < LED_SEGS; s++) {
      g.save(); g.translate(s * LED_SEG, 0);
      g.beginPath(); g.rect(0, 0, LED_SEG, HH); g.clip();
      ledDrawMsg(g, L.msg);
      g.restore();
    }
    return;
  }
  const sw = L.strip.width;
  let sx = L.pos, dx = 0;
  while (dx < LED_COLS) {
    const n = Math.min(LED_COLS - dx, sw - sx);
    g.drawImage(L.strip, sx, 0, n, HH, dx, 0, n, HH);
    dx += n; sx = 0;
  }
}
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
// A box with every edge and corner rounded (from the approved games). Face slots +x -x +y -y +z -z.
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
// A mesh from raw triangles; every triangle is turned to face along "hint".
function rawGeo(T, pos, uv, idx, hint) {
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// A strip lying on the lane between x0 and x1, raised by off.
function laneTop(T, x0, x1, y0, y1, off, uvf) {
  const pos = [], uv = [], idx = [], n = 48;
  for (let i = 0; i <= n; i++) {
    const y = y0 + (y1 - y0) * i / n, h = laneH(y) + off, z = -y * LS;
    pos.push(x0, h, z, x1, h, z);
    if (uvf) { uv.push.apply(uv, uvf(x0, y)); uv.push.apply(uv, uvf(x1, y)); }
    if (i < n) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  return rawGeo(T, pos, uvf ? uv : null, idx, [0, 1, 0]);
}
// A wall standing along the lane at x, from laneH + o0 to laneH + o1, facing face (+1 = +x).
function laneSide(T, x, o0, o1, y0, y1, face) {
  const pos = [], idx = [], n = 48;
  for (let i = 0; i <= n; i++) {
    const y = y0 + (y1 - y0) * i / n, h = laneH(y), z = -y * LS;
    pos.push(x, h + o0, z, x, h + o1, z);
    if (i < n) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  return rawGeo(T, pos, null, idx, [face, 0, 0]);
}
// A flat polygon on the plane x = const, given as (a = -z, y) points, facing face (+1 = +x).
function sidePanel(T, x, prof, face, uvf) {
  const tris = T.ShapeUtils.triangulateShape(prof.map(function (p) { return new T.Vector2(p[0], p[1]); }), []);
  const pos = [], uv = [], idx = [];
  prof.forEach(function (p) { pos.push(x, p[1], -p[0]); uv.push.apply(uv, uvf(p[0], p[1])); });
  tris.forEach(function (t) { idx.push(t[0], t[1], t[2]); });
  return rawGeo(T, pos, uv, idx, [face, 0, 0]);
}

/* ---------------- Scene ---------------- */
function buildScene(T, scriptImg) {
  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: dpr < 2, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x05061a, 1);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(CAM.fov, W / H, 1, 1200);
  const caps = renderer.capabilities;
  const aniso = Math.min(4, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);

  function tex(canvas, repeat) {
    const t = new T.CanvasTexture(canvas);
    if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = aniso;
    return t;
  }
  const script = scriptCanvas(scriptImg);
  const tLane = tex(laneCanvas(script)), tBoard = tex(boardCanvas(script)), tOuter = tex(sideOuterCanvas(script)), tInner = tex(sideInnerCanvas(script));
  const tFront = tex(frontCanvas(script)), tMarq = tex(marqueeCanvas(script)), tBack = tex(backCanvas()), tCarpet = tex(carpetCanvas(), true);
  const tWall = tex(wallCanvas(), true), tNet = tex(netCanvas(), true), tBall = tex(ballCanvas(script), true), tShadow = tex(shadowCanvas()), tGlow = tex(glowCanvas());
  tBall.wrapT = T.ClampToEdgeWrapping;
  const tEnv = new T.CubeTexture(envFaces());
  if ("colorSpace" in tEnv && T.SRGBColorSpace) tEnv.colorSpace = T.SRGBColorSpace;
  tEnv.needsUpdate = true;
  const v = new T.Vector3();

  /* lights: an arcade at night, neon from both sides */
  scene.add(new T.HemisphereLight(0xffffff, 0x5a4a9a, 1.45));
  const keyL = new T.DirectionalLight(0xffffff, 1.7); keyL.position.set(-40, 120, 70); scene.add(keyL);
  const fill = new T.DirectionalLight(0xffd6f0, 0.6); fill.position.set(60, 40, 40); scene.add(fill);
  const pink = new T.PointLight(0xff3fa4, 60, 90, 1.2); pink.position.set(-14, 34, -66); scene.add(pink);
  const cyan = new T.PointLight(0x3ff0ff, 60, 90, 1.2); cyan.position.set(14, 34, -66); scene.add(cyan);

  /* the room */
  const FLOOR_Y = -34;
  const floorGeo = new T.PlaneGeometry(600, 400); floorGeo.rotateX(-Math.PI / 2);
  (function () { const uv = floorGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 15, uv.getY(i) * 10); })();
  const floor = new T.Mesh(floorGeo, new T.MeshLambertMaterial({ map: tCarpet })); floor.position.set(0, FLOOR_Y, -60); scene.add(floor);
  const wallGeo = new T.PlaneGeometry(600, 160);
  (function () { const uv = wallGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 8); })();
  const backWall = new T.Mesh(wallGeo, new T.MeshBasicMaterial({ map: tWall })); backWall.position.set(0, FLOOR_Y + 80, -112); scene.add(backWall);

  /* one machine, built in its own group so the neighbors can be copies of it */
  const machine = new T.Group();
  const laneMat = new T.MeshPhongMaterial({ map: tLane, specular: 0xbfc8ff, shininess: 90, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.06 });
  machine.add(new T.Mesh(laneTop(T, -LANE, LANE, LANE_Y0, HUMP, 0, function (x, y) { return [(x + LANE) / (2 * LANE), (y - LANE_Y0) / (HUMP - LANE_Y0)]; }), laneMat));
  const railMat = new T.MeshBasicMaterial({ color: 0x3ff0ff }), railSide = new T.MeshPhongMaterial({ color: 0x18c8e0, specular: 0xffffff, shininess: 60 });
  [-1, 1].forEach(function (s) {
    machine.add(new T.Mesh(laneTop(T, s * LANE, s * (LANE + 1.5), LANE_Y0, HUMP, 1.1), railMat));
    machine.add(new T.Mesh(laneSide(T, s * LANE, 0, 1.1, LANE_Y0, HUMP, -s), railSide));
  });
  const darkMat = new T.MeshLambertMaterial({ color: 0x06071a });
  // the drop behind the hump, and the pit under the board's lip
  const humpTop = laneH(HUMP), zH = -HUMP * LS;
  machine.add(new T.Mesh(rawGeo(T, [-LANE, humpTop, zH, LANE, humpTop, zH, -LANE, BY0 - 2, zH, LANE, BY0 - 2, zH], null, [0, 1, 2, 1, 3, 2], [0, 0, -1]), darkMat));
  machine.add(new T.Mesh(rawGeo(T, [-LANE - 1.5, BY0 - 2, zH, LANE + 1.5, BY0 - 2, zH, -LANE - 1.5, BY0 - 2, BZ0 + 2, LANE + 1.5, BY0 - 2, BZ0 + 2], null, [0, 1, 2, 1, 3, 2], [0, 1, 0]), darkMat));

  // the board, in its own frame: local x = u, local y = w, local z = out of the board face
  const board = new T.Group();
  board.position.set(0, BY0, BZ0); board.rotation.x = -(90 * DEG - BOARD_ANG);
  machine.add(board);
  const boardGeo = new T.PlaneGeometry(BOARD_U * 2, BOARD_W1 - BOARD_W0);
  const boardFace = new T.Mesh(boardGeo, new T.MeshPhongMaterial({ map: tBoard, specular: 0x6070a0, shininess: 50 }));
  boardFace.position.set(0, (BOARD_W0 + BOARD_W1) / 2, 0); board.add(boardFace);
  const back = new T.Mesh(new T.PlaneGeometry(BOARD_U * 2, BOARD_W1 - BOARD_W0), darkMat); back.rotation.y = Math.PI; back.position.copy(boardFace.position); board.add(back);

  // cabinet sides: inside and outside faces of both walls, and a neon cap along the top
  const top = boardPos(0, BOARD_W1, 0, new T.Vector3()), aTop = -top.z;
  const prof = [[SIDE_A0, -33.5], [SIDE_A0, 3.6], [-3.6, 4.6], [50, 15.2], [aTop + 1, top.y + 7.5], [aTop + 4.2, top.y + 7.5], [aTop + 4.2, -33.5]];
  const capPts = prof.slice(1, 6);
  const uvSide = function (flip) { return function (a, y) { const u = (a - SIDE_A0) / (SIDE_A1 - SIDE_A0); return [flip ? 1 - u : u, (y - SIDE_Y0) / (SIDE_Y1 - SIDE_Y0)]; }; };
  const outerMat = new T.MeshPhongMaterial({ map: tOuter, specular: 0x777777, shininess: 60, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.05 });
  const innerMat = new T.MeshPhongMaterial({ map: tInner, specular: 0x444444, shininess: 30 });
  const XI = LANE + 1.5, XO = LANE + 3;
  machine.add(new T.Mesh(sidePanel(T, XO, prof, 1, uvSide(false)), outerMat));
  machine.add(new T.Mesh(sidePanel(T, -XO, prof, -1, uvSide(true)), outerMat));
  machine.add(new T.Mesh(sidePanel(T, -XI, prof, 1, uvSide(false)), innerMat));
  machine.add(new T.Mesh(sidePanel(T, XI, prof, -1, uvSide(true)), innerMat));
  const capMat = new T.MeshBasicMaterial({ color: 0xff3fa4 });
  [-1, 1].forEach(function (s) {
    const pos = [], idx = [];
    capPts.forEach(function (p, i) { pos.push(s * XI, p[1], -p[0], s * XO, p[1], -p[0]); if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); } });
    machine.add(new T.Mesh(rawGeo(T, pos, null, idx, [0, 1, 0]), capMat));
  });
  // the front of the cabinet, and the ball return across it
  const front = new T.Mesh(new T.PlaneGeometry(XO * 2, 37), new T.MeshPhongMaterial({ map: tFront, specular: 0x555555, shininess: 40 }));
  front.position.set(0, 3.6 - 18.5, -SIDE_A0); machine.add(front);
  const trayMat = new T.MeshPhongMaterial({ color: 0x0b1f5e, specular: 0x8899cc, shininess: 50 });
  const trayZ0 = -LANE_Y0 * LS + 0.2, trayZ1 = -SIDE_A0;
  const tray = new T.Mesh(new T.BoxGeometry(XI * 2, 0.6, trayZ1 - trayZ0), trayMat); tray.position.set(0, -2.2, (trayZ0 + trayZ1) / 2); machine.add(tray);
  const lip = new T.Mesh(roundBox(T, XO * 2, 1.4, 1.2, 0.5), new T.MeshPhongMaterial({ color: 0xffd21f, specular: 0xffffff, shininess: 70 })); lip.position.set(0, 3.0, trayZ1 - 0.4); machine.add(lip);
  // behind the board: a back panel, the net, the header bar the LED ribbon hangs on, and the marquee
  const backPanel = new T.Mesh(new T.PlaneGeometry(XO * 2, 26), new T.MeshBasicMaterial({ map: tBack }));
  backPanel.position.set(0, top.y + 4, top.z - 3.6); machine.add(backPanel);
  const net = new T.Mesh(new T.PlaneGeometry(BOARD_U * 2, 3.8), new T.MeshBasicMaterial({ map: tNet, transparent: true, depthWrite: false, side: T.DoubleSide }));
  net.position.set(0, top.y + 1.6, top.z - 0.3); net.renderOrder = 3; machine.add(net);
  const marq = new T.Group(); marq.position.set(0, top.y + 17.5, top.z - 1.8); marq.rotation.x = 0.22; machine.add(marq);
  const marqSide = new T.MeshPhongMaterial({ color: 0x0b3aa6, specular: 0x8899cc, shininess: 40 });
  const marqBox = new T.Mesh(roundBox(T, XO * 2 + 1, 9, 3, 0.8), [marqSide, marqSide, marqSide, marqSide, new T.MeshBasicMaterial({ map: tMarq }), marqSide]);
  marq.add(marqBox);

  // the targets: raised ring lips, cup rims, the bumper slot. Lit-up copies for our machine, plain ones for the neighbors.
  const ringGeo = RINGS.map(function (r) { return new T.TorusGeometry(r + 0.18, 0.36, 8, 56); });
  const holeGeo = new T.TorusGeometry(2.42, 0.32, 8, 40);
  const cupGeo = CUPS.map(function (c) { return new T.TorusGeometry(c.r + 0.3, 0.42, 8, 40); });
  const troughGeo = roundBox(T, 13.6, 2.5, 0.7, 0.3);
  function targets(parent, lit) {
    const mk = function (col) { return new T.MeshPhongMaterial({ color: col, specular: 0xffffff, shininess: 80, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.12, emissive: 0x000000 }); };
    const out = { rings: [], cups: [], trough: null };
    for (let k = 0; k < RINGS.length; k++) {
      const m = new T.Mesh(ringGeo[k], lit ? mk(0xf6e8c8) : parent.userData.cream); m.position.set(C.u, C.w, 0.18); parent.add(m); out.rings.push(m);
    }
    const hole = new T.Mesh(holeGeo, lit ? out.rings[0].material : parent.userData.cream); hole.position.set(C.u, C.w, 0.18); parent.add(hole);
    for (let i = 0; i < CUPS.length; i++) {
      const col = CUPS[i].pts === 100 ? 0xffd23f : 0xff3fa4;
      const m = new T.Mesh(cupGeo[i], lit ? mk(col) : (CUPS[i].pts === 100 ? parent.userData.gold : parent.userData.pink)); m.position.set(CUPS[i].u, CUPS[i].w, 0.22); parent.add(m); out.cups.push(m);
    }
    const tr = new T.Mesh(troughGeo, lit ? mk(0xf6e8c8) : parent.userData.cream); tr.position.set(0, 0.9, -0.2); tr.scale.z = 0.6; parent.add(tr);
    out.trough = tr;
    return out;
  }

  /* the neighbors: plain copies of the static machine, left and right */
  const plainMat = function (col) { return new T.MeshPhongMaterial({ color: col, specular: 0xffffff, shininess: 80 }); };
  const neighbors = [];
  [-1, 1].forEach(function (s) {
    const m = machine.clone();
    m.position.x = s * PITCH;
    const cloneBoard = m.children[machine.children.indexOf(board)];   // the board group sits at the same index in the copy
    cloneBoard.userData = { cream: plainMat(0xf6e8c8), gold: plainMat(0xffd23f), pink: plainMat(0xff3fa4) };
    targets(cloneBoard, false);
    scene.add(m); neighbors.push(m);
  });
  scene.add(machine);
  const T3 = targets(board, true);

  /* the bumper */
  const bumperMat = new T.MeshPhongMaterial({ color: 0xff3fa4, specular: 0xffffff, shininess: 90, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.15, emissive: 0x3a0020 });
  const bumper = new T.Mesh(roundBox(T, BUMP_HALF * 2, 2.0, 2.6, 0.7), bumperMat);
  const bumperCap = new T.Mesh(roundBox(T, BUMP_HALF * 2 - 0.6, 0.5, 0.4, 0.2), new T.MeshBasicMaterial({ color: 0xffe45c }));
  bumperCap.position.z = 1.35; bumper.add(bumperCap);
  bumper.visible = false; board.add(bumper);

  /* the LED ribbon: one long strip across all three machines, on the header bar under the marquees */
  LED = ledCreate(script);
  const tLed = new T.CanvasTexture(LED.canvas);
  if ("colorSpace" in tLed && T.SRGBColorSpace) tLed.colorSpace = T.SRGBColorSpace;
  tLed.minFilter = tLed.magFilter = T.NearestFilter; tLed.generateMipmaps = false;
  LED.tex = tLed;
  const tDot = new T.CanvasTexture(ledDotCanvas());
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
      "  vec2 c0 = (floor(cell) + 0.5) * px;",
      "  vec3 led = texture2D(tLed, c0).rgb;",
      "  vec3 halo = led;",
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
  const ribY = top.y + 5.4, ribZ = top.z - 2.4;
  const ribHouse = new T.Mesh(new T.BoxGeometry(PITCH * LED_SEGS + 3, LED_HT + 1.4, 1.4), new T.MeshPhongMaterial({ color: 0x05070d, specular: 0x333344, shininess: 30 }));
  ribHouse.position.set(0, ribY, ribZ - 0.75); scene.add(ribHouse);
  const ribTrim = new T.Mesh(new T.BoxGeometry(PITCH * LED_SEGS + 3, 0.35, 1.6), new T.MeshBasicMaterial({ color: 0xff9214 }));
  ribTrim.position.set(0, ribY - LED_HT / 2 - 0.8, ribZ - 0.7); scene.add(ribTrim);
  const ribbon = new T.Mesh(new T.PlaneGeometry(PITCH * LED_SEGS, LED_HT), ledMat);
  ribbon.position.set(0, ribY, ribZ + 0.02); scene.add(ribbon);

  /* marquee chase lights (just ours), as glowing dots over the painted bulbs */
  const bulbGeo = new T.SphereGeometry(0.28, 8, 6);
  const bulbs = new T.InstancedMesh(bulbGeo, new T.MeshBasicMaterial({ color: 0xffffff }), 52);
  const bm = new T.Matrix4();
  for (let i = 0; i < 26; i++) {
    const x = -XO - 0.5 + (22 + i * 39.2) / 1024 * (XO * 2 + 1);
    bm.makeTranslation(x, 4.5 - 22 / 354 * 9, 1.55); bulbs.setMatrixAt(i, bm);
    bm.makeTranslation(x, 4.5 - 332 / 354 * 9, 1.55); bulbs.setMatrixAt(26 + i, bm);
  }
  bulbs.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < 52; i++) bulbs.setColorAt(i, new T.Color(0xffd21f));
  marq.add(bulbs);

  /* the ball, its shadows, the balls waiting in the return */
  const ballMat = new T.MeshPhongMaterial({ map: tBall, specular: 0xffffff, shininess: 110, envMap: tEnv, combine: T.AddOperation, reflectivity: 0.1 });
  const ballGeo = new T.SphereGeometry(BALL_R, 26, 18);
  const ball = new T.Mesh(ballGeo, ballMat); scene.add(ball);
  const shadowMat = new T.MeshBasicMaterial({ map: tShadow, transparent: true, depthWrite: false, opacity: 0.6 });
  const unitFlat = new T.PlaneGeometry(1, 1);
  const laneShadow = new T.Mesh(unitFlat, shadowMat); laneShadow.rotation.x = -Math.PI / 2 + SLOPE; laneShadow.renderOrder = 2; scene.add(laneShadow);
  const boardShadow = new T.Mesh(unitFlat, shadowMat); boardShadow.renderOrder = 2; board.add(boardShadow);
  const trayBalls = [];
  for (let i = 0; i < BALLS; i++) {
    const m = new T.Mesh(ballGeo, ballMat); m.visible = false;
    m.position.set(-XI + 1.9 + (i % 7) * 3.25, -1.9 + BALL_R, (trayZ0 + trayZ1) / 2 + (i >= 7 ? -0.4 : 0.4) + (i >= 7 ? 0 : 0));
    m.rotation.set(vrand() * TAU, vrand() * TAU, 0);
    scene.add(m); trayBalls.push(m);
  }
  // a glow that flashes over whatever the ball dropped into
  const glow = new T.Sprite(new T.SpriteMaterial({ map: tGlow, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, color: 0xffd23f }));
  glow.scale.set(12, 12, 1); scene.add(glow);

  gl.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  gl.addEventListener("webglcontextrestored", function () { if (R) R.dirty = true; });

  return {
    T: T, gl: gl, renderer: renderer, scene: scene, camera: camera, script: script, board: board, bumper: bumper, bumperMat: bumperMat,
    targets: T3, bulbs: bulbs, ball: ball, laneShadow: laneShadow, boardShadow: boardShadow, trayBalls: trayBalls, glow: glow, neighbors: neighbors,
    camPos: new T.Vector3(CAM.x, CAM.y, CAM.z), camTgt: new T.Vector3(0, CAM.ty, CAM.tz), goalPos: new T.Vector3(), goalTgt: new T.Vector3(),
    v: new T.Vector3(), v2: new T.Vector3(), v3: new T.Vector3(), lastBP: new T.Vector3(), haveBP: false,
    ballQ: new T.Quaternion(), qa: new T.Quaternion(), axis: new T.Vector3(), col: new T.Color(), up: new T.Vector3(0, 1, 0), bulbT: -1,
    shakeT: 0, shakeDur: 0, shakeMag: 0, clock: 0, debugCam: null,
    hud: null, stage: null, cw: 0, ch: 0, left: null, top: null, pr: 0, dirty: true, lastT: 0,
    quality: 0, qLock: false, nbOn: true, slowSum: 0, slowN: 0, slowHits: 0, warm: 0, v0: v
  };
}

/* ---------------- Quality: start sharp, step down if the phone can't hold the frame rate ---------------- */
// pr = pixel ratio cap, nb = the two neighboring machines and the point lights' glow
const QUALITY = [{ pr: 2, nb: true }, { pr: 1.5, nb: true }, { pr: 1.15, nb: true }, { pr: 1, nb: false }];
function setQuality(q) {
  R.quality = clamp(q, 0, QUALITY.length - 1);
  const on = QUALITY[R.quality].nb;
  if (on !== R.nbOn) { R.nbOn = on; for (let i = 0; i < R.neighbors.length; i++) R.neighbors[i].visible = on; }
  R.dirty = true;
}
function pixelRatio() { return Math.min(window.devicePixelRatio || 1, QUALITY[R.quality].pr); }
function watchFrameRate(ms) {
  if (R.qLock || R.quality >= QUALITY.length - 1 || ms > 250) return;
  if (R.warm < 45) { R.warm++; return; }
  R.slowSum += ms; R.slowN++;
  if (R.slowN < 60) return;
  const avg = R.slowSum / R.slowN;
  R.slowSum = 0; R.slowN = 0;
  if (avg > 24) {
    if (++R.slowHits >= 2) {
      R.slowHits = 0;
      const before = pixelRatio();
      let q = R.quality + 1;
      while (q < QUALITY.length - 1 && Math.min(window.devicePixelRatio || 1, QUALITY[q].pr) === before && QUALITY[q].nb === R.nbOn) q++;
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
function toScreen(x, y, z) {
  R.v.set(x, y, z).project(R.camera);
  return { x: (R.v.x * 0.5 + 0.5) * W, y: (-R.v.y * 0.5 + 0.5) * H, ok: R.v.z > -1 && R.v.z < 1 };
}

/* ---------------- Camera ---------------- */
// From behind the launch mat, the whole ramp and the board in view, for the whole game.
const CAM = { x: 0, y: 27, z: 38, ty: 12, tz: -60, fov: 54 };
const TITLE_CAM = { y: 33, z: 52, ty: 19, tz: -60 };            // the title and score cards: pulled back to show the marquee
const NEAR = { y: 34, z: -30, lift: 4 };

/* ---------------- Game state -> meshes ---------------- */
function syncScene(state, fdt) {
  const idle = state === "title" || state === "over";
  const t = idle ? idleT : S.t, ph = S.phase, calm = Shell.reduced;
  R.clock += fdt;
  ledTick(fdt);

  /* the bumper, sliding in its slot */
  const bon = !idle && bumperActive();
  R.bumper.visible = bon;
  if (bon) {
    V.bumpHit = Math.max(0, V.bumpHit - fdt * 3);
    R.bumper.position.set(bumperU(t), BUMP_W, 1.3);
    R.bumper.scale.set(1 + 0.25 * V.bumpHit, 1, 1 - 0.2 * V.bumpHit);
    R.bumperMat.emissive.setRGB(0.23 + 0.5 * V.bumpHit, 0.0, 0.12 + 0.2 * V.bumpHit);
  }

  /* marquee chase lights */
  const bt = calm ? 0 : Math.floor(R.clock * 6);
  if (bt !== R.bulbT) {
    R.bulbT = bt;
    for (let i = 0; i < 52; i++) R.bulbs.setColorAt(i, R.col.set(((i % 26) + bt) % 3 === 0 ? 0xffffff : (i % 2 ? 0xff9214 : 0xffd21f)));
    R.bulbs.instanceColor.needsUpdate = true;
  }

  /* targets light up when the ball drops in */
  V.litT = Math.max(0, V.litT - fdt * 0.9);
  const flick = calm ? 1 : (Math.sin(R.clock * 30) > 0 ? 1 : 0.45);
  const TG = R.targets;
  for (let k = 0; k < 3; k++) TG.rings[k].material.emissive.setScalar(V.lit && V.lit.kind === "ring" && V.lit.i === k ? 0.9 * V.litT * flick : 0);
  for (let i = 0; i < 3; i++) TG.cups[i].material.emissive.setScalar(V.lit && V.lit.kind === "cup" && V.lit.i === i ? 1.0 * V.litT * flick : 0);
  TG.trough.material.emissive.setScalar(V.lit && V.lit.kind === "trough" ? 0.8 * V.litT * flick : 0);
  R.glow.material.opacity = 0;
  if (V.lit && V.litT > 0) {
    let gu = 0, gw = 0.9;
    if (V.lit.kind === "cup") { gu = CUPS[V.lit.i].u; gw = CUPS[V.lit.i].w; }
    else if (V.lit.kind === "ring") { gu = C.u; gw = C.w; }
    boardPos(gu, gw, 1.2, R.v2); R.glow.position.copy(R.v2);
    const big = V.lit.kind === "ring" ? 18 + V.lit.i * 0 : V.lit.kind === "cup" && CUPS[V.lit.i].pts === 100 ? 16 : 11;
    R.glow.scale.set(big * (V.lit.kind === "ring" ? (RINGS[V.lit.i] / 6 + 0.6) : 1), big * (V.lit.kind === "ring" ? (RINGS[V.lit.i] / 6 + 0.6) : 1), 1);
    R.glow.material.color.set(V.lit.kind === "cup" ? (CUPS[V.lit.i].pts === 100 ? 0xffd23f : 0xff3fa4) : 0x9fe8ff);
    R.glow.material.opacity = 0.75 * V.litT * flick;
  }

  /* the ball (the same path the 2D game drew, through the 3D cabinet) */
  const bp = R.v3, b = S.b;
  let show = state === "title" || ph !== "post", sc = 1, onBoard = false, bu = 0, bw = 0;
  if (show) {
    if (!b || idle) lanePos(0, 0, bp);
    else if (ph === "lane" || ph === "back") lanePos(b.x, b.y, bp);
    else if (ph === "fly") {
      const k = clamp(S.pt / S.flyT, 0, 1);
      if (S.fromK) boardPos(S.fromK.u, S.fromK.w, BALL_R, R.v2); else lanePos(S.hump.x, HUMP, R.v2);
      boardPos(S.land.u, S.land.w, BALL_R, R.v);
      bp.copy(R.v2).lerp(R.v, k);
      bp.y += Math.sin(k * Math.PI) * (S.fromK ? 1.6 : 3 + S.land.w * 0.16);
      onBoard = k > 0.6; bu = S.land.u; bw = S.land.w;
    } else if (ph === "settle") {
      const res = S.res, dur = res.lip ? 0.75 : 0.4, kk = clamp(S.pt / dur, 0, 1);
      let u = S.land.u, w = S.land.w, lift = BALL_R;
      if (res.lip) {
        const lk = clamp(kk / 0.55, 0, 1), ang = lk * TAU * 1.3, rad = res.cup.r * 0.95;
        u = res.cup.u + Math.cos(ang) * rad; w = res.cup.w + Math.sin(ang) * rad; lift = BALL_R * 0.92;
        if (kk > 0.55) {
          const m = (kk - 0.55) / 0.45;
          if (res.lip === "in") { u = res.cup.u + (u - res.cup.u) * (1 - m); w = res.cup.w + (w - res.cup.w) * (1 - m); lift = BALL_R - m * 4.2; }
          else { u = u + (res.u - u) * m; w = w + (res.w - w) * m; if (m > 0.8) { lift = BALL_R - (m - 0.8) * 5 * 4.2; } }
        }
      } else {
        u = S.land.u + (res.u - S.land.u) * kk; w = S.land.w + (res.w - S.land.w) * kk;
        if (kk > 0.6) { const m = (kk - 0.6) / 0.4; lift = BALL_R - m * 4.2; sc = 1 - m * 0.35; }
      }
      boardPos(u, w, lift, bp);
      onBoard = true; bu = u; bw = w;
    }
  }
  R.ball.visible = show;
  if (show) {
    // roll without slipping, whichever surface it is on
    if (R.haveBP) {
      R.v.subVectors(bp, R.lastBP);
      const d = R.v.length();
      if (d > 1e-4 && d < 20) {
        R.axis.crossVectors(R.up, R.v).normalize();
        R.qa.setFromAxisAngle(R.axis, d / BALL_R * (ph === "fly" ? 0.6 : 1));
        R.ballQ.premultiply(R.qa);
      }
    } else if (state === "title" && !calm) { R.qa.setFromAxisAngle(R.up, fdt * 0.6); R.ballQ.premultiply(R.qa); }
    R.lastBP.copy(bp); R.haveBP = !idle;
    R.ball.position.copy(bp); R.ball.quaternion.copy(R.ballQ); R.ball.scale.setScalar(sc);
  } else R.haveBP = false;
  // shadows
  const onLane = show && !onBoard && (!b || ph === "lane" || ph === "back" || idle || (ph === "fly" && S.pt / S.flyT < 0.25 && !S.fromK));
  R.laneShadow.visible = show && (!b || idle || ph === "lane" || ph === "back");
  if (R.laneShadow.visible) {
    const ly = idle || !b ? 0 : b.y, lx = idle || !b ? 0 : b.x;
    R.laneShadow.position.set(lx + 0.4, laneH(ly) + 0.08, -ly * LS + 0.4);
    R.laneShadow.scale.set(4.4, 4.4, 1);
  }
  void onLane;
  R.boardShadow.visible = show && onBoard && ph !== "settle" || (ph === "settle" && show);
  if (R.boardShadow.visible) {
    const hgt = Math.max(0, R.board.worldToLocal(R.v.copy(bp)).z - BALL_R);
    R.boardShadow.position.set(bu + 0.25, bw - 0.3, 0.05);
    const s = 4.2 * clamp(1 - hgt / 14, 0.4, 1) * sc;
    R.boardShadow.scale.set(s, s, 1);
    R.boardShadow.visible = (ph === "settle" ? bp.distanceTo(boardPos(bu, bw, 0, R.v2)) > 0.4 : true);
  }

  /* balls waiting in the return */
  const waiting = idle && state === "title" ? BALLS - 1 : Math.max(0, BALLS - S.ball - 1);
  if (waiting !== V.tray) { V.tray = waiting; for (let i = 0; i < BALLS; i++) R.trayBalls[i].visible = i < waiting; }

  /* camera: stays behind the launch mat the whole roll (no zoom), so the next roll is ready right away */
  const gp = R.goalPos, gt = R.goalTgt;
  const rate = 3.0;
  const sway = idle && !calm ? Math.sin(idleT * 0.4) * 2.2 : 0;
  if (idle) { gp.set(sway, TITLE_CAM.y, TITLE_CAM.z); gt.set(sway * 0.3, TITLE_CAM.ty, TITLE_CAM.tz); }
  else { gp.set(CAM.x, CAM.y, CAM.z); gt.set(0, CAM.ty, CAM.tz); }
  const k = R.debugCam ? 1 : 1 - Math.exp(-rate * fdt);
  if (R.debugCam) { gp.fromArray(R.debugCam, 0); gt.fromArray(R.debugCam, 3); }
  R.camPos.lerp(gp, k); R.camTgt.lerp(gt, k);
  let sx = 0, sy = 0;
  if (R.shakeT > 0) {
    R.shakeT -= fdt;
    const m = R.shakeMag * Math.max(0, R.shakeT / R.shakeDur);
    sx = (vrand() * 2 - 1) * m; sy = (vrand() * 2 - 1) * m;
  }
  R.camera.position.set(R.camPos.x + sx, R.camPos.y + sy, R.camPos.z);
  R.camera.lookAt(R.camTgt.x + sx, R.camTgt.y + sy, R.camTgt.z);
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

// The aim guide (the 2D game's: 18 dots up the ramp, bouncing off the rails) and the power meter.
function drawAim(c) {
  const f = S.drag ? flick(S.drag) : null;
  const a = f ? f.a : S.aim, pw = f ? f.p : (S.charging ? S.power : -1);
  let x = 0, y = 0, vx = Math.tan(a);
  const e = LANE - BALL_R;
  for (let i = 0; i < 18; i++) {
    y += 5; x += vx * 5;
    if (Math.abs(x) > e) { x = Math.sign(x) * e; vx = -vx; }
    const p = toScreen(x, laneH(y) + 0.25, -y * LS);
    if (!p.ok) continue;
    const r = clamp(3 - i * 0.1, 1.4, 3);
    c.fillStyle = "rgba(8,32,95,.6)"; c.beginPath(); c.arc(p.x, p.y, r + 1, 0, TAU); c.fill();
    c.fillStyle = i === 17 ? "#ffd23f" : "#ffffff"; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.fill();
  }
  if (pw >= 0) {
    const mx = 14, top = 300, hgt = 150, pc = clamp(pw, 0, 1.1) / 1.1, hump = 0.25 / 1.1;
    rrect(c, mx - 3, top - 3, 20, hgt + 6, 6); c.fillStyle = "rgba(8,32,95,.82)"; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = "#ffffff"; c.stroke();
    c.save(); rrect(c, mx, top, 14, hgt, 4); c.clip();
    c.fillStyle = "#12296e"; c.fillRect(mx, top, 14, hgt);
    c.fillStyle = pc < hump ? "#8e93a2" : pc > 0.8 ? "#ff3b2e" : pc > 0.5 ? "#ffd21f" : "#3fe0ff";
    c.fillRect(mx, top + hgt * (1 - pc), 14, hgt * pc);
    c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(mx + 2, top, 3, hgt);
    c.restore();
    c.fillStyle = "#ffffff"; c.fillRect(mx - 5, top + hgt * (1 - hump) - 1, 24, 2);   // below this line it won't clear the hump
    txt(c, "HUMP", mx + 21, top + hgt * (1 - hump) - 5, 8, "#ffffff", "left", "#08205f");
    txt(c, "PWR", mx + 7, top + hgt + 7, 9, "#ffffff", "center", "#08205f");
  }
}

function drawHUD(c, state) {
  const HB = 56;
  const bg = c.createLinearGradient(0, 0, 0, HB);
  bg.addColorStop(0, "#3d8cff"); bg.addColorStop(0.5, "#1b5fe0"); bg.addColorStop(1, "#0b3aa6");
  c.fillStyle = bg; c.fillRect(0, 0, W, HB);
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 0, W, 2);
  c.fillStyle = "#ff9214"; c.fillRect(0, HB, W, 2);
  c.fillStyle = "#ffe45c"; c.fillRect(0, HB + 2, W, 1);
  txt(c, "SCORE", 10, 5, 9, "#a8ecff", "left", "#08205f");
  txt(c, String(S.score), 10, 17, 19, "#ffe45c", "left", "#08205f");
  txt(c, "BALL", 124, 5, 9, "#a8ecff", "center", "#08205f");
  txt(c, Math.min(BALLS, S.ball + 1) + "/" + BALLS, 124, 17, 17, "#ffffff", "center", "#08205f");
  drawScript(c, R.script, 204, 21, 74, 30);
  // the ticket counter, and the strip it feeds out down the side of the screen
  txt(c, "TICKETS", W - 10, 4, 8, "#a8ecff", "right", "#08205f");
  rrect(c, W - 72, 15, 62, 25, 5); c.fillStyle = "#140606"; c.fill(); c.lineWidth = 1.5; c.strokeStyle = "#ff9214"; c.stroke();
  c.font = "bold 17px " + '"Courier New", Courier, monospace'; c.textAlign = "right"; c.textBaseline = "middle";
  c.fillStyle = "rgba(255,75,62,.18)"; c.fillText("8888", W - 15, 28);
  c.fillStyle = "#ff4b3e"; c.fillText(("0000" + S.shown).slice(-4), W - 15, 28);
  const n = Math.min(26, S.shown), sway = Shell.reduced ? 0 : Math.sin(R.clock * 2.2) * 1.5;
  for (let k = 0; k < n; k++) {
    const ty = HB + 4 + k * 8, tx = W - 34 + Math.sin(k * 0.7) * 1.5 + sway * k / 12;
    if (ty > H - 8) break;
    c.fillStyle = k % 2 ? "#ff9a3e" : "#ffb85e"; c.fillRect(tx, ty, 18, 7);
    c.fillStyle = "rgba(120,40,0,.45)"; c.fillRect(tx + 8, ty + 1, 2, 5);
  }
  // warmup / bumper status along the bottom of the bar
  const note = !S.bumperOn ? "WARMUP GAME " + Math.min(WARMUP_GAMES, gamesPlayed + 1) + "/" + WARMUP_GAMES : bumperActive() ? "BUMPER ACTIVE" : "BUMPER FROM BALL 4";
  const on = bumperActive() && state !== "title";
  rrect(c, 10, 42, 248, 11, 5); c.fillStyle = on ? "rgba(255,63,164,.9)" : "rgba(5,20,70,.55)"; c.fill();
  txt(c, note, 134, 43, 8, on ? "#ffffff" : "#ffe45c", "center");
}

function draw(c, state) {
  Juke.pump();
  if (!R || !R.hud) return;
  const now = performance.now();
  let ms = now - R.lastT;
  R.lastT = now;
  if (!(ms > 0)) ms = 0;
  const sized = layout();
  if (state === "paused" && !R.dirty) return;
  if (state === "playing") watchFrameRate(ms);
  const fdt = state === "paused" ? 0 : Math.min(ms, 50) / 1000;
  if (sized) {
    syncScene(state, fdt);
    R.renderer.render(R.scene, R.camera);
    R.dirty = false;
  }
  c.clearRect(-24, -24, W + 48, H + 48);
  for (let i = 0; i < parts.length; i++) { c.fillStyle = parts[i].c; c.fillRect(parts[i].x, parts[i].y, 3, 3); }
  drawHUD(c, state);
  if (state === "playing" && S.phase === "aim") drawAim(c);
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
      else {
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
  hud.style.background = "transparent";
  if (getComputedStyle(hud).position === "static") hud.style.position = "relative";
  const crt = stage.querySelector(".np-crt");
  if (crt) crt.style.display = "none";                       // glossy cabinet, no scanlines
  R.lastT = performance.now();
  layout();
}

function startGame() {
  Shell.init({
    slug: "ticket-roll-alley",
    title: "TICKET ROLL ALLEY",
    accent: "#3ff0ff",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "Nine balls, one ramp, and the 100-point cup in the corner, now in real 3D. Flick up to roll: a longer flick rolls harder. Angle the flick to aim.",
    keys: "Keys: left and right aim, hold Space for power, release to roll. P pause, M mute, N music, R restart.",
    tip: "Every 10 points spools a ticket. Tickets pile up in your jar between games.",
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
  document.addEventListener("keydown", function (e) {
    const el = e.target, typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));   // not while initials are being typed
    if (e.code === "KeyN" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) Juke.toggleMusic();
  });
  const titleCard = document.querySelector("#np-ov-title .np-card"), pauseActions = document.querySelector("#np-ov-pause .np-actions");
  if (titleCard) Juke.button(titleCard, titleCard.querySelector(".np-tip"));
  if (pauseActions) Juke.button(pauseActions, pauseActions.querySelector("a"));
  // The studio logo heads the score card (the splash is the logo moment before the title card).
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

// Hook for automated checks (no effect on play). The first four are the 2D game's.
window.__ticketRoll = { S: function () { return S; }, roll: roll, landing: landing, settle: settle,
                        gfx: function () { return R; }, led: function () { return LED; }, view: function () { return V; },
                        juke: Juke, music: startMusic, boardPos: boardPos, lanePos: lanePos, cam: CAM, near: NEAR };

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
      try { R.renderer.compile(R.scene, R.camera); } catch (e) { /* warm-up only */ }
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
      R = null; LED = null;
      loadClassic().then(function () { splashGone(splash); }, function () {
        splashFail(splash, e && e.npStage === "three"
          ? "Ticket Roll Alley could not load its 3D engine (" + THREE_URL + ")."
          : "Ticket Roll Alley needs WebGL for its 3D cabinet, and this browser has it switched off or does not support it.");
      });
    });
})();
