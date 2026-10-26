#!/usr/bin/env python3
"""Build overrated.html: every "Overrated Game of the Day!" post, newest first.

    python3 tools/build_overrated.py

Reads tools/data/x_posts.json. A post counts when its first line starts
with "Overrated Game of the Day". The next line is the game, written
"Title (System)"; if that game is on the shelf the entry gets its photo and
a link to its game page. Post text is shown exactly as posted (links to
pictures removed). Safe to re-run."""
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
    es = entries()
    desc = ("Every Overrated Game of the Day post from my X account, newest first, "
            "with the game from my collection.")
    h = [head("The Nostalgia Pro \u2014 Overrated Game of the Day", desc, "/overrated.html", None, "860px", CSS)]
    h.append('<body>\n<div class="wrap">\n\n<header>\n  <p class="wordmark"><a href="/index.html">The Nostalgia Pro</a></p>\n')
    h.append('  <h1>Overrated Game of the Day</h1>\n')
    h.append('  <p class="standfirst">Every Overrated Game of the Day post from X, newest first, kept here as posted.</p>\n')
    h.append(nav())
    h.append('</header>\n\n')
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
        h.append(f'    <blockquote>{esc(e["body"])}</blockquote>\n    <div class="links">\n')
        h.append(f'      <a href="https://x.com/{cfg.X_HANDLE}/status/{p["id"]}" target="_blank" rel="noopener">View on X</a>\n')
        if g:
            h.append(f'      <a href="/game/{g["slug"]}.html">Game page</a>\n')
        h.append('    </div>\n  </div>\n</article>\n')
    h.append('\n<p class="note">New ones get added when tools/build_overrated.py runs.</p>\n\n</div>\n')
    h.append(FOOT_JS)
    with open(os.path.join(sd.ROOT, "overrated.html"), "w", encoding="utf-8") as f:
        f.write("".join(h))
    add_to_sitemap("/overrated.html")
    print(f"overrated.html: {len(es)} posts, {sum(1 for e in es if e['game'])} on the shelf")


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
