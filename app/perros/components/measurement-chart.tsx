"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { RespiratoryMeasurement } from "@/lib/db/schema";

interface ChartDataPoint {
  date: string;
  timestamp: number;
  rpm: number;
  breathCount: number;
  durationSeconds: number;
  notes: string | null;
}

interface MeasurementChartProps {
  measurements: RespiratoryMeasurement[];
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
  });
}

function formatTooltipDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: ChartDataPoint;
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 shadow-md dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {formatTooltipDate(data.timestamp)}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums">
        {data.rpm} <span className="text-sm font-normal text-gray-500">rpm</span>
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        {data.breathCount} resp en {data.durationSeconds}s
      </p>
      {data.notes && (
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 italic max-w-48">
          {data.notes}
        </p>
      )}
    </div>
  );
}

export default function MeasurementChart({ measurements }: MeasurementChartProps) {
  if (measurements.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-gray-200 py-12 dark:border-gray-700">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No hay mediciones para mostrar
        </p>
      </div>
    );
  }

  // Sort chronologically (oldest first) for the chart
  const sortedMeasurements = [...measurements].sort((a, b) => {
    const aTime = typeof a.createdAt === "number" ? a.createdAt : new Date(a.createdAt).getTime() / 1000;
    const bTime = typeof b.createdAt === "number" ? b.createdAt : new Date(b.createdAt).getTime() / 1000;
    return aTime - bTime;
  });

  const data: ChartDataPoint[] = sortedMeasurements.map((m) => {
    const timestamp = typeof m.createdAt === "number"
      ? m.createdAt
      : Math.floor(new Date(m.createdAt).getTime() / 1000);
    return {
      date: formatDate(timestamp),
      timestamp,
      rpm: m.breathsPerMinute,
      breathCount: m.breathCount,
      durationSeconds: m.durationSeconds,
      notes: m.notes ?? null,
    };
  });

  const maxRpm = Math.max(...data.map((d) => d.rpm), 45);
  const yMax = Math.ceil(maxRpm / 5) * 5 + 5;

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            className="text-gray-500"
          />
          <YAxis
            domain={[0, yMax]}
            tick={{ fontSize: 12 }}
            className="text-gray-500"
            label={{
              value: "rpm",
              angle: -90,
              position: "insideLeft",
              offset: 20,
              style: { fontSize: 12, fill: "#9ca3af" },
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={30}
            stroke="#f59e0b"
            strokeDasharray="6 3"
            label={{
              value: "30 rpm",
              position: "right",
              style: { fontSize: 11, fill: "#f59e0b" },
            }}
          />
          <ReferenceLine
            y={40}
            stroke="#ef4444"
            strokeDasharray="6 3"
            label={{
              value: "40 rpm",
              position: "right",
              style: { fontSize: 11, fill: "#ef4444" },
            }}
          />
          <Line
            type="monotone"
            dataKey="rpm"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{
              r: 4,
              fill: "#3b82f6",
              strokeWidth: 0,
            }}
            activeDot={{
              r: 6,
              fill: "#2563eb",
              strokeWidth: 0,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
