/* Seasonal themes. Loaded in <head> on every page, next to themes.css.
   Which theme is on comes from data/themes.json (dates are Arizona time,
   MM-DD, inclusive). The answer is cached for the day so pages after the
   first one switch before they paint. ?theme=<id> previews any theme for
   that page view (?theme=default turns it off). On the homepage it also
   fills #themeSlot with the season's strip. No sound, no tracking, and
   motion stops for prefers-reduced-motion (see themes.css). */
(function(){
  "use strict";
  var root = document.documentElement, KEY = "np-theme-v1";
  function pad(n){ return (n < 10 ? "0" : "") + n; }
  var az = new Date(Date.now() - 7 * 3600e3);                 /* Arizona: UTC-7 all year */
  var Y = az.getUTCFullYear(), M = az.getUTCMonth() + 1, D = az.getUTCDate();
  var today = pad(M) + "-" + pad(D);
  var m = /[?&]theme=([a-z0-9-]+)/i.exec(location.search), preview = m ? m[1].toLowerCase() : null;
  var NP = window.NPTheme = { id: "default", today: today, preview: preview };

  function apply(id){
    NP.id = id || "default";
    if (NP.id === "default") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", NP.id);
  }
  function inWindow(t, k){
    return t.start <= t.end ? (k >= t.start && k <= t.end) : (k >= t.start || k <= t.end);   /* wraps the new year */
  }
  if (preview) apply(preview);
  else {
    try { var c = JSON.parse(localStorage.getItem(KEY)); if (c && c.day === Y + "-" + today) apply(c.id); } catch (e) {}
  }

  var cfgP = fetch("/data/themes.json").then(function(r){ return r.json(); });
  var themeP = cfgP.then(function(cfg){
    var list = cfg.themes || [], t = null, i;
    for (i = 0; i < list.length; i++) if (inWindow(list[i], today)) { t = list[i]; break; }
    if (preview) {
      t = null;
      for (i = 0; i < list.length; i++) if (list[i].id === preview) t = list[i];
    } else {
      apply(t ? t.id : "default");
      try { localStorage.setItem(KEY, JSON.stringify({ day: Y + "-" + today, id: NP.id })); } catch (e) {}
    }
    NP.theme = t;
    return t;
  }).catch(function(){ return null; });

  /* ---------- homepage strip ---------- */
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  var gamesP = null;
  function games(){ return gamesP || (gamesP = fetch("/data/shelf-games.json").then(function(r){ return r.json(); })); }
  function row(list, sys){
    return '<div class="row">' + list.map(function(g){
      var href = g.p ? "/game/" + g.k + ".html" : "/index.html";
      return '<a href="' + href + '"><img src="/' + esc(g.i) + '" alt="" loading="lazy" decoding="async" width="112" height="149">' +
        '<b>' + esc(g.d) + '</b><span>' + esc(sys[g.s].n) + (g.y ? " \u00b7 " + g.y : "") + '</span></a>';
    }).join("") + '</div>';
  }

  /* Original pixel art (drawn for this site). One character per pixel. */
  var PAL = { W:"#eceae2", w:"#b9bcc7", G:"#8e93a2", g:"#5c6170", D:"#2c3040", K:"#0b0d12", R:"var(--hot)",
              Y:"#e8c547", B:"#7fb3d9", O:"#8a5a2b", o:"#b07a3f", C:"#c9b38a", P:"#d9a441", p:"#a35f24" };
  var ART = {
    plane: [
      "WW..........................",
      "WWW.........................",
      "WWWW........................",
      "WWWWWWWWWWWWWWWWWWWWWWW.....",
      "WWWBWBWBWBWBWBWBWBWBWBWWWW..",
      "RRRRRRRRRRRRRRRRRRRRRRRRRWW.",
      ".wwwwwwwwwwwwwwwwwwwwwwwwwwW",
      "..GGGGGGGGGGGGGGGGGGGGGGGG..",
      "...........GGGGGG...........",
      "..........GGGGG.............",
      ".........GGGG..............."
    ],
    train: [
      "......DD...........................",
      "......DD...........................",
      "..GGGGGGGGGGGG..wwwwwwwwwwwwwwwwwww",
      ".GGBBBGGGGGGGGG.wBBwBBwBBwBBwBBwBBw",
      "GGGBBBGGGGGGGGG.wBBwBBwBBwBBwBBwBBw",
      "GGGGGGGGGGGGGGG.wwwwwwwwwwwwwwwwwww",
      "RRRRRRRRRRRRRRR.RRRRRRRRRRRRRRRRRRR",
      "GGGGGGGGGGGGGGGDDwwwwwwwwwwwwwwwwww",
      ".DDDDDDDDDDDDD...DDDDDDDDDDDDDDDDD.",
      "..KK..KK..KK.......KK..KK...KK..KK.",
      "..KK..KK..KK.......KK..KK...KK..KK.",
      "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD"
    ],
    wagon: [
      "......wwwwwwwwwwwwwwwwwww......",
      ".....wBBBBwBBBBBwBBBBBBBBw.....",
      "....wBBBBBwBBBBBwBBBBBBBBBw....",
      "..wwwwwwwwwwwwwwwwwwwwwwwwwwww.",
      ".wCCOOOOOOOOOOOOOOOOOOOOOOOOCCw",
      "YwCCOooooooooooooooooooooooOCCw",
      ".wCCOOOOOOOOOOOOOOOOOOOOOOOOCCR",
      ".wwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
      "...DKKKD..............DKKKD....",
      "....KKK................KKK....."
    ],
    pie: [
      "....PPPPPPPP....",
      "..PPpppppppPPP..",
      ".PpppppppppppPP.",
      "PPPPPPPPPPPPPPPP",
      "CPCPCPCPCPCPCPCP",
      ".CCCCCCCCCCCCCC."
    ]
  };
  function svg(name, label){
    var rows = ART[name], h = rows.length, w = rows[0].length, out = [];
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var c = rows[y].charAt(x);
      if (c !== "." && PAL[c]) out.push('<rect x="' + x + '" y="' + y + '" width="1.02" height="1.02" style="fill:' + PAL[c] + '"/>');
    }
    return '<svg class="' + name + '" viewBox="0 0 ' + w + " " + h + '" shape-rendering="crispEdges" role="img" aria-label="' + label + '">' + out.join("") + "</svg>";
  }
  function thanksgiving(y){                       /* 4th Thursday of November */
    var first = new Date(Date.UTC(y, 10, 1)).getUTCDay();
    return 1 + ((4 - first + 7) % 7) + 21;
  }

  function strip(t){
    var slot = document.getElementById("themeSlot");
    if (!slot || !t || !t.strip) return;
    var s = t.strip;
    if (t.id === "halloween") {
      games().then(function(data){
        var by = {}; data.games.forEach(function(g){ by[g.k] = g; });
        var list = (s.games || []).map(function(k){ return by[k]; }).filter(function(g){ return g && g.i; });
        if (!list.length) return;
        slot.innerHTML = '<section class="npstrip" aria-label="' + esc(s.title) + '"><span class="k">' + esc(s.kicker) + '</span>' +
          '<h2>' + esc(s.title) + '</h2>' + row(list, data.systems) + '</section>';
      }).catch(function(){});
    } else if (t.id === "autumn") {
      var tg = thanksgiving(Y), week = M === 11 && D >= tg - 4 && D <= tg + 2;
      var kick = M === 11 && D === tg ? "Thanksgiving" : week ? "Thanksgiving week" : s.kicker;
      games().then(function(data){
        var yr = (s.year && data.games.filter(function(g){ return g.y === s.year && g.ph; })) || [];
        yr.sort(function(a, b){ return a.k < b.k ? -1 : 1; });
        slot.innerHTML = '<section class="npstrip" aria-label="' + esc(s.title) + '"><span class="k">' + esc(kick) + '</span>' +
          '<h2>' + esc(s.title) + '</h2>' +
          '<div class="art">' + svg("plane", "Pixel plane") + svg("train", "Pixel train") + svg("wagon", "Pixel station wagon") +
          (week ? svg("pie", "Pixel pie") : "") + '</div>' +
          (yr.length ? '<p class="s">Also from ' + s.year + ', on my shelf:</p>' + row(yr.slice(0, 12), data.systems) : "") +
          '</section>';
      }).catch(function(){});
    }
  }
  function onReady(fn){ if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }
  onReady(function(){ themeP.then(strip); });
})();
