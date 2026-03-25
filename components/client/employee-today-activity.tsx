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
import { attendanceDayKeyUTC } from "@/lib/date/today-key";

type TodayPayload = {
  day: string;
  hasRecord: boolean;
  siteId: string | null;
  siteName: string | null;
  workdayStartUtc: string | null;
  autoCheckoutUtc: string | null;
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
  }[];
};

function fmtTime(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export function EmployeeTodayActivity() {
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
      const day = attendanceDayKeyUTC();
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
  }, []);

  React.useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  if (loading && !data) {
    return <p className="text-sm text-zinc-400">Loading today&apos;s activity…</p>;
  }
  if (err) {
    return <p className="text-sm text-red-400">{err}</p>;
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500">
          UTC day <span className="font-mono text-zinc-300">{data.day}</span> — times shown in UTC
          (same calendar as check-in records).
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
                    Expected start (UTC):{" "}
                    <span className="font-mono text-white">{data.workdayStartUtc}</span>
                  </li>
                ) : null}
                <li>
                  Auto check-out time (UTC):{" "}
                  <span className="font-mono text-white">
                    {data.autoCheckoutUtc ?? "23:59"}
                  </span>{" "}
                  — if you stay checked in past this time, the system may close your session
                  automatically.
                </li>
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
                    Time: <span className="text-zinc-100">{fmtTime(data.checkIn.atMs)}</span>
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
                <CardDescription>Moves to another site during the same day (new selfie each time).</CardDescription>
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
                    <p className="mt-1 text-xs text-zinc-500">
                      {fmtTime(log.atMs ?? null)}
                    </p>
                    {typeof log.photoUrl === "string" ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-white/10">
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
                    Time: <span className="text-zinc-100">{fmtTime(data.checkOut.atMs)}</span>
                    {data.checkOut.auto ? (
                      <span className="ml-2 rounded-md bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200">
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
                  check-out after the site&apos;s end time (UTC).
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
