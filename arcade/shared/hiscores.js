/* Nostalgia Pro Arcade: classic top 10 high score table on the game over card.
   A nod to old arcade cabinets: every game ships with a pre-filled board of made-up players, and a
   run that beats the bottom row gets to enter three initials. Player entries are saved on this
   device only (localStorage "npArcade.<slug>.hiscores"), on top of the made-up seeds.
   The shell calls NPHiScores.over({ slug, score, fmt, lower }) from Shell.gameOver.
   Optional: shells only call it through `if (window.NPHiScores)`. No network requests. */
(function () {
  "use strict";
  var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var SIZE = 10, LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  /* Made-up boards, best first. Scores are calibrated to each game's real range (sims, trophy
     tiers, test play): a decent run lands mid-table and a great run can take #1.
     Lower is better for Shelf Links (strokes vs par) and Pawn Shop Pool (seconds). */
  var SEEDS = {
    "shelf-links":         [["ACE", -4], ["JMS", -3], ["PAR", -2], ["ZAP", -1], ["MOM", 0], ["NPR", 1], ["BOB", 2], ["CPU", 3], ["DAD", 5], ["AAA", 8]],
    "bargain-bin-buckets": [["JMS", 200], ["ZAP", 165], ["ACE", 138], ["MAX", 116], ["NPR", 98], ["MOM", 84], ["BOB", 72], ["KID", 60], ["CPU", 48], ["AAA", 36]],
    "bleacher-carts":      [["ZAP", 12400], ["BOB", 10900], ["ACE", 9600], ["JMS", 8500], ["MAX", 7500], ["CPU", 6600], ["NPR", 5800], ["MOM", 5000], ["DAD", 4200], ["AAA", 3300]],
    "tape-pin-lanes":      [["BOB", 236], ["ACE", 212], ["MOM", 194], ["NPR", 178], ["JMS", 164], ["VHS", 151], ["ZAP", 138], ["DAD", 124], ["CPU", 110], ["AAA", 96]],
    "ticket-roll-alley":   [["MOM", 610], ["JMS", 540], ["ZAP", 480], ["ACE", 430], ["BOB", 390], ["NPR", 350], ["KID", 310], ["CPU", 270], ["SAM", 230], ["AAA", 190]],
    "fourth-and-collect":  [["ACE", 480], ["MAX", 425], ["NPR", 360], ["BOB", 300], ["JMS", 270], ["DAD", 245], ["ZAP", 195], ["MOM", 150], ["CPU", 110], ["AAA", 75]],
    "creature-feature-ko": [["CPU", 15200], ["ZAP", 14000], ["BOO", 12800], ["ACE", 11600], ["JMS", 10400], ["MOM", 9000], ["NPR", 7500], ["BOB", 5800], ["DAD", 4000], ["AAA", 2200]],
    "gravy-or-bust":       [["MOM", 6000], ["DAD", 5750], ["ACE", 5500], ["NPR", 5200], ["PIE", 4900], ["JMS", 4550], ["BOB", 4150], ["ZAP", 3700], ["CPU", 3150], ["AAA", 2500]],
    "mall-santa-dash":     [["JOY", 50000], ["ACE", 43000], ["MOM", 37000], ["ZAP", 31500], ["JMS", 26500], ["BOB", 22000], ["NPR", 18000], ["ELF", 14500], ["CPU", 11000], ["AAA", 8000]],
    "pawn-shop-pool":      [["ACE", 170], ["JMS", 195], ["CUE", 215], ["NPR", 235], ["BOB", 255], ["ZAP", 275], ["MOM", 300], ["DAD", 330], ["CPU", 370], ["AAA", 420]],
    "rink-rat-shootout":   [["ZAP", 40], ["ACE", 34], ["JMS", 29], ["BOB", 25], ["MAX", 21], ["NPR", 18], ["MOM", 15], ["KID", 12], ["CPU", 9], ["AAA", 6]],
    "powder-day-haul":     [["RAD", 12800], ["ACE", 11500], ["ZAP", 10300], ["JMS", 9200], ["NPR", 8200], ["BOB", 7200], ["MOM", 6300], ["SKI", 5300], ["CPU", 4200], ["AAA", 3000]],
    "table-rink-rumble":   [["CPU", 43], ["ACE", 35], ["JMS", 32], ["ZAP", 26], ["NPR", 23], ["BOB", 21], ["MAX", 15], ["MOM", 13], ["DAD", 12], ["AAA", 11]]
  };

  function rd(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function wr(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* private mode */ } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function key(slug) { return "npArcade." + slug + ".hiscores"; }
  function clean(n) { n = String(n || "").toUpperCase().replace(/[^A-Z]/g, ""); return (n + "AAA").slice(0, 3); }
  function ordinal(n) { var s = ["TH", "ST", "ND", "RD"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  function saved(slug) {
    var a = null;
    try { a = JSON.parse(rd(key(slug)) || "null"); } catch (e) { a = null; }
    if (!Array.isArray(a)) return [];
    a = a.slice(0, 50);
    return a.filter(function (e) { return e && isFinite(Number(e.s)); }).map(function (e) { return { n: clean(e.n), s: Number(e.s), d: e.d || 0, me: true }; });
  }
  function seeds(slug) {
    return (SEEDS[slug] || []).map(function (p, i) { return { n: p[0], s: p[1], seed: i }; });
  }
  // Best first. On a tie the older entry stays above (classic cabinet rule). Seeds count as oldest.
  function board(slug, lower) {
    var all = seeds(slug).concat(saved(slug));
    all.sort(function (a, b) {
      if (a.s !== b.s) return lower ? a.s - b.s : b.s - a.s;
      var ao = a.seed != null ? -1e15 + a.seed : a.d, bo = b.seed != null ? -1e15 + b.seed : b.d;
      return ao - bo;
    });
    return all;
  }
  function better(a, b, lower) { return lower ? a < b : a > b; }
  // 0-based slot this score would take, or -1 when it does not make the top 10.
  function placeOf(slug, score, lower) {
    if (score == null || !isFinite(score)) return -1;
    var b = board(slug, lower), i = 0;
    while (i < b.length && !better(score, b[i].s, lower)) i++;
    return i < SIZE ? i : -1;
  }
  function commit(slug, lower, entry) {
    var mine = saved(slug).map(function (e) { return { n: e.n, s: e.s, d: e.d }; });
    mine.push({ n: clean(entry.n), s: entry.s, d: entry.d });
    wr(key(slug), JSON.stringify(mine));
    // keep only the player rows that are still on the board
    var top = board(slug, lower).slice(0, SIZE).filter(function (e) { return e.me; });
    wr(key(slug), JSON.stringify(top.map(function (e) { return { n: e.n, s: e.s, d: e.d }; })));
    wr("npArcade.hiInitials", clean(entry.n));
  }

  /* ---------------- Styles ---------------- */
  var styled = false;
  function style() {
    if (styled) return; styled = true;
    var css =
      ".nph{margin:4px 0 16px;padding:12px 8px 10px;border:2px solid var(--line,#2c3040);border-radius:8px;background:#0b0c12;" +
        "font-family:var(--display,'Press Start 2P',monospace);text-align:center}" +
      ".nph-h{margin:0 0 10px;font:400 .8125rem/1.4 var(--display,'Press Start 2P',monospace);color:var(--gold,#ffd23f);letter-spacing:1px;" +
        "text-shadow:0 0 8px rgba(255,210,63,.55)}" +
      ".nph-new{margin:0 0 8px;font:400 .8125rem/1.5 var(--display,'Press Start 2P',monospace);color:#ff3fa4;text-shadow:0 0 10px rgba(255,63,164,.7)}" +
      ".nph-blink{animation:nph-blink .9s steps(1) infinite}" +
      ".nph-sub{margin:0 0 10px;font:400 .875rem/1.4 var(--ui,'Silkscreen',monospace);color:var(--text,#eceae2)}" +
      ".nph-t{width:100%;max-width:300px;margin:0 auto;border-collapse:collapse;font:400 .6875rem/1.25 var(--display,'Press Start 2P',monospace)}" +
      ".nph-t th{padding:0 4px 6px;font:700 .75rem/1.2 var(--ui,'Silkscreen',monospace);color:var(--dim,#8e93a2);letter-spacing:1px}" +
      ".nph-t td{padding:4px 4px;white-space:nowrap}.nph-t td:nth-child(3){white-space:normal;overflow-wrap:anywhere}" +
      ".nph-t td:nth-child(1){text-align:left}.nph-t td:nth-child(2){text-align:center}.nph-t td:nth-child(3){text-align:right}" +
      ".nph-t th:nth-child(1){text-align:left}.nph-t th:nth-child(3){text-align:right}" +
      ".nph-t tr.nph-r td{color:var(--c);animation:nph-cycle 2.4s steps(1) infinite;animation-delay:var(--dl)}" +
      ".nph-t tr.nph-me td{animation:none;color:#101219;background:var(--gold,#ffd23f)}" +
      ".nph-t tr.nph-me.nph-live td{animation:nph-me .9s steps(1) infinite}" +
      ".nph-cur{text-decoration:underline;text-underline-offset:3px}" +
      ".nph-in{margin:0 0 12px}" +
      ".nph-slots{display:flex;justify-content:center;gap:10px;width:max-content;max-width:100%;margin:0 auto 10px;outline:none;border-radius:8px;padding:4px}" +
      ".nph-slots:focus-visible{outline:3px solid var(--gold,#ffd23f);outline-offset:2px}" +
      ".nph-col{display:flex;flex-direction:column;align-items:center;gap:4px}" +
      ".nph-ar,.nph-l{display:inline-flex;align-items:center;justify-content:center;min-width:48px;min-height:44px;padding:0;" +
        "background:var(--bg,#101219);color:var(--text,#eceae2);border:2px solid var(--line,#2c3040);border-radius:6px;cursor:pointer;" +
        "font:400 .875rem/1 var(--display,'Press Start 2P',monospace);touch-action:manipulation;-webkit-user-select:none;user-select:none}" +
      ".nph-l{min-height:56px;min-width:max(48px,1.8em);font-size:1.375rem;color:var(--gold,#ffd23f)}" +
      ".nph-col.on .nph-l{border-color:var(--gold,#ffd23f);box-shadow:0 0 12px rgba(255,210,63,.5)}" +
      ".nph-col.on .nph-l span{animation:nph-blink .9s steps(1) infinite}" +
      ".nph-ok{width:100%;max-width:240px;min-height:48px}" +
      ".nph-hint{margin:8px 0 0;font:400 .75rem/1.4 var(--ui,'Silkscreen',monospace);color:var(--dim,#8e93a2)}" +
      ".nph-done{margin:0 0 10px;font:400 .875rem/1.4 var(--ui,'Silkscreen',monospace);color:var(--lime,#9bff3f)}" +
      ".nph-foot{margin:8px 0 0;font:400 .75rem/1.4 var(--ui,'Silkscreen',monospace);color:var(--dim,#8e93a2)}" +
      "@keyframes nph-blink{50%{opacity:0}}" +
      "@keyframes nph-me{50%{background:transparent;color:var(--gold,#ffd23f)}}" +
      "@keyframes nph-cycle{0%{color:#ff4b3e}16.6%{color:#ffd23f}33.3%{color:#9bff3f}50%{color:#3ff0ff}66.6%{color:#a77bff}83.3%{color:#ff3fa4}}" +
      "@media (max-width:360px){.nph{padding:10px 4px 8px}.nph-t{font-size:.625rem}.nph-t td{padding:4px 2px}.nph-slots{gap:6px}}" +
      "@media (prefers-reduced-motion:reduce){.nph-blink,.nph-t tr.nph-r td,.nph-t tr.nph-me.nph-live td,.nph-col.on .nph-l span{animation:none}}";
    var st = document.createElement("style"); st.id = "nph-style"; st.textContent = css; document.head.appendChild(st);
  }

  /* ---------------- Game over card ---------------- */
  var CYCLE = ["#ff4b3e", "#ffd23f", "#9bff3f", "#3ff0ff", "#a77bff", "#ff3fa4"];
  var cur = null;   // { slug, lower, fmt, score, place, letters[3], pos, done, el }

  function rowsHTML(list, meIdx, live, initials, pos) {
    var h = '<table class="nph-t"><thead><tr><th scope="col">RANK</th><th scope="col">NAME</th><th scope="col">SCORE</th></tr></thead><tbody>';
    for (var i = 0; i < list.length; i++) {
      var e = list[i], me = i === meIdx;
      var name = me && initials ? initials : e.n;
      var nameHTML = esc(name);
      if (me && live) nameHTML = name.split("").map(function (ch, k) { return k === pos ? '<span class="nph-cur">' + esc(ch) + "</span>" : esc(ch); }).join("");
      h += '<tr class="' + (me ? "nph-me" + (live ? " nph-live" : "") : "nph-r") + '" style="--c:' + CYCLE[i % CYCLE.length] + ";--dl:-" + (i * 0.4).toFixed(1) + 's">' +
        "<td>" + ordinal(i + 1) + "</td><td>" + nameHTML + "</td><td>" + esc(cur.fmt(e.s)) + "</td></tr>";
    }
    return h + "</tbody></table>";
  }

  function tableList() {
    var list = board(cur.slug, cur.lower);
    if (cur.place >= 0 && !cur.done) list.splice(cur.place, 0, { n: cur.letters.join(""), s: cur.score, pending: true });
    return list.slice(0, SIZE);
  }

  function render(focusSlots) {
    if (!cur) return;
    var el = cur.el, list = tableList(), meIdx = cur.place, h = "";
    var initials = cur.letters.join("");
    if (cur.place >= 0) h += '<p class="nph-new' + (reduced ? "" : " nph-blink") + '">NEW HIGH SCORE</p>';
    h += '<h3 class="nph-h">HIGH SCORES</h3>';
    if (cur.place >= 0 && !cur.done) {
      h += '<p class="nph-sub">You placed ' + ordinal(cur.place + 1) + ". Enter your initials.</p>" +
        '<div class="nph-in">' +
          '<div class="nph-slots" tabindex="0" role="group" aria-label="Your initials. Up and Down change a letter, Left and Right move, type letters, Enter saves.">';
      for (var k = 0; k < 3; k++) {
        h += '<div class="nph-col' + (k === cur.pos ? " on" : "") + '">' +
          '<button type="button" class="nph-ar" tabindex="-1" data-nph="up" data-k="' + k + '" aria-label="Next letter">&#9650;</button>' +
          '<button type="button" class="nph-l" tabindex="-1" data-nph="pick" data-k="' + k + '" aria-label="Letter ' + (k + 1) + ": " + cur.letters[k] + '"><span>' + cur.letters[k] + "</span></button>" +
          '<button type="button" class="nph-ar" tabindex="-1" data-nph="down" data-k="' + k + '" aria-label="Previous letter">&#9660;</button>' +
          "</div>";
      }
      h += "</div>" +
        '<button type="button" class="np-btn np-primary nph-ok" data-nph="ok">ENTER</button>' +
        '<p class="nph-hint">Arrows or type letters. Tap a letter to change it.</p>' +
        '<p class="np-sr" aria-live="polite" id="nph-say">Initials ' + initials.split("").join(" ") + "</p>" +
        "</div>";
    } else if (cur.place >= 0 && cur.done) {
      h += '<p class="nph-done" role="status">' + esc(initials) + " is on the board at " + ordinal(cur.place + 1) + ".</p>";
    }
    h += rowsHTML(list, meIdx, cur.place >= 0 && !cur.done, initials, cur.pos);
    if (cur.place < 0 && list.length) h += '<p class="nph-foot">Beat ' + esc(cur.fmt(list[list.length - 1].s)) + " to get on the board.</p>";
    el.innerHTML = h;
    if (focusSlots) {
      var s = el.querySelector(".nph-slots");
      if (s) try { s.focus({ preventScroll: true }); } catch (e) { s.focus(); }
    }
  }

  function updateLetters() {
    if (!cur || cur.done) return;
    var cols = cur.el.querySelectorAll(".nph-col");
    for (var k = 0; k < cols.length; k++) {
      cols[k].classList.toggle("on", k === cur.pos);
      var b = cols[k].querySelector(".nph-l");
      b.querySelector("span").textContent = cur.letters[k];
      b.setAttribute("aria-label", "Letter " + (k + 1) + ": " + cur.letters[k]);
    }
    var me = cur.el.querySelector("tr.nph-me td:nth-child(2)");
    if (me) me.innerHTML = cur.letters.map(function (ch, k) { return k === cur.pos ? '<span class="nph-cur">' + ch + "</span>" : ch; }).join("");
    var say = document.getElementById("nph-say");
    if (say) say.textContent = "Initials " + cur.letters.join(" ") + ", letter " + (cur.pos + 1);
  }

  function blip(f) { var S = window.Shell; if (S && S.tone) S.tone(f || 880, 0.04, "square", 0.18); }
  function step(k, d) {
    var i = LETTERS.indexOf(cur.letters[k]); if (i < 0) i = 0;
    cur.letters[k] = LETTERS[(i + d + LETTERS.length) % LETTERS.length];
    cur.pos = k; updateLetters(); blip(d > 0 ? 990 : 740);
  }
  function setLetter(ch) {
    cur.letters[cur.pos] = ch;
    if (cur.pos < 2) cur.pos++;
    updateLetters(); blip(1100);
  }
  function confirm(silent) {
    if (!cur || cur.done || cur.place < 0) return;
    cur.done = true;
    commit(cur.slug, cur.lower, { n: cur.letters.join(""), s: cur.score, d: cur.stamp });
    // where it really landed (a tie never moves an older row down)
    var b = board(cur.slug, cur.lower);
    for (var i = 0; i < b.length && i < SIZE; i++) if (b[i].me && b[i].s === cur.score && b[i].n === cur.letters.join("") && b[i].d === cur.stamp) { cur.place = i; break; }
    render(false);
    if (silent) return;
    var S = window.Shell; if (S && S.sfx) S.sfx("score");
    var again = document.querySelector('#np-ov-over [data-act="again"]');
    if (again) setTimeout(function () { try { again.focus({ preventScroll: true }); } catch (e) { again.focus(); } }, 30);
  }
  // A run that qualified but was never confirmed (PLAY AGAIN, R, leaving) still goes on the board.
  function flush() { if (cur && !cur.done && cur.place >= 0) confirm(true); }

  function inEntry() {
    if (!cur || cur.done || cur.place < 0) return false;
    var S = window.Shell; if (S && S.state && S.state() !== "over") return false;
    var a = document.activeElement;
    return !a || a === document.body || a.tagName === "CANVAS" || (cur.el && cur.el.contains(a));
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !inEntry()) return;
    var c = e.code, k = e.key, handled = true;
    var onOk = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("data-nph") === "ok";
    if (c === "ArrowUp") step(cur.pos, 1);
    else if (c === "ArrowDown") step(cur.pos, -1);
    else if (c === "ArrowLeft") { cur.pos = Math.max(0, cur.pos - 1); updateLetters(); blip(660); }
    else if (c === "ArrowRight") { cur.pos = Math.min(2, cur.pos + 1); updateLetters(); blip(660); }
    else if (c === "Backspace") { if (cur.pos > 0 && cur.letters[cur.pos] === "A") cur.pos--; cur.letters[cur.pos] = "A"; updateLetters(); blip(520); }
    else if (c === "Enter" || c === "NumpadEnter") { if (!e.repeat) confirm(); }
    else if (c === "Space") { if (onOk) { if (!e.repeat) confirm(); } else if (cur.pos < 2) { cur.pos++; updateLetters(); blip(660); } else if (!e.repeat) confirm(); }
    else if (k && k.length === 1 && /[a-z]/i.test(k)) setLetter(k.toUpperCase());
    else handled = false;
    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  function onKeyUp(e) { if (inEntry() && (e.code === "Space" || e.code === "Enter")) { e.preventDefault(); e.stopImmediatePropagation(); } }

  // Hold an arrow to keep cycling.
  var rep = { t: 0, i: 0 };
  function stopRep() { clearTimeout(rep.t); clearInterval(rep.i); rep.t = rep.i = 0; }
  function onDown(e) {
    var b = e.target.closest ? e.target.closest("[data-nph]") : null;
    if (!b || !cur || cur.done || !cur.el.contains(b)) return;
    var act = b.getAttribute("data-nph"), k = Number(b.getAttribute("data-k"));
    if (act !== "up" && act !== "down") return;
    e.preventDefault();
    var d = act === "up" ? 1 : -1;
    step(k, d);
    stopRep();
    rep.t = setTimeout(function () { rep.i = setInterval(function () { if (cur && !cur.done) step(k, d); else stopRep(); }, 90); }, 450);
  }
  function onClick(e) {
    var b = e.target.closest ? e.target.closest("[data-nph]") : null;
    if (!b || !cur || cur.done || !cur.el.contains(b)) return;
    e.stopPropagation();
    var act = b.getAttribute("data-nph"), k = Number(b.getAttribute("data-k"));
    if (act === "pick") { if (cur.pos === k) step(k, 1); else { cur.pos = k; updateLetters(); blip(660); } }
    else if (act === "ok") confirm();
    else if ((act === "up" || act === "down") && e.detail === 0) step(k, act === "up" ? 1 : -1);  // keyboard / AT click
    if (act !== "ok") { var s = cur.el.querySelector(".nph-slots"); if (s) try { s.focus({ preventScroll: true }); } catch (er) { s.focus(); } }
  }

  var bound = false;
  function bind() {
    if (bound) return; bound = true;
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("pointerdown", onDown);
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (t) { document.addEventListener(t, stopRep); });
    document.addEventListener("click", onClick, true);
    window.addEventListener("pagehide", flush);
    var S = window.Shell;
    if (S && S.onRestart) S.onRestart(function () { flush(); stopRep(); });
  }

  function over(info) {
    if (!info || !info.slug || !SEEDS[info.slug]) return;
    style(); bind(); flush();
    var card = document.querySelector("#np-ov-over .np-card");
    if (!card) return;
    var el = document.getElementById("nph");
    if (!el) {
      el = document.createElement("section");
      el.id = "nph"; el.className = "nph"; el.setAttribute("aria-label", "High scores");
    }
    var score = Number(info.score), lower = !!info.lower;
    // On the board: right under the score, so the initials are the first thing to do.
    // Not on the board: just above PLAY AGAIN, after the game's own run details.
    var place = placeOf(info.slug, score, lower);
    var anchor = place >= 0 ? document.getElementById("np-over-extra") : card.querySelector(".np-actions");
    if (anchor && anchor.parentNode === card) card.insertBefore(el, anchor); else if (!el.parentNode) card.appendChild(el);
    var last = clean(rd("npArcade.hiInitials") || "AAA");
    cur = { slug: info.slug, lower: lower, fmt: info.fmt || String, score: score, place: place,
            letters: last.split(""), pos: 0, done: false, el: el, stamp: Date.now() };
    var commitOrig = cur;
    render(false);
    if (cur.place >= 0) {
      // the shell focuses PLAY AGAIN at 30 ms; take focus for the initials once it has
      setTimeout(function () {
        if (cur !== commitOrig || cur.done) return;
        var s = el.querySelector(".nph-slots");
        if (s) { try { s.focus({ preventScroll: true }); } catch (e) { s.focus(); } }
        var box = el.querySelector(".nph-in") || el;
        try { box.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" }); } catch (e) { /* old browsers */ }
      }, 90);
    }
  }

  window.NPHiScores = {
    over: over,
    seeds: SEEDS,
    board: function (slug, lower) { return board(slug, !!lower).slice(0, SIZE); },
    placeOf: placeOf,
    clear: function (slug) { try { localStorage.removeItem(key(slug)); } catch (e) { /* ignore */ } }
  };
})();
