// Procedural pixel art. Everything is drawn in code. No images.
var NP = window.NP || {};
window.NP = NP;

NP.COL = { navy: '#1d2b53', navy2: '#111a33', cream: '#fff1d6', red: '#e4343e', cyan: '#29d3e8', ink: '#0b1022', gold: '#ffcc33', grey: '#8a90a0' };

// 5x7 bitmap font
NP.FONT = (function () {
  var g = {
    A:[14,17,17,31,17,17,17],B:[30,17,17,30,17,17,30],C:[14,17,16,16,16,17,14],D:[30,17,17,17,17,17,30],
    E:[31,16,16,30,16,16,31],F:[31,16,16,30,16,16,16],G:[14,17,16,23,17,17,15],H:[17,17,17,31,17,17,17],
    I:[14,4,4,4,4,4,14],J:[7,2,2,2,2,18,12],K:[17,18,20,24,20,18,17],L:[16,16,16,16,16,16,31],
    M:[17,27,21,21,17,17,17],N:[17,17,25,21,19,17,17],O:[14,17,17,17,17,17,14],P:[30,17,17,30,16,16,16],
    Q:[14,17,17,17,21,18,13],R:[30,17,17,30,20,18,17],S:[15,16,16,14,1,1,30],T:[31,4,4,4,4,4,4],
    U:[17,17,17,17,17,17,14],V:[17,17,17,17,17,10,4],W:[17,17,17,21,21,21,10],X:[17,17,10,4,10,17,17],
    Y:[17,17,10,4,4,4,4],Z:[31,1,2,4,8,16,31],
    '0':[14,17,19,21,25,17,14],'1':[4,12,4,4,4,4,14],'2':[14,17,1,2,4,8,31],'3':[31,2,4,2,1,17,14],
    '4':[2,6,10,18,31,2,2],'5':[31,16,30,1,1,17,14],'6':[6,8,16,30,17,17,14],'7':[31,1,2,4,8,8,8],
    '8':[14,17,17,14,17,17,14],'9':[14,17,17,15,1,2,12],' ':[0,0,0,0,0,0,0],':':[0,12,12,0,12,12,0],
    '.':[0,0,0,0,0,12,12],',':[0,0,0,0,12,4,8],'!':[4,4,4,4,4,0,4],'?':[14,17,1,2,4,0,4],'-':[0,0,0,31,0,0,0],
    "'":[4,4,8,0,0,0,0],'$':[4,15,20,14,5,30,4],'#':[10,10,31,10,31,10,10],'/':[1,1,2,4,8,16,16],
    '(':[2,4,8,8,8,4,2],')':[8,4,2,2,2,4,8],'&':[12,18,20,8,21,18,13],'+':[0,4,4,31,4,4,0],
    '%':[24,25,2,4,8,19,3],'·':[0,0,0,12,12,0,0],'"':[10,10,0,0,0,0,0],'@':[14,17,23,21,23,16,14]
  };
  return g;
})();

NP.textWidth = function (str, s) { return str.length * 6 * s - s; };
NP.pixelText = function (ctx, str, x, y, s, color, align) {
  str = String(str).toUpperCase();
  if (align === 'center') x = Math.round(x - NP.textWidth(str, s) / 2);
  else if (align === 'right') x = Math.round(x - NP.textWidth(str, s));
  ctx.fillStyle = color;
  for (var i = 0; i < str.length; i++) {
    var gl = NP.FONT[str[i]] || NP.FONT['?'];
    for (var r = 0; r < 7; r++) {
      var row = gl[r];
      for (var c = 0; c < 5; c++) if (row & (16 >> c)) ctx.fillRect(x + (i * 6 + c) * s, y + r * s, s, s);
    }
  }
};
// wrap words into lines that fit maxW at scale s
NP.wrapPixel = function (str, s, maxW) {
  var words = String(str).split(' '), lines = [], cur = '';
  for (var i = 0; i < words.length; i++) {
    var t = cur ? cur + ' ' + words[i] : words[i];
    if (NP.textWidth(t, s) > maxW && cur) { lines.push(cur); cur = words[i]; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
};

NP.hashStr = function (str) {
  var h = 2166136261 >>> 0;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

var SPRITE_PAL = ['#e4343e', '#29d3e8', '#fff1d6', '#ffcc33', '#00e676', '#ff77a8', '#ffa300', '#c3c8ff'];

// 8x8 mirrored sprite from a hash
function sprite(ctx, id, x, y, s, bg) {
  var h = NP.hashStr(id), h2 = NP.hashStr(id + 'x');
  var a = SPRITE_PAL[h % SPRITE_PAL.length], b = SPRITE_PAL[(h >> 5) % SPRITE_PAL.length];
  if (a === bg) a = '#ffffff';
  for (var r = 0; r < 8; r++) for (var c = 0; c < 4; c++) {
    var bit = ((r < 4 ? h : h2) >> ((r % 4) * 4 + c)) & 1;
    var bit2 = ((h2 >> ((r * 4 + c) % 31)) & 1);
    if (bit) {
      ctx.fillStyle = (bit2 && r > 1) ? b : a;
      ctx.fillRect(x + c * s, y + r * s, s, s);
      ctx.fillRect(x + (7 - c) * s, y + r * s, s, s);
    }
  }
}

function npMark(ctx, x, y, s, fg) {
  NP.pixelText(ctx, 'NP', x, y, s, fg);
}

// Draws one item at 32x40 logical pixels, scaled by k.
NP.drawItem = function (ctx, it, ox, oy, k) {
  k = k || 1;
  var P = function (x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(ox + x * k, oy + y * k, w * k, h * k); };
  var kind = it.kind;
  // the picture of what the game is about, in a thin frame (icons.js)
  var icon = function (x, y) {
    if (!NP.drawItemIcon || !NP.iconKey(it)) return false;
    P(x - 1, y - 1, 18, 18, NP.COL.ink);
    NP.drawItemIcon(ctx, it, ox + x * k, oy + y * k, k);
    return true;
  };
  if (kind === 'merch' || kind === 'grail') {
    var isG = kind === 'grail';
    P(3, 1, 26, 38, NP.COL.ink);
    P(4, 2, 24, 36, isG ? NP.COL.navy : NP.COL.cream);
    P(4, 2, 24, 6, NP.COL.red);
    P(4, 8, 24, 1, NP.COL.cyan);
    if (icon(8, 12)) {
      P(7, 31, 18, 1, isG ? NP.COL.cyan : NP.COL.red);
      P(7, 34, 12, 1, isG ? NP.COL.cyan : NP.COL.grey);
      if (isG) { P(22, 33, 4, 4, NP.COL.gold); P(23, 34, 2, 2, '#fff'); }
      return;
    }
    // no picture (the ads): the big NP mark
    var c = isG ? NP.COL.cream : NP.COL.navy;
    var ns = Math.max(1, Math.floor(k * 1.5)); NP.pixelText(ctx, 'NP', Math.round(ox + 16 * k - 5.5 * ns), oy + 14 * k, ns, c);
    P(7, 28, 18, 1, isG ? NP.COL.cyan : NP.COL.red);
    P(7, 31, 12, 1, isG ? NP.COL.cyan : NP.COL.grey);
    if (isG) { P(22, 31, 4, 4, NP.COL.gold); P(23, 32, 2, 2, '#fff'); }
    return;
  }
  if (kind === 'lot') {
    P(1, 12, 30, 26, '#6b4a2b'); P(2, 13, 28, 24, '#a87443'); P(1, 10, 30, 4, '#8a5e36');
    P(14, 10, 4, 28, '#d8b07a');
    NP.pixelText(ctx, '?', ox + 8 * k, oy + 20 * k, k, NP.COL.cream);
    NP.pixelText(ctx, '?', ox + 20 * k, oy + 22 * k, k, NP.COL.cream);
    P(4, 6, 6, 6, '#7a7f8c'); P(20, 5, 7, 7, '#29adff'); P(11, 7, 5, 5, '#e4343e');
    return;
  }
  // Round 3b: music, movies, and the odd things the new stores sell
  if (kind === 'music' || kind === 'movie' || kind === 'gear' || kind === 'standee' || kind === 'bulk') { drawOther(ctx, it, ox, oy, k, P); return; }
  var pl = NP.PLATFORMS[it.p] || NP.PLATFORMS.k16;
  var cond = it.cond || 'loose';
  if (cond === 'loose' && pl.media === 'disc') {
    // a disc, with the picture printed in the middle
    for (var yy = 0; yy < 28; yy++) for (var xx = 0; xx < 28; xx++) {
      var dx = xx - 13.5, dy = yy - 13.5, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 14) {
        var col = d < 2.5 ? null : d < 4.5 ? '#c9d1dc' : (((xx + yy) % 7 === 0) ? '#ffffff' : '#aeb8c8');
        if (d >= 4.5 && dy < -1 && d < 13) col = pl.c1;
        if (col) P(2 + xx, 8 + yy, 1, 1, col);
      }
    }
    if (!icon(8, 14)) sprite(ctx, it.id, ox + 12 * k, oy + 10 * k, Math.max(1, k / 2), pl.c1);
    return;
  }
  if (cond === 'loose') {
    // cartridge
    var w = pl.media === 'hand' ? 22 : 28, x0 = (32 - w) / 2, top = pl.media === 'hand' ? 10 : 6;
    P(x0, top, w, 38 - top, NP.COL.ink);
    P(x0 + 1, top + 1, w - 2, 36 - top, pl.media === 'hand' ? '#59606e' : '#9aa0ad');
    P(x0 + 3, top + 3, w - 6, 21, pl.c2);
    P(x0 + 3, top + 3, w - 6, 2, pl.c1);
    if (!icon(8, top + 6)) sprite(ctx, it.id, ox + (x0 + w / 2 - 4) * k, oy + (top + 8) * k, k, pl.c2);
    for (var g = 0; g < (w - 8) / 3; g++) P(x0 + 4 + g * 3, 35, 2, 2, '#5d6370');
    return;
  }
  // box (cib / sealed)
  P(2, 0, 28, 40, NP.COL.ink);
  P(3, 1, 26, 38, pl.c2);
  P(3, 1, 26, 7, pl.c1);
  P(5, 3, 14, 1, NP.COL.cream); P(5, 5, 9, 1, NP.COL.cream);
  if (!icon(8, 11)) sprite(ctx, it.id, ox + 8 * k, oy + 12 * k, k * 2, pl.c2);
  P(3, 30, 26, 1, pl.c1);
  NP.pixelText(ctx, pl.name.split(' ')[0].slice(0, 4), ox + 5 * k, oy + 32 * k, Math.max(1, Math.floor(k * 0.5)), NP.COL.cream);
  if (cond === 'sealed') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (var i = 0; i < 40; i++) { var sx = 22 - i; if (sx >= 3 && sx < 29) ctx.fillRect(ox + sx * k, oy + i * k, k, k); var sx2 = 30 - i; if (sx2 >= 3 && sx2 < 29) ctx.fillRect(ox + sx2 * k, oy + i * k, k, k); }
  }
  if (it.sticker) { P(21, 33, 8, 5, NP.COL.gold); P(22, 35, 6, 1, NP.COL.red); }
};

// colors for record sleeves and movie boxes, picked from the item id so the same item always looks the same
var MEDIA_PAL = [['#e4343e', '#ffcc33'], ['#29adff', '#fff1d6'], ['#7e57c2', '#29d3e8'], ['#00b894', '#1d2b53'], ['#ff77a8', '#1d2b53'], ['#ff9f43', '#0b1022'], ['#1d2b53', '#ff77a8'], ['#2d6a2d', '#ffcc33']];
function drawOther(ctx, it, ox, oy, k, P) {
  var C = NP.COL, h = NP.hashStr(String(it.id || 'x')), pal = MEDIA_PAL[h % MEDIA_PAL.length];
  var fmt = it.fmt || '';
  var art = function (x, y, s, bg) { sprite(ctx, String(it.id), ox + x * k, oy + y * k, s * k, bg); };
  if (it.kind === 'music' && fmt === 'vinyl') {
    // the record peeking out of its sleeve
    for (var yy = 0; yy < 26; yy++) for (var xx = 0; xx < 26; xx++) {
      var dx = xx - 12.5, dy = yy - 12.5, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 13) P(5 + xx, 7 + yy, 1, 1, d < 2 ? C.cream : d < 4 ? pal[1] : ((xx + yy) % 5 === 0 ? '#3a3f4a' : '#15171d'));
    }
    P(0, 6, 26, 28, C.ink); P(1, 7, 24, 26, pal[0]);
    art(5, 11, 2, pal[0]);
    P(1, 29, 24, 4, pal[1]);
    return;
  }
  if (it.kind === 'music' && fmt === 'cd') {
    P(2, 7, 28, 27, C.ink); P(3, 8, 26, 25, '#c9d1dc'); P(3, 8, 4, 25, '#8a90a0');
    P(8, 10, 19, 21, pal[0]); art(10, 13, 2, pal[0]);
    P(8, 27, 19, 3, pal[1]);
    return;
  }
  if (it.kind === 'music') { // cassette
    P(1, 12, 30, 20, C.ink); P(2, 13, 28, 18, '#3a3f4a');
    P(4, 14, 24, 9, pal[0]); P(4, 14, 24, 2, pal[1]);
    P(8, 18, 5, 4, C.ink); P(19, 18, 5, 4, C.ink); P(9, 19, 3, 2, C.cream); P(20, 19, 3, 2, C.cream);
    P(7, 25, 18, 5, '#59606e'); P(10, 27, 2, 2, C.ink); P(20, 27, 2, 2, C.ink);
    return;
  }
  if (it.kind === 'movie' && fmt === 'vhs') {
    P(4, 0, 24, 40, C.ink); P(5, 1, 22, 38, '#16181f');
    P(5, 1, 22, 6, pal[0]);
    art(8, 10, 2, '#16181f');
    P(5, 28, 22, 2, pal[1]); P(7, 32, 12, 1, C.grey); P(7, 34, 8, 1, C.grey);
    NP.pixelText(ctx, 'VHS', ox + 17 * k, oy + 33 * k, Math.max(1, Math.floor(k * 0.5)), C.cream);
    if (it.flags && it.flags.rental) { P(19, 2, 7, 4, C.gold); }
    return;
  }
  if (it.kind === 'movie') { // dvd
    P(5, 1, 22, 38, C.ink); P(6, 2, 20, 36, '#1f4fa8');
    P(8, 4, 16, 26, pal[0]); art(8, 9, 2, pal[0]);
    P(8, 32, 16, 2, pal[1]);
    NP.pixelText(ctx, 'DVD', ox + 10 * k, oy + 35 * k, Math.max(1, Math.floor(k * 0.5)), C.cream);
    return;
  }
  if (it.kind === 'gear') { // binoculars
    P(4, 14, 10, 16, C.ink); P(18, 14, 10, 16, C.ink);
    P(5, 15, 8, 14, '#3a3f4a'); P(19, 15, 8, 14, '#3a3f4a');
    P(13, 18, 6, 6, C.ink); P(14, 19, 4, 4, '#59606e');
    P(6, 26, 6, 3, C.cyan); P(20, 26, 6, 3, '#9aa0ad');
    P(7, 27, 2, 1, '#ffffff');
    return;
  }
  if (it.kind === 'standee') { // a cardboard action star, pointing a dental drill at you
    P(11, 1, 10, 10, '#8a5e36'); P(12, 2, 8, 8, '#f1c28e'); P(12, 2, 8, 3, '#4a2f1c');
    P(13, 6, 2, 1, C.ink); P(17, 6, 2, 1, C.ink);
    P(9, 11, 14, 16, '#8a5e36'); P(10, 12, 12, 14, '#e4343e');
    P(22, 13, 8, 4, '#8a5e36'); P(23, 14, 6, 2, '#f1c28e'); P(28, 12, 3, 2, C.grey);
    P(10, 27, 5, 12, '#8a5e36'); P(17, 27, 5, 12, '#8a5e36'); P(11, 27, 3, 11, '#1d2b53'); P(18, 27, 3, 11, '#1d2b53');
    return;
  }
  // bulk: a printer paper box of sports games
  P(1, 12, 30, 26, '#c9b48a'); P(2, 13, 28, 24, '#e6d4a8'); P(1, 10, 30, 4, '#b39c6e');
  P(3, 6, 8, 6, '#2d6a2d'); P(12, 5, 8, 7, '#29adff'); P(21, 7, 8, 5, '#e4343e');
  NP.pixelText(ctx, '40', ox + 10 * k, oy + 20 * k, k, NP.COL.navy);
}

NP.makeArt = function (it, scale) {
  var c = document.createElement('canvas');
  c.width = 32 * scale; c.height = 40 * scale;
  var ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  NP.drawItem(ctx, it, 0, 0, scale);
  c.className = 'art';
  return c;
};

NP.drawLogo = function (canvas, adFree) {
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  var s = Math.floor(W / 80);
  var txt = 'NOSTALGIA PRO';
  var y = Math.round(H / 2 - 7 * s / 2) - s * 2;
  NP.pixelText(ctx, txt, W / 2 + s, y + s, s, NP.COL.red, 'center');
  NP.pixelText(ctx, txt, W / 2, y, s, NP.COL.cream, 'center');
  var sub = adFree ? 'THE AD-FREE EDITION (WITH ADS)' : 'THE GAME';
  var s2 = Math.max(1, Math.floor(s / 3));
  NP.pixelText(ctx, sub, W / 2, y + 9 * s, s2, NP.COL.cyan, 'center');
};

// A can of Saguaro Splash Cola, 8x14 at scale k. phase 0 = label edge-on, 1 = label facing you.
NP.drawCan = function (ctx, x, y, k, phase) {
  k = k || 1; phase = phase == null ? 1 : Math.max(0, Math.min(1, phase));
  var P = function (px, py, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x + px * k), Math.round(y + py * k), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))); };
  P(-1, -1, 10, 16, NP.COL.ink);
  P(0, 0, 8, 14, '#e4343e');
  P(0, 0, 8, 1, '#c8cbd6'); P(0, 13, 8, 1, '#8a90a0');
  P(1, 1, 1, 12, '#ff8a8f');
  // the label turns toward you
  var w = Math.max(1, Math.round(1 + 5 * phase)), left = Math.min(7 - w, 1 + Math.round((1 - phase) * 5));
  P(left, 4, w, 6, NP.COL.cream);
  if (w >= 3) { P(left + 1, 6, w - 2, 1, NP.COL.cyan); P(left + 1, 8, Math.max(1, w - 3), 1, '#00b894'); }
  P(3, 11, 2, 1, '#ffcc33');
};

// a little glamour sparkle; t is time in seconds
NP.drawSparkle = function (ctx, cx, cy, k, t) {
  k = k || 1;
  var a = Math.floor(t * 6) % 4, len = [1, 2, 3, 2][a];
  ctx.fillStyle = '#fff6c8';
  ctx.fillRect(Math.round(cx - k / 2), Math.round(cy - len * k), Math.max(1, k), len * 2 * k + k);
  ctx.fillRect(Math.round(cx - len * k), Math.round(cy - k / 2), len * 2 * k + k, Math.max(1, k));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(Math.round(cx - k / 2), Math.round(cy - k / 2), Math.max(1, k), Math.max(1, k));
};
