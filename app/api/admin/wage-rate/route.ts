import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;
  if (!(await isRequestAdmin(decoded))) return jsonError("Forbidden", 403);

  const { searchParams } = new URL(req.url);
  const workerId = searchParams.get("workerId");
  if (!workerId) return jsonError("workerId required", 400);

  const db = adminDb();
  const doc = await db.collection("users").doc(workerId).get();
  if (!doc.exists) return jsonError("Worker not found", 404);

  const data = doc.data();
  const wageRate = typeof data?.wageRate === "number" ? data.wageRate : null;
  const overtimeRate = typeof data?.overtimeRate === "number" ? data.overtimeRate : null;

  return NextResponse.json({ wageRate, overtimeRate });
}

export async function PATCH(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;
  if (!(await isRequestAdmin(decoded))) return jsonError("Forbidden", 403);

  const body = (await req.json()) as { workerId?: string; wageRate?: unknown; overtimeRate?: unknown };
  const { workerId } = body;

  if (!workerId || typeof workerId !== "string")
    return jsonError("workerId required", 400);

  const update: Record<string, number> = {};

  if (body.wageRate !== undefined) {
    if (typeof body.wageRate !== "number" || body.wageRate < 0)
      return jsonError("wageRate must be a non-negative number", 400);
    update.wageRate = body.wageRate;
  }

  if (body.overtimeRate !== undefined) {
    if (typeof body.overtimeRate !== "number" || body.overtimeRate < 0)
      return jsonError("overtimeRate must be a non-negative number", 400);
    update.overtimeRate = body.overtimeRate;
  }

  if (Object.keys(update).length === 0)
    return jsonError("At least one of wageRate or overtimeRate required", 400);

  const db = adminDb();
  await db.collection("users").doc(workerId).set(update, { merge: true });

  return NextResponse.json({ ok: true });
}
