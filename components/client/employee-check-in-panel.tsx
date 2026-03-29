"use client";

import * as React from "react";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { Skeleton } from "@/components/ui/skeleton";

type Site = { id: string; name?: string };

type RadiusErr = { distanceM: number; radiusM: number };

/** 0 = need GPS+camera, 1 = need selfie capture, 2 = ready to POST */
type FlowStep = 0 | 1 | 2;

function EmployeeCheckInPanelSkeleton() {
  return (
    <Card id="employee-check-in">
      <CardHeader>
        <CardTitle>Check in</CardTitle>
        <CardDescription>
          <Skeleton className="inline-block h-3 w-full max-w-md" />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-40 rounded-xl" />
      </CardContent>
    </Card>
  );
}

const WORK_HOME_PATH = "/dashboard/employee";

function EmployeeCheckInPanelInner({ proxyForUid }: { proxyForUid?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useDashboardUser();
  const isAdminLike =
    user?.role === "admin" || user?.role === "super_admin";
  /**
   * Set only when landing with `?fromAssignment=1` from the bell “Go to Work” link.
   * Cleared when leaving the main Work page, after successful check-in, or on full refresh (no URL flag).
   */
  const [assignmentFilterIds, setAssignmentFilterIds] = React.useState<string[] | null>(null);

  React.useEffect(() => {
    const normalized = pathname.replace(/\/$/, "") || "/";
    if (normalized !== WORK_HOME_PATH) {
      setAssignmentFilterIds(null);
    }
  }, [pathname]);

  const [sites, setSites] = React.useState<Site[]>([]);
  const [siteId, setSiteId] = React.useState("");
  const [gps, setGps] = React.useState<GpsResult | null>(null);
  const [selfie, setSelfie] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<FlowStep>(0);
  const [streamReady, setStreamReady] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    variant: "success" | "warning";
    title: string;
    description?: string;
  } | null>(null);
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
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Load failed");
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

  const queryKey = searchParams.toString();

  React.useEffect(() => {
    const params = new URLSearchParams(queryKey);
    if (params.get("fromAssignment") !== "1") return;

    const raw = params.get("assignmentSites");
    const ids = raw
      ? raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (ids.length === 0) {
      setAssignmentFilterIds(null);
    } else {
      setAssignmentFilterIds(ids);
    }

    resetCaptureFlow();
    router.replace(`${WORK_HOME_PATH}#employee-check-in`, { scroll: false });
  }, [queryKey, router, resetCaptureFlow]);

  /** Notification / Assigned-tab “suggested” sites — only used for default pick + banner, not for hiding other sites. */
  const fromAssignmentFlow = assignmentFilterIds !== null;

  const assignmentSiteLabels = React.useMemo(() => {
    if (!assignmentFilterIds?.length) return [] as string[];
    return assignmentFilterIds.map((id) => {
      const s = sites.find((x) => x.id === id);
      return s?.name?.trim() ? s.name : id;
    });
  }, [assignmentFilterIds, sites]);

  React.useEffect(() => {
    if (sites.length === 0) return;
    setSiteId((prev) => {
      if (prev && sites.some((s) => s.id === prev)) return prev;
      if (assignmentFilterIds?.length) {
        const preferred = assignmentFilterIds.find((id) => sites.some((s) => s.id === id));
        if (preferred) return preferred;
      }
      return "";
    });
  }, [sites, assignmentFilterIds]);

  const assignmentMismatch =
    assignmentFilterIds !== null &&
    assignmentFilterIds.length > 0 &&
    sites.length > 0 &&
    !assignmentFilterIds.some((id) => sites.some((s) => s.id === id));

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

  const submitCheckIn = async () => {
    if (!siteId || !gps || !selfie) return;
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
        const errText =
          data.error ??
          (typeof data.distanceM === "number"
            ? `Too far from site (~${data.distanceM}m).`
            : "Check-in failed");
        if (
          res.status === 409 &&
          typeof errText === "string" &&
          errText.toLowerCase().includes("already checked in")
        ) {
          setFeedback({
            variant: "warning",
            title: "Already checked in",
            description:
              "You have an open session today. Use Check out to end your day, or Switch work site if you moved to another location.",
          });
          return;
        }
        toast.error(errText);
        return;
      }
      const dm =
        typeof data.distanceM === "number" && Number.isFinite(data.distanceM)
          ? String(Math.round(data.distanceM))
          : "?";
      setFeedback({
        variant: "success",
        title: "Checked in",
        description: `Your attendance was recorded. About ${dm} m from the site center.`,
      });
      setRadiusError(null);
      setAssignmentFilterIds(null);
      resetCaptureFlow();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  };

  const onPrimaryClick = async () => {
    setRadiusError(null);
    if (!siteId) {
      toast.message("Select a work site first.");
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
        toast.error(e instanceof Error ? e.message : "Could not start check-in");
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
      await submitCheckIn();
    }
  };

  const primaryDisabled =
    busy ||
    (step === 0 && !siteId) ||
    (step === 1 && !streamReady) ||
    (step === 2 && (!gps || !selfie));

  const primaryHint =
    step === 0 && !siteId
      ? "Choose a site from the list first."
      : step === 0
        ? "Tap once to capture location and open the camera."
        : step === 1
          ? "Tap again to take your selfie."
          : "Tap again to send check-in.";

  return (
    <Card id="employee-check-in">
      <CardHeader>
        <CardTitle>Check in</CardTitle>
        <CardDescription>
          {proxyForUid ? (
            <>
              Recording attendance for the <strong className="text-zinc-200">selected coworker</strong>.
              GPS and selfie are validated on the server.
            </>
          ) : (
            <>
              One button: first tap gets your location and opens the camera; second tap saves your
              selfie; third tap submits. Coordinates are hidden — admins see a debug line only.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:gap-6">
        {fromAssignmentFlow && assignmentSiteLabels.length > 0 ? (
          <p
            className="border-l-2 border-cyan-500/30 pl-3 text-xs text-zinc-400"
            role="status"
          >
            <strong className="font-medium text-zinc-300">Go to Work</strong> — suggested for this
            assignment: {assignmentSiteLabels.join(", ")}. Choose a site below (your admin may restrict
            which sites you can use for check-in).{" "}
            <strong className="text-zinc-300">Switch</strong> and <strong className="text-zinc-300">Check out</strong>{" "}
            use the same site list (not tied to this notification).
          </p>
        ) : fromAssignmentFlow ? (
          <p
            className="border-l-2 border-cyan-500/30 pl-3 text-xs text-zinc-400"
            role="status"
          >
            Opened from <strong className="text-zinc-300">Go to Work</strong>. Pick a site below (suggested
            list may apply). Switch and Check out use the full site list.
          </p>
        ) : null}
        {assignmentMismatch ? (
          <p className="text-xs text-amber-200/90" role="status">
            None of the sites from this notification match your current list. Refresh the page or ask
            your admin if assignments changed.
          </p>
        ) : null}
        <SiteSelectWithCustomRow
          label="Site"
          sites={sites}
          value={siteId}
          onChange={setSiteId}
          onRefreshSites={loadSites}
          showCustomSiteButton
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
              alt="Check-in preview"
              onRetake={retakeSelfie}
            />
          )}
        </div>

        {radiusError ? (
          <OutOfSiteRadiusAlert
            distanceM={radiusError.distanceM}
            radiusM={radiusError.radiusM}
            context="check-in"
            onDismiss={() => setRadiusError(null)}
          />
        ) : null}

        {feedback ? (
          <ResultModal
            open={!!feedback}
            variant={feedback.variant}
            title={feedback.title}
            description={feedback.description}
            onDismiss={() => setFeedback(null)}
          />
        ) : null}

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            disabled={primaryDisabled}
            onClick={() => void onPrimaryClick()}
          >
            {busy
              ? step === 0
                ? "Starting…"
                : step === 1
                  ? "Capturing…"
                  : "Submitting…"
              : "Submit check-in"}
          </Button>
          <p className="text-xs text-zinc-500">{primaryHint}</p>
        </div>

      </CardContent>
    </Card>
  );
}

export function EmployeeCheckInPanel({ proxyForUid }: { proxyForUid?: string } = {}) {
  return (
    <Suspense fallback={<EmployeeCheckInPanelSkeleton />}>
      <EmployeeCheckInPanelInner proxyForUid={proxyForUid} />
    </Suspense>
  );
}
