import { z } from "zod";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { adminDb, FieldValue } from "@/lib/firebase/admin";
import { isSuperAdminDecoded } from "@/lib/auth/super-admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  calendarMode: z.enum(["ad", "bs"]),
});

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  if (!isSuperAdminDecoded(auth.decoded)) {
    return jsonError("Only super admin can change calendar mode", 403);
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return jsonError("calendarMode must be ad or bs", 400);

  await adminDb().doc("system/appSettings").set(
    {
      calendarMode: parsed.data.calendarMode,
      calendarModeUpdatedAt: FieldValue.serverTimestamp(),
      calendarModeUpdatedBy: auth.decoded.uid,
    },
    { merge: true }
  );

  return Response.json({ ok: true, mode: parsed.data.calendarMode });
}
