// Nostalgia Pro: little pixel scenes for the Round 3b stores (drawn in code, no image files).
//   NP.Scene.uturn(canvas, look, done)   the hero walks into the mall store, sees the wall, does a full 180 and walks out
//   NP.Scene.laugh(canvas, look)          a short pixel laugh
//   NP.Scene.counter(canvas, opts)        waiting at the Staff Only Games counter while two employees walk past (loops)
// Every scene stops by itself once its canvas leaves the page.
var NP = window.NP || {};
window.NP = NP;

NP.Scene = (function () {
  'use strict';
  var C = NP.COL;
  var CLERK = { skin: 2, hair: 'short', hairCol: 0, shirt: 'red', hat: 'none', glasses: 'specs' };
  var EMP1 = { skin: 0, hair: 'long', hairCol: 2, shirt: 'cyan', hat: 'none', glasses: 'none' };
  var EMP2 = { skin: 4, hair: 'buzz', hairCol: 0, shirt: 'stripe', hat: 'beanie', glasses: 'none' };
  function alive(cv) { return cv && document.body.contains(cv); }
  function raf(fn) { return (window.requestAnimationFrame || function (f) { return setTimeout(function () { f(Date.now()); }, 16); })(fn); }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function ch(look) { return NP.Char ? NP.Char.normalize(look) : null; }
  function person(g, look, dir, step, x, y, s) { if (NP.Char && look) NP.Char.draw(g, ch(look), dir, step, x, y, s); }

  // ---------- the overpriced trilogy U-turn ----------
  function drawStore(g) {
    g.fillStyle = '#3a3155'; g.fillRect(0, 0, 320, 72);
    g.fillStyle = '#2a2340'; g.fillRect(0, 66, 320, 6);
    for (var y = 72; y < 150; y += 10) for (var x = 0; x < 320; x += 10) { g.fillStyle = ((x + y) / 10) % 2 ? '#d8d2c0' : '#c9c2ae'; g.fillRect(x, y, 10, 10); }
    // the banner over the wall
    g.fillStyle = C.red; g.fillRect(70, 4, 180, 13);
    NP.pixelText(g, 'USED · LIKE NEW (IT IS NOT)', 160, 7, 1, C.cream, 'center');
    // the shelf and the three loose discs
    g.fillStyle = '#6b4a2b'; g.fillRect(96, 46, 128, 4);
    [124, 160, 196].forEach(function (cx, i) {
      for (var yy = -9; yy <= 9; yy++) for (var xx = -9; xx <= 9; xx++) {
        var d = Math.sqrt(xx * xx + yy * yy);
        if (d <= 9) { g.fillStyle = d < 2 ? '#3a3155' : d < 3.5 ? '#c9d1dc' : ((xx + yy + i) % 4 === 0 ? '#ffffff' : '#aeb8c8'); g.fillRect(cx + xx, 34 + yy, 1, 1); }
      }
      g.fillStyle = C.gold; g.fillRect(cx - 9, 52, 18, 9);
      NP.pixelText(g, '$60', cx, 53, 1, C.ink, 'center');
    });
    NP.pixelText(g, 'SVS3', 124, 22, 1, C.cream, 'center');
    NP.pixelText(g, 'BEFORE', 160, 22, 1, C.cream, 'center');
    NP.pixelText(g, 'AFTER', 196, 22, 1, C.cream, 'center');
    // the counter and the clerk
    person(g, CLERK, 'down', 0, 262, 52, 2);
    g.fillStyle = '#6b4a2b'; g.fillRect(244, 84, 70, 22); g.fillStyle = '#8a5e36'; g.fillRect(244, 84, 70, 5);
    // the door you came in through
    g.fillStyle = '#9aa0ad'; g.fillRect(132, 146, 56, 4);
  }
  function uturn(cv, look, done, skip) {
    var g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    var t0 = now(), fin = false;
    cv.addEventListener('click', function () { skip = true; });
    // in: 1.1s, freeze: 0.9s, turn: 0.4s, out: 1.1s
    var T_IN = 1.1, T_FREEZE = 0.9, T_TURN = 0.4, T_OUT = 1.1, TOT = T_IN + T_FREEZE + T_TURN + T_OUT;
    var Y0 = 150, Y1 = 86;
    function frame() {
      if (!alive(cv)) return;
      var t = (reduced() || skip) ? TOT : (now() - t0) / 1000;
      drawStore(g);
      var y, dir, step = 0;
      if (t < T_IN) { y = Y0 + (Y1 - Y0) * (t / T_IN); dir = 'up'; step = [1, 0, 2, 0][Math.floor(t / 0.14) % 4]; }
      else if (t < T_IN + T_FREEZE) { y = Y1; dir = 'up'; if (t > T_IN + 0.3) NP.pixelText(g, '...', 160, Y1 - 10, 1, C.cream, 'center'); }
      else if (t < T_IN + T_FREEZE + T_TURN) { y = Y1; var q = (t - T_IN - T_FREEZE) / T_TURN; dir = q < 0.33 ? 'right' : q < 0.66 ? 'down' : 'down'; }
      else if (t < TOT) { var p = (t - T_IN - T_FREEZE - T_TURN) / T_OUT; y = Y1 + (Y0 + 10 - Y1) * p; dir = 'down'; step = [1, 0, 2, 0][Math.floor(t / 0.14) % 4]; }
      else { y = null; }
      if (y !== null) person(g, look, dir, step, 144, y, 2);
      if (t >= TOT) { if (!fin) { fin = true; if (done) done(); } return; }
      raf(frame);
    }
    frame();
  }

  // ---------- a short pixel laugh ----------
  function laugh(cv, look, still) {
    var g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    var t0 = now();
    function frame() {
      if (!alive(cv)) return;
      var t = (reduced() || still) ? 2 : (now() - t0) / 1000;
      g.fillStyle = '#1d2b53'; g.fillRect(0, 0, 120, 72);
      g.fillStyle = '#16213e'; g.fillRect(0, 60, 120, 12);
      var bob = t < 1.6 ? (Math.floor(t / 0.12) % 2) : 0;
      person(g, look, 'down', 0, 44, 14 - bob * 2, 2);
      if (t > 0.15) NP.pixelText(g, 'HA', 22, 10 - (t < 1.6 ? bob : 0), 1, C.gold, 'center');
      if (t > 0.45) NP.pixelText(g, 'HA', 98, 6, 1, C.gold, 'center');
      if (t > 0.8) NP.pixelText(g, 'HA', 20, 30, 1, C.gold, 'center');
      if (t < 1.8) raf(frame);
    }
    frame();
  }

  // ---------- waiting at the counter (loops; the clock shows the game clock) ----------
  // opts.time(): minutes since midnight. opts.sharp(): true with binoculars (the far corner is readable)
  function counter(cv, opts) {
    var g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    var t0 = now();
    function clock(cx, cy, min) {
      g.fillStyle = C.ink; g.fillRect(cx - 15, cy - 15, 30, 30);
      for (var yy = -13; yy <= 13; yy++) for (var xx = -13; xx <= 13; xx++) if (xx * xx + yy * yy <= 169) { g.fillStyle = C.cream; g.fillRect(cx + xx, cy + yy, 1, 1); }
      for (var k = 0; k < 12; k++) { var a = k / 12 * Math.PI * 2; g.fillStyle = C.ink; g.fillRect(Math.round(cx + Math.sin(a) * 11), Math.round(cy - Math.cos(a) * 11), 1, 1); }
      var hand = function (ang, len, col) { for (var i = 0; i <= len; i++) { g.fillStyle = col; g.fillRect(Math.round(cx + Math.sin(ang) * i), Math.round(cy - Math.cos(ang) * i), 1, 1); } };
      hand(((min / 60) % 12) / 12 * Math.PI * 2, 6, C.ink);
      hand((min % 60) / 60 * Math.PI * 2, 10, C.red);
    }
    function frame() {
      if (!alive(cv)) return;
      var t = reduced() ? 0 : (now() - t0) / 1000;
      g.fillStyle = '#2a2f3a'; g.fillRect(0, 0, 320, 150);
      g.fillStyle = '#3a3f4a'; g.fillRect(0, 96, 320, 54);
      clock(36, 26, opts.time ? opts.time() : 600);
      // the 16-bit corner, far behind the counter
      g.fillStyle = '#6b4a2b'; g.fillRect(250, 20, 62, 4); g.fillRect(250, 44, 62, 4); g.fillRect(250, 68, 62, 4);
      var sharp = opts.sharp && opts.sharp();
      [0, 1, 2].forEach(function (row) {
        for (var i = 0; i < 6; i++) {
          var x = 252 + i * 10, y = 8 + row * 24, col = ['#c8323c', '#29adff', '#ffcc33', '#00b894', '#ff77a8', '#9aa0ad'][(i + row * 2) % 6];
          if (sharp) { g.fillStyle = '#9aa0ad'; g.fillRect(x, y, 8, 12); g.fillStyle = col; g.fillRect(x + 1, y + 2, 6, 6); }
          else { g.globalAlpha = 0.45; g.fillStyle = col; g.fillRect(x - 1, y - 1, 10, 14); g.globalAlpha = 0.35; g.fillRect(x - 3, y + 1, 14, 10); g.globalAlpha = 1; }
        }
      });
      // two employees walking right past you
      var span = 170, sp = 34;
      var p1 = (t * sp) % (span * 2), p2 = (t * sp + span * 0.9) % (span * 2);
      var e1x = 64 + (p1 < span ? p1 : span * 2 - p1), e2x = 64 + (p2 < span ? span - p2 : p2 - span);
      var st = [1, 0, 2, 0][Math.floor(t / 0.16) % 4];
      person(g, EMP1, p1 < span ? 'right' : 'left', st, e1x, 42, 2);
      person(g, EMP2, p2 < span ? 'left' : 'right', st, e2x, 38, 2);
      // the counter
      g.fillStyle = '#6b4a2b'; g.fillRect(50, 80, 210, 22); g.fillStyle = '#8a5e36'; g.fillRect(50, 80, 210, 5);
      g.fillStyle = C.gold; g.fillRect(150, 74, 10, 6);
      // you, from behind
      person(g, opts.look, 'up', 0, 140, 100, 2);
      if (!reduced()) raf(frame);
    }
    frame();
  }

  return { uturn: uturn, laugh: laugh, counter: counter };
})();
