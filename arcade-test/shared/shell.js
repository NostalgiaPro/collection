/* Nostalgia Pro Arcade: shared shell.
   Owns the page chrome (top bar, title card, pause, game over), the canvas,
   scaling, the frame loop, input routing, sound and local high scores.

   A game calls Shell.init({...}) once with:
     slug, title, howTo, keys, accent, width, height,
     lowerIsBetter, format(score) -> string,
     reset()            fresh state for a new run (called on start and restart)
     update(dt)         seconds since last frame, only while playing
     draw(ctx, state)   draw in logical pixels every frame
     pointer(type, x, y, e)  type: down | move | up | cancel (logical coords)
     key(type, code, e)      type: down | up
     idle(dt)           optional, animates behind the title / game over cards
   and then uses:
     Shell.gameOver(score, { title, html })
     Shell.sfx(name), Shell.tone(...), Shell.noise(...)
     Shell.best(), Shell.load(key), Shell.save(key, value)
     Shell.flash(text, sub, color, ms), Shell.shake(px, seconds)
     Shell.onStart(fn), Shell.onPause(fn), Shell.onResume(fn), Shell.onRestart(fn)
*/
(function () {
  "use strict";

  var CFG = window.NP_CONFIG || {};
  var HUB_URL = "../index.html";
  var VOLUME = 0.2;

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* private mode */ } }
  };
  var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var donateHref = CFG.donateHref ? CFG.donateHref() : "#";
  /* Inside the Android app (sessionStorage "np-twa" = "1", set by /growth.js) the
     game-over donate link is hidden (Google Play payments policy). ?forceapp=1/0 for testing. */
  var inApp = (function () {
    try {
      var q = /[?&]forceapp=([01])/.exec(location.search);
      if (q) { if (q[1] === "1") sessionStorage.setItem("np-twa", "1"); else sessionStorage.removeItem("np-twa"); }
      if ((document.referrer || "").indexOf("android-app://com.thenostalgiapro.shelf") === 0) sessionStorage.setItem("np-twa", "1");
      return sessionStorage.getItem("np-twa") === "1";
    } catch (e) { return false; }
  })();
  if (inApp) donateHref = "";

  var G = null, state = "boot";
  var canvas, ctx, stage, overlays = {}, flashEl, flashTimer = 0;
  var W = 360, H = 540, scale = 1, dpr = 1, last = 0;
  var shake = { t: 0, dur: 0, mag: 0 };
  var activePointer = null;
  var hooks = { start: [], pause: [], resume: [], restart: [] };

  /* ---------------- Sound ---------------- */
  var ac = null, master = null, noiseBuf = null;
  var muted = store.get("npArcade.muted") === "1";

  function unlockAudio() {
    try {
      if (!ac) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = muted ? 0 : VOLUME;
        master.connect(ac.destination);
        var len = (ac.sampleRate * 2) | 0;
        noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ac.state === "suspended") ac.resume();
    } catch (e) { ac = null; }
  }

  function tone(freq, dur, type, vol, freqEnd, delay) {
    if (!ac || muted) return;
    dur = dur || 0.1; vol = vol == null ? 0.4 : vol;
    var t = ac.currentTime + (delay || 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function noise(dur, vol, freq, q, delay, freqEnd, ftype, attack) {
    if (!ac || muted || !noiseBuf) return;
    dur = dur || 0.2; vol = vol == null ? 0.3 : vol;
    var t = ac.currentTime + (delay || 0);
    var s = ac.createBufferSource(); s.buffer = noiseBuf;
    var f = ac.createBiquadFilter(); f.type = ftype || "bandpass";
    f.frequency.setValueAtTime(freq || 1000, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q || 0.8;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  function notes(list, type, step, vol) {
    for (var i = 0; i < list.length; i++) tone(list[i], step * 1.4, type || "square", vol || 0.28, 0, i * step);
  }

  var SFX = {
    tap: function () { tone(880, 0.04, "square", 0.22); },
    hit: function () { noise(0.07, 0.5, 1800, 1); tone(220, 0.08, "triangle", 0.4, 110); },
    score: function () { tone(659, 0.07, "square", 0.28); tone(988, 0.14, "square", 0.28, 0, 0.07); },
    miss: function () { tone(330, 0.24, "sawtooth", 0.16, 140); },
    crowd: function () { noise(1.5, 0.32, 900, 0.4, 0, 0, "bandpass", 0.3); noise(1.2, 0.16, 2600, 0.7, 0.15, 0, "bandpass", 0.2); },
    whoosh: function () { noise(0.28, 0.22, 500, 1.2, 0, 3200); },
    ding: function () { tone(1568, 0.5, "triangle", 0.3); tone(2093, 0.4, "sine", 0.18); },
    buzzer: function () { tone(110, 0.7, "sawtooth", 0.3); tone(117, 0.7, "square", 0.16); },
    crack: function () { noise(0.06, 0.9, 3200, 0.7, 0, 0, "highpass"); tone(1300, 0.05, "square", 0.25, 500); },
    splash: function () { noise(0.45, 0.4, 700, 0.8, 0, 180); },
    rim: function () { tone(440, 0.14, "triangle", 0.35, 400); noise(0.05, 0.3, 2500, 2); },
    swish: function () { noise(0.22, 0.28, 4200, 1.2, 0, 1600); },
    cup: function () { tone(330, 0.05, "triangle", 0.45); tone(196, 0.09, "triangle", 0.45, 0, 0.06); },
    click: function () { tone(1200, 0.02, "square", 0.12); },
    boost: function () { tone(300, 0.18, "square", 0.16, 900); },
    start: function () { notes([523, 659, 784, 1047], "square", 0.07, 0.24); },
    over: function () { notes([784, 659, 523, 392], "triangle", 0.11, 0.3); },
    best: function () { notes([523, 659, 784, 1047, 784, 1047, 1319], "square", 0.08, 0.24); }
  };

  function setMuted(m) {
    muted = m;
    store.set("npArcade.muted", m ? "1" : "0");
    if (master) master.gain.value = m ? 0 : VOLUME;
    var b = document.getElementById("np-mute");
    if (b) {
      b.setAttribute("aria-pressed", m ? "true" : "false");
      b.setAttribute("aria-label", m ? "Unmute sound" : "Mute sound");
      b.innerHTML = m ? ICONS.muted : ICONS.sound;
    }
  }

  /* ---------------- Scores ---------------- */
  function bestKey() { return "npArcade." + G.slug + ".best"; }
  function readBest() {
    var v = store.get(bestKey());
    if (v === null || v === "") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function fmt(n) { return n == null ? "---" : (G.format ? G.format(n) : String(n)); }

  /* ---------------- DOM ---------------- */
  var ICONS = {
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9h4l5-4v14l-5-4H3z"/><path fill="none" stroke="currentColor" stroke-width="2" d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9h4l5-4v14l-5-4H3z"/><path fill="none" stroke="currentColor" stroke-width="2.4" d="M16 9l6 6M22 9l-6 6"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5l12 7-12 7z"/></svg>'
  };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  function build() {
    document.body.classList.add("np-game");
    document.documentElement.style.setProperty("--accent", G.accent || "#3ff0ff");
    var app = document.createElement("div");
    app.className = "np-app";
    app.innerHTML =
      '<header class="np-bar">' +
        '<a class="np-back" href="' + HUB_URL + '"><span aria-hidden="true">&lt;</span> Arcade</a>' +
        '<h1 class="np-title">' + esc(G.title) + '</h1>' +
        '<button class="np-icon" id="np-mute" type="button"></button>' +
        '<button class="np-icon" id="np-pause" type="button" aria-label="Pause">' + ICONS.pause + '</button>' +
      '</header>' +
      '<main class="np-stage" id="np-stage">' +
        '<canvas id="np-canvas" tabindex="-1" role="img" aria-label="' + esc(G.title) + ' game screen"></canvas>' +
        '<div class="np-crt" aria-hidden="true"></div>' +
        '<div class="np-flash" id="np-flash" aria-live="polite"></div>' +

        '<section class="np-ov" id="np-ov-title" data-tap aria-label="Start screen">' +
          '<div class="np-card">' +
            '<p class="np-kicker">Nostalgia Pro Arcade</p>' +
            '<h2 class="np-h">' + esc(G.title) + '</h2>' +
            '<p class="np-how">' + esc(G.howTo || "") + '</p>' +
            (G.keys ? '<p class="np-keys">' + esc(G.keys) + '</p>' : '') +
            '<p class="np-best">BEST <b id="np-title-best">---</b></p>' +
            '<p class="np-best" id="np-title-tro" hidden>TROPHIES <b></b></p>' +
            '<button class="np-btn np-primary np-pulse" type="button" data-act="start" style="width:100%">TAP TO START</button>' +
            '<p class="np-tip">' + esc(G.tip || "No quarters required.") + '</p>' +
          '</div>' +
        '</section>' +

        '<section class="np-ov" id="np-ov-pause" aria-label="Paused">' +
          '<div class="np-card">' +
            '<h2 class="np-h">PAUSED</h2>' +
            '<div class="np-actions">' +
              '<button class="np-btn np-primary" type="button" data-act="resume">RESUME</button>' +
              '<button class="np-btn" type="button" data-act="restart">Restart</button>' +
              '<a class="np-btn" href="' + HUB_URL + '">Back to arcade</a>' +
            '</div>' +
            '<p class="np-tip">P or Esc to resume. M mutes. R restarts.</p>' +
          '</div>' +
        '</section>' +

        '<section class="np-ov" id="np-ov-over" aria-label="Game over">' +
          '<div class="np-card">' +
            '<h2 class="np-h" id="np-over-title">GAME OVER</h2>' +
            '<p class="np-kicker">Score</p>' +
            '<p class="np-score" id="np-over-score">0</p>' +
            '<p class="np-best">BEST <b id="np-over-best">---</b></p>' +
            '<div class="np-newbest" id="np-newbest" role="status"><strong>NEW PERSONAL BEST</strong><span id="np-oldbest"></span></div>' +
            '<p class="np-extra" id="np-over-tro" hidden></p>' +
            '<div class="np-extra" id="np-over-extra"></div>' +
            '<div class="np-actions">' +
              '<button class="np-btn np-primary" type="button" data-act="again">PLAY AGAIN</button>' +
              '<a class="np-btn" href="' + HUB_URL + '">Back to arcade</a>' +
            '</div>' +
            (donateHref ? '<a class="np-small" data-donate href="' + esc(donateHref) + '" target="_blank" rel="noopener">Support the arcade</a>' : '') +
          '</div>' +
        '</section>' +
      '</main>';
    document.body.appendChild(app);

    stage = document.getElementById("np-stage");
    canvas = document.getElementById("np-canvas");
    ctx = canvas.getContext("2d");
    flashEl = document.getElementById("np-flash");
    overlays.title = document.getElementById("np-ov-title");
    overlays.pause = document.getElementById("np-ov-pause");
    overlays.over = document.getElementById("np-ov-over");

    setMuted(muted);
    document.getElementById("np-mute").addEventListener("click", function (e) {
      unlockAudio(); setMuted(!muted); refocus(e);
    });
    document.getElementById("np-pause").addEventListener("click", function (e) {
      if (state === "playing") pause(); else if (state === "paused") resume();
      refocus(e);
    });

    // Buttons inside overlays
    app.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-act]") : null;
      if (t) {
        e.stopPropagation();
        var a = t.getAttribute("data-act");
        if (a === "start") start();
        else if (a === "resume") resume();
        else if (a === "restart" || a === "again") restart();
      }
    });
    // Tap anywhere on the title card to start
    overlays.title.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("a")) return;
      if (state === "title") start();
    });

    window.addEventListener("resize", resize);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && state === "playing") pause();
    });
    window.addEventListener("pagehide", function () { if (state === "playing") pause(); });
    bindInput();
  }

  // After a mouse click on a top bar button, hand keyboard focus back to the game.
  function refocus(e) {
    if (e && e.detail > 0 && state === "playing") focusCanvas();
  }
  function focusCanvas() { try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); } }

  function show(name) {
    for (var k in overlays) overlays[k].classList.toggle("on", k === name);
    var b = name && overlays[name].querySelector(".np-primary");
    if (b) setTimeout(function () { try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); } }, 30);
    var pb = document.getElementById("np-pause");
    pb.innerHTML = state === "paused" ? ICONS.play : ICONS.pause;
    pb.setAttribute("aria-label", state === "paused" ? "Resume" : "Pause");
  }

  /* ---------------- Scaling ---------------- */
  function resize() {
    if (!stage) return;
    var r = stage.getBoundingClientRect();
    var pad = 8;
    var s = Math.min((r.width - pad) / W, (r.height - pad) / H);
    if (!(s > 0)) s = 1;
    var cw = Math.floor(W * s), ch = Math.floor(H * s);
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    scale = cw / W;
  }

  /* ---------------- Input ---------------- */
  var GAME_KEYS = { Space: 1, Enter: 1, ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, NumpadEnter: 1 };

  function toLocal(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / (r.width / W), y: (e.clientY - r.top) / (r.height / H) };
  }

  function bindInput() {
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    canvas.addEventListener("pointerdown", function (e) {
      if (state !== "playing") return;
      if (activePointer !== null && activePointer !== e.pointerId) return;
      e.preventDefault();
      unlockAudio();
      activePointer = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      focusCanvas();
      var p = toLocal(e);
      if (G.pointer) G.pointer("down", p.x, p.y, e);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (state !== "playing") return;
      if (activePointer !== null && activePointer !== e.pointerId) return;
      var p = toLocal(e);
      if (G.pointer) G.pointer("move", p.x, p.y, e);
    });
    function end(type) {
      return function (e) {
        if (activePointer !== e.pointerId) return;
        activePointer = null;
        if (state !== "playing") return;
        var p = toLocal(e);
        if (G.pointer) G.pointer(type, p.x, p.y, e);
      };
    }
    canvas.addEventListener("pointerup", end("up"));
    canvas.addEventListener("pointercancel", end("cancel"));

    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var c = e.code;
      var a = document.activeElement;
      var onControl = a && a !== document.body && a !== canvas && a.matches && a.matches("a,button");
      if (c === "KeyM") { unlockAudio(); setMuted(!muted); return; }
      if (c === "KeyP" || c === "Escape") {
        if (state === "playing") { e.preventDefault(); pause(); }
        else if (state === "paused") { e.preventDefault(); resume(); }
        return;
      }
      if (c === "KeyR") {
        if (state === "playing" || state === "paused" || state === "over") { e.preventDefault(); restart(); }
        return;
      }
      if (state === "playing") {
        if (onControl && (c === "Space" || c === "Enter")) return; // let a focused top bar button work
        if (GAME_KEYS[c]) e.preventDefault();
        if (G.key) G.key("down", c, e);
        return;
      }
      if ((c === "Space" || c === "Enter" || c === "NumpadEnter") && !onControl) {
        e.preventDefault();
        if (state === "title") start();
        else if (state === "over") restart();
        else if (state === "paused") resume();
      }
    });
    document.addEventListener("keyup", function (e) {
      if (state !== "playing") return;
      var a = document.activeElement;
      var onControl = a && a !== document.body && a !== canvas && a.matches && a.matches("a,button");
      if (onControl && (e.code === "Space" || e.code === "Enter")) return;
      if (GAME_KEYS[e.code]) e.preventDefault();
      if (G.key) G.key("up", e.code, e);
    });
  }

  /* ---------------- Flow ---------------- */
  function run(list) { for (var i = 0; i < list.length; i++) { try { list[i](); } catch (e) { console.error(e); } } }

  function begin() {
    if (window.Trophies) window.Trophies.startRun();
    unlockAudio();
    activePointer = null;
    if (G.reset) G.reset();
    state = "playing";
    show(null);
    hideFlash(true);
    focusCanvas();
    last = performance.now();
    SFX.start();
  }
  function start() { if (state !== "title") return; begin(); run(hooks.start); }
  function restart() { begin(); run(hooks.restart); }
  function pause() {
    if (state !== "playing") return;
    state = "paused";
    activePointer = null;
    show("pause");
    if (G.onPause) G.onPause();
    run(hooks.pause);
  }
  function resume() {
    if (state !== "paused") return;
    state = "playing";
    show(null);
    focusCanvas();
    last = performance.now();
    if (G.onResume) G.onResume();
    run(hooks.resume);
  }

  function gameOver(score, opts) {
    if (state !== "playing") return;
    opts = opts || {};
    state = "over";
    activePointer = null;
    var prev = readBest();
    var isNew = score != null && isFinite(score) &&
      (prev == null || (G.lowerIsBetter ? score < prev : score > prev));
    if (isNew) store.set(bestKey(), score);
    document.getElementById("np-over-title").textContent = opts.title || "GAME OVER";
    document.getElementById("np-over-score").textContent = fmt(score);
    document.getElementById("np-over-best").textContent = fmt(isNew ? score : prev);
    // Personal best banner: only when a saved best was beaten (a first game has nothing to beat).
    var beat = isNew && prev != null;
    document.getElementById("np-newbest").classList.toggle("on", beat);
    document.getElementById("np-oldbest").textContent = beat ? "Old best: " + fmt(prev) : "";
    document.getElementById("np-over-extra").innerHTML = opts.html || "";
    trophyRunEnd(score, isNew, opts.stats);
    document.getElementById("np-title-best").textContent = fmt(isNew ? score : prev);
    hideFlash(true);
    setTimeout(function () { if (state === "over") { if (beat) SFX.best(); else SFX.over(); } }, 60);
    show("over");
    // Rewards (shared/rewards.js, optional): so-close line, score count-up, PB confetti + sting.
    if (window.NPRewards) { try { window.NPRewards.over({ slug: G.slug, score: score, prev: prev, isNew: beat, fmt: fmt, stats: opts.stats || {} }); } catch (e) { console.error(e); } }
    // High score table (shared/hiscores.js, optional, test pages only): top 10 with made-up seeds + initials entry.
    if (window.NPHiScores) { try { window.NPHiScores.over({ slug: G.slug, score: score, fmt: fmt, lower: !!G.lowerIsBetter }); } catch (e) { console.error(e); } }
    if (CFG.trackEvent) CFG.trackEvent("arcade/" + G.slug + "/game-over", G.title + " game over");
  }

  /* ---------------- Trophies (shared/trophies.js, optional) ---------------- */
  function trophyCount() {
    var el = document.getElementById("np-title-tro");
    if (!el || !window.Trophies) return;
    var c = window.Trophies.count(G.slug);
    if (!c.total) return;
    el.querySelector("b").textContent = c.got + "/" + c.total;
    el.hidden = false;
  }
  function trophyRunEnd(score, isNew, stats) {
    var row = document.getElementById("np-over-tro");
    if (/trophydebug/.test(location.search)) console.log("[np-trophy-debug]", G.slug, score, JSON.stringify(stats || {}));
    if (!row || !window.Trophies) return;
    var names = [];
    try { names = window.Trophies.runEnd(G.slug, stats || {}, { newBest: isNew, score: score }); } catch (e) { names = []; }
    row.textContent = names.length ? "On the shelf this run: " + names.join(", ") : "";
    row.hidden = !names.length;
    trophyCount();
  }

  /* ---------------- Flash + shake ---------------- */
  function flash(text, sub, color, ms) {
    if (!flashEl) return;
    clearTimeout(flashTimer);
    flashEl.style.setProperty("--fc", color || "#ffd23f");
    flashEl.innerHTML = "<b>" + esc(text) + "</b>" + (sub ? "<span>" + esc(sub) + "</span>" : "");
    flashEl.className = "np-flash";
    void flashEl.offsetWidth;
    flashEl.className = "np-flash on";
    flashTimer = setTimeout(function () { flashEl.className = "np-flash off"; }, ms || 1100);
  }
  function hideFlash(now) {
    clearTimeout(flashTimer);
    if (flashEl) flashEl.className = now ? "np-flash" : "np-flash off";
  }
  function doShake(mag, dur) {
    if (reduced) return;
    shake.mag = Math.max(shake.mag * (shake.t > 0 ? 1 : 0), mag);
    shake.dur = shake.t = dur || 0.25;
  }

  /* ---------------- Loop ---------------- */
  function frame(t) {
    requestAnimationFrame(frame);
    var dt = (t - last) / 1000;
    last = t;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    if (state === "playing") G.update(dt);
    else if (G.idle) G.idle(dt);
    var ox = 0, oy = 0;
    if (shake.t > 0) {
      shake.t -= dt;
      var m = shake.mag * Math.max(0, shake.t / shake.dur);
      ox = (Math.random() * 2 - 1) * m; oy = (Math.random() * 2 - 1) * m;
    }
    var k = scale * dpr;
    ctx.setTransform(k, 0, 0, k, ox * k, oy * k);
    ctx.imageSmoothingEnabled = false;
    G.draw(ctx, state);
  }

  /* ---------------- Public API ---------------- */
  var Shell = {
    reduced: reduced,
    init: function (opts) {
      G = opts;
      W = opts.width || 360; H = opts.height || 540;
      Shell.W = W; Shell.H = H;
      document.title = opts.title + " | Nostalgia Pro Arcade";
      build();
      resize();
      if (CFG.loadAnalytics) CFG.loadAnalytics();
      document.getElementById("np-title-best").textContent = fmt(readBest());
      trophyCount();
      if (G.reset) G.reset();
      state = "title";
      show("title");
      // Fonts are self hosted; redraw once they are ready so canvas text uses them.
      if (document.fonts && document.fonts.load) {
        Promise.all([
          document.fonts.load('16px "Press Start 2P"'),
          document.fonts.load('16px "Silkscreen"')
        ]).catch(function () {});
      }
      last = performance.now();
      requestAnimationFrame(frame);
    },
    gameOver: gameOver,
    pause: pause,
    resume: resume,
    restart: restart,
    state: function () { return state; },
    best: readBest,
    format: function (n) { return fmt(n); },
    load: function (k) { return store.get("npArcade." + G.slug + "." + k); },
    save: function (k, v) { store.set("npArcade." + G.slug + "." + k, v); },
    sfx: function (name) { var f = SFX[name]; if (f) f(); },
    tone: tone,
    noise: noise,
    flash: flash,
    shake: doShake,
    onStart: function (f) { hooks.start.push(f); },
    onPause: function (f) { hooks.pause.push(f); },
    onResume: function (f) { hooks.resume.push(f); },
    onRestart: function (f) { hooks.restart.push(f); },
    // Shared drawing helpers (logical pixels)
    text: function (c, str, x, y, size, color, align, glow) {
      c.font = (size || 8) + 'px "Press Start 2P", monospace';
      c.textAlign = align || "left";
      c.textBaseline = "top";
      if (glow) { c.shadowColor = glow; c.shadowBlur = 8; }
      c.fillStyle = "#000";
      c.fillText(str, x + 1, y + 1);
      c.fillStyle = color || "#eceae2";
      c.fillText(str, x, y);
      c.shadowBlur = 0;
    },
    uiText: function (c, str, x, y, size, color, align) {
      c.font = (size || 10) + 'px "Silkscreen", monospace';
      c.textAlign = align || "left";
      c.textBaseline = "top";
      c.fillStyle = color || "#eceae2";
      c.fillText(str, x, y);
    }
  };
  window.Shell = Shell;
})();
