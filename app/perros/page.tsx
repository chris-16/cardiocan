"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Dog } from "@/lib/db/schema";

export default function DogListPage() {
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchDogs() {
      try {
        const res = await fetch("/api/dogs");
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Error al cargar los perros");
          return;
        }
        setDogs(data.dogs);
      } catch {
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    }
    fetchDogs();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Mis perros</h1>
        <Link
          href="/perros/nuevo"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Agregar perro
        </Link>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400 mb-4">
          {error}
        </div>
      )}

      {dogs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Aún no has agregado ningún perro
          </p>
          <Link
            href="/perros/nuevo"
            className="text-blue-600 hover:text-blue-500 font-medium"
          >
            Agregar tu primer perro
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {dogs.map((dog) => (
            <Link
              key={dog.id}
              href={`/perros/${dog.id}`}
              className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50 transition-colors"
            >
              <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                {dog.photoUrl ? (
                  <Image
                    src={dog.photoUrl}
                    alt={dog.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-400 text-xl font-bold">
                    {dog.name[0].toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{dog.name}</p>
                {dog.breed && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {dog.breed}
                  </p>
                )}
                {dog.cardiacCondition && (
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                    {dog.cardiacCondition}
                  </p>
                )}
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-gray-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
