// Shared cache module — imported by both the calendar-mode route and admin route
let calendarModeCache: { mode: string; expiresAt: number } | null = null;
export const CALENDAR_MODE_CACHE_TTL_MS = 5 * 60_000;

export function getCalendarModeCache() {
  return calendarModeCache;
}

export function setCalendarModeCache(value: { mode: string; expiresAt: number }) {
  calendarModeCache = value;
}

export function invalidateCalendarModeCache() {
  calendarModeCache = null;
}
