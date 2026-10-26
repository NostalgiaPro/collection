"""Read the site's own data (the shelf, beaten lists, reviews, lists) out of
the HTML files, so every generator works from the same source of truth.
Nothing here writes files."""
import json, os, re, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "tools", "data")

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import site_config as cfg


def read(name):
    with open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return f.read()


def _template(src, name):
    m = re.search(r"const %s = `([\s\S]*?)`;" % name, src)
    return m.group(1) if m else ""


def _json_const(src, name):
    m = re.search(r"const %s = (\{.*?\});\n" % name, src)
    return json.loads(m.group(1)) if m else {}


def fold(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def slug(title, system):
    """Same as slug(g) in index.html."""
    s = fold(title + "-" + system)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def sys_id(name):
    """Same as the shelf section id in index.html."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower())


def nkey(t):
    """Same as nkey() in index.html: drop [edition] tags, a leading 'the',
    and punctuation."""
    t = t.lower()
    t = re.sub(r"\s*\[[^\]]*\]", "", t)
    t = re.sub(r"^the\s+", "", t)
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def load_shelf():
    src = read("index.html")
    raw = _template(src, "RAW")
    beaten = {x.strip().lower() for x in _template(src, "BEATEN").split("\n") if x.strip()}
    endless = {x.strip().lower() for x in _template(src, "NO_ENDING").split("\n") if x.strip()}
    completed = {x.strip().lower() for x in _template(src, "COMPLETED").split("\n") if x.strip()}
    genres = _json_const(src, "GENRES")
    reviewed = _json_const(src, "REVIEWED")
    ranked = _json_const(src, "RANKED")
    released = _json_const(src, "RELEASED")
    m = re.search(r"const VIDEOS = \{([\s\S]*?)\n\};", src)
    videos = dict(re.findall(r'"([^"]+)":"([^"]+)"', m.group(1))) if m else {}
    colors = dict((k, v) for k, v in re.findall(r'"([^"]+)":\s*\["(#[0-9a-fA-F]+)"', src.split("const COLORS = {", 1)[1].split("};", 1)[0]))
    systems, games, cur = [], [], None
    for line in raw.split("\n"):
        line = line.strip()
        if not line:
            continue
        if line.startswith("## "):
            cur = {"name": line[3:].strip(), "games": []}
            cur["id"] = sys_id(cur["name"])
            cur["color"] = colors.get(cur["name"], "#9aa3b5")
            systems.append(cur)
            continue
        if cur is None:
            continue
        m = re.match(r"^(.*)\s\(([^()]*)\)$", line)
        title = m.group(1).strip() if m else line
        cond = m.group(2).strip() if m else "unknown"
        c = cond.lower()
        cls = ("cib" if c in ("cib", "cib+") else "sealed" if c == "sealed"
               else "part" if (c.startswith("missing") or c in ("partial", "manual only")) else "")
        g = {"title": title, "cond": cond, "cls": cls, "system": cur["name"],
             "system_id": cur["id"], "color": cur["color"], "slug": slug(title, cur["name"])}
        tl, tsl = title.lower(), (title + " | " + cur["name"]).lower()
        g["beaten"] = tl in beaten or tsl in beaten
        g["endless"] = (not g["beaten"]) and (tl in endless or tsl in endless)
        g["completed"] = tl in completed or tsl in completed   # 100%
        g["genre"] = genres.get(title + "|" + cur["name"])
        k = nkey(title)
        g["nkey"] = k
        g["review"] = reviewed.get(k)            # [number, score]
        g["ranks"] = ranked.get(k) or []         # [[list title, position], ...]
        g["video"] = videos.get(k + "|" + cur["name"])
        g["released"] = released.get(k + "|" + cur["name"])
        cur["games"].append(g)
        games.append(g)
    return systems, games


def photo_for(slug_):
    """First photo file that exists for this slug, as a site path, or None."""
    for pat in cfg.IMAGE_TRIES:
        p = pat.format(slug=slug_)
        if os.path.exists(os.path.join(ROOT, p)):
            return "/" + p
    return None


def _js_to_json(s):
    """lists.html writes LISTS as a JS literal; make it JSON."""
    s = re.sub(r"/\*[\s\S]*?\*/", "", s)
    s = re.sub(r'(?m)^(\s*)([A-Za-z_]\w*):', r'\1"\2":', s)
    s = re.sub(r'([{,]\s*)([A-Za-z_]\w*):', r'\1"\2":', s)
    s = re.sub(r",(\s*[\]}])", r"\1", s)
    return s


def load_lists():
    src = read("lists.html")
    m = re.search(r"const LISTS = (\[[\s\S]*?\n\]);", src)
    return json.loads(_js_to_json(m.group(1)))


def load_reviews():
    """tools/data/reviews.json (built into reviews.html by build_reviews.py):
    [number, title, system, score, [shelf slugs], X post url or None] per system it's filed under."""
    p = os.path.join(DATA, "reviews.json")
    out = []
    for r in json.load(open(p, encoding="utf-8")):
        for s in r["systems"]:
            out.append([r["n"], r["title"], s, r["score"],
                        [x["slug"] for x in r["shelf"] if x["system"] == s], r.get("url")])
    return out


def load_posts():
    p = os.path.join(DATA, "x_posts.json")
    if not os.path.exists(p):
        return []
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))
