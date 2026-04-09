import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  medications,
  medicationSchedules,
  medicationLogs,
  users,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getDogAccess } from "@/lib/db/dog-access";
import { hasPermission } from "@/lib/db/permissions";
import { eq, and, desc, gte } from "drizzle-orm";

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

    // Fetch only active medications
    const activeMeds = await db
      .select()
      .from(medications)
      .where(
        and(eq(medications.dogId, dogId), eq(medications.active, true))
      );

    // Get today's start (midnight) for filtering today's logs
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    // For each medication, get schedules and today's logs
    const medsWithStatus = await Promise.all(
      activeMeds.map(async (med) => {
        const schedules = await db
          .select()
          .from(medicationSchedules)
          .where(eq(medicationSchedules.medicationId, med.id));

        // Get today's logs
        const todayLogs = await db
          .select({
            id: medicationLogs.id,
            scheduledTime: medicationLogs.scheduledTime,
            administeredAt: medicationLogs.administeredAt,
            status: medicationLogs.status,
            userId: medicationLogs.userId,
            userName: users.name,
            notes: medicationLogs.notes,
          })
          .from(medicationLogs)
          .innerJoin(users, eq(medicationLogs.userId, users.id))
          .where(
            and(
              eq(medicationLogs.medicationId, med.id),
              gte(medicationLogs.administeredAt, todayStart)
            )
          )
          .orderBy(desc(medicationLogs.administeredAt));

        // Compute pending and overdue schedules for today
        const currentDay = now.getDay(); // 0=Sun..6=Sat
        const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

        const loggedTimes = new Set(
          todayLogs.map((l) => l.scheduledTime)
        );

        const todaySchedules = schedules.filter((s) =>
          s.daysOfWeek.split(",").map(Number).includes(currentDay)
        );

        let pendingCount = 0;
        let overdueCount = 0;

        for (const s of todaySchedules) {
          if (loggedTimes.has(s.time)) continue; // already logged

          const [h, m] = s.time.split(":").map(Number);
          const scheduleMinutes = h * 60 + m;

          if (scheduleMinutes > currentTimeMinutes) {
            pendingCount++;
          } else {
            overdueCount++;
          }
        }

        return {
          ...med,
          schedules,
          todayLogs,
          pendingCount,
          overdueCount,
        };
      })
    );

    return NextResponse.json({ medications: medsWithStatus, role: access.role });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
