#!/usr/bin/env python3
"""The few <head> lines every public page shares, kept in one place.

    python3 tools/site_head.py

* favicon (/favicon.ico, plus the 192px PNG icon)
* the self-hosted fonts (/fonts/site.css) in place of the Google Fonts
  link, with the two most-used faces preloaded
* the GoatCounter page view (/count.js) on every page that doesn't already
  count itself (the arcade pages and /play/ have their own counter)

pagekit.head() writes the same lines into every generated page, and this
script patches the hand-made pages. It's safe to run any time: a page that
already has the block is rewritten to the same thing. Hidden test pages
(the *-test folders, /preview/) are left alone."""
import os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitedata as sd

START, END = "<!-- np-head -->", "<!-- /np-head -->"
GF_PRE = re.compile(r'[ \t]*<link rel="preconnect" href="https://fonts\.(?:googleapis|gstatic)\.com"(?: crossorigin)?>\n?')
GF_SITE = re.compile(r'<link href="https://fonts\.googleapis\.com/css2\?family=Righteous&family=Titillium\+Web:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">')
GF_FRED = re.compile(r'<link (?:href="https://fonts\.googleapis\.com/css2\?family=Fredoka:wght@500;600;700&display=swap" rel="stylesheet"|rel="stylesheet" href="https://fonts\.googleapis\.com/css2\?family=Fredoka:wght@500;600;700&display=swap")>')
SKIP_DIR = re.compile(r'^(?:[^/]*-test|preview|\.git|node_modules)(?:/|$)')

FONT_PRELOAD = ('<link rel="preload" href="/fonts/Titillium-Web-400-normal-latin.woff2" as="font" type="font/woff2" crossorigin>\n'
                '<link rel="preload" href="/fonts/Righteous-400-normal-latin.woff2" as="font" type="font/woff2" crossorigin>\n')
FONT_PRELOAD = FONT_PRELOAD.replace("Titillium-Web", "TitilliumWeb")
SITE_FONTS = '<link rel="stylesheet" href="/fonts/site.css">'
FRED_FONTS = '<link rel="stylesheet" href="/fonts/fredoka.css">'


def block(fonts=True, count=True):
    out = [START,
           '<link rel="icon" href="/favicon.ico" sizes="any">',
           '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">']
    if fonts:
        out.append(FONT_PRELOAD.rstrip("\n"))
    if count:
        out.append('<script src="/count.js" defer></script>')
    out.append(END)
    return "\n".join(out) + "\n"


def patch(src, rel):
    src = re.sub(re.escape(START) + r"[\s\S]*?" + re.escape(END) + r"\n?", "", src)
    uses_site = bool(GF_SITE.search(src)) or SITE_FONTS in src
    src = GF_SITE.sub(SITE_FONTS, src)
    src = GF_FRED.sub(FRED_FONTS, src)
    if "fonts.googleapis.com/css" not in src:
        src = GF_PRE.sub("", src)
    count = not re.search(r"""goatcounter\.com/count|gc\.zgo\.at|src=["']/count\.js""", src) and rel != "play/index.html"   # /play/ counts itself in play/js/analytics.js
    b = block(uses_site, count)
    m = re.search(r'<meta name="viewport"[^>]*>\n?', src)
    if m:
        src = src[:m.end()] + ("" if src[m.end()-1] == "\n" else "\n") + b + src[m.end():]
    else:
        src = src.replace("</head>", b + "</head>", 1)
    return src


def pages():
    for dp, dn, fn in os.walk(sd.ROOT):
        rel_dir = os.path.relpath(dp, sd.ROOT).replace(os.sep, "/")
        rel_dir = "" if rel_dir == "." else rel_dir
        if SKIP_DIR.match(rel_dir):
            dn[:] = []
            continue
        for f in fn:
            if f.endswith(".html") and not f.startswith("google"):
                yield (rel_dir + "/" + f).lstrip("/")


def main():
    n = 0
    for rel in pages():
        p = os.path.join(sd.ROOT, rel)
        src = open(p, encoding="utf-8").read()
        if "</head>" not in src:
            continue
        out = patch(src, rel)
        if out != src:
            open(p, "w", encoding="utf-8").write(out)
            n += 1
    print(f"site_head: {n} pages updated")


if __name__ == "__main__":
    main()
