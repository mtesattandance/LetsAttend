import { NextResponse } from "next/server";
import { z } from "zod";
import { DateTime } from "luxon";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { haversineMeters } from "@/lib/geo/haversine";
import { isSuperAdminDecoded, isSuperAdminUserRow } from "@/lib/auth/super-admin";
import { timeZoneFromUserSnapshot } from "@/lib/attendance/time-zone-from-snap";

export const runtime = "nodejs";

// Cache per "superAdmin:siteId" key — 30s TTL
const CACHE_TTL_MS = 30_000;
type CacheEntry = { data: unknown; expiresAt: number };
const liveTrackingCache = new Map<string, CacheEntry>();

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
  workerName: string | null;
  latitude: number;
  longitude: number;
  accuracyM: number | undefined;
  lastUpdatedMs: number | null;
};

type OffsitePinRow = {
  requestId: string;
  workerId: string;
  workerName: string | null;
  latitude: number;
  longitude: number;
  accuracyM: number | undefined;
  status: string;
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
    workerName: z.string().nullable().optional(),
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

  const isSuperAdmin = isSuperAdminDecoded(decoded);
  const siteIdParam = new URL(req.url).searchParams.get("siteId")?.trim() ?? "";
  const cacheKey = `${String(isSuperAdmin)}:${siteIdParam}`;
  const cached = liveTrackingCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }

  const db = adminDb();
  const viewerTz = timeZoneFromUserSnapshot(await db.collection("users").doc(decoded.uid).get());
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

  const rawWorkers = snap.docs.map((d) => {
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
      workerName: null as string | null,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      accuracyM:
        location.accuracyM == null ? undefined : Number(location.accuracyM),
      lastUpdatedMs: lastUpdatedMs ?? null,
    } satisfies LiveWorkerRow;
  });

  const ids = [...new Set(rawWorkers.map((w) => w.workerId))];
  const nameById = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const refs = chunk.map((id) => db.collection("users").doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s, j) => {
      const id = chunk[j]!;
      if (!s.exists) {
        nameById.set(id, null);
        return;
      }
      const n = s.data()?.name;
      nameById.set(id, typeof n === "string" && n.trim() ? n.trim() : null);
    });
  }

  let workers = rawWorkers.map((w) => ({
    ...w,
    workerName: nameById.get(w.workerId) ?? null,
  }));

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

  /** Today (calendar day) in viewer’s profile zone — off-site request GPS for this day only. */
  const todayKey = DateTime.now().setZone(viewerTz).toFormat("yyyy-MM-dd");
  const offsiteSnap = await db
    .collection("offsiteWorkRequests")
    .where("date", "==", todayKey)
    .get();

  let offsitePins: OffsitePinRow[] = offsiteSnap.docs
    .map((docSnap) => {
      const data = docSnap.data();
      const workerId = typeof data.workerId === "string" ? data.workerId.trim() : "";
      const status = typeof data.status === "string" ? data.status : "";
      const gps = data.requestGps as Record<string, unknown> | undefined;
      const lat = gps && typeof gps.latitude === "number" ? gps.latitude : Number.NaN;
      const lng = gps && typeof gps.longitude === "number" ? gps.longitude : Number.NaN;
      const accRaw = gps?.accuracyM;
      const accuracyM =
        typeof accRaw === "number" && Number.isFinite(accRaw) ? accRaw : undefined;
      return {
        requestId: docSnap.id,
        workerId,
        workerName: null as string | null,
        latitude: lat,
        longitude: lng,
        accuracyM,
        status,
      } satisfies OffsitePinRow;
    })
    .filter(
      (r) =>
        r.workerId &&
        (r.status === "pending" || r.status === "approved") &&
        Number.isFinite(r.latitude) &&
        Number.isFinite(r.longitude)
    );

  if (siteFilter) {
    const { latitude: clat, longitude: clng, radius } = siteFilter;
    offsitePins = offsitePins.filter((r) => {
      const d = haversineMeters(r.latitude, r.longitude, clat, clng);
      return d <= radius;
    });
  }

  const offIds = [...new Set(offsitePins.map((p) => p.workerId))];
  const offNameById = new Map<string, string | null>();
  for (let i = 0; i < offIds.length; i += 20) {
    const chunk = offIds.slice(i, i + 20);
    const refs = chunk.map((id) => db.collection("users").doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s, j) => {
      const id = chunk[j]!;
      if (!s.exists) {
        offNameById.set(id, null);
        return;
      }
      const n = s.data()?.name;
      offNameById.set(id, typeof n === "string" && n.trim() ? n.trim() : null);
    });
  }

  offsitePins = offsitePins.map((p) => ({
    ...p,
    workerName: offNameById.get(p.workerId) ?? null,
  }));

  if (!isSuperAdminDecoded(decoded)) {
    offsitePins = await (async () => {
      if (offsitePins.length === 0) return offsitePins;
      const pinWorkerIds = [...new Set(offsitePins.map((p) => p.workerId))];
      const hide = new Set<string>();
      for (let i = 0; i < pinWorkerIds.length; i += 10) {
        const chunk = pinWorkerIds.slice(i, i + 10);
        const refs = chunk.map((id) => db.collection("users").doc(id));
        const snaps = await db.getAll(...refs);
        snaps.forEach((s, j) => {
          if (!s.exists) return;
          const d = s.data()!;
          const email = typeof d.email === "string" ? d.email : "";
          const role = typeof d.role === "string" ? d.role : "employee";
          const id = chunk[j]!;
          if (isSuperAdminUserRow(email, role)) hide.add(id);
        });
      }
      return offsitePins.filter((p) => !hide.has(p.workerId));
    })();
  }

  const parsed = outSchema.safeParse(workers);
  const responseData = parsed.success
    ? { workers: parsed.data, offsitePins, site: siteFilter }
    : { workers, offsitePins, site: siteFilter };

  liveTrackingCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + CACHE_TTL_MS });
  return NextResponse.json(responseData);
}

