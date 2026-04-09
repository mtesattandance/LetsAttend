import { DateTime } from "luxon";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";

/** Parse 24h `HH:mm` wall-clock (used with a specific IANA zone, not “UTC-only”). */
export function parseWallClockHm(s: string): { h: number; m: number } | null {
  const t = s.trim();
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

/**
 * UTC instant for `dayKey` (`YYYY-MM-DD`) at local `hh:mm` on that **calendar day**
 * in `timeZone` (wall clock in that zone, not UTC).
 */
export function zonedWallClockToUtcMillis(
  dayKey: string,
  hhmm: string,
  timeZone: string
): number | null {
  const hm = parseWallClockHm(hhmm);
  if (!hm) return null;
  const parts = dayKey.split("-").map(Number);
  if (parts.length !== 3) return null;
  const [y, mo, d] = parts;
  if (!y || !mo || !d) return null;
  const tz = normalizeTimeZoneId(timeZone);
  const dt = DateTime.fromObject(
    { year: y, month: mo, day: d, hour: hm.h, minute: hm.m, second: 0, millisecond: 0 },
    { zone: tz }
  );
  if (!dt.isValid) return null;
  return dt.toMillis();
}

/** Previous calendar day as `YYYY-MM-DD` in the same zone (for rollovers). */
export function previousCalendarDayKeyInZone(dayKey: string, timeZone: string): string | null {
  const parts = dayKey.split("-").map(Number);
  if (parts.length !== 3) return null;
  const [y, mo, d] = parts;
  if (!y || !mo || !d) return null;
  const tz = normalizeTimeZoneId(timeZone);
  const dt = DateTime.fromObject({ year: y, month: mo, day: d }, { zone: tz }).minus({ days: 1 });
  if (!dt.isValid) return null;
  return dt.toFormat("yyyy-LL-dd");
}
