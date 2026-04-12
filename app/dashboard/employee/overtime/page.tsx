import { redirect } from "next/navigation";

export default function EmployeeOvertimeRedirectPage() {
  redirect("/dashboard/employee/requests/overtime");
}
