import { WorkingHoursMonthPanel } from "@/components/client/working-hours-month-panel";

export default function EmployeeWorkingHoursPage() {
  return (
    <div className="p-3 sm:p-6 md:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">My working hours</h1>

      </div>
      <div className="mx-auto max-w-5xl">
        <WorkingHoursMonthPanel />
      </div>
    </div>
  );
}
