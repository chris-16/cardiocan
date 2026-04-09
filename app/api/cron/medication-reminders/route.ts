import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  medications,
  medicationSchedules,
  pushSubscriptions,
  dogs,
  dogShares,
  users,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { sendPushNotification } from "@/lib/push";
import { getLocalTime, getLocalDayOfWeek } from "@/lib/timezone";

/**
 * Cron endpoint to check and send medication reminders.
 * Should be called every minute (or every 5 minutes) by an external cron service.
 * Protected by CRON_SECRET header.
 *
 * Timezone handling: medication schedules are stored in the user's local time (HH:MM).
 * This route converts the current UTC time to each dog owner's timezone before matching.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const db = getDb();
    const now = new Date();

    // Fetch all active medication schedules with owner timezone
    const allSchedules = await db
      .select({
        scheduleId: medicationSchedules.id,
        scheduleTime: medicationSchedules.time,
        daysOfWeek: medicationSchedules.daysOfWeek,
        medicationId: medications.id,
        medicationName: medications.name,
        medicationDose: medications.dose,
        dogId: dogs.id,
        dogName: dogs.name,
        ownerId: dogs.userId,
        ownerTimezone: users.timezone,
      })
      .from(medicationSchedules)
      .innerJoin(
        medications,
        eq(medicationSchedules.medicationId, medications.id)
      )
      .innerJoin(dogs, eq(medications.dogId, dogs.id))
      .innerJoin(users, eq(dogs.userId, users.id))
      .where(eq(medications.active, true));

    // Filter schedules by comparing schedule time against the owner's local time
    const dueSchedules = allSchedules.filter((s) => {
      const localTime = getLocalTime(now, s.ownerTimezone);
      const localDay = getLocalDayOfWeek(now, s.ownerTimezone);
      const days = s.daysOfWeek.split(",").map(Number);
      return s.scheduleTime === localTime && days.includes(localDay);
    });

    if (dueSchedules.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    let totalSent = 0;
    const expiredEndpoints: string[] = [];

    for (const schedule of dueSchedules) {
      // Get all users who should be notified: owner + caretakers
      const userIds = new Set<string>();
      userIds.add(schedule.ownerId);

      const shares = await db
        .select({ userId: dogShares.userId })
        .from(dogShares)
        .where(eq(dogShares.dogId, schedule.dogId));

      for (const share of shares) {
        userIds.add(share.userId);
      }

      // Get push subscriptions for all relevant users
      for (const userId of userIds) {
        const subs = await db
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, userId));

        for (const sub of subs) {
          const success = await sendPushNotification(
            {
              endpoint: sub.endpoint,
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
            {
              title: `💊 Medicación para ${schedule.dogName}`,
              body: `${schedule.medicationName} — ${schedule.medicationDose}`,
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              tag: `med-${schedule.medicationId}-${schedule.scheduleTime}`,
              data: {
                dogId: schedule.dogId,
                medicationId: schedule.medicationId,
                scheduledTime: schedule.scheduleTime,
                action: "medication-reminder",
              },
              actions: [
                { action: "administered", title: "✅ Administrado" },
                { action: "snooze", title: "⏰ Recordar en 10min" },
              ],
            }
          );

          if (success) {
            totalSent++;
          } else {
            expiredEndpoints.push(sub.endpoint);
          }
        }
      }
    }

    // Clean up expired subscriptions
    for (const endpoint of expiredEndpoints) {
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint));
    }

    return NextResponse.json({
      sent: totalSent,
      cleaned: expiredEndpoints.length,
      schedules: dueSchedules.length,
    });
  } catch (error) {
    console.error("Cron medication-reminders error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
