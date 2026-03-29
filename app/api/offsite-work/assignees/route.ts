import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { normalizeSuperAdminEmail } from "@/lib/auth/super-admin";

export const runtime = "nodejs";

function normalizedRole(roleRaw: unknown): string {
  if (typeof roleRaw !== "string") return "";
  return roleRaw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isAdminLikeRole(roleRaw: unknown): boolean {
  const r = normalizedRole(roleRaw);
  return r === "admin" || r === "super_admin" || r === "superadmin";
}

/** Admins / super_admins for off-site assignee picker (any signed-in member). */
export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const db = adminDb();
  const userSnap = await db.collection("users").doc(auth.decoded.uid).get();
  const role = userSnap.get("role") as string | undefined;
  const myNorm = normalizedRole(role);
  const canUse =
    myNorm === "employee" ||
    myNorm === "admin" ||
    myNorm === "super_admin" ||
    myNorm === "superadmin";
  if (!canUse) {
    return jsonError("Forbidden", 403);
  }

  const snap = await db.collection("users").get();
  const byId = new Map<
    string,
    { id: string; name: string; email: string; role: string }
  >();

  for (const d of snap.docs) {
    const data = d.data();
    if (!isAdminLikeRole(data.role)) continue;
    const nr = normalizedRole(data.role);
    byId.set(d.id, {
      id: d.id,
      name: typeof data.name === "string" ? data.name : "",
      email: typeof data.email === "string" ? data.email : "",
      role: nr === "super_admin" || nr === "superadmin" ? "super_admin" : "admin",
    });
  }

  const superEmail = normalizeSuperAdminEmail();
  if (superEmail) {
    try {
      const authUser = await adminAuth().getUserByEmail(superEmail);
      if (!byId.has(authUser.uid)) {
        byId.set(authUser.uid, {
          id: authUser.uid,
          name: authUser.displayName?.trim() || authUser.email?.split("@")[0] || "Super admin",
          email: authUser.email ?? superEmail,
          role: "super_admin",
        });
      }
    } catch {
      /* user may not exist in Auth */
    }
  }

  const assignees = Array.from(byId.values()).sort((a, b) => {
    const an = (a.name || a.email).localeCompare(b.name || b.email, undefined, {
      sensitivity: "base",
    });
    if (an !== 0) return an;
    return a.email.localeCompare(b.email, undefined, { sensitivity: "base" });
  });

  return NextResponse.json({ assignees });
}
