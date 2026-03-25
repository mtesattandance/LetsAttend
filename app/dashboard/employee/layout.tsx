import { RequireRole } from "@/components/client/require-role";

export default function EmployeeDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireRole
      allowedRoles={["employee", "admin", "super_admin"]}
      fallbackTo="/dashboard/admin"
    >
      {children}
    </RequireRole>
  );
}

