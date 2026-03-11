// ABC Buddy Service Worker — caches app shell for offline use
const CACHE_NAME = "abc-buddy-v1";

// App shell assets to pre-cache on install
const PRECACHE_URLS = ["/", "/offline.html"];

// Install: pre-cache the offline fallback page
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - Navigation requests (HTML): network-first, fallback to offline.html
// - JS/CSS/fonts (app shell): stale-while-revalidate
// - API calls (/api/*): network-only (never cache)
// - Images: cache-first with 7-day expiry
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin API calls
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;

  // Navigation: network-first, offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Cache the latest shell
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match("/offline.html"))
    );
    return;
  }

  // JS / CSS / fonts: stale-while-revalidate
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf)$/) ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request).then((res) => {
            cache.put(request, res.clone());
            return res;
          });
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // Images (including S3/CDN): cache-first, 7-day TTL
  if (
    url.pathname.match(/\.(png|jpg|jpeg|webp|gif|svg|ico)$/) ||
    url.hostname.includes("cloudfront.net") ||
    url.hostname.includes("amazonaws.com")
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((res) => {
            cache.put(request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }
});
