import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  dogs,
  respiratoryMeasurements,
  medications,
  medicationSchedules,
  medicationLogs,
  users,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getDogAccess } from "@/lib/db/dog-access";
import { eq, desc } from "drizzle-orm";

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

    // Fetch dog data
    const [dog] = await db
      .select()
      .from(dogs)
      .where(eq(dogs.id, dogId))
      .limit(1);

    // Fetch all measurements with user names
    const measurementRows = await db
      .select({
        id: respiratoryMeasurements.id,
        breathCount: respiratoryMeasurements.breathCount,
        durationSeconds: respiratoryMeasurements.durationSeconds,
        breathsPerMinute: respiratoryMeasurements.breathsPerMinute,
        method: respiratoryMeasurements.method,
        aiConfidence: respiratoryMeasurements.aiConfidence,
        notes: respiratoryMeasurements.notes,
        createdAt: respiratoryMeasurements.createdAt,
        userName: users.name,
      })
      .from(respiratoryMeasurements)
      .leftJoin(users, eq(respiratoryMeasurements.userId, users.id))
      .where(eq(respiratoryMeasurements.dogId, dogId))
      .orderBy(desc(respiratoryMeasurements.createdAt));

    // Fetch all medications with schedules
    const meds = await db
      .select()
      .from(medications)
      .where(eq(medications.dogId, dogId));

    const medsWithSchedulesAndLogs = await Promise.all(
      meds.map(async (med) => {
        const schedules = await db
          .select()
          .from(medicationSchedules)
          .where(eq(medicationSchedules.medicationId, med.id));

        const logs = await db
          .select({
            id: medicationLogs.id,
            scheduledTime: medicationLogs.scheduledTime,
            administeredAt: medicationLogs.administeredAt,
            status: medicationLogs.status,
            notes: medicationLogs.notes,
            userName: users.name,
          })
          .from(medicationLogs)
          .innerJoin(users, eq(medicationLogs.userId, users.id))
          .where(eq(medicationLogs.medicationId, med.id))
          .orderBy(desc(medicationLogs.administeredAt));

        return { ...med, schedules, logs };
      })
    );

    return NextResponse.json({
      dog,
      measurements: measurementRows.map((row) => ({
        ...row,
        userName: row.userName ?? "Usuario desconocido",
      })),
      medications: medsWithSchedulesAndLogs,
    });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
