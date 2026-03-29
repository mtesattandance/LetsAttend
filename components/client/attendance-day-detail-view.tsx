"use client";

import * as React from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { normalizeTimeZoneId, workTimeZoneUiLabel } from "@/lib/date/time-zone";
import type {
  OvertimeDayDetailRow,
  OffsiteDayDetailRow,
} from "@/lib/attendance/worker-day-detail";
import { formatInstantDateTime12hInZone, formatWallHm12h } from "@/lib/time/format-wall-time";

function zoneShortLabel(tz: string): string {
  return tz === "Asia/Kathmandu" ? "NPT" : tz;
}

export type DayDetailPayload =
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
      timeline: {
        kind: "check_in" | "site_switch" | "check_out";
        atMs: number;
        [key: string]: unknown;
      }[];
      analytics: {
        sessionOpen: boolean;
        switchCount: number;
        uniqueSitesCount: number;
        sitesVisitedOrdered: { id: string; name: string }[];
        firstEventMs: number | null;
        lastEventMs: number | null;
        totalSessionMs: number | null;
        segments: {
          siteId: string;
          siteName: string;
          startMs: number;
          endMs: number | null;
          durationMs: number | null;
        }[];
      };
      overtime: OvertimeDayDetailRow[];
      offsite: OffsiteDayDetailRow[];
    };

function fmtLocal(ms: number | null | undefined, displayTimeZone: string) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return formatInstantDateTime12hInZone(ms, displayTimeZone, {
    withSeconds: true,
    withTimeZoneName: true,
  });
}

function fmtDuration(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

function overtimeStatusClass(status: string) {
  if (status === "approved") return "text-emerald-400";
  if (status === "rejected") return "text-red-400";
  if (status === "pending") return "text-amber-300";
  return "text-zinc-400";
}

function offsiteStatusClass(status: string) {
  if (status === "approved") return "text-emerald-400";
  if (status === "rejected") return "text-red-400";
  if (status === "pending") return "text-amber-300";
  return "text-zinc-400";
}

function OffsiteSection({
  rows,
  displayTimeZone,
}: {
  rows: OffsiteDayDetailRow[];
  displayTimeZone: string;
}) {
  if (rows.length === 0) return null;
  const z = workTimeZoneUiLabel(displayTimeZone);
  return (
    <Card className="border-sky-500/20 bg-sky-500/[0.04]">
      <CardHeader>
        <CardTitle className="text-base">Off-site work (requested)</CardTitle>
        <CardDescription>
          Approved windows count toward your day total below ({z} wall times).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r) => {
          const start =
            r.status === "approved" && r.approvedStartHm ? r.approvedStartHm : r.requestedStartHm;
          const end =
            r.status === "approved" && r.approvedEndHm ? r.approvedEndHm : r.requestedEndHm;
          return (
            <div
              key={r.id}
              className="rounded-xl border border-zinc-200/80 bg-zinc-100/80 px-3 py-3 text-sm dark:border-white/10 dark:bg-black/20"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono text-[11px] text-zinc-500">{r.id}</p>
                <span className={cn("text-xs font-semibold capitalize", offsiteStatusClass(r.status))}>
                  {r.status}
                </span>
              </div>
              {r.reason ? (
                <p className="mt-2 text-zinc-300">
                  <span className="text-zinc-500">Reason: </span>
                  {r.reason}
                </p>
              ) : null}
              <p className="mt-1 text-zinc-200">
                <span className="text-zinc-500">Assignee: </span>
                {r.assigneeAdminName ?? r.assigneeAdminEmail ?? r.assigneeAdminUid ?? "—"}
              </p>
              <p className="mt-1 font-mono text-xs text-zinc-400">
                Window: {formatWallHm12h(start)} → {formatWallHm12h(end)} ({z})
              </p>
              {r.durationMs != null && r.durationMs >= 0 ? (
                <p className="mt-1 text-xs text-sky-200/90">Duration: {fmtDuration(r.durationMs)}</p>
              ) : null}
              {r.requestGps ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Request GPS: {r.requestGps.latitude.toFixed(5)}, {r.requestGps.longitude.toFixed(5)}
                  {typeof r.requestGps.accuracyM === "number"
                    ? ` (±${Math.round(r.requestGps.accuracyM)}m)`
                    : ""}
                </p>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DayHoursSummary({
  data,
  displayTimeZone,
}: {
  data: DayDetailPayload;
  displayTimeZone: string;
}) {
  const z = workTimeZoneUiLabel(displayTimeZone);
  const regularMs = data.absent
    ? 0
    : data.analytics.totalSessionMs != null
      ? Math.max(0, data.analytics.totalSessionMs)
      : 0;
  let overtimeMs = 0;
  for (const r of data.overtime) {
    if (r.status !== "approved") continue;
    const a = r.overtimeCheckIn?.atMs;
    const b = r.overtimeCheckOut?.atMs;
    if (a != null && b != null && b >= a) overtimeMs += b - a;
  }
  let offsiteMs = 0;
  for (const r of data.offsite) {
    if (r.status === "approved" && r.durationMs != null && r.durationMs >= 0) {
      offsiteMs += r.durationMs;
    }
  }
  const totalMs = regularMs + overtimeMs + offsiteMs;
  const sessionOpen = data.absent ? false : data.analytics.sessionOpen;

  return (
    <Card className="border-emerald-500/25 bg-emerald-500/[0.05]">
      <CardHeader>
        <CardTitle className="text-base">Day hours summary</CardTitle>
        <CardDescription>
          Regular time from check-in through check-out (per site above), plus approved overtime and
          approved off-site. Times are based on your calendar day in {z}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex flex-wrap justify-between gap-2 border-b border-white/10 pb-2">
          <span className="text-zinc-400">Regular (sites until check-out)</span>
          <span className="font-mono text-emerald-200/90">
            {regularMs > 0 || !data.absent ? (
              <>
                {fmtDuration(regularMs)}
                {sessionOpen ? " (so far)" : ""}
              </>
            ) : (
              "—"
            )}
          </span>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-b border-white/10 pb-2">
          <span className="text-zinc-400">Approved overtime</span>
          <span className="font-mono text-amber-200/90">
            {overtimeMs > 0 ? fmtDuration(overtimeMs) : "—"}
          </span>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-b border-white/10 pb-2">
          <span className="text-zinc-400">Approved off-site</span>
          <span className="font-mono text-sky-200/90">
            {offsiteMs > 0 ? fmtDuration(offsiteMs) : "—"}
          </span>
        </div>
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          <span className="font-medium text-zinc-200">Total credited hours</span>
          <span className="font-mono text-lg font-semibold text-emerald-100">
            {totalMs > 0 ? fmtDuration(totalMs) : "—"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function OvertimeSection({
  rows,
  displayTimeZone,
}: {
  rows: OvertimeDayDetailRow[];
  displayTimeZone: string;
}) {
  if (rows.length === 0) return null;
  const z = workTimeZoneUiLabel(displayTimeZone);
  return (
    <Card className="border-amber-500/20 bg-amber-500/[0.04]">
      <CardHeader>
        <CardTitle className="text-base">Overtime (requested)</CardTitle>
        <CardDescription>
          Approved overtime records for this calendar day ({z}): check-in/out and site, separate from the
          main shift timeline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r) => {
          const spanMs =
            r.overtimeCheckIn?.atMs != null && r.overtimeCheckOut?.atMs != null
              ? r.overtimeCheckOut.atMs - r.overtimeCheckIn.atMs
              : null;
          return (
            <div
              key={r.id}
              className="rounded-xl border border-zinc-200/80 bg-zinc-100/80 px-3 py-3 text-sm dark:border-white/10 dark:bg-black/20"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono text-[11px] text-zinc-500">{r.id}</p>
                <span className={cn("text-xs font-semibold capitalize", overtimeStatusClass(r.status))}>
                  {r.status}
                </span>
              </div>
              {r.reason ? (
                <p className="mt-2 text-zinc-300">
                  <span className="text-zinc-500">Reason: </span>
                  {r.reason}
                </p>
              ) : null}
              <p className="mt-1 text-zinc-200">
                <span className="text-zinc-500">Site: </span>
                {r.siteName ?? (r.siteId ?? "—")}
              </p>
              {spanMs != null && spanMs >= 0 ? (
                <p className="mt-1 text-xs text-amber-200/90">Overtime duration: {fmtDuration(spanMs)}</p>
              ) : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-400/90">
                    OT check-in
                  </p>
                  <p className="font-mono text-xs text-zinc-500">
                    {fmtLocal(r.overtimeCheckIn?.atMs, displayTimeZone)}
                  </p>
                  {typeof r.overtimeCheckIn?.photoUrl === "string" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.overtimeCheckIn.photoUrl}
                      alt="Overtime check-in"
                      className="mt-2 max-h-40 rounded-lg border border-white/10 object-contain"
                    />
                  ) : null}
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-400/90">
                    OT check-out
                  </p>
                  <p className="font-mono text-xs text-zinc-500">
                    {fmtLocal(r.overtimeCheckOut?.atMs, displayTimeZone)}
                  </p>
                  {typeof r.overtimeCheckOut?.photoUrl === "string" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.overtimeCheckOut.photoUrl}
                      alt="Overtime check-out"
                      className="mt-2 max-h-40 rounded-lg border border-white/10 object-contain"
                    />
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

type Props = {
  data: DayDetailPayload | null;
  loading: boolean;
  error: string | null;
  backHref: string;
  backLabel?: string;
  showWorkerHeader?: boolean;
};

export function AttendanceDayDetailView({
  data,
  loading,
  error,
  backHref,
  backLabel = "Back",
  showWorkerHeader = true,
}: Props) {
  const { user } = useDashboardUser();
  const displayTz = normalizeTimeZoneId(user?.timeZone);
  const zoneLabel = workTimeZoneUiLabel(displayTz);

  if (loading && !data) {
    return (
      <div className="space-y-4" aria-hidden>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }
  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {showWorkerHeader ? (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Day timeline</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="font-mono text-zinc-300">{data.day}</span>
              {data.workerName ? (
                <>
                  {" "}
                  · <span className="text-zinc-200">{data.workerName}</span>
                </>
              ) : null}
              {data.workerEmail ? (
                <span className="text-zinc-500"> ({data.workerEmail})</span>
              ) : null}
            </p>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Day detail</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Calendar day ({zoneLabel}):{" "}
              <span className="font-mono text-zinc-300">{data.day}</span>
            </p>
          </div>
        )}
        <Button asChild variant="secondary" size="sm">
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </div>

      {data.absent ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>No attendance</CardTitle>
              <CardDescription>
                No check-in record for this calendar day — absent or not scheduled.
              </CardDescription>
            </CardHeader>
          </Card>
          <OvertimeSection rows={data.overtime} displayTimeZone={displayTz} />
          <OffsiteSection rows={data.offsite} displayTimeZone={displayTz} />
          <DayHoursSummary data={data} displayTimeZone={displayTz} />
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-zinc-50/90 dark:bg-white/[0.02]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Day status</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold text-zinc-100">
                  {data.analytics.sessionOpen ? (
                    <span className="text-emerald-400">Session open</span>
                  ) : (
                    <span className="text-zinc-200">Completed</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-zinc-500 capitalize">Record: {data.status}</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-50/90 dark:bg-white/[0.02]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Active site (now)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold text-zinc-100">
                  {data.currentSiteName ?? "—"}
                </p>
                {data.currentSiteId ? (
                  <p className="mt-1 font-mono text-[10px] text-zinc-600">{data.currentSiteId}</p>
                ) : null}
              </CardContent>
            </Card>
            <Card className="bg-zinc-50/90 dark:bg-white/[0.02]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Sites visited</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold text-cyan-300">
                  {data.analytics.uniqueSitesCount}
                </p>
                <p className="mt-1 text-xs text-zinc-500">Unique locations this day</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-50/90 dark:bg-white/[0.02]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Session span</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold text-zinc-100">
                  {fmtDuration(data.analytics.totalSessionMs)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {data.analytics.sessionOpen
                    ? "From first check-in (still open)"
                    : "Check-in → check-out"}
                </p>
              </CardContent>
            </Card>
          </div>

          {data.analytics.segments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Time by site</CardTitle>
                <CardDescription>
                  Estimated duration at each site from check-in, switches, and check-out times.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {data.analytics.segments.map((seg, i) => (
                    <li
                      key={`${seg.siteId}-${i}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.02]"
                    >
                      <div>
                        <p className="font-medium text-zinc-100">{seg.siteName}</p>
                        <p className="text-xs text-zinc-500">
                          {fmtLocal(seg.startMs, displayTz)}
                          {seg.endMs != null ? ` → ${fmtLocal(seg.endMs, displayTz)}` : " → …"}
                        </p>
                      </div>
                      <p className="font-mono text-cyan-300/90">
                        {seg.durationMs != null ? fmtDuration(seg.durationMs) : "In progress"}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <OvertimeSection rows={data.overtime} displayTimeZone={displayTz} />
          <OffsiteSection rows={data.offsite} displayTimeZone={displayTz} />

          <Card className="border-violet-500/20 bg-violet-500/[0.03]">
            <CardHeader>
              <CardTitle className="text-base">Full timeline</CardTitle>
              <CardDescription>
                {data.analytics.switchCount} site switch
                {data.analytics.switchCount === 1 ? "" : "es"}. Events in chronological order ({zoneLabel}).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-0 border-l border-white/15 pl-6">
                {data.timeline.map((ev, idx) => (
                  <li key={idx} className="mb-6 ml-1 last:mb-0">
                    <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-violet-500 bg-zinc-950" />
                    {ev.kind === "check_in" ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400/90">
                          Check-in
                        </p>
                        <p className="text-sm text-zinc-200">
                          <strong>{String((ev as { siteName?: string }).siteName ?? "?")}</strong>
                        </p>
                        <p className="font-mono text-xs text-zinc-500">{fmtLocal(ev.atMs, displayTz)}</p>
                        {typeof (ev as { photoUrl?: string }).photoUrl === "string" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={(ev as unknown as { photoUrl: string }).photoUrl}
                            alt="Check-in"
                            className="max-h-48 rounded-lg border border-zinc-200/80 object-contain dark:border-white/10"
                          />
                        ) : null}
                      </div>
                    ) : ev.kind === "site_switch" ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-400/90">
                          Site switch
                        </p>
                        <p className="text-sm text-zinc-200">
                          <span className="text-cyan-300">
                            {(ev as { fromSiteName?: string }).fromSiteName}
                          </span>
                          {" → "}
                          <span className="text-emerald-300">
                            {(ev as { toSiteName?: string }).toSiteName}
                          </span>
                        </p>
                        <p className="font-mono text-xs text-zinc-500">{fmtLocal(ev.atMs, displayTz)}</p>
                        {(ev as { previousSiteCheckOut?: { siteName?: string } | null })
                          .previousSiteCheckOut ? (
                          <p className="text-xs text-amber-200/80">
                            Segment check-out from{" "}
                            <strong>
                              {
                                (
                                  ev as unknown as {
                                    previousSiteCheckOut: { siteName: string };
                                  }
                                ).previousSiteCheckOut.siteName
                              }
                            </strong>{" "}
                            (not end of day)
                          </p>
                        ) : null}
                        {typeof (ev as { arrivalPhotoUrl?: string }).arrivalPhotoUrl === "string" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={(ev as unknown as { arrivalPhotoUrl: string }).arrivalPhotoUrl}
                            alt="Switch"
                            className="max-h-48 rounded-lg border border-zinc-200/80 object-contain dark:border-white/10"
                          />
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                          Check-out {(ev as { auto?: boolean }).auto ? "(automatic)" : ""}
                        </p>
                        <p className="text-sm text-zinc-200">
                          <strong>{String((ev as { siteName?: string }).siteName ?? "?")}</strong> — end
                          of day
                        </p>
                        <p className="font-mono text-xs text-zinc-500">{fmtLocal(ev.atMs, displayTz)}</p>
                        {typeof (ev as { photoUrl?: string }).photoUrl === "string" &&
                        !(ev as { auto?: boolean }).auto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={(ev as unknown as { photoUrl: string }).photoUrl}
                            alt="Check-out"
                            className="max-h-48 rounded-lg border border-zinc-200/80 object-contain dark:border-white/10"
                          />
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary fields</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-zinc-500">First check-in (site)</dt>
                <dd className={cn("font-medium text-zinc-100")}>
                  {data.checkIn?.siteName ?? "—"}
                </dd>
                <dd className="font-mono text-xs text-zinc-500">{fmtLocal(data.checkIn?.atMs, displayTz)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Final check-out</dt>
                <dd className="font-medium text-zinc-100">
                  {data.checkOut ? (
                    <>
                      {data.checkOut.siteName}
                      {data.checkOut.auto ? (
                        <span className="ml-2 text-xs text-amber-400">auto</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-zinc-500">Still open</span>
                  )}
                </dd>
                <dd className="font-mono text-xs text-zinc-500">{fmtLocal(data.checkOut?.atMs, displayTz)}</dd>
              </div>
            </CardContent>
          </Card>

          <DayHoursSummary data={data} displayTimeZone={displayTz} />
        </>
      )}
    </div>
  );
}
