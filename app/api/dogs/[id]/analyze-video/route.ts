import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDogAccess } from "@/lib/db/dog-access";
import { getDb } from "@/lib/db";
import { respiratoryMeasurements } from "@/lib/db/schema";
import { analyzeRespiratoryVideo } from "@/lib/gemini";
import { validateAnalysis } from "@/lib/analysis-validation";
import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

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

    const formData = await request.formData();
    const file = formData.get("video") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó un video" },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ["video/webm", "video/mp4", "video/quicktime"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Formato de video no válido. Usa WebM, MP4 o MOV." },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_VIDEO_SIZE) {
      return NextResponse.json(
        { error: "El video no puede superar 100MB" },
        { status: 400 }
      );
    }

    // Convert to Buffer for Gemini API
    const bytes = await file.arrayBuffer();
    const videoBuffer = Buffer.from(bytes);

    // Analyze with Gemini
    const analysis = await analyzeRespiratoryVideo(videoBuffer, file.type);

    // Check if analysis was successful (breathCount > 0)
    if (analysis.breathCount === 0 || analysis.durationSeconds === 0) {
      return NextResponse.json({
        success: false,
        analysis,
        message:
          "No se pudieron contar las respiraciones en el video. " +
          (analysis.notes || "Intenta grabar un video más claro con el perro en reposo."),
      });
    }

    const db = getDb();

    // Fetch recent measurements for this dog to validate AI result
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

    // Calculate historical AI errors (AI measurements that have a close-in-time manual measurement)
    const historicalAiErrors: number[] = [];
    const aiMeasurements = recentMeasurements.filter((m) => m.method === "ai");
    const manualMeasurements = recentMeasurements.filter((m) => m.method === "manual");

    for (const aiM of aiMeasurements) {
      // Find closest manual measurement within 24h
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

    // Use our calculated RPM for consistency
    const breathsPerMinute = Math.round(
      (analysis.breathCount / analysis.durationSeconds) * 60
    );

    // Run validation
    const validation = validateAnalysis({
      aiRpm: breathsPerMinute,
      aiConfidence: analysis.confidence,
      recentManualMeasurements,
      historicalAiErrors,
    });

    // Save measurement to database
    const measurementId = crypto.randomUUID();

    const noteParts: string[] = [];
    noteParts.push(`Análisis automático por IA (confianza: ${analysis.confidence})`);
    if (analysis.notes) {
      noteParts.push(analysis.notes);
    }

    await db.insert(respiratoryMeasurements).values({
      id: measurementId,
      dogId,
      userId: session.userId,
      breathCount: analysis.breathCount,
      durationSeconds: analysis.durationSeconds,
      breathsPerMinute,
      method: "ai",
      aiConfidence: analysis.confidence,
      notes: noteParts.join(". "),
    });

    return NextResponse.json({
      success: true,
      analysis: {
        ...analysis,
        breathsPerMinute, // Use our calculated value for consistency
      },
      measurementId,
      validation,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Error interno del servidor";

    // Distinguish between known errors (user-friendly) and unknown errors
    const isKnownError =
      err instanceof Error &&
      (message.includes("Gemini") ||
        message.includes("Límite") ||
        message.includes("GEMINI_API_KEY") ||
        message.includes("procesamiento") ||
        message.includes("interpretar") ||
        message.includes("válidos"));

    return NextResponse.json(
      { error: isKnownError ? message : "Error al analizar el video. Intenta de nuevo." },
      { status: isKnownError ? 422 : 500 }
    );
  }
}
