import { AdminAssignmentsPanel } from "@/components/client/admin-assignments-panel";
import { RequireRole } from "@/components/client/require-role";

export default function AdminAssignmentsPage() {
  return (
    <RequireRole allowedRoles={["admin", "super_admin"]} fallbackTo="/dashboard/employee/check-in">
      <div className="p-3 md:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Assignments</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            See which workers can use which sites for check-in and site switch.
          </p>
        </div>
        <AdminAssignmentsPanel />
      </div>
    </RequireRole>
  );
}
