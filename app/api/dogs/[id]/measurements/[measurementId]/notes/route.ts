import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { dogs, respiratoryMeasurements } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

interface UpdateNotesBody {
  notes: string;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; measurementId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: dogId, measurementId } = await params;

    const db = getDb();
    const [dog] = await db
      .select()
      .from(dogs)
      .where(and(eq(dogs.id, dogId), eq(dogs.userId, session.userId)))
      .limit(1);

    if (!dog) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    const [measurement] = await db
      .select()
      .from(respiratoryMeasurements)
      .where(
        and(
          eq(respiratoryMeasurements.id, measurementId),
          eq(respiratoryMeasurements.dogId, dogId)
        )
      )
      .limit(1);

    if (!measurement) {
      return NextResponse.json(
        { error: "Medición no encontrada" },
        { status: 404 }
      );
    }

    const body = (await request.json()) as UpdateNotesBody;
    const trimmedNotes = body.notes?.trim() || null;

    await db
      .update(respiratoryMeasurements)
      .set({ notes: trimmedNotes })
      .where(eq(respiratoryMeasurements.id, measurementId));

    const [updated] = await db
      .select()
      .from(respiratoryMeasurements)
      .where(eq(respiratoryMeasurements.id, measurementId))
      .limit(1);

    return NextResponse.json({ measurement: updated });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; measurementId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: dogId, measurementId } = await params;

    const db = getDb();
    const [dog] = await db
      .select()
      .from(dogs)
      .where(and(eq(dogs.id, dogId), eq(dogs.userId, session.userId)))
      .limit(1);

    if (!dog) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    const [measurement] = await db
      .select()
      .from(respiratoryMeasurements)
      .where(
        and(
          eq(respiratoryMeasurements.id, measurementId),
          eq(respiratoryMeasurements.dogId, dogId)
        )
      )
      .limit(1);

    if (!measurement) {
      return NextResponse.json(
        { error: "Medición no encontrada" },
        { status: 404 }
      );
    }

    await db
      .update(respiratoryMeasurements)
      .set({ notes: null })
      .where(eq(respiratoryMeasurements.id, measurementId));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
