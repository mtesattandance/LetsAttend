import { redirect } from "next/navigation";

export default function EmployeeOffsiteRedirectPage() {
  redirect("/dashboard/employee/requests/offsite");
}
