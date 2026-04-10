import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { isSuperAdminDecoded, isSuperAdminUserRow } from "@/lib/auth/super-admin";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";
import { claimEmployeeId } from "@/lib/employee-id/allocator";

export const runtime = "nodejs";

// In-memory cache for the full users list — 2 min TTL
const CACHE_TTL_MS = 2 * 60_000;
let usersCache: { users: unknown[]; expiresAt: number } | null = null;

function invalidateUsersCache() {
  usersCache = null;
}

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  if (!(await isRequestAdmin(decoded))) {
    return jsonError("Forbidden", 403);
  }

  if (usersCache && usersCache.expiresAt > Date.now()) {
    const isSuperAdmin = isSuperAdminDecoded(decoded);
    const users = isSuperAdmin
      ? usersCache.users
      : (usersCache.users as Array<{ email: string; role: string }>).filter(
          (u) => !isSuperAdminUserRow(u.email, u.role)
        );
    return NextResponse.json({ users });
  }

  try {
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
    const allUsers = usersRaw.map((d) => ({ ...d }));
    allUsers.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    // Store full list in cache; filter per-request based on caller's role
    usersCache = { users: allUsers, expiresAt: Date.now() + CACHE_TTL_MS };

    const users = isSuperAdminDecoded(decoded)
      ? allUsers
      : allUsers.filter((u) => !isSuperAdminUserRow(u.email, u.role));

    return NextResponse.json({ users });
  } catch {
    // Quota exceeded or Firestore unavailable — serve stale cache if available
    const stale = usersCache;
    if (stale) {
      const isSuperAdmin = isSuperAdminDecoded(decoded);
      const users = isSuperAdmin
        ? stale.users
        : (stale.users as Array<{ email: string; role: string }>).filter(
            (u) => !isSuperAdminUserRow(u.email, u.role)
          );
      return NextResponse.json({ users });
    }
    return jsonError("Service temporarily unavailable, please try again shortly", 503);
  }
}
