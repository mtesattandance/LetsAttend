"use client";

import { collection, getDocs, query, where } from "firebase/firestore";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DateTime } from "luxon";
import * as React from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import { BS_MONTHS, adIsoToBsIso, bsIsoToAdIso, bsMonthDays, type CalendarMode, dayNumberForMode } from "@/lib/date/bs-calendar";
import { calendarDateKeyInTimeZone } from "@/lib/date/calendar-day-key";
import { normalizeTimeZoneId, workTimeZoneUiLabel } from "@/lib/date/time-zone";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type DayMeta = {
  key: string;
  day: number;
  present: boolean;
  missed: boolean;
  isToday: boolean;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function dayKey(y: number, m0: number, d: number) {
  return `${y}-${pad(m0 + 1)}-${pad(d)}`;
}

function buildMonthGrid(
  viewIso: string,
  mode: CalendarMode,
  attended: Set<string>,
  todayKey: string,
  zone: string
) {
  const cells: (DayMeta | null)[] = [];
  if (mode === "ad") {
    const viewDt = DateTime.fromISO(viewIso, { zone });
    const first = viewDt.startOf("month");
    const firstDow = first.weekday % 7;
    const daysInMonth = first.daysInMonth ?? 30;
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const key = dayKey(viewDt.year, viewDt.month - 1, d);
      const present = attended.has(key);
      const missed = key < todayKey && !present;
      cells.push({
        key,
        day: d,
        present,
        missed,
        isToday: key === todayKey,
      });
    }
  } else {
    const bsStr = adIsoToBsIso(viewIso);
    const [bsY, bsM] = bsStr.split("-").map(Number);
    const firstAdIso = bsIsoToAdIso(`${bsY}-${pad(bsM)}-01`);
    const firstAd = DateTime.fromISO(firstAdIso, { zone });
    const firstDow = firstAd.weekday % 7;
    const daysInMonth = bsMonthDays(bsY, bsM);
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const key = bsIsoToAdIso(`${bsY}-${pad(bsM)}-${pad(d)}`);
      const present = attended.has(key);
      const missed = key < todayKey && !present;
      cells.push({
        key,
        day: d,
        present,
        missed,
        isToday: key === todayKey,
      });
    }
  }
  return cells;
}

export type AttendanceCalendarProps = {
  /** When set (e.g. admin viewing a worker), loads that worker’s attendance. */
  workerId?: string;
  title?: string;
  description?: string;
  /**
   * Base path for admin day detail: navigates to `{base}/{workerId}/attendance/{yyyy-mm-dd}`.
   * Default `/dashboard/admin/workers`.
   */
  adminDayDetailBasePath?: string;
};

export function AttendanceCalendar({
  workerId: workerIdProp,
  title = "Attendance",
  description = "Month view in your work time zone (from your device) — ✓ checked in; ✕ past day with no record.",
  adminDayDetailBasePath = "/dashboard/admin/workers",
}: AttendanceCalendarProps) {
  const router = useRouter();
  const { user } = useDashboardUser();
  const { mode } = useCalendarMode();
  const tz = normalizeTimeZoneId(user?.timeZone);

  const nowZ = React.useMemo(() => DateTime.now().setZone(tz), [tz]);
  const [viewIso, setViewIso] = React.useState(nowZ.startOf("month").toISODate()!);

  React.useEffect(() => {
    const n = DateTime.now().setZone(tz);
    if (mode === "bs") {
      setViewIso(() => {
        const bsStr = adIsoToBsIso(n.toISODate()!);
        const [y, m] = bsStr.split("-").map(Number);
        return bsIsoToAdIso(`${y}-${pad(m)}-01`);
      });
    } else {
      setViewIso(n.startOf("month").toISODate()!);
    }
  }, [tz, mode]);

  const [attended, setAttended] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);

  const todayKey = React.useMemo(
    () => calendarDateKeyInTimeZone(new Date(), tz),
    [tz]
  );

  React.useEffect(() => {
    let cancelled = false;
    const auth = getFirebaseAuth();

    const loadFor = async (u: User, workerId: string) => {
      setLoading(true);
      try {
        const next = new Set<string>();
        const explicit = workerIdProp?.trim();
        const viewingOther =
          !!explicit && explicit.length > 0 && explicit !== u.uid;

        if (viewingOther) {
          const token = await u.getIdToken();
          const res = await fetch(
            `/api/admin/worker-attendance?workerId=${encodeURIComponent(workerId)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const data = (await res.json()) as { dates?: string[]; error?: string };
          if (!res.ok) {
            throw new Error(data.error ?? "Failed to load attendance");
          }
          for (const d of data.dates ?? []) {
            if (typeof d === "string") next.add(d);
          }
        } else {
          const db = getFirebaseDb();
          const q = query(
            collection(db, "attendance"),
            where("workerId", "==", workerId)
          );
          const snap = await getDocs(q);
          snap.forEach((docSnap) => {
            const data = docSnap.data() as { date?: string };
            if (data.date && typeof data.date === "string") next.add(data.date);
          });
        }
        if (!cancelled) setAttended(next);
      } catch {
        if (!cancelled) setAttended(new Set());
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setAttended(new Set());
        setLoading(false);
        return;
      }
      const id = workerIdProp?.trim() || u.uid;
      await loadFor(u, id);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [workerIdProp]);

  const cells = React.useMemo(
    () => buildMonthGrid(viewIso, mode, attended, todayKey, tz),
    [viewIso, mode, attended, todayKey, tz]
  );

  const label = React.useMemo(() => {
    if (mode === "ad") {
      return DateTime.fromISO(viewIso, { zone: tz }).toFormat("LLLL yyyy");
    }
    const bsStr = adIsoToBsIso(viewIso);
    const [y, m] = bsStr.split("-").map(Number);
    const monthIndex = Math.max(0, Math.min(11, (m ?? 1) - 1));
    return `${BS_MONTHS[monthIndex] ?? "Unknown"} ${y} BS`;
  }, [viewIso, mode, tz]);

  const zoneShort = workTimeZoneUiLabel(tz);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>
              {description}{" "}
              <span className="text-zinc-500">({zoneShort})</span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-lg border border-zinc-200/90 p-2 hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-white/5"
              aria-label="Previous month"
              onClick={() => {
                if (mode === "ad") {
                  setViewIso((prev) =>
                    DateTime.fromISO(prev).minus({ months: 1 }).startOf("month").toISODate()!
                  );
                } else {
                  setViewIso((prev) => {
                    const bsStr = adIsoToBsIso(prev);
                    const [y, m] = bsStr.split("-").map(Number);
                    const prevM = m === 1 ? 12 : m - 1;
                    const prevY = m === 1 ? y - 1 : y;
                    return bsIsoToAdIso(`${prevY}-${pad(prevM)}-01`);
                  });
                }
              }}
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[140px] text-center text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {label}
            </span>
            <button
              type="button"
              className="rounded-lg border border-zinc-200/90 p-2 hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-white/5"
              aria-label="Next month"
              onClick={() => {
                if (mode === "ad") {
                  setViewIso((prev) =>
                    DateTime.fromISO(prev).plus({ months: 1 }).startOf("month").toISODate()!
                  );
                } else {
                  setViewIso((prev) => {
                    const bsStr = adIsoToBsIso(prev);
                    const [y, m] = bsStr.split("-").map(Number);
                    const nextM = m === 12 ? 1 : m + 1;
                    const nextY = m === 12 ? y + 1 : y;
                    return bsIsoToAdIso(`${nextY}-${pad(nextM)}-01`);
                  });
                }
              }}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2" aria-hidden>
            <div className="mb-2 grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="mx-auto h-3 w-8" />
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, i) =>
                cell ? (
                  <button
                    key={cell.key}
                    type="button"
                    className={cn(
                      "flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition-colors hover:bg-zinc-100 dark:hover:bg-white/5",
                      cell.isToday && "ring-2 ring-cyan-400/60",
                      cell.present &&
                        "border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
                      cell.missed &&
                        !cell.present &&
                        "border-red-500/40 bg-red-500/15 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
                      !cell.present &&
                        !cell.missed &&
                        "border-zinc-200/80 bg-zinc-50/90 text-zinc-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-400"
                    )}
                    title={`${cell.key} — open day timeline`}
                    onClick={() => {
                      const wid = workerIdProp?.trim();
                      if (wid) {
                        const base = adminDayDetailBasePath.replace(/\/$/, "");
                        router.push(`${base}/${wid}/attendance/${cell.key}`);
                        return;
                      }
                      router.push(`/dashboard/employee/detailwork/${cell.key}`);
                    }}
                  >
                    <span className="font-medium">
                      {mode === "bs" ? dayNumberForMode(cell.key, mode) : cell.day}
                    </span>
                    {cell.present ? (
                      <span className="text-[10px]">✓</span>
                    ) : cell.missed ? (
                      <span className="text-[10px]">✕</span>
                    ) : null}
                  </button>
                ) : (
                  <div key={`e-${i}`} />
                )
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
