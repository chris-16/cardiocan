"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import type { Dog, RespiratoryMeasurement } from "@/lib/db/schema";
import MeasurementChart from "@/app/perros/components/measurement-chart";
import ShareHistoryButton from "@/app/perros/components/share-history-button";
import { DEFAULT_RPM_THRESHOLD } from "@/app/perros/components/rpm-alert";

type MeasurementWithUser = RespiratoryMeasurement & {
  userName: string;
  videoKey: string | null;
};

type TimeRange = "7d" | "14d" | "30d" | "all";

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "7d": "7 días",
  "14d": "14 días",
  "30d": "30 días",
  all: "Todo",
};

function filterByTimeRange(
  measurements: MeasurementWithUser[],
  range: TimeRange
): MeasurementWithUser[] {
  if (range === "all") return measurements;

  const days = range === "7d" ? 7 : range === "14d" ? 14 : 30;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  return measurements.filter((m) => {
    const ts = typeof m.createdAt === "number"
      ? m.createdAt * 1000
      : new Date(m.createdAt).getTime();
    return ts >= cutoff;
  });
}

export default function HistorialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [dog, setDog] = useState<Dog | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementWithUser[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoMeasurementId, setVideoMeasurementId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [dogRes, measRes] = await Promise.all([
          fetch(`/api/dogs/${id}`),
          fetch(`/api/dogs/${id}/measurements`),
        ]);

        const dogData = await dogRes.json();
        if (!dogRes.ok) {
          setError(dogData.error || "Error al cargar el perfil");
          return;
        }
        setDog(dogData.dog);

        if (measRes.ok) {
          const measData = await measRes.json();
          setMeasurements(measData.measurements ?? []);
        }
      } catch {
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  // Auto-refresh measurements every 30 seconds for shared access
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/dogs/${id}/measurements`);
        if (res.ok) {
          const data = await res.json();
          setMeasurements(data.measurements ?? []);
        }
      } catch {
        // Silently ignore refresh errors
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [id]);

  async function handlePlayVideo(measurementId: string) {
    setVideoLoading(true);
    setVideoMeasurementId(measurementId);
    try {
      const res = await fetch(`/api/dogs/${id}/measurements/${measurementId}/video`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al cargar el video");
      }
      const data = await res.json();
      setVideoUrl(data.url);
    } catch {
      setVideoUrl(null);
      setVideoMeasurementId(null);
    } finally {
      setVideoLoading(false);
    }
  }

  function closeVideoModal() {
    setVideoUrl(null);
    setVideoMeasurementId(null);
  }

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

  const filteredMeasurements = filterByTimeRange(measurements, timeRange);

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

      <h1 className="text-2xl font-bold mb-1">Historial de {dog.name}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Frecuencia respiratoria a lo largo del tiempo
      </p>

      {/* Time range selector */}
      <div className="flex gap-2 mb-6">
        {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              timeRange === range
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            {TIME_RANGE_LABELS[range]}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <MeasurementChart measurements={filteredMeasurements} rpmThreshold={dog.rpmThreshold ?? DEFAULT_RPM_THRESHOLD} />
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-amber-500" style={{ borderTop: "2px dashed #f59e0b" }} />
          <span>{dog.rpmThreshold ?? DEFAULT_RPM_THRESHOLD} rpm - Elevada</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-red-500" style={{ borderTop: "2px dashed #ef4444" }} />
          <span>{(dog.rpmThreshold ?? DEFAULT_RPM_THRESHOLD) + 10} rpm - Urgente</span>
        </div>
      </div>

      {/* Summary stats */}
      {filteredMeasurements.length > 0 && (
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
            <p className="text-2xl font-bold tabular-nums">
              {filteredMeasurements.length}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Mediciones</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
            <p className="text-2xl font-bold tabular-nums">
              {Math.round(
                filteredMeasurements.reduce((sum, m) => sum + m.breathsPerMinute, 0) /
                  filteredMeasurements.length
              )}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Promedio rpm</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
            <p className="text-2xl font-bold tabular-nums">
              {Math.max(...filteredMeasurements.map((m) => m.breathsPerMinute))}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Máximo rpm</p>
          </div>
        </div>
      )}

      {/* Contributors */}
      {filteredMeasurements.length > 0 && (() => {
        const contributors = filteredMeasurements.reduce<Record<string, number>>((acc, m) => {
          const name = m.userName || "Desconocido";
          acc[name] = (acc[name] || 0) + 1;
          return acc;
        }, {});
        const contributorEntries = Object.entries(contributors).sort((a, b) => b[1] - a[1]);
        if (contributorEntries.length > 1) {
          return (
            <div className="mt-4">
              <h3 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Mediciones por cuidador</h3>
              <div className="flex flex-wrap gap-2">
                {contributorEntries.map(([name, count]) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    {name}
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                      {count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* Video playback modal */}
      {videoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white dark:bg-gray-900 overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Video del análisis
              </h3>
              <button
                onClick={closeVideoModal}
                className="rounded-md p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            <div className="bg-black">
              <video
                src={videoUrl}
                controls
                autoPlay
                playsInline
                className="w-full aspect-video"
              />
            </div>
          </div>
        </div>
      )}

      {/* Measurement list with user attribution */}
      {filteredMeasurements.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">Detalle de mediciones</h3>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 max-h-80 overflow-y-auto">
            {filteredMeasurements.map((m) => {
              const date = new Date(
                typeof m.createdAt === "number"
                  ? m.createdAt * 1000
                  : m.createdAt
              );
              return (
                <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {date.toLocaleDateString("es-CL", {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      {date.toLocaleTimeString("es-CL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      por {m.userName}
                      {m.method === "ai" && (
                        <span className="ml-1.5 inline-flex items-center rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          AI
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.videoKey && (
                      <button
                        onClick={() => handlePlayVideo(m.id)}
                        disabled={videoLoading && videoMeasurementId === m.id}
                        className="rounded-md p-1.5 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
                        title="Ver video del análisis"
                      >
                        {videoLoading && videoMeasurementId === m.id ? (
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                          </svg>
                        )}
                      </button>
                    )}
                    <span className="text-sm font-bold tabular-nums">
                      {m.breathsPerMinute} <span className="text-xs font-normal text-gray-500">rpm</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Share history */}
      {dog && (
        <div className="mt-6">
          <ShareHistoryButton dogId={id} dogName={dog.name} />
        </div>
      )}
    </div>
  );
}
