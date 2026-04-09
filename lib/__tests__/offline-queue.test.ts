/**
 * Tests for the offline queue module.
 *
 * Tests the network error detection logic and the public API shape.
 * IndexedDB and service worker interactions are browser-only, so we
 * test the pure utility functions here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the isNetworkError logic indirectly via saveMeasurementWithOfflineFallback
// and also verify module exports.

describe("offline-queue module exports", () => {
  it("exports all expected functions", async () => {
    const mod = await import("@/lib/offline-queue");

    expect(typeof mod.saveMeasurementWithOfflineFallback).toBe("function");
    expect(typeof mod.flushOfflineQueue).toBe("function");
    expect(typeof mod.onOfflineQueueSynced).toBe("function");
    expect(typeof mod.getPendingMeasurementCount).toBe("function");
  });
});

describe("saveMeasurementWithOfflineFallback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns online result when fetch succeeds", async () => {
    const mockResponse = {
      success: true,
      analysis: { breathCount: 10, breathsPerMinute: 20 },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { saveMeasurementWithOfflineFallback } = await import(
      "@/lib/offline-queue"
    );

    const result = await saveMeasurementWithOfflineFallback(
      "/api/dogs/123/on-device-measurement",
      { breathCount: 10, durationSeconds: 30, breathsPerMinute: 20 }
    );

    expect(result).toEqual({ online: true, data: mockResponse });
  });

  it("throws on server error (non-network)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Datos inválidos" }),
    });

    // Mock navigator.onLine as true (connected)
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });

    const { saveMeasurementWithOfflineFallback } = await import(
      "@/lib/offline-queue"
    );

    await expect(
      saveMeasurementWithOfflineFallback(
        "/api/dogs/123/on-device-measurement",
        { breathCount: 10 }
      )
    ).rejects.toThrow("Datos inválidos");
  });
});
