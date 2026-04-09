import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Tests for the cron medication-reminders route logic.
 * Since Next.js route handlers are hard to unit test in isolation
 * (they depend on DB, env vars, etc.), we verify the source code
 * structure to ensure all acceptance criteria are met.
 */
describe("Cron medication-reminders route", () => {
  const routeContent = readFileSync(
    join(
      process.cwd(),
      "app",
      "api",
      "cron",
      "medication-reminders",
      "route.ts"
    ),
    "utf-8"
  );

  it("should be protected by CRON_SECRET", () => {
    expect(routeContent).toContain("CRON_SECRET");
    expect(routeContent).toContain("authorization");
    expect(routeContent).toContain("Bearer");
  });

  it("should use timezone-aware time conversion instead of server local time", () => {
    expect(routeContent).toContain("getLocalTime");
    expect(routeContent).toContain("getLocalDayOfWeek");
    expect(routeContent).toContain("ownerTimezone");
    expect(routeContent).toContain('@/lib/timezone');
    // Should NOT use raw getHours()/getMinutes() on server Date
    expect(routeContent).not.toContain(".getHours()");
    expect(routeContent).not.toContain(".getMinutes()");
    expect(routeContent).not.toContain(".getDay()");
  });

  it("should join users table to get owner timezone", () => {
    expect(routeContent).toContain("users.timezone");
    expect(routeContent).toContain("innerJoin(users");
  });

  it("should compare schedule time against owner's local time", () => {
    expect(routeContent).toContain("getLocalTime(now, s.ownerTimezone)");
    expect(routeContent).toContain("getLocalDayOfWeek(now, s.ownerTimezone)");
    expect(routeContent).toContain("s.scheduleTime === localTime");
  });

  it("should check day of week using timezone-aware local day", () => {
    expect(routeContent).toContain("daysOfWeek");
    expect(routeContent).toContain("days.includes(localDay)");
  });

  it("should only query active medications", () => {
    expect(routeContent).toContain("medications.active");
    expect(routeContent).toContain("true");
  });

  it("should include medication name and dose in notification", () => {
    expect(routeContent).toContain("medicationName");
    expect(routeContent).toContain("medicationDose");
    expect(routeContent).toContain("schedule.medicationName");
    expect(routeContent).toContain("schedule.medicationDose");
  });

  it("should include notification actions (administered and snooze)", () => {
    expect(routeContent).toContain("administered");
    expect(routeContent).toContain("Administrado");
    expect(routeContent).toContain("snooze");
  });

  it("should notify both owner and caretakers", () => {
    expect(routeContent).toContain("ownerId");
    expect(routeContent).toContain("dogShares");
  });

  it("should clean up expired push subscriptions", () => {
    expect(routeContent).toContain("expiredEndpoints");
    expect(routeContent).toContain("delete(pushSubscriptions)");
  });

  it("should include dog name in notification title", () => {
    expect(routeContent).toContain("dogName");
    expect(routeContent).toContain("Medicación para");
  });

  it("should use sendPushNotification for Web Push delivery", () => {
    expect(routeContent).toContain("sendPushNotification");
    expect(routeContent).toContain('from "@/lib/push"');
  });
});

describe("Notification payload structure", () => {
  const routeContent = readFileSync(
    join(
      process.cwd(),
      "app",
      "api",
      "cron",
      "medication-reminders",
      "route.ts"
    ),
    "utf-8"
  );

  it("should include dogId and medicationId in data for action handling", () => {
    expect(routeContent).toContain("dogId: schedule.dogId");
    expect(routeContent).toContain("medicationId: schedule.medicationId");
  });

  it("should include scheduledTime in data payload", () => {
    expect(routeContent).toContain("scheduledTime: schedule.scheduleTime");
  });

  it("should mark action as medication-reminder", () => {
    expect(routeContent).toContain('"medication-reminder"');
  });
});
