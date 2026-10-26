#!/usr/bin/env python3
"""Build console/<id>.html: one page per console with what's on the shelf
past the handful of games everybody names for it.

    python3 tools/build_console_pages.py

Two parts per page:

1. RC's own "the library goes deeper" thread for that console, if he
   posted one (Genesis, SNES and N64 so far): the opening post, the ten
   games in his order with his text for each, and his closing post, all
   quoted as posted and linked to X. Found in tools/data/x_posts.json: a
   thread-starting post that mentions the "library" and has a run of
   "No <game>." sentences, for a system named in it.

2. "Also on the shelf": every game owned for the console except the
   "usual few", which are picked like this, without anyone's opinion:
     - if RC's thread names them ("No Sonic. No Streets of Rage. ..."),
       those are the ones (every shelf game whose title contains a name);
     - otherwise, the 6 games for that console with the most user ratings
       on Metacritic (tools/data/metacritic_counts.csv, a count of
       ratings, i.e. how many people bothered to rate it, not a score).
   Consoles with 12 games or fewer just list everything.
   The ten games from his thread are listed in part 1, not again in 2.

Consoles with fewer than 6 games on the shelf don't get a page. Safe to
re-run; re-run build_game_pages.py afterwards to refresh sitemap.xml."""
import csv, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitedata as sd
import site_config as cfg
from pagekit import head, nav, FOOT_JS, post_date, clean_post_text, post_block
from postmatch import Matcher, SYS_ALIASES

esc = sd.esc
OUT = os.path.join(sd.ROOT, "console")
COUNTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "metacritic_counts.csv")
MIN_GAMES = 6       # smaller consoles get no page
SMALL = 12          # at or below this, list everything
FAMOUS_N = 6        # "Every console has the same six games people name" (RC, Genesis thread)

CSS = """  .crumb{font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.08em;margin:30px 0 0}
  .crumb a{color:var(--dim);text-decoration:none}
  .crumb a:hover{color:var(--hot)}
  h1{color:var(--c)}
  .sec{font-family:"Silkscreen",monospace;font-size:11px;letter-spacing:.1em;color:var(--c);margin:44px 0 6px}
  .why{font-size:13.5px;color:var(--dim);margin:0 0 18px;max-width:70ch}
  .why a{color:var(--dim)}
  .pick{display:grid;grid-template-columns:110px 1fr;gap:18px;margin:0 0 16px;background:var(--bg2);
    border:1px solid var(--line);border-left:4px solid var(--c);border-radius:2px;padding:16px}
  .pick img,.pick .nopic{width:110px;border:1px solid var(--line);border-radius:2px;display:block}
  .pick .nopic{aspect-ratio:3/4;border-style:dashed;display:flex;align-items:center;justify-content:center;
    font-family:"Silkscreen",monospace;font-size:8px;color:var(--dim);text-align:center;padding:6px}
  .pick h3{font-family:"IBM Plex Sans Condensed",sans-serif;font-size:20px;margin:0 0 8px;line-height:1.25}
  .pick h3 a{color:inherit;text-decoration:none}
  .pick h3 a:hover{color:var(--c)}
  .pick h3 em{font-style:normal;font-family:"Press Start 2P",monospace;font-size:11px;color:var(--c);margin-right:10px}
  .pick blockquote{margin:0;white-space:pre-line;font-size:14.5px}
  .pick .meta{font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.05em;color:var(--dim);margin:12px 0 0;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .pick .meta a{color:var(--dim);text-decoration:none;border:1px solid var(--line);border-radius:2px;padding:4px 8px}
  .pick .meta a:hover{border-color:var(--hot);color:var(--hot)}
  .shelfgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:14px;margin:8px 0 0}
  .tile{text-decoration:none;color:inherit;display:block}
  .tile .im{aspect-ratio:3/4;background:var(--panel) center/cover no-repeat;border:1px solid var(--line);border-radius:2px;
    display:flex;align-items:center;justify-content:center;font-family:"Silkscreen",monospace;font-size:8px;color:var(--dim);
    text-align:center;padding:6px}
  .tile:hover .im{border-color:var(--c)}
  .tile span{display:block;font-size:12.5px;line-height:1.3;margin-top:6px}
  .famous{font-size:13.5px;color:var(--dim)}
  .famous a{color:var(--dim)}
  @media (max-width:600px){ .pick{grid-template-columns:80px 1fr} .pick img,.pick .nopic{width:80px}
    .shelfgrid{grid-template-columns:repeat(3,1fr)} }
"""

# Metacritic platform names -> shelf system names
MC_PLATFORM = {
    "NES/Famicom": "NES", "SNES/Super Famicom": "SNES", "Nintendo 64": "Nintendo 64",
    "Nintendo GameCube": "GameCube", "Nintendo Game Boy": "Game Boy", "Nintendo Game Boy Color": "Game Boy Color",
    "Nintendo DS": "Nintendo DS", "Nintendo 3DS": "Nintendo 3DS", "Nintendo Wii": "Wii",
    "Nintendo Switch": "Nintendo Switch", "Sony PlayStation": "PlayStation 1", "Sony PlayStation 2": "PlayStation 2",
    "Sony PlayStation 3": "PlayStation 3", "Sony PSP": "PSP", "Sony PlayStation 4": "PlayStation 4",
    "Microsoft Xbox": "Xbox", "Microsoft Xbox 360": "Xbox 360", "Microsoft Xbox One": "Xbox One",
    "Microsoft Xbox Series X": "Xbox Series X/S", "Sega Genesis/Mega Drive": "Sega Genesis",
    "Sega Dreamcast": "Sega Dreamcast", "Sega Saturn": "Sega Saturn", "PC": "PC",
}


def rating_counts():
    out = {}
    if not os.path.exists(COUNTS):
        return out
    for r in csv.DictReader(open(COUNTS, encoding="utf-8")):
        sys_ = MC_PLATFORM.get(r["platform"])
        try:
            n = int(r["user_ratings"] or 0)
        except ValueError:
            n = 0
        if sys_:
            out[(sd.nkey(r["title"]), sys_)] = n
    return out


def find_threads(posts, matcher):
    """{system name: thread dict} for RC's 'library goes deeper' threads."""
    by_parent = {}
    for p in posts:
        if p.get("reply_to"):
            by_parent.setdefault(p["reply_to"], []).append(p)
    threads = {}
    for p in posts:
        t = p["text"]
        if p.get("reply_to") or "library" not in t.lower():
            continue
        nos = re.findall(r"\bNo ([A-Z0-9][^.!?\n]{1,40})\.", t)
        if len(nos) < 2:
            continue
        head = " ".join(t.split("\n")[:3]).lower()
        named = [v for k, v in SYS_ALIASES.items() if re.search(r"\b" + re.escape(k) + r"\b", head)]
        named = [n for n in named if n not in ("NES",) or "snes" not in head]
        if not named:
            continue
        system = max(set(named), key=lambda n: len(n))  # most specific
        # walk the reply chain
        chain, cur = [], p["id"]
        while by_parent.get(cur):
            nxt = sorted(by_parent[cur], key=lambda x: x["created_at"])[0]
            chain.append(nxt); cur = nxt["id"]
        entries, closers = [], []
        for c in chain:
            lines = [l for l in c["text"].split("\n") if l.strip()]
            title = clean_post_text(lines[0]).strip()
            games = [g for g in matcher.match_piece(title) if g["system"] == system]
            if not games and len(lines) > 1:   # "The Strike Trilogy" / "Desert Strike, Jungle Strike, Urban Strike"
                for piece in lines[1].split(","):
                    games += [g for g in matcher.match_piece(piece.strip()) if g["system"] == system]
            if games or not closers and len(entries) < 10 and len(lines) > 1 and len(title) < 60 and not title.endswith("."):
                entries.append({"post": c, "title": title, "games": games})
            else:
                closers.append(c)
        if len(entries) >= 5:
            threads[system] = {"root": p, "nos": [n.strip() for n in nos], "entries": entries, "closers": closers}
    return threads


def tile(g):
    ph = sd.photo_for(g["slug"])
    im = (f'<div class="im" style="background-image:url(\'{esc(ph)}\')"></div>' if ph
          else f'<div class="im">No photo yet</div>')
    return f'<a class="tile" href="/game/{g["slug"]}.html">{im}<span>{esc(g["title"])}</span></a>'


def entry_text(post, title):
    """Post text minus the title line it starts with (shown as the heading)."""
    lines = post["text"].split("\n")
    i = next(i for i, l in enumerate(lines) if l.strip())
    return clean_post_text("\n".join(lines[i + 1:])).strip()


def build_page(sysinfo, games, thread, counts, matcher):
    name, sid, color = sysinfo["name"], sysinfo["id"], sysinfo["color"]
    n = len(games)
    h = []
    desc = f"All {n} {name} games in my collection" + (", and my thread on the rest of the {0} library.".format(name) if thread else ".")
    h.append(head(f"{name} | The Nostalgia Pro", desc, f"/console/{sid}.html", None, "980px", CSS))
    h.append(f'<body style="--c:{color}">\n<div class="wrap">\n\n<header>\n  <p class="wordmark"><a href="/index.html">The Nostalgia Pro</a></p>\n')
    h.append(nav("/consoles.html"))
    h.append(f'  <p class="crumb"><a href="/consoles.html">&larr; All consoles</a></p>\n')
    h.append(f'  <h1>{esc(name)}</h1>\n  <p class="standfirst">{n} games on the shelf. '
             f'<a href="/index.html#{sid}" style="color:inherit">See them all on the shelf</a>.</p>\n</header>\n')

    shown = set()
    if thread:
        root = thread["root"]
        h.append(f'\n<p class="sec">THE {esc(name.upper())} LIBRARY GOES DEEPER</p>\n')
        h.append('<p class="why">My thread from X, as posted.</p>\n')
        h.append(post_block(root, color) + "\n")
        for i, e in enumerate(thread["entries"], 1):
            p = e["post"]
            gs = e["games"]
            for g in gs:
                shown.add(g["slug"])
            ph = sd.photo_for(gs[0]["slug"]) if gs else None
            pic = (f'<img loading="lazy" src="{esc(ph)}" alt="{esc(gs[0]["title"])}">' if ph
                   else f'<div class="nopic">{"No photo yet" if gs else "Not on the shelf"}</div>')
            title = esc(e["title"])
            if len(gs) == 1:
                title = f'<a href="/game/{gs[0]["slug"]}.html">{title}</a>'
            h.append(f'<div class="pick"><div>{pic}</div><div>\n  <h3><em>{i}</em>{title}</h3>\n'
                     f'  <blockquote>{esc(entry_text(p, e["title"]))}</blockquote>\n  <p class="meta">'
                     f'<span>{post_date(p["created_at"])}</span>'
                     f'<a href="https://x.com/{cfg.X_HANDLE}/status/{p["id"]}" target="_blank" rel="noopener">View on X</a>')
            if len(gs) > 1:
                for g in gs:
                    h.append(f'<a href="/game/{g["slug"]}.html">{esc(g["title"])}</a>')
            h.append('</p>\n</div></div>\n')
        for c in thread["closers"]:
            h.append(post_block(c, color) + "\n")

    # the "usual few"
    famous, why = [], ""
    if n > SMALL:
        if thread:
            famous = []
            for x in thread["nos"]:
                exact = [g for g in matcher.match_piece(x) if g["system"] == name]
                if exact:      # "Mario 64" is Super Mario 64, not Dr. Mario 64; sequels that start
                               # with the same name count too ("Streets of Rage 2")
                    keys = {g["nkey"] for g in exact}
                    famous += [g for g in games if any(g["nkey"] == k or g["nkey"].startswith(k + " ") for k in keys)]
                else:          # "Sonic", "Mario Kart": every title with that name in it
                    k = sd.nkey(x)
                    famous += [g for g in games if re.search(r"(^| )" + re.escape(k) + r"( |$)", g["nkey"])]
            why = (f'Leaving out the games my thread names as the ones everybody played '
                   f'(&ldquo;{esc(" ".join("No " + x + "." for x in thread["nos"]))}&rdquo;) and the ten above.')
        else:
            # top FAMOUS_N distinct titles; every copy of those titles is left out
            best = {}
            for g in games:
                best[g["nkey"]] = max(best.get(g["nkey"], 0), counts.get((g["nkey"], name), 0))
            top = [k for k, c in sorted(best.items(), key=lambda t: -t[1])[:FAMOUS_N] if c > 0]
            famous = [g for g in games if g["nkey"] in top]
            why = (f'Leaving out the {len(top)} {esc(name)} games on the shelf with the most user ratings on '
                   f'Metacritic. That\'s a count of how many people rated each one, used here only as a '
                   f'stand-in for &ldquo;the ones everybody names&rdquo;, not a score.')
    fam = {g["slug"] for g in famous}
    rest = sorted((g for g in games if g["slug"] not in fam and g["slug"] not in shown),
                  key=lambda g: g["nkey"])
    if n > SMALL:
        h.append(f'\n<p class="sec">ALSO ON THE SHELF &middot; {len(rest)} GAMES</p>\n<p class="why">{why}</p>\n')
    else:
        h.append(f'\n<p class="sec">ON THE SHELF &middot; {len(rest)} GAMES</p>\n')
    h.append('<div class="shelfgrid">\n' + "\n".join(tile(g) for g in rest) + '\n</div>\n')
    if famous:
        h.append('<p class="famous" style="margin-top:22px">Left out: ' +
                 ", ".join(f'<a href="/game/{g["slug"]}.html">{esc(g["title"])}</a>' for g in famous) + '.</p>\n')
    h.append('\n<footer>\n  <p>The Nostalgia Pro. <a href="/consoles.html">All consoles</a> &middot; '
             f'<a href="https://x.com/{cfg.X_HANDLE}" target="_blank" rel="noopener">@{cfg.X_HANDLE} on X</a></p>\n</footer>\n\n</div>\n')
    h.append(FOOT_JS)
    return "".join(h), len(rest), len(famous)


def main():
    systems, games = sd.load_shelf()
    matcher = Matcher(games)
    threads = find_threads(sd.load_posts(), matcher)
    counts = rating_counts()
    os.makedirs(OUT, exist_ok=True)
    keep = set()
    for s in systems:
        gs = [g for g in games if g["system"] == s["name"]]
        if len(gs) < MIN_GAMES:
            continue
        html, nrest, nfam = build_page(s, gs, threads.get(s["name"]), counts, matcher)
        keep.add(s["id"] + ".html")
        open(os.path.join(OUT, s["id"] + ".html"), "w", encoding="utf-8").write(html)
        t = threads.get(s["name"])
        print(f"  {s['name']:<18} {len(gs):>3} games, {nfam} left out, {nrest} listed"
              + (f", thread {t['root']['id']} ({len(t['entries'])} picks)" if t else ""))
    for f in os.listdir(OUT):
        if f.endswith(".html") and f not in keep:
            os.remove(os.path.join(OUT, f))
    print(f"{len(keep)} console pages, {len(threads)} with RC's thread")


if __name__ == "__main__":
    main()
