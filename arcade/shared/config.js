/* Nostalgia Pro Arcade: site settings.
   Edit the values in this first block only. Every donate link in the arcade
   (hub header, hub strip, hub footer, every game over screen) reads DONATE_URL
   from here. */
window.NP_CONFIG = {
  // Paste the Fourthwall donations page URL here (see the brief, Appendix A).
  // While this still says "DONATE_URL", donate links fall back to the merch shop
  // so nothing on the live site points at a dead link.
  DONATE_URL: "https://nostalgiapro-shop.fourthwall.com/pages/donate",

  // GoatCounter, same counter and same pixel method as /play/. Page views are
  // counted by the small snippet in each page's <head>; this adds one anonymous
  // "game over" event per finished run. No scores are sent. false turns events off.
  ANALYTICS: true,
  GOATCOUNTER_CODE: "nostalgiapro",

  SITE_URL: "https://thenostalgiapro.com/",
  COLLECTION_URL: "https://thenostalgiapro.com/",
  MERCH_URL: "https://nostalgiapro-shop.fourthwall.com/",
  FEEDBACK_URL: "https://tally.so/r/rDDJJl"
};

/* ---- Helpers below this line. No need to edit. ---- */
(function (C) {
  C.donateHref = function () {
    var u = C.DONATE_URL;
    return (!u || u === "DONATE_URL") ? C.MERCH_URL : u;
  };
  // Page views are sent by the inline GoatCounter snippet in each page; nothing to load.
  C.loadAnalytics = function () {};
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
  // Wire every element marked data-donate to the one donate URL.
  C.wireDonate = function (root) {
    var links = (root || document).querySelectorAll("[data-donate]");
    for (var i = 0; i < links.length; i++) links[i].href = C.donateHref();
  };
})(window.NP_CONFIG);
