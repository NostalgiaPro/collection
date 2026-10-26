# tools/

Small Python scripts (standard library only, Python 3.9+) that build parts
of the site from the data that's already in it. Nothing here runs on the
live site; they write plain HTML files that get committed like everything
else. Run them from the repo root.

## Where the data comes from

| What | Where it lives |
|---|---|
| The shelf (every game, system, condition) | the `RAW` block in `index.html` |
| Beaten / no ending | `BEATEN` and `NO_ENDING` in `index.html` (the tick boxes save here) |
| 100% (every achievement) | `COMPLETED` in `index.html`, same format as `BEATEN`, edited by hand (Save leaves it alone) |
| Digital games beaten / 100% | `tools/data/digital_games.json` (title, platform, box art path + source, wiki link) |
| Genre, release dates, ASMR videos | `GENRES`, `RELEASED`, `VIDEOS` in `index.html` |
| Review scores | `R` in `reviews.html` |
| Rankings | `LISTS` in `lists.html` |
| RC's X posts | `tools/data/x_posts.json` (id, created_at, text, reply_to) |
| Rankings and overrated posts (word for word) | `tools/data/rankings.json` |

`tools/sitedata.py` reads all of these the same way the pages' own
JavaScript does (same slug code, same `nkey()`), so a generated page and
the shelf always agree on a game's photo filename.

## Settings: `tools/site_config.py`

* `IMAGE_EXT` / `IMAGE_FALLBACK_EXT`: photo file types, tried in that
  order (`.webp` first, then `.jpg`, then a stand-in cover in
  `images/placeholders/`). The first file that exists on disk is used, so
  re-run the builders after the photo files change.
* `SITE_URL`: used for share-card (`og:`) links and the sitemap.

## `build_game_pages.py`: one page per game

```
python3 tools/build_game_pages.py
```

Writes `game/<slug>.html` for every game on the shelf (`<slug>` is the same
name the photo uses, e.g. `game/contra-nes.html`) and rewrites the game
section of `sitemap.xml` (between the `game pages` comments; the rest of
the sitemap is left alone). Pages for games that left the shelf are
deleted. Each page has:

* title, system, condition, beaten status, genre, release date
* the photo (also used as the X / Facebook share picture; the site's
  `og-image.png` when there's no photo)
* the review score and a link to it, if reviewed
* every list on `lists.html` it's ranked on
* RC's X posts about it, quoted in full with the date and a link

**When to re-run:** after changing the shelf, ticking games beaten on the
site (the Save button only updates `index.html`), adding a review or list,
or adding posts to `tools/data/x_posts.json`. It's safe to run any time
and gives the same output for the same input.

### Which X posts count as "about" a game

`tools/postmatch.py` only looks at a post's subject lines, never a passing
mention: the first line (so "10. Final Fight" thread entries count), the
2nd/3rd line when it's written `Title (System)` or `A vs. B` (review,
Overrated, random game and matchup headers), and `Best:` / `Worst:` lines.
The title has to match a shelf title exactly (ignoring "The", punctuation
and `[edition]` tags) or one of the short names in `ALIASES`. Posts about
movies, music or TV and tier-list replies are skipped. If a post that
should show up doesn't, add its short name to `ALIASES`.

## `build_reviews.py`: Honest and Unpopular Reviews

```
python3 tools/build_reviews.py && python3 tools/build_game_pages.py
```

Builds `reviews.html` from `tools/data/reviews.json`: every numbered review
from X with the full post text (word for word), the score, the date
(America/Phoenix), the photo from the post (600px .webp in `images/reviews/`),
a "Read on X" link and links to the game pages. Newest first, with sorting by
number, rating or title and a console filter. It also rewrites `REVIEWED` in
`index.html` and `REVIEWS` in `lists.html` so the shelf and list badges match.
Game pages read the same JSON, so re-run `build_game_pages.py` after it.
Nothing is fetched.

## `build_digital.py`: digital games I've beaten

```
python3 tools/build_digital.py
```

Writes `digital.html` from `tools/data/digital_games.json`: a "100% complete"
group and a "Beaten" group, each game with the Xbox it was played on. Only
digital copies go here; a boxed game gets ticked on the shelf (and added to
`COMPLETED` for 100%), and the script warns if a game in the file is on the
shelf for the same Xbox. Each game shows its box art (`image`, a 300px
`.webp` in `images/digital/`, metadata stripped; `image_source` records the
page it came from) and its title links to `wiki` (Wikipedia, else
PCGamingWiki) in a new tab; games with no art get a plain stand-in tile.
Nothing is fetched by the script. Adds `digital.html` to `sitemap.xml` if
it's missing.

## `build_rankings.py`: the Rankings page

```
python3 tools/build_rankings.py
```

Writes `rankings.html` from `tools/data/rankings.json`: every ranking from
X as its own section, grouped by console, by series and topic, consoles,
by year (including the Best and Worst Games I Own series, 1985 to 2000),
tier lists and head-to-heads, with a jump list at the top. Names, order
and reasons are word for word. Each list links to its post, and each
thread entry to its own reply; the rest of an entry's post and a thread's
opening and closing posts fold away under it. The SNES top 10 shows the
May 2026 list with the January 2026 one folded under it. The SNES, PS1 and
N64 tier lists were only ever a picture, so the picture from the post is
shown (`images/rankings/`, .webp, no metadata); the NES one was typed out
in the replies and is shown as text. Only head-to-heads where the post
names the winner are in (plus the two-carts post, where the photo makes it
clear). A game links to its game page when it's on the shelf (strict
match, see the top of the script and `ALIASES` there), a console to its
console page. Adds `rankings.html` to `sitemap.xml` once. Nothing is
fetched.

## `build_overrated.py`: the Overrated page

```
python3 tools/build_overrated.py
```

Rewrites `overrated.html`: the Top 5 most overrated thread (from
`tools/data/rankings.json`), then every post from `tools/data/x_posts.json`
whose first line starts "Overrated Game of the Day", newest first, with the
date, the post text as written, a link to the post on X, and the shelf
photo and game page when the game is on the shelf (the Zelda one is marked
as the "Just kidding" fake-out it is), then the reviews where a game gets
called overrated (linked to `reviews.html`), then other posts. Re-run after
new posts are added to the data files. It also adds `overrated.html` to
`sitemap.xml` once.

## `build_console_pages.py`: a page per console

```
python3 tools/build_console_pages.py
python3 tools/build_game_pages.py     # refreshes sitemap.xml with the console pages
```

Writes `console/<id>.html` for every console with 6 or more games (linked
from each card on `consoles.html`). Each page has:

* RC's own "the library goes deeper" thread for that console, when there
  is one (Genesis, SNES, N64 so far): opening post, the ten games in his
  order with his text, closing post, all as posted and linked to X.
* The shelf, A to Z:
  - on a console with RC's thread, **Also on the shelf** is every game
    owned minus the "usual few" his thread names ("No Sonic. No Streets
    of Rage. No Mortal Kombat."), exactly those (plus sequels starting
    with the name), and minus the ten games already shown in the thread;
    the page lists what was left out;
  - on every other console, every game owned, A to Z, nothing left out.

## `import_x_rankings.py`: rankings from X onto `lists.html`

```
python3 tools/import_x_rankings.py new_posts.json      # add any new ranking posts
python3 tools/import_x_rankings.py --dry-run new.json  # show what would change, change nothing
python3 tools/build_game_pages.py                      # so game pages show the new list spots
```

`new_posts.json` is a list of RC's posts as `{"id", "created_at", "text"}`
(X API v2 shape is fine: `note_tweet.text` and `referenced_tweets` are
understood), plus `"reply_to"` for replies in his own threads. The posts
are merged into `tools/data/x_posts.json` (also used by the game pages), so
a thread posted across two runs still comes together.

New lists go into `lists.html` just above the
`imported from X by tools/import_x_rankings.py` line, with the post's date
and a "View on X" link. Names and order are kept exactly as posted.

It's safe to run every day. `tools/data/x_rankings_imported.json` holds:

* `imported`: post id -> title of every list it added
* `on_page`: post ids whose list was already on `lists.html` (skipped)
* `rejected`: post ids never to import (add one here after deleting a
  wrong list from `lists.html`, or it comes back on the next run)
* `titles`: post id -> a title to use instead of the one read off the post

The exact detection rules and the known ways it can get one wrong are at
the top of the script.

## `build_on_this_day.py`: the "On this day" pop-culture data

```
python3 tools/build_on_this_day.py            # uses tools/.otd-cache where it can
python3 tools/build_on_this_day.py --refresh  # downloads everything again
```

Writes `data/on-this-day/01.json` to `12.json` (one file per month, every
day of the year including Feb 29) for `onthisday.html` and the home-page
teaser. Pop culture only, 1980 on: films (US release), TV premieres and
channel launches, albums and singles, video games and consoles (North
American dates unless the line says otherwise), toys and card games, sports
moments and tech launches. Release dates come from Wikidata and are kept
only when the same date is in the lead or infobox of the English Wikipedia
article; a few lines come from Wikipedia's own *On this day* feed. Every
line links its Wikipedia article.

It's a family-friendly page, so the script drops anything negative or
political: a word blocklist, Wikidata genres (horror, war, crime thriller...)
and main subjects (serial killers, drugs, war, politics...), adult TV
networks, and a hand-picked list from a read-through (`MANUAL_EXCLUDE_NAMES`,
grouped by reason, so anything can be put back by deleting its name).
`tools/.otd-cache/chosen.tsv` lists every line chosen and
`tools/.otd-cache/dropped.tsv` every candidate dropped and why. The cache is
big (a few GB of raw downloads) and git-ignored.

## `build_otd_shelf.py`: "From my shelf" on the On this day page

```
python3 tools/build_otd_shelf.py
```

Writes `data/on-this-day/shelf.json`: for each day, the games on the shelf
released that day (from `RELEASED` in `index.html`; month-only dates are
skipped) and the consoles from `EVENTS` in `anniversaries.html`, each with
its game or console page and photo. Offline and quick, and
`build_game_pages.py` runs it at the end, so it keeps up with the shelf.
