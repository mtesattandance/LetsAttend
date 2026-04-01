"use client";

import { Button } from "@/components/ui/button";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { useCalendarMode } from "@/components/client/calendar-mode-context";

export function AdminCalendarModeToggle() {
  const { user } = useDashboardUser();
  const { mode, setMode } = useCalendarMode();
  if (user?.role !== "super_admin") return null;

  const isBs = mode === "bs";
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={isBs ? "border-cyan-500/40 text-cyan-300" : ""}
      onClick={() => void setMode(isBs ? "ad" : "bs")}
    >
      Calendar: {isBs ? "Nepali (BS)" : "Gregorian (AD)"}
    </Button>
  );
}
