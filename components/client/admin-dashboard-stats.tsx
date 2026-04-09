"use client";

import * as React from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type AdminDashboardMetrics = {
  activeWorkers: number;
  totalCheckIns: number;
  completed: number;
  pending: number;
  lateArrivals: number;
  completionRate: number;
};

const defaultStats: AdminDashboardMetrics = {
  activeWorkers: 0,
  totalCheckIns: 0,
  completed: 0,
  pending: 0,
  lateArrivals: 0,
  completionRate: 0,
};

type MetricsCtx = {
  loading: boolean;
  err: string | null;
  stats: AdminDashboardMetrics;
  reload: () => void;
};

const Ctx = React.createContext<MetricsCtx | null>(null);

function useAdminMetrics(): MetricsCtx {
  const v = React.useContext(Ctx);
  if (!v) {
    throw new Error("useAdminMetrics must be used within AdminDashboardMetricsProvider");
  }
  return v;
}

async function fetchDashboardStats(token: string): Promise<AdminDashboardMetrics> {
  const res = await fetch("/api/admin/dashboard-stats", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as Partial<AdminDashboardMetrics> & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to load stats");
  }
  return {
    activeWorkers: Number(data.activeWorkers ?? 0),
    totalCheckIns: Number(data.totalCheckIns ?? 0),
    completed: Number(data.completed ?? 0),
    pending: Number(data.pending ?? 0),
    lateArrivals: Number(data.lateArrivals ?? 0),
    completionRate: Number(data.completionRate ?? 0),
  };
}

export function AdminDashboardMetricsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [stats, setStats] = React.useState<AdminDashboardMetrics>(defaultStats);

  const loadRef = React.useRef<() => void>(() => {});

  const load = React.useCallback(() => {
    void loadRef.current();
  }, []);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    let cancelled = false;

    const run = async (u: User) => {
      setLoading(true);
      setErr(null);
      try {
        const token = await u.getIdToken();
        const next = await fetchDashboardStats(token);
        if (cancelled) return;
        setStats(next);
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "Failed to load stats");
        setStats(defaultStats);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadRef.current = () => {
      const u = auth.currentUser;
      if (u) void run(u);
    };

    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        if (!cancelled) {
          setLoading(false);
          setErr("Not signed in");
          setStats(defaultStats);
        }
        return;
      }
      void run(u);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const value = React.useMemo(
    () => ({ loading, err, stats, reload: load }),
    [loading, err, stats, load]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function AdminDashboardStats() {
  const { loading, err, stats: s, reload } = useAdminMetrics();

  if (err) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <p className="font-medium">Could not load dashboard stats</p>
        <p className="mt-1 opacity-90">{err}</p>
        <button
          type="button"
          className="mt-3 rounded-md bg-red-900 px-3 py-1.5 text-white text-xs dark:bg-red-800"
          onClick={() => reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  const statSlot = (value: number) =>
    loading ? <Skeleton className="h-9 w-16" /> : <span>{value}</span>;

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle>Active workers</CardTitle>
          <CardDescription>Live GPS pings (&lt; 2 minutes)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold">{statSlot(s.activeWorkers)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Check-ins today</CardTitle>
          <CardDescription>All workers who checked in</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold">{statSlot(s.totalCheckIns)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Completed</CardTitle>
          <CardDescription>Checked in + checked out</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold">{statSlot(s.completed)}</div>
          {!loading && (
            <div className="mt-2 text-sm text-zinc-400">
              {s.completionRate}% completion
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Late arrivals</CardTitle>
          <CardDescription>Dev threshold: after 09:00 local</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold">{statSlot(s.lateArrivals)}</div>
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminPendingCheckoutsCard() {
  const { loading, stats: s } = useAdminMetrics();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending check-outs</CardTitle>
        <CardDescription>Checked in but not checked out yet</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">
          {loading ? <Skeleton className="h-9 w-12" /> : s.pending}
        </div>
      </CardContent>
    </Card>
  );
}