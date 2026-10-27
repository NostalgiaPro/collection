// Nostalgia Pro: all names below are original parodies. No real games, consoles, companies or stores.
var NP = window.NP || {};
window.NP = NP;

NP.PLATFORMS = {
  k16: { name: 'Kestrel 16', media: 'cart', c1: '#c8323c', c2: '#1d2b53' },
  fer: { name: 'Ferroset 8', media: 'cart', c1: '#7a7f8c', c2: '#2a2f3a' },
  lum: { name: 'Lumen Disc', media: 'disc', c1: '#29adff', c2: '#16213e' },
  hal: { name: 'Marigold 32', media: 'disc', c1: '#ffa300', c2: '#3a1f1f' },
  pip: { name: 'PocketPip', media: 'hand', c1: '#00b894', c2: '#123a2f' }
};

// tier: 1 common, 2 uncommon, 3 rare. base = loose value in dollars.
NP.CATALOG = [
  { id: 'mf1', t: 'Moon Ferret', p: 'k16', tier: 1, base: 9, set: 'mf' , tag: 'common', d: 'A ferret on the moon, collecting cheese. Nobody ever explained why.' },
  { id: 'mf2', t: 'Moon Ferret 2: Lunar Burrow', p: 'k16', tier: 2, base: 18, set: 'mf' , tag: 'uncommon', d: 'The ferret starts digging, and the moon has tunnels now. Better than the first one.' },
  { id: 'mf3', t: 'Moon Ferret 3: Crater Party', p: 'k16', tier: 3, base: 45, set: 'mf' , tag: 'rare', d: 'The last Moon Ferret before the studio closed. Short print run.' },
  { id: 'tcr', t: 'Turbo Cactus Rally', p: 'k16', tier: 1, base: 7, tag: 'common', d: 'Kart racing where every kart is driven by a cactus. Do not bump anyone.' },
  { id: 'wiz', t: 'Wizard Accountant', p: 'fer', tier: 2, base: 22, tag: 'gem', d: 'Turn-based tax battles. The final boss is an audit, and it rules.' },
  { id: 'skp', t: 'Skate Possum', p: 'k16', tier: 1, base: 6, tag: 'common', d: 'A skateboarding possum that plays dead every time you bail.' },
  { id: 'dln', t: 'Dungeon Lasagna', p: 'lum', tier: 2, base: 28, tag: 'gem', d: 'A dungeon crawler where every floor is a layer of lasagna. People who played it still talk about it.' },
  { id: 'nej', t: 'Neon Jellyfish', p: 'hal', tier: 1, base: 8, tag: 'shovel', d: 'A glowing jellyfish screensaver with a score counter bolted on.' },
  { id: 'cgr', t: 'Castle Grumble', p: 'fer', tier: 1, base: 10, tag: 'common', d: 'Castle defense. The castle complains the whole time.' },
  { id: 'pgg', t: 'Pocket Gecko Golf', p: 'pip', tier: 1, base: 5, tag: 'shovel', d: 'Nine holes of mini golf, and the gecko is the ball.' },
  { id: 'rob', t: 'Robo Barista', p: 'pip', tier: 2, base: 16, tag: 'uncommon', d: 'Make lattes for robots before the morning rush. Weirdly stressful.' },
  { id: 'sky', t: 'Sky Llama Squadron', p: 'k16', tier: 2, base: 24, tag: 'uncommon', d: 'A flight shooter starring llamas in goggles. Two players on one controller.' },
  { id: 'hmp', t: 'Haunted Mall Panic', p: 'lum', tier: 3, base: 70, tag: 'rare', d: 'Survive one night in a haunted mall. Pulled from stores for scaring the food court.' },
  { id: 'vpk', t: 'Vapor Knight', p: 'hal', tier: 2, base: 20, tag: 'uncommon', d: 'A knight, a sunset and a synth soundtrack. Mostly the soundtrack.' },
  { id: 'ttt', t: 'Tiny Tank Tactics', p: 'fer', tier: 1, base: 6, tag: 'shovel', d: 'A strategy game with three tanks and exactly one map.' },
  { id: 'msa', t: 'Mesa Mayhem', p: 'k16', tier: 1, base: 8, tag: 'common', d: 'Demolition derby on top of a mesa. Try not to drive off the edge.' },
  { id: 'gpn', t: 'Ghost Pepper Ninja', p: 'hal', tier: 2, base: 26, tag: 'cult', d: 'A spicy ninja who breathes fire. Hard as nails, and its fans will tell you so.' },
  { id: 'stm', t: 'Star Mopper', p: 'fer', tier: 1, base: 5, tag: 'shovel', d: 'You mop the floors of a space station. That is the whole game.' },
  { id: 'lll', t: 'Lava Lamp Legends', p: 'lum', tier: 1, base: 9, tag: 'common', d: 'A puzzle game about lava lamps. Takes twenty minutes to warm up.' },
  { id: 'bro', t: 'Brunch Crusade', p: 'hal', tier: 3, base: 85, tag: 'rare', d: 'An epic quest for the perfect pancake. Fewer than 5,000 copies made.' },
  { id: 'cyr', t: 'Cyber Raccoon 2099', p: 'lum', tier: 2, base: 19, tag: 'cult', d: 'A raccoon hacker in the year 2099. Raids trash cans and the mainframe.' },
  { id: 'bfb', t: 'Bowling for Badgers', p: 'pip', tier: 1, base: 4, tag: 'shovel', d: 'Bowling, with badgers as the pins. The badgers are not happy about it.' },
  { id: 'pxp', t: 'Pixel Prairie', p: 'fer', tier: 2, base: 17, tag: 'gem', d: 'A one-screen farming game that eats whole weekends.' },
  { id: 'tnk', t: 'Turnip Kingdom', p: 'k16', tier: 3, base: 60, tag: 'rare', d: 'A turnip becomes king. Pulled from shelves over a lawsuit with a vegetable company.' },
  { id: 'esc', t: 'Escalator Escape', p: 'pip', tier: 1, base: 6, tag: 'common', d: 'Walk up the down escalator. 99 levels of it.' },
  { id: 'bgd', t: 'Bigfoot Derby', p: 'hal', tier: 1, base: 7, tag: 'common', d: 'Racing as Bigfoot. Found in every bargain bin ever.' },
  { id: 'hyo', t: 'Hyper Origami', p: 'lum', tier: 2, base: 23, tag: 'gem', d: 'Fold paper into fighters. Rented a lot, sold very little.' },
  { id: 'cmc', t: 'Comet Cabbie', p: 'fer', tier: 1, base: 8, tag: 'common', d: 'A space taxi where every passenger wants the same planet.' },
  { id: 'thd', t: 'Thunder Tortoise', p: 'k16', tier: 2, base: 21, tag: 'uncommon', d: 'A tortoise with lightning powers. Slow, then very fast.' },
  { id: 'csf', t: 'Canal Surfer', p: 'pip', tier: 3, base: 55, tag: 'rare', d: 'Surfing the canals of a desert city. Only ever sold by mail order.' },
  { id: 'gtc', t: 'Shrine of the Golden Taco', p: 'fer', tier: 3, base: 120, tag: 'rare', d: 'A quest for the legendary golden taco. The one every collector wants.' }
];

// The sports-game-only bin. Worth basically nothing. Someone always wants $80 for one.
NP.SPORTS = [
  { id: 'gb94', t: "Gridiron Grind '94", p: 'k16', base: 1 },
  { id: 'gb95', t: "Gridiron Grind '95", p: 'k16', base: 1 },
  { id: 'gb96', t: "Gridiron Grind '96", p: 'hal', base: 1 },
  { id: 'gb97', t: "Gridiron Grind '97", p: 'hal', base: 2 },
  { id: 'gb98', t: "Gridiron Grind '98", p: 'lum', base: 1 },
  { id: 'chh', t: "Courtside Heat '96", p: 'lum', base: 1 },
  { id: 'chh2', t: "Courtside Heat '97", p: 'hal', base: 1 },
  { id: 'pkp', t: "Puck Punchers '95", p: 'k16', base: 1 },
  { id: 'dmd', t: "Diamond Dingers '98", p: 'lum', base: 1 },
  { id: 'gfp', t: "Fairway Fever '99", p: 'hal', base: 1 }
];

// What each game is, in one line, and the tag you see when you look at it.
// Catalog games carry their own tag and line above. Everything else is handled here.
NP.TAGS = {
  rare: 'Rare', uncommon: 'Uncommon', common: 'Common', shovel: 'Shovelware', gem: 'Hidden Gem', cult: 'Cult Classic',
  sports: 'Sports bin', merch: 'Merch', lot: 'Mystery lot', grail: 'Grail', repro: 'Bootleg/Repro'
};
// tag colors for the share card ([background, text]), matching style.css, and short versions for tight shelves
NP.TAG_COLORS = {
  rare: ['#ffcc33', '#0b1022'], uncommon: ['#29adff', '#0b1022'], common: ['#8a90a0', '#0b1022'], shovel: ['#8a5e36', '#fff1d6'],
  gem: ['#29d3e8', '#0b1022'], cult: ['#7e57c2', '#ffffff'], sports: ['#2d6a2d', '#fff1d6'], merch: ['#ff77a8', '#0b1022'],
  lot: ['#d8b07a', '#0b1022'], grail: ['#ffcc33', '#e4343e'], repro: ['#e4343e', '#ffffff']
};
NP.TAG_SHORT = { shovel: 'Shovel', gem: 'Gem', cult: 'Cult', sports: 'Sports', lot: 'Lot', repro: 'Repro', uncommon: 'Uncomm' };
NP.SPORTS_DESC = {
  gb: 'Football. Every year it is the same game with a new number on the box.',
  ch: 'Basketball where every player can dunk from half court.',
  pk: 'Hockey, but mostly the fights.',
  dm: 'Baseball. The batter catches fire on every home run, somehow.',
  gf: 'Golf. A gentle game for gentle people. Worth about a dollar.'
};
// opts.repro: true once you have spotted that this copy is a bootleg
NP.itemInfo = function (it, opts) {
  opts = opts || {};
  var cat = null, i;
  for (i = 0; i < NP.CATALOG.length; i++) if (NP.CATALOG[i].id === it.id) { cat = NP.CATALOG[i]; break; }
  var tag, d;
  if (it.kind === 'lot') { tag = 'lot'; d = 'Taped shut. No peeking. Could be anything, usually football.'; }
  else if (it.kind === 'grail') { tag = 'grail'; d = 'Never heard of it. The weird little label says "you are here."'; }
  else if (it.kind === 'merch') {
    var m = null; for (i = 0; i < NP.MERCH.length; i++) if (NP.MERCH[i].id === it.id) m = NP.MERCH[i];
    tag = 'merch'; d = m ? m.blurb : 'Official Nostalgia Pro merch.';
  }
  else if (cat) { tag = cat.tag || 'common'; d = cat.d || ''; }
  else { tag = 'sports'; d = NP.SPORTS_DESC[String(it.id || '').slice(0, 2)] || 'A sports game. There are a lot of these.'; }
  if (opts.repro) tag = 'repro';
  return { tag: tag, label: NP.TAGS[tag], d: d };
};

NP.GRAIL = { id: 'npg', t: 'Nostalgia Pro: The Game', p: 'pip', tier: 4, base: 0, grail: true };

// Fake merch. Worth nothing on the shelf. Costs you points. That is the joke.
NP.MERCH = [
  { id: 'm1', t: 'Nostalgia Pro: The Shelf Dust', price: 12, blurb: 'Authentic dust. From an authentic shelf.' },
  { id: 'm2', t: 'Nostalgia Pro: The Manual (sold separately)', price: 25, blurb: 'The game is also sold separately.' },
  { id: 'm3', t: "Nostalgia Pro: The Price Sticker That Won't Come Off", price: 8, blurb: 'Sticker remover not included.' },
  { id: 'm4', t: 'Nostalgia Pro: The Repro', price: 40, blurb: 'We are being honest. It is fake.' },
  { id: 'm5', t: 'Nostalgia Pro: The Shrink Wrap', price: 18, blurb: 'Make anything sealed again. Probably legal.' },
  { id: 'm6', t: 'Nostalgia Pro: The Day-One Patch', price: 15, blurb: 'Iron-on. Fixes nothing.' },
  { id: 'm7', t: 'Nostalgia Pro: The Bubble Mailer', price: 10, blurb: 'Slightly crushed for authenticity.' },
  { id: 'm8', t: 'Nostalgia Pro: The Grading Slab (self-graded)', price: 30, blurb: 'We gave it a 10. Trust us.' }
];

NP.STOPNAMES = {
  yard: ['Yard Sale on Mesquite Ln', 'Garage Sale on Ocotillo Dr', 'Estate Sale off Palo Verde', 'Moving Sale on Quail Run'],
  sports: ['Cul-de-sac Sale on Javelina Ct'],
  thrift: ['Desert Bloom Thrift', 'Second Wind Thrift', 'Mission Bargain Barn'],
  flea: ['Saguaro Swap Meet'],
  pawn: ["Lucky Lyle's Pawn & Loan", 'Tumbleweed Pawn'],
  gift: ['Nostalgia Pro Official Gift Shop']
};

// Seller personalities. minLo/minHi = fraction of asking price they accept.
NP.SELLERS = {
  grandma: { name: 'Sweet Retiree', ask: 0.35, minLo: 0.35, minHi: 0.55,
    hi: ["Oh, my grandson's old games! Make me an offer, hon.", 'Everything must go. My husband says so.'],
    yes: ['Sold! Want a lemonade?', "That's fine, sweetie.", 'Deal. Take a cookie too.'],
    no: ["Hmm, a little more than that, hon?"] },
  friendly: { name: 'Friendly Vendor', ask: 0.7, minLo: 0.5, minHi: 0.85,
    hi: ['Cash talks. What are you thinking?', 'All priced to move, friend.'],
    yes: ['You got it.', 'Pleasure doing business.', 'Deal. Tell your friends.'],
    no: ["Can't go that low. Meet me in the middle?", 'Ehh. Try again.'] },
  firm: { name: 'Price Is Firm Guy', ask: 0.8, minLo: 1, minHi: 1,
    hi: ['Prices are on the stickers. Stickers are firm.', 'Read the sign. PRICE. IS. FIRM.'],
    yes: ['Correct amount. Thank you.'],
    no: ['Price is firm.', 'Did you read the sign?', 'The sign is also firm.'] },
  ikwig: { name: 'I Know What I Got', ask: 1.9, minLo: 0.75, minHi: 1, touchy: true,
    hi: ["I looked it up online. I know what I got.", "Don't even. I know what I got."],
    yes: ['Smart buyer. You know what I got too.', 'Fine. But I know what I got.'],
    no: ['I know what I got.', 'Nope. I KNOW what I got.'],
    mad: ["Lowball me? It's off the table. I know what I got."] },
  pawn: { name: 'Pawn Counter', ask: 1.3, minLo: 0.75, minHi: 1,
    hi: ['Everything here is tested. You pay for peace of mind.', "Tested, cleaned, guaranteed. That's the markup."],
    yes: ['Ring it up.', "Done. Thirty-day warranty, don't lose the receipt."],
    no: ['Best I can do is the sticker.', 'Boss sets the prices, buddy.'] },
  kid: { name: 'Kid Selling Dad\'s Stuff', ask: 0.4, minLo: 0.3, minHi: 0.6, wild: true,
    hi: ['These are my dad\'s. He said sell whatever.', 'Mom said I can keep the money!'],
    yes: ['Sweet! Thanks!', 'Okay cool!'],
    no: ['Umm my dad said not that low.'] },
  sports: { name: 'Sports Bin Guy', ask: 1, minLo: 0.5, minHi: 1,
    hi: ["Got every year of Gridiron Grind. '97 is the good one.", 'Football games, a dollar each. Except the special ones.'],
    yes: ['Enjoy the football.', 'Good year. Great year.'],
    no: ["That's a collector's piece, pal."] }
};

NP.RIVAL = { name: 'Dex', shop: 'Flipside Resale' };

// CRT commercials. Still frames, skippable.
NP.ADS = [
  { h: 'NOSTALGIA PRO: THE SHELF DUST', s: 'Authentic dust from an authentic shelf.', f: 'Now available SEALED.' },
  { h: 'NOSTALGIA PRO: THE DAY-ONE PATCH', s: 'Fixes nothing. Patches everything.', f: 'Iron not included. Patch not included.' },
  { h: 'NOSTALGIA PRO: THE SHRINK WRAP', s: 'Is it factory sealed? It is now.', f: 'Ask your local swap meet about resealing.' },
  { h: 'NOSTALGIA PRO: THE MANUAL', s: '(sold separately)', f: 'The separate part is sold separately.' },
  { h: "NOSTALGIA PRO: THE PRICE STICKER", s: "That won't come off.", f: 'Ever. We tested it. On a sealed copy.' },
  { h: 'NOSTALGIA PRO: THE REPRO', s: 'Looks real. Feels real. Is not.', f: 'Proudly displayed by 0 out of 10 collectors.' }
];
NP.ADFREE_ADS = [
  { h: 'AD-FREE EDITION ACTIVE', s: 'You are now enjoying zero ads.', f: 'Brought to you by Nostalgia Pro: The Ad-Free Edition.' },
  { h: 'TIRED OF ADS?', s: 'Upgrade to the Ad-Free Edition.', f: 'You already have it. Upgrade again.' },
  { h: 'AD-FREE EDITION: GOLD', s: 'Twice the ad-free. Same ads.', f: 'This message is ad-free.' }
];
NP.TICKER = [
  'Try Nostalgia Pro: The Shelf Dust',
  'Ask about Nostalgia Pro: The Manual (sold separately)',
  'Nostalgia Pro: The Gift Shop is open till sundown',
  'Now with 40% more Nostalgia Pro',
  'This stop sponsored by Nostalgia Pro',
  'Nostalgia Pro: The Repro. It is fake. We said so.'
];
NP.TICKER_ADFREE = [
  'You are using the Ad-Free Edition',
  'Enjoy the Ad-Free Edition, now ad-free',
  'Ad-Free Edition: Gold, coming soon',
  'This banner is not an ad. It is an Ad-Free Edition reminder.'
];
NP.PITCHES = [
  'Also, you ever try Nostalgia Pro: The Shelf Dust?',
  'Between us, the gift shop has a great Day-One Patch.',
  'You know what goes with this? Nostalgia Pro: The Shrink Wrap.',
  'Fun fact: this stop is sponsored. I get paid to say that.',
  "Psst. Nostalgia Pro: The Manual. It's sold separately."
];
NP.PITCHES_ADFREE = [
  'Have you heard about the Ad-Free Edition? No ads. Like this one.',
  'I would pitch you merch, but you have the Ad-Free Edition. Nice.'
];

// The sponsor that is definitely not a sponsor. Made up, like everything else in here.
NP.SPONSOR = {
  name: 'Saguaro Splash Cola',
  short: 'SAGUARO SPLASH',
  weather: 'Stay cool. Stay hydrated. Stay Saguaro Splash.',
  react: '...did the weather just get sponsored?',
  colaLine: "I don't do endorsements, man. This is about the games.",
  colaAction: 'He slowly turns a can of Saguaro Splash Cola label-out, toward nobody in particular. The smile does not move.',
  vanLines: [
    "The van? It came like that. I don't sell out.",
    "Selling out is for people who sell out. I flip. Totally different.",
    "Nobody paid for that wrap. They paid me to say nobody paid for that wrap.",
    "It's not an ad if you don't read it. Don't read it."
  ]
};
