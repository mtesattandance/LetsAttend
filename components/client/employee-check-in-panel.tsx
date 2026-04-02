"use client";

import * as React from "react";
import { Suspense } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { CheckCircle2, TimerOff, X } from "lucide-react";
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
import { calendarDateKeyInTimeZone } from "@/lib/date/calendar-day-key";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";
import { cn } from "@/lib/utils";

import Link from "next/link";

type Site = { id: string; name?: string; workdayStartUtc?: string; workdayEndUtc?: string };

/** null = no window configured, 'early' = before shift, 'open' = within shift, 'late' = after shift */
type WorkWindow = "early" | "open" | "late" | null;

type RadiusErr = { distanceM: number; radiusM: number };

/** 0 = need GPS+camera, 1 = need selfie capture, 2 = ready to POST */
type FlowStep = 0 | 1 | 2;
type TodayPayload = {
  siteId: string | null;
  checkIn: { atMs: number | null } | null;
  checkOut: { atMs: number | null } | null;
  error?: string;
};

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
  const [workWindow, setWorkWindow] = React.useState<WorkWindow>(null);
  const [minutesOff, setMinutesOff] = React.useState(0); // how early (negative) or late (positive) in minutes
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const camRef = React.useRef<CameraCaptureHandle>(null);
  const displayTz = normalizeTimeZoneId(user?.timeZone);

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
    if (proxyForUid) return;
    let cancelled = false;
    const run = async () => {
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) return;
        const token = await u.getIdToken();
        const day = calendarDateKeyInTimeZone(new Date(), displayTz);
        const res = await fetch(`/api/attendance/today?day=${encodeURIComponent(day)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as TodayPayload;
        if (!res.ok || cancelled) return;
        const open = !!data.checkIn && !data.checkOut;
        setDone(open);
        if (open && data.siteId) setSiteId(data.siteId);
      } catch {
        /* ignore */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [displayTz, proxyForUid]);

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

  // Helper: convert a site's "HH:MM NPT" wall-clock string to epoch ms for that time today.
  // Uses a fake-UTC trick to derive the exact TZ offset — avoids the Intl hour:24 midnight bug.
  const wallHmToMs = React.useCallback((hm: string): number | null => {
    const match = /^(\d{2}):(\d{2})$/.exec(hm);
    if (!match) return null;
    const targetH = Number(match[1]);
    const targetM = Number(match[2]);
    try {
      const now = new Date();
      // Get all date+time components for "now" in the user's display TZ.
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: displayTz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      const parts = fmt.formatToParts(now);
      const get = (type: string) =>
        Number(parts.find((x) => x.type === type)?.value ?? 0);
      const y  = get("year");
      const mo = get("month");
      const d  = get("day");
      const lh = get("hour") % 24; // hour12:false can return 24 at midnight — clamp it
      const lm = get("minute");
      const ls = get("second");
      // "Fake UTC" timestamp: treat the local wall-clock reading AS IF it were UTC.
      const fakeNowUtcMs = Date.UTC(y, mo - 1, d, lh, lm, ls);
      // Actual TZ offset (positive east of UTC, e.g. +5:45 for NPT = 20700000 ms)
      const tzOffsetMs = fakeNowUtcMs - now.getTime();
      // Target epoch: today in displayTz at targetH:targetM, converted to UTC
      return Date.UTC(y, mo - 1, d, targetH, targetM, 0) - tzOffsetMs;
    } catch {
      return null;
    }
  }, [displayTz]);

  // Evaluate work window status whenever site or time changes (re-checks every 60s)
  React.useEffect(() => {
    const evaluate = () => {
      if (!siteId) { setWorkWindow(null); return; }
      const site = sites.find((s) => s.id === siteId);
      const startMs = site?.workdayStartUtc ? wallHmToMs(site.workdayStartUtc) : null;
      const endMs   = site?.workdayEndUtc   ? wallHmToMs(site.workdayEndUtc)   : null;
      const now = Date.now();

      if (endMs != null && now >= endMs) {
        setWorkWindow("late");
        setMinutesOff(Math.round((now - endMs) / 60_000));
      } else if (startMs != null && now < startMs) {
        setWorkWindow("early");
        setMinutesOff(Math.round((startMs - now) / 60_000));
      } else if (startMs != null || endMs != null) {
        setWorkWindow("open");
        setMinutesOff(0);
      } else {
        // No window configured — allow freely
        setWorkWindow(null);
        setMinutesOff(0);
      }
    };
    evaluate();
    const t = window.setInterval(evaluate, 60_000);
    return () => window.clearInterval(t);
  }, [siteId, sites, wallHmToMs]);

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
      setDone(true);
      resetCaptureFlow();
      window.dispatchEvent(new Event("attendance-updated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  };

  const startCaptureFlow = React.useCallback(async () => {
    setRadiusError(null);
    if (!siteId || busy || step !== 0 || done) return;
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
  }, [busy, done, siteId, step]);

  React.useEffect(() => {
    if (!siteId) return;
    void startCaptureFlow();
  }, [siteId, startCaptureFlow]);

  const onPrimaryClick = async () => {
    setRadiusError(null);
    if (!siteId) {
      toast.message("Select a work site first.");
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
        const msg = e instanceof Error ? e.message : "";
        toast.error(
          msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied")
            ? "Location access denied — enable GPS in your browser settings."
            : msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("unavailable")
              ? "GPS signal unavailable — move to an open area and try again."
              : "Could not get your location. Make sure GPS is enabled."
        );
        setGps(null);
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
    done ||
    workWindow === "late" ||
    (step === 0 && !siteId) ||
    (step === 1 && !streamReady) ||
    (step === 2 && (!gps || !selfie));

  const primaryHint =
    step === 0 && !siteId
      ? "Choose a site from the list first."
      : step === 0
        ? "Select site to open camera."
        : step === 1
          ? "Tap to capture selfie (GPS captured now)."
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
              Select your site to open camera. GPS is captured when you click picture.
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

        {/* Work window warning — full-screen portal modal when outside the site's working hours */}
        {(workWindow === "late" || workWindow === "early") && !done
          ? createPortal(
              <div
                className="fixed inset-0 z-[8000] flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md"
                role="presentation"
                onClick={() => { setSiteId(""); }}
              >
                <div
                  role="alertdialog"
                  aria-modal="true"
                  className={cn(
                    "relative w-full max-w-lg overflow-hidden rounded-2xl border-2 p-6 shadow-2xl ring-1",
                    workWindow === "late"
                      ? "border-red-500/50 bg-gradient-to-b from-zinc-900/98 to-red-950/95 shadow-[0_0_60px_-12px_rgba(239,68,68,0.65)] ring-red-400/25"
                      : "border-amber-500/50 bg-gradient-to-b from-zinc-900/98 to-amber-950/95 shadow-[0_0_60px_-12px_rgba(251,191,36,0.5)] ring-amber-400/25"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* X close button — resets site selection */}
                  <button
                    type="button"
                    aria-label="Dismiss and choose another site"
                    className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
                    onClick={() => { setSiteId(""); }}
                  >
                    <X className="size-5" />
                  </button>

                  <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-left">
                    <div
                      className={cn(
                        "flex size-16 shrink-0 items-center justify-center rounded-full text-white shadow-lg ring-4",
                        workWindow === "late"
                          ? "bg-red-600 shadow-[0_0_28px_-4px_rgba(239,68,68,0.95)] ring-red-500/40"
                          : "bg-amber-500 shadow-[0_0_28px_-4px_rgba(251,191,36,0.9)] ring-amber-400/40"
                      )}
                    >
                      <TimerOff className="size-8" aria-hidden />
                    </div>

                    <div className="min-w-0 flex-1">
                      {workWindow === "late" ? (
                        <>
                          <h2 className="text-xl font-semibold tracking-tight text-red-50">
                            Site working hours have ended
                          </h2>
                          <p className="mt-3 text-sm leading-relaxed text-red-100/90">
                            You are{" "}
                            <strong className="font-semibold text-white">
                              {minutesOff >= 60
                                ? `${Math.floor(minutesOff / 60)}h ${minutesOff % 60}m`
                                : `${minutesOff}m`}
                            </strong>{" "}
                            past the site&apos;s scheduled end time. Regular check-in is
                            not allowed after hours — submit an overtime request to
                            record attendance.
                          </p>
                        </>
                      ) : (
                        <>
                          <h2 className="text-xl font-semibold tracking-tight text-amber-50">
                            You are too early
                          </h2>
                          <p className="mt-3 text-sm leading-relaxed text-amber-100/90">
                            The site&apos;s shift hasn&apos;t started yet.{" "}
                            <strong className="font-semibold text-white">
                              {minutesOff >= 60
                                ? `${Math.floor(minutesOff / 60)}h ${minutesOff % 60}m`
                                : `${minutesOff}m`}
                            </strong>{" "}
                            remaining before the site opens. Wait for the shift to
                            start, or request overtime if you need to begin early.
                          </p>
                        </>
                      )}

                      <div className="mt-5 flex flex-wrap justify-center gap-3 sm:justify-start">
                        <Link
                          href="/dashboard/employee/overtime"
                          className={cn(
                            "inline-flex min-w-[140px] items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90",
                            workWindow === "late"
                              ? "bg-red-600 text-white hover:bg-red-500"
                              : "bg-amber-500 text-black hover:bg-amber-400"
                          )}
                        >
                          Request Overtime
                        </Link>
                        <button
                          type="button"
                          className="min-w-[140px] rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
                          onClick={() => { setSiteId(""); }}
                        >
                          Choose another site
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )
          : null}


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
            className={done ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}
            disabled={primaryDisabled}
            onClick={() => void onPrimaryClick()}
          >
            {done ? (
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="size-4" aria-hidden />
                You are checked in
              </span>
            ) : busy
              ? step === 0
                ? "Opening camera…"
                : step === 1
                  ? "Capturing…"
                  : "Submitting…"
              : step === 1
                ? "Capture"
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
