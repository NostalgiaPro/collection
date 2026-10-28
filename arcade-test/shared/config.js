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
  MERCH_URL: "https://nostalgiapro-shop.fourthwall.com/"
};

/* ---- Helpers below this line. No need to edit. ---- */
(function (C) {
  C.donateHref = function () {
    var u = C.DONATE_URL;
    return (!u || u === "DONATE_URL") ? C.MERCH_URL : u;
  };
  // Wire every element marked data-donate to the one donate URL.
  C.wireDonate = function (root) {
    var links = (root || document).querySelectorAll("[data-donate]");
    for (var i = 0; i < links.length; i++) links[i].href = C.donateHref();
  };
})(window.NP_CONFIG);
