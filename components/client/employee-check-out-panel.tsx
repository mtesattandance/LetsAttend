"use client";

import * as React from "react";
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

export function EmployeeCheckOutPanel() {
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
    (async () => {
      try {
        const h = await authHeaders();
        const res = await fetch("/api/sites", { headers: h });
        const data = (await res.json()) as { sites?: Site[] };
        if (!cancelled && data.sites) {
          setSites(data.sites);
          if (data.sites[0]?.id) setSiteId(data.sites[0].id);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders]);

  const uploadSelfie = async (dataUrl: string) => {
    const h = await authHeaders();
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({
        base64: dataUrl,
        filename: "checkout.webp",
        contentType: "image/webp",
      }),
    });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Upload failed");
    return data.url!;
  };

  const checkOut = async () => {
    setMsg(null);
    if (!siteId) {
      setMsg("Select a site.");
      return;
    }
    if (!gps || !selfie) {
      setMsg("GPS and selfie required.");
      return;
    }
    setBusy(true);
    try {
      const photoUrl = await uploadSelfie(selfie);
      const h = await authHeaders();
      const res = await fetch("/api/checkout", {
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
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setMsg(data.error ?? "Check-out failed");
        return;
      }
      setMsg("Checked out successfully.");
      setSelfie(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Check-out failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check out</CardTitle>
        <CardDescription>
          Must match today&apos;s active site. Validated on the server.
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
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void checkOut()}>
          {busy ? "Submitting…" : "Submit check-out"}
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
