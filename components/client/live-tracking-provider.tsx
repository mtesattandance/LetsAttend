"use client";

import * as React from "react";
import { LiveTrackingPing } from "@/components/client/live-tracking-ping";

type LiveTrackingCtx = {
  on: boolean;
  setOn: (v: boolean) => void;
};

const LiveTrackingContext = React.createContext<LiveTrackingCtx>({
  on: false,
  setOn: () => {},
});

export function useLiveTracking() {
  return React.useContext(LiveTrackingContext);
}

export function LiveTrackingProvider({ children }: { children: React.ReactNode }) {
  /** Off by default — no employee-facing toggle; avoids silent GPS pings. */
  const [on, setOn] = React.useState(false);

  return (
    <LiveTrackingContext.Provider value={{ on, setOn }}>
      {/* Ping lives here — never unmounts during page navigation */}
      <LiveTrackingPing enabled={on} />
      {children}
    </LiveTrackingContext.Provider>
  );
}
