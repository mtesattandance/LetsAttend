import { DateTime } from "luxon";
import { DEFAULT_ATTENDANCE_TIME_ZONE, normalizeTimeZoneId } from "@/lib/date/time-zone";

/**
 * Calendar date `YYYY-MM-DD` for the instant `now`, in the given IANA timezone (not UTC).
 */
export function calendarDateKeyInTimeZone(now: Date, timeZone: string): string {
  const tz = normalizeTimeZoneId(timeZone);
  return DateTime.fromJSDate(now, { zone: "utc" }).setZone(tz).toFormat("yyyy-LL-dd");
}

/** Last `count` calendar days in `timeZone`, newest first (index 0 = today there). */
export function lastNCalendarDayKeysInTimeZone(
  count: number,
  timeZone: string,
  now = new Date()
): string[] {
  const tz = normalizeTimeZoneId(timeZone);
  const keys: string[] = [];
  const base = DateTime.fromJSDate(now, { zone: "utc" }).setZone(tz);
  for (let i = 0; i < count; i++) {
    keys.push(base.minus({ days: i }).toFormat("yyyy-LL-dd"));
  }
  return keys;
}

/**
 * Union of recent calendar days in several zones (covers mixed users / migration).
 * Capped for Firestore `in` queries (max 10 values).
 */
export function recentAttendanceDayKeysForQuery(now = new Date(), maxKeys = 10): string[] {
  const fallback = lastNCalendarDayKeysInTimeZone(8, DEFAULT_ATTENDANCE_TIME_ZONE, now);
  const utc = lastNCalendarDayKeysInTimeZone(8, "UTC", now);
  const merged = [...new Set([...fallback, ...utc])].sort((a, b) => b.localeCompare(a));
  return merged.slice(0, maxKeys);
}

/** @deprecated Use {@link calendarDateKeyInTimeZone} with an explicit zone. */
export function attendanceDayKeyUTC(d = new Date()): string {
  return calendarDateKeyInTimeZone(d, "UTC");
}
