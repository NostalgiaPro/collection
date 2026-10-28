// Nostalgia Pro: one Saturday, one budget, one shelf.
(function () {
  'use strict';
  var C = NP.COL;
  var START = 7 * 60, END = 17 * 60 + 30; // 7:00 AM to 5:30 PM sundown
  var BUDGET = 100;
  var COND_MULT = { loose: 1, cib: 2, sealed: 3.2 };
  var T_HAGGLE = 5, T_INSPECT = 5, T_SHELF = 10, T_DIG = 15;
  var EPOCH = Date.UTC(2026, 0, 3); // a Saturday. Run numbers count from here.
  var CFG = NP.CONFIG || {};
  // build.js replaces the marked part with true (demo) or false (full), so the demo cannot be unlocked from config.js
  var DEMO = true;

  // ---------- storage ----------
  // Works on itch.io, inside an iframe on thenostalgiapro.com, and opened straight from a folder (file://).
  // Keys are prefixed so they never collide with anything else on the same site, and the demo keeps
  // its own save data. If a browser blocks storage, the game keeps playing from memory for this visit.
  var PFX = DEMO ? 'npgame_demo_' : 'npgame_';
  var memStore = {};
  var canSave = (function () {
    try { var k = PFX + '__test'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; }
  })();
  var store = {
    ok: canSave,
    get: function (k, d) {
      try { if (canSave) { var v = localStorage.getItem(PFX + k); if (v !== null) return JSON.parse(v); } } catch (e) {}
      return Object.prototype.hasOwnProperty.call(memStore, k) ? JSON.parse(memStore[k]) : d;
    },
    set: function (k, v) {
      var s = JSON.stringify(v);
      memStore[k] = s;
      try { if (canSave) localStorage.setItem(PFX + k, s); } catch (e) {}
    }
  };

  // ---------- fullscreen (desktop and Android; iPhone Safari does not allow it, so the button hides) ----------
  function coarse() { try { return window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window); } catch (e) { return false; } }
  function fsSupported() { var d = document; return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled); }
  function fsButton() { return fsSupported() && CFG.ALLOW_FULLSCREEN !== false ? '<button class="fsbtn" data-act="fullscreen">Full screen</button>' : ''; }
  function soundButton() { return NP.Sound && NP.Sound.supported ? '<button class="fsbtn sndbtn" data-act="mute" aria-pressed="' + (NP.Sound.isMuted() ? 'true' : 'false') + '">' + NP.Sound.label() + '</button>' : ''; }
  function linksOk() { return CFG.ALLOW_LINKS !== false; }
  function feedbackOk() { return linksOk() && !!CFG.FEEDBACK_URL; }
  function sfx(n) { if (NP.Sound) NP.Sound.sfx(n); }
  function music(n) { if (NP.Sound) NP.Sound.music(n); }
  function track(n, once) { if (NP.track) NP.track(n, once); }
  function toggleFullscreen() {
    var d = document, el = d.documentElement;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    } catch (e) {}
  }

  // ---------- seeded RNG ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function phoenixDate() {
    try {
      var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (/^\d{4}-\d{2}-\d{2}$/.test(parts)) return parts;
    } catch (e) {}
    var d = new Date(Date.now() - 7 * 3600 * 1000); // Phoenix is UTC-7 all year
    return d.toISOString().slice(0, 10);
  }
  function runNumber(ds) {
    var p = ds.split('-').map(Number);
    var n = Math.floor((Date.UTC(p[0], p[1] - 1, p[2]) - EPOCH) / 86400000) + 1;
    return n > 0 ? n : 1;
  }

  // ---------- helpers ----------
  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) { return '$' + Math.round(n); }
  function fmtTime(m) {
    var h = Math.floor(m / 60), mm = m % 60, ap = h >= 12 ? 'PM' : 'AM';
    var hh = h % 12 || 12;
    return hh + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ap;
  }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function shuffle(r, arr) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---------- day generation (pure function of the seed) ----------
  var uidN = 0;
  function makeItem(r, entry, opts) {
    opts = opts || {};
    var seller = NP.SELLERS[opts.seller];
    var it = {
      uid: 'i' + (uidN++), id: entry.id, t: entry.t, p: entry.p, tier: entry.tier || 0, base: entry.base,
      set: entry.set, kind: opts.kind || 'game', seller: opts.seller, sticker: r() < 0.5,
      cond: 'loose', flags: {}, inspected: false, checked: false, state: 'avail', line: ''
    };
    if (it.kind === 'game') {
      var cr = r();
      var sealedP = opts.sealedP != null ? opts.sealedP : 0.12;
      it.cond = cr < sealedP ? 'sealed' : cr < sealedP + (opts.cibP != null ? opts.cibP : 0.32) ? 'cib' : 'loose';
      if (opts.sports) it.cond = r() < 0.3 ? 'cib' : 'loose';
      var tested = opts.tested;
      var pl = NP.PLATFORMS[it.p];
      if (!tested) {
        if (it.cond === 'loose' && r() < (pl.media === 'disc' ? (opts.damageP || 0.25) : 0.1)) it.flags.damaged = true;
        if (it.cond === 'cib' && r() < 0.3) it.flags.noManual = true;
        if (r() < (it.tier >= 3 ? (opts.reproRare || 0.2) : (opts.reproP || 0.05))) it.flags.repro = true;
        if (it.cond === 'sealed' && r() < (opts.resealP || 0.35)) it.flags.reseal = true;
        it.tell = r() < 0.7; // can inspection spot it?
      } else it.tested = true;
    }
    if (it.kind === 'grail') { it.cond = 'cib'; }
    var apparent = Math.max(1, it.base * (COND_MULT[it.cond] || 1));
    if (opts.ask != null) it.ask = opts.ask;
    else {
      var jit = seller && seller.wild ? lerp(0.2, 2.2, r()) : lerp(0.85, 1.2, r());
      it.ask = Math.max(1, Math.round(apparent * (seller ? seller.ask : 1) * jit));
    }
    it.minFrac = seller ? lerp(seller.minLo, seller.minHi, r()) : 1;
    if (opts.firm) it.minFrac = 1;
    return it;
  }

  function genDay(seedStr) {
    var r = mulberry32(NP.hashStr('nostalgia-pro|' + seedStr));
    uidN = 0;
    var games = NP.CATALOG;
    var common = games.filter(function (g) { return g.tier === 1; });
    var unc = games.filter(function (g) { return g.tier === 2; });
    var rare = games.filter(function (g) { return g.tier === 3; });
    function rollEntry(w) { // w = [pCommon, pUnc]
      var x = r();
      return x < w[0] ? pick(r, common) : x < w[0] + w[1] ? pick(r, unc) : pick(r, rare);
    }
    // what is already on your shelf (you only sort of remember)
    var owned = {};
    games.forEach(function (g) { var p = [0, 0.45, 0.3, 0.12][g.tier]; if (r() < p) owned[g.id] = true; });

    var stops = [];
    function addStop(type, seller, cost, nVis, nDig, w, extra) {
      extra = extra || {};
      var st = { id: 's' + stops.length, type: type, name: '', seller: seller, cost: cost, items: [], dig: [], dug: false, visited: false, rivalAt: null, rumor: false, cleared: false };
      st.name = pick(r, NP.STOPNAMES[type]);
      while (stops.some(function (o) { return o.name === st.name; })) st.name = pick(r, NP.STOPNAMES[type]);
      function sellerFor() { return extra.mixed ? pick(r, extra.mixed) : seller; }
      for (var i = 0; i < nVis + nDig; i++) {
        var sl = sellerFor();
        var it = makeItem(r, rollEntry(w), { seller: sl, tested: extra.tested, sealedP: extra.sealedP, reproRare: extra.reproRare, resealP: extra.resealP, damageP: extra.damageP });
        (i < nVis ? st.items : st.dig).push(it);
      }
      stops.push(st);
      return st;
    }
    var yardSellers = shuffle(r, ['grandma', 'kid', 'friendly']);
    addStop('yard', yardSellers[0], 72, 4, 3, [0.7, 0.22], { damageP: 0.3 });
    addStop('yard', yardSellers[1], 66, 4, 3, [0.7, 0.22], { damageP: 0.3 });
    // sports bin
    var sp = { id: 's' + stops.length, type: 'sports', name: NP.STOPNAMES.sports[0], seller: 'sports', cost: 55, items: [], dig: [], dug: false, visited: false, rivalAt: null, rumor: false, cleared: false };
    var sportsList = shuffle(r, NP.SPORTS);
    sportsList.slice(0, 5).forEach(function (e) { sp.items.push(makeItem(r, e, { seller: 'sports', sports: true, ask: 1 + Math.floor(r() * 3) })); });
    var special = sp.items[Math.floor(r() * sp.items.length)];
    special.ask = 80; special.minFrac = 1; special.special = true;
    sportsList.slice(5, 9).forEach(function (e) { sp.dig.push(makeItem(r, e, { seller: 'sports', sports: true, ask: 1 + Math.floor(r() * 2) })); });
    var gem = makeItem(r, rollEntry([0, 0.5]), { seller: 'sports', ask: 2 + Math.floor(r() * 4) });
    gem.flags.repro = false;
    sp.dig.splice(Math.floor(r() * sp.dig.length), 0, gem);
    stops.push(sp);

    var thriftSellers = shuffle(r, ['friendly', 'firm', 'ikwig']);
    var th1 = addStop('thrift', thriftSellers[0], 70, 4, 3, [0.6, 0.3]);
    var th2 = addStop('thrift', thriftSellers[1], 72, 4, 3, [0.6, 0.3]);
    // merch hiding in thrift bins
    [th1, th2].forEach(function (th) {
      var m = pick(r, NP.MERCH);
      th.items.splice(Math.floor(r() * th.items.length), 0, makeItem(r, { id: m.id, t: m.t, p: 'k16', base: 0 }, { kind: 'merch', ask: 1 + Math.floor(r() * 4), seller: th.seller }));
    });
    var flea = addStop('flea', null, 73, 6, 3, [0.45, 0.4], { mixed: ['friendly', 'ikwig', 'firm', 'friendly'], sealedP: 0.2, reproRare: 0.45, resealP: 0.5 });
    // blind lot box
    var lot = makeItem(r, { id: 'lot', t: 'Mystery Lot Box (do not open here)', p: 'k16', base: 0 }, { kind: 'lot', seller: 'friendly', ask: 15 + Math.floor(r() * 3) * 5 });
    lot.contents = [];
    for (var li = 0; li < 5; li++) {
      var lr = r();
      var e = lr < 0.45 ? pick(r, NP.SPORTS) : lr < 0.8 ? pick(r, common) : lr < 0.95 ? pick(r, unc) : pick(r, rare);
      var li2 = makeItem(r, e, { seller: 'friendly', sports: NP.SPORTS.indexOf(e) >= 0, sealedP: 0.05 });
      if (lr >= 0.9 && r() < 0.5) li2 = makeItem(r, { id: 'm6', t: 'Nostalgia Pro: The Day-One Patch', p: 'k16', base: 0 }, { kind: 'merch', ask: 0 });
      lot.contents.push(li2);
    }
    flea.items.splice(2, 0, lot);
    addStop('pawn', 'pawn', 68, 5, 0, [0.35, 0.45], { tested: true, sealedP: 0.15 });
    stops.push({ id: 's' + stops.length, type: 'gift', name: NP.STOPNAMES.gift[0], seller: null, cost: 40, items: [], dig: [], visited: false, gift: true });

    // grail: the game itself, buried in a dig pile somewhere
    var hidey = stops.filter(function (s) { return (s.type === 'yard' || s.type === 'thrift') && s.dig.length; });
    var gs = pick(r, hidey);
    var gi = makeItem(r, NP.GRAIL, { kind: 'grail', seller: gs.seller, ask: 3 + Math.floor(r() * 5) });
    gs.dig.splice(Math.floor(r() * (gs.dig.length + 1)), 0, gi);

    // the rival reseller
    stops.forEach(function (s) {
      if (s.type === 'yard' || s.type === 'thrift' || s.type === 'flea') {
        if (r() < 0.45) { s.rivalAt = START + 120 + Math.floor(r() * 9) * 30; s.rumor = r() < 0.65; }
      }
    });
    // display order: shuffled but gift shop always shouts from the middle
    var gift = stops.pop();
    var order = shuffle(r, stops);
    order.splice(3, 0, gift);
    var adOrder = shuffle(r, NP.ADS.map(function (_, i) { return i; }));
    return { stops: order, owned: owned, adOrder: adOrder, shelfCount: 280 + Math.floor(r() * 90) };
  }

  // ---------- daily extras: weather and the featured lot ----------
  // These use their own seeded RNGs, so the base day from genDay() is exactly what it was before.
  var AVG_HIGH = [67, 71, 77, 85, 94, 104, 106, 104, 100, 89, 76, 66]; // Phoenix average highs by month, F
  function weatherFor(seed) {
    var r = mulberry32(NP.hashStr('weather|' + seed));
    var ds = /^\d{4}-\d{2}-\d{2}$/.test(seed) ? seed : phoenixDate();
    var month = +ds.slice(5, 7) - 1, base = AVG_HIGH[month] || 90, monsoon = month >= 6 && month <= 8;
    var x = r();
    if (x < (monsoon ? 0.2 : 0.08)) {
      return { id: 'rain', temp: base - 9 - Math.floor(r() * 5), name: monsoon ? 'Monsoon storm' : 'Rain', mult: 1, icon: '&#127783;',
        blurb: 'A rare rain day. Half the town stayed home, sellers want to deal, and Dex is running late.' };
    }
    if (base >= 85 && x < 0.5) {
      var hot = base + 6 + Math.floor(r() * 6);
      return { id: 'hot', temp: hot, name: hot >= 110 ? 'Excessive heat warning' : 'Heat advisory', mult: 1.2, icon: '&#127777;', sponsored: true,
        blurb: 'Hot one today. Everything takes a little longer out there.' };
    }
    return { id: 'sunny', temp: base - 2 + Math.floor(r() * 5), name: 'Sunny', mult: 1, icon: '&#9728;', blurb: 'Clear skies. A normal Phoenix Saturday.' };
  }
  var FEATURED_NAMES = ['Box Labeled "MISC (GAMES?)"', "Grandpa's Garage Tote", 'Estate Sale Bin #4', 'Moving Day Box (Fragile, Maybe)',
    'Storage Unit Mystery Crate', 'Box That Smells Like 1994', 'Tote Labeled "KIDS STUFF DO NOT SELL"'];
  function applyExtras(day, seed) {
    day.wx = weatherFor(seed);
    if (day.wx.id === 'rain') {
      day.stops.forEach(function (s) {
        if (s.rivalAt) { s.rivalAt += 75; if (s.rivalAt > END - 30) { s.rivalAt = null; s.rumor = false; } }
        (s.items || []).concat(s.dig || []).forEach(function (it) { if (it.minFrac < 1) it.minFrac *= 0.9; });
      });
    }
    var fr = mulberry32(NP.hashStr('featured|' + seed));
    var hosts = day.stops.filter(function (s) { return s.type === 'yard' || s.type === 'thrift' || s.type === 'flea' || s.type === 'pawn'; });
    var host = pick(fr, hosts), name = pick(fr, FEATURED_NAMES);
    var lot = makeItem(fr, { id: 'flot', t: 'Featured Lot: ' + name, p: 'k16', base: 0 }, { kind: 'lot', seller: host.seller || 'friendly', ask: 20 + Math.floor(fr() * 4) * 5 });
    lot.featured = true; lot.contents = [];
    var games = NP.CATALOG;
    var byTier = function (t) { return games.filter(function (g) { return g.tier === t; }); };
    [NP.SPORTS, NP.SPORTS, byTier(1), byTier(1), byTier(2)].forEach(function (pool) {
      var e = pick(fr, pool);
      lot.contents.push(makeItem(fr, e, { seller: 'friendly', sports: pool === NP.SPORTS, sealedP: 0.06 }));
    });
    var w = fr();
    if (w < 0.3) lot.contents.push(makeItem(fr, pick(fr, byTier(3)), { seller: 'friendly', sealedP: 0.08 }));
    else if (w < 0.5) { var m = pick(fr, NP.MERCH); lot.contents.push(makeItem(fr, { id: m.id, t: m.t, p: 'k16', base: 0 }, { kind: 'merch', ask: 0 })); }
    else lot.contents.push(makeItem(fr, pick(fr, byTier(2)), { seller: 'friendly', sealedP: 0.06 }));
    host.items.unshift(lot);
    day.featured = { name: name, stopId: host.id, stopName: host.name, ask: lot.ask, item: lot };
    return day;
  }
  var pvCache = null;
  function previewDay() {
    if (!pvCache || pvCache.seed !== todaySeed) {
      var d = buildDay();
      pvCache = { seed: todaySeed, wx: d.wx, featured: { name: d.featured.name, stopName: d.featured.stopName, ask: d.featured.ask } };
    }
    return pvCache;
  }

  // ---------- sellers who remember you ----------
  function daysSince(d) {
    var a = Date.parse(d), b = Date.parse(todaySeed);
    if (isNaN(a) || isNaN(b)) return d === todaySeed ? 0 : 1;
    return Math.round((b - a) / 86400000);
  }
  function whenText(n) { return n <= 1 ? 'yesterday' : n < 7 ? 'the other day' : n < 14 ? 'last week' : 'a while back'; }
  function loadMem() { return store.get('mem', {}) || {}; }
  function remember(key, field) {
    if (DEMO || !S || !S.official) return; // replays and the demo do not count
    var m = loadMem(); m[key] = m[key] || {};
    m[key][field] = todaySeed;
    if (field === 'square') delete m[key].mad;
    if (field === 'mad') delete m[key].square;
    store.set('mem', m);
  }
  function applyMemory(day) {
    var m = loadMem(), rem = {};
    function recent(rec, f) { if (!rec || !rec[f]) return 0; var n = daysSince(rec[f]); return (n >= 1 && n <= 21) ? n : 0; }
    var n;
    if ((n = recent(m.ikwig, 'mad'))) rem.ikwig = { line: 'You. The lowballer from ' + whenText(n) + '. I remember you. I know what I got, and I know what you did.', card: 'The I Know What I Got guy is here. He is still mad about ' + whenText(n) + '.', price: 1.15, mad: true };
    else if ((n = recent(m.ikwig, 'square'))) rem.ikwig = { line: "Oh. It's you. We're square now. Don't make it weird.", card: 'The I Know What I Got guy is here. You two are square.' };
    if ((n = recent(m.grandma, 'pal'))) rem.grandma = { line: "Oh, it's you again, hon! I set aside the good ones for you.", card: 'The Sweet Retiree is here. She remembers you.', soft: 0.8 };
    if ((n = recent(m.kid, 'pal'))) rem.kid = { line: 'Hey, it\'s you! My dad was SO mad about ' + whenText(n) + '.', card: 'The kid selling his dad\'s stuff is back. Dad was not thrilled.' };
    if ((n = recent(m.firm, 'pal'))) rem.firm = { line: 'Correct Amount Guy. Welcome back. Prices are still firm.', card: 'Price Is Firm Guy remembers you. Prices are still firm.' };
    if ((n = recent(m.sports, 'sucker'))) rem.sports = { line: "My best customer is back! I found you another '97.", card: 'The football bin guy remembers you. He is very excited.', special: 90 };
    day.stops.forEach(function (s) {
      (s.items || []).concat(s.dig || []).forEach(function (it) {
        var r = rem[it.seller]; if (!r) return;
        if (r.price) it.ask = Math.max(1, Math.round(it.ask * r.price));
        if (r.soft && it.minFrac < 1) it.minFrac *= r.soft;
        if (r.special && it.special) it.ask = r.special;
      });
    });
    return rem;
  }
  function helloFor(seller) { return S && S.rem && S.rem[seller] ? S.rem[seller].line : null; }
  function memCard(s) {
    if (!S.rem) return '';
    var keys = s.seller ? [s.seller] : (s.items || []).map(function (i) { return i.seller; });
    for (var i = 0; i < keys.length; i++) if (S.rem[keys[i]]) return S.rem[keys[i]].card;
    return '';
  }

  // ---------- game state ----------
  var S = null;
  var adFree = store.get('adfree', false);
  var params = new URLSearchParams(location.search);
  var todaySeed = DEMO ? (CFG.DEMO_SEED || 'demo-saturday-1') : (params.get('seed') || phoenixDate());
  function dayLabel() { return DEMO ? 'Demo Saturday' : 'Saturday #' + runNumber(/^\d{4}-\d{2}-\d{2}$/.test(todaySeed) ? todaySeed : phoenixDate()); }

  // ---------- the demo's one curated Saturday ----------
  function buildDay() {
    var day = applyExtras(genDay(todaySeed), todaySeed);
    if (DEMO) curateDemo(day);
    return day;
  }
  function curateDemo(day) {
    day.wx = { id: 'hot', temp: 104, name: 'Heat advisory', mult: 1.2, icon: '&#127777;', sponsored: true, blurb: 'Hot one today. Everything takes a little longer out there.' };
    var flea = day.stops.filter(function (s) { return s.type === 'flea'; })[0];
    var yard = day.stops.filter(function (s) { return s.type === 'yard'; })[0];
    var gift = day.stops.filter(function (s) { return s.gift; })[0];
    // the featured lot always sits at the swap meet in the demo
    var F = day.featured;
    if (F.stopId !== flea.id) {
      day.stops.forEach(function (s) { s.items = s.items.filter(function (i) { return i !== F.item; }); });
      F.item.seller = 'friendly';
      flea.items.unshift(F.item);
      F.stopId = flea.id; F.stopName = flea.name;
    }
    day.stops.forEach(function (s) {
      s.rivalAt = null; s.rumor = false;
      // the grail is a full version thing
      s.dig = (s.dig || []).filter(function (i) { return i.kind !== 'grail'; });
      if (s !== flea && s !== yard && s !== gift) s.locked = true;
    });
    // the planted Taco is the one repro in the demo: everything else in the open stops is real
    [yard, flea, gift].forEach(function (s) {
      (s.items || []).concat(s.dig || []).forEach(function (it) {
        if (it.flags) it.flags.repro = false;
        (it.contents || []).forEach(function (c) { if (c.flags) c.flags.repro = false; });
      });
    });
    // Dex always raids the swap meet a little after you arrive (see arrive() and walk.js)
    flea.demoRaid = true;
    // one planted repro: a rare game, complete in box, priced like a joke
    var r = mulberry32(NP.hashStr('demo-repro|' + todaySeed));
    var e = NP.CATALOG.filter(function (g) { return g.id === 'gtc'; })[0];
    var rep = makeItem(r, e, { seller: 'friendly', ask: 34 });
    rep.cond = 'cib'; rep.flags = { repro: true }; rep.tell = true; rep.minFrac = 0.7; rep.planted = true; rep.sticker = false;
    flea.items.splice(Math.min(2, flea.items.length), 0, rep);
    // open stops first, locked ones after
    day.stops = [yard, flea, gift].concat(day.stops.filter(function (s) { return s.locked; }));
  }

  function newRun() {
    var day = buildDay();
    S = {
      seed: todaySeed, runNo: runNumber(/^\d{4}-\d{2}-\d{2}$/.test(todaySeed) ? todaySeed : phoenixDate()), day: day,
      time: START, cash: BUDGET, bag: [], visited: 0, screen: 'map', stop: null, wx: day.wx, tfrac: 0,
      official: !DEMO && !store.get('day_' + todaySeed, null),
      ev: { rivalHits: 0, offended: 0, giftSpent: 0, sportsOverpay: 0, checks: 0, dupBuys: 0 }, adsShown: 0, pitchN: 0, toast: ''
    };
    S.rem = DEMO ? {} : applyMemory(day);
  }
  // Drive time to a stop. Heat only adds half its usual slowdown to the drive (the van has AC),
  // and no drive takes longer than DRIVE_CAP minutes (a safety net: every base cost is set so even the hottest day stays at or under it).
  // Time spent at a stop still gets the full heat mult (see spend()).
  var DRIVE_CAP = 80;
  function costOf(s) { var m = S.wx ? S.wx.mult : 1; return Math.min(DRIVE_CAP, Math.round(s.cost * (1 + (m - 1) * 0.5))); }

  function adLevel() { return S ? S.visited : 0; }

  // ---------- rendering ----------
  var app;
  function render() {
    music(!S || S.screen === 'title' ? 'title' : S.screen === 'walk' ? 'swap' : 'title');
    if (!S || S.screen === 'title') return renderTitle();
    if (S.screen === 'map') return renderMap();
    if (S.screen === 'walk') return NP.Walk ? NP.Walk.render(app, hud()) : renderStop();
    if (S.screen === 'stop') return S.stop.gift ? renderGift() : renderStop();
    if (S.screen === 'home') return renderHome();
    if (S.screen === 'results') return renderResults();
    if (S.screen === 'title') return renderTitle();
  }

  var NOON = 12 * 60;
  function sunPct() { var e = DEMO ? NOON : END; return Math.max(0, Math.min(100, (S.time - START) / (e - START) * 100)); }
  function sunText() {
    if (DEMO) { var l = NOON - S.time; if (l < 0) return 'Past noon by ' + (-l) + 'm. Wrap it up.'; return 'Back by noon. ' + Math.floor(l / 60) + 'h ' + (l % 60) + 'm left'; }
    var left = END - S.time; return 'Sundown 5:30 PM. ' + Math.max(0, Math.floor(left / 60)) + 'h ' + Math.max(0, left % 60) + 'm left'; }
  // light refresh for the clock while walking (no full re-render, so the ticker keeps scrolling)
  function updateHud() {
    var c = document.querySelector('.hud .clock'); if (c) c.textContent = fmtTime(Math.min(S.time, END));
    var bar = document.querySelector('.sunbar div'); if (bar) bar.style.width = sunPct() + '%';
    var sp = document.querySelector('.sunbar span'); if (sp) sp.textContent = sunText();
  }

  function hud() {
    var h = '<div class="hud"><div class="hud-l"><span class="clock">' + fmtTime(S.time) + '</span>' +
      (S.wx ? '<span class="wx wx-' + S.wx.id + '" title="' + esc(S.wx.name) + '">' + S.wx.icon + ' ' + S.wx.temp + '&deg;F</span>' : '') +
      '<span class="cash">' + money(S.cash) + '</span><span class="bagc">Bag: ' + S.bag.length + '</span></div>' +
      '<div class="hud-r">' + soundButton() + fsButton() + tipsButton() + '<label class="adtoggle"><input type="checkbox" data-act="adfree"' + (adFree ? ' checked' : '') + '> Ad-Free Edition</label></div></div>' +
      '<div class="sunbar" title="Daylight left"><div style="width:' + sunPct() + '%"></div><span>' + sunText() + '</span></div>';
    var lvl = adLevel();
    if (lvl >= 1) {
      var pool = adFree ? NP.TICKER_ADFREE : NP.TICKER;
      var msgs = [];
      for (var i = 0; i < Math.min(pool.length, lvl + 1); i++) msgs.push(pool[(i + S.visited) % pool.length]);
      h += '<div class="ticker lvl' + Math.min(lvl, 4) + '"><div class="tick-in">' + msgs.map(esc).join(' &#9733; ') + ' &#9733; ' + msgs.map(esc).join(' &#9733; ') + '</div></div>';
    }
    return h;
  }

  var cartOpen = false;
  function cartHTML() {
    return '<div class="cart-label"><div class="cart-brand">NOSTALGIA PRO</div><div class="cart-sub">' + (DEMO ? 'THE DEMO' : 'THE GAME') + ' &middot; SELECT A MODE</div>' +
      '<button class="cart-item" data-act="start">1 COLLECTOR</button>' +
      '<button class="cart-item" disabled aria-disabled="true">2 COLLECTORS <small>sold separately</small></button>' +
      (DEMO ? '<button class="cart-item" disabled aria-disabled="true">HOME SHELF <small>full version</small></button>'
        : '<button class="cart-item" data-act="shelf">HOME SHELF</button>') +
      '<button class="cart-item" data-act="howto">HOW TO PLAY</button>' +
      (NP.Creator ? '<button class="cart-item" data-act="look">' + (hasLook() ? 'CHANGE YOUR LOOK' : 'MAKE YOUR CHARACTER') + '</button>' : '') +
      (feedbackOk() ? '<a class="cart-item small" href="' + esc(CFG.FEEDBACK_URL) + '" target="_blank" rel="noopener" data-track="feedback_open">TELL US WHAT YOU THINK</a>' : '') +
      '</div><div class="cart-foot"><label class="adtoggle"><input type="checkbox" data-act="adfree"' + (adFree ? ' checked' : '') + '> Ad-Free Edition</label>' + soundButton() + fsButton() +
      '<span class="cart-fine">MADE IN A GARAGE &middot; NOT FOR RESALE</span></div>';
  }
  function showCart() {
    var wasOpen = cartOpen;
    cartOpen = true;
    var c = $('#cart'), hint = $('#tvhint');
    if (!c) return;
    if (!wasOpen) { sfx('vcr'); track('start_pressed'); }
    c.hidden = false; if (hint) hint.hidden = true;
    var first = c.querySelector('.cart-item');
    if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
    try { c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
  }

  // a sponsored heat advisory, and your reaction to it
  function sponsorLine(wx, react) {
    var SP = NP.SPONSOR;
    if (!wx || !wx.sponsored || !SP) return '';
    return '<span class="spons">' + esc(SP.weather) + '</span>' + (react ? '<span class="react">You: "' + esc(SP.react) + '"</span>' : '');
  }

  // the "get the full game" line on the start screen
  function fullGameLine() {
    if (CFG.COMING_SOON) {
      return '<div class="scores">Full game coming soon &middot; ' + esc(CFG.PRICE || '$0.99') +
        (linksOk() ? ' <a class="tlink" href="' + esc(CFG.FOLLOW_URL) + '" target="_blank" rel="noopener" data-track="title_follow">Follow for updates</a>' : '') + '</div>';
    }
    return linksOk() ? '<div class="scores"><a class="tlink" href="' + esc(CFG.FULL_GAME_URL) + '" target="_blank" rel="noopener" data-track="title_buy">Get the full game (' + esc(CFG.PRICE || '$0.99') + ')</a></div>' : '';
  }

  function renderTitle() {
    music('title');
    var best = store.get('best', null), today = store.get('day_' + todaySeed, null);
    var pv = previewDay(), wx = pv.wx, home = store.get('home', []);
    var tv = !!NP.Intro;
    app.innerHTML =
      '<div class="screen title">' +
      (tv ? '<div class="tvwrap"><canvas id="tvcv" width="320" height="200" aria-label="A CRT TV on a VCR. The title Nostalgia Pro is on screen. Press Enter or tap to start."></canvas></div>' +
        '<div class="tv-hint" id="tvhint"' + (cartOpen ? ' hidden' : '') + '>' + (coarse() ? 'Tap the TV to start' : 'Press Enter or click the TV') + '</div>'
        : '<canvas id="logo" width="640" height="150"></canvas>') +
      '<div class="cart" id="cart"' + (tv && !cartOpen ? ' hidden' : '') + '>' + cartHTML() + '</div>' +
      '<div class="daily">' + (DEMO ? '<b>Demo Saturday</b>' : dayLabel() + ' &middot; ' + esc(todaySeed)) +
      '<div class="dl-wx">' + wx.icon + ' ' + wx.temp + '&deg;F, ' + esc(wx.name) + '. ' + esc(wx.blurb) + sponsorLine(wx) + '</div>' +
      '<div class="dl-lot">' + (DEMO ? 'Featured lot' : 'Today\'s featured lot') + ': <b>' + esc(pv.featured.name) + '</b> at ' + esc(pv.featured.stopName) + ', asking ' + money(pv.featured.ask) + '. Everyone sees the same box.</div>' +
      (DEMO ? '<small>This is the free demo: one Saturday, three stops, and it ends after the swap meet. The full version gets a new Saturday every day.</small></div>'
        : '<small>Same run for everyone today. Resets at midnight, Phoenix time.</small></div>') +
      '<details class="howto"><summary><b>How it works</b></summary><ul>' +
      (DEMO ? '<li>Pick your stops. Each one costs time. Try to be back by noon.</li>' : '<li>Pick your stops. Each one costs daylight. Sundown is 5:30 PM.</li>') +
      '<li>Make an offer: lowball, fair or full price. Sellers have opinions.</li>' +
      '<li>Is it on the shelf? Checking costs time. Buying a duplicate costs points.</li>' +
      '<li>Watch out for repros, disc rot and a guy named ' + NP.RIVAL.name + '.</li>' +
      (NP.Walk ? '<li>The swap meet is on foot. Walking the aisles uses daylight too.</li>' : '') +
      '<li>Weather matters. Heat burns daylight faster. Rain keeps the crowds (and Dex) away.</li>' +
      (DEMO ? '<li>The demo ends when you leave the Saguaro Swap Meet. The full version runs all the way to sundown.</li>' +
        '<li>Go home, shelve your haul, share The Screenshot.</li></ul></details>'
        : '<li>Sellers remember you. So does the guy you lowballed.</li>' +
        '<li>Go home, shelve your haul, share The Screenshot. Your first run each day stays on your home shelf.</li></ul></details>') +
      (today ? '<div class="scores">Today\'s first run: <b>' + today.score + '</b> (' + esc(today.title) + ')</div>' : '') +
      (best ? '<div class="scores">Best ever: <b>' + best.score + '</b></div>' : '') +
      (home.length && !DEMO ? '<div class="scores">Home shelf: ' + home.length + ' finds</div>' : '') +
      (DEMO ? fullGameLine() : '') +
      (!store.ok ? '<div class="savewarn">This browser is not letting the game save. Everything still plays, but your progress will be gone when you close the page.</div>' : '') +
      '<div class="foot">A parody. Every game, console, store and company in here is made up.</div>' +
      '</div>';
    if (tv) NP.Intro.title($('#tvcv'), { skip: cartOpen, demo: DEMO, adFree: function () { return adFree; }, look: getLook(), onStart: showCart });
    else NP.drawLogo($('#logo'), adFree);
  }

  // ---------- the home shelf: your first run of every day, kept ----------
  var shelfBack = null;
  function saveHomeShelf(R) {
    var home = store.get('home', []) || [];
    R.lines.forEach(function (l) {
      var b = l.it; if (!b) return;
      var tag = b.kind === 'grail' ? 'GRAIL' : b.kind === 'merch' ? 'MERCH' : l.pts < 0 ? (l.note.indexOf('shelf') >= 0 ? 'DUPE' : 'REPRO') : '';
      home.push({ d: S.seed, id: b.id, t: b.t, p: b.p, cond: b.cond === 'sealed' && b.decision === 'open' ? 'cib' : b.cond, kind: b.kind, tag: tag, sticker: !!b.sticker });
    });
    if (home.length > 600) home = home.slice(home.length - 600);
    store.set('home', home);
  }
  function renderHomeShelf() {
    var home = store.get('home', []) || [];
    var days = [], byDay = {};
    for (var i = home.length - 1; i >= 0; i--) {
      var r = home[i];
      if (!byDay[r.d]) { byDay[r.d] = []; days.push(r.d); }
      byDay[r.d].unshift(r);
    }
    var h = '<div class="screen shelfscr"><h2>&#127968; Your Home Shelf</h2>' +
      '<div class="shelfnote">' + home.length + ' finds from ' + days.length + ' Saturday' + (days.length === 1 ? '' : 's') + '. Only your first run each day goes on the shelf. Replays are just for fun.</div>';
    if (!home.length) h += '<div class="bubble big">The shelf is empty. Somewhere out there, a yard sale is starting without you.</div>';
    days.slice(0, 40).forEach(function (d) {
      var sum = store.get('day_' + d, null);
      h += '<div class="hs-day"><div class="hs-lab">Saturday #' + (/^\d{4}-\d{2}-\d{2}$/.test(d) ? runNumber(d) : '?') + ' &middot; ' + esc(d) +
        (sum ? ' &middot; ' + sum.score + ' pts &middot; "' + esc(sum.title) + '"' : '') + '</div><div class="hs-row">';
      byDay[d].forEach(function (rec, k) {
        h += '<button class="hs-it" title="' + esc(rec.t) + '" data-act="hsname" data-name="' + esc(rec.t + (rec.tag ? ' (' + rec.tag.toLowerCase() + ')' : '')) + '"><span data-hs="' + esc(d) + '|' + k + '"></span>' + (rec.tag ? '<b class="hs-tag t-' + rec.tag.toLowerCase() + '">' + rec.tag + '</b>' : '') + '</button>';
      });
      h += '</div></div>';
    });
    if (days.length > 40) h += '<div class="shelfnote">Plus ' + (days.length - 40) + ' older Saturdays. They are in the garage.</div>';
    if (home.length) h += '<div class="hs-cap" id="hscap">Tap any game to see what it is.</div>';
    h += '<div class="btns center"><button class="big" data-act="shelfback">Back</button></div></div>';
    app.innerHTML = h;
    document.querySelectorAll('[data-hs]').forEach(function (el) {
      var p = el.getAttribute('data-hs').split('|'), rec = byDay[p[0]][+p[1]];
      if (rec) el.appendChild(NP.makeArt({ kind: rec.kind, id: rec.id, p: rec.p, cond: rec.cond, sticker: rec.sticker }, 2));
    });
    window.scrollTo(0, 0);
  }

  // ---------- How to play: the fridge list and the tips, on one short screen ----------
  function renderHowTo() {
    music('title');
    var touch = coarse();
    var h = '<div class="screen howto-scr"><h2>How to play</h2>' +
      '<div class="howto-grid"><div class="todo"><div class="todo-h">Saturday to-do</div><ul>' +
      (NP.GOALS ? NP.GOALS(DEMO) : []).map(function (g, i, a) { return '<li' + (i === a.length - 1 ? ' class="dex"' : '') + '>' + esc(g) + '</li>'; }).join('') + '</ul></div>' +
      '<ul class="howto-tips">' +
      '<li><b>Getting around.</b> Pick a stop on the map. Driving costs daylight. ' + (touch ? 'At the swap meet, drag the pad to walk and tap A at a table.' : 'At the swap meet, walk with the arrow keys or WASD and press Space at a table.') + '</li>';
    ['offers', 'pricey', 'dupe', 'dex'].forEach(function (k) {
      var T = NP.TIPS && NP.TIPS[k]; if (!T) return;
      h += '<li><b>' + esc(T.h) + (/[.?!]$/.test(T.h) ? '' : '.') + '</b> ' + esc(T.short) + '</li>';
    });
    h += '</ul></div><div class="btns center"><button class="big" data-act="howback">Back</button></div></div>';
    app.innerHTML = h;
    window.scrollTo(0, 0);
  }

  function stopIcon(t) {
    return { yard: '&#127968;', sports: '&#127944;', thrift: '&#128717;', flea: '&#9978;', pawn: '&#128176;', gift: '&#11088;' }[t] || '';
  }
  function stopBlurb(s) {
    return {
      yard: 'Cheap. Untested. Bring a flashlight.',
      sports: 'Rumor has it there is a whole bin of football games.',
      thrift: 'Shelves, carts, and one locked case.',
      flea: 'Big. Lots of vendors. Lots of opinions.',
      pawn: 'Pricey, but everything is tested and works.',
      gift: 'MUST SEE! Official merch! Nothing here helps your shelf!'
    }[s.type];
  }

  function renderMap() {
    if (!S.mapTracked) { S.mapTracked = true; track('map_open'); }
    var h = hud() + '<div class="screen map"><h2>Where to next?</h2>';
    if (S.toast) { h += '<div class="toast">' + esc(S.toast) + '</div>'; S.toast = ''; }
    if (S.wx && S.wx.id !== 'sunny' && S.time === START) h += '<div class="wxnote wx-' + S.wx.id + '">' + S.wx.icon + ' ' + S.wx.temp + '&deg;F. ' + esc(S.wx.blurb) + sponsorLine(S.wx, true) + '</div>';
    if (DEMO) h += '<div class="demonote">DEMO SATURDAY: three stops are open. The demo ends when you leave the Saguaro Swap Meet, so hit the others first if you want them.</div>';
    h += '<div class="shelfnote">Your shelf at home: about ' + S.day.shelfCount + ' games. You remember maybe half of them.</div><div class="stops">';
    S.day.stops.forEach(function (s) {
      if (s.locked) {
        h += '<div class="stopcard locked ' + s.type + '"><div class="st-h"><span class="ico">' + stopIcon(s.type) + '</span> ' + esc(s.name) + '</div>' +
          '<div class="st-b">' + esc(stopBlurb(s)) + '</div><div class="sticker">FULL VERSION, SOLD SEPARATELY</div></div>';
        return;
      }
      var c = costOf(s), arrive = S.time + c;
      var tooLate = arrive > END;
      var cls = 'stopcard ' + s.type + (s.visited ? ' done' : '') + (tooLate && !s.visited ? ' late' : '');
      var gp = s.gift ? Math.round(10 + adLevel() * 15) : 0;
      h += '<div class="' + cls + '"><div class="st-h"><span class="ico">' + stopIcon(s.type) + '</span> ' + esc(s.name) + '</div>' +
        '<div class="st-b">' + esc(stopBlurb(s)) + (s.gift && adLevel() >= 2 ? ' Prices up ' + gp + '% since this morning!' : '') + '</div>' +
        '<div class="st-m">' + c + ' min' + (c > Math.min(DRIVE_CAP, s.cost) ? ' (heat)' : '') + ' &middot; arrive ' + fmtTime(arrive) + '</div>';
      if (S.day.featured && S.day.featured.stopId === s.id && !s.visited) h += '<div class="featured">&#9733; Today\'s featured lot is here. ' + money(S.day.featured.ask) + '.</div>';
      var mc = !s.visited ? memCard(s) : '';
      if (mc) h += '<div class="mem">' + esc(mc) + '</div>';
      if (s.rumor && !s.visited) h += '<div class="rumor">' + NP.RIVAL.name + '\'s van was spotted heading here around ' + fmtTime(s.rivalAt) + '.</div>';
      if (s.demoRaid && !s.visited) h += '<div class="rumor">' + NP.RIVAL.name + '\'s van is headed here too. He will show up right after you do.</div>';
      if (s.visited) h += '<div class="st-done">Visited</div>';
      else if (tooLate) h += '<div class="st-done">Not enough daylight</div>';
      else h += '<button data-act="go" data-id="' + s.id + '"' + (s.gift ? ' class="giftbtn"' : '') + '>' + (s.gift ? 'Visit the Gift Shop!' : 'Drive there') + '</button>';
      h += '</div>';
    });
    h += '</div><button class="big home" data-act="gohome">Head home and shelve it</button></div>';
    app.innerHTML = h;
  }

  function itemNotes(it) {
    var n = [];
    if (it.featured) n.push(DEMO ? 'The featured lot. In the full version, there is a new one every day.' : 'Today\'s featured lot. Everyone playing today sees this exact box.');
    if (it.planted && !it.inspected) n.push('Complete in box for that price? That seems very generous.');
    if (it.kind === 'merch') n.push('Official Nostalgia Pro merch. Worth nothing. Costs something.');
    if (it.tested) n.push('Tested. Works. Guaranteed.');
    if (it.special) n.push('"That\'s the \'97. The good one."');
    if (it.inspected) {
      var f = it.flags, said = false;
      if (it.tell) {
        if (f.repro) { n.push('The label is suspiciously shiny. Font looks off.'); said = true; }
        if (f.damaged) { n.push('Disc scratched like an ice rink.'); said = true; }
        if (f.reseal) { n.push('The shrink wrap has a weird seam on the back.'); said = true; }
      }
      if (f.noManual) { n.push('No manual inside.'); said = true; }
      if (!said) n.push(it.cond === 'sealed' ? 'Wrap looks factory. Probably.' : 'Looks legit to you.');
    }
    if (it.checked) n.push(S.day.owned[it.id] || boughtAlready(it.id) ? 'ON THE SHELF ALREADY.' : 'Not on your shelf.');
    return n;
  }
  function boughtAlready(id) { return S.bag.some(function (b) { return b.id === id; }); }

  function condLabel(it) {
    if (it.kind === 'lot') return 'Blind lot';
    if (it.kind === 'merch') return 'Merch';
    if (it.kind === 'grail') return 'Complete in box';
    return { loose: 'Loose', cib: 'Complete in box', sealed: 'Sealed' }[it.cond];
  }

  function offers(it) {
    var lo = Math.max(1, Math.round(it.ask * 0.5)), fa = Math.max(1, Math.round(it.ask * 0.75));
    return [['lowball', 'Lowball', lo], ['fair', 'Fair', fa], ['full', 'Full price', it.ask]];
  }

  // the tag and one-line description you see when you look at an item (data.js)
  function reproKnown(it) { return !!(it.flags && it.flags.repro && it.inspected && it.tell); }
  function tagHTML(it, repro) {
    if (!NP.itemInfo) return '';
    var inf = NP.itemInfo(it, { repro: repro });
    return '<div class="it-d"><span class="tag t-' + inf.tag + '">' + esc(inf.label) + '</span> ' + esc(inf.d) + '</div>';
  }
  function tagPill(it, repro) {
    if (!NP.itemInfo) return '';
    var inf = NP.itemInfo(it, { repro: repro });
    return '<span class="tag t-' + inf.tag + '">' + esc(inf.label) + '</span>';
  }

  function itemCard(it, s) {
    var plat = NP.PLATFORMS[it.p];
    var sellerName = NP.SELLERS[it.seller] ? NP.SELLERS[it.seller].name : '';
    var h = '<div class="item ' + it.state + '" id="card-' + it.uid + '"><div class="artbox" data-art="' + it.uid + '"></div><div class="info">' +
      '<div class="it-t">' + esc(it.t) + '</div>' + tagHTML(it, reproKnown(it)) +
      '<div class="it-p">' + (it.kind === 'game' || it.kind === 'grail' ? esc(plat.name) + ' &middot; ' : '') + '<span class="pill ' + it.cond + '">' + condLabel(it) + '</span></div>' +
      '<div class="it-a">Asking <b>' + money(it.ask) + '</b>' + (s.type === 'flea' && sellerName ? ' <span class="who">(' + esc(sellerName) + ')</span>' : '') + '</div>';
    itemNotes(it).forEach(function (n) { h += '<div class="note' + (/ALREADY/.test(n) ? ' warn' : '') + '">' + esc(n) + '</div>'; });
    if (it.line) h += '<div class="bubble">' + esc(it.line) + '</div>';
    if (it.state === 'avail') {
      h += '<div class="btns">';
      offers(it).forEach(function (o) {
        h += '<button class="offer ' + o[0] + '" data-act="offer" data-kind="' + o[0] + '" data-uid="' + it.uid + '"' + (o[2] > S.cash ? ' disabled' : '') + '>' + o[1] + ' ' + money(o[2]) + '</button>';
      });
      h += '</div><div class="btns small">';
      if (it.kind === 'game' && !it.inspected && !it.tested) h += '<button data-act="inspect" data-uid="' + it.uid + '">Inspect (5 min)</button>';
      if (it.kind === 'game' && !it.checked) h += '<button data-act="check" data-uid="' + it.uid + '">Is it on the shelf? (10 min)</button>';
      h += '</div>';
    } else if (it.state === 'sold') h += '<div class="stamp">IN THE BAG ' + money(it.paid) + '</div>';
    else if (it.state === 'pulled') h += '<div class="stamp bad">OFF THE TABLE</div>';
    else if (it.state === 'gone') h += '<div class="stamp bad">' + esc(NP.RIVAL.name.toUpperCase()) + ' GOT IT</div>';
    h += '</div></div>';
    return h;
  }

  function renderStop() {
    var s = S.stop;
    var seller = NP.SELLERS[s.seller];
    var h = hud() + '<div class="screen stop"><h2>' + stopIcon(s.type) + ' ' + esc(s.name) + '</h2>';
    if (s.cleared) h += '<div class="rival">' + NP.RIVAL.name + ' from ' + NP.RIVAL.shop + ' beat you here. He took the good stuff and set up a table out front.</div>';
    if (seller && s.hello) h += '<div class="bubble big">' + esc(seller.name) + ': "' + esc(s.hello) + '"</div>';
    if (s.type === 'flea') h += '<div class="bubble big">Different vendor at every table. Some of them know what they got.</div>';
    if (adLevel() >= 2) h += '<div class="poster">' + (adFree ? 'POSTER: The Ad-Free Edition. No posters. (Except this one.)' : 'POSTER: Nostalgia Pro: The Shelf Dust. Now in Sealed. Gift Shop open till sundown.') + '</div>';
    if (S.toast) { h += '<div class="toast">' + esc(S.toast) + '</div>'; S.toast = ''; }
    h += '<div class="items">';
    s.items.forEach(function (it) { h += itemCard(it, s); });
    if (s.dug) s.dig.forEach(function (it) { h += itemCard(it, s); });
    h += '</div>';
    if (s.rivalTable && s.rivalTable.length) {
      h += '<h3>' + NP.RIVAL.shop + ' table (flipped merch)</h3><div class="items">';
      s.rivalTable.forEach(function (it) { h += itemCard(it, s); });
      h += '</div>';
    }
    h += '<div class="stop-actions">';
    if (s.dig.length && !s.dug) h += '<button data-act="dig">' + (s.type === 'sports' ? 'Dig deeper into the football bin' : 'Dig through the back boxes') + ' (15 min)</button>';
    h += '<button class="big" data-act="leave">Back in the car</button></div></div>';
    app.innerHTML = h;
    drawArts();
  }

  function giftPrice(m) { return Math.round(m.price * (1 + 0.15 * adLevel()) * (1 + (S.time - START) / 600)); }

  // shared by the Gift Shop stop and the booth inside the swap meet
  function giftHTML(booth) {
    var h = '<div class="bubble big">' + (booth ? 'Welcome to our Swap Meet Location! Same official merch, same zero shelf value, now closer to the churros.' : 'Welcome! Everything here is official, overpriced, and worth zero on your shelf. Enjoy!') + '</div>' +
      '<div class="giftnote">Prices go up as the day goes on. Each purchase costs you 10 points. ' + (adFree ? 'Ad-Free Edition owners pay the same, plus a small Ad-Free fee of $0.' : '') + '</div>';
    h += '<div class="items">';
    NP.MERCH.forEach(function (m) {
      var p = giftPrice(m);
      var got = S.bag.some(function (b) { return b.id === m.id && b.fromGift; });
      h += '<div class="item gift' + (got ? ' sold' : '') + '"><div class="artbox" data-art="g' + m.id + '"></div><div class="info"><div class="it-t">' + esc(m.t) + '</div>' + tagHTML({ kind: 'merch', id: m.id }) +
        '<div class="it-a">Price <b>' + money(p) + '</b></div>' +
        (got ? '<div class="stamp">IN THE BAG</div>' : '<div class="btns"><button class="offer full" data-act="buygift" data-id="' + m.id + '"' + (p > S.cash ? ' disabled' : '') + '>Buy it ' + money(p) + '</button></div>') + '</div></div>';
    });
    return h + '</div>';
  }
  function drawGiftArts() {
    NP.MERCH.forEach(function (m) {
      var el = document.querySelector('[data-art="g' + m.id + '"]');
      if (el && !el.firstChild) el.appendChild(NP.makeArt({ kind: 'merch', id: m.id }, 3));
    });
  }

  function renderGift() {
    var h = hud() + '<div class="screen gift"><h2>&#11088; ' + esc(S.stop.name) + ' &#11088;</h2>';
    if (S.toast) { h += '<div class="toast">' + esc(S.toast) + '</div>'; S.toast = ''; }
    h += giftHTML(false);
    h += '<div class="stop-actions"><button class="big" data-act="leave">Leave the Gift Shop (it wants you to stay)</button></div></div>';
    app.innerHTML = h;
    drawGiftArts();
  }

  function findItem(uid) {
    var s = S.stop;
    var all = s.items.concat(s.dig, s.rivalTable || []);
    for (var i = 0; i < all.length; i++) if (all[i].uid === uid) return all[i];
    return null;
  }
  function drawArts() {
    document.querySelectorAll('[data-art]').forEach(function (el) {
      var it = findItem(el.getAttribute('data-art'));
      if (it && !el.firstChild) el.appendChild(NP.makeArt(it, 3));
    });
  }

  // ---------- actions ----------
  // heat makes everything cost more daylight; fractions carry over so walking minutes add up right
  function spend(min) {
    var t = min * (S.wx ? S.wx.mult : 1) + (S.tfrac || 0);
    var whole = Math.floor(t + 1e-9);
    S.tfrac = t - whole;
    S.time += whole;
  }
  function outOfTime() { return S.time >= END; }

  function checkSundown() {
    if (outOfTime()) {
      S.time = Math.min(S.time, END);
      S.toast = 'The sun is going down. Time to head home.';
      goHome();
      return true;
    }
    return false;
  }

  function arrive(s) {
    S.time += costOf(s); // the drive, same minutes the map card showed
    s.visited = true;
    S.stop = s;
    S.screen = 'stop';
    if (s.seller && NP.SELLERS[s.seller]) s.hello = helloFor(s.seller) || NP.SELLERS[s.seller].hi[s.id.charCodeAt(1) % NP.SELLERS[s.seller].hi.length];
    if (s.rivalAt && S.time >= s.rivalAt) {
      // rival cleared the best stuff
      s.cleared = true; S.ev.rivalHits++;
      var sorted = s.items.concat(s.dig).filter(function (i) { return i.kind === 'game' || i.kind === 'lot'; }).sort(function (a, b) { return b.ask - a.ask; });
      sorted.slice(0, 3).forEach(function (i) { i.state = 'gone'; });
      dexSetup(s);
    }
    // demo: Dex always shows up a few minutes after you do (walk.js also brings him in after 45 real seconds)
    if (DEMO && s.demoRaid) s.rivalAt = S.time + 12;
    track('stop_' + s.type + '_enter');
    if (s.type === 'flea') track('swapmeet_enter');
    // the swap meet is walkable
    if (s.type === 'flea' && NP.Walk && NP.Char) {
      S.screen = 'walk';
      NP.Walk.enter(s);
      S.toast = s.cleared ? NP.RIVAL.name + ' from ' + NP.RIVAL.shop + ' beat you here. He took the good stuff and set up a table by the fence.'
        : s.demoRaid ? NP.RIVAL.name + '\'s van is a few minutes behind you. Grab the good stuff first.' : '';
    }
  }

  // Dex sets up his table of flipped merch
  function dexSetup(s) {
    var r = mulberry32(NP.hashStr(S.seed + s.id + 'dex'));
    s.rivalTable = shuffle(r, NP.MERCH).slice(0, 2).map(function (m) {
      return { uid: 'dx' + m.id + s.id, id: m.id, t: m.t + ' (flipped)', p: 'k16', kind: 'merch', ask: Math.round(m.price * 2.5), minFrac: 0.9, seller: 'firm', state: 'avail', flags: {}, line: '', base: 0, cond: 'loose' };
    });
  }

  function sellerLine(it, key) {
    var sl = NP.SELLERS[it.seller] || NP.SELLERS.friendly;
    if (it.uid.indexOf('dx') === 0) return key === 'yes' ? 'Pleasure. Tell your followers.' : 'That is a collector\'s item now. Market rate.';
    var arr = sl[key] || sl.no;
    var line = arr[(S.pitchN++) % arr.length];
    if (adLevel() >= 3 && S.pitchN % 2 === 0) {
      var pool = adFree ? NP.PITCHES_ADFREE : NP.PITCHES;
      line += ' ' + pool[S.pitchN % pool.length];
    }
    return line;
  }

  function doOffer(it, kind) {
    var o = offers(it).filter(function (x) { return x[0] === kind; })[0];
    var price = o[2];
    if (price > S.cash) return;
    spend(T_HAGGLE);
    var sl = NP.SELLERS[it.seller] || {};
    var frac = price / it.ask;
    if (frac + 1e-6 >= it.minFrac || kind === 'full') {
      S.cash -= price; it.paid = price; it.state = 'sold'; it.line = sellerLine(it, 'yes');
      var b = JSON.parse(JSON.stringify(it)); b.paid = price; b.stopType = S.stop.type;
      if (S.day.owned[b.id] || boughtAlready(b.id)) S.ev.dupBuys++;
      if (it.special || (NP.SPORTS.some(function (x) { return x.id === it.id; }) && price >= 20)) S.ev.sportsOverpay = Math.max(S.ev.sportsOverpay, price);
      S.bag.push(b);
      sfx('cash'); sfx('accept');
      if (price < it.ask) track('haggle_win');
      if (it.flags && it.flags.repro) track('repro_bought');
      // they will remember this
      if (it.uid.indexOf('dx') !== 0) {
        if (it.seller === 'grandma' || it.seller === 'kid' || it.seller === 'firm') remember(it.seller, 'pal');
        if (it.seller === 'ikwig' && kind === 'full' && S.rem.ikwig && S.rem.ikwig.mad) { remember('ikwig', 'square'); it.line = 'Full price. Fine. We\'re square now.'; }
        if (S.ev.sportsOverpay >= 20) remember('sports', 'sucker');
      }
    } else if (kind === 'lowball' && sl.touchy) {
      it.state = 'pulled'; it.line = S.rem.ikwig && S.rem.ikwig.mad ? 'AGAIN? Unbelievable. Off the table. I will remember this too.' : sl.mad[0]; S.ev.offended++;
      remember('ikwig', 'mad');
      sfx('reject');
    } else {
      it.line = sellerLine(it, 'no');
      sfx('reject');
    }
    if (!checkSundown()) { render(); maybeUnsponsored(); }
  }

  // Every so often, haggling is interrupted by a completely unsponsored moment.
  // Never on the first offer, at most twice a run, and the first one is guaranteed by the fifth offer.
  function maybeUnsponsored() {
    S.haggles = (S.haggles || 0) + 1;
    var shown = S.unsp || 0;
    if (shown >= 2 || !NP.Intro || !NP.Intro.unsponsored) return;
    var chance = shown === 0 ? (S.haggles >= 5 ? 1 : S.haggles >= 2 ? 0.2 : 0) : 0.06;
    if (Math.random() >= chance) return;
    S.unsp = shown + 1;
    track('unsponsored_moment');
    NP.Intro.unsponsored({ adFree: adFree });
  }

  // ---------- one-time tips ----------
  // Each tip shows once, ever (saved with the rest of the game), and reading one costs no daylight.
  // Shop tips wait for the item they explain to be on screen and sit beside its buttons, not on top of them.
  // After you dismiss one, the next waits for your next move, so they never stack up.
  var tipEl = null, tipAnchor = null, tipWait = false, tipQueue = [], tipFocus = null, tipTimer = null;
  function tipsSeen() { return store.get('tips', {}) || {}; }
  // "Don't show tips": one switch for the tip boxes and the loading screen tips. Saved, so it sticks on later visits.
  var tipsOff = !!store.get('tipsOff', false);
  var TIPOFF_BOX = '<label class="tipoff"><input type="checkbox" class="tipoff-in"> Don\'t show tips</label>';
  function tipsButton() { return '<button class="fsbtn tipsbtn" data-act="tips" aria-pressed="' + (tipsOff ? 'false' : 'true') + '">Tips: ' + (tipsOff ? 'off' : 'on') + '</button>'; }
  function setTipsOff(v) {
    tipsOff = !!v; store.set('tipsOff', tipsOff);
    if (tipsOff) { tipQueue = []; track('tips_off'); }
    document.querySelectorAll('[data-act="tips"]').forEach(function (b) { b.textContent = 'Tips: ' + (tipsOff ? 'off' : 'on'); b.setAttribute('aria-pressed', tipsOff ? 'false' : 'true'); });
    document.querySelectorAll('.tipoff-in').forEach(function (i) { i.checked = tipsOff; });
  }
  NP.tipsOff = function () { return tipsOff; };
  function tipOpen() { return !!tipEl; }
  function insets() {
    var pr = document.getElementById('saprobe');
    if (!pr) { pr = document.createElement('div'); pr.id = 'saprobe'; pr.className = 'sa-probe'; document.body.appendChild(pr); }
    var cs = getComputedStyle(pr);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }
  function placeTip() {
    if (!tipEl) return;
    var ins = insets(), vw = window.innerWidth, vh = window.innerHeight, pad = 8;
    var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var minL = ins.l + pad, maxL = vw - ins.r - pad - w, minT = ins.t + pad, maxT = vh - ins.b - pad - h;
    var left = (vw - w) / 2, top = minT + 56, below = false;
    var a = tipAnchor && document.body.contains(tipAnchor.el) ? tipAnchor.el.getBoundingClientRect() : null;
    if (a && tipAnchor.inside) { top = Math.max(minT, a.top + a.height * 0.3); left = a.left + (a.width - w) / 2; }
    else if (a) {
      left = a.left + (a.width - w) / 2;
      var maxR = vw - ins.r - pad, side = a.right + 10 + w <= maxR || a.left - 10 - w >= minL;
      // tips about the last buttons on a card try below, then beside, before going above (where the offers are)
      if (tipAnchor.below && a.bottom + 10 <= maxT) { top = a.bottom + 10; below = true; }
      else if (!(tipAnchor.below && side) && a.top - h - 10 >= minT) top = a.top - h - 10;
      else if (a.bottom + 10 <= maxT) { top = a.bottom + 10; below = true; }
      else if (side) {
        // short screen: beside the button instead
        left = a.right + 10 + w <= maxR ? a.right + 10 : a.left - 10 - w;
        top = a.top + a.height / 2 - h / 2;
      } else {
        // no clean spot: whichever end of the screen covers less of it
        var upOver = Math.max(0, Math.min(a.bottom, minT + h) - Math.max(a.top, minT));
        var dnOver = Math.max(0, Math.min(a.bottom, maxT + h) - Math.max(a.top, maxT));
        top = upOver <= dnOver ? minT : maxT;
      }
    }
    tipEl.style.left = Math.round(Math.max(minL, Math.min(maxL, left))) + 'px';
    tipEl.style.top = Math.round(Math.max(minT, Math.min(maxT, top))) + 'px';
    tipEl.classList.toggle('below', below);
  }
  function showTip(key, anchor) {
    var T = NP.TIPS && NP.TIPS[key];
    if (!T || tipsOff) return false;
    var seen = tipsSeen();
    if (seen[key]) return false;
    if (tipEl) { if (tipQueue.indexOf(key) < 0) tipQueue.push(key); return false; }
    seen[key] = true; store.set('tips', seen);
    tipAnchor = anchor || null;
    tipFocus = document.activeElement;
    tipEl = document.createElement('div');
    tipEl.className = 'tipbox';
    tipEl.setAttribute('role', 'dialog'); tipEl.setAttribute('aria-live', 'polite');
    tipEl.innerHTML = '<div class="tip-k">TIP</div><div class="tip-h">' + esc(T.h) + '</div><div class="tip-b">' + esc(T.b) + '</div>' +
      '<div class="tip-row">' + TIPOFF_BOX + '<button class="tip-x" data-tip="ok">Got it</button></div>';
    document.body.appendChild(tipEl);
    placeTip();
    sfx('sparkle');
    var b = tipEl.querySelector('.tip-x');
    try { b.focus({ preventScroll: true }); } catch (e) {}
    return true;
  }
  function closeTip() {
    if (!tipEl) return;
    if (tipEl.parentNode) tipEl.parentNode.removeChild(tipEl);
    tipEl = null; tipAnchor = null; tipWait = true;
    if (tipFocus && document.body.contains(tipFocus)) { try { tipFocus.focus({ preventScroll: true }); } catch (e) {} }
    else { var cv = document.getElementById('walkcv'); if (cv) { try { cv.focus({ preventScroll: true }); } catch (e) {} } }
    tipFocus = null;
    // Dex does not wait for your next move, so his tip does not either
    var q = tipsOff ? null : tipQueue.shift();
    if (q === 'dex') showTip('dex', dexAnchor());
  }
  function dexAnchor() { var cv = document.getElementById('walkcv'); return cv ? { el: cv, inside: true } : null; }
  function inView(el) {
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    // enough of it is showing to point at (the tip goes above it, or below it if there is no room)
    return r.top >= 0 && r.top <= window.innerHeight - 30 && r.left >= 0 && r.right <= window.innerWidth;
  }
  // which shop tip fits what is on screen right now
  function checkTips() {
    if (tipsOff || tipEl || tipWait || !S || (S.screen !== 'stop' && S.screen !== 'walk') || !S.stop) return;
    if (document.querySelector('.unsp, .crt-overlay, .loading-ov')) return;
    var seen = tipsSeen();
    var cards = Array.prototype.slice.call(document.querySelectorAll('.item[id^="card-"]')).filter(function (c) { return !c.closest('[hidden]'); });
    var rules = [
      ['offers', function (it, c) { return c.querySelector('.btns'); }],
      ['pricey', function (it, c) { return it.kind === 'game' && it.ask >= 20 && c.querySelector('[data-act="inspect"]') ? c.querySelector('.btns.small') : null; }],
      ['dupe', function (it, c) { return it.kind === 'game' && (S.day.owned[it.id] || boughtAlready(it.id)) && c.querySelector('[data-act="check"]') ? c.querySelector('.btns.small') : null; }]
    ];
    for (var i = 0; i < rules.length; i++) {
      if (seen[rules[i][0]]) continue;
      for (var j = 0; j < cards.length; j++) {
        var it = findItem(cards[j].id.slice(5));
        if (!it || it.state !== 'avail') continue;
        var el = rules[i][1](it, cards[j]);
        // the offers tip goes above the offer buttons; the Inspect and shelf tips go under the last buttons on the card
        if (el && inView(el)) { showTip(rules[i][0], { el: el, below: i > 0 }); return; }
      }
    }
  }
  function soonCheckTips() { if (tipTimer) clearTimeout(tipTimer); tipTimer = setTimeout(function () { tipTimer = null; checkTips(); }, 220); }
  if (window.MutationObserver) new MutationObserver(soonCheckTips).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('scroll', function () { if (tipEl) placeTip(); else soonCheckTips(); }, true);
  window.addEventListener('resize', function () { if (tipEl) placeTip(); });
  // your next move (any tap or key that is not on the tip) lets the next tip through
  function moved() { if (tipWait) { tipWait = false; soonCheckTips(); } }
  window.addEventListener('pointerdown', function (e) { if (!e.target.closest || !e.target.closest('.tipbox')) moved(); }, true);
  window.addEventListener('wheel', moved, { passive: true, capture: true });
  window.addEventListener('keydown', function (e) {
    if (tipEl) {
      if (e.target && e.target.closest && e.target.closest('.tipoff') && e.code !== 'Escape') return; // Space ticks the box, Tab moves on
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopImmediatePropagation(); closeTip(); }
      return;
    }
    moved();
  }, true);
  document.addEventListener('click', function (e) { if (tipEl && e.target.closest && e.target.closest('.tipbox') && !e.target.closest('.tipoff')) closeTip(); });

  function buyGift(id) {
    var m = NP.MERCH.filter(function (x) { return x.id === id; })[0];
    var p = giftPrice(m);
    if (p > S.cash) return;
    S.cash -= p; S.ev.giftSpent += p;
    S.bag.push({ uid: 'gift' + id, id: m.id, t: m.t, kind: 'merch', paid: p, fromGift: true, p: 'k16', flags: {}, cond: 'loose', base: 0 });
    S.toast = 'Thank you for your purchase! It is worth nothing!';
    sfx('cash');
    render();
  }

  function leaveStop() {
    var wasDemoEnd = DEMO && S.stop && S.stop.type === 'flea';
    S.screen = 'map';
    S.stop = null;
    S.visited++;
    if (wasDemoEnd) {
      // demo sundown: the demo Saturday ends when you leave the swap meet
      var wasMorning = S.time <= 12 * 60;
      if (wasMorning) S.time = 12 * 60;
      S.toast = (wasMorning ? 'It\'s noon. ' : '') + 'That\'s the demo! The demo Saturday ends at the swap meet. In the full version you can stay out till sundown (5:30 PM).';
      track('demo_end');
      goHome();
      return;
    }
    if (checkSundown()) return;
    if (S.visited === 2 || S.visited === 4) return showCommercial(render);
    render();
  }

  function goHome() {
    S.screen = 'home';
    S.bag.forEach(function (b) { if (b.cond === 'sealed' && !b.decision) b.decision = null; });
    showCommercial(render, true);
  }

  // ---------- commercials ----------
  var adTimer = null;
  function showCommercial(next, last) {
    var pool = adFree ? NP.ADFREE_ADS : NP.ADS;
    var ad = adFree ? pool[S.adsShown % pool.length] : pool[S.day.adOrder[S.adsShown % pool.length]];
    S.adsShown++;
    music(null); sfx('staticshort');
    var ov = document.createElement('div');
    ov.className = 'crt-overlay';
    ov.innerHTML = '<div class="tv"><div class="screen-crt"><canvas id="adcv" width="320" height="180"></canvas><div class="scan"></div></div>' +
      '<div class="tv-lab">' + (last ? 'ONE LAST WORD FROM OUR SPONSOR' : 'WE\'LL BE RIGHT BACK') + '</div>' +
      '<button class="skip" data-act="skipad">Skip ad &#9654;</button></div>';
    document.body.appendChild(ov);
    var cv = ov.querySelector('#adcv'), ctx = cv.getContext('2d');
    ctx.fillStyle = C.navy; ctx.fillRect(0, 0, 320, 180);
    for (var y = 0; y < 180; y += 4) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, y, 320, 1); }
    ctx.fillStyle = C.red; ctx.fillRect(0, 0, 320, 14); ctx.fillRect(0, 166, 320, 14);
    NP.pixelText(ctx, 'NOW ON SALE', 160, 4, 1, C.cream, 'center');
    var lines = NP.wrapPixel(ad.h, 2, 296);
    lines.forEach(function (l, i) { NP.pixelText(ctx, l, 160, 30 + i * 18, 2, C.cream, 'center'); });
    var y2 = 30 + lines.length * 18 + 8;
    NP.wrapPixel(ad.s, 1, 296).forEach(function (l, i) { NP.pixelText(ctx, l, 160, y2 + i * 10, 1, C.cyan, 'center'); });
    var fl = NP.wrapPixel(ad.f, 1, 300);
    fl.forEach(function (l, i) { NP.pixelText(ctx, l, 160, 150 - (fl.length - 1 - i) * 10, 1, C.cream, 'center'); });
    NP.drawItem(ctx, { kind: 'merch', id: 'ad' }, 144, 150 - (fl.length - 1) * 10 - 46, 1);
    NP.pixelText(ctx, 'NOSTALGIA PRO. ASK FOR IT BY NAME.', 160, 169, 1, C.cream, 'center');
    function close() { if (adTimer) clearTimeout(adTimer); adTimer = null; if (ov.parentNode) ov.parentNode.removeChild(ov); next(); }
    ov.querySelector('.skip').addEventListener('click', close);
    adTimer = setTimeout(close, 6000);
    if (window.__NP_TEST) window.__NP_TEST.closeAd = close;
  }

  // ---------- home ----------
  function renderHome() {
    var h = '<div class="screen homescr"><h2>&#127968; Home. Time to shelve it.</h2>';
    if (S.toast) { h += '<div class="toast">' + esc(S.toast) + '</div>'; S.toast = ''; }
    h += '<div class="shelfnote">Home at ' + fmtTime(Math.min(S.time, END)) + ' with ' + money(S.cash) + ' left and ' + S.bag.length + ' things in the bag.</div>';
    if (!S.bag.length) h += '<div class="bubble big">The bag is empty. Bold strategy.</div>';
    var pending = 0;
    h += '<div class="items">';
    S.bag.forEach(function (b) {
      h += '<div class="item"><div class="artbox" data-hart="' + b.uid + '"></div><div class="info"><div class="it-t">' + esc(b.t) + '</div>' + tagHTML(b, reproKnown(b)) +
        '<div class="it-p"><span class="pill ' + b.cond + '">' + condLabel(b) + '</span> paid ' + money(b.paid) + '</div>';
      if (b.kind === 'lot') {
        if (!b.opened) { pending++; h += '<div class="btns"><button data-act="openlot" data-uid="' + b.uid + '">Open the lot box</button></div>'; }
        else h += '<div class="note">Opened. Contents added to the pile.</div>';
      } else if (b.cond === 'sealed') {
        if (!b.decision) {
          pending++;
          h += '<div class="note">The eternal question.</div><div class="btns"><button data-act="seal" data-v="keep" data-uid="' + b.uid + '">Keep it sealed</button><button data-act="seal" data-v="open" data-uid="' + b.uid + '">Open it and play</button></div>';
        } else h += '<div class="note">' + (b.decision === 'keep' ? 'Staying sealed. Forever.' : 'Opened! You played it for an hour. Worth it.') + '</div>';
      }
      h += '</div></div>';
    });
    h += '</div>';
    h += '<button class="big" data-act="shelve"' + (pending ? ' disabled' : '') + '>' + (pending ? 'Decide on ' + pending + ' more first' : 'Put it all on the shelf') + '</button></div>';
    app.innerHTML = h;
    document.querySelectorAll('[data-hart]').forEach(function (el) {
      var b = S.bag.filter(function (x) { return x.uid === el.getAttribute('data-hart'); })[0];
      el.appendChild(NP.makeArt(b, 3));
    });
  }

  // ---------- scoring ----------
  function appraise() {
    var lines = [], score = 0, haul = 0, spent = BUDGET - S.cash;
    var seen = {}, titles = [];
    var items = [];
    S.bag.forEach(function (b) { if (b.kind === 'lot') { (b.contents || []).forEach(function (c) { c.fromLot = true; c.paid = 0; items.push(c); }); } else items.push(b); });
    var keptReseal = false, repro = false, dup = false, grail = false;
    items.forEach(function (b) {
      var v = 0, pts = 0, note = '';
      if (b.kind === 'merch') { pts = -10; note = 'Merch. Worth nothing. You knew that.'; }
      else if (b.kind === 'grail') { pts = 100; grail = true; note = 'GRAIL! You found the game in the game. Shelf label: currently playing.'; }
      else if (S.day.owned[b.id] || seen[b.id]) { pts = -15; dup = true; note = 'It was on the shelf. Now it is on the shelf twice.'; }
      else if (b.flags.repro) { pts = -10; repro = true; note = 'Repro. That label was way too shiny.'; }
      else {
        var base = b.base;
        if (b.cond === 'loose') { v = base; if (b.flags.damaged) { v = base * 0.15; note = NP.PLATFORMS[b.p].media === 'disc' ? 'Disc rot. It skips on the title screen.' : 'Dead save battery. Still counts. Barely.'; } }
        else if (b.cond === 'cib') { v = b.flags.noManual ? base * 1.4 : base * 2; note = b.flags.noManual ? 'Box, no manual. The manual was sold separately.' : 'Complete in box. Chef\'s kiss.'; }
        else if (b.cond === 'sealed') {
          if (b.decision === 'open') { v = base * 2; pts += 10; note = b.flags.reseal ? 'Opened it. Turns out it was resealed anyway. Good call.' : 'Opened a sealed copy. Collectors gasped. +10 joy.'; }
          else if (b.flags.reseal) { v = base; keptReseal = true; note = 'Kept sealed. Appraiser says: that is a reseal. Very nice shrink wrap though.'; }
          else { v = base * 3.2; note = 'Factory sealed and staying that way.'; }
        }
        if (!note) note = 'Good pickup.';
        pts += Math.round(v); haul += v;
      }
      if (b.kind === 'game' || b.kind === 'grail') seen[b.id] = true;
      if (b.fromLot) note = '(Lot box) ' + note;
      score += pts;
      lines.push({ t: b.t, note: note, pts: pts, it: b });
    });
    // set bonus
    var setFound = items.some(function (b) { return b.set === 'mf' && !b.flags.repro && !S.day.owned[b.id]; });
    var setDone = ['mf1', 'mf2', 'mf3'].every(function (id) { return S.day.owned[id] || items.some(function (b) { return b.id === id && !b.flags.repro; }); });
    var bonus = [];
    if (setFound && setDone) { score += 75; bonus.push(['Moon Ferret trilogy complete', 75]); }
    var cashPts = Math.floor(S.cash / 2);
    if (cashPts) { score += cashPts; bonus.push(['Cash left over (' + money(S.cash) + ')', cashPts]); }

    // run title, most embarrassing first
    if (grail) titles.push('Played Myself');
    if (S.ev.sportsOverpay >= 20) titles.push('Paid ' + money(S.ev.sportsOverpay) + ' for a Football Game');
    if (repro) titles.push('Proud Owner of a Repro');
    if (dup) titles.push('It Was On The Shelf');
    if (keptReseal) titles.push('Bought Some Very Nice Shrink Wrap');
    if (S.ev.giftSpent >= 25) titles.push('Fully Merchandised');
    if (S.ev.offended) titles.push('Insulted a Man Who Knows What He Got');
    if (S.ev.rivalHits >= 2) titles.push('Living Off ' + NP.RIVAL.name + '\'s Leftovers');
    if (setFound && setDone) titles.push('Moon Ferret Completionist');
    if (!S.bag.length) titles.push('Just Browsing, Thanks');
    if (score >= 250) titles.push('Swap Meet Wizard');
    if (S.cash >= 70 && S.bag.length) titles.push('Tightwad of the Flea Market');
    if (!titles.length) titles.push(score >= 150 ? 'A Very Solid Saturday' : 'Mostly Football Games');
    return { lines: lines, bonus: bonus, score: score, haul: Math.round(haul), spent: spent, title: titles[0], also: titles.slice(1, 3), items: items };
  }

  function renderResults() {
    var R = S.result;
    var h = '<div class="screen results"><h2>The Shelf</h2>' +
      '<div class="runtitle">"' + esc(R.title) + '"</div>' +
      (R.also.length ? '<div class="also">Also earned: ' + R.also.map(esc).join(' &middot; ') + '</div>' : '') +
      '<div class="bigscore">' + R.score + ' <small>points</small></div>' +
      '<div class="stats">Spent ' + money(R.spent) + ' &middot; Haul value ' + money(R.haul) + ' &middot; ' + R.items.length + ' items</div>' +
      '<div class="scores">' + esc(S.recordMsg || '') + '</div>' +
      featuredReveal() +
      '<canvas id="card" width="1200" height="675"></canvas>' +
      '<div class="btns center"><button class="big" data-act="download">Download Nostalgia Pro: The Screenshot</button><button data-act="copy">Copy result text</button>' +
      (DEMO ? '<button data-act="demoend">Continue &#9654;</button>' : '') + '</div>' +
      '<div class="appraisal"><h3>Appraisal</h3>';
    R.lines.forEach(function (l, i) {
      var rp = !!(l.it && l.it.kind === 'game' && l.it.flags && l.it.flags.repro);
      h += '<div class="al has-art"><span class="al-art" data-rart="' + i + '"></span><div class="al-body"><div class="al-row"><span class="al-t">' + esc(l.t) + '</span><span class="al-p ' + (l.pts < 0 ? 'neg' : '') + '">' + (l.pts > 0 ? '+' : '') + l.pts + '</span></div>' +
        (l.it ? '<div class="al-tag">' + tagPill(l.it, rp) + '</div>' : '') + '<div class="al-n">' + esc(l.note) + '</div></div></div>';
    });
    R.bonus.forEach(function (b) { h += '<div class="al bonus"><span class="al-t">' + esc(b[0]) + '</span><span class="al-p">+' + b[1] + '</span></div>'; });
    if (!R.lines.length) h += '<div class="al-n">Nothing to appraise. The shelf respects your restraint.</div>';
    h += '</div>' +
      (linksOk() ? '<div class="shirt"><div class="shirt-k">The only item in this game that actually exists:</div>' +
      '<a href="https://nostalgiapro-shop.fourthwall.com/" target="_blank" rel="noopener" data-track="shirt_link">Nostalgia Pro: The Actual Shirt &#8599;</a></div>' : '') +
      (DEMO ? '<div class="btns center"><button class="big" data-act="demoend">Continue &#9654;</button></div>' +
        '<div class="foot">That was the demo Saturday. Continue for what comes next.</div></div>'
        : '<div class="btns center"><button data-act="again">Replay today (just for fun)</button><button data-act="shelf">Home shelf</button><button data-act="totitle">Title screen</button></div>' +
        '<div class="foot">New Saturday at midnight, Phoenix time. thenostalgiapro.com</div></div>');
    app.innerHTML = h;
    document.querySelectorAll('[data-rart]').forEach(function (el) {
      var l = R.lines[+el.getAttribute('data-rart')];
      if (l && l.it) el.appendChild(NP.makeArt(l.it, 2));
    });
    drawCard($('#card'), R);
  }

  function featuredStatus() {
    var F = S.day.featured; if (!F) return '';
    return F.item.state === 'sold' ? 'bought it' : F.item.state === 'gone' ? NP.RIVAL.name + ' got it' : 'passed on it';
  }
  function featuredReveal() {
    var F = S.day.featured; if (!F) return '';
    return '<div class="reveal"><div class="rv-h">&#9733; Today\'s featured lot: ' + esc(F.name) + '</div>' +
      '<div class="rv-s">You ' + (F.item.state === 'sold' ? 'bought it.' : F.item.state === 'gone' ? 'were too slow. ' + esc(NP.RIVAL.name) + ' got it.' : 'passed on it. Here is what was inside:') + '</div>' +
      '<div class="rv-l">' + F.item.contents.map(function (c) { return esc(c.t) + (c.kind === 'game' ? ' (' + ({ loose: 'loose', cib: 'CIB', sealed: 'sealed' }[c.cond]) + ')' : ''); }).join(' &middot; ') + '</div></div>';
  }

  function drawCard(cv, R) {
    var ctx = cv.getContext('2d'), W = 1200, H = 675;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = C.navy; ctx.fillRect(0, 0, W, H);
    // header band
    ctx.fillStyle = C.red; ctx.fillRect(0, 0, W, 70);
    ctx.fillStyle = C.cyan; ctx.fillRect(0, 70, W, 6);
    NP.pixelText(ctx, 'NOSTALGIA PRO: THE SCREENSHOT', 40, 17, 5, C.cream);
    NP.pixelText(ctx, DEMO ? 'DEMO' : 'SATURDAY #' + S.runNo, W - 40, 26, 3, C.cream, 'right');
    // you, standing next to your score
    if (NP.Char) NP.Char.draw(ctx, getLook(), 'down', 0, W - 374, 100, 4);
    // title
    var tl = NP.wrapPixel('"' + R.title + '"', 6, 760);
    tl.forEach(function (l, i) { NP.pixelText(ctx, l, 40 + 4, 104 + 4 + i * 52, 6, C.ink); NP.pixelText(ctx, l, 40, 104 + i * 52, 6, C.gold); });
    var sy = 104 + tl.length * 52 + 8;
    NP.pixelText(ctx, 'SPENT ' + money(R.spent) + ' OF ' + money(BUDGET) + '   FINDS ' + R.items.length + '   HAUL ' + money(R.haul), 40, sy, 3, C.cyan);
    // score stamp
    ctx.fillStyle = C.ink; ctx.fillRect(W - 286, 96, 250, 120);
    ctx.fillStyle = C.gold; ctx.fillRect(W - 290, 92, 250, 120);
    ctx.fillStyle = C.navy; ctx.fillRect(W - 284, 98, 238, 108);
    NP.pixelText(ctx, 'SCORE', W - 165, 108, 3, C.cyan, 'center');
    NP.pixelText(ctx, String(R.score), W - 165, 140, String(R.score).length > 4 ? 6 : 8, C.cream, 'center');
    // best find
    var best = R.lines.filter(function (l) { return l.pts > 0 && l.it && l.it.kind !== 'merch'; }).sort(function (a, b) { return b.pts - a.pts; })[0];
    if (best) NP.pixelText(ctx, 'BEST FIND: ' + best.t.slice(0, 30), 40, sy + 36, 3, C.cream);
    if (S.day.featured) NP.pixelText(ctx, 'FEATURED LOT: ' + featuredStatus() + '    ' + S.wx.temp + (NP.FONT['°'] ? '°F' : 'F'), 40, sy + 66, 3, C.gold);
    // "No product placement was used in this run", printed right over a giant Nostalgia Pro logo
    var ly = sy + (S.day.featured ? 92 : best ? 62 : 32);
    ctx.globalAlpha = 0.3;
    NP.pixelText(ctx, 'NOSTALGIA PRO', W / 2 + 9, ly + 9, 12, C.red, 'center');
    NP.pixelText(ctx, 'NOSTALGIA PRO', W / 2, ly, 12, C.cream, 'center');
    ctx.globalAlpha = 1;
    var npMsg = 'NO PRODUCT PLACEMENT WAS USED IN THIS RUN', mw = NP.textWidth(npMsg, 3) + 32;
    ctx.fillStyle = 'rgba(11,16,34,.9)'; ctx.fillRect(W / 2 - mw / 2, ly + 25, mw, 35);
    ctx.fillStyle = C.gold; ctx.fillRect(W / 2 - mw / 2, ly + 25, mw, 3); ctx.fillRect(W / 2 - mw / 2, ly + 57, mw, 3);
    NP.pixelText(ctx, npMsg, W / 2, ly + 32, 3, C.cream, 'center');
    var shelfY = 540, items = R.lines.map(function (l) { return l.it; }).filter(function (b) { return b; });
    var bestIt = best ? best.it : null;
    var k = items.length <= 6 ? 5 : items.length <= 8 ? 4 : 3;
    // keep the haul clear of the logo and its banner, with room for the BEST FIND flag above it
    // (items may stand in front of the faded logo, just not the banner)
    var room = shelfY - (ly + 64) - (bestIt || items.some(function (b) { return b.kind === 'grail'; }) ? 38 : 0);
    k = Math.max(3, Math.min(k, Math.floor(room / 40)));
    var iw = 32 * k, gap = 14;
    var maxN = Math.floor((W - 80 + gap) / (iw + gap));
    var show = items.slice(0, maxN);
    if (bestIt && show.indexOf(bestIt) < 0 && show.length) show[show.length - 1] = bestIt; // the best find always makes the shelf
    ctx.fillStyle = '#6b4a2b'; ctx.fillRect(20, shelfY, W - 40, 18);
    ctx.fillStyle = '#8a5e36'; ctx.fillRect(20, shelfY, W - 40, 6);
    ctx.fillStyle = '#3e2a17'; ctx.fillRect(20, shelfY + 18, W - 40, 6);
    var totalW = show.length * iw + Math.max(0, show.length - 1) * gap;
    var x0 = Math.round((W - totalW) / 2);
    // one tag size for the whole shelf: as big as the widest tag allows
    var slot = iw + gap - 4;
    var tags = show.map(function (b) {
      if (!NP.itemInfo) return null;
      var inf = NP.itemInfo(b, { repro: !!(b.kind === 'game' && b.flags && b.flags.repro) });
      var full = inf.label.toUpperCase(), short = (NP.TAG_SHORT[inf.tag] || inf.label).toUpperCase();
      return { tag: inf.tag, full: full, short: short };
    });
    var tagFits = function (t, sc) { return !t || NP.textWidth(t.full, sc) + 12 <= slot || NP.textWidth(t.short, sc) + 12 <= slot; };
    var tagScale = tags.every(function (t) { return tagFits(t, 3); }) ? 3 : 2;
    show.forEach(function (b, i) {
      var x = x0 + i * (iw + gap), y = shelfY - 40 * k;
      var l = R.lines.filter(function (q) { return q.it === b; })[0];
      var isBest = b === bestIt;
      // the best find gets a gold frame and a flag
      if (isBest) {
        ctx.fillStyle = 'rgba(255,204,51,.22)'; ctx.fillRect(x - 7, y - 7, iw + 14, 40 * k + 7);
        ctx.fillStyle = C.gold;
        ctx.fillRect(x - 7, y - 7, iw + 14, 4); ctx.fillRect(x - 7, y - 7, 4, 40 * k + 7); ctx.fillRect(x + iw + 3, y - 7, 4, 40 * k + 7);
      }
      NP.drawItem(ctx, b, x, y, k);
      if (l && l.pts < 0 && b.kind === 'game' && l.note.indexOf('shelf') >= 0) {
        ctx.fillStyle = C.red; ctx.fillRect(x + 2 * k, y + 27 * k, 28 * k, 22); NP.pixelText(ctx, 'DUPE', x + iw / 2, y + 27 * k + 4, 2, C.cream, 'center');
      }
      if (isBest) {
        var bl = 'BEST FIND', bw = NP.textWidth(bl, 2) + 16;
        ctx.fillStyle = C.ink; ctx.fillRect(x + iw / 2 - bw / 2 + 3, y - 33, bw, 22);
        ctx.fillStyle = C.gold; ctx.fillRect(x + iw / 2 - bw / 2, y - 36, bw, 22);
        NP.pixelText(ctx, bl, x + iw / 2, y - 32, 2, C.ink, 'center');
      } else if (b.kind === 'grail') NP.pixelText(ctx, 'GRAIL', x + iw / 2, y - 26, 3, C.gold, 'center');
      // the rarity tag, on the front edge of the shelf under each item
      var tg = tags[i];
      if (tg) {
        var tc = (NP.TAG_COLORS || {})[tg.tag] || ['#3a4d82', C.cream];
        var ts = tagScale, lab = NP.textWidth(tg.full, ts) + 12 <= slot ? tg.full : tg.short;
        if (NP.textWidth(lab, ts) + 12 > slot) ts = 1;
        var tw = NP.textWidth(lab, ts) + 12, tx = Math.round(x + iw / 2 - tw / 2), ty = shelfY + 28;
        ctx.fillStyle = C.ink; ctx.fillRect(tx - 2, ty - 2, tw + 4, 7 * ts + 12);
        ctx.fillStyle = tc[0]; ctx.fillRect(tx, ty, tw, 7 * ts + 8);
        NP.pixelText(ctx, lab, x + iw / 2, ty + 4, ts, tc[1], 'center');
      }
    });
    if (!show.length) NP.pixelText(ctx, 'AN EMPTY SHELF. RESPECT.', W / 2, shelfY - 70, 4, C.cream, 'center');
    // a can of Saguaro Splash, glistening at the end of the shelf, when there is room for it
    if (NP.drawCan && totalW < W - 300) {
      NP.drawCan(ctx, W - 96, shelfY - 58, 4, 1);
      NP.drawSparkle(ctx, W - 54, shelfY - 62, 3, 0.25);
    }
    // footer
    ctx.fillStyle = C.navy2; ctx.fillRect(0, H - 70, W, 70);
    NP.pixelText(ctx, DEMO ? 'THE FREE DEMO' : 'DAILY RUN ' + S.seed, 40, H - 46, 3, C.cream);
    NP.pixelText(ctx, 'THENOSTALGIAPRO.COM', W - 40, H - 46, 3, C.cyan, 'right');
    if (items.length > show.length) NP.pixelText(ctx, '+' + (items.length - show.length) + ' MORE', W / 2 - 40, H - 42, 2, C.gold, 'center');
    // scanlines
    for (var y = 0; y < H; y += 3) { ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(0, y, W, 1); }
  }

  function shareText() {
    var R = S.result;
    return 'Nostalgia Pro, ' + (DEMO ? 'the free demo' : 'Saturday #' + S.runNo) + ' (' + S.wx.temp + 'F)\n"' + R.title + '"\nScore ' + R.score + ' | Spent ' + money(R.spent) + ' | ' + R.items.length + ' finds\nFeatured lot: ' + featuredStatus() + '\nIs it on the shelf? Play: thenostalgiapro.com';
  }

  function shelve() {
    S.result = appraise();
    var R = S.result;
    var dayKey = 'day_' + S.seed, prev = store.get(dayKey, null), best = store.get('best', null);
    var msg = '';
    if (DEMO) msg = 'Demo run complete. In the full version, this haul would go on your home shelf.';
    else if (!prev) { store.set(dayKey, { score: R.score, title: R.title }); saveHomeShelf(R); msg = 'Official run for today saved to your home shelf.'; }
    else msg = 'Replay. Today\'s official run was ' + prev.score + '.';
    if (!best || R.score > best.score) { store.set('best', { score: R.score, seed: S.seed }); msg += ' New personal best!'; }
    else msg += ' Best ever: ' + best.score + '.';
    S.recordMsg = msg;
    S.screen = 'results';
    sfx('fanfare');
    render();
    window.scrollTo(0, 0);
  }

  // ---------- events ----------
  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var act = el.getAttribute('data-act');
    if (act === 'adfree') return; // handled on change
    var uid = el.getAttribute('data-uid');
    switch (act) {
      case 'tapstart': leaveGate(); break;
      case 'howto': renderHowTo(); break;
      case 'howback': S = null; cartOpen = true; renderTitle(); window.scrollTo(0, 0); break;
      case 'start':
        cartOpen = false;
        if (NP.Creator && !hasLook()) showCreator(beginSaturday, 'Looks good. Start Saturday');
        else beginSaturday();
        break;
      case 'look': showCreator(function () { S = null; cartOpen = true; renderTitle(); window.scrollTo(0, 0); }, 'Save my look'); break;
      case 'shelf': shelfBack = S && S.screen === 'results' ? 'results' : 'title'; renderHomeShelf(); break;
      case 'shelfback':
        if (shelfBack === 'results' && S) { S.screen = 'results'; render(); }
        else { S = null; cartOpen = true; renderTitle(); }
        window.scrollTo(0, 0); break;
      case 'go':
        var s = S.day.stops.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
        var drive = function () { arrive(s); render(); window.scrollTo(0, 0); if (S.screen === 'stop' && S.stop && S.stop.cleared) showTip('dex', null); };
        if (NP.Intro) NP.Intro.loading(tipsOff ? null : NP.Intro.tip(adFree, S.wx && S.wx.id), drive); else drive();
        break;
      case 'offer': doOffer(findItem(uid), el.getAttribute('data-kind')); break;
      case 'inspect':
        var it = findItem(uid); spend(T_INSPECT); it.inspected = true;
        if (it.flags && it.flags.repro && it.tell) { sfx('uhoh'); track('repro_inspected'); }
        if (!checkSundown()) render(); break;
      case 'check': var it2 = findItem(uid); spend(T_SHELF); it2.checked = true; S.ev.checks++; if (!checkSundown()) render(); break;
      case 'dig': spend(T_DIG); S.stop.dug = true; if (!checkSundown()) render(); break;
      case 'leave': leaveStop(); window.scrollTo(0, 0); break;
      case 'buygift': buyGift(el.getAttribute('data-id')); break;
      case 'gohome': goHome(); break;
      case 'openlot':
        var lb = S.bag.filter(function (x) { return x.uid === uid; })[0]; lb.opened = true;
        S.toast = 'Inside: ' + lb.contents.map(function (c) { return c.t; }).join(', ') + '.';
        render(); break;
      case 'seal': var sb = S.bag.filter(function (x) { return x.uid === uid; })[0]; sb.decision = el.getAttribute('data-v'); render(); break;
      case 'shelve': shelve(); break;
      case 'download':
        var a = document.createElement('a');
        a.download = 'nostalgia-pro-the-screenshot-' + S.seed + '.png';
        a.href = $('#card').toDataURL('image/png');
        document.body.appendChild(a); a.click(); a.remove(); track('share_card_saved'); break;
      case 'copy':
        var t = shareText();
        var done = function () { el.textContent = 'Copied!'; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { window.prompt('Copy this:', t); });
        else window.prompt('Copy this:', t);
        break;
      case 'again': track('replay'); newRun(); S.screen = 'map'; render(); window.scrollTo(0, 0); break;
      case 'demoend':
        if (NP.Intro && NP.Intro.infomercial) {
          music(null);
          NP.Intro.infomercial(app, {
            comingSoon: !!CFG.COMING_SOON, url: CFG.FULL_GAME_URL, follow: CFG.FOLLOW_URL, site: CFG.SITE_URL,
            feedback: feedbackOk() ? CFG.FEEDBACK_URL : '', merch: linksOk() ? (CFG.MERCH_URL || '') : '', links: linksOk(), price: CFG.PRICE || '$0.99', adFree: adFree
          });
        } else { newRun(); S.screen = 'map'; render(); }
        window.scrollTo(0, 0); break;
      case 'demoagain': track('replay'); newRun(); S.screen = 'map'; render(); window.scrollTo(0, 0); break;
      case 'fullscreen': toggleFullscreen(); break;
      case 'mute': if (NP.Sound) NP.Sound.toggle(); break;
      case 'tips': setTipsOff(!tipsOff); break;
      case 'hsname': var cap = $('#hscap'); if (cap) cap.textContent = el.getAttribute('data-name'); break;
      case 'totitle': S.screen = 'title'; cartOpen = true; render(); window.scrollTo(0, 0); break;
    }
  }
  function onChange(e) {
    if (e.target.classList && e.target.classList.contains('tipoff-in')) { setTipsOff(e.target.checked); return; }
    if (e.target.getAttribute('data-act') === 'adfree') {
      adFree = e.target.checked; store.set('adfree', adFree);
      if (S) S.toast = adFree ? 'Ad-Free Edition activated. Enjoy these ads for the Ad-Free Edition.' : 'Ads are back. They missed you.';
      render();
    }
  }

  window.addEventListener('DOMContentLoaded', function () {
    app = document.getElementById('app');
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    S = null;
    track('boot', true);
    // Phones only allow sound after a tap, so the game opens on a Tap to start screen.
    // That first tap turns the sound on and the title music starts right away.
    if (NP.Sound && NP.Sound.supported && !NP.Sound.isReady()) renderGate(); else renderTitle();
  });

  // ---------- tap to start ----------
  var gateOn = false;
  function renderGate() {
    gateOn = true;
    app.innerHTML = '<div class="screen gate"><button class="gate-btn" data-act="tapstart">' +
      '<canvas id="gatecv" width="320" height="104" aria-hidden="true"></canvas>' +
      '<span class="gate-t">' + (coarse() ? 'Tap to start' : 'Click or press Enter to start') + '</span>' +
      '<span class="gate-s">' + (DEMO ? 'The free demo. ' : '') + 'Turn your sound up.</span></button>' +
      '<div class="foot">A parody. Every game, console, store and company in here is made up.</div></div>';
    NP.drawLogo($('#gatecv'), adFree);
    var b = $('.gate-btn'); if (b) { try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); } }
  }
  function leaveGate() {
    if (!gateOn) return;
    gateOn = false;
    if (NP.Sound && NP.Sound.unlock) NP.Sound.unlock();
    renderTitle();
  }
  window.addEventListener('keydown', function (e) {
    if (!gateOn || e.key === 'Tab' || e.key === 'Shift' || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    leaveGate();
  });

  // 1 COLLECTOR: Saturday morning, then the map
  function beginSaturday() {
    newRun();
    var go = function () { track('intro_done'); S.screen = 'map'; render(); window.scrollTo(0, 0); };
    music(null);
    if (NP.Intro) NP.Intro.morning(app, { look: getLook(), runNo: S.runNo, label: DEMO ? 'DEMO SATURDAY' : 'SATURDAY #' + S.runNo, wx: S.wx, featured: S.day.featured, adFree: adFree, demo: DEMO }, go);
    else go();
  }

  // ---------- character look ----------
  function hasLook() { return !!store.get('look', null); }
  function getLook() { return NP.Char ? NP.Char.normalize(store.get('look', null)) : null; }
  function showCreator(next, label) {
    music('title');
    NP.Creator.render(app, getLook(), function (look) { store.set('look', look); track('creator_done'); next(); }, label);
  }

  // what walk.js is allowed to touch
  NP.G = {
    state: function () { return S; }, END: END,
    spend: spend, checkSundown: checkSundown, updateHud: updateHud,
    itemCard: itemCard, drawArts: drawArts, giftHTML: giftHTML, drawGiftArts: drawGiftArts, dexSetup: dexSetup,
    adLevel: adLevel, adFree: function () { return adFree; }, look: getLook, helloFor: helloFor,
    fmtTime: fmtTime, money: money, esc: esc, sfx: sfx, track: track, demo: DEMO,
    takeToast: function () { var t = S.toast; S.toast = ''; return t; },
    tip: function (k) { return showTip(k, k === 'dex' ? dexAnchor() : null); }, tipOpen: tipOpen
  };

  // test hooks (harmless in production)
  window.__NP_TEST = { genDay: genDay, state: function () { return S; }, phoenixDate: phoenixDate, weatherFor: weatherFor,
    preview: function (seed) { var d = applyExtras(genDay(seed), seed); return { wx: d.wx.id, host: d.featured.stopName, hostType: d.stops.filter(function (s) { return s.id === d.featured.stopId; })[0].type }; } };
})();
