import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeOffsiteRequestPanel } from "@/components/client/employee-offsite-request-panel";

export default function EmployeeRequestsOffsitePage() {
  return (
    <div className="p-3 sm:p-6 md:p-8">
      <div className="mx-auto mb-6 flex max-w-2xl items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link href="/dashboard/employee/requests" aria-label="Back to requests">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Off-site</h1>
      </div>
      <div className="mx-auto max-w-2xl">
        <EmployeeOffsiteRequestPanel />
      </div>
    </div>
  );
}
