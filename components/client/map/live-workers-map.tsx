"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import { Maximize2, X } from "lucide-react";
import {
  BasemapLayerControl,
  BasemapTileLayer,
} from "@/components/client/map/basemap-layer-control";
import { DEFAULT_BASEMAP, type BasemapId } from "@/lib/map/tile-layers";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LiveWorker = {
  workerId: string;
  latitude: number;
  longitude: number;
  accuracyM?: number;
  lastUpdatedMs?: number | null;
};

type SiteGeofence = {
  latitude: number;
  longitude: number;
  radius: number;
};

const markerIconUrl = new URL(
  "leaflet/dist/images/marker-icon.png",
  import.meta.url
).toString();
const markerIcon2xUrl = new URL(
  "leaflet/dist/images/marker-icon-2x.png",
  import.meta.url
).toString();
const markerShadowUrl = new URL(
  "leaflet/dist/images/marker-shadow.png",
  import.meta.url
).toString();

L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2xUrl,
  shadowUrl: markerShadowUrl,
});

/**
 * Bounding box for a geofence without attaching a Layer to the map.
 * Leaflet's `L.circle(...).getBounds()` needs `_map` and crashes before the map is ready.
 */
function boundsFromCenterRadiusM(lat: number, lng: number, radiusM: number): L.LatLngBounds {
  const rad = Math.max(radiusM, 1);
  const latDelta = rad / 111_320;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lngDelta = cosLat > 1e-6 ? rad / (111_320 * cosLat) : latDelta;
  return L.latLngBounds(
    [lat - latDelta, lng - lngDelta],
    [lat + latDelta, lng + lngDelta]
  );
}

function InvalidateSizeOn({ when }: { when: unknown }) {
  const map = useMap();
  React.useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(t);
  }, [map, when]);
  return null;
}

function FitSiteAndPoints({
  site,
  points,
}: {
  site: SiteGeofence | null;
  points: LiveWorker[];
}) {
  const map = useMap();

  React.useEffect(() => {
    const fit = () => {
      if (site) {
        let bounds = boundsFromCenterRadiusM(
          site.latitude,
          site.longitude,
          site.radius
        );
        for (const p of points) {
          bounds = bounds.extend([p.latitude, p.longitude]);
        }
        map.fitBounds(bounds.pad(0.12));
        return;
      }
      if (!points.length) return;
      const bounds = L.latLngBounds(
        points.map((p) => [p.latitude, p.longitude] as [number, number])
      );
      map.fitBounds(bounds.pad(0.15));
    };

    map.whenReady(() => {
      try {
        fit();
      } catch {
        /* map / tiles not ready */
      }
    });
  }, [map, site, points]);

  return null;
}

function cssHeight(h: number | string) {
  return typeof h === "number" ? `${h}px` : h;
}

function LiveWorkersMapInner({
  pollMs,
  siteId,
  mapHeight,
  resizeSignal,
  rounded,
}: {
  pollMs: number;
  siteId: string | null | undefined;
  mapHeight: number | string;
  /** Bump when container size changes (e.g. fullscreen) so Leaflet redraws. */
  resizeSignal: unknown;
  rounded: boolean;
}) {
  const [basemap, setBasemap] = React.useState<BasemapId>(DEFAULT_BASEMAP);
  const [points, setPoints] = React.useState<LiveWorker[]>([]);
  const [site, setSite] = React.useState<SiteGeofence | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) throw new Error("Not signed in.");
        const token = await u.getIdToken();

        const q = siteId
          ? `?siteId=${encodeURIComponent(siteId)}`
          : "";
        const res = await fetch(`/api/admin/live-tracking${q}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = (await res.json()) as {
          workers?: LiveWorker[];
          site?: SiteGeofence | null;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load live tracking");
        }
        if (cancelled) return;
        setPoints(data.workers ?? []);
        setSite(data.site ?? null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
        setPoints([]);
        setSite(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const t = window.setInterval(() => void load(), pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [pollMs, siteId]);

  const center = React.useMemo((): [number, number] => {
    if (site) return [site.latitude, site.longitude];
    if (points.length === 0) return [0, 0];
    const avgLat =
      points.reduce((s, p) => s + p.latitude, 0) / points.length;
    const avgLng =
      points.reduce((s, p) => s + p.longitude, 0) / points.length;
    return [avgLat, avgLng];
  }, [site, points]);

  const zoom = site ? 15 : points.length ? 13 : 2;

  return (
    <div
      className={cn(
        "relative bg-black/20",
        rounded && "overflow-hidden rounded-2xl border border-white/10"
      )}
    >
      <div className="px-4 py-3 text-sm text-zinc-300">
        {siteId ? (
          <>
            Live GPS in this site&apos;s area {loading ? "…" : ""} — markers only
            show workers whose last position is inside the geofence.
          </>
        ) : (
          <>
            Live worker map {loading ? "…" : ""} — use Satellite to match real
            buildings.
          </>
        )}
      </div>
      {error ? (
        <div className="px-4 pb-4 text-sm text-red-400">{error}</div>
      ) : null}
      <div className="relative" style={{ height: cssHeight(mapHeight) }}>
        <MapContainer
          key={siteId ?? "all"}
          center={center}
          zoom={zoom}
          scrollWheelZoom
          className="h-full w-full"
        >
          <InvalidateSizeOn when={resizeSignal} />
          <BasemapTileLayer basemap={basemap} />
          <BasemapLayerControl value={basemap} onChange={setBasemap} />
          {site ? (
            <Circle
              center={[site.latitude, site.longitude]}
              radius={site.radius}
              pathOptions={{
                color: "#22d3ee",
                weight: 2,
                fillColor: "#22d3ee",
                fillOpacity: 0.08,
              }}
            />
          ) : null}
          {points.length || site ? (
            <FitSiteAndPoints site={site} points={points} />
          ) : null}
          {points.map((p) => (
            <Marker key={p.workerId} position={[p.latitude, p.longitude]}>
              <Popup>
                <div className="min-w-[180px]">
                  <div className="text-sm font-medium">{p.workerId}</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {typeof p.lastUpdatedMs === "number"
                      ? `Updated: ${new Date(p.lastUpdatedMs).toLocaleTimeString()}`
                      : "Last update: unknown"}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

export function LiveWorkersMap({
  pollMs = 20_000,
  siteId,
  height = 420,
  showFullscreenButton = true,
  embedded = false,
}: {
  pollMs?: number;
  /** When set, only workers whose last GPS is inside this site's radius are shown. */
  siteId?: string | null;
  height?: number | string;
  showFullscreenButton?: boolean;
  /** Tighter chrome when nested under site details. */
  embedded?: boolean;
}) {
  const [fullscreen, setFullscreen] = React.useState(false);

  React.useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const normalH = height;
  const fsH = "calc(100dvh - 96px)";

  const inner = (
    <LiveWorkersMapInner
      pollMs={pollMs}
      siteId={siteId}
      mapHeight={fullscreen ? fsH : normalH}
      resizeSignal={fullscreen}
      rounded={!embedded || fullscreen}
    />
  );

  const bar = (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2",
        embedded ? "mb-2" : "mb-0"
      )}
    >
      <span className="text-xs text-zinc-500">
        {fullscreen ? "Esc or Close to exit" : null}
      </span>
      {showFullscreenButton ? (
        fullscreen ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => setFullscreen(false)}
          >
            <X className="size-4" />
            Close
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => setFullscreen(true)}
          >
            <Maximize2 className="size-4" />
            Fullscreen map
          </Button>
        )
      ) : null}
    </div>
  );

  if (fullscreen && typeof document !== "undefined") {
    return createPortal(
      <div
        className="fixed inset-0 z-[300] flex flex-col bg-zinc-950/98 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Live tracking map"
      >
        {bar}
        <div className="min-h-0 flex-1">{inner}</div>
      </div>,
      document.body
    );
  }

  return (
    <div className={embedded ? "space-y-2" : "space-y-0"}>
      {bar}
      {inner}
    </div>
  );
}
