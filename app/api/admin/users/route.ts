import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { isSuperAdminDecoded, isSuperAdminUserRow } from "@/lib/auth/super-admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  if (!(await isRequestAdmin(decoded))) {
    return jsonError("Forbidden", 403);
  }

  const snap = await adminDb().collection("users").get();
  let users = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: typeof data.name === "string" ? data.name : "",
      email: typeof data.email === "string" ? data.email : "",
      role: typeof data.role === "string" ? data.role : "employee",
      assignedSites: Array.isArray(data.assignedSites) ? data.assignedSites : [],
    };
  });

  if (!isSuperAdminDecoded(decoded)) {
    users = users.filter(
      (u) => !isSuperAdminUserRow(u.email, u.role)
    );
  }

  users.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return NextResponse.json({ users });
}
