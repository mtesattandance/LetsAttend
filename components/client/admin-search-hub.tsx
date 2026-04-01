"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Search, X } from "lucide-react";
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
import { getFirebaseAuth } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type UserRow = {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  role: string;
  assignedSites?: string[];
};
type SiteRow = { id: string; name?: string };

export function AdminSearchHub() {
  const router = useRouter();
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [sites, setSites] = React.useState<SiteRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [qWorker, setQWorker] = React.useState("");
  const [qSite, setQSite] = React.useState("");
  const [workerModal, setWorkerModal] = React.useState<UserRow | null>(null);
  const [assignWorker, setAssignWorker] = React.useState<UserRow | null>(null);
  const [siteModal, setSiteModal] = React.useState<SiteRow | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setErr(null);
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) throw new Error("Not signed in");
        const token = await u.getIdToken();
        const [uRes, sRes] = await Promise.all([
          fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/sites", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const uData = (await uRes.json()) as { users?: UserRow[]; error?: string };
        const sData = (await sRes.json()) as { sites?: SiteRow[]; error?: string };
        if (!uRes.ok) throw new Error(uData.error ?? "Failed to load users");
        if (!sRes.ok) throw new Error(sData.error ?? "Failed to load sites");
        if (cancelled) return;
        setUsers(uData.users ?? []);
        setSites(sData.sites ?? []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const ql = qWorker.trim().toLowerCase();
  const workersFiltered = ql
    ? users.filter(
        (r) =>
          r.name.toLowerCase().includes(ql) ||
          r.email.toLowerCase().includes(ql) ||
          r.id.toLowerCase().includes(ql)
      )
    : users;

  const qs = qSite.trim().toLowerCase();
  const sitesFiltered = qs
    ? sites.filter((s) => {
        const n = typeof s.name === "string" ? s.name : "";
        return n.toLowerCase().includes(qs) || s.id.toLowerCase().includes(qs);
      })
    : sites;

  return (
    <>
      <AssignWorkSitesModal
        worker={assignWorker}
        open={assignWorker != null}
        onOpenChange={(open) => {
          if (!open) setAssignWorker(null);
        }}
        onSaved={() => {
          void (async () => {
            try {
              const auth = getFirebaseAuth();
              const u = auth.currentUser;
              if (!u) return;
              const token = await u.getIdToken();
              const uRes = await fetch("/api/admin/users", {
                headers: { Authorization: `Bearer ${token}` },
              });
              const uData = (await uRes.json()) as { users?: UserRow[]; error?: string };
              if (uRes.ok) setUsers(uData.users ?? []);
            } catch {
              /* ignore */
            }
          })();
        }}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Search workers</CardTitle>
            <CardDescription>
              Find by employee ID, name, or email. Open a profile to see the attendance calendar; day cells use the
              same timeline as the Workers page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="search"
                placeholder="Search workers…"
                className="w-full rounded-xl border border-zinc-200/90 bg-white/90 py-2 pl-10 pr-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-black/40 dark:text-inherit"
                value={qWorker}
                onChange={(e) => setQWorker(e.target.value)}
                disabled={loading}
              />
            </div>
            {loading ? (
              <div className="space-y-2" aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : err ? (
              <p className="text-sm text-red-400">{err}</p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-zinc-200/80 bg-zinc-50/90 p-2 dark:border-white/10 dark:bg-white/[0.02]">
                {workersFiltered.length === 0 ? (
                  <li className="px-2 py-3 text-sm text-zinc-500">No matches.</li>
                ) : (
                  workersFiltered.slice(0, 40).map((r) => (
                    <li key={r.id}>
                      <div
                        className={cn(
                          "flex items-stretch gap-2 rounded-lg px-2 py-1.5 transition-colors",
                          "hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                        )}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 flex-col items-start rounded-md px-0 py-0 text-left text-sm"
                          onClick={() => setWorkerModal(r)}
                        >
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {r.employeeId?.trim()
                              ? `${r.employeeId} (${r.name || "Employee"})`
                              : r.name || "Employee"}
                          </span>
                        </button>
                        <div className="flex shrink-0 flex-col justify-center gap-1 sm:flex-row sm:items-center">
                          {r.role === "employee" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-8 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAssignWorker(r);
                              }}
                            >
                              Assign
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs text-cyan-700 hover:text-cyan-800 dark:text-cyan-400 dark:hover:text-cyan-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              setWorkerModal(r);
                            }}
                          >
                            View
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Search sites</CardTitle>
            <CardDescription>
              Find a work location. Open to jump to the full Sites pipeline for that location.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="search"
                placeholder="Search sites…"
                className="w-full rounded-xl border border-zinc-200/90 bg-white/90 py-2 pl-10 pr-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-black/40 dark:text-inherit"
                value={qSite}
                onChange={(e) => setQSite(e.target.value)}
                disabled={loading}
              />
            </div>
            {loading ? (
              <div className="space-y-2" aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : err ? (
              <p className="text-sm text-red-400">{err}</p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-zinc-200/80 bg-zinc-50/90 p-2 dark:border-white/10 dark:bg-white/[0.02]">
                {sitesFiltered.length === 0 ? (
                  <li className="px-2 py-3 text-sm text-zinc-500">No matches.</li>
                ) : (
                  sitesFiltered.slice(0, 40).map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm text-zinc-900 transition-colors hover:bg-zinc-100 dark:text-inherit dark:hover:bg-white/10"
                        onClick={() => setSiteModal(s)}
                      >
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {typeof s.name === "string" && s.name.trim() ? s.name : s.id}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {workerModal ? (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm dark:bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-label="Worker calendar"
        >
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
            <button
              type="button"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
              aria-label="Close"
              onClick={() => setWorkerModal(null)}
            >
              <X className="size-5" />
            </button>
            <div className="mb-4 pr-10">
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {workerModal.employeeId?.trim()
                  ? `${workerModal.employeeId} (${workerModal.name || "Employee"})`
                  : workerModal.name || "Employee"}
              </p>
            </div>
            <AttendanceCalendar
              workerId={workerModal.id}
              title="Attendance"
              description="Tap a day for the full timeline in work time (NPT), same as Workers."
              adminDayDetailBasePath="/dashboard/admin/workers"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" asChild>
                <Link href={`/dashboard/admin/workers?worker=${encodeURIComponent(workerModal.id)}`}>
                  Open in Workers
                </Link>
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setWorkerModal(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {siteModal ? (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm dark:bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-label="Site"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
            <button
              type="button"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10"
              aria-label="Close"
              onClick={() => setSiteModal(null)}
            >
              <X className="size-5" />
            </button>
            <h2 className="pr-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {typeof siteModal.name === "string" && siteModal.name.trim()
                ? siteModal.name
                : siteModal.id}
            </h2>
                        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              Open the Sites pipeline with this location selected — same detail tabs (overview, edit, photos,
              overtime, live map).
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => {
                  router.push(`/dashboard/admin/sites/${encodeURIComponent(siteModal.id)}`);
                  setSiteModal(null);
                }}
              >
                Open site details
              </Button>
              <Button type="button" variant="secondary" onClick={() => setSiteModal(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
