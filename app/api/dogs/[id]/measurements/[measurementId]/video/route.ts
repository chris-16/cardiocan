import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDogAccess } from "@/lib/db/dog-access";
import { getDb } from "@/lib/db";
import { respiratoryMeasurements } from "@/lib/db/schema";
import { getVideoPresignedUrl } from "@/lib/r2";
import { eq } from "drizzle-orm";

/**
 * GET /api/dogs/[id]/measurements/[measurementId]/video
 *
 * Returns a time-limited presigned URL to stream/download the measurement video.
 * Only accessible by users who have access to the dog (owner or caretaker).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; measurementId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: dogId, measurementId } = await params;

    // Verify access to this dog
    const access = await getDogAccess(dogId, session.userId);
    if (!access) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    // Fetch the measurement and verify it belongs to this dog
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

    if (!measurement.videoKey) {
      return NextResponse.json(
        { error: "Esta medición no tiene video asociado" },
        { status: 404 }
      );
    }

    // Generate a presigned URL (valid for 1 hour)
    const url = await getVideoPresignedUrl(measurement.videoKey, 3600);

    return NextResponse.json({ url });
  } catch (err) {
    console.error("Error generating video presigned URL:", err);
    return NextResponse.json(
      { error: "Error al obtener el video" },
      { status: 500 }
    );
  }
}
