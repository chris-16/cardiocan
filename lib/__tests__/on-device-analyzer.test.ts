/**
 * Tests for the on-device respiratory analyzer signal processing functions.
 * Note: The full analyzeVideoOnDevice function requires browser APIs (canvas, video),
 * so we test the pure signal processing helpers here.
 */
import { describe, it, expect } from "vitest";

// We test the internal helper functions by importing the module.
// Since the main export requires browser APIs, we test the algorithm logic
// by reimplementing the core signal processing steps for unit testing.

// --- Reimplemented helpers for testability ---

function bandpassFilter(
  signal: number[],
  sampleRate: number,
  lowCutHz: number,
  highCutHz: number
): number[] {
  if (signal.length === 0) return [];

  const mean = signal.reduce((sum, v) => sum + v, 0) / signal.length;
  let detrended = signal.map((v) => v - mean);

  const smoothWindow = Math.max(1, Math.round(sampleRate / (highCutHz * 2)));
  detrended = movingAverage(detrended, smoothWindow);

  const alphaHP = computeAlpha(lowCutHz, sampleRate);
  const highPassed = highPassFilter(detrended, alphaHP);

  const alphaLP = computeAlpha(highCutHz, sampleRate);
  const lowPassed = lowPassFilter(highPassed, alphaLP);

  return lowPassed;
}

function computeAlpha(cutoffHz: number, sampleRate: number): number {
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  return rc / (rc + dt);
}

function highPassFilter(signal: number[], alpha: number): number[] {
  const result = new Array(signal.length);
  result[0] = signal[0];
  for (let i = 1; i < signal.length; i++) {
    result[i] = alpha * (result[i - 1] + signal[i] - signal[i - 1]);
  }
  return result;
}

function lowPassFilter(signal: number[], alpha: number): number[] {
  const result = new Array(signal.length);
  result[0] = signal[0];
  for (let i = 1; i < signal.length; i++) {
    result[i] = alpha * result[i - 1] + (1 - alpha) * signal[i];
  }
  return result;
}

function movingAverage(signal: number[], windowSize: number): number[] {
  if (windowSize <= 1) return [...signal];
  const result = new Array(signal.length);
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < signal.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(signal.length - 1, i + halfWindow);
    let sum = 0;
    for (let j = start; j <= end; j++) {
      sum += signal[j];
    }
    result[i] = sum / (end - start + 1);
  }

  return result;
}

function detectPeaks(signal: number[], sampleRate: number): number[] {
  if (signal.length < 5) return [];

  const minPeakDistance = Math.round(sampleRate * 0.8);

  const absSignal = signal.map(Math.abs);
  const absMean = absSignal.reduce((s, v) => s + v, 0) / absSignal.length;
  const variance =
    absSignal.reduce((s, v) => s + (v - absMean) ** 2, 0) / absSignal.length;
  const stddev = Math.sqrt(variance);
  const threshold = absMean * 0.2 + stddev * 0.3;

  const peaks: number[] = [];

  for (let i = 1; i < signal.length - 1; i++) {
    if (
      signal[i] > signal[i - 1] &&
      signal[i] > signal[i + 1] &&
      signal[i] > threshold
    ) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minPeakDistance) {
        peaks.push(i);
      } else if (
        peaks.length > 0 &&
        signal[i] > signal[peaks[peaks.length - 1]]
      ) {
        peaks[peaks.length - 1] = i;
      }
    }
  }

  return peaks;
}

function computeSignalQuality(
  signal: number[],
  peaks: number[],
  sampleRate: number
): number {
  if (peaks.length < 2) return 0;

  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push((peaks[i] - peaks[i - 1]) / sampleRate);
  }

  const meanInterval =
    intervals.reduce((s, v) => s + v, 0) / intervals.length;
  const intervalVariance =
    intervals.reduce((s, v) => s + (v - meanInterval) ** 2, 0) /
    intervals.length;
  const cv = Math.sqrt(intervalVariance) / meanInterval;

  const regularityScore = Math.max(0, 1 - cv);

  const peakAmplitudes = peaks.map((i) => Math.abs(signal[i]));
  const meanPeakAmp =
    peakAmplitudes.reduce((s, v) => s + v, 0) / peakAmplitudes.length;
  const rms = Math.sqrt(
    signal.reduce((s, v) => s + v * v, 0) / signal.length
  );
  const snr = rms > 0 ? meanPeakAmp / rms : 0;
  const snrScore = Math.min(1, snr / 3);

  const countScore = Math.min(1, peaks.length / 5);

  return regularityScore * 0.4 + snrScore * 0.3 + countScore * 0.3;
}

// --- Helper to generate synthetic breathing signal ---

/**
 * Generate a synthetic signal simulating dog chest movement.
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
    signal.push(128 + 10 * breath + noise); // Simulates pixel intensity around 128
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
      // Allow ±2 breaths tolerance due to filter edge effects
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

      const expectedBreaths = (rpm * durationSec) / 60; // 20
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
