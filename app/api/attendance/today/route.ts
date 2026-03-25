import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { attendanceDayKeyUTC } from "@/lib/date/today-key";

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

  const day = new URL(req.url).searchParams.get("day")?.trim() || attendanceDayKeyUTC();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return jsonError("Invalid day", 400);
  }

  const db = adminDb();
  const attRef = db.collection("attendance").doc(`${decoded.uid}_${day}`);
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
      autoCheckoutUtc: null as string | null,
    });
  }

  const data = attSnap.data()!;
  const siteId = typeof data.siteId === "string" ? data.siteId : null;

  let siteName: string | null = null;
  let workdayStartUtc: string | null = null;
  let autoCheckoutUtc: string | null = null;

  if (siteId) {
    const siteSnap = await db.collection("sites").doc(siteId).get();
    if (siteSnap.exists) {
      const s = siteSnap.data()!;
      siteName = typeof s.name === "string" ? s.name : siteId;
      workdayStartUtc =
        typeof s.workdayStartUtc === "string" ? s.workdayStartUtc : null;
      autoCheckoutUtc =
        typeof s.autoCheckoutUtc === "string" ? s.autoCheckoutUtc : "23:59";
    }
  }

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
    return {
      fromSiteId: fromId,
      toSiteId: toId,
      fromSiteName: fromId ? siteNamesById[fromId] ?? fromId : null,
      toSiteName: toId ? siteNamesById[toId] ?? toId : null,
      photoUrl: o.photoUrl,
      gps: o.gps,
      atMs,
    };
  });

  return NextResponse.json({
    day,
    hasRecord: true,
    siteId,
    siteName,
    workdayStartUtc,
    autoCheckoutUtc,
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
