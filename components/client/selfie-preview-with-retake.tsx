"use client";

import * as React from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CameraCaptureHandle } from "@/components/client/camera-capture";

type FlowStep = 0 | 1 | 2;

export function SelfiePreviewWithRetake({
  src,
  alt,
  onRetake,
  className,
}: {
  src: string;
  alt: string;
  onRetake: () => void;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full max-w-md", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="aspect-video w-full rounded-xl border border-zinc-200/80 bg-black object-contain dark:border-white/10"
      />
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="absolute right-2 top-2 size-9 rounded-full border border-zinc-200/80 bg-background/95 shadow-md backdrop-blur-sm dark:border-white/10"
        onClick={onRetake}
        aria-label="Retake photo"
      >
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

/**
 * After retake: clears preview, returns to step 1, restarts camera once `CameraCapture` remounts.
 */
export function useRetakeSelfieCamera({
  step,
  selfie,
  camRef,
  setSelfie,
  setStep,
  setStreamReady,
}: {
  step: FlowStep;
  selfie: string | null;
  camRef: React.RefObject<CameraCaptureHandle | null>;
  setSelfie: React.Dispatch<React.SetStateAction<string | null>>;
  setStep: React.Dispatch<React.SetStateAction<FlowStep>>;
  setStreamReady: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const retakePendingRef = React.useRef(false);

  const retakeSelfie = React.useCallback(() => {
    retakePendingRef.current = true;
    camRef.current?.stop();
    setSelfie(null);
    setStep(1);
    setStreamReady(false);
  }, [camRef, setSelfie, setStep, setStreamReady]);

  React.useEffect(() => {
    if (!retakePendingRef.current) return;
    if (step !== 1 || selfie !== null) return;
    retakePendingRef.current = false;
    const id = window.setTimeout(() => {
      void camRef.current?.start().catch(() => {
        toast.error("Could not open camera for retake.");
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [step, selfie, camRef]);

  return retakeSelfie;
}

/** When the user picks another site, discard GPS + selfie so they capture again for the new location. */
export function useResetCaptureWhenSiteChanges(
  siteId: string,
  resetCaptureFlow: () => void
) {
  const prevRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!siteId) {
      prevRef.current = null;
      return;
    }
    if (prevRef.current === null) {
      prevRef.current = siteId;
      return;
    }
    if (prevRef.current !== siteId) {
      prevRef.current = siteId;
      resetCaptureFlow();
    }
  }, [siteId, resetCaptureFlow]);
}
