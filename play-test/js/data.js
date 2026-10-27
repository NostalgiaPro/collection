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
  { id: 'mf1', t: 'Moon Ferret', p: 'k16', tier: 1, base: 9, set: 'mf' },
  { id: 'mf2', t: 'Moon Ferret 2: Lunar Burrow', p: 'k16', tier: 2, base: 18, set: 'mf' },
  { id: 'mf3', t: 'Moon Ferret 3: Crater Party', p: 'k16', tier: 3, base: 45, set: 'mf' },
  { id: 'tcr', t: 'Turbo Cactus Rally', p: 'k16', tier: 1, base: 7 },
  { id: 'wiz', t: 'Wizard Accountant', p: 'fer', tier: 2, base: 22 },
  { id: 'skp', t: 'Skate Possum', p: 'k16', tier: 1, base: 6 },
  { id: 'dln', t: 'Dungeon Lasagna', p: 'lum', tier: 2, base: 28 },
  { id: 'nej', t: 'Neon Jellyfish', p: 'hal', tier: 1, base: 8 },
  { id: 'cgr', t: 'Castle Grumble', p: 'fer', tier: 1, base: 10 },
  { id: 'pgg', t: 'Pocket Gecko Golf', p: 'pip', tier: 1, base: 5 },
  { id: 'rob', t: 'Robo Barista', p: 'pip', tier: 2, base: 16 },
  { id: 'sky', t: 'Sky Llama Squadron', p: 'k16', tier: 2, base: 24 },
  { id: 'hmp', t: 'Haunted Mall Panic', p: 'lum', tier: 3, base: 70 },
  { id: 'vpk', t: 'Vapor Knight', p: 'hal', tier: 2, base: 20 },
  { id: 'ttt', t: 'Tiny Tank Tactics', p: 'fer', tier: 1, base: 6 },
  { id: 'msa', t: 'Mesa Mayhem', p: 'k16', tier: 1, base: 8 },
  { id: 'gpn', t: 'Ghost Pepper Ninja', p: 'hal', tier: 2, base: 26 },
  { id: 'stm', t: 'Star Mopper', p: 'fer', tier: 1, base: 5 },
  { id: 'lll', t: 'Lava Lamp Legends', p: 'lum', tier: 1, base: 9 },
  { id: 'bro', t: 'Brunch Crusade', p: 'hal', tier: 3, base: 85 },
  { id: 'cyr', t: 'Cyber Raccoon 2099', p: 'lum', tier: 2, base: 19 },
  { id: 'bfb', t: 'Bowling for Badgers', p: 'pip', tier: 1, base: 4 },
  { id: 'pxp', t: 'Pixel Prairie', p: 'fer', tier: 2, base: 17 },
  { id: 'tnk', t: 'Turnip Kingdom', p: 'k16', tier: 3, base: 60 },
  { id: 'esc', t: 'Escalator Escape', p: 'pip', tier: 1, base: 6 },
  { id: 'bgd', t: 'Bigfoot Derby', p: 'hal', tier: 1, base: 7 },
  { id: 'hyo', t: 'Hyper Origami', p: 'lum', tier: 2, base: 23 },
  { id: 'cmc', t: 'Comet Cabbie', p: 'fer', tier: 1, base: 8 },
  { id: 'thd', t: 'Thunder Tortoise', p: 'k16', tier: 2, base: 21 },
  { id: 'csf', t: 'Canal Surfer', p: 'pip', tier: 3, base: 55 },
  { id: 'gtc', t: 'Shrine of the Golden Taco', p: 'fer', tier: 3, base: 120 }
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
