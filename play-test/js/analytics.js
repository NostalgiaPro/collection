// Nostalgia Pro: anonymous event counts via GoatCounter.
// No script from anywhere else, no cookies, no IDs, no personal data. Each event is one small image request:
//   https://CODE.goatcounter.com/count?p=/event/<name>&t=<platform>&e=true&rnd=<cache buster>
// Off completely when ANALYTICS_CODE in config.js is empty. Never throws: offline, file://, ad blockers are all fine.
var NP = window.NP || {};
window.NP = NP;

(function () {
  'use strict';
  var sent = {};

  NP.track = function (name, once) {
    try {
      var c = NP.CONFIG || {};
      var code = String(c.ANALYTICS_CODE || '').trim();
      if (!code || !/^[a-z0-9-]+$/i.test(code)) return;
      name = String(name || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 60);
      if (!name) return;
      if (once) { if (sent[name]) return; sent[name] = true; }
      var url = 'https://' + code + '.goatcounter.com/count' +
        '?p=' + encodeURIComponent('/event/' + name) +
        '&t=' + encodeURIComponent(NP.platform || 'other') +
        '&e=true&rnd=' + Math.random().toString(36).slice(2);
      var img = new Image();
      img.onerror = img.onload = function () { img = null; };
      img.referrerPolicy = 'no-referrer';
      img.src = url;
    } catch (e) { /* never break the game over a stat */ }
  };

  // anything with data-track="event_name" counts itself when clicked
  document.addEventListener('click', function (e) {
    try {
      var el = e.target && e.target.closest && e.target.closest('[data-track]');
      if (el) NP.track(el.getAttribute('data-track'));
    } catch (x) {}
  }, true);
})();
