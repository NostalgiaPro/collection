#!/usr/bin/env python3
"""Build Nostalgia Pro script logo variants.

Homepage: the real script with the GAMES plate removed (no redraw).
Section marks: the same script plus a nameplate in the original GAMES style.
Letters G,A,M,E,S are taken from the real plate; other letters are constructed
from those strokes so the plate matches the original banner.
"""
from __future__ import annotations

import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = Path("/workspace/arcade-3d/np_games_script_hi.png")
# Original GAMES connected-component bbox in the hi-res asset
GAMES_BOX = (1970, 1202, 2718, 1406)  # x0,y0,x1,y1 exclusive
NAVY = np.array([4, 18, 50], dtype=np.float32)
CREAM = np.array([246, 225, 198], dtype=np.float32)
# Navy letter metrics from the real plate
LETTER_H = 138
STEM = 24
GAP = 39  # navy-to-navy gap between letters
WORD_GAP = 64  # between words; cream pinches but stays one plate
STROKE_R = 24
OUT_W = 1800

# Plate crop (with pad) used when we extracted letters, and navy boxes inside it
PLATE_PAD = 8
PLATE_CROP = (GAMES_BOX[0] - PLATE_PAD, GAMES_BOX[1] - PLATE_PAD,
              GAMES_BOX[2] + PLATE_PAD, GAMES_BOX[3] + PLATE_PAD)
# navy letter boxes in the padded plate (inclusive)
NAVY_BOXES = {
    "G": (37, 41, 139, 179),
    "A": (175, 40, 283, 177),
    "M": (321, 41, 450, 178),
    "E": (494, 41, 586, 178),
    "S": (629, 41, 722, 178),
}


def load_src() -> Image.Image:
    return Image.open(SRC).convert("RGBA")


def extract_navy_glyphs(src: Image.Image) -> dict[str, np.ndarray]:
    plate = src.crop(PLATE_CROP)
    arr = np.array(plate)
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]
    navy = (
        (alpha > 180)
        & (rgb[:, :, 0] < 40)
        & (rgb[:, :, 2] > 30)
        & (rgb[:, :, 2] > rgb[:, :, 0] + 20)
        & (rgb[:, :, 1] < 50)
    )
    glyphs = {}
    for name, (x0, y0, x1, y1) in NAVY_BOXES.items():
        m = navy[y0 : y1 + 1, x0 : x1 + 1].astype(np.uint8) * 255
        ys, xs = np.where(m > 0)
        m = m[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
        if m.shape[0] != LETTER_H:
            new_w = max(1, round(m.shape[1] * LETTER_H / m.shape[0]))
            m = np.array(
                Image.fromarray(m).resize((new_w, LETTER_H), Image.Resampling.LANCZOS)
            )
            m = (m > 96).astype(np.uint8) * 255
        # restore a pixel of edge lost to the navy threshold
        m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
        glyphs[name] = m
    return glyphs


def _rect(h, w, thick=None, r=8):
    """Filled rounded rect mask (h,w), or a frame if thick is set."""
    img = Image.new("L", (w, h), 0)
    ImageDraw.Draw(img).rounded_rectangle((0, 0, w - 1, h - 1), radius=r, fill=255)
    m = np.array(img)
    if thick is not None:
        inner = Image.new("L", (w, h), 0)
        inset = thick
        ImageDraw.Draw(inner).rounded_rectangle(
            (inset, inset, w - 1 - inset, h - 1 - inset),
            radius=max(1, r - inset // 2),
            fill=255,
        )
        m = np.where(np.array(inner) > 0, 0, m)
    return m


def _stem(h=LETTER_H, w=STEM, r=6):
    return _rect(h, w, r=r)


def _bar(w, thick=STEM, r=6):
    return _rect(thick, w, r=r)


def place(canvas, stamp, x, y):
    h, w = stamp.shape
    H, W = canvas.shape
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    sx0, sy0 = x0 - x, y0 - y
    canvas[y0:y1, x0:x1] = np.maximum(canvas[y0:y1, x0:x1], stamp[sy0 : sy0 + (y1 - y0), sx0 : sx0 + (x1 - x0)])
    return canvas



def ring(h, w, thick=STEM, r=34):
    """Rounded-rect letter ring (O / base for C, D, U)."""
    return _rect(h, w, thick=thick, r=r)


def cut_right_opening(mask, y0_frac=0.28, y1_frac=0.72, depth_from_right=None):
    """Open the right side of a ring to make a C."""
    h, w = mask.shape
    y0, y1 = int(h * y0_frac), int(h * y1_frac)
    depth = int(w * 0.55) if depth_from_right is None else depth_from_right
    out = mask.copy()
    out[y0:y1, w - depth :] = 0
    return out


def make_letters(glyphs: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    L = dict(glyphs)
    H = LETTER_H
    S = STEM
    # Shared bowl size, close to the real G (103x139)
    OW, OR = 128, 40

    L["I"] = _stem(H, S + 2, r=7)

    tw = 92
    T = np.zeros((H, tw), np.uint8)
    place(T, _bar(tw, S, r=7), 0, 0)
    place(T, _stem(H, S + 1, r=6), (tw - S) // 2, 0)
    L["T"] = T

    lw = 90
    Ltr = np.zeros((H, lw), np.uint8)
    place(Ltr, _stem(H, S + 1, r=6), 0, 0)
    place(Ltr, _bar(lw, S, r=7), 0, H - S)
    L["L"] = Ltr

    hw = 108
    Hg = np.zeros((H, hw), np.uint8)
    place(Hg, _stem(H, S + 1, r=6), 0, 0)
    place(Hg, _stem(H, S + 1, r=6), hw - S - 1, 0)
    place(Hg, _bar(hw, S, r=6), 0, H // 2 - S // 2)
    L["H"] = Hg

    # O: clean rounded ring, same weight as the original letters
    L["O"] = ring(H, OW, thick=S, r=OR)

    # C: O with a clear right-side opening
    L["C"] = cut_right_opening(L["O"], 0.26, 0.74, int(OW * 0.58))

    # D: O with a flat left stem (the left curve is covered by a bar)
    D = np.zeros((H, OW + 2), np.uint8)
    place(D, L["O"], 4, 0)
    place(D, _stem(H, S + 2, r=6), 0, 0)
    # fill any gap between stem and bowl on the left
    D[:, 0 : S + 6] = np.maximum(D[:, 0 : S + 6], _stem(H, S + 6, r=6))
    # re-punch? no — the stem should just flatten the left of O
    L["D"] = D

    # U: O with the top open, stems up
    U = L["O"].copy()
    uh, uw = U.shape
    # clear a channel at the top between the stems
    U[0 : int(uh * 0.42), S + 2 : uw - S - 2] = 0
    # extend the sides to the top (already there from O)
    L["U"] = U

    # V: two thick diagonals meeting at the bottom
    vw = 112
    V = np.zeros((H, vw), np.uint8)
    img = Image.fromarray(V)
    d = ImageDraw.Draw(img)
    # rounded thick lines
    d.line([(4, 2), (vw // 2, H - 3)], fill=255, width=S + 2)
    d.line([(vw - 5, 2), (vw // 2, H - 3)], fill=255, width=S + 2)
    d.ellipse((2, 0, 2 + S + 2, S + 2), fill=255)
    d.ellipse((vw - S - 4, 0, vw - 1, S + 2), fill=255)
    d.ellipse((vw // 2 - S // 2 - 1, H - S - 2, vw // 2 + S // 2 + 1, H - 1), fill=255)
    L["V"] = np.array(img)

    # B: stem + two D-like bowls
    bw = 102
    B = np.zeros((H, bw), np.uint8)
    place(B, _stem(H, S + 2, r=6), 0, 0)
    bowl_h = H // 2 + 8
    bowl = ring(bowl_h, 86, thick=S, r=24)
    # flatten left of each bowl
    bowl[:, 0:S] = 255
    place(B, bowl, 6, 0)
    place(B, bowl, 6, H - bowl_h)
    place(B, _stem(H, S + 2, r=6), 0, 0)
    L["B"] = B

    # P: stem + upper bowl
    pw = 98
    P = np.zeros((H, pw), np.uint8)
    place(P, _stem(H, S + 2, r=6), 0, 0)
    bowl_h = int(H * 0.60)
    bowl = ring(bowl_h, 84, thick=S, r=24)
    bowl[:, 0:S] = 255
    place(P, bowl, 6, 0)
    place(P, _stem(H, S + 2, r=6), 0, 0)
    # keep the lower stem clean (no leftover bowl)
    P[bowl_h + 2 :, S + 4 :] = 0
    L["P"] = P

    # R: P + a kicking leg
    rw = 108
    R = np.zeros((H, rw), np.uint8)
    place(R, L["P"], 0, 0)
    img = Image.fromarray(R)
    d = ImageDraw.Draw(img)
    mid = int(H * 0.52)
    d.line([(S + 16, mid), (rw - 5, H - 4)], fill=255, width=S)
    d.ellipse((rw - S - 3, H - S - 2, rw - 1, H - 1), fill=255)
    L["R"] = np.array(img)

    # N: two stems + diagonal
    nw = 110
    N = np.zeros((H, nw), np.uint8)
    place(N, _stem(H, S + 1, r=6), 0, 0)
    place(N, _stem(H, S + 1, r=6), nw - S - 1, 0)
    img = Image.fromarray(N)
    ImageDraw.Draw(img).line([(S // 2, 2), (nw - S // 2, H - 3)], fill=255, width=S)
    L["N"] = np.array(img)

    return L


def tight(mask: np.ndarray) -> np.ndarray:
    ys, xs = np.where(mask > 0)
    if len(xs) == 0:
        return mask
    return mask[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def compose_word(letters: dict[str, np.ndarray], text: str) -> np.ndarray:
    parts = []
    for ch in text:
        if ch == " ":
            parts.append(None)
            continue
        if ch not in letters:
            raise KeyError(f"missing letter {ch} for {text!r}")
        parts.append(tight(letters[ch]))
    # layout widths
    widths = []
    for p in parts:
        if p is None:
            widths.append(WORD_GAP)
        else:
            widths.append(p.shape[1])
    gaps = []
    for i, p in enumerate(parts):
        if i == 0:
            continue
        if parts[i] is None or parts[i - 1] is None:
            gaps.append(0)  # space already in widths
        else:
            gaps.append(GAP)
    total_w = sum(widths) + sum(gaps)
    canvas = np.zeros((LETTER_H, total_w), np.uint8)
    x = 0
    gi = 0
    for i, p in enumerate(parts):
        if i > 0:
            x += gaps[gi]
            gi += 1
        if p is None:
            x += WORD_GAP
            continue
        # vertical center (already LETTER_H or less)
        y = (LETTER_H - p.shape[0]) // 2
        place(canvas, p, x, y)
        x += p.shape[1]
    return canvas



def plate_from_navy(navy_mask: np.ndarray, stroke_r: int = STROKE_R) -> Image.Image:
    """Cream-outlined plate. Outline width matches the original GAMES banner."""
    pad = stroke_r + 8
    h, w = navy_mask.shape
    padded = np.zeros((h + 2 * pad, w + 2 * pad), np.uint8)
    bin_navy = (navy_mask > 127).astype(np.uint8)
    padded[pad : pad + h, pad : pad + w] = bin_navy * 255
    # Distance from a navy pixel; cream lives in (0, r]
    # Invert: distance from non-navy? We want distance *outward* from navy.
    inv = np.where(padded > 0, 0, 255).astype(np.uint8)
    dist = cv2.distanceTransform(inv, cv2.DIST_L2, 5)
    # AA band of ~1.2px around the outline edge
    edge_feather = 1.15
    cream_a = np.clip((stroke_r + edge_feather - dist) / (2 * edge_feather), 0, 1)
    cream_a = np.where(padded > 0, 1.0, cream_a)  # inside navy too, then overwritten
    navy_a = padded.astype(np.float32)
    # slight AA on navy
    navy_a = cv2.GaussianBlur(navy_a, (0, 0), 0.35)
    navy_a = np.clip(navy_a / 255.0, 0, 1)
    cream_a = np.clip(cream_a, 0, 1)
    out = np.zeros((padded.shape[0], padded.shape[1], 4), np.float32)
    alpha = np.clip(np.maximum(cream_a, navy_a), 0, 1)
    for i in range(3):
        out[:, :, i] = CREAM[i] * cream_a
        out[:, :, i] = out[:, :, i] * (1 - navy_a) + NAVY[i] * navy_a
    out[:, :, 3] = alpha * 255
    im = Image.fromarray(out.astype(np.uint8), "RGBA")
    a = np.array(im)[:, :, 3]
    ys, xs = np.where(a > 8)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def script_without_games(src: Image.Image) -> Image.Image:
    """Mask out only the GAMES plate; leave the swoosh untouched."""
    arr = np.array(src)
    x0, y0, x1, y1 = GAMES_BOX
    # Only clear pixels that belong to the isolated GAMES component.
    # Use a tight copy of the original GAMES region: everything opaque there
    # is the plate (it is a separate CC).
    region = arr[y0:y1, x0:x1]
    a = region[:, :, 3]
    region[a > 0] = (0, 0, 0, 0)
    arr[y0:y1, x0:x1] = region
    return Image.fromarray(arr, "RGBA")


def script_overlap_mask(script: Image.Image) -> np.ndarray:
    return np.array(script)[:, :, 3] > 16


def place_plate(script: Image.Image, plate: Image.Image) -> Image.Image:
    """Composite a plate into the original GAMES pocket, avoiding the swoosh."""
    base = script.copy()
    sw, sh = base.size
    pw, ph = plate.size
    # Default: right-align to original GAMES right edge, bottom-align to GAMES bottom
    gx0, gy0, gx1, gy1 = GAMES_BOX
    x = gx1 - pw
    y = gy1 - ph
    # If the plate is wider than the original, keep the right edge and extend left
    # Then back off from the swoosh if needed.
    swoosh = script_overlap_mask(base)
    plate_a = np.array(plate)[:, :, 3] > 20

    def overlaps(x, y):
        if x < 0 or y < 0 or x + pw > sw or y + ph > sh:
            return True
        region = swoosh[y : y + ph, x : x + pw]
        return np.any(region & plate_a)

    # If overlap, try shifting right, then down a little, then scale
    if overlaps(x, y):
        # shift right in 8px steps
        xx = x
        found = False
        for dx in range(0, 900, 8):
            if not overlaps(x + dx, y):
                xx = x + dx
                found = True
                break
        if found:
            x = xx
        else:
            # scale down until it fits, keeping right/bottom alignment
            for scale in [0.95, 0.9, 0.85, 0.8, 0.75, 0.7]:
                nw, nh = max(1, int(pw * scale)), max(1, int(ph * scale))
                sp = plate.resize((nw, nh), Image.Resampling.LANCZOS)
                x2, y2 = gx1 - nw, gy1 - nh
                pa = np.array(sp)[:, :, 3] > 20
                if x2 >= 0 and y2 >= 0 and x2 + nw <= sw and y2 + nh <= sh:
                    region = swoosh[y2 : y2 + nh, x2 : x2 + nw]
                    if not np.any(region & pa):
                        plate, pw, ph, x, y = sp, nw, nh, x2, y2
                        break
    base.paste(plate, (x, y), plate)
    return base


def export_webp(im: Image.Image, dest: Path, width: int = OUT_W) -> None:
    a = np.array(im)[:, :, 3]
    ys, xs = np.where(a > 8)
    im = im.crop((max(0, xs.min() - 4), max(0, ys.min() - 4), min(im.size[0], xs.max() + 5), min(im.size[1], ys.max() + 5)))
    w, h = im.size
    nh = round(h * (width / w))
    out = im.resize((width, nh), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, "WEBP", quality=92, method=6)
    print(f"wrote {dest} {out.size} {dest.stat().st_size} bytes")


def preview(im: Image.Image, dest: Path, bg=(20, 20, 30, 255), max_w=900) -> None:
    w, h = im.size
    if w > max_w:
        im = im.resize((max_w, round(h * max_w / w)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", im.size, bg)
    Image.alpha_composite(canvas, im.convert("RGBA")).convert("RGB").save(dest)


def main():
    src = load_src()
    glyphs = extract_navy_glyphs(src)
    letters = make_letters(glyphs)

    # Save letter previews
    letter_dir = Path("/tmp/logo-preview/letters")
    letter_dir.mkdir(parents=True, exist_ok=True)
    for name, m in sorted(letters.items()):
        img = Image.fromarray(m)
        bg = Image.new("RGB", (m.shape[1] + 16, m.shape[0] + 16), (20, 20, 30))
        bg.paste(img.convert("RGB"), (8, 8))
        # navy on dark is invisible — use cream for preview
        vis = np.zeros((m.shape[0], m.shape[1], 3), np.uint8)
        vis[m > 0] = (246, 225, 198)
        Image.fromarray(vis).save(letter_dir / f"{name}.png")

    # Control: reconstruct GAMES from original letters and compare
    recon = compose_word(letters, "GAMES")
    recon_plate = plate_from_navy(recon)
    orig_plate = src.crop(GAMES_BOX)
    # tight orig
    oa = np.array(orig_plate)[:, :, 3]
    ys, xs = np.where(oa > 8)
    orig_t = orig_plate.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    prev = Path("/tmp/logo-preview/variants")
    prev.mkdir(parents=True, exist_ok=True)
    # side by side
    W = orig_t.size[0] + recon_plate.size[0] + 40
    H = max(orig_t.size[1], recon_plate.size[1]) + 20
    canvas = Image.new("RGBA", (W, H), (20, 20, 30, 255))
    canvas.paste(orig_t, (10, 10), orig_t)
    canvas.paste(recon_plate, (orig_t.size[0] + 30, 10), recon_plate)
    canvas.convert("RGB").save(prev / "games_orig_vs_recon.png")

    script = script_without_games(src)
    preview(script, prev / "script_plain_dark.png")
    preview(script, prev / "script_plain_light.png", bg=(240, 240, 240, 255))

    words = {
        "plain": None,
        "games": "GAMES",  # use ORIGINAL plate, not recon
        "movies": "MOVIES",
        "tv": "TV",
        "music": "MUSIC",
        "board-games": "BOARD GAMES",
        "arcade": "ARCADE",
        "the-game": "THE GAME",
        "merch": "MERCH",
    }

    repo = Path(__file__).resolve().parents[1]
    out_dir = repo / "images"
    # also keep copies under np-script-logo
    copies = Path("/workspace/np-script-logo/assets")
    copies.mkdir(parents=True, exist_ok=True)

    for key, word in words.items():
        if word is None:
            marked = script
        elif word == "GAMES":
            # original pixels, untouched
            marked = src.copy()
        else:
            navy = compose_word(letters, word)
            plate = plate_from_navy(navy)
            preview(plate, prev / f"plate_{key}.png")
            marked = place_plate(script, plate)
        preview(marked, prev / f"logo_{key}_dark.png")
        preview(marked, prev / f"logo_{key}_light.png", bg=(240, 240, 240, 255))
        name = "np-script.webp" if key == "plain" else f"np-script-{key}.webp"
        export_webp(marked, out_dir / name)
        export_webp(marked, copies / name)

    # Also refresh arcade/img/np-script.webp as the ARCADE variant? No: arcade hub
    # references img/np-script.webp. We'll point it at the arcade variant in HTML.
    # Keep arcade/img in sync with the arcade wordmark for relative paths.
    export_webp(place_plate(script, plate_from_navy(compose_word(letters, "ARCADE"))),
                repo / "arcade/img/np-script.webp")


if __name__ == "__main__":
    main()
