import { NextResponse } from "next/server";
import type { DocumentSnapshot } from "firebase-admin/firestore";
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
import { todayCache } from "@/lib/cache/today-cache";

export const runtime = "nodejs";

// Cache per "uid:workerId:day" — 60s TTL.
// With the 45s client poll interval this ensures every second poll is a cache hit (50% read saving).
const CACHE_TTL_MS = 60_000;

// User doc cache — 5 min TTL. role/timeZone/assignedSites rarely change.
const userDocCache = new Map<string, { data: Record<string, unknown>; expiresAt: number }>();
const USER_CACHE_TTL_MS = 5 * 60_000;

// Site doc cache — 5 min TTL. Site config (workday times, name) rarely changes.
const siteDocCache = new Map<string, { data: Record<string, unknown> | null; expiresAt: number }>();
const SITE_CACHE_TTL_MS = 5 * 60_000;

type Db = ReturnType<typeof adminDb>;

/** Returns a minimal DocumentSnapshot proxy backed by cached plain data. */
function snapProxy(data: Record<string, unknown>): DocumentSnapshot {
  return { get: (f: string) => data[f], exists: true } as unknown as DocumentSnapshot;
}

async function getCachedUserSnap(db: Db, uid: string): Promise<DocumentSnapshot> {
  const hit = userDocCache.get(uid);
  if (hit && hit.expiresAt > Date.now()) return snapProxy(hit.data);
  const real = await db.collection("users").doc(uid).get();
  const data = (real.exists ? real.data() : {}) ?? {};
  userDocCache.set(uid, { data, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  return real;
}

async function getCachedSiteData(db: Db, siteId: string): Promise<Record<string, unknown> | null> {
  const hit = siteDocCache.get(siteId);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  const real = await db.collection("sites").doc(siteId).get();
  const data = real.exists ? (real.data() ?? null) : null;
  siteDocCache.set(siteId, { data, expiresAt: Date.now() + SITE_CACHE_TTL_MS });
  return data;
}

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
  const url = new URL(req.url);
  const workerIdRaw = url.searchParams.get("workerId")?.trim() || decoded.uid;
  const dayParam = url.searchParams.get("day")?.trim() ?? "";
  const cacheKey = `${decoded.uid}:${workerIdRaw}:${dayParam}`;
  const cached = todayCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }

  const callerSnap = await getCachedUserSnap(db, decoded.uid);

  let workerId = decoded.uid;
  let workerSnap = callerSnap;
  if (workerIdRaw !== decoded.uid) {
    const subjectSnap = await getCachedUserSnap(db, workerIdRaw);
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
  const baseRef = db.collection("attendance").doc(`${workerId}_${day}`);
  let attSnap = await baseRef.get();

  if (attSnap.exists) {
    const cd = attSnap.data()!;
    if (cd.checkIn && cd.checkOut) {
      const otSnap = await db.collection("attendance").doc(`${workerId}_${day}_overtime`).get();
      if (otSnap.exists) {
        attSnap = otSnap;
      }
    }
  }
  if (!attSnap.exists) {
    const noRecordData = {
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
    } as const;
    todayCache.set(cacheKey, { data: noRecordData, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json(noRecordData);
  }

  const data = attSnap.data()!;
  const siteId = typeof data.siteId === "string" ? data.siteId : null;

  let siteName: string | null = null;
  let workdayStartUtc: string | null = null;
  let workdayEndUtc: string | null = null;
  let scheduleTimeZone: string | null = null;
  let checkoutGraceMinutes: number | null = null;

  if (siteId) {
    const s = await getCachedSiteData(db, siteId);
    if (s) {
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
  await Promise.all(
    Array.from(siteIds).map(async (id) => {
      const s = await getCachedSiteData(db, id);
      siteNamesById[id] = typeof s?.name === "string" ? s.name : id;
    })
  );

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

  const todayData = {
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
          tag: typeof data.checkInTag === "string" ? data.checkInTag : null,
        }
      : null,
    checkOut: checkOut
      ? {
          atMs: tsMs(checkOut.time),
          photoUrl: typeof checkOut.photoUrl === "string" ? checkOut.photoUrl : null,
          gps: checkOut.gps ?? null,
          auto: checkOut.auto === true,
          tag: typeof data.checkOutTag === "string" ? data.checkOutTag : null,
        }
      : null,
    status: typeof data.status === "string" ? data.status : null,
    siteSwitchLogs,
  };
  todayCache.set(cacheKey, { data: todayData, expiresAt: Date.now() + CACHE_TTL_MS });
  return NextResponse.json(todayData);
}
