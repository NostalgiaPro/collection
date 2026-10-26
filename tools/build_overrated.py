#!/usr/bin/env python3
"""Build overrated.html: every time I've called a game overrated on X.

    python3 tools/build_overrated.py

Four parts, in this order:
  * the Top 5 most overrated games thread, from tools/data/rankings.json
    ("overrated" -> "top5"), each entry linked to its post;
  * every "Overrated Game of the Day!" post, newest first, from
    tools/data/x_posts.json. A post counts when its first line starts with
    "Overrated Game of the Day". The next line is the game, written
    "Title (System)"; if that game is on the shelf the entry gets its photo
    and a link to its game page. The post rankings.json names as the
    fake-out ("overrated" -> "fakeout") is marked with his own line;
  * the reviews where I called a game overrated ("overrated" -> "reviews"),
    linked to reviews.html#r-N and to X;
  * other posts ("overrated" -> "posts"), quoted in full.
Post text is shown exactly as posted (links to pictures removed). Safe to
re-run."""
import os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitedata as sd
import site_config as cfg
from pagekit import head, nav, FOOT_JS, post_date, clean_post_text
from postmatch import Matcher

esc = sd.esc
HEADER = re.compile(r"^\s*overrated game of the day\b", re.I)

CSS = """  .entry{display:grid;grid-template-columns:150px 1fr;gap:22px;margin:0 0 22px;
    background:var(--bg2);border:1px solid var(--line);border-left:4px solid var(--c,var(--hot));border-radius:2px;padding:18px}
  .entry .pic{width:150px;border:1px solid var(--line);border-radius:2px;display:block;background:#0a0c11}
  .entry .nopic{width:150px;aspect-ratio:3/4;border:1px dashed var(--line);border-radius:2px;display:flex;
    align-items:center;justify-content:center;font-family:"Silkscreen",monospace;font-size:9px;color:var(--dim);text-align:center;padding:8px}
  .entry .when{font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.08em;color:var(--dim);margin:0}
  .entry h2{font-family:"IBM Plex Sans Condensed",sans-serif;font-size:23px;font-weight:700;margin:6px 0 2px;line-height:1.25}
  .entry h2 a{color:inherit;text-decoration:none;border-bottom:1px solid transparent}
  .entry h2 a:hover{border-bottom-color:var(--c)}
  .entry .sys{font-family:"Silkscreen",monospace;font-size:11px;color:var(--c);margin:0 0 12px}
  .entry blockquote{margin:0;white-space:pre-line;font-size:15px}
  .entry .links{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0}
  .entry .links a{font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.05em;border:1px solid var(--line);
    border-radius:2px;padding:5px 9px;color:var(--dim);text-decoration:none}
  .entry .links a:hover{border-color:var(--hot);color:var(--hot)}
  .count{font-family:"Silkscreen",monospace;font-size:11px;letter-spacing:.08em;color:var(--hot);margin:30px 0 16px}
  .entry .fake{margin:0 0 12px;padding:8px 12px;border:1px dashed var(--c);border-radius:2px;font-size:14px}
  .entry .fake b{font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.06em;color:var(--c);font-weight:400;margin-right:8px}
  .oq{margin:0 0 14px;background:var(--bg2);border:1px solid var(--line);border-left:4px solid var(--c,var(--hot));border-radius:2px;padding:16px 18px}
  .oq .when{font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.08em;color:var(--dim);margin:0}
  .oq h3{font-family:"IBM Plex Sans Condensed",sans-serif;font-size:21px;font-weight:700;margin:6px 0 2px;line-height:1.25}
  .oq h3 a{color:inherit;text-decoration:none;border-bottom:1px solid var(--c,var(--hot))}
  .oq .sub{font-family:"Silkscreen",monospace;font-size:11px;color:var(--dim);margin:0 0 10px}
  .oq blockquote{margin:0;white-space:pre-line;font-size:15.5px}
  .oq .links{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0}
  .oq .links a{font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.05em;border:1px solid var(--line);
    border-radius:2px;padding:5px 9px;color:var(--dim);text-decoration:none}
  .oq .links a:hover{border-color:var(--hot);color:var(--hot)}
  @media (max-width:600px){ .entry{grid-template-columns:1fr} .entry .pic,.entry .nopic{width:120px} }
"""


def entries():
    systems, games = sd.load_shelf()
    m = Matcher(games)
    out = []
    for p in sd.load_posts():
        lines = [l for l in p["text"].split("\n")]
        nonempty = [l for l in lines if l.strip()]
        if not nonempty or not HEADER.match(nonempty[0]):
            continue
        game_line = clean_post_text(nonempty[1]) if len(nonempty) > 1 else ""
        mm = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", game_line)
        title, system = (mm.group(1), mm.group(2)) if mm else (game_line, "")
        hits = m.match_piece(game_line)
        # body = everything after the game line, as posted
        idx = lines.index(nonempty[1]) if len(nonempty) > 1 else 0
        body = clean_post_text("\n".join(lines[idx + 1:]))
        out.append({"post": p, "title": title, "system": system, "game": hits[0] if hits else None,
                    "body": body})
    out.sort(key=lambda e: e["post"]["created_at"], reverse=True)
    return out


def build():
    import build_rankings as br
    es = entries()
    ov = br.load()["overrated"]
    L = br.Linker()
    desc = ("Every time I've called a game overrated on X: the top 5 thread, "
            "Overrated Game of the Day, and the reviews and posts in between.")
    h = [head("The Nostalgia Pro \u2014 Overrated", desc, "/overrated.html", None, "860px", CSS + br.CSS)]
    h.append('<body>\n<div class="wrap">\n\n<header>\n  <p class="wordmark"><a href="/index.html">The Nostalgia Pro</a></p>\n')
    h.append('  <h1>Overrated</h1>\n')
    h.append("  <p class=\"standfirst\">Every game I've called overrated on X, kept here as posted.</p>\n")
    h.append(nav("/overrated.html"))
    h.append('</header>\n\n')
    parts = [("top-5", "Top 5 most overrated"), ("game-of-the-day", "Overrated Game of the Day"),
             ("reviews", "In my reviews"), ("posts", "Other posts")]
    h.append('<nav class="jump" aria-label="Jump to a part">\n<p>JUMP TO</p>\n<ul>\n'
             + "".join(f'<li><a href="#{k}">{t}</a></li>' for k, t in parts) + '\n</ul>\n</nav>\n\n')

    # 1. the top 5 thread
    t = ov["top5"]
    h.append('<section class="grp" id="top-5">\n<h2>Top 5 most overrated</h2>\n')
    h.append('<article class="rk" id="top-5-list" style="--c:#ff4b3e">\n<h3>Top 5 most overrated games of all time</h3>\n')
    h.append(br.meta(t))
    h.append(br.items_ol(L, t["items"], None))
    h.append(br.post_text(t, False))
    h.append('</article>\n</section>\n\n')

    # 2. Overrated Game of the Day
    fake = ov.get("fakeout") or {}
    h.append(f'<section class="grp" id="game-of-the-day">\n<h2>Overrated Game of the Day</h2>\n')
    h.append(f'<p class="count">{len(es)} POSTS</p>\n')
    for e in es:
        g, p = e["game"], e["post"]
        color = g["color"] if g else "#ff4b3e"
        photo = sd.photo_for(g["slug"]) if g else None
        pic = (f'<img class="pic" loading="lazy" src="{esc(photo)}" alt="{esc(g["title"])}">' if photo
               else '<div class="nopic">Not on the shelf</div>' if not g else '<div class="nopic">No photo yet</div>')
        name = esc(e["title"])
        if g:
            name = f'<a href="/game/{g["slug"]}.html">{name}</a>'
        h.append(f'<article class="entry" id="x-{p["id"]}" style="--c:{color}">\n  <div>{pic}</div>\n  <div>\n')
        h.append(f'    <p class="when">{post_date(p["created_at"])}</p>\n    <h2>{name}</h2>\n')
        h.append(f'    <p class="sys">{esc(e["system"])}</p>\n')
        if p["id"] == fake.get("id"):
            h.append(f'    <p class="fake"><b>JUST KIDDING</b>Not a real pick: \u201c{esc(fake["quote"])}\u201d</p>\n')
        h.append(f'    <blockquote>{esc(e["body"])}</blockquote>\n    <div class="links">\n')
        h.append(f'      <a href="https://x.com/{cfg.X_HANDLE}/status/{p["id"]}" target="_blank" rel="noopener">View on X</a>\n')
        if g:
            h.append(f'      <a href="/game/{g["slug"]}.html">Game page</a>\n')
        h.append('    </div>\n  </div>\n</article>\n')
    h.append('</section>\n\n')

    # 3. reviews
    h.append('<section class="grp" id="reviews">\n<h2>In my reviews</h2>\n')
    for r in ov["reviews"]:
        g = L.game(r["game"])
        name = f'<a href="/game/{g["slug"]}.html">{esc(r["game"])}</a>' if g else esc(r["game"])
        sub = f'From my review of {r["reviewed"]}' if r.get("reviewed") else ""
        h.append(f'<article class="oq" id="x-{r["id"]}">\n<p class="when">{br.nice_date(r["date"])} \u00b7 HONEST AND UNPOPULAR REVIEWS NO. {r["review"]}</p>\n')
        h.append(f'<h3>{name}</h3>\n' + (f'<p class="sub">{esc(sub)}</p>\n' if sub else ""))
        h.append(f'<blockquote>{esc(r["quote"])}</blockquote>\n<div class="links">\n')
        h.append(f'  <a href="/reviews.html#r-{r["review"]}">Read the review</a>\n')
        h.append(f'  <a href="{br.xurl(r["id"])}" target="_blank" rel="noopener">View on X</a>\n</div>\n</article>\n')
    h.append('</section>\n\n')

    # 4. other posts
    h.append('<section class="grp" id="posts">\n<h2>Other posts</h2>\n')
    for r in ov["posts"]:
        names = " and ".join(
            (f'<a href="/game/{g["slug"]}.html">{esc(n)}</a>' if (g := L.game(n)) else esc(n)) for n in r["games"])
        label = " \u00b7 QUOTE POST" if r.get("quote_post") else ""
        h.append(f'<article class="oq" id="x-{r["id"]}">\n<p class="when">{br.nice_date(r["date"])}{label}</p>\n<h3>{names}</h3>\n')
        h.append(f'<blockquote>{esc(r["text"])}</blockquote>\n<div class="links">\n')
        h.append(f'  <a href="{br.xurl(r["id"])}" target="_blank" rel="noopener">View on X</a>\n</div>\n</article>\n')
    h.append('</section>\n\n')

    h.append('<p class="note">Every other list I\'ve posted is on the <a href="/rankings.html" style="color:inherit">Rankings</a> page.</p>\n\n</div>\n')
    h.append(FOOT_JS)
    with open(os.path.join(sd.ROOT, "overrated.html"), "w", encoding="utf-8") as f:
        f.write("".join(h))
    add_to_sitemap("/overrated.html")
    print(f"overrated.html: top 5, {len(es)} Game of the Day posts ({sum(1 for e in es if e['game'])} on the shelf), "
          f"{len(ov['reviews'])} reviews, {len(ov['posts'])} other posts")


def game_overrated(L=None):
    """slug -> every spot on overrated.html that links to that game page, as
    [{"place", "title", "href", "x"}]. Same matching as build()."""
    import build_rankings as br
    L = L or br.Linker()
    ov = br.load()["overrated"]
    fake = (ov.get("fakeout") or {}).get("id")
    out = {}

    def add(g, place, title, anchor, post_id):
        if g:
            row = {"place": place, "title": title, "href": "/overrated.html#" + anchor, "x": br.xurl(post_id)}
            if row not in out.setdefault(g["slug"], []):
                out[g["slug"]].append(row)

    for it in ov["top5"]["items"]:
        text = " ".join(x for x in (it.get("reason"), it.get("more")) if x)
        add(L.game(it["name"], None, text), f"#{it['n']}", "Top 5 most overrated games of all time", "top-5-list",
            it.get("id") or ov["top5"]["id"])
    for e in entries():
        p = e["post"]
        title = "Overrated Game of the Day" + (" (the Just kidding post)" if p["id"] == fake else "")
        add(e["game"], post_date(p["created_at"]), title, f'x-{p["id"]}', p["id"])
    for r in ov["reviews"]:
        add(L.game(r["game"]), br.nice_date(r["date"]), f'Overrated page, in my review No. {r["review"]}', f'x-{r["id"]}', r["id"])
    for r in ov["posts"]:
        for n in r["games"]:
            add(L.game(n), br.nice_date(r["date"]), "Overrated page, other posts", f'x-{r["id"]}', r["id"])
    return out


def add_to_sitemap(path):
    p = os.path.join(sd.ROOT, "sitemap.xml")
    src = open(p, encoding="utf-8").read()
    loc = cfg.SITE_URL + path
    if loc in src:
        return
    from datetime import date
    row = (f"  <url>\n    <loc>{loc}</loc>\n    <lastmod>{date.today().isoformat()}</lastmod>\n"
           f"    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n")
    marker = "  <!-- game pages"
    src = src.replace(marker, row + marker, 1) if marker in src else src.replace("</urlset>", row + "</urlset>")
    open(p, "w", encoding="utf-8").write(src)


if __name__ == "__main__":
    build()
