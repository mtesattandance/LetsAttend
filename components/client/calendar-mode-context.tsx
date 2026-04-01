"use client";

import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { CalendarMode } from "@/lib/date/bs-calendar";

type CtxType = {
  mode: CalendarMode;
  loading: boolean;
  refresh: () => Promise<void>;
  setMode: (mode: CalendarMode) => Promise<void>;
};

const Ctx = React.createContext<CtxType>({
  mode: "bs",
  loading: true,
  refresh: async () => {},
  setMode: async () => {},
});

export function CalendarModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<CalendarMode>("bs");
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) {
      setModeState("bs");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await u.getIdToken();
      const res = await fetch("/api/calendar-mode", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = (await res.json()) as { mode?: CalendarMode };
      setModeState(data.mode === "ad" ? "ad" : "bs");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, () => {
      void refresh();
    });
    return () => unsub();
  }, [refresh]);

  const setMode = React.useCallback(async (next: CalendarMode) => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) return;
    const token = await u.getIdToken();
    const res = await fetch("/api/admin/calendar-mode", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ calendarMode: next }),
    });
    if (!res.ok) throw new Error("Failed to update calendar mode");
    setModeState(next);
  }, []);

  return <Ctx.Provider value={{ mode, loading, refresh, setMode }}>{children}</Ctx.Provider>;
}

export function useCalendarMode() {
  return React.useContext(Ctx);
}
