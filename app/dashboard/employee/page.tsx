import { EmployeeAssignmentBanner } from "@/components/client/employee-assignment-banner";
import { EmployeeWorkPanels } from "@/components/client/employee-work-panels";
import { EmployeeDesignationCard } from "@/components/client/employee-designation-card";

export default function EmployeeDashboardPage() {
  return (
    <div className="p-3 sm:p-6 md:p-8">
      <EmployeeAssignmentBanner />
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Work</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          All steps on one page. You can also use the sidebar <strong className="text-zinc-700 dark:text-zinc-300">Check in</strong>,{" "}
          <strong className="text-zinc-700 dark:text-zinc-300">Check out</strong>, and <strong className="text-zinc-700 dark:text-zinc-300">Switch</strong> for each step alone.
        </p>
      </div>
      <EmployeeDesignationCard />
      <EmployeeWorkPanels />
    </div>
  );
}
