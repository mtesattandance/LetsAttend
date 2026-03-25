"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { nameToInitials } from "@/lib/profile/initials";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { cn } from "@/lib/utils";

export function DashboardTopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, loading } = useDashboardUser();

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-background/80 px-3 backdrop-blur-md md:px-5">
      <button
        type="button"
        className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-foreground md:hidden"
        aria-label="Open menu"
        onClick={onMenuClick}
      >
        <Menu className="size-5" />
      </button>
      <div className="hidden flex-1 md:block" />
      <div className="flex flex-1 items-center justify-end">
        {loading ? (
          <div className="h-9 w-28 animate-pulse rounded-full bg-white/10" />
        ) : user ? (
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 transition hover:bg-white/10"
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-full",
                "bg-gradient-to-br from-violet-600 to-cyan-500 text-xs font-semibold text-white"
              )}
            >
              {nameToInitials(user.name)}
            </span>
            <span className="max-w-[min(50vw,180px)] truncate text-sm font-medium">
              {user.name}
            </span>
          </Link>
        ) : null}
      </div>
    </header>
  );
}
