const CACHE_VERSION = "v1";
const SHELL_CACHE = `isan-air-shell-${CACHE_VERSION}`;
const PAGES_CACHE = `isan-air-pages-${CACHE_VERSION}`;
const API_CACHE = `isan-air-api-${CACHE_VERSION}`;
const STATIC_CACHE = `isan-air-static-${CACHE_VERSION}`;

const ACTIVE_CACHES = [SHELL_CACHE, PAGES_CACHE, API_CACHE, STATIC_CACHE];

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/images/cloud-logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("isan-air-") && !ACTIVE_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isCacheableApiPath(pathname) {
  if (pathname.startsWith("/api/cron")) return false;
  return (
    pathname.startsWith("/api/air-quality") ||
    pathname.startsWith("/api/forecast") ||
    pathname.startsWith("/api/weather") ||
    pathname.startsWith("/api/provinces") ||
    pathname.startsWith("/api/history") ||
    pathname.startsWith("/api/analytics") ||
    pathname.startsWith("/api/system-status")
  );
}

function isStaticAssetPath(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/images/") ||
    pathname === "/icon.png"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return;

  // 1. Public API GET routes: Network-first with offline cache fallback
  if (isCacheableApiPath(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(
            JSON.stringify({ ok: false, error: "Offline and no cached data available" }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          );
        }),
    );
    return;
  }

  // 2. Immutable / static assets: Cache-first with network fallback
  if (isStaticAssetPath(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        });
      }),
    );
    return;
  }

  // 3. Page navigations: Network-first with cached page or root App Shell fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(PAGES_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(request);
          if (cachedPage) return cachedPage;
          const cachedRoot = await caches.match("/");
          if (cachedRoot) return cachedRoot;
          return Response.error();
        }),
    );
  }
});
