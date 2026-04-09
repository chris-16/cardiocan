"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import type { Medication, MedicationSchedule } from "@/lib/db/schema";
import PushNotificationToggle from "@/app/perros/components/push-notification-toggle";

type MedicationWithSchedules = Medication & { schedules: MedicationSchedule[] };

interface MedicationLogEntry {
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
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${month}, ${hours}:${minutes}`;
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

export default function MedicamentosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: dogId } = use(params);
  const [medications, setMedications] = useState<MedicationWithSchedules[]>([]);
  const [role, setRole] = useState<"owner" | "caretaker">("owner");
  const [dogName, setDogName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDose, setFormDose] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formSchedules, setFormSchedules] = useState<
    Array<{ time: string; daysOfWeek: string }>
  >([{ time: "08:00", daysOfWeek: "0,1,2,3,4,5,6" }]);
  const [saving, setSaving] = useState(false);

  // Log state
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [loggedId, setLoggedId] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logsMap, setLogsMap] = useState<
    Record<string, MedicationLogEntry[]>
  >({});
  const [loadingLogs, setLoadingLogs] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dogId]);

  async function fetchData() {
    try {
      const [dogRes, medsRes] = await Promise.all([
        fetch(`/api/dogs/${dogId}`),
        fetch(`/api/dogs/${dogId}/medications`),
      ]);

      if (dogRes.ok) {
        const dogData = await dogRes.json();
        setDogName(dogData.dog.name);
        if (dogData.role) setRole(dogData.role);
      }

      if (medsRes.ok) {
        const medsData = await medsRes.json();
        setMedications(medsData.medications ?? []);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  async function fetchLogs(medicationId: string) {
    setLoadingLogs(medicationId);
    try {
      const res = await fetch(
        `/api/dogs/${dogId}/medications/${medicationId}/logs`
      );
      if (res.ok) {
        const data = await res.json();
        setLogsMap((prev) => ({ ...prev, [medicationId]: data.logs }));
      }
    } catch {
      setError("Error al cargar historial");
    } finally {
      setLoadingLogs(null);
    }
  }

  function toggleLogs(medicationId: string) {
    if (expandedLogId === medicationId) {
      setExpandedLogId(null);
    } else {
      setExpandedLogId(medicationId);
      // Fetch logs if not cached or to refresh
      fetchLogs(medicationId);
    }
  }

  function resetForm() {
    setFormName("");
    setFormDose("");
    setFormNotes("");
    setFormSchedules([{ time: "08:00", daysOfWeek: "0,1,2,3,4,5,6" }]);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(med: MedicationWithSchedules) {
    setFormName(med.name);
    setFormDose(med.dose);
    setFormNotes(med.notes || "");
    setFormSchedules(
      med.schedules.map((s) => ({ time: s.time, daysOfWeek: s.daysOfWeek }))
    );
    setEditingId(med.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        name: formName,
        dose: formDose,
        notes: formNotes || undefined,
        schedules: formSchedules,
      };

      let res: Response;
      if (editingId) {
        res = await fetch(`/api/dogs/${dogId}/medications/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/dogs/${dogId}/medications`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al guardar");
        return;
      }

      resetForm();
      await fetchData();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(medId: string) {
    if (!confirm("¿Eliminar este medicamento y todos sus horarios?")) return;

    try {
      const res = await fetch(`/api/dogs/${dogId}/medications/${medId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchData();
      }
    } catch {
      setError("Error de conexión");
    }
  }

  async function handleToggleActive(med: MedicationWithSchedules) {
    try {
      await fetch(`/api/dogs/${dogId}/medications/${med.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !med.active }),
      });
      await fetchData();
    } catch {
      setError("Error de conexión");
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
        // Show success feedback
        setLoggedId(medId);
        setTimeout(() => setLoggedId(null), 2000);

        // Refresh logs if they're currently visible
        if (expandedLogId === medId) {
          await fetchLogs(medId);
        }
        await fetchData();
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoggingId(null);
    }
  }

  function addSchedule() {
    setFormSchedules([
      ...formSchedules,
      { time: "12:00", daysOfWeek: "0,1,2,3,4,5,6" },
    ]);
  }

  function removeSchedule(index: number) {
    if (formSchedules.length <= 1) return;
    setFormSchedules(formSchedules.filter((_, i) => i !== index));
  }

  function updateScheduleTime(index: number, time: string) {
    const updated = [...formSchedules];
    updated[index] = { ...updated[index], time };
    setFormSchedules(updated);
  }

  function toggleScheduleDay(index: number, day: number) {
    const updated = [...formSchedules];
    const currentDays = updated[index].daysOfWeek.split(",").map(Number);
    const newDays = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day].sort();

    if (newDays.length === 0) return; // Must have at least one day
    updated[index] = { ...updated[index], daysOfWeek: newDays.join(",") };
    setFormSchedules(updated);
  }

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
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
          &larr; Volver a {dogName || "perfil"}
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">
        Medicamentos {dogName ? `de ${dogName}` : ""}
      </h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Push Notification Toggle */}
      <div className="mb-6">
        <PushNotificationToggle />
      </div>

      {/* Medication list */}
      {medications.length > 0 && (
        <div className="space-y-4 mb-6">
          {medications.map((med) => (
            <div
              key={med.id}
              className={`rounded-lg border p-4 ${
                med.active
                  ? "border-gray-200 dark:border-gray-700"
                  : "border-gray-100 dark:border-gray-800 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{med.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {med.dose}
                  </p>
                  {med.notes && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {med.notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!med.active && (
                    <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                      Pausado
                    </span>
                  )}
                </div>
              </div>

              {/* Schedules */}
              <div className="mt-3 flex flex-wrap gap-2">
                {med.schedules.map((s) => (
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

              {/* Actions */}
              <div className="mt-3 flex flex-wrap gap-2">
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
                  onClick={() => toggleLogs(med.id)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    expandedLogId === med.id
                      ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                  }`}
                >
                  Historial
                </button>

                {role === "owner" && (
                  <>
                    <button
                      onClick={() => startEdit(med)}
                      className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleToggleActive(med)}
                      className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                    >
                      {med.active ? "Pausar" : "Activar"}
                    </button>
                    <button
                      onClick={() => handleDelete(med.id)}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      Eliminar
                    </button>
                  </>
                )}
              </div>

              {/* Administration Log History */}
              {expandedLogId === med.id && (
                <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Historial de administración
                  </h4>

                  {loadingLogs === med.id ? (
                    <p className="text-xs text-gray-400">Cargando historial...</p>
                  ) : !logsMap[med.id]?.length ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Sin registros aún
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {logsMap[med.id].map((log) => (
                        <div
                          key={log.id}
                          className="flex items-start gap-3 rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/50"
                        >
                          <div
                            className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${
                              log.status === "administered"
                                ? "bg-green-500"
                                : "bg-yellow-500"
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
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
                              <span className="text-xs text-gray-500 dark:text-gray-400">
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
              )}
            </div>
          ))}
        </div>
      )}

      {medications.length === 0 && !showForm && (
        <div className="mb-6 rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
          <p className="text-gray-500 dark:text-gray-400">
            No hay medicamentos registrados
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Agrega medicamentos para recibir recordatorios
          </p>
        </div>
      )}

      {/* Add / Edit Form */}
      {role === "owner" && (
        <>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-center text-white hover:bg-blue-700 transition-colors font-medium"
            >
              + Agregar medicamento
            </button>
          )}

          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
            >
              <h2 className="text-lg font-semibold mb-4">
                {editingId ? "Editar medicamento" : "Nuevo medicamento"}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Nombre del medicamento *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                    placeholder="Ej: Furosemida"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Dosis *
                  </label>
                  <input
                    type="text"
                    value={formDose}
                    onChange={(e) => setFormDose(e.target.value)}
                    required
                    placeholder="Ej: 1 comprimido de 40mg"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Notas (opcional)
                  </label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Ej: Dar con comida"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                  />
                </div>

                {/* Schedules */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Horarios *
                  </label>
                  <div className="space-y-3">
                    {formSchedules.map((schedule, index) => (
                      <div
                        key={index}
                        className="rounded-md border border-gray-200 p-3 dark:border-gray-600"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="time"
                            value={schedule.time}
                            onChange={(e) =>
                              updateScheduleTime(index, e.target.value)
                            }
                            required
                            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
                          />
                          {formSchedules.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeSchedule(index)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Quitar
                            </button>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {DAYS_LABELS.map((label, day) => {
                            const isActive = schedule.daysOfWeek
                              .split(",")
                              .map(Number)
                              .includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => toggleScheduleDay(index, day)}
                                className={`rounded px-2 py-1 text-xs font-medium ${
                                  isActive
                                    ? "bg-blue-600 text-white"
                                    : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addSchedule}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-500"
                  >
                    + Agregar horario
                  </button>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving
                    ? "Guardando..."
                    : editingId
                      ? "Guardar cambios"
                      : "Crear medicamento"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
