import { describe, it, expect } from "vitest";
import { validateAnalysis, MAX_ACCEPTABLE_ERROR_RPM } from "../analysis-validation";

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

describe("validateAnalysis", () => {
  it("returns alta confidence when AI confidence is alta and no anomalies", () => {
    const result = validateAnalysis({
      aiRpm: 20,
      aiConfidence: "alta",
      recentManualMeasurements: [],
      historicalAiErrors: [],
    });

    expect(result.overallConfidence).toBe("alta");
    expect(result.isAnomalous).toBe(false);
    expect(result.warnings).toHaveLength(0);
    expect(result.manualComparison).toBeNull();
  });

  it("flags extreme RPM values as anomalous", () => {
    const result = validateAnalysis({
      aiRpm: 2,
      aiConfidence: "alta",
      recentManualMeasurements: [],
      historicalAiErrors: [],
    });

    expect(result.isAnomalous).toBe(true);
    expect(result.overallConfidence).toBe("baja");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("rango fisiológico");
  });

  it("flags RPM outside normal range but within physiological range", () => {
    const result = validateAnalysis({
      aiRpm: 8,
      aiConfidence: "alta",
      recentManualMeasurements: [],
      historicalAiErrors: [],
    });

    expect(result.isAnomalous).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("rango normal");
  });

  it("compares with recent manual measurement within threshold", () => {
    const result = validateAnalysis({
      aiRpm: 22,
      aiConfidence: "alta",
      recentManualMeasurements: [
        { breathsPerMinute: 20, createdAt: minutesAgo(30) },
      ],
      historicalAiErrors: [],
    });

    expect(result.manualComparison).not.toBeNull();
    expect(result.manualComparison!.deviation).toBe(2);
    expect(result.manualComparison!.withinThreshold).toBe(true);
    expect(result.isAnomalous).toBe(false);
  });

  it("flags deviation exceeding threshold as anomalous", () => {
    const result = validateAnalysis({
      aiRpm: 28,
      aiConfidence: "alta",
      recentManualMeasurements: [
        { breathsPerMinute: 20, createdAt: minutesAgo(30) },
      ],
      historicalAiErrors: [],
    });

    expect(result.manualComparison).not.toBeNull();
    expect(result.manualComparison!.deviation).toBe(8);
    expect(result.manualComparison!.withinThreshold).toBe(false);
    expect(result.isAnomalous).toBe(true);
    expect(result.overallConfidence).toBe("media"); // downgraded from alta
  });

  it("ignores manual measurements older than 24 hours", () => {
    const result = validateAnalysis({
      aiRpm: 25,
      aiConfidence: "alta",
      recentManualMeasurements: [
        { breathsPerMinute: 15, createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      ],
      historicalAiErrors: [],
    });

    expect(result.manualComparison).toBeNull();
  });

  it("uses most recent manual measurement for comparison", () => {
    const result = validateAnalysis({
      aiRpm: 22,
      aiConfidence: "alta",
      recentManualMeasurements: [
        { breathsPerMinute: 18, createdAt: minutesAgo(120) },
        { breathsPerMinute: 21, createdAt: minutesAgo(30) },
      ],
      historicalAiErrors: [],
    });

    expect(result.manualComparison!.manualRpm).toBe(21);
    expect(result.manualComparison!.deviation).toBe(1);
  });

  it("downgrades confidence to baja when AI reports baja", () => {
    const result = validateAnalysis({
      aiRpm: 20,
      aiConfidence: "baja",
      recentManualMeasurements: [],
      historicalAiErrors: [],
    });

    expect(result.overallConfidence).toBe("baja");
    expect(result.warnings).toContainEqual(
      expect.stringContaining("baja confianza")
    );
  });

  it("calculates average historical error", () => {
    const result = validateAnalysis({
      aiRpm: 20,
      aiConfidence: "alta",
      recentManualMeasurements: [],
      historicalAiErrors: [1, 2, 3, 2, 1],
    });

    expect(result.averageError).toBe(1.8);
    expect(result.comparisonCount).toBe(5);
  });

  it("warns when average historical error exceeds threshold", () => {
    const result = validateAnalysis({
      aiRpm: 20,
      aiConfidence: "alta",
      recentManualMeasurements: [],
      historicalAiErrors: [4, 5, 3, 4, 5],
    });

    expect(result.averageError).toBe(4.2);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("error promedio histórico")
    );
  });

  it("combines multiple warning conditions", () => {
    const result = validateAnalysis({
      aiRpm: 45,
      aiConfidence: "baja",
      recentManualMeasurements: [
        { breathsPerMinute: 20, createdAt: minutesAgo(60) },
      ],
      historicalAiErrors: [5, 6, 4],
    });

    expect(result.overallConfidence).toBe("baja");
    expect(result.isAnomalous).toBe(true);
    // Should have warnings for: out of normal range, deviation from manual, baja confidence, high avg error
    expect(result.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it("large deviation downgrades media to baja", () => {
    const result = validateAnalysis({
      aiRpm: 30,
      aiConfidence: "media",
      recentManualMeasurements: [
        { breathsPerMinute: 20, createdAt: minutesAgo(30) },
      ],
      historicalAiErrors: [],
    });

    // deviation is 10, which is > MAX_ACCEPTABLE_ERROR_RPM * 2 = 6
    expect(result.overallConfidence).toBe("baja");
  });
});
