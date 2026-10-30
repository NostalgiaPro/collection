// Nostalgia Pro: anonymous event counts via GoatCounter.
// No script from anywhere else, no cookies, no IDs, no personal data. Each event is one small image request:
//   https://CODE.goatcounter.com/count?p=/event/<name>&t=<platform>&e=true&rnd=<cache buster>
// Off completely when ANALYTICS_CODE in config.js is empty. Never throws: offline, file://, ad blockers are all fine.
var NP = window.NP || {};
window.NP = NP;

(function () {
  'use strict';
  var sent = {};
  // test copies never send anything: the hidden test page (/play-test/), and any copy run from this computer (localhost and the like, NP.platform 'dev')
  function testPage() { try { return /\/play-test(\/|$)/i.test(location.pathname || '') || NP.platform === 'dev'; } catch (e) { return false; } }
  function code() {
    var c = NP.CONFIG || {};
    var k = String(c.ANALYTICS_CODE || '').trim();
    if (!k || !/^[a-z0-9-]+$/i.test(k) || testPage()) return '';
    return k;
  }
  function codeNow() { return code(); }
  NP.analyticsOn = function () { return !!code(); };

  // beacon: true for events sent while the page is closing (sendBeacon survives that; an image request may not)
  NP.track = function (name, once, beacon) {
    try {
      var code = codeNow();
      if (!code) return;
      name = String(name || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 60);
      if (!name) return;
      if (once) { if (sent[name]) return; sent[name] = true; }
      var url = 'https://' + code + '.goatcounter.com/count' +
        '?p=' + encodeURIComponent('/event/' + name) +
        '&t=' + encodeURIComponent(NP.platform || 'other') +
        '&e=true&rnd=' + Math.random().toString(36).slice(2);
      if (beacon && navigator.sendBeacon) { try { if (navigator.sendBeacon(url)) return; } catch (x) {} }
      var img = new Image();
      img.onerror = img.onload = function () { img = null; };
      img.referrerPolicy = 'no-referrer';
      img.src = url;
    } catch (e) { /* never break the game over a stat */ }
  };

  // anything with data-track="event_name" counts itself when clicked, and any link to the feedback form counts as feedback_tapped
  document.addEventListener('click', function (e) {
    try {
      var el = e.target && e.target.closest && e.target.closest('[data-track]');
      if (el) NP.track(el.getAttribute('data-track'));
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      var fb = String((NP.CONFIG || {}).FEEDBACK_URL || '');
      if (a && fb && a.getAttribute('href') === fb) NP.track('feedback_tapped');
    } catch (x) {}
  }, true);

  // one pageview for the page itself (/play/ and so on), so people who open the page but never start the game still count.
  // Just the path: no referrer, no title, nothing about the person.
  NP.pageview = function () {
    try {
      var k = code(); if (!k || sent.__pv) return;
      if (location.protocol === 'file:') return;
      sent.__pv = true;
      var path = String(location.pathname || '/').replace(/index\.html?$/i, '') || '/';
      var img = new Image();
      img.onerror = img.onload = function () { img = null; };
      img.referrerPolicy = 'no-referrer';
      img.src = 'https://' + k + '.goatcounter.com/count?p=' + encodeURIComponent(path) + '&t=' + encodeURIComponent('Nostalgia Pro') + '&rnd=' + Math.random().toString(36).slice(2);
    } catch (x) {}
  };
  NP.pageview();
})();
