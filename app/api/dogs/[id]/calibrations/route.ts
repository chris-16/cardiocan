import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDogAccess } from "@/lib/db/dog-access";
import { getDb } from "@/lib/db";
import {
  respiratoryMeasurements,
  calibrationRecords,
  users,
} from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";

interface CalibrationBody {
  aiBreathCount: number;
  aiDurationSeconds: number;
  aiBreathsPerMinute: number;
  aiConfidence: "alta" | "media" | "baja";
  aiNotes: string;
  aiMethod: "cloud" | "on-device";
  finalBreathsPerMinute: number;
  action: "accepted" | "corrected";
  correctionNotes?: string;
}

/**
 * POST /api/dogs/[id]/calibrations
 *
 * Saves a measurement after user review (accept or correct the AI result)
 * and creates a calibration record for progressive improvement tracking.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: dogId } = await params;

    const access = await getDogAccess(dogId, session.userId);
    if (!access) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    const body = (await request.json()) as CalibrationBody;
    const {
      aiBreathCount,
      aiDurationSeconds,
      aiBreathsPerMinute,
      aiConfidence,
      aiNotes,
      aiMethod,
      finalBreathsPerMinute,
      action,
      correctionNotes,
    } = body;

    // Validate required fields
    if (
      typeof aiBreathCount !== "number" ||
      typeof aiDurationSeconds !== "number" ||
      typeof aiBreathsPerMinute !== "number" ||
      typeof finalBreathsPerMinute !== "number" ||
      !["alta", "media", "baja"].includes(aiConfidence) ||
      !["accepted", "corrected"].includes(action) ||
      !["cloud", "on-device"].includes(aiMethod)
    ) {
      return NextResponse.json(
        { error: "Datos de calibración inválidos" },
        { status: 400 }
      );
    }

    if (finalBreathsPerMinute < 1 || finalBreathsPerMinute > 120) {
      return NextResponse.json(
        { error: "Frecuencia respiratoria fuera de rango válido (1-120 rpm)" },
        { status: 400 }
      );
    }

    const db = getDb();
    const measurementId = crypto.randomUUID();
    const calibrationId = crypto.randomUUID();

    // Determine final breath count based on action
    const finalBreathCount =
      action === "accepted"
        ? aiBreathCount
        : Math.round((finalBreathsPerMinute * aiDurationSeconds) / 60);

    // Build notes for the measurement
    const noteParts: string[] = [];
    noteParts.push(
      `Análisis ${aiMethod === "on-device" ? "on-device" : "cloud"} (confianza: ${aiConfidence})`
    );
    if (action === "corrected") {
      noteParts.push(
        `Corregido por usuario: ${aiBreathsPerMinute} → ${finalBreathsPerMinute} rpm`
      );
    }
    if (aiNotes) {
      noteParts.push(aiNotes);
    }
    if (correctionNotes) {
      noteParts.push(`Nota de corrección: ${correctionNotes}`);
    }

    // Save the measurement with the final (accepted or corrected) value
    await db.insert(respiratoryMeasurements).values({
      id: measurementId,
      dogId,
      userId: session.userId,
      breathCount: finalBreathCount,
      durationSeconds: aiDurationSeconds,
      breathsPerMinute: finalBreathsPerMinute,
      method: "ai",
      aiConfidence,
      notes: noteParts.join(". "),
    });

    // Create the calibration record
    const deviation = Math.abs(aiBreathsPerMinute - finalBreathsPerMinute);

    await db.insert(calibrationRecords).values({
      id: calibrationId,
      dogId,
      userId: session.userId,
      measurementId,
      aiBreathsPerMinute,
      finalBreathsPerMinute,
      deviation,
      action,
      aiMethod,
      aiConfidence,
      correctionNotes: correctionNotes?.trim() || null,
    });

    return NextResponse.json(
      {
        success: true,
        measurementId,
        calibrationId,
        deviation,
        action,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/dogs/[id]/calibrations
 *
 * Returns calibration history with stats for audit and progressive improvement tracking.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: dogId } = await params;

    const access = await getDogAccess(dogId, session.userId);
    if (!access) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    const db = getDb();

    const records = await db
      .select({
        id: calibrationRecords.id,
        dogId: calibrationRecords.dogId,
        userId: calibrationRecords.userId,
        measurementId: calibrationRecords.measurementId,
        aiBreathsPerMinute: calibrationRecords.aiBreathsPerMinute,
        finalBreathsPerMinute: calibrationRecords.finalBreathsPerMinute,
        deviation: calibrationRecords.deviation,
        action: calibrationRecords.action,
        aiMethod: calibrationRecords.aiMethod,
        aiConfidence: calibrationRecords.aiConfidence,
        correctionNotes: calibrationRecords.correctionNotes,
        createdAt: calibrationRecords.createdAt,
        userName: users.name,
      })
      .from(calibrationRecords)
      .leftJoin(users, eq(calibrationRecords.userId, users.id))
      .where(eq(calibrationRecords.dogId, dogId))
      .orderBy(desc(calibrationRecords.createdAt));

    // Calculate summary stats
    const totalRecords = records.length;
    const acceptedCount = records.filter((r) => r.action === "accepted").length;
    const correctedCount = records.filter(
      (r) => r.action === "corrected"
    ).length;
    const averageDeviation =
      totalRecords > 0
        ? Math.round(
            (records.reduce((sum, r) => sum + r.deviation, 0) / totalRecords) *
              10
          ) / 10
        : 0;
    const correctedDeviations = records
      .filter((r) => r.action === "corrected")
      .map((r) => r.deviation);
    const averageCorrectionDeviation =
      correctedDeviations.length > 0
        ? Math.round(
            (correctedDeviations.reduce((sum, d) => sum + d, 0) /
              correctedDeviations.length) *
              10
          ) / 10
        : 0;
    const acceptanceRate =
      totalRecords > 0
        ? Math.round((acceptedCount / totalRecords) * 100)
        : 0;

    // Trend: compare last 10 vs previous 10 deviations
    const recentDeviations = records.slice(0, 10).map((r) => r.deviation);
    const olderDeviations = records.slice(10, 20).map((r) => r.deviation);
    const recentAvg =
      recentDeviations.length > 0
        ? recentDeviations.reduce((s, d) => s + d, 0) / recentDeviations.length
        : null;
    const olderAvg =
      olderDeviations.length > 0
        ? olderDeviations.reduce((s, d) => s + d, 0) / olderDeviations.length
        : null;
    let trend: "improving" | "stable" | "degrading" | "insufficient" =
      "insufficient";
    if (recentAvg !== null && olderAvg !== null) {
      const diff = recentAvg - olderAvg;
      if (diff < -0.5) trend = "improving";
      else if (diff > 0.5) trend = "degrading";
      else trend = "stable";
    }

    return NextResponse.json({
      records: records.map((r) => ({
        ...r,
        userName: r.userName ?? "Usuario desconocido",
      })),
      stats: {
        totalRecords,
        acceptedCount,
        correctedCount,
        averageDeviation,
        averageCorrectionDeviation,
        acceptanceRate,
        trend,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
