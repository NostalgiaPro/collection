/* TABLE RINK RUMBLE: first to 7 on the rec room table. Beat one collector, the next one sits down. */
(function () {
  "use strict";
  var W = 360, H = 540, TAU = Math.PI * 2;
  var X0 = 24, X1 = 336, Y0 = 68, Y1 = 528, MID = (Y0 + Y1) / 2, GOAL = 66;   // GOAL is half the goal mouth
  var PR = 22, KR = 13, TO_WIN = 7;
  var OPP = [
    { name: "The Box Lot Guy", speed: 230, reach: 0.38, jitter: 34, think: 0.24, track: 0.3 },
    { name: "The Reseller", speed: 290, reach: 0.48, jitter: 24, think: 0.19, track: 0.45 },
    { name: "The Mint Sealed Purist", speed: 350, reach: 0.58, jitter: 16, think: 0.15, track: 0.6 },
    { name: "The Flea Market Shark", speed: 410, reach: 0.66, jitter: 11, think: 0.12, track: 0.7 },
    { name: "The Estate Sale Early Bird", speed: 460, reach: 0.72, jitter: 8, think: 0.1, track: 0.8 }
  ];

  var S = {}, keys = {}, idleT = 0, parts = [];
  var X = window.NPX && window.NPX.on ? window.NPX : null;   // test-only extras (shared/extras.js)
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

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
    }
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
  }

  /* ---------------- Test-only extras ---------------- */
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
    Shell.gameOver(score, { title: "TABLE CLOSED", html:
      row("Matches won in a row", S.wins) + row("Best winning margin", S.bestMargin ? "+" + S.bestMargin : "None") +
      row("Lost to", opp().name) + row("Goals for / against", S.goals + " / " + S.conceded) +
      (S.x ? row("Scenery (test)", S.x.sc.name) + row("Rare finds (test)", S.x.rares + " this run, " + X.foundCount() + " of " + X.RARES.length + " found") + row("Hot Streaks (test)", S.x.fever.count) : ""),
      stats: { wins: S.wins, bestMargin: S.bestMargin, goals: S.goals, conceded: S.conceded, fastest: S.fastest ? Math.round(S.fastest) : undefined,   // undefined until a win, so rewards.js skips it (0 would look like a record)
      lastOpponent: S.match } });
  }
  function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }
  function burst(x, y, n, col) {
    if (Shell.reduced) n = Math.ceil(n / 3);
    for (var i = 0; i < n; i++) { var a = Math.random() * TAU, s = 40 + Math.random() * 140; parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7, c: i % 2 ? col : "#eceae2" }); }
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
      var mine = pMax * (S.x ? (S.x.fever.active() && (mv.x || mv.y) ? 2 : 1) * (S.x.sticky > 0 ? 0.6 : 1) : 1);   // test-only extras: Hot Streak, sticky paddle
      movePaddle(S.p, sdt, mine, MID + PR, Y1 - PR);
      movePaddle(S.c, sdt, o.speed * (1 + S.boost) * cpuMult(), Y0 + PR, MID - PR);
      if (S.phase === "play") { stepPuck(sdt); hit(S.p, "me"); hit(S.c, "cpu"); unstick(sdt); }
      if (S.phase !== "play") break;
    }
  }

  /* ---------------- Input ---------------- */
  /* Controls. Mouse and pen: the mallet goes straight to the pointer, no offset.
     Touch: relative drag. The mallet moves by the finger's movement from wherever the touch starts (x1.2),
     so the finger can rest low on the screen, below the rink, and never covers the mallet. */
  var P_FAST = 7000, TOUCH_GAIN = 1.2, drag = null;
  function clampHalfX(x) { return clamp(x, X0 + PR, X1 - PR); }
  function clampHalfY(y) { return clamp(y, MID + PR, Y1 - PR); }
  function pointer(type, x, y, e) {
    if (X && X.eventActive()) { drag = null; X.eventPointer(type, x, y); return; }
    var touch = e && e.pointerType === "touch";
    if (!touch) {
      drag = null;
      if (type === "down" || type === "move") { S.p.tx = clampHalfX(x); S.p.ty = clampHalfY(y); }
      return;
    }
    if (type === "down") { drag = { fx: x, fy: y, mx: S.p.x, my: S.p.y }; return; }
    if (type === "move" && drag) {
      var tx = drag.mx + (x - drag.fx) * TOUCH_GAIN, ty = drag.my + (y - drag.fy) * TOUCH_GAIN;
      var cx = clampHalfX(tx), cy = clampHalfY(ty);
      // re-anchor at the rails so turning back responds at once instead of after the "dead" distance
      if (cx !== tx) drag.mx += cx - tx;
      if (cy !== ty) drag.my += cy - ty;
      S.p.tx = cx; S.p.ty = cy;
      return;
    }
    if (type === "up" || type === "cancel") drag = null;
  }
  /* Rink sits at the top of the stage; the empty space under it is a touch pad that drives the mallet too. */
  function bindTouchPad() {
    var cv = document.querySelector(".np-stage canvas"), stage = cv && cv.parentElement;
    if (!stage) return;
    stage.style.alignItems = "flex-start";
    stage.style.paddingTop = "4px";
    stage.style.touchAction = "none";
    var pid = null;
    function local(ev) { var r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) / (r.width / W), y: (ev.clientY - r.top) / (r.height / H) }; }
    function mine(ev) { return ev.target === stage || (ev.target && ev.target.classList && ev.target.classList.contains("np-crt")); }
    stage.addEventListener("pointerdown", function (ev) {
      if (!mine(ev) || ev.pointerType !== "touch" || pid !== null || Shell.state() !== "playing") return;
      ev.preventDefault(); pid = ev.pointerId;
      try { stage.setPointerCapture(ev.pointerId); } catch (er) { }
      var q = local(ev); pointer("down", q.x, q.y, ev);
    });
    stage.addEventListener("pointermove", function (ev) {
      if (ev.pointerId !== pid) return;
      if (Shell.state() !== "playing") { pid = null; drag = null; return; }
      var q = local(ev); pointer("move", q.x, q.y, ev);
    });
    function end(ev) { if (ev.pointerId !== pid) return; pid = null; pointer("up", 0, 0, ev); }
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
  }
  function key(type, code) {
    if (X && X.eventActive()) { for (var kk in keys) keys[kk] = false; X.eventKey(type, code); return; }
    keys[code] = type === "down";
  }

  /* ---------------- Drawing ---------------- */
  function fr(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function circ(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function drawTable(c) {
    fr(c, 0, 0, W, H, "#0e0f14");
    fr(c, X0 - 10, Y0 - 10, X1 - X0 + 20, Y1 - Y0 + 20, "#2c3040");
    fr(c, X0, Y0, X1 - X0, Y1 - Y0, "#14306a");
    for (var y = Y0 + 12; y < Y1; y += 16) for (var x = X0 + 12; x < X1; x += 16) fr(c, x, y, 2, 2, "#1d3f84");
    fr(c, X0, MID - 1, X1 - X0, 3, "#ff4b3e");
    c.strokeStyle = "#ff4b3e"; c.lineWidth = 2; c.beginPath(); c.arc(180, MID, 42, 0, TAU); c.stroke();
    c.strokeStyle = "rgba(63,240,255,.5)"; c.beginPath(); c.arc(180, Y1, 70, Math.PI, TAU); c.stroke();
    c.strokeStyle = "rgba(255,63,164,.5)"; c.beginPath(); c.arc(180, Y0, 70, 0, Math.PI); c.stroke();
    fr(c, 180 - GOAL, Y0 - 10, GOAL * 2, 10, "#050607");
    fr(c, 180 - GOAL, Y1, GOAL * 2, 10, "#050607");
    fr(c, X0 - 10, Y0 - 12, X1 - X0 + 20, 2, "#ff3fa4");
    fr(c, X0 - 10, Y1 + 10, X1 - X0 + 20, 2, "#3ff0ff");
  }
  function drawPaddle(c, pd, col, hi) {
    circ(c, pd.x + 2, pd.y + 3, PR, "rgba(0,0,0,.35)");
    circ(c, pd.x, pd.y, PR, col); circ(c, pd.x, pd.y, PR - 6, hi); circ(c, pd.x, pd.y, 8, col);
  }
  function drawHUD(c) {
    fr(c, 0, 0, W, 54, "rgba(13,15,21,.95)");
    var o = opp();
    Shell.uiText(c, "MATCH " + (S.match + 1) + "  VS", 10, 6, 9, "#8e93a2");
    Shell.uiText(c, o.name, 10, 18, 11, "#ff3fa4");
    Shell.text(c, S.cpu + "", W - 70, 8, 14, "#ff3fa4", "right");
    Shell.text(c, "-", W - 58, 8, 14, "#8e93a2", "center");
    Shell.text(c, S.me + "", W - 46, 8, 14, "#3ff0ff");
    Shell.uiText(c, "FIRST TO " + TO_WIN, W - 10, 30, 9, "#8e93a2", "right");
    Shell.uiText(c, "STREAK " + S.wins, 10, 36, 9, "#ffd23f");
  }
  function draw(c, state) {
    drawTable(c);
    if (S.x && S.x.sc.id === "rain") S.x.puddles.forEach(function (p) { c.fillStyle = "rgba(120,170,255,.28)"; c.beginPath(); c.ellipse(p.x, p.y, p.r, p.r * 0.7, 0, 0, TAU); c.fill(); });
    if (S.x && S.x.rare) X.drawCart(c, S.x.rare.x, S.x.rare.y, S.x.rare.tier.t, S.t, 0.8);
    if (S.phase === "face" || S.phase === "play") circ(c, S.k.x + 2, S.k.y + 3, KR, "rgba(0,0,0,.35)");
    if (S.phase !== "next" && S.phase !== "lost") { circ(c, S.k.x, S.k.y, KR, "#eceae2"); circ(c, S.k.x, S.k.y, KR - 4, "#ff4b3e"); }
    drawPaddle(c, S.c, "#ff3fa4", "#a8256a");
    drawPaddle(c, S.p, "#3ff0ff", "#1f8a93");
    for (var i = 0; i < parts.length; i++) fr(c, parts[i].x, parts[i].y, 3, 3, parts[i].c);
    if (S.x) {
      var area = { x: X0 - 10, y: Y0 - 12, w: X1 - X0 + 20, h: Y1 - Y0 + 24 };
      if (S.x.sc.id === "fog") { c.fillStyle = "rgba(225,232,240,.35)"; c.fillRect(X0, Y0, X1 - X0, MID - Y0 - 30); }
      X.drawScenery(c, S.x.sc, S.t, area);
      if (S.x.dark > 0) { c.fillStyle = "rgba(0,0,0,.45)"; c.fillRect(area.x, area.y, area.w, area.h); }
      S.x.fever.draw(c, area, S.t);
    }
    drawHUD(c);
    if (S.x) { X.drawTag(c, S.x.sc, 10, H - 12); X.drawEvent(c, W, H); }
  }

  // Hook for automated checks (no effect on play)
  window.__table = { S: function () { return S; }, update: update, OPP: OPP };

  Shell.init({
    slug: "table-rink-rumble",
    title: "TABLE RINK RUMBLE",
    accent: "#ff3fa4",
    width: W, height: H,
    format: function (n) { var w = Math.floor(n / 10), m = n % 10; return w + "W" + (m ? " +" + m : ""); },
    howTo: "First to 7 on the rec room table. Drag anywhere, even below the table, and your paddle moves with your finger. Beat one collector and the next one sits down.",
    keys: "Keys: arrows move the paddle. Mouse: just move it. P pause, M mute, R restart.",
    tip: "Best score is your win streak, plus your biggest winning margin.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { for (var k in keys) keys[k] = false; drag = null; }
  });
  bindTouchPad();
})();
