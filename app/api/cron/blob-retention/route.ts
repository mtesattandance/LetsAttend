import { del, list } from "@vercel/blob";
import { DateTime } from "luxon";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

/**
 * Monthly cleanup policy:
 * - Keep rolling 6 months of images.
 * - When data is older than 9 months, effectively oldest 3 months are removed.
 * Call with:
 *   Authorization: Bearer CRON_SECRET
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!secret) return jsonError("CRON_SECRET not configured", 503);
  if (!token) return jsonError("BLOB_READ_WRITE_TOKEN not configured", 503);
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonError("Unauthorized", 401);
  }

  const cutoff = DateTime.now().minus({ months: 6 });
  const deleted: string[] = [];
  let cursor: string | undefined;

  while (true) {
    const page = await list({
      token,
      prefix: "selfies/",
      limit: 1000,
      cursor,
    });
    for (const b of page.blobs) {
      const uploaded = DateTime.fromJSDate(
        b.uploadedAt instanceof Date ? b.uploadedAt : new Date(String(b.uploadedAt))
      );
      if (uploaded.isValid && uploaded < cutoff) {
        await del(b.url, { token });
        deleted.push(b.pathname);
      }
    }
    if (!page.hasMore || !page.cursor) break;
    cursor = page.cursor;
  }

  return Response.json({
    ok: true,
    deletedCount: deleted.length,
    cutoffIso: cutoff.toISO(),
  });
}
