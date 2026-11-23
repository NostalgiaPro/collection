/* ============================================================================
   LATEST VIDEOS: fills #lvYT and #lvTT on the homepage from /data/latest-videos.json

   The file is written by tools/build_latest_videos.py, run by the
   "Latest videos feed" GitHub Action after each posting slot. It only holds
   videos that are public right now (YouTube's public RSS feed and TikTok's
   creator embed, each checked against the platform's oEmbed).

   Three rows: YouTube videos (16:9), YouTube Shorts and TikTok (both 9:16).

     {"youtube":[{"id","kind":"short"|"video","title","url","thumb","thumb_alt","published"}],
      "tiktok": [{"id","title","url","thumb","published"}]}

   If the file will not load, the "Watch on YouTube / TikTok" cards already
   in the page stay put, so the rows are never empty.
   ============================================================================ */
(function(){
  var SRC = "/data/latest-videos.json";
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var yv = document.getElementById("lvYV"), ys = document.getElementById("lvYS"), tt = document.getElementById("lvTT");
  if (!yv || !ys || !tt || !window.fetch) return;

  function el(tag, cls, text){
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function safe(u){ u = String(u || ""); return /^https:\/\//i.test(u) ? u : ""; }
  function day(iso){                      /* date in Arizona time (UTC-7 all year) */
    var t = Date.parse(iso); if (isNaN(t)) return "";
    var d = new Date(t - 7 * 3600e3);
    return MON[d.getUTCMonth()] + " " + d.getUTCDate();
  }
  function mark(row){                     /* the platform icon in the row heading, reused for sleeves */
    var h = row.parentNode.querySelector(".lv-ico");
    return h ? h.cloneNode(true) : el("span");
  }
  function card(v, row, opts){
    var href = safe(v.url), title = String(v.title || "").trim();
    if (!href || !title) return null;
    var c = el("a", "lv-card");
    c.href = href; c.target = "_blank"; c.rel = "noopener";
    var th = el("span", "lv-th"), src = safe(v.thumb), alt = safe(v.thumb_alt);
    function nopic(){ th.textContent = ""; th.className = "lv-th lv-nopic"; th.appendChild(mark(row)); }
    if (src){
      var img = el("img");
      img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer";
      img.onerror = function(){
        if (alt && img.src !== alt){ img.src = alt; alt = ""; } else { nopic(); }
      };
      img.src = src;
      th.appendChild(img);
    } else {
      nopic();
    }
    th.setAttribute("aria-hidden", "true");
    c.appendChild(th);
    c.appendChild(el("span", "lv-tt", title));
    if (opts.k) c.appendChild(el("span", "lv-k", opts.k));
    c.setAttribute("aria-label", title + (opts.label ? " (" + opts.label + ")" : ""));
    return c;
  }
  function fill(row, list, make){
    var out = document.createDocumentFragment(), n = 0;
    (Array.isArray(list) ? list : []).forEach(function(v){
      var c = v && make(v); if (c){ out.appendChild(c); n++; }
    });
    if (!n) return;                       /* nothing usable: keep the fallback card */
    row.textContent = "";
    row.appendChild(out);
  }

  fetch(SRC, { cache: "no-cache" }).then(function(r){ return r.ok ? r.json() : null; }).then(function(d){
    if (!d) return;
    var list = Array.isArray(d.youtube) ? d.youtube : [];
    fill(yv, list.filter(function(v){ return v && v.kind !== "short"; }), function(v){
      return card(v, yv, { k: day(v.published), label: "YouTube video" });
    });
    fill(ys, list.filter(function(v){ return v && v.kind === "short"; }), function(v){
      return card(v, ys, { k: day(v.published), label: "YouTube Short" });
    });
    fill(tt, d.tiktok, function(v){ return card(v, tt, { label: "TikTok" }); });
  }).catch(function(){});
})();
