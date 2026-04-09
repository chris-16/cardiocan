"use client";

import { useState } from "react";
import { generateVetPDF, type ExportData } from "@/lib/export-pdf";

interface ExportPdfButtonProps {
  dogId: string;
  dogName: string;
}

export default function ExportPdfButton({ dogId, dogName }: ExportPdfButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleExport() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/dogs/${dogId}/export`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al obtener los datos");
        return;
      }

      const exportData: ExportData = await res.json();
      const doc = generateVetPDF(exportData);

      const safeName = dogName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, "").trim();
      const dateStr = new Date().toISOString().slice(0, 10);
      doc.save(`CardioCAn_${safeName}_${dateStr}.pdf`);
    } catch {
      setError("Error al generar el PDF");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleExport}
        disabled={loading}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-800 disabled:opacity-50"
      >
        <div className="text-left">
          <span className="text-sm font-semibold">
            {loading ? "Generando PDF..." : "Exportar PDF para veterinario"}
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            Historial completo de mediciones y medicación
          </span>
        </div>
        {loading ? (
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 text-gray-400"
          >
            <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
            <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
          </svg>
        )}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
