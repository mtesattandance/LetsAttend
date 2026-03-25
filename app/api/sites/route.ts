import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  const db = adminDb();
  const userSnap = await db.collection("users").doc(decoded.uid).get();
  const role = userSnap.get("role") as string | undefined;
  const assigned: string[] = userSnap.get("assignedSites") ?? [];

  const sitesSnap = await db.collection("sites").get();
  const all = sitesSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  if (role === "employee" && assigned.length > 0) {
    const allowed = new Set(assigned);
    return NextResponse.json({
      sites: all.filter((s) => allowed.has(s.id as string)),
    });
  }

  return NextResponse.json({ sites: all });
}
