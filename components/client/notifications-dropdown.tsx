"use client";

import * as React from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";
import { NotificationsListSkeleton } from "@/components/client/dashboard-skeletons";
import { workCheckInHrefFromAssignedSiteIds } from "@/lib/client/work-assignment-href";

/** Synthesizes a soft bell ding via Web Audio API — no audio file required. */
function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    // Two oscillators: fundamental + harmonic for a bell-like timbre
    const freqs = [880, 1320] as const;
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.2);
    }
    // Auto-close context after sound finishes to free resources
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    // Silently fail if Web Audio API is unavailable
  }
}

type Row = {
  id: string;
  title?: string;
  body?: string;
  kind?: string;
  read?: boolean;
  link?: string;
  createdAt?: unknown;
  assignedSiteIds?: string[];
};

function workHrefFromRow(row: Row): string {
  return workCheckInHrefFromAssignedSiteIds(row.assignedSiteIds ?? []);
}

export function NotificationsDropdown() {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(false);
  const prevUnreadRef = React.useRef<number | null>(null);

  const authHeaders = React.useCallback(async () => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    const token = await u.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const load = React.useCallback(async () => {
    const h = await authHeaders();
    const res = await fetch("/api/notifications", { headers: h });
    const data = (await res.json()) as { items?: Row[]; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Failed to load");
    setItems(data.items ?? []);
  }, [authHeaders]);

  React.useEffect(() => {
    let cancelled = false;
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setItems([]);
        return;
      }
      void (async () => {
        setLoading(true);
        try {
          await load();
        } catch {
          if (!cancelled) setItems([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    });
    // Poll every 10 minutes instead of every 60 seconds — reduces Firestore reads by 10×.
    // Also skip the poll when the browser tab is hidden (user isn't looking).
    const id = window.setInterval(() => {
      if (auth.currentUser && document.visibilityState === "visible") {
        void load().catch(() => {});
      }
    }, 10 * 60_000);
    return () => {
      cancelled = true;
      unsub();
      window.clearInterval(id);
    };
  }, [load]);

  React.useEffect(() => {
    if (open) {
      void load();
    }
  }, [open, load]);

  const unread = items.filter((i) => !i.read).length;

  // Play a ding when new unread notifications arrive (count increases)
  React.useEffect(() => {
    if (prevUnreadRef.current !== null && unread > prevUnreadRef.current) {
      playNotificationSound();
    }
    prevUnreadRef.current = unread;
  }, [unread]);

  const markReadVisible = async () => {
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (!ids.length) return;
    try {
      const h = await authHeaders();
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      await load();
    } catch {
      /* ignore */
    }
  };

  const markReadIds = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const h = await authHeaders();
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      await load();
    } catch {
      /* ignore */
    }
  };

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative shrink-0 rounded-full border border-zinc-200/90 bg-white/90 text-foreground hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-[1.125rem] items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn(
            "z-[100] max-h-[min(70vh,28rem)] w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-zinc-200/90",
            "bg-white/95 p-0 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/95"
          )}
          sideOffset={8}
          align="end"
        >
          <div className="flex items-center justify-between border-b border-zinc-200/80 px-4 py-3 dark:border-white/10">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 ? (
              <button
                type="button"
                className="text-xs font-medium text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300"
                onClick={() => void markReadVisible()}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-[min(60vh,24rem)] overflow-y-auto">
            {loading && items.length === 0 ? (
              <NotificationsListSkeleton rows={5} />
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-200/70 dark:divide-white/5">
                {items.map((row) => (
                  <li
                    key={row.id}
                    className={cn(
                      "px-4 py-3 text-left",
                      !row.read ? "bg-cyan-500/10 dark:bg-cyan-500/5" : "bg-transparent"
                    )}
                  >
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {row.title ?? "Notice"}
                    </p>
                    {row.body ? (
                      <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                        {row.body}
                      </p>
                    ) : null}
                    {row.kind === "assignment" ? (
                      <div className="mt-3">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="w-full"
                          asChild
                        >
                          <Link
                            href={workHrefFromRow(row)}
                            onClick={() => {
                              if (!row.read) void markReadIds([row.id]);
                              setOpen(false);
                            }}
                          >
                            Go to Work
                          </Link>
                        </Button>
                      </div>
                    ) : null}
                    {/* View button for overtime/offsite/system notifications with a link */}
                    {row.kind !== "assignment" && row.link ? (
                      <div className="mt-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          asChild
                        >
                          <Link
                            href={row.link}
                            onClick={() => {
                              if (!row.read) void markReadIds([row.id]);
                              setOpen(false);
                            }}
                          >
                            View <ExternalLink className="size-3" />
                          </Link>
                        </Button>
                      </div>
                    ) : null}
                    {row.kind && row.kind !== "assignment" ? (
                      <p className="mt-2 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-600">
                        {row.kind.replace(/_/g, " ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* View all footer */}
          <div className="border-t border-zinc-200/80 px-4 py-2.5 dark:border-white/10">
            <Link
              href="/dashboard/employee/notifications"
              className="flex items-center justify-center gap-1.5 text-xs font-medium text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300"
              onClick={() => setOpen(false)}
            >
              View all notifications <ExternalLink className="size-3" />
            </Link>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
