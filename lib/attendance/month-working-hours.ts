import type { Firestore } from "firebase-admin/firestore";
import { DateTime } from "luxon";
import { timeZoneFromUserSnapshot } from "@/lib/attendance/time-zone-from-snap";
import { MONTHLY_REGULAR_CAP_HOURS } from "@/lib/attendance/month-hours-cap";
import { buildWorkerDayDetail, type WorkerDayDetailResult } from "./worker-day-detail";
import { type CalendarMode, bsMonthDays, bsIsoToAdIso } from "@/lib/date/bs-calendar";
import { from24hUtc } from "@/lib/time/utc-12h";

function hm24to12(hm: string): string {
  if (!hm || !/^\d{1,2}:\d{2}$/.test(hm.trim())) return hm;
  const { h12, m, ap } = from24hUtc(hm.trim());
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

export { MONTHLY_REGULAR_CAP_HOURS };

export type DayCreditedMs = {
  day: string;
  regularSessionMs: number;
  approvedOvertimeMs: number;
  approvedOffsiteMs: number;
  totalMs: number;
};

export type DayEntryRow = {
  id: string;
  day: string;
  kind: "on_site" | "overtime" | "off_site";
  inTime: string;
  outTime: string;
  dutyHours: number;
  workPlace: string;
  /** Site shift window for on-site rows (e.g. 9:00 AM – 5:00 PM); "—" when not applicable. */
  schedule: string;
  remark: string;
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
  entries: DayEntryRow[];
  worker: {
    id: string;
    employeeId: string | null;
    name: string | null;
    designation: string | null;
  };
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

function hmFromMs(ms: number | null, zone: string): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
  return DateTime.fromMillis(ms, { zone }).toFormat("h:mm a");
}

function hoursFromMs(ms: number): number {
  return Math.max(0, ms) / 3_600_000;
}

function buildDayEntryRows(day: string, zone: string, data: WorkerDayDetailResult): DayEntryRow[] {
  const rows: DayEntryRow[] = [];
  if (!data.absent) {
    const segments = data.analytics.segments ?? [];
    if (segments.length > 0) {
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i]!;
        const ms = s.durationMs;
        rows.push({
          id: `${day}-on-${i}`,
          day,
          kind: "on_site",
          inTime: hmFromMs(s.startMs, zone),
          outTime: hmFromMs(s.endMs, zone),
          dutyHours: hoursFromMs(ms),
          workPlace: s.siteName || s.siteId || "On-site",
          schedule: s.workScheduleLabel ?? "—",
          remark: "On-site session",
        });
      }
    } else {
      const start = data.checkIn?.atMs ?? null;
      const end = data.checkOut?.atMs ?? null;
      const ms = start != null && end != null && end >= start ? end - start : 0;
      rows.push({
        id: `${day}-on-0`,
        day,
        kind: "on_site",
        inTime: hmFromMs(start, zone),
        outTime: hmFromMs(end, zone),
        dutyHours: hoursFromMs(ms),
        workPlace: data.currentSiteName || data.currentSiteId || "On-site",
        schedule: "—",
        remark: "On-site session",
      });
    }
  }
  for (let i = 0; i < data.overtime.length; i++) {
    const r = data.overtime[i]!;
    if (r.status !== "approved") continue;
    const start = r.overtimeCheckIn?.atMs ?? null;
    const end = r.overtimeCheckOut?.atMs ?? null;
    const ms = start != null && end != null && end >= start ? end - start : 0;
    rows.push({
      id: `${day}-ot-${r.id}`,
      day,
      kind: "overtime",
      inTime: hmFromMs(start, zone),
      outTime: hmFromMs(end, zone),
      dutyHours: hoursFromMs(ms),
      workPlace: r.siteName || r.siteId || "Overtime",
      schedule: "—",
      remark: "Approved overtime",
    });
  }
  for (let i = 0; i < data.offsite.length; i++) {
    const r = data.offsite[i]!;
    if (r.status !== "approved") continue;
    const hmStart = r.approvedStartHm || r.requestedStartHm;
    const hmEnd = r.approvedEndHm || r.requestedEndHm;
    const ms = r.durationMs ?? 0;
    rows.push({
      id: `${day}-off-${r.id}`,
      day,
      kind: "off_site",
      inTime: hmStart ? hm24to12(hmStart) : "—",
      outTime: hmEnd ? hm24to12(hmEnd) : "—",
      dutyHours: hoursFromMs(ms),
      workPlace: "Off-site",
      schedule: "—",
      remark: "Approved off-site",
    });
  }
  if (rows.length === 0) {
    rows.push({
      id: `${day}-none`,
      day,
      kind: "on_site",
      inTime: "—",
      outTime: "—",
      dutyHours: 0,
      workPlace: "—",
      schedule: "—",
      remark: "No work entry",
    });
  }
  return rows;
}

export async function buildWorkerMonthWorkingHours(
  db: Firestore,
  workerId: string,
  monthYyyyMm: string,
  mode: CalendarMode = "ad"
): Promise<WorkerMonthWorkingHours> {
  const m = /^(\d{4})-(\d{2})$/.exec(monthYyyyMm.trim());
  if (!m) throw new Error("month must be YYYY-MM");
  const year = Number(m[1]);
  const monthNum = Number(m[2]);
  if (monthNum < 1 || monthNum > 12) throw new Error("Invalid month");

  const userDoc = await db.collection("users").doc(workerId).get();
  const z = timeZoneFromUserSnapshot(userDoc);
  const dayKeys: string[] = [];

  if (mode === "bs") {
    const dim = bsMonthDays(year, monthNum);
    const pad2 = (n: number) => String(n).padStart(2, "0");
    for (let i = 1; i <= dim; i++) {
      const bsIso = `${year}-${pad2(monthNum)}-${pad2(i)}`;
      dayKeys.push(bsIsoToAdIso(bsIso));
    }
  } else {
    const start = DateTime.fromObject({ year, month: monthNum, day: 1 }, { zone: z });
    const dim = start.daysInMonth ?? 30;
    for (let i = 1; i <= dim; i++) {
      dayKeys.push(
        DateTime.fromObject({ year, month: monthNum, day: i }, { zone: z }).toFormat("yyyy-MM-dd")
      );
    }
  }

  const days: DayCreditedMs[] = [];
  const entries: DayEntryRow[] = [];
  const sums = {
    regularSessionMs: 0,
    approvedOvertimeMs: 0,
    approvedOffsiteMs: 0,
    totalMs: 0,
  };

  const dayDetails = await Promise.all(dayKeys.map((dayKey) => buildWorkerDayDetail(db, workerId, dayKey)));

  for (let i = 0; i < dayKeys.length; i++) {
    const dayKey = dayKeys[i]!;
    const detail = dayDetails[i]!;
    const part = creditedMsFromDayDetail(detail);
    days.push({ day: dayKey, ...part });
    entries.push(...buildDayEntryRows(dayKey, z, detail));
    sums.regularSessionMs += part.regularSessionMs;
    sums.approvedOvertimeMs += part.approvedOvertimeMs;
    sums.approvedOffsiteMs += part.approvedOffsiteMs;
    sums.totalMs += part.totalMs;
  }

  const totalHours = sums.totalMs / 3_600_000;
  const regularHoursUpToCap = Math.min(totalHours, MONTHLY_REGULAR_CAP_HOURS);
  const hoursOverCapAsOvertime = Math.max(0, totalHours - MONTHLY_REGULAR_CAP_HOURS);

  const employeeIdRaw =
    (typeof userDoc.get("employeeId") === "string" && userDoc.get("employeeId")) ||
    (typeof userDoc.get("employeeCode") === "string" && userDoc.get("employeeCode")) ||
    (typeof userDoc.get("employeeNumber") === "string" && userDoc.get("employeeNumber")) ||
    null;
  const workerMeta = {
    id: workerId,
    employeeId: employeeIdRaw,
    name: typeof userDoc.get("name") === "string" ? (userDoc.get("name") as string) : null,
    designation:
      typeof userDoc.get("designation") === "string" ? (userDoc.get("designation") as string) : null,
  };

  return {
    month: monthYyyyMm.trim(),
    zone: z,
    days,
    entries,
    worker: workerMeta,
    sums,
    totalHours,
    approvedOffsiteHours: sums.approvedOffsiteMs / 3_600_000,
    approvedClockOvertimeHours: sums.approvedOvertimeMs / 3_600_000,
    onSiteSessionHours: sums.regularSessionMs / 3_600_000,
    regularHoursUpToCap,
    hoursOverCapAsOvertime,
  };
}
