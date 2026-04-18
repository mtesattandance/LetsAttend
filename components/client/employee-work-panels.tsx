"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, TimerOff, LogIn, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { calendarDateKeyInTimeZone } from "@/lib/date/calendar-day-key";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";
import { EmployeeCheckInPanel } from "@/components/client/employee-check-in-panel";
import { EmployeeSiteSwitchPanel } from "@/components/client/employee-site-switch-panel";
import { EmployeeCheckOutPanel } from "@/components/client/employee-check-out-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type TodayResponse = {
  checkIn: { atMs: number | null } | null;
  checkOut: { atMs: number | null } | null;
  workdayEndUtc: string | null;
  scheduleTimeZone: string | null;
  error?: string;
};

/** Which action was requested via URL hash (full Work page) or dedicated route */
type FocusAction = "check-in" | "check-out" | "site-switch" | null;

export type EmployeeWorkSection = "full" | "check-in" | "check-out" | "switch";

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
function WorkDoneBanner({ durationMs, compact }: { durationMs: number | null; compact?: boolean }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-center",
        compact ? "px-4 py-5" : "px-6 py-8"
      )}
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_at_50%_0%,rgba(16,185,129,0.12),transparent_70%)]" />
      <div className={cn("relative flex flex-col items-center", compact ? "gap-2" : "gap-3")}>
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/30",
            compact ? "size-12" : "size-16"
          )}
        >
          <CheckCircle2 className={cn("text-emerald-400", compact ? "size-7" : "size-9")} />
        </div>
        <div>
          <p className={cn("font-semibold text-emerald-300", compact ? "text-lg" : "text-xl")}>
            Work day complete!
          </p>

        </div>
        {durationMs != null && durationMs > 0 ? (
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10",
              compact ? "mt-1 px-3 py-1.5" : "mt-1 px-4 py-2"
            )}
          >
            <Clock className="size-4 text-emerald-400" />
            <span className={cn("font-mono font-semibold text-emerald-200", compact ? "text-base" : "text-lg")}>
              {fmtDuration(durationMs)}
            </span>
            <span className="text-sm text-zinc-400">worked today</span>
          </div>
        ) : null}
        <div className={cn("flex flex-wrap justify-center gap-2", compact ? "mt-1" : "mt-2")}>
          <Button asChild variant="outline" size="sm" className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
            <Link href="/dashboard/employee/check-in">Start Overtime</Link>
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
          <Link href="/dashboard/employee/check-in">Check In (Overtime)</Link>
        </Button>
      </div>
    </div>
  );
}

/** Shown when navigating to check-in but already checked in — prompt user to switch or checkout */
function AlreadyCheckedInCard({ onDismiss, compact }: { onDismiss: () => void; compact?: boolean }) {
  return (
    <Card className="border-cyan-500/30 bg-cyan-500/[0.06]">
      <CardContent
        className={cn(
          "flex flex-col items-center text-center",
          compact ? "gap-3 py-4" : "gap-4 py-8"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-cyan-500/20 ring-2 ring-cyan-500/30",
            compact ? "size-10" : "size-12"
          )}
        >
          <LogIn className={cn("text-cyan-400", compact ? "size-5" : "size-6")} />
        </div>
        <div>
          <p className={cn("font-semibold text-cyan-300", compact ? "text-sm" : "text-base")}>
            Already checked in
          </p>

        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild size="sm" variant="outline" className="border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10">
            <Link href="/dashboard/employee/switch">
              <ArrowLeftRight className="mr-1.5 size-3.5" />
              Switch site
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="border-zinc-600 text-zinc-300 hover:bg-white/5">
            <Link href="/dashboard/employee/check-out">Check out</Link>
          </Button>
          <Button size="sm" variant="ghost" className="text-zinc-500" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NeedCheckInFirstCard({ intent, compact }: { intent: "check-out" | "site-switch"; compact?: boolean }) {
  const title = intent === "check-out" ? "Check in first" : "Check in before switching";
  const body =
    intent === "check-out"
      ? "You need an open check-in session before you can check out."
      : "You need an open check-in session before you can switch sites.";
  return (
    <Card className="border-amber-500/25 bg-amber-500/[0.06]">
      <CardContent className={cn("flex flex-col items-center text-center", compact ? "gap-2 py-4" : "gap-4 py-8")}>
        <p className={cn("font-semibold text-amber-600 dark:text-amber-200", compact ? "text-sm" : "text-base")}>{title}</p>
        <Button asChild size="sm">
          <Link href="/dashboard/employee/check-in">Go to Check in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function EmployeeWorkPanelsInner({ section }: { section: EmployeeWorkSection }) {
  const { user } = useDashboardUser();
  const router = useRouter();
  const tz = normalizeTimeZoneId(user?.timeZone);

  const [hasOpenSession, setHasOpenSession] = React.useState(false);
  const [isWorkDone, setIsWorkDone] = React.useState(false);
  const [sessionDurationMs, setSessionDurationMs] = React.useState<number | null>(null);
  const [isPastWorkEnd, setIsPastWorkEnd] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  /** Hash intent only applies on the combined Work page */
  const [hashFocus, setHashFocus] = React.useState<FocusAction>(null);
  const toastFiredRef = React.useRef(false);

  const focusAction: FocusAction =
    section === "full"
      ? hashFocus
      : section === "check-in"
        ? "check-in"
        : section === "check-out"
          ? "check-out"
          : "site-switch";

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
      const scheduleTz = normalizeTimeZoneId(data.scheduleTimeZone || undefined);
      const capMs = wallHmToTodayMs(data.workdayEndUtc, scheduleTz);
      setIsPastWorkEnd(capMs != null && Date.now() >= capMs);
    } else {
      setIsPastWorkEnd(false);
    }
    setLoaded(true);
  }, [tz]);

  // Read hash on mount and listen for hash changes (combined Work page only)
  React.useEffect(() => {
    if (section !== "full") {
      setHashFocus(null);
      return;
    }
    setHashFocus(getFocusFromHash());
    const onHashChange = () => setHashFocus(getFocusFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [section]);

  React.useEffect(() => {
    void refreshState();
    const onUpdated = () => void refreshState();
    // Refresh immediately when the user switches back to this tab.
    const onVisible = () => { if (document.visibilityState === "visible") void refreshState(); };
    window.addEventListener("attendance-updated", onUpdated);
    document.addEventListener("visibilitychange", onVisible);
    // No periodic poll once work is done — state won't change for the rest of the day.
    if (isWorkDone) {
      return () => {
        window.removeEventListener("attendance-updated", onUpdated);
        document.removeEventListener("visibilitychange", onVisible);
      };
    }
    // Active session: poll every 45s to catch auto-checkout / window state changes.
    // No session yet: poll every 3 min — just need to detect work-window opening.
    // Skip the tick entirely when the tab is hidden — zero reads while minimized.
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshState();
    }, hasOpenSession ? 45_000 : 3 * 60_000);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("attendance-updated", onUpdated);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshState, isWorkDone, hasOpenSession]);

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

  // Reset toast guard when action changes (navigating to a different hash or section)
  React.useEffect(() => {
    toastFiredRef.current = false;
  }, [focusAction, section]);

  if (!loaded) return null;

  const compact = section !== "full";
  const stackGap = compact ? "gap-3" : "gap-4 md:gap-6";

  if (isWorkDone) {
    if (section === "full") {
      return (
        <div className={cn("mx-auto flex max-w-2xl flex-col", stackGap)}>
          <WorkDoneBanner durationMs={sessionDurationMs} compact={compact} />
          <EmployeeCheckInPanel />
        </div>
      );
    } else if (section === "check-out" || section === "switch") {
      return (
        <div className={cn("mx-auto flex max-w-2xl flex-col", stackGap)}>
          <WorkDoneBanner durationMs={sessionDurationMs} compact={compact} />
        </div>
      );
    } else {
      // For check-in section, we just render the CheckIn panel directly so they can do overtime
      return (
        <div className={cn("mx-auto flex max-w-2xl flex-col", stackGap)}>
          <WorkDoneBanner durationMs={sessionDurationMs} compact={compact} />
          <EmployeeCheckInPanel />
        </div>
      );
    }
  }

  // --- Past work-end, never checked in ---
  if (isPastWorkEnd && !hasOpenSession) {
    if (section === "check-out" || section === "switch") {
      return (
        <div className={cn("mx-auto flex max-w-2xl flex-col", stackGap)}>
          <PastWorkEndBanner />
          <p className="text-center text-xs text-zinc-500">
            <Link href="/dashboard/employee/check-in" className="text-cyan-600 underline underline-offset-2 dark:text-cyan-400">
              Open Check in
            </Link>{" "}
            if you still need to record attendance today.
          </p>
        </div>
      );
    }
    return (
      <div className={cn("mx-auto flex max-w-2xl flex-col", stackGap)}>
        <PastWorkEndBanner />
        <div className="pointer-events-none select-none opacity-25 blur-[2px]">
          <EmployeeCheckInPanel />
        </div>
      </div>
    );
  }

  // --- Check-out or switch, but no open session (and not past work-end; that returned above) ---
  if (
    !hasOpenSession &&
    (section === "check-out" ||
      section === "switch" ||
      (section === "full" && (focusAction === "check-out" || focusAction === "site-switch")))
  ) {
    return (
      <div className={cn("mx-auto flex max-w-2xl flex-col", stackGap)}>
        <NeedCheckInFirstCard
          compact={compact}
          intent={focusAction === "site-switch" || section === "switch" ? "site-switch" : "check-out"}
        />

      </div>
    );
  }

  // --- Focus: check-out only ---
  if (focusAction === "check-out" && hasOpenSession) {
    return (
      <div className={cn("mx-auto flex max-w-2xl flex-col", stackGap)}>
        <EmployeeCheckOutPanel />

      </div>
    );
  }

  // --- Focus: site-switch only ---
  if (focusAction === "site-switch" && hasOpenSession) {
    return (
      <div className={cn("mx-auto flex max-w-2xl flex-col", stackGap)}>
        <EmployeeSiteSwitchPanel />

      </div>
    );
  }

  // --- Focus: check-in but already checked in → show inline card ---
  if (focusAction === "check-in" && hasOpenSession) {
    return (
      <div className={cn("mx-auto flex max-w-2xl flex-col", stackGap)}>
        <AlreadyCheckedInCard
          compact={compact}
          onDismiss={() => {
            router.replace("/dashboard/employee/check-in");
          }}
        />
        {section === "full" ? (
          <>
            <div className="pointer-events-none select-none opacity-25 blur-[2px]">
              <EmployeeCheckInPanel />
            </div>
            {hasOpenSession ? <EmployeeSiteSwitchPanel /> : null}
            {hasOpenSession ? <EmployeeCheckOutPanel /> : null}
          </>
        ) : null}
      </div>
    );
  }

  // --- Section: check-in only (not yet checked in) ---
  if (section === "check-in") {
    return (
      <div className={cn("mx-auto flex max-w-2xl flex-col", stackGap)}>
        <EmployeeCheckInPanel />

      </div>
    );
  }

  // --- Normal combined Work page ---
  return (
    <div className={cn("mx-auto flex max-w-2xl flex-col", stackGap)}>
      <EmployeeCheckInPanel />
      {hasOpenSession ? <EmployeeSiteSwitchPanel /> : null}
      {hasOpenSession ? <EmployeeCheckOutPanel /> : null}
    </div>
  );
}

export function EmployeeWorkPanels({ section = "full" }: { section?: EmployeeWorkSection }) {
  return (
    <Suspense fallback={null}>
      <EmployeeWorkPanelsInner section={section} />
    </Suspense>
  );
}
