/**
 * Validation utilities for AI respiratory analysis.
 *
 * Scientific benchmark reference:
 * - RMSE: 1.1 rpm vs FDA-approved monitors
 * - Correlation: 0.92 with clinical reference
 * - Acceptable error threshold: <3 rpm vs manual count
 */

/** Maximum acceptable deviation (rpm) between AI and manual measurements */
export const MAX_ACCEPTABLE_ERROR_RPM = 3;

/** Scientific benchmark RMSE against FDA monitors */
export const BENCHMARK_RMSE = 1.1;

/** Scientific benchmark correlation with clinical reference */
export const BENCHMARK_CORRELATION = 0.92;

export interface ManualComparison {
  /** Most recent manual RPM value used for comparison */
  manualRpm: number;
  /** AI-computed RPM */
  aiRpm: number;
  /** Absolute difference in RPM */
  deviation: number;
  /** Whether the deviation is within the acceptable threshold */
  withinThreshold: boolean;
  /** How long ago the manual measurement was taken (in minutes) */
  minutesAgo: number;
}

export interface ValidationResult {
  /** Overall confidence: combines AI confidence + manual comparison */
  overallConfidence: "alta" | "media" | "baja";
  /** AI model's own confidence assessment */
  aiConfidence: "alta" | "media" | "baja";
  /** Comparison with recent manual measurement, if available */
  manualComparison: ManualComparison | null;
  /** Whether the result appears anomalous */
  isAnomalous: boolean;
  /** Human-readable warnings for the user */
  warnings: string[];
  /** Average error across all AI vs manual comparisons for this dog */
  averageError: number | null;
  /** Total number of AI measurements that have been compared */
  comparisonCount: number;
}

/** Typical resting respiratory rate range for dogs (rpm) */
const NORMAL_RPM_MIN = 10;
const NORMAL_RPM_MAX = 35;
/** Extreme values that are almost certainly wrong */
const EXTREME_RPM_MIN = 4;
const EXTREME_RPM_MAX = 80;

/**
 * Validate an AI analysis result against recent manual measurements.
 */
export function validateAnalysis(params: {
  aiRpm: number;
  aiConfidence: "alta" | "media" | "baja";
  recentManualMeasurements: Array<{
    breathsPerMinute: number;
    createdAt: Date;
  }>;
  historicalAiErrors: number[];
}): ValidationResult {
  const { aiRpm, aiConfidence, recentManualMeasurements, historicalAiErrors } =
    params;

  const warnings: string[] = [];
  let isAnomalous = false;
  let overallConfidence = aiConfidence;

  // 1. Check for extreme/impossible values
  if (aiRpm < EXTREME_RPM_MIN || aiRpm > EXTREME_RPM_MAX) {
    isAnomalous = true;
    warnings.push(
      `El resultado (${aiRpm} rpm) está fuera del rango fisiológico esperado. Se recomienda una medición manual.`
    );
    overallConfidence = "baja";
  } else if (aiRpm < NORMAL_RPM_MIN || aiRpm > NORMAL_RPM_MAX) {
    warnings.push(
      `El resultado (${aiRpm} rpm) está fuera del rango normal en reposo (${NORMAL_RPM_MIN}-${NORMAL_RPM_MAX} rpm). Verifica que el perro esté en reposo.`
    );
  }

  // 2. Compare with most recent manual measurement (within 24h)
  let manualComparison: ManualComparison | null = null;
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const recentManual = recentManualMeasurements
    .filter((m) => m.createdAt >= twentyFourHoursAgo)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (recentManual.length > 0) {
    const closest = recentManual[0];
    const deviation = Math.abs(aiRpm - closest.breathsPerMinute);
    const minutesAgo = Math.round(
      (now.getTime() - closest.createdAt.getTime()) / 60000
    );

    manualComparison = {
      manualRpm: closest.breathsPerMinute,
      aiRpm,
      deviation,
      withinThreshold: deviation <= MAX_ACCEPTABLE_ERROR_RPM,
      minutesAgo,
    };

    if (deviation > MAX_ACCEPTABLE_ERROR_RPM) {
      isAnomalous = true;
      warnings.push(
        `La diferencia con la última medición manual es de ${deviation} rpm (umbral aceptable: ≤${MAX_ACCEPTABLE_ERROR_RPM} rpm). Considera repetir la medición.`
      );
      // Downgrade confidence if deviation is large
      if (overallConfidence === "alta") {
        overallConfidence = "media";
      } else if (overallConfidence === "media" && deviation > MAX_ACCEPTABLE_ERROR_RPM * 2) {
        overallConfidence = "baja";
      }
    }
  }

  // 3. Low AI confidence warning
  if (aiConfidence === "baja") {
    warnings.push(
      "La IA reporta baja confianza en el conteo. Se recomienda una medición manual para confirmar."
    );
    overallConfidence = "baja";
  }

  // 4. Calculate average historical error
  let averageError: number | null = null;
  const comparisonCount = historicalAiErrors.length;
  if (comparisonCount > 0) {
    averageError =
      Math.round(
        (historicalAiErrors.reduce((sum, e) => sum + e, 0) / comparisonCount) *
          10
      ) / 10;

    if (averageError > MAX_ACCEPTABLE_ERROR_RPM) {
      warnings.push(
        `El error promedio histórico del análisis AI para este perro es ${averageError} rpm (objetivo: <${MAX_ACCEPTABLE_ERROR_RPM} rpm).`
      );
    }
  }

  return {
    overallConfidence,
    aiConfidence,
    manualComparison,
    isAnomalous,
    warnings,
    averageError,
    comparisonCount,
  };
}
