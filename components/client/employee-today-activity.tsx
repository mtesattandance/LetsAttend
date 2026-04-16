"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { calendarDateKeyInTimeZone } from "@/lib/date/calendar-day-key";
import { normalizeTimeZoneId, workTimeZoneUiLabel } from "@/lib/date/time-zone";
import {
  formatInstantTime12hInZone,
  formatWallHm12h,
} from "@/lib/time/format-wall-time";

type TodayPayload = {
  day: string;
  hasRecord: boolean;
  siteId: string | null;
  siteName: string | null;
  workdayStartUtc: string | null;
  workdayEndUtc: string | null;
  checkIn: {
    atMs: number | null;
    photoUrl: string | null;
    gps: unknown;
  } | null;
  checkOut: {
    atMs: number | null;
    photoUrl: string | null;
    gps: unknown;
    auto: boolean;
  } | null;
  siteSwitchLogs: {
    fromSiteId?: string;
    toSiteId?: string;
    fromSiteName?: string | null;
    toSiteName?: string | null;
    photoUrl?: unknown;
    atMs?: number | null;
    previousSiteCheckOut?: {
      siteId?: string;
      siteName?: string | null;
      atMs?: number | null;
      photoUrl?: string | null;
      gps?: unknown;
    } | null;
  }[];
};

function fmtTime(ms: number | null | undefined, displayTimeZone: string) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return formatInstantTime12hInZone(ms, displayTimeZone, {
    withSeconds: true,
    withTimeZoneName: true,
  });
}

export function EmployeeTodayActivity() {
  const { user } = useDashboardUser();
  const displayTz = normalizeTimeZoneId(user?.timeZone);
  const zoneLabel = workTimeZoneUiLabel(displayTz);
  const [data, setData] = React.useState<TodayPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const day = calendarDateKeyInTimeZone(new Date(), displayTz);
      const res = await fetch(`/api/attendance/today?day=${encodeURIComponent(day)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as TodayPayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [displayTz]);

  React.useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="space-y-3" aria-hidden>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }
  if (err) {
    return <p className="text-sm text-red-400">{err}</p>;
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500">
          Work date{" "}
          <span className="font-mono text-zinc-300">{data.day}</span> — times in your profile timezone
          (same calendar as check-in).
        </p>
        <button
          type="button"
          className="text-xs text-cyan-400 hover:underline"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      {!data.hasRecord ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No attendance yet</CardTitle>
            <CardDescription>
              Check in from <strong>Work</strong> when your shift starts. This page will show your
              check-in, any site switches, and check-out.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Site & schedule</CardTitle>
              <CardDescription>
                {data.siteName ? (
                  <>
                    Active site: <strong>{data.siteName}</strong>
                    {data.siteId ? (
                      <span className="ml-2 font-mono text-xs text-zinc-500">{data.siteId}</span>
                    ) : null}
                  </>
                ) : (
                  "Site"
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-zinc-300">
              <ul className="space-y-1">
                {data.workdayStartUtc ? (
                  <li>
                    Expected start ({zoneLabel}):{" "}
                    <span className="font-mono text-white">
                      {formatWallHm12h(data.workdayStartUtc)}
                    </span>
                  </li>
                ) : null}
                {data.workdayEndUtc ? (
                  <li>
                    Work end ({zoneLabel}):{" "}
                    <span className="font-mono text-white">
                      {formatWallHm12h(data.workdayEndUtc)}
                    </span>
                  </li>
                ) : null}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Check-in</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.checkIn ? (
                <>
                  <p>
                    Time: <span className="text-zinc-100">{fmtTime(data.checkIn.atMs, displayTz)}</span>
                  </p>
                  {data.checkIn.photoUrl ? (
                    <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={data.checkIn.photoUrl}
                        alt="Check-in"
                        className="max-h-56 w-full object-contain"
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-zinc-500">—</p>
              )}
            </CardContent>
          </Card>

          {data.siteSwitchLogs.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Site switches today</CardTitle>
                <CardDescription>
                  Each switch records <strong>check-out from the site you left</strong> and proof at the new
                  site. Your <strong>end-of-day check-out</strong> is separate (Work → Check out).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.siteSwitchLogs.map((log, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm"
                  >
                    <p className="text-zinc-300">
                      <span className="text-cyan-400">
                        {log.fromSiteName ?? log.fromSiteId ?? "?"}
                      </span>
                      {" → "}
                      <span className="text-emerald-300">
                        {log.toSiteName ?? log.toSiteId ?? "?"}
                      </span>
                    </p>
                    {log.previousSiteCheckOut ? (
                      <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-zinc-400">
                        <p className="font-medium text-amber-600 dark:text-amber-200/90">
                          Check-out from{" "}
                          <span className="text-amber-100">
                            {log.previousSiteCheckOut.siteName ?? log.previousSiteCheckOut.siteId ?? "?"}
                          </span>{" "}
                          (switch — not end of day)
                        </p>
                        <p className="mt-0.5">{fmtTime(log.previousSiteCheckOut.atMs ?? null, displayTz)}</p>
                      </div>
                    ) : null}
                    <p className="mt-1 text-xs text-zinc-500">
                      Arrived at new site: {fmtTime(log.atMs ?? null, displayTz)}
                    </p>
                    {typeof log.photoUrl === "string" ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-white/10">
                        <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">
                          Proof at new site (also closes previous site segment)
                        </p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={log.photoUrl}
                          alt="Switch"
                          className="max-h-40 w-full object-contain"
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Check-out</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.checkOut ? (
                <>
                  <p>
                    Time: <span className="text-zinc-100">{fmtTime(data.checkOut.atMs, displayTz)}</span>
                    {data.checkOut.auto ? (
                      <span className="ml-2 rounded-md bg-amber-100 dark:bg-amber-500/20 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-200">
                        Automatic (end of day)
                      </span>
                    ) : null}
                  </p>
                  {data.checkOut.photoUrl && !data.checkOut.auto ? (
                    <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={data.checkOut.photoUrl}
                        alt="Check-out"
                        className="max-h-56 w-full object-contain"
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-zinc-400">
                  Still checked in — use <strong>Work</strong> to check out, or wait for automatic
                  check-out after the site&apos;s end time ({zoneLabel}).
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
