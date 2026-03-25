"use client";

import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";

const INTERVAL_MS = 45_000;

/**
 * While mounted and enabled, posts GPS to /api/live-tracking on an interval.
 * Toggle `enabled` when the worker is on shift (tie to attendance later).
 */
export function LiveTrackingPing({ enabled }: { enabled: boolean }) {
  React.useEffect(() => {
    if (!enabled) return;

    const auth = getFirebaseAuth();
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const tick = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const u = auth.currentUser;
            if (!u) return;
            const token = await u.getIdToken();
            await fetch("/api/live-tracking", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracyM: pos.coords.accuracy,
              }),
            });
          } catch {
            /* ignore */
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 }
      );
    };

    const unsub = onAuthStateChanged(auth, (user) => {
      if (intervalId) clearInterval(intervalId);
      intervalId = undefined;
      if (!user) return;
      void tick();
      intervalId = setInterval(() => void tick(), INTERVAL_MS);
    });

    return () => {
      unsub();
      if (intervalId) clearInterval(intervalId);
    };
  }, [enabled]);

  return null;
}
