import { EmployeeTodayActivity } from "@/components/client/employee-today-activity";

export default function EmployeeTodayPage() {
  return (
    <div className="p-3 sm:p-6 md:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Your attendance for the current calendar day in your work time zone (same as your device).
          Includes check-in, site switches, check-out, and site schedule hints.
        </p>
      </div>
      <div className="mx-auto max-w-2xl">
        <EmployeeTodayActivity />
      </div>
    </div>
  );
}
