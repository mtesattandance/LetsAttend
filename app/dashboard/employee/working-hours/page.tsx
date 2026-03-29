import { WorkingHoursMonthPanel } from "@/components/client/working-hours-month-panel";

export default function EmployeeWorkingHoursPage() {
  return (
    <div className="p-3 sm:p-6 md:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">My working hours</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Your own credited hours for any month: on-site time, approved overtime, and approved
          off-site. Totals above 240 hours in that month count as overtime.
        </p>
      </div>
      <div className="mx-auto max-w-5xl">
        <WorkingHoursMonthPanel />
      </div>
    </div>
  );
}
