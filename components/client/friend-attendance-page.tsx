"use client";

import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { EmployeeAssignmentBanner } from "@/components/client/employee-assignment-banner";
import { EmployeeCheckInPanel } from "@/components/client/employee-check-in-panel";
import { EmployeeCheckOutPanel } from "@/components/client/employee-check-out-panel";
import { EmployeeSiteSwitchPanel } from "@/components/client/employee-site-switch-panel";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  const [selectedId, setSelectedId] = React.useState("");

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

  const options = React.useMemo(
    () =>
      workers.map((w) => ({
        value: w.id,
        label: `${w.employeeId || w.id} (${w.name || "Employee"})`,
        keywords: [w.employeeId, w.id, w.name, w.email],
      })),
    [workers]
  );

  const selected = workers.find((w) => w.id === selectedId);

  return (
    <div className="p-3 sm:p-6 md:p-8">
      <EmployeeAssignmentBanner />
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Friend check-in</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Use this when a coworker doesn&apos;t have their phone. Sign in with <strong>your</strong> account,
          pick their name or email, then check in, switch sites, or check out — records go to{" "}
          <strong>their</strong> attendance. Server allows this only if you share a work site (or you are an
          admin).
        </p>
      </div>

      <div className="mx-auto mb-8 max-w-2xl">
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-zinc-400">Coworker (search by employee ID, name, or email)</span>
          {loading ? (
            <Skeleton className="h-11 w-full rounded-xl" />
          ) : (
            <SearchableSelect
              value={selectedId}
              onValueChange={setSelectedId}
              options={options}
              includeEmpty
              emptyLabel="Select a coworker…"
              searchPlaceholder="Search employee ID, name, or email…"
              emptySearchMessage="No coworkers found."
              listClassName="max-h-[min(320px,50vh)]"
            />
          )}
        </label>
      </div>

      {!selectedId || !selected ? (
        <p className="mx-auto max-w-2xl text-center text-sm text-zinc-500">
          Select a coworker above to enable check-in, site switch, and check-out for their account.
        </p>
      ) : (
        <div className="mx-auto flex max-w-2xl flex-col gap-4 md:gap-6">
          <EmployeeCheckInPanel proxyForUid={selected.id} />
          <EmployeeSiteSwitchPanel
            proxyForUid={selected.id}
            subjectTimeZone={selected.timeZone}
          />
          <EmployeeCheckOutPanel proxyForUid={selected.id} />
        </div>
      )}
    </div>
  );
}
