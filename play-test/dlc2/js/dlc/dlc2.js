// Nostalgia Pro DLC 2: Penny Bin League. Full game only (never the demo).
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
    name: 'Penny Bin League', series: 'Scrimmage Season', tag: 'Worth a Dime',
    cardH: 'The Penny Bin League',
    card: "The Sports Bin Guy runs a league out of a shoebox: every year of Scrimmage Season, '89 to '03, 10" + CENT + ' each, because nobody else wants them. Get all 15 years on your shelf this season and you complete the run.',
    hi: ['Penny Bin League is open. Every year of Scrimmage Season, a dime each. Nobody else wants them, so they are ours.',
      'I keep the tab. You keep the games. That is the whole league.',
      "You have to see '93. It rains in one stadium. The players do not even notice. It is beautiful.",
      "Same game every year? Sure. That is what makes it a season."],
    oneDay: 'This is a one day run. The dime box is open, but league standings and the set only count in a season.',
    boxH: 'The dime box',
    firm: 'League games are 10' + CENT + ' and they are not haggled. "It is a dime. It has always been a dime."',
    empty: 'The dime box is empty. "That is the league for today. See you next Saturday."',
    tab: 'Your dime tab: {c}. Every 10 dimes, $1 comes out of your cash. The tab carries over from Saturday to Saturday. Dimes still on it on Expo Saturday cost $1. He does not make change.',
    tabOne: 'Your dime tab: {c}. Every 10 dimes, $1 comes out of your cash. Dimes still on it at the end of the day cost $1. He does not make change.',
    noSell: 'That is a Penny Bin League game. Nobody buys those back, not even for a dime.',
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
    drop: 'The Sports Bin Guy stayed home today, but he dropped off a box here this morning. The lid says PENNY BIN LEAGUE · 10' + CENT + ' EACH · I DO NOT MAKE CHANGE.',
    dropDig: 'Somebody says the football bin guy dropped off a shoebox in the back boxes this morning. Dig through the back boxes to find it.',
    dropFound: 'Under the back boxes: a shoebox from the Cul-de-sac Sale. The lid says PENNY BIN LEAGUE · 10' + CENT + ' EACH · I DO NOT MAKE CHANGE.',
    chipNew: "Penny Bin League: '{y} is new. {n} of 15.",
    chipRun5: 'Five league years in a row!',
    chipRun10: 'Ten league years in a row!',
    chipDone: 'COMPLETE THE RUN! All 15 years of Scrimmage Season.',
    route: 'The Cul-de-sac Sale has the dime box today: {n} league games at 10' + CENT + ' each.',
    routeDrop: 'The Sports Bin Guy stayed home, but he dropped off a league game at {stop}.',
    res: 'Penny Bin League · today you added {list}. Your run: {n} of 15 years.',
    resNone: 'Penny Bin League · {g} today, no new years. Your run: {n} of 15 years.',
    resOne: 'Penny Bin League · {g} today. In a season they would count toward the run.',
    resDone: "Complete the Run. All 15 years of Scrimmage Season, '89 to '03, on one shelf. The Sports Bin Guy took his hat off. May your shelf never be full.",
    resBadge: 'Complete the Run badge: earned on Saturday {w} this season.',
    week: 'Penny Bin League standings: {table}. Your run: {n} of 15 years.',
    weekDone: 'Penny Bin League standings: {table}. You have the Complete the Run badge.',
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

  // ---------- the Storage Beers shoutout: a billboard on the town map and a spot you can pull into ----------
  // A real podcast the game credits (Storage Beers Retro Arcade, @storagebeerspod on X). Their dream: a row of storage
  // units turned into a bar and arcade, where every roll up door opens on something good. It is pure scenery: pulling
  // in costs no time, no cash and no score, never rolls a random number and never writes to a save, so the day plays
  // exactly the same with or without it. It shows on the map screen of every full game day while this pack is on.
  var SB = {
    name: 'Storage Beers Retro Arcade', sign1: 'STORAGE BEERS', sign2: 'RETRO ARCADE',
    credit: 'Shoutout to @storagebeerspod',
    card: 'A row of storage units turned into a bar and arcade. Every roll up door opens on something good.',
    go: 'Pull in and take a look', free: 'It is on the way. No time off the clock.',
    bbLabel: 'Billboard: Storage Beers Retro Arcade. Shoutout to @storagebeerspod. Tap to pull in.',
    intro: 'You pull into the lot. A neon sign, a row of storage doors, and a lot of happy noise behind them.',
    pickTouch: 'Tap a door to roll it up.', pickKeys: 'Tap a door to roll it up, or press 1 to 6.',
    unit: 'Unit {n}',
    doors: [
      { n: 'Pinball', line: 'Unit 1 rolls up on a row of pinball machines. Every one of them is lit up and humming.' },
      { n: 'Lounge', line: 'Unit 2 is the lounge. A big couch, a shag rug and a floor lamp. Nobody leaves this unit on time.' },
      { n: 'Golf sim', line: 'Unit 3 is a golf sim. You hit a real ball at a big screen, and the screen always says nice shot.' },
      { n: 'Mini golf', line: 'Unit 4 is mini golf on green carpet. The last hole goes right through a tiny roll up door.' },
      { n: 'Arcade', line: 'Unit 5 is wall to wall arcade cabinets, all on free play, with a stool in front of every one.' },
      { n: 'The bar', line: 'Unit 6 is the bar. Cold ones on tap, a row of stools and a coaster with every unit number on it.' }
    ],
    all: 'Every door is open. A whole row of storage units, and not one of them has a box in it.',
    back: 'Back to the map',
    canvas: 'A row of six storage unit doors under a neon sign that says Storage Beers Retro Arcade.'
  };
  var sbUI = null; // the open spot, if any

  // the scene: 240 x 132, drawn in code like everything else. Six doors, 32 wide, 6 apart.
  var SBW = 240, SBH = 132, DX0 = 9, DW = 32, DG = 6, DY0 = 66, DH = 43;
  function sbDoorX(i) { return DX0 + i * (DW + DG); }
  function sbInside(g, i, x, y, t) {
    var P = function (a, b, w, h, c) { g.fillStyle = c; g.fillRect(x + a, y + b, w, h); };
    var blink = Math.floor(t * 4) % 2;
    P(0, 0, DW, DH, '#141a33'); P(0, DH - 6, DW, 6, '#2a1d14');
    if (i === 0) { // pinball: two machines side by side, lights going
      [2, 17].forEach(function (mx, k) {
        P(mx, 7, 13, 9, '#0b1022'); P(mx + 1, 8, 11, 7, '#7e2553');
        P(mx + 3, 10, 2, 2, (blink + k) % 2 ? '#ffcc33' : '#e4343e'); P(mx + 8, 10, 2, 2, (blink + k) % 2 ? '#29d3e8' : '#ffcc33'); P(mx + 5, 13, 3, 1, '#fff1d6');
        P(mx + 5, 16, 3, 2, '#0b1022');
        P(mx, 18, 13, 9, '#0b1022'); P(mx + 1, 19, 11, 7, k ? '#2e3f9e' : '#e4343e'); P(mx + 1, 19, 11, 1, '#c9d1dc'); P(mx + 1, 22, 11, 1, '#ffcc33');
        P(mx + 5, 23, 3, 2, '#ffcc33');
        P(mx + 1, 27, 2, 11, '#0b1022'); P(mx + 10, 27, 2, 11, '#0b1022');
      });
    } else if (i === 1) { // the lounge: poster, couch, floor lamp, rug
      P(0, 0, DW, DH - 6, '#3a2a4a');
      P(4, 5, 10, 8, '#ffcc33'); P(5, 6, 8, 6, '#29d3e8'); P(7, 8, 4, 2, '#e4343e');
      P(25, 8, 7, 4, '#ffcc33'); P(26, 7, 5, 1, '#ffcc33'); P(28, 12, 1, 26, '#c9d1dc'); P(26, 37, 5, 1, '#c9d1dc');
      if (blink) P(24, 12, 9, 1, 'rgba(255,204,51,.35)');
      P(2, 21, 21, 7, '#5a2a6b'); P(1, 26, 23, 9, '#7a3d8f'); P(0, 24, 3, 11, '#5a2a6b'); P(22, 24, 3, 11, '#5a2a6b');
      P(8, 27, 1, 5, '#5a2a6b'); P(15, 27, 1, 5, '#5a2a6b'); P(3, 35, 2, 3, '#2a1d14'); P(20, 35, 2, 3, '#2a1d14');
      P(1, 39, 30, 3, '#c8323c'); P(3, 40, 26, 1, '#e4343e');
    } else if (i === 2) { // the golf sim: a big screen with a fairway, a mat, a ball on a tee, a club
      P(2, 3, 28, 22, '#0b1022'); P(3, 4, 26, 9, '#29adff'); P(3, 13, 26, 11, '#3f8f4a');
      for (var s = 0; s < 26; s += 6) P(3 + s, 13, 3, 11, '#57a061');
      P(5, 6, 4, 2, '#fff1d6'); P(19, 11, 9, 2, '#e6c690');
      P(22, 8, 1, 6, '#fff1d6'); P(23, 8, 3, 2, '#e4343e');
      P(5, 37, 22, 2, '#57a061'); P(15, 35, 2, 2, '#ffffff'); P(15, 37, 1, 1, '#c9d1dc');
      for (var c = 0; c < 12; c++) P(24 - Math.round(c / 2), 25 + c, 1, 1, '#c9d1dc');
      P(17, 37, 2, 1, '#8a90a0');
    } else if (i === 3) { // mini golf: carpet, bumpers, a little windmill, a flag, a ball
      P(0, 26, DW, 18, '#3f8f4a'); P(0, 26, DW, 1, '#8a5e36'); P(0, 43, DW, 1, '#8a5e36'); P(0, 26, 1, 18, '#8a5e36'); P(31, 26, 1, 18, '#8a5e36');
      for (var q = 2; q < 30; q += 4) P(q, 30 + (q % 8 ? 0 : 6), 1, 1, '#57a061');
      P(21, 14, 7, 16, '#e8dcc0'); P(20, 12, 9, 3, '#c8323c'); P(23, 26, 3, 4, '#2a1d14');
      if (blink) { P(18, 10, 13, 1, '#ffcc33'); P(24, 4, 1, 13, '#ffcc33'); } else { P(19, 6, 2, 2, '#ffcc33'); P(21, 8, 2, 2, '#ffcc33'); P(25, 12, 2, 2, '#ffcc33'); P(27, 14, 2, 2, '#ffcc33'); P(27, 6, 2, 2, '#ffcc33'); P(25, 8, 2, 2, '#ffcc33'); P(21, 12, 2, 2, '#ffcc33'); P(19, 14, 2, 2, '#ffcc33'); }
      P(6, 37, 3, 1, '#0b1022'); P(7, 29, 1, 8, '#fff1d6'); P(8, 29, 4, 3, '#e4343e'); P(14, 38, 2, 2, '#ffffff');
    } else if (i === 4) { // the arcade: two cabinets, screens going
      [3, 17].forEach(function (cx, k) {
        P(cx, 5, 12, 36, '#0b1022'); P(cx + 1, 6, 10, 34, '#1d2b53');
        P(cx + 1, 6, 10, 4, k ? '#ffcc33' : '#e4343e');
        P(cx + 2, 12, 8, 8, '#0b1022'); P(cx + 3 + ((Math.floor(t * 3) + k * 2) % 6), 14 + k * 2, 2, 2, k ? '#ff77a8' : '#29d3e8'); P(cx + 3, 18, 6, 1, '#3ddc84');
        P(cx, 21, 12, 4, '#3a4d82'); P(cx + 3, 21, 1, 2, '#e4343e'); P(cx + 6, 22, 2, 1, '#ffcc33'); P(cx + 9, 22, 2, 1, '#29d3e8');
        P(cx + 4, 30, 4, 3, '#ffcc33');
      });
    } else { // the bar: bottles on a shelf, taps, two cold ones, stools
      P(0, 0, DW, DH - 6, '#2a1d14');
      P(2, 6, 28, 1, '#8a5e36'); P(2, 13, 28, 1, '#8a5e36');
      ['#3f8f4a', '#ffa300', '#e4343e', '#29d3e8', '#ffcc33', '#7a3d8f', '#3f8f4a'].forEach(function (col, b) { P(3 + b * 4, 2, 2, 4, col); P(3 + b * 4, 9, 2, 4, b % 2 ? '#c9d1dc' : col); });
      P(4, 17, 24, 2, '#c9d1dc');
      ['#e4343e', '#ffcc33', '#29d3e8', '#3ddc84'].forEach(function (col, b) { P(6 + b * 6, 19, 2, 5, col); });
      P(9, 22, 3, 4, '#ffa300'); P(9, 21, 3, 1, '#fff1d6'); P(21, 22, 3, 4, '#ffa300'); P(21, 21, 3, 1, '#fff1d6');
      P(0, 26, DW, 2, '#b07a4a'); P(1, 28, 30, 8, '#5a3b22'); P(1, 31, 30, 1, '#8a5e36');
      [4, 14, 24].forEach(function (sx) { P(sx, 37, 5, 1, '#e4343e'); P(sx + 2, 38, 1, 5, '#c9d1dc'); P(sx + 1, 42, 3, 1, '#c9d1dc'); });
    }
  }
  function sbDraw(cv, st, t) {
    var g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    var P = function (x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); };
    ['#1d2b53', '#2a2f5e', '#4a2f6b', '#7e2553', '#c2433f', '#ff8a3d'].forEach(function (c, i) { P(0, i * 5, SBW, 5, c); });
    [[14, 3], [52, 6], [96, 2], [150, 5], [188, 2], [222, 7]].forEach(function (s) { P(s[0], s[1], 1, 1, '#fff1d6'); });
    for (var m = 0; m < SBW; m++) { var mh = 3 + Math.round(3 * Math.abs(Math.sin(m / 17)) + 2 * Math.abs(Math.sin(m / 7))); P(m, 30 - mh, 1, mh, '#3a2a4a'); }
    P(3, 26, SBW - 6, 4, '#59606e'); P(3, 30, SBW - 6, 80, '#c9b48a');
    for (var w = 6; w < SBW - 6; w += 11) P(w, 31, 1, 79, '#bba57a');
    // the neon sign
    P(28, 30, 184, 27, '#0b1022'); P(28, 30, 184, 1, '#ffcc33'); P(28, 56, 184, 1, '#ffcc33'); P(28, 30, 1, 27, '#ffcc33'); P(211, 30, 1, 27, '#ffcc33');
    if (NP.pixelText) {
      NP.pixelText(g, SB.sign1, 121, 33, 2, '#7a5a10', 'center'); NP.pixelText(g, SB.sign1, 120, 32, 2, '#ffcc33', 'center');
      var on = st.calm || Math.floor(t * 1.3) % 7 !== 3; // the second line flickers now and then, like real neon
      NP.pixelText(g, SB.sign2, 120, 47, 1, on ? '#29d3e8' : '#1f6f7a', 'center');
    }
    for (var i = 0; i < 6; i++) {
      var x = sbDoorX(i), d = st.doors[i];
      P(x + DW / 2 - 5, 57, 10, 8, '#0b1022');
      if (NP.pixelText) NP.pixelText(g, String(i + 1), x + DW / 2, 57, 1, d.p > 0 ? '#ffcc33' : '#fff1d6', 'center');
      P(x - 1, DY0 - 1, DW + 2, DH + 1, '#8a90a0');
      if (d.p > 0) { g.save(); g.beginPath(); g.rect(x, DY0, DW, DH); g.clip(); sbInside(g, i, x, DY0, st.calm ? 0 : t); g.restore(); }
      var dh = Math.round(DH * (1 - d.p));
      if (dh > 0) {
        P(x, DY0, DW, dh, '#2f6fb0');
        for (var y = DY0 + 2; y < DY0 + dh - 1; y += 3) { P(x, y, DW, 1, '#225a92'); P(x, y + 1, DW, 1, '#4a8bd0'); }
        P(x, DY0 + dh - 3, DW, 3, '#1d3f66'); P(x + DW / 2 - 3, DY0 + dh - 2, 6, 1, '#c9d1dc');
      }
      if (d.p > 0) P(x - 1, DY0 - 1, DW + 2, 3, '#1d3f66'); // the rolled up door, tucked under the header
      if (st.focus === i) { g.strokeStyle = '#ffcc33'; g.lineWidth = 1; g.strokeRect(x - 2.5, DY0 - 2.5, DW + 5, DH + 4); }
    }
    P(0, 110, SBW, 22, '#4a4d57'); P(0, 110, SBW, 3, '#8a90a0');
    for (var k = 0; k < 6; k++) P(sbDoorX(k) + DW + 2, 116, 2, 16, '#ffcc33');
  }
  function sbFocusable(box) { return Array.prototype.slice.call(box.querySelectorAll('button:not([disabled])')); }
  function sbOpen(api, from) {
    var S = api.state();
    if (sbUI || !S || S.screen !== 'map') return;
    var drv = document.querySelector('#townmap .tm-drive');
    if (drv && !drv.hidden) return; // on the road
    var esc = api.esc, coarse = false;
    try { coarse = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window); } catch (e) {}
    var ov = document.createElement('div'), btns = '';
    SB.doors.forEach(function (d, i) { btns += '<button type="button" class="d2sb-door" data-sbdoor="' + i + '" aria-pressed="false">' + esc(SB.unit.replace('{n}', i + 1)) + '</button>'; });
    ov.className = 'callov dlcov d2sb-ov';
    ov.innerHTML = '<div class="callbox d2sb-box" role="dialog" aria-modal="true" aria-labelledby="d2sb-h" aria-describedby="d2sb-t">' +
      '<div class="d2sb-h" id="d2sb-h">' + esc(SB.name) + '</div>' +
      '<div class="d2sb-cr">' + esc(SB.credit) + '</div>' +
      '<div class="story-t" id="d2sb-t">' + esc(SB.intro) + ' ' + esc(coarse ? SB.pickTouch : SB.pickKeys) + '</div>' +
      '<canvas class="d2sb-cv" width="' + SBW + '" height="' + SBH + '" role="img" aria-label="' + esc(SB.canvas) + '"></canvas>' +
      '<div class="d2sb-s" aria-live="polite"></div>' +
      '<div class="d2sb-doors">' + btns + '</div>' +
      '<div class="btns"><button type="button" class="d2sb-x" data-dlcx="1">' + esc(SB.back) + '</button></div></div>';
    document.body.appendChild(ov);
    var cv = ov.querySelector('.d2sb-cv'), msg = ov.querySelector('.d2sb-s'), box = ov.querySelector('.d2sb-box');
    var st = { calm: !!api.calm(), focus: -1, doors: SB.doors.map(function () { return { p: 0, open: false }; }), all: false };
    var raf = 0, live = true;
    function frame() {
      raf = 0;
      if (!live || !document.body.contains(cv)) { close(true); return; }
      var t = performance.now() / 1000, moving = false;
      st.doors.forEach(function (d) { if (d.open && d.p < 1) { d.p = st.calm ? 1 : Math.min(1, d.p + 0.06); moving = true; } });
      sbDraw(cv, st, t);
      if (!st.calm || moving) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }
    function openDoor(i) {
      var d = st.doors[i]; if (!d) return;
      var b = ov.querySelector('[data-sbdoor="' + i + '"]');
      msg.textContent = SB.doors[i].line;
      if (!d.open) {
        d.open = true; api.sfx(st.calm ? 'flip' : 'shake');
        if (b) { b.setAttribute('aria-pressed', 'true'); b.classList.add('on'); b.textContent = (i + 1) + ' · ' + SB.doors[i].n; }
        api.track('dlc2_sb_door' + (i + 1));
        if (!st.all && st.doors.every(function (x) { return x.open; })) {
          st.all = true; msg.textContent = SB.doors[i].line + ' ' + SB.all;
          setTimeout(function () { if (live) api.sfx('unlock'); }, st.calm ? 0 : 450);
          api.track('dlc2_sb_all');
        }
      }
      kick();
    }
    function close(silent) {
      if (!live) return;
      live = false; sbUI = null;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('keydown', key, true);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      if (silent) return;
      var back = document.querySelector(from === 'map' ? '#townmap .d2sb-bb' : '.d2sb-go');
      if (back && !back.disabled) { try { back.focus({ preventScroll: true }); } catch (e) { back.focus(); } }
    }
    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (/^[1-6]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); openDoor(+e.key - 1); var b = ov.querySelector('[data-sbdoor="' + (+e.key - 1) + '"]'); if (b) b.focus(); return; }
      if (e.key === 'Tab') { // keep the keyboard inside the spot while it is open
        var f = sbFocusable(box); if (!f.length) return;
        var at = f.indexOf(document.activeElement);
        if (e.shiftKey && at <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (at < 0 || at === f.length - 1)) { e.preventDefault(); f[0].focus(); }
      }
    }
    window.addEventListener('keydown', key, true);
    ov.addEventListener('click', function (e) {
      if (e.target === ov) { e.stopPropagation(); close(); return; } // a tap on the dark outside
      var b = e.target.closest && e.target.closest('[data-sbdoor],[data-dlcx]');
      if (b) { e.stopPropagation(); if (b.hasAttribute('data-dlcx')) close(); else openDoor(+b.getAttribute('data-sbdoor')); return; }
      if (e.target === cv) {
        var r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * SBW, y = (e.clientY - r.top) / r.height * SBH;
        if (y < 50) return;
        for (var i = 0; i < 6; i++) if (x >= sbDoorX(i) - DG / 2 && x < sbDoorX(i) + DW + DG / 2) { openDoor(i); return; }
      }
    });
    ov.addEventListener('focusin', function (e) { var b = e.target.closest && e.target.closest('[data-sbdoor]'); st.focus = b ? +b.getAttribute('data-sbdoor') : -1; kick(); });
    sbUI = { close: close, open: openDoor, st: st };
    frame();
    api.sfx('start');
    api.track('dlc2_sb_open_' + (from === 'map' ? 'map' : 'card'));
    var first = ov.querySelector('[data-sbdoor="0"]');
    try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
  }
  // the readable billboard, in the route card (a button the keyboard can reach)
  function sbCard(api) {
    var esc = api.esc;
    return '<div class="d2sb-card"><div class="d2sb-ch">' + esc(SB.sign1 + ' ' + SB.sign2) + '</div>' +
      '<div class="d2sb-ct">' + esc(SB.card) + '</div><div class="d2sb-cr">' + esc(SB.credit) + '</div>' +
      '<button type="button" class="d2sb-go" data-act="dlc" data-dlc="' + ID + '" data-v="sb">' + esc(SB.go) + '</button>' +
      '<div class="d2sb-free">' + esc(SB.free) + '</div></div>';
  }
  // the billboard on the town map itself: it stands on the open sand along the bottom edge of town, under the middle
  // street, where no stop, label or drive ever goes. It is laid over the map (the map is redrawn on every visit to the
  // map screen), so it is put back every time the route card is.
  function sbPlace() {
    var tin = document.querySelector('#townmap .tm-in'), cv = tin && tin.querySelector('.tm-cv');
    if (!tin || !cv || tin.querySelector('.d2sb-layer')) return;
    var W = cv.width || 400, H = cv.height || 224, cx = W >= 400 ? 200 : 190, bw = W >= 400 ? 160 : 140, top = 193, bh = 29;
    var lay = document.createElement('div');
    lay.className = 'd2sb-layer';
    lay.innerHTML = '<button type="button" class="d2sb-bb" data-act="dlc" data-dlc="' + ID + '" data-v="sbmap" aria-label="' + SB.bbLabel + '" style="left:' + ((cx - bw / 2) / W * 100).toFixed(2) + '%;top:' +
      (top / H * 100).toFixed(2) + '%;width:' + (bw / W * 100).toFixed(2) + '%;height:' + (bh / H * 100).toFixed(2) + '%">' +
      '<span class="d2sb-bt">' + SB.sign1 + ' ' + SB.sign2 + '</span><span class="d2sb-bd" aria-hidden="true"><i></i><i></i><i class="o"></i><i></i><i></i><i class="o2"></i><i></i><i></i></span>' +
      '<span class="d2sb-bc">' + SB.credit + '</span></button>';
    var labels = tin.querySelector('.tm-labels');
    tin.insertBefore(lay, labels || null); // under the stop names, so a long name is never hidden by it
  }

  // ---------- the pack ----------
  NP.DLC[ID] = {
    id: ID, name: T.name, prefix: PX,
    data: {
      text: T, items: ITEMS, goals: GOALS,
      tags: { d2: T.tag }, tagColors: { d2: ['#2d8a3e', '#ffcc33'] }, tagShort: { d2: '10' + CENT },
      league: 'The Penny Bin League (the Sports Bin Guy, at the Cul-de-sac Sale on Javelina Ct)',
      neighbors: T.nb.map(function (x) { return x[1]; }),
      shoutout: SB
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
      '.sellrow[id^="sell-d2"] .it-p::after{content:" you paid 10' + CENT + '";font-size:calc(12px * var(--tsz, 1))}' +
      // the Storage Beers billboard: on the map (sized to the map with cqw, like the stop names) and in the route card
      '.d2sb-layer{position:absolute;left:0;right:0;top:var(--tmpad,0);bottom:0;pointer-events:none}' +
      '.d2sb-bb{position:absolute;pointer-events:auto;box-sizing:border-box;margin:0;min-height:0;min-width:0;padding:.2cqw .5cqw;display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;overflow:hidden;' +
      'background:#2a1d0e;color:#fff1d6;border:.5cqw solid #ffcc33;border-radius:0;box-shadow:.6cqw .6cqw 0 rgba(11,16,34,.55);font:bold 2cqw/1 "Courier New",Courier,ui-monospace,monospace;letter-spacing:0;white-space:nowrap;cursor:pointer;touch-action:manipulation}' +
      '.d2sb-bb:active:not(:disabled){transform:translate(.3cqw,.3cqw);border-bottom-width:.5cqw}' +
      '.d2sb-bb:focus-visible{outline:3px solid #29d3e8;outline-offset:1px}' +
      '.d2sb-bt{color:#ffcc33;font-size:2.25cqw}.d2sb-bc{font-size:2cqw}' +
      '.d2sb-bd{display:flex;gap:.6cqw;height:1.25cqw}.d2sb-bd i{display:block;width:3.2cqw;height:100%;background:repeating-linear-gradient(180deg,#4a8bd0 0 .25cqw,#2f6fb0 .25cqw .5cqw)}' +
      '.d2sb-bd i.o{background:#29d3e8}.d2sb-bd i.o2{background:#ff77a8}' +
      '.d2sb-card{background:#2a1d0e;color:#fff1d6;border:3px double #ffcc33;padding:8px 10px;margin:8px 0 6px;text-align:center;transform:rotate(-.5deg);font-size:calc(13px * var(--tsz, 1))}' +
      '.d2sb-ch{color:#ffcc33;font-weight:bold;font-size:calc(15px * var(--tsz, 1));letter-spacing:1px}' +
      '.d2sb-ct{margin:4px 0}.d2sb-cr{color:#29d3e8;font-weight:bold;overflow-wrap:anywhere}' +
      'button.d2sb-go{display:block;width:100%;margin:6px 0 2px;white-space:normal}.d2sb-free{font-size:calc(12px * var(--tsz, 1));color:#d6dcf0}' +
      '.d2sb-ov{z-index:85}.d2sb-ov .callbox{max-height:92vh;max-height:92dvh;overflow-y:auto;border-color:#ffcc33}' +
      '.d2sb-h{color:#ffcc33;font-weight:bold;font-size:calc(18px * var(--tsz, 1));margin:2px 0}.d2sb-box .d2sb-cr{margin:0 0 6px}' +
      '.d2sb-cv{display:block;width:100%;height:auto;margin:8px 0 4px;image-rendering:pixelated;image-rendering:crisp-edges;border:3px solid #0b1022;cursor:pointer;touch-action:manipulation}' +
      '.d2sb-s{min-height:2.8em;margin:4px 0;color:#fff1d6}' +
      '.d2sb-doors{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.d2sb-doors button{margin:0;min-height:44px;padding:6px 4px;background:#2f6fb0;color:#fff1d6;border-bottom-color:#1d3f66;white-space:normal}' +
      '.d2sb-doors button.on{background:#ffcc33;color:#0b1022;border-bottom-color:#b08a1f}' +
      '.d2sb-doors button:focus-visible,.d2sb-x:focus-visible{outline:3px solid #29d3e8;outline-offset:1px}' +
      '.d2sb-box .btns button{width:100%;margin:8px 0 0}',
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
        else if (v === 'sb' || v === 'sbmap') sbOpen(api, v === 'sbmap' ? 'map' : 'card');
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
      // the league line (when the dime box or a drop is out today), then the Storage Beers billboard on every map screen
      routeCard: function (api) {
        var S = api.state(); if (!S || !S.day) return '';
        var h = '';
        if (S.day.d2) {
          migrate(api);
          var sp = sportsStop(S), dp = dropStop(S), esc = api.esc;
          if (sp && !sp.visited && avail(sp).length) h = '<div class="rc-theme rc-d2"><b>' + esc(T.name) + '.</b> ' + esc(T.route.replace('{n}', avail(sp).length)) + '</div>';
          else if (dp && !dp.visited && avail(dp).length) h = '<div class="rc-theme rc-d2"><b>' + esc(T.name) + '.</b> ' + esc(T.routeDrop.replace('{stop}', dp.name)) + '</div>';
        }
        if (S.screen === 'map') setTimeout(sbPlace, 0); // the map is mounted right after the route card is drawn
        return h + sbCard(api);
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
      settle: settle, tab: getTab, noSell: noSell, buy: buy, feasible: feasible, table: table,
      sb: { text: SB, open: function () { return sbUI; }, place: sbPlace } }
  };
})();
