import { describe, it, expect } from "vitest";
import { getLocalTime, getLocalDayOfWeek, isValidTimezone } from "@/lib/timezone";

describe("getLocalTime", () => {
  it("should convert UTC midnight to Santiago time (UTC-3 or UTC-4)", () => {
    // 2024-01-15 00:00 UTC = 2024-01-14 21:00 Chile Summer Time (UTC-3)
    const utcMidnight = new Date("2024-01-15T00:00:00Z");
    const santiagoTime = getLocalTime(utcMidnight, "America/Santiago");
    // Chile is UTC-3 in January (summer time)
    expect(santiagoTime).toBe("21:00");
  });

  it("should convert UTC noon to Santiago time", () => {
    // 2024-01-15 12:00 UTC = 2024-01-15 09:00 Chile Summer Time (UTC-3)
    const utcNoon = new Date("2024-01-15T12:00:00Z");
    const santiagoTime = getLocalTime(utcNoon, "America/Santiago");
    expect(santiagoTime).toBe("09:00");
  });

  it("should handle different timezones correctly", () => {
    // 2024-01-15 15:00 UTC
    const utcTime = new Date("2024-01-15T15:00:00Z");

    // UTC itself
    const utcLocal = getLocalTime(utcTime, "UTC");
    expect(utcLocal).toBe("15:00");

    // New York (UTC-5 in January)
    const nyTime = getLocalTime(utcTime, "America/New_York");
    expect(nyTime).toBe("10:00");

    // Tokyo (UTC+9)
    const tokyoTime = getLocalTime(utcTime, "Asia/Tokyo");
    expect(tokyoTime).toBe("00:00");
  });

  it("should return HH:MM with zero-padded hours and minutes", () => {
    // 2024-07-15 05:05 UTC = same in UTC
    const earlyMorning = new Date("2024-07-15T05:05:00Z");
    const utcTime = getLocalTime(earlyMorning, "UTC");
    expect(utcTime).toBe("05:05");
  });

  it("should handle day boundary crossings", () => {
    // 2024-01-15 03:00 UTC = 2024-01-15 00:00 Chile Summer Time (UTC-3)
    const utcTime = new Date("2024-01-15T03:00:00Z");
    const santiagoTime = getLocalTime(utcTime, "America/Santiago");
    expect(santiagoTime).toBe("00:00");
  });
});

describe("getLocalDayOfWeek", () => {
  it("should return correct day of week for Santiago timezone", () => {
    // 2024-01-15 (Monday) 02:00 UTC = 2024-01-14 (Sunday) 23:00 Santiago
    const utcTime = new Date("2024-01-15T02:00:00Z");
    const santiagoDay = getLocalDayOfWeek(utcTime, "America/Santiago");
    expect(santiagoDay).toBe(0); // Sunday
  });

  it("should return correct day when UTC and local are the same day", () => {
    // 2024-01-15 (Monday) 15:00 UTC = 2024-01-15 (Monday) 12:00 Santiago
    const utcTime = new Date("2024-01-15T15:00:00Z");
    const santiagoDay = getLocalDayOfWeek(utcTime, "America/Santiago");
    expect(santiagoDay).toBe(1); // Monday
  });

  it("should handle positive UTC offset (day ahead)", () => {
    // 2024-01-14 (Sunday) 23:00 UTC = 2024-01-15 (Monday) 08:00 Tokyo
    const utcTime = new Date("2024-01-14T23:00:00Z");
    const tokyoDay = getLocalDayOfWeek(utcTime, "Asia/Tokyo");
    expect(tokyoDay).toBe(1); // Monday
  });
});

describe("isValidTimezone", () => {
  it("should accept valid IANA timezones", () => {
    expect(isValidTimezone("America/Santiago")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Asia/Tokyo")).toBe(true);
    expect(isValidTimezone("Europe/London")).toBe(true);
  });

  it("should reject invalid timezone strings", () => {
    expect(isValidTimezone("Invalid/Timezone")).toBe(false);
    expect(isValidTimezone("Not_A_Zone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("GMT+5")).toBe(false);
  });
});
