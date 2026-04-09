import { DateTime, IANAZone } from "luxon";

/**
 * Fallback IANA zone when none is stored or invalid. Prefer each user’s `users.timeZone`
 * (synced from the device), site `scheduleTimeZone`, or the browser zone on the client.
 */
export const DEFAULT_ATTENDANCE_TIME_ZONE = "Asia/Kolkata";

/** Returns a valid IANA zone id, or {@link DEFAULT_ATTENDANCE_TIME_ZONE}. */
export function normalizeTimeZoneId(raw: string | undefined | null): string {
  if (typeof raw !== "string") return DEFAULT_ATTENDANCE_TIME_ZONE;
  const z = raw.trim();
  if (!z) return DEFAULT_ATTENDANCE_TIME_ZONE;
  return IANAZone.isValidZone(z) ? z : DEFAULT_ATTENDANCE_TIME_ZONE;
}

/**
 * Client-only: browser/OS time zone (IANA id).
 * Used to seed and sync `users.timeZone`.
 */
export function getBrowserTimeZone(): string {
  if (typeof Intl === "undefined") return DEFAULT_ATTENDANCE_TIME_ZONE;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return normalizeTimeZoneId(tz);
  } catch {
    return DEFAULT_ATTENDANCE_TIME_ZONE;
  }
}

/** Short UI label for a zone (offset / abbreviation), no country-specific branding. */
export function workTimeZoneUiLabel(tz: string): string {
  const z = normalizeTimeZoneId(tz);
  return DateTime.now().setZone(z).toFormat("ZZZZ");
}
