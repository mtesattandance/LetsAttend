"use client";

import { signOut } from "firebase/auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  ArrowLeftRight,
  Building2,
  Calendar,
  CalendarClock,
  CircleStop,
  ClipboardList,
  ListChecks,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  MapPin,
  Radio,
  Settings,
  ChevronDown,
  ChevronUp,
  Inbox,
  UserPlus,
  Users,
  X,
  FileDown,
  UserCircle2,
  DollarSign,
  FileWarning,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/client/theme-toggle";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { MtesBrandLockup } from "@/components/client/mtes-brand-lockup";
import { useDashboardUser } from "@/components/client/dashboard-user-context";

type Props = {
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export function DashboardSidebar({ mobileOpen, onCloseMobile }: Props) {
  const pathname = usePathname();
  const { user } = useDashboardUser();
  const [employeeSectionOpen, setEmployeeSectionOpen] = React.useState(false);
  const [adminSectionOpen, setAdminSectionOpen] = React.useState(true);

  /** Keep the section that owns the current route expanded so the active link stays visible. */
  React.useEffect(() => {
    const p = pathname.replace(/\/$/, "") || "/";
    if (p === "/dashboard/employee" || p.startsWith("/dashboard/employee/")) {
      setEmployeeSectionOpen(true);
    }
    if (p === "/dashboard/admin" || p.startsWith("/dashboard/admin/")) {
      setAdminSectionOpen(true);
    }
  }, [pathname]);

  const isAdminLike =
    user?.role === "admin" ||
    user?.role === "super_admin";

  const employeeNav: { href: string; label: string; icon: typeof LayoutDashboard }[] = [
    { href: "/dashboard/employee/check-in", label: "Check in", icon: LogIn },
    { href: "/dashboard/employee/check-out", label: "Check out", icon: CircleStop },
    { href: "/dashboard/employee/switch", label: "Switch", icon: ArrowLeftRight },
    { href: "/dashboard/employee/friend", label: "Friend check-in", icon: UserPlus },
    { href: "/dashboard/employee/requests/manual", label: "Missed Attendance", icon: FileWarning },
    { href: "/dashboard/employee/requests/offsite", label: "Off-site", icon: Building2 },
    { href: "/dashboard/employee/assigned", label: "Assigned", icon: ClipboardList },
    { href: "/dashboard/employee/calendar", label: "Calendar", icon: Calendar },
    {
      href: "/dashboard/employee/working-hours",
      label: "Attendance report",
      icon: CalendarClock,
    },
  ];

  const adminBase = "/dashboard/admin";
  const adminSubLinks = React.useMemo(() => {
    const links: { href: string; label: string; icon: typeof LayoutDashboard }[] = [
      { href: adminBase, label: "Overview", icon: LayoutDashboard },
      { href: `${adminBase}/live`, label: "Live map", icon: Radio },
      { href: `${adminBase}/workers`, label: "Employee list", icon: Users },
      { href: `${adminBase}/assignments`, label: "Assignments", icon: ListChecks },
      { href: `${adminBase}/sites`, label: "Sites", icon: MapPin },
      { href: `${adminBase}/requests`, label: "Requests", icon: Inbox },
      {
        href: `${adminBase}/working-hours`,
        label: "Attendance report",
        icon: CalendarClock,
      },
      {
        href: `${adminBase}/employee`,
        label: "Employee",
        icon: UserCircle2,
      },
      {
        href: `${adminBase}/salary-edit`,
        label: "Salary Edit",
        icon: DollarSign,
      },
      {
        href: `${adminBase}/reports`,
        label: "Reports",
        icon: FileDown,
      },
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

  function employeeLinkActive(href: string): boolean {
    const p = pathname.replace(/\/$/, "") || "/";
    const h = href.replace(/\/$/, "") || "/";
    return p === h || p.startsWith(`${h}/`);
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
          "fixed inset-y-0 left-0 z-[1210] flex w-[min(88vw,280px)] flex-col border-r border-zinc-200/90 bg-white/95 px-3 py-4 shadow-[4px_0_24px_-8px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-transform dark:border-white/10 dark:bg-zinc-950/95 dark:shadow-[4px_0_24px_-4px_rgba(0,0,0,0.5)] md:static md:z-0 md:h-screen md:w-64 md:translate-x-0 md:flex-shrink-0 md:bg-zinc-50/98 md:px-4 md:py-5 md:shadow-none dark:md:bg-black/40",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="mb-6 flex items-start justify-between gap-2 px-2 md:mb-8">
          <MtesBrandLockup variant="sidebar" className="min-w-0 pr-1" showLogo />
          <button
            type="button"
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-200/80 dark:text-zinc-400 dark:hover:bg-white/10 md:hidden"
            aria-label="Close menu"
            onClick={onCloseMobile}
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden">
          <button
            type="button"
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors",
              "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5"
            )}
            aria-expanded={employeeSectionOpen}
            onClick={() => setEmployeeSectionOpen((o) => !o)}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Employee
            </span>
            {employeeSectionOpen ? (
              <ChevronUp className="size-4 shrink-0 text-zinc-500" aria-hidden />
            ) : (
              <ChevronDown className="size-4 shrink-0 text-zinc-500" aria-hidden />
            )}
          </button>
          {employeeSectionOpen
            ? employeeNav.map(({ href, label, icon: Icon }) => {
                const active = employeeLinkActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onCloseMobile}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                      active
                        ? "bg-zinc-200/90 text-zinc-900 shadow-[0_0_20px_-8px_rgba(34,211,238,0.35)] dark:bg-white/10 dark:text-white dark:shadow-[0_0_20px_-8px_rgba(34,211,238,0.5)]"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {label}
                  </Link>
                );
              })
            : null}
          {isAdminLike ? (
            <div className="space-y-1.5 pt-1">
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors",
                  "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5"
                )}
                aria-expanded={adminSectionOpen}
                onClick={() => setAdminSectionOpen((o) => !o)}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Admin
                </span>
                {adminSectionOpen ? (
                  <ChevronUp className="size-4 shrink-0 text-zinc-500" aria-hidden />
                ) : (
                  <ChevronDown className="size-4 shrink-0 text-zinc-500" aria-hidden />
                )}
              </button>
              {adminSectionOpen
                ? adminSubLinks.map(({ href, label, icon: Icon }) => {
                    const active = adminLinkActive(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={onCloseMobile}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 text-xs transition-colors md:text-[13px]",
                          active
                            ? "bg-zinc-200/90 text-zinc-900 shadow-[0_0_16px_-8px_rgba(34,211,238,0.3)] dark:bg-white/10 dark:text-white dark:shadow-[0_0_16px_-8px_rgba(34,211,238,0.45)]"
                            : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
                        )}
                      >
                        <Icon className="size-3.5 shrink-0 opacity-90 md:size-4" />
                        <span className="leading-tight">{label}</span>
                      </Link>
                    );
                  })
                : null}
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
                    ? "bg-zinc-200/90 text-zinc-900 dark:bg-white/10 dark:text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-zinc-200/90 pt-4 dark:border-white/10">
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
