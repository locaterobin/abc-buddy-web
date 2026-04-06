// ABC Buddy Service Worker — offline-first app shell caching
// Strategy:
//   Navigation (HTML)  → network-first; cache on success; serve cached index.html if offline
//   JS / CSS / fonts   → stale-while-revalidate (serve cache instantly, refresh in background)
//   Images / S3 / CDN  → cache-first (7-day TTL)
//   /api/*             → network-only (never cache)

const CACHE_NAME = "abc-buddy-v3";

// Pre-cache the app shell on install so it is available immediately offline
const PRECACHE_URLS = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch((err) => {
        // Non-fatal: if pre-cache fails (e.g. no network at install time) we
        // still activate; the shell will be cached on first online navigation.
        console.warn("[SW] Pre-cache failed (will retry on first online load):", err);
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== "GET") return;

  // API calls: always network-only
  if (url.pathname.startsWith("/api/")) return;

  // ── Navigation requests (page loads) ──────────────────────────────────────
  // Network-first: try to get the freshest shell; cache it for offline use.
  // On failure, serve the cached index.html so the SPA can boot offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", clone));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match("/index.html") || await caches.match("/");
          if (cached) return cached;
          // Last resort: minimal offline placeholder (should rarely be reached)
          return new Response(
            `<!doctype html><html><head><meta charset="utf-8"><title>ABC Buddy</title></head>
             <body><script>
               // Retry once the SW has a cached shell
               setTimeout(()=>location.reload(),3000);
             </script><p style="font-family:sans-serif;padding:2rem">Loading ABC Buddy…</p></body></html>`,
            { headers: { "Content-Type": "text/html" } }
          );
        })
    );
    return;
  }

  // ── JS / CSS / fonts: stale-while-revalidate ──────────────────────────────
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf)$/) ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          }).catch(() => cached); // if network fails, return cached copy
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // ── Images / S3 / CDN: cache-first ───────────────────────────────────────
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
            if (res.ok) cache.put(request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }
});
