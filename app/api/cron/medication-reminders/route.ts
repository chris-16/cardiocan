import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  medications,
  medicationSchedules,
  pushSubscriptions,
  dogs,
  dogShares,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { sendPushNotification } from "@/lib/push";

/**
 * Cron endpoint to check and send medication reminders.
 * Should be called every minute (or every 5 minutes) by an external cron service.
 * Protected by CRON_SECRET header.
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
    const currentDay = now.getDay(); // 0=Sun..6=Sat
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    // Find all active medication schedules matching current time and day
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
      })
      .from(medicationSchedules)
      .innerJoin(
        medications,
        eq(medicationSchedules.medicationId, medications.id)
      )
      .innerJoin(dogs, eq(medications.dogId, dogs.id))
      .where(
        and(
          eq(medicationSchedules.time, currentTime),
          eq(medications.active, true)
        )
      );

    // Filter by day of week
    const dueSchedules = allSchedules.filter((s) => {
      const days = s.daysOfWeek.split(",").map(Number);
      return days.includes(currentDay);
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
              tag: `med-${schedule.medicationId}-${currentTime}`,
              data: {
                dogId: schedule.dogId,
                medicationId: schedule.medicationId,
                scheduledTime: currentTime,
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
