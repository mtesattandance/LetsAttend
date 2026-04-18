import { EmployeeAssignmentBanner } from "@/components/client/employee-assignment-banner";
import { EmployeeWorkPanels } from "@/components/client/employee-work-panels";
import { EmployeeDesignationCard } from "@/components/client/employee-designation-card";

export default function EmployeeDashboardPage() {
  return (
    <div className="p-3 sm:p-6 md:p-8">
      <EmployeeAssignmentBanner />
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Work</h1>

      </div>
      <EmployeeDesignationCard />
      <EmployeeWorkPanels />
    </div>
  );
}
