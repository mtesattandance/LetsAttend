import { DEFAULT_ATTENDANCE_TIME_ZONE, normalizeTimeZoneId } from "@/lib/date/time-zone";

/** Client: site list from GET /api/sites includes resolved `scheduleTimeZone`. */
export function scheduleZoneForSite(site: { scheduleTimeZone?: string } | undefined): string {
  return normalizeTimeZoneId(site?.scheduleTimeZone) || DEFAULT_ATTENDANCE_TIME_ZONE;
}
