import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { medications, medicationLogs, users } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getDogAccess } from "@/lib/db/dog-access";
import { hasPermission } from "@/lib/db/permissions";
import { eq, and, desc } from "drizzle-orm";

type RouteParams = { params: Promise<{ id: string; medicationId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
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

    if (!hasPermission(access.role, "medication:read")) {
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

    // Fetch logs with user names, ordered by most recent first
    const logs = await db
      .select({
        id: medicationLogs.id,
        medicationId: medicationLogs.medicationId,
        userId: medicationLogs.userId,
        userName: users.name,
        scheduledTime: medicationLogs.scheduledTime,
        administeredAt: medicationLogs.administeredAt,
        status: medicationLogs.status,
        notes: medicationLogs.notes,
      })
      .from(medicationLogs)
      .innerJoin(users, eq(medicationLogs.userId, users.id))
      .where(eq(medicationLogs.medicationId, medicationId))
      .orderBy(desc(medicationLogs.administeredAt));

    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
