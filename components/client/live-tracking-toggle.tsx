"use client";

import * as React from "react";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { useLiveTracking } from "@/components/client/live-tracking-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LiveTrackingToggle() {
  const { user } = useDashboardUser();
  const { on, setOn } = useLiveTracking();
  const lockedForEmployee = user?.role === "employee";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live tracking</CardTitle>
        <CardDescription>
          Sends GPS to Firestore every ~45s while enabled.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            className="size-4 accent-cyan-500"
            checked={on}
            disabled={lockedForEmployee}
            onChange={(e) => setOn(e.target.checked)}
          />
          Enable pings {lockedForEmployee ? "(locked for employees)" : ""}
        </label>
      </CardContent>
    </Card>
  );
}
