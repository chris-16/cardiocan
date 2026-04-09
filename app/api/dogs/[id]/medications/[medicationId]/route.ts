import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  medications,
  medicationSchedules,
  medicationLogs,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getDogAccess } from "@/lib/db/dog-access";
import { hasPermission } from "@/lib/db/permissions";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

type RouteParams = { params: Promise<{ id: string; medicationId: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: dogId, medicationId } = await params;
    const access = await getDogAccess(dogId, session.userId);
    if (!access) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    if (!hasPermission(access.role, "medication:manage")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }

    const db = getDb();

    // Verify medication belongs to this dog
    const [med] = await db
      .select()
      .from(medications)
      .where(
        and(eq(medications.id, medicationId), eq(medications.dogId, dogId))
      )
      .limit(1);

    if (!med) {
      return NextResponse.json(
        { error: "Medicamento no encontrado" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, dose, notes, active, schedules } = body;

    await db
      .update(medications)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(dose !== undefined && { dose: dose.trim() }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(active !== undefined && { active }),
        updatedAt: new Date(),
      })
      .where(eq(medications.id, medicationId));

    // Update schedules if provided
    if (schedules) {
      // Delete existing schedules and recreate
      await db
        .delete(medicationSchedules)
        .where(eq(medicationSchedules.medicationId, medicationId));

      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      for (const s of schedules) {
        if (!timeRegex.test(s.time)) {
          return NextResponse.json(
            { error: `Horario inválido: ${s.time}` },
            { status: 400 }
          );
        }
        await db.insert(medicationSchedules).values({
          id: crypto.randomUUID(),
          medicationId,
          time: s.time,
          daysOfWeek: s.daysOfWeek || "0,1,2,3,4,5,6",
        });
      }
    }

    const [updated] = await db
      .select()
      .from(medications)
      .where(eq(medications.id, medicationId))
      .limit(1);

    const updatedSchedules = await db
      .select()
      .from(medicationSchedules)
      .where(eq(medicationSchedules.medicationId, medicationId));

    return NextResponse.json({
      medication: { ...updated, schedules: updatedSchedules },
    });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: dogId, medicationId } = await params;
    const access = await getDogAccess(dogId, session.userId);
    if (!access) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    if (!hasPermission(access.role, "medication:manage")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }

    const db = getDb();

    const [med] = await db
      .select()
      .from(medications)
      .where(
        and(eq(medications.id, medicationId), eq(medications.dogId, dogId))
      )
      .limit(1);

    if (!med) {
      return NextResponse.json(
        { error: "Medicamento no encontrado" },
        { status: 404 }
      );
    }

    await db.delete(medications).where(eq(medications.id, medicationId));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// POST = log medication administration
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: dogId, medicationId } = await params;
    const access = await getDogAccess(dogId, session.userId);
    if (!access) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    if (!hasPermission(access.role, "medication:log")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }

    const db = getDb();

    const [med] = await db
      .select()
      .from(medications)
      .where(
        and(eq(medications.id, medicationId), eq(medications.dogId, dogId))
      )
      .limit(1);

    if (!med) {
      return NextResponse.json(
        { error: "Medicamento no encontrado" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { scheduledTime, status, notes } = body;

    const logId = crypto.randomUUID();
    await db.insert(medicationLogs).values({
      id: logId,
      medicationId,
      userId: session.userId,
      scheduledTime: scheduledTime || "manual",
      status: status || "administered",
      notes: notes?.trim() || null,
    });

    const [log] = await db
      .select()
      .from(medicationLogs)
      .where(eq(medicationLogs.id, logId))
      .limit(1);

    return NextResponse.json({ log }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
