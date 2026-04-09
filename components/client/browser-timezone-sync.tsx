"use client";

import * as React from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";

/**
 * Keeps `users.timeZone` aligned with the device’s IANA time zone.
 * Updates via `/api/user/timezone` because Firestore rules block direct client edits to `timeZone`.
 */
export function BrowserTimeZoneSync() {
  const { user, loading } = useDashboardUser();

  React.useEffect(() => {
    if (loading || !user) return;
    if (user.role !== "employee") return;

    let raw: string;
    try {
      raw = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    const detected = normalizeTimeZoneId(raw);
    if (detected === user.timeZone) return;

    let cancelled = false;
    (async () => {
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) return;
        const token = await u.getIdToken();
        const res = await fetch("/api/user/timezone", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ timeZone: raw }),
        });
        if (!cancelled && !res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          if (process.env.NODE_ENV === "development") {
            console.warn("[BrowserTimeZoneSync]", err.error ?? res.status);
          }
        }
      } catch {
        /* offline / transient */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, user?.uid, user?.timeZone]);

  return null;
}
