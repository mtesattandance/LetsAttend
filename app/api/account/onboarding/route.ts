import { z } from "zod";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { claimEmployeeId } from "@/lib/employee-id/allocator";

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

  const db = adminDb();
  const userRef = db.collection("users").doc(auth.decoded.uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return jsonError("User profile not found", 404);

  const role = String(userSnap.get("role") ?? "employee");
  let employeeId = userSnap.get("employeeId");
  if (role === "employee" && (typeof employeeId !== "string" || !employeeId.trim())) {
    employeeId = await claimEmployeeId(db);
  }

  await userRef.set(
    {
      designation: parsed.data.designation,
      ...(typeof employeeId === "string" && employeeId.trim() ? { employeeId } : {}),
      onboardingCompletedAt: new Date(),
    },
    { merge: true }
  );

  return Response.json({ ok: true, employeeId: typeof employeeId === "string" ? employeeId : null });
}
