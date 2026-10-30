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
  { id: 'mf1', g: 'platformer', t: 'Moon Ferret: Cheese Is a Moon Thing Now', p: 'k16', tier: 1, base: 9, set: 'mf', tag: 'common',
    d: 'A ferret on the moon collects cheese, because a guy in marketing said the moon is cheese and nobody checked. 72 levels. Every one of them is gray.',
    b: 'WARNING: CONTAINS MOON.' },
  { id: 'mf2', g: 'platformer', t: 'Moon Ferret 2: Even More Moon', p: 'k16', tier: 2, base: 18, set: 'mf', tag: 'uncommon',
    d: 'Same ferret, same moon, but now the moon has tunnels and the ferret has a tragic backstory told entirely in grunts. One magazine called it "more moon." That was the whole review.',
    b: 'NOW WITH 40% MORE MOON THAN THE FIRST MOON.' },
  { id: 'mf3', g: 'platformer', t: 'Moon Ferret 3: The Party Hat Years', p: 'k16', tier: 3, base: 45, set: 'mf', tag: 'rare',
    d: 'The ferret gets a party hat and a midlife crisis. The studio closed the week it shipped, so every copy is rare, and every copy has the bug where the moon falls off.',
    b: 'THE FINAL CHAPTER. UNTIL THE NEXT ONE.' },
  { id: 'tcr', g: 'racing', t: 'Turbo Cactus Rally Turbo', p: 'k16', tier: 1, base: 7, tag: 'common',
    d: 'Kart racing where every racer is a cactus, so bumping into anyone hurts you both. The word TURBO is on the box four times. There is no turbo button.',
    b: 'TURBO! TURBO! TURBO! (NOT A FEATURE.)' },
  { id: 'wiz', g: 'rpg', t: 'Wizard Accountant: Quest for the Lost Receipt', p: 'fer', tier: 2, base: 22, tag: 'gem',
    d: 'Turn-based tax battles. You cast Itemized Deduction for 40 damage. The final boss is an audit with three health bars, and the people who beat it will not stop talking about it.',
    b: '"I CRIED AT THE AMORTIZATION SCENE." SAYS A GUY' },
  { id: 'skp', g: 'sports', t: 'Skate Possum: Plays Dead Extreme', p: 'k16', tier: 1, base: 6, tag: 'common',
    d: 'Every time you bail, the possum plays dead for 45 seconds and you cannot skip it. Roughly half of the game is watching a possum pretend to be dead.',
    b: 'RADICAL TO THE MAX. MAX SOLD SEPARATELY.' },
  { id: 'dln', g: 'rpg', t: 'Dungeon Lasagna: Forty Layers Deep', p: 'lum', tier: 2, base: 28, tag: 'gem',
    d: 'A dungeon crawler where every floor is a layer of lasagna and the final boss is a fork. It takes 90 hours to beat. The memory card holds 40 of them.',
    b: 'BAKED AT 350 FOR YOUR ENJOYMENT.' },
  { id: 'nej', g: 'puzzle', t: 'Neon Jellyfish Deluxe Platinum Gold Edition', p: 'hal', tier: 1, base: 8, tag: 'shovel',
    d: 'A glowing jellyfish screensaver with a score counter bolted on. The score goes up whether you touch the controller or not. The Platinum Gold Edition is the same disc in a shinier case.',
    b: 'THE ULTIMATE JELLYFISH EXPERIENCE.* *EXPERIENCE NOT INCLUDED.' },
  { id: 'cgr', g: 'strategy', t: 'Castle Grumble: Siege of Complaints', p: 'fer', tier: 1, base: 10, tag: 'common',
    d: 'Castle defense, but the castle complains the entire time. It hates the catapults, the weather and you. The voice actor was clearly double parked.',
    b: 'THE CASTLE THAT TALKS BACK!' },
  { id: 'pgg', g: 'sports', t: "Gecko Golf '97: Deluxe Edition", p: 'pip', tier: 1, base: 5, tag: 'shovel',
    d: "Nine holes of mini golf where the gecko is the ball. The gecko did not agree to this. It is the same nine holes as the '96 one, but deluxe.",
    b: 'EIGHTEEN HOLES OF FUN! (NINE HOLES.)' },
  { id: 'rob', g: 'puzzle', t: 'Robo Barista: Extra Shot Edition', p: 'pip', tier: 2, base: 16, tag: 'uncommon',
    d: 'Make lattes for robots before the morning rush. Robots cannot drink coffee. They order it anyway and get furious when you misspell their serial numbers.',
    b: 'BREWED BY ROBOTS, FOR ROBOTS. HUMANS TOLERATED.' },
  { id: 'sky', g: 'shooter', t: 'Sky Llama Air Patrol: Spit Happens', p: 'k16', tier: 2, base: 24, tag: 'uncommon',
    d: 'A flight shooter starring llamas in goggles. Two players share one controller, which has ended at least four friendships. The llamas spit missiles. Nobody asked how.',
    b: 'TOTALLY AIRBORNE! LLAMAS NOT RESPONSIBLE FOR SPIT.' },
  { id: 'hmp', g: 'action', t: 'Haunted Mall Panic: Clearance of the Damned', p: 'lum', tier: 3, base: 70, tag: 'rare',
    d: 'Survive one night in a haunted mall with the ghost of a guy who still has a coupon. Pulled from stores after it scared an entire food court. The surviving copies still smell like a pretzel stand.',
    b: 'SO SCARY IT WAS RECALLED. (IT WAS RECALLED FOR A DIFFERENT REASON.)' },
  { id: 'vpk', g: 'rpg', t: 'Vapor Knight: Sunset Forever', p: 'hal', tier: 2, base: 20, tag: 'uncommon',
    d: 'A knight walks toward a sunset for six hours while a synth soundtrack plays. There is one sword fight, and it happens during the credits. The soundtrack slaps.',
    b: 'FEEL THE SYNTH. SEE THE SUNSET. DO NOTHING ELSE.' },
  { id: 'ttt', g: 'strategy', t: 'Three Tank Tactics: Ultimate Total Warfare Supreme', p: 'fer', tier: 1, base: 6, tag: 'shovel',
    d: 'A deep strategy game with three tanks and exactly one map. Two of the tanks are decorative. The box promises thousands of battles, which is true if you play it thousands of times.',
    b: 'THOUSANDS OF BATTLES!*' },
  { id: 'msa', g: 'racing', t: 'Plateau Panic: No Brakes Edition', p: 'k16', tier: 1, base: 8, tag: 'common',
    d: 'Demolition derby on top of a plateau with no guard rails. The tutorial is driving off the edge. So is the rest of the game.',
    b: 'BRAKES NOT INCLUDED. NEITHER IS THE PLATEAU.' },
  { id: 'gpn', g: 'action', t: 'Ghost Pepper Ninja: Mild Mode Not Found', p: 'hal', tier: 2, base: 26, tag: 'cult',
    d: 'A spicy ninja who breathes fire and has three hit points. Brutally hard on purpose. Its fans call it a masterpiece and will tell you so at a party you did not invite them to.',
    b: 'TOO HOT FOR TV. ALSO TOO HOT FOR YOU.' },
  { id: 'stm', g: 'puzzle', t: 'Orbit Mopper: Galactic Janitor Saga', p: 'fer', tier: 1, base: 5, tag: 'shovel',
    d: 'You mop the floors of a space station. That is the whole game. The giant space battle on the box happens outside a window you are not allowed to look out of.',
    b: 'AN EPIC SPACE ADVENTURE. FLOORS ONLY.' },
  { id: 'lll', g: 'puzzle', t: 'Blob Lamp Legends: The Warm-Up', p: 'lum', tier: 1, base: 9, tag: 'common',
    d: 'A puzzle game about those lamps with the slow blobs in them. The first level takes twenty minutes to warm up. So does every level after that.',
    b: 'GROOVY! PLEASE WAIT.' },
  { id: 'bro', g: 'rpg', t: 'Brunch Crusade: The Syrup Wars', p: 'hal', tier: 3, base: 85, tag: 'rare',
    d: 'An epic quest across eleven kingdoms for the perfect pancake. Fewer than 5,000 copies were made because each disc cost more than the pancakes. Every copy is a little sticky.',
    b: 'THE LEGENDARY BREAKFAST ADVENTURE. BEST SERVED WARM.' },
  { id: 'cyr', g: 'action', t: 'Cyber Raccoon: Hack the Trash', p: 'lum', tier: 2, base: 19, tag: 'cult',
    d: 'A raccoon hacker in the distant future of next Tuesday. He raids the mainframe, then the dumpster behind the mainframe. Everyone who owns it wears sunglasses indoors.',
    b: 'THE FUTURE IS NOW. (IT WAS LAST TUESDAY.)' },
  { id: 'bfb', g: 'sports', t: 'Badger Bowl Extreme', p: 'pip', tier: 1, base: 4, tag: 'shovel',
    d: 'Bowling, with badgers as the pins. The badgers are not happy about it and file a complaint after every strike. "Extreme" refers to how the badgers feel.',
    b: 'EXTREME BOWLING ACTION! THE BADGERS DISAGREE.' },
  { id: 'pxp', g: 'strategy', t: 'Pixel Prairie: Just One More Day', p: 'fer', tier: 2, base: 17, tag: 'gem',
    d: 'A one-screen farming game that eats whole weekends. You grow one turnip. Then a slightly better turnip. Then it is Monday and you have not showered.',
    b: '"JUST ONE MORE DAY." SAID EVERYONE, AT 4 AM' },
  { id: 'tnk', g: 'strategy', t: 'Turnip Monarchy: Royal Root Edition', p: 'k16', tier: 3, base: 60, tag: 'rare',
    d: 'A turnip becomes king and immediately raises taxes. Pulled from shelves after a lawsuit from a vegetable company nobody can find any record of. The judge called it "a lot of turnip."',
    b: 'LONG LIVE THE TURNIP!' },
  { id: 'esc', g: 'platformer', t: 'Escalator Escape: 99 Floors the Wrong Way', p: 'pip', tier: 1, base: 6, tag: 'common',
    d: 'Walk up the down escalator. 99 levels of it. Level 100 is the stairs, and the stairs are out of order.',
    b: 'THE THRILLING SEQUEL TO WALKING.' },
  { id: 'bgd', g: 'racing', t: 'Sasquatch Derby: Blurry Edition', p: 'hal', tier: 1, base: 7, tag: 'common',
    d: 'Racing as a sasquatch. Every screenshot on the box is slightly out of focus. It is in every bargain bin in the state, and two of them are in your garage right now.',
    b: 'NOW IN BLURRY-VISION!' },
  { id: 'hyo', g: 'action', t: 'Crease Fighters: Paper Cuts', p: 'lum', tier: 2, base: 23, tag: 'gem',
    d: 'A fighting game where you fold paper into fighters. Everybody rented it and nobody bought it. Every single special move is a paper cut.',
    b: 'FOLD. FIGHT. FOLD AGAIN. (DO NOT FOLD THE DISC.)' },
  { id: 'cmc', g: 'racing', t: "Comet Cabbie: The Meter's Running", p: 'fer', tier: 1, base: 8, tag: 'common',
    d: 'A taxi game in space where every passenger wants the same planet and none of them tip. The meter keeps running on the pause screen.',
    b: "THE GALAXY'S NUMBER ONE CAB GAME. (ONLY CAB GAME.)" },
  { id: 'thd', g: 'platformer', t: 'Thunder Tortoise: Slow, Then Fast', p: 'k16', tier: 2, base: 21, tag: 'uncommon',
    d: 'A tortoise with lightning powers. The first hour is very slow. Then it is very fast for nine seconds. Then it is slow again. Somehow it works.',
    b: 'SPEED! (EVENTUALLY.)' },
  { id: 'csf', g: 'sports', t: 'Canal Surfer: Radical Irrigation', p: 'pip', tier: 3, base: 55, tag: 'rare',
    d: 'Surfing the irrigation canals of a desert city. Only ever sold by mail order out of the back of a magazine. The wave is a guy with a hose.',
    b: "SURF'S UP! (THE CANAL IS LOW TODAY.)" },
  { id: 'gtc', g: 'rpg', t: 'Shrine of the Golden Taco: Extra Guac Edition', p: 'fer', tier: 3, base: 120, tag: 'rare',
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
  else if (it.kind === 'grail') { tag = 'grail'; d = it.id === 'npx' && NP.EXPO ? NP.EXPO.grail.d : 'Never heard of it. The weird little label says "you are here."'; b = 'YOU ARE HOLDING THE GAME YOU ARE PLAYING. PLEASE DO NOT THINK ABOUT IT.'; }
  else if (it.ultra && NP.ULTRA) {
    var ux = null; for (i = 0; i < NP.ULTRA.length; i++) if (NP.ULTRA[i].id === it.id) ux = NP.ULTRA[i];
    tag = 'ultra'; d = ux ? ux.d : 'Ultra rare.'; b = 'ONLY A HANDFUL EXIST. THIS IS ONE OF THEM.';
  }
  else if (it.ex && NP.EXPO) {
    var ex = null; for (i = 0; i < NP.EXPO.exclusives.length; i++) if (NP.EXPO.exclusives[i].id === it.id) ex = NP.EXPO.exclusives[i];
    tag = ex ? ex.tag : 'rare'; d = ex ? ex.d : 'A convention exclusive.'; b = 'CONVENTION EXCLUSIVE. NUMBERED. ALLEGEDLY.';
  }
  else if (it.kind === 'merch') {
    var m = null; for (i = 0; i < NP.MERCH.length; i++) if (NP.MERCH[i].id === it.id) m = NP.MERCH[i];
    tag = 'merch'; d = m ? m.blurb : 'Official Nostalgia Pro merch. Worth nothing.';
  }
  else if (it.kind === 'music' || it.kind === 'movie') {
    var md = null; for (i = 0; i < NP.MEDIA.length; i++) if (NP.MEDIA[i].id === it.id) md = NP.MEDIA[i];
    tag = md ? md.tag : 'common'; d = md ? md.d : ''; b = md ? md.b : '';
  }
  else if (it.kind === 'mbox') { tag = 'lot'; d = NP.MBOX ? NP.MBOX.d : 'A mystery box.'; }
  else if (it.kind === 'gear') { tag = 'gear'; d = (NP.GEAR[it.id] || {}).d || 'Not a game.'; }
  else if (it.kind === 'standee') { tag = 'standee'; d = NP.RENTAL.standee.d; }
  else if (it.kind === 'bulk') { tag = 'bulk'; d = NP.BULK.d; }
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
  yard: ['Yard Sale on Mesquite Ln', 'Garage Sale on Ocotillo Dr', 'Estate Sale off Creosote Way', 'Moving Sale on Quail Run'],
  sports: ['Cul-de-sac Sale on Javelina Ct'],
  thrift: ['Desert Bloom Thrift', 'Second Wind Thrift', 'Bargain Barn of Mild Regret'],
  flea: ['Saguaro Swap Meet'],
  pawn: ["Lucky Lyle's Pawn & Loan", 'Tumbleweed Pawn'],
  gift: ['Nostalgia Pro Official Gift Shop'],
  // Round 3b: the stores. They rotate, so only a couple are open on any one Saturday.
  mall: ['Glass Case Games'],
  banned: ['Staff Only Games'],
  pal: ["Lonnie's Games & Whatnot"],
  record: ['Music Store (Also Movies) (Also Games)'],
  rental: ['Video Rental Store', 'The Other Video Rental Store']
};
NP.MALL = 'The Mall at Parking Lot C';

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
    no: ["That's a collector's piece, pal.", "You don't haggle on a '97. Nobody haggles on a '97."] },
  // Round 3b stores
  mall: { name: 'Glass Case Guy', ask: 1.6, minLo: 0.88, minHi: 1,
    hi: ['Everything is in mint condition. Mint is a feeling.', 'Do not touch the glass. I just did the glass.', 'Welcome to Glass Case Games. Prices are on the inside of the glass.'],
    yes: ['I will get the key. There are forty keys.', 'Great choice. That one was very expensive.', 'Bag? The bag is two dollars. Kidding. It is three.'],
    no: ['Prices are firm. Like my handshake. Which you will not be getting.', 'This is a mall. We do not haggle in a mall.', 'I would, but the glass would know.'] },
  pal: { name: 'Lonnie', ask: 0.85, minLo: 0.7, minHi: 0.85,
    hi: ["Hey! Come on in. Did I ever tell you about the time I almost bought a sealed Brunch Crusade? Sit down. Actually, stand. It's a long one.", 'There they are! Shelf still holding up?', 'Good timing. I just put out a box. I have not even priced it. I have looked at it, though. A lot.'],
    yes: ['Sold! Good pickup. Real good pickup. You want a bag? I have a bag from 1998.', 'Great game. Let me tell you about the ending. No. I will let you find out. I want to tell you so bad.', "Done. That's a punch on the card, too."],
    no: ['Ooh. Can you meet me a little closer to the sticker? The sticker has rent to pay.', "I'd love to. My landlord would not."] },
  snob: { name: 'Record Store Clerk', ask: 1.15, minLo: 0.8, minHi: 0.95, touchy: true,
    hi: ['You are browsing the vinyl. Interesting. Brave.', "If you are looking for the stuff everybody likes, it's in the bargain bin.", 'We do not have it. Whatever it is. We had it in 1996.'],
    yes: ['Interesting choice.', 'Bold. I mean that as a warning.', 'Sure. I had that one before it was good.'],
    no: ['That is not how money works here.', 'No. And now I know what you listen to.'],
    mad: ['Lowball me? Off the counter. I will be telling the other clerk about this. He will not care either.'] },
  chill: { name: 'Record Store Clerk', ask: 0.95, minLo: 0.65, minHi: 0.85,
    hi: ['Hey. Take your time. The music is on. The music is always on.', 'Everything in the dollar bin is a dollar. Everything else is a vibe.', 'We take punch cards from anywhere. Any card. I do not check.'],
    yes: ['Righteous. Enjoy it.', 'Good one. Side B is the real side.', 'Nice. That gets a punch.'],
    no: ['Ah, close. Little higher and we are friends.', 'Meet me in the middle, man. The middle is a nice place.'] },
  rental: { name: 'Last Employee', ask: 0.6, minLo: 0.5, minHi: 0.75,
    hi: ['Everything must go. Including me. Today is my last day. Also the store\'s.', 'We are closing. Please buy the tapes. The tapes have nowhere to go.', 'Welcome. Do you have an account with us? Oh no. You do.'],
    yes: ['Thank you. Please do not return it. We will not be here.', 'Sold. Rewind it once in a while. For me.', 'Rung up. On the last register that works.'],
    no: ['I am closing, not giving it away. Well. Almost giving it away.', 'The manager says no. The manager is a sticky note.'] }
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
    bootleg: ['A bootleg? To ME? {$}. For the box.'] },
  // Round 3b: media: true means they buy music and movies too
  mall: { lo: 0.25, hi: 0.35, detect: true,
    open: ['I can do {$}. In store credit it would be more. Store credit is how we say no.', '{$}. It is used, you understand. We only sell used at full price.'],
    up: ['Fine. {$}. Do not tell the glass.'],
    best: ['{$}. That is policy. I wrote the policy.'],
    sold: ['Thank you. It goes in the glass case now. At a glass case price.'],
    trade: ['{$} in store credit. Good for anything in the glass. Nothing in the glass is that cheap.'],
    bootleg: ['That is a bootleg. {$}, and only because I want the case.'] },
  pal: { lo: 0.6, hi: 0.8, media: true,
    open: ["Oh, nice! I could do {$}. That one's a good one.", '{$}? I would give more, but then I would have to charge more, and then my regulars would yell at me.'],
    up: ['For you? {$}. Do not tell anybody. Everybody already knows.'],
    best: ['{$} is everything I have got. I checked the register and my pockets.'],
    sold: ['Thanks! I know exactly who wants this. He is going to be so happy.'],
    trade: ['{$} in trade. And a punch on the card.'],
    bootleg: ['Oh, buddy. That is a bootleg. I will give you {$} so you do not feel bad.'] },
  snob: { lo: 0.45, hi: 0.6, touchy: true, detect: true, media: true,
    open: ['{$}. It is not a good copy. It is not a good album. It is {$}.', 'I can offer {$}. I am not happy about it.'],
    up: ['{$}. Do not make me do math again.'],
    best: ['{$}. That is the number. The number has taste.'],
    mad: ['Ask me again and I am putting it in the dollar bin. With you.'],
    sold: ['It goes in the bargain bin. Where it belongs.'],
    trade: ['{$} in store credit. Pick something good this time.'],
    bootleg: ['A bootleg. Cute. {$}.'] },
  chill: { lo: 0.55, hi: 0.75, media: true,
    open: ['I could do {$} for that, man.', '{$}? That sound cool?'],
    up: ['Alright. {$}. Good vibes only.'],
    best: ['{$} is the top, man. The register is basically empty.'],
    sold: ['Right on. Into the bins it goes.'],
    trade: ['{$} in store credit. Go find something weird.'],
    bootleg: ['Bootleg, huh. Still a vibe. {$}.'] }
};
NP.NOBUY = {
  yard: 'Yard sales do not buy. They are trying to get rid of stuff, not get more.',
  sports: 'The football guy does not buy. He has enough football. He has all of it.',
  gift: 'The Gift Shop does not buy anything. It only sells. That is the whole business model.',
  rental: 'They are closing. They are not buying anything. They are barely selling.',
  banned: 'Nobody here is buying. Nobody here is doing anything.'
};

NP.RIVAL = { name: 'Dex', shop: 'Flipside Resale' };

// ---------- the rivals. Each one changes one rule. Dex shows up every Saturday; the others rotate. ----------
// where: the stop types they can be at. rule: one line shown at the stop. lines: what they say when you talk to them or they get you.
NP.RIVALS = {
  dex: { name: 'Dex', tag: 'Flipside Resale', where: ['yard', 'thrift', 'flea'],
    rule: 'Takes the three priciest things and flips them at double the price.',
    lines: ["I'd never sell out. That's what separates me from these guys.", 'Curated. Twice the price. You are welcome.'] },
  brayden: { name: 'Brayden', tag: "mom's card", where: ['yard', 'mall'],
    rule: 'Look at something (Inspect, shelf check, or an offer they turn down), then move on to something else, and Brayden buys the first one.',
    lines: ["You put it down. That means it's mine. That's the rule.", 'I do not know what this is. I am buying it anyway.', 'Mom said anything under a hundred is fine.'],
    texts: ['MOM: what is {t} and why is it {$}', 'MOM: brayden', 'MOM: why are you at {place} you are at school'] },
  phil: { name: 'Phone Guy Phil', tag: 'checks sold listings', where: ['flea'],
    rule: 'Wanders the swap meet. If he is within two steps of you when you open a table, that table goes up 25%.',
    lines: ['Ooh, those go for eighty. Sold, not listed. Sold.', 'Hang on, let me check. Yeah. Way more than that.', 'I have never bought anything. I just like to know.'] },
  brody: { name: 'Brody', tag: 'BrodyBox, 11 subscribers', where: ['flea', 'yard', 'thrift', 'mall', 'record'],
    rule: 'Filming a haul video. Every action here takes 5 extra minutes while he asks you to redo your entrance.',
    ruleWalk: 'Filming a haul video at one table. That table is locked for 30 minutes.',
    lines: ['What is up, all eleven of you. This video is NOT sponsored. (He takes a long sip of a Saguaro Splash Cola.)', "Can you walk around? You're in my shot.", 'Can you do that again but more surprised?', 'Smash that subscribe button. Somebody. Anybody.'] },
  gary: { name: 'Gary', tag: 'everybody knows Gary', where: ['yard', 'thrift', 'pawn', 'record', 'rental'],
    rule: 'Gary already lowballed everyone here. Nobody is taking a lowball today.',
    lines: ['Five bucks for the whole table.', 'What is your best price? No, your real best price.', 'I will give you three dollars and a handshake. Half a handshake.'],
    seller: 'Not today, Gary. (Wait, you are not Gary. Still no.)' },
  steve: { name: 'Slab Steve', tag: 'sealed only', where: ['pawn', 'flea'],
    rule: 'Every sealed game is on hold for Steve. Pay 20% more and the hold goes away.',
    lines: ["I don't open things. Opening is for people who play games.", "If it's not in plastic, it's not real.", 'I have a climate controlled closet. It has a dehumidifier named Gerald.'] }
};

// ---------- the season: 12 Saturdays of Home by sundown ----------
NP.SEASON = {
  weeks: 12,
  startSavings: 130,   // plus the first paycheck = $250 on Saturday 1, same as one Home by sundown day
  paycheck: 120,       // what is left of each Friday paycheck after rent, gas and ramen
  // Round 3c balance pass: the season score (see seasonTotals in game.js)
  findPts: 5,          // points for every different find on the season shelf
  cashPer: 10,         // 1 point for every $10 left at the end (it used to be half your cash)
  fresh: 0.5,          // chance a game you already own gets swapped for one you do not, each season Saturday
  bonusWeight: 0.5     // share of mini-goal, quick find and surprise points that count toward the season score
};
NP.WEEKDAYS = [
  ['You went to work. You thought about the shelf.', 'A coworker asked what you did this weekend. You said "errands."'],
  ['Monday was long. Tuesday was longer.', 'You reorganized the shelf on Wednesday night. Then you reorganized it back.'],
  ['You watched a 40 minute video about cartridge labels during lunch.', 'You do not remember any of your meetings.'],
  ['Your car made a noise on Tuesday. It is probably fine.', 'You measured the shelf. It is the same size it was.'],
  ['You had a dream about a mystery lot box. It was all football games.', 'You woke up sweating.'],
  ['Someone at work said "video games are for kids." You smiled.', 'You said nothing. The shelf will remember.'],
  ['You found an old price sticker in your wallet. You kept it.', 'You do not know why. You will never know why.'],
  ['You looked at sold listings on your break. Then on your other break.', 'You might be turning into Phil.'],
  ['You ate ramen four nights in a row.', 'The shelf looks great, though.'],
  ['You bought a second shelf. Then you remembered you do not have a second wall.', 'You returned the shelf.'],
  ['Your boss asked if you had weekend plans.', 'You said yes. You did not elaborate. You never elaborate.']
];
NP.FINALE_NOTE = 'Saturday 12. The last Saturday of the season. Make it count.';

// ---------- endings. Checked top to bottom; the first one that fits is yours. ----------
// Round 3c: score = the season shelf (every different thing once, at its best copy; convention finds count double)
// + 5 points for every different find + 1 point for every $10 left over. items/dupes/merch count what is on the season shelf.
// Thresholds were set from simulated seasons (see the CHANGELOG): with Round 5's streak payouts, mystery boxes and daily tips, a careful player lands around 3,700 to 3,950.
// Doubles Trouble is checked before Legend, so a shelf that is mostly second copies can't buy its way to Legend.
NP.ENDINGS = [
  { id: 'browsing', name: 'Just Browsing, All Season', test: function (e) { return e.items < 5; },
    text: 'Twelve Saturdays. You drove to every yard sale in Sundown Flats and bought almost nothing. The sellers think you are a ghost. You might be.' },
  { id: 'doubles', name: 'Doubles Trouble', test: function (e) { return e.dupes >= 15 && e.dupes >= e.items * 0.45; },
    text: 'You own most of these twice. A few of them three times. The note on the fridge said DO NOT BUY ANOTHER COPY. The note was right.' },
  { id: 'legend', name: 'Legend of the Swap Meet', test: function (e) { return e.score >= 3900; },
    text: 'People nod when you walk into the swap meet. Dex has your picture taped up in his van, with a circle around it. The shelf is not full. It never will be. May your shelf never be full.' },
  { id: 'savings', name: 'The Savings Account Collection', test: function (e) { return e.cash >= 700 && e.items < 20; },
    text: 'You saved almost every paycheck. Your bank sent you a card. Your shelf did not send you anything. It is mostly empty.' },
  { id: 'media', name: 'The Shelf Is a Record Store Now', test: function (e) { return e.media >= 30 && e.media > e.games * 1.25; },
    text: 'Somewhere along the way the game shelf turned into a record store. There are crates on the floor and a listening station in the hallway. Your partner calls it "the shop" now. Not in a nice way.' },
  { id: 'merch', name: 'Fully Merchandised', test: function (e) { return e.merch >= 6; },
    text: 'Your shelf is mostly Nostalgia Pro merch. The gift shop sent you a fruit basket. The fruit basket was also merch.' },
  { id: 'ramen', name: 'Ramen Season', test: function (e) { return e.cash < 15; },
    text: 'You spent every paycheck down to the coins. The shelf looks great. The fridge has one ramen in it and a note that says DO NOT BUY ANOTHER COPY.' },
  { id: 'respectable', name: 'A Respectable Shelf', test: function (e) { return e.score >= 2200; },
    text: 'Not legendary. Not embarrassing. The kind of shelf a guest looks at and says "oh, nice." You will hear "oh, nice" in your sleep. It is enough. It is never enough.' },
  { id: 'decent', name: 'A Decent Little Shelf', test: function () { return true; },
    text: 'A decent little shelf. Some gems, some football, one thing you cannot explain. Next season, maybe. The shelf can wait. The shelf cannot wait.' }
];

// ---------- catchphrases ----------
NP.CATCH = {
  shelf: 'May your shelf never be full.',
  blow: 'Blow on it. It helps.',
  question: 'Is it on the shelf?'
};
// "Blow on it" moments, on a loose cartridge you Inspect (one per Saturday at most)
NP.BLOW = [
  'It will not start. You blow on it. It helps.',
  'Black screen. You blow on it, then blow on it again for luck. It helps.',
  'The label is peeling and it smells like a garage. You blow on it. It helps. It always helps.'
];
NP.BLOW_DISC = 'It skips. You blow on it. It does not help. It never helps a disc. You did it anyway.';

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
  { h: 'AD-LESS EDITION ACTIVE', s: 'You are now enjoying zero ads.', f: 'Brought to you by Nostalgia Pro: The Ad-Less Edition.' },
  { h: 'TIRED OF ADS?', s: 'Upgrade to the Ad-Less Edition.', f: 'You already have it. Upgrade again.' },
  { h: 'AD-LESS EDITION: GOLD', s: 'Twice the ad-less. Same ads.', f: 'This message is ad-less.' }
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
  'You are using the Ad-Less Edition',
  'Enjoy the Ad-Less Edition, now ad-less',
  'Ad-Less Edition: Gold, coming soon',
  'This banner is not an ad. It is an Ad-Less Edition reminder.'
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
  'Have you heard about the Ad-Less Edition? No ads. Like this one.',
  'I would pitch you merch, but you have the Ad-Less Edition. Nice.'
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
    'BILLBOARD: This billboard is part of the Ad-Less Edition. It advertises nothing. Beautifully.',
    'BILLBOARD: You are driving past an ad-less billboard. You are welcome.'
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
NP.GOALS = function (m, budget) {
  var noon = m === true || m === 'noon';
  return [
    budget ? '$' + budget + ' to spend.' : noon ? '$100 budget.' : '$250 budget.',
    noon ? 'Back by noon.' : 'Home by sundown (5:30).',
    "Buy what's worth it.",
    "Don't buy what you already own.",
    'Watch out for fakes.',
    'Beat Dex to the good stuff.'
  ];
};
// One-time tips. Each shows once, ever, and costs no daylight. "short" is the How to play version.
NP.TIPS = {
  // Demo round 5 first-use tips (short on purpose)
  counter: { h: 'They met you partway', b: 'A seller who says no will often name a price. Tap Deal to take it. It always works.' },
  stallmap: { h: 'The stall map', b: 'Tap MAP to see every table. Tap one and you walk straight there.' },
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

// =====================================================================================================
// Round 3b: new stores, true stories and collector moments
// =====================================================================================================

// ---------- music and movies (a small first set; the record store, the rental stores and Lonnie's crate sell these) ----------
// kind: music or movie. fmt: vinyl, cd, tape, vhs, dvd. by: the artist, or the star. tag works like a game's rarity tag.
NP.FORMATS = { vinyl: 'Vinyl', cd: 'CD', tape: 'Cassette', vhs: 'VHS', dvd: 'DVD' };
NP.MEDIA = [
  { id: 'mu1', kind: 'music', fmt: 'vinyl', t: 'Mostly Fine', by: 'The Lukewarm Tuesdays', tier: 1, base: 6, tag: 'common',
    d: 'Twelve songs about feeling okay. The single, "It Could Be Worse," was on the radio for one whole week.', b: 'RECORDED IN A GARAGE. MIXED IN A DIFFERENT GARAGE.' },
  { id: 'mu2', kind: 'music', fmt: 'vinyl', t: 'Songs for Parking Lots', by: 'Gravel Choir', tier: 2, base: 18, tag: 'cult',
    d: 'Moody guitar songs written in the parking lot of a closed-down mall. Their fans are very serious about it and will not shut up about the B-sides.', b: 'PLAY LOUD. PLAY ALONE. PLAY IN A HATCHBACK.' },
  { id: 'mu3', kind: 'music', fmt: 'cd', t: 'Low, Medium, High', by: 'DJ Ceiling Fan', tier: 1, base: 3, tag: 'shovel',
    d: 'Three settings. Three tracks. Track 3 is just track 1 faster.', b: 'NOW WITH A PULL CHAIN.' },
  { id: 'mu4', kind: 'music', fmt: 'cd', t: 'Please Hold', by: 'Dial-Up Romance', tier: 2, base: 14, tag: 'gem',
    d: 'Love songs about waiting for the internet to connect. The ballad is eleven minutes long and most of it is the connecting noise.', b: 'YOUR CALL IS IMPORTANT TO US.' },
  { id: 'mu5', kind: 'music', fmt: 'tape', t: 'Hair Gel Forever', by: 'Five Matching Jackets', tier: 1, base: 4, tag: 'common',
    d: 'Five guys, five matching jackets, one key change per song. Every song is called "Girl" with a different second word.', b: 'INCLUDES A FOLD-OUT POSTER OF THE JACKETS.' },
  { id: 'mu6', kind: 'music', fmt: 'tape', t: 'Flannel Season', by: 'Grunge Uncle', tier: 2, base: 12, tag: 'uncommon',
    d: 'Everyone has an uncle who was in a band. This is the band. The whole album is in the same sad key, on purpose.', b: 'RECORDED IN ONE TAKE. THE UNCLE WAS TIRED.' },
  { id: 'mu7', kind: 'music', fmt: 'vinyl', t: 'Laser Feelings', by: 'Synth Lord Kevin', tier: 3, base: 40, tag: 'rare',
    d: 'One man, nine keyboards, and a lot of emotions about the year 2000. He pressed 300 copies and gave 250 of them to his mom.', b: 'THE FUTURE IS NOW. IT IS ALSO PURPLE.' },
  { id: 'mu8', kind: 'music', fmt: 'cd', t: 'My Truck Has Feelings', by: 'Dusty Tailgate', tier: 1, base: 4, tag: 'common',
    d: 'Country songs from the point of view of a pickup truck. The truck is going through a lot.', b: 'BONUS TRACK: THE TRUCK REMIX.' },
  { id: 'mu9', kind: 'music', fmt: 'vinyl', t: 'Hotel Lobby Nights', by: 'Sax by Starlight Orchestra', tier: 2, base: 15, tag: 'gem',
    d: 'Smooth saxophone for elevators, waiting rooms and the part of a party where everybody leaves.', b: 'SMOOTH. SMOOTHER. SMOOTHEST.' },
  { id: 'mu10', kind: 'music', fmt: 'tape', t: 'Gas Station Mixtape Vol. 9', by: 'Various Artists (Mostly Unknown)', tier: 1, base: 2, tag: 'shovel',
    d: 'Found next to the beef jerky at a gas station. Nobody knows who made it. Volumes 1 to 8 have never been seen.', b: 'FOR THE ROAD. ANY ROAD.' },
  { id: 'mu11', kind: 'music', fmt: 'cd', t: 'Teased to the Max', by: 'Spandex Thunder', tier: 2, base: 11, tag: 'uncommon',
    d: 'Big hair, bigger choruses. The drummer had to be cut out of the album photo because the hair blocked the camera.', b: 'TURN IT UP. THEN TURN IT UP MORE.' },
  { id: 'mu12', kind: 'music', fmt: 'vinyl', t: 'Did You Get It?', by: 'The Fax Machines', tier: 3, base: 35, tag: 'cult',
    d: 'Art rock about office supplies. The cover is a fax of the cover. The second pressing came out blank.', b: 'PLEASE CONFIRM RECEIPT.' },
  { id: 'mv1', kind: 'movie', fmt: 'vhs', t: 'Asteroid Dentist', by: 'Chet Brickwall', tier: 1, base: 4, tag: 'common',
    d: 'A dentist is the only man who can drill into an asteroid before it hits the earth. Chet Brickwall does all his own flossing.', b: 'THIS SUMMER, OPEN WIDE.' },
  { id: 'mv2', kind: 'movie', fmt: 'vhs', t: 'Asteroid Dentist 2: Root Canal Fury', by: 'Chet Brickwall', tier: 2, base: 10, tag: 'cult',
    d: 'The asteroid is back, and this time it has a cavity. Somehow worse than the first one, and better.', b: 'HE IS BACK. AND HE IS NUMB.' },
  { id: 'mv3', kind: 'movie', fmt: 'dvd', t: 'Bulldozer Diplomacy', by: 'Chet Brickwall', tier: 1, base: 3, tag: 'shovel',
    d: 'Chet Brickwall plays an ambassador who solves every problem with a bulldozer. Every single problem.', b: 'TALKS ARE OVER.' },
  { id: 'mv4', kind: 'movie', fmt: 'vhs', t: 'Night of the Recliner', by: 'Nobody You Know', tier: 2, base: 14, tag: 'cult',
    d: 'A family buys a used recliner. The recliner has other plans. Banned in two counties for being too comfortable.', b: 'SIT DOWN. FOREVER.' },
  { id: 'mv5', kind: 'movie', fmt: 'dvd', t: 'Love at First Fax', by: 'Two Very Nice Actors', tier: 1, base: 3, tag: 'common',
    d: 'Two coworkers fall in love over a fax machine. The fax machine is the best actor in it.', b: 'SHE HAD HIS NUMBER. HIS FAX NUMBER.' },
  { id: 'mv6', kind: 'movie', fmt: 'vhs', t: 'Hall Monitor Uprising', by: 'A Cast of Twenty-Somethings', tier: 1, base: 4, tag: 'common',
    d: 'Teen comedy. Every high school student is played by a 31-year-old. The hall monitors take over the school.', b: 'DO YOU HAVE A PASS?' },
  { id: 'mv7', kind: 'movie', fmt: 'vhs', t: 'Talking Minivan Goes to Camp', by: 'A Minivan', tier: 2, base: 9, tag: 'gem',
    d: 'A family movie about a minivan that talks and also goes to summer camp. It is weirdly moving. Grown men have cried at the canoe scene.', b: 'BUCKLE UP FOR FUN.' },
  { id: 'mv8', kind: 'movie', fmt: 'dvd', t: 'Moon Ferret: The Live Action Movie', by: 'A Man in a Ferret Suit', tier: 1, base: 2, tag: 'shovel',
    d: 'Based on the game. Nobody asked. The moon is a painted bedsheet and you can see the ferret suit zipper in every shot.', b: 'THE GAME WAS BETTER. THE GAME WAS ALSO NOT GREAT.' },
  { id: 'mv9', kind: 'movie', fmt: 'vhs', t: 'Roundhouse Retiree', by: 'Chet Brickwall', tier: 3, base: 30, tag: 'rare',
    d: 'Chet Brickwall plays a retired karate teacher who just wants to play shuffleboard. Pulled from shelves the week it came out. Nobody remembers why.', b: 'HE WAS DONE. THEN SOMEBODY TOOK HIS SPOT.' },
  { id: 'mv10', kind: 'movie', fmt: 'dvd', t: 'Chet Brickwall Is The Lifeguard', by: 'Chet Brickwall', tier: 2, base: 8, tag: 'uncommon',
    d: 'The pool is closed for the whole movie. He guards it anyway.', b: 'NO RUNNING. NO MERCY.' }
];

// ---------- the true stories ----------
// Every true-story event in the game shows a small BASED ON A TRUE STORY tag. They are plain data, so more can be added later
// (follower-submitted stories too) without touching the game code.
//
// pool: 'service' rotates through the game stores (bad customer service), 'moment' mixes into the other stops.
// where: the stop types it can happen at. trueStory: shows the tag.
// coded: true means the game has special code for it (the text still lives here). Leave it out for a new story.
//
// A plain story (no coded) works like this:
//   text: what happens. gate: 'block' (you cannot buy until a choice with unblock: true) or 'hide' (the items stay hidden until then).
//   choices: [{ label, min (minutes), cash (dollars), line (what happens), lines (a new line each time, for repeat),
//               unblock, repeat (can pick it again), priceMult (changes every price here) }]
NP.TRUE_TAG = 'BASED ON A TRUE STORY';
NP.STORIES = {
  // ----- the mall game store -----
  uturn: { trueStory: true, coded: true, title: 'The overpriced trilogy',
    text: 'The wall behind the counter has three loose discs. No cases. No art. SPACE VISOR SOLDIER 3. SPACE VISOR SOLDIER: THE ONE BEFORE. SPACE VISOR SOLDIER: THE ONE AFTER. Sixty dollars each.',
    tagLine: 'USED · LIKE NEW (IT IS NOT)',
    after: 'You stop. You look at the wall for one second. You turn all the way around and walk straight back out. You do not say a word. Neither does anyone else.',
    clerk: 'Prices are firm. Like my handshake. Which you will not be getting.' },
  glasscase: { trueStory: true, coded: true, title: 'The $5,000 sealed copy',
    game: 'Ledge Lemur 2: Not Like the First One', price: 5000, tags: ['SEALED!!!', 'ONLY 3 MILLION MADE'],
    text: 'In the glass case, on a little velvet stand, under its own light: a sealed copy of Ledge Lemur 2: Not Like the First One. Everybody you know owned this game. Your cousin had two.',
    ask: 'Why is it five thousand dollars?', why: "Because it's sealed.",
    reply: "It's not rare, sealed or not.", why2: "It's sealed though.",
    laugh: 'You laugh. A short, little laugh. You cannot help it.',
    walk: 'You laugh and walk away. Best decision you made all day.',
    buy: 'You check your wallet. You have {cash}. The clerk offers a layaway plan. The first payment is $4,000.' },
  // ----- bad customer service (rotates through the game stores) -----
  phone: { trueStory: true, pool: 'service', where: ['mall', 'record', 'rental'], title: 'The clerk is on his phone', gate: 'block',
    text: 'The clerk is on his phone. He has been on his phone since the store opened. The service bell is taped down.',
    choices: [
      { label: 'Ring the bell (1 min)', min: 1, repeat: true, lines: ['Thunk. It is taped down.', 'Thunk. Still taped down.', 'Thunk. He scrolls.', 'Thunk. He turns the volume up.'] },
      { label: 'Wait until he looks up (10 min)', min: 10, unblock: true, line: 'Ten minutes later he looks up. "Oh. Can I help you?" He sounds surprised that you are a customer.' }
    ] },
  pricecheck: { trueStory: true, pool: 'service', coded: true, where: ['mall', 'record', 'rental'], title: "We don't do price checks",
    text: 'There are no prices on anything. "We don\'t do price checks." You can ask anyway. It costs you.',
    button: 'Price check? (2 min)', line: '"We don\'t do price checks." He looks at it. "It\'s {$} now."' },
  trivia1: { trueStory: true, pool: 'service', where: ['mall', 'record'], title: 'The gatekeeper', gate: 'block',
    text: 'The clerk crosses his arms. "Before I sell you anything. What kind of media does the Lumen Disc use?"',
    choices: [
      { label: 'Discs', min: 3, unblock: true, line: '"...Fine. You can shop." He seems disappointed.' },
      { label: 'Cartridges', min: 3, unblock: true, priceMult: 1.2, line: '"Wrong. Poser tax. Everything is 20% more for you."' },
      { label: 'It is a vacuum', min: 3, unblock: true, priceMult: 1.2, line: '"It is NOT a vacuum. Poser tax. 20% more."' }
    ] },
  trivia2: { trueStory: true, pool: 'service', where: ['mall', 'record'], title: 'The gatekeeper', gate: 'block',
    text: 'The clerk does not let go of the game. "Real fans only. Which one is the handheld?"',
    choices: [
      { label: 'The Lunchbox LX', min: 3, unblock: true, line: '"Huh. Okay. You know a little." He lets go of the game.' },
      { label: 'The Kestrel 16', min: 3, unblock: true, priceMult: 1.2, line: '"You can not hold a Kestrel 16 in your hand. Poser tax. 20% more."' },
      { label: 'The one with the batteries', min: 3, unblock: true, priceMult: 1.2, line: '"They all have batteries. Some of them. Poser tax. 20% more."' }
    ] },
  trivia3: { trueStory: true, pool: 'service', where: ['mall', 'record'], title: 'The gatekeeper', gate: 'block',
    text: '"Quick question before you touch anything. Which one is the 8-bit?"',
    choices: [
      { label: 'The Ferroset 8', min: 3, unblock: true, line: '"It is in the name. Anybody could have got that. Fine. Shop."' },
      { label: 'The Marigold 32', min: 3, unblock: true, priceMult: 1.2, line: '"Thirty two. Is not. Eight. Poser tax. 20% more."' },
      { label: 'Is this a quiz?', min: 3, unblock: true, priceMult: 1.2, line: '"It was. You failed it. Poser tax. 20% more."' }
    ] },
  tradein: { trueStory: true, pool: 'service', coded: true, where: ['mall'], title: 'The trade-in',
    text: 'The sign says WE BUY GAMES. The sign is technically true.',
    offer: '"I can give you $2 for it."', shelf: 'He puts it in the glass case while you are still standing there. The new sticker says $45.' },
  backin5: { trueStory: true, pool: 'service', where: ['mall', 'record', 'rental'], title: 'Back in 5 minutes', gate: 'block',
    text: 'A sign on the counter says BACK IN 5 MINUTES. The sign is sun-bleached. The tape on it is yellow. The lights are on.',
    choices: [
      { label: 'Wait 5 minutes', min: 5, repeat: true, lines: ['Five minutes go by. Nobody comes back.', 'Ten minutes. Nobody. A fly lands on the sign.', 'Fifteen minutes. You notice the sign has a date on it. It is from 2009.', 'You have now waited longer than the sign has ever promised anybody. Nobody is coming back.'] }
    ] },
  wall: { trueStory: true, pool: 'service', where: ['mall', 'rental'], title: 'Do you have this one?', gate: 'hide',
    text: '"Do you have any Kestrel 16 games?" He points vaguely at a wall of about 3,000 unsorted games. "Probably."',
    choices: [
      { label: 'Search the wall yourself (20 min)', min: 20, unblock: true, line: 'Twenty minutes and a lot of sports games later, you find a few worth looking at.' }
    ] },
  review: { trueStory: true, pool: 'service', where: ['mall', 'record', 'rental'], title: 'Leave a review',
    text: 'A tablet on the counter says HOW DID WE DO? It has a Leave a review button. There is one star. Only one.',
    choices: [
      { label: '★ (the only option) (1 min)', min: 1, line: 'Review posted. One star. The tablet says THANK YOU FOR YOUR FEEDBACK and then turns itself off.' }
    ] },
  // ----- the Banned List store -----
  banned: { trueStory: true, coded: true, title: 'Ignored at the counter',
    text: 'You walk up to the counter at Staff Only Games. Two employees are behind it. They walk right past you.',
    waits: [
      'One of them walks past you carrying a box. He does not look at you.',
      'The other one walks past you the other way. He makes eye contact. He keeps walking.',
      'They both walk past at the same time, talking about lunch. They are getting tacos.',
      'One of them says "be right with you" to someone on the phone. Nobody is on the phone.',
      'They are restocking a shelf you are standing in front of. They restock around you.'
    ],
    excuse: ['"Excuse me?" Nothing.', '"Excuse me?" One of them puts in earbuds.', '"Hello?" A second set of earbuds goes in.'],
    corner: 'The 16-bit games are in a corner behind the counter. Too far away to read.',
    blur: 'You squint. They are all a blur. You would need binoculars.',
    sharp: 'With the binoculars, you can read every title from here. You still cannot buy any of them. Nobody is coming.',
    reviews: ['Two employees, zero help. One star is generous.', 'I stood at the counter long enough to grow a beard.', 'Great selection, as far as I could tell from across the room.'],
    out: 'Not in this lifetime.', bannedLabel: 'BANNED (BY YOU)' },
  // ----- the Friendly Store -----
  pal: { trueStory: true, coded: true, title: 'The Friendly Store',
    text: 'Lonnie loves to talk. Talking is optional and fun. The clock does not care either way.' },
  // ----- real collector moments (mixed into the other stops) -----
  atm: { trueStory: true, pool: 'moment', where: ['yard', 'thrift'], title: 'Cash only', gate: 'block',
    text: 'A sign taped to the table: CASH ONLY. EXACT CHANGE. NOBODY HERE CAN BREAK A TWENTY. All you have is twenties.',
    choices: [
      { label: 'Run to the ATM (15 min, $3 fee)', min: 15, cash: 3, unblock: true, line: 'The nearest ATM is inside a gas station that also sells bait. Fifteen minutes and a $3 fee later, you have small bills.' }
    ] },
  lookedup: { trueStory: true, pool: 'moment', coded: true, where: ['yard', 'thrift', 'pawn'], title: 'They looked it up online',
    line: '"I looked it up online. One went for {$} on ClickAndRegret." (That was somebody\'s asking price. Nobody paid it.)' },
  kids: { trueStory: true, pool: 'moment', coded: true, where: ['yard'], title: 'Not for sale',
    line: '"Oh, those are my kid\'s. Not for sale." It is on the table. With a price sticker on it.',
    stamp: "MY KID'S. NOT FOR SALE." },
  box40: { trueStory: true, pool: 'moment', coded: true, where: ['sports', 'yard', 'thrift'], title: 'A box of 40 sports games',
    item: 'Box of 40 Sports Games', line: '"Forty games. Sixty bucks. That\'s a deal." It is forty copies of the same four games.' },
  bundle: { trueStory: true, pool: 'moment', coded: true, where: ['yard', 'thrift', 'record', 'rental'], title: 'Make me an offer on the whole box',
    line: '"Make me an offer on the whole box. Everything. I just want it gone."' },
  comeback: { trueStory: true, pool: 'moment', coded: true, where: ['yard', 'thrift'], title: "I'll come back for it",
    button: "I'll come back for it (walk a lap, 10 min)", gone: 'You walk a lap and come back. It is gone. A guy in a fishing vest is walking to his car with it.', stamp: 'SOMEBODY CAME BACK FIRST' },
  sticker: { trueStory: true, pool: 'moment', coded: true, where: ['yard', 'thrift', 'pawn', 'record'], title: 'Sticker residue',
    line: 'Old price sticker goo all over it. Worth 30% less until you clean it off at home.' },
  reseller: { trueStory: true, pool: 'moment', coded: true, where: ['yard', 'thrift'], title: 'The whole table',
    line: 'A guy with a folding wagon walks up, points at the table and says "All of it." He pays cash and loads everything you did not already have in your hands. He leaves one thing. It is a sports game.',
    stamp: 'THE GUY WITH THE WAGON GOT IT' },
  partner: { trueStory: true, pool: 'moment', coded: true, title: 'Where are you going to put it?',
    text: 'Your phone buzzes. It is your partner. "Hey. Quick question. Where are you going to put it?"',
    answers: [['On the shelf.', '"Which shelf?" You do not have an answer for that.'], ["There's room.", '"There is not room." There is not room.'], ["I'll make room.", '"Make room where?" Fair question. You hang up and look at what you just bought.']] }
};

// Lonnie at the Friendly Store. Each chat topic costs time, and he always has one more thing.
// reward: disc (a little off everything here today), tip (where a good find is today), hold (he set something aside for you)
NP.PAL = {
  clerk: 'Lonnie',
  hiMax: "Hey, it's you!",
  perk: 'Regulars get 10% off and first look at the new arrivals.',
  leave: 'May your shelf never be full.',
  leaveReply: 'Lonnie: "Hey. That\'s my line. Drive safe."',
  lostCard: 'You cannot find your punch card. You check every pocket twice. It was in the cup holder the whole time. Five minutes, gone.',
  topics: [
    { id: 'grail', label: 'The one that got away', min: 8, reward: 'disc',
      a: 'In 1997 he almost bought a sealed Brunch Crusade at a church sale for $4. He went to get cash. When he came back, a lady had put it in her purse. He still thinks about her purse.',
      more: 'Oh, one more thing. He knows her name now. He will not say it. It is better that way.' },
    { id: 'addon', label: 'His theory about the Kestrel 16', min: 7, reward: 'tip',
      a: 'He thinks the Kestrel 16 had a secret add-on that plugged into the bottom and made it a toaster. He has no proof. He has a lot of feelings.',
      more: 'Oh, one more thing. He heard about a good find in town today. He tells you where.' },
    { id: 'store', label: 'How he started the store', min: 10, reward: 'hold',
      a: 'He started the store with one shelf, one folding chair and his own collection. He sold the folding chair first. He still regrets the folding chair.',
      more: 'Oh, one more thing. He set something aside for you behind the counter.' },
    { id: 'dex', label: 'What he thinks about Dex', min: 5, reward: 'disc',
      a: '"Dex? Good kid. Terrible kid. He bought my whole football box once and then sold it back to me. For more. I paid it. I do not know why I paid it."',
      more: 'Oh, one more thing. He knocks a little off your stuff today. For listening.' },
    { id: 'manuals', label: 'Why he keeps the manuals in a binder', min: 6, reward: 'hold',
      a: 'Every manual in the store is in a three-ring binder, in plastic sleeves, by year. He color coded the tabs. He has a second binder for the tabs.',
      more: 'Oh, one more thing. He found one you would like. It is behind the counter now.' },
    { id: 'garage', label: 'The garage sale in a tent', min: 9, reward: 'tip',
      a: 'There was a garage sale in 2003 where a man sold games out of a camping tent. You had to crawl in. Lonnie crawled in. He came out with eleven games and a cold.',
      more: 'Oh, one more thing. Speaking of sales, he heard where the good stuff is today.' },
    { id: 'cart', label: 'His cartridge cleaning method', min: 7, reward: 'disc',
      a: 'Cotton swabs, rubbing alcohol, a pencil eraser and one very specific song playing in the background. He will not tell you the song.',
      more: 'Oh, one more thing. He takes a little off for you. Cleaning is on the house. The song is not.' },
    { id: 'shelf', label: 'How many shelves he has at home', min: 5, reward: 'tip',
      a: '"How many shelves? Define shelf." It is eleven. And a dresser. And the oven.',
      more: 'Oh, one more thing. He heard about something good out there today. He tells you before he can stop himself.' }
  ]
};

// the record store
NP.RECORD = {
  listen: ['You put on the headphones. They are warm. Side A is better than it has any right to be.', 'The listening station plays the first song for ten minutes. It is a four minute song.', 'You listen to a whole side. The clerk watches you the entire time. You feel judged and also kind of cool.'],
  picksSnob: ['Staff pick: "If you do not get it, that is fine. That is the point."', 'Staff pick: "Better before they got popular. They never got popular."', 'Staff pick: "Only the first pressing. Do not talk to me about the second pressing."'],
  picksChill: ['Staff pick: "Put it on, open a window, do nothing for an hour."', 'Staff pick: "My dad played this every Sunday. Now I do. Full circle, man."', 'Staff pick: "Side B. Trust me."'],
  bin: 'The $1 bargain bin'
};

// the two video rental stores, across the street from each other, both closing
NP.RENTAL = {
  lateFee: 'You still owe a late fee. $4.99. From 2003. For a tape you returned. "The system says you have to pay it before you can buy anything." They do not have pennies anymore, so it is $5.',
  lateFeeBtn: 'Pay the late fee ($5)',
  lateFeePaid: 'Paid. The computer prints a receipt that says THANK YOU FOR BEING A VALUED MEMBER. Twenty years of interest, forgiven.',
  candy: 'Leftover movie candy at the register: Gummy Somethings. Best by a year nobody can read.',
  candyBtn: 'Buy the movie candy ($1)',
  candyLine: 'You eat one. It is chewy in a way that candy should not be. You eat another one.',
  newReleases: 'NEW RELEASES',
  newNote: 'In the New Releases section. It came out in {y}.',
  standee: { id: 'chet', t: 'Life-Size Cardboard Chet Brickwall', ask: 25,
    d: 'A cardboard Chet Brickwall from Asteroid Dentist. He is pointing a dental drill at you. He is very tall. He is slightly bent at the knee from years by the door.' },
  clam: 'Ex-rental, in a giant clamshell case. The rental sticker will never come off.',
  across: 'across the street'
};

// odds and ends for the new stores
NP.GEAR = {
  binoc: { id: 'binoc', t: 'Binoculars (Slightly Foggy)', ask: 3,
    d: 'Bird watching binoculars. One side is foggy. Good for reading price stickers from across a room.' }
};
NP.BULK = { d: 'Forty sports games in a box that used to hold printer paper. It is mostly the same four football games, ten times each.' };
NP.GLASSCASE_TITLE = 'Laughed at the Glass Case';

// tags and colors for the new kinds of things
NP.TAGS.music = 'Music'; NP.TAGS.movie = 'Movie'; NP.TAGS.gear = 'Not a Game'; NP.TAGS.standee = 'Cardboard Legend'; NP.TAGS.bulk = 'Worth $40';
NP.TAG_COLORS.gear = ['#5d6370', '#fff1d6']; NP.TAG_COLORS.standee = ['#ff9f43', '#0b1022']; NP.TAG_COLORS.bulk = ['#2d6a2d', '#fff1d6'];
NP.TAG_SHORT.gear = 'Gear'; NP.TAG_SHORT.standee = 'Chet'; NP.TAG_SHORT.bulk = '$40';

// =====================================================================================================
// Round 3c: the Desert Pixel Expo (Saturday 12 of a season, Home by sundown only; now and then in Endless)
// =====================================================================================================
// Doors at 3 PM, closes at 5:30 PM, $15 to get in. Six booths, about ten nerds racing you to the exclusives,
// every rival in town, and a prototype hidden somewhere in the hall. Anything you buy here counts double.
// art: which game picture an exclusive borrows (icons.js). kind: game, music, movie or photo.
NP.EXPO = {
  name: 'Desert Pixel Expo',
  hall: 'Sundown Flats Convention Hall B',
  fee: 15, doors: 15 * 60, cost: 62,
  blurb: 'The last stop of the season. Doors at 3 PM, $15 to get in. Anything you buy here counts double.',
  line: 'You wait outside with four hundred people in lanyards. 3 PM. The doors open. Everyone runs.',
  lineLate: 'You walk in late. The nerds are already running.',
  broke: 'You do not have the $15. The guy at the door looks at you, looks at your shirt, and waves you in. "Go. Just go."',
  double: 'Convention find: counts double.',
  booths: {
    dealerA: { name: 'Booth 14: Mint-ish Collectibles', short: 'MINT-ISH', seller: 'expoA',
      text: 'Everything is in a little plastic case. Some of the cases have games in them.' },
    dealerB: { name: 'Booth 22: A Guy and Seven Bins', short: 'SEVEN BINS', seller: 'expoB',
      text: 'Seven milk crates of loose games and one folding chair. The guy is eating a sandwich. He is in no hurry.' },
    exclusive: { name: 'Expo Exclusives (Line Starts Here)', short: 'EXCLUSIVES', seller: 'expoEx',
      text: 'Official convention exclusives. Numbered, limited, and priced like it. Prices are printed on the tags. No haggling.' },
    grading: { name: 'Slab-O-Matic Grading', short: 'GRADING',
      text: 'Hand them a game from your bag and $10. They look at it under a lamp for fifteen minutes and put a number on it.' },
    homebrew: { name: 'Basement Byte Homebrew', short: 'HOMEBREW', seller: 'expoHb',
      text: 'Brand new games for old consoles, made by people in their basements. The guy running it made all of them. He will tell you about every one.' },
    autograph: { name: 'Autograph Line: Chet Brickwall', short: 'AUTOGRAPHS',
      text: 'Chet Brickwall, star of Asteroid Dentist, is signing. The line goes around a pillar twice. He is wearing sunglasses indoors.' }
  },
  // the convention exclusives (12). where: which booth sells it.
  exclusives: [
    { id: 'x1', where: 'exclusive', art: 'mf1', p: 'k16', kind: 'game', cond: 'cib', t: 'Moon Ferret: Glow-in-the-Dark Expo Cart', base: 30, ask: 75, tier: 3, tag: 'rare',
      d: 'The original Moon Ferret on a cartridge that glows in the dark. The glow is the only new feature. It is a very good glow.' },
    { id: 'x2', where: 'exclusive', art: 'sky', p: 'k16', kind: 'game', cond: 'sealed', t: 'Sky Llama Air Patrol: Chrome Cart (1 of 500)', base: 30, ask: 95, tier: 3, tag: 'rare',
      d: 'Numbered chrome cartridge, sealed in a box that is also chrome. Number 1 went to the llama.' },
    { id: 'x3', where: 'exclusive', art: 'tcr', p: 'k16', kind: 'game', cond: 'cib', t: 'Turbo Cactus Rally Turbo: Expo Misprint', base: 25, ask: 45, tier: 2, tag: 'cult',
      d: 'The box says TURBO five times instead of four. Collectors call it the Turbo Turbo. They pay extra for the fifth turbo.' },
    { id: 'x4', where: 'exclusive', art: 'wiz', p: 'fer', kind: 'game', cond: 'sealed', t: 'Wizard Accountant: Tax Season Collector\'s Box', base: 22, ask: 70, tier: 3, tag: 'gem',
      d: 'Comes with a cloth map of the tax code, a pewter calculator and a receipt that is somehow also sealed.' },
    { id: 'x5', where: 'exclusive', art: 'vpk', p: 'hal', kind: 'game', cond: 'sealed', t: 'Vapor Knight: Sunset Variant Cover', base: 22, ask: 55, tier: 2, tag: 'uncommon',
      d: 'Same disc, same six hours of walking, but the cover sunset is a little more orange. Limited to however many they printed.' },
    { id: 'x6', where: 'exclusive', art: 'mu7', kind: 'music', fmt: 'vinyl', by: 'Synth Lord Kevin', t: 'Laser Feelings: Expo Picture Disc', base: 45, ask: 60, tier: 3, tag: 'rare',
      d: 'The whole album on a see-through record with a picture of Kevin on it. Kevin is pointing at you. Kevin signed it with a laser.' },
    { id: 'x7', where: 'homebrew', p: 'k16', kind: 'game', cond: 'cib', t: 'Cul-de-Sac Grand Prix 2: Built in a Basement', base: 20, ask: 30, tier: 2, tag: 'gem',
      d: 'Racing around one cul-de-sac. Made by one guy over eleven years. It is honestly great. He will not stop smiling.' },
    { id: 'x8', where: 'homebrew', p: 'fer', kind: 'game', cond: 'cib', t: 'The Last Cartridge: A Homebrew Story', base: 22, ask: 35, tier: 2, tag: 'gem',
      d: 'A brand new game for a 30 year old console about a guy who makes a brand new game for a 30 year old console. It gets very personal.' },
    { id: 'x9', where: 'homebrew', p: 'k16', kind: 'game', cond: 'cib', t: "Sundown Flats Simulator '26", base: 16, ask: 25, tier: 2, tag: 'cult',
      d: 'Drive around a small desert town buying old games before noon. It seems a little familiar. You do not want to think about it.' },
    { id: 'x10', where: 'dealerA', art: 'hmp', p: 'lum', kind: 'game', cond: 'loose', t: 'Haunted Mall Panic: Unlabeled Prototype Disc', base: 120, ask: 160, tier: 3, tag: 'rare',
      d: 'A burned test disc with HMP FINAL FINAL v3 written on it in marker. The food court level has a different ghost.' },
    { id: 'x11', where: 'dealerB', art: 'mv1', kind: 'movie', fmt: 'vhs', by: 'Chet Brickwall', t: "Asteroid Dentist: Director's Cut (Expo VHS)", base: 18, ask: 22, tier: 2, tag: 'cult',
      d: 'Four extra minutes of drilling. The director says this is the version he always wanted. The director is also Chet Brickwall.' },
    { id: 'x12', where: 'autograph', kind: 'photo', t: 'Signed Chet Brickwall 8x10 (Expo Exclusive)', base: 25, ask: 20, tier: 2, tag: 'photo',
      d: 'Signed "To my biggest fan, keep flossing. Chet." He did not ask your name. He wrote it before you got to the front.' }
  ],
  grail: { id: 'npx', t: 'Nostalgia Pro: The Game (Expo Prototype)', ask: 25,
    d: 'A prototype of the game you are playing, on a cartridge with a handwritten label. You probably should not think about this one either.' },
  // the Expo passport: a stamp at every booth you open. Three stamps and somebody tells you where the prototype is.
  passport: 'EXPO PASSPORT',
  clues: [
    'A man in a cape leans over: "I heard there is a prototype here. Somebody has it under their table."',
    'A kid with a lanyard full of pins: "The prototype is at {booth}. Do not tell anyone. I told everyone."'
  ],
  dexGrail: 'Dex walks out of {booth} holding something with a handwritten label. He waves it at you on his way to the door.',
  // the nerds who race you. Each one walks straight to the booth with the thing they want and buys it if they get there first.
  nerds: ['A man in a full knight costume', 'A dad with a lanyard full of pins', 'A guy carrying two slab cases like a briefcase', 'A teenager in a homemade Moon Ferret hoodie',
    'A woman with a rolling cart and a plan', 'A man in cargo shorts with eleven pockets', 'A kid who has clearly been here since 6 AM', 'A guy livestreaming his own walking',
    'A couple in matching llama shirts', 'A man who brought his own price guide (printed)'],
  nerdGot: '{who} got {t}.',
  nerdMiss: '{who} gets to the booth, sees it is gone, and stares at the empty spot for a long time.',
  grade: { cost: 10, min: 15,
    results: ['A 4. "Played. A lot. By a dog, maybe."', 'A 7. "Solid. Some shelf wear. The good kind."', 'A 9. "Beautiful. Somebody loved this and never touched it."', 'A 9.8. "We do not give these out. We gave you one. Tell no one."'] },
  sign: { min: 20, line: 'You wait in line for twenty minutes. Chet Brickwall signs it without looking up, and then looks up. "Great movie, right? Floss."' },
  steve: 'Slab Steve walks into the hall at 4 PM, straight to the exclusives booth, and buys every sealed thing on the table without opening his mouth.',
  rivals: 'Everybody is here for the finale: Dex, Brayden, Phone Guy Phil, Brody, Gary and Slab Steve.',
  // what each rival does at the Expo (shown under the hall, like at the swap meet)
  rules: {
    brayden: 'Look at something, then move on to something else, and Brayden buys the first one. Same as always. Bigger budget today.',
    phil: 'Wanders the hall. If he is within two steps of you when you open a booth, that booth goes up 25%.',
    brody: 'Filming the autograph line for 30 minutes. Nobody gets an autograph until he wraps.',
    gary: 'Gary already lowballed every dealer in the hall. Nobody is taking a lowball today.',
    steve: 'Every sealed game here is on hold for him. At 4 PM he walks in and buys every sealed exclusive still on the table.'
  }
};
NP.TAGS.photo = 'Signed'; NP.TAG_COLORS.photo = ['#ff77a8', '#0b1022']; NP.TAG_SHORT.photo = 'Signed';
// the Expo dealers (they sell and buy like anyone else)
NP.SELLERS.expoA = { name: 'Mint-ish Guy', ask: 1.5, minLo: 0.85, minHi: 1,
  hi: ['Everything here is mint. Ish. Mint-ish. It is on the sign.', 'Convention prices. You understand. You are at a convention.'],
  yes: ['Great buy. I will miss it. I will not miss it.', 'Sold. Want a bag? It is also mint-ish.'],
  no: ['Convention prices are convention prices.', 'I paid for this booth. You are paying for this booth too.'] };
NP.SELLERS.expoB = { name: 'Bin Guy', ask: 0.8, minLo: 0.55, minHi: 0.8,
  hi: ['Everything in the bins is priced. Some of it is priced correctly.', 'Dig in. Mind the sandwich.'],
  yes: ['Done. Good find. I did not know that was in there.', 'Sold. You want the sandwich too? Kidding. Unless.'],
  no: ['Little higher. Bins do not pay for themselves.'] };
NP.SELLERS.expoEx = { name: 'Exclusives Booth', ask: 1, minLo: 1, minHi: 1,
  hi: ['Exclusives are first come, first served. Mostly first come.'],
  yes: ['Here is your numbered receipt. It is also numbered.'],
  no: ['Prices are printed on the tag. The tag is also exclusive.'] };
NP.SELLERS.expoHb = { name: 'Homebrew Guy', ask: 1, minLo: 0.8, minHi: 0.95,
  hi: ['I made all of these. Every single one. Do you want to hear about the sound engine?', 'Eleven years. This one took eleven years. Ask me anything.'],
  yes: ['You just made my whole year. Not my day. My year.', 'Thank you. Play it on a real TV. Please.'],
  no: ['I could go a little lower. My mom says I should charge more, though.'] };
NP.BUYERS.expoA = { lo: 0.4, hi: 0.55, detect: true,
  open: ['{$}. Convention buying prices. You understand.'], up: ['{$}. Final. Ish.'], best: ['{$}. Mint-ish final.'],
  sold: ['Into a plastic case it goes.'], trade: ['{$} in booth credit. Spend it here before 5:30.'], bootleg: ['A bootleg. At a convention. {$}.'] };
NP.BUYERS.expoB = { lo: 0.55, hi: 0.7, media: true,
  open: ['{$}? Goes in bin four.', 'I can do {$}.'], up: ['Fine. {$}.'], best: ['{$}. That is the sandwich money.'],
  sold: ['Into the bins.'], trade: ['{$} in credit. Bins only.'], bootleg: ['Bootleg. {$} for the plastic.'] };

// =====================================================================================================
// Round 3c: small rewards. Fridge magnets (unlocked once, kept forever) and collector ranks (by finds shelved).
// =====================================================================================================
NP.MAGNETS = [
  { id: 'haggle', name: 'Haggler', how: 'Win a haggle.' },
  { id: 'streak3', name: 'Silver Tongue', how: 'Win three haggles in a row.' },
  { id: 'streak5', name: 'Sellers Talk About You', how: 'Win five haggles in a row.' },
  { id: 'sale', name: 'Side Hustle', how: 'Sell something from your bag.' },
  { id: 'flip', name: 'Flipper', how: 'Sell something for $15 more than you paid.' },
  { id: 'eagle', name: 'Eagle Eye', how: 'Spot a repro before you buy it.' },
  { id: 'blow', name: 'It Helps', how: 'Blow on a cartridge.' },
  { id: 'grail', name: 'Played Myself', how: 'Find the grail.' },
  { id: 'trilogy', name: 'Moon Ferret Completionist', how: 'Finish the Moon Ferret trilogy.' },
  { id: 'dupe', name: 'It Was On The Shelf', how: 'Bring home a game you already own.' },
  { id: 'merch', name: 'Fully Merchandised', how: 'Bring home three pieces of merch in one Saturday.' },
  { id: 'opened', name: 'Opened It', how: 'Open a sealed game and play it.' },
  { id: 'browse', name: 'Just Browsing', how: 'Come home with an empty bag.' },
  { id: 'coins', name: 'Down to Coins', how: 'Come home with less than $2.' },
  { id: 'big', name: 'Big Saturday', how: 'Score 300 or more in one Saturday.' },
  { id: 'laugh', name: 'Laughed at the Glass Case', how: 'Laugh at the $5,000 sealed copy.' },
  { id: 'banned', name: 'Banned (By You)', how: 'Walk out of Staff Only Games.' },
  { id: 'regular', name: "Lonnie's Regular", how: 'Max out your friendship with Lonnie.' },
  { id: 'punch', name: 'Punch Drunk', how: 'Cash in a full punch card.' },
  { id: 'latefee', name: 'Paid in Full', how: 'Pay a late fee from 2003.' },
  { id: 'standee', name: 'Cardboard Roommate', how: 'Bring home Chet Brickwall.' },
  { id: 'room', name: "There's Room", how: 'Answer the phone call.' },
  { id: 'expo', name: 'Con Survivor', how: 'Make it into the Desert Pixel Expo.' },
  { id: 'nerds', name: 'Beat the Nerds', how: 'Buy a convention exclusive at the Expo.' },
  { id: 'proto', name: 'Prototype', how: 'Find the Expo prototype.' },
  { id: 'nine8', name: 'Nine Point Eight', how: 'Get a 9.8 at the grading booth.' },
  { id: 'signed', name: 'Got It Signed', how: 'Get something signed by Chet Brickwall.' },
  { id: 'season', name: 'Twelve Saturdays', how: 'Finish a season.' }
];
NP.RANKS = [
  [0, 'Weekend Browser'], [10, 'Bin Diver'], [25, 'Shelf Starter'], [50, 'Swap Meet Regular'], [80, 'Certified Collector'],
  [120, 'Shelf Architect'], [175, 'Garage Legend'], [250, 'Legend of Sundown Flats']
];

// =====================================================================================================
// Round 3c: the replay pack (from playtesting: the long version got repetitive)
// Mini-goals, surprise events, combos and fever, and ultra-rare drops. Full game only, never the demo.
// =====================================================================================================
NP.GENRES = { platformer: 'platformer', racing: 'racing game', rpg: 'RPG', sports: 'sports game', puzzle: 'puzzle game', strategy: 'strategy game', shooter: 'shooter', action: 'action game' };

// Surprise events: short, quick, rewarding. One at most per stop, and not every stop.
NP.EVENTS = [
  { id: 'blow', label: 'It will not start', text: 'The seller plugs a cartridge into a little TV to show you it works. Black screen. Everybody looks at you.',
    btn: 'Blow on it', done: 'Blow on it. It helps. The title screen pops up. The seller is so impressed he knocks 25% off it.' },
  { id: 'flicker', label: 'Power flicker', text: 'The lights flicker and go dim for a second. When they come back up, a box that was behind the counter is sitting right in front of you.',
    btn: 'Look in the box', done: 'Somebody was holding these back. "Oh. I guess those are out now." Three more things to look at.' },
  { id: 'surprise', label: 'Forgot one in the truck', text: 'The seller snaps his fingers. "Hang on. I forgot a box in the truck." He comes back with one game and sets it down like it is nothing.',
    btn: 'Take a look', done: 'He has no idea what it is. The price on it says so.' },
  { id: 'happy', label: 'Happy hour', text: 'The seller claps once. "Okay. Everything on this table is 20% off. Right now. Before I change my mind."',
    btn: 'Shop the sale', done: 'Everything here just got 20% cheaper.' },
  { id: 'twenty', label: 'Under the table', text: 'Something is stuck under the table leg. It is a folded up ten dollar bill.',
    btn: 'Pick it up', done: 'The seller shrugs. "Finders keepers. It has been there since spring." +$10.' },
  { id: 'mistag', label: 'The price gun slipped', text: 'One of the stickers says $1. You are pretty sure it is supposed to say something else.',
    btn: 'Find it', done: 'There it is. One dollar. The seller has not noticed. Yet.' },
  { id: 'radio', label: 'Caller nine', text: 'A radio on the table: "Caller nine wins ten dollars from 104.8 The Dust!" You are already dialing.',
    btn: 'Call in', done: 'You are caller nine. You win $10 and a bumper sticker that says I CALLED THE DUST.' }
];
NP.EVENT_TAG = 'SURPRISE!';

// Ultra-rare drops: maybe one out there on any Saturday. Sellers have no idea.
NP.ULTRA = [
  { id: 'u1', art: 'mf3', g: 'platformer', p: 'k16', t: 'Moon Ferret 4: The Lost Prototype', base: 220,
    d: 'The fourth Moon Ferret was cancelled before anyone saw it. Somebody saw it. It is in your hands. The moon is a slightly different gray.' },
  { id: 'u2', art: 'bro', g: 'rpg', p: 'hal', t: 'Brunch Crusade: Golden Syrup Edition', base: 260,
    d: 'A gold disc in a box that smells like real maple. Made for the people who worked on the game. One of them sold it at a yard sale.' },
  { id: 'u3', art: 'gtc', g: 'rpg', p: 'fer', t: 'Shrine of the Golden Taco: Store Display Copy', base: 300,
    d: 'The copy that sat in a store window in 1993, with the display sticker still on it. Collectors have been looking for it for years.' },
  { id: 'u4', art: 'tnk', g: 'strategy', p: 'k16', t: 'Turnip Monarchy: Royal Decree Edition', base: 240,
    d: 'The version printed before the lawsuit, with the turnip wearing the original crown. There are maybe forty of these.' },
  { id: 'u5', art: 'hmp', g: 'action', p: 'lum', t: 'Haunted Mall Panic: Recalled Copy #1', base: 250,
    d: 'Serial number one, pulled from the very first store shelf. It still has the recall notice taped to the front.' },
  { id: 'u6', art: 'csf', g: 'sports', p: 'pip', t: 'Canal Surfer: Call-In Contest Prize', base: 230,
    d: 'The prize from a 104.8 The Dust call-in contest. Only nine callers got one. It comes with a letter that says CONGRATULATIONS, CALLER.' }
];
NP.TAGS.ultra = 'Ultra Rare (For Real)'; NP.TAG_COLORS.ultra = ['#ffcc33', '#7e1d8f']; NP.TAG_SHORT.ultra = 'ULTRA';
NP.ULTRA_RUMOR = 'Rumor going around town: there is something ultra rare out there today. Nobody knows where.';

// Combo and fever: good moves in a row raise your combo, and a big streak sets off fever.
NP.FEVER = { at: 6, mins: 20, text: 'FEVER! Fair offers always land. Bonus points x2.' };
NP.MAGNETS.push(
  { id: 'goal1', name: 'Goal Getter', how: 'Finish a mini-goal.' },
  { id: 'goal5', name: 'Overachiever', how: 'Finish 5 mini-goals in one Saturday.' },
  { id: 'surprise', name: 'Lucky Break', how: 'Get a surprise at a stop.' },
  { id: 'fever', name: 'Fever Pitch', how: 'Set off fever mode.' },
  { id: 'ultra', name: 'Ultra Rare (For Real)', how: 'Bring home an ultra-rare.' }
);

// =====================================================================================================
// ---------- Round 3c part 3: music and movies everywhere (full game only; the demo never sees any of this) ----------
// =====================================================================================================
// Record labels and movie studios (all made up). lab on a NP.MEDIA entry points into one of these.
NP.LABELS = {
  pull: 'Pull Chain Records', garage: 'Two Garages Records', hiss: 'Hiss & Pop Tapes', monsoon: 'Monsoon Season Music',
  mild: 'Mild Hits Inc.', pending: 'Forever Pending Records', strip: 'Strip Mall Sound'
};
NP.STUDIOS = {
  lobby: 'Big Lobby Pictures', dry: 'Dry Heat Pictures', tape: 'Straight to Tape Films', matinee: 'Sunday Matinee Entertainment',
  popcorn: 'Popcorn Ceiling Pictures', camcorder: 'Two Guys and a Camcorder Productions', brickwall: 'Brickwall Family Films',
  latefee: 'Late Fee Home Video', home: 'Recorded at Home'
};
// the first 22 (Round 3b) get their labels and studios here, so the list above them stays as it was
(function () {
  var L = { mu1: 'garage', mu2: 'garage', mu3: 'pull', mu4: 'pending', mu5: 'mild', mu6: 'garage', mu7: 'pull', mu8: 'mild', mu9: 'monsoon', mu10: 'hiss', mu11: 'mild', mu12: 'pending',
    mv1: 'lobby', mv2: 'lobby', mv3: 'lobby', mv4: 'dry', mv5: 'matinee', mv6: 'matinee', mv7: 'popcorn', mv8: 'tape', mv9: 'lobby', mv10: 'brickwall' };
  NP.MEDIA.forEach(function (m) { if (L[m.id]) m.lab = L[m.id]; });
})();
NP.MEDIA.push(
  { id: 'mu13', kind: 'music', fmt: 'cd', t: 'Rumble Strip Love', by: 'Earl Pothole & the Flat Tires', lab: 'mild', tier: 1, base: 4, tag: 'common',
    d: 'Country songs about road work. Every chorus has a lane closure. The love song is about a flagger.', b: 'NOW WITH 20% MORE PEDAL STEEL.' },
  { id: 'mu14', kind: 'music', fmt: 'tape', t: 'Nine Horns, One Van', by: 'Mall Security Ska Unit', lab: 'strip', tier: 2, base: 12, tag: 'cult',
    d: 'Ska from a band with more horn players than fans. All nine of them fit in one van. Barely. The trombone rides on the roof.', b: 'CHECKERED SHOES REQUIRED.' },
  { id: 'mu15', kind: 'music', fmt: 'vinyl', t: 'Neon Lagoon', by: 'Fountain Pennies', lab: 'pending', tier: 2, base: 16, tag: 'gem',
    d: 'Dreamy keyboard songs made to be played in an empty mall at 9 PM. Side B is just the sound of a fountain. It is the better side.', b: 'STAY UNTIL THE GATES COME DOWN.' },
  { id: 'mu16', kind: 'music', fmt: 'cd', t: 'Sorry About the Hair', by: 'Lipgloss Avalanche', lab: 'mild', tier: 1, base: 5, tag: 'common',
    d: 'Four guys, one can of hairspray each, per song. The power ballad is about a motorcycle that broke up with them.', b: 'WARNING: HIGHLY FLAMMABLE.' },
  { id: 'mu17', kind: 'music', fmt: 'tape', t: 'Tardy Again', by: 'MC Hall Pass', lab: 'hiss', tier: 2, base: 10, tag: 'uncommon',
    d: 'Rhymes about being late to third period. The beat is a locker slamming. It goes harder than it has any right to.', b: 'CERTIFIED LATE.' },
  { id: 'mu18', kind: 'music', fmt: 'cd', t: 'Forty Minutes of Rain (Relaxing)', by: 'Crystal Aura Collective', lab: 'monsoon', tier: 1, base: 2, tag: 'shovel',
    d: 'Forty minutes of rain sounds, sold in a desert town where it rains four days a year. People buy it to remember what rain is.', b: 'BREATHE IN. BREATHE OUT. BUY A CANDLE.' },
  { id: 'mu19', kind: 'music', fmt: 'vinyl', t: 'A Very Cactus Christmas', by: 'The Sundown Flats Community Choir', lab: 'monsoon', tier: 1, base: 3, tag: 'common',
    d: 'Christmas songs from a desert town. Every single song mentions that it is 74 degrees outside.', b: 'DECK THE SAGUAROS.' },
  { id: 'mu20', kind: 'music', fmt: 'tape', t: 'Sweatband Anthems Vol. 3', by: 'Coach Denise & the Leg Warmers', lab: 'hiss', tier: 1, base: 3, tag: 'common',
    d: 'Workout songs with a lady yelling "and REACH" over all of them. Volumes 1 and 2 were also this.', b: 'AND REACH. AND REACH.' },
  { id: 'mu21', kind: 'music', fmt: 'tape', t: 'Mom Says Turn It Down', by: 'The Curfew Breakers', lab: 'garage', tier: 2, base: 13, tag: 'cult',
    d: 'Three chords, two minutes a song, one very angry opinion about bedtime. Recorded in a garage. The garage was also angry.', b: 'TOO LOUD FOR THE GARAGE.' },
  { id: 'mu22', kind: 'music', fmt: 'cd', t: 'Rave in a Parking Garage', by: 'DJ Glowstick Dad', lab: 'pull', tier: 2, base: 11, tag: 'uncommon',
    d: 'Dance music made by a dad who found glowsticks in the junk drawer. The bass drops. So does his back.', b: 'BRING YOUR OWN GLOWSTICK.' },
  { id: 'mu23', kind: 'music', fmt: 'cd', t: 'Greatest Hit', by: 'One Hit Wanda', lab: 'mild', tier: 1, base: 3, tag: 'common',
    d: 'A greatest hits album with one hit on it. The other eleven songs are the hit, live, in different parking lots.', b: 'YOU KNOW THE ONE.' },
  { id: 'mu24', kind: 'music', fmt: 'vinyl', t: 'Karaoke Night at the Bowling Alley', by: 'The Lane 7 Singers', lab: 'strip', tier: 1, base: 2, tag: 'shovel',
    d: 'Instrumental versions of songs you almost know. The lyric sheet inside is for a different album.', b: 'SING IT LIKE NOBODY IS BOWLING.' },
  { id: 'mu25', kind: 'music', fmt: 'vinyl', t: 'Heat Advisory', by: 'The Evaporative Coolers', lab: 'monsoon', tier: 2, base: 15, tag: 'gem',
    d: 'Surf rock from a town with no ocean. Every song is about a canal. They feel very strongly about the canal.', b: 'SURF THE CANAL. (DO NOT SURF THE CANAL.)' },
  { id: 'mu26', kind: 'music', fmt: 'cd', t: 'Live from the Food Court Stage', by: 'Kassidee Sparkle', lab: 'strip', tier: 1, base: 4, tag: 'common',
    d: 'A pop singer on tour through every mall in the state. You can hear the pretzel stand in the background of every song.', b: 'NOW APPEARING NEAR THE ESCALATOR.' },
  { id: 'mu27', kind: 'music', fmt: 'vinyl', t: 'Moon Ferret: The Soundtrack', by: 'The Moon Ferret Sound Team', lab: 'pending', tier: 3, base: 45, tag: 'rare',
    d: 'The music from Moon Ferret, on vinyl, pressed for a fan club that had nine members. The title theme has been stuck in your head since 1994.', b: 'PRESS START TO LISTEN.' },
  { id: 'mu28', kind: 'music', fmt: 'tape', t: 'Clearance Rack Blues', by: 'Markdown Marvin', lab: 'garage', tier: 2, base: 9, tag: 'gem',
    d: 'Slow blues about things that did not sell. Every song ends with the price going down.', b: 'EVERYTHING MUST GO. ESPECIALLY THIS.' },
  { id: 'mu29', kind: 'music', fmt: 'cd', t: 'Live at the Laundromat', by: 'Gravel Choir', lab: 'garage', tier: 2, base: 16, tag: 'cult',
    d: 'The moody parking lot band, live, at a laundromat, during the spin cycle. The dryer solo goes on for six minutes.', b: 'BRING QUARTERS.' },
  { id: 'mu30', kind: 'music', fmt: 'vinyl', t: 'Laser Feelings II: More Feelings', by: 'Synth Lord Kevin', lab: 'pull', tier: 3, base: 32, tag: 'cult',
    d: 'The sequel. Ten keyboards this time. He pressed 300 again. His mom got 280.', b: 'THE FUTURE IS STILL NOW.' },
  { id: 'mv11', kind: 'movie', fmt: 'vhs', t: 'Shark Canal', by: 'A Rubber Shark', lab: 'dry', tier: 2, base: 12, tag: 'cult',
    d: 'A shark gets into the irrigation canal. The canal is two feet deep. You can see the whole shark the entire time.', b: 'THE WATER IS SHALLOW. THE TERROR IS NOT.' },
  { id: 'mv12', kind: 'movie', fmt: 'vhs', t: 'Badge and Badger', by: 'Chet Brickwall', lab: 'brickwall', tier: 1, base: 4, tag: 'common',
    d: 'Chet Brickwall plays a cop. His new partner is a badger. The badger gets the better speech at the end.', b: 'ONE PLAYS BY THE RULES. ONE IS A BADGER.' },
  { id: 'mv13', kind: 'movie', fmt: 'dvd', t: 'The Underdogs of Lane 9', by: 'A Cast of Bowlers', lab: 'matinee', tier: 1, base: 3, tag: 'common',
    d: 'A last place bowling team has one season to save the alley. The big game comes down to one spare. Everyone cries, including the spare.', b: 'THEY ROLLED WITH IT.' },
  { id: 'mv14', kind: 'movie', fmt: 'vhs', t: 'The Cactus Who Wanted to Be a Pine Tree', by: 'Clay, Mostly', lab: 'popcorn', tier: 2, base: 11, tag: 'gem',
    d: 'A stop motion Christmas special. It aired once on local TV in 1989. Somebody taped it. This is that tape.', b: 'HE WAS PRICKLY. HE WAS LOVED.' },
  { id: 'mv15', kind: 'movie', fmt: 'vhs', t: 'Aerobics for Dads, Volume 6', by: 'Coach Denise', lab: 'latefee', tier: 1, base: 1, tag: 'shovel',
    d: 'The workout tape from the milk crates at the swap meet. There was never a Volume 1. Somebody actually sold one.', b: 'AND REACH. FOR THE REMOTE.' },
  { id: 'mv16', kind: 'movie', fmt: 'vhs', t: 'Request Line 47: Taped Off TV', by: "Somebody's VCR", lab: 'home', tier: 2, base: 14, tag: 'cult',
    d: 'Four hours of the late night music video show, taped in 1996, commercials and all. The commercials are the best part. The label says DO NOT TAPE OVER. Somebody taped over the last ten minutes.', b: 'CALL IN. REQUEST IT. WAIT ALL NIGHT.' },
  { id: 'mv17', kind: 'movie', fmt: 'dvd', t: 'Asteroid Dentist 3: Final Rinse', by: 'Chet Brickwall', lab: 'tape', tier: 1, base: 2, tag: 'shovel',
    d: 'Straight to video. The asteroid is played by a different asteroid. Chet Brickwall is in it for nine minutes.', b: 'SPIT.' },
  { id: 'mv18', kind: 'movie', fmt: 'vhs', t: 'Kung Fu Crossing Guard', by: 'A Very Serious Crossing Guard', lab: 'camcorder', tier: 2, base: 9, tag: 'uncommon',
    d: 'A crossing guard who knows kung fu. Nobody crosses against the light in this town. Nobody.', b: 'WALK. WAIT. FIGHT.' },
  { id: 'mv19', kind: 'movie', fmt: 'vhs', t: 'Something in the Swamp Cooler', by: 'A Guy in a Vent', lab: 'dry', tier: 2, base: 13, tag: 'cult',
    d: 'Something is living in the swamp cooler. It only comes out when it is over 110. That is every day.', b: 'IT IS NOT THE HEAT. IT IS THE SOMETHING.' },
  { id: 'mv20', kind: 'movie', fmt: 'dvd', t: 'Prom Night at the Planetarium', by: 'A Cast of Thirty-Somethings', lab: 'matinee', tier: 1, base: 3, tag: 'common',
    d: 'Teen comedy. The prom is at the planetarium. The lights go out, everybody sees the stars and has feelings. Everyone in it is 34.', b: 'THIS PROM IS OUT OF THIS WORLD.' },
  { id: 'mv21', kind: 'movie', fmt: 'vhs', t: 'Volcano Plus Tornado', by: 'A Lot of Stock Footage', lab: 'tape', tier: 1, base: 2, tag: 'shovel',
    d: 'A volcano and a tornado, at the same time, in the same town. The town is a model train set. You can see the train.', b: 'TWICE THE DISASTER. HALF THE BUDGET.' },
  { id: 'mv22', kind: 'movie', fmt: 'vhs', t: 'Mailman from the Future', by: 'A Man in Foil', lab: 'popcorn', tier: 2, base: 9, tag: 'uncommon',
    d: 'A mailman from the year 3000 comes back in time to deliver one letter. It is a coupon. It is expired.', b: 'SPECIAL DELIVERY. FROM THE FUTURE.' },
  { id: 'mv23', kind: 'movie', fmt: 'dvd', t: 'Love in Aisle 9', by: 'Two Very Nice Actors', lab: 'lobby', tier: 1, base: 3, tag: 'common',
    d: 'Two people reach for the last can of soup. Ninety minutes later, they share it. The soup is the best actor in it.', b: 'SOME LOVE IS ON SALE.' },
  { id: 'mv24', kind: 'movie', fmt: 'vhs', t: "Chet Brickwall's Home Workout", by: 'Chet Brickwall', lab: 'brickwall', tier: 2, base: 10, tag: 'gem',
    d: 'Forty minutes of Chet Brickwall doing push-ups in a living room and talking about flossing. It is weirdly calming.', b: 'FLOSS. THEN LIFT.' }
);

// The Crate Lady: the swap meet's music and movie stall (in the milk crates by the fence)
NP.SELLERS.crate = { name: 'The Crate Lady', ask: 0.75, minLo: 0.55, minHi: 0.85,
  hi: ['Records in the red crate, CDs in the blue one, movies on the rack. Do not mix them up. People mix them up.'],
  yes: ['Good pick. That one has been waiting for you.', 'Sold. I had a feeling about you.', 'Take it. Play it loud.'],
  no: ['That one is worth more than that to me. It is sentimental. I bought it on Tuesday.', 'Nope. Make it a little more.'] };

// What each stop calls its music and movie shelves
NP.MEDIA_SECS = {
  games: 'Games',
  yard: ['A box of records and tapes', "Dad's old tapes and records", 'A shoebox of cassettes', 'A laundry basket of records and movies'],
  music: 'Record and CD bins', movies: 'Movie rack', crate: "The Crate Lady's crates", pawnMusic: 'CDs and records behind the counter', pawnMovies: 'Movies, two for something'
};
NP.CRATE_FLAVOR = 'Two milk crates of workout tapes. Every single one is "Aerobics for Dads, Volume 6." There was never a Volume 1.';

// The media gags. Each item gets one at most. hidden ones only show once you Inspect it (or find out at checkout).
NP.MEDIA_GAGS = {
  scratch: { fmts: ['vinyl'], hidden: true, mult: 0.5, note: 'Deep scratch across side B. It skips on the best song. Of course it does.', home: 'Scratched. It skips on the best song.' },
  sleeve: { fmts: ['vinyl'], hidden: true, note: 'You slide the record out. Wrong record. Somebody put it back in the wrong sleeve. It is actually {t}.' },
  wrong: { fmts: ['cd', 'dvd'], hidden: true, note: 'You pop the case open. Wrong disc. The case says one thing. The disc is {t}.' },
  cracked: { fmts: ['cd'], price: 0.7, mult: 0.9, note: 'The jewel case is cracked. Every jewel case is cracked. It is the law.', home: 'Cracked case. You could buy a new case. You will not.' },
  eaten: { fmts: ['tape'], price: 0.5, mult: 0.4, note: 'The tape got eaten. A loop of it is hanging out the bottom.', fix: 'Fix it with a pencil (5 min)',
    fixed: 'You stick a pencil in the hole and wind it back in. Classic. Good as new. Mostly.', home: 'Eaten tape. You never fixed it. Worth less than half.' },
  rewind: { fmts: ['vhs'], fee: 1, note: 'The sticker on it says PLEASE REWIND. Nobody did. Rewind fee: $1.', fix: 'Rewind it yourself (5 min)',
    fixed: 'You rewind it on the little TV at the table. It takes forever. The fee is gone.' },
  clam: { fmts: ['vhs'], mult: 1.2, note: 'Ex-rental, in a giant clamshell case. Collectors love a giant clamshell. Worth a little more.', home: 'Giant clamshell case. Collectors love those. Worth a little more.' },
  advisory: { fmts: ['vinyl', 'cd', 'tape'], mult: 1.3, sticker: 'WARNING TO PARENTS: CONTAINS ONE BAD WORD',
    note: 'Warning sticker on the front: "WARNING TO PARENTS: CONTAINS ONE BAD WORD." It is in track 9. The word is "heck." Collectors want the sticker version. Worth more.', home: 'The warning sticker version. The bad word is "heck." Collectors want the sticker. Worth more.' }
};
// the CD club flyer, stuck in a thrift store's CD bin some Saturdays
NP.CLUB = {
  name: 'Disc of the Month Club',
  flyer: 'A flyer is wedged in the CD bin: "12 CDS FOR A PENNY! Join the Disc of the Month Club today." There is a lot of small print.',
  btn: 'Mail it in (one penny)', skip: 'Leave it',
  joined: 'You tape a penny to the card. A box shows up so fast it is a little scary: 12 CDs. You did not pick any of them. The small print says you also agreed to buy more CDs, at full club price, for a while.',
  box: { id: 'club12', t: 'Disc of the Month Club Welcome Box (12 CDs)',
    d: 'Twelve CDs you did not pick, for a penny. Three of them are the same rain sounds album. One of them is good. You will find out which one.' },
  bill: 'The Disc of the Month Club took ${n} out of your paycheck. You did not pick this CD either.', billAmt: 10, bills: 3,
  billDone: 'That was the last Disc of the Month Club bill. You are out. They will send a letter asking you to come back. Do not open the letter.'
};
// the late night music video show
NP.CHANNEL = { name: 'Request Line 47', tag: 'the late night music video show' };
NP.EVENTS.push(
  { id: 'channel', label: 'Request Line 47', text: 'A little TV on the table is playing Request Line 47, the late night music video show, at 10 in the morning. It is a tape. The commercials are still in.',
    btn: 'Watch one video (5 min)', done: 'A band in five matching jackets does one key change. The seller sings along to the whole thing. Now she likes you: $2 off every record, tape and movie here.' }
);
NP.MAGNETS.push(
  { id: 'pencil', name: 'Pencil Technician', how: 'Fix an eaten tape with a pencil.' },
  { id: 'wrongdisc', name: 'Not What It Says', how: 'Find the wrong disc (or record) in a case.' },
  { id: 'club', name: 'Member for Life', how: 'Join the Disc of the Month Club.' },
  { id: 'crate', name: 'Crate Digger', how: 'Bring home 5 records, tapes, CDs or movies in one Saturday.' }
);

// =====================================================================================================
// ---------- Round 3c.1: the want list (mini-goals based on a real collector's want list) ----------
// =====================================================================================================
// Every mini-goal is a want list entry: a name, what to do, a difficulty and a reward for the tackle box.
// d: easy / mid / hard / vhard (sets the points, the tip and the default time). mins: a timed one (game minutes).
// type: buy (f = what to buy, n = how many), groups (one of each group), inspect (f, out: clean or manual), twins, dig,
//   tables (stalls opened at the swap meet or the Expo), yards, quick, walkaway, trade, club, check, nomiss, clean.
// f fields: kind, cond, p, g, tier, max, cart, variant, gag, rental, set, notOwned, dig, stop, tested, manual, noManual,
//   haggle (20% off or more), haggled (any discount), offer, fmt.
// at: only offered when you walk into that kind of stop. late: only offered near the end of the day. before: a deadline.
NP.WANT_DIFF = { easy: { pts: 20, tip: 0, mins: 120, label: 'Easy' }, mid: { pts: 30, tip: 0, mins: 150, label: 'Mid' },
  hard: { pts: 40, tip: 5, mins: 180, label: 'Hard' }, vhard: { pts: 60, tip: 10, mins: 0, label: 'Very hard' } };
NP.GOALS_POOL = [
  { id: 'w01', name: 'Cardboard Dream', label: 'Find a complete in box Kestrel 16 game', type: 'buy', f: { kind: 'game', cond: 'cib', p: 'k16' }, n: 1, mins: 60, d: 'easy', reward: 'Clear Box Protector' },
  { id: 'w02', name: 'Factory Fresh', label: 'Find a factory sealed game', type: 'buy', f: { kind: 'game', cond: 'sealed' }, n: 1, d: 'hard', reward: 'Collector XP Card (500 XP)' },
  { id: 'w03', name: 'Role-Player', label: 'Buy 3 RPGs before noon', type: 'buy', f: { kind: 'game', g: 'rpg' }, n: 3, before: 720, d: 'mid', reward: 'Velvet Dice Bag' },
  { id: 'w04', name: 'Lost Papers', label: 'Inspect a complete in box game and find the manual inside', type: 'inspect', f: { kind: 'game', cond: 'cib' }, out: 'manual', n: 1, d: 'easy', reward: 'Mint Condition Stamp' },
  { id: 'w05', name: 'Box Only', label: 'Haggle down a boxed game with no manual', type: 'buy', f: { kind: 'game', cond: 'cib', noManual: true, haggled: true }, n: 1, d: 'mid', reward: 'Extra Shelf Bracket' },
  { id: 'w06', name: 'Flea Market Gold', label: 'Find a good one buried in a dig pile (uncommon or better)', type: 'buy', f: { kind: 'game', tier: 2, dig: true }, n: 1, d: 'hard', reward: 'Magnifying Glass' },
  { id: 'w07', name: 'Haggler', label: 'Get 20% or more off 4 things', type: 'buy', f: { haggle: true }, n: 4, d: 'mid', reward: 'Silver Tongue Badge' },
  { id: 'w08', name: 'Label Checker', label: 'Inspect 5 games that check out clean', type: 'inspect', f: { kind: 'game' }, out: 'clean', n: 5, d: 'easy', reward: 'Contact Cleaner Kit' },
  { id: 'w09', name: 'Opening Bell', label: 'Buy something in your first 10 minutes at this yard sale', type: 'quick', at: ['yard'], n: 1, mins: 30, d: 'easy', reward: 'Early Bird Sneakers' },
  { id: 'w10', name: 'Bargain Bin Sweep', label: 'Buy 5 loose games for $5 or less each', type: 'buy', f: { kind: 'game', cond: 'loose', max: 5 }, n: 5, d: 'easy', reward: 'Plastic Milk Crate' },
  { id: 'w11', name: 'Color Variant', label: 'Find a cartridge in a colored shell (gold, red or clear)', type: 'buy', f: { kind: 'game', variant: 'shell' }, n: 1, d: 'mid', reward: 'Neon Shell Case' },
  { id: 'w12', name: 'Seeing Double', label: 'Inspect two copies of the same game at one stop', type: 'twins', n: 2, d: 'mid', reward: 'Trade Bait Token' },
  { id: 'w13', name: 'Tested and Working', label: 'Buy a game somebody already tested (the pawn counter tests everything)', type: 'buy', f: { kind: 'game', tested: true }, n: 1, d: 'mid', reward: 'CRT Glow Screen Border' },
  { id: 'w14', name: 'Dusty Attic', label: 'Dig through the back boxes at 2 stops', type: 'dig', n: 2, mins: 180, d: 'mid', reward: 'Feather Duster' },
  { id: 'w15', name: 'Convention Dash', label: 'Stop at 4 different tables or booths', type: 'tables', at: ['flea', 'expo'], n: 4, mins: 60, d: 'easy', reward: 'VIP Floor Pass' },
  { id: 'w16', name: 'Battery Tester', label: 'Inspect 2 loose Kestrel 16 carts whose save batteries still work', type: 'inspect', f: { kind: 'game', cond: 'loose', p: 'k16' }, out: 'clean', n: 2, d: 'hard', reward: 'Multimeter Charm' },
  { id: 'w17', name: 'Full Run', label: 'Find a Moon Ferret game you do not have yet', type: 'buy', f: { kind: 'game', set: 'mf', notOwned: true }, n: 1, d: 'hard', reward: 'Complete Set Trophy' },
  { id: 'w18', name: 'Still Taped Shut', label: 'Buy a lot box without opening it', type: 'buy', f: { kind: 'lot' }, n: 1, d: 'mid', reward: 'Twist Tie Flair' },
  { id: 'w19', name: 'Yard Sale Scout', label: 'Hit 3 yard sales today', type: 'yards', n: 3, mins: 240, d: 'mid', reward: 'Local Paper Map' },
  { id: 'w20', name: 'Map Included', label: 'Find a complete in box RPG or action game with everything inside', type: 'buy', f: { kind: 'game', cond: 'cib', g: ['rpg', 'action'], manual: true }, n: 1, d: 'hard', reward: 'Cartographer Pin' },
  { id: 'w21', name: 'No Bit Left Behind', label: 'One of each: a Ferroset 8, a Kestrel 16 and a Marigold 32 game', type: 'groups', groups: [{ kind: 'game', p: 'fer' }, { kind: 'game', p: 'k16' }, { kind: 'game', p: 'hal' }], n: 3, d: 'mid', reward: 'Era Hopper Title' },
  { id: 'w22', name: 'Clean Contact', label: 'Inspect a loose cartridge and find clean contacts', type: 'inspect', f: { kind: 'game', cond: 'loose', cart: true }, out: 'clean', n: 1, d: 'easy', reward: 'Pink Pencil Eraser' },
  { id: 'w23', name: 'The Holy Grail', label: 'Find the grail: the game in the game', type: 'buy', f: { kind: 'grail' }, n: 1, d: 'vhard', reward: 'Gold Display Stand' },
  { id: 'w24', name: 'Sticker Shock', label: 'Walk away from 2 stops that have something way overpriced', type: 'walkaway', n: 2, mins: 180, d: 'easy', reward: 'Smart Buyer Badge' },
  { id: 'w25', name: 'Foam Insert', label: 'Find a complete in box cartridge game with everything inside', type: 'buy', f: { kind: 'game', cond: 'cib', cart: true, manual: true }, n: 1, d: 'mid', reward: 'Pure White Foam Block' },
  { id: 'w26', name: 'Import Run', label: 'Find an import copy (the label is in another language)', type: 'buy', f: { kind: 'game', variant: 'import' }, n: 1, d: 'mid', reward: 'Passport Stamp' },
  { id: 'w27', name: 'Flea Stroll', label: 'Stop at 8 different stalls at the swap meet', type: 'tables', at: ['flea'], n: 8, mins: 90, d: 'hard', reward: 'Vinyl Tarp' },
  { id: 'w28', name: 'Bulk Buy', label: 'Buy a whole box at once (a box deal, a lot box or a box of 40)', type: 'buy', f: { kind: 'box' }, n: 1, d: 'mid', reward: 'Wholesale Handshake Pin' },
  { id: 'w29', name: 'Check the Guide', label: 'Check 3 games against your shelf list', type: 'check', n: 3, d: 'easy', reward: 'Walkthrough Page Wallpaper' },
  { id: 'w30', name: 'Poster Child', label: 'Buy an ex-rental movie (the rental sticker never comes off)', type: 'buy', f: { kind: 'movie', rental: true }, n: 1, d: 'mid', reward: 'Wall Art Poster' },
  { id: 'w31', name: 'Early Release', label: 'Find a first print of a boxed game (Inspect tells you)', type: 'buy', f: { kind: 'game', variant: 'first' }, n: 1, d: 'mid', reward: 'Launch Era Banner' },
  { id: 'w32', name: 'Handheld Haul', label: 'Find 2 Lunchbox LX games', type: 'buy', f: { kind: 'game', p: 'pip' }, n: 2, d: 'easy', reward: 'Clamshell Pocket' },
  { id: 'w33', name: 'Traders Club', label: 'Trade in 2 things for store credit', type: 'trade', n: 2, d: 'hard', reward: 'Master Swapper Medal' },
  { id: 'w34', name: 'Promo Demo', label: 'Find a NOT FOR RESALE store demo cartridge', type: 'buy', f: { kind: 'game', variant: 'promo' }, n: 1, d: 'hard', reward: 'Kiosk Attendant Title' },
  { id: 'w35', name: 'Oddball Port', label: 'Find a game for the Lumen Disc', type: 'buy', f: { kind: 'game', p: 'lum' }, n: 1, d: 'mid', reward: 'Floppy Disk Pin' },
  { id: 'w36', name: 'Closing Time Deal', label: 'Land a lowball (half price) before the day is over', type: 'buy', f: { offer: 'lowball' }, n: 1, late: true, d: 'hard', reward: 'Pack-Up Partner Badge' },
  { id: 'w37', name: 'Clean Clamshell', label: 'Find a VHS in a giant clamshell case', type: 'buy', f: { kind: 'movie', gag: 'clam' }, n: 1, d: 'easy', reward: 'Heavy Duty Case' },
  { id: 'w38', name: 'Mail-In Proof', label: 'Mail in the Disc of the Month Club card', type: 'club', n: 1, d: 'mid', reward: 'Postmark Stamp' },
  { id: 'w39', name: 'Arcade Port', label: 'Find an action game at a yard sale', type: 'buy', f: { kind: 'game', g: 'action', stop: 'yard' }, n: 1, d: 'mid', reward: 'Arcade Knob Avatar' },
  { id: 'w40', name: 'Shelf Ready', label: 'A complete in box, a loose and a sealed game, each from a different stop', type: 'groups', groups: [{ kind: 'game', cond: 'cib' }, { kind: 'game', cond: 'loose' }, { kind: 'game', cond: 'sealed' }], distinct: true, n: 3, d: 'vhard', reward: 'Preservationist Crown' },
  // kept from 3c: no misses, and music and movies
  { id: 'w41', name: 'Steady Hands', label: 'No misses: land 3 offers in a row', type: 'nomiss', n: 3, mins: 120, d: 'mid', reward: 'Lucky Price Gun' },
  { id: 'w42', name: 'Clean Hour', label: 'No misses for 60 minutes (land at least one offer)', type: 'clean', n: 1, mins: 60, d: 'mid', reward: 'Pocket Calculator' },
  { id: 'w43', name: 'Crate Digger', label: 'Find a record, tape, CD or movie', type: 'buy', f: { kind: 'media' }, n: 1, d: 'easy', reward: 'Record Brush' },
  { id: 'w44', name: 'Needle Drop', label: 'Find a vinyl record', type: 'buy', f: { kind: 'music', fmt: 'vinyl' }, n: 1, d: 'mid', reward: 'Inner Sleeve Pack' },
  { id: 'w45', name: 'Tape Deck', label: 'Find a movie on VHS', type: 'buy', f: { kind: 'movie', fmt: 'vhs' }, n: 1, d: 'easy', reward: 'Tracking Knob' },
  { id: 'w46', name: 'Full Shelf', label: 'One of each: a game, some music and a movie', type: 'groups', groups: [{ kind: 'game' }, { kind: 'music' }, { kind: 'movie' }], n: 3, d: 'mid', reward: 'Shelf Divider Set' }
];
NP.WANT_TEXT = {
  tag: 'WANT LIST',
  banners: ['HAUL SECURED!', 'WISHLIST CHECKED!', 'MINT FIND!', 'DEAL OF THE DAY!', 'SHELF WORTHY!', 'BOUGHT FOR PEANUTS!', 'SET COMPLETE!', 'ATTIC GOLD FOUND!', 'GRAIL IN HAND!', 'SCORE OF THE CENTURY!'],
  // a banner that fits the goal, when there is one
  bannerFor: { w17: 'SET COMPLETE!', w21: 'SET COMPLETE!', w46: 'SET COMPLETE!', w23: 'GRAIL IN HAND!', w14: 'ATTIC GOLD FOUND!', w06: 'ATTIC GOLD FOUND!', w10: 'BOUGHT FOR PEANUTS!', w07: 'DEAL OF THE DAY!', w36: 'DEAL OF THE DAY!' },
  soClose: ['Beaten to the trunk by 5 seconds!', 'Missing the manual by one page!', "Vendor wouldn't budge on the price!", 'The box was empty inside!', 'Sold right off the table!',
    'Flea market gates closed!', 'Permanent marker on the label!', 'Someone else snatched the bundle!', 'ATM ran out of cash!', 'Just pennies short of the deal!'],
  next: 'That one is off the want list. Another one is coming.',
  newReward: 'New in the tackle box',
  box: 'The tackle box', boxNote: 'Want list rewards. One for every entry on the want list. They stay in the box forever.',
  waiting: 'Starts when you walk in'
};
// variants a want list hunts for (full game only): colored shells, imports, store demo carts, first prints
NP.VARIANTS = {
  'shell-gold': { p: 0.015, loose: true, cart: true, mult: 1.5, color: '#d9a514', note: 'Gold shell variant. The whole cartridge is gold. Worth 50% more.' },
  'shell-red': { p: 0.015, loose: true, cart: true, mult: 1.4, color: '#c8323c', note: 'Red shell variant. Not the usual gray. Worth 40% more.' },
  'shell-clear': { p: 0.015, loose: true, cart: true, mult: 1.4, color: '#b9e3ef', note: 'Clear shell variant. You can see the board inside. Worth 40% more.' },
  import: { p: 0.03, loose: true, cart: true, mult: 1.3, note: 'Import copy. The label is in another language. The game is the same. Collectors pay more for it.' },
  promo: { p: 0.012, loose: true, cart: true, mult: 2, note: 'NOT FOR RESALE. A store demo cartridge, pulled out of a kiosk. Worth double.' },
  first: { p: 0.1, boxed: true, hidden: true, mult: 1.2, note: 'First print. The early label with the misspelled credit. Worth 20% more.' }
};
NP.SAVE_NOTE = 'Save battery still holds a file. Somebody\'s 1994 save is still on it.';
NP.MAGNETS.forEach(function (m) {
  if (m.id === 'goal1') { m.name = 'Want List Starter'; m.how = 'Check off your first want list entry.'; }
  if (m.id === 'goal5') { m.name = 'Overachiever'; m.how = 'Check off 5 want list entries in one Saturday.'; }
});

// =====================================================================================================
// ---------- Demo round 4: a light want list for the free demo ----------
// =====================================================================================================
// Two easy entries that can always be finished in the demo. They share their rewards with the full game's tackle box.
NP.DEMO_WANT = [
  { id: 'w01', at: 'yard', name: 'Cardboard Dream', label: 'Find a complete in box game', type: 'buy', f: { kind: 'game', cond: 'cib' }, n: 1, d: 'easy', reward: 'Clear Box Protector', banner: 'HAUL SECURED!' },
  { id: 'w07', at: 'yard', name: 'Haggler', label: 'Get 20% or more off one thing', type: 'buy', f: { haggle: true }, n: 1, d: 'easy', reward: 'Silver Tongue Badge', banner: 'SMOOTH TALKER!' },
  { id: 'w08', at: 'yard', name: 'Label Checker', label: 'Inspect 2 games that check out clean', type: 'inspect', f: { kind: 'game' }, out: 'clean', n: 2, d: 'easy', reward: 'Contact Cleaner Kit', banner: 'SHARP EYE!' },
  { id: 'w15', at: 'flea', name: 'Convention Dash', label: 'Stop at 3 different tables or stalls at the swap meet', type: 'tables', n: 3, d: 'easy', reward: 'VIP Floor Pass', banner: 'WISHLIST CHECKED!' },
  { id: 'w10', at: 'flea', name: 'Bargain Bin Sweep', label: 'Buy a loose game for $5 or less', type: 'buy', f: { kind: 'game', cond: 'loose', max: 5 }, n: 1, d: 'easy', reward: 'Plastic Milk Crate', banner: 'BIN DIVER!' }
];
NP.DEMO_WANT_TEXT = {
  early: 'Early bird find. The seller thinks it is a coaster. Any offer works.',
  more: 'The full game has {all} entries on the want list. {n} more rewards are waiting in the full version.',
  tease: 'The rare stuff is there. So is Dex, so do not take too long.',
  nextTease: 'the rare stuff is there',
  rareTag: 'The rare stuff is here today. Dex knows it too.',
  box: 'Your tackle box',
  boxLine: '{have} of {all} want list rewards. The full game has the rest.',
  welcome: 'Welcome back. Your demo Saturday is right where you left it.'
};

// =====================================================================================================
// ---------- Round 5: bigger dopamine hits (full game only; the demo stays as it is) ----------
// =====================================================================================================
// Streaks: back-to-back good haggles and finds. Each tier pays a share of the find's value on top, capped per find.
NP.STREAK = { tiers: [[2, 1.25], [4, 1.5], [6, 2]], cap: 25, good: 1.5 };
NP.FEVER.text = 'FEVER! For 20 minutes, fair offers always land and your streak cannot break.';
// loot colors for the find reveal
NP.RARITY = {
  // colorblind-safe (Okabe-Ito), and every color always comes with its word
  common: { label: 'COMMON', color: '#c9d1dc' }, uncommon: { label: 'UNCOMMON', color: '#56B4E9' },
  rare: { label: 'RARE', color: '#CC79A7' }, grail: { label: 'GRAIL', color: '#E69F00' }
};
// near mint, one tiny flaw (worth 15% less). At most two a day.
NP.FLAWS = ['One tiny crease on the box corner.', 'A small tear in the price sticker.', 'A one-inch split in the shrink wrap.', 'The manual has one dog-eared page.',
  'A faint ring where somebody set a cup on it once.', 'One corner of the label is lifting.'];
NP.FLAW = { mult: 0.85, tag: 'NEAR MINT', note: 'So close to mint. {f} Worth 15% less.' };
// a rival grabs something great right in front of you. At most once a day.
NP.NEAR_MISS = {
  lines: ['{r} reaches right past you and grabs it. He paid {p}. It is worth about {v}.', '{r} picks it up a second before you do. {p}, cash. It is worth about {v}.'],
  stamp: 'SO CLOSE', chip: 'So close. {r} got {t}.'
};
// the $5 mystery box at some yard sales. The odds on the box are the real odds.
NP.MBOX = {
  t: '$5 Mystery Box', ask: 5,
  d: 'A taped-up shoebox. The seller swears there is something good in it. The seller has said that about everything.',
  odds: [['junk', 0.8, 'junk'], ['good', 0.18, 'something good'], ['treasure', 0.02, 'sealed treasure']],
  btn: 'Buy the box ($5)', open: 'You rip the tape off.',
  junk: ['Mostly packing peanuts and one game.', 'A game, a dead battery and a coupon from 1998.'],
  good: ['Under the packing peanuts: something actually good.'],
  treasure: ['Wrapped in a beach towel, still sealed: the real thing.']
};
// the daily tip on the map, with made-up cross streets
NP.DAILY_STREETS = ['Saguaro Bloom Ct', 'Dry Wash Loop', 'Jackrabbit Bend', 'Brittlebush Hollow', 'Chuckwalla Crossing', 'Two Cactus Way', 'Monsoon Gulch Rd', 'Creosote Flats Dr', 'Gila Shade Ln', 'Tumbleweed Turn'];
NP.DAILY_TIP = {
  h: 'DAILY TIP',
  line: 'Word around town: there is a rare one at {stop} today, near {a} and {b}.',
  paid: 'The daily tip paid off!'
};
// the visit streak: come back on a new day, a little more cash for that day's Saturday. Miss a day and it starts over.
NP.LOGIN = { max: 7, per: 1, line: 'Visit streak: day {n}. +${c} for today\'s Saturday.', next: 'Come back tomorrow for +${c}.', reset: 'A day was missed, so the visit streak started over.' };
NP.MAGNETS.push(
  { id: 'jackpot', name: 'Jackpot', how: 'Open sealed treasure from a $5 mystery box.' },
  { id: 'tip', name: 'Insider', how: 'Buy the rare one from the daily tip.' },
  { id: 'streakx2', name: 'Double Down', how: 'Reach a x2 streak.' },
  { id: 'visit7', name: 'Regular', how: 'Keep a 7 day visit streak.' }
);

// =====================================================================================================
// ---------- Demo round 5 ----------
// =====================================================================================================
NP.DEMO5 = {
  start: 'Demo Saturday. $100. Back by noon. Tap the yard sale on the map, or the big Drive button.',
  mapNote: 'Tap a stop on the map to drive there. Gray ones are in the full version.',
  lockedNote: 'That one opens in the full version.',
  visitedNote: 'You already hit that one today.',
  mapNoteFull: 'Tap a stop on the map to drive there. The cards below have the details.',
  lateNote: 'Not enough daylight left to make it to {name}.',
  undo: 'Undo: {what}',
  undone: 'Undone. Everything is back the way it was.',
  set: { title: 'Settings', sound: 'Sound', volume: 'Volume', text: 'Text size', speed: 'Game speed', speedNote: 'Fast makes drives and reveals quicker.',
    fx: 'Effects', fxNote: 'Calm turns off shake, flashes and confetti.', tips: 'Tips', done: 'Done',
    colors: 'Colors are picked so colorblind players can tell them apart, and every color comes with a word.', privacy: 'Privacy' },
  next: { tag: 'NEXT:', map: 'Drive to the {name}.', drive: 'Drive', home: 'Head home and shelve it.', homeBtn: 'Head home',
    mapFull: 'Drive to {name}.', walkExpo: 'Tap a booth to shop it. The doors at the bottom are the way out.',
    early: 'There is a cheap find on this table. Tap any offer on it.', goal: '{goal}.', shop: 'Make an offer on anything. Or move on.',
    done: 'Nothing left here. Time to move on.', next: 'Next stop', walk: 'Tap a table to shop it. The gate at the bottom is the way out.' },
  counter: 'Meet me at {$}?',
  counterBtn: 'Deal at {$}',
  miniTag: 'HEADS UP!',
  tvBtn: 'Watch it',
  tvBreak: 'Watch a TV commercial (optional, costs no time)',
  yardTV: 'An old TV on the card table is playing commercials from way back.',
  mini: {
    flash: '{who} yells "Everything on my table, 30% off for the next few minutes!"',
    cash: 'You find a $5 bill folded in a box lid. Finders keepers. +$5.',
    gun: 'A price gun slipped. {t} is marked $1. Grab it before somebody else sees.',
    radio: '104.8 The Dust is giving $10 to the first caller who knows the jingle. You know it. +$10.',
    tv: 'The TV on the next table is showing ads from the good old days. Want to watch one?',
    cameo: ''
  },
  short: { yard: 'YARD SALE', flea: 'SWAP MEET', gift: 'GIFT SHOP', thrift: 'THRIFT', pawn: 'PAWN', sports: 'SPORTS BIN', mall: 'MALL', banned: 'STAFF ONLY', pal: 'LONNIE', record: 'RECORDS', rental: 'VIDEO' }
};
