// Nostalgia Pro: the start screen (a CRT on a VCR in a dark room), attract mode,
// the Saturday morning intro, and loading screens with tips that are also ads.
// All drawn in code.
var NP = window.NP || {};
window.NP = NP;

NP.FONT['°'] = [12, 18, 18, 12, 0, 0, 0];
NP.FONT['*'] = [0, 21, 14, 31, 14, 21, 0];

NP.Intro = (function () {
  'use strict';
  var INK = '#0b1022', CREAM = '#fff1d6', RED = '#e4343e', CYAN = '#29d3e8', NAVY = '#1d2b53', GOLD = '#ffcc33';
  var SCR = { x: 84, y: 14, w: 152, h: 116 };
  var seen = false;
  // build.js hard-codes this to true in the demo build
  function isDemo() { return false; }
  function comingSoon() { return !!(NP.CONFIG && NP.CONFIG.COMING_SOON); }
  function sfx(n) { if (NP.Sound) NP.Sound.sfx(n); }
  function once(o, key, fn) { if (!o[key]) { o[key] = true; fn(); } }

  function P(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }
  function T(g, s, x, y, k, c, al) { NP.pixelText(g, s, Math.round(x), Math.round(y), k, c, al); }
  function TS(g, s, x, y, k, c, sh, al) { T(g, s, x + k, y + k, k, sh, al); T(g, s, x, y, k, c, al); }

  // ---------- the room ----------
  function drawRoom(g, glow, t, on) {
    P(g, 0, 0, 320, 200, '#070a14');
    for (var x = 0; x < 320; x += 40) P(g, x, 0, 1, 168, '#0c1122');
    if (glow > 0) {
      var gr = g.createRadialGradient(160, 74, 8, 160, 90, 200);
      gr.addColorStop(0, 'rgba(90,170,255,' + (0.3 * glow).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(90,170,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 320, 200);
    }
    g.globalAlpha = 0.18 + 0.5 * glow;
    // a shelf on the left wall
    P(g, 6, 22, 56, 3, '#5a3b22'); P(g, 6, 84, 56, 3, '#5a3b22'); P(g, 6, 146, 56, 3, '#5a3b22');
    var cols = ['#e4343e', '#29adff', '#ffcc33', '#7a3d8f', '#00b894', '#ff77a8', '#8a90a0', '#ffa300'];
    for (var row = 0; row < 3; row++) {
      var bx = 8;
      for (var i = 0; i < 7; i++) {
        var w = 5 + ((i * 7 + row * 3) % 4), h = 38 + ((i * 11 + row * 5) % 18);
        if (bx + w > 60) break;
        P(g, bx, 22 + row * 62 - h, w, h, cols[(i + row * 3) % cols.length]);
        P(g, bx, 22 + row * 62 - h, w, 4, 'rgba(255,255,255,.35)');
        bx += w + 1;
      }
    }
    // a poster on the right wall
    P(g, 262, 26, 46, 64, '#2a1d3e'); P(g, 264, 28, 42, 60, '#3b2a56');
    P(g, 268, 52, 34, 22, '#ffcc33'); P(g, 274, 46, 22, 10, '#e4343e');
    T(g, 'MOON', 285, 32, 1, CREAM, 'center'); T(g, 'FERRET', 285, 40, 1, CREAM, 'center');
    T(g, '3', 285, 78, 1, CYAN, 'center');
    g.globalAlpha = 1;
    // TV stand
    P(g, 40, 170, 240, 5, '#6b4426'); P(g, 40, 175, 240, 25, '#3e2816');
    for (var k = 0; k < 6; k++) P(g, 48 + k * 38, 182 + (k % 3) * 5, 22, 1, '#2f1e10');
    P(g, 40, 170, 240, 1, '#8a5e36');
    drawVCR(g, t);
    drawTV(g, on);
  }

  function drawVCR(g, t) {
    P(g, 83, 152, 154, 19, INK); P(g, 84, 153, 152, 17, '#26272e'); P(g, 84, 153, 152, 2, '#3a3c46');
    P(g, 96, 159, 70, 4, '#101116'); P(g, 98, 160, 66, 1, '#2b2d35');
    P(g, 176, 159, 6, 4, '#3a3c46'); P(g, 184, 159, 6, 4, '#3a3c46');
    P(g, 196, 156, 34, 11, '#050608');
    if (Math.floor(t * 1.6) % 2 === 0) T(g, '12:00', 213, 158, 1, '#5cff8a', 'center');
  }

  function drawTV(g, on) {
    P(g, 70, 4, 180, 150, INK);
    P(g, 71, 5, 178, 148, '#2b2724');
    P(g, 71, 5, 178, 2, '#3d3833');
    P(g, SCR.x - 4, SCR.y - 4, SCR.w + 8, SCR.h + 8, '#141312');
    // wood panel along the bottom
    P(g, 74, 134, 172, 16, '#6b4426');
    for (var i = 0; i < 5; i++) P(g, 78 + i * 33, 138 + (i % 2) * 5, 20, 1, '#4e3019');
    for (var s = 0; s < 9; s++) P(g, 80 + s * 4, 137, 2, 10, '#2a1a0d');
    P(g, 200, 137, 10, 10, '#bdb7ad'); P(g, 202, 135, 6, 14, '#bdb7ad'); P(g, 204, 140, 2, 4, '#55504a');
    P(g, 220, 137, 10, 10, '#bdb7ad'); P(g, 222, 135, 6, 14, '#bdb7ad'); P(g, 224, 140, 2, 4, '#55504a');
    P(g, 238, 141, 3, 3, on ? '#ff3b3b' : '#3a1414');
    P(g, 152, 6, 16, 1, '#3d3833');
  }

  function screenOff(g) {
    P(g, SCR.x, SCR.y, SCR.w, SCR.h, '#16201f');
    g.fillStyle = 'rgba(255,255,255,.05)';
    for (var i = 0; i < 40; i++) g.fillRect(SCR.x + 10 + i, SCR.y + 6 + i, 30, 1);
  }

  var noiseC = null, noiseG = null, noiseD = null;
  function noise() {
    if (!noiseC) {
      noiseC = document.createElement('canvas'); noiseC.width = SCR.w; noiseC.height = SCR.h;
      noiseG = noiseC.getContext('2d'); noiseD = noiseG.createImageData(SCR.w, SCR.h);
    }
    var d = noiseD.data;
    for (var i = 0; i < d.length; i += 4) { var v = Math.random() * 255 | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    noiseG.putImageData(noiseD, 0, 0);
    return noiseC;
  }

  function glass(g) {
    for (var y = SCR.y; y < SCR.y + SCR.h; y += 2) P(g, SCR.x, y, SCR.w, 1, 'rgba(0,0,0,.16)');
    g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(SCR.x + 6, SCR.y + 4, SCR.w - 12, 10);
    // rounded corners
    var c = '#141312';
    [[0, 0], [SCR.w - 3, 0], [0, SCR.h - 3], [SCR.w - 3, SCR.h - 3]].forEach(function (p) {
      var x = SCR.x + p[0], y = SCR.y + p[1];
      if (p[1] === 0) { P(g, x, y, 3, 1, c); P(g, p[0] === 0 ? x : x + 2, y + 1, 1, 2, c); }
      else { P(g, x, y + 2, 3, 1, c); P(g, p[0] === 0 ? x : x + 2, y, 1, 2, c); }
    });
  }

  // ---------- the title, as a game box on a shelf ----------
  function drawBox(g, bx, by) {
    P(g, bx - 1, by - 1, 62, 68, INK);
    P(g, bx, by, 60, 66, NAVY);
    P(g, bx, by, 60, 15, RED);
    T(g, 'NOSTALGIA', bx + 30, by + 4, 1, CREAM, 'center');
    P(g, bx, by + 15, 60, 2, CYAN);
    TS(g, 'PRO', bx + 30, by + 19, 3, CREAM, RED, 'center');
    var grid = [[1, 0, 1, 1], [1, 1, 0, 1]];
    for (var r = 0; r < 2; r++) for (var c = 0; c < 4; c++) P(g, bx + 22 + c * 4, by + 46 + r * 4, 3, 3, grid[r][c] ? CREAM : RED);
    P(g, bx, by + 56, 60, 10, INK);
    T(g, isDemo() ? 'THE DEMO' : 'THE GAME', bx + 30, by + 58, 1, isDemo() ? GOLD : CYAN, 'center');
    g.fillStyle = 'rgba(255,255,255,.18)';
    for (var i = 0; i < 66; i++) { var sx = bx + 46 - i; if (sx >= bx && sx < bx + 60) g.fillRect(sx, by + i, 1, 1); }
  }
  function spines(g, x0, x1, shelfY, seed, hmin, hvar) {
    var cols = ['#e4343e', '#29adff', '#ffcc33', '#7a3d8f', '#00b894', '#ff77a8', '#ffa300', '#c3c8ff'];
    var x = x0, i = 0;
    hmin = hmin || 44; hvar = hvar || 18;
    while (x < x1) {
      var w = 6 + ((i * 5 + seed) % 4), h = hmin + ((i * 13 + seed) % hvar);
      if (x + w > x1) break;
      P(g, x, shelfY - h, w, h, INK);
      P(g, x + 1, shelfY - h + 1, w - 2, h - 1, cols[(i + seed) % cols.length]);
      P(g, x + 1, shelfY - h + 1, w - 2, 5, 'rgba(255,255,255,.35)');
      P(g, x + 2, shelfY - h + 12, w - 4, 1, 'rgba(0,0,0,.35)');
      x += w; i++;
    }
  }
  function drawTitle(g, t, showStart) {
    var X = SCR.x, Y = SCR.y, W = SCR.w, H = SCR.h;
    P(g, X, Y, W, H, '#16213e');
    for (var y = Y; y < Y + 72; y += 8) P(g, X, y, W, 4, '#1a2850');
    var shelfY = Y + 72;
    spines(g, X + 3, X + 45, shelfY, 1);
    spines(g, X + 108, X + W - 3, shelfY, 4);
    drawBox(g, X + 46, Y + 6);
    P(g, X, shelfY, W, 5, '#8a5e36'); P(g, X, shelfY + 5, W, 2, '#5a3b22');
    // the banner
    var ry = shelfY + 9;
    P(g, X + 6, ry + 4, 8, 16, '#b8901f'); P(g, X + W - 14, ry + 4, 8, 16, '#b8901f');
    P(g, X + 11, ry - 1, W - 22, 22, INK);
    P(g, X + 12, ry, W - 24, 20, GOLD);
    T(g, 'NOW WITH 40% MORE', X + W / 2, ry + 2, 1, INK, 'center');
    T(g, 'MERCHANDISING.', X + W / 2, ry + 11, 1, RED, 'center');
    if (showStart && Math.floor(t * 1.8) % 2 === 0) TS(g, 'PRESS START', X + W / 2, Y + H - 12, 1, CREAM, RED, 'center');
  }

  // ---------- attract mode: ads for the game itself ----------
  var ADS = [
    { h: ['NOSTALGIA PRO:', 'THE GAME'], s: ['NOW WITH A GAME', 'IN IT.'], v: 'box', bg: NAVY },
    { h: ['ONE SATURDAY.', 'ONE DEX.'], s: ['HE GETS UP EARLIER', 'THAN YOU.'], v: 'dex', bg: '#3a1f1f' },
    { h: ['IS IT ON', 'THE SHELF?'], s: ['ONLY ONE WAY TO', 'FIND OUT.'], v: 'you', bg: '#123a2f' },
    { h: ['"IT IS A GAME."'], s: ['- A GUY AT THE', 'SWAP MEET'], v: 'stars', bg: '#2a1d3e' },
    { h: ['COLLECT ALL', '1 OF IT.'], s: ['NOSTALGIA PRO.', 'SOLD SEPARATELY.'], v: 'box', bg: '#3a2a10' },
    { h: ['ASK YOUR', 'PARENTS'], s: ['TO DRIVE YOU TO', 'A YARD SALE.'], v: 'you', bg: '#16213e' }
  ];
  var ADS_FREE = [
    { h: ['THE AD-FREE', 'EDITION'], s: ['NOW WITH AN AD', 'FOR ITSELF.'], v: 'box', bg: NAVY },
    { h: ['NO ADS.'], s: ['EXCEPT THIS ONE.', 'AND THE NEXT ONE.'], v: 'stars', bg: '#2a1d3e' },
    { h: ['IS IT ON', 'THE SHELF?'], s: ['ASK THE AD-FREE', 'EDITION. IT KNOWS.'], v: 'you', bg: '#123a2f' }
  ];
  var ADS_DEMO = { h: ['THE FULL', 'VERSION'], s: ['SOLD SEPARATELY.', 'BY US. FOR 99 CENTS.'], v: 'box', bg: '#3a1f1f' };
  var ADS_DEMO_SOON = { h: ['THE FULL', 'VERSION'], s: ['COMING SOON.', 'FOR 99 CENTS.'], v: 'box', bg: '#3a1f1f' };
  var DEX_LOOK = { skin: 2, hair: 'spiky', hairCol: 4, shirt: 'flipside', hat: 'back', glasses: 'shades' };

  function star(g, x, y, c) {
    P(g, x + 3, y, 3, 2, c); P(g, x, y + 2, 9, 3, c); P(g, x + 1, y + 5, 7, 2, c); P(g, x + 1, y + 7, 2, 2, c); P(g, x + 6, y + 7, 2, 2, c);
  }
  function drawAd(g, ad, at, t, look) {
    var X = SCR.x, Y = SCR.y, W = SCR.w, H = SCR.h;
    P(g, X, Y, W, H, ad.bg);
    for (var i = 0; i < W; i += 16) P(g, X + i, Y + H - 22, 8, 22, 'rgba(255,255,255,.04)');
    T(g, 'ADVERTISEMENT', X + 4, Y + 3, 1, '#8a90a0');
    var y = Y + 14;
    ad.h.forEach(function (l) { var k = NP.textWidth(l, 2) <= W - 8 ? 2 : 1; TS(g, l, X + W / 2, y, k, GOLD, INK, 'center'); y += k * 8 + 2; });
    var vy = Y + 50;
    if (ad.v === 'box') {
      var bob = Math.round(Math.sin(at * 3) * 2);
      g.save(); g.translate(X + W / 2 - 15, vy + bob); g.scale(0.5, 0.5); drawBox(g, 0, 0); g.restore();
    } else if (ad.v === 'dex' || ad.v === 'you') {
      var L = NP.Char.normalize(ad.v === 'dex' ? DEX_LOOK : look);
      var px = X + 10 + ((at * 34) % (W - 36));
      P(g, X, vy + 30, W, 2, '#8a5e36');
      if (ad.v === 'you') { spines(g, X + W - 46, X + W - 8, vy + 30, 2, 18, 8); NP.Char.draw(g, L, 'down', 0, X + 30, vy + 6, 1); }
      else NP.Char.draw(g, L, 'right', [1, 0, 2, 0][Math.floor(at / 0.14) % 4], px, vy + 6, 1);
    } else if (ad.v === 'stars') {
      for (var s = 0; s < 5; s++) if (at > 0.2 + s * 0.15) star(g, X + W / 2 - 27 + s * 11, vy + 10, GOLD);
    }
    y = Y + 88;
    ad.s.forEach(function (l) { T(g, l, X + W / 2, y, 1, CREAM, 'center'); y += 9; });
    if (Math.floor(t * 1.8) % 2 === 0) T(g, 'PRESS START', X + W - 4, Y + 3, 1, CREAM, 'right');
  }

  // ---------- title controller ----------
  var TI = null;
  function title(canvas, opts) {
    TI = { cv: canvas, g: canvas.getContext('2d'), opts: opts, t0: performance.now(), phase: 'boot', idle: performance.now(), ad: 0, adT: 0, back: 0, snd: {}, lastAd: -1 };
    TI.g.imageSmoothingEnabled = false;
    if (seen || opts.skip) TI.t0 -= 1550;
    if (opts.skip) { TI.phase = 'menu'; TI.menuOpen = true; }
    canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); input(true); });
    requestAnimationFrame(tick);
  }
  function input(isStart) {
    if (!TI) return;
    var now = performance.now();
    TI.idle = now;
    if (TI.phase === 'boot') { TI.t0 = now - 2600; TI.phase = 'title'; seen = true; return; }
    if (TI.phase === 'attract') { TI.phase = TI.menuOpen ? 'menu' : 'title'; TI.back = now; return; }
    if (TI.phase === 'title' && isStart) { TI.phase = 'menu'; TI.menuOpen = true; if (TI.opts.onStart) TI.opts.onStart(); }
  }
  function tick(now) {
    if (!TI || !document.body.contains(TI.cv)) { TI = null; return; }
    var g = TI.g, t = (now - TI.t0) / 1000;
    var phase = TI.phase;
    if (phase === 'boot' && t > 2.6) { TI.phase = phase = TI.menuOpen ? 'menu' : 'title'; seen = true; }
    if ((phase === 'title' || phase === 'menu') && now - TI.idle > (phase === 'menu' ? 22000 : 14000)) { TI.phase = phase = 'attract'; TI.ad = 0; TI.adT = now; }
    var on = phase !== 'boot' || t > 0.7;
    var glow = phase === 'boot' ? (t < 0.7 ? 0 : t < 1.9 ? 0.5 + Math.random() * 0.4 : 0.8) : 0.8;
    drawRoom(g, glow, t, on);
    if (phase === 'boot') {
      if (t >= 0.7) once(TI.snd, 'click', function () { sfx('tvclick'); });
      if (t >= 0.95 && t < 1.9) once(TI.snd, 'static', function () { sfx('static'); });
      if (t < 0.7) screenOff(g);
      else if (t < 0.95) {
        screenOff(g);
        var p = (t - 0.7) / 0.25, lh = Math.max(1, Math.round(SCR.h * p * p));
        P(g, SCR.x, SCR.y + (SCR.h - lh) / 2, SCR.w, lh, '#e8f6ff');
      } else if (t < 1.9) g.drawImage(noise(), SCR.x, SCR.y);
      else {
        drawTitle(g, t, false);
        g.globalAlpha = Math.max(0, 1 - (t - 1.9) / 0.7);
        g.drawImage(noise(), SCR.x, SCR.y);
        g.globalAlpha = 1;
      }
    } else if (phase === 'attract') {
      var list = TI.opts.adFree() ? ADS_FREE : ADS;
      if (isDemo()) list = [comingSoon() ? ADS_DEMO_SOON : ADS_DEMO].concat(list);
      var at = (now - TI.adT) / 1000;
      if (at > 3.4) { TI.ad = (TI.ad + 1) % list.length; TI.adT = now; at = 0; }
      var adKey = TI.ad + ':' + TI.adT;
      if (TI.lastAd !== adKey) { TI.lastAd = adKey; sfx('staticshort'); }
      if (at < 0.22) g.drawImage(noise(), SCR.x, SCR.y);
      else drawAd(g, list[TI.ad], at, t, TI.opts.look);
    } else {
      drawTitle(g, t, phase === 'title');
      if (now - TI.back < 200) g.drawImage(noise(), SCR.x, SCR.y);
    }
    glass(g);
    requestAnimationFrame(tick);
  }
  function titleActive() { return !!(TI && document.body.contains(TI.cv)); }

  window.addEventListener('keydown', function (e) {
    if (!titleActive()) return;
    var tag = (e.target && e.target.tagName) || '';
    var menu = document.getElementById('cart');
    var menuOpen = menu && !menu.hidden;
    if (menuOpen && (e.code === 'ArrowDown' || e.code === 'ArrowUp')) {
      var items = Array.prototype.slice.call(menu.querySelectorAll('.cart-item:not([disabled])'));
      var i = items.indexOf(document.activeElement);
      i = e.code === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      if (items[i]) items[i].focus();
      e.preventDefault();
      TI.idle = performance.now();
      if (TI.phase === 'attract') input(false);
      return;
    }
    if (TI.phase === 'menu' && tag === 'BUTTON') { TI.idle = performance.now(); return; }
    var isStart = e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter';
    if (isStart && TI.phase === 'title') e.preventDefault();
    input(isStart);
  });
  ['pointerdown', 'pointermove', 'wheel'].forEach(function (ev) {
    window.addEventListener(ev, function () { if (TI && TI.phase !== 'attract') TI.idle = performance.now(); }, { passive: true });
  });

  // ---------- Saturday morning ----------
  var morningRun = 0;
  function morning(app, info, done) {
    morningRun++;
    var goals = NP.GOALS ? NP.GOALS(info.mode || (info.demo ? 'noon' : 'sundown')) : [];
    app.innerHTML = '<div class="screen morning"><canvas id="mcv" width="320" height="200" aria-label="Saturday morning. The alarm goes off at 6:58 AM. Then the to-do list on the fridge: ' + goals.join(' ').replace(/"/g, '') + '"></canvas>' +
      '<div class="btns center"><button data-intro="skip">Skip</button></div></div>';
    var cv = document.getElementById('mcv'), g = cv.getContext('2d'), t0 = performance.now(), fin = false;
    g.imageSmoothingEnabled = false;
    var look = NP.Char.normalize(info.look);
    function finish() {
      if (fin) return; fin = true;
      window.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick);
      done();
    }
    // Each scene stays up until the player taps, clicks or presses a key, so there is time to read it.
    var scene = 0, s0 = t0, SCENES = 4;
    function next() {
      if (performance.now() - s0 < 400) return;
      scene++; s0 = performance.now();
      if (scene >= SCENES) finish();
    }
    function onKey(e) { if (e.repeat) return; e.preventDefault(); next(); }
    function onClick(e) { if (e.target.closest('[data-intro="skip"]')) { finish(); return; } if (e.target === cv) next(); }
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    function frame(now) {
      if (fin || !document.body.contains(cv)) return;
      var t = (now - s0) / 1000;
      if (scene === 0) bedroom(g, t, look);
      else if (scene === 1) kitchen(g, t, look);
      else if (scene === 2) forecast(g, t, info);
      else fridge(g, t, goals);
      // the last scene says it in its caption instead
      if (scene < SCENES - 1 && t > 1 && Math.floor(t * 2) % 2 === 0) TS(g, (coarseTap() ? 'TAP' : 'CLICK') + ' TO CONTINUE', 314, 176, 1, GOLD, INK, 'right');
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  function coarseTap() { try { return !!((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window)); } catch (e) { return false; } }
  function caption(g, s) { P(g, 0, 186, 320, 14, 'rgba(5,8,20,.9)'); T(g, s, 160, 190, 1, CREAM, 'center'); }
  function bedroom(g, t, look) {
    P(g, 0, 0, 320, 200, '#0d1226');
    // window with a dawn sky
    var sky = ['#2a1d4e', '#4a2a6a', '#7a3a6a', '#b4505a', '#e07a4a', '#f2a54a'];
    for (var i = 0; i < 6; i++) P(g, 30, 24 + i * 12, 80, 12, sky[i]);
    P(g, 30, 84, 80, 12, '#1a1530'); P(g, 44, 70, 4, 16, '#1a1530'); P(g, 40, 76, 4, 3, '#1a1530'); P(g, 40, 72, 3, 6, '#1a1530'); P(g, 48, 74, 4, 3, '#1a1530'); P(g, 50, 70, 3, 6, '#1a1530');
    P(g, 90, 78, 20, 8, '#1a1530'); P(g, 96, 74, 12, 6, '#1a1530');
    P(g, 26, 20, 88, 4, '#3a3f55'); P(g, 26, 96, 88, 4, '#3a3f55'); P(g, 26, 20, 4, 80, '#3a3f55'); P(g, 110, 20, 4, 80, '#3a3f55'); P(g, 68, 24, 2, 72, '#3a3f55');
    // bed
    P(g, 0, 140, 190, 60, '#29437a'); P(g, 0, 140, 190, 4, '#3a5a9a');
    P(g, 10, 124, 54, 22, CREAM); P(g, 10, 124, 54, 3, '#ffffff');
    P(g, 30, 128, 18, 8, NP.Char.HAIRCOL[look.hairCol]);
    P(g, 70, 132, 100, 14, '#3a5a9a');
    // nightstand and alarm clock
    P(g, 200, 120, 84, 50, '#5a3b22'); P(g, 200, 120, 84, 4, '#8a5e36'); P(g, 236, 140, 12, 3, '#c9a24a');
    var ring = t > 0.8;
    if (ring) once(bedroom, 'alarm' + morningRun, function () { sfx('alarm'); });
    var sh = ring && Math.floor(t * 16) % 2 ? 1 : 0;
    P(g, 210 + sh, 88, 64, 32, INK); P(g, 212 + sh, 90, 60, 28, '#1b1b22');
    if (!ring || Math.floor(t * 4) % 2 === 0) TS(g, ring ? '6:58' : '6:57', 242 + sh, 96, 2, '#ff3b3b', '#4a0e0e', 'center');
    T(g, 'AM', 266 + sh, 112, 1, '#ff3b3b');
    if (ring) {
      var by = 64 + (Math.floor(t * 8) % 2) * 2;
      TS(g, 'BEEP BEEP', 242, by, 2, GOLD, INK, 'center');
    }
    caption(g, 'SATURDAY. 6:58 AM.');
  }
  function kitchen(g, t, look) {
    P(g, 0, 0, 320, 200, '#2a3a5a');
    for (var x = 0; x < 320; x += 12) for (var y = 110; y < 160; y += 12) P(g, x + 1, y + 1, 10, 10, '#324670');
    for (var cx = 0; cx < 320; cx += 16) for (var cy = 160; cy < 200; cy += 16) P(g, cx, cy, 16, 16, ((cx + cy) / 16) % 2 ? CREAM : NAVY);
    // fridge
    P(g, 59, 39, 82, 133, INK); P(g, 60, 40, 80, 131, '#e8e2d0'); P(g, 60, 82, 80, 2, '#b8b2a0');
    P(g, 128, 50, 4, 24, '#b8b2a0'); P(g, 128, 92, 4, 40, '#b8b2a0');
    P(g, 70, 50, 6, 6, RED); P(g, 110, 56, 6, 6, CYAN); P(g, 88, 140, 6, 6, '#00b894');
    // the sticky note
    P(g, 66, 93, 62, 36, '#c9a400'); P(g, 65, 92, 62, 36, '#ffe066'); P(g, 88, 89, 18, 5, 'rgba(255,255,255,.6)');
    T(g, "DON'T BUY", 96, 98, 1, RED, 'center');
    T(g, 'ANOTHER', 96, 108, 1, INK, 'center'); P(g, 76, 116, 41, 1, INK);
    T(g, 'COPY.', 96, 119, 1, INK, 'center');
    // key hook
    P(g, 196, 66, 56, 10, '#8a5e36'); P(g, 206, 76, 2, 5, '#c8cbd6'); P(g, 222, 76, 2, 5, '#c8cbd6'); P(g, 238, 76, 2, 5, '#c8cbd6');
    var grabbed = t > 1.2;
    if (grabbed) once(kitchen, 'keys' + morningRun, function () { sfx('keys'); });
    if (!grabbed) { P(g, 220, 80, 6, 4, GOLD); P(g, 222, 84, 2, 8, GOLD); P(g, 224, 88, 3, 2, GOLD); P(g, 218, 84, 2, 6, '#c8cbd6'); }
    // a can of Saguaro Splash Cola on the counter, label out, lit like a museum piece. Nobody put it there on purpose.
    if (NP.drawCan) { P(g, 160, 128, 30, 3, '#5a3b22'); NP.drawCan(g, 168, 104, 2, 1); if (Math.floor(t * 3) % 2 === 0) NP.drawSparkle(g, 188, 104, 1, t); }
    // you
    NP.Char.draw(g, look, 'left', 0, 236, 104, 3);
    if (grabbed) {
      P(g, 240, 150, 6, 4, GOLD); P(g, 242, 154, 2, 7, GOLD);
      if (t < 2.1) TS(g, '*JINGLE*', 222, 50, 1, GOLD, INK, 'center');
    }
    caption(g, grabbed ? 'GRAB YOUR KEYS. READ THE FRIDGE.' : 'THE FRIDGE HAS A NOTE.');
  }
  function forecast(g, t, info) {
    P(g, 0, 0, 320, 200, NAVY);
    P(g, 0, 0, 320, 22, RED); P(g, 0, 22, 320, 2, CYAN);
    TS(g, (info.label || 'SATURDAY #' + info.runNo) + ' FORECAST', 160, 5, 2, CREAM, INK, 'center');
    var wx = info.wx;
    var ix = 70, iy = 74;
    if (wx.id === 'rain') {
      P(g, ix - 26, iy - 12, 52, 18, '#8a90a0'); P(g, ix - 16, iy - 22, 30, 12, '#8a90a0'); P(g, ix - 26, iy - 12, 52, 2, '#c8cbd6');
      for (var d = 0; d < 6; d++) P(g, ix - 22 + d * 9, iy + 10 + ((Math.floor(t * 10) + d) % 3) * 4, 2, 6, CYAN);
    } else {
      var rr = wx.id === 'hot' ? 18 : 14;
      for (var a = 0; a < 8; a++) {
        var ang = a * Math.PI / 4 + t * 0.6;
        P(g, ix + Math.cos(ang) * (rr + 8) - 2, iy + Math.sin(ang) * (rr + 8) - 2, 4, 4, wx.id === 'hot' ? '#ff7b39' : GOLD);
      }
      for (var y = -rr; y <= rr; y++) { var w = Math.round(Math.sqrt(rr * rr - y * y)); P(g, ix - w, iy + y, w * 2, 1, wx.id === 'hot' ? '#ffa300' : GOLD); }
    }
    TS(g, wx.temp + '°F', 210, 52, 5, CREAM, INK, 'center');
    var nm = wx.name.toUpperCase(), nk = NP.textWidth(nm, 2) <= 200 ? 2 : 1;
    T(g, nm, 210, nk === 2 ? 96 : 99, nk, wx.id === 'hot' ? '#ff9e57' : wx.id === 'rain' ? CYAN : GOLD, 'center');
    var SP = NP.SPONSOR, spons = !!(wx.sponsored && SP);
    var by = 122;
    if (spons) {
      // the heat advisory, brought to you by a cola
      P(g, 13, 115, 294, 15, INK); P(g, 14, 116, 292, 13, RED); P(g, 14, 127, 292, 1, CYAN);
      NP.drawCan(g, 20, 113, 1, 1);
      if (Math.floor(t * 3) % 2 === 0) NP.drawSparkle(g, 30, 113, 1, t);
      T(g, (SP.weatherBy && SP.weatherBy[wx.id]) || SP.weather, 170, 119, 1, GOLD, 'center');
      by = 135;
    }
    var lines = NP.wrapPixel(wx.blurb, 1, 280);
    lines.forEach(function (l, i) { T(g, l, 160, by + i * 9, 1, CREAM, 'center'); });
    if (info.featured) {
      var fl = NP.wrapPixel('FEATURED LOT TODAY: ' + info.featured.name + ' AT ' + info.featured.stopName, 1, 290);
      var fy = spons ? 157 : 150;
      fl.forEach(function (l, i) { T(g, l, 160, fy + i * 9, 1, GOLD, 'center'); });
    }
    if (spons && t > 0.9 && t < 2.6) caption(g, 'YOU: ' + SP.react);
    else caption(g, 'PHOENIX, ARIZONA');
  }
  // the goal of the game, on a to-do list stuck to the fridge
  function fridge(g, t, goals) {
    P(g, 0, 0, 320, 200, '#e8e2d0');
    P(g, 304, 0, 16, 200, '#d6cfb9'); P(g, 308, 30, 5, 120, '#b8b2a0');
    P(g, 6, 12, 8, 8, CYAN); P(g, 292, 160, 8, 8, '#00b894');
    // the paper
    P(g, 21, 9, 278, 176, 'rgba(0,0,0,.18)');
    P(g, 18, 6, 278, 176, '#ffe98a');
    for (var ly = 30; ly < 180; ly += 15) P(g, 18, ly + 14, 278, 1, '#e8cf63');
    P(g, 36, 6, 1, 176, '#f2a3a3');
    P(g, 150, 2, 14, 10, RED); P(g, 152, 3, 10, 2, '#ff8a8f');
    T(g, 'SATURDAY TO-DO', 160, 14, 2, RED, 'center');
    var y = 33;
    goals.forEach(function (gl, i) {
      var lines = NP.wrapPixel(gl.toUpperCase(), 2, 250);
      // a box to tick, which you will not have time to tick
      P(g, 22, y + 2, 10, 10, INK); P(g, 24, y + 4, 6, 6, '#ffe98a');
      lines.forEach(function (l, j) { T(g, l, 42, y + j * 15, 2, i === goals.length - 1 ? RED : INK); });
      y += lines.length * 15 + 2;
    });
    if (t > 0.8 && Math.floor(t * 2) % 2 === 0) caption(g, coarseTap() ? 'TAP TO HIT THE ROAD' : 'PRESS ANY KEY TO HIT THE ROAD');
    else caption(g, 'THE FRIDGE IS NEVER WRONG.');
  }

  // ---------- loading screens ----------
  var TIPS = [
    'Tip: Real collectors check the label.',
    'Tip: The gift shop is open.',
    'Tip: The gift shop is still open.',
    'Tip: Sealed is forever. Opened is fun. Pick one.',
    'Tip: The football bin has a secret. The secret is more football.',
    'Tip: If a man says he knows what he got, he knows what he got.',
    'Tip: Dex gets up earlier than you. Dex always gets up earlier than you.',
    'Tip: Checking the shelf costs minutes. Buying it twice costs points.',
    'Tip: This tip is brought to you by Nostalgia Pro: The Tip.',
    'Tip: Lot boxes are a mystery. That is the whole point of lot boxes.',
    'Tip: Sellers remember you. Lowball accordingly.',
    'Tip: Nostalgia Pro: The Shelf Dust makes any shelf look collected.',
    "This drive is brought to you by Mesquite Mike's Beef Jerky. Mike is in the back seat. He wants you to know he is not a sponsor.",
    'Radio: "You are listening to 104.7 The Dust, the station that will never sell out. This hour of never selling out is sponsored by Saguaro Splash Cola."',
    "Tip: It's a dry heat. That is not a tip. That is Haboob Antiperspirant's slogan.",
    'Tip: Gila Glow SPF 900 blocks the sun. All of it. Do not wear it while driving.'
  ];
  var TIPS_FREE = ['Tip: You have the Ad-Free Edition. This tip is ad-free.', 'Tip: Tell a friend about the Ad-Free Edition. It is free of ads.'];
  var TIPS_WX = {
    hot: ['Tip: Hot days burn daylight. Bring water. Buy water at the gift shop.', 'Tip: Too hot to haggle? The gift shop has air conditioning. Probably.'],
    rain: ['Tip: Rain keeps the crowds home. More for you. Less for Dex.', 'Tip: Cardboard boxes do not love rain. Neither does Dex.']
  };
  var tipN = 0;
  var TIPS_DEMO = ['Tip: The full version has five more stops. This tip is sponsored by the full version.', 'Tip: The demo ends at the swap meet. Plan accordingly.'];
  function tip(adFree, wxId) {
    tipN++;
    if (isDemo() && tipN % 2 === 1) return TIPS_DEMO[(tipN >> 1) % TIPS_DEMO.length];
    if (adFree && tipN % 4 === 0) return TIPS_FREE[(tipN / 4) % TIPS_FREE.length | 0];
    if (TIPS_WX[wxId] && tipN % 3 === 0) return TIPS_WX[wxId][(tipN / 3 | 0) % TIPS_WX[wxId].length];
    return TIPS[Math.floor(Math.random() * TIPS.length)];
  }
  function loading(text, done) {
    var ov = document.createElement('div');
    ov.className = 'loading-ov';
    // text is null when the player turned tips off: just the car, briefly, then on to the stop
    ov.innerHTML = '<div class="ld-box"><canvas width="160" height="40"></canvas><div class="ld-t">LOADING</div>' + (text === null ? '' :
      '<div class="ld-tip"></div><div class="ld-skip">' + (coarseTap() ? 'Tap' : 'Click') + ' to continue</div>' +
      '<label class="tipoff"><input type="checkbox" class="tipoff-in"> Don\'t show tips</label>') + '</div>';
    if (text !== null) ov.querySelector('.ld-tip').textContent = text;
    document.body.appendChild(ov);
    var cv = ov.querySelector('canvas'), g = cv.getContext('2d'), t0 = performance.now(), fin = false;
    g.imageSmoothingEnabled = false;
    function finish() { if (fin) return; fin = true; if (ov.parentNode) ov.parentNode.removeChild(ov); done(); }
    if (text === null) setTimeout(finish, 700);
    function onBox(e) { return e.target && e.target.closest && e.target.closest('.tipoff'); }
    ov.addEventListener('click', function (e) { if (onBox(e)) return; if (performance.now() - t0 > 400) finish(); });
    function ldKey(e) { if (e.repeat || fin) return; if (performance.now() - t0 < 400) return; if (onBox(e) || e.key === 'Tab' || e.key === 'Shift') return; e.preventDefault(); window.removeEventListener('keydown', ldKey, true); finish(); }
    window.addEventListener('keydown', ldKey, true);
    function frame(now) {
      if (fin) { window.removeEventListener('keydown', ldKey, true); return; }
      var t = (now - t0) / 1000;
      P(g, 0, 0, 160, 40, '#111a33');
      P(g, 0, 28, 160, 12, '#4a4d57');
      for (var x = -((t * 120) % 20); x < 160; x += 20) P(g, x, 33, 10, 2, GOLD);
      var bob = Math.floor(t * 10) % 2;
      P(g, 56, 14 + bob, 44, 12, INK); P(g, 57, 15 + bob, 42, 10, RED);
      P(g, 66, 8 + bob, 24, 8, INK); P(g, 67, 9 + bob, 22, 6, RED); P(g, 69, 10 + bob, 8, 4, CYAN); P(g, 79, 10 + bob, 8, 4, CYAN);
      P(g, 60, 24, 8, 6, INK); P(g, 88, 24, 8, 6, INK);
      for (var d = 0; d < 3; d++) P(g, 48 - d * 9 - ((t * 60) % 9), 24 - d, 4 + d, 3, 'rgba(201,160,106,' + (0.6 - d * 0.18) + ')');
      var dots = '...'.slice(0, Math.floor(t * 4) % 4);
      ov.querySelector('.ld-t').textContent = 'LOADING' + dots;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---------- end of the demo: the TV turns off, then comes back on with an infomercial ----------
  var INFO = [
    { h: ['NOSTALGIA PRO:', 'THE FULL VERSION'], s: ['NOW WITH THE REST', 'OF SATURDAY.'], soon: ['COMING SOON, WITH THE', 'REST OF SATURDAY.'], bg: NAVY },
    { h: ['A NEW SATURDAY', 'EVERY DAY.'], s: ['EIGHT STOPS AND ONE DEX.', 'HE IS INCLUDED. SORRY.'], bg: '#3a1f1f' },
    { h: ['YOUR HOME', 'SHELF.'], s: ['IT KEEPS YOUR FINDS.', 'THE SELLERS KEEP GRUDGES.'], bg: '#123a2f' },
    { h: ['AND THE GRAIL.'], s: ['WE CANNOT SAY WHICH ONE.', 'OK, IT IS THIS GAME.'], bg: '#2a1d3e' }
  ];
  function drawInfoFrame(g, f, at) {
    var X = SCR.x, Y = SCR.y, W = SCR.w;
    P(g, X, Y, W, SCR.h, f.bg);
    T(g, 'ADVERTISEMENT', X + 4, Y + 3, 1, '#8a90a0');
    var y = Y + 16;
    f.h.forEach(function (l) { var k = NP.textWidth(l, 2) <= W - 8 ? 2 : 1; TS(g, l, X + W / 2, y, k, GOLD, INK, 'center'); y += k * 8 + 3; });
    g.save(); g.translate(X + W / 2 - 15, Y + 46 + Math.round(Math.sin(at * 3) * 2)); g.scale(0.5, 0.5); drawBox(g, 0, 0); g.restore();
    y = Y + 88;
    ((comingSoon() && f.soon) || f.s).forEach(function (l) { T(g, l, X + W / 2, y, 1, CREAM, 'center'); y += 9; });
  }
  function drawChurro(g, x, y) {
    P(g, x - 1, y - 1, 62, 9, INK);
    P(g, x, y, 60, 7, '#c8873a');
    for (var i = 3; i < 60; i += 4) P(g, x + i, y + 1, 1, 5, '#9a6328');
    for (var j = 0; j < 14; j++) P(g, x + 4 + (j * 7) % 54, y + (j % 3) + 1, 1, 1, CREAM);
    P(g, x, y - 1, 12, 9, RED); P(g, x + 4, y - 1, 4, 9, CREAM);
    P(g, x + 64, y - 3, 15, 11, INK); P(g, x + 65, y - 2, 13, 9, GOLD);
    T(g, '$2', x + 72, y, 1, INK, 'center');
  }
  function drawPitch(g, t, price) {
    var X = SCR.x, Y = SCR.y, W = SCR.w, H = SCR.h;
    P(g, X, Y, W, H, '#7a1418');
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6 + t * 0.4;
      for (var r = 10; r < 90; r += 3) P(g, X + W / 2 + Math.cos(a) * r, Y + 44 + Math.sin(a) * r * 0.7, 2, 2, 'rgba(255,204,51,.10)');
    }
    T(g, 'ADVERTISEMENT', X + 4, Y + 3, 1, '#d8a0a0');
    TS(g, comingSoon() ? 'COMING SOON' : 'ONLY', X + W / 2, Y + 14, 2, CREAM, INK, 'center');
    TS(g, price, X + W / 2, Y + 32, 4, GOLD, INK, 'center');
    drawChurro(g, X + 30, Y + 70);
    T(g, 'LESS THAN A CHURRO.', X + W / 2, Y + 86, 1, CREAM, 'center');
    if (Math.floor(t * 1.6) % 2 === 0) T(g, comingSoon() ? 'OPERATORS WARMING UP.' : 'OPERATORS STANDING BY.', X + W / 2, Y + 100, 1, GOLD, 'center');
  }
  function drawThanks(g) {
    var X = SCR.x, Y = SCR.y, W = SCR.w;
    P(g, X, Y, W, SCR.h, NAVY);
    TS(g, 'DEMO', X + W / 2, Y + 26, 3, GOLD, INK, 'center');
    TS(g, 'SUNDOWN', X + W / 2, Y + 52, 2, CREAM, RED, 'center');
    T(g, 'THANKS FOR PLAYING.', X + W / 2, Y + 80, 1, CYAN, 'center');
  }

  function infomercial(app, opts) {
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    var soon = !!opts.comingSoon, links = opts.links !== false;
    var btns = '';
    if (soon) {
      btns += '<div class="ibadge">Full game coming soon &middot; ' + esc(opts.price) + '</div>';
      if (links) btns += '<a class="ibtn buy" href="' + esc(opts.follow) + '" target="_blank" rel="noopener" data-track="infomercial_follow">Follow for updates</a>';
    } else if (links) {
      btns += '<a class="ibtn buy" href="' + esc(opts.url) + '" target="_blank" rel="noopener" data-track="infomercial_buy">Get the full game &middot; ' + esc(opts.price) + '</a>';
    }
    if (links) btns += '<a class="ibtn" href="' + esc(opts.site) + '" target="_blank" rel="noopener" data-track="infomercial_site">thenostalgiapro.com</a>';
    if (links && opts.feedback) btns += '<a class="ibtn" href="' + esc(opts.feedback) + '" target="_blank" rel="noopener" data-track="feedback_open">Tell us what you think</a>';
    if (links && opts.merch) btns += '<a class="ibtn merch" href="' + esc(opts.merch) + '" target="_blank" rel="noopener" data-track="merch_click">Shop real Nostalgia Pro merch</a>' +
      '<div class="merch-line">Yes, this ad is real. The "Is It On The Shelf?" tee is not on your shelf yet.</div>';
    btns += '<button class="ibtn again" data-act="demoagain">Play the demo again</button>';
    app.innerHTML = '<div class="screen infomercial"><div class="info-grid">' +
      '<div class="tvwrap"><canvas id="infocv" width="320" height="200" aria-label="The TV turns off, then comes back on with an ad for the full version of Nostalgia Pro. ' + (soon ? 'Full game coming soon, ' : 'Only ') + esc(opts.price) + '. Less than a churro."></canvas></div>' +
      '<div class="info-side"><div class="info-btns">' + btns + '</div>' +
      '<div class="carry"><b>Heads up:</b> ' + (soon
        ? 'when the full version comes out, it will be a separate game. Demo progress will not carry over.'
        : 'demo progress does not carry over. The full version is a separate download, and it starts fresh with a new Saturday every day.') + '</div></div></div>' +
      '<div class="foot">A parody. Every game, console, store and company in here is made up.</div></div>';
    var snd = {};
    var cv = document.getElementById('infocv'), g = cv.getContext('2d'), t0 = performance.now();
    g.imageSmoothingEnabled = false;
    var FR = 2.6, SHOW = 3.5;
    cv.addEventListener('pointerdown', function () {
      var t = (performance.now() - t0) / 1000, end = SHOW + INFO.length * FR;
      if (t < end) t0 = performance.now() - end * 1000;
    });
    function frame(now) {
      if (!document.body.contains(cv)) return;
      var t = (now - t0) / 1000;
      var on = !(t > 1.8 && t < 2.8);
      var glow = t < 1.8 ? 0.8 : t < 2.8 ? 0 : t < 3.5 ? 0.5 + Math.random() * 0.4 : 0.8;
      drawRoom(g, glow, t, on);
      if (t >= 1.4) once(snd, 'off', function () { sfx('tvoff'); });
      if (t >= 2.8) once(snd, 'on', function () { sfx('tvclick'); });
      if (t >= 3.05) once(snd, 'static', function () { sfx('staticshort'); });
      if (t < 1.4) drawThanks(g);
      else if (t < 1.8) {
        // the picture collapses to a line, then a dot
        P(g, SCR.x, SCR.y, SCR.w, SCR.h, '#05070a');
        var p = (t - 1.4) / 0.4, cx = SCR.x + SCR.w / 2, cy = SCR.y + SCR.h / 2;
        if (p < 0.6) { var h = Math.max(2, Math.round(SCR.h * (1 - p / 0.6))); P(g, SCR.x, cy - h / 2, SCR.w, h, '#e8f6ff'); }
        else { var w = Math.max(2, Math.round(SCR.w * (1 - (p - 0.6) / 0.4))); P(g, cx - w / 2, cy - 1, w, 2, '#ffffff'); }
      } else if (t < 2.8) {
        screenOff(g);
        if (t < 2.1) P(g, SCR.x + SCR.w / 2 - 1, SCR.y + SCR.h / 2 - 1, 2, 2, 'rgba(255,255,255,' + (1 - (t - 1.8) / 0.3).toFixed(2) + ')');
      } else if (t < 3.05) {
        screenOff(g);
        var q = (t - 2.8) / 0.25, lh = Math.max(1, Math.round(SCR.h * q * q));
        P(g, SCR.x, SCR.y + (SCR.h - lh) / 2, SCR.w, lh, '#e8f6ff');
      } else if (t < SHOW) g.drawImage(noise(), SCR.x, SCR.y);
      else {
        var k = Math.floor((t - SHOW) / FR), at = (t - SHOW) - k * FR;
        if (k < INFO.length) {
          if (k > 0) once(snd, 'f' + k, function () { sfx('staticshort'); });
          if (at < 0.2) g.drawImage(noise(), SCR.x, SCR.y); else drawInfoFrame(g, INFO[k], at);
        } else {
          var pt = t - SHOW - INFO.length * FR;
          once(snd, 'pitch', function () { sfx('cash'); if (NP.Sound) NP.Sound.music('title'); });
          if (pt < 0.2) g.drawImage(noise(), SCR.x, SCR.y); else drawPitch(g, t, opts.price);
        }
      }
      glass(g);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---------- an "unsponsored moment": interrupts haggling for a couple of seconds, then gets out of the way ----------
  function unsponsored(opts) {
    opts = opts || {};
    var SP = NP.SPONSOR || { name: 'Saguaro Splash Cola' };
    var ov = document.createElement('div');
    ov.className = 'unsp';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'An unsponsored moment');
    ov.innerHTML = '<div class="unsp-in"><div class="unsp-h">' + (opts.adFree ? 'AN AD-FREE UNSPONSORED MOMENT' : 'AN UNSPONSORED MOMENT') + '</div>' +
      '<canvas width="160" height="96"></canvas>' +
      '<div class="unsp-s">' + SP.name + '. Not a sponsor.</div><div class="unsp-k">Tap to get back to haggling</div></div>';
    document.body.appendChild(ov);
    var cv = ov.querySelector('canvas'), g = cv.getContext('2d'), t0 = performance.now(), fin = false;
    g.imageSmoothingEnabled = false;
    sfx('jingle');
    function close(e) {
      if (fin) return; fin = true;
      if (e && e.stopPropagation) e.stopPropagation();
      window.removeEventListener('keydown', onKey, true);
      ov.classList.add('out');
      setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 180);
    }
    function onKey(e) { e.preventDefault(); close(e); }
    ov.addEventListener('click', close);
    window.addEventListener('keydown', onKey, true);
    setTimeout(close, 2600);
    function frame(now) {
      if (fin) return;
      var t = (now - t0) / 1000;
      P(g, 0, 0, 160, 96, '#10081c');
      // glamour lighting: slow sweeping rays and a soft spotlight
      for (var i = 0; i < 10; i++) {
        var a = i * Math.PI / 5 + t * 0.5;
        g.fillStyle = i % 2 ? 'rgba(255,204,51,.10)' : 'rgba(41,211,232,.08)';
        g.beginPath(); g.moveTo(80, 50);
        g.lineTo(80 + Math.cos(a) * 140, 50 + Math.sin(a) * 140);
        g.lineTo(80 + Math.cos(a + 0.22) * 140, 50 + Math.sin(a + 0.22) * 140);
        g.closePath(); g.fill();
      }
      var gr = g.createRadialGradient(80, 50, 4, 80, 50, 46);
      gr.addColorStop(0, 'rgba(255,241,214,.45)'); gr.addColorStop(1, 'rgba(255,241,214,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 160, 96);
      P(g, 50, 82, 60, 4, 'rgba(0,0,0,.4)');
      var bob = Math.round(Math.sin(t * 4) * 2);
      NP.drawCan(g, 64, 22 + bob, 4, Math.min(1, t / 0.6));
      // a shine sweeping across the can
      var sx = 64 + ((t * 70) % 60) - 10;
      g.fillStyle = 'rgba(255,255,255,.35)';
      for (var j = 0; j < 56; j++) { var xx = Math.round(sx + j * 0.35); if (xx >= 64 && xx < 96) g.fillRect(xx, 22 + bob + j, 3, 1); }
      NP.drawSparkle(g, 104, 24, 2, t);
      NP.drawSparkle(g, 56, 70, 1, t + 0.4);
      NP.drawSparkle(g, 110, 66, 1, t + 0.8);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  return { title: title, morning: morning, loading: loading, tip: tip, infomercial: infomercial, unsponsored: unsponsored };
})();
