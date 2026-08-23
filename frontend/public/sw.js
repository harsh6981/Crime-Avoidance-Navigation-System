/**
 * SafePath — Service Worker (Offline Safety Mode)
 * =================================================
 * Caches route data and map tiles so the app works
 * in low-connectivity areas.
 *
 * HOW TO REGISTER:
 *   In frontend/src/main.jsx, add:
 *
 *   if ('serviceWorker' in navigator) {
 *     navigator.serviceWorker.register('/sw.js');
 *   }
 *
 * Place this file at: frontend/public/sw.js
 */

const CACHE_NAME    = "safepath-v1";
const API_CACHE     = "safepath-api-v1";
const TILE_CACHE    = "safepath-tiles-v1";

// ── Files to cache on install (app shell) ──
const APP_SHELL = [
  "/",
  "/index.html",
  "/src/App.css",
];

// ── Install: cache the app shell ──
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Caching app shell");
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ──
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== API_CACHE && k !== TILE_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: serve from cache, fall back to network ──
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // ── Strategy 1: Map tiles → Cache First (tiles rarely change) ──
  if (
    url.hostname.includes("mapbox.com") ||
    url.hostname.includes("openstreetmap.org") ||
    url.pathname.includes("/tiles/")
  ) {
    event.respondWith(cacheFirstStrategy(event.request, TILE_CACHE));
    return;
  }

  // ── Strategy 2: API routes → Network First, cache as fallback ──
  if (url.pathname.startsWith("/api/routes/") || url.pathname.startsWith("/api/emergency/")) {
    event.respondWith(networkFirstStrategy(event.request, API_CACHE));
    return;
  }

  // ── Strategy 3: App shell → Cache First ──
  event.respondWith(cacheFirstStrategy(event.request, CACHE_NAME));
});

// ── Cache-First: return cached version, fetch in background ──
async function cacheFirstStrategy(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response(
      JSON.stringify({ error: "Offline — cached data unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ── Network-First: try network, fall back to cache ──
async function networkFirstStrategy(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      console.log("[SW] Offline — serving cached route data");
      return cached;
    }
    return new Response(
      JSON.stringify({ offline: true, message: "Using cached route data" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ── Background sync: queue failed hazard reports for later ──
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-hazard-reports") {
    event.waitUntil(syncQueuedHazardReports());
  }
});

async function syncQueuedHazardReports() {
  // Read queued reports from IndexedDB (stored when offline)
  // This runs when connectivity is restored
  try {
    const db = await openIDB();
    const queued = await getAllFromIDB(db, "queued_reports");

    for (const report of queued) {
      try {
        const res = await fetch("/api/hazards/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(report),
        });
        if (res.ok) {
          await deleteFromIDB(db, "queued_reports", report.id);
          console.log("[SW] Synced queued report:", report.id);
        }
      } catch {}
    }
  } catch (e) {
    console.error("[SW] Sync failed:", e);
  }
}

// ── IndexedDB helpers for offline queue ──
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("safepath-offline", 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore("queued_reports", { keyPath: "id" });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e);
  });
}

function getAllFromIDB(db, store) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e);
  });
}

function deleteFromIDB(db, store, key) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e);
  });
}