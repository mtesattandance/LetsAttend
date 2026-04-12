"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Search, Trash2, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";

const TABLE_PAGE_SIZE = 15;

type Row = {
  id: string;
  employeeId?: string;
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
  const [deleteTarget, setDeleteTarget] = React.useState<Row | null>(null);
  const [bulkDeleteTargets, setBulkDeleteTargets] = React.useState<Row[] | null>(null);
  const [deletePhrase, setDeletePhrase] = React.useState("");
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = React.useState<string[]>([]);
  const [page, setPage] = React.useState(1);
  const [archiveBusy, setArchiveBusy] = React.useState(false);

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

  const filteredUsers = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((r) => {
      const fields = [r.name, r.email, r.role, r.id, r.employeeId ?? ""];
      return fields.some((f) => (typeof f === "string" ? f : "").toLowerCase().includes(q));
    });
  }, [users, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / TABLE_PAGE_SIZE));
  const paginatedUsers = React.useMemo(
    () => filteredUsers.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE),
    [filteredUsers, page]
  );

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const viewerId = viewer?.uid ?? "";

  const toggleSelectEmployee = (id: string) => {
    if (id === viewerId) return;
    setSelectedEmployeeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const deletableOnPage = React.useMemo(
    () => paginatedUsers.filter((r) => r.role === "employee" && r.id !== viewerId),
    [paginatedUsers, viewerId]
  );

  const allDeletablePageSelected =
    deletableOnPage.length > 0 &&
    deletableOnPage.every((r) => selectedEmployeeIds.includes(r.id));

  const toggleSelectAllDeletablePage = () => {
    const ids = deletableOnPage.map((r) => r.id);
    if (allDeletablePageSelected) {
      setSelectedEmployeeIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedEmployeeIds((prev) => [...new Set([...prev, ...ids])]);
    }
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
  const canDeleteUsers = viewer?.role === "admin" || viewer?.role === "super_admin";

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

  const deleteEmployeeRequest = async (userId: string) => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    const token = await u.getIdToken();
    const res = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId, confirmPhrase: "DELETE EMPLOYEE" }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Failed");
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    if (deletePhrase.trim() !== "DELETE EMPLOYEE") {
      setResetMsg("Type exactly: DELETE EMPLOYEE");
      return;
    }
    setDeleteBusy(true);
    setResetMsg(null);
    try {
      const uid = deleteTarget.id;
      await deleteEmployeeRequest(uid);
      setDeleteTarget(null);
      setDeletePhrase("");
      setSelectedEmployeeIds((prev) => prev.filter((id) => id !== uid));
      await load();
    } catch (e) {
      setResetMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const deleteBulkEmployees = async () => {
    if (!bulkDeleteTargets?.length) return;
    if (deletePhrase.trim() !== "DELETE EMPLOYEE") {
      setResetMsg("Type exactly: DELETE EMPLOYEE");
      return;
    }
    setDeleteBusy(true);
    setResetMsg(null);
    try {
      for (const row of bulkDeleteTargets) {
        await deleteEmployeeRequest(row.id);
      }
      const removed = new Set(bulkDeleteTargets.map((r) => r.id));
      setSelectedEmployeeIds((prev) => prev.filter((id) => !removed.has(id)));
      setBulkDeleteTargets(null);
      setDeletePhrase("");
      await load();
    } catch (e) {
      setResetMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const downloadWorkersArchive = async () => {
    setResetMsg(null);
    setArchiveBusy(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/export-workers-archive", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `workers-archive-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setResetMsg(e instanceof Error ? e.message : "Failed to download archive");
    } finally {
      setArchiveBusy(false);
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
                      label: r.employeeId?.trim()
                        ? `${r.employeeId} (${r.name?.trim() || "User"})`
                        : `${r.name?.trim() || "User"}`,
                      keywords: [r.employeeId ?? "", r.id, r.name ?? "", r.email ?? "", r.role],
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
                    description={`Tap any day for the full timeline in their work time zone.`}
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
      {deleteTarget && mounted && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[1360] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-zinc-950/75 backdrop-blur-sm"
                aria-label="Close delete dialog"
                onClick={() => {
                  if (deleteBusy) return;
                  setDeleteTarget(null);
                  setDeletePhrase("");
                }}
              />
              <Card className="relative z-[1] w-full max-w-lg border-red-500/30 bg-zinc-950 text-zinc-100">
                <CardHeader>
                  <CardTitle className="text-red-400">Danger zone</CardTitle>
                  <CardDescription className="text-zinc-400">
                    Delete <strong>{deleteTarget.name || deleteTarget.id}</strong> permanently. This will
                    remove profile, attendance, overtime/off-site history, notifications, live tracking,
                    and Firebase auth account.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="block text-sm">
                    <span className="mb-1 block text-zinc-400">
                      Type <strong className="text-zinc-100">DELETE EMPLOYEE</strong> to confirm
                    </span>
                    <input
                      value={deletePhrase}
                      onChange={(e) => setDeletePhrase(e.target.value)}
                      className="w-full rounded-xl border border-red-500/30 bg-zinc-900 px-3 py-2 font-mono text-sm"
                      placeholder="DELETE EMPLOYEE"
                      disabled={deleteBusy}
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={deleteBusy}
                      onClick={() => {
                        setDeleteTarget(null);
                        setDeletePhrase("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="button" variant="destructive" disabled={deleteBusy} onClick={() => void deleteUser()}>
                      {deleteBusy ? "Deleting..." : "Delete employee"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>,
            document.body
          )
        : null}

      {bulkDeleteTargets && bulkDeleteTargets.length > 0 && mounted && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[1360] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-zinc-950/75 backdrop-blur-sm"
                aria-label="Close bulk delete dialog"
                onClick={() => {
                  if (deleteBusy) return;
                  setBulkDeleteTargets(null);
                  setDeletePhrase("");
                }}
              />
              <Card className="relative z-[1] w-full max-w-lg border-red-500/30 bg-zinc-950 text-zinc-100">
                <CardHeader>
                  <CardTitle className="text-red-400">Delete {bulkDeleteTargets.length} employees</CardTitle>
                  <CardDescription className="text-zinc-400">
                    This will permanently remove each selected worker&apos;s profile, attendance,
                    overtime/off-site history, notifications, live tracking, and Firebase auth account.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="max-h-36 list-inside list-disc overflow-y-auto text-sm text-zinc-300">
                    {bulkDeleteTargets.slice(0, 15).map((r) => (
                      <li key={r.id}>
                        {r.name || r.email} <span className="text-zinc-500">({r.email})</span>
                      </li>
                    ))}
                    {bulkDeleteTargets.length > 15 ? (
                      <li className="list-none text-zinc-500">…and {bulkDeleteTargets.length - 15} more</li>
                    ) : null}
                  </ul>
                  <label className="block text-sm">
                    <span className="mb-1 block text-zinc-400">
                      Type <strong className="text-zinc-100">DELETE EMPLOYEE</strong> to confirm
                    </span>
                    <input
                      value={deletePhrase}
                      onChange={(e) => setDeletePhrase(e.target.value)}
                      className="w-full rounded-xl border border-red-500/30 bg-zinc-900 px-3 py-2 font-mono text-sm"
                      placeholder="DELETE EMPLOYEE"
                      disabled={deleteBusy}
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={deleteBusy}
                      onClick={() => {
                        setBulkDeleteTargets(null);
                        setDeletePhrase("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={deleteBusy}
                      onClick={() => void deleteBulkEmployees()}
                    >
                      {deleteBusy ? "Deleting..." : `Delete ${bulkDeleteTargets.length}`}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>,
            document.body
          )
        : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>
              All accounts from Firestore (no passwords — Firebase never exposes them). Generate a
              password reset link if someone forgot their password.
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={archiveBusy}
              onClick={() => void downloadWorkersArchive()}
            >
              {archiveBusy ? "Preparing archive..." : "Download workers archive"}
            </Button>
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
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <TableRowsSkeleton rows={TABLE_PAGE_SIZE} />
          ) : err ? (
            <p className="text-sm text-red-400">{err}</p>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative max-w-md flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    type="search"
                    placeholder="Search by name, email, employee ID, role…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 pl-9 dark:bg-zinc-950"
                    aria-label="Search workers"
                  />
                </div>
                {canDeleteUsers && selectedEmployeeIds.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-zinc-500">{selectedEmployeeIds.length} selected</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        const rows = users.filter(
                          (r) => r.role === "employee" && selectedEmployeeIds.includes(r.id)
                        );
                        if (rows.length === 0) return;
                        setBulkDeleteTargets(rows);
                        setDeletePhrase("");
                        setResetMsg(null);
                      }}
                    >
                      <Trash2 className="mr-1.5 size-4" />
                      Delete selected
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-zinc-500"
                      onClick={() => setSelectedEmployeeIds([])}
                    >
                      Clear
                    </Button>
                  </div>
                ) : null}
              </div>

              {users.length === 0 ? (
                <p className="text-sm text-zinc-500">No users found.</p>
              ) : filteredUsers.length === 0 ? (
                <p className="text-sm text-zinc-500">No users match your search.</p>
              ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm tabular-nums">
                <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase text-zinc-500">
                  <tr>
                    {canDeleteUsers ? (
                      <th className="w-10 px-2 py-2">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-zinc-600 accent-cyan-600"
                          checked={allDeletablePageSelected}
                          onChange={toggleSelectAllDeletablePage}
                          aria-label="Select all deletable employees on this page"
                        />
                      </th>
                    ) : null}
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                    {canManageAdmins ? <th className="px-3 py-2">Admin</th> : null}
                    <th className="px-3 py-2 text-right">Assign</th>
                    <th className="px-3 py-2">View</th>
                    {canDeleteUsers ? <th className="px-3 py-2 text-right">Delete</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((r) => (
                    <tr
                      key={r.id}
                      className="cursor-pointer border-b border-white/5 hover:bg-white/[0.02]"
                      onClick={() => openCalendarFor(r.id)}
                    >
                      {canDeleteUsers ? (
                        <td
                          className="px-2 py-2"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {r.role === "employee" && r.id !== viewerId ? (
                            <input
                              type="checkbox"
                              className="size-4 rounded border-zinc-600 accent-cyan-600"
                              checked={selectedEmployeeIds.includes(r.id)}
                              onChange={() => toggleSelectEmployee(r.id)}
                              aria-label={`Select ${r.name || r.email}`}
                            />
                          ) : (
                            <span className="inline-block w-4 text-center text-zinc-600">—</span>
                          )}
                        </td>
                      ) : null}
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
                              onClick={(e) => {
                                e.stopPropagation();
                                void demoteAdmin(r.email, r.name);
                              }}
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
                            onClick={(e) => {
                              e.stopPropagation();
                              setAssignWorker(r);
                            }}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            openCalendarFor(r.id);
                          }}
                        >
                          View
                        </Button>
                      </td>
                      {canDeleteUsers ? (
                        <td className="px-3 py-2 text-right">
                          {r.role === "employee" ? (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(r);
                                setDeletePhrase("");
                                setResetMsg(null);
                              }}
                            >
                              Delete
                            </Button>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm">
                  <span className="text-zinc-400">
                    Showing {(page - 1) * TABLE_PAGE_SIZE + 1}–
                    {Math.min(page * TABLE_PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-zinc-500">
                      Page {page} / {totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-white/10 px-3 py-2 text-xs text-zinc-500">
                  Showing 1–{filteredUsers.length} of {filteredUsers.length} ({TABLE_PAGE_SIZE} per page)
                </div>
              )}
            </div>
              )}
            </>
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
