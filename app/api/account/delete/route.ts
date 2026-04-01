import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { releaseEmployeeId } from "@/lib/employee-id/allocator";

export const runtime = "nodejs";

const bodySchema = z.object({
  confirmPhrase: z.literal("DELETE MY ACCOUNT"),
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
    return jsonError('Type exactly: DELETE MY ACCOUNT', 400);
  }

  const uid = decoded.uid;
  const db = adminDb();
  const userSnap = await db.collection("users").doc(uid).get();
  const employeeId = userSnap.get("employeeId");

  try {
    const attSnap = await db.collection("attendance").where("workerId", "==", uid).get();
    const docs = attSnap.docs;
    const chunk = 400;
    for (let i = 0; i < docs.length; i += chunk) {
      const b = db.batch();
      docs.slice(i, i + chunk).forEach((d) => b.delete(d.ref));
      await b.commit();
    }
  } catch (e) {
    console.error(e);
  }

  try {
    await db.collection("live_tracking").doc(uid).delete();
  } catch {
    /* ignore */
  }

  try {
    await db.collection("users").doc(uid).delete();
  } catch {
    /* ignore */
  }

  try {
    await releaseEmployeeId(db, employeeId);
  } catch {
    /* ignore */
  }

  try {
    await adminAuth().deleteUser(uid);
  } catch (e) {
    console.error(e);
    return jsonError("Could not delete auth user", 500);
  }

  return NextResponse.json({ ok: true });
}
