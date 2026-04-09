import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { resolveSiteScheduleTimeZone } from "@/lib/server/site-schedule-time-zone";
import { DEFAULT_CHECKOUT_GRACE_MINUTES } from "@/lib/site/work-window";

export const runtime = "nodejs";

const utcHm = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d$/,
    "Use HH:mm on a 24-hour clock (e.g. 09:00 or 21:00), local to the site — the UI uses AM/PM"
  );

const postBodySchema = z.object({
  name: z.string().min(1),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  radius: z.number().positive().max(5000),
  workdayStartUtc: utcHm.optional(),
  workdayEndUtc: utcHm.optional(),
  checkoutGraceMinutes: z.number().int().min(1).max(120).optional(),
});

/** Employees (and admins) create a real site document — same shape as admin POST. */
export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const { uid, email } = auth.decoded;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = postBodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }

  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const role = userSnap.get("role") as string | undefined;

  if (role !== "employee" && role !== "admin" && role !== "super_admin") {
    return jsonError("Only workspace members can create sites", 403);
  }

  const ref = db.collection("sites").doc();
  const now = FieldValue.serverTimestamp();
  const scheduleTimeZone = resolveSiteScheduleTimeZone({
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
  });
  await ref.set({
    name: parsed.data.name.trim(),
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    radius: parsed.data.radius,
    scheduleTimeZone,
    ...(parsed.data.workdayStartUtc
      ? { workdayStartUtc: parsed.data.workdayStartUtc }
      : {}),
    ...(parsed.data.workdayEndUtc
      ? { workdayEndUtc: parsed.data.workdayEndUtc }
      : {}),
    checkoutGraceMinutes: parsed.data.checkoutGraceMinutes ?? DEFAULT_CHECKOUT_GRACE_MINUTES,
    createdBy: uid,
    createdByEmail: email ?? null,
    workerCreated: role === "employee",
    createdAt: now,
  });

  if (role === "employee") {
    await userRef.update({
      assignedSites: FieldValue.arrayUnion(ref.id),
    });
  }

  return NextResponse.json({ ok: true, id: ref.id });
}

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  const db = adminDb();
  const userSnap = await db.collection("users").doc(decoded.uid).get();
  const role = userSnap.get("role") as string | undefined;
  const assigned: string[] = userSnap.get("assignedSites") ?? [];

  const sitesSnap = await db.collection("sites").get();
  const all = sitesSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      scheduleTimeZone: resolveSiteScheduleTimeZone(data),
    };
  });

  if (role === "employee") {
    // Full site list for pickers. If `assignedSites` is non-empty, check-in API restricts to those ids;
    // if empty, any site in the list is allowed (GPS still enforced).
    return NextResponse.json({
      sites: all,
      needsAssignment: assigned.length === 0,
      assignedSiteIds: assigned,
    });
  }

  return NextResponse.json({ sites: all, assignedSiteIds: [] });
}
