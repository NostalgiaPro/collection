// Nostalgia Pro DLC 2: Dime Box Dynasty, sponsored by Storage Beers. Full game only (never the demo).
// The Sports Bin Guy at the Cul-de-sac Sale runs a league all season: a dime box of Scrimmage Season, one made-up
// football game a year from '89 to '03, 10 cents each. Get all 15 years on your season shelf and you Complete the Run.
// Release: Sat Nov 21, 2026. There is no date gate: the pack works on any date as soon as it is on.
//
// This file only registers itself. It never edits base data when it loads, and it adds no stops: the dime box lives
// on the sports stop (s.d2) and the league lives in SEASON.dlc.dlc2. Every random number here comes from this pack's
// own seeded generator ('dlc2|' + seed + '|...'), and its items are built here (not with makeItem), so the base day's
// rolls and item numbers are exactly what they were without it.
//
// Money: cash is whole dollars everywhere. A league game is 10 cents, so the Sports Bin Guy keeps one dime tab: every
// tenth dime takes $1 from your cash. In a season the tab carries over from Saturday to Saturday (it is saved in
// SEASON.dlc.dlc2.tab), and dimes still on it are settled for $1 only when the league closes its books, on the Expo
// Saturday ("I do not make change"). A one day run settles its tab when the haul is shelved. Cents are printed by
// this pack as "10¢". money() is never called on a cents amount.
//
// League games cannot be resold: the base sell list keeps each owner's offer in S.sq, and this pack marks every
// league game in the bag as "not buying it" there for the stop you are at, so no owner ever pays for one.
var NP = window.NP || {};
window.NP = NP;
NP.DLC = NP.DLC || {};
(function () {
  'use strict';
  var ID = 'dlc2', PX = 'd2_';
  var CENT = '¢', DIME = 0.1, TABMAX = 10;
  var RARE = '95', RARE_FROM = 7;                 // the misprint year: rarer, and only from Saturday 7 on
  var W_NEW = 6, W_HAVE = 1, W_RARE = 0.5;       // dime box weights (tuned with the completion simulation)
  var DROP_P = 0.6, DROP_NEW = 8;                 // when he stays home: how often a league year turns up elsewhere
  var PTS = { year: 2, run5: 2, run10: 3, done: 5 }; // league points: 15 x 2 + 2 + 3 + 5 = 40 for the whole set
  var YEARS = ['89', '90', '91', '92', '93', '94', '95', '96', '97', '98', '99', '00', '01', '02', '03'];

  // ---------- every word the pack says (house style: plain words, no dashes, played straight) ----------
  var T = {
    name: 'Dime Box Dynasty, sponsored by Storage Beers', series: 'Scrimmage Season', tag: 'Worth a Dime',
    cardH: 'Dime Box Dynasty, sponsored by Storage Beers',
    card: "The Sports Bin Guy runs a league out of a shoebox: every year of Scrimmage Season, '89 to '03, 10" + CENT + ' each, because nobody else wants them. Get all 15 years on your shelf this season and you complete the run.',
    hi: ['Dime Box Dynasty is open. Every year of Scrimmage Season, a dime each. Nobody else wants them, so they are ours.',
      'I keep the tab. You keep the games. That is the whole league.',
      "You have to see '93. It rains in one stadium. The players do not even notice. It is beautiful.",
      "Same game every year? Sure. That is what makes it a season."],
    oneDay: 'This is a one day run. The dime box is open, but league standings and the set only count in a season.',
    boxH: 'The dime box',
    firm: 'League games are 10' + CENT + ' and they are not haggled. "It is a dime. It has always been a dime."',
    empty: 'The dime box is empty. "That is the league for today. See you next Saturday."',
    tab: 'Your dime tab: {c}. Every 10 dimes, $1 comes out of your cash. The tab carries over from Saturday to Saturday. Dimes still on it on Expo Saturday cost $1. He does not make change.',
    tabOne: 'Your dime tab: {c}. Every 10 dimes, $1 comes out of your cash. Dimes still on it at the end of the day cost $1. He does not make change.',
    noSell: 'That is a Dime Box Dynasty game. Nobody buys those back, not even for a dime.',
    resTab: 'Dime tab: {c}. It carries over to next Saturday.',
    take: 'Take it · 10' + CENT,
    broke: 'You need at least $1 in cash to run a dime tab.',
    inBag: 'IN THE BAG · 10' + CENT,
    onShelf: 'This year is already on your shelf this season.',
    took: "You drop a dime in his coffee can. Scrimmage Season '{y} goes in the bag.",
    dollar: ' Ten dimes. That is a dollar. He takes $1 and starts a new tab.',
    leave: 'The Sports Bin Guy: "I do not make change." You pay $1 for the {n} on the tab.',
    leaveEnd: 'The Sports Bin Guy closes the league books for the season: "I do not make change." You pay $1 for the {n} on the tab.',
    waive: 'The Sports Bin Guy sees your empty wallet and waves off the dimes. "The league covers it."',
    run: 'Your run: {n} of 15 years.',
    yrsLabel: 'League years on your shelf and in your bag',
    badge: 'Complete the Run',
    badgeCard: 'You have the Complete the Run badge this season. He still keeps the box open for you.',
    gary: 'Gary leans over the dime box. "A nickel. For the whole box." The Sports Bin Guy: "It is a dime. It has always been a dime." Gary walks off with nothing.',
    dropH: 'A box from the Cul-de-sac Sale',
    drop: 'The Sports Bin Guy stayed home today, but he dropped off a box here this morning. The lid says DIME BOX DYNASTY · 10' + CENT + ' EACH · I DO NOT MAKE CHANGE.',
    dropDig: 'Somebody says the football bin guy dropped off a shoebox in the back boxes this morning. Dig through the back boxes to find it.',
    dropFound: 'Under the back boxes: a shoebox from the Cul-de-sac Sale. The lid says DIME BOX DYNASTY · 10' + CENT + ' EACH · I DO NOT MAKE CHANGE.',
    chipNew: "Dime Box Dynasty: '{y} is new. {n} of 15.",
    chipRun5: 'Five league years in a row!',
    chipRun10: 'Ten league years in a row!',
    chipDone: 'COMPLETE THE RUN! All 15 years of Scrimmage Season.',
    route: 'The Cul-de-sac Sale has the dime box today: {n} league games at 10' + CENT + ' each.',
    routeDrop: 'The Sports Bin Guy stayed home, but he dropped off a league game at {stop}.',
    res: 'Dime Box Dynasty · today you added {list}. Your run: {n} of 15 years.',
    resNone: 'Dime Box Dynasty · {g} today, no new years. Your run: {n} of 15 years.',
    resOne: 'Dime Box Dynasty · {g} today. In a season they would count toward the run.',
    resDone: "Complete the Run. All 15 years of Scrimmage Season, '89 to '03, on one shelf. The Sports Bin Guy took his hat off. May your shelf never be full.",
    resBadge: 'Complete the Run badge: earned on Saturday {w} this season.',
    week: 'Dime Box Dynasty standings: {table}. Your run: {n} of 15 years.',
    weekDone: 'Dime Box Dynasty standings: {table}. You have the Complete the Run badge.',
    you: 'You', guy: 'the Sports Bin Guy',
    nb: [['Doris', 'Doris from Quail Run'], ['Merle', 'Merle on Creosote Way']]
  };

  // ---------- Scrimmage Season '89 to '03 (one made-up yearly football series, the same game every year) ----------
  // Each one is worth about what it costs (a dime), so the pack cannot be farmed for season score.
  var ITEMS = [
    { y: '89', p: 'fer', s: 'The First Season', d: 'The first Scrimmage Season. Eleven players a side, one play called Run, and a crowd made of the same four faces.', b: 'REAL FOOTBALL. ON YOUR TV. AT HOME.' },
    { y: '90', p: 'fer', s: 'Now With Passing', d: "The same field as '89, but now you can throw the ball. The ball goes where it wants.", b: 'THE BALL GOES IN THE AIR NOW.' },
    { y: '91', p: 'fer', s: 'New Rosters', d: 'Every player is one year older. The game is the same game. The box says this is a big deal.', b: 'EVERYBODY HAD A BIRTHDAY.' },
    { y: '92', p: 'k16', s: 'Greener Grass', d: 'The first one on the Kestrel 16. The grass is a nicer green. The play is still called Run.', b: 'MORE GREEN THAN EVER BEFORE.' },
    { y: '93', p: 'k16', s: 'The Rain Game', d: 'It rains in one stadium now. The players do not notice. Neither does the ball.', b: 'WEATHER. FINALLY.' },
    { y: '94', p: 'k16', s: 'Season Mode', d: 'You can play a whole season now, one game at a time. That is how you played it before, but now it counts.', b: 'SIXTEEN GAMES. ALL OF THEM FOOTBALL.' },
    { y: '95', p: 'k16', s: 'The Misprint', d: "The box says '59 on the front. The game inside is '95. The factory fixed the boxes after one truck, and this one came off that truck.", b: "SCRIMMAGE SEASON '59. (IT IS '95.)" },
    { y: '96', p: 'lum', s: 'Now on Disc', d: 'The first one on a disc. It loads for a while, then it is the same game. The loading screen has a fun fact about grass.', b: 'NOW LOADING. NOW PLAYING. NOW LOADING.' },
    { y: '97', p: 'lum', s: 'Louder Crowd', d: 'The crowd is louder now. It is the same four faces, only louder. You can turn them down in the menu.', b: 'HEAR THE CROWD. THE CROWD IS FOUR GUYS.' },
    { y: '98', p: 'lum', s: 'Camera on a Pole', d: 'You can watch every play again from a camera up on a pole. It looks exactly the same from up there.', b: 'SEE IT AGAIN. IT IS STILL THE SAME PLAY.' },
    { y: '99', p: 'pip', s: 'Lunch Break Edition', d: 'The whole season on the Lunchbox LX. The players are tiny. You can still tell which one is you.', b: 'TAKE THE SEASON ANYWHERE. IT FITS IN A LUNCHBOX.' },
    { y: '00', p: 'hal', s: 'Ready for the Future', d: 'The box is silver now. The game is the same, but the menu beeps like a spaceship.', b: 'THE FUTURE OF FOOTBALL IS HERE. IT IS FOOTBALL.' },
    { y: '01', p: 'hal', s: 'Make Your Own Guy', d: 'You can make your own player now. He looks like everybody else on the team, and he plays like them too.', b: 'MAKE A PLAYER. HE WILL LOOK LIKE A PLAYER.' },
    { y: '02', p: 'hal', s: 'The Old Teams Are Back', d: "It comes with the old teams from '89. They play exactly the way they did in '89. So does everybody else.", b: 'THE OLD TEAMS ARE BACK. THEY NEVER LEFT.' },
    { y: '03', p: 'hal', s: 'The Last One', d: "The box says this is the last one. There is an order form for '04 inside the box.", b: 'THE LAST SCRIMMAGE SEASON. SEE YOU NEXT YEAR.' }
  ].map(function (e) {
    return { id: PX + 'y' + e.y, y: e.y, kind: 'game', g: 'sports', p: e.p, base: DIME, t: T.series + " '" + e.y + ': ' + e.s, d: e.d, b: e.b };
  });
  var BY = {}; ITEMS.forEach(function (e) { BY[e.y] = e; });

  // ---------- the three want list entries (NP.GOALS_POOL format) ----------
  // They use the game's own 'buy' type (f.dlc plus an offer tag only this pack passes), not type 'dlc': with Holiday
  // Rush on first, its goalFeasible and goalTick hooks answer false for every entry that is not theirs, and dlcFirst
  // stops at the first answer, so a 'dlc' entry here would never be asked. This pack picks them (goalPick, with its own
  // check below) and ticks them (api.goalTick('buy', item, { offer: 'd2dime' | 'd2drop' | 'd2run5' })).
  var GOALS = [
    { id: 'd2_w01', name: 'Shoebox Shopper', label: 'Buy 2 league games from the dime box', type: 'buy', f: { dlc: ID, offer: 'd2dime' }, n: 2, d: 'easy', reward: 'Roll of Dimes (Never Opened)' },
    { id: 'd2_w02', name: 'Five Years Straight', label: 'Get 5 league years in a row on your shelf', type: 'buy', f: { dlc: ID, offer: 'd2run5' }, n: 1, d: 'mid', reward: 'Painted Yard Marker Bookend' },
    { id: 'd2_w03', name: 'Out of the Shoebox', label: 'Find a league game somewhere other than the Cul-de-sac Sale', type: 'buy', f: { dlc: ID, offer: 'd2drop' }, n: 1, d: 'mid', reward: 'Shoebox Lid That Says 10' + CENT + ' Each' }
  ];

  // ---------- helpers ----------
  function rng(api, tag) { var S = api.state(); return api.mulberry32(api.hash(ID + '|' + (S ? S.seed : '') + '|' + tag)); }
  function cents(n) { return Math.round(n) * 10 + CENT; }   // n dimes -> "30¢"
  function yearOf(id) { var m = /^d2_y(\d\d)$/.exec(String(id || '')); return m && BY[m[1]] ? m[1] : null; }
  function q(y) { return "'" + y; }
  function isLeague(b) { return !!(b && yearOf(b.id)); }
  function seasonOn(api) { var S = api.state(); return !!(S && S.season && api.season()); }
  // the pack's part of the season save: SEASON.dlc.dlc2 = { paid: { year: week }, runs: { 5: week, 10: week }, badge: week, pts }
  function rec(api) {
    var se = api.season(); if (!se) return null;
    if (!se.dlc || typeof se.dlc !== 'object' || Array.isArray(se.dlc)) se.dlc = {};
    var r = se.dlc[ID];
    if (!r || typeof r !== 'object' || Array.isArray(r)) r = se.dlc[ID] = {};
    if (!r.paid || typeof r.paid !== 'object') r.paid = {};
    if (!r.runs || typeof r.runs !== 'object') r.runs = {};
    if (typeof r.pts !== 'number' || !isFinite(r.pts)) r.pts = 0;
    return r;
  }
  function peek(se) { return se && se.dlc && typeof se.dlc === 'object' && se.dlc[ID] && typeof se.dlc[ID] === 'object' ? se.dlc[ID] : null; }
  // the years you have: on the season shelf, plus (during a Saturday) in today's bag
  function haveOf(se, bag) {
    var H = {};
    if (se && Array.isArray(se.shelf)) se.shelf.forEach(function (b) { var y = b && yearOf(b.id); if (y) H[y] = 1; });
    (bag || []).forEach(function (b) { var y = b && yearOf(b.id); if (y) H[y] = 1; });
    return H;
  }
  function have(api) { var S = api.state(); return haveOf(api.season(), S && S.season ? S.bag : []); }
  function count(H) { return YEARS.filter(function (y) { return H[y]; }).length; }
  function longest(H) { var best = 0, run = 0; YEARS.forEach(function (y) { run = H[y] ? run + 1 : 0; if (run > best) best = run; }); return best; }
  function avail(s) { return s && s.d2 && s.d2.box ? s.d2.box.filter(function (it) { return it.state === 'avail'; }) : []; }
  function open(s) { return !!(s && s.d2 && (!s.d2.drop || s.type !== 'yard' || s.dug)); } // a yard's box is under the back boxes
  function dropStop(S) { return S && S.day && S.day.d2 && S.day.d2.drop ? S.day.stops.filter(function (x) { return x.id === S.day.d2.drop; })[0] || null : null; }
  function sportsStop(S) { return S && S.day && S.day.d2 && S.day.d2.sports ? S.day.stops.filter(function (x) { return x.id === S.day.d2.sports; })[0] || null : null; }
  function condName(c) { return c === 'cib' ? 'Complete in box' : 'Loose'; }
  function pickW(r, list, wf) {
    var tot = 0, w = list.map(function (x) { var v = wf(x); tot += v; return v; });
    var x = r() * tot;
    for (var i = 0; i < list.length - 1; i++) { x -= w[i]; if (x < 0) return i; }
    return list.length - 1;
  }
  // which years go in the box: no repeats, weighted toward years you do not have yet; the misprint is rarer
  function draw(r, n, H, week, season, wNew) {
    var pool = YEARS.filter(function (y) { return !(season && y === RARE && week < RARE_FROM); }), out = [];
    while (out.length < n && pool.length) {
      var i = pickW(r, pool, function (y) { return (season && H[y] ? W_HAVE : wNew) * (y === RARE ? W_RARE : 1); });
      out.push(pool[i]); pool.splice(i, 1);
    }
    return out.sort(function (a, b) { return YEARS.indexOf(a) - YEARS.indexOf(b); });
  }
  // one league game, in the shape makeItem gives a sports game, built with this pack's numbers (no base uid used)
  function make(r, y, uid, seller) {
    var e = BY[y];
    return { uid: uid, id: e.id, t: e.t, p: e.p, tier: 0, base: e.base, g: 'sports', kind: 'game', seller: seller || 'sports', sticker: false,
      cond: r() < 0.3 ? 'cib' : 'loose', flags: {}, inspected: false, checked: false, state: 'avail', line: '', ask: DIME, minFrac: 1, tell: false,
      dlc: ID, dd: e.d, db: e.b, dtag: 'd2', dlabel: T.tag, d2y: y };
  }

  // ---------- the dime tab ----------
  // One tab for the run. In a season it lives in the season save (SEASON.dlc.dlc2.tab) and carries over; in a one
  // day run it lives on the run (S.d2tab). It is always 0 to 9 dimes: the tenth dime is paid with $1 on the spot.
  function getTab(api) {
    var S = api.state(); if (!S) return 0;
    var n = seasonOn(api) ? rec(api).tab : S.d2tab;
    return typeof n === 'number' && isFinite(n) && n > 0 ? Math.floor(n) % TABMAX : 0;
  }
  function setTab(api, n) { var S = api.state(); if (!S) return; if (seasonOn(api)) rec(api).tab = n; else S.d2tab = n; }
  // adds dimes to the tab; every time it reaches 10 dimes, $1 comes out of your cash. Returns the dollars taken.
  function addDimes(api, k) {
    var S = api.state(), n = getTab(api) + k, paid = 0;
    while (n >= TABMAX && S.cash >= 1) { n -= TABMAX; S.cash -= 1; paid++; }
    setTab(api, n % TABMAX);
    return paid;
  }
  // a save from the first build of this pack kept the tab on the stop (s.d2.tab): it moves onto the one tab
  function migrate(api) {
    var S = api.state(); if (!S || !S.day || !S.day.d2) return;
    S.day.stops.forEach(function (s) { if (s.d2 && s.d2.tab > 0) { var k = Math.floor(s.d2.tab); s.d2.tab = 0; addDimes(api, k); } });
  }
  // the tab is closed when the league closes its books: the Expo Saturday in a season (Saturday 12, then each Expo
  // in Endless), or the end of a one day run
  function closesToday(api) { var S = api.state(); return !!S && (!seasonOn(api) || api.expoWeek(S.week)); }
  // closes the tab: dimes left on it cost $1 (or he waves them off if you are out of cash). Returns the line.
  function settle(api) {
    var S = api.state(); migrate(api);
    var n = getTab(api), line;
    if (!S || !(n > 0)) return '';
    setTab(api, 0);
    if (S.cash >= 1) { S.cash -= 1; line = (seasonOn(api) ? T.leaveEnd : T.leave).replace('{n}', cents(n)); api.track('dlc2_tab_close'); }
    else { line = T.waive; api.track('dlc2_tab_waived'); }
    S.d2note = line;
    return line;
  }

  // ---------- league games are not for resale ----------
  // The base sell list asks sellQ(item, buyer) for an offer and keeps it in S.sq[stop|buyer|uid]. A league game gets
  // a "not buying it" answer there, for every kind of buyer, at the stop you are at: the sell list stamps it NOT BUYING
  // IT, with no Sell, Trade in or Ask for more button, and the game's sell action refuses it. Bag items only live for
  // the day, so this covers every stop, the swap meet tables included.
  function noSell(api) {
    var S = api.state(); if (!S || !S.stop || !Array.isArray(S.bag) || !NP.BUYERS) return;
    if (!S.sq || typeof S.sq !== 'object') return;
    S.bag.forEach(function (b) {
      if (!isLeague(b)) return;
      Object.keys(NP.BUYERS).forEach(function (bt) {
        var k = S.stop.id + '|' + bt + '|' + b.uid, o = S.sq[k];
        if (!o || o.state !== 'mad' || !o.d2) S.sq[k] = { offer: 0, max: 0, state: 'mad', line: T.noSell, d2: true, tradein: true };
      });
    });
  }

  // ---------- buying a league game (takeItem is not in DLC_API, so this copies its shape) ----------
  function buy(api, uid) {
    var S = api.state(), s = S && S.stop;
    if (!s || S.screen !== 'stop' || !open(s)) return;
    var it = avail(s).filter(function (x) { return x.uid === uid; })[0];
    if (!it) return;
    if (S.cash < 1) { S.toast = T.broke; api.render(); return; }
    var D = s.d2;
    migrate(api);
    api.actCost(2);
    D.n = (D.n || 0) + 1;
    var line = T.took.replace('{y}', it.d2y);
    if (addDimes(api, 1)) { D.dollars = (D.dollars || 0) + 1; line += T.dollar; api.track('dlc2_tab_dollar'); }
    // what takeItem does for a normal buy: paid, state, the bag copy (paid, stopType, boughtAt), the duplicate count
    it.paid = DIME; it.state = 'sold'; it.line = line;
    var b = JSON.parse(JSON.stringify(it)); b.paid = DIME; b.stopType = s.type; b.boughtAt = s.id;
    if (S.day.owned[b.id] || S.bag.some(function (x) { return x.id === b.id; })) S.ev.dupBuys++;
    S.bag.push(b);
    noSell(api);
    S.d2got = (S.d2got || 0) + 1;
    api.sfx('coin');
    api.track(D.drop ? 'dlc2_drop_buy' : 'dlc2_box_buy');
    // the want list: like any buy (a league game is a sports game), with this pack's own offer tag
    api.goalTick('buy', it, { price: DIME, offer: D.drop ? 'd2drop' : 'd2dime' });
    league(api, it);
    api.saveSoon();
    if (!api.checkSundown()) api.render();
  }
  // the league: points for each new year, the runs of 5 and 10, and Complete the Run (a season only)
  function league(api, it) {
    if (!seasonOn(api)) return;
    var S = api.state(), R = rec(api), H = have(api), pts = 0, chips = [], fresh = [];
    YEARS.forEach(function (y) { if (H[y] && !R.paid[y]) { R.paid[y] = S.week; pts += PTS.year; fresh.push(y); } });
    var n = count(H), run = longest(H);
    fresh.forEach(function (y) { chips.push(T.chipNew.replace('{y}', y).replace('{n}', n)); });
    if (run >= 5 && !R.runs[5]) { R.runs[5] = S.week; pts += PTS.run5; chips.push(T.chipRun5); api.track('dlc2_run5'); }
    if (run >= 10 && !R.runs[10]) { R.runs[10] = S.week; pts += PTS.run10; chips.push(T.chipRun10); api.track('dlc2_run10'); }
    // the want list's run of five ticks on the buy that makes it (only when that entry is the one up)
    if (run >= 5 && S.goal && S.goal.id === 'd2_w02') api.goalTick('buy', it, { price: DIME, offer: 'd2run5' });
    var done = n >= YEARS.length && !R.badge;
    if (done) { R.badge = S.week; pts += PTS.done; S.d2done = true; api.track('dlc2_complete'); api.track('dlc2_complete_w' + Math.min(S.week, 30)); }
    if (pts) { R.pts += pts; api.bonus(T.name, pts); }
    chips.forEach(function (c) { api.celebrate('good', c); });
    if (done) { api.celebrate('big', T.chipDone); api.confetti(40); api.sfx('fanfare'); }
  }

  // ---------- the standings (one plain line on the weekday screen) ----------
  // the two neighbors and the Sports Bin Guy score a few points a week, from this pack's own numbers
  function table(api, se, w) {
    var R = peek(se) || {}, rows = [[T.you, R.pts || 0, 0], [T.guy, 0, 1]].concat(T.nb.map(function (x, i) { return [x[0], 0, 2 + i]; }));
    for (var k = 1; k < w; k++) {
      var r = api.mulberry32(api.hash(ID + '|' + se.id + '|standings|' + k));
      rows[1][1] += 1 + Math.floor(r() * 3);
      rows[2][1] += Math.floor(r() * 5);
      rows[3][1] += Math.floor(r() * 4);
    }
    rows.sort(function (a, b) { return b[1] - a[1] || a[2] - b[2]; });
    return rows.map(function (x) { return x[0] + ' ' + x[1]; }).join(' · ');
  }

  // ---------- the league card, the dime box and the drop off box ----------
  function boxHTML(api, s, H, season) {
    var S = api.state(), esc = api.esc, h = '<div class="items d2-box">';
    s.d2.box.forEach(function (it) {
      var sold = it.state !== 'avail', pl = NP.PLATFORMS[it.p] || {};
      h += '<div class="item d2-it' + (sold ? ' sold' : '') + '"><div class="artbox" data-d2art="' + esc(it.uid) + '"></div><div class="info">' +
        '<div class="it-t">' + esc(it.t) + '</div>' +
        '<div class="it-d"><span class="tag t-d2">' + esc(T.tag) + '</span> ' + esc(it.dd) + '</div>' +
        '<div class="it-p">' + esc(pl.name || '') + ' · <span class="pill ' + esc(it.cond) + '">' + esc(condName(it.cond)) + '</span></div>' +
        '<div class="it-a">10' + CENT + '</div>';
      if (!sold && season && H[it.d2y]) h += '<div class="note warn">' + esc(T.onShelf) + '</div>';
      if (it.line) h += '<div class="bubble">' + esc(it.line) + '</div>';
      if (sold) h += '<div class="stamp">' + esc(T.inBag) + '</div>';
      else h += '<div class="btns"><button class="offer full" data-act="dlc" data-dlc="' + ID + '" data-v="buy:' + esc(it.uid) + '"' + (S.cash < 1 ? ' disabled' : '') + '>' + esc(T.take) + '</button></div>';
      h += '</div></div>';
    });
    h += '</div>';
    if (!avail(s).length) h += '<div class="note">' + esc(s.d2.drop ? T.dropFound : T.empty) + '</div>';
    if (avail(s).length && S.cash < 1) h += '<div class="note warn">' + esc(T.broke) + '</div>';
    h += '<div class="d2-tab" aria-live="polite">' + esc((season ? T.tab : T.tabOne).replace('{c}', cents(getTab(api)))) + '</div>';
    return h;
  }
  function runHTML(api, H) {
    var esc = api.esc, se = api.season(), R = peek(se) || {}, shelf = haveOf(se, []);
    var h = '<div class="d2-run">' + esc(T.run.replace('{n}', count(H))) + '</div><div class="d2-yrs" role="list" aria-label="' + esc(T.yrsLabel) + '">';
    YEARS.forEach(function (y) {
      var cls = shelf[y] ? ' on' : H[y] ? ' bag' : '';
      h += '<span class="d2-yr' + cls + '" role="listitem">' + esc(q(y)) + (H[y] ? ' ✓' : '') + '</span>';
    });
    h += '</div>';
    if (R.badge) h += '<div class="d2-badge">★ ' + esc(T.badge) + '</div><div class="note">' + esc(T.badgeCard) + '</div>';
    return h;
  }
  function leagueCard(api, s) {
    var S = api.state(), esc = api.esc, season = seasonOn(api), H = season ? have(api) : {};
    var h = '<div class="story d2-league"><div class="story-h">' + esc(T.cardH) + '</div><div class="story-t">' + esc(T.card) + '</div>' +
      '<div class="bubble">The Sports Bin Guy: "' + esc(T.hi[(s.d2.hi || 0) % T.hi.length]) + '"</div>';
    h += season ? runHTML(api, H) : '<div class="note">' + esc(T.oneDay) + '</div>';
    h += '<div class="story-h d2-boxh">' + esc(T.boxH) + '</div><div class="note">' + esc(T.firm) + '</div>';
    // Gary never comes to the sports stop, and his rule does not change. On a day he is out, he tries anyway.
    if ((S.day.rivals || []).indexOf('gary') >= 0) h += '<div class="bubble d2-gary">' + esc(T.gary) + '</div>';
    return h + boxHTML(api, s, H, season) + '</div>';
  }
  function dropCard(api, s) {
    var esc = api.esc, season = seasonOn(api), H = season ? have(api) : {};
    var h = '<div class="story d2-league d2-drop"><div class="story-h">' + esc(T.dropH) + '</div>';
    if (!open(s)) return h + '<div class="story-t">' + esc(T.dropDig) + '</div></div>';
    h += '<div class="story-t">' + esc(s.type === 'yard' ? T.dropFound : T.drop) + '</div><div class="note">' + esc(T.firm) + '</div>';
    if (season) h += runHTML(api, H);
    return h + boxHTML(api, s, H, season) + '</div>';
  }

  // ---------- the want list ----------
  function feasible(api, g) {
    var S = api.state(); if (!S || !S.day || !S.day.d2) return false;
    if (api.endT() - S.time < 45 || S.cash < 1) return false;
    var s = S.stop, atBox = !!(s && s.d2 && !s.d2.drop && S.screen === 'stop');
    if (g.id === 'd2_w01') return atBox && avail(s).length >= 2;
    if (g.id === 'd2_w02') {
      if (!atBox || !seasonOn(api)) return false;
      var H = have(api); if (longest(H) >= 5) return false;
      return avail(s).some(function (it) { var H2 = {}; Object.keys(H).forEach(function (k) { H2[k] = 1; }); H2[it.d2y] = 1; return longest(H2) >= 5; });
    }
    if (g.id === 'd2_w03') {
      var st = dropStop(S); if (!st || !avail(st).length) return false;
      if (st === S.stop) return true;
      return !st.visited && S.time + api.costOf(st) < api.endT() - 30;
    }
    return false;
  }

  // ---------- pictures: the football picture, with the year in the corner ('59 on the misprint, in red) ----------
  function drawIcon(api, ctx, it, x, y, k) {
    var yy = yearOf(it && it.id); if (!yy || !NP.drawIcon || !NP.ICONS || !NP.ICONS.fb) return false;
    k = k || 1;
    NP.drawIcon(ctx, 'fb', x, y, k);
    var mis = yy === RARE, txt = mis ? '59' : yy;
    ctx.fillStyle = '#0b1022'; ctx.fillRect(x + 8 * k, y + 10 * k, 8 * k, 6 * k);
    if (NP.pixelText) NP.pixelText(ctx, txt, x + 9 * k, y + 11 * k, k, mis ? '#ff5a5a' : '#ffcc33');
    return true;
  }

  // ---------- the pack ----------
  NP.DLC[ID] = {
    id: ID, name: T.name, prefix: PX,
    data: {
      text: T, items: ITEMS, goals: GOALS,
      tags: { d2: T.tag }, tagColors: { d2: ['#2d8a3e', '#ffcc33'] }, tagShort: { d2: '10' + CENT },
      league: 'Dime Box Dynasty, sponsored by Storage Beers (the Sports Bin Guy, at the Cul-de-sac Sale on Javelina Ct)',
      neighbors: T.nb.map(function (x) { return x[1]; })
    },
    css: '.tag.t-d2{background:#2d8a3e;color:#ffcc33}' +
      '.story.d2-league{border-left-color:#2d8a3e}' +
      '.d2-boxh{margin-top:10px}' +
      '.d2-run{font-weight:bold;color:#9be29b;margin:6px 0 2px;font-size:calc(14px * var(--tsz, 1))}' +
      '.d2-yrs{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 6px}' +
      '.d2-yr{display:inline-block;min-width:3.2em;text-align:center;padding:1px 3px;font-weight:bold;font-size:calc(12px * var(--tsz, 1));border:2px solid #3a4d82;color:#8fa0c8;background:#0b1022}' +
      '.d2-yr.on{background:#2d8a3e;border-color:#ffcc33;color:#fff1d6}' +
      '.d2-yr.bag{background:#1f5e2b;border-color:#9be29b;border-style:dashed;color:#fff1d6}' +
      '.d2-badge{display:inline-block;background:#ffcc33;color:#0b1022;font-weight:bold;padding:2px 8px;margin:4px 0;border:2px solid #0b1022;font-size:calc(14px * var(--tsz, 1))}' +
      '.d2-box{margin-top:8px}.d2-it .it-a{color:#ffcc33;font-weight:bold}' +
      '.d2-tab{font-weight:bold;color:#ffcc33;margin:8px 0 2px;font-size:calc(13px * var(--tsz, 1))}' +
      '.wk-d2{background:#1f5e2b;color:#fff1d6;font-weight:bold;padding:6px 10px;margin:8px 0}' +
      '.also.d2-res{color:#9be29b}.d2-resdone{color:#ffcc33;font-weight:bold;margin:6px 0}' +
      '.rc-d2 b{color:#9be29b}' +
      // the base screens print paid with money(), which shows a dime as $0; on the Home screen and in the sell list a
      // league game says "paid 10¢" instead (their bag ids start with d2)
      '.homescr .item:has([data-hart^="d2"]) .it-p,.sellrow[id^="sell-d2"] .it-p{font-size:0}' +
      '.homescr .item:has([data-hart^="d2"]) .it-p .pill,.sellrow[id^="sell-d2"] .it-p .pill{font-size:calc(12px * var(--tsz, 1))}' +
      '.homescr .item:has([data-hart^="d2"]) .it-p::after{content:" paid 10' + CENT + '";font-size:calc(12px * var(--tsz, 1))}' +
      '.sellrow[id^="sell-d2"] .it-p::after{content:" you paid 10' + CENT + '";font-size:calc(12px * var(--tsz, 1))}',
    hooks: {
      // once, at page load. There is no leave or sell hook, so this listens on the page before the game's own click
      // handler runs: it closes the dime tab before the haul is shelved (on the Expo Saturday, or at the end of a one
      // day run), and it makes sure a league game in the sell list is already marked "not buying it" before any sell.
      init: function (api) {
        document.addEventListener('click', function (e) {
          var el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
          if (!el || el.disabled) return;
          var a = el.getAttribute('data-act'), S = api.state();
          if (!S) return;
          if (a === 'sell' || a === 'askmore') {
            var uid = el.getAttribute('data-uid');
            if (S.bag && S.bag.some(function (b) { return b.uid === uid && isLeague(b); })) { noSell(api); setTimeout(function () { api.render(); }, 0); }
            return;
          }
          if (a === 'shelve' && closesToday(api)) settle(api); // the books close even on a Saturday with no dime box
        }, true);
      },
      act: function (api, v) {
        v = String(v || '');
        if (v.indexOf('buy:') === 0) buy(api, v.slice(4));
      },
      // the dime box at the sports stop (any full game day it is open), or, on a season Saturday he stays home,
      // now and then one league year in a yard sale dig pile or a thrift bin
      buildDay: function (api, day, info) {
        var se = info.season ? api.season() : null, week = info.week || 0;
        var r = api.mulberry32(api.hash(ID + '|' + info.seed + '|box'));
        var H = se ? haveOf(se, []) : {};
        var sp = day.stops.filter(function (x) { return x.type === 'sports'; })[0] || null, host = null;
        if (sp && api.openStop(sp)) {
          var n = 2 + (r() < 0.5 ? 1 : 0) + (day.theme && day.theme.id === 'football' ? 1 : 0);
          var ys = draw(r, n, H, week, !!se, W_NEW);
          sp.d2 = { box: ys.map(function (y, i) { return make(r, y, 'd2b' + i, 'sports'); }), n: 0, dollars: 0, hi: Math.floor(r() * T.hi.length) };
        } else if (se) {
          var dr = api.mulberry32(api.hash(ID + '|' + info.seed + '|drop'));
          if (dr() < DROP_P) {
            var hosts = day.stops.filter(function (x) { return api.openStop(x) && ((x.type === 'yard' && x.dig && x.dig.length) || x.type === 'thrift'); });
            if (hosts.length) {
              host = api.pick(dr, hosts);
              var y = draw(dr, 1, H, week, true, DROP_NEW)[0];
              host.d2 = { drop: true, box: [make(dr, y, 'd2d0', host.seller || 'friendly')], n: 0, dollars: 0 };
            }
          }
        }
        if (!sp && !host) return;
        day.d2 = { sports: sp ? sp.id : null, drop: host ? host.id : null };
        if (se) rec(api);
        api.track('dlc2_day_' + (info.season ? 'season' : info.free ? 'free' : 'daily') + (host ? '_drop' : ''));
      },
      routeCard: function (api) {
        var S = api.state(); if (!S || !S.day || !S.day.d2) return '';
        migrate(api);
        var sp = sportsStop(S), dp = dropStop(S), esc = api.esc;
        if (sp && !sp.visited && avail(sp).length) return '<div class="rc-theme rc-d2"><b>' + esc(T.name) + '.</b> ' + esc(T.route.replace('{n}', avail(sp).length)) + '</div>';
        if (dp && !dp.visited && avail(dp).length) return '<div class="rc-theme rc-d2"><b>' + esc(T.name) + '.</b> ' + esc(T.routeDrop.replace('{stop}', dp.name)) + '</div>';
        return '';
      },
      weekdays: function (api, w) {
        var se = api.season(); if (!se) return '';
        var R = peek(se), n = count(haveOf(se, []));
        var line = (R && R.badge ? T.weekDone : T.week).replace('{table}', table(api, se, w)).replace('{n}', n);
        return '<div class="wk-d2">' + (R && R.badge ? '★ ' : '') + api.esc(line) + '</div>';
      },
      arrive: function (api, s) {
        var S = api.state(); if (!S || !S.day || !S.day.d2) return;
        migrate(api); noSell(api);
        if (s && s.d2) api.track(s.d2.drop ? 'dlc2_drop_arrive' : 'dlc2_box_arrive');
      },
      // stopHTML runs before the base sell list in the same render, so the "not buying it" answers are in place first
      stopHTML: function (api, s) {
        noSell(api);
        if (!s || !s.d2 || !s.d2.box) return '';
        return s.d2.drop ? dropCard(api, s) : leagueCard(api, s);
      },
      afterStop: function (api, s) {
        if (!s || !s.d2 || !s.d2.box || !NP.makeArt) return;
        document.querySelectorAll('[data-d2art]').forEach(function (el) {
          if (el.firstChild) return;
          var it = s.d2.box.filter(function (x) { return x.uid === el.getAttribute('data-d2art'); })[0];
          if (it) el.appendChild(NP.makeArt(it, 3));
        });
      },
      results: function (api) {
        var S = api.state(); if (!S) return '';
        var esc = api.esc;
        // a safety net: a tab that should have closed today and did not is closed now, and the season keeps the cash
        if (closesToday(api) && getTab(api) > 0) { settle(api); if (S.season && api.season()) { api.season().cash = S.cash; api.saveSoon(); } }
        var mine = S.bag.filter(function (b) { return yearOf(b.id); });
        var left = S.season && api.season() && !closesToday(api) ? getTab(api) : 0;
        if (!mine.length && !S.d2note && !left) return '';
        var g = mine.length + ' league game' + (mine.length === 1 ? '' : 's'), h = '';
        if (S.season && api.season()) {
          var se = api.season(), R = peek(se) || {}, H = haveOf(se, []);
          var added = YEARS.filter(function (y) { return R.paid && R.paid[y] === S.week && mine.some(function (b) { return yearOf(b.id) === y; }); });
          if (mine.length) h += '<div class="also d2-res">' + esc(added.length ? T.res.replace('{list}', added.map(q).join(', ')).replace('{n}', count(H)) : T.resNone.replace('{g}', g).replace('{n}', count(H))) + '</div>';
          if (R.badge === S.week) h += '<div class="d2-resdone">★ ' + esc(T.resDone) + '</div>';
          else if (R.badge) h += '<div class="also d2-res">★ ' + esc(T.resBadge.replace('{w}', R.badge)) + '</div>';
        } else if (mine.length) h += '<div class="also d2-res">' + esc(T.resOne.replace('{g}', g)) + '</div>';
        if (S.d2note) h += '<div class="also d2-res">' + esc(S.d2note) + '</div>';
        if (left) h += '<div class="also d2-res">' + esc(T.resTab.replace('{c}', cents(left))) + '</div>';
        return h;
      },
      // the want list: at the dime box, one of its entries now and then; on a drop off day, the drop off one
      goalPick: function (api, def, ctx) {
        var S = api.state(); if (!S || S.goal || !S.day || !S.day.d2) return undefined;
        if (def && /^d\d+_/.test(def.id)) return undefined; // another pack's pick stands
        if (S.day.d1) return undefined;                     // a Holiday Rush Saturday keeps its own want list
        var hist = S.goalHist || [], recent = (ctx && ctx.recent) || [];
        var cands = GOALS.filter(function (g) { return hist.indexOf(g.id) < 0 && recent.indexOf(g.id) < 0 && feasible(api, g); });
        if (!cands.length) return undefined;
        var r = rng(api, 'goal|' + S.history.length + '|' + (S.goalsDone || []).length + '|' + hist.length);
        var by = function (id) { return cands.filter(function (g) { return g.id === id; })[0]; };
        if (by('d2_w02') && r() < 0.6) return by('d2_w02');
        if (by('d2_w01') && r() < 0.3) return by('d2_w01');
        if (by('d2_w03') && r() < 0.5) return by('d2_w03');
        return undefined;
      },
      // these entries are type 'buy', so the game never asks these two; they answer for this pack's ids only
      goalFeasible: function (api, def) { return def && /^d2_/.test(def.id) ? feasible(api, def) : undefined; },
      goalTick: function () { return undefined; },
      iconKey: function (api, it) { return yearOf(it && it.id) ? ID + ':fb' + yearOf(it.id) : undefined; },
      drawIcon: drawIcon
    },
    // for tests and tools: pure helpers and the pack's own buttons, no hidden state
    util: { YEARS: YEARS, RARE: RARE, RARE_FROM: RARE_FROM, PTS: PTS, longest: longest, count: count, haveOf: haveOf, draw: draw,
      settle: settle, tab: getTab, noSell: noSell, buy: buy, feasible: feasible, table: table }
  };
})();
