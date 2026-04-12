import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { assertAdmin } from "@/lib/auth/assert-admin";
import { createNotification } from "@/lib/notifications/create-notification";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(["approved", "rejected", "pending"]),
  note: z.string().max(1000).optional(),
  /** Required when approving if the request has no site yet. */
  siteId: z.string().min(1).optional(),
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
  const ref = db.collection("overtimeRequests").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return jsonError("Not found", 404);

  const existing = snap.data() as {
    siteId?: string | null;
    workerId?: string;
    date?: string;
  };

  const mergedSite =
    (parsed.data.siteId?.trim() ? parsed.data.siteId.trim() : null) ??
    (typeof existing.siteId === "string" && existing.siteId.trim()
      ? existing.siteId.trim()
      : null);

  const now = FieldValue.serverTimestamp();

  /** Back to queue: clears review + overtime GPS rows so the worker can start fresh after re-approval. */
  if (parsed.data.status === "pending") {
    await ref.update({
      status: "pending",
      reviewNote: null,
      reviewedByUid: FieldValue.delete(),
      reviewedByEmail: FieldValue.delete(),
      reviewedAt: FieldValue.delete(),
      overtimeCheckIn: FieldValue.delete(),
      overtimeCheckOut: FieldValue.delete(),
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
      updatedAt: now,
      overtimeCheckIn: FieldValue.delete(),
      overtimeCheckOut: FieldValue.delete(),
    });
    // Notify worker
    if (existing.workerId) {
      try {
        await createNotification(db, {
          userId: existing.workerId,
          title: "Overtime request rejected",
          body: parsed.data.note?.trim()
            ? `Your overtime request for ${existing.date ?? ""} was rejected. Note: ${parsed.data.note.slice(0, 200)}`
            : `Your overtime request for ${existing.date ?? ""} was rejected.`,
          kind: "overtime_rejected",
          link: "/dashboard/employee/requests/overtime",
        });
      } catch { /* non-critical */ }
    }
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.status === "approved") {
    if (!mergedSite) {
      return jsonError(
        "Assign a work site before approving (employees need a site for overtime GPS check-in).",
        400
      );
    }
    const hasIn =
      existing &&
      typeof (existing as { overtimeCheckIn?: unknown }).overtimeCheckIn === "object" &&
      ((existing as { overtimeCheckIn?: { time?: unknown } }).overtimeCheckIn?.time ?? null) != null;
    const hasOut =
      existing &&
      typeof (existing as { overtimeCheckOut?: unknown }).overtimeCheckOut === "object" &&
      ((existing as { overtimeCheckOut?: { time?: unknown } }).overtimeCheckOut?.time ?? null) != null;
    if (!hasIn || !hasOut) {
      return jsonError(
        "Approve after overtime is completed. Worker must submit both overtime check-in and check-out first.",
        400
      );
    }
  }

  const update: Record<string, unknown> = {
    status: parsed.data.status,
    reviewNote: parsed.data.note?.trim() || null,
    reviewedByUid: uid,
    reviewedByEmail: email ?? null,
    reviewedAt: now,
    updatedAt: now,
  };

  if (parsed.data.status === "approved") {
    update.siteId = mergedSite;
  }

  await ref.update(update);

  // Notify worker on approval
  if (parsed.data.status === "approved" && existing.workerId) {
    try {
      await createNotification(db, {
        userId: existing.workerId,
        title: "Overtime request approved ✓",
        body: `Your completed overtime for ${existing.date ?? ""} has been approved.`,
        kind: "overtime_approved",
        link: "/dashboard/employee/requests/overtime",
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

  const ref = adminDb().collection("overtimeRequests").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return jsonError("Not found", 404);

  await ref.delete();
  return NextResponse.json({ ok: true });
}
