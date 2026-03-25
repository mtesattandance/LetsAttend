import { EmployeeCheckInPanel } from "@/components/client/employee-check-in-panel";
import { EmployeeCheckOutPanel } from "@/components/client/employee-check-out-panel";
import { EmployeeSiteSwitchPanel } from "@/components/client/employee-site-switch-panel";
import { LiveTrackingToggle } from "@/components/client/live-tracking-toggle";

export default function EmployeeDashboardPage() {
  return (
    <div className="p-3 sm:p-6 md:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Work</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Check in, switch sites when needed (new selfie), check out, and keep live location on while
          working. Open <strong>Today</strong> for this day&apos;s timeline, and{" "}
          <strong>Calendar</strong> for the month.
        </p>
      </div>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 md:gap-6">
        <EmployeeCheckInPanel />
        <EmployeeSiteSwitchPanel />
        <EmployeeCheckOutPanel />
        <LiveTrackingToggle />
      </div>
    </div>
  );
}
