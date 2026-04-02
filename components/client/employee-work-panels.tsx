"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, TimerOff, LogIn, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { calendarDateKeyInTimeZone } from "@/lib/date/calendar-day-key";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";
import { EmployeeCheckInPanel } from "@/components/client/employee-check-in-panel";
import { EmployeeSiteSwitchPanel } from "@/components/client/employee-site-switch-panel";
import { EmployeeCheckOutPanel } from "@/components/client/employee-check-out-panel";
import { LiveTrackingToggle } from "@/components/client/live-tracking-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type TodayResponse = {
  checkIn: { atMs: number | null } | null;
  checkOut: { atMs: number | null } | null;
  workdayEndUtc: string | null;
  error?: string;
};

/** Which action was requested via URL hash or search param */
type FocusAction = "check-in" | "check-out" | "site-switch" | null;

function getFocusFromHash(): FocusAction {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace("#", "");
  if (hash === "employee-check-out") return "check-out";
  if (hash === "employee-site-switch") return "site-switch";
  if (hash === "employee-check-in") return "check-in";
  return null;
}

function getTimezoneOffsetMs(tz: string): number {
  try {
    const now = new Date();
    const utcF = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "numeric", hour12: false });
    const localF = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hour12: false });
    const u = utcF.formatToParts(now);
    const l = localF.formatToParts(now);
    const uH = Number(u.find((p) => p.type === "hour")?.value ?? 0);
    const uM = Number(u.find((p) => p.type === "minute")?.value ?? 0);
    const lH = Number(l.find((p) => p.type === "hour")?.value ?? 0);
    const lM = Number(l.find((p) => p.type === "minute")?.value ?? 0);
    return ((lH * 60 + lM) - (uH * 60 + uM)) * 60_000;
  } catch {
    return 5 * 3600_000 + 45 * 60_000;
  }
}

function wallHmToTodayMs(hm: string | null, tz: string): number | null {
  if (!hm) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(hm);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (!year || !month || !day) return null;
    const tzOffset = getTimezoneOffsetMs(tz);
    return Date.UTC(Number(year), Number(month) - 1, Number(day), h, m) - tzOffset;
  } catch {
    return null;
  }
}

function fmtDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const mn = totalMin % 60;
  if (h > 0 && mn > 0) return `${h}h ${mn}m`;
  if (h > 0) return `${h}h`;
  return `${mn}m`;
}

/** Green "Work done" banner shown after checkout */
function WorkDoneBanner({ durationMs }: { durationMs: number | null }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-8 text-center">
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_at_50%_0%,rgba(16,185,129,0.12),transparent_70%)]" />
      <div className="relative flex flex-col items-center gap-3">
        <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/30">
          <CheckCircle2 className="size-9 text-emerald-400" />
        </div>
        <div>
          <p className="text-xl font-semibold text-emerald-300">Work day complete!</p>
          <p className="mt-1 text-sm text-zinc-400">
            You have successfully checked out for today.
          </p>
        </div>
        {durationMs != null && durationMs > 0 ? (
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2">
            <Clock className="size-4 text-emerald-400" />
            <span className="font-mono text-lg font-semibold text-emerald-200">
              {fmtDuration(durationMs)}
            </span>
            <span className="text-sm text-zinc-400">worked today</span>
          </div>
        ) : null}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" size="sm" className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
            <Link href="/dashboard/employee/overtime">Request Overtime</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-200">
            <Link href="/dashboard/employee/today">View Today&apos;s Record</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Shown when a worker arrives after work-end time and has not checked in today */
function PastWorkEndBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] px-6 py-7 text-center">
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_at_50%_0%,rgba(251,191,36,0.08),transparent_70%)]" />
      <div className="relative flex flex-col items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-full bg-amber-500/20 ring-2 ring-amber-500/30">
          <TimerOff className="size-8 text-amber-400" />
        </div>
        <div>
          <p className="text-lg font-semibold text-amber-300">Regular work hours have ended</p>
          <p className="mt-1 text-sm text-zinc-400">
            Check-in is now past the site&apos;s scheduled work-end time. To work
            outside regular hours, please submit an overtime request.
          </p>
        </div>
        <Button asChild size="sm" className="mt-1 bg-amber-500 text-black hover:bg-amber-400">
          <Link href="/dashboard/employee/overtime">Request Overtime</Link>
        </Button>
      </div>
    </div>
  );
}

/** Shown when navigating to check-in but already checked in — prompt user to switch or checkout */
function AlreadyCheckedInCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Card className="border-cyan-500/30 bg-cyan-500/[0.06]">
      <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-cyan-500/20 ring-2 ring-cyan-500/30">
          <LogIn className="size-6 text-cyan-400" />
        </div>
        <div>
          <p className="font-semibold text-cyan-300">Already checked in</p>
          <p className="mt-1 text-sm text-zinc-400">
            You are already checked in for today. You can switch to another site or
            check out when you are done.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild size="sm" variant="outline" className="border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10">
            <a href="#employee-site-switch">
              <ArrowLeftRight className="mr-1.5 size-3.5" />
              Switch site
            </a>
          </Button>
          <Button asChild size="sm" variant="outline" className="border-zinc-600 text-zinc-300 hover:bg-white/5">
            <a href="#employee-check-out">Check out</a>
          </Button>
          <Button size="sm" variant="ghost" className="text-zinc-500" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmployeeWorkPanelsInner() {
  const { user } = useDashboardUser();
  const tz = normalizeTimeZoneId(user?.timeZone);

  const [hasOpenSession, setHasOpenSession] = React.useState(false);
  const [isWorkDone, setIsWorkDone] = React.useState(false);
  const [sessionDurationMs, setSessionDurationMs] = React.useState<number | null>(null);
  const [isPastWorkEnd, setIsPastWorkEnd] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  // Track the intent from the URL hash when they first land
  const [focusAction, setFocusAction] = React.useState<FocusAction>(null);
  const toastFiredRef = React.useRef(false);

  const refreshState = React.useCallback(async () => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) {
      setHasOpenSession(false);
      setIsWorkDone(false);
      setIsPastWorkEnd(false);
      setLoaded(true);
      return;
    }
    const token = await u.getIdToken();
    const day = calendarDateKeyInTimeZone(new Date(), tz);
    const res = await fetch(`/api/attendance/today?day=${encodeURIComponent(day)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as TodayResponse;
    if (!res.ok) {
      setHasOpenSession(false);
      setIsWorkDone(false);
      setIsPastWorkEnd(false);
      setLoaded(true);
      return;
    }

    const checkedIn = !!data.checkIn;
    const checkedOut = !!data.checkOut;
    const open = checkedIn && !checkedOut;

    setHasOpenSession(open);
    setIsWorkDone(checkedIn && checkedOut);

    if (checkedIn && checkedOut) {
      const inMs = data.checkIn?.atMs ?? null;
      const outMs = data.checkOut?.atMs ?? null;
      setSessionDurationMs(
        inMs != null && outMs != null && outMs > inMs ? outMs - inMs : null
      );
    } else {
      setSessionDurationMs(null);
    }

    if (!checkedIn && data.workdayEndUtc) {
      const capMs = wallHmToTodayMs(data.workdayEndUtc, tz);
      setIsPastWorkEnd(capMs != null && Date.now() >= capMs);
    } else {
      setIsPastWorkEnd(false);
    }
    setLoaded(true);
  }, [tz]);

  // Read hash on mount and listen for hash changes
  React.useEffect(() => {
    setFocusAction(getFocusFromHash());
    const onHashChange = () => setFocusAction(getFocusFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  React.useEffect(() => {
    void refreshState();
    const t = window.setInterval(() => void refreshState(), 45_000);
    const onUpdated = () => void refreshState();
    window.addEventListener("attendance-updated", onUpdated);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("attendance-updated", onUpdated);
    };
  }, [refreshState]);

  // Fire context-aware toasts once data is loaded + focus action is known
  React.useEffect(() => {
    if (!loaded || !focusAction || toastFiredRef.current) return;

    if (focusAction === "check-in") {
      if (isWorkDone) {
        toastFiredRef.current = true;
        toast.warning("Already checked out today", {
          description: "Your work day is complete. Check 'View Today's Record' for details.",
        });
      } else if (hasOpenSession) {
        // Show the inline card below — no toast needed
      }
    }

    if (focusAction === "check-out") {
      if (isWorkDone) {
        toastFiredRef.current = true;
        toast.warning("Already checked out", {
          description: "You have already checked out for today.",
        });
      } else if (!hasOpenSession) {
        toastFiredRef.current = true;
        toast.error("Not checked in", {
          description: "You need to check in first before you can check out.",
        });
      }
    }

    if (focusAction === "site-switch") {
      if (isWorkDone) {
        toastFiredRef.current = true;
        toast.warning("Session already closed", {
          description: "You are already checked out for today.",
        });
      } else if (!hasOpenSession) {
        toastFiredRef.current = true;
        toast.error("Not checked in", {
          description: "You need to check in first before you can switch sites.",
        });
      }
    }
  }, [loaded, focusAction, hasOpenSession, isWorkDone]);

  // Reset toast guard when action changes (navigating to a different hash)
  React.useEffect(() => {
    toastFiredRef.current = false;
  }, [focusAction]);

  if (!loaded) return null;

  // --- Work done state ---
  if (isWorkDone) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 md:gap-6">
        <WorkDoneBanner durationMs={sessionDurationMs} />
        <div className="pointer-events-none select-none opacity-30 blur-[2px]">
          <Card>
            <CardContent className="py-6 text-center text-sm text-zinc-500">
              Check in · Site switch · Check out
            </CardContent>
          </Card>
        </div>
        <LiveTrackingToggle />
      </div>
    );
  }

  // --- Past work-end, never checked in ---
  if (isPastWorkEnd && !hasOpenSession) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 md:gap-6">
        <PastWorkEndBanner />
        <div className="pointer-events-none select-none opacity-25 blur-[2px]">
          <EmployeeCheckInPanel />
        </div>
        <LiveTrackingToggle />
      </div>
    );
  }

  // --- Focus: check-out only ---
  if (focusAction === "check-out" && hasOpenSession) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 md:gap-6">
        <EmployeeCheckOutPanel />
        <p className="text-center text-xs text-zinc-500">
          <a
            href="/dashboard/employee"
            className="underline underline-offset-2 hover:text-zinc-300"
          >
            ← Back to full Work page
          </a>
        </p>
        <LiveTrackingToggle />
      </div>
    );
  }

  // --- Focus: site-switch only ---
  if (focusAction === "site-switch" && hasOpenSession) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 md:gap-6">
        <EmployeeSiteSwitchPanel />
        <p className="text-center text-xs text-zinc-500">
          <a
            href="/dashboard/employee"
            className="underline underline-offset-2 hover:text-zinc-300"
          >
            ← Back to full Work page
          </a>
        </p>
        <LiveTrackingToggle />
      </div>
    );
  }

  // --- Focus: check-in but already checked in → show inline card ---
  if (focusAction === "check-in" && hasOpenSession) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 md:gap-6">
        <AlreadyCheckedInCard onDismiss={() => {
          window.history.replaceState(null, "", "/dashboard/employee");
          setFocusAction(null);
        }} />
        <div className="pointer-events-none select-none opacity-25 blur-[2px]">
          <EmployeeCheckInPanel />
        </div>
        {hasOpenSession ? <EmployeeSiteSwitchPanel /> : null}
        {hasOpenSession ? <EmployeeCheckOutPanel /> : null}
        <LiveTrackingToggle />
      </div>
    );
  }

  // --- Normal active session state ---
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 md:gap-6">
      <EmployeeCheckInPanel />
      {hasOpenSession ? <EmployeeSiteSwitchPanel /> : null}
      {hasOpenSession ? <EmployeeCheckOutPanel /> : null}
      <LiveTrackingToggle />
    </div>
  );
}

export function EmployeeWorkPanels() {
  return (
    <Suspense fallback={null}>
      <EmployeeWorkPanelsInner />
    </Suspense>
  );
}
