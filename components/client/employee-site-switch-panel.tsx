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
import { CameraCapture, type CameraCaptureHandle } from "@/components/client/camera-capture";
import {
  SelfiePreviewWithRetake,
  useResetCaptureWhenSiteChanges,
  useRetakeSelfieCamera,
} from "@/components/client/selfie-preview-with-retake";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { OutOfSiteRadiusAlert } from "@/components/client/out-of-site-radius-alert";
import { ResultModal } from "@/components/client/feedback-modals";
import { SiteSelectWithCustomRow } from "@/components/client/site-select-with-custom-row";
import { toast } from "sonner";
import { getGpsFix, type GpsResult } from "@/lib/client/geolocation";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { calendarDateKeyInTimeZone } from "@/lib/date/calendar-day-key";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Site = { id: string; name?: string };
type TodayPayload = {
  siteId: string | null;
  checkIn: { atMs: number | null } | null;
  checkOut: { atMs: number | null } | null;
  error?: string;
};

type FlowStep = 0 | 1 | 2;
type RadiusErr = { distanceM: number; radiusM: number };

export function EmployeeSiteSwitchPanel({
  proxyForUid,
  subjectTimeZone,
}: {
  proxyForUid?: string;
  /** Required when `proxyForUid` is set — worker’s IANA zone for the attendance day key. */
  subjectTimeZone?: string;
} = {}) {
  const { user } = useDashboardUser();
  const pathname = usePathname();
  const [expanded, setExpanded] = React.useState(false);
  const [sites, setSites] = React.useState<Site[]>([]);
  const [siteNames, setSiteNames] = React.useState<Record<string, string>>({});
  const [currentSiteId, setCurrentSiteId] = React.useState<string | null>(null);
  const [sessionOpen, setSessionOpen] = React.useState(false);
  const [siteId, setSiteId] = React.useState("");
  const [gps, setGps] = React.useState<GpsResult | null>(null);
  const [selfie, setSelfie] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<FlowStep>(0);
  const [streamReady, setStreamReady] = React.useState(false);
  const [switchSuccess, setSwitchSuccess] = React.useState<{
    distanceM: string;
  } | null>(null);
  const [radiusError, setRadiusError] = React.useState<RadiusErr | null>(null);
  const [busy, setBusy] = React.useState(false);
  const camRef = React.useRef<CameraCaptureHandle>(null);

  React.useEffect(() => {
    const n = pathname.replace(/\/$/, "") || "/";
    if (n === "/dashboard/employee/switch") {
      setExpanded(true);
    }
    const syncHash = () => {
      if (typeof window === "undefined") return;
      if (window.location.hash === "#employee-site-switch") {
        setExpanded(true);
      }
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [pathname]);

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
    const list = data.sites ?? [];
    setSites(list);
    const names: Record<string, string> = {};
    for (const s of list) {
      names[s.id] = s.name ?? s.id;
    }
    setSiteNames(names);
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
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    let unsubDoc: (() => void) | undefined;

    if (proxyForUid) {
      let cancelled = false;
      const run = async () => {
        try {
          const u = auth.currentUser;
          if (!u || !proxyForUid) {
            if (!cancelled) {
              setSessionOpen(false);
              setCurrentSiteId(null);
            }
            return;
          }
          const token = await u.getIdToken();
          const day = calendarDateKeyInTimeZone(new Date(), normalizeTimeZoneId(subjectTimeZone));
          const qs = new URLSearchParams({ day, workerId: proxyForUid });
          const res = await fetch(`/api/attendance/today?${qs.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = (await res.json()) as TodayPayload;
          if (!res.ok) {
            if (!cancelled) {
              setSessionOpen(false);
              setCurrentSiteId(null);
            }
            return;
          }
          if (cancelled) return;
          const open = !!(data.checkIn && !data.checkOut);
          const sid = open ? data.siteId ?? null : null;
          setSessionOpen(open);
          setCurrentSiteId(sid);
        } catch {
          if (!cancelled) {
            setSessionOpen(false);
            setCurrentSiteId(null);
          }
        }
      };
      void run();
      const t = window.setInterval(() => void run(), 45_000);
      const onUpdated = () => void run();
      window.addEventListener("attendance-updated", onUpdated);
      return () => {
        cancelled = true;
        window.clearInterval(t);
        window.removeEventListener("attendance-updated", onUpdated);
      };
    }

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      unsubDoc?.();
      unsubDoc = undefined;
      setSessionOpen(false);
      setCurrentSiteId(null);
      if (!u) return;
      const workerId = proxyForUid ?? u.uid;
      const tz = proxyForUid
        ? normalizeTimeZoneId(subjectTimeZone)
        : normalizeTimeZoneId(user?.timeZone);
      const day = calendarDateKeyInTimeZone(new Date(), tz);
      const ref = doc(db, "attendance", `${workerId}_${day}`);
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
  }, [user?.timeZone, proxyForUid, subjectTimeZone]);

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

  React.useEffect(() => {
    if (!sessionOpen) {
      resetCaptureFlow();
      setSiteId("");
      setRadiusError(null);
    }
  }, [sessionOpen, resetCaptureFlow]);

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

  const submitSwitch = async () => {
    if (!siteId || !gps || !selfie) return;
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
        toast.error(
          data.error ??
            (typeof data.distanceM === "number"
              ? `Too far from site (~${data.distanceM}m).`
              : "Switch failed")
        );
        return;
      }
      const dm =
        typeof data.distanceM === "number" && Number.isFinite(data.distanceM)
          ? String(Math.round(data.distanceM))
          : "?";
      setSwitchSuccess({ distanceM: dm });
      setRadiusError(null);
      resetCaptureFlow();
      setSiteId("");
      window.dispatchEvent(new Event("attendance-updated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Switch failed");
    } finally {
      setBusy(false);
    }
  };

  const onPrimaryClick = async () => {
    setRadiusError(null);
    if (!siteId) {
      toast.message("Select the site you are moving to.");
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
      await submitSwitch();
    }
  };

  const primaryDisabled =
    busy ||
    (step === 1 && !streamReady) ||
    (step === 2 && (!gps || !selfie));

  const primaryHint =
    step === 0
      ? "Select new site to open camera."
      : step === 1
        ? "Tap to capture selfie (GPS captured now)."
        : "Tap again to confirm switch — records check-out from your current site, not end-of-day.";

  const otherSites = sites.filter((s) => s.id !== currentSiteId);

  const expandedBody = !sessionOpen ? (
    <Card className="bg-zinc-50/90 dark:bg-white/[0.02]">
      <CardHeader>
        <CardTitle className="text-base">Switch work site</CardTitle>
        <CardDescription>
          After you <strong className="text-zinc-300">check in</strong>, this section becomes active.
          Switching records a <strong className="text-zinc-300">check-out from the site you are leaving</strong>{" "}
          (same GPS + selfie at the <strong className="text-zinc-300">new</strong> site) and keeps your day
          open. Your <strong className="text-zinc-300">final check-out</strong> is only when you use{" "}
          <strong className="text-zinc-300">Check out</strong> — not here.
        </CardDescription>
      </CardHeader>
    </Card>
  ) : otherSites.length === 0 ? (
    <Card className="bg-zinc-50/90 dark:bg-white/[0.02]">
      <CardHeader>
        <CardTitle className="text-base">Switch work site</CardTitle>
        <CardDescription>
          There is only one work site in your workspace besides where you are now, so there is nowhere to
          switch to. An admin can add another site if your org works from multiple locations.
        </CardDescription>
      </CardHeader>
    </Card>
  ) : (
    <Card className="border-cyan-500/25 bg-gradient-to-br from-cyan-500/[0.07] to-transparent">
      <CardHeader>
        <CardTitle>Switch work site</CardTitle>
        <CardDescription>
          {currentSiteId ? (
            <>
              You are checked in at &ldquo;{siteNames[currentSiteId] ?? currentSiteId}&rdquo;. You must stay
              at least <strong className="text-zinc-200">1 hour</strong> on the current site before switching
              elsewhere (rule enforced on submit). Same flow as check-in: pick the new site, then GPS +
              selfie at that site. Records segment check-out from the current site only — your day stays open
              until <strong className="text-zinc-300">Check out</strong>. You can pick <strong className="text-zinc-300">any work site</strong>{" "}
              (not limited to admin assignments — those apply to <strong className="text-zinc-300">Check in</strong>
              only). The bell &ldquo;Go to Work&rdquo; link only nudges check-in.
            </>
          ) : (
            "You are checked in."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:gap-6">
        <SiteSelectWithCustomRow
          label="New site"
          sites={otherSites}
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
              alt="Site switch preview"
              onRetake={retakeSelfie}
            />
          )}
        </div>

        {radiusError ? (
          <OutOfSiteRadiusAlert
            distanceM={radiusError.distanceM}
            radiusM={radiusError.radiusM}
            context="site-switch"
            onDismiss={() => setRadiusError(null)}
          />
        ) : null}

        {switchSuccess ? (
          <ResultModal
            open
            variant="success"
            title="Site switched"
            description={
              <>
                <p>
                  Segment check-out from your previous site was recorded. Proof was captured about{" "}
                  <strong className="text-emerald-100">{switchSuccess.distanceM} m</strong> from the new
                  site center. Your day stays open until you use Check out.
                </p>
              </>
            }
            onDismiss={() => setSwitchSuccess(null)}
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
                ? "Opening camera…"
                : step === 1
                  ? "Capturing…"
                  : "Submitting…"
              : step === 1
                ? "Capture"
                : "Submit site switch"}
          </Button>
          <p className="text-xs text-zinc-500">{primaryHint}</p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div id="employee-site-switch" className="scroll-mt-28">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="employee-site-switch-panel"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200/90 bg-zinc-50 px-4 py-3 text-left text-zinc-900 transition-colors hover:border-cyan-500/40 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.05]",
          expanded && "rounded-b-none border-b-transparent"
        )}
      >
        <div className="min-w-0">
          <span className="text-sm font-semibold tracking-wide">Switch</span>
          {sessionOpen && currentSiteId ? (
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              At “{siteNames[currentSiteId] ?? currentSiteId}”
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">Move to another site (after check-in)</p>
          )}
        </div>
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-lg font-light leading-none text-zinc-700 dark:border-white/15 dark:bg-black/30 dark:text-zinc-200"
          aria-hidden
        >
          {expanded ? "−" : "+"}
        </span>
      </button>
      {expanded ? (
        <div
          id="employee-site-switch-panel"
          className="rounded-b-xl border border-t-0 border-zinc-200/80 bg-zinc-50/90 px-3 pb-3 pt-1 dark:border-white/10 dark:bg-white/[0.02]"
        >
          <div className="pt-2">{expandedBody}</div>
        </div>
      ) : null}
    </div>
  );
}
