"use client";

import { useState, type FormEvent } from "react";
import type { Dog } from "@/lib/db/schema";
import { DEFAULT_RPM_THRESHOLD } from "@/app/perros/components/rpm-alert";

interface DogFormProps {
  dog?: Dog;
  onSubmit: (data: DogFormData) => Promise<void>;
  submitLabel: string;
  loadingLabel: string;
}

export interface DogFormData {
  name: string;
  breed: string;
  weight: string;
  birthDate: string;
  cardiacCondition: string;
  rpmThreshold: string;
}

export default function DogForm({
  dog,
  onSubmit,
  submitLabel,
  loadingLabel,
}: DogFormProps) {
  const [name, setName] = useState(dog?.name ?? "");
  const [breed, setBreed] = useState(dog?.breed ?? "");
  const [weight, setWeight] = useState(
    dog?.weight ? (dog.weight / 1000).toString() : ""
  );
  const [birthDate, setBirthDate] = useState(dog?.birthDate ?? "");
  const [cardiacCondition, setCardiacCondition] = useState(
    dog?.cardiacCondition ?? ""
  );
  const [rpmThreshold, setRpmThreshold] = useState(
    (dog?.rpmThreshold ?? DEFAULT_RPM_THRESHOLD).toString()
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await onSubmit({ name, breed, weight, birthDate, cardiacCondition, rpmThreshold });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1">
          Nombre *
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="Nombre del perro"
        />
      </div>

      <div>
        <label htmlFor="breed" className="block text-sm font-medium mb-1">
          Raza
        </label>
        <input
          id="breed"
          type="text"
          value={breed}
          onChange={(e) => setBreed(e.target.value)}
          className={inputClass}
          placeholder="Ej: Labrador, Bulldog Francés"
        />
      </div>

      <div>
        <label htmlFor="weight" className="block text-sm font-medium mb-1">
          Peso (kg)
        </label>
        <input
          id="weight"
          type="number"
          step="0.1"
          min="0"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className={inputClass}
          placeholder="Ej: 12.5"
        />
      </div>

      <div>
        <label htmlFor="birthDate" className="block text-sm font-medium mb-1">
          Fecha de nacimiento
        </label>
        <input
          id="birthDate"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="cardiacCondition"
          className="block text-sm font-medium mb-1"
        >
          Condición cardíaca
        </label>
        <select
          id="cardiacCondition"
          value={cardiacCondition}
          onChange={(e) => setCardiacCondition(e.target.value)}
          className={inputClass}
        >
          <option value="">Seleccionar...</option>
          <option value="MVD etapa B1">MVD etapa B1</option>
          <option value="MVD etapa B2">MVD etapa B2</option>
          <option value="MVD etapa C">MVD etapa C</option>
          <option value="MVD etapa D">MVD etapa D</option>
          <option value="DCM">DCM (Cardiomiopatía dilatada)</option>
          <option value="Estenosis pulmonar">Estenosis pulmonar</option>
          <option value="Estenosis aórtica">Estenosis aórtica</option>
          <option value="PDA">PDA (Conducto arterioso persistente)</option>
          <option value="Otra">Otra</option>
        </select>
      </div>

      <div>
        <label htmlFor="rpmThreshold" className="block text-sm font-medium mb-1">
          Umbral de alerta (rpm)
        </label>
        <input
          id="rpmThreshold"
          type="number"
          step="1"
          min="10"
          max="80"
          value={rpmThreshold}
          onChange={(e) => setRpmThreshold(e.target.value)}
          className={inputClass}
          placeholder="30"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Frecuencia respiratoria (resp/min) que dispara las alertas. Por defecto: {DEFAULT_RPM_THRESHOLD} rpm.
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? loadingLabel : submitLabel}
      </button>
    </form>
  );
}
