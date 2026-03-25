"use client";

import { collection, getDocs, query, where } from "firebase/firestore";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

function utcKey(y: number, m0: number, d: number) {
  return `${y}-${pad(m0 + 1)}-${pad(d)}`;
}

function buildMonthGrid(
  y: number,
  m0: number,
  attended: Set<string>,
  todayKey: string
) {
  const firstDow = new Date(Date.UTC(y, m0, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  const cells: (DayMeta | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = utcKey(y, m0, d);
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
  return cells;
}

export type AttendanceCalendarProps = {
  /** When set (e.g. admin viewing a worker), loads that worker’s attendance. */
  workerId?: string;
  title?: string;
  description?: string;
};

export function AttendanceCalendar({
  workerId: workerIdProp,
  title = "Attendance",
  description = "UTC month view — ✓ checked in; ✕ past day with no record.",
}: AttendanceCalendarProps) {
  const now = new Date();
  const [y, setY] = React.useState(now.getUTCFullYear());
  const [m0, setM0] = React.useState(now.getUTCMonth());
  const [attended, setAttended] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);

  const todayKey = utcKey(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
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
    () => buildMonthGrid(y, m0, attended, todayKey),
    [y, m0, attended, todayKey]
  );

  const label = new Date(Date.UTC(y, m0, 1)).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-lg border border-white/10 p-2 hover:bg-white/5"
              aria-label="Previous month"
              onClick={() => {
                if (m0 === 0) {
                  setM0(11);
                  setY((yy) => yy - 1);
                } else setM0((mm) => mm - 1);
              }}
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[140px] text-center text-sm font-medium">
              {label}
            </span>
            <button
              type="button"
              className="rounded-lg border border-white/10 p-2 hover:bg-white/5"
              aria-label="Next month"
              onClick={() => {
                if (m0 === 11) {
                  setM0(0);
                  setY((yy) => yy + 1);
                } else setM0((mm) => mm + 1);
              }}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-zinc-400">Loading attendance…</p>
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
                  <div
                    key={cell.key}
                    className={cn(
                      "flex aspect-square flex-col items-center justify-center rounded-lg border text-xs",
                      cell.isToday && "ring-2 ring-cyan-400/60",
                      cell.present &&
                        "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
                      cell.missed &&
                        !cell.present &&
                        "border-red-500/30 bg-red-500/10 text-red-200",
                      !cell.present &&
                        !cell.missed &&
                        "border-white/10 bg-white/[0.02] text-zinc-400"
                    )}
                    title={cell.key}
                  >
                    <span className="font-medium">{cell.day}</span>
                    {cell.present ? (
                      <span className="text-[10px]">✓</span>
                    ) : cell.missed ? (
                      <span className="text-[10px]">✕</span>
                    ) : null}
                  </div>
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
