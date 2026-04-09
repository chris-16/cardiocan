import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { medications, medicationSchedules } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getDogAccess } from "@/lib/db/dog-access";
import { hasPermission } from "@/lib/db/permissions";
import { eq } from "drizzle-orm";
import crypto from "crypto";

interface CreateMedicationBody {
  name: string;
  dose: string;
  notes?: string;
  schedules: Array<{
    time: string; // HH:MM
    daysOfWeek?: string; // comma-separated 0-6
  }>;
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
    const access = await getDogAccess(dogId, session.userId);
    if (!access) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    if (!hasPermission(access.role, "medication:read")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }

    const db = getDb();
    const meds = await db
      .select()
      .from(medications)
      .where(eq(medications.dogId, dogId));

    // Fetch schedules for each medication
    const medsWithSchedules = await Promise.all(
      meds.map(async (med) => {
        const schedules = await db
          .select()
          .from(medicationSchedules)
          .where(eq(medicationSchedules.medicationId, med.id));
        return { ...med, schedules };
      })
    );

    return NextResponse.json({ medications: medsWithSchedules });
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
    const access = await getDogAccess(dogId, session.userId);
    if (!access) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    if (!hasPermission(access.role, "medication:manage")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }

    const body = (await request.json()) as CreateMedicationBody;
    const { name, dose, notes, schedules } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "El nombre del medicamento es requerido" },
        { status: 400 }
      );
    }
    if (!dose?.trim()) {
      return NextResponse.json(
        { error: "La dosis es requerida" },
        { status: 400 }
      );
    }
    if (!schedules?.length) {
      return NextResponse.json(
        { error: "Al menos un horario es requerido" },
        { status: 400 }
      );
    }

    // Validate time format
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    for (const s of schedules) {
      if (!timeRegex.test(s.time)) {
        return NextResponse.json(
          { error: `Horario inválido: ${s.time}. Usa formato HH:MM` },
          { status: 400 }
        );
      }
    }

    const db = getDb();
    const medId = crypto.randomUUID();

    await db.insert(medications).values({
      id: medId,
      dogId,
      userId: session.userId,
      name: name.trim(),
      dose: dose.trim(),
      notes: notes?.trim() || null,
    });

    // Insert schedules
    for (const s of schedules) {
      await db.insert(medicationSchedules).values({
        id: crypto.randomUUID(),
        medicationId: medId,
        time: s.time,
        daysOfWeek: s.daysOfWeek || "0,1,2,3,4,5,6",
      });
    }

    const [medication] = await db
      .select()
      .from(medications)
      .where(eq(medications.id, medId))
      .limit(1);

    const createdSchedules = await db
      .select()
      .from(medicationSchedules)
      .where(eq(medicationSchedules.medicationId, medId));

    return NextResponse.json(
      { medication: { ...medication, schedules: createdSchedules } },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
