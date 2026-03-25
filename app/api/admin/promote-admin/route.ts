import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isSuperAdminDecoded } from "@/lib/auth/super-admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  if (!isSuperAdminDecoded(decoded)) {
    return jsonError("Only the super admin can promote users to admin.", 403);
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
  const emailToPromote = parsed.data.email.trim().toLowerCase();

  const q = await db
    .collection("users")
    .where("email", "==", emailToPromote)
    .limit(1)
    .get();

  if (q.empty) return jsonError("User not found", 404);

  const target = q.docs[0]!;
  const currentRole = target.get("role") as string | undefined;
  if (currentRole === "super_admin") {
    return jsonError("Cannot modify super_admin role", 403);
  }

  // Allow admin promotion to admin.
  await target.ref.set(
    {
      role: "admin",
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, uid: target.id });
}

