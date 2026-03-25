"use client";

import { signOut } from "firebase/auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  Calendar,
  ClipboardList,
  Home,
  LayoutDashboard,
  LogOut,
  MapPin,
  Radio,
  Settings,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/client/theme-toggle";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { APP_NAME } from "@/lib/constants";
import { useDashboardUser } from "@/components/client/dashboard-user-context";

type Props = {
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export function DashboardSidebar({ mobileOpen, onCloseMobile }: Props) {
  const pathname = usePathname();
  const { user } = useDashboardUser();

  const isAdminLike =
    user?.role === "admin" ||
    user?.role === "super_admin";

  const employeeNav: { href: string; label: string; icon: typeof LayoutDashboard }[] = [
    { href: "/dashboard/employee", label: "Work", icon: LayoutDashboard },
    { href: "/dashboard/employee/today", label: "Today", icon: ClipboardList },
    { href: "/dashboard/employee/calendar", label: "Calendar", icon: Calendar },
  ];

  const adminBase = "/dashboard/admin";
  const adminSubLinks = React.useMemo(() => {
    const links: { href: string; label: string; icon: typeof LayoutDashboard }[] = [
      { href: adminBase, label: "Overview", icon: LayoutDashboard },
      { href: `${adminBase}/live`, label: "Live map", icon: Radio },
      { href: `${adminBase}/workers`, label: "Workers", icon: Users },
      { href: `${adminBase}/sites`, label: "Sites", icon: MapPin },
    ];
    if (user?.role === "super_admin") {
      links.push({ href: `${adminBase}/team`, label: "Team", icon: UserPlus });
    }
    return links;
  }, [user?.role]);

  function adminLinkActive(href: string): boolean {
    const p = pathname.replace(/\/$/, "") || "/";
    if (href === adminBase) return p === adminBase;
    return p === href.replace(/\/$/, "") || p.startsWith(`${href.replace(/\/$/, "")}/`);
  }

  const employeeHome = "/dashboard/employee";
  function employeeLinkActive(href: string): boolean {
    const p = pathname.replace(/\/$/, "") || "/";
    if (href === employeeHome) return p === employeeHome;
    return p === href.replace(/\/$/, "") || p.startsWith(`${href.replace(/\/$/, "")}/`);
  }

  const bottomLinks = [
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
    { href: "/", label: "Home", icon: Home },
  ];

  return (
    <>
      {/*
        Must sit above Leaflet (panes/controls use z-index up to 1000). Keep drawer > scrim.
      */}
      <div
        className={cn(
          "fixed inset-0 z-[1200] bg-black/55 backdrop-blur-md transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden={!mobileOpen}
        onClick={onCloseMobile}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[1210] flex w-[min(88vw,280px)] flex-col border-r border-white/10 bg-zinc-950/95 px-3 py-4 shadow-[4px_0_24px_-4px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-transform md:static md:z-0 md:h-screen md:w-64 md:translate-x-0 md:flex-shrink-0 md:bg-black/40 md:px-4 md:py-5 md:shadow-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="mb-6 flex items-center justify-between px-2 md:mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-400/80">
              {APP_NAME}
            </p>
            <p className="text-lg font-semibold text-white">Workspace</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 md:hidden"
            aria-label="Close menu"
            onClick={onCloseMobile}
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden">
          <p className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Employee
          </p>
          {employeeNav.map(({ href, label, icon: Icon }) => {
            const active = employeeLinkActive(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onCloseMobile}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-white/10 text-white shadow-[0_0_20px_-8px_rgba(34,211,238,0.5)]"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            );
          })}
          {isAdminLike ? (
            <div className="space-y-1.5">
              <p className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Admin
              </p>
              {adminSubLinks.map(({ href, label, icon: Icon }) => {
                const active = adminLinkActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onCloseMobile}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 text-xs transition-colors md:text-[13px]",
                      active
                        ? "bg-white/10 text-white shadow-[0_0_16px_-8px_rgba(34,211,238,0.45)]"
                        : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                    )}
                  >
                    <Icon className="size-3.5 shrink-0 opacity-90 md:size-4" />
                    <span className="leading-tight">{label}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}
          {bottomLinks.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={onCloseMobile}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-zinc-500">Theme</span>
            <ThemeToggle />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-start gap-2"
            onClick={() => {
              onCloseMobile();
              void signOut(getFirebaseAuth());
            }}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </aside>
    </>
  );
}
