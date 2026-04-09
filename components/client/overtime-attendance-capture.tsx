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
import { CameraCapture, type CameraCaptureHandle } from "@/components/client/camera-capture";
import { SelfiePreviewWithRetake, useRetakeSelfieCamera } from "@/components/client/selfie-preview-with-retake";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { OutOfSiteRadiusAlert } from "@/components/client/out-of-site-radius-alert";
import { ResultModal } from "@/components/client/feedback-modals";
import { getGpsFix, type GpsResult } from "@/lib/client/geolocation";
import { toast } from "sonner";
import { getFirebaseAuth } from "@/lib/firebase/client";

type FlowStep = 0 | 1 | 2;

type RadiusErr = { distanceM: number; radiusM: number };

type Props = {
  requestId: string;
  mode: "check-in" | "check-out";
  siteLabel: string;
  onComplete: () => void;
};

export function OvertimeAttendanceCapture({
  requestId,
  mode,
  siteLabel,
  onComplete,
}: Props) {
  const { user } = useDashboardUser();
  const isAdminLike =
    user?.role === "admin" || user?.role === "super_admin";

  const [gps, setGps] = React.useState<GpsResult | null>(null);
  const [selfie, setSelfie] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<FlowStep>(0);
  const [streamReady, setStreamReady] = React.useState(false);
  const [showSuccess, setShowSuccess] = React.useState(false);
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

  React.useEffect(() => {
    if (step === 0) setStreamReady(false);
  }, [step]);

  const retakeSelfie = useRetakeSelfieCamera({
    step,
    selfie,
    camRef,
    setSelfie,
    setStep,
    setStreamReady,
  });

  /** Open camera when this request loads (same idea as work check-in after site is chosen). */
  React.useEffect(() => {
    setStep(0);
    setSelfie(null);
    setGps(null);
    setStreamReady(false);
    setShowSuccess(false);
    setRadiusError(null);
    let cancelled = false;
    const id = window.setTimeout(() => {
      void (async () => {
        if (cancelled) return;
        setRadiusError(null);
        setStreamReady(false);
        const cam = camRef.current;
        if (!cam) {
          toast.error("Camera not ready");
          return;
        }
        setBusy(true);
        try {
          await cam.start();
          if (!cancelled) setStep(1);
        } catch (e) {
          camRef.current?.stop();
          toast.error(e instanceof Error ? e.message : "Could not open camera");
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
      camRef.current?.stop();
    };
  }, [requestId, mode]);

  const uploadSelfie = async (dataUrl: string) => {
    const h = await authHeaders();
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({
        base64: dataUrl,
        filename: mode === "check-in" ? "overtime-in.webp" : "overtime-out.webp",
        contentType: "image/webp",
      }),
    });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Upload failed");
    return data.url!;
  };

  const submitToApi = async () => {
    if (!gps || !selfie) return;
    setBusy(true);
    try {
      const photoUrl = await uploadSelfie(selfie);
      const h = await authHeaders();
      const path =
        mode === "check-in" ? "/api/overtime/check-in" : "/api/overtime/check-out";
      const res = await fetch(path, {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracyM: gps.accuracyM,
          photoUrl,
          timezoneOffset: new Date().getTimezoneOffset(),
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
        throw new Error(data.error ?? "Request failed");
      }
      setShowSuccess(true);
      setRadiusError(null);
      camRef.current?.stop();
      setSelfie(null);
      setStep(0);
      setGps(null);
      setStreamReady(false);
      onComplete();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const onPrimaryClick = async () => {
    setRadiusError(null);

    if (step === 0) return;

    if (step === 1) {
      if (!streamReady) return;
      setBusy(true);
      try {
        const gpsPromise = getGpsFix();
        await camRef.current?.capture();
        const g = await gpsPromise;
        setGps(g);
      } catch (e) {
        const msg = (e instanceof Error ? e.message : "").toLowerCase();
        toast.error(
          msg.includes("permission") || msg.includes("denied") || msg.includes("blocked")
            ? "Location access denied — enable GPS in your browser settings."
            : msg.includes("timeout") || msg.includes("unavailable")
              ? "GPS signal unavailable — move to an open area and try again."
              : e instanceof Error
                ? e.message
                : "Could not get your location. Make sure GPS is enabled."
        );
        setGps(null);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 2) {
      await submitToApi();
    }
  };

  const primaryDisabled =
    busy ||
    step === 0 ||
    (step === 1 && !streamReady) ||
    (step === 2 && (!gps || !selfie));

  const title = mode === "check-in" ? "Overtime check-in" : "Overtime check-out";
  const hint =
    step === 0
      ? "Camera opens automatically. Then capture selfie — GPS is taken at the same moment."
      : step === 1
        ? "Tap to capture selfie (GPS captured now)."
        : "Tap again to send.";

  return (
    <Card className="border-violet-500/20 bg-violet-500/[0.03]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          Site: <strong className="text-zinc-200">{siteLabel}</strong> — same flow as work check-in:
          camera opens first; GPS is captured when you take the selfie; one more tap to submit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdminLike && gps ? (
          <p className="text-xs font-mono text-zinc-500">
            Admin debug: {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)}
            {gps.accuracyM != null && ` (±${Math.round(gps.accuracyM)}m)`}
          </p>
        ) : null}

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
          <SelfiePreviewWithRetake src={selfie} alt={title} onRetake={retakeSelfie} />
        )}

        {radiusError ? (
          <OutOfSiteRadiusAlert
            distanceM={radiusError.distanceM}
            radiusM={radiusError.radiusM}
            context={mode === "check-in" ? "check-in" : "check-out"}
            onDismiss={() => setRadiusError(null)}
          />
        ) : null}

        {showSuccess ? (
          <ResultModal
            open
            variant="success"
            title={mode === "check-in" ? "Overtime check-in recorded" : "Overtime check-out recorded"}
            description={
              mode === "check-in"
                ? "Your overtime start time was saved with GPS and photo proof."
                : "Your overtime session is complete for this request."
            }
            onDismiss={() => setShowSuccess(false)}
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
                ? "Opening camera…"
                : step === 1
                  ? "Capturing…"
                  : "Submitting…"
              : step === 0
                ? "Preparing camera…"
                : step === 1
                  ? "Capture"
                  : mode === "check-in"
                    ? "Submit overtime check-in"
                    : "Submit overtime check-out"}
          </Button>
          <p className="text-xs text-zinc-500">{hint}</p>
        </div>

      </CardContent>
    </Card>
  );
}
