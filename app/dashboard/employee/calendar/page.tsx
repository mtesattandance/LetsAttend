import { AttendanceCalendar } from "@/components/client/attendance-calendar";

export default function EmployeeCalendarPage() {
  return (
    <div className="p-3 sm:p-6 md:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Attendance calendar</h1>

      </div>
      <div className="mx-auto max-w-3xl">
        <AttendanceCalendar />
      </div>
    </div>
  );
}
