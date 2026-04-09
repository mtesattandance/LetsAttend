"use client";

import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { EmployeeAssignmentBanner } from "@/components/client/employee-assignment-banner";
import { EmployeeCheckInPanel } from "@/components/client/employee-check-in-panel";
import { EmployeeCheckOutPanel } from "@/components/client/employee-check-out-panel";
import { EmployeeSiteSwitchPanel } from "@/components/client/employee-site-switch-panel";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Skeleton } from "@/components/ui/skeleton";

type WorkerRow = {
  id: string;
  employeeId: string;
  email: string;
  name: string;
  timeZone: string;
};

/**
 * Check in / switch / check out on behalf of a coworker (shared phone). Server enforces shared site overlap
 * or admin permission.
 */
export function FriendAttendancePage() {
  const [workers, setWorkers] = React.useState<WorkerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [employeeIdQuery, setEmployeeIdQuery] = React.useState("");
  const [selectedHasOpenSession, setSelectedHasOpenSession] = React.useState(false);
  const [selectedWorkDone, setSelectedWorkDone] = React.useState(false);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setWorkers([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const token = await u.getIdToken();
        const res = await fetch("/api/employee/worker-directory", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as { workers?: WorkerRow[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to load coworkers");
        setWorkers(data.workers ?? []);
      } catch {
        setWorkers([]);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const selected = React.useMemo(
    () =>
      workers.find(
        (w) => w.employeeId?.trim().toLowerCase() === employeeIdQuery.trim().toLowerCase()
      ),
    [employeeIdQuery, workers]
  );

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!selected) {
        setSelectedHasOpenSession(false);
        setSelectedWorkDone(false);
        return;
      }
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) {
          setSelectedHasOpenSession(false);
          setSelectedWorkDone(false);
          return;
        }
        const token = await u.getIdToken();
        const res = await fetch(`/api/attendance/today?workerId=${encodeURIComponent(selected.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as {
          checkIn?: unknown;
          checkOut?: unknown;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Failed to load selected worker attendance");
        if (cancelled) return;
        const checkedIn = !!data.checkIn;
        const checkedOut = !!data.checkOut;
        setSelectedHasOpenSession(checkedIn && !checkedOut);
        setSelectedWorkDone(checkedIn && checkedOut);
      } catch {
        if (!cancelled) {
          setSelectedHasOpenSession(false);
          setSelectedWorkDone(false);
        }
      }
    };
    void run();
    const t = window.setInterval(() => void run(), 45_000);
    const onUpdated = () => void run();
    window.addEventListener("attendance-updated", onUpdated);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      window.removeEventListener("attendance-updated", onUpdated);
    };
  }, [selected]);

  return (
    <div className="p-3 sm:p-6 md:p-8">
      <EmployeeAssignmentBanner />
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Friend check-in</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Use this when a coworker doesn&apos;t have their phone. Sign in with <strong>your</strong> account,
          search their <strong>Employee ID</strong>, then check in, switch sites, or check out — records go to{" "}
          <strong>their</strong> attendance. Server allows this only if you share a work site (or you are an
          admin).
        </p>
      </div>

      <div className="mx-auto mb-8 max-w-2xl">
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-zinc-400">Employee ID</span>
          {loading ? (
            <Skeleton className="h-11 w-full rounded-xl" />
          ) : (
            <div className="flex h-11 w-full overflow-hidden rounded-xl border border-zinc-200/90 bg-white dark:border-white/10 dark:bg-black/40">
              {/* Fixed prefix */}
              <span className="flex items-center bg-zinc-100/80 pl-3 pr-1 font-mono text-sm font-semibold text-zinc-500 select-none dark:bg-white/[0.06] dark:text-zinc-400">
                MTES-
              </span>
              {/* Editable suffix */}
              <input
                value={employeeIdQuery.startsWith("MTES-")
                  ? employeeIdQuery.slice(5)
                  : employeeIdQuery}
                onChange={(e) => {
                  const raw = e.target.value.replace(/^MTES-/i, "");
                  setEmployeeIdQuery(raw ? `MTES-${raw}` : "");
                }}
                placeholder="0001"
                className="h-full flex-1 bg-transparent pl-1 pr-3 text-zinc-900 outline-none dark:text-zinc-100"
              />
            </div>
          )}
        </label>
        {!loading && selected ? (
          <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
            <p className="text-sm font-medium text-emerald-300">
              {selected.employeeId} ({selected.name || "Employee"})
            </p>
          </div>
        ) : null}
      </div>

      {!selected ? (
        <p className="mx-auto max-w-2xl text-center text-sm text-zinc-500">
          Enter a valid Employee ID above to enable check-in, site switch, and check-out for their account.
        </p>
      ) : (
        <div className="mx-auto flex max-w-2xl flex-col gap-4 md:gap-6">
          {selectedWorkDone ? (
            <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
              {selected.employeeId} is already checked out for today.
            </p>
          ) : null}
          {selectedHasOpenSession ? (
            <p className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
              {selected.employeeId} is already checked in. Continue with <strong>Switch</strong> or{" "}
              <strong>Check out</strong> below.
            </p>
          ) : null}
          {!selectedHasOpenSession && !selectedWorkDone ? (
            <EmployeeCheckInPanel proxyForUid={selected.id} />
          ) : null}
          {selectedHasOpenSession ? (
            <EmployeeSiteSwitchPanel
              proxyForUid={selected.id}
              subjectTimeZone={selected.timeZone}
            />
          ) : null}
          {selectedHasOpenSession ? (
            <EmployeeCheckOutPanel proxyForUid={selected.id} />
          ) : null}
        </div>
      )}
    </div>
  );
}
