import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB after client compression

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const user = auth.decoded;

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return jsonError("Blob storage not configured", 503);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const b = body as {
    base64?: string;
    filename?: string;
    contentType?: string;
  };
  if (!b.base64 || typeof b.base64 !== "string") {
    return jsonError("Missing base64", 400);
  }

  const comma = b.base64.indexOf(",");
  const raw =
    comma >= 0 ? b.base64.slice(comma + 1) : b.base64;
  const buffer = Buffer.from(raw, "base64");
  if (buffer.length > MAX_BYTES) {
    return jsonError("Image too large", 413);
  }

  const contentType =
    b.contentType && b.contentType.startsWith("image/")
      ? b.contentType
      : "image/webp";

  const safeName = (b.filename ?? "checkin.webp").replace(/[^\w.\-]/g, "_");
  const path = `selfies/${user.uid}/${Date.now()}-${safeName}`;

  // Must match the store setting in Vercel Dashboard → Storage → your Blob store.
  // Private is the default for new stores; public is only valid for "public" stores.
  const access =
    process.env.BLOB_STORE_ACCESS === "public" ? "public" : "private";

  try {
    const blob = await put(path, buffer, {
      access,
      token,
      contentType,
    });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    console.error(e);
    return jsonError("Upload failed", 500);
  }
}
