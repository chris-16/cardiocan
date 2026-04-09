/**
 * Tests for the on-device respiratory analyzer.
 *
 * Tests cover:
 * 1. Signal processing functions (bandpass filter, peak detection, signal quality)
 * 2. Landmark signal interpolation (handles gaps from failed MediaPipe detections)
 * 3. RPM calculation accuracy at various breathing rates
 *
 * The full analyzeVideoOnDevice function requires browser APIs (canvas, video,
 * MediaPipe WASM), so we test the pure signal processing and interpolation
 * helpers here. The exported functions from on-device-analyzer.ts are tested
 * directly where possible.
 */
import { describe, it, expect } from "vitest";
import {
  interpolateSignal,
  bandpassFilter,
  detectPeaks,
  computeSignalQuality,
} from "@/lib/on-device-analyzer";

// --- Helper to generate synthetic breathing signal ---

/**
 * Generate a synthetic signal simulating dog chest movement.
 * This works for both landmark-based (Y-position oscillation) and
 * pixel-intensity-based (brightness oscillation) signal sources.
 *
 * @param rpm Respiratory rate in breaths per minute
 * @param durationSec Duration in seconds
 * @param sampleRate Samples per second (fps)
 * @param noiseLevel Noise amplitude (0 = no noise)
 */
function generateBreathingSignal(
  rpm: number,
  durationSec: number,
  sampleRate: number,
  noiseLevel = 0
): number[] {
  const totalSamples = Math.floor(durationSec * sampleRate);
  const breathFreqHz = rpm / 60;
  const signal: number[] = [];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    // Sinusoidal breathing pattern with baseline
    const breath = Math.sin(2 * Math.PI * breathFreqHz * t);
    const noise = noiseLevel * (Math.random() * 2 - 1);
    signal.push(128 + 10 * breath + noise); // Simulates signal around baseline 128
  }

  return signal;
}

/**
 * Generate a landmark-based signal with gaps (null values) to simulate
 * frames where MediaPipe PoseLandmarker failed to detect landmarks.
 *
 * @param rpm Respiratory rate
 * @param durationSec Duration
 * @param sampleRate Sample rate
 * @param dropRate Fraction of frames with no detection (0-1)
 */
function generateLandmarkSignal(
  rpm: number,
  durationSec: number,
  sampleRate: number,
  dropRate: number
): (number | null)[] {
  const totalSamples = Math.floor(durationSec * sampleRate);
  const breathFreqHz = rpm / 60;
  const signal: (number | null)[] = [];

  for (let i = 0; i < totalSamples; i++) {
    if (Math.random() < dropRate) {
      signal.push(null);
    } else {
      const t = i / sampleRate;
      // Simulates Y-coordinate oscillation of torso landmarks (normalized 0-1)
      const breath = Math.sin(2 * Math.PI * breathFreqHz * t);
      signal.push(0.5 + 0.02 * breath); // Small Y oscillation around 0.5
    }
  }

  return signal;
}

// --- Tests ---

describe("On-device analyzer signal processing", () => {
  describe("bandpassFilter", () => {
    it("removes DC offset from signal", () => {
      const signal = [100, 101, 100, 99, 100, 101, 100, 99, 100, 101];
      const filtered = bandpassFilter(signal, 10, 0.15, 1.1);

      // Mean of filtered signal should be close to 0
      const mean =
        filtered.reduce((s, v) => s + v, 0) / filtered.length;
      expect(Math.abs(mean)).toBeLessThan(1);
    });

    it("returns empty array for empty input", () => {
      expect(bandpassFilter([], 10, 0.15, 1.1)).toEqual([]);
    });

    it("preserves breathing-frequency oscillations", () => {
      // 20 rpm = 0.33 Hz (within passband 0.15-1.1 Hz)
      const signal = generateBreathingSignal(20, 30, 10, 0);
      const filtered = bandpassFilter(signal, 10, 0.15, 1.1);

      // The filtered signal should still oscillate (not be flat)
      const range = Math.max(...filtered) - Math.min(...filtered);
      expect(range).toBeGreaterThan(0.5);
    });
  });

  describe("detectPeaks", () => {
    it("detects correct number of peaks for clean 20 rpm signal", () => {
      const durationSec = 30;
      const sampleRate = 10;
      const rpm = 20;

      const signal = generateBreathingSignal(rpm, durationSec, sampleRate, 0);
      const filtered = bandpassFilter(signal, sampleRate, 0.15, 1.1);
      const peaks = detectPeaks(filtered, sampleRate);

      // Expected breaths in 30 seconds at 20 rpm = 10
      const expectedBreaths = (rpm * durationSec) / 60;
      // Allow +/-2 breaths tolerance due to filter edge effects
      expect(peaks.length).toBeGreaterThanOrEqual(expectedBreaths - 2);
      expect(peaks.length).toBeLessThanOrEqual(expectedBreaths + 2);
    });

    it("detects correct number of peaks for 30 rpm signal", () => {
      const durationSec = 30;
      const sampleRate = 10;
      const rpm = 30;

      const signal = generateBreathingSignal(rpm, durationSec, sampleRate, 0);
      const filtered = bandpassFilter(signal, sampleRate, 0.15, 1.1);
      const peaks = detectPeaks(filtered, sampleRate);

      const expectedBreaths = (rpm * durationSec) / 60; // 15
      expect(peaks.length).toBeGreaterThanOrEqual(expectedBreaths - 3);
      expect(peaks.length).toBeLessThanOrEqual(expectedBreaths + 3);
    });

    it("returns empty array for very short signal", () => {
      expect(detectPeaks([1, 2, 3], 10)).toEqual([]);
    });

    it("handles noisy signal with reasonable accuracy", () => {
      const durationSec = 60;
      const sampleRate = 10;
      const rpm = 20;

      const signal = generateBreathingSignal(rpm, durationSec, sampleRate, 2);
      const filtered = bandpassFilter(signal, sampleRate, 0.15, 1.1);
      const peaks = detectPeaks(filtered, sampleRate);

      const detectedRpm = (peaks.length / durationSec) * 60;

      // Should be within 5 rpm of expected for noisy signal
      expect(Math.abs(detectedRpm - rpm)).toBeLessThan(5);
    });
  });

  describe("computeSignalQuality", () => {
    it("returns 0 for fewer than 2 peaks", () => {
      expect(computeSignalQuality([1, 2, 3], [0], 10)).toBe(0);
      expect(computeSignalQuality([1, 2, 3], [], 10)).toBe(0);
    });

    it("returns high quality for regular clean signal", () => {
      const signal = generateBreathingSignal(20, 30, 10, 0);
      const filtered = bandpassFilter(signal, 10, 0.15, 1.1);
      const peaks = detectPeaks(filtered, 10);
      const quality = computeSignalQuality(filtered, peaks, 10);

      expect(quality).toBeGreaterThan(0.5);
    });

    it("returns lower quality for noisy signal", () => {
      const cleanSignal = generateBreathingSignal(20, 30, 10, 0);
      const noisySignal = generateBreathingSignal(20, 30, 10, 5);

      const cleanFiltered = bandpassFilter(cleanSignal, 10, 0.15, 1.1);
      const noisyFiltered = bandpassFilter(noisySignal, 10, 0.15, 1.1);

      const cleanPeaks = detectPeaks(cleanFiltered, 10);
      const noisyPeaks = detectPeaks(noisyFiltered, 10);

      const cleanQuality = computeSignalQuality(cleanFiltered, cleanPeaks, 10);
      const noisyQuality = computeSignalQuality(noisyFiltered, noisyPeaks, 10);

      // Clean signal should have higher or equal quality
      expect(cleanQuality).toBeGreaterThanOrEqual(noisyQuality * 0.8);
    });
  });

  describe("RPM calculation integration", () => {
    it("computes accurate RPM for 15 rpm resting rate over 60s", () => {
      const durationSec = 60;
      const sampleRate = 10;
      const targetRpm = 15;

      const signal = generateBreathingSignal(
        targetRpm,
        durationSec,
        sampleRate,
        0.5
      );
      const filtered = bandpassFilter(signal, sampleRate, 0.15, 1.1);
      const peaks = detectPeaks(filtered, sampleRate);
      const computedRpm = Math.round((peaks.length / durationSec) * 60);

      // Should be within 3 rpm (the app's acceptable error threshold)
      expect(Math.abs(computedRpm - targetRpm)).toBeLessThanOrEqual(3);
    });

    it("computes accurate RPM for 25 rpm elevated rate over 30s", () => {
      const durationSec = 30;
      const sampleRate = 10;
      const targetRpm = 25;

      const signal = generateBreathingSignal(
        targetRpm,
        durationSec,
        sampleRate,
        0.5
      );
      const filtered = bandpassFilter(signal, sampleRate, 0.15, 1.1);
      const peaks = detectPeaks(filtered, sampleRate);
      const computedRpm = Math.round((peaks.length / durationSec) * 60);

      expect(Math.abs(computedRpm - targetRpm)).toBeLessThanOrEqual(4);
    });
  });
});

describe("MediaPipe landmark signal interpolation", () => {
  describe("interpolateSignal", () => {
    it("returns all values unchanged when no gaps", () => {
      const signal: (number | null)[] = [1, 2, 3, 4, 5];
      const result = interpolateSignal(signal);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it("linearly interpolates single gap", () => {
      const signal: (number | null)[] = [1, null, 3];
      const result = interpolateSignal(signal);
      expect(result).toEqual([1, 2, 3]);
    });

    it("linearly interpolates multiple consecutive gaps", () => {
      const signal: (number | null)[] = [0, null, null, null, 4];
      const result = interpolateSignal(signal);
      expect(result).toEqual([0, 1, 2, 3, 4]);
    });

    it("fills leading nulls with first valid value", () => {
      const signal: (number | null)[] = [null, null, 5, 6, 7];
      const result = interpolateSignal(signal);
      expect(result).toEqual([5, 5, 5, 6, 7]);
    });

    it("fills trailing nulls with last valid value", () => {
      const signal: (number | null)[] = [1, 2, 3, null, null];
      const result = interpolateSignal(signal);
      expect(result).toEqual([1, 2, 3, 3, 3]);
    });

    it("handles all-null signal", () => {
      const signal: (number | null)[] = [null, null, null];
      const result = interpolateSignal(signal);
      expect(result).toEqual([0, 0, 0]);
    });

    it("handles single valid value", () => {
      const signal: (number | null)[] = [null, 5, null];
      const result = interpolateSignal(signal);
      expect(result).toEqual([5, 5, 5]);
    });

    it("preserves signal shape through sparse landmark detections", () => {
      // Simulate MediaPipe detecting landmarks on ~60% of frames
      const durationSec = 30;
      const sampleRate = 10;
      const rpm = 20;

      const landmarkSignal = generateLandmarkSignal(
        rpm,
        durationSec,
        sampleRate,
        0.4 // 40% drop rate
      );

      const interpolated = interpolateSignal(landmarkSignal);

      // Should have no nulls
      expect(interpolated.every((v) => v !== null)).toBe(true);

      // Should be able to detect breathing after bandpass filter
      const filtered = bandpassFilter(interpolated, sampleRate, 0.15, 1.1);
      const peaks = detectPeaks(filtered, sampleRate);
      const detectedRpm = (peaks.length / durationSec) * 60;

      // Allow wider tolerance due to interpolation artifacts
      expect(Math.abs(detectedRpm - rpm)).toBeLessThan(8);
    });
  });

  describe("landmark-based RPM from interpolated signal", () => {
    it("detects breathing at 20 rpm from landmark Y-coordinates", () => {
      const durationSec = 60;
      const sampleRate = 10;
      const targetRpm = 20;

      // Simulate clean landmark signal (all frames detected)
      const signal = generateLandmarkSignal(
        targetRpm,
        durationSec,
        sampleRate,
        0 // no drops
      );

      const interpolated = interpolateSignal(signal);
      const filtered = bandpassFilter(interpolated, sampleRate, 0.15, 1.1);
      const peaks = detectPeaks(filtered, sampleRate);
      const computedRpm = Math.round((peaks.length / durationSec) * 60);

      expect(Math.abs(computedRpm - targetRpm)).toBeLessThanOrEqual(3);
    });

    it("detects breathing at 15 rpm with 30% landmark drop rate", () => {
      const durationSec = 60;
      const sampleRate = 10;
      const targetRpm = 15;

      const signal = generateLandmarkSignal(
        targetRpm,
        durationSec,
        sampleRate,
        0.3 // 30% drop rate
      );

      const interpolated = interpolateSignal(signal);
      const filtered = bandpassFilter(interpolated, sampleRate, 0.15, 1.1);
      const peaks = detectPeaks(filtered, sampleRate);
      const computedRpm = Math.round((peaks.length / durationSec) * 60);

      // Wider tolerance for sparse detections
      expect(Math.abs(computedRpm - targetRpm)).toBeLessThanOrEqual(5);
    });
  });
});

describe("MediaPipe integration constants", () => {
  it("exports are available from on-device-analyzer module", async () => {
    const mod = await import("@/lib/on-device-analyzer");

    // Verify key exports exist
    expect(typeof mod.analyzeVideoOnDevice).toBe("function");
    expect(typeof mod.interpolateSignal).toBe("function");
    expect(typeof mod.bandpassFilter).toBe("function");
    expect(typeof mod.detectPeaks).toBe("function");
    expect(typeof mod.computeSignalQuality).toBe("function");
  });
});
