import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { assertAdmin } from "@/lib/auth/assert-admin";
import { createNotification } from "@/lib/notifications/create-notification";

export const runtime = "nodejs";

const bodySchema = z.object({
  workerId: z.string().min(1),
  action: z.enum(["approve", "reject"]),
});

/** Admin approves or rejects an employee's workspace (login) access after onboarding. */
export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const { uid, email } = auth.decoded;

  const forbidden = await assertAdmin(uid, email);
  if (forbidden) return forbidden;

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

  const db = adminDb();
  const workerRef = db.collection("users").doc(parsed.data.workerId);
  const workerSnap = await workerRef.get();
  if (!workerSnap.exists) return jsonError("User not found", 404);
  const role = workerSnap.get("role") as string | undefined;
  if (role !== "employee") {
    return jsonError("Only employee accounts use workspace access review", 400);
  }

  const status = parsed.data.action === "approve" ? "approved" : "rejected";
  await workerRef.set(
    {
      workspaceAccessStatus: status,
      workspaceAccessUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const name = workerSnap.get("name");
  const workerEmail = workerSnap.get("email");
  const label =
    (typeof name === "string" && name.trim()) ||
    (typeof workerEmail === "string" && workerEmail.trim()) ||
    parsed.data.workerId;

  try {
    await createNotification(db, {
      userId: parsed.data.workerId,
      title:
        parsed.data.action === "approve"
          ? "Workspace access approved"
          : "Workspace access not approved",
      body:
        parsed.data.action === "approve"
          ? "You can now use the full dashboard. Thank you for your patience."
          : "An admin did not approve workspace access yet. You can submit a new request from Requests → Login request, or contact your supervisor.",
      kind: parsed.data.action === "approve" ? "login_approved" : "login_rejected",
      link: "/dashboard/employee/requests/login",
    });
  } catch {
    /* non-critical */
  }

  return NextResponse.json({ ok: true, status, workerLabel: label });
}
