import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ExportDog {
  name: string;
  breed: string | null;
  weight: number | null;
  birthDate: string | null;
  cardiacCondition: string | null;
  rpmThreshold: number;
}

interface ExportMeasurement {
  breathCount: number;
  durationSeconds: number;
  breathsPerMinute: number;
  method: string;
  aiConfidence: string | null;
  notes: string | null;
  createdAt: string | number;
  userName: string;
}

interface ExportMedicationLog {
  scheduledTime: string;
  administeredAt: string | number;
  status: string;
  notes: string | null;
  userName: string;
}

interface ExportMedicationSchedule {
  time: string;
  daysOfWeek: string;
}

interface ExportMedication {
  name: string;
  dose: string;
  notes: string | null;
  active: boolean;
  schedules: ExportMedicationSchedule[];
  logs: ExportMedicationLog[];
}

export interface ExportData {
  dog: ExportDog;
  measurements: ExportMeasurement[];
  medications: ExportMedication[];
}

function formatDate(value: string | number): string {
  const date = new Date(
    typeof value === "number" ? value * 1000 : value
  );
  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWeight(grams: number | null): string {
  if (!grams) return "No registrado";
  return `${(grams / 1000).toFixed(1)} kg`;
}

function calculateAge(birthDate: string | null): string {
  if (!birthDate) return "No registrado";
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

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function formatDaysOfWeek(daysStr: string): string {
  const days = daysStr.split(",").map(Number);
  if (days.length === 7) return "Todos los días";
  return days.map((d) => DAY_NAMES[d]).join(", ");
}

export function generateVetPDF(data: ExportData): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // --- Header ---
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Historial Clínico - CardioCAn", pageWidth / 2, y, {
    align: "center",
  });
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(
    `Generado el ${new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })}`,
    pageWidth / 2,
    y,
    { align: "center" }
  );
  doc.setTextColor(0);
  y += 12;

  // --- Dog profile ---
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Datos del paciente", 14, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50 },
    },
    body: [
      ["Nombre", data.dog.name],
      ["Raza", data.dog.breed || "No registrada"],
      ["Peso", formatWeight(data.dog.weight)],
      ["Edad", calculateAge(data.dog.birthDate)],
      [
        "Fecha de nacimiento",
        data.dog.birthDate || "No registrada",
      ],
      [
        "Condición cardíaca",
        data.dog.cardiacCondition || "No registrada",
      ],
      ["Umbral de alerta", `${data.dog.rpmThreshold} rpm`],
    ],
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY + 10;

  // --- Respiratory measurements ---
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Historial de frecuencia respiratoria", 14, y);
  y += 2;

  if (data.measurements.length === 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text("Sin mediciones registradas", 14, y + 5);
    y += 12;
  } else {
    // Summary stats
    const avg = Math.round(
      data.measurements.reduce((s, m) => s + m.breathsPerMinute, 0) /
        data.measurements.length
    );
    const max = Math.max(...data.measurements.map((m) => m.breathsPerMinute));
    const min = Math.min(...data.measurements.map((m) => m.breathsPerMinute));

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Total: ${data.measurements.length} mediciones  |  Promedio: ${avg} rpm  |  Mín: ${min} rpm  |  Máx: ${max} rpm`,
      14,
      y + 5
    );
    y += 8;

    autoTable(doc, {
      startY: y,
      theme: "striped",
      headStyles: {
        fillColor: [59, 130, 246],
        fontSize: 9,
        fontStyle: "bold",
      },
      styles: { fontSize: 8, cellPadding: 2 },
      head: [["Fecha", "RPM", "Método", "Respiraciones", "Registrado por", "Notas"]],
      body: data.measurements.map((m) => [
        formatDate(m.createdAt),
        `${m.breathsPerMinute}`,
        m.method === "ai"
          ? `AI (${m.aiConfidence || "—"})`
          : "Manual",
        `${m.breathCount} en ${m.durationSeconds}s`,
        m.userName,
        m.notes || "—",
      ]),
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 15, halign: "center" },
        2: { cellWidth: 22 },
        3: { cellWidth: 26 },
        4: { cellWidth: 30 },
        5: { cellWidth: "auto" },
      },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 10;
  }

  // --- Medications ---
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");

  // Check if we need a new page
  if (y > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    y = 20;
  }

  doc.text("Medicación", 14, y);
  y += 2;

  if (data.medications.length === 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text("Sin medicamentos registrados", 14, y + 5);
    y += 12;
  } else {
    // Medication summary table
    autoTable(doc, {
      startY: y,
      theme: "striped",
      headStyles: {
        fillColor: [59, 130, 246],
        fontSize: 9,
        fontStyle: "bold",
      },
      styles: { fontSize: 8, cellPadding: 2 },
      head: [["Medicamento", "Dosis", "Estado", "Horarios", "Notas"]],
      body: data.medications.map((med) => [
        med.name,
        med.dose,
        med.active ? "Activo" : "Inactivo",
        med.schedules
          .map((s) => `${s.time} (${formatDaysOfWeek(s.daysOfWeek)})`)
          .join("\n") || "—",
        med.notes || "—",
      ]),
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 10;

    // Medication logs per medication
    for (const med of data.medications) {
      if (med.logs.length === 0) continue;

      if (y > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`Registro de administración: ${med.name} (${med.dose})`, 14, y);
      y += 2;

      autoTable(doc, {
        startY: y,
        theme: "striped",
        headStyles: {
          fillColor: [107, 114, 128],
          fontSize: 8,
          fontStyle: "bold",
        },
        styles: { fontSize: 8, cellPadding: 2 },
        head: [["Fecha", "Hora programada", "Estado", "Administrado por", "Notas"]],
        body: med.logs.map((log) => [
          formatDate(log.administeredAt),
          log.scheduledTime,
          log.status === "administered" ? "Administrado" : "Omitido",
          log.userName,
          log.notes || "—",
        ]),
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } })
        .lastAutoTable.finalY + 10;
    }
  }

  // --- Footer on each page ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150);
    doc.text(
      `CardioCAn - Historial de ${data.dog.name} - Página ${i} de ${totalPages}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
    doc.setTextColor(0);
  }

  return doc;
}
