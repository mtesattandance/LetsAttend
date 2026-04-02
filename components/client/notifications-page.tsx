"use client";

import * as React from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { Bell, CheckCheck, ArrowLeft, ExternalLink } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  title?: string;
  body?: string;
  kind?: string;
  read?: boolean;
  link?: string;
  createdAt?: { seconds?: number } | null;
};

const KIND_META: Record<string, { label: string; color: string }> = {
  assignment:       { label: "Assignment",        color: "text-cyan-400" },
  overtime_request: { label: "Overtime request",  color: "text-amber-400" },
  overtime_approved:{ label: "Overtime approved", color: "text-emerald-400" },
  overtime_rejected:{ label: "Overtime rejected", color: "text-red-400" },
  offsite_request:  { label: "Off-site request",  color: "text-violet-400" },
  offsite_approved: { label: "Off-site approved", color: "text-emerald-400" },
  offsite_rejected: { label: "Off-site rejected", color: "text-red-400" },
  system:           { label: "System",            color: "text-zinc-400" },
};

function fmtTime(row: Row): string {
  const s = row.createdAt?.seconds;
  if (!s) return "";
  return new Date(s * 1000).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function NotificationsPage() {
  const [items, setItems] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [marking, setMarking] = React.useState(false);

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
      if (!u) { setItems([]); setLoading(false); return; }
      setLoading(true);
      void load()
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; unsub(); };
  }, [load]);

  const markAll = async () => {
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (!ids.length) return;
    setMarking(true);
    try {
      const h = await authHeaders();
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      await load();
    } catch { /* ignore */ } finally { setMarking(false); }
  };

  const markOne = async (id: string) => {
    try {
      const h = await authHeaders();
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, read: true } : i));
    } catch { /* ignore */ }
  };

  const unread = items.filter((i) => !i.read).length;

  return (
    <div className="mx-auto max-w-2xl p-3 sm:p-6 md:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link href="/dashboard/employee" aria-label="Back">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <div className="flex flex-1 items-center gap-2">
          <Bell className="size-5 text-cyan-400" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight">Notifications</h1>
          {unread > 0 && (
            <span className="flex min-w-[1.25rem] items-center justify-center rounded-full bg-cyan-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
              {unread}
            </span>
          )}
        </div>
        {unread > 0 && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={marking}
            onClick={() => void markAll()}
            className="gap-1.5"
          >
            <CheckCheck className="size-4" />
            Mark all read
          </Button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-800/50" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Bell className="size-10 text-zinc-600" aria-hidden />
          <p className="text-zinc-400">No notifications yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((row) => {
            const meta = KIND_META[row.kind ?? ""] ?? { label: row.kind ?? "Notice", color: "text-zinc-400" };
            return (
              <li
                key={row.id}
                className={cn(
                  "group relative rounded-xl border px-4 py-3.5 transition-colors",
                  !row.read
                    ? "border-cyan-500/25 bg-cyan-500/[0.06] hover:bg-cyan-500/10"
                    : "border-white/8 bg-white/[0.02] hover:bg-white/5"
                )}
              >
                {/* Unread dot */}
                {!row.read && (
                  <span className="absolute right-3 top-3.5 size-2 rounded-full bg-cyan-500" aria-label="Unread" />
                )}

                <div className="flex flex-col gap-1 pr-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-[10px] font-semibold uppercase tracking-wider", meta.color)}>
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-zinc-500">{fmtTime(row)}</span>
                  </div>
                  <p className="text-sm font-medium text-zinc-100">{row.title ?? "Notice"}</p>
                  {row.body && (
                    <p className="text-xs leading-relaxed text-zinc-400">{row.body}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.link && (
                      <Button asChild size="sm" variant="secondary" className="h-7 gap-1 text-xs"
                        onClick={() => { if (!row.read) void markOne(row.id); }}
                      >
                        <Link href={row.link}>
                          View <ExternalLink className="size-3" />
                        </Link>
                      </Button>
                    )}
                    {!row.read && (
                      <button
                        type="button"
                        className="text-xs text-zinc-500 hover:text-zinc-300"
                        onClick={() => void markOne(row.id)}
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
