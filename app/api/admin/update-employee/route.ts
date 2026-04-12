import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;
  if (!(await isRequestAdmin(decoded))) return jsonError("Forbidden", 403);

  const body = (await req.json()) as {
    workerId?: string;
    name?: unknown;
    designation?: unknown;
    employeeId?: unknown;
  };

  const { workerId } = body;
  if (!workerId || typeof workerId !== "string")
    return jsonError("workerId required", 400);

  const db = adminDb();
  const docRef = db.collection("users").doc(workerId);
  const snap = await docRef.get();
  if (!snap.exists) return jsonError("Worker not found", 404);

  const update: Record<string, string> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim())
      return jsonError("name must be a non-empty string", 400);
    update.name = body.name.trim();
  }

  if (body.designation !== undefined) {
    if (typeof body.designation !== "string")
      return jsonError("designation must be a string", 400);
    update.designation = body.designation.trim();
  }

  if (body.employeeId !== undefined) {
    if (typeof body.employeeId !== "string")
      return jsonError("employeeId must be a string", 400);
    update.employeeId = body.employeeId.trim();
  }

  if (Object.keys(update).length === 0)
    return jsonError("At least one field to update is required", 400);

  await docRef.set(update, { merge: true });
  return NextResponse.json({ ok: true });
}
