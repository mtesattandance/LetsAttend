"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { AdminLoginAccessPanel } from "@/components/client/admin-login-access-panel";
import { AdminOvertimeRequestsPanel } from "@/components/client/admin-overtime-requests-panel";
import { AdminOffsiteRequestsPanel } from "@/components/client/admin-offsite-requests-panel";

const TABS = ["login", "overtime", "offsite"] as const;
type Tab = (typeof TABS)[number];

function normalizeTab(raw: string | null): Tab {
  if (raw === "overtime" || raw === "offsite" || raw === "login") return raw;
  return "login";
}

const TAB_LABEL: Record<Tab, string> = {
  login: "Login access",
  overtime: "Overtime",
  offsite: "Off-site",
};

export function AdminRequestsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = normalizeTab(searchParams.get("tab"));

  const setTab = React.useCallback(
    (next: Tab) => {
      router.replace(`${pathname}?tab=${next}`, { scroll: false });
    },
    [pathname, router]
  );

  return (
    <div className="p-3 md:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Requests</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Login access after onboarding, overtime approvals, and off-site work — all in one place.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Request categories"
        className="mb-6 flex flex-wrap gap-2 border-b border-zinc-200/90 pb-3 dark:border-white/10"
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
              tab === t
                ? "bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200/90 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10"
            )}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "login" ? <AdminLoginAccessPanel /> : null}
        {tab === "overtime" ? <AdminOvertimeRequestsPanel embedded /> : null}
        {tab === "offsite" ? <AdminOffsiteRequestsPanel embedded /> : null}
      </div>
    </div>
  );
}
