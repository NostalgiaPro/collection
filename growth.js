/* Android app growth: the "Get it on Google Play" badge for website visitors,
   and a small "Rate it" card inside the app (Trusted Web Activity).
   Everything is kept on this device. No analytics, no requests.

   Include near the end of <body>:
     <script src="/growth.js" data-rate="visit"></script>
   data-rate: "visit"       card can show on this page (3rd app day or later)
              "game-return" card shows only after coming back from a game (arcade hub)
              (absent)      no card on this page
   Badge slots: <div data-np-gp="home"></div> where the badge goes. A footer
   badge is added to <footer> on every page (data-np-gp="foot" to place it).
   Preview in a browser: ?forceapp=1 acts as the app for this tab and shows
   the card now; ?forceapp=0 goes back to normal. */
(function(){
  "use strict";
  var PKG = "com.thenostalgiapro.shelf";
  var WEB = "https://play.google.com/store/apps/details?id=" + PKG;
  var MARKET = "market://details?id=" + PKG;
  var BADGE = "/images/google-play-badge-en.png";
  var KEY = "np-rate-v1", TAB = "np-twa";
  var root = document.documentElement;
  var me = document.currentScript;
  var rateMode = me && me.getAttribute("data-rate") || "";

  function sget(k){ try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v){ try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} }
  function load(){ try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(s){ try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  /* ---------- where are we? ---------- */
  var q = /[?&]forceapp=([01])/.exec(location.search);
  var force = q && q[1] === "1";
  if (q) sset(TAB, force ? "1" : null);
  /* The app opens the site with an android-app:// referrer on its first load;
     the tab remembers it for the rest of the session. (Not localStorage: the
     app shares storage with Chrome, so that would leak into normal browsing.) */
  if ((document.referrer || "").indexOf("android-app://" + PKG) === 0) sset(TAB, "1");
  var inApp = sget(TAB) === "1";
  var standalone = !!(window.matchMedia && (matchMedia("(display-mode: standalone)").matches ||
                     matchMedia("(display-mode: fullscreen)").matches || matchMedia("(display-mode: minimal-ui)").matches));
  var ua = navigator.userAgent || "";
  var iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var android = /Android/i.test(ua);
  if (inApp) root.classList.add("np-twa");
  if (rateMode === "game-return") root.classList.add("np-arcade");
  var showBadge = !inApp && !standalone && !iOS;

  /* Arizona calendar day, same as the rest of the site */
  var az = new Date(Date.now() - 7 * 3600e3);
  var TODAY = az.toISOString().slice(0, 10);

  /* ---------- badge ---------- */
  function badge(where){
    var a = document.createElement("a");
    a.className = "npgp-badge";
    a.href = WEB;
    a.target = "_blank";
    a.rel = "noopener";
    a.innerHTML = '<img src="' + BADGE + '" width="646" height="250" alt="Get it on Google Play" decoding="async">' +
                  '<span class="npgp-txt">[G] GET THE ANDROID APP</span>';
    var box = document.createElement("div");
    box.className = "npgp npgp-" + where;
    if (where === "home" || where === "arcade") {
      box.innerHTML = '<p class="npgp-line"><b>Nostalgia Pro: Retro Arcade</b><span>The collection and the arcade, as an Android app.</span></p>';
    }
    box.appendChild(a);
    if (where === "foot") {
      var tm = document.createElement("p");
      tm.className = "npgp-tm";
      tm.textContent = "Google Play and the Google Play logo are trademarks of Google LLC.";
      box.appendChild(tm);
    }
    return box;
  }
  function placeBadges(){
    if (!showBadge) return;
    root.classList.add("np-gp");
    var slots = document.querySelectorAll("[data-np-gp]"), hasFoot = false;
    for (var i = 0; i < slots.length; i++) {
      var w = slots[i].getAttribute("data-np-gp") || "home";
      if (w === "foot") hasFoot = true;
      slots[i].appendChild(badge(w));
    }
    if (!hasFoot) {
      var f = document.querySelector("footer");
      if (f) {
        var host = f.querySelector(".wrap") || f, picker = document.getElementById("npErasWrap");
        var b = badge("foot");
        if (picker && picker.parentNode === host) host.insertBefore(b, picker); else host.appendChild(b);
      }
    }
  }

  /* ---------- rate card ---------- */
  var s = load();
  if (inApp && !force) {
    /* count separate days the app was opened */
    if (s.last !== TODAY) { s.days = (s.days || 0) + 1; s.last = TODAY; save(s); }
  }
  function eligible(){
    if (force) return true;
    if (!inApp || !rateMode) return false;
    if (s.done || (s.dismiss || 0) >= 2) return false;
    if ((s.days || 0) < 3) return false;
    if (s.shown === TODAY) return false;                       /* at most once a day */
    if (s.snooze && TODAY < s.snooze) return false;            /* a week off after "Not now" */
    return true;
  }
  function addDays(n){ return new Date(Date.parse(TODAY) + n * 864e5).toISOString().slice(0, 10); }
  function openStore(e){
    if (!android) return;                                       /* desktop preview: plain https link */
    e.preventDefault();
    var t0 = Date.now();
    location.href = MARKET;
    setTimeout(function(){
      if (!document.hidden && Date.now() - t0 < 2500) window.open(WEB, "_blank", "noopener");
    }, 900);
  }
  function card(){
    if (document.getElementById("npRate")) return;
    var c = document.createElement("section");
    c.id = "npRate";
    c.setAttribute("role", "region");
    c.setAttribute("aria-label", "Rate the app");
    c.innerHTML =
      '<p>Enjoying Nostalgia Pro? A rating on Google Play helps more than you\'d think.</p>' +
      '<div class="nprate-btns"><a class="nprate-go" href="' + WEB + '" target="_blank" rel="noopener">Rate it</a>' +
      '<button type="button" class="nprate-no">Not now</button></div>';
    function close(){ c.classList.add("out"); setTimeout(function(){ if (c.parentNode) c.parentNode.removeChild(c); }, 200); }
    c.querySelector(".nprate-go").addEventListener("click", function(e){
      s = load(); s.done = true; save(s); openStore(e); close();
    });
    c.querySelector(".nprate-no").addEventListener("click", function(){
      s = load(); s.dismiss = (s.dismiss || 0) + 1; s.snooze = addDays(7); save(s); close();
    });
    document.body.appendChild(c);
    if (!force) { s.shown = TODAY; save(s); }
  }
  function maybeCard(fromGame){
    if (!eligible()) return;
    if (!force && rateMode === "game-return" && !fromGame) return;
    setTimeout(card, force ? 300 : 1200);
  }

  /* arcade hub: remember a game was started, so coming back counts */
  var FROM = "np-rate-game";
  function cameBack(){
    var r = document.referrer || "";
    var viaRef = /\/arcade\/[a-z0-9-]+\/?/i.test(r.replace(/^https?:\/\/[^/]+/, "")) && !/\/arcade\/?$/.test(r);
    var viaTab = sget(FROM) === "1";
    sset(FROM, null);
    return viaRef || viaTab;
  }
  function wireGames(){
    if (rateMode !== "game-return") return;
    document.addEventListener("click", function(e){
      var a = e.target.closest && e.target.closest("a[href]");
      if (a && /\/arcade\/[a-z0-9-]+\/?$/i.test(a.pathname)) sset(FROM, "1");
    });
    addEventListener("pageshow", function(e){ if (e.persisted) maybeCard(cameBack()); });
  }

  function init(){
    placeBadges();
    wireGames();
    maybeCard(rateMode === "game-return" ? cameBack() : true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.npGrowth = { inApp: inApp, standalone: standalone, iOS: iOS, showBadge: showBadge, state: function(){ return load(); } };
})();
