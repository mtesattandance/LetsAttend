import { FieldValue } from "firebase-admin/firestore";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { createNotification } from "@/lib/notifications/create-notification";

export const runtime = "nodejs";

/** Employee re-submits a workspace (login) access request after rejection. */
export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const db = adminDb();
  const userRef = db.collection("users").doc(auth.decoded.uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return jsonError("User profile not found", 404);

  const role = String(userSnap.get("role") ?? "employee");
  if (role !== "employee") {
    return jsonError("Only employees use this request", 403);
  }

  const current = userSnap.get("workspaceAccessStatus") as string | undefined;
  if (current === "pending") {
    return jsonError("A request is already pending review", 400);
  }
  if (current === "approved" || current === undefined) {
    return jsonError("Workspace access is already active", 400);
  }
  if (current !== "rejected") {
    return jsonError("Cannot submit a request in the current state", 400);
  }

  await userRef.set(
    {
      workspaceAccessStatus: "pending",
      workspaceAccessUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  try {
    const adminSnap = await db.collection("users").where("role", "in", ["admin", "super_admin"]).get();
    const workerLabel =
      (typeof userSnap.get("name") === "string" && String(userSnap.get("name")).trim()) ||
      auth.decoded.email ||
      auth.decoded.uid;
    await Promise.all(
      adminSnap.docs.map((ad) =>
        createNotification(db, {
          userId: ad.id,
          title: "Login access request",
          body: `${workerLabel} submitted a new workspace access request.`,
          kind: "login_request",
          link: "/dashboard/admin/requests?tab=login",
        })
      )
    );
  } catch {
    /* non-critical */
  }

  return Response.json({ ok: true });
}
