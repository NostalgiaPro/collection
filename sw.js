/* Bump this string whenever you upload new files, or phones keep the old ones. */
const CACHE = "nostalgiapro-v2";

const PAGES = [
  "/", "/index.html", "/anniversaries.html", "/consoles.html", "/reviews.html",
  "/lists.html", "/stats.html", "/gaps.html", "/rank.html", "/movies.html", "/tv.html",
  "/music.html", "/boardgames.html", "/shelf.html", "/media.html",
  "/icon-192.png", "/icon-512.png"
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
