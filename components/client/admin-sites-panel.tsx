"use client";

import * as React from "react";
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
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmActionModal, ResultModal } from "@/components/client/feedback-modals";
import { toast } from "sonner";

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

export function AdminSitesPanel({
  className,
  reloadToken = 0,
}: {
  className?: string;
  reloadToken?: number;
}) {
  const router = useRouter();
  const [sites, setSites] = React.useState<Site[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Site | null>(null);
  const [deleteDoneName, setDeleteDoneName] = React.useState<string | null>(null);

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
  }, [load, reloadToken]);

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
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const remove = (site: Site, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(site);
  };

  const openSite = (id: string) => {
    router.push(`/dashboard/admin/sites/${encodeURIComponent(id)}`);
  };

  return (
    <div className={cn("space-y-4", className)}>
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
          onDismiss={() => setDeleteDoneName(null)}
        />
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>All sites</CardTitle>
              <CardDescription>
                Open a row for assignments, live map, photos, and overtime for that site. Delete removes
                the site record only.
              </CardDescription>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2" aria-hidden>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          ) : err ? (
            <p className="text-sm text-red-400">{err}</p>
          ) : sites.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No sites yet. Create one below or on this page.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200/80 dark:border-white/10">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-zinc-200/80 bg-zinc-100/80 text-xs uppercase tracking-wide text-zinc-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Lat</th>
                    <th className="px-3 py-2 font-medium">Lng</th>
                    <th className="px-3 py-2 font-medium">Radius (m)</th>
                    <th className="px-3 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((s) => (
                    <tr
                      key={s.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => openSite(s.id)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          openSite(s.id);
                        }
                      }}
                      className="cursor-pointer border-b border-zinc-200/60 last:border-0 hover:bg-zinc-100/90 dark:border-white/5 dark:hover:bg-white/[0.04]"
                    >
                      <td className="px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-200">
                        {typeof s.name === "string" ? s.name : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">
                        {typeof s.latitude === "number" ? s.latitude.toFixed(5) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">
                        {typeof s.longitude === "number" ? s.longitude.toFixed(5) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">
                        {typeof s.radius === "number" ? s.radius : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          disabled={deletingId === s.id}
                          onClick={(e) => void remove(s, e)}
                          aria-label={`Delete ${s.name ?? s.id}`}
                        >
                          <Trash2 className="mr-1 size-4" />
                          {deletingId === s.id ? "…" : "Delete"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
