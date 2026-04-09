"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const TABLE_PAGE_SIZE = 15;

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
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Site | null>(null);
  const [bulkDeleteTargets, setBulkDeleteTargets] = React.useState<Site[] | null>(null);
  const [deleteDoneName, setDeleteDoneName] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [page, setPage] = React.useState(1);

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

  const filteredSites = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter((s) => {
      const name = typeof s.name === "string" ? s.name.toLowerCase() : "";
      const id = s.id.toLowerCase();
      const lat = typeof s.latitude === "number" ? String(s.latitude) : "";
      const lng = typeof s.longitude === "number" ? String(s.longitude) : "";
      const rad = typeof s.radius === "number" ? String(s.radius) : "";
      return (
        name.includes(q) ||
        id.includes(q) ||
        lat.includes(q) ||
        lng.includes(q) ||
        rad.includes(q)
      );
    });
  }, [sites, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredSites.length / TABLE_PAGE_SIZE));
  const paginatedSites = React.useMemo(
    () => filteredSites.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE),
    [filteredSites, page]
  );

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const pageIds = React.useMemo(() => paginatedSites.map((s) => s.id), [paginatedSites]);
  const allPageSelected =
    paginatedSites.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const toggleSelectAllPage = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...pageIds])]);
    }
  };

  const deleteSiteRequest = async (site: Site) => {
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
  };

  const runDelete = async (site: Site) => {
    setDeletingId(site.id);
    setErr(null);
    try {
      await deleteSiteRequest(site);
      const label = typeof site.name === "string" ? site.name : site.id;
      setDeleteDoneName(label);
      setSelectedIds((prev) => prev.filter((id) => id !== site.id));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const runBulkDelete = async (list: Site[]) => {
    setBulkDeleting(true);
    setErr(null);
    try {
      for (const site of list) {
        await deleteSiteRequest(site);
      }
      setDeleteDoneName(`${list.length} site${list.length === 1 ? "" : "s"}`);
      setSelectedIds((prev) => prev.filter((id) => !list.some((s) => s.id === id)));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBulkDeleting(false);
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
      {bulkDeleteTargets && bulkDeleteTargets.length > 0 ? (
        <ConfirmActionModal
          open
          tone="danger"
          title={`Delete ${bulkDeleteTargets.length} site${bulkDeleteTargets.length === 1 ? "" : "s"}?`}
          description={
            <>
              <p>
                Permanently delete the selected site{bulkDeleteTargets.length === 1 ? "" : "s"}. Workers
                assigned only to these sites may need reassignment. Attendance history that references these
                site ids may still exist.
              </p>
              <ul className="mt-2 max-h-32 list-inside list-disc overflow-y-auto text-sm text-zinc-300">
                {bulkDeleteTargets.slice(0, 12).map((s) => (
                  <li key={s.id}>{typeof s.name === "string" ? s.name : s.id}</li>
                ))}
                {bulkDeleteTargets.length > 12 ? (
                  <li className="list-none text-zinc-500">…and {bulkDeleteTargets.length - 12} more</li>
                ) : null}
              </ul>
            </>
          }
          confirmLabel={`Delete ${bulkDeleteTargets.length}`}
          busy={bulkDeleting}
          onCancel={() => setBulkDeleteTargets(null)}
          onConfirm={() => {
            const list = bulkDeleteTargets;
            setBulkDeleteTargets(null);
            void runBulkDelete(list);
          }}
        />
      ) : null}

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
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <Input
                type="search"
                placeholder="Search sites by name, id, coordinates…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 pl-9 dark:bg-zinc-950"
                aria-label="Search sites"
              />
            </div>
            {selectedIds.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-zinc-500">{selectedIds.length} selected</span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={bulkDeleting}
                  onClick={() => {
                    const list = sites.filter((s) => selectedIds.includes(s.id));
                    if (list.length === 0) return;
                    setBulkDeleteTargets(list);
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
                  onClick={() => setSelectedIds([])}
                >
                  Clear
                </Button>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2" aria-hidden>
              {Array.from({ length: TABLE_PAGE_SIZE }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          ) : err ? (
            <p className="text-sm text-red-400">{err}</p>
          ) : sites.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No sites yet. Create one below or on this page.</p>
          ) : filteredSites.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No sites match your search.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200/80 dark:border-white/10">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm tabular-nums">
                <thead className="border-b border-zinc-200/80 bg-zinc-100/80 text-xs uppercase tracking-wide text-zinc-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-500">
                  <tr>
                    <th className="w-10 px-2 py-2 font-medium">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-zinc-400 accent-cyan-600"
                        checked={allPageSelected}
                        onChange={toggleSelectAllPage}
                        aria-label="Select all sites on this page"
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Lat</th>
                    <th className="px-3 py-2 font-medium">Lng</th>
                    <th className="px-3 py-2 font-medium">Radius (m)</th>
                    <th className="px-3 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSites.map((s) => (
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
                      <td
                        className="px-2 py-2.5"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="size-4 rounded border-zinc-400 accent-cyan-600"
                          checked={selectedIds.includes(s.id)}
                          onChange={() => toggleSelect(s.id)}
                          aria-label={`Select ${typeof s.name === "string" ? s.name : s.id}`}
                        />
                      </td>
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
              {totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200/80 bg-zinc-50/50 px-3 py-2.5 text-sm dark:border-white/10 dark:bg-white/[0.02]">
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Showing {(page - 1) * TABLE_PAGE_SIZE + 1}–
                    {Math.min(page * TABLE_PAGE_SIZE, filteredSites.length)} of {filteredSites.length}
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
                <div className="border-t border-zinc-200/80 px-3 py-2 text-xs text-zinc-500 dark:border-white/10">
                  Showing 1–{filteredSites.length} of {filteredSites.length} ({TABLE_PAGE_SIZE} per page)
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
