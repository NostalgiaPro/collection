/* Nostalgia Pro Arcade hub v2 (public /arcade/ page; a copy also lives at /arcade-test/hub-v2/). Plain script, no build step.
   EDIT HERE:
   - GAMES: every live game. cats = which tabs it shows under (sports, arcade, puzzles, mp).
   - BANNER: slugs that rotate in the big featured banner.
   - FEATURED: slugs in the Featured Games box (two show, picked by the day).
   - TOP10_FALLBACK: order used while real play counts are unavailable.
   - PLAY_COUNTS: set true only after "Allow using the visitor counter" is switched on in the
     GoatCounter settings (nostalgiapro.goatcounter.com). While it is false, the page makes no
     counter requests and the Top 10 says it is a house order. */
(function () {
  "use strict";
  var PLAY_COUNTS = false;
  var GC = "https://nostalgiapro.goatcounter.com/counter/";
  var BASE = "/arcade/";
  var GAMES = [
    {"slug": "shelf-links", "name": "Shelf Links", "kind": "Mini golf", "hook": "Nine holes of mini golf built out of game boxes, shelves and tape decks. Drag to putt.", "cover": "01-shelf-links", "c": "#9bff3f", "fmt": "golf", "cats": ["sports"]},
    {"slug": "bargain-bin-buckets", "name": "Bargain Bin Buckets", "kind": "Arcade basketball", "hook": "60 seconds, a rack of balls, and a hoop that keeps backing up.", "cover": "02-bargain-bin-buckets", "c": "#ff3fa4", "fmt": "pts", "cats": ["sports", "arcade"]},
    {"slug": "bleacher-carts", "name": "Bleacher Carts", "kind": "Home run derby", "hook": "20 pitches. Time your swing and knock carts into the cheap seats.", "cover": "03-bleacher-carts", "c": "#ffd23f", "fmt": "ft", "cats": ["sports"]},
    {"slug": "tape-pin-lanes", "name": "Tape Pin Lanes", "kind": "Ten-pin bowling", "hook": "Ten fast frames where the pins are stacked VHS tapes. Curve it, strike it.", "cover": "04-tape-pin-lanes", "c": "#a77bff", "fmt": "num", "cats": ["sports"]},
    {"slug": "ticket-roll-alley", "name": "Ticket Roll Alley", "kind": "Boardwalk ball roll", "hook": "Nine balls, one ramp, and the 100-point cup in the corner.", "cover": "05-ticket-roll-alley", "c": "#3ff0ff", "fmt": "pts", "cats": ["arcade"]},
    {"slug": "pawn-shop-pool", "name": "Pawn Shop Pool", "kind": "Billiards speed rack", "hook": "Clear the back-room pool table before the shop closes.", "cover": "06-pawn-shop-pool", "c": "#ff4b3e", "fmt": "time", "cats": ["sports"]},
    {"slug": "rink-rat-shootout", "name": "Rink Rat Shootout", "kind": "Hockey shootout", "hook": "You vs a goalie who has seen every trick. Three 30-second periods.", "cover": "07-rink-rat-shootout", "c": "#3ff0ff", "fmt": "pts", "cats": ["sports", "mp"]},
    {"slug": "fourth-and-collect", "name": "Fourth and Collect", "kind": "Field goal kicking", "hook": "Split the uprights from farther and farther back. Watch the wind flag.", "cover": "08-fourth-and-collect", "c": "#9bff3f", "fmt": "yds", "cats": ["sports"]},
    {"slug": "powder-day-haul", "name": "Powder Day Haul", "kind": "Downhill snowboarding", "hook": "Carve down Mount Backlog and grab the loose discs before the bottom.", "cover": "09-powder-day-haul", "c": "#a77bff", "fmt": "pts", "cats": ["sports"]},
    {"slug": "table-rink-rumble", "name": "Table Rink Rumble", "kind": "Air hockey vs CPU", "hook": "First to 7 on the rec room table. The CPU plays dirty.", "cover": "10-table-rink-rumble", "c": "#ff3fa4", "fmt": "streak", "cats": ["sports", "arcade", "mp"]},
    {"slug": "creature-feature-ko", "name": "Creature Feature KO", "kind": "Halloween boss rush", "hook": "Seven boss fights, one collector, a pocket full of candy corn.", "cover": "11-creature-feature-ko", "c": "#ff8a1f", "fmt": "pts", "season": true, "cats": ["arcade"]},
    {"slug": "battle-karts", "name": "Battle Karts", "kind": "Kart battler", "hook": "Six karts, three laps, prize cubes full of trouble.", "cover": "12-battle-karts", "c": "#ff9214", "fmt": "pts", "cats": ["arcade", "mp"]},
    {"slug": "shift-racing", "name": "Shift Racing", "kind": "Street racer", "hook": "Street racing where every gear shift counts. Three circuits plus a quarter mile.", "cover": "13-shift-racing", "c": "#39ff6a", "fmt": "pts", "cats": ["arcade", "mp"]},
    {"slug": "marble-drop", "name": "Marble Drop", "kind": "Marble matcher", "hook": "Aim, shoot and match three before the chain rolls down the drain.", "cover": "14-marble-drop", "c": "#ffd23f", "fmt": "pts", "cats": ["puzzles"]},
    {"slug": "pinball-rings", "name": "Pinball Rings", "kind": "Pinball", "hook": "A 3D pinball table built for collecting rings. Flippers, ramps and Ring Rush multiball.", "cover": "15-pinball-rings", "c": "#ff3fa4", "fmt": "pts", "cats": ["arcade"]},
    {"slug": "circuit-box", "name": "Circuit Box", "kind": "Wiring puzzle", "hook": "A wiring puzzle in a snap-together electronics kit. Light up every gadget.", "cover": "16-circuit-box", "c": "#ffd23f", "fmt": "pts", "cats": ["puzzles"]},
    {"slug": "clutch-ball-4000", "name": "Clutch Ball 4000", "kind": "Arcade basketball", "hook": "Sixty seconds of neon arcade hoops. Charge the meter, chain combos, beat the horn.", "cover": "17-clutch-ball-4000", "c": "#3ff0ff", "fmt": "pts", "cats": ["sports", "arcade"]},
    {"slug": "flea-fortress-flyby", "name": "Flea Fortress Flyby", "kind": "Space shooter", "hook": "Fly through a floating flea market fortress. Shoot the fuel tanks before you run dry.", "cover": "18-flea-fortress-flyby", "c": "#ff9b3f", "fmt": "pts", "cats": ["arcade"]},
    {"slug": "gem-shop", "name": "Gem Shop", "kind": "Match three", "hook": "Match gems in real 3D, then spend the coins building up your own gem shop.", "cover": "19-gem-shop", "c": "#ff4fc0", "fmt": "pts", "cats": ["puzzles"]},
    {"slug": "mini-golf-classic", "name": "Mini Golf Classic", "kind": "Mini golf", "hook": "An 18-hole miniature-golf course in real 3D. Play the front nine, the back nine or all 18.", "cover": "20-mini-golf-classic", "c": "#ff3fa4", "fmt": "num", "cats": ["sports"]},
    {"slug": "monster-truck-rally", "name": "Monster Truck Rally", "kind": "Monster trucks", "hook": "Eight courses of dirt, ramps and junk cars. Crush every car you can before the clock runs out.", "cover": "21-monster-truck-rally", "c": "#ff9214", "fmt": "pts", "cats": ["arcade"]},
    {"slug": "paintball-blitz", "name": "Paintball Blitz", "kind": "Paintball", "hook": "Work up the field, tag the other squad, and run your flag back to base.", "cover": "22-paintball-blitz", "c": "#ff3fa4", "fmt": "pts", "cats": ["sports", "mp"]},
    {"slug": "pool-hall-hustle", "name": "Pool Hall Hustle", "kind": "Pool", "hook": "Real 3D pool against Velvet Rhett, the house hustler. Aim, set spin, and take the shot.", "cover": "23-pool-hall-hustle", "c": "#3ff0ff", "fmt": "pts", "cats": ["sports", "mp"]},
    {"slug": "vector-siege", "name": "Vector Siege", "kind": "Tower defense", "hook": "Thirty waves of vector raiders are marching on your master tape. Build towers and hold the line.", "cover": "24-vector-siege", "c": "#2ff3ff", "fmt": "pts", "cats": ["puzzles"]},
    {"slug": "gravy-or-bust", "name": "Gravy or Bust!", "kind": "Thanksgiving travel dash", "hook": "Three rides, three pies, and one Dinner Clock. Make it home before the gravy.", "cover": "25-gravy-or-bust", "c": "#e0662a", "fmt": "pts", "season": true, "cats": ["arcade"]},
    {"slug": "daily-shelf", "name": "Daily Shelf", "kind": "Daily guess", "hook": "One pixelated photo off the shelf. Six guesses.", "cover": "26-daily-shelf", "c": "#3fbf6a", "fmt": "num", "cats": ["puzzles"], "href": "/daily.html"}
  ];
  var BANNER = ["gravy-or-bust", "ticket-roll-alley", "pool-hall-hustle", "monster-truck-rally", "pinball-rings", "mini-golf-classic"];
  var FEATURED = [["fourth-and-collect", "mini-golf-classic"], ["bleacher-carts", "battle-karts"], ["gem-shop", "shift-racing"], ["paintball-blitz", "clutch-ball-4000"]];
  var TOP10_FALLBACK = ["ticket-roll-alley", "bleacher-carts", "pool-hall-hustle", "mini-golf-classic", "monster-truck-rally", "pinball-rings", "battle-karts", "shift-racing", "bargain-bin-buckets", "gem-shop"];
  var CAT_NAMES = { all: "ALL GAMES", sports: "SPORTS GAMES", arcade: "ARCADE GAMES", puzzles: "PUZZLE GAMES", mp: "MULTI-PLAYER GAMES" };
  var CAT_NOTES = { mp: "Head-to-head games against CPU rivals on one screen. There is no online play." };

  var FMT = {
    golf: function (n) { return n === 0 ? "E" : n > 0 ? "+" + n : String(n); },
    pts: function (n) { return n.toLocaleString("en-US") + " PTS"; },
    ft: function (n) { return n.toLocaleString("en-US") + " FT"; },
    num: function (n) { return String(n); },
    yds: function (n) { return n + " YDS"; },
    time: function (n) { return Math.floor(n / 60) + ":" + ("0" + (n % 60)).slice(-2); },
    streak: function (n) { var w = Math.floor(n / 10), m = n % 10; return w + "W" + (m ? " +" + m : ""); }
  };
  var BY = {};
  for (var i = 0; i < GAMES.length; i++) BY[GAMES[i].slug] = GAMES[i];

  function $(id) { return document.getElementById(id); }
  function rd(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function wr(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function href(g) { return g.href || (BASE + g.slug + "/"); }
  function cover(g, cls) {
    return '<picture' + (cls ? ' class="' + cls + '"' : '') + '><source srcset="' + BASE + 'covers/' + g.cover + '.webp" type="image/webp"><img src="' + BASE + 'covers/' + g.cover + '.jpg" width="360" height="480" alt="" loading="lazy" decoding="async"></picture>';
  }
  function best(g) {
    var v = rd("npArcade." + g.slug + ".best");
    if (v === null || v === "" || !isFinite(Number(v))) return null;
    var f = FMT[g.fmt]; return f ? f(Number(v)) : v;
  }
  function trophies(slug) {
    try { if (window.Trophies) return window.Trophies.count(slug); } catch (e) { }
    return null;
  }
  var day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);

  /* Site links and donate links from the shared arcade config */
  var C = window.NP_CONFIG || {};
  if (C.wireDonate) C.wireDonate(document);
  var siteLinks = document.querySelectorAll("[data-site]");
  for (i = 0; i < siteLinks.length; i++) { var k = siteLinks[i].getAttribute("data-site"); if (C[k]) siteLinks[i].href = C[k]; }

  /* 1) Rotating featured banner */
  (function () {
    var slides = $("bannerSlides"), dots = $("bannerDots"), html = "", dh = "", n = BANNER.length, cur = day % n, timer = 0;
    for (var j = 0; j < n; j++) {
      var g = BY[BANNER[j]], other = BY[BANNER[(j + 1) % n]];
      html += '<a class="slide" href="' + href(g) + '" style="--a:' + g.c + '" aria-roledescription="slide">' +
        '<span class="slide-h">Play ' + esc(g.name) + '!<small>' + esc(g.kind) + ' in real 3D</small></span>' +
        cover(g, "slide-cover l") + cover(other, "slide-cover r") +
        '<span class="slide-play">PLAY NOW</span></a>';
      dh += '<button type="button" aria-label="' + esc(g.name) + '"></button>';
    }
    slides.innerHTML = html; dots.innerHTML = dh;
    // The second cover on each slide is decorative; keep it out of the tab order and screen readers.
    var rs = slides.querySelectorAll(".slide-cover.r"); for (j = 0; j < rs.length; j++) rs[j].setAttribute("aria-hidden", "true");
    var ss = slides.children, ds = dots.children;
    function show(x) {
      cur = (x + n) % n;
      for (var q = 0; q < n; q++) {
        var on = q === cur; ss[q].classList.toggle("on", on); ss[q].tabIndex = on ? 0 : -1; ss[q].setAttribute("aria-hidden", on ? "false" : "true");
        ds[q].setAttribute("aria-current", on ? "true" : "false");
      }
    }
    for (j = 0; j < n; j++) (function (q) { ds[q].addEventListener("click", function () { show(q); restart(); }); })(j);
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function restart() { clearInterval(timer); if (!reduced) timer = setInterval(function () { if (!document.hidden) show(cur + 1); }, 5500); }
    var b = $("banner");
    b.addEventListener("mouseenter", function () { clearInterval(timer); });
    b.addEventListener("mouseleave", restart);
    b.addEventListener("focusin", function () { clearInterval(timer); });
    show(cur); restart();
  })();

  /* 2) Top 10: real GoatCounter play counts when the public counter is on, otherwise a fixed house order */
  function renderTop(list, note) {
    var h = "";
    for (var j = 0; j < list.length && j < 10; j++) {
      var g = BY[list[j].slug || list[j]];
      h += '<li><a href="' + href(g) + '">' + esc(g.name) + '</a>' + (list[j].count != null ? ' <span class="n">' + list[j].count.toLocaleString("en-US") + ' plays</span>' : '') + '</li>';
    }
    $("top10").innerHTML = h; $("topNote").textContent = note;
  }
  renderTop(TOP10_FALLBACK, "House picks for now. This list switches to real play counts once the counter is on.");
  if (PLAY_COUNTS && window.fetch && window.Promise) {
    Promise.all(GAMES.map(function (g) {
      return fetch(GC + encodeURIComponent(href(g)) + ".json", { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (j) { return { slug: g.slug, count: Number(String(j.count).replace(/[^0-9]/g, "")) || 0 }; });
    })).then(function (rows) {
      rows.sort(function (a, b) { return b.count - a.count; });
      renderTop(rows, "Ranked by page plays, all time, from the site counter.");
    }).catch(function () { /* keep the house order */ });
  }

  /* 3) Featured Games box */
  (function () {
    var pick = FEATURED[day % FEATURED.length], h = "";
    for (var j = 0; j < pick.length; j++) {
      var g = BY[pick[j]];
      h += '<li><a class="fg-thumb" href="' + href(g) + '" tabindex="-1" aria-hidden="true">' + cover(g) + '</a><div><h3>' + esc(g.name) + '</h3><p>' + esc(g.hook) + '</p>' +
        '<a class="click" href="' + href(g) + '" >play now<span class="vh"> ' + esc(g.name) + '</span></a></div></li>';
    }
    $("featGames").innerHTML = h;
  })();

  /* 4) All games grid + category tabs */
  (function () {
    var h = "";
    for (var j = 0; j < GAMES.length; j++) {
      var g = GAMES[j], t = trophies(g.slug), b = best(g);
      h += '<li class="gm" style="--c:' + g.c + '" data-cats="' + g.cats.join(" ") + '">' +
        '<a class="gm-thumb" href="' + href(g) + '" tabindex="-1" aria-hidden="true">' + cover(g) + (g.season ? '<span class="gm-badge">SEASONAL</span>' : '') + '</a>' +
        '<div class="gm-body"><h3><a href="' + href(g) + '">' + esc(g.name) + '</a></h3><p class="kind">' + esc(g.kind) + '</p>' +
        '<p class="stats"><span>BEST <b>' + (b ? esc(b) : "---") + '</b></span>' + (t && t.total ? '<span>SHELF <b>' + t.got + '/' + t.total + '</b></span>' : '') + '</p></div>' +
        '<a class="go" href="' + href(g) + '" aria-label="Play ' + esc(g.name) + '">PLAY</a></li>';
    }
    $("grid").innerHTML = h;
    var tabs = document.querySelectorAll(".tab[data-cat]"), items = $("grid").children;
    function apply(cat, scroll) {
      if (!CAT_NAMES[cat]) cat = "all";
      var shown = 0;
      for (var q = 0; q < tabs.length; q++) tabs[q].setAttribute("aria-pressed", tabs[q].getAttribute("data-cat") === cat ? "true" : "false");
      for (q = 0; q < items.length; q++) {
        var on = cat === "all" || (" " + items[q].getAttribute("data-cats") + " ").indexOf(" " + cat + " ") >= 0;
        items[q].hidden = !on; if (on) shown++;
      }
      $("games-h").textContent = CAT_NAMES[cat];
      $("gamesCount").textContent = shown + (shown === 1 ? " game" : " games");
      var note = $("gamesNote"); note.hidden = !CAT_NOTES[cat]; note.textContent = CAT_NOTES[cat] || "";
      if (scroll) $("games").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    for (var q = 0; q < tabs.length; q++) tabs[q].addEventListener("click", function () {
      var c = this.getAttribute("data-cat");
      apply(c, true);
      try { history.replaceState(null, "", c === "all" ? location.pathname : "#" + c); } catch (e) { }
    });
    apply((location.hash || "").slice(1), false);
  })();

  /* 5) Name tag (initials) + this device's shelf and bests. Same key the high score table uses. */
  (function () {
    var KEY = "npArcade.hiInitials", input = $("tagIn"), msg = $("tagMsg");
    function clean(s) { return String(s || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3); }
    function paint() {
      var n = clean(rd(KEY));
      input.value = n;
      $("welName").textContent = n ? ", " + n : "";
    }
    input.addEventListener("input", function () { var c = clean(input.value); if (c !== input.value) input.value = c; });
    $("tagForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var n = clean(input.value);
      if (n.length !== 3) { msg.textContent = "Use 3 letters, A to Z."; return; }
      msg.textContent = wr(KEY, n) ? "Saved. Hi, " + n + "!" : "This browser blocked saving.";
      paint();
    });
    paint();
    var all = trophies(null);
    if (all) { $("tagTro").textContent = all.got + "/" + all.total; $("pzGot").textContent = all.got; $("pzTotal").textContent = all.total; }
    var h = "";
    for (var j = 0; j < GAMES.length; j++) { var b = best(GAMES[j]); if (b) h += '<li><a href="' + href(GAMES[j]) + '" style="color:#fff">' + esc(GAMES[j].name) + '</a><b>' + esc(b) + '</b></li>'; }
    if (h) $("myBests").innerHTML = h;
  })();
})();
