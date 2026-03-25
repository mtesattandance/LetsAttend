import type { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json-error";
import { adminAuth, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import type { DecodedIdToken } from "firebase-admin/auth";

export async function verifyIdTokenFromRequest(
  req: Request
): Promise<DecodedIdToken | null> {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const token = h.slice(7).trim();
  if (!token) return null;
  try {
    return await adminAuth().verifyIdToken(token);
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[verifyIdTokenFromRequest]", e);
    }
    return null;
  }
}

/**
 * Verifies the caller’s Firebase ID token. Returns **503** if Firebase Admin is not configured
 * (so token verification is impossible — often misread as “Unauthorized”).
 */
export async function requireBearerUser(
  req: Request
): Promise<
  | { ok: true; decoded: DecodedIdToken }
  | { ok: false; response: NextResponse }
> {
  if (!isFirebaseAdminConfigured()) {
    return {
      ok: false,
      response: jsonError(
        "Server configuration: Firebase Admin is not set (missing service account). Add FIREBASE_SERVICE_ACCOUNT_KEY (one-line JSON), FIREBASE_SERVICE_ACCOUNT_KEY_FILE, or GOOGLE_APPLICATION_CREDENTIALS — the server cannot verify your login without it.",
        503
      ),
    };
  }
  const decoded = await verifyIdTokenFromRequest(req);
  if (!decoded) {
    return {
      ok: false,
      response: jsonError(
        "Unauthorized — invalid or expired session. Sign out and sign in again.",
        401
      ),
    };
  }
  return { ok: true, decoded };
}
