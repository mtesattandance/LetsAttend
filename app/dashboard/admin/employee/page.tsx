import { AdminEmployeeHub } from "@/components/client/admin-employee-hub";

export const metadata = {
  title: "Employee — Admin | LetsAttend",
  description: "View attendance, salary and manage employee data",
};

export default function AdminEmployeePage() {
  return <AdminEmployeeHub />;
}
