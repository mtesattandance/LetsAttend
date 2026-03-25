import type { DecodedIdToken } from "firebase-admin/auth";
import { adminDb } from "@/lib/firebase/admin";

export async function isRequestAdmin(decoded: DecodedIdToken): Promise<boolean> {
  const superEmail = process.env.SUPER_ADMIN_EMAIL;
  if (superEmail && decoded.email === superEmail) return true;

  const snap = await adminDb().collection("users").doc(decoded.uid).get();
  const role = snap.get("role") as string | undefined;
  return role === "admin" || role === "super_admin";
}
