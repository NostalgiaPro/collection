/* Time Machine. Puts the whole site in one of six old looks of the web, or Now.
   The body class does the work (era-1984, y1996 + era-1996, era-1999, era-2004,
   era-2007, era-2011); eras.css and retro.css do the rest. A few extras (hit
   counter, Top 8, shelves) are built here and removed again on "Now", so taking
   the class off puts the page back exactly as it was.
   Choice lives in localStorage "np-era". Old "np-1996"=1 starts you on 1996.
   Any page with ?era=now (or ?era=<id>) sets and saves the era.
   No sound, no tracking, no requests beyond the site's own data files.
   Include it as the first thing inside <body> so the look applies before paint. */
(function(){
  "use strict";
  var ERAS = [
    { id: "1984", label: "1984", name: "BBS" },
    { id: "1996", label: "1996", name: "Homepage" },
    { id: "1999", label: "1999", name: "Portal" },
    { id: "2004", label: "2004", name: "Profile" },
    { id: "2007", label: "2007", name: "Web 2.0" },
    { id: "2011", label: "2011", name: "Shelves" },
    { id: "now",  label: "Now",  name: "Today" }
  ];
  var KEY = "np-era", OLD = "np-1996";
  var body = document.body, ALLCLS = ["npskin", "y1996"];
  ERAS.forEach(function(e){ if (e.id !== "now") ALLCLS.push("era-" + e.id); });

  function get(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
  function reduced(){ return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function valid(id){ return ERAS.some(function(e){ return e.id === id; }); }

  var cur = get(KEY);
  if (!valid(cur)) cur = get(OLD) === "1" ? "1996" : "now";   /* migrate the old 1996 switch */
  /* escape hatch: ?era=now (or ?era=1984, 1996, 1999, 2004, 2007, 2011) sets the era and saves it */
  var qe = /[?&]era=([^&#]*)/.exec(location.search);
  if (qe) {
    var want = decodeURIComponent(qe[1]).toLowerCase();
    if (valid(want)) { cur = want; put(KEY, want); put(OLD, want === "1996" ? "1" : "0"); }
  }

  /* ---------- tiny helpers ---------- */
  function el(tag, cls, html){
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  var AZ = new Date(Date.now() - 7 * 3600e3);                     /* Arizona day, same as the rest of the site */
  var DAYSEED = AZ.getUTCFullYear() * 1000 + Math.floor((AZ - Date.UTC(AZ.getUTCFullYear(), 0, 1)) / 864e5);
  function rng(seed){ var s = seed >>> 0; return function(){ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function pick(arr, n, seed){
    var a = arr.slice(), r = rng(seed), out = [];
    while (a.length && out.length < n) out.push(a.splice(Math.floor(r() * a.length), 1)[0]);
    return out;
  }
  var cache = {};
  function getJSON(url){
    if (!cache[url]) cache[url] = fetch(url).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
    return cache[url];
  }
  function shelfGames(){
    return getJSON("/data/shelf-games.json").then(function(d){
      if (!d || !d.games) return [];
      return d.games.filter(function(g){ return g.ph && g.i && g.k; }).map(function(g){
        var s = d.systems[g.s] || {};
        return { t: g.d || g.t, k: g.k, i: "/" + g.i, sys: s.n || "", y: g.y };
      });
    });
  }

  /* ---------- where the extras go ---------- */
  function topAnchor(){
    var h1 = document.querySelector("h1");
    if (!h1) return null;
    var hero = h1.closest(".o1-hero");
    if (hero) return hero;
    var sf = h1.parentNode.querySelector(".standfirst");
    return sf || h1;
  }
  function footEl(){ return document.querySelector("footer") || document.querySelector(".wrap") || body; }
  function clearBits(){
    var xs = document.querySelectorAll(".np-erabits,#npConnect");
    for (var i = 0; i < xs.length; i++) xs[i].parentNode.removeChild(xs[i]);
    clearInterval(tick);
  }
  var tick = 0, gen = 0;
  function addTop(node){
    var a = topAnchor();
    node.classList.add("np-erabits", "np-erabits-top");
    if (a && a.parentNode) a.parentNode.insertBefore(node, a.nextSibling);
    else (document.querySelector(".wrap") || body).insertBefore(node, (document.querySelector(".wrap") || body).firstChild);
    return node;
  }
  function addFoot(node){
    node.classList.add("np-erabits", "np-erabits-foot");
    var f = footEl(), p = document.getElementById("npErasWrap");
    if (p && p.parentNode === f) f.insertBefore(node, p); else f.appendChild(node);
    return node;
  }
  function links(list){
    return list.map(function(l){ return '<a href="' + l[1] + '">' + esc(l[0]) + "</a>"; }).join("");
  }
  var NAV = {
    games:  [["Virtual shelf", "/shelf.html"], ["Consoles", "/consoles.html"], ["The gaps", "/gaps.html"], ["The numbers", "/stats.html"], ["Digital", "/digital.html"]],
    words:  [["Reviews", "/reviews.html"], ["Lists", "/lists.html"], ["Rankings", "/rankings.html"], ["Overrated", "/overrated.html"]],
    play:   [["Daily Shelf", "/daily.html"], ["Which came first?", "/first.html"], ["Shelf vs. Mine", "/match.html"], ["Arcade", "/arcade/"]],
    other:  [["Movies", "/movies.html"], ["TV", "/tv.html"], ["Music", "/music.html"], ["Board games", "/boardgames.html"], ["On this day", "/onthisday.html"]]
  };

  /* ---------- 1984: BBS ---------- */
  function build1984(){
    var b = el("div", "e84");
    b.innerHTML =
      '<pre class="e84-banner" aria-hidden="true">' +
      "+------------------------------+\n" +
      "|  THE NOSTALGIA PRO  BBS      |\n" +
      "|  SYSOP: RC   NODE 1   24/7   |\n" +
      "+------------------------------+</pre>" +
      '<p class="e84-sr">The Nostalgia Pro BBS</p>' +
      '<div class="e84-menu" role="navigation" aria-label="Main menu"><p>MAIN MENU</p><ul>' +
      [["S", "Virtual shelf", "/shelf.html"], ["D", "Daily Shelf", "/daily.html"], ["R", "Reviews", "/reviews.html"],
       ["L", "Lists", "/lists.html"], ["A", "Arcade", "/arcade/"], ["M", "Music, movies, TV", "/music.html"]]
        .map(function(m){ return '<li><a href="' + m[2] + '"><b>[' + m[0] + "]</b> " + esc(m[1]) + "</a></li>"; }).join("") +
      '</ul><p class="e84-prompt">COMMAND?<span class="e84-cur" aria-hidden="true"></span></p></div>';
    addTop(b);
  }
  function dialUp(){
    if (reduced()) return;
    var o = el("div", "", '<p>ATDT 555 0184</p><p class="d2">CONNECT 2400</p><button type="button">Skip</button>');
    o.id = "npConnect";
    o.setAttribute("role", "status");
    var done = false;
    function end(){
      if (done) return; done = true;
      removeEventListener("keydown", end, true);
      if (o.parentNode) o.parentNode.removeChild(o);
    }
    o.addEventListener("click", end);
    addEventListener("keydown", end, true);
    body.appendChild(o);
    setTimeout(end, 1500);                                         /* never longer than 1.5s */
  }

  /* ---------- 1996: homepage ---------- */
  function build1996(){
    addTop(el("div", "e96-uc",
      '<svg class="e96-sign" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">' +
        '<rect x="12" y="12" width="40" height="40" rx="3" transform="rotate(45 32 32)" fill="#ffd400" stroke="#000" stroke-width="3"/>' +
        '<circle cx="27" cy="21" r="3.2" fill="#000"/>' +
        '<path d="M27 25 L24 35 L19 43 M24 35 L29 42 M26 28 L33 31 L39 27" stroke="#000" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path d="M39 27 L44 43" stroke="#000" stroke-width="2.4"/><path d="M41 42 L47 41 L46 46 Z" fill="#000"/>' +
        '<path d="M15 45 Q20 39 26 45 Z" fill="#000"/>' +
      "</svg>" +
      '<p><b>Under construction</b><span>This page is always being worked on. Check back often.</span></p>'));
    /* the counter is for show: a made-up number that creeps up a bit each day */
    var n = 48217 + Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 864e5) * 113 + (DAYSEED % 97);
    var digits = ("0000000" + n).slice(-7).split("");
    addFoot(el("div", "e96-count",
      '<p>You are visitor number</p><span class="e96-odo" role="img" aria-label="Visitor counter, for show only" title="For show. Nothing is counted.">' +
      digits.map(function(d){ return "<i>" + d + "</i>"; }).join("") + "</span>" +
      '<p class="e96-since">since 1996</p>'));
  }

  /* ---------- 1999: portal ---------- */
  function build1999(){
    var b = el("div", "e99");
    b.innerHTML =
      '<p class="e99-status" aria-hidden="true"><span class="e99-led"></span><span class="e99-msg">Connecting at 56k...</span></p>' +
      '<div class="e99-cols">' +
        '<div class="e99-col"><h2>Games</h2>' + links(NAV.games) + "</div>" +
        '<div class="e99-col"><h2>Reviews</h2>' + links(NAV.words) + "</div>" +
        '<div class="e99-col"><h2>Play</h2>' + links(NAV.play) + "</div>" +
        '<div class="e99-col"><h2>Other shelves</h2>' + links(NAV.other) + "</div>" +
      "</div>" +
      '<div class="e99-row">' +
        '<div class="e99-y2k"><h2>Y2K countdown</h2><p class="e99-clock" aria-live="off"></p><p class="e99-note">Back up your saves.</p></div>' +
        '<p class="e99-badge">Best viewed at<b>800x600</b></p>' +
      "</div>";
    addTop(b);
    /* the countdown runs as if today's date were in 1999 */
    var clock = b.querySelector(".e99-clock");
    function draw(){
      var now = new Date(), then = new Date(1999, now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
      var s = Math.max(0, Math.floor((new Date(2000, 0, 1) - then) / 1000));
      var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
      function p(v){ return (v < 10 ? "0" : "") + v; }
      clock.innerHTML = "<b>" + d + "</b> days <b>" + p(h) + ":" + p(m) + ":" + p(x) + "</b>";
    }
    draw();
    if (!reduced()) tick = setInterval(draw, 1000);
    var msg = b.querySelector(".e99-msg"), st = b.querySelector(".e99-status");
    setTimeout(function(){ msg.textContent = "Connected at 49,333 bps"; st.classList.add("ok"); }, reduced() ? 0 : 1200);
  }

  /* ---------- 2004: profile page ---------- */
  function build2004(my){
    var b = el("div", "e04");
    b.innerHTML =
      '<div class="e04-card">' +
        '<img src="/icon-192.png" width="96" height="96" alt="">' +
        '<div><h2>The Nostalgia Pro</h2><p class="e04-count">Games on the shelf</p><p>Last login: today</p><p class="e04-on">Online now</p></div>' +
      "</div>" +
      '<section class="e04-box e04-top8"><h2>Top 8 (from the shelf)</h2><p class="e04-why">Picked at random from the collection. New picks every day.</p><ol class="e04-grid"></ol></section>' +
      '<section class="e04-box e04-song"><h2>Song of the day</h2><p class="e04-album">Loading the music shelf</p></section>';
    addTop(b);
    getJSON("/data/shelf-games.json").then(function(d){
      if (my !== gen || !d) return;
      b.querySelector(".e04-count").textContent = d.games.length + " games, " + d.systems.length + " systems";
    });
    shelfGames().then(function(gs){
      if (my !== gen) return;
      var ol = b.querySelector(".e04-grid");
      ol.innerHTML = pick(gs, 8, DAYSEED).map(function(g){
        return '<li><a href="/game/' + esc(g.k) + '.html"><img src="' + esc(g.i) + '" alt="" loading="lazy" decoding="async" width="90" height="120"><span>' + esc(g.t) + "</span></a></li>";
      }).join("");
    });
    getJSON("/data/music-albums.json").then(function(d){
      if (my !== gen) return;
      var p = b.querySelector(".e04-album");
      var a = d && d.albums && pick(d.albums, 1, DAYSEED + 7)[0];
      if (!a) { p.textContent = "Music shelf not loaded."; return; }
      p.innerHTML = '<span class="e04-disc" aria-hidden="true"></span><span><b>' + esc(a.t) + "</b><em>" + esc(a.f) + (a.y ? ", " + a.y : "") +
        '</em><a href="/music.html">On the music shelf</a></span>';
    });
  }

  /* ---------- 2007: web 2.0 ---------- */
  function build2007(my){
    var b = el("div", "e07");
    b.innerHTML = '<p class="e07-tagline"><span class="e07-beta">BETA</span>The shelf, now with tags.</p>' +
      '<section class="e07-tags"><h2>Tags</h2><p class="e07-cloud">Loading</p></section>';
    addTop(b);
    getJSON("/data/shelf-games.json").then(function(d){
      if (my !== gen || !d) return;
      var n = d.systems.map(function(){ return 0; });
      d.games.forEach(function(g){ n[g.s]++; });
      var xs = d.systems.map(function(s, i){ return { n: s.n, c: n[i] }; }).filter(function(x){ return x.c; });
      var max = Math.max.apply(null, xs.map(function(x){ return x.c; }));
      xs.sort(function(a, b){ return a.n.localeCompare(b.n); });
      b.querySelector(".e07-cloud").innerHTML = xs.map(function(x){
        var sz = Math.round(12 + 11 * Math.sqrt(x.c / max));
        return '<span style="font-size:' + sz + 'px" title="' + x.c + ' games">' + esc(x.n) + "</span>";
      }).join(" ");
    });
  }

  /* ---------- 2011: shelves ---------- */
  function build2011(my){
    var b = el("div", "e11");
    b.innerHTML = '<p class="e11-plate">From the shelf</p><div class="e11-case"><ol class="e11-shelf"></ol></div>';
    addTop(b);
    shelfGames().then(function(gs){
      if (my !== gen) return;
      b.querySelector(".e11-shelf").innerHTML = pick(gs, 10, DAYSEED + 3).map(function(g){
        return '<li><a href="/game/' + esc(g.k) + '.html" title="' + esc(g.t) + '"><img src="' + esc(g.i) + '" alt="' + esc(g.t) + '" loading="lazy" decoding="async" width="90" height="120"></a></li>';
      }).join("");
    });
  }

  var BUILD = { "1984": build1984, "1996": build1996, "1999": build1999, "2004": build2004, "2007": build2007, "2011": build2011 };

  /* ---------- switching ---------- */
  function setClasses(id){
    ALLCLS.forEach(function(c){ body.classList.remove(c); });
    if (!body.className) body.removeAttribute("class");    /* leave no trace on Now */
    if (id === "now") return;
    body.classList.add("era-" + id);
    if (id === "1996") body.classList.add("y1996");      /* retro.css is the base for 1996 */
    else body.classList.add("npskin");
  }
  function decorate(id){
    gen++;
    clearBits();
    if (BUILD[id]) BUILD[id](gen);
  }
  function apply(id, fromUser){
    cur = id;
    setClasses(id);
    if (ready) { decorate(id); syncPicker(); }
    if (fromUser) {
      put(KEY, id);
      put(OLD, id === "1996" ? "1" : "0");             /* pages still on the old switch follow along */
      if (id === "1984") dialUp();
    }
  }

  /* ---------- the picker ---------- */
  var picker = null, ready = false;
  function buildPicker(){
    var wrap = el("div", "");
    wrap.id = "npErasWrap";
    wrap.innerHTML = '<p class="npEras-lbl" id="npErasLbl">Time Machine</p>';
    picker = el("div", "");
    picker.id = "npEras";
    picker.setAttribute("role", "group");
    picker.setAttribute("aria-labelledby", "npErasLbl");
    ERAS.forEach(function(e){
      var btn = el("button", "", esc(e.label));
      btn.type = "button";
      btn.dataset.era = e.id;
      btn.title = e.id === "now" ? "The site as it is today" : e.label + ": " + e.name;
      btn.setAttribute("aria-label", e.id === "now" ? "Now" : e.label + ", " + e.name);
      btn.addEventListener("click", function(){ if (cur !== e.id) apply(e.id, true); });
      picker.appendChild(btn);
    });
    wrap.appendChild(picker);
    footEl().appendChild(wrap);
  }
  function syncPicker(){
    if (!picker) return;
    var bs = picker.querySelectorAll("button");
    for (var i = 0; i < bs.length; i++) bs[i].setAttribute("aria-pressed", bs[i].dataset.era === cur ? "true" : "false");
  }

  setClasses(cur);                                       /* before first paint */
  function init(){
    ready = true;
    buildPicker();
    decorate(cur);
    syncPicker();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.npEra = { list: ERAS, get: function(){ return cur; }, set: function(id){ if (valid(id)) apply(id, true); } };
})();
