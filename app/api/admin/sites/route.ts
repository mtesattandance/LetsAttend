import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue, adminDb } from "@/lib/firebase/admin";
import { assertAdmin } from "@/lib/auth/assert-admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

const utcHm = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d$/,
    "Use HH:mm on a 24-hour clock (e.g. 09:00 or 21:00), Nepal NPT — the UI uses AM/PM"
  );

const bodySchema = z.object({
  name: z.string().min(1),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  radius: z.number().positive().max(5000),
  /** Optional expected start of workday (24h wall time, NPT), for display. */
  workdayStartUtc: utcHm.optional(),
  /**
   * End of workday (24h wall time, NPT). If still checked in after this time the auto-checkout
   * job will close the session. Defaults to 17:00.
   */
  workdayEndUtc: utcHm.optional(),
  /**
   * Minutes after workdayEndUtc during which employees can still manually check out with a selfie.
   * The recorded checkout time is always capped at workdayEndUtc. Default: 20 min.
   */
  checkoutGraceMinutes: z.number().int().min(1).max(120).optional(),
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
  workdayEndUtc: utcHm.optional(),
  checkoutGraceMinutes: z.number().int().min(1).max(120).optional(),
});

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
    workdayEndUtc: parsed.data.workdayEndUtc ?? "17:00",
    checkoutGraceMinutes: parsed.data.checkoutGraceMinutes ?? 20,
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
    workdayEndUtc: parsed.data.workdayEndUtc ?? "17:00",
    checkoutGraceMinutes: parsed.data.checkoutGraceMinutes ?? 20,
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
