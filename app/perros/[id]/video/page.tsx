"use client";

import { useState, useRef, use } from "react";
import Link from "next/link";
import VideoRecorder from "@/app/perros/components/video-recorder";
import type { ValidationResult, ManualComparison } from "@/lib/analysis-validation";

type PageState = "instructions" | "recording" | "preview";

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

  const videoBlobRef = useRef<Blob | null>(null);

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

  async function handleAnalyze() {
    if (!videoBlob) return;
    setAnalyzing(true);
    setAnalysisError(null);

    try {
      const formData = new FormData();
      formData.append("video", videoBlob, "respiracion.webm");

      const res = await fetch(`/api/dogs/${dogId}/analyze-video`, {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as AnalysisResponse & { error?: string };

      if (!res.ok) {
        throw new Error(data.error || "Error al analizar el video");
      }

      setResult(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error inesperado al analizar el video";
      setAnalysisError(message);
    } finally {
      setAnalyzing(false);
    }
  }

  function resetAll() {
    setResult(null);
    setVideoBlob(null);
    setAnalysisError(null);
    setPageState("instructions");
  }

  // --- Results screen ---
  if (result) {
    const { analysis, success, validation } = result;
    const rpm = analysis.breathsPerMinute;
    const isNormal = rpm > 0 && rpm <= 30;
    const isElevated = rpm > 30 && rpm <= 40;
    const isUrgent = rpm > 40;

    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="space-y-6">
          {success ? (
            <>
              {/* RPM result */}
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
                      rpm
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
                    confidence={validation?.overallConfidence ?? analysis.confidence}
                    aiConfidence={analysis.confidence}
                  />
                </div>
                {analysis.notes && (
                  <div className="px-4 py-3">
                    <span className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                      Observaciones
                    </span>
                    <span className="text-sm">{analysis.notes}</span>
                  </div>
                )}
              </div>

              {/* Validation: Manual comparison */}
              {validation?.manualComparison && (
                <ManualComparisonCard comparison={validation.manualComparison} />
              )}

              {/* Validation: Historical accuracy */}
              {validation && validation.comparisonCount > 0 && (
                <HistoricalAccuracyCard
                  averageError={validation.averageError}
                  comparisonCount={validation.comparisonCount}
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

              {/* Low confidence fallback (only if no validation warnings already cover it) */}
              {analysis.confidence === "baja" &&
                (!validation || validation.warnings.length === 0) && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4">
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      <strong>Nota:</strong> La confianza del análisis es baja.
                      Considera hacer una medición manual para confirmar el
                      resultado.
                    </p>
                  </div>
                )}

              {/* Scientific benchmark reference */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  <strong>Referencia científica:</strong> El análisis por video
                  se basa en tecnología con un RMSE de 1.1 rpm y correlación de
                  0.92 respecto a monitores aprobados por la FDA. El objetivo de
                  precisión es un error {"<"}3 rpm vs medición manual.
                </p>
              </div>

              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                La medición ha sido guardada automáticamente en el historial.
              </p>
            </>
          ) : (
            <>
              {/* Analysis failed to count breaths */}
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
                </ul>
              </div>
            </>
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
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
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
                className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {analyzing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Analizando respiración...
                  </span>
                ) : (
                  "Analizar respiración con IA"
                )}
              </button>

              {analyzing && (
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
