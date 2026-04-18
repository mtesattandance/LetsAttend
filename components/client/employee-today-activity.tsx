"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { calendarDateKeyInTimeZone } from "@/lib/date/calendar-day-key";
import { normalizeTimeZoneId, workTimeZoneUiLabel } from "@/lib/date/time-zone";
import { AttendanceDayDetailView, type DayDetailPayload } from "@/components/client/attendance-day-detail-view";

export function EmployeeTodayActivity() {
  const { user } = useDashboardUser();
  const displayTz = normalizeTimeZoneId(user?.timeZone);
  const zoneLabel = workTimeZoneUiLabel(displayTz);
  const [data, setData] = React.useState<DayDetailPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const day = calendarDateKeyInTimeZone(new Date(), displayTz);
      const res = await fetch(`/api/attendance/day-detail?day=${encodeURIComponent(day)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as DayDetailPayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [displayTz]);

  React.useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  return (
    <AttendanceDayDetailView 
      data={data}
      loading={loading}
      error={err}
      backHref="/dashboard/employee"
      backLabel="Back to Dashboard"
      showWorkerHeader={false}
    />
  );
}
