import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";

export const runtime = "nodejs";

const bodySchema = z.object({
  timeZone: z.string().min(1),
});

/**
 * Sets the signed-in user’s work time zone (IANA id), e.g. `Asia/Kathmandu` for Nepal.
 * Used to sync the browser/OS zone to Firestore (employees cannot patch `timeZone` from the client SDK).
 */
export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonError("Expected body: { \"timeZone\": \"IANA/Zone\" }", 400);
  }

  const tz = normalizeTimeZoneId(parsed.data.timeZone);
  const uid = auth.decoded.uid;

  await adminDb().collection("users").doc(uid).set({ timeZone: tz }, { merge: true });

  return NextResponse.json({ ok: true, timeZone: tz });
}
