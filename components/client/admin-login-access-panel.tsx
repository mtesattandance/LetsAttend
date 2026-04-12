"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { TableRowsSkeleton } from "@/components/client/dashboard-skeletons";

type Row = {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  role: string;
  workspaceAccessStatus?: "pending" | "approved" | "rejected";
};

export function AdminLoginAccessPanel() {
  const [users, setUsers] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/users?fresh=1", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { users?: Row[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load users");
      setUsers(data.users ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const setWorkspaceAccess = async (workerId: string, action: "approve" | "reject") => {
    setWorkspaceBusy(workerId + action);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/workspace-access", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workerId, action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update access");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update access");
    } finally {
      setWorkspaceBusy(null);
    }
  };

  const pending = React.useMemo(
    () => users.filter((r) => r.role === "employee" && r.workspaceAccessStatus === "pending"),
    [users]
  );
  const rejected = React.useMemo(
    () => users.filter((r) => r.role === "employee" && r.workspaceAccessStatus === "rejected"),
    [users]
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Approve or reject workspace access after an employee finishes onboarding. Legacy accounts without a
        status are treated as active and do not appear here.
      </p>
      {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Pending login access</CardTitle>
          <CardDescription>Employees waiting to use the dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableRowsSkeleton rows={4} />
          ) : pending.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No pending requests.</p>
          ) : (
            <ul className="space-y-3">
              {pending.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-white/10 dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{r.name}</p>
                    <p className="truncate text-xs text-zinc-500">{r.email}</p>
                    {r.employeeId ? (
                      <p className="text-xs text-zinc-500">ID {r.employeeId}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={workspaceBusy !== null}
                      onClick={() => void setWorkspaceAccess(r.id, "approve")}
                    >
                      {workspaceBusy === `${r.id}approve` ? "…" : "Approve"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={workspaceBusy !== null}
                      onClick={() => void setWorkspaceAccess(r.id, "reject")}
                    >
                      {workspaceBusy === `${r.id}reject` ? "…" : "Reject"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rejected access</CardTitle>
          <CardDescription>They can resubmit from the employee app; you can approve if that was a mistake.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableRowsSkeleton rows={3} />
          ) : rejected.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">None.</p>
          ) : (
            <ul className="space-y-3">
              {rejected.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-white/10 dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{r.name}</p>
                    <p className="truncate text-xs text-zinc-500">{r.email}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={workspaceBusy !== null}
                    onClick={() => void setWorkspaceAccess(r.id, "approve")}
                  >
                    {workspaceBusy === `${r.id}approve` ? "…" : "Approve access"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
