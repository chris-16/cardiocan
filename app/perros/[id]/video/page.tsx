"use client";

import { useState, useRef, useEffect, use } from "react";
import Link from "next/link";
import VideoRecorder from "@/app/perros/components/video-recorder";
import AnalysisMethodSelector from "@/app/perros/components/analysis-method-selector";
import ROISelector from "@/app/perros/components/roi-selector";
import OnDeviceProgress from "@/app/perros/components/on-device-progress";
import type { AnalysisMethod } from "@/app/perros/components/analysis-method-selector";
import type { ValidationResult, ManualComparison } from "@/lib/analysis-validation";
import type { ROI, AnalysisProgress, OnDeviceAnalysisResult } from "@/lib/on-device-analyzer";
import {
  flushOfflineQueue,
  onOfflineQueueSynced,
  getPendingMeasurementCount,
} from "@/lib/offline-queue";

type PageState =
  | "instructions"
  | "recording"
  | "preview"
  | "roi-selection"
  | "on-device-analyzing"
  | "calibration";

interface AnalysisResult {
  breathCount: number;
  durationSeconds: number;
  breathsPerMinute: number;
  confidence: "alta" | "media" | "baja";
  notes: string;
}

interface AnalysisResponse {
  success: boolean;
  analysis: AnalysisResult;
  measurementId?: string;
  message?: string;
  validation?: ValidationResult;
}

export default function VideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: dogId } = use(params);

  const [pageState, setPageState] = useState<PageState>("instructions");
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [analysisMethod, setAnalysisMethod] = useState<AnalysisMethod>("cloud");
  const [onDeviceProgress, setOnDeviceProgress] =
    useState<AnalysisProgress | null>(null);
  const [usedMethod, setUsedMethod] = useState<AnalysisMethod | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [offlineSyncedMsg, setOfflineSyncedMsg] = useState<string | null>(null);

  // Calibration state
  const [calibrationAction, setCalibrationAction] = useState<
    "pending" | "accepted" | "corrected"
  >("pending");
  const [correctedRpm, setCorrectedRpm] = useState<string>("");
  const [correctionNotes, setCorrectionNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploaded, setVideoUploaded] = useState(false);
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null);

  const videoBlobRef = useRef<Blob | null>(null);

  // Listen for offline queue sync events and online/offline status
  useEffect(() => {
    const cleanup = onOfflineQueueSynced((count) => {
      setOfflineSyncedMsg(
        `Se ${count === 1 ? "sincronizó" : "sincronizaron"} ${count} ${count === 1 ? "medición pendiente" : "mediciones pendientes"}.`
      );
      setPendingCount(0);
      setTimeout(() => setOfflineSyncedMsg(null), 5000);
    });

    const handleOnline = () => {
      flushOfflineQueue();
    };

    window.addEventListener("online", handleOnline);

    // Check pending count on mount
    getPendingMeasurementCount().then(setPendingCount);

    return () => {
      cleanup();
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  function handleVideoReady(blob: Blob) {
    videoBlobRef.current = blob;
    setVideoBlob(blob);
    setPageState("preview");
  }

  function handleReset() {
    videoBlobRef.current = null;
    setVideoBlob(null);
    setAnalysisError(null);
    setPageState("recording");
  }

  // --- Cloud analysis (Gemini) — skip saving for calibration flow ---
  async function handleCloudAnalyze() {
    if (!videoBlob) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setUsedMethod("cloud");

    try {
      const formData = new FormData();
      formData.append("video", videoBlob, "respiracion.webm");
      formData.append("skipSave", "true");

      const res = await fetch(`/api/dogs/${dogId}/analyze-video`, {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as AnalysisResponse & { error?: string };

      if (!res.ok) {
        throw new Error(data.error || "Error al analizar el video");
      }

      setResult(data);
      if (data.success) {
        setPageState("calibration");
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Error inesperado al analizar el video";
      setAnalysisError(message);
    } finally {
      setAnalyzing(false);
    }
  }

  // --- On-device analysis — don't save, go to calibration ---
  function handleStartOnDeviceAnalysis() {
    if (!videoBlob) return;
    setAnalysisError(null);
    setPageState("roi-selection");
  }

  async function handleROISelected(roi: ROI) {
    if (!videoBlob) return;
    setPageState("on-device-analyzing");
    setAnalysisError(null);
    setUsedMethod("on-device");
    setSavedOffline(false);

    try {
      // Dynamic import to keep the analyzer out of the main bundle
      const { analyzeVideoOnDevice } = await import(
        "@/lib/on-device-analyzer"
      );

      const analysisResult: OnDeviceAnalysisResult =
        await analyzeVideoOnDevice(videoBlob, roi, (progress) => {
          setOnDeviceProgress(progress);
        });

      // Don't save yet — go to calibration review
      setResult({
        success: true,
        analysis: {
          breathCount: analysisResult.breathCount,
          durationSeconds: analysisResult.durationSeconds,
          breathsPerMinute: analysisResult.breathsPerMinute,
          confidence: analysisResult.confidence,
          notes: analysisResult.notes,
        },
      });

      setPageState("calibration");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Error inesperado en el análisis on-device";
      setAnalysisError(message);
      setPageState("preview");
    } finally {
      setOnDeviceProgress(null);
    }
  }

  function handleAnalyze() {
    if (analysisMethod === "cloud") {
      handleCloudAnalyze();
    } else {
      handleStartOnDeviceAnalysis();
    }
  }

  // --- Calibration: Accept or Correct ---
  async function handleCalibrationConfirm(action: "accepted" | "corrected") {
    if (!result?.analysis) return;

    const { analysis } = result;
    const finalRpm =
      action === "accepted"
        ? analysis.breathsPerMinute
        : parseInt(correctedRpm, 10);

    if (action === "corrected" && (isNaN(finalRpm) || finalRpm < 1 || finalRpm > 120)) {
      setAnalysisError("Ingresa un valor válido entre 1 y 120 rpm.");
      return;
    }

    setSaving(true);
    setAnalysisError(null);

    try {
      const res = await fetch(`/api/dogs/${dogId}/calibrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiBreathCount: analysis.breathCount,
          aiDurationSeconds: analysis.durationSeconds,
          aiBreathsPerMinute: analysis.breathsPerMinute,
          aiConfidence: analysis.confidence,
          aiNotes: analysis.notes || "",
          aiMethod: usedMethod === "on-device" ? "on-device" : "cloud",
          finalBreathsPerMinute: finalRpm,
          action,
          correctionNotes: correctionNotes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar la calibración");
      }

      const calibrationData = await res.json();
      setCalibrationAction(action);
      setSaved(true);

      // Upload the video to R2 in the background (non-blocking)
      if (videoBlobRef.current && calibrationData.measurementId) {
        uploadVideoToR2(calibrationData.measurementId);
      }
    } catch (err) {
      if (!navigator.onLine && usedMethod === "on-device") {
        // Offline fallback for on-device measurements
        setSavedOffline(true);
        const pending = await getPendingMeasurementCount();
        setPendingCount(pending);
        setCalibrationAction(action);
        setSaved(true);
      } else {
        const message =
          err instanceof Error ? err.message : "Error inesperado";
        setAnalysisError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function uploadVideoToR2(measurementId: string) {
    if (!videoBlobRef.current) return;

    setVideoUploading(true);
    setVideoUploadError(null);

    try {
      const formData = new FormData();
      formData.append("video", videoBlobRef.current, "respiracion.webm");
      formData.append("measurementId", measurementId);

      const res = await fetch(`/api/dogs/${dogId}/video-upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al subir el video");
      }

      setVideoUploaded(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error al subir el video";
      setVideoUploadError(message);
    } finally {
      setVideoUploading(false);
    }
  }

  function resetAll() {
    setResult(null);
    setVideoBlob(null);
    setAnalysisError(null);
    setOnDeviceProgress(null);
    setUsedMethod(null);
    setCalibrationAction("pending");
    setCorrectedRpm("");
    setCorrectionNotes("");
    setSaving(false);
    setSaved(false);
    setSavedOffline(false);
    setVideoUploading(false);
    setVideoUploaded(false);
    setVideoUploadError(null);
    setPageState("instructions");
  }

  // --- Calibration review screen ---
  if (pageState === "calibration" && result) {
    const { analysis, validation } = result;
    const rpm = analysis.breathsPerMinute;
    const isNormal = rpm > 0 && rpm <= 30;
    const isElevated = rpm > 30 && rpm <= 40;
    const isUrgent = rpm > 40;

    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-xl font-bold">Revisar resultado AI</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Acepta o corrige el resultado antes de guardarlo
            </p>
          </div>

          {/* Method badge */}
          <div className="flex justify-center">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                usedMethod === "on-device"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              }`}
            >
              {usedMethod === "on-device" ? "📱" : "☁️"}
              {usedMethod === "on-device"
                ? "Análisis en dispositivo"
                : "Análisis cloud (Gemini)"}
            </span>
          </div>

          {/* AI RPM result */}
          <div className="text-center">
            <div
              className={`inline-flex items-center justify-center w-32 h-32 rounded-full ${
                isNormal
                  ? "bg-green-100 dark:bg-green-900/30"
                  : isElevated
                    ? "bg-yellow-100 dark:bg-yellow-900/30"
                    : "bg-red-100 dark:bg-red-900/30"
              }`}
            >
              <div>
                <span
                  className={`block text-4xl font-bold ${
                    isNormal
                      ? "text-green-700 dark:text-green-400"
                      : isElevated
                        ? "text-yellow-700 dark:text-yellow-400"
                        : "text-red-700 dark:text-red-400"
                  }`}
                >
                  {rpm}
                </span>
                <span className="block text-sm text-gray-500 dark:text-gray-400">
                  rpm (AI)
                </span>
              </div>
            </div>
          </div>

          {/* Status message */}
          <div
            className={`rounded-lg border p-4 text-center ${
              isNormal
                ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                : isElevated
                  ? "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20"
                  : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
            }`}
          >
            <p
              className={`text-sm font-medium ${
                isNormal
                  ? "text-green-700 dark:text-green-400"
                  : isElevated
                    ? "text-yellow-700 dark:text-yellow-400"
                    : "text-red-700 dark:text-red-400"
              }`}
            >
              {isNormal && "Frecuencia respiratoria normal"}
              {isElevated && "Frecuencia respiratoria elevada"}
              {isUrgent &&
                "Frecuencia respiratoria alta — consulta al veterinario"}
            </p>
          </div>

          {/* Details */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
            <div className="flex justify-between px-4 py-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Respiraciones contadas
              </span>
              <span className="text-sm font-medium">
                {analysis.breathCount}
              </span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Duración del video
              </span>
              <span className="text-sm font-medium">
                {analysis.durationSeconds}s
              </span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Confianza del análisis
              </span>
              <ConfidenceBadge
                confidence={
                  validation?.overallConfidence ?? analysis.confidence
                }
                aiConfidence={analysis.confidence}
              />
            </div>
          </div>

          {/* Validation: Manual comparison */}
          {validation?.manualComparison && (
            <ManualComparisonCard
              comparison={validation.manualComparison}
            />
          )}

          {/* Validation warnings */}
          {validation && validation.warnings.length > 0 && (
            <div className="space-y-2">
              {validation.warnings.map((warning, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4"
                >
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    <strong>⚠️ Atención:</strong> {warning}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Historical accuracy */}
          {validation && validation.comparisonCount > 0 && (
            <HistoricalAccuracyCard
              averageError={validation.averageError}
              comparisonCount={validation.comparisonCount}
            />
          )}

          {/* Calibration action area */}
          {!saved ? (
            <div className="rounded-lg border-2 border-blue-200 dark:border-blue-800 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                ¿El resultado AI es correcto?
              </h2>

              {analysisError && (
                <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {analysisError}
                  </p>
                </div>
              )}

              {/* Accept button */}
              <button
                onClick={() => handleCalibrationConfirm("accepted")}
                disabled={saving}
                className="w-full rounded-md bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Guardando...
                  </span>
                ) : (
                  "✅ Aceptar resultado AI"
                )}
              </button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white dark:bg-gray-900 px-2 text-gray-500">
                    o corregir
                  </span>
                </div>
              </div>

              {/* Correction inputs */}
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="correctedRpm"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Frecuencia respiratoria correcta (rpm)
                  </label>
                  <input
                    id="correctedRpm"
                    type="number"
                    min={1}
                    max={120}
                    value={correctedRpm}
                    onChange={(e) => setCorrectedRpm(e.target.value)}
                    placeholder={`AI midió ${rpm} rpm`}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="correctionNotes"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Nota de corrección (opcional)
                  </label>
                  <input
                    id="correctionNotes"
                    type="text"
                    value={correctionNotes}
                    onChange={(e) => setCorrectionNotes(e.target.value)}
                    placeholder="Ej: Conté manualmente durante el video"
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <button
                  onClick={() => handleCalibrationConfirm("corrected")}
                  disabled={saving || !correctedRpm}
                  className="w-full rounded-md bg-amber-600 px-4 py-3 text-sm font-medium text-white hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Guardando...
                    </span>
                  ) : (
                    "✏️ Corregir y guardar"
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Post-save confirmation */
            <div className="space-y-4">
              <div
                className={`rounded-lg border p-4 text-center ${
                  calibrationAction === "accepted"
                    ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                    : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
                }`}
              >
                <p
                  className={`text-sm font-medium ${
                    calibrationAction === "accepted"
                      ? "text-green-700 dark:text-green-400"
                      : "text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {calibrationAction === "accepted"
                    ? "✅ Resultado AI aceptado y guardado"
                    : `✏️ Resultado corregido: ${rpm} → ${correctedRpm} rpm`}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Registro de calibración creado para mejora progresiva
                </p>
              </div>

              {savedOffline && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    <strong>Sin conexión:</strong> La medición se guardó
                    localmente y se sincronizará automáticamente.
                  </p>
                </div>
              )}

              {/* Video upload status */}
              {videoUploading && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 p-4 flex items-center gap-3">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent shrink-0" />
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    Almacenando video como evidencia...
                  </p>
                </div>
              )}
              {videoUploaded && (
                <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 p-4">
                  <p className="text-sm text-green-700 dark:text-green-400">
                    📹 Video almacenado como evidencia del análisis
                  </p>
                </div>
              )}
              {videoUploadError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    No se pudo almacenar el video: {videoUploadError}
                  </p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={resetAll}
                  className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Grabar otro video
                </button>
                <Link
                  href={`/perros/${dogId}`}
                  className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Volver al perfil
                </Link>
              </div>

              <div className="text-center">
                <Link
                  href={`/perros/${dogId}/calibracion`}
                  className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Ver historial de calibración →
                </Link>
              </div>
            </div>
          )}

          {/* Scientific reference */}
          {!saved && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <strong>Referencia científica:</strong> El análisis por video
                se basa en tecnología con un RMSE de 1.1 rpm y correlación de
                0.92 respecto a monitores aprobados por la FDA. El objetivo de
                precisión es un error {"<"}3 rpm vs medición manual.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Failed result screen (no breaths detected) ---
  if (result && !result.success) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="space-y-6">
          <div className="text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold">
              No se pudieron contar las respiraciones
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {result.message ||
                "El video no permitió un análisis confiable."}
            </p>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              <strong>Sugerencias:</strong>
            </p>
            <ul className="mt-2 text-sm text-amber-700 dark:text-amber-400 list-disc list-inside space-y-1">
              <li>Asegúrate de que el pecho del perro sea visible</li>
              <li>Graba con buena iluminación</li>
              <li>Mantén la cámara estable</li>
              <li>El perro debe estar en reposo</li>
              {usedMethod === "on-device" && (
                <li>
                  Intenta seleccionar con más precisión la zona del tórax
                </li>
              )}
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={resetAll}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Grabar otro video
            </button>
            <Link
              href={`/perros/${dogId}`}
              className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Volver al perfil
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      {/* Offline sync notifications */}
      {offlineSyncedMsg && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 p-3">
          <p className="text-sm text-green-700 dark:text-green-400">
            {offlineSyncedMsg}
          </p>
        </div>
      )}
      {pendingCount > 0 && !savedOffline && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {pendingCount}{" "}
            {pendingCount === 1
              ? "medición pendiente"
              : "mediciones pendientes"}{" "}
            de sincronización.
          </p>
        </div>
      )}

      <div className="mb-6">
        <Link
          href={`/perros/${dogId}`}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          &larr; Volver al perfil
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-2">
        Análisis de respiración por IA
      </h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Graba un video de 30 a 60 segundos y la IA contará automáticamente las
        respiraciones por minuto.
      </p>

      {/* Instructions screen */}
      {pageState === "instructions" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 p-4">
            <h2 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-3">
              Instrucciones para una buena grabación
            </h2>
            <ol className="space-y-3 text-sm text-blue-700 dark:text-blue-400">
              <li className="flex gap-2">
                <span className="flex-shrink-0 font-bold">1.</span>
                <span>
                  <strong>Perro en reposo:</strong> Asegúrate de que tu perro
                  esté descansando o durmiendo. No lo grabes después de jugar o
                  hacer ejercicio.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 font-bold">2.</span>
                <span>
                  <strong>Vista lateral:</strong> Posiciona la cámara de forma
                  que se vea claramente el costado del pecho del perro.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 font-bold">3.</span>
                <span>
                  <strong>Estabilidad:</strong> Mantén el teléfono lo más quieto
                  posible. Apóyalo en una superficie si puedes.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 font-bold">4.</span>
                <span>
                  <strong>Buena iluminación:</strong> Graba en un lugar bien
                  iluminado para que se aprecien los movimientos del pecho.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 font-bold">5.</span>
                <span>
                  <strong>Duración:</strong> El video debe durar entre 30 y 60
                  segundos. La grabación se detendrá automáticamente a los 60
                  segundos.
                </span>
              </li>
            </ol>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              <strong>Consejo:</strong> Los mejores resultados se obtienen cuando
              el perro lleva al menos 15 minutos en reposo. Evita grabarlo si
              está jadeando o agitado.
            </p>
          </div>

          <button
            onClick={() => setPageState("recording")}
            className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Continuar a la grabación
          </button>
        </div>
      )}

      {/* Recording screen */}
      {(pageState === "recording" || pageState === "preview") && (
        <div className="space-y-6">
          <VideoRecorder
            minDuration={30}
            maxDuration={60}
            onVideoReady={handleVideoReady}
            onReset={handleReset}
          />

          {/* Preview actions */}
          {pageState === "preview" && videoBlob && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                <div className="flex justify-between px-4 py-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Tamaño del video
                  </span>
                  <span className="text-sm font-medium">
                    {formatFileSize(videoBlob.size)}
                  </span>
                </div>
                <div className="flex justify-between px-4 py-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Formato
                  </span>
                  <span className="text-sm font-medium">
                    {videoBlob.type || "video/webm"}
                  </span>
                </div>
              </div>

              {/* Analysis method selector */}
              <AnalysisMethodSelector
                selected={analysisMethod}
                onChange={setAnalysisMethod}
                disabled={analyzing}
              />

              {/* Analysis error */}
              {analysisError && (
                <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {analysisError}
                  </p>
                </div>
              )}

              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className={`w-full rounded-md px-4 py-3 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  analysisMethod === "on-device"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {analyzing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Analizando respiración...
                  </span>
                ) : analysisMethod === "on-device" ? (
                  "📱 Analizar en dispositivo"
                ) : (
                  "☁️ Analizar con Gemini"
                )}
              </button>

              {analyzing && analysisMethod === "cloud" && (
                <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                  El análisis puede tomar entre 15 y 60 segundos dependiendo de
                  la duración del video.
                </p>
              )}

              {!analyzing && (
                <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                  Revisa el video antes de enviarlo. Puedes reproducirlo usando
                  los controles del reproductor.
                </p>
              )}
            </div>
          )}

          {/* Back to instructions link */}
          {pageState === "recording" && (
            <button
              onClick={() => setPageState("instructions")}
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ← Ver instrucciones de nuevo
            </button>
          )}
        </div>
      )}

      {/* ROI Selection screen (on-device only) */}
      {pageState === "roi-selection" && videoBlob && (
        <div className="space-y-6">
          <ROISelector
            videoBlob={videoBlob}
            onROISelected={handleROISelected}
            onCancel={() => setPageState("preview")}
          />
        </div>
      )}

      {/* On-device analysis progress */}
      {pageState === "on-device-analyzing" && onDeviceProgress && (
        <OnDeviceProgress progress={onDeviceProgress} />
      )}
    </div>
  );
}

// --- Sub-components ---

function ConfidenceBadge({
  confidence,
  aiConfidence,
}: {
  confidence: "alta" | "media" | "baja";
  aiConfidence: "alta" | "media" | "baja";
}) {
  const colorClass =
    confidence === "alta"
      ? "text-green-600 dark:text-green-400"
      : confidence === "media"
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-red-600 dark:text-red-400";

  const bgClass =
    confidence === "alta"
      ? "bg-green-100 dark:bg-green-900/30"
      : confidence === "media"
        ? "bg-yellow-100 dark:bg-yellow-900/30"
        : "bg-red-100 dark:bg-red-900/30";

  const label =
    confidence === "alta" ? "Alta" : confidence === "media" ? "Media" : "Baja";

  return (
    <span className="flex items-center gap-2">
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass} ${bgClass}`}
      >
        <span
          className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
            confidence === "alta"
              ? "bg-green-500"
              : confidence === "media"
                ? "bg-yellow-500"
                : "bg-red-500"
          }`}
        />
        {label}
      </span>
      {confidence !== aiConfidence && (
        <span className="text-xs text-gray-400 dark:text-gray-500">
          (IA: {aiConfidence})
        </span>
      )}
    </span>
  );
}

function ManualComparisonCard({
  comparison,
}: {
  comparison: ManualComparison;
}) {
  const { manualRpm, aiRpm, deviation, withinThreshold, minutesAgo } =
    comparison;

  const timeLabel =
    minutesAgo < 60
      ? `hace ${minutesAgo} min`
      : `hace ${Math.round(minutesAgo / 60)}h`;

  return (
    <div
      className={`rounded-lg border p-4 ${
        withinThreshold
          ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
          : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold">
          {withinThreshold ? "✅" : "⚠️"} Comparación con medición manual
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <span className="block text-lg font-bold text-blue-600 dark:text-blue-400">
            {aiRpm}
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            IA (rpm)
          </span>
        </div>
        <div>
          <span className="block text-lg font-bold text-gray-600 dark:text-gray-300">
            {manualRpm}
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            Manual (rpm)
          </span>
        </div>
        <div>
          <span
            className={`block text-lg font-bold ${
              withinThreshold
                ? "text-green-600 dark:text-green-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            ±{deviation}
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            Diferencia
          </span>
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center">
        Medición manual {timeLabel} · Umbral aceptable: ≤3 rpm
      </p>
    </div>
  );
}

function HistoricalAccuracyCard({
  averageError,
  comparisonCount,
}: {
  averageError: number | null;
  comparisonCount: number;
}) {
  if (averageError === null) return null;

  const isGood = averageError <= 3;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Precisión histórica del análisis IA
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Basado en {comparisonCount}{" "}
            {comparisonCount === 1 ? "comparación" : "comparaciones"} con
            mediciones manuales
          </p>
        </div>
        <div className="text-right">
          <span
            className={`text-lg font-bold ${
              isGood
                ? "text-green-600 dark:text-green-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            ±{averageError} rpm
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            error promedio
          </span>
        </div>
      </div>
      {/* Progress bar showing how close to the 3rpm target */}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>0 rpm</span>
          <span>Objetivo: {"<"}3 rpm</span>
        </div>
        <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isGood ? "bg-green-500" : "bg-amber-500"
            }`}
            style={{ width: `${Math.min((averageError / 5) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
