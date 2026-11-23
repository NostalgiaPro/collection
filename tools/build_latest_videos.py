#!/usr/bin/env python3
"""Build /data/latest-videos.json for the homepage "Latest Videos" section.

Free sources only, no API keys:
  YouTube  the channel's public RSS feed (public videos only; scheduled,
           private and unlisted uploads never appear in it). Each video is
           also checked against YouTube's public oEmbed endpoint, which
           refuses private and deleted videos.
  TikTok   TikTok's own creator embed page (the profile widget TikTok offers
           for websites), which lists the newest public videos. Each video is
           checked against TikTok's public oEmbed endpoint as well.

Nothing is made up: titles are the real titles/captions with the trailing
hashtags taken off for display. If a source fails or comes back empty, the
last good list for that platform is kept, so the section never goes blank.

Exit status 0 always; prints "changed" or "unchanged" on the last line.
"""
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "latest-videos.json")

YT_CHANNEL = "UCdHnuHu3XbvwJhgM5r5ZgIA"
YT_HANDLE = "TheNostalgiaPro"
TT_USER = "rc.the.nostalgia.pro"
MAX_YT = 6          # per kind: up to 6 long videos and 6 Shorts
MAX_TT = 6
# TikTok cover links are signed and expire. Rewrite the file when the first
# one is within this many hours of expiring, even if no video changed.
TT_REFRESH_HOURS = 36

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
NS = {"a": "http://www.w3.org/2005/Atom",
      "yt": "http://www.youtube.com/xml/schemas/2015",
      "media": "http://search.yahoo.com/mrss/"}


def get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8", "replace")


def is_public_oembed(endpoint, video_url):
    """True only when the platform's public oEmbed answers for the video.
    Private, deleted and not-yet-public videos get an error there."""
    for attempt in range(3):
        try:
            st, body = get(endpoint + urllib.parse.quote(video_url, safe=""), timeout=15)
            return st == 200 and bool(json.loads(body).get("html"))
        except urllib.error.HTTPError as ex:
            if ex.code in (400, 401, 403, 404):
                return False
        except Exception:
            pass
        time.sleep(2)
    return False


def clean_title(t):
    """Drop the run of hashtags at the end (display only) and tidy spaces."""
    t = html.unescape(t or "").replace("\n", " ")
    t = re.sub(r"(\s*#[^\s#]+)+\s*$", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def iso(ts):
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def youtube(previous=()):
    st, body = get("https://www.youtube.com/feeds/videos.xml?channel_id=" + YT_CHANNEL)
    root = ET.fromstring(body)
    now = dt.datetime.now(dt.timezone.utc)
    out = []
    for e in root.findall("a:entry", NS):
        vid = e.findtext("yt:videoId", "", NS).strip()
        title = e.findtext("a:title", "", NS)
        pub = e.findtext("a:published", "", NS)
        link = (e.find("a:link", NS).get("href") if e.find("a:link", NS) is not None else "") or ""
        if not re.fullmatch(r"[\w-]{11}", vid) or not title or not pub:
            continue
        when = dt.datetime.fromisoformat(pub.replace("Z", "+00:00"))
        if when > now:          # belt and braces: never show anything not out yet
            continue
        short = "/shorts/" in link
        url = ("https://www.youtube.com/shorts/" if short else "https://www.youtube.com/watch?v=") + vid
        if not is_public_oembed("https://www.youtube.com/oembed?format=json&url=", url):
            continue
        out.append({
            "id": vid,
            "kind": "short" if short else "video",
            "title": clean_title(title) or title.strip(),
            "url": url,
            # maxresdefault: 1280x720 for videos, the vertical 720x1280 frame for Shorts.
            "thumb": "https://i.ytimg.com/vi/%s/maxresdefault.jpg" % vid,
            "thumb_alt": "https://i.ytimg.com/vi/%s/hqdefault.jpg" % vid,
            "published": when.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        })
    # The RSS feed only holds the newest 15 uploads, so on a heavy Shorts day the
    # long videos could fall out of it. Carry over videos from the last run that
    # are still public (re-checked with oEmbed) so each row stays full.
    seen = {v["id"] for v in out}
    for v in previous or []:
        if not isinstance(v, dict) or v.get("id") in seen or not v.get("url"):
            continue
        if is_public_oembed("https://www.youtube.com/oembed?format=json&url=", v["url"]):
            out.append(v)
            seen.add(v["id"])
    out.sort(key=lambda v: v.get("published", ""), reverse=True)
    vids = [v for v in out if v["kind"] == "video"][:MAX_YT]
    shorts = [v for v in out if v["kind"] == "short"][:MAX_YT]
    return vids + shorts


def tiktok():
    st, body = get("https://www.tiktok.com/embed/@" + TT_USER)
    m = re.search(r'<script id="__FRONTITY_CONNECT_STATE__"[^>]*>(.*?)</script>', body, re.S)
    if not m:
        raise RuntimeError("TikTok creator embed: state block not found")
    data = json.loads(m.group(1))
    pages = data.get("source", {}).get("data", {})
    vids = []
    for page in pages.values():
        if isinstance(page, dict) and isinstance(page.get("videoList"), list):
            vids = page["videoList"]
            break
    now = dt.datetime.now(dt.timezone.utc).timestamp()
    rows = []
    for v in vids:
        vid = str(v.get("id", ""))
        if not vid.isdigit() or v.get("privateItem") or v.get("authorUniqueId") != TT_USER:
            continue
        ts = int(vid) >> 32          # TikTok ids carry the post time in their top 32 bits
        if ts > now:
            continue
        rows.append((ts, vid, v))
    rows.sort(reverse=True)          # newest first; pinned older videos fall back into place
    out = []
    for ts, vid, v in rows:
        url = "https://www.tiktok.com/@%s/video/%s" % (TT_USER, vid)
        if not is_public_oembed("https://www.tiktok.com/oembed?url=", url):
            continue
        thumb = v.get("originCoverUrl") or v.get("coverUrl") or ""
        exp = re.search(r"[?&]x-expires=(\d+)", thumb)
        out.append({
            "id": vid,
            "title": clean_title(v.get("desc", "")) or "TikTok video",
            "url": url,
            "thumb": thumb,
            "thumb_expires": int(exp.group(1)) if exp else None,
            "published": iso(ts),
        })
        if len(out) >= MAX_TT:
            break
    return out


def main():
    try:
        with open(OUT) as f:
            old = json.load(f)
    except Exception:
        old = {}
    new = {"youtube": old.get("youtube", []), "tiktok": old.get("tiktok", [])}
    notes = []
    for key, fn in (("youtube", lambda: youtube(old.get("youtube", []))), ("tiktok", tiktok)):
        try:
            got = fn()
            if got:
                new[key] = got
                notes.append("%s: %d videos" % (key, len(got)))
            else:
                notes.append("%s: source returned nothing, kept last good list" % key)
        except Exception as ex:
            notes.append("%s: failed (%s), kept last good list" % (key, ex))

    def sig(d):
        return json.dumps({k: [{x: i.get(x) for x in ("id", "title", "url", "kind")} for i in d.get(k, [])]
                           for k in ("youtube", "tiktok")}, sort_keys=True)

    now = dt.datetime.now(dt.timezone.utc).timestamp()
    old_exp = [i.get("thumb_expires") for i in old.get("tiktok", []) if i.get("thumb_expires")]
    stale = bool(old_exp) and min(old_exp) - now < TT_REFRESH_HOURS * 3600
    changed = sig(old) != sig(new) or stale or "updated" not in old
    for n in notes:
        print(n)
    if changed:
        new = {"updated": iso(now), "channels": {
            "youtube": "https://www.youtube.com/@" + YT_HANDLE,
            "tiktok": "https://www.tiktok.com/@" + TT_USER}, **new}
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "w") as f:
            json.dump(new, f, indent=1, ensure_ascii=False)
            f.write("\n")
        print("changed")
    else:
        print("unchanged")


if __name__ == "__main__":
    sys.exit(main())
