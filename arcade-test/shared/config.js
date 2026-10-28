/* Nostalgia Pro Arcade: site settings.
   Edit the values in this first block only. Every donate link in the arcade
   (hub header, hub strip, hub footer, every game over screen) reads DONATE_URL
   from here. */
window.NP_CONFIG = {
  // Paste the Fourthwall donations page URL here (see the brief, Appendix A).
  // While this still says "DONATE_URL", donate links fall back to the merch shop
  // so nothing on the live site points at a dead link.
  DONATE_URL: "https://nostalgiapro-shop.fourthwall.com/pages/donate",

  // Off by default. When true, loads GoatCounter (code below) for page views
  // plus one anonymous "game over" event per finished run. No scores are sent.
  ANALYTICS: false,
  GOATCOUNTER_CODE: "nostalgiapro",

  SITE_URL: "https://thenostalgiapro.com/",
  COLLECTION_URL: "https://thenostalgiapro.com/",
  MERCH_URL: "https://nostalgiapro-shop.fourthwall.com/"
};

/* ---- Helpers below this line. No need to edit. ---- */
(function (C) {
  C.donateHref = function () {
    var u = C.DONATE_URL;
    return (!u || u === "DONATE_URL") ? C.MERCH_URL : u;
  };
  C.loadAnalytics = function () {
    if (!C.ANALYTICS || document.getElementById("np-gc")) return;
    var s = document.createElement("script");
    s.id = "np-gc";
    s.async = true;
    s.src = "https://gc.zgo.at/count.js";
    s.setAttribute("data-goatcounter", "https://" + C.GOATCOUNTER_CODE + ".goatcounter.com/count");
    document.head.appendChild(s);
  };
  C.trackEvent = function (path, title) {
    if (!C.ANALYTICS) return;
    try {
      if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({ path: path, title: title, event: true });
      }
    } catch (e) { /* analytics must never break a game */ }
  };
  // Wire every element marked data-donate to the one donate URL.
  C.wireDonate = function (root) {
    var links = (root || document).querySelectorAll("[data-donate]");
    for (var i = 0; i < links.length; i++) links[i].href = C.donateHref();
  };
})(window.NP_CONFIG);
