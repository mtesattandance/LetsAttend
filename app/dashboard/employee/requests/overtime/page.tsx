import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeOvertimeRequestPanel } from "@/components/client/employee-overtime-request-panel";

export default function EmployeeRequestsOvertimePage() {
  return (
    <div className="p-3 sm:p-6 md:p-8">
      <div className="mx-auto mb-6 flex max-w-2xl items-center gap-3 md:mb-8">
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link href="/dashboard/employee/requests" aria-label="Back to requests">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overtime</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Request overtime and record approved overtime check-in and check-out. Admin review lives
            under <strong className="text-zinc-700 dark:text-zinc-300">Admin → Overtime</strong>.
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-2xl">
        <EmployeeOvertimeRequestPanel />
      </div>
    </div>
  );
}
