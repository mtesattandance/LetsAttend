import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { requireBearerUser } from "@/lib/auth/verify-request";

export const runtime = "nodejs";

const querySchema = z.object({
  workerId: z.string().min(1),
});

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;
  if (!(await isRequestAdmin(decoded))) return jsonError("Forbidden", 403);

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    workerId: url.searchParams.get("workerId") ?? "",
  });
  if (!parsed.success) {
    return jsonError("workerId required", 400);
  }

  const snap = await adminDb()
    .collection("attendance")
    .where("workerId", "==", parsed.data.workerId)
    .get();

  const dates: string[] = [];
  for (const d of snap.docs) {
    const data = d.data() as { date?: unknown };
    if (typeof data.date === "string") dates.push(data.date);
  }

  return NextResponse.json({ dates });
}
