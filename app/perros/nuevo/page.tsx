"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import DogForm, { type DogFormData } from "@/app/perros/components/dog-form";

export default function NewDogPage() {
  const router = useRouter();

  async function handleSubmit(data: DogFormData) {
    const res = await fetch("/api/dogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        breed: data.breed || undefined,
        weight: data.weight ? Math.round(parseFloat(data.weight) * 1000) : undefined,
        birthDate: data.birthDate || undefined,
        cardiacCondition: data.cardiacCondition || undefined,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || "Error al crear el perfil");
    }

    router.push(`/perros/${result.dog.id}`);
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
        <h1 className="text-2xl font-bold mt-2">Agregar perro</h1>
      </div>

      <DogForm
        onSubmit={handleSubmit}
        submitLabel="Crear perfil"
        loadingLabel="Creando..."
      />
    </div>
  );
}
