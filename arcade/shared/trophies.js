/* Arcade trophies: storage, unlocks, run-end checks, toast, codes. Load after trophy-list.js.
   Everything stays on the device. */
(function () {
  "use strict";
  var KEY = "npTrophies.arcade.v1", GKEY = "npTrophies.game.v1", JAR = "npArcade.ticket-roll-alley.jar";
  var L = window.NP_TROPHIES_ARCADE || { games: [], meta: [], tiers: {} };
  var mem = {};

  function rd(k) { try { var v = localStorage.getItem(k); return v == null ? (mem[k] == null ? null : mem[k]) : v; } catch (e) { return mem[k] == null ? null : mem[k]; } }
  function wr(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) { } }
  function now() { return Math.floor(Date.now() / 1000); }
  function num(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : 0; }

  var all = [], byId = {}, byN = {}, i, j;
  for (i = 0; i < L.games.length; i++) for (j = 0; j < L.games[i].trophies.length; j++) all.push(L.games[i].trophies[j]);
  for (i = 0; i < L.meta.length; i++) all.push(L.meta[i]);
  for (i = 0; i < all.length; i++) { byId[all[i].id] = all[i]; byN[all[i].n] = all[i]; }

  function blank() { return { v: 1, u: {}, c: { runs: 0, days: [], bests: 0, played: {} }, seen: 0 }; }
  function shape(s) {
    if (!s || typeof s !== "object") s = blank();
    if (!s.u || typeof s.u !== "object") s.u = {};
    if (!s.c || typeof s.c !== "object") s.c = {};
    var c = s.c;
    c.runs = num(c.runs); c.bests = num(c.bests);
    if (!Array.isArray(c.days)) c.days = [];
    if (!c.played || typeof c.played !== "object") c.played = {};
    if (!s.v) s.v = 1;
    if (!s.seen) s.seen = 0;
    return s;
  }
  function load(k) { var s = null; try { s = JSON.parse(rd(k) || "null"); } catch (e) { s = null; } return shape(s); }
  var S = load(KEY);
  function save() { wr(KEY, JSON.stringify(S)); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }

  var runGot = [];

  function unlock(id, silent) {
    S = load(KEY);
    if (!byId[id] || S.u[id] || byId[id].retired) return false;
    S.u[id] = now();
    save();
    runGot.push(id);
    if (!silent) toast(byId[id]);
    return true;
  }
  function has(id) { return !!S.u[id]; }

  function checkMeta(ctx, silent) {
    for (var k = 0; k < L.meta.length; k++) {
      var t = L.meta[k];
      try { if (!S.u[t.id] && t.check && t.check(S, ctx)) unlock(t.id, silent); } catch (e) { }
    }
  }

  function gameOf(slug) { for (var k = 0; k < L.games.length; k++) if (L.games[k].slug === slug) return L.games[k]; return null; }

  function runEnd(slug, stats, ctx) {
    S = load(KEY);
    var c = S.c, d = today();
    c.runs++;
    c.played[slug] = (c.played[slug] || 0) + 1;
    if (c.days.indexOf(d) < 0) { c.days.push(d); if (c.days.length > 30) c.days = c.days.slice(-30); }
    if (ctx && ctx.newBest) c.bests++;
    save();
    var g = gameOf(slug);
    if (g) for (var k = 0; k < g.trophies.length; k++) {
      var t = g.trophies[k];
      try { if (!S.u[t.id] && t.end && t.end(stats || {}, S)) unlock(t.id); } catch (e) { }
    }
    checkMeta({ hour: new Date().getHours() });
    var names = [];
    for (k = 0; k < runGot.length; k++) names.push(byId[runGot[k]].name);
    return names;
  }

  function count(slug) {
    var list = slug ? (slug === "meta" ? L.meta : (gameOf(slug) || { trophies: [] }).trophies) : all;
    var got = 0, total = 0;
    for (var k = 0; k < list.length; k++) { if (list[k].retired) continue; total++; if (S.u[list[k].id]) got++; }
    return { got: got, total: total };
  }

  var css = ".npt-wrap{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 62px);transform:translateX(-50%);z-index:60;width:min(320px,calc(100vw - 32px));pointer-events:none}" +
    ".npt{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#1d2029;border:2px solid #2c3040;border-radius:8px;color:#eceae2;font-family:Silkscreen,monospace;animation:npt .15s}" +
    ".npt b{display:block;font-size:11px;color:#ffd23f}.npt span{display:block;font-size:14px}.npt i{display:block;font-style:normal;font-size:11px;color:#8e93a2}" +
    ".npt-ic{flex:none;position:relative;width:22px;height:28px;background:#ff4b3e;border:2px solid #0b0c10;box-shadow:inset 4px 0 #eceae2}" +
    ".npt-loose{height:20px;background:#8d8f99;box-shadow:inset 0 -6px #ffd23f}.npt-sealed{background:#3ff0ff}" +
    ".npt-sealed::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,#fff8 20%,#0000 21% 60%,#fff6 61% 66%,#0000 67%)}" +
    ".npt-slabbed{background:#a77bff;outline:3px solid #cfe9f2}" +
    ".npt-wrap.npt-low{top:auto;bottom:calc(env(safe-area-inset-bottom) + 14px)}" +
    "@keyframes npt{from{transform:translateY(-12px);opacity:0}}@media (prefers-reduced-motion:reduce){.npt{animation:none}}";
  var wrap = null, queue = [], showing = false, left = 0, timer = 0;

  function ensure() {
    if (wrap || !document.body) return;
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    wrap = document.createElement("div"); wrap.className = "npt-wrap"; wrap.setAttribute("aria-live", "polite"); wrap.setAttribute("role", "status");
    document.body.appendChild(wrap);
  }
  function toast(t) { queue.push(t); if (!showing) next(); }
  function blip() {
    var Sh = window.Shell, R = window.NPRewards;
    // shared/rewards.js (optional): richer sting + a short confetti burst from the toast.
    if (R) { R.sting("trophy"); setTimeout(function () { R.burstAt(wrap && wrap.firstChild, 36); }, 60); return; }
    if (Sh && Sh.tone) { Sh.tone(988, 0.06, "triangle", 0.18); Sh.tone(1319, 0.12, "triangle", 0.18, 0, 0.07); }
  }
  function next() {
    ensure();
    if (!wrap) return;
    if (!queue.length) { showing = false; wrap.innerHTML = ""; return; }
    showing = true;
    var t = queue.shift(), html;
    if (queue.length >= 3) {
      var more = queue.length; queue = [{ more: more }];
    }
    if (t.more) html = '<div class="npt"><div class="npt-ic npt-boxed" aria-hidden="true"></div><div><b>ON THE SHELF</b><span>+' + t.more + ' more on the shelf</span></div></div>';
    else html = '<div class="npt"><div class="npt-ic npt-' + t.tier + '" aria-hidden="true"></div><div><b>ON THE SHELF</b><span>' + esc(t.name) + '</span><i>' + (L.tiers[t.tier] ? L.tiers[t.tier].word : "") + '</i></div></div>';
    wrap.innerHTML = html;
    low();
    blip();
    left = 2800;
    clearInterval(timer);
    timer = setInterval(function () {
      var Sh = window.Shell;
      low();
      if (document.hidden || (Sh && Sh.state && Sh.state() === "paused")) return;
      left -= 100;
      if (left <= 0) { clearInterval(timer); next(); }
    }, 100);
  }
  // On the game-over card the toast drops to the bottom edge so it never covers the score at the top.
  function low() {
    var Sh = window.Shell, over = false;
    try { over = !!(Sh && Sh.state && Sh.state() === "over"); } catch (e) { }
    if (wrap) wrap.classList.toggle("npt-low", over);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; }); }

  // Code: NPS1- + Crockford base32 of [ver][na][arcade bits][ng][game bits][runs u16][days u8][bests u16][jar u24][crc16]
  var B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

  function crc16(b) {
    var c = 0xffff;
    for (var k = 0; k < b.length; k++) {
      c ^= b[k] << 8;
      for (var x = 0; x < 8; x++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    }
    return c;
  }
  function bitsOut(out, slots, nbits) {
    var bytes = Math.ceil(nbits / 8), arr = [];
    for (var k = 0; k < bytes; k++) arr.push(0);
    for (k = 0; k < slots.length; k++) if (slots[k] < nbits) arr[slots[k] >> 3] |= 1 << (slots[k] & 7);
    out.push(nbits);
    for (k = 0; k < arr.length; k++) out.push(arr[k]);
  }
  function gameSave() { return load(GKEY); }
  function gameList() { return (window.NP_TROPHIES_GAME && window.NP_TROPHIES_GAME.trophies) || []; }
  function gameSlots(gs) {
    var gl = gameList(), slots = (gs.c.xb || []).slice();
    for (var k = 0; k < gl.length; k++) if (gs.u[gl[k].id] && slots.indexOf(gl[k].n) < 0) slots.push(gl[k].n);
    return slots;
  }

  function exportCode() {
    S = load(KEY);
    var aSlots = (S.c.xa || []).slice(), maxA = 0, k;
    for (k = 0; k < all.length; k++) maxA = Math.max(maxA, all[k].n + 1);
    for (k = 0; k < aSlots.length; k++) maxA = Math.max(maxA, aSlots[k] + 1);
    for (var id in S.u) if (byId[id] && aSlots.indexOf(byId[id].n) < 0) aSlots.push(byId[id].n);
    var gs = gameSave(), gSlots = gameSlots(gs), maxG = 0;
    for (k = 0; k < gSlots.length; k++) maxG = Math.max(maxG, gSlots[k] + 1);
    var gl = gameList();
    for (k = 0; k < gl.length; k++) maxG = Math.max(maxG, gl[k].n + 1);
    var out = [1];
    bitsOut(out, aSlots, Math.min(255, maxA));
    bitsOut(out, gSlots, Math.min(255, maxG));
    var runs = Math.min(65535, S.c.runs), days = Math.min(255, Math.max(S.c.days.length, S.c.di || 0)), bests = Math.min(65535, S.c.bests);
    var jar = Math.min(16777215, Math.floor(num(rd(JAR))));
    out.push(runs >> 8, runs & 255, days, bests >> 8, bests & 255, (jar >> 16) & 255, (jar >> 8) & 255, jar & 255);
    var c = crc16(out); out.push(c >> 8, c & 255);
    var s = "", buf = 0, n = 0;
    for (k = 0; k < out.length; k++) { buf = (buf << 8) | out[k]; n += 8; while (n >= 5) { s += B32[(buf >> (n - 5)) & 31]; n -= 5; } buf &= (1 << n) - 1; }
    if (n > 0) s += B32[(buf << (5 - n)) & 31];
    return "NPS1-" + s.match(/.{1,4}/g).join("-");
  }

  function parse(str) {
    var s = String(str || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (s.indexOf("NPS1") !== 0) return null;
    s = s.slice(4).replace(/O/g, "0").replace(/[IL]/g, "1");
    var bytes = [], buf = 0, n = 0, k;
    for (k = 0; k < s.length; k++) {
      var v = B32.indexOf(s[k]);
      if (v < 0) return null;
      buf = (buf << 5) | v; n += 5;
      if (n >= 8) { bytes.push((buf >> (n - 8)) & 255); n -= 8; buf &= (1 << n) - 1; }
    }
    var p = 0;
    function take() { if (p >= bytes.length) throw 0; return bytes[p++]; }
    function bits() {
      var nb = take(), arr = [], slots = [];
      for (var q = 0; q < Math.ceil(nb / 8); q++) arr.push(take());
      for (q = 0; q < nb; q++) if (arr[q >> 3] & (1 << (q & 7))) slots.push(q);
      return slots;
    }
    try {
      if (take() !== 1) return null;
      var a = bits(), g = bits();
      var r = { a: a, g: g, runs: take() * 256 + take(), days: take(), bests: take() * 256 + take() };
      r.jar = take() * 65536 + take() * 256 + take();
      var end = p, c = take() * 256 + take();
      if (crc16(bytes.slice(0, end)) !== c) return null;
      return r;
    } catch (e) { return null; }
  }

  function importCode(str) {
    var r = parse(str);
    if (!r) return { ok: false, msg: "That code didn't scan. Check for a typo." };
    S = load(KEY);
    var added = 0, k, t = now();
    S.c.xa = S.c.xa || [];
    for (k = 0; k < r.a.length; k++) {
      var tr = byN[r.a[k]];
      if (tr) { if (!S.u[tr.id]) { S.u[tr.id] = t; added++; } }
      else if (S.c.xa.indexOf(r.a[k]) < 0) S.c.xa.push(r.a[k]);
    }
    S.c.runs = Math.max(S.c.runs, r.runs);
    S.c.bests = Math.max(S.c.bests, r.bests);
    S.c.di = Math.max(S.c.di || 0, r.days);
    if (!S.c.xa.length) delete S.c.xa;
    save();
    if (r.jar > num(rd(JAR))) wr(JAR, String(r.jar));
    if (r.g.length) {
      var gs = gameSave(), gl = gameList(), gByN = {};
      for (k = 0; k < gl.length; k++) gByN[gl[k].n] = gl[k];
      gs.c.xb = gs.c.xb || [];
      for (k = 0; k < r.g.length; k++) {
        var gt = gByN[r.g[k]];
        if (gt) { if (!gs.u[gt.id]) { gs.u[gt.id] = t; added++; } }
        else if (gs.c.xb.indexOf(r.g[k]) < 0) { gs.c.xb.push(r.g[k]); added++; }
      }
      wr(GKEY, JSON.stringify(gs));
    }
    var before = runGot.length;
    checkMeta(null, true);
    added += runGot.length - before;
    return { ok: true, added: added, arcade: r.a.length, game: r.g.length };
  }

  window.Trophies = {
    list: L, all: all, byId: byId,
    unlock: function (id) { return unlock(id, false); },
    has: has,
    startRun: function () { runGot = []; },
    runEnd: runEnd,
    count: count,
    save: function () { S = load(KEY); return S; },
    gameSave: gameSave,
    markSeen: function () { S = load(KEY); S.seen = now(); save(); },
    exportCode: exportCode,
    importCode: importCode,
    peekCode: parse
  };
})();
