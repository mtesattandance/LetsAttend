"use client";

import * as React from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { Trash2, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TableRowsSkeleton } from "@/components/client/dashboard-skeletons";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { AssignWorkSitesModal } from "@/components/client/assign-work-sites-modal";
import { ConfirmActionModal, ResultModal } from "@/components/client/feedback-modals";
import { toast } from "sonner";

type UserRow = {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  role: string;
  assignedSites: string[];
};

type Site = { id: string; name?: string };

export function AdminAssignmentsPanel() {
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [sites, setSites] = React.useState<Site[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [doneMessage, setDoneMessage] = React.useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState<{
    worker: UserRow;
    siteId: string;
  } | null>(null);
  const [confirmClear, setConfirmClear] = React.useState<UserRow | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [assignWorker, setAssignWorker] = React.useState<UserRow | null>(null);
  const [addAssignExpanded, setAddAssignExpanded] = React.useState(false);
  const [pickWorkerId, setPickWorkerId] = React.useState("");

  const authHeaders = React.useCallback(async () => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    const token = await u.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const h = await authHeaders();
      const [uRes, sRes] = await Promise.all([
        fetch("/api/admin/users", { headers: h }),
        fetch("/api/sites", { headers: h }),
      ]);
      const uData = (await uRes.json()) as { users?: UserRow[]; error?: string };
      const sData = (await sRes.json()) as { sites?: Site[]; error?: string };
      if (!uRes.ok) throw new Error(uData.error ?? "Failed to load users");
      if (!sRes.ok) throw new Error(sData.error ?? "Failed to load sites");
      setUsers(uData.users ?? []);
      setSites(sData.sites ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
      setUsers([]);
      setSites([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) void load();
    });
    return () => unsub();
  }, [load]);

  const siteName = React.useCallback(
    (id: string) => {
      const s = sites.find((x) => x.id === id);
      return s?.name?.trim() ? s.name : id;
    },
    [sites]
  );

  const employees = React.useMemo(
    () => users.filter((u) => u.role === "employee"),
    [users]
  );

  const pushAssignments = React.useCallback(
    async (workerId: string, siteIds: string[], successNote?: string) => {
      setSaving(true);
      try {
        const h = await authHeaders();
        const res = await fetch("/api/admin/assign-sites", {
          method: "POST",
          headers: { ...h, "Content-Type": "application/json" },
          body: JSON.stringify({ workerId, siteIds }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          unchanged?: boolean;
        };
        if (!res.ok) throw new Error(data.error ?? "Update failed");
        await load();
        if (data.unchanged) {
          toast.info("Assignments were already up to date — no changes.");
          return;
        }
        if (successNote) setDoneMessage(successNote);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Update failed");
      } finally {
        setSaving(false);
      }
    },
    [authHeaders, load]
  );

  const removeSite = (w: UserRow, siteId: string) => {
    if (saving) return;
    setConfirmRemove({ worker: w, siteId });
  };

  const clearAllSites = (w: UserRow) => {
    if (saving) return;
    setConfirmClear(w);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <TableRowsSkeleton rows={8} />
      </div>
    );
  }

  const openAssignModal = () => {
    const w = employees.find((e) => e.id === pickWorkerId);
    if (!w) {
      toast.message("Select an employee first.");
      return;
    }
    setAssignWorker(w);
    setAddAssignExpanded(false);
    setPickWorkerId("");
  };

  return (
    <div className="space-y-6">
      <AssignWorkSitesModal
        worker={assignWorker}
        open={assignWorker != null}
        onOpenChange={(open) => {
          if (!open) setAssignWorker(null);
        }}
        onSaved={() => void load()}
      />

      {confirmRemove ? (
        <ConfirmActionModal
          open
          tone="danger"
          title="Remove this assignment?"
          description={
            <>
              <p>
                Remove <strong>{siteName(confirmRemove.siteId)}</strong> from{" "}
                <strong>{confirmRemove.worker.name || confirmRemove.worker.email}</strong>?
                They will be notified. If this was their last site, they cannot check in until you assign
                another.
              </p>
            </>
          }
          confirmLabel="Remove"
          busy={saving}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => {
            const { worker, siteId } = confirmRemove;
            const next = worker.assignedSites.filter((id) => id !== siteId);
            setConfirmRemove(null);
            void pushAssignments(
              worker.id,
              next,
              `Removed “${siteName(siteId)}” from this worker. They were notified.`
            );
          }}
        />
      ) : null}

      {confirmClear ? (
        <ConfirmActionModal
          open
          tone="danger"
          title="Clear all assignments?"
          description={
            <>
              <p>
                Remove every site assignment for{" "}
                <strong>{confirmClear.name || confirmClear.email || confirmClear.id}</strong>?
                They will not be able to check in until you assign sites again. They will be notified.
              </p>
            </>
          }
          confirmLabel="Clear all"
          busy={saving}
          onCancel={() => setConfirmClear(null)}
          onConfirm={() => {
            const w = confirmClear;
            setConfirmClear(null);
            void pushAssignments(
              w.id,
              [],
              "All site assignments cleared. They were notified."
            );
          }}
        />
      ) : null}

      {doneMessage ? (
        <ResultModal
          open
          variant="success"
          title="Done"
          description={doneMessage}
          onDismiss={() => setDoneMessage(null)}
        />
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Who has what</CardTitle>
            <CardDescription>
              Remove individual sites or clear all for a worker (they get a notification on save). Use
              <strong className="mx-1 text-zinc-800 dark:text-zinc-400">Add assignment</strong> for the same
              site picker as on
              Workers → Assign. Open Work lists every site they have; Go to Work / Assigned focus on these
              sites.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setAddAssignExpanded((e) => !e);
              setPickWorkerId("");
            }}
          >
            {addAssignExpanded ? "Close form" : "Add assignment"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {addAssignExpanded ? (
            <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/90 p-4 dark:border-white/10 dark:bg-white/[0.02]">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-200">Assign sites to an employee</p>
              <p className="mt-1 text-xs text-zinc-500">
                Same checklist as the Workers table — tick sites and save; the worker is notified.
              </p>
              <div className="mt-3">
                <span className="text-xs text-zinc-500">Employee</span>
                <SearchableSelect
                  value={pickWorkerId}
                  onValueChange={setPickWorkerId}
                  options={employees.map((e) => ({
                    value: e.id,
                    label: e.employeeId?.trim()
                      ? `${e.employeeId} (${e.name?.trim() || "Employee"})`
                      : `${e.name?.trim() || "Employee"}`,
                    keywords: [e.employeeId ?? "", e.id, e.name ?? "", e.email ?? ""],
                  }))}
                  emptyLabel="— Select employee —"
                  searchPlaceholder="Search employees…"
                  triggerClassName="mt-1 h-10 w-full rounded-xl border border-zinc-200/90 bg-white px-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-black/40 dark:text-zinc-100"
                  popoverContentClassName="z-[1400]"
                  listClassName="max-h-[min(280px,50vh)]"
                />
              </div>
              <Button type="button" className="mt-3" size="sm" onClick={openAssignModal}>
                Choose sites…
              </Button>
            </div>
          ) : null}

          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200/80 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10">
                <th className="pb-3 pr-4 font-medium">Worker</th>
                <th className="pb-3 pr-4 font-medium">Email</th>
                <th className="pb-3 pr-4 font-medium">Assigned sites</th>
                <th className="pb-3 w-28 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-zinc-800 dark:text-zinc-300">
              {employees.map((w) => (
                <tr key={w.id} className="border-b border-zinc-200/60 align-top dark:border-white/5">
                  <td className="py-3 pr-4">
                    <Link
                      href={`/dashboard/admin/workers/${encodeURIComponent(w.id)}/attendance/${encodeURIComponent(new Date().toISOString().slice(0, 10))}`}
                      className="font-medium text-cyan-400 hover:underline"
                    >
                      {w.name || w.email || w.id}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-zinc-500">{w.email || "—"}</td>
                  <td className="py-3 pr-4">
                    {w.assignedSites.length === 0 ? (
                      <span className="text-amber-900 dark:text-amber-200/80">None — cannot check in</span>
                    ) : (
                      <ul className="max-w-xl space-y-2 text-xs sm:text-sm">
                        {w.assignedSites.map((sid) => (
                            <li
                              key={sid}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200/60 bg-white/80 px-2 py-1.5 dark:border-white/5 dark:bg-white/[0.02]"
                            >
                              <span>
                                <span className="text-zinc-900 dark:text-zinc-200">{siteName(sid)}</span>{" "}
                                <span className="font-mono text-zinc-500">({sid})</span>
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 shrink-0 gap-1 px-2 text-red-400 hover:bg-red-500/15 hover:text-red-300"
                                disabled={saving}
                                aria-label={`Remove ${siteName(sid)} from this worker`}
                                onClick={() => removeSite(w, sid)}
                              >
                                <X className="size-3.5" aria-hidden />
                                Remove
                              </Button>
                            </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="py-3 text-right align-top">
                    {w.assignedSites.length > 0 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="gap-1 text-red-300 hover:border-red-500/30 hover:bg-red-500/10"
                        disabled={saving}
                        onClick={() => clearAllSites(w)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Clear all
                      </Button>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {employees.length === 0 ? (
            <p className="py-6 text-sm text-zinc-500">No employee accounts found.</p>
          ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
