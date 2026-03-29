import type { Firestore } from "firebase-admin/firestore";
import { DateTime } from "luxon";
import { DEFAULT_ATTENDANCE_TIME_ZONE } from "@/lib/date/time-zone";
import { MONTHLY_REGULAR_CAP_HOURS } from "@/lib/attendance/month-hours-cap";
import { buildWorkerDayDetail, type WorkerDayDetailResult } from "./worker-day-detail";

export { MONTHLY_REGULAR_CAP_HOURS };

export type DayCreditedMs = {
  day: string;
  regularSessionMs: number;
  approvedOvertimeMs: number;
  approvedOffsiteMs: number;
  totalMs: number;
};

export function creditedMsFromDayDetail(data: WorkerDayDetailResult): Omit<DayCreditedMs, "day"> {
  const regularSessionMs =
    !data.absent && data.analytics.totalSessionMs != null
      ? Math.max(0, data.analytics.totalSessionMs)
      : 0;
  let approvedOvertimeMs = 0;
  for (const r of data.overtime) {
    if (r.status !== "approved") continue;
    const a = r.overtimeCheckIn?.atMs;
    const b = r.overtimeCheckOut?.atMs;
    if (a != null && b != null && b >= a) approvedOvertimeMs += b - a;
  }
  let approvedOffsiteMs = 0;
  for (const r of data.offsite) {
    if (r.status === "approved" && r.durationMs != null && r.durationMs >= 0) {
      approvedOffsiteMs += r.durationMs;
    }
  }
  const totalMs = regularSessionMs + approvedOvertimeMs + approvedOffsiteMs;
  return { regularSessionMs, approvedOvertimeMs, approvedOffsiteMs, totalMs };
}

export type WorkerMonthWorkingHours = {
  month: string;
  zone: string;
  days: DayCreditedMs[];
  sums: {
    regularSessionMs: number;
    approvedOvertimeMs: number;
    approvedOffsiteMs: number;
    totalMs: number;
  };
  /** Sum of credited time as decimal hours. */
  totalHours: number;
  approvedOffsiteHours: number;
  approvedClockOvertimeHours: number;
  onSiteSessionHours: number;
  /** min(totalHours, 240) */
  regularHoursUpToCap: number;
  /** max(0, totalHours - 240) — monthly overflow treated as overtime. */
  hoursOverCapAsOvertime: number;
};

export async function buildWorkerMonthWorkingHours(
  db: Firestore,
  workerId: string,
  monthYyyyMm: string
): Promise<WorkerMonthWorkingHours> {
  const m = /^(\d{4})-(\d{2})$/.exec(monthYyyyMm.trim());
  if (!m) throw new Error("month must be YYYY-MM");
  const year = Number(m[1]);
  const monthNum = Number(m[2]);
  if (monthNum < 1 || monthNum > 12) throw new Error("Invalid month");

  const z = DEFAULT_ATTENDANCE_TIME_ZONE;
  const start = DateTime.fromObject({ year, month: monthNum, day: 1 }, { zone: z });
  const dim = start.daysInMonth ?? 30;

  const days: DayCreditedMs[] = [];
  const sums = {
    regularSessionMs: 0,
    approvedOvertimeMs: 0,
    approvedOffsiteMs: 0,
    totalMs: 0,
  };

  for (let d = 1; d <= dim; d++) {
    const dayKey = DateTime.fromObject({ year, month: monthNum, day: d }, { zone: z }).toFormat(
      "yyyy-MM-dd"
    );
    const detail = await buildWorkerDayDetail(db, workerId, dayKey);
    const part = creditedMsFromDayDetail(detail);
    days.push({ day: dayKey, ...part });
    sums.regularSessionMs += part.regularSessionMs;
    sums.approvedOvertimeMs += part.approvedOvertimeMs;
    sums.approvedOffsiteMs += part.approvedOffsiteMs;
    sums.totalMs += part.totalMs;
  }

  const totalHours = sums.totalMs / 3_600_000;
  const regularHoursUpToCap = Math.min(totalHours, MONTHLY_REGULAR_CAP_HOURS);
  const hoursOverCapAsOvertime = Math.max(0, totalHours - MONTHLY_REGULAR_CAP_HOURS);

  return {
    month: monthYyyyMm.trim(),
    zone: z,
    days,
    sums,
    totalHours,
    approvedOffsiteHours: sums.approvedOffsiteMs / 3_600_000,
    approvedClockOvertimeHours: sums.approvedOvertimeMs / 3_600_000,
    onSiteSessionHours: sums.regularSessionMs / 3_600_000,
    regularHoursUpToCap,
    hoursOverCapAsOvertime,
  };
}
