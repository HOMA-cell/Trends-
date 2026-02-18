const CACHE_VERSION = "trends-shell-v2-20260217";
const SHELL_CACHE = CACHE_VERSION;
const SHELL_CACHE_PREFIX = "trends-shell-";
const SHELL_ASSET_PATTERN = /\.(?:css|js|html|svg|webmanifest)$/i;
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./feed.js",
  "./profile.js",
  "./settings.js",
  "./utils.js",
  "./i18n.js",
  "./supabaseClient.js",
  "./commentSync.js",
  "./profileEditState.js",
  "./icon.svg",
  "./site.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL_ASSETS.map(async (asset) => {
          try {
            await cache.add(new Request(asset, { cache: "reload" }));
          } catch (error) {
            console.warn("sw install cache add failed", asset, error);
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const networkResponse = await networkFetch;
  if (networkResponse) return networkResponse;

  return new Response("Offline", {
    status: 503,
    statusText: "Offline",
  });
}

async function networkFirstAsset(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await fetch(request, { cache: "no-store" });
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached =
      (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    return new Response("Offline", {
      status: 503,
      statusText: "Offline",
    });
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await fetch(request, { cache: "no-store" });
    if (fresh && fresh.ok) {
      cache.put("./index.html", fresh.clone());
      cache.put("./", fresh.clone());
    }
    return fresh;
  } catch {
    const cached =
      (await cache.match("./index.html")) ||
      (await cache.match("./")) ||
      (await cache.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    return new Response("Offline", {
      status: 503,
      statusText: "Offline",
    });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const isShellAsset = SHELL_ASSET_PATTERN.test(url.pathname);
  const isImage = request.destination === "image";

  if (isShellAsset) {
    event.respondWith(networkFirstAsset(request));
    return;
  }

  if (isImage) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
