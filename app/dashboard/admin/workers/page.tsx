import { AdminUsersPanel } from "@/components/client/admin-users-panel";

export default function AdminWorkersPage() {
  return (
    <div className="p-3 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Workers</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Directory, password reset links, and per-user attendance calendars.
        </p>
      </div>
      <AdminUsersPanel />
    </div>
  );
}
