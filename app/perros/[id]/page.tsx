"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Dog } from "@/lib/db/schema";
import PhotoUpload from "@/app/perros/components/photo-upload";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function fetchDog() {
      try {
        const res = await fetch(`/api/dogs/${id}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Error al cargar el perfil");
          return;
        }
        setDog(data.dog);
      } catch {
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    }
    fetchDog();
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
        </div>

        {/* Actions */}
        <div className="flex gap-3">
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
        </div>
      </div>
    </div>
  );
}
