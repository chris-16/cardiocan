import type { ExportData } from "./export-pdf";

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDate(value: string | number): { date: string; time: string } {
  const d = new Date(typeof value === "number" ? value * 1000 : value);
  return {
    date: d.toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function buildMeasurementsCSV(data: ExportData): string {
  const header = [
    "Fecha",
    "Hora",
    "RPM",
    "Respiraciones",
    "Duración (s)",
    "Método",
    "Confianza AI",
    "Registrado por",
    "Notas",
  ];

  const rows = data.measurements.map((m) => {
    const { date, time } = formatDate(m.createdAt);
    return [
      date,
      time,
      String(m.breathsPerMinute),
      String(m.breathCount),
      String(m.durationSeconds),
      m.method === "ai" ? "AI" : "Manual",
      m.aiConfidence || "",
      m.userName,
      m.notes || "",
    ].map(escapeCSV);
  });

  return [header.map(escapeCSV).join(","), ...rows.map((r) => r.join(","))].join(
    "\n"
  );
}

function buildMedicationCSV(data: ExportData): string {
  const header = [
    "Medicamento",
    "Dosis",
    "Estado",
    "Fecha administración",
    "Hora administración",
    "Hora programada",
    "Resultado",
    "Administrado por",
    "Notas medicamento",
    "Notas administración",
  ];

  const rows: string[][] = [];

  for (const med of data.medications) {
    if (med.logs.length === 0) {
      // Include medication even without logs
      rows.push(
        [
          med.name,
          med.dose,
          med.active ? "Activo" : "Inactivo",
          "",
          "",
          "",
          "",
          "",
          med.notes || "",
          "",
        ].map(escapeCSV)
      );
    } else {
      for (const log of med.logs) {
        const { date, time } = formatDate(log.administeredAt);
        rows.push(
          [
            med.name,
            med.dose,
            med.active ? "Activo" : "Inactivo",
            date,
            time,
            log.scheduledTime,
            log.status === "administered" ? "Administrado" : "Omitido",
            log.userName,
            med.notes || "",
            log.notes || "",
          ].map(escapeCSV)
        );
      }
    }
  }

  return [header.map(escapeCSV).join(","), ...rows.map((r) => r.join(","))].join(
    "\n"
  );
}

/**
 * Generates a single CSV string with two sections:
 * 1. Mediciones respiratorias
 * 2. Historial de medicación
 *
 * Uses BOM for Excel compatibility and separates sections with blank lines.
 */
export function generateExportCSV(data: ExportData): string {
  const BOM = "\uFEFF";
  const dogInfo = `Paciente: ${data.dog.name}`;
  const generatedAt = `Generado: ${new Date().toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })}`;

  const sections = [
    dogInfo,
    generatedAt,
    "",
    "--- MEDICIONES RESPIRATORIAS ---",
    buildMeasurementsCSV(data),
    "",
    "--- HISTORIAL DE MEDICACIÓN ---",
    buildMedicationCSV(data),
  ];

  return BOM + sections.join("\n");
}
