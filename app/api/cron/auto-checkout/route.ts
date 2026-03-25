import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json-error";
import { runAutoCheckout } from "@/lib/attendance/run-auto-checkout";

export const runtime = "nodejs";

/**
 * Call on a schedule (e.g. Vercel Cron every 15m) with header:
 *   Authorization: Bearer CRON_SECRET
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return jsonError("CRON_SECRET not configured", 503);
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return jsonError("Unauthorized", 401);
  }

  const result = await runAutoCheckout();
  return NextResponse.json({
    ok: true,
    processed: result.processed,
    errors: result.errors,
  });
}
