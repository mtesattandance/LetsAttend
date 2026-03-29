import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { assertAdmin } from "@/lib/auth/assert-admin";
import { buildWorkerMonthWorkingHours } from "@/lib/attendance/month-working-hours";

export const runtime = "nodejs";

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  workerId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    month: url.searchParams.get("month") ?? "",
    workerId: url.searchParams.get("workerId")?.trim() || undefined,
  });
  if (!parsed.success) {
    return jsonError("month=YYYY-MM required; optional workerId (admin)", 400);
  }

  const targetWorkerId = parsed.data.workerId || auth.decoded.uid;
  if (targetWorkerId !== auth.decoded.uid) {
    const denied = await assertAdmin(auth.decoded.uid, auth.decoded.email);
    if (denied) return denied;
  }

  try {
    const payload = await buildWorkerMonthWorkingHours(
      adminDb(),
      targetWorkerId,
      parsed.data.month
    );
    return NextResponse.json(payload);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed", 400);
  }
}
