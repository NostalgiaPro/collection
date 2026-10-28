/* Trophy Shelf page. Reads npTrophies.arcade.v1 (and npTrophies.game.v1 once the game list is published). */
(function () {
  "use strict";
  var GAME_URL = "/play/";   // where "The Game" link and the main game shelf's Play link go
  var C = window.NP_CONFIG || {}, T = window.Trophies;
  var A = T ? T.list : { games: [], meta: [], tiers: {} };
  var GL = window.NP_TROPHIES_GAME || { sections: [], trophies: [] };
  var TIERS = A.tiers || {};
  var ACCENT = {
    "shelf-links": "#9bff3f", "bargain-bin-buckets": "#ff3fa4", "bleacher-carts": "#ffd23f", "tape-pin-lanes": "#a77bff",
    "ticket-roll-alley": "#3ff0ff", "fourth-and-collect": "#9bff3f", "pawn-shop-pool": "#ff4b3e", "rink-rat-shootout": "#3ff0ff",
    "powder-day-haul": "#a77bff", "table-rink-rumble": "#ff3fa4", "pillowcase-panic": "#ff8a1f", meta: "#ff4b3e", game: "#ffd23f"
  };
  var $ = function (id) { return document.getElementById(id); };
  var filter = "all", seen = 0, lastFocus = null;

  if (C.wireDonate) C.wireDonate(document);
  // Inside the Android app (sessionStorage "np-twa" = "1", set by /growth.js) donate links stay hidden (Google Play payments policy).
  try { if (sessionStorage.getItem("np-twa") === "1") { var dl = document.querySelectorAll("[data-donate]"); for (var di = 0; di < dl.length; di++) dl[di].hidden = true; } } catch (e) { }
  var siteLinks = document.querySelectorAll("[data-site]");
  for (var i = 0; i < siteLinks.length; i++) { var k = siteLinks[i].getAttribute("data-site"); if (C[k]) siteLinks[i].href = C[k]; }
  $("game-link").href = GAME_URL;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; }); }
  function arcadeSave() { return T ? T.save() : { u: {}, c: {}, seen: 0 }; }
  function gameSave() { return T ? T.gameSave() : { u: {}, c: {} }; }
  function word(tier) { return TIERS[tier] ? TIERS[tier].word : tier; }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function since(ts) { var d = new Date(ts * 1000); return MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear(); }

  /* ---------- items ---------- */
  function itemHTML(t, u, accent) {
    var got = !!u[t.id], mystery = t.secret && !got;
    var cls = "it" + (got ? "" : " locked");
    var obj = mystery ? '<span class="obj mystery"></span>' : '<span class="obj ' + t.tier + '"></span>';
    var name = mystery ? "Mystery lot" : t.name;
    var label = name + ", " + word(t.tier) + ", " + (got ? "on the shelf" : "not on the shelf yet");
    var html = '<li><button type="button" class="' + cls + '" style="--c:' + accent + '" data-id="' + t.id + '" aria-label="' + esc(label) + '">' + obj;
    if (got && u[t.id] > seen) html += '<span class="new" aria-hidden="true">NEW</span>';
    if (!got && !mystery) html += '<span class="tag" aria-hidden="true">Not on the shelf yet</span>';
    return html + '<span class="nm">' + esc(name) + "</span></button></li>";
  }

  function shelfHTML(o) {
    // o: { name, accent, list, u, play, soon, note, kind }
    var got = 0, html, items = "", shown = 0;
    for (var j = 0; j < o.list.length; j++) {
      var t = o.list[j];
      if (t.retired) continue;
      if (o.u[t.id]) got++;
      if (filter === "locked" && o.u[t.id]) continue;
      items += itemHTML(t, o.u, o.accent); shown++;
    }
    if (filter === "locked" && o.list.length && !shown) return "";
    html = '<section class="shelf' + (o.soon ? " soon" : "") + '" data-kind="' + o.kind + '" style="--c:' + o.accent + '"><div class="plate"><h3>' + esc(o.name) + '</h3>';
    if (o.list.length) html += '<span class="cnt">' + got + "/" + o.list.length + "</span>";
    if (o.soon) html += '<span class="soon-tag">Coming soon</span>';
    else if (o.play) html += '<a class="play" href="' + o.play + '">Play</a>';
    html += "</div>";
    if (o.note) html += '<p class="game-note">' + esc(o.note) + "</p>";
    html += items ? '<ul class="items">' + items + "</ul>" : '<div class="empty-row">' + (o.note ? "" : "Empty shelf for now.") + "</div>";
    if (o.soon) html += '<div class="tape" aria-hidden="true">COMING SOON</div>';
    return html + "</section>";
  }

  function render() {
    var sv = arcadeSave(), gs = gameSave(), u = sv.u || {}, gu = gs.u || {};
    var html = "", j, g, total = 0, got = 0, value = 0, tally = { loose: 0, boxed: 0, sealed: 0, slabbed: 0 };
    function add(list, uu) {
      for (var q = 0; q < list.length; q++) {
        var t = list[q]; if (t.retired) continue;
        total++;
        if (uu[t.id]) { got++; tally[t.tier] = (tally[t.tier] || 0) + 1; value += TIERS[t.tier] ? TIERS[t.tier].value : 0; }
      }
    }
    for (j = 0; j < A.games.length; j++) add(A.games[j].trophies, u);
    add(A.meta, u);
    add(GL.trophies, gu);

    if (filter !== "game") {
      html += '<h2 class="group-h">ARCADE</h2>';
      for (j = 0; j < A.games.length; j++) {
        g = A.games[j];
        html += shelfHTML({ kind: "arcade", name: g.name, accent: ACCENT[g.slug] || "#3ff0ff", list: g.trophies, u: u,
          play: g.status === "live" ? "../" + g.slug + "/index.html" : "", soon: g.status !== "live" });
      }
      html += shelfHTML({ kind: "arcade", name: "Arcade-wide", accent: ACCENT.meta, list: A.meta, u: u, play: "../index.html" });
    }
    if (filter !== "arcade") {
      html += '<h2 class="group-h">MAIN GAME</h2>';
      if (!GL.trophies.length) {
        var held = (gs.c && gs.c.xb) ? gs.c.xb.length : 0;
        html += shelfHTML({ kind: "game", name: "Nostalgia Pro main game", accent: ACCENT.game, list: [], u: gu, play: GAME_URL,
          note: "Play the full game on this device, or bring a code." + (held ? " " + held + " main game trophies from a code are saved and will show up here." : "") });
      } else {
        var noSave = !Object.keys(gu).length;
        for (j = 0; j < GL.sections.length; j++) {
          var sec = GL.sections[j], list = GL.trophies.filter(function (t) { return t.section === sec; });
          if (!list.length) continue;
          html += shelfHTML({ kind: "game", name: sec, accent: ACCENT.game, list: list, u: gu, play: j === 0 ? GAME_URL : "",
            note: noSave && j === 0 ? "Play the full game on this device, or bring a code." : "" });
        }
      }
    }
    $("list").innerHTML = html;
    $("summary").innerHTML = "<b>" + got + " of " + total + "</b> on the shelf &middot; Shelf value <b>$" + value.toLocaleString("en-US") + "</b> (estimated by you)";
    $("tally").textContent = "Loose " + tally.loose + " · Boxed " + tally.boxed + " · Sealed " + tally.sealed + " · Slabbed " + tally.slabbed;
    $("empty").hidden = got > 0;
  }

  /* ---------- detail card ---------- */
  function find(id) {
    var t = T && T.byId[id];
    if (t) return { t: t, u: arcadeSave().u, accent: ACCENT[t.slug] || "#3ff0ff" };
    for (var q = 0; q < GL.trophies.length; q++) if (GL.trophies[q].id === id) return { t: GL.trophies[q], u: gameSave().u, accent: ACCENT.game };
    return null;
  }
  function openCard(id, from) {
    var f = find(id); if (!f) return;
    var t = f.t, got = !!f.u[t.id], mystery = t.secret && !got;
    lastFocus = from || null;
    $("dlg-item").innerHTML = '<span class="obj ' + (mystery ? "mystery" : t.tier) + '" style="--c:' + f.accent + '"></span>';
    $("dlg-item").className = "dlg-item" + (got || mystery ? "" : " locked");
    $("dlg-tier").textContent = word(t.tier);
    $("dlg-name").textContent = mystery ? "Mystery lot" : t.name;
    $("dlg-how").textContent = mystery ? "Mystery lot. Keep playing." : t.how;
    $("dlg-when").textContent = got ? "On the shelf since " + since(f.u[t.id]) : "Not on the shelf yet";
    $("dlg-actions").innerHTML = '<button class="btn primary" type="button" id="dlg-close">Close</button>';
    $("dlg").hidden = false;
    $("dlg-close").focus();
  }
  function closeCard() {
    $("dlg").hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $("list").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-id]") : null;
    if (b) openCard(b.getAttribute("data-id"), b);
  });
  $("dlg").addEventListener("click", function (e) {
    if (e.target === $("dlg") || e.target.id === "dlg-close" || e.target.id === "dlg-no") closeCard();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("dlg").hidden) closeCard(); });

  /* ---------- filters ---------- */
  var chips = document.querySelectorAll("[data-filter]");
  for (i = 0; i < chips.length; i++) chips[i].addEventListener("click", function () {
    filter = this.getAttribute("data-filter");
    for (var q = 0; q < chips.length; q++) chips[q].setAttribute("aria-pressed", chips[q] === this ? "true" : "false");
    render();
  });

  /* ---------- codes ---------- */
  function say(t) { $("msg").textContent = t; }
  function copy(text, done) {
    function fallback() {
      var ta = $("code-text"); ta.value = text; ta.select();
      try { document.execCommand("copy"); done(true); } catch (e) { done(false); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    else fallback();
  }
  var code = "";
  $("make").addEventListener("click", function () {
    if (!T) return;
    code = T.exportCode();
    $("code-text").value = code;
    $("code-out").hidden = false;
    say("Here's your code. Enter it on your other device.");
  });
  $("copy").addEventListener("click", function () { copy(code, function (ok) { say(ok ? "Copied." : "Select the code and copy it."); $("code-text").value = code; }); });
  $("copy-link").addEventListener("click", function () {
    var link = location.href.split("#")[0] + "#code=" + code;
    copy(link, function (ok) { say(ok ? "Link copied. Open it on your other device." : "Select the code and copy it."); $("code-text").value = code; });
  });
  function doImport(str) {
    var r = T ? T.importCode(str) : { ok: false, msg: "That code didn't scan. Check for a typo." };
    if (!r.ok) { say(r.msg); return false; }
    say(r.added ? "Added " + r.added + (r.added === 1 ? " trophy" : " trophies") + " to your shelf." : "Merged. Nothing new, you already had all of these.");
    render();
    return true;
  }
  $("enter").addEventListener("submit", function (e) {
    e.preventDefault();
    if (doImport($("code-in").value)) $("code-in").value = "";
  });

  // /trophies/#code=NPS1-... asks first
  function fromHash() {
    var m = /[#&]code=([^&]+)/.exec(location.hash);
    if (!m || !T) return;
    var str = decodeURIComponent(m[1]), r = T.peekCode(str);
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* file:// */ }
    if (!r) { say("That code didn't scan. Check for a typo."); return; }
    $("dlg-item").innerHTML = '<span class="obj boxed" style="--c:#3ff0ff"></span>';
    $("dlg-item").className = "dlg-item";
    $("dlg-tier").textContent = "Shelf code";
    $("dlg-name").textContent = "Add these to your shelf?";
    $("dlg-how").textContent = "This code has " + r.a.length + " arcade " + (r.a.length === 1 ? "trophy" : "trophies") + (r.g.length ? " and " + r.g.length + " main game trophies" : "") + ". Nothing on this device gets removed.";
    $("dlg-when").textContent = "";
    $("dlg-actions").innerHTML = '<button class="btn primary" type="button" id="dlg-yes">Add to my shelf</button><button class="btn" type="button" id="dlg-no">Not now</button>';
    $("dlg").hidden = false;
    $("dlg-yes").addEventListener("click", function () { doImport(str); closeCard(); });
    $("dlg-yes").focus();
  }

  if (!T) { $("summary").textContent = "The trophy files didn't load. Try a refresh."; return; }
  seen = arcadeSave().seen || 0;
  render();
  T.markSeen();   // NEW stickers show for this visit, then clear next time
  fromHash();
  window.addEventListener("hashchange", fromHash);
})();
