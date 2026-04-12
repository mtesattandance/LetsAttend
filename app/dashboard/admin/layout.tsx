import { RequireRole } from "@/components/client/require-role";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireRole allowedRoles={["admin", "super_admin"]} fallbackTo="/dashboard/employee/check-in">
      {children}
    </RequireRole>
  );
}

