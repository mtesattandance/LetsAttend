"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { SitePinPicker, type LatLng } from "@/components/client/map/site-pin-picker";
import { UtcTimePicker } from "@/components/client/utc-time-picker";
import { getGpsFix } from "@/lib/client/geolocation";

export type EditableSite = {
  id: string;
  name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  radius?: unknown;
  workdayStartUtc?: unknown;
  autoCheckoutUtc?: unknown;
};

function numStr(v: unknown, fallback: string) {
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : fallback;
}

export function AdminEditSiteForm({
  site,
  onSaved,
}: {
  site: EditableSite;
  onSaved?: () => void;
}) {
  const [name, setName] = React.useState("");
  const [latitude, setLatitude] = React.useState("");
  const [longitude, setLongitude] = React.useState("");
  const [radius, setRadius] = React.useState("80");
  const [workdayStartUtc, setWorkdayStartUtc] = React.useState("");
  const [autoCheckoutUtc, setAutoCheckoutUtc] = React.useState("23:59");
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

  React.useEffect(() => {
    setMsg(null);
    setName(typeof site.name === "string" ? site.name : "");
    setLatitude(numStr(site.latitude, ""));
    setLongitude(numStr(site.longitude, ""));
    setRadius(numStr(site.radius, "80"));
    setWorkdayStartUtc(
      typeof site.workdayStartUtc === "string" && site.workdayStartUtc.trim()
        ? site.workdayStartUtc.trim()
        : ""
    );
    setAutoCheckoutUtc(
      typeof site.autoCheckoutUtc === "string" && site.autoCheckoutUtc.trim()
        ? site.autoCheckoutUtc.trim()
        : "23:59"
    );
    setRecenterAt(null);
    setRecenterSeq((n) => n + 1);
  }, [site.id, site.name, site.latitude, site.longitude, site.radius, site.workdayStartUtc, site.autoCheckoutUtc]);

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
        `Located you (±${acc}m). Fine-tune the pin on the map or adjust radius before saving.`
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
      const lat = Number(latitude);
      const lng = Number(longitude);
      const rad = Number(radius);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("Pick a location pin on the map.");
      }
      const res = await fetch("/api/admin/sites", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          siteId: site.id,
          name: name.trim(),
          latitude: lat,
          longitude: lng,
          radius: rad,
          workdayStartUtc: workdayStartUtc.trim(),
          autoCheckoutUtc: autoCheckoutUtc.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setMsg("Site updated.");
      onSaved?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Change geofence radius, pin location, name, or NPT work times. Saving updates live checks and maps
        immediately.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="text-zinc-400">Find on map (search)</span>
          <input
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2"
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
            disabled={geoBusy}
            onClick={() => void searchPlace()}
          >
            {geoBusy ? "Searching…" : "Search"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={locateBusy}
            onClick={() => void locateMe()}
          >
            {locateBusy ? "Locating…" : "Locate me"}
          </Button>
        </div>
      </div>
      {geoResults.length > 0 ? (
        <ul className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-2 text-sm">
          {geoResults.map((r, i) => (
            <li key={`${r.latitude},${r.longitude},${i}`}>
              <button
                type="button"
                className="w-full rounded-lg px-2 py-1.5 text-left text-zinc-200 hover:bg-white/10"
                onClick={() => applyGeocode(r)}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <SitePinPicker
          value={picked}
          recenterAt={recenterAt}
          recenterSeq={recenterSeq}
          enableFullscreen
          onChange={(ll) => {
            setLatitude(String(ll.latitude));
            setLongitude(String(ll.longitude));
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span>Latitude: {picked ? picked.latitude.toFixed(6) : "—"}</span>
          <span>•</span>
          <span>Longitude: {picked ? picked.longitude.toFixed(6) : "—"}</span>
        </div>
      </div>

      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400">Name</span>
          <input
            required
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Latitude</span>
            <input
              required
              inputMode="decimal"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Longitude</span>
            <input
              required
              inputMode="decimal"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400">Radius (meters)</span>
          <input
            required
            inputMode="numeric"
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <UtcTimePicker
            id={`edit-work-start-${site.id}`}
            label="Expected work start (NPT)"
            value={workdayStartUtc}
            onChange={setWorkdayStartUtc}
            allowEmpty
            variant="dark"
          />
          <UtcTimePicker
            id={`edit-auto-checkout-${site.id}`}
            label="Auto check-out after (NPT)"
            value={autoCheckoutUtc}
            onChange={setAutoCheckoutUtc}
            variant="dark"
          />
        </div>
        <p className="text-xs text-zinc-500">
          Use “No time” on work start to hide it on the Today page. Pick times in 12-hour AM/PM (Nepal NPT
          wall time).
        </p>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        {msg ? <p className="text-sm text-zinc-300">{msg}</p> : null}
      </form>
    </div>
  );
}
