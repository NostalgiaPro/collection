// Nostalgia Pro: the town map. A top-down pixel map of Sundown Flats with roads between the stops.
// Tap a stop to drive there: your car drives the roads while the clock ticks, and a Skip button jumps straight in.
// Drawn in code like everything else. All the street and place names are made up.
var NP = window.NP || {};
window.NP = NP;

NP.TownMap = (function () {
  'use strict';
  var W = 320, H = 224;
  var XS = [34, 112, 190, 268], YS = [46, 116, 186];     // the street grid
  var HOME = [0, 2];
  var PREFER = { yard: [1, 2], flea: [3, 1], gift: [2, 0], thrift: [1, 0], pawn: [3, 2], sports: [0, 1] };
  var ORDER = [[1, 2], [3, 1], [2, 0], [0, 0], [1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [2, 2], [3, 2]];
  var STREETS_H = ['MESQUITE LN', 'QUAIL RUN', 'CREOSOTE WAY'];
  var STREETS_V = ['OCOTILLO DR', 'JAVELINA CT', 'BRITTLEBUSH RD', 'SAGUARO BLVD'];
  var C = { sand: '#d9b77e', sand2: '#cfa96c', road: '#4a4d57', line: '#ffcc33', ink: '#0b1022', cream: '#fff1d6', green: '#3f8f4a', green2: '#57a061',
    canal: '#29adff', canal2: '#7fd0ff', roof: '#c8323c', wall: '#e8dcc0', grey: '#8a90a0', gold: '#ffcc33', cyan: '#29d3e8', red: '#e4343e' };

  function P(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }
  function txt(g, s, x, y, col, align) { NP.pixelText(g, s, x + 1, y + 1, 1, C.ink, align); NP.pixelText(g, s, x, y, 1, col, align); }
  function rnd(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // where each stop sits on the grid
  function layout(stops) {
    var used = {}, pos = {};
    used[HOME.join(',')] = true;
    stops.forEach(function (s) { var p = PREFER[s.type]; if (p && !used[p.join(',')]) { pos[s.id] = p; used[p.join(',')] = true; } });
    stops.forEach(function (s) {
      if (pos[s.id]) return;
      for (var i = 0; i < ORDER.length; i++) { var k = ORDER[i].join(','); if (!used[k]) { pos[s.id] = ORDER[i]; used[k] = true; return; } }
      pos[s.id] = [3, 2];
    });
    pos.home = HOME;
    return pos;
  }
  function px(n) { return { x: XS[n[0]], y: YS[n[1]] }; }

  // ---------- the town, drawn once ----------
  function drawTown(g) {
    var r = rnd(1983);
    P(g, 0, 0, W, H, C.sand);
    for (var i = 0; i < 260; i++) P(g, r() * W, r() * H, 1, 1, r() < 0.5 ? C.sand2 : '#e6c690');
    // the irrigation canal
    P(g, 0, 128, W, 7, C.canal); for (var k = 0; k < W; k += 9) P(g, k + (k % 18 ? 2 : 5), 130, 4, 1, C.canal2);
    // roads
    YS.forEach(function (y) { P(g, 0, y - 5, W, 10, C.road); for (var x = 2; x < W; x += 12) P(g, x, y, 6, 1, C.line); });
    XS.forEach(function (x) { P(g, x - 5, 0, 10, H, C.road); for (var y = 2; y < H; y += 12) P(g, x, y, 1, 6, C.line); });
    // bridges over the canal
    XS.forEach(function (x) { P(g, x - 7, 127, 14, 9, '#8a6a44'); P(g, x - 5, 127, 10, 9, C.road); });
    // houses and cacti in the blocks
    for (var bx = 0; bx < XS.length - 1; bx++) for (var by = 0; by < YS.length - 1; by++) {
      var x0 = XS[bx] + 9, x1 = XS[bx + 1] - 9, y0 = YS[by] + 9, y1 = YS[by + 1] - 9;
      for (var h = 0; h < 3; h++) {
        var hx = x0 + 4 + r() * (x1 - x0 - 20), hy = y0 + 18 + r() * (y1 - y0 - 34);
        if (hy > 112 && hy < 138) continue;
        P(g, hx, hy + 4, 12, 8, C.wall); P(g, hx - 1, hy, 14, 5, r() < 0.5 ? C.roof : '#a8202a'); P(g, hx + 5, hy + 8, 3, 4, '#6b4a2b');
      }
      for (var c = 0; c < 2; c++) { var cx = x0 + r() * (x1 - x0), cy = y0 + r() * (y1 - y0); if (cy > 120 && cy < 138) continue; P(g, cx, cy, 2, 7, C.green); P(g, cx - 2, cy + 2, 2, 1, C.green); P(g, cx - 2, cy, 1, 3, C.green); P(g, cx + 2, cy + 3, 2, 1, C.green2); P(g, cx + 3, cy + 1, 1, 3, C.green2); }
    }
    // street names
    STREETS_H.forEach(function (n, i) { txt(g, n, (XS[1] + XS[2]) / 2, YS[i] + 8, C.cream, 'center'); });
  }
  function building(g, s, x, y, t) {
    // every stop is a little building at its corner, set back from the road
    var bx = x - 13, by = y - 30;
    if (s.home) { P(g, bx + 2, by + 8, 22, 14, C.wall); P(g, bx, by + 2, 26, 8, '#3a7d44'); P(g, bx + 10, by + 15, 5, 7, '#6b4a2b'); return; }
    if (s.locked) {
      P(g, bx, by + 4, 26, 18, '#59606e'); P(g, bx - 1, by, 28, 5, '#3a3f4a');
      P(g, bx + 10, by + 9, 7, 6, C.grey); P(g, bx + 11, by + 6, 5, 4, '#3a3f4a'); P(g, bx + 12, by + 7, 3, 3, '#59606e');
      return;
    }
    if (s.type === 'flea') {
      for (var i = 0; i < 3; i++) { P(g, bx - 4 + i * 11, by + 6, 10, 4, i % 2 ? C.cyan : C.red); for (var k = 0; k < 10; k += 2) P(g, bx - 4 + i * 11 + k, by + 6, 1, 4, C.cream); P(g, bx - 3 + i * 11, by + 10, 8, 8, '#8a5e36'); }
      P(g, bx + 1, by + 1, 24, 4, C.gold);
      return;
    }
    if (s.type === 'gift') {
      P(g, bx, by + 6, 26, 16, '#7a3d8f'); P(g, bx - 1, by + 2, 28, 5, C.gold);
      P(g, bx + 9, by - 6, 8, 8, C.gold); P(g, bx + 11, by - 8, 4, 12, C.gold); P(g, bx + 7, by - 4, 12, 4, C.gold);
      return;
    }
    // a yard sale: a house, a driveway, a folding table with boxes
    P(g, bx + 2, by + 4, 18, 14, C.wall); P(g, bx, by, 22, 6, C.roof); P(g, bx + 8, by + 11, 5, 7, '#6b4a2b');
    P(g, bx + 18, by + 16, 14, 3, '#c9d1dc'); P(g, bx + 19, by + 19, 1, 3, C.grey); P(g, bx + 30, by + 19, 1, 3, C.grey);
    P(g, bx + 20, by + 12, 4, 4, '#a87443'); P(g, bx + 25, by + 13, 4, 3, C.cyan);
    if (Math.floor(t * 2) % 2) P(g, bx + 26, by + 5, 6, 4, C.gold);
  }
  function car(g, x, y, dir, t) {
    var bob = Math.floor(t * 12) % 2;
    if (dir === 'h') { P(g, x - 7, y - 4, 14, 8, C.ink); P(g, x - 6, y - 3, 12, 6, C.red); P(g, x - 2, y - 3, 5, 6, '#7fd0ff'); P(g, x - 6, y - 4 + bob * 0, 2, 1, C.ink); }
    else { P(g, x - 4, y - 7, 8, 14, C.ink); P(g, x - 3, y - 6, 6, 12, C.red); P(g, x - 3, y - 2, 6, 5, '#7fd0ff'); }
  }

  // ---------- one map on the page ----------
  function mount(box, opts) {
    var stops = opts.stops, pos = layout(stops), town = document.createElement('canvas');
    town.width = W; town.height = H; drawTown(town.getContext('2d'));
    box.innerHTML = '<div class="tm-wrap"><canvas class="tm-cv" width="' + W + '" height="' + H + '" aria-label="Town map. Tap a stop to drive there."></canvas></div>' +
      '<div class="tm-drive" hidden><div class="tm-dl"></div><button class="tm-skip" type="button">Skip the drive &#9654;&#9654;</button></div>';
    var cv = box.querySelector('.tm-cv'), g = cv.getContext('2d'), live = true, t0 = performance.now();
    g.imageSmoothingEnabled = false;
    var at = pos[opts.at] || HOME, carP = px(at), carDir = 'h', driving = null, puffs = [];
    function hit(ev) {
      var r = cv.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W, y = (ev.clientY - r.top) / r.height * H, best = null, bd = 30 * 30;
      stops.forEach(function (s) { var p = px(pos[s.id]), dx = p.x - x, dy = (p.y - 16) - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = s; } });
      return best;
    }
    cv.addEventListener('click', function (ev) { if (driving) return; var s = hit(ev); if (s && opts.onPick) opts.onPick(s); });
    function frame(now) {
      if (!live || !document.body.contains(cv)) { live = false; return; }
      var t = (now - t0) / 1000;
      g.drawImage(town, 0, 0);
      var nextId = null;
      stops.forEach(function (s) {
        var p = px(pos[s.id]);
        building(g, s, p.x, p.y, t);
        var label = s.locked ? 'FULL GAME' : (s.short || s.name);
        txt(g, label, p.x, p.y - 42, s.locked ? '#b8bdc8' : s.visited ? '#9fe8c0' : C.cream, 'center');
        if (s.visited) { P(g, p.x + 12, p.y - 34, 7, 7, '#3ddc84'); txt(g, '', p.x, p.y, C.ink); }
        if (s.next && !driving) { nextId = s.id; var rr = 3 + (Math.floor(t * 3) % 3); g.strokeStyle = C.gold; g.lineWidth = 2; g.strokeRect(p.x - 17 - rr, p.y - 34 - rr, 34 + rr * 2, 28 + rr * 2); }
        if (s.rare && !s.visited && Math.floor(t * 2.5) % 2 === 0) { txt(g, 'RARE STUFF!', p.x, p.y - 52, C.gold, 'center'); }
      });
      building(g, { home: true }, px(HOME).x, px(HOME).y, t); txt(g, 'HOME', px(HOME).x, px(HOME).y - 42, C.cream, 'center');
      if (driving) {
        var d = driving, k = Math.min(1, (now - d.start) / d.dur);
        var dist = k * d.total, seg = 0;
        while (seg < d.segs.length - 1 && dist > d.segs[seg].len) { dist -= d.segs[seg].len; seg++; }
        var S0 = d.segs[seg], f = S0.len ? Math.min(1, dist / S0.len) : 1;
        carP = { x: S0.a.x + (S0.b.x - S0.a.x) * f, y: S0.a.y + (S0.b.y - S0.a.y) * f };
        carDir = S0.a.y === S0.b.y ? 'h' : 'v';
        if (Math.random() < 0.5) puffs.push({ x: carP.x + (Math.random() - 0.5) * 4, y: carP.y + (Math.random() - 0.5) * 4, t: t });
        if (d.onTick) d.onTick(k);
        if (k >= 1) finish();
      }
      puffs = puffs.filter(function (q) { return t - q.t < 0.5; });
      puffs.forEach(function (q) { var a = 1 - (t - q.t) / 0.5; g.fillStyle = 'rgba(201,160,106,' + (a * 0.7).toFixed(2) + ')'; g.fillRect(Math.round(q.x), Math.round(q.y), 3, 3); });
      car(g, carP.x, carP.y, carDir, t);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    function finish() {
      if (!driving) return;
      var d = driving; driving = null;
      var last = d.segs[d.segs.length - 1].b; carP = { x: last.x, y: last.y };
      box.querySelector('.tm-drive').hidden = true;
      if (d.onTick) d.onTick(1);
      if (d.done) d.done();
    }
    return {
      // drive from where the car is to a stop: along the current street, then up or down the cross street
      drive: function (toId, o) {
        var A = carP, B = px(pos[toId] || HOME), mid = { x: B.x, y: A.y };
        if (!XS.some(function (x) { return Math.abs(x - A.x) < 1; }) && !YS.some(function (y) { return Math.abs(y - A.y) < 1; })) A = px(at);
        var pts = [A];
        // leave along the street you are on (rows first), then the column of the destination
        if (A.y !== B.y) {
          if (A.x !== B.x) pts.push(mid);
          pts.push(B);
        } else pts.push(B);
        var segs = [], total = 0;
        for (var i = 0; i < pts.length - 1; i++) { var len = Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y); segs.push({ a: pts[i], b: pts[i + 1], len: len }); total += len; }
        if (!total) { if (o.done) o.done(); return; }
        driving = { segs: segs, total: total, start: performance.now(), dur: o.dur || 1800, onTick: o.onTick, done: o.done };
        var bar = box.querySelector('.tm-drive');
        bar.querySelector('.tm-dl').textContent = o.label || '';
        bar.hidden = false;
        var sk = bar.querySelector('.tm-skip');
        sk.onclick = function () { if (o.onSkip) o.onSkip(); finish(); };
        try { sk.focus({ preventScroll: true }); } catch (e) {}
        if (NP.Sound) NP.Sound.sfx('start');
      },
      isDriving: function () { return !!driving; },
      stop: function () { live = false; }
    };
  }
  return { mount: mount, layout: layout };
})();
