// Nostalgia Pro: the odd sellers (Demo round 5).
// Nine rare, random sellers. They are all original characters made up for this game.
// Any one of them can turn up at a stop and take over one table spot. Spot all nine for a hidden trophy.
// NP.CAMEOS is the cast. NP.drawCameo(ctx, id, k) draws a 24x32 portrait at scale k.
var NP = window.NP || {};
window.NP = NP;

NP.CAMEOS = [
  { id: 'c_vcr', name: 'The VCR Wizard', tag: 'Rewinds tapes with his mind',
    hi: ['I have rewound tapes that were never played. Make an offer, traveler.', 'Every tape here has been blessed and tracked. Mostly tracked.'],
    yes: ['The tracking is aligned. Go in peace.', 'It is yours. The tape has chosen you.'],
    no: ['The tape spirits whisper: a little higher.', 'My crystal ball shows a bigger number.'] },
  { id: 'c_dj', name: 'Roller Rink DJ Dee', tag: 'Still on skates. Has not taken them off since Friday',
    hi: ['This next deal goes out to all the couples. Couples only. Okay, everybody.', 'Request line is open. Requesting cash.'],
    yes: ['Sold! Everybody reverse skate!', 'That one goes out to you, baby. Have a great night.'],
    no: ['Ooh. Record scratch. Try again.', 'The crowd says boo. Gently. The crowd likes you.'] },
  { id: 'c_lunch', name: 'Lunch Lady Lorraine', tag: 'Hairnet on. Ladle ready. Prices by the scoop',
    hi: ['One scoop per customer. Of games. I do not know why I said scoop.', 'Tray up, hon. Everything is fresh. Since 1993.'],
    yes: ['There you go. No seconds.', 'Enjoy. Bus your own tray.'],
    no: ['That is a half portion offer, hon. I serve full portions.', 'Back of the line with that number.'] },
  { id: 'c_pizza', name: 'Pizza Pete', tag: 'Still in uniform. His beeper will not stop',
    hi: ['Got a delivery after this, so let us be quick. Make an offer.', 'Hang on, my beeper. Okay, it was my beeper. What are we buying?'],
    yes: ['Delivered. Tip not required. Tip appreciated.', 'Hot and fresh. Well, room temperature and dusty.'],
    no: ['My beeper says no.', 'That offer would not cover the gas, buddy.'] },
  { id: 'c_wx', name: 'Retired Weatherman Walt', tag: 'Brought his own cardboard sun',
    hi: ['Today: sunny, with a ninety percent chance of bargains.', 'A high pressure system of deals is moving in from the driveway.'],
    yes: ['And the five day forecast says you win.', 'Clear skies for you, friend.'],
    no: ['I am seeing a cold front on that offer.', 'Scattered nopes, clearing by a bigger number.'] },
  { id: 'c_aero', name: 'Aerobics Arlene', tag: 'Leg warmers in a hundred degrees',
    hi: ['Five, six, seven, eight, make an offer!', 'And step touch, step touch, browse the table!'],
    yes: ['Great hustle! That was the deal.', 'Great form! Grab a towel, you earned it.'],
    no: ['Again! From the top! Higher!', 'Do not quit on me now. Bigger number!'] },
  { id: 'c_capn', name: "Cap'n Larry", tag: 'Everything on his table came out of the lake',
    hi: ['Pulled these from the lake. They still work. Mostly. A fish moved into one.', 'Ahoy. Prices are low, and so is the tide.'],
    yes: ['Fair winds and good cartridges.', 'Sold, and may your shelf never sink.'],
    no: ['Arr. That offer be shallow water.', 'Ye will need deeper pockets for that one.'] },
  { id: 'c_mime', name: 'Marvelous Mo', tag: 'A street mime. He does not talk. He mimes prices',
    hi: ['(He mimes a very heavy box. He mimes opening it. He mimes a sign that says MAKE AN OFFER.)', '(He mimes being stuck in a box. The box is full of games.)'],
    yes: ['(He mimes a handshake. It is a very firm mimed handshake.)', '(He mimes wrapping it in a bow. You have no idea where the bow went.)'],
    no: ['(He mimes a wall between you and the deal.)', '(He mimes crying. Then he mimes a bigger number.)'] },
  { id: 'c_sci', name: 'Science Fair Sam', tag: 'Selling his old games to fund a bigger volcano',
    hi: ['Everything on this table is for science. My volcano needs funding.', 'Hypothesis: you want a game. Let us test it.'],
    yes: ['Science thanks you.', 'Results confirmed. You are a good customer.'],
    no: ['That hypothesis is wrong. Try a bigger number.', 'Inconclusive. Please repeat the experiment with more money.'] }
];
NP.CAMEO_TEXT = {
  tag: 'ODD SELLER!',
  spotted: 'Odd sellers spotted: {n} of {all}',
  first: 'An odd seller! There are more of these out there. Spot them all.',
  again: 'You have seen this one before.',
  trophy: 'HIDDEN TROPHY|Seen Them All|You spotted every odd seller',
  trophyShort: 'Hidden trophy: Seen Them All',
  mini: '{name} is set up at the next stall. {tag}.'
};
// the odd sellers haggle like a friendly vendor, a little softer
NP.CAMEOS.forEach(function (c) {
  if (NP.SELLERS) NP.SELLERS[c.id] = { name: c.name, ask: 0.6, minLo: 0.5, minHi: 0.7, hi: c.hi, yes: c.yes, no: c.no, cameo: true };
});

// 24x32 portraits. Plain shapes, original designs.
NP.drawCameo = function (ctx, id, k) {
  k = k || 2;
  var P = function (x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x * k, y * k, w * k, h * k); };
  var skin = { c_vcr: '#f0c8a0', c_dj: '#8d5a3b', c_lunch: '#f2c9a5', c_pizza: '#d9a27a', c_wx: '#f0c8a0', c_aero: '#c98d68', c_capn: '#e2b089', c_mime: '#ffffff', c_sci: '#b97a55' }[id] || '#e0a47a';
  P(0, 0, 24, 32, '#1d2b53');
  // body and head
  var shirt = { c_vcr: '#6b3fa0', c_dj: '#c0392b', c_lunch: '#ffffff', c_pizza: '#e4343e', c_wx: '#2c3e66', c_aero: '#ff4fa3', c_capn: '#1f4e79', c_mime: '#ffffff', c_sci: '#ffffff' }[id];
  P(4, 21, 16, 11, shirt);
  P(8, 8, 8, 10, skin); P(10, 18, 4, 3, skin);
  P(9, 12, 2, 1, '#0b1022'); P(13, 12, 2, 1, '#0b1022');
  P(10, 15, 4, 1, '#7a2e2e');
  if (id === 'c_vcr') {
    P(7, 1, 10, 3, '#6b3fa0'); P(9, -1, 6, 3, '#6b3fa0'); P(6, 4, 12, 4, '#6b3fa0'); P(10, 2, 1, 1, '#ffcc33'); P(14, 5, 1, 1, '#ffcc33');
    P(8, 15, 8, 6, '#eeeeee'); P(10, 15, 4, 1, skin);
    P(16, 23, 7, 5, '#222'); P(17, 24, 5, 1, '#ddd'); P(18, 26, 1, 1, '#ddd'); P(20, 26, 1, 1, '#ddd');
    P(6, 24, 1, 1, '#ffcc33'); P(12, 28, 1, 1, '#ffcc33');
  } else if (id === 'c_dj') {
    P(8, 6, 8, 3, '#1a1a1a'); P(6, 9, 2, 5, '#29d3e8'); P(16, 9, 2, 5, '#29d3e8'); P(7, 6, 10, 1, '#29d3e8');
    P(4, 21, 16, 2, '#ffcc33'); P(11, 23, 2, 9, '#ffcc33');
    P(18, 26, 5, 4, '#222'); P(19, 27, 3, 2, '#e4343e');
  } else if (id === 'c_lunch') {
    P(7, 5, 10, 5, '#9aa3b5'); P(7, 5, 10, 1, '#c9d1dc'); P(8, 7, 1, 1, '#c9d1dc'); P(12, 6, 1, 1, '#c9d1dc'); P(15, 8, 1, 1, '#c9d1dc');
    P(4, 24, 16, 8, '#e9e9f0');
    P(19, 14, 2, 14, '#b8c0cc'); P(17, 12, 6, 4, '#b8c0cc');
  } else if (id === 'c_pizza') {
    P(7, 5, 10, 4, '#e4343e'); P(14, 8, 6, 1, '#e4343e'); P(10, 6, 3, 2, '#ffffff');
    P(1, 22, 9, 3, '#d9b37a'); P(1, 25, 9, 3, '#c8a06a'); P(1, 28, 9, 3, '#d9b37a');
    P(17, 22, 4, 3, '#333'); P(18, 23, 2, 1, '#3ddc84');
  } else if (id === 'c_wx') {
    P(8, 6, 8, 3, '#8a90a0'); P(7, 7, 1, 3, '#8a90a0'); P(16, 7, 1, 3, '#8a90a0');
    P(11, 21, 2, 8, '#e4343e'); P(9, 21, 6, 2, '#ffffff');
    P(17, 10, 7, 7, '#ffcc33'); P(16, 13, 1, 1, '#ffcc33'); P(19, 9, 1, 1, '#ffcc33'); P(19, 17, 1, 1, '#ffcc33'); P(19, 12, 1, 1, '#0b1022'); P(21, 12, 1, 1, '#0b1022');
    P(2, 14, 1, 14, '#c9d1dc');
  } else if (id === 'c_aero') {
    P(7, 4, 10, 6, '#7a4a2a'); P(6, 6, 2, 8, '#7a4a2a'); P(16, 6, 2, 8, '#7a4a2a'); P(7, 9, 10, 2, '#29d3e8');
    P(4, 21, 16, 2, '#29d3e8'); P(4, 29, 16, 3, '#ffcc33');
  } else if (id === 'c_capn') {
    P(6, 5, 12, 3, '#1d1d2b'); P(8, 3, 8, 3, '#1d1d2b'); P(11, 4, 2, 1, '#ffcc33');
    P(8, 15, 8, 4, '#d8d8d8'); P(10, 15, 4, 1, skin);
    P(10, 23, 1, 1, '#ffcc33'); P(10, 26, 1, 1, '#ffcc33'); P(13, 23, 1, 1, '#ffcc33'); P(13, 26, 1, 1, '#ffcc33');
    P(18, 20, 2, 12, '#8b5a2b'); P(16, 20, 6, 2, '#8b5a2b');
  } else if (id === 'c_mime') {
    P(7, 5, 10, 3, '#1a1a1a'); P(8, 4, 6, 2, '#1a1a1a');
    P(9, 11, 2, 3, '#1a1a1a'); P(13, 11, 2, 3, '#1a1a1a'); P(10, 15, 4, 1, '#e4343e');
    for (var i = 0; i < 5; i++) P(4, 21 + i * 2, 16, 1, '#1a1a1a');
    P(1, 18, 3, 3, '#ffffff'); P(20, 18, 3, 3, '#ffffff');
  } else if (id === 'c_sci') {
    P(8, 6, 8, 3, '#2b1a12'); P(8, 10, 8, 3, '#29d3e8'); P(9, 11, 2, 1, '#bff6ff'); P(13, 11, 2, 1, '#bff6ff');
    P(16, 24, 8, 8, '#8b5a2b'); P(18, 21, 4, 3, '#8b5a2b'); P(19, 18, 2, 3, '#e4343e'); P(18, 16, 1, 2, '#ff8a3d'); P(21, 15, 1, 2, '#ff8a3d');
  }
};
