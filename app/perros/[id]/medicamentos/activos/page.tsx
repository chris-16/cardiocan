"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import type { MedicationSchedule } from "@/lib/db/schema";

interface TodayLog {
  id: string;
  scheduledTime: string;
  administeredAt: string;
  status: string;
  userId: string;
  userName: string;
  notes: string | null;
}

interface ActiveMedication {
  id: string;
  dogId: string;
  userId: string;
  name: string;
  dose: string;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  schedules: MedicationSchedule[];
  todayLogs: TodayLog[];
  pendingCount: number;
  overdueCount: number;
}

interface FullLogEntry {
  id: string;
  medicationId: string;
  userId: string;
  userName: string;
  scheduledTime: string;
  administeredAt: string;
  status: string;
  notes: string | null;
}

const DAYS_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate();
  const month = date.toLocaleDateString("es-CL", { month: "short" });
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Justo ahora";
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return formatDateTime(dateStr);
}

function formatFrequency(schedules: MedicationSchedule[]): string {
  if (schedules.length === 0) return "Sin horario";

  const allDaily = schedules.every(
    (s) => s.daysOfWeek === "0,1,2,3,4,5,6"
  );

  if (allDaily) {
    if (schedules.length === 1) return `1 vez al día`;
    return `${schedules.length} veces al día`;
  }

  return `${schedules.length} horario${schedules.length > 1 ? "s" : ""} configurado${schedules.length > 1 ? "s" : ""}`;
}

export default function MedicamentosActivosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: dogId } = use(params);
  const [medications, setMedications] = useState<ActiveMedication[]>([]);
  const [dogName, setDogName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // History view state
  const [selectedMedId, setSelectedMedId] = useState<string | null>(null);
  const [fullLogs, setFullLogs] = useState<FullLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Log administration state
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [loggedId, setLoggedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [dogRes, medsRes] = await Promise.all([
        fetch(`/api/dogs/${dogId}`),
        fetch(`/api/dogs/${dogId}/medications/active`),
      ]);

      if (dogRes.ok) {
        const dogData = await dogRes.json();
        setDogName(dogData.dog.name);
      }

      if (medsRes.ok) {
        const medsData = await medsRes.json();
        setMedications(medsData.medications ?? []);
      } else {
        setError("Error al cargar medicamentos");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [dogId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function fetchFullHistory(medicationId: string) {
    setLoadingLogs(true);
    setSelectedMedId(medicationId);
    try {
      const res = await fetch(
        `/api/dogs/${dogId}/medications/${medicationId}/logs`
      );
      if (res.ok) {
        const data = await res.json();
        setFullLogs(data.logs ?? []);
      } else {
        setError("Error al cargar historial");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoadingLogs(false);
    }
  }

  async function handleLogAdministration(medId: string) {
    setLoggingId(medId);
    try {
      const now = new Date();
      const scheduledTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      const res = await fetch(`/api/dogs/${dogId}/medications/${medId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledTime,
          status: "administered",
        }),
      });

      if (res.ok) {
        setLoggedId(medId);
        setTimeout(() => setLoggedId(null), 2000);
        await fetchData();
        // Refresh history if currently viewing this medication
        if (selectedMedId === medId) {
          await fetchFullHistory(medId);
        }
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoggingId(null);
    }
  }

  function getStatusBadge(med: ActiveMedication) {
    if (med.overdueCount > 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          {med.overdueCount} atrasada{med.overdueCount > 1 ? "s" : ""}
        </span>
      );
    }
    if (med.pendingCount > 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          {med.pendingCount} pendiente{med.pendingCount > 1 ? "s" : ""}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Al día
      </span>
    );
  }

  const selectedMed = medications.find((m) => m.id === selectedMedId);

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  // Full history view for a selected medication
  if (selectedMed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => {
              setSelectedMedId(null);
              setFullLogs([]);
            }}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            &larr; Volver a medicamentos activos
          </button>
        </div>

        {/* Medication header */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{selectedMed.name}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {selectedMed.dose}
              </p>
            </div>
            {getStatusBadge(selectedMed)}
          </div>
          {selectedMed.notes && (
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
              {selectedMed.notes}
            </p>
          )}

          {/* Schedules */}
          <div className="mt-4 flex flex-wrap gap-2">
            {selectedMed.schedules.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              >
                {formatTime(s.time)}
                {s.daysOfWeek !== "0,1,2,3,4,5,6" && (
                  <span className="ml-1 opacity-70">
                    ({s.daysOfWeek
                      .split(",")
                      .map((d) => DAYS_LABELS[parseInt(d, 10)])
                      .join(", ")})
                  </span>
                )}
              </span>
            ))}
          </div>

          {/* Quick log button */}
          <div className="mt-4">
            <button
              onClick={() => handleLogAdministration(selectedMed.id)}
              disabled={
                loggingId === selectedMed.id || loggedId === selectedMed.id
              }
              className={`rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-80 ${
                loggedId === selectedMed.id
                  ? "bg-green-500"
                  : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {loggingId === selectedMed.id
                ? "Registrando..."
                : loggedId === selectedMed.id
                  ? "Registrado"
                  : "Registrar administración"}
            </button>
          </div>
        </div>

        {/* Today's doses section */}
        {selectedMed.todayLogs.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Dosis de hoy
            </h2>
            <div className="space-y-2">
              {selectedMed.todayLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 rounded-md bg-green-50 px-3 py-2 dark:bg-green-900/10"
                >
                  <div className="h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {log.userName}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatRelativeDate(log.administeredAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Full history */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Historial completo de administración
          </h2>

          {loadingLogs ? (
            <p className="text-xs text-gray-400">Cargando historial...</p>
          ) : fullLogs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center dark:border-gray-600">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sin registros de administración
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {fullLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/50"
                >
                  <div
                    className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${
                      log.status === "administered"
                        ? "bg-green-500"
                        : "bg-yellow-500"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                        {log.userName}
                      </span>
                      <span
                        className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0"
                        title={formatDateTime(log.administeredAt)}
                      >
                        {formatRelativeDate(log.administeredAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`text-xs ${
                          log.status === "administered"
                            ? "text-green-600 dark:text-green-400"
                            : "text-yellow-600 dark:text-yellow-400"
                        }`}
                      >
                        {log.status === "administered"
                          ? "Administrado"
                          : "Omitido"}
                      </span>
                      {log.scheduledTime !== "manual" && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          (programado: {formatTime(log.scheduledTime)})
                        </span>
                      )}
                    </div>
                    {log.notes && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {log.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main active medications list view
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/perros/${dogId}`}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          &larr; Volver a {dogName || "perfil"}
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          Medicamentos activos{dogName ? ` de ${dogName}` : ""}
        </h1>
        <Link
          href={`/perros/${dogId}/medicamentos`}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          Gestionar
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Summary bar */}
      {medications.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {medications.length}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Activos</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {medications.reduce((sum, m) => sum + m.pendingCount, 0)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Pendientes
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {medications.reduce((sum, m) => sum + m.overdueCount, 0)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Atrasadas
            </p>
          </div>
        </div>
      )}

      {/* Medication cards */}
      {medications.length > 0 ? (
        <div className="space-y-4">
          {medications.map((med) => (
            <div
              key={med.id}
              className={`rounded-lg border p-4 transition-colors ${
                med.overdueCount > 0
                  ? "border-red-200 dark:border-red-800"
                  : med.pendingCount > 0
                    ? "border-amber-200 dark:border-amber-800"
                    : "border-gray-200 dark:border-gray-700"
              }`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    {med.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {med.dose}
                  </p>
                </div>
                {getStatusBadge(med)}
              </div>

              {/* Frequency */}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {formatFrequency(med.schedules)}
              </p>

              {/* Schedule pills */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {med.schedules.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  >
                    {formatTime(s.time)}
                    {s.daysOfWeek !== "0,1,2,3,4,5,6" && (
                      <span className="ml-1 opacity-70">
                        ({s.daysOfWeek
                          .split(",")
                          .map((d) => DAYS_LABELS[parseInt(d, 10)])
                          .join(", ")})
                      </span>
                    )}
                  </span>
                ))}
              </div>

              {/* Today's log preview */}
              {med.todayLogs.length > 0 && (
                <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                    Hoy — {med.todayLogs.length} dosis registrada
                    {med.todayLogs.length > 1 ? "s" : ""}:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {med.todayLogs.slice(0, 3).map((log) => (
                      <span
                        key={log.id}
                        className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        {log.userName} — {formatRelativeDate(log.administeredAt)}
                      </span>
                    ))}
                    {med.todayLogs.length > 3 && (
                      <span className="text-xs text-gray-400">
                        +{med.todayLogs.length - 3} más
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleLogAdministration(med.id)}
                  disabled={loggingId === med.id || loggedId === med.id}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-80 ${
                    loggedId === med.id
                      ? "bg-green-500"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {loggingId === med.id
                    ? "Registrando..."
                    : loggedId === med.id
                      ? "Registrado"
                      : "Administrado"}
                </button>

                <button
                  onClick={() => fetchFullHistory(med.id)}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  Ver historial completo
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
          <p className="text-gray-500 dark:text-gray-400">
            No hay medicamentos activos
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Los medicamentos activos aparecerán aquí
          </p>
          <Link
            href={`/perros/${dogId}/medicamentos`}
            className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Agregar medicamento
          </Link>
        </div>
      )}
    </div>
  );
}
