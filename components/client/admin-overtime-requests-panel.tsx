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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { getFirestoreSeconds } from "@/lib/client/firestore-timestamp";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmActionModal, ResultModal } from "@/components/client/feedback-modals";
import { toast } from "sonner";
import { DEFAULT_ATTENDANCE_TIME_ZONE } from "@/lib/date/time-zone";
import { formatInstantDateTime12hInZone } from "@/lib/time/format-wall-time";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import { formatIsoForCalendar, formatTimestampForMode, CalendarMode } from "@/lib/date/bs-calendar";
import { cn } from "@/lib/utils";

type OvertimeStamp = {
  time?: { seconds?: number };
  gps?: { latitude?: number; longitude?: number; accuracyM?: number };
  photoUrl?: string;
};

type Row = {
  id: string;
  workerId?: string;
  workerName?: string | null;
  workerEmail?: string | null;
  siteId?: string | null;
  date?: string;
  reason?: string;
  status?: string;
  createdAt?: { seconds?: number };
  reviewedAt?: { seconds?: number };
  reviewedByEmail?: string | null;
  reviewNote?: string | null;
  overtimeCheckIn?: OvertimeStamp | null;
  overtimeCheckOut?: OvertimeStamp | null;
};

type SiteOpt = { id: string; name?: string };

function fmt(v: unknown, mode: CalendarMode) {
  const s = getFirestoreSeconds(v);
  if (s == null) return "—";
  return formatTimestampForMode(s * 1000, mode, DEFAULT_ATTENDANCE_TIME_ZONE);
}

function fmtGps(g: OvertimeStamp["gps"]) {
  if (!g || typeof g.latitude !== "number" || typeof g.longitude !== "number") return "—";
  const acc =
    typeof g.accuracyM === "number" ? ` ±${Math.round(g.accuracyM)}m` : "";
  return `${g.latitude.toFixed(6)}, ${g.longitude.toFixed(6)}${acc}`;
}

export function AdminOvertimeRequestsPanel({ embedded = false, typeFilter = "overtime" }: { embedded?: boolean, typeFilter?: "overtime" | "late" }) {
  const { mode } = useCalendarMode();
  const [items, setItems] = React.useState<Row[]>([]);
  const [sites, setSites] = React.useState<SiteOpt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [confirmOvertime, setConfirmOvertime] = React.useState<
    | null
    | { kind: "delete"; id: string }
    | { kind: "unapprove"; row: Row }
    | { kind: "reject"; row: Row; scope: "pending" | "approved" }
  >(null);
  const [doneFeedback, setDoneFeedback] = React.useState<{
    title: string;
    description: string;
  } | null>(null);
  const [actionBusy, setActionBusy] = React.useState(false);
  /** Approve-time site override per request id (falls back to row.siteId). */
  const [approveSiteId, setApproveSiteId] = React.useState<Record<string, string>>({});

  const authHeaders = React.useCallback(async () => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    const token = await u.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadSites = React.useCallback(async () => {
    try {
      const h = await authHeaders();
      const res = await fetch("/api/sites", { headers: h });
      const data = (await res.json()) as { sites?: SiteOpt[] };
      if (res.ok) setSites(data.sites ?? []);
    } catch {
      setSites([]);
    }
  }, [authHeaders]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const h = await authHeaders();
      const qParams = new URLSearchParams();
      if (filter !== "all") qParams.set("status", filter);
      if (typeFilter) qParams.set("type", typeFilter);
      const q = `?${qParams.toString()}`;
      const res = await fetch(`/api/overtime${q}`, { headers: h });
      const data = (await res.json()) as { items?: Row[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setItems(data.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, filter, typeFilter]);

  React.useEffect(() => {
    void loadSites();
  }, [loadSites]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const siteName = React.useCallback(
    (id: string | null | undefined) => {
      if (!id) return "—";
      const s = sites.find((x) => x.id === id);
      return s?.name ?? id;
    },
    [sites]
  );

  const patchStatus = async (
    id: string,
    status: "approved" | "rejected" | "pending",
    row: Row,
    pickedSite?: string
  ) => {
    const body: { status: typeof status; siteId?: string } = { status };
    if (status === "pending") {
      setActionBusy(true);
      try {
        const h = await authHeaders();
        const res = await fetch(`/api/overtime/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { ...h, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "pending" }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Update failed");
        await load();
        setDoneFeedback({
          title: "Moved to pending",
          description:
            "This request is open for review again. Status is restored to pending approval.",
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error");
      } finally {
        setActionBusy(false);
      }
      return;
    }

    if (status === "approved") {
      const chosen =
        (pickedSite ?? approveSiteId[id] ?? "").trim() ||
        (typeof row.siteId === "string" ? row.siteId.trim() : "");
      if (!chosen) {
        toast.message("Choose a work site before approving.");
        return;
      }
      if (
        !row.siteId ||
        !String(row.siteId).trim() ||
        chosen !== String(row.siteId).trim()
      ) {
        body.siteId = chosen;
      }
    }
    setActionBusy(true);
    try {
      const h = await authHeaders();
      const res = await fetch(`/api/overtime/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setApproveSiteId((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await load();
      if (status === "approved") {
        setDoneFeedback({
          title: "Request approved",
          description:
            "The employee's attendance is now approved and recorded in the timesheet.",
        });
      } else if (status === "rejected") {
        setDoneFeedback({
          title: "Request rejected",
          description: "The request is marked rejected. This attendance will not count towards paid hours.",
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
      const res = await fetch(`/api/overtime/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: h,
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      await load();
      setDoneFeedback({
        title: "Request deleted",
        description: "This correction request was permanently removed.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className={cn(!embedded && "p-3 md:p-8")}>
      {confirmOvertime?.kind === "delete" ? (
        <ConfirmActionModal
          open
          tone="danger"
          title="Delete request?"
          description="This permanently removes the request from the queue. This cannot be undone."
          confirmLabel="Delete"
          busy={actionBusy}
          onCancel={() => setConfirmOvertime(null)}
          onConfirm={() => {
            const id = confirmOvertime.id;
            setConfirmOvertime(null);
            void deleteRequest(id);
          }}
        />
      ) : null}

      {confirmOvertime?.kind === "unapprove" ? (
        <ConfirmActionModal
          open
          tone="neutral"
          title="Unapprove this request?"
          description={
            <>
              <p>
                Move this request back to <strong>pending</strong>?
              </p>
            </>
          }
          confirmLabel="Unapprove"
          busy={actionBusy}
          onCancel={() => setConfirmOvertime(null)}
          onConfirm={() => {
            const row = confirmOvertime.row;
            setConfirmOvertime(null);
            void patchStatus(row.id, "pending", row);
          }}
        />
      ) : null}

      {confirmOvertime?.kind === "reject" ? (
        <ConfirmActionModal
          open
          tone="danger"
          title="Reject this request?"
          description={
            confirmOvertime.scope === "pending" ? (
              <p>The employee will see this request as rejected.</p>
            ) : (
              <p>
                Mark as rejected? This attendance will be invalidated.
              </p>
            )
          }
          confirmLabel="Reject"
          busy={actionBusy}
          onCancel={() => setConfirmOvertime(null)}
          onConfirm={() => {
            const row = confirmOvertime.row;
            setConfirmOvertime(null);
            void patchStatus(row.id, "rejected", row);
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

      {!embedded ? (
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">{typeFilter === "late" ? "Late Requests" : "Overtime"}</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Review completed {typeFilter === "late" ? "late check-ins" : "overtime sessions"} (GPS + selfie proof), then approve or reject.
          </p>
        </div>
      ) : (
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          Review {typeFilter === "late" ? "late requests" : "overtime"} with GPS and selfie proof.
        </p>
      )}

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
            <CardDescription>
              Newest first. {typeFilter === "late" ? "Late requests" : "Overtime requests"} that need your attention.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3" aria-hidden>
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">No requests.</p>
            ) : (
              <ul className="space-y-4">
                {items.map((r) => {
                  const pick =
                    approveSiteId[r.id] ??
                    (typeof r.siteId === "string" ? r.siteId : "");

                  const inTs = r.overtimeCheckIn?.time;
                  const outTs = r.overtimeCheckOut?.time;
                  const hasIn = getFirestoreSeconds(inTs) != null;
                  const hasOut = getFirestoreSeconds(outTs) != null;
                  const canApprove =
                    r.status === "pending" && Boolean(pick.trim()) && hasIn && hasOut;

                  return (
                    <li
                      key={r.id}
                      className="rounded-xl border border-zinc-200/80 bg-zinc-50/90 p-4 text-sm dark:border-white/10 dark:bg-white/[0.02]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">
                            {r.workerName || r.workerEmail || r.workerId || "Worker"}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {r.workerEmail ?? "—"}
                          </p>
                        </div>
                        <span
                          className={
                            r.status === "approved"
                              ? "text-emerald-700 dark:text-emerald-400"
                              : r.status === "rejected"
                                ? "text-red-600 dark:text-red-400"
                                : "text-amber-800 dark:text-amber-200"
                          }
                        >
                          {r.status ?? "pending"}
                        </span>
                      </div>
                      <dl className="mt-3 grid gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                        <div>
                          <span className="text-zinc-500">Work date: </span>
                          {r.date ? formatIsoForCalendar(r.date, mode) : "—"}
                        </div>
                        <div>
                          <span className="text-zinc-500">Site: </span>
                          {siteName(typeof r.siteId === "string" ? r.siteId : null)}
                        </div>
                        <div>
                          <span className="text-zinc-500">Submitted: </span>
                          {fmt(r.createdAt, mode)}
                        </div>
                        {r.reviewedAt ? (
                          <div>
                            <span className="text-zinc-500">Reviewed: </span>
                            {fmt(r.reviewedAt, mode)}{" "}
                            {r.reviewedByEmail ? `· ${r.reviewedByEmail}` : ""}
                          </div>
                        ) : null}
                      </dl>
                      <p className="mt-2 text-zinc-800 dark:text-zinc-300">{r.reason ?? "—"}</p>

                      {(r.status === "approved" || (r.status === "pending" && (hasIn || hasOut))) ? (
                        <div className="mt-3 space-y-2 rounded-lg border border-violet-500/25 bg-violet-500/[0.06] p-3 text-xs dark:border-violet-500/20 dark:bg-violet-500/[0.04]">
                          <p className="font-medium text-violet-900 dark:text-violet-200/90">
                            Recorded attendance
                          </p>
                          {hasIn ? (
                            <div className="text-zinc-600 dark:text-zinc-400">
                              <span className="text-zinc-500">Check-in: </span>
                              {fmt(inTs, mode)}{" "}
                              <span className="text-zinc-600">
                                · GPS {fmtGps(r.overtimeCheckIn?.gps)}
                              </span>
                              {r.overtimeCheckIn?.photoUrl ? (
                                <>
                                  {" "}
                                  ·{" "}
                                  <a
                                    href={r.overtimeCheckIn.photoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-cyan-400 underline"
                                  >
                                    photo
                                  </a>
                                </>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-amber-900 dark:text-amber-200/80">No check-in yet.</p>
                          )}
                          {hasOut ? (
                            <div className="text-zinc-600 dark:text-zinc-400">
                              <span className="text-zinc-500">Check-out: </span>
                              {fmt(outTs, mode)}{" "}
                              <span className="text-zinc-600">
                                · GPS {fmtGps(r.overtimeCheckOut?.gps)}
                              </span>
                              {r.overtimeCheckOut?.photoUrl ? (
                                <>
                                  {" "}
                                  ·{" "}
                                  <a
                                    href={r.overtimeCheckOut.photoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-cyan-400 underline"
                                  >
                                    photo
                                  </a>
                                </>
                              ) : null}
                            </div>
                          ) : hasIn ? (
                            <p className="text-amber-900 dark:text-amber-200/80">Awaiting check-out.</p>
                          ) : null}
                          {r.status === "pending" && hasIn && hasOut ? (
                            <p className="border-t border-violet-500/20 pt-2 text-amber-900 dark:text-amber-200/90">
                              Completed by worker. Pending your decision.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {r.status === "pending" ? (
                        <div className="mt-3 space-y-3">
                          <label className="flex max-w-md flex-col gap-1 text-xs">
                            <span className="text-zinc-500">Work site (required to approve)</span>
                            <SearchableSelect
                              value={pick}
                              onValueChange={(v) =>
                                setApproveSiteId((prev) => ({
                                  ...prev,
                                  [r.id]: v,
                                }))
                              }
                              options={sites.map((s) => ({
                                value: s.id,
                                label: s.name?.trim() ? `${s.name} (${s.id})` : s.id,
                              }))}
                              emptyLabel="Select site…"
                              searchPlaceholder="Search sites…"
                              triggerClassName="rounded-lg border border-zinc-200/90 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-black/40 dark:text-foreground"
                              listClassName="max-h-[min(280px,50vh)]"
                            />
                          </label>
                          {!hasIn || !hasOut ? (
                            <p className="text-xs text-amber-700 dark:text-amber-300/90">
                              Approve is enabled only after both check-in and check-out are recorded.
                            </p>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={!canApprove}
                              onClick={() =>
                                void patchStatus(r.id, "approved", r, pick.trim())
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                setConfirmOvertime({ kind: "reject", row: r, scope: "pending" })
                              }
                            >
                              Reject
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => setConfirmOvertime({ kind: "delete", id: r.id })}
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
                            onClick={() => setConfirmOvertime({ kind: "unapprove", row: r })}
                          >
                            Unapprove
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setConfirmOvertime({ kind: "reject", row: r, scope: "approved" })
                            }
                          >
                            Reject
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => setConfirmOvertime({ kind: "delete", id: r.id })}
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
                            onClick={() => setConfirmOvertime({ kind: "delete", id: r.id })}
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
