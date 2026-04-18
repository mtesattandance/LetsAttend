"use client";

import * as React from "react";
import Link from "next/link";
import { signOut } from "firebase/auth";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { nameToInitials } from "@/lib/profile/initials";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";
import type { DashboardUser } from "@/components/client/dashboard-user-context";

const itemClass =
  "flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-800 outline-none hover:bg-zinc-100 data-[highlighted]:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10 dark:data-[highlighted]:bg-white/10";

export function UserAccountDropdown({ user }: { user: DashboardUser }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex max-w-[min(50vw,220px)] items-center gap-2 rounded-full border border-zinc-200/90 bg-white/90 py-1 pl-1 pr-2 transition hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
          )}
          aria-label="Account menu"
        >
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              "bg-gradient-to-br from-violet-600 to-cyan-500 text-xs font-semibold text-white"
            )}
          >
            {nameToInitials(user.name)}
          </span>
          <span className="min-w-0 flex-1 truncate text-left text-sm font-medium hidden md:inline-block">{user.name}</span>
          <span className="min-w-0 flex-1 truncate text-left text-sm font-medium md:hidden">{user.name.split(" ")[0]?.slice(0, 6)}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn(
            "z-[100] min-w-[12rem] overflow-hidden rounded-xl border border-zinc-200/90",
            "bg-white/95 p-1 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/95"
          )}
          sideOffset={8}
          align="end"
        >
          <DropdownMenu.Item asChild>
            <Link href="/dashboard/settings" className={itemClass}>
              <Settings className="size-4 text-zinc-500 dark:text-zinc-400" aria-hidden />
              Settings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-zinc-200/90 dark:bg-white/10" />
          <DropdownMenu.Item
            className={cn(
              itemClass,
              "text-red-600 hover:bg-red-500/10 data-[highlighted]:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/15 dark:data-[highlighted]:bg-red-500/15"
            )}
            onSelect={(e) => {
              e.preventDefault();
              void signOut(getFirebaseAuth());
            }}
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
