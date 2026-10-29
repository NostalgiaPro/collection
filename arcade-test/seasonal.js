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
      slug: "creature-feature-ko", name: "Creature Feature KO", href: "creature-feature-ko/index.html", accent: "#ff8a1f",
      kicker: "SEASONAL SPECIAL: HALLOWEEN", genre: "Halloween boss rush", fmt: "pts",
      hook: "The late show ran long and the monsters climbed out of the tapes. Seven boss fights, one collector, a pocket full of candy corn. Slide to dodge, stand under to hit.",
      art: "halloween" },
    // testOnly: built and playable, but only shows with ?season=thanksgiving until RC approves it.
    { id: "thanksgiving", label: "Thanksgiving", start: "11-20", end: "11-30", status: "live", testOnly: true,
      slug: "gravy-or-bust", name: "Gravy or Bust!", href: "gravy-or-bust/index.html", accent: "#e0662a",
      kicker: "SEASONAL SPECIAL: THANKSGIVING", genre: "Thanksgiving travel dash", fmt: "pts",
      hook: "Three rides, one card-table seat, three pies on your lap. Tap to the beat in the air, hold steady on the rails, hop lanes on the road. Make it home before the gravy.",
      art: "thanksgiving" },
    // testOnly: built and playable, but only shows with ?season=christmas until RC approves it.
    { id: "christmas", label: "Christmas", start: "12-08", end: "12-28", status: "live", testOnly: true,
      slug: "mall-santa-dash", name: "Mall Santa Dash '94", href: "mall-santa-dash/index.html", accent: "#3fd07a",
      kicker: "SEASONAL SPECIAL: CHRISTMAS", genre: "Christmas mall runner, 1994", fmt: "pts",
      hook: "Christmas Eve, 5:58 PM. The gates come down at 6. Hop lanes through the food court, jump the wet floor signs, and reach the toy store for the last Ultra-Bot.",
      art: "christmas" },
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
    if (e.testOnly && !(force && force[1] === e.id)) continue; // hidden until approved
    if (force ? force[1] === e.id : inWin(e)) { active = e; break; }
  }
  window.NP_SEASON_ACTIVE = active ? active.id : null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var ART = {
    halloween: '<svg viewBox="0 0 160 90" shape-rendering="crispEdges" aria-hidden="true">' +
      '<rect width="160" height="90" fill="#140b24"/><rect y="50" width="160" height="28" fill="#2a1a26"/><rect y="78" width="160" height="12" fill="#3a2a22"/><rect y="49" width="160" height="2" fill="#3a2616"/>' +
      '<circle cx="140" cy="14" r="8" fill="#f4e7b8"/>' +
      '<rect x="88" y="30" width="40" height="14" fill="#0d0a14"/><rect x="122" y="22" width="9" height="14" fill="#0d0a14"/><rect x="126" y="18" width="10" height="7" fill="#0d0a14"/><rect x="133" y="20" width="2" height="2" fill="#ff4b3e"/>' +
      '<rect x="90" y="44" width="4" height="10" fill="#0d0a14"/><rect x="101" y="44" width="4" height="8" fill="#0d0a14"/><rect x="112" y="44" width="4" height="10" fill="#0d0a14"/><rect x="122" y="44" width="4" height="8" fill="#0d0a14"/>' +
      '<rect x="100" y="12" width="14" height="20" fill="#3a2a4a"/><rect x="98" y="11" width="18" height="4" fill="#4a3a5a"/><path d="M100 14 L80 32 L100 30Z" fill="#5a1020"/><rect x="113" y="4" width="3" height="10" fill="#3a2a4a"/>' +
      '<rect x="109" y="0" width="11" height="7" fill="#e0662a"/><rect x="111" y="2" width="2" height="2" fill="#ffd23f"/><rect x="116" y="2" width="2" height="2" fill="#ffd23f"/>' +
      '<rect x="14" y="20" width="24" height="18" fill="#e0662a"/><rect x="12" y="16" width="28" height="4" fill="#a8aab4"/><rect x="24" y="12" width="3" height="4" fill="#ff4b3e"/><rect x="18" y="25" width="4" height="3" fill="#ffd23f"/><rect x="30" y="25" width="4" height="3" fill="#ffd23f"/><rect x="19" y="31" width="14" height="2" fill="#ffd23f"/>' +
      '<rect x="72" y="30" width="3" height="4" fill="#ff8a1f"/><rect x="72" y="28" width="3" height="2" fill="#f6f4ee"/><rect x="72" y="42" width="3" height="4" fill="#ff8a1f"/><rect x="72" y="40" width="3" height="2" fill="#f6f4ee"/>' +
      '<rect x="64" y="52" width="18" height="5" fill="#1d2b53"/><rect x="62" y="56" width="22" height="2" fill="#141e3a"/><rect x="68" y="53" width="2" height="2" fill="#e4343e"/><rect x="70" y="53" width="4" height="2" fill="#fff1d6"/>' +
      '<rect x="65" y="58" width="16" height="9" fill="#f1c28e"/><rect x="68" y="61" width="2" height="2" fill="#1b1b28"/><rect x="76" y="61" width="2" height="2" fill="#1b1b28"/>' +
      '<rect x="64" y="67" width="18" height="11" fill="#1b1b22"/><rect x="69" y="69" width="8" height="3" fill="#fff1d6"/><rect x="69" y="72" width="8" height="1" fill="#29d3e8"/><rect x="82" y="56" width="3" height="12" fill="#f1c28e"/><rect x="66" y="78" width="6" height="6" fill="#3b5a96"/><rect x="74" y="78" width="6" height="6" fill="#3b5a96"/>' +
      '<rect x="128" y="60" width="26" height="18" fill="#2a2d38"/><rect x="130" y="62" width="18" height="14" fill="#3ff0ff" opacity=".55"/><rect x="4" y="72" width="18" height="3" fill="#ff4b3e"/><rect x="5" y="75" width="16" height="3" fill="#ffd23f"/>' +
      '</svg>',
    thanksgiving: '<svg viewBox="0 0 160 90" shape-rendering="crispEdges" aria-hidden="true">' +
      '<rect width="160" height="90" fill="#3a1d3a"/><rect y="18" width="160" height="14" fill="#7a2f3a"/><rect y="32" width="160" height="12" fill="#c24a2c"/><rect y="44" width="160" height="8" fill="#f08a2c"/>' +
      '<circle cx="118" cy="50" r="12" fill="#ffd23f"/><rect y="50" width="160" height="40" fill="#2a2430"/>' +
      '<rect x="0" y="46" width="30" height="6" fill="#1d1a24"/><rect x="34" y="44" width="22" height="8" fill="#1d1a24"/><rect x="132" y="45" width="28" height="7" fill="#1d1a24"/>' +
      '<path d="M70 52 L90 52 L150 90 L10 90Z" fill="#3a3640"/><rect x="79" y="56" width="2" height="4" fill="#ffd23f"/><rect x="79" y="64" width="2" height="6" fill="#ffd23f"/><rect x="78" y="76" width="4" height="9" fill="#ffd23f"/>' +
      '<rect x="56" y="64" width="44" height="14" fill="#9bd23f"/><rect x="64" y="56" width="26" height="9" fill="#9bd23f"/><rect x="67" y="58" width="9" height="6" fill="#3ff0ff" opacity=".7"/><rect x="78" y="58" width="9" height="6" fill="#3ff0ff" opacity=".7"/>' +
      '<rect x="58" y="76" width="10" height="7" fill="#141218"/><rect x="88" y="76" width="10" height="7" fill="#141218"/><rect x="56" y="68" width="5" height="3" fill="#fff1d6"/><rect x="95" y="68" width="5" height="3" fill="#ff4b3e"/>' +
      '<rect x="66" y="48" width="22" height="4" fill="#f6f4ee"/><rect x="68" y="44" width="18" height="4" fill="#f6f4ee"/><rect x="70" y="40" width="14" height="4" fill="#f6f4ee"/><rect x="66" y="51" width="22" height="1" fill="#e0662a"/><rect x="68" y="47" width="18" height="1" fill="#e0662a"/><rect x="70" y="43" width="14" height="1" fill="#e0662a"/>' +
      '<rect x="64" y="52" width="2" height="5" fill="#a8aab4"/><rect x="88" y="52" width="2" height="5" fill="#a8aab4"/>' +
      '</svg>',
    christmas: '<svg viewBox="0 0 160 90" shape-rendering="crispEdges" aria-hidden="true">' +
      '<rect width="160" height="90" fill="#141026"/><rect y="0" width="160" height="10" fill="#1d1838"/><rect y="10" width="160" height="2" fill="#3fd07a"/>' +
      '<rect x="4" y="6" width="4" height="4" fill="#ff4b3e"/><rect x="24" y="6" width="4" height="4" fill="#ffd23f"/><rect x="44" y="6" width="4" height="4" fill="#3ff0ff"/><rect x="64" y="6" width="4" height="4" fill="#ff3fa4"/><rect x="92" y="6" width="4" height="4" fill="#ff4b3e"/><rect x="112" y="6" width="4" height="4" fill="#ffd23f"/><rect x="132" y="6" width="4" height="4" fill="#3ff0ff"/><rect x="152" y="6" width="4" height="4" fill="#ff3fa4"/>' +
      '<rect x="0" y="16" width="46" height="34" fill="#22284a"/><rect x="4" y="18" width="38" height="6" fill="#ff3fa4"/><rect x="4" y="28" width="38" height="20" fill="#3ff0ff" opacity=".45"/>' +
      '<rect x="114" y="16" width="46" height="34" fill="#22284a"/><rect x="118" y="18" width="38" height="6" fill="#ffd23f"/><rect x="118" y="28" width="38" height="20" fill="#ff8a1f" opacity=".4"/>' +
      '<rect x="56" y="14" width="48" height="26" fill="#2a1418"/><rect x="58" y="16" width="44" height="6" fill="#ff4b3e"/><rect x="58" y="24" width="44" height="16" fill="#8e93a2"/><rect x="58" y="27" width="44" height="1" fill="#5a5e6c"/><rect x="58" y="31" width="44" height="1" fill="#5a5e6c"/><rect x="58" y="35" width="44" height="1" fill="#5a5e6c"/>' +
      '<rect x="74" y="28" width="2" height="10" fill="#2f9e5a"/><path d="M68 36 L75 22 L82 36Z" fill="#2f9e5a"/><rect x="74" y="20" width="2" height="2" fill="#ffd23f"/>' +
      '<rect y="50" width="160" height="40" fill="#2a2d38"/><path d="M70 50 L90 50 L160 90 L0 90Z" fill="#3a3e4c"/><rect x="62" y="54" width="1" height="36" fill="#8e93a2" opacity=".4"/><rect x="97" y="54" width="1" height="36" fill="#8e93a2" opacity=".4"/>' +
      '<rect x="36" y="60" width="6" height="8" fill="#ffd23f"/><rect x="35" y="59" width="8" height="2" fill="#1b1b22"/><rect x="118" y="64" width="10" height="8" fill="#ff4b3e"/><rect x="122" y="64" width="2" height="8" fill="#ffd23f"/>' +
      '<circle cx="100" cy="58" r="2" fill="#ffd23f"/><circle cx="58" cy="74" r="2" fill="#ffd23f"/>' +
      '<rect x="72" y="56" width="16" height="4" fill="#f6f4ee"/><rect x="74" y="52" width="12" height="4" fill="#e4343e"/><rect x="84" y="50" width="3" height="3" fill="#f6f4ee"/>' +
      '<rect x="73" y="60" width="14" height="8" fill="#f1c28e"/><rect x="76" y="62" width="2" height="2" fill="#1b1b28"/><rect x="82" y="62" width="2" height="2" fill="#1b1b28"/><rect x="74" y="66" width="12" height="4" fill="#f6f4ee"/>' +
      '<rect x="71" y="70" width="18" height="10" fill="#e4343e"/><rect x="71" y="75" width="18" height="2" fill="#1b1b22"/><rect x="79" y="75" width="2" height="2" fill="#ffd23f"/><rect x="67" y="70" width="4" height="8" fill="#e4343e"/><rect x="89" y="68" width="4" height="8" fill="#e4343e"/>' +
      '<rect x="72" y="80" width="6" height="6" fill="#1b1b22"/><rect x="82" y="78" width="6" height="6" fill="#1b1b22"/><rect x="72" y="85" width="6" height="2" fill="#eceae2"/><rect x="82" y="83" width="6" height="2" fill="#eceae2"/>' +
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
      if (v.testOnly && !(active && active.id === v.id)) continue;
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
