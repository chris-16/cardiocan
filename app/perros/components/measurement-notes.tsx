"use client";

import { useState } from "react";

interface MeasurementNotesProps {
  dogId: string;
  measurementId: string;
  initialNotes: string | null;
  onNotesUpdated: (notes: string | null) => void;
}

export default function MeasurementNotes({
  dogId,
  measurementId,
  initialNotes,
  onNotesUpdated,
}: MeasurementNotesProps) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        `/api/dogs/${dogId}/measurements/${measurementId}/notes`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al guardar");
        return;
      }

      const trimmed = notes.trim() || null;
      onNotesUpdated(trimmed);
      setEditing(false);
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        `/api/dogs/${dogId}/measurements/${measurementId}/notes`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al eliminar");
        return;
      }

      setNotes("");
      onNotesUpdated(null);
      setEditing(false);
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  // Display mode: show notes or "add note" button
  if (!editing) {
    if (initialNotes) {
      return (
        <div className="mt-1">
          <p className="text-xs text-gray-600 dark:text-gray-400 italic">
            {initialNotes}
          </p>
          <button
            onClick={() => {
              setNotes(initialNotes);
              setEditing(true);
            }}
            className="text-xs text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Editar nota
          </button>
        </div>
      );
    }
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-1 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
      >
        + Añadir nota
      </button>
    );
  }

  // Edit mode
  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Estado del perro, síntomas observados..."
        rows={2}
        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
      />
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
        <button
          onClick={() => {
            setNotes(initialNotes ?? "");
            setEditing(false);
            setError("");
          }}
          disabled={saving}
          className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
        >
          Cancelar
        </button>
        {initialNotes && (
          <button
            onClick={handleDelete}
            disabled={saving}
            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
          >
            Eliminar nota
          </button>
        )}
      </div>
    </div>
  );
}
