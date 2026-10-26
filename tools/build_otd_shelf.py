#!/usr/bin/env python3
"""Build data/on-this-day/shelf.json: the "From my shelf" box on
onthisday.html (and the home-page teaser). For every day of the year, the
games on RC's shelf that came out that day, and the consoles he owns that
launched that day.

    python3 tools/build_otd_shelf.py

Offline and quick. Reads the shelf (the RAW block in index.html) and its
RELEASED dates through tools/sitedata.py, and the hardware launch dates
from EVENTS in anniversaries.html. A date with day 0 (month only) is left
out, since it can't land on a day. Each game links to its own page,
game/<slug>.html, with the photo the site config picks (.webp first).
build_game_pages.py runs this at the end, so the box keeps up with the
shelf whenever the game pages are rebuilt."""
import json, os, re, sys
from collections import defaultdict
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitedata as sd

OUT = os.path.join(sd.ROOT, "data", "on-this-day", "shelf.json")
# hardware dates in anniversaries.html are North American launches, except these
JAPAN_ONLY = {"Famicom", "Game & Watch"}


def hardware():
    src = sd.read("anniversaries.html")
    m = re.search(r"const EVENTS = \[([\s\S]*?)\n\];", src)
    rows = re.findall(r'^\s*\[(\d+),(\d+),(\d{4}),("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*"),"hw"\]',
                      m.group(1) if m else "", re.M)
    for mo, d, y, name, con in rows:
        yield int(mo), int(d), int(y), json.loads(name), json.loads(con)


def main():
    systems, games = sd.load_shelf()
    days = defaultdict(list)
    n_games = n_hw = 0
    for g in games:
        r = g.get("released")
        if not r or not r[1]:
            continue
        mo, d, y = r
        page = f"game/{g['slug']}.html"
        days[f"{mo:02}-{d:02}"].append({
            "y": y, "title": g["title"], "system": g["system"], "cond": g["cond"],
            "href": page if os.path.exists(os.path.join(sd.ROOT, page)) else None,
            "img": (sd.photo_for(g["slug"]) or "").lstrip("/") or None,
        })
        n_games += 1
    for mo, d, y, name, con in hardware():
        if not d:
            continue
        page = f"console/{sd.sys_id(con)}.html"
        days[f"{mo:02}-{d:02}"].append({
            "y": y, "title": name, "system": con, "hw": True,
            "where": "Japan" if con in JAPAN_ONLY else "North America",
            "href": page if os.path.exists(os.path.join(sd.ROOT, page)) else None,
            "img": (sd.photo_for(sd.slug(con, "console")) or "").lstrip("/") or None,
        })
        n_hw += 1
    for k in days:
        days[k].sort(key=lambda x: (not x.get("hw"), x["y"], x["title"].lower()))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generated": date.today().isoformat(), "days": dict(sorted(days.items()))},
                  f, ensure_ascii=False, separators=(",", ":"))
    print(f"shelf.json: {n_games} games and {n_hw} consoles on {len(days)} days")


if __name__ == "__main__":
    main()
