import { NextResponse } from "next/server";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import { FieldValue, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isWithinSiteRadius } from "@/lib/geo/validate-site";
import { calendarDateKeyInTimeZone } from "@/lib/date/calendar-day-key";
import { timeZoneFromUserSnapshot } from "@/lib/attendance/time-zone-from-snap";
import { canRecordAttendanceFor } from "@/lib/attendance/proxy-attendance";

export const runtime = "nodejs";

/** Must complete this long at the current site before switching away (server clock). */
const MIN_MS_AT_SITE_BEFORE_SWITCH = 60 * 60 * 1000;

function stampToMs(t: unknown): number | null {
  if (t && typeof t === "object" && "toMillis" in t && typeof (t as Timestamp).toMillis === "function") {
    return (t as Timestamp).toMillis();
  }
  const o = t as { seconds?: number; _seconds?: number } | null;
  if (o && typeof o.seconds === "number") return o.seconds * 1000;
  if (o && typeof o._seconds === "number") return o._seconds * 1000;
  return null;
}

const bodySchema = z.object({
  siteId: z.string().min(1),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  accuracyM: z.number().finite().optional(),
  photoUrl: z.string().url(),
  forWorkerId: z.string().min(1).optional(),
});

type SwitchLog = {
  at: Timestamp;
  fromSiteId: string;
  toSiteId: string;
  photoUrl: string;
  gps: { latitude: number; longitude: number; accuracyM?: number };
  /**
   * Check-out recorded for `fromSiteId` when switching away. Same proof as arrival at `toSiteId`
   * (GPS + selfie at new site). Does not set document `checkOut` — end-of-day checkout is separate.
   */
  previousSiteCheckOut: {
    siteId: string;
    time: Timestamp;
    gps: { latitude: number; longitude: number; accuracyM?: number };
    photoUrl: string;
  };
};

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }
  const { siteId, latitude, longitude, accuracyM, photoUrl, forWorkerId } = parsed.data;

  const db = adminDb();
  const callerRef = db.collection("users").doc(decoded.uid);
  const callerSnap = await callerRef.get();
  if (!callerSnap.exists) {
    return jsonError("Your workspace profile was not found.", 403);
  }

  let workerUid = decoded.uid;
  let workerSnap = callerSnap;

  if (forWorkerId && forWorkerId !== decoded.uid) {
    const subjectRef = db.collection("users").doc(forWorkerId);
    const subjectSnap = await subjectRef.get();
    if (!subjectSnap.exists) return jsonError("Worker not found", 404);
    if (!canRecordAttendanceFor(callerSnap, subjectSnap)) {
      return jsonError("Not allowed to record attendance for this worker", 403);
    }
    workerUid = forWorkerId;
    workerSnap = subjectSnap;
  }

  const siteRef = db.collection("sites").doc(siteId);

  const siteSnap = await siteRef.get();

  if (!siteSnap.exists) return jsonError("Site not found", 404);

  const site = siteSnap.data()!;
  const lat = Number(site.latitude);
  const lng = Number(site.longitude);
  const radius = Number(site.radius);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius)) {
    return jsonError("Site misconfigured", 500);
  }

  const check = isWithinSiteRadius(latitude, longitude, {
    latitude: lat,
    longitude: lng,
    radiusMeters: radius,
  });
  if (!check.ok) {
    return NextResponse.json(
      {
        error: "Outside site radius",
        distanceM: Math.round(check.distanceM),
        radiusM: radius,
      },
      { status: 403 }
    );
  }

  const tz = timeZoneFromUserSnapshot(workerSnap);
  const day = calendarDateKeyInTimeZone(new Date(), tz);
  let attRef = db.collection("attendance").doc(`${workerUid}_${day}`);
  let attSnap = await attRef.get();
  let existing = attSnap.data() as
    | {
        checkIn?: unknown;
        checkOut?: unknown;
        siteId?: string;
        siteSwitchLogs?: SwitchLog[] | unknown[];
      }
    | undefined;

  // If the regular session is fully closed, check if they are trying to switch sites in an overtime session
  if (existing?.checkIn && existing?.checkOut) {
    const otRef = db.collection("attendance").doc(`${workerUid}_${day}_overtime`);
    const otSnap = await otRef.get();
    if (otSnap.exists) {
      attRef = otRef;
      attSnap = otSnap;
      existing = otSnap.data() as any;
    }
  }

  if (!existing?.checkIn) {
    return jsonError("You must check in before switching sites.", 409);
  }
  if (existing?.checkOut != null) {
    return jsonError("Already checked out for today.", 409);
  }

  const currentSiteId = typeof existing.siteId === "string" ? existing.siteId : "";

  if (!currentSiteId) {
    return jsonError("Current site unknown; check in again.", 409);
  }

  if (currentSiteId === siteId) {
    return jsonError("You are already checked in at this site.", 400);
  }

  const checkInObj = existing.checkIn as { time?: unknown } | undefined;
  const checkInMs = checkInObj?.time != null ? stampToMs(checkInObj.time) : null;
  if (checkInMs == null) {
    return jsonError("Cannot read check-in time; check in again.", 409);
  }

  const logs: SwitchLog[] = Array.isArray(existing.siteSwitchLogs)
    ? (existing.siteSwitchLogs as SwitchLog[])
    : [];

  const sortedLogs = [...logs].sort((a, b) => a.at.toMillis() - b.at.toMillis());
  let arrivedAtCurrentSiteMs: number | null = null;
  if (sortedLogs.length === 0) {
    arrivedAtCurrentSiteMs = checkInMs;
  } else {
    const last = sortedLogs[sortedLogs.length - 1]!;
    if (last.toSiteId === currentSiteId) {
      arrivedAtCurrentSiteMs = last.at.toMillis();
    } else {
      for (let i = sortedLogs.length - 1; i >= 0; i--) {
        const log = sortedLogs[i]!;
        if (log.toSiteId === currentSiteId) {
          arrivedAtCurrentSiteMs = log.at.toMillis();
          break;
        }
      }
      arrivedAtCurrentSiteMs ??= checkInMs;
    }
  }

  const elapsed = Date.now() - arrivedAtCurrentSiteMs;
  if (elapsed < MIN_MS_AT_SITE_BEFORE_SWITCH) {
    const remainMin = Math.ceil((MIN_MS_AT_SITE_BEFORE_SWITCH - elapsed) / 60_000);
    return jsonError(
      `Complete at least 1 hour at your current site before switching. Try again in about ${remainMin} min.`,
      409
    );
  }

  const t = Timestamp.now();
  const gpsPayload = {
    latitude,
    longitude,
    ...(accuracyM != null ? { accuracyM } : {}),
  };

  const entry: SwitchLog = {
    at: t,
    fromSiteId: currentSiteId,
    toSiteId: siteId,
    photoUrl,
    gps: gpsPayload,
    previousSiteCheckOut: {
      siteId: currentSiteId,
      time: t,
      gps: gpsPayload,
      photoUrl,
    },
  };

  const now = FieldValue.serverTimestamp();
  await attRef.set(
    {
      siteId,
      siteSwitchLogs: [...logs, entry],
      updatedAt: now,
    },
    { merge: true }
  );

  return NextResponse.json({
    ok: true,
    siteId,
    distanceM: Math.round(check.distanceM),
    switchCount: logs.length + 1,
  });
}
