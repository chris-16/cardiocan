/**
 * Client-side offline queue for saving on-device measurements.
 *
 * When the user completes an on-device analysis but has no connectivity,
 * the measurement is queued in the service worker's IndexedDB store.
 * The service worker retries queued POSTs when connectivity returns.
 *
 * This module provides:
 * - saveMeasurementWithOfflineFallback(): try POST, queue if offline
 * - flushOfflineQueue(): ask the SW to retry queued requests
 * - onOfflineQueueSynced(): listen for SW sync notifications
 * - getPendingMeasurementCount(): check how many items are queued
 */

const OFFLINE_QUEUE_DB = "cardiocan-offline-queue";

export interface QueuedMeasurement {
  url: string;
  body: Record<string, unknown>;
  timestamp: number;
}

/**
 * Try to POST a measurement to the server. If offline, queue it
 * for later sync via the service worker.
 *
 * Returns { online: true, data } on success, or { online: false } if queued.
 */
export async function saveMeasurementWithOfflineFallback(
  url: string,
  body: Record<string, unknown>
): Promise<
  | { online: true; data: Record<string, unknown> }
  | { online: false; queued: boolean }
> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Error al guardar la medición");
    }

    return { online: true, data };
  } catch (err) {
    // Check if this is a network error (offline) vs. a server error
    if (!navigator.onLine || isNetworkError(err)) {
      const queued = await enqueueToServiceWorker(url, body);
      return { online: false, queued };
    }

    // Re-throw server errors
    throw err;
  }
}

/**
 * Check if an error is a network connectivity error.
 */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message.includes("fetch")) return true;
  if (err instanceof DOMException && err.name === "AbortError") return false;
  // Generic network error detection
  if (
    err instanceof Error &&
    (err.message.includes("NetworkError") ||
      err.message.includes("Failed to fetch") ||
      err.message.includes("Network request failed") ||
      err.message.includes("Load failed"))
  )
    return true;
  return false;
}

/**
 * Send the measurement to the service worker for offline queueing.
 * Falls back to direct IndexedDB storage if SW messaging fails.
 */
async function enqueueToServiceWorker(
  url: string,
  body: Record<string, unknown>
): Promise<boolean> {
  try {
    // Try service worker message channel first
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.active) {
      registration.active.postMessage({
        type: "enqueue-measurement",
        url,
        body,
      });
      return true;
    }
  } catch {
    // SW not available, fall through to direct IndexedDB
  }

  // Fallback: write directly to IndexedDB
  try {
    await enqueueDirectToIndexedDB(url, body);
    return true;
  } catch {
    return false;
  }
}

/**
 * Directly enqueue to IndexedDB (fallback when SW is not available).
 */
function enqueueDirectToIndexedDB(
  url: string,
  body: Record<string, unknown>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_QUEUE_DB, 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("queue")) {
        db.createObjectStore("queue", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("queue", "readwrite");
      const store = tx.objectStore("queue");
      store.add({ url, body, timestamp: Date.now() });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Ask the service worker to flush any queued offline requests.
 * Call this when connectivity is restored.
 */
export async function flushOfflineQueue(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.active) {
      registration.active.postMessage({ type: "flush-offline-queue" });
    }
  } catch {
    // SW not available
  }
}

/**
 * Listen for service worker notifications when queued measurements are synced.
 * Returns a cleanup function to remove the listener.
 */
export function onOfflineQueueSynced(
  callback: (syncedCount: number) => void
): () => void {
  const handler = (event: MessageEvent) => {
    if (event.data?.type === "offline-queue-synced") {
      callback(event.data.count);
    }
  };

  navigator.serviceWorker?.addEventListener("message", handler);

  return () => {
    navigator.serviceWorker?.removeEventListener("message", handler);
  };
}

/**
 * Get the number of pending measurements in the offline queue.
 */
export async function getPendingMeasurementCount(): Promise<number> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(OFFLINE_QUEUE_DB, 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("queue")) {
          db.createObjectStore("queue", {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction("queue", "readonly");
          const store = tx.objectStore("queue");
          const countReq = store.count();
          countReq.onsuccess = () => {
            db.close();
            resolve(countReq.result);
          };
          countReq.onerror = () => {
            db.close();
            resolve(0);
          };
        } catch {
          db.close();
          resolve(0);
        }
      };

      request.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}
