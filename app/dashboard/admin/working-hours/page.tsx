"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { WorkingHoursMonthPanel } from "@/components/client/working-hours-month-panel";
import { toast } from "sonner";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export default function AdminWorkingHoursPage() {
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [workerId, setWorkerId] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) throw new Error("Not signed in");
        const token = await u.getIdToken();
        const res = await fetch("/api/admin/users", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as { users?: UserRow[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to load users");
        const emps = (data.users ?? []).filter((r) => r.role === "employee");
        emps.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );
        if (cancelled) return;
        setUsers(emps);
        setWorkerId((prev) => {
          if (prev && emps.some((e) => e.id === prev)) return prev;
          return emps[0]?.id ?? "";
        });
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Error");
        if (!cancelled) {
          setUsers([]);
          setWorkerId("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-3 sm:p-6 md:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Working hours</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Month view per employee: on-site, approved overtime, approved off-site, 240 h cap split.
        </p>
      </div>
      <div className="mx-auto max-w-5xl space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Worker</CardTitle>
            <CardDescription>Select an employee to load their month.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-10 w-full max-w-md rounded-lg" />
            ) : users.length === 0 ? (
              <p className="text-sm text-zinc-500">No employees found.</p>
            ) : (
              <div className="max-w-md space-y-2">
                <label
                  htmlFor="admin-wh-worker"
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Employee
                </label>
                <SearchableSelect
                  id="admin-wh-worker"
                  value={workerId}
                  onValueChange={setWorkerId}
                  includeEmpty={false}
                  options={users.map((u) => ({
                    value: u.id,
                    label: `${u.name || u.email || u.id}`,
                  }))}
                  emptyLabel="— Select —"
                  searchPlaceholder="Search employees…"
                />
              </div>
            )}
          </CardContent>
        </Card>
        {workerId ? (
          <WorkingHoursMonthPanel key={workerId} workerId={workerId} />
        ) : null}
      </div>
    </div>
  );
}
