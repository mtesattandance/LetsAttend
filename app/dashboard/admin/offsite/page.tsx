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
import { getFirestoreSeconds } from "@/lib/client/firestore-timestamp";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmActionModal, ResultModal } from "@/components/client/feedback-modals";
import { toast } from "sonner";
import { DEFAULT_ATTENDANCE_TIME_ZONE } from "@/lib/date/time-zone";
import { formatInstantDateTime12hInZone, formatWallHm12h } from "@/lib/time/format-wall-time";
import { UtcTimePicker } from "@/components/client/utc-time-picker";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import { formatIsoForCalendar } from "@/lib/date/bs-calendar";

type Row = {
  id: string;
  workerId?: string;
  workerName?: string | null;
  workerEmail?: string | null;
  assigneeAdminUid?: string | null;
  assigneeAdminName?: string | null;
  assigneeAdminEmail?: string | null;
  date?: string;
  reason?: string;
  status?: string;
  requestedStartHm?: string;
  requestedEndHm?: string;
  approvedStartHm?: string | null;
  approvedEndHm?: string | null;
  createdAt?: { seconds?: number };
  reviewedAt?: { seconds?: number };
  reviewedByEmail?: string | null;
  reviewNote?: string | null;
  requestGps?: { latitude?: number; longitude?: number; accuracyM?: number };
};

function fmt(v: unknown) {
  const s = getFirestoreSeconds(v);
  if (s == null) return "—";
  return formatInstantDateTime12hInZone(s * 1000, DEFAULT_ATTENDANCE_TIME_ZONE, {
    withSeconds: true,
    withTimeZoneName: true,
  });
}

function fmtGps(g: Row["requestGps"]) {
  if (!g || typeof g.latitude !== "number" || typeof g.longitude !== "number") return "—";
  const acc = typeof g.accuracyM === "number" ? ` ±${Math.round(g.accuracyM)}m` : "";
  return `${g.latitude.toFixed(6)}, ${g.longitude.toFixed(6)}${acc}`;
}

type DraftTimes = { start: string; end: string };

export default function AdminOffsitePage() {
  const { mode } = useCalendarMode();
  const [items, setItems] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [confirm, setConfirm] = React.useState<
    | null
    | { kind: "delete"; id: string }
    | { kind: "unapprove"; row: Row }
    | { kind: "reject"; row: Row }
  >(null);
  const [doneFeedback, setDoneFeedback] = React.useState<{
    title: string;
    description: string;
  } | null>(null);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [draftTimes, setDraftTimes] = React.useState<Record<string, DraftTimes>>({});

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
      const res = await fetch(`/api/offsite-work${q}`, { headers: h });
      const data = (await res.json()) as { items?: Row[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setItems(data.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, filter]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setDraftTimes((prev) => {
      const next = { ...prev };
      for (const r of items) {
        if (!next[r.id]) {
          next[r.id] = {
            start: r.requestedStartHm ?? "09:00",
            end: r.requestedEndHm ?? "17:00",
          };
        }
      }
      return next;
    });
  }, [items]);

  const patchStatus = async (
    id: string,
    status: "approved" | "rejected" | "pending",
    opts?: { approvedStartHm?: string; approvedEndHm?: string }
  ) => {
    setActionBusy(true);
    try {
      const h = await authHeaders();
      const body: Record<string, unknown> = { status };
      if (status === "approved" && opts?.approvedStartHm && opts?.approvedEndHm) {
        body.approvedStartHm = opts.approvedStartHm;
        body.approvedEndHm = opts.approvedEndHm;
      }
      const res = await fetch(`/api/offsite-work/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      await load();
      if (status === "approved") {
        setDoneFeedback({
          title: "Approved",
          description: "Off-site hours are stored for the day timeline and totals.",
        });
      } else if (status === "rejected") {
        setDoneFeedback({ title: "Rejected", description: "The employee will see this as rejected." });
      } else {
        setDoneFeedback({
          title: "Back to pending",
          description: "Review and times were cleared; the employee can resubmit context if needed.",
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setActionBusy(false);
    }
  };

  const deleteRequest = async (id: string) => {
    setActionBusy(true);
    try {
      const h = await authHeaders();
      const res = await fetch(`/api/offsite-work/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: h,
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      await load();
      setDoneFeedback({
        title: "Deleted",
        description: "This off-site request was removed.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="p-3 md:p-8">
      {confirm?.kind === "delete" ? (
        <ConfirmActionModal
          open
          tone="danger"
          title="Delete off-site request?"
          description="This permanently removes the request."
          confirmLabel="Delete"
          busy={actionBusy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const id = confirm.id;
            setConfirm(null);
            void deleteRequest(id);
          }}
        />
      ) : null}

      {confirm?.kind === "unapprove" ? (
        <ConfirmActionModal
          open
          tone="neutral"
          title="Unapprove?"
          description="Move back to pending and clear approved times."
          confirmLabel="Unapprove"
          busy={actionBusy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const row = confirm.row;
            setConfirm(null);
            void patchStatus(row.id, "pending");
          }}
        />
      ) : null}

      {confirm?.kind === "reject" ? (
        <ConfirmActionModal
          open
          tone="danger"
          title="Reject this request?"
          description="The employee will see it as rejected."
          confirmLabel="Reject"
          busy={actionBusy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const row = confirm.row;
            setConfirm(null);
            void patchStatus(row.id, "rejected");
          }}
        />
      ) : null}

      {doneFeedback ? (
        <ResultModal
          open
          variant="success"
          title={doneFeedback.title}
          description={doneFeedback.description}
          onDismiss={() => setDoneFeedback(null)}
        />
      ) : null}

      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Off-site work</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Approve with optional time edits (counts toward day hours). Any admin can act. No selfie — only
          request GPS from the employee.
        </p>
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
            <CardDescription>Newest first. Adjust start/end before approve if needed.</CardDescription>
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
                {items.map((r) => {
                  const d = draftTimes[r.id] ?? {
                    start: r.requestedStartHm ?? "09:00",
                    end: r.requestedEndHm ?? "17:00",
                  };
                  return (
                    <li
                      key={r.id}
                      className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-zinc-100">
                            {r.workerName ?? r.workerEmail ?? r.workerId ?? "Worker"}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {r.workerEmail ?? "—"} · UID {r.workerId ?? "—"}
                          </p>
                        </div>
                        <span
                          className={
                            r.status === "approved"
                              ? "text-emerald-400"
                              : r.status === "rejected"
                                ? "text-red-400"
                                : "text-amber-200"
                          }
                        >
                          {r.status ?? "pending"}
                        </span>
                      </div>
                      <dl className="mt-3 grid gap-1 text-xs text-zinc-400">
                        <div>
                          <span className="text-zinc-500">Date: </span>
                          {r.date ? formatIsoForCalendar(r.date, mode) : "—"}
                        </div>
                        <div>
                          <span className="text-zinc-500">Assignee: </span>
                          {r.assigneeAdminName ?? r.assigneeAdminEmail ?? r.assigneeAdminUid ?? "—"}
                        </div>
                        <div>
                          <span className="text-zinc-500">Requested window (local): </span>
                          {formatWallHm12h(r.requestedStartHm ?? "—")} →{" "}
                          {formatWallHm12h(r.requestedEndHm ?? "—")}
                        </div>
                        {r.status === "approved" && r.approvedStartHm && r.approvedEndHm ? (
                          <div>
                            <span className="text-zinc-500">Approved window (local): </span>
                            {formatWallHm12h(r.approvedStartHm)} → {formatWallHm12h(r.approvedEndHm)}
                          </div>
                        ) : null}
                        <div>
                          <span className="text-zinc-500">Request GPS: </span>
                          {fmtGps(r.requestGps)}
                        </div>
                        <div>
                          <span className="text-zinc-500">Map: </span>
                          <span className="text-zinc-400">
                            Use Live map (violet pins) for today&apos;s off-site GPS.
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Submitted: </span>
                          {fmt(r.createdAt)}
                        </div>
                        {r.reviewedAt ? (
                          <div>
                            <span className="text-zinc-500">Reviewed: </span>
                            {fmt(r.reviewedAt)}{" "}
                            {r.reviewedByEmail ? `· ${r.reviewedByEmail}` : ""}
                          </div>
                        ) : null}
                      </dl>
                      <p className="mt-2 text-zinc-300">{r.reason ?? "—"}</p>

                      {r.status === "pending" ? (
                        <div className="mt-3 space-y-3 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-3">
                          <p className="text-xs font-medium text-cyan-200/90">Edit before approve (local)</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <UtcTimePicker
                              id={`${r.id}-ap-s`}
                              label="Start"
                              value={d.start}
                              onChange={(v) =>
                                setDraftTimes((prev) => ({
                                  ...prev,
                                  [r.id]: { ...d, start: v },
                                }))
                              }
                              variant="dark"
                            />
                            <UtcTimePicker
                              id={`${r.id}-ap-e`}
                              label="End"
                              value={d.end}
                              onChange={(v) =>
                                setDraftTimes((prev) => ({
                                  ...prev,
                                  [r.id]: { ...d, end: v },
                                }))
                              }
                              variant="dark"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                void patchStatus(r.id, "approved", {
                                  approvedStartHm: d.start,
                                  approvedEndHm: d.end,
                                })
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => setConfirm({ kind: "reject", row: r })}
                            >
                              Reject
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => setConfirm({ kind: "delete", id: r.id })}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {r.status === "approved" ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setConfirm({ kind: "unapprove", row: r })}
                          >
                            Unapprove
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setConfirm({ kind: "reject", row: r })}
                          >
                            Reject
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => setConfirm({ kind: "delete", id: r.id })}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : null}

                      {r.status === "rejected" ? (
                        <div className="mt-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => setConfirm({ kind: "delete", id: r.id })}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
