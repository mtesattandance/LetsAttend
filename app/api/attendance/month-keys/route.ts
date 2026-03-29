import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

/**
 * Returns the set of calendar day keys (YYYY-MM-DD) for which the signed-in
 * worker has an attendance record in the requested month.
 *
 * GET /api/attendance/month-keys?year=2024&month=3
 * → { days: ["2024-03-01", "2024-03-05", ...] }
 */
export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const { uid } = auth.decoded;

  const url = new URL(req.url);
  const year = parseInt(url.searchParams.get("year") ?? "", 10);
  const month = parseInt(url.searchParams.get("month") ?? "", 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return jsonError("year and month (1–12) query params required", 400);
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const startDay = `${year}-${pad(month)}-01`;
  const nm = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const endDay = `${nm.year}-${pad(nm.month)}-01`;

  const snap = await adminDb()
    .collection("attendance")
    .where("workerId", "==", uid)
    .where("date", ">=", startDay)
    .where("date", "<", endDay)
    .get();

  const days = snap.docs
    .map((d) => d.data().date as string | undefined)
    .filter((d): d is string => typeof d === "string" && d.length > 0);

  return NextResponse.json({ days });
}
