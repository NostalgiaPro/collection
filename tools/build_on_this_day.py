#!/usr/bin/env python3
"""
Build data/on-this-day/MM.json, the "On this day" pop-culture data for
onthisday.html and the home-page teaser.

Everything a visitor sees is pre-built here and served from the site
itself: the page never calls Wikipedia, Wikidata or anyone else.

Sources (every item keeps a link to the page it came from):
  1. Wikidata (query.wikidata.org SPARQL + wbgetentities) for release dates:
       Movies  - films with a US-qualified release date (P577 + P291=US)
       Games   - video games with a North America / US-qualified date,
                 plus curated consoles/handhelds with region-qualified dates
       Music   - albums and singles with a single day-precision P577
       TV      - series/animated series premieres (P580), curated channel launches
       Sports  - Super Bowls, WrestleMania, World Series, NBA Finals,
                 Stanley Cup Finals, Olympic opening days
       Tech/Toys - curated product lists (dates from P577/P571)
  2. English Wikipedia's "On this day" feed
       (en.wikipedia.org/api/rest_v1/feed/onthisday/all/MM/DD), events and
       selected anniversaries only, kept only if an allowlist keyword
       places them in a pop-culture category and no blocklist word hits.
  3. Cross-check: every Wikidata date must also appear in the lead /
     infobox wikitext of the matching English Wikipedia article (any of
     "July 3, 1985", "3 July 1985", "1985-07-03" or a {{start date|1985|7|3}}
     style template). Anything that does not match is dropped. Music with
     more than one release date in its infobox is dropped (regional dates).

Content rules (RC's site): pop culture only, 1980 onward (a few to
MAX_YEAR), nothing negative (deaths, disasters, crime, war, scandal,
illness, lawsuits...), no politics, religion or government, family
friendly. Enforced by BLOCK_WORDS (applied to titles, descriptions and
feed text), EXCLUDE_GENRES (horror, war, erotic...), EXCLUDE_PEOPLE,
and MANUAL_EXCLUDE (items removed on manual review, with reasons).

Usage:
  python3 tools/build_on_this_day.py            # uses the cache where it can
  python3 tools/build_on_this_day.py --refresh  # re-download everything
Raw downloads are cached in tools/.otd-cache/ (git-ignored).
"""
import functools
print = functools.partial(print, flush=True)
import json, os, re, sys, time, datetime, hashlib, urllib.request, urllib.parse, html
from collections import defaultdict, Counter
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".otd-cache")
OUT = os.path.join(ROOT, "data", "on-this-day")
REFRESH = "--refresh" in sys.argv
UA = {"User-Agent": "NostalgiaProOnThisDay/1.0 (https://thenostalgiapro.com; thenostalgiapro@gmail.com)"}

MIN_YEAR, MAX_YEAR = 1980, 2012
# a few later notable ones are fine, but only to fill a day that would otherwise be thin
BACKFILL_MAX_YEAR = 2015
PER_DAY_MAX = 12
# soft cap per category per day, so one category can't swamp a day
CAT_CAP = {"Movies": 3, "Music": 3, "Games": 3, "TV": 2, "Sports": 2, "Tech": 2, "Toys": 2}
CATS = ["Movies", "TV", "Music", "Games", "Toys", "Sports", "Tech"]

# ---------------------------------------------------------------- filters
# Words that block an item wherever they appear (titles, labels, feed text).
# Whole words; a trailing "*" means "this stem plus anything" (assassin* = assassinated...).
BLOCK_WORDS = r"""
death deaths dead die dies died dying kill* murder* assassin* suicide* massacre* slaughter*
genocide execut* bomb* terror* hostage* blood bloody gore satan* devil* demon* hell hellraiser
zombie* slasher chainsaw sex sexy porn* erotic nude naked drug drugs cocaine heroin overdose*
nazi* hitler rape* abuse* torture* corpse* cannibal*
war wars warfare soldier* gun guns gunman gunmen crime* criminal* prison* drunk*
god gods goddess christ jesus bible holy church satanic
shit* fuck* bitch* piss* cunt* ripper*
"""
# Extra words that block Wikipedia-feed sentences (news style text), but not
# release titles, where they're usually harmless ("The Princess Diaries", "Queen").
FEED_BLOCK_WORDS = r"""
shoot* shot gun gunman gunmen war wars warfare battle* invasion invade* militar* army navy
soldier* troop* weapon* nuclear missile* attack* riot* crash* collision* derail* explo* fire
fires blaze flood* earthquake* tsunami* hurricane* tornado* storm* famine* disaster* tragedy
tragic accident* sink sinks sank sinking wreck* injur* wound* victim* casualt* fatal* disease*
illness* cancer aids hiv epidemic* pandemic* virus* crime* criminal* arrest* convict* prison*
jail* sentenc* trial court* lawsuit* sued sue sues indict* scandal* fraud* bankrupt* layoff*
strike* lockout* boycott* cancel* protest* police steroid* doping banned ban suspen*
president* prime minister* government* parliament* congress* senate* senator* election*
elect* vote* voting referendum* politic* party treaty* king queen prince princess royal*
emperor* dictator* regime* soviet* communist* church* pope religio* christian* islam* muslim*
jewish catholic* god bible* controvers* fight* fought hurt punch*
"""
def _word_re(words):
    parts = []
    for w in sorted(set(words.split()), key=len, reverse=True):
        parts.append(re.escape(w[:-1]) + r"\w*" if w.endswith("*") else re.escape(w))
    return re.compile(r"\b(" + "|".join(parts) + r")\b", re.I)
BLOCK_RE = _word_re(BLOCK_WORDS)
FEED_BLOCK_RE = _word_re(FEED_BLOCK_WORDS)
# names that are fine even though they contain a blocked word
ALLOW_OVERRIDE = re.compile(r"(Star Wars|Gears of War|Warcraft|StarCraft|Street Fighter|Mortal Kombat|"
                            r"Duck Hunt|Fire Emblem|Firefox|Kingdom Hearts|King of the Hill|"
                            r"The Lion King|Donkey Kong|King Kong|Deathly Hallows|Queen Latifah|Prince of Persia|"
                            r"Princess Diaries|Princess Bride|Princess Mononoke|Fresh Prince|Wario|Warner|Warp|"
                            r"Top Gun|Guns N' Roses|Prisoner of Azkaban|Space Shuttle|Shuttle)", re.I)
# whole franchises / titles that are off-tone even though no single word is
EXCLUDE_TITLE_FRAGMENTS = re.compile(r"(Resident Evil|Scarface|Grand Theft Auto|Manhunt|Postal|Silent Hill|"
                                     r"Saw [IVX0-9]|Friday the 13th|Nightmare on Elm Street|Hostel|Jackass|"
                                     r"Girls Gone Wild|Playboy|Basic Instinct|Showgirls|American Pie|Porky's|Godfather|"
                                     r"Breaking Bad|Jersey Shore|Skins|Queer as Folk|Crack a Bottle|Take It Off)", re.I)

# Wikidata genres (matched on the genre's English label) that are off-tone
# for a family-friendly nostalgia page.
EXCLUDE_GENRE_RE = re.compile(r"\b(horror|slasher|splatter|zombie|war film|war drama|war video game|anti-war|"
                              r"erotic|pornograph|sexploitation|exploitation|gore|snuff|torture|cannibal|"
                              r"death metal|black metal|grindcore|horrorcore|gangsta rap|drill music|"
                              r"crime thriller|psychological thriller|erotic thriller|survival horror|"
                              r"mafia film|gangster film|serial killer|home invasion|disaster film|sex comedy|thrash metal|"
                              r"groove metal|metalcore|deathcore|gothic metal|extreme metal|true crime|"
                              r"crime drama television|police procedural|political|politics|propaganda|news program|"
                              r"news broadcast|current affairs|religious|Christian|gospel|worship|mafia)\b", re.I)
# Wikidata "main subject" (P921) labels that make a film/show/game off-tone.
# Kept narrow on purpose: "terrorism" or "Cold War" alone would take out half
# the action films and Bond, so only the heavy subjects count, and a few
# well-loved titles whose subject is a backdrop rather than the point stay in.
EXCLUDE_SUBJECT_RE = re.compile(r"(September 11|genocide|Holocaust|slavery|serial killer|suicide|murder|homicide|"
                                r"drug trafficking|drug-related|substance abuse|addiction|alcoholism|cancer|HIV|AIDS|"
                                r"\babuse\b|\brape\b|domestic violence|torture|^politics|political scandal|Nazism|"
                                r"World War I\b|World War II|Vietnam War|Korean War|organized crime|mafia|prostitution|"
                                r"pornography|terminal illness|disaster|disease outbreak|^death of)", re.I)
SUBJECT_OK = {"Forrest Gump", "Raiders of the Lost Ark", "Indiana Jones and the Temple of Doom", "Big Fish",
              "Bicentennial Man", "Pan", "Operation Dumbo Drop", "The Philadelphia Experiment", "Swing Shift",
              "Saving Mr. Banks", "The Family Stone", "The Mask of Zorro", "Romeo + Juliet", "Scent of a Woman",
              "My Favorite Year", "Tender Mercies", "The Shawshank Redemption", "Toxic", "Pretty Woman",
              "Moulin Rouge!", "Waterfalls", "The Hunger Games: Catching Fire", "Lethal Weapon", "The Last Song",
              "The Perks of Being a Wallflower", "Across the Universe", "Star Wars: Episode I – The Phantom Menace",
              "WarGames", "GoldenEye", "Dick Tracy"}
# performers / creators with criminal convictions or major abuse allegations:
# matched on the credited name (Wikipedia infobox artist / Wikidata performer or director)
EXCLUDE_PEOPLE_RE = re.compile(r"\b(R\. Kelly|Gary Glitter|Phil Spector|Chris Brown|Lostprophets|Ian Watkins|"
                               r"Bill Cosby|Marilyn Manson|2Pac|Tupac|Roman Polanski|Harvey Weinstein|Rammstein)\b", re.I)
EXCLUDE_TITLE_RE = re.compile(r"\bCosby\b", re.I)
# TV channels whose original series are almost all adult (TV-MA) drama or comedy
EXCLUDE_NETWORKS = {"HBO", "Showtime", "Starz", "Cinemax", "FX", "Adult Swim", "Home Box Office", "FX Networks"}

# items removed on manual review (QID or feed text prefix -> reason)
MANUAL_EXCLUDE = {
    "Q2482795": "political rally (Rally to Restore Sanity and/or Fear)",
    "Q2121677": "crime/sting TV (To Catch a Predator)",
    "Q797907": "crime reality TV (Cops)",
    "Q834994": "album with a notorious slur-laden track (G N' R Lies)",
    "Q8850": "political TV show (Aló Presidente)",
    "Q680062": "mafia drama (La piovra)",
    "Q506605": "terrorism plot (Collateral Damage)",
    "Q2308037": "military drama (Army Wives)",
    "Q861337": "sexual-themed single (I'm a Slave 4 U)",
    "Q1954442": "horror RPG (Vampire: The Masquerade)",
    "Q223858": "satanic-panic album (The Number of the Beast)",
}

# Removed on the content audit of 2026-10-25 (titles as they appear in the
# line's “quotes”, per category). Grouped by reason so RC can put any back.
MANUAL_EXCLUDE_NAMES = {}
def _ex(cat, reason, names):
    for n in names.split("|"):
        n = n.strip()
        if n: MANUAL_EXCLUDE_NAMES[(cat, n)] = reason
_ex("Movies", "crime / violence / drugs / adult themes", """Alpha Dog|Albino Alligator|The Life of David Gale|8mm|
Crossing Over|Lock, Stock and Two Smoking Barrels|Bloodsport|Oldboy|Thief|Chapter 27|The United States of Leland|
Street Kings|Serial Mom|Lonely Hearts|Colors|The Punisher|The Substitute|The Basketball Diaries|Extreme Prejudice|Safe|
Crash|River's Edge|Class of 1999|Hick|Menace II Society|Mona Lisa|Kiss of the Spider Woman|Cop Land|Hard Target|
Rapid Fire|Showdown in Little Tokyo|Harley Davidson and the Marlboro Man|Fortress|City by the Sea|Without Evidence|
The Brave One|Clockers|Drive|Down by Law|Last Man Standing|D-Tox|Lolita|Little Children|Drugstore Cowboy|
Law Abiding Citizen|Sleepers|Changeling|Less than Zero|Bad Lieutenant: Port of Call New Orleans|The Road|
Road to Perdition|Kiss Kiss Bang Bang|Friends with Benefits|The Best Little Whorehouse in Texas|Coffee and Cigarettes|
Smoke|Next of Kin|Under Suspicion|World's Greatest Dad|Trespass|Gran Torino|American Beauty|Hollywoodland|Runaway Train""")
_ex("Movies", "politics / terrorism", "Missing|Bulworth|Air Force One")
_ex("Movies", "violence / gang crime (preview pass)", "Django Unchained|Boyz n the Hood|Wag the Dog|Evita|Extremely Loud & Incredibly Close")
_ex("Games", "gore (preview pass)", "Toribash")
_ex("TV", "crime / disaster / adult / military / politics / religion", """House of Saddam|Mayday|Seconds from Disaster|
Celebrity Deathmatch|Stripperella|Drawn Together|Trailer Park Boys|Misfits|Bangkok Hilton|Hustle|
Alarm for Cobra 11 – The Highway Police|WWE Tribute to the Troops|Blade: The Series|Spooks|24|Missing|Silent Witness|
Spiral|Wallander|Trapped|Polònia|TV Patrol|Life After People|My 600-lb Life|Don't Trust the B— in Apartment 23|
The Client List|Undressed|Lock n' Load with R. Lee Ermey|Destroyed in Seconds|I Shouldn't Be Alive|The Kennedys|
Prophet Joseph|Saka no Ue no Kumo|Empress Myeongseong|Borgia|Comedy Central Roast|Breakout Kings|The Unit|Hit & Miss|
La mujer de Judas|La Reina del Sur|Rafael Orozco, el ídolo|Black Mirror|Harper's Island|Survivors|Reno 911!|
Undercover|The Apprentice""")
_ex("Music", "death / violence / drugs / sex / politics in the title or theme", """Only Built 4 Cuban Linx...|
I Brought You My Bullets, You Brought Me Your Love|Three Cheers for Sweet Revenge|Always Outnumbered, Never Outgunned|
Chicken-n-Beer|Take This to Your Grave|Funeral|Deadache|Damnation|Evil Empire|Rage Against the Machine|Renegades|
Fear of a Blank Planet|LoveStoned|Mac & Devin Go to High School|"The Spaghetti Incident?"|The Evil That Men Do|
Nightmare|Relapse|Cleanin' Out My Closet|Beg for Mercy|Wait and Bleed|My Plague|Iowa|The Sickness|The Downward Spiral|
Year Zero|Call Me When You're Sober|The Ultimate Aural Orgasm|Wet|Jeanny|Russian Roulette|Youthanasia|
Woki mit deim Popo|Incesticide|Michael Jackson's This Is It|Michael|Lioness: Hidden Treasures|Rehab|Made in Heaven|
The Show Must Go On|We Are the World 25 for Haiti|Sandinista!|The Final Cut|It Was a Good Day|Don't Break the Oath|
Headless Cross|Cross Purposes|Shake That|R.I.P.|Man Down|Ship Arriving Too Late to Save a Drowning Witch|
To the Faithful Departed|United Abominations|Carolus Rex|Love the Way You Lie|Age Ain't Nothing but a Number|
Along Came a Spider|W.A.S.P.|Dr. Feelgood|Dreaming of You|Imaginary Diseases""")
_ex("Games", "war / crime / grim Mature-rated", """Disaster Report|Fear Effect|Soviet Strike|Urban Chaos: Riot Response|
Battlefield: Bad Company 2|Battlefield 3|Homefront|Operation Flashpoint: Dragon Rising|Sniper: Art of Victory|Sniper Elite|
Wolfenstein 3D|Call of Duty: Black Ops|Call of Duty: Black Ops II|Max Payne|Max Payne 3|Heavy Rain|Headhunter|
CSI: Dark Motives|24: The Game|L.A. Noire|Driver: Parallel Lines|No More Heroes|Escape from Bug Island|
Zero Escape: Virtue's Last Reward|Crysis 2|Just Cause 2|Syphon Filter|Syphon Filter 2|Dishonored|
Tom Clancy's Splinter Cell: Double Agent|Sin & Punishment: Star Successor""")
_ex("Movies", "crime / abuse / adult themes (second pass)", "Mysterious Skin|Veronica Guerin|Prizzi's Honor|An Innocent Man|Class")
_ex("TV", "adult / crime (second pass)", 'Ren & Stimpy "Adult Party Cartoon"|Vanished')
_ex("Music", "crime / illness / violence (second pass)", "Konvicted|Touch Me I'm Sick|9.0: Live")
_ex("Music", "death / violence (third pass)", "Temple of the Dog|Duality|Hells Bells|From the Muddy Banks of the Wishkah|Operation: Mindcrime")
_ex("TV", "horror (third pass)", "Don't Hug Me I'm Scared")
_ex("TV", "adult (third pass)", "When Heaven Burns|Geordie Shore")
_ex("Games", "violence / military (second pass)", "MadWorld|Syphon Filter: Dark Mirror|Tom Clancy's H.A.W.X 2")
# Wikipedia-feed lines removed or reworded on the same audit (regex, reason)
MANUAL_EXCLUDE_TEXT = [
    (r"first Pride Night", "social/political cause (RC: no politics)"),
    (r"^Jack Dorsey sent the first message", "same day as 'Twitter is founded'"),
]
# small rewordings so a happy line doesn't hint at a death
TEXT_REWRITE = [
    (r"their third and final studio album", "their third studio album"),
    (r"Invincible, his final studio album and the most expensive", "Invincible, the most expensive"),
]

# Wikipedia feed: keyword -> category. First match wins, order matters.
FEED_RULES = [
    ("Games", r"\b(video game|video-game|Nintendo|Sega|PlayStation|Xbox|Atari|Game Boy|arcade game|Pac-Man|Tetris|Mario|Sonic the Hedgehog|Zelda|Pokémon|Donkey Kong|Space Invaders|Famicom|Dreamcast|GameCube|Wii|Minecraft|game console)\b"),
    ("Toys", r"\b(toy|toys|Rubik|Lego|LEGO|Barbie|Cabbage Patch|Transformers|Tamagotchi|Furby|Beanie Babies|action figure|Hot Wheels|Teddy Ruxpin|My Little Pony|Care Bears|G\.I\. Joe|Tickle Me Elmo|board game|Trivial Pursuit|Pictionary)\b"),
    ("Sports", r"\b(Super Bowl|World Series|Stanley Cup|NBA|NFL|NHL|Major League Baseball|MLB|Olympic|Olympics|World Cup|Wimbledon|home run|touchdown|marathon|Tour de France|Grand Slam|Kentucky Derby|Masters Tournament|PGA|Formula One|Grand Prix|Indy|Iditarod|championships?|Champions League|cricket|Test cricket|rugby|football|soccer|tennis|golfer|golf|swimmer|sprint|decathlon|figure skat\w*|quarterback|pitcher|baseball|basketball|hockey|Wayne Gretzky|Michael Jordan|Cal Ripken|skateboard|X Games|WrestleMania|WWF|WWE|hat-trick|no-hitter|land speed record)\b"),
    ("Music", r"\b(album|song|concert|Live Aid|Grammy|Billboard|music video|singer|rapper|musician|Eurovision|hit single|charity single|debut single|single \"|rock band|pop band|tour|Beatles|Michael Jackson|Madonna)\b"),
    ("Movies", r"\b(film|movie|cinema|box office|Academy Award|Oscar|Star Wars|Pixar|blockbuster|Hollywood|Studio Ghibli)\b"),
    ("TV", r"\b(television|TV series|sitcom|episode|cartoon|animated series|Sesame Street|The Simpsons|Saturday Night Live|Muppets|Emmy|talk show|game show|Jeopardy|Wheel of Fortune|television network|Nickelodeon|Nicktoons|Cartoon Network|Disney Channel|CNN|ESPN|MTV|begins broadcasting|began broadcasting|starts broadcasting)\b"),
    ("Tech", r"\b(Apple|Macintosh|iMac|iPod|iPhone|iPad|iTunes|Microsoft|Windows|IBM|personal computer|Commodore|Walkman|compact disc|CD player|DVD|Blu-ray|World Wide Web|website|web browser|Google|Gmail|YouTube|Wikipedia|Amazon\.com|eBay|Netflix|Facebook|Twitter|smartphone|mobile phone|cellular network|GSM|text message|SMS|email|e-mail|Netscape|Mozilla|Firefox|Linux|Mosaic|BlackBerry|laptop|MP3|Intel|internet radio|geocaching|Android)\b"),
]
# Feed topics that are off-brief even when nothing negative is said: the space
# program (a government agency), records that aren't pop culture, theme parks,
# awards outside pop culture, crypto, art auctions, transport.
FEED_SKIP_RE = re.compile(r"(Space Shuttle|STS-\d|NASA|cosmonaut|astronaut|space station|spacecraft|space probe|"
                          r"Hubble|Voyager|SpaceShipOne|Ansari|Mir\b|Soyuz|Nobel|bitcoin|cryptocurrenc|auction|"
                          r"sculpture|TGV|Transrapid|railway|Metro\b|bridge|shipwreck|ocean liner|rain\b|"
                          r"Disneyland|Disney World|DisneySea|Downtown Disney|EPCOT|theme park|budget|deficit|"
                          r"governor|gubernatorial|apartheid|G8|climate|North Korea|boxing|heavyweight|"
                          r"posthumous|psychological horror|horror film|South Park|hijack|cheated|malfunction|"
                          r"indecency|Barry Bonds|Moscow Olympics|South Africa rugby union tour|Cosby|"
                          r"for the last time|Department of Defense|classified mission|Mart[ií]\b|propaganda|Voice of America|"
                          r"Live Earth|Live 8)", re.I)
# feed lines whose keyword match lands in the wrong category
FEED_RECAT = [(re.compile(r"Apple Computer introduced the Macintosh"), "Tech")]
# region-specific release in the feed text with no region given: drop (we can't label it from the text)
FEED_UNLABELED_RELEASE = re.compile(r"^(Final Fantasy VII, the first video game|Sony released the PlayStation, the first)")
FEED_MUST = re.compile(r"\b(release\w*|launch\w*|debut\w*|premiere\w*|first|introduc\w*|unveil\w*|airs|aired|"
                       r"broadcast\w*|opens?|opened|win|wins|won|record|goes on sale|went on sale|on sale|publish\w*|"
                       r"becomes|became|sets|set|breaks|broke|number one|tops|topped|founded|launches|begins|began|"
                       r"shows|showed|presents|presented|completes|completed|reaches|reached)\b", re.I)

# ------------------------------------------------------- curated lists
# (enwiki title, category, text template). {name} = Wikipedia title without (qualifier).
CONSOLES = """Nintendo Entertainment System|Super Nintendo Entertainment System|Nintendo 64|GameCube|Wii|
Game Boy|Game Boy Color|Game Boy Advance|Game Boy Advance SP|Nintendo DS|Nintendo DSi|Nintendo 3DS|Virtual Boy|Wii U|
PlayStation (console)|PlayStation 2|PlayStation 3|PlayStation Portable|PlayStation Vita|
Xbox (console)|Xbox 360|Kinect|Sega Genesis|Sega Saturn|Dreamcast|Sega Master System|Game Gear|Sega CD|32X|
Atari 7800|Atari Lynx|Atari Jaguar|TurboGrafx-16|Neo Geo (system)|3DO Interactive Multiplayer|Nintendo Switch|
ColecoVision|Intellivision|Vectrex|Atari 5200|Nokia N-Gage|Famicom Disk System|Pokémon Mini|WonderSwan|
Sega Nomad|Game & Watch|Super Game Boy|Nintendo 64DD|Microvision|Neo Geo Pocket|Xbox One|PlayStation 4"""
TECH = """Macintosh 128K|IBM Personal Computer|Commodore 64|Amiga|Apple IIc|Apple IIGS|ZX Spectrum|Amstrad CPC|
Windows 1.0|Windows 3.0|Windows 95|Windows 98|Windows XP|Windows Vista|Windows 7|Mac OS X|Mac OS X 10.0|
iPod|iPod (1st generation)|iPod Mini|iPod Nano|iPod Shuffle|iPod Touch|iPhone (1st generation)|iPhone 3G|iPhone 4|iPad (1st generation)|
iMac G3|iBook|PowerBook|MacBook Air|Apple Newton|PalmPilot|BlackBerry|Motorola DynaTAC|Motorola StarTAC|Motorola Razr|Nokia 3310|
Walkman|Discman|Compact disc|DVD|Blu-ray|HD DVD|MiniDisc|TiVo|Netscape Navigator|Internet Explorer|Firefox|Google Chrome|
Google Search|YouTube|Wikipedia|Facebook|Twitter|Myspace|Napster|iTunes|iTunes Store|Gmail|Google Maps|Google Earth|Amazon Kindle|
Kindle (Amazon)|Nintendo Power|Tamagotchi|Furby|Sony Mavica|Palm Pre|Android (operating system)|App Store (Apple)|Skype|AOL Instant Messenger|ICQ|
Hubble Space Telescope|Space Shuttle Columbia|Netflix|Pixar|Linux|Microsoft Office|Super Mario Bros.|Xbox Live|PlayStation Network|Steam (service)|
Game Boy Camera|Game Boy Printer|Zune|Roomba|Segway|Flip Video|Sega Channel|Nintendo Wi-Fi Connection|SNES Mouse|Power Glove|R.O.B."""
TOYS = """Cabbage Patch Kids|Teddy Ruxpin|Transformers|Masters of the Universe|My Little Pony|Care Bears|Furby|Tamagotchi|
Beanie Babies|Tickle Me Elmo|Bop It|Polly Pocket|Micro Machines|Pogs|Koosh ball|Talkboy|Lite-Brite|Rubik's Cube|
Laser Tag (toy)|Speak & Spell (toy)|Simon (game)|Teenage Mutant Ninja Turtles (toy line)|Pound Puppies|Glo Worm|
Zhu Zhu Pets|Bratz|Webkinz|Yo-kai Watch|Lego Technic|Lego Star Wars|Lego Mindstorms|Bionicle|Nerf|Super Soaker|
Trivial Pursuit|Pictionary|Jenga|Mouse Trap (board game)|Hungry Hungry Hippos|Pokémon Trading Card Game|Magic: The Gathering|
Yu-Gi-Oh! Trading Card Game|Polly Pocket|Mighty Morphin Power Rangers (toy line)|Hot Wheels|Easy-Bake Oven|Etch A Sketch|
Game Boy|View-Master|Tonka|Nintendo Power|LeapPad|Tickle Me Elmo|Hatchimals|Bakugan|Beyblade|Heelys|Razor scooter|Gak|
Moon Shoes|Sky Dancers|Water Babies|Puppy Surprise|Lazer Tag"""
CHANNELS = """MTV|VH1|CNN|Cartoon Network|Disney Channel|Nick at Nite|Nick Jr. Channel|Comedy Central|Sci-Fi Channel|Syfy|
Fox Broadcasting Company|The WB|UPN|Food Network|Toon Disney|Boomerang (TV network)|G4 (American TV network)|ESPN2|
Nicktoons (American TV channel)|Adult Swim|Discovery Kids|Cartoon Network (UK and Ireland)|MuchMusic|YTV (Canadian TV channel)|
Animal Planet|The Hub (TV network)|TeenNick|Disney XD|Toonami|Fox Kids|Kids' WB|One Saturday Morning|Jetix|ABC Family|Fox Family Channel|
Game Show Network|TV Land|Nickelodeon Magic|Sky One|Channel 4|Five (TV channel)|CBBC|CITV|Trouble (TV channel)"""

NET_SHORT = {"Fox Broadcasting Company": "Fox", "American Broadcasting Company": "ABC",
             "National Broadcasting Company": "NBC", "CBS Broadcasting": "CBS", "Columbia Broadcasting System": "CBS",
             "Public Broadcasting Service": "PBS", "British Broadcasting Corporation": "the BBC", "Home Box Office": "HBO", "BBC One": "BBC One",
             "Nickelodeon (American TV channel)": "Nickelodeon", "The WB Television Network": "The WB",
             "United Paramount Network": "UPN", "Showtime Networks": "Showtime"}

# sports series pages, title pattern per year
SPORTS_SERIES = [
    ("{y} World Series", "series"), ("{y} NBA Finals", "series"), ("{y} Stanley Cup Final", "series"),
    ("{y} Stanley Cup Finals", "series"), ("{y} Summer Olympics", "olympics"), ("{y} Winter Olympics", "olympics"),
    ("{y} FIFA World Cup final", "game"), ("{y} NBA All-Star Game", "game"), ("{y} Major League Baseball All-Star Game", "game"),
    ("{y} Daytona 500", "game"), ("{y} Kentucky Derby", "game"), ("{y} Indianapolis 500", "game"),
("{y} Little League World Series", "series"),
]

# ---------------------------------------------------------------- http
def _cache_path(key):
    return os.path.join(CACHE, hashlib.sha1(key.encode()).hexdigest()[:20] + ".json")

def get_json(url, data=None, tries=5):
    key = url + (json.dumps(data, sort_keys=True) if data else "")
    p = _cache_path(key)
    if os.path.exists(p) and not REFRESH:
        with open(p) as f: return json.load(f)
    body = urllib.parse.urlencode(data).encode() if data else None
    for t in range(tries):
        try:
            req = urllib.request.Request(url, data=body, headers={**UA, "Accept": "application/json"})
            raw = urllib.request.urlopen(req, timeout=120).read().decode("utf-8", "replace")
            raw = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", raw)
            out = json.loads(raw)
            if isinstance(out, dict) and "error" in out:
                return out                      # API errors are never cached
            os.makedirs(CACHE, exist_ok=True)
            with open(p + ".tmp", "w") as f: json.dump(out, f)
            os.replace(p + ".tmp", p)
            return out
        except Exception as e:
            print("  retry", t, url[:90], e, file=sys.stderr)
            time.sleep(4 * (t + 1))
    raise RuntimeError("failed: " + url[:200])

def sparql(q):
    return get_json("https://query.wikidata.org/sparql", {"query": q, "format": "json"})["results"]["bindings"]

_ENT = {}
def _store(name):
    return os.path.join(CACHE, name)

def _load_store(name):
    p = _store(name)
    if os.path.exists(p) and not REFRESH:
        with open(p) as f: return json.load(f)
    return {}

def _save_store(name, d):
    os.makedirs(CACHE, exist_ok=True)
    with open(_store(name) + ".tmp", "w") as f: json.dump(d, f)
    os.replace(_store(name) + ".tmp", _store(name))

def wd_entities(qids, props="claims|sitelinks|labels"):
    """Per-QID cache, so adding candidates only fetches the new ones."""
    store_name = "entities2-" + props.replace("|", "-") + ".json"
    store = _load_store(store_name)
    need = sorted(set(q for q in qids if q not in store))
    def one(ch):
        url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(
            {"action": "wbgetentities", "ids": "|".join(ch), "props": props, "languages": "en|mul",
             "sitefilter": "enwiki", "format": "json"})
        r = get_json(url)
        if "error" in r and len(ch) > 1:          # one bad id spoils the batch: split it
            h = len(ch) // 2; out = one(ch[:h]); out.update(one(ch[h:])); return out
        return r.get("entities", {})
    chunks = [need[i:i+50] for i in range(0, len(need), 50)]
    with ThreadPoolExecutor(3) as ex:
        for r in ex.map(one, chunks):
            for q, e in r.items():
                if "missing" in e: continue
                e.pop("lastrevid", None); e.pop("modified", None)
                store[q] = e
    if need: _save_store(store_name, store)
    return {q: store[q] for q in set(qids) if q in store}

def wd_by_titles(titles):
    titles = sorted(set(titles)); out = {}
    for i in range(0, len(titles), 50):
        r = get_json("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(
            {"action": "wbgetentities", "sites": "enwiki", "titles": "|".join(titles[i:i+50]),
             "props": "claims|sitelinks|labels", "languages": "en", "sitefilter": "enwiki",
             "format": "json"}))
        for q, e in r.get("entities", {}).items():
            if q.startswith("Q"): out[q] = e
    return out

def enwiki_leads(titles):
    """title -> wikitext before the first section heading (infobox + lead).
    Per-title cache; batches of 50, gently, because Wikipedia rate-limits big content reads."""
    store = _load_store("leads.json")
    need = sorted(set(t for t in titles if t not in store))
    for i in range(0, len(need), 50):
        ch = need[i:i+50]
        r = get_json("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
            {"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
             "titles": "|".join(ch), "redirects": "1", "format": "json", "formatversion": "2"}))
        q = r.get("query", {}); alias = {}
        for n in q.get("normalized", []) + q.get("redirects", []): alias[n["to"]] = n["from"]
        for pg in q.get("pages", []):
            revs = pg.get("revisions")
            if not revs: continue
            txt = revs[0]["slots"]["main"]["content"]
            m = re.search(r"\n==[^=]", txt)
            lead = txt[:m.start()] if m else txt[:20000]
            t = pg["title"]; store[t] = lead
            while t in alias: t = alias[t]; store[t] = lead
        for t in ch: store.setdefault(t, "")
        if i % 1000 == 0: _save_store("leads.json", store)
        time.sleep(1.0)
    if need: _save_store("leads.json", store)
    return {t: store.get(t, "") for t in titles}

# ------------------------------------------------------------ wikidata helpers
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
          "September", "October", "November", "December"]

def claims(e, p):
    return [s for s in e.get("claims", {}).get(p, []) if s.get("rank") != "deprecated"]

def ids(e, p):
    out = []
    for s in claims(e, p):
        v = s["mainsnak"].get("datavalue", {}).get("value")
        if isinstance(v, dict) and "id" in v: out.append(v["id"])
    return out

def qual_ids(s, p):
    return [q["datavalue"]["value"]["id"] for q in s.get("qualifiers", {}).get(p, [])
            if "datavalue" in q and isinstance(q["datavalue"]["value"], dict) and "id" in q["datavalue"]["value"]]

def dates(e, p):
    """[(y,m,d,precision,statement)]"""
    out = []
    for s in claims(e, p):
        v = s["mainsnak"].get("datavalue", {}).get("value")
        if not isinstance(v, dict) or "time" not in v: continue
        m = re.match(r"\+(\d{4})-(\d\d)-(\d\d)", v["time"])
        if not m: continue
        out.append((int(m[1]), int(m[2]), int(m[3]), v.get("precision"), s))
    return out

def enwiki(e):
    return e.get("sitelinks", {}).get("enwiki", {}).get("title")

def nlinks(e):
    return len(e.get("sitelinks", {})) if "enwiki" not in e.get("sitelinks", {}) or len(e["sitelinks"]) > 1 else e.get("_links", 1)

def label(e):
    # Wikidata now keeps many names under the language-neutral "mul" label only
    L = e.get("labels", {})
    return (L.get("en") or L.get("mul") or {}).get("value")

def wp_url(title):
    return "https://en.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_"), safe="()_,'!-.:")

# --------------------------------------------------------- date cross-check
def date_in_text(txt, y, m, d):
    if not txt: return False
    M = MONTHS[m-1]; Ms = M[:3]
    pats = [rf"\b{M}\s+0?{d}(st|nd|rd|th)?,?\s+{y}\b", rf"\b0?{d}(st|nd|rd|th)?\s+{M},?\s+{y}\b",
            rf"\b{Ms}\.?\s+0?{d},?\s+{y}\b", rf"\b0?{d}\s+{Ms}\.?\s+{y}\b",
            rf"\b{y}-0?{m}-0?{d}\b", rf"\|\s*{y}\s*\|\s*0?{m}\s*\|\s*0?{d}\s*(\||\}})"]
    return any(re.search(p, txt, re.I) for p in pats)

def date_range_end_in_text(txt, y, m, d):
    """for series pages: 'October 18–27' or 'October 18 – November 2' with year somewhere"""
    if not txt or str(y) not in txt: return False
    if date_in_text(txt, y, m, d): return True
    M = MONTHS[m-1]
    pats = [rf"\b{M}\s+\d{{1,2}}\s*(–|-|&ndash;|{{{{ndash}}}}|to)\s*0?{d}\b",
            rf"(–|-|&ndash;|{{{{ndash}}}}|to)\s*{M}\s+0?{d}\b",
            rf"\b{M}\s+0?{d}\s*,\s*{y}"]
    return any(re.search(p, txt) for p in pats)

def infobox_artist(txt):
    """The credited artist, exactly as the Wikipedia infobox gives it."""
    m = re.search(r"\|\s*artist\s*=\s*([^\n]+)", txt or "")
    if not m: return None
    a = m.group(1)
    a = re.sub(r"<ref[^>]*/>|<ref.*?</ref>|<!--.*?-->", "", a)
    a = re.sub(r"\{\{\s*(?:nowrap|nobr)\s*\|([^}]*)\}\}", r"\1", a, flags=re.I)
    if "{{" in a: return None                     # hlist etc.: too many artists to phrase cleanly
    a = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", a)
    a = re.sub(r"'{2,3}|<[^>]+>", "", a)
    a = html.unescape(a).strip().rstrip("|").strip()
    if not a or len(a) > 60 or "|" in a or "=" in a or "," in a: return None
    return a

def release_field(txt):
    m = re.search(r"\|\s*(released|release_date|release date)\s*=(.*?)(\n\s*\||\n\}\})", txt or "", re.S | re.I)
    return m.group(2) if m else ""

def count_dates(s):
    found = set()
    for mi, M in enumerate(MONTHS):
        for mm in re.finditer(rf"\b{M}\s+(\d{{1,2}}),?\s+(\d{{4}})|\b(\d{{1,2}})\s+{M},?\s+(\d{{4}})", s):
            dd = mm.group(1) or mm.group(3); yy = mm.group(2) or mm.group(4)
            found.add((yy, mi, int(dd)))
    for mm in re.finditer(r"\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})", s):
        found.add((mm.group(1), int(mm.group(2)) - 1, int(mm.group(3))))
    return len(found)

# ------------------------------------------------------------------ cleanup
def clean_title(t):
    return re.sub(r"\s*\([^)]*\)$", "", t).strip()

def blocked(*texts, feed=False):
    for t in texts:
        if not t: continue
        s = ALLOW_OVERRIDE.sub(" ", t)
        m = BLOCK_RE.search(s) or (feed and FEED_BLOCK_RE.search(s))
        if m: return m.group(0)
    return None

def strip_wiki_html(s):
    s = re.sub(r"<[^>]+>", "", s); s = html.unescape(s).replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()

def first_sentence(s):
    s = s.strip()
    return s

# ---------------------------------------------------------------- collectors
def year_chunks(step=3):
    y = MIN_YEAR
    while y <= MAX_YEAR:
        yield y, min(y + step, MAX_YEAR + 1); y += step
    yield MAX_YEAR + 1, BACKFILL_MAX_YEAR + 1

def candidates_sparql(template, step=3):
    out = {}
    for a, b in year_chunks(step):
        q = template.replace("%FROM%", f'"{a}-01-01T00:00:00Z"^^xsd:dateTime').replace("%TO%", f'"{b}-01-01T00:00:00Z"^^xsd:dateTime')
        for r in sparql(q):
            out[r["item"]["value"].rsplit("/", 1)[1]] = int(r["links"]["value"])
    return out

Q_FILMS = """SELECT DISTINCT ?item ?links WHERE { ?item wdt:P31 wd:Q11424; wikibase:sitelinks ?links . FILTER(?links >= 15)
 ?item p:P577 ?st . ?st psv:P577 [ wikibase:timeValue ?date; wikibase:timePrecision 11 ] . ?st pq:P291 wd:Q30 .
 FILTER(?date >= %FROM% && ?date < %TO%) }"""
Q_GAMES = """SELECT DISTINCT ?item ?links WHERE { ?item wdt:P31 wd:Q7889; wikibase:sitelinks ?links . FILTER(?links >= 5)
 ?item p:P577 ?st . ?st psv:P577 [ wikibase:timeValue ?date; wikibase:timePrecision 11 ] . ?st pq:P291 ?pl .
 VALUES ?pl { wd:Q49 wd:Q30 } FILTER(?date >= %FROM% && ?date < %TO%) }"""
Q_MUSIC = """SELECT DISTINCT ?item ?links WHERE { VALUES ?cls { wd:Q482994 wd:Q208569 wd:Q134556 wd:Q4176708 wd:Q209939 wd:Q222910 }
 ?item wdt:P31 ?cls; wikibase:sitelinks ?links . FILTER(?links >= 10)
 ?item p:P577/psv:P577 [ wikibase:timeValue ?date; wikibase:timePrecision 11 ] . FILTER(?date >= %FROM% && ?date < %TO%) }"""
Q_TV = """SELECT DISTINCT ?item ?links WHERE { VALUES ?cls { wd:Q5398426 wd:Q117467246 wd:Q581714 wd:Q15416 wd:Q526877 wd:Q1366112 }
 ?item wdt:P31 ?cls; wikibase:sitelinks ?links . FILTER(?links >= 8)
 ?item p:P580/psv:P580 [ wikibase:timeValue ?date; wikibase:timePrecision 11 ] . FILTER(?date >= %FROM% && ?date < %TO%) }"""
Q_SUPERBOWL = """SELECT DISTINCT ?item ?links WHERE { ?item wdt:P31 wd:Q32096; wikibase:sitelinks ?links . }"""
Q_WRESTLEMANIA = """SELECT DISTINCT ?item ?links WHERE { ?item wdt:P179 wd:Q35516; wikibase:sitelinks ?links . }"""

def main():
    os.makedirs(OUT, exist_ok=True)
    items = []          # dicts: y m d cat text src qid links origin
    dropped = Counter(); drop_examples = defaultdict(list); drop_all = []
    def drop(reason, what):
        dropped[reason] += 1; drop_all.append((reason, what))
        if len(drop_examples[reason]) < 12: drop_examples[reason].append(what)

    print("SPARQL candidates ...")
    films = candidates_sparql(Q_FILMS); print(" films", len(films))
    games = candidates_sparql(Q_GAMES, 4); print(" games", len(games))
    music = candidates_sparql(Q_MUSIC, 2); print(" music", len(music))
    tv = candidates_sparql(Q_TV, 3); print(" tv", len(tv))
    sb = {r["item"]["value"].rsplit("/", 1)[1]: int(r["links"]["value"]) for r in sparql(Q_SUPERBOWL)}
    wm = {r["item"]["value"].rsplit("/", 1)[1]: int(r["links"]["value"]) for r in sparql(Q_WRESTLEMANIA)}
    print(" superbowls", len(sb), "wrestlemanias", len(wm))

    ents = wd_entities(list(films) + list(games) + list(music) + list(tv) + list(sb) + list(wm))
    links = {**films, **games, **music, **tv, **sb, **wm}
    for q, e in ents.items(): e["_links"] = links.get(q, 1)

    def splitlist(s): return [t.strip() for t in s.replace("\n", "").split("|") if t.strip()]
    sports_titles = [p.format(y=y) for y in range(MIN_YEAR, BACKFILL_MAX_YEAR + 1) for p, _ in SPORTS_SERIES]
    curated = wd_by_titles(splitlist(CONSOLES) + splitlist(TECH) + splitlist(TOYS) + splitlist(CHANNELS) + sports_titles)
    for q, e in curated.items():
        e["_links"] = 1; ents.setdefault(q, e)
    # sitelink counts for curated items
    for q, r in candidates_count(list(curated)).items():
        ents[q]["_links"] = r

    # labels for performers, networks, platforms, winners
    refs = set()
    for e in ents.values():
        for p in ("P175", "P449", "P1346", "P400", "P136", "P57", "P1657", "P921"):
            refs.update(ids(e, p))
        for _, _, _, _, s in dates(e, "P577"): refs.update(qual_ids(s, "P400"))
    lab = {q: label(e) for q, e in wd_entities(list(refs), "labels").items()}

    titles = [enwiki(e) for e in ents.values() if enwiki(e)]
    print("enwiki leads for", len(titles), "articles ...")
    leads = enwiki_leads(titles)

    cset = {k: set(v.replace("\n", "").split("|")) for k, v in
            {"CONSOLES": CONSOLES, "TECH": TECH, "TOYS": TOYS, "CHANNELS": CHANNELS}.items()}
    cset = {k: {t.strip() for t in v if t.strip()} for k, v in cset.items()}

    def add(e, y, m, d, cat, text, check="date"):
        text = re.sub(r"\.\.$", ".", text)          # "on Disney Jr.." -> "on Disney Jr."
        t = enwiki(e); lead = leads.get(t, "")
        if not (MIN_YEAR <= y <= BACKFILL_MAX_YEAR): return drop("out of year range", text)
        ok = date_in_text(lead, y, m, d) if check == "date" else date_range_end_in_text(lead, y, m, d)
        if not ok: return drop("date not confirmed on Wikipedia", f"{y}-{m:02}-{d:02} {text}")
        b = blocked(text, t, label(e))
        if b: return drop("blocklist word", f"{text} [{b}]")
        g = [lab.get(x) for x in ids(e, "P136") if lab.get(x) and EXCLUDE_GENRE_RE.search(lab.get(x))]
        if g: return drop("excluded genre", f"{text} [{g[0]}]")
        subj = [lab.get(x) for x in ids(e, "P921") if lab.get(x) and EXCLUDE_SUBJECT_RE.search(lab.get(x))]
        qn = re.search(r"“(.+)”", text)
        if subj and not (qn and qn.group(1) in SUBJECT_OK): return drop("excluded main subject", f"{text} [{subj[0]}]")
        names = [lab.get(x) or "" for x in ids(e, "P175") + ids(e, "P57")]
        if any(EXCLUDE_PEOPLE_RE.search(n) for n in names) or EXCLUDE_PEOPLE_RE.search(text) \
                or EXCLUDE_TITLE_RE.search(text):
            return drop("excluded person", text)
        if cat == "TV" and any(lab.get(x) in EXCLUDE_NETWORKS for x in ids(e, "P449")):
            return drop("adult TV network", text)
        if EXCLUDE_TITLE_FRAGMENTS.search(text): return drop("excluded title", text)
        rating = [lab.get(x) for x in ids(e, "P1657")]
        if any(r and re.search(r"NC-17|\bX\b", r) for r in rating): return drop("excluded rating", text)
        if e["id"] in MANUAL_EXCLUDE: return drop("manual review", f"{text} ({MANUAL_EXCLUDE[e['id']]})")
        qm = re.search(r"“(.+)”", text)
        if qm and (cat, qm.group(1)) in MANUAL_EXCLUDE_NAMES:
            return drop("manual review", f"{text} ({MANUAL_EXCLUDE_NAMES[(cat, qm.group(1))]})")
        items.append({"y": y, "m": m, "d": d, "cat": cat, "text": text, "src": wp_url(t),
                      "qid": e["id"], "links": e.get("_links", 1), "origin": "wikidata"})

    REG = {"Q49": "North America", "Q30": "North America", "Q17": "Japan", "Q46": "Europe", "Q145": "the UK", "Q408": "Australia"}
    for q, e in ents.items():
        t = enwiki(e)
        if not t: continue
        name = clean_title(t); cls = set(ids(e, "P31"))
        if q in films:
            for y, m, d, pr, s in dates(e, "P577"):
                if pr == 11 and "Q30" in qual_ids(s, "P291"):
                    add(e, y, m, d, "Movies", f"“{name}” is released in US theaters."); break
        elif q in games:
            done = False
            for y, m, d, pr, s in sorted(dates(e, "P577"), key=lambda x: x[:3]):
                pl = qual_ids(s, "P291")
                if pr == 11 and ("Q49" in pl or "Q30" in pl) and not done:
                    plat = [lab.get(x) for x in qual_ids(s, "P400") if lab.get(x)]
                    pc = {"Microsoft Windows": "Windows", "MS-DOS": "MS-DOS", "macOS": "Mac", "classic Mac OS": "Mac",
                          "Linux": "Linux", "Amiga": "the Amiga", "Commodore 64": "the Commodore 64"}
                    plat_s = (f" for {pc[plat[0]]}" if plat[0] in pc else f" for the {plat[0]}") if len(plat) == 1 else ""
                    add(e, y, m, d, "Games", f"“{name}” is released in North America{plat_s}."); done = True
        elif q in music:
            ds = {(y, m, d) for y, m, d, pr, s in dates(e, "P577")}
            day = [(y, m, d) for y, m, d, pr, s in dates(e, "P577") if pr == 11]
            if len(ds) != 1 or len(day) != 1:
                drop("music: more than one release date", name); continue
            if count_dates(release_field(leads.get(t, ""))) > 1:
                drop("music: regional dates in infobox", name); continue
            art = infobox_artist(leads.get(t, ""))
            one = [lab.get(x) for x in ids(e, "P175") if lab.get(x)]
            perf = [art] if art else one[:1] if len(ids(e, "P175")) == 1 and "," not in one[0] else []
            kind = "single" if "Q134556" in cls else "soundtrack album" if "Q4176708" in cls else "live album" if "Q209939" in cls else "album"
            if not perf: drop("music: no performer", name); continue
            p = perf[0]
            poss = p + ("’" if p.endswith("s") else "’s")
            y, m, d = day[0]
            line = f"{poss} {kind} “{name}” is released."
            add(e, y, m, d, "Music", line[0].upper() + line[1:])
        elif q in tv:
            day = [(y, m, d) for y, m, d, pr, s in dates(e, "P580") if pr == 11]
            if len(day) != 1: continue
            net = [lab.get(x) for x in ids(e, "P449") if lab.get(x)]
            net_s = f" on {NET_SHORT.get(net[0], net[0])}" if len(net) == 1 else ""
            if net and net[0] == "broadcast syndication": net_s = " in syndication"
            y, m, d = day[0]
            add(e, y, m, d, "TV", f"“{name}” premieres{net_s}.")
        elif q in sb:
            for y, m, d, pr, s in dates(e, "P585"):
                w = [lab.get(x) for x in ids(e, "P1346") if lab.get(x)]
                if pr == 11 and len(w) == 1:
                    add(e, y, m, d, "Sports", f"The {w[0]} win {name}.")
        elif q in wm:
            for y, m, d, pr, s in dates(e, "P585"):
                if pr == 11: add(e, y, m, d, "Sports", f"{name} is held.")
        elif t in cset["CONSOLES"]:
            for y, m, d, pr, s in dates(e, "P577"):
                pl = qual_ids(s, "P291"); reg = [REG[x] for x in pl if x in REG]
                if pr == 11 and len(set(reg)) == 1:
                    add(e, y, m, d, "Games", f"The {name} launches in {reg[0]}.")
        elif t in cset["TECH"] or t in cset["TOYS"]:
            cat = "Tech" if t in cset["TECH"] else "Toys"
            dd = [x for x in dates(e, "P577") if x[3] == 11 and not qual_ids(x[4], "P291")] or \
                 [x for x in dates(e, "P577") if x[3] == 11 and set(qual_ids(x[4], "P291")) & {"Q30", "Q49"}]
            reg = " in North America" if dd and qual_ids(dd[0][4], "P291") else ""
            # unqualified date on a Japanese product: that's its Japanese release
            if dd and not reg and ids(e, "P495") == ["Q17"]: reg = " in Japan"
            # P571 (inception) is too loose to call a release date, so only P577 counts
            if len({x[:3] for x in dd}) == 1:
                y, m, d = dd[0][:3]
                add(e, y, m, d, cat, f"{('The ' if cat == 'Tech' and needs_the(name) else '')}{name} is released{reg}.")
        elif t in cset["CHANNELS"]:
            dd = [x for x in dates(e, "P571") + dates(e, "P580") if x[3] == 11]
            if len({x[:3] for x in dd}) == 1:
                y, m, d = dd[0][:3]
                add(e, y, m, d, "TV", f"{name} launches on TV." if "Channel" not in name else f"{name} launches.")
        else:
            for pat, kind in SPORTS_SERIES:
                mm = re.fullmatch(pat.replace("{y}", r"(\d{4})"), t)
                if not mm: continue
                if kind == "series":
                    w = [lab.get(x) for x in ids(e, "P1346") if lab.get(x)]
                    end = [x for x in dates(e, "P582") if x[3] == 11]
                    if len(w) == 1 and len(end) == 1:
                        y, m, d = end[0][:3]
                        if w[0] not in leads.get(t, ""): drop("sports: winner not confirmed", t); break
                        add(e, y, m, d, "Sports", f"The {w[0]} win the {t}.", check="range")
                elif kind == "olympics":
                    st = [x for x in dates(e, "P580") if x[3] == 11]
                    if len(st) == 1:
                        y, m, d = st[0][:3]
                        if t == "1980 Summer Olympics": drop("manual review", t + " (boycott politics)"); break
                        add(e, y, m, d, "Sports", f"The {t} open.", check="range")
                else:
                    st = [x for x in dates(e, "P585") + dates(e, "P580") if x[3] == 11]
                    w = [lab.get(x) for x in ids(e, "P1346") if lab.get(x)]
                    if len({x[:3] for x in st}) == 1:
                        y, m, d = st[0][:3]
                        txt = f"{w[0]} wins the {t}." if len(w) == 1 and w[0] in leads.get(t, "") else f"The {t} is held."
                        add(e, y, m, d, "Sports", txt)
                break

    # ------------------------------------------------ Wikipedia feed events
    print("Wikipedia On this day feed ...")
    feed_items = 0
    for i in range(366):
        dt = datetime.date(2024, 1, 1) + datetime.timedelta(i)
        f = get_json(f"https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/{dt:%m}/{dt:%d}")
        seen = set()
        for kind in ("events", "selected"):
            for ev in f.get(kind, []):
                y = ev.get("year"); text = strip_wiki_html(ev.get("text", ""))
                text = re.sub(r"\s*\((?:[\w ,]+ )?pictured[^)]*\)", "", text).strip()
                pages = ev.get("pages", [])
                topic = pages[0].get("title") if pages else text
                if not isinstance(y, int) or (y, text) in seen or (y, topic) in seen: continue
                seen.add((y, text)); seen.add((y, topic))
                if not (MIN_YEAR <= y <= BACKFILL_MAX_YEAR): continue
                cat = next((c for c, rx in FEED_RULES if re.search(rx, text)), None)
                cat = next((c for rx, c in FEED_RECAT if rx.search(text)), cat)
                if not cat: continue
                if not FEED_MUST.search(text): drop("feed: no release/launch/win verb", f"{y} {text[:90]}"); continue
                b = blocked(text, feed=True)
                if b: drop("feed: blocklist word", f"{y} {text[:110]} [{b}]"); continue
                sk = FEED_SKIP_RE.search(text)
                if sk: drop("feed: off-brief topic", f"{y} {text[:110]} [{sk.group(0)}]"); continue
                if EXCLUDE_TITLE_FRAGMENTS.search(text) or EXCLUDE_PEOPLE_RE.search(text):
                    drop("feed: excluded title/person", f"{y} {text[:90]}"); continue
                for rx, rep in TEXT_REWRITE: text = re.sub(rx, rep, text)
                if FEED_UNLABELED_RELEASE.search(text): drop("feed: regional date not labeled", f"{y} {text[:90]}"); continue
                src = pages[0]["content_urls"]["desktop"]["page"] if pages else \
                      f"https://en.wikipedia.org/wiki/{MONTHS[dt.month-1]}_{dt.day}"
                if pages and pages[0].get("titles", {}).get("normalized") and \
                        str(y) == pages[0]["titles"]["normalized"][:4]:
                    src = pages[1]["content_urls"]["desktop"]["page"] if len(pages) > 1 else src
                items.append({"y": y, "m": dt.month, "d": dt.day, "cat": cat, "text": text, "src": src,
                              "qid": None, "links": 200, "origin": "feed"})
                feed_items += 1
    print(" feed items kept", feed_items)

    # manual text excludes
    keep = []
    for it in items:
        if any(re.search(rx, it["text"]) for rx, _ in MANUAL_EXCLUDE_TEXT):
            drop("manual review", it["text"]); continue
        keep.append(it)
    items = keep

    # ------------------------------------------------ choose per day
    by_day = defaultdict(list)
    seenq = set()
    for it in items:
        k = (it["m"], it["d"])
        by_day[k].append(it)
    out = defaultdict(dict); stats = Counter(); per_day = {}; review = []
    for i in range(366):
        dt = datetime.date(2024, 1, 1) + datetime.timedelta(i)
        # text as the last key so the pick is the same run to run (sets don't keep order)
        pool = sorted(by_day.get((dt.month, dt.day), []), key=lambda x: (-(x["origin"] == "feed"), -x["links"], x["y"], x["text"]))
        chosen = []; cc = Counter(); texts = set()
        for it in pool:
            if it["y"] > MAX_YEAR: continue
            if it["text"] in texts or any(same_story(it, c) for c in chosen): continue
            if it["qid"] and any(c["qid"] == it["qid"] for c in chosen): continue
            if cc[it["cat"]] >= CAT_CAP[it["cat"]]: continue
            chosen.append(it); cc[it["cat"]] += 1; texts.add(it["text"])
            if len(chosen) >= PER_DAY_MAX: break
        # backfill past the soft caps if the day is thin
        if len(chosen) < 5:
            # past the soft caps first, then (only if still short) a later year
            for it in sorted(pool, key=lambda x: x["y"] > MAX_YEAR):  # stable, so pool order holds
                if it in chosen or it["text"] in texts or any(same_story(it, c) for c in chosen): continue
                if it["qid"] and any(c["qid"] == it["qid"] for c in chosen): continue
                chosen.append(it); texts.add(it["text"])
                if len(chosen) >= 6: break
        # within a category, most notable first (the home teaser takes the first);
        # the page itself re-sorts by year
        chosen.sort(key=lambda x: (CATS.index(x["cat"]), -x["links"], x["y"], x["text"]))
        key = f"{dt:%m}-{dt:%d}"
        out[f"{dt:%m}"][key] = [{"y": c["y"], "cat": c["cat"], "text": c["text"], "src": c["src"]} for c in chosen]
        per_day[key] = len(chosen)
        for c in chosen: stats[c["cat"]] += 1
        review.extend((key, c) for c in chosen)

    # everything chosen, one per line, for manual review
    with open(os.path.join(CACHE, "chosen.tsv"), "w") as f:
        for k, c in review:
            f.write("\t".join([k, str(c["y"]), c["cat"], c["origin"], c["qid"] or "-", c["text"], c["src"]]) + "\n")
    gen = datetime.date.today().isoformat()
    for mo, days in out.items():
        with open(os.path.join(OUT, f"{mo}.json"), "w") as f:
            json.dump({"generated": gen, "days": days}, f, ensure_ascii=False, separators=(",", ":"))
    report = {"generated": gen, "total": sum(per_day.values()), "per_category": dict(stats),
              "min_day": min(per_day.items(), key=lambda x: x[1]), "max_day": max(per_day.items(), key=lambda x: x[1]),
              "days_under_5": sorted(k for k, v in per_day.items() if v < 5),
              "dropped": dict(dropped), "drop_examples": drop_examples, "candidates": len(items)}
    # every dropped candidate with its reason, for checking the filters
    with open(os.path.join(CACHE, "dropped.tsv"), "w") as f:
        for reason, what in drop_all: f.write(f"{reason}\t{what}\n")
    with open(os.path.join(CACHE, "report.json"), "w") as f: json.dump(report, f, indent=1, ensure_ascii=False)
    print(json.dumps({k: v for k, v in report.items() if k != "drop_examples"}, indent=1), flush=True)

_WORD = re.compile(r"[a-z0-9]+")
_STOP = set("the a an of in on at to for and is was are were by with from as its it his her their first".split())
def _words(t): return {w for w in _WORD.findall(t.lower()) if w not in _STOP and len(w) > 2}

def same_story(a, b):
    """Two lines about the same thing on the same day and year (feed duplicates, or a
    feed line and a Wikidata line for the same release)."""
    if a["y"] != b["y"]: return False
    # two sports lines on the same day and year are the same game ("France win the
    # World Cup" from the feed and "The 1998 FIFA World Cup final is held")
    if a["cat"] == b["cat"] == "Sports": return True
    for x, z in ((a, b), (b, a)):
        m = re.search(r"“([^”]+)”", x["text"])
        if m and x["origin"] == "wikidata" and z["origin"] == "feed" and m.group(1).lower() in z["text"].lower():
            return True
    wa, wb = _words(a["text"]), _words(b["text"])
    lim = 0.4 if a["origin"] == b["origin"] == "feed" and a["cat"] == b["cat"] else 0.6
    return bool(wa and wb) and len(wa & wb) / min(len(wa), len(wb)) >= lim

def needs_the(name):
    return bool(re.match(r"(Macintosh|IBM|Commodore|Amiga|Apple|ZX|Amstrad|Motorola|Nokia|Sony|Palm|Game Boy|Super Game|Power Glove|SNES|Hubble|Space Shuttle|Segway|Flip|Roomba|Zune|Discman|Walkman)", name))

def candidates_count(qs):
    out = {}
    for i in range(0, len(qs), 200):
        vals = " ".join("wd:" + q for q in qs[i:i+200])
        for r in sparql(f"SELECT ?item ?links WHERE {{ VALUES ?item {{ {vals} }} ?item wikibase:sitelinks ?links }}"):
            out[r["item"]["value"].rsplit("/", 1)[1]] = int(r["links"]["value"])
    return out

if __name__ == "__main__":
    main()
