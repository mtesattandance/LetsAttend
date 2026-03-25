"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export type GpsResult = {
  latitude: number;
  longitude: number;
  accuracyM?: number;
};

type Props = {
  onFix: (g: GpsResult) => void;
  onError?: (message: string) => void;
};

export function GpsReadout({ onFix, onError }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [last, setLast] = React.useState<GpsResult | null>(null);

  const read = () => {
    if (!navigator.geolocation) {
      onError?.("Geolocation not supported");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const g: GpsResult = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        };
        setLast(g);
        onFix(g);
        setLoading(false);
      },
      () => {
        onError?.("GPS denied or unavailable. Enable location for this site.");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }
    );
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={read} disabled={loading}>
          {loading ? "Getting location…" : "Capture GPS"}
        </Button>
        {last && (
          <span className="text-xs text-zinc-400">
            {last.latitude.toFixed(6)}, {last.longitude.toFixed(6)}
            {last.accuracyM != null && ` (±${Math.round(last.accuracyM)}m)`}
          </span>
        )}
      </div>
    </div>
  );
}
