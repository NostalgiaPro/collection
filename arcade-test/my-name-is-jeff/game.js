/* MY NAME IS JEFF (seasonal: christmas, test path only)
   Jeff is a teal giraffe in a mustard store vest who works the floor at Wobblebrook Toys.
   December 1 to Christmas Eve: shoppers pull toys off a 4 by 4 wall of shelves, faster every day.
   Jeff walks the aisle and stretches his long neck up (or pulls it back down) to restock a shelf.

   Controls: tap a shelf or the stock board under the floor (phones), click a shelf (mouse),
   arrows or WASD (keyboard). Jeff restocks the shelf his head reaches; tap it again to top it up.
   Quick restocks in a chain build a combo (x2 to x5). Empty shelves and shoppers who leave
   with nothing drain the Cheer meter. Cheer at zero ends the run. Survive Christmas Eve to win. */
(function () {
  "use strict";
  var W = 360, H = 540, TAU = Math.PI * 2;
  var BAYS = 4, LEVELS = 4, CAP = 3;
  var BX0 = 10, BW = 85;                              // shelf bays: x 10 to 350
  var LVY = [312, 244, 176, 108];                     // slot centre y per level, 0 is the bottom shelf
  var FLOOR = 412, NECK_BASE = 360, BOARD_Y = 420, ROW = 30;
  var DAY_LEN = 11, DAYS = 24, COMBO_T = 1.0, PER_VISIT = 2;
  var JX_SPEED = 800, NECK_SPEED = 950;
  var STORE = "WOBBLEBROOK TOYS";
  var TOYS = [
    { id: "blocks", name: "STACKING BLOCKS" }, { id: "bear", name: "TEDDY BEAR" }, { id: "rocket", name: "TOY ROCKET" },
    { id: "yoyo", name: "YO-YO" }, { id: "robot", name: "WIND-UP ROBOT" }, { id: "train", name: "TOY TRAIN" },
    { id: "ball", name: "BEACH BALL" }, { id: "duck", name: "RUBBER DUCK" }, { id: "drum", name: "TOY DRUM" },
    { id: "top", name: "SPINNING TOP" }
  ];
  var DAY_LINES = [
    "", "Doors open. Nice and calm.", "Window display is up.", "The carolers found the parking lot.", "Lunch rush. Grab a pretzel.",
    "First snow of the season.", "Weekend crowd rolling in.", "Grandparents with lists.", "One week down. Neck is limber.",
    "Gift wrap line out the door.", "Bus tour of shoppers.", "School is out early.", "The radio will not stop jingling.",
    "Halfway to the holidays.", "Coupon day. Everyone came.", "Snow day. Nobody stayed home.", "The stockroom smells like cocoa.",
    "Big sale banner went up.", "Long lines, short tempers.", "Out of tape. Still going.", "Last minute rush begins.",
    "The mall is packed.", "Two days left. Hold steady.", "Lists are getting longer.", "Christmas Eve. Close strong."
  ];
  var SAD_LINES = ["Nothing left!", "Came back later?", "So empty...", "Oh no, sold out.", "Is there more in back?"];
  var CALLOUTS = ["STRETCH IT OUT!", "LONG NECK LEGEND!", "STOCK STAR!", "SHELF HERO!", "AISLE ACE!"];
  var SKIN = ["#f1c9a5", "#d9a07a", "#a8714f", "#7a4b32", "#f5d7bd"];
  var COATS = ["#c0392b", "#2e86c1", "#27ae60", "#8e44ad", "#d35400", "#16a085", "#7f8c8d", "#b03a6f"];

  var S = {}, parts = [], pops = [], idleT = 0, idleNext = 1, lastTouch = false;
  var X = window.NPX && window.NPX.on ? window.NPX : null;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function award(id) { if (window.Trophies) Trophies.unlock(id); }
  function bayX(b) { return BX0 + BW * (b + 0.5); }
  function headY(l) { return LVY[l] + 6; }
  function idx(b, l) { return l * BAYS + b; }

  /* ---------------- State ---------------- */
  function reset() {
    var pool = TOYS.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 8), slots = [];
    for (var i = 0; i < BAYS * LEVELS; i++) slots.push({ toy: pool[i % 8], n: CAP, pop: 0, empT: 0, shake: 0 });
    for (i = slots.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = slots[i].toy; slots[i].toy = slots[j].toy; slots[j].toy = t; }
    S = { t: 0, day: 1, dayT: 0, flipT: 0, score: 0, cheer: 100, slots: slots, cust: [], spawnT: 1.2, hot: -1,
          j: { b: 1, l: 1, x: bayX(1), hy: headY(1), tb: 1, tl: 1, pend: false, step: 0, blink: 2, nod: 0, carry: 0, face: 1 },
          combo: 0, comboT: 0, bestCombo: 0, mult: 1, toys: 0, visits: 0, served: 0, sad: 0, saves: 0, top: 0, hotN: 0,
          dayEmpty: false, cleanDays: 0, phase: "play", pt: 0, win: false, bonus: 0, dayBonus: 0, callN: 0,
          fever: X ? new X.Fever(15) : null };
    pickHot();
    parts.length = 0; pops.length = 0;
  }
  function pickHot() {
    var c = [];
    for (var i = 0; i < S.slots.length; i++) if (i !== S.hot) c.push(i);
    S.hot = pick(c);
  }

  /* ---------------- Difficulty ---------------- */
  function k() { return (S.day - 1) / (DAYS - 1); }                    // 0 on Dec 1, 1 on Dec 24
  // toys per second the crowd wants: about 0.6 on Dec 1, 3.6 on Christmas Eve, with a bump for the last minute rush
  function demand() { return 0.6 + 3.3 * Math.pow(k(), 0.85) + (S.day >= 20 ? 0.25 : 0); }
  function spawnGap() { return (1 + bulkChance()) / demand(); }
  function walkSpeed() { return 80 + 120 * k(); }
  function reachTime() { return 0.6 - 0.3 * k(); }
  function patience() { return 2.5 - 1.2 * k(); }
  function bulkChance() { return clamp((S.day - 6) / 26, 0, 0.6); }
  function maxCust() { return 3 + S.day; }

  /* ---------------- Update ---------------- */
  function update(dt) {
    S.pt += dt;
    tickFx(dt);
    moveJeff(dt);
    if (S.phase === "end") { tickCust(dt); if (S.pt > 2.4) finish(); return; }
    S.t += dt; S.dayT += dt;
    if (S.flipT > 0) S.flipT -= dt;
    if (S.dayT >= DAY_LEN) { endDay(); if (S.phase === "end") return; }
    if (S.fever) S.fever.tick(dt);

    // shoppers arrive
    S.spawnT -= dt;
    if (S.spawnT <= 0) { S.spawnT = spawnGap() * rnd(0.75, 1.25); if (S.cust.length < maxCust()) spawn(); }
    tickCust(dt);

    // combo window
    if (S.comboT > 0) { S.comboT -= dt; if (S.comboT <= 0) { S.combo = 0; S.mult = 1; } }

    // cheer
    var empty = 0;
    for (var i = 0; i < S.slots.length; i++) {
      var s = S.slots[i];
      if (s.pop > 0) s.pop -= dt;
      if (s.shake > 0) s.shake -= dt;
      if (s.n === 0) { empty++; s.empT += dt; } else s.empT = 0;
    }
    if (empty) { S.dayEmpty = true; S.cheer -= 0.8 * empty * dt; }
    else S.cheer += 1.6 * dt;
    S.cheer = Math.min(100, S.cheer);
    if (S.cheer <= 0) lose();
  }

  function moveJeff(dt) {
    var J = S.j, tx = bayX(J.tb), ty = headY(J.tl);
    var dx = tx - J.x, dy = ty - J.hy;
    if (Math.abs(dx) > 0.5) { var mx = Math.sign(dx) * Math.min(Math.abs(dx), JX_SPEED * dt); J.x += mx; J.step += Math.abs(mx); J.face = dx > 0 ? 1 : -1; } else J.x = tx;
    if (Math.abs(dy) > 0.5) J.hy += Math.sign(dy) * Math.min(Math.abs(dy), NECK_SPEED * dt); else J.hy = ty;
    J.b = Math.round((J.x - BX0) / BW - 0.5);
    if (J.x === tx && J.hy === ty && J.pend) { J.pend = false; J.nod = 0.18; if (Shell.state() === "playing" && S.phase === "play") restock(idx(J.tb, J.tl)); }
    J.blink -= dt; if (J.blink < -0.12) J.blink = rnd(1.5, 4);
    if (J.nod > 0) J.nod -= dt;
    if (J.carry > 0) J.carry -= dt;
  }

  function setTarget(b, l) {
    if (S.phase !== "play") return;
    b = clamp(b, 0, BAYS - 1); l = clamp(l, 0, LEVELS - 1);
    var J = S.j;
    if (l !== J.tl) {   // neck stretch boing
      var up = l > J.tl;
      Shell.tone(up ? 300 : 620, 0.09, "triangle", 0.16, up ? 620 : 280);
    } else if (b !== J.tb) Shell.tone(520 + b * 60, 0.03, "square", 0.08);
    J.tb = b; J.tl = l; J.pend = true;
  }

  function restock(i) {
    var s = S.slots[i], l = Math.floor(i / BAYS), b = i % BAYS, x = bayX(b), y = LVY[l];
    if (s.n >= CAP) { Shell.tone(180, 0.05, "triangle", 0.1); pop(x, y - 20, "FULL", "#8e93a2"); return; }
    var add = Math.min(PER_VISIT, CAP - s.n), wasEmpty = s.n === 0, hot = i === S.hot;
    s.n += add; s.pop = 0.35; S.j.carry = 0.25;
    S.combo = S.comboT > 0 ? S.combo + 1 : 1; S.comboT = COMBO_T;
    var m = Math.min(5, 1 + Math.floor((S.combo - 1) / 3));
    if (m > S.mult) { S.mult = m; streak(); }
    S.mult = m;
    if (S.combo > S.bestCombo) S.bestCombo = S.combo;
    if (S.combo >= 5) award("mnj-combo");
    var pts = add * 10 + (wasEmpty ? 20 : 0);
    if (hot) pts *= 2;
    pts *= S.mult;
    if (S.fever && S.fever.active()) pts *= 2;
    S.score += pts; S.toys += add; S.visits++;
    if (l === 3) { S.top++; if (S.top >= 25) award("mnj-top"); }
    if (hot) { S.hotN++; if (S.hotN >= 30) award("mnj-hot"); }
    pop(x, y - 22, "+" + pts, hot ? "#ffd23f" : "#9bff3f");
    sparkle(x, y, hot ? "#ffd23f" : "#3cc4b0", wasEmpty ? 12 : 7);
    Shell.tone(520 + Math.min(S.combo, 12) * 55, 0.06, "square", 0.16); Shell.tone(780 + Math.min(S.combo, 12) * 70, 0.08, "triangle", 0.12, 0, 0.05);
    if (wasEmpty) Shell.noise(0.08, 0.18, 2400, 1.5);
    // waiting shoppers at this shelf get served
    for (var c = 0; c < S.cust.length; c++) {
      var q = S.cust[c];
      if (q.slot === i && q.st === "wait") {
        take(q);
        S.saves++; var bonus = 50 * S.mult; S.score += bonus;
        pop(q.x, FLOOR - 92, "JUST IN TIME +" + bonus, "#3ff0ff");
        Shell.sfx("score");
        if (S.fever) S.fever.hit("Jeff is on a roll");
      }
    }
  }
  function streak() {
    var line = CALLOUTS[S.callN++ % CALLOUTS.length];
    if (window.NPRewards) NPRewards.streak(S.combo, "COMBO x" + S.mult, S.mult >= 4 ? "#ff4b3e" : S.mult === 3 ? "#ffd23f" : "#3ff0ff");
    else Shell.flash(line, "Combo x" + S.mult, "#3ff0ff", 800);
  }

  /* ---------------- Shoppers ---------------- */
  function spawn() {
    var stocked = [], all = [], i;
    for (i = 0; i < S.slots.length; i++) { all.push(i); if (S.slots[i].n > 0) stocked.push(i); }
    var r = Math.random(), slot;
    if (r < 0.28 && S.slots[S.hot].n > 0) slot = S.hot;
    else if (r < 0.85 && stocked.length) slot = pick(stocked);
    else slot = pick(all);
    var l = Math.floor(slot / BAYS), b = slot % BAYS, left = Math.random() < 0.5;
    var kind = l === 0 ? (Math.random() < 0.6 ? "kid" : "adult") : l === 1 ? "adult" : "tall";
    S.cust.push({ slot: slot, l: l, b: b, kind: kind, x: left ? -20 : W + 20, dir: left ? 1 : -1,
      sx: bayX(b) + rnd(-16, 16), st: "walk", t: 0, v: walkSpeed() * rnd(0.9, 1.15), skin: pick(SKIN), coat: pick(COATS),
      take: Math.random() < bulkChance() ? 2 : 1, got: null, mood: 0, line: "", hat: Math.random() < 0.35, ph: Math.random() * 6 });
  }
  function take(q) {
    var s = S.slots[q.slot];
    var n = Math.min(q.take, s.n);
    s.n -= n; s.shake = 0.2;
    q.got = s.toy; q.st = "leave"; q.mood = 1; q.t = 0;
    S.served++; S.cheer = Math.min(100, S.cheer + 0.1);
    if (s.n === 0) { Shell.tone(240, 0.08, "square", 0.08, 180); }
    else Shell.tone(1200, 0.02, "square", 0.05);
  }
  function tickCust(dt) {
    for (var i = S.cust.length - 1; i >= 0; i--) {
      var q = S.cust[i];
      q.t += dt; q.ph += dt * (q.st === "walk" || q.st === "leave" ? 10 : 2);
      if (q.st === "walk") {
        var d = q.sx - q.x;
        if (Math.abs(d) <= q.v * dt) { q.x = q.sx; q.st = "reach"; q.t = 0; }
        else q.x += Math.sign(d) * q.v * dt;
      } else if (q.st === "reach") {
        if (q.t >= reachTime()) {
          if (S.slots[q.slot].n > 0 && S.phase === "play") take(q);
          else { q.st = "wait"; q.t = 0; Shell.tone(700, 0.05, "square", 0.08, 500); }
        }
      } else if (q.st === "wait") {
        if (S.slots[q.slot].n > 0 && S.phase === "play") take(q);
        else if (S.phase !== "play") { q.st = "leave"; q.t = 0; }
        else if (q.t >= patience()) {
          q.st = "leave"; q.mood = -1; q.t = 0; q.line = pick(SAD_LINES);
          S.sad++; S.cheer -= 10; Shell.sfx("miss"); Shell.shake(3, 0.2);
          if (S.fever) S.fever.miss();
          if (S.cheer <= 0) lose();
        }
      } else {   // leave toward the nearer door
        var out = q.x < W / 2 ? -1 : 1;
        q.x += out * q.v * 1.15 * dt;
        if (q.x < -40 || q.x > W + 40) S.cust.splice(i, 1);
      }
    }
  }

  /* ---------------- Days ---------------- */
  function endDay() {
    var full = 0;
    for (var i = 0; i < S.slots.length; i++) if (S.slots[i].n === CAP) full++;
    S.dayBonus = full * 25; S.score += S.dayBonus;
    if (!S.dayEmpty && S.day >= 10) { S.cleanDays++; award("mnj-clean"); }
    if (S.day >= DAYS) { win(); return; }
    S.day++; S.dayT = 0; S.dayEmpty = false; S.flipT = 0.5;
    pickHot();
    if (S.day === 8) award("mnj-week");
    if (S.day === 13) award("mnj-half");
    var head = S.day === 20 ? "LAST MINUTE RUSH" : S.day === DAYS ? "CHRISTMAS EVE" : "DEC " + S.day;
    Shell.flash(head, DAY_LINES[S.day], S.day >= 20 ? "#ff4b3e" : "#3cc4b0", 1000);
    if (S.dayBonus) pop(W / 2, 92, "FULL SHELVES +" + S.dayBonus, "#9bff3f");
    var hs = S.hot; pop(bayX(hs % BAYS), LVY[Math.floor(hs / BAYS)] - 22, "HOT TOY", "#ffd23f");
    Shell.tone(784, 0.07, "square", 0.16); Shell.tone(988, 0.07, "square", 0.16, 0, 0.08); Shell.tone(1319, 0.14, "square", 0.16, 0, 0.16);
    Shell.noise(0.12, 0.12, 3000, 1);
  }
  function win() {
    S.phase = "end"; S.pt = 0; S.win = true;
    S.bonus = Math.round(S.cheer) * 40; S.score += S.bonus;
    award("mnj-eve");
    if (S.cheer >= 75) award("mnj-perfect");
    Shell.flash("CLOSING TIME", "Christmas Eve is done. Cheer bonus +" + S.bonus + ". Jeff earned a long nap.", "#ffd23f", 2000);
    Shell.sfx("best"); Shell.sfx("crowd");
    for (var i = 0; i < 6; i++) sparkle(rnd(40, 320), rnd(90, 320), pick(["#ffd23f", "#3cc4b0", "#ff3fa4"]), 10);
  }
  function lose() {
    if (S.phase !== "play") return;
    S.phase = "end"; S.pt = 0; S.cheer = 0;
    Shell.flash("SHELVES WENT BARE", "Shoppers headed home grumpy on Dec " + S.day + ".", "#ff4b3e", 2000);
    Shell.sfx("buzzer"); Shell.shake(6, 0.4);
  }
  function finish() {
    var reached = S.win ? DAYS : S.day;
    Shell.gameOver(S.score, { title: S.win ? "MADE IT TO CHRISTMAS" : "SHELVES WENT BARE", html:
      row("Made it to", "Dec " + reached + (S.win ? ", closing time" : "")) + row("Toys restocked", S.toys) + row("Shoppers served", S.served) +
      row("Just in time saves", S.saves) + row("Left with nothing", S.sad) + row("Best combo", S.bestCombo) +
      row("Top shelf restocks", S.top) + (S.win ? row("Cheer bonus", S.bonus) : ""),
      stats: { score: S.score, day: reached, toys: S.toys, served: S.served, sad: S.sad, combo: S.bestCombo, top: S.top, hot: S.hotN,
               saves: S.saves, eve: S.win, cheer: Math.round(S.cheer), clean: S.cleanDays } });
  }
  function row(a, b) { return '<div class="np-row"><span>' + a + "</span><b>" + b + "</b></div>"; }

  /* ---------------- Input ---------------- */
  function pointer(type, x, y, e) {
    if (type !== "down") return;
    if (e && e.pointerType === "touch") lastTouch = true;
    var b = clamp(Math.floor((x - BX0) / BW), 0, BAYS - 1), l;
    if (y >= BOARD_Y - 4) l = clamp(3 - Math.floor((y - BOARD_Y) / ROW), 0, 3);   // stock board
    else if (y >= LVY[0] + 34) l = S.j.tl;                                         // the floor: walk, keep the neck
    else { l = 0; for (var i = 0; i < LEVELS; i++) if (Math.abs(y - LVY[i]) <= 34) l = i; if (y < LVY[3] - 34) l = 3; }
    setTarget(b, l);
  }
  function key(type, code, e) {
    if (type !== "down" || (e && e.repeat && !/Arrow/.test(code))) return;
    var J = S.j;
    if (code === "ArrowLeft" || code === "KeyA") setTarget(J.tb - 1, J.tl);
    else if (code === "ArrowRight" || code === "KeyD") setTarget(J.tb + 1, J.tl);
    else if (code === "ArrowUp" || code === "KeyW") setTarget(J.tb, J.tl + 1);
    else if (code === "ArrowDown" || code === "KeyS") setTarget(J.tb, J.tl - 1);
    else if (code === "Space" || code === "Enter") setTarget(J.tb, J.tl);   // top up the shelf in front of Jeff
  }

  /* ---------------- Effects ---------------- */
  function sparkle(x, y, col, n) {
    if (Shell.reduced) return;
    for (var i = 0; i < n; i++) { var a = i / n * TAU; parts.push({ x: x, y: y, vx: Math.cos(a) * rnd(50, 110), vy: Math.sin(a) * rnd(50, 110) - 40, life: 0.45, c: i % 2 ? col : "#ffffff" }); }
  }
  function pop(x, y, text, col) { pops.push({ x: clamp(x, 40, W - 40), y: y, text: text, c: col, life: 0.9 }); }
  function tickFx(dt) {
    for (var i = parts.length - 1; i >= 0; i--) { var p = parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; if (p.life <= 0) parts.splice(i, 1); }
    for (i = pops.length - 1; i >= 0; i--) { pops[i].life -= dt; pops[i].y -= 28 * dt; if (pops[i].life <= 0) pops.splice(i, 1); }
  }

  /* ---------------- Drawing helpers ---------------- */
  function fr(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function circ(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function ell(c, x, y, rx, ry, col, rot) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); c.fill(); }

  function drawToy(c, id, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    if (id === "blocks") {
      fr(c, -9, 0, 9, 9, "#e74c3c"); fr(c, 0, 0, 9, 9, "#3498db"); fr(c, -5, -9, 9, 9, "#f1c40f");
      c.fillStyle = "#fff"; c.font = '6px "Press Start 2P", monospace'; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText("A", -4.5, 5); c.fillText("B", 4.5, 5); c.fillText("C", -0.5, -4);
    } else if (id === "bear") {
      circ(c, -6, -8, 3.5, "#b07a4a"); circ(c, 6, -8, 3.5, "#b07a4a"); ell(c, 0, 3, 8, 7, "#c68b56"); circ(c, 0, -4, 6.5, "#c68b56");
      circ(c, 0, -2, 2.6, "#e6c29a"); circ(c, -2.5, -5.5, 1, "#1a1a1a"); circ(c, 2.5, -5.5, 1, "#1a1a1a"); fr(c, -3, 3, 6, 2, "#c0392b");
    } else if (id === "rocket") {
      c.fillStyle = "#c0392b"; c.beginPath(); c.moveTo(-7, 9); c.lineTo(-3, 2); c.lineTo(-3, 9); c.fill(); c.beginPath(); c.moveTo(7, 9); c.lineTo(3, 2); c.lineTo(3, 9); c.fill();
      ell(c, 0, 0, 4.5, 10, "#ecf0f1"); c.fillStyle = "#c0392b"; c.beginPath(); c.moveTo(-4, -6); c.lineTo(0, -12); c.lineTo(4, -6); c.fill();
      circ(c, 0, -1, 2.2, "#3ff0ff"); fr(c, -2, 9, 4, 3, "#ffb347");
    } else if (id === "yoyo") {
      fr(c, 0, -12, 1, 6, "#eceae2"); circ(c, 0, 2, 8, "#8e44ad"); circ(c, 0, 2, 5, "#b07be0"); circ(c, 0, 2, 1.6, "#eceae2");
    } else if (id === "robot") {
      fr(c, 0, -13, 1, 3, "#aaa"); circ(c, 0.5, -13, 1.6, "#ff4b3e"); fr(c, -6, -10, 13, 9, "#95a5a6"); fr(c, -4, -8, 3, 3, "#3ff0ff"); fr(c, 2, -8, 3, 3, "#3ff0ff");
      fr(c, -7, 0, 15, 10, "#7f8c8d"); fr(c, -3, 3, 7, 3, "#f1c40f"); fr(c, -10, 1, 3, 7, "#95a5a6"); fr(c, 8, 1, 3, 7, "#95a5a6");
    } else if (id === "train") {
      fr(c, -10, -2, 14, 8, "#27ae60"); fr(c, 0, -9, 7, 15, "#c0392b"); fr(c, -8, -7, 4, 5, "#2c3e50"); fr(c, 2, -7, 4, 4, "#f7dc6f");
      circ(c, -6, 7, 3, "#2c3e50"); circ(c, 3, 7, 3, "#2c3e50"); fr(c, 7, 2, 3, 4, "#f1c40f");
    } else if (id === "ball") {
      circ(c, 0, 0, 9, "#ecf0f1");
      c.save(); c.beginPath(); c.arc(0, 0, 9, 0, TAU); c.clip();
      fr(c, -9, -9, 6, 18, "#e74c3c"); fr(c, 3, -9, 6, 18, "#3498db"); c.restore(); circ(c, -3, -4, 1.6, "rgba(255,255,255,.8)");
    } else if (id === "duck") {
      ell(c, 0, 4, 9, 6, "#f4d03f"); circ(c, 4, -4, 5, "#f4d03f"); c.fillStyle = "#e67e22"; c.beginPath(); c.moveTo(8, -4); c.lineTo(12, -3); c.lineTo(8, -1); c.fill(); circ(c, 5, -5, 1, "#1a1a1a");
    } else if (id === "drum") {
      fr(c, -9, -4, 18, 12, "#c0392b"); ell(c, 0, -4, 9, 3, "#ecf0f1"); c.strokeStyle = "#f1c40f"; c.lineWidth = 1.2; c.beginPath();
      for (var i = 0; i < 4; i++) { c.moveTo(-9 + i * 6, -3); c.lineTo(-6 + i * 6, 7); } c.stroke();
      c.strokeStyle = "#d4a373"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-6, -12); c.lineTo(-1, -6); c.moveTo(7, -12); c.lineTo(2, -6); c.stroke();
    } else if (id === "top") {
      c.fillStyle = "#16a085"; c.beginPath(); c.moveTo(-9, -2); c.lineTo(9, -2); c.lineTo(0, 10); c.fill();
      ell(c, 0, -2, 9, 3.5, "#1abc9c"); fr(c, -1, -10, 2, 6, "#ecf0f1"); fr(c, -5, 1, 10, 2, "#f1c40f");
    }
    c.restore();
  }

  /* ---------------- Scene ---------------- */
  function drawStore(c, t) {
    // wall
    fr(c, 0, 0, W, FLOOR, "#1b1630");
    for (var i = 0; i < 9; i++) fr(c, i * 44 + 8, 40, 2, 306, "rgba(255,255,255,.03)");
    // sign
    fr(c, 0, 38, W, 30, "#2a1f4a"); fr(c, 0, 66, W, 2, "#3cc4b0");
    Shell.text(c, STORE, W / 2, 46, 12, "#ffd23f", "center", "#ff8a1f");
    // day progress (closing time for today)
    var dk = clamp(S.dayT / DAY_LEN, 0, 1);
    fr(c, 0, 68, W, 3, "#0d0b18"); fr(c, 0, 68, W * dk, 3, S.day >= 20 ? "#ff4b3e" : "#a98be0");
    // garland with blinking lights
    c.strokeStyle = "#1f7a4a"; c.lineWidth = 4; c.beginPath();
    for (var x = 0; x <= W; x += 6) { var gy = 76 + Math.sin(x / 45 * Math.PI) * 4; if (x === 0) c.moveTo(x, gy); else c.lineTo(x, gy); }
    c.stroke();
    var LC = ["#ff4b3e", "#ffd23f", "#3ff0ff", "#9bff3f", "#ff3fa4"];
    for (i = 0; i < 13; i++) { var lx = 12 + i * 28, ly = 79 + Math.sin(lx / 45 * Math.PI) * 4, on = Math.floor(t * 3 + i) % 3 !== 0; circ(c, lx, ly, 2.4, on ? LC[i % 5] : "#3a3446"); }
    // shelves
    for (var l = 0; l < LEVELS; l++) {
      var cy = LVY[l];
      fr(c, BX0 - 4, cy - 30, BAYS * BW + 8, 60, "#241c3c");
      fr(c, BX0 - 4, cy + 24, BAYS * BW + 8, 7, "#9a6a43"); fr(c, BX0 - 4, cy + 24, BAYS * BW + 8, 2, "#c8915f");
      for (var b = 0; b < BAYS; b++) drawSlot(c, b, l, t);
    }
    for (b = 0; b <= BAYS; b++) fr(c, BX0 - 4 + b * BW, LVY[3] - 34, 6, LVY[0] - LVY[3] + 66, "#6e4a30");
    // floor
    fr(c, 0, LVY[0] + 34, W, FLOOR - LVY[0] - 34 + 6, "#2d2a3a");
    for (i = 0; i < 12; i++) fr(c, i * 32 + ((Math.floor((LVY[0] + 34) / 16)) % 2) * 16, LVY[0] + 46, 16, 10, "rgba(255,255,255,.04)");
    fr(c, 0, FLOOR + 2, W, 2, "#3cc4b0");
  }
  function drawSlot(c, b, l, t) {
    var i = idx(b, l), s = S.slots[i], x = bayX(b), y = LVY[l], hot = i === S.hot;
    if (hot) { var g = 0.25 + 0.2 * Math.sin(t * 6); c.fillStyle = "rgba(255,210,63," + g.toFixed(2) + ")"; c.fillRect(x - 38, y - 28, 76, 52); }
    if (s.n === 0) {
      var fl = Math.floor(t * 4) % 2;
      c.fillStyle = fl ? "rgba(255,75,62,.28)" : "rgba(255,75,62,.12)"; c.fillRect(x - 38, y - 28, 76, 52);
      Shell.uiText(c, "EMPTY", x, y - 4, 8, "#ff8a80", "center");
    }
    var sh = s.shake > 0 ? Math.sin(s.shake * 80) * 2 : 0, sc = s.pop > 0 ? 1 + s.pop * 1.2 : 1;
    for (var n = 0; n < s.n; n++) drawToy(c, s.toy.id, x - 22 + n * 22 + sh, y + 12 - (n === 1 ? 2 : 0), sc);
    if (hot) { fr(c, x - 38, y - 30, 26, 10, "#ffd23f"); Shell.uiText(c, "HOT", x - 25, y - 30, 8, "#101219", "center"); }
  }

  function drawJeff(c, t, idle) {
    var J = S.j, x = J.x, fy = FLOOR, moving = Math.abs(bayX(J.tb) - J.x) > 1;
    var bob = moving ? Math.sin(J.step / 9) * 1.5 : Math.sin(t * 2) * 0.6;
    var bx = x - 14 * J.face, by = fy - 30 + bob;          // body centre
    // legs
    var swing = moving ? Math.sin(J.step / 7) * 4 : 0;
    var legs = [-18, -8, 8, 18];
    for (var i = 0; i < 4; i++) {
      var lx = bx + legs[i] + (i % 2 ? swing : -swing);
      fr(c, lx - 2.5, by + 8, 5, fy - by - 10, "#2fa898"); fr(c, lx - 3, fy - 4, 6, 4, "#3b2b5c");
    }
    // tail
    c.strokeStyle = "#2fa898"; c.lineWidth = 2; c.beginPath(); c.moveTo(bx - 24 * J.face, by - 4); c.lineTo(bx - 30 * J.face, by + 8 + Math.sin(t * 5) * 2); c.stroke();
    circ(c, bx - 30 * J.face, by + 10 + Math.sin(t * 5) * 2, 3, "#a98be0");
    // body
    ell(c, bx, by, 27, 15, "#3cc4b0");
    ring(c, bx - 14 * J.face, by - 3, 4); ring(c, bx - 4 * J.face, by + 6, 3.5);
    // vest (mustard, store issue) and name tag
    c.fillStyle = "#e9a93a"; c.beginPath(); c.ellipse(bx + 7 * J.face, by + 1, 17, 14, 0, 0, TAU); c.fill();
    fr(c, bx + 7 * J.face - 1, by - 12, 2, 26, "#b9781f");
    fr(c, bx + 5 * J.face - 11, by - 6, 22, 10, "#ffffff"); fr(c, bx + 5 * J.face - 11, by - 6, 22, 3, "#c0392b");
    c.fillStyle = "#1b1630"; c.font = '5px "Press Start 2P", monospace'; c.textAlign = "center"; c.textBaseline = "top";
    c.fillText("JEFF", bx + 5 * J.face, by - 2);
    // neck: from the shoulders straight up to the head
    var nx = x, ny0 = by - 10, hy = J.hy;
    var nw = 9;
    fr(c, nx - nw / 2, hy, nw, ny0 - hy + 4, "#3cc4b0");
    // mane (lavender zigzag)
    c.fillStyle = "#a98be0";
    for (var my = hy + 6; my < ny0 - 2; my += 8) { c.beginPath(); c.moveTo(nx - nw / 2 * J.face, my); c.lineTo(nx - (nw / 2 + 4) * J.face, my + 4); c.lineTo(nx - nw / 2 * J.face, my + 8); c.fill(); }
    for (my = hy + 12; my < ny0 - 6; my += 22) ring(c, nx + 0.5 * J.face, my, 2.6);
    // striped scarf at the base of the neck
    for (i = 0; i < 4; i++) fr(c, nx - 7 + i * 3.5, ny0 - 4, 3.5, 6, i % 2 ? "#ffffff" : "#c0392b");
    fr(c, nx + 3 * J.face, ny0, 4, 9, "#c0392b");
    // head
    var nod = J.nod > 0 ? Math.sin(J.nod / 0.18 * Math.PI) * 4 : 0, hx = nx + 3 * J.face, hyy = hy + nod;
    fr(c, hx - 5 - 1, hyy - 15, 2, 7, "#2fa898"); fr(c, hx + 3 - 1, hyy - 15, 2, 7, "#2fa898");
    circ(c, hx - 5, hyy - 16, 2.6, "#a98be0"); circ(c, hx + 3, hyy - 16, 2.6, "#a98be0");
    ell(c, hx - 9 * J.face, hyy - 8, 5, 2.5, "#2fa898", -0.4 * J.face);
    ell(c, hx, hyy - 4, 11, 9, "#3cc4b0");
    ell(c, hx + 9 * J.face, hyy - 1, 7, 6, "#9ff0e0");
    circ(c, hx + 12 * J.face, hyy - 2, 1.2, "#1b1630");
    if (J.blink > 0) { circ(c, hx + 1 * J.face, hyy - 6, 3.2, "#ffffff"); circ(c, hx + 2 * J.face, hyy - 6, 1.7, "#1b1630"); }
    else fr(c, hx - 2, hyy - 6, 6, 1.5, "#1b1630");
    c.strokeStyle = "#1b1630"; c.lineWidth = 1; c.beginPath(); c.arc(hx + 9 * J.face, hyy + 1, 3, 0.2, Math.PI - 0.2); c.stroke();
    if (J.carry > 0) drawToy(c, S.slots[idx(J.tb, J.tl)].toy.id, hx + 14 * J.face, hyy + 4, 0.6);
    // stretch lines while the neck is moving
    if (Math.abs(J.hy - headY(J.tl)) > 4 && !idle) { c.fillStyle = "rgba(255,255,255,.5)"; for (i = 0; i < 3; i++) fr(c, nx + 8, J.hy + 10 + i * 9, 6, 1.5); }
  }
  function ring(c, x, y, r) { c.strokeStyle = "#a98be0"; c.lineWidth = 1.6; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }

  function drawShopper(c, q, t) {
    var x = q.x, fy = FLOOR + 2, kid = q.kind === "kid", h = kid ? 40 : q.kind === "tall" ? 66 : 56;
    var walk = q.st === "walk" || q.st === "leave", sw = walk ? Math.sin(q.ph) * 3 : 0, top = fy - h;
    c.globalAlpha = 0.92;
    fr(c, x - 5 + sw, fy - h * 0.38, 4, h * 0.38, "#2c2f3a"); fr(c, x + 1 - sw, fy - h * 0.38, 4, h * 0.38, "#2c2f3a");
    fr(c, x - 8, top + 12, 16, h * 0.62 - 12, q.coat);
    circ(c, x, top + 6, kid ? 6 : 7, q.skin);
    if (q.hat) { fr(c, x - 7, top - 2, 14, 4, "#c0392b"); circ(c, x, top - 4, 3, "#ffffff"); }
    var face = q.mood < 0 ? "sad" : q.mood > 0 ? "happy" : "plain";
    circ(c, x - 2.5, top + 5, 0.9, "#1a1a1a"); circ(c, x + 2.5, top + 5, 0.9, "#1a1a1a");
    c.strokeStyle = "#1a1a1a"; c.lineWidth = 1; c.beginPath();
    if (face === "happy") c.arc(x, top + 7, 2.5, 0.2, Math.PI - 0.2); else if (face === "sad") c.arc(x, top + 11, 2.5, Math.PI + 0.3, -0.3); else { c.moveTo(x - 2, top + 9); c.lineTo(x + 2, top + 9); }
    c.stroke();
    var sx = x + 7, sy = top + 16;
    if (q.st === "reach" || q.st === "wait") {
      var ty = LVY[q.l] + 18, k = q.st === "reach" ? clamp(q.t / reachTime(), 0, 1) : 1;
      var ex = bayX(q.b) + (q.x < bayX(q.b) ? -10 : 10), ey = sy + (ty - sy) * k;
      c.strokeStyle = q.kind === "tall" ? "#bdc3c7" : q.coat; c.lineWidth = q.kind === "tall" ? 2 : 3;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke();
      if (q.kind === "tall") { c.strokeStyle = "#ff8a1f"; c.lineWidth = 2; c.beginPath(); c.moveTo(ex - 3, ey - 3); c.lineTo(ex, ey); c.lineTo(ex + 3, ey - 3); c.stroke(); }
    } else fr(c, sx - 2, sy, 3, h * 0.3, q.coat);
    if (q.got) drawToy(c, q.got.id, x + 10, top + h * 0.45, 0.6);
    c.globalAlpha = 1;
    if (q.st === "wait") {
      var pk = 1 - clamp(q.t / patience(), 0, 1);
      fr(c, x - 10, top - 22, 20, 14, "#ffffff"); Shell.uiText(c, "?", x, top - 21, 10, "#c0392b", "center");
      fr(c, x - 10, top - 6, 20, 2, "#3a3e4c"); fr(c, x - 10, top - 6, 20 * pk, 2, pk > 0.4 ? "#ffd23f" : "#ff4b3e");
    }
    if (q.mood < 0 && q.t < 1.2) Shell.uiText(c, q.line, clamp(x, 50, W - 50), top - 18, 8, "#ff8a80", "center");
  }

  function drawHUD(c, t) {
    fr(c, 0, 0, W, 38, "#101219");
    // calendar page
    var flip = S.flipT > 0 ? S.flipT / 0.5 : 0;
    fr(c, 6, 3, 34, 32, "#eceae2"); fr(c, 6, 3, 34, 9, "#c0392b");
    Shell.uiText(c, "DEC", 23, 3, 8, "#ffffff", "center");
    c.save(); c.translate(23, 24); c.scale(1, 1 - flip * 0.9);
    Shell.text(c, String(S.day), 0, -7, 12, "#1b1630", "center"); c.restore();
    Shell.uiText(c, (DAYS - S.day) + " TO GO", 46, 5, 8, "#8e93a2", "left");
    Shell.text(c, String(S.score), 46, 18, 10, "#ffd23f", "left");
    // cheer meter
    var cx = 212, cw = 140, ck = clamp(S.cheer / 100, 0, 1);
    Shell.uiText(c, "CHEER", cx, 4, 8, "#8e93a2", "left");
    if (S.mult > 1 && S.comboT > 0) Shell.uiText(c, "COMBO x" + S.mult, cx + cw, 4, 8, "#3ff0ff", "right");
    fr(c, cx, 16, cw, 12, "#23252e");
    var col = ck > 0.5 ? "#3fd07a" : ck > 0.25 ? "#ffd23f" : (Math.floor(t * 6) % 2 ? "#ff4b3e" : "#a8261c");
    fr(c, cx + 2, 18, (cw - 4) * ck, 8, col);
    if (S.comboT > 0 && S.combo > 0) fr(c, cx, 30, cw * S.comboT / COMBO_T, 2, "#3ff0ff");
  }

  function drawBoard(c, t) {
    fr(c, 0, BOARD_Y - 4, W, H - BOARD_Y + 4, "#101219");
    for (var l = 0; l < LEVELS; l++) for (var b = 0; b < BAYS; b++) {
      var i = idx(b, l), s = S.slots[i], x = BX0 + b * BW + 2, y = BOARD_Y + (3 - l) * ROW, w = BW - 4, h = ROW - 3;
      var col = s.n === CAP ? "#1f5e44" : s.n === 2 ? "#4d6b1f" : s.n === 1 ? "#8a6216" : (Math.floor(t * 5) % 2 ? "#a8261c" : "#5e1610");
      fr(c, x, y, w, h, col);
      if (i === S.hot) { c.strokeStyle = "#ffd23f"; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2); }
      if (S.j.tb === b && S.j.tl === l) { c.strokeStyle = "#ffffff"; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2); }
      drawToy(c, s.toy.id, x + 14, y + h / 2 + 1, 0.62);
      for (var p = 0; p < CAP; p++) circ(c, x + 34 + p * 11, y + h / 2, 3.2, p < s.n ? "#eceae2" : "rgba(255,255,255,.15)");
      var waiting = false;
      for (var q = 0; q < S.cust.length; q++) if (S.cust[q].slot === i && S.cust[q].st === "wait") waiting = true;
      if (waiting) Shell.uiText(c, "!", x + w - 8, y + 6, 10, "#ffd23f", "center");
    }
  }

  function draw(c, state) {
    var t = S.t + idleT;
    drawStore(c, t);
    var idle = state !== "playing";
    drawJeff(c, t, idle);
    for (var i = 0; i < S.cust.length; i++) drawShopper(c, S.cust[i], t);
    for (i = 0; i < parts.length; i++) { var p = parts[i]; c.globalAlpha = Math.max(0, p.life / 0.45); fr(c, p.x - 1.5, p.y - 1.5, 3, 3, p.c); }
    c.globalAlpha = 1;
    for (i = 0; i < pops.length; i++) { var q = pops[i]; c.globalAlpha = clamp(q.life / 0.4, 0, 1); Shell.text(c, q.text, q.x, q.y, 8, q.c, "center"); }
    c.globalAlpha = 1;
    if (S.fever) S.fever.draw(c, { x: 0, y: 72, w: W, h: FLOOR - 72 }, t);
    drawHUD(c, t);
    drawBoard(c, t);
    if (X) X.drawTag(c, null, 6, FLOOR - 12);
    if (state === "playing" && S.day === 1 && S.dayT < 7) {
      var msg = lastTouch ? "TAP A SHELF OR THE BOARD BELOW" : "TAP OR CLICK A SHELF. ARROWS WORK TOO";
      fr(c, 20, FLOOR - 60, W - 40, 16, "rgba(16,18,25,.85)");
      Shell.uiText(c, msg, W / 2, FLOOR - 57, 8, "#ffd23f", "center");
    }
  }

  // Behind the title card: Jeff shows off the neck.
  function idle(dt) {
    idleT += dt; idleNext -= dt;
    tickFx(dt);
    if (idleNext <= 0) { idleNext = 1.1; S.j.tb = Math.floor(Math.random() * BAYS); S.j.tl = Math.floor(Math.random() * LEVELS); }
    var J = S.j, ty = headY(J.tl), tx = bayX(J.tb);
    J.x += clamp(tx - J.x, -500 * dt, 500 * dt); J.hy += clamp(ty - J.hy, -500 * dt, 500 * dt);
    if (Math.abs(tx - J.x) > 1) J.step += 500 * dt;
    J.blink -= dt; if (J.blink < -0.12) J.blink = rnd(1.5, 4);
  }

  Shell.init({
    slug: "my-name-is-jeff",
    title: "MY NAME IS JEFF",
    accent: "#3cc4b0",
    width: W, height: H,
    format: function (n) { return n + " PTS"; },
    howTo: "Jeff the giraffe works the floor at Wobblebrook Toys. Shoppers grab toys faster every day from December 1 to Christmas Eve. Stretch his neck to restock the shelves before they run bare.",
    keys: "Tap a shelf, or the stock board under the floor, to send Jeff there. Mouse: click a shelf. Keys: left and right walk, up and down stretch the neck, Space tops up. P pause, M mute, R restart.",
    tip: "Quick restocks in a row build a combo. Gold shelves hold the Hot Toy and pay double.",
    reset: reset,
    update: update,
    draw: draw,
    pointer: pointer,
    key: key,
    idle: idle
  });
  // test hook for automated checks (read only)
  window.__jeff = function () { return S; };
})();
