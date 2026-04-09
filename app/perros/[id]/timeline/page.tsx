"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import type { Dog } from "@/lib/db/schema";
import type { TimelineEvent, TimelineEventType } from "@/app/api/dogs/[id]/timeline/route";

type TimeRange = "7d" | "14d" | "30d" | "all";

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "7d": "7 días",
  "14d": "14 días",
  "30d": "30 días",
  all: "Todo",
};

const EVENT_TYPE_LABELS: Record<TimelineEventType, string> = {
  measurement: "Mediciones",
  medication: "Medicación",
  note: "Notas",
};

const EVENT_TYPE_COLORS: Record<TimelineEventType, string> = {
  measurement: "bg-blue-500",
  medication: "bg-green-500",
  note: "bg-amber-500",
};

const EVENT_TYPE_BADGE_STYLES: Record<TimelineEventType, string> = {
  measurement:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  medication:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  note: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

function MeasurementIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4 text-white"
    >
      <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.061l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 001.06 1.06l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06l-1.06-1.06a.75.75 0 10-1.061 1.06l1.06 1.06z" />
    </svg>
  );
}

function MedicationIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4 text-white"
    >
      <path
        fillRule="evenodd"
        d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4 text-white"
    >
      <path
        fillRule="evenodd"
        d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function EventIcon({ type }: { type: TimelineEventType }) {
  switch (type) {
    case "measurement":
      return <MeasurementIcon />;
    case "medication":
      return <MedicationIcon />;
    case "note":
      return <NoteIcon />;
  }
}

function getDateRangeParams(range: TimeRange): string {
  if (range === "all") return "";
  const days = range === "7d" ? 7 : range === "14d" ? 14 : 30;
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return `?from=${from.toISOString()}`;
}

function formatEventDate(timestamp: number | Date | string): Date {
  if (typeof timestamp === "number") {
    // Unix timestamps from drizzle may be in seconds
    return new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
  }
  return new Date(timestamp);
}

function groupEventsByDate(
  events: TimelineEvent[]
): Map<string, TimelineEvent[]> {
  const groups = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const date = formatEventDate(event.timestamp);
    const key = date.toLocaleDateString("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const existing = groups.get(key) ?? [];
    existing.push(event);
    groups.set(key, existing);
  }
  return groups;
}

function EventCard({ event }: { event: TimelineEvent }) {
  const date = formatEventDate(event.timestamp);
  const timeStr = date.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="relative flex gap-3 pb-6 last:pb-0">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${EVENT_TYPE_COLORS[event.type]}`}
        >
          <EventIcon type={event.type} />
        </div>
        <div className="w-0.5 flex-1 bg-gray-200 dark:bg-gray-700" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${EVENT_TYPE_BADGE_STYLES[event.type]}`}
          >
            {EVENT_TYPE_LABELS[event.type]}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {timeStr}
          </span>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <EventContent event={event} />
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            por {event.userName}
          </p>
        </div>
      </div>
    </div>
  );
}

interface MeasurementData {
  breathsPerMinute: number;
  breathCount: number;
  durationSeconds: number;
  method: string;
  aiConfidence: string | null;
  notes: string | null;
}

interface MedicationData {
  medicationName: string;
  dose: string;
  status: string;
  scheduledTime: string;
  notes: string | null;
}

interface NoteData {
  measurementId: string;
  breathsPerMinute: number;
  noteText: string;
}

function MeasurementContent({ data }: { data: MeasurementData }) {
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold tabular-nums">
          {data.breathsPerMinute}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">rpm</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
        {data.breathCount} resp en {data.durationSeconds}s
        {data.method === "ai" && (
          <span className="ml-1.5 inline-flex items-center rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            AI
            {data.aiConfidence && ` · ${data.aiConfidence}`}
          </span>
        )}
      </p>
      {data.notes && (
        <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300 italic">
          &ldquo;{data.notes}&rdquo;
        </p>
      )}
    </div>
  );
}

function MedicationContent({ data }: { data: MedicationData }) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
        {data.medicationName}
        <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400">
          {data.dose}
        </span>
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
        Programada: {data.scheduledTime}h ·{" "}
        {data.status === "administered" ? (
          <span className="text-green-600 dark:text-green-400">
            Administrado
          </span>
        ) : (
          <span className="text-red-600 dark:text-red-400">Omitido</span>
        )}
      </p>
      {data.notes && (
        <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300 italic">
          &ldquo;{data.notes}&rdquo;
        </p>
      )}
    </div>
  );
}

function NoteContent({ data }: { data: NoteData }) {
  return (
    <div>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {data.noteText}
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
        En medición de {data.breathsPerMinute} rpm
      </p>
    </div>
  );
}

function EventContent({ event }: { event: TimelineEvent }) {
  switch (event.type) {
    case "measurement":
      return <MeasurementContent data={event.data as MeasurementData} />;
    case "medication":
      return <MedicationContent data={event.data as MedicationData} />;
    case "note":
      return <NoteContent data={event.data as NoteData} />;
    default:
      return null;
  }
}

export default function TimelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [dog, setDog] = useState<Dog | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [activeFilters, setActiveFilters] = useState<Set<TimelineEventType>>(
    new Set(["measurement", "medication", "note"])
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const dateParams = getDateRangeParams(timeRange);
        const [dogRes, timelineRes] = await Promise.all([
          fetch(`/api/dogs/${id}`),
          fetch(`/api/dogs/${id}/timeline${dateParams}`),
        ]);

        const dogData = await dogRes.json();
        if (!dogRes.ok) {
          setError(dogData.error || "Error al cargar el perfil");
          return;
        }
        setDog(dogData.dog);

        if (timelineRes.ok) {
          const timelineData = await timelineRes.json();
          setEvents(timelineData.events ?? []);
        }
      } catch {
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id, timeRange]);

  function toggleFilter(type: TimelineEventType) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        // Don't allow removing all filters
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
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

  const filteredEvents = events.filter((e) => activeFilters.has(e.type));
  const groupedEvents = groupEventsByDate(filteredEvents);

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

      <h1 className="text-2xl font-bold mb-1">Timeline de {dog.name}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Vista cronológica de mediciones, medicación y notas
      </p>

      {/* Time range selector */}
      <div className="flex gap-2 mb-4">
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

      {/* Event type filters */}
      <div className="flex gap-2 mb-6">
        {(
          Object.keys(EVENT_TYPE_LABELS) as TimelineEventType[]
        ).map((type) => (
          <button
            key={type}
            onClick={() => toggleFilter(type)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              activeFilters.has(type)
                ? EVENT_TYPE_BADGE_STYLES[type]
                : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
            }`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                activeFilters.has(type)
                  ? EVENT_TYPE_COLORS[type]
                  : "bg-gray-300 dark:bg-gray-600"
              }`}
            />
            {EVENT_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      {/* Summary counts */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
          <p className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
            {events.filter((e) => e.type === "measurement").length}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Mediciones
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
          <p className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
            {events.filter((e) => e.type === "medication").length}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Medicación
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
          <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {events.filter((e) => e.type === "note").length}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Notas</p>
        </div>
      </div>

      {/* Timeline */}
      {filteredEvents.length === 0 ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No hay eventos en el período seleccionado
          </p>
        </div>
      ) : (
        <div>
          {Array.from(groupedEvents.entries()).map(
            ([dateLabel, dayEvents]) => (
              <div key={dateLabel} className="mb-6">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {dateLabel}
                </h3>
                <div>
                  {dayEvents.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
