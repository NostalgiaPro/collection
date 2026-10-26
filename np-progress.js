/* Streaks and badges. Shared by daily.html, first.html, match.html and
   streaks.html. It only reads what the games already save in localStorage
   (np-daily-v1, np-first-v1, np-match-v1) and keeps the unlocked badges in
   np-badges-v1, all on this device. NPProgress.check() is called by the
   games when something finishes; new badges show a small toast. */
(function(){
  "use strict";
  var EPOCH = Date.UTC(2026, 9, 26), DAY = 864e5, KEY = "np-badges-v1";
  function get(k){ try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
  function today(){ return Math.floor((Date.now() - 7 * 3600e3 - EPOCH) / DAY) + 1; }   /* puzzle number, Arizona time */

  /* run of consecutive numbers ending at `end` (or end-1 if `end` isn't in yet) */
  function streaks(nums, end){
    var set = {}, best = 0, run = 0, prev = null, sorted = nums.slice().sort(function(a, b){ return a - b; });
    sorted.forEach(function(n){ set[n] = 1; run = prev === n - 1 ? run + 1 : 1; prev = n; if (run > best) best = run; });
    var cur = 0, n = set[end] ? end : end - 1;
    while (set[n]) { cur++; n--; }
    return { cur: cur, best: best };
  }

  function stats(){
    var t = today();
    var d = get("np-daily-v1").games || {}, live = [], wins = [], one = 0, lost = [];
    Object.keys(d).forEach(function(k){
      var r = d[k], n = +k;
      if (!r || !r.live || !r.done) return;
      live.push(n);
      if (r.w) { wins.push(n); if (r.g.length === 1) one++; } else lost.push(n);
    });
    /* a loss breaks the win streak: only count runs of wins */
    var ds = streaks(wins, t);
    if (lost.indexOf(t) >= 0) ds.cur = 0;                 /* lost today: streak is over */
    var f = get("np-first-v1"), fd = f.days || {}, played = [], best = 0, perfect = 0, total = 0;
    Object.keys(fd).forEach(function(k){
      var r = fd[k]; if (!r || !r.done) return;
      var sc = (r.p || []).filter(Boolean).length;
      played.push(+k); total += sc; if (sc > best) best = sc; if (sc >= 10) perfect++;
    });
    var fs = streaks(played, t);
    var m = get("np-match-v1"), b = get(KEY);
    var ms = b.match || {};
    return {
      today: t,
      daily: { played: live.length, wins: wins.length, cur: ds.cur, best: ds.best, oneGuess: one },
      first: { played: played.length, best: best, perfect: perfect, avg: played.length ? total / played.length : 0,
               cur: fs.cur, bestDays: fs.best, practice: (f.prac && f.prac.best) || 0 },
      match: { owned: (m.owned || []).length, pct: ms.pct || 0, full: ms.full || 0 }
    };
  }

  /* 9x9 pixel icons, one character per pixel: X = badge colour, W = light, . = clear */
  var ICONS = {
    star:  ["....X....","....X....","...XXX...","XXXXWXXXX",".XXWWWXX.","..XXXXX..","..XX.XX..",".XX...XX.","XX.....XX"],
    flame: ["....X....","...XX....","...XXX...","..XXXX.X.","..XXWXXX.",".XXWWWXX.",".XXWWWXX.","..XXWXX..","...XXX..."],
    eye:   [".........","..XXXXX..",".XX...XX.","XX.WWW.XX","X..WXW..X","XX.WWW.XX",".XX...XX.","..XXXXX..","........."],
    cup:   ["XXXXXXXXX","XWXXXXXWX","XWXXXXXWX",".XXXXXXX.","..XXXXX..","...XXX...","....X....","...XXX...","..XXXXX.."],
    clock: ["..XXXXX..",".X..X..X.","X...X...X","X...X...X","X...XXX.X","X.......X","X.......X",".X.....X.","..XXXXX.."],
    shelf: ["XXXXXXXXX","X.W.X.W.X","X.W.X.W.X","XXXXXXXXX","X.WW.X.WX","X.WW.X.WX","XXXXXXXXX","X.......X","X.......X"],
    cart:  [".XXXXXXX.",".XWWWWWX.",".XWWWWWX.",".XWWWWWX.",".XXXXXXX.","XXXXXXXXX","XX.X.X.XX","XXXXXXXXX","........."]
  };
  var BADGES = [
    { id: "d-first",  game: "Daily Shelf", icon: "cart",  c: "#ff4b3e", name: "First Daily Shelf", desc: "Finish a Daily Shelf.", test: function(s){ return s.daily.played >= 1; } },
    { id: "d-one",    game: "Daily Shelf", icon: "eye",   c: "#ff4b3e", name: "One look", desc: "Get a Daily Shelf on the first guess.", test: function(s){ return s.daily.oneGuess >= 1; } },
    { id: "d-3",      game: "Daily Shelf", icon: "flame", c: "#ff4b3e", name: "3-day streak", desc: "Win Daily Shelf 3 days in a row.", test: function(s){ return s.daily.best >= 3; } },
    { id: "d-7",      game: "Daily Shelf", icon: "flame", c: "#e0a33a", name: "7-day streak", desc: "Win Daily Shelf 7 days in a row.", test: function(s){ return s.daily.best >= 7; } },
    { id: "d-10",     game: "Daily Shelf", icon: "cup",   c: "#e0a33a", name: "10 wins", desc: "Win 10 Daily Shelf games.", test: function(s){ return s.daily.wins >= 10; } },
    { id: "f-first",  game: "Which Came First?", icon: "clock", c: "#5a8fd6", name: "First run", desc: "Finish a Which Came First? daily run.", test: function(s){ return s.first.played >= 1; } },
    { id: "f-5",      game: "Which Came First?", icon: "star",  c: "#5a8fd6", name: "5 in a row", desc: "Get 5 in a row in a daily run.", test: function(s){ return s.first.best >= 5; } },
    { id: "f-10",     game: "Which Came First?", icon: "cup",   c: "#3fbf6a", name: "Perfect 10", desc: "Get all 10 pairs in a daily run.", test: function(s){ return s.first.perfect >= 1; } },
    { id: "f-days3",  game: "Which Came First?", icon: "flame", c: "#5a8fd6", name: "3 days running", desc: "Play Which Came First? 3 days in a row.", test: function(s){ return s.first.bestDays >= 3; } },
    { id: "f-prac20", game: "Which Came First?", icon: "star",  c: "#8f6fd6", name: "Practice 20", desc: "Reach a 20-pair streak in practice.", test: function(s){ return s.first.practice >= 20; } },
    { id: "m-first",  game: "Shelf vs. Mine", icon: "shelf", c: "#3fbf6a", name: "Shelf check", desc: "Tick a game you own in Shelf vs. Mine.", test: function(s){ return s.match.owned >= 1; } },
    { id: "m-25",     game: "Shelf vs. Mine", icon: "shelf", c: "#e0a33a", name: "25 in common", desc: "Share 25 games with my shelf.", test: function(s){ return s.match.owned >= 25; } },
    { id: "m-10pct",  game: "Shelf vs. Mine", icon: "star",  c: "#3fbf6a", name: "10% match", desc: "Own 10% of my shelf.", test: function(s){ return s.match.pct >= 10; } },
    { id: "m-full",   game: "Shelf vs. Mine", icon: "cup",   c: "#c85cc8", name: "Whole console", desc: "Own every game I have for one console.", test: function(s){ return s.match.full >= 1; } }
  ];

  function icon(b, size){
    var rows = ICONS[b.icon], out = [];
    for (var y = 0; y < 9; y++) for (var x = 0; x < 9; x++) {
      var ch = rows[y].charAt(x);
      if (ch === "X") out.push('<rect x="' + x + '" y="' + y + '" width="1.02" height="1.02" style="fill:' + b.c + '"/>');
      else if (ch === "W") out.push('<rect x="' + x + '" y="' + y + '" width="1.02" height="1.02" style="fill:#eceae2"/>');
    }
    return '<svg viewBox="0 0 9 9" width="' + (size || 36) + '" height="' + (size || 36) + '" shape-rendering="crispEdges" aria-hidden="true">' + out.join("") + "</svg>";
  }

  function unlocked(){ return get(KEY).got || {}; }
  function save(got, extra){
    var b = get(KEY); b.got = got;
    if (extra) for (var k in extra) b[k] = extra[k];
    try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) {}
  }

  /* toast */
  var queue = [], showing = false;
  function css(){
    if (document.getElementById("npbadge-css")) return;
    var st = document.createElement("style"); st.id = "npbadge-css";
    st.textContent = ".npbadge{position:fixed;left:16px;bottom:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:60;display:flex;align-items:center;gap:12px;" +
      "max-width:min(340px,calc(100vw - 32px));padding:10px 14px 10px 10px;background:var(--panel,#1d2029);border:2px solid var(--hot,#ff4b3e);border-radius:2px;" +
      "color:var(--text,#eceae2);text-decoration:none;box-shadow:0 12px 30px rgba(0,0,0,.5);transform:translateY(16px);opacity:0;transition:transform .25s,opacity .25s}" +
      ".npbadge.on{transform:none;opacity:1}.npbadge svg{flex:none;image-rendering:pixelated}" +
      ".npbadge b{display:block;font-family:Silkscreen,monospace;font-size:10px;letter-spacing:.1em;color:var(--hot,#ff4b3e);font-weight:700}" +
      ".npbadge span{display:block;font-family:'IBM Plex Sans',sans-serif;font-size:14px;font-weight:600;line-height:1.3}" +
      "@media (prefers-reduced-motion:reduce){.npbadge{transition:none;transform:none}}";
    document.head.appendChild(st);
  }
  function next(){
    if (showing || !queue.length) return;
    showing = true; css();
    var b = queue.shift(), a = document.createElement("a");
    a.className = "npbadge"; a.href = "/streaks.html"; a.setAttribute("role", "status");
    a.innerHTML = icon(b, 36) + '<div><b>BADGE UNLOCKED</b><span>' + b.name + "</span></div>";
    document.body.appendChild(a);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ a.classList.add("on"); }); });
    setTimeout(function(){
      a.classList.remove("on");
      setTimeout(function(){ a.remove(); showing = false; next(); }, 300);
    }, 3200);
  }

  function check(opts){
    var got = unlocked(), s = stats(), fresh = [], when = new Date().toISOString().slice(0, 10);
    BADGES.forEach(function(b){ if (!got[b.id] && b.test(s)) { got[b.id] = when; fresh.push(b); } });
    if (fresh.length) save(got);
    if (!(opts && opts.quiet)) { fresh.forEach(function(b){ queue.push(b); }); next(); }
    return fresh;
  }
  /* match.html reports what only it can work out (needs the shelf totals) */
  function noteMatch(pct, full){ save(unlocked(), { match: { pct: pct, full: full } }); }

  window.NPProgress = { stats: stats, check: check, noteMatch: noteMatch, BADGES: BADGES, icon: icon, unlocked: unlocked };
})();
