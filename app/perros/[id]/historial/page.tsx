"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import type { Dog, RespiratoryMeasurement } from "@/lib/db/schema";
import MeasurementChart from "@/app/perros/components/measurement-chart";
import { DEFAULT_RPM_THRESHOLD } from "@/app/perros/components/rpm-alert";

type MeasurementWithUser = RespiratoryMeasurement & { userName: string };

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
                    </p>
                  </div>
                  <span className="text-sm font-bold tabular-nums">
                    {m.breathsPerMinute} <span className="text-xs font-normal text-gray-500">rpm</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
