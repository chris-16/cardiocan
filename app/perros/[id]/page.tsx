"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Dog, RespiratoryMeasurement } from "@/lib/db/schema";

type MeasurementWithUser = RespiratoryMeasurement & { userName: string };
import PhotoUpload from "@/app/perros/components/photo-upload";
import RpmAlert, { getRpmAlertLevel, DEFAULT_RPM_THRESHOLD } from "@/app/perros/components/rpm-alert";
import MeasurementNotes from "@/app/perros/components/measurement-notes";
import DogShares from "@/app/perros/components/dog-shares";
import ExportPdfButton from "@/app/perros/components/export-pdf-button";
import ShareHistoryButton from "@/app/perros/components/share-history-button";

function formatWeight(weightGrams: number | null): string {
  if (!weightGrams) return "—";
  return `${(weightGrams / 1000).toFixed(1)} kg`;
}

function calculateAge(birthDate: string | null): string {
  if (!birthDate) return "—";
  const birth = new Date(birthDate);
  const now = new Date();
  const years = now.getFullYear() - birth.getFullYear();
  const months = now.getMonth() - birth.getMonth();
  const adjustedMonths = months < 0 ? months + 12 : months;
  const adjustedYears = months < 0 ? years - 1 : years;

  if (adjustedYears === 0) return `${adjustedMonths} meses`;
  if (adjustedMonths === 0) return `${adjustedYears} años`;
  return `${adjustedYears} años, ${adjustedMonths} meses`;
}

export default function DogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [dog, setDog] = useState<Dog | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementWithUser[]>([]);
  const [role, setRole] = useState<"owner" | "caretaker">("owner");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

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
        if (dogData.role) setRole(dogData.role);

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

  async function handleDelete() {
    if (!confirm("¿Estás seguro de que quieres eliminar este perfil?")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/dogs/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al eliminar");
        return;
      }
      router.push("/perros");
    } catch {
      setError("Error de conexión");
    } finally {
      setDeleting(false);
    }
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

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6">
        <Link
          href="/perros"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          &larr; Volver a mis perros
        </Link>
      </div>

      <div className="space-y-6">
        {/* Photo section */}
        <PhotoUpload
          dogId={dog.id}
          currentPhotoUrl={dog.photoUrl}
          onPhotoUpdated={(url) => setDog({ ...dog, photoUrl: url })}
          readOnly={role !== "owner"}
        />

        {/* Dog info */}
        <div className="text-center">
          <h1 className="text-2xl font-bold">{dog.name}</h1>
          {dog.cardiacCondition && (
            <span className="mt-1 inline-block rounded-full bg-orange-100 px-3 py-0.5 text-sm text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
              {dog.cardiacCondition}
            </span>
          )}
        </div>

        {/* Details */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
          <div className="flex justify-between px-4 py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Raza
            </span>
            <span className="text-sm font-medium">{dog.breed || "—"}</span>
          </div>
          <div className="flex justify-between px-4 py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Peso
            </span>
            <span className="text-sm font-medium">
              {formatWeight(dog.weight)}
            </span>
          </div>
          <div className="flex justify-between px-4 py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Edad
            </span>
            <span className="text-sm font-medium">
              {calculateAge(dog.birthDate)}
            </span>
          </div>
          <div className="flex justify-between px-4 py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Condición cardíaca
            </span>
            <span className="text-sm font-medium">
              {dog.cardiacCondition || "—"}
            </span>
          </div>
          <div className="flex justify-between px-4 py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Umbral de alerta
            </span>
            <span className="text-sm font-medium">
              {dog.rpmThreshold ?? DEFAULT_RPM_THRESHOLD} rpm
            </span>
          </div>
        </div>

        {/* Measurement CTA */}
        <Link
          href={`/perros/${dog.id}/medicion`}
          className="block w-full rounded-lg bg-blue-600 px-4 py-4 text-center text-white hover:bg-blue-700 transition-colors"
        >
          <span className="text-lg font-semibold">Medir frecuencia respiratoria</span>
          <span className="block text-sm opacity-80 mt-0.5">
            Contador manual con timer
          </span>
        </Link>

        {/* Video recording CTA */}
        <Link
          href={`/perros/${dog.id}/video`}
          className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-800"
        >
          <div>
            <span className="text-sm font-semibold">📹 Análisis por video</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Grabar video para medición automática
            </span>
          </div>
          <span className="text-gray-400">&rarr;</span>
        </Link>

        {/* Active medications link */}
        <Link
          href={`/perros/${dog.id}/medicamentos/activos`}
          className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-800"
        >
          <div>
            <span className="text-sm font-semibold">💊 Medicamentos activos</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Dosis pendientes, atrasadas e historial
            </span>
          </div>
          <span className="text-gray-400">&rarr;</span>
        </Link>

        {/* Medications management link */}
        <Link
          href={`/perros/${dog.id}/medicamentos`}
          className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-800"
        >
          <div>
            <span className="text-sm font-semibold">⚙️ Gestionar medicamentos</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Agregar, editar y configurar medicación
            </span>
          </div>
          <span className="text-gray-400">&rarr;</span>
        </Link>

        {/* Latest measurement alert */}
        {measurements.length > 0 && (
          <RpmAlert rpm={measurements[0].breathsPerMinute} threshold={dog.rpmThreshold ?? DEFAULT_RPM_THRESHOLD} />
        )}

        {/* Chart link */}
        {measurements.length > 0 && (
          <Link
            href={`/perros/${dog.id}/historial`}
            className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <div>
              <span className="text-sm font-semibold">Ver gráfico temporal</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                Historial completo con líneas de referencia
              </span>
            </div>
            <span className="text-gray-400">&rarr;</span>
          </Link>
        )}

        {/* Calibration history link */}
        <Link
          href={`/perros/${dog.id}/calibracion`}
          className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-800"
        >
          <div>
            <span className="text-sm font-semibold">📊 Calibración AI</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Historial de precisión AI vs correcciones manuales
            </span>
          </div>
          <span className="text-gray-400">&rarr;</span>
        </Link>

        {/* Export PDF */}
        <ExportPdfButton dogId={dog.id} dogName={dog.name} />

        {/* Share history via email/WhatsApp */}
        <ShareHistoryButton dogId={dog.id} dogName={dog.name} />

        {/* Measurement history */}
        {measurements.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Historial de mediciones</h2>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
              {measurements.slice(0, 10).map((m) => {
                const date = new Date(
                  typeof m.createdAt === "number"
                    ? m.createdAt * 1000
                    : m.createdAt
                );
                const alertLevel = getRpmAlertLevel(m.breathsPerMinute, dog.rpmThreshold ?? DEFAULT_RPM_THRESHOLD);
                const rpmColorClass =
                  alertLevel === "urgent"
                    ? "text-red-600 dark:text-red-400"
                    : alertLevel === "elevated"
                      ? "text-orange-600 dark:text-orange-400"
                      : "text-green-600 dark:text-green-400";
                return (
                  <div key={m.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {date.toLocaleDateString("es-CL", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}{" "}
                          {date.toLocaleTimeString("es-CL", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {m.breathCount} resp en {m.durationSeconds}s
                          {m.userName && (
                            <span className="ml-1.5 text-gray-400 dark:text-gray-500">
                              · por {m.userName}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right flex items-center gap-1.5">
                        {alertLevel === "urgent" && (
                          <span className="text-xs" aria-label="Alerta urgente">🚨</span>
                        )}
                        {alertLevel === "elevated" && (
                          <span className="text-xs" aria-label="Frecuencia elevada">⚠️</span>
                        )}
                        <span
                          className={`text-lg font-bold tabular-nums ${rpmColorClass}`}
                        >
                          {m.breathsPerMinute}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          rpm
                        </span>
                      </div>
                    </div>
                    <MeasurementNotes
                      dogId={id}
                      measurementId={m.id}
                      initialNotes={m.notes ?? null}
                      onNotesUpdated={(newNotes) => {
                        setMeasurements((prev) =>
                          prev.map((measurement) =>
                            measurement.id === m.id
                              ? { ...measurement, notes: newNotes }
                              : measurement
                          )
                        );
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sharing section (owner only) */}
        {role === "owner" && <DogShares dogId={dog.id} />}

        {/* Caretaker badge */}
        {role === "caretaker" && (
          <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
            <p className="font-medium">Acceso como cuidador</p>
            <p className="mt-1 text-xs opacity-80">
              Puedes realizar mediciones y consultar el historial. Para editar el perfil o gestionar cuidadores, contacta al propietario.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {role === "owner" && (
            <>
              <Link
                href={`/perros/${dog.id}/editar`}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
              >
                Editar perfil
              </Link>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50"
              >
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
