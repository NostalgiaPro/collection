"""Make the On this day share card for a date, as a PNG.

    python3 tools/otd_card.py                      # today (Arizona time) -> otd-MM-DD.png
    python3 tools/otd_card.py 10-26 out.png        # or 2026-10-26
    python3 tools/otd_card.py 2026-12-25 ~/xmas.png

It opens onthisday.html in headless Chromium (served from this repo on a
local port) and calls the page's own npOtdCard(), so the PNG is exactly the
card the "Share today's card" button makes: 1200x675, the date, 3 to 5 of
that day's items (shelf items first, marked ON MY SHELF), and the URL.
Needs Playwright (see _browser.py) and an internet connection for the
Google Fonts the site uses.
"""
import argparse, os, re, sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _browser


def parse(s):
    if not s:
        d = datetime.now(timezone(timedelta(hours=-7)))
        return d.month, d.day
    m = re.fullmatch(r"(?:\d{4}-)?(\d{1,2})-(\d{1,2})", s)
    if not m:
        raise SystemExit("Date must be MM-DD or YYYY-MM-DD")
    return int(m.group(1)), int(m.group(2))


def main():
    ap = argparse.ArgumentParser(description="On this day share card -> PNG")
    ap.add_argument("date", nargs="?", help="MM-DD or YYYY-MM-DD (default: today, Arizona time)")
    ap.add_argument("out", nargs="?", help="output PNG (default: otd-MM-DD.png)")
    a = ap.parse_args()
    m, d = parse(a.date)
    out = a.out or f"otd-{m:02d}-{d:02d}.png"
    with _browser.serve() as base, _browser.page() as pg:
        pg.goto(f"{base}/onthisday.html?d={m:02d}-{d:02d}", wait_until="load")
        pg.wait_for_function("typeof window.npOtdCard === 'function'")
        url = pg.evaluate("([m, d]) => npOtdCard(m, d).then(c => c.toDataURL('image/png'))", [m, d])
    print(_browser.save_data_url(url, out))


if __name__ == "__main__":
    main()
