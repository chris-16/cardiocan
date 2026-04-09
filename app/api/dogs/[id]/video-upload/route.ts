import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDogAccess } from "@/lib/db/dog-access";
import { getDb } from "@/lib/db";
import { respiratoryMeasurements } from "@/lib/db/schema";
import { uploadVideoToR2, buildVideoKey } from "@/lib/r2";
import { eq } from "drizzle-orm";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
const VALID_TYPES = ["video/webm", "video/mp4", "video/quicktime"];

/**
 * POST /api/dogs/[id]/video-upload
 *
 * Upload a video to Cloudflare R2 and link it to an existing measurement.
 * Expects multipart form data with:
 * - video: File (video blob)
 * - measurementId: string (the measurement to link the video to)
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

    const formData = await request.formData();
    const file = formData.get("video") as File | null;
    const measurementId = formData.get("measurementId") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó un video" },
        { status: 400 }
      );
    }

    if (!measurementId) {
      return NextResponse.json(
        { error: "No se proporcionó el ID de la medición" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!VALID_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Formato de video no válido. Usa WebM, MP4 o MOV" },
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

    // Verify the measurement exists and belongs to this dog
    const db = getDb();
    const [measurement] = await db
      .select()
      .from(respiratoryMeasurements)
      .where(eq(respiratoryMeasurements.id, measurementId))
      .limit(1);

    if (!measurement || measurement.dogId !== dogId) {
      return NextResponse.json(
        { error: "Medición no encontrada" },
        { status: 404 }
      );
    }

    // Build the R2 key and upload
    const videoKey = buildVideoKey(dogId, measurementId, file.type);
    const bytes = await file.arrayBuffer();
    await uploadVideoToR2(Buffer.from(bytes), videoKey, file.type);

    // Link the video to the measurement
    await db
      .update(respiratoryMeasurements)
      .set({ videoKey })
      .where(eq(respiratoryMeasurements.id, measurementId));

    return NextResponse.json({
      success: true,
      videoKey,
      message: "Video almacenado exitosamente",
    });
  } catch (err) {
    console.error("Error uploading video to R2:", err);
    return NextResponse.json(
      { error: "Error al almacenar el video" },
      { status: 500 }
    );
  }
}
