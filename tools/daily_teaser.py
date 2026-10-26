"""Teaser picture for a Daily Shelf puzzle, safe to post: the day's photo at
the first (most pixelated) blur level, exactly as the game draws it, with a
small "DAILY SHELF #N" label.

    python3 tools/daily_teaser.py 2026-10-26 teaser.png
    python3 tools/daily_teaser.py today teaser.png

Prints only the puzzle number and the file path. The answer never appears in
the output, the file, or the picture beyond the pixels. The pixelation code
is the same as paint() in daily.html (the 600x800 canvas, block size
BLOCKS[0] read from daily.html), scaled up 1.5x with hard pixel edges to
900x1200 (the photos' 3:4 shape). Needs Playwright (see _browser.py).
"""
import json, os, re, sys
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _browser

ROOT = _browser.ROOT

PAGE = """<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap" rel="stylesheet">
</head><body style="margin:0;background:#101219"></body></html>"""

DRAW = """async ([src, block, n]) => {
  try { await document.fonts.load('700 30px "Silkscreen"'); } catch (e) {}
  const IMG = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  /* paint(), as in daily.html */
  const cv = document.createElement("canvas"); cv.width = 600; cv.height = 800;
  const ctx = cv.getContext("2d"), W = 600, H = 800;
  const iw = IMG.naturalWidth, ih = IMG.naturalHeight, s = Math.max(W / iw, H / ih);
  const sw = W / s, sh = H / s, sx = (iw - sw) / 2, sy = (ih - sh) / 2;
  ctx.fillStyle = "#0b0d12"; ctx.fillRect(0, 0, W, H);
  const w = Math.ceil(W / block), h = Math.ceil(H / block);
  const off = document.createElement("canvas"); off.width = w; off.height = h;
  const o = off.getContext("2d"); o.imageSmoothingEnabled = true; o.imageSmoothingQuality = "high";
  o.drawImage(IMG, sx, sy, sw, sh, 0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, w, h, 0, 0, w * block, h * block);
  /* 1.5x, hard edges */
  const out = document.createElement("canvas"); out.width = 900; out.height = 1200;
  const c = out.getContext("2d"); c.imageSmoothingEnabled = false;
  c.drawImage(cv, 0, 0, 900, 1200);
  /* the label */
  const lbl = "DAILY SHELF #" + n;
  c.font = '700 30px "Silkscreen", monospace';
  const lw = c.measureText(lbl).width;
  c.fillStyle = "rgba(11,13,18,.88)"; c.fillRect(28, 28, lw + 36, 58);
  c.fillStyle = "#ff4b3e"; c.fillRect(28, 28, 6, 58);
  c.fillStyle = "#eceae2"; c.fillText(lbl, 50, 68);
  return out.toDataURL("image/png");
}"""


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: daily_teaser.py DATE|today OUT.png")
    arg, out = sys.argv[1], sys.argv[2]
    az = datetime.now(timezone(timedelta(hours=-7))).date()
    day = az if arg == "today" else date.fromisoformat(arg)
    sched = json.load(open(os.path.join(ROOT, "data", "daily.json"), encoding="utf-8"))
    games = json.load(open(os.path.join(ROOT, "data", "shelf-games.json"), encoding="utf-8"))["games"]
    i = (day - date.fromisoformat(sched["epoch"])).days
    if i < 0:
        raise SystemExit("That date is before Daily Shelf #1 (%s)." % sched["epoch"])
    slug = sched["days"][i % len(sched["days"])]
    g = next(g for g in games if g["k"] == slug)
    html = open(os.path.join(ROOT, "daily.html"), encoding="utf-8").read()
    block = int(re.search(r"const BLOCKS = \[(\d+)", html).group(1))
    with _browser.serve() as base, _browser.page() as pg:
        pg.route(base + "/__teaser", lambda r: r.fulfill(status=200, content_type="text/html", body=PAGE))
        pg.goto(base + "/__teaser")
        url = pg.evaluate(DRAW, ["/" + g["i"], block, i + 1])
    path = _browser.save_data_url(url, out)
    print(i + 1)
    print(path)


if __name__ == "__main__":
    main()
