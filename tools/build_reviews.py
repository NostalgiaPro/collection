#!/usr/bin/env python3
"""Build reviews.html: my Honest and Unpopular Reviews from X, each with the
full post text, the photo I posted with it and a "Read on X" link.

    python3 tools/build_reviews.py

Reads tools/data/reviews.json, one entry per numbered review:
  n, title            the review number and the title as I posted it
  posted_system       what I wrote in the brackets, or null for a console review
  systems             the shelf system name(s) it's filed under
  kind                "game" or "console"
  score               the score out of 5 I gave in the post (null if none)
  date, time          when it was posted, America/Phoenix (time null if unknown)
  id, url             the X post (both null for a review that isn't on X)
  shelf               the shelf entries it's about: title, system, slug (game page)
  image               the photo from the post: a 600px .webp in images/reviews/
                      (null if there's no photo)
  text                the post exactly as written (only X's trailing photo link
                      is dropped)
The data is pulled from X once; nothing is fetched here. Safe to re-run.
It also keeps the copies of the review numbers and scores that other pages
use in step: REVIEWED in index.html and REVIEWS in lists.html. Game pages
read reviews.json through sitedata.load_reviews(), so re-run
build_game_pages.py after adding a review."""
import json, os, re, sys
from urllib.parse import quote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitedata as sd
from pagekit import head, nav, FOOT_JS
from build_overrated import add_to_sitemap
from postmatch import Matcher

esc = sd.esc
SRC = os.path.join(sd.DATA, "reviews.json")
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

CSS = """  .scores{display:flex;flex-wrap:wrap;margin:24px 0 0;border:2px solid var(--line);border-radius:2px;overflow:hidden}
  .score{flex:1 1 130px;padding:13px 15px;background:var(--bg2);border-right:1px solid var(--line)}
  .score:last-child{border-right:none}
  .score b{display:block;font-family:"Press Start 2P",monospace;font-size:18px;line-height:1}
  .score span{display:block;margin-top:8px;font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.09em;color:var(--dim)}
  .chips{display:flex;flex-wrap:wrap;gap:7px}
  .chip{background:transparent;border:1px solid var(--line);color:var(--dim);font-family:"IBM Plex Sans",sans-serif;
    font-size:13px;font-weight:500;padding:6px 12px;border-radius:2px;cursor:pointer}
  .chip:hover{border-color:#4a5064;color:var(--text)}
  .chip[aria-pressed="true"]{background:var(--text);border-color:var(--text);color:var(--bg)}
  .chip em{font-style:normal;font-family:"Silkscreen",monospace;font-size:10px;opacity:.7;margin-left:6px}
  .tools{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:26px 0 0;flex-wrap:wrap}
  .tools p{margin:0;font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.08em;color:var(--dim)}
  ol.reviews{list-style:none;margin:10px 0 0;padding:0}
  ol.reviews>li{border-bottom:1px solid var(--line);border-left:4px solid var(--c,var(--line));background:var(--bg2)}
  ol.reviews>li:first-child{border-top:1px solid var(--line)}
  ol.reviews>li[hidden]{display:none}
  .rv>summary{display:flex;align-items:center;gap:14px;padding:12px 12px;cursor:pointer;list-style:none}
  .rv>summary::-webkit-details-marker{display:none}
  .rv>summary:hover{background:var(--panel)}
  .rv>summary:focus-visible{outline:2px solid var(--c);outline-offset:-2px}
  .num{flex:none;width:44px;font-family:"Press Start 2P",monospace;font-size:12px;color:var(--dim)}
  .who{flex:1;min-width:0}
  .who b{display:block;font-weight:600;font-size:16px;line-height:1.3}
  .who span{font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.06em;color:var(--c,var(--dim))}
  .who span time{color:var(--dim)}
  .rating{flex:none;font-family:"Press Start 2P",monospace;font-size:13px;white-space:nowrap}
  .r5{color:#3fbf6a}.r4{color:#c9c34a}.r3{color:#e0913a}.r2{color:#e0663a}.r1{color:var(--hot)}
  .rnone{color:var(--dim);font-size:10px;font-family:"Silkscreen",monospace}
  .arrow{flex:none;width:10px;height:10px;border:solid var(--dim);border-width:0 2px 2px 0;transform:rotate(45deg);margin:-4px 4px 0 0;transition:transform .15s}
  .rv[open] .arrow{transform:rotate(225deg);margin-top:4px}
  .body{display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:22px;padding:4px 18px 18px 70px}
  .body blockquote{margin:0;white-space:pre-line;font-size:15.5px;line-height:1.6;overflow-wrap:anywhere}
  .body figure{margin:0}
  .body figure img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:2px;background:#0a0c11}
  .rmeta{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .rmeta a{font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.06em;color:var(--dim);text-decoration:none;
    border:1px solid var(--line);border-radius:2px;padding:5px 9px}
  .rmeta a:hover,.rmeta a:focus-visible{border-color:var(--hot);color:var(--hot);outline:none}
  .rmeta a.onx{border-color:var(--text);color:var(--text)}
  .rmeta a.onx:hover{border-color:var(--hot);color:var(--hot)}
  .rmeta .offx{font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.06em;color:var(--dim);padding:5px 9px 5px 0}
  .empty{color:var(--dim);padding:26px 0}
  body.y1996 ol.reviews>li{background:#000;border:2px ridge #808080;border-left:6px solid var(--c,#808080);margin:0 0 6px}
  body.y1996 .rv>summary:hover{background:#000040}
  body.y1996 .num{font-family:"Courier New",monospace;font-size:14px;color:#ffff00}
  body.y1996 .who b{font-family:"Times New Roman",Times,serif;color:#00ffff;text-decoration:underline;font-weight:700}
  body.y1996 .who span{font-family:"Courier New",monospace;font-size:12px}
  body.y1996 .rating{font-family:"Courier New",monospace;font-size:16px;font-weight:700}
  body.y1996 .arrow{display:none}
  body.y1996 .rv>summary::after{content:"[+]";font-family:"Courier New",monospace;color:#c0c0c0}
  body.y1996 .rv[open]>summary::after{content:"[-]"}
  body.y1996 .body blockquote{font-family:"Times New Roman",Times,serif;color:#fff;font-size:16px}
  body.y1996 .body figure img{border:2px inset #808080;border-radius:0}
  body.y1996 .rmeta a{font-family:"Times New Roman",Times,serif;font-size:14px;letter-spacing:0;color:#00ffff;border:none;padding:0 6px 0 0;text-decoration:underline}
  body.y1996 .rmeta a:visited{color:#ee82ee}
  body.y1996 .rmeta .offx{font-family:"Times New Roman",Times,serif;font-size:14px;letter-spacing:0;color:#c0c0c0;padding:0 6px 0 0}
  body.y1996 .tools p{font-family:"Courier New",monospace;color:#c0c0c0}
  @media (max-width:640px){
    .rv>summary{gap:10px;padding:11px 10px}
    .num{width:34px;font-size:10px}
    .who b{font-size:15px}
    .rating{font-size:11px}
    .body{grid-template-columns:1fr;padding:2px 14px 16px 14px;gap:14px}
    .body figure{order:-1;max-width:220px}
  }
"""

JS = """<script>
/* Sort, filter by console, and open the review a link points at. */
(function(){
  var list = document.getElementById("list"), items = [].slice.call(list.children);
  var sys = "all", sort = "new";
  var empty = document.getElementById("empty");
  function draw(){
    var rows = items.slice();
    var k = function(li, a){ return li.dataset[a]; };
    if (sort === "new")  rows.sort(function(a,b){ return k(b,"t").localeCompare(k(a,"t")); });
    if (sort === "num")  rows.sort(function(a,b){ return a.dataset.n - b.dataset.n; });
    if (sort === "high") rows.sort(function(a,b){ return (b.dataset.v||-1) - (a.dataset.v||-1) || b.dataset.n - a.dataset.n; });
    if (sort === "low")  rows.sort(function(a,b){ return (a.dataset.v||99) - (b.dataset.v||99) || b.dataset.n - a.dataset.n; });
    if (sort === "az")   rows.sort(function(a,b){ return k(a,"k").localeCompare(k(b,"k")); });
    var shown = 0;
    rows.forEach(function(li){
      var on = sys === "all" || li.dataset.sys.split("|").indexOf(sys) > -1;
      li.hidden = !on; if (on) shown++;
      list.appendChild(li);
    });
    empty.hidden = shown > 0;
  }
  function chips(id, key, set){
    document.getElementById(id).addEventListener("click", function(e){
      var b = e.target.closest(".chip"); if (!b) return;
      set(b.dataset[key]);
      [].forEach.call(this.querySelectorAll(".chip"), function(c){ c.setAttribute("aria-pressed", c === b); });
      draw();
    });
  }
  chips("sysChips", "sys", function(v){ sys = v; });
  chips("sortChips", "sort", function(v){ sort = v; });
  var all = document.getElementById("openall");
  all.addEventListener("click", function(){
    var open = all.getAttribute("aria-pressed") !== "true";
    all.setAttribute("aria-pressed", open);
    all.textContent = open ? "Close all" : "Open all";
    items.forEach(function(li){ li.querySelector("details").open = open; });
  });
  function hash(){
    var m = location.hash.match(/^#r-(\\d+)$/); if (!m) return;
    var li = document.getElementById("r-" + m[1]); if (!li) return;
    if (li.hidden) { document.querySelector('#sysChips [data-sys="all"]').click(); }
    li.querySelector("details").open = true;
    li.scrollIntoView();
  }
  addEventListener("hashchange", hash);
  hash();
})();
</script>
"""


def load():
    return json.load(open(SRC, encoding="utf-8"))


def band(v):
    return "r5" if v >= 4.5 else "r4" if v >= 4 else "r3" if v >= 3 else "r2" if v >= 2 else "r1"


def fmt_score(v):
    if v is None:
        return None
    return str(int(v)) if v == int(v) else str(v)


def nice_date(d):
    y, m, dd = d.split("-")
    return f"{MONTHS[int(m) - 1]} {int(dd)}, {y}"


def list_counts(revs, games):
    """review number -> how many posted lists it turns up on (lists.html)."""
    from build_game_pages import list_mentions
    mentions = list_mentions(sd.load_lists(), Matcher(games))
    out = {}
    for r in revs:
        names = set()
        for s in r["shelf"]:
            names |= {t for t, _, _ in mentions.get(s["slug"], [])}
        if r["kind"] == "console":   # a console on a list of consoles
            for L in sd.load_lists():
                if any(p and p[0] and sd.nkey(p[0]) == sd.nkey(r["title"]) for p in L["picks"]):
                    names.add(L["title"])
        if names:
            out[r["n"]] = len(names)
    return out


def item(r, colors, onlists):
    sysl = " / ".join(r["systems"])
    color = colors.get(r["systems"][0], "#7b8294")
    v = r["score"]
    rating = (f'<span class="rating {band(v)}">{fmt_score(v)}/5</span>' if v is not None
              else '<span class="rating rnone">no score</span>')
    url = r.get("url")
    links = ([f'<a class="onx" href="{esc(url)}" target="_blank" rel="noopener">Read on X &#x2197;</a>'] if url
             else ['<span class="offx">Not on X</span>'])
    many = len(r["shelf"]) > 1
    for s in r["shelf"]:
        label = f'Game page: {s["title"]} ({s["system"]})' if many else "Game page"
        links.append(f'<a href="/game/{esc(s["slug"])}.html">{esc(label)}</a>')
    if r["kind"] == "console":
        links.append(f'<a href="/console/{sd.sys_id(r["systems"][0])}.html">{esc(r["systems"][0])} on the shelf</a>')
    if onlists.get(r["n"]):
        c = onlists[r["n"]]
        links.append(f'<a href="/lists.html#game={esc(quote(r["shelf"][0]["title"] if r["shelf"] else r["title"]))}">On {c} list{"s" if c > 1 else ""}</a>')
    pic = ""
    if r.get("image"):
        im = r["image"]
        pic = (f'<figure><img loading="lazy" src="/{esc(im["src"])}" width="{im["w"]}" height="{im["h"]}" '
               f'alt="{esc(r["title"])}, the photo from the post"></figure>')
    when = r["date"] + (f'T{r["time"]}' if r.get("time") else "")
    cite = f' cite="{esc(url)}"' if url else ""
    return (f'<li id="r-{r["n"]}" data-n="{r["n"]}" data-t="{when}" data-v="{"" if v is None else v}" '
            f'data-k="{esc(sd.nkey(r["title"]))}" data-sys="{esc("|".join(r["systems"]))}" style="--c:{color}">\n'
            f'<details class="rv"><summary>'
            f'<span class="num">{r["n"]}</span>'
            f'<span class="who"><b>{esc(r["title"])}</b><span>{esc(sysl)} &middot; <time datetime="{r["date"]}">{nice_date(r["date"])}</time></span></span>'
            f'{rating}<i class="arrow" aria-hidden="true"></i></summary>\n'
            f'<div class="body"><blockquote{cite}>{esc(r["text"])}</blockquote>{pic}\n'
            f'<p class="rmeta">{"".join(links)}</p></div>\n'
            f'</details></li>\n')


def sync_index(revs):
    """REVIEWED in index.html: shelf nkey -> [number, score], for the shelf rows."""
    rv = {}
    for r in revs:
        keys = {sd.nkey(s["title"]) for s in r["shelf"]} or {sd.nkey(r["title"])}
        for k in sorted(keys):
            rv[k] = [r["n"], r["score"]]
    p = os.path.join(sd.ROOT, "index.html")
    src = open(p, encoding="utf-8").read()
    new = "const REVIEWED = " + json.dumps(rv, separators=(",", ":"), ensure_ascii=False) + ";"
    src2 = re.sub(r"const REVIEWED = \{.*?\};", lambda m: new, src, count=1)
    if src2 != src:
        open(p, "w", encoding="utf-8").write(src2)


def sync_lists(revs):
    """REVIEWS in lists.html: [number, title, score], for the score badges on lists."""
    rows = [f'[{r["n"]},{json.dumps(r["title"], ensure_ascii=False)},{fmt_score(r["score"]) or "null"}]' for r in revs]
    lines, cur = [], []
    for x in rows:
        cur.append(x)
        if len(",".join(cur)) > 90:
            lines.append(" " + ",".join(cur)); cur = []
    if cur:
        lines.append(" " + ",".join(cur))
    new = "const REVIEWS = [\n" + ",\n".join(lines) + "\n];"
    p = os.path.join(sd.ROOT, "lists.html")
    src = open(p, encoding="utf-8").read()
    src2 = re.sub(r"const REVIEWS = \[\n[\s\S]*?\n\];", lambda m: new, src, count=1)
    if src2 != src:
        open(p, "w", encoding="utf-8").write(src2)


def build():
    revs = sorted(load(), key=lambda r: r["n"])
    systems, games = sd.load_shelf()
    colors = {s["name"]: s["color"] for s in systems}
    onlists = list_counts(revs, games)
    tally = {}
    for r in revs:
        for s in r["systems"]:
            tally[s] = tally.get(s, 0) + 1
    order = sorted(tally, key=lambda s: (-tally[s], s))
    scored = [r["score"] for r in revs if r["score"] is not None]
    avg = sum(scored) / len(scored)
    fives = sum(1 for v in scored if v == 5)
    nums = [r["n"] for r in revs]
    gaps = [n for n in range(1, max(nums) + 1) if n not in nums]
    desc = (f"My Honest and Unpopular Reviews from X, all {len(revs)} of them: the full review, "
            f"the score out of five, and a link to the post.")
    h = [head("The Nostalgia Pro \u2014 Honest and Unpopular Reviews", desc, "/reviews.html", None, "940px", CSS)]
    h.append('<body>\n<div class="wrap">\n\n<header>\n  <p class="wordmark"><a href="/index.html">The Nostalgia Pro</a></p>\n')
    h.append("  <h1>Honest and Unpopular Reviews</h1>\n")
    h.append("  <p class=\"standfirst\">Every game I've reviewed on X, newest first. Open one to read the whole review, "
             "or go to the post on X. Filter by console, or sort by number, rating or title.</p>\n")
    h.append(nav("/reviews.html"))
    h.append('  <div class="scores">\n'
             f'    <div class="score"><b>{len(revs)}</b><span>reviews</span></div>\n'
             f'    <div class="score"><b>{len(order)}</b><span>consoles</span></div>\n'
             f'    <div class="score"><b>{avg:.1f}</b><span>average</span></div>\n'
             f'    <div class="score"><b>{fives}</b><span>perfect scores</span></div>\n  </div>\n')
    h.append('</header>\n\n')
    h.append('<p class="barlabel">Console</p>\n<div class="chips" id="sysChips">\n'
             f'  <button class="chip" data-sys="all" aria-pressed="true">All<em>{len(revs)}</em></button>\n')
    for s in order:
        h.append(f'  <button class="chip" data-sys="{esc(s)}" aria-pressed="false">{esc(s)}<em>{tally[s]}</em></button>\n')
    h.append('</div>\n\n<p class="barlabel">Sort</p>\n<div class="chips" id="sortChips">\n')
    for k, label, on in [("new", "Newest", True), ("num", "By number", False), ("high", "Highest rated", False),
                         ("low", "Lowest rated", False), ("az", "Title A\u2013Z", False)]:
        h.append(f'  <button class="chip" data-sort="{k}" aria-pressed="{"true" if on else "false"}">{label}</button>\n')
    h.append('</div>\n\n<div class="tools"><p>Tap a review to read it</p>'
             '<button class="chip" id="openall" type="button" aria-pressed="false">Open all</button></div>\n')
    h.append('<ol class="reviews" id="list">\n')
    for r in sorted(revs, key=lambda r: (r["date"], r.get("time") or ""), reverse=True):
        h.append(item(r, colors, onlists))
    h.append('</ol>\n<p class="empty" id="empty" hidden>Nothing reviewed on that one yet.</p>\n\n')
    h.append('<p class="note">Each review is copied word for word from my post on X. Scores are out of five.</p>\n\n</div>\n')
    h.append(JS)
    h.append(FOOT_JS)
    with open(os.path.join(sd.ROOT, "reviews.html"), "w", encoding="utf-8") as f:
        f.write("".join(h))
    sync_index(revs)
    sync_lists(revs)
    add_to_sitemap("/reviews.html")
    print(f"reviews.html: {len(revs)} reviews (Nos. {min(nums)}-{max(nums)}"
          f"{', no ' + ', '.join(map(str, gaps)) if gaps else ''}), {len(order)} consoles, avg {avg:.2f}")


if __name__ == "__main__":
    build()
