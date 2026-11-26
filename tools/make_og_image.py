#!/usr/bin/env python3
"""Draw the site's default share image (og-image.png, 1200x630) from the data,
so the game and system counts on it are never out of date.

    python3 tools/make_og_image.py

It uses the site's own fonts (fonts/*.woff2), the Nostalgia Pro wordmark and
the homepage strip covers. sync_counts.py runs it, and it only rewrites the
file when the counts change. Needs Pillow and fontTools (with brotli); if
they're missing it prints a note and does nothing."""
import io, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sitedata as sd

OUT = "og-image.png"
STAMP = os.path.join("tools", "data", "og_image_counts.json")
W, H = 1200, 630
BG, TEXT, DIM, HOT, LINE = "#101219", "#eceae2", "#8e93a2", "#ff4b3e", "#2c3040"
COVERS = ["super-mario-bros-3-nes", "legend-of-zelda-nes",
          "sonic-the-hedgehog-2-not-for-resale-sega-genesis", "goldeneye-007-nintendo-64",
          "final-fantasy-vii-playstation-1", "halo-combat-evolved-xbox",
          "metal-gear-solid-greatest-hits-playstation-1", "super-smash-bros-melee-gamecube",
          "star-fox-snes", "metroid-dread-nintendo-switch"]


def counts():
    systems, games = sd.load_shelf()
    return len(games), sum(1 for s in systems if s["games"])


def font(name, size, weight=None):
    from fontTools.ttLib import TTFont
    from PIL import ImageFont
    buf = io.BytesIO()
    t = TTFont(os.path.join(sd.ROOT, "fonts", name + ".woff2"))
    t.flavor = None
    t.save(buf)
    buf.seek(0)
    f = ImageFont.truetype(buf, size)
    if weight:
        f.set_variation_by_axes([weight])
    return f


def draw(n, ns):
    from PIL import Image, ImageDraw, ImageFilter
    img = Image.new("RGB", (W, H), BG)

    # cover strip across the top, fading into the background like the homepage
    cw, ch, gap = 132, 176, 10
    x = (W - (len(COVERS) * cw + (len(COVERS) - 1) * gap)) // 2
    for c in COVERS:
        p = os.path.join(sd.ROOT, "images", "strip", c + ".webp")
        if os.path.exists(p):
            im = Image.open(p).convert("RGB").resize((cw, ch), Image.LANCZOS)
            img.paste(im, (x, -14))
        x += cw + gap
    fade = Image.new("L", (W, H), 0)
    fd = ImageDraw.Draw(fade)
    for y in range(H):
        a = 150 if y < 40 else max(0, min(255, 150 + int((y - 40) * 105 / 120)))
        fd.line([(0, y), (W, y)], fill=a)
    img = Image.composite(Image.new("RGB", (W, H), BG), img, fade)

    # the wordmark, with a soft dark halo so it sits on the covers
    wm = Image.open(os.path.join(sd.ROOT, "images", "np-script.webp")).convert("RGBA")
    ww = 620
    wm = wm.resize((ww, round(wm.height * ww / wm.width)), Image.LANCZOS)
    wx, wy = (W - ww) // 2, 70
    halo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    halo.paste((16, 18, 25, 200), (wx, wy), wm.split()[3])
    halo = halo.filter(ImageFilter.GaussianBlur(18))
    img = img.convert("RGBA")
    img.alpha_composite(halo)
    img.alpha_composite(wm, (wx, wy))
    d = ImageDraw.Draw(img)

    def centred(y, parts):
        widths = [d.textlength(t, font=f) for t, f, _ in parts]
        x = (W - sum(widths)) / 2
        for (t, f, col), w in zip(parts, widths):
            d.text((x, y), t, font=f, fill=col)
            x += w

    y = wy + wm.height + 18
    centred(y, [("Is it on the shelf?", font("Fredoka-normal-latin", 58, 600), TEXT)])
    big = font("TitilliumWeb-700-normal-latin", 40)
    reg = font("TitilliumWeb-400-normal-latin", 40)
    centred(y + 86, [(f"{n:,}", big, HOT), (" games across ", reg, TEXT),
                     (str(ns), big, HOT), (" systems", reg, TEXT)])
    centred(y + 140, [("plus movies, TV, music and board games", font("TitilliumWeb-400-normal-latin", 28), DIM)])

    d.line([(60, H - 64), (W - 60, H - 64)], fill=LINE, width=2)
    d.rectangle([(0, H - 6), (W, H)], fill=HOT)
    small = font("Righteous-400-normal-latin", 24)
    d.text((60, H - 50), "THENOSTALGIAPRO.COM", font=small, fill=HOT)
    t = "TYPE A TITLE AND FIND OUT"
    d.text((W - 60 - d.textlength(t, font=small), H - 50), t, font=small, fill=DIM)
    return img.convert("RGB")


def main(force=False):
    n, ns = counts()
    stamp = os.path.join(sd.ROOT, STAMP)
    want = {"games": n, "systems": ns}
    if not force and os.path.exists(stamp) and json.load(open(stamp)) == want \
            and os.path.exists(os.path.join(sd.ROOT, OUT)):
        print(f"make_og_image: already shows {n} games, {ns} systems")
        return False
    try:
        img = draw(n, ns)
    except ImportError as e:
        print(f"make_og_image: skipped ({e.name} isn't installed; pip install pillow fonttools brotli)")
        return False
    img.save(os.path.join(sd.ROOT, OUT), optimize=True)
    with open(stamp, "w") as f:
        json.dump(want, f)
        f.write("\n")
    print(f"make_og_image: drew {OUT} with {n} games, {ns} systems")
    return True


if __name__ == "__main__":
    main(force="--force" in sys.argv)
