"use client";

import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DateField } from "@/components/ui/date-field";
import { formFieldLabelClass } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { getFirestoreSeconds } from "@/lib/client/firestore-timestamp";
import { OvertimeAttendanceCapture } from "@/components/client/overtime-attendance-capture";
import { SiteSelectWithCustomRow } from "@/components/client/site-select-with-custom-row";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { calendarDateKeyInTimeZone } from "@/lib/date/calendar-day-key";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";
import { formatInstantDateTime12hInZone, formatInstantTime12hInZone } from "@/lib/time/format-wall-time";
import { adIsoToBsIso, BS_MONTHS, type CalendarMode } from "@/lib/date/bs-calendar";
import { toast } from "sonner";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import { formatIsoForCalendar } from "@/lib/date/bs-calendar";

type Site = { id: string; name?: string };

type OvertimeStamp = {
  time?: { seconds?: number };
  gps?: { latitude?: number; longitude?: number; accuracyM?: number };
  photoUrl?: string;
};

type OvertimeRequestRow = {
  id: string;
  status?: string;
  date?: string;
  reason?: string;
  siteId?: string | null;
  overtimeCheckIn?: OvertimeStamp | null;
  overtimeCheckOut?: OvertimeStamp | null;
};

/** Handles `YYYY-MM-DD` strings or serialized Firestore timestamp objects from the API. */
function normalizeWorkDateKey(v: unknown, timeZone: string): string {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) {
    return v.trim().slice(0, 10);
  }
  const sec = getFirestoreSeconds(v);
  if (sec != null) {
    return calendarDateKeyInTimeZone(new Date(sec * 1000), timeZone);
  }
  return "";
}

function fmtTs(v: OvertimeStamp["time"], displayTimeZone: string, mode: CalendarMode) {
  const s = getFirestoreSeconds(v);
  if (s == null) return "—";
  if (mode === "bs") {
    const adIso = calendarDateKeyInTimeZone(new Date(s * 1000), displayTimeZone);
    const bsIso = adIsoToBsIso(adIso);
    const [y, mo, d] = bsIso.split("-").map(Number);
    const monthName = BS_MONTHS[(mo ?? 1) - 1] ?? "Unknown";
    const timePart = formatInstantTime12hInZone(s * 1000, displayTimeZone, {
      withSeconds: true,
      withTimeZoneName: true,
    });
    return `${monthName} ${d}, ${y} BS, ${timePart}`;
  }
  return formatInstantDateTime12hInZone(s * 1000, displayTimeZone, {
    withSeconds: true,
    withTimeZoneName: true,
  });
}

function fmtGps(g: OvertimeStamp["gps"]) {
  if (!g || typeof g.latitude !== "number" || typeof g.longitude !== "number") return "—";
  const acc =
    typeof g.accuracyM === "number" ? ` ±${Math.round(g.accuracyM)}m` : "";
  return `${g.latitude.toFixed(6)}, ${g.longitude.toFixed(6)}${acc}`;
}

function AttendanceLine({
  kind,
  ts,
  gps,
  photoUrl,
  displayTimeZone,
  mode,
}: {
  kind: "Check-in" | "Check-out";
  ts: OvertimeStamp["time"];
  gps: OvertimeStamp["gps"];
  photoUrl?: string | null;
  displayTimeZone: string;
  mode: CalendarMode;
}) {
  return (
    <div className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
      <span className="text-zinc-500">{kind}: </span>
      <span className="font-mono text-zinc-900 dark:text-zinc-200">{fmtTs(ts, displayTimeZone, mode)}</span>
      <span className="text-zinc-500"> · GPS {fmtGps(gps)}</span>
      {photoUrl ? (
        <>
          {" "}
          ·{" "}
          <a href={photoUrl} target="_blank" rel="noreferrer" className="text-cyan-400 underline">
            photo
          </a>
        </>
      ) : null}
    </div>
  );
}

export function EmployeeOvertimeRequestPanel() {
  const { user } = useDashboardUser();
  const { mode } = useCalendarMode();
  const displayTz = normalizeTimeZoneId(user?.timeZone);
  const [sites, setSites] = React.useState<Site[]>([]);
  const [siteId, setSiteId] = React.useState("");
  const [date, setDate] = React.useState(() =>
    calendarDateKeyInTimeZone(new Date(), normalizeTimeZoneId(undefined))
  );
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [requests, setRequests] = React.useState<OvertimeRequestRow[]>([]);

  const authHeaders = React.useCallback(async () => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    const token = await u.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadSites = React.useCallback(async () => {
    const h = await authHeaders();
    const res = await fetch("/api/sites", { headers: h });
    const data = (await res.json()) as { sites?: Site[] };
    if (res.ok && data.sites) setSites(data.sites);
  }, [authHeaders]);

  const loadMine = React.useCallback(async () => {
    try {
      const h = await authHeaders();
      const res = await fetch("/api/overtime", { headers: h });
      const data = (await res.json()) as { items?: OvertimeRequestRow[] };
      if (res.ok) setRequests(data.items ?? []);
    } catch {
      /* ignore */
    }
  }, [authHeaders]);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        void loadSites();
        void loadMine();
      }
    });
    return () => unsub();
  }, [loadSites, loadMine]);

  const siteLabel = React.useCallback(
    (id: string | null | undefined) => {
      if (!id) return "Unknown site";
      const s = sites.find((x) => x.id === id);
      return s?.name ?? id;
    },
    [sites]
  );

  const submit = async () => {
    if (!siteId.trim()) {
      toast.message("Choose a work site for overtime.");
      return;
    }
    if (reason.trim().length < 3) {
      toast.message("Describe why you need overtime (at least a few words).");
      return;
    }
    setBusy(true);
    try {
      const h = await authHeaders();
      const res = await fetch("/api/overtime", {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: siteId.trim(),
          date: date.trim(),
          reason: reason.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      toast.success("Overtime request created. You can check in/out now, then admins will review.");
      setReason("");
      void loadMine();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="employee-overtime">
      <CardHeader>
        <CardTitle>Overtime request</CardTitle>
        <CardDescription>
          Create overtime, then record overtime check-in and check-out with GPS + selfie on the same
          work date. After you check out, this request stays in admin pending review for approval/rejection.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SiteSelectWithCustomRow
          label="Site"
          sites={sites}
          value={siteId}
          onChange={setSiteId}
          onRefreshSites={loadSites}
        />
        <div className="flex flex-col gap-1.5">
          <span className={formFieldLabelClass}>Work date</span>
          <p className="text-xs text-zinc-600 dark:text-zinc-500">
            The day you will work overtime (same calendar day as check-in and check-out). Default is
            today:{" "}
            <span className="font-mono text-zinc-700 dark:text-zinc-400">
              {calendarDateKeyInTimeZone(new Date(), displayTz)}
            </span>
            .
          </p>
          <DateField
            id="overtime-work-date"
            value={date}
            onChange={setDate}
            aria-label="Work date"
          />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={formFieldLabelClass}>Reason</span>
          <Textarea
            placeholder="What work do you need to continue after hours?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <Button type="button" disabled={busy} onClick={() => void submit()}>
          {busy ? "Sending…" : "Submit overtime request"}
        </Button>
        {requests.length > 0 ? (
          <div className="space-y-4 rounded-xl border border-zinc-200/80 bg-zinc-50/90 p-3 dark:border-white/10 dark:bg-white/[0.02]">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
              Your recent requests &amp; overtime attendance
            </p>
            <ul className="space-y-6 text-sm text-zinc-800 dark:text-zinc-300">
              {requests.slice(0, 12).map((r) => {
                const todayKey = calendarDateKeyInTimeZone(new Date(), displayTz);
                const rowDate = normalizeWorkDateKey(r.date, displayTz);
                const isWorkDateToday = rowDate !== "" && rowDate === todayKey;
                const hasSite =
                  typeof r.siteId === "string" && r.siteId.trim().length > 0;

                const inTime = r.overtimeCheckIn?.time;
                const outTime = r.overtimeCheckOut?.time;
                const hasIn = getFirestoreSeconds(inTime) != null;
                const hasOut = getFirestoreSeconds(outTime) != null;
                
                const finalIsoDate = rowDate || r.date || "";
                const displayDateStr = finalIsoDate ? formatIsoForCalendar(finalIsoDate, mode) : "—";

                return (
                  <li
                    key={r.id}
                    className="space-y-3 border-b border-zinc-200/70 pb-4 last:border-0 last:pb-0 dark:border-white/5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {displayDateStr}
                        </p>
                        <p className="text-xs text-zinc-500">Work date</p>
                        <p className="text-xs text-zinc-500">
                          Site: {siteLabel(typeof r.siteId === "string" ? r.siteId : null)}
                        </p>
                      </div>
                      <span
                        className={
                          r.status === "approved"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : r.status === "rejected"
                              ? "text-red-600 dark:text-red-400"
                              : "text-amber-800 dark:text-amber-200"
                        }
                      >
                        {r.status ?? "pending"}
                      </span>
                    </div>
                    {r.reason ? <p className="text-zinc-600 dark:text-zinc-400">{r.reason}</p> : null}

                    {r.status !== "rejected" ? (
                      <div className="space-y-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-violet-900 dark:text-violet-200/90">
                          Overtime attendance
                        </p>

                        {/* Step 1 — check-in (only until recorded) */}
                        {!hasIn ? (
                          <div className="space-y-2">
                            <p className="text-xs text-zinc-500">
                              Step 1 — Check in at the selected site (GPS + selfie).
                            </p>
                            {isWorkDateToday && hasSite ? (
                              <OvertimeAttendanceCapture
                                key={`${r.id}-overtime-in`}
                                requestId={r.id}
                                mode="check-in"
                                siteLabel={siteLabel(r.siteId)}
                                onComplete={() => void loadMine()}
                              />
                            ) : !hasSite ? (
                              <p className="text-xs text-amber-600 dark:text-amber-200/90">
                                This request has no work site. Create a new overtime request with site selected.
                              </p>
                            ) : (
                              <p className="text-xs text-amber-600 dark:text-amber-200/80">
                                Open this page on work date{" "}
                                <span className="font-mono">{displayDateStr}</span> to check in and check
                                out (same calendar day in your time zone).
                              </p>
                            )}
                          </div>
                        ) : null}

                        {/* Check-in line (always show once recorded) */}
                        {hasIn ? (
                          <AttendanceLine
                            kind="Check-in"
                            ts={inTime}
                            gps={r.overtimeCheckIn?.gps}
                            photoUrl={r.overtimeCheckIn?.photoUrl}
                            displayTimeZone={displayTz}
                            mode={mode}
                          />
                        ) : null}

                        {/* Step 2 — check-out (only after check-in, until recorded) */}
                        {hasIn && !hasOut ? (
                          <div className="space-y-2 border-t border-zinc-200/80 pt-4 dark:border-white/10">
                            <p className="text-xs text-zinc-500">
                              Step 2 — When you finish overtime work, check out (GPS + selfie at the site).
                            </p>
                            {isWorkDateToday && hasSite ? (
                              <OvertimeAttendanceCapture
                                key={`${r.id}-overtime-out`}
                                requestId={r.id}
                                mode="check-out"
                                siteLabel={siteLabel(r.siteId)}
                                onComplete={() => void loadMine()}
                              />
                            ) : !hasSite ? (
                              <p className="text-xs text-amber-600 dark:text-amber-200/90">
                                Check-out needs a work site on this request. Ask an admin to set a site.
                              </p>
                            ) : (
                              <p className="text-xs text-amber-600 dark:text-amber-200/80">
                                Come back on work date <span className="font-mono">{displayDateStr}</span> to
                                check out (same calendar day as this overtime).
                              </p>
                            )}
                          </div>
                        ) : null}

                        {/* Check-out line (once recorded) */}
                        {hasIn && hasOut ? (
                          <AttendanceLine
                            kind="Check-out"
                            ts={outTime}
                            gps={r.overtimeCheckOut?.gps}
                            photoUrl={r.overtimeCheckOut?.photoUrl}
                            displayTimeZone={displayTz}
                            mode={mode}
                          />
                        ) : null}

                        {hasIn && hasOut ? (
                          <p className="border-t border-zinc-200/80 pt-3 text-sm font-medium text-emerald-800 dark:border-white/10 dark:text-emerald-400/95">
                            Overtime session complete. Waiting for admin review.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
