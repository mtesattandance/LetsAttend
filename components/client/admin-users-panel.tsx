"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { AttendanceCalendar } from "@/components/client/attendance-calendar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AssignWorkSitesModal } from "@/components/client/assign-work-sites-modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { TableRowsSkeleton } from "@/components/client/dashboard-skeletons";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  email: string;
  role: string;
  assignedSites?: string[];
};

function useBodyScrollLock(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

export function AdminUsersPanel() {
  const searchParams = useSearchParams();
  const { user: viewer } = useDashboardUser();
  const [users, setUsers] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [resetEmail, setResetEmail] = React.useState("");
  const [resetLink, setResetLink] = React.useState<string | null>(null);
  const [resetBusy, setResetBusy] = React.useState(false);
  const [resetMsg, setResetMsg] = React.useState<string | null>(null);
  const [assignWorker, setAssignWorker] = React.useState<Row | null>(null);

  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [calendarWorkerId, setCalendarWorkerId] = React.useState("");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  useBodyScrollLock(calendarOpen);

  React.useEffect(() => {
    if (!calendarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCalendarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [calendarOpen]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { users?: Row[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load users");
      const list = data.users ?? [];
      setUsers(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const firstCalendarUserId = React.useMemo(() => {
    const emp = users.find((r) => r.role === "employee");
    return emp?.id ?? users[0]?.id ?? "";
  }, [users]);

  React.useEffect(() => {
    const w = searchParams.get("worker")?.trim();
    if (!w || users.length === 0) return;
    if (users.some((u) => u.id === w)) {
      setCalendarWorkerId(w);
      setCalendarOpen(true);
    }
  }, [searchParams, users]);

  const openCalendarFor = (workerId: string) => {
    setCalendarWorkerId(workerId);
    setCalendarOpen(true);
  };

  const requestResetLink = async () => {
    setResetMsg(null);
    setResetLink(null);
    const email = resetEmail.trim().toLowerCase();
    if (!email) {
      setResetMsg("Enter user email.");
      return;
    }
    setResetBusy(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/password-reset-link", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { resetLink?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setResetLink(data.resetLink ?? null);
      setResetMsg("Copy the link and send it to the user securely (not over public chat).");
    } catch (e) {
      setResetMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setResetBusy(false);
    }
  };

  const canManageAdmins = viewer?.role === "super_admin";

  const demoteAdmin = async (email: string, name: string) => {
    if (
      !window.confirm(
        `Remove admin access for “${name}” (${email})? They will become an employee.`
      )
    ) {
      return;
    }
    setResetMsg(null);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/demote-admin", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await load();
    } catch (e) {
      setResetMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  const calendarWorker = users.find((r) => r.id === calendarWorkerId);
  const calendarTitle = calendarWorker
    ? `Attendance — ${calendarWorker.name || calendarWorker.email}`
    : "Attendance calendar";

  const calendarModal =
    calendarOpen && mounted && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[1350] flex flex-col items-stretch justify-end sm:justify-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workers-calendar-title"
          >
            <button
              type="button"
              className="absolute inset-0 bg-zinc-950/75 backdrop-blur-sm"
              aria-label="Close calendar"
              onClick={() => setCalendarOpen(false)}
            />
            <div
              className={cn(
                "relative z-[1] flex max-h-[min(92dvh,880px)] flex-col rounded-t-2xl border border-white/15 bg-zinc-950 shadow-2xl sm:mx-auto sm:max-w-lg sm:rounded-2xl md:max-w-xl lg:max-w-3xl"
              )}
            >
              <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div className="min-w-0">
                  <h2 id="workers-calendar-title" className="text-lg font-semibold text-zinc-100">
                    Worker attendance calendar
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Search a user, then tap a day to open their timeline.
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                  aria-label="Close"
                  onClick={() => setCalendarOpen(false)}
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
                <label className="mb-3 block text-sm">
                  <span className="text-zinc-400">Worker</span>
                  <SearchableSelect
                    value={calendarWorkerId}
                    onValueChange={setCalendarWorkerId}
                    options={users.map((r) => ({
                      value: r.id,
                      label: `${r.name?.trim() ? r.name : r.email} (${r.email}) · ${r.role}`,
                    }))}
                    emptyLabel="Select worker…"
                    searchPlaceholder="Search workers…"
                    triggerClassName="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm"
                    popoverContentClassName="z-[1400]"
                    listClassName="max-h-[min(240px,40vh)]"
                  />
                </label>
                {calendarWorkerId ? (
                  <AttendanceCalendar
                    workerId={calendarWorkerId}
                    title={calendarTitle}
                    description={`Worker ID ${calendarWorkerId}. Tap any day for the full timeline in their work time zone.`}
                    adminDayDetailBasePath="/dashboard/admin/workers"
                  />
                ) : (
                  <p className="text-sm text-zinc-500">Choose a worker to load the month view.</p>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="space-y-6">
      {calendarModal}

      <AssignWorkSitesModal
        worker={assignWorker}
        open={assignWorker != null}
        onOpenChange={(open) => {
          if (!open) setAssignWorker(null);
        }}
        onSaved={() => void load()}
      />

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>
              All accounts from Firestore (no passwords — Firebase never exposes them). Generate a
              password reset link if someone forgot their password.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setCalendarWorkerId((id) => id || firstCalendarUserId);
              setCalendarOpen(true);
            }}
          >
            Attendance calendar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <TableRowsSkeleton rows={6} />
          ) : err ? (
            <p className="text-sm text-red-400">{err}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                    {canManageAdmins ? <th className="px-3 py-2">Admin</th> : null}
                    <th className="px-3 py-2 text-right">Assign</th>
                    <th className="px-3 py-2">View</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-white/5 hover:bg-white/[0.02]"
                    >
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-zinc-400">{r.email}</td>
                      <td className="px-3 py-2 capitalize">{r.role}</td>
                      {canManageAdmins ? (
                        <td className="px-3 py-2">
                          {r.role === "admin" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-amber-400 hover:text-amber-300"
                              onClick={() => void demoteAdmin(r.email, r.name)}
                            >
                              Remove admin
                            </Button>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-3 py-2 text-right">
                        {r.role === "employee" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setAssignWorker(r)}
                          >
                            Assign
                          </Button>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-cyan-400"
                          onClick={() => openCalendarFor(r.id)}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-sm font-medium text-zinc-200">Password reset link</p>
            <p className="mt-1 text-xs text-zinc-500">
              Passwords cannot be viewed or stored in plain text. Send this link only through a
              private channel.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                placeholder="user@example.com"
                className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={resetBusy}
                onClick={() => void requestResetLink()}
              >
                {resetBusy ? "…" : "Generate link"}
              </Button>
            </div>
            {resetMsg ? <p className="mt-2 text-sm text-zinc-400">{resetMsg}</p> : null}
            {resetLink ? (
              <textarea
                readOnly
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/60 p-3 font-mono text-xs text-zinc-300"
                rows={3}
                value={resetLink}
                onFocus={(e) => e.target.select()}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
