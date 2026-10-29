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

  // Inside the Android app every donate link is hidden. The check below catches
  // a Trusted Web Activity, a plain Android WebView, and any page opened with
  // ?app=android in its URL (the most reliable option: make the app's start URL
  // https://thenostalgiapro.com/?app=android). If the app adds its own word to
  // its user agent, put that word here too.
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
    if (hit) { try { sessionStorage.setItem("npInApp", "1"); } catch (e) { /* storage blocked */ } }
    return hit;
  };
  C.donateHref = function () {
    var u = C.DONATE_URL;
    if (!u || u === "DONATE_URL" || C.inApp()) return "";
    return u;
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
