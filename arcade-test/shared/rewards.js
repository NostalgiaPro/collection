/* Arcade rewards: "so close" line, personal best banner, score count-up, confetti + stings,
   in-game streak popups, and the hub "Next trophy" helpers. Load after trophies.js.
   Everything stays on the device. No network requests. Optional: games and shells
   only call it through `if (window.NPRewards)`. */
(function () {
  "use strict";
  var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var TIER_ORDER = { loose: 0, boxed: 1, sealed: 2, slabbed: 3 };

  function rd(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function wr(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { } }
  function comma(n) { n = Math.round(Math.abs(n)); return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; }); }
  function T() { return window.Trophies; }
  function tone(f, d, type, v, fe, dl) { var S = window.Shell; if (S && S.tone) S.tone(f, d, type, v, fe, dl); }

  /* ---------------- Goals (score-type trophies, `goal` field in trophy-list.js) ----------------
     goal: { stat, at, unit, one, low, margin, fromBest }
       stat     key in the run's stats object
       at       threshold (>= at, or <= at when low)
       unit/one plural/singular unit for the "so close" line
       low      lower is better (golf)
       margin   optional fixed margin; default is 25% of the threshold (rounded up, at least 1)
       fromBest the game's saved best score is the same number as this stat (used on the hub) */
  function gameOf(slug) {
    var Tr = T(); if (!Tr) return null;
    var g = Tr.list.games;
    for (var i = 0; i < g.length; i++) if (g[i].slug === slug) return g[i];
    return null;
  }
  function goals(slug, includeOwned) {
    var g = gameOf(slug), out = [], Tr = T();
    if (!g) return out;
    for (var i = 0; i < g.trophies.length; i++) {
      var t = g.trophies[i];
      if (!t.goal || t.retired || t.secret) continue;
      if (!includeOwned && Tr.has(t.id)) continue;
      out.push(t);
    }
    return out;
  }
  function margin(goal) { return goal.margin != null ? goal.margin : Math.max(1, Math.ceil(Math.abs(goal.at) * 0.25)); }
  function gapOf(goal, v) { return goal.low ? v - goal.at : goal.at - v; }
  // Nearest locked score-type trophy within its margin. null when none is close.
  function soClose(slug, stats) {
    var list = goals(slug), best = null;
    for (var i = 0; i < list.length; i++) {
      var gl = list[i].goal, v = Number(stats && stats[gl.stat]);
      if (!isFinite(v)) continue;
      var gap = gapOf(gl, v), m = margin(gl);
      if (gap <= 0 || gap > m) continue;
      var r = gap / m;
      if (!best || r < best.r) best = { t: list[i], gap: gap, r: r };
    }
    return best;
  }
  function closeText(c) {
    var gl = c.t.goal, unit = c.gap === 1 ? (gl.one || gl.unit) : gl.unit;
    return comma(c.gap) + " " + unit + " from " + c.t.name + ".";
  }

  // Best value per goal stat, so the hub can say how far the next trophy is.
  function statKey(slug) { return "npArcade." + slug + ".statBest"; }
  function statBests(slug) { var o = null; try { o = JSON.parse(rd(statKey(slug)) || "null"); } catch (e) { } return o && typeof o === "object" ? o : {}; }
  function saveStats(slug, stats) {
    var o = statBests(slug), list = goals(slug, true), ch = false;
    for (var i = 0; i < list.length; i++) {
      var gl = list[i].goal, v = Number(stats && stats[gl.stat]);
      if (!isFinite(v)) continue;
      var cur = o[gl.stat];
      if (cur == null || (gl.low ? v < cur : v > cur)) { o[gl.stat] = v; ch = true; }
    }
    if (ch) wr(statKey(slug), JSON.stringify(o));
  }

  /* Hub: the closest locked trophy for a game.
     1. a score-type trophy whose gap from your best is within its margin (smallest first)
     2. otherwise the lowest tier locked trophy (list order), with "x to go" if it is score-type */
  function nextFor(slug) {
    var g = gameOf(slug), Tr = T();
    if (!g || !Tr) return null;
    var sb = statBests(slug), bestScore = null, raw = rd("npArcade." + slug + ".best");
    if (raw !== null && raw !== "" && isFinite(Number(raw))) bestScore = Number(raw);
    function have(gl) {
      var v = sb[gl.stat];
      if (v == null && gl.fromBest && bestScore != null) v = bestScore;
      return v == null ? null : v;
    }
    var close = null, easy = null;
    for (var i = 0; i < g.trophies.length; i++) {
      var t = g.trophies[i];
      if (t.retired || t.secret || Tr.has(t.id)) continue;
      if (t.goal) {
        var v = have(t.goal);
        if (v != null) {
          var gap = gapOf(t.goal, v), m = margin(t.goal);
          if (gap > 0 && gap <= m && (!close || gap / m < close.r)) close = { t: t, gap: gap, r: gap / m };
        }
      }
      if (!easy || TIER_ORDER[t.tier] < TIER_ORDER[easy.tier]) easy = t;
    }
    if (close) { var u1 = close.gap === 1 ? (close.t.goal.one || close.t.goal.unit) : close.t.goal.unit; return { t: close.t, gap: close.gap, text: comma(close.gap) + " " + u1 + " to go." }; }
    if (!easy) return null;
    var out = { t: easy, gap: null, text: "" };
    if (easy.goal) {
      var hv = have(easy.goal);
      if (hv != null) { var gp = gapOf(easy.goal, hv); if (gp > 0) { out.gap = gp; out.text = comma(gp) + " " + (gp === 1 ? (easy.goal.one || easy.goal.unit) : easy.goal.unit) + " to go."; } }
    }
    return out;
  }

  /* ---------------- Styles (game pages only) ---------------- */
  var css =
    ".npr-close{margin:0 0 14px;font:700 14px/1.45 var(--ui,sans-serif);color:#3ff0ff}" +
    ".np-newbest.on{margin:0 0 12px;padding:8px 10px;border:2px solid #ffd23f;border-radius:8px;background:rgba(255,210,63,.1)}" +
    ".np-newbest.on strong{animation:npr-pop .45s cubic-bezier(.3,1.6,.6,1) both}" +
    ".np-newbest.on span{margin-top:4px}" +
    "#np-ov-over .np-actions [data-act=again]{min-height:68px;font-size:20px;letter-spacing:1px;width:100%}" +
    ".npr-pill{position:absolute;left:50%;top:50%;z-index:4;pointer-events:none;transform:translateX(-50%);" +
      "padding:6px 12px;border-radius:999px;background:#101219e6;border:2px solid var(--pc,#ffd23f);color:var(--pc,#ffd23f);" +
      "font:400 13px/1.2 'Press Start 2P',monospace;white-space:nowrap;text-shadow:2px 2px 0 #000;animation:npr-pill 1.1s ease-out both}" +
    ".npr-fx{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:65}" +
    "@keyframes npr-pop{from{transform:scale(.6);opacity:0}}" +
    "@keyframes npr-pill{0%{transform:translateX(-50%) scale(.7);opacity:0}15%{transform:translateX(-50%) scale(1.06);opacity:1}25%{transform:translateX(-50%) scale(1)}80%{opacity:1}100%{transform:translateX(-50%) translateY(-10px);opacity:0}}" +
    "@media (max-width:420px){.npr-pill{font-size:11px}#np-ov-over .np-actions [data-act=again]{font-size:17px;min-height:64px}}" +
    "@media (prefers-reduced-motion:reduce){.np-newbest.on strong,.npr-pill{animation:none}.npr-pill{opacity:1}}";
  var styled = false;
  function style() {
    if (styled || !document.head) return;
    styled = true;
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  }
  // The shell builds the card before this runs on a game page; style it right away.
  if (document.readyState !== "loading") setTimeout(function () { if (document.getElementById("np-ov-over")) style(); }, 0);
  document.addEventListener("DOMContentLoaded", function () { if (document.getElementById("np-ov-over")) style(); });

  /* ---------------- Confetti (one shared canvas, removed when done) ---------------- */
  var fx = null, fctx = null, parts = [], raf = 0, lastT = 0;
  var COLORS = ["#ffd23f", "#3ff0ff", "#ff3fa4", "#9bff3f", "#eceae2"];
  function burst(x, y, n) {
    if (reduced || !document.body) return;
    if (x == null) { x = window.innerWidth / 2; y = window.innerHeight * 0.3; }
    n = Math.min(n || 36, 60);
    if (!fx) {
      fx = document.createElement("canvas"); fx.className = "npr-fx"; fx.setAttribute("aria-hidden", "true");
      document.body.appendChild(fx);
      fctx = fx.getContext("2d");
    }
    var d = Math.min(2, window.devicePixelRatio || 1);
    if (fx.width !== Math.round(innerWidth * d)) { fx.width = Math.round(innerWidth * d); fx.height = Math.round(innerHeight * d); }
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 180 + Math.random() * 260;
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: 3 + Math.random() * 4, c: COLORS[i % COLORS.length], life: 0.9 + Math.random() * 0.5, t: 0, r: Math.random() * 6 });
    }
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(step); }
  }
  function step(now) {
    var dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    var d = fx.width / innerWidth;
    fctx.setTransform(d, 0, 0, d, 0, 0);
    fctx.clearRect(0, 0, innerWidth, innerHeight);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.vy += 520 * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 8;
      fctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      fctx.fillStyle = p.c;
      fctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s * (0.5 + 0.5 * Math.abs(Math.sin(p.r))));
    }
    fctx.globalAlpha = 1;
    if (parts.length) raf = requestAnimationFrame(step);
    else { raf = 0; if (fx && fx.parentNode) fx.parentNode.removeChild(fx); fx = null; fctx = null; }
  }
  function burstAt(el, n) {
    if (!el || !el.getBoundingClientRect) return burst(null, null, n);
    var r = el.getBoundingClientRect();
    if (!r.width) return burst(null, null, n);
    burst(r.left + r.width / 2, r.top + r.height / 2, n);
  }

  /* ---------------- Stings (shell sound, so mute is respected) ---------------- */
  function sting(kind) {
    if (kind === "trophy") { tone(784, 0.07, "triangle", 0.2); tone(1175, 0.08, "triangle", 0.2, 0, 0.07); tone(1568, 0.18, "triangle", 0.2, 0, 0.14); tone(2093, 0.12, "sine", 0.08, 0, 0.2); }
    else if (kind === "best") { tone(1047, 0.08, "square", 0.12, 0, 0.62); tone(1319, 0.08, "square", 0.12, 0, 0.7); tone(1568, 0.22, "square", 0.12, 0, 0.78); }
  }

  /* ---------------- Game over ---------------- */
  var countTok = 0;
  function countUp(el, to, fmt, ms) {
    var tok = ++countTok;
    if (!el || reduced || !isFinite(to) || to === 0) return;
    var from = 0, steps = Math.min(24, Math.max(6, Math.abs(Math.round(to))));
    ms = ms || 750;
    var t0 = performance.now(), lastShown = null, ticks = 0;
    el.textContent = fmt(from);
    function f(now) {
      if (tok !== countTok) return;
      var k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      var v = Math.round(from + (to - from) * Math.round(e * steps) / steps);
      if (v !== lastShown) { lastShown = v; el.textContent = fmt(v); if (ticks++ % 2 === 0 && k < 1) tone(1400 + 600 * e, 0.018, "square", 0.05); }
      if (k < 1) requestAnimationFrame(f); else el.textContent = fmt(to);
    }
    requestAnimationFrame(f);
  }

  // info: { slug, score, prev, isNew (beat a saved best), fmt, stats }
  function over(info) {
    style();
    var stats = info.stats || {};
    saveStats(info.slug, stats);
    // So close line
    var row = document.getElementById("npr-close");
    if (!row) {
      var after = document.getElementById("np-over-tro");
      if (after && after.parentNode) {
        row = document.createElement("p"); row.id = "npr-close"; row.className = "npr-close"; row.hidden = true;
        after.parentNode.insertBefore(row, after.nextSibling);
      }
    }
    if (row) {
      var c = soClose(info.slug, stats);
      row.textContent = c ? closeText(c) : "";
      row.hidden = !c;
    }
    // Count the score up
    countUp(document.getElementById("np-over-score"), Number(info.score), info.fmt);
    // PB burst + sting (banner itself is set by the shell)
    if (info.isNew) {
      sting("best");
      setTimeout(function () { burstAt(document.getElementById("np-newbest"), 44); }, 380);
    }
  }

  /* ---------------- Streak popups ---------------- */
  var pillT = 0;
  function streakLabel(n) { return n === 2 ? "2 IN A ROW!" : n === 3 ? "HEATING UP" : "ON FIRE x" + n; }
  function streak(n, label, color) {
    if (!label && n < 2) return;
    var st = document.getElementById("np-stage");
    if (!st) return;
    style();
    var el = document.getElementById("npr-pill");
    if (el) el.parentNode.removeChild(el);
    el = document.createElement("div"); el.id = "npr-pill"; el.className = "npr-pill"; el.setAttribute("aria-hidden", "true");
    el.style.setProperty("--pc", color || (n >= 4 ? "#ff4b3e" : n === 3 ? "#ffd23f" : "#3ff0ff"));
    el.textContent = label || streakLabel(n);
    st.appendChild(el);
    tone(660 + Math.min(n, 8) * 90, 0.05, "square", 0.12); tone(880 + Math.min(n, 8) * 110, 0.08, "square", 0.12, 0, 0.05);
    clearTimeout(pillT);
    pillT = setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1150);
  }

  window.NPRewards = {
    over: over, streak: streak, streakLabel: streakLabel,
    burst: burst, burstAt: burstAt, sting: sting,
    soClose: soClose, closeText: closeText, nextFor: nextFor, goals: goals, margin: margin, reduced: reduced
  };
})();
