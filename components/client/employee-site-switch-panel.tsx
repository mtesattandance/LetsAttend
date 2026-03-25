"use client";

import * as React from "react";
import { doc, onSnapshot } from "firebase/firestore";
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
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { attendanceDayKeyUTC } from "@/lib/date/today-key";

type Site = { id: string; name?: string };

export function EmployeeSiteSwitchPanel() {
  const [sites, setSites] = React.useState<Site[]>([]);
  const [siteNames, setSiteNames] = React.useState<Record<string, string>>({});
  const [currentSiteId, setCurrentSiteId] = React.useState<string | null>(null);
  const [sessionOpen, setSessionOpen] = React.useState(false);
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
          const list = data.sites ?? [];
          setSites(list);
          const names: Record<string, string> = {};
          for (const s of list) {
            names[s.id] = s.name ?? s.id;
          }
          setSiteNames(names);
        }
      } catch {
        /* ignore */
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

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    let unsubDoc: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      unsubDoc?.();
      unsubDoc = undefined;
      setSessionOpen(false);
      setCurrentSiteId(null);
      if (!u) return;
      const day = attendanceDayKeyUTC();
      const ref = doc(db, "attendance", `${u.uid}_${day}`);
      unsubDoc = onSnapshot(
        ref,
        (snap) => {
          const d = snap.data() as
            | {
                checkIn?: unknown;
                checkOut?: unknown;
                siteId?: string;
              }
            | undefined;
          const open = !!(d?.checkIn && d?.checkOut == null);
          setSessionOpen(open);
          setCurrentSiteId(typeof d?.siteId === "string" ? d.siteId : null);
        },
        () => {
          setSessionOpen(false);
          setCurrentSiteId(null);
        }
      );
    });

    return () => {
      unsubAuth();
      unsubDoc?.();
    };
  }, []);

  const uploadSelfie = async (dataUrl: string) => {
    const h = await authHeaders();
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({
        base64: dataUrl,
        filename: "site-switch.webp",
        contentType: "image/webp",
      }),
    });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Upload failed");
    return data.url!;
  };

  const switchSite = async () => {
    setMsg(null);
    if (!siteId) {
      setMsg("Select a site to switch to.");
      return;
    }
    if (!gps) {
      setMsg("Capture GPS first.");
      return;
    }
    if (!selfie) {
      setMsg("Take a new selfie to confirm you are at the new site.");
      return;
    }
    setBusy(true);
    try {
      const photoUrl = await uploadSelfie(selfie);
      const h = await authHeaders();
      const res = await fetch("/api/site-switch", {
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
              : "Switch failed")
        );
        return;
      }
      const dm =
        typeof data.distanceM === "number" && Number.isFinite(data.distanceM)
          ? data.distanceM
          : "?";
      setMsg(`Switched site. ~${dm}m from new site center.`);
      setSelfie(null);
      setGps(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Switch failed");
    } finally {
      setBusy(false);
    }
  };

  if (!sessionOpen) {
    return null;
  }

  const otherSites = sites.filter((s) => s.id !== currentSiteId);

  if (otherSites.length === 0) {
    return (
      <Card className="border-white/10 bg-white/[0.02]">
        <CardHeader>
          <CardTitle className="text-base">Switch work site</CardTitle>
          <CardDescription>
            You only have one site available while checked in. Ask an admin to assign additional
            sites if you need to work at more than one location in a day.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const canSubmit = Boolean(siteId && gps && selfie && !busy);

  return (
    <Card className="border-cyan-500/25 bg-gradient-to-br from-cyan-500/[0.07] to-transparent">
      <CardHeader>
        <CardTitle>Switch work site</CardTitle>
        <CardDescription>
          You are checked in
          {currentSiteId
            ? ` at “${siteNames[currentSiteId] ?? currentSiteId}”. Move to another assigned site
              the same day: choose the destination, capture GPS at that site, take a fresh selfie, then
              confirm.`
            : "."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:gap-6">
        <ol className="list-inside list-decimal space-y-1 text-sm text-zinc-400">
          <li>
            <span className="text-zinc-200">Pick the site</span> you are moving to (must be assigned to
            you).
          </li>
          <li>
            <span className="text-zinc-200">Capture GPS</span> while physically at the new site.
          </li>
          <li>
            <span className="text-zinc-200">Take a new selfie</span> for verification.
          </li>
        </ol>

        <label className="flex flex-col gap-2 text-sm">
          <span className="text-zinc-400">1 — New site</span>
          <select
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-foreground"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
          >
            <option value="">Select…</option>
            {otherSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? s.id}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="mb-2 text-sm text-zinc-400">2 — GPS at new site</p>
          <GpsReadout onFix={setGps} onError={setMsg} />
        </div>

        <div>
          <p className="mb-2 text-sm text-zinc-400">3 — Selfie</p>
          <CameraCapture onCapture={setSelfie} onError={setMsg} />
        </div>

        {selfie ? (
          <img
            src={selfie}
            alt="Preview"
            className="max-h-48 rounded-xl border border-white/10 object-contain"
          />
        ) : null}

        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => void switchSite()}
        >
          {busy ? "Submitting…" : "Confirm site switch"}
        </Button>

        {msg ? (
          <p className="text-sm text-zinc-300" role="status">
            {msg}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
