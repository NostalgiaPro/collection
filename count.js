/* GoatCounter page view for every page on the site (same counter and code as
   the arcade and /play/, site code "nostalgiapro"). One small image request:
   no cookies, no third-party script, nothing stored on the device, no
   personal data. The Android app is counted the same way. See /privacy.html. */
(function(){
  try {
    if (!/^https?:$/.test(location.protocol)) return;
    if (location.hostname !== "thenostalgiapro.com" && location.hostname !== "www.thenostalgiapro.com") return;
    var i = new Image();
    i.referrerPolicy = "no-referrer";
    i.src = "https://nostalgiapro.goatcounter.com/count?p=" + encodeURIComponent(location.pathname) +
      "&t=" + encodeURIComponent(document.title) +
      "&r=" + encodeURIComponent(document.referrer || "") +
      "&rnd=" + Math.random().toString(36).slice(2);
  } catch (e) {}
})();
