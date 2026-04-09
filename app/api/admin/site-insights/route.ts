import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { isSuperAdminDecoded, isSuperAdminUserRow } from "@/lib/auth/super-admin";
import { calendarDateKeyInTimeZone } from "@/lib/date/calendar-day-key";
import { timeZoneFromUserSnapshot } from "@/lib/attendance/time-zone-from-snap";

export const runtime = "nodejs";

type SwitchLog = {
  fromSiteId?: string;
  toSiteId?: string;
  photoUrl?: string;
  at?: { toMillis?: () => number };
  previousSiteCheckOut?: {
    siteId?: string;
    photoUrl?: string;
    time?: { toMillis?: () => number };
  };
};

type PhotoEvidence = {
  kind: "check_in" | "site_switch" | "check_out";
  photoUrl: string;
  atMs: number | null;
};

function timeMs(v: unknown): number | null {
  if (
    v &&
    typeof v === "object" &&
    "toMillis" in v &&
    typeof (v as { toMillis?: () => number }).toMillis === "function"
  ) {
    return (v as { toMillis: () => number }).toMillis();
  }
  return null;
}

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  if (!(await isRequestAdmin(decoded))) {
    return jsonError("Forbidden", 403);
  }

  const siteId = new URL(req.url).searchParams.get("siteId")?.trim() ?? "";
  const parsed = z.string().min(1).safeParse(siteId);
  if (!parsed.success) {
    return jsonError("siteId query required", 400);
  }

  const db = adminDb();
  const siteSnap = await db.collection("sites").doc(parsed.data).get();
  if (!siteSnap.exists) {
    return jsonError("Site not found", 404);
  }

  const siteData = siteSnap.data()!;
  const site = {
    id: siteSnap.id,
    name: typeof siteData.name === "string" ? siteData.name : siteSnap.id,
    latitude: siteData.latitude,
    longitude: siteData.longitude,
    radius: siteData.radius,
  };

  const usersSnap = await db.collection("users").get();
  const userById = new Map<
    string,
    { id: string; name: string; email: string; role: string }
  >();
  for (const d of usersSnap.docs) {
    const data = d.data();
    userById.set(d.id, {
      id: d.id,
      name: typeof data.name === "string" ? data.name : "",
      email: typeof data.email === "string" ? data.email : "",
      role: typeof data.role === "string" ? data.role : "employee",
    });
  }

  const assignedWorkers = usersSnap.docs
    .filter((d) => {
      const arr = d.get("assignedSites") as string[] | undefined;
      return Array.isArray(arr) && arr.includes(parsed.data);
    })
    .map((d) => userById.get(d.id)!)
    .filter(Boolean);

  const viewerTz = timeZoneFromUserSnapshot(await db.collection("users").doc(decoded.uid).get());
  const day = calendarDateKeyInTimeZone(new Date(), viewerTz);
  const attTodaySnap = await db.collection("attendance").where("date", "==", day).get();

  const activeAtSite: {
    workerId: string;
    name: string;
    email: string;
    hasOpenSession: boolean;
  }[] = [];

  let switchesIntoSite = 0;
  let switchesOutOfSite = 0;

  for (const doc of attTodaySnap.docs) {
    const data = doc.data();
    const wid = typeof data.workerId === "string" ? data.workerId : doc.id.split("_")[0];
    const sid = typeof data.siteId === "string" ? data.siteId : "";
    const open = data.checkIn && data.checkOut == null;

    if (sid === parsed.data && open) {
      const u = userById.get(wid);
      activeAtSite.push({
        workerId: wid,
        name: u?.name ?? wid,
        email: u?.email ?? "",
        hasOpenSession: true,
      });
    }

    const logs = data.siteSwitchLogs as SwitchLog[] | undefined;
    for (const log of logs ?? []) {
      if (log.toSiteId === parsed.data) switchesIntoSite++;
      if (log.fromSiteId === parsed.data) switchesOutOfSite++;
    }
  }

  activeAtSite.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const photoByWorker = new Map<string, PhotoEvidence[]>();

  const pushPhoto = (workerId: string, p: PhotoEvidence) => {
    const list = photoByWorker.get(workerId) ?? [];
    list.push(p);
    photoByWorker.set(workerId, list);
  };

  for (const doc of attTodaySnap.docs) {
    const data = doc.data();
    const wid = typeof data.workerId === "string" ? data.workerId : doc.id.split("_")[0];
    const currentSiteId = typeof data.siteId === "string" ? data.siteId : "";
    const logs = (data.siteSwitchLogs ?? []) as SwitchLog[];

    const checkInSiteId =
      logs.length > 0
        ? String(
            typeof logs[0]?.fromSiteId === "string"
              ? logs[0].fromSiteId
              : currentSiteId
          )
        : currentSiteId;

    const checkIn = data.checkIn as
      | { photoUrl?: string; time?: unknown }
      | undefined;
    if (
      checkIn?.photoUrl &&
      typeof checkIn.photoUrl === "string" &&
      checkInSiteId === parsed.data
    ) {
      pushPhoto(wid, {
        kind: "check_in",
        photoUrl: checkIn.photoUrl,
        atMs: timeMs(checkIn.time),
      });
    }

    for (const log of logs) {
      const ps = log.previousSiteCheckOut;
      if (
        log.fromSiteId === parsed.data &&
        ps?.photoUrl &&
        typeof ps.photoUrl === "string"
      ) {
        pushPhoto(wid, {
          kind: "check_out",
          photoUrl: ps.photoUrl,
          atMs: timeMs(ps.time) ?? timeMs(log.at),
        });
      }
      if (
        log.toSiteId === parsed.data &&
        typeof log.photoUrl === "string" &&
        log.photoUrl.length > 0
      ) {
        pushPhoto(wid, {
          kind: "site_switch",
          photoUrl: log.photoUrl,
          atMs: timeMs(log.at),
        });
      }
    }

    const checkOut = data.checkOut as
      | { photoUrl?: string; time?: unknown }
      | undefined;
    if (
      checkOut?.photoUrl &&
      typeof checkOut.photoUrl === "string" &&
      currentSiteId === parsed.data
    ) {
      pushPhoto(wid, {
        kind: "check_out",
        photoUrl: checkOut.photoUrl,
        atMs: timeMs(checkOut.time),
      });
    }
  }

  const photoEvidence = [...photoByWorker.entries()]
    .map(([workerId, photos]) => {
      const u = userById.get(workerId);
      const sorted = [...photos].sort(
        (a, b) => (a.atMs ?? 0) - (b.atMs ?? 0)
      );
      return {
        workerId,
        name: u?.name ?? workerId,
        email: u?.email ?? "",
        photos: sorted,
      };
    })
    .filter((row) => row.photos.length > 0)
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );

  const hideSuperRows = !isSuperAdminDecoded(decoded);
  let assignedWorkersOut = assignedWorkers;
  let activeAtSiteOut = activeAtSite;
  let photoEvidenceOut = photoEvidence;

  if (hideSuperRows) {
    assignedWorkersOut = assignedWorkers.filter(
      (u) => !isSuperAdminUserRow(u.email, u.role)
    );
    activeAtSiteOut = activeAtSite.filter((r) => {
      const u = userById.get(r.workerId);
      return !u || !isSuperAdminUserRow(u.email, u.role);
    });
    photoEvidenceOut = photoEvidence.filter((row) => {
      const u = userById.get(row.workerId);
      return !u || !isSuperAdminUserRow(u.email, u.role);
    });
  }

  return NextResponse.json({
    site,
    assignedWorkers: assignedWorkersOut,
    activeAtSite: activeAtSiteOut,
    today: day,
    siteSwitchStats: {
      switchesIntoSite,
      switchesOutOfSite,
    },
    photoEvidence: photoEvidenceOut,
  });
}
