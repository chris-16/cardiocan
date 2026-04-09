"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Dog } from "@/lib/db/schema";
import DogForm, { type DogFormData } from "@/app/perros/components/dog-form";

export default function EditDogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [dog, setDog] = useState<Dog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  async function handleSubmit(data: DogFormData) {
    const res = await fetch(`/api/dogs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        breed: data.breed || null,
        weight: data.weight ? Math.round(parseFloat(data.weight) * 1000) : null,
        birthDate: data.birthDate || null,
        cardiacCondition: data.cardiacCondition || null,
        rpmThreshold: data.rpmThreshold ? parseInt(data.rpmThreshold, 10) : 30,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || "Error al actualizar el perfil");
    }

    router.push(`/perros/${id}`);
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
          href={`/perros/${id}`}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          &larr; Volver al perfil
        </Link>
        <h1 className="text-2xl font-bold mt-2">Editar perfil</h1>
      </div>

      <DogForm
        dog={dog}
        onSubmit={handleSubmit}
        submitLabel="Guardar cambios"
        loadingLabel="Guardando..."
      />
    </div>
  );
}
