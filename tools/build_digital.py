#!/usr/bin/env python3
"""Build digital.html: the games I've beaten or 100%'d that I own digitally
on Xbox, so they're not on the physical shelf.

    python3 tools/build_digital.py

Reads tools/data/digital_games.json: two lists, "completed" (every
achievement) and "beaten" (finished the story), each entry a title and the
platform it was played on. Only titles and status go on the page. A game
that's on the shelf for that same Xbox belongs in BEATEN / COMPLETED in
index.html instead, so the script warns if one turns up here (a copy on a
different console, like the N64 Doom 64 cart, is a different game here). If a photo already exists in
images/ for the title on that Xbox it's used (unless the entry says
"photo": false); nothing is fetched. Safe to
re-run; it also makes sure digital.html is in sitemap.xml."""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitedata as sd
from pagekit import head, nav, FOOT_JS
from build_overrated import add_to_sitemap

esc = sd.esc
SRC = os.path.join(sd.DATA, "digital_games.json")
# platform label -> the shelf name its photos would be filed under
SHELF_NAME = {"Xbox": "Xbox", "Xbox 360": "Xbox 360", "Xbox One": "Xbox One", "Series X|S": "Xbox Series X/S"}

CSS = """  .scores{display:flex;flex-wrap:wrap;margin:24px 0 0;border:2px solid var(--line);border-radius:2px;overflow:hidden}
  .score{flex:1 1 130px;padding:13px 15px;background:var(--bg2);border-right:1px solid var(--line)}
  .score:last-child{border-right:none}
  .score b{display:block;font-family:"Press Start 2P",monospace;font-size:18px;line-height:1}
  .score span{display:block;margin-top:8px;font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.09em;color:var(--dim)}
  .dgroup{margin:38px 0 0}
  .dgroup h2{display:flex;align-items:center;gap:12px;font-family:"IBM Plex Sans Condensed",sans-serif;
    font-size:22px;font-weight:700;margin:0 0 10px;letter-spacing:-.005em}
  .dgroup h2 small{font-family:"Silkscreen",monospace;font-size:11px;font-weight:400;color:var(--dim);letter-spacing:.06em}
  ol.dlist{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:2px}
  ol.dlist li{display:flex;gap:13px;align-items:center;padding:9px 14px;
    border-bottom:1px solid rgba(44,48,64,.7);background:var(--bg2)}
  ol.dlist li:last-child{border-bottom:none}
  ol.dlist li:hover{background:var(--panel)}
  ol.dlist .t{flex:1 1 auto;min-width:0;font-family:"IBM Plex Sans Condensed",sans-serif;font-size:17.5px;font-weight:600;line-height:1.3;overflow-wrap:anywhere}
  ol.dlist .p{flex:none;color:#7fc97f;font-family:"Silkscreen",monospace;font-size:11px;white-space:nowrap}
  ol.dlist .shot{flex:none;width:38px;height:38px;object-fit:cover;border:1px solid var(--line);border-radius:2px;background:#0a0c11}
  .tick{flex:none;width:15px;height:15px;border:2px solid #3fbf6a;background:#3fbf6a;border-radius:2px;position:relative}
  .tick::after{content:"";position:absolute;left:3.5px;top:.5px;width:4px;height:8px;border:solid #0b1410;border-width:0 2px 2px 0;transform:rotate(42deg)}
  .hundo{flex:none;font-style:normal;font-family:"Silkscreen",monospace;font-size:9px;line-height:1;letter-spacing:.03em;
    padding:3px 4px 2px;border:1px solid #f2c94c;border-radius:2px;background:#f2c94c;color:#14110a;white-space:nowrap}
  body.y1996 .tick{width:auto;height:auto;border:none;background:none;font-family:"Courier New",monospace;font-size:13px;color:#00ff00}
  body.y1996 .tick::before{content:"[X]"}
  body.y1996 .tick::after{display:none}
  @media (max-width:560px){
    ol.dlist li{flex-wrap:wrap;row-gap:2px}
    ol.dlist .p{flex-basis:100%;padding-left:28px;white-space:normal}
    ol.dlist li.c100 .p{padding-left:52px}
  }
"""


def photo(title, platform):
    for part in platform.split(" / "):
        name = SHELF_NAME.get(part)
        if name:
            p = sd.photo_for(sd.slug(title, name))
            if p and "/placeholders/" not in p:
                return p
    return None


def rows(items, completed):
    out = []
    for it in sorted(items, key=lambda x: sd.nkey(x["title"])):
        mark = ('<i class="hundo" title="100% complete">100%</i>' if completed
                else '<i class="tick" title="Beaten"></i>')
        img = photo(it["title"], it["platform"]) if it.get("photo", True) else None
        pic = f'<img class="shot" loading="lazy" src="{esc(img)}" alt="{esc(it["title"])}">' if img else ""
        cls = ' class="c100"' if completed else ""
        out.append(f'  <li{cls}>{mark}{pic}<span class="t">{esc(it["title"])}</span>'
                   f'<span class="p">{esc(it["platform"])}</span></li>\n')
    return "".join(out)


def build():
    data = json.load(open(SRC, encoding="utf-8"))
    comp, beat = data["completed"], data["beaten"]
    _, games = sd.load_shelf()
    shelf = {(sd.nkey(g["title"]), g["system"]) for g in games}
    for it in comp + beat:
        for part in it["platform"].split(" / "):
            if (sd.nkey(it["title"]), SHELF_NAME.get(part)) in shelf:
                print(f"warning: {it['title']} ({part}) is on the shelf; tick it there instead")
    n = len(comp) + len(beat)
    desc = (f"{n} digital games I've finished on Xbox: {len(comp)} at 100% and "
            f"{len(beat)} beaten. The boxed ones are ticked on the shelf.")
    h = [head("The Nostalgia Pro \u2014 Digital games I've beaten", desc, "/digital.html", None, "980px", CSS)]
    h.append('<body>\n<div class="wrap">\n\n<header>\n  <p class="wordmark"><a href="/index.html">The Nostalgia Pro</a></p>\n')
    h.append("  <h1>Digital games I've beaten</h1>\n")
    h.append("  <p class=\"standfirst\">Games I've finished that I own digitally on Xbox, so they aren't on the shelf. "
             "100% means every achievement. The boxed games I've beaten are ticked on "
             "<a href=\"/index.html\" style=\"color:inherit\">the shelf</a>.</p>\n")
    h.append(nav("/digital.html"))
    h.append('  <div class="scores">\n'
             f'    <div class="score"><b>{n}</b><span>digital games finished</span></div>\n'
             f'    <div class="score"><b>{len(comp)}</b><span>100% complete</span></div>\n'
             f'    <div class="score"><b>{len(beat)}</b><span>beaten</span></div>\n  </div>\n')
    h.append('</header>\n\n')
    h.append(f'<section class="dgroup" id="complete">\n<h2><i class="hundo">100%</i> 100% complete <small>{len(comp)} GAMES</small></h2>\n'
             f'<ol class="dlist">\n{rows(comp, True)}</ol>\n</section>\n\n')
    h.append(f'<section class="dgroup" id="beaten">\n<h2><i class="tick"></i> Beaten <small>{len(beat)} GAMES</small></h2>\n'
             f'<ol class="dlist">\n{rows(beat, False)}</ol>\n</section>\n\n')
    h.append('<p class="note">Digital only. Apps and other things that aren\'t games are left off.</p>\n\n</div>\n')
    h.append(FOOT_JS)
    with open(os.path.join(sd.ROOT, "digital.html"), "w", encoding="utf-8") as f:
        f.write("".join(h))
    add_to_sitemap("/digital.html")
    print(f"digital.html: {len(comp)} at 100%, {len(beat)} beaten")


if __name__ == "__main__":
    build()
