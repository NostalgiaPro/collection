// Nostalgia Pro: retro TV commercials (Demo round 5).
// Short animated spots for the game's own made-up brands. Every brand here is a parody invented for this game.
// Each spot is 6 to 8 seconds, drawn on a little 192x144 canvas with a CRT look, a jingle and announcer captions.
// NP.TVAds.play({ idx, label, onDone }) opens one. It can always be skipped.
var NP = window.NP || {};
window.NP = NP;

NP.TVAds = (function () {
  var W = 192, H = 144;
  var C = NP.COL || { navy: '#1d2b53', cream: '#fff1d6', red: '#e4343e', cyan: '#29d3e8', ink: '#0b1022', gold: '#ffcc33', grey: '#8a90a0' };

  function P(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
  function T(g, s, x, y, k, c, al, sh) { if (sh) NP.pixelText(g, s, x + k, y + k, k, sh, al || 'center'); NP.pixelText(g, s, x, y, k, c, al || 'center'); }
  function ease(k) { k = Math.max(0, Math.min(1, k)); return 1 - Math.pow(1 - k, 3); }
  function bounce(k) { k = Math.max(0, Math.min(1, k)); return k < 0.7 ? ease(k / 0.7) * 1.12 : 1.12 - 0.12 * ((k - 0.7) / 0.3); }
  function circle(g, cx, cy, r, c) { for (var y = -r; y <= r; y++) { var w = Math.round(Math.sqrt(r * r - y * y)); P(g, cx - w, cy + y, w * 2 + 1, 1, c); } }
  function bands(g, cols, y0, y1) { var n = cols.length, h = (y1 - y0) / n; cols.forEach(function (c, i) { P(g, 0, y0 + i * h, W, h + 1, c); }); }
  function sparkle(g, x, y, t, c) { var a = Math.floor(t * 8) % 4, l = [1, 2, 3, 2][a]; P(g, x, y - l, 1, l * 2 + 1, c || '#fff'); P(g, x - l, y, l * 2 + 1, 1, c || '#fff'); }

  // ---------- the spots ----------
  var ADS = [
    {
      id: 'cola', brand: 'Saguaro Splash Cola', dur: 7.2, bpm: 150,
      jingle: [[72, 1, 48], [76, 1], [79, 1, 55], [84, 2, 48], [0, 0.5], [83, 0.5], [84, 1, 53], [88, 2, 48]],
      cap: [[0, 'Hot out there?'], [1.6, 'Crack open a cold Saguaro Splash Cola!'], [3.8, 'Prickly on the outside. Fizzy on the inside.'], [5.8, 'Not a sponsor. Probably.']],
      draw: function (g, t) {
        bands(g, ['#ff7a3d', '#ff9a45', '#ffb956', '#ffd36b'], 0, 100);
        circle(g, 150, 30, 14 + Math.sin(t * 3) * 1, '#fff2a8');
        P(g, 0, 100, W, 44, '#e8b878'); P(g, 0, 100, W, 2, '#c9925a');
        // two cactus friends
        [[20, 70], [168, 78]].forEach(function (c, i) { var x = c[0], y = c[1]; P(g, x, y, 6, 30, '#2f8f4e'); P(g, x - 6, y + 8, 6, 3, '#2f8f4e'); P(g, x - 6, y + 2, 3, 9, '#2f8f4e'); P(g, x + 6, y + 12, 5, 3, '#2f8f4e'); P(g, x + 8, y + 5, 3, 10, '#2f8f4e'); P(g, x + 1, y + 2, 1, 26, '#4fbf6e'); });
        var k = ease(t / 1.2), cx = -40 + k * 128, phase = Math.min(1, Math.max(0, (t - 0.8) / 0.8));
        NP.drawCan(g, cx, 52 - Math.abs(Math.sin(t * 6)) * (t < 1.2 ? 4 : 0), 4, phase);
        // the fizz
        for (var i = 0; i < 14; i++) { var bt = (t * 1.4 + i * 0.37) % 2, bx = cx + 6 + ((i * 7) % 22), by = 52 - bt * 30; if (t > 1.4) P(g, bx + Math.sin(bt * 9 + i) * 2, by, 2, 2, '#e9fbff'); }
        // the splash
        if (t > 1.6 && t < 3.2) { var s = (t - 1.6) / 1.6; for (i = 0; i < 18; i++) { var a = i / 18 * Math.PI * 2, r = 10 + s * 50; P(g, cx + 16 + Math.cos(a) * r, 60 + Math.sin(a) * r * 0.6 - s * 10, 3, 3, i % 2 ? '#29d3e8' : '#bff6ff'); } }
        if (t > 2) { var b = bounce((t - 2) / 0.6); g.save(); g.translate(W / 2, 14); g.scale(b, b); T(g, 'SAGUARO', 0, 0, 2, C.cream, 'center', C.red); T(g, 'SPLASH!', 0, 16, 2, C.cream, 'center', C.red); g.restore(); }
        if (t > 3.8) { P(g, 0, 118, W, 26, 'rgba(29,43,83,0.85)'); T(g, 'PRICKLY OUTSIDE.', W / 2, 122, 1, C.cream); T(g, 'FIZZY INSIDE.', W / 2, 132, 1, C.gold); }
      }
    },
    {
      id: 'jerky', brand: "Mesquite Mike's Beef Jerky", dur: 7.4, bpm: 118, wave: 'triangle',
      jingle: [[55, 1, 43], [59, 0.5], [62, 0.5], [64, 1, 40], [62, 1], [59, 1, 43], [55, 2, 31]],
      cap: [[0, 'Long drive?'], [1.6, "Mesquite Mike's Beef Jerky."], [3.6, 'Chew the miles.'], [5.6, 'Mike would like you to know he is not a sponsor.']],
      draw: function (g, t) {
        bands(g, ['#3a2a5c', '#6b3a6b', '#b8526a', '#ef8a5b'], 0, 70);
        circle(g, 96, 70, 18, '#ffd36b'); P(g, 0, 70, W, 74, '#6e4b2a');
        // the road runs toward you
        g.fillStyle = '#3b3b45'; g.beginPath(); g.moveTo(88, 70); g.lineTo(104, 70); g.lineTo(170, 144); g.lineTo(22, 144); g.closePath(); g.fill();
        for (var i = 0; i < 6; i++) { var d = ((t * 0.9 + i / 6) % 1), y = 70 + d * d * 74, h = 1 + d * 8; P(g, 95 - d, y, 2 + d * 3, h, C.gold); }
        // mesquite trees roll past
        [0, 0.5].forEach(function (o) { var d = (t * 0.45 + o) % 1, x = 80 - d * d * 120, y = 70 + d * d * 50, s = 1 + d * 4; P(g, x - 1, y - 8 * s, s, 8 * s, '#3b2615'); circle(g, x, y - 9 * s, Math.round(4 * s), '#4f7a3a'); });
        // Mike: a big hat, a big mustache, a thumbs up
        if (t > 1.4) {
          var mx = 150, my = 64 + (1 - ease((t - 1.4) / 0.5)) * 80;
          P(g, mx - 14, my, 28, 3, '#5a3a1e'); P(g, mx - 7, my - 8, 14, 9, '#5a3a1e'); P(g, mx - 7, my - 2, 14, 2, '#c0392b');
          P(g, mx - 6, my + 3, 12, 11, '#e0a47a'); P(g, mx - 4, my + 6, 2, 2, C.ink); P(g, mx + 2, my + 6, 2, 2, C.ink); P(g, mx - 6, my + 10, 12, 2, '#3b2615');
          P(g, mx - 9, my + 14, 18, 22, '#3f6fb5'); P(g, mx - 2, my + 14, 4, 22, '#2c4f86');
          if (t > 2.2) { P(g, mx - 16, my + 16, 6, 6, '#e0a47a'); P(g, mx - 15, my + 11, 2, 5, '#e0a47a'); }
        }
        // the jerky strip, bobbing like it is driving too
        if (t > 2.6) {
          var jx = 46, jy = 92 + Math.sin(t * 4) * 3;
          for (var j = 0; j < 30; j++) P(g, jx + j, jy + Math.sin(j / 3 + t * 5) * 2, 1, 7, j % 5 ? '#7a3b1c' : '#5c2a12');
          sparkle(g, jx + 32, jy - 2, t, '#fff2a8');
        }
        T(g, "MESQUITE MIKE'S", W / 2, 6, 1, C.cream, 'center', C.ink);
        if (t > 3.6) { var b = bounce((t - 3.6) / 0.6); g.save(); g.translate(W / 2, 112); g.scale(b, b); T(g, 'CHEW THE MILES.', 0, 0, 2, C.gold, 'center', C.ink); g.restore(); }
      }
    },
    {
      id: 'haboob', brand: 'Haboob Antiperspirant', dur: 7.4, bpm: 132,
      jingle: [[64, 0.5, 40], [64, 0.5], [67, 1], [0, 0.5], [71, 0.5, 47], [72, 1], [76, 2, 48]],
      cap: [[0, 'When the dust wall hits...'], [2.6, '...stay dry.'], [4, "Haboob Antiperspirant. It's a dry heat."], [5.9, 'You will still sweat. You will sweat with dignity.']],
      draw: function (g, t) {
        bands(g, ['#7fc4e8', '#a8d8ef', '#d8eef7'], 0, 96); P(g, 0, 96, W, 48, '#d9a86a');
        // the dust wall rolls in, then rolls out
        var wall = t < 2.6 ? -60 + ease(t / 2.4) * 260 : 200 + (t - 2.6) * 140;
        for (var i = 0; i < 9; i++) { var y = 20 + i * 14, x = wall - 30 - (i % 3) * 8 + Math.sin(t * 4 + i) * 4; circle(g, x, y, 18, i % 2 ? '#a86b3a' : '#bf8247'); }
        P(g, 0, 0, Math.max(0, wall - 40), H, '#a86b3a');
        // our guy, sweaty in the dust, then calm and dry
        var dry = t > 2.6, gx = 96, gy = 70;
        P(g, gx - 5, gy, 10, 10, '#e0a47a'); P(g, gx - 5, gy - 2, 10, 3, '#3b2615');
        P(g, gx - 3, gy + 4, 1, 1, C.ink); P(g, gx + 2, gy + 4, 1, 1, C.ink);
        if (dry) P(g, gx - 2, gy + 7, 5, 1, C.ink); else P(g, gx - 1, gy + 7, 3, 2, C.ink);
        P(g, gx - 7, gy + 10, 14, 16, '#ffffff'); P(g, gx - 5, gy + 26, 4, 8, '#33415c'); P(g, gx + 1, gy + 26, 4, 8, '#33415c');
        if (!dry && wall > gx - 40) { for (i = 0; i < 4; i++) { var d = (t * 2 + i * 0.25) % 1; P(g, gx - 10 + i * 6, gy + d * 14, 1, 2, '#7fd3ff'); } P(g, gx - 7, gy + 14, 3, 4, '#b8cfe0'); P(g, gx + 4, gy + 14, 3, 4, '#b8cfe0'); }
        if (dry) {
          // the stick, held up like a trophy
          var sx = 128, sy = 52 - ease((t - 2.6) / 0.5) * 6;
          P(g, sx, sy, 10, 24, '#e9e9f0'); P(g, sx, sy, 10, 5, '#29d3e8'); P(g, sx + 2, sy + 8, 6, 12, '#1d2b53');
          sparkle(g, sx + 12, sy + 2, t, '#fff'); sparkle(g, sx - 3, sy + 18, t + 0.3, '#fff');
          if (t > 4) { P(g, 0, 112, W, 32, 'rgba(29,43,83,0.85)'); T(g, 'HABOOB', W / 2, 116, 2, C.cream, 'center', C.red); T(g, "IT'S A DRY HEAT.", W / 2, 133, 1, C.cyan); }
        }
      }
    },
    {
      id: 'gila', brand: 'Gila Glow SPF 900', dur: 7.2, bpm: 140,
      jingle: [[76, 0.5, 52], [79, 0.5], [81, 1], [79, 0.5, 48], [76, 0.5], [74, 1], [72, 2, 48]],
      cap: [[0, 'The sun is not your friend.'], [1.8, 'Gila Glow SPF 900.'], [3.6, 'Blocks the sun. Blocks the moon. Blocks your neighbor.'], [5.8, 'Apply every four minutes.']],
      draw: function (g, t) {
        bands(g, ['#ffb347', '#ffc861', '#ffdd85'], 0, 92); P(g, 0, 92, W, 52, '#e8b878');
        // the sun, in shades, with turning rays
        var sx = 52, sy = 38;
        for (var i = 0; i < 12; i++) { var a = i / 12 * Math.PI * 2 + t * 0.8; P(g, sx + Math.cos(a) * 30 - 2, sy + Math.sin(a) * 30 - 2, 4, 4, '#ff8c2a'); }
        circle(g, sx, sy, 22, '#ffe14d'); P(g, sx - 16, sy - 6, 13, 7, C.ink); P(g, sx + 3, sy - 6, 13, 7, C.ink); P(g, sx - 3, sy - 4, 6, 2, C.ink);
        P(g, sx - 6, sy + 10, 12, 2, '#d35400');
        // a gila monster on a rock, very well protected
        P(g, 108, 104, 70, 16, '#8a6a4a'); P(g, 112, 100, 62, 6, '#a3825e');
        var lx = 118, ly = 88;
        for (var j = 0; j < 40; j++) P(g, lx + j, ly + Math.sin(j / 5) * 1.5, 1, 10, (Math.floor(j / 5) % 2) ? '#e8732c' : '#2b1a12');
        P(g, lx + 40, ly + 1, 8, 7, '#e8732c'); P(g, lx + 45, ly + 2, 2, 2, C.ink);
        P(g, lx + 4, ly + 10, 3, 4, '#2b1a12'); P(g, lx + 30, ly + 10, 3, 4, '#2b1a12');
        if (t > 1.2) { var gl = (Math.sin(t * 6) + 1) / 2; P(g, lx - 2, ly - 3, 54, 1, 'rgba(255,255,255,' + (0.4 + gl * 0.5).toFixed(2) + ')'); sparkle(g, lx + 20, ly - 6, t, '#fff'); }
        // the bottle drops in
        if (t > 1.8) {
          var by = -40 + bounce((t - 1.8) / 0.7) * 92;
          P(g, 150, by, 18, 30, '#ff6f61'); P(g, 154, by - 6, 10, 6, '#ffffff'); P(g, 152, by + 8, 14, 12, C.cream);
          T(g, '900', 159, by + 11, 1, C.red);
        }
        if (t > 1.8) { T(g, 'GILA GLOW', 128, 10, 2, C.cream, 'center', '#d35400'); T(g, 'SPF 900', 128, 28, 2, C.red, 'center', C.cream); }
        if (t > 3.6) { P(g, 0, 124, W, 20, 'rgba(29,43,83,0.85)'); T(g, 'BLOCKS THE SUN. AND THE MOON.', W / 2, 131, 1, C.cream); }
      }
    },
    {
      id: 'gummy', brand: 'Gummy Somethings', dur: 6.6, bpm: 168,
      jingle: [[72, 0.5, 48], [74, 0.5], [76, 0.5], [79, 0.5], [77, 0.5, 53], [76, 0.5], [74, 0.5], [72, 0.5], [79, 1, 55], [84, 2, 48]],
      cap: [[0, 'What are they?'], [1.4, 'Nobody knows!'], [2.8, 'Gummy Somethings!'], [4.6, 'Shapes may vary. Shapes may not be shapes.']],
      draw: function (g, t) {
        var cols = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7'];
        for (var i = 0; i < 12; i++) P(g, 0, i * 12, W, 12, i % 2 ? '#2b1d4a' : '#34245a');
        for (i = 0; i < 9; i++) {
          var ph = (t * 1.6 + i * 0.41) % 1.2, x = 12 + i * 20, y = 112 - Math.abs(Math.sin(ph / 1.2 * Math.PI)) * (50 + (i % 3) * 14), c = cols[i % cols.length], sq = ph < 0.08 ? 3 : 0, sh = i % 4;
          if (sh === 0) P(g, x, y + sq, 12, 12 - sq, c);
          else if (sh === 1) circle(g, x + 6, y + 6, 6, c);
          else if (sh === 2) { for (var r = 0; r < 12; r++) P(g, x + 6 - r / 2, y + r, r + 1, 1, c); }
          else { P(g, x + 4, y, 4, 12, c); P(g, x, y + 4, 12, 4, c); }
          P(g, x + 2, y + 2, 2, 2, 'rgba(255,255,255,0.6)');
        }
        P(g, 0, 124, W, 20, '#1a1230');
        if (t > 2.8) {
          var word = 'GUMMY', word2 = 'SOMETHINGS';
          for (i = 0; i < word.length; i++) T(g, word[i], 66 + i * 13, 22 + Math.sin(t * 8 + i) * 3, 2, cols[i % cols.length], 'left', C.ink);
          for (i = 0; i < word2.length; i++) T(g, word2[i], 36 + i * 12, 42 + Math.sin(t * 8 + i + 2) * 3, 2, cols[(i + 3) % cols.length], 'left', C.ink);
        } else T(g, t > 1.4 ? 'NOBODY KNOWS!' : 'WHAT ARE THEY?', W / 2, 30, 2, C.cream, 'center', C.ink);
        if (t > 4.6) T(g, 'SHAPES MAY VARY.', W / 2, 130, 1, C.cream);
      }
    },
    {
      id: 'dust', brand: 'Nostalgia Pro: The Shelf Dust', dur: 7, bpm: 100, wave: 'triangle',
      jingle: [[60, 1, 36], [64, 1], [67, 1, 43], [72, 3, 48]],
      cap: [[0, 'Introducing Nostalgia Pro: The Shelf Dust.'], [2, 'Authentic dust. From an authentic shelf.'], [4, 'Now available sealed.'], [5.6, 'Ask for it by name.']],
      draw: function (g, t) {
        bands(g, ['#1d2b53', '#22325f', '#27396b'], 0, H);
        // a spotlight
        g.fillStyle = 'rgba(255,241,214,0.08)'; g.beginPath(); g.moveTo(80, 0); g.lineTo(112, 0); g.lineTo(150, 144); g.lineTo(42, 144); g.closePath(); g.fill();
        if (t < 3.6) {
          // the shelf and its boxes
          P(g, 28, 86, 136, 6, '#8b5a2b'); P(g, 28, 92, 136, 3, '#5e3b1b');
          ['#e4343e', '#29d3e8', '#ffcc33', '#3ddc84', '#CC79A7', '#E69F00'].forEach(function (c, i) { P(g, 36 + i * 21, 58, 16, 28, c); P(g, 38 + i * 21, 62, 12, 8, C.cream); });
          if (t > 1.2) { var d = (t - 1.2) / 2.2; for (var i = 0; i < 26; i++) { var a = i * 2.4, r = d * (20 + (i % 5) * 9); P(g, 96 + Math.cos(a) * r, 70 + Math.sin(a) * r * 0.5 - d * 14, 2, 2, 'rgba(200,190,170,' + (1 - d).toFixed(2) + ')'); } }
        } else {
          // the dust, sealed in a jar, on a little stand
          var k = bounce((t - 3.6) / 0.6), jy = 40 + (1 - k) * 30;
          P(g, 76, jy, 40, 46, 'rgba(220,235,255,0.35)'); P(g, 76, jy, 40, 2, '#e9fbff'); P(g, 74, jy - 6, 44, 7, C.gold);
          for (var j = 0; j < 30; j++) P(g, 80 + (j * 13) % 32, jy + 28 + (j * 7) % 16, 2, 2, '#b8ac98');
          P(g, 70, jy + 46, 52, 6, '#8b5a2b');
          sparkle(g, 118, jy + 4, t, '#fff'); sparkle(g, 72, jy + 22, t + 0.4, '#fff');
          T(g, 'NOW SEALED', W / 2, 118, 2, C.gold, 'center', C.ink);
        }
        T(g, 'NOSTALGIA PRO:', W / 2, 8, 1, C.cream); T(g, 'THE SHELF DUST', W / 2, 18, 2, C.cream, 'center', C.red);
      }
    }
  ];

  var cur = null;
  function close(skipped) {
    if (!cur) return;
    var c = cur; cur = null;
    cancelAnimationFrame(c.raf); clearTimeout(c.tm);
    window.removeEventListener('keydown', c.key, true);
    if (c.ov.parentNode) c.ov.parentNode.removeChild(c.ov);
    if (c.onDone) try { c.onDone(!!skipped, c.ad.id); } catch (e) {}
  }

  function play(opts) {
    opts = opts || {};
    if (cur) close(true);
    var ad = ADS[((opts.idx || 0) % ADS.length + ADS.length) % ADS.length];
    var ov = document.createElement('div');
    ov.className = 'tvad-ov';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'TV commercial: ' + ad.brand);
    ov.innerHTML = '<div class="tvad"><div class="tvad-top"><span class="tvad-ch">CH 3</span><span class="tvad-lab">' + (opts.label || 'A WORD FROM OUR NOT-SPONSORS') + '</span></div>' +
      '<div class="tvad-scr"><canvas width="' + W + '" height="' + H + '"></canvas><div class="tvad-scan"></div></div>' +
      '<div class="tvad-cap" aria-live="polite"></div><div class="tvad-bar"><i></i></div>' +
      '<button class="tvad-skip" type="button">Skip ad &#9654;&#9654;</button>' +
      '<div class="tvad-fine">A made-up brand. Any likeness to a real product is a coincidence.</div></div>';
    document.body.appendChild(ov);
    var cv = ov.querySelector('canvas'), g = cv.getContext('2d'), cap = ov.querySelector('.tvad-cap'), bar = ov.querySelector('.tvad-bar i');
    g.imageSmoothingEnabled = false;
    var t0 = performance.now(), lastCap = -1, calm = document.body.classList.contains('calmfx');
    var key = function (e) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); close(true); } };
    cur = { ov: ov, ad: ad, onDone: opts.onDone, key: key, raf: 0, tm: 0 };
    ov.querySelector('.tvad-skip').addEventListener('click', function (e) { e.stopPropagation(); close(true); });
    window.addEventListener('keydown', key, true);
    if (NP.Sound) { NP.Sound.sfx('staticshort'); setTimeout(function () { if (cur && cur.ad === ad) NP.Sound.jingle(ad.jingle, ad.bpm, ad.wave); }, 260); }
    function frame(now) {
      if (!cur || cur.ad !== ad) return;
      var t = (now - t0) / 1000;
      if (t < 0.25 && !calm) {
        // channel change static
        for (var y = 0; y < H; y += 2) for (var x = 0; x < W; x += 4) { var v = Math.random() * 255 | 0; g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(x, y, 4, 2); }
      } else {
        try { ad.draw(g, Math.max(0, t - 0.25)); } catch (e) {}
      }
      var ci = -1; ad.cap.forEach(function (c, i) { if (t - 0.25 >= c[0]) ci = i; });
      if (ci !== lastCap && ci >= 0) { lastCap = ci; cap.textContent = ad.cap[ci][1]; }
      bar.style.width = Math.min(100, t / (ad.dur + 0.25) * 100).toFixed(1) + '%';
      cur.raf = requestAnimationFrame(frame);
    }
    cur.raf = requestAnimationFrame(frame);
    cur.tm = setTimeout(function () { close(false); }, (ad.dur + 0.25) * 1000);
    if (window.__NP_TEST) window.__NP_TEST.closeTV = function () { close(true); };
    return function () { close(true); };
  }

  return { play: play, close: function () { close(true); }, count: ADS.length, list: ADS.map(function (a) { return { id: a.id, brand: a.brand, dur: a.dur }; }), isOn: function () { return !!cur; } };
})();
