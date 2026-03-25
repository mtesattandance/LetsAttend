import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

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

  await ref.set(
    {
      workerId: decoded.uid,
      location: {
        latitude,
        longitude,
        ...(accuracyM != null ? { accuracyM } : {}),
      },
      lastUpdated: now,
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true });
}
