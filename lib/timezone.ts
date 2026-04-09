/**
 * Timezone utilities for converting UTC to user local time.
 * Uses built-in Intl.DateTimeFormat — no external dependencies.
 */

/**
 * Get the local HH:MM time string for a given UTC Date in a specific timezone.
 */
export function getLocalTime(utcDate: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(utcDate);
  const hour = parts.find((p) => p.type === "hour")!.value;
  const minute = parts.find((p) => p.type === "minute")!.value;
  // Intl may return "24" for midnight in some locales — normalize to "00"
  const normalizedHour = hour === "24" ? "00" : hour;
  return `${normalizedHour}:${minute}`;
}

/**
 * Get the local day of week (0=Sun..6=Sat) for a given UTC Date in a specific timezone.
 */
export function getLocalDayOfWeek(utcDate: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const weekday = formatter.format(utcDate);
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return dayMap[weekday] ?? 0;
}

/**
 * Validate that a timezone string is a valid IANA timezone.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
