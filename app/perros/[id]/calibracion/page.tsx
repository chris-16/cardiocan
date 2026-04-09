"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import type { Dog } from "@/lib/db/schema";

interface CalibrationRecordWithUser {
  id: string;
  dogId: string;
  userId: string;
  measurementId: string;
  aiBreathsPerMinute: number;
  finalBreathsPerMinute: number;
  deviation: number;
  action: "accepted" | "corrected";
  aiMethod: "cloud" | "on-device";
  aiConfidence: "alta" | "media" | "baja";
  correctionNotes: string | null;
  createdAt: string;
  userName: string;
}

interface CalibrationStats {
  totalRecords: number;
  acceptedCount: number;
  correctedCount: number;
  averageDeviation: number;
  averageCorrectionDeviation: number;
  acceptanceRate: number;
  trend: "improving" | "stable" | "degrading" | "insufficient";
}

const TREND_LABELS: Record<CalibrationStats["trend"], string> = {
  improving: "Mejorando",
  stable: "Estable",
  degrading: "Empeorando",
  insufficient: "Datos insuficientes",
};

const TREND_COLORS: Record<CalibrationStats["trend"], string> = {
  improving: "text-green-600 dark:text-green-400",
  stable: "text-blue-600 dark:text-blue-400",
  degrading: "text-red-600 dark:text-red-400",
  insufficient: "text-gray-500 dark:text-gray-400",
};

export default function CalibracionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [dog, setDog] = useState<Dog | null>(null);
  const [records, setRecords] = useState<CalibrationRecordWithUser[]>([]);
  const [stats, setStats] = useState<CalibrationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const [dogRes, calRes] = await Promise.all([
          fetch(`/api/dogs/${id}`),
          fetch(`/api/dogs/${id}/calibrations`),
        ]);

        const dogData = await dogRes.json();
        if (!dogRes.ok) {
          setError(dogData.error || "Error al cargar el perfil");
          return;
        }
        setDog(dogData.dog);

        if (calRes.ok) {
          const calData = await calRes.json();
          setRecords(calData.records ?? []);
          setStats(calData.stats ?? null);
        }
      } catch {
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  if (error || !dog) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error || "Perfil no encontrado"}
        </div>
        <Link
          href="/perros"
          className="mt-4 inline-block text-sm text-blue-600 hover:text-blue-500"
        >
          &larr; Volver a mis perros
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/perros/${id}`}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          &larr; Volver al perfil de {dog.name}
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-1">
        Calibración AI de {dog.name}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Historial de comparaciones AI vs correcciones manuales para mejora
        progresiva
      </p>

      {/* Stats summary */}
      {stats && stats.totalRecords > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <p className="text-3xl font-bold tabular-nums">
                {stats.totalRecords}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Calibraciones
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <p className="text-3xl font-bold tabular-nums text-green-600 dark:text-green-400">
                {stats.acceptanceRate}%
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Tasa de aceptación
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <p className="text-3xl font-bold tabular-nums">
                ±{stats.averageDeviation}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Desviación promedio (rpm)
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <p
                className={`text-lg font-bold ${TREND_COLORS[stats.trend]}`}
              >
                {stats.trend === "improving" && "↗️ "}
                {stats.trend === "stable" && "→ "}
                {stats.trend === "degrading" && "↘️ "}
                {TREND_LABELS[stats.trend]}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Tendencia
              </p>
            </div>
          </div>

          {/* Accepted vs Corrected breakdown */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Aceptados vs Corregidos
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {stats.acceptedCount} / {stats.correctedCount}
              </span>
            </div>
            <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex">
              {stats.acceptedCount > 0 && (
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{
                    width: `${(stats.acceptedCount / stats.totalRecords) * 100}%`,
                  }}
                />
              )}
              {stats.correctedCount > 0 && (
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{
                    width: `${(stats.correctedCount / stats.totalRecords) * 100}%`,
                  }}
                />
              )}
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                Aceptados ({stats.acceptedCount})
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                Corregidos ({stats.correctedCount})
              </span>
            </div>
            {stats.correctedCount > 0 && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Desviación promedio en correcciones: ±
                {stats.averageCorrectionDeviation} rpm
              </p>
            )}
          </div>

          {/* Calibration records list */}
          <h2 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">
            Historial de calibraciones
          </h2>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
            {records.map((record) => {
              const date = new Date(
                typeof record.createdAt === "number"
                  ? (record.createdAt as unknown as number) * 1000
                  : record.createdAt
              );
              const isAccepted = record.action === "accepted";

              return (
                <div key={record.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          isAccepted
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        }`}
                      >
                        {isAccepted ? "✅ Aceptado" : "✏️ Corregido"}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {record.aiMethod === "on-device" ? "📱" : "☁️"}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {date.toLocaleDateString("es-CL", {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      {date.toLocaleTimeString("es-CL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      AI: {record.aiBreathsPerMinute} rpm
                    </span>
                    {!isAccepted && (
                      <>
                        <span className="text-gray-400">→</span>
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          Corrección: {record.finalBreathsPerMinute} rpm
                        </span>
                        <span className="text-xs text-gray-500">
                          (±{record.deviation})
                        </span>
                      </>
                    )}
                  </div>

                  {record.correctionNotes && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 italic">
                      {record.correctionNotes}
                    </p>
                  )}

                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    por {record.userName} · Confianza AI:{" "}
                    {record.aiConfidence}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            Sin datos de calibración
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            Cuando analices videos con IA podrás aceptar o corregir los
            resultados. Esos datos aparecerán aquí para seguimiento de precisión.
          </p>
          <Link
            href={`/perros/${id}/video`}
            className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Analizar un video
          </Link>
        </div>
      )}
    </div>
  );
}
