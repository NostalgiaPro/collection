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
| Genre, release dates, ASMR videos | `GENRES`, `RELEASED`, `VIDEOS` in `index.html` |
| Review scores | `R` in `reviews.html` |
| Rankings | `LISTS` in `lists.html` |
| RC's X posts | `tools/data/x_posts.json` (id, created_at, text, reply_to) |

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

## `build_overrated.py`: the Overrated Game of the Day archive

```
python3 tools/build_overrated.py
```

Rewrites `overrated.html` from `tools/data/x_posts.json`: every post whose
first line starts "Overrated Game of the Day", newest first, with the date,
the post text as written, a link to the post on X, and the shelf photo and
game page when the game is on the shelf. Re-run after new posts are added
to the data file. It also adds `overrated.html` to `sitemap.xml` once.

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
* **Also on the shelf**: every game owned for that console, A to Z, minus
  the handful everybody names. That handful is never picked by taste:
  - where RC's thread names them ("No Sonic. No Streets of Rage. No Mortal
    Kombat."), it's exactly those (plus sequels starting with the name);
  - otherwise it's the 6 titles with the most user *ratings* (a count of
    how many people rated it, not the score) on Metacritic, from
    `tools/data/metacritic_counts.csv`. RC's own line: "Every console has
    the same six games people name."
  - consoles with 12 games or fewer just list everything.
  The page says which rule was used and lists what was left out.
