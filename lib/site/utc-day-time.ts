import { DEFAULT_ATTENDANCE_TIME_ZONE } from "@/lib/date/time-zone";
import {
  parseWallClockHm,
  previousCalendarDayKeyInZone,
  zonedWallClockToUtcMillis,
} from "@/lib/site/zoned-schedule";

/** @deprecated Use {@link parseWallClockHm} */
export function parseUtcHm(s: string): { h: number; m: number } | null {
  return parseWallClockHm(s);
}

/**
 * @deprecated Prefer {@link zonedWallClockToUtcMillis} with an explicit zone.
 * Interprets `dayKey` + `hh:mm` in {@link DEFAULT_ATTENDANCE_TIME_ZONE} (fallback when no zone is passed).
 */
export function utcMillisForDayAndHm(dayKey: string, hhmm: string): number | null {
  return zonedWallClockToUtcMillis(dayKey, hhmm, DEFAULT_ATTENDANCE_TIME_ZONE);
}

export function previousUtcDayKey(dayKey: string): string {
  return previousCalendarDayKeyInZone(dayKey, DEFAULT_ATTENDANCE_TIME_ZONE) ?? dayKey;
}

export {
  parseWallClockHm,
  zonedWallClockToUtcMillis,
  previousCalendarDayKeyInZone,
} from "@/lib/site/zoned-schedule";
