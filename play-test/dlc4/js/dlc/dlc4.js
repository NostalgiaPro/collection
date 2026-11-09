// Nostalgia Pro DLC 4: Based on the Hit Movie. Full game only (never the demo).
// The record store (Music Store (Also Movies) (Also Games)) gets a licensed aisle: terrible tie-in games of Chet
// Brickwall's eight movies, their soundtrack tapes, and the movies themselves (the base items, with their base ids).
// A Chet Brickwall movie, any game of that movie and its tape make a triple set.
// Release: Sat Dec 19, 2026. There is no date gate: the pack works on any date as soon as it is on.
//
// Where it shows up:
//  * The licensed aisle comes with the record store, on any full game day the store is open (a season Saturday, a one
//    day run, a Holiday Rush Saturday, a Last Day). There is no pack Saturday in a season, so the pack never competes
//    with Holiday Rush, the Dime Box Dynasty box or the Last Day, and those days keep their own day name.
//  * On a season Saturday without the record store, about 1 in 3 times, one tie-in game or tape turns up at a yard sale,
//    a thrift store or a pawn shop (one a day at most), so sets stay reachable.
//  * The title entry BASED ON THE HIT MOVIE plays one Home by sundown day with the record store open all day.
//
// This file only registers itself. It never edits base data when it loads. Every random number here comes from this
// pack's own seeded generator ('dlc4|' + seed + '|...'), its items are built here (not with makeItem, so no base item
// number is used), and its hooks run last in newRun, so the base day is exactly what it was without it. The only
// things it adds to a day are the aisle (a section at the record store) and the one drop.
//
// Money: cash is whole dollars everywhere. Every price and discount here is rounded after any percentage, with a $1
// minimum. Nothing from this pack, and nothing bought in the licensed aisle, can be sold back: the base sell list keeps
// each owner's offer in S.sq, and this pack marks those things "not buying it" there for the stop you are at (the same
// way Dime Box Dynasty and the Last Day do).
// Score: every pack item is a game or a tape worth at least $2 loose, and the aisle never offers anything already on
// your shelf or anywhere else in town today, so no pack item can cost points.
var NP = window.NP || {};
window.NP = NP;
NP.DLC = NP.DLC || {};
(function () {
  'use strict';
  var ID = 'dlc4', PX = 'd4_', SEC = 'd4aisle';
  // The aisle: 2 or 3 tie-in games, 1 or 2 soundtrack tapes and 1 or 2 Chet movies (close to the 3, 2 and 1 or 2 asked). These
  // numbers were tuned with the set simulation (CHANGELOG_dlc4.md): with a flat 3 games and 2 tapes, a player who goes to
  // the record store every time it is open finished a median of 5 to 6 triple sets by Saturday 12, not 2 to 4.
  var N_GAMES = 3, N_TAPES = 2, G_LESS = 0.5, T_LESS = 0.7; // G_LESS / T_LESS: how often there is one fewer
  var TIER_W = [1, 1, 0.5, 0.25];               // rarer pieces come up less often, the way the base rolls media by tier
  var W_NEED = 1.25, W_NEED_DROP = 1.5;         // weight for a piece a set you started still needs
  var DROP_P = 1 / 3;                           // a season Saturday without the record store: how often the drop turns up
  var SET_PTS = 30;                             // one finished triple set (about one mid want list entry)
  var T_STORY = 2, CIB_P = 0.4;

  // ---------- every word the pack says (house style: plain words, no dashes, played straight) ----------
  var T = {
    name: 'Based on the Hit Movie', short: 'Hit Movie',
    menu: 'BASED ON THE HIT MOVIE', menuSmall: 'a Saturday at the licensed aisle',
    secAisle: 'The licensed aisle',
    boxH: 'Movie, game and tape',
    clerk: {
      snob: 'The licensed aisle. Movie games, movie tapes and the movies they came from. I do not recommend any of it. I have all of it at home, still in the plastic.',
      chill: 'That aisle is all movie stuff, man. The games are pretty bad. The tapes are actually good. Get the movie, a game of it and the tape, and you have the whole thing.'
    },
    setHow: 'A triple set is one Chet Brickwall movie, any game of that movie and that movie\'s soundtrack tape.',
    seasonCount: 'Triple sets this season: {n} of 8. Anything on your season shelf counts.',
    dayCount: 'Triple sets today: {n} of 8. On a one day run only what is in your bag today counts.',
    oneWhole: 'One whole set is in the aisle today.',
    picked: 'The licensed aisle is picked over today. Everything that came in this week is already on your shelf.',
    away: 'Everything for a {s} set is in the aisle today except the movie. The movie is at another stop in town today.',
    routeAway: 'The record store is open all day, and its licensed aisle has a game and a tape for one triple set. The movie that goes with them is at another stop in town today.',
    pM: 'MOVIE', pG: 'GAME', pT: 'TAPE', pDone: 'SET', have: 'have', need: 'need',
    late: 'It came out a year after the movie.',
    same: 'It came out the same week as the movie.',
    tag: 'Licensed', tagShort: 'Tie-in',
    noSell: 'Nobody buys licensed movie stuff back. Nobody bought it the first time.',
    route: 'The record store has its licensed aisle today: movie games, movie tapes and Chet Brickwall movies.',
    routeRun: 'The record store is open all day, and its licensed aisle has one whole triple set in it: a Chet Brickwall movie, a game of it and its soundtrack tape.',
    routeDrop: 'Something from the record store\'s licensed aisle turned up at {stop} today.',
    dropH: 'From the licensed aisle',
    drop: 'The record store dropped off a box of movie stuff here this morning. One thing in it still has the licensed aisle sticker on it.',
    storyH: 'Last summer\'s hit',
    story: '{g} sits right next to {m} in the aisle. The game box says THE HIT MOVIE OF LAST SUMMER in big gold letters. The game came out a year after the movie. By the time it did, the movie was already in the $1 bin.',
    storyBtn: 'Show the clerk both boxes (2 min)',
    storyOff: {
      snob: '"It was late then. It is late now," the clerk says. He takes {$} off the game.',
      chill: '"Ha. Last summer. That is a good one, man," the clerk says. He takes {$} off the game.'
    },
    storyPts: '"It is already a dollar," the clerk says. "That is as late as a price gets." You get {n} bonus points for noticing.',
    chipSet: 'TRIPLE SET! {s}: the movie, the game and the tape.',
    boxToday: 'TRIPLE SET! Finished today: {list}.',
    chipStory: 'Last summer\'s hit: {$} off the game.',
    bonusCat: 'Triple sets', storyCat: 'Last summer\'s hit',
    res: 'Based on the Hit Movie · a Saturday at the licensed aisle',
    resSets: 'Triple set finished today: {list}.',
    resSeason: 'Triple sets this season: {n} of 8.',
    resDay: 'Triple sets today: {n}. On a one day run only today\'s bag counts.',
    resAll: 'All eight triple sets in one season. Every Chet Brickwall movie, a game of it and its tape, on one shelf. May your shelf never be full.',
    resAllDone: 'All eight triple sets this season, finished on Saturday {w}.',
    week: 'Triple sets this season: {n} of 8.',
    weekHow: ' A set is a Chet Brickwall movie, a game of that movie and its soundtrack tape.',
    weekAll: 'All eight triple sets this season.'
  };

  // ---------- Chet Brickwall's eight movies (the base items in NP.MEDIA) and what goes with each ----------
  var SETS = [
    { mv: 'mv1', s: 'Asteroid Dentist', tape: 'd4_t01', games: ['d4_g01', 'd4_g09'] },
    { mv: 'mv2', s: 'Asteroid Dentist 2', tape: 'd4_t02', games: ['d4_g02', 'd4_g10'] },
    { mv: 'mv17', s: 'Asteroid Dentist 3', tape: 'd4_t03', games: ['d4_g03'] },
    { mv: 'mv3', s: 'Bulldozer Diplomacy', tape: 'd4_t04', games: ['d4_g04'] },
    { mv: 'mv9', s: 'Roundhouse Retiree', tape: 'd4_t05', games: ['d4_g05'] },
    { mv: 'mv10', s: 'The Lifeguard', tape: 'd4_t06', games: ['d4_g06'] },
    { mv: 'mv12', s: 'Badge and Badger', tape: 'd4_t07', games: ['d4_g07'] },
    { mv: 'mv24', s: 'Home Workout', tape: 'd4_t08', games: ['d4_g08'] }
  ];

  // ---------- the tie-in games (all made up). Each one is a genre its movie is not. The box art is a still from the
  // movie, and the back of the box promises scenes from the movie that are not in the game. late: it came out a year
  // after its movie. Values fit the base balance: shovelware level, and the Roundhouse Retiree game is the rare one.
  var GAMES = [
    { id: 'd4_g01', mv: 'mv1', p: 'k16', g: 'puzzle', tier: 1, base: 5, t: 'Asteroid Dentist: The Brushing Game',
      d: 'A rhythm game. You brush one giant tooth in time to the music for 40 levels. There is no asteroid. The box is a still of Chet Brickwall holding a toothbrush like a sword.',
      b: 'DRILL INTO THE ASTEROID. SAVE THE WHOLE PLANET. OPEN WIDE.' },
    { id: 'd4_g02', mv: 'mv2', p: 'fer', g: 'sports', tier: 1, base: 6, late: true, t: 'Asteroid Dentist 2: Root Canal Golf',
      d: 'A golf game. All 18 holes are cavities, and the flag on each one is a little toothbrush. The box is a still of Chet Brickwall in a dentist mask, squinting at space.',
      b: 'FEEL THE FURY OF THE ROOT CANAL. RIDE THE DRILL INTO SPACE.' },
    { id: 'd4_g03', mv: 'mv17', p: 'lum', g: 'puzzle', tier: 1, base: 3, t: 'Asteroid Dentist 3: Final Rinse Trivia',
      d: 'A trivia game on a disc. Every question is about the first movie. Chet Brickwall is in the third one for nine minutes, and the game does not ask about any of them.',
      b: 'RINSE THE ASTEROID. THE BIGGEST SPIT IN THE HISTORY OF SPACE.' },
    { id: 'd4_g04', mv: 'mv3', p: 'fer', g: 'strategy', tier: 1, base: 5, late: true, t: 'Bulldozer Diplomacy: Peace Talks',
      d: 'A slow strategy game where you sit at a very long table and pick polite words from a list. The bulldozer is on the box. In the game it stays parked outside the window.',
      b: 'DRIVE THE BULLDOZER RIGHT THROUGH THE PALACE WALL. TALKS ARE OVER.' },
    { id: 'd4_g05', mv: 'mv9', p: 'k16', g: 'sports', tier: 3, base: 45, late: true, t: 'Roundhouse Retiree: Shuffleboard',
      d: 'A shuffleboard game. Just shuffleboard, for one player, at one community center. The movie was pulled from shelves the week it came out, so hardly anybody ever saw a copy of this.',
      b: 'THE BIG KARATE FIGHT ON THE BOARDWALK. ALL SIX KICKS FROM THE MOVIE.' },
    { id: 'd4_g06', mv: 'mv10', p: 'lum', g: 'platformer', tier: 1, base: 4, t: 'Chet Is The Lifeguard: Poolside',
      d: 'A jumping game around the edge of a pool. The pool is closed in the game too, so you jump around it for 30 levels and never get to swim. The box is a still of Chet Brickwall blowing his whistle.',
      b: 'DIVE IN AND SAVE THE DAY. THE BIG RESCUE IN THE WAVE POOL.' },
    { id: 'd4_g07', mv: 'mv12', p: 'hal', g: 'racing', tier: 1, base: 5, late: true, t: 'Badge and Badger: Burrow Rally',
      d: 'A racing game. You drive a little car as the badger. The badger cannot drive, and the cop from the movie is not in it at all. The box is a still of the two of them in the squad car.',
      b: 'CHASE THE BAD GUYS ACROSS TOWN. HEAR THE BADGER\'S BIG SPEECH.' },
    { id: 'd4_g08', mv: 'mv24', p: 'k16', g: 'puzzle', tier: 1, base: 3, t: 'Chet\'s Home Workout: The Puzzle Game',
      d: 'A sliding block puzzle where every block is a dumbbell. It does not count as exercise. The box is a still of Chet Brickwall doing a push-up in somebody\'s living room.',
      b: 'WORK OUT WITH CHET. FORTY MINUTES OF REAL PUSH-UPS. FLOSS AFTER.' },
    { id: 'd4_g09', mv: 'mv1', p: 'pip', g: 'puzzle', tier: 1, base: 4, late: true, t: 'Asteroid Dentist: Brush to Go',
      d: 'The brushing game again, on the Lunchbox LX. The tooth is about four pixels wide. You can still tell it needs brushing. The box is the same still, smaller.',
      b: 'NOW THE WHOLE ASTEROID FITS IN YOUR LUNCHBOX.' },
    { id: 'd4_g10', mv: 'mv2', p: 'hal', g: 'sports', tier: 1, base: 4, t: 'Asteroid Dentist 2: Floss Fishing',
      d: 'A fishing game on a disc. You cast dental floss into a lake and wait. A scene from the movie plays in a tiny window on the title screen for nine seconds. That is the best part.',
      b: 'EVERY EXPLOSION FROM THE MOVIE, ON ONE DISC.' }
  ];
  // ---------- the soundtrack tapes (one per movie, on the Bible's labels, by its bands or new made-up ones) ----------
  var TAPES = [
    { id: 'd4_t01', mv: 'mv1', tier: 1, base: 4, t: 'Asteroid Dentist: Songs From the Chair', by: 'Synth Lord Kevin', lab: 'Pull Chain Records',
      d: 'Songs from the movie, plus the songs that were on in the waiting room while they made it. Synth Lord Kevin plays the drill sound on a keyboard for eleven minutes.',
      b: 'EVERY SONG FROM THE MOVIE, PLUS FOUR THAT WERE PLAYING NEARBY.' },
    { id: 'd4_t02', mv: 'mv2', tier: 2, base: 10, t: 'Root Canal Fury: Music to Drill By', by: 'Gravel Choir', lab: 'Two Garages Records',
      d: 'Moody parking lot rock for the sequel. One song is in the movie, for six seconds, on a car radio. The other eleven are about the parking lot.',
      b: 'ONE SONG FROM THE MOVIE. ELEVEN OF ITS FRIENDS.' },
    { id: 'd4_t03', mv: 'mv17', tier: 1, base: 3, t: 'Final Rinse: The Straight to Tape Tape', by: 'The Mouthwash Quartet', lab: 'Strip Mall Sound',
      d: 'The movie went straight to video, so the soundtrack went straight to tape. The band was paid in mouthwash. It shows on the high notes.',
      b: 'THE MUSIC FROM THE MOVIE YOU MISSED.' },
    { id: 'd4_t04', mv: 'mv3', tier: 1, base: 4, t: 'Bulldozer Diplomacy: Big Machine Songs', by: 'Five Matching Jackets', lab: 'Mild Hits Inc.',
      d: 'Five Matching Jackets sing about heavy machinery in five part harmony. The bulldozer gets a love song. The ambassador does not.',
      b: 'THE SOUNDS OF THE MOVIE, AND THE SOUND OF A VERY LARGE ENGINE.' },
    { id: 'd4_t05', mv: 'mv9', tier: 2, base: 12, t: 'Roundhouse Retiree: Slow Jams', by: 'The Community Center Trio', lab: 'Monsoon Season Music',
      d: 'Smooth songs for a movie about a karate teacher who just wants to play shuffleboard. The tape came out before the movie was pulled, so there are more tapes than movies.',
      b: 'SONGS FROM THE MOVIE, AND SONGS FOR THE COMMUNITY CENTER.' },
    { id: 'd4_t06', mv: 'mv10', tier: 1, base: 4, t: 'The Lifeguard: Songs for a Closed Pool', by: 'The Whistle Breaks', lab: 'Forever Pending Records',
      d: 'Dreamy beach songs for a movie where the pool is closed the whole time. Every song stops all at once, like somebody blew a whistle.',
      b: 'SUMMER SONGS FROM THE MOVIE, AND FROM THE SNACK BAR NEXT TO IT.' },
    { id: 'd4_t07', mv: 'mv12', tier: 2, base: 9, t: 'Badge and Badger: Squad Car Radio', by: 'The Moon Ferret Sound Team', lab: 'Hiss & Pop Tapes',
      d: 'The Moon Ferret Sound Team took this job between video games, and every song sounds a little like a level select screen. The badger gets the last track.',
      b: 'THE MUSIC OF THE CHASE, AND THE MUSIC OF THE BADGER.' },
    { id: 'd4_t08', mv: 'mv24', tier: 1, base: 3, t: 'Home Workout: Side B Is the Cooldown', by: 'Coach Denise', lab: 'Hiss & Pop Tapes',
      d: 'Coach Denise counts out the push-ups from the movie over a drum machine. Side B is the cooldown. It is twenty minutes of Chet Brickwall breathing.',
      b: 'SONGS FROM THE WORKOUT. YOU MAY FLOSS DURING SIDE B.' }
  ];
  GAMES.forEach(function (e) { e.kind = 'game'; e.d = e.d + ' ' + (e.late ? T.late : T.same); });
  TAPES.forEach(function (e) { e.kind = 'music'; e.fmt = 'tape'; });
  var ITEMS = GAMES.concat(TAPES);
  var BY = {}; ITEMS.forEach(function (e) { BY[e.id] = e; });
  var SET_OF = {}; SETS.forEach(function (S) { SET_OF[S.mv] = S; SET_OF[S.tape] = S; S.games.forEach(function (g) { SET_OF[g] = S; }); });

  // ---------- the four want list entries (NP.GOALS_POOL format) ----------
  // Type 'buy' with f.dlc and an offer tag only this pack passes (not type 'dlc'): Holiday Rush's goalFeasible and
  // goalTick answer false for every entry that is not theirs, and dlcFirst stops at the first answer. This pack picks
  // them (goalPick, with its own check) and ticks them (api.goalTick('buy', item, { offer: 'd4_w0N' })).
  var GOALS = [
    { id: 'd4_w01', name: 'Tie-In Shopper', label: 'Buy a tie-in game from the licensed aisle', type: 'buy', f: { dlc: ID, offer: 'd4_w01' }, n: 1, d: 'easy', reward: 'Theater Ticket Stub (Matinee)' },
    { id: 'd4_w02', name: 'Double Feature', label: 'Buy a Chet Brickwall movie and its soundtrack tape on the same Saturday', type: 'buy', f: { dlc: ID, offer: 'd4_w02' }, n: 1, d: 'mid', reward: 'Folded Lobby Poster' },
    { id: 'd4_w03', name: 'The Whole Thing', label: 'Finish a triple set', type: 'buy', f: { dlc: ID, offer: 'd4_w03' }, n: 1, d: 'hard', reward: 'Box Art Still in a Dollar Frame' },
    { id: 'd4_w04', name: 'Last Summer\'s Hit', label: 'Buy a tie-in game that came out a year after its movie', type: 'buy', f: { dlc: ID, offer: 'd4_w04' }, n: 1, d: 'mid', reward: 'Sun Faded Display Header' }
  ];

  // ---------- helpers ----------
  function rng(api, tag) { var S = api.state(); return api.mulberry32(api.hash(ID + '|' + (S ? S.seed : '') + '|' + tag)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function whole(n) { return Math.max(1, Math.round(n)); }
  function iso(d) { return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
  function media(id) { return (NP.MEDIA || []).filter(function (m) { return m.id === id; })[0] || null; }
  function isPiece(id) { return !!SET_OF[id]; }
  function mine(b) { return !!b && (!!b.d4aisle || String(b.id || '').indexOf(PX) === 0); }
  function run(S) { return !!(S && S.day && S.day.d4 && S.day.d4.run); }
  function packDay(S) { return !!(S && S.day && (S.day.d1 || S.day.d3)); } // a Holiday Rush Saturday or a Last Day
  function aisleStop(S) { return S && S.day && S.day.d4 && S.day.d4.aisle ? S.day.stops.filter(function (x) { return x.id === S.day.d4.aisle; })[0] || null : null; }
  function dropStop(S) { return S && S.day && S.day.d4 && S.day.d4.drop ? S.day.stops.filter(function (x) { return x.id === S.day.d4.drop; })[0] || null : null; }
  function avail(st) { return st ? (st.items || []).filter(function (it) { return it.state === 'avail'; }) : []; }
  function seasonOn(api) { var S = api.state(); return !!(S && S.season && api.season()); }
  // the pack's part of the season save: SEASON.dlc.dlc4 = { sets: { mv1: 4 }, all: 9 } (the Saturday each set and all eight were finished)
  function rec(se) {
    if (!se) return null;
    if (!se.dlc || typeof se.dlc !== 'object' || Array.isArray(se.dlc)) se.dlc = {};
    var r = se.dlc[ID];
    if (!r || typeof r !== 'object' || Array.isArray(r)) r = se.dlc[ID] = {};
    if (!r.sets || typeof r.sets !== 'object' || Array.isArray(r.sets)) r.sets = {};
    return r;
  }
  function peek(se) { return se && se.dlc && typeof se.dlc === 'object' && se.dlc[ID] && typeof se.dlc[ID] === 'object' ? se.dlc[ID] : null; }
  function doneSets(api) {
    var S = api.state();
    if (seasonOn(api)) { var R = peek(api.season()); return R && R.sets ? R.sets : {}; }
    return (S && S.d4sets) || {};
  }
  function nDone(D) { return SETS.filter(function (x) { return D[x.mv]; }).length; }
  // the pieces you have: in a season, the season shelf and today's bag (by id); on a one day run, today's bag only
  function haveOf(se, bag) {
    var H = {};
    if (se && Array.isArray(se.shelf)) se.shelf.forEach(function (b) { if (b && isPiece(b.id)) H[b.id] = 1; });
    (bag || []).forEach(function (b) { if (b && isPiece(b.id)) H[b.id] = 1; });
    return H;
  }
  function have(api) { var S = api.state(); return haveOf(seasonOn(api) ? api.season() : null, S ? S.bag : []); }
  function setHas(St, H) { return { m: !!H[St.mv], g: St.games.some(function (g) { return H[g]; }), t: !!H[St.tape] }; }
  function started(St, H) { var x = setHas(St, H); return (x.m || x.g || x.t) && !(x.m && x.g && x.t); }
  // a piece some set you started still needs (the aisle and the drop lean toward these)
  function needed(id, H, D) {
    var St = SET_OF[id]; if (!St || D[St.mv] || !started(St, H)) return false;
    var x = setHas(St, H);
    if (id === St.mv) return !x.m;
    if (id === St.tape) return !x.t;
    return !x.g;
  }
  function pickW(r, list, wf) {
    var tot = 0, w = list.map(function (x) { var v = wf(x); tot += v; return v; });
    var x = r() * tot;
    for (var i = 0; i < list.length - 1; i++) { x -= w[i]; if (x < 0) return i; }
    return list.length - 1;
  }
  function drawN(r, pool, n, wf) {
    pool = pool.slice(); var out = [];
    while (out.length < n && pool.length) { var i = pickW(r, pool, wf); out.push(pool[i]); pool.splice(i, 1); }
    return out;
  }
  // every id anywhere in town today (items, dig piles, lot boxes), so the aisle never puts out a second copy
  function idsInTown(day) {
    var ids = {};
    var add = function (it) { if (!it) return; if (it.id) ids[it.id] = 1; (it.contents || []).forEach(add); };
    day.stops.forEach(function (s) { (s.items || []).concat(s.dig || [], s.rivalTable || []).forEach(add); });
    return ids;
  }
  // what goes in the aisle today: ids only. A pure function of the numbers, what you have and what is out in town.
  // The aisle's stock is rolled from all the pieces (leaning toward pieces a set you started still needs). A piece
  // already on your shelf is left off the rack (so nothing here is ever a second copy), and so is a movie that is
  // already somewhere else in town today. So the aisle gets a little thinner as your sets fill up.
  // oneDay: one whole set is always in it (a movie, one of its games, a late one when it has one, and its tape)
  function rollAisle(r, H, D, out, oneDay) {
    var ok = function (id) { return !out[id]; };
    var w = function (id) { var e = BY[id] || media(id) || {}; return (needed(id, H, D) ? W_NEED : 1) * (TIER_W[e.tier || 1] || 1); };
    var mv = [], gm = [], tp = [];
    var nM = r() < 0.5 ? 2 : 1, nG = N_GAMES - (r() < G_LESS ? 1 : 0), nT = N_TAPES - (r() < T_LESS ? 1 : 0);
    var away = null;
    if (oneDay) {
      // now and then every one of the eight movies is already out somewhere else in town (the rental stores carry a
      // lot of them). Then the aisle has the game and the tape, and the box says where the movie is: out in town.
      var fs = SETS.filter(function (x) { return ok(x.mv); });
      var F = (fs.length ? fs : SETS)[Math.floor(r() * (fs.length || SETS.length))];
      if (fs.length) mv.push(F.mv); else away = F.mv;
      var lg = F.games.filter(function (g) { return BY[g].late; });
      gm.push((lg.length ? lg : F.games)[0]);
      tp.push(F.tape);
    }
    mv = mv.concat(drawN(r, SETS.map(function (x) { return x.mv; }).filter(function (id) { return ok(id) && mv.indexOf(id) < 0; }), nM - mv.length, w));
    gm = gm.concat(drawN(r, GAMES.map(function (x) { return x.id; }).filter(function (id) { return ok(id) && gm.indexOf(id) < 0; }), nG - gm.length, w));
    tp = tp.concat(drawN(r, TAPES.map(function (x) { return x.id; }).filter(function (id) { return ok(id) && tp.indexOf(id) < 0; }), nT - tp.length, w));
    var keep = function (id) { return !H[id]; };
    return { movies: mv.filter(keep), games: gm.filter(keep), tapes: tp.filter(keep), away: away };
  }
  // the one drop on a season Saturday without the record store: one tie-in game or tape, leaning toward a set you started
  function rollDrop(r, H, D) {
    var pool = ITEMS.map(function (x) { return x.id; });
    var id = pool[pickW(r, pool, function (id) { return (needed(id, H, D) ? W_NEED_DROP : 1) * (TIER_W[BY[id].tier] || 1); })];
    return H[id] ? null : id; // a piece already on your shelf does not turn up again
  }

  // ---------- building things in the shape makeItem gives (no base item number is used) ----------
  function jerkOn(it, k) {
    // the same mood the base lays over every item of a jerk's stop (addJerks), so the aisle sells the way the stop does
    if (!k) return;
    it.jerk = k;
    if (k === 'brag') it.ask = Math.max(2, Math.round(it.ask * 1.25));
    it.minFrac = k === 'budge' ? 1 : Math.min(1, (it.minFrac || 0.7) + 0.12);
  }
  function build(r, id, uid, st, sec) {
    var e = BY[id] || media(id); if (!e) return null;
    var SL = NP.SELLERS[st.seller] || NP.SELLERS.friendly || { ask: 1, minLo: 0.6, minHi: 0.8 };
    var it = { uid: uid, id: e.id, t: e.t, p: e.p || 'k16', tier: e.tier || 0, base: e.base || 0, g: e.g || '', kind: e.kind, seller: st.seller || 'friendly',
      sticker: r() < 0.5, cond: 'loose', flags: {}, inspected: false, checked: false, state: 'avail', line: '', sec: sec };
    if (e.kind === 'game') { it.cond = r() < CIB_P ? 'cib' : 'loose'; it.tell = true; if (st.type === 'pawn') it.tested = true; }
    else { it.fmt = e.fmt; it.by = e.by; it.lab = BY[id] ? e.lab : (NP.STUDIOS && NP.STUDIOS[e.lab]) || NP.LABELS && NP.LABELS[e.lab] || ''; }
    if (BY[id]) { it.dlc = ID; it.dd = e.d; it.db = e.b || ''; it.dtag = 'd4'; it.dlabel = T.tag; }
    var apparent = Math.max(1, it.base * (it.cond === 'cib' ? 2 : 1));
    var jit = SL.wild ? lerp(0.6, 1.4, r()) : lerp(0.85, 1.2, r());
    it.ask = whole(apparent * (SL.ask || 1) * jit);
    it.minFrac = lerp(SL.minLo || 0.6, SL.minHi || 0.8, r());
    if (st.jerk && it.seller === st.seller) jerkOn(it, st.jerk);
    return it;
  }
  // which shelf a drop goes on at its stop (a stop with sections only shows the sections it lists)
  function secFor(st, kind) {
    if (!st.secs) return '';
    var keys = st.secs.map(function (x) { return x[0]; });
    if (kind === 'game') return keys.indexOf('') >= 0 ? '' : keys[0];
    var m = ['music', 'media', 'crate'].filter(function (k) { return keys.indexOf(k) >= 0; })[0];
    return m != null ? m : keys[0];
  }

  // ---------- nothing from this pack, and nothing from the aisle, is bought back ----------
  // The base sell list asks sellQ(item, buyer) for an offer and keeps it in S.sq[stop|buyer|uid]. These things get a
  // "not buying it" answer there, for every kind of buyer, at the stop you are at: the row says NOT BUYING IT, with no
  // Sell, Trade in or Ask for more button, and the game's own sell action refuses it. Bag items only live for the day,
  // so this covers every stop, the swap meet tables included. Each pack only writes rows for its own things.
  function noSell(api) {
    var S = api.state(); if (!S || !S.stop || !Array.isArray(S.bag) || !NP.BUYERS) return;
    if (!S.sq || typeof S.sq !== 'object') return;
    S.bag.forEach(function (b) {
      if (!mine(b)) return;
      Object.keys(NP.BUYERS).forEach(function (bt) {
        var k = S.stop.id + '|' + bt + '|' + b.uid, o = S.sq[k];
        if (!o || o.state !== 'mad' || !o.d4) S.sq[k] = { offer: 0, max: 0, state: 'mad', line: T.noSell, d4: true, tradein: true };
      });
    });
  }

  // ---------- triple sets ----------
  function checkSets(api, it) {
    var S = api.state(); if (!S) return [];
    var season = seasonOn(api), R = season ? rec(api.season()) : null;
    var D = season ? R.sets : (S.d4sets = S.d4sets || {});
    var H = have(api), fresh = [];
    SETS.forEach(function (St) {
      if (D[St.mv]) return; // a finished set stays finished
      var x = setHas(St, H);
      if (x.m && x.g && x.t) { D[St.mv] = season ? S.week : 1; fresh.push(St); }
    });
    if (!fresh.length) return fresh;
    S.d4today = (S.d4today || []).concat(fresh.map(function (x) { return x.mv; }));
    fresh.forEach(function (St) {
      api.bonus(T.bonusCat, SET_PTS);
      api.track('dlc4_set_' + St.mv);
      api.track('dlc4_set_done_' + (season ? 'season' : 'oneday'));
    });
    api.confetti(40); api.sfx('fanfare');
    // the big chip goes in after the base game's own chips for this buy (the find reveal, the want list), so a busy
    // moment never pushes it out of the line of chips
    var seed = S.seed;
    setTimeout(function () {
      var S2 = api.state(); if (!S2 || S2.seed !== seed) return;
      fresh.forEach(function (St) { api.celebrate('big', T.chipSet.replace('{s}', St.s)); });
    }, 700);
    if (season && nDone(D) >= SETS.length && !R.all) { R.all = S.week; S.d4all = true; api.track('dlc4_set_all'); api.track('dlc4_set_all_w' + Math.min(S.week, 30)); }
    if (S.goal && S.goal.id === 'd4_w03') tick(api, 'd4_w03', it && it.kind);
    return fresh;
  }

  // ---------- the want list ----------
  // a stand-in item for this pack's own entries: the game's 'buy' check matches it by f.dlc and the offer tag
  function tick(api, id, kind) { api.goalTick('buy', { uid: 'd4tick', id: 'd4_tick', t: '', kind: kind || 'game', dlc: ID, flags: {}, cond: 'loose' }, { price: 0, offer: id }); }
  function deadEnd(D) { return !!(D && D.gate && !D.coded && !(D.choices || []).some(function (c) { return c.unblock; })); }
  function gated(s) { var D = s && s.story && NP.STORIES && NP.STORIES[s.story]; return !!(D && !D.coded && D.gate && !(s.ss && s.ss.open)); }
  function lockedAllDay(s) { var D = s && s.story && NP.STORIES && NP.STORIES[s.story]; return !!(D && deadEnd(D) && !(s.ss && s.ss.open)); }
  function reach(api, st) {
    var S = api.state(); if (!st || !api.openStop(st) || lockedAllDay(st)) return false;
    if (st === S.stop && S.screen === 'stop') return true;
    return !st.visited && S.time + api.costOf(st) < api.endT() - 30;
  }
  function reachable(api) {
    var S = api.state(), out = [];
    [aisleStop(S), dropStop(S)].forEach(function (st) {
      if (!st || !reach(api, st)) return;
      avail(st).forEach(function (it) { if ((it.d4aisle || mine(it)) && isPiece(it.id) && it.ask <= S.cash) out.push(it); });
    });
    return out;
  }
  function feasible(api, g) {
    var S = api.state(); if (!S || !S.day || !S.day.d4 || packDay(S)) return false;
    if (api.endT() - S.time < 45) return false;
    var L = reachable(api), bag = {};
    S.bag.forEach(function (b) { bag[b.id] = 1; });
    if (g.id === 'd4_w01') return L.some(function (it) { return it.d4aisle && it.kind === 'game'; });
    if (g.id === 'd4_w04') return L.some(function (it) { return it.kind === 'game' && BY[it.id] && BY[it.id].late; });
    if (g.id === 'd4_w02') {
      return SETS.some(function (St) {
        if (bag[St.mv] && bag[St.tape]) return false;
        var m = bag[St.mv] ? 0 : (L.filter(function (it) { return it.id === St.mv; })[0] || null);
        var t = bag[St.tape] ? 0 : (L.filter(function (it) { return it.id === St.tape; })[0] || null);
        if (m === null || t === null) return false;
        return (m ? m.ask : 0) + (t ? t.ask : 0) <= S.cash;
      });
    }
    if (g.id === 'd4_w03') {
      var H = have(api), D = doneSets(api);
      return SETS.some(function (St) {
        if (D[St.mv]) return false;
        var x = setHas(St, H), cost = 0, ok = true;
        var take = function (ids) {
          var c = L.filter(function (it) { return ids.indexOf(it.id) >= 0; }).sort(function (a, b) { return a.ask - b.ask; })[0];
          if (!c) ok = false; else cost += c.ask;
        };
        if (!x.m) take([St.mv]);
        if (!x.g) take(St.games);
        if (!x.t) take([St.tape]);
        return ok && cost <= S.cash;
      });
    }
    return false;
  }
  // after anything goes in the bag (base buys reach this through the bought hook, another pack's buys too)
  function afterBuy4(api, it) {
    var S = api.state(); if (!S || !S.day || !it) return;
    noSell(api);
    var g = S.goal && S.goal.id, e = BY[it.id];
    if (g === 'd4_w01' && it.d4aisle && it.kind === 'game' && e) tick(api, g, 'game');
    else if (g === 'd4_w04' && e && e.late && it.kind === 'game') tick(api, g, 'game');
    else if (g === 'd4_w02' && SET_OF[it.id] && (it.id === SET_OF[it.id].mv || it.id === SET_OF[it.id].tape)) {
      var St = SET_OF[it.id];
      if (S.bag.some(function (b) { return b.id === St.mv; }) && S.bag.some(function (b) { return b.id === St.tape; })) tick(api, g, it.kind);
    }
    if (isPiece(it.id)) checkSets(api, it);
    if (it.d4aisle) api.track('dlc4_buy_' + (e ? (it.kind === 'game' ? 'game' : 'tape') : 'movie'));
    else if (e) api.track('dlc4_drop_buy');
  }

  // ---------- the aisle box, the true story moment and the drop note ----------
  function pills(api, St, H, D) {
    var esc = api.esc, x = setHas(St, H);
    var p = function (on, label) { return '<span class="d4-p' + (on ? ' on' : '') + '" aria-label="' + esc(label + ' ' + (on ? T.have : T.need)) + '">' + esc(label) + (on ? ' ✓' : '') + '</span>'; };
    return '<li class="d4-row' + (D[St.mv] ? ' done' : '') + '"><span class="d4-sn">' + esc(St.s) + '</span> ' + p(x.m, T.pM) + p(x.g, T.pG) + p(x.t, T.pT) +
      (D[St.mv] ? ' <span class="d4-done">★ ' + esc(T.pDone) + '</span>' : '') + '</li>';
  }
  function aisleBox(api, s) {
    var S = api.state(), esc = api.esc, H = have(api), D = doneSets(api), season = seasonOn(api);
    var h = '<div class="story d4-box"><div class="story-h">' + esc(T.boxH) + '</div>' +
      '<div class="bubble">' + esc(NP.SELLERS[s.seller] ? NP.SELLERS[s.seller].name : '') + ': "' + esc(T.clerk[s.seller] || T.clerk.chill) + '"</div>' +
      '<div class="story-t">' + esc(T.setHow) + (S.day.d4.whole ? ' ' + esc(T.oneWhole) : S.day.d4.away && SET_OF[S.day.d4.away] ? ' ' + esc(T.away.replace('{s}', SET_OF[S.day.d4.away].s)) : '') + '</div>' +
      '<div class="d4-count">' + esc((season ? T.seasonCount : T.dayCount).replace('{n}', nDone(D))) + '</div>';
    // the sets you started, finished, or can work on in the aisle today
    var here = {}; avail(s).forEach(function (it) { if (it.d4aisle && SET_OF[it.id]) here[SET_OF[it.id].mv] = 1; });
    if (!(s.items || []).some(function (it) { return it.d4aisle; })) h += '<div class="note">' + esc(T.picked) + '</div>';
    var tod = (S.d4today || []).map(function (mv) { return SET_OF[mv] ? SET_OF[mv].s : mv; });
    if (tod.length) h += '<div class="d4-today">★ ' + esc(T.boxToday.replace('{list}', tod.join(', '))) + '</div>';
    var rows = SETS.filter(function (St) { var x = setHas(St, H); return D[St.mv] || x.m || x.g || x.t || here[St.mv]; });
    if (rows.length) h += '<ul class="d4-sets">' + rows.map(function (St) { return pills(api, St, H, D); }).join('') + '</ul>';
    return h + '</div>' + storyBox(api, s);
  }
  function storyBox(api, s) {
    var S = api.state(), esc = api.esc, Z = s.d4 && s.d4.ts; if (!Z) return '';
    var g = (s.items || []).filter(function (it) { return it.uid === Z.g; })[0], m = (s.items || []).filter(function (it) { return it.uid === Z.m; })[0];
    if (!g || !m) return '';
    if (!Z.done && (g.state !== 'avail' || m.state !== 'avail')) return ''; // only while both are in the aisle
    var h = '<div class="story d4-true"><span class="truetag">' + esc(NP.TRUE_TAG) + '</span><div class="story-h">' + esc(T.storyH) + '</div>' +
      '<div class="story-t">' + esc(T.story.replace('{g}', g.t).replace('{m}', m.t)) + '</div>';
    if (Z.done) return h + '<div class="bubble">' + esc(Z.line || '') + '</div></div>';
    if (S.screen === 'stop' && S.stop === s && !gated(s)) h += '<div class="btns"><button class="offer fair" data-act="dlc" data-dlc="' + ID + '" data-v="story">' + esc(T.storyBtn) + '</button></div>';
    return h + '</div>';
  }
  function doStory(api) {
    var S = api.state(), s = S && S.stop;
    if (!s || S.screen !== 'stop' || !s.d4 || !s.d4.ts || s.d4.ts.done || gated(s)) return;
    var Z = s.d4.ts, g = s.items.filter(function (it) { return it.uid === Z.g; })[0], m = s.items.filter(function (it) { return it.uid === Z.m; })[0];
    if (!g || !m || g.state !== 'avail' || m.state !== 'avail') return;
    api.actCost(T_STORY);
    Z.done = true;
    if (g.ask >= 2) {
      var off = Math.max(1, Math.round(g.ask * 0.25));
      g.ask = Math.max(1, g.ask - off); g.counter = null;
      Z.line = (T.storyOff[s.seller] || T.storyOff.chill).replace('{$}', api.money(off));
      api.celebrate('good', T.chipStory.replace('{$}', api.money(off)));
    } else {
      var n = api.bonus(T.storyCat, 5);
      Z.line = T.storyPts.replace('{n}', n);
    }
    api.track('dlc4_story');
    api.saveSoon();
    if (!api.checkSundown()) api.render();
  }
  function dropBox(api, s) {
    var esc = api.esc;
    return '<div class="story d4-drop"><div class="story-h">' + esc(T.dropH) + '</div><div class="story-t">' + esc(T.drop) + '</div></div>';
  }

  // ---------- pictures: the box art is a still from the movie (the movie's own picture), tapes in the movie's colors ----------
  function drawItem(api, ctx, it, ox, oy, k) {
    var e = it && BY[it.id]; if (!e || it._d4pass || !NP.drawItem) return false;
    var c = {}; Object.keys(it).forEach(function (key) { c[key] = it[key]; });
    c.id = e.mv; c._d4pass = true; delete c.art;
    NP.drawItem(ctx, c, ox, oy, k);
    if (e.kind === 'game') {
      // a little gold movie banner strip across the top of the label or the box
      var P = function (x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(ox + x * k, oy + y * k, w * k, h * k); };
      var pl = NP.PLATFORMS[it.p] || {}, loose = (it.cond || 'loose') === 'loose';
      if (loose && pl.media === 'disc') P(9, 9, 14, 2, '#ffcc33');
      else if (loose) { var w = pl.media === 'hand' ? 22 : 28, x0 = (32 - w) / 2, top = pl.media === 'hand' ? 10 : 6; P(x0 + 3, top + 3, w - 6, 2, '#ffcc33'); }
      else { P(3, 8, 26, 2, '#ffcc33'); }
    }
    return true;
  }

  // ---------- the pack ----------
  NP.DLC[ID] = {
    id: ID, name: T.name, prefix: PX,
    data: {
      text: T, items: ITEMS, goals: GOALS, sets: SETS.map(function (x) { return x.s + ' (' + (media(x.mv) ? media(x.mv).t : x.mv) + ')'; }),
      tags: { d4: T.tag }, tagColors: { d4: ['#7e1d8f', '#ffcc33'] }, tagShort: { d4: T.tagShort },
      aisle: 'The licensed aisle (at Music Store (Also Movies) (Also Games))'
    },
    css: '.tag.t-d4{background:#7e1d8f;color:#ffcc33}' +
      '.story.d4-box{border-left-color:#7e1d8f}.story.d4-drop{border-left-color:#7e1d8f}' +
      '.d4-count{font-weight:bold;color:#ffcc33;margin:6px 0 2px;font-size:calc(14px * var(--tsz, 1))}' +
      '.d4-sets{list-style:none;padding:0;margin:4px 0 2px}' +
      '.d4-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:3px 0;color:#c9d1dc;font-size:calc(13px * var(--tsz, 1))}' +
      '.d4-sn{flex:1 1 100%;font-weight:bold;color:#fff1d6}' +
      '.d4-p{display:inline-block;min-width:4.2em;text-align:center;padding:1px 4px;font-weight:bold;font-size:calc(11px * var(--tsz, 1));border:2px solid #3a4d82;color:#8fa0c8;background:#0b1022}' +
      '.d4-p.on{background:#7e1d8f;border-color:#ffcc33;color:#fff1d6}' +
      '.d4-today{display:inline-block;background:#ffcc33;color:#0b1022;font-weight:bold;padding:2px 8px;margin:6px 0 2px;border:2px solid #0b1022;font-size:calc(14px * var(--tsz, 1))}' +
      '.d4-done{display:inline-block;background:#ffcc33;color:#0b1022;font-weight:bold;padding:0 6px;font-size:calc(11px * var(--tsz, 1))}' +
      '.wk-d4{background:#4a1456;color:#fff1d6;font-weight:bold;padding:6px 10px;margin:8px 0}' +
      '.rc-d4 b{color:#ffcc33}.also.d4-res{color:#e7b8f0}.d4-resall{color:#ffcc33;font-weight:bold;margin:6px 0}',
    hooks: {
      // once, at page load. There is no sell hook, so this listens on the page before the game's own click handler
      // runs, and makes sure a pack thing in the sell list is already marked "not buying it" before any sell.
      init: function (api) {
        document.addEventListener('click', function (e) {
          var el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
          if (!el) return;
          var a = el.getAttribute('data-act'), S = api.state();
          if (!S || (a !== 'sell' && a !== 'askmore')) return;
          var uid = el.getAttribute('data-uid');
          if (S.bag && S.bag.some(function (b) { return b.uid === uid && mine(b); })) { noSell(api); setTimeout(function () { api.render(); }, 0); }
        }, true);
      },
      // only on the pack's own title run (a short name: the base prints it on the morning label and the share card)
      dayName: function (api) { return run(api.state()) ? T.short : undefined; },
      menu: function (api) {
        return '<button class="cart-item d4-menu" data-act="dlc" data-dlc="' + ID + '" data-v="start">' + api.esc(T.menu) + ' <small>' + api.esc(T.menuSmall) + '</small></button>';
      },
      act: function (api, v) {
        v = String(v || '');
        if (v === 'start') {
          // the in-game date is the coming Saturday (today counts)
          var p = String(api.phoenixDate()).split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
          d = new Date(d.getTime() + ((6 - d.getUTCDay() + 7) % 7) * 86400000);
          api.track('dlc4_title_start');
          api.startOneDay('sundown', true, { seed: ID + '-' + iso(d) + '-' + Math.random().toString(36).slice(2, 8), dlc: ID });
        } else if (v === 'story') doStory(api);
      },
      // the title run: the record store is open all day (on top of the usual rotating stores)
      stores: function (api, day, info) {
        if (info.run !== ID) return;
        var r = api.mulberry32(api.hash(ID + '|' + info.seed + '|stores'));
        var rec0 = day.stops.filter(function (x) { return x.type === 'record' && api.openStop(x); })[0], forced = false;
        if (!rec0) {
          rec0 = api.makeStore(r, 'record')[0];
          rec0.dlc = ID; rec0.rivals = rec0.rivals || [];
          day.stops.splice(1 + Math.floor(r() * day.stops.length), 0, rec0);
          (day.storeGroups = day.storeGroups || []).push('record');
          forced = true;
        }
        // a sign that never lets you in (BACK IN 5 MINUTES, from 2009) would lock the aisle away all day, so on this
        // one day it is down. A gate you can get past (the clerk on his phone, the trivia question) stays.
        var SD = rec0.story && NP.STORIES && NP.STORIES[rec0.story];
        if (deadEnd(SD)) rec0.story = null;
        day.d4 = { run: true, forced: forced };
        if (forced) api.track('dlc4_forced');
      },
      // the aisle, wherever the record store is open, and the one drop on a season Saturday without it
      buildDay: function (api, day, info) {
        var se = info.season ? api.season() : null;
        var H = se ? haveOf(se, []) : {}, D = se ? (peek(se) || {}).sets || {} : {};
        var st = day.stops.filter(function (x) { return x.type === 'record' && api.openStop(x); })[0] || null;
        var oneDay = !info.season;
        if (st) {
          var r = api.mulberry32(api.hash(ID + '|' + info.seed + '|aisle'));
          var out = idsInTown(day), A = rollAisle(r, H, D, out, oneDay), n = 0;
          var put = function (id) { var it = build(r, id, 'd4a' + (n++), st, SEC); if (it) { it.d4aisle = true; st.items.push(it); } return it; };
          var mvs = A.movies.map(put), gms = A.games.map(put);
          A.tapes.forEach(put);
          if (st.secs && !st.secs.some(function (sc) { return sc[0] === SEC; })) st.secs = st.secs.concat([[SEC, T.secAisle]]);
          // the true story moment: a tie-in that came out a year late, sitting next to its own movie
          var ts = null;
          gms.forEach(function (g) {
            if (ts || !g || !BY[g.id].late) return;
            var m = mvs.filter(function (x) { return x && x.id === BY[g.id].mv; })[0];
            if (m) ts = { g: g.uid, m: m.uid, done: false };
          });
          st.d4 = { aisle: true, ts: ts };
          day.d4 = day.d4 || {};
          day.d4.aisle = st.id;
          day.d4.away = A.away;
          day.d4.whole = oneDay && A.movies.length > 0 && A.tapes.length > 0 && A.games.length > 0 && SET_OF[A.movies[0]] === SET_OF[A.games[0]] && SET_OF[A.movies[0]] === SET_OF[A.tapes[0]];
          api.track('dlc4_aisle_' + (info.run === ID ? 'title' : info.season ? 'season' : 'oneday') + (ts ? '_story' : ''));
        } else if (se) {
          var dr = api.mulberry32(api.hash(ID + '|' + info.seed + '|drop'));
          if (dr() < DROP_P) {
            var hosts = day.stops.filter(function (x) { return api.openStop(x) && (x.type === 'yard' || x.type === 'thrift' || x.type === 'pawn'); });
            var id = hosts.length ? rollDrop(dr, H, D) : null;
            if (id && idsInTown(day)[id]) id = null;
            if (id) {
              var host = api.pick(dr, hosts), e = BY[id];
              var it = build(dr, id, 'd4d0', host, secFor(host, e.kind));
              if (it) {
                host.items.push(it); host.d4 = { drop: true };
                day.d4 = { drop: host.id };
                api.track('dlc4_drop_' + host.type);
              }
            }
          }
        }
        if (se && day.d4) rec(se);
      },
      // the title run: the record store stays on the suggested route all day
      route: function (api, list) {
        var S = api.state(); if (!run(S)) return undefined;
        list.forEach(function (x) { if (x.d4 && x.d4.aisle) x.keep = true; });
        return undefined;
      },
      routeCard: function (api) {
        var S = api.state(); if (!S || !S.day || !S.day.d4) return '';
        var esc = api.esc, a = aisleStop(S), dp = dropStop(S);
        if (a && !a.visited) return '<div class="rc-theme rc-d4"><b>' + esc(T.name) + '.</b> ' + esc(run(S) ? (S.day.d4.away ? T.routeAway : T.routeRun) : T.route) + '</div>';
        if (dp && !dp.visited && avail(dp).some(mine)) return '<div class="rc-theme rc-d4"><b>' + esc(T.name) + '.</b> ' + esc(T.routeDrop.replace('{stop}', dp.name)) + '</div>';
        return '';
      },
      weekdays: function (api, w) {
        var se = api.season(); if (!se) return '';
        var R = peek(se), D = (R && R.sets) || {}, n = nDone(D);
        if (R && R.all) return '<div class="wk-d4">★ ' + api.esc(T.weekAll) + '</div>';
        return '<div class="wk-d4">' + api.esc(T.week.replace('{n}', n) + (n ? '' : T.weekHow)) + '</div>';
      },
      arrive: function (api, s) {
        var S = api.state(); if (!S || !S.day) return;
        noSell(api);
        if (s && s.d4) api.track(s.d4.aisle ? 'dlc4_aisle_arrive' : 'dlc4_drop_arrive');
      },
      // stopHTML runs before the base sell list and the item cards in the same render, so "not buying it" is in place first
      stopHTML: function (api, s) {
        var S = api.state(); if (!S || !S.day || !s) return '';
        noSell(api);
        if (!s.d4 || !S.day.d4) return '';
        if (s.d4.aisle) return aisleBox(api, s);
        if (s.d4.drop && avail(s).some(mine)) return dropBox(api, s);
        return '';
      },
      bought: function (api, it) { afterBuy4(api, it); },
      results: function (api) {
        var S = api.state(); if (!S) return '';
        var esc = api.esc, h = '', today = S.d4today || [];
        if (run(S)) h += '<div class="also d4-res">' + esc(T.res) + '</div>';
        if (today.length) h += '<div class="also d4-res">' + esc(T.resSets.replace('{list}', today.map(function (mv) { return SET_OF[mv] ? SET_OF[mv].s : mv; }).join(', '))) + '</div>';
        var went = !!(aisleStop(S) && aisleStop(S).visited) || S.bag.some(function (x) { return isPiece(x.id); });
        if (seasonOn(api)) {
          var R = peek(api.season()) || {}, n = nDone(R.sets || {});
          if (today.length || went) h += '<div class="also d4-res">' + esc(T.resSeason.replace('{n}', n)) + '</div>';
          if (R.all && R.all === S.week) h += '<div class="d4-resall">★ ' + esc(T.resAll) + '</div>';
          else if (R.all && today.length) h += '<div class="also d4-res">★ ' + esc(T.resAllDone.replace('{w}', R.all)) + '</div>';
        } else if (went) h += '<div class="also d4-res">' + esc(T.resDay.replace('{n}', today.length)) + '</div>';
        return h;
      },
      // the want list: one of the pack's entries now and then (most often in the aisle). Another pack's pick stands,
      // and a Holiday Rush Saturday or a Last Day keeps its own want list.
      goalPick: function (api, def, ctx) {
        var S = api.state(); if (!S || S.goal || !S.day || !S.day.d4 || packDay(S)) return undefined;
        if (def && /^d\d+_/.test(def.id)) return undefined;
        var hist = S.goalHist || [], recent = (ctx && ctx.recent) || [];
        var cands = GOALS.filter(function (g) { return hist.indexOf(g.id) < 0 && recent.indexOf(g.id) < 0 && feasible(api, g); });
        if (!cands.length) return undefined;
        var r = rng(api, 'goal|' + S.history.length + '|' + (S.goalsDone || []).length + '|' + hist.length);
        var at = !!(S.stop && S.stop.d4 && S.screen === 'stop');
        if (at && r() < 0.85) return api.pick(r, cands);
        if (r() < (run(S) ? 0.5 : 0.3)) return api.pick(r, cands);
        return undefined;
      },
      // these entries are type 'buy', so the game never asks these two; they answer for this pack's ids only
      goalFeasible: function (api, def) { return def && /^d4_/.test(def.id) ? feasible(api, def) : undefined; },
      goalTick: function () { return undefined; },
      drawItem: drawItem
    },
    // for tests and tools: pure helpers and the pack's own numbers
    util: { SETS: SETS, BY: BY, SET_OF: SET_OF, W_NEED: W_NEED, W_NEED_DROP: W_NEED_DROP, DROP_P: DROP_P, SET_PTS: SET_PTS,
      rollAisle: rollAisle, rollDrop: rollDrop, haveOf: haveOf, setHas: setHas, needed: needed, noSell: noSell, feasible: feasible,
      checkSets: checkSets, peek: peek, deadEnd: deadEnd,
      tune: function (o) { if (o.W_NEED != null) W_NEED = o.W_NEED; if (o.W_NEED_DROP != null) W_NEED_DROP = o.W_NEED_DROP; if (o.DROP_P != null) DROP_P = o.DROP_P; if (o.N_GAMES != null) N_GAMES = o.N_GAMES; if (o.G_LESS != null) G_LESS = o.G_LESS; if (o.T_LESS != null) T_LESS = o.T_LESS; if (o.TIER_W) TIER_W = o.TIER_W; } }
  };
})();
