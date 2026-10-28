// Nostalgia Pro: all names below are original parodies of genres and tropes.
// No real games, characters, series, consoles, companies, stores or brands, and nothing that sounds like one.
// Before adding a name, run: node tools/namecheck.js
var NP = window.NP || {};
window.NP = NP;

NP.PLATFORMS = {
  k16: { name: 'Kestrel 16', media: 'cart', c1: '#c8323c', c2: '#1d2b53' },
  fer: { name: 'Ferroset 8', media: 'cart', c1: '#7a7f8c', c2: '#2a2f3a' },
  lum: { name: 'Lumen Disc', media: 'disc', c1: '#29adff', c2: '#16213e' },
  hal: { name: 'Marigold 32', media: 'disc', c1: '#ffa300', c2: '#3a1f1f' },
  pip: { name: 'Lunchbox LX', media: 'hand', c1: '#00b894', c2: '#123a2f' }
};

// tier: 1 common, 2 uncommon, 3 rare. base = loose value in dollars.
// t = title, d = what it is (shown on the card), b = the back of the box (shown after you Inspect it).
// Every title keeps the subject its picture in icons.js shows.
NP.CATALOG = [
  { id: 'mf1', t: 'Moon Ferret: Cheese Is a Moon Thing Now', p: 'k16', tier: 1, base: 9, set: 'mf', tag: 'common',
    d: 'A ferret on the moon collects cheese, because a guy in marketing said the moon is cheese and nobody checked. 72 levels. Every one of them is gray.',
    b: 'WARNING: CONTAINS MOON.' },
  { id: 'mf2', t: 'Moon Ferret 2: Even More Moon', p: 'k16', tier: 2, base: 18, set: 'mf', tag: 'uncommon',
    d: 'Same ferret, same moon, but now the moon has tunnels and the ferret has a tragic backstory told entirely in grunts. One magazine called it "more moon." That was the whole review.',
    b: 'NOW WITH 40% MORE MOON THAN THE FIRST MOON.' },
  { id: 'mf3', t: 'Moon Ferret 3: The Party Hat Years', p: 'k16', tier: 3, base: 45, set: 'mf', tag: 'rare',
    d: 'The ferret gets a party hat and a midlife crisis. The studio closed the week it shipped, so every copy is rare, and every copy has the bug where the moon falls off.',
    b: 'THE FINAL CHAPTER. UNTIL THE NEXT ONE.' },
  { id: 'tcr', t: 'Turbo Cactus Rally Turbo', p: 'k16', tier: 1, base: 7, tag: 'common',
    d: 'Kart racing where every racer is a cactus, so bumping into anyone hurts you both. The word TURBO is on the box four times. There is no turbo button.',
    b: 'TURBO! TURBO! TURBO! (NOT A FEATURE.)' },
  { id: 'wiz', t: 'Wizard Accountant: Quest for the Lost Receipt', p: 'fer', tier: 2, base: 22, tag: 'gem',
    d: 'Turn-based tax battles. You cast Itemized Deduction for 40 damage. The final boss is an audit with three health bars, and the people who beat it will not stop talking about it.',
    b: '"I CRIED AT THE AMORTIZATION SCENE." SAYS A GUY' },
  { id: 'skp', t: 'Skate Possum: Plays Dead Extreme', p: 'k16', tier: 1, base: 6, tag: 'common',
    d: 'Every time you bail, the possum plays dead for 45 seconds and you cannot skip it. Roughly half of the game is watching a possum pretend to be dead.',
    b: 'RADICAL TO THE MAX. MAX SOLD SEPARATELY.' },
  { id: 'dln', t: 'Dungeon Lasagna: Forty Layers Deep', p: 'lum', tier: 2, base: 28, tag: 'gem',
    d: 'A dungeon crawler where every floor is a layer of lasagna and the final boss is a fork. It takes 90 hours to beat. The memory card holds 40 of them.',
    b: 'BAKED AT 350 FOR YOUR ENJOYMENT.' },
  { id: 'nej', t: 'Neon Jellyfish Deluxe Platinum Gold Edition', p: 'hal', tier: 1, base: 8, tag: 'shovel',
    d: 'A glowing jellyfish screensaver with a score counter bolted on. The score goes up whether you touch the controller or not. The Platinum Gold Edition is the same disc in a shinier case.',
    b: 'THE ULTIMATE JELLYFISH EXPERIENCE.* *EXPERIENCE NOT INCLUDED.' },
  { id: 'cgr', t: 'Castle Grumble: Siege of Complaints', p: 'fer', tier: 1, base: 10, tag: 'common',
    d: 'Castle defense, but the castle complains the entire time. It hates the catapults, the weather and you. The voice actor was clearly double parked.',
    b: 'THE CASTLE THAT TALKS BACK!' },
  { id: 'pgg', t: "Gecko Golf '97: Deluxe Edition", p: 'pip', tier: 1, base: 5, tag: 'shovel',
    d: "Nine holes of mini golf where the gecko is the ball. The gecko did not agree to this. It is the same nine holes as the '96 one, but deluxe.",
    b: 'EIGHTEEN HOLES OF FUN! (NINE HOLES.)' },
  { id: 'rob', t: 'Robo Barista: Extra Shot Edition', p: 'pip', tier: 2, base: 16, tag: 'uncommon',
    d: 'Make lattes for robots before the morning rush. Robots cannot drink coffee. They order it anyway and get furious when you misspell their serial numbers.',
    b: 'BREWED BY ROBOTS, FOR ROBOTS. HUMANS TOLERATED.' },
  { id: 'sky', t: 'Sky Llama Air Patrol: Spit Happens', p: 'k16', tier: 2, base: 24, tag: 'uncommon',
    d: 'A flight shooter starring llamas in goggles. Two players share one controller, which has ended at least four friendships. The llamas spit missiles. Nobody asked how.',
    b: 'TOTALLY AIRBORNE! LLAMAS NOT RESPONSIBLE FOR SPIT.' },
  { id: 'hmp', t: 'Haunted Mall Panic: Clearance of the Damned', p: 'lum', tier: 3, base: 70, tag: 'rare',
    d: 'Survive one night in a haunted mall with the ghost of a guy who still has a coupon. Pulled from stores after it scared an entire food court. The surviving copies still smell like a pretzel stand.',
    b: 'SO SCARY IT WAS RECALLED. (IT WAS RECALLED FOR A DIFFERENT REASON.)' },
  { id: 'vpk', t: 'Vapor Knight: Sunset Forever', p: 'hal', tier: 2, base: 20, tag: 'uncommon',
    d: 'A knight walks toward a sunset for six hours while a synth soundtrack plays. There is one sword fight, and it happens during the credits. The soundtrack slaps.',
    b: 'FEEL THE SYNTH. SEE THE SUNSET. DO NOTHING ELSE.' },
  { id: 'ttt', t: 'Three Tank Tactics: Ultimate Total Warfare Supreme', p: 'fer', tier: 1, base: 6, tag: 'shovel',
    d: 'A deep strategy game with three tanks and exactly one map. Two of the tanks are decorative. The box promises thousands of battles, which is true if you play it thousands of times.',
    b: 'THOUSANDS OF BATTLES!*' },
  { id: 'msa', t: 'Mesa Mayhem: No Brakes Edition', p: 'k16', tier: 1, base: 8, tag: 'common',
    d: 'Demolition derby on top of a mesa with no guard rails. The tutorial is driving off the edge. So is the rest of the game.',
    b: 'BRAKES NOT INCLUDED. NEITHER IS THE MESA.' },
  { id: 'gpn', t: 'Ghost Pepper Ninja: Mild Mode Not Found', p: 'hal', tier: 2, base: 26, tag: 'cult',
    d: 'A spicy ninja who breathes fire and has three hit points. Brutally hard on purpose. Its fans call it a masterpiece and will tell you so at a party you did not invite them to.',
    b: 'TOO HOT FOR TV. ALSO TOO HOT FOR YOU.' },
  { id: 'stm', t: 'Orbit Mopper: Galactic Janitor Saga', p: 'fer', tier: 1, base: 5, tag: 'shovel',
    d: 'You mop the floors of a space station. That is the whole game. The giant space battle on the box happens outside a window you are not allowed to look out of.',
    b: 'AN EPIC SPACE ADVENTURE. FLOORS ONLY.' },
  { id: 'lll', t: 'Blob Lamp Legends: The Warm-Up', p: 'lum', tier: 1, base: 9, tag: 'common',
    d: 'A puzzle game about those lamps with the slow blobs in them. The first level takes twenty minutes to warm up. So does every level after that.',
    b: 'GROOVY! PLEASE WAIT.' },
  { id: 'bro', t: 'Brunch Crusade: The Syrup Wars', p: 'hal', tier: 3, base: 85, tag: 'rare',
    d: 'An epic quest across eleven kingdoms for the perfect pancake. Fewer than 5,000 copies were made because each disc cost more than the pancakes. Every copy is a little sticky.',
    b: 'THE LEGENDARY BREAKFAST ADVENTURE. BEST SERVED WARM.' },
  { id: 'cyr', t: 'Cyber Raccoon: Hack the Trash', p: 'lum', tier: 2, base: 19, tag: 'cult',
    d: 'A raccoon hacker in the distant future of next Tuesday. He raids the mainframe, then the dumpster behind the mainframe. Everyone who owns it wears sunglasses indoors.',
    b: 'THE FUTURE IS NOW. (IT WAS LAST TUESDAY.)' },
  { id: 'bfb', t: 'Badger Bowl Extreme', p: 'pip', tier: 1, base: 4, tag: 'shovel',
    d: 'Bowling, with badgers as the pins. The badgers are not happy about it and file a complaint after every strike. "Extreme" refers to how the badgers feel.',
    b: 'EXTREME BOWLING ACTION! THE BADGERS DISAGREE.' },
  { id: 'pxp', t: 'Pixel Prairie: Just One More Day', p: 'fer', tier: 2, base: 17, tag: 'gem',
    d: 'A one-screen farming game that eats whole weekends. You grow one turnip. Then a slightly better turnip. Then it is Monday and you have not showered.',
    b: '"JUST ONE MORE DAY." SAID EVERYONE, AT 4 AM' },
  { id: 'tnk', t: 'Turnip Monarchy: Royal Root Edition', p: 'k16', tier: 3, base: 60, tag: 'rare',
    d: 'A turnip becomes king and immediately raises taxes. Pulled from shelves after a lawsuit from a vegetable company nobody can find any record of. The judge called it "a lot of turnip."',
    b: 'LONG LIVE THE TURNIP!' },
  { id: 'esc', t: 'Escalator Escape: 99 Floors the Wrong Way', p: 'pip', tier: 1, base: 6, tag: 'common',
    d: 'Walk up the down escalator. 99 levels of it. Level 100 is the stairs, and the stairs are out of order.',
    b: 'THE THRILLING SEQUEL TO WALKING.' },
  { id: 'bgd', t: 'Sasquatch Derby: Blurry Edition', p: 'hal', tier: 1, base: 7, tag: 'common',
    d: 'Racing as a sasquatch. Every screenshot on the box is slightly out of focus. It is in every bargain bin in the state, and two of them are in your garage right now.',
    b: 'NOW IN BLURRY-VISION!' },
  { id: 'hyo', t: 'Crease Fighters: Paper Cuts', p: 'lum', tier: 2, base: 23, tag: 'gem',
    d: 'A fighting game where you fold paper into fighters. Everybody rented it and nobody bought it. Every single special move is a paper cut.',
    b: 'FOLD. FIGHT. FOLD AGAIN. (DO NOT FOLD THE DISC.)' },
  { id: 'cmc', t: "Comet Cabbie: The Meter's Running", p: 'fer', tier: 1, base: 8, tag: 'common',
    d: 'A taxi game in space where every passenger wants the same planet and none of them tip. The meter keeps running on the pause screen.',
    b: "THE GALAXY'S NUMBER ONE CAB GAME. (ONLY CAB GAME.)" },
  { id: 'thd', t: 'Thunder Tortoise: Slow, Then Fast', p: 'k16', tier: 2, base: 21, tag: 'uncommon',
    d: 'A tortoise with lightning powers. The first hour is very slow. Then it is very fast for nine seconds. Then it is slow again. Somehow it works.',
    b: 'SPEED! (EVENTUALLY.)' },
  { id: 'csf', t: 'Canal Surfer: Radical Irrigation', p: 'pip', tier: 3, base: 55, tag: 'rare',
    d: 'Surfing the irrigation canals of a desert city. Only ever sold by mail order out of the back of a magazine. The wave is a guy with a hose.',
    b: "SURF'S UP! (THE CANAL IS LOW TODAY.)" },
  { id: 'gtc', t: 'Shrine of the Golden Taco: Extra Guac Edition', p: 'fer', tier: 3, base: 120, tag: 'rare',
    d: 'A quest for the legendary golden taco. Every collector wants one and nobody plays it, because the one guy who did will not shut up about it.',
    b: 'THE ULTIMATE QUEST. HOT SAUCE SOLD SEPARATELY.' }
];

// The sports-game-only bin. Worth basically nothing. Someone always wants $80 for one.
NP.SPORTS = [
  { id: 'gb94', t: "Gridiron Grind '94", p: 'k16', base: 1 },
  { id: 'gb95', t: "Gridiron Grind '95: Now With '95", p: 'k16', base: 1 },
  { id: 'gb96', t: "Gridiron Grind '96: The Roster Update", p: 'hal', base: 1 },
  { id: 'gb97', t: "Gridiron Grind '97: The Good One", p: 'hal', base: 2 },
  { id: 'gb98', t: "Gridiron Grind '98: Same as '97", p: 'lum', base: 1 },
  { id: 'chh', t: "Courtside Hustle '96: Everybody Dunks", p: 'lum', base: 1 },
  { id: 'chh2', t: "Courtside Hustle '97: Still Dunking", p: 'hal', base: 1 },
  { id: 'pkp', t: "Puck Punchers '95: Mostly Fights", p: 'k16', base: 1 },
  { id: 'dmd', t: "Diamond Dingers '98: Extra Innings Edition", p: 'lum', base: 1 },
  { id: 'gfp', t: "Fairway Fever '99: Golf for Golf People", p: 'hal', base: 1 }
];

// What each game is, in one line, and the tag you see when you look at it.
// Catalog games carry their own tag and line above. Everything else is handled here.
NP.TAGS = {
  rare: 'Rare, Allegedly', uncommon: 'Kinda Rare', common: 'Everybody Has One', shovel: 'Shovelware', gem: 'Hidden Gem', cult: 'Cult Classic',
  sports: 'Worth $1', merch: 'Worthless Merch', lot: 'Mystery Lot', grail: 'Grail', repro: 'Bootleg'
};
// tag colors for the share card ([background, text]), matching style.css, and short versions for tight shelves
NP.TAG_COLORS = {
  rare: ['#ffcc33', '#0b1022'], uncommon: ['#29adff', '#0b1022'], common: ['#8a90a0', '#0b1022'], shovel: ['#8a5e36', '#fff1d6'],
  gem: ['#29d3e8', '#0b1022'], cult: ['#7e57c2', '#ffffff'], sports: ['#2d6a2d', '#fff1d6'], merch: ['#ff77a8', '#0b1022'],
  lot: ['#d8b07a', '#0b1022'], grail: ['#ffcc33', '#e4343e'], repro: ['#e4343e', '#ffffff']
};
NP.TAG_SHORT = { rare: 'Rare*', uncommon: 'Kinda', common: 'Common', shovel: 'Shovel', gem: 'Gem', cult: 'Cult', sports: '$1', merch: 'Merch', lot: 'Lot', repro: 'Bootleg' };
NP.SPORTS_DESC = {
  gb: 'Football. Every year it is the exact same game with a new number on the box and a slightly angrier man on the cover.',
  ch: 'Basketball where every player can dunk from half court, including the referee.',
  pk: 'Hockey, technically. Mostly fights. The puck is optional.',
  dm: 'Baseball where the batter catches fire on every home run. The fire department is not in the game.',
  gf: 'Golf. A gentle game for gentle people. Worth about a dollar. Priced at about eighty.'
};
NP.SPORTS_BOX = {
  gb: "NOW WITH THIS YEAR'S YEAR!", ch: 'NOW WITH DUNKS. ALL OF THEM.', pk: 'HOCKEY! (FIGHTS.)', dm: 'IT IS OUTTA HERE! (THE FUN.)', gf: 'FORE! (DOLLARS.)'
};
// opts.repro: true once you have spotted that this copy is a bootleg
NP.itemInfo = function (it, opts) {
  opts = opts || {};
  var cat = null, i;
  for (i = 0; i < NP.CATALOG.length; i++) if (NP.CATALOG[i].id === it.id) { cat = NP.CATALOG[i]; break; }
  var tag, d, b = '';
  if (it.kind === 'lot') { tag = 'lot'; d = 'Taped shut. A marker on the side says GAMES AND STUFF. It is mostly stuff. The stuff is mostly football.'; }
  else if (it.kind === 'grail') { tag = 'grail'; d = 'Never heard of it. The weird little label says "you are here."'; b = 'YOU ARE HOLDING THE GAME YOU ARE PLAYING. PLEASE DO NOT THINK ABOUT IT.'; }
  else if (it.kind === 'merch') {
    var m = null; for (i = 0; i < NP.MERCH.length; i++) if (NP.MERCH[i].id === it.id) m = NP.MERCH[i];
    tag = 'merch'; d = m ? m.blurb : 'Official Nostalgia Pro merch. Worth nothing.';
  }
  else if (cat) { tag = cat.tag || 'common'; d = cat.d || ''; b = cat.b || ''; }
  else { var k = String(it.id || '').slice(0, 2); tag = 'sports'; d = NP.SPORTS_DESC[k] || 'A sports game. There are so many of these.'; b = NP.SPORTS_BOX[k] || ''; }
  if (opts.repro) tag = 'repro';
  return { tag: tag, label: NP.TAGS[tag], d: d, box: b };
};

NP.GRAIL = { id: 'npg', t: 'Nostalgia Pro: The Game', p: 'pip', tier: 4, base: 0, grail: true };

// Fake merch. Worth nothing on the shelf. Costs you points. That is the joke.
NP.MERCH = [
  { id: 'm1', t: 'Nostalgia Pro: The Shelf Dust', price: 12, blurb: 'Authentic dust from an authentic shelf. Sprinkle on any game to make it look like you have owned it since 1991.' },
  { id: 'm2', t: 'Nostalgia Pro: The Manual (sold separately)', price: 25, blurb: 'A manual for a game that is also sold separately. The manual explains where to buy the manual.' },
  { id: 'm3', t: "Nostalgia Pro: The Price Sticker That Won't Come Off", price: 8, blurb: 'Industrial strength. Removes paint. Will outlive you. Sticker remover sold separately and also has a sticker on it.' },
  { id: 'm4', t: 'Nostalgia Pro: The Repro', price: 40, blurb: 'We are being honest with you. It is fake. Says FAKE right on it. In a font that looks off.' },
  { id: 'm5', t: 'Nostalgia Pro: The Shrink Wrap', price: 18, blurb: 'Make anything factory sealed again. Your games. Your lunch. Your car. Probably legal.' },
  { id: 'm6', t: 'Nostalgia Pro: The Day-One Patch', price: 15, blurb: 'An iron-on patch. Fixes nothing. Patches everything. Iron sold separately.' },
  { id: 'm7', t: 'Nostalgia Pro: The Bubble Mailer', price: 10, blurb: 'Pre-crushed at the factory for authenticity. Every bubble has already been popped by a professional.' },
  { id: 'm8', t: 'Nostalgia Pro: The Grading Slab (self-graded)', price: 30, blurb: 'A clear plastic case that says 10. We graded it ourselves. We gave it a 10. We are very fair.' }
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
    hi: ["Oh, my grandson's old games! He's 41 now. Make me an offer, hon.", 'Everything must go. My husband says so. He is in the garage hiding his records.', "I don't know what any of these are, sweetie, but the one with the ferret seems nice."],
    yes: ['Sold! Want a lemonade? It is mostly ice.', "That's fine, sweetie. Put it on your little shelf.", 'Deal. Take a cookie too. Take two. Please, I made forty.'],
    no: ['Hmm, a little more than that, hon? I have a cruise to pay for.', 'Oh, I could not. That one has sentimental value. To my grandson. Who left it here in 1997.'] },
  friendly: { name: 'Friendly Vendor', ask: 0.7, minLo: 0.5, minHi: 0.85,
    hi: ['Cash talks, friend. What is it saying?', 'All priced to move. Some of it has been moving since 2009.', 'Everything works. Most of it. Some of it. It all turns on.'],
    yes: ['You got it.', 'Pleasure doing business. Tell your followers.', 'Deal. You just made my whole Saturday.'],
    no: ["Can't go that low. Meet me in the middle? The middle is up here.", 'Ehh. Try again. With more money.'] },
  firm: { name: 'Price Is Firm Guy', ask: 0.8, minLo: 1, minHi: 1,
    hi: ['Prices are on the stickers. Stickers are firm.', 'Read the sign. PRICE. IS. FIRM.', 'I laminated the sign. That is how firm.'],
    yes: ['Correct amount. Thank you.', 'The exact sticker price. You honor the sign.'],
    no: ['Price is firm.', 'Did you read the sign?', 'The sign is also firm.', 'I am firm. My table is firm. My handshake is firm. Price is firm.'] },
  ikwig: { name: 'I Know What I Got', ask: 1.9, minLo: 0.75, minHi: 1, touchy: true,
    hi: ['I looked it up online. One sold for $400 in 2011. I know what I got.', "Don't even. I know what I got.", 'These are rare. I know because I am the one selling them.'],
    yes: ['Smart buyer. You know what I got too.', 'Fine. But I know what I got. And now you got it.'],
    no: ['I know what I got.', 'Nope. I KNOW what I got.', 'Sir, I know what I got. I have known since birth.'],
    mad: ["Lowball me? It's off the table. I know what I got, and it's not you."] },
  pawn: { name: 'Pawn Counter', ask: 1.3, minLo: 0.75, minHi: 1,
    hi: ['Everything here is tested. You pay for peace of mind.', "Tested, cleaned, guaranteed. That's the markup.", 'We blow on every cartridge personally. Twice.'],
    yes: ['Ring it up.', "Done. Thirty-day warranty. Don't lose the receipt. Everybody loses the receipt."],
    no: ['Best I can do is the sticker.', 'Boss sets the prices, buddy. I have never met the boss.'] },
  kid: { name: "Kid Selling Dad's Stuff", ask: 0.4, minLo: 0.3, minHi: 0.6, wild: true,
    hi: ["These are my dad's. He said sell whatever. He was looking at his phone.", 'Mom said I can keep the money! Dad is not up yet!', 'I need forty dollars for a scooter. Make it count.'],
    yes: ['Sweet! Thanks!', 'Okay cool! Do not tell my dad what you paid.'],
    no: ['Umm my dad said not that low. I think. He was asleep.'] },
  sports: { name: 'Sports Bin Guy', ask: 1, minLo: 0.5, minHi: 1,
    hi: ["Got every year of Gridiron Grind. '97 is the good one.", 'Football games, a dollar each. Except the special ones. They are all special.'],
    yes: ['Enjoy the football.', 'Good year. Great year. Best year.'],
    no: ["That's a collector's piece, pal.", "You don't haggle on a '97. Nobody haggles on a '97."] }
};

// ---------- shop owners buying from you (selling and trading in) ----------
// lo/hi = the most they will pay, as a share of what the game is really worth. The first offer is lower than that.
// firm: the offer never moves. touchy: ask once too often and they stop buying that game. detect: always spots a bootleg.
// all: buys anything (merch and sports games too). {$} is the amount.
NP.BUYERS = {
  pawn: { lo: 0.45, hi: 0.58, all: true, detect: true,
    open: ["I'll give you {$} for it. Cash. Today. Right now.", '{$}. I have to test it, clean it and mark it up. Mostly mark it up.', '{$}. That is the pawn price. The pawn price is a feeling.'],
    // the pawn counter can smell a game you already own, and pays a little extra for it
    dupe: ['You already own this one, huh? Duplicates are our whole business. {$}.', 'Second copy? We love a second copy. {$}.'],
    up: ["Fine. {$}. Don't tell the boss.", "{$}, and I'm being generous. I am never generous."],
    best: ['{$} is my best. The boss checks the receipts.', "That's the number. {$}. The number does not move."],
    sold: ['Done. It is ours now.', "Pleasure. It'll be in the glass case by lunch at triple the price."],
    trade: ['{$} in store credit. Spend it here. Only here. Forever here.'],
    bootleg: ["That's a bootleg, pal. {$} for the plastic."] },
  friendly: { lo: 0.5, hi: 0.7,
    open: ['I could do {$} for that.', 'Ooh, that one sells. {$}?', '{$}, and I will throw in a handshake.'],
    up: ['Alright, alright. {$}.', 'You drive a hard bargain. {$}.'],
    best: ["{$}. That's everything in the cash box, friend."],
    sold: ['Pleasure doing business.', 'Deal. Back on the table it goes. With a new sticker.'],
    trade: ['{$} toward anything I have. Shake on it.'],
    bootleg: ['Hmm, the label looks a little shiny. {$}, and I am being nice.'] },
  firm: { lo: 0.55, hi: 0.55, firm: true,
    open: ['{$}. Firm.', 'I buy at {$}. The buying price is also firm.'],
    up: ['The offer is firm.'],
    best: ['The offer is firm.', 'I laminated the offer. It is firm.'],
    sold: ['Correct transaction. Thank you.'],
    trade: ['{$} in credit. The credit is also firm.'],
    bootleg: ['That is a bootleg. {$}. Firmly.'] },
  ikwig: { lo: 0.55, hi: 0.75, touchy: true, detect: true,
    open: ['I know what YOU got too. {$}.', 'I looked it up. It is worth {$} to me. I know what you got.'],
    up: ['Hmm. {$}. But only because I know what you got.'],
    best: ["{$}. That's the number. I know what you got."],
    mad: ["Ask me again? Off the table. I know what you got, and I don't want it."],
    sold: ['Smart seller. Now I got what you got.'],
    trade: ['{$} in credit. I know what you will get.'],
    bootleg: ['A bootleg? To ME? {$}. For the box.'] }
};
NP.NOBUY = {
  yard: 'Yard sales do not buy. They are trying to get rid of stuff, not get more.',
  sports: 'The football guy does not buy. He has enough football. He has all of it.',
  gift: 'The Gift Shop does not buy anything. It only sells. That is the whole business model.'
};

NP.RIVAL = { name: 'Dex', shop: 'Flipside Resale' };

// CRT commercials. Still frames, skippable.
NP.ADS = [
  { h: 'NOSTALGIA PRO: THE SHELF DUST', s: 'Authentic dust from an authentic shelf.', f: 'Now available SEALED.' },
  { h: 'NOSTALGIA PRO: THE DAY-ONE PATCH', s: 'Fixes nothing. Patches everything.', f: 'Iron not included. Patch not included.' },
  { h: 'NOSTALGIA PRO: THE SHRINK WRAP', s: 'Is it factory sealed? It is now.', f: 'Ask your local swap meet about resealing.' },
  { h: 'NOSTALGIA PRO: THE MANUAL', s: '(sold separately)', f: 'The separate part is sold separately.' },
  { h: "NOSTALGIA PRO: THE PRICE STICKER", s: "That won't come off.", f: 'Ever. We tested it. On a sealed copy.' },
  { h: 'NOSTALGIA PRO: THE REPRO', s: 'Looks real. Feels real. Is not.', f: 'Proudly displayed by 0 out of 10 collectors.' },
  { h: "MESQUITE MIKE'S BEEF JERKY", s: 'Chew the miles.', f: 'Mike would like you to know he is not a sponsor.' },
  { h: 'HABOOB ANTIPERSPIRANT', s: "It's a dry heat.", f: 'You will still sweat. You will sweat with dignity.' }
];
NP.ADFREE_ADS = [
  { h: 'AD-FREE EDITION ACTIVE', s: 'You are now enjoying zero ads.', f: 'Brought to you by Nostalgia Pro: The Ad-Free Edition.' },
  { h: 'TIRED OF ADS?', s: 'Upgrade to the Ad-Free Edition.', f: 'You already have it. Upgrade again.' },
  { h: 'AD-FREE EDITION: GOLD', s: 'Twice the ad-free. Same ads.', f: 'This message is ad-free.' }
];
NP.TICKER = [
  'Try Nostalgia Pro: The Shelf Dust',
  'Ask about Nostalgia Pro: The Manual (sold separately)',
  'Nostalgia Pro: The Gift Shop is open till {end}',
  'Now with 40% more Nostalgia Pro',
  'This stop sponsored by Nostalgia Pro',
  'Saguaro Splash Cola: the official cola of not being sponsored',
  "Mesquite Mike's Beef Jerky: chew the miles",
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
  "Psst. Nostalgia Pro: The Manual. It's sold separately.",
  "I'm not saying you should buy Mesquite Mike's Jerky. Mike is saying that. Through me."
];
NP.PITCHES_ADFREE = [
  'Have you heard about the Ad-Free Edition? No ads. Like this one.',
  'I would pitch you merch, but you have the Ad-Free Edition. Nice.'
];

// The sponsors that are definitely not sponsors. Made up, like everything else in here.
NP.SPONSOR = {
  name: 'Saguaro Splash Cola',
  short: 'SAGUARO SPLASH',
  weather: 'Stay cool. Stay hydrated. Stay Saguaro Splash.',
  // the forecast is sponsored no matter what the weather does (all of these fit the forecast screen)
  weatherBy: {
    hot: 'Stay cool. Stay hydrated. Stay Saguaro Splash.',
    sunny: 'Sunshine brought to you by Gila Glow SPF 900.',
    rain: 'Rain presented by Haboob Antiperspirant.'
  },
  react: '...did the weather just get sponsored?',
  colaLine: "I don't do endorsements, man. This is about the games.",
  colaAction: 'He slowly turns a can of Saguaro Splash Cola label-out, toward nobody in particular. The smile does not move.',
  // the one seller per Saturday who would never, ever sell out
  refuse: {
    grandma: ["Oh, I don't do commercials, hon. Never have. Never will.", 'She sets a can of Saguaro Splash Cola on the card table, label out, and slides it two inches toward you. Then two more inches.'],
    kid: ['My dad says sellouts are the worst kind of people.', 'He is wearing a Saguaro Splash Cola hat, a Saguaro Splash Cola shirt and one Saguaro Splash Cola sock. He takes a long, slow sip.'],
    friendly: ["I don't do endorsements, man. This is about the games.", 'He slowly turns a can of Saguaro Splash Cola label-out, toward nobody in particular. The smile does not move.'],
    firm: ['No sponsors. Sponsors are not firm.', 'He drinks a Saguaro Splash Cola in one long pull without breaking eye contact. He sets it down label-out. Firmly.'],
    ikwig: ['Nobody buys me. I know what I got, and what I got is integrity.', 'A Saguaro Splash Cola cooler sits behind him. It has his name on it. In the Saguaro Splash font.'],
    pawn: ['We are an independent pawn shop. No corporate anything.', 'The counter clerk opens a fresh Saguaro Splash Cola. The sound is somehow in stereo. A light comes from nowhere.'],
    sports: ["Football's pure, man. No ads.", "He is wearing a foam finger. It says SAGUARO SPLASH COLA, OFFICIAL COLA OF '97."]
  },
  vanLines: [
    "The van? It came like that. I don't sell out.",
    'Selling out is for people who sell out. I flip. Totally different.',
    'Nobody paid for that wrap. They paid me to say nobody paid for that wrap.',
    "It's not an ad if you don't read it. Don't read it."
  ],
  // signs along the road. One shows on the map now and then.
  billboards: [
    "BILLBOARD: Mesquite Mike's Beef Jerky. Chew the miles. Mike is not a sponsor. Mike paid for this billboard.",
    "BILLBOARD: Haboob Antiperspirant. It's a dry heat. You still smell.",
    'BILLBOARD: Gila Glow SPF 900. You will not tan. You will barely be visible.',
    'BILLBOARD: Saguaro Splash Cola. The official cola of not being sponsored.',
    'BILLBOARD: This space available. Saguaro Splash Cola already bought it. It is still available.'
  ],
  billboardsAdFree: [
    'BILLBOARD: This billboard is part of the Ad-Free Edition. It advertises nothing. Beautifully.',
    'BILLBOARD: You are driving past an ad-free billboard. You are welcome.'
  ],
  home: 'You crack open a cold Saguaro Splash Cola. Not for any reason. It is just in your hand now. Label out.',
  appraisal: 'This appraisal is 100% unsponsored. (A long, refreshing sip.)'
};

// ---------- varied Saturdays: one twist for the whole town (full game only). w = how often it comes up ----------
NP.THEMES = [
  { id: 'none', w: 3 },
  { id: 'cleanout', w: 2, name: 'Garage cleanout day', line: 'Half the town is cleaning out the garage. Every dig pile is twice as deep.' },
  { id: 'sealed', w: 2, name: 'Sealed Saturday', line: 'Somebody\'s uncle never opened anything. More sealed games around town.' },
  { id: 'football', w: 1, name: 'Game day', line: 'It is game day. Football games are everywhere, and the football guy is in a great mood.' },
  { id: 'buyers', w: 2, name: 'Buyers are hungry', line: 'Shops are low on stock. Owners pay more when you sell or trade in today.' },
  { id: 'moving', w: 2, name: 'Moving weekend', line: 'Half the town is moving. Yard sale sellers just want it gone.' }
];

// ---------- the two ways to play ----------
NP.MODES = {
  noon: { id: 'noon', name: 'Back by noon', short: 'Short run', blurb: 'A few stops. Home by 12:00 PM.', endLabel: '12:00 PM' },
  sundown: { id: 'sundown', name: 'Home by sundown', short: 'Long run', blurb: 'The whole Saturday. Home by 5:30 PM.', endLabel: '5:30 PM' }
};

// ---------- teaching the game ----------
// The Saturday to-do list on the fridge. The same list shows on the How to play screen.
// m is 'noon' or 'sundown' (true still means the demo, which is always noon).
NP.GOALS = function (m) {
  var noon = m === true || m === 'noon';
  return [
    noon ? '$100 budget.' : '$250 budget.',
    noon ? 'Back by noon.' : 'Home by sundown (5:30).',
    "Buy what's worth it.",
    "Don't buy what you already own.",
    'Watch out for fakes.',
    'Beat Dex to the good stuff.'
  ];
};
// One-time tips. Each shows once, ever, and costs no daylight. "short" is the How to play version.
NP.TIPS = {
  offers: { h: 'Making an offer', b: 'Lowball is half the sticker. Some sellers take it. Some take it personally. Fair is three quarters. Full price always works, which is how they get you.',
    short: 'Lowball, Fair or Full price. Lowball can offend people. Full price always works, which is how they get you.' },
  pricey: { h: 'That is a lot of money', b: 'Inspect takes 5 minutes and catches fakes, disc rot and suspicious shrink wrap. You also get to read the back of the box. A repro costs you points. And a little dignity.',
    short: 'Inspect (5 min) catches fakes, disc rot and suspicious shrink wrap. Worth it on anything pricey.' },
  dupe: { h: 'Rings a bell?', b: 'You might already own this one. You own a lot of games. "Is it on the shelf?" checks your collection in 10 minutes. Buying it twice costs points.',
    short: '"Is it on the shelf?" (10 min) checks your collection. Buying a game twice costs points.' },
  dex: { h: 'That is Dex', b: 'Dex from Flipside Resale. He is after the same stuff you are, and he does not stop to read tips. Get to the good tables first.',
    short: 'Dex from Flipside Resale is after the same stuff you are. He does not wait.' },
  broke: { h: 'Out of money?', b: 'It happens. Sell or trade in something from your bag at a thrift store, the pawn shop or a swap meet table, and you are back in. Cash you do not spend is worth points at the end.',
    short: 'Out of cash? Sell or trade in games from your bag at thrift stores, the pawn shop and swap meet tables.' },
  sell: { h: 'Selling and trading in', b: 'This owner buys games. Sell for cash, or trade it in for 30% more as store credit you can only spend here. Ask for more if you dare. Some owners take it personally.',
    short: 'Thrift stores, the pawn shop and swap meet tables buy games. Trade-in pays 30% more, as credit at that stop. Asking for more can backfire.' }
};
