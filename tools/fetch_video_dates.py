#!/usr/bin/env python3
"""Record the upload date of every ASMR short linked from the shelf (VIDEOS
in index.html) in tools/data/video_dates.json, for the video part of the
game pages' structured data (Google wants an upload date).

    python3 tools/fetch_video_dates.py

Reads each public watch page once and keeps the date YouTube shows ("Jun 3,
2026"). Dates already in the file are kept, so re-running only fetches new
videos. Then re-run build_game_pages.py."""
import json, os, re, sys, time, urllib.request
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitedata as sd

OUT = os.path.join(sd.DATA, "video_dates.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def video_id(url):
    m = re.search(r"(?:youtu\.be/|/shorts/|/embed/|[?&]v=)([A-Za-z0-9_-]{11})", url or "")
    return m.group(1) if m else None


def fetch(vid):
    req = urllib.request.Request(f"https://www.youtube.com/watch?v={vid}",
                                 headers={"User-Agent": UA, "Accept-Language": "en-US,en", "Cookie": "SOCS=CAI; CONSENT=YES+1"})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    m = re.search(r'"publishDate":\{"simpleText":"([A-Z][a-z]{2} \d{1,2}, \d{4})"\}', html)
    if not m:
        return None
    return datetime.strptime(m.group(1), "%b %d, %Y").date().isoformat()


def main():
    have = json.load(open(OUT)) if os.path.exists(OUT) else {}
    _, games = sd.load_shelf()
    ids = sorted({video_id(g.get("video")) for g in games} - {None})
    for vid in ids:
        if vid in have:
            continue
        try:
            d = fetch(vid)
        except Exception as e:
            print("skip", vid, e)
            continue
        if d:
            have[vid] = d
        else:
            print("no date for", vid)
        time.sleep(0.4)
    json.dump(dict(sorted(have.items())), open(OUT, "w"), indent=1)
    print(f"{len(have)} of {len(ids)} videos dated")


if __name__ == "__main__":
    main()
