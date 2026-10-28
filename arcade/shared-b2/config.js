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
  GOATCOUNTER_CODE: "nostalgiapro"
};

/* ---- Helpers below this line. No need to edit. ---- */
(function (C) {
  C.donateHref = function () {
    var u = C.DONATE_URL;
    return (!u || u === "DONATE_URL") ? "" : u;
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
