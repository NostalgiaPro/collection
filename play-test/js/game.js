// Nostalgia Pro: one Saturday, one budget, one shelf.
(function () {
  'use strict';
  var C = NP.COL;
  var START = 7 * 60, END = 17 * 60 + 30; // 7:00 AM to 5:30 PM sundown
  var NOON = 12 * 60;                      // "Back by noon" ends here
  var BUDGET = 100;
  var COND_MULT = { loose: 1, cib: 2, sealed: 3.2 };
  var T_HAGGLE = 5, T_INSPECT = 5, T_SHELF = 10, T_DIG = 15;
  var EPOCH = Date.UTC(2026, 0, 3); // a Saturday. Run numbers count from here.
  var CFG = NP.CONFIG || {};
  // build.js replaces the marked part with true (demo) or false (full), so the demo cannot be unlocked from config.js
  var DEMO = false;

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
    // the stored text itself, unparsed (so a save that is there but unreadable can be told apart from no save)
    raw: function (k) {
      try { if (canSave) { var v = localStorage.getItem(PFX + k); if (v !== null) return v; } } catch (e) {}
      return Object.prototype.hasOwnProperty.call(memStore, k) ? memStore[k] : null;
    },
    set: function (k, v) {
      var s = JSON.stringify(v);
      if (memStore[k] === s && canSave) { try { if (localStorage.getItem(PFX + k) === s) return; } catch (e) {} } // nothing changed: skip the write
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
  // one step of the funnel: counted once per page load, so the counts line up as "how many got this far"
  function step(n) { track(n, true); }
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
    // a season Saturday carries its own date inside the seed, so the weather follows the calendar through the season
    var dm = String(seed).match(/\d{4}-\d{2}-\d{2}/), ds = dm ? dm[0] : phoenixDate();
    var month = +ds.slice(5, 7) - 1, base = AVG_HIGH[month] || 90, monsoon = month >= 6 && month <= 8;
    var x = r();
    if (x < (monsoon ? 0.2 : 0.08)) {
      return { id: 'rain', temp: base - 9 - Math.floor(r() * 5), name: monsoon ? 'Monsoon storm' : 'Rain', mult: 1, icon: '&#127783;', sponsored: true,
        blurb: 'A rare rain day. Half the town stayed home, sellers want to deal, and Dex is running late.' };
    }
    if (base >= 85 && x < 0.5) {
      var hot = base + 6 + Math.floor(r() * 6);
      return { id: 'hot', temp: hot, name: hot >= 110 ? 'Excessive heat warning' : 'Heat advisory', mult: 1.2, icon: '&#127777;', sponsored: true,
        blurb: 'Hot one today. Everything takes a little longer out there.' };
    }
    return { id: 'sunny', temp: base - 2 + Math.floor(r() * 5), name: 'Sunny', mult: 1, icon: '&#9728;', sponsored: true, blurb: 'Clear skies. A normal Sundown Flats Saturday.' };
  }
  var FEATURED_NAMES = ['Box Labeled "MISC (GAMES?)"', "Grandpa's Garage Tote", 'Estate Sale Bin #4', 'Moving Day Box (Fragile, Maybe)',
    'Storage Unit Mystery Crate', 'Box That Smells Like 1994', 'Tote Labeled "KIDS STUFF DO NOT SELL"'];
  function applyExtras(day, seed, end) {
    end = end || END;
    day.wx = weatherFor(seed);
    if (day.wx.id === 'rain') {
      day.stops.forEach(function (s) {
        if (s.rivalAt) { s.rivalAt += 75; if (s.rivalAt > end - 30) { s.rivalAt = null; s.rumor = false; } }
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
      var d = buildDay(todaySeed);
      pvCache = { seed: todaySeed, wx: d.wx, theme: d.theme, featured: { name: d.featured.name, stopName: d.featured.stopName, ask: d.featured.ask } };
    }
    return pvCache;
  }

  // ---------- varied Saturdays (full game only; the demo keeps its one fixed Saturday) ----------
  // Each seed reshapes the day with its own random numbers, after the base day is built:
  // which stops are out today, more stuff at every stop, and one twist for the whole town (the "theme").
  var THEMES = NP.THEMES; // data.js
  function varyDay(day, seed) {
    var r = mulberry32(NP.hashStr('vary|' + seed));
    var games = NP.CATALOG;
    var tier = function (t) { return games.filter(function (g) { return g.tier === t; }); };
    function roll(w) { var x = r(); return x < w[0] ? pick(r, tier(1)) : x < w[0] + w[1] ? pick(r, tier(2)) : pick(r, tier(3)); }
    var tw = 0; THEMES.forEach(function (t) { tw += t.w; });
    var x = r() * tw, th = THEMES[0];
    for (var i = 0; i < THEMES.length; i++) { x -= THEMES[i].w; if (x < 0) { th = THEMES[i]; break; } }
    day.theme = th.id === 'none' ? null : th;
    var sealedP = th.id === 'sealed' ? 0.35 : null;
    function more(st, nVis, nDig, w, seller) {
      for (var k = 0; k < nVis + nDig; k++) {
        var sl = seller || (st.type === 'flea' ? pick(r, ['friendly', 'ikwig', 'firm', 'friendly']) : st.seller);
        var it = makeItem(r, roll(w), { seller: sl, tested: st.type === 'pawn', sealedP: sealedP != null ? sealedP : (st.type === 'flea' ? 0.2 : null), damageP: st.type === 'yard' ? 0.3 : null });
        if (th.id === 'moving' && st.type === 'yard') { it.ask = Math.max(1, Math.round(it.ask * 0.85)); it.minFrac *= 0.8; }
        (k < nVis ? st.items : st.dig).push(it);
      }
    }
    // a third yard sale some Saturdays
    var usedNames = day.stops.map(function (s) { return s.name; });
    var spare = NP.STOPNAMES.yard.filter(function (n) { return usedNames.indexOf(n) < 0; });
    if (spare.length && r() < 0.45) {
      var y3 = { id: 'v0', type: 'yard', name: pick(r, spare), seller: pick(r, ['grandma', 'kid', 'friendly']), cost: 66, items: [], dig: [], dug: false, visited: false, rivalAt: null, rumor: false, cleared: false };
      more(y3, 4, 3, [0.7, 0.22]);
      day.stops.splice(1 + Math.floor(r() * (day.stops.length - 1)), 0, y3);
    }
    // the sports bin guy stays home some Saturdays (never on game day)
    if (th.id !== 'football' && r() < 0.25) day.stops = day.stops.filter(function (s) { return s.type !== 'sports' || (day.featured && day.featured.stopId === s.id); });
    // more to look at everywhere
    day.stops.forEach(function (st) {
      if (st.type === 'yard') more(st, 2, th.id === 'cleanout' ? 4 : 1, [0.68, 0.24]);
      else if (st.type === 'thrift') more(st, 2, th.id === 'cleanout' ? 4 : 1, [0.58, 0.32]);
      else if (st.type === 'flea') more(st, 5, th.id === 'cleanout' ? 4 : 1, [0.45, 0.4]);
      else if (st.type === 'pawn') more(st, 2, 0, [0.35, 0.45]);
      if (st.type === 'sports' && th.id === 'football') {
        st.items.forEach(function (it) { if (it.special) it.ask = 40; });
        for (var q = 0; q < 3; q++) st.items.push(makeItem(r, pick(r, NP.SPORTS), { seller: 'sports', sports: true, ask: 1 + Math.floor(r() * 2) }));
      }
      if (th.id === 'football' && st.type === 'yard') st.dig.push(makeItem(r, pick(r, NP.SPORTS), { seller: st.seller, sports: true, ask: 1 }));
    });
    return day;
  }

  // ---------- sellers who remember you ----------
  // In a season, "today" is that Saturday's date in the season, and the memory lives in the season save.
  function memNow() { return S && S.date ? S.date : todaySeed; }
  function daysSince(d) {
    var now = memNow(), a = Date.parse(d), b = Date.parse(now);
    if (isNaN(a) || isNaN(b)) return d === now ? 0 : 1;
    return Math.round((b - a) / 86400000);
  }
  function whenText(n) { return n <= 1 ? 'yesterday' : n < 7 ? 'the other day' : n < 14 ? 'last week' : 'a while back'; }
  function loadMem() { return S && S.season && SEASON ? (SEASON.mem = SEASON.mem || {}) : (store.get('mem', {}) || {}); }
  function remember(key, field) {
    if (DEMO || !S || !(S.official || S.season)) return; // replays, Free Play and the demo do not count
    var m = loadMem(); m[key] = m[key] || {};
    m[key][field] = memNow();
    if (field === 'square') delete m[key].mad;
    if (field === 'mad') delete m[key].square;
    if (!S.season) store.set('mem', m);
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

  // ---------- the two modes: "Back by noon" (short) and "Home by sundown" (long) ----------
  // The demo is always "Back by noon". Everything that used to read END goes through endT() now.
  function modeOf() { return DEMO ? 'noon' : (S && S.mode) || 'sundown'; }
  function endT() { return modeOf() === 'noon' ? NOON : END; }
  function endLabel() { return fmtTime(endT()); }
  // first run of the day, kept separately for each mode (the sundown key is the same one older saves used)
  function dayKey(seed, m) { return 'day_' + seed + ((m || modeOf()) === 'noon' ? '_noon' : ''); }

  // ---------- the demo's one curated Saturday ----------
  function buildDay(seed, end) {
    seed = seed || todaySeed;
    var day = applyExtras(genDay(seed), seed, end);
    if (DEMO) curateDemo(day);
    else varyDay(day, seed);
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

  // free: true for Free Play (a random Saturday that never counts as today's run)
  // season: true for a season Saturday (Home by sundown, SEASON.week, money and shelf carried over)
  function newRun(m, free, season) {
    document.querySelectorAll('.callov').forEach(function (o) { if (o.parentNode) o.parentNode.removeChild(o); });
    season = !DEMO && !!season && !!SEASON;
    m = DEMO ? 'noon' : season ? 'sundown' : (m || (S && S.mode) || 'sundown');
    free = !DEMO && !season && !!free;
    var date = season ? seasonDate(SEASON.week) : null;
    var seed = season ? 'season-' + SEASON.id + '-' + date : free ? 'free-' + Math.random().toString(36).slice(2, 8) : todaySeed;
    var end = m === 'noon' ? NOON : END;
    var day = buildDay(seed, end);
    // Dex never shows up after the day is over (noon mode used to schedule him for the afternoon)
    day.stops.forEach(function (s) { if (s.rivalAt && s.rivalAt > end - 30) { s.rivalAt = null; s.rumor = false; } });
    if (season) {
      // what is at home is the season's own shelf: the games you started with, plus everything you bought
      day.owned = {};
      Object.keys(SEASON.owned || {}).forEach(function (k) { day.owned[k] = true; });
      SEASON.shelf.forEach(function (b) { if (b.kind === 'game') day.owned[b.id] = true; });
      day.shelfCount = (SEASON.baseCount || 300) + SEASON.shelf.length;
    }
    var cash = season ? SEASON.cash : budgetFor(m);
    S = {
      seed: seed, free: free, season: season, week: season ? SEASON.week : 0, date: date,
      runNo: runNumber(/^\d{4}-\d{2}-\d{2}$/.test(todaySeed) ? todaySeed : phoenixDate()), day: day, mode: m,
      budget: cash, time: START, cash: cash, bag: [], visited: 0, screen: 'map', stop: null, wx: day.wx, tfrac: 0,
      official: !DEMO && !free && !season && !store.get(dayKey(todaySeed, m), null),
      ev: { rivalHits: 0, offended: 0, giftSpent: 0, sportsOverpay: 0, checks: 0, dupBuys: 0, sold: 0, sales: 0, traded: 0, flipProfit: 0, soldRepro: 0, creditLeft: 0, sellMad: 0 },
      adsShown: 0, pitchN: 0, toast: '',
      credit: {}, // store credit from trade-ins, by stop id. It stays at that stop.
      sq: {},     // what each shop owner has offered for each game in your bag
      rlog: {},   // what each rival did to you today
      said: {},   // catchphrases already used today
      history: [] // stop ids in the order you visited them (the route card and the funnel use this)
    };
    // Round 3b: today's rotating stores and collector moments, then the rivals (Brayden can be at the mall store now)
    if (!DEMO) { addStores(day, seed, m); assignRivals(day, seed, m); }
    S.rem = DEMO || free ? {} : applyMemory(day);
    // the one seller today who would never sell out, and the stop they are at (never the swap meet: that one has its own)
    var colaStops = day.stops.filter(function (s) { return openStop(s) && s.type !== 'flea' && s.seller && NP.SPONSOR && NP.SPONSOR.refuse && NP.SPONSOR.refuse[s.seller]; });
    if (colaStops.length) colaStops[NP.hashStr(seed + '|cola') % colaStops.length].cola = true;
  }

  // ---------- rivals: who is out today, and where ----------
  // Dex is out every Saturday. The others rotate: two more on a Home by sundown day (three on some), one more in Back by noon.
  // In a season, a rival who keeps getting the better of you shows up a little more often. They can smell it.
  var RIVAL_IDS = ['brayden', 'phil', 'brody', 'gary', 'steve'];
  function assignRivals(day, seed, m) {
    var r = mulberry32(NP.hashStr('rivals|' + seed));
    var stopsOf = function (types) { return day.stops.filter(function (s) { return openStop(s) && types.indexOf(s.type) >= 0; }); };
    var n = m === 'noon' ? 1 : (r() < 0.4 ? 3 : 2);
    var pool = RIVAL_IDS.filter(function (id) { return stopsOf(NP.RIVALS[id].where).length; });
    var picked = [];
    while (picked.length < n && pool.length) {
      var weights = pool.map(function (id) { var rec = SEASON && SEASON.rivals && SEASON.rivals[id]; return 1 + (rec ? Math.max(0, (rec.beat || 0) - (rec.you || 0)) * 0.3 : 0); });
      var tot = weights.reduce(function (a, b) { return a + b; }, 0), x = r() * tot, k = 0;
      for (; k < pool.length - 1; k++) { x -= weights[k]; if (x < 0) break; }
      picked.push(pool[k]); pool.splice(k, 1);
    }
    day.stops.forEach(function (s) { s.rivals = []; });
    // Dex: every Saturday. If no stop drew him, he raids the swap meet mid-morning.
    if (!day.stops.some(function (s) { return s.rivalAt; })) {
      var fl = stopsOf(['flea'])[0];
      if (fl) { fl.rivalAt = START + 150 + Math.floor(r() * 4) * 30; fl.rumor = true; }
    }
    day.stops.forEach(function (s) { if (s.rivalAt) s.rivals.push('dex'); });
    picked.forEach(function (id) {
      var at = stopsOf(NP.RIVALS[id].where);
      var many = (id === 'gary' || id === 'brayden') && at.length > 1 && r() < 0.5 ? 2 : 1;
      if (id === 'steve') many = at.length; // the pawn shop and the swap meet both
      at = shuffle(r, at).slice(0, many);
      at.forEach(function (s) { if (s.rivals.indexOf(id) < 0) s.rivals.push(id); });
    });
    day.rivals = ['dex'].concat(picked);
  }
  function rivalsAt(s) { return (s && s.rivals) || []; }
  function rivalHere(id) { return !!(S && S.stop && rivalsAt(S.stop).indexOf(id) >= 0); }
  function rivalName(id) { return NP.RIVALS[id] ? NP.RIVALS[id].name : id; }
  // An action at a stop. Brody's filming adds 5 minutes to everything at a menu stop (at the swap meet he locks a table instead).
  function actCost(min) {
    spend(min + (S.screen === 'stop' && rivalHere('brody') ? 5 : 0));
    if (S.stop && S.stop.reseller) S.stop.acts = (S.stop.acts || 0) + 1; // the guy with the wagon is watching
  }
  // Slab Steve has every sealed game at his stops on hold, unless you pay 20% more
  function steveHold(it) { return rivalHere('steve') && it.kind === 'game' && it.cond === 'sealed' && it.state === 'avail' && it.uid.indexOf('dx') !== 0; }
  // Brayden: look at something, move on to something else, and he buys the first one
  function braydenCheck(uid) {
    var s = S.stop;
    if (!s || !s.bfocus || s.bfocus === uid || !rivalHere('brayden')) return;
    var it = findItem(s.bfocus); s.bfocus = null;
    if (!it || it.state !== 'avail') return;
    it.state = 'gone'; it.goneBy = 'brayden'; it.line = '';
    rivalHit('brayden');
    var B = NP.RIVALS.brayden, txt = B.texts[NP.hashStr(it.uid) % B.texts.length].replace('{t}', it.t).replace('{$}', money(it.ask)).replace('{place}', s.type === 'mall' ? 'the mall' : 'a yard sale');
    S.toast = 'You moved on, so Brayden bought ' + it.t + ' with his mom\'s card. Brayden: "' + B.lines[NP.hashStr(it.uid + 'b') % B.lines.length] + '" A text pops up on his phone. ' + txt;
  }
  // "Blow on it. It helps." Once a Saturday, on a loose game you Inspect.
  function blowOnIt(it) {
    if (DEMO || S.said.blow || it.kind !== 'game' || it.cond !== 'loose') return;
    var disc = (NP.PLATFORMS[it.p] || {}).media === 'disc';
    if (!disc && Math.random() > 0.4) return;
    if (disc && !(it.flags && it.flags.damaged)) return;
    S.said.blow = true;
    it.blow = disc ? NP.BLOW_DISC : NP.BLOW[NP.hashStr(it.uid) % NP.BLOW.length];
    track('blow_on_it');
  }
  // one box per rival at this stop (Dex has his own warnings), with the one rule they change
  function rivalNotes(s) {
    var h = '';
    rivalsAt(s).forEach(function (id) {
      if (id === 'dex') return;
      var R = NP.RIVALS[id], rule = s.type === 'flea' && R.ruleWalk ? R.ruleWalk : R.rule;
      h += '<div class="rivalnote r-' + id + '"><b>' + esc(R.name) + '</b> <small>(' + esc(R.tag) + ')</small> ' + esc(rule) +
        ' <i>"' + esc(R.lines[NP.hashStr(s.id + id) % R.lines.length]) + '"</i></div>';
    });
    return h;
  }
  // a rival got the better of you (counted for the season's rival report)
  function rivalHit(id) { S.rlog[id] = (S.rlog[id] || 0) + 1; track('rival_' + id + '_hit'); }
  function spottedText() { return (S.day.rivals || []).map(rivalName).join(' · '); }

  // Home by sundown gets $250. Back by noon and the demo keep $100.
  function budgetFor(m) { return !DEMO && m === 'sundown' ? 250 : BUDGET; }

  // ---------- the season: 12 Saturdays, money and shelf carried over, and a save ----------
  // SEASON is everything that lasts from one Saturday to the next. S is the Saturday in progress.
  // One save slot, under the key 'save': { v, season, run }. run is the Saturday in progress (null between Saturdays).
  // Saves happen on every screen change in a season Saturday (each stop, each drive, buying, selling) and at the end of the day.
  var SAVE_V = 1;
  var SEASON = null;
  var saveBad = false;   // a save was found but could not be read
  function iso(d) { return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
  function seasonDate(week) {
    var p = SEASON.start.split('-').map(Number);
    return iso(new Date(Date.UTC(p[0], p[1] - 1, p[2]) + (week - 1) * 7 * 86400000));
  }
  function newSeason() {
    var p = phoenixDate().split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    d = new Date(d.getTime() + ((6 - d.getUTCDay() + 7) % 7) * 86400000); // the coming Saturday
    var id = Math.random().toString(36).slice(2, 8);
    var r = mulberry32(NP.hashStr('season-owned|' + id)), owned = {};
    NP.CATALOG.forEach(function (g) { var pr = [0, 0.4, 0.25, 0.08][g.tier]; if (r() < pr) owned[g.id] = true; });
    SEASON = {
      id: id, start: iso(d), week: 1, cash: NP.SEASON.startSavings + NP.SEASON.paycheck, pay: false,
      shelf: [], owned: owned, baseCount: 270 + Math.floor(r() * 60), scores: [], rivals: {}, mem: {},
      punch: 0, friend: {}, banned: [], gear: {}, endless: false, ending: null, endingPending: false
    };
    saveGame(null);
    track('new_game');
  }
  function seasonLabel(w) { w = w || (SEASON && SEASON.week) || 1; return w > NP.SEASON.weeks ? 'SATURDAY ' + w + ' · ENDLESS' : 'SATURDAY ' + w + ' OF ' + NP.SEASON.weeks; }
  function seasonLabelLc(w) { w = w || (SEASON && SEASON.week) || 1; return w > NP.SEASON.weeks ? 'Saturday ' + w + ' (Endless)' : 'Saturday ' + w + ' of ' + NP.SEASON.weeks; }
  // The Saturday in progress, made safe to save: the current stop is saved as its id.
  function packRun() {
    if (!S || !S.season || S.screen === 'results') return null;
    var stop = S.stop;
    S.stop = stop ? { __stop: stop.id } : null;
    var feat = S.day.featured && S.day.featured.item;
    if (feat) S.day.featured.item = { __uid: feat.uid };
    var out;
    try { out = JSON.parse(JSON.stringify(S)); } catch (e) { out = null; }
    S.stop = stop; if (feat) S.day.featured.item = feat;
    return out;
  }
  function unpackRun(r) {
    var stopId = r.stop && r.stop.__stop;
    r.stop = stopId ? r.day.stops.filter(function (x) { return x.id === stopId; })[0] || null : null;
    if (r.day.featured && r.day.featured.item && r.day.featured.item.__uid) {
      var uid = r.day.featured.item.__uid, found = null;
      r.day.stops.forEach(function (s) { (s.items || []).forEach(function (it) { if (it.uid === uid) found = it; }); });
      r.day.featured.item = found || { state: 'gone', contents: [], uid: uid };
    }
    if ((r.screen === 'stop' || r.screen === 'walk') && !r.stop) r.screen = 'map';
    return r;
  }
  function saveGame(run) {
    if (DEMO || !SEASON) return;
    var r = run === undefined ? packRun() : run;
    try { store.set('save', { v: SAVE_V, season: SEASON, run: r }); } catch (e) {}
    // a small second copy, written between Saturdays only. If the main save ever goes missing,
    // Continue picks the season back up from the start of that Saturday instead of losing it.
    if (!r) { try { store.set('save_b', { v: SAVE_V, season: SEASON, run: null }); } catch (e) {} }
  }
  var saveT = null;
  function saveSoon() { if (S && S.season) { if (saveT) clearTimeout(saveT); saveT = setTimeout(function () { saveT = null; saveGame(); }, 250); } }
  // Never trusts a save: anything missing or the wrong shape, and it is treated as unreadable (never a crash).
  function readSave() {
    if (DEMO) return null;
    var sv = null;
    try { sv = store.get('save', null); } catch (e) { sv = 'bad'; }
    if (sv === null && store.raw('save') === null) { try { sv = store.get('save_b', null); } catch (e) { sv = null; } if (sv) sv.backup = true; }
    if (sv === null) { saveBad = store.raw('save') !== null; return null; }
    var ok = false;
    try {
      var se = sv && sv.season;
      ok = !!(sv && sv.v === SAVE_V && se && typeof se.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(se.start) && se.week >= 1 &&
        typeof se.cash === 'number' && isFinite(se.cash) && Array.isArray(se.shelf) && se.owned && typeof se.owned === 'object' && Array.isArray(se.scores));
      if (ok && sv.run) ok = !!(sv.run.day && Array.isArray(sv.run.day.stops) && Array.isArray(sv.run.bag) && typeof sv.run.time === 'number' && sv.run.season);
    } catch (e) { ok = false; }
    saveBad = !ok;
    return ok ? sv : null;
  }
  function continueGame() {
    var sv = readSave();
    if (!sv) { renderTitle(); return; }
    track('continue');
    SEASON = sv.season;
    ['rivals', 'mem', 'friend'].forEach(function (k) { if (!SEASON[k] || typeof SEASON[k] !== 'object') SEASON[k] = {}; });
    if (!Array.isArray(SEASON.banned)) SEASON.banned = [];
    cartOpen = false;
    if (sv.run) {
      try {
        S = unpackRun(sv.run);
        S.mapTracked = false;
        if (S.screen === 'walk' && NP.Walk && NP.Char) NP.Walk.enter(S.stop);
        S.toast = S.toast || 'Welcome back. ' + seasonLabelLc(S.week) + ', ' + fmtTime(S.time) + '.';
        render(); window.scrollTo(0, 0);
        return;
      } catch (e) { S = null; }
    }
    if (SEASON.endingPending) return renderEnding();
    renderWeekdays();
  }
  // Monday to Friday, on one screen. Friday is payday.
  function renderWeekdays() {
    S = null;
    music('title');
    if (SEASON.pay) { SEASON.cash += NP.SEASON.paycheck; SEASON.pay = false; saveGame(null); }
    var w = SEASON.week, lines = NP.WEEKDAYS[(w + SEASON.id.charCodeAt(0)) % NP.WEEKDAYS.length];
    var rep = rivalReport();
    var h = '<div class="screen weekdays"><div class="wk-card">' +
      '<div class="wk-h">MONDAY TO FRIDAY</div>' +
      lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') +
      '<div class="wk-pay">FRIDAY: PAYDAY. <b>+' + money(NP.SEASON.paycheck) + '</b></div>' +
      '<div class="wk-cash">You have <b>' + money(SEASON.cash) + '</b> for ' + esc(seasonLabelLc(w)) + '.</div>' +
      (w === NP.SEASON.weeks ? '<div class="wk-final">' + esc(NP.FINALE_NOTE) + '</div>' : '') +
      (rep ? '<div class="wk-riv"><b>Rival report.</b> ' + esc(rep) + '</div>' : '') +
      '<div class="wk-shelf">On the shelf this season: ' + SEASON.shelf.length + '. ' + esc(NP.CATCH.question) + '</div>' +
      '</div><div class="btns center"><button class="big" data-act="startsat">' + esc(seasonLabelLc(w)) + ' &#9654;</button></div>' +
      '<div class="btns center"><button data-act="totitle">Title screen</button></div></div>';
    app.innerHTML = h;
    window.scrollTo(0, 0);
  }
  function rivalReport() {
    var R = SEASON.rivals || {}, out = [];
    Object.keys(R).forEach(function (id) {
      var x = R[id]; if (!x || !x.met || !NP.RIVALS[id]) return;
      out.push(rivalName(id) + ' ' + (x.beat || 0) + ', you ' + (x.you || 0));
    });
    return out.length ? out.join(' · ') + '.' : '';
  }
  function startSeasonSaturday() {
    newRun('sundown', false, true);
    var go = function () { track('intro_done'); step('f04_intro_done'); S.screen = 'map'; render(); window.scrollTo(0, 0); };
    music(null);
    track('saturday_start_' + S.week);
    if (NP.Intro) NP.Intro.morning(app, { look: getLook(), runNo: S.runNo, label: seasonLabel(S.week), wx: S.wx, featured: S.day.featured, adFree: adFree, demo: false, mode: 'sundown',
      budget: S.cash, spotted: spottedText(), from: S.week > 1 ? 2 : 0 }, go);
    else go();
  }
  // the end of a season Saturday: the haul goes on the season shelf, the money carries over
  function finishSeasonSaturday(R) {
    var w = S.week;
    R.lines.forEach(function (l) {
      var b = l.it; if (!b) return;
      SEASON.shelf.push({ id: b.id, t: b.t, p: b.p, kind: b.kind, fmt: b.fmt, cond: b.cond === 'sealed' && b.decision === 'open' ? 'cib' : b.cond, base: b.base || 0,
        flags: b.flags || {}, v: l.pts, dupe: l.pts < 0 && l.note.indexOf('shelf') >= 0, week: w, sticker: !!b.sticker });
    });
    SEASON.cash = S.cash;
    SEASON.scores.push({ week: w, score: R.score, title: R.title });
    // only the rivals you actually ran into today count: one point to them if they cost you something, one to you if not
    (S.day.rivals || []).forEach(function (id) {
      var hits = (S.rlog[id] || 0) + (id === 'dex' ? S.ev.rivalHits : 0);
      var met = hits || S.history.some(function (sid) { var st = S.day.stops.filter(function (x) { return x.id === sid; })[0]; return st && rivalsAt(st).indexOf(id) >= 0; });
      if (!met) return;
      var x = SEASON.rivals[id] = SEASON.rivals[id] || { met: 0, beat: 0, you: 0 };
      x.met++;
      if (hits) x.beat += 1; else x.you += 1;
    });
    SEASON.week = w + 1;
    SEASON.pay = true;
    if (w === NP.SEASON.weeks && !SEASON.ending) SEASON.endingPending = true;
    track('saturday_end'); step('saturday_end_' + w);
    saveGame(null);
  }
  function seasonTotals(se) {
    se = se || SEASON;
    var e = { score: 0, items: 0, dupes: 0, merch: 0, cash: se.cash };
    se.scores.forEach(function (x) { e.score += x.score; });
    e.score += Math.floor(se.cash / 2);
    se.shelf.forEach(function (b) { e.items++; if (b.dupe) e.dupes++; if (b.kind === 'merch') e.merch++; });
    return e;
  }
  function renderEnding() {
    S = null;
    music('title');
    var e = seasonTotals(), end = SEASON.ending;
    if (!end) {
      var E = NP.ENDINGS.filter(function (x) { return x.test(e); })[0];
      end = SEASON.ending = { id: E.id, name: E.name, text: E.text, score: e.score };
      track('season_end'); track('season_end_' + E.id);
      saveGame(null);
    }
    var best = SEASON.scores.slice().sort(function (a, b) { return b.score - a.score; })[0];
    var h = '<div class="screen ending"><div class="end-k">THE SEASON IS OVER</div>' +
      '<h2 class="end-h">' + esc(end.name) + '</h2>' +
      '<div class="end-t">' + esc(end.text) + '</div>' +
      '<div class="end-stats">Season score <b>' + e.score + '</b> &middot; ' + e.items + ' on the shelf &middot; ' + money(e.cash) + ' in the bank' +
      (best ? ' &middot; best Saturday: ' + best.score + ' (Saturday ' + best.week + ')' : '') + '</div>' +
      (rivalReport() ? '<div class="end-riv"><b>Rivals.</b> ' + esc(rivalReport()) + '</div>' : '') +
      '<div class="end-q">' + esc(NP.CATCH.question) + ' Every bit of it.</div>' +
      '<div class="end-endless"><b>Endless mode unlocked.</b> The Saturdays keep coming. The shelf is never full.</div>' +
      '<div class="btns center"><button class="big" data-act="endless">Keep going &#9654;</button><button data-act="totitle">Title screen</button></div></div>';
    app.innerHTML = h;
    window.scrollTo(0, 0);
  }
  // Drive time to a stop. Heat only adds half its usual slowdown to the drive (the van has AC),
  // and no drive takes longer than DRIVE_CAP minutes (a safety net: every base cost is set so even the hottest day stays at or under it).
  // Time spent at a stop still gets the full heat mult (see spend()).
  var DRIVE_CAP = 80;
  // fromId: where you are driving from (default: the stop you were at last). The two rental stores are across the street: 4 minutes on foot.
  function lastStopId() { return S.history.length ? S.history[S.history.length - 1] : null; }
  function costOf(s, fromId) {
    var from = fromId !== undefined ? fromId : lastStopId();
    if (s.across && from === s.across) return 4;
    var m = S.wx ? S.wx.mult : 1; return Math.min(DRIVE_CAP, Math.round(s.cost * (1 + (m - 1) * 0.5)));
  }

  function adLevel() { return S ? S.visited : 0; }

  // ---------- today's route ----------
  // A suggested order for the stops that are left, so the big button always knows where to go next.
  // Plain rules: cheap stops in the morning, the swap meet in the middle of the day, the pawn shop last.
  // If it will not all fit before the mode ends, the stops after the swap meet go first, then the ones before it,
  // so the swap meet (the walkable one, with Dex) stays on the route as long as it can.
  // The gift shop is never on the route. It is always on the map, shouting.
  var ROUTE_ORDER = ['yard', 'yard', 'yard', 'sports', 'thrift', 'mall', 'pal', 'flea', 'record', 'rental', 'rental', 'banned', 'thrift', 'pawn'];
  var STAY_EST = 25; // minutes we guess you spend at a stop
  function planRoute() {
    if (!S) return [];
    // the order is worked out from every stop (visited or not), so it never reshuffles as you go
    var all = S.day.stops.filter(openStop);
    var order = [], used = {};
    ROUTE_ORDER.forEach(function (t) {
      var s = all.filter(function (o) { return o.type === t && !used[o.id]; })[0];
      if (s) { order.push(s); used[s.id] = true; }
    });
    all.forEach(function (o) { if (!used[o.id]) order.push(o); });
    var list = order.filter(function (s) { return !s.visited; });
    // in the demo, leaving the swap meet ends the day, so it always goes last
    if (DEMO) list.sort(function (a, b) { return (a.type === 'flea') - (b.type === 'flea'); });
    var end = endT();
    function fits(l) {
      var t = S.time, from = lastStopId();
      // every stop on the route gets at least 20 minutes before the day ends
      for (var i = 0; i < l.length; i++) { t += costOf(l[i], from); from = l[i].id; if (t + 20 > end) return false; t += STAY_EST; }
      return true;
    }
    while (list.length && !fits(list)) {
      var fi = -1;
      for (var i = 0; i < list.length; i++) if (list[i].type === 'flea') fi = i;
      var cut = -1;
      for (var j = list.length - 1; j >= 0; j--) if (j > fi && list[j].type !== 'flea') { cut = j; break; }
      if (cut < 0 && fi > 0) cut = fi - 1;   // then the stop just before the swap meet
      if (cut < 0) cut = list.length - 1;    // only the swap meet is left, and even it does not fit
      list.splice(cut, 1);
    }
    return list;
  }
  function nextStop() { return planRoute()[0] || null; }
  function cheapestHere() {
    if (!S || !S.stop) return Infinity;
    var s = S.stop, min = Infinity;
    (s.items || []).concat(s.dug ? s.dig : [], s.rivalTable || []).forEach(function (it) {
      if (it.state === 'avail') min = Math.min(min, Math.max(1, Math.round(it.ask * 0.5)));
    });
    return min;
  }

  // =====================================================================================================
  // ---------- Round 3b: the new stores, the true stories and the collector moments ----------
  // =====================================================================================================
  // Full game only. The demo never gets here: its Saturday is built by curateDemo(), and addStores() is only called when !DEMO.

  // Things that last from one Saturday to the next: the banned list, Lonnie's friendship, the punch card, the late fee
  // and the binoculars. In a season they live in the season save. Outside a season (Back by noon, Free Play) in their own key.
  var keepObj = null;
  function K() {
    var o;
    if (S && S.season && SEASON) o = SEASON;
    else {
      if (!keepObj) { keepObj = store.get('keep', null); if (!keepObj || typeof keepObj !== 'object' || Array.isArray(keepObj)) keepObj = {}; }
      o = keepObj;
    }
    if (!Array.isArray(o.banned)) o.banned = [];
    if (!o.friend || typeof o.friend !== 'object') o.friend = {};
    if (typeof o.punch !== 'number' || !isFinite(o.punch) || o.punch < 0) o.punch = 0;
    if (!o.gear || typeof o.gear !== 'object') o.gear = {};
    return o;
  }
  function saveK() { if (DEMO) return; if (S && S.season && SEASON) saveSoon(); else store.set('keep', K()); }
  function satKey() { return S.season && SEASON ? SEASON.id + '|' + S.week : S.seed; }
  function isBanned(id) { return K().banned.some(function (b) { return b && b.id === id; }); }
  function hasBinoculars() { return !!K().gear.binoc || (S && S.bag.some(function (b) { return b.id === 'binoc'; })); }
  function trueTag(D) { return D && D.trueStory ? '<span class="truetag">' + esc(NP.TRUE_TAG) + '</span>' : ''; }
  function storyNote(id, text) { return '<div class="note true">' + trueTag(NP.STORIES[id]) + ' ' + esc(text) + '</div>'; }
  function openStop(s) { return !s.locked && !s.gift && !s.xban; }

  function rollGame(r, w) {
    var x = r(), t = x < w[0] ? 1 : x < w[0] + w[1] ? 2 : 3;
    return pick(r, NP.CATALOG.filter(function (g) { return g.tier === t; }));
  }
  var mediaUsed = {}; // what one store already has, so the same record is not in two bins
  function rollMedia(r, kind, fmts, w) {
    var x = r(), t = x < w[0] ? 1 : x < w[0] + w[1] ? 2 : 3;
    var all = NP.MEDIA.filter(function (m) { return m.kind === kind && fmts.indexOf(m.fmt) >= 0; });
    var list = all.filter(function (m) { return !mediaUsed[m.id]; });
    if (!list.length) list = all;
    var tl = list.filter(function (m) { return m.tier === t; });
    var e = pick(r, tl.length ? tl : list);
    mediaUsed[e.id] = true;
    return e;
  }
  function makeMedia(r, e, opts) {
    var it = makeItem(r, { id: e.id, t: e.t, p: 'k16', tier: e.tier, base: e.base }, { kind: e.kind, seller: opts.seller, ask: opts.ask });
    it.fmt = e.fmt; it.by = e.by; it.cond = 'loose';
    if (opts.sec) it.sec = opts.sec;
    return it;
  }

  // ---------- which stores are open today ----------
  // They rotate: two of the five on a Home by sundown day, one in Back by noon. The two rental stores count as one
  // (they are across the street from each other). A store you banned is never open again, but it stays on the map with a red X.
  var STORE_GROUPS = ['mall', 'banned', 'pal', 'record', 'rental'];
  var STORE_COST = { mall: 64, banned: 62, pal: 58, record: 60, rental: 56 }; // same drive formula as every other stop
  var PAL_MAX = 5;
  var nStore = 0;
  function baseStop(type, name, seller, cost) {
    return { id: 'n' + (nStore++), type: type, name: name, seller: seller, cost: cost, items: [], dig: [], dug: false, visited: false, rivalAt: null, rumor: false, cleared: false };
  }
  function addStores(day, seed, m) {
    var r = mulberry32(NP.hashStr('stores|' + seed));
    nStore = 0;
    var kp = K(), banned = isBanned('banned');
    var pool = STORE_GROUPS.filter(function (g) { return !(g === 'banned' && banned); });
    var picked = shuffle(r, pool).slice(0, m === 'noon' ? 1 : 2);
    day.storeGroups = picked;
    picked.forEach(function (g) {
      var made = makeStore(r, g);
      day.stops.splice.apply(day.stops, [1 + Math.floor(r() * day.stops.length), 0].concat(made));
    });
    // the store you banned stays on the map, with a red X on it
    if (banned) day.stops.push({ id: 'xban', type: 'banned', name: NP.STOPNAMES.banned[0], xban: true, cost: 0, items: [], dig: [], visited: false, seller: null });
    // binoculars, for reading far-away shelves: at a yard sale or the pawn shop, more likely on a day you could use them
    if (!kp.gear.binoc && r() < (picked.indexOf('banned') >= 0 ? 0.75 : 0.2)) {
      var hosts = day.stops.filter(function (s) { return (s.type === 'yard' || s.type === 'pawn') && openStop(s); });
      if (hosts.length) {
        var hs = pick(r, hosts), G = NP.GEAR.binoc;
        var bi = makeItem(r, { id: G.id, t: G.t, p: 'k16', base: 0 }, { kind: 'gear', ask: G.ask, seller: hs.seller });
        bi.minFrac = 0.66; hs.items.push(bi);
      }
    }
    placeMoments(r, day, m);
  }
  // one service story for a game store, picked from the data. Stories with the same title count once (the three trivia questions).
  function pickService(r, type) {
    var byTitle = {};
    Object.keys(NP.STORIES).forEach(function (k) {
      var D = NP.STORIES[k];
      if (D.pool === 'service' && D.where && D.where.indexOf(type) >= 0) (byTitle[D.title] = byTitle[D.title] || []).push(k);
    });
    var groups = Object.keys(byTitle).sort();
    return groups.length ? pick(r, byTitle[pick(r, groups)]) : null;
  }
  function makeStore(r, g) {
    var i, st;
    mediaUsed = {};
    if (g === 'mall') {
      st = baseStop('mall', NP.STOPNAMES.mall[0], 'mall', STORE_COST.mall);
      st.mallName = NP.MALL;
      for (i = 0; i < 5; i++) st.items.push(makeItem(r, rollGame(r, [0.45, 0.4]), { seller: 'mall', sealedP: 0.2, cibP: 0.45 }));
      st.scene = r() < 0.35 ? 'uturn' : 'case';
      st.clerkLine = r() < 0.6;
      if (st.scene === 'case') { st.caseStep = 0; st.caseLog = []; st.story = pickService(r, 'mall'); }
      return [st];
    }
    if (g === 'banned') {
      st = baseStop('banned', NP.STOPNAMES.banned[0], null, STORE_COST.banned);
      shuffle(r, NP.CATALOG.filter(function (x) { return x.p === 'k16'; })).slice(0, 6).forEach(function (e) {
        var it = makeItem(r, e, { seller: 'mall', tested: true, cibP: 0.5 }); it.corner = true; st.items.push(it);
      });
      st.waited = 0; st.wn = 0; st.en = 0;
      return [st];
    }
    if (g === 'pal') {
      st = baseStop('pal', NP.STOPNAMES.pal[0], 'pal', STORE_COST.pal);
      for (i = 0; i < 6; i++) st.items.push(makeItem(r, rollGame(r, [0.5, 0.38]), { seller: 'pal', cibP: 0.4 }));
      st.items.push(makeMedia(r, rollMedia(r, 'music', ['vinyl', 'cd', 'tape'], [0.6, 0.3]), { seller: 'pal', sec: 'crate' }));
      st.items.push(makeMedia(r, rollMedia(r, 'music', ['vinyl', 'cd', 'tape'], [0.6, 0.3]), { seller: 'pal', sec: 'crate' }));
      st.items.push(makeMedia(r, rollMedia(r, 'movie', ['vhs', 'dvd'], [0.6, 0.3]), { seller: 'pal', sec: 'crate' }));
      st.secs = [['', 'Games'], ['crate', 'The music and movie crate']];
      st.topics = shuffle(r, NP.PAL.topics).slice(0, 3).map(function (t) { return t.id; });
      st.chats = {};
      st.lostCard = r() < 0.2;
      return [st];
    }
    if (g === 'record') {
      st = baseStop('record', NP.STOPNAMES.record[0], r() < 0.5 ? 'snob' : 'chill', STORE_COST.record);
      var sl = st.seller;
      for (i = 0; i < 3; i++) st.items.push(makeMedia(r, rollMedia(r, 'music', ['vinyl'], [0.5, 0.35]), { seller: sl, sec: 'vinyl' }));
      for (i = 0; i < 3; i++) st.items.push(makeMedia(r, rollMedia(r, 'music', ['cd', 'tape'], [0.55, 0.35]), { seller: sl, sec: 'cds' }));
      for (i = 0; i < 3; i++) st.items.push(makeMedia(r, rollMedia(r, 'movie', ['vhs', 'dvd'], [0.55, 0.35]), { seller: sl, sec: 'movies' }));
      for (i = 0; i < 2; i++) { var gm = makeItem(r, rollGame(r, [0.55, 0.35]), { seller: sl, cibP: 0.3 }); gm.sec = 'games'; st.items.push(gm); }
      var picks = sl === 'snob' ? NP.RECORD.picksSnob : NP.RECORD.picksChill;
      for (i = 0; i < 2; i++) {
        var pk = makeMedia(r, rollMedia(r, i ? 'movie' : 'music', i ? ['vhs', 'dvd'] : ['vinyl', 'cd'], [0.2, 0.55]), { seller: sl, sec: 'picks' });
        pk.pick = picks[(i + Math.floor(r() * picks.length)) % picks.length]; st.items.unshift(pk);
      }
      for (i = 0; i < 5; i++) {
        var bin = makeMedia(r, rollMedia(r, r() < 0.6 ? 'music' : 'movie', ['vinyl', 'cd', 'tape', 'vhs', 'dvd'], [0.8, 0.18]), { seller: sl, ask: 1 });
        bin.minFrac = 1; bin.bin = true; st.dig.push(bin);
      }
      st.secs = [['picks', 'Staff picks wall'], ['vinyl', 'Vinyl bins'], ['cds', 'Used CDs and cassettes'], ['movies', 'VHS and DVD rack'], ['games', 'Small retro game shelf']];
      st.digLabel = 'Dig through the $1 bargain bin'; st.digTitle = NP.RECORD.bin;
      st.listenN = 0;
      if (sl === 'snob' && r() < 0.6) st.story = pickService(r, 'record');
      return [st];
    }
    // the two video rental stores, across the street from each other, both closing
    var a = baseStop('rental', NP.STOPNAMES.rental[0], 'rental', STORE_COST.rental);
    var b = baseStop('rental', NP.STOPNAMES.rental[1], 'rental', STORE_COST.rental);
    a.chain = 'a'; b.chain = 'b'; a.across = b.id; b.across = a.id;
    [a, b].forEach(function (s) {
      mediaUsed = {};
      var cheap = s.chain === 'b' ? 0.9 : 1;
      var add = function (it) { it.ask = Math.max(1, Math.round(it.ask * cheap)); s.items.push(it); };
      for (i = 0; i < 2; i++) { var nr = makeMedia(r, rollMedia(r, 'movie', ['vhs', 'dvd'], [0.6, 0.3]), { seller: 'rental', sec: 'new' }); nr.year = 2009 + Math.floor(r() * 6); add(nr); }
      for (i = 0; i < 3; i++) { var mv = makeMedia(r, rollMedia(r, 'movie', ['vhs', 'dvd'], [0.55, 0.35]), { seller: 'rental', sec: 'movies' }); mv.flags.rental = true; add(mv); }
      for (i = 0; i < 3; i++) {
        var gr = makeItem(r, rollGame(r, [0.6, 0.32]), { seller: 'rental', sealedP: 0, cibP: 0, damageP: s.chain === 'b' ? 0.45 : 0.3 });
        gr.sec = 'games'; gr.flags.rental = true; add(gr);
      }
      s.secs = [['new', NP.RENTAL.newReleases], ['movies', 'Movies'], ['games', 'Games (giant clamshell cases)'], ['standee', 'By the door']];
      s.candy = true;
      if (r() < 0.25) s.story = pickService(r, 'rental');
    });
    var ch = r() < 0.5 ? a : b, SD = NP.RENTAL.standee;
    var sd = makeItem(r, { id: SD.id, t: SD.t, p: 'k16', base: 0 }, { kind: 'standee', ask: SD.ask, seller: 'rental' });
    sd.minFrac = 0.5; sd.sec = 'standee'; ch.items.push(sd);
    if (!K().lateFeePaid) (r() < 0.5 ? a : b).lateFee = true;
    return [a, b];
  }

  // ---------- real collector moments, mixed into the other stops ----------
  function placeMoments(r, day, m) {
    var ids = Object.keys(NP.STORIES).filter(function (k) { var D = NP.STORIES[k]; return D.pool === 'moment' && D.where; }).sort();
    var n = m === 'noon' ? 2 : 3;
    shuffle(r, ids).forEach(function (id) {
      if (n <= 0) return;
      var D = NP.STORIES[id];
      var cand = day.stops.filter(function (s) { return openStop(s) && s.type !== 'flea' && D.where.indexOf(s.type) >= 0 && !s.moment && !s.story; });
      if (cand.length && applyMoment(r, pick(r, cand), id)) n--;
    });
    day.partner = r() < 0.6; // the phone call, on your first big buy of the day
  }
  function momentItems(s) { return s.items.filter(function (it) { return it.state === 'avail' && !it.featured && (it.kind === 'game' || it.kind === 'music' || it.kind === 'movie'); }); }
  function applyMoment(r, s, id) {
    var D = NP.STORIES[id], av = momentItems(s);
    if (!D.coded) { s.story = id; s.moment = id; return true; } // a plain story from the data (the ATM, or anything added later)
    if (id === 'lookedup') {
      if (!av.length) return false;
      var top = av.slice().sort(function (x, y) { return y.ask - x.ask; })[0];
      top.ask = Math.max(top.ask * 3, Math.round((top.base || 5) * 5)); top.minFrac = 0.92; top.lookedUp = true;
    } else if (id === 'kids') {
      if (av.length < 2) return false;
      pick(r, av).state = 'kids';
    } else if (id === 'box40') {
      var bx = makeItem(r, { id: 'box40', t: D.item, p: 'k16', base: 40 }, { kind: 'bulk', ask: 60, seller: s.seller });
      bx.minFrac = 0.7; s.items.push(bx);
    } else if (id === 'bundle') {
      if (av.length < 3) return false;
      s.bundle = true;
    } else if (id === 'comeback') {
      var pr = av.filter(function (x) { return x.ask >= 12; });
      if (!pr.length) return false;
      pick(r, pr).comeback = true;
    } else if (id === 'sticker') {
      if (!av.length) return false;
      shuffle(r, av).slice(0, 2).forEach(function (x) { x.flags.residue = true; });
    } else if (id === 'reseller') {
      if (av.length < 3) return false;
      s.reseller = true; s.acts = 0;
    } else return false;
    s.moment = id;
    return true;
  }
  // the guy with the folding wagon: after your second move at the stop, he buys the table out from under you
  function doResell(s) {
    s.resold = true;
    var av = s.items.concat(s.dug ? s.dig : []).filter(function (it) { return it.state === 'avail' && !it.featured; });
    if (av.length < 2) return;
    var keep = av.filter(function (it) { return NP.SPORTS.some(function (x) { return x.id === it.id; }); })[0] || av.slice().sort(function (x, y) { return x.ask - y.ask; })[0];
    av.forEach(function (it) { if (it !== keep) { it.state = 'gone'; it.goneBy = 'wagon'; it.line = ''; } });
    S.toast = (S.toast ? S.toast + ' ' : '') + NP.STORIES.reseller.line;
    track('moment_reseller_hit');
  }

  // ---------- plain stories (the data-driven ones) ----------
  function storyOf(s) { return s && s.story ? NP.STORIES[s.story] || null : null; }
  function storyState(s) { return s.ss || (s.ss = { n: {}, done: {}, open: false, line: '' }); }
  function storyGate(s) { var D = storyOf(s); if (!D || D.coded || !D.gate) return null; return storyState(s).open ? null : D.gate; }
  // why you cannot buy anything here right now ('' when you can)
  function blockedHere(s) {
    s = s || (S && S.stop); if (!s) return '';
    if (storyGate(s) === 'block') return 'Nobody is selling you anything yet.';
    if (s.lateFee) return 'Pay your late fee first. The system says so.';
    if (s.type === 'banned') return 'Nobody is coming.';
    return '';
  }
  function storyBox(s) {
    var D = storyOf(s); if (!D) return '';
    var h = '<div class="story">' + trueTag(D) + '<div class="story-h">' + esc(D.title) + '</div>';
    if (D.coded) {
      if (s.story === 'pricecheck' || s.story === 'tradein') h += '<div class="story-t">' + esc(D.text) + '</div>';
      else return '';
      return h + '</div>';
    }
    var st = storyState(s);
    h += '<div class="story-t">' + esc(D.text) + '</div>';
    if (st.line) h += '<div class="bubble">' + esc(st.line) + '</div>';
    var b = '';
    (D.choices || []).forEach(function (c, i) {
      if (st.open && D.gate) return;
      if (st.done[i] && !c.repeat) return;
      b += '<button class="' + (c.unblock ? 'offer fair' : 'offer lowball') + '" data-act="story" data-i="' + i + '"' + (c.cash && c.cash > S.cash ? ' disabled' : '') + '>' + esc(c.label) + '</button>';
    });
    if (b) h += '<div class="btns">' + b + '</div>';
    return h + '</div>';
  }
  function doStory(i) {
    var s = S.stop, D = storyOf(s);
    if (!D || D.coded) return;
    var c = (D.choices || [])[i]; if (!c) return;
    var st = storyState(s);
    if ((st.open && D.gate) || (st.done[i] && !c.repeat)) return;
    if (c.cash) { if (c.cash > S.cash) return; S.cash -= c.cash; }
    braydenCheck(null);
    actCost(c.min || 0);
    var n = st.n[i] = (st.n[i] || 0) + 1;
    st.done[i] = true;
    st.line = c.lines ? c.lines[Math.min(n - 1, c.lines.length - 1)] : (c.line || '');
    if (c.unblock) st.open = true;
    if (c.priceMult) s.items.concat(s.dig).forEach(function (it) { if (it.state === 'avail') it.ask = Math.max(1, Math.round(it.ask * c.priceMult)); });
    track('story_' + s.story + '_' + i);
    if (!checkSundown()) render();
  }

  // ---------- the store signs (made up, and nothing like any real chain's sign) ----------
  function signHTML(s) {
    if (s.type === 'record') return '<div class="sign sign-rec" aria-label="' + esc(s.name) + '"><div class="sr-main"><span class="g">MUSIC</span> <span class="o">STORE</span></div>' +
      '<div class="sr-add"><span class="tape1">(ALSO MOVIES)</span><span class="tape2">(ALSO GAMES)</span></div></div>';
    if (s.type === 'rental') return '<div class="sign sign-vid ' + (s.chain || 'a') + '" aria-label="' + esc(s.name) + '"><div class="sv-box"><span class="sv-t">' + esc(s.name.toUpperCase()) + '</span></div>' +
      '<div class="closing">STORE CLOSING · EVERYTHING MUST GO</div></div>';
    if (s.type === 'mall') return '<div class="sign sign-mall"><small>' + esc(NP.MALL.toUpperCase()) + ' · UPPER LEVEL</small><span>' + esc(s.name.toUpperCase()) + '</span></div>';
    if (s.type === 'pal') return '<div class="sign sign-pal"><span>' + esc(s.name) + '</span><small>Come on in. Mind the boxes.</small></div>';
    if (s.type === 'banned') return '<div class="sign sign-ban"><span>' + esc(s.name.toUpperCase()) + '</span><small>PLEASE WAIT TO BE HELPED</small></div>';
    return '';
  }

  // ---------- the mall game store: the glass case ----------
  function caseBox(s) {
    if (s.type !== 'mall' || s.scene !== 'case') return '';
    var D = NP.STORIES.glasscase, st = s.caseStep || 0;
    var h = '<div class="story glasscase">' + trueTag(D) + '<div class="story-h">The glass case</div>' +
      '<div class="gc-row"><div class="artbox" data-gcart="1"></div><div class="info"><div class="it-t">' + esc(D.game) + '</div>' +
      '<div class="gc-tags"><span class="gc-price">$' + D.price.toLocaleString('en-US') + '</span>' + D.tags.map(function (t) { return '<span class="gc-tag">' + esc(t) + '</span>'; }).join('') + '</div>' +
      '<div class="story-t">' + esc(D.text) + '</div></div></div>';
    (s.caseLog || []).forEach(function (l) { h += '<div class="bubble' + (l[0] === 'you' ? ' hero' : '') + '">' + esc(l[1]) + '</div>'; });
    if (st === 2) h += '<div class="laughwrap"><canvas class="laughcv" width="120" height="72" aria-label="You, laughing a short little laugh."></canvas><div class="note">' + esc(D.laugh) + '</div></div>';
    if (s.caseEnd) h += '<div class="note">' + esc(s.caseEnd) + '</div>';
    var b = [];
    if (st === 0) b.push(['caseask', 'Ask why (2 min)', '']);
    if (st === 1) b.push(['casereply', 'Say: "' + D.reply + '" (2 min)', '']);
    if (st === 2) b.push(['caselaugh', 'Laugh and walk away', 'full']);
    if (st < 3) b.push(['casebuy', 'Try to buy it ($' + D.price.toLocaleString('en-US') + ')', 'lowball']);
    if (st < 2) b.push(['casewalk', 'Walk away', '']);
    if (b.length) h += '<div class="btns">' + b.map(function (x) { return '<button class="offer ' + (x[2] || 'fair') + '" data-act="' + x[0] + '">' + esc(x[1]) + '</button>'; }).join('') + '</div>';
    return h + '</div>';
  }
  function doCase(act) {
    var s = S.stop, D = NP.STORIES.glasscase;
    if (!s || s.type !== 'mall') return;
    s.caseLog = s.caseLog || [];
    var who = NP.SELLERS.mall.name;
    if (act === 'caseask' && s.caseStep === 0) { braydenCheck(null); actCost(2); s.caseLog.push(['you', 'You: "' + D.ask + '"'], ['clerk', who + ': "' + D.why + '"']); s.caseStep = 1; track('glasscase_ask'); }
    else if (act === 'casereply' && s.caseStep === 1) { actCost(2); s.caseLog.push(['you', 'You: "' + D.reply + '"'], ['clerk', who + ': "' + D.why2 + '"']); s.caseStep = 2; s.laughNow = true; }
    else if (act === 'caselaugh' && s.caseStep === 2) { actCost(1); s.caseStep = 3; s.caseEnd = D.walk; S.ev.laughed = true; track('glasscase_laugh'); }
    else if (act === 'casebuy' && s.caseStep < 3) { actCost(2); s.caseLog.push(['you', D.buy.replace('{cash}', money(S.cash))]); S.ev.caseTry = true; track('glasscase_buy_try'); }
    else if (act === 'casewalk' && s.caseStep < 2) { s.caseStep = 4; s.caseEnd = 'You walk away from the glass case. It hums at you.'; }
    else return;
    if (!checkSundown()) render();
  }
  // the trilogy U-turn: you walk in, see the wall, and walk right back out. 5 minutes for nothing.
  function renderUturn() {
    var s = S.stop, D = NP.STORIES.uturn;
    var h = hud() + '<div class="screen stop uturnscr"><h2>' + stopIcon(s.type) + ' ' + esc(s.name) + '</h2>' + signHTML(s) +
      '<div class="story uturn">' + trueTag(D) + '<div class="story-h">' + esc(D.title) + '</div>' +
      '<canvas class="scenecv" id="uturncv" width="320" height="150" data-act="utskip" aria-label="You walk into the store, look at the wall of three loose discs, turn all the way around and walk back out."></canvas>' +
      '<div class="story-t">' + esc(D.text) + '</div><div class="gc-tags"><span class="gc-tag">' + esc(D.tagLine) + '</span><span class="gc-price">$60 EACH</span></div>' +
      '<div class="ut-after"' + (s.uturnSeen ? '' : ' hidden') + '><div class="bubble big hero">' + esc(D.after) + '</div>' +
      (s.clerkLine ? '<div class="bubble">' + esc(NP.SELLERS.mall.name) + ', as the door closes: "' + esc(D.clerk) + '"</div>' : '') +
      '<div class="note">That cost you 5 minutes and got you nothing. Worth it.</div></div></div>' +
      '<div class="stop-actions ut-after"' + (s.uturnSeen ? '' : ' hidden') + '>' + leaveButtons() + '</div></div>';
    app.innerHTML = h;
    var seen = s.uturnSeen;
    if (NP.Scene) NP.Scene.uturn($('#uturncv'), getLook(), utReveal, seen); else utReveal();
  }
  function utReveal() {
    if (!S || !S.stop || S.stop.scene !== 'uturn') return;
    S.stop.uturnSeen = true;
    document.querySelectorAll('.ut-after').forEach(function (e) { e.hidden = false; });
  }

  // ---------- the Banned List store: Staff Only Games ----------
  function renderBanned() {
    var s = S.stop, D = NP.STORIES.banned, see = hasBinoculars();
    var h = hud() + '<div class="screen stop bannedscr"><h2>' + stopIcon(s.type) + ' ' + esc(s.name) + '</h2>' + signHTML(s);
    if (S.toast) { h += '<div class="toast">' + esc(S.toast) + '</div>'; S.toast = ''; }
    h += '<div class="story">' + trueTag(D) + '<div class="story-h">' + esc(D.title) + '</div>' +
      '<canvas class="scenecv" id="countercv" width="320" height="150" aria-label="Two employees walk back and forth behind the counter. Neither one looks at you. The clock on the wall keeps going."></canvas>' +
      '<div class="story-t">' + esc(D.text) + '</div>';
    if (s.bline) h += '<div class="bubble">' + esc(s.bline) + '</div>';
    h += '<div class="note">You have been standing at the counter for ' + (s.waited || 0) + ' minutes.</div>';
    if (!s.walked) h += '<div class="btns"><button class="offer fair" data-act="bwait">Keep waiting (5 min)</button><button class="offer fair" data-act="bexcuse">"Excuse me?" (5 min)</button><button class="offer lowball" data-act="bout">Walk out</button></div>';
    h += '</div>';
    h += '<h3 class="sec-h">The 16-bit corner (behind the counter)</h3><div class="note">' + esc(see ? D.sharp : D.corner + ' ' + D.blur) + '</div>' +
      '<div class="items corner' + (see ? '' : ' blur') + '">';
    s.items.forEach(function (it) {
      h += '<div class="item corner-it" id="card-' + it.uid + '"><div class="artbox" data-art="' + it.uid + '"></div><div class="info">' +
        (see ? '<div class="it-t">' + esc(it.t) + '</div>' + tagHTML(it) : '<div class="it-t blurtxt" aria-hidden="true">' + esc(it.t) + '</div><div class="sr-only">A game you cannot read from here.</div>') +
        '<div class="it-a">' + (see ? 'Sticker says <b>' + money(it.ask) + '</b>' : 'Sticker says <b class="blurtxt">' + money(it.ask) + '</b>') + '</div><div class="stamp bad">BEHIND THE COUNTER</div></div></div>';
    });
    h += '</div>';
    if (s.walked) {
      h += '<div class="story review">' + trueTag(D) + '<div class="story-h">Leave a review</div>';
      if (s.review) h += '<div class="stars">&#9733;</div><div class="bubble">Your review: "' + esc(s.review) + '"</div>';
      else h += '<div class="story-t">How was your visit to ' + esc(s.name) + '? There is one star. Only one.</div><div class="stars">&#9733;</div><div class="btns">' +
        D.reviews.map(function (l, i) { return '<button class="offer lowball" data-act="breview" data-i="' + i + '">&#9733; "' + esc(l) + '"</button>'; }).join('') + '</div>';
      h += '<div class="banstamp"><span class="redx" aria-hidden="true"></span>' + esc(D.bannedLabel) + '</div><div class="bubble big hero">You: "' + esc(D.out) + '"</div></div>';
      h += '<div class="stop-actions">' + leaveButtons() + '</div>';
    } else h += '<div class="stop-actions"><div class="note">The only way out is to walk out.</div><button class="big" data-act="bout">Walk out</button></div>';
    h += '</div>';
    app.innerHTML = h;
    drawArts();
    if (NP.Scene) NP.Scene.counter($('#countercv'), { look: getLook(), time: function () { return S ? S.time : 600; }, sharp: hasBinoculars });
  }
  function doBanned(act, i) {
    var s = S.stop, D = NP.STORIES.banned;
    if (!s || s.type !== 'banned') return;
    if (act === 'bwait' && !s.walked) { actCost(5); s.waited = (s.waited || 0) + 5; s.bline = D.waits[(s.wn++) % D.waits.length]; track('banned_wait'); }
    else if (act === 'bexcuse' && !s.walked) { actCost(5); s.waited = (s.waited || 0) + 5; s.bline = D.excuse[Math.min(s.en++, D.excuse.length - 1)]; track('banned_excuse'); }
    else if (act === 'bout' && !s.walked) {
      s.walked = true; S.ev.banned = true;
      var kp = K();
      if (!isBanned('banned')) kp.banned.push({ id: 'banned', name: s.name, when: S.season ? 'Saturday ' + S.week : 'Saturday #' + S.runNo, review: '' });
      saveK();
      track('banned_store'); step('banned_store');
    } else if (act === 'breview' && s.walked && !s.review) {
      actCost(1); s.review = D.reviews[i] || D.reviews[0];
      K().banned.forEach(function (b) { if (b.id === 'banned' && !b.review) b.review = s.review; });
      saveK(); track('review_1star');
    } else return;
    if (!checkSundown()) { render(); window.scrollTo(0, act === 'bout' ? document.body.scrollHeight : window.scrollY); }
  }

  // ---------- the Friendly Store: Lonnie ----------
  function palArrive(s) {
    var kp = K(), f = kp.friend.pal = kp.friend.pal || { lvl: 0, last: '' };
    var key = satKey();
    if (f.last !== key) { f.lvl = Math.min(PAL_MAX, (f.lvl || 0) + 1); f.last = key; }
    s.lvl = f.lvl;
    kp.punch += 1; // one punch for the visit
    if (s.lostCard && kp.punch > 3) { spend(5); s.lostLine = NP.PAL.lostCard; track('punch_lost_card'); }
    if (f.lvl >= PAL_MAX) {
      s.hello = NP.PAL.hiMax + ' Good to see you. I saved you the first look.';
      s.items.forEach(function (it) { if (it.state === 'avail') it.ask = Math.max(1, Math.round(it.ask * 0.9)); });
      var r = mulberry32(NP.hashStr(S.seed + '|' + s.id + '|new'));
      var na = makeItem(r, rollGame(r, [0.1, 0.6]), { seller: 'pal', cibP: 0.5 });
      na.uid = 'na' + s.id; na.newArr = true; s.items.unshift(na);
      track('pal_max_friend');
    }
    saveK();
  }
  function palBox(s) {
    if (s.type !== 'pal') return '';
    var D = NP.STORIES.pal, lvl = s.lvl || 0, meter = '';
    for (var i = 0; i < PAL_MAX; i++) meter += '<span class="fm' + (i < lvl ? ' on' : '') + '"></span>';
    var h = '<div class="story pal">' + trueTag(D) + '<div class="story-h">Talk to ' + esc(NP.PAL.clerk) + '</div><div class="story-t">' + esc(D.text) + '</div>' +
      '<div class="friend"><span class="fm-k">Friendship</span> ' + meter + ' ' + (lvl >= PAL_MAX ? '<b>Regular.</b> ' + esc(NP.PAL.perk) : 'Goes up each Saturday you stop by.') + '</div>';
    if (s.lostLine) h += '<div class="note">' + esc(s.lostLine) + '</div>';
    if (s.chatA) h += '<div class="bubble">' + esc(s.chatA) + '</div><div class="bubble">' + esc(s.chatMore) + ' (That one more thing took another 3 minutes.)</div>' + (s.chatReward ? '<div class="reward">' + esc(s.chatReward) + '</div>' : '');
    var left = (s.topics || []).filter(function (id) { return !s.chats[id]; });
    if (left.length) h += '<div class="btns">' + left.map(function (id) {
      var T = NP.PAL.topics.filter(function (x) { return x.id === id; })[0];
      return '<button class="offer fair" data-act="chat" data-id="' + id + '">Ask about: ' + esc(T.label) + ' (' + T.min + ' min)</button>';
    }).join('') + '</div>';
    else h += '<div class="note">You have heard all of his stories for today. He has more. He always has more.</div>';
    return h + punchHTML() + '</div>';
  }
  function doChat(id) {
    var s = S.stop;
    var T = NP.PAL.topics.filter(function (x) { return x.id === id; })[0];
    if (!s || s.type !== 'pal' || !T || s.chats[id]) return;
    braydenCheck(null);
    actCost(T.min + 3); // he always has one more thing
    s.chats[id] = true; S.ev.chats = (S.ev.chats || 0) + 1;
    s.chatA = T.a; s.chatMore = T.more; s.chatReward = palReward(s, T.reward, id);
    track('pal_chat'); track('pal_chat_' + T.reward);
    if (!checkSundown()) render();
  }
  function palReward(s, kind, id) {
    var r = mulberry32(NP.hashStr(S.seed + '|' + s.id + '|' + id));
    if (kind === 'disc') {
      if (s.disc) return 'He already took a little off. He thinks about taking off more. He does not.';
      s.disc = true;
      s.items.forEach(function (it) { if (it.state === 'avail') it.ask = Math.max(1, Math.round(it.ask * 0.9)); });
      return 'Everything here is 10% off for you today.';
    }
    if (kind === 'tip') {
      var best = null, bs = null, bv = 0;
      S.day.stops.forEach(function (st) {
        if (!openStop(st) || st.visited || st === s || st.type === 'banned') return;
        st.items.forEach(function (it) {
          if (it.state !== 'avail' || it.kind !== 'game' || (it.flags && it.flags.repro)) return;
          var v = (it.base || 0) * (COND_MULT[it.cond] || 1) - it.ask * 0.5;
          if (v > bv) { bv = v; best = it; bs = st; }
        });
      });
      if (!best) return 'He heard about a good one but cannot remember where. It will come to him. It will not.';
      best.tipped = true; s.tipText = best.t + ' at ' + bs.name;
      return 'Lonnie\'s tip: there is a ' + best.t + ' at ' + bs.name + ' today. "Do not tell Dex."';
    }
    // hold: something set aside behind the counter, at a friend's price
    var hd = makeItem(r, rollGame(r, [0.15, 0.6]), { seller: 'pal', cibP: 0.5 });
    hd.uid = 'hold' + s.id + id; hd.held = true; hd.ask = Math.max(1, Math.round(hd.base * (COND_MULT[hd.cond] || 1) * 0.7)); hd.minFrac = 0.85;
    hd.flags.repro = false;
    s.items.unshift(hd);
    return 'He set aside ' + hd.t + ' for you. It is behind the counter, at a friend\'s price.';
  }
  // the punch card: a punch per visit and per purchase, at Lonnie's and at any friendly shop (the chill record store)
  function punchHere() { var s = S && S.stop; return !!(s && (s.type === 'pal' || (s.type === 'record' && s.seller === 'chill'))); }
  function punchHTML() {
    var p = K().punch, holes = '';
    for (var i = 0; i < 10; i++) holes += '<span class="ph' + (i < Math.min(p, 10) ? ' on' : '') + '"></span>';
    var h = '<div class="punch"><div class="punch-h">PUNCH CARD</div><div class="punch-row" aria-label="' + Math.min(p, 10) + ' of 10 punches">' + holes + '</div>' +
      '<div class="punch-k">' + Math.min(p, 10) + ' of 10. One punch per visit and per purchase. Good at any friendly shop.</div>';
    if (p >= 10) h += '<div class="btns"><button class="offer full" data-act="punch" data-how="credit">Cash it in: $10 off here</button><button class="offer fair" data-act="punch" data-how="game">Cash it in: a free game</button></div>';
    return h + '</div>';
  }
  function doPunch(how) {
    var s = S.stop, kp = K();
    if (!punchHere() || kp.punch < 10) return;
    kp.punch -= 10;
    if (how === 'credit') { S.credit[s.id] = (S.credit[s.id] || 0) + 10; S.toast = 'Card cashed in. You have $10 to spend here.'; }
    else {
      var r = mulberry32(NP.hashStr(S.seed + '|' + s.id + '|free|' + S.bag.length));
      var it = makeItem(r, rollGame(r, [0.55, 0.4]), { seller: s.seller, cibP: 0.3 });
      it.uid = 'pfree' + s.id + S.bag.length; it.flags.repro = false; it.state = 'sold'; it.paid = 0;
      var b = JSON.parse(JSON.stringify(it)); b.stopType = s.type; b.boughtAt = s.id; S.bag.push(b);
      S.toast = 'Card cashed in. ' + (s.type === 'pal' ? 'Lonnie' : 'The clerk') + ' hands you ' + it.t + '. Free.';
    }
    saveK(); track('punch_cashin_' + how); sfx('cash');
    render();
  }

  // ---------- the record store ----------
  function recordBox(s) {
    if (s.type !== 'record') return '';
    var h = '<div class="story rec">' + '<div class="story-h">The listening station</div><div class="story-t">' +
      (s.seller === 'snob' ? 'The clerk today is the snobby one. He is watching what you pick up.' : 'The clerk today is the chill one. He takes punch cards from anywhere.') + '</div>';
    if (s.listenLine) h += '<div class="bubble">' + esc(s.listenLine) + '</div>';
    h += '<div class="btns"><button class="offer fair" data-act="listen">Listen to a record (10 min)</button></div>';
    if (s.seller === 'chill') h += punchHTML();
    return h + '</div>';
  }
  function doListen() {
    var s = S.stop; if (!s || s.type !== 'record') return;
    braydenCheck(null);
    actCost(10);
    var v = s.items.filter(function (it) { return it.fmt === 'vinyl' && !it.listened && it.state === 'avail'; })[0];
    var n = s.listenN = (s.listenN || 0) + 1;
    if (v) { v.listened = true; s.listenLine = NP.RECORD.listen[(n - 1) % NP.RECORD.listen.length] + ' (' + v.by + ', ' + v.t + '.)'; }
    else s.listenLine = 'You have listened to every record in the bins. The clerk asks if you are going to buy something. It is a fair question.';
    S.ev.listened = (S.ev.listened || 0) + 1;
    track('listen');
    if (!checkSundown()) render();
  }

  // ---------- the video rental stores ----------
  function rentalBox(s) {
    if (s.type !== 'rental') return '';
    var other = S.day.stops.filter(function (x) { return x.id === s.across; })[0];
    var h = '<div class="story rent"><div class="story-t">' + (other ? esc(other.name) + ' is right ' + esc(NP.RENTAL.across) + '. ' + (other.visited ? 'You were just there.' : 'A 4 minute walk. They are also closing.') : '') + '</div>';
    if (s.lateFee) h += '<div class="bubble">' + esc(NP.RENTAL.lateFee) + '</div><div class="btns"><button class="offer full" data-act="latefee"' + (S.cash < 5 ? ' disabled' : '') + '>' + esc(NP.RENTAL.lateFeeBtn) + '</button></div>';
    if (s.feeLine) h += '<div class="note">' + esc(s.feeLine) + '</div>';
    if (s.candy && !s.ateCandy) h += '<div class="note">' + esc(NP.RENTAL.candy) + '</div><div class="btns"><button class="offer fair" data-act="candy"' + (S.cash < 1 ? ' disabled' : '') + '>' + esc(NP.RENTAL.candyBtn) + '</button></div>';
    if (s.ateCandy) h += '<div class="note">' + esc(NP.RENTAL.candyLine) + '</div>';
    return h + '</div>';
  }
  function doLateFee() {
    var s = S.stop; if (!s || !s.lateFee || S.cash < 5) return;
    S.cash -= 5; s.lateFee = false; s.feeLine = NP.RENTAL.lateFeePaid; S.ev.lateFee = true;
    K().lateFeePaid = true; saveK();
    actCost(2); track('late_fee_paid'); sfx('cash');
    if (!checkSundown()) render();
  }
  function doCandy() {
    var s = S.stop; if (!s || !s.candy || s.ateCandy || S.cash < 1) return;
    S.cash -= 1; s.ateCandy = true; S.ev.candy = true;
    actCost(1); track('candy');
    if (!checkSundown()) render();
  }

  // ---------- make me an offer on the whole box ----------
  function bundleList(s) { return s.items.concat(s.dug ? s.dig : []).filter(function (it) { return it.state === 'avail' && !it.featured && (it.kind === 'game' || it.kind === 'music' || it.kind === 'movie' || it.kind === 'bulk'); }); }
  var BUNDLE = { lowball: 0.45, fair: 0.62, full: 0.85 };
  function bundleBox(s) {
    if (!s.bundle) return '';
    var L = bundleList(s), D = NP.STORIES.bundle;
    var h = '<div class="story">' + trueTag(D) + '<div class="story-h">' + esc(D.title) + '</div>';
    if (s.bundleLine) h += '<div class="bubble">' + esc(s.bundleLine) + '</div>';
    if (L.length < 2) return h + (s.bundleLine ? '' : '<div class="note">Not enough left for a box deal.</div>') + '</div>';
    var sum = L.reduce(function (a, it) { return a + it.ask; }, 0);
    h += '<div class="story-t">' + esc(D.line) + ' ' + L.length + ' things, ' + money(sum) + ' on the stickers.</div><div class="btns">';
    [['lowball', 'Lowball'], ['fair', 'Fair'], ['full', 'Round it down']].forEach(function (o) {
      var p = Math.max(1, Math.round(sum * BUNDLE[o[0]]));
      h += '<button class="offer ' + o[0] + '" data-act="bundle" data-kind="' + o[0] + '"' + (p > S.cash + creditHere() || blockedHere(s) ? ' disabled' : '') + '>' + o[1] + ' ' + money(p) + ' for all of it</button>';
    });
    return h + '</div></div>';
  }
  function doBundle(kind) {
    var s = S.stop, L = bundleList(s);
    if (!s.bundle || L.length < 2 || !BUNDLE[kind] || blockedHere(s)) return;
    var sum = L.reduce(function (a, it) { return a + it.ask; }, 0), price = Math.max(1, Math.round(sum * BUNDLE[kind]));
    if (price > S.cash + creditHere()) return;
    braydenCheck(null);
    actCost(T_HAGGLE);
    var need = L.reduce(function (a, it) { return a + it.minFrac * it.ask; }, 0) / sum * 0.8; // a box deal gets a break
    if (kind === 'full' || BUNDLE[kind] >= need) {
      payFor(price);
      var left = price;
      L.forEach(function (it, i) { var p = i === L.length - 1 ? left : Math.round(price * it.ask / sum); left -= p; takeItem(it, Math.max(0, p), kind); it.line = ''; });
      s.bundleLine = 'Deal. "Take the box too. Take the table if you want it."';
      sfx('cash'); sfx('accept'); track('bundle_bought');
    } else { s.bundleLine = '"No. The whole box is worth more than that. Probably. I never counted it."'; sfx('reject'); track('bundle_no'); }
    if (!checkSundown()) { render(); afterBuy(); }
  }

  // ---------- the phone call: "Where are you going to put it?" ----------
  function partnerCall() {
    var D = NP.STORIES.partner;
    track('partner_call');
    var ov = document.createElement('div');
    ov.className = 'callov';
    ov.innerHTML = '<div class="callbox" role="dialog" aria-modal="true" aria-label="Phone call">' + trueTag(D) + '<div class="call-h">&#128241; INCOMING CALL</div>' +
      '<div class="story-t">' + esc(D.text) + '</div><div class="btns">' + D.answers.map(function (a, i) { return '<button class="offer fair" data-call="' + i + '">' + esc(a[0]) + '</button>'; }).join('') + '</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-call]'); if (!b) return;
      var a = D.answers[+b.getAttribute('data-call')];
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      spend(3);
      S.toast = 'You: "' + a[0] + '" ' + a[1];
      if (!checkSundown()) render();
    });
    var f = ov.querySelector('button'); if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
  }
  function afterBuy() {
    if (S.callNow) { S.callNow = false; partnerCall(); return; }
    maybeBrokeTip(); if (!tipEl) maybeUnsponsored();
  }

  // ---------- rendering ----------
  var app;
  function render() {
    music(!S || S.screen === 'title' ? 'title' : S.screen === 'walk' ? 'swap' : 'title');
    if (S && S.season && (S.screen === 'map' || S.screen === 'stop' || S.screen === 'walk' || S.screen === 'home')) saveSoon();
    if (!S || S.screen === 'title') return renderTitle();
    if (S.screen === 'map') return renderMap();
    if (S.screen === 'walk') return NP.Walk ? NP.Walk.render(app, hud()) : renderStop();
    if (S.screen === 'stop') return S.stop.gift ? renderGift() : S.stop.type === 'banned' ? renderBanned() : (S.stop.type === 'mall' && S.stop.scene === 'uturn') ? renderUturn() : renderStop();
    if (S.screen === 'home') return renderHome();
    if (S.screen === 'results') return renderResults();
    if (S.screen === 'title') return renderTitle();
  }

  function sunPct() { return Math.max(0, Math.min(100, (S.time - START) / (endT() - START) * 100)); }
  function sunText() {
    var left = Math.max(0, endT() - S.time), lt = Math.floor(left / 60) + 'h ' + (left % 60) + 'm left';
    return (modeOf() === 'noon' ? 'Back by noon. ' : 'Home by sundown (5:30 PM). ') + lt;
  }
  // light refresh for the clock while walking (no full re-render, so the ticker keeps scrolling)
  function updateHud() {
    var c = document.querySelector('.hud .clock'); if (c) c.textContent = fmtTime(Math.min(S.time, endT()));
    var bar = document.querySelector('.sunbar div'); if (bar) bar.style.width = sunPct() + '%';
    var sp = document.querySelector('.sunbar span'); if (sp) sp.textContent = sunText();
  }

  // the line under the daylight bar: where you are going next, so nobody has to work it out from the map
  function nextLine() {
    if (!S) return '';
    if (S.screen === 'walk' && S.stop) return 'You are at <b>' + esc(S.stop.name) + '</b>. The exit is the gate at the bottom.';
    var r = planRoute(), n = r[0];
    if (S.screen === 'stop' && S.stop) {
      return n ? 'Next stop: <b>' + esc(n.name) + '</b> &middot; ' + costOf(n) + ' min drive' : 'No time for another stop after this one. Head home after.';
    }
    return n ? 'Next stop: <b>' + esc(n.name) + '</b> &middot; ' + costOf(n) + ' min &middot; home by ' + endLabel() : 'No time for another stop. Head home and shelve it.';
  }

  function hud() {
    var h = '<div class="hud"><div class="hud-l"><span class="clock">' + fmtTime(Math.min(S.time, endT())) + '</span>' +
      (S.wx ? '<span class="wx wx-' + S.wx.id + '" title="' + esc(S.wx.name) + '">' + S.wx.icon + ' ' + S.wx.temp + '&deg;F</span>' : '') +
      '<span class="cash">' + money(S.cash) + (creditHere() ? ' <small class="credit">+' + money(creditHere()) + ' credit</small>' : '') + '</span><span class="bagc">Bag: ' + S.bag.length + '</span></div>' +
      '<div class="hud-r">' + soundButton() + fsButton() + tipsButton() + '<label class="adtoggle"><input type="checkbox" data-act="adfree"' + (adFree ? ' checked' : '') + '> Ad-Free<span class="ad-long"> Edition</span></label></div></div>' +
      '<div class="sunbar" title="Daylight left"><div style="width:' + sunPct() + '%"></div><span>' + sunText() + '</span></div>' +
      '<div class="nextbar">' + nextLine() + '</div>';
    var lvl = adLevel();
    if (lvl >= 1) {
      var pool = adFree ? NP.TICKER_ADFREE : NP.TICKER;
      var msgs = [];
      for (var i = 0; i < Math.min(pool.length, lvl + 1); i++) msgs.push(pool[(i + S.visited) % pool.length].replace('{end}', endLabel()));
      h += '<div class="ticker lvl' + Math.min(lvl, 4) + '"><div class="tick-in">' + msgs.map(esc).join(' &#9733; ') + ' &#9733; ' + msgs.map(esc).join(' &#9733; ') + '</div></div>';
    }
    return h;
  }

  var cartOpen = false;
  function cartHTML() {
    if (!DEMO) return cartFull();
    return '<div class="cart-label"><div class="cart-brand">NOSTALGIA PRO</div><div class="cart-sub">' + (DEMO ? 'THE DEMO' : 'THE GAME') + ' &middot; SELECT A MODE</div>' +
      '<button class="cart-item mode" data-act="start" data-mode="noon">BACK BY NOON <small>' + (DEMO ? 'the demo' : 'short run') + '</small></button>' +
      (DEMO ? '<button class="cart-item mode" disabled aria-disabled="true">HOME BY SUNDOWN <small>full version</small></button>'
        : '<button class="cart-item mode" data-act="start" data-mode="sundown">HOME BY SUNDOWN <small>the whole day</small></button>') +
      (DEMO ? '<button class="cart-item" disabled aria-disabled="true">FREE PLAY <small>full version</small></button>'
        : '<button class="cart-item" data-act="start" data-free="1" data-mode="' + esc(store.get('mode', 'sundown')) + '">FREE PLAY <small>random Saturday, ' + (store.get('mode', 'sundown') === 'noon' ? 'back by noon' : 'home by sundown') + '</small></button>') +
      '<button class="cart-item" disabled aria-disabled="true">2 COLLECTORS <small>sold separately</small></button>' +
      (DEMO ? '<button class="cart-item" disabled aria-disabled="true">HOME SHELF <small>full version</small></button>'
        : '<button class="cart-item" data-act="shelf">HOME SHELF</button>') +
      '<button class="cart-item" data-act="howto">HOW TO PLAY</button>' +
      (NP.Creator ? '<button class="cart-item" data-act="look">' + (hasLook() ? 'CHANGE YOUR LOOK' : 'MAKE YOUR CHARACTER') + '</button>' : '') +
      (feedbackOk() ? '<a class="cart-item small" href="' + esc(CFG.FEEDBACK_URL) + '" target="_blank" rel="noopener" data-track="feedback_open">TELL US WHAT YOU THINK</a>' : '') +
      '</div><div class="cart-foot"><label class="adtoggle"><input type="checkbox" data-act="adfree"' + (adFree ? ' checked' : '') + '> Ad-Free Edition</label>' + soundButton() + fsButton() +
      '<span class="cart-fine">MADE IN A GARAGE &middot; NOT FOR RESALE</span></div>';
  }
  // the full game's menu: the season first (Continue, New game), then the one-day runs
  function cartFull() {
    var sv = readSave(), se = sv && sv.season;
    var cont = se ? '<button class="cart-item mode" data-act="continue">CONTINUE <small>' + esc(se.endingPending ? 'your ending is waiting' : seasonLabelLc(sv.run ? sv.run.week : se.week)) + '</small></button>' : '';
    return '<div class="cart-label"><div class="cart-brand">NOSTALGIA PRO</div><div class="cart-sub">THE GAME &middot; SELECT A MODE</div>' +
      cont +
      '<button class="cart-item mode" data-act="newgame">NEW GAME <small>12 Saturdays</small></button>' +
      '<button class="cart-item mode" data-act="start" data-mode="noon">BACK BY NOON <small>today\'s quick run</small></button>' +
      '<button class="cart-item" data-act="start" data-free="1" data-mode="sundown">FREE PLAY <small>one random Saturday</small></button>' +
      '<button class="cart-item" disabled aria-disabled="true">2 COLLECTORS <small>sold separately</small></button>' +
      '<button class="cart-item" data-act="shelf">HOME SHELF</button>' +
      '<button class="cart-item" data-act="howto">HOW TO PLAY</button>' +
      (NP.Creator ? '<button class="cart-item" data-act="look">' + (hasLook() ? 'CHANGE YOUR LOOK' : 'MAKE YOUR CHARACTER') + '</button>' : '') +
      (feedbackOk() ? '<a class="cart-item small" href="' + esc(CFG.FEEDBACK_URL) + '" target="_blank" rel="noopener" data-track="feedback_open">TELL US WHAT YOU THINK</a>' : '') +
      '</div><div class="cart-foot"><label class="adtoggle"><input type="checkbox" data-act="adfree"' + (adFree ? ' checked' : '') + '> Ad-Free Edition</label>' + soundButton() + fsButton() +
      '<span class="cart-fine">MADE IN A GARAGE &middot; NOT FOR RESALE</span></div>';
  }
  // the season, under the menu: where you are, or a friendly note if the save could not be read
  function seasonBox() {
    if (DEMO) return '';
    var sv = readSave();
    if (saveBad) { track('save_bad', true); return '<div class="seasonbox bad"><b>We could not read your saved season.</b> It might be from an older version, or something went sideways. Nothing is broken. Start a New game whenever you are ready.</div>'; }
    if (!sv) return '<div class="seasonbox"><b>Is it on the shelf?</b> Start a New game: twelve Saturdays, one shelf.</div>';
    var se = sv.season, w = sv.run ? sv.run.week : se.week;
    return '<div class="seasonbox"><b>Your season:</b> ' + esc(seasonLabelLc(w)) + ' &middot; ' + money(sv.run ? sv.run.cash : se.cash) + ' &middot; ' + se.shelf.length + ' on the shelf' +
      (se.ending ? ' &middot; ending: ' + esc(se.ending.name) : '') + '</div>';
  }
  // starting over when there is a season saved: ask first, on a plain screen (no browser pop-ups)
  function renderNewGameCheck() {
    var sv = readSave(), se = sv.season;
    app.innerHTML = '<div class="screen confirm"><h2>Start a new season?</h2>' +
      '<div class="bubble big">Your saved season (' + esc(seasonLabelLc(se.week)) + ', ' + money(se.cash) + ', ' + se.shelf.length + ' on the shelf) will be gone. The fridge note cannot help you here.</div>' +
      '<div class="btns center"><button class="big" data-act="newgame-yes">Start over</button><button data-act="totitle">Keep my season</button></div></div>';
    window.scrollTo(0, 0);
  }
  function beginNewSeason() {
    cartOpen = false;
    newSeason();
    var go = function () { startSeasonSaturday(); };
    if (NP.Creator && !hasLook()) showCreator(go, 'Looks good. Start the season'); else go();
  }
  function showCart() {
    var wasOpen = cartOpen;
    cartOpen = true;
    var c = $('#cart'), hint = $('#tvhint');
    if (!c) return;
    if (!wasOpen) { sfx('vcr'); track('start_pressed'); step('f02_menu'); }
    c.hidden = false; if (hint) hint.hidden = true;
    // the mode you played last time gets the focus
    var last = DEMO ? null : c.querySelector('[data-act="continue"]') || c.querySelector('[data-act="newgame"]');
    var first = last || c.querySelector('.cart-item');
    if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
    try { c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
  }

  // a sponsored heat advisory, and your reaction to it
  function sponsorLine(wx, react) {
    var SP = NP.SPONSOR;
    if (!wx || !wx.sponsored || !SP) return '';
    return '<span class="spons">' + esc((SP.weatherBy && SP.weatherBy[wx.id]) || SP.weather) + '</span>' + (react ? '<span class="react">You: "' + esc(SP.react) + '"</span>' : '');
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
    step('f01_title');
    var best = store.get('best', null), bestN = DEMO ? null : store.get('best_noon', null), today = store.get(dayKey(todaySeed, 'sundown'), null), todayN = store.get(dayKey(todaySeed, 'noon'), null);
    var pv = previewDay(), wx = pv.wx, home = store.get('home', []);
    var tv = !!NP.Intro;
    app.innerHTML =
      '<div class="screen title">' +
      (tv ? '<div class="tvwrap"><canvas id="tvcv" width="320" height="200" aria-label="A CRT TV on a VCR. The title Nostalgia Pro is on screen. Press Enter or tap to start."></canvas></div>' +
        '<div class="tv-hint" id="tvhint"' + (cartOpen ? ' hidden' : '') + '>' + (coarse() ? 'Tap the TV to start' : 'Press Enter or click the TV') + '</div>'
        : '<canvas id="logo" width="640" height="150"></canvas>') +
      '<div class="cart" id="cart"' + (tv && !cartOpen ? ' hidden' : '') + '>' + cartHTML() + '</div>' +
      seasonBox() +
      '<div class="daily">' + (DEMO ? '<b>Demo Saturday</b>' : '<b>Back by noon</b> &middot; ' + dayLabel() + ' &middot; ' + esc(todaySeed)) +
      '<div class="dl-wx">' + wx.icon + ' ' + wx.temp + '&deg;F, ' + esc(wx.name) + '. ' + esc(wx.blurb) + sponsorLine(wx) + '</div>' +
      '<div class="dl-lot">' + (DEMO ? 'Featured lot' : 'Today\'s featured lot') + ': <b>' + esc(pv.featured.name) + '</b> at ' + esc(pv.featured.stopName) + ', asking ' + money(pv.featured.ask) + '. Everyone sees the same box.</div>' +
      (pv.theme ? '<div class="dl-theme"><b>' + esc(pv.theme.name) + '.</b> ' + esc(pv.theme.line) + '</div>' : '') +
      (DEMO ? '<small>This is the free demo: one Saturday, three stops, and it ends after the swap meet. The full version gets a new Saturday every day.</small></div>'
        : '<small>Today\'s quick run is the same for everyone. Resets at midnight, desert time.</small></div>') +
      '<details class="howto"><summary><b>How it works</b></summary><ul>' +
      (DEMO ? '<li>Back by noon. Each stop costs time. The big Drive button always takes you to the next one.</li>'
        : '<li>New game is a season: 12 Saturdays, home by sundown each time. You work all week, Friday is payday, and your money and shelf carry over. It saves itself.</li>' +
          '<li>Back by noon is today\'s quick run. Free Play is one random Saturday.</li><li>Each stop costs daylight. The big Drive button always takes you to the next one.</li>') +
      '<li>Make an offer: lowball, fair or full price. Sellers have opinions.</li>' +
      (DEMO ? '' : '<li>Sell or trade in games from your bag at thrift stores, the pawn shop and swap meet tables. Ask for more if you dare.</li>' +
        '<li>Rivals: Dex every Saturday, plus two or three of Brayden, Phone Guy Phil, Brody, Gary and Slab Steve. Each one changes one rule. The morning forecast says who is out.</li>' +
        '<li>Stores rotate in and out: a mall game store, Lonnie\'s, a record store, two video rental stores and one store you will only visit once. Some of what happens in them is based on a true story.</li>') +
      '<li>Is it on the shelf? Checking costs time. Buying a duplicate costs points.</li>' +
      '<li>Watch out for repros, disc rot and a guy named ' + NP.RIVAL.name + '.</li>' +
      (NP.Walk ? '<li>The swap meet is on foot. Walking the aisles uses daylight too.</li>' : '') +
      '<li>Weather matters. Heat burns daylight faster. Rain keeps the crowds (and Dex) away.</li>' +
      (DEMO ? '<li>The demo ends when you leave the Saguaro Swap Meet. The full version runs all the way to sundown.</li>' +
        '<li>Go home, shelve your haul, share your card.</li></ul></details>'
        : '<li>Sellers remember you. So does the guy you lowballed.</li>' +
        '<li>Go home, shelve your haul, share your card. Your first run each day stays on your home shelf.</li></ul></details>') +
      (todayN ? '<div class="scores">Today, back by noon: <b>' + todayN.score + '</b> (' + esc(todayN.title) + ')</div>' : '') +
      (best ? '<div class="scores">Best ever' + (DEMO ? '' : ', home by sundown') + ': <b>' + best.score + '</b></div>' : '') +
      (bestN ? '<div class="scores">Best ever, back by noon: <b>' + bestN.score + '</b></div>' : '') +
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
      home.push({ d: S.season ? 'season|' + SEASON.id + '|' + S.week : S.seed, id: b.id, t: b.t, p: b.p, fmt: b.fmt, cond: b.cond === 'sealed' && b.decision === 'open' ? 'cib' : b.cond, kind: b.kind, tag: tag, sticker: !!b.sticker });
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
      var sum = store.get(dayKey(d, 'sundown'), null) || store.get(dayKey(d, 'noon'), null);
      var sp = d.split('|');
      h += '<div class="hs-day"><div class="hs-lab">' + (sp[0] === 'season' ? 'Season &middot; Saturday ' + esc(sp[2]) : 'Saturday #' + (/^\d{4}-\d{2}-\d{2}$/.test(d) ? runNumber(d) : '?') + ' &middot; ' + esc(d)) +
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
      if (rec) el.appendChild(NP.makeArt({ kind: rec.kind, id: rec.id, p: rec.p, fmt: rec.fmt, cond: rec.cond, sticker: rec.sticker }, 2));
    });
    window.scrollTo(0, 0);
  }

  // ---------- How to play: the fridge list and the tips, on one short screen ----------
  function renderHowTo() {
    music('title');
    var touch = coarse();
    var h = '<div class="screen howto-scr"><h2>How to play</h2>' +
      '<div class="howto-grid"><div class="todo"><div class="todo-h">Saturday to-do</div><ul>' +
      (NP.GOALS ? NP.GOALS(DEMO ? 'noon' : store.get('mode', 'noon')) : []).map(function (g, i, a) { return '<li' + (i === a.length - 1 ? ' class="dex"' : '') + '>' + esc(g) + '</li>'; }).join('') + '</ul></div>' +
      '<ul class="howto-tips">' +
      (DEMO ? '' : '<li><b>Two ways to play.</b> Back by noon is a short run that ends at 12:00 PM. Home by sundown is the whole Saturday, till 5:30 PM.</li>') +
      '<li><b>Getting around.</b> The big Drive button takes you to the next stop on today\'s route. Driving costs daylight. ' + (touch ? 'At the swap meet, tap where you want to go (tap a table to shop it), or use the pad.' : 'At the swap meet, click where you want to go (click a table to shop it), or walk with the arrow keys or WASD and press Space at a table.') + '</li>';
    ['offers', 'pricey', 'dupe', 'dex', 'broke'].forEach(function (k) {
      var T = NP.TIPS && NP.TIPS[k]; if (!T) return;
      h += '<li><b>' + esc(T.h) + (/[.?!]$/.test(T.h) ? '' : '.') + '</b> ' + esc(T.short) + '</li>';
    });
    h += '</ul></div><div class="btns center"><button class="big" data-act="howback">Back</button></div></div>';
    app.innerHTML = h;
    window.scrollTo(0, 0);
  }

  function stopIcon(t) {
    return { yard: '&#127968;', sports: '&#127944;', thrift: '&#128717;', flea: '&#9978;', pawn: '&#128176;', gift: '&#11088;',
      mall: '&#128722;', banned: '&#128682;', pal: '&#129309;', record: '&#127926;', rental: '&#128252;' }[t] || '';
  }
  function stopBlurb(s) {
    return {
      yard: 'Cheap. Untested. Bring a flashlight.',
      sports: 'Rumor has it there is a whole bin of football games.',
      thrift: 'Shelves, carts, and one locked case.',
      flea: 'Big. Lots of vendors. Lots of opinions.',
      pawn: 'Pricey, but everything is tested and works.',
      gift: 'MUST SEE! Official merch! Nothing here helps your shelf!',
      mall: 'Inside ' + NP.MALL + '. Everything is behind glass. So are the prices.',
      banned: 'Retro games, probably. Two employees. Nobody has ever been helped.',
      pal: 'Lonnie talks. A lot. The clock does not stop for it.',
      record: 'Vinyl, tapes, CDs, movies and a little game shelf. Mostly opinions.',
      rental: 'STORE CLOSING. Everything must go. Even the late fees.'
    }[s.type];
  }

  // the card at the top of the map: today's route, and one big button to the next stop
  // the card at the top of the map: one big button to the next stop first (so it is on screen without scrolling,
  // even on a phone turned sideways), then today's route folded up underneath
  function routeCard() {
    var r = planRoute(), n = r[0], broke = S.cash < 2;
    var h = '<div class="routecard"><div class="rc-h">Today\'s route <span class="rc-mode">' + esc(NP.MODES[modeOf()].name) + ' &middot; home by ' + endLabel() + '</span></div>';
    if (n) {
      h += '<button class="big drive" data-act="go" data-id="' + n.id + '" data-via="next">Drive to: ' + esc(n.name) + ' &#9654;</button>' +
        '<div class="rc-sub">' + costOf(n) + ' min drive' + (costOf(n) > Math.min(DRIVE_CAP, n.cost) ? ' (heat)' : '') + ' &middot; arrive ' + fmtTime(S.time + costOf(n)) +
        (DEMO && n.type === 'flea' ? ' &middot; the demo ends here' : '') + '</div>';
    } else {
      h += '<div class="rc-none">No time for another stop. Time to go home and shelve it.</div><button class="big drive" data-act="gohome">Head home and shelve it &#9654;</button>';
    }
    if (broke) h += '<div class="rc-broke">Out of cash? Sell or trade in games from your bag at a thrift store, the pawn shop or a swap meet table. Cash you do not spend is worth points too.</div>';
    if (S.day.theme && S.history.length === 0) h += '<div class="rc-theme"><b>' + esc(S.day.theme.name) + '.</b> ' + esc(S.day.theme.line) + '</div>';
    if (S.day.rivals && S.day.rivals.length) h += '<div class="rc-spotted"><b>Spotted today:</b> ' + esc(spottedText()) + '</div>';
    if (S.season && S.week === NP.SEASON.weeks && S.history.length === 0) h += '<div class="rc-final">' + esc(NP.FINALE_NOTE) + '</div>';
    var later = r.slice(1), done = S.history.length;
    h += '<details class="rc-more"><summary>' + (later.length ? 'Then ' + later.length + ' more stop' + (later.length === 1 ? '' : 's') : 'Then home') + (done ? ' &middot; ' + done + ' done' : '') + ' &middot; see the route</summary><ul class="rc-list">';
    S.history.forEach(function (id) {
      var s = S.day.stops.filter(function (x) { return x.id === id; })[0];
      if (s) h += '<li class="rc-done">&#10003; ' + esc(s.name) + '</li>';
    });
    var t = S.time, from = lastStopId();
    r.forEach(function (s, i) {
      t += costOf(s, from); from = s.id;
      h += '<li class="' + (i === 0 ? 'rc-next' : 'rc-later') + '">' + (i === 0 ? '&#9654; ' : '') + esc(s.name) + ' <small>' + (i === 0 ? 'arrive ' + fmtTime(t) : 'about ' + fmtTime(t)) +
        (DEMO && s.type === 'flea' ? ' &middot; the demo ends here' : '') + '</small></li>';
      t += STAY_EST;
    });
    h += '<li class="rc-home">&#127968; Home by ' + endLabel() + '</li></ul></details>';
    if (n) h += '<div class="rc-or">' + (S.history.length ? '<button class="homebtn" data-act="gohome">Head home now</button>' : '') + '<span>Or pick any stop below</span></div>';
    return h + '</div>';
  }

  function renderMap() {
    if (!S.mapTracked) { S.mapTracked = true; track('map_open'); step('f05_map'); }
    step('map_' + S.history.length + '_shown');
    mapIdle();
    var h = hud() + '<div class="screen map"><h2>Where to next?</h2>';
    if (S.toast) { h += '<div class="toast">' + esc(S.toast) + '</div>'; S.toast = ''; }
    h += routeCard();
    if (S.wx && S.wx.id !== 'sunny' && S.time === START) h += '<div class="wxnote wx-' + S.wx.id + '">' + S.wx.icon + ' ' + S.wx.temp + '&deg;F. ' + esc(S.wx.blurb) + sponsorLine(S.wx, true) + '</div>';
    if (DEMO) h += '<div class="demonote">DEMO SATURDAY: three stops are open. The demo ends when you leave the Saguaro Swap Meet.</div>';
    var bb = billboard();
    if (bb) h += '<div class="billboard">' + esc(bb) + '</div>';
    h += '<h3 class="anystop">Or pick any stop</h3>';
    h += '<div class="shelfnote">Your shelf at home: about ' + S.day.shelfCount + ' games. You remember maybe half of them.</div><div class="stops">';
    var nx = nextStop();
    S.day.stops.forEach(function (s) {
      if (s.xban) {
        // a store you banned: still on the map, never again
        var bn = K().banned.filter(function (b) { return b.id === 'banned'; })[0] || {};
        h += '<div class="stopcard banned xban"><span class="redx big" aria-hidden="true"></span><div class="st-h"><span class="ico">' + stopIcon(s.type) + '</span> ' + esc(s.name) + '</div>' +
          '<div class="st-b"><b class="banlab">' + esc(NP.STORIES.banned.bannedLabel) + '</b>' + (bn.when ? ' since ' + esc(bn.when) : '') + (bn.review ? '. Your review: &#9733; "' + esc(bn.review) + '"' : '') + '</div>' +
          '<div class="st-done">"' + esc(NP.STORIES.banned.out) + '"</div></div>';
        return;
      }
      if (s.locked) {
        h += '<div class="stopcard locked ' + s.type + '"><div class="st-h"><span class="ico">' + stopIcon(s.type) + '</span> ' + esc(s.name) + '</div>' +
          '<div class="st-b">' + esc(stopBlurb(s)) + '</div><div class="sticker">FULL VERSION, SOLD SEPARATELY</div></div>';
        return;
      }
      var c = costOf(s), arrive = S.time + c;
      var tooLate = arrive > endT();
      var isNext = nx && nx.id === s.id;
      var cls = 'stopcard ' + s.type + (s.visited ? ' done' : '') + (tooLate && !s.visited ? ' late' : '') + (isNext ? ' next' : '');
      var gp = s.gift ? Math.round(10 + adLevel() * 15) : 0;
      h += '<div class="' + cls + '">' + (isNext ? '<div class="nextflag">NEXT ON YOUR ROUTE</div>' : '') + '<div class="st-h"><span class="ico">' + stopIcon(s.type) + '</span> ' + esc(s.name) + '</div>' +
        '<div class="st-b">' + esc(stopBlurb(s)) + (s.gift && adLevel() >= 2 ? ' Prices up ' + gp + '% since this morning!' : '') + '</div>' +
        '<div class="st-m">' + c + ' min' + (c > Math.min(DRIVE_CAP, s.cost) ? ' (heat)' : '') + ' &middot; arrive ' + fmtTime(arrive) + '</div>';
      if (S.day.featured && S.day.featured.stopId === s.id && !s.visited) h += '<div class="featured">&#9733; Today\'s featured lot is here. ' + money(S.day.featured.ask) + '.</div>';
      var mc = !s.visited ? memCard(s) : '';
      if (mc) h += '<div class="mem">' + esc(mc) + '</div>';
      if (!s.visited) s.items.forEach(function (it) { if (it.tipped && it.state === 'avail') h += '<div class="mem">Lonnie\'s tip: ' + esc(it.t) + ' is here today.</div>'; });
      if (s.across && !s.visited) { var acr = S.day.stops.filter(function (x) { return x.id === s.across; })[0]; if (acr) h += '<div class="st-b">Right across the street from ' + esc(acr.name) + '.</div>'; }
      if (s.rumor && !s.visited) h += '<div class="rumor">' + NP.RIVAL.name + '\'s van was spotted heading here around ' + fmtTime(s.rivalAt) + '.</div>';
      var others = rivalsAt(s).filter(function (id) { return id !== 'dex'; });
      if (others.length && !s.visited) h += '<div class="rivchips">' + others.map(function (id) { return '<span class="rivchip">' + esc(rivalName(id)) + ' is here</span>'; }).join('') + '</div>';
      if (s.demoRaid && !s.visited) h += '<div class="rumor">' + NP.RIVAL.name + '\'s van is headed here too. He will show up right after you do.</div>';
      if (s.visited) h += '<div class="st-done">Visited</div>';
      else if (tooLate) h += '<div class="st-done">Not enough daylight</div>';
      else h += '<button data-act="go" data-id="' + s.id + '" data-via="map"' + (s.gift ? ' class="giftbtn"' : '') + '>' + (s.gift ? 'Visit the Gift Shop!' : 'Drive there') + '</button>';
      h += '</div>';
    });
    h += '</div><button class="big home" data-act="gohome">Head home and shelve it</button></div>';
    app.innerHTML = h;
  }

  // a billboard on the drive, now and then (never in the walkable swap meet, never on top of a haggle)
  // onDrive: the drive screen gets one on every drive after the first; the map only after your 2nd, 4th, ... stop
  function billboard(onDrive) {
    var SP = NP.SPONSOR; if (!SP || !SP.billboards) return '';
    var n = S.history.length;
    if (n === 0 || (!onDrive && n % 2)) return '';
    var pool = adFree ? SP.billboardsAdFree : SP.billboards;
    return pool[(NP.hashStr(S.seed + '|bb') + n) % pool.length];
  }

  // nobody has touched anything on the map for 30 seconds: they might be stuck. Counted once.
  var idleT = null;
  function mapIdle() {
    if (idleT) clearTimeout(idleT);
    var at = S.history.length;
    idleT = setTimeout(function () { idleT = null; if (S && S.screen === 'map' && S.history.length === at) step('map_' + at + '_idle30'); }, 30000);
  }

  function itemNotes(it) {
    var n = [];
    // the back of the box: you only get to read it once you pick it up and Inspect it
    if (it.blow) n.push(it.blow);
    if (steveHold(it)) n.push('On hold for Slab Steve. "I don\'t open things." Pay 20% more and it is yours.');
    if ((it.inspected || it.tested) && NP.itemInfo) {
      var bx = NP.itemInfo(it).box;
      if (bx) n.push('Back of the ' + (it.cond === 'loose' ? 'label' : 'box') + ': "' + bx + '"');
    }
    if (it.featured) n.push(DEMO ? 'The featured lot. In the full version, there is a new one every day.' : 'Today\'s featured lot. Everyone playing today sees this exact box.');
    if (it.planted && !it.inspected) n.push('Complete in box for that price? That seems very generous.');
    if (it.kind === 'merch') n.push('Official Nostalgia Pro merch. Worth nothing. Costs something.');
    // Round 3b
    if ((it.kind === 'music' || it.kind === 'movie') && NP.itemInfo) { var mb = NP.itemInfo(it).box; if (mb) n.push('Back of the ' + (it.kind === 'music' ? 'sleeve' : 'box') + ': "' + mb + '"'); }
    if (it.pick) n.push(it.pick);
    if (it.year) n.push(NP.RENTAL.newNote.replace('{y}', it.year));
    if (it.flags && it.flags.rental) n.push(it.kind === 'game' ? NP.RENTAL.clam : 'Ex-rental. The rental sticker will never come off.');
    if (it.bin) n.push('From the $1 bin. A dollar is a dollar.');
    if (it.held) n.push('Lonnie held this one behind the counter for you.');
    if (it.newArr) n.push('New arrival. Regulars get the first look.');
    if (it.yours) n.push('This was yours a minute ago. He paid you $2 for it.');
    if (it.listened) n.push('You listened to it at the station.');
    if (it.tipped) n.push('Lonnie told you about this one.');
    if (it.kind === 'gear') n.push('Not a game. Does not go on the shelf. Goes in the van.');
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
    if (it.kind === 'music' || it.kind === 'movie') return NP.FORMATS[it.fmt] || 'Used';
    if (it.kind === 'gear') return 'Gear';
    if (it.kind === 'standee') return 'Cardboard';
    if (it.kind === 'bulk') return 'Box of 40';
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
      '<div class="it-p">' + (it.kind === 'game' || it.kind === 'grail' ? esc(plat.name) + ' &middot; ' : (it.kind === 'music' || it.kind === 'movie') ? esc(it.by) + ' &middot; ' : '') + '<span class="pill ' + it.cond + '">' + condLabel(it) + '</span></div>' +
      '<div class="it-a">Asking <b>' + money(it.ask) + '</b>' + (s.type === 'flea' && sellerName ? ' <span class="who">(' + esc(sellerName) + ')</span>' : '') + '</div>';
    itemNotes(it).forEach(function (n) { h += '<div class="note' + (/ALREADY/.test(n) ? ' warn' : '') + '">' + esc(n) + '</div>'; });
    // true-story notes, with their tag
    if (it.lookedUp && it.state === 'avail') h += storyNote('lookedup', NP.STORIES.lookedup.line.replace('{$}', money(it.ask)));
    if (it.flags && it.flags.residue && !it.cleaned) h += storyNote('sticker', NP.STORIES.sticker.line);
    if (it.kind === 'bulk') h += storyNote('box40', NP.STORIES.box40.line);
    if (it.state === 'kids') h += storyNote('kids', NP.STORIES.kids.line);
    if (it.line) h += '<div class="bubble">' + esc(it.line) + '</div>';
    var blk = it.state === 'avail' ? blockedHere(s) : '';
    if (it.state === 'avail' && blk) {
      h += '<div class="note warn">' + esc(blk) + '</div>';
    } else if (it.state === 'avail') {
      h += '<div class="btns">';
      if (steveHold(it)) {
        var sp = Math.round(it.ask * 1.2);
        h += '<button class="offer full steve" data-act="offer" data-kind="steve" data-uid="' + it.uid + '"' + (sp > S.cash + creditHere() ? ' disabled' : '') + '>Take it off hold ' + money(sp) + ' (+20%)</button>';
      } else offers(it).forEach(function (o) {
        if (o[0] === 'lowball' && rivalHere('gary')) { h += '<button class="offer lowball" disabled aria-disabled="true">Gary already tried that</button>'; return; }
        h += '<button class="offer ' + o[0] + '" data-act="offer" data-kind="' + o[0] + '" data-uid="' + it.uid + '"' + (o[2] > S.cash + creditHere() ? ' disabled' : '') + '>' + o[1] + ' ' + money(o[2]) + '</button>';
      });
      h += '</div><div class="btns small">';
      if (it.kind === 'game' && !it.inspected && !it.tested) h += '<button data-act="inspect" data-uid="' + it.uid + '">Inspect (5 min)</button>';
      if (it.kind === 'game' && !it.checked) h += '<button data-act="check" data-uid="' + it.uid + '">Is it on the shelf? (10 min)</button>';
      if (s.story === 'pricecheck') h += '<button data-act="pricecheck" data-uid="' + it.uid + '">' + esc(NP.STORIES.pricecheck.button) + '</button>';
      if (it.comeback) h += '<button data-act="comeback" data-uid="' + it.uid + '">' + esc(NP.STORIES.comeback.button) + '</button>';
      h += '</div>';
    } else if (it.state === 'sold') h += '<div class="stamp">IN THE BAG ' + money(it.paid) + '</div>';
    else if (it.state === 'pulled') h += '<div class="stamp bad">OFF THE TABLE</div>';
    else if (it.state === 'kids') h += '<div class="stamp bad">' + esc(NP.STORIES.kids.stamp) + '</div>';
    else if (it.state === 'gone') h += '<div class="stamp bad">' + (it.goneBy === 'brayden' ? 'BRAYDEN GOT IT (MOM\'S CARD)' : it.goneBy === 'wagon' ? esc(NP.STORIES.reseller.stamp) : it.goneBy === 'vest' ? esc(NP.STORIES.comeback.stamp) : esc(NP.RIVAL.name.toUpperCase()) + ' GOT IT') + '</div>';
    h += '</div></div>';
    return h;
  }

  function renderStop() {
    var s = S.stop;
    var seller = NP.SELLERS[s.seller];
    if (s.reseller && !s.resold && (s.acts || 0) >= 2) doResell(s);
    var h = hud() + '<div class="screen stop st-' + s.type + '"><h2>' + stopIcon(s.type) + ' ' + esc(s.name) + '</h2>' + signHTML(s);
    if (s.cleared) h += '<div class="rival">' + NP.RIVAL.name + ' from ' + NP.RIVAL.shop + ' beat you here. He took the good stuff and set up a table out front.</div>';
    var refuse = s.cola && NP.SPONSOR && NP.SPONSOR.refuse ? NP.SPONSOR.refuse[s.seller] : null;
    if (seller && refuse) {
      // loudly refuses to sell out, while selling out
      h += '<div class="bubble big">' + esc(seller.name) + ': "' + esc(refuse[0]) + '"</div>' +
        '<div class="glam"><canvas class="glamcan" width="22" height="30" aria-label="A can of ' + esc(NP.SPONSOR.name) + '"></canvas><div class="glam-t">' + esc(refuse[1]) + '</div></div>';
    } else if (seller && s.hello) h += '<div class="bubble big">' + esc(seller.name) + ': "' + esc(s.hello) + '"</div>';
    if (s.type === 'flea') h += '<div class="bubble big">Different vendor at every table. Some of them know what they got.</div>';
    h += rivalNotes(s);
    // Round 3b: what is going on at this store today
    h += storyBox(s) + caseBox(s) + palBox(s) + recordBox(s) + rentalBox(s) + bundleBox(s);
    if (s.reseller && s.resold) h += '<div class="story">' + trueTag(NP.STORIES.reseller) + '<div class="story-h">' + esc(NP.STORIES.reseller.title) + '</div><div class="story-t">' + esc(NP.STORIES.reseller.line) + '</div></div>';
    if (adLevel() >= 2) h += '<div class="poster">' + (adFree ? 'POSTER: The Ad-Free Edition. No posters. (Except this one.)' : 'POSTER: Nostalgia Pro: The Shelf Dust. Now in Sealed. Gift Shop open till ' + endLabel() + '.') + '</div>';
    if (S.toast) { h += '<div class="toast">' + esc(S.toast) + '</div>'; S.toast = ''; }
    var buys = blockedHere(s) ? null : buyerFor(s);
    if (buys) h += '<div class="sellhint">This stop buys ' + (NP.BUYERS[buys].media ? 'games, music and movies' : 'games') + ' too. <button class="linkish" data-act="jumpsell">Sell or trade in &#8595;</button></div>';
    else if (NP.NOBUY && NP.NOBUY[s.type] && S.bag.length) h += '<div class="sellhint">' + esc(NP.NOBUY[s.type]) + '</div>';
    if (storyGate(s) === 'hide') h += '<div class="note warn">The good stuff is in there somewhere. You would have to look.</div>';
    else if (s.secs) {
      // a store with sections (the record store, the rental stores, Lonnie's crate)
      s.secs.forEach(function (sc) {
        var list = s.items.filter(function (it) { return (it.sec || '') === sc[0]; });
        if (list.length) h += '<h3 class="sec-h">' + esc(sc[1]) + '</h3><div class="items">' + list.map(function (it) { return itemCard(it, s); }).join('') + '</div>';
      });
      if (s.dug && s.dig.length) h += '<h3 class="sec-h">' + esc(s.digTitle || 'From the back') + '</h3><div class="items">' + s.dig.map(function (it) { return itemCard(it, s); }).join('') + '</div>';
    } else {
      h += '<div class="items">';
      s.items.forEach(function (it) { h += itemCard(it, s); });
      if (s.dug) s.dig.forEach(function (it) { h += itemCard(it, s); });
      h += '</div>';
    }
    if (s.rivalTable && s.rivalTable.length) {
      h += '<h3>' + NP.RIVAL.shop + ' table (flipped merch)</h3><div class="items">';
      s.rivalTable.forEach(function (it) { h += itemCard(it, s); });
      h += '</div>';
    }
    if (buys) h += sellHTML(s);
    h += '<div class="stop-actions">';
    if (s.dig.length && !s.dug && storyGate(s) !== 'hide') h += '<button data-act="dig">' + (s.type === 'sports' ? 'Dig deeper into the football bin' : s.digLabel || 'Dig through the back boxes') + ' (15 min)</button>';
    h += leaveButtons() + '</div></div>';
    app.innerHTML = h;
    drawArts();
    var gc = document.querySelector('[data-gcart]');
    if (gc && !gc.firstChild) gc.appendChild(NP.makeArt({ kind: 'game', id: 'llm2', p: 'k16', cond: 'sealed', sticker: true }, 3));
    var lc = document.querySelector('.laughcv');
    if (lc && NP.Scene) { if (s.laughNow) { s.laughNow = false; NP.Scene.laugh(lc, getLook()); } else NP.Scene.laugh(lc, getLook(), true); }
    if (refuse) drawGlamCan();
    if (buys) soonCheckTips();
  }

  // the way out of a stop: straight to the next stop on the route, or back to the map
  function leaveButtons() {
    if (DEMO && S.stop && S.stop.type === 'flea') return '<button class="big" data-act="leave" data-via="map">Back in the car (ends the demo)</button>';
    var cr = creditHere();
    var warn = cr ? '<div class="creditwarn">You still have ' + money(cr) + ' in store credit here. It stays here when you leave.</div>' : '';
    return warn + leaveButtonsOnly();
  }
  function leaveButtonsOnly() {
    var after = planRoute(), n = after[0];
    if (!n) return '<button class="big" data-act="leavehome">Head home and shelve it &#9654;</button><button data-act="leave" data-via="map">Back to the map</button>';
    return '<button class="big drive" data-act="gonext" data-id="' + n.id + '">Next stop: ' + esc(n.name) + ' &#9654;</button>' +
      '<button data-act="leave" data-via="map">Back to the map</button>';
  }
  function drawGlamCan() {
    var c = document.querySelector('.screen .glamcan, .wpanel .glamcan');
    if (!c || !NP.drawCan) return;
    var g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 22, 30);
    NP.drawCan(g, 6, 8, 1, 1);
    NP.drawSparkle(g, 17, 6, 1, 0.3);
  }
  // out of money: say it once, kindly, and do not end anything
  function maybeBrokeTip() {
    if (!S || !S.stop) return;
    var c = cheapestHere(), have = S.cash + creditHere();
    if (have >= 2 && (c === Infinity || have >= c)) return;
    if (!S.brokeTracked) { S.brokeTracked = true; step('broke_' + S.history.length); }
    showTip('broke', null);
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
    h += '<div class="stop-actions"><div class="giftnote">The Gift Shop wants you to stay. The doors are heavier than they need to be.</div>' + leaveButtons() + '</div></div>';
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
    document.querySelectorAll('[data-bart]').forEach(function (el) {
      var b = bagItem(el.getAttribute('data-bart'));
      if (b && !el.firstChild) el.appendChild(NP.makeArt(b, 2));
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
  function outOfTime() { return S.time >= endT(); }

  function checkSundown() {
    if (outOfTime()) {
      S.time = Math.min(S.time, endT());
      // store credit still sitting at this stop when the day runs out counts as left behind (Grok Bot r2 fix, re-applied in r3a)
      var left = creditHere();
      var creditMsg = '';
      if (left) { S.ev.creditLeft += left; creditMsg = ' You left ' + money(left) + ' of store credit at ' + S.stop.name + '. Store credit does not travel.'; track('credit_left'); S.credit[S.stop.id] = 0; }
      var timeMsg = modeOf() === 'noon' ? 'It\'s noon. You said you would be back by noon. Time to head home.' : 'The sun is going down. Time to head home.';
      S.toast = timeMsg + creditMsg;
      goHome('time');
      return true;
    }
    return false;
  }

  function arrive(s) {
    S.time += costOf(s); // the drive, same minutes the map card showed
    s.visited = true;
    S.history.push(s.id);
    S.stop = s;
    S.screen = 'stop';
    step('f07_arrive_' + S.history.length + '_' + s.type);
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
    // Round 3b
    if (s.type === 'mall' && s.scene === 'uturn') { spend(5); S.ev.uturn = true; track('mall_uturn'); }
    if (s.type === 'pal') palArrive(s);
    if (s.type === 'record' && s.seller === 'chill') { K().punch++; saveK(); }
    if (s.story) track('story_' + s.story);
    if (s.moment) track('moment_' + s.moment);
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

  // paying: store credit from trade-ins here gets used first. Returns how much of it was credit.
  function payFor(price) {
    var cr = Math.min(creditHere(), price);
    if (cr) { S.credit[S.stop.id] -= cr; track('credit_spent'); }
    S.cash -= price - cr;
    return cr;
  }
  // it goes in the bag (shared by offers, the whole-box deal and the punch card)
  function takeItem(it, price, kind) {
    it.paid = price; it.state = 'sold';
    var b = JSON.parse(JSON.stringify(it)); b.paid = price; b.stopType = S.stop.type; b.boughtAt = S.stop.id;
    if (S.day.owned[b.id] || boughtAlready(b.id)) S.ev.dupBuys++;
    if (it.special || (NP.SPORTS.some(function (x) { return x.id === it.id; }) && price >= 20)) S.ev.sportsOverpay = Math.max(S.ev.sportsOverpay, price);
    S.bag.push(b);
    if (S.stop.bfocus === it.uid) S.stop.bfocus = null;
    if (price < it.ask) track('haggle_win');
    if (it.flags && it.flags.repro) track('repro_bought');
    // they will remember this
    if (it.uid.indexOf('dx') !== 0) {
      if (it.seller === 'grandma' || it.seller === 'kid' || it.seller === 'firm') remember(it.seller, 'pal');
      if (it.seller === 'ikwig' && kind === 'full' && S.rem.ikwig && S.rem.ikwig.mad) { remember('ikwig', 'square'); it.line = 'Full price. Fine. We\'re square now.'; }
      if (S.ev.sportsOverpay >= 20) remember('sports', 'sucker');
    }
    // Round 3b
    if (it.kind === 'gear' && it.id === 'binoc') { K().gear.binoc = true; saveK(); track('binoculars_bought'); }
    if (it.kind === 'standee') { S.ev.standee = true; track('standee_bought'); }
    if (punchHere()) { K().punch++; saveK(); }
    if (!S.said.partner && (it.kind === 'standee' || (S.day.partner && price >= 30))) { S.said.partner = true; S.callNow = true; }
  }

  function doOffer(it, kind) {
    if (!it || it.state !== 'avail' || blockedHere()) return;
    braydenCheck(it.uid);
    if (kind === 'lowball' && rivalHere('gary')) return;
    var o = kind === 'steve' ? ['steve', 'Off hold', Math.round(it.ask * 1.2)] : offers(it).filter(function (x) { return x[0] === kind; })[0];
    if (!o) return;
    var price = o[2];
    if (price > S.cash + creditHere()) return;
    actCost(T_HAGGLE);
    if (kind === 'steve') { kind = 'full'; rivalHit('steve'); }
    var sl = NP.SELLERS[it.seller] || {};
    var frac = price / it.ask;
    if (frac + 1e-6 >= it.minFrac || kind === 'full') {
      var cr = payFor(price);
      it.line = sellerLine(it, 'yes') + (cr ? ' (' + money(cr) + ' of that was your store credit.)' : '');
      takeItem(it, price, kind);
      sfx('cash'); sfx('accept');
    } else if (kind === 'lowball' && sl.touchy) {
      it.state = 'pulled'; it.line = S.rem.ikwig && S.rem.ikwig.mad ? 'AGAIN? Unbelievable. Off the table. I will remember this too.' : sl.mad[0]; S.ev.offended++;
      remember('ikwig', 'mad');
      sfx('reject');
    } else {
      it.line = sellerLine(it, 'no');
      if (rivalHere('brayden')) S.stop.bfocus = it.uid; // you showed interest; Brayden noticed
      sfx('reject');
    }
    if (!checkSundown()) { render(); afterBuy(); }
  }

  // ---------- selling and trading in ----------
  // Thrift stores, the pawn shop and the swap meet tables buy from you. The owner makes an offer;
  // you take cash, trade it in for 30% more as store credit at this stop, or ask for more (5 minutes, like any haggle).
  // Firm guys never move. The I Know What I Got guy stops buying a game if you push past his best.
  // Yard sales, the football guy and the gift shop do not buy. Nobody buys back what you bought at the same stop.
  var T_SELL = 5;
  function creditHere() { return S && S.stop ? (S.credit[S.stop.id] || 0) : 0; }
  function buyerFor(s, sellerType) {
    if (!s || s.gift || s.locked) return null;
    var t = sellerType || (s.type === 'pawn' ? 'pawn' : (s.type === 'thrift' || s.type === 'mall' || s.type === 'pal' || s.type === 'record') ? s.seller : null);
    return t && NP.BUYERS && NP.BUYERS[t] ? t : null;
  }
  function sellable(b, bt) {
    if (b.kind === 'grail' || b.kind === 'lot' || b.kind === 'gear' || b.kind === 'standee' || b.kind === 'bulk') return false;
    if (b.kind === 'merch') return !!NP.BUYERS[bt].all;
    if (b.kind === 'music' || b.kind === 'movie') return !!(NP.BUYERS[bt].all || NP.BUYERS[bt].media);
    return true;
  }
  // what a game is really worth, as far as this owner can tell (a bootleg or a reseal they spot is worth almost nothing)
  function trueValue(b, sees) {
    if (b.kind === 'merch') return 3;
    var f = b.flags || {}, goo = f.residue && !b.cleaned ? 0.7 : 1;
    if (b.kind === 'music' || b.kind === 'movie') return Math.max(1, (b.base || 1) * goo);
    if (f.repro && sees) return 1;
    var v = b.base || 1;
    if (b.cond === 'cib') v *= f.noManual ? 1.4 : 2;
    else if (b.cond === 'sealed') v *= (f.reseal && sees) ? 1 : 3.2;
    else if (f.damaged) v *= 0.15;
    return Math.max(1, v * goo);
  }
  function say(arr, amt, salt) { var l = arr[NP.hashStr(String(salt == null ? amt : salt)) % arr.length]; return l.replace('{$}', money(amt)); }
  function sellQ(b, bt) {
    var key = S.stop.id + '|' + bt + '|' + b.uid, q = S.sq[key];
    if (q) return q;
    var r = mulberry32(NP.hashStr(S.seed + '|' + key)), B = NP.BUYERS[bt];
    var sees = !!B.detect || r() < 0.5;
    var bootleg = !!(b.flags && b.flags.repro);
    var dupe = !!(B.dupe && isDupe(b));
    var frac = lerp(B.lo, B.hi, r()) * (S.day.theme && S.day.theme.id === 'buyers' ? 1.25 : 1) * (dupe ? 1.1 : 1);
    var max = Math.max(1, Math.round(trueValue(b, sees) * frac));
    var offer = B.firm ? max : Math.max(1, Math.round(max * lerp(0.65, 0.82, r())));
    q = S.sq[key] = { offer: offer, max: max, state: 'open', fooled: bootleg && !sees };
    q.line = bootleg && sees ? say(B.bootleg, offer) : dupe ? say(B.dupe, offer, key) : say(B.open, offer, key);
    // the trade-in lowball (a true story): two dollars, and that is the final answer
    if (S.stop.story === 'tradein' && bt === 'mall') { q.offer = 2; q.max = 2; q.state = 'capped'; q.line = NP.STORIES.tradein.offer; q.tradein = true; }
    return q;
  }
  // already on your shelf at home, or a second copy in the bag
  function isDupe(b) {
    if (b.kind !== 'game') return false;
    return !!(S.day.owned[b.id] || S.bag.some(function (x) { return x !== b && x.kind === 'game' && x.id === b.id; }));
  }
  function tradeVal(q) { return Math.max(q.offer + 1, Math.round(q.offer * 1.3)); }
  function bagItem(uid) { for (var i = 0; i < S.bag.length; i++) if (S.bag[i].uid === uid) return S.bag[i]; return null; }

  function sellHTML(s, sellerType) {
    var bt = buyerFor(s, sellerType);
    if (!bt) return '';
    var B = NP.BUYERS[bt], who = bt === 'pawn' ? 'The pawn counter' : (NP.SELLERS[bt] ? NP.SELLERS[bt].name : 'The owner');
    var list = S.bag.filter(function (b) { return sellable(b, bt); });
    var cr = creditHere();
    var h = '<div class="sellbox" id="sellbox"><h3>Sell or trade in</h3>' +
      '<div class="sell-k">' + esc(who) + ' is buying ' + (B.all ? 'anything' : B.media ? 'games, music and movies' : 'games') + '. Trade-in pays 30% more, as store credit you can only spend at this stop.' +
      (cr ? ' <b class="credit">You have ' + money(cr) + ' in store credit here.</b>' : '') + '</div>';
    if (S.sellToast) { h += '<div class="toast">' + esc(S.sellToast) + '</div>'; S.sellToast = ''; }
    if (!list.length) h += '<div class="note">' + (S.bag.length ? 'Nothing in your bag they want.' : 'Your bag is empty. Buy something cheap somewhere, sell it here.') + '</div>';
    list.forEach(function (b) {
      h += '<div class="sellrow" id="sell-' + b.uid + '"><div class="artbox sm" data-bart="' + b.uid + '"></div><div class="info"><div class="it-t">' + esc(b.t) + '</div>' +
        '<div class="it-p"><span class="pill ' + b.cond + '">' + condLabel(b) + '</span> you paid ' + money(b.paid || 0) + '</div>' +
        (b.checked && isDupe(b) ? '<div class="note warn">ON THE SHELF ALREADY. Selling it saves you the duplicate penalty.</div>' : '');
      if (b.boughtAt === s.id) h += '<div class="note">You bought this here. Nobody buys it back the same day.</div>';
      else {
        var q = sellQ(b, bt);
        h += '<div class="bubble">' + esc(q.line) + '</div>';
        if (q.state === 'mad') h += '<div class="stamp bad">NOT BUYING IT</div>';
        else h += '<div class="btns sellbtns"><button class="offer full" data-act="sell" data-how="cash" data-uid="' + b.uid + '" data-bt="' + bt + '">Sell ' + money(q.offer) + '</button>' +
          (q.tradein ? '' : '<button class="offer fair" data-act="sell" data-how="trade" data-uid="' + b.uid + '" data-bt="' + bt + '">Trade in ' + money(tradeVal(q)) + '</button>') +
          '<button class="offer lowball" data-act="askmore" data-uid="' + b.uid + '" data-bt="' + bt + '"' + (q.state === 'capped' ? ' disabled' : '') + '>' + (q.state === 'capped' ? 'That is their best' : 'Ask for more (5 min)') + '</button></div>';
      }
      h += '</div></div>';
    });
    return h + '</div>';
  }
  function doSell(uid, bt, how) {
    var b = bagItem(uid);
    if (!b || !S.stop || b.boughtAt === S.stop.id) return;
    var q = sellQ(b, bt), B = NP.BUYERS[bt];
    if (q.state === 'mad') return;
    braydenCheck(null);
    actCost(T_SELL);
    var amt = how === 'trade' ? tradeVal(q) : q.offer;
    S.bag = S.bag.filter(function (x) { return x !== b; });
    if (how === 'trade') { S.credit[S.stop.id] = (S.credit[S.stop.id] || 0) + amt; S.ev.traded++; }
    else { S.cash += amt; S.ev.cashSales = (S.ev.cashSales || 0) + amt; }
    S.ev.sold++; S.ev.sales += amt;
    if (amt > (b.paid || 0)) S.ev.flipProfit += amt - (b.paid || 0);
    if (q.fooled) S.ev.soldRepro++;
    S.sellToast = (how === 'trade' ? say(B.trade, amt) : say(B.sold, amt, uid)) + ' (' + b.t + ', ' + (how === 'trade' ? money(amt) + ' credit' : money(amt)) + '.)';
    if (q.tradein) {
      // he puts it straight in the glass case, at $45, while you watch
      var c = JSON.parse(JSON.stringify(b));
      c.uid = b.uid + 'r'; c.state = 'avail'; c.ask = 45; c.minFrac = 1; c.seller = 'mall'; c.yours = true; c.line = ''; c.tested = true;
      delete c.paid; delete c.boughtAt; delete c.stopType;
      S.stop.items.unshift(c);
      S.sellToast += ' ' + NP.STORIES.tradein.shelf;
      track('tradein_lowball');
    }
    sfx('cash');
    step('first_sale'); step('f09_sell_' + S.history.length + '_' + S.stop.type);
    track('sold_' + S.stop.type + '_' + how);
    if (!checkSundown()) render();
  }
  function askMore(uid, bt) {
    var b = bagItem(uid);
    if (!b) return;
    var q = sellQ(b, bt), B = NP.BUYERS[bt];
    if (q.state !== 'open') return;
    actCost(T_HAGGLE);
    track('sell_ask_more');
    if (B.firm) { q.state = 'capped'; q.line = say(B.best, q.offer, uid); sfx('reject'); }
    else if (q.offer < q.max) { q.offer = Math.min(q.max, Math.ceil(q.offer * 1.2) + 1); q.line = say(B.up, q.offer, uid); sfx('accept'); }
    else if (B.touchy) { q.state = 'mad'; q.line = B.mad[0]; S.ev.sellMad++; track('sell_offended'); sfx('reject'); }
    else { q.state = 'capped'; q.line = say(B.best, q.offer, uid); sfx('reject'); }
    if (!checkSundown()) render();
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
    if (document.querySelector('.unsp, .crt-overlay, .loading-ov, .callov')) return;
    var seen = tipsSeen();
    var cards = Array.prototype.slice.call(document.querySelectorAll('.item[id^="card-"]')).filter(function (c) { return !c.closest('[hidden]'); });
    var rules = [
      ['offers', function (it, c) { return c.querySelector('.btns'); }],
      ['pricey', function (it, c) { return it.kind === 'game' && it.ask >= 20 && c.querySelector('[data-act="inspect"]') ? c.querySelector('.btns.small') : null; }],
      ['dupe', function (it, c) { return it.kind === 'game' && (S.day.owned[it.id] || boughtAlready(it.id)) && c.querySelector('[data-act="check"]') ? c.querySelector('.btns.small') : null; }]
    ];
    // the selling tip: once you have something to sell and the sell box is on screen
    if (!seen.sell && S.bag.length) {
      var sb = document.querySelector('#sellbox .sellbtns');
      if (sb && inView(sb)) { showTip('sell', { el: sb, below: true }); return; }
    }
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
    maybeBrokeTip();
  }

  // via: 'next' (the big Next stop button), 'map' (back to the map), 'home' (straight home)
  function leaveStop(via, nextId) {
    var wasDemoEnd = DEMO && S.stop && S.stop.type === 'flea';
    if (S.stop) step('f08_leave_' + S.history.length + '_' + S.stop.type + '_' + (via || 'map'));
    if (S.stop) { braydenCheck(null); if (S.toast) S.toast = S.toast.replace('You moved on, so', 'On your way out,'); }
    if (S.stop && S.stop.type === 'pal') { S.toast = (S.toast ? S.toast + ' ' : '') + 'You, on the way out: "' + NP.PAL.leave + '" ' + NP.PAL.leaveReply; track('pal_leave_line'); }
    var left = creditHere();
    if (left) { S.ev.creditLeft += left; S.toast = (S.toast ? S.toast + ' ' : '') + 'You left ' + money(left) + ' of store credit at ' + S.stop.name + '. Store credit does not travel.'; track('credit_left'); }
    S.screen = 'map';
    S.stop = null;
    S.visited++;
    if (wasDemoEnd) {
      // demo sundown: the demo Saturday ends when you leave the swap meet
      var wasMorning = S.time <= NOON;
      if (wasMorning) S.time = NOON;
      S.toast = (wasMorning ? 'It\'s noon. ' : '') + 'That\'s the demo! The demo Saturday ends at the swap meet. In the full version you can stay out till sundown (5:30 PM).';
      track('demo_end');
      goHome('demo_end');
      return;
    }
    if (checkSundown()) return;
    if (via === 'home') return goHome('button');
    var then = nextId ? function () { driveTo(nextId, 'next'); } : function () { render(); window.scrollTo(0, 0); };
    if (S.visited === 2 || S.visited === 4) return showCommercial(then);
    then();
  }

  // the drive: a loading screen with a tip (that is also an ad), then you are there
  function driveTo(id, via) {
    var s = S.day.stops.filter(function (x) { return x.id === id; })[0];
    if (!s || s.visited) { render(); return; }
    step('f06_drive_' + (S.history.length + 1) + '_' + s.type + '_' + (via || 'map'));
    if (tipEl) closeTip();
    var drive = function () { arrive(s); render(); window.scrollTo(0, 0); if (S.screen === 'stop' && S.stop && S.stop.cleared) showTip('dex', null); };
    if (NP.Intro) NP.Intro.loading(tipsOff ? null : NP.Intro.tip(adFree, S.wx && S.wx.id), drive, billboard(true)); else drive();
  }

  function goHome(why) {
    step('f20_home_' + (why || 'button') + '_after_' + S.history.length);
    if (idleT) { clearTimeout(idleT); idleT = null; }
    if (tipEl) closeTip();
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
    h += '<div class="shelfnote">Home at ' + fmtTime(Math.min(S.time, endT())) + ' with ' + money(S.cash) + ' left and ' + S.bag.length + ' things in the bag.</div>';
    if (NP.SPONSOR && NP.SPONSOR.home && !adFree) h += '<div class="glam"><canvas class="glamcan" width="22" height="30" aria-hidden="true"></canvas><div class="glam-t">' + esc(NP.SPONSOR.home) + '</div></div>';
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
      if (b.flags && b.flags.residue && !b.cleaned) h += '<div class="note">Sticker goo all over it. Worth 30% less like this.</div><div class="btns"><button data-act="clean" data-uid="' + b.uid + '">Clean off the sticker goo</button></div>';
      if (b.cleaned) h += '<div class="note">Clean. A little dish soap and a lot of patience.</div>';
      if (b.kind === 'gear') h += '<div class="note">Not a game. It goes in the van, not on the shelf. It stays in the van for next time.</div>';
      h += '</div></div>';
    });
    h += '</div>';
    h += '<button class="big" data-act="shelve"' + (pending ? ' disabled' : '') + '>' + (pending ? 'Decide on ' + pending + ' more first' : 'Put it all on the shelf') + '</button></div>';
    app.innerHTML = h;
    document.querySelectorAll('[data-hart]').forEach(function (el) {
      var b = S.bag.filter(function (x) { return x.uid === el.getAttribute('data-hart'); })[0];
      el.appendChild(NP.makeArt(b, 3));
    });
    drawGlamCan();
  }

  // ---------- scoring ----------
  var MEDIA_NOTE = {
    vinyl: 'Vinyl. It crackles. That is the point.', cd: 'CD. Scratched, but only on the songs you skip.', tape: 'Cassette. A little stretched. It adds character.',
    vhs: 'VHS. The tracking is a little off. So is the movie.', dvd: 'DVD. Plays fine. The menu music will be in your head for a week.'
  };
  function appraise() {
    var lines = [], score = 0, haul = 0, spent = S.budget - S.cash + (S.ev.cashSales || 0);
    var seen = {}, titles = [];
    var items = [];
    S.bag.forEach(function (b) { if (b.kind === 'gear') return; if (b.kind === 'lot') { (b.contents || []).forEach(function (c) { c.fromLot = true; c.paid = 0; items.push(c); }); } else items.push(b); });
    var keptReseal = false, repro = false, dup = false, grail = false;
    items.forEach(function (b) {
      var v = 0, pts = 0, note = '';
      if (b.kind === 'merch') { pts = -10; note = 'Merch. Worth nothing. You knew that.'; }
      else if (b.kind === 'grail') { pts = 100; grail = true; note = 'GRAIL! You found the game in the game. Shelf label: currently playing.'; }
      else if (b.kind === 'standee') { pts = 0; note = 'A life-size cardboard Chet Brickwall. Worth nothing. Guards the shelf.'; }
      else if (b.kind === 'bulk') { v = 40; pts = 40; haul += v; note = 'Forty sports games. You paid ' + money(b.paid || 0) + ' for about $40 of football.'; }
      else if (b.kind === 'music' || b.kind === 'movie') {
        if (seen[b.id]) { pts = -5; note = 'Two of the same one. Bought on the same day. By you.'; }
        else {
          v = (b.base || 1) * (b.flags && b.flags.residue && !b.cleaned ? 0.7 : 1); pts = Math.round(v); haul += v;
          note = MEDIA_NOTE[b.fmt] || 'Good pickup.';
          if (b.flags && b.flags.residue && !b.cleaned) note += ' Sticker goo: worth 30% less.';
        }
      }
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
        if (b.flags.residue && !b.cleaned) { v *= 0.7; note += ' Sticker goo: worth 30% less. You never cleaned it.'; }
        pts += Math.round(v); haul += v;
      }
      if (b.kind === 'game' || b.kind === 'grail' || b.kind === 'music' || b.kind === 'movie') seen[b.id] = true;
      if (b.fromLot) note = '(Lot box) ' + note;
      score += pts;
      lines.push({ t: b.t, note: note, pts: pts, it: b });
    });
    // set bonus
    var setFound = items.some(function (b) { return b.set === 'mf' && !b.flags.repro && !S.day.owned[b.id]; });
    var setDone = ['mf1', 'mf2', 'mf3'].every(function (id) { return S.day.owned[id] || items.some(function (b) { return b.id === id && !b.flags.repro; }); });
    var bonus = [];
    if (setFound && setDone) { score += 75; bonus.push(['Moon Ferret trilogy complete', 75]); }
    // cash left over counts at the end of a single day. In a season it carries over instead (it counts at the season's end).
    if (S.ev.laughed) { score += 15; bonus.push(['Laughed at a $5,000 sealed copy and walked away', 15]); }
    var cashPts = S.season ? 0 : Math.floor(S.cash / 2);
    if (cashPts) { score += cashPts; bonus.push(['Cash left over (' + money(S.cash) + ')', cashPts]); }

    // run title, most embarrassing first
    if (grail) titles.push('Played Myself');
    if (S.ev.banned) titles.push('Banned a Store (By You)');
    if (S.ev.laughed) titles.push(NP.GLASSCASE_TITLE);
    if (S.ev.standee) titles.push('Brought Home a Cardboard Action Star');
    if (S.ev.uturn) titles.push('Did a Full 180 at the Mall');
    if (S.ev.lateFee) titles.push('Paid a Late Fee From 2003');
    if ((S.ev.chats || 0) >= 3) titles.push('Talked to Lonnie for an Hour');
    if (S.ev.sportsOverpay >= 20) titles.push('Paid ' + money(S.ev.sportsOverpay) + ' for a Football Game');
    if (repro) titles.push('Proud Owner of a Repro');
    if (dup) titles.push('It Was On The Shelf');
    if (keptReseal) titles.push('Bought Some Very Nice Shrink Wrap');
    if (S.ev.giftSpent >= 25) titles.push('Fully Merchandised');
    if (S.ev.offended) titles.push('Insulted a Man Who Knows What He Got');
    if (S.ev.soldRepro) titles.push('Sold a Bootleg With a Straight Face');
    if (S.ev.sellMad) titles.push('Pushed a Man Who Knows What You Got');
    if (S.ev.creditLeft >= 10) titles.push('Left ' + money(S.ev.creditLeft) + ' in Store Credit Behind');
    if (S.ev.flipProfit >= 15) titles.push('Flipped It. ' + NP.RIVAL.name + ' Would Be Proud.');
    if (S.ev.rivalHits >= 2) titles.push('Living Off ' + NP.RIVAL.name + '\'s Leftovers');
    if (setFound && setDone) titles.push('Moon Ferret Completionist');
    if (!S.bag.length && !S.ev.sold) titles.push('Just Browsing, Thanks');
    if (!S.bag.length && S.ev.sold) titles.push('Sold It All. Shelf Is Empty.');
    if (score >= 250) titles.push('Swap Meet Wizard');
    if (S.cash >= S.budget * 0.7 && S.bag.length) titles.push('Tightwad of the Flea Market');
    if (!titles.length) titles.push(score >= 150 ? 'A Very Solid Saturday' : 'Mostly Football Games');
    return { lines: lines, bonus: bonus, score: score, haul: Math.round(haul), spent: spent, title: titles[0], also: titles.slice(1, 3), items: items };
  }

  function renderResults() {
    var R = S.result;
    step('f22_results');
    var h = '<div class="screen results"><h2>' + (S.season ? esc(seasonLabelLc(S.week)) + ' is on the shelf' : 'The Shelf') + '</h2>' +
      '<div class="runtitle">"' + esc(R.title) + '"</div>' + (S.shelfLine ? '<div class="bubble big hero">You: "' + esc(S.shelfLine) + '"</div>' : '') +
      (R.also.length ? '<div class="also">Also earned: ' + R.also.map(esc).join(' &middot; ') + '</div>' : '') +
      '<div class="bigscore">' + R.score + ' <small>points</small></div>' +
      '<div class="stats">Spent ' + money(R.spent) + ' of ' + money(S.budget) + ' &middot; Haul value ' + money(R.haul) + ' &middot; ' + R.items.length + ' items' +
      (S.ev.sold ? ' &middot; Sold or traded ' + S.ev.sold + ' for ' + money(S.ev.sales) : '') + '</div>' +
      '<div class="scores">' + esc(S.recordMsg || '') + '</div>' +
      featuredReveal() + bannedList() +
      '<canvas id="card" width="1200" height="675"></canvas>' +
      '<div class="btns center"><button class="big" data-act="download">Download your share card</button><button data-act="copy">Copy result text</button>' +
      (DEMO ? '<button data-act="demoend">Continue &#9654;</button>' : '') +
      '' /* Grok Bot r3b fix: only one next-Saturday button on season results (the big one at the bottom) */ + '</div>' +
      '<div class="appraisal"><h3>Appraisal</h3>';
    R.lines.forEach(function (l, i) {
      var rp = !!(l.it && l.it.kind === 'game' && l.it.flags && l.it.flags.repro);
      h += '<div class="al has-art"><span class="al-art" data-rart="' + i + '"></span><div class="al-body"><div class="al-row"><span class="al-t">' + esc(l.t) + '</span><span class="al-p ' + (l.pts < 0 ? 'neg' : '') + '">' + (l.pts > 0 ? '+' : '') + l.pts + '</span></div>' +
        (l.it ? '<div class="al-tag">' + tagPill(l.it, rp) + '</div>' : '') + '<div class="al-n">' + esc(l.note) + '</div></div></div>';
    });
    R.bonus.forEach(function (b) { h += '<div class="al bonus"><span class="al-t">' + esc(b[0]) + '</span><span class="al-p">+' + b[1] + '</span></div>'; });
    if (!R.lines.length) h += '<div class="al-n">Nothing to appraise. The shelf respects your restraint.</div>';
    if (NP.SPONSOR && NP.SPONSOR.appraisal && !adFree) h += '<div class="al-n spons-n">' + esc(NP.SPONSOR.appraisal) + '</div>';
    h += '</div>' +
      // the one real ad in the game: RC's actual merch store. A plain link, after the results, never during play.
      (linksOk() && CFG.MERCH_URL ? '<div class="shirt"><div class="shirt-k">The only item in this game that actually exists:</div>' +
      '<a href="' + esc(CFG.MERCH_URL) + '" target="_blank" rel="noopener" data-track="shirt_link">Nostalgia Pro: The Actual Shirt &#8599;</a></div>' : '') +
      (DEMO ? '<div class="btns center"><button class="big" data-act="demoend">Continue &#9654;</button></div>' +
        '<div class="foot">That was the demo Saturday. Continue for what comes next.</div></div>'
        : S.season ? '<div class="btns center">' + (SEASON.endingPending ? '<button class="big" data-act="ending">See how your season ended &#9654;</button>' : '<button class="big" data-act="nextsat">On to ' + esc(seasonLabelLc(SEASON.week)) + ' &#9654;</button>') +
          '<button data-act="shelf">Home shelf</button><button data-act="totitle">Title screen</button></div>' +
          '<div class="foot">' + esc(NP.CATCH.question) + ' Now it is. Your season saves itself.</div></div>'
        : '<div class="btns center"><button data-act="again">Replay today (just for fun)</button><button data-act="shelf">Home shelf</button><button data-act="totitle">Title screen</button></div>' +
        '<div class="foot">New Saturday at midnight, desert time. thenostalgiapro.com</div></div>');
    app.innerHTML = h;
    document.querySelectorAll('[data-rart]').forEach(function (el) {
      var l = R.lines[+el.getAttribute('data-rart')];
      if (l && l.it) el.appendChild(NP.makeArt(l.it, 2));
    });
    drawCard($('#card'), R);
  }

  // the Banned List page on the results screen (stores you walked out of, for good)
  function bannedList() {
    if (DEMO) return '';
    var L = K().banned.filter(function (b) { return b && b.name; });
    if (!L.length) return '';
    return '<div class="bannedlist"><h3>Your banned list</h3>' + L.map(function (b) {
      return '<div class="bl-row"><span class="redx" aria-hidden="true"></span><b>' + esc(b.name) + '</b> &middot; ' + esc(NP.STORIES.banned.bannedLabel) + (b.when ? ' &middot; since ' + esc(b.when) : '') +
        ' &middot; &#9733;' + (b.review ? ' "' + esc(b.review) + '"' : '') + '</div>';
    }).join('') + '<div class="note">' + esc(NP.STORIES.banned.out) + '</div></div>';
  }
  function featuredStatus() {
    var F = S.day.featured; if (!F) return '';
    return F.item.state === 'sold' ? 'bought it' : F.item.state === 'gone' ? (F.item.goneBy === 'brayden' ? 'Brayden got it' : NP.RIVAL.name + ' got it') : 'passed on it';
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
    NP.pixelText(ctx, 'NOSTALGIA PRO', 40, 17, 5, C.cream);
    NP.pixelText(ctx, DEMO ? 'DEMO' : S.free ? 'FREE PLAY' : 'SATURDAY #' + S.runNo, W - 40, 26, 3, C.cream, 'right');
    // you, standing next to your score
    if (NP.Char) NP.Char.draw(ctx, getLook(), 'down', 0, W - 374, 100, 4);
    // title
    var tl = NP.wrapPixel('"' + R.title + '"', 6, 760);
    tl.forEach(function (l, i) { NP.pixelText(ctx, l, 40 + 4, 104 + 4 + i * 52, 6, C.ink); NP.pixelText(ctx, l, 40, 104 + i * 52, 6, C.gold); });
    var sy = 104 + tl.length * 52 + 8;
    NP.pixelText(ctx, 'SPENT ' + money(R.spent) + ' OF ' + money(S.budget) + '   FINDS ' + R.items.length + '   HAUL ' + money(R.haul), 40, sy, 3, C.cyan);
    // score stamp
    ctx.fillStyle = C.ink; ctx.fillRect(W - 286, 96, 250, 120);
    ctx.fillStyle = C.gold; ctx.fillRect(W - 290, 92, 250, 120);
    ctx.fillStyle = C.navy; ctx.fillRect(W - 284, 98, 238, 108);
    NP.pixelText(ctx, 'SCORE', W - 165, 108, 3, C.cyan, 'center');
    NP.pixelText(ctx, String(R.score), W - 165, 140, String(R.score).length > 4 ? 6 : 8, C.cream, 'center');
    // best find
    var best = R.lines.filter(function (l) { return l.pts > 0 && l.it && l.it.kind !== 'merch'; }).sort(function (a, b) { return b.pts - a.pts; })[0];
    // long titles drop their subtitle first, so the name never gets cut mid-word
    if (best) NP.pixelText(ctx, 'BEST FIND: ' + (best.t.length > 30 ? best.t.split(':')[0] : best.t).slice(0, 30), 40, sy + 36, 3, C.cream);
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
    NP.pixelText(ctx, DEMO ? 'THE FREE DEMO' : (S.free ? 'FREE PLAY' : 'DAILY RUN ' + S.seed) + ' · ' + NP.MODES[modeOf()].name, 40, H - 46, 3, C.cream);
    NP.pixelText(ctx, 'THENOSTALGIAPRO.COM', W - 40, H - 46, 3, C.cyan, 'right');
    if (items.length > show.length) NP.pixelText(ctx, '+' + (items.length - show.length) + ' MORE', W / 2 - 40, H - 42, 2, C.gold, 'center');
    // scanlines
    for (var y = 0; y < H; y += 3) { ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(0, y, W, 1); }
  }

  function shareText() {
    var R = S.result;
    return 'Nostalgia Pro, ' + (DEMO ? 'the free demo' : (S.free ? 'Free Play' : 'Saturday #' + S.runNo) + ', ' + NP.MODES[modeOf()].name) + ' (' + S.wx.temp + 'F)\n"' + R.title + '"\nScore ' + R.score + ' | Spent ' + money(R.spent) + ' | ' + R.items.length + ' finds\nFeatured lot: ' + featuredStatus() + '\nIs it on the shelf? Play: thenostalgiapro.com';
  }

  function shelve() {
    S.result = appraise();
    var R = S.result;
    // best scores are kept per mode, since the two modes start with different money
    var bk = modeOf() === 'noon' && !DEMO ? 'best_noon' : 'best';
    var dk = dayKey(S.seed), prev = store.get(dk, null), best = store.get(bk, null);
    var msg = '', mname = NP.MODES[modeOf()].name;
    step('f21_shelved_' + modeOf() + (S.free ? '_free' : S.season ? '_season' : ''));
    S.shelfLine = bigMoment(R) ? NP.CATCH.shelf : '';
    if (S.season) {
      finishSeasonSaturday(R);
      saveHomeShelf(R);
      var tot = seasonTotals();
      S.recordMsg = 'On the season shelf: ' + SEASON.shelf.length + '. Season score so far: ' + (tot.score - Math.floor(SEASON.cash / 2)) + '. ' + money(SEASON.cash) + ' carries over to next Saturday, plus payday.';
      S.screen = 'results';
      sfx('fanfare');
      render();
      window.scrollTo(0, 0);
      return;
    }
    if (DEMO) msg = 'Demo run complete. In the full version, this haul would go on your home shelf.';
    else if (S.free) msg = 'Free Play. Random Saturdays do not go on your home shelf.';
    else if (!prev) { store.set(dk, { score: R.score, title: R.title }); saveHomeShelf(R); msg = 'Official ' + mname + ' run for today saved to your home shelf.'; }
    else msg = 'Replay. Today\'s official ' + mname + ' run was ' + prev.score + '.';
    if (!best || R.score > best.score) { store.set(bk, { score: R.score, seed: S.seed }); msg += ' New personal best (' + mname + ')!'; }
    else msg += ' Best ever (' + mname + '): ' + best.score + '.';
    S.recordMsg = msg;
    S.screen = 'results';
    sfx('fanfare');
    render();
    window.scrollTo(0, 0);
  }

  // the hero only says it on a big day: the grail, a finished set, a rare find that is real, or a huge score
  function bigMoment(R) {
    if (DEMO) return false;
    return R.lines.some(function (l) { return l.it && (l.it.kind === 'grail' || (l.it.tier >= 3 && l.pts > 0)); }) ||
      R.bonus.some(function (b) { return /trilogy/.test(b[0]); }) || R.score >= 400;
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
        SEASON = null; // a one-day run never touches the season
        var md = DEMO ? 'noon' : (el.getAttribute('data-mode') === 'noon' ? 'noon' : 'sundown');
        var fr = !DEMO && el.getAttribute('data-free') === '1';
        if (!DEMO && !fr) store.set('mode', md);
        step('f03_mode_' + md + (fr ? '_free' : ''));
        var begin = function () { beginSaturday(md, fr); };
        if (NP.Creator && !hasLook()) showCreator(begin, 'Looks good. Start Saturday');
        else begin();
        break;
      case 'continue': cartOpen = false; step('f03_continue'); continueGame(); break;
      case 'newgame': step('f03_newgame'); if (readSave()) renderNewGameCheck(); else beginNewSeason(); break;
      case 'newgame-yes': beginNewSeason(); break;
      case 'nextsat': if (SEASON) renderWeekdays(); break;
      case 'startsat': if (SEASON) startSeasonSaturday(); break;
      case 'ending': if (SEASON) renderEnding(); break;
      case 'endless': if (SEASON) { SEASON.endless = true; SEASON.endingPending = false; saveGame(null); track('endless_start'); renderWeekdays(); } break;
      case 'look': showCreator(function () { S = null; cartOpen = true; renderTitle(); window.scrollTo(0, 0); }, 'Save my look'); break;
      case 'shelf': shelfBack = S && S.screen === 'results' ? 'results' : 'title'; renderHomeShelf(); break;
      case 'shelfback':
        if (shelfBack === 'results' && S) { S.screen = 'results'; render(); }
        else { S = null; cartOpen = true; renderTitle(); }
        window.scrollTo(0, 0); break;
      case 'go': driveTo(el.getAttribute('data-id'), el.getAttribute('data-via') || 'map'); break;
      case 'gonext': if (tipEl) closeTip(); leaveStop('next', el.getAttribute('data-id')); break;
      case 'leavehome': if (tipEl) closeTip(); leaveStop('home'); break;
      case 'offer': doOffer(findItem(uid), el.getAttribute('data-kind')); break;
      case 'sell': doSell(uid, el.getAttribute('data-bt'), el.getAttribute('data-how')); break;
      case 'askmore': askMore(uid, el.getAttribute('data-bt')); break;
      case 'jumpsell': var sb = document.getElementById('sellbox'); if (sb) sb.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
      case 'inspect':
        var it = findItem(uid); braydenCheck(uid); actCost(T_INSPECT); it.inspected = true;
        if (it.flags && it.flags.repro && it.tell) { sfx('uhoh'); track('repro_inspected'); }
        blowOnIt(it);
        if (rivalHere('brayden') && it.state === 'avail') S.stop.bfocus = it.uid;
        if (!checkSundown()) render(); break;
      case 'check': var it2 = findItem(uid); braydenCheck(uid); actCost(T_SHELF); it2.checked = true; S.ev.checks++; if (rivalHere('brayden') && it2.state === 'avail') S.stop.bfocus = it2.uid; if (!checkSundown()) render(); break;
      case 'dig': braydenCheck(null); actCost(T_DIG); S.stop.dug = true; if (!checkSundown()) render(); break;
      case 'leave': if (tipEl) closeTip(); leaveStop(el.getAttribute('data-via') || 'map'); window.scrollTo(0, 0); break;
      case 'buygift': buyGift(el.getAttribute('data-id')); break;
      // Round 3b
      case 'story': doStory(+el.getAttribute('data-i')); break;
      case 'caseask': case 'casereply': case 'caselaugh': case 'casebuy': case 'casewalk': doCase(act); break;
      case 'utskip': break; // the scene listens for this tap itself
      case 'bwait': case 'bexcuse': case 'bout': case 'breview': doBanned(act, +el.getAttribute('data-i')); break;
      case 'chat': doChat(el.getAttribute('data-id')); break;
      case 'punch': doPunch(el.getAttribute('data-how')); break;
      case 'listen': doListen(); break;
      case 'latefee': doLateFee(); break;
      case 'candy': doCandy(); break;
      case 'bundle': doBundle(el.getAttribute('data-kind')); break;
      case 'pricecheck':
        var pc = findItem(uid); if (!pc || pc.state !== 'avail') break;
        braydenCheck(uid); actCost(2);
        pc.ask = Math.max(pc.ask + 1, Math.ceil(pc.ask * 1.1)); pc.line = NP.STORIES.pricecheck.line.replace('{$}', money(pc.ask));
        track('price_check'); if (!checkSundown()) render(); break;
      case 'comeback':
        var cb = findItem(uid); if (!cb || cb.state !== 'avail') break;
        braydenCheck(null); actCost(10);
        cb.state = 'gone'; cb.goneBy = 'vest'; cb.line = ''; S.toast = NP.STORIES.comeback.gone;
        track('moment_comeback_gone'); if (!checkSundown()) render(); break;
      case 'clean': var cl = S.bag.filter(function (x) { return x.uid === uid; })[0]; if (cl) { cl.cleaned = true; track('sticker_cleaned'); render(); } break;
      case 'gohome': goHome('button'); break;
      case 'openlot':
        var lb = S.bag.filter(function (x) { return x.uid === uid; })[0]; lb.opened = true;
        S.toast = 'Inside: ' + lb.contents.map(function (c) { return c.t; }).join(', ') + '.';
        render(); break;
      case 'seal': var sb = S.bag.filter(function (x) { return x.uid === uid; })[0]; sb.decision = el.getAttribute('data-v'); render(); break;
      case 'shelve': shelve(); break;
      case 'download':
        var a = document.createElement('a');
        a.download = 'nostalgia-pro-share-card-' + S.seed + '.png';
        a.href = $('#card').toDataURL('image/png');
        document.body.appendChild(a); a.click(); a.remove(); track('share_card_saved'); break;
      case 'copy':
        var t = shareText();
        var done = function () { el.textContent = 'Copied!'; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { window.prompt('Copy this:', t); });
        else window.prompt('Copy this:', t);
        break;
      case 'again': track('replay'); newRun(S.mode); S.screen = 'map'; render(); window.scrollTo(0, 0); break;
      case 'demoend':
        step('f23_demo_infomercial');
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
      case 'tips': setTipsOff(!tipsOff); break;
      case 'mute': if (NP.Sound) NP.Sound.toggle(); break;
      case 'hsname': var cap = $('#hscap'); if (cap) cap.textContent = el.getAttribute('data-name'); break;
      case 'totitle': S = null; cartOpen = true; renderTitle(); window.scrollTo(0, 0); break;
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

  // ---------- where people stop playing ----------
  // When the page is hidden or closed, count which screen it was on (once per visit).
  // Switching tabs counts too, so read these as "last screen seen", not "quit for good".
  function whereNow() {
    if (gateOn) return 'gate';
    if (!S) return document.querySelector('.howto-scr') ? 'howto' : document.querySelector('.shelfscr') ? 'shelf' : document.querySelector('.screen.morning') ? 'intro' : document.querySelector('.screen.infomercial') ? 'infomercial' : document.querySelector('#crcv') ? 'creator' : 'title';
    if (document.querySelector('.screen.morning')) return 'intro';
    if (document.querySelector('.loading-ov')) return 'driving_' + S.history.length;
    if (S.screen === 'stop' || S.screen === 'walk') return 'stop_' + S.history.length + '_' + (S.stop ? S.stop.type : 'x');
    if (S.screen === 'map') return 'map_' + S.history.length;
    return S.screen;
  }
  var hidSent = false;
  function onHide() {
    // a season Saturday saves right away when the page is hidden or closed (no waiting on the autosave timer)
    if (S && S.season && (S.screen === 'map' || S.screen === 'stop' || S.screen === 'walk' || S.screen === 'home')) { if (saveT) { clearTimeout(saveT); saveT = null; } saveGame(); }
    if (hidSent) return;
    hidSent = true;
    try { if (NP.track) NP.track('hidden_on_' + whereNow(), true, true); } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') onHide(); else hidSent = false; });
  window.addEventListener('pagehide', onHide);

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
  function beginSaturday(md, free) {
    newRun(md, free);
    var go = function () { track('intro_done'); step('f04_intro_done'); S.screen = 'map'; render(); window.scrollTo(0, 0); };
    music(null);
    if (NP.Intro) NP.Intro.morning(app, { look: getLook(), runNo: S.runNo, label: DEMO ? 'DEMO SATURDAY' : S.free ? 'FREE PLAY' : 'SATURDAY #' + S.runNo, wx: S.wx, featured: S.day.featured, adFree: adFree, demo: DEMO, mode: S.mode, spotted: DEMO ? '' : spottedText() }, go);
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
    state: function () { return S; }, END: END, rivalNotes: rivalNotes, rivalHit: rivalHit, rivalsAt: rivalsAt, endT: endT, endLabel: endLabel, sellHTML: sellHTML, creditHere: creditHere,
    spend: spend, checkSundown: checkSundown, updateHud: updateHud, leaveButtons: leaveButtons, step: step,
    itemCard: itemCard, drawArts: drawArts, giftHTML: giftHTML, drawGiftArts: drawGiftArts, dexSetup: dexSetup,
    adLevel: adLevel, adFree: function () { return adFree; }, look: getLook, helloFor: helloFor,
    fmtTime: fmtTime, money: money, esc: esc, sfx: sfx, track: track, demo: DEMO,
    takeToast: function () { var t = S.toast; S.toast = ''; return t; },
    tip: function (k) { return showTip(k, k === 'dex' ? dexAnchor() : null); }, tipOpen: tipOpen
  };

  // test hooks (harmless in production)
  window.__NP_TEST = { keep: function () { return K(); }, runSeed: function (m, seed) { todaySeed = seed; SEASON = null; newRun(m); S.screen = 'map'; render(); }, goStop: function (id) { var st = S.day.stops.filter(function (x) { return x.id === id; })[0]; arrive(st); render(); }, genDay: genDay, buildDay: buildDay, season: function () { return SEASON; }, render: function () { render(); }, readSave: readSave, state: function () { return S; }, phoenixDate: phoenixDate, weatherFor: weatherFor,
    preview: function (seed) { var d = applyExtras(genDay(seed), seed); return { wx: d.wx.id, host: d.featured.stopName, hostType: d.stops.filter(function (s) { return s.id === d.featured.stopId; })[0].type }; } };
})();
