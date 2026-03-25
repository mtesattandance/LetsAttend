import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isWithinSiteRadius } from "@/lib/geo/validate-site";
import { attendanceDayKeyUTC } from "@/lib/date/today-key";

export const runtime = "nodejs";

const bodySchema = z.object({
  siteId: z.string().min(1),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  accuracyM: z.number().finite().optional(),
  photoUrl: z.string().url(),
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
  const { siteId, latitude, longitude, accuracyM, photoUrl } = parsed.data;

  const db = adminDb();
  const userRef = db.collection("users").doc(decoded.uid);
  const siteRef = db.collection("sites").doc(siteId);

  const [userSnap, siteSnap] = await Promise.all([
    userRef.get(),
    siteRef.get(),
  ]);

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

  if (userSnap.exists) {
    const role = userSnap.get("role") as string | undefined;
    const assigned: string[] = userSnap.get("assignedSites") ?? [];
    if (role === "employee" && assigned.length && !assigned.includes(siteId)) {
      return jsonError("Site not assigned to you", 403);
    }
  }

  const day = attendanceDayKeyUTC();
  const attRef = db.collection("attendance").doc(`${decoded.uid}_${day}`);
  const attSnap = await attRef.get();
  const existing = attSnap.data() as
    | {
        checkIn?: unknown;
        checkOut?: unknown;
        siteSwitchLogs?: unknown[];
      }
    | undefined;

  if (existing?.checkIn && !existing?.checkOut) {
    return jsonError("Already checked in. Check out or use site switch.", 409);
  }
  if (existing?.checkIn && existing?.checkOut) {
    return jsonError("Attendance already completed for today", 409);
  }

  const now = FieldValue.serverTimestamp();
  await attRef.set(
    {
      workerId: decoded.uid,
      siteId,
      date: day,
      checkIn: {
        time: now,
        gps: {
          latitude,
          longitude,
          ...(accuracyM != null ? { accuracyM } : {}),
        },
        photoUrl,
      },
      status: "present",
      siteSwitchLogs: Array.isArray(existing?.siteSwitchLogs)
        ? existing!.siteSwitchLogs
        : [],
      updatedAt: now,
    },
    { merge: true }
  );

  return NextResponse.json({
    ok: true,
    attendanceId: attRef.id,
    distanceM: Math.round(check.distanceM),
  });
}
