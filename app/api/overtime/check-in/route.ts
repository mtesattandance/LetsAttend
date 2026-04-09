import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isWithinSiteRadius } from "@/lib/geo/validate-site";
import { localCalendarDateKeyFromTimezoneOffset } from "@/lib/date/today-key";

export const runtime = "nodejs";

const bodySchema = z.object({
  requestId: z.string().min(1),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  accuracyM: z.number().finite().optional(),
  photoUrl: z.string().url(),
  /** Same as `new Date().getTimezoneOffset()` in the browser (minutes). */
  timezoneOffset: z.number().int(),
});

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const { uid } = auth.decoded;

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
  const { requestId, latitude, longitude, accuracyM, photoUrl, timezoneOffset } =
    parsed.data;

  const db = adminDb();
  const ref = db.collection("overtimeRequests").doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) return jsonError("Overtime request not found", 404);

  const row = snap.data()!;
  if (row.workerId !== uid) return jsonError("Not your overtime request", 403);
  if (row.status === "rejected") {
    return jsonError("This overtime request is rejected. Create a new one to continue.", 403);
  }

  const todayKey = localCalendarDateKeyFromTimezoneOffset(timezoneOffset);
  if (typeof row.date === "string" && row.date !== todayKey) {
    return jsonError(
      `This overtime is for work date ${row.date}. Use overtime check-in on that same calendar day (your device time zone).`,
      403
    );
  }

  const siteId = typeof row.siteId === "string" && row.siteId.trim() ? row.siteId.trim() : null;
  if (!siteId) return jsonError("This request has no site. Choose a site in overtime request first.", 500);

  const hasIn =
    row.overtimeCheckIn &&
    typeof row.overtimeCheckIn === "object" &&
    (row.overtimeCheckIn as { time?: unknown }).time != null;
  const hasOut =
    row.overtimeCheckOut &&
    typeof row.overtimeCheckOut === "object" &&
    (row.overtimeCheckOut as { time?: unknown }).time != null;

  if (hasIn && !hasOut) {
    return jsonError("Overtime check-in already recorded — check out first", 409);
  }
  if (hasOut) {
    return jsonError("Overtime session already completed", 409);
  }

  const siteRef = db.collection("sites").doc(siteId);
  const siteSnap = await siteRef.get();
  if (!siteSnap.exists) return jsonError("Site not found", 404);

  const site = siteSnap.data()!;
  const slat = Number(site.latitude);
  const slng = Number(site.longitude);
  const radius = Number(site.radius);
  if (!Number.isFinite(slat) || !Number.isFinite(slng) || !Number.isFinite(radius)) {
    return jsonError("Site misconfigured", 500);
  }

  const check = isWithinSiteRadius(latitude, longitude, {
    latitude: slat,
    longitude: slng,
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

  const now = FieldValue.serverTimestamp();
  await ref.update({
    overtimeCheckIn: {
      time: now,
      gps: {
        latitude,
        longitude,
        ...(accuracyM != null ? { accuracyM } : {}),
      },
      photoUrl,
    },
    updatedAt: now,
  });

  return NextResponse.json({
    ok: true,
    distanceM: Math.round(check.distanceM),
  });
}
