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
import { CameraCapture, type CameraCaptureHandle } from "@/components/client/camera-capture";
import {
  SelfiePreviewWithRetake,
  useResetCaptureWhenSiteChanges,
  useRetakeSelfieCamera,
} from "@/components/client/selfie-preview-with-retake";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { OutOfSiteRadiusAlert } from "@/components/client/out-of-site-radius-alert";
import { ResultModal } from "@/components/client/feedback-modals";
import { getGpsFix, type GpsResult } from "@/lib/client/geolocation";
import { toast } from "sonner";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { SiteSelectWithCustomRow } from "@/components/client/site-select-with-custom-row";

type Site = { id: string; name?: string };

type RadiusErr = { distanceM: number; radiusM: number };

type FlowStep = 0 | 1 | 2;

export function EmployeeCheckOutPanel({ proxyForUid }: { proxyForUid?: string } = {}) {
  const { user } = useDashboardUser();
  const isAdminLike =
    user?.role === "admin" || user?.role === "super_admin";

  const [sites, setSites] = React.useState<Site[]>([]);
  const [siteId, setSiteId] = React.useState("");
  const [gps, setGps] = React.useState<GpsResult | null>(null);
  const [selfie, setSelfie] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<FlowStep>(0);
  const [streamReady, setStreamReady] = React.useState(false);
  const [successFeedback, setSuccessFeedback] = React.useState(false);
  const [radiusError, setRadiusError] = React.useState<RadiusErr | null>(null);
  const [busy, setBusy] = React.useState(false);
  const camRef = React.useRef<CameraCaptureHandle>(null);

  const authHeaders = React.useCallback(async () => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    const token = await u.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadSites = React.useCallback(async () => {
    const h = await authHeaders();
    const res = await fetch("/api/sites", { headers: h });
    const data = (await res.json()) as { sites?: Site[]; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Failed to load sites");
    setSites(data.sites ?? []);
  }, [authHeaders]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (!cancelled) await loadSites();
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
  }, [loadSites]);

  React.useEffect(() => {
    if (step === 0) setStreamReady(false);
  }, [step]);

  const resetCaptureFlow = React.useCallback(() => {
    camRef.current?.stop();
    setSelfie(null);
    setStep(0);
    setGps(null);
    setStreamReady(false);
  }, []);

  useResetCaptureWhenSiteChanges(siteId, resetCaptureFlow);

  const retakeSelfie = useRetakeSelfieCamera({
    step,
    selfie,
    camRef,
    setSelfie,
    setStep,
    setStreamReady,
  });

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

  const submitCheckOut = async () => {
    if (!siteId || !gps || !selfie) return;
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
          ...(proxyForUid ? { forWorkerId: proxyForUid } : {}),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        distanceM?: number;
        radiusM?: number;
      };
      if (!res.ok) {
        if (
          res.status === 403 &&
          data.error === "Outside site radius" &&
          typeof data.distanceM === "number" &&
          typeof data.radiusM === "number"
        ) {
          setRadiusError({ distanceM: data.distanceM, radiusM: data.radiusM });
          return;
        }
        toast.error(data.error ?? "Check-out failed");
        return;
      }
      setSuccessFeedback(true);
      setRadiusError(null);
      resetCaptureFlow();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-out failed");
    } finally {
      setBusy(false);
    }
  };

  const onPrimaryClick = async () => {
    setRadiusError(null);
    if (!siteId) {
      toast.message("Select the site that matches your active check-in.");
      return;
    }

    if (step === 0) {
      setBusy(true);
      try {
        setStreamReady(false);
        const g = await getGpsFix();
        setGps(g);
        await camRef.current?.start();
        setStep(1);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not start check-out");
        setGps(null);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 1) {
      if (!streamReady) return;
      setBusy(true);
      try {
        await camRef.current?.capture();
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 2) {
      await submitCheckOut();
    }
  };

  const primaryDisabled =
    busy ||
    (step === 1 && !streamReady) ||
    (step === 2 && (!gps || !selfie));

  const primaryHint =
    step === 0
      ? "Tap once to capture location and open the camera."
      : step === 1
        ? "Tap again to take your selfie."
        : "Tap again to send check-out.";

  return (
    <Card id="employee-check-out">
      <CardHeader>
        <CardTitle>Check out</CardTitle>
        <CardDescription>
          {proxyForUid ? (
            <>
              End the <strong className="text-zinc-200">selected coworker&apos;s</strong> open session for
              today. Site must match their active check-in.
            </>
          ) : (
            <>
              Same three-tap flow as check-in. Pick the site you are finishing at (your current segment).
              No &ldquo;Custom site&rdquo; here — check-out is only at an existing location you already opened
              today.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:gap-6">
        <SiteSelectWithCustomRow
          label="Site"
          sites={sites}
          value={siteId}
          onChange={setSiteId}
          onRefreshSites={loadSites}
          showCustomSiteButton={false}
        />

        {isAdminLike && gps ? (
          <p className="text-xs font-mono text-zinc-500">
            Admin debug: {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)}
            {gps.accuracyM != null && ` (±${Math.round(gps.accuracyM)}m)`}
          </p>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs text-zinc-500">Camera</p>
          {!selfie ? (
            <CameraCapture
              ref={camRef}
              hideControls
              onStreamReady={() => setStreamReady(true)}
              onCapture={(url) => {
                setSelfie(url);
                setStep(2);
              }}
              onError={(err) => toast.error(err)}
            />
          ) : (
            <SelfiePreviewWithRetake
              src={selfie}
              alt="Check-out preview"
              onRetake={retakeSelfie}
            />
          )}
        </div>

        {radiusError ? (
          <OutOfSiteRadiusAlert
            distanceM={radiusError.distanceM}
            radiusM={radiusError.radiusM}
            context="check-out"
            onDismiss={() => setRadiusError(null)}
          />
        ) : null}

        {successFeedback ? (
          <ResultModal
            open
            variant="success"
            title="Checked out"
            description="Your work session for today is closed. Have a good rest."
            onDismiss={() => setSuccessFeedback(false)}
          />
        ) : null}

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={primaryDisabled}
            onClick={() => void onPrimaryClick()}
          >
            {busy
              ? step === 0
                ? "Starting…"
                : step === 1
                  ? "Capturing…"
                  : "Submitting…"
              : "Submit check-out"}
          </Button>
          <p className="text-xs text-zinc-500">{primaryHint}</p>
        </div>

      </CardContent>
    </Card>
  );
}
