import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  respiratoryMeasurements,
  medicationLogs,
  medications,
  users,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getDogAccess } from "@/lib/db/dog-access";
import { eq, and, desc, gte, lte } from "drizzle-orm";

export type TimelineEventType = "measurement" | "medication" | "note";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  timestamp: number | Date;
  userName: string;
  data:
    | {
        breathsPerMinute: number;
        breathCount: number;
        durationSeconds: number;
        method: string;
        aiConfidence: string | null;
        notes: string | null;
      }
    | {
        medicationName: string;
        dose: string;
        status: string;
        scheduledTime: string;
        notes: string | null;
      }
    | {
        measurementId: string;
        breathsPerMinute: number;
        noteText: string;
      };
}

export async function GET(
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
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    const db = getDb();

    // Parse optional query params for date filtering
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from"); // ISO date string
    const to = searchParams.get("to"); // ISO date string

    // Build date filters
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    // Fetch respiratory measurements
    const measurementConditions = [eq(respiratoryMeasurements.dogId, dogId)];
    if (fromDate) {
      measurementConditions.push(
        gte(respiratoryMeasurements.createdAt, fromDate)
      );
    }
    if (toDate) {
      measurementConditions.push(
        lte(respiratoryMeasurements.createdAt, toDate)
      );
    }

    const measurementRows = await db
      .select({
        id: respiratoryMeasurements.id,
        breathsPerMinute: respiratoryMeasurements.breathsPerMinute,
        breathCount: respiratoryMeasurements.breathCount,
        durationSeconds: respiratoryMeasurements.durationSeconds,
        method: respiratoryMeasurements.method,
        aiConfidence: respiratoryMeasurements.aiConfidence,
        notes: respiratoryMeasurements.notes,
        createdAt: respiratoryMeasurements.createdAt,
        userName: users.name,
      })
      .from(respiratoryMeasurements)
      .leftJoin(users, eq(respiratoryMeasurements.userId, users.id))
      .where(and(...measurementConditions))
      .orderBy(desc(respiratoryMeasurements.createdAt));

    // Fetch medication logs (joined with medications for name/dose)
    // First get all medication IDs for this dog
    const dogMeds = await db
      .select({ id: medications.id })
      .from(medications)
      .where(eq(medications.dogId, dogId));

    const medIds = dogMeds.map((m) => m.id);

    let medicationLogRows: Array<{
      id: string;
      medicationName: string;
      dose: string;
      status: string;
      scheduledTime: string;
      notes: string | null;
      administeredAt: Date;
      userName: string | null;
    }> = [];

    if (medIds.length > 0) {
      // Fetch logs for each medication (SQLite doesn't have great IN support in drizzle)
      const allLogs = [];
      for (const medId of medIds) {
        const logConditions = [eq(medicationLogs.medicationId, medId)];
        if (fromDate) {
          logConditions.push(gte(medicationLogs.administeredAt, fromDate));
        }
        if (toDate) {
          logConditions.push(lte(medicationLogs.administeredAt, toDate));
        }

        const logs = await db
          .select({
            id: medicationLogs.id,
            medicationName: medications.name,
            dose: medications.dose,
            status: medicationLogs.status,
            scheduledTime: medicationLogs.scheduledTime,
            notes: medicationLogs.notes,
            administeredAt: medicationLogs.administeredAt,
            userName: users.name,
          })
          .from(medicationLogs)
          .innerJoin(
            medications,
            eq(medicationLogs.medicationId, medications.id)
          )
          .leftJoin(users, eq(medicationLogs.userId, users.id))
          .where(and(...logConditions));

        allLogs.push(...logs);
      }
      medicationLogRows = allLogs;
    }

    // Build unified timeline
    const events: TimelineEvent[] = [];

    // Add measurement events
    for (const row of measurementRows) {
      events.push({
        id: `m-${row.id}`,
        type: "measurement",
        timestamp: row.createdAt,
        userName: row.userName ?? "Usuario desconocido",
        data: {
          breathsPerMinute: row.breathsPerMinute,
          breathCount: row.breathCount,
          durationSeconds: row.durationSeconds,
          method: row.method,
          aiConfidence: row.aiConfidence,
          notes: row.notes,
        },
      });

      // Add note events for measurements that have notes
      if (row.notes) {
        events.push({
          id: `n-${row.id}`,
          type: "note",
          timestamp: row.createdAt,
          userName: row.userName ?? "Usuario desconocido",
          data: {
            measurementId: row.id,
            breathsPerMinute: row.breathsPerMinute,
            noteText: row.notes,
          },
        });
      }
    }

    // Add medication log events
    for (const row of medicationLogRows) {
      events.push({
        id: `med-${row.id}`,
        type: "medication",
        timestamp: row.administeredAt,
        userName: row.userName ?? "Usuario desconocido",
        data: {
          medicationName: row.medicationName,
          dose: row.dose,
          status: row.status,
          scheduledTime: row.scheduledTime,
          notes: row.notes,
        },
      });
    }

    // Sort all events by timestamp descending
    events.sort((a, b) => {
      const tsA =
        typeof a.timestamp === "number"
          ? a.timestamp
          : new Date(a.timestamp).getTime();
      const tsB =
        typeof b.timestamp === "number"
          ? b.timestamp
          : new Date(b.timestamp).getTime();
      return tsB - tsA;
    });

    return NextResponse.json({ events });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
