import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import {
  calendarDateKeyInTimeZone,
  recentAttendanceDayKeysForQuery,
} from "@/lib/date/calendar-day-key";
import { zonedWallClockToUtcMillis } from "@/lib/site/zoned-schedule";
import { scheduleTimeZoneFromSiteData, timeZoneFromUserSnapshot } from "@/lib/attendance/time-zone-from-snap";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayKeyFromAttendanceDocId(docId: string): string | null {
  const idx = docId.lastIndexOf("_");
  if (idx <= 0) return null;
  const tail = docId.slice(idx + 1);
  return DAY_RE.test(tail) ? tail : null;
}

function placeholderPhotoUrl(): string {
  return (
    process.env.AUTO_CHECKOUT_PLACEHOLDER_URL?.trim() ||
    "https://invalid.invalid/attendance-auto-checkout"
  );
}

/**
 * Cron: close open rows when “now” is past that attendance day’s configured local auto check-out time
 * (wall clock in the site’s {@link scheduleTimeZoneFromSiteData}, default Nepal).
 */
export async function runAutoCheckout(): Promise<{ processed: number; errors: string[] }> {
  const db = adminDb();
  const now = new Date();
  const dayKeys = recentAttendanceDayKeysForQuery(now, 10);
  const errors: string[] = [];
  let processed = 0;

  const snap = await db.collection("attendance").where("date", "in", dayKeys).get();
  const nowMs = Date.now();

  const workerTzCache = new Map<string, string>();

  for (const doc of snap.docs) {
    const data = doc.data() as {
      checkIn?: unknown;
      checkOut?: unknown;
      siteId?: string;
      date?: string;
      workerId?: string;
    };
    if (!data.checkIn || data.checkOut) continue;

    const dayKey =
      dayKeyFromAttendanceDocId(doc.id) ??
      (typeof data.date === "string" && DAY_RE.test(data.date) ? data.date : null);
    if (!dayKey) continue;

    const workerId = typeof data.workerId === "string" ? data.workerId : "";
    if (workerId) {
      const prefix = `${workerId}_`;
      if (!doc.id.startsWith(prefix)) {
        errors.push(`${doc.id}: skip (workerId does not match document id)`);
        continue;
      }
    }

    const siteId = typeof data.siteId === "string" ? data.siteId : "";
    if (!siteId || !workerId) continue;

    let workerTz = workerTzCache.get(workerId);
    if (!workerTz) {
      const uSnap = await db.collection("users").doc(workerId).get();
      workerTz = timeZoneFromUserSnapshot(uSnap);
      workerTzCache.set(workerId, workerTz);
    }

    const todayKeyWorker = calendarDateKeyInTimeZone(now, workerTz);
    if (dayKey > todayKeyWorker) continue;

    try {
      const siteSnap = await db.collection("sites").doc(siteId).get();
      if (!siteSnap.exists) continue;
      const site = siteSnap.data()!;
      // workdayEndUtc is the new field; fall back to legacy autoCheckoutUtc for old site docs;
      // ultimate fallback is 17:00 (5 PM NPT) — the typical end of a regular shift.
      const hhmm =
        (typeof site.workdayEndUtc === "string" && site.workdayEndUtc.trim()
          ? site.workdayEndUtc.trim()
          : null) ??
        (typeof site.autoCheckoutUtc === "string" && site.autoCheckoutUtc.trim()
          ? site.autoCheckoutUtc.trim()
          : null) ??
        "17:00";

      const siteTz = scheduleTimeZoneFromSiteData(site);
      const deadline = zonedWallClockToUtcMillis(dayKey, hhmm, siteTz);
      if (deadline == null) continue;

      // Grace period: employees can manually check out within this window after workdayEndUtc.
      // Auto-checkout fires only AFTER the grace window expires.
      const graceMinutes = Number(site.checkoutGraceMinutes);
      const graceMs = (Number.isFinite(graceMinutes) && graceMinutes > 0 ? graceMinutes : 20) * 60_000;
      const graceDeadline = deadline + graceMs;

      // Not yet past the grace window — skip for now.
      if (nowMs < graceDeadline) continue;

      const lat = Number(site.latitude);
      const lng = Number(site.longitude);
      // Record checkout AT workdayEndUtc (not at grace deadline) so grace time is never counted.
      const checkoutTime = new Date(deadline);

      await doc.ref.set(
        {
          checkOut: {
            time: checkoutTime,
            gps: {
              latitude: Number.isFinite(lat) ? lat : 0,
              longitude: Number.isFinite(lng) ? lng : 0,
            },
            photoUrl: placeholderPhotoUrl(),
            auto: true,
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      processed++;
    } catch (e) {
      errors.push(`${doc.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { processed, errors };
}
