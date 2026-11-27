#!/usr/bin/env python3
"""Write the shelf's game and system counts into the hand-made pages' share
tags, titles and no-JavaScript fallbacks, so every count comes from the data
(the RAW block in index.html, read by sitedata.load_shelf()).

    python3 tools/sync_counts.py

build_game_pages.py runs it at the end, and it redraws og-image.png
(make_og_image.py) when the counts change. It also rewrites standing
whole-collection lines ("collection of N games", "total physical owned
game count to N") on published pages and in data/new-this-week.json.
Safe to run any time."""
import os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitedata as sd

PAGES = ["index.html", "stats.html", "consoles.html", "shelf.html"]
# other hand-made pages: only the share-image text ("N games on the shelf")
# in the <head> and any element marked data-count="games" in the body
SHARE_ONLY = re.compile(r"(?<![\d,])\d{3,4}(?= games on the shelf\b)")
SKIP_DIR = re.compile(r"^(?:[^/]*-test|preview|game|console|\.git|node_modules)(?:/|$)")


def main():
    systems, games = sd.load_shelf()
    n, ns = len(games), sum(1 for s in systems if s["games"])
    changed = []
    for name in PAGES:
        p = os.path.join(sd.ROOT, name)
        if not os.path.exists(p):
            continue
        src = open(p, encoding="utf-8").read()
        # only the <head> (titles, share tags) and the marked fallbacks in the body,
        # so game titles in the data are never touched
        h = src.index("</head>")
        head, body = src[:h], src[h:]
        head = re.sub(r"(?<![\d,])\d{3,4}\+?(?= (?:physical )?[Gg]ames\b)", str(n), head)
        head = re.sub(r"(?<![\d,])\d{1,2}(?= (?:consoles|systems)\b)", str(ns), head)
        body = re.sub(r'(<b id="gamecount">)\d+(</b>)', rf"\g<1>{n}\g<2>", body)
        body = re.sub(r"(<b data-syscount>)\d+(</b>)", rf"\g<1>{ns}\g<2>", body)
        body = re.sub(r'(<[a-z]+ [^>]*data-count="games"[^>]*>)\d+', rf"\g<1>{n}", body)
        out = head + body
        if out != src:
            open(p, "w", encoding="utf-8").write(out)
            changed.append(name)
    for rel in other_pages():
        p = os.path.join(sd.ROOT, rel)
        src = open(p, encoding="utf-8").read()
        if "</head>" not in src:
            continue
        h = src.index("</head>")
        head, body = src[:h], src[h:]
        head = SHARE_ONLY.sub(str(n), head)
        body = re.sub(r'(<[a-z]+ [^>]*data-count="games"[^>]*>)\d+', rf"\g<1>{n}", body)
        out = head + body
        if out != src:
            open(p, "w", encoding="utf-8").write(out)
            changed.append(rel)
    changed.extend(refresh_collection_lines(n))
    print(f"sync_counts: {n} games, {ns} systems" + (f"; updated {', '.join(changed)}" if changed else ""))
    import make_og_image   # the share image carries the same counts
    make_og_image.main()


def refresh_collection_lines(n):
    """Published copy that states the size of the whole collection.

    Test folders and preview/ are old snapshots and are left alone. The
    tweet archive in tools/data stays as posted; pagekit.clean_post_text
    fills in the shelf count when a page is built."""
    import pagekit
    changed = []
    roots = [sd.ROOT, os.path.join(sd.ROOT, "game"), os.path.join(sd.ROOT, "console"),
             os.path.join(sd.ROOT, "data")]
    seen = set()
    for base in roots:
        if not os.path.isdir(base):
            continue
        for dp, dn, fn in os.walk(base):
            rel_dir = os.path.relpath(dp, sd.ROOT).replace(os.sep, "/")
            rel_dir = "" if rel_dir == "." else rel_dir
            if re.match(r"^(?:[^/]*-test|preview)(?:/|$)", rel_dir):
                dn[:] = []
                continue
            # only the top of each root: game/ and console/ and data/ are one level,
            # and the site root should not recurse into those again
            if base == sd.ROOT:
                dn[:] = []
            for f in fn:
                if not f.endswith((".html", ".json")):
                    continue
                rel = (rel_dir + "/" + f).lstrip("/")
                if rel in seen:
                    continue
                seen.add(rel)
                p = os.path.join(dp, f)
                src = open(p, encoding="utf-8").read()
                out = pagekit.refresh_collection_counts(src, n)
                if out != src:
                    open(p, "w", encoding="utf-8").write(out)
                    changed.append(rel)
    return changed


def other_pages():
    for dp, dn, fn in os.walk(sd.ROOT):
        rel_dir = os.path.relpath(dp, sd.ROOT).replace(os.sep, "/")
        rel_dir = "" if rel_dir == "." else rel_dir
        if SKIP_DIR.match(rel_dir):
            dn[:] = []
            continue
        for f in fn:
            rel = (rel_dir + "/" + f).lstrip("/")
            if f.endswith(".html") and rel not in PAGES:
                yield rel


if __name__ == "__main__":
    main()
