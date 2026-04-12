import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { assertAdmin } from "@/lib/auth/assert-admin";
import { createNotification } from "@/lib/notifications/create-notification";

export const runtime = "nodejs";

const utcHm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24h)");

function hmMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

const patchSchema = z.object({
  status: z.enum(["approved", "rejected", "pending"]),
  note: z.string().max(1000).optional(),
  /** Final working hours (local wall clock). Defaults to employee-requested times when approving. */
  approvedStartHm: utcHm.optional(),
  approvedEndHm: utcHm.optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const { uid, email } = auth.decoded;

  const denied = await assertAdmin(uid, email);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!id?.trim()) return jsonError("Missing id", 400);

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
  const ref = db.collection("offsiteWorkRequests").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return jsonError("Not found", 404);

  const existing = snap.data() as {
    requestedStartHm?: string;
    requestedEndHm?: string;
    workerId?: string;
    date?: string;
  };

  const now = FieldValue.serverTimestamp();

  if (parsed.data.status === "pending") {
    await ref.update({
      status: "pending",
      reviewNote: null,
      reviewedByUid: FieldValue.delete(),
      reviewedByEmail: FieldValue.delete(),
      reviewedAt: FieldValue.delete(),
      approvedStartHm: FieldValue.delete(),
      approvedEndHm: FieldValue.delete(),
      updatedAt: now,
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.status === "rejected") {
    await ref.update({
      status: "rejected",
      reviewNote: parsed.data.note?.trim() || null,
      reviewedByUid: uid,
      reviewedByEmail: email ?? null,
      reviewedAt: now,
      approvedStartHm: FieldValue.delete(),
      approvedEndHm: FieldValue.delete(),
      updatedAt: now,
    });
    if (existing.workerId) {
      try {
        await createNotification(db, {
          userId: existing.workerId,
          title: "Off-site request rejected",
          body: parsed.data.note?.trim()
            ? `Your off-site work request for ${existing.date ?? ""} was rejected. Note: ${parsed.data.note.slice(0, 200)}`
            : `Your off-site work request for ${existing.date ?? ""} was rejected.`,
          kind: "offsite_rejected",
          link: "/dashboard/employee/requests/offsite",
        });
      } catch { /* non-critical */ }
    }
    return NextResponse.json({ ok: true });
  }

  const reqStart =
    typeof existing.requestedStartHm === "string" ? existing.requestedStartHm : "09:00";
  const reqEnd =
    typeof existing.requestedEndHm === "string" ? existing.requestedEndHm : "17:00";
  const start = parsed.data.approvedStartHm?.trim() || reqStart;
  const end = parsed.data.approvedEndHm?.trim() || reqEnd;

  if (hmMinutes(end) <= hmMinutes(start)) {
    return jsonError("Approved end time must be after start time (same day).", 400);
  }

  await ref.update({
    status: "approved",
    approvedStartHm: start,
    approvedEndHm: end,
    reviewNote: parsed.data.note?.trim() || null,
    reviewedByUid: uid,
    reviewedByEmail: email ?? null,
    reviewedAt: now,
    updatedAt: now,
  });

  // Notify worker on approval
  if (existing.workerId) {
    try {
      await createNotification(db, {
        userId: existing.workerId,
        title: "Off-site work approved ✓",
        body: `Your off-site work request for ${existing.date ?? ""} (${start}–${end}) has been approved.`,
        kind: "offsite_approved",
        link: "/dashboard/employee/requests/offsite",
      });
    } catch { /* non-critical */ }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireBearerUser(_req);
  if (!auth.ok) return auth.response;
  const { uid, email } = auth.decoded;

  const denied = await assertAdmin(uid, email);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!id?.trim()) return jsonError("Missing id", 400);

  const ref = adminDb().collection("offsiteWorkRequests").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return jsonError("Not found", 404);

  await ref.delete();
  return NextResponse.json({ ok: true });
}
