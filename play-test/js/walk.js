// Nostalgia Pro: the walkable Saguaro Swap Meet. Top-down 3/4 view, 16px tiles.
// Everything is drawn in code. Shopping still runs through game.js (offers, inspect, shelf check, dig, gift shop).
var NP = window.NP || {};
window.NP = NP;

NP.Walk = (function () {
  'use strict';
  var T = 16, MW = 30, MH = 22;
  var SPEED = 64;          // player speed, pixels per second
  var DEX_SPEED = 52;      // Dex is a little slower than you. A little.
  var PX_PER_MIN = 96;     // walking 6 tiles costs 1 minute of daylight
  var MAX_STEALS = 3;      // same as the menu version: Dex takes the top 3
  var INK = '#0b1022', CREAM = '#fff1d6', RED = '#e4343e', CYAN = '#29d3e8', NAVY = '#1d2b53', GOLD = '#ffcc33';
  var GATE_X0 = 13, GATE_X1 = 16;

  var W = null;            // state for the current visit
  var ctx = null, CX = 0, CY = 0, VW = 320, VH = 208;
  var keys = {}, touchVec = { x: 0, y: 0 };
  var raf = null, lastT = 0, bannerCache = {};

  // ---------- Dex's map of the aisles ----------
  var SWAP_NODES = [[3, 6], [7, 6], [10, 6], [14, 6], [17, 6], [20, 6], [24, 6],
    [3, 12], [7, 12], [10, 12], [14, 12], [17, 12], [20, 12], [24, 12], [27, 12],
    [4, 19], [7, 19], [14, 19], [20, 19]];
  var SWAP_EDGES = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14],
    [15, 16], [16, 17], [17, 18], [1, 8], [8, 16], [3, 10], [10, 17], [5, 12], [12, 18], [6, 13]];
  // Round 3c: the aisles of the Desert Pixel Expo (two rows of booths, the doors at the bottom)
  var EXPO_NODES = [[5, 7], [10, 7], [15, 7], [20, 7], [25, 7], [5, 14], [10, 14], [15, 14], [20, 14], [25, 14], [15, 20], [5, 19], [25, 19]];
  var EXPO_EDGES = [[0, 1], [1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [8, 9], [1, 6], [3, 8], [7, 10], [5, 11], [11, 10], [9, 12], [12, 10]];
  var NODES, ADJ, N_GATE, N_FLIP;
  function useGraph(nodes, edges, gate, flip) {
    NODES = nodes; N_GATE = gate; N_FLIP = flip;
    ADJ = NODES.map(function () { return []; });
    edges.forEach(function (e) { ADJ[e[0]].push(e[1]); ADJ[e[1]].push(e[0]); });
  }
  useGraph(SWAP_NODES, SWAP_EDGES, 17, 15);
  function nodePx(n) { return { x: NODES[n][0] * T + 8, y: NODES[n][1] * T + 14 }; }

  // table slots: [tile x, tile y, Dex's node in front]
  var SLOTS = [[2, 4, 0], [9, 4, 2], [16, 4, 4], [2, 10, 7], [9, 10, 9]];

  var DEX_LOOK = { skin: 2, hair: 'spiky', hairCol: 4, shirt: 'flipside', hat: 'back', glasses: 'shades' };
  var CLERK_LOOK = { skin: 4, hair: 'short', hairCol: 0, shirt: 'np', hat: 'npcap', glasses: 'none' };
  var DEX_LINES = [
    'Just browsing. Same as you. Totally.',
    'You buying that? I would list it for triple.',
    'I got here at 5 AM. With a flashlight.',
    'Flipside Resale. We buy low and sell high. Mostly high.',
    'Have you checked sold listings? I check them in my sleep.',
    'Nice haul. Would be a shame if somebody got there first.',
    'I will never sell out. Ask anyone. Ask my van.'
  ];
  var DEX_DONE = [
    'Already got the good stuff. My table is by the fence. Market rate.',
    'No hard feelings. It is just business. Flipside business.',
    'Those prices are fair. Fair for me.'
  ];

  // ---------- small helpers ----------
  function G() { return NP.G; }
  function boost() { var g = NP.G; return g && g.walkBoost ? g.walkBoost() : 1; }
  function S() { return NP.G.state(); }
  function wxId() { var s = S(); return s && s.wx ? s.wx.id : 'sunny'; }
  function esc(s) { return NP.G.esc(s); }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(r, arr) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function avail(it) { return it && it.state === 'avail'; }
  // Dex can spot a planted repro from across the lot. He leaves it for you.
  function stealable(it) { return avail(it) && (it.kind === 'game' || it.kind === 'lot') && !it.planted; }
  function isTouch() {
    try { return ('ontouchstart' in window) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; }
  }

  // drawing in world coordinates
  function R(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x - CX), Math.round(y - CY), w, h); }
  function OB(x, y, w, h, c) { R(x - 1, y - 1, w + 2, h + 2, INK); R(x, y, w, h, c); }
  function TXT(s, x, y, c, align) { NP.pixelText(ctx, s, Math.round(x - CX), Math.round(y - CY), 1, c, align); }
  function sprite(look, dir, step, x, y) {
    NP.Char.draw(ctx, look, dir, step, x - 8 - CX, y - 24 - CY, 1);
  }
  function shadow(x, y) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(Math.round(x - 5 - CX), Math.round(y - 2 - CY), 10, 3); }
  function sign(x, y, text, bg, fg) {
    var w = NP.textWidth(text, 1) + 6;
    OB(x - w / 2, y, w, 11, bg);
    TXT(text, x, y + 2, fg, 'center');
  }

  // a tiny version of an item, about 10x11, for tables and boxes
  function mini(it, x, y) {
    if (it.kind === 'music') { OB(x, y + 1, 10, 9, '#15171d'); R(x + 3, y + 4, 4, 3, GOLD); R(x, y + 1, 4, 9, it.fmt === 'vinyl' ? RED : '#c9d1dc'); return; }
    if (it.kind === 'movie') { OB(x + 1, y, 8, 10, '#16181f'); R(x + 1, y, 8, 3, it.fmt === 'dvd' ? '#1f4fa8' : RED); R(x + 3, y + 5, 4, 3, CREAM); return; }
    if (it.kind === 'photo') { OB(x, y + 1, 10, 9, CREAM); R(x + 3, y + 3, 4, 4, '#f1c28e'); R(x + 2, y + 7, 6, 2, RED); return; }
    if (it.kind === 'lot') { OB(x, y + 3, 10, 7, '#a87443'); R(x, y + 3, 10, 2, '#8a5e36'); R(x + 4, y + 3, 2, 7, '#d8b07a'); return; }
    if (it.kind === 'merch' || it.kind === 'grail') {
      OB(x + 1, y, 8, 10, it.kind === 'grail' ? NAVY : CREAM); R(x + 1, y, 8, 3, RED); R(x + 1, y + 3, 8, 1, CYAN);
      return;
    }
    var pl = NP.PLATFORMS[it.p] || NP.PLATFORMS.k16;
    if (it.cond === 'loose' && pl.media === 'disc') {
      OB(x + 1, y + 4, 8, 6, '#c9d1dc'); R(x + 2, y + 4, 6, 1, pl.c1); R(x + 4, y + 6, 2, 2, '#7a8292');
    } else if (it.cond === 'loose') {
      OB(x + 1, y + 2, 8, 8, pl.media === 'hand' ? '#59606e' : '#9aa0ad'); R(x + 2, y + 3, 6, 4, pl.c2); R(x + 2, y + 3, 6, 1, pl.c1);
    } else {
      OB(x + 1, y, 8, 10, pl.c2); R(x + 1, y, 8, 3, pl.c1); R(x + 3, y + 5, 4, 3, '#fff1d6');
      if (it.cond === 'sealed') { R(x + 7, y + 1, 1, 8, 'rgba(255,255,255,.55)'); }
    }
  }

  // ---------- map build ----------
  function enter(stop) {
    var s = S();
    var r = mulberry32(NP.hashStr(s.seed + '|swapmeet|' + stop.id));
    W = {
      stop: stop, x: 15 * T, y: 20 * T + 14, dir: 'up', step: 0, anim: 0, dist: 0,
      look: G().look(), panel: null, objs: [], solid: new Uint8Array(MW * MH), occ: new Array(MW * MH),
      toast: '', toastT: 0, ptoast: '', tables: [], spots: [], hint: 8, rivalCounted: !!stop.cleared, started: false, enterAt: performance.now(), lastStep: 0,
      path: [], goal: null, face: null, marker: null, stuck: 0
    };
    // fence
    for (var x = 0; x < MW; x++) { setSolid(x, 0); if (x < GATE_X0 || x > GATE_X1) setSolid(x, MH - 1); }
    for (var y = 0; y < MH; y++) { setSolid(0, y); setSolid(MW - 1, y); }

    // Round 3c: the Desert Pixel Expo is its own hall with its own layout
    if (stop.type === 'expo') { W.expo = true; useGraph(EXPO_NODES, EXPO_EDGES, 10, 10); buildExpo(r); return; }
    useGraph(SWAP_NODES, SWAP_EDGES, 17, 15);
    buildTables(r);
    buildProps(r);
    pickCola();
    setupDex(r);
    setupRivals(r);
  }

  function setSolid(x, y, obj) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return;
    W.solid[y * MW + x] = 1;
    if (obj) W.occ[y * MW + x] = obj;
  }
  function addObj(o) {
    W.objs.push(o);
    if (o.fx != null) for (var j = 0; j < o.fh; j++) for (var i = 0; i < o.fw; i++) setSolid(o.fx + i, o.fy + j, o.open ? o : null);
    return o;
  }

  function buildTables(r) {
    var s = W.stop;
    var lots = s.items.filter(function (it) { return it.kind === 'lot'; });
    var vis = s.items.filter(function (it) { return it.kind !== 'lot' && !it.crate; });
    var groups = [], open = {};
    vis.forEach(function (it) {
      var g = open[it.seller];
      if (!g || g.items.length >= 3) {
        if (groups.length >= SLOTS.length) { groups[groups.length - 1].items.push(it); return; }
        g = { seller: it.seller, items: [] }; open[it.seller] = g; groups.push(g);
      }
      g.items.push(it);
    });
    var slotOrder = shuffle(r, SLOTS.map(function (_, i) { return i; }));
    var FILLERS = shuffle(r, [
      { label: 'TUBE SOCK TABLE', title: 'Tube sock table', sign: 'TUBE SOCKS', cols: ['#f3f3f3', '#e4343e', '#29d3e8'],
        text: 'Tube socks, six for $5. Not a single video game on this table. The man running it seems completely at peace.' },
      { label: 'PHONE CASE TABLE', title: 'Phone case table', sign: 'PHONE CASES', cols: ['#ff77a8', '#29d3e8', '#ffcc33', '#00b894'],
        text: 'Phone cases for every phone made after 2015. You check under the table anyway. More phone cases.' },
      { label: 'TOOL TABLE', title: 'Tool table', sign: 'TOOLS', cols: ['#8a90a0', '#5d6370', '#c8323c'],
        text: 'Rusty wrenches and one drill with no battery. One of the wrenches is shaped a lot like a cartridge. It is a wrench.' },
      { label: 'EMPTY TABLE', title: 'An empty table', sign: null, cols: null,
        text: 'A folding table with a "BACK IN 5 MIN" sign. The sign is sun bleached. It has been five minutes since about 1998.' }
    ]);
    var fillerN = 0;
    var CLOTH = { friendly: ['#3a7d44', '#57a061', '#2a5c32'], firm: ['#6d7383', '#8b91a1', '#4f5462'], ikwig: ['#7a3d8f', '#9a58b0', '#5a2c6a'] };
    SLOTS.forEach(function (sl, idx) {
      var gi = slotOrder.indexOf(idx);
      var g = groups[gi];
      var tb = {
        kind: 'table', fx: sl[0], fy: sl[1], fw: 3, fh: 1, node: sl[2], base: (sl[1] + 1) * T,
        seller: g ? g.seller : null, items: g ? g.items : [], cloth: g ? (CLOTH[g.seller] || CLOTH.friendly) : ['#8a5e36', '#a87443', '#6b4a2b'],
        vendor: g ? NP.Char.normalize(NP.Char.random(r, { noBrand: true, natural: true })) : null
      };
      if (g) {
        var sd = NP.SELLERS[g.seller];
        var dflt = sd.hi[Math.floor(r() * sd.hi.length)];
        tb.hello = (G().helloFor && G().helloFor(g.seller)) || dflt;
        tb.label = sd.name.toUpperCase() + "'S TABLE";
        tb.title = sd.name + "'s table";
        tb.open = function () { return tablePanel(tb); };
        // vendor stands behind the table
        setSolid(sl[0] + 1, sl[1] - 1, tb);
        W.tables.push(tb);
        W.spots.push({ node: sl[2], items: function () { return tb.items; }, name: sd.name });
      } else {
        // no game vendor in this slot today. Something else is.
        var f = FILLERS[fillerN++ % FILLERS.length];
        tb.label = f.label; tb.title = f.title; tb.flavorSign = f.sign;
        if (f.cols) {
          tb.vendor = NP.Char.normalize(NP.Char.random(r, { noBrand: true, natural: true }));
          setSolid(sl[0] + 1, sl[1] - 1, tb);
          tb.junk = [];
          for (var q = 0; q < 9; q++) tb.junk.push([3 + q * 5, Math.floor(r() * 3), 4, 3 + Math.floor(r() * 2), f.cols[Math.floor(r() * f.cols.length)]]);
        }
        tb.open = (function (txt) { return function () { return flavor(txt); }; })(f.text);
      }
      tb.draw = function () { drawTable(tb); };
      addObj(tb);
    });

    // mystery lot bin
    var bin = {
      kind: 'lotbin', fx: 26, fy: 10, fw: 2, fh: 2, base: 12 * T, label: 'MYSTERY LOT BOXES', title: 'Mystery lot boxes', lots: lots,
      open: function () { return lotPanel(bin); }, draw: function () { drawLotBin(bin); }
    };
    addObj(bin);
    if (lots.length) W.spots.push({ node: 14, items: function () { return lots; }, name: 'the lot bin' });

    // dig pile
    var dig = {
      kind: 'dig', fx: 16, fy: 10, fw: 3, fh: 2, base: 12 * T, label: 'THE DIG PILE', title: 'The dig pile',
      open: function () { return digPanel(); }, draw: function () { drawDig(); }
    };
    addObj(dig);

    // the official gift shop booth
    var gift = {
      kind: 'gift', fx: 22, fy: 2, fw: 5, fh: 4, base: 6 * T, label: 'OFFICIAL GIFT SHOP', title: 'Nostalgia Pro Official Gift Shop (Swap Meet Location)',
      open: function () { return giftPanel(); }, draw: function () { drawGift(); }
    };
    addObj(gift);

    // Flipside Resale's table, by the fence
    var flip = {
      kind: 'flip', fx: 3, fy: 17, fw: 3, fh: 1, base: 18 * T, label: 'FLIPSIDE RESALE TABLE', title: 'Flipside Resale table',
      open: function () { return flipPanel(); }, draw: function () { drawFlip(); }
    };
    addObj(flip);
  }

  function buildProps() {
    // full game: the Crate Lady sells records, tapes, CDs and movies out of the milk crates (the demo keeps the workout tapes)
    var crateItems = W.stop.items.filter(function (it) { return it.crate; });
    addObj({ kind: 'crates', fx: 9, fy: 15, fw: 2, fh: 1, base: 16 * T, label: crateItems.length ? "THE CRATE LADY'S CRATES" : 'MILK CRATES OF TAPES', title: crateItems.length ? NP.SELLERS.crate.name : 'Milk crates',
      open: function () { return crateItems.length ? cratePanel(crateItems) : flavor('Two milk crates of workout tapes. Every single one is "Aerobics for Dads, Volume 6." There was never a Volume 1. Nobody has ever bought one. Nobody ever will.'); },
      draw: drawCrates });
    addObj({ kind: 'churro', fx: 22, fy: 16, fw: 2, fh: 1, base: 17 * T, label: 'CHURRO CART', title: 'Churro cart',
      open: function () { return flavor('Churros, $2. You cannot put a churro on a shelf. People have tried. The churro guy has stories.'); },
      draw: drawChurro });
    addObj({ kind: 'potty', fx: 27, fy: 17, fw: 1, fh: 2, base: 19 * T, label: 'PORTA POTTY', title: 'Porta potty',
      open: function () { return flavor('OCCUPIED. It has been occupied since 7 AM. Somebody in there is reading a strategy guide.'); },
      draw: drawPotty });
    [[1, 7], [1, 18], [28, 14], [28, 3]].forEach(function (p) {
      addObj({ kind: 'cactus', fx: p[0], fy: p[1], fw: 1, fh: 1, base: (p[1] + 1) * T, draw: function () { drawSaguaro(p[0], p[1]); } });
    });
    // gate posts and exit sign
    W.objs.push({ kind: 'gate', base: MH * T + 1, draw: drawGate });
  }


  // =====================================================================================================
  // ---------- Round 3c: the Desert Pixel Expo ----------
  // =====================================================================================================
  // Same walking, tapping and panels as the swap meet. Six booths, about ten nerds who walk straight to the
  // thing they want (it floats over their heads), every rival in town, and a prototype hidden in the hall.
  // booth layout: [key, tile x, tile y, width, node in front]
  var BOOTHS = [['dealerA', 2, 4, 6, 0], ['exclusive', 12, 4, 6, 2], ['dealerB', 22, 4, 6, 4],
    ['grading', 2, 11, 5, 5], ['homebrew', 12, 11, 6, 7], ['autograph', 22, 11, 6, 9]];
  var BOOTH_COL = { dealerA: ['#7a3d8f', '#9a58b0', '#5a2c6a'], exclusive: ['#a8202a', '#e4343e', '#6e1018'], dealerB: ['#3a7d44', '#57a061', '#2a5c32'],
    grading: ['#3a4d82', '#5a6fa8', '#253461'], homebrew: ['#2d6a6a', '#3f8f8f', '#1d4a4a'], autograph: ['#b8860b', '#ffcc33', '#7a5a08'] };
  var STEVE_LOOK = { skin: 0, hair: 'bald', hairCol: 5, shirt: 'cream', hat: 'none', glasses: 'specs' };
  var CHET_LOOK = { skin: 2, hair: 'spiky', hairCol: 0, shirt: 'red', hat: 'none', glasses: 'shades' };
  function E() { return NP.EXPO; }
  function boothItems(key) {
    var s = W.stop;
    return s.items.filter(function (it) { return it.booth === key && (!it.hidden || s.grailOpen); });
  }
  function boothByKey(key) { return W.booths.filter(function (b) { return b.key === key; })[0]; }
  function buildExpo(r) {
    var s = W.stop, st = S();
    W.booths = []; W.tables = []; W.spots = []; W.npcs = []; W.nerds = [];
    s.stamps = s.stamps || {};
    BOOTHS.forEach(function (bd) {
      var key = bd[0], D = E().booths[key];
      var b = {
        kind: 'booth', key: key, fx: bd[1], fy: bd[2], fw: bd[3], fh: 2, node: bd[4], base: (bd[2] + 2) * T,
        label: D.short, title: D.name, seller: D.seller || null, cloth: BOOTH_COL[key],
        vendor: key === 'autograph' ? NP.Char.normalize(CHET_LOOK) : NP.Char.normalize(NP.Char.random(r, { noBrand: true, natural: true }))
      };
      b.items = boothItems(key);
      b.hello = D.seller && NP.SELLERS[D.seller] ? NP.SELLERS[D.seller].hi[Math.floor(r() * NP.SELLERS[D.seller].hi.length)] : '';
      b.open = function () { return boothPanel(b); };
      b.draw = function () { drawBooth(b); };
      for (var i = 0; i < b.fw; i++) setSolid(b.fx + i, b.fy - 1, b); // the people behind the counter
      W.booths.push(b);
      if (b.seller) W.tables.push(b);
      addObj(b);
    });
    // a few things that are not booths
    addObj({ kind: 'pillar', fx: 9, fy: 17, fw: 1, fh: 1, base: 18 * T, label: 'PILLAR', title: 'A pillar',
      open: function () { return flavor('A pillar covered in flyers. LOOKING FOR: SKY LLAMA CHROME CART. LOOKING FOR: A RIDE HOME. LOOKING FOR: MY SON, HE IS IN A KNIGHT COSTUME.'); },
      draw: function () { var X = 9 * T, Y = 17 * T; OB(X + 2, Y - 28, 12, 44, '#8a90a0'); for (var k = 0; k < 4; k++) R(X + 3 + (k % 2) * 5, Y - 24 + k * 9, 5, 6, [CREAM, GOLD, CYAN, '#ff77a8'][k]); } });
    addObj({ kind: 'pillar', fx: 20, fy: 17, fw: 1, fh: 1, base: 18 * T, label: 'PILLAR', title: 'A pillar',
      open: function () { return flavor('Another pillar. Somebody taped a sign to it: THE BATHROOM LINE IS ALSO THE AUTOGRAPH LINE. IT IS NOT.'); },
      draw: function () { var X = 20 * T, Y = 17 * T; OB(X + 2, Y - 28, 12, 44, '#8a90a0'); R(X + 4, Y - 18, 8, 7, CREAM); } });
    addObj({ kind: 'cosplay', fx: 26, fy: 17, fw: 2, fh: 1, base: 18 * T, label: 'PHOTO SPOT', title: 'The photo spot',
      open: function () { return flavor('A cardboard cutout of the Moon Ferret with the face cut out. A line of grown adults is waiting to put their face in it. You get in line. You do not remember deciding to.'); },
      draw: function () { var X = 26 * T, Y = 17 * T; OB(X + 2, Y - 30, 28, 40, '#c9d1dc'); R(X + 4, Y - 28, 24, 18, '#8a90a0'); OB(X + 12, Y - 24, 8, 8, INK); } });
    W.objs.push({ kind: 'gate', base: MH * T + 1, draw: drawGate });
    // Dex: here for the finale, browsing like everybody else (and he has heard about the prototype)
    var d = { look: NP.Char.normalize(DEX_LOOK), present: true, mode: 'wander', node: [1, 3, 6, 8][Math.floor(r() * 4)], x: 0, y: 0, path: [], wait: 1, paused: false, steals: 0, goal: null, dir: 'down', step: 0, anim: 0, browsing: true };
    var dp = nodePx(d.node); d.x = dp.x; d.y = dp.y;
    W.dex = d; W.dexPending = false;
    // Phone Guy Phil wanders, Brody films the autograph line, Slab Steve shows up at 4 PM
    var pn = [5, 6, 7, 8][Math.floor(r() * 4)], pp = nodePx(pn);
    W.npcs.push({ id: 'phil', look: NP.Char.normalize(PHIL_LOOK), node: pn, x: pp.x, y: pp.y, path: [], wait: 1, dir: 'down', step: 0, anim: 0, present: true, speed: 38 });
    var ag = boothByKey('autograph'), bq = nodePx(ag.node);
    if (!s.brodyUntil) s.brodyUntil = st.time + 30;
    ag.brodyUntil = s.brodyUntil;
    W.npcs.push({ id: 'brody', look: NP.Char.normalize(BRODY_LOOK), node: ag.node, x: bq.x, y: bq.y, path: [], wait: 0, dir: 'up', step: 0, anim: 0, present: st.time < s.brodyUntil, speed: 44, table: ag, filming: st.time < s.brodyUntil });
    var gp = nodePx(N_GATE);
    W.npcs.push({ id: 'steve', look: NP.Char.normalize(STEVE_LOOK), node: N_GATE, x: gp.x, y: gp.y + 10, path: [], wait: 0, dir: 'up', step: 0, anim: 0, present: !!s.steveDone, speed: 56, pending: !s.steveDone });
    // the nerds: each one wants one exclusive, and walks straight to it
    var wants = shuffle(r, s.items.filter(function (it) { return it.ex && it.booth !== 'autograph'; }));
    var who = shuffle(r, E().nerds);
    for (var i = 0; i < Math.min(10, wants.length); i++) {
      var tb = boothByKey(wants[i].booth);
      W.nerds.push({ look: NP.Char.normalize(NP.Char.random(r, { noBrand: true })), who: who[i % who.length], want: wants[i], booth: tb,
        node: N_GATE, x: gp.x, y: gp.y + 6, path: [], dir: 'up', step: 0, anim: 0, speed: 30 + Math.floor(r() * 12),
        spawnIn: 1.5 + i * 3.2 + r() * 1.5, state: s.nerdsDone ? 'done' : 'wait', present: false });
    }
    if (s.nerdsDone) W.nerds.forEach(function (n) { n.present = false; });
    W.passEl = true;
  }

  function stampBooth(b) {
    var s = W.stop;
    if (s.stamps[b.key]) return;
    s.stamps[b.key] = true;
    var n = Object.keys(s.stamps).length;
    G().track('expo_stamp_' + n);
    if (n === 2) W.ptoast = E().clues[0];
    if (n >= 3 && !s.grailOpen) {
      s.grailOpen = true;
      var gb = boothByKey(s.grailBooth);
      W.ptoast = E().clues[1].replace('{booth}', gb ? gb.title : 'a booth');
      G().track('expo_grail_revealed');
      if (G().sfx) G().sfx('sparkle');
    }
    updatePass();
  }
  function passHTML() {
    var s = W.stop, n = Object.keys(s.stamps || {}).length, h = '';
    for (var i = 0; i < 6; i++) h += '<span class="ps' + (i < n ? ' on' : '') + '"></span>';
    var g = s.items.filter(function (it) { return it.kind === 'grail'; })[0];
    var gb = boothByKey(s.grailBooth);
    var msg = g && g.state === 'sold' ? 'You got the prototype.' : g && g.state === 'gone' ? 'Dex got the prototype.' :
      s.grailOpen ? 'The prototype is at ' + (gb ? gb.title : 'a booth') + '. Dex heads for it at 4:45 PM.' : 'Open three booths and somebody will tell you where the prototype is.';
    return '<div class="expopass"><b>' + esc(E().passport) + '</b> <span class="ps-row" aria-label="' + n + ' of 6 stamps">' + h + '</span> ' + esc(msg) + '</div>';
  }
  function updatePass() { var el = document.querySelector('.expopass'); if (el) el.outerHTML = passHTML(); }

  function boothPanel(b) {
    var s = W.stop, st = S(), D = E().booths[b.key];
    stampBooth(b);
    if (b.key === 'autograph' && b.brodyUntil && st.time < b.brodyUntil) {
      if (!W.brodyHit) { W.brodyHit = true; if (G().rivalHit) G().rivalHit('brody'); }
      return { small: true, html: '<div class="bubble big">Brody from BrodyBox is filming the autograph line for his channel. "Can you get out of the line? You are in my shot."</div>' +
        '<div class="note">He wraps at ' + G().fmtTime(b.brodyUntil) + '. Come back then.</div>' };
    }
    var h = '<div class="note">' + esc(D.text) + '</div>';
    if (b.hello) h += '<div class="bubble big">' + esc(NP.SELLERS[b.seller].name) + ': "' + esc(b.hello) + '"</div>';
    if (b.key === 'grading') return { html: h + G().gradeHTML() };
    if (b.key === 'autograph') return { html: h + G().autographHTML(), after: function () { G().drawArts(); } };
    var items = boothItems(b.key);
    b.items = items;
    if (s.grailOpen && s.grailBooth === b.key) h += '<div class="toast">The prototype is here, under the table. The dealer has no idea what it is.</div>';
    h += '<div class="items">' + items.map(function (it) { return G().itemCard(it, s); }).join('') + '</div>';
    if (G().sellHTML && b.seller && NP.BUYERS[b.seller]) h += G().sellHTML(s, b.seller);
    return { html: h };
  }

  function nerdMove(n, dt) {
    var p = nodePx(n.path[0]);
    var dx = p.x - n.x, dy = p.y - n.y, sp = n.speed * dt;
    if (Math.abs(dx) > 0.5) { n.x += Math.sign(dx) * Math.min(sp, Math.abs(dx)); n.dir = dx < 0 ? 'left' : 'right'; }
    else if (Math.abs(dy) > 0.5) { n.x = p.x; n.y += Math.sign(dy) * Math.min(sp, Math.abs(dy)); n.dir = dy < 0 ? 'up' : 'down'; }
    else { n.x = p.x; n.y = p.y; n.node = n.path.shift(); n.step = 0; return; }
    n.anim += dt; n.step = [1, 0, 2, 0][Math.floor(n.anim / 0.15) % 4];
  }
  function updateExpo(dt) {
    var s = W.stop, st = S(), since = (performance.now() - W.enterAt) / 1000;
    var going = 0;
    W.nerds.forEach(function (n) {
      if (n.state === 'wait') {
        if (since >= n.spawnIn) { n.state = 'go'; n.present = true; n.path = bfs(N_GATE, n.booth.node); }
        else return;
      }
      if (n.state === 'go') going++;
      if (n.wait > 0) { n.wait -= dt; n.step = 0; return; }
      if (n.path.length) { nerdMove(n, dt); return; }
      if (n.state === 'go') {
        n.state = 'done'; n.dir = 'up'; n.wait = 1.5;
        var it = n.want;
        if (it.state === 'avail') {
          it.state = 'gone'; it.goneBy = 'nerd'; it.line = '';
          showToast(E().nerdGot.replace('{who}', n.who).replace('{t}', it.t));
          G().track('expo_nerd_got');
        } else if (it.state === 'sold') showToast(E().nerdMiss.replace('{who}', n.who));
        return;
      }
      // after: wander the hall
      if (Math.random() < 0.5) { n.wait = 1 + Math.random() * 3; return; }
      var nb = ADJ[n.node].filter(function (m) { return m !== N_GATE; });
      if (nb.length) n.path = [nb[Math.floor(Math.random() * nb.length)]];
    });
    if (!going && W.nerds.every(function (n) { return n.state === 'done'; })) s.nerdsDone = true;
    // Slab Steve, 4 PM, straight to the exclusives
    var steve = npcById('steve');
    if (steve && steve.pending && st.time >= 16 * 60) {
      steve.pending = false; steve.present = true; steve.goExclusive = true;
      steve.path = bfs(N_GATE, boothByKey('exclusive').node);
      showToast('Slab Steve just walked in. He is not looking at anything but the exclusives booth.');
    }
    if (steve && steve.goExclusive && !steve.path.length && steve.present) {
      steve.goExclusive = false; s.steveDone = true;
      var took = 0;
      s.items.forEach(function (it) { if (it.booth === 'exclusive' && it.state === 'avail' && it.cond === 'sealed') { it.state = 'gone'; it.goneBy = 'steve'; it.line = ''; took++; } });
      if (took) { showToast(E().steve); if (G().rivalHit) G().rivalHit('steve'); }
      else showToast('Slab Steve gets to the exclusives booth. Everything sealed is already gone. He stands there for a long time. Then he leaves.');
    }
    // Dex heads for the prototype at 4:45 PM, if nobody has it yet
    var d = W.dex, g = s.items.filter(function (it) { return it.kind === 'grail'; })[0];
    if (d && g && g.state === 'avail' && st.time >= 16 * 60 + 45 && d.mode !== 'grail' && !W.dexGrail) {
      W.dexGrail = true; d.mode = 'grail'; d.wait = 0; d.path = bfs(d.node, boothByKey(s.grailBooth).node);
      showToast('Dex is walking very fast toward ' + boothByKey(s.grailBooth).title + '.');
    }
  }
  function dexGrail() {
    var s = W.stop, g = s.items.filter(function (it) { return it.kind === 'grail'; })[0];
    if (!g || g.state !== 'avail') return;
    g.state = 'gone'; g.goneBy = 'dex'; g.line = '';
    S().ev.rivalHits++;
    showToast(E().dexGrail.replace('{booth}', boothByKey(s.grailBooth).title));
    G().track('expo_dex_grail');
    updatePass();
  }

  function drawBooth(b) {
    var X = b.fx * T, Y = b.fy * T, Wd = b.fw * T, c = b.cloth;
    // back wall panel and the sign
    R(X, Y - 34, Wd, 22, c[2]); R(X, Y - 34, Wd, 3, c[1]);
    sign(X + Wd / 2, Y - 46, b.label, b.key === 'exclusive' ? GOLD : CREAM, INK);
    if (b.vendor) sprite(b.vendor, 'down', 0, X + Wd / 2, Y + 2);
    // the counter
    OB(X, Y + 2, Wd, 14, c[0]); R(X, Y + 2, Wd, 2, c[1]);
    R(X - 1, Y + 16, Wd + 2, 8, INK); R(X, Y + 16, Wd, 7, c[2]);
    var its = boothItems(b.key).filter(avail);
    its.slice(0, Math.floor((Wd - 4) / 11)).forEach(function (it, k) { mini(it, X + 3 + k * 11, Y - 6); });
    if (b.key === 'grading') { R(X + Wd - 14, Y - 14, 2, 14, '#c8cbd6'); OB(X + Wd - 20, Y - 18, 12, 5, GOLD); }
    if (b.key === 'exclusive') { R(X - 6, Y + 26, Wd + 12, 2, '#a8202a'); R(X - 7, Y + 20, 2, 10, GOLD); R(X + Wd + 5, Y + 20, 2, 10, GOLD); }
    if (b.key === 'homebrew') { OB(X + Wd - 22, Y - 12, 16, 12, '#2a2f3a'); R(X + Wd - 20, Y - 10, 12, 8, CYAN); }
    var st = S();
    if (b.key === 'autograph' && b.brodyUntil && st.time < b.brodyUntil) sign(X + Wd / 2, Y + 26, 'FILMING', RED, CREAM);
    if (W.stop.grailOpen && W.stop.grailBooth === b.key) {
      var g = W.stop.items.filter(function (it) { return it.kind === 'grail'; })[0];
      if (g && g.state === 'avail') { var t = performance.now() / 1000; NP.drawSparkle(ctx, X + Wd - 6 - CX, Y - 2 - CY, 1, t); }
    }
    if (W.stop.stamps && W.stop.stamps[b.key]) { OB(X + 2, Y - 31, 7, 7, GOLD); R(X + 4, Y - 29, 3, 3, RED); }
  }
  function drawWant(n) {
    var it = n.want;
    // a little thought bubble with the thing they are after
    OB(n.x - 7, n.y - 41, 14, 14, CREAM);
    R(n.x - 1, n.y - 27, 2, 2, CREAM);
    if (it.state === 'avail') mini(it, n.x - 5, n.y - 40);
    else TXT('?', n.x - 2, n.y - 37, RED);
  }

  // ---------- product placement (that is definitely not product placement) ----------
  function pickCola() {
    var tb = W.tables.filter(function (t) { return t.seller === 'friendly'; })[0] || W.tables[0];
    if (tb) tb.cola = true;
  }
  // Dex's van: shows up when Dex does. Fully wrapped in Nostalgia Pro merch. He does not sell out.
  var VAN = { x: 22, y: 19, w: 5, h: 2 };
  function showVan() {
    if (W.van) return;
    var van = { kind: 'van', fx: VAN.x, fy: VAN.y, fw: VAN.w, fh: VAN.h, base: (VAN.y + VAN.h) * T, label: "DEX'S VAN", title: "Dex's van",
      open: function () {
        var lines = (NP.SPONSOR && NP.SPONSOR.vanLines) || ["I don't sell out."];
        var line = lines[(W.vanTalk = (W.vanTalk || 0) + 1) % lines.length];
        return flavor('A van wrapped bumper to bumper in Nostalgia Pro merch. ' + NP.RIVAL.name + ', from somewhere: "' + line + '"');
      },
      draw: drawVan };
    W.van = van;
    // only block the tiles if you are not standing on them right now
    var px = Math.floor(W.x / T), py = Math.floor((W.y - 3) / T);
    var onIt = px >= VAN.x && px < VAN.x + VAN.w && py >= VAN.y && py < VAN.y + VAN.h;
    if (onIt) W.objs.push(van); else addObj(van);
  }

  // ---------- Dex ----------
  function setupDex(r) {
    var s = W.stop, st = S();
    var d = { look: NP.Char.normalize(DEX_LOOK), present: true, mode: 'wander', node: 0, x: 0, y: 0, path: [], wait: 0, paused: false, steals: 0, goal: null, dir: 'down', step: 0, anim: 0 };
    W.dex = d;
    W.dexPending = false;
    if (s.cleared) {
      d.mode = 'wander';
    } else if (s.rivalAt && st.time < s.rivalAt) {
      d.present = false; W.dexPending = true;
    } else {
      d.mode = 'wander';
      d.browsing = true; // never shows up to raid this one. He is just here.
    }
    d.node = [1, 3, 5, 8, 10, 12][Math.floor(r() * 6)];
    var p = nodePx(d.node); d.x = p.x; d.y = p.y;
    if (d.present) showVan();
  }

  function startHunt() {
    var d = W.dex;
    W.dexPending = false;
    d.present = true; d.mode = 'hunt'; d.browsing = false;
    d.x = 14 * T + 8; d.y = MH * T + 6; d.node = N_GATE; d.path = [N_GATE]; d.goal = null;
    showVan();
    showToast(NP.RIVAL.name + "'s van just pulled into the lot. It is wrapped in Nostalgia Pro merch. He is heading for the tables.");
    G().sfx('dex'); G().track('dex_arrived');
    if (G().tip) G().tip('dex');
  }

  function bfs(from, to) {
    if (from === to) return [];
    var prev = {}, q = [from], seen = {}; seen[from] = true;
    while (q.length) {
      var n = q.shift();
      if (n === to) break;
      ADJ[n].forEach(function (m) { if (!seen[m]) { seen[m] = true; prev[m] = n; q.push(m); } });
    }
    if (!seen[to]) return [];
    var path = [], c = to;
    while (c !== from) { path.unshift(c); c = prev[c]; }
    return path;
  }

  function spotValue(sp) {
    var best = 0;
    sp.items().forEach(function (it) { if (stealable(it) && it.ask > best) best = it.ask; });
    return best;
  }
  function pickHuntTarget() {
    var best = null, bv = 0;
    W.spots.forEach(function (sp) { var v = spotValue(sp); if (v > bv) { bv = v; best = sp; } });
    return best ? best.node : null;
  }
  function stealAt(node) {
    var sp = W.spots.filter(function (x) { return x.node === node; })[0];
    if (!sp) return;
    var top = null;
    sp.items().forEach(function (it) { if (stealable(it) && (!top || it.ask > top.ask)) top = it; });
    if (!top) return;
    top.state = 'gone'; top.line = '';
    W.dex.steals++;
    if (!W.rivalCounted) { S().ev.rivalHits++; W.rivalCounted = true; }
    showToast(NP.RIVAL.name + ' grabbed ' + top.t + ' from ' + sp.name + '.');
  }
  function finishSetup() {
    if (!W.stop.rivalTable) {
      G().dexSetup(W.stop);
      showToast(NP.RIVAL.name + ' set up a Flipside Resale table by the fence. Everything on it is marked up.');
    }
  }

  function moveDex(dt) {
    var d = W.dex, tgt = d.path[0];
    var p = tgt === N_GATE && d.y > nodePx(N_GATE).y + 1 ? nodePx(N_GATE) : nodePx(tgt);
    var dx = p.x - d.x, dy = p.y - d.y, st = DEX_SPEED * (wxId() === 'rain' ? 0.65 : 1) * dt;
    if (Math.abs(dx) > 0.5) { d.x += Math.sign(dx) * Math.min(st, Math.abs(dx)); d.dir = dx < 0 ? 'left' : 'right'; }
    else if (Math.abs(dy) > 0.5) { d.x = p.x; d.y += Math.sign(dy) * Math.min(st, Math.abs(dy)); d.dir = dy < 0 ? 'up' : 'down'; }
    else { d.x = p.x; d.y = p.y; d.node = d.path.shift(); d.step = 0; return; }
    d.anim += dt; d.step = [1, 0, 2, 0][Math.floor(d.anim / 0.14) % 4];
  }

  function updateDex(dt) {
    var d = W.dex;
    if (!d) return;
    // Dex shows up when the clock reaches his time, or after 45 real seconds walking around, whichever is first
    if (W.dexPending) { if (S().time >= W.stop.rivalAt || performance.now() - W.enterAt > 45000) startHunt(); else return; }
    if (!d.present) return;
    if (d.wait > 0) { d.wait -= dt; d.step = 0; return; }
    if (d.path.length) { moveDex(dt); return; }
    if (d.mode === 'grail') { dexGrail(); d.mode = 'wander'; d.wait = 2; return; }
    if (d.mode === 'hunt') {
      if (d.goal != null && d.node === d.goal) { stealAt(d.goal); d.goal = null; d.wait = 1.1; d.dir = 'up'; return; }
      var t = d.steals < MAX_STEALS ? pickHuntTarget() : null;
      if (t == null) { d.mode = 'setup'; d.path = bfs(d.node, N_FLIP); return; }
      d.goal = t; d.path = bfs(d.node, t);
      return;
    }
    if (d.mode === 'setup') { d.dir = 'up'; finishSetup(); d.mode = 'wander'; d.wait = 2.5; return; }
    // wander the aisles
    if (!d.paused && Math.random() < 0.45) { d.paused = true; d.wait = 0.6 + Math.random() * 2.2; d.dir = Math.random() < 0.5 ? 'up' : d.dir; return; }
    d.paused = false;
    var nb = ADJ[d.node];
    d.path = [nb[Math.floor(Math.random() * nb.length)]];
  }

  // ---------- the other rivals who walk the swap meet: Phone Guy Phil and Brody ----------
  var PHIL_LOOK = { skin: 3, hair: 'short', hairCol: 1, shirt: 'stripe', hat: 'none', glasses: 'specs' };
  var BRODY_LOOK = { skin: 1, hair: 'spiky', hairCol: 3, shirt: 'red', hat: 'back', glasses: 'none' };
  function setupRivals(r) {
    W.npcs = [];
    var here = G().rivalsAt ? G().rivalsAt(W.stop) : [];
    if (here.indexOf('phil') >= 0) {
      var n = [7, 9, 11, 13][Math.floor(r() * 4)], p = nodePx(n);
      W.npcs.push({ id: 'phil', look: NP.Char.normalize(PHIL_LOOK), node: n, x: p.x, y: p.y, path: [], wait: 1, dir: 'down', step: 0, anim: 0, present: true, speed: 38 });
    }
    if (here.indexOf('brody') >= 0 && W.tables.length) {
      // Brody films at one table for 30 minutes of the clock, then wanders off
      var tb = W.tables[Math.floor(r() * W.tables.length)], q = nodePx(tb.node);
      tb.brodyUntil = S().time + 30;
      W.npcs.push({ id: 'brody', look: NP.Char.normalize(BRODY_LOOK), node: tb.node, x: q.x, y: q.y, path: [], wait: 0, dir: 'up', step: 0, anim: 0, present: true, speed: 44, table: tb, filming: true });
    }
  }
  function npcById(id) { return (W.npcs || []).filter(function (n) { return n.id === id; })[0]; }
  function moveNpc(n, dt) {
    var p = nodePx(n.path[0]);
    var dx = p.x - n.x, dy = p.y - n.y, st = n.speed * dt;
    if (Math.abs(dx) > 0.5) { n.x += Math.sign(dx) * Math.min(st, Math.abs(dx)); n.dir = dx < 0 ? 'left' : 'right'; }
    else if (Math.abs(dy) > 0.5) { n.x = p.x; n.y += Math.sign(dy) * Math.min(st, Math.abs(dy)); n.dir = dy < 0 ? 'up' : 'down'; }
    else { n.x = p.x; n.y = p.y; n.node = n.path.shift(); n.step = 0; return; }
    n.anim += dt; n.step = [1, 0, 2, 0][Math.floor(n.anim / 0.16) % 4];
  }
  function updateRivals(dt) {
    (W.npcs || []).forEach(function (n) {
      if (!n.present) return;
      if (n.filming) {
        n.dir = 'up'; n.step = 0;
        if (S().time >= n.table.brodyUntil) {
          n.filming = false; n.wait = 0.5;
          showToast(W.expo ? 'Brody wrapped his video. The autograph line is open.' : 'Brody wrapped his video. "Smash that subscribe button." Nobody does. The table is open.');
        }
        return;
      }
      if (n.wait > 0) { n.wait -= dt; n.step = 0; return; }
      if (n.path.length) { moveNpc(n, dt); return; }
      if (n.goExclusive) return;
      if (Math.random() < 0.4) { n.wait = 0.8 + Math.random() * 2.5; return; }
      var nb = ADJ[n.node].filter(function (m) { return m !== N_GATE; });
      if (nb.length) n.path = [nb[Math.floor(Math.random() * nb.length)]];
    });
  }
  // Phone Guy Phil: within two steps of you when you open a table, and that table goes up 25% (once per table)
  function philCheck(tb) {
    var n = npcById('phil');
    if (!n || !n.present || !tb || !tb.seller || tb.philed) return;
    if (Math.abs(n.x - W.x) > 2 * T + 4 || Math.abs(n.y - W.y) > 2 * T + 4) return;
    tb.philed = true;
    tb.items.forEach(function (it) { if (it.state === 'avail') it.ask = Math.max(1, Math.round(it.ask * 1.25)); });
    if (G().rivalHit) G().rivalHit('phil');
    var L = NP.RIVALS.phil.lines;
    W.ptoast = 'Phone Guy Phil, two steps behind you: "' + L[Math.floor(Math.random() * L.length)] + '" The vendor heard him. Everything on this table just went up 25%.';
  }
  function npcPanel(n) {
    var R = NP.RIVALS[n.id], L = R.lines;
    var line = n.filming ? "Can you walk around? You're in my shot." : L[(W.npcTalk = (W.npcTalk || 0) + 1) % L.length];
    return { small: true, html: '<div class="bubble big">' + esc(R.name) + ' (' + esc(R.tag) + '): "' + esc(line) + '"</div>' };
  }
  function npcObj(n) { return { title: NP.RIVALS[n.id].name, label: 'TALK TO ' + NP.RIVALS[n.id].name.toUpperCase(), open: function () { return npcPanel(n); } }; }
  function npcNear(px, py, rx, ry) {
    var hit = null;
    (W.npcs || []).forEach(function (n) { if (n.present && Math.abs(n.x - px) < rx && Math.abs(n.y - py) < ry) hit = n; });
    return hit;
  }

  // ---------- panels (the existing shop UI, opened in place) ----------
  function head(title) { return '<div class="wp-head">' + esc(title) + '</div>'; }
  function flavor(text) { return { small: true, html: '<div class="bubble big">' + esc(text) + '</div>' }; }

  function cratePanel(list) {
    var s = W.stop, sd = NP.SELLERS.crate;
    var music = list.filter(function (it) { return it.kind === 'music'; }), movies = list.filter(function (it) { return it.kind === 'movie'; });
    var h = '<div class="bubble big">' + esc(sd.name) + ': "' + esc(sd.hi[0]) + '"</div>';
    if (music.length) h += '<h3 class="sec-h">Records, tapes and CDs</h3><div class="items">' + music.map(function (it) { return G().itemCard(it, s); }).join('') + '</div>';
    if (movies.length) h += '<h3 class="sec-h">The movie rack</h3><div class="items">' + movies.map(function (it) { return G().itemCard(it, s); }).join('') + '</div>';
    h += '<div class="note">' + esc(NP.CRATE_FLAVOR) + '</div>';
    return { html: h };
  }
  function tablePanel(tb) {
    var s = W.stop, sd = NP.SELLERS[tb.seller], SP = NP.SPONSOR;
    if (tb.brodyUntil && S().time < tb.brodyUntil) {
      if (!W.brodyHit) { W.brodyHit = true; if (G().rivalHit) G().rivalHit('brody'); }
      return { small: true, html: '<div class="bubble big">Brody from BrodyBox is filming at this table. "Can you walk around? You\'re in my shot. This video is NOT sponsored."</div>' +
        '<div class="note">The table opens back up at ' + G().fmtTime(tb.brodyUntil) + '. Come back then, or shop somewhere else.</div>' };
    }
    var h = '<div class="bubble big">' + esc(sd.name) + ': "' + esc(tb.cola && SP ? SP.colaLine : tb.hello) + '"</div>';
    if (tb.cola && SP) h += '<div class="glam"><canvas class="glamcan" width="22" height="30" aria-label="A can of ' + esc(SP.name) + '"></canvas><div class="glam-t">' + esc(SP.colaAction) + '</div></div>';
    if (G().adLevel() >= 2) h += '<div class="poster">' + (G().adFree() ? 'TAPED TO THE TABLE: The Ad-Free Edition. No posters. (Except this one.)' : 'TAPED TO THE TABLE: Nostalgia Pro: The Shelf Dust. Now in Sealed. Booth open till ' + (G().endLabel ? G().endLabel() : '5:30 PM') + '.') + '</div>';
    h += '<div class="items">' + tb.items.map(function (it) { return G().itemCard(it, s); }).join('') + '</div>';
    // every game vendor here buys too (selling and trading in, from game.js)
    if (G().sellHTML) h += G().sellHTML(s, tb.seller);
    return { html: h, after: tb.cola ? drawGlamCan : null };
  }
  function drawGlamCan() {
    var c = document.querySelector('.wpanel .glamcan');
    if (!c) return;
    var g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 22, 30);
    NP.drawCan(g, 6, 8, 1, 1);
    NP.drawSparkle(g, 17, 6, 1, 0.3);
  }
  function lotPanel(bin) {
    if (!bin.lots.length) return flavor('Empty cardboard boxes. Somebody already bought the lots. The boxes are not for sale. You asked.');
    var feat = bin.lots.some(function (l) { return l.featured; });
    return { html: '<div class="bubble big">Sealed with packing tape. A marker on the side says "GAMES AND STUFF." That could mean anything.' +
      (feat ? ' The one with the gold sticker is today\'s featured lot. Everybody in town is looking at that exact box.' : '') + '</div><div class="items">' +
      bin.lots.map(function (l) { return G().itemCard(l, W.stop); }).join('') + '</div>' };
  }
  function digPanel() {
    var s = W.stop;
    if (!s.dig.length) return flavor('A blue tarp with nothing on it. Someone dug here before you.');
    if (!s.dug) {
      return { html: '<div class="bubble big">A blue tarp piled with boxes of loose stuff. No prices. No order. Bring gloves.</div>' +
        '<div class="btns"><button class="big" data-act="dig">Dig through the pile (15 min)</button></div>' };
    }
    return { html: '<div class="bubble big">Here is what came out of the pile.</div><div class="items">' + s.dig.map(function (it) { return G().itemCard(it, s); }).join('') + '</div>' };
  }
  function giftPanel() {
    return { html: G().giftHTML(true), after: function () { G().drawGiftArts(); } };
  }
  function flipPanel() {
    var s = W.stop;
    if (!s.rivalTable || !s.rivalTable.length) {
      return flavor('A folding table with a card on it: "RESERVED FOR FLIPSIDE RESALE. DO NOT TOUCH. I WILL KNOW." It is signed "Dex."');
    }
    return { html: '<div class="bubble big">Hand-written sign: "Flipped merch. Market rate. No haggling. Some haggling."</div><div class="items">' +
      s.rivalTable.map(function (it) { return G().itemCard(it, s); }).join('') + '</div>' };
  }
  function exitPanel() {
    var lb = G().leaveButtons ? G().leaveButtons() : '<button class="big" data-act="leave">Back in the car</button>';
    return { small: true, html: '<div class="bubble big">' + (W.expo ? 'Leave the Expo? Once you walk out, the Expo is over for the year.' : 'Head back to the car? Once you leave, the swap meet is done for today.') + '</div>' +
      '<div class="btns exitbtns">' + lb + '<button data-w="close">Keep shopping</button></div>' };
  }
  function dexPanel() {
    var d = W.dex, s = W.stop;
    var pool = (s.rivalTable && s.rivalTable.length) ? DEX_DONE : DEX_LINES;
    var line = pool[(W.dexTalk = (W.dexTalk || 0) + 1) % pool.length];
    if (d.mode === 'hunt') line = 'Cannot talk. Busy. The early bird gets the cartridge.';
    return { small: true, html: '<div class="bubble big">' + esc(NP.RIVAL.name) + ' (' + esc(NP.RIVAL.shop) + '): "' + esc(line) + '"</div>' };
  }

  var EXIT_OBJ = { title: 'Parking lot', open: exitPanel };
  var DEX_OBJ = { title: 'Dex', label: 'TALK TO DEX', open: dexPanel };

  function panelEl() { return document.querySelector('.wpanel'); }

  function openPanel(o) {
    if (o && (o.kind === 'table' || o.kind === 'booth')) philCheck(o);
    W.panel = o; keys = {}; touchVec.x = touchVec.y = 0;
    if (o && o.open && G().wantTable) G().wantTable(o);
    if (o && o.cola) G().sfx('sparkle');
    var el = panelEl();
    if (!el) return;
    el.hidden = false;
    panelRender();
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    el.scrollTop = 0;
  }
  function closePanel() {
    if (!W) return;
    W.panel = null;
    var el = panelEl();
    if (el) { el.hidden = true; el.innerHTML = ''; }
    var cv = document.getElementById('walkcv');
    if (cv) { try { cv.focus({ preventScroll: true }); } catch (e) { cv.focus(); } }
  }
  function panelRender() {
    var el = panelEl();
    if (!el || !W.panel) return;
    var st = S(), spec = W.panel.open();
    var keep = el.scrollTop;
    var h = '<div class="wp-top"><span class="wp-title">' + esc(W.panel.title || '') + '</span>' +
      '<span class="wp-stat">' + G().fmtTime(Math.min(st.time, G().endT ? G().endT() : G().END)) + ' &middot; ' + G().money(st.cash) + (G().creditHere && G().creditHere() ? ' + ' + G().money(G().creditHere()) + ' credit' : '') + ' &middot; Bag ' + st.bag.length + '</span>' +
      '<button data-w="close" class="wp-x">Walk away</button></div>';
    if (W.ptoast) { h += '<div class="toast">' + esc(W.ptoast) + '</div>'; W.ptoast = ''; }
    h += spec.html;
    el.className = 'wpanel' + (spec.small ? ' small' : '');
    el.innerHTML = h;
    G().drawArts();
    if (spec.after) spec.after();
    el.scrollTop = keep;
  }

  function showToast(t) {
    if (!t) return;
    if (W && W.panel) { W.ptoast = t; return; }
    W.toast = t; W.toastT = 4.5;
    var el = document.querySelector('.wtoast');
    if (el) { el.textContent = t; el.hidden = false; }
  }

  // ---------- movement ----------
  function blocked(px, py) {
    var x0 = Math.floor((px - 5) / T), x1 = Math.floor((px + 4.99) / T);
    var y0 = Math.floor((py - 6) / T), y1 = Math.floor((py - 0.01) / T);
    for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) {
      if (tx < 0 || tx >= MW || ty < 0 || ty >= MH + 1) return true;
      if (ty >= MH) { if (tx < GATE_X0 || tx > GATE_X1) return true; continue; }
      if (W.solid[ty * MW + tx]) return true;
    }
    return false;
  }
  function moveAxis(dx, dy) {
    var dist = Math.abs(dx || dy), sgn = Math.sign(dx || dy), moved = 0;
    while (dist > 0) {
      var st = Math.min(1, dist);
      var nx = W.x + (dx ? sgn * st : 0), ny = W.y + (dy ? sgn * st : 0);
      if (blocked(nx, ny)) break;
      W.x = nx; W.y = ny; moved += st; dist -= st;
    }
    return moved;
  }

  function update(dt) {
    var st = S();
    var ix = 0, iy = 0;
    if (keys.left) ix -= 1; if (keys.right) ix += 1; if (keys.up) iy -= 1; if (keys.down) iy += 1;
    if (touchVec.x || touchVec.y) { ix = touchVec.x; iy = touchVec.y; }
    var moving = !!(ix || iy), moved = 0;
    if (moving) {
      cancelTap();
      if (!W.usedPad && (touchVec.x || touchVec.y)) { W.usedPad = true; if (G().step) G().step('walk_input_pad'); }
      if (!W.usedKeys && !(touchVec.x || touchVec.y)) { W.usedKeys = true; if (G().step) G().step('walk_input_keys'); }
    }
    if (!moving && W.path && W.path.length) {
      moved += followPath(dt);
      if (W.panel) return true; // you got there and it opened
    } else if (moving) {
      var len = Math.sqrt(ix * ix + iy * iy); ix /= len; iy /= len;
      if (Math.abs(ix) > Math.abs(iy) + 0.01) W.dir = ix < 0 ? 'left' : 'right';
      else if (Math.abs(iy) > Math.abs(ix) + 0.01) W.dir = iy < 0 ? 'up' : 'down';
      else if (!((W.dir === 'left' && ix < 0) || (W.dir === 'right' && ix > 0) || (W.dir === 'up' && iy < 0) || (W.dir === 'down' && iy > 0))) W.dir = iy < 0 ? 'up' : 'down';
      var sp = SPEED * boost() * dt;
      moved += moveAxis(ix * sp, 0);
      moved += moveAxis(0, iy * sp);
    }
    if (moved > 0) {
      W.anim += dt; W.step = [1, 0, 2, 0][Math.floor(W.anim / 0.12) % 4];
      if (W.step !== W.lastStep && W.step) G().sfx('step');
      W.lastStep = W.step;
      W.dist += moved;
      var ticked = false;
      while (W.dist >= PX_PER_MIN) { W.dist -= PX_PER_MIN; G().spend(1); ticked = true; }
      if (ticked) {
        G().updateHud();
        if (G().checkSundown()) return false;
      }
    } else { W.anim = 0; W.step = 0; }

    // walked into the gate
    if (W.y > MH * T - 3) { W.y = MH * T - 4; W.dir = 'up'; openPanel(EXIT_OBJ); return true; }

    updateDex(dt);
    updateRivals(dt);
    if (W.expo) updateExpo(dt);
    if (W.toastT > 0) {
      W.toastT -= dt;
      if (W.toastT <= 0) { var te = document.querySelector('.wtoast'); if (te) te.hidden = true; }
    }
    if (W.hint > 0 && moved > 0) W.hint -= dt;
    return true;
  }

  // ---------- what's in front of you ----------
  var DV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  function objAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return null;
    var o = W.occ[ty * MW + tx];
    return o && o.open ? o : null;
  }
  function findTarget() {
    var fx = W.x, fy = W.y - 3, d = DV[W.dir];
    var dx = W.dex;
    if (dx && dx.present && Math.abs(dx.x - W.x) < 18 && Math.abs(dx.y - W.y) < 14) return DEX_OBJ;
    var nn = npcNear(W.x, W.y, 18, 14);
    if (nn) return npcObj(nn);
    var o = objAt(Math.floor((fx + d[0] * 10) / T), Math.floor((fy + d[1] * 10) / T));
    if (o) return o;
    var tx = Math.floor(fx / T), ty = Math.floor(fy / T);
    var near = [[0, -1], [-1, 0], [1, 0], [0, 1]];
    for (var i = 0; i < near.length; i++) { o = objAt(tx + near[i][0], ty + near[i][1]); if (o) return o; }
    if (W.y > (MH - 1) * T - 2 && W.x >= GATE_X0 * T && W.x <= (GATE_X1 + 1) * T) return { title: 'Parking lot', label: W.expo ? 'LEAVE THE EXPO' : 'LEAVE THE SWAP MEET', open: exitPanel };
    return null;
  }
  function interact() {
    if (!W || W.panel) return;
    var t = findTarget();
    if (t) openPanel(t);
  }

  // ---------- tap to walk ----------
  // Tap (or click) anywhere: you walk there. Tap a table, a box or a booth: you walk up to it and it opens.
  // Tap the gate: you walk out to it. The d-pad and the keys still work, and using them cancels the walk.
  // Paths go tile by tile (no diagonals) through open ground, found with a plain breadth-first search.
  function walkable(tx, ty) { return tx >= 0 && ty >= 0 && tx < MW && ty < MH && !W.solid[ty * MW + tx]; }
  function myTile() { return { x: Math.floor(W.x / T), y: Math.floor((W.y - 3) / T) }; }
  function tileFeet(tx, ty) { return { x: tx * T + 8, y: ty * T + 11 }; }
  function gridBFS(sx, sy) {
    var dist = new Int16Array(MW * MH), prev = new Int32Array(MW * MH), q = [sy * MW + sx], h = 0;
    for (var i = 0; i < dist.length; i++) { dist[i] = -1; prev[i] = -1; }
    dist[sy * MW + sx] = 0;
    while (h < q.length) {
      var c = q[h++], cx = c % MW, cy = (c - cx) / MW;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = cx + d[0], ny = cy + d[1];
        if (!walkable(nx, ny)) return;
        var n = ny * MW + nx;
        if (dist[n] >= 0) return;
        dist[n] = dist[c] + 1; prev[n] = c; q.push(n);
      });
    }
    return { dist: dist, prev: prev };
  }
  function pathTo(g, tx, ty) {
    var out = [], c = ty * MW + tx;
    if (g.dist[c] < 0) return null;
    while (c >= 0 && g.dist[c] > 0) { var x = c % MW; out.unshift(tileFeet(x, (c - x) / MW)); c = g.prev[c]; }
    return out;
  }
  // which thing did the tap land on? Signs and vendors stand above a table, so the tap area reaches two tiles up.
  function objAtPoint(px, py) {
    var best = null;
    W.objs.forEach(function (o) {
      if (o.fx == null || !o.open) return;
      var x0 = o.fx * T, x1 = (o.fx + o.fw) * T, y0 = (o.fy - 2) * T, y1 = (o.fy + o.fh) * T;
      if (px >= x0 && px < x1 && py >= y0 && py < y1 && (!best || o.base > best.base)) best = o;
    });
    return best;
  }
  function tapTo(px, py) {
    if (!W || W.panel || (G().tipOpen && G().tipOpen())) return;
    var me = myTile(), g = gridBFS(me.x, me.y);
    var goal = null, dest = null, face = null;
    var d = W.dex;
    var o = objAtPoint(px, py);
    var tn = npcNear(px, py + 12, 10, 15);
    if (d && d.present && Math.abs(d.x - px) < 10 && py > d.y - 26 && py < d.y + 3) {
      goal = 'dex'; dest = { x: Math.floor(d.x / T), y: Math.floor((d.y - 3) / T) };
      if (!walkable(dest.x, dest.y) || g.dist[dest.y * MW + dest.x] < 0) dest = null;
    } else if (tn) {
      goal = { npc: tn }; dest = { x: Math.floor(tn.x / T), y: Math.floor((tn.y - 3) / T) };
      if (!walkable(dest.x, dest.y) || g.dist[dest.y * MW + dest.x] < 0) dest = null;
    } else if (o) {
      // the open tile next to it that is quickest to reach, and which way to face once you get there
      var bestD = 1e9;
      for (var j = o.fy - 1; j <= o.fy + o.fh; j++) for (var i = o.fx - 1; i <= o.fx + o.fw; i++) {
        var inX = i >= o.fx && i < o.fx + o.fw, inY = j >= o.fy && j < o.fy + o.fh;
        if (inX === inY) continue; // inside it, or a corner
        if (!walkable(i, j)) continue;
        var dd = g.dist[j * MW + i];
        if (dd < 0) continue;
        if (j === o.fy + o.fh) dd -= 0.5; // a little preference for standing in front of it
        if (dd < bestD) { bestD = dd; dest = { x: i, y: j }; face = !inY ? (j < o.fy ? 'down' : 'up') : (i < o.fx ? 'right' : 'left'); }
      }
      goal = o;
    } else {
      var tx = Math.floor(px / T), ty = Math.floor((py + 3) / T);
      if (ty >= MH - 1) {
        // the gate (or near it): walk out
        if (tx >= GATE_X0 - 1 && tx <= GATE_X1 + 1) { goal = 'exit'; dest = { x: Math.max(GATE_X0, Math.min(GATE_X1, tx)), y: MH - 1 }; }
      } else if (walkable(tx, ty) && g.dist[ty * MW + tx] >= 0) dest = { x: tx, y: ty };
      else {
        // tapped a fence or a cactus: the nearest open tile you can reach
        var bd = 1e9;
        for (var y = ty - 2; y <= ty + 2; y++) for (var x = tx - 2; x <= tx + 2; x++) {
          if (!walkable(x, y) || g.dist[y * MW + x] < 0) continue;
          var e = (x - tx) * (x - tx) + (y - ty) * (y - ty);
          if (e < bd) { bd = e; dest = { x: x, y: y }; }
        }
      }
    }
    if (!dest) return;
    var p = pathTo(g, dest.x, dest.y);
    if (!p) return;
    // already standing there: just do it
    W.path = p; W.goal = goal; W.face = face; W.stuck = 0;
    W.marker = { x: dest.x * T + 8, y: dest.y * T + 10, t: performance.now() };
    if (!W.usedTap) { W.usedTap = true; if (G().step) G().step('walk_input_tap'); }
    if (!p.length) arrived();
  }
  function arrived() {
    var goal = W.goal, face = W.face;
    W.path = []; W.goal = null; W.face = null; W.marker = null;
    if (face) W.dir = face;
    if (goal === 'exit') { W.dir = 'down'; openPanel(EXIT_OBJ); return; }
    if (goal === 'dex') { var d = W.dex; if (d && d.present && Math.abs(d.x - W.x) < 26 && Math.abs(d.y - W.y) < 22) openPanel(DEX_OBJ); return; }
    if (goal && goal.npc) { var nn = goal.npc; if (nn.present && Math.abs(nn.x - W.x) < 30 && Math.abs(nn.y - W.y) < 24) openPanel(npcObj(nn)); return; }
    if (goal && goal.open) openPanel(goal);
  }
  function cancelTap() { if (W && W.path && W.path.length) { W.path = []; W.goal = null; W.marker = null; } }
  // one frame of following the path. Returns how far you moved.
  function followPath(dt) {
    var wp = W.path[0], dx = wp.x - W.x, dy = wp.y - W.y, st = SPEED * boost() * dt, moved = 0;
    if (Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5) {
      W.path.shift();
      if (!W.path.length) arrived();
      return 0;
    }
    if (Math.abs(dx) > 0.5) { W.dir = dx < 0 ? 'left' : 'right'; moved = moveAxis(Math.sign(dx) * Math.min(st, Math.abs(dx)), 0); }
    else { W.dir = dy < 0 ? 'up' : 'down'; moved = moveAxis(0, Math.sign(dy) * Math.min(st, Math.abs(dy))); }
    // something walked in the way (the van, usually): stop rather than push into it forever
    if (moved < 0.01) { W.stuck += dt; if (W.stuck > 0.35) cancelTap(); } else W.stuck = 0;
    return moved;
  }
  function bindTap(cv) {
    cv.addEventListener('pointerdown', function (e) {
      if (!active() || W.panel) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var r = cv.getBoundingClientRect(), w = cv.clientWidth || r.width, h = cv.clientHeight || r.height;
      var px = (e.clientX - r.left - (cv.clientLeft || 0)) / w * VW + CX;
      var py = (e.clientY - r.top - (cv.clientTop || 0)) / h * VH + CY;
      e.preventDefault();
      try { cv.focus({ preventScroll: true }); } catch (x) {}
      tapTo(px, py);
    });
  }

  // ---------- drawing ----------
  function buildFloor() {
    var c = document.createElement('canvas');
    c.width = MW * T; c.height = MH * T;
    var g = c.getContext('2d');
    var r = mulberry32(NP.hashStr('floor|' + S().seed));
    if (W.expo) return expoFloor(c, g, r);
    for (var ty = 0; ty < MH; ty++) for (var tx = 0; tx < MW; tx++) {
      var X = tx * T, Y = ty * T;
      g.fillStyle = (tx + ty * 3) % 7 === 0 ? '#c39a63' : '#c9a06a';
      g.fillRect(X, Y, T, T);
      for (var k = 0; k < 4; k++) {
        g.fillStyle = r() < 0.5 ? '#b38a55' : '#d8b57f';
        g.fillRect(X + Math.floor(r() * T), Y + Math.floor(r() * T), 1, 1);
      }
      if (r() < 0.06) { g.fillStyle = '#9c7b4c'; g.fillRect(X + 4 + Math.floor(r() * 8), Y + 5 + Math.floor(r() * 6), 2, 1); }
    }
    // tire tracks from the gate up the middle aisle
    g.fillStyle = 'rgba(120,90,55,.25)';
    for (var yy = 7 * T; yy < MH * T; yy += 3) { g.fillRect(14 * T + 3, yy, 2, 2); g.fillRect(14 * T + 11, yy + 1, 2, 2); }
    // fence
    function fence(tx, ty) {
      var X = tx * T, Y = ty * T;
      g.fillStyle = '#2b3048'; g.fillRect(X, Y, T, T);
      g.fillStyle = '#8a90a0';
      for (var j = 0; j < T; j++) for (var i = 0; i < T; i++) if ((i + j) % 4 === 0 || (i - j + 64) % 4 === 0) g.fillRect(X + i, Y + j, 1, 1);
      if (tx % 4 === 0 || ty % 4 === 0) { g.fillStyle = '#5d6370'; g.fillRect(X + 6, Y, 3, T); }
    }
    for (var x = 0; x < MW; x++) { fence(x, 0); if (x < GATE_X0 || x > GATE_X1) fence(x, MH - 1); }
    for (var y = 1; y < MH - 1; y++) { fence(0, y); fence(MW - 1, y); }
    // puddles on a rain day
    if (wxId() === 'rain') {
      [[5, 7], [12, 13], [19, 8], [8, 18], [21, 18], [25, 14], [15, 3]].forEach(function (p) {
        g.fillStyle = '#5d7790'; g.fillRect(p[0] * T + 2, p[1] * T + 5, 22, 7); g.fillRect(p[0] * T + 5, p[1] * T + 3, 14, 11);
        g.fillStyle = '#8fb0c8'; g.fillRect(p[0] * T + 7, p[1] * T + 6, 6, 1);
      });
    }
    // gate asphalt
    g.fillStyle = '#4a4d57'; g.fillRect(GATE_X0 * T, (MH - 1) * T, (GATE_X1 - GATE_X0 + 1) * T, T);
    g.fillStyle = GOLD; for (var gx = GATE_X0 * T + 4; gx < (GATE_X1 + 1) * T; gx += 10) g.fillRect(gx, (MH - 1) * T + 7, 5, 2);
    return c;
  }

  // the convention hall: loud carpet, walls, a loading dock door at the bottom
  function expoFloor(c, g, r) {
    var cols = ['#2b2f6b', '#30357a'], dots = ['#e4343e', '#29d3e8', '#ffcc33', '#7e57c2'];
    for (var ty = 0; ty < MH; ty++) for (var tx = 0; tx < MW; tx++) {
      var X = tx * T, Y = ty * T;
      g.fillStyle = cols[(tx + ty) % 2]; g.fillRect(X, Y, T, T);
      g.fillStyle = dots[(tx * 3 + ty * 5) % 4]; g.fillRect(X + ((tx * 7) % 12) + 1, Y + ((ty * 5) % 12) + 1, 2, 2);
      if (r() < 0.3) { g.fillStyle = dots[Math.floor(r() * 4)]; g.fillRect(X + Math.floor(r() * 14), Y + Math.floor(r() * 14), 3, 1); }
    }
    function wall(tx, ty) { var X = tx * T, Y = ty * T; g.fillStyle = '#4a4f5c'; g.fillRect(X, Y, T, T); g.fillStyle = '#5d6370'; g.fillRect(X, Y, T, 3); }
    for (var x = 0; x < MW; x++) { wall(x, 0); if (x < GATE_X0 || x > GATE_X1) wall(x, MH - 1); }
    for (var y = 1; y < MH - 1; y++) { wall(0, y); wall(MW - 1, y); }
    g.fillStyle = '#8a90a0'; g.fillRect(GATE_X0 * T, (MH - 1) * T, (GATE_X1 - GATE_X0 + 1) * T, T);
    g.fillStyle = CREAM; for (var gx = GATE_X0 * T + 4; gx < (GATE_X1 + 1) * T; gx += 10) g.fillRect(gx, (MH - 1) * T + 7, 5, 2);
    return c;
  }
  function banner() {
    var af = G().adFree();
    var key = (W && W.expo ? 'x' : '') + af;
    if (bannerCache[key]) return bannerCache[key];
    var a = W && W.expo ? 'DESERT PIXEL EXPO!  ' : 'SAGUARO SWAP MEET!  ', b = W && W.expo ? 'CONVENTION HALL B · NO REFUNDS' : af ? 'AN AD-FREE ZONE (SPONSORED)' : 'SPONSORED BY NOSTALGIA PRO';
    var w = NP.textWidth(a + b, 1) + 16;
    var c = document.createElement('canvas'); c.width = w; c.height = 14;
    var g = c.getContext('2d');
    g.fillStyle = INK; g.fillRect(0, 0, w, 14);
    g.fillStyle = RED; g.fillRect(1, 1, w - 2, 12);
    g.fillStyle = CYAN; g.fillRect(1, 11, w - 2, 1);
    NP.pixelText(g, a, 8, 3, 1, CREAM);
    NP.pixelText(g, b, 8 + a.length * 6, 3, 1, GOLD);
    bannerCache[key] = c;
    return c;
  }

  var BANNERS = { friendly: ['MAKE AN OFFER', '#fff1d6', '#3a7d44'], firm: ['PRICE IS FIRM', '#fff1d6', '#e4343e'], ikwig: ['I KNOW WHAT I GOT', '#fff1d6', '#7a3d8f'] };
  function drawTable(tb) {
    var X = tb.fx * T, Y = tb.fy * T;
    var bn = tb.flavorSign ? [tb.flavorSign, CREAM, INK] : BANNERS[tb.seller];
    if (bn) {
      var bw = Math.max(48, NP.textWidth(bn[0], 1) + 8);
      R(X + 1, Y - 30, 2, 24, '#5d6370'); R(X + 45, Y - 30, 2, 24, '#5d6370');
      OB(X + 24 - bw / 2, Y - 40, bw, 11, bn[1]);
      TXT(bn[0], X + 24, Y - 38, bn[2], 'center');
    }
    if (tb.vendor) sprite(tb.vendor, 'down', 0, X + 24, Y - 2);
    R(X + 3, Y + 6, 2, 9, '#3a3a44'); R(X + 43, Y + 6, 2, 9, '#3a3a44');
    OB(X, Y - 7, 48, 13, tb.cloth[0]);
    R(X, Y - 7, 48, 2, tb.cloth[1]);
    R(X - 1, Y + 6, 50, 6, INK); R(X, Y + 6, 48, 5, tb.cloth[2]);
    for (var i = 0; i < 12; i++) R(X + 1 + i * 4, Y + 10, 2, 1, tb.cloth[0]);
    var av = tb.items.filter(avail);
    av.slice(0, 4).forEach(function (it, k) { mini(it, X + 2 + k * 11, Y - 13); });
    if (tb.junk) tb.junk.forEach(function (j) { R(X + j[0], Y - 5 + j[1], j[2], j[3], j[4]); });
    if (!tb.seller && !tb.flavorSign) sign(X + 24, Y - 6, 'BACK IN 5', CREAM, INK);
    else if (tb.seller && !av.length && tb.items.length) sign(X + 24, Y - 6, 'SOLD OUT', CREAM, INK);
    if (tb.cola && tb.vendor) {
      // a slow turn toward the camera, a hold, then back around
      var t = performance.now() / 1000 + tb.fx, cyc = t % 6;
      var phase = cyc < 3.5 ? cyc / 3.5 : 1;
      R(X + 22, Y - 16, 4, 1, '#ffffff'); R(X + 21, Y - 17, 1, 1, INK); R(X + 26, Y - 17, 1, 1, INK);
      NP.drawCan(ctx, X + 31 - CX, Y - 26 - CY, 1, phase);
      if (phase >= 1) NP.drawSparkle(ctx, X + 40 - CX, Y - 27 - CY, 1, t);
    }
  }

  function drawVan() {
    var X = VAN.x * T, Y = VAN.y * T, W2 = VAN.w * T;
    OB(X, Y - 14, W2, 38, NAVY);
    R(X, Y - 14, W2, 5, '#22335f');
    OB(X + W2 - 15, Y - 10, 12, 9, '#9fd8e8'); R(X + W2 - 14, Y - 9, 3, 7, '#d8f4fb');
    var grid = [[1, 0, 1], [0, 1, 1]];
    for (var r = 0; r < 2; r++) for (var c = 0; c < 3; c++) R(X + 5 + c * 4, Y - 9 + r * 4, 3, 3, grid[r][c] ? CREAM : RED);
    TXT('NOSTALGIA PRO', X + W2 / 2, Y + 1, CREAM, 'center');
    R(X, Y + 10, W2, 3, RED); R(X, Y + 14, W2, 2, CYAN);
    // the Flipside Resale sticker, mostly covered by a bigger merch sticker
    R(X + 30, Y + 17, 18, 4, '#ff9e57'); OB(X + 37, Y + 16, 14, 6, CREAM); TXT('NP', X + 44, Y + 16, RED, 'center');
    OB(X + 9, Y + 21, 11, 8, '#14141a'); R(X + 13, Y + 24, 3, 2, '#8a90a0');
    OB(X + W2 - 20, Y + 21, 11, 8, '#14141a'); R(X + W2 - 16, Y + 24, 3, 2, '#8a90a0');
  }

  function drawLotBin(bin) {
    var X = bin.fx * T, Y = bin.fy * T;
    var has = bin.lots.some(avail);
    var feat = bin.lots.some(function (l) { return l.featured && avail(l); });
    OB(X + 2, Y + 10, 28, 20, '#a87443'); R(X + 2, Y + 10, 28, 3, '#8a5e36'); R(X + 14, Y + 10, 4, 20, '#d8b07a');
    if (has) {
      OB(X + 6, Y - 2, 20, 12, '#b5824e'); R(X + 14, Y - 2, 4, 12, '#d8b07a');
      TXT('?', X + 9, Y + 18, CREAM); TXT('?', X + 22, Y + 20, CREAM);
    }
    if (feat) { OB(X + 20, Y + 1, 7, 7, GOLD); R(X + 22, Y + 3, 3, 3, RED); }
    sign(X + 16, Y - 16, feat ? 'FEATURED' : has ? 'MYSTERY' : 'SOLD OUT', feat ? GOLD : CREAM, INK);
  }

  function drawDig() {
    var X = 16 * T, Y = 10 * T, s = W.stop;
    OB(X, Y + 12, 48, 18, '#2f6fb3');
    R(X + 6, Y + 18, 14, 1, '#25599a'); R(X + 26, Y + 24, 16, 1, '#25599a');
    if (!s.dug) {
      OB(X + 4, Y + 2, 16, 12, '#a87443'); OB(X + 22, Y - 2, 14, 16, '#9a6a3b'); OB(X + 34, Y + 6, 12, 10, '#b5824e');
      R(X + 6, Y + 2, 3, 4, '#9aa0ad'); R(X + 10, Y + 1, 3, 5, NAVY); R(X + 25, Y - 4, 4, 5, '#c9d1dc'); R(X + 37, Y + 4, 3, 4, RED);
    } else {
      OB(X + 6, Y + 8, 14, 6, '#a87443'); OB(X + 26, Y + 6, 16, 8, '#9a6a3b');
      s.dig.filter(avail).slice(0, 3).forEach(function (it, k) { mini(it, X + 6 + k * 13, Y + 14); });
    }
    sign(X + 24, Y - 18, s.dug ? 'DUG' : 'DIG PILE', CREAM, INK);
  }

  var CLERK = null;
  function drawGift() {
    var X = 22 * T, Y = 2 * T;
    if (!CLERK) CLERK = NP.Char.normalize(CLERK_LOOK);
    R(X + 2, Y + 2, 76, 40, '#22335f');
    for (var i = 0; i < 6; i++) { mini({ kind: 'merch' }, X + 6 + i * 12, Y + 8); mini({ kind: 'merch' }, X + 6 + i * 12, Y + 22); }
    sprite(CLERK, 'down', 0, X + 40, Y + 50);
    OB(X + 4, Y + 38, 72, 22, CREAM);
    R(X + 4, Y + 38, 72, 4, RED); R(X + 4, Y + 42, 72, 1, CYAN);
    TXT('NO REFUNDS', X + 40, Y + 48, NAVY, 'center');
    R(X, Y - 6, 3, 66, '#c8cbd6'); R(X + 77, Y - 6, 3, 66, '#c8cbd6');
    R(X - 5, Y - 15, 90, 1, INK);
    for (var k = 0; k < 11; k++) {
      var col = k % 2 ? CREAM : RED;
      R(X - 4 + k * 8, Y - 14, 8, 16, col);
      R(X - 2 + k * 8, Y + 2, 4, 2, col);
    }
    sign(X + 40, Y - 13, 'GIFT SHOP', GOLD, INK);
    var lvl = G().adLevel();
    if (lvl >= 2) sign(X + 40, Y + 64, G().adFree() ? 'AD-FREE PRICES' : 'PRICES UP TODAY', GOLD, RED);
  }

  function drawFlip() {
    var X = 3 * T, Y = 17 * T, s = W.stop;
    R(X + 3, Y + 6, 2, 9, '#3a3a44'); R(X + 43, Y + 6, 2, 9, '#3a3a44');
    OB(X, Y - 7, 48, 13, '#9aa0ad'); R(X, Y - 7, 48, 2, '#b8bdc8');
    R(X - 1, Y + 6, 50, 3, INK); R(X, Y + 6, 48, 2, '#6d7383');
    var items = (s.rivalTable || []).filter(avail);
    if (items.length) items.forEach(function (it, k) { mini(it, X + 6 + k * 14, Y - 13); });
    else if (!s.rivalTable) { R(X + 10, Y - 5, 28, 8, CREAM); TXT('RSVD', X + 24, Y - 4, RED, 'center'); }
    sign(X + 24, Y - 28, 'FLIPSIDE', '#ff9e57', INK);
    R(X + 23, Y - 17, 2, 10, '#6b4a2b');
  }

  function drawCrates() {
    var X = 9 * T, Y = 15 * T;
    [['#c8323c', 0], ['#2f6fb3', 16]].forEach(function (c) {
      var x = X + c[1];
      for (var i = 0; i < 6; i++) R(x + 2 + i * 2, Y - 4, 2, 7, i % 2 ? '#14141a' : '#e8e8f0');
      OB(x + 1, Y + 1, 14, 13, c[0]);
      for (var j = 0; j < 3; j++) R(x + 3 + j * 4, Y + 5, 2, 6, 'rgba(0,0,0,.35)');
    });
  }
  function drawChurro() {
    var X = 22 * T, Y = 16 * T;
    R(X + 15, Y - 30, 2, 28, '#8a90a0');
    for (var i = 0; i < 5; i++) R(X - 4 + i * 8, Y - 36, 8, 6, i % 2 ? CREAM : CYAN);
    R(X - 4, Y - 37, 40, 1, INK); R(X - 4, Y - 30, 40, 1, INK);
    OB(X + 2, Y - 6, 28, 16, CREAM); R(X + 2, Y - 6, 28, 3, RED);
    R(X + 6, Y - 1, 8, 2, '#d8a050'); R(X + 6, Y + 2, 8, 2, '#d8a050'); R(X + 18, Y, 8, 2, '#d8a050');
    OB(X + 4, Y + 10, 5, 5, '#2b2422'); OB(X + 23, Y + 10, 5, 5, '#2b2422');
  }
  function drawPotty() {
    var X = 27 * T, Y = 17 * T;
    R(X - 1, Y - 12, 18, 4, '#e8e8f0');
    OB(X, Y - 8, 16, 39, '#2f6fb3');
    R(X + 3, Y - 4, 10, 32, '#3a7cc4');
    R(X + 9, Y + 6, 4, 2, RED);
  }
  function drawSaguaro(tx, ty) {
    var X = tx * T, Y = ty * T;
    OB(X + 5, Y - 26, 6, 40, '#3f8f4a');
    R(X + 7, Y - 24, 1, 36, '#2f6f3a');
    OB(X + 1, Y - 6, 4, 3, '#3f8f4a'); OB(X + 1, Y - 16, 3, 10, '#3f8f4a');
    OB(X + 11, Y - 10, 4, 3, '#3f8f4a'); OB(X + 12, Y - 22, 3, 12, '#3f8f4a');
    R(X + 7, Y - 27, 2, 1, '#ff77a8');
  }
  function drawGate() {
    var y = (MH - 1) * T;
    R(GATE_X0 * T - 3, y - 14, 3, 30, '#8a90a0'); R((GATE_X1 + 1) * T, y - 14, 3, 30, '#8a90a0');
    sign((GATE_X1 + 1) * T + 2, y - 26, 'EXIT', GOLD, INK);
  }

  function draw() {
    var cv = document.getElementById('walkcv');
    if (!cv || !W.floor) return; // Grok Bot r3c2 fix: never draw a walk whose floor is not built yet
    ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    CX = Math.round(Math.max(0, Math.min(MW * T - VW, W.x - VW / 2)));
    CY = Math.round(Math.max(0, Math.min(MH * T - VH, W.y - 12 - VH / 2)));
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, VH);
    ctx.drawImage(W.floor, -CX, -CY);
    var bn = banner();
    ctx.drawImage(bn, Math.round((MW * T - bn.width) / 2 - CX), 1 - CY);

    var list = W.objs.slice();
    list.push({ base: W.y, draw: function () { shadow(W.x, W.y); sprite(W.look, W.dir, W.step, W.x, W.y); } });
    var d = W.dex;
    if (d && d.present) list.push({ base: d.y, draw: function () { shadow(d.x, d.y); sprite(d.look, d.dir, d.step, d.x, d.y); } });
    (W.npcs || []).forEach(function (n) { if (n.present) list.push({ base: n.y, draw: function () { shadow(n.x, n.y); sprite(n.look, n.dir, n.step, n.x, n.y); } }); });
    (W.nerds || []).forEach(function (n) { if (n.present) list.push({ base: n.y, draw: function () { shadow(n.x, n.y); sprite(n.look, n.dir, n.step, n.x, n.y); if (n.state === 'go') drawWant(n); } }); });
    list.sort(function (a, b) { return a.base - b.base; });
    list.forEach(function (o) { o.draw(); });

    // weather over everything
    var wid = wxId(), now = performance.now() / 1000;
    if (wid === 'rain') {
      ctx.fillStyle = 'rgba(20,30,60,.22)'; ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = 'rgba(190,215,255,.6)';
      for (var i = 0; i < 70; i++) {
        var rx = (i * 53 + now * 30) % VW, ry = (i * 97 + now * 230) % VH;
        ctx.fillRect(Math.floor(rx), Math.floor(ry), 1, 5);
      }
    } else if (wid === 'hot') {
      ctx.fillStyle = 'rgba(255,140,40,.08)'; ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      for (var hy = 0; hy < VH; hy += 6) ctx.fillRect(Math.round(Math.sin(hy / 9 + now * 3) * 2), hy, VW, 1);
    }

    // where a tap is taking you
    if (W.marker && W.path && W.path.length) {
      var mk = Math.floor(now * 4) % 2, mx = W.marker.x, my = W.marker.y;
      R(mx - 3 - mk, my - 1, 7 + mk * 2, 1, GOLD); R(mx - 1, my - 3 - mk, 1, 7 + mk * 2, GOLD);
      R(mx - 5 - mk, my + 2, 2, 1, INK); R(mx + 4 + mk, my + 2, 2, 1, INK);
    }
    // Dex name tag when he is close
    if (d && d.present && Math.abs(d.x - W.x) < 64 && Math.abs(d.y - W.y) < 48) sign(d.x, d.y - 38, 'DEX', '#ff9e57', INK);
    (W.npcs || []).forEach(function (n) {
      if (!n.present) return;
      if (n.filming) { sign(n.x, n.y - 38, 'REC', Math.floor(now * 2) % 2 ? RED : CREAM, Math.floor(now * 2) % 2 ? CREAM : RED); return; }
      if (Math.abs(n.x - W.x) < 64 && Math.abs(n.y - W.y) < 48) sign(n.x, n.y - 38, { phil: 'PHIL', brody: 'BRODY', steve: 'STEVE' }[n.id] || 'RIVAL', n.id === 'phil' ? CYAN : n.id === 'steve' ? CREAM : GOLD, INK);
    });

    // prompt bar
    var t = findTarget();
    var bar = null;
    if (t) bar = (isTouch() ? 'A' : 'SPACE') + ': ' + (t.label || t.title || 'LOOK');
    else if (W.hint > 0) bar = W.expo ? (isTouch() ? 'TAP A BOOTH. THE NERDS ARE ALREADY RUNNING.' : 'CLICK A BOOTH. THE NERDS ARE ALREADY RUNNING.') : isTouch() ? 'TAP A TABLE TO WALK OVER AND SHOP' : 'CLICK A TABLE, OR WALK UP AND PRESS SPACE';
    if (bar) {
      ctx.fillStyle = 'rgba(11,16,34,.88)'; ctx.fillRect(0, VH - 12, VW, 12);
      ctx.fillStyle = RED; ctx.fillRect(0, VH - 13, VW, 1);
      NP.pixelText(ctx, bar.slice(0, Math.floor((VW - 8) / 6)), 4, VH - 10, 1, t ? GOLD : CREAM);
    }
  }

  // ---------- loop ----------
  function active() {
    var st = NP.G && NP.G.state();
    return !!(W && st && st.screen === 'walk' && document.getElementById('walkcv'));
  }
  function loop(t) {
    if (!active()) { raf = null; return; }
    var dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
    lastT = t;
    // the world holds still while a panel or a tip is open
    if (!W.panel && !(G().tipOpen && G().tipOpen())) {
      var ok = update(dt);
      if (ok === false || !active()) { raf = null; return; }
      draw();
    }
    raf = requestAnimationFrame(loop);
  }

  // ---------- DOM ----------
  function build(app, hudHTML) {
    var wide = (app.clientWidth || window.innerWidth) >= 560;
    VW = wide ? 320 : 240; VH = wide ? 208 : 192;
    var ratio = (VW / VH).toFixed(3);
    var touch = isTouch();
    app.innerHTML = '<div id="walkhud">' + hudHTML + '</div>' +
      '<div class="screen walk' + (W.expo ? ' expo' : '') + '"><h2>' + (W.expo ? '&#127918;' : '&#9978;') + ' ' + esc(W.stop.name) + '</h2>' +
      '<div class="walkwrap' + (touch ? ' touch' : '') + '">' +
      '<div class="cvbox" style="--ratio:' + ratio + '">' +
      '<canvas id="walkcv" tabindex="0" width="' + VW + '" height="' + VH + '" aria-label="' + (W.expo ? 'The Desert Pixel Expo convention hall' : 'The Saguaro Swap Meet') + '. Use arrow keys to walk and space to look."></canvas>' +
      '<div class="wtoast" hidden></div><div class="wpanel" hidden tabindex="-1"></div></div>' +
      '<div class="tpad"><div class="dpad" id="dpad"><i class="u"></i><i class="l"></i><i class="c"></i><i class="r"></i><i class="d"></i></div>' +
      '<button class="abtn" data-w="act" aria-label="Look">A</button></div></div>' +
      '<div class="walk-help">' + (W.expo ? (touch ? 'Tap a booth to walk over. The thing floating over a nerd is what they are running for.' : 'Click a booth to walk over, or use the arrow keys. The thing floating over a nerd is what they are running for.')
        : touch ? 'Tap anywhere to walk there. Tap a table to shop it. The pad and A button work too.' : 'Click anywhere to walk there, or use the arrow keys or WASD. Click a table (or press Space) to shop it. Esc to step back.') +
      ' Walking uses daylight too, about a minute for every six steps.' + '</div>' +
      (G().rivalNotes ? '<div class="walk-rivals">' + (W.expo ? passHTML() + '<div class="note">' + esc(NP.EXPO.rivals) + '</div>' : '') + G().rivalNotes(W.stop) + '</div>' : '') + '</div>';
    W.floor = W.floor || buildFloor();
    bindPad();
    var cv = document.getElementById('walkcv');
    bindTap(cv);
    try { cv.focus({ preventScroll: true }); } catch (e) { cv.focus(); }
    cv.addEventListener('mousedown', function () { try { cv.focus({ preventScroll: true }); } catch (e) {} });
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); }
    draw();
    fitCanvas();
    requestAnimationFrame(fitCanvas);
  }

  // Size the play area so the whole swap meet screen fits the window (or the iframe it is in)
  // without scrolling: whatever height the top bar, title, touch pad and help text take, the canvas gets the rest.
  function fitCanvas() {
    var cv = document.getElementById('walkcv'), box = cv && cv.parentNode, app = document.getElementById('app');
    if (!cv || !box || !app) return;
    // Measure how far the page runs past the bottom of the window (or iframe), padding and safe-area insets
    // included, and give or take that much from the canvas. A second pass catches anything that reflowed.
    for (var pass = 0; pass < 3; pass++) {
      var ch = cv.getBoundingClientRect().height;
      if (!ch) return;
      var bottom = app.getBoundingClientRect().top + (window.pageYOffset || 0) + app.offsetHeight;
      // the rival notes sit under the play area and may scroll; they do not shrink the canvas (Grok Bot r3a fix)
      var rv = app.querySelector('.walk-rivals'), rvH = rv && rv.offsetHeight ? rv.getBoundingClientRect().height + 16 : 0;
      var over = Math.ceil(bottom - window.innerHeight - rvH);
      var bw = box.getBoundingClientRect().width;
      if (pass === 0) box.style.maxWidth = Math.max(200, Math.floor((ch - over - 7) * VW / VH + 6)) + 'px';
      else if (over > 0) box.style.maxWidth = Math.max(200, Math.floor(bw - over * VW / VH - 2)) + 'px';
      else break;
    }
  }
  window.addEventListener('resize', function () { if (active()) fitCanvas(); });
  window.addEventListener('orientationchange', function () { if (active()) setTimeout(fitCanvas, 250); });

  function render(app, hudHTML) {
    if (!W) return;
    // Grok Bot r3c2 fix: going straight from the swap meet to the Expo ("Next stop" in the parking lot panel) left the
    // swap meet canvas in the page, so the Expo never got built (no floor, swap meet heading, the walk loop crashed).
    // Build again whenever this is a new walk (enter() makes a new W).
    if (!document.getElementById('walkcv') || !W.built) { build(app, hudHTML); W.built = true; }
    else {
      var hh = document.getElementById('walkhud');
      if (hh) hh.innerHTML = hudHTML;
      fitCanvas();
    }
    var t = G().takeToast();
    if (t) showToast(t);
    // Dex is already here when you walk in (he beat you to it)
    if (W.dex && W.dex.present && G().tip) G().tip('dex');
    if (W.panel) panelRender();
    if (!raf && active()) { lastT = performance.now(); raf = requestAnimationFrame(loop); }
  }

  function bindPad() {
    var pad = document.getElementById('dpad');
    if (!pad) return;
    var id = null;
    function setFrom(e) {
      var r = pad.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      var m = Math.sqrt(dx * dx + dy * dy);
      pad.querySelectorAll('i').forEach(function (n) { n.classList.remove('on'); });
      if (m < 10) { touchVec.x = touchVec.y = 0; return; }
      var a = Math.atan2(dy, dx), oct = Math.round(a / (Math.PI / 4));
      var v = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]][(oct + 8) % 8];
      touchVec.x = v[0]; touchVec.y = v[1];
      if (v[0] < 0) pad.querySelector('.l').classList.add('on');
      if (v[0] > 0) pad.querySelector('.r').classList.add('on');
      if (v[1] < 0) pad.querySelector('.u').classList.add('on');
      if (v[1] > 0) pad.querySelector('.d').classList.add('on');
    }
    function end(e) {
      if (id !== null && e.pointerId !== id) return;
      id = null; touchVec.x = touchVec.y = 0;
      pad.querySelectorAll('i').forEach(function (n) { n.classList.remove('on'); });
    }
    pad.addEventListener('pointerdown', function (e) {
      e.preventDefault(); id = e.pointerId;
      try { pad.setPointerCapture(id); } catch (x) {}
      setFrom(e);
    });
    pad.addEventListener('pointermove', function (e) { if (e.pointerId === id) setFrom(e); });
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    pad.addEventListener('lostpointercapture', end);
  }

  // ---------- input ----------
  var KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  window.addEventListener('keydown', function (e) {
    if (!active()) return;
    var tag = (e.target && e.target.tagName) || '';
    if (W.panel) {
      if (e.code === 'Escape') { e.preventDefault(); closePanel(); }
      return;
    }
    // arrows and WASD always walk, even right after clicking the sound or Ad-Free button
    var k = KEYMAP[e.code];
    if (k) { keys[k] = true; e.preventDefault(); return; }
    // Space and Enter belong to whatever button or checkbox has focus
    if ((tag === 'INPUT' || tag === 'BUTTON' || tag === 'A') && e.target.getAttribute('data-w') !== 'act') return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE' || e.code === 'KeyZ') {
      e.preventDefault();
      if (!e.repeat) interact();
    }
  });
  window.addEventListener('keyup', function (e) {
    var k = KEYMAP[e.code];
    if (k) keys[k] = false;
  });
  window.addEventListener('blur', function () { keys = {}; touchVec.x = touchVec.y = 0; });
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-w]');
    if (!el || !active()) return;
    var a = el.getAttribute('data-w');
    if (a === 'close') closePanel();
    else if (a === 'act') interact();
  });

  return {
    enter: enter, render: render,
    // test hooks
    _state: function () { return W; }, _interact: interact, _open: openPanel, _close: closePanel
  };
})();
