"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { LiveWorkersMap } from "@/components/client/map/live-workers-map";
import { AdminEditSiteForm } from "@/components/client/admin-edit-site-form";
import { ConfirmActionModal, ResultModal } from "@/components/client/feedback-modals";
import { toast } from "sonner";
import { DEFAULT_ATTENDANCE_TIME_ZONE } from "@/lib/date/time-zone";
import {
  formatInstantDateTime12hInZone,
  formatInstantTime12hInZone,
} from "@/lib/time/format-wall-time";

type Site = {
  id: string;
  name?: string;
  latitude?: unknown;
  longitude?: unknown;
  radius?: unknown;
  workdayStartUtc?: unknown;
  workdayEndUtc?: unknown;
  autoCheckoutUtc?: unknown;
};

type PhotoEntry = {
  kind: "check_in" | "site_switch" | "check_out";
  photoUrl: string;
  atMs: number | null;
};

type OvertimeRow = {
  id: string;
  workerName?: string | null;
  workerEmail?: string | null;
  workerId?: string;
  siteId?: string | null;
  date?: string;
  status?: string;
  reason?: string;
  createdAt?: { seconds?: number };
  reviewedAt?: { seconds?: number };
  overtimeCheckIn?: {
    time?: { seconds?: number };
    gps?: { latitude?: number; longitude?: number; accuracyM?: number };
    photoUrl?: string;
  } | null;
  overtimeCheckOut?: {
    time?: { seconds?: number };
    gps?: { latitude?: number; longitude?: number; accuracyM?: number };
    photoUrl?: string;
  } | null;
};

type Insights = {
  site: { id: string; name: string };
  assignedWorkers: { id: string; name: string; email: string; role: string }[];
  activeAtSite: { workerId: string; name: string; email: string; hasOpenSession: boolean }[];
  today: string;
  siteSwitchStats: { switchesIntoSite: number; switchesOutOfSite: number };
  photoEvidence: {
    workerId: string;
    name: string;
    email: string;
    photos: PhotoEntry[];
  }[];
};

function photoKindLabel(kind: PhotoEntry["kind"]) {
  switch (kind) {
    case "check_in":
      return "Check-in";
    case "site_switch":
      return "Site switch";
    case "check_out":
      return "Check-out";
    default:
      return kind;
  }
}

export function AdminSiteDetail({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [sites, setSites] = React.useState<Site[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Site | null>(null);
  const [deleteDoneName, setDeleteDoneName] = React.useState<string | null>(null);
  const [insights, setInsights] = React.useState<Insights | null>(null);
  const [insightsLoading, setInsightsLoading] = React.useState(false);
  const [insightsErr, setInsightsErr] = React.useState<string | null>(null);
  const [detailTab, setDetailTab] = React.useState<
    "overview" | "edit" | "photos" | "overtime"
  >("overview");
  const [overtimeRows, setOvertimeRows] = React.useState<OvertimeRow[]>([]);
  const [overtimeLoading, setOvertimeLoading] = React.useState(false);
  const [overtimeErr, setOvertimeErr] = React.useState<string | null>(null);

  const selectedSite = React.useMemo(
    () => sites.find((s) => s.id === siteId) ?? null,
    [sites, siteId]
  );

  const load = React.useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/sites", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { sites?: Site[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load sites");
      setSites(data.sites ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setSites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const jumpSites = React.useMemo(
    () =>
      sites
        .map((s) => {
          const lat = Number(s.latitude);
          const lng = Number(s.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          const name =
            typeof s.name === "string" && s.name.trim() ? s.name.trim() : s.id;
          return { id: s.id, name, latitude: lat, longitude: lng };
        })
        .filter((x): x is { id: string; name: string; latitude: number; longitude: number } => x != null),
    [sites]
  );

  const loadOvertimeForSite = React.useCallback(async (siteId: string) => {
    setOvertimeErr(null);
    setOvertimeLoading(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch(
        `/api/overtime?siteId=${encodeURIComponent(siteId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = (await res.json()) as { items?: OvertimeRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load overtime");
      const rows = (data.items ?? []).slice().sort((a, b) => {
        const as = a.createdAt?.seconds ?? 0;
        const bs = b.createdAt?.seconds ?? 0;
        return bs - as;
      });
      setOvertimeRows(rows);
    } catch (e) {
      setOvertimeErr(e instanceof Error ? e.message : "Failed");
      setOvertimeRows([]);
    } finally {
      setOvertimeLoading(false);
    }
  }, []);

  const loadInsights = React.useCallback(async (siteId: string) => {
    setInsightsErr(null);
    setInsightsLoading(true);
    setInsights(null);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch(
        `/api/admin/site-insights?siteId=${encodeURIComponent(siteId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = (await res.json()) as Insights & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load details");
      setInsights({
        ...data,
        photoEvidence: Array.isArray(data.photoEvidence) ? data.photoEvidence : [],
      });
    } catch (e) {
      setInsightsErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    setDetailTab("overview");
    void loadInsights(siteId);
  }, [siteId, loadInsights]);

  React.useEffect(() => {
    if (detailTab !== "overtime") return;
    void loadOvertimeForSite(siteId);
  }, [siteId, detailTab, loadOvertimeForSite]);

  const runDelete = async (site: Site) => {
    setDeletingId(site.id);
    setErr(null);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/sites", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ siteId: site.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      const label = typeof site.name === "string" ? site.name : site.id;
      setDeleteDoneName(label);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {deleteTarget ? (
        <ConfirmActionModal
          open
          tone="danger"
          title="Delete this site?"
          description={
            <>
              <p>
                Permanently delete <strong>&ldquo;{typeof deleteTarget.name === "string" ? deleteTarget.name : deleteTarget.id}&rdquo;</strong>? Workers assigned only to this site may need reassignment. Attendance history that references this site id may still exist.
              </p>
            </>
          }
          confirmLabel="Delete site"
          busy={deletingId === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const s = deleteTarget;
            setDeleteTarget(null);
            void runDelete(s);
          }}
        />
      ) : null}

      {deleteDoneName ? (
        <ResultModal
          open
          variant="success"
          title="Site deleted"
          description={`“${deleteDoneName}” was removed from the site list.`}
          onDismiss={() => {
            setDeleteDoneName(null);
            router.push("/dashboard/admin/sites");
          }}
        />
      ) : null}

      {loading ? (
        <div className="space-y-4" aria-hidden>
          <Skeleton className="h-10 w-full max-w-md rounded-lg" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : err ? (
        <p className="text-sm text-red-400">{err}</p>
      ) : !selectedSite ? (
        <Card>
          <CardHeader>
            <CardTitle>Site not found</CardTitle>
            <CardDescription>
              No site matches this link. It may have been deleted or the URL is wrong.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="secondary" asChild>
              <Link href="/dashboard/admin/sites">← Back to all sites</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-cyan-500/20">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <Button type="button" variant="secondary" size="sm" asChild>
                  <Link href="/dashboard/admin/sites">← All sites</Link>
                </Button>
                <CardTitle className="text-base">Site details</CardTitle>
                <CardDescription>
                  Data for attendance day{" "}
                  <span className="font-mono text-zinc-800 dark:text-zinc-300">{insights?.today ?? "…"}</span>.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                disabled={deletingId === selectedSite.id}
                onClick={() => setDeleteTarget(selectedSite)}
              >
                <Trash2 className="size-4" aria-hidden />
                Delete site
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 border-b border-zinc-200/80 pb-3 dark:border-white/10">
              <button
                type="button"
                onClick={() => setDetailTab("overview")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  detailTab === "overview"
                    ? "bg-zinc-200 text-zinc-900 dark:bg-white/10 dark:text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-white/5 dark:hover:text-zinc-300"
                )}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setDetailTab("edit")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  detailTab === "edit"
                    ? "bg-zinc-200 text-zinc-900 dark:bg-white/10 dark:text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-white/5 dark:hover:text-zinc-300"
                )}
              >
                Edit site
              </button>
              <button
                type="button"
                onClick={() => setDetailTab("photos")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  detailTab === "photos"
                    ? "bg-zinc-200 text-zinc-900 dark:bg-white/10 dark:text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-white/5 dark:hover:text-zinc-300"
                )}
              >
                Today&apos;s selfies
              </button>
              <button
                type="button"
                onClick={() => setDetailTab("overtime")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  detailTab === "overtime"
                    ? "bg-zinc-200 text-zinc-900 dark:bg-white/10 dark:text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-white/5 dark:hover:text-zinc-300"
                )}
              >
                Overtime
              </button>
            </div>

            {detailTab === "edit" && selectedSite ? (
              <AdminEditSiteForm
                key={selectedSite.id}
                site={selectedSite}
                onSaved={() => {
                  void load();
                  void loadInsights(siteId);
                }}
              />
            ) : detailTab === "overtime" ? (
              <div className="space-y-4">
                <p className="text-xs text-zinc-600 dark:text-zinc-500">
                  Overtime requests tied to this site (all statuses). Open the{" "}
                  <span className="text-zinc-800 dark:text-zinc-400">Admin → Overtime</span> page to approve
                  or reject.
                </p>
                {overtimeLoading ? (
                  <div className="space-y-2" aria-hidden>
                    <Skeleton className="h-24 rounded-xl" />
                    <Skeleton className="h-24 rounded-xl" />
                  </div>
                ) : overtimeErr ? (
                  <p className="text-sm text-red-400">{overtimeErr}</p>
                ) : overtimeRows.length === 0 ? (
                  <p className="text-sm text-zinc-500">No overtime records for this site yet.</p>
                ) : (
                  <ul className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                    {overtimeRows.map((row) => {
                      const inTs = row.overtimeCheckIn?.time;
                      const outTs = row.overtimeCheckOut?.time;
                      const inSec = getFirestoreSeconds(inTs);
                      const outSec = getFirestoreSeconds(outTs);
                      const hasIn = inSec != null;
                      const hasOut = outSec != null;
                      return (
                        <li
                          key={row.id}
                          className="rounded-xl border border-violet-500/15 bg-violet-500/[0.04] p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                                {row.workerName ?? row.workerEmail ?? row.workerId ?? "Worker"}
                              </p>
                              <p className="text-xs text-zinc-500">{row.workerEmail ?? "—"}</p>
                            </div>
                            <span
                              className={
                                row.status === "approved"
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : row.status === "rejected"
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-amber-800 dark:text-amber-200"
                              }
                            >
                              {row.status ?? "pending"}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-zinc-500">
                            Work date{" "}
                            <span className="font-mono text-zinc-800 dark:text-zinc-400">{row.date ?? "—"}</span>
                          </p>
                          {row.reason ? (
                            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{row.reason}</p>
                          ) : null}
                          {row.status === "approved" ? (
                            <div className="mt-2 space-y-1 border-t border-zinc-200/80 pt-2 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-400">
                              {hasIn ? (
                                <p>
                                  In:{" "}
                                  {formatInstantDateTime12hInZone(
                                    inSec! * 1000,
                                    DEFAULT_ATTENDANCE_TIME_ZONE,
                                    { withSeconds: true, withTimeZoneName: true }
                                  )}
                                  {row.overtimeCheckIn?.photoUrl ? (
                                    <>
                                      {" "}
                                      ·{" "}
                                      <a
                                        href={row.overtimeCheckIn.photoUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-cyan-700 underline dark:text-cyan-400"
                                      >
                                        selfie
                                      </a>
                                    </>
                                  ) : null}
                                </p>
                              ) : (
                                <p className="text-amber-900 dark:text-amber-200/80">No overtime check-in yet.</p>
                              )}
                              {hasOut ? (
                                <p>
                                  Out:{" "}
                                  {formatInstantDateTime12hInZone(
                                    outSec! * 1000,
                                    DEFAULT_ATTENDANCE_TIME_ZONE,
                                    { withSeconds: true, withTimeZoneName: true }
                                  )}
                                  {row.overtimeCheckOut?.photoUrl ? (
                                    <>
                                      {" "}
                                      ·{" "}
                                      <a
                                        href={row.overtimeCheckOut.photoUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-cyan-700 underline dark:text-cyan-400"
                                      >
                                        selfie
                                      </a>
                                    </>
                                  ) : null}
                                </p>
                              ) : hasIn ? (
                                <p className="text-amber-900 dark:text-amber-200/80">Awaiting check-out.</p>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : insightsLoading ? (
              <div className="grid gap-3 sm:grid-cols-3" aria-hidden>
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
              </div>
            ) : insightsErr ? (
              <p className="text-sm text-red-400">{insightsErr}</p>
            ) : insights && detailTab === "overview" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <p className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                      Assigned workers
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-white">
                      {insights.assignedWorkers.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <p className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                      Checked in here now
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-800 dark:text-emerald-300">
                      {insights.activeAtSite.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <p className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                      Switches (today)
                    </p>
                    <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-300">
                      <span className="text-cyan-800 dark:text-cyan-300">In</span>{" "}
                      {insights.siteSwitchStats.switchesIntoSite} ·{" "}
                      <span className="text-amber-800 dark:text-amber-300">Out</span>{" "}
                      {insights.siteSwitchStats.switchesOutOfSite}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                      Assigned to this site
                    </h4>
                    {insights.assignedWorkers.length === 0 ? (
                      <p className="text-sm text-zinc-500">No workers have this site in assignedSites.</p>
                    ) : (
                      <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                        {insights.assignedWorkers.map((w) => (
                          <li
                            key={w.id}
                            className="rounded-lg bg-zinc-100/90 px-3 py-1.5 dark:bg-white/[0.04]"
                          >
                            <span className="font-medium text-zinc-900 dark:text-zinc-200">
                              {w.name || w.id}
                            </span>
                            <span className="ml-2 text-xs text-zinc-500">{w.email}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                      Open session at this site
                    </h4>
                    {insights.activeAtSite.length === 0 ? (
                      <p className="text-sm text-zinc-500">Nobody currently checked in at this site.</p>
                    ) : (
                      <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                        {insights.activeAtSite.map((w) => (
                          <li key={w.workerId} className="rounded-lg bg-emerald-500/10 px-3 py-1.5">
                            <span className="font-medium text-emerald-950 dark:text-emerald-100">
                              {w.name}
                            </span>
                            <span className="ml-2 text-xs text-emerald-900/90 dark:text-emerald-200/70">
                              {w.email}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="border-t border-zinc-200/80 pt-6 dark:border-white/10">
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                    Live GPS at this site
                  </h4>
                  <p className="mb-3 text-xs text-zinc-500">
                    Only workers whose last reported position falls inside this site&apos;s geofence appear
                    on the map. Open fullscreen for a larger view.
                  </p>
                  <LiveWorkersMap
                    key={siteId}
                    siteId={siteId}
                    embedded
                    height={440}
                    pollMs={15_000}
                    jumpSites={jumpSites}
                  />
                </div>
              </>
            ) : insights && detailTab === "photos" ? (
              <div className="space-y-6">
                <p className="text-xs text-zinc-500">
                  Uploaded photos for this site on calendar day {insights.today}: check-in, site
                  switch
                  arrivals, and check-out while at this site.
                </p>
                {insights.photoEvidence.length === 0 ? (
                  <p className="text-sm text-zinc-500">No selfie records for this site today yet.</p>
                ) : (
                  insights.photoEvidence.map((row) => (
                    <div
                      key={row.workerId}
                      className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-4 dark:border-white/10 dark:bg-white/[0.02]"
                    >
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{row.name}</p>
                      <p className="text-xs text-zinc-500">{row.email}</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {row.photos.map((ph, i) => (
                          <div
                            key={`${ph.photoUrl}-${i}`}
                            className="overflow-hidden rounded-lg border border-white/10 bg-black/30"
                          >
                            <img
                              src={ph.photoUrl}
                              alt={`${photoKindLabel(ph.kind)} — ${row.name}`}
                              className="aspect-[4/3] w-full object-cover"
                              loading="lazy"
                            />
                            <div className="flex flex-wrap items-center justify-between gap-1 px-2 py-1.5 text-[10px] text-zinc-400">
                              <span className="text-cyan-300/90">{photoKindLabel(ph.kind)}</span>
                              {typeof ph.atMs === "number" ? (
                                <span>
                                  {formatInstantTime12hInZone(ph.atMs, DEFAULT_ATTENDANCE_TIME_ZONE, {
                                    withSeconds: true,
                                    withTimeZoneName: true,
                                  })}
                                </span>
                              ) : (
                                <span>—</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
