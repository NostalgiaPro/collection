"""Print the Daily Shelf answers for a range of dates (Arizona time).

    python3 tools/daily_answers.py                       # today
    python3 tools/daily_answers.py 2026-10-26 2026-11-01 # a range, inclusive
    python3 tools/daily_answers.py --week                # the last 7 days, ending today
    python3 tools/daily_answers.py --week --md           # as a Markdown list for Substack

Reads data/daily.json and data/shelf-games.json (written by build_daily.py),
the same files daily.html reads, so the answers always match the site.
"""
import argparse, json, os
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://thenostalgiapro.com"
AZ = timezone(timedelta(hours=-7))


def load():
    with open(os.path.join(ROOT, "data", "daily.json"), encoding="utf-8") as f:
        sched = json.load(f)
    with open(os.path.join(ROOT, "data", "shelf-games.json"), encoding="utf-8") as f:
        data = json.load(f)
    return sched, data


def answer(sched, data, d):
    epoch = date.fromisoformat(sched["epoch"])
    n = (d - epoch).days
    if n < 0:
        return None
    days = sched["days"]
    slug = days[n] if n < len(days) else days[n % len(days)]
    g = next((g for g in data["games"] if g["k"] == slug), None)
    system = data["systems"][g["s"]]["n"] if g else "?"
    return {"number": n + 1, "date": d.isoformat(), "slug": slug,
            "title": g["d"] if g else slug, "system": system,
            "year": g.get("y") if g else None,
            "url": f"{SITE}/game/{slug}.html" if g and g.get("p") else None}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("start", nargs="?", help="first date, YYYY-MM-DD (default: today in Arizona)")
    ap.add_argument("end", nargs="?", help="last date, YYYY-MM-DD (default: same as start)")
    ap.add_argument("--week", action="store_true", help="the 7 days ending on START (or today)")
    ap.add_argument("--md", action="store_true", help="Markdown list with links")
    ap.add_argument("--json", action="store_true", help="JSON output")
    a = ap.parse_args()
    today = datetime.now(AZ).date()
    start = date.fromisoformat(a.start) if a.start else today
    end = date.fromisoformat(a.end) if a.end else start
    if a.week:
        start, end = end - timedelta(days=6), end
    sched, data = load()
    rows, d = [], start
    while d <= end:
        r = answer(sched, data, d)
        if r:
            rows.append(r)
        d += timedelta(days=1)
    if a.json:
        print(json.dumps(rows, indent=2, ensure_ascii=False))
        return
    for r in rows:
        when = datetime.fromisoformat(r["date"]).strftime("%a %b %-d, %Y")
        yr = f", {r['year']}" if r["year"] else ""
        if a.md:
            name = f"[{r['title']}]({r['url']})" if r["url"] else r["title"]
            print(f"- **#{r['number']}** ({when}): {name} ({r['system']}{yr})")
        else:
            print(f"#{r['number']:<4} {r['date']}  {r['title']} ({r['system']}{yr})")
    if not rows:
        print(f"No puzzles in that range. Daily Shelf #1 is {sched['epoch']}.")


if __name__ == "__main__":
    main()
