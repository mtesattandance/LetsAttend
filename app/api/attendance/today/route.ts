import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { calendarDateKeyInTimeZone } from "@/lib/date/calendar-day-key";
import { timeZoneFromUserSnapshot } from "@/lib/attendance/time-zone-from-snap";
import { resolveSiteScheduleTimeZone } from "@/lib/server/site-schedule-time-zone";
import { canRecordAttendanceFor } from "@/lib/attendance/proxy-attendance";
import {
  computeCheckoutWindowState,
  DEFAULT_CHECKOUT_GRACE_MINUTES,
  type CheckoutWindowState,
} from "@/lib/site/work-window";

export const runtime = "nodejs";

function tsMs(v: unknown): number | null {
  if (
    v &&
    typeof v === "object" &&
    "toMillis" in v &&
    typeof (v as { toMillis?: () => number }).toMillis === "function"
  ) {
    return (v as { toMillis: () => number }).toMillis();
  }
  return null;
}

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  const db = adminDb();
  const callerSnap = await db.collection("users").doc(decoded.uid).get();
  const url = new URL(req.url);
  const workerIdRaw = url.searchParams.get("workerId")?.trim() || decoded.uid;

  let workerId = decoded.uid;
  let workerSnap = callerSnap;
  if (workerIdRaw !== decoded.uid) {
    const subjectSnap = await db.collection("users").doc(workerIdRaw).get();
    if (!subjectSnap.exists) return jsonError("Worker not found", 404);
    if (!canRecordAttendanceFor(callerSnap, subjectSnap)) {
      return jsonError("Not allowed to view attendance for this worker", 403);
    }
    workerId = workerIdRaw;
    workerSnap = subjectSnap;
  }

  const tz = timeZoneFromUserSnapshot(workerSnap);
  const defaultDay = calendarDateKeyInTimeZone(new Date(), tz);
  const day = url.searchParams.get("day")?.trim() || defaultDay;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return jsonError("Invalid day", 400);
  }
  const attRef = db.collection("attendance").doc(`${workerId}_${day}`);
  const attSnap = await attRef.get();
  if (!attSnap.exists) {
    return NextResponse.json({
      day,
      hasRecord: false,
      siteId: null,
      siteName: null,
      checkIn: null,
      checkOut: null,
      siteSwitchLogs: [],
      workdayStartUtc: null as string | null,
      workdayEndUtc: null as string | null,
      scheduleTimeZone: null as string | null,
      checkoutGraceMinutes: null as number | null,
      checkoutWindowState: null as CheckoutWindowState | null,
    } as const);
  }

  const data = attSnap.data()!;
  const siteId = typeof data.siteId === "string" ? data.siteId : null;

  let siteName: string | null = null;
  let workdayStartUtc: string | null = null;
  let workdayEndUtc: string | null = null;
  let scheduleTimeZone: string | null = null;
  let checkoutGraceMinutes: number | null = null;

  if (siteId) {
    const siteSnap = await db.collection("sites").doc(siteId).get();
    if (siteSnap.exists) {
      const s = siteSnap.data()!;
      siteName = typeof s.name === "string" ? s.name : siteId;
      workdayStartUtc =
        typeof s.workdayStartUtc === "string" ? s.workdayStartUtc : null;
      // Read new field; fall back to legacy autoCheckoutUtc for old site docs.
      workdayEndUtc =
        (typeof s.workdayEndUtc === "string" && s.workdayEndUtc.trim()
          ? s.workdayEndUtc.trim()
          : null) ??
        (typeof s.autoCheckoutUtc === "string" && s.autoCheckoutUtc.trim()
          ? s.autoCheckoutUtc.trim()
          : null);
      scheduleTimeZone = resolveSiteScheduleTimeZone(s);
      const g = Number(s.checkoutGraceMinutes);
      checkoutGraceMinutes =
        Number.isFinite(g) && g > 0 ? g : DEFAULT_CHECKOUT_GRACE_MINUTES;
    }
  }

  const hasOpenSession = !!(data.checkIn && !data.checkOut);
  const checkoutWindowState =
    hasOpenSession && scheduleTimeZone
      ? computeCheckoutWindowState({
          workdayEndUtc,
          scheduleZone: scheduleTimeZone,
          attendanceDay: day,
          checkoutGraceMinutes: checkoutGraceMinutes ?? DEFAULT_CHECKOUT_GRACE_MINUTES,
          nowMs: Date.now(),
        })
      : null;

  const checkIn = data.checkIn as
    | { time?: unknown; photoUrl?: string; gps?: unknown }
    | undefined;
  const checkOut = data.checkOut as
    | { time?: unknown; photoUrl?: string; gps?: unknown; auto?: boolean }
    | undefined;

  const rawLogs = Array.isArray(data.siteSwitchLogs) ? data.siteSwitchLogs : [];
  const siteIds = new Set<string>();
  for (const log of rawLogs) {
    if (!log || typeof log !== "object") continue;
    const o = log as Record<string, unknown>;
    if (typeof o.fromSiteId === "string") siteIds.add(o.fromSiteId);
    if (typeof o.toSiteId === "string") siteIds.add(o.toSiteId);
  }
  const siteNamesById: Record<string, string> = {};
  for (const id of siteIds) {
    const s = await db.collection("sites").doc(id).get();
    if (s.exists) {
      const n = s.data()?.name;
      siteNamesById[id] = typeof n === "string" ? n : id;
    } else {
      siteNamesById[id] = id;
    }
  }

  const siteSwitchLogs = rawLogs.map((log) => {
    if (!log || typeof log !== "object") return log;
    const o = log as Record<string, unknown>;
    const at = o.at;
    let atMs: number | null = null;
    if (
      at &&
      typeof at === "object" &&
      "toMillis" in at &&
      typeof (at as { toMillis?: () => number }).toMillis === "function"
    ) {
      atMs = (at as { toMillis: () => number }).toMillis();
    }
    const fromId = typeof o.fromSiteId === "string" ? o.fromSiteId : "";
    const toId = typeof o.toSiteId === "string" ? o.toSiteId : "";
    const psco = o.previousSiteCheckOut as
      | { siteId?: string; time?: unknown; photoUrl?: unknown; gps?: unknown }
      | undefined;
    const previousSiteCheckOut =
      psco && typeof psco === "object"
        ? {
            siteId: typeof psco.siteId === "string" ? psco.siteId : fromId,
            siteName:
              typeof psco.siteId === "string"
                ? siteNamesById[psco.siteId] ?? fromId
                : fromId
                  ? siteNamesById[fromId] ?? fromId
                  : null,
            atMs: tsMs(psco.time),
            photoUrl: typeof psco.photoUrl === "string" ? psco.photoUrl : null,
            gps: psco.gps ?? null,
          }
        : null;

    return {
      fromSiteId: fromId,
      toSiteId: toId,
      fromSiteName: fromId ? siteNamesById[fromId] ?? fromId : null,
      toSiteName: toId ? siteNamesById[toId] ?? toId : null,
      photoUrl: o.photoUrl,
      gps: o.gps,
      atMs,
      previousSiteCheckOut,
    };
  });

  return NextResponse.json({
    day,
    hasRecord: true,
    siteId,
    siteName,
    workdayStartUtc,
    workdayEndUtc,
    scheduleTimeZone,
    checkoutGraceMinutes,
    checkoutWindowState,
    checkIn: checkIn
      ? {
          atMs: tsMs(checkIn.time),
          photoUrl: typeof checkIn.photoUrl === "string" ? checkIn.photoUrl : null,
          gps: checkIn.gps ?? null,
        }
      : null,
    checkOut: checkOut
      ? {
          atMs: tsMs(checkOut.time),
          photoUrl: typeof checkOut.photoUrl === "string" ? checkOut.photoUrl : null,
          gps: checkOut.gps ?? null,
          auto: checkOut.auto === true,
        }
      : null,
    siteSwitchLogs,
  });
}
