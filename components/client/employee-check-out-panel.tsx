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
import { OutOfSiteRadiusAlert } from "@/components/client/out-of-site-radius-alert";
import { ResultModal } from "@/components/client/feedback-modals";
import { getGpsFix, type GpsResult } from "@/lib/client/geolocation";
import { toast } from "sonner";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { SiteSelectWithCustomRow } from "@/components/client/site-select-with-custom-row";
import { calendarDateKeyInTimeZone } from "@/lib/date/calendar-day-key";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";
import { from24hUtc } from "@/lib/time/utc-12h";

type Site = { id: string; name?: string };

type RadiusErr = { distanceM: number; radiusM: number };

type FlowStep = 0 | 1 | 2;
type CheckoutWindowState = "no_schedule" | "too_early" | "open" | "too_late";

type TodayPayload = {
  siteId: string | null;
  checkIn: { atMs: number | null } | null;
  checkOut: { atMs: number | null } | null;
  workdayEndUtc?: string | null;
  checkoutGraceMinutes?: number | null;
  checkoutWindowState?: CheckoutWindowState | null;
  error?: string;
};

function fmtWallHm12h(hm: string | null): string | null {
  if (!hm || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hm.trim())) return null;
  const { h12, m, ap } = from24hUtc(hm.trim());
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

export function EmployeeCheckOutPanel({
  proxyForUid,
}: {
  proxyForUid?: string;
} = {}) {
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
  const [activeSiteId, setActiveSiteId] = React.useState<string | null>(null);
  const [checkoutGate, setCheckoutGate] = React.useState<"ok" | "too_early" | "too_late" | "none">("none");
  const [checkoutHint, setCheckoutHint] = React.useState<{
    workdayEndUtc: string | null;
    checkoutGraceMinutes: number;
  } | null>(null);
  const displayTz = normalizeTimeZoneId(undefined);

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

  const fetchActiveSession = React.useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      const token = await u.getIdToken();
      const day = calendarDateKeyInTimeZone(new Date(), displayTz);
      const qs = new URLSearchParams({ day });
      if (proxyForUid) qs.set("workerId", proxyForUid);
      const res = await fetch(`/api/attendance/today?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as TodayPayload;
      if (!res.ok) return;
      const open = !!data.checkIn && !data.checkOut;
      const sid = open ? data.siteId ?? null : null;
      setActiveSiteId(sid);
      if (sid) setSiteId(sid);
      if (!open || proxyForUid) {
        setCheckoutGate("none");
        setCheckoutHint(null);
      } else {
        const st = data.checkoutWindowState;
        const grace = typeof data.checkoutGraceMinutes === "number" ? data.checkoutGraceMinutes : 30;
        setCheckoutHint({
          workdayEndUtc: data.workdayEndUtc ?? null,
          checkoutGraceMinutes: grace,
        });
        if (st === "too_early") setCheckoutGate("too_early");
        else if (st === "too_late") setCheckoutGate("too_late");
        else setCheckoutGate("ok");
      }
    } catch {
      /* ignore */
    }
  }, [displayTz, proxyForUid]);

  React.useEffect(() => {
    void fetchActiveSession();
    const t = window.setInterval(() => void fetchActiveSession(), 60_000);
    return () => window.clearInterval(t);
  }, [fetchActiveSession]);

  // Re-sync when check-in completes (other panel fires this event)
  React.useEffect(() => {
    const handler = () => void fetchActiveSession();
    window.addEventListener("attendance-updated", handler);
    return () => window.removeEventListener("attendance-updated", handler);
  }, [fetchActiveSession]);

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

  const startCaptureFlow = React.useCallback(async () => {
    if (!siteId || busy || step !== 0) return;
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
      setStep(1);
    } catch (e) {
      camRef.current?.stop();
      toast.error(e instanceof Error ? e.message : "Could not open camera");
      return;
    } finally {
      setBusy(false);
    }
  }, [busy, siteId, step]);

  React.useEffect(() => {
    if (!siteId) return;
    void startCaptureFlow();
  }, [siteId, startCaptureFlow]);

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
      window.dispatchEvent(new Event("attendance-updated"));
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
        toast.error(e instanceof Error ? e.message : "Could not get location");
        setGps(null);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 2) {
      await submitCheckOut();
    }
  };

  const checkoutBlocked =
    !proxyForUid && activeSiteId != null && checkoutGate === "too_late";
  const primaryDisabled =
    busy ||
    (step === 1 && !streamReady) ||
    (step === 2 && (!gps || !selfie || checkoutBlocked));

  const primaryHint =
    step === 0
      ? "Select site to open camera."
      : step === 1
        ? "Tap to capture selfie (GPS captured now)."
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
              Pick the site you are finishing at. Camera opens after site selection.
              GPS is captured when you click picture.
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
          selectDisabled={!!activeSiteId}
        />

        {!proxyForUid && checkoutGate === "too_late" ? (
          <p className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            The check-out window has closed. Time on your current site is not credited until an admin corrects
            your attendance.
          </p>
        ) : null}

        {!proxyForUid && checkoutGate === "too_late" ? (
          <Button
            type="button"
            disabled
            className="w-full cursor-not-allowed bg-red-900/60 text-red-200 opacity-80 hover:bg-red-900/60"
          >
            Auto checkout done
          </Button>
        ) : (
          <>
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
                    ? "Opening camera…"
                    : step === 1
                      ? "Capturing…"
                      : "Submitting…"
                  : step === 1
                    ? "Capture"
                    : "Submit check-out"}
              </Button>
              <p className="text-xs text-zinc-500">{primaryHint}</p>
            </div>
          </>
        )}

      </CardContent>
    </Card>
  );
}
