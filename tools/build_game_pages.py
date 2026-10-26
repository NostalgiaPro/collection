#!/usr/bin/env python3
"""Build one page per game: /game/<slug>.html, plus sitemap.xml.

    python3 tools/build_game_pages.py

Reads everything from the site itself (the shelf, beaten and no-ending
lists in index.html, tools/data/reviews.json, lists.html) and RC's X posts in
tools/data/x_posts.json. Safe to run again any time: it rewrites every
page, deletes pages for games no longer on the shelf, and rewrites the
game section of sitemap.xml. Run it after changing the shelf, ticking
games beaten, adding a list, or adding posts."""
import json, os, re, sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitedata as sd
import site_config as cfg
from pagekit import head, nav, FOOT_JS, post_block, MONTHS
from postmatch import Matcher

OUT = os.path.join(sd.ROOT, "game")
esc = sd.esc

COND = {"cib": "Complete in box", "cib+": "Complete in box", "loose": "Loose", "sealed": "Sealed"}

CSS = """  .crumb{font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.08em;margin:30px 0 0}
  .crumb a{color:var(--dim);text-decoration:none}
  .crumb a:hover{color:var(--hot)}
  .game{display:grid;grid-template-columns:minmax(0,300px) 1fr;gap:28px;margin:18px 0 0;align-items:start}
  .photo{width:100%;border:2px solid var(--line);border-radius:2px;background:#0a0c11;display:block;cursor:zoom-in}
  .nophoto{
    aspect-ratio:3/4;border:2px dashed var(--line);border-radius:2px;display:flex;align-items:center;
    justify-content:center;font-family:"Silkscreen",monospace;font-size:10px;color:var(--dim);text-align:center;padding:14px;
  }
  .sysname{display:inline-block;font-family:"Silkscreen",monospace;font-size:12px;letter-spacing:.06em;
    color:var(--ink);background:var(--c);padding:5px 10px;border-radius:2px;margin:0 0 16px;text-decoration:none}
  .facts{margin:0;padding:0;list-style:none;border-top:1px solid var(--line)}
  .facts li{display:flex;gap:14px;padding:10px 0;border-bottom:1px solid var(--line);font-size:15px}
  .facts b{flex:0 0 120px;font-family:"Silkscreen",monospace;font-weight:400;font-size:10px;
    letter-spacing:.08em;color:var(--dim);padding-top:4px}
  .facts .yes{color:#3fbf6a}
  .hundo{display:inline-block;vertical-align:2px;margin-left:8px;font-style:normal;
    font-family:"Silkscreen",monospace;font-size:9px;line-height:1;letter-spacing:.03em;
    padding:3px 4px 2px;border:1px solid #f2c94c;border-radius:2px;background:#f2c94c;color:#14110a}
  .links{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0}
  .links a{font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.05em;border:1px solid var(--line);
    border-radius:2px;padding:6px 10px;color:var(--dim);text-decoration:none}
  .links a:hover{border-color:var(--hot);color:var(--hot)}
  .mentions{margin:0;padding:0;list-style:none}
  .mentions li{padding:9px 12px;background:var(--bg2);border:1px solid var(--line);border-left:4px solid var(--hot);
    border-radius:2px;margin:0 0 7px;font-size:15px}
  .mentions a{color:inherit;text-decoration:none}
  .mentions a:hover{color:var(--hot)}
  .mentions em{font-style:normal;font-family:"Press Start 2P",monospace;font-size:11px;color:var(--hot);margin-right:10px}
  .lightbox{position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(6,7,11,.92)}
  .lightbox.on{display:flex}
  .lightbox img{max-width:100%;max-height:86vh;border:2px solid var(--line);border-radius:2px}
  footer{margin:56px 0 0;padding:22px 0 30px;border-top:1px solid var(--line);color:var(--dim);font-size:13.5px}
  footer a{color:var(--dim)}
  @media (max-width:640px){ .game{grid-template-columns:1fr} .photo,.nophoto{max-width:300px} }
"""


def released_text(r):
    if not r:
        return None
    m, d, y = r
    return f"{MONTHS[m-1]} {d}, {y}" if d else f"{MONTHS[m-1]} {y}"


def list_mentions(lists, matcher):
    """slug -> [(list title, position, label)]"""
    out = {}
    for L in lists:
        if L.get("solo"):
            continue
        for i, pick in enumerate(L["picks"]):
            t, c = pick[0], pick[1] if len(pick) > 1 else None
            if not t:
                continue
            systems = c if isinstance(c, list) else [c]
            label = pick[2] if len(pick) > 2 and pick[2] else str(i + 1)
            for s in systems:
                if not s:
                    continue
                for g in matcher.match_piece(f"{t} ({s})") or matcher.match_piece(t):
                    if g["system"] != s:
                        continue
                    out.setdefault(g["slug"], [])
                    if (L["title"], label) not in [(a, c_) for a, _, c_ in out[g["slug"]]]:
                        out[g["slug"]].append((L["title"], i + 1, label))
    return out


def review_for(reviews, matcher):
    out = {}
    for n, t, s, v, slugs, url in reviews:
        for sl in slugs:
            out[sl] = (n, v, url)
    return out


def posts_for(posts, matcher):
    by_id = {p["id"]: p for p in posts}
    out = {}
    for p in posts:
        root = p
        seen = 0
        while root.get("reply_to") and root["reply_to"] in by_id and seen < 50:
            root = by_id[root["reply_to"]]; seen += 1
        ctx = root["text"] if root is not p else ""
        for g in matcher.games_in(p["text"], ctx):
            out.setdefault(g["slug"], []).append(p)
    for k in out:
        out[k].sort(key=lambda p: p["created_at"], reverse=True)
    return out


def page(g, total, photo, review, mentions, posts):
    cond = COND.get(g["cond"].lower(), g["cond"])
    status = ("Beaten" if g["beaten"] else "No ending" if g["endless"] else "Not beaten yet")
    path = f"/game/{g['slug']}.html"
    title = f"{g['title']} ({g['system']}) | The Nostalgia Pro"
    desc = f"{g['title']} for the {g['system']}. {cond}. {status}{' (100%)' if g.get('completed') else ''}. One of {total} games in my collection."
    if review:
        desc += f" Reviewed {review[1]:g}/5."
    ink = "#0b0d12"
    h = [head(title, desc, path, photo, "980px", CSS, image_alt=f"{g['title']} for the {g['system']}")]
    h.append(f'<body>\n<div class="wrap">\n\n<header>\n  <p class="wordmark"><a href="/index.html">The Nostalgia Pro</a></p>\n')
    h.append(nav())
    h.append(f'  <p class="crumb"><a href="/index.html#{g["system_id"]}">&larr; {esc(g["system"])} shelf</a></p>\n</header>\n\n')
    h.append(f'<div class="game" style="--c:{g["color"]};--ink:{ink}">\n  <div>')
    if photo:
        h.append(f'<img class="photo" src="{esc(photo)}" alt="{esc(g["title"])}, {esc(g["system"])}">')
    else:
        h.append('<div class="nophoto">No photo yet</div>')
    h.append('</div>\n  <div>\n')
    h.append(f'    <a class="sysname" href="/index.html#{g["system_id"]}">{esc(g["system"])}</a>\n')
    h.append(f'    <h1>{esc(g["title"])}</h1>\n    <ul class="facts" style="margin-top:22px">\n')
    h.append(f'      <li><b>CONDITION</b><span>{esc(cond)}</span></li>\n')
    cls = ' class="yes"' if g["beaten"] else ""
    badge = ' <i class="hundo" title="100% complete">100%</i>' if g.get("completed") else ""
    h.append(f'      <li><b>BEATEN</b><span{cls}>{status}{badge}</span></li>\n')
    if g.get("genre"):
        h.append(f'      <li><b>GENRE</b><span>{esc(g["genre"])}</span></li>\n')
    rel = released_text(g.get("released"))
    if rel:
        h.append(f'      <li><b>RELEASED</b><span>{rel}</span></li>\n')
    if review:
        h.append(f'      <li><b>MY REVIEW</b><span><a href="/reviews.html#r-{review[0]}" style="color:inherit">'
                 f'{review[1]:g} out of 5 &middot; Honest and Unpopular Reviews No. {review[0]}</a></span></li>\n')
    h.append('    </ul>\n    <div class="links">\n')
    h.append(f'      <a href="/index.html?find={esc(_q(g["title"]))}">Find it on the shelf</a>\n')
    if review:
        if review[2]:
            h.append(f'      <a href="{esc(review[2])}" target="_blank" rel="noopener">Read my review on X</a>\n')
        else:   # not on X: the review lives on reviews.html
            h.append(f'      <a href="/reviews.html#r-{review[0]}">Read my review</a>\n')
    if g.get("video"):
        h.append(f'      <a href="{esc(g["video"])}" target="_blank" rel="noopener">ASMR short on YouTube</a>\n')
    h.append(f'      <a href="https://en.wikipedia.org/w/index.php?search={_q(g["title"] + " video game")}" target="_blank" rel="noopener">Look it up on Wikipedia</a>\n')
    h.append('    </div>\n  </div>\n</div>\n')
    if mentions:
        h.append('\n<p class="barlabel">ON MY LISTS</p>\n<ul class="mentions">\n')
        for lt, pos, label in mentions:
            lab = (f"No. {label}" if label.isdigit() else f"{label} tier" if len(label) == 1 else label)
            h.append(f'  <li><a href="/lists.html#game={_q(g["title"])}"><em>{esc(lab)}</em>{esc(lt)}</a></li>\n')
        h.append('</ul>\n')
    if posts:
        h.append('\n<p class="barlabel">WHAT I\'VE POSTED ABOUT IT ON X</p>\n')
        for p in posts:
            h.append(post_block(p, g["color"]) + "\n")
    h.append('\n<div class="lightbox" id="lightbox" role="dialog" aria-label="Photo"><img alt=""></div>\n')
    h.append('\n<footer>\n  <p>The Nostalgia Pro. <a href="/index.html">Search all ' + str(total) +
             ' games</a> &middot; <a href="https://x.com/' + cfg.X_HANDLE + '" target="_blank" rel="noopener">@' +
             cfg.X_HANDLE + ' on X</a></p>\n</footer>\n\n</div>\n')
    h.append("""<script>
/* Tap the photo for a bigger look. */
(function(){
  var lb = document.getElementById("lightbox"), ph = document.querySelector(".photo");
  if (ph) ph.addEventListener("click", function(){ lb.querySelector("img").src = ph.src; lb.classList.add("on"); });
  lb.addEventListener("click", function(){ lb.classList.remove("on"); });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape") lb.classList.remove("on"); });
})();
</script>
""")
    h.append(FOOT_JS)
    return "".join(h)


def _q(s):
    from urllib.parse import quote
    return quote(s, safe="")


SITEMAP_START = "  <!-- game pages: written by tools/build_game_pages.py -->"
SITEMAP_END = "  <!-- end game pages -->"


def write_sitemap(slugs, extra_paths=()):
    p = os.path.join(sd.ROOT, "sitemap.xml")
    src = open(p, encoding="utf-8").read()
    src = re.sub(r"\n?" + re.escape(SITEMAP_START) + r"[\s\S]*?" + re.escape(SITEMAP_END) + r"\n?", "\n", src)
    today = date.today().isoformat()
    rows = [SITEMAP_START]
    for path in list(extra_paths) + [f"/game/{s}.html" for s in slugs]:
        rows.append(f"  <url>\n    <loc>{cfg.SITE_URL}{path}</loc>\n    <lastmod>{today}</lastmod>\n"
                    f"    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>")
    rows.append(SITEMAP_END)
    src = src.replace("</urlset>", "\n".join(rows) + "\n</urlset>")
    src = re.sub(r"\n{3,}", "\n\n", src)
    open(p, "w", encoding="utf-8").write(src)


def main():
    systems, games = sd.load_shelf()
    matcher = Matcher(games)
    lists = sd.load_lists()
    reviews = review_for(sd.load_reviews(), matcher)
    mentions = list_mentions(lists, matcher)
    posts = posts_for(sd.load_posts(), matcher)
    os.makedirs(OUT, exist_ok=True)
    keep = set()
    for g in games:
        name = g["slug"] + ".html"
        keep.add(name)
        html = page(g, len(games), sd.photo_for(g["slug"]), reviews.get(g["slug"]),
                    mentions.get(g["slug"], []), posts.get(g["slug"], []))
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write(html)
    for f in os.listdir(OUT):
        if f.endswith(".html") and f not in keep:
            os.remove(os.path.join(OUT, f))
    extra = []
    if os.path.exists(os.path.join(sd.ROOT, "console")):
        extra = sorted("/console/" + f for f in os.listdir(os.path.join(sd.ROOT, "console")) if f.endswith(".html"))
    write_sitemap([g["slug"] for g in games], extra)
    print(f"{len(games)} game pages, {sum(1 for g in games if posts.get(g['slug']))} with X posts, "
          f"{sum(1 for g in games if mentions.get(g['slug']))} on lists, {len(reviews)} reviewed, "
          f"{sum(1 for g in games if sd.photo_for(g['slug']))} with photos")
    # the "From my shelf" box on onthisday.html follows the same shelf
    import build_otd_shelf
    build_otd_shelf.main()


if __name__ == "__main__":
    main()
