// Nostalgia Pro DLC 3: Last Day at the Rental Store. Full game only (never the demo).
// Both video rental stores close on the same Saturday. EVERYTHING MUST GO: the base stock is half off, every ex-rental
// tape is in a giant clamshell, the late fee is forgiven, the cardboard Chet Brickwall goes to the best sealed bid, and
// the store's own front window display copy is behind the counter.
// Release: Sat Dec 5, 2026. There is no date gate: the pack works on any date as soon as it is on.
// Playable any day from the title screen (LAST DAY AT THE RENTAL STORE, under the other pack entries), and once a season
// on the first season Saturday from Saturday 6 on that is not an Expo Saturday (and, with Holiday Rush on, not dated
// Dec 1 to Dec 24). It is recorded in SEASON.dlc.dlc3 = { week, done }.
//
// This file only registers itself. It never edits base data when it loads. Every random number here comes from this
// pack's own seeded generator ('dlc3|' + seed + '|...'). Its hooks run last in newRun, so the base day's rolls are
// exactly what they were without it. On any day that is not the Last Day, the only thing it adds is one plain line at
// the rental stores later in a season ("Under new management. Still closing.").
//
// Money: cash is whole dollars everywhere. Every price, bid and discount here is rounded after any percentage, with a
// $1 minimum. Nothing from the closing sale can be sold back: the base sell list keeps each owner's offer in S.sq, and
// this pack marks every Last Day buy as "not buying it" there for the stop you are at (the same way Penny Bin League does).
var NP = window.NP || {};
window.NP = NP;
NP.DLC = NP.DLC || {};
(function () {
  'use strict';
  var ID = 'dlc3', PX = 'd3_';
  var FROM_WEEK = 6;                              // the Last Day is never before Saturday 6 of a season
  var OFF = 0.5;                                  // the closing sale: 50% off the base stock
  var BID_MIN = 5, BID_STEP = 5, BID_MAX = 100, T_BID = 10, QUICK = [10, 20, 30, 40];
  var TOWN_BIDS = [10, 15, 20, 25, 30, 35], DEX_FLIP = [40, 50, 60]; // Dex bids half of what he thinks he can flip it for

  // ---------- every word the pack says (house style: plain words, no dashes, played straight) ----------
  var T = {
    name: 'Last Day at the Rental Store',
    menu: 'LAST DAY AT THE RENTAL STORE', menuSmall: 'both video stores close today',
    weekNext: 'Both video rental stores close next Saturday.',
    weekDay: '{label} · Last Day at the Rental Store. Both video rental stores close for good on Saturday.',
    route: 'Both video rental stores close today, for good. Everything is half off, the late fees are forgiven, and the cardboard Chet Brickwall goes to the best sealed bid.',
    results: 'Last Day at the Rental Store · both video rental stores closed for good today',
    sign: 'EVERYTHING MUST GO',
    sale: 'Last day. Everything in the store is half off. Some of the shelves are already empty.',
    flavor: ['Somebody is taking the NEW RELEASES sign down one corner at a time.',
      'The TV over the counter is playing a movie nobody rented. The staff are watching it anyway.',
      'The cardboard cutouts from old summer movies are stacked by the bathroom, waiting for a ride.',
      'The drop box out front has a sign on it: THANK YOU FOR EVERY RETURN.'],
    amnesty: 'Late fee amnesty. Today only. The computer forgives everybody.',
    noSell: 'That came from the closing sale. Everybody in town has one now.',
    mgmt: 'Under new management. Still closing.',
    tag: 'Closing Sale', tagShort: 'Sale',
    secCounter: 'Behind the counter',
    wall: 'The New Releases wall is all one movie: {t}. The store bought thirty copies when it came out. All thirty are still here.',
    tapedChip: 'The ending of {t} is a car lot commercial.',
    aucH: 'The cardboard Chet Brickwall · sealed bids',
    auc: 'The life-size cardboard Chet Brickwall is not for sale today. He stands by the door with a shoebox of envelopes taped to his knee. The sign on his chest says SEALED BIDS ONLY · ONE PER CUSTOMER · BEST BID TAKES HIM HOME.',
    aucHow: 'Write one bid, seal it and hand it to the manager. He opens yours first and the rest after, right there at the register (10 min). A tie goes to the first envelope he opened.',
    aucIn: 'There are already {n} envelopes in the shoebox.',
    aucDex: 'One of them is from Dex. He told the manager he will flip Chet for double at his swap meet table.',
    aucNoDex: 'There is no envelope from Dex. He is running late in the rain, and the manager opens the box as soon as yours is in.',
    aucPick: 'Or pick your own bid',
    aucSeal: 'Seal a {$} bid',
    aucLess: 'Five dollars less', aucMore: 'Five dollars more',
    aucBroke: 'You need at least $5 in cash to bid.',
    aucWait: 'The manager is not taking envelopes until somebody is at the counter.',
    two: 'There are two ultra rare things out there today, not one. Nobody knows where either of them is.',
    short: 'Last Day',
    aucDone: 'You already put in your bid today. One per customer.',
    aucOpenH: 'The envelopes are open',
    aucWon: 'The manager writes SOLD on a sticky note and puts it on Chet. He is yours. He fits in the van if you lay him down.',
    aucLost: '{who} takes the cardboard Chet Brickwall home. They carry him out sideways.',
    aucLostDex: 'Dex takes the cardboard Chet Brickwall. "Double by Sunday," he says on the way out.',
    aucWinTag: 'WINS', you: 'You', dex: 'Dex',
    wonChip: 'You won the sealed bid. Chet Brickwall is coming home.',
    resWon: 'Sealed bid: you won the cardboard Chet Brickwall for {$}.',
    resLost: 'Sealed bid: {who} won the cardboard Chet Brickwall with {$}. You bid {mine}.',
    resTaped: 'One of your tapes ends with somebody\'s car lot commercial.',
    town: [['Bernice', 'Bernice from Ocotillo Dr'], ['Hector', 'Hector on Mesquite Ln'], ['Wanda', 'Wanda from Quail Run'], ['Lou', 'Lou on Javelina Ct']]
  };

  // ---------- the two new media gags (kept here, never in NP.MEDIA_GAGS and never in it.gag) ----------
  // An item carries its pack gag in it.d3gag. The note shows through the item's own words (dd), and the value change
  // is folded into the item's own base value when the gag is put on it.
  var GAGS = {
    wall: { note: 'The store bought thirty copies of this one when it came out, and all thirty are still here, on one whole wall. Worth about what you would think.' },
    taped: { mult: 0.5, note: 'The last 20 minutes are not the movie. Somebody taped over the ending with a commercial for Honest Dale\'s Car Lot on Creosote Way, recorded off late night TV. Dale stands on the hood of a station wagon and reads every price out loud. Worth less than a tape with an ending.' }
  };

  // ---------- the movies (all made up, each with a star and one of the base studios) ----------
  // sec: 'new' is a new release (not ex-rental), 'movies' is ex-rental. Values fit the base balance.
  var MOVIES = [
    { id: 'd3_mv01', kind: 'movie', fmt: 'dvd', sec: 'new', year: 2012, wall: true, t: 'Explosion Season', by: 'Every Explosion in Town', lab: 'Big Lobby Pictures', tier: 1, base: 1,
      d: 'An action movie that stops every few minutes so something can blow up. Then it starts again so something else can.', b: 'BIGGER. LOUDER. AGAIN.' },
    { id: 'd3_mv02', kind: 'movie', fmt: 'vhs', sec: 'new', year: 2010, t: 'Hot Dog Cart Heist', by: 'A Crew of Hot Dog Guys', lab: 'Straight to Tape Films', tier: 1, base: 3,
      d: 'Four hot dog cart guys plan one perfect heist at the county fair. The plan has a lot of mustard in it.', b: 'THEY HAD ONE SHOT. AND RELISH.' },
    { id: 'd3_mv03', kind: 'movie', fmt: 'vhs', sec: 'movies', t: 'The Tape That Came Back', by: 'A Very Old Tape', lab: 'Late Fee Home Video', tier: 2, base: 9,
      d: 'A family returns a rented tape. The next morning it is back on their kitchen table, rewound. They return it again. It has a lot of late fees.', b: 'YOU CAN RETURN IT. IT WILL NOT STAY RETURNED.' },
    { id: 'd3_mv04', kind: 'movie', fmt: 'vhs', sec: 'movies', t: 'The Sprinkler at Midnight', by: 'A Lawn Sprinkler', lab: 'Dry Heat Pictures', tier: 2, base: 11,
      d: 'A sprinkler on a desert lawn turns on by itself every night at midnight. There is no lawn. There has never been a lawn.', b: 'IT ONLY WATERS AT NIGHT.' },
    { id: 'd3_mv05', kind: 'movie', fmt: 'vhs', sec: 'movies', t: 'Cul-de-sac Standoff', by: 'A Guy in Camo Shorts', lab: 'Straight to Tape Films', tier: 1, base: 3,
      d: 'One retired neighbor defends his cul-de-sac from a moving truck that parked on his side of the street. It goes on for two hours.', b: 'THIS IS HIS STREET.' },
    { id: 'd3_mv06', kind: 'movie', fmt: 'dvd', sec: 'movies', t: 'Space Mechanic 4: Oil Change in Orbit', by: 'A Man in a Jumpsuit', lab: 'Dry Heat Pictures', tier: 1, base: 3,
      d: 'The fourth one. The space mechanic still has one wrench, and the rocket still makes the same noise. The store never had the first three.', b: 'HE FIXES IT. IN SPACE. AGAIN.' },
    { id: 'd3_mv07', kind: 'movie', fmt: 'dvd', sec: 'movies', t: 'Tuesday at the Laundromat', by: 'Two Very Tired Actors', lab: 'Sunday Matinee Entertainment', tier: 1, base: 2,
      d: 'Two strangers fold laundry at the same table for ninety minutes. One sock goes missing. It is the most exciting part.', b: 'SOME LOADS ARE HEAVIER.' },
    { id: 'd3_mv08', kind: 'movie', fmt: 'vhs', sec: 'movies', t: 'Grandpa Goes Fast', by: 'A Grandpa and a Lawn Mower', lab: 'Sunday Matinee Entertainment', tier: 2, base: 8,
      d: 'A grandpa bolts a lawn chair to his riding mower and enters the big soapbox race. He wins. He also gets a ticket.', b: 'SLOW DOWN, GRANDPA. HE WILL NOT.' },
    { id: 'd3_mv09', kind: 'movie', fmt: 'vhs', sec: 'movies', t: 'My Science Fair Volcano Is Too Big', by: 'A Kid in Safety Goggles', lab: 'Popcorn Ceiling Pictures', tier: 1, base: 4,
      d: 'A kid builds a science fair volcano so big it gets its own weather. The judges give it second place.', b: 'BAKING SODA. VINEGAR. EVERYBODY OUT.' },
    { id: 'd3_mv10', kind: 'movie', fmt: 'dvd', sec: 'movies', t: 'Love at the Returns Counter', by: 'Two Very Nice Actors', lab: 'Big Lobby Pictures', tier: 1, base: 3,
      d: 'She returns a toaster. He works the returns counter. The toaster brings them together. Then it breaks again.', b: 'NO RECEIPT. ALL HEART.' },
    { id: 'd3_mv11', kind: 'movie', fmt: 'vhs', sec: 'movies', t: 'Monster Truck Wedding', by: 'A Monster Truck in a Veil', lab: 'Straight to Tape Films', tier: 2, base: 10,
      d: 'Two monster trucks get married at the county fairgrounds. Everyone cries. The cake does not make it.', b: 'SPEAK NOW OR GET CRUSHED.' },
    { id: 'd3_mv12', kind: 'movie', fmt: 'vhs', sec: 'movies', t: 'He Already Told Me the Ending', by: 'A Very Helpful Employee', lab: 'Two Guys and a Camcorder Productions', tier: 2, base: 12,
      d: 'A video store employee has seen every movie in the store, so he tells you how each one ends before you can rent it. Then the store gets one new movie.', b: 'NO SPOILERS. EXCEPT ALL OF THEM.' }
  ];
  // ---------- the ex-rental games (cartridges, rental sticker still on, on the made-up consoles) ----------
  var GAMES = [
    { id: 'd3_g01', kind: 'game', p: 'k16', g: 'action', tier: 1, base: 6, t: 'Weekend Rental Ninja',
      d: 'A ninja game you can finish in one weekend, which is exactly how long you had it. The last level is the return slot.', b: 'THREE NIGHTS. ONE NINJA.' },
    { id: 'd3_g02', kind: 'game', p: 'fer', g: 'rpg', tier: 2, base: 16, t: 'Overdue Quest: The Long Way Back',
      d: 'An RPG about returning one tape to a store on the other side of the kingdom before midnight. There are a lot of dragons in the way.', b: 'RETURN IT BY MIDNIGHT OR PAY THE PRICE. THE PRICE IS $2.' },
    { id: 'd3_g03', kind: 'game', p: 'k16', g: 'racing', tier: 1, base: 5, t: 'Tow Truck Derby',
      d: 'Every car in the race is a tow truck. When one breaks down, the others tow it. Nobody ever finishes.', b: 'HOOK IT. HAUL IT. HOOK IT AGAIN.' },
    { id: 'd3_g04', kind: 'game', p: 'fer', g: 'puzzle', tier: 2, base: 14, t: 'Password Please',
      d: 'No save battery, so every level ends with a long password. Somebody wrote one on the label in pen. It is for level 3.', b: 'WRITE THIS DOWN.' },
    { id: 'd3_g05', kind: 'game', p: 'pip', g: 'action', tier: 1, base: 4, t: 'Lunch Tray Pinball',
      d: 'A pinball game on a cafeteria lunch tray. The ball is a meatball. The flippers are sporks.', b: 'TILT MEANS SPILL.' },
    { id: 'd3_g06', kind: 'game', p: 'k16', g: 'platformer', tier: 2, base: 18, t: 'Saguaro Kid: Spines of Justice',
      d: 'A little cactus jumps across the whole desert to get his hat back from a hawk. He is very prickly about it.', b: 'HE HAS SPINES. HE HAS JUSTICE.' },
    { id: 'd3_g07', kind: 'game', p: 'fer', g: 'racing', tier: 1, base: 7, t: 'Hovercab Overtime',
      d: 'Drive a floating taxi through a city in the future. The meter is still running when the game ends.', b: 'THE FUTURE HAS TRAFFIC.' },
    { id: 'd3_g08', kind: 'game', p: 'pip', g: 'rpg', tier: 2, base: 15, t: 'Detention Dungeon',
      d: 'An RPG that takes place in one school detention room. The final boss is the clock on the wall. It never moves.', b: 'THE BELL WILL RING. SOMEDAY.' }
  ];
  // the empty clamshells, played straight, and the one ultra rare. The stack is the base kind 'gear' (like the
  // binoculars): it rides in the van, never goes on the shelf and is never appraised, so it scores nothing at all
  // instead of the -10 every piece of merch gets.
  var CLAMS = { id: 'd3_clams', kind: 'gear', ask: 1, t: 'Stack of Empty Giant Clamshell Cases',
    d: 'Six empty giant clamshell cases from the back room. No tapes in them. They close with a very good snap. They ride in the van, not on the shelf.' };
  var UX = { id: 'd3_ux', kind: 'game', p: 'k16', g: 'platformer', tier: 4, base: 240, art: 'd3_g06', t: 'Saguaro Kid: Display Copy',
    d: 'The copy that sat in the front window of this video store for nine years. One side of the box is sun faded almost white. The store\'s own sticker on the back says DISPLAY COPY · DO NOT RENT.',
    b: 'DISPLAY ONLY. ASK AT THE COUNTER.' };
  var ITEMS = MOVIES.concat(GAMES, [CLAMS, UX]);

  // ---------- the five want list entries (NP.GOALS_POOL format) ----------
  // Type 'buy' with f.dlc and an offer tag only this pack passes (not type 'dlc'): with Holiday Rush on first, its
  // goalFeasible and goalTick answer false for every entry that is not theirs, and dlcFirst stops at the first answer,
  // so a 'dlc' entry here would never be asked. This pack picks them (goalPick, with its own check below) and ticks them
  // (api.goalTick('buy', item, { offer: 'd3_w0N' })). Only offered on the Last Day, only when they can be done.
  var GOALS = [
    { id: 'd3_w01', name: 'Highest Bidder', label: 'Win the sealed bid for the cardboard Chet Brickwall', type: 'buy', f: { dlc: ID, offer: 'd3_w01' }, n: 1, d: 'mid', reward: 'The Envelope That Won' },
    { id: 'd3_w02', name: 'Clamshell Collector', label: 'Buy 3 movies in giant clamshells', type: 'buy', f: { dlc: ID, offer: 'd3_w02' }, n: 3, d: 'mid', reward: 'Clamshell Case Latch' },
    { id: 'd3_w03', name: 'The Sticker Stays On', label: 'Buy an ex-rental game with the rental sticker still on', type: 'buy', f: { dlc: ID, offer: 'd3_w03' }, n: 1, d: 'easy', reward: 'Return Slot Flap' },
    { id: 'd3_w04', name: 'Across the Street', label: 'Buy one thing at each video rental store', type: 'buy', f: { dlc: ID, offer: 'd3_w04' }, n: 2, d: 'easy', reward: 'Both Membership Cards' },
    { id: 'd3_w05', name: 'Display Only', label: "Find the store's display copy", type: 'buy', f: { dlc: ID, offer: 'd3_w05' }, n: 1, d: 'hard', reward: 'Sun Faded Window Price Tag' }
  ];

  // ---------- helpers ----------
  function rng(api, tag) { var S = api.state(); return api.mulberry32(api.hash(ID + '|' + (S ? S.seed : '') + '|' + tag)); }
  function whole(n) { return Math.max(1, Math.round(n)); }
  function cash$(api, n) { return api.money(n); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function today(api) { var S = api.state(); return !!(S && S.day && S.day.d3); }
  function rentals(S) { return S && S.day ? S.day.stops.filter(function (x) { return x.type === 'rental' && x.d3; }) : []; }
  function dlcOn(id) { return (NP.DLC_ON || []).indexOf(id) >= 0; }
  function iso(d) { return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
  function mine(b) { return !!b && (!!b.d3sale || String(b.id || '').indexOf(PX) === 0); }
  // the pack's part of the season save: SEASON.dlc.dlc3 = { week: the Last Day's Saturday, done: the Saturday it happened }
  function rec(se) {
    if (!se) return null;
    if (!se.dlc || typeof se.dlc !== 'object' || Array.isArray(se.dlc)) se.dlc = {};
    var r = se.dlc[ID];
    if (!r || typeof r !== 'object' || Array.isArray(r)) r = se.dlc[ID] = {};
    return r;
  }
  function peek(se) { return se && se.dlc && typeof se.dlc === 'object' && se.dlc[ID] && typeof se.dlc[ID] === 'object' ? se.dlc[ID] : null; }
  // a season Saturday the Last Day can land on: Saturday 6 or later, not an Expo Saturday, and with Holiday Rush on,
  // not dated Dec 1 to Dec 24 (Holiday Rush's own rule), so two pack days never land on one Saturday
  function qualifies(api, se, w) {
    if (w < FROM_WEEK || api.expoWeek(w)) return false;
    if (dlcOn('dlc1')) { var d = api.seasonDateOf(se, w); if (d && d.slice(5, 7) === '12' && +d.slice(8, 10) <= 24) return false; }
    return true;
  }
  // the Saturday this season's Last Day falls on (worked out once, then kept; a season already past it when the pack
  // was turned on, or a Saturday that no longer qualifies, gets the next one that does)
  function plan(api, se) {
    if (!se) return 0;
    var R = rec(se);
    if (R.done) return R.done;
    var w0 = se.week || 1;
    if (R.week && R.week >= w0 && qualifies(api, se, R.week)) return R.week;
    var w = Math.max(FROM_WEEK, w0), guard = 0;
    while (!qualifies(api, se, w) && guard++ < 80) w++;
    R.week = w;
    return w;
  }
  function lastDay(api, info) {
    if (info.run === ID) return true;
    if (info.run) return false; // another pack's title day
    return !!(info.season && api.season() && info.week === plan(api, api.season()));
  }
  // Dex is out today when a stop has his raid on the clock, and it is not a rain day (on a rain day he is running late,
  // and he does not make it to the envelopes). In the full game he is out every Saturday, so most Last Days have his bid.
  function dexOut(day) { return !(day.wx && day.wx.id === 'rain') && day.stops.some(function (x) { return !!x.rivalAt; }); }
  function reach(api, st) {
    var S = api.state();
    if (st === S.stop && S.screen === 'stop') return true;
    return !st.visited && S.time + api.costOf(st) < api.endT() - 30;
  }
  function avail(st) { return (st.items || []).filter(function (it) { return it.state === 'avail'; }); }
  // a base story that keeps you from the counter right now (the same test as the base storyGate)
  function gated(s) { var D = s && s.story && NP.STORIES && NP.STORIES[s.story]; return !!(D && !D.coded && D.gate === 'block' && !(s.ss && s.ss.open)); }
  // a gate story with no way through (no choice unblocks it, like the BACK IN 5 MINUTES sign from 2009)
  function deadEnd(D) { return !!(D && D.gate && !D.coded && !(D.choices || []).some(function (c) { return c.unblock; })); }
  // ---------- the short day name ----------
  // The base prints the day name in a few places. Two of them are too narrow for the full name: the season morning
  // forecast label and the share card footer (where it runs into THENOSTALGIAPRO.COM). dayName has no "where" argument,
  // so the pack answers "Last Day" only while those two are being drawn: the season morning label is made in the same
  // moment as the Saturday's buildDay, and the share card is drawn in the same moment as the results hook. The flag is
  // cleared right after (a microtask), so the share text, copied later, still says the full name.
  var SHORT = 0, CALLS = 0;
  function shortFor(free) {
    SHORT = free ? 2 : 1; CALLS = 0; // on a title run the card header (drawn first) has room for the full name
    var clear = function () { SHORT = 0; CALLS = 0; };
    if (typeof Promise !== 'undefined') Promise.resolve().then(clear); else setTimeout(clear, 0);
  }

  // ---------- nothing from the closing sale is bought back ----------
  // The base sell list asks sellQ(item, buyer) for an offer and keeps it in S.sq[stop|buyer|uid]. A Last Day buy gets a
  // "not buying it" answer there, for every kind of buyer, at the stop you are at: the row says NOT BUYING IT, with no
  // Sell, Trade in or Ask for more button, and the game's own sell action refuses it. Bag items only live for the day,
  // so this covers every stop, the swap meet tables included.
  function noSell(api) {
    var S = api.state(); if (!S || !S.stop || !Array.isArray(S.bag) || !NP.BUYERS) return;
    if (!S.sq || typeof S.sq !== 'object') return;
    S.bag.forEach(function (b) {
      if (!mine(b)) return;
      Object.keys(NP.BUYERS).forEach(function (bt) {
        var k = S.stop.id + '|' + bt + '|' + b.uid, o = S.sq[k];
        if (!o || o.state !== 'mad' || !o.d3) S.sq[k] = { offer: 0, max: 0, state: 'mad', line: T.noSell, d3: true, tradein: true };
      });
    });
  }

  // ---------- the pack's things, in the shape makeItem gives (built here, so no base item number is used) ----------
  function make(r, e, uid, sec) {
    var SL = NP.SELLERS.rental || { ask: 0.6, minLo: 0.5, minHi: 0.75 };
    var it = { uid: uid, id: e.id, t: e.t, p: e.p || 'k16', tier: e.tier || 0, base: e.base || 0, g: e.g || '', kind: e.kind, seller: 'rental',
      sticker: false, cond: 'loose', flags: {}, inspected: false, checked: false, state: 'avail', line: '', sec: sec,
      dlc: ID, dd: e.d, db: e.b || '', dtag: 'd3', dlabel: T.tag, d3sale: true };
    it.minFrac = lerp(SL.minLo, SL.minHi, r());
    var jit = lerp(0.85, 1.2, r());
    if (e.kind === 'movie') {
      it.fmt = e.fmt; it.by = e.by; it.lab = e.lab;
      if (e.sec === 'movies') it.flags.rental = true;
      if (it.flags.rental && it.fmt === 'vhs') it.gag = 'clam'; // the base giant clamshell gag (a key the base knows)
      if (e.year) it.year = e.year;
      if (e.wall) { it.d3gag = 'wall'; it.dd = e.d + ' ' + GAGS.wall.note; }
    }
    if (e.kind === 'game') { it.flags.rental = true; it.sticker = true; it.tell = true; } // the base sticker look, and it never comes off
    if (e.kind === 'gear') { it.minFrac = 1; it.ask = e.ask; return it; }
    it.ask = whole(it.base * SL.ask * jit * OFF);
    return it;
  }
  // the display copy: an ultra rare, priced the way makeUltra prices one at a store that is not a pawn shop
  function makeUx(r) {
    var it = make(r, UX, 'd3ux', 'd3counter');
    it.cond = 'cib'; it.ultra = true; it.art = UX.art; it.sticker = true; it.tell = true; it.flags = {}; it.dtag = 'ultra'; it.dlabel = 'Ultra Rare (For Real)';
    var full = UX.base * 2; // complete in box (COND_MULT.cib)
    it.ask = Math.max(5, Math.round(full * (0.2 + r() * 0.3)));
    it.minFrac = 0.8;
    return it;
  }
  function reveal(it) {
    if (!it || it.d3gag !== 'taped' || it.d3rev) return false;
    it.d3rev = true; it.dd = (it.dd || '') + ' ' + GAGS.taped.note;
    return true;
  }

  // ---------- the sealed bid for the cardboard Chet Brickwall ----------
  function aucStop(S) { return rentals(S).filter(function (x) { return x.d3 && x.d3.auc; })[0] || null; }
  function aucBox(api, s) {
    var S = api.state(), A = s.d3.auc, esc = api.esc;
    var h = '<div class="story d3-auc"><div class="story-h">' + esc(T.aucH) + '</div>';
    if (A.state === 'open') {
      h += '<div class="story-t">' + esc(T.auc) + '</div><div class="note">' + esc(T.aucHow) + '</div>' +
        '<div class="note">' + esc(T.aucIn.replace('{n}', A.env.length)) + (A.dex ? ' ' + esc(T.aucDex) : A.rain ? ' ' + esc(T.aucNoDex) : '') + '</div>';
      if (S.day.d3.bid) return h + '<div class="note">' + esc(T.aucDone) + '</div></div>';
      if (gated(s)) return h + '<div class="note warn">' + esc(T.aucWait) + '</div></div>';
      if (S.cash < BID_MIN) return h + '<div class="note warn">' + esc(T.aucBroke) + '</div></div>';
      var top = Math.min(BID_MAX, Math.floor(S.cash / BID_STEP) * BID_STEP), pk = Math.max(BID_MIN, Math.min(top, A.pick || 20));
      h += '<div class="btns d3-quick">';
      QUICK.forEach(function (v) { h += '<button class="offer fair" data-act="dlc" data-dlc="' + ID + '" data-v="bid:' + v + '"' + (v > S.cash ? ' disabled' : '') + '>' + esc(T.aucSeal.replace('{$}', cash$(api, v))) + '</button>'; });
      h += '</div><div class="d3-steph">' + esc(T.aucPick) + '</div><div class="d3-step">' +
        '<button class="d3-sb" data-act="dlc" data-dlc="' + ID + '" data-v="step:-" aria-label="' + esc(T.aucLess) + '"' + (pk <= BID_MIN ? ' disabled' : '') + '>&minus;</button>' +
        '<b class="d3-amt" aria-live="polite">' + esc(cash$(api, pk)) + '</b>' +
        '<button class="d3-sb" data-act="dlc" data-dlc="' + ID + '" data-v="step:+" aria-label="' + esc(T.aucMore) + '"' + (pk >= top ? ' disabled' : '') + '>+</button>' +
        '<button class="offer full" data-act="dlc" data-dlc="' + ID + '" data-v="bid:' + pk + '">' + esc(T.aucSeal.replace('{$}', cash$(api, pk))) + '</button></div>';
      return h + '</div>';
    }
    // the envelopes are open: who won, and every bid
    h += '<div class="story-h d3-openh">' + esc(T.aucOpenH) + '</div><ul class="d3-bids">';
    (A.bids || []).forEach(function (b) {
      var w = b.key === A.win;
      h += '<li' + (w ? ' class="win"' : '') + '>' + esc(b.full) + ': <b>' + esc(cash$(api, b.amt)) + '</b>' + (w ? ' <span class="d3-wtag">' + esc(T.aucWinTag) + '</span>' : '') + '</li>';
    });
    h += '</ul>';
    var wb = (A.bids || []).filter(function (b) { return b.key === A.win; })[0];
    h += '<div class="bubble">' + esc(A.win === 'you' ? T.aucWon : A.win === 'dex' ? T.aucLostDex : T.aucLost.replace('{who}', wb ? wb.full : '')) + '</div>';
    return h + '</div>';
  }
  function bid(api, amt) {
    var S = api.state(), s = S && S.stop;
    if (!s || S.screen !== 'stop' || !s.d3 || !s.d3.auc || s.d3.auc.state !== 'open' || !S.day.d3 || S.day.d3.bid || gated(s)) return;
    amt = Math.floor(+amt);
    if (!(amt >= BID_MIN) || amt > BID_MAX || amt % BID_STEP || amt > S.cash) return;
    var A = s.d3.auc;
    api.actCost(T_BID);
    S.day.d3.bid = amt;
    // yours is the first envelope he opens; a tie goes to the first envelope
    var all = [{ key: 'you', full: T.you, amt: amt }].concat(A.env.map(function (e) { return { key: e.key, full: e.full, amt: e.amt }; }));
    var win = all[0];
    all.forEach(function (b) { if (b.amt > win.amt) win = b; });
    A.bids = all; A.win = win.key; A.state = 'done'; A.mine = amt;
    var call = false;
    if (win.key === 'you') call = takeStandee(api, s, amt);
    else if (win.key === 'dex') api.rivalHit('dex');
    api.track('dlc3_bid_' + (win.key === 'you' ? 'won' : 'lost'));
    api.track('dlc3_bid_' + amt);
    if (win.key !== 'you') api.sfx('reject');
    api.saveSoon();
    if (!api.checkSundown()) { api.render(); if (call) ring(api); }
  }
  // what takeItem does for a standee (takeItem is not in DLC_API): paid, state, the bag copy, S.ev.standee, the
  // standee magnet and track event, and the partner call on the first standee
  function takeStandee(api, s, amt) {
    var S = api.state(), SD = NP.RENTAL && NP.RENTAL.standee || { id: 'chet', t: 'Life-Size Cardboard Chet Brickwall' };
    var it = { uid: 'd3sd', id: SD.id, t: SD.t, p: 'k16', tier: 0, base: 0, g: '', kind: 'standee', seller: 'rental', sticker: false, cond: 'loose',
      flags: {}, inspected: false, checked: false, state: 'sold', line: '', ask: amt, minFrac: 1, sec: 'standee', paid: amt, d3sale: true, d3bid: true };
    S.cash -= amt;
    var b = JSON.parse(JSON.stringify(it)); b.paid = amt; b.stopType = s.type; b.boughtAt = s.id;
    S.bag.push(b);
    S.ev.standee = true; api.track('standee_bought'); api.magnet('standee');
    var call = false;
    if (!S.said.partner) { S.said.partner = true; call = true; }
    // the want list: like any buy, and the pack's own entry
    api.goalTick('buy', it, { price: amt, offer: 'd3bid' });
    if (S.goal && S.goal.id === 'd3_w01') tick(api, 'd3_w01', 'standee');
    // the other packs hear about it the way takeItem tells them (bought), and so does this one
    (NP.DLC_ON || []).forEach(function (id) {
      var P = NP.DLC[id], f = P && P.hooks && P.hooks.bought;
      if (typeof f === 'function') { try { f.call(P, api, it, amt, 'd3bid'); } catch (e) { if (window.console) console.warn('dlc ' + id + ' bought', e); } }
    });
    api.sfx('cash'); api.sfx('accept');
    api.celebrate('good', T.wonChip);
    return call;
  }
  // the partner's phone call (partnerCall and afterBuy are not in DLC_API): the same call the base rings on a standee
  // buy, built the same way, with another pack's own call first if one answers today
  function ring(api) {
    var S = api.state(), esc = api.esc, D = null;
    (NP.DLC_ON || []).forEach(function (id) {
      if (D || id === ID) return;
      var P = NP.DLC[id], f = P && P.hooks && P.hooks.partnerCall;
      if (typeof f === 'function') { try { var x = f.call(P, api); if (x) D = x; } catch (e) {} }
    });
    D = D || (NP.STORIES && NP.STORIES.partner);
    if (!D || !D.answers) return;
    api.track('partner_call');
    var ov = document.createElement('div');
    ov.className = 'callov';
    ov.innerHTML = '<div class="callbox" role="dialog" aria-modal="true" aria-label="Phone call">' + (D.trueStory && NP.TRUE_TAG ? '<span class="truetag">' + esc(NP.TRUE_TAG) + '</span>' : '') +
      '<div class="call-h">&#128241; INCOMING CALL</div><div class="story-t">' + esc(D.text) + '</div><div class="btns">' +
      D.answers.map(function (a, i) { return '<button class="offer fair" data-call="' + i + '">' + esc(a[0]) + '</button>'; }).join('') + '</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-call]'); if (!b) return;
      var a = D.answers[+b.getAttribute('data-call')];
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      api.spend(3);
      S.toast = 'You: "' + a[0] + '" ' + a[1];
      api.magnet('room');
      if (!api.checkSundown()) api.render();
    });
    var f0 = ov.querySelector('button'); if (f0) { try { f0.focus({ preventScroll: true }); } catch (e) { f0.focus(); } }
  }

  // ---------- the want list ----------
  // a stand-in item for this pack's own entries: the game's 'buy' check matches it by f.dlc and the offer tag
  function tick(api, id, kind) { api.goalTick('buy', { uid: 'd3tick', id: 'd3_tick', t: '', kind: kind || 'game', dlc: ID, flags: {}, cond: 'loose' }, { price: 0, offer: id }); }
  function feasible(api, g) {
    var S = api.state(); if (!S || !S.day || !S.day.d3) return false;
    if (api.endT() - S.time < 45) return false;
    var R = rentals(S), near = R.filter(function (st) { return reach(api, st); });
    var items = []; near.forEach(function (st) { avail(st).forEach(function (it) { items.push(it); }); });
    if (g.id === 'd3_w01') { var a = aucStop(S); return !!(a && a.d3.auc.state === 'open' && !S.day.d3.bid && reach(api, a) && S.cash >= 10); }
    if (g.id === 'd3_w02') {
      var cl = items.filter(function (it) { return it.kind === 'movie' && it.gag === 'clam'; }).map(function (it) { return it.ask; }).sort(function (x, y) { return x - y; });
      return cl.length >= 3 && cl[0] + cl[1] + cl[2] <= S.cash;
    }
    if (g.id === 'd3_w03') return items.some(function (it) { return it.kind === 'game' && it.flags && it.flags.rental && it.ask <= S.cash; });
    if (g.id === 'd3_w04') {
      var shop = S.d3shop || {};
      return R.length === 2 && R.every(function (st) { return !shop[st.id] && reach(api, st) && avail(st).length; }) && S.cash >= 2;
    }
    if (g.id === 'd3_w05') return items.some(function (it) { return it.id === UX.id && it.ask <= S.cash; });
    return false;
  }
  // after anything goes in the bag on the Last Day (base buys reach this through the bought hook)
  function afterBuy3(api, it) {
    var S = api.state(); if (!S || !S.day || !S.day.d3) return;
    var s = S.stop, b = null;
    if (it) for (var i = S.bag.length - 1; i >= 0; i--) if (S.bag[i].uid === it.uid) { b = S.bag[i]; break; }
    // anything bought at either store today came from the closing sale (an item a surprise put out there included)
    if (s && s.d3 && it) { it.d3sale = true; if (b) b.d3sale = true; }
    noSell(api);
    if (!s || !s.d3 || !it) return;
    if (reveal(it)) { if (b) { b.dd = it.dd; b.d3rev = true; } api.celebrate('good', T.tapedChip.replace('{t}', it.t)); api.track('dlc3_taped_found'); }
    S.d3shop = S.d3shop || {};
    var first = !S.d3shop[s.id]; S.d3shop[s.id] = 1;
    var g = S.goal && S.goal.id;
    if (g === 'd3_w02' && it.kind === 'movie' && it.gag === 'clam') tick(api, g, 'movie');
    else if (g === 'd3_w03' && it.kind === 'game' && it.flags && it.flags.rental) tick(api, g, 'game');
    else if (g === 'd3_w04' && first) tick(api, g, it.kind === 'gear' || it.kind === 'merch' ? 'game' : it.kind);
    else if (g === 'd3_w05' && it.id === UX.id) tick(api, g, 'game');
    if (it.id === UX.id) api.track('dlc3_ux_bought');
    api.track('dlc3_buy_' + (it.dlc === ID ? 'pack' : it.kind));
  }

  // ---------- the Last Day at the two stores ----------
  function saleBox(api, s) {
    var esc = api.esc, S = api.state();
    var h = '<div class="story d3-sale"><div class="d3-sign" role="img" aria-label="' + esc(T.sign) + '">' + esc(T.sign) + '</div>' +
      '<div class="story-t">' + esc(T.sale) + ' ' + esc(T.flavor[s.d3.fl % T.flavor.length]) + '</div>';
    var w = s.items.filter(function (it) { return it.d3gag === 'wall'; })[0];
    if (w) h += '<div class="note">' + esc(T.wall.replace('{t}', w.t)) + '</div>';
    return h + '</div>';
  }

  // ---------- pictures: the clamshell stack, and the display copy with one side sun faded ----------
  function drawItem(api, ctx, it, ox, oy, k) {
    if (!it || it._d3pass) return false;
    var P = function (x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(ox + x * k, oy + y * k, w * k, h * k); };
    if (it.id === CLAMS.id) {
      for (var i = 0; i < 4; i++) {
        var y = 31 - i * 8;
        P(3, y, 26, 8, '#0b1022'); P(4, y + 1, 24, 6, '#e8e8f0'); P(4, y + 1, 24, 1, '#ffffff'); P(4, y + 6, 24, 1, '#b9bccb');
        P(15, y + 3, 2, 2, '#8a90a0');
      }
      return true;
    }
    if (it.id === UX.id && NP.drawItem) {
      var c = {}; Object.keys(it).forEach(function (key) { c[key] = it[key]; });
      c._d3pass = true;
      NP.drawItem(ctx, c, ox, oy, k);
      ctx.fillStyle = 'rgba(255,241,214,0.55)'; ctx.fillRect(ox + 3 * k, oy + 1 * k, 9 * k, 38 * k);
      ctx.fillStyle = 'rgba(255,241,214,0.25)'; ctx.fillRect(ox + 12 * k, oy + 1 * k, 5 * k, 38 * k);
      return true;
    }
    return false;
  }

  // ---------- the pack ----------
  NP.DLC[ID] = {
    id: ID, name: T.name, prefix: PX,
    data: {
      text: T, gags: GAGS, items: ITEMS, goals: GOALS,
      tags: { d3: T.tag }, tagColors: { d3: ['#c8323c', '#ffcc33'] }, tagShort: { d3: T.tagShort },
      townspeople: T.town.map(function (x) { return x[1]; }),
      car_lot: "Honest Dale's Car Lot on Creosote Way (the taped over ending)"
    },
    css: '.tag.t-d3{background:#c8323c;color:#ffcc33}' +
      '.story.d3-sale{border-left-color:#c8323c}.story.d3-auc{border-left-color:#ff9f43}' +
      '.d3-sign{display:inline-block;background:#ffcc33;color:#c8323c;font-weight:bold;letter-spacing:1px;padding:4px 10px;margin:2px 0 6px;border:3px solid #c8323c;font-size:calc(18px * var(--tsz, 1));line-height:1.2}' +
      '.d3-quick{flex-wrap:wrap}.d3-steph{font-weight:bold;color:#ffcc33;margin:8px 0 2px;font-size:calc(13px * var(--tsz, 1))}' +
      '.d3-step{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:4px 0}' +
      '.d3-step .d3-sb{min-width:44px;min-height:44px;font-weight:bold;font-size:calc(18px * var(--tsz, 1))}' +
      '.d3-amt{display:inline-block;min-width:3.2em;text-align:center;color:#fff1d6;font-size:calc(17px * var(--tsz, 1))}' +
      '.d3-step .offer{flex:1 1 9em}' +
      '.d3-openh{margin-top:6px}.d3-bids{list-style:none;padding:0;margin:4px 0 6px}' +
      '.d3-bids li{padding:2px 0;color:#c9d1dc;font-size:calc(14px * var(--tsz, 1))}.d3-bids li.win{color:#ffcc33}' +
      '.d3-wtag{display:inline-block;background:#ffcc33;color:#0b1022;font-weight:bold;padding:0 6px;margin-left:4px;font-size:calc(12px * var(--tsz, 1))}' +
      '.wk-d3{background:#7a1b22;color:#fff1d6;font-weight:bold;padding:6px 10px;margin:8px 0}' +
      // the display copy's ULTRA RARE (FOR REAL) tag may wrap, so its card fits a 320 wide phone at Larger text
      // (the base ultra cards run 19px wide there; that base rule is left alone)
      '#card-d3ux .tag,.homescr .item:has([data-hart="d3ux"]) .tag{white-space:normal}' +
      '.rc-d3 b{color:#ffcc33}.also.d3-res{color:#ffcc33}.note.d3-mgmt{color:#c9d1dc}',
    hooks: {
      // once, at page load. There is no sell hook, so this listens on the page before the game's own click handler
      // runs, and makes sure a closing sale buy in the sell list is already marked "not buying it" before any sell.
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
      dayName: function (api) {
        if (!today(api)) return undefined;
        if (SHORT === 1) return T.short;
        if (SHORT === 2) return CALLS++ < 2 ? T.name : T.short; // the base asks twice per line (is there one, then the text)
        return T.name;
      },
      // the title entry, under the other pack entries
      menu: function (api) {
        return '<button class="cart-item d3-menu" data-act="dlc" data-dlc="' + ID + '" data-v="start">' + api.esc(T.menu) + ' <small>' + api.esc(T.menuSmall) + '</small></button>';
      },
      act: function (api, v) {
        v = String(v || '');
        var S = api.state();
        if (v === 'start') {
          // the in-game date is the coming Saturday (today counts)
          var p = String(api.phoenixDate()).split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
          d = new Date(d.getTime() + ((6 - d.getUTCDay() + 7) % 7) * 86400000);
          api.track('dlc3_title_start');
          api.startOneDay('sundown', true, { seed: ID + '-' + iso(d) + '-' + Math.random().toString(36).slice(2, 8), dlc: ID });
        } else if (v.indexOf('bid:') === 0) bid(api, v.slice(4));
        else if (v.indexOf('step:') === 0) {
          var s = S && S.stop; if (!s || !s.d3 || !s.d3.auc || s.d3.auc.state !== 'open') return;
          var top = Math.min(BID_MAX, Math.floor(S.cash / BID_STEP) * BID_STEP), A = s.d3.auc;
          var cur = Math.max(BID_MIN, Math.min(top, A.pick || 20));
          A.pick = Math.max(BID_MIN, Math.min(top, cur + (v.slice(5) === '+' ? BID_STEP : -BID_STEP)));
          api.render();
        }
      },
      // the Last Day: both rental stores are open, on top of the usual rotating stores
      stores: function (api, day, info) {
        if (day.d1 || !lastDay(api, info)) return;
        var r = api.mulberry32(api.hash(ID + '|' + info.seed + '|stores'));
        var rs = day.stops.filter(function (x) { return x.type === 'rental' && api.openStop(x); }), forced = false;
        if (rs.length < 2) {
          rs = api.makeStore(r, 'rental');
          rs.forEach(function (x) { x.dlc = ID; });
          day.stops.splice.apply(day.stops, [1 + Math.floor(r() * day.stops.length), 0].concat(rs));
          (day.storeGroups = day.storeGroups || []).push('rental');
          forced = true;
        }
        rs.forEach(function (x, i) {
          x.d3 = { i: i, fl: Math.floor(r() * T.flavor.length) };
          // a sign that never lets you in (BACK IN 5 MINUTES, from 2009) would lock the closing sale, the display copy
          // and the envelopes away all day, so that one comes down on the last day. A gate you can get past (wait for
          // the clerk on his phone, search the wall) stays, exactly as on any other day.
          var SD = x.story && NP.STORIES && NP.STORIES[x.story];
          if (deadEnd(SD)) { x.story = null; x.d3.cleared = true; }
        });
        day.d3 = { a: rs[0].id, b: rs[1].id, forced: forced, bid: 0 };
        var se = info.season && api.season();
        if (se) { var R = rec(se); R.week = info.week; R.done = info.week; }
        if (forced) api.track('dlc3_forced');
      },
      buildDay: function (api, day, info) {
        if (!day.d3) return;
        var r = api.mulberry32(api.hash(ID + '|' + info.seed + '|day'));
        var rs = day.stops.filter(function (x) { return x.d3; }), A = rs[0], B = rs[1];
        if (!A || !B) { delete day.d3; return; }
        // 1. the closing sale: every ex-rental tape goes in a giant clamshell, then the base stock is half off
        rs.forEach(function (s) {
          s.items.forEach(function (it) {
            if (it.kind === 'standee') return;
            if (it.kind === 'movie' && it.fmt === 'vhs' && it.flags && it.flags.rental) {
              if (it.gag === 'rewind' && !it.fixed) it.ask = Math.max(1, it.ask - 1); // the rewind fee goes with the old case
              it.gag = 'clam';
            }
            if (!it.ultra) it.ask = whole(it.ask * OFF);
            it.counter = null; it.d3sale = true;
          });
        });
        // 2. the standee comes off the shelf and goes by the door with the envelopes
        var host = rs.filter(function (s) { return s.items.some(function (it) { return it.kind === 'standee'; }); })[0] || (r() < 0.5 ? A : B);
        host.items = host.items.filter(function (it) { return it.kind !== 'standee'; });
        var town = api.shuffle(r, T.town).slice(0, 2), env = town.map(function (x, i) { return { key: 't' + i, full: x[1], amt: api.pick(r, TOWN_BIDS) }; });
        var dex = dexOut(day);
        if (dex) env.push({ key: 'dex', full: T.dex, amt: api.pick(r, DEX_FLIP) / 2 });
        host.d3.auc = { state: 'open', env: api.shuffle(r, env), dex: dex, rain: !!(day.wx && day.wx.id === 'rain'), pick: 20 };
        // 3. the pack's things: a new release at each store (one of them is the wall), ex-rental movies and carts
        var other = host === A ? B : A, n = 0;
        var uid = function () { return 'd3i' + (n++); };
        var put = function (s, e) { var it = make(r, e, uid(), e.kind === 'game' ? 'games' : e.sec); s.items.push(it); return it; };
        put(A, MOVIES[0]); put(B, MOVIES[1]);
        var mv = api.shuffle(r, MOVIES.slice(2)), gm = api.shuffle(r, GAMES), placed = [];
        for (var i = 0; i < 8; i++) placed.push(put(i % 2 ? B : A, mv[i]));
        for (var j = 0; j < 6; j++) put(j % 2 ? B : A, gm[j]);
        // the taped over ending, on one ex-rental tape (hidden until you Inspect it or buy it; the value is folded in)
        var tapes = placed.filter(function (it) { return it.fmt === 'vhs'; });
        if (tapes.length) { var tp = api.pick(r, tapes); tp.d3gag = 'taped'; tp.base = Math.max(1, Math.round(tp.base * GAGS.taped.mult)); }
        // the empty clamshells go by the door at the store without the envelopes
        put(other, CLAMS).sec = 'standee';
        // the display copy, behind the counter at one of the two stores (the base frame, tag, reveal and magnet do the rest)
        var uxAt = r() < 0.5 ? A : B, ux = makeUx(r);
        day.d3.baseUltra = !!day.ultra || day.stops.some(function (st) { return (st.items || []).concat(st.dig || []).some(function (it) { return it.ultra; }); });
        uxAt.items.push(ux);
        day.ultra = true;
        rs.forEach(function (s) {
          if (s.secs && !s.secs.some(function (sc) { return sc[0] === 'd3counter'; })) s.secs = s.secs.concat([['d3counter', T.secCounter]]);
        });
        // 4. the late fee amnesty: no gate today, and in a season the fee never comes back (the magnet stays unearned)
        var am = false;
        rs.forEach(function (s) { if (s.lateFee) { s.lateFee = false; s.feeLine = T.amnesty; s.d3.amnesty = true; am = true; } });
        var se = info.season && api.season();
        if (se) se.lateFeePaid = true;
        day.d3.amnesty = am; day.d3.ux = uxAt.id;
        if (am) api.track('dlc3_amnesty');
        api.track('dlc3_day_' + (info.season ? 'season' : 'title') + (dex ? '_dex' : ''));
        if (info.season) shortFor(false); // the season morning label is made right after this
      },
      // both rental stores stay on the suggested route all day
      route: function (api, list) {
        if (!today(api)) return undefined;
        list.forEach(function (x) { if (x.d3) x.keep = true; });
        return undefined;
      },
      routeCard: function (api) {
        var S = api.state(); if (!today(api)) return '';
        // two ultra rare things out (the base one and the display copy): the base rumor line under this says one, so
        // the pack says two, on the same card at the same time the base shows its rumor (before the first stop)
        var two = S.day.ultra && S.day.d3.baseUltra && !S.history.length ? '<div class="rc-ultra rc-d3two">' + api.esc(T.two) + '</div>' : '';
        if (!rentals(S).some(function (x) { return !x.visited; })) return two;
        return '<div class="rc-theme rc-d3"><b>' + api.esc(T.name) + '.</b> ' + api.esc(T.route) + '</div>' + two;
      },
      weekdays: function (api, w) {
        var se = api.season(); if (!se) return '';
        var L = plan(api, se), R = peek(se);
        if (R && R.done && R.done < w) return '';
        if (L === w) return '<div class="wk-d3">' + api.esc(T.weekDay.replace('{label}', api.seasonLabelLc(w))) + '</div>';
        if (L === w + 1) return '<div class="wk-d3">' + api.esc(T.weekNext) + '</div>';
        return '';
      },
      arrive: function (api, s) {
        var S = api.state(); if (!S || !S.day) return;
        if (S.day.d3) noSell(api);
        if (s && s.d3 && S.day.d3) api.track('dlc3_arrive' + (s.d3.auc ? '_auction' : ''));
      },
      // stopHTML runs before the base sell list and the item cards in the same render, so the "not buying it" answers
      // and a revealed tape are in place first
      stopHTML: function (api, s) {
        var S = api.state(); if (!S || !S.day || !s) return '';
        if (S.day.d3) {
          noSell(api);
          if (!s.d3) return '';
          s.items.forEach(function (it) { if (it.inspected && reveal(it)) { api.celebrate('good', T.tapedChip.replace('{t}', it.t)); api.track('dlc3_taped_found'); } });
          return saleBox(api, s) + (s.d3.auc ? aucBox(api, s) : '');
        }
        // later that season: one plain line at the rental stores, and nothing else
        var R = S.season && peek(api.season());
        if (s.type === 'rental' && R && R.done && S.week > R.done) return '<div class="note d3-mgmt">' + api.esc(T.mgmt) + '</div>';
        return '';
      },
      bought: function (api, it) { afterBuy3(api, it); },
      results: function (api) {
        var S = api.state(); if (!today(api)) return '';
        shortFor(!!S.free); // the share card is drawn right after this, in the same moment
        var esc = api.esc, h = '<div class="also d3-res">' + esc(T.results) + '</div>';
        var a = aucStop(S), A = a && a.d3.auc;
        if (A && A.state === 'done') {
          var wb = A.bids.filter(function (b) { return b.key === A.win; })[0];
          h += '<div class="also d3-res">' + esc(A.win === 'you' ? T.resWon.replace('{$}', cash$(api, A.mine)) : T.resLost.replace('{who}', wb ? wb.full : '').replace('{$}', cash$(api, wb ? wb.amt : 0)).replace('{mine}', cash$(api, A.mine))) + '</div>';
        }
        if (S.bag.some(function (b) { return b.d3gag === 'taped'; })) h += '<div class="also d3-res">' + esc(T.resTaped) + '</div>';
        return h;
      },
      // the want list: on the Last Day, one of the pack's entries now and then (more often at the rental stores)
      goalPick: function (api, def, ctx) {
        var S = api.state(); if (!S || S.goal || !S.day || !S.day.d3) return undefined;
        if (def && /^d\d+_/.test(def.id)) return undefined; // another pack's pick stands
        var hist = S.goalHist || [], recent = (ctx && ctx.recent) || [];
        var cands = GOALS.filter(function (g) { return hist.indexOf(g.id) < 0 && recent.indexOf(g.id) < 0 && feasible(api, g); });
        if (!cands.length) return undefined;
        var r = rng(api, 'goal|' + S.history.length + '|' + (S.goalsDone || []).length + '|' + hist.length);
        var at = !!(S.stop && S.stop.d3 && S.screen === 'stop');
        var here = at ? cands.filter(function (g) { return g.id === 'd3_w05' ? S.stop.items.some(function (it) { return it.id === UX.id && it.state === 'avail'; }) : g.id === 'd3_w01' ? !!S.stop.d3.auc : true; }) : [];
        if (here.length && r() < 0.85) return api.pick(r, here);
        if (r() < 0.5) return api.pick(r, cands);
        return undefined;
      },
      // these entries are type 'buy', so the game never asks these two; they answer for this pack's ids only
      goalFeasible: function (api, def) { return def && /^d3_/.test(def.id) ? feasible(api, def) : undefined; },
      goalTick: function () { return undefined; },
      drawItem: drawItem
    },
    // for tests and tools: pure helpers and the pack's own buttons
    util: { FROM_WEEK: FROM_WEEK, OFF: OFF, gated: gated, deadEnd: deadEnd, qualifies: qualifies, plan: plan, peek: peek, noSell: noSell, feasible: feasible, bid: bid, ring: ring, GAGS: GAGS }
  };
})();
