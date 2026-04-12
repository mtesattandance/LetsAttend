"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminCreateSiteForm } from "@/components/client/admin-create-site-form";
import { AdminSitesPanel } from "@/components/client/admin-sites-panel";
import { cn } from "@/lib/utils";
import { CardBlockSkeleton } from "@/components/client/dashboard-skeletons";
import { SiteAttendanceWagesPanel } from "@/components/client/site-attendance-wages-panel";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { ClipboardList } from "lucide-react";

// ─── Site selector for the attendance tab ─────────────────────────────────────

type SiteOption = { id: string; name: string };

function SiteAttendanceTab() {
  const [sites, setSites] = React.useState<SiteOption[]>([]);
  const [loadingSites, setLoadingSites] = React.useState(true);
  const [selectedSiteId, setSelectedSiteId] = React.useState<string>("");

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoadingSites(true);
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) return;
        const token = await u.getIdToken();
        const res = await fetch("/api/sites", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as { sites?: { id: string; name?: string }[] };
        if (cancelled) return;
        const list = (data.sites ?? []).map((s) => ({
          id: s.id,
          name: typeof s.name === "string" && s.name.trim() ? s.name.trim() : s.id,
        }));
        list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
        setSites(list);
        if (list.length > 0 && !selectedSiteId) setSelectedSiteId(list[0]!.id);
      } finally {
        if (!cancelled) setLoadingSites(false);
      }
    };
    void run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = sites.find((s) => s.id === selectedSiteId) ?? null;

  return (
    <div className="space-y-5">
      {/* Site selector */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Select Site
        </label>
        {loadingSites ? (
          <div className="h-10 w-64 animate-pulse rounded-lg bg-zinc-200 dark:bg-white/10" />
        ) : sites.length === 0 ? (
          <p className="text-sm text-zinc-500">No sites found. Create one in the "Create site" tab.</p>
        ) : (
          <select
            id="site-attendance-select"
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            className="h-10 min-w-[220px] rounded-lg border border-zinc-200 bg-white px-3 text-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Panel */}
      {selected ? (
        <SiteAttendanceWagesPanel
          key={selected.id}
          siteId={selected.id}
          siteName={selected.name}
        />
      ) : !loadingSites && sites.length > 0 ? (
        <p className="text-sm text-zinc-500">Select a site above to view its attendance record.</p>
      ) : null}
    </div>
  );
}

// ─── Main page content ────────────────────────────────────────────────────────

type Tab = "attendance" | "browse" | "create";

function AdminSitesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const siteFromQuery = searchParams.get("site")?.trim() ?? "";
  const [reloadToken, setReloadToken] = React.useState(0);
  const [tab, setTab] = React.useState<Tab>("attendance");

  React.useEffect(() => {
    if (siteFromQuery) setTab("browse");
  }, [siteFromQuery]);

  /** Legacy `?site=` deep links → dedicated site detail route. */
  React.useEffect(() => {
    if (!siteFromQuery) return;
    router.replace(`/dashboard/admin/sites/${encodeURIComponent(siteFromQuery)}`);
  }, [siteFromQuery, router]);

  if (siteFromQuery) {
    return <CardBlockSkeleton lines={3} />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "attendance", label: "Site Attendance" },
    { id: "browse",     label: "All Sites" },
    { id: "create",     label: "Create Site" },
  ];

  return (
    <>
      {/* Tab bar */}
      <div className="mb-6 flex flex-wrap gap-2 border-b border-zinc-200/90 pb-3 dark:border-white/10">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? t.id === "attendance"
                  ? "bg-cyan-600 text-white dark:bg-cyan-500"
                  : "bg-zinc-200 text-zinc-900 dark:bg-white/10 dark:text-white"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-white/5 dark:hover:text-zinc-300"
            )}
          >
            {t.id === "attendance" && <ClipboardList className="size-3.5" />}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "attendance" ? (
        <SiteAttendanceTab />
      ) : tab === "browse" ? (
        <AdminSitesPanel reloadToken={reloadToken} />
      ) : (
        <AdminCreateSiteForm
          onCreated={() => {
            setReloadToken((n) => n + 1);
            setTab("browse");
          }}
        />
      )}
    </>
  );
}

export default function AdminSitesPage() {
  return (
    <div className="p-3 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sites</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          View attendance records with wages per site, browse all work locations, or create a new site.
        </p>
      </div>

      <Suspense fallback={<CardBlockSkeleton lines={3} />}>
        <AdminSitesContent />
      </Suspense>
    </div>
  );
}
