import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { attendanceDayKeyUTC } from "@/lib/date/today-key";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { requireBearerUser } from "@/lib/auth/verify-request";

export const runtime = "nodejs";

type AttendanceDoc = {
  checkIn?: { time?: { toMillis?: () => number; seconds?: number } };
  checkOut?: unknown;
};

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;
  if (!(await isRequestAdmin(decoded))) return jsonError("Forbidden", 403);

  const db = adminDb();
  const day = attendanceDayKeyUTC();
  const now = new Date().getTime();

  const [attendanceSnap, liveSnap] = await Promise.all([
    db.collection("attendance").where("date", "==", day).get(),
    db.collection("live_tracking").get(),
  ]);

  const attendanceDocs = attendanceSnap.docs.map((d) => d.data() as AttendanceDoc);

  const totalCheckIns = attendanceDocs.length;
  const completed = attendanceDocs.filter((d) => d.checkOut != null).length;
  const pending = attendanceDocs.filter(
    (d) => d.checkIn != null && d.checkOut == null
  ).length;

  const lateThresholdUTC = { h: 9, m: 0 };
  const lateArrivals = attendanceDocs.filter((d) => {
    const t = d.checkIn?.time;
    if (!t) return false;
    const ms =
      t && typeof t.toMillis === "function"
        ? t.toMillis()
        : t && typeof t.seconds === "number"
          ? t.seconds * 1000
          : null;
    if (ms == null) return false;
    const dt = new Date(ms);
    return (
      dt.getUTCHours() > lateThresholdUTC.h ||
      (dt.getUTCHours() === lateThresholdUTC.h &&
        dt.getUTCMinutes() >= lateThresholdUTC.m)
    );
  }).length;

  const activeWithinMs = 2 * 60 * 1000;
  type LiveDoc = {
    lastUpdated?: { toMillis?: () => number; seconds?: number } | null;
  };

  const liveDocs = liveSnap.docs.map((d) => d.data() as LiveDoc);
  const activeWorkers = liveDocs.filter((d) => {
    const t = d.lastUpdated;
    const ms =
      t && typeof t.toMillis === "function"
        ? t.toMillis()
        : t && typeof t.seconds === "number"
          ? t.seconds * 1000
          : null;
    if (ms == null) return false;
    return now - ms <= activeWithinMs;
  }).length;

  const completionRate =
    totalCheckIns === 0 ? 0 : Math.round((completed / totalCheckIns) * 100);

  return NextResponse.json({
    activeWorkers,
    totalCheckIns,
    completed,
    pending,
    lateArrivals,
    completionRate,
  });
}
