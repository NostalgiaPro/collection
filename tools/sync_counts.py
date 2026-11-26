#!/usr/bin/env python3
"""Write the shelf's game and system counts into the hand-made pages' share
tags, titles and no-JavaScript fallbacks, so every count comes from the data
(the RAW block in index.html, read by sitedata.load_shelf()).

    python3 tools/sync_counts.py

build_game_pages.py runs it at the end. Safe to run any time."""
import os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitedata as sd

PAGES = ["index.html", "stats.html", "consoles.html", "shelf.html"]


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
    print(f"sync_counts: {n} games, {ns} systems" + (f"; updated {', '.join(changed)}" if changed else ""))


if __name__ == "__main__":
    main()
