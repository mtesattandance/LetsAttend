"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/client/theme-toggle";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { NotificationsDropdown } from "@/components/client/notifications-dropdown";
import { UserAccountDropdown } from "@/components/client/user-account-dropdown";
import { Button } from "@/components/ui/button";

/** Same pattern as the dashboard top bar: theme, notifications (when signed in), account menu. */
export function LandingTopBar() {
  const { user, loading } = useDashboardUser();

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <ThemeToggle />
      {loading ? (
        <div
          className="h-9 w-36 animate-pulse rounded-full bg-zinc-200/90 dark:bg-white/10"
          aria-hidden
        />
      ) : user ? (
        <>
          <NotificationsDropdown />
          <UserAccountDropdown user={user} />
        </>
      ) : (
        <Button variant="secondary" size="sm" className="shrink-0 font-semibold shadow-sm" asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      )}
    </div>
  );
}
