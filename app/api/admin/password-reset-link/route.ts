import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { isSuperAdminDecoded, normalizeSuperAdminEmail } from "@/lib/auth/super-admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
});

/**
 * Passwords are never stored or readable (Firebase Auth hashes them).
 * Admins can generate a one-time reset link to share with the user securely.
 */
export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  if (!(await isRequestAdmin(decoded))) {
    return jsonError("Forbidden", 403);
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

  const email = parsed.data.email.trim().toLowerCase();
  const superEmail = normalizeSuperAdminEmail();
  if (superEmail && email === superEmail && !isSuperAdminDecoded(decoded)) {
    return jsonError("Forbidden", 403);
  }

  try {
    const link = await adminAuth().generatePasswordResetLink(email);
    return NextResponse.json({ ok: true, resetLink: link });
  } catch {
    return jsonError(
      "Could not generate reset link (user may not exist or email is invalid).",
      400
    );
  }
}
