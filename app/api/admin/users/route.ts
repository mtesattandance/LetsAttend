import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { isSuperAdminDecoded, isSuperAdminUserRow } from "@/lib/auth/super-admin";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";
import { claimEmployeeId } from "@/lib/employee-id/allocator";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  if (!(await isRequestAdmin(decoded))) {
    return jsonError("Forbidden", 403);
  }

  const db = adminDb();
  const snap = await db.collection("users").get();
  const usersRaw = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data();
      const role = typeof data.role === "string" ? data.role : "employee";
      let employeeId = typeof data.employeeId === "string" ? data.employeeId.trim() : "";
      // Backfill missing employee IDs for legacy employee accounts.
      if (role === "employee" && !employeeId) {
        employeeId = await claimEmployeeId(db);
        await d.ref.set({ employeeId }, { merge: true });
      }
      return {
        id: d.id,
        employeeId,
        name: typeof data.name === "string" ? data.name : "",
        email: typeof data.email === "string" ? data.email : "",
        role,
        assignedSites: Array.isArray(data.assignedSites) ? data.assignedSites : [],
        timeZone: normalizeTimeZoneId(
          typeof data.timeZone === "string" ? data.timeZone : undefined
        ),
      };
    })
  );
  let users = usersRaw.map((d) => {
    return {
      ...d,
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
