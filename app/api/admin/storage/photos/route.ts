import { del, list } from "@vercel/blob";
import { DateTime } from "luxon";
import { z } from "zod";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const DeleteSchema = z.object({
  fromMonth: MonthSchema,
  toMonth: MonthSchema,
  dryRun: z.boolean().optional(),
  limit: z.number().int().positive().max(5000).optional(),
});

function parseMonthStart(yyyyMm: string): DateTime {
  return DateTime.fromFormat(yyyyMm, "yyyy-MM", { zone: "utc" }).startOf("month");
}

function parseUploadInstant(pathname: string, uploadedAtRaw: unknown): DateTime | null {
  if (uploadedAtRaw instanceof Date) return DateTime.fromJSDate(uploadedAtRaw);
  const up = DateTime.fromJSDate(new Date(String(uploadedAtRaw)));
  if (up.isValid) return up;

  const base = pathname.split("/").pop() ?? "";
  const m = base.match(/^(\d{13})-/);
  if (!m?.[1]) return null;
  const ts = Number(m[1]);
  if (!Number.isFinite(ts)) return null;
  const d = DateTime.fromMillis(ts);
  return d.isValid ? d : null;
}

async function authorize(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return { ok: false as const, response: auth.response };
  if (!(await isRequestAdmin(auth.decoded))) {
    return { ok: false as const, response: jsonError("Forbidden", 403) };
  }
  return { ok: true as const };
}

async function collectMatches(fromMonth: string, toMonth: string, limit = 5000) {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN not configured");

  const from = parseMonthStart(fromMonth);
  const toExclusive = parseMonthStart(toMonth).plus({ months: 1 });
  if (!from.isValid || !toExclusive.isValid || toExclusive <= from) {
    throw new Error("Invalid month range");
  }

  const matches: Array<{ url: string; pathname: string; uploadedAtIso: string }> = [];
  let cursor: string | undefined;
  let scanned = 0;
  while (true) {
    const page = await list({ token, prefix: "selfies/", limit: 1000, cursor });
    for (const b of page.blobs) {
      scanned++;
      const when = parseUploadInstant(b.pathname, b.uploadedAt);
      if (!when) continue;
      if (when >= from && when < toExclusive) {
        matches.push({
          url: b.url,
          pathname: b.pathname,
          uploadedAtIso: when.toISO() ?? when.toString(),
        });
        if (matches.length >= limit) {
          return { matches, scanned };
        }
      }
    }
    if (!page.hasMore || !page.cursor) break;
    cursor = page.cursor;
  }
  return { matches, scanned };
}

export async function GET(req: Request) {
  const authz = await authorize(req);
  if (!authz.ok) return authz.response;

  const u = new URL(req.url);
  const fromMonth = u.searchParams.get("fromMonth");
  const toMonth = u.searchParams.get("toMonth");
  if (!fromMonth || !toMonth) {
    return jsonError("fromMonth and toMonth are required (yyyy-MM)", 400);
  }
  if (!MonthSchema.safeParse(fromMonth).success || !MonthSchema.safeParse(toMonth).success) {
    return jsonError("Month must be yyyy-MM", 400);
  }

  try {
    const limitRaw = Number(u.searchParams.get("limit") ?? "5000");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, limitRaw)) : 5000;
    const { matches, scanned } = await collectMatches(fromMonth, toMonth, limit);
    return Response.json({
      ok: true,
      fromMonth,
      toMonth,
      scannedCount: scanned,
      deleteCandidateCount: matches.length,
      sample: matches.slice(0, 20),
      truncated: matches.length >= limit,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to preview", 500);
  }
}

export async function DELETE(req: Request) {
  const authz = await authorize(req);
  if (!authz.ok) return authz.response;

  let parsed: z.infer<typeof DeleteSchema>;
  try {
    parsed = DeleteSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid body", 400);
  }

  const dryRun = parsed.dryRun === true;
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) return jsonError("BLOB_READ_WRITE_TOKEN not configured", 503);

    const { matches, scanned } = await collectMatches(
      parsed.fromMonth,
      parsed.toMonth,
      parsed.limit ?? 5000
    );

    if (!dryRun) {
      for (const item of matches) {
        await del(item.url, { token });
      }
    }

    return Response.json({
      ok: true,
      dryRun,
      fromMonth: parsed.fromMonth,
      toMonth: parsed.toMonth,
      scannedCount: scanned,
      deletedCount: dryRun ? 0 : matches.length,
      deleteCandidateCount: matches.length,
      sample: matches.slice(0, 20),
      truncated: matches.length >= (parsed.limit ?? 5000),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to delete", 500);
  }
}
