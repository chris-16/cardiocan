"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import type { Dog, RespiratoryMeasurement } from "@/lib/db/schema";
import MeasurementChart from "@/app/perros/components/measurement-chart";

type TimeRange = "7d" | "14d" | "30d" | "all";

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "7d": "7 días",
  "14d": "14 días",
  "30d": "30 días",
  all: "Todo",
};

function filterByTimeRange(
  measurements: RespiratoryMeasurement[],
  range: TimeRange
): RespiratoryMeasurement[] {
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
  const [measurements, setMeasurements] = useState<RespiratoryMeasurement[]>([]);
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
        <MeasurementChart measurements={filteredMeasurements} />
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-amber-500" style={{ borderTop: "2px dashed #f59e0b" }} />
          <span>30 rpm - Elevada</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-red-500" style={{ borderTop: "2px dashed #ef4444" }} />
          <span>40 rpm - Urgente</span>
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
    </div>
  );
}
