/* Homepage (Version A): search focus, Daily Shelf number, latest review, Time Machine mini picker.
   Only reads the site's own files. */
(function(){
  "use strict";
  var $ = function(id){ return document.getElementById(id); };

  /* Search the Shelf: bring the box up and focus it */
  document.querySelectorAll("[data-act='search']").forEach(function(a){
    a.addEventListener("click", function(){
      var q = $("q"); if (!q) return;
      q.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(function(){ q.focus({ preventScroll: true }); }, 300);
    });
  });

  /* Today's Daily Shelf number: same epoch as data/daily.json, midnight Arizona time */
  var EPOCH = Date.UTC(2026, 9, 26), DAY = 864e5;
  var n = Math.floor((Date.now() - 7 * 3600e3 - EPOCH) / DAY) + 1, done = false;
  try { var s = JSON.parse(localStorage.getItem("np-daily-v1")); done = !!(s && s.games && s.games[n] && s.games[n].done); } catch (e) {}
  if (n >= 1) {
    var state = done ? "done today" : "new today";
    if ($("htDailyKick")) $("htDailyKick").textContent = "Daily Shelf #" + n + " \u00b7 " + state;
    if ($("htDailyAct")) $("htDailyAct").textContent = "Daily Shelf #" + n + ". Six guesses.";
  }

  /* Latest review: read it off reviews.html so it stays current */
  if (window.fetch && window.DOMParser) {
    fetch("/reviews.html").then(function(r){ return r.ok ? r.text() : null; }).then(function(t){
      if (!t) return;
      var d = new DOMParser().parseFromString(t, "text/html");
      var li = d.querySelector("#list > li"), card = document.querySelector(".ht-rev");
      if (!li || !card) return;
      var who = li.querySelector(".who b"), sys = li.getAttribute("data-sys"), tm = li.querySelector("time"),
          img = li.querySelector("figure img"), v = li.getAttribute("data-v"), num = li.getAttribute("data-n");
      if (!who || !num) return;
      card.href = "/reviews.html#" + li.id;
      card.querySelector(".ht-ch").textContent = who.textContent;
      card.querySelector(".ht-cs").textContent = (sys ? sys + ". " : "") + "I rate it a " + v + " out of 5.";
      $("htRevKick").textContent = "Review No. " + num + (tm ? " \u00b7 " + tm.textContent : "");
      if (img && $("htRevImg")) $("htRevImg").src = img.getAttribute("src");
    }).catch(function(){});
  }

  /* Time Machine near the top: a small copy of the footer picker */
  var box = document.querySelector(".ht-tm");
  if (box && window.npEra) {
    var btn = box.querySelector(".ht-tmbtn"), panel = box.querySelector(".ht-tmpanel"), cur = box.querySelector(".ht-tmcur");
    var sync = function(){
      var id = npEra.get(), e = npEra.list.filter(function(x){ return x.id === id; })[0];
      cur.textContent = e ? e.label : "Now";
      panel.querySelectorAll("button").forEach(function(b){ b.setAttribute("aria-pressed", b.dataset.era === id ? "true" : "false"); });
    };
    npEra.list.forEach(function(e){
      var b = document.createElement("button");
      b.type = "button"; b.dataset.era = e.id;
      b.innerHTML = "<b>" + e.label + "</b><span>" + e.name + "</span>";
      b.addEventListener("click", function(){ npEra.set(e.id); sync(); });
      panel.appendChild(b);
    });
    var close = function(){ panel.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    btn.addEventListener("click", function(){
      var open = panel.hidden;
      panel.hidden = !open; btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function(e){ if (!box.contains(e.target)) close(); });
    document.addEventListener("keydown", function(e){ if (e.key === "Escape") close(); });
    var foot = $("npEras");
    if (foot) foot.addEventListener("click", function(){ setTimeout(sync, 0); });
    sync();
  }

})();
