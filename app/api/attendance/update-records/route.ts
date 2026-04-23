import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, FieldValue } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { assertAdmin } from "@/lib/auth/assert-admin";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

const schema = z.object({
  workerId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  edits: z.array(
    z.object({
      rowId: z.string().min(1),
      inTime: z.string(),
      outTime: z.string(),
      dutyHours: z.union([z.number(), z.string()]),
      workPlace: z.string(),
      remark: z.string(),
    })
  ),
});

export async function PATCH(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const denied = await assertAdmin(auth.decoded.uid, auth.decoded.email);
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid body data", 400);

    const db = adminDb();
    const batch = db.batch();

    for (const edit of parsed.data.edits) {
      const docId = `${parsed.data.workerId}_${edit.rowId}`;
      const ref = db.collection("attendance_edits").doc(docId);
      
      batch.set(ref, {
        workerId: parsed.data.workerId,
        month: parsed.data.month,
        rowId: edit.rowId,
        inTime: edit.inTime,
        outTime: edit.outTime,
        dutyHours: Number(edit.dutyHours) || 0,
        workPlace: edit.workPlace,
        remark: edit.remark,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.decoded.uid,
      }, { merge: true });
    }

    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to update", 500);
  }
}
