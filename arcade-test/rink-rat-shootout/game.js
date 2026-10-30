/* RINK RAT SHOOTOUT: you vs The Shelf Guardian. Three 30-second periods.
   Goal plane units are feet: x across (-3..3 is the net), y up (0..4 is the net). */
(function () {
  "use strict";
  var W = 360, H = 540, TAU = Math.PI * 2;
  var GX = 180, GY = 252, PX = 31;                    // goal plane to screen: x = GX + x*PX, y = GY - y*PX
  var NET_W = 3, NET_H = 4, POST = 0.16;
  var PERIODS = 3, PERIOD_LEN = 30;
  var REACT = [0.24, 0.17, 0.12], GSPEED = [8.5, 10.5, 12.5], GREACH = 1.6;
  var POKE_AFTER = 2.2, SLOT = 1;
  var SAVES = ["Is it on the shelf? Not yours.", "Already in his collection.", "Denied. Mint condition.", "Not for sale."];

  var S = {}, keys = {}, idleT = 0, parts = [];
  var X = window.NPX && window.NPX.on ? window.NPX : null;   // test-only extras (shared/extras.js)
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function reset() {
    S = { t: 0, pt: 0, period: 0, clock: PERIOD_LEN, phase: "ready", px: 0, g: 0, gy: 0, aimY: 1.2, kb: false,
          drag: null, shot: null, goals: 0, points: 0, tops: 0, posts: 0, saves: 0, shots: 0, streak: 0, bestStreak: 0,
          per: [0, 0, 0], frontT: 0, pokes: 0, net: 0, saveIdx: 0 };
    parts.length = 0;
    if (X) S.x = { sc: X.scenery(), fever: new X.Fever(15), sched: new X.Scheduler(18, 30, 2), rare: null, rares: 0, intro: false, fast: false, distract: false, bonusNext: 0 };
  }

  function period() { return Math.min(PERIODS - 1, S.period); }
  function goalieHome() { return clamp(S.px * 0.85, -1.2, 1.2); }

  // Is the point (x, y) on the goal plane covered by a goalie centered at g?
  function covered(x, y, g, drop) {
    var d = x - g;
    if (Math.abs(d) < 0.85 && y < 3.3) return "body";
    if (Math.abs(d) < 0.55 && y < 3.9) return "mask";
    if (y < (drop ? 1.0 : 0.6) && Math.abs(d) < (drop ? 2.1 : 1.3)) return "pads";
    if (d < -0.85 && d > -1.85 && y > 1.4 && y < 3.05) return "glove";
    if (d > 0.85 && d < 1.85 && y > 0.9 && y < 2.55) return "blocker";
    return "";
  }

  /* ---------------- Shooting ---------------- */
  function canShoot() { return S.phase === "ready" && S.pt > 0.15; }

  function shoot(ax, ay, len) {
    if (!canShoot()) return;
    var T = 0.42 - clamp(len, 0, 1) * 0.12;
    if (S.x) { if (S.x.sc.id === "rain") T += 0.04; if (S.x.fast) { T -= 0.06; S.x.fast = false; } }
    S.shot = { x: ax, y: ay, T: T, t: 0, fromX: S.px, res: null, gStart: S.g, distract: !!(S.x && S.x.distract) };
    if (S.x) S.x.distract = false;
    S.shots++;
    S.phase = "shot"; S.pt = 0; S.frontT = 0;
    S.drag = null;
    Shell.sfx("whoosh"); Shell.noise(0.05, 0.5, 2600, 1);
  }

  function resolve() {
    var sh = S.shot, x = sh.x, y = sh.y, ax = Math.abs(x), res;
    var drop = y < 1.3;
    if ((Math.abs(ax - NET_W) < POST && y < NET_H + POST) || (ax < NET_W + POST && Math.abs(y - NET_H) < POST)) res = "post";
    else if (ax > NET_W || y > NET_H) res = "wide";
    else if (covered(x, y, S.g, drop)) res = "save";
    else res = "goal";
    sh.res = res;
    var p = period();
    if (res === "goal") {
      var top = ax > 2.0 && y > 2.85;
      var pts = top ? 2 : 1;
      if (S.x && S.x.bonusNext) { pts += S.x.bonusNext; S.x.bonusNext = 0; }
      S.goals++; S.points += pts; S.per[p]++; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak);
      if (top) S.tops++;
      S.net = 1;
      Shell.flash(top ? "TOP SHELF!" : "GOAL!", top ? "Top corner counts 2." : "+1", top ? "#ffd23f" : "#3ff0ff", 900);
      Shell.sfx("score"); Shell.sfx("crowd"); Shell.tone(330, 0.5, "sawtooth", 0.12);
      burst(GX + x * PX, GY - y * PX, top ? 30 : 14);
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
  }

  /* ---------------- Update ---------------- */
  function update(dt) {
    if (X && X.eventActive()) { X.eventTick(dt); return; }
    S.t += dt; S.pt += dt;
    var i, p = period();
    for (i = parts.length - 1; i >= 0; i--) { var q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 200 * dt; if (q.life <= 0) parts.splice(i, 1); }
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
      return;
    }

    var mv = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
    if (mv && S.phase === "ready") { S.px = clamp(S.px + mv * 1.6 * (S.x && S.x.fever.active() ? 2 : 1) * dt, -SLOT, SLOT); S.kb = true; }
    var up = (keys.ArrowUp ? 1 : 0) + (keys.ArrowDown ? -1 : 0);
    if (up) { S.aimY = clamp(S.aimY + up * 3.2 * dt, 0.2, 3.9); S.kb = true; }

    // goalie: squares up to the puck, then reacts to the shot after a short delay
    var target = goalieHome();
    var react = REACT[p] + (S.x && S.x.fever.active() ? 0.08 : 0) + (S.shot && S.shot.distract ? 0.2 : 0);
    if (S.phase === "shot" && S.shot.t > react) target = clamp(S.shot.x * 0.9, -GREACH, GREACH);
    var gv = GSPEED[p] * (S.phase === "shot" ? 1 : 0.5) * (S.x ? (S.x.sc.id === "golden" ? 0.9 : S.x.sc.id === "suburbs" ? 1.1 : 1) : 1);
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
        }
      } else S.frontT = Math.max(0, S.frontT - dt * 2);
      return;
    }
    if (S.phase === "poked") { if (S.pt > 0.9) { S.phase = "ready"; S.pt = 0; } return; }
    if (S.phase === "shot") {
      var sh = S.shot;
      sh.t += dt;
      if (!sh.res && sh.t >= sh.T) resolve();
      if (sh.t > sh.T + 0.55) { S.shot = null; S.phase = "ready"; S.pt = 0; }
    }
  }

  /* ---------------- Test-only extras ---------------- */
  var EVENTS = [
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
  function rareMult() { var sc = S.x.sc.id; return (sc === "suburbs" ? 3 : sc === "fog" ? 1.5 : 1) * (S.x.fever.active() ? 2 : 1); }
  function rareNow() {
    var it = X.rollRare(rareMult()), fake = S.x.sc.id === "twilight" && X.coin(0.35);
    X.collect(it, fake);
    if (fake) return "Thin shell, wrong screws. A reproduction.";
    S.x.rares++; return it.n + " (" + X.TIER[it.t].word + ").";
  }
  function extrasRare(x, y) {   // a goal that goes in near the taped-on cartridge collects it
    var r = S.x.rare;
    if (r && Math.hypot(x - r.x, y - r.y) < 0.8) { S.x.rare = null; var it = X.rollRare(rareMult()), fake = S.x.sc.id === "twilight" && X.coin(0.35); X.collect(it, fake); if (!fake) { S.x.rares++; S.points += 1; } }
  }
  function extrasTick(dt) {
    var x = S.x;
    if (!x.intro) { x.intro = true; Shell.flash(x.sc.name, x.sc.line, "#9bff3f", 1500); }
    x.fever.tick(dt);
    if (S.phase === "ready" && !S.drag && S.pt > 0.3 && x.sched.due(S.t)) X.startEvent(X.pick(EVENTS), { noSpace: true });   // Space shoots here, so it never picks a choice
    if (S.phase === "ready" && !x.rare && S.pt > 0.2 && Math.random() < dt * 0.06 * rareMult()) {
      var side = Math.random() < 0.5 ? -1 : 1;
      x.rare = { x: side * (1.9 + Math.random() * 0.8), y: 0.5 + Math.random() * 3.0, life: 9 };
    }
    if (x.rare && (x.rare.life -= dt) <= 0) x.rare = null;
  }

  function finish() {
    var extra = S.x ? row("Scenery (test)", S.x.sc.name) + row("Rare finds (test)", S.x.rares + " this run, " + X.foundCount() + " of " + X.RARES.length + " found") + row("Hot Streaks (test)", S.x.fever.count) : "";
    Shell.gameOver(S.points, { title: "FINAL HORN", html:
      row("Goals", S.goals + " of " + S.shots + " shots") + row("Top corners", S.tops) + row("Posts", S.posts) +
      row("By period", S.per.join("  /  ")) + row("Longest scoring streak", S.bestStreak) + extra,
      stats: { points: S.points, goals: S.goals, tops: S.tops, posts: S.posts, shots: S.shots, per: S.per.slice(), bestStreak: S.bestStreak, pokes: S.pokes } });
  }
  function row(a, b) { return '<div class="np-row"><span>' + a + '</span><b>' + b + '</b></div>'; }
  function burst(x, y, n) {
    var cols = ["#3ff0ff", "#ffd23f", "#ff3fa4", "#eceae2"];
    if (Shell.reduced) n = Math.ceil(n / 3);
    for (var i = 0; i < n; i++) { var a = Math.random() * TAU, s = 40 + Math.random() * 120; parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.9, c: cols[i % 4] }); }
  }

  /* ---------------- Input ---------------- */
  // One gesture: slide sideways to move across the slot, then flick up to shoot.
  function pointer(type, x, y) {
    if (X && X.eventActive()) { X.eventPointer(type, x, y); return; }
    if (type === "down") {
      if (!canShoot()) return;
      S.drag = { sx: x, sy: y, ox: x, oy: y, px0: S.px, mode: "slide", x: x, y: y }; S.kb = false;
    } else if (type === "move" && S.drag) {
      var d = S.drag; d.x = x; d.y = y;
      if (d.mode === "slide") {
        if (y > d.oy) { d.oy = y; d.ox = x; }
        if (d.oy - y > 16) d.mode = "flick";
        else S.px = clamp(d.px0 + (x - d.sx) / 110, -SLOT, SLOT);
      }
    } else if ((type === "up" || type === "cancel") && S.drag) {
      var dd = S.drag; S.drag = null;
      if (type === "cancel" || dd.mode !== "flick") return;
      var f = flick(dd);
      if (f) shoot(f.x, f.y, f.len);
    }
  }
  function flick(d) {
    var dy = d.oy - d.y, dx = d.x - d.ox;
    if (dy < 24) return null;
    var len = Math.hypot(dx, dy);
    return { x: S.px * 1.3 + clamp(dx / dy, -1.2, 1.2) * 3.4, y: clamp((len - 40) / 170 * 4.4, 0, 4.6), len: clamp(len / 240, 0, 1) };
  }
  function key(type, code, e) {
    if (X && X.eventActive()) { keys = {}; X.eventKey(type, code); return; }
    var act = code === "Space" || code === "Enter" || code === "NumpadEnter";
    if (type === "down") {
      keys[code] = true;
      if (act && !e.repeat && canShoot()) { S.kb = true; shoot(S.px * 2.85, S.aimY, 0.7); }
    } else keys[code] = false;
  }

  /* ---------------- Drawing ---------------- */
  function fr(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function sx(x) { return GX + x * PX; }
  function sy(y) { return GY - y * PX; }

  function drawRink(c, t) {
    var g = c.createLinearGradient(0, 60, 0, H);
    g.addColorStop(0, "#c9d8e4"); g.addColorStop(1, "#eef4f8");
    c.fillStyle = g; c.fillRect(0, 60, W, H - 60);
    fr(c, 0, 60, W, 70, "#1a1d2b");                 // crowd behind the glass
    for (var i = 0; i < 70; i++) fr(c, (i * 53) % W, 66 + (i * 17) % 56, 4, 4, ["#ff4b3e", "#3ff0ff", "#ffd23f", "#a77bff", "#eceae2"][i % 5]);
    fr(c, 0, 128, W, 4, "#ffd23f");                  // boards
    fr(c, 0, 132, W, 14, "#eceae2");
    Shell.uiText(c, "PAWN  SWAP  TRADE", 60, 134, 9, "#2c3040");
    Shell.uiText(c, "BUY  SELL  COLLECT", 230, 134, 9, "#2c3040");
    // goal line + crease
    fr(c, 0, GY + 2, W, 3, "#d8424a");
    c.fillStyle = "rgba(63,140,240,.35)";
    c.beginPath(); c.ellipse(GX, GY + 4, 120, 46, 0, 0, Math.PI); c.fill();
    c.strokeStyle = "#d8424a"; c.lineWidth = 2; c.beginPath(); c.ellipse(GX, GY + 4, 120, 46, 0, 0, Math.PI); c.stroke();
    // slot hash marks + blue line
    fr(c, 0, 420, W, 4, "rgba(63,120,240,.6)");
    fr(c, GX - 2, 300, 4, 8, "rgba(216,66,74,.6)");
  }

  function drawNet(c) {
    var l = sx(-NET_W), r = sx(NET_W), top = sy(NET_H), bot = sy(0), bulge = S.net * 8;
    fr(c, l + 6, top + 6, r - l - 12, bot - top - 6, "rgba(255,255,255,.55)");
    c.strokeStyle = "rgba(120,130,150,.55)"; c.lineWidth = 1;
    for (var x = l + 6; x < r - 4; x += 9) { c.beginPath(); c.moveTo(x, top + 6); c.lineTo(x + (x - GX) * 0.02, bot - bulge * 0.2); c.stroke(); }
    for (var y = top + 6; y < bot; y += 9) { c.beginPath(); c.moveTo(l + 6, y); c.lineTo(r - 6, y); c.stroke(); }
    c.strokeStyle = "#d8424a"; c.lineWidth = 5;
    c.beginPath(); c.moveTo(l, bot); c.lineTo(l, top); c.lineTo(r, top); c.lineTo(r, bot); c.stroke();
  }

  function drawGoalie(c, t) {
    var g = S.g, drop = S.phase === "shot" && S.shot && S.shot.y < 1.3 && S.shot.t > REACT[period()];
    var cx = sx(g);
    function box(x0, y0, x1, y1, col) { fr(c, sx(g + x0), sy(y1), (x1 - x0) * PX, (y1 - y0) * PX, col); }
    // pads
    if (drop) { box(-2.1, 0, -0.2, 1.0, "#eceae2"); box(0.2, 0, 2.1, 1.0, "#eceae2"); box(-2.1, 0.75, 2.1, 0.85, "#ff4b3e"); }
    else { box(-1.1, 0, -0.15, 1.6, "#eceae2"); box(0.15, 0, 1.1, 1.6, "#eceae2"); box(-1.1, 0.4, 1.1, 0.5, "#ff4b3e"); }
    // body + jersey
    box(-0.85, drop ? 0.9 : 1.5, 0.85, 3.3, "#2f3b7a");
    box(-0.85, 2.4, 0.85, 2.6, "#ffd23f");
    Shell.uiText(c, "SG", cx, sy(2.2), 10, "#eceae2", "center");
    // mask
    box(-0.5, 3.3, 0.5, 3.9, "#eceae2");
    box(-0.35, 3.45, 0.35, 3.75, "#1b1c22");
    // glove (his right is your left) and blocker
    box(-1.85, 1.6, -0.85, 3.0, "#a77bff"); box(-1.75, 2.2, -1.0, 2.9, "#c9b2ff");
    box(0.85, 1.0, 1.85, 2.5, "#a77bff");
    fr(c, sx(g + 1.2), sy(0.9), 3, 0.9 * PX, "#3a2410"); // stick
  }

  function drawPlayer(c) {
    var x = 180 + S.px * 120, y = 470;
    fr(c, x - 12, y - 30, 24, 30, "#ff4b3e");
    fr(c, x - 12, y - 12, 24, 4, "#eceae2");
    fr(c, x - 9, y - 42, 18, 12, "#e0a070");
    fr(c, x - 11, y - 46, 22, 8, "#ff4b3e");
    fr(c, x - 10, y, 8, 20, "#1b1c22"); fr(c, x + 2, y, 8, 20, "#1b1c22");
    fr(c, x - 14, y + 20, 12, 4, "#8e93a2"); fr(c, x + 2, y + 20, 12, 4, "#8e93a2");
    c.strokeStyle = "#3a2410"; c.lineWidth = 4; c.beginPath(); c.moveTo(x + 10, y - 20); c.lineTo(x + 24, y + 26); c.lineTo(x + 6, y + 30); c.stroke();
    if (S.phase === "ready") fr(c, x - 4, y + 26, 10, 5, "#101219");
  }

  function drawPuck(c) {
    var sh = S.shot; if (!sh) return;
    var k = clamp(sh.t / sh.T, 0, 1), sx0 = 180 + sh.fromX * 120, sy0 = 498;
    var tx = sx(sh.x), ty = sy(sh.y), x, y;
    if (!sh.res || k < 1) { x = sx0 + (tx - sx0) * k; y = sy0 + (ty - sy0) * k - Math.sin(k * Math.PI) * 10; }
    else {
      var a = (sh.t - sh.T) / 0.55;
      if (sh.res === "goal") { x = tx; y = ty + a * 6; }
      else if (sh.res === "wide") { x = tx + (tx - 180) * a * 0.8; y = ty - a * 30; }
      else { x = tx + (sh.x < S.g ? -1 : 1) * a * 90; y = ty + a * 120 - a * a * 80; }
    }
    var r = 6 - 3 * k;
    fr(c, x - r, y - r * 0.5, r * 2, r, "#101219");
  }

  function drawAim(c) {
    var f = S.drag && S.drag.mode === "flick" ? flick(S.drag) : null;
    var x = f ? f.x : S.px * 2.85, y = f ? f.y : S.aimY;
    if (!f && !S.kb) return;
    var X = sx(clamp(x, -3.6, 3.6)), Y = sy(clamp(y, 0, 4.6));
    c.strokeStyle = "#ffd23f"; c.lineWidth = 2;
    c.beginPath(); c.arc(X, Y, 7, 0, TAU); c.stroke();
    fr(c, X - 1, Y - 11, 2, 6, "#ffd23f"); fr(c, X - 1, Y + 5, 2, 6, "#ffd23f");
    fr(c, X - 11, Y - 1, 6, 2, "#ffd23f"); fr(c, X + 5, Y - 1, 6, 2, "#ffd23f");
  }

  function drawHUD(c) {
    fr(c, 0, 0, W, 58, "rgba(13,15,21,.95)");
    fr(c, 0, 58, W, 2, "#2c3040");
    Shell.text(c, "POINTS", 10, 8, 8, "#8e93a2");
    Shell.text(c, String(S.points), 10, 22, 16, "#ffd23f");
    var cl = Math.ceil(Math.max(0, S.clock));
    Shell.text(c, "PERIOD " + Math.min(PERIODS, S.period + 1), W / 2, 8, 8, "#eceae2", "center");
    Shell.text(c, "0:" + ("0" + cl).slice(-2), W / 2, 22, 16, cl <= 5 ? "#ff4b3e" : "#eceae2", "center");
    Shell.text(c, "GOALS", W - 10, 8, 8, "#8e93a2", "right");
    Shell.text(c, String(S.goals), W - 10, 22, 16, "#3ff0ff", "right");
    Shell.uiText(c, "THE SHELF GUARDIAN", W / 2, 44, 9, "#a77bff", "center");
    if (period() === 2 && S.phase === "ready" && S.frontT > 0.8) Shell.uiText(c, "MOVE OR GET POKED", W / 2, 400, 10, "#ff3fa4", "center");
  }

  function draw(c, state) {
    var t = (state === "title" || state === "over") ? idleT : S.t;
    drawRink(c, t);
    drawNet(c);
    var sh = S.shot, behind = sh && sh.res === "goal" && sh.t > sh.T;
    if (behind) drawPuck(c);
    drawGoalie(c, t);
    if (!behind) drawPuck(c);
    if (S.x && S.x.rare) X.drawCart(c, sx(S.x.rare.x), sy(S.x.rare.y), "rare", t, 0.75);
    drawPlayer(c);
    for (var i = 0; i < parts.length; i++) fr(c, parts[i].x, parts[i].y, 3, 3, parts[i].c);
    if (S.x) {
      var area = { x: 0, y: 60, w: W, h: H - 60 };
      X.drawScenery(c, S.x.sc, t, area);
      if (S.x.sc.id === "fog") { c.fillStyle = "rgba(225,232,240,.28)"; c.fillRect(sx(-NET_W) - 20, sy(NET_H) - 20, NET_W * 2 * PX + 40, NET_H * PX + 30); }
      S.x.fever.draw(c, area, t);
    }
    drawHUD(c);
    if (state === "playing" && S.phase === "ready") drawAim(c);
    if (S.x) { X.drawTag(c, S.x.sc, 10, H - 12); X.drawEvent(c, W, H); }
  }

  // Hook for automated checks (no effect on play)
  window.__rink = { S: function () { return S; }, update: update, shoot: shoot, covered: covered };

  Shell.init({
    slug: "rink-rat-shootout",
    title: "RINK RAT SHOOTOUT",
    accent: "#3ff0ff",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "You vs The Shelf Guardian, three 30-second periods. Slide sideways to move, then flick up at the net. Angle the flick to aim, a longer flick goes higher.",
    keys: "Keys: left and right skate (and aim to that side), up and down aim high or low, Space shoots. P pause, M mute, R restart.",
    tip: "Top corners count 2. In period 3, don't park in front of him.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: function (dt) { idleT += dt; },
    onPause: function () { keys = {}; S.drag = null; }
  });
})();
