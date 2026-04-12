import { NextResponse } from "next/server";
import { z } from "zod";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { serializeFirestoreForJson } from "@/lib/firestore/serialize-for-json";

export const runtime = "nodejs";

// In-memory cache: uid → { items, expiresAt }
const CACHE_TTL_MS = 10 * 60_000; // 10 minutes
const notifCache = new Map<string, { items: unknown[]; expiresAt: number }>();

function createdAtMs(data: Record<string, unknown>): number {
  const c = data.createdAt;
  if (c instanceof Timestamp) return c.toMillis();
  return 0;
}

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const { uid } = auth.decoded;

  const skipCache = new URL(req.url).searchParams.get("fresh") === "1";

  if (!skipCache) {
    const cached = notifCache.get(uid);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ items: cached.items });
    }
  }

  try {
    const db = adminDb();
    /** Equality-only query avoids a composite index; we sort in memory. */
    const snap = await db
      .collection("notifications")
      .where("userId", "==", uid)
      .limit(100)
      .get();

    const items = snap.docs
      .map((d) => ({ d, ms: createdAtMs(d.data() as Record<string, unknown>) }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 60)
      .map(({ d }) => serializeFirestoreForJson({ id: d.id, ...d.data() }));

    if (!skipCache) {
      notifCache.set(uid, { items, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return NextResponse.json({ items });
  } catch {
    // Quota exceeded or other Firestore error — serve stale cache if available, else empty
    const stale = notifCache.get(uid);
    return NextResponse.json({ items: stale?.items ?? [] });
  }
}

const markReadSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export async function PATCH(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const { uid } = auth.decoded;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  const parsed = markReadSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }

  const db = adminDb();
  const refs = parsed.data.ids.map((id) => db.collection("notifications").doc(id));
  const snaps = await db.getAll(...refs);
  const batch = db.batch();
  for (const s of snaps) {
    if (!s.exists) continue;
    const row = s.data() as { userId?: string };
    if (row.userId !== uid) continue;
    batch.update(s.ref, { read: true, readAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
  notifCache.delete(uid); // invalidate so next GET reflects updated read state
  return NextResponse.json({ ok: true });
}
