/* Nostalgia Pro Arcade: batch 3 extras (live).
   Random mid-game events, rare drops, the Hot Streak fever and scenery changes for Pawn Shop Pool,
   Rink Rat Shootout, Powder Day Haul and Table Rink Rumble.

   Live copy of arcade-test/shared/extras.js (approved by RC). Extras are on by default here.
   ?extras=0 turns them off on this device, ?extras=1 turns them back on.
   Nothing is sent anywhere; rare finds are kept on the device under npArcade.extras.rares. */
(function () {
  "use strict";
  var KEY = "npArcade.extras", RKEY = "npArcade.extras.rares";
  function rd(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function wr(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  var q = location.search;
  if (/[?&]extras=1/.test(q)) wr(KEY, "1");
  if (/[?&]extras=0/.test(q)) wr(KEY, "0");
  var X = window.NPX = { on: rd(KEY) !== "0" };
  function shell() { return window.Shell; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* ---------------- Scenery ---------------- */
  X.SCENERY = [
    { id: "fog", name: "EARLY MORNING FOG", line: "Hard to see. Early birds find more rare stuff." },
    { id: "sun", name: "MID-DAY SUN", line: "Everything is open. The clock runs hot." },
    { id: "rain", name: "AFTERNOON RAIN", line: "Puddles everywhere. Things slow down." },
    { id: "golden", name: "GOLDEN HOUR", line: "Everyone wants to go home. 10 percent easier." },
    { id: "twilight", name: "TWILIGHT", line: "Only the pawn shops are open. Watch for fakes." },
    { id: "suburbs", name: "WEALTHY SUBURBS", line: "Tougher crowd, but mint finds triple." }
  ];
  X.scenery = function () {
    var forced = /[?&]scene=(\w+)/.exec(q);
    if (forced) for (var i = 0; i < X.SCENERY.length; i++) if (X.SCENERY[i].id === forced[1]) return X.SCENERY[i];
    return pick(X.SCENERY);
  };
  // weather and light over a play area {x, y, w, h}
  X.drawScenery = function (c, sc, t, r) {
    if (!sc) return;
    var i;
    c.save();
    c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
    if (sc.id === "fog") {
      for (i = 0; i < 5; i++) {
        var fy = r.y + ((i * 97 + t * 14) % (r.h + 60)) - 30;
        c.fillStyle = "rgba(225,232,240,.16)"; c.fillRect(r.x, fy, r.w, 46);
      }
      c.fillStyle = "rgba(210,220,232,.14)"; c.fillRect(r.x, r.y, r.w, r.h);
    } else if (sc.id === "sun") {
      var g = c.createRadialGradient(r.x + r.w * 0.85, r.y, 10, r.x + r.w * 0.85, r.y, r.h * 0.9);
      g.addColorStop(0, "rgba(255,244,190,.28)"); g.addColorStop(1, "rgba(255,244,190,0)");
      c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
    } else if (sc.id === "rain") {
      c.fillStyle = "rgba(20,30,60,.16)"; c.fillRect(r.x, r.y, r.w, r.h);
      c.fillStyle = "rgba(170,200,255,.45)";
      for (i = 0; i < 46; i++) { var rx = r.x + ((i * 53 + t * 40) % r.w), ry = r.y + ((i * 89 + t * 420) % r.h); c.fillRect(rx, ry, 1, 7); }
    } else if (sc.id === "golden") {
      c.fillStyle = "rgba(255,150,40,.14)"; c.fillRect(r.x, r.y, r.w, r.h);
      var gg = c.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      gg.addColorStop(0, "rgba(255,200,90,.16)"); gg.addColorStop(1, "rgba(120,40,80,.12)");
      c.fillStyle = gg; c.fillRect(r.x, r.y, r.w, r.h);
    } else if (sc.id === "twilight") {
      var fl = shell() && shell().reduced ? 1 : (Math.sin(t * 23) > 0.93 ? 0.7 : 1);
      c.fillStyle = "rgba(14,16,48," + (0.32 * fl).toFixed(2) + ")"; c.fillRect(r.x, r.y, r.w, r.h);
    } else if (sc.id === "suburbs") {
      c.fillStyle = "rgba(255,240,200,.06)"; c.fillRect(r.x, r.y, r.w, r.h);
      for (i = 0; i < 3; i++) { var sx2 = r.x + ((i * 131 + t * 30) % r.w), sy2 = r.y + ((i * 211 + t * 17) % r.h); c.fillStyle = "rgba(255,255,255,.5)"; c.fillRect(sx2, sy2, 2, 2); }
    }
    c.restore();
  };
  // small HUD tag naming the current scenery (no tag when there is no scenery)
  // drawn on a dark backing with an outline so it stays readable on white snow and bright scenery
  X.drawTag = function (c, sc, x, y) {
    var S = shell(); if (!S || !sc) return;
    var str = sc.name;
    c.save();
    c.font = '8px "Silkscreen", monospace';
    var w = Math.ceil(c.measureText(str).width);
    c.fillStyle = "rgba(8,9,14,.82)"; c.fillRect(x - 3, y - 2, w + 6, 12);
    c.strokeStyle = "#000"; c.lineWidth = 1; c.strokeRect(x - 2.5, y - 1.5, w + 5, 11);
    c.restore();
    S.uiText(c, str, x, y, 8, "#9bff3f", "left");
  };

  /* ---------------- Rare drops ---------------- */
  X.RARES = [
    { n: "Galactic Knight: Silver Edition", t: "grail", why: "Mail-away exclusive from a 1993 cereal box promotion." },
    { n: "Neon City Brawler", t: "ultra", why: "Pulled from shelves after a week." },
    { n: "Night Howler: Red Cartridge", t: "rare", why: "The uncut version angry parents protested." },
    { n: "Vector Tank 3D", t: "uncommon", why: "One of five games to use the polygon helper chip." },
    { n: "Slice Courier: Mall Tour", t: "grail", why: "Given only to finalists at a 1991 mall tournament." },
    { n: "Storm Drain Brawlers", t: "ultra", why: "A late fighting game very few people bought." },
    { n: "Critter Keeper: Midnight Run", t: "rare", why: "Overseas exclusive with alternate sprite art." },
    { n: "Star Mercenary: Zero Gravity", t: "uncommon", why: "Prized for its full-color fold-out map." },
    { n: "Moonlit Manor: Requiem", t: "grail", why: "The title is misprinted upside down on the spine." },
    { n: "Agent Static: Night Ops", t: "rare", why: "Beta code shipped in the first print run." },
    { n: "Gridiron Grind '94: Coach Cut", t: "uncommon", why: "The only year with full referee voice calls." },
    { n: "Spook Patrol: Basement Static", t: "ultra", why: "Pack-in for a failed virtual reality headset." },
    { n: "Toolbox Twins: Lost Blueprints", t: "grail", why: "Unreleased prototype found at a yard sale." },
    { n: "Cheetah Dash: Turbo Mode", t: "rare", why: "Only came inside one holiday console bundle." },
    { n: "Mecha-Suit Commando", t: "ultra", why: "Complete copies almost never have sharp corners." },
    { n: "Alley Brawlers: Error Edition", t: "rare", why: "The misspelled label variant." },
    { n: "Crypt Warden Quest", t: "uncommon", why: "Oversized cartridge with a rattling clock battery." },
    { n: "Cloud Ace: Tournament Cart", t: "grail", why: "Competition cart with a built-in five-minute timer." },
    { n: "Harbor Splash '97", t: "uncommon", why: "Great wave physics, rarely found with a dry manual." },
    { n: "Ember Saga IV: Black Label", t: "ultra", why: "First print run with heavier manual paper." }
  ];
  X.TIER = {
    uncommon: { word: "UNCOMMON", col: "#9bff3f", w: 55, pts: 1 },
    rare: { word: "RARE", col: "#3ff0ff", w: 28, pts: 2 },
    ultra: { word: "ULTRA", col: "#a77bff", w: 13, pts: 3 },
    grail: { word: "GRAIL", col: "#ffd23f", w: 4, pts: 5 }
  };
  // roll a tier by weight; mult > 1 (suburbs, fever) pushes toward the better tiers
  X.rollRare = function (mult) {
    mult = mult || 1;
    var w = { uncommon: 55, rare: 28 * mult, ultra: 13 * mult, grail: 4 * mult }, tot = 0, k;
    for (k in w) tot += w[k];
    var r = Math.random() * tot, tier = "uncommon";
    for (k in w) { if (r < w[k]) { tier = k; break; } r -= w[k]; }
    var pool = X.RARES.filter(function (x) { return x.t === tier; });
    return pick(pool);
  };
  X.log = function () { var d = null; try { d = JSON.parse(rd(RKEY) || "{}"); } catch (e) { d = {}; } return d && typeof d === "object" ? d : {}; };
  X.collect = function (item, fake) {
    var S = shell(), T = X.TIER[item.t];
    if (fake) {   // twilight: some finds are reproductions
      if (S) { S.flash("FAKE CARTRIDGE", "Thin shell, wrong screws. Reproduction.", "#ff4b3e", 1300); S.sfx("miss"); }
      return 0;
    }
    var d = X.log(); d[item.n] = (d[item.n] || 0) + 1; wr(RKEY, JSON.stringify(d));
    if (S) { S.flash(T.word + " FIND!", item.n, T.col, 1500); S.sfx("best"); }
    return T.pts;
  };
  X.foundCount = function () { return Object.keys(X.log()).length; };
  X.drawCart = function (c, x, y, tier, t, scale) {   // a little cartridge icon with a tier glow
    var T = X.TIER[tier] || X.TIER.uncommon, s = scale || 1, pulse = 0.5 + 0.5 * Math.sin(t * 6);
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = T.col; c.globalAlpha = 0.25 + pulse * 0.35; c.beginPath(); c.arc(0, 0, 15, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = "#0b0c10"; c.fillRect(-9, -10, 18, 20);
    c.fillStyle = "#8e93a2"; c.fillRect(-8, -9, 16, 18);
    c.fillStyle = T.col; c.fillRect(-6, -6, 12, 8);
    c.fillStyle = "#3a3e4c"; c.fillRect(-6, 5, 12, 3);
    if (pulse > 0.8) { c.fillStyle = "#ffffff"; c.fillRect(6, -12, 2, 6); c.fillRect(4, -10, 6, 2); }
    c.restore();
  };

  /* ---------------- Hot Streak (fever) ---------------- */
  X.CALLOUTS = ["IN THE ZONE!", "BARGAIN HUNTER!", "MINT CONDITION!", "COLLECTOR EYE!", "CLEAN SWEEP!"];
  X.Fever = function (len) {
    this.len = len || 15; this.left = 0; this.chain = 0; this.count = 0;
  };
  X.Fever.prototype.hit = function (sub) {   // one more in the streak; three starts the fever
    if (this.left > 0) return false;
    this.chain++;
    if (this.chain >= 3) { this.start(sub); return true; }
    return false;
  };
  X.Fever.prototype.miss = function () { this.chain = 0; };
  X.Fever.prototype.start = function (sub) {
    this.left = this.len; this.chain = 0; this.count++;
    var S = shell(); if (S) { S.flash(pick(X.CALLOUTS), (sub || "Hot Streak") + " for 15 seconds.", "#ff8a2a", 1300); S.sfx("best"); }
  };
  X.Fever.prototype.tick = function (dt) { if (this.left > 0) { this.left = Math.max(0, this.left - dt); if (this.left === 0) { var S = shell(); if (S) S.flash("STREAK OVER", "", "#8e93a2", 700); } } };
  X.Fever.prototype.active = function () { return this.left > 0; };
  // CRT scanline glow over the playfield, plus a timer bar
  X.Fever.prototype.draw = function (c, r, t) {
    if (this.left <= 0) return;
    c.save();
    c.fillStyle = "rgba(255,138,42,.07)"; c.fillRect(r.x, r.y, r.w, r.h);
    c.fillStyle = "rgba(0,0,0,.13)";
    for (var y = r.y; y < r.y + r.h; y += 3) c.fillRect(r.x, y, r.w, 1);
    var pulse = 0.5 + 0.5 * Math.sin(t * 8);
    c.strokeStyle = "rgba(255,138,42," + (0.45 + pulse * 0.4).toFixed(2) + ")"; c.lineWidth = 3; c.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    c.fillStyle = "#23252e"; c.fillRect(r.x + 10, r.y + 6, r.w - 20, 5);
    c.fillStyle = "#ff8a2a"; c.fillRect(r.x + 10, r.y + 6, (r.w - 20) * this.left / this.len, 5);
    var S = shell(); if (S) S.text(c, "HOT STREAK", r.x + r.w / 2, r.y + 14, 8, "#ff8a2a", "center");
    c.restore();
  };

  /* ---------------- Random events ---------------- */
  // An event card pauses the game. Two choices: tap a button, or Left / Right (A / B), or 1 / 2.
  // ev = { title, text, a: { label, run: fn -> result line }, b: { ... } }
  var cur = null;
  // true while the game's own on-screen message, a trophy popup or a streak pill is showing;
  // event cards wait until these clear
  X.busy = function () {
    var f = document.getElementById("np-flash");
    if (f && /(^|\s)on(\s|$)/.test(f.className)) return true;
    if (document.querySelector(".npt-wrap .npt")) return true;
    if (document.getElementById("npr-pill")) return true;
    return false;
  };
  X.eventActive = function () { return !!cur; };
  X.eventState = function () { return cur ? { title: cur.ev.title, result: cur.result } : null; };   // for automated checks
  // opts.noSpace: Space and Enter never pick a choice (Rink Rat Shootout shoots with Space); use 1 / 2 or taps
  X.startEvent = function (ev, opts) {
    cur = { ev: ev, t: 0, result: null, rt: 0, noSpace: !!(opts && opts.noSpace) };
    bindMargins();
    var S = shell(); if (S) S.sfx("score");
  };
  function choose(which) {
    if (!cur || cur.result) return;
    var opt = which === "a" ? cur.ev.a : cur.ev.b;
    cur.result = (opt.run && opt.run()) || "";
    cur.rt = 0;
    var S = shell(); if (S) S.tone(which === "a" ? 880 : 660, 0.06, "square", 0.15);
  }
  X.eventTick = function (dt) {
    if (!cur) return;
    cur.t += dt;
    if (cur.result != null) { cur.rt += dt; if (cur.rt > 1.6) cur = null; return; }
    if (cur.t > 8) choose("b");   // nobody answered: walk on
  };
  var BTN = { a: { x: 34, y: 0, w: 140, h: 48 }, b: { x: 186, y: 0, w: 140, h: 48 } };
  X.eventPointer = function (type, x, y) {
    if (!cur || type !== "up" && type !== "down") return;
    if (type !== "down") return;
    if (cur.result != null) { if (cur.rt > 0.4) cur.rt = 9; return; }
    // big targets on any phone: the whole left half picks the first choice, the right half the second
    if (y > 120) choose(x < 180 ? "a" : "b");
  };
  X.eventKey = function (type, code) {
    if (!cur || type !== "down") return;
    var one = code === "Digit1" || code === "Numpad1", two = code === "Digit2" || code === "Numpad2";
    if (cur.noSpace) {   // 1 / 2 keys and taps only
      if (cur.result != null) { if (cur.rt > 0.4 && (one || two)) cur.rt = 9; return; }
      if (one) choose("a"); else if (two) choose("b");
      return;
    }
    if (cur.result != null) { if (cur.rt > 0.4 && (code === "Space" || code === "Enter")) cur.rt = 9; return; }
    if (code === "ArrowLeft" || one || code === "KeyA" || code === "Space" || code === "Enter") choose("a");
    else if (code === "ArrowRight" || two || code === "KeyB") choose("b");
  };
  // Landscape and wide screens: taps in the empty side margins next to the game count too
  // (left margin = first choice, right margin = second choice).
  var marginsBound = false;
  function bindMargins() {
    if (marginsBound) return;
    marginsBound = true;
    document.addEventListener("pointerdown", function (e) {
      if (!cur) return;
      var S = shell(); if (S && S.state && S.state() !== "playing") return;
      var stage = document.getElementById("np-stage") || document.querySelector(".np-stage");
      var cv = stage && stage.querySelector("canvas");
      if (!cv || e.target === cv || !stage.contains(e.target)) return;
      if (e.target.closest && e.target.closest("a,button")) return;
      var r = cv.getBoundingClientRect();
      e.preventDefault(); e.stopImmediatePropagation();
      if (cur.result != null) { if (cur.rt > 0.4) cur.rt = 9; return; }
      if (e.clientX < r.left) choose("a");
      else if (e.clientX > r.right) choose("b");
      else if (e.clientY > r.top + r.height * (120 / ((S && S.H) || 540))) choose(e.clientX < r.left + r.width / 2 ? "a" : "b");
    }, true);
  }
  // how much bigger to draw the card when the game is shown small (landscape phones)
  function cardZoom(H) {
    var cv = document.querySelector(".np-stage canvas");
    if (!cv) return 1;
    var h = cv.getBoundingClientRect().height;
    if (!(h > 0)) return 1;
    var s = h / H;
    return s >= 0.85 ? 1 : Math.min(1.6, 0.85 / s);
  }
  function wrap(c, text, maxW) {
    var words = text.split(" "), lines = [], line = "";
    for (var i = 0; i < words.length; i++) { var tt = line ? line + " " + words[i] : words[i]; if (c.measureText(tt).width > maxW && line) { lines.push(line); line = words[i]; } else line = tt; }
    if (line) lines.push(line); return lines;
  }
  X.drawEvent = function (c, W, H) {
    if (!cur) return;
    var S = shell(), ev = cur.ev, z = cardZoom(H);
    var fs = Math.round(11 * z), lh = Math.round(15 * z), small = Math.round(8 * z), bh = Math.round(48 * z);
    c.font = fs + 'px "Silkscreen", monospace';
    var lines = wrap(c, cur.result != null ? cur.result : ev.text, W - 64).slice(0, 5);
    var h = Math.round(12 + 8 * z + 6 + 12 * z + 12) + Math.max(3, lines.length) * lh + 14 + bh + 22, top = Math.max(60, Math.round((H - h) / 2));
    c.fillStyle = "rgba(5,6,10,.72)"; c.fillRect(0, 0, W, H);
    c.fillStyle = "#1d2029"; c.fillRect(14, top, W - 28, h);
    c.strokeStyle = "#ffd23f"; c.lineWidth = 2; c.strokeRect(15, top + 1, W - 30, h - 2);
    var y = top + 12;
    S.text(c, "RANDOM EVENT", W / 2, y, Math.round(8 * z), "#8e93a2", "center"); y += Math.round(8 * z) + 8;
    S.text(c, ev.title.toUpperCase(), W / 2, y, Math.min(16, Math.round(12 * z)), "#ffd23f", "center"); y += Math.round(12 * z) + 12;
    for (var i = 0; i < lines.length; i++) S.uiText(c, lines[i], W / 2, y + i * lh, fs, cur.result != null ? "#9bff3f" : "#eceae2", "center");
    var by = top + h - bh - 22, bw = Math.round((W - 28 - 36) / 2);
    BTN.a = { x: 26, y: by, w: bw, h: bh }; BTN.b = { x: W - 26 - bw, y: by, w: bw, h: bh };
    if (cur.result == null) {
      [["a", "#ffd23f"], ["b", "#8e93a2"]].forEach(function (p) {
        var b = BTN[p[0]], opt = ev[p[0]];
        c.fillStyle = p[1]; c.fillRect(b.x, b.y, b.w, b.h);
        c.fillStyle = "#101219"; c.fillRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
        S.uiText(c, opt.label.toUpperCase(), b.x + b.w / 2, b.y + Math.round(10 * z), fs, p[1], "center");
        S.uiText(c, p[0] === "a" ? "LEFT SIDE OR 1" : "RIGHT SIDE OR 2", b.x + b.w / 2, b.y + bh - small - Math.round(8 * z), small, "#8e93a2", "center");
      });
      var k = Math.max(0, 1 - cur.t / 8);
      c.fillStyle = "#3a3e4c"; c.fillRect(30, top + h - 12, W - 60, 3); c.fillStyle = "#ffd23f"; c.fillRect(30, top + h - 12, (W - 60) * k, 3);
    } else S.uiText(c, "TAP TO CONTINUE", W / 2, by + Math.round(bh / 2) - 4, Math.round(9 * z), "#8e93a2", "center");
  };
  // schedule helper: returns true once when the timer passes the next event time
  X.Scheduler = function (first, gap, max) { this.next = first + Math.random() * gap; this.gap = gap; this.left = max || 2; };
  X.Scheduler.prototype.ready = function (t) { return this.left > 0 && t >= this.next; };
  X.Scheduler.prototype.due = function (t) { if (this.left <= 0 || t < this.next || X.busy()) return false; this.left--; this.next = t + this.gap * (0.8 + Math.random() * 0.6); return true; };
  X.coin = function (p) { return Math.random() < (p == null ? 0.5 : p); };
  X.pick = pick;
})();
