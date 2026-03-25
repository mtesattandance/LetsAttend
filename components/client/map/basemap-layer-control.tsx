"use client";

import * as React from "react";
import { TileLayer } from "react-leaflet";
import { cn } from "@/lib/utils";
import {
  ESRI_SATELLITE_TILE,
  OSM_TILE,
  type BasemapId,
} from "@/lib/map/tile-layers";

export function BasemapLayerControl({
  value,
  onChange,
  className,
}: {
  value: BasemapId;
  onChange: (id: BasemapId) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute right-2 top-2 z-[1000] flex overflow-hidden rounded-lg border border-white/20 bg-black/70 text-xs shadow-lg backdrop-blur-sm",
        className
      )}
    >
      {(
        [
          { id: "street" as const, label: "Map" },
          { id: "satellite" as const, label: "Satellite" },
        ] as const
      ).map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className={cn(
            "px-3 py-1.5 font-medium transition-colors",
            value === id
              ? "bg-cyan-500/30 text-cyan-100"
              : "text-zinc-300 hover:bg-white/10"
          )}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Renders the active `TileLayer` for the chosen basemap. */
export function BasemapTileLayer({ basemap }: { basemap: BasemapId }) {
  if (basemap === "satellite") {
    return (
      <TileLayer url={ESRI_SATELLITE_TILE.url} attribution={ESRI_SATELLITE_TILE.attribution} />
    );
  }
  return <TileLayer url={OSM_TILE.url} attribution={OSM_TILE.attribution} />;
}
