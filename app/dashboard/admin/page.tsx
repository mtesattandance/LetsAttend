import {
  AdminDashboardMetricsProvider,
  AdminDashboardStats,
  AdminPendingCheckoutsCard,
} from "@/components/client/admin-dashboard-stats";

export default function AdminOverviewPage() {
  return (
    <AdminDashboardMetricsProvider>
      <div className="p-3 md:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Today’s attendance snapshot and pending check-outs.
          </p>
        </div>

        <AdminDashboardStats />

        <div className="mt-6 max-w-md">
          <AdminPendingCheckoutsCard />
        </div>
      </div>
    </AdminDashboardMetricsProvider>
  );
}
