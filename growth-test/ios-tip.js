/* PREVIEW: "Add to Home Screen" tip for iPhone and iPad visitors in Safari.
   It goes in the same spots as the Google Play badge (growth.js leaves
   those empty on iOS). Hidden when already opened from the home screen,
   and in other iOS browsers and in-app browsers. Nothing is stored except
   the ?forceios=1 preview flag for this tab. No requests, no analytics.

   Include right after growth.js:
     <script src="/growth-test/ios-tip.js" data-offline="1"></script>
   data-offline="1": the page is in the service worker's cache, so the copy
   can say it works offline. Preview: ?forceios=1 (this tab), ?forceios=0 off. */
(function(){
  "use strict";
  var root = document.documentElement, me = document.currentScript;
  var offline = !!(me && me.getAttribute("data-offline") === "1");
  var TAB = "np-ios";
  function sget(k){ try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v){ try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} }

  var q = /[?&]forceios=([01])/.exec(location.search);
  if (q) sset(TAB, q[1] === "1" ? "1" : null);
  var force = sget(TAB) === "1";

  var ua = navigator.userAgent || "";
  var iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  /* Real Safari says "Version/.. Safari/"; other iOS browsers and in-app
     browsers add their own token or drop "Safari/". Brave and a few others
     look exactly like Safari, so they still see the tip (harmless: the
     share sheet there has Add to Home Screen too). */
  var safari = /Version\/[\d.]+.*Safari\//.test(ua) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo|Ddg\/|FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|Pinterest|LinkedInApp|MicroMessenger|TikTok|musical_ly/.test(ua);
  var standalone = navigator.standalone === true || !!(window.matchMedia &&
    (matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches));
  /* the old "Get the Android app" footer link means nothing on any iOS browser */
  if (iOS) root.classList.add("np-ios-any");
  var show = force || (iOS && safari && !standalone);
  if (!show) return;
  root.classList.add("np-ios");

  var GLYPH = '<svg class="npios-glyph" viewBox="0 0 20 24" width="16" height="19" aria-hidden="true" focusable="false">' +
    '<path d="M10 1.5v13M5.5 6 10 1.5 14.5 6M6.5 10H3.5v12h13V10h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var tail = offline ? "It works like an app, offline too." : "It opens full screen, like an app.";
  var how = 'Tap Share <span class="npios-share">' + GLYPH + '<span class="npios-ascii" aria-hidden="true">[^]</span></span>, then <b class="npios-add">Add to Home Screen</b>.';

  function tip(where){
    var box = document.createElement("div");
    box.className = "npios npios-" + where;
    box.setAttribute("role", "note");
    box.innerHTML = '<p class="npios-line"><b class="npios-h">On iPhone?</b> <span>' + how + " " + tail + "</span></p>";
    return box;
  }
  function place(){
    /* in the preview, forceios on a desktop browser would also get the Play badge */
    var gp = document.querySelectorAll(".npgp");
    for (var i = 0; i < gp.length; i++) gp[i].parentNode.removeChild(gp[i]);
    root.classList.remove("np-gp");
    var slots = document.querySelectorAll("[data-np-gp]"), hasFoot = false;
    for (var j = 0; j < slots.length; j++) {
      var w = slots[j].getAttribute("data-np-gp") || "home";
      if (w === "foot") hasFoot = true;
      slots[j].appendChild(tip(w));
    }
    if (!hasFoot) {
      var f = document.querySelector("footer"), picker = document.getElementById("npErasWrap");
      var host = f ? (f.querySelector(".wrap") || f) : (picker ? picker.parentNode : document.querySelector(".wrap"));
      if (host) {
        var t = tip("foot");
        if (picker && picker.parentNode === host) host.insertBefore(t, picker); else host.appendChild(t);
      }
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", place);
  else place();
  window.npIosTip = { iOS: iOS, safari: safari, standalone: standalone, forced: force };
})();
