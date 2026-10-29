/* Nostalgia Pro Arcade: site settings.
   Every donate link in the arcade (hub header, hub strip, hub footer, every
   game over screen) reads DONATE_URL from here and nowhere else. */
window.NP_CONFIG = {
  // Paste the full link to the Fourthwall donations page here, for example
  // "https://nostalgiapro-shop.fourthwall.com/pages/your-donate-page".
  // While this still says "DONATE_URL", every donate button stays hidden so
  // nobody gets sent to the wrong page.
  DONATE_URL: "https://nostalgiapro-shop.fourthwall.com/pages/donate",

  SITE_URL: "https://thenostalgiapro.com/",
  COLLECTION_URL: "https://thenostalgiapro.com/",
  MERCH_URL: "https://nostalgiapro-shop.fourthwall.com/",
  FEEDBACK_URL: "https://tally.so/r/rDDJJl",

  // GoatCounter, same counter and same pixel method as /play/. Page views are
  // counted by the small snippet in each page's <head>; this adds one anonymous
  // "game over" event per finished run. No scores are sent. false turns events off.
  ANALYTICS: true,
  GOATCOUNTER_CODE: "nostalgiapro",

  // If the Android app adds its own word to its user agent, put that word here; every donate link then hides in the app.
  APP_UA_TOKEN: ""
};

/* ---- Helpers below this line. No need to edit. ---- */
(function (C) {
  // Inside the Android app every donate link is hidden. Live signals are explicit only: ?app=android (or
  // ?inapp=1 / ?forceapp=1), the app's own android-app://com.thenostalgiapro.shelf referrer, APP_UA_TOKEN, or the
  // existing "np-twa" session flag. A generic Android WebView check is left out on purpose: social app in-app
  // browsers are WebViews too, and they should keep the donate links and the Play badge.
  C.inApp = function () {
    var ua = navigator.userAgent || "", hit = false;
    if (/[?&]forceapp=0\b/.test(location.search)) { try { sessionStorage.removeItem("npInApp"); } catch (e) { } return false; }
    try { if (sessionStorage.getItem("npInApp") === "1" || sessionStorage.getItem("np-twa") === "1") return true; } catch (e) { /* storage blocked */ }
    if (/[?&](app=android|inapp=1|forceapp=1)\b/i.test(location.search)) hit = true;
    if ((document.referrer || "").indexOf("android-app://com.thenostalgiapro.shelf") === 0) hit = true;   // the Play Store app (TWA)
    if (C.APP_UA_TOKEN && ua.indexOf(C.APP_UA_TOKEN) >= 0) hit = true;
    // Also set the site-wide "np-twa" flag so the hub (seasonal.js), shell.js and the Trophy Shelf hide donate links too.
    if (hit) { try { sessionStorage.setItem("npInApp", "1"); sessionStorage.setItem("np-twa", "1"); } catch (e) { /* storage blocked */ } }
    return hit;
  };
  C.inApp();   // run once on load so the flag is set before the hub and shell read it
  C.donateHref = function () {
    var u = C.DONATE_URL;
    if (!u || u === "DONATE_URL" || C.inApp()) return "";
    return u;
  };
  C.trackEvent = function (path, title) {
    if (!C.ANALYTICS || !/^[a-z0-9-]+$/i.test(C.GOATCOUNTER_CODE || "")) return;
    try {
      if (!/^https?:$/.test(location.protocol)) return;
      var img = new Image();
      img.referrerPolicy = "no-referrer";
      img.src = "https://" + C.GOATCOUNTER_CODE + ".goatcounter.com/count?p=" + encodeURIComponent("/event/" + path) +
        "&t=" + encodeURIComponent(title || "") + "&e=true&rnd=" + Math.random().toString(36).slice(2);
    } catch (e) { /* analytics must never break a game */ }
  };
  // Point every [data-donate] element at the donate page, or hide it if there is none yet.
  C.wireDonate = function (root) {
    var href = C.donateHref();
    var links = (root || document).querySelectorAll("[data-donate]");
    for (var i = 0; i < links.length; i++) {
      if (href) links[i].href = href;
      links[i].hidden = !href;
    }
    var blocks = (root || document).querySelectorAll("[data-donate-block]");
    for (var j = 0; j < blocks.length; j++) blocks[j].hidden = !href;
  };
})(window.NP_CONFIG);
