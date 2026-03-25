import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

const utcHm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24h UTC as HH:mm (e.g. 09:00)");

const bodySchema = z.object({
  name: z.string().min(1),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  radius: z.number().positive().max(5000),
  /** Optional expected start of workday (UTC), for display. */
  workdayStartUtc: utcHm.optional(),
  /**
   * End of workday (UTC). If the worker is still checked in after this time on that UTC day,
   * the auto-checkout job will close the session (server-side).
   * Defaults to 23:59 UTC.
   */
  autoCheckoutUtc: utcHm.optional(),
});

const deleteSchema = z.object({
  siteId: z.string().min(1),
});

/** Same fields as create, plus siteId. Clear work start by sending "". */
const patchSchema = z.object({
  siteId: z.string().min(1),
  name: z.string().min(1),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  radius: z.number().positive().max(5000),
  workdayStartUtc: z.union([utcHm, z.literal("")]).optional(),
  autoCheckoutUtc: utcHm.optional(),
});

async function assertAdmin(
  uid: string,
  email: string | undefined
): Promise<Response | null> {
  const superEmail = process.env.SUPER_ADMIN_EMAIL;
  if (superEmail && email === superEmail) return null;

  const db = adminDb();
  const snap = await db.collection("users").doc(uid).get();
  const role = snap.get("role") as string | undefined;
  if (role === "admin" || role === "super_admin") return null;
  return jsonError("Forbidden", 403);
}

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  const denied = await assertAdmin(decoded.uid, decoded.email);
  if (denied) return denied;

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

  const db = adminDb();
  const ref = db.collection("sites").doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    name: parsed.data.name,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    radius: parsed.data.radius,
    ...(parsed.data.workdayStartUtc
      ? { workdayStartUtc: parsed.data.workdayStartUtc }
      : {}),
    autoCheckoutUtc: parsed.data.autoCheckoutUtc ?? "23:59",
    createdBy: decoded.uid,
    createdAt: now,
  });

  return NextResponse.json({ ok: true, id: ref.id });
}

export async function PATCH(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  const denied = await assertAdmin(decoded.uid, decoded.email);
  if (denied) return denied;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }

  const db = adminDb();
  const ref = db.collection("sites").doc(parsed.data.siteId);
  const snap = await ref.get();
  if (!snap.exists) {
    return jsonError("Site not found", 404);
  }

  const w = parsed.data.workdayStartUtc;
  const update: Record<string, unknown> = {
    name: parsed.data.name,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    radius: parsed.data.radius,
    autoCheckoutUtc: parsed.data.autoCheckoutUtc ?? "23:59",
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (w !== undefined) {
    if (w && w !== "") {
      update.workdayStartUtc = w;
    } else {
      update.workdayStartUtc = FieldValue.delete();
    }
  }

  await ref.update(update);

  return NextResponse.json({ ok: true, id: ref.id });
}

export async function DELETE(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  const denied = await assertAdmin(decoded.uid, decoded.email);
  if (denied) return denied;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "siteId required", 400);
  }

  const db = adminDb();
  const ref = db.collection("sites").doc(parsed.data.siteId);
  const snap = await ref.get();
  if (!snap.exists) {
    return jsonError("Site not found", 404);
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}
