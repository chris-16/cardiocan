import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { dogs, respiratoryMeasurements } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getDogAccess } from "@/lib/db/dog-access";
import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";

interface CreateMeasurementBody {
  breathCount: number;
  durationSeconds: number;
  notes?: string;
}

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

    // Verify dog access (owner or caretaker)
    const access = await getDogAccess(dogId, session.userId);

    if (!access) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    const db = getDb();
    const measurements = await db
      .select()
      .from(respiratoryMeasurements)
      .where(eq(respiratoryMeasurements.dogId, dogId))
      .orderBy(desc(respiratoryMeasurements.createdAt));

    return NextResponse.json({ measurements });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

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

    // Verify dog access (owner or caretaker)
    const access = await getDogAccess(dogId, session.userId);

    if (!access) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    const db = getDb();

    const body = (await request.json()) as CreateMeasurementBody;
    const { breathCount, durationSeconds, notes } = body;

    if (typeof breathCount !== "number" || breathCount < 0) {
      return NextResponse.json(
        { error: "Conteo de respiraciones inválido" },
        { status: 400 }
      );
    }

    if (durationSeconds !== 30 && durationSeconds !== 60) {
      return NextResponse.json(
        { error: "La duración debe ser 30 o 60 segundos" },
        { status: 400 }
      );
    }

    const breathsPerMinute = Math.round(
      (breathCount / durationSeconds) * 60
    );

    const id = crypto.randomUUID();

    const trimmedNotes = notes?.trim() || null;

    await db.insert(respiratoryMeasurements).values({
      id,
      dogId,
      userId: session.userId,
      breathCount,
      durationSeconds,
      breathsPerMinute,
      notes: trimmedNotes,
    });

    const [measurement] = await db
      .select()
      .from(respiratoryMeasurements)
      .where(eq(respiratoryMeasurements.id, id))
      .limit(1);

    return NextResponse.json({ measurement }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
