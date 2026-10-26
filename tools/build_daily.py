"""Data for Daily Shelf (daily.html) and Shelf vs. Mine (match.html).

    python3 tools/build_daily.py

Writes two files:

* data/shelf-games.json  every game on the shelf (title, system, condition,
  photo, release year, beaten, genre, game page), read by match.html and
  daily.html. Same source as everything else: the RAW block in index.html.
* data/daily.json        the Daily Shelf schedule: one game per day, starting
  at EPOCH (day #1). Only games with a real photo of my copy are used.

How the schedule is picked: the photographed games, sorted by slug, get a
seeded Fisher-Yates shuffle (mulberry32, SEED below). That order is written
out, so everyone gets the same game on the same day and nothing random
happens in the browser. When it runs out it carries on with a fresh shuffle
(SEED + cycle number).

Re-running is safe. If the shelf hasn't changed, the file is left exactly
as it is. If it has, every day up to and including today (Arizona time)
stays frozen, so the archive never changes; games that left the shelf drop
out of the future days, and newly photographed games are slotted into the
future at seeded positions.
"""
import json, os, sys
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitedata as sd

EPOCH = "2026-10-26"          # Daily Shelf #1. Change only before launch.
SEED = 19851018               # fixed; changing it reshuffles everything
AZ = timezone(timedelta(hours=-7))   # Arizona: no daylight saving time

ROOT = sd.ROOT
OUT_GAMES = os.path.join(ROOT, "data", "shelf-games.json")
OUT_DAILY = os.path.join(ROOT, "data", "daily.json")


def mulberry32(a):
    """Same generator as the classic JS mulberry32, 32-bit math."""
    a &= 0xFFFFFFFF
    def nxt():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return nxt


def shuffled(items, seed):
    xs, r = list(items), mulberry32(seed)
    for i in range(len(xs) - 1, 0, -1):
        j = int(r() * (i + 1))
        xs[i], xs[j] = xs[j], xs[i]
    return xs


def display_title(t):
    """Drop [edition] tags, e.g. 'Excitebike [5 Screw]' -> 'Excitebike'."""
    import re
    return re.sub(r"\s*\[[^\]]*\]", "", t).strip()


def az_today():
    return datetime.now(AZ).date()


def day_index(d):
    return (d - date.fromisoformat(EPOCH)).days


def build_games():
    systems, games = sd.load_shelf()
    sys_list = [{"n": s["name"], "c": s["color"]} for s in systems]
    sidx = {s["name"]: i for i, s in enumerate(systems)}
    out = []
    for g in games:
        p = sd.photo_for(g["slug"])
        rel = g.get("released")
        out.append({
            "t": g["title"],
            "d": display_title(g["title"]),
            "s": sidx[g["system"]],
            "c": g["cond"],
            "k": g["slug"],
            "i": (p.lstrip("/") if p else None),
            "ph": bool(p and "placeholders" not in p),   # a real photo of my copy
            "y": (rel[2] if rel else None),
            "b": bool(g["beaten"]),
            "g": g.get("genre"),
            "p": os.path.exists(os.path.join(ROOT, "game", g["slug"] + ".html")),
        })
    return {"systems": sys_list, "games": out}


def build_schedule(data, old):
    eligible = sorted(g["k"] for g in data["games"] if g["ph"])
    eset = set(eligible)
    if old and old.get("epoch") == EPOCH and old.get("seed") == SEED and set(old.get("pool", [])) == eset:
        return old                                   # nothing changed
    if not old or old.get("epoch") != EPOCH or old.get("seed") != SEED:
        return {"epoch": EPOCH, "seed": SEED, "pool": eligible,
                "days": shuffled(eligible, SEED)}
    days = old["days"]
    keep = max(0, min(len(days), day_index(az_today()) + 1))   # past + today stay put
    frozen, future = days[:keep], [k for k in days[keep:] if k in eset]
    n = len(eligible)
    cycle_start = (keep // n) * n if n else 0
    used = set(frozen[cycle_start:]) | set(future)
    new = shuffled(sorted(eset - used), SEED + keep)
    r = mulberry32(SEED + keep + 1)
    for k in new:                                    # seeded slot in the future
        future.insert(int(r() * (len(future) + 1)), k)
    return {"epoch": EPOCH, "seed": SEED, "pool": eligible, "days": frozen + future}


def extend(sched, upto):
    """Keep the schedule at least `upto` days long, cycling with SEED + cycle."""
    pool, cyc = sched["pool"], len(sched["days"]) // max(1, len(sched["pool"]))
    while len(sched["days"]) < upto and pool:
        cyc += 1
        sched["days"] += shuffled(pool, SEED + cyc)
    return sched


def main():
    data = build_games()
    os.makedirs(os.path.dirname(OUT_GAMES), exist_ok=True)
    with open(OUT_GAMES, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    old = None
    if os.path.exists(OUT_DAILY):
        with open(OUT_DAILY, encoding="utf-8") as f:
            old = json.load(f)
    sched = extend(build_schedule(data, old), day_index(az_today()) + 366)
    with open(OUT_DAILY, "w", encoding="utf-8") as f:
        json.dump(sched, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    n = sum(g["ph"] for g in data["games"])
    print(f"{len(data['games'])} games, {n} with a photo in the Daily Shelf pool, "
          f"{len(sched['days'])} days scheduled from {EPOCH}")


if __name__ == "__main__":
    main()
