import { Suspense } from "react";
import { AdminUsersPanel } from "@/components/client/admin-users-panel";
import { TableRowsSkeleton } from "@/components/client/dashboard-skeletons";

function WorkersBody() {
  return <AdminUsersPanel />;
}

export default function AdminWorkersPage() {
  return (
    <div className="p-3 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Employee List</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Directory, password reset links, and attendance calendar (use{" "}
          <strong className="text-zinc-400">Attendance calendar</strong> or <strong className="text-zinc-400">View</strong> on a row).
        </p>
      </div>
      <Suspense
        fallback={
          <div className="rounded-xl border border-white/10 p-4">
            <TableRowsSkeleton rows={8} />
          </div>
        }
      >
        <WorkersBody />
      </Suspense>
    </div>
  );
}
