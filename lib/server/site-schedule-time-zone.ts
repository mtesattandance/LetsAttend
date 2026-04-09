import "server-only";
import { find } from "geo-tz";
import { DEFAULT_ATTENDANCE_TIME_ZONE, normalizeTimeZoneId } from "@/lib/date/time-zone";

/** IANA zone for coordinates (from geographic boundary data). */
export function timeZoneFromLatLng(lat: number, lng: number): string {
  try {
    const zones = find(lat, lng);
    if (zones.length > 0) return normalizeTimeZoneId(zones[0]!);
  } catch {
    /* ignore */
  }
  return DEFAULT_ATTENDANCE_TIME_ZONE;
}

/**
 * Schedule wall-clock times (`workdayStartUtc` / `workdayEndUtc`) use this zone.
 * Prefer stored `scheduleTimeZone`; else derive from site coordinates; else fallback IANA zone.
 */
export function resolveSiteScheduleTimeZone(data: {
  scheduleTimeZone?: unknown;
  latitude?: unknown;
  longitude?: unknown;
}): string {
  const raw = data?.scheduleTimeZone;
  if (typeof raw === "string" && raw.trim()) {
    return normalizeTimeZoneId(raw.trim());
  }
  const lat = Number(data?.latitude);
  const lng = Number(data?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return timeZoneFromLatLng(lat, lng);
  }
  return DEFAULT_ATTENDANCE_TIME_ZONE;
}
