/** Attendance day key (UTC). Swap for org timezone later if needed. */
export function attendanceDayKeyUTC(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
