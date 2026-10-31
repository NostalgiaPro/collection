// Nostalgia Pro: the odd sellers (full game r6.2, plus the 10 easter egg sellers).
// Nineteen rare, random sellers. They are all original characters made up for this game.
// Any one of them can turn up at a stop and take over one table spot. Spot all nineteen for a hidden trophy.
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
  ,
  // ---- easter egg sellers (RC approved, Oct 29 2026). Original names, original lines, type descriptions only ----
  { id: 'e_titan', egg: true, name: 'Officer Titanium', tag: 'A cyborg cop in a matte cobalt chest plate, navy trousers and an amber wrap visor. His calves hiss when he walks',
    hi: ['Scan complete. You are carrying exact change and a strong urge to haggle.'],
    yes: ['Transaction processed. Have a lawful afternoon.'], no: ['Offer declined. My circuits suggest a larger number.'],
    inv: ['a chrome lunchbox', 'a 4-pack of D batteries', 'a VHS tape labeled "TRAINING, DO NOT TAPE OVER"'] },
  { id: 'e_drift', egg: true, name: 'The Chrome Drifter', tag: 'A biker android in a charcoal denim vest and mirrored shades. Brass wiring shows at his jaw',
    hi: ['My sensors say these are fair prices. My sensors are also from a pawn shop.'],
    yes: ['Deal confirmed. Ride safe.'], no: ['Calculating. Calculating. No.'],
    inv: ['a pair of mirrored shades (one lens)', 'a chrome motorcycle mirror', 'a cassette marked "HIGHWAY TUNES"'] },
  { id: 'e_mud', egg: true, name: 'Major Mudslide', tag: 'A jungle commando in camo face paint, tiger-stripe cargo pants and two bandoliers. The bandoliers hold AA batteries',
    hi: ['I have survived three monsoons and a timeshare pitch. Make an offer, soldier.'],
    yes: ['Mission accomplished. At ease.'], no: ['Negative. Dig deeper, private.'],
    inv: ['a dented canteen', 'a camo fanny pack', 'a compass with a fogged-up glass'] },
  { id: 'e_jack', egg: true, name: 'Brisbane Jack', tag: 'An outback adventurer in a tan canvas vest, khaki shorts and a brown suede hat. Sunburned in the exact shape of the hat',
    hi: ['Flew in from the bush, and honestly, your heat is worse than ours.'],
    yes: ['Beauty. Pleasure doing business, mate.'], no: ['Nah, mate. Have another go.'],
    inv: ['a boomerang that does not come back', 'a stuffed toy kangaroo', 'a postcard of a very large rock'] },
  { id: 'e_ecto', egg: true, name: 'Dr. Ectoplasm', tag: 'A ghost exterminator in a mustard boiler suit with a vacuum backpack. There is pink slime on one boot',
    hi: ['Every cartridge here is certified ninety-nine percent haunt-free. The other one percent is a bonus.'],
    yes: ['Bagged and tagged. Spook-free, guaranteed.'], no: ['My meter reads a very low number. Higher, please.'],
    inv: ['a thermos with a suspicious glow', 'a bent rabbit-ear antenna "for spirits"', 'a jar of glow-in-the-dark stars'] },
  { id: 'e_whip', egg: true, name: 'Professor Whipcord', tag: 'A ruin raider in an olive bush jacket and a gray travel hat, with a battered satchel and a coiled cord on his belt',
    hi: ['Pulled this whole table out of a collapsing temple. Okay, a collapsing carport. Same energy.'],
    yes: ['A fine find. Handle it like an artifact.'], no: ['That offer would not fund a single dig.'],
    inv: ['a dusty clay piggy bank', 'a hand-drawn treasure map of a strip mall', 'a compass that points at the snack bar'] },
  { id: 'e_skip', egg: true, name: 'Skip Tomorrow', tag: 'A time-hopping teen in a silver quilted vest over a checkerboard shirt. His digital watch shows three different times',
    hi: ['Trust me, in thirty years these are going to be worth way more. I checked.'],
    yes: ['Sweet. Future you says thanks.'], no: ['Whoa, way too low. Even for back then.'],
    inv: ['a skateboard with one wobbly wheel', 'a calculator watch', 'a pocket TV that only gets channel 3'] },
  { id: 'e_rex', egg: true, name: 'Rex Renegade', tag: 'An eye-patch renegade with a serious mullet and a beat-up bomber jacket. He leans on everything',
    hi: ['Half this swap meet owes me a favor. You do not, so you pay sticker. Kidding. Mostly.'],
    yes: ['Fine. Do not tell anybody I went easy.'], no: ['I have had worse offers. Not today, though.'],
    inv: ['a scuffed flight helmet', 'a road atlas with one town circled', 'a pack of gum with one stick left'] },
  { id: 'e_stair', egg: true, name: 'Sgt. Stairwell', tag: 'A high-rise cop in a gray tank top, with tape on his bare feet. He took the stairs to get here. All of them',
    hi: ['Forty floors on foot to get here, so I am not haggling long.'],
    yes: ['Done. My feet thank you.'], no: ['Not for that. I walked here with no shoes on, pal.'],
    inv: ['a roll of silver duct tape', 'a can of foot powder', 'a pair of brand new flip-flops'] },
  { id: 'e_buck', egg: true, name: 'Buck Diesel', tag: 'A big-rig brawler in a backwards trucker cap and a sleeveless flannel. His semi is parked across four spaces',
    hi: ['Hauled this load nine hundred miles on cold coffee and AM radio. Make it worth the diesel.'],
    yes: ['Ten-four. The load is yours.'], no: ['That offer would not cover half a tank, buddy.'],
    inv: ['a CB radio handset', 'a pair of fuzzy dice', 'a thermos of very old coffee'] }
];
NP.CAMEO_TEXT = {
  tag: 'RARE SELLER!',
  banner: 'RARE SELLER!',
  bannerEgg: 'ODD SELLER SPOTTED!',
  spotted: 'Rare seller found: {n} of {all}',
  first: 'A rare seller! There are 19 of them out there. Spot them all.',
  walkSub: 'Has a stall here today. Look for the sparkly table, or the star on the MAP.',
  again: 'You have seen this one before.',
  trophy: 'HIDDEN TROPHY|Seen Them All|You spotted all 19 odd sellers',
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
  var skin = { c_vcr: '#f0c8a0', c_dj: '#8d5a3b', c_lunch: '#f2c9a5', c_pizza: '#d9a27a', c_wx: '#f0c8a0', c_aero: '#c98d68', c_capn: '#e2b089', c_mime: '#ffffff', c_sci: '#b97a55',
    e_titan: '#e2b089', e_drift: '#d9c2a8', e_mud: '#b5835a', e_jack: '#e89a6e', e_ecto: '#f0c8a0', e_whip: '#d9a27a', e_skip: '#f2c9a5', e_rex: '#c98d68', e_stair: '#e2b089', e_buck: '#b97a55' }[id] || '#e0a47a';
  P(0, 0, 24, 32, '#1d2b53');
  // body and head
  var shirt = { c_vcr: '#6b3fa0', c_dj: '#c0392b', c_lunch: '#ffffff', c_pizza: '#e4343e', c_wx: '#2c3e66', c_aero: '#ff4fa3', c_capn: '#1f4e79', c_mime: '#ffffff', c_sci: '#ffffff',
    e_titan: '#3f5f9e', e_drift: '#3a3a40', e_mud: '#c98a2b', e_jack: '#c8a874', e_ecto: '#d4a62a', e_whip: '#6b7a3a', e_skip: '#c9d1dc', e_rex: '#5a4632', e_stair: '#9aa0a8', e_buck: '#b03a2e' }[id] || '#888888';
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
  } else if (id === 'e_titan') {
    P(7, 5, 10, 4, '#3f5f9e'); P(8, 11, 8, 2, '#E69F00'); P(9, 11, 2, 1, '#ffd27a');
    P(4, 21, 16, 4, '#3f5f9e'); P(6, 22, 12, 2, '#6f8fce'); P(4, 25, 16, 7, '#1d2b6b'); P(11, 26, 2, 2, '#c9d1dc');
  } else if (id === 'e_drift') {
    P(8, 5, 8, 3, '#1a1a1a'); P(8, 11, 3, 2, '#c9d1dc'); P(13, 11, 3, 2, '#c9d1dc'); P(11, 11, 2, 1, '#1a1a1a');
    P(14, 15, 2, 3, '#b8892b'); P(15, 16, 1, 1, '#e0c068');
    P(4, 21, 4, 11, '#4a4f5a'); P(16, 21, 4, 11, '#4a4f5a'); P(8, 21, 8, 11, '#2a2a2e');
  } else if (id === 'e_mud') {
    P(8, 5, 8, 3, '#2b1a12'); P(7, 7, 10, 1, '#c0392b');
    P(8, 13, 2, 1, '#3d5a2a'); P(14, 13, 2, 1, '#3d5a2a'); P(9, 16, 6, 1, '#3d5a2a');
    P(4, 21, 16, 11, '#7a6a3a'); for (var j = 0; j < 4; j++) P(5 + j * 4, 25, 2, 7, '#2b2b1a');
    for (var q = 0; q < 6; q++) { P(5 + q * 2, 21 + q, 2, 2, '#8b5a2b'); P(17 - q * 2, 21 + q, 2, 2, '#8b5a2b'); }
  } else if (id === 'e_jack') {
    P(4, 5, 16, 2, '#7a4a2a'); P(7, 2, 10, 4, '#8b5a3b'); P(7, 5, 10, 1, '#4a2a1a');
    P(9, 9, 6, 1, '#d46a4a');
    P(4, 21, 16, 7, '#c8a874'); P(10, 21, 4, 7, '#e9dcc0'); P(4, 28, 16, 4, '#a89060');
  } else if (id === 'e_ecto') {
    P(8, 5, 8, 3, '#6b3a1a');
    P(4, 21, 16, 11, '#d4a62a'); P(9, 24, 6, 2, '#b8892b');
    P(0, 18, 4, 14, '#8a90a0'); P(20, 18, 4, 14, '#8a90a0'); P(1, 20, 2, 2, '#e4343e'); P(21, 23, 2, 1, '#3ddc84');
    P(6, 29, 3, 2, '#ff79c6'); P(15, 26, 2, 2, '#ff79c6');
  } else if (id === 'e_whip') {
    P(5, 5, 14, 2, '#7a7f88'); P(8, 2, 8, 4, '#8a909a'); P(8, 5, 8, 1, '#4a4f58');
    P(9, 15, 6, 2, '#6b4a2a');
    P(4, 21, 16, 11, '#6b7a3a'); P(11, 21, 2, 11, '#4a5a2a');
    P(16, 26, 6, 5, '#8b5a2b'); P(16, 26, 6, 1, '#5a3a1a'); P(3, 28, 5, 4, '#5a3a1a'); P(4, 29, 3, 2, '#6b4a2a');
  } else if (id === 'e_skip') {
    P(8, 5, 8, 3, '#7a4a2a'); P(7, 6, 2, 3, '#7a4a2a');
    P(4, 21, 16, 11, '#c9d1dc'); P(6, 23, 12, 1, '#a8b0bc'); P(6, 26, 12, 1, '#a8b0bc'); P(6, 29, 12, 1, '#a8b0bc');
    P(10, 21, 4, 11, '#ffffff'); P(10, 22, 2, 2, '#1a1a1a'); P(12, 24, 2, 2, '#1a1a1a'); P(10, 26, 2, 2, '#1a1a1a'); P(12, 28, 2, 2, '#1a1a1a'); P(10, 30, 2, 2, '#1a1a1a');
    P(2, 27, 3, 2, '#1a1a1a'); P(3, 27, 1, 1, '#3ddc84');
  } else if (id === 'e_rex') {
    P(7, 5, 10, 3, '#3a2a1a'); P(6, 8, 2, 10, '#3a2a1a'); P(16, 8, 2, 10, '#3a2a1a'); P(7, 17, 10, 3, '#3a2a1a');
    P(8, 11, 3, 3, '#0b1022'); P(7, 10, 10, 1, '#0b1022');
    P(4, 21, 16, 11, '#5a4632'); P(4, 21, 16, 2, '#c9b89a'); P(11, 23, 2, 9, '#3a2a1a');
  } else if (id === 'e_stair') {
    P(8, 5, 8, 2, '#3a2a1a');
    P(9, 16, 6, 1, '#3a2a1a');
    P(4, 21, 4, 11, skin); P(16, 21, 4, 11, skin); P(8, 21, 8, 11, '#9aa0a8'); P(9, 24, 3, 2, '#7a8088');
    P(5, 27, 2, 3, '#e9e9e9'); P(17, 27, 2, 3, '#e9e9e9');
  } else if (id === 'e_buck') {
    P(7, 5, 10, 3, '#1f4e79'); P(5, 6, 3, 2, '#1f4e79'); P(10, 4, 4, 2, '#ffffff');
    P(9, 15, 6, 2, '#6b4a2a');
    P(6, 21, 12, 11, '#b03a2e'); P(6, 24, 12, 1, '#1a1a1a'); P(6, 28, 12, 1, '#1a1a1a'); P(9, 21, 1, 11, '#1a1a1a'); P(14, 21, 1, 11, '#1a1a1a');
    P(3, 21, 3, 11, skin); P(18, 21, 3, 11, skin);
  }
};
