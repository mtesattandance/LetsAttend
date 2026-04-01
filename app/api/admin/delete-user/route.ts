import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { isSuperAdminDecoded, isSuperAdminUserRow } from "@/lib/auth/super-admin";
import { releaseEmployeeId } from "@/lib/employee-id/allocator";

export const runtime = "nodejs";

const bodySchema = z.object({
  userId: z.string().min(1),
  confirmPhrase: z.literal("DELETE EMPLOYEE"),
});

async function deleteCollectionByWorkerId(workerId: string, collection: string, field = "workerId") {
  const db = adminDb();
  const snap = await db.collection(collection).where(field, "==", workerId).get();
  const docs = snap.docs;
  const chunk = 400;
  for (let i = 0; i < docs.length; i += chunk) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + chunk)) batch.delete(d.ref);
    await batch.commit();
  }
}

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  if (!(await isRequestAdmin(auth.decoded))) return jsonError("Forbidden", 403);

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return jsonError("Type exactly: DELETE EMPLOYEE", 400);

  const { userId } = parsed.data;
  if (userId === auth.decoded.uid) return jsonError("You cannot delete your own account here", 400);

  const db = adminDb();
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) return jsonError("User not found", 404);
  const targetRole = String(userDoc.get("role") ?? "employee");
  const targetEmail = String(userDoc.get("email") ?? "");
  const employeeId = userDoc.get("employeeId");

  if (isSuperAdminUserRow(targetEmail, targetRole)) {
    return jsonError("Super admin account cannot be deleted", 403);
  }
  if (targetRole !== "employee" && !isSuperAdminDecoded(auth.decoded)) {
    return jsonError("Only super admin can delete non-employee accounts", 403);
  }

  try {
    await Promise.all([
      deleteCollectionByWorkerId(userId, "attendance"),
      deleteCollectionByWorkerId(userId, "overtimeRequests"),
      deleteCollectionByWorkerId(userId, "offsiteWorkRequests"),
      deleteCollectionByWorkerId(userId, "notifications", "toUid"),
      db.collection("live_tracking").doc(userId).delete().catch(() => undefined),
      db.collection("users").doc(userId).delete().catch(() => undefined),
    ]);
    await releaseEmployeeId(db, employeeId);
    await adminAuth().deleteUser(userId);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to delete user", 500);
  }

  return Response.json({ ok: true });
}
