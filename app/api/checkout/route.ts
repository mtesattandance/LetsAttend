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
import { computeCheckoutWindowState, DEFAULT_CHECKOUT_GRACE_MINUTES } from "@/lib/site/work-window";
import { zonedWallClockToUtcMillis } from "@/lib/site/zoned-schedule";
import { resolveSiteScheduleTimeZone } from "@/lib/server/site-schedule-time-zone";

export const runtime = "nodejs";

const bodySchema = z.object({
  siteId: z.string().min(1),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  accuracyM: z.number().finite().optional(),
  photoUrl: z.string().url(),
  forWorkerId: z.string().min(1).optional(),
});

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

  let workerUid = decoded.uid;
  let workerSnap = callerSnap;
  let recordedByUid: string | undefined;

  if (forWorkerId && forWorkerId !== decoded.uid) {
    const subjectRef = db.collection("users").doc(forWorkerId);
    const subjectSnap = await subjectRef.get();
    if (!subjectSnap.exists) return jsonError("Worker not found", 404);
    if (!canRecordAttendanceFor(callerSnap, subjectSnap)) {
      return jsonError("Not allowed to record attendance for this worker", 403);
    }
    workerUid = forWorkerId;
    workerSnap = subjectSnap;
    recordedByUid = decoded.uid;
  }

  const tz = timeZoneFromUserSnapshot(workerSnap);
  const day = calendarDateKeyInTimeZone(new Date(), tz);
  const attRef = db.collection("attendance").doc(`${workerUid}_${day}`);
  const attSnap = await attRef.get();
  const data = attSnap.data() as { checkIn?: unknown; checkOut?: unknown; siteId?: string } | undefined;

  if (!data?.checkIn) return jsonError("No check-in for today", 409);
  if (data.checkOut) return jsonError("Already checked out", 409);
  if (data.siteId && data.siteId !== siteId) {
    return jsonError("Check-out site must match active site", 403);
  }

  const scheduleZone = resolveSiteScheduleTimeZone(site);
  const workdayEndHm =
    (typeof site.workdayEndUtc === "string" && site.workdayEndUtc.trim()
      ? site.workdayEndUtc.trim()
      : null) ??
    (typeof site.autoCheckoutUtc === "string" && site.autoCheckoutUtc.trim()
      ? site.autoCheckoutUtc.trim()
      : null);
  const graceMin = Number(site.checkoutGraceMinutes);
  const checkoutGrace =
    Number.isFinite(graceMin) && graceMin > 0 ? graceMin : DEFAULT_CHECKOUT_GRACE_MINUTES;
  const coState = computeCheckoutWindowState({
    workdayEndUtc: workdayEndHm,
    scheduleZone,
    attendanceDay: day,
    checkoutGraceMinutes: checkoutGrace,
    nowMs: Date.now(),
  });
  if (coState === "too_late") {
    return jsonError(
      `Check-out window ended (${checkoutGrace} minutes after shift end). The system will auto-checkout this session.`,
      403
    );
  }

  let checkOutTime: Timestamp | ReturnType<typeof FieldValue.serverTimestamp>;
  if (coState === "open" && workdayEndHm) {
    const deadlineMs = zonedWallClockToUtcMillis(day, workdayEndHm, scheduleZone);
    checkOutTime =
      deadlineMs != null ? Timestamp.fromMillis(deadlineMs) : FieldValue.serverTimestamp();
  } else {
    checkOutTime = FieldValue.serverTimestamp();
  }

  const updatedAt = FieldValue.serverTimestamp();
  const checkOutPayload: Record<string, unknown> = {
    time: checkOutTime,
    gps: {
      latitude,
      longitude,
      ...(accuracyM != null ? { accuracyM } : {}),
    },
    photoUrl,
  };
  if (recordedByUid) {
    checkOutPayload.recordedByUid = recordedByUid;
  }

  await attRef.set(
    {
      checkOut: checkOutPayload,
      updatedAt,
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, distanceM: Math.round(check.distanceM) });
}
