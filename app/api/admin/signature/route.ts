import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

const AddBodySchema = z.object({
  adminId: z.string().min(1),
  signatureDataUrl: z.string().min(1),
  label: z.string().trim().min(1).max(60).optional(),
});

const SetDefaultBodySchema = z.object({
  adminId: z.string().min(1),
  signatureId: z.string().min(1),
});

const DeleteBodySchema = z.object({
  adminId: z.string().min(1),
  signatureId: z.string().min(1),
});

type StoredSignature = {
  id: string;
  label: string;
  dataUrl: string;
  createdAt: string;
};

async function loadAdminDoc(adminId: string) {
  const db = adminDb();
  const targetRef = db.collection("users").doc(adminId);
  const snap = await targetRef.get();
  if (!snap.exists) return { error: jsonError("Admin user not found", 404) as Response };
  const role = String(snap.get("role") ?? "");
  if (role !== "admin" && role !== "super_admin") {
    return { error: jsonError("Target user is not admin", 400) as Response };
  }
  return { targetRef, snap };
}

function normalizedSignatures(raw: unknown): StoredSignature[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredSignature[] = [];
  for (const item of raw) {
    const x = item as Partial<StoredSignature>;
    if (
      typeof x?.id === "string" &&
      typeof x?.label === "string" &&
      typeof x?.dataUrl === "string" &&
      typeof x?.createdAt === "string" &&
      x.dataUrl.startsWith("data:image/")
    ) {
      out.push({ id: x.id, label: x.label, dataUrl: x.dataUrl, createdAt: x.createdAt });
    }
  }
  return out;
}

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  if (!(await isRequestAdmin(auth.decoded))) return jsonError("Forbidden", 403);

  let parsed: z.infer<typeof AddBodySchema>;
  try {
    parsed = AddBodySchema.parse(await req.json());
  } catch {
    return jsonError("Invalid body", 400);
  }

  const sig = parsed.signatureDataUrl.trim();
  if (!sig.startsWith("data:image/")) {
    return jsonError("signatureDataUrl must be an image data URL", 400);
  }
  if (sig.length > 800_000) {
    return jsonError("Signature image too large", 413);
  }

  const loaded = await loadAdminDoc(parsed.adminId);
  if ("error" in loaded) return loaded.error;
  const { targetRef, snap } = loaded;
  const signatures = normalizedSignatures(snap.get("signatureOptions"));
  const signatureId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const next = [
    ...signatures,
    {
      id: signatureId,
      label: parsed.label?.trim() || `Signature ${signatures.length + 1}`,
      dataUrl: sig,
      createdAt: new Date().toISOString(),
    },
  ];

  await targetRef.set(
    {
      signatureDataUrl: sig,
      signatureOptions: next,
      defaultSignatureId: signatureId,
      signatureUpdatedAt: new Date(),
      signatureUpdatedBy: auth.decoded.uid,
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, signatureId });
}

export async function PATCH(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  if (!(await isRequestAdmin(auth.decoded))) return jsonError("Forbidden", 403);

  let parsed: z.infer<typeof SetDefaultBodySchema>;
  try {
    parsed = SetDefaultBodySchema.parse(await req.json());
  } catch {
    return jsonError("Invalid body", 400);
  }

  const loaded = await loadAdminDoc(parsed.adminId);
  if ("error" in loaded) return loaded.error;
  const { targetRef, snap } = loaded;
  const signatures = normalizedSignatures(snap.get("signatureOptions"));
  const chosen = signatures.find((s) => s.id === parsed.signatureId);
  if (!chosen) return jsonError("Signature not found", 404);

  await targetRef.set(
    {
      defaultSignatureId: chosen.id,
      signatureDataUrl: chosen.dataUrl,
      signatureUpdatedAt: new Date(),
      signatureUpdatedBy: auth.decoded.uid,
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  if (!(await isRequestAdmin(auth.decoded))) return jsonError("Forbidden", 403);

  let parsed: z.infer<typeof DeleteBodySchema>;
  try {
    parsed = DeleteBodySchema.parse(await req.json());
  } catch {
    return jsonError("Invalid body", 400);
  }

  const loaded = await loadAdminDoc(parsed.adminId);
  if ("error" in loaded) return loaded.error;
  const { targetRef, snap } = loaded;
  const signatures = normalizedSignatures(snap.get("signatureOptions"));
  const next = signatures.filter((s) => s.id !== parsed.signatureId);
  if (next.length === signatures.length) return jsonError("Signature not found", 404);

  const prevDefault = typeof snap.get("defaultSignatureId") === "string" ? String(snap.get("defaultSignatureId")) : "";
  const nextDefault = prevDefault === parsed.signatureId ? (next[0]?.id ?? "") : prevDefault;
  const nextDefaultObj = next.find((s) => s.id === nextDefault) ?? null;

  await targetRef.set(
    {
      signatureOptions: next,
      defaultSignatureId: nextDefault || null,
      signatureDataUrl: nextDefaultObj?.dataUrl ?? null,
      signatureUpdatedAt: new Date(),
      signatureUpdatedBy: auth.decoded.uid,
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, remaining: next.length, defaultSignatureId: nextDefault || null });
}
