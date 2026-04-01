import {
  AdminDashboardMetricsProvider,
  AdminDashboardStats,
  AdminPendingCheckoutsCard,
} from "@/components/client/admin-dashboard-stats";
import { AdminAssignSitesForm } from "@/components/client/admin-assign-sites-form";
import { AdminSearchHub } from "@/components/client/admin-search-hub";
import { AdminCalendarModeToggle } from "@/components/client/admin-calendar-mode-toggle";

export default function AdminOverviewPage() {
  return (
    <AdminDashboardMetricsProvider>
      <div className="p-3 md:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Today’s attendance snapshot and pending check-outs.
            </p>
          </div>
          <AdminCalendarModeToggle />
        </div>

        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Quick search
          </h2>
          <AdminSearchHub />
        </div>

        <div className="mb-8 max-w-xl">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Workers & sites
          </h2>
          <AdminAssignSitesForm />
        </div>

        <AdminDashboardStats />

        <div className="mt-6 max-w-md">
          <AdminPendingCheckoutsCard />
        </div>
      </div>
    </AdminDashboardMetricsProvider>
  );
}
