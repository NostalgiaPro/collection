/* Nostalgia Pro Arcade: site settings.
   Edit the values in this first block only. Every donate link in the arcade
   (hub header, hub strip, hub footer, every game over screen) reads DONATE_URL
   from here. */
window.NP_CONFIG = {
  // Paste the Fourthwall donations page URL here (see the brief, Appendix A).
  // While this still says "DONATE_URL", donate links fall back to the merch shop
  // so nothing on the live site points at a dead link.
  DONATE_URL: "https://nostalgiapro-shop.fourthwall.com/pages/donate",

  // Test copy: no analytics here (the live /arcade/ has its own setup).

  SITE_URL: "https://thenostalgiapro.com/",
  COLLECTION_URL: "https://thenostalgiapro.com/",
  MERCH_URL: "https://nostalgiapro-shop.fourthwall.com/",

  // Inside the Android app every donate link is hidden. The check below catches
  // a Trusted Web Activity, a plain Android WebView, and any page opened with
  // ?app=android in its URL (the most reliable option: make the app's start URL
  // https://thenostalgiapro.com/?app=android). If the app adds its own word to
  // its user agent, put that word here too. It also honors the existing
  // sessionStorage "np-twa" flag (set by /growth.js or ?forceapp=1).
  APP_UA_TOKEN: ""
};

/* ---- Helpers below this line. No need to edit. ---- */
(function (C) {
  C.inApp = function () {
    var ua = navigator.userAgent || "", hit = false;
    if (/[?&]forceapp=0\b/.test(location.search)) { try { sessionStorage.removeItem("npInApp"); } catch (e) { } return false; }
    try { if (sessionStorage.getItem("npInApp") === "1" || sessionStorage.getItem("np-twa") === "1") return true; } catch (e) { /* storage blocked */ }
    if (/[?&](app=android|inapp=1|forceapp=1)\b/i.test(location.search)) hit = true;
    if (/^android-app:\/\//.test(document.referrer || "")) hit = true;   // Trusted Web Activity
    if (/Android/.test(ua) && /; wv\)/.test(ua)) hit = true;              // Android WebView
    if (C.APP_UA_TOKEN && ua.indexOf(C.APP_UA_TOKEN) >= 0) hit = true;
    // Also set the site-wide "np-twa" flag so the hub (seasonal.js), shell.js and the Trophy Shelf hide donate links too.
    if (hit) { try { sessionStorage.setItem("npInApp", "1"); sessionStorage.setItem("np-twa", "1"); } catch (e) { /* storage blocked */ } }
    return hit;
  };
  C.inApp();   // run once on load so the flag is set before the hub and shell read it
  C.donateHref = function () {
    var u = C.DONATE_URL;
    if (C.inApp()) return "";
    return (!u || u === "DONATE_URL") ? C.MERCH_URL : u;
  };
  // Wire every element marked data-donate to the one donate URL.
  C.wireDonate = function (root) {
    var links = (root || document).querySelectorAll("[data-donate]");
    var href = C.donateHref();
    for (var i = 0; i < links.length; i++) {
      if (href) links[i].href = href;
      links[i].hidden = !href;
    }
  };
})(window.NP_CONFIG);
