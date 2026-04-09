import { AttendanceCalendar } from "@/components/client/attendance-calendar";

export default function EmployeeCalendarPage() {
  return (
    <div className="p-3 sm:p-6 md:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Attendance calendar</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Month view of your check-ins in your work time zone (same as your device). Open{" "}
          <strong className="text-zinc-900 dark:text-zinc-200">Work</strong> in the sidebar for check-in and
          site tools.
        </p>
      </div>
      <div className="mx-auto max-w-3xl">
        <AttendanceCalendar />
      </div>
    </div>
  );
}
