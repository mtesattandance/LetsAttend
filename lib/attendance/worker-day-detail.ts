import type { Firestore } from "firebase-admin/firestore";
import { DateTime } from "luxon";
import { serializeFirestoreForJson } from "@/lib/firestore/serialize-for-json";
import { DEFAULT_ATTENDANCE_TIME_ZONE } from "@/lib/date/time-zone";
import { haversineMeters } from "@/lib/geo/haversine";
import { zonedWallClockToUtcMillis } from "@/lib/site/zoned-schedule";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRACK_PING_INTERVAL_MS = 45_000;
const OFFLINE_GAP_MS = 90_000;

function timeToMs(t: unknown): number | null {
  if (!t || typeof t !== "object") return null;
  const o = t as Record<string, unknown>;
  if (typeof o.seconds === "number") return o.seconds * 1000;
  if (typeof o._seconds === "number") return o._seconds * 1000;
  return null;
}

export type TimelineEvent =
  | {
      kind: "check_in";
      atMs: number;
      siteId: string;
      siteName: string;
      photoUrl: string | null;
      gps: unknown;
    }
  | {
      kind: "site_switch";
      atMs: number;
      fromSiteId: string;
      fromSiteName: string;
      toSiteId: string;
      toSiteName: string;
      arrivalPhotoUrl: string | null;
      arrivalGps: unknown;
      previousSiteCheckOut: {
        siteId: string;
        siteName: string;
        atMs: number;
        photoUrl: string | null;
        gps: unknown;
      } | null;
    }
  | {
      kind: "check_out";
      atMs: number;
      siteId: string;
      siteName: string;
      photoUrl: string | null;
      gps: unknown;
      auto: boolean;
    }
  | {
      kind: "offline_window";
      atMs: number;
      endMs: number;
      durationMs: number;
    }
  | {
      kind: "out_of_site_window";
      atMs: number;
      endMs: number;
      durationMs: number;
      siteId: string;
      siteName: string;
    };

export type SiteSegment = {
  siteId: string;
  siteName: string;
  startMs: number;
  endMs: number | null;
  durationMs: number | null;
};

export type TrackingWindow = {
  startMs: number;
  endMs: number;
  durationMs: number;
};

export type OvertimeDayDetailRow = {
  id: string;
  status: string;
  reason: string;
  siteId: string | null;
  siteName: string | null;
  overtimeCheckIn: {
    atMs: number | null;
    photoUrl: string | null;
    gps: unknown;
  } | null;
  overtimeCheckOut: {
    atMs: number | null;
    photoUrl: string | null;
    gps: unknown;
  } | null;
};

const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function wallHmDurationMsOnDay(
  dayYmd: string,
  startHm: string,
  endHm: string,
  zone: string = DEFAULT_ATTENDANCE_TIME_ZONE
): number | null {
  if (!HM_RE.test(startHm) || !HM_RE.test(endHm)) return null;
  const [y, mo, d] = dayYmd.split("-").map(Number);
  if (!y || !mo || !d) return null;
  const [sh, sm] = startHm.split(":").map(Number);
  const [eh, em] = endHm.split(":").map(Number);
  const s = DateTime.fromObject(
    { year: y, month: mo, day: d, hour: sh, minute: sm },
    { zone }
  );
  const e = DateTime.fromObject(
    { year: y, month: mo, day: d, hour: eh, minute: em },
    { zone }
  );
  if (!s.isValid || !e.isValid) return null;
  const ms = e.toMillis() - s.toMillis();
  return ms >= 0 ? ms : null;
}

export type OffsiteDayDetailRow = {
  id: string;
  status: string;
  reason: string;
  assigneeAdminUid: string | null;
  assigneeAdminName: string | null;
  assigneeAdminEmail: string | null;
  requestedStartHm: string;
  requestedEndHm: string;
  approvedStartHm: string | null;
  approvedEndHm: string | null;
  /** Set when approved and wall times form a valid interval on `day`. */
  durationMs: number | null;
  requestGps: {
    latitude: number;
    longitude: number;
    accuracyM?: number;
  } | null;
};

async function fetchOvertimeForWorkerDay(
  db: Firestore,
  workerId: string,
  day: string
): Promise<OvertimeDayDetailRow[]> {
  const snap = await db
    .collection("overtimeRequests")
    .where("workerId", "==", workerId)
    .where("date", "==", day)
    .get();

  const siteIds = new Set<string>();
  for (const doc of snap.docs) {
    const sid = doc.get("siteId");
    if (typeof sid === "string" && sid) siteIds.add(sid);
  }

  const siteNames: Record<string, string> = {};
  for (const sid of siteIds) {
    const s = await db.collection("sites").doc(sid).get();
    siteNames[sid] =
      s.exists && typeof s.data()?.name === "string" ? (s.data()!.name as string) : sid;
  }

  const withOrder = snap.docs.map((d) => {
    const data = d.data();
    const siteId = typeof data.siteId === "string" ? data.siteId : null;
    const ci = data.overtimeCheckIn as Record<string, unknown> | undefined;
    const co = data.overtimeCheckOut as Record<string, unknown> | undefined;

    const pack = (
      block: Record<string, unknown> | undefined
    ): OvertimeDayDetailRow["overtimeCheckIn"] =>
      block && typeof block === "object"
        ? {
            atMs: timeToMs(block.time),
            photoUrl: typeof block.photoUrl === "string" ? block.photoUrl : null,
            gps: block.gps ?? null,
          }
        : null;

    const row: OvertimeDayDetailRow = {
      id: d.id,
      status: typeof data.status === "string" ? data.status : "unknown",
      reason: typeof data.reason === "string" ? data.reason : "",
      siteId,
      siteName: siteId ? siteNames[siteId] ?? siteId : null,
      overtimeCheckIn: pack(ci),
      overtimeCheckOut: pack(co),
    };
    return { row, sortKey: timeToMs(d.get("createdAt")) ?? 0 };
  });

  withOrder.sort((a, b) => a.sortKey - b.sortKey);
  return withOrder.map((x) => x.row);
}

async function fetchOffsiteForWorkerDay(
  db: Firestore,
  workerId: string,
  day: string
): Promise<OffsiteDayDetailRow[]> {
  const snap = await db
    .collection("offsiteWorkRequests")
    .where("workerId", "==", workerId)
    .where("date", "==", day)
    .get();

  const assigneeIds = new Set<string>();
  for (const doc of snap.docs) {
    const aid = doc.get("assigneeAdminUid");
    if (typeof aid === "string" && aid) assigneeIds.add(aid);
  }

  const assigneeMeta: Record<string, { name: string | null; email: string | null }> = {};
  for (const uid of assigneeIds) {
    const u = await db.collection("users").doc(uid).get();
    assigneeMeta[uid] = {
      name: u.exists && typeof u.get("name") === "string" ? (u.get("name") as string) : null,
      email: u.exists && typeof u.get("email") === "string" ? (u.get("email") as string) : null,
    };
  }

  const rows = snap.docs.map((d) => {
    const data = d.data();
    const assigneeUid =
      typeof data.assigneeAdminUid === "string" ? data.assigneeAdminUid : null;
    const meta = assigneeUid ? assigneeMeta[assigneeUid] : undefined;
    const reqStart = typeof data.requestedStartHm === "string" ? data.requestedStartHm : "00:00";
    const reqEnd = typeof data.requestedEndHm === "string" ? data.requestedEndHm : "00:00";
    const appStart =
      typeof data.approvedStartHm === "string" ? data.approvedStartHm : null;
    const appEnd = typeof data.approvedEndHm === "string" ? data.approvedEndHm : null;
    const st = typeof data.status === "string" ? data.status : "unknown";
    const gpsRaw = data.requestGps as Record<string, unknown> | undefined;
    let requestGps: OffsiteDayDetailRow["requestGps"] = null;
    if (
      gpsRaw &&
      typeof gpsRaw.latitude === "number" &&
      typeof gpsRaw.longitude === "number"
    ) {
      requestGps = {
        latitude: gpsRaw.latitude,
        longitude: gpsRaw.longitude,
        accuracyM:
          typeof gpsRaw.accuracyM === "number" ? gpsRaw.accuracyM : undefined,
      };
    }
    const useStart = st === "approved" && appStart ? appStart : reqStart;
    const useEnd = st === "approved" && appEnd ? appEnd : reqEnd;
    const durationMs =
      st === "approved" ? wallHmDurationMsOnDay(day, useStart, useEnd) : null;

    const row: OffsiteDayDetailRow = {
      id: d.id,
      status: st,
      reason: typeof data.reason === "string" ? data.reason : "",
      assigneeAdminUid: assigneeUid,
      assigneeAdminName: meta?.name ?? null,
      assigneeAdminEmail: meta?.email ?? null,
      requestedStartHm: reqStart,
      requestedEndHm: reqEnd,
      approvedStartHm: appStart,
      approvedEndHm: appEnd,
      durationMs,
      requestGps,
    };
    return { row, sortKey: timeToMs(d.get("createdAt")) ?? 0 };
  });

  rows.sort((a, b) => a.sortKey - b.sortKey);
  return rows.map((x) => x.row);
}

type TrackingPing = {
  atMs: number;
  latitude: number;
  longitude: number;
};

async function fetchTrackingPingsForWorkerDay(
  db: Firestore,
  workerId: string,
  day: string
): Promise<TrackingPing[]> {
  const dayStart = DateTime.fromISO(day, { zone: DEFAULT_ATTENDANCE_TIME_ZONE }).startOf("day");
  const dayEnd = dayStart.plus({ days: 1 });
  const snap = await db
    .collection("live_tracking_logs")
    .where("workerId", "==", workerId)
    .where("at", ">=", dayStart.toJSDate())
    .where("at", "<", dayEnd.toJSDate())
    .orderBy("at", "asc")
    .get();
  return snap.docs
    .map((d) => {
      const x = d.data() as Record<string, unknown>;
      const atMs = timeToMs(x.at);
      const latitude = Number(x.latitude);
      const longitude = Number(x.longitude);
      if (atMs == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return { atMs, latitude, longitude };
    })
    .filter((x): x is TrackingPing => !!x);
}

export type WorkerDayDetailResult =
  | {
      ok: true;
      day: string;
      workerId: string;
      absent: true;
      workerName: string | null;
      workerEmail: string | null;
      overtime: OvertimeDayDetailRow[];
      offsite: OffsiteDayDetailRow[];
    }
  | {
      ok: true;
      day: string;
      workerId: string;
      absent: false;
      workerName: string | null;
      workerEmail: string | null;
      status: string;
      currentSiteId: string | null;
      currentSiteName: string | null;
      checkIn: {
        atMs: number | null;
        siteId: string;
        siteName: string;
        photoUrl: string | null;
        gps: unknown;
      } | null;
      checkOut: {
        atMs: number | null;
        siteId: string;
        siteName: string;
        photoUrl: string | null;
        gps: unknown;
        auto: boolean;
      } | null;
      siteSwitchLogs: Record<string, unknown>[];
      timeline: TimelineEvent[];
      analytics: {
        sessionOpen: boolean;
        switchCount: number;
        uniqueSitesCount: number;
        sitesVisitedOrdered: { id: string; name: string }[];
        firstEventMs: number | null;
        lastEventMs: number | null;
        totalSessionMs: number | null;
        segments: SiteSegment[];
        tracking: {
          pingCount: number;
          outOfSiteMs: number;
          offlineMs: number;
          outOfSiteWindows: TrackingWindow[];
          offlineWindows: TrackingWindow[];
        };
      };
      overtime: OvertimeDayDetailRow[];
      offsite: OffsiteDayDetailRow[];
    };

export async function buildWorkerDayDetail(
  db: Firestore,
  workerId: string,
  day: string
): Promise<WorkerDayDetailResult> {
  if (!DAY_RE.test(day)) {
    throw new Error("Invalid day");
  }

  const [userSnap, overtime, offsite, attSnap, trackingPings] = await Promise.all([
    db.collection("users").doc(workerId).get(),
    fetchOvertimeForWorkerDay(db, workerId, day),
    fetchOffsiteForWorkerDay(db, workerId, day),
    db.collection("attendance").doc(`${workerId}_${day}`).get(),
    fetchTrackingPingsForWorkerDay(db, workerId, day),
  ]);

  const workerName =
    userSnap.exists && typeof userSnap.get("name") === "string"
      ? (userSnap.get("name") as string)
      : null;
  const workerEmail =
    userSnap.exists && typeof userSnap.get("email") === "string"
      ? (userSnap.get("email") as string)
      : null;

  if (!attSnap.exists) {
    return {
      ok: true,
      day,
      workerId,
      absent: true,
      workerName,
      workerEmail,
      overtime,
      offsite,
    };
  }

  const raw = attSnap.data()!;
  const plain = serializeFirestoreForJson(raw) as Record<string, unknown>;

  const siteIds = new Set<string>();
  const currentSiteId =
    typeof plain.siteId === "string" && plain.siteId ? plain.siteId : null;
  if (currentSiteId) siteIds.add(currentSiteId);

  const checkIn = plain.checkIn as Record<string, unknown> | undefined;
  const checkOut = plain.checkOut as
    | (Record<string, unknown> & { auto?: boolean })
    | undefined;
  const rawLogs = Array.isArray(plain.siteSwitchLogs)
    ? (plain.siteSwitchLogs as Record<string, unknown>[])
    : [];

  const logs = [...rawLogs].sort((a, b) => {
    const ma = timeToMs(a.at) ?? 0;
    const mb = timeToMs(b.at) ?? 0;
    return ma - mb;
  });

  const initialSiteId =
    logs.length > 0 && typeof logs[0].fromSiteId === "string"
      ? logs[0].fromSiteId
      : currentSiteId ?? "";

  if (initialSiteId) siteIds.add(initialSiteId);
  for (const log of logs) {
    if (typeof log.fromSiteId === "string") siteIds.add(log.fromSiteId);
    if (typeof log.toSiteId === "string") siteIds.add(log.toSiteId);
  }
  if (
    checkOut &&
    currentSiteId &&
    typeof (checkOut as { siteId?: string }).siteId === "string"
  ) {
    siteIds.add((checkOut as { siteId: string }).siteId);
  }

  const siteNames: Record<string, string> = {};
  const siteGeo: Record<string, { latitude: number; longitude: number; radius: number } | null> = {};
  const siteWorkdayEnd: Record<string, string | null> = {};
  for (const sid of siteIds) {
    const s = await db.collection("sites").doc(sid).get();
    if (s.exists) {
      const n = s.data()?.name;
      siteNames[sid] = typeof n === "string" ? n : sid;
      const slat = Number(s.get("latitude"));
      const slng = Number(s.get("longitude"));
      const sr = Number(s.get("radius"));
      siteGeo[sid] =
        Number.isFinite(slat) && Number.isFinite(slng) && Number.isFinite(sr)
          ? { latitude: slat, longitude: slng, radius: sr }
          : null;
      // Collect workday end time for this site (new field, with legacy fallback).
      const rawEnd = s.get("workdayEndUtc") ?? s.get("autoCheckoutUtc");
      siteWorkdayEnd[sid] = typeof rawEnd === "string" && rawEnd.trim() ? rawEnd.trim() : null;
    } else {
      siteNames[sid] = sid;
      siteGeo[sid] = null;
    }
  }

  const nameOf = (id: string) => siteNames[id] ?? id;

  const checkInMs = checkIn ? timeToMs(checkIn.time) : null;
  const checkOutMs = checkOut ? timeToMs(checkOut.time) : null;

  const timeline: TimelineEvent[] = [];

  if (checkIn && checkInMs != null && initialSiteId) {
    timeline.push({
      kind: "check_in",
      atMs: checkInMs,
      siteId: initialSiteId,
      siteName: nameOf(initialSiteId),
      photoUrl:
        typeof checkIn.photoUrl === "string" ? checkIn.photoUrl : null,
      gps: checkIn.gps ?? null,
    });
  }

  for (const log of logs) {
    const atMs = timeToMs(log.at);
    if (atMs == null) continue;
    const fromId =
      typeof log.fromSiteId === "string" ? log.fromSiteId : "";
    const toId = typeof log.toSiteId === "string" ? log.toSiteId : "";
    const psco = log.previousSiteCheckOut as Record<string, unknown> | undefined;
    let previousSiteCheckOut: {
      siteId: string;
      siteName: string;
      atMs: number;
      photoUrl: string | null;
      gps: unknown;
    } | null = null;
    if (psco && typeof psco === "object") {
      const psid =
        typeof psco.siteId === "string" ? psco.siteId : fromId;
      const pms = timeToMs(psco.time);
      previousSiteCheckOut = {
        siteId: psid,
        siteName: nameOf(psid),
        atMs: pms ?? atMs,
        photoUrl:
          typeof psco.photoUrl === "string" ? psco.photoUrl : null,
        gps: psco.gps ?? null,
      };
    }
    timeline.push({
      kind: "site_switch",
      atMs,
      fromSiteId: fromId,
      fromSiteName: nameOf(fromId),
      toSiteId: toId,
      toSiteName: nameOf(toId),
      arrivalPhotoUrl:
        typeof log.photoUrl === "string" ? log.photoUrl : null,
      arrivalGps: log.gps ?? null,
      previousSiteCheckOut,
    });
  }

  if (checkOut && checkOutMs != null) {
    const coSite =
      typeof plain.siteId === "string" && plain.siteId
        ? plain.siteId
        : currentSiteId ?? "";
    timeline.push({
      kind: "check_out",
      atMs: checkOutMs,
      siteId: coSite,
      siteName: nameOf(coSite),
      photoUrl:
        typeof checkOut.photoUrl === "string" ? checkOut.photoUrl : null,
      gps: checkOut.gps ?? null,
      auto: checkOut.auto === true,
    });
  }

  // Inject a synthetic auto-checkout event if the session is open and past the work-end time.
  // The cron hasn't fired yet, but the deadline has passed — show a provisional checkout on the timeline.
  if (checkIn && !checkOut && currentSiteId) {
    const endHm = siteWorkdayEnd[currentSiteId];
    if (endHm) {
      const capMs = zonedWallClockToUtcMillis(day, endHm, DEFAULT_ATTENDANCE_TIME_ZONE);
      if (capMs != null && Date.now() >= capMs) {
        timeline.push({
          kind: "check_out",
          atMs: capMs,
          siteId: currentSiteId,
          siteName: nameOf(currentSiteId),
          photoUrl: null,
          gps: null,
          auto: true,
        });
      }
    }
  }

  timeline.sort((a, b) => a.atMs - b.atMs);

  const visitedOrdered: { id: string; name: string }[] = [];
  const pushUnique = (id: string) => {
    if (!id) return;
    if (!visitedOrdered.some((x) => x.id === id)) {
      visitedOrdered.push({ id, name: nameOf(id) });
    }
  };
  pushUnique(initialSiteId);
  for (const log of logs) {
    if (typeof log.toSiteId === "string") pushUnique(log.toSiteId);
  }

  const sessionOpen = !!(checkIn && !checkOut);
  const nowMs = Date.now();

  // Compute the effective session end for open sessions:
  // cap at workdayEndUtc on the attendance day so hours stop accumulating after shift end.
  let effectiveEndMs: number;
  let autoCheckoutInjected = false;
  if (sessionOpen && checkInMs != null) {
    // Determine which site's end time to use: prefer current site, else initial.
    const capSiteId = currentSiteId ?? initialSiteId;
    const endHm = capSiteId ? siteWorkdayEnd[capSiteId] : null;
    let capMs: number | null = null;
    if (endHm) {
      capMs = zonedWallClockToUtcMillis(day, endHm, DEFAULT_ATTENDANCE_TIME_ZONE);
    }
    if (capMs != null && nowMs >= capMs) {
      // Past shift end — cap at the work-end deadline.
      effectiveEndMs = capMs;
      autoCheckoutInjected = true;
    } else {
      // Still within shift — show real elapsed time.
      effectiveEndMs = nowMs;
    }
  } else {
    effectiveEndMs = nowMs; // Only used for fallback; checkOutMs preferred below.
  }

  const lastEventMs =
    timeline.length > 0 ? timeline[timeline.length - 1]!.atMs : checkInMs;
  const firstEventMs = checkInMs;
  const totalSessionMs =
    checkInMs != null
      ? checkOutMs != null
        ? checkOutMs - checkInMs
        : sessionOpen
          ? Math.max(0, effectiveEndMs - checkInMs)
          : null
      : null;

  /** Time blocks per site (check-in → first switch, switch → switch, last → checkout). */
  const segments: SiteSegment[] = [];
  if (checkInMs != null && initialSiteId) {
    let segStart = checkInMs;
    let segSite = initialSiteId;
    for (const ev of timeline) {
      if (ev.kind === "site_switch") {
        segments.push({
          siteId: segSite,
          siteName: nameOf(segSite),
          startMs: segStart,
          endMs: ev.atMs,
          durationMs: ev.atMs - segStart,
        });
        segSite = ev.toSiteId;
        segStart = ev.atMs;
      }
    }
    if (checkOutMs != null) {
      segments.push({
        siteId: segSite,
        siteName: nameOf(segSite),
        startMs: segStart,
        endMs: checkOutMs,
        durationMs: checkOutMs - segStart,
      });
    } else if (sessionOpen) {
      if (autoCheckoutInjected) {
        // Session is open but past work-end — show the capped segment.
        segments.push({
          siteId: segSite,
          siteName: nameOf(segSite),
          startMs: segStart,
          endMs: effectiveEndMs,
          durationMs: effectiveEndMs - segStart,
        });
      } else {
        segments.push({
          siteId: segSite,
          siteName: nameOf(segSite),
          startMs: segStart,
          endMs: null,
          durationMs: null,
        });
      }
    }
  }

  const logList = [...trackingPings].sort((a, b) => a.atMs - b.atMs);
  const outOfSiteWindows: TrackingWindow[] = [];
  let outOfSiteMs = 0;
  for (const seg of segments) {
    const geo = siteGeo[seg.siteId];
    if (!geo) continue;
    const segEnd = seg.endMs ?? nowMs;
    const segPings = logList.filter((p) => p.atMs >= seg.startMs && p.atMs <= segEnd);
    let outsideStart: number | null = null;
    for (const p of segPings) {
      const distance = haversineMeters(p.latitude, p.longitude, geo.latitude, geo.longitude);
      const outside = distance > geo.radius;
      if (outside && outsideStart == null) {
        outsideStart = p.atMs;
      } else if (!outside && outsideStart != null) {
        const durationMs = Math.max(0, p.atMs - outsideStart);
        if (durationMs > 0) {
          outOfSiteWindows.push({ startMs: outsideStart, endMs: p.atMs, durationMs });
          outOfSiteMs += durationMs;
        }
        outsideStart = null;
      }
    }
    if (outsideStart != null) {
      const durationMs = Math.max(0, segEnd - outsideStart);
      if (durationMs > 0) {
        outOfSiteWindows.push({ startMs: outsideStart, endMs: segEnd, durationMs });
        outOfSiteMs += durationMs;
      }
    }
  }

  const offlineWindows: TrackingWindow[] = [];
  let offlineMs = 0;
  if (checkInMs != null) {
    const sessionEnd = checkOutMs ?? nowMs;
    let prev = checkInMs;
    const sessionPings = logList.filter((p) => p.atMs >= checkInMs && p.atMs <= sessionEnd);
    for (const p of sessionPings) {
      const gap = p.atMs - prev;
      if (gap > OFFLINE_GAP_MS) {
        const startMs = prev + TRACK_PING_INTERVAL_MS;
        const endMs = p.atMs;
        const durationMs = Math.max(0, endMs - startMs);
        if (durationMs > 0) {
          offlineWindows.push({ startMs, endMs, durationMs });
          offlineMs += durationMs;
        }
      }
      prev = p.atMs;
    }
    const tailGap = sessionEnd - prev;
    if (tailGap > OFFLINE_GAP_MS) {
      const startMs = prev + TRACK_PING_INTERVAL_MS;
      const endMs = sessionEnd;
      const durationMs = Math.max(0, endMs - startMs);
      if (durationMs > 0) {
        offlineWindows.push({ startMs, endMs, durationMs });
        offlineMs += durationMs;
      }
    }
  }

  // Push offline and out-of-site windows into the timeline so they appear chronologically.
  for (const w of offlineWindows) {
    timeline.push({
      kind: "offline_window",
      atMs: w.startMs,
      endMs: w.endMs,
      durationMs: w.durationMs,
    });
  }
  for (const w of outOfSiteWindows) {
    const seg = segments.find(
      (s) => w.startMs >= s.startMs && w.startMs < (s.endMs ?? Infinity)
    );
    timeline.push({
      kind: "out_of_site_window",
      atMs: w.startMs,
      endMs: w.endMs,
      durationMs: w.durationMs,
      siteId: seg?.siteId ?? "",
      siteName: seg?.siteName ?? "",
    });
  }
  // Re-sort so tracking events interleave correctly with check-in/switch/check-out.
  timeline.sort((a, b) => a.atMs - b.atMs);

  return {
    ok: true,
    day,
    workerId,
    absent: false,
    workerName,
    workerEmail,
    status: typeof plain.status === "string" ? plain.status : "present",
    currentSiteId,
    currentSiteName: currentSiteId ? nameOf(currentSiteId) : null,
    checkIn: checkIn
      ? {
          atMs: checkInMs,
          siteId: initialSiteId,
          siteName: nameOf(initialSiteId),
          photoUrl:
            typeof checkIn.photoUrl === "string" ? checkIn.photoUrl : null,
          gps: checkIn.gps ?? null,
        }
      : null,
    checkOut: checkOut
      ? {
          atMs: checkOutMs,
          siteId: currentSiteId ?? initialSiteId,
          siteName: nameOf(currentSiteId ?? initialSiteId),
          photoUrl:
            typeof checkOut.photoUrl === "string" ? checkOut.photoUrl : null,
          gps: checkOut.gps ?? null,
          auto: checkOut.auto === true,
        }
      : null,
    siteSwitchLogs: logs,
    timeline,
    analytics: {
      sessionOpen,
      switchCount: logs.length,
      uniqueSitesCount: visitedOrdered.length,
      sitesVisitedOrdered: visitedOrdered,
      firstEventMs,
      lastEventMs,
      totalSessionMs,
      segments,
      tracking: {
        pingCount: logList.length,
        outOfSiteMs,
        offlineMs,
        outOfSiteWindows,
        offlineWindows,
      },
    },
    overtime,
    offsite,
  };
}
