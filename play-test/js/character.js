// Nostalgia Pro: characters. Every sprite is drawn in code, pixel by pixel. No image files.
// Frames are 16x24, four directions, three walk steps (0 = standing, 1 and 2 = stepping).
var NP = window.NP || {};
window.NP = NP;

NP.Char = (function () {
  'use strict';
  var FW = 16, FH = 24, OUT = '#0b1022';
  var PANTS = '#3b5a96', PANTS_D = '#2a426f', SHOE = '#2b2422', EYE = '#1b1b28';

  var SKIN = ['#ffdcb8', '#f1c28e', '#d6a06a', '#b07548', '#7f4d2c', '#55331d'];
  var HAIRCOL = ['#1c1410', '#4a2f1c', '#8a5a2b', '#e6c46a', '#c2452d', '#b9bcc6', '#29d3e8', '#ff77a8'];
  var HAIR = [['short', 'Short'], ['spiky', 'Spiky'], ['long', 'Long'], ['ponytail', 'Ponytail'], ['curly', 'Curly'], ['buzz', 'Buzz cut'], ['bald', 'Bald']];
  var SHIRTS = [['np', 'Nostalgia Pro tee'], ['red', 'Red tee'], ['cyan', 'Cyan tee'], ['flannel', 'Flannel'], ['stripe', 'Striped tee'], ['hawaii', 'Loud vacation shirt'], ['cream', 'Plain white tee']];
  var HATS = [['none', 'No hat'], ['npcap', 'Nostalgia Pro cap'], ['cap', 'Red cap'], ['back', 'Backwards cap'], ['beanie', 'Beanie'], ['bucket', 'Bucket hat']];
  var GLASSES = [['none', 'None'], ['specs', 'Glasses'], ['shades', 'Shades'], ['3d', '3D glasses']];
  var HAT_COL = { npcap: '#1d2b53', cap: '#e4343e', back: '#00a37a', beanie: '#29d3e8', bucket: '#c9b48a' };

  var DEFAULT = { skin: 1, hair: 'short', hairCol: 1, shirt: 'np', hat: 'none', glasses: 'none' };

  function ids(list) { return list.map(function (o) { return o[0]; }); }
  function normalize(L) {
    L = L || {};
    var o = {};
    o.skin = (L.skin >= 0 && L.skin < SKIN.length) ? L.skin | 0 : DEFAULT.skin;
    o.hairCol = (L.hairCol >= 0 && L.hairCol < HAIRCOL.length) ? L.hairCol | 0 : DEFAULT.hairCol;
    o.hair = ids(HAIR).indexOf(L.hair) >= 0 ? L.hair : DEFAULT.hair;
    o.shirt = (ids(SHIRTS).indexOf(L.shirt) >= 0 || L.shirt === 'flipside') ? L.shirt : DEFAULT.shirt;
    o.hat = ids(HATS).indexOf(L.hat) >= 0 ? L.hat : DEFAULT.hat;
    o.glasses = ids(GLASSES).indexOf(L.glasses) >= 0 ? L.glasses : DEFAULT.glasses;
    return o;
  }
  function random(r, opts) {
    r = r || Math.random; opts = opts || {};
    function pk(list) { return list[Math.floor(r() * list.length)][0]; }
    var shirts = opts.noBrand ? SHIRTS.filter(function (s) { return s[0] !== 'np'; }) : SHIRTS;
    return {
      skin: Math.floor(r() * SKIN.length), hair: pk(HAIR), hairCol: Math.floor(r() * (opts.natural ? 6 : HAIRCOL.length)),
      shirt: pk(shirts), hat: r() < 0.45 ? 'none' : pk(HATS.filter(function (h) { return !(opts.noBrand && h[0] === 'npcap'); })),
      glasses: r() < 0.6 ? 'none' : pk(GLASSES)
    };
  }

  function dark(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    f = f == null ? 0.72 : f;
    return 'rgb(' + Math.round(((n >> 16) & 255) * f) + ',' + Math.round(((n >> 8) & 255) * f) + ',' + Math.round((n & 255) * f) + ')';
  }

  // ---------- pixel buffer ----------
  function mk() { return { p: new Array(FW * FH) }; }
  function px(b, x, y, c) { if (c && x >= 0 && x < FW && y >= 0 && y < FH) b.p[y * FW + x] = c; }
  function rect(b, x, y, w, h, c) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) px(b, x + i, y + j, typeof c === 'function' ? c(x + i, y + j) : c);
  }
  function outline(b) {
    var add = [];
    for (var y = 0; y < FH; y++) for (var x = 0; x < FW; x++) {
      if (b.p[y * FW + x]) continue;
      if ((x > 0 && b.p[y * FW + x - 1]) || (x < FW - 1 && b.p[y * FW + x + 1]) ||
          (y > 0 && b.p[(y - 1) * FW + x]) || (y < FH - 1 && b.p[(y + 1) * FW + x])) add.push(y * FW + x);
    }
    add.forEach(function (i) { b.p[i] = OUT; });
  }

  function shirtFn(id, front) {
    return function (x, y) {
      switch (id) {
        case 'np':
          // tiny shelf emblem on the chest
          if (front && y >= 13 && y <= 14 && x >= 6 && x <= 9) return ((x + y) % 3 === 0) ? '#e4343e' : '#fff1d6';
          if (front && y === 15 && x >= 6 && x <= 9) return '#29d3e8';
          return '#1b1b22';
        case 'red': return '#e4343e';
        case 'cyan': return '#29d3e8';
        case 'cream': return '#f3ead8';
        case 'flannel': return (((x >> 1) + (y >> 1)) & 1) ? '#b8282f' : '#4a1418';
        case 'stripe': return (y & 1) ? '#1d2b53' : '#fff1d6';
        case 'hawaii': var k = (x * 7 + y * 5) % 9; return k === 0 ? '#e4343e' : k === 4 ? '#00b894' : '#ffcc33';
        case 'flipside':
          if (front && y >= 13 && y <= 14 && x >= 6 && x <= 9) return '#1d2b53';
          return '#ff9e57';
        default: return '#8a90a0';
      }
    };
  }

  function drawHair(b, style, c, view) {
    if (style === 'bald') return;
    var d = dark(c, 0.75);
    if (view === 'front') {
      if (style === 'buzz') { rect(b, 4, 3, 8, 1, d); return; }
      if (style === 'curly') { rect(b, 4, 1, 8, 1, c); rect(b, 3, 2, 10, 3, c); rect(b, 3, 5, 1, 4, c); rect(b, 12, 5, 1, 4, c); px(b, 5, 3, d); px(b, 8, 2, d); px(b, 10, 3, d); return; }
      rect(b, 4, 2, 8, 3, c);
      px(b, 4, 5, c); px(b, 11, 5, c);
      px(b, 6, 4, d); px(b, 9, 4, d);
      if (style === 'spiky') { px(b, 4, 1, c); px(b, 6, 1, c); px(b, 8, 1, c); px(b, 10, 1, c); }
      if (style === 'long') { rect(b, 3, 4, 1, 9, c); rect(b, 12, 4, 1, 9, c); px(b, 4, 6, c); px(b, 11, 6, c); }
      if (style === 'ponytail') { px(b, 12, 6, c); px(b, 12, 7, c); }
    } else if (view === 'back') {
      if (style === 'buzz') { rect(b, 4, 3, 8, 6, d); return; }
      if (style === 'curly') { rect(b, 4, 1, 8, 1, c); rect(b, 3, 2, 10, 8, c); px(b, 5, 4, d); px(b, 9, 3, d); px(b, 7, 7, d); px(b, 10, 8, d); return; }
      rect(b, 4, 2, 8, 8, c);
      px(b, 6, 5, d); px(b, 9, 7, d);
      if (style === 'spiky') { px(b, 4, 1, c); px(b, 6, 1, c); px(b, 8, 1, c); px(b, 10, 1, c); }
      if (style === 'long') { rect(b, 4, 10, 8, 4, c); rect(b, 3, 4, 1, 9, c); rect(b, 12, 4, 1, 9, c); }
      if (style === 'ponytail') { rect(b, 7, 9, 2, 1, '#e4343e'); rect(b, 7, 10, 2, 4, c); }
    } else { // side view, facing left
      if (style === 'buzz') { rect(b, 4, 3, 7, 1, d); rect(b, 9, 4, 2, 4, d); return; }
      if (style === 'curly') { rect(b, 4, 1, 7, 1, c); rect(b, 3, 2, 9, 3, c); rect(b, 8, 5, 4, 5, c); px(b, 6, 3, d); px(b, 9, 7, d); return; }
      rect(b, 4, 2, 7, 3, c);
      rect(b, 8, 5, 3, 4, c);
      px(b, 9, 6, d);
      if (style === 'spiky') { px(b, 5, 1, c); px(b, 7, 1, c); px(b, 9, 1, c); }
      if (style === 'long') rect(b, 8, 5, 4, 9, c);
      if (style === 'ponytail') { rect(b, 11, 4, 1, 2, '#e4343e'); rect(b, 11, 6, 2, 5, c); }
    }
  }

  function drawHat(b, hat, view) {
    if (!hat || hat === 'none') return;
    var col = HAT_COL[hat], d = dark(col, 0.7);
    if (hat === 'beanie') {
      var w = view === 'side' ? 7 : 8;
      rect(b, 4, 1, w, 4, col); rect(b, 4, 4, w, 1, d); rect(b, 7, 0, 2, 1, '#fff1d6');
      return;
    }
    if (hat === 'bucket') {
      if (view === 'side') { rect(b, 4, 1, 7, 3, col); rect(b, 2, 4, 11, 2, d); }
      else { rect(b, 4, 1, 8, 3, col); rect(b, 2, 4, 12, 2, d); }
      return;
    }
    if (view === 'front') {
      rect(b, 4, 1, 8, 4, col);
      if (hat === 'back') { rect(b, 4, 4, 8, 1, d); px(b, 7, 4, '#fff1d6'); }
      else rect(b, 3, 5, 10, 1, d);
      if (hat === 'npcap') {
        px(b, 6, 2, '#fff1d6'); px(b, 7, 2, '#e4343e'); px(b, 8, 2, '#fff1d6'); px(b, 9, 2, '#fff1d6');
        px(b, 6, 3, '#fff1d6'); px(b, 7, 3, '#fff1d6'); px(b, 8, 3, '#e4343e'); px(b, 9, 3, '#fff1d6');
      }
    } else if (view === 'back') {
      rect(b, 4, 1, 8, 4, col);
      if (hat === 'back') rect(b, 3, 5, 10, 1, d);
      else { rect(b, 4, 4, 8, 1, d); px(b, 7, 4, '#d8d8e0'); }
    } else {
      rect(b, 4, 1, 7, 4, col);
      if (hat === 'back') rect(b, 10, 4, 3, 1, d); else rect(b, 1, 4, 4, 1, d);
      if (hat === 'npcap') { px(b, 5, 2, '#fff1d6'); px(b, 6, 2, '#e4343e'); px(b, 5, 3, '#fff1d6'); px(b, 6, 3, '#fff1d6'); }
    }
  }

  function drawGlasses(b, g, view) {
    if (!g || g === 'none') return;
    var frame = '#2b2f3f';
    if (view === 'front') {
      if (g === 'shades') { rect(b, 5, 7, 6, 2, '#0e0e14'); px(b, 6, 7, '#5a6a8a'); px(b, 9, 7, '#5a6a8a'); }
      else if (g === '3d') { rect(b, 5, 6, 6, 1, '#f3f3f3'); rect(b, 5, 7, 3, 2, '#e4343e'); rect(b, 8, 7, 3, 2, '#29d3e8'); }
      else { rect(b, 5, 7, 6, 1, frame); px(b, 6, 7, '#bfe9f2'); px(b, 9, 7, '#bfe9f2'); }
    } else if (view === 'back') {
      px(b, 4, 7, g === '3d' ? '#f3f3f3' : frame); px(b, 11, 7, g === '3d' ? '#f3f3f3' : frame);
    } else {
      if (g === 'shades') { rect(b, 4, 7, 2, 2, '#0e0e14'); rect(b, 6, 7, 3, 1, '#0e0e14'); }
      else if (g === '3d') { rect(b, 4, 7, 2, 2, '#e4343e'); rect(b, 6, 7, 3, 1, '#f3f3f3'); }
      else { px(b, 4, 7, frame); px(b, 5, 7, '#bfe9f2'); rect(b, 6, 7, 3, 1, frame); }
    }
  }

  function build(L, dir, step) {
    var b = mk(), skin = SKIN[L.skin], hc = HAIRCOL[L.hairCol];
    var view = dir === 'down' ? 'front' : dir === 'up' ? 'back' : 'side';
    if (view !== 'side') {
      var lUp = step === 1 ? 1 : 0, rUp = step === 2 ? 1 : 0;
      rect(b, 4, 18, 8, 2, PANTS);
      rect(b, 4, 20, 3, 2 - lUp, PANTS); rect(b, 9, 20, 3, 2 - rUp, PANTS);
      rect(b, 4, 22 - lUp, 3, 2, SHOE); rect(b, 9, 22 - rUp, 3, 2, SHOE);
      var sh = shirtFn(L.shirt, view === 'front');
      rect(b, 4, 11, 8, 7, sh);
      rect(b, 3, 11, 1, 3, sh); rect(b, 12, 11, 1, 3, sh);
      rect(b, 3, 14, 1, 3 - rUp, skin); rect(b, 12, 14, 1, 3 - lUp, skin);
      rect(b, 4, 3, 8, 8, skin);
      if (view === 'front') {
        px(b, 6, 7, EYE); px(b, 6, 8, EYE); px(b, 9, 7, EYE); px(b, 9, 8, EYE);
        px(b, 7, 10, dark(skin, 0.8)); px(b, 8, 10, dark(skin, 0.8));
      }
    } else {
      var sh2 = shirtFn(L.shirt, false);
      if (step === 0) { rect(b, 6, 18, 4, 4, PANTS); rect(b, 5, 22, 5, 2, SHOE); }
      else {
        var near = step === 1 ? PANTS : PANTS_D, far = step === 1 ? PANTS_D : PANTS;
        rect(b, 8, 18, 3, 3, far); rect(b, 9, 21, 3, 2, SHOE);
        rect(b, 4, 18, 3, 4, near); rect(b, 3, 22, 4, 2, SHOE);
        rect(b, 6, 18, 3, 1, PANTS);
      }
      rect(b, 5, 11, 6, 7, sh2);
      if (step === 0) rect(b, 7, 15, 2, 2, skin);
      else if (step === 1) { rect(b, 4, 12, 1, 2, sh2); rect(b, 4, 14, 1, 2, skin); }
      else { rect(b, 11, 12, 1, 2, sh2); rect(b, 11, 14, 1, 2, skin); }
      rect(b, 4, 3, 7, 8, skin);
      px(b, 3, 8, skin);
      px(b, 5, 7, EYE); px(b, 5, 8, EYE);
    }
    drawHair(b, L.hair, hc, view);
    drawHat(b, L.hat, view);
    drawGlasses(b, L.glasses, view);
    outline(b);
    var c = document.createElement('canvas');
    c.width = FW; c.height = FH;
    var g = c.getContext('2d');
    var mirror = dir === 'right';
    for (var y = 0; y < FH; y++) for (var x = 0; x < FW; x++) {
      var col = b.p[y * FW + x];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(mirror ? FW - 1 - x : x, y, 1, 1);
    }
    return c;
  }

  var cache = {};
  function frame(L, dir, step) {
    var key = [L.skin, L.hair, L.hairCol, L.shirt, L.hat, L.glasses, dir, step].join('|');
    if (!cache[key]) cache[key] = build(L, dir, step || 0);
    return cache[key];
  }
  function draw(ctx, L, dir, step, x, y, s) {
    s = s || 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame(L, dir, step), Math.round(x), Math.round(y), FW * s, FH * s);
  }

  return {
    FW: FW, FH: FH, SKIN: SKIN, HAIRCOL: HAIRCOL, HAIR: HAIR, SHIRTS: SHIRTS, HATS: HATS, GLASSES: GLASSES,
    DEFAULT: DEFAULT, normalize: normalize, random: random, frame: frame, draw: draw
  };
})();

// ---------- character creator screen ----------
NP.Creator = (function () {
  'use strict';
  var CH = NP.Char;
  var cur = null, onDone = null, doneLabel = '', pdir = 0, lastTurn = 0, autoTurn = true, raf = null, bound = false;
  var DIRS = ['down', 'left', 'up', 'right'];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function nameOf(list, id) { for (var i = 0; i < list.length; i++) if (list[i][0] === id) return list[i][1]; return id; }
  // demo only: some items are on display but sold separately
  function isLocked(key, id) {
    var c = NP.CONFIG;
    // build.js hard-codes this to true in the demo build
    var demo = false;
    return !!(demo && c && c.LOCKED_LOOK && c.LOCKED_LOOK[key] && c.LOCKED_LOOK[key].indexOf(id) >= 0);
  }
  function lockedPick() {
    var keys = ['hair', 'shirt', 'hat', 'glasses'];
    for (var i = 0; i < keys.length; i++) if (isLocked(keys[i], cur[keys[i]])) return keys[i];
    return null;
  }
  function unlockAll(L) {
    ['hair', 'shirt', 'hat', 'glasses'].forEach(function (k) { if (isLocked(k, L[k])) L[k] = CH.DEFAULT[k]; });
    return L;
  }

  function swRow(label, key, cols) {
    var h = '<div class="cr-row"><b>' + label + '</b><div class="cr-sw">';
    cols.forEach(function (c, i) {
      h += '<button class="sw' + (cur[key] === i ? ' on' : '') + '" style="background:' + c + '" data-cr="sw" data-k="' + key + '" data-v="' + i + '" aria-label="' + label + ' ' + (i + 1) + '"></button>';
    });
    return h + '</div></div>';
  }
  function arRow(label, key, list) {
    var lk = isLocked(key, cur[key]);
    return '<div class="cr-row"><b>' + label + '</b><button class="arrow" data-cr="prev" data-k="' + key + '" aria-label="Previous ' + label + '">&#9664;</button>' +
      '<span class="cr-val' + (lk ? ' locked' : '') + '">' + esc(nameOf(list, cur[key])) + (lk ? ' <small>sold separately</small>' : '') + '</span>' +
      '<button class="arrow" data-cr="next" data-k="' + key + '" aria-label="Next ' + label + '">&#9654;</button></div>';
  }
  function optsHTML() {
    var h = swRow('Skin', 'skin', CH.SKIN) + arRow('Hair', 'hair', CH.HAIR) + swRow('Hair color', 'hairCol', CH.HAIRCOL) +
      arRow('Shirt', 'shirt', CH.SHIRTS) + arRow('Hat', 'hat', CH.HATS) + arRow('Glasses', 'glasses', CH.GLASSES);
    var lk = lockedPick();
    if (lk) {
      var list = { hair: CH.HAIR, shirt: CH.SHIRTS, hat: CH.HATS, glasses: CH.GLASSES }[lk];
      h += '<div class="cr-lock">The ' + esc(nameOf(list, cur[lk])) + ' is sold separately. It comes with the full version. Pick something else to keep going.</div>';
    }
    return h;
  }
  function refreshDone() {
    var b = document.querySelector('[data-cr="done"]');
    if (b) b.disabled = !!lockedPick();
  }

  function render(app, look, done, label) {
    cur = unlockAll(CH.normalize(look));
    onDone = done; doneLabel = label || 'Looks good';
    app.innerHTML = '<div class="screen creator"><h2>Who is hitting the swap meet today?</h2>' +
      '<div class="cr-wrap"><div class="cr-prev"><canvas id="crcv" width="48" height="40"></canvas>' +
      '<div class="btns center"><button data-cr="turn">Turn around</button><button data-cr="random">Randomize</button></div></div>' +
      '<div class="cr-opts" id="cropts">' + optsHTML() + '</div></div>' +
      '<button class="big" data-cr="done">' + esc(doneLabel) + '</button>' +
      '<div class="foot">Your look is saved on this device for next Saturday. Change it any time from the title screen.</div></div>';
    refreshDone();
    if (!bound) { document.addEventListener('click', onClick); bound = true; }
    autoTurn = true; pdir = 0; lastTurn = 0;
    if (!raf) raf = requestAnimationFrame(loop);
    window.scrollTo(0, 0);
  }

  function refresh() { var el = document.getElementById('cropts'); if (el) el.innerHTML = optsHTML(); refreshDone(); }

  function cycle(key, d) {
    var list = { hair: CH.HAIR, shirt: CH.SHIRTS, hat: CH.HATS, glasses: CH.GLASSES }[key];
    var i = list.map(function (o) { return o[0]; }).indexOf(cur[key]);
    i = (i + d + list.length) % list.length;
    cur[key] = list[i][0];
    if (key === 'hat' || key === 'hair') { autoTurn = false; pdir = 0; }
  }

  function onClick(e) {
    var el = e.target.closest('[data-cr]');
    if (!el || !document.getElementById('crcv')) return;
    var a = el.getAttribute('data-cr'), k = el.getAttribute('data-k');
    if (a === 'sw') { cur[k] = +el.getAttribute('data-v'); refresh(); }
    else if (a === 'prev') { cycle(k, -1); refresh(); }
    else if (a === 'next') { cycle(k, 1); refresh(); }
    else if (a === 'turn') { autoTurn = false; pdir = (pdir + 1) % 4; }
    else if (a === 'random') { cur = unlockAll(CH.normalize(CH.random(null, { natural: Math.random() < 0.8 }))); refresh(); }
    else if (a === 'done') { if (lockedPick()) return; var cb = onDone; onDone = null; if (cb) cb(CH.normalize(cur)); }
  }

  function loop(t) {
    var cv = document.getElementById('crcv');
    if (!cv) { raf = null; return; }
    if (autoTurn && t - lastTurn > 2200) { pdir = (pdir + 1) % 4; lastTurn = t; }
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#111a33'; ctx.fillRect(0, 0, 48, 40);
    // a strip of swap meet dirt to stand on
    ctx.fillStyle = '#c9a06a'; ctx.fillRect(0, 30, 48, 10);
    ctx.fillStyle = '#b38a55'; [[4, 33], [13, 36], [22, 32], [31, 37], [40, 34], [45, 38], [9, 39]].forEach(function (p) { ctx.fillRect(p[0], p[1], 1, 1); });
    ctx.fillStyle = '#e4343e'; ctx.fillRect(0, 29, 48, 1);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(19, 33, 10, 2);
    var step = [1, 0, 2, 0][Math.floor(t / 160) % 4];
    CH.draw(ctx, cur, DIRS[pdir], step, 16, 10, 1);
    raf = requestAnimationFrame(loop);
  }

  return { render: render };
})();
