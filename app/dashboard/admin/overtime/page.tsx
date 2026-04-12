import { redirect } from "next/navigation";

export default function AdminOvertimeRedirectPage() {
  redirect("/dashboard/admin/requests?tab=overtime");
}
