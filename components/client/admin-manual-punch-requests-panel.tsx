"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { getFirestoreSeconds } from "@/lib/client/firestore-timestamp";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmActionModal, ResultModal } from "@/components/client/feedback-modals";
import { toast } from "sonner";
import { DEFAULT_ATTENDANCE_TIME_ZONE } from "@/lib/date/time-zone";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import { formatIsoForCalendar, formatTimestampForMode, CalendarMode } from "@/lib/date/bs-calendar";
import { cn } from "@/lib/utils";
import { formatWallHm12h } from "@/lib/time/format-wall-time";

type Segment = { siteId: string; inHm: string; outHm: string; };

type Row = {
  id: string;
  workerId?: string;
  workerName?: string | null;
  workerEmail?: string | null;
  date?: string;
  reason?: string;
  status?: string;
  segments?: Segment[];
  createdAt?: { seconds?: number };
  reviewedAt?: { seconds?: number };
  reviewedByEmail?: string | null;
  reviewNote?: string | null;
};

function fmt(v: unknown, mode: CalendarMode) {
  const s = getFirestoreSeconds(v);
  if (s == null) return "—";
  return formatTimestampForMode(s * 1000, mode, DEFAULT_ATTENDANCE_TIME_ZONE);
}

export function AdminManualPunchRequestsPanel({ embedded = false }: { embedded?: boolean }) {
  const { mode } = useCalendarMode();
  const [items, setItems] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [actionBusy, setActionBusy] = React.useState(false);

  const [confirm, setConfirm] = React.useState<
    | null
    | { kind: "delete"; id: string }
    | { kind: "unapprove"; row: Row }
    | { kind: "reject"; row: Row }
  >(null);

  const [doneFeedback, setDoneFeedback] = React.useState<{ title: string; description: string } | null>(null);

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
      const q = filter === "all" ? "" : `?status=${encodeURIComponent(filter)}`;
      const res = await fetch(`/api/manual-punch${q}`, { headers: h });
      const data = (await res.json()) as { items?: Row[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load requests");
      setItems(data.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter, authHeaders]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const doAction = async (id: string, action: "approved" | "rejected" | "pending") => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const note = confirm?.kind === "reject" || confirm?.kind === "unapprove"
        ? (document.getElementById("mp-reason") as HTMLInputElement)?.value || "No note"
        : undefined;

      const res = await fetch(`/api/admin/manual-punch/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({ status: action, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      setDoneFeedback({
        title: action === "approved" ? "Approved ✓" : action === "rejected" ? "Rejected" : "Un-approved",
        description: action === "approved"
          ? "The employee's attendance timeline has been corrected mathematically."
          : `Success`,
      });
      setConfirm(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActionBusy(false);
    }
  };

  const doDelete = async (id: string) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/admin/manual-punch/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setConfirm(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActionBusy(false);
    }
  };

  const hasItems = items.length > 0;

  return (
    <div className={cn("space-y-6", !embedded && "mt-4")}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {!embedded && (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Late Request</h1>
            <p className="mt-1 text-sm text-zinc-500">Approve missed or late attendance. Timeline overrides will be applied automatically.</p>
          </div>
        )}
      </div>

      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <Button
              key={f}
              type="button"
              size="sm"
              variant={filter === f ? "default" : "secondary"}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f}
            </Button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Queue</CardTitle>
            <CardDescription>Newest first. Approve missed or late attendance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3" aria-hidden>
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-zinc-400">No requests.</p>
            ) : (
              <ul className="space-y-4">
                {items.map((row) => {
            const isPending = row.status === "pending";
            const dateStr = typeof row.date === "string" ? formatIsoForCalendar(row.date, mode) : "—";
            const workerLabel = row.workerName || row.workerEmail || row.workerId || "Unknown";

            return (
              <li key={row.id} className="relative flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 transition-colors dark:border-white/10 dark:bg-white/[0.01]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-semibold text-zinc-900 dark:text-white">{workerLabel}</h4>
                      <p className="text-sm text-zinc-500">
                        Date: <span className="font-semibold">{dateStr}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-semibold capitalize",
                          isPending && "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
                          row.status === "approved" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
                          row.status === "rejected" && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                        )}
                      >
                        {row.status}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4 text-sm">
                  <div className="grid gap-y-1 sm:grid-cols-2">
                    <div><span className="font-medium text-zinc-500">Submitted:</span> {fmt(row.createdAt, mode)}</div>
                    {row.reviewedAt && (
                      <div className="sm:col-span-2">
                        <span className="font-medium text-zinc-500">Reviewed By:</span> {row.reviewedByEmail || "Admin"} on {fmt(row.reviewedAt, mode)}
                      </div>
                    )}
                  </div>

                  <div className="rounded border bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.02]">
                    <span className="font-medium text-zinc-500">Reason</span>
                    <p className="mt-1 text-zinc-800 dark:text-zinc-200">{row.reason}</p>
                  </div>

                  <div className="rounded border bg-indigo-50/50 p-3 dark:border-indigo-500/10 dark:bg-indigo-950/20">
                    <span className="font-medium text-indigo-700 dark:text-indigo-400">Timeline Requested</span>
                    <ul className="mt-2 space-y-2">
                      {row.segments?.map((seg, idx) => (
                        <li key={idx} className="flex gap-2 text-zinc-800 dark:text-zinc-300">
                          <span className="bg-indigo-100 dark:bg-indigo-900/50 px-1.5 py-0.5 rounded text-xs font-mono">
                            Block {idx + 1}
                          </span>
                          <span>In: {formatWallHm12h(seg.inHm)}</span>
                          <span className="text-zinc-400">→</span>
                          <span>Out: {formatWallHm12h(seg.outHm)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {row.reviewNote && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-900/30 dark:bg-red-950/30 dark:text-red-300">
                      <strong>Rejection Note:</strong> {row.reviewNote}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    {isPending ? (
                      <>
                        <Button size="sm" onClick={() => doAction(row.id, "approved")} disabled={actionBusy} className="bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500 text-white dark:bg-emerald-700 dark:hover:bg-emerald-600">
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "reject", row })} disabled={actionBusy} className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/50">
                          Reject
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "unapprove", row })} disabled={actionBusy}>
                          {row.status === "approved" ? "Un-Approve (Undo)" : "Reset to Pending"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "delete", id: row.id })} disabled={actionBusy} className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-950/50">
                          Delete Request
                        </Button>
                      </>
                    )}
                  </div>
                  </div>
              </li>
            );
          })}
        </ul>
      )}
    </CardContent>
  </Card>
</div>

      {/* Confirmation Modal */}
      {confirm?.kind === "delete" && (
        <ConfirmActionModal
          open
          tone="danger"
          title="Delete Request"
          description="Are you sure you want to permanently delete this late request? This will also wipe the mathematical attendance entry it created."
          confirmLabel="Delete"
          onConfirm={() => doDelete(confirm.id)}
          onCancel={() => setConfirm(null)}
          busy={actionBusy}
        />
      )}
      {(confirm?.kind === "reject" || confirm?.kind === "unapprove") && (
        <ConfirmActionModal
          open
          tone={confirm.kind === "reject" ? "danger" : "neutral"}
          title={confirm.kind === "reject" ? "Reject Request" : "Reset to Pending"}
          description={
            confirm.kind === "reject"
              ? "Provide a reason for rejection (optional). They will be notified."
              : "Reverting an approved request back to pending will automatically delete its mathematical attendance tracking from the reports."
          }
          confirmLabel={confirm.kind === "reject" ? "Reject" : "Reset"}
          onConfirm={() => doAction(confirm.row.id, confirm.kind === "reject" ? "rejected" : "pending")}
          onCancel={() => setConfirm(null)}
          busy={actionBusy}
        />
      )}

      {/* Success Modal */}
      {doneFeedback && (
        <ResultModal
          open
          variant="success"
          title={doneFeedback.title}
          description={doneFeedback.description}
          onDismiss={() => setDoneFeedback(null)}
        />
      )}
    </div>
  );
}
