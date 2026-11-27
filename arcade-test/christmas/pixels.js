/* 16-bit sprites for Mall Santa Dash. Native size is 48x96 (Santa's chair piece is 64x104).
   Dark 1px outlines, four-step ramps, nearest-neighbor when the game scales them up.
   window.MSDPix is shared by the WebGL cabinet and the flat fallback. */
(function () {
  var OUT = 0x1a1216;
  var W = 48, H = 96, SW = 64, SH = 104;
  var cache = {};

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(c) {
    if (typeof c === "number") return c & 0xffffff;
    return parseInt(String(c == null ? "888888" : c).replace("#", ""), 16) & 0xffffff;
  }
  function rgb(c) { c = num(c); return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
  function hex(r, g, b) {
    return (clamp(r, 0, 255) << 16) | (clamp(g, 0, 255) << 8) | clamp(b, 0, 255);
  }
  function mix(a, b, t) {
    var A = rgb(a), B = rgb(b);
    return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }
  function ramp(base, warm) {
    base = num(base);
    var hi = warm ? 0xffe2c4 : 0xfff6ee;
    var lo = warm ? 0x4a2814 : 0x140e12;
    return [mix(base, hi, warm ? 0.5 : 0.48), base, mix(base, lo, 0.3), mix(base, lo, 0.52)];
  }
  /* Face ramps stay in the light half. The darkest step is a soft shade, not a brown mask. */
  var SKIN = {
    f1c28e: [0xfff3e4, 0xf8d4b2, 0xecc09a, 0xd8a880],
    c98a5a: [0xf8d2ae, 0xe4b488, 0xd09a68, 0xb88450],
    "8a5a3a": [0xe0b08a, 0xc89068, 0xb07850, 0x986040],
    f6d5b0: [0xfff7ee, 0xf8e0cc, 0xecc8aa, 0xd8b090],
    b07850: [0xf0c8a4, 0xdea878, 0xc89060, 0xa87848]
  };
  function skinOf(c) {
    var k = num(c).toString(16).padStart(6, "0");
    if (SKIN[k]) return SKIN[k];
    return ramp(c, true);
  }
  function buf(w, h) { return { w: w, h: h, d: new Uint32Array(w * h) }; }
  function px(b, x, y, c) {
    x = x | 0; y = y | 0;
    if (c == null || x < 0 || y < 0 || x >= b.w || y >= b.h) return;
    b.d[y * b.w + x] = (c >>> 0) & 0xffffff;
  }
  function get(b, x, y) {
    if (x < 0 || y < 0 || x >= b.w || y >= b.h) return 0;
    return b.d[y * b.w + x];
  }
  /* Horizontal run. Ends are the outline. Light sits on the left, shadow on the right.
     bias shifts the whole run darker (positive) or lighter (negative). */
  function row(b, x, y, w, rm, bias) {
    w = w | 0;
    if (w <= 0) return;
    if (w === 1) { px(b, x, y, OUT); return; }
    for (var i = 0; i < w; i++) {
      if (i === 0 || i === w - 1) { px(b, x + i, y, OUT); continue; }
      var t = i / (w - 1);
      var idx = t < 0.2 ? 0 : t < 0.52 ? 1 : t < 0.78 ? 2 : 3;
      if ((x + y + i) & 1 && idx === 2 && t < 0.7) idx = 1;
      idx = clamp(idx + (bias || 0), 0, 3);
      px(b, x + i, y, rm[idx]);
    }
  }
  function box(b, x, y, w, h, rm) {
    for (var j = 0; j < h; j++) {
      var bias = j === 0 ? -1 : j === h - 1 ? 1 : j < 2 ? -1 : 0;
      if (j === 0 || j === h - 1) {
        for (var i = 0; i < w; i++) px(b, x + i, y + j, OUT);
      } else row(b, x, y + j, w, rm, bias);
    }
  }
  function canvasOf(b) {
    var c = document.createElement("canvas");
    c.width = b.w; c.height = b.h;
    var g = c.getContext("2d");
    var img = g.createImageData(b.w, b.h);
    for (var i = 0; i < b.d.length; i++) {
      var p = b.d[i];
      var o = i * 4;
      if (!p) continue;
      img.data[o] = (p >> 16) & 255;
      img.data[o + 1] = (p >> 8) & 255;
      img.data[o + 2] = p & 255;
      img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* Skull and face widths, top to chin. A jaw, not a circle. */
  var SKULL = [5, 8, 11, 14, 16, 18, 19, 20, 20, 20, 19, 19, 18, 17, 16, 14, 12, 10, 8];
  var FACE = [0, 0, 0, 0, 0, 0, 10, 12, 13, 14, 14, 13, 12, 11, 10, 9, 8, 6, 0];

  function roleOf(o) {
    if (o.beard || o.hat === "santa") return "santa";
    if (o.tee) return "hero";
    if (o.vest) return "clerk";
    if (o.pose === "sit" && o.scale && o.scale < 0.7) return "baby";
    if (o.pose === "sit") return "driver";
    if (o.hat === "cap" && !o.coat && !o.vest) return o.shirt === "#5a6670" || o.capc === "#3a4250" ? "janitor" : "driver";
    return "walker";
  }

  /* 3px eye: white, pupil, highlight. No box around it. */
  function eye(b, x, y, blink) {
    if (blink) {
      px(b, x, y, 0x5a3a28); px(b, x + 1, y, 0x5a3a28); px(b, x + 2, y, 0x5a3a28);
      return;
    }
    px(b, x, y, 0xfffaf4);
    px(b, x + 1, y, 0x2a1810);
    px(b, x + 2, y, 0xfffaf4);
    px(b, x + 1, y + 1, 0xc4a090);
  }
  /* Face interior. Light on the left, one soft shade on the right. No extra outline. */
  function skinRow(b, x, y, w, skin) {
    for (var i = 0; i < w; i++) {
      var t = w <= 1 ? 0 : i / (w - 1);
      px(b, x + i, y, t < 0.58 ? skin[0] : t < 0.84 ? skin[1] : skin[2]);
    }
  }

  function paintHead(b, cx, top, o, blink, view) {
    var hair = ramp(o.hair || "#4a3728");
    var skin = skinOf(o.skin || "#f1c28e");
    var bald = o.hairStyle === "bald";
    var i, y, w, fw, x0;
    for (i = 0; i < SKULL.length; i++) {
      y = top + i;
      w = SKULL[i];
      x0 = cx - (w >> 1);
      if (view === "back" || bald) {
        if (bald && view !== "back") {
          row(b, x0, y, w, skin, -1);
          if (i > 5 && i < 16) skinRow(b, x0 + 1, y, w - 2, skin);
        } else row(b, x0, y, w, hair, i < 5 ? -1 : 0);
      } else {
        row(b, x0, y, w, hair, i < 5 ? -1 : 0);
        fw = FACE[i];
        if (fw > 0) skinRow(b, cx - (fw >> 1), y, fw, skin);
      }
    }
    /* A light band across the crown, the way the reference hair reads. */
    if (!bald && view !== "back") {
      var shine = mix(o.hair || "#4a3728", 0xfff8f0, 0.7);
      for (i = 0; i < 2; i++) {
        var bw = Math.max(6, SKULL[4 + i] - 4);
        var bx0 = cx - (bw >> 1);
        for (var k = 0; k < bw; k++) {
          var here = get(b, bx0 + k, top + 4 + i);
          if (here && here !== OUT) px(b, bx0 + k, top + 4 + i, shine);
        }
      }
    }
    if (view === "back" && !bald) {
      for (i = 2; i < 8; i++) {
        var hw = Math.max(4, SKULL[i] - 6);
        var hx = cx - (hw >> 1);
        for (var n = 0; n < hw; n++) if (get(b, hx + n, top + i) !== OUT) px(b, hx + n, top + i, i < 5 ? hair[0] : hair[1]);
      }
    }
    if (o.hairStyle === "bob" && view !== "back") {
      for (i = 0; i < 14; i++) {
        row(b, cx - 13, top + 9 + i, 4, hair, i < 2 ? -1 : 0);
        row(b, cx + 9, top + 9 + i, 4, hair, 0);
      }
    } else if (!bald && view !== "back") {
      for (i = 0; i < 3; i++) {
        px(b, cx - 11, top + 17 + i, hair[1]); px(b, cx - 12, top + 17 + i, OUT);
        px(b, cx + 10, top + 17 + i, hair[1]); px(b, cx + 11, top + 17 + i, OUT);
      }
    }
    if (o.hairStyle === "bun") {
      var by = view === "back" ? top + 2 : top - 1;
      for (i = 0; i < 8; i++) row(b, cx - 3 + (i < 2 || i > 5 ? 1 : 0), by + i, i < 2 || i > 5 ? 6 : 8, hair, i < 2 ? -1 : 0);
      px(b, cx - 1, by + 2, hair[0]); px(b, cx, by + 2, hair[0]);
    }
    /* small ears, just outside the jaw, one shade and a single outline pixel */
    if (view !== "back") {
      px(b, cx - 11, top + 12, OUT); px(b, cx - 10, top + 12, skin[1]); px(b, cx - 10, top + 13, skin[2]);
      px(b, cx + 10, top + 12, OUT); px(b, cx + 9, top + 12, skin[1]); px(b, cx + 9, top + 13, skin[2]);
    } else {
      px(b, cx - 11, top + 12, skin[1]); px(b, cx + 10, top + 12, skin[1]);
    }
    if (view !== "back") {
      /* brows, then the 3px eyes, then a one-pixel nose and a 3px mouth */
      var brow = 0x6a4030;
      px(b, cx - 5, top + 10, brow); px(b, cx - 4, top + 10, brow);
      px(b, cx + 3, top + 10, brow); px(b, cx + 4, top + 10, brow);
      eye(b, cx - 5, top + 11, blink);
      eye(b, cx + 2, top + 11, blink);
      px(b, cx, top + 14, skin[2]);
      if (!o.beard) {
        px(b, cx - 1, top + 16, 0xd09088);
        px(b, cx, top + 16, 0xc07870);
        px(b, cx + 1, top + 16, 0xd09088);
      }
    }
    if (o.beard && view !== "back") {
      var furW = [8, 12, 14, 14, 14, 13, 12, 10, 8];
      var white = [0xffffff, 0xfff6ee, 0xf3e6da, 0xe4d4c6];
      for (i = 0; i < furW.length; i++) {
        var fwB = furW[i], xB = cx - (fwB >> 1), yB = top + 15 + i;
        for (var bi = 0; bi < fwB; bi++) {
          var edge = bi === 0 || bi === fwB - 1 || i === furW.length - 1;
          var tone = bi < fwB * 0.45 ? white[0] : bi < fwB * 0.75 ? white[1] : white[2];
          px(b, xB + bi, yB, edge ? OUT : tone);
        }
      }
      /* highlight along the mustache, and a small mouth so the beard stays readable */
      px(b, cx - 3, top + 16, 0xffffff); px(b, cx - 2, top + 16, 0xffffff); px(b, cx - 1, top + 16, 0xffffff);
      px(b, cx - 1, top + 17, 0xc08078); px(b, cx, top + 17, 0xa06058); px(b, cx + 1, top + 17, 0xc08078);
    }
    /* neck */
    var neckY = top + SKULL.length - 1;
    for (i = 0; i < 4; i++) {
      row(b, cx - 3, neckY + i, 6, skin, -1);
      skinRow(b, cx - 2, neckY + i, 4, skin);
    }
    return neckY + 4;
  }

  function hat(b, cx, top, o, view) {
    if (!o.hat) return;
    var col = ramp(o.hatc || o.capc || "#c2304a");
    var fur = ramp("#fff6ee");
    var i, y;
    if (o.hat === "beanie") {
      for (i = 0; i < 8; i++) {
        var w = 8 + i;
        if (i > 5) w = 16;
        row(b, cx - (w >> 1), top - 6 + i, w, col, i < 2 ? -1 : 0);
      }
      row(b, cx - 9, top + 2, 18, fur, 0);
      row(b, cx - 9, top + 3, 18, fur, 1);
      for (i = 0; i < 4; i++) row(b, cx - 2, top - 9 + i, 4, fur, i === 0 ? -1 : 0);
    } else if (o.hat === "santa") {
      row(b, cx - 10, top + 2, 20, fur, 0);
      row(b, cx - 10, top + 3, 20, fur, 1);
      for (i = 0; i < 10; i++) {
        var sw = 14 - i;
        row(b, cx - 8 + i, top - 8 + i, sw, col, i < 2 ? -1 : 0);
      }
      for (i = 0; i < 5; i++) row(b, cx + 8, top - 2 + i, 5, fur, 0);
      px(b, cx - 2, top - 4, col[0]); px(b, cx - 1, top - 5, col[0]);
    } else if (o.hat === "cap") {
      for (i = 0; i < 6; i++) {
        var cw = 12 + (i > 2 ? 2 : i);
        row(b, cx - (cw >> 1), top - 4 + i, cw, col, i < 2 ? -1 : 0);
      }
      if (view === "back") row(b, cx - 4, top + 2, 12, col, 1);
      else {
        row(b, cx - 12, top + 2, 16, col, 0);
        row(b, cx - 12, top + 3, 16, ramp(mix(o.capc || o.hatc || "#1d2b53", "#000", 0.35)), 1);
      }
    }
  }

function hand(b, x, y, skin, side, mitten) {
  var rm = mitten ? ramp(mitten) : skin;
  var i;
  for (i = 0; i < 7; i++) row(b, x, y + i, 7, rm, i > 5 ? 1 : 0);
  var tx = side < 0 ? x + 5 : x - 3;
  row(b, tx, y + 2, 4, rm, 0);
  row(b, tx, y + 3, 4, rm, 0);
  row(b, tx, y + 4, 3, rm, 1);
  if (!mitten) {
    px(b, x + 2, y + 2, rm[2]); px(b, x + 4, y + 2, rm[2]); px(b, x + 6, y + 2, rm[3]);
    px(b, x + 3, y + 5, rm[0]);
  } else {
    px(b, x + 2, y + 1, rm[0]); px(b, x + 3, y + 1, rm[0]);
  }
}

  function arm(b, x, y, len, upper, lower, mode, side, skin, mitten) {
    var i, w, yy;
    if (mode === "up") {
      for (i = 0; i < 14; i++) {
        yy = y - 12 + i;
        w = i < 8 ? 5 : 4;
        row(b, x, yy, w, i < 8 ? upper : lower, 0);
      }
      hand(b, x - 1, y - 18, skin, side, mitten);
      return;
    }
    if (mode === "out" || mode === "rest") {
      var dy = mode === "rest" ? 6 : 2;
      for (i = 0; i < 12; i++) row(b, x + side * i, y + dy, 5, i < 8 ? upper : lower, 0);
      hand(b, x + side * 12, y + dy - 1, skin, side, mitten);
      return;
    }
    var lift = mode === "fwd" ? -2 : mode === "back" ? 1 : 0;
    var ox = mode === "fwd" ? side * -1 : mode === "back" ? side * 1 : 0;
    for (i = 0; i < len; i++) {
      yy = y + i + lift;
      w = i < 3 ? 6 : i < 8 ? 5 : i < 14 ? 5 : 4;
      if (i === 8) w = 6; /* elbow */
      var rm = i < len * 0.48 ? upper : lower;
      var bias = i === 8 || i === 9 ? 1 : 0;
      row(b, x + ox + (mode === "fwd" ? side * (i > 8 ? 1 : 0) : 0), yy, w, rm, bias);
    }
    hand(b, x + ox + (side < 0 ? -1 : 0), y + len + lift, skin, side, mitten);
  }

  function leg(b, x, y, pants, skin, shorts, boots, bend) {
    var boot = ramp("#1a120c");
    var fur = ramp("#fff6ee");
    var len = bend ? 16 : 26;
    var i, w, rm, yy;
    for (i = 0; i < len; i++) {
      yy = y + i;
      w = 8;
      if (i < 5) w = 11;
      else if (i < 10) w = 10;
      else if (i < 14) w = 11; /* knee */
      else if (i < 20) w = 9;
      else if (i < 24) w = 7;
      else w = 6;
      if (bend && i > 9) w = Math.max(6, w - 2);
      var bare = shorts && i > 7;
      var booted = boots && i > len - 12;
      rm = booted ? boot : bare ? skin : pants;
      var bias = (!bare && (i === 6 || i === 12)) ? 1 : 0;
      row(b, x, yy, w, rm, bias);
      if (!booted && !bare && i > 2 && i < len - 2) px(b, x + (w >> 1), yy, pants[3]);
      if (bare && i === 10) px(b, x + 2, yy, skin[0]); /* kneecap */
    }
    if (boots) {
      var by = y + len - 12;
      row(b, x - 1, by, 8, fur, 0);
      row(b, x - 1, by + 1, 8, fur, 1);
    }
    var fy = y + len;
    var shoeW = bend ? 10 : 12;
    return { x: x - 2, y: fy, w: shoeW };
  }

  function shoe(b, ft, col, sole, skates, back) {
    var rm = ramp(col || "#eceae2");
    var sol = ramp(sole || "#241c16");
    var i;
    for (i = 0; i < 5; i++) row(b, ft.x, ft.y + i, ft.w, i > 3 ? sol : rm, i === 0 ? -1 : 0);
    row(b, ft.x, ft.y + 5, ft.w, sol, 1);
    if (!back && !skates) {
      px(b, ft.x + 2, ft.y + 1, rm[0]);
      px(b, ft.x + 3, ft.y + 2, sol[1]);
      px(b, ft.x + 4, ft.y + 2, sol[1]);
    }
    if (skates) {
      var hub = 0x143010, rim = num(col || "#9bff3f");
      for (i = 0; i < 3; i++) {
        var wx = ft.x + 1 + i * 3;
        px(b, wx, ft.y + 5, rim); px(b, wx + 1, ft.y + 5, rim);
        px(b, wx, ft.y + 6, rim); px(b, wx + 1, ft.y + 6, hub);
      }
    }
  }

  function logo(b, x, y) {
    var c = 0xc2304a, d = 0x8e1c32;
    /* N */
    var ys;
    for (ys = 0; ys < 7; ys++) { px(b, x, y + ys, c); px(b, x + 4, y + ys, c); }
    px(b, x + 1, y + 1, c); px(b, x + 1, y + 2, d); px(b, x + 2, y + 3, c); px(b, x + 3, y + 4, d); px(b, x + 3, y + 5, c);
    /* P */
    var p = x + 6;
    for (ys = 0; ys < 7; ys++) px(b, p, y + ys, c);
    px(b, p + 1, y, c); px(b, p + 2, y, c); px(b, p + 3, y + 1, c);
    px(b, p + 1, y + 2, c); px(b, p + 2, y + 2, d); px(b, p + 3, y + 1, d);
  }

  function scarf(b, cx, y, col) {
    var rm = ramp(col);
    row(b, cx - 8, y, 16, rm, 0);
    row(b, cx - 8, y + 1, 16, rm, 1);
    for (var i = 0; i < 9; i++) row(b, cx + 4, y + 2 + i, 4, rm, i > 6 ? 1 : 0);
  }

  function torso(b, cx, y, o, rm) {
    /* Shoulder slope into a waist, then hips. Returns hip y. */
    var widths = [10, 14, 18, 20, 22, 22, 21, 20, 18, 17, 16, 16, 15, 15, 16, 17, 18, 19, 20];
    var i, w;
    for (i = 0; i < widths.length; i++) {
      w = widths[i];
      var bias = i < 2 ? -1 : (i === 10 || i === 11 ? 1 : 0);
      row(b, cx - (w >> 1), y + i, w, rm, bias);
      if (i > 4 && i < 16) px(b, cx + (w >> 1) - 3, y + i, rm[3]);
    }
    return y + widths.length;
  }

  function coatOver(b, cx, y, o) {
    var rm = ramp(o.shirt || "#7a3fd0");
    var fur = ramp("#fff6ee");
    var widths = [12, 16, 20, 24, 26, 26, 25, 24, 22, 21, 20, 20, 20, 21, 22, 23, 24, 24, 25, 25, 24, 22];
    if (o.belly) widths = [12, 16, 22, 26, 28, 28, 27, 26, 26, 25, 24, 24, 24, 25, 26, 26, 25, 24, 24, 23, 22, 20];
    var i, w;
    for (i = 0; i < widths.length; i++) {
      w = widths[i];
      var bias = i < 2 ? -1 : (i > widths.length - 3 ? 1 : 0);
      row(b, cx - (w >> 1), y + i, w, rm, bias);
      /* front opening */
      if (i > 3 && i < widths.length - 2) {
        px(b, cx, y + i, rm[3]);
        px(b, cx - 1, y + i, i & 1 ? fur[1] : fur[2]);
        px(b, cx + 1, y + i, i & 1 ? fur[2] : fur[1]);
      }
    }
    var hem = y + widths.length - 1;
    row(b, cx - 12, hem, 24, o.fur ? fur : rm, 1);
    if (o.fur) row(b, cx - 12, hem - 1, 24, fur, 0);
    if (o.belly) {
      px(b, cx - 2, y + 10, rm[0]); px(b, cx - 1, y + 10, rm[0]); px(b, cx + 1, y + 11, rm[0]);
    }
    return hem + 1;
  }

  function vest(b, cx, y) {
    var rm = ramp("#f6e6ee");
    var widths = [8, 10, 12, 14, 14, 14, 13, 13, 14, 14, 15, 14];
    for (var i = 0; i < widths.length; i++) {
      var w = widths[i];
      if (i < 3) {
        /* V neck: two sides */
        row(b, cx - (w >> 1), y + i, 4, rm, 0);
        row(b, cx + (w >> 1) - 4, y + i, 4, rm, 0);
      } else row(b, cx - (w >> 1), y + i, w, rm, i > 9 ? 1 : 0);
    }
    px(b, cx, y + 6, 0xc2304a); px(b, cx, y + 9, 0xc2304a);
  }

  function poseOf(frame, o, role) {
    var p = { bob: 0, blink: false, lBend: 0, rBend: 0, lArm: "down", rArm: "down", sit: false, throne: false, slump: 0 };
    if (frame === 1) { p.bob = 1; p.blink = true; }
    else if (frame === 2) { p.lBend = 1; p.lArm = "back"; p.rArm = "fwd"; }
    else if (frame === 3) { p.bob = 1; p.lArm = "back"; p.rArm = "fwd"; }
    else if (frame === 4) { p.rBend = 1; p.lArm = "fwd"; p.rArm = "back"; }
    else if (frame === 5) { p.bob = 1; p.lArm = "fwd"; p.rArm = "back"; }
    else if (frame === 6) { p.lBend = 1; p.rBend = 1; p.lArm = "up"; p.rArm = "up"; p.bob = -2; }
    else if (frame === 7) {
      if (role === "clerk") { p.rArm = "out"; p.lArm = "down"; }
      else if (role === "janitor") { p.lArm = "fwd"; p.rArm = "fwd"; }
      else if (role === "santa") { p.rArm = "up"; p.lArm = "down"; }
      else { p.lArm = "up"; p.rArm = "up"; p.bob = -1; }
    } else if (frame === 8) { p.lBend = 1; p.rBend = 1; p.lArm = "back"; p.rArm = "back"; p.bob = 2; }
    else if (frame === 9) { p.slump = 3; p.bob = 2; p.blink = false; }
    else if (frame === 10) {
      p.sit = true;
      if (role === "santa") { p.throne = true; p.lArm = "rest"; p.rArm = "rest"; }
    }
    if (role === "baby" || (role === "driver" && frame !== 6)) p.sit = true;
    if (role === "janitor" && frame >= 2 && frame <= 5) { p.lArm = "fwd"; p.rArm = "fwd"; }
    return p;
  }

  function paintFront(b, cx, o, pose, role) {
    var skin = skinOf(o.skin || "#f1c28e");
    var shirt = ramp(o.tee ? "#f7f4ee" : (o.shirt || "#355a8a"));
    var pants = ramp(o.pants || "#243044");
    var sleeveCol = o.tee ? ramp("#f7f4ee") : (o.coat ? ramp(o.shirt) : shirt);
    var fore = (o.sleeves === "short" || o.shorts) && !o.coat && !o.mittens ? skin : sleeveCol;
    if (o.sleeves === "long" || o.coat) fore = o.mittens ? ramp(o.mittens) : sleeveCol;
    if (o.sleeves === "short" && !o.coat) fore = skin;
    var mitten = o.mittens || null;
    var top = 10 + (pose.bob || 0) + (pose.slump || 0);
    if (pose.sit && !pose.throne) top = 28 + (pose.bob || 0);
    if (pose.throne) top = 22;
    if (role === "baby") top = 30;

    if (pose.throne) paintThrone(b, cx);

    var neck = paintHead(b, cx, top, o, pose.blink, "front");
    hat(b, cx, top, o, "front");

    var ty = neck - 1;
    var axL = cx - 13, axR = cx + 6;
    var mitL = pose.lArm === "rest" ? (mitten || "#fff6ee") : (o.mittens && o.sleeves !== "short" ? mitten : null);
    var mitR = pose.rArm === "rest" ? (mitten || "#fff6ee") : (o.mittens && o.sleeves !== "short" ? mitten : null);
    function hang(which, x, side, mit) {
      if (which === "up" || which === "out" || which === "rest") return;
      arm(b, x, ty + 2, 20, sleeveCol, which === "rest" ? ramp(mitten || "#fff6ee") : fore, which, side, skin, mit);
    }
    hang(pose.lArm, axL, -1, mitL);
    hang(pose.rArm, axR, 1, mitR);
    var hip;
    if (o.coat) hip = coatOver(b, cx, ty, o);
    else hip = torso(b, cx, ty, o, shirt);
    function reach(which, x, side, mit) {
      if (which === "up") arm(b, x + (side < 0 ? 2 : 0), ty + 2, 16, sleeveCol, fore, "up", side, skin, mit);
      else if (which === "out" || which === "rest") arm(b, x, ty + 8, 14, sleeveCol, which === "rest" ? ramp(mitten || "#fff6ee") : fore, which, side, skin, which === "rest" ? (mitten || "#fff6ee") : mit);
    }
    reach(pose.lArm, axL, -1, mitL);
    reach(pose.rArm, axR, 1, mitR);
    /* hands in front of the sleeve hem */
    if (pose.lArm !== "up" && pose.lArm !== "out" && pose.lArm !== "rest") hand(b, axL - 1, ty + 20, skin, -1, mitL);
    if (pose.rArm !== "up" && pose.rArm !== "out" && pose.rArm !== "rest") hand(b, axR, ty + 20, skin, 1, mitR);
    if (o.vest) vest(b, cx, ty + 4);
    if (o.tee) logo(b, cx - 5, ty + 7);
    if (o.scarf) scarf(b, cx, ty + 1, o.scarf);
    if (o.belt || role === "santa") {
      var belt = ramp(o.belt ? "#1a120c" : "#1a120c");
      row(b, cx - 8, hip - 2, 16, belt, 0);
      box(b, cx - 2, hip - 3, 5, 4, ramp("#e0b040"));
    }
    if (o.pockets || o.shorts) {
      box(b, cx - 9, hip - 6, 5, 4, ramp("#6e6240"));
      box(b, cx + 4, hip - 6, 5, 4, ramp("#6e6240"));
    }

    if (o.fur) {
      var fur = ramp("#fff6ee");
      row(b, axL, ty + 16, 6, fur, 0);
      row(b, axR, ty + 16, 6, fur, 0);
    }

    if (pose.sit || pose.throne) {
      paintSitLegs(b, cx, hip - 2, pants, skin, o, pose.throne);
    } else {
      var lf = leg(b, cx - 12, hip - 2, pants, skin, !!o.shorts, !!o.boots, pose.lBend);
      var rf = leg(b, cx + 3, hip - 2, pants, skin, !!o.shorts, !!o.boots, pose.rBend);
      shoe(b, lf, o.shoes, o.sole, !!o.skates, false);
      shoe(b, rf, o.shoes, o.sole, !!o.skates, false);
    }

    if (role === "clerk" && pose.rArm === "out") bottle(b, cx + 24, ty + 2);
    else if (role === "clerk") bottle(b, cx + 12, hip - 4);
    if (role === "janitor") mop(b, cx + 14, ty + 8, hip + 24);
  }

  function paintSitLegs(b, cx, y, pants, skin, o, throne) {
    var i;
    /* thighs toward the camera, then boots/shoes at the bottom */
    for (i = 0; i < 8; i++) {
      row(b, cx - 14, y + i, 10, pants, i > 5 ? 1 : 0);
      row(b, cx + 4, y + i, 10, pants, i > 5 ? 1 : 0);
    }
    var boot = o.boots ? ramp("#1a120c") : ramp(o.shoes || "#1a1a1a");
    var fur = ramp("#fff6ee");
    for (i = 0; i < 14; i++) {
      row(b, cx - 12, y + 8 + i, 8, o.boots ? boot : pants, 0);
      row(b, cx + 4, y + 8 + i, 8, o.boots ? boot : pants, 0);
    }
    if (o.boots) {
      row(b, cx - 13, y + 8, 9, fur, 0);
      row(b, cx + 4, y + 8, 9, fur, 0);
    }
    shoe(b, { x: cx - 14, y: y + 22, w: 11 }, o.boots ? "#1a120c" : o.shoes, o.sole || "#0a0a0a", false, false);
    shoe(b, { x: cx + 3, y: y + 22, w: 11 }, o.boots ? "#1a120c" : o.shoes, o.sole || "#0a0a0a", false, false);
    if (throne) {
      /* mittens already on the rests; a pale fur edge under each hand */
    }
  }

  function paintThrone(b, cx) {
    var wood = ramp("#7a1830");
    var gold = ramp("#e0b040");
    var i;
    for (i = 0; i < 46; i++) {
      var w = i < 6 ? 18 : 16;
      row(b, cx - (w >> 1), 30 + i, w, wood, i < 3 ? -1 : 0);
    }
    /* crest */
    for (i = 0; i < 8; i++) row(b, cx - 4 + (i > 5 ? 1 : 0), 24 + i, 8, wood, -1);
    /* seat */
    for (i = 0; i < 6; i++) row(b, cx - 16, 70 + i, 32, wood, i > 3 ? 1 : 0);
    /* armrests */
    for (i = 0; i < 4; i++) {
      row(b, 2, 54 + i, 16, wood, 0);
      row(b, b.w - 18, 54 + i, 16, wood, 0);
    }
    for (i = 0; i < 16; i++) {
      row(b, 4, 78 + i, 4, gold, 0);
      row(b, b.w - 8, 78 + i, 4, gold, 0);
    }
  }

  function bottle(b, x, y) {
    var glass = ramp("#ff9bd2");
    var cap = ramp("#fff6fb");
    for (var i = 0; i < 8; i++) row(b, x, y + i, i < 2 ? 3 : 4, glass, 0);
    row(b, x, y - 2, 3, cap, -1);
    px(b, x + 1, y + 2, glass[0]);
  }

  function mop(b, x, y, floorY) {
    var wood = ramp("#c8a060");
    var cloth = ramp("#f4f4f4");
    var i;
    for (i = y; i < floorY; i++) row(b, x, i, 3, wood, 0);
    for (i = 0; i < 5; i++) row(b, x - 6, floorY - 2 + i, 16, cloth, i > 3 ? 1 : 0);
  }

  function paintBack(b, cx, o, pose, role) {
    var skin = skinOf(o.skin || "#f1c28e");
    var shirt = ramp(o.tee ? "#f7f4ee" : (o.shirt || "#355a8a"));
    var pants = ramp(o.pants || "#243044");
    var sleeveCol = o.tee ? ramp("#f7f4ee") : shirt;
    var fore = o.sleeves === "short" && !o.coat ? skin : sleeveCol;
    var top = 10 + (pose.bob || 0) + (pose.slump || 0);
    var neck = paintHead(b, cx, top, o, false, "back");
    hat(b, cx, top, o, "back");
    var hip = o.coat ? coatOver(b, cx, neck - 1, o) : torso(b, cx, neck - 1, o, shirt);
    if (o.tee) logo(b, cx - 5, neck + 8);
    if (o.pockets || o.shorts) {
      box(b, cx - 9, hip - 8, 6, 5, ramp("#6e6240"));
      box(b, cx + 3, hip - 8, 6, 5, ramp("#6e6240"));
    }
    var ty = neck - 1;
    arm(b, cx - 16, ty + 3, 18, sleeveCol, fore, pose.lArm === "up" ? "up" : pose.lArm, -1, skin, null);
    arm(b, cx + 10, ty + 3, 18, sleeveCol, fore, pose.rArm === "up" ? "up" : pose.rArm, 1, skin, null);
    var lf = leg(b, cx - 12, hip - 2, pants, skin, !!o.shorts, !!o.boots, pose.lBend);
    var rf = leg(b, cx + 3, hip - 2, pants, skin, !!o.shorts, !!o.boots, pose.rBend);
    shoe(b, lf, o.shoes, o.sole, !!o.skates, true);
    shoe(b, rf, o.shoes, o.sole, !!o.skates, true);
  }

  function paintBaby(b, o, pose) {
    var cx = (b.w / 2) | 0;
    var skin = skinOf(o.skin || "#f6d5b0");
    var suit = ramp(o.shirt || "#f7d6e4");
    var hatc = ramp(o.hatc || "#3f7fd0");
    var top = 58 + (pose.bob || 0);
    /* big head for a baby, still with a neck and ears */
    var hw = [8, 12, 16, 18, 20, 20, 18, 16, 14];
    var i;
    for (i = 0; i < hw.length; i++) row(b, cx - (hw[i] >> 1), top + i, hw[i], skin, i < 2 ? -1 : i > 6 ? 1 : 0);
    if (!pose.blink) {
      eye(b, cx - 7, top + 3, false);
      eye(b, cx + 2, top + 3, false);
    } else {
      eye(b, cx - 7, top + 3, true);
      eye(b, cx + 2, top + 3, true);
    }
    px(b, cx, top + 6, skin[3]);
    px(b, cx - 2, top + 8, 0xe09090); px(b, cx + 1, top + 8, 0xe09090);
    for (i = 0; i < 5; i++) row(b, cx - 6, top - 4 + i, 12, hatc, i < 2 ? -1 : 0);
    row(b, cx - 7, top + 1, 14, ramp("#fff6ee"), 0);
    for (i = 0; i < 3; i++) row(b, cx - 2, top - 7 + i, 4, ramp("#fff6ee"), 0);
    for (i = 0; i < 3; i++) row(b, cx - 2, top + 9 + i, 5, skin, 0);
    for (i = 0; i < 12; i++) {
      var w = 14 - (i > 8 ? 2 : 0);
      row(b, cx - (w >> 1), top + 12 + i, w, suit, i === 6 ? 1 : 0);
    }
    arm(b, cx - 12, top + 14, 8, suit, suit, "down", -1, skin, null);
    arm(b, cx + 6, top + 14, 8, suit, suit, "down", 1, skin, null);
    shoe(b, { x: cx - 8, y: top + 26, w: 7 }, "#f4f1ea", "#c8b8b0", false, false);
    shoe(b, { x: cx + 2, y: top + 26, w: 7 }, "#f4f1ea", "#c8b8b0", false, false);
  }

  function paintPersonBuf(o, frame) {
    o = o || {};
    var role = roleOf(o);
    var santa = role === "santa";
    var b = buf(santa ? SW : W, santa ? SH : H);
    var pose = poseOf(frame, o, role);
    if (role === "baby") paintBaby(b, o, pose);
    else if (o.view === "back") paintBack(b, (b.w / 2) | 0, o, pose, role);
    else paintFront(b, (b.w / 2) | 0, o, pose, role);
    return b;
  }

  function keyOf(o, frame) {
    return [frame, o.view || "front", o.hat || "", o.hatc || o.capc || "", o.shirt || "", o.pants || "", o.hair || "", o.hairStyle || "", o.skin || "", o.shoes || "", o.sole || "",
      o.tee ? 1 : 0, o.shorts ? 1 : 0, o.coat ? 1 : 0, o.fur ? 1 : 0, o.belly ? 1 : 0, o.beard ? 1 : 0, o.vest ? 1 : 0, o.scarf || "", o.sleeves || "",
      o.mittens || "", o.boots ? 1 : 0, o.skates ? 1 : 0, o.pockets ? 1 : 0, o.pose || "", o.scale || "", o.belt || ""].join("|");
  }

  function frame(o, index) {
    var k = keyOf(o, index);
    if (cache[k]) return cache[k];
    cache[k] = canvasOf(paintPersonBuf(o, index));
    return cache[k];
  }

  /* ---------- props and mall surfaces, same pixel density ---------- */
  function propBuf(name, opts) {
    opts = opts || {};
    if (name === "tree") return tree(64, 112, false);
    if (name === "bigTree") return tree(96, 200, true);
    if (name === "wreath") return wreath();
    if (name === "bauble") return bauble(opts.col || "#ff4b3e");
    if (name === "table") return table(opts);
    if (name === "sign") return wetSign();
    if (name === "stroller") return stroller(opts);
    if (name === "bin") return bin(opts);
    if (name === "counter") return counter();
    if (name === "cart") return cart();
    if (name === "fountain") return fountain();
    if (name === "spray") return sprayPuff();
    if (name === "gift") return gift(opts.col || "#c2304a");
    if (name === "bucket") return bucket();
    if (name === "shadow") return shadow();
    return buf(8, 8);
  }
  function prop(name, opts) {
    var k = "p:" + name + ":" + JSON.stringify(opts || {});
    if (cache[k]) return cache[k];
    cache[k] = canvasOf(propBuf(name, opts));
    return cache[k];
  }

  function tree(w, h, big) {
    var b = buf(w, h);
    var wood = ramp("#5a3a20");
    var g1 = ramp("#1f6a3a");
    var g2 = ramp("#2a7a44");
    var cx = (w / 2) | 0;
    var i, tier;
    for (i = 0; i < (big ? 16 : 10); i++) row(b, cx - 4, h - 10 - i, 8, wood, 0);
    var tiers = big ? 4 : 3;
    var base = h - (big ? 26 : 18);
    for (tier = 0; tier < tiers; tier++) {
      var th = big ? 36 : 26;
      var wide = (big ? 40 : 28) - tier * (big ? 8 : 6);
      var top = base - tier * (big ? 32 : 22);
      var rm = tier & 1 ? g2 : g1;
      for (i = 0; i < th; i++) {
        var ww = Math.max(4, Math.round(wide * (i / th)));
        row(b, cx - (ww >> 1), top + i, ww, rm, i < 3 ? -1 : 0);
        if (i > 4 && i < th - 4 && (i % 7 === 0)) {
          px(b, cx - (ww >> 2), top + i, 0xffd23f);
          px(b, cx + (ww >> 3), top + i + 1, 0xc2304a);
        }
      }
    }
    var star = ramp("#ffd23f");
    for (i = 0; i < 5; i++) row(b, cx - (i === 2 ? 4 : 2), (big ? 8 : 6) + i, i === 2 ? 8 : 4, star, 0);
    return b;
  }
  function wreath() {
    var b = buf(40, 40);
    var g = ramp("#1f5a3a");
    var cx = 20, cy = 20, i, a;
    for (i = 0; i < 40; i++) for (var j = 0; j < 40; j++) {
      var dx = i - cx, dy = j - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 11 && d < 17) {
        var rm = g[(dx + dy > 8 ? 2 : dx < 0 ? 0 : 1)];
        px(b, i, j, d > 16 || d < 12 ? OUT : rm);
      }
    }
    var bulbs = [0xc2304a, 0xffd23f, 0x3ff0ff, 0xff3fa4];
    for (a = 0; a < 6; a++) {
      var ang = a / 6 * Math.PI * 2;
      box(b, cx + Math.round(Math.cos(ang) * 14) - 1, cy + Math.round(Math.sin(ang) * 14) - 1, 3, 3, ramp(bulbs[a % 4]));
    }
    return b;
  }
  function bauble(col) {
    var b = buf(16, 16);
    var rm = ramp(col);
    for (var i = 0; i < 10; i++) {
      var w = i < 2 || i > 7 ? 6 : 10;
      row(b, 8 - (w >> 1), 3 + i, w, rm, i < 3 ? -1 : 0);
    }
    row(b, 6, 2, 4, ramp("#d8c070"), 0);
    px(b, 5, 5, rm[0]); px(b, 6, 5, rm[0]);
    return b;
  }
  function table() {
    var b = buf(72, 56);
    var top = ramp("#e6e0d4");
    var leg = ramp("#8a8f9a");
    var cup = ramp("#ff8a1f");
    for (var i = 0; i < 8; i++) row(b, 8, 10 + i, 56, top, i > 5 ? 1 : i < 2 ? -1 : 0);
    for (i = 0; i < 28; i++) row(b, 34, 18 + i, 5, leg, 0);
    box(b, 10, 6, 8, 6, cup);
    box(b, 22, 8, 6, 5, ramp("#ffffff"));
    box(b, 48, 4, 10, 8, ramp("#c2304a"));
    return b;
  }
  function wetSign() {
    var b = buf(40, 48);
    var yel = ramp("#ffd23f");
    for (var i = 0; i < 28; i++) row(b, 6, 4 + i, 28, yel, 0);
    /* feet */
    row(b, 4, 40, 8, yel, 1); row(b, 28, 40, 8, yel, 1);
    row(b, 16, 32, 8, yel, 0);
    textBuf(b, 9, 10, "WET", 0x1a1216, 1);
    textBuf(b, 8, 20, "FLOOR", 0x1a1216, 1);
    return b;
  }
  function stroller(opts) {
    var b = buf(56, 48);
    var body = ramp((opts && opts.col) || "#3f7fd0");
    var dark = ramp((opts && opts.dark) || "#2a5a9a");
    for (var i = 0; i < 16; i++) row(b, 8, 16 + i, 36, body, i > 12 ? 1 : 0);
    for (i = 0; i < 12; i++) {
      var w = 20 - (i > 8 ? 4 : 0);
      row(b, 16, 6 + i, w, dark, 0);
    }
    /* wheels */
    wheel(b, 10, 36); wheel(b, 38, 36);
    row(b, 14, 14, 18, ramp("#cfc8b0"), 0);
    return b;
  }
  function wheel(b, x, y) {
    var rm = ramp("#1b1b22");
    for (var i = 0; i < 8; i++) row(b, x, y + i, 8, rm, i < 2 ? -1 : 1);
    px(b, x + 3, y + 3, 0xcfc8b0);
  }
  function bin() {
    var b = buf(64, 48);
    var rm = ramp("#d5d8df");
    for (var i = 0; i < 22; i++) row(b, 6, 16 + i, 52, rm, 0);
    for (var k = 0; k < 4; k++) box(b, 10 + k * 12, 8, 10, 10, ramp(["#ff4b3e", "#ffd23f", "#3ff0ff", "#9bff3f"][k]));
    return b;
  }
  function counter() {
    var b = buf(64, 56);
    var top = ramp("#f4eef6");
    var glass = ramp("#d8e8f0");
    for (var i = 0; i < 20; i++) row(b, 4, 28 + i, 56, top, 0);
    for (i = 0; i < 16; i++) row(b, 10, 12 + i, 44, glass, i < 3 ? -1 : 0);
    return b;
  }
  function cart() {
    var b = buf(64, 56);
    var body = ramp("#eceae2");
    var navy = ramp("#1d2b53");
    for (var i = 0; i < 18; i++) row(b, 8, 16 + i, 48, body, 0);
    row(b, 6, 16, 52, navy, 0);
    row(b, 6, 17, 52, navy, 1);
    wheel(b, 8, 36); wheel(b, 46, 36);
    /* light bar */
    box(b, 28, 4, 8, 10, ramp("#8a8f9a"));
    box(b, 22, 2, 6, 5, ramp("#ff2020"));
    box(b, 36, 2, 6, 5, ramp("#2040ff"));
    box(b, 28, 34, 8, 4, ramp("#fff4c0"));
    return b;
  }
  function fountain() {
    var b = buf(72, 64);
    var stone = ramp("#d8d0c0");
    var water = ramp("#3fa0e0");
    for (var i = 0; i < 12; i++) {
      var w = 40 + (i < 4 ? i : 0);
      row(b, 36 - (w >> 1), 40 + i, w, stone, i > 8 ? 1 : 0);
    }
    for (i = 0; i < 4; i++) row(b, 14, 38 + i, 44, water, -1);
    for (i = 0; i < 22; i++) row(b, 34, 16 + i, 4, water, 0);
    px(b, 33, 14, water[0]); px(b, 36, 12, water[0]); px(b, 35, 18, 0xffffff);
    return b;
  }
  function sprayPuff() {
    var b = buf(48, 32);
    var rm = ramp("#ff9bd2");
    for (var k = 0; k < 4; k++) {
      for (var i = 0; i < 10; i++) {
        var w = 8 + (i < 5 ? i : 10 - i);
        row(b, 4 + k * 11, 8 + (k & 1 ? 4 : 0) + i, w, rm, 0);
      }
    }
    return b;
  }
  function gift(col) {
    var b = buf(24, 24);
    var rm = ramp(col);
    var rib = ramp("#ffd23f");
    for (var i = 0; i < 16; i++) row(b, 4, 6 + i, 16, rm, i > 13 ? 1 : 0);
    for (i = 0; i < 16; i++) row(b, 10, 6 + i, 3, rib, 0);
    row(b, 4, 12, 16, rib, 0);
    row(b, 8, 2, 8, rib, -1);
    return b;
  }
  function bucket() {
    var b = buf(20, 24);
    var rm = ramp("#ffd23f");
    for (var i = 0; i < 14; i++) row(b, 4, 6 + i, 12, rm, 0);
    row(b, 3, 6, 14, rm, -1);
    return b;
  }
  function shadow() {
    var b = buf(32, 10);
    for (var j = 0; j < 10; j++) {
      var w = j < 2 || j > 7 ? 16 : 28;
      for (var i = 0; i < w; i++) px(b, 16 - (w >> 1) + i, j, 0x000000);
    }
    return b;
  }

  /* 5x7 pixel font, uppercase, for signs. */
  var GLYPH = {
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
    H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
    K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    V: ["10001", "10001", "10001", "10001", "01010", "01010", "00100"],
    W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
    X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
    "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
    ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
    ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
    "%": ["11001", "11010", "00100", "01000", "10110", "10011", "00000"],
    "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"]
  };
  function textBuf(b, x, y, str, col, scale) {
    scale = scale || 1;
    col = num(col);
    var cx = x;
    for (var n = 0; n < str.length; n++) {
      var g = GLYPH[str.charAt(n)] || GLYPH[" "];
      for (var j = 0; j < 7; j++) for (var i = 0; i < 5; i++) if (g[j].charAt(i) === "1") {
        for (var sy = 0; sy < scale; sy++) for (var sx = 0; sx < scale; sx++) px(b, cx + i * scale + sx, y + j * scale + sy, col);
      }
      cx += 6 * scale;
    }
    return cx;
  }
  function textWidth(str, scale) { return str.length * 6 * scale; }

  function floorTile(a, bcol) {
    var b = buf(48, 48);
    var A = ramp(a), B = ramp(bcol);
    for (var y = 0; y < 48; y++) for (var x = 0; x < 48; x++) {
      var checker = ((x >> 4) + (y >> 4)) & 1;
      var rm = checker ? B : A;
      var edge = x % 16 === 0 || y % 16 === 0;
      px(b, x, y, edge ? OUT : rm[(x + y) & 2 ? 1 : 2]);
      if (!edge && ((x + 3 * y) % 17 === 0)) px(b, x, y, rm[0]);
    }
    return canvasOf(b);
  }
  function wallTile(z) {
    var b = buf(240, 160);
    var wall = ramp(z.wall || "#efe2c8");
    var trim = ramp(z.trim || "#c2304a");
    var y, x;
    for (y = 0; y < 160; y++) row(b, 0, y, 240, wall, y > 120 ? 1 : 0);
    /* garland, stepped */
    for (x = 0; x < 240; x++) {
      var gy = 16 + ((x % 24) < 12 ? (x % 12) : 12 - (x % 12));
      px(b, x, gy, 0x1f5a3a); px(b, x, gy + 1, 0x143c24);
      if (x % 16 === 0) {
        var bulb = [0xff4b3e, 0xffd23f, 0x3ff0ff, 0x9bff3f, 0xff3fa4][((x / 16) | 0) % 5];
        box(b, x - 1, gy + 2, 3, 3, ramp(bulb));
      }
    }
    row(b, 0, 36, 240, trim, 0);
    row(b, 0, 40, 240, ramp(z.neon || "#ffd23f"), -1);
    /* two shop windows */
    for (var k = 0; k < 2; k++) {
      var x0 = 10 + k * 120;
      box(b, x0, 48, 100, 100, ramp("#241c30"));
      for (var s = 0; s < 3; s++) {
        row(b, x0 + 6, 70 + s * 24, 88, ramp("#3a2d24"), 0);
        for (var q = 0; q < 6; q++) {
          var cols = ["#c2304a", "#2f8f4a", "#ffd23f", "#3f7fd0", "#a77bff", "#ff8a1f"];
          box(b, x0 + 8 + q * 15, 56 + s * 24, 12, 14, ramp(cols[(q + s + k) % 6]));
        }
      }
    }
    return canvasOf(b);
  }
  function ceilTile() {
    var b = buf(64, 64);
    var beam = ramp("#2a2440");
    var sky = ramp("#1a3058");
    var y, x;
    for (y = 0; y < 64; y++) row(b, 0, y, 64, beam, 0);
    for (y = 8; y < 56; y++) row(b, 8, y, 48, sky, y < 16 ? -1 : 0);
    for (var i = 0; i < 12; i++) {
      px(b, 12 + ((i * 17) % 40), 14 + ((i * 13) % 36), 0xffffff);
    }
    row(b, 8, 30, 48, beam, 0);
    for (y = 8; y < 56; y++) row(b, 30, y, 3, beam, 0);
    return canvasOf(b);
  }
  function signCard(name, bg, fg) {
    var scale = name.length > 16 ? 2 : 3;
    var tw = textWidth(name, scale);
    var w = Math.max(8, tw + 16), h = 16 + 7 * scale;
    var b = buf(w, h);
    var back = ramp(bg);
    for (var y = 0; y < h; y++) row(b, 0, y, w, back, 0);
    for (var x = 0; x < w; x++) { px(b, x, 0, num(fg)); px(b, x, h - 1, num(fg)); }
    textBuf(b, ((w - tw) / 2) | 0, ((h - 7 * scale) / 2) | 0, name, fg, scale);
    return canvasOf(b);
  }
  function bannerCard(top, mid, col) {
    var b = buf(220, 72);
    var red = ramp("#c2304a");
    var green = ramp("#1f5a3a");
    var y, x;
    for (y = 0; y < 72; y++) row(b, 0, y, 220, red, 0);
    for (x = 0; x < 220; x += 8) { px(b, x, 1, 0xffffff); px(b, x + 1, 1, 0xffffff); px(b, x + 4, 70, 0xffffff); }
    for (y = 8; y < 64; y++) row(b, 6, y, 208, green, 0);
    var s1 = 2, s2 = mid.length > 14 ? 2 : 3;
    textBuf(b, ((220 - textWidth(top, s1)) / 2) | 0, 12, top, "#ffd23f", s1);
    textBuf(b, ((220 - textWidth(mid, s2)) / 2) | 0, 32, mid, "#ffffff", s2);
    return canvasOf(b);
  }
  function panel(lines, bg, fg) {
    var b = buf(160, 96);
    var back = ramp(bg);
    for (var y = 0; y < 96; y++) row(b, 0, y, 160, back, 0);
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i][0], sc = lines[i][1] > 28 ? 3 : 2;
      textBuf(b, ((160 - textWidth(t, sc)) / 2) | 0, 8 + i * 28, t, fg, sc);
    }
    return canvasOf(b);
  }

  window.MSDPix = {
    W: W, H: H, SW: SW, SH: SH,
    frame: frame,
    prop: prop,
    floorTile: floorTile,
    wallTile: wallTile,
    ceilTile: ceilTile,
    signCard: signCard,
    bannerCard: bannerCard,
    panel: panel,
    roleOf: roleOf
  };
})();
