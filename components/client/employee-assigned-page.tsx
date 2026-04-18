"use client";

import * as React from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { workCheckInHrefFromAssignedSiteIds } from "@/lib/client/work-assignment-href";

type Site = { id: string; name?: string };

export function EmployeeAssignedPage() {
  const { user, loading: userLoading } = useDashboardUser();
  const [sites, setSites] = React.useState<Site[]>([]);
  const [loadingSites, setLoadingSites] = React.useState(true);

  const authHeaders = React.useCallback(async () => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    const token = await u.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadSites = React.useCallback(async () => {
    const h = await authHeaders();
    const res = await fetch("/api/sites", { headers: h });
    const data = (await res.json()) as { sites?: Site[] };
    if (res.ok) setSites(data.sites ?? []);
  }, [authHeaders]);

  React.useEffect(() => {
    let cancelled = false;
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) return;
      setLoadingSites(true);
      void loadSites()
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoadingSites(false);
        });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [loadSites]);

  const assigned = user?.assignedSites ?? [];
  const siteById = React.useMemo(() => {
    const m = new Map<string, Site>();
    for (const s of sites) m.set(s.id, s);
    return m;
  }, [sites]);

  if (userLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-3 sm:p-6 md:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-lg" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 md:p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Assigned work</h1>


        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="size-5 text-cyan-500/90" aria-hidden />
              Your assigned sites
            </CardTitle>

          </CardHeader>
          <CardContent className="space-y-4">
            {loadingSites ? (
              <div className="space-y-2">
                <Skeleton className="h-12 rounded-lg" />
                <Skeleton className="h-12 rounded-lg" />
              </div>
            ) : assigned.length === 0 ? (
              <p className="text-sm text-zinc-400">Nothing to show yet.</p>
            ) : (
              <ul className="space-y-2">
                {assigned.map((id) => {
                  const s = siteById.get(id);
                  const label = s?.name?.trim() ? s.name : id;
                  return (
                    <li
                      key={id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-2.5 text-sm dark:border-white/10 dark:bg-white/[0.02]"
                    >
                      <span className="font-medium text-zinc-100">{label}</span>
                      <span className="font-mono text-xs text-zinc-500">{id}</span>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap">
              {assigned.length > 0 ? (
                <Button asChild size="sm">
                  <Link href={workCheckInHrefFromAssignedSiteIds(assigned)}>
                    Assignment check-in (like Go to Work)
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="secondary" size="sm">
                <Link href="/dashboard/employee/check-in">Open Check in</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/employee/check-in">Jump to Check in</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
