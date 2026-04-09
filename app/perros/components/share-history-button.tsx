"use client";

import { useState } from "react";
import { generateVetPDF, type ExportData } from "@/lib/export-pdf";

interface ShareHistoryButtonProps {
  dogId: string;
  dogName: string;
}

function buildFileName(dogName: string): string {
  const safeName = dogName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, "").trim();
  const dateStr = new Date().toISOString().slice(0, 10);
  return `CardioCAn_${safeName}_${dateStr}.pdf`;
}

function buildSummaryText(dogName: string, data: ExportData): string {
  const dateStr = new Date().toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  let text = `Historial CardioCAn de ${dogName} - ${dateStr}\n\n`;

  if (data.measurements.length > 0) {
    const avg = Math.round(
      data.measurements.reduce((s, m) => s + m.breathsPerMinute, 0) /
        data.measurements.length
    );
    const max = Math.max(...data.measurements.map((m) => m.breathsPerMinute));
    const min = Math.min(...data.measurements.map((m) => m.breathsPerMinute));
    text += `Frecuencia respiratoria:\n`;
    text += `- ${data.measurements.length} mediciones\n`;
    text += `- Promedio: ${avg} rpm\n`;
    text += `- Rango: ${min}-${max} rpm\n\n`;
  }

  if (data.medications.length > 0) {
    const activeMeds = data.medications.filter((m) => m.active);
    if (activeMeds.length > 0) {
      text += `Medicamentos activos:\n`;
      activeMeds.forEach((med) => {
        text += `- ${med.name} (${med.dose})\n`;
      });
    }
  }

  return text;
}

async function generatePdfBlob(
  dogId: string,
  dogName: string
): Promise<{ blob: Blob; data: ExportData }> {
  const res = await fetch(`/api/dogs/${dogId}/export`);
  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error || "Error al obtener los datos");
  }

  const exportData: ExportData = await res.json();
  const doc = generateVetPDF(exportData);
  const blob = doc.output("blob");
  return { blob, data: exportData };
}

export default function ShareHistoryButton({
  dogId,
  dogName,
}: ShareHistoryButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  async function handleNativeShare() {
    setLoading(true);
    setError("");
    setShowMenu(false);

    try {
      const { blob, data } = await generatePdfBlob(dogId, dogName);
      const fileName = buildFileName(dogName);
      const file = new File([blob], fileName, { type: "application/pdf" });
      const summary = buildSummaryText(dogName, data);

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `Historial de ${dogName} - CardioCAn`,
          text: summary,
          files: [file],
        });
      } else {
        // Fallback: show specific share options
        setShowMenu(true);
      }
    } catch (err) {
      // User cancelled share is not an error
      if (err instanceof Error && err.name === "AbortError") return;
      setError("Error al compartir");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailShare() {
    setLoading(true);
    setError("");
    setShowMenu(false);

    try {
      const { blob, data } = await generatePdfBlob(dogId, dogName);
      const fileName = buildFileName(dogName);
      const summary = buildSummaryText(dogName, data);

      // Check if native share supports files (for email with attachment)
      const file = new File([blob], fileName, { type: "application/pdf" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `Historial de ${dogName} - CardioCAn`,
          text: summary,
          files: [file],
        });
      } else {
        // Fallback: download PDF + open mailto with summary
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);

        const subject = encodeURIComponent(
          `Historial de ${dogName} - CardioCAn`
        );
        const body = encodeURIComponent(
          summary + "\n(El PDF se ha descargado y se puede adjuntar al email)"
        );
        window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError("Error al compartir por email");
    } finally {
      setLoading(false);
    }
  }

  async function handleWhatsAppShare() {
    setLoading(true);
    setError("");
    setShowMenu(false);

    try {
      const { blob, data } = await generatePdfBlob(dogId, dogName);
      const fileName = buildFileName(dogName);
      const summary = buildSummaryText(dogName, data);

      // Try native share with file (works on mobile for WhatsApp)
      const file = new File([blob], fileName, { type: "application/pdf" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `Historial de ${dogName} - CardioCAn`,
          text: summary,
          files: [file],
        });
      } else {
        // Fallback: download PDF + open WhatsApp with text summary
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);

        const text = encodeURIComponent(
          summary + "\n(El PDF se ha descargado para adjuntar)"
        );
        window.open(`https://wa.me/?text=${text}`, "_blank");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError("Error al compartir por WhatsApp");
    } finally {
      setLoading(false);
    }
  }

  // Check if native Web Share API with file support is available
  const supportsNativeShare =
    typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="relative">
      {/* Main share button */}
      <button
        onClick={supportsNativeShare ? handleNativeShare : () => setShowMenu(!showMenu)}
        disabled={loading}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-800 disabled:opacity-50"
      >
        <div className="text-left">
          <span className="text-sm font-semibold">
            {loading ? "Preparando..." : "Compartir historial"}
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            Enviar PDF por email o WhatsApp
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
            <path d="M13 4.5a2.5 2.5 0 11.702 1.737L6.97 9.604a2.518 2.518 0 010 .792l6.733 3.367a2.5 2.5 0 11-.671 1.341l-6.733-3.367a2.5 2.5 0 110-3.474l6.733-3.367A2.52 2.52 0 0113 4.5z" />
          </svg>
        )}
      </button>

      {/* Dropdown menu for desktop (no native share) */}
      {showMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />

          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
            <button
              onClick={handleEmailShare}
              disabled={loading}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-t-lg disabled:opacity-50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5 text-gray-500"
              >
                <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
              </svg>
              <div>
                <span className="text-sm font-medium">Email</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  Enviar PDF por correo electrónico
                </span>
              </div>
            </button>

            <div className="border-t border-gray-200 dark:border-gray-700" />

            <button
              onClick={handleWhatsAppShare}
              disabled={loading}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-b-lg disabled:opacity-50"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5 text-green-600"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              <div>
                <span className="text-sm font-medium">WhatsApp</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  Enviar resumen y PDF por WhatsApp
                </span>
              </div>
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
