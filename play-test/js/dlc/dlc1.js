// Nostalgia Pro DLC 1: Holiday Rush. Full game only (never the demo).
// One December Saturday at The Mall at Parking Lot C: a doorbuster line at Glass Case Games (doors at 9 AM, Slab Steve
// is first in line), a food court with one arcade cabinet (Mall Santa Dash), a holiday kiosk and twelve holiday things.
// Release: Sat Nov 7, 2026 (moved up from Nov 14). There is no date gate: the title entry is playable on any date,
// before or after release (the in-game date is still a December Saturday, from nextHolidaySat below).
// Playable any day from the title screen (HOLIDAY RUSH, under Random Saturday), and once a season on the first
// season Saturday dated Dec 1 to Dec 24 that is not an Expo Saturday.
//
// This file only registers itself. It never edits base data when it loads: game.js merges its sellers, tags, magnets
// and want list entries in only while 'dlc1' is in NP.CONFIG.DLC, and calls the hooks below. Every random number here
// comes from this pack's own seeded generator ('dlc1|' + seed), so the base day is exactly what it was without it.
var NP = window.NP || {};
window.NP = NP;
NP.DLC = NP.DLC || {};
(function () {
  'use strict';
  var ID = 'dlc1', DOORS = 9 * 60;

  // ---------- every word the pack says (house style: plain words, no dashes, played straight) ----------
  var T = {
    name: 'Holiday Rush',
    menu: 'HOLIDAY RUSH', menuSmall: 'a December Saturday at the mall',
    week: '{label} · Holiday Rush. A December Saturday at the mall.',
    route: 'The Mall at Parking Lot C is open all day. The doorbusters at Glass Case Games go at 9 AM, and Slab Steve is already in line.',
    mallBlurb: 'Holiday Rush. Doorbusters at 9 AM, the food court is open, and Slab Steve has been in line since last night.',
    results: 'Holiday Rush · a December Saturday at The Mall at Parking Lot C',
    lineH: 'The doorbuster line',
    doors: 'Doors for the doorbusters open at 9 AM. Three things on a table, at a doorbuster price.',
    place: 'You are number {n} in line. Slab Steve is number 1. He brought a folding chair and a dehumidifier.',
    steve: 'Got here at nine last night. Gerald got the good outlet. I only want the sealed ones. All of the sealed ones.',
    waitBtn: 'Wait in line for the doors (until 9:00 AM)',
    waitNote: 'You can shop the rest of the store first. The line keeps your spot.',
    open: '9:00 AM. The doors slide open and the line moves in. Slab Steve goes straight for the sealed ones. Pay his 20% and they are yours.',
    late: 'So close. The doorbusters went at 9 AM. Slab Steve took every sealed one, and the crowd took most of the rest. One is still on the table.',
    crowd: 'THE CROWD GOT IT',
    secGlass: 'Behind the glass', secDoor: 'The doorbuster table', secKiosk: 'The holiday kiosk (food court)',
    foodH: 'The food court',
    food: 'Pretzel smell, a carousel nobody is riding, and a holiday kiosk with a bow on everything. In the corner, by itself, one arcade cabinet: Mall Santa Dash.',
    dashBtn: 'Play Mall Santa Dash ($1, 5 min)',
    dashBroke: 'You need $1 for the cabinet.',
    dashDone: 'You played Mall Santa Dash: {n} of 3 clean jumps.',
    dashH: 'MALL SANTA DASH',
    dashHow: 'Santa runs across the mall roof. Press JUMP when the light is in the gold to clear the chimney. Three chimneys, one dollar.',
    dashKeys: 'Space or Enter jumps. Escape walks away.',
    dashRound: 'Chimney {n} of 3',
    dashHit: 'Clean jump!', dashMiss: 'Thud. Right into the chimney.',
    dashEnd: ['The cabinet keeps your dollar. It has a family to feed.', 'One clean jump. The cabinet plays four notes of a song it made up.',
      'Two clean jumps. So close to the high score. The high score belongs to somebody named DAD.', 'Three for three. The cabinet flashes NEW HIGH SCORE and plays a whole song it made up.'],
    dashPrize: 'It prints a little ticket. The holiday kiosk trades it for a cassette: {t}.',
    dashJump: 'JUMP', dashClose: 'Back to the food court', dashLeave: 'Walk away',
    dashChip: 'Mall Santa Dash: {n} of 3!',
    call: { title: 'Who is that for?', text: 'Your phone buzzes. It is your partner. "Hey. Quick question. Who is that for?"',
      answers: [["It's a gift.", '"For who?" You will figure that out in the car.'],
        ["It's for both of us.", '"I do not play those." You say you could learn together. There is a long, warm pause.'],
        ["It's for me.", '"That is fair. Happy holidays to you, then." It is a little bit for you.']] },
    box: { t: 'Gift-Wrapped Mystery Box', ask: 5,
      d: 'Wrapped in shiny paper with a stick-on bow. The tag says TO: YOU. FROM: THE KIOSK. It rattles a little.',
      odds: [['junk', 0.72, 'junk'], ['good', 0.24, 'something good'], ['treasure', 0.04, 'a sealed holiday game']],
      btn: 'Buy the wrapped box ($5)', open: 'You tear the paper off. The bow survives. Bows always survive.',
      junk: ['Tissue paper, more tissue paper, and one thing at the very bottom.', 'Under the bow, the tape and a second bow: one thing.'],
      good: ['Under all the tissue paper: something actually good.'],
      treasure: ['Wrapped twice, then wrapped again: a sealed holiday game. Somebody cared about this one.'] }
  };

  // ---------- the twelve holiday things (all made up) ----------
  // Values fit the launch balance: nothing here beats an ultra rare or the Expo prototype.
  var ITEMS = [
    { id: 'd1_tinsel', kind: 'game', t: 'Tinsel Siege: Defend the Tree', p: 'hal', g: 'strategy', tier: 2, base: 18,
      d: 'A strategy game about keeping one holiday tree standing until morning. The enemy is a cat. The cat has a plan.',
      b: 'THE TREE MUST STAND. THE CAT DISAGREES.' },
    { id: 'd1_wrap', kind: 'game', t: 'The Last Minute Wrapper', p: 'k16', g: 'puzzle', tier: 1, base: 9,
      d: 'A puzzle game about wrapping strange shaped gifts before the store closes. The tape always runs out on the last one.',
      b: 'ONE ROLL OF TAPE. FORTY GIFTS. GOOD LUCK.' },
    { id: 'd1_cake', kind: 'game', t: 'Fruitcake Quest: It Weighs Nine Pounds', p: 'fer', g: 'rpg', tier: 2, base: 22,
      d: 'An RPG about carrying one fruitcake across the whole world to give it back to the aunt who sent it. It never gets any lighter.',
      b: 'NOBODY WANTS IT. YOU MUST DELIVER IT.' },
    { id: 'd1_flurry', kind: 'game', t: 'Ninety Percent Chance of Flurries', p: 'lum', g: 'action', tier: 1, base: 7,
      d: "You are a TV weatherman in a desert town, and you promised snow on live TV. You have until the six o'clock news.",
      b: 'IT HAS NOT SNOWED HERE IN 40 YEARS. TONIGHT COULD BE DIFFERENT.' },
    { id: 'd1_knit', kind: 'game', t: 'Grandma Knit This: Purl Fight', p: 'pip', g: 'action', tier: 3, base: 45,
      d: 'A fighting game where every fighter wears a sweater a grandma made. The worse the sweater, the stronger the fighter. The one with the moose on it is unbeatable.',
      b: 'KNIT. PURL. FIGHT.' },
    { id: 'd1_presets', kind: 'music', fmt: 'vinyl', t: 'Holiday Presets', by: 'Synth Lord Kevin', lab: 'Strip Mall Sound', tier: 2, base: 16,
      d: 'Synth Lord Kevin found every bell sound his keyboard came with. There were eleven. He used all eleven on every song.',
      b: 'PRESS ANY KEY FOR FESTIVE.' },
    { id: 'd1_sweaters', kind: 'music', fmt: 'tape', t: 'Matching Sweaters', by: 'Five Matching Jackets', lab: 'Hiss & Pop Tapes', tier: 1, base: 6,
      d: 'The band traded the matching jackets for matching sweaters, for one album only. They still do the key change. They do it twice.',
      b: 'NOW IN WOOL.' },
    { id: 'd1_santa', kind: 'movie', fmt: 'vhs', t: 'Chet Brickwall Works the Gift Wrap Counter', by: 'Chet Brickwall', lab: 'Brickwall Family Films', tier: 1, base: 10,
      d: 'Action star Chet Brickwall takes a job at the mall gift wrap counter for one week. He folds every corner like it is the last scene of a movie. The bows are perfect. The line is out the door.',
      b: 'THIS HOLIDAY, EVERY CORNER IS SHARP.' },
    { id: 'd1_treelot', kind: 'movie', fmt: 'dvd', t: 'The Big City Lawyer Saves the Tree Lot', by: 'Two Very Nice People', lab: 'Sunday Matinee Entertainment', tier: 1, base: 5,
      d: "A lawyer from the big city comes home for the holidays to save her family's tree lot. She falls for the guy who sells the wreaths. You will guess the ending in the first minute. You will watch it anyway.",
      b: 'THIS YEAR SHE LEARNS WHAT REALLY MATTERS. (THE TREE LOT.)' },
    { id: 'd1_box', kind: 'merch', t: 'The Box Was The Best Part', ask: 3,
      d: 'An empty box. A really good one: thick cardboard, a lid that fits just right, a little ribbon to pull it open. There is nothing inside. You already know what you will keep in it.',
      card: 'Not a game. Worth nothing to the appraiser. Very nice box, though.',
      note: 'Worth nothing to the appraiser. You are keeping it anyway. It is a really nice box.' },
    { id: 'd1_receipt', kind: 'merch', t: 'Nostalgia Pro: The Gift Receipt', ask: 2,
      d: 'A gift receipt for something you did not buy, from a store that does not exist. Returns are not accepted.',
      card: 'Official Nostalgia Pro merch. Worth nothing. Comes with its own receipt.',
      note: 'Merch. Worth nothing. At least it came with a receipt.' },
    { id: 'd1_gbox', kind: 'mbox', t: T.box.t, ask: T.box.ask, d: T.box.d }
  ];
  var BY = {}; ITEMS.forEach(function (e) { BY[e.id] = e; });

  // ---------- the six want list entries (only offered on a Holiday Rush Saturday, only when they can be done) ----------
  // type 'dlc' entries are checked by this pack (sub: line, hold, dash). The rest use the game's own types, with f.dlc.
  var GOALS = [
    { id: 'd1_w01', name: 'Early in Line', label: 'Get in the doorbuster line before 9 AM', type: 'dlc', sub: 'line', n: 1, before: DOORS, d: 'easy', reward: 'Folding Line Chair' },
    { id: 'd1_w02', name: 'Off Hold', label: 'Take a sealed doorbuster off hold for Slab Steve', type: 'dlc', sub: 'hold', n: 1, d: 'mid', reward: 'Pulled Hold Tag', atMall: true },
    { id: 'd1_w03', name: 'Food Court Champion', label: 'Play Mall Santa Dash at the food court', type: 'dlc', sub: 'dash', n: 1, d: 'easy', reward: 'Food Court Tray Token', atMall: true },
    { id: 'd1_w04', name: 'Wrapped and Ready', label: 'Buy a gift-wrapped mystery box at the holiday kiosk', type: 'buy', f: { kind: 'mbox', dlc: ID }, n: 1, d: 'easy', reward: 'Bow From the Top of the Box' },
    { id: 'd1_w05', name: 'Holiday Haul', label: 'Buy 2 things with the Holiday Rush tag', type: 'buy', f: { dlc: ID }, n: 2, d: 'mid', reward: 'Snowflake Price Sticker' },
    { id: 'd1_w06', name: 'One of Each, Wrapped', label: 'One of each: a holiday game, holiday music and a holiday movie', type: 'groups',
      groups: [{ kind: 'game', dlc: ID }, { kind: 'music', dlc: ID }, { kind: 'movie', dlc: ID }], n: 3, d: 'hard', reward: 'Gift Tag That Says To: Me' }
  ];
  var MAGNETS = [{ id: 'd1_line', name: 'Doors at Nine', how: 'Get in the doorbuster line before 9 AM on a Holiday Rush Saturday.' }];
  var SELLERS = {
    d1kiosk: { name: 'Kiosk Kayla (seasonal help)', ask: 1, minLo: 0.7, minHi: 0.9,
      hi: ['Every gift comes with a bow. You do not pay for the bow. Nobody knows who pays for the bow.', 'I started Tuesday. I already know where everything is. It is all on this one table.'],
      yes: ['Want it wrapped? It is already wrapped. Everything here is always wrapped.', 'Happy holidays. I have to say that. I also mean it.'],
      no: ['My manager says no. My manager is a laminated sign.', 'I would, but the register is older than me.'] }
  };

  // ---------- helpers ----------
  function rng(api, tag) { var S = api.state(); return api.mulberry32(api.hash(ID + '|' + (S ? S.seed : '') + '|' + tag)); }
  function today(api) { var S = api.state(); return !!(S && S.day && S.day.d1); }
  function mallOf(S) { return S && S.day ? S.day.stops.filter(function (x) { return x.d1mall; })[0] || null : null; }
  function atMall(S) { return !!(S && S.stop && S.stop.d1mall && S.stop.d1); }
  function iso(d) { return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
  // the title entry's date: the next Saturday from today that falls on Dec 1 to Dec 24 (today counts)
  function nextHolidaySat(ds) {
    var p = String(ds).split('-').map(Number);
    var t = Math.max(Date.UTC(p[0], p[1] - 1, p[2]), Date.UTC(p[0], 11, 1));
    var d = new Date(t + ((6 - new Date(t).getUTCDay() + 7) % 7) * 86400000);
    if (d.getUTCMonth() !== 11 || d.getUTCDate() > 24) {
      var n = Date.UTC(p[0] + 1, 11, 1);
      d = new Date(n + ((6 - new Date(n).getUTCDay() + 7) % 7) * 86400000);
    }
    return iso(d);
  }
  // a season Saturday is the Holiday Saturday when it is dated Dec 1 to Dec 24, it is not an Expo Saturday,
  // and this season has not had its Holiday Saturday for that year yet (SEASON.dlc.dlc1.days[year])
  function holidayWeek(api, se, week) {
    if (!se) return false;
    var date = api.seasonDateOf(se, week);
    if (!date || date.slice(5, 7) !== '12' || +date.slice(8, 10) > 24) return false;
    if (api.expoWeek(week)) return false;
    var rec = se.dlc && se.dlc[ID], had = rec && rec.days && rec.days[date.slice(0, 4)];
    return !had || had === date;
  }
  function stamp(it, e) {
    it.dlc = ID; it.dd = e.d || ''; it.db = e.b || '';
    if (it.kind === 'merch') { it.dtag = 'merch'; it.dcard = e.card || ''; it.dnote = e.note || ''; }
    else { it.dtag = 'd1'; it.dlabel = T.name; }
    return it;
  }
  // one holiday thing, made with this pack's random numbers
  function make(api, r, id, o) {
    o = o || {};
    var e = BY[id];
    var it = api.makeItem(r, { id: e.id, t: e.t, p: e.p || 'k16', tier: e.tier || 0, base: e.base || 0, g: e.g || '' },
      { kind: e.kind, seller: o.seller || 'friendly', ask: o.ask != null ? o.ask : e.kind === 'merch' || e.kind === 'mbox' ? e.ask : null, tested: o.tested, cibP: o.cibP, sealedP: o.sealedP });
    if (e.kind === 'music' || e.kind === 'movie') { it.fmt = e.fmt; it.by = e.by; it.lab = e.lab; it.cond = 'loose'; }
    if (e.kind === 'game') { it.flags = it.flags || {}; it.flags.repro = false; it.flags.reseal = false; it.tell = true; }
    if (o.cond) it.cond = o.cond;
    if (o.uid) it.uid = o.uid;
    if (o.sec != null) it.sec = o.sec;
    if (e.kind === 'mbox') { it.minFrac = 1; it.sticker = false; it.boxBtn = T.box.btn; }
    if (e.kind === 'merch') it.minFrac = 1;
    return stamp(it, e);
  }

  // ---------- the doorbuster line ----------
  function openDoors(api, s, late) {
    var S = api.state(), L = s.d1;
    if (!L || (L.phase !== 'before' && L.phase !== 'line')) return;
    (L.door || []).forEach(function (it) { if (s.items.indexOf(it) < 0 && !s.items.some(function (x) { return x.uid === it.uid; })) s.items.push(it); });
    var door = s.items.filter(function (it) { return it.d1door; });
    L.door = [];
    if (late) {
      var took = 0, rest = door.filter(function (it) { return it.cond !== 'sealed'; });
      door.forEach(function (it) { if (it.cond === 'sealed' && it.state === 'avail') { it.state = 'gone'; it.goneBy = 'steve'; it.line = ''; took++; } });
      rest.slice(0, Math.max(0, rest.length - 1)).forEach(function (it) { if (it.state === 'avail') { it.state = 'gone'; it.goneBy = 'crowd'; it.goneStamp = T.crowd; it.line = ''; } });
      if (took) api.rivalHit('steve');
      L.phase = 'late';
      api.track('dlc1_doors_late');
    } else {
      L.phase = 'open';
      api.track('dlc1_doors_open');
    }
  }

  // ---------- Mall Santa Dash (one short card: three timing jumps, $1, 5 minutes, once a Saturday) ----------
  var ZW = 0.22; // the gold window is 22% of the bar
  var dashUI = null;
  function dashReward(api, s, hits) {
    var S = api.state(), D = s.d1.dash;
    if (D.done) return;
    D.done = true; D.hits = hits;
    var pts = [0, 3, 8, 15][hits] || 0;
    if (pts) api.bonus('Mall Santa Dash', pts);
    if (hits === 3) {
      api.comboUp(1);
      var r = rng(api, 'dashprize');
      if (r() < 1 / 3) {
        var it = make(api, r, 'd1_sweaters', { seller: 'd1kiosk', ask: 0, uid: 'd1prize' });
        it.state = 'sold'; it.paid = 0;
        var b = JSON.parse(JSON.stringify(it)); b.paid = 0; b.stopType = s.type; b.boughtAt = s.id;
        S.bag.push(b);
        D.prize = it.t;
        api.track('dlc1_dash_prize');
      }
    }
    api.goalTick('d1dash');
    api.track('dlc1_dash_' + hits);
    api.celebrate(hits === 3 ? 'big' : 'good', T.dashChip.replace('{n}', hits) + (pts ? ' +' + pts + ' points' : ''));
  }
  function dashDraw(cv, st, api) {
    var g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.imageSmoothingEnabled = false;
    var P = function (x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    P(0, 0, W, H, '#0b1022');
    for (var i = 0; i < 14; i++) P((i * 37 + 11) % W, (i * 13 + 5) % 40, 1, 1, i % 3 ? '#c3c8ff' : '#ffcc33');
    // the mall roof, with fake snow on it, and the next chimney
    P(0, 58, W, 14, '#3a3f55'); P(0, 56, W, 3, '#e8e8f0');
    var cx = 150; P(cx, 40, 18, 18, '#a83232'); P(cx - 2, 37, 22, 4, '#e8e8f0'); P(cx + 4, 44, 4, 3, '#7a1b22'); P(cx + 11, 50, 4, 3, '#7a1b22');
    // Santa, running (up in the air for a moment after a clean jump)
    var up = st.jumpT && Date.now() - st.jumpT < 600 && st.lastHit ? 18 : 0, sx = st.lastHit && up ? 132 : 60, sy = 38 - up;
    P(sx, sy, 10, 12, '#e4343e'); P(sx + 2, sy - 6, 6, 6, '#f1c28e'); P(sx + 1, sy - 9, 8, 4, '#e4343e'); P(sx + 7, sy - 10, 3, 2, '#ffffff');
    P(sx + 2, sy - 1, 6, 4, '#ffffff'); P(sx, sy + 6, 10, 2, '#1b1b22'); P(sx + 4, sy + 6, 2, 2, '#ffcc33');
    var leg = Math.floor(Date.now() / 160) % 2 && !up;
    P(sx + 1, sy + 12, 3, leg ? 4 : 3, '#1b1b22'); P(sx + 6, sy + 12, 3, leg ? 3 : 4, '#1b1b22');
    // the timing bar
    var bx = 20, bw = W - 40, by = 78;
    P(bx - 2, by - 2, bw + 4, 14, '#3a4d82'); P(bx, by, bw, 10, '#16213e');
    P(bx + st.zone * bw, by, ZW * bw, 10, '#ffcc33');
    P(bx + st.pos * bw - 1, by - 4, 3, 18, '#ffffff');
  }
  function dashOpen(api) {
    var S = api.state(), s = S && S.stop;
    if (!atMall(S) || s.d1.dash.played) return;
    if (S.cash < 1) { S.toast = T.dashBroke; api.render(); return; }
    S.cash -= 1;
    s.d1.dash = { played: true, hits: 0, round: 0, done: false };
    api.actCost(5);
    api.track('dlc1_dash_play');
    if (api.checkSundown()) return;
    api.render();
    var calm = api.calm(), coarse = false;
    try { coarse = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window); } catch (e) {}
    var ov = document.createElement('div');
    ov.className = 'callov dlcov d1dash';
    ov.innerHTML = '<div class="callbox d1d-box" role="dialog" aria-modal="true" aria-labelledby="d1d-h" aria-describedby="d1d-t">' +
      '<div class="d1d-h" id="d1d-h">' + api.esc(T.dashH) + '</div>' +
      '<div class="story-t" id="d1d-t">' + api.esc(T.dashHow) + (coarse ? '' : ' ' + api.esc(T.dashKeys)) + '</div>' +
      '<canvas class="d1d-cv" width="240" height="96" role="img" aria-label="Santa running across the mall roof toward a chimney, and a timing bar with a gold window."></canvas>' +
      '<div class="d1d-s" aria-live="polite">' + api.esc(T.dashRound.replace('{n}', 1)) + '</div>' +
      '<div class="btns"><button class="big d1d-jump" data-dash="jump">' + api.esc(T.dashJump) + '</button><button data-dlcx="1">' + api.esc(T.dashLeave) + '</button></div></div>';
    document.body.appendChild(ov);
    var cv = ov.querySelector('.d1d-cv'), msg = ov.querySelector('.d1d-s'), jump = ov.querySelector('.d1d-jump'), x = ov.querySelector('[data-dlcx]');
    var zr = rng(api, 'dashzone');
    var st = { round: 0, pos: 0, dir: 1, zone: 0.2 + zr() * 0.56, t0: Date.now(), busy: false, lastHit: false, jumpT: 0 };
    function tick() {
      if (!document.body.contains(cv)) { close(true); return; }
      if (!st.busy) {
        if (calm) { st.pos += st.dir / 12; if (st.pos >= 1) { st.pos = 1; st.dir = -1; } else if (st.pos <= 0) { st.pos = 0; st.dir = 1; } }
        else { var ph = ((Date.now() - st.t0) % 1400) / 700; st.pos = ph <= 1 ? ph : 2 - ph; }
      }
      cv.setAttribute('data-pos', st.pos.toFixed(3)); cv.setAttribute('data-zone', st.zone.toFixed(3));
      dashDraw(cv, st, api);
    }
    var timer = setInterval(tick, calm ? 260 : 33);
    tick();
    function doJump() {
      if (st.busy || s.d1.dash.done) return;
      var hit = st.pos >= st.zone - 0.005 && st.pos <= st.zone + ZW + 0.005;
      st.busy = true; st.lastHit = hit; st.jumpT = Date.now();
      if (hit) s.d1.dash.hits++;
      st.round++; s.d1.dash.round = st.round;
      api.sfx(hit ? 'coin' : 'reject');
      msg.textContent = (hit ? T.dashHit : T.dashMiss) + (st.round < 3 ? ' ' + T.dashRound.replace('{n}', st.round + 1) : '');
      setTimeout(function () {
        if (!document.body.contains(cv)) return;
        if (st.round >= 3) {
          dashReward(api, s, s.d1.dash.hits);
          var D = s.d1.dash;
          msg.textContent = T.dashEnd[D.hits] + (D.prize ? ' ' + T.dashPrize.replace('{t}', D.prize) : '');
          jump.hidden = true; x.textContent = T.dashClose;
          try { x.focus({ preventScroll: true }); } catch (e) { x.focus(); }
          return;
        }
        st.zone = 0.2 + zr() * 0.56; st.busy = false; st.lastHit = false; st.t0 = Date.now(); if (calm) { st.pos = 0; st.dir = 1; }
      }, calm ? 500 : 650);
    }
    function close(silent) {
      if (!dashUI) return;
      clearInterval(timer);
      window.removeEventListener('keydown', key, true);
      dashUI = null;
      if (!s.d1.dash.done) dashReward(api, s, s.d1.dash.hits); // walked away: the jumps made so far count, the rest are misses
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      var S2 = api.state();
      if (!silent && S2 && S2.stop === s && S2.screen === 'stop') api.render();
    }
    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      var onX = document.activeElement === x;
      if ((e.key === ' ' || e.key === 'Spacebar' || (e.key === 'Enter' && !onX)) && !jump.hidden) { e.preventDefault(); e.stopPropagation(); doJump(); }
    }
    window.addEventListener('keydown', key, true);
    ov.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-dash],[data-dlcx]');
      if (!b) return;
      e.stopPropagation();
      if (b.hasAttribute('data-dlcx')) close(); else doJump();
    });
    dashUI = { close: close, jump: doJump };
    try { jump.focus({ preventScroll: true }); } catch (e) { jump.focus(); }
  }
  // the cabinet, small, next to the food court text
  function drawCab(cv) {
    var g = cv.getContext('2d'), k = 2; g.imageSmoothingEnabled = false;
    var P = function (x, y, w, h, c) { g.fillStyle = c; g.fillRect(x * k, y * k, w * k, h * k); };
    g.clearRect(0, 0, cv.width, cv.height);
    P(2, 0, 16, 28, '#0b1022'); P(3, 1, 14, 26, '#1d2b53'); P(3, 1, 14, 4, '#e4343e'); P(5, 2, 10, 2, '#ffcc33');
    P(5, 7, 10, 8, '#29d3e8'); P(8, 10, 3, 3, '#e4343e'); P(8, 9, 3, 1, '#ffffff'); P(5, 14, 10, 1, '#e8e8f0');
    P(3, 17, 14, 4, '#3a4d82'); P(6, 18, 2, 2, '#e4343e'); P(11, 18, 2, 2, '#ffcc33'); P(14, 18, 2, 2, '#29d3e8');
    P(7, 23, 6, 2, '#0b1022'); P(8, 23, 4, 1, '#ffcc33');
  }

  // ---------- pixel pictures for the holiday games and gags (16x16, drawn in code) ----------
  var PAL = { k: '#0b1022', g: '#2d8a3e', G: '#1f5e2b', r: '#e4343e', R: '#7a1b22', y: '#ffcc33', w: '#fff1d6', W: '#ffffff', b: '#8a5e36', B: '#5a3b22',
    c: '#29d3e8', p: '#ff77a8', n: '#1d2b53', s: '#c9d1dc', o: '#ffa300', u: '#29adff' };
  var ICONS = {
    d1_tinsel: { bg: '#1d2b53', px: ['................', '.......yy.......', '.......gg.......', '......gggg......', '.....ggrggg.....', '......gggg......', '.....gggggg.....',
      '....ggygggrg....', '.....gggggg.....', '....gggggggg....', '...ggrgggggyg...', '..gggggggggggg..', '.......BB.......', '....rrr.BB.ccc..', '....ryr....cyc..', '....rrr....ccc..'] },
    d1_wrap: { bg: '#1d2b53', px: ['................', '......y..y......', '.......yy.......', '..rrrrryyrrrrr..', '..rrrrryyrrrrr..', '..yyyyyyyyyyyy..', '..rrrrryyrrrrr..',
      '..rrrrryyrrrrr..', '..rrrrryyrrrrr..', '..rrrrryyrrrrr..', '..rrrrryyrrrrr..', '..rrrrryyrrrrr..', '................', '.ssss...........', 's.kks.sssss.....', '.ssss...........'] },
    d1_cake: { bg: '#1d2b53', px: ['................', '................', '................', '....bbbbbbbb....', '...bwwwwwwwwb...', '..bwwwwwwwwwwb..', '..bbbbbbbbbbbb..',
      '..brbgbbybrbgb..', '..bbbbrbbbbbbb..', '..bgbbbbyrbbgb..', '..bbybbgbbbbbb..', '..brbbbbbgbbrb..', '..BBBBBBBBBBBB..', '................', '..kkkkkkkkkkkk..', '................'] },
    d1_flurry: { bg: '#1d2b53', px: ['................', '.....wwww.......', '...wwwwwwww.....', '..wwwwwwwwwww...', '.wwwwwwwwwwwww..', '.wwwwwwwwwwwww..', '..sssssssssss...',
      '................', '........W.......', '.......WWW......', '........W.......', '................', '..yyyyyyyyyyyy..', '..oooooooooooo..', '..oooooooooooo..', '................'] },
    d1_knit: { bg: '#1d2b53', px: ['................', '....rrr..rrr....', '..rrrrrrrrrrrr..', '.rrrwrrrrrrwrrr.', '.rrrrrwrrwrrrrr.', 'rrr.rrrwwrrr.rrr', 'rr..rrrrrrrr..rr',
      'rr..rgrgrgrg..rr', 'ww..grgrgrgr..ww', '....rrrrrrrr....', '....rrwrrwrr....', '....rrrrrrrr....', '....wwwwwwww....', '................', '................', '................'] },
    d1_box: { bg: '#3a4d82', px: ['................', '................', '..bbbbbbbbbbbb..', '..BBBBBBBBBBBB..', '................', '...bbbbbbbbbb...', '...bwwwwwwwwb...',
      '...bwwwwwwwwb...', '...bbbbbbbbbb...', '...bbbbrrbbbb...', '...bbbbrrbbbb...', '...bbbbbbbbbb...', '...BBBBBBBBBB...', '................', '................', '................'] },
    d1_receipt: { bg: '#3a4d82', px: ['................', '....wwwwwwww....', '....wkkkkkkw....', '....wwwwwwww....', '....wkkkwkkw....', '....wwwwwwww....', '....wkkwkkkw....',
      '....wwwwwwww....', '....wkkkkkww....', '....wwwwwwww....', '....wrrrrrrw....', '....wwwwwwww....', '....w.ww.ww.....', '................', '................', '................'] }
  };

  // ---------- the pack ----------
  NP.DLC[ID] = {
    id: ID, name: T.name, prefix: 'd1_',
    data: {
      text: T, items: ITEMS, goals: GOALS, magnets: MAGNETS, sellers: SELLERS,
      tags: { d1: 'Holiday Rush' }, tagColors: { d1: ['#e4343e', '#fff1d6'] }, tagShort: { d1: 'Holiday' },
      stops: ['Glass Case Games, Holiday Rush (The Mall at Parking Lot C: the doorbuster table, the food court and the holiday kiosk)'],
      cabinet: 'Mall Santa Dash (the arcade cabinet in the food court)'
    },
    css: '.tag.t-d1{background:#e4343e;color:#fff1d6}' +
      '.wk-dlc{background:#1f5e2b;color:#fff1d6;font-weight:bold;padding:6px 10px;margin:8px 0}' +
      '.rc-d1 b{color:#ffcc33}.also.d1-res{color:#ffcc33}' +
      '.story.d1-line{border-left-color:#e4343e}.story.d1-food{border-left-color:#29d3e8;overflow:hidden}' +
      '.d1-place{font-weight:bold;color:#ffcc33;font-size:calc(17px * var(--tsz, 1));margin:4px 0}' +
      '.d1-cab{float:right;width:40px;height:56px;image-rendering:pixelated;margin:2px 0 4px 10px}' +
      '.d1dash .callbox{border-color:#e4343e}' +
      '.d1d-h{color:#ffcc33;font-weight:bold;font-size:calc(18px * var(--tsz, 1));margin:2px 0 4px;letter-spacing:1px}' +
      '.d1d-cv{display:block;width:100%;height:auto;image-rendering:pixelated;border:2px solid #3a4d82;margin:8px 0;box-sizing:border-box}' +
      '.d1d-s{color:#fff1d6;font-weight:bold;min-height:2.6em;font-size:calc(14px * var(--tsz, 1))}' +
      '.d1dash .btns button[hidden]{display:none}' +
      '.d1dash .callbox{max-height:94vh;max-height:94dvh;overflow-y:auto}' +
      // short screens (phones turned sideways): the picture beside the words, the buttons in one row
      '@media (max-height:520px) and (min-width:560px){.d1dash .callbox{max-width:700px;display:grid;grid-template-columns:1fr 1fr;column-gap:14px;align-items:start}' +
      '.d1dash .d1d-h,.d1dash #d1d-t,.d1dash .d1d-s{grid-column:1}.d1dash .d1d-cv{grid-column:2;grid-row:1 / span 3;margin:4px 0 0}' +
      '.d1dash .callbox .btns{grid-column:1 / span 2;flex-direction:row;gap:8px}.d1dash .callbox .btns button{flex:1}}',
    hooks: {
      dayName: function (api) { return today(api) ? T.name : undefined; },
      // the title entry, right under Random Saturday
      menu: function (api) {
        return '<button class="cart-item d1-menu" data-act="dlc" data-dlc="' + ID + '" data-v="start">' + api.esc(T.menu) + ' <small>' + api.esc(T.menuSmall) + '</small></button>';
      },
      act: function (api, v) {
        var S = api.state();
        if (v === 'start') {
          var seed = ID + '-' + nextHolidaySat(api.phoenixDate()) + '-' + Math.random().toString(36).slice(2, 8);
          api.track('dlc1_title_start');
          api.startOneDay('sundown', true, { seed: seed, dlc: ID });
        } else if (v === 'wait') {
          if (!atMall(S) || S.stop.d1.phase !== 'line') return;
          if (S.time < DOORS) S.time = DOORS;
          openDoors(api, S.stop, false);
          api.track('dlc1_line_waited');
          api.maybeGoal();
          if (!api.checkSundown()) api.render();
        } else if (v === 'dash') dashOpen(api);
      },
      // the mall is always open on a Holiday Saturday (on top of the usual rotating stores), and never a U-turn
      stores: function (api, day, info) {
        var holiday = info.run === ID || (info.season && holidayWeek(api, api.season(), info.week));
        if (!holiday) return;
        var r = api.mulberry32(api.hash(ID + '|' + info.seed + '|stores'));
        var mall = day.stops.filter(function (x) { return x.type === 'mall' && api.openStop(x); })[0];
        if (!mall) {
          mall = api.makeStore(r, 'mall')[0];
          mall.dlc = ID;
          day.stops.splice(1 + Math.floor(r() * day.stops.length), 0, mall);
          (day.storeGroups = day.storeGroups || []).push('mall');
        }
        if (mall.scene !== 'case') { mall.scene = 'case'; mall.caseStep = 0; mall.caseLog = []; }
        // nothing blocks the counter today (a clerk on the phone would block the doorbusters too)
        var SD = mall.story && NP.STORIES[mall.story];
        if (SD && SD.gate) mall.story = null;
        mall.d1mall = true; mall.keep = true; mall.blurb = T.mallBlurb;
        mall.rivals = mall.rivals || [];
        day.d1 = { mall: mall.id, date: (String(info.seed).match(/\d{4}-\d{2}-\d{2}/) || [''])[0] };
      },
      buildDay: function (api, day, info) {
        if (!day.d1) return;
        var S = api.state(), r = api.mulberry32(api.hash(ID + '|' + info.seed + '|day'));
        var mall = day.stops.filter(function (x) { return x.d1mall; })[0]; if (!mall) return;
        // Slab Steve is at the mall today, and only there. He has been in line since last night.
        day.stops.forEach(function (x) { if (x.rivals) x.rivals = x.rivals.filter(function (id) { return id !== 'steve'; }); });
        mall.rivals.push('steve');
        day.rivals = day.rivals || ['dex'];
        if (day.rivals.indexOf('steve') < 0) day.rivals.push('steve');
        // the doorbuster table: on the table at 9 AM, at a doorbuster price (firm)
        var door = [
          make(api, r, 'd1_tinsel', { seller: 'mall', ask: 15, cond: 'sealed', uid: 'd1db0', sec: 'd1door' }),
          make(api, r, 'd1_wrap', { seller: 'mall', ask: 8, cond: 'sealed', uid: 'd1db1', sec: 'd1door' }),
          make(api, r, 'd1_presets', { seller: 'mall', ask: 6, uid: 'd1db2', sec: 'd1door' })
        ];
        door.forEach(function (it) { it.d1door = true; it.minFrac = 1; });
        // the holiday kiosk in the food court
        var kiosk = [
          make(api, r, 'd1_gbox', { seller: 'd1kiosk', uid: 'd1k0', sec: 'd1kiosk' }),
          make(api, r, 'd1_gbox', { seller: 'd1kiosk', uid: 'd1k1', sec: 'd1kiosk' }),
          make(api, r, 'd1_box', { seller: 'd1kiosk', uid: 'd1k2', sec: 'd1kiosk' }),
          make(api, r, 'd1_receipt', { seller: 'd1kiosk', uid: 'd1k3', sec: 'd1kiosk' }),
          make(api, r, 'd1_sweaters', { seller: 'd1kiosk', uid: 'd1k4', sec: 'd1kiosk' }),
          make(api, r, 'd1_santa', { seller: 'd1kiosk', uid: 'd1k5', sec: 'd1kiosk' })
        ];
        kiosk.forEach(function (it) { mall.items.push(it); });
        mall.secs = [['', T.secGlass], ['d1door', T.secDoor], ['d1kiosk', T.secKiosk]];
        mall.d1 = { door: door, phase: 'before', place: 0, dash: { played: false, hits: 0, round: 0, done: false } };
        // a few more holiday things around town today
        var open = function (types) { return day.stops.filter(function (x) { return api.openStop(x) && !x.d1mall && types.indexOf(x.type) >= 0; }); };
        var th = open(['thrift']), yd = open(['yard']), pw = open(['pawn']);
        if (th.length) { var t1 = api.pick(r, th); t1.items.push(make(api, r, 'd1_cake', { seller: t1.seller || 'friendly', uid: 'd1x0', sec: '' })); }
        if (th.length) { var t2 = api.pick(r, th); t2.items.push(make(api, r, 'd1_treelot', { seller: t2.seller || 'friendly', uid: 'd1x1', sec: t2.secs ? 'movies' : '' })); }
        if (pw.length) { var p1 = pw[0]; p1.items.push(make(api, r, 'd1_flurry', { seller: 'pawn', tested: true, uid: 'd1x2', sec: '' })); }
        if (yd.length && r() < 0.5) { var y1 = api.pick(r, yd); y1.items.push(make(api, r, 'd1_knit', { seller: y1.seller || 'friendly', uid: 'd1x3', sec: '' })); }
        // the phone call happens today, on the first buy of $15 or more (Grok Bot dlc1: was $20, which no doorbuster
        // reaches: Tinsel Siege is $15, or $18 off hold, so the call now comes up at the doorbuster table)
        day.partner = true; day.partnerAt = 15;
        // a season keeps one Holiday Saturday a year
        var se = info.season && api.season();
        if (se && day.d1.date) {
          se.dlc = se.dlc && typeof se.dlc === 'object' ? se.dlc : {};
          var rec = se.dlc[ID] = se.dlc[ID] && typeof se.dlc[ID] === 'object' ? se.dlc[ID] : {};
          rec.days = rec.days || {}; rec.days[day.d1.date.slice(0, 4)] = day.d1.date; rec.done = day.d1.date;
        }
        // the first want list entry is up as the day starts: get in line before the doors
        var w1 = GOALS[0];
        if (S && !S.goal && S.time + api.costOf(mall) < DOORS - 5) api.startGoal(w1, true);
        api.track('dlc1_day_' + (info.season ? 'season' : 'title'));
      },
      // following the big NEXT button gets you to the mall before the 9 AM doors
      route: function (api, list) {
        var S = api.state(); if (!today(api)) return undefined;
        var m = list.filter(function (x) { return x.d1mall; })[0];
        if (!m || S.time + api.costOf(m) >= DOORS) return undefined;
        return [m].concat(list.filter(function (x) { return x !== m; }));
      },
      routeCard: function (api) {
        var S = api.state(); if (!today(api)) return '';
        var m = mallOf(S); if (!m || m.visited) return '';
        return '<div class="rc-theme rc-d1"><b>' + api.esc(T.name) + '.</b> ' + api.esc(T.route) + '</div>';
      },
      weekdays: function (api, w) {
        if (!holidayWeek(api, api.season(), w)) return '';
        return '<div class="wk-dlc">' + api.esc(T.week.replace('{label}', api.seasonLabelLc(w))) + '</div>';
      },
      arrive: function (api, s) {
        var S = api.state();
        if (!s.d1mall || !s.d1 || !today(api)) return;
        if (S.time < DOORS) {
          s.d1.phase = 'line';
          s.d1.place = 2 + Math.max(0, Math.floor((S.time - (7 * 60 + 30)) / 6));
          api.magnet('d1_line');
          api.track('dlc1_line_' + Math.min(s.d1.place, 20));
        } else openDoors(api, s, true);
      },
      stopHTML: function (api, s) {
        var S = api.state();
        if (!s.d1mall || !s.d1 || !today(api)) return '';
        var L = s.d1, esc = api.esc;
        if (L.phase === 'line' && S.time >= DOORS) openDoors(api, s, false); // you were in line when the doors opened
        var h = '<div class="story d1-line"><div class="story-h">' + esc(T.lineH) + '</div>';
        if (L.phase === 'line') {
          h += '<div class="story-t">' + esc(T.doors) + '</div><div class="d1-place">' + esc(T.place.replace('{n}', L.place)) + '</div>' +
            '<div class="bubble">Slab Steve: "' + esc(T.steve) + '"</div>' +
            '<div class="btns"><button class="offer fair" data-act="dlc" data-dlc="' + ID + '" data-v="wait">' + esc(T.waitBtn) + '</button></div>' +
            '<div class="note">' + esc(T.waitNote) + '</div>';
        } else if (L.phase === 'open') h += '<div class="story-t">' + esc(T.open) + '</div><div class="bubble">Slab Steve: "' + esc(T.steve) + '"</div>';
        else if (L.phase === 'late') h += '<div class="story-t">' + esc(T.late) + '</div>';
        h += '</div>';
        var D = L.dash || {};
        h += '<div class="story d1-food"><canvas class="d1-cab" width="40" height="56" aria-hidden="true"></canvas><div class="story-h">' + esc(T.foodH) + '</div><div class="story-t">' + esc(T.food) + '</div>';
        if (!D.played) h += '<div class="btns"><button class="offer full" data-act="dlc" data-dlc="' + ID + '" data-v="dash"' + (S.cash < 1 ? ' disabled' : '') + '>' + esc(T.dashBtn) + '</button></div>' + (S.cash < 1 ? '<div class="note">' + esc(T.dashBroke) + '</div>' : '');
        else h += '<div class="note">' + esc(T.dashDone.replace('{n}', D.hits || 0)) + (D.prize ? ' ' + esc(T.dashPrize.replace('{t}', D.prize)) : '') + '</div>';
        return h + '</div>';
      },
      afterStop: function (api, s) {
        var cv = document.querySelector('.d1-cab'); if (cv) drawCab(cv);
      },
      partnerCall: function (api) { if (!today(api)) return undefined; api.track('dlc1_call'); return T.call; },
      results: function (api) { return today(api) ? '<div class="also d1-res">' + api.esc(T.results) + '</div>' : ''; },
      boxOdds: function (api, it) {
        if (!it || it.id !== 'd1_gbox') return undefined;
        return 'Odds on the box: ' + T.box.odds.map(function (o) { return Math.round(o[1] * 100) + '% ' + o[2]; }).join(' · ') + '. Those are the real odds.';
      },
      // the gift-wrapped box opens with the odds printed on it
      openBox: function (api, box, price) {
        if (!box || box.id !== 'd1_gbox') return undefined;
        var S = api.state(), r = rng(api, 'gboxopen|' + box.uid);
        var x = r(), acc = 0, tier = 'junk';
        for (var i = 0; i < T.box.odds.length; i++) { acc += T.box.odds[i][1]; if (x < acc) { tier = T.box.odds[i][0]; break; } }
        var it;
        if (tier === 'junk') {
          if (r() < 0.5) it = make(api, r, 'd1_box', { ask: 0 });
          else { it = api.makeItem(r, api.pick(r, NP.SPORTS), { seller: box.seller, sports: true, ask: 1 }); it.cond = 'loose'; }
        } else if (tier === 'good') {
          var pick = api.pick(r, ['d1_cake', 'd1_tinsel', 'd1_presets', 'd1_santa']);
          it = make(api, r, pick, { seller: box.seller, cond: BY[pick].kind === 'game' ? 'cib' : null });
        } else it = make(api, r, 'd1_knit', { seller: box.seller, cond: 'sealed' });
        it.flags = {}; it.tell = true; it.tested = false; it.inspected = true;
        it.uid = box.uid + 'x'; it.state = 'sold'; it.paid = price; it.fromBox = true;
        var b = JSON.parse(JSON.stringify(it)); b.paid = price; b.stopType = S.stop.type; b.boughtAt = S.stop.id;
        S.bag = S.bag.filter(function (q) { return q.uid !== box.uid; });
        S.bag.push(b);
        box.opened = tier; box.inside = it.t;
        api.track('dlc1_gbox_' + tier);
        var lines = T.box[tier];
        api.reveal(it, { line: T.box.open + ' ' + lines[Math.floor(r() * lines.length)], rarity: tier === 'treasure' ? 'grail' : tier === 'good' ? 'uncommon' : 'common', label: tier === 'treasure' ? 'SEALED HOLIDAY GAME' : tier === 'good' ? 'SOMETHING GOOD' : 'JUNK' });
        if (tier === 'treasure') { api.magnet('jackpot'); api.comboUp(2); } else if (tier === 'good') api.comboUp(1);
        return true;
      },
      // the want list: on a Holiday Saturday, one of the holiday entries now and then (and the mall ones at the mall)
      goalPick: function (api, def, ctx) {
        var S = api.state(); if (!today(api)) return undefined;
        var hist = S.goalHist || [];
        var cands = GOALS.filter(function (g) { return g.sub !== 'line' && hist.indexOf(g.id) < 0 && ctx.recent.indexOf(g.id) < 0 && api.goalFeasible(g); });
        if (!cands.length) return undefined;
        var r = rng(api, 'goal|' + S.history.length + '|' + (S.goalsDone || []).length + '|' + hist.length);
        var here = cands.filter(function (g) { return g.atMall; }), other = cands.filter(function (g) { return !g.atMall; });
        if (atMall(S) && here.length && r() < 0.85) return api.pick(r, here);
        if (other.length && r() < 0.5) return api.pick(r, other);
        return undefined;
      },
      goalFeasible: function (api, def) {
        var S = api.state(); if (!today(api)) return false;
        if (def.sub === 'line') { var m = mallOf(S); return !!(m && !m.visited && S.time + api.costOf(m) < DOORS - 5); }
        if (!atMall(S)) return false;
        var s = S.stop;
        if (def.sub === 'hold') return s.d1.phase === 'open' && s.items.some(function (it) { return it.d1door && it.cond === 'sealed' && it.state === 'avail' && Math.round(it.ask * 1.2) <= S.cash; });
        if (def.sub === 'dash') return !s.d1.dash.played && S.cash >= 1;
        return false;
      },
      goalTick: function (api, def, kind, it, ctx) {
        var S = api.state();
        if (def.sub === 'line') return kind === 'stop' && atMall(S) && S.stop.d1.phase === 'line';
        if (def.sub === 'hold') return kind === 'buy' && !!it && !!it.d1door && it.cond === 'sealed' && !!ctx && ctx.price > it.ask;
        if (def.sub === 'dash') return kind === 'd1dash';
        return false;
      },
      // pictures: the gift-wrapped box gets its own look; the games and gags get a picture in the usual frame
      drawItem: function (api, ctx, it, ox, oy, k) {
        if (!it || it.kind !== 'mbox' || it.id !== 'd1_gbox') return false;
        var P = function (x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(ox + x * k, oy + y * k, w * k, h * k); };
        P(1, 13, 30, 25, '#7a1b22'); P(2, 14, 28, 23, '#e4343e');
        for (var yy = 0; yy < 4; yy++) for (var xx = 0; xx < 5; xx++) P(4 + xx * 6 + (yy % 2) * 3, 16 + yy * 6, 2, 2, '#ff8a8f');
        P(0, 10, 32, 5, '#c0392b'); P(0, 10, 32, 1, '#ff8a8f');
        P(14, 10, 4, 28, '#ffcc33'); P(1, 23, 30, 4, '#ffcc33');
        P(8, 4, 7, 6, '#ffcc33'); P(17, 4, 7, 6, '#ffcc33'); P(10, 6, 3, 2, '#d9a514'); P(19, 6, 3, 2, '#d9a514'); P(14, 7, 4, 4, '#d9a514');
        P(22, 29, 8, 6, '#fff1d6'); P(23, 31, 6, 1, '#0b1022'); P(23, 33, 4, 1, '#0b1022');
        return true;
      },
      iconKey: function (api, it) { var id = it && (it.art || it.id); return ICONS[id] ? ID + ':' + id : undefined; },
      drawIcon: function (api, ctx, it, x, y, k) {
        var ic = ICONS[it && (it.art || it.id)]; if (!ic) return false;
        k = k || 1;
        ctx.fillStyle = ic.bg; ctx.fillRect(x, y, 16 * k, 16 * k);
        for (var r = 0; r < 16; r++) { var row = ic.px[r] || ''; for (var c = 0; c < 16; c++) { var col = PAL[row.charAt(c)]; if (col) { ctx.fillStyle = col; ctx.fillRect(x + c * k, y + r * k, k, k); } } }
        return true;
      }
    },
    // for tests and tools: pure helpers, no state
    util: { nextHolidaySat: nextHolidaySat, holidayWeek: holidayWeek, DOORS: DOORS, ZW: ZW }
  };
})();
