#!/usr/bin/env python3
"""Rebuild the games in EVENTS on anniversaries.html from the shelf.

    python3 tools/build_anniversaries.py

Offline and quick. Every game on the shelf (the RAW block in index.html)
that has a release date (RELEASED in index.html, or a verified fill from
tools/data/released_fills.json, joined in sitedata.py) gets one row, with
its shelf title and system, so the page only ever lists what's on the
shelf and its photo filename matches the shelf's. Year-only dates are left
out, since they can't land on a month or a day. The hardware rows at the
top of EVENTS are kept as they are (edit those by hand).
build_game_pages.py runs this at the end, so the page keeps up with the
shelf whenever the game pages are rebuilt."""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitedata as sd

PAGE = os.path.join(sd.ROOT, "anniversaries.html")
HW_RE = re.compile(r'^\s*\[\d+,\d+,\d{4},"(?:[^"\\]|\\.)*","(?:[^"\\]|\\.)*","hw"\],?\s*(//.*)?$')


def main():
    systems, games = sd.load_shelf()
    order = {s["name"]: i for i, s in enumerate(systems)}
    src = open(PAGE, encoding="utf-8").read()
    m = re.search(r"(const EVENTS = \[\n)([\s\S]*?)(\n\];)", src)
    if not m:
        sys.exit("anniversaries.html: no EVENTS block")
    hw = [ln.rstrip().rstrip(",") for ln in m.group(2).split("\n") if HW_RE.match(ln)]
    # keep any trailing comment on a hardware row after its comma
    hw_rows = []
    for ln in hw:
        mm = re.match(r'^(\s*\[.*?"hw"\])\s*,?\s*(//.*)?$', ln)
        hw_rows.append((mm.group(1).strip(), mm.group(2)))
    # one row per game per system: a second copy (Limited Edition, Game of
    # the Year Edition...) shares the plain copy's date, so it would only
    # repeat the same anniversary. The plain title wins, then the shortest.
    best = {}
    for g in games:
        r = g.get("released")
        if not r or not r[0]:
            continue
        key = g["nkey"] + "|" + g["system"]
        rank = ("[" in g["title"], len(g["title"]), g["title"])
        if key not in best or rank < best[key][0]:
            best[key] = (rank, g, r)
    rows = [(order.get(g["system"], 99), r[2], r[0], r[1], g["title"], g["system"])
            for _, g, r in best.values()]
    rows.sort(key=lambda x: (x[0], x[1], x[2], x[3], x[4].lower()))
    out = ["  // ---- hardware: North American launch (Famicom and Game & Watch: Japan) ----"]
    for i, (row, comment) in enumerate(hw_rows):
        out.append(f"  {row}," + (f"  {comment}" if comment else ""))
    out.append("")
    out.append("  // ---- games: every dated game on the shelf, written by tools/build_anniversaries.py ----")
    for i, (_, y, mo, d, title, system) in enumerate(rows):
        sep = "," if i < len(rows) - 1 else ""
        out.append(f"  [{mo},{d},{y},{json.dumps(title, ensure_ascii=False)},{json.dumps(system, ensure_ascii=False)},\"\"]{sep}")
    new = src[:m.start(2)] + "\n".join(out) + src[m.end(2):]
    if new != src:
        open(PAGE, "w", encoding="utf-8").write(new)
    print(f"anniversaries.html: {len(rows)} games and {len(hw_rows)} consoles")


if __name__ == "__main__":
    main()
