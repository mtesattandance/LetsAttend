import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isWithinSiteRadius } from "@/lib/geo/validate-site";
import { calendarDateKeyInTimeZone } from "@/lib/date/calendar-day-key";
import { timeZoneFromUserSnapshot } from "@/lib/attendance/time-zone-from-snap";
import { canRecordAttendanceFor } from "@/lib/attendance/proxy-attendance";
import { computeWorkWindow } from "@/lib/site/work-window";
import { resolveSiteScheduleTimeZone } from "@/lib/server/site-schedule-time-zone";
import { invalidateTodayCache } from "@/lib/cache/today-cache";

export const runtime = "nodejs";

const bodySchema = z.object({
  siteId: z.string().min(1),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  accuracyM: z.number().finite().optional(),
  photoUrl: z.string().url(),
  /** Record check-in for another worker (friend / shared phone). Server validates permission. */
  forWorkerId: z.string().min(1).optional(),
  tag: z.enum(["regular", "overtime", "late_checkin"]).optional(),
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
  const { siteId, latitude, longitude, accuracyM, photoUrl, forWorkerId, tag } = parsed.data;

  const db = adminDb();
  const callerRef = db.collection("users").doc(decoded.uid);
  const siteRef = db.collection("sites").doc(siteId);

  const [callerSnap, siteSnap] = await Promise.all([callerRef.get(), siteRef.get()]);

  if (!callerSnap.exists) {
    return jsonError(
      "Your workspace profile was not found. Sign out and sign in again, or contact an admin.",
      403
    );
  }

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

  const role = workerSnap.get("role") as string | undefined;
  const raw = workerSnap.get("assignedSites");
  const assigned: string[] = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string")
    : [];
  if (role === "employee" && assigned.length > 0 && !assigned.includes(siteId)) {
    return jsonError("Site not assigned to this worker", 403);
  }

  const scheduleZone = resolveSiteScheduleTimeZone(site);
  const workdayStartUtc =
    typeof site.workdayStartUtc === "string" && site.workdayStartUtc.trim()
      ? site.workdayStartUtc.trim()
      : null;
  const workdayEndUtc =
    (typeof site.workdayEndUtc === "string" && site.workdayEndUtc.trim()
      ? site.workdayEndUtc.trim()
      : null) ??
    (typeof site.autoCheckoutUtc === "string" && site.autoCheckoutUtc.trim()
      ? site.autoCheckoutUtc.trim()
      : null);
  const windowState = computeWorkWindow({
    workdayStartUtc,
    workdayEndUtc,
    scheduleZone,
    nowMs: Date.now(),
  });
  if (windowState === "early" || windowState === "late" || windowState === "missed_check_in") {
    if (tag !== "overtime" && tag !== "late_checkin") {
      const msg =
        windowState === "early"
          ? "Check-in opens 15 minutes before shift start through 15 minutes after start, or submit an overtime request to arrive earlier."
          : windowState === "missed_check_in"
            ? "You missed the regular check-in window (15 minutes before through 15 minutes after shift start). Submit an overtime request or contact an admin."
            : "Regular check-in is not allowed after working hours — submit an overtime request.";
      return jsonError(msg, 403);
    }
  }

  const tz = timeZoneFromUserSnapshot(workerSnap);
  const day = calendarDateKeyInTimeZone(new Date(), tz);
  let attRef = db.collection("attendance").doc(`${workerUid}_${day}`);
  let attSnap = await attRef.get();
  let existing = attSnap.data() as
    | {
        checkIn?: unknown;
        checkOut?: unknown;
        siteSwitchLogs?: unknown[];
      }
    | undefined;

  if (existing?.checkIn && existing?.checkOut) {
    if (tag === "overtime") {
      attRef = db.collection("attendance").doc(`${workerUid}_${day}_overtime`);
      attSnap = await attRef.get();
      existing = attSnap.data() as any;
      if (existing?.checkIn && existing?.checkOut) {
        return jsonError("Overtime attendance already completed for today", 409);
      }
    } else {
      return jsonError("Attendance already completed for today", 409);
    }
  }

  if (existing?.checkIn && !existing?.checkOut) {
    return jsonError("Already checked in. Check out or use site switch.", 409);
  }

  const now = FieldValue.serverTimestamp();
  const checkInPayload: Record<string, unknown> = {
    time: now,
    gps: {
      latitude,
      longitude,
      ...(accuracyM != null ? { accuracyM } : {}),
    },
    photoUrl,
  };
  if (recordedByUid) {
    checkInPayload.recordedByUid = recordedByUid;
  }

  await attRef.set(
    {
      workerId: workerUid,
      siteId,
      date: day,
      checkIn: checkInPayload,
      status: tag === "overtime" || tag === "late_checkin" ? "pending_admin_approval" : "present",
      checkInTag: tag || "regular",
      siteSwitchLogs: Array.isArray(existing?.siteSwitchLogs)
        ? existing!.siteSwitchLogs
        : [],
      updatedAt: now,
    },
    { merge: true }
  );

  invalidateTodayCache(workerUid);
  return NextResponse.json({
    ok: true,
    attendanceId: attRef.id,
    distanceM: Math.round(check.distanceM),
  });
}
