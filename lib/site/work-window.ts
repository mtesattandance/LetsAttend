import { DateTime } from "luxon";
import { zonedWallClockToUtcMillis } from "@/lib/site/zoned-schedule";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Minutes before shift start when regular check-in opens */
const CHECK_IN_BEFORE_MS = 15 * 60 * 1000;
/** Minutes after shift start when regular check-in closes (inclusive at boundary) */
const CHECK_IN_AFTER_MS = 15 * 60 * 1000;

const HM_RE = /^(\d{1,2}):(\d{2})$/;

function wallHmToMsToday(hm: string, zone: string, nowMs: number): number | null {
  const match = HM_RE.exec(hm.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  try {
    return DateTime.fromMillis(nowMs, { zone })
      .set({ hour: h, minute: m, second: 0, millisecond: 0 })
      .toMillis();
  } catch {
    return null;
  }
}

/** null = no window configured, 'early' = before check-in opens, 'open' = allowed, 'missed_check_in' = after check-in window but before shift end, 'late' = after shift end */
export type WorkWindow = "early" | "open" | "missed_check_in" | "late" | null;

export const DEFAULT_CHECKOUT_GRACE_MINUTES = 30;

export type CheckoutWindowState = "no_schedule" | "too_early" | "open" | "too_late";

/**
 * Whether regular check-in is allowed now from wall-clock schedule fields in `scheduleZone`.
 * With both start and end: allowed from 15 minutes before start through 15 minutes after start (inclusive).
 */
export function computeWorkWindow(opts: {
  workdayStartUtc?: string | null;
  workdayEndUtc?: string | null;
  scheduleZone: string;
  nowMs: number;
}): WorkWindow {
  const { scheduleZone: zone, nowMs } = opts;
  const startRaw =
    typeof opts.workdayStartUtc === "string" && opts.workdayStartUtc.trim()
      ? opts.workdayStartUtc.trim()
      : null;
  const endRaw =
    typeof opts.workdayEndUtc === "string" && opts.workdayEndUtc.trim()
      ? opts.workdayEndUtc.trim()
      : null;

  const startMs = startRaw ? wallHmToMsToday(startRaw, zone, nowMs) : null;
  const endMs = endRaw ? wallHmToMsToday(endRaw, zone, nowMs) : null;
  const now = nowMs;

  if (endMs != null && now >= endMs) {
    return "late";
  }

  if (startMs != null && now < startMs - CHECK_IN_BEFORE_MS) {
    const yesterdayEndMs = endMs != null ? endMs - DAY_MS : null;
    if (
      yesterdayEndMs != null &&
      now >= yesterdayEndMs &&
      now - yesterdayEndMs < startMs - CHECK_IN_BEFORE_MS - now
    ) {
      return "late";
    }
    return "early";
  }

  if (startMs != null && endMs != null && now > startMs + CHECK_IN_AFTER_MS) {
    return "missed_check_in";
  }

  if (startMs != null || endMs != null) {
    return "open";
  }
  return null;
}

/**
 * Manual check-out is only allowed from scheduled shift end through end + grace (wall clock on `attendanceDay` in `scheduleZone`).
 */
export function computeCheckoutWindowState(opts: {
  workdayEndUtc?: string | null;
  scheduleZone: string;
  attendanceDay: string;
  checkoutGraceMinutes: number;
  nowMs: number;
}): CheckoutWindowState {
  const endHm =
    typeof opts.workdayEndUtc === "string" && opts.workdayEndUtc.trim()
      ? opts.workdayEndUtc.trim()
      : null;
  if (!endHm) return "no_schedule";

  const deadline = zonedWallClockToUtcMillis(opts.attendanceDay, endHm, opts.scheduleZone);
  if (deadline == null) return "no_schedule";

  const graceMin =
    Number.isFinite(opts.checkoutGraceMinutes) && opts.checkoutGraceMinutes > 0
      ? opts.checkoutGraceMinutes
      : DEFAULT_CHECKOUT_GRACE_MINUTES;
  const graceMs = graceMin * 60_000;
  const n = opts.nowMs;
  if (n < deadline) return "too_early";
  if (n > deadline + graceMs) return "too_late";
  return "open";
}
