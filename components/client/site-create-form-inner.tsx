"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { SitePinPicker, type LatLng } from "@/components/client/map/site-pin-picker";
import { UtcTimePicker } from "@/components/client/utc-time-picker";
import { getGpsFix } from "@/lib/client/geolocation";
import { cn } from "@/lib/utils";

type Appearance = "dark" | "light";

type Props = {
  appearance?: Appearance;
  /** POST target — admin or employee create. */
  submitPath: "/api/admin/sites" | "/api/sites";
  onCreated?: (id: string) => void;
};

export function SiteCreateFormInner({
  appearance = "dark",
  submitPath,
  onCreated,
}: Props) {
  const light = appearance === "light";
  const [name, setName] = React.useState("");
  const [latitude, setLatitude] = React.useState("");
  const [longitude, setLongitude] = React.useState("");
  const [radius, setRadius] = React.useState("80");
  const [workdayStartUtc, setWorkdayStartUtc] = React.useState("");
  const [workdayEndUtc, setWorkdayEndUtc] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [placeQuery, setPlaceQuery] = React.useState("");
  const [geoBusy, setGeoBusy] = React.useState(false);
  const [locateBusy, setLocateBusy] = React.useState(false);
  const [geoResults, setGeoResults] = React.useState<
    { latitude: number; longitude: number; label: string }[]
  >([]);
  const [recenterAt, setRecenterAt] = React.useState<LatLng | null>(null);
  const [recenterSeq, setRecenterSeq] = React.useState(0);

  const inputCls = light
    ? "rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-100 dark:placeholder:text-zinc-500"
    : "rounded-xl border border-white/10 bg-black/40 px-3 py-2";

  const labelCls = light
    ? "text-zinc-600 dark:text-zinc-400"
    : "text-zinc-400";

  const parsedLat = Number(latitude);
  const parsedLng = Number(longitude);
  const picked: LatLng | null =
    Number.isFinite(parsedLat) && Number.isFinite(parsedLng)
      ? { latitude: parsedLat, longitude: parsedLng }
      : null;

  const searchPlace = async () => {
    const q = placeQuery.trim();
    if (q.length < 2) {
      setMsg("Enter at least 2 characters to search.");
      return;
    }
    setMsg(null);
    setGeoBusy(true);
    setGeoResults([]);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as {
        results?: { latitude: number; longitude: number; label: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setGeoResults(data.results ?? []);
      if (!(data.results?.length)) setMsg("No results — try a different query.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Search failed");
    } finally {
      setGeoBusy(false);
    }
  };

  const applyGeocode = (r: { latitude: number; longitude: number; label: string }) => {
    setLatitude(String(r.latitude));
    setLongitude(String(r.longitude));
    setRecenterAt({ latitude: r.latitude, longitude: r.longitude });
    setRecenterSeq((n) => n + 1);
    setMsg(`Pinned: ${r.label.slice(0, 120)}${r.label.length > 120 ? "…" : ""}`);
  };

  const locateMe = async () => {
    setMsg(null);
    setLocateBusy(true);
    try {
      const g = await getGpsFix();
      setLatitude(String(g.latitude));
      setLongitude(String(g.longitude));
      setRecenterAt({ latitude: g.latitude, longitude: g.longitude });
      setRecenterSeq((n) => n + 1);
      if (g.accuracyM != null && Number.isFinite(g.accuracyM)) {
        const r = Math.min(200, Math.max(50, Math.round(g.accuracyM * 2)));
        setRadius(String(r));
      }
      const acc = g.accuracyM != null ? Math.round(g.accuracyM) : "?";
      setMsg(
        `Located you (±${acc}m). Center matches your current position — fine-tune the pin on the map if needed.`
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Location failed");
    } finally {
      setLocateBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      if (!name.trim()) {
        throw new Error("Please enter a site name.");
      }
      const lat = Number(latitude);
      const lng = Number(longitude);
      const rad = Number(radius);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("Please pick a location on the map before saving.");
      }
      if (!Number.isFinite(rad) || rad <= 0) {
        throw new Error("Please enter a valid radius in meters (e.g. 50–200).");
      }
      if (rad > 5000) {
        throw new Error("Radius cannot exceed 5000 meters.");
      }
      const res = await fetch(submitPath, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          latitude: lat,
          longitude: lng,
          radius: rad,
          workdayStartUtc: workdayStartUtc.trim() || undefined,
          workdayEndUtc: workdayEndUtc.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMsg(`Site created: ${data.id}`);
      setName("");
      setWorkdayStartUtc("");
      setWorkdayEndUtc("");
      setPlaceQuery("");
      setGeoResults([]);
      if (data.id) onCreated?.(data.id);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const resultsBox = light
    ? "mb-4 max-h-36 space-y-1 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-sm dark:border-zinc-600 dark:bg-zinc-800/60"
    : "mb-4 max-h-36 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-2 text-sm";

  return (
    <>
      <div
        className={cn(
          "mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
        )}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className={labelCls}>Find on map (search)</span>
          <input
            className={inputCls}
            placeholder="Address, city, building name…"
            value={placeQuery}
            onChange={(e) => setPlaceQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void searchPlace();
              }
            }}
          />
        </label>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Button
            type="button"
            variant="secondary"
            className={
              light
                ? "border-zinc-300 bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                : undefined
            }
            disabled={geoBusy}
            onClick={() => void searchPlace()}
          >
            {geoBusy ? "Searching…" : "Search"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className={
              light
                ? "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 hover:border-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                : undefined
            }
            disabled={locateBusy}
            onClick={() => void locateMe()}
          >
            {locateBusy ? "Locating…" : "Locate me"}
          </Button>
        </div>
      </div>
      {geoResults.length > 0 ? (
        <ul className={resultsBox}>
          {geoResults.map((r, i) => (
            <li key={`${r.latitude},${r.longitude},${i}`}>
              <button
                type="button"
                className={cn(
                  "w-full rounded-lg px-2 py-1.5 text-left",
                  light
                    ? "text-zinc-800 hover:bg-zinc-200/80 dark:text-zinc-200 dark:hover:bg-zinc-700/80"
                    : "text-zinc-200 hover:bg-white/10"
                )}
                onClick={() => applyGeocode(r)}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mb-5">
        <SitePinPicker
          value={picked}
          recenterAt={recenterAt}
          recenterSeq={recenterSeq}
          enableFullscreen
          mapChrome={light ? "sheet" : "admin"}
          onChange={(ll) => {
            setLatitude(String(ll.latitude));
            setLongitude(String(ll.longitude));
          }}
        />
        <div
          className={cn(
            "mt-3 flex flex-wrap items-center gap-2 text-xs",
            light ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-400"
          )}
        >
          <span>Latitude: {picked ? picked.latitude.toFixed(6) : "—"}</span>
          <span>•</span>
          <span>Longitude: {picked ? picked.longitude.toFixed(6) : "—"}</span>
        </div>
      </div>

      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <label className="flex flex-col gap-1 text-sm">
          <span className={labelCls}>Name</span>
          <input
            required
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className={labelCls}>Latitude</span>
            <input
              required
              inputMode="decimal"
              className={inputCls}
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className={labelCls}>Longitude</span>
            <input
              required
              inputMode="decimal"
              className={inputCls}
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className={labelCls}>Radius (meters)</span>
          <input
            required
            inputMode="numeric"
            className={inputCls}
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <UtcTimePicker
            id="create-work-start"
            label="Expected work start (site local time)"
            value={workdayStartUtc}
            onChange={setWorkdayStartUtc}
            allowEmpty
            variant={light ? "light" : "dark"}
          />
          <UtcTimePicker
            id="create-work-end"
            label="Work end time (site local time)"
            value={workdayEndUtc}
            onChange={setWorkdayEndUtc}
            allowEmpty
            variant={light ? "light" : "dark"}
          />
        </div>
        <p
          className={cn(
            "text-xs",
            light ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-500"
          )}
        >
          Workers still checked in after the work end time will be automatically checked out by the system.
        </p>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Create site"}
        </Button>
        {msg ? (
          <p
            className={cn(
              "text-sm",
              light ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-300"
            )}
            role="status"
          >
            {msg}
          </p>
        ) : null}
      </form>
    </>
  );
}
