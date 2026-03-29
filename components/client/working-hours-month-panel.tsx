"use client";

import * as React from "react";
import { DateTime } from "luxon";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { DEFAULT_ATTENDANCE_TIME_ZONE } from "@/lib/date/time-zone";
import { MONTHLY_REGULAR_CAP_HOURS } from "@/lib/attendance/month-hours-cap";
import { WorkingHoursMonthPickerCard } from "@/components/client/working-hours-month-picker-card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type DayRow = {
  day: string;
  regularSessionMs: number;
  approvedOvertimeMs: number;
  approvedOffsiteMs: number;
  totalMs: number;
};

type Payload = {
  month: string;
  zone: string;
  days: DayRow[];
  totalHours: number;
  approvedOffsiteHours: number;
  approvedClockOvertimeHours: number;
  onSiteSessionHours: number;
  regularHoursUpToCap: number;
  hoursOverCapAsOvertime: number;
};

function msToHr(ms: number): number {
  return ms / 3_600_000;
}

function fmtHr(h: number): string {
  return `${h.toFixed(2)}`;
}

function currentMonthYyyyMm(zone: string): string {
  return DateTime.now().setZone(zone).toFormat("yyyy-MM");
}

export function WorkingHoursMonthPanel({
  workerId,
}: {
  /** When set, loads that user (admin only). When omitted, loads the signed-in user. */
  workerId?: string;
}) {
  const zone = DEFAULT_ATTENDANCE_TIME_ZONE;
  const [month, setMonth] = React.useState(() => currentMonthYyyyMm(zone));
  const [data, setData] = React.useState<Payload | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const q = new URLSearchParams({ month });
      if (workerId) q.set("workerId", workerId);
      const res = await fetch(`/api/attendance/working-hours?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as Payload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month, workerId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const titleMonth = React.useMemo(() => {
    const dt = DateTime.fromFormat(month, "yyyy-MM", { zone });
    return dt.isValid ? dt.toFormat("LLLL yyyy") : month;
  }, [month, zone]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <WorkingHoursMonthPickerCard
          value={month}
          onChange={setMonth}
          zone={zone}
          disabled={loading && !data}
        />
        {loading && data ? (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Updating…</p>
        ) : null}
      </div>

      {loading && !data ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Total (credited)</CardTitle>
                <CardDescription>{titleMonth}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">
                  {fmtHr(data.totalHours)} h
                </p>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  On-site sessions + approved overtime + approved off-site (same rules as day
                  detail).
                </p>
              </CardContent>
            </Card>
            <Card className="border-violet-200/80 dark:border-violet-500/25">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Off-site hours</CardTitle>
                <CardDescription>Approved off-site work this month</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums text-violet-700 dark:text-violet-300">
                  {fmtHr(data.approvedOffsiteHours)} h
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Monthly cap &amp; overtime</CardTitle>
                <CardDescription>{MONTHLY_REGULAR_CAP_HOURS} h regular target</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  <span className="text-zinc-500">Regular (up to cap): </span>
                  <span className="font-medium tabular-nums">
                    {fmtHr(data.regularHoursUpToCap)} h
                  </span>
                </p>
                <p>
                  <span className="text-zinc-500">Overtime (above {MONTHLY_REGULAR_CAP_HOURS} h): </span>
                  <span className="font-medium tabular-nums text-amber-700 dark:text-amber-300">
                    {fmtHr(data.hoursOverCapAsOvertime)} h
                  </span>
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Example: {MONTHLY_REGULAR_CAP_HOURS + 4} h total → {MONTHLY_REGULAR_CAP_HOURS} h regular +
                  4 h overtime.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Month timeline</CardTitle>
              <CardDescription>
                Every calendar day in {titleMonth} — on-site session, approved clock overtime, approved
                off-site.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                    <th className="py-2 pr-3">Day</th>
                    <th className="py-2 pr-3 tabular-nums">On-site</th>
                    <th className="py-2 pr-3 tabular-nums">OT</th>
                    <th className="py-2 pr-3 tabular-nums">Off-site</th>
                    <th className="py-2 tabular-nums">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((d) => {
                    const dt = DateTime.fromISO(d.day, { zone });
                    const dow = dt.isValid ? dt.toFormat("ccc") : "";
                    const on = msToHr(d.regularSessionMs);
                    const ot = msToHr(d.approvedOvertimeMs);
                    const off = msToHr(d.approvedOffsiteMs);
                    const tot = msToHr(d.totalMs);
                    const weekend =
                      dt.isValid && (dt.weekday === 6 || dt.weekday === 7);
                    return (
                      <tr
                        key={d.day}
                        className={cn(
                          "border-b border-zinc-100 dark:border-white/5",
                          weekend && "bg-zinc-50/80 dark:bg-white/3"
                        )}
                      >
                        <td className="py-1.5 pr-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                          {d.day}
                          {dow ? (
                            <span className="ml-2 text-[11px] text-zinc-400">{dow}</span>
                          ) : null}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                          {fmtHr(on)}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                          {fmtHr(ot)}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums text-violet-700 dark:text-violet-300">
                          {fmtHr(off)}
                        </td>
                        <td className="py-1.5 tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                          {fmtHr(tot)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-zinc-300 bg-zinc-100/80 font-medium dark:border-white/20 dark:bg-white/6">
                    <td className="py-2 pr-3 text-zinc-800 dark:text-zinc-200">Month total</td>
                    <td className="py-2 pr-3 tabular-nums">{fmtHr(data.onSiteSessionHours)}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {fmtHr(data.approvedClockOvertimeHours)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-violet-800 dark:text-violet-200">
                      {fmtHr(data.approvedOffsiteHours)}
                    </td>
                    <td className="py-2 tabular-nums">{fmtHr(data.totalHours)}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
