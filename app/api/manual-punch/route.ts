import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { assertAdmin } from "@/lib/auth/assert-admin";
import { serializeFirestoreForJson } from "@/lib/firestore/serialize-for-json";
import { createNotification } from "@/lib/notifications/create-notification";

export const runtime = "nodejs";

const utcHm = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d$/,
    "Use HH:mm on a 24-hour clock (local wall time in API)"
  );

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function hmMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

const segmentSchema = z.object({
  siteId: z.string().min(1),
  inHm: utcHm,
  outHm: utcHm,
});

const postSchema = z.object({
  date: z.string().regex(dateRe, "Use YYYY-MM-DD"),
  assigneeAdminUid: z.string().min(1),
  reason: z.string().min(2).max(2000),
  segments: z.array(segmentSchema).min(1).max(10), // Limit switches
});

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

  // Validate sequential times
  const segments = parsed.data.segments;
  let lastOut = -1;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const inM = hmMinutes(s.inHm);
    const outM = hmMinutes(s.outHm);
    if (outM <= inM) {
      return jsonError(`Segment ${i + 1}: End time must be after start time.`, 400);
    }
    if (inM < lastOut) {
      return jsonError(`Segment ${i + 1}: Start time cannot overlap the previous segment's end time.`, 400);
    }
    lastOut = outM;
  }

  const db = adminDb();
  const selfSnap = await db.collection("users").doc(uid).get();
  const role = selfSnap.get("role") as string | undefined;
  if (role !== "employee" && role !== "admin" && role !== "super_admin") {
    return jsonError("Only workspace members can submit", 403);
  }

  const assigneeSnap = await db.collection("users").doc(parsed.data.assigneeAdminUid).get();
  const ar = assigneeSnap.get("role") as string | undefined;
  if (!assigneeSnap.exists || (ar !== "admin" && ar !== "super_admin")) {
    return jsonError("Choose a valid admin assignee.", 400);
  }
  const assigneeName =
    typeof assigneeSnap.get("name") === "string" ? assigneeSnap.get("name") : null;
  const assigneeEmail =
    typeof assigneeSnap.get("email") === "string" ? assigneeSnap.get("email") : null;

  const name = selfSnap.get("name");
  const ref = db.collection("manualPunchRequests").doc();
  const now = FieldValue.serverTimestamp();
  
  await ref.set({
    workerId: uid,
    workerEmail: email ?? null,
    workerName: typeof name === "string" ? name : null,
    assigneeAdminUid: parsed.data.assigneeAdminUid,
    assigneeAdminName: assigneeName,
    assigneeAdminEmail: assigneeEmail,
    date: parsed.data.date,
    reason: parsed.data.reason.trim(),
    segments: parsed.data.segments,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  // Notify the assigned admin safely
  try {
    const workerLabel = (typeof name === "string" && name.trim()) ? name.trim() : (email ?? uid);
    await createNotification(db, {
      userId: parsed.data.assigneeAdminUid,
      title: "New Late/Missed Punch Request",
      body: `${workerLabel} requested manual attendance for ${parsed.data.date} (Sites: ${parsed.data.segments.length}). Reason: ${parsed.data.reason.slice(0, 120)}`,
      kind: "manual_punch_request",
      link: "/dashboard/admin/requests?tab=manual",
    });
  } catch { /* non-critical */ }

  return NextResponse.json({ ok: true, id: ref.id });
}

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const { uid, email } = auth.decoded;

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");

  const db = adminDb();
  const isAdmin = (await assertAdmin(uid, email)) === null;

  if (isAdmin) {
    const snap = await db
      .collection("manualPunchRequests")
      .orderBy("createdAt", "desc")
      .limit(300)
      .get();

    let items = snap.docs.map((d) =>
      serializeFirestoreForJson({ id: d.id, ...d.data() })
    ) as Record<string, unknown>[];
    if (statusFilter === "pending" || statusFilter === "approved" || statusFilter === "rejected") {
      items = items.filter((row) => (row as { status?: string }).status === statusFilter);
    }
    return NextResponse.json({ items });
  }

  const snap = await db
    .collection("manualPunchRequests")
    .where("workerId", "==", uid)
    .limit(100)
    .get();

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
