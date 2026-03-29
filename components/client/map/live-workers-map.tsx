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
  Tooltip,
  useMap,
} from "react-leaflet";
import { List, Maximize2, X } from "lucide-react";
import {
  BasemapLayerControl,
  BasemapTileLayer,
} from "@/components/client/map/basemap-layer-control";
import { DEFAULT_BASEMAP, type BasemapId } from "@/lib/map/tile-layers";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { formatInstantTime12hLocal } from "@/lib/time/format-wall-time";

type LiveWorker = {
  workerId: string;
  workerName?: string | null;
  latitude: number;
  longitude: number;
  accuracyM?: number;
  lastUpdatedMs?: number | null;
};

type JumpSite = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
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

/** `max-width: 767px` — tighter jump card layout on phones. */
function useIsNarrowJumpPanel() {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia("(max-width: 767px)");
      mq.addEventListener("change", onStoreChange);
      return () => mq.removeEventListener("change", onStoreChange);
    },
    () =>
      typeof window !== "undefined"
        ? window.matchMedia("(max-width: 767px)").matches
        : false,
    () => false
  );
}

function MapJumpToolbar({
  points,
  site,
  jumpSites,
  narrowScreen,
  panelOpen,
  onPanelOpenChange,
}: {
  points: LiveWorker[];
  site: SiteGeofence | null;
  jumpSites: JumpSite[] | undefined;
  narrowScreen: boolean;
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
}) {
  const map = useMap();
  const [workerPick, setWorkerPick] = React.useState("");
  const [sitePick, setSitePick] = React.useState("");

  const flyTo = React.useCallback(
    (lat: number, lng: number, zoom = 17) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      map.flyTo([lat, lng], zoom, { duration: 0.55 });
    },
    [map]
  );

  React.useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onPanelOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, onPanelOpenChange]);

  const showCard = panelOpen;
  const showFab = !panelOpen;

  const selectTriggerClass = cn(
    "w-full rounded-md border border-white/10 bg-black/50 text-zinc-200",
    narrowScreen
      ? "h-8 px-2 py-1 text-[11px] leading-tight"
      : "h-9 rounded-lg px-2 py-1.5 text-xs"
  );

  const cardClassName = cn(
    "pointer-events-auto absolute right-3 top-14 z-[1001] flex flex-col border border-white/15 bg-zinc-950/95 shadow-lg backdrop-blur-sm",
    narrowScreen
      ? "w-[min(188px,calc(100vw-1.5rem))] max-h-[min(200px,34vh)] gap-1 overflow-y-auto rounded-lg p-1.5"
      : "w-[min(220px,calc(100%-24px))] max-h-[min(300px,50vh)] gap-2 overflow-y-auto rounded-xl p-2.5 text-xs"
  );

  return (
    <>
      {showFab ? (
        <button
          type="button"
          className="pointer-events-auto absolute right-3 top-14 z-[1000] flex size-10 items-center justify-center rounded-lg border border-white/15 bg-zinc-950/92 text-cyan-100 shadow-lg backdrop-blur-sm transition-colors hover:bg-zinc-900/95 md:size-11 md:rounded-xl"
          aria-expanded={false}
          aria-controls="live-map-jump-panel"
          onClick={() => onPanelOpenChange(true)}
          title="Worker & site jump"
        >
          <List className={narrowScreen ? "size-4" : "size-5"} aria-hidden />
        </button>
      ) : null}
      {showCard ? (
        <div
          id="live-map-jump-panel"
          role="dialog"
          aria-label="Jump to worker or site"
          className={cardClassName}
        >
          <div className="flex shrink-0 items-center justify-between gap-1.5 border-b border-white/10 pb-1.5">
            <span
              className={cn(
                "font-semibold uppercase tracking-wide text-zinc-400",
                narrowScreen ? "text-[9px]" : "text-[11px]"
              )}
            >
              Jump to
            </span>
            <button
              type="button"
              className={cn(
                "rounded-md text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100",
                narrowScreen ? "p-0.5" : "p-1"
              )}
              aria-label="Close panel"
              onClick={() => onPanelOpenChange(false)}
            >
              <X className={narrowScreen ? "size-3.5" : "size-4"} />
            </button>
          </div>
          <div>
            <label
              className={cn(
                "mb-0.5 block font-medium uppercase tracking-wide text-zinc-500",
                narrowScreen ? "text-[9px]" : "text-[10px]"
              )}
            >
              Go to worker
            </label>
            <SearchableSelect
              value={workerPick}
              onValueChange={(v) => {
                setWorkerPick(v);
                const p = points.find((x) => x.workerId === v);
                if (p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) {
                  flyTo(p.latitude, p.longitude, 18);
                }
              }}
              options={points.map((p) => ({
                value: p.workerId,
                label: p.workerName?.trim() || p.workerId,
              }))}
              emptyLabel="— Select —"
              searchPlaceholder="Search workers…"
              triggerClassName={selectTriggerClass}
              popoverContentClassName="z-[2200]"
              popoverModal={false}
              listClassName={narrowScreen ? "max-h-[min(160px,32vh)]" : "max-h-[min(240px,40vh)]"}
            />
          </div>
          {site ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={cn(
                "w-full",
                narrowScreen ? "h-7 text-[10px] leading-none" : "h-8 text-xs"
              )}
              onClick={() => flyTo(site.latitude, site.longitude, 16)}
            >
              Site center (this geofence)
            </Button>
          ) : null}
          {jumpSites && jumpSites.length > 0 ? (
            <div>
              <label
                className={cn(
                  "mb-0.5 block font-medium uppercase tracking-wide text-zinc-500",
                  narrowScreen ? "text-[9px]" : "text-[10px]"
                )}
              >
                Go to site
              </label>
              <SearchableSelect
                value={sitePick}
                onValueChange={(v) => {
                  setSitePick(v);
                  const s = jumpSites.find((x) => x.id === v);
                  if (s) flyTo(s.latitude, s.longitude, 15);
                }}
                options={jumpSites.map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
                emptyLabel="— Select —"
                searchPlaceholder="Search sites…"
                triggerClassName={selectTriggerClass}
                popoverContentClassName="z-[2200]"
                popoverModal={false}
                listClassName={narrowScreen ? "max-h-[min(160px,32vh)]" : "max-h-[min(240px,40vh)]"}
              />
            </div>
          ) : null}
          <p
            className={cn(
              "leading-snug text-zinc-500",
              narrowScreen ? "hidden" : "text-[10px]"
            )}
          >
            Pan and zoom still work as usual. Labels show who each marker is.
          </p>
        </div>
      ) : null}
    </>
  );
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
  jumpSites,
}: {
  pollMs: number;
  siteId: string | null | undefined;
  mapHeight: number | string;
  /** Bump when container size changes (e.g. fullscreen) so Leaflet redraws. */
  resizeSignal: unknown;
  rounded: boolean;
  jumpSites: JumpSite[] | undefined;
}) {
  const [basemap, setBasemap] = React.useState<BasemapId>(DEFAULT_BASEMAP);
  const [points, setPoints] = React.useState<LiveWorker[]>([]);
  const [site, setSite] = React.useState<SiteGeofence | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const isNarrowJump = useIsNarrowJumpPanel();
  /** Collapsed by default on all sizes — use list icon to open (max map area). */
  const [jumpPanelOpen, setJumpPanelOpen] = React.useState(false);

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
          <MapJumpToolbar
            points={points}
            site={site}
            jumpSites={jumpSites}
            narrowScreen={isNarrowJump}
            panelOpen={jumpPanelOpen}
            onPanelOpenChange={setJumpPanelOpen}
          />
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
          {points.map((p) => {
            const label = p.workerName?.trim() || p.workerId;
            return (
              <Marker key={p.workerId} position={[p.latitude, p.longitude]}>
                <Tooltip permanent direction="top" offset={[0, -6]} opacity={1}>
                  <span className="rounded-md bg-black/85 px-1.5 py-0.5 text-[11px] font-medium text-white shadow">
                    {label}
                  </span>
                </Tooltip>
                <Popup>
                  <div className="min-w-[180px]">
                    <div className="text-sm font-medium text-zinc-900">{label}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-zinc-600">{p.workerId}</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {typeof p.lastUpdatedMs === "number"
                        ? `Updated: ${formatInstantTime12hLocal(p.lastUpdatedMs)}`
                        : "Last update: unknown"}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
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
  jumpSites,
}: {
  pollMs?: number;
  /** When set, only workers whose last GPS is inside this site's radius are shown. */
  siteId?: string | null;
  height?: number | string;
  showFullscreenButton?: boolean;
  /** Tighter chrome when nested under site details. */
  embedded?: boolean;
  /** Optional list for “Go to site” on the live map (global view). */
  jumpSites?: JumpSite[];
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
      jumpSites={jumpSites}
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
