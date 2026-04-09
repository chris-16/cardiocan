import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDogAccess } from "@/lib/db/dog-access";
import { getDb } from "@/lib/db";
import { respiratoryMeasurements } from "@/lib/db/schema";
import { validateAnalysis } from "@/lib/analysis-validation";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";

/**
 * POST /api/dogs/[id]/on-device-measurement
 *
 * Saves a respiratory measurement computed on-device (MediaPipe/canvas analysis).
 * The analysis happens client-side; this endpoint validates and stores the result.
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

    // Verify access to this dog
    const access = await getDogAccess(dogId, session.userId);
    if (!access) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { breathCount, durationSeconds, breathsPerMinute, confidence, notes, signalQuality } =
      body as {
        breathCount: number;
        durationSeconds: number;
        breathsPerMinute: number;
        confidence: "alta" | "media" | "baja";
        notes: string;
        signalQuality: number;
      };

    // Validate required fields
    if (
      typeof breathCount !== "number" ||
      typeof durationSeconds !== "number" ||
      typeof breathsPerMinute !== "number" ||
      !["alta", "media", "baja"].includes(confidence)
    ) {
      return NextResponse.json(
        { error: "Datos de medición inválidos" },
        { status: 400 }
      );
    }

    // Validate ranges
    if (breathCount < 0 || durationSeconds < 5 || breathsPerMinute < 0) {
      return NextResponse.json(
        { error: "Valores de medición fuera de rango" },
        { status: 400 }
      );
    }

    // Check if analysis was successful
    if (breathCount === 0 || breathsPerMinute === 0) {
      return NextResponse.json({
        success: false,
        message:
          "No se detectaron respiraciones en el análisis on-device. " +
          (notes || "Intenta seleccionar mejor la zona del tórax."),
      });
    }

    const db = getDb();

    // Fetch recent measurements for validation (same logic as Gemini endpoint)
    const recentMeasurements = await db
      .select({
        breathsPerMinute: respiratoryMeasurements.breathsPerMinute,
        method: respiratoryMeasurements.method,
        aiConfidence: respiratoryMeasurements.aiConfidence,
        createdAt: respiratoryMeasurements.createdAt,
      })
      .from(respiratoryMeasurements)
      .where(eq(respiratoryMeasurements.dogId, dogId))
      .orderBy(desc(respiratoryMeasurements.createdAt))
      .limit(50);

    // Separate manual measurements for comparison
    const recentManualMeasurements = recentMeasurements
      .filter((m) => m.method === "manual")
      .map((m) => ({
        breathsPerMinute: m.breathsPerMinute,
        createdAt: m.createdAt,
      }));

    // Calculate historical AI errors
    const historicalAiErrors: number[] = [];
    const aiMeasurements = recentMeasurements.filter((m) => m.method === "ai");
    const manualMeasurements = recentMeasurements.filter((m) => m.method === "manual");

    for (const aiM of aiMeasurements) {
      const aiTime = aiM.createdAt.getTime();
      let closestManual: (typeof manualMeasurements)[0] | null = null;
      let closestDiff = Infinity;

      for (const manM of manualMeasurements) {
        const diff = Math.abs(manM.createdAt.getTime() - aiTime);
        if (diff < 24 * 60 * 60 * 1000 && diff < closestDiff) {
          closestDiff = diff;
          closestManual = manM;
        }
      }

      if (closestManual) {
        historicalAiErrors.push(
          Math.abs(aiM.breathsPerMinute - closestManual.breathsPerMinute)
        );
      }
    }

    // Run validation
    const validation = validateAnalysis({
      aiRpm: breathsPerMinute,
      aiConfidence: confidence,
      recentManualMeasurements,
      historicalAiErrors,
    });

    // Save measurement to database
    const measurementId = crypto.randomUUID();

    const noteParts: string[] = [];
    noteParts.push(
      `Análisis on-device (confianza: ${confidence}, calidad de señal: ${Math.round((signalQuality ?? 0) * 100)}%)`
    );
    if (notes) {
      noteParts.push(notes);
    }

    await db.insert(respiratoryMeasurements).values({
      id: measurementId,
      dogId,
      userId: session.userId,
      breathCount,
      durationSeconds,
      breathsPerMinute,
      method: "ai",
      aiConfidence: confidence,
      notes: noteParts.join(". "),
    });

    return NextResponse.json({
      success: true,
      analysis: {
        breathCount,
        durationSeconds,
        breathsPerMinute,
        confidence,
        notes,
      },
      measurementId,
      validation,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error interno del servidor";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
