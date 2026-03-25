"use client";

import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CameraCapture } from "@/components/client/camera-capture";
import { GpsReadout, type GpsResult } from "@/components/client/gps-readout";
import { getFirebaseAuth } from "@/lib/firebase/client";

type Site = { id: string; name?: string };

export function EmployeeCheckInPanel() {
  const [sites, setSites] = React.useState<Site[]>([]);
  const [siteId, setSiteId] = React.useState("");
  const [gps, setGps] = React.useState<GpsResult | null>(null);
  const [selfie, setSelfie] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const authHeaders = React.useCallback(async () => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    const token = await u.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const h = await authHeaders();
        const res = await fetch("/api/sites", { headers: h });
        const data = (await res.json()) as { sites?: Site[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to load sites");
        if (!cancelled) {
          setSites(data.sites ?? []);
          if (data.sites?.[0]?.id) setSiteId(data.sites[0].id);
        }
      } catch (e) {
        if (!cancelled) setMsg(e instanceof Error ? e.message : "Load failed");
      }
    };
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) void run();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [authHeaders]);

  const uploadSelfie = async (dataUrl: string) => {
    const h = await authHeaders();
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({
        base64: dataUrl,
        filename: "checkin.webp",
        contentType: "image/webp",
      }),
    });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Upload failed");
    return data.url!;
  };

  const checkIn = async () => {
    setMsg(null);
    if (!siteId) {
      setMsg("Select a site.");
      return;
    }
    if (!gps) {
      setMsg("Capture GPS first.");
      return;
    }
    if (!selfie) {
      setMsg("Take a selfie first.");
      return;
    }
    setBusy(true);
    try {
      const photoUrl = await uploadSelfie(selfie);
      const h = await authHeaders();
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracyM: gps.accuracyM,
          photoUrl,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        distanceM?: number;
      };
      if (!res.ok) {
        setMsg(
          data.error ??
            (typeof data.distanceM === "number"
              ? `Too far from site (~${data.distanceM}m).`
              : "Check-in failed")
        );
        return;
      }
      setMsg(`Checked in. ~${data.distanceM ?? "?"}m from site center.`);
      setSelfie(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check in</CardTitle>
        <CardDescription>
          GPS + selfie are validated on the server against the site radius.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:gap-6">
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-zinc-400">Site</span>
          <select
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-foreground"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
          >
            <option value="">Select…</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? s.id}
              </option>
            ))}
          </select>
        </label>

        <GpsReadout onFix={setGps} onError={setMsg} />
        <CameraCapture onCapture={setSelfie} onError={setMsg} />

        {selfie && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selfie}
            alt="Preview"
            className="max-h-48 rounded-xl border border-white/10 object-contain"
          />
        )}

        <Button type="button" disabled={busy} onClick={() => void checkIn()}>
          {busy ? "Submitting…" : "Submit check-in"}
        </Button>

        {msg && (
          <p className="text-sm text-zinc-300" role="status">
            {msg}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
