"use client";

import { useEffect } from "react";

/**
 * Invisible component that auto-detects the user's timezone
 * and syncs it to the server on mount (if it differs from stored value).
 * Runs once per page load — lightweight PATCH only when needed.
 */
export default function TimezoneSync() {
  useEffect(() => {
    async function syncTimezone() {
      try {
        const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!detectedTz) return;

        // Check if server already has the correct timezone
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) return; // Not logged in

        const { user } = await meRes.json();
        if (user.timezone === detectedTz) return; // Already correct

        // Update server with detected timezone
        await fetch("/api/auth/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timezone: detectedTz }),
        });
      } catch {
        // Silent fail — timezone sync is best-effort
      }
    }

    syncTimezone();
  }, []);

  return null;
}
