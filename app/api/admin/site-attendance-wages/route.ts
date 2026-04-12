import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { DateTime } from "luxon";
import { bsMonthDays, bsIsoToAdIso } from "@/lib/date/bs-calendar";

export const runtime = "nodejs";

const qSchema = z.object({
  siteId: z.string().min(1),
  period: z.enum(["day", "month"]),
  value:  z.string().min(4), // YYYY-MM-DD (day) | YYYY-MM in active mode (month)
  mode:   z.enum(["ad", "bs"]).optional().default("ad"),
});

export type WagesWorkerRow = {
  workerId:     string;
  name:         string;
  employeeId:   string | null;
  inTime:       string;
  outTime:      string;
  dutyHours:    number;
  wagesPerDay:  number | null;
  wagesPerHour: number | null;
  overtimeRate: number | null;
  totalAmount:  number | null;
};

export type WagesDayGroup = {
  date:          string;
  workers:       WagesWorkerRow[];
  totalManpower: number;
  totalAmount:   number | null;
};

export type SiteAttendanceWagesResponse = {
  siteId:       string;
  siteName:     string;
  siteLocation: string | null;
  period:       "day" | "month";
  value:        string;
  days:         WagesDayGroup[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract ms from a Firestore Timestamp-like object or plain { seconds } */
function timeToMs(t: unknown): number | null {
  if (!t || typeof t !== "object") return null;
  const o = t as Record<string, unknown>;
  if (typeof o.seconds  === "number") return o.seconds  * 1000;
  if (typeof o._seconds === "number") return o._seconds * 1000;
  return null;
}

function hmFromMs(ms: number | null, zone: string): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
  return DateTime.fromMillis(ms, { zone }).toFormat("h:mm a");
}

function calcTotal(dutyHours: number, wagesPerHour: number, otRate: number): number {
  const regular = Math.min(dutyHours, 8);
  const ot      = Math.max(0, dutyHours - 8);
  return regular * wagesPerHour + ot * otRate;
}

/** Build AD ISO date list for a month in AD or BS calendar mode. */
function buildMonthDates(value: string, mode: "ad" | "bs"): string[] | null {
  const [yStr, mStr] = value.split("-");
  const y = Number(yStr), m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  const pad = (n: number) => String(n).padStart(2, "0");

  if (mode === "bs") {
    const dim = bsMonthDays(y, m);
    const out: string[] = [];
    for (let d = 1; d <= dim; d++) {
      try { out.push(bsIsoToAdIso(`${y}-${pad(m)}-${pad(d)}`)); } catch { /* skip */ }
    }
    return out.length ? out : null;
  }

  const start = DateTime.fromObject({ year: y, month: m, day: 1 });
  if (!start.isValid) return null;
  const dim = start.daysInMonth ?? 30;
  return Array.from({ length: dim }, (_, i) => start.plus({ days: i }).toISODate()!);
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  if (!(await isRequestAdmin(auth.decoded))) return jsonError("Forbidden", 403);

  const url = new URL(req.url);
  const parsed = qSchema.safeParse({
    siteId: url.searchParams.get("siteId") ?? "",
    period: url.searchParams.get("period") ?? "",
    value:  url.searchParams.get("value")  ?? "",
    mode:   url.searchParams.get("mode")   || "ad",
  });
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Bad params", 400);

  const { siteId, period, value, mode } = parsed.data;
  const db = adminDb();

  // ── Site info ────────────────────────────────────────────────────────────
  const siteSnap = await db.collection("sites").doc(siteId).get();
  if (!siteSnap.exists) return jsonError("Site not found", 404);
  const siteData    = siteSnap.data() ?? {};
  const siteName    = typeof siteData.name     === "string" ? siteData.name     : siteId;
  const siteLocation = typeof siteData.location === "string" ? siteData.location
                     : typeof siteData.address  === "string" ? siteData.address
                     : null;

  // ── AD date list ─────────────────────────────────────────────────────────
  let dates: string[];
  if (period === "day") {
    dates = [value]; // already AD YYYY-MM-DD
  } else {
    const built = buildMonthDates(value, mode);
    if (!built) return jsonError("Invalid month value", 400);
    dates = built;
  }
  const firstDate = dates[0]!;
  const lastDate  = dates[dates.length - 1]!;

  // ── BATCH 1: All users — name, employeeId, timezone, and wage rates ──────
  //   Wages (wageRate / overtimeRate) are stored here by /api/admin/wage-rate
  const usersSnap = await db.collection("users").get();
  type UserMeta = {
    name:         string;
    employeeId:   string | null;
    zone:         string;
    wageRate:     number | null; // Rs./hr
    overtimeRate: number | null; // Rs./hr OT
  };
  const userById = new Map<string, UserMeta>();
  for (const d of usersSnap.docs) {
    const u = d.data();
    userById.set(d.id, {
      name:         typeof u.name        === "string" ? u.name        : d.id,
      employeeId:   (typeof u.employeeId   === "string" && u.employeeId)   ||
                    (typeof u.employeeCode === "string" && u.employeeCode) || null,
      zone:         typeof u.timezone    === "string" ? u.timezone    : "Asia/Kathmandu",
      wageRate:     typeof u.wageRate    === "number" ? u.wageRate    : null,
      overtimeRate: typeof u.overtimeRate === "number" ? u.overtimeRate : null,
    });
  }

  // ── BATCH 2: All attendance docs in the date range for this site ─────────
  //   We read checkIn.time, checkOut.time, and siteId directly from each doc.
  //   No per-worker-per-day sub-queries needed.
  const attSnap = await db
    .collection("attendance")
    .where("date", ">=", firstDate)
    .where("date", "<=", lastDate)
    .get();

  // Map: date → workerId → { inMs, outMs }
  type TimingEntry = { inMs: number | null; outMs: number | null };
  const timingByDateWorker = new Map<string, Map<string, TimingEntry>>();

  for (const doc of attSnap.docs) {
    const d = doc.data();
    // Only include records for this specific site
    const docSiteId = typeof d.siteId === "string" ? d.siteId : "";
    if (docSiteId !== siteId) continue;

    const date = typeof d.date     === "string" ? d.date     : "";
    const wid  = typeof d.workerId === "string" ? d.workerId : "";
    if (!date || !wid) continue;

    // Read timestamps directly from the attendance doc
    const checkIn  = d.checkIn  as Record<string, unknown> | undefined;
    const checkOut = d.checkOut as Record<string, unknown> | undefined;

    const inMs  = checkIn  ? timeToMs(checkIn.time)  : null;
    const outMs = checkOut ? timeToMs(checkOut.time) : null;

    if (!timingByDateWorker.has(date)) timingByDateWorker.set(date, new Map());
    timingByDateWorker.get(date)!.set(wid, { inMs, outMs });
  }

  // ── Build day groups (pure in-memory — no more Firestore calls) ──────────
  // Always include every date so monthly view shows all days (empty ones render blank).
  const days: WagesDayGroup[] = [];

  for (const date of dates) {
    const dayMap = timingByDateWorker.get(date);

    // No attendance on this day — include as empty group
    if (!dayMap || dayMap.size === 0) {
      days.push({ date, workers: [], totalManpower: 0, totalAmount: null });
      continue;
    }

    const workerRows: WagesWorkerRow[] = [];
    for (const [wid, timing] of dayMap) {
      const meta = userById.get(wid) ?? {
        name: wid, employeeId: null, zone: "Asia/Kathmandu",
        wageRate: null, overtimeRate: null,
      };

      // Format times
      const zone    = meta.zone;
      const inTime  = hmFromMs(timing.inMs,  zone);
      const outTime = hmFromMs(timing.outMs, zone);

      // Calculate duty hours from raw timestamps
      let dutyHours = 0;
      if (timing.inMs !== null && timing.outMs !== null && timing.outMs > timing.inMs) {
        dutyHours = (timing.outMs - timing.inMs) / 3_600_000;
      }

      // Wages from the users collection (set by salary-edit page)
      const wagesPerHour = meta.wageRate;
      const wagesPerDay  = wagesPerHour !== null ? wagesPerHour * 8 : null;
      const otRate       = meta.overtimeRate ?? wagesPerHour;

      const totalAmount =
        wagesPerHour !== null && otRate !== null
          ? calcTotal(dutyHours, wagesPerHour, otRate)
          : null;

      workerRows.push({
        workerId: wid,
        name:         meta.name,
        employeeId:   meta.employeeId,
        inTime,
        outTime,
        dutyHours,
        wagesPerDay,
        wagesPerHour,
        overtimeRate: meta.overtimeRate,
        totalAmount,
      });
    }

    workerRows.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );

    const allHaveWages = workerRows.every((r) => r.totalAmount !== null);
    const totalAmount  = allHaveWages
      ? workerRows.reduce((s, r) => s + (r.totalAmount ?? 0), 0)
      : null;

    days.push({ date, workers: workerRows, totalManpower: workerRows.length, totalAmount });
  }

  return NextResponse.json({
    siteId, siteName, siteLocation, period, value, days,
  } satisfies SiteAttendanceWagesResponse);
}
