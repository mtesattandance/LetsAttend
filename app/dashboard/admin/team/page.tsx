import { AdminAddAdminForm } from "@/components/client/admin-add-admin-form";
import { RequireRole } from "@/components/client/require-role";

export default function AdminTeamPage() {
  return (
    <RequireRole allowedRoles={["super_admin"]} fallbackTo="/dashboard/admin">
      <div className="p-3 md:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Team & roles</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Only the super admin (see <code className="text-zinc-400">SUPER_ADMIN_EMAIL</code>) can add
            or remove admins. Regular admins do not see this page.
          </p>
        </div>
        <div className="max-w-lg">
          <AdminAddAdminForm />
        </div>
      </div>
    </RequireRole>
  );
}
