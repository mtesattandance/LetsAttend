import { EmployeeManualPunchPanel } from "@/components/client/employee-manual-punch-panel";

export default function ManualPunchRequestPage() {
  return (
    <div className="mx-auto max-w-4xl p-3 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
          Missed Attendance
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Request manual timeline adjustment for forgotten scans.
        </p>
      </div>

      <EmployeeManualPunchPanel />
    </div>
  );
}
