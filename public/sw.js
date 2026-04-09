/// <reference lib="webworker" />

// CardioCAn Service Worker — Push Notifications + Offline Caching

// ---- Cache Configuration ----

const CACHE_VERSION = "v1";
const STATIC_CACHE = `cardiocan-static-${CACHE_VERSION}`;
const MEDIAPIPE_CACHE = `cardiocan-mediapipe-${CACHE_VERSION}`;
const OFFLINE_QUEUE_STORE = "cardiocan-offline-queue";

/**
 * MediaPipe WASM runtime and model files to pre-cache.
 * These must match the URLs used in lib/on-device-analyzer.ts.
 */
const MEDIAPIPE_WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const MEDIAPIPE_FILES_TO_CACHE = [
  `${MEDIAPIPE_WASM_BASE}/vision_wasm_internal.js`,
  `${MEDIAPIPE_WASM_BASE}/vision_wasm_internal.wasm`,
  `${MEDIAPIPE_WASM_BASE}/vision_wasm_nosimd_internal.js`,
  `${MEDIAPIPE_WASM_BASE}/vision_wasm_nosimd_internal.wasm`,
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
];

/**
 * Static app assets to cache for offline shell.
 */
const STATIC_ASSETS_TO_CACHE = [
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.json",
];

// ---- Install: Pre-cache MediaPipe files and static assets ----

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(MEDIAPIPE_CACHE).then((cache) =>
        Promise.allSettled(
          MEDIAPIPE_FILES_TO_CACHE.map((url) =>
            cache.add(url).catch((err) => {
              console.warn(`[SW] Failed to pre-cache ${url}:`, err);
            })
          )
        )
      ),
      caches.open(STATIC_CACHE).then((cache) =>
        cache.addAll(STATIC_ASSETS_TO_CACHE).catch((err) => {
          console.warn("[SW] Failed to pre-cache static assets:", err);
        })
      ),
    ]).then(() => self.skipWaiting())
  );
});

// ---- Activate: Clean old caches and claim clients ----

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== STATIC_CACHE &&
                key !== MEDIAPIPE_CACHE &&
                key.startsWith("cardiocan-")
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
      .then(() => processOfflineQueue())
  );
});

// ---- Fetch: Cache-first for MediaPipe/static, network-first for API ----

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Cache-first for MediaPipe WASM and model files
  if (isMediaPipeRequest(url)) {
    event.respondWith(cacheFirst(event.request, MEDIAPIPE_CACHE));
    return;
  }

  // Cache-first for static assets (icons, manifest)
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  // Let all other requests pass through normally
});

/**
 * Check if the URL is a MediaPipe resource (WASM runtime or model).
 */
function isMediaPipeRequest(url) {
  return (
    url.href.startsWith(MEDIAPIPE_WASM_BASE) ||
    (url.hostname === "storage.googleapis.com" &&
      url.pathname.includes("mediapipe-models"))
  );
}

/**
 * Check if the URL is a cached static asset.
 */
function isStaticAsset(url) {
  return STATIC_ASSETS_TO_CACHE.some((path) => url.pathname === path);
}

/**
 * Cache-first strategy: serve from cache, fallback to network (and cache response).
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.error(`[SW] Fetch failed for ${request.url}:`, err);
    return new Response("Offline", { status: 503 });
  }
}

// ---- Offline Queue: Store and retry failed measurement POSTs ----

/**
 * Open (or create) the IndexedDB database for offline queue.
 */
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_QUEUE_STORE, 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("queue")) {
        db.createObjectStore("queue", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Add a failed request to the offline queue.
 */
async function enqueueOfflineRequest(url, body) {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction("queue", "readwrite");
    const store = tx.objectStore("queue");
    store.add({
      url,
      body,
      timestamp: Date.now(),
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.error("[SW] Failed to enqueue offline request:", err);
  }
}

/**
 * Process all queued offline requests (called on activate and online events).
 */
async function processOfflineQueue() {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction("queue", "readonly");
    const store = tx.objectStore("queue");
    const getAllReq = store.getAll();

    const items = await new Promise((resolve, reject) => {
      getAllReq.onsuccess = () => resolve(getAllReq.result);
      getAllReq.onerror = () => reject(getAllReq.error);
    });

    if (items.length === 0) {
      db.close();
      return;
    }

    const succeeded = [];

    for (const item of items) {
      try {
        const response = await fetch(item.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.body),
        });

        if (response.ok || response.status === 400) {
          // 400 = validation error, don't retry
          succeeded.push(item.id);
        }
      } catch {
        // Still offline, stop trying
        break;
      }
    }

    if (succeeded.length > 0) {
      const deleteTx = db.transaction("queue", "readwrite");
      const deleteStore = deleteTx.objectStore("queue");
      for (const id of succeeded) {
        deleteStore.delete(id);
      }
      await new Promise((resolve, reject) => {
        deleteTx.oncomplete = resolve;
        deleteTx.onerror = () => reject(deleteTx.error);
      });

      // Notify clients about synced measurements
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.postMessage({
          type: "offline-queue-synced",
          count: succeeded.length,
        });
      }
    }

    db.close();
  } catch (err) {
    console.error("[SW] Failed to process offline queue:", err);
  }
}

// Listen for online event to flush queue
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "flush-offline-queue") {
    event.waitUntil(processOfflineQueue());
  }

  if (event.data && event.data.type === "enqueue-measurement") {
    event.waitUntil(
      enqueueOfflineRequest(event.data.url, event.data.body)
    );
  }
});

// ---- Push Notifications (existing) ----

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const payload = event.data.json();
  const { title, body, icon, badge, tag, data, actions } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon || "/icon-192.png",
      badge: badge || "/icon-192.png",
      tag,
      data,
      actions: actions || [],
      vibrate: [200, 100, 200],
      requireInteraction: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const { data } = event.notification;
  const action = event.action;

  if (action === "administered" && data?.dogId && data?.medicationId) {
    // Log administration via API
    event.waitUntil(
      fetch(`/api/dogs/${data.dogId}/medications/${data.medicationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledTime: data.scheduledTime || "push",
          status: "administered",
        }),
      })
        .then(() => {
          // Open the dog's medication page
          return self.clients.matchAll({ type: "window" });
        })
        .then((clients) => {
          const url = `/perros/${data.dogId}/medicamentos`;
          for (const client of clients) {
            if (client.url.includes("/perros") && "focus" in client) {
              client.navigate(url);
              return client.focus();
            }
          }
          return self.clients.openWindow(url);
        })
    );
  } else if (action === "snooze" && data?.dogId && data?.medicationId) {
    // Re-send notification in 10 minutes
    event.waitUntil(
      new Promise((resolve) => {
        setTimeout(() => {
          self.registration
            .showNotification(event.notification.title, {
              body: event.notification.body + " (recordatorio)",
              icon: event.notification.icon,
              badge: event.notification.badge,
              tag: event.notification.tag + "-snooze",
              data: event.notification.data,
              actions: event.notification.actions,
              vibrate: [200, 100, 200],
              requireInteraction: true,
            })
            .then(resolve);
        }, 10 * 60 * 1000);
      })
    );
  } else {
    // Default: open the app
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
        const url = data?.dogId
          ? `/perros/${data.dogId}/medicamentos`
          : "/perros";
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
    );
  }
});
