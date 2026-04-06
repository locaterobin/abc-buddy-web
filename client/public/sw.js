// ABC Buddy Service Worker — offline-first with Workbox precaching
// Strategy:
//   App shell (HTML + all hashed JS/CSS) → precached on install via __WB_MANIFEST__
//   Navigation (HTML)  → network-first; fall back to cached index.html when offline
//   JS / CSS / fonts   → stale-while-revalidate (served from cache instantly, refreshed in background)
//   Images / S3 / CDN  → cache-first (7-day TTL)
//   /api/*             → network-only (never cache)

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

// Precache all hashed assets injected by VitePWA at build time
// This is the key fix: all JS/CSS bundles are cached on SW install
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// Navigation: network-first, fall back to cached index.html
const navigationHandler = new NetworkFirst({
  cacheName: "abc-buddy-navigation",
  plugins: [new ExpirationPlugin({ maxEntries: 5 })],
});
registerRoute(new NavigationRoute(navigationHandler));

// JS / CSS / fonts: stale-while-revalidate
registerRoute(
  ({ request }) =>
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "font",
  new StaleWhileRevalidate({ cacheName: "abc-buddy-assets" })
);

// Images / S3 / CDN: cache-first, 7-day TTL
registerRoute(
  ({ request, url }) =>
    request.destination === "image" ||
    url.hostname.includes("cloudfront.net") ||
    url.hostname.includes("amazonaws.com"),
  new CacheFirst({
    cacheName: "abc-buddy-images",
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  })
);

// API calls: network-only — never cache
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  new NetworkFirst({ cacheName: "abc-buddy-api-never" })
);

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
