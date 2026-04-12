import { redirect } from "next/navigation";

export default function AdminOffsiteRedirectPage() {
  redirect("/dashboard/admin/requests?tab=offsite");
}
