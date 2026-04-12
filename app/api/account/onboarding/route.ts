import { z } from "zod";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { claimEmployeeId } from "@/lib/employee-id/allocator";
import { createNotification } from "@/lib/notifications/create-notification";

export const runtime = "nodejs";

const bodySchema = z.object({
  designation: z.string().trim().min(2).max(80),
});

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return jsonError("Designation is required", 400);

  try {
    const db = adminDb();
    const userRef = db.collection("users").doc(auth.decoded.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return jsonError("User profile not found", 404);

    const role = String(userSnap.get("role") ?? "employee");
    let employeeId = userSnap.get("employeeId");
    if (role === "employee" && (typeof employeeId !== "string" || !employeeId.trim())) {
      employeeId = await claimEmployeeId(db);
    }

    const existingAccess = userSnap.get("workspaceAccessStatus") as string | undefined;
    const needsLoginApproval =
      role === "employee" && existingAccess !== "approved" && existingAccess !== "rejected";

    await userRef.set(
      {
        designation: parsed.data.designation,
        ...(typeof employeeId === "string" && employeeId.trim() ? { employeeId } : {}),
        onboardingCompletedAt: new Date(),
        ...(needsLoginApproval ? { workspaceAccessStatus: "pending" as const } : {}),
      },
      { merge: true }
    );

    if (needsLoginApproval) {
      try {
        const adminSnap = await db
          .collection("users")
          .where("role", "in", ["admin", "super_admin"])
          .get();
        const workerLabel =
          (typeof userSnap.get("name") === "string" && String(userSnap.get("name")).trim()) ||
          auth.decoded.email ||
          auth.decoded.uid;
        await Promise.all(
          adminSnap.docs.map((ad) =>
            createNotification(db, {
              userId: ad.id,
              title: "Login access request",
              body: `${workerLabel} completed onboarding and is waiting for workspace access.`,
              kind: "login_request",
              link: "/dashboard/admin/requests?tab=login",
            })
          )
        );
      } catch {
        /* non-critical */
      }
    }

    return Response.json({ ok: true, employeeId: typeof employeeId === "string" ? employeeId : null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return jsonError(msg, 503);
  }
}
