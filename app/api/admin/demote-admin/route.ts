import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import {
  isSuperAdminDecoded,
  normalizeSuperAdminEmail,
} from "@/lib/auth/super-admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  if (!isSuperAdminDecoded(decoded)) {
    return jsonError("Only the super admin can remove admin access.", 403);
  }

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
  const emailTarget = parsed.data.email.trim().toLowerCase();
  const superEmail = normalizeSuperAdminEmail();
  if (superEmail && emailTarget === superEmail) {
    return jsonError("Cannot change role for the super admin account.", 400);
  }

  const q = await db
    .collection("users")
    .where("email", "==", emailTarget)
    .limit(1)
    .get();

  if (q.empty) return jsonError("User not found", 404);

  const target = q.docs[0]!;
  const currentRole = target.get("role") as string | undefined;

  if (currentRole === "super_admin") {
    return jsonError("Cannot demote a super_admin role.", 403);
  }
  if (currentRole !== "admin") {
    return jsonError("User is not an admin.", 400);
  }

  await target.ref.set({ role: "employee" }, { merge: true });

  return NextResponse.json({ ok: true, uid: target.id });
}
