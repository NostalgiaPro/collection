/* Nostalgia Pro Arcade: seasonal featured game + Seasonal Vault.
   EDIT THE CONFIG BLOCK ONLY. Dates are month-day ("MM-DD"), Arizona time, every year.
   A window may wrap the new year (start "12-29", end "01-04").
   status "live": built and playable. status "soon": placeholder, never shown anywhere yet.
   First live event whose window contains today wins (list order = priority).
   No live event today: the slot shows a regular featured game (rotates daily through FEATURED).
   Testing: ?season=halloween forces an event, ?season=none forces the regular featured game,
   ?seasondate=2026-11-05 pretends it is that day. */
window.NP_SEASONS = {
  events: [
    { id: "halloween", label: "Halloween", start: "10-15", end: "11-02", status: "live",
      slug: "pillowcase-panic", name: "Pillowcase Panic", href: "pillowcase-panic/index.html", accent: "#ff8a1f",
      kicker: "SEASONAL SPECIAL: HALLOWEEN", genre: "Trick-or-treat candy catch", fmt: "pts",
      hook: "Curfew is 9:00 PM. Slide your sheet ghost down the block, fill the pillowcase with candy, and dodge the toothbrushes, pennies, raisins and TP.",
      art: "halloween" },
    { id: "thanksgiving", label: "Thanksgiving", start: "11-20", end: "11-30", status: "soon", name: "", href: "", accent: "#e0662a" },
    { id: "winter", label: "Winter holidays", start: "12-08", end: "12-28", status: "soon", name: "", href: "", accent: "#3ff0ff" },
    { id: "new-year", label: "New Year", start: "12-29", end: "01-04", status: "soon", name: "", href: "", accent: "#ffd23f" },
    { id: "valentines", label: "Valentine's Day", start: "02-07", end: "02-15", status: "soon", name: "", href: "", accent: "#ff3fa4" },
    { id: "big-game", label: "Big game football Sunday", start: "01-24", end: "02-16", status: "soon", name: "", href: "", accent: "#9bff3f" },
    { id: "summer", label: "Summer break", start: "06-10", end: "08-04", status: "soon", name: "", href: "", accent: "#ffd23f" },
    { id: "back-to-school", label: "Back to school", start: "08-05", end: "09-05", status: "soon", name: "", href: "", accent: "#a77bff" }
  ],
  // Regular featured game when no season is on (one per day, in this order).
  FEATURED: [
    { slug: "bleacher-carts", name: "Bleacher Carts", href: "bleacher-carts/index.html", accent: "#ffd23f", genre: "Home run derby", fmt: "ft",
      hook: "20 pitches. Time your swing and knock carts into the cheap seats.", cover: "covers/03-bleacher-carts" },
    { slug: "bargain-bin-buckets", name: "Bargain Bin Buckets", href: "bargain-bin-buckets/index.html", accent: "#ff3fa4", genre: "Arcade basketball", fmt: "pts",
      hook: "60 seconds, a rack of balls, and a hoop that keeps backing up.", cover: "covers/02-bargain-bin-buckets" },
    { slug: "shelf-links", name: "Shelf Links", href: "shelf-links/index.html", accent: "#9bff3f", genre: "Mini golf", fmt: "golf",
      hook: "Nine holes of mini golf built out of game boxes, shelves and tape decks. Drag to putt.", cover: "covers/01-shelf-links" },
    { slug: "tape-pin-lanes", name: "Tape Pin Lanes", href: "tape-pin-lanes/index.html", accent: "#a77bff", genre: "Ten-pin bowling", fmt: "num",
      hook: "Ten fast frames where the pins are stacked VHS tapes. Curve it, strike it." },
    { slug: "ticket-roll-alley", name: "Ticket Roll Alley", href: "ticket-roll-alley/index.html", accent: "#3ff0ff", genre: "Boardwalk ball roll", fmt: "pts",
      hook: "Nine balls, one ramp, and the 100-point cup in the corner." },
    { slug: "fourth-and-collect", name: "Fourth and Collect", href: "fourth-and-collect/index.html", accent: "#9bff3f", genre: "Field goal kicking", fmt: "yds",
      hook: "Split the uprights from farther and farther back. Watch the wind flag." }
  ]
};

/* ---- Rendering below this line. No need to edit. ---- */
(function () {
  "use strict";
  var C = window.NP_SEASONS, i;
  var q = location.search;

  // Inside the Android app (sessionStorage "np-twa", set by /growth.js or ?forceapp=1) donate links stay hidden.
  try {
    var fa = /[?&]forceapp=([01])/.exec(q);
    if (fa) { if (fa[1] === "1") sessionStorage.setItem("np-twa", "1"); else sessionStorage.removeItem("np-twa"); }
    if ((document.referrer || "").indexOf("android-app://com.thenostalgiapro.shelf") === 0) sessionStorage.setItem("np-twa", "1");
    if (sessionStorage.getItem("np-twa") === "1") {
      document.documentElement.classList.add("np-twa");
      var dl = document.querySelectorAll("[data-donate], .support-strip");
      for (i = 0; i < dl.length; i++) dl[i].hidden = true;
    }
  } catch (e) { }

  // Today in Arizona (UTC-7 all year), same as the rest of the site.
  var md, d0 = /[?&]seasondate=(\d{4})-(\d{2})-(\d{2})/.exec(q);
  if (d0) md = d0[2] + "-" + d0[3];
  else md = new Date(Date.now() - 7 * 3600e3).toISOString().slice(5, 10);
  function inWin(e) { return e.start <= e.end ? (md >= e.start && md <= e.end) : (md >= e.start || md <= e.end); }

  var force = /[?&]season=([a-z0-9-]+)/.exec(q), active = null;
  for (i = 0; i < C.events.length; i++) {
    var e = C.events[i];
    if (e.status !== "live" || !e.href) continue;
    if (force ? force[1] === e.id : inWin(e)) { active = e; break; }
  }
  window.NP_SEASON_ACTIVE = active ? active.id : null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var ART = {
    halloween: '<svg viewBox="0 0 160 90" shape-rendering="crispEdges" aria-hidden="true">' +
      '<rect width="160" height="90" fill="#140b24"/><rect y="52" width="160" height="38" fill="#0e2216"/><rect y="78" width="160" height="12" fill="#3a3e4a"/>' +
      '<circle cx="132" cy="18" r="10" fill="#f4e7b8"/>' +
      '<rect x="10" y="24" width="40" height="28" fill="#6b3f52"/><path d="M6 26 L30 10 L54 26Z" fill="#4a2a3a"/><rect x="26" y="36" width="8" height="16" fill="#ffe39a"/><rect x="14" y="30" width="7" height="6" fill="#ffcf5a"/><rect x="39" y="30" width="7" height="6" fill="#ffcf5a"/>' +
      '<rect x="62" y="28" width="36" height="24" fill="#43566b"/><path d="M58 30 L80 16 L102 30Z" fill="#2f3a4a"/><rect x="76" y="38" width="8" height="14" fill="#2a1a12"/><rect x="66" y="33" width="6" height="5" fill="#1b1626"/><rect x="88" y="33" width="6" height="5" fill="#1b1626"/>' +
      '<rect x="110" y="30" width="36" height="22" fill="#6b5636"/><path d="M106 32 L128 20 L150 32Z" fill="#4a3a26"/><rect x="124" y="40" width="8" height="12" fill="#2a1a12"/><rect x="114" y="35" width="6" height="5" fill="#ffcf5a"/>' +
      '<rect x="16" y="49" width="9" height="7" fill="#e0662a"/><rect x="18" y="51" width="2" height="2" fill="#ffd23f"/><rect x="22" y="51" width="2" height="2" fill="#ffd23f"/><rect x="19" y="54" width="4" height="1" fill="#ffd23f"/>' +
      '<rect x="44" y="58" width="8" height="5" fill="#ff3fa4"/><rect x="96" y="54" width="5" height="8" fill="#f6f4ee"/><rect x="96" y="58" width="5" height="4" fill="#ff8a1f"/><rect x="118" y="62" width="14" height="7" fill="#ffd23f"/><rect x="121" y="64" width="8" height="3" fill="#5a3418"/>' +
      '<rect x="70" y="58" width="20" height="22" fill="#eceae2"/><rect x="72" y="54" width="16" height="6" fill="#eceae2"/><rect x="74" y="60" width="3" height="4" fill="#101219"/><rect x="83" y="60" width="3" height="4" fill="#101219"/>' +
      '<rect x="64" y="70" width="32" height="14" fill="#f3efe2"/><rect x="63" y="69" width="34" height="2" fill="#fff"/><rect x="70" y="80" width="6" height="3" fill="#ff4b3e"/><rect x="84" y="80" width="6" height="3" fill="#ff4b3e"/>' +
      '</svg>'
  };
  function best(slug, fmtName) {
    // the hub script fills every [data-best] from this device
    return '<b data-best="' + esc(slug) + '" data-fmt="' + esc(fmtName || "num") + '">---</b>';
  }

  // Hero slot
  var slot = document.getElementById("featured");
  if (slot) {
    var g, kicker, until = "", art;
    if (active) {
      g = active; kicker = active.kicker || ("SEASONAL SPECIAL: " + active.label.toUpperCase());
      var mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(active.end.slice(0, 2)) - 1];
      until = "Featured through " + mo + " " + Number(active.end.slice(3)) + ". Free, like everything here.";
      art = ART[active.art] || "";
    } else {
      var F = C.FEATURED, day = Math.floor((Date.now() - 7 * 3600e3) / 86400e3);
      g = F[day % F.length]; kicker = "FEATURED GAME"; until = "A new featured cabinet every day.";
      art = g.cover ? '<picture><source srcset="' + esc(g.cover) + '.webp" type="image/webp"><img src="' + esc(g.cover) + '.jpg" width="360" height="480" alt="" decoding="async"></picture>' : "";
    }
    slot.className = "feat" + (active ? " feat-season feat-" + esc(active.id) : "");
    slot.style.setProperty("--c", g.accent || "#3ff0ff");
    slot.setAttribute("data-feat", active ? active.id : "featured:" + g.slug);
    slot.innerHTML =
      '<div class="feat-art">' + art + '</div>' +
      '<div class="feat-body">' +
        '<p class="feat-kicker">' + esc(kicker) + '</p>' +
        '<h2 class="feat-title" id="feat-title">' + esc(g.name.toUpperCase()) + '</h2>' +
        '<p class="feat-genre">' + esc(g.genre || "") + '</p>' +
        '<p class="feat-hook">' + esc(g.hook || "") + '</p>' +
        '<p class="feat-meta"><span class="best">BEST' + best(g.slug, g.fmt) + '</span><span class="feat-tro" data-feat-tro="' + esc(g.slug) + '"></span></p>' +
        '<a class="feat-play" href="' + esc(g.href) + '" aria-label="Play ' + esc(g.name) + '">PLAY</a>' +
        '<p class="feat-until">' + esc(until) + '</p>' +
      '</div>';
    slot.setAttribute("aria-labelledby", "feat-title");
    if (window.Trophies) {
      var c = window.Trophies.count(g.slug), tro = slot.querySelector("[data-feat-tro]");
      if (c.total) tro.innerHTML = "TROPHIES<b>" + c.got + "/" + c.total + "</b>";
    }
  }

  // Seasonal Vault: every built seasonal game stays playable all year.
  var vault = document.getElementById("vault-grid");
  if (vault) {
    var html = "", n = 0;
    for (i = 0; i < C.events.length; i++) {
      var v = C.events[i];
      if (v.status !== "live" || !v.href) continue;
      n++;
      var on = active && active.id === v.id;
      html += '<li data-genre="seasonal" data-ready><article class="cab" style="--c:' + esc(v.accent) + '" aria-labelledby="g-' + esc(v.slug) + '">' +
        '<div class="cab-marquee"><h2 id="g-' + esc(v.slug) + '">' + esc(v.name.toUpperCase()) + '</h2><span class="vault-tag">' + (on ? "IN SEASON" : "FROM THE VAULT") + '</span></div>' +
        '<div class="cab-bezel"><div class="cab-screen">' + (ART[v.art] || "") + '</div></div>' +
        '<p class="cab-genre">' + esc(v.label) + ' special</p>' +
        '<p class="cab-hook">' + esc(v.hook) + '</p>' +
        '<div class="cab-panel"><span class="stick" aria-hidden="true"></span><span class="pbtn a" aria-hidden="true"></span><span class="pbtn b" aria-hidden="true"></span>' +
          '<span class="best">BEST' + best(v.slug, v.fmt) + '</span></div>' +
        '<a class="play" href="' + esc(v.href) + '" aria-label="Play ' + esc(v.name) + '">PLAY</a>' +
        '</article></li>';
    }
    vault.innerHTML = html;
    var sec = document.getElementById("vault");
    if (sec) sec.hidden = !n;
  }
})();
