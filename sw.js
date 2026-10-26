/* Bump this string whenever you upload new files, or phones keep the old ones. */
const CACHE = "nostalgiapro-v21";

const PAGES = [
  "/", "/index.html", "/anniversaries.html", "/consoles.html", "/reviews.html",
  "/lists.html", "/stats.html", "/gaps.html", "/rank.html", "/movies.html", "/tv.html",
  "/music.html", "/boardgames.html", "/shelf.html", "/media.html", "/credits.html",
  "/overrated.html", "/rankings.html", "/onthisday.html", "/digital.html", "/data/on-this-day/shelf.json",
  "/daily.html", "/match.html", "/first.html", "/data/daily.json", "/data/shelf-games.json",
  "/streaks.html", "/spines.html", "/tonight.html", "/np-progress.js", "/theme.js", "/themes.css", "/data/themes.json",
  "/console/game-boy-color.html", "/console/game-boy.html", "/console/gamecube.html", "/console/nes.html", "/console/nintendo-3ds.html", "/console/nintendo-64.html", "/console/nintendo-ds.html", "/console/nintendo-switch.html", "/console/pc.html", "/console/playstation-1.html", "/console/playstation-2.html", "/console/playstation-3.html", "/console/playstation-4.html", "/console/psp.html", "/console/sega-dreamcast.html", "/console/sega-genesis.html", "/console/sega-saturn.html", "/console/snes.html", "/console/wii.html", "/console/xbox-360.html", "/console/xbox-one.html", "/console/xbox-series-x-s.html", "/console/xbox.html",
  "/retro.css", "/icon-192.png", "/icon-512.png"
];

/* Grab the pages up front so the whole site works with no signal. */
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(PAGES.map(p => c.add(p))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Network first so you always get the newest version when you have signal,
   falling back to the cached copy when you don't. */
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match("/index.html")))
  );
});
