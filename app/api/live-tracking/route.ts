import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

/** Rejects after `ms` milliseconds — used to cap Firestore writes. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), ms)
    ),
  ]);
}

const bodySchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  accuracyM: z.number().finite().optional(),
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
  const { latitude, longitude, accuracyM } = parsed.data;

  const db = adminDb();
  const ref = db.collection("live_tracking").doc(decoded.uid);
  const now = FieldValue.serverTimestamp();

  const payload = {
    workerId: decoded.uid,
    location: {
      latitude,
      longitude,
      ...(accuracyM != null ? { accuracyM } : {}),
    },
    lastUpdated: now,
  };

  try {
    // Primary write: update live position — cap at 10 s to avoid the 60 s
    // gRPC deadline. On DEADLINE_EXCEEDED / timeout, return 503 immediately.
    await withTimeout(ref.set(payload, { merge: true }), 10_000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg === "TIMEOUT" || /DEADLINE_EXCEEDED/i.test(msg);
    console.error("[live-tracking] primary write failed:", msg);
    return NextResponse.json(
      { ok: false, error: isTimeout ? "Firestore temporarily unavailable" : msg },
      { status: 503 }
    );
  }

  // Audit log: fire-and-forget — never block or fail the response.
  db.collection("live_tracking_logs")
    .add({ workerId: decoded.uid, at: now, ...payload.location })
    .catch((err: unknown) => {
      console.warn(
        "[live-tracking] audit log write failed (non-critical):",
        err instanceof Error ? err.message : err
      );
    });

  return NextResponse.json({ ok: true });
}
