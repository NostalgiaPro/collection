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
  function sfx(n, a) { if (NP.Sound) NP.Sound.sfx(n, a); }
  function pl(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function music(n, keepPace) { if (NP.Sound) NP.Sound.music(n); if (!keepPace) tempo(1); }
  function tempo(m) { if (NP.Sound && NP.Sound.tempo) NP.Sound.tempo(m); }
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
      uid: 'i' + (uidN++), id: entry.id, t: entry.t, p: entry.p, tier: entry.tier || 0, base: entry.base, g: entry.g || (opts.sports ? 'sports' : ''),
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
    // a guaranteed good find at the first stop: an uncommon Kestrel 16 game, complete in box, priced like a coaster.
    // Any offer lands, so every player gets an early win in their first couple of minutes.
    var er = mulberry32(NP.hashStr('demo-early|' + todaySeed));
    var pool = NP.CATALOG.filter(function (g) { return g.tier === 2 && g.p === 'k16'; });
    var ee = pool.filter(function (g) { return !day.owned[g.id] && !yard.items.concat(yard.dig).some(function (i) { return i.id === g.id; }); })[0] || pool[0];
    delete day.owned[ee.id];
    var early = makeItem(er, ee, { seller: yard.seller, ask: 6 });
    early.cond = 'cib'; early.flags = {}; early.tell = true; early.minFrac = 0.4; early.sticker = true; early.early = true; early.uid = 'early';
    yard.items.unshift(early);
    // Round 6.4: one table at the swap meet is on the phone. Ask twice.
    demoPhoneJerk(flea, F.item);
    // open stops first, locked ones after
    day.stops = [yard, flea, gift].concat(day.stops.filter(function (s) { return s.locked; }));
  }

  // free: true for Free Play (a random Saturday that never counts as today's run)
  // season: true for a season Saturday (Home by sundown, SEASON.week, money and shelf carried over)
  function newRun(m, free, season) {
    document.querySelectorAll('.callov').forEach(function (o) { if (o.parentNode) o.parentNode.removeChild(o); });
    hudCash = null;
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
      SEASON.shelf.forEach(function (b) { if (b.kind === 'game' || b.kind === 'music' || b.kind === 'movie') day.owned[b.id] = true; });
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
    if (!DEMO) { addStores(day, seed, m); assignRivals(day, seed, m); placeMedia(day, seed); placeVariants(day, seed); addRummage(day, seed, m); }
    // Round 3c: the Desert Pixel Expo, last stop of Saturday 12 (and now and then in Endless)
    if (season && expoWeek(SEASON.week)) addExpo(day, seed);
    if (season) freshStock(day, seed);
    if (!DEMO) { placeUltra(day, seed, m); placeNearMisses(day, seed); placeMysteryBoxes(day, seed); placeDailyTip(day, seed); }
    S.rem = DEMO || free ? {} : applyMemory(day);
    // the one seller today who would never sell out, and the stop they are at (never the swap meet: that one has its own)
    var colaStops = day.stops.filter(function (s) { return openStop(s) && s.type !== 'flea' && s.seller && NP.SPONSOR && NP.SPONSOR.refuse && NP.SPONSOR.refuse[s.seller]; });
    if (colaStops.length) colaStops[NP.hashStr(seed + '|cola') % colaStops.length].cola = true;
    if (!DEMO) addJerks(day, seed); // Round 6.4
    // Round 5: the visit streak cash, on the first Saturday you start on a new day
    if (!DEMO) { claimVisit(); if (S.visitBonus) S.toast = NP.LOGIN.line.replace('{n}', S.visitBonus.days).replace('{c}', S.visitBonus.cash); }
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
    magnet('blow');
  }
  // one box per rival at this stop (Dex has his own warnings), with the one rule they change
  function rivalNotes(s) {
    var h = '';
    rivalsAt(s).forEach(function (id) {
      if (id === 'dex') return;
      var R = NP.RIVALS[id], rule = s.type === 'expo' && NP.EXPO.rules[id] ? NP.EXPO.rules[id] : s.type === 'flea' && R.ruleWalk ? R.ruleWalk : R.rule;
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
  // the demo saves its one Saturday at every stop, so a phone player who gets interrupted can come back and finish
  var DEMO_SAVE_V = 1;
  function demoSave() {
    if (!DEMO || !S) return;
    if (S.screen !== 'map' && S.screen !== 'stop' && S.screen !== 'walk') return;
    var stop = S.stop;
    S.stop = stop ? { __stop: stop.id } : null;
    var feat = S.day.featured && S.day.featured.item;
    if (feat) S.day.featured.item = { __uid: feat.uid };
    var out = null;
    try { out = JSON.parse(JSON.stringify(S)); } catch (e) { out = null; }
    S.stop = stop; if (feat) S.day.featured.item = feat;
    if (out) { try { store.set('demorun', { v: DEMO_SAVE_V, seed: todaySeed, run: out }); } catch (e) {} }
  }
  function demoClear() { if (DEMO && store.raw('demorun') !== null) { try { store.set('demorun', null); } catch (e) {} } }
  function readDemoSave() {
    if (!DEMO) return null;
    var sv = null;
    try { sv = store.get('demorun', null); } catch (e) { sv = null; }
    var ok = false;
    try { ok = !!(sv && sv.v === DEMO_SAVE_V && sv.run && sv.run.day && Array.isArray(sv.run.day.stops) && Array.isArray(sv.run.bag) && typeof sv.run.time === 'number' && sv.run.time < NOON); } catch (e) { ok = false; }
    return ok ? sv : null;
  }
  function continueDemo() {
    var sv = readDemoSave();
    if (!sv) { renderTitle(); return; }
    track('continue_used');
    cartOpen = false;
    try {
      S = unpackRun(sv.run);
      S.mapTracked = false;
      if (S.screen === 'walk' && NP.Walk && NP.Char) NP.Walk.enter(S.stop);
      S.toast = NP.DEMO_WANT_TEXT.welcome;
      if (S.screen === 'stop' || S.screen === 'walk') demoGoal(); // pick the want list chain back up
      render(); window.scrollTo(0, 0);
    } catch (e) { S = null; demoClear(); renderTitle(); }
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
    if (SEASON.pay) {
      SEASON.cash += NP.SEASON.paycheck; SEASON.pay = false; SEASON.clubMsg = '';
      if (SEASON.clubBills > 0) {
        SEASON.cash -= NP.CLUB.billAmt; SEASON.clubBills--;
        SEASON.clubMsg = NP.CLUB.bill.replace('{n}', NP.CLUB.billAmt) + (SEASON.clubBills ? '' : ' ' + NP.CLUB.billDone);
      }
      saveGame(null);
    }
    var w = SEASON.week, lines = NP.WEEKDAYS[(w + SEASON.id.charCodeAt(0)) % NP.WEEKDAYS.length];
    var rep = rivalReport();
    var h = '<div class="screen weekdays"><div class="wk-card">' +
      '<div class="wk-h">MONDAY TO FRIDAY</div>' +
      lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') +
      '<div class="wk-pay">FRIDAY: PAYDAY. <b>+' + money(NP.SEASON.paycheck) + '</b></div>' +
      (SEASON.clubMsg ? '<div class="wk-club">' + esc(SEASON.clubMsg) + '</div>' : '') +
      '<div class="wk-cash">You have <b>' + money(SEASON.cash) + '</b> for ' + esc(seasonLabelLc(w)) + '.</div>' +
      (w === NP.SEASON.weeks ? '<div class="wk-final">' + esc(NP.FINALE_NOTE) + '</div>' : '') +
      (rep ? '<div class="wk-riv"><b>Rival report.</b> ' + esc(rep) + '</div>' : '') +
      '<div class="wk-shelf">On the shelf this season: ' + SEASON.shelf.length + (SEASON.shelf.length ? ' (' + countsText(mediaCounts(SEASON.shelf)) + ')' : '') + '. ' + esc(NP.CATCH.question) + '</div>' +
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
    SEASON.scores.push({ week: w, score: R.score, title: R.title, bonus: R.extra || 0 });
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
  // Round 3c: the season score is the shelf, not the bank account. Every different thing on the season shelf counts
  // once (its best copy; convention finds already count double), plus a few points for every different find,
  // plus 1 point for every $10 left over. Hoarding cash cannot beat building a shelf any more.
  var SEASON_FIND = NP.SEASON.findPts, SEASON_CASH = NP.SEASON.cashPer, SEASON_NEG = -10;
  function seasonTotals(se) {
    se = se || SEASON;
    var e = { score: 0, value: 0, finds: 0, items: 0, dupes: 0, merch: 0, media: 0, games: 0, cash: se.cash, cashPts: Math.floor(Math.max(0, se.cash) / SEASON_CASH) };
    var best = {};
    se.shelf.forEach(function (b) {
      e.items++; if (b.dupe) e.dupes++; if (b.kind === 'merch') e.merch++; if (b.kind === 'music' || b.kind === 'movie') e.media = (e.media || 0) + 1; else if (b.kind === 'game' || b.kind === 'grail') e.games = (e.games || 0) + 1;
      var key = b.kind + '|' + b.id, v = b.v || 0;
      if (!(key in best) || v > best[key]) best[key] = v;
    });
    Object.keys(best).forEach(function (k) { var v = best[k]; if (v > 0) { e.value += v; e.finds++; } else e.value += Math.max(SEASON_NEG, v); });
    // mini-goals, quick finds and surprises count too, at half weight (so playing well matters, but the shelf still leads)
    e.bonus = Math.round(se.scores.reduce(function (a, x) { return a + (x.bonus || 0); }, 0) * NP.SEASON.bonusWeight);
    e.score = e.value + e.finds * SEASON_FIND + e.cashPts + e.bonus;
    return e;
  }
  // a season Saturday: half of the games you already own get swapped for ones you do not, so the season keeps
  // turning up new things (you will still run into plenty you own. Is it on the shelf?)
  function freshStock(day, seed) {
    var r = mulberry32(NP.hashStr('fresh|' + seed));
    day.stops.forEach(function (st) {
      if (st.type === 'expo' || st.locked || st.gift) return;
      (st.items || []).concat(st.dig || []).forEach(function (it) {
        if (it.kind !== 'game' || !it.tier || !day.owned[it.id] || it.featured || it.state !== 'avail' || r() < NP.SEASON.fresh) return;
        var pool = NP.CATALOG.filter(function (g) { return g.tier === it.tier && !day.owned[g.id]; });
        if (!pool.length) return;
        var e = pick(r, pool), old = Math.max(1, it.base || 1);
        it.id = e.id; it.t = e.t; it.p = e.p; it.base = e.base; it.set = e.set; it.g = e.g;
        it.ask = Math.max(1, Math.round(it.ask * e.base / old));
      });
    });
  }
  function renderEnding() {
    S = null;
    music('title');
    var e = seasonTotals(), end = SEASON.ending;
    if (!end) {
      var E = NP.ENDINGS.filter(function (x) { return x.test(e); })[0];
      end = SEASON.ending = { id: E.id, name: E.name, text: E.text, score: e.score };
      track('season_end'); track('season_end_' + E.id);
      magnet('season');
      saveGame(null);
    }
    var best = SEASON.scores.slice().sort(function (a, b) { return b.score - a.score; })[0];
    var h = '<div class="screen ending"><div class="end-k">THE SEASON IS OVER</div>' +
      '<h2 class="end-h">' + esc(end.name) + '</h2>' +
      '<div class="end-t">' + esc(end.text) + '</div>' +
      '<div class="end-stats">Season score <b>' + e.score + '</b> (shelf value ' + e.value + ' &middot; ' + e.finds + ' different find' + (e.finds === 1 ? '' : 's') + ' &middot; ' + (e.bonus ? e.bonus + ' from goals and surprises &middot; ' : '') + e.cashPts + ' for cash) &middot; ' + e.items + ' on the shelf' + (e.media ? ' (' + (e.games || 0) + ' games, ' + e.media + ' music and movies)' : '') + ' &middot; ' + money(e.cash) + ' in the bank' +
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
  // the demo gets to the fun faster: short fixed drives (the full game keeps its drive formula)
  var DEMO_DRIVE = { yard: 35, flea: 45, gift: 30 };
  function costOf(s, fromId) {
    if (DEMO && DEMO_DRIVE[s.type]) return DEMO_DRIVE[s.type];
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
  var ROUTE_ORDER = ['rummage', 'yard', 'yard', 'yard', 'sports', 'thrift', 'mall', 'pal', 'flea', 'record', 'rental', 'rental', 'banned', 'thrift', 'pawn', 'expo'];
  var STORE_TYPES = ['mall', 'banned', 'pal', 'record', 'rental'];
  var EXPO_DOORS = 15 * 60; // the Desert Pixel Expo opens at 3 PM
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
    var list = order.filter(function (s) { return !s.visited && !closedNow(s, S.time + costOf(s)); });
    // in the demo, leaving the swap meet ends the day, so it always goes last
    if (DEMO) list.sort(function (a, b) { return (a.type === 'flea') - (b.type === 'flea'); });
    // the Desert Pixel Expo is always the last stop, and the rest of the route has to leave time to get there by the doors (3 PM)
    var expo = list.filter(function (s) { return s.type === 'expo'; })[0] || null;
    if (expo) list = list.filter(function (s) { return s !== expo; });
    var end = expo ? Math.min(endT(), EXPO_DOORS + 10 - costOf(expo, null)) : endT();
    function fits(l) {
      var t = S.time, from = lastStopId();
      // every stop on the route gets at least 20 minutes before the day ends
      for (var i = 0; i < l.length; i++) { t += costOf(l[i], from); from = l[i].id; if (t + 20 > end) return false; t += STAY_EST; }
      return true;
    }
    // Round 3c: keep at least one of today's rotating stores on the route, so players who follow the big button still see them
    function isStore(x) { return STORE_TYPES.indexOf(x.type) >= 0; }
    function storesIn(l) { return l.filter(isStore).length; }
    function keep(l, k) { return l[k].type === 'flea' || (isStore(l[k]) && storesIn(l) <= 1); }
    while (list.length && !fits(list)) {
      var fi = -1;
      for (var i = 0; i < list.length; i++) if (list[i].type === 'flea') fi = i;
      var cut = -1, j;
      for (j = list.length - 1; j > fi; j--) if (!keep(list, j)) { cut = j; break; }   // after the swap meet first
      if (cut < 0) for (j = fi - 1; j >= 0; j--) if (!keep(list, j)) { cut = j; break; } // then before it
      if (cut < 0) for (j = list.length - 1; j >= 0; j--) if (list[j].type !== 'flea') { cut = j; break; } // then the last store
      if (cut < 0) cut = list.length - 1;    // only the swap meet is left, and even it does not fit
      list.splice(cut, 1);
    }
    if (expo && S.time + costOf(expo) < endT() - 20) list.push(expo);
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
    if (!DEMO) it.lab = mediaLab(it);
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
  // ---------- r6.3: the rummage sale (full game only) ----------
  // Some Saturdays (about 1 in 3), early. Open 7 to 10 AM. Bins of loose games, music and movies at rummage prices.
  // It has its own random numbers, so the rest of the day is exactly what it would have been without it.
  var RUMMAGE_CLOSE = 10 * 60;
  function addRummage(day, seed, m) {
    var r = mulberry32(NP.hashStr('rummage|' + seed));
    if (r() > 0.34) return;
    var st = baseStop('rummage', NP.STOPNAMES.rummage[0], 'rummage', 52);
    st.id = 'rm0'; st.closesAt = RUMMAGE_CLOSE;
    var MS = NP.MEDIA_SECS;
    for (var i = 0; i < 4; i++) {
      var g = makeItem(r, rollGame(r, [0.78, 0.2]), { seller: 'rummage' });
      g.cond = 'loose'; g.ask = 1 + Math.floor(r() * 2); g.sec = '';
      st.items.push(g);
    }
    mediaUsed = {};
    for (var a = 0; a < 2; a++) { var mu = addMediaTo(r, st, 'music', ['tape', 'vinyl'], [0.8, 0.18], 'music'); mu.ask = Math.max(1, Math.min(mu.ask, 3)); }
    var mv = addMediaTo(r, st, 'movie', ['vhs'], [0.8, 0.18], 'movies'); mv.ask = 1;
    st.secs = [['', MS.rummageGames], ['music', MS.rummageMusic], ['movies', MS.rummageMovies]];
    st.joke = NP.RUMMAGE.jokes[Math.floor(r() * NP.RUMMAGE.jokes.length)];
    day.stops.splice(0, 0, st);
  }
  // r6.3: a stop with hours (the rummage sale): you have to get there with time to look before it closes
  function closedNow(s, at) { return !!(s && s.closesAt && (at != null ? at : S.time) + 15 > s.closesAt); }
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
    if (s.type === 'rummage') return '<div class="sign sign-rum"><span>' + esc(NP.RUMMAGE.sign) + '</span></div>' + (s.joke ? '<div class="note rum-joke">' + esc(s.joke) + '</div>' : '') + sharpieSign(s);
    return sharpieSign(s);
  }
  // Round 6.4: a cardboard sign in marker, taped up crooked. Crossed-out prices, and somebody's initials.
  function sharpieSign(s) {
    var SH = NP.SHARPIE; if (!SH) return '';
    var list = s.jerk && !DEMO ? SH.stop.jerk : SH.stop[s.type];
    if (!list) return '';
    var h = NP.hashStr((S && S.seed) + '|sharpie|' + s.id);
    var raw = list[h % list.length], scr = SH.scrawl[(h >>> 4) % SH.scrawl.length];
    // r6.5: the lettering is drawn in pixel marker (paintSharpies), the same on every phone. The words stay in the page for screen readers.
    var said = raw.replace(/\{([^}]*)\}/g, '$1 (crossed out)');
    return '<div class="sharpie" style="--tilt:' + ((h % 5) - 2) * 0.5 + 'deg" role="img" aria-label="' + esc('Cardboard sign: ' + said + '. ' + scr) + '"><span class="tape tl"></span><span class="tape tr"></span>' +
      '<canvas class="sh-cv" data-sh="' + esc(raw) + '" data-sc="' + esc(scr) + '"></canvas></div>';
  }
  function paintSharpies() {
    var list = document.querySelectorAll('canvas.sh-cv');
    if (!list.length || !NP.markerText) return;
    var dpr = Math.min(3, window.devicePixelRatio || 1), tsz = +store.get('tsize', 1) || 1;
    list.forEach(function (cv) {
      var box = cv.parentNode, host = box && box.parentNode; if (!host) return;
      var room = Math.max(160, Math.min(560, host.clientWidth - 34)); // CSS pixels the sign may use
      var s = Math.max(2, Math.round(2 * tsz * dpr)), s2 = Math.max(1, Math.round(1.4 * tsz * dpr));
      var txt = cv.getAttribute('data-sh'), sc = cv.getAttribute('data-sc');
      var a = NP.markerText(null, txt, s, room * dpr, { draw: false }), b = NP.markerText(null, sc, s2, room * dpr, { draw: false });
      var W = Math.max(a.w, b.w) + 2 * s, H = a.h + b.h + 6 * s;
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      cv.style.width = (W / dpr) + 'px'; cv.style.height = (H / dpr) + 'px';
      var g = cv.getContext('2d'); g.clearRect(0, 0, W, H);
      NP.markerText(g, txt, s, room * dpr, { x: s });
      NP.markerText(g, sc, s2, room * dpr, { x: W - b.w - s, y: a.h + 4 * s, ink: 'rgba(27,27,40,.72)', bleed: 'rgba(27,27,40,.2)' });
    });
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
    else if (act === 'caselaugh' && s.caseStep === 2) { actCost(1); s.caseStep = 3; s.caseEnd = D.walk; S.ev.laughed = true; track('glasscase_laugh'); magnet('laugh'); }
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
      track('banned_store'); step('banned_store'); magnet('banned');
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
      magnet('regular');
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
    if (p >= 10) h += '<div class="btns"><button class="offer full" data-act="punch" data-how="credit">Cash it in: $10 off here</button><button class="offer fair" data-act="punch" data-how="game">Cash it in: a game on the house</button></div>';
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
      S.toast = 'Card cashed in. ' + (s.type === 'pal' ? 'Lonnie' : 'The clerk') + ' hands you ' + it.t + '. On the house.';
    }
    saveK(); track('punch_cashin_' + how); sfx('cash'); magnet('punch');
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
    actCost(2); track('late_fee_paid'); sfx('cash'); magnet('latefee');
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
    h += '<div class="story-t">' + esc(D.line) + ' ' + pl(L.length, 'thing') + ', ' + money(sum) + ' on the stickers.</div><div class="btns">';
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
      L.forEach(function (it, i) { var p = i === L.length - 1 ? left : Math.round(price * it.ask / sum); left -= p; takeItem(it, Math.max(0, p), kind); it.line = ''; if (!DEMO) goalTick('buy', it, { price: Math.max(0, p), offer: kind, bundle: true }); });
      s.bundleLine = 'Deal. "Take the box too. Take the table if you want it."';
      sfx('cash'); sfx('accept'); track('bundle_bought');
      celebrate('good', 'Box deal! ' + pl(L.length, 'thing') + ' for ' + money(price) + '.');
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
      magnet('room');
      if (!checkSundown()) render();
    });
    var f = ov.querySelector('button'); if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
  }
  function afterBuy() {
    if (S.callNow) { S.callNow = false; partnerCall(); return; }
    maybeBrokeTip(); if (!tipEl) maybeUnsponsored();
  }

  // =====================================================================================================
  // ---------- Round 3c: the Desert Pixel Expo ----------
  // =====================================================================================================
  // Saturday 12 of a season (Home by sundown), and every fourth Saturday in Endless. The last stop of the day.
  // The walking, nerds and booths are in walk.js. The shop, grading and autographs run through here.
  function expoWeek(w) { return w === NP.SEASON.weeks || (w > NP.SEASON.weeks && w % 4 === 0); }
  function addExpo(day, seed) {
    var r = mulberry32(NP.hashStr('expo|' + seed)), X = NP.EXPO, i;
    var st = { id: 'expo', type: 'expo', name: X.name, seller: null, cost: X.cost, items: [], dig: [], dug: false, visited: false, rivalAt: null, rumor: false, cleared: false, stamps: {} };
    for (i = 0; i < 6; i++) { var a = makeItem(r, rollGame(r, [0.25, 0.45]), { seller: 'expoA', sealedP: 0.25, cibP: 0.45 }); a.booth = 'dealerA'; a.uid = 'xa' + i; st.items.push(a); }
    for (i = 0; i < 6; i++) {
      var b = i < 4 ? makeItem(r, rollGame(r, [0.45, 0.4]), { seller: 'expoB', cibP: 0.3 })
        : makeMedia(r, rollMedia(r, i === 4 ? 'music' : 'movie', i === 4 ? ['vinyl', 'cd', 'tape'] : ['vhs', 'dvd'], [0.4, 0.45]), { seller: 'expoB' });
      b.booth = 'dealerB'; b.uid = 'xb' + i; st.items.push(b);
    }
    X.exclusives.forEach(function (e) {
      var sl = e.where === 'homebrew' ? 'expoHb' : e.where === 'dealerA' ? 'expoA' : e.where === 'dealerB' ? 'expoB' : 'expoEx';
      st.items.push({ uid: 'ex' + e.id, id: e.id, t: e.t, p: e.p || 'k16', tier: e.tier, base: e.base, kind: e.kind, art: e.art, fmt: e.fmt, by: e.by,
        cond: e.cond || 'loose', flags: {}, inspected: false, checked: false, state: 'avail', line: '', seller: sl, ask: e.ask,
        minFrac: sl === 'expoHb' ? 0.85 : sl === 'expoEx' ? 1 : 0.9, ex: true, tested: true, booth: e.where, sticker: false });
    });
    // the prototype, under somebody's table
    st.grailBooth = pick(r, ['dealerA', 'dealerB', 'homebrew', 'autograph']);
    st.items.push({ uid: 'exgrail', id: X.grail.id, t: X.grail.t, p: 'pip', kind: 'grail', base: 0, cond: 'cib', flags: {}, state: 'avail', line: '', seller: 'expoB',
      ask: X.grail.ask, minFrac: 0.8, hidden: true, booth: st.grailBooth, sticker: false });
    st.rivals = ['dex', 'brayden', 'phil', 'brody', 'gary', 'steve'];
    day.stops.push(st);
    day.rivals = st.rivals.slice();
    day.expo = true;
  }
  function expoArrive(s) {
    var X = NP.EXPO, lines = [];
    if (S.time < X.doors) { S.time = X.doors; lines.push(X.line); }
    else lines.push(X.lineLate);
    if (!s.paid) {
      s.paid = true;
      if (S.cash >= X.fee) { S.cash -= X.fee; lines.push('($' + X.fee + ' paid.)'); } else lines.push(X.broke);
    }
    s.entryLine = lines.join(' ');
    track('expo_enter'); step('expo_enter');
    magnet('expo');
  }
  var GRADE_MULT = [0.8, 1.1, 1.5, 2];
  function gradeHTML() {
    var X = NP.EXPO.grade, list = S.bag.filter(function (b) { return (b.kind === 'game' || b.kind === 'music' || b.kind === 'movie') && !b.grade; });
    var h = '<div class="sellbox"><h3>Get something graded</h3><div class="sell-k">$' + X.cost + ' and ' + X.min + ' minutes each. A high grade makes it worth more on the shelf. A low grade makes it worth less. No refunds.</div>';
    if (S.gradeToast) { h += '<div class="toast">' + esc(S.gradeToast) + '</div>'; S.gradeToast = ''; }
    if (!list.length) h += '<div class="note">' + (S.bag.length ? 'Nothing in your bag they can grade.' : 'Your bag is empty. Buy something, then come back.') + '</div>';
    list.forEach(function (b) {
      h += '<div class="sellrow"><div class="artbox sm" data-bart="' + b.uid + '"></div><div class="info"><div class="it-t">' + esc(b.t) + '</div>' +
        '<div class="btns"><button class="offer fair" data-act="grade" data-uid="' + b.uid + '"' + (S.cash < X.cost ? ' disabled' : '') + '>Grade it ($' + X.cost + ', ' + X.min + ' min)</button></div></div></div>';
    });
    S.bag.filter(function (b) { return b.grade; }).forEach(function (b) { h += '<div class="note">' + esc(b.t) + ': graded ' + esc(b.grade) + '.</div>'; });
    return h + '</div>';
  }
  function doGrade(uid) {
    var b = bagItem(uid), X = NP.EXPO.grade;
    if (!b || b.grade || S.cash < X.cost) return;
    S.cash -= X.cost;
    actCost(X.min);
    var x = mulberry32(NP.hashStr(S.seed + '|grade|' + uid))();
    var k = (b.flags && (b.flags.damaged || b.flags.repro)) ? 0 : x < 0.2 ? 0 : x < 0.65 ? 1 : x < 0.95 ? 2 : 3;
    b.grade = ['4', '7', '9', '9.8'][k]; b.gradeMult = GRADE_MULT[k];
    S.gradeToast = b.t + ': ' + X.results[k];
    track('expo_grade_' + k);
    if (k >= 2) celebrate(k === 3 ? 'big' : 'good', 'Graded ' + b.grade + '!');
    if (k === 3) magnet('nine8');
    if (!checkSundown()) render();
  }
  function autographHTML() {
    var s = S.stop, X = NP.EXPO;
    if (!s.inLine) return '<div class="btns"><button class="big" data-act="autoline">Wait in the autograph line (' + X.sign.min + ' min)</button></div>';
    var h = '<div class="bubble">' + esc(X.sign.line) + '</div>';
    var here = s.items.filter(function (it) { return it.booth === 'autograph' && (!it.hidden || s.grailOpen); });
    if (here.length) h += '<div class="items">' + here.map(function (it) { return itemCard(it, s); }).join('') + '</div>';
    var chet = S.bag.filter(function (b) { return !b.signed && (b.by === 'Chet Brickwall' || b.kind === 'standee'); });
    if (chet.length) h += '<h3>Get it signed (no charge, he is right there)</h3>' + chet.map(function (b) {
      return '<div class="sellrow"><div class="artbox sm" data-bart="' + b.uid + '"></div><div class="info"><div class="it-t">' + esc(b.t) + '</div><div class="btns"><button class="offer full" data-act="sign" data-uid="' + b.uid + '">Get it signed</button></div></div></div>';
    }).join('');
    else h += '<div class="note">Chet will sign anything from one of his movies (or a cardboard version of himself). Nothing in your bag qualifies.</div>';
    S.bag.filter(function (b) { return b.signed; }).forEach(function (b) { h += '<div class="note">' + esc(b.t) + ': signed. Worth three times as much on the shelf.</div>'; });
    return h;
  }
  function doSign(uid) {
    var b = bagItem(uid);
    if (!b || b.signed || !(b.by === 'Chet Brickwall' || b.kind === 'standee')) return;
    b.signed = true; actCost(1);
    track('expo_signed');
    celebrate('good', 'Signed by Chet Brickwall!');
    magnet('signed');
    if (!checkSundown()) render();
  }

  // =====================================================================================================
  // ---------- Round 3c: the dopamine pack ----------
  // =====================================================================================================
  // Small reward hits that never change the balance: count-ups with ticks, chimes for good moments, streaks,
  // personal bests, fridge magnets and collector ranks. Full game only (the demo stays exactly as it was).
  // Reduced motion: no animation, the numbers just appear. Sound follows the Sound button. Nothing here blocks a tap.
  // calm effects: the settings toggle (no screen shake, flashes or bounce), or the system's reduce motion setting
  function calm() { if (store.get('calmFx', false)) return true; try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function chipStack() {
    var st = document.getElementById('yaystack');
    if (!st) { st = document.createElement('div'); st.id = 'yaystack'; st.setAttribute('aria-live', 'polite'); document.body.appendChild(st); }
    return st;
  }
  function celebrate(level, text, tries) {
    if (!text) return;
    // the demo: want list cards wait for the find reveal to finish, so one good moment lands at a time
    if (DEMO && revealOn && (tries || 0) < 12 && ['goal', 'goaldone', 'unlock'].indexOf(level) >= 0) { setTimeout(function () { celebrate(level, text, (tries || 0) + 1); }, 350); return; }
    var el = document.createElement('div');
    el.className = 'yay ' + (level || 'good') + (calm() ? ' calm' : '');
    el.setAttribute('role', 'status');
    if (level === 'goaldone') {
      bannerUntil = Date.now() + 3000;
      if (tipEl) closeTip(); // nothing covers the win
      var parts = String(text).split('|');
      el.innerHTML = '<b class="yay-h"><span class="yay-sp" aria-hidden="true">&#10022;</span> ' + esc(parts[0]) + ' <span class="yay-sp" aria-hidden="true">&#10022;</span></b><span class="yay-b">' + esc(parts.slice(1).join(' · ')) + '</span>';
    } else el.innerHTML = '<span class="yay-sp" aria-hidden="true">&#10022;</span> ' + esc(text);
    if (level !== 'miss') sfx(level === 'big' || level === 'goaldone' ? 'sting' : level === 'streak' ? 'streak' : level === 'unlock' || level === 'goal' ? 'unlock' : 'sparkle');
    placeChip(el, level === 'goaldone' ? 3000 : 2600);
  }
  // r6.1: a chip never covers the title or another chip.
  // While the announcement slot under the title is on screen, chips go into it, in the page (they push things down, they never sit on top).
  // Otherwise they wait their turn and show inside the NEXT bar itself, one at a time, so they cover nothing (tap one to move on).
  var inlineChips = [], chipQ = [], chipBusy = false, chipCur = null, chipT = null;
  function slotInView() {
    var slot = document.getElementById('annc');
    if (!slot || !S || (S.screen !== 'stop' && S.screen !== 'map')) return null;
    var r = slot.getBoundingClientRect(), hud = document.querySelector('.hud'), ns = document.querySelector('.nsbar');
    var top = hud ? hud.getBoundingClientRect().bottom : 0, bot = ns ? ns.getBoundingClientRect().top : window.innerHeight;
    return r.top >= top - 4 && r.top < bot - 60 ? slot : null;
  }
  function placeChip(el, ms) {
    var slot = slotInView();
    if (slot) {
      el.classList.add('inl');
      while (slot.children.length >= 3) slot.removeChild(slot.firstChild);
      slot.appendChild(el);
      var c = { el: el, until: Date.now() + ms };
      inlineChips.push(c);
      setTimeout(function () {
        el.classList.add('out');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); inlineChips = inlineChips.filter(function (x) { return x !== c; }); }, 320);
      }, ms);
      return;
    }
    if (chipQ.length >= 4) chipQ.shift();
    chipQ.push({ el: el, ms: ms });
    if (!chipBusy) nextChip();
  }
  function chipIntoBar() {
    var ns = document.querySelector('.nsbar');
    if (!chipCur) { if (ns) ns.classList.remove('chipping'); return; }
    if (ns) {
      var host = ns.querySelector('.ns-chip');
      if (!host) { host = document.createElement('div'); host.className = 'ns-chip'; host.addEventListener('click', function () { if (chipT) clearTimeout(chipT); endChip(); }); ns.appendChild(host); }
      ns.classList.add('chipping'); ns.classList.toggle('chip-big', /goaldone|big|unlock/.test(chipCur.el.className));
      if (chipCur.el.parentNode !== host) { host.innerHTML = ''; host.appendChild(chipCur.el); }
    } else {
      var st = chipStack(); // no bar on this screen (the title, home, results): the old spot at the bottom
      if (chipCur.el.parentNode !== st) { st.innerHTML = ''; st.appendChild(chipCur.el); }
    }
  }
  function endChip() {
    if (chipCur && chipCur.el.parentNode) chipCur.el.parentNode.removeChild(chipCur.el);
    chipCur = null; chipT = null;
    nextChip();
  }
  function nextChip() {
    var c = chipQ.shift();
    if (!c) { chipBusy = false; chipCur = null; chipIntoBar(); return; }
    chipBusy = true; chipCur = c;
    chipIntoBar();
    var ms = chipQ.length ? Math.min(c.ms, 1800) : c.ms; // a line of them moves along faster
    chipT = setTimeout(endChip, ms);
  }
  function restoreChips() {
    var slot = document.getElementById('annc'); if (!slot) return;
    inlineChips.forEach(function (c) { if (Date.now() < c.until && c.el.parentNode !== slot) slot.appendChild(c.el); });
  }
  function magnets() { var m = store.get('magnets', {}); return m && typeof m === 'object' ? m : {}; }
  function magnet(id) {
    if (DEMO) return;
    var m = magnets(); if (m[id]) return;
    var M = NP.MAGNETS.filter(function (x) { return x.id === id; })[0]; if (!M) return;
    m[id] = S && S.season ? 'Saturday ' + S.week : 'yes';
    store.set('magnets', m);
    if (S) (S.newMagnets = S.newMagnets || []).push(id);
    track('magnet_' + id);
    celebrate('unlock', 'New fridge magnet: ' + M.name);
  }
  function rankOf(n) { var k = 0; for (var i = 0; i < NP.RANKS.length; i++) if (n >= NP.RANKS[i][0]) k = i; return k; }
  function rankLine() {
    var n = store.get('finds', 0) || 0, k = rankOf(n), nx = NP.RANKS[k + 1];
    return 'Collector rank: <b>' + esc(NP.RANKS[k][1]) + '</b>' + (nx ? ' &middot; ' + (nx[0] - n) + ' more finds to ' + esc(nx[1]) : ' &middot; the top. The shelf is never full.') +
      ' &middot; Fridge magnets: ' + Object.keys(magnets()).length + ' of ' + NP.MAGNETS.length;
  }
  // the money in the top bar counts up or down to the new amount, with a few quiet ticks
  var hudCash = null;
  function animCash() {
    if (!S) { hudCash = null; return; }
    var el = document.querySelector('.hud .cashn'), to = Math.round(S.cash), from = hudCash;
    hudCash = to;
    if (!DEMO && from != null && to > from) popNum('+$' + (to - from), 'cash' + (to - from >= 20 ? ' big' : ''));
    if (DEMO || !el || from == null || from === to || calm()) return;
    var t0 = performance.now(), dur = 450, ticks = 0;
    el.textContent = money(from); el.classList.remove('up', 'down'); el.classList.add(to > from ? 'up' : 'down');
    (function f(now) {
      var p = Math.min(1, (now - t0) / dur);
      el.textContent = money(from + (to - from) * p);
      if (p >= ticks * 0.25 && ticks < 4) { ticks++; sfx('tick'); }
      if (p < 1 && document.body.contains(el)) requestAnimationFrame(f); else el.textContent = money(to);
    })(t0);
  }
  // a number on the page counts up from zero
  function countUp(el, to, dur) {
    if (!el) return;
    if (DEMO || calm() || to <= 0) { el.textContent = to; return; }
    var t0 = performance.now(), ticks = 0;
    el.textContent = '0';
    (function f(now) {
      var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * e);
      if (p >= ticks / 6 && ticks < 6) { ticks++; sfx('coin'); }
      if (p < 1 && document.body.contains(el)) requestAnimationFrame(f); else { el.textContent = to; if (to >= 300) { el.classList.add('bigwin'); sfx('cash'); } }
    })(t0);
  }
  // a good buy: a haggle win, a streak, a rare one
  function cheerBuy(it, price) {
    if (DEMO) return;
    if (price < it.ask) {
      S.streak = (S.streak || 0) + 1;
      magnet('haggle');
      if (S.streak === 3) { celebrate('streak', 'Haggle streak: 3 in a row!'); magnet('streak3'); }
      else if (S.streak === 5) { celebrate('streak', 'Haggle streak: 5. The sellers are talking about you.'); magnet('streak5'); }
      else celebrate('good', 'Haggle win! Saved ' + money(it.ask - price) + '.');
    } else S.streak = 0;
    // the find reveal (Round 5) shows the rare ones, so there is no chip for them here
  }
  // personal bests and "so close" lines, worked out when you shelve
  function personalBests(R) {
    if (DEMO) return [];
    var pb = store.get('pb', null) || {}, out = [];
    pb.sat = pb.sat || {};
    var key = S.season ? 'season' : modeOf();
    var prev = pb.sat[key];
    if (prev != null) {
      if (R.score > prev) out.push(['best', 'NEW PERSONAL BEST: best Saturday ever (' + R.score + ', up from ' + prev + ')']);
      else if (prev - R.score <= Math.max(10, Math.round(prev * 0.15))) out.push(['close', 'So close: ' + (prev - R.score) + ' points short of your best Saturday (' + prev + ').']);
    }
    pb.sat[key] = Math.max(prev || 0, R.score);
    var top = R.lines.slice().sort(function (a, b) { return b.pts - a.pts; })[0];
    if (top && top.pts > 0) {
      if (pb.find && top.pts > pb.find.pts) out.push(['best', 'NEW PERSONAL BEST: best find ever. ' + top.t + ' (+' + top.pts + ')']);
      if (!pb.find || top.pts > pb.find.pts) pb.find = { pts: top.pts, t: top.t };
    }
    if (S.season && SEASON) {
      var val = SEASON.shelf.reduce(function (a, b) { return a + Math.max(0, b.v || 0); }, 0);
      if (pb.shelf != null && val > pb.shelf) out.push(['best', 'NEW PERSONAL BEST: shelf value (' + val + ' points)']);
      pb.shelf = Math.max(pb.shelf || 0, val);
    }
    store.set('pb', pb);
    return out;
  }
  // the magnets you can only earn by how the day went
  function dayMagnets(R) {
    if (DEMO) return;
    if (R.lines.some(function (l) { return l.it && l.it.kind === 'grail'; })) magnet('grail');
    if (R.lines.some(function (l) { return l.it && l.it.id === 'npx'; })) magnet('proto');
    if (R.bonus.some(function (b) { return /trilogy/.test(b[0]); })) magnet('trilogy');
    if (R.lines.some(function (l) { return l.pts < 0 && l.note.indexOf('shelf') >= 0; })) magnet('dupe');
    if (R.lines.filter(function (l) { return l.it && l.it.kind === 'merch'; }).length >= 3) magnet('merch');
    if (S.bag.some(function (b) { return b.decision === 'open'; })) magnet('opened');
    if (!S.bag.length && !S.ev.sold) magnet('browse');
    if (S.cash < 2) magnet('coins');
    if (R.score >= 300) magnet('big');
  }
  // collector rank: every find you shelve (any mode but the demo) counts toward the next rank
  function addFinds(n) {
    if (DEMO) return;
    var before = store.get('finds', 0) || 0, after = before + n;
    store.set('finds', after);
    var a = rankOf(before), b = rankOf(after);
    if (b > a) { S.rankUp = NP.RANKS[b][1]; track('rank_' + b); celebrate('unlock', 'Collector rank up: ' + NP.RANKS[b][1]); }
  }
  function fridgeHTML() {
    var m = magnets();
    return '<div class="fridge"><h3>The fridge</h3><div class="shelfnote">' + rankLine() + '</div><div class="magnets">' + NP.MAGNETS.map(function (x) {
      var got = !!m[x.id];
      return '<div class="mag' + (got ? ' got' : '') + '"><b>' + (got ? esc(x.name) : '?') + '</b><small>' + esc(x.how) + '</small></div>';
    }).join('') + '</div>' + tackleHTML() + '</div>';
  }
  // the demo's results: what is in your tackle box, and how much more the full game's want list has
  function demoTackle() {
    var tb = tackle(), T = NP.DEMO_WANT_TEXT, got = NP.GOALS_POOL.filter(function (d) { return tb[d.id]; });
    if (!got.length) return '';
    return '<div class="demotackle"><b>' + esc(T.box) + ':</b> ' + got.map(function (d) { return esc(d.reward); }).join(', ') + '. ' +
      esc(T.boxLine.replace('{have}', got.length).replace('{all}', NP.GOALS_POOL.length)) + '</div>';
  }
  // the tackle box: want list rewards
  function tackleHTML() {
    var tb = tackle(), W = NP.WANT_TEXT, have = NP.GOALS_POOL.filter(function (d) { return tb[d.id]; }).length;
    return '<h3>' + esc(W.box) + ' <small class="tb-n">' + have + ' of ' + NP.GOALS_POOL.length + '</small></h3><div class="shelfnote">' + esc(W.boxNote) + '</div><div class="tackle">' +
      NP.GOALS_POOL.map(function (d) {
        var n = tb[d.id] || 0;
        return '<div class="tb-it' + (n ? ' got' : '') + '"><b>' + (n ? esc(d.reward) + (n > 1 ? ' <span class="tb-x">x' + n + '</span>' : '') : '?') + '</b><small>' + esc(d.name) + ': ' + esc(d.label) + '</small></div>';
      }).join('') + '</div>';
  }

  // =====================================================================================================
  // ---------- Round 3c: the replay pack (mini-goals, surprises, combo and fever, ultra rares, scenery) ----------
  // =====================================================================================================
  // From playtesting: the long version got repetitive. Full game only; the demo never sees any of this.
  function feverOn() { return !!(S && S.fever && S.time < S.fever); }
  // ---------- Round 5: streaks. Back-to-back good haggles and finds raise it; each tier pays more (x1.25, x1.5, x2 cap) ----------
  function tierOf(c) { var m = 1, T = NP.STREAK.tiers; for (var i = 0; i < T.length; i++) if (c >= T[i][0]) m = T[i][1]; return m; }
  function nextTier(c) { var T = NP.STREAK.tiers; for (var i = 0; i < T.length; i++) if (c < T[i][0]) return T[i]; return null; }
  function fmtX(m) { return String(Math.round(m * 100) / 100); }
  function comboMult() { return tierOf((S && S.combo) || 0); }
  // rising stakes you can feel: the music and your walking speed pick up with the streak, more in a fever
  function paceMult() { return DEMO || !S ? 1 : 1 + 0.03 * Math.min(S.combo || 0, 8) + (feverOn() ? 0.06 : 0); }
  function walkBoost() { return DEMO || !S ? 1 : 1 + 0.05 * Math.min(S.combo || 0, 8) + (feverOn() ? 0.2 : 0); }
  // bonus points: they go on the Saturday's score (and, at half weight, the season score). Each one pops on screen.
  function bonus(cat, pts) {
    pts = Math.max(1, Math.round(pts));
    S.bonusLog = S.bonusLog || [];
    S.bonusLog.push([cat, pts]);
    popNum('+' + pts + ' pts', pts >= 40 ? 'big' : '');
    return pts;
  }
  function comboUp(n) {
    if (DEMO || !S) return;
    var before = S.combo || 0;
    S.combo = before + (n || 1);
    var m0 = tierOf(before), m1 = tierOf(S.combo);
    sfx('rise', S.combo);
    if (!feverOn() && before < NP.FEVER.at && S.combo >= NP.FEVER.at) {
      S.fever = S.time + NP.FEVER.mins;
      track('fever'); magnet('fever');
      celebrate('big', NP.FEVER.text);
    }
    if (m1 > m0) { celebrate('streak', 'STREAK x' + fmtX(m1) + '!'); track('streak_x' + fmtX(m1).replace('.', '')); if (m1 >= 2) magnet('streakx2'); }
    tempo(paceMult());
  }
  // a find's value on the shelf, worked out the same way the appraisal does (near enough)
  function estValue(it) {
    if (!it) return 0;
    if (it.kind === 'grail') return 100;
    if (it.kind === 'game') return (it.base || 0) * (COND_MULT[it.cond] || 1) * (it.variant && NP.VARIANTS[it.variant] ? NP.VARIANTS[it.variant].mult : 1) * (it.flaw ? NP.FLAW.mult : 1);
    if (isMedia(it)) return (it.base || 0) * mediaMult(it);
    return 0;
  }
  // a good buy keeps the streak going: you haggled it down, or it is worth half again what you paid
  function goodBuy(it, price) {
    if (DEMO) return;
    var v = estValue(it);
    if (!(price < it.ask || (v > 0 && v >= price * NP.STREAK.good))) return;
    comboUp(1);
    S.lastGoodV = v;
    var m = comboMult();
    if (m > 1 && v > 0) { var pay = Math.min(NP.STREAK.cap, Math.round(v * (m - 1))); if (pay > 0) bonus('Streak', pay); }
  }
  function comboBreak() {
    if (!S || feverOn()) return; // fever protects your streak until it runs out
    var c = S.combo || 0;
    if (c >= 2 && !DEMO) {
      var nt = nextTier(c), v = S.lastGoodV || 0;
      var msg = 'Streak broken at x' + fmtX(tierOf(c)) + '.';
      if (nt && v > 0) msg += ' ' + (nt[0] - c) + ' more good deal' + (nt[0] - c === 1 ? '' : 's') + ' and x' + fmtX(nt[1]) + ' would have paid +' + Math.min(NP.STREAK.cap, Math.round(v * (nt[1] - 1))) + ' on a find like your last one.';
      else if (v > 0) msg += ' It was paying +' + Math.min(NP.STREAK.cap, Math.round(v * (tierOf(c) - 1))) + ' a find.';
      celebrate('miss', msg); sfx('miss');
      track('streak_broken_' + c);
    }
    S.combo = 0;
    tempo(paceMult());
  }
  function feverCheck() {
    if (S && S.fever && S.time >= S.fever) { S.fever = 0; S.combo = 0; S.toast = (S.toast ? S.toast + ' ' : '') + 'Fever is over. Back to normal haggling.'; track('fever_end'); }
  }

  // ---------- Round 5: find reveals (loot colors, a box that flips open, a shake, a sting; the grail gets the works) ----------
  function rarityOf(it) {
    if (!it) return 'common';
    if (it.kind === 'grail' || it.ultra || it.uid === 'exgrail') return 'grail';
    var t = it.tier || 0;
    if (it.variant === 'promo' || it.variant === 'shell-gold') t = Math.max(t, 3);
    if (it.cond === 'sealed' && t >= 2) t = 3;
    return t >= 3 ? 'rare' : t === 2 ? 'uncommon' : 'common';
  }
  var revealOn = null;
  function shake(n) {
    if (calm()) return;
    var el = document.getElementById('app'); if (!el) return;
    el.classList.remove('shake1', 'shake2'); void el.offsetWidth; el.classList.add('shake' + n);
    setTimeout(function () { el.classList.remove('shake' + n); }, 450);
  }
  function closeReveal() {
    if (!revealOn) return;
    var R = revealOn; revealOn = null;
    clearTimeout(R.t); window.removeEventListener('keydown', R.key, true);
    R.ov.classList.add('out');
    setTimeout(function () { if (R.ov.parentNode) R.ov.parentNode.removeChild(R.ov); }, 180);
  }
  function reveal(it, opts) {
    if (!it) return;
    opts = opts || {};
    var rar = opts.rarity || rarityOf(it), RR = NP.RARITY[rar], quiet = calm();
    var dur = opts.dur || { common: 800, uncommon: 1050, rare: 1250, grail: 1500 }[rar];
    if (DEMO && fast()) dur = Math.round(dur * 0.6);
    if (revealOn) { var old = revealOn; closeReveal(); if (old.ov.parentNode) old.ov.parentNode.removeChild(old.ov); } // a new find replaces the last card at once
    document.querySelectorAll('.reveal-ov.out').forEach(function (o) { if (o.parentNode) o.parentNode.removeChild(o); });
    var ov = document.createElement('div');
    ov.className = 'reveal-ov r-' + rar + (quiet ? ' calm' : '') + (opts.miss ? ' miss' : '');
    ov.setAttribute('role', 'status'); ov.setAttribute('aria-live', 'polite');
    ov.innerHTML = (rar === 'grail' && !quiet ? '<div class="rv-flash"></div>' : '') +
      '<div class="rv-card" style="--rc:' + RR.color + '"><div class="rv-box"><div class="rv-lid"></div><div class="rv-art"></div></div>' +
      '<div class="rv-rar">' + esc(opts.label || RR.label) + '</div><div class="rv-t">' + esc(it.t) + '</div>' +
      (opts.line ? '<div class="rv-l">' + esc(opts.line) + '</div>' : '') +
      (opts.stamp ? '<div class="rv-stamp">' + esc(opts.stamp) + '</div>' : '') +
      '<div class="rv-skip">' + (coarse() ? 'Tap' : 'Click') + ' to skip</div></div>';
    document.body.appendChild(ov);
    try { ov.querySelector('.rv-art').appendChild(NP.makeArt(it, 3)); } catch (e) {}
    var key = function (e) { if (e.key === 'Tab' || e.key === 'Shift') return; e.preventDefault(); e.stopPropagation(); closeReveal(); };
    revealOn = { ov: ov, key: key, t: setTimeout(closeReveal, dur) };
    ov.addEventListener('click', function (e) { e.stopPropagation(); closeReveal(); });
    window.addEventListener('keydown', key, true);
    if (opts.miss) { sfx('miss'); shake(1); return; }
    sfx('flip');
    if (rar === 'grail') { sfx('grail'); shake(2); }
    else if (rar === 'rare') { sfx('sting'); shake(1); }
    else if (rar === 'uncommon') { sfx('unlock'); shake(1); }
    track('reveal_' + rar);
  }

  // ---------- Demo round 5: the find, with juice ----------
  function confetti(n) {
    if (calm()) return;
    var host = document.createElement('div'); host.className = 'confetti'; host.setAttribute('aria-hidden', 'true');
    var cols = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#fff1d6'], h = '';
    for (var i = 0; i < (n || 36); i++) h += '<i style="left:' + (Math.random() * 100).toFixed(1) + '%;background:' + cols[i % cols.length] + ';--dx:' + ((Math.random() - 0.5) * 120).toFixed(0) + 'px;--r:' + Math.round(Math.random() * 720) + 'deg;animation-delay:' + (Math.random() * 0.25).toFixed(2) + 's;animation-duration:' + (1 + Math.random() * 0.6).toFixed(2) + 's"></i>';
    host.innerHTML = h; document.body.appendChild(host);
    setTimeout(function () { if (host.parentNode) host.parentNode.removeChild(host); }, 2000);
  }
  function demoJuice(it, price) {
    if (!(it.kind === 'game' || it.kind === 'grail' || isMedia(it))) return;
    var v = Math.round(estValue(it)), steal = v >= price * 3 && v - price >= 10;
    var rar = rarityOf(it);
    reveal(it, { label: NP.RARITY[rar].label, line: 'Worth about ' + money(v) + '. You paid ' + money(price) + '.', stamp: steal ? 'STEAL!' : '' });
    if (v > price) setTimeout(function () { popNum('+' + money(v - price) + ' value', v - price >= 20 ? 'cash big' : 'cash'); }, 450);
    if (steal) { setTimeout(function () { confetti(40); sfx('fanfare'); }, 300); track('steal'); }
  }

  // ---------- Demo round 5: settings (one button, everything in one place) ----------
  function setButton() { return '<button class="fsbtn setbtn" data-act="settings" aria-haspopup="dialog"><span aria-hidden="true">&#9881;</span> Settings</button>'; }
  window.addEventListener('resize', function () { paintSharpies(); });
  function applyTextSize() { var v = +store.get('tsize', 1) || 1; if ([1, 1.15, 1.3].indexOf(v) < 0) v = 1; document.documentElement.style.setProperty('--tsz', v); document.body.classList.toggle('bigtext', v > 1); }
  function fast() { return store.get('speed', 'normal') === 'fast'; }
  function seg(act, cur, opts) {
    return '<div class="seg" role="group">' + opts.map(function (o) { return '<button data-act="' + act + '" data-v="' + o[0] + '" aria-pressed="' + (String(cur) === String(o[0])) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>';
  }
  function openSettings() {
    var X = NP.DEMO5.set, ov = document.querySelector('.setov'), fresh = !ov;
    if (!ov) { ov = document.createElement('div'); ov.className = 'setov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', X.title); document.body.appendChild(ov); }
    var vol = NP.Sound && NP.Sound.volume ? Math.round(NP.Sound.volume() * 100) : 100, muted = NP.Sound && NP.Sound.isMuted();
    var keepY = ov.querySelector('.set-body') ? ov.querySelector('.set-body').scrollTop : 0;
    ov.innerHTML = '<div class="setp"><h2>' + esc(X.title) + '</h2><div class="set-body">' +
      '<div class="setrow"><span>' + esc(X.sound) + '</span>' + seg('mute', muted ? 'off' : 'on', [['on', 'On'], ['off', 'Off']]).replace(/data-act="mute" data-v="(on|off)" aria-pressed="true"/g, 'data-noop="1" aria-pressed="true"') + '</div>' +
      '<div class="setrow"><label for="setvol">' + esc(X.volume) + ' <b class="set-volv">' + vol + '%</b></label><input id="setvol" type="range" min="0" max="100" step="5" value="' + vol + '" data-set="vol"></div>' +
      '<div class="setrow"><span>' + esc(X.text) + '</span>' + seg('tsize', store.get('tsize', 1), [[1, 'Normal'], [1.15, 'Large'], [1.3, 'Larger']]) + '</div>' +
      '<div class="setrow"><span>' + esc(X.speed) + '<small>' + esc(X.speedNote) + '</small></span>' + seg('speed', store.get('speed', 'normal'), [['normal', 'Normal'], ['fast', 'Fast']]) + '</div>' +
      '<div class="setrow"><span>' + esc(X.fx) + '<small>' + esc(X.fxNote) + '</small></span>' + seg('calmfx2', store.get('calmFx', false) ? 'calm' : 'full', [['full', 'Full'], ['calm', 'Calm']]) + '</div>' +
      '<div class="setrow"><span>' + esc(X.tips) + '</span>' + seg('tips', tipsOff ? 'off' : 'on', [['on', 'On'], ['off', 'Off']]).replace(/data-act="tips" data-v="(on|off)" aria-pressed="true"/g, 'data-noop="1" aria-pressed="true"') + '</div>' +
      '<div class="setrow"><label class="adtoggle"><input type="checkbox" data-act="adfree"' + (adFree ? ' checked' : '') + '> Ad-Less Edition</label>' + fsButton() + '</div>' +
      '<div class="setnote">' + esc(X.colors) + ' <a href="privacy.html" target="_blank" rel="noopener">' + esc(X.privacy) + '</a></div></div>' +
      '<button class="big set-done" data-act="setclose">' + esc(X.done) + '</button></div>';
    var sb = ov.querySelector('.set-body'); if (sb) sb.scrollTop = keepY;
    if (fresh) {
      ov.addEventListener('click', function (e) { if (e.target === ov) closeSettings(); });
      ov.__key = function (e) { if (e.key === 'Escape') closeSettings(); }; window.addEventListener('keydown', ov.__key);
      track('settings_open');
      var f = ov.querySelector('button'); if (f) try { f.focus({ preventScroll: true }); } catch (e) {}
    }
  }
  function closeSettings() { var ov = document.querySelector('.setov'); if (!ov) return; window.removeEventListener('keydown', ov.__key); ov.parentNode.removeChild(ov); if (S) render(); }

  // ---------- Demo round 5: undo the last buy or sale (8 seconds) ----------
  var undoSnap = null, undoT = null;
  var UNDO_SKIP = { day: 1, stop: 1, screen: 1, seed: 1, history: 1, miniAt: 1, miniN: 1, miniLast: 1, cameoN: 1 };
  function snapForUndo(kind, label) {
    if (!DEMO || !S || !S.stop) return;
    var top = {}, s = S.stop;
    Object.keys(S).forEach(function (k) { if (!UNDO_SKIP[k]) top[k] = S[k]; });
    var items = {};
    ['items', 'dig', 'rivalTable'].forEach(function (a) { (s[a] || []).forEach(function (it) { items[it.uid] = it; }); });
    var stopFlat = {}; Object.keys(s).forEach(function (k) { if (['items', 'dig', 'rivalTable'].indexOf(k) < 0) stopFlat[k] = s[k]; });
    try { undoSnap = { kind: kind, label: label, stopId: s.id, screen: S.screen, top: JSON.stringify(top), items: JSON.stringify(items), stopFlat: JSON.stringify(stopFlat) }; } catch (e) { undoSnap = null; }
  }
  function offerUndo() {
    if (!undoSnap) return;
    var old = document.querySelector('.undochip'); if (old) old.parentNode.removeChild(old);
    var el = document.createElement('button'); el.className = 'undochip'; el.setAttribute('data-act', 'undo');
    el.innerHTML = '&#8630; ' + esc(NP.DEMO5.undo.replace('{what}', undoSnap.label));
    document.body.appendChild(el);
    if (undoT) clearTimeout(undoT);
    undoT = setTimeout(dropUndo, 8000);
  }
  function dropUndo() { undoSnap = null; if (undoT) clearTimeout(undoT); undoT = null; var el = document.querySelector('.undochip'); if (el) el.parentNode.removeChild(el); }
  function doUndo() {
    var u = undoSnap; dropUndo();
    if (!u || !S || !S.stop || S.stop.id !== u.stopId) return;
    if (revealOn) closeReveal();
    var top = JSON.parse(u.top), items = JSON.parse(u.items), flat = JSON.parse(u.stopFlat), s = S.stop;
    Object.keys(S).forEach(function (k) { if (!UNDO_SKIP[k] && !(k in top)) delete S[k]; });
    Object.keys(top).forEach(function (k) { S[k] = top[k]; });
    Object.keys(flat).forEach(function (k) { s[k] = flat[k]; });
    ['items', 'dig', 'rivalTable'].forEach(function (a) { if (s[a]) s[a] = s[a].filter(function (it) { return items[it.uid]; }); }); // anything put out after the sale goes back too
    ['items', 'dig', 'rivalTable'].forEach(function (a) { (s[a] || []).forEach(function (it) { var w = items[it.uid]; if (!w) return; Object.keys(it).forEach(function (k) { if (!(k in w)) delete it[k]; }); Object.keys(w).forEach(function (k) { it[k] = w[k]; }); }); });
    track('undo_' + u.kind);
    S.toast = NP.DEMO5.undone;
    sfx('flip');
    var y = window.scrollY; render(); window.scrollTo(0, y);
  }

  // ---------- Demo round 5: the next step, always on screen, one big button in thumb reach ----------
  function nextStep() {
    var N = NP.DEMO5.next;
    if (!S) return null;
    if (S.screen === 'map') { var n = planRoute()[0]; return n ? { t: DEMO ? N.map.replace('{name}', NP.DEMO5.short[n.type] ? NP.DEMO5.short[n.type].toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }) : n.name) : N.mapFull.replace('{name}', n.name), b: N.drive, id: n.id } : { t: N.home, b: N.homeBtn, home: true }; }
    if (S.screen === 'stop' && S.stop) {
      var avail = S.stop.items.filter(function (x) { return x.state === 'avail'; });
      var early = avail.filter(function (x) { return x.early; })[0];
      var nx = planRoute()[0];
      var t = early ? N.early : S.goal ? N.goal.replace('{goal}', (goalDef(S.goal.id) || {}).label || '') : avail.length ? N.shop : N.done;
      return nx ? { t: t, b: N.next, id: nx.id } : { t: t, b: N.homeBtn, home: true };
    }
    if (S.screen === 'walk') return { t: S.goal ? N.goal.replace('{goal}', (goalDef(S.goal.id) || {}).label || '') : S.stop && S.stop.type === 'expo' ? N.walkExpo : N.walk, b: null };
    return null;
  }
  function nextStepHTML() {
    var n = nextStep(); if (!n) return '';
    return '<div class="nsbar" role="status"><span class="ns-t"><b>' + esc(NP.DEMO5.next.tag) + '</b> ' + esc(n.t) + '</span>' + (n.b ? '<button class="ns-b" data-act="nsgo">' + esc(n.b) + ' &#9654;</button>' : '') + '</div>';
  }
  function placeNextStep() {
    var old = document.querySelector('.nsbar'); if (old) old.parentNode.removeChild(old);
    document.body.classList.remove('has-ns');
    var h = nextStepHTML(); if (!h) return;
    var d = document.createElement('div'); d.innerHTML = h; document.body.appendChild(d.firstChild);
    document.body.classList.add('has-ns');
  }
  function nextStepGo() {
    var n = nextStep(); if (!n) return;
    track('nextstep_' + S.screen);
    if (tipEl) closeTip();
    if (S.screen === 'map') { if (n.home) { var hb = document.querySelector('[data-act="gohome"], [data-act="leavehome"]'); if (hb) hb.click(); } else driveTo(n.id, 'nextbar'); return; }
    if (S.screen === 'stop') { if (n.home) leaveStop('home'); else leaveStop('next', n.id); }
  }

  // ---------- Demo round 5: TV commercials (optional, never cost daylight) ----------
  function playTV(where) {
    if (!NP.TVAds) return;
    var n = store.get('tvN', 0) || 0; store.set('tvN', n + 1);
    music(null); if (NP.Sound && NP.Sound.ambience) NP.Sound.ambience(null);
    track('tv_' + where);
    NP.TVAds.play({ idx: n, label: where === 'map' ? 'A QUICK BREAK BETWEEN DRIVES' : where === 'yard' ? 'THE TV ON THE CARD TABLE' : 'ON THE NEXT TABLE', onDone: function (skipped) {
      track(skipped ? 'tv_skipped' : 'tv_watched');
      var sc = applyScene();
      music(sc ? SCENES[sc].music : 'title', true);
      if (NP.Sound && NP.Sound.ambience) NP.Sound.ambience(ambFor());
    } });
  }

  // ---------- Demo round 5: the odd sellers (rare, random, all original). Spot all nine for a hidden trophy ----------
  function cameosSeen() { var c = store.get('cameos', {}); return c && typeof c === 'object' ? c : {}; }
  function pickCameo() {
    var seen = cameosSeen(), all = NP.CAMEOS || [], fresh = all.filter(function (c) { return !seen[c.id]; });
    var pool = fresh.length && Math.random() < 0.75 ? fresh : all;
    return pool[Math.floor(Math.random() * pool.length)] || null;
  }
  function maybeCameo(s) {
    if (!NP.CAMEOS || !s || s.cameo !== undefined) return;
    s.cameo = null;
    if (s.type === 'flea' || s.type === 'expo' || s.gift || s.type === 'banned' || s.type === 'mall') return; // the walkable places get theirs as a mini event
    if ((S.cameoN || 0) >= 2 || Math.random() > (window.__NP_TEST && window.__NP_TEST.cameoOdds != null ? window.__NP_TEST.cameoOdds : 0.25)) return;
    var c = pickCameo(); if (!c) return;
    var it = s.items.filter(function (x) { return x.state === 'avail' && x.kind === 'game' && !x.early && !x.mistag; })[0];
    if (!it) return;
    it.seller = c.id; it.ask = Math.max(1, Math.round(it.ask * 0.85)); it.minFrac = Math.min(it.minFrac, 0.6);
    s.cameo = c.id; S.cameoN = (S.cameoN || 0) + 1;
  }
  function spotCameo(id, noBonus) {
    var seen = cameosSeen(), first = !Object.keys(seen).length, was = seen[id];
    if (!was) { seen[id] = 1; store.set('cameos', seen); if (S && !noBonus) bonus('Odd sellers', 10); track('cameo_' + id); }
    var n = Object.keys(seen).length, all = (NP.CAMEOS || []).length, T = NP.CAMEO_TEXT;
    if (!was) celebrate('goal', (first ? T.first + ' ' : '') + T.spotted.replace('{n}', n).replace('{all}', all));
    if (!was && n >= all && !store.get('cameoTrophy', 0)) {
      store.set('cameoTrophy', 1); track('cameo_trophy');
      setTimeout(function () { celebrate('goaldone', T.trophy); confetti(60); sfx('fanfare'); }, 900);
    }
    return !was;
  }
  function cameoBox(s) {
    if (!s.cameo) return '';
    var c = (NP.CAMEOS || []).filter(function (x) { return x.id === s.cameo; })[0]; if (!c) return '';
    return '<div class="cameo"><canvas class="cameo-cv" width="48" height="64" data-cameo="' + c.id + '" aria-hidden="true"></canvas><div><b class="cameo-tag">' + esc(NP.CAMEO_TEXT.tag) + '</b> <b>' + esc(c.name) + '</b>' +
      '<div class="cameo-t">' + esc(c.tag) + '.</div><div class="cameo-l">"' + esc(c.hi[0]) + '"</div></div></div>';
  }
  // r6.2: an odd seller counts as spotted once their card is really on screen (above the NEXT bar), so the
  // "odd seller!" chip never shows while the card is still hidden under the bar on a short screen
  var cameoIO = null;
  function watchCameo(s) {
    if (cameoIO) { cameoIO.disconnect(); cameoIO = null; }
    var el = document.querySelector('.screen.stop .cameo');
    if (!el || !s || !s.cameo || s.cameoSpotted) return;
    var id = s.cameo, go = function () { if (s.cameoSpotted) return; s.cameoSpotted = true; if (cameoIO) { cameoIO.disconnect(); cameoIO = null; } setTimeout(function () { spotCameo(id); }, 350); };
    if (!('IntersectionObserver' in window)) { setTimeout(go, 600); return; }
    var ns = document.querySelector('.nsbar'), nsH = ns ? Math.ceil(ns.getBoundingClientRect().height) : 90;
    cameoIO = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio >= 0.6) go(); }); },
      { threshold: [0, 0.6, 1], rootMargin: '0px 0px -' + nsH + 'px 0px' });
    cameoIO.observe(el);
  }
  function drawCameos() {
    document.querySelectorAll('[data-cameo]').forEach(function (cv) { try { NP.drawCameo(cv.getContext('2d'), cv.getAttribute('data-cameo'), 2); } catch (e) {} });
  }
  function cameoCount() { return Object.keys(cameosSeen()).length; }

  // ---------- Demo round 5: a mini event every minute or so (never during a reveal or a panel) ----------
  var miniT = null;
  function miniTick() {
    if (!S || (S.screen !== 'stop' && S.screen !== 'walk') || !S.stop) return;
    if (!DEMO) return miniTickFull();
    if (revealOn || tipEl || document.querySelector('.crt-overlay, .callov, .tvov, .minicard, .tvad-ov, .reveal-ov, .wpanel:not([hidden]), .setov, .wmap-ov')) return;
    var now = Date.now();
    if (!S.miniAt) { S.miniAt = now + 40000; return; }
    if (now < S.miniAt || (S.miniN || 0) >= 4) return;
    S.miniAt = now + 70000; S.miniN = (S.miniN || 0) + 1;
    var E = NP.DEMO5.mini, ids = Object.keys(E), id = ids[(NP.hashStr(S.seed + '|' + S.miniN) + S.history.length) % ids.length];
    if (S.miniLast === id) id = ids[(ids.indexOf(id) + 1) % ids.length];
    S.miniLast = id;
    var pool = S.stop.items.filter(function (x) { return x.state === 'avail' && (x.kind === 'game' || isMedia(x)); });
    var line = E[id], act = null;
    if (id === 'flash') {
      var who = pool.length ? pool[0].seller : null, sl = NP.SELLERS[who] || {};
      pool.filter(function (x) { return x.seller === who; }).forEach(function (x) { x.ask = Math.max(1, Math.round(x.ask * 0.7)); });
      line = line.replace('{who}', sl.name || 'A seller');
    } else if (id === 'gun') {
      var g = pool.filter(function (x) { return x.kind === 'game' && x.tier >= 2; })[0] || pool[0];
      if (g) { g.ask = 1; g.minFrac = 1; g.mistag = true; line = line.replace('{t}', g.t); } else { id = 'cash'; line = E.cash; }
    } else if (id === 'tv') act = 'tv';
    else if (id === 'cameo') {
      var cm = S.cameoN >= 2 ? null : pickCameo();
      if (cm) { S.cameoN = (S.cameoN || 0) + 1; act = 'cameo:' + cm.id; line = NP.CAMEO_TEXT.mini.replace('{name}', cm.name).replace('{tag}', cm.tag) + ' "' + cm.hi[0] + '"'; }
      else { id = 'cash'; line = E.cash; }
    }
    if (id === 'cameo' && S.stop.type !== 'flea') { id = 'cash'; line = E.cash; act = null; }
    if (id === 'cash') S.cash += 5;
    if (id === 'radio') S.cash += 10;
    showMini(line, act);
    bonus('Mini events', 10);
    track('mini_' + id);
    if (S.screen === 'stop') { var y = window.scrollY; render(); window.scrollTo(0, y); } else if (NP.Walk && NP.Walk.refresh) NP.Walk.refresh();
    animCash();
  }
  // r6.2: the full game's mini events. They never touch money, prices, the clock or points (the balance stays exactly as it was):
  // a TV to watch, an odd seller at the swap meet, and little moments around town. Same pacing as the demo, up to 4 a Saturday.
  function miniTickFull() {
    if (revealOn || tipEl || document.querySelector('.crt-overlay, .callov, .tvov, .minicard, .tvad-ov, .reveal-ov, .wpanel:not([hidden]), .setov, .wmap-ov, .loading-ov')) return;
    var now = Date.now();
    if (!S.miniAt) { S.miniAt = now + 40000; return; }
    if (now < S.miniAt || (S.miniN || 0) >= 4) return;
    S.miniAt = now + 70000; S.miniN = (S.miniN || 0) + 1;
    var E = NP.FULL_MINI, walkable = S.stop.type === 'flea' || S.stop.type === 'expo';
    var ids = Object.keys(E).filter(function (k) { return k !== 'cameo' || (walkable && (S.cameoN || 0) < 2); });
    var id = ids[(NP.hashStr(S.seed + '|full|' + S.miniN) + S.history.length) % ids.length];
    if (S.miniLast === id) id = ids[(ids.indexOf(id) + 1) % ids.length];
    S.miniLast = id;
    var line = E[id], act = null;
    if (id === 'tv') act = 'tv';
    if (id === 'cameo') {
      var cm = pickCameo();
      if (cm) { S.cameoN = (S.cameoN || 0) + 1; act = 'cameo:' + cm.id; line = NP.CAMEO_TEXT.mini.replace('{name}', cm.name).replace('{tag}', cm.tag) + ' "' + cm.hi[0] + '"'; }
      else { id = 'blow'; line = E.blow; }
    }
    if (id === 'haggle') line = haggleLine(walkable);
    showMini(line, act);
    track('mini_full_' + id);
  }
  // r6.5: somebody else haggling. Reads right for any seller, and at a jerk stop it is about the jerk you can see.
  function haggleLine(walkable) {
    var H = NP.FULL_MINI_HAGGLE;
    var j = S.stop && S.stop.jerk && jerkDef(S.stop.jerk);
    if (j && j.mini) return j.mini;
    return walkable ? H.walk : H.stop;
  }
  function showMini(text, act) {
    var old = document.querySelector('.minicard'); if (old) old.parentNode.removeChild(old);
    var el = document.createElement('div'); el.className = 'minicard'; el.setAttribute('role', 'status');
    var cid = act && act.indexOf('cameo:') === 0 ? act.slice(6) : null;
    el.innerHTML = (cid ? '<canvas class="cameo-cv" width="48" height="64" data-cameo="' + cid + '" aria-hidden="true"></canvas>' : '') + '<b>' + esc(cid ? NP.CAMEO_TEXT.tag : NP.DEMO5.miniTag) + '</b> ' + esc(text) + '<div class="mc-btns">' + (act === 'tv' ? '<button data-mini="tv">' + esc(NP.DEMO5.tvBtn) + '</button>' : '') + '<button data-mini="ok">OK</button></div>';
    document.body.appendChild(el);
    if (cid) { drawCameos(); setTimeout(function () { spotCameo(cid, !DEMO); }, 500); } // a full game mini event never pays points
    sfx('jingle');
    var t = setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, act ? 9000 : 6000);
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-mini]'); if (!b) return;
      clearTimeout(t); if (el.parentNode) el.parentNode.removeChild(el);
      if (b.getAttribute('data-mini') === 'tv') playTV('mini');
    });
  }

  // ---------- Round 5: number pops (slot machine digits, coin ticks; big wins bounce) ----------
  function popNum(text, kind) {
    if (!text) return;
    var host = document.getElementById('popstack');
    if (!host) { host = document.createElement('div'); host.id = 'popstack'; host.setAttribute('aria-hidden', 'true'); document.body.appendChild(host); }
    while (host.children.length >= 2) host.removeChild(host.firstChild);
    var el = document.createElement('div'), quiet = calm(), di = 0;
    el.className = 'pop' + (kind ? ' ' + kind : '') + (quiet ? ' calm' : '');
    el.innerHTML = String(text).split('').map(function (ch) {
      if (!/\d/.test(ch) || quiet) return '<span class="ch">' + esc(ch) + '</span>';
      var strip = '0123456789012345678901234567890'.split('').join('<br>');
      return '<span class="dg"><span style="--d:' + ch + ';--i:' + (di++) + '">' + strip + '</span></span>';
    }).join('');
    host.appendChild(el);
    var big = /big/.test(kind || '');
    for (var k = 0; k < (big ? 6 : 3); k++) setTimeout(function () { sfx('coin'); }, 60 + k * 85);
    if (big) setTimeout(function () { sfx('cash'); }, 560);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, big ? 1700 : 1300);
  }

  // ---------- Round 5: near misses (a rival grabs something great in front of you; near mint copies with one tiny flaw) ----------
  function placeNearMisses(day, seed) {
    var r = mulberry32(NP.hashStr('nearmiss|' + seed));
    // the grab: about one Saturday in five, at one menu stop
    var hosts = day.stops.filter(function (s) { return openStop(s) && ['yard', 'thrift', 'pawn', 'sports', 'pal', 'record', 'rental'].indexOf(s.type) >= 0; });
    if (hosts.length && r() < 0.2) day.nearMiss = pick(r, hosts).id;
    // near mint, one tiny flaw: at most two a day
    var n = 0;
    day.stops.forEach(function (st) {
      if (!openStop(st) || st.type === 'expo') return;
      (st.items || []).concat(st.dig || []).forEach(function (it) {
        if (n >= 2 || it.kind !== 'game' || it.flaw || it.ultra || it.ex || (it.cond !== 'cib' && it.cond !== 'sealed') || (it.flags && (it.flags.repro || it.flags.reseal))) return;
        if (r() < 0.05) { it.flaw = pick(r, NP.FLAWS); n++; }
      });
    });
  }
  function nearMissGrab(s) {
    if (DEMO || !S.day.nearMiss || S.day.nearMiss !== s.id || S.nearMissDone) return;
    S.nearMissDone = true;
    var r = mulberry32(NP.hashStr(S.seed + '|grab|' + s.id));
    var it, val;
    if (r() < 0.3) {
      var u = pick(r, NP.ULTRA);
      it = { uid: 'nm' + s.id, id: u.id, t: u.t, p: u.p, tier: 4, base: u.base, kind: 'game', ultra: true, art: u.art, cond: 'cib', flags: {}, state: 'gone', line: '', sticker: true };
      val = u.base * 2;
    } else {
      var pool = NP.CATALOG.filter(function (g) { return g.tier === 3 && !S.day.owned[g.id]; });
      var e = pick(r, pool.length ? pool : NP.CATALOG.filter(function (g) { return g.tier === 3; }));
      it = { uid: 'nm' + s.id, id: e.id, t: e.t, p: e.p, tier: 3, base: e.base, kind: 'game', cond: 'sealed', flags: {}, state: 'gone', line: '', sticker: false, set: e.set, g: e.g };
      val = e.base * COND_MULT.sealed;
    }
    var others = rivalsAt(s).filter(function (id) { return id !== 'gary'; });
    var who = others.length ? others[0] : 'dex';
    it.goneBy = who;
    var name = who === 'dex' ? NP.RIVAL.name : rivalName(who), paid = 4 + Math.floor(r() * 9);
    s.items.unshift(it);
    var N = NP.NEAR_MISS, line = N.lines[Math.floor(r() * N.lines.length)].replace('{r}', name).replace('{p}', money(paid)).replace('{v}', money(Math.round(val)));
    track('near_miss_grab');
    setTimeout(function () { reveal(it, { miss: true, rarity: it.ultra ? 'grail' : 'rare', stamp: N.stamp, line: line, dur: 1500 }); }, 120);
  }

  // ---------- Round 5: the $5 mystery box (the odds on the box are the real odds) ----------
  function placeMysteryBoxes(day, seed) {
    var r = mulberry32(NP.hashStr('mbox|' + seed));
    day.stops.forEach(function (st) {
      if (!openStop(st) || st.type !== 'yard' || r() > 0.4) return;
      var b = makeItem(r, { id: 'mbox', t: NP.MBOX.t, p: 'k16', base: 0 }, { kind: 'mbox', ask: NP.MBOX.ask, seller: st.seller });
      b.uid = 'mb' + st.id; b.minFrac = 1; b.sticker = false;
      st.items.splice(Math.min(2, st.items.length), 0, b);
    });
  }
  function mboxOddsText() {
    return 'Odds on the box: ' + NP.MBOX.odds.map(function (o) { return Math.round(o[1] * 100) + '% ' + o[2]; }).join(' · ') + '. Those are the real odds.';
  }
  function openMbox(box, price) {
    var r = mulberry32(NP.hashStr(S.seed + '|mboxopen|' + box.uid));
    var x = r(), acc = 0, tier = 'junk';
    for (var i = 0; i < NP.MBOX.odds.length; i++) { acc += NP.MBOX.odds[i][1]; if (x < acc) { tier = NP.MBOX.odds[i][0]; break; } }
    var it;
    if (tier === 'junk') {
      if (r() < 0.5) { var m = pick(r, NP.MERCH); it = makeItem(r, { id: m.id, t: m.t, p: 'k16', base: 0 }, { kind: 'merch', ask: 0 }); }
      else { var sp = pick(r, NP.SPORTS); it = makeItem(r, sp, { seller: box.seller, sports: true, ask: 1 }); it.cond = 'loose'; }
    } else {
      var e = pick(r, NP.CATALOG.filter(function (g) { return g.tier === (tier === 'good' ? 2 : 3); }));
      it = makeItem(r, e, { seller: box.seller });
      it.cond = tier === 'good' ? 'cib' : 'sealed';
    }
    it.flags = {}; it.tell = true; it.tested = false; it.inspected = true;
    it.uid = box.uid + 'x'; it.state = 'sold'; it.paid = price; it.fromBox = true;
    var b = JSON.parse(JSON.stringify(it)); b.paid = price; b.stopType = S.stop.type; b.boughtAt = S.stop.id;
    S.bag = S.bag.filter(function (x) { return x.uid !== box.uid; });
    S.bag.push(b);
    box.opened = tier; box.inside = it.t;
    track('mbox_' + tier);
    var lines = NP.MBOX[tier];
    reveal(it, { line: NP.MBOX.open + ' ' + lines[Math.floor(r() * lines.length)], rarity: tier === 'treasure' ? 'grail' : tier === 'good' ? 'uncommon' : 'common', label: tier === 'treasure' ? 'SEALED TREASURE' : tier === 'good' ? 'SOMETHING GOOD' : 'JUNK' });
    if (tier === 'treasure') { magnet('jackpot'); comboUp(2); }
    else if (tier === 'good') comboUp(1);
  }

  // ---------- Round 5: the daily tip (a real rare one, at a real stop today, near made-up cross streets) ----------
  function placeDailyTip(day, seed) {
    var r = mulberry32(NP.hashStr('dailytip|' + seed));
    var hosts = day.stops.filter(function (s) { return openStop(s) && ['yard', 'thrift', 'pawn', 'flea'].indexOf(s.type) >= 0; });
    if (!hosts.length) return;
    var st = pick(r, hosts);
    var it = (st.items || []).filter(function (x) { return x.kind === 'game' && x.tier >= 3 && x.state === 'avail' && !x.hidden && !(x.flags && x.flags.repro); })[0];
    if (!it) {
      var e = pick(r, NP.CATALOG.filter(function (g) { return g.tier === 3; }));
      it = makeItem(r, e, { seller: st.type === 'flea' ? 'friendly' : (st.seller || 'friendly'), cibP: 0.5, sealedP: 0.1 });
      it.flags.repro = false;
      st.items.push(it);
    }
    it.dailyTip = true;
    var streets = shuffle(r, NP.DAILY_STREETS);
    day.tip = { stopId: st.id, stopName: st.name, uid: it.uid, a: streets[0], b: streets[1] };
  }
  function dailyTipHTML() {
    var T = !DEMO && S && S.day.tip; if (!T) return '';
    var st = S.day.stops.filter(function (x) { return x.id === T.stopId; })[0], it = st && (st.items || []).filter(function (x) { return x.uid === T.uid; })[0];
    if (!st || st.visited || !it || it.state !== 'avail') return '';
    return '<div class="rc-tip"><b>' + esc(NP.DAILY_TIP.h) + '</b> ' + esc(NP.DAILY_TIP.line.replace('{stop}', T.stopName).replace('{a}', T.a).replace('{b}', T.b)) + '</div>';
  }

  // ---------- Round 5: the visit streak (stored on this device only: the last day you came by, and how many in a row) ----------
  function dayShift(ds, n) { var p = ds.split('-').map(Number); var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]) + n * 86400000); return iso(d); }
  function visitStreak() {
    if (DEMO) return null;
    var today = phoenixDate(), v = store.get('visit', null) || {};
    if (v.last !== today) {
      var reset = !!v.last && v.last !== dayShift(today, -1);
      v.days = v.last === dayShift(today, -1) ? (v.days || 0) + 1 : 1;
      v.last = today; v.reset = reset;
      store.set('visit', v);
      track('visit_day_' + Math.min(v.days, NP.LOGIN.max));
      if (v.days >= 7) magnet('visit7');
    }
    return v;
  }
  function visitCash(v) { return Math.min(NP.LOGIN.max, v.days || 1) * NP.LOGIN.per; }
  function visitLine() {
    var v = visitStreak(); if (!v) return '';
    var c = visitCash(v), claimed = store.get('visitClaim', '') === v.last;
    return (v.reset ? NP.LOGIN.reset + ' ' : '') + NP.LOGIN.line.replace('{n}', v.days).replace('{c}', c) + (claimed ? ' (Already added today.)' : '') + ' ' + NP.LOGIN.next.replace('{c}', Math.min(NP.LOGIN.max, (v.days || 1) + 1) * NP.LOGIN.per);
  }
  // the first Saturday you start on a new day gets the visit streak cash
  function claimVisit() {
    if (DEMO || !S) return;
    var v = visitStreak(); if (!v || store.get('visitClaim', '') === v.last) return;
    store.set('visitClaim', v.last);
    var c = visitCash(v);
    S.cash += c; if (!S.season) S.budget += c;
    S.visitBonus = { days: v.days, cash: c };
    track('visit_claimed');
  }

  // ---------- the want list (mini-goals, Round 3c.1) ----------
  function goalDef(id) {
    if (DEMO) return (NP.DEMO_WANT || []).filter(function (g) { return g.id === id; })[0] || null;
    return NP.GOALS_POOL.filter(function (g) { return g.id === id; })[0] || null;
  }
  // the demo's want list: one easy entry at the yard sale, one at the swap meet. They run until noon and cannot fail.
  function demoGoal() {
    if (!S || !S.stop) return;
    // a goal from the last stop that is not done yet just quietly makes way for this stop's (nothing is lost)
    if (S.goal) { var cur = goalDef(S.goal.id); if (cur && cur.at === S.stop.type) return; S.goal = null; }
    var def = (NP.DEMO_WANT || []).filter(function (d) { return d.at === S.stop.type && (S.goalHist || []).indexOf(d.id) < 0; })[0];
    if (!def) return;
    S.goal = { id: def.id, end: endT(), prog: 0, quickStops: {} };
    S.goalHist = (S.goalHist || []).concat([def.id]);
    track('wantlist_shown'); track('wantlist_shown_' + def.id);
    celebrate('goal', NP.WANT_TEXT.tag + ': ' + def.name + '. ' + def.label + '. Reward: ' + def.reward + '.');
  }
  function wantDiff(def) { return NP.WANT_DIFF[def.d] || NP.WANT_DIFF.mid; }
  function isCart(it) { var pl = NP.PLATFORMS[it.p]; return !!pl && pl.media !== 'disc'; }
  // does this item fit a want list entry? ctx is the purchase ({ price, offer, bundle }); without it, "could it?"
  function wantMatch(f, it, ctx, st) {
    if (!it || !f) return false;
    var k = f.kind;
    if (k === 'media') { if (!isMedia(it)) return false; }
    else if (k === 'box') { if (!(it.kind === 'lot' || it.kind === 'bulk' || it.kind === 'club' || (ctx && ctx.bundle))) return false; }
    else if (k) { if (it.kind !== k) return false; }
    else if (it.kind === 'merch' || it.kind === 'gear') return false;
    if (f.cond && it.cond !== f.cond) return false;
    if (f.p && [].concat(f.p).indexOf(it.p) < 0) return false;
    if (f.g && [].concat(f.g).indexOf(it.g) < 0) return false;
    if (f.tier && (it.tier || 0) < f.tier) return false;
    if (f.cart && !isCart(it)) return false;
    if (f.fmt && it.fmt !== f.fmt) return false;
    if (f.variant && String(it.variant || '').indexOf(f.variant) !== 0) return false;
    if (f.gag && it.gag !== f.gag) return false;
    if (f.rental && !(it.flags && it.flags.rental)) return false;
    if (f.set && it.set !== f.set) return false;
    if (f.notOwned && (S.day.owned[it.id] || S.bag.filter(function (b) { return b.id === it.id; }).length > (ctx ? 1 : 0))) return false;
    if (f.tested && !it.tested) return false;
    if (f.manual && (it.cond !== 'cib' || (it.flags && it.flags.noManual))) return false;
    if (f.noManual && !(it.flags && it.flags.noManual)) return false;
    if (f.stop && !(st && st.type === f.stop)) return false;
    if (f.dig && !(st && (st.dig || []).indexOf(it) >= 0)) return false;
    if (ctx) {
      if (f.max && ctx.price > f.max) return false;
      if (f.haggle && !(ctx.price <= it.ask * 0.8)) return false;
      if (f.haggled && !(ctx.price < it.ask)) return false;
      if (f.offer && ctx.offer !== f.offer) return false;
    } else {
      if (f.max && Math.round(it.ask * 0.5) > f.max) return false;
      if ((f.haggle || f.haggled || f.offer) && it.minFrac >= 1) return false;
      if (f.offer === 'lowball' && it.minFrac > 0.5) return false;
    }
    return true;
  }
  // what Inspect shows you: nothing wrong ("clean"), or the manual in the box
  function inspectOut(def, it) {
    var f = it.flags || {};
    if (def.out === 'manual') return it.cond === 'cib' && !f.noManual;
    return !(it.tell && (f.repro || f.damaged || f.reseal));
  }
  // the stops you can actually get to before an entry runs out: this one, plus the next ones on the route (a drive and a look is about 80 minutes)
  var reachK = 99;
  function stopsAhead() {
    var list = [];
    if (S.stop && openStop(S.stop)) list.push(S.stop);
    planRoute().slice(0, reachK).forEach(function (st) { if (list.indexOf(st) < 0) list.push(st); });
    return list.filter(function (st) { return st.type !== 'banned' && st.type !== 'gift'; });
  }
  function goalMins(def) {
    var D = wantDiff(def), left = endT() - S.time;
    var mins = def.late ? left - 5 : Math.min(def.mins || D.mins || left - 10, left - 10);
    if (def.before) mins = Math.min(mins, def.before - S.time);
    return Math.max(20, mins);
  }
  function itemsAhead(fn) {
    var n = 0;
    stopsAhead().forEach(function (st) { (st.items || []).concat(st.dig || []).forEach(function (it) { if (it.state === 'avail' && !it.hidden && fn(it, st)) n++; }); });
    return n;
  }
  function yardsToday() { return S.history.filter(function (id) { var st = S.day.stops.filter(function (x) { return x.id === id; })[0]; return st && st.type === 'yard'; }).length; }
  function overpricedStop(st) {
    return (st.items || []).some(function (it) { return it.state === 'avail' && (it.kind === 'game' || isMedia(it)) && it.ask >= 1.5 * Math.max(1, (it.base || 0) * (COND_MULT[it.cond] || 1)); });
  }
  // only offer an entry the day can actually deliver
  function goalFeasible(def) {
    reachK = Math.max(1, Math.floor(goalMins(def) / 75));
    try { return goalFeasible2(def); } finally { reachK = 99; }
  }
  function goalFeasible2(def) {
    if (def.at && !(S.stop && def.at.indexOf(S.stop.type) >= 0)) return false;
    if (!def.at && def.type === 'tables') return false;
    var left = endT() - S.time;
    if (def.late ? (left > 120 || left < 30) : left < 45) return false;
    if (def.before && S.time > def.before - 60) return false;
    var t = def.type;
    if (t === 'buy') {
      var rare = def.f.variant || def.f.kind === 'grail' || def.f.set || def.f.kind === 'lot' || def.f.kind === 'box' || def.f.rental || def.f.gag || def.f.stop;
      return itemsAhead(function (it, st) { return wantMatch(def.f, it, null, st); }) >= def.n + (rare ? 0 : 1);
    }
    if (t === 'groups') return def.groups.every(function (gf) { return itemsAhead(function (it, st) { return wantMatch(gf, it, null, st); }) >= (def.distinct ? 2 : 1); }) && (!def.distinct || stopsAhead().length >= 4);
    if (t === 'inspect') return itemsAhead(function (it, st) { return !it.inspected && !it.tested && wantMatch(def.f, it, null, st) && inspectOut(def, it); }) >= def.n + 1;
    if (t === 'twins') return stopsAhead().some(function (st) { var c = {}; return st.items.some(function (it) { if (it.state !== 'avail' || it.kind !== 'game' || it.tested) return false; c[it.id] = (c[it.id] || 0) + 1; return c[it.id] >= 2; }); });
    if (t === 'dig') return stopsAhead().filter(function (st) { return st.dig && st.dig.length && !st.dug && st.type !== 'flea'; }).length >= def.n + 1;
    if (t === 'yards') { var seen = yardsToday(), ahead = stopsAhead().filter(function (st) { return st.type === 'yard' && st !== S.stop; }).length; return seen < def.n && seen + ahead >= def.n; }
    if (t === 'walkaway') return stopsAhead().filter(overpricedStop).length >= def.n;
    if (t === 'trade') return S.bag.filter(function (b) { return b.kind === 'game' || isMedia(b); }).length >= def.n + 1 && stopsAhead().some(function (st) { return !!buyerFor(st); });
    if (t === 'club') return stopsAhead().some(function (st) { return st.club === 'open'; });
    if (t === 'check') return itemsAhead(function (it) { return it.kind === 'game' && !it.checked; }) >= def.n + 2;
    return true;
  }
  function maybeGoal() {
    if (DEMO || !S || S.goal) return;
    if (S.goalNext && S.time < S.goalNext) return;
    if (endT() - S.time < 30) return;
    var r = mulberry32(NP.hashStr(S.seed + '|goal|' + S.history.length + '|' + (S.goalsDone || []).length + '|' + (S.goalHist || []).length));
    var recent = (S.goalHist || []).slice(-6);
    var lastType = (goalDef((S.goalHist || []).slice(-1)[0]) || {}).type;
    var pool = shuffle(r, NP.GOALS_POOL).filter(function (d) { return recent.indexOf(d.id) < 0 && (d.type === 'buy' || d.type !== lastType); }).filter(goalFeasible);
    // walking into the swap meet, the Expo or a yard sale: the entries made for that place come first, most of the time
    var here = pool.filter(function (d) { return d.at; });
    var def = here.length && r() < (here[0].type === 'tables' ? 0.6 : 0.2) ? here[0] : pool.filter(function (d) { return !d.at; })[0] || pool[0];
    if (!def) return;
    var mins = goalMins(def);
    S.goal = { id: def.id, end: S.time + mins, prog: def.type === 'yards' ? yardsToday() : 0, quickStops: {} };
    S.goalHist = (S.goalHist || []).concat([def.id]);
    track('goal_start_' + def.id);
    celebrate('goal', NP.WANT_TEXT.tag + ': ' + def.name + '. ' + def.label + ' (' + mins + ' min). Reward: ' + def.reward + '.');
  }
  function goalTick(kind, it, ctx) {
    if (!S || !S.goal) return;
    var def = goalDef(S.goal.id); if (!def) { S.goal = null; return; }
    var g = S.goal, before = g.prog, t = def.type, st = S.stop;
    if (kind === 'buy' && t === 'buy' && wantMatch(def.f, it, ctx || { price: it.ask }, st)) g.prog++;
    if (kind === 'buy' && t === 'groups') {
      g.got = g.got || {}; g.from = g.from || {};
      var used = false;
      def.groups.forEach(function (gf, i) {
        if (used || g.got[i] || !wantMatch(gf, it, ctx || { price: it.ask }, st)) return;
        if (def.distinct && st && g.from[st.id]) return;
        g.got[i] = 1; if (st) g.from[st.id] = 1; used = true; g.prog++;
      });
    }
    if (kind === 'inspect' && t === 'inspect' && wantMatch(def.f, it, null, st) && inspectOut(def, it)) { g.seen = g.seen || {}; if (!g.seen[it.uid]) { g.seen[it.uid] = 1; g.prog++; } }
    if (kind === 'inspect' && t === 'twins' && it.kind === 'game' && st) {
      g.ins = g.ins || {}; var key = st.id + '|' + it.id; g.ins[key] = g.ins[key] || {}; g.ins[key][it.uid] = 1;
      g.prog = Math.max(g.prog, Object.keys(g.ins[key]).length);
    }
    if (kind === 'land' && t === 'nomiss') g.prog++;
    if (kind === 'miss' && t === 'nomiss') g.prog = 0;
    if (kind === 'land' && t === 'clean') g.landed = (g.landed || 0) + 1;
    if (kind === 'miss' && t === 'clean') { goalLost(); return; }
    if (kind === 'dig' && t === 'dig') g.prog++;
    if (kind === 'table' && t === 'tables') { g.tabs = g.tabs || {}; if (!g.tabs[ctx]) { g.tabs[ctx] = 1; g.prog++; } }
    if (kind === 'stop' && t === 'yards' && st && st.type === 'yard') g.prog++;
    if (kind === 'quick' && t === 'quick' && st && def.at.indexOf(st.type) >= 0) g.prog++;
    if (kind === 'leave' && t === 'walkaway' && ctx && overpricedStop(ctx)) g.prog++;
    if (kind === 'trade' && t === 'trade') g.prog++;
    if (kind === 'club' && t === 'club') g.prog++;
    if (kind === 'check' && t === 'check') g.prog++;
    if (g.prog > before) {
      if (g.prog >= def.n) completeGoal(def);
      else { celebrate('goal', NP.WANT_TEXT.tag + ': ' + g.prog + ' of ' + def.n + ' · ' + def.name); comboUp(1); }
    }
  }
  // the tackle box: one reward for every want list entry, kept forever (a count if you earn one again)
  function tackle() { var t = store.get('tackle', {}); return t && typeof t === 'object' ? t : {}; }
  function completeGoal(def) {
    var D = wantDiff(def);
    var pts = bonus('Want list', D.pts * comboMult());
    S.goalsDone = (S.goalsDone || []).concat([def.id]);
    S.goal = null; S.goalNext = S.time + 20;
    if (D.tip) S.cash += D.tip;
    comboUp(2);
    var W = NP.WANT_TEXT, bn = def.banner || W.bannerFor[def.id];
    if (!bn) { var pickB = W.banners.filter(function (b) { return b !== S.lastBanner && b !== 'GRAIL IN HAND!' && b !== 'SET COMPLETE!'; }); bn = pickB[NP.hashStr(S.seed + '|' + S.goalsDone.length) % pickB.length]; }
    S.lastBanner = bn;
    celebrate('goaldone', bn + '|' + def.name + '|+' + pts + ' points' + (D.tip ? ', +$' + D.tip : '') + '|Reward: ' + def.reward);
    var tb = tackle(), had = tb[def.id] || 0;
    tb[def.id] = had + 1; store.set('tackle', tb);
    if (!had && !DEMO) celebrate('unlock', W.newReward + ': ' + def.reward); // the demo's goal card already names the reward
    track('goal_done_' + def.id);
    if (DEMO) {
      track('wantlist_done'); track('wantlist_done_' + def.id);
      setTimeout(function () { if (S && S.stop && !S.goal) { demoGoal(); if (S.goal) { var gb = document.querySelector('.goalbar'); if (gb) gb.outerHTML = goalBar(); else render(); } } }, 3300);
      var have = NP.GOALS_POOL.filter(function (d) { return tb[d.id]; }).length;
      if (S.goalsDone.length === 1) celebrate('unlock', NP.DEMO_WANT_TEXT.more.replace('{n}', NP.GOALS_POOL.length - have).replace('{all}', NP.GOALS_POOL.length));
    }
    magnet('goal1'); if (S.goalsDone.length >= 5) magnet('goal5');
  }
  function soClose() {
    var L = NP.WANT_TEXT.soClose, i = (S.soCloseN = (S.soCloseN || 0) + 1);
    return L[(NP.hashStr(S.seed) + i) % L.length] + ' ' + NP.WANT_TEXT.next;
  }
  function goalLost() {
    track('goal_fail_' + S.goal.id);
    S.goal = null; S.goalNext = S.time + 15;
    // in the walkable places (the swap meet, the Expo) the toast sits over the floor, so a miss there is a small chip instead
    var walkHere = S.screen === 'walk' || (S.stop && (S.stop.type === 'expo' || S.stop.type === 'flea'));
    if (walkHere) celebrate('streak', soClose()); else S.toast = (S.toast ? S.toast + ' ' : '') + soClose();
  }
  function goalTime() {
    if (!S || !S.goal) return;
    if (S.time >= endT()) { S.goal = null; return; } // the day is over; no want list news on the way home
    var cd = goalDef(S.goal.id);
    if (cd && cd.type === 'clean' && S.time >= S.goal.end) {
      if (S.goal.landed) completeGoal(cd); else goalLost();
      return;
    }
    if (S.time > S.goal.end) { comboBreak(); goalLost(); }
  }
  // the strip under the top bar: the want list entry, your combo, fever
  function goalBar() {
    if (!S || S.screen === 'results' || S.screen === 'home') return '';
    var h = '', def = S.goal && goalDef(S.goal.id);
    if (def) {
      var left = Math.max(0, S.goal.end - S.time);
      var prog = def.type === 'clean' ? (S.goal.landed ? 'clean so far, ' + S.goal.landed + ' landed' : 'clean so far') : S.goal.prog + ' of ' + def.n;
      h += '<span class="gb-goal"><b>' + esc(NP.WANT_TEXT.tag) + '</b> ' + esc(def.name) + ': ' + esc(def.label) + ' <span class="gb-prog">' + prog + '</span> <span class="gb-time">' + left + ' min left</span></span>';
    }
    if ((S.combo || 0) >= 1) {
      var c = S.combo, nt = nextTier(c), dots = '';
      for (var di = 0; di < Math.min(c, 6); di++) dots += '&#9679;';
      h += '<span class="gb-combo' + (c >= 6 ? ' max' : '') + '">STREAK ' + c + ' <span class="gb-dots">' + dots + '</span> x' + fmtX(comboMult()) + (nt ? ' &middot; ' + (nt[0] - c) + ' to x' + fmtX(nt[1]) : ' &middot; MAX') + '</span>';
    }
    if (feverOn()) h += '<span class="gb-fever">FEVER ' + (S.fever - S.time) + ' min</span>';
    return h ? '<div class="goalbar' + (feverOn() ? ' fever' : '') + '" aria-live="polite">' + h + '</div>' : '';
  }
  // the want list variants: colored shells, imports, store demo carts, first prints (full game only)
  function placeVariants(day, seed) {
    var r = mulberry32(NP.hashStr('variant|' + seed)), V = NP.VARIANTS, keys = Object.keys(V);
    day.stops.forEach(function (st) {
      if (!openStop(st) || st.type === 'expo') return;
      (st.items || []).concat(st.dig || []).forEach(function (it) {
        if (it.kind !== 'game' || it.variant || it.ultra || it.ex || (it.flags && it.flags.repro)) return;
        var x = r(), acc = 0;
        for (var i = 0; i < keys.length; i++) {
          var v = V[keys[i]];
          if (v.loose && !(it.cond === 'loose' && isCart(it))) continue;
          if (v.boxed && it.cond === 'loose') continue;
          acc += v.p;
          if (x < acc) { it.variant = keys[i]; return; }
        }
      });
    });
  }
  function variantNote(it) { var v = it.variant && NP.VARIANTS[it.variant]; return v && (!v.hidden || it.inspected) ? v.note : ''; }
  function wantTable(o) { if (!o) return; goalTick('table', null, String(o.label || o.title || o.kind) + '|' + (o.fx || 0) + ',' + (o.fy || 0)); }

  // quick finds: something bought within 10 minutes of walking into a stop
  function quickFind() {
    if (DEMO || !S.stop || S.stopArrive == null || S.time - S.stopArrive > 10 || S.quickAt === S.stop.id) return;
    S.quickAt = S.stop.id;
    var pts = bonus('Quick finds', 5 * comboMult());
    comboUp(1);
    goalTick('quick');
    celebrate('good', 'Quick find! +' + pts + ' points');
  }

  // ---------- surprise events ----------
  function maybeEvent(s) {
    if (DEMO || s.event || s.gift || s.locked || s.type === 'banned' || s.type === 'flea' || s.type === 'expo' || (s.type === 'mall' && s.scene === 'uturn')) return;
    var r = mulberry32(NP.hashStr(S.seed + '|event|' + s.id));
    if (r() > 0.45) return;
    S.evUsed = S.evUsed || [];
    var looseCart = s.items.filter(function (it) { return it.state === 'avail' && it.kind === 'game' && it.cond === 'loose' && (NP.PLATFORMS[it.p] || {}).media !== 'disc'; });
    var pool = shuffle(r, NP.EVENTS).filter(function (e) {
      if (S.evUsed.indexOf(e.id) >= 0) return false;
      if (e.id === 'blow') return looseCart.length && !S.said.blow;
      if (e.id === 'flicker') return s.dig && s.dig.length && !s.dug;
      if (e.id === 'mistag') return s.items.some(function (it) { return it.state === 'avail' && it.kind === 'game' && it.tier >= 2; });
      if (e.id === 'channel') return (s.type === 'yard' || s.type === 'thrift') && s.items.filter(function (it) { return it.state === 'avail' && isMedia(it); }).length >= 2;
      return true;
    });
    var e = pool[0]; if (!e) return;
    S.evUsed.push(e.id);
    s.event = { id: e.id, done: false };
    if (e.id === 'blow') s.event.uid = looseCart[Math.floor(r() * looseCart.length)].uid;
    track('event_' + e.id);
  }
  function eventBox(s) {
    if (!s.event) return '';
    var E = NP.EVENTS.filter(function (x) { return x.id === s.event.id; })[0]; if (!E) return '';
    var h = '<div class="story event"><span class="truetag surp">' + esc(NP.EVENT_TAG) + '</span><div class="story-h">' + esc(E.label) + '</div>';
    if (!s.event.done) {
      var t = s.event.uid ? findItem(s.event.uid) : null;
      h += '<div class="story-t">' + esc(E.text) + (t ? ' (' + esc(t.t) + ')' : '') + '</div><div class="btns"><button class="offer full" data-act="event">' + esc(E.btn) + '</button></div>';
    } else h += '<div class="story-t">' + esc(E.done) + '</div>';
    return h + '</div>';
  }
  function doEvent() {
    var s = S.stop; if (!s || !s.event || s.event.done) return;
    var id = s.event.id, r = mulberry32(NP.hashStr(S.seed + '|eventdo|' + s.id));
    s.event.done = true;
    if (id === 'blow') {
      var it = findItem(s.event.uid);
      if (it && it.state === 'avail') { it.ask = Math.max(1, Math.round(it.ask * 0.75)); it.blow = NP.CATCH.blow + ' The title screen pops up.'; it.inspected = true; }
      S.said.blow = true; magnet('blow');
    } else if (id === 'flicker') {
      s.dug = true;
    } else if (id === 'surprise') {
      var ux = !S.day.ultra && r() < 0.12 ? makeUltra(r, s) : null;
      var nw = ux || makeItem(r, rollGame(r, [0, 0.35]), { seller: s.seller || 'friendly', cibP: 0.4 });
      if (!ux) { nw.uid = 'sp' + s.id; nw.flags.repro = false; nw.ask = Math.max(2, Math.round(nw.base * (COND_MULT[nw.cond] || 1) * 0.45)); }
      s.items.unshift(nw);
    } else if (id === 'happy') {
      s.items.concat(s.dig || []).forEach(function (x) { if (x.state === 'avail') x.ask = Math.max(1, Math.round(x.ask * 0.8)); });
    } else if (id === 'channel') {
      actCost(4);
      s.items.forEach(function (x) { if (x.state === 'avail' && isMedia(x)) x.ask = Math.max(1, x.ask - 2); });
    } else if (id === 'twenty' || id === 'radio') {
      S.cash += 10;
    } else if (id === 'mistag') {
      var cand = s.items.filter(function (x) { return x.state === 'avail' && x.kind === 'game' && x.tier >= 2; });
      var m = cand[Math.floor(r() * cand.length)];
      if (m) { m.ask = 1; m.minFrac = 1; m.mistag = true; }
    }
    actCost(id === 'flicker' ? 0 : 1);
    var pts = bonus('Surprises', 10 * comboMult());
    comboUp(1); magnet('surprise');
    celebrate('good', 'Surprise! +' + pts + ' points');
    track('event_done_' + id);
    if (!checkSundown()) render();
  }

  // ---------- ultra-rare drops ----------
  function makeUltra(r, s) {
    var u = pick(r, NP.ULTRA);
    var it = makeItem(r, { id: u.id, t: u.t, p: u.p, tier: 4, base: u.base, g: u.g }, { seller: s.seller || 'friendly', sealedP: 0.15, cibP: 0.5 });
    it.uid = 'ul' + s.id; it.ultra = true; it.art = u.art; it.flags = {}; it.tell = true; it.sticker = true;
    var full = u.base * (COND_MULT[it.cond] || 1);
    it.ask = Math.max(5, Math.round(full * (s.type === 'pawn' ? 0.8 : 0.2 + r() * 0.3)));
    it.minFrac = 0.8;
    S.day.ultra = true;
    return it;
  }
  function placeUltra(day, seed, m) {
    var r = mulberry32(NP.hashStr('ultra|' + seed));
    if (r() > (m === 'noon' ? 0.25 : 0.4)) return;
    var hosts = day.stops.filter(function (s) { return openStop(s) && ['yard', 'thrift', 'flea', 'pawn', 'pal', 'record', 'rental', 'sports'].indexOf(s.type) >= 0; });
    if (!hosts.length) return;
    var s = pick(r, hosts), it = makeUltra(r, s);
    day.ultra = true;
    if (s.dig && s.dig.length && r() < 0.5) s.dig.push(it); else s.items.push(it);
  }

  // =====================================================================================================
  // ---------- Round 3c part 3: music and movies at every stop (full game only) ----------
  // =====================================================================================================
  function mediaEntry(id) { return NP.MEDIA.filter(function (m) { return m.id === id; })[0] || null; }
  function isMedia(it) { return !!it && (it.kind === 'music' || it.kind === 'movie'); }
  function mediaLab(it) { var e = mediaEntry(it.id), k = e && e.lab; return k ? (NP.LABELS[k] || NP.STUDIOS[k] || '') : ''; }
  // one gag at most per record, tape, CD or movie
  function giveGag(r, it, p) {
    if (!isMedia(it) || it.gag || it.ex) return;
    if (r() > (p == null ? 0.3 : p)) return;
    var keys = Object.keys(NP.MEDIA_GAGS).filter(function (k) { return NP.MEDIA_GAGS[k].fmts.indexOf(it.fmt) >= 0; });
    if (it.flags && it.flags.rental) keys = keys.filter(function (k) { return k === 'rewind' || k === 'clam'; });
    if (!keys.length) return;
    var k = pick(r, keys), G = NP.MEDIA_GAGS[k];
    if (k === 'sleeve' || k === 'wrong') {
      var pool = NP.MEDIA.filter(function (m) { return m.kind === it.kind && m.fmt === it.fmt && m.id !== it.id; });
      if (!pool.length) return;
      it.wrongTo = pick(r, pool).id;
    }
    it.gag = k;
    if (G.price) it.ask = Math.max(1, Math.round(it.ask * G.price));
    if (G.fee) it.ask += G.fee;
  }
  function addMediaTo(r, st, kind, fmts, w, sec, seller) {
    var it = makeMedia(r, rollMedia(r, kind, fmts, w), { seller: seller || st.seller || 'friendly', sec: sec });
    it.lab = mediaLab(it);
    st.items.push(it);
    return it;
  }
  function placeMedia(day, seed) {
    var r = mulberry32(NP.hashStr('media|' + seed)), MS = NP.MEDIA_SECS, clubDone = false;
    day.stops.forEach(function (st) {
      if (!openStop(st)) return;
      mediaUsed = {};
      (st.items || []).forEach(function (it) { if (isMedia(it)) mediaUsed[it.id] = true; });
      if (st.type === 'yard') {
        if (r() > 0.65) return;
        var n = 2 + (r() < 0.4 ? 1 : 0);
        for (var i = 0; i < n; i++) {
          if (i === n - 1 && r() < 0.45) addMediaTo(r, st, 'movie', ['vhs'], [0.7, 0.25], 'media');
          else addMediaTo(r, st, 'music', ['tape', 'vinyl', 'cd'], [0.72, 0.22], 'media');
        }
        st.secs = [['', MS.games], ['media', pick(r, MS.yard)]];
      } else if (st.type === 'thrift') {
        for (var a = 0; a < 3; a++) addMediaTo(r, st, 'music', ['vinyl', 'cd', 'tape'], [0.62, 0.3], 'music');
        for (var b = 0; b < 2; b++) addMediaTo(r, st, 'movie', ['vhs', 'dvd'], [0.62, 0.3], 'movies');
        st.secs = [['', MS.games], ['music', MS.music], ['movies', MS.movies]];
        if (!clubDone && !(SEASON && S && S.season && SEASON.clubBills) && r() < 0.5) { st.club = 'open'; clubDone = true; }
      } else if (st.type === 'pawn') {
        for (var c = 0; c < 2; c++) addMediaTo(r, st, 'music', ['cd', 'vinyl'], [0.45, 0.4], 'music');
        for (var d = 0; d < 2; d++) addMediaTo(r, st, 'movie', ['dvd', 'vhs'], [0.5, 0.38], 'movies');
        st.secs = [['', MS.games], ['music', MS.pawnMusic], ['movies', MS.pawnMovies]];
      } else if (st.type === 'flea') {
        for (var e = 0; e < 3; e++) addMediaTo(r, st, 'music', ['vinyl', 'tape', 'cd'], [0.5, 0.38], 'crate', 'crate').crate = true;
        for (var f = 0; f < 2; f++) addMediaTo(r, st, 'movie', ['vhs', 'dvd'], [0.55, 0.35], 'crate', 'crate').crate = true;
        st.secs = [['', 'Tables'], ['crate', MS.crate]];
      } else if (st.type === 'pal') {
        addMediaTo(r, st, 'movie', ['vhs', 'dvd'], [0.5, 0.38], 'crate');
      } else if (st.type === 'record') {
        addMediaTo(r, st, 'music', ['vinyl'], [0.45, 0.4], 'vinyl');
        addMediaTo(r, st, 'movie', ['vhs', 'dvd'], [0.45, 0.4], 'movies');
      }
    });
    // the gags, on every record, tape, CD and movie in town (not the convention exclusives)
    day.stops.forEach(function (st) {
      (st.items || []).concat(st.dig || []).forEach(function (it) { if (isMedia(it)) { if (!it.lab) it.lab = mediaLab(it); giveGag(r, it, st.type === 'record' ? 0.2 : 0.3); } });
    });
  }
  function gagNotes(it) {
    var n = [], G = it.gag && NP.MEDIA_GAGS[it.gag];
    if (!G) return n;
    if (G.hidden) { if (it.revealed) n.push(it.gagNote || G.note); return n; }
    if (G.fix && it.fixed) n.push(G.fixed); else n.push(G.note);
    return n;
  }
  // a hidden gag shows up when you Inspect it, or at checkout if you did not
  function revealGag(it, how) {
    var G = it.gag && NP.MEDIA_GAGS[it.gag];
    if (!G || !G.hidden || it.revealed) return;
    it.revealed = true;
    if (it.wrongTo) {
      var e = mediaEntry(it.wrongTo);
      if (e) {
        var was = it.base || 0;
        it.caseT = it.t; it.id = e.id; it.t = e.t; it.by = e.by; it.base = e.base; it.tier = e.tier; it.lab = mediaLab(it);
        it.gagNote = G.note.replace('{t}', e.t) + ' (The ' + (it.fmt === 'vinyl' ? 'sleeve' : 'case') + ' says ' + it.caseT + '.)';
        magnet('wrongdisc'); track('wrong_disc');
        celebrate(e.base > was ? 'big' : 'good', 'Wrong ' + (it.fmt === 'vinyl' ? 'record' : 'disc') + '! It is actually ' + e.t + (e.base > was ? '. That is a better one.' : '.'));
      }
    } else it.gagNote = G.note;
    if (how === 'buy') { var b = S.bag[S.bag.length - 1]; if (b && b.uid === it.uid) ['revealed', 'caseT', 'id', 't', 'by', 'base', 'tier', 'lab', 'gagNote'].forEach(function (k) { if (k in it) b[k] = it[k]; }); }
  }
  function doMediaFix(uid) {
    var it = findItem(uid), G = it && it.gag && NP.MEDIA_GAGS[it.gag];
    if (!G || !G.fix || it.fixed || it.state !== 'avail') return;
    braydenCheck(uid);
    actCost(5);
    it.fixed = true;
    if (G.fee) it.ask = Math.max(1, it.ask - G.fee);
    if (it.gag === 'eaten') { magnet('pencil'); track('pencil_fix'); celebrate('good', 'Pencil fix! Good as new.'); }
    if (!checkSundown()) render();
  }
  function mediaMult(b) {
    var G = b.gag && NP.MEDIA_GAGS[b.gag];
    if (!G || !G.mult) return 1;
    if (G.fix && b.fixed) return 1;
    return G.mult;
  }
  // the CD club flyer
  function clubBox(s) {
    if (DEMO || !s.club) return '';
    var C = NP.CLUB, h = '<div class="story club"><div class="story-h">' + esc(C.name) + '</div>';
    if (s.club === 'open') h += '<div class="story-t">' + esc(C.flyer) + '</div><div class="btns"><button class="offer full" data-act="club" data-v="join">' + esc(C.btn) + '</button><button data-act="club" data-v="skip">' + esc(C.skip) + '</button></div>';
    else if (s.club === 'joined') h += '<div class="story-t">' + esc(C.joined) + '</div>';
    else return '';
    return h + '</div>';
  }
  function doClub(v) {
    var s = S.stop; if (!s || s.club !== 'open') return;
    if (v !== 'join') { s.club = 'skipped'; render(); return; }
    s.club = 'joined';
    var C = NP.CLUB, r = mulberry32(NP.hashStr(S.seed + '|club'));
    var box = makeItem(r, { id: C.box.id, t: C.box.t, p: 'k16', base: 20 }, { kind: 'club', ask: 0, seller: s.seller });
    box.paid = 0; box.state = 'sold'; box.stopType = s.type; box.boughtAt = s.id;
    S.bag.push(box);
    if (S.season && SEASON) SEASON.clubBills = C.bills;
    actCost(2);
    magnet('club'); track('cd_club'); goalTick('club');
    celebrate('good', '12 CDs for a penny!');
    if (!checkSundown()) render();
  }
  function mediaCounts(list) {
    var c = { games: 0, music: 0, movies: 0 };
    list.forEach(function (b) { if (b.kind === 'music') c.music++; else if (b.kind === 'movie') c.movies++; else if (b.kind === 'game' || b.kind === 'grail') c.games++; });
    return c;
  }
  function countsText(c) {
    return c.games + ' game' + (c.games === 1 ? '' : 's') + ', ' + c.music + ' music, ' + c.movies + ' movie' + (c.movies === 1 ? '' : 's');
  }

  // ---------- scenery: the look and the music change as the day goes on ----------
  var SCENES = {
    morning: { label: 'DRIVEWAYS AND CARD TABLES', music: 'morning' },
    swap: { label: 'THE SWAP MEET', music: 'swap' },
    store: { label: 'STRIP MALLS AND STORE CLOSINGS', music: 'store' },
    expo: { label: 'THE CONVENTION FLOOR', music: 'expo' },
    fever: { label: 'FEVER', music: 'fever' }
  };
  function sceneOf() {
    if (!S) return null; // Demo round 5: the demo gets the scenery and music too
    if (S.screen === 'results' || S.screen === 'home' || S.screen === 'title') return null;
    if (feverOn()) return 'fever';
    var st = S.stop;
    if (st && st.type === 'expo') return 'expo';
    if (st && st.type === 'flea') return 'swap';
    if (st && ['mall', 'banned', 'pal', 'record', 'rental', 'pawn'].indexOf(st.type) >= 0) return 'store';
    if (st) return 'morning';
    return S.time < 11 * 60 ? 'morning' : S.time < 14 * 60 ? 'swap' : 'store';
  }
  function skyOf() { if (!S) return ''; var t = S.time; return t < 9 * 60 ? 'dawn' : t < 15 * 60 ? 'day' : t < 17 * 60 ? 'dusk' : 'sunset'; }
  function applyScene() {
    var sc = sceneOf();
    var b = document.body;
    if (sc) { b.setAttribute('data-scene', sc); b.setAttribute('data-sky', skyOf()); }
    else { b.removeAttribute('data-scene'); b.removeAttribute('data-sky'); }
    return sc;
  }
  function sceneStrip() {
    var sc = sceneOf(); if (!sc || !S.stop) return '';
    var t = S.time, when = t < 12 * 60 ? 'MORNING' : t < 15 * 60 ? 'AFTERNOON' : t < 17 * 60 ? 'LATE AFTERNOON' : 'SUNDOWN';
    return '<div class="scenestrip">' + (sc === 'expo' || sc === 'fever' ? '' : when + ' · ') + esc(sc === 'morning' && S.stop.type === 'thrift' ? 'THRIFT STORE AISLES' : SCENES[sc].label) + (sc === 'fever' ? ' · EVERYTHING IS GOING YOUR WAY' : '') + '</div>';
  }

  // ---------- rendering ----------
  var app;
  // the background sound for this screen: the crowd at the swap meet and the Expo, the card table radio at a yard sale
  function ambFor() {
    if (!S || !S.stop) return null;
    if (S.screen === 'walk' && (S.stop.type === 'flea' || S.stop.type === 'expo')) return 'crowd';
    if (S.screen === 'stop' && (S.stop.type === 'yard' || S.stop.type === 'rummage')) return 'radio';
    return null;
  }
  function render() {
    if (S && !DEMO) { feverCheck(); goalTime(); }
    renderScreen(); animCash(); paintSharpies();
    placeNextStep();
    restoreChips();
    if (chipCur) chipIntoBar(); // a re-render made a new NEXT bar; put the chip back in it
  }
  function renderScreen() {
    var sc = applyScene();
    music(sc ? SCENES[sc].music : !S || S.screen === 'title' ? 'title' : S.screen === 'walk' ? 'swap' : 'title', true);
    tempo(sc ? paceMult() : 1);
    if (NP.Sound && NP.Sound.ambience) NP.Sound.ambience(ambFor());
    if (S && S.season && (S.screen === 'map' || S.screen === 'stop' || S.screen === 'walk' || S.screen === 'home')) saveSoon();
    if (DEMO && S) { if (S.screen === 'home' || S.screen === 'results') demoClear(); else demoSave(); }
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
    if (S.screen === 'walk' && S.stop) return 'You are at <b>' + esc(S.stop.name) + '</b>. ' + (S.stop.type === 'expo' ? 'The doors out are at the bottom. Closes at 5:30 PM.' : 'The exit is the gate at the bottom.');
    var r = planRoute(), n = r[0];
    if (S.screen === 'stop' && S.stop) {
      return n ? 'Next stop: <b>' + esc(n.name) + '</b> &middot; ' + costOf(n) + ' min drive' + (DEMO && n.type === 'flea' ? ' &middot; ' + esc(NP.DEMO_WANT_TEXT.nextTease) : '') : 'No time for another stop after this one. Head home after.';
    }
    return n ? 'Next stop: <b>' + esc(n.name) + '</b> &middot; ' + costOf(n) + ' min &middot; home by ' + endLabel() : 'No time for another stop. Head home and shelve it.';
  }

  function hud() {
    var h = '<div class="hud"><div class="hud-l"><span class="clock">' + fmtTime(Math.min(S.time, endT())) + '</span>' +
      (S.wx ? '<span class="wx wx-' + S.wx.id + '" title="' + esc(S.wx.name) + '">' + S.wx.icon + ' ' + S.wx.temp + '&deg;F</span>' : '') +
      '<span class="cash"><span class="cashn">' + money(S.cash) + '</span>' + (creditHere() ? ' <small class="credit">+' + money(creditHere()) + ' credit</small>' : '') + '</span><span class="bagc">Bag: ' + S.bag.length + '</span></div>' +
      '<div class="hud-r">' + soundButton() + setButton() + '</div></div>' +
      '<div class="sunbar" title="Daylight left"><div style="width:' + sunPct() + '%"></div><span>' + sunText() + '</span></div>' +
      '<div class="nextbar">' + nextLine() + '</div>' + goalBar();
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
    var dsv = readDemoSave();
    return '<div class="cart-label"><div class="cart-brand">NOSTALGIA PRO</div><div class="cart-sub">' + (DEMO ? 'THE DEMO' : 'THE GAME') + ' &middot; SELECT A MODE</div>' +
      (dsv ? '<button class="cart-item mode" data-act="democontinue">CONTINUE <small>your Saturday, ' + esc(fmtTime(dsv.run.time)) + '</small></button>' : '') +
      '<button class="cart-item mode" data-act="start" data-mode="noon">BACK BY NOON <small>' + (DEMO ? 'the demo' : 'short run') + '</small></button>' +
      (DEMO ? '<button class="cart-item mode" disabled aria-disabled="true">HOME BY SUNDOWN <small>full version</small></button>'
        : '<button class="cart-item mode" data-act="start" data-mode="sundown">HOME BY SUNDOWN <small>the whole day</small></button>') +
      (DEMO ? '<button class="cart-item" disabled aria-disabled="true">RANDOM SATURDAY <small>full version</small></button>'
        : '<button class="cart-item" data-act="start" data-free="1" data-mode="' + esc(store.get('mode', 'sundown')) + '">RANDOM SATURDAY <small>a new one every time, ' + (store.get('mode', 'sundown') === 'noon' ? 'back by noon' : 'home by sundown') + '</small></button>') +
      '<button class="cart-item" disabled aria-disabled="true">2 COLLECTORS <small>sold separately</small></button>' +
      (DEMO ? '<button class="cart-item" disabled aria-disabled="true">HOME SHELF <small>full version</small></button>'
        : '<button class="cart-item" data-act="shelf">HOME SHELF</button>') +
      '<button class="cart-item" data-act="howto">HOW TO PLAY</button>' +
      (NP.Creator ? '<button class="cart-item" data-act="look">' + (hasLook() ? 'CHANGE YOUR LOOK' : 'MAKE YOUR CHARACTER') + '</button>' : '') +
      (feedbackOk() ? '<a class="cart-item small" href="' + esc(CFG.FEEDBACK_URL) + '" target="_blank" rel="noopener" data-track="feedback_open">TELL US WHAT YOU THINK</a>' : '') +
      '</div><div class="cart-foot"><label class="adtoggle"><input type="checkbox" data-act="adfree"' + (adFree ? ' checked' : '') + '> Ad-Less Edition</label>' + soundButton() + fsButton() + setButton() +
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
      '<button class="cart-item" data-act="start" data-free="1" data-mode="sundown">RANDOM SATURDAY <small>a new one every time</small></button>' +
      '<button class="cart-item" disabled aria-disabled="true">2 COLLECTORS <small>sold separately</small></button>' +
      '<button class="cart-item" data-act="shelf">HOME SHELF</button>' +
      '<button class="cart-item" data-act="howto">HOW TO PLAY</button>' +
      fxButton() +
      (NP.Creator ? '<button class="cart-item" data-act="look">' + (hasLook() ? 'CHANGE YOUR LOOK' : 'MAKE YOUR CHARACTER') + '</button>' : '') +
      (feedbackOk() ? '<a class="cart-item small" href="' + esc(CFG.FEEDBACK_URL) + '" target="_blank" rel="noopener" data-track="feedback_open">TELL US WHAT YOU THINK</a>' : '') +
      '</div><div class="cart-foot"><label class="adtoggle"><input type="checkbox" data-act="adfree"' + (adFree ? ' checked' : '') + '> Ad-Less Edition</label>' + soundButton() + fsButton() + setButton() +
      '<span class="cart-fine">MADE IN A GARAGE &middot; NOT FOR RESALE</span></div>';
  }
  // Round 5: the settings toggle for screen shake, flashes and bouncing numbers
  function fxButton() {
    var on = !!store.get('calmFx', false);
    return '<button class="cart-item fxbtn" data-act="calmfx" aria-pressed="' + on + '">EFFECTS: ' + (on ? 'CALM' : 'FULL') + ' <small>' + (on ? 'no shake or flashes' : 'shake, flashes, bounce') + '</small></button>';
  }
  function applyFx() { try { document.body.classList.toggle('calmfx', !!store.get('calmFx', false)); } catch (e) {} }
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
          '<li>Back by noon is today\'s quick run. Random Saturday is a new Saturday every time.</li><li>Each stop costs daylight. The big Drive button always takes you to the next one.</li>') +
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
      (home.length && !DEMO ? '<div class="scores">Home shelf: ' + pl(home.length, 'find') + '</div>' : '') +
      (!DEMO && (store.get('finds', 0) || Object.keys(magnets()).length) ? '<div class="scores rankline">' + rankLine() + '</div>' : '') +
      (!DEMO ? '<div class="scores visitline">' + esc(visitLine()) + '</div>' : '') +
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
  var homeFilter = 'all';
  function hsGroup(rec) { return rec.kind === 'music' ? 'music' : rec.kind === 'movie' ? 'movies' : 'games'; }
  function renderHomeShelf() {
    var homeAll = store.get('home', []) || [];
    var home = DEMO || homeFilter === 'all' ? homeAll : homeAll.filter(function (rec) { return hsGroup(rec) === homeFilter; });
    var days = [], byDay = {};
    for (var i = home.length - 1; i >= 0; i--) {
      var r = home[i];
      if (!byDay[r.d]) { byDay[r.d] = []; days.push(r.d); }
      byDay[r.d].unshift(r);
    }
    var h = '<div class="screen shelfscr"><h2>&#127968; Your Home Shelf</h2>' +
      '<div class="shelfnote">' + pl(home.length, 'find') + ' from ' + days.length + ' Saturday' + (days.length === 1 ? '' : 's') + '. Only your first run each day goes on the shelf. Replays are just for fun.</div>';
    if (!DEMO && homeAll.length) {
      var cnt = { all: homeAll.length, games: 0, music: 0, movies: 0 };
      homeAll.forEach(function (rec) { cnt[hsGroup(rec)]++; });
      h += '<div class="hs-tabs" role="group" aria-label="Shelf sections">' + [['all', 'All'], ['games', 'Games'], ['music', 'Music'], ['movies', 'Movies']].map(function (t) {
        return '<button class="hs-tab' + (homeFilter === t[0] ? ' on' : '') + '" data-act="hsfilter" data-v="' + t[0] + '" aria-pressed="' + (homeFilter === t[0]) + '">' + t[1] + ' <b>' + cnt[t[0]] + '</b></button>';
      }).join('') + '</div>';
    }
    if (!home.length) h += '<div class="bubble big">' + (homeAll.length ? 'Nothing in this section yet. The record bins are out there.' : 'The shelf is empty. Somewhere out there, a yard sale is starting without you.') + '</div>';
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
    if (!DEMO) h += fridgeHTML();
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
      (DEMO ? '' : '<li><b>Effects.</b> Screen shake, flashes and bouncing numbers can be turned down. ' + fxButton() + '</li>') +
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
      mall: '&#128722;', banned: '&#128682;', pal: '&#129309;', record: '&#127926;', rental: '&#128252;', expo: '&#127918;', rummage: '&#128230;' }[t] || '';
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
      rental: 'STORE CLOSING. Everything must go. Even the late fees.',
      rummage: NP.RUMMAGE.blurb,
      expo: NP.EXPO.blurb
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
    h += dailyTipHTML();
    var fl = DEMO ? S.day.stops.filter(function (x) { return x.type === 'flea' && !x.visited; })[0] : null;
    if (fl) h += '<div class="rc-tease"><b>&#9733; ' + esc(fl.name) + '.</b> ' + esc(NP.DEMO_WANT_TEXT.tease) + '</div>';
    if (S.day.theme && S.history.length === 0) h += '<div class="rc-theme"><b>' + esc(S.day.theme.name) + '.</b> ' + esc(S.day.theme.line) + '</div>';
    if (S.day.rivals && S.day.rivals.length) h += '<div class="rc-spotted"><b>Spotted today:</b> ' + esc(spottedText()) + '</div>';
    if (S.season && S.week === NP.SEASON.weeks && S.history.length === 0) h += '<div class="rc-final">' + esc(NP.FINALE_NOTE) + '</div>';
    if (S.day.ultra && !S.history.length && !DEMO) h += '<div class="rc-ultra">' + esc(NP.ULTRA_RUMOR) + '</div>';
    var xs = S.day.stops.filter(function (x) { return x.type === 'expo' && !x.visited; })[0];
    if (xs) h += '<div class="rc-final">' + esc(NP.EXPO.name + ' tonight: doors at 3 PM, $' + NP.EXPO.fee + ' to get in. It is the last stop of the day, and anything you buy there counts double.') + '</div>';
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
    var h = hud() + '<div class="screen map"><h2>Where to next?</h2><div id="annc" class="annc" aria-live="polite"></div>';
    if (S.toast) { h += '<div class="toast">' + esc(S.toast) + '</div>'; S.toast = ''; }
    if (NP.TownMap) h += '<div id="townmap"></div><div class="tm-note" aria-live="polite">' + esc(DEMO ? NP.DEMO5.mapNote : NP.DEMO5.mapNoteFull) + '</div>' +
      (NP.TVAds ? '<button class="tvbreak" data-act="tv" data-where="map"><span class="tvb-ico" aria-hidden="true"></span>' + esc(NP.DEMO5.tvBreak) + '</button>' : '');
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
      var tooLate = arrive > endT() || closedNow(s, arrive);
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
      if (DEMO && s.type === 'flea' && !s.visited) h += '<div class="featured rare">&#9733; ' + esc(NP.DEMO_WANT_TEXT.rareTag) + '</div>';
      if (s.demoRaid && !s.visited) h += '<div class="rumor">' + NP.RIVAL.name + '\'s van is headed here too. He will show up right after you do.</div>';
      if (s.visited) h += '<div class="st-done">Visited</div>';
      else if (tooLate) h += '<div class="st-done">' + (closedNow(s, arrive) ? esc(NP.RUMMAGE.closedCard) : 'Not enough daylight') + '</div>';
      else h += '<button data-act="go" data-id="' + s.id + '" data-via="map"' + (s.gift ? ' class="giftbtn"' : '') + '>' + (s.gift ? 'Visit the Gift Shop!' : s.type === 'expo' && arrive < EXPO_DOORS ? 'Drive there (wait for the doors)' : 'Drive there') + '</button>';
      h += '</div>';
    });
    h += '</div><button class="big home" data-act="gohome">Head home and shelve it</button></div>';
    app.innerHTML = h;
    if (NP.TownMap) mountTown();
    if (NP.TownMap) setTimeout(function () { if (S && S.screen === 'map' && window.pageYOffset < 4) fitTownMap(); }, 0); // after the NEXT bar is in place
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
    if ((it.inspected || it.tested) && NP.itemInfo && !isMedia(it)) {
      var bx = NP.itemInfo(it).box;
      if (bx) n.push('Back of the ' + (it.cond === 'loose' ? 'label' : 'box') + ': "' + bx + '"');
    }
    if (it.featured) n.push(DEMO ? 'The featured lot. In the full version, there is a new one every day.' : 'Today\'s featured lot. Everyone playing today sees this exact box.');
    if (it.planted && !it.inspected) n.push('Complete in box for that price? That seems very generous.');
    if (it.kind === 'merch') n.push('Official Nostalgia Pro merch. Worth nothing. Costs something.');
    if (it.kind === 'mbox') n.push(it.opened ? 'You opened it. Inside: ' + it.inside + '.' : mboxOddsText());
    if (it.flaw && (it.inspected || it.state !== 'avail')) n.push(NP.FLAW.tag + '. ' + NP.FLAW.note.replace('{f}', it.flaw));
    if (it.dailyTip && it.state === 'avail') n.push('This is the one from the daily tip.');
    if (it.jerkRare && it.state === 'avail') n.push(NP.JERK.rareNote);
    // Round 3b
    if ((it.kind === 'music' || it.kind === 'movie') && NP.itemInfo) { var mb = NP.itemInfo(it).box; if (mb) n.push('Back of the ' + (it.kind === 'music' ? 'sleeve' : 'box') + ': "' + mb + '"'); }
    gagNotes(it).forEach(function (x) { n.push(x); });
    if (!DEMO && variantNote(it)) n.push(variantNote(it));
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
    if (it.tested && !it.ex) n.push('Tested. Works. Guaranteed.');
    if (it.ex) n.push('Convention exclusive. Buying it here counts double.');
    if (it.ultra) n.push('ULTRA RARE. The seller has no idea what this is.');
    if (it.mistag && it.state === 'avail') n.push('The price gun slipped. It says $1.');
    if (it.kind === 'grail' && it.id === 'npx') n.push('The Expo prototype. Counts double, like everything here.');
    if (it.special) n.push('"That\'s the \'97. The good one."');
    if (it.early && it.state === 'avail') n.push(NP.DEMO_WANT_TEXT.early);
    if (it.inspected && isMedia(it) && !(it.gag && NP.MEDIA_GAGS[it.gag].hidden)) n.push(it.gag === 'eaten' && !it.fixed ? 'It will not play like this. Somebody needs a pencil.' : it.kind === 'music' ? 'Plays fine. Sleeve and all.' : 'Plays fine. The tracking is close enough.');
    if (it.inspected && !isMedia(it)) {
      var f = it.flags, said = false;
      if (it.tell) {
        if (f.repro) { n.push('The label is suspiciously shiny. Font looks off.'); said = true; }
        if (f.damaged) { n.push('Disc scratched like an ice rink.'); said = true; }
        if (f.reseal) { n.push('The shrink wrap has a weird seam on the back.'); said = true; }
      }
      if (f.noManual) { n.push('No manual inside.'); said = true; }
      if (!said) n.push(it.cond === 'sealed' ? 'Wrap looks factory. Probably.' : 'Looks legit to you.');
      if (!DEMO && !said && it.cond === 'loose' && it.p === 'k16') n.push(NP.SAVE_NOTE);
    }
    if (it.checked) n.push(S.day.owned[it.id] || boughtAlready(it.id) ? 'ON THE SHELF ALREADY.' : 'Not on your shelf.');
    return n;
  }
  function boughtAlready(id) { return S.bag.some(function (b) { return b.id === id; }); }

  function condLabel(it) {
    if (it.kind === 'lot') return 'Blind lot';
    if (it.kind === 'mbox') return 'Mystery box';
    if (it.kind === 'merch') return 'Merch';
    if (it.kind === 'grail') return 'Complete in box';
    if (it.kind === 'music' || it.kind === 'movie') return NP.FORMATS[it.fmt] || 'Used';
    if (it.kind === 'gear') return 'Gear';
    if (it.kind === 'standee') return 'Cardboard';
    if (it.kind === 'bulk') return 'Box of 40';
    if (it.kind === 'photo') return 'Signed 8x10';
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
    // the demo keeps it to the first sentence (no reading walls); the rest is one tap away
    var dd = inf.d || '', cut = DEMO ? dd.search(/[.!?]\s/) : -1;
    if (cut > 0 && cut < dd.length - 2) return '<div class="it-d"><span class="tag t-' + inf.tag + '">' + esc(inf.label) + '</span> ' + esc(dd.slice(0, cut + 1)) + ' <details class="more"><summary>More</summary>' + esc(dd.slice(cut + 2)) + '</details></div>';
    return '<div class="it-d"><span class="tag t-' + inf.tag + '">' + esc(inf.label) + '</span> ' + esc(dd) + '</div>';
  }
  function tagPill(it, repro) {
    if (!NP.itemInfo) return '';
    var inf = NP.itemInfo(it, { repro: repro });
    return '<span class="tag t-' + inf.tag + '">' + esc(inf.label) + '</span>';
  }

  function itemCard(it, s) {
    var plat = NP.PLATFORMS[it.p];
    var sellerName = it.jerk ? jerkName(it.seller, it.jerk) : NP.SELLERS[it.seller] ? NP.SELLERS[it.seller].name : '';
    var h = '<div class="item ' + it.state + (it.ultra ? ' ultra' : '') + '" id="card-' + it.uid + '"><div class="artbox" data-art="' + it.uid + '"></div><div class="info">' +
      '<div class="it-t">' + esc(it.t) + '</div>' + tagHTML(it, reproKnown(it)) +
      '<div class="it-p">' + (it.kind === 'game' || it.kind === 'grail' ? esc(plat.name) + ' &middot; ' : (it.kind === 'music' || it.kind === 'movie') ? esc(it.by) + ' &middot; ' + (it.lab ? esc(it.lab) + ' &middot; ' : '') : '') + '<span class="pill ' + it.cond + '">' + condLabel(it) + '</span></div>' +
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
      } else if (it.counter && it.counter < it.ask) {
        h += '<button class="offer full counter" data-act="offer" data-kind="counter" data-uid="' + it.uid + '"' + (it.counter > S.cash + creditHere() ? ' disabled' : '') + '>' + esc(NP.DEMO5.counterBtn.replace('{$}', money(it.counter))) + '</button>';
        offers(it).forEach(function (o) { if (o[0] === 'full') h += '<button class="offer full" data-act="offer" data-kind="full" data-uid="' + it.uid + '"' + (o[2] > S.cash + creditHere() ? ' disabled' : '') + '>' + o[1] + ' ' + money(o[2]) + '</button>'; });
      } else if (it.kind === 'mbox') {
        h += '<button class="offer full" data-act="offer" data-kind="full" data-uid="' + it.uid + '"' + (it.ask > S.cash + creditHere() ? ' disabled' : '') + '>' + esc(NP.MBOX.btn) + '</button>';
      } else offers(it).forEach(function (o) {
        if (o[0] === 'lowball' && rivalHere('gary')) { h += '<button class="offer lowball" disabled aria-disabled="true">Gary already tried that</button>'; return; }
        h += '<button class="offer ' + o[0] + '" data-act="offer" data-kind="' + o[0] + '" data-uid="' + it.uid + '"' + (o[2] > S.cash + creditHere() ? ' disabled' : '') + '>' + o[1] + ' ' + money(o[2]) + '</button>';
      });
      h += '</div><div class="btns small">';
      if ((it.kind === 'game' || (!DEMO && isMedia(it) && !it.ex)) && !it.inspected && !it.tested) h += '<button data-act="inspect" data-uid="' + it.uid + '">Inspect (5 min)</button>';
      if (!DEMO && it.gag && NP.MEDIA_GAGS[it.gag].fix && !it.fixed) h += '<button data-act="mfix" data-uid="' + it.uid + '">' + esc(NP.MEDIA_GAGS[it.gag].fix) + '</button>';
      if ((it.kind === 'game' || (S.season && isMedia(it))) && !it.checked && !it.ex) h += '<button data-act="check" data-uid="' + it.uid + '">Is it on the shelf? (10 min)</button>';
      if (s.story === 'pricecheck') h += '<button data-act="pricecheck" data-uid="' + it.uid + '">' + esc(NP.STORIES.pricecheck.button) + '</button>';
      if (it.comeback) h += '<button data-act="comeback" data-uid="' + it.uid + '">' + esc(NP.STORIES.comeback.button) + '</button>';
      h += '</div>';
    } else if (it.state === 'sold') h += '<div class="stamp">IN THE BAG ' + money(it.paid) + '</div>';
    else if (it.state === 'pulled') h += '<div class="stamp bad">OFF THE TABLE</div>';
    else if (it.state === 'kids') h += '<div class="stamp bad">' + esc(NP.STORIES.kids.stamp) + '</div>';
    else if (it.state === 'gone') h += '<div class="stamp bad">' + (it.goneBy === 'brayden' ? 'BRAYDEN GOT IT (MOM\'S CARD)' : it.goneBy === 'wagon' ? esc(NP.STORIES.reseller.stamp) : it.goneBy === 'nerd' ? 'A NERD GOT IT' : it.goneBy === 'steve' ? 'SLAB STEVE GOT IT' : it.goneBy === 'vest' ? esc(NP.STORIES.comeback.stamp) : esc(NP.RIVAL.name.toUpperCase()) + ' GOT IT') + '</div>';
    h += '</div></div>';
    return h;
  }

  var ybTarget = null, ybLoop = null, ybCanvas = null;
  function ybTick() {
    ybLoop = null;
    var T = ybTarget;
    if (!T || !document.body.contains(T.cv) || calm()) { ybTarget = null; return; }
    NP.drawYardBanner(T.cv, T.seed, T.sky, (performance.now() - T.t0) / 1000);
    ybLoop = setTimeout(function () { requestAnimationFrame(ybTick); }, 66);
  }
  function renderStop() {
    var s = S.stop;
    var seller = NP.SELLERS[s.seller];
    if (s.reseller && !s.resold && (s.acts || 0) >= 2) doResell(s);
    var h = hud() + '<div class="screen stop st-' + s.type + '">' + sceneStrip() + (s.type === 'yard' && NP.drawYardBanner ? '<div class="yardban-slot"></div>' : '') + '<h2>' + stopIcon(s.type) + ' ' + esc(s.name) + '</h2>' + signHTML(s) + '<div id="annc" class="annc" aria-live="polite"></div>';
    if (s.cleared) h += '<div class="rival">' + NP.RIVAL.name + ' from ' + NP.RIVAL.shop + ' beat you here. He took the good stuff and set up a table out front.</div>';
    var refuse = s.cola && NP.SPONSOR && NP.SPONSOR.refuse ? NP.SPONSOR.refuse[s.seller] : null;
    if (seller && refuse) {
      // loudly refuses to sell out, while selling out
      h += '<div class="bubble big">' + esc(seller.name) + ': "' + esc(refuse[0]) + '"</div>' +
        '<div class="glam"><canvas class="glamcan" width="22" height="30" aria-label="A can of ' + esc(NP.SPONSOR.name) + '"></canvas><div class="glam-t">' + esc(refuse[1]) + '</div></div>';
    } else if (seller && s.hello && s.jerk) h += jerkTellHTML(s.jerk, jerkName(s.seller, s.jerk), S.seed + s.id) + '<div class="bubble big jerky">' + esc(jerkName(s.seller, s.jerk)) + ': ' + esc(jerkQuote(s.hello)) + '</div>';
    else if (seller && s.hello) h += '<div class="bubble big">' + esc(seller.name) + ': "' + esc(s.hello) + '"</div>';
    if (s.type === 'flea') h += '<div class="bubble big">Different vendor at every table. Some of them know what they got.</div>';
    if (s.type === 'yard' && NP.YARD_RADIO) h += '<div class="radiobar"><span class="rad-ico" aria-hidden="true"></span><span>' + esc(NP.YARD_RADIO[NP.hashStr(S.seed + s.id + 'radio') % NP.YARD_RADIO.length]) + '</span></div>';
    h += cameoBox(s);
    h += rivalNotes(s);
    // Round 3b: what is going on at this store today
    h += eventBox(s) + storyBox(s) + caseBox(s) + palBox(s) + recordBox(s) + rentalBox(s) + bundleBox(s) + clubBox(s);
    if (s.reseller && s.resold) h += '<div class="story">' + trueTag(NP.STORIES.reseller) + '<div class="story-h">' + esc(NP.STORIES.reseller.title) + '</div><div class="story-t">' + esc(NP.STORIES.reseller.line) + '</div></div>';
    if (adLevel() >= 2) h += '<div class="poster">' + (adFree ? 'POSTER: The Ad-Less Edition. No posters. (Except this one.)' : 'POSTER: Nostalgia Pro: The Shelf Dust. Now in Sealed. Gift Shop open till ' + endLabel() + '.') + '</div>';
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
    if (DEMO && s.type === 'yard' && NP.TVAds) h += '<div class="tvset"><span class="tvb-ico" aria-hidden="true"></span><span>' + esc(NP.DEMO5.yardTV) + '</span><button data-act="tv" data-where="yard">' + esc(NP.DEMO5.tvBtn) + '</button></div>';
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
    if (s.jerk && !DEMO) { startTells(); jerkTip('.jtell-row'); }
    drawCameos();
    setTimeout(function () { if (S && S.screen === 'stop') watchCameo(S.stop); }, 0); // after the NEXT bar is placed
    var slot = document.querySelector('.yardban-slot'), yb = null;
    if (slot) {
      // one banner canvas for the whole game, moved into each yard sale as it renders (a page never piles up drawing surfaces)
      if (!ybCanvas) { ybCanvas = document.createElement('canvas'); ybCanvas.width = 240; ybCanvas.height = 64; ybCanvas.className = 'yardban'; ybCanvas.setAttribute('aria-hidden', 'true'); }
      yb = ybCanvas; slot.appendChild(yb);
    }
    if (yb) {
      ybTarget = { cv: yb, seed: s.id + S.seed, sky: skyOf(), t0: performance.now() };
      NP.drawYardBanner(yb, ybTarget.seed, ybTarget.sky, 0);
      // the balloons bob a little: one loop for the whole game that follows whichever banner is on screen
      // (it stops when the banner is gone, and with calm effects)
      if (!calm() && !ybLoop) ybTick();
    }
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
      '<div class="giftnote">Prices go up as the day goes on. Each purchase costs you 10 points. ' + (adFree ? 'Ad-Less Edition owners pay the same, plus a small Ad-Less fee of $0.' : '') + '</div>';
    h += '<div class="items">';
    var realCard = '';
    if (!booth && realMerchOk()) {
      var RM = NP.REAL_MERCH;
      realCard = '<div class="item gift realmerch"><div class="artbox"><canvas class="ms-tee big" width="40" height="36" aria-hidden="true"></canvas></div><div class="info"><div class="it-t">' + esc(RM.giftTitle) + '</div>' +
        '<div class="it-d"><span class="tag t-real">' + esc(RM.giftTag) + '</span> ' + esc(RM.giftLine) + '</div>' +
        '<div class="btns"><a class="offer full ms-go" href="' + esc(CFG.MERCH_URL) + '" target="_blank" rel="noopener" data-merch="gift">' + esc(RM.giftBtn) + ' &#8599;</a></div></div></div>';
    }
    NP.MERCH.forEach(function (m, mi) {
      if (mi === 2 && realCard) { h += realCard; realCard = ''; } // the real one sits in among the fake ones
      var p = giftPrice(m);
      var got = S.bag.some(function (b) { return b.id === m.id && b.fromGift; });
      h += '<div class="item gift' + (got ? ' sold' : '') + '"><div class="artbox" data-art="g' + m.id + '"></div><div class="info"><div class="it-t">' + esc(m.t) + '</div>' + tagHTML({ kind: 'merch', id: m.id }) +
        '<div class="it-a">Price <b>' + money(p) + '</b></div>' +
        (got ? '<div class="stamp">IN THE BAG</div>' : '<div class="btns"><button class="offer full" data-act="buygift" data-id="' + m.id + '"' + (p > S.cash ? ' disabled' : '') + '>Buy it ' + money(p) + '</button></div>') + '</div></div>';
    });
    return h + realCard + '</div>';
  }
  function drawGiftArts() {
    document.querySelectorAll('.realmerch .ms-tee').forEach(drawTee);
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
    progressClock();
  }
  // anonymous progress counts: each stop entered and left, and each hour of the game clock reached (progress_0800 ...)
  function progress(kind, s) {
    if (!S || !s) return;
    track('progress_' + kind + '_' + s.type);
    progressClock();
  }
  function progressClock() {
    if (!S) return;
    S.progH = S.progH || {};
    for (var h = Math.floor(START / 60) + 1; h <= Math.min(Math.floor(S.time / 60), Math.floor(endT() / 60)); h++) {
      if (S.progH[h]) continue;
      S.progH[h] = 1;
      track('progress_' + (h < 10 ? '0' : '') + h + '00');
    }
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
    if (DEMO) dropUndo();
    S.time += costOf(s); // the drive, same minutes the map card showed
    s.visited = true;
    S.history.push(s.id);
    S.stop = s;
    S.screen = 'stop';
    step('f07_arrive_' + S.history.length + '_' + s.type);
    if (s.seller && NP.SELLERS[s.seller]) s.hello = helloFor(s.seller) || NP.SELLERS[s.seller].hi[s.id.charCodeAt(1) % NP.SELLERS[s.seller].hi.length];
    if (s.jerk && jerkDef(s.jerk)) { var jh = jerkDef(s.jerk).hi; s.hello = jh[NP.hashStr(S.seed + s.id) % jh.length]; track('jerk_met'); track('jerk_met_' + s.jerk); }
    if (s.rivalAt && S.time >= s.rivalAt) {
      // rival cleared the best stuff
      s.cleared = true; S.ev.rivalHits++;
      var sorted = s.items.concat(s.dig).filter(function (i) { return i.kind === 'game' || i.kind === 'lot'; }).sort(function (a, b) { return b.ask - a.ask; });
      sorted.slice(0, 3).forEach(function (i) { i.state = 'gone'; });
      dexSetup(s);
    }
    // demo: Dex always shows up a few minutes after you do (walk.js also brings him in after 45 real seconds)
    if (DEMO && s.demoRaid) s.rivalAt = S.time + 12;
    maybeCameo(s);
    track('stop_' + s.type + '_enter');
    if (s.type === 'flea') track('swapmeet_enter');
    // Round 3b
    if (s.type === 'mall' && s.scene === 'uturn') { spend(5); S.ev.uturn = true; track('mall_uturn'); }
    // Round 3c replay pack: the clock for quick finds, goal progress, a surprise now and then, a new goal now and then
    S.stopArrive = S.time;
    if (!DEMO) { goalTick('stop'); maybeEvent(s); maybeGoal(); nearMissGrab(s); }
    else demoGoal();
    progress('enter', s);
    if (s.type === 'pal') palArrive(s);
    if (s.type === 'record' && s.seller === 'chill') { K().punch++; saveK(); }
    if (s.story) track('story_' + s.story);
    if (s.moment) track('moment_' + s.moment);
    // the swap meet is walkable
    if (s.type === 'expo') expoArrive(s);
    if ((s.type === 'flea' || s.type === 'expo') && NP.Walk && NP.Char) {
      S.screen = 'walk';
      NP.Walk.enter(s);
      if (s.type === 'expo') { S.toast = s.entryLine || ''; return; }
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
    if (it.jerk && jerkDef(it.jerk) && (key === 'yes' || key === 'no')) return jerkSay(it, key);
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
    if (S.stop && S.stop.type === 'expo') it.expoBuy = true; // convention buys count double
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
    if (it.kind === 'standee') { S.ev.standee = true; track('standee_bought'); magnet('standee'); }
    if (it.ex && S.stop.type === 'expo') { magnet('nerds'); track('expo_exclusive_bought'); }
    if (punchHere()) { K().punch++; saveK(); }
    if (!S.said.partner && (it.kind === 'standee' || (S.day.partner && price >= 30))) { S.said.partner = true; S.callNow = true; }
  }

  // ---------- Round 6.4: jerk sellers ----------
  // A jerk is a mood laid over a normal seller, for one stop or one swap meet table. Full game only,
  // except the demo's one guy on the phone at the swap meet, who answers if you ask twice.
  // Everything here uses its own seeded numbers, so the rest of the day is exactly what it was.
  var JERK_OK = { friendly: 1, firm: 1, ikwig: 1, pawn: 1, mall: 1, snob: 1, chill: 1, rental: 1 };
  var JERK_KINDS = ['scoff', 'budge', 'raise', 'brag', 'phone', 'walk'];
  function jerkSkip(it) { return !it || it.ultra || it.dailyTip || it.kind === 'grail' || it.kind === 'mbox' || it.kind === 'lot' || it.featured || it.planted || it.special || it.early || it.held || it.uid.indexOf('dx') === 0; }
  // the swap meet tables, grouped the same way walk.js lays them out (up to 3 things a table, 5 tables)
  function fleaGroups(items) {
    var groups = [], open = {};
    items.filter(function (it) { return it.kind !== 'lot' && !it.crate; }).forEach(function (it) {
      var g = open[it.seller];
      if (g && it.jerkRare) { g.items.push(it); return; } // the jerk's good thing stays on the jerk's table
      if (!g || g.items.length >= 3) {
        if (groups.length >= 5) { groups[groups.length - 1].items.push(it); return; }
        g = { seller: it.seller, items: [] }; open[it.seller] = g; groups.push(g);
      }
      g.items.push(it);
    });
    return groups;
  }
  function jerkify(it, kind) {
    if (jerkSkip(it)) return;
    it.jerk = kind;
    if (kind === 'brag') it.ask = Math.max(2, Math.round(it.ask * 1.25));
    it.minFrac = kind === 'budge' ? 1 : Math.min(1, (it.minFrac || 0.7) + 0.12);
  }
  function jerkRare(r, st, seller, kind) {
    var e = pick(r, NP.CATALOG.filter(function (g) { return g.tier === 3; }));
    var it = makeItem(r, e, { seller: seller, cibP: 0.6, sealedP: 0.15 });
    it.flags = {}; it.tell = true; it.jerkRare = true;
    jerkify(it, kind);
    return it;
  }
  function addJerks(day, seed) {
    var J = NP.JERK; if (!J) return;
    var r = mulberry32(NP.hashStr('jerk|' + seed));
    day.stops.forEach(function (s) {
      if (!openStop(s) || s.gift || s.locked || s.cola || s.type === 'expo' || s.type === 'banned') return;
      if (s.type === 'flea') {
        fleaGroups(s.items).forEach(function (g) {
          if (!JERK_OK[g.seller] || r() >= J.share) return;
          var kind = pick(r, JERK_KINDS);
          g.items.forEach(function (it) { jerkify(it, kind); });
          if (r() < J.rareShare) { var last = g.items[g.items.length - 1]; s.items.splice(s.items.indexOf(last) + 1, 0, jerkRare(r, s, g.seller, kind)); }
        });
        return;
      }
      if (!s.seller || !JERK_OK[s.seller] || r() >= J.share) return;
      var k = pick(r, JERK_KINDS.filter(function (x) { return !(x === 'budge' && s.seller === 'firm'); }));
      s.jerk = k;
      s.items.concat(s.dig || []).forEach(function (it) { if (it.seller === s.seller) jerkify(it, k); });
      if (r() < J.rareShare) s.items.push(jerkRare(r, s, s.seller, k));
    });
  }
  // the demo: one swap meet table, on the phone. Nothing else about it changes.
  function demoPhoneJerk(flea, F) {
    var g = fleaGroups(flea.items).filter(function (g) { return !g.items.some(function (it) { return jerkSkip(it) || it === F; }); });
    g = g.filter(function (x) { return x.seller === 'firm'; })[0] || g[g.length - 1];
    if (g) g.items.forEach(function (it) { it.jerk = 'phone'; });
  }
  function jerkDef(k) { return NP.JERK && NP.JERK.kinds[k]; }
  function jerkName(key, kind) { var d = jerkDef(kind); return d ? d.name : (NP.SELLERS[key] ? NP.SELLERS[key].name : ''); }
  function jerkSay(it, list) { var a = jerkDef(it.jerk)[list] || jerkDef(it.jerk).no; return a[NP.hashStr(it.uid + list + (it.jsaid = (it.jsaid || 0) + 1)) % a.length]; }
  // deterministic coin for "does the jerk end the deal": the same offer on the same item always goes the same way
  function jerkCoin(it, tag, p) { return (NP.hashStr(it.uid + '|' + tag + '|' + (it.jn = (it.jn || 0) + 1)) % 1000) / 1000 < p; }
  // Markup Marv: show interest in something and it costs more. Once per thing.
  function jerkBump(it) {
    if (!it || it.jerk !== 'raise' || it.raised || it.state !== 'avail') return false;
    it.raised = true;
    it.ask = Math.max(it.ask + 1, Math.round(it.ask * 1.2));
    it.counter = null;
    it.line = jerkSay(it, 'bump').replace('{$}', money(it.ask));
    track('jerk_raise');
    return true;
  }
  var jerkSeen = false;
  function jerkTip(anchorSel) {
    if (jerkSeen) return; jerkSeen = true;
    setTimeout(function () { var el = anchorSel && document.querySelector(anchorSel); if (S && (S.screen === 'stop' || S.screen === 'walk')) showTip('jerk', el ? { el: el, below: true } : null); }, 400);
  }
  // the tell, drawn: the seller's portrait with crossed arms, rolling eyes, a sigh or a phone (character.js draws it)
  function jerkTellHTML(kind, name, seed) {
    var d = jerkDef(kind); if (!d) return '';
    return '<div class="jtell-row"><canvas class="jtell" width="56" height="40" data-tell="' + d.tell + '" data-seed="' + esc(seed) + '" aria-hidden="true"></canvas>' +
      '<div class="jtell-t"><b>' + esc(name) + '</b><span>' + esc((DEMO && kind === 'phone' ? NP.JERK.demoPhone : NP.JERK.tells[d.tell])) + '</span></div></div>';
  }
  var jtLoop = null;
  function drawTells() {
    var cvs = document.querySelectorAll('canvas.jtell');
    if (!cvs.length || !NP.Char || !NP.Char.drawTell) { jtLoop = null; return; }
    var t = performance.now() / 1000;
    cvs.forEach(function (c) {
      var g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, c.width, c.height);
      var look = NP.Char.normalize(NP.Char.random(mulberry32(NP.hashStr('jlook|' + c.getAttribute('data-seed'))), { noBrand: true, natural: true }));
      NP.Char.drawTell(g, look, c.getAttribute('data-tell'), 4, 0, 1.6, calm() ? 0 : t, { bust: true });
    });
    if (calm()) { jtLoop = null; return; }
    var me = jtLoop = setTimeout(function () { requestAnimationFrame(function () { if (jtLoop === me) drawTells(); }); }, 120); // one loop, ever
  }
  function startTells() { if (jtLoop) { clearTimeout(jtLoop); jtLoop = null; } drawTells(); }
  // a jerk's line in a bubble: quoted, unless it is already somebody talking on the phone or a stage direction
  function jerkQuote(t) { return /^["(]/.test(t) ? t : '"' + t + '"'; }

  function doOffer(it, kind) {
    if (!it || it.state !== 'avail' || blockedHere()) return;
    braydenCheck(it.uid);
    if (kind === 'lowball' && rivalHere('gary')) return;
    if (kind === 'counter' && !DEMO && it.counter) { it.counter = null; track('counter_taken'); kind = 'fair'; } // r6.2: in the full game the counter is the Fair offer, nothing cheaper
    var o = kind === 'steve' ? ['steve', 'Off hold', Math.round(it.ask * 1.2)] : kind === 'counter' && it.counter ? ['counter', 'Deal', it.counter] : offers(it).filter(function (x) { return x[0] === kind; })[0];
    if (!o) return;
    var price = o[2];
    if (price > S.cash + creditHere()) return;
    // Round 6.4: jerks. On the phone: the first ask gets a finger held up. Markup Marv: interest costs you.
    if (it.jerk === 'phone' && !it.phoneAsked) {
      it.phoneAsked = true;
      if (!DEMO) actCost(3);
      it.line = jerkSay(it, 'ignore'); track('jerk_phone');
      sfx('tick');
      if (!checkSundown()) render();
      return;
    }
    if (!DEMO && it.jerk === 'raise' && !it.raised && kind !== 'steve') { actCost(T_HAGGLE); jerkBump(it); sfx('reject'); if (!checkSundown()) render(); return; }
    snapForUndo('buy', it.t);
    actCost(T_HAGGLE);
    if (kind === 'steve') { kind = 'full'; rivalHit('steve'); }
    var sl = NP.SELLERS[it.seller] || {};
    var frac = price / it.ask;
    var scoffed = !DEMO && it.jerk === 'scoff' && kind === 'lowball'; // Scoffing Stan never takes a lowball, not even on a $1 tape
    if (!scoffed && (frac + 1e-6 >= it.minFrac || kind === 'full' || kind === 'counter' || (kind === 'fair' && feverOn()))) {
      if (kind === 'counter') { it.counter = null; track('counter_taken'); }
      var cr = payFor(price);
      it.line = sellerLine(it, 'yes') + (cr ? ' (' + money(cr) + ' of that was your store credit.)' : '');
      takeItem(it, price, kind);
      sfx('cash'); sfx('accept');
      cheerBuy(it, price);
      if (!DEMO) {
        goalTick('land');
        if (price < it.ask) goalTick('haggle');
        goodBuy(it, price);
        goalTick('buy', it, { price: price, offer: kind });
        quickFind();
        if (it.ultra) { comboUp(2); magnet('ultra'); track('ultra_bought'); }
        if (isMedia(it)) { revealGag(it, 'buy'); S.mediaN = (S.mediaN || 0) + 1; if (S.mediaN >= 5) magnet('crate'); }
        if (it.dailyTip) { bonus('Daily tip', 15); magnet('tip'); celebrate('good', NP.DAILY_TIP.paid); track('daily_tip_bought'); }
        // Round 5: the reveal (the mystery box opens instead)
        if (it.kind === 'mbox') openMbox(it, price);
        else if (it.kind === 'game' || it.kind === 'grail' || isMedia(it)) {
          var fl = it.flaw ? NP.FLAW.note.replace('{f}', it.flaw) : '';
          reveal(it, { label: (it.flaw ? NP.FLAW.tag + ' · ' : '') + NP.RARITY[rarityOf(it)].label, line: fl || (it.kind === 'grail' ? 'Worth 100 points on the shelf. You paid ' + money(price) + '.' : estValue(it) > 0 ? 'Worth about ' + money(Math.round(estValue(it))) + '. You paid ' + money(price) + '.' : '') });
          if (it.flaw) track('near_miss_flaw');
        }
      } else { goalTick('buy', it, { price: price, offer: kind }); demoJuice(it, price); setTimeout(offerUndo, 50); }
    } else if (!DEMO && it.jerk && ((kind === 'lowball' && jerkCoin(it, 'low', it.jerk === 'scoff' ? 0.5 : it.jerk === 'walk' ? 0.4 : 0.25)) || (kind !== 'lowball' && it.jerk === 'walk' && jerkCoin(it, 'walk', 0.4)))) {
      // the jerk ends the deal: the thing goes back under the table
      S.streak = 0;
      it.state = 'pulled'; it.line = jerkSay(it, 'quit'); S.ev.jerkQuit = (S.ev.jerkQuit || 0) + 1;
      goalTick('miss'); comboBreak();
      track('jerk_quit'); track('jerk_quit_' + it.jerk);
      sfx('reject');
    } else if (kind === 'lowball' && sl.touchy && !DEMO && !it.jerk) { // at a jerk stop or table, the jerk's rules win (r6.5)
      S.streak = 0;
      it.state = 'pulled'; it.line = S.rem.ikwig && S.rem.ikwig.mad ? 'AGAIN? Unbelievable. Off the table. I will remember this too.' : sl.mad[0]; S.ev.offended++;
      remember('ikwig', 'mad');
      if (!DEMO) { goalTick('miss'); comboBreak(); }
      sfx('reject');
    } else {
      S.streak = 0;
      if (!DEMO) { goalTick('miss'); comboBreak(); }
      it.line = !DEMO && it.jerk && kind === 'lowball' ? jerkSay(it, 'low') : sellerLine(it, 'no');
      // the demo: the seller meets you partway, so a miss is never a dead end
      // the full game (r6.2): no new prices, ever. After a Lowball, the seller says so if Fair would land, and the Deal button IS the Fair offer.
      // When only full price would do, nothing changes: you find out the usual way.
      if (!DEMO && kind === 'lowball' && !it.jerk) { // jerks never meet you partway
        var fair = offers(it)[1][2];
        if (fair + 1e-6 >= it.minFrac * it.ask && fair < it.ask && fair > price) { it.counter = fair; it.line += ' ' + NP.DEMO5.counter.replace('{$}', money(fair)); track('counter_offered'); var fu = it.uid; setTimeout(function () { var cb = document.querySelector('#card-' + fu + ' .counter'); if (cb && S && S.screen === 'stop') showTip('counter', { el: cb, below: true }); }, 250); }
      }
      if (DEMO) { var cm = Math.round(Math.max(it.minFrac * it.ask, (price + it.ask) / 2)); if (cm >= it.ask) cm = it.ask - 1; if (cm > price) { it.counter = cm; it.line += ' ' + NP.DEMO5.counter.replace('{$}', money(cm)); track('counter_offered'); var cuid = it.uid; setTimeout(function () { var cb = document.querySelector('#card-' + cuid + ' .counter'); if (cb && S && S.screen === 'stop') showTip('counter', { el: cb, below: true }); }, 250); } }
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
    if (b.kind === 'grail' || b.kind === 'lot' || b.kind === 'gear' || b.kind === 'standee' || b.kind === 'bulk' || b.kind === 'photo') return false;
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
    snapForUndo('sell', b.t);
    actCost(T_SELL);
    var amt = how === 'trade' ? tradeVal(q) : q.offer;
    S.bag = S.bag.filter(function (x) { return x !== b; });
    if (how === 'trade') { S.credit[S.stop.id] = (S.credit[S.stop.id] || 0) + amt; S.ev.traded++; goalTick('trade'); }
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
    magnet('sale');
    var profit = amt - (b.paid || 0);
    if (profit >= 15) magnet('flip');
    if (profit > 0) goalTick('sell');
    if (profit >= 5) celebrate('good', 'Sold for ' + money(profit) + ' more than you paid.');
    step('first_sale'); step('f09_sell_' + S.history.length + '_' + S.stop.type);
    if (DEMO) setTimeout(offerUndo, 50);
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
  var bannerUntil = 0; // a want list banner is up: a tip waits until it is done, so the win is not covered
  function showTip(key, anchor) {
    var T = NP.TIPS && NP.TIPS[key];
    if (!T || tipsOff) return false;
    var seen = tipsSeen();
    if (seen[key]) return false;
    var wait = bannerUntil - Date.now();
    if (wait > 0) { setTimeout(function () { if (S && (S.screen === 'stop' || S.screen === 'map')) showTip(key, anchor && anchor.el && document.body.contains(anchor.el) ? anchor : null); }, wait + 100); return false; }
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
    if (DEMO) dropUndo();
    var wasDemoEnd = DEMO && S.stop && S.stop.type === 'flea';
    if (S.stop) { step('f08_leave_' + S.history.length + '_' + S.stop.type + '_' + (via || 'map')); progress('leave', S.stop); }
    if (S.stop) { braydenCheck(null); if (S.toast) S.toast = S.toast.replace('You moved on, so', 'On your way out,'); if (!DEMO) goalTick('leave', null, S.stop); }
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
  var townCtl = null;
  // the label over a stop on the town map: its own name when it fits (12 letters), or the first words of it
  function mapLabel(x) {
    if (DEMO || x.type === 'gift' || x.type === 'flea' || x.type === 'banned') return NP.DEMO5.short[x.type] || x.type.toUpperCase();
    if (x.type === 'expo') return 'PIXEL EXPO';
    var n = String(x.name).replace(/\s*\([^)]*\)/g, '').toUpperCase(), w = n.split(' ');
    if (n.length <= 12) return n;
    if ((w[0] + ' ' + w[1]).length <= 12) return w[0] + ' ' + w[1];
    return w[0].length <= 12 ? w[0] : NP.DEMO5.short[x.type] || x.type.toUpperCase();
  }
  function townStops() {
    var fl = S.day.stops.filter(function (x) { return x.type === 'flea'; })[0], nx = planRoute()[0];
    return S.day.stops.filter(function (x) { return !x.xban; }).map(function (x) {
      return { id: x.id, type: x.type, name: x.name, short: mapLabel(x),
        locked: !!x.locked, visited: !!x.visited, next: !!(nx && nx.id === x.id), rare: DEMO && x === fl, late: !x.visited && (S.time + costOf(x) > endT() || closedNow(x, S.time + costOf(x))) };
    });
  }
  // r6.3: the town map is sized to sit fully above the NEXT bar on every screen (desktop too), measured, not guessed
  function fitTownMap() {
    var tin = document.querySelector('#townmap .tm-in'); if (!tin) return;
    tin.style.maxWidth = '';
    var ns = document.querySelector('.nsbar'), r = tin.getBoundingClientRect();
    var top = r.top + (window.pageYOffset || 0) - (window.pageYOffset || 0); // as laid out with the page at the top
    var bottomLimit = (ns ? ns.getBoundingClientRect().top : window.innerHeight) - 8;
    var pad = parseFloat(getComputedStyle(tin).paddingTop) || 0, ratio = parseFloat(getComputedStyle(tin).getPropertyValue('--tmr')) || 1.43;
    if (r.bottom <= bottomLimit) return;
    var w = Math.floor((bottomLimit - r.top - pad) * ratio);
    if (w >= 240) tin.style.maxWidth = w + 'px'; // never smaller than 240 wide; on a very short screen it scrolls instead
  }
  window.addEventListener('resize', function () { if (S && S.screen === 'map') fitTownMap(); });
  function mountTown() {
    var box = document.getElementById('townmap'); if (!box || !NP.TownMap) return;
    if (townCtl && !townCtl.isDriving()) townCtl.stop(); // the last map is gone; free it now
    townCtl = NP.TownMap.mount(box, { cols: DEMO ? 4 : 5, stops: townStops(), at: lastStopId() || 'home', onPick: function (st) {
      var note = document.querySelector('.tm-note');
      if (st.locked) { if (note) note.textContent = NP.DEMO5.lockedNote; sfx('uhoh'); return; }
      if (st.visited) { if (note) note.textContent = NP.DEMO5.visitedNote; return; }
      if (st.late) { if (note) note.textContent = NP.DEMO5.lateNote.replace('{name}', st.name); sfx('uhoh'); return; }
      driveTo(st.id, 'townmap');
    } });
  }
  function townDrive(s, via) {
    if (S.screen !== 'map' || !townCtl || !document.getElementById('townmap')) { S.screen = 'map'; S.stop = null; render(); }
    if (!townCtl) { arrive(s); render(); return; }
    var mins = costOf(s), t0 = S.time, clk = document.querySelector('.hud .clock');
    var spd = window.__NP_INSTANT ? 1 : store.get('speed', 'normal') === 'fast' ? 900 : 1700; // __NP_INSTANT: older test scripts that expect the drive to be done at once
    document.querySelectorAll('.routecard button, .stops button, .tm-cv').forEach(function (b) { b.disabled = true; });
    try { document.getElementById('townmap').scrollIntoView({ block: 'center', behavior: calm() ? 'auto' : 'smooth' }); } catch (e) {}
    townCtl.drive(s.id, { dur: spd, label: 'Driving to ' + s.name + ' · ' + mins + ' min', onSkip: function () { track('drive_skip'); },
      onTick: function (k) { if (clk) clk.textContent = fmtTime(Math.min(t0 + Math.round(k * mins), endT())); },
      done: function () { if (!S || S.screen !== 'map') return; arrive(s); render(); window.scrollTo(0, 0); if (S.screen === 'stop' && S.stop && S.stop.cleared) showTip('dex', null); } });
  }
  function driveTo(id, via) {
    var s = S.day.stops.filter(function (x) { return x.id === id; })[0];
    if (!s || s.visited) { render(); return; }
    if (closedNow(s, S.time + costOf(s))) { S.toast = NP.RUMMAGE.closed; render(); return; } // r6.3: it closes at 10 AM
    if (NP.TownMap) { step('f06_drive_' + (S.history.length + 1) + '_' + s.type + '_' + (via || 'map')); if (tipEl) closeTip(); return townDrive(s, via); } // r6.1: the town map drive, demo and full game
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
  // ---------- r6.3: the real merch (full game only) ----------
  // The game has exactly one real product: RC's actual Nostalgia Pro tee (MERCH_URL). Besides the existing results link,
  // it shows in two quiet places, never during a haggle, never at the swap meet or the Expo, and never in the demo:
  // one card in the Gift Shop, and now and then a spot in a break between stops (at most once a day, about 1 break in 3).
  function realMerchOk() { return !DEMO && linksOk() && !!CFG.MERCH_URL && !adFree; }
  function merchSpotDue() {
    if (!realMerchOk()) return false;
    var last = S.history[S.history.length - 1], ls = S.day.stops.filter(function (x) { return x.id === last; })[0];
    if (!ls || ls.type === 'flea' || ls.type === 'expo') return false;
    var today = phoenixDate();
    if (store.get('merchSpotDay', '') === today) return false;
    if ((NP.hashStr(S.seed + '|merch|' + S.visited) % 3) !== 0) return false;
    store.set('merchSpotDay', today);
    return true;
  }
  function showMerchSpot(next) {
    var M = NP.REAL_MERCH, ov = document.createElement('div');
    ov.className = 'tvad-ov merch-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', M.spotTitle);
    ov.innerHTML = '<div class="tvad merchspot"><div class="tvad-top"><span class="tvad-ch">CH 3</span><span class="tvad-lab">' + esc(M.spotLabel) + '</span></div>' +
      '<div class="ms-body"><canvas class="ms-tee" width="40" height="36" aria-hidden="true"></canvas><div><div class="ms-h">' + esc(M.spotTitle) + '</div><div class="ms-t">' + esc(M.spotLine) + '</div></div></div>' +
      '<a class="ms-go" href="' + esc(CFG.MERCH_URL) + '" target="_blank" rel="noopener" data-merch="break">' + esc(M.spotBtn) + ' &#8599;</a>' +
      '<button class="tvad-skip" type="button">' + esc(M.skip) + ' &#9654;&#9654;</button></div>';
    document.body.appendChild(ov);
    drawTee(ov.querySelector('.ms-tee'));
    track('merch_spot_shown');
    var done = false, close = function () { if (done) return; done = true; if (ov.parentNode) ov.parentNode.removeChild(ov); window.removeEventListener('keydown', key, true); next(); };
    var key = function (e) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); } };
    ov.querySelector('.tvad-skip').addEventListener('click', close);
    ov.querySelector('.ms-go').addEventListener('click', function () { setTimeout(close, 50); });
    window.addEventListener('keydown', key, true);
    setTimeout(close, 9000); // it never holds you up
    if (window.__NP_TEST) window.__NP_TEST.closeMerch = close;
  }
  // a plain pixel tee (not the real design, which lives on the store page)
  function drawTee(cv) {
    if (!cv) return; var g = cv.getContext('2d'), P = function (x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); };
    P(0, 0, 40, 36, '#1d2b53');
    P(4, 4, 32, 8, '#0b1022'); P(10, 4, 20, 30, '#0b1022'); P(5, 5, 30, 6, '#2a3a6e'); P(11, 5, 18, 28, '#2a3a6e');
    P(16, 4, 8, 3, '#1d2b53'); P(15, 13, 10, 9, '#ffcc33'); P(16, 14, 8, 7, '#fff1d6'); P(17, 16, 2, 3, '#e4343e'); P(21, 16, 2, 3, '#e4343e'); P(17, 20, 6, 1, '#29d3e8');
  }
  function showCommercial(next, last) {
    if (!last && merchSpotDue()) return showMerchSpot(next);
    if (!adFree && NP.TVAds && !last) {
      S.adsShown++;
      var n = store.get('tvN', 0) || 0; store.set('tvN', n + 1);
      music(null); if (NP.Sound && NP.Sound.ambience) NP.Sound.ambience(null);
      track('tv_drive');
      NP.TVAds.play({ idx: n, label: "WE'LL BE RIGHT BACK", onDone: function (skipped) { track(skipped ? 'tv_skipped' : 'tv_watched'); next(); } });
      return;
    }
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
    h += '<div class="shelfnote">Home at ' + fmtTime(Math.min(S.time, endT())) + ' with ' + money(S.cash) + ' left and ' + pl(S.bag.length, 'thing') + ' in the bag.</div>';
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
      else if (b.kind === 'standee') { pts = b.signed ? 40 : 0; note = b.signed ? 'A life-size cardboard Chet Brickwall, signed by the actual Chet Brickwall. Now it is worth something.' : 'A life-size cardboard Chet Brickwall. Worth nothing. Guards the shelf.'; }
      else if (b.kind === 'photo') { v = b.base || 20; pts = Math.round(v); haul += v; note = 'A signed 8x10. It goes on the wall next to the shelf.'; }
      else if (b.kind === 'bulk') { v = 40; pts = 40; haul += v; note = 'Forty sports games. You paid ' + money(b.paid || 0) + ' for about $40 of football.'; }
      else if (b.kind === 'club') { v = b.base || 20; pts = Math.round(v); haul += v; note = NP.CLUB.box.d; }
      else if (b.kind === 'music' || b.kind === 'movie') {
        if (seen[b.id]) { pts = -5; note = 'Two of the same one. Bought on the same day. By you.'; }
        else if (S.season && S.day.owned[b.id]) { pts = -5; dup = true; note = 'It was on the shelf. Now it is on the shelf twice.'; }
        else {
          if (b.gag && !b.revealed && NP.MEDIA_GAGS[b.gag].hidden) b.revealed = true;
          v = (b.base || 1) * (b.flags && b.flags.residue && !b.cleaned ? 0.7 : 1) * (b.gradeMult || 1) * (b.signed ? 3 : 1) * mediaMult(b); pts = Math.max(1, Math.round(v)); haul += v;
          var GG = b.gag && NP.MEDIA_GAGS[b.gag];
          note = GG && GG.home && !(GG.fix && b.fixed) ? GG.home : b.caseT ? 'Wrong ' + (b.fmt === 'vinyl' ? 'sleeve' : 'case') + ': it says ' + b.caseT + ' on the outside.' : MEDIA_NOTE[b.fmt] || 'Good pickup.';
          if (b.flags && b.flags.residue && !b.cleaned) note += ' Sticker goo: worth 30% less.';
          if (b.grade) note += ' Graded ' + b.grade + '.';
          if (b.signed) note += ' Signed by Chet Brickwall: worth three times as much.';
        }
      }
      else if (S.day.owned[b.id] || seen[b.id]) { pts = S.season ? -5 : -15; dup = true; note = 'It was on the shelf. Now it is on the shelf twice.'; }
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
        if (b.flaw) { v *= NP.FLAW.mult; note += ' ' + NP.FLAW.tag + ': ' + b.flaw.toLowerCase().replace(/\.$/, '') + ', worth 15% less.'; }
        if (b.variant && NP.VARIANTS[b.variant] && !(b.flags.damaged && b.cond === 'loose')) { v *= NP.VARIANTS[b.variant].mult; note += ' ' + NP.VARIANTS[b.variant].note; }
        if (b.gradeMult) { v *= b.gradeMult; note += ' Graded ' + b.grade + '.'; }
        pts += Math.round(v); haul += v;
      }
      if (b.kind === 'game' || b.kind === 'grail' || b.kind === 'music' || b.kind === 'movie') seen[b.id] = true;
      if (b.fromLot) note = '(Lot box) ' + note;
      // the Desert Pixel Expo: convention buys count double
      if (b.expoBuy && pts > 0) { pts *= 2; note += ' ' + NP.EXPO.double; }
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
    // Round 3c replay pack: mini-goals, quick finds and surprises (combo and fever already counted in)
    var cats = {}, order = [];
    (S.bonusLog || []).forEach(function (b) { if (!(b[0] in cats)) { cats[b[0]] = [0, 0]; order.push(b[0]); } cats[b[0]][0] += b[1]; cats[b[0]][1]++; });
    var extra = 0;
    order.forEach(function (c) { score += cats[c][0]; extra += cats[c][0]; bonus.push([c + ' (' + cats[c][1] + ')', cats[c][0]]); });
    var cashPts = S.season ? 0 : Math.floor(S.cash / 2);
    if (cashPts) { score += cashPts; bonus.push(['Cash left over (' + money(S.cash) + ')', cashPts]); }

    // run title, most embarrassing first
    if (items.some(function (b) { return b.ultra; })) titles.push('Found an Ultra Rare (For Real)');
    if (grail) titles.push('Played Myself');
    if ((S.goalsDone || []).length >= 4) titles.push('Goal Getter');
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
    if (S.ev.jerkQuit) titles.push('Got Told to Get Outta Here');
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
    return { lines: lines, bonus: bonus, score: score, haul: Math.round(haul), spent: spent, title: titles[0], also: titles.slice(1, 3), items: items, extra: extra };
  }

  function renderResults() {
    var R = S.result;
    step('f22_results');
    // the first time this screen shows: the score counts up and the appraisal comes in one find at a time
    var reveal = !DEMO && !S.revealDone && !calm();
    var h = '<div class="screen results"><h2>' + (S.season ? esc(seasonLabelLc(S.week)) + ' is on the shelf' : 'The Shelf') + '</h2>' +
      '<div class="runtitle">"' + esc(R.title) + '"</div>' + (S.shelfLine ? '<div class="bubble big hero">You: "' + esc(S.shelfLine) + '"</div>' : '') +
      (R.also.length ? '<div class="also">Also earned: ' + R.also.map(esc).join(' &middot; ') + '</div>' : '') +
      '<div class="bigscore"><span class="bsn">' + R.score + '</span> <small>points</small></div>' +
      '<div class="stats">Spent ' + money(R.spent) + ' of ' + money(S.budget) + ' &middot; Haul value ' + money(R.haul) + ' &middot; ' + pl(R.items.length, 'item') +
      (S.ev.sold ? ' &middot; Sold or traded ' + S.ev.sold + ' for ' + money(S.ev.sales) : '') + '</div>' +
      '<div class="scores">' + esc(S.recordMsg || '') + '</div>' +
      (DEMO ? demoTackle() : '') +
      rewardsHTML() +
      featuredReveal() + bannedList() +
      '<canvas id="card" width="1200" height="675"></canvas>' +
      '<div class="btns center"><button class="big" data-act="download">Download your share card</button><button data-act="copy">Copy result text</button>' +
      (DEMO ? '<button data-act="demoend">Continue &#9654;</button>' : '') +
      '' /* Grok Bot r3b fix: only one next-Saturday button on season results (the big one at the bottom) */ + '</div>' +
      '<div class="appraisal' + (reveal ? ' reveal' : '') + '"><h3>Appraisal</h3>';
    // full game: the haul in shelf sections (games, music, movies) when there is more than one kind
    var grpOf = function (l) { var k = l.it && l.it.kind; return k === 'music' ? 1 : k === 'movie' ? 2 : 0; };
    var GRP = ['Games', 'Music', 'Movies'], used = [0, 0, 0];
    R.lines.forEach(function (l) { used[grpOf(l)] = 1; });
    var split = !DEMO && used[0] + used[1] + used[2] > 1;
    var shown = [], nShown = 0;
    if (split) [0, 1, 2].forEach(function (g) { R.lines.forEach(function (l, i) { if (grpOf(l) === g) shown.push(i); }); });
    else R.lines.forEach(function (l, i) { shown.push(i); });
    var lastG = -1;
    shown.forEach(function (i) {
      var l = R.lines[i];
      if (split && grpOf(l) !== lastG) { lastG = grpOf(l); h += '<div class="al-sec">' + GRP[lastG] + '</div>'; }
      var rp = !!(l.it && l.it.kind === 'game' && l.it.flags && l.it.flags.repro);
      var great = l.pts >= 40 || (l.it && l.it.kind === 'grail');
      h += '<div class="al has-art' + (great ? ' great' : '') + '" style="--d:' + (0.35 + Math.min(nShown++, 14) * 0.28).toFixed(2) + 's"><span class="al-art" data-rart="' + i + '"></span><div class="al-body"><div class="al-row"><span class="al-t">' + esc(l.t) + '</span><span class="al-p ' + (l.pts < 0 ? 'neg' : '') + '">' + (l.pts > 0 ? '+' : '') + l.pts + '</span></div>' +
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
    if (reveal) {
      S.revealDone = true;
      countUp(document.querySelector('.bsn'), R.score, 1100);
      // a chime for each great find as it comes in (a few at most)
      R.lines.map(function (l, i) { return [l, i]; }).filter(function (x) { return x[0].pts >= 40 || (x[0].it && x[0].it.kind === 'grail'); }).slice(0, 4).forEach(function (x) {
        setTimeout(function () { if (S && S.screen === 'results') sfx('sparkle'); }, (0.35 + Math.min(x[1], 14) * 0.28) * 1000 + 150);
      });
      if ((S.pbLines || []).some(function (p) { return p[0] === 'best'; })) setTimeout(function () { if (S && S.screen === 'results') sfx('sting'); }, 1250);
    }
  }
  // personal bests, "so close", new fridge magnets and your collector rank, under the score
  function rewardsHTML() {
    if (DEMO) return '';
    var h = '';
    (S.pbLines || []).forEach(function (p) { h += '<div class="pb pb-' + p[0] + '">' + (p[0] === 'best' ? '&#9733; ' : '') + esc(p[1]) + '</div>'; });
    var nm = (S.newMagnets || []).map(function (id) { var M = NP.MAGNETS.filter(function (x) { return x.id === id; })[0]; return M ? M.name : ''; }).filter(Boolean);
    if (nm.length) h += '<div class="magnew">New fridge magnet' + (nm.length > 1 ? 's' : '') + ': <b>' + nm.map(esc).join(' &middot; ') + '</b></div>';
    if (S.rankUp) h += '<div class="pb pb-best">&#9733; Collector rank up: ' + esc(S.rankUp) + '</div>';
    h += '<div class="rankline">' + rankLine() + '</div>';
    return h;
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
    NP.pixelText(ctx, DEMO ? 'DEMO' : S.free ? 'RANDOM SATURDAY' : S.season ? seasonLabel(S.week) : 'SATURDAY #' + S.runNo, W - 40, 26, 3, C.cream, 'right');
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
    // a season's seed is long, so the footer names the season instead (it used to run into the web address)
    NP.pixelText(ctx, DEMO ? 'THE FREE DEMO' : (S.free ? 'RANDOM SATURDAY' : S.season ? 'SEASON' + (S.day.expo ? ' · THE EXPO' : '') : 'DAILY RUN ' + S.seed) + ' · ' + NP.MODES[modeOf()].name, 40, H - 46, 3, C.cream);
    NP.pixelText(ctx, 'THENOSTALGIAPRO.COM', W - 40, H - 46, 3, C.cyan, 'right');
    if (items.length > show.length) NP.pixelText(ctx, '+' + (items.length - show.length) + ' MORE', W / 2 - 40, H - 42, 2, C.gold, 'center');
    // scanlines
    for (var y = 0; y < H; y += 3) { ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(0, y, W, 1); }
  }

  function shareText() {
    var R = S.result;
    return 'Nostalgia Pro, ' + (DEMO ? 'the free demo' : (S.free ? 'Random Saturday' : S.season ? 'season, ' + seasonLabelLc(S.week) : 'Saturday #' + S.runNo) + ', ' + NP.MODES[modeOf()].name) + ' (' + S.wx.temp + 'F)\n"' + R.title + '"\nScore ' + R.score + ' | Spent ' + money(R.spent) + ' | ' + pl(R.items.length, 'find') + '\nFeatured lot: ' + featuredStatus() + '\nIs it on the shelf? Play: thenostalgiapro.com';
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
    S.newMagnets = S.newMagnets || [];
    if (!DEMO) { dayMagnets(R); addFinds(R.items.length); }
    if (S.season) {
      finishSeasonSaturday(R);
      S.pbLines = personalBests(R);
      saveHomeShelf(R);
      var tot = seasonTotals();
      S.recordMsg = 'On the season shelf: ' + SEASON.shelf.length + ' (' + countsText(mediaCounts(SEASON.shelf)) + '). Season score so far: ' + tot.score + ' (shelf value ' + tot.value + ', ' + tot.finds + ' different find' + (tot.finds === 1 ? '' : 's') + ', ' + (tot.bonus ? tot.bonus + ' from goals and surprises, ' : '') + tot.cashPts + ' for cash). ' + money(SEASON.cash) + ' carries over to next Saturday, plus payday.';
      S.screen = 'results';
      sfx('fanfare');
      render();
      window.scrollTo(0, 0);
      return;
    }
    if (DEMO) msg = 'Demo run complete. In the full version, this haul would go on your home shelf.';
    else if (S.free) msg = 'Random Saturday. These do not go on your home shelf.';
    else if (!prev) { store.set(dk, { score: R.score, title: R.title }); saveHomeShelf(R); msg = 'Official ' + mname + ' run for today saved to your home shelf.'; }
    else msg = 'Replay. Today\'s official ' + mname + ' run was ' + prev.score + '.';
    if (!best || R.score > best.score) { store.set(bk, { score: R.score, seed: S.seed }); msg += ' New personal best (' + mname + ')!'; }
    else msg += ' Best ever (' + mname + '): ' + best.score + '.';
    S.recordMsg = msg;
    S.pbLines = personalBests(R);
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
        // the demo gets you to the first find fast: a look is picked for you (change it any time from the menu)
        if (DEMO && NP.Creator && !hasLook() && NP.Char) { store.set('look', NP.Char.normalize(NP.Char.random(Math.random, { noBrand: true }))); track('creator_skipped'); begin(); }
        else if (NP.Creator && !hasLook()) showCreator(begin, 'Looks good. Start Saturday');
        else begin();
        break;
      case 'continue': cartOpen = false; step('f03_continue'); continueGame(); break;
      case 'democontinue': step('f03_continue'); continueDemo(); break;
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
      case 'tv': playTV(el.getAttribute('data-where') || 'map'); break;
      case 'jumpsell': var sb = document.getElementById('sellbox'); if (sb) sb.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
      case 'inspect':
        var it = findItem(uid); braydenCheck(uid); actCost(T_INSPECT); it.inspected = true; if (!DEMO) jerkBump(it);
        if (it.flags && it.flags.repro && it.tell) { sfx('uhoh'); track('repro_inspected'); magnet('eagle'); }
        goalTick('inspect', it);
        if (isMedia(it)) revealGag(it, 'inspect');
        blowOnIt(it);
        if (rivalHere('brayden') && it.state === 'avail') S.stop.bfocus = it.uid;
        if (!checkSundown()) render(); break;
      case 'check': var it2 = findItem(uid); braydenCheck(uid); actCost(T_SHELF); it2.checked = true; if (!DEMO) jerkBump(it2); S.ev.checks++; goalTick('check'); if (rivalHere('brayden') && it2.state === 'avail') S.stop.bfocus = it2.uid; if (!checkSundown()) render(); break;
      case 'dig': braydenCheck(null); actCost(T_DIG); S.stop.dug = true; goalTick('dig'); if (!checkSundown()) render(); break;
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
      case 'grade': doGrade(uid); break;
      case 'event': doEvent(); break;
      case 'mfix': doMediaFix(uid); break;
      case 'club': doClub(el.getAttribute('data-v')); break;
      case 'autoline': if (S.stop && S.stop.type === 'expo' && !S.stop.inLine) { actCost(NP.EXPO.sign.min); S.stop.inLine = true; track('expo_autograph_line'); if (!checkSundown()) render(); } break;
      case 'sign': doSign(uid); break;
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
        document.body.appendChild(a); a.click(); a.remove(); track('share_card_saved'); track('share_tapped'); break;
      case 'copy':
        track('share_tapped');
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
      case 'tips': setTipsOff(!tipsOff); if (document.querySelector('.setov')) openSettings(); break;
      case 'settings': openSettings(); break;
      case 'setclose': closeSettings(); break;
      case 'tsize': store.set('tsize', +el.getAttribute('data-v')); applyTextSize(); openSettings(); track('textsize_' + el.getAttribute('data-v')); break;
      case 'speed': store.set('speed', el.getAttribute('data-v')); openSettings(); track('speed_' + el.getAttribute('data-v')); break;
      case 'calmfx2': store.set('calmFx', el.getAttribute('data-v') === 'calm'); applyFx(); openSettings(); break;
      case 'undo': doUndo(); break;
      case 'nsgo': nextStepGo(); break;
      case 'mute': if (NP.Sound) NP.Sound.toggle(); if (document.querySelector('.setov')) openSettings(); break;
      case 'hsname': var cap = $('#hscap'); if (cap) cap.textContent = el.getAttribute('data-name'); break;
      case 'calmfx': store.set('calmFx', !store.get('calmFx', false)); applyFx(); el.outerHTML = fxButton(); track(store.get('calmFx', false) ? 'fx_calm' : 'fx_full'); break;
      case 'hsfilter': homeFilter = el.getAttribute('data-v') || 'all'; renderHomeShelf(); break;
      case 'totitle': S = null; cartOpen = true; renderTitle(); window.scrollTo(0, 0); break;
    }
  }
  function onInput(e) {
    if (e.target.getAttribute && e.target.getAttribute('data-set') === 'vol' && NP.Sound && NP.Sound.setVolume) {
      NP.Sound.setVolume(e.target.value / 100);
      var o = document.querySelector('.set-volv'); if (o) o.textContent = e.target.value + '%';
      if (NP.Sound.isMuted() && +e.target.value > 0) NP.Sound.setMuted(false);
    }
  }
  function onChange(e) {
    if (e.target.getAttribute && e.target.getAttribute('data-set') === 'vol') { sfx('coin'); track('volume_set'); return; }
    if (e.target.classList && e.target.classList.contains('tipoff-in')) { setTipsOff(e.target.checked); return; }
    if (e.target.getAttribute('data-act') === 'adfree') {
      adFree = e.target.checked; store.set('adfree', adFree);
      if (S) S.toast = adFree ? 'Ad-Less Edition activated. Enjoy these ads for the Ad-Less Edition.' : 'Ads are back. They missed you.';
      render();
    }
  }

  window.addEventListener('DOMContentLoaded', function () {
    app = document.getElementById('app');
    applyFx(); applyTextSize();
    if (DEMO) setInterval(function () { if (S && S.screen === 'walk') demoSave(); }, 10000); // the swap meet autosaves while you walk
    if (!miniT) miniT = setInterval(miniTick, 5000); // r6.2: the full game has (flavor-only) mini events too
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
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
  var hidSent = false, quitSent = false;
  function onHide() {
    // a season Saturday saves right away when the page is hidden or closed (no waiting on the autosave timer)
    if (S && S.season && (S.screen === 'map' || S.screen === 'stop' || S.screen === 'walk' || S.screen === 'home')) { if (saveT) { clearTimeout(saveT); saveT = null; } saveGame(); }
    if (DEMO) demoSave(); // the demo saves right away when the page is hidden or closed, too
    // the quit marker: where the player was the first time the tab was hidden or closed. Sent once per page load.
    if (!quitSent) { quitSent = true; try { if (NP.track) NP.track('quit_' + whereNow(), true, true); } catch (e) {} }
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
    if (DEMO) { S.toast = NP.DEMO5.start; return go(); } // the demo skips the morning scenes and starts on the town map
    if (NP.Intro) NP.Intro.morning(app, { look: getLook(), runNo: S.runNo, label: DEMO ? 'DEMO SATURDAY' : S.free ? 'RANDOM SATURDAY' : 'SATURDAY #' + S.runNo, wx: S.wx, featured: S.day.featured, adFree: adFree, demo: DEMO, mode: S.mode, spotted: DEMO ? '' : spottedText() }, go);
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
    itemCard: itemCard, drawArts: drawArts, giftHTML: giftHTML, gradeHTML: function () { return gradeHTML(); }, autographHTML: function () { return autographHTML(); }, drawGiftArts: drawGiftArts, dexSetup: dexSetup,
    walkBoost: function () { return walkBoost(); }, wantTable: function (o) { wantTable(o); },
    adLevel: adLevel, adFree: function () { return adFree; }, look: getLook, helloFor: helloFor,
    fmtTime: fmtTime, money: money, esc: esc, sfx: sfx, track: track, demo: DEMO,
    fleaGroups: fleaGroups, jerkQuote: jerkQuote, jerkDef: jerkDef, jerkName: jerkName, jerkTellHTML: jerkTellHTML, startTells: startTells, jerkTip: jerkTip, calm: function () { return calm(); },
    takeToast: function () { var t = S.toast; S.toast = ''; return t; },
    tip: function (k) { return showTip(k, k === 'dex' ? dexAnchor() : null); }, tipOpen: tipOpen
  };

  // test hooks (harmless in production)
  window.__NP_TEST = { keep: function () { return K(); }, haggleLine: function () { return haggleLine(!!(S && S.stop && (S.stop.type === 'flea' || S.stop.type === 'expo'))); }, merchSpot: function (cb) { showMerchSpot(cb || function () {}); }, merchDue: function () { return merchSpotDue(); }, chip: function (lv, t) { celebrate(lv, t); }, spotCameo: function (id) { return spotCameo(id); }, playTV: function (w) { playTV(w || 'map'); },
    // the season simulator used for the balance pass (test only; nothing in the game calls these)
    sim: {
      route: function () { return planRoute().map(function (x) { return x.id; }); },
      go: function (id) { var st = S.day.stops.filter(function (x) { return x.id === id; })[0]; arrive(st); S.stop = st; },
      leave: function () { S.stop = null; S.screen = 'map'; S.visited++; },
      wants: function (uid) { var it = findItem(uid), def = S.goal && goalDef(S.goal.id); if (!it || !def) return false;
        if (def.type === 'buy') return wantMatch(def.f, it, null, S.stop);
        if (def.type === 'groups') return def.groups.some(function (gf, i) { return !(S.goal.got || {})[i] && wantMatch(gf, it, null, S.stop); });
        if (def.type === 'inspect') return !it.inspected && wantMatch(def.f, it, null, S.stop);
        return false; },
      goalType: function () { var def = S.goal && goalDef(S.goal.id); return def ? def.type : null; },
      leaveReal: function () { leaveStop('map'); },
      offer: function (uid, kind) { var it = findItem(uid); if (it) doOffer(it, kind); return it ? it.state : null; },
      inspect: function (uid) { var it = findItem(uid); if (!it) return; actCost(T_INSPECT); it.inspected = true; jerkBump(it); },
      check: function (uid) { var it = findItem(uid); if (!it) return; actCost(T_SHELF); it.checked = true; jerkBump(it); },
      dig: function () { actCost(T_DIG); S.stop.dug = true; },
      unblock: function () { var D = storyOf(S.stop); if (D && !D.coded && D.choices) D.choices.forEach(function (c, i) { if (c.unblock && !storyState(S.stop).open) doStory(i); }); if (S.stop.lateFee) doLateFee(); },
      shelve: function () { S.screen = 'home'; S.stop = null; shelve(); return { score: S.result.score, items: S.result.items.length }; },
      weekdays: function () { renderWeekdays(); },
      totals: function () { return seasonTotals(); },
      season: function () { return SEASON; },
      fresh: function () { SEASON = null; newSeason(); },
      ending: function () { var e = seasonTotals(); return NP.ENDINGS.filter(function (x) { return x.test(e); })[0].id; },
      owned: function (id) { return !!(S.day.owned[id] || boughtAlready(id)); }
    }, seasonSat: function (week) { if (!SEASON) newSeason(); SEASON.week = week; newRun('sundown', false, true); S.screen = 'map'; render(); }, runSeed: function (m, seed) { todaySeed = seed; SEASON = null; newRun(m); S.screen = 'map'; render(); }, goStop: function (id) { var st = S.day.stops.filter(function (x) { return x.id === id; })[0]; arrive(st); render(); }, genDay: genDay, buildDay: buildDay, season: function () { return SEASON; }, render: function () { render(); }, readSave: readSave, state: function () { return S; }, phoenixDate: phoenixDate, weatherFor: weatherFor,
    preview: function (seed) { var d = applyExtras(genDay(seed), seed); return { wx: d.wx.id, host: d.featured.stopName, hostType: d.stops.filter(function (s) { return s.id === d.featured.stopId; })[0].type }; } };
})();
