import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  if (!(await isRequestAdmin(auth.decoded))) return jsonError("Forbidden", 403);

  const { searchParams } = new URL(req.url);
  const workerId = searchParams.get("workerId");
  if (!workerId) return jsonError("workerId required", 400);

  const db = adminDb();
  const snap = await db.collection("workers").doc(workerId).get();
  const data = snap.data() ?? {};
  return NextResponse.json({ salarySheetAccess: data.salarySheetAccess === true });
}

export async function PATCH(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  if (!(await isRequestAdmin(auth.decoded))) return jsonError("Forbidden", 403);

  const body = (await req.json()) as { workerId?: string; salarySheetAccess?: boolean };
  if (!body.workerId || typeof body.workerId !== "string")
    return jsonError("workerId required", 400);
  if (typeof body.salarySheetAccess !== "boolean")
    return jsonError("salarySheetAccess must be boolean", 400);

  const db = adminDb();
  await db
    .collection("workers")
    .doc(body.workerId)
    .set({ salarySheetAccess: body.salarySheetAccess }, { merge: true });

  return NextResponse.json({ ok: true });
}
