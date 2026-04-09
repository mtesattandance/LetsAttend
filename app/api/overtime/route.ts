import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { assertAdmin } from "@/lib/auth/assert-admin";
import { serializeFirestoreForJson } from "@/lib/firestore/serialize-for-json";
import { createNotification } from "@/lib/notifications/create-notification";

export const runtime = "nodejs";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const postSchema = z.object({
  siteId: z.string().min(1),
  date: z.string().regex(dateRe, "Use calendar date YYYY-MM-DD"),
  reason: z.string().min(3).max(2000),
});

/** Employee creates an overtime request. */
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
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }

  const db = adminDb();
  const userSnap = await db.collection("users").doc(uid).get();
  const role = userSnap.get("role") as string | undefined;
  if (role !== "employee" && role !== "admin" && role !== "super_admin") {
    return jsonError("Only workspace members can request overtime", 403);
  }

  const name = userSnap.get("name");
  const ref = db.collection("overtimeRequests").doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    workerId: uid,
    workerEmail: email ?? null,
    workerName: typeof name === "string" ? name : null,
    siteId: parsed.data.siteId.trim(),
    date: parsed.data.date,
    reason: parsed.data.reason.trim(),
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  // Notify all admins & super_admins about the new overtime request
  try {
    const adminSnap = await db.collection("users")
      .where("role", "in", ["admin", "super_admin"]).get();
    const workerLabel = (typeof name === "string" && name.trim()) ? name.trim() : (email ?? uid);
    await Promise.all(adminSnap.docs.map((ad) =>
      createNotification(db, {
        userId: ad.id,
        title: "New overtime request",
        body: `${workerLabel} has requested overtime for ${parsed.data.date}. Reason: ${parsed.data.reason.slice(0, 120)}`,
        kind: "overtime_request",
        link: "/dashboard/admin/overtime",
      })
    ));
  } catch { /* non-critical */ }

  return NextResponse.json({ ok: true, id: ref.id });
}

/**
 * Admin: all requests (newest first). Optional ?status=pending|approved|rejected
 * Non-admin: only their own requests.
 */
export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const { uid, email } = auth.decoded;

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");
  const siteIdFilter = searchParams.get("siteId");

  const db = adminDb();
  const isAdmin = (await assertAdmin(uid, email)) === null;

  if (isAdmin) {
    const snap = await db
      .collection("overtimeRequests")
      .orderBy("createdAt", "desc")
      .limit(300)
      .get();

    let items = snap.docs.map((d) =>
      serializeFirestoreForJson({ id: d.id, ...d.data() })
    ) as Record<string, unknown>[];
    if (statusFilter === "pending" || statusFilter === "approved" || statusFilter === "rejected") {
      items = items.filter((row) => (row as { status?: string }).status === statusFilter);
    }
    if (siteIdFilter?.trim()) {
      const sid = siteIdFilter.trim();
      items = items.filter((row) => (row as { siteId?: string | null }).siteId === sid);
    }
    return NextResponse.json({ items });
  }

  const snap = await db.collection("overtimeRequests").where("workerId", "==", uid).limit(100).get();
  const items = snap.docs
    .map((d) => serializeFirestoreForJson({ id: d.id, ...d.data() }) as Record<string, unknown>)
    .sort((a, b) => {
      const ta = (a.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
      const tb = (b.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
      return tb - ta;
    });
  let filtered = items;
  if (statusFilter === "pending" || statusFilter === "approved" || statusFilter === "rejected") {
    filtered = items.filter((row) => (row as { status?: string }).status === statusFilter);
  }
  return NextResponse.json({ items: filtered });
}
