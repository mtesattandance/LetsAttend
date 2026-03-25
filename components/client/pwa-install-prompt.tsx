"use client";

import * as React from "react";
import { Download, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "pwa_install_dismiss_until_ms";
const SESSION_SHOWN_KEY = "pwa_install_card_shown_v1";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPad|iPhone|iPod/i.test(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function dismissExpired(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return true;
    const until = parseInt(raw, 10);
    return Number.isFinite(until) && Date.now() > until;
  } catch {
    return true;
  }
}

export function PwaInstallPrompt() {
  const [open, setOpen] = React.useState(false);
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [installing, setInstalling] = React.useState(false);
  const bipSeenRef = React.useRef(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (!dismissExpired()) return;

    const showCard = () => {
      try {
        if (sessionStorage.getItem(SESSION_SHOWN_KEY)) return;
        sessionStorage.setItem(SESSION_SHOWN_KEY, "1");
      } catch {
        /* private mode — still show once */
      }
      setOpen(true);
    };

    const onBip = (e: Event) => {
      e.preventDefault();
      bipSeenRef.current = true;
      setDeferred(e as BeforeInstallPromptEvent);
      showCard();
    };

    window.addEventListener("beforeinstallprompt", onBip);

    const t = window.setTimeout(() => {
      if (!bipSeenRef.current) showCard();
    }, 2200);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.clearTimeout(t);
    };
  }, []);

  const dismiss = React.useCallback((days: number) => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 86_400_000));
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  const onInstall = async () => {
    if (!deferred) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
      if (outcome === "accepted") dismiss(365);
      else dismiss(7);
    } catch {
      setDeferred(null);
      dismiss(7);
    } finally {
      setInstalling(false);
    }
  };

  if (!open) return null;

  /** Chromium fires `beforeinstallprompt` (Chrome, Edge, Android WebView, etc.). */
  const showNativeInstall = Boolean(deferred);
  const showIosHint = isIos() && !isStandalone();

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-[6000] flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:justify-end"
      )}
      role="dialog"
      aria-labelledby="pwa-install-title"
      aria-modal="false"
    >
      <Card className="pointer-events-auto w-full max-w-md border-cyan-500/20 shadow-[0_0_40px_-8px_rgba(34,211,238,0.35)]">
        <CardHeader className="relative pb-2 pr-10">
          <button
            type="button"
            className="absolute right-2 top-2 rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            aria-label="Dismiss"
            onClick={() => dismiss(7)}
          >
            <X className="size-4" />
          </button>
          <CardTitle id="pwa-install-title" className="pr-8 text-lg">
            Install {APP_NAME}
          </CardTitle>
          <CardDescription>
            Add this app to your home screen for quick access, full-screen experience, and faster
            loading when you return.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-0">
          {showNativeInstall ? (
            <Button
              type="button"
              className="w-full gap-2"
              disabled={installing}
              onClick={() => void onInstall()}
            >
              <Download className="size-4" />
              {installing ? "Installing…" : "Install app"}
            </Button>
          ) : showIosHint ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-zinc-300">
              <p className="mb-2 flex items-center gap-2 font-medium text-zinc-100">
                <Share2 className="size-4 shrink-0 text-cyan-400" />
                Add to Home Screen (iPhone / iPad)
              </p>
              <ol className="list-decimal space-y-1 pl-5 text-zinc-400">
                <li>Tap the Share button in Safari’s toolbar.</li>
                <li>Scroll and tap &quot;Add to Home Screen&quot;.</li>
                <li>Tap &quot;Add&quot; to confirm.</li>
              </ol>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              Use your browser&apos;s menu to install this app (look for &quot;Install app&quot; or
              &quot;Add to Home screen&quot;). On Android with Chrome, an install button may appear
              when the browser is ready.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => dismiss(7)}>
              Not now
            </Button>
            <Button type="button" variant="ghost" className="flex-1 text-zinc-500" onClick={() => dismiss(365)}>
              Don&apos;t ask again
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
