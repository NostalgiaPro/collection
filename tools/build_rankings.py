#!/usr/bin/env python3
"""Build rankings.html: every ranking I've posted on X, one section per list.

    python3 tools/build_rankings.py

Reads tools/data/rankings.json (the lists, the Best and Worst Games I Own
series, the tier lists and the head-to-heads, all copied word for word from
the posts) and the shelf in index.html. A ranked game links to its game page
when it's on the shelf; a console links to its console page. Every list and
every thread entry links to its post on X. Nothing is fetched. Safe to re-run.

The shelf match is strict on purpose (a wrong link is worse than none): the
name has to match a shelf title the way tools/postmatch.py does, or one of
the names in ALIASES below. When a list is about one console, or the entry
names one, only that console counts. When a title is on more than one
console and nothing says which, it isn't linked."""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitedata as sd
import site_config as cfg
from pagekit import head, nav, FOOT_JS, MONTHS
from postmatch import Matcher, SYS_ALIASES

esc = sd.esc
DATA = os.path.join(sd.DATA, "rankings.json")

# Names as written in the lists -> (shelf title, system). Only names that
# can't mean another game.
ALIASES = {
    "street fighter 2": ("Street Fighter II", "SNES"),
    "nba jam te": ("NBA Jam Tournament Edition", "SNES"),
    "yoshi s island": ("Super Mario World 2: Yoshi's Island", "SNES"),
    "super mario all stars": ("Super Mario All-Stars", "SNES"),
    "splinter cell pandora tomorrow": ("Tom Clancy's Splinter Cell: Pandora Tomorrow", "Xbox"),
    "batman the brave and the bold": ("Batman: The Brave and the Bold - The Videogame", "Wii"),
    "star wars knights of the old republic ii": ("Star Wars: Knights of the Old Republic II: The Sith Lords", "Xbox"),
    "everything or nothing": ("007: Everything or Nothing", "GameCube"),
    "nightfire": ("007: NightFire", "Xbox"),
    "tomorrow never dies": ("007: Tomorrow Never Dies", "PlayStation 1"),
    "from russia with love": ("007: From Russia With Love", "GameCube"),
    "double dragon ii": ("Double Dragon II: The Revenge", "NES"),
    "galaga": ("Galaga: Demons of Death", "NES"),
    "the empire strikes back": ("Star Wars: The Empire Strikes Back", "NES"),
    "empire strikes back": ("Star Wars: The Empire Strikes Back", "NES"),
    "super off road": ("Ivan \"Ironman\" Stewart's Super Off Road", "NES"),
    "chip n dale rescue rangers": ("Chip 'n Dale", "NES"),
    "disney s chip n dale rescue rangers": ("Chip 'n Dale", "NES"),
    "metal gear solid 3": ("Metal Gear Solid 3: Snake Eater", "PlayStation 2"),
    "halo odst": ("Halo 3: ODST", "Xbox 360"),
    "super mario wonder": ("Super Mario Bros. Wonder", "Nintendo Switch"),
    "tmnt turtles in time": ("Arcade1Up Teenage Mutant Ninja Turtles: Turtles in Time Arcade Machine", "Arcade1Up"),
}

# Console names in the console rankings -> console page id.
CONSOLES = {
    "sega dreamcast": "sega-dreamcast", "playstation 2": "playstation-2", "xbox 360": "xbox-360",
    "playstation": "playstation-1", "ps1": "playstation-1", "super nintendo": "snes", "snes": "snes",
    "xbox": "xbox", "gamecube": "gamecube", "nintendo entertainment system": "nes", "nes": "nes",
    "sega genesis": "sega-genesis", "nintendo 64": "nintendo-64",
}

TIER_COLORS = {"S": "#ff7f7f", "A": "#ffbf7f", "B": "#ffdf7f", "C": "#ffff7f", "D": "#bfff7f", "F": "#7fff7f"}

GROUPS = [("console", "By console"), ("topic", "By series and topic"), ("hardware", "Consoles"),
          ("year", "By year"), ("tiers", "Tier lists"), ("h2h", "Head-to-heads")]

CSS = """  .jump{margin:30px 0 0;border:2px solid var(--line);border-radius:2px;background:var(--bg2);padding:14px 18px}
  .jump p{margin:0 0 10px;font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.1em;color:var(--dim)}
  .jump ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px 18px}
  .jump li a{font-size:14px;color:var(--text);text-decoration:none;border-bottom:1px solid transparent}
  .jump li a:hover{border-bottom-color:var(--hot)}
  .jump li.g{grid-column:1/-1;margin:10px 0 2px}
  .jump li.g:first-child{margin-top:0}
  .jump li.g a{font-family:"Silkscreen",monospace;font-size:11px;letter-spacing:.06em;color:var(--hot)}
  .grp{margin:46px 0 0;scroll-margin-top:16px}
  .grp>h2{font-family:"Press Start 2P",monospace;font-size:14px;line-height:1.6;margin:0 0 18px;padding-bottom:10px;border-bottom:2px solid var(--line)}
  .rk{margin:0 0 22px;background:var(--bg2);border:1px solid var(--line);border-left:4px solid var(--c,var(--hot));
    border-radius:2px;padding:16px 18px;scroll-margin-top:16px}
  .rk h3{font-family:"IBM Plex Sans Condensed",sans-serif;font-size:22px;font-weight:700;line-height:1.25;margin:0}
  .rk h4{font-family:"Silkscreen",monospace;font-size:11px;letter-spacing:.08em;color:var(--c,var(--hot));margin:18px 0 6px}
  .rk .meta{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:8px 0 0;
    font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.06em;color:var(--dim)}
  .rk .meta a,.rk a.px{color:var(--dim);text-decoration:none;border:1px solid var(--line);border-radius:2px;padding:4px 8px}
  .rk .meta a:hover,.rk a.px:hover{border-color:var(--hot);color:var(--hot)}
  .rk .tag{color:var(--c,var(--hot))}
  ol.items{list-style:none;margin:14px 0 0;padding:0}
  ol.items>li{display:grid;grid-template-columns:44px minmax(0,1fr);gap:4px 10px;padding:10px 0;border-top:1px solid var(--line)}
  ol.items>li:first-child{border-top:none}
  ol.items.wide>li{grid-template-columns:150px minmax(0,1fr)}
  .pos{font-family:"Press Start 2P",monospace;font-size:12px;color:var(--c,var(--dim));padding-top:4px}
  ol.items.wide .pos{font-family:"Silkscreen",monospace;font-size:11px;letter-spacing:.04em;padding-top:3px}
  .nm{font-weight:600;font-size:16px;line-height:1.35}
  .nm a{color:var(--text);text-decoration:none;border-bottom:1px solid var(--c,var(--hot))}
  .nm a:hover{color:var(--hot)}
  .why{margin:3px 0 0;font-size:15px;color:#cfccc3}
  .ent details{margin:6px 0 0}
  .ent summary,.rk details.post>summary{cursor:pointer;font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.06em;color:var(--dim)}
  .ent summary:hover,.rk details.post>summary:hover{color:var(--hot)}
  .ent blockquote,.rk blockquote{margin:8px 0 0;white-space:pre-line;font-size:15px;line-height:1.55;overflow-wrap:anywhere}
  .ent a.px{display:inline-block;margin:8px 0 0;font-family:"Silkscreen",monospace;font-size:9px;letter-spacing:.06em}
  .nm a.px{float:right;margin:0 0 0 10px;font-weight:400;border-bottom:1px solid var(--line);color:var(--dim)}
  .rk details.post{margin:14px 0 0;border-top:1px dashed var(--line);padding-top:10px}
  .rk details.post h5{margin:12px 0 0;font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.06em;color:var(--dim)}
  details.earlier{margin:16px 0 0;border:1px dashed var(--line);border-radius:2px;padding:10px 14px}
  details.earlier>summary{cursor:pointer;font-family:"Silkscreen",monospace;font-size:11px;letter-spacing:.06em;color:var(--text)}
  details.earlier>summary:hover{color:var(--hot)}
  .bw{display:grid;grid-template-columns:64px minmax(0,1fr);gap:4px 14px;padding:12px 0;border-top:1px solid var(--line);scroll-margin-top:16px}
  .bw:first-of-type{border-top:none}
  .bw .yr{font-family:"Press Start 2P",monospace;font-size:13px;color:var(--c,var(--hot));padding-top:3px}
  .bw .pick{margin:0;font-size:15.5px}
  .bw .pick b{display:inline-block;width:52px;font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.06em;color:var(--dim);font-weight:400}
  .rk h3 a,.bw .pick a{color:inherit;text-decoration:none;border-bottom:1px solid var(--c,var(--hot))}
  .rk h3 a:hover,.bw .pick a:hover{color:var(--hot)}
  .bw .pick a.px{float:right;margin:0 0 0 10px;border:1px solid var(--line);border-radius:2px;padding:3px 7px;
    font-family:"Silkscreen",monospace;font-size:9px;letter-spacing:.06em;color:var(--dim)}
  .tiers{margin:14px 0 0;border:1px solid var(--line)}
  .tier{display:grid;grid-template-columns:58px minmax(0,1fr);border-top:1px solid var(--line)}
  .tier:first-child{border-top:none}
  .tier .tl{display:flex;align-items:center;justify-content:center;font-family:"Press Start 2P",monospace;font-size:16px;color:#1a1a1a}
  .tier .tg{padding:10px 14px;font-size:14.5px;line-height:1.6}
  .tier .tg a{color:var(--text);text-decoration:none;border-bottom:1px solid var(--line)}
  .tier .tg a:hover{color:var(--hot);border-bottom-color:var(--hot)}
  .tier .tg .px{margin-left:6px;font-family:"Silkscreen",monospace;font-size:9px}
  figure.shot{margin:14px 0 0}
  figure.shot img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:2px;background:#0a0c11}
  figure.shot figcaption{margin:6px 0 0;font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.06em;color:var(--dim)}
  figure.shot figcaption a{color:var(--dim)}
  figure.small{max-width:420px}
  .h2h .pick{margin:12px 0 0;font-size:16px}
  .h2h .pick b{font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.06em;color:var(--dim);font-weight:400;margin-right:8px}
  .h2h blockquote.q{border-left:2px solid var(--c,var(--hot));padding-left:12px;font-size:16px}
  .h2h .aside{margin:10px 0 0;font-size:13px;color:var(--dim)}
  body.y1996 .rk{background:#000;border:2px ridge #808080;border-left:6px solid var(--c,#808080)}
  body.y1996 .rk h3,body.y1996 .grp>h2{font-family:"Times New Roman",Times,serif;color:#ffff00}
  body.y1996 .nm a,body.y1996 .jump li a,body.y1996 .tier .tg a{font-family:"Times New Roman",Times,serif;color:#00ffff;text-decoration:underline;border:none}
  body.y1996 .why,body.y1996 .rk blockquote{font-family:"Times New Roman",Times,serif;color:#fff}
  @media (max-width:640px){
    .jump ul{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 14px}
    .jump li a{font-size:13px}
    .rk{padding:14px 14px}
    .rk h3{font-size:19px}
    ol.items>li{grid-template-columns:34px minmax(0,1fr)}
    ol.items.wide>li{grid-template-columns:1fr}
    .pos{font-size:10px}
    .bw{grid-template-columns:1fr}
    .tier{grid-template-columns:40px minmax(0,1fr)}
    .tier .tl{font-size:13px}
  }
"""


def load():
    with open(DATA, encoding="utf-8") as f:
        return json.load(f)


def nice_date(iso):
    y, m, d = (int(x) for x in iso.split("-"))
    return f"{MONTHS[m-1]} {d}, {y}"


def xurl(post_id):
    return f"https://x.com/{cfg.X_HANDLE}/status/{post_id}"


class Linker:
    def __init__(self):
        self.systems, games = sd.load_shelf()
        self.colors = {s["name"]: s["color"] for s in self.systems}
        self.m = Matcher(games)
        self.by = {(g["title"], g["system"]): g for g in games}
        self.linked = self.total = 0

    def game(self, name, system=None, text=""):
        """The shelf game this entry is, or None."""
        self.total += 1
        g = self._game(name, system, text)
        if g:
            self.linked += 1
        return g

    def _game(self, name, system, text):
        key = sd.nkey(re.sub(r"\s*\((?:\d{4}|[^()]*\bmovie\b[^()]*)\)\s*$", "", name, flags=re.I))
        if re.search(r"\bmovie\b", name, re.I):
            return None
        if key in ALIASES:
            return self.by.get(ALIASES[key])
        hits = self.m.match_piece(name)
        if not hits:
            return None
        if system:
            hits = [g for g in hits if g["system"] == system] or ([] if len({g["system"] for g in hits}) > 1 else hits)
        if len({g["system"] for g in hits}) > 1 and text:
            low = text.lower()
            named = {v for k, v in SYS_ALIASES.items() if re.search(r"\b" + re.escape(k) + r"\b", low)}
            hits = [g for g in hits if g["system"] in named] or hits
        if len({g["system"] for g in hits}) != 1:
            return None
        plain = [g for g in hits if "[" not in g["title"]]
        return (plain or hits)[0]


def game_link(L, name, system=None, text=""):
    g = L.game(name, system, text)
    if g:
        return f'<a href="/game/{g["slug"]}.html">{esc(name)}</a>'
    return esc(name)


def console_link(name):
    cid = CONSOLES.get(name.strip().lower())
    if cid and os.path.exists(os.path.join(sd.ROOT, "console", cid + ".html")):
        return f'<a href="/console/{cid}.html">{esc(name)}</a>'
    return esc(name)


def meta(e, label=None):
    bits = [f'<span>{nice_date(e["date"])}</span>']
    if label:
        bits.append(f'<span class="tag">{esc(label)}</span>')
    bits.append(f'<a href="{xurl(e["id"])}" target="_blank" rel="noopener">View on X</a>')
    return '<div class="meta">' + "".join(bits) + "</div>\n"


def post_text(e, single):
    """The opening and closing posts of a thread, or the whole post for a
    one-post list, folded away under the list."""
    if single:
        if not e.get("intro"):
            return ""
        return (f'<details class="post"><summary>The full post</summary>'
                f'<blockquote>{esc(e["intro"])}</blockquote></details>\n')
    parts = []
    if e.get("intro"):
        parts.append(f'<h5>How the thread opened</h5><blockquote>{esc(e["intro"])}</blockquote>')
    if e.get("outro"):
        link = (f' <a class="px" href="{xurl(e["outro_id"])}" target="_blank" rel="noopener">Post</a>'
                if e.get("outro_id") else "")
        parts.append(f'<h5>How it closed{link}</h5><blockquote>{esc(e["outro"])}</blockquote>')
    if not parts:
        return ""
    return '<details class="post"><summary>Opening and closing posts</summary>' + "".join(parts) + "</details>\n"


def item_li(L, it, system, kind="list"):
    text = " ".join(x for x in (it.get("reason"), it.get("more")) if x)
    if kind == "hardware":
        name, pos = console_link(it["name"]), it["n"]
    elif kind == "percat":
        label, _, game = it["name"].partition(": ")
        sys_ = SYS_ALIASES.get(label.strip().lower())
        extra = ""
        m = re.match(r"^(.*?)\s*(\([^()]*\))$", game)
        if m:
            game, extra = m.group(1), " " + m.group(2)
        g = L.game(game, sys_) if sys_ else None
        if not sys_:
            L.total += 1
        name = (f'<a href="/game/{g["slug"]}.html">{esc(game)}</a>' if g else esc(game)) + esc(extra)
        pos = label
    else:
        name, pos = game_link(L, it["name"], system, text), it["n"]
    px = (f' <a class="px" href="{xurl(it["id"])}" target="_blank" rel="noopener">Post</a>' if it.get("id") else "")
    h = [f'<li class="ent"><span class="pos">{esc(pos) if pos is not None else "&bull;"}</span><div>',
         f'<div class="nm">{name}{px}</div>']
    if it.get("reason"):
        h.append(f'<p class="why">{esc(it["reason"])}</p>')
    if it.get("more"):
        h.append(f'<details><summary>More</summary><blockquote>{esc(it["more"])}</blockquote></details>')
    h.append("</div></li>\n")
    return "".join(h)


def items_ol(L, items, system, kind="list"):
    cls = "items wide" if kind == "percat" else "items"
    return f'<ol class="{cls}">\n' + "".join(item_li(L, it, system, kind) for it in items) + "</ol>\n"


def list_card(L, e, color, kind=None):
    kind = kind or ("hardware" if e["group"] == "hardware" else e["kind"])
    h = [f'<article class="rk" id="{e["key"]}" style="--c:{color}">\n<h3>{esc(e["heading"])}</h3>\n',
         meta(e, "Current list" if e.get("earlier") else None)]
    if kind == "split":
        groups = []
        for it in e["items"]:
            if not groups or groups[-1][0] != it["group"]:
                groups.append((it["group"], []))
            groups[-1][1].append(it)
        for gname, its in groups:
            h.append(f'<h4>{"The best 5" if "best" in gname.lower() else "The worst 5, 1 is the worst"}</h4>\n')
            h.append(items_ol(L, its, e.get("system")))
    else:
        h.append(items_ol(L, e["items"], e.get("system"), kind))
    h.append(post_text(e, not e.get("thread")))
    if e.get("earlier"):
        o = e["earlier"]
        h.append(f'<details class="earlier"><summary>Earlier version from {nice_date(o["date"])}</summary>\n')
        h.append(meta(o, "Earlier list"))
        h.append(items_ol(L, o["items"], e.get("system")))
        h.append(post_text(o, not o.get("thread")))
        h.append("</details>\n")
    h.append("</article>\n")
    return "".join(h)


def best_worst_card(L, rows):
    h = ['<article class="rk" id="best-and-worst" style="--c:#ff4b3e">\n',
         "<h3>Best and Worst Games I Own, 1985 to 2000</h3>\n",
         '<div class="meta"><span>One year a day, August and September 2026</span></div>\n']
    for e in sorted(rows, key=lambda r: r["year"]):
        picks = []
        for n, it in enumerate(e["items"]):
            px = (f'<a class="px" href="{xurl(e["id"])}" target="_blank" rel="noopener">View on X</a>' if n == 0 else "")
            picks.append(f'<p class="pick">{px}<b>{esc(it["label"]).upper()}</b>{game_link(L, it["name"], None)}</p>')
        h.append(f'<div class="bw ent" id="best-worst-{e["year"]}"><span class="yr">{e["year"]}</span><div>'
                 + "".join(picks)
                 + f'<details><summary>The full post</summary><blockquote>{esc(e["intro"])}</blockquote></details>'
                 + '</div></div>\n')
    h.append("</article>\n")
    return "".join(h)


def tier_card(L, e, color):
    h = [f'<article class="rk" id="{e["key"]}" style="--c:{color}">\n<h3>{esc(e["heading"])}</h3>\n', meta(e)]
    if e.get("tiers"):
        h.append('<div class="tiers">\n')
        for t in e["tiers"]:
            names = ", ".join(game_link(L, n, e["system"]) for n in t["games"])
            h.append(f'<div class="tier"><span class="tl" style="background:{TIER_COLORS.get(t["tier"], "#ccc")}">{t["tier"]}</span>'
                     f'<div class="tg">{names}<a class="px" href="{xurl(t["id"])}" target="_blank" rel="noopener">Post</a></div></div>\n')
        h.append("</div>\n")
        h.append(post_text(e, True))
    else:
        from PIL import Image  # only to read the picture's size
        p = os.path.join(sd.ROOT, e["image"])
        w, hh = Image.open(p).size
        h.append(f'<figure class="shot"><a href="/{e["image"]}"><img loading="lazy" src="/{e["image"]}" width="{w}" height="{hh}" '
                 f'alt="{esc(e["heading"])}, the picture from my post on X"></a>'
                 f'<figcaption>The tier list as posted. <a href="/{e["image"]}">Open it full size</a></figcaption></figure>\n')
        if e.get("intro"):
            h.append(f'<blockquote>{esc(e["intro"])}</blockquote>\n')
    h.append("</article>\n")
    return "".join(h)


def h2h_card(L, e):
    key = "vs-" + re.sub(r"[^a-z0-9]+", "-", sd.fold(e["a"] + " " + e["b"])).strip("-")
    if e.get("photo_pick"):
        key += "-carts"
    h = [f'<article class="rk h2h" id="{key}" style="--c:#ff4b3e">\n',
         f'<h3>{game_link(L, e["a"])} vs. {game_link(L, e["b"])}</h3>\n', meta(e),
         f'<p class="pick"><b>MY PICK</b>{esc(e["pick"])}</p>\n',
         f'<blockquote class="q">{esc(e["quote"])}</blockquote>\n']
    if e.get("photo_pick"):
        h.append('<figure class="shot small"><img loading="lazy" src="/images/rankings/zelda-two-carts.webp" width="600" height="390" '
                 'alt="My gray Ocarina of Time cart next to my gold Majora\'s Mask cart"></figure>\n'
                 '<p class="aside">The gold cart in the photo is Majora\'s Mask.</p>\n')
    h.append(post_text(e, True))
    h.append("</article>\n")
    return h, key


def build():
    d = load()
    L = Linker()
    body, jump = [], []
    by_group = {}
    for e in d["lists"]:
        by_group.setdefault(e["group"], []).append(e)
    for gid, gname in GROUPS:
        sec, links = [], []
        if gid in ("console", "topic", "hardware"):
            for e in by_group.get(gid, []):
                color = L.colors.get(e.get("system"), "#ff4b3e") if gid == "console" else "#ff4b3e"
                sec.append(list_card(L, e, color))
                links.append((e["key"], e["heading"]))
        elif gid == "year":
            sec.append(best_worst_card(L, d["best_worst"]))
            links.append(("best-and-worst", "Best and Worst Games I Own, 1985 to 2000"))
            for e in by_group.get("year", []):
                sec.append(list_card(L, e, "#ff4b3e"))
                links.append((e["key"], e["heading"]))
        elif gid == "tiers":
            for e in d["tiers"]:
                sec.append(tier_card(L, e, L.colors.get(e["system"], "#ff4b3e")))
                links.append((e["key"], e["heading"]))
        elif gid == "h2h":
            for e in d["head_to_head"]:
                card, key = h2h_card(L, e)
                sec.extend(card)
                links.append((key, f'{e["a"]} vs. {e["b"]}' + (" (the two carts)" if e.get("photo_pick") else "")))
        body.append(f'<section class="grp" id="g-{gid}">\n<h2>{gname}</h2>\n' + "".join(sec) + "</section>\n\n")
        jump.append(f'<li class="g"><a href="#g-{gid}">{gname}</a></li>'
                    + "".join(f'<li><a href="#{k}">{esc(t)}</a></li>' for k, t in links))

    n_lists = (len(d["lists"]) + sum(1 for e in d["lists"] if e.get("earlier")) + len(d["best_worst"])
               + len(d["tiers"]) + len(d["head_to_head"]))
    desc = "Every ranking I've posted on X: top 10s, top 5s, tier lists, best and worst by year, and head-to-heads."
    h = [head("The Nostalgia Pro \u2014 Rankings", desc, "/rankings.html", None, "900px", CSS)]
    h.append('<body>\n<div class="wrap">\n\n<header>\n  <p class="wordmark"><a href="/index.html">The Nostalgia Pro</a></p>\n')
    h.append("  <h1>Rankings</h1>\n")
    h.append("  <p class=\"standfirst\">Every ranking I've posted on X, word for word, with a link back to each post.</p>\n")
    h.append(nav("/rankings.html"))
    h.append("</header>\n\n")
    h.append('<nav class="jump" aria-label="Jump to a list">\n<p>JUMP TO</p>\n<ul>\n' + "\n".join(jump) + "\n</ul>\n</nav>\n\n")
    h.extend(body)
    h.append('<p class="note">The most overrated games are on the <a href="/overrated.html" style="color:inherit">Overrated</a> page.</p>\n\n</div>\n')
    h.append(FOOT_JS)
    with open(os.path.join(sd.ROOT, "rankings.html"), "w", encoding="utf-8") as f:
        f.write("".join(h))
    from build_overrated import add_to_sitemap
    add_to_sitemap("/rankings.html")
    print(f"rankings.html: {n_lists} lists, {L.linked} of {L.total} names linked to the shelf")


if __name__ == "__main__":
    build()
