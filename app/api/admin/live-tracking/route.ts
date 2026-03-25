import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { haversineMeters } from "@/lib/geo/haversine";
import { isSuperAdminDecoded, isSuperAdminUserRow } from "@/lib/auth/super-admin";

export const runtime = "nodejs";

async function assertAdminRole(decoded: { uid: string; email?: string | null }) {
  if (isSuperAdminDecoded(decoded)) return;

  const db = adminDb();
  const snap = await db.collection("users").doc(decoded.uid).get();
  const role = snap.get("role") as string | undefined;
  if (role === "admin" || role === "super_admin") return;
  throw new Error("Forbidden");
}

type LiveWorkerRow = {
  workerId: string;
  latitude: number;
  longitude: number;
  accuracyM: number | undefined;
  lastUpdatedMs: number | null;
};

async function filterOutSuperAdminWorkers(
  db: ReturnType<typeof adminDb>,
  workers: LiveWorkerRow[]
): Promise<LiveWorkerRow[]> {
  if (workers.length === 0) return workers;
  const ids = [...new Set(workers.map((w) => w.workerId))];
  const hide = new Set<string>();
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const refs = chunk.map((id) => db.collection("users").doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s, j) => {
      if (!s.exists) return;
      const data = s.data()!;
      const email = typeof data.email === "string" ? data.email : "";
      const role = typeof data.role === "string" ? data.role : "employee";
      const id = chunk[j]!;
      if (isSuperAdminUserRow(email, role)) hide.add(id);
    });
  }
  return workers.filter((w) => !hide.has(w.workerId));
}

const outSchema = z.array(
  z.object({
    workerId: z.string(),
    latitude: z.number().finite(),
    longitude: z.number().finite(),
    accuracyM: z.number().finite().optional(),
    lastUpdatedMs: z.number().finite().nullable().optional(),
  })
);

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  try {
    await assertAdminRole({ uid: decoded.uid, email: decoded.email });
  } catch {
    return jsonError("Forbidden", 403);
  }

  const db = adminDb();

  const siteIdParam = new URL(req.url).searchParams.get("siteId")?.trim() ?? "";
  let siteFilter: { latitude: number; longitude: number; radius: number } | null = null;

  if (siteIdParam) {
    const siteSnap = await db.collection("sites").doc(siteIdParam).get();
    if (!siteSnap.exists) {
      return jsonError("Site not found", 404);
    }
    const sd = siteSnap.data()!;
    const slat = Number(sd.latitude);
    const slng = Number(sd.longitude);
    const sr = Number(sd.radius);
    if (!Number.isFinite(slat) || !Number.isFinite(slng) || !Number.isFinite(sr)) {
      return jsonError("Site misconfigured", 500);
    }
    siteFilter = { latitude: slat, longitude: slng, radius: sr };
  }

  const snap = await db.collection("live_tracking").get();

  let workers = snap.docs.map((d) => {
    type LocationLike = {
      latitude?: number;
      longitude?: number;
      accuracyM?: number;
    };
    type LiveTrackingData = {
      location?: LocationLike | null;
      lastUpdated?: { toMillis?: () => number; seconds?: number } | null;
    };

    const data = d.data() as LiveTrackingData;
    const location = data.location ?? {};
    const last = data.lastUpdated ?? null;
    const lastUpdatedMs =
      last && typeof last.toMillis === "function"
        ? last.toMillis()
        : last && typeof last.seconds === "number"
          ? last.seconds * 1000
          : null;

    return {
      workerId: d.id,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      accuracyM:
        location.accuracyM == null ? undefined : Number(location.accuracyM),
      lastUpdatedMs: lastUpdatedMs ?? null,
    } satisfies LiveWorkerRow;
  });

  if (siteFilter) {
    const { latitude: clat, longitude: clng, radius } = siteFilter;
    workers = workers.filter((w) => {
      if (!Number.isFinite(w.latitude) || !Number.isFinite(w.longitude)) return false;
      const d = haversineMeters(w.latitude, w.longitude, clat, clng);
      return d <= radius;
    });
  }

  if (!isSuperAdminDecoded(decoded)) {
    workers = await filterOutSuperAdminWorkers(db, workers);
  }

  const parsed = outSchema.safeParse(workers);
  if (!parsed.success) {
    return NextResponse.json({
      workers,
      site: siteFilter,
    });
  }

  return NextResponse.json({
    workers: parsed.data,
    site: siteFilter,
  });
}

